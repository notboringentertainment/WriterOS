// Live session channel: HTTP over a per-launch Unix socket, token-checked. Mod → app reports; app → mod composer actions.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { chmodSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";
import type { Hello, InboxAck, InboxAction, Ping, ReportBatch, Stamped } from "../../shared/morganLive";

import type { ComposerUpdate, PermissionAsk, PermissionAnswer, ProposalAsk, ProposalOutcome } from "../../shared/morganLive";
export type { ComposerUpdate } from "../../shared/morganLive";
import { TOKEN_HEADER } from "../../mod/writeros-morgan/hooks/protocol";
import { createConnection } from "node:net";
export type LostReason = "no-hello" | "silence" | "stalled" | "rejected-batch" | "channel-error" | "queue-overflow";
export interface LiveSink {
  hello(h: Hello): void;
  events(epoch: string, evs: Stamped[]): void;
  lost(epoch: string | null, reason: LostReason): void;
  composer(update: ComposerUpdate): void;
  /** A silence/stall loss ended: the same epoch's pings and contiguous reports came back (I3). */
  recovered(epoch: string): void;
}
type Timer = { cancel(): void };
export interface LiveChannelOptions { runDir: string; now: () => number; setTimer: (fn: () => void, ms: number) => Timer; sink: LiveSink; onPermission?: (ask: PermissionAsk) => Promise<PermissionAnswer>; onProposal?: (ask: ProposalAsk) => Promise<ProposalOutcome>; onAbandon?: (kind: "permission" | "proposal", id: string) => void }

const MAX_BODY = 1024 * 1024;
// A gap between 1 s ticks above CLOCK_JUMP_MS means the process was suspended (the Mac slept).
const CLOCK_JUMP_MS = 3000;
const HELLO_MS = 8000, SILENCE_MS = 15000, STALL_MS = 15000, LONGPOLL_MS = 25000, UNCERTAIN_MS = 30000, KEEP_SEQ = 2000;

const RECOVERABLE = new Set<LostReason>(["silence", "stalled"]);

export const checkSocketPath = (p: string): boolean => Buffer.byteLength(p) <= 103;

// queued: the mod has handed the submit to Claude (I1). It waits there until Claude is idle, so it is
// never redelivered and never turns uncertain on the 30 s clock; its final ack settles it.
interface Action { a: InboxAction; text: string; deliveredAt: number | null; queued: boolean }
interface Waiter { res: ServerResponse; resolve: (x: Action | null) => void }

export class LiveChannel {
  private server!: Server;
  private closing: Promise<void> | null = null;
  private polls = new Map<string, { kind: "permission" | "proposal"; id: string; lastPoll: number; answer?: PermissionAnswer | ProposalOutcome; waiters: Set<(answer: unknown) => void> }>();
  private epoch: string | null = null;
  private accepted = -1;
  private stored = new Map<number, string>();
  private enqueuedThrough = -1;
  private lastSeenAt: number;
  private lastAckProgressAt: number;
  private lostEpochs = new Set<string | null>();
  private lostReason = new Map<string | null, LostReason>();
  private lastTickAt: number;
  // Inbox polls for a lost epoch, held for the long-poll so the mod does not re-poll at once (M5).
  private holds: (() => void)[] = [];
  private actions: Action[] = [];
  private waiters: Waiter[] = [];
  private behindSince: number | null = null;
  private helloTimer: Timer;
  private tick: Timer | null = null;

  private constructor(readonly socketPath: string, readonly token: string, private readonly o: LiveChannelOptions) {
    this.lastSeenAt = this.lastAckProgressAt = this.lastTickAt = o.now();
    this.helloTimer = o.setTimer(() => this.lose(null, "no-hello"), HELLO_MS);
    this.scheduleTick();
  }

  static async create(o: LiveChannelOptions): Promise<LiveChannel | { unavailable: "path-too-long" | "listen-failed" }> {
    try {
      mkdirSync(o.runDir, { recursive: true, mode: 0o700 });
      chmodSync(o.runDir, 0o700);
    } catch { return { unavailable: "listen-failed" }; }
    const socketPath = join(o.runDir, `morgan-${randomBytes(4).toString("hex")}.sock`);
    if (!checkSocketPath(socketPath)) return { unavailable: "path-too-long" };
    const ch = new LiveChannel(socketPath, randomBytes(32).toString("hex"), o);
    ch.server = createServer((req, res) => { ch.handle(req, res).catch(() => { if (!res.headersSent) res.writeHead(400); res.end(); }); });
    try {
      await new Promise<void>((resolve, reject) => { ch.server.once("error", reject); ch.server.listen(socketPath, () => resolve()); });
      chmodSync(socketPath, 0o600);
    } catch { ch.helloTimer.cancel(); ch.tick?.cancel(); return { unavailable: "listen-failed" }; }
    return ch;
  }

  submit(text: string): string {
    if (this.epoch === null || this.lostEpochs.has(this.epoch)) throw new Error("live view is not connected");
    if (text.trimStart().startsWith("/")) throw new Error("commands go through Raw view");
    return this.enqueue((id, epoch) => ({ id, epoch, submit: text }), text);
  }

  stop(turnId: string): string {
    return this.enqueue((id, epoch) => ({ id, epoch, stop: { turnId } }), "");
  }

  ptyExited(): void { this.settleAll("session ended"); }

  close(): Promise<void> { return this.closing ??= this.closeChannel(); }

  private async closeChannel(): Promise<void> {
    this.endPolls();
    this.helloTimer.cancel(); this.tick?.cancel();
    for (const w of this.waiters.splice(0)) w.resolve(null);
    for (const h of this.holds.splice(0)) h();
    await new Promise<void>((r) => this.server.close(() => r()));
    rmSync(this.socketPath, { force: true });
  }

  // ---- internals ----
  private enqueue(make: (id: string, epoch: string) => InboxAction, text: string): string {
    const id = randomUUID();
    const action: Action = { a: make(id, this.epoch ?? ""), text, deliveredAt: null, queued: false };
    this.actions.push(action);
    // deliveredAt is stamped by the /inbox handler when the reply is actually written.
    let w = this.waiters.shift();
    while (w && (w.res.destroyed || w.res.writableEnded)) w = this.waiters.shift();
    if (w) w.resolve(action);
    return id;
  }

  private settleAll(reason: string): void {
    for (const x of this.actions.splice(0)) {
      if (!("submit" in x.a)) continue;
      this.o.sink.composer({ id: x.a.id, text: x.text, outcome: x.deliveredAt === null ? "not-sent" : "uncertain", reason });
    }
  }

  private lose(epoch: string | null, reason: LostReason): void {
    if (this.lostEpochs.has(epoch)) {
      // A sticky reason replaces a recoverable one, so the epoch can no longer recover.
      if (!RECOVERABLE.has(reason) && RECOVERABLE.has(this.lostReason.get(epoch)!)) { this.lostReason.set(epoch, reason); this.o.sink.lost(epoch, reason); }
      return;
    }
    this.lostEpochs.add(epoch);
    this.lostReason.set(epoch, reason);
    if (epoch !== null && epoch === this.epoch) {
      for (const x of this.actions) if (x.deliveredAt === null && "submit" in x.a) this.o.sink.composer({ id: x.a.id, text: x.text, outcome: "not-sent", reason: "live view lost" });
      this.actions = this.actions.filter((x) => x.deliveredAt !== null);
      for (const w of this.waiters.splice(0)) w.resolve(null);
    }
    this.o.sink.lost(epoch, reason);
  }

  /** Silence and stalls end when the same epoch speaks again (I3); every other reason is sticky. */
  private recover(progressed: boolean): void {
    const e = this.epoch;
    if (e === null || !this.lostEpochs.has(e)) return;
    const reason = this.lostReason.get(e);
    if (!(reason === "silence" || (reason === "stalled" && progressed))) return;
    this.lostEpochs.delete(e); this.lostReason.delete(e);
    this.lastSeenAt = this.lastAckProgressAt = this.o.now();
    this.behindSince = null; this.updateBehind();
    for (const h of this.holds.splice(0)) h(); // held polls answer {} now so the mod re-polls at once
    this.o.sink.recovered(e);
  }

  private scheduleTick(): void {
    this.tick = this.o.setTimer(() => {
      const now = this.o.now();
      if (now - this.lastTickAt > CLOCK_JUMP_MS) {
        // Suspended (sleep): nothing could be heard while we were stopped, so restart the clocks instead of judging.
        this.lastSeenAt = this.lastAckProgressAt = now;
        if (this.behindSince !== null) this.behindSince = now;
      }
      this.lastTickAt = now;
      if (this.epoch && !this.lostEpochs.has(this.epoch)) {
        if (![...this.polls.values()].some(p => !p.answer) && this.behindSince !== null && now - Math.max(this.lastAckProgressAt, this.behindSince) > STALL_MS) this.lose(this.epoch, "stalled");
        else if (now - this.lastSeenAt > SILENCE_MS) this.lose(this.epoch, "silence");
      }
      for (const [key, poll] of this.polls) {
        if (now - poll.lastPoll >= 60000) {
          this.polls.delete(key);
          if (!poll.answer) this.lastAckProgressAt = now;
          if (!poll.answer) this.o.onAbandon?.(poll.kind, poll.id);
        }
      }
      for (const x of this.actions) {
        if ("submit" in x.a && !x.queued && x.deliveredAt !== null && x.deliveredAt >= 0 && now - x.deliveredAt > UNCERTAIN_MS) {
          this.o.sink.composer({ id: x.a.id, text: x.text, outcome: "uncertain" });
          x.deliveredAt = -1; // marker: reported
        }
      }
      this.actions = this.actions.filter((x) => x.deliveredAt !== -1);
      this.scheduleTick();
    }, 1000);
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const reply = (status: number, body: unknown = {}): void => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    if (req.method !== "POST" || req.headers[TOKEN_HEADER] !== this.token) { console.warn("morgan: live channel rejected an unauthorized request"); return reply(401); }
    const chunks: Buffer[] = [];
    let size = 0, tooBig = false;
    for await (const chunk of req) {
      if (tooBig) continue; // keep draining so the 413 is not a connection reset
      size += (chunk as Buffer).length;
      if (size > MAX_BODY) { tooBig = true; chunks.length = 0; reply(413); continue; }
      chunks.push(chunk as Buffer);
    }
    if (tooBig) return;
    let body: any;
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return reply(400); }
    if (body === null || typeof body !== "object") return reply(400);
    const route = req.url ?? "";
    try {
      if (route === "/hello") {
        if (typeof body.epoch !== "string") return reply(400);
        return reply(200, this.onHello(body as Hello));
      }
      if (body.epoch !== this.epoch && route !== "/inbox-ack") return reply(409);
      this.lastSeenAt = this.o.now();
      switch (route) {
        case "/permission": {
          if (!validPermission(body)) return reply(400);
          return this.poll("permission", body.requestId, body, res, reply);
        }
        case "/proposal": {
          if (["synopsis", "treatment"].includes(body.proposal?.surface)) return reply(200, { outcome: "invalid", message: "This page is now written by Morgan" });
          if (!validProposal(body)) return reply(400);
          return this.poll("proposal", body.proposalId, body, res, reply);
        }
        case "/report": {
          if (!Array.isArray(body.events)) return reply(400);
          const before = this.accepted;
          const r = this.onReport(body as ReportBatch);
          if (!r) return reply(409);
          this.recover(this.accepted > before);
          return reply(200, r);
        }
        case "/ping": {
          if (typeof body.enqueuedThrough !== "number") return reply(400);
          this.enqueuedThrough = Math.max(this.enqueuedThrough, body.enqueuedThrough); this.updateBehind(); this.recover(false); return reply(200);
        }
        case "/inbox": {
          if (this.lostEpochs.has(this.epoch)) { await this.hold(res); if (!res.destroyed) reply(200, {}); return; }
          const x = await this.nextAction(req, res);
          if (!x) return reply(200, {});
          if (res.destroyed) return;
          if (x.deliveredAt === null) x.deliveredAt = this.o.now();
          return reply(200, x.a);
        }
        case "/inbox-ack": {
          if (typeof body.id !== "string" || !["queued", "submitted", "rejected"].includes(body.status)) return reply(400);
          this.onAck(body as InboxAck); return reply(200);
        }
        default: return reply(404);
      }
    } catch { if (!res.headersSent) reply(400); }
  }

  private endPolls(): void {
    for (const p of this.polls.values()) {
      const answer = p.kind === "permission" ? { allow: false, note: "the session ended" } : { outcome: "session-ended" };
      for (const done of p.waiters) done(answer);
      if (!p.answer) this.o.onAbandon?.(p.kind, p.id);
    }
    this.polls.clear();
  }

  private async poll(kind: "permission" | "proposal", id: string, ask: PermissionAsk | ProposalAsk, res: ServerResponse, reply: (status: number, body?: unknown) => void): Promise<void> {
    const key = kind + ":" + id;
    let p = this.polls.get(key);
    if (!p) {
      p = { kind, id, lastPoll: this.o.now(), waiters: new Set() };
      this.polls.set(key, p);
      const current = p;
      const answer = kind === "permission"
        ? this.o.onPermission?.(ask as PermissionAsk) ?? Promise.resolve({ allow: false, note: "approval unavailable" })
        : this.o.onProposal?.(ask as ProposalAsk) ?? Promise.resolve({ outcome: "invalid" as const, message: "proposals unavailable" });
      Promise.resolve(answer).catch(() => kind === "permission" ? { allow: false, note: "approval failed" } : { outcome: "invalid" as const }).then(value => {
        if (this.polls.get(key) !== current) return;
        current.answer = value;
        this.lastAckProgressAt = this.o.now();
        for (const done of [...current.waiters]) done(value);
      });
    }
    p.lastPoll = this.o.now();
    if (p.answer) return reply(200, p.answer);
    const current = p;
    const value = await new Promise<unknown>(resolve => {
      const done = (answer: unknown) => { timer.cancel(); current.waiters.delete(done); res.off("close", disconnected); resolve(answer); };
      const disconnected = () => done(null);
      const timer = this.o.setTimer(() => done({ pending: true }), 20000);
      current.waiters.add(done);
      res.once("close", disconnected);
    });
    if (!res.destroyed) reply(200, value);
  }

  private updateBehind(): void {
    if (this.enqueuedThrough > this.accepted) { if (this.behindSince === null) this.behindSince = this.o.now(); }
    else this.behindSince = null;
  }

  private onHello(h: Hello): object {
    this.helloTimer.cancel();
    for (const w of this.waiters.splice(0)) w.resolve(null);
    for (const h of this.holds.splice(0)) h();
    this.settleAll("session restarted");
    this.endPolls();
    this.epoch = h.epoch;
    this.accepted = -1; this.enqueuedThrough = -1; this.behindSince = null; this.stored.clear();
    this.lastSeenAt = this.lastAckProgressAt = this.o.now();
    this.o.sink.hello(h);
    return {};
  }

  private onReport(b: ReportBatch): { acceptedThrough: number } | null {
    const fresh: Stamped[] = [];
    for (const e of b.events) {
      const json = JSON.stringify(e);
      if (e.seq <= this.accepted) {
        if (this.stored.has(e.seq) && this.stored.get(e.seq) !== json) { this.lose(this.epoch, "rejected-batch"); return null; }
        continue;
      }
      if (e.seq !== this.accepted + 1 + fresh.length) { this.lose(this.epoch, "rejected-batch"); return null; }
      fresh.push(e);
    }
    for (const e of fresh) {
      this.stored.set(e.seq, JSON.stringify(e));
      this.stored.delete(e.seq - KEEP_SEQ);
      if (e.kind === "channel-error" || e.kind === "queue-overflow") this.lose(this.epoch, e.kind);
    }
    if (fresh.length) {
      this.accepted = fresh.at(-1)!.seq;
      this.enqueuedThrough = Math.max(this.enqueuedThrough, this.accepted);
      this.lastAckProgressAt = this.o.now();
      this.o.sink.events(this.epoch!, fresh);
    }
    this.updateBehind();
    return { acceptedThrough: this.accepted };
  }

  private hold(res: ServerResponse): Promise<void> {
    return new Promise((resolve) => {
      const done = (): void => { t.cancel(); this.holds = this.holds.filter((h) => h !== done); resolve(); };
      const t = this.o.setTimer(done, LONGPOLL_MS);
      res.once("close", done);
      this.holds.push(done);
    });
  }

  private nextAction(req: IncomingMessage, res: ServerResponse): Promise<Action | null> {
    // Stops first (I2), then oldest first: an older delivered-but-unacked action is redelivered before a
    // newer undelivered one. A queued submit is with Claude already and is never handed out again.
    const open = (x: Action): boolean => !x.queued && (x.deliveredAt === null || x.deliveredAt >= 0);
    const pending = this.actions.find((x) => "stop" in x.a && open(x)) ?? this.actions.find(open);
    if (pending) return Promise.resolve(pending);
    return new Promise((resolve) => {
      const waiter: Waiter = { res, resolve: (x) => { t.cancel(); resolve(x); } };
      const drop = () => { this.waiters = this.waiters.filter((w) => w !== waiter); };
      const t = this.o.setTimer(() => { drop(); resolve(null); }, LONGPOLL_MS);
      res.once("close", () => { drop(); t.cancel(); resolve(null); });
      this.waiters.push(waiter);
    });
  }

  private onAck(ack: InboxAck): void {
    const i = this.actions.findIndex((x) => x.a.id === ack.id);
    if (i < 0) return;
    if (ack.status === "queued") { this.actions[i]!.queued = true; return; }
    const [x] = this.actions.splice(i, 1);
    if ("submit" in x!.a) this.o.sink.composer({ id: ack.id, text: x!.text, outcome: ack.status === "submitted" ? "sent" : "not-sent", reason: ack.reason });
  }
}

/** Only stale Morgan sockets are removed; a listening socket belongs to a live channel. */
export async function sweepStaleSockets(runDir: string): Promise<void> {
  let names: string[];
  try { names = readdirSync(runDir); } catch { return; }
  await Promise.all(names.filter(n => /^morgan-[0-9a-f]+\.sock$/.test(n)).map(n => new Promise<void>(resolve => {
    const file = join(runDir, n);
    const socket = createConnection(file);
    socket.setTimeout(1000);
    socket.once("connect", () => { socket.destroy(); resolve(); });
    socket.once("timeout", () => { socket.destroy(); resolve(); });
    socket.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ECONNREFUSED" || error.code === "ENOENT" || error.code === "ENOTSOCK") rmSync(file, { force: true });
      resolve();
    });
  })));
}

const nonempty = (x: unknown): x is string => typeof x === "string" && x.length > 0;
function validPermission(b: PermissionAsk): boolean {
  return nonempty(b.epoch) && nonempty(b.requestId) && nonempty(b.tool) && typeof b.summary === "string" && typeof b.input === "string" && Buffer.byteLength(b.input) <= 65536;
}
function validProposal(b: ProposalAsk): boolean {
  const p = b.proposal;
  if (!nonempty(b.epoch) || !nonempty(b.proposalId) || !p || typeof p !== "object" || typeof p.summary !== "string") return false;
  if (p.surface === "script") return !!p.target && typeof p.target === "object" && ["append", "replace-scene", "insert-after-scene"].includes(p.target.kind) && Array.isArray(p.blocks);
  if (!Number.isInteger(p.baseRevision) || p.baseRevision < 0) return false;
  if (p.surface === "page") return ["synopsis", "treatment", "outline", "bible"].includes(p.page) && typeof p.markdown === "string";
  return ["outline", "storyBible"].includes(p.surface) && "content" in p;
}
