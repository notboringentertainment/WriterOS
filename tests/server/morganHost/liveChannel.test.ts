// @vitest-environment node
import { TOKEN_HEADER } from "../../../mod/writeros-morgan/hooks/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { request } from "node:http";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkSocketPath, LiveChannel, sweepStaleSockets, type ComposerUpdate, type LiveSink, type LiveChannelOptions } from "../../../server/morganHost/liveChannel";
import { createServer } from 'node:net';
import { hello as helloFixture } from '../../helpers/morganProtocol';

type Res = { status: number; body: any };
function post(sock: string, route: string, token: string, body: unknown): Promise<Res> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const r = request({ socketPath: sock, path: route, method: "POST", headers: { "content-type": "application/json", [TOKEN_HEADER]: token, "content-length": Buffer.byteLength(data) } }, (res) => {
      let t = ""; res.on("data", (c) => (t += c)); res.on("end", () => resolve({ status: res.statusCode!, body: t ? JSON.parse(t) : null }));
    });
    r.on("error", reject); r.end(data);
  });
}

const channels: LiveChannel[] = [];
let dir: string; let clock = 0; let timers: { at: number; fn: () => void; dead: boolean }[] = [];
const advance = (ms: number) => { clock += ms; for (const t of timers.filter((x) => !x.dead && x.at <= clock)) { t.dead = true; t.fn(); } };
// Advances in 1 s steps, as a running Mac does (a single big jump reads as a sleep).
const run = (ms: number) => { for (let t = 0; t < ms; t += 1000) advance(Math.min(1000, ms - t)); };
const sinkLog = () => { const s = { hellos: [] as any[], events: [] as any[], lost: [] as any[], composer: [] as ComposerUpdate[], recovered: [] as string[] }; const sink: LiveSink = { hello: (h) => s.hellos.push(h), events: (_e, ev) => s.events.push(...ev), lost: (e, r) => s.lost.push(r), composer: (u) => s.composer.push(u), recovered: (e) => s.recovered.push(e) }; return { s, sink }; };
async function open(sink: LiveSink, extra: Partial<LiveChannelOptions> = {}) {
  const ch = await LiveChannel.create({ runDir: dir, now: () => clock, setTimer: (fn, ms) => { const t = { at: clock + ms, fn, dead: false }; timers.push(t); return { cancel: () => (t.dead = true) }; }, sink, ...extra });
  if (!(ch instanceof LiveChannel)) throw new Error("unavailable");
  channels.push(ch);
  return ch;
}
const ev = (seq: number, text = "x") => ({ kind: "delta", turnId: "t", text, seq, at: 0 });

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "sdl-")); clock = 0; timers = []; });
afterEach(async () => { await Promise.all(channels.splice(0).map(ch => ch.close())); rmSync(dir, { recursive: true, force: true }); });

describe("LiveChannel", () => {
  it("rejects a wrong token", async () => {
    const { s, sink } = sinkLog(); const ch = await open(sink);
    const r = await post(ch.socketPath, "/hello", "nope", { epoch: "e1", sessionId: "s", source: "launch", cwd: "/", claudeVersion: "2" });
    expect(r.status).toBe(401); expect(s.hellos).toEqual([]); await ch.close();
  });

  it("re-acknowledges an identical retried batch without applying it twice", async () => {
    const { s, sink } = sinkLog(); const ch = await open(sink);
    await post(ch.socketPath, "/hello", ch.token, { epoch: "e1", sessionId: "s", source: "launch", cwd: "/", claudeVersion: "2" });
    const batch = { epoch: "e1", fromSeq: 0, events: [ev(0), ev(1)] };
    expect((await post(ch.socketPath, "/report", ch.token, batch)).body).toEqual({ acceptedThrough: 1 });
    expect((await post(ch.socketPath, "/report", ch.token, batch)).body).toEqual({ acceptedThrough: 1 });
    expect(s.events.length).toBe(2); expect(s.lost).toEqual([]); await ch.close();
  });

  it("rejects a conflicting overlap and a forward gap", async () => {
    const { s, sink } = sinkLog(); const ch = await open(sink);
    await post(ch.socketPath, "/hello", ch.token, { epoch: "e1", sessionId: "s", source: "launch", cwd: "/", claudeVersion: "2" });
    await post(ch.socketPath, "/report", ch.token, { epoch: "e1", fromSeq: 0, events: [ev(0)] });
    expect((await post(ch.socketPath, "/report", ch.token, { epoch: "e1", fromSeq: 0, events: [ev(0, "different")] })).status).toBe(409);
    expect(s.lost).toEqual(["rejected-batch"]); await ch.close();
  });

  it("reports no-hello after 8 s", async () => {
    const { s, sink } = sinkLog(); const ch = await open(sink);
    advance(8001); expect(s.lost).toEqual(["no-hello"]); await ch.close();
  });

  it("stall is measured from ack progress, not the gap", async () => {
    const { s, sink } = sinkLog(); const ch = await open(sink);
    await post(ch.socketPath, "/hello", ch.token, { epoch: "e1", sessionId: "s", source: "launch", cwd: "/", claudeVersion: "2" });
    for (let i = 0; i < 40; i++) {               // 40 s of healthy streaming: always behind by one, always progressing
      await post(ch.socketPath, "/report", ch.token, { epoch: "e1", fromSeq: i, events: [ev(i)] });
      await post(ch.socketPath, "/ping", ch.token, { epoch: "e1", enqueuedThrough: i + 1 });
      advance(1000);
    }
    expect(s.lost).toEqual([]);
    run(16000)    ;                               // now no progress and no requests
    expect(s.lost).toEqual(["stalled"]); await ch.close();
  });

  it("reports silence (not stalled) when nothing is outstanding and no request arrives for 15 s", async () => {
    const { s, sink } = sinkLog(); const ch = await open(sink);
    await post(ch.socketPath, "/hello", ch.token, { epoch: "e1", sessionId: "s", source: "launch", cwd: "/", claudeVersion: "2" });
    await post(ch.socketPath, "/report", ch.token, { epoch: "e1", fromSeq: 0, events: [ev(0)] });
    await post(ch.socketPath, "/ping", ch.token, { epoch: "e1", enqueuedThrough: 0 });
    run(16000);
    expect(s.lost).toEqual(["silence"]); await ch.close();
  });

  it("inbox delivers actions oldest first and reports outcomes", async () => {
    const { s, sink } = sinkLog(); const ch = await open(sink);
    await post(ch.socketPath, "/hello", ch.token, { epoch: "e1", sessionId: "s", source: "launch", cwd: "/", claudeVersion: "2" });
    const a = ch.submit("first"); const b = ch.submit("second");
    const r1 = await post(ch.socketPath, "/inbox", ch.token, { epoch: "e1" });
    expect(r1.body).toMatchObject({ id: a, submit: "first" });
    await post(ch.socketPath, "/inbox-ack", ch.token, { id: a, status: "submitted" });
    const r2 = await post(ch.socketPath, "/inbox", ch.token, { epoch: "e1" });
    expect(r2.body).toMatchObject({ id: b, submit: "second" });
    await post(ch.socketPath, "/inbox-ack", ch.token, { id: b, status: "rejected", reason: "dropped" });
    expect(s.composer.map((u) => [u.text, u.outcome])).toEqual([["first", "sent"], ["second", "not-sent"]]);
    await ch.close();
  });

  it("a delivered submit unacked for 30 s becomes uncertain", async () => {
    const { s, sink } = sinkLog(); const ch = await open(sink);
    await post(ch.socketPath, "/hello", ch.token, { epoch: "e1", sessionId: "s", source: "launch", cwd: "/", claudeVersion: "2" });
    ch.submit("hello"); await post(ch.socketPath, "/inbox", ch.token, { epoch: "e1" });
    advance(30001);
    expect(s.composer).toEqual([expect.objectContaining({ text: "hello", outcome: "uncertain" })]); await ch.close();
  });

  it("pty exit turns delivered-unacked submits uncertain and undelivered ones not-sent", async () => {
    const { s, sink } = sinkLog(); const ch = await open(sink);
    await post(ch.socketPath, "/hello", ch.token, { epoch: "e1", sessionId: "s", source: "launch", cwd: "/", claudeVersion: "2" });
    ch.submit("delivered"); await post(ch.socketPath, "/inbox", ch.token, { epoch: "e1" }); ch.submit("queued");
    ch.ptyExited();
    expect(s.composer.map((u) => [u.text, u.outcome])).toEqual([["delivered", "uncertain"], ["queued", "not-sent"]]);
    await ch.close();
  });

  it("refuses a composer slash command", async () => {
    const { sink } = sinkLog(); const ch = await open(sink);
    expect(() => ch.submit("/clear")).toThrow(); await ch.close();
  });

  it("checks socket path byte length", () => {
    expect(checkSocketPath("/" + "a".repeat(102))).toBe(true);
    expect(checkSocketPath("/" + "a".repeat(103))).toBe(false);
  });
});

const hello = (ch: LiveChannel, epoch = "e1") => post(ch.socketPath, "/hello", ch.token, { epoch, sessionId: "s", source: "launch", cwd: "/", claudeVersion: "2" });
const settle = () => new Promise((r) => setTimeout(r, 30));
function rawPost(sock: string, route: string, token: string, parts: Buffer[]): Promise<Res> {
  return new Promise((resolve, reject) => {
    const total = parts.reduce((n, b) => n + b.length, 0);
    const r = request({ socketPath: sock, path: route, method: "POST", headers: { "content-type": "application/json", [TOKEN_HEADER]: token, "content-length": total } }, (res) => {
      let t = ""; res.on("data", (c) => (t += c)); res.on("end", () => resolve({ status: res.statusCode!, body: t ? JSON.parse(t) : null }));
    });
    r.on("error", reject);
    (async () => { for (const b of parts) { r.write(b); await settle(); } r.end(); })();
  });
}

describe("LiveChannel review fixes", () => {
  it("releases an old-epoch inbox poll on a new hello and gives the next action to the new epoch", async () => {
    const { sink } = sinkLog(); const ch = await open(sink);
    await hello(ch, "e1");
    const parked = post(ch.socketPath, "/inbox", ch.token, { epoch: "e1" });
    await settle();
    await hello(ch, "e2");
    expect((await parked).body).toEqual({});
    const id = ch.submit("go");
    const r = await post(ch.socketPath, "/inbox", ch.token, { epoch: "e2" });
    expect(r.body).toMatchObject({ id, submit: "go" }); await ch.close();
  });

  it("does not hand an action to a poll whose client disconnected", async () => {
    const { sink } = sinkLog(); const ch = await open(sink);
    await hello(ch);
    await new Promise<void>((resolve) => {
      const r = request({ socketPath: ch.socketPath, path: "/inbox", method: "POST", headers: { [TOKEN_HEADER]: ch.token, "content-type": "application/json" } });
      r.on("error", () => resolve()); r.end(JSON.stringify({ epoch: "e1" }));
      setTimeout(() => { r.destroy(); resolve(); }, 30);
    });
    await settle();
    const id = ch.submit("later");
    const r = await post(ch.socketPath, "/inbox", ch.token, { epoch: "e1" });
    expect(r.body).toMatchObject({ id, submit: "later" });
    await post(ch.socketPath, "/inbox-ack", ch.token, { id, status: "submitted" }); await ch.close();
  });

  it("decodes multi-byte text split across chunks", async () => {
    const { s, sink } = sinkLog(); const ch = await open(sink);
    await hello(ch);
    const bytes = Buffer.from(JSON.stringify({ epoch: "e1", fromSeq: 0, events: [ev(0, "héllo wörld \u{1F600} 日本語")] }));
    const cut = bytes.indexOf(Buffer.from("日")) + 1; // inside a 3-byte character
    const r = await rawPost(ch.socketPath, "/report", ch.token, [bytes.subarray(0, cut), bytes.subarray(cut)]);
    expect(r.body).toEqual({ acceptedThrough: 0 });
    expect(s.events[0].text).toBe("héllo wörld \u{1F600} 日本語"); expect(s.lost).toEqual([]); await ch.close();
  });

  it("answers 413 to a body over 1 MB", async () => {
    const { sink } = sinkLog(); const ch = await open(sink);
    const r = await post(ch.socketPath, "/report", ch.token, { epoch: "e1", fromSeq: 0, events: [ev(0, "x".repeat(1024 * 1024 + 10))] });
    expect(r.status).toBe(413); await ch.close();
  });

  it("does not call a stall right after an idle period", async () => {
    const { s, sink } = sinkLog(); const ch = await open(sink);
    await hello(ch);
    await post(ch.socketPath, "/report", ch.token, { epoch: "e1", fromSeq: 0, events: [ev(0)] });
    for (let i = 0; i < 60; i++) { await post(ch.socketPath, "/ping", ch.token, { epoch: "e1", enqueuedThrough: 0 }); advance(1000); }
    await post(ch.socketPath, "/ping", ch.token, { epoch: "e1", enqueuedThrough: 1 });
    advance(1000);
    expect(s.lost).toEqual([]);
    for (let i = 0; i < 16; i++) { await post(ch.socketPath, "/ping", ch.token, { epoch: "e1", enqueuedThrough: 1 }); advance(1000); }
    expect(s.lost).toEqual(["stalled"]); await ch.close();
  });

  it("settles undelivered submits not-sent when the epoch is lost, and refuses further submits", async () => {
    const { s, sink } = sinkLog(); const ch = await open(sink);
    await hello(ch);
    ch.submit("delivered"); await post(ch.socketPath, "/inbox", ch.token, { epoch: "e1" }); ch.submit("queued");
    await post(ch.socketPath, "/report", ch.token, { epoch: "e1", fromSeq: 5, events: [ev(5)] }); // gap -> rejected-batch
    expect(s.lost).toEqual(["rejected-batch"]);
    expect(s.composer).toEqual([expect.objectContaining({ text: "queued", outcome: "not-sent", reason: "live view lost" })]);
    expect(() => ch.submit("more")).toThrow();
    const held = post(ch.socketPath, "/inbox", ch.token, { epoch: "e1" });
    await settle(); run(31000);
    expect((await held).body).toEqual({});
    expect(s.composer.map((u) => [u.text, u.outcome])).toEqual([["queued", "not-sent"], ["delivered", "uncertain"]]);
    await ch.close();
  });

  it("refuses submit before any hello", async () => {
    const { sink } = sinkLog(); const ch = await open(sink);
    expect(() => ch.submit("early")).toThrow(); await ch.close();
  });

  it("answers 400 to a malformed shape instead of hanging", async () => {
    const { sink } = sinkLog(); const ch = await open(sink);
    expect((await post(ch.socketPath, "/hello", ch.token, null)).status).toBe(400);
    await hello(ch);
    expect((await post(ch.socketPath, "/report", ch.token, { epoch: "e1", fromSeq: 0 })).status).toBe(400);
    expect((await post(ch.socketPath, "/report", ch.token, { epoch: "e1", fromSeq: 0, events: [null] })).status).toBe(400);
    expect((await post(ch.socketPath, "/ping", ch.token, { epoch: "e1" })).status).toBe(400);
    await ch.close();
  });
});

describe("LiveChannel final-review fixes", () => {
  it("a submit acked queued and held open past 30 s ends sent, never uncertain, and is never redelivered (I1)", async () => {
    const { s, sink } = sinkLog(); const ch = await open(sink);
    await hello(ch);
    const id = ch.submit("thanks");
    expect((await post(ch.socketPath, "/inbox", ch.token, { epoch: "e1" })).body).toMatchObject({ id, submit: "thanks" });
    expect((await post(ch.socketPath, "/inbox-ack", ch.token, { id, status: "queued" })).status).toBe(200);
    for (let i = 0; i < 60; i++) { await post(ch.socketPath, "/ping", ch.token, { epoch: "e1", enqueuedThrough: -1 }); advance(1000); }
    expect(s.composer).toEqual([]);
    // The next poll does not get the queued action again: it parks until the long-poll ends.
    const parked = post(ch.socketPath, "/inbox", ch.token, { epoch: "e1" });
    await settle(); advance(25001);
    expect((await parked).body).toEqual({});
    await post(ch.socketPath, "/inbox-ack", ch.token, { id, status: "submitted" });
    expect(s.composer.map((u) => [u.text, u.outcome])).toEqual([["thanks", "sent"]]);
    await ch.close();
  });

  it("a queued submit still unacked at pty exit is uncertain", async () => {
    const { s, sink } = sinkLog(); const ch = await open(sink);
    await hello(ch);
    const id = ch.submit("held"); await post(ch.socketPath, "/inbox", ch.token, { epoch: "e1" });
    await post(ch.socketPath, "/inbox-ack", ch.token, { id, status: "queued" });
    ch.ptyExited();
    expect(s.composer.map((u) => [u.text, u.outcome])).toEqual([["held", "uncertain"]]);
    await ch.close();
  });

  it("a Stop is delivered ahead of an older undelivered submit (I2)", async () => {
    const { sink } = sinkLog(); const ch = await open(sink);
    await hello(ch);
    ch.submit("later"); const stop = ch.stop("t1");
    expect((await post(ch.socketPath, "/inbox", ch.token, { epoch: "e1" })).body).toMatchObject({ id: stop, stop: { turnId: "t1" } });
    await ch.close();
  });

  it("a Stop is delivered while an earlier submit is queued (I2)", async () => {
    const { sink } = sinkLog(); const ch = await open(sink);
    await hello(ch);
    const a = ch.submit("held"); await post(ch.socketPath, "/inbox", ch.token, { epoch: "e1" });
    await post(ch.socketPath, "/inbox-ack", ch.token, { id: a, status: "queued" });
    const stop = ch.stop("t1");
    expect((await post(ch.socketPath, "/inbox", ch.token, { epoch: "e1" })).body).toMatchObject({ id: stop, stop: { turnId: "t1" } });
    await ch.close();
  });
});

describe("LiveChannel survives sleep (I3)", () => {
  it("a 10-minute gap between ticks (the Mac slept) is not judged as silence or a stall", async () => {
    const { s, sink } = sinkLog(); const ch = await open(sink);
    await hello(ch);
    await post(ch.socketPath, "/report", ch.token, { epoch: "e1", fromSeq: 0, events: [ev(0)] });
    await post(ch.socketPath, "/ping", ch.token, { epoch: "e1", enqueuedThrough: 1 }); // behind by one
    advance(600000);
    expect(s.lost).toEqual([]);
    await post(ch.socketPath, "/report", ch.token, { epoch: "e1", fromSeq: 1, events: [ev(1)] });
    advance(1000);
    expect(s.lost).toEqual([]); await ch.close();
  });

  it("silence recovers when the same epoch's pings resume", async () => {
    const { s, sink } = sinkLog(); const ch = await open(sink);
    await hello(ch);
    await post(ch.socketPath, "/report", ch.token, { epoch: "e1", fromSeq: 0, events: [ev(0)] });
    for (let i = 0; i < 16; i++) advance(1000);
    expect(s.lost).toEqual(["silence"]);
    expect(() => ch.submit("x")).toThrow();
    await post(ch.socketPath, "/ping", ch.token, { epoch: "e1", enqueuedThrough: 0 });
    expect(s.recovered).toEqual(["e1"]);
    const id = ch.submit("back");
    expect((await post(ch.socketPath, "/inbox", ch.token, { epoch: "e1" })).body).toMatchObject({ id, submit: "back" });
    advance(1000); expect(s.lost).toEqual(["silence"]); await ch.close();
  });

  it("recovery releases a held inbox poll at once", async () => {
    const { s, sink } = sinkLog(); const ch = await open(sink);
    await hello(ch);
    await post(ch.socketPath, "/report", ch.token, { epoch: "e1", fromSeq: 0, events: [ev(0)] });
    for (let i = 0; i < 16; i++) advance(1000);
    expect(s.lost).toEqual(["silence"]);
    let done = false;
    const r = post(ch.socketPath, "/inbox", ch.token, { epoch: "e1" }).then((x) => { done = true; return x; });
    await settle(); expect(done).toBe(false);
    await post(ch.socketPath, "/ping", ch.token, { epoch: "e1", enqueuedThrough: 0 });
    expect(s.recovered).toEqual(["e1"]);
    expect((await r).body).toEqual({}); await ch.close();
  });

  it("a stall recovers when contiguous reports make progress again", async () => {
    const { s, sink } = sinkLog(); const ch = await open(sink);
    await hello(ch);
    await post(ch.socketPath, "/report", ch.token, { epoch: "e1", fromSeq: 0, events: [ev(0)] });
    for (let i = 0; i < 17; i++) { await post(ch.socketPath, "/ping", ch.token, { epoch: "e1", enqueuedThrough: 1 }); advance(1000); }
    expect(s.lost).toEqual(["stalled"]);
    await post(ch.socketPath, "/ping", ch.token, { epoch: "e1", enqueuedThrough: 1 });
    expect(s.recovered).toEqual([]);                       // a ping alone does not end a stall
    await post(ch.socketPath, "/report", ch.token, { epoch: "e1", fromSeq: 1, events: [ev(1)] });
    expect(s.recovered).toEqual(["e1"]); await ch.close();
  });

  it("a rejected batch stays lost even if pings continue", async () => {
    const { s, sink } = sinkLog(); const ch = await open(sink);
    await hello(ch);
    await post(ch.socketPath, "/report", ch.token, { epoch: "e1", fromSeq: 5, events: [ev(5)] });
    await post(ch.socketPath, "/ping", ch.token, { epoch: "e1", enqueuedThrough: 5 });
    expect(s.lost).toEqual(["rejected-batch"]); expect(s.recovered).toEqual([]); await ch.close();
  });

  it("a sticky reason after silence keeps the epoch lost", async () => {
    const { s, sink } = sinkLog(); const ch = await open(sink);
    await hello(ch);
    await post(ch.socketPath, "/report", ch.token, { epoch: "e1", fromSeq: 0, events: [ev(0)] });
    run(16000);
    await post(ch.socketPath, "/report", ch.token, { epoch: "e1", fromSeq: 1, events: [ev(1, "a"), { kind: "channel-error", message: "x", seq: 2, at: 0 }] });
    await post(ch.socketPath, "/ping", ch.token, { epoch: "e1", enqueuedThrough: 2 });
    expect(() => ch.submit("x")).toThrow();
    expect(s.recovered.length).toBeLessThanOrEqual(1); expect(s.lost.at(-1)).toBe("channel-error"); await ch.close();
  });

  it("a lost epoch's inbox poll is held for the long-poll, not answered at once (M5)", async () => {
    const { sink } = sinkLog(); const ch = await open(sink);
    await hello(ch);
    await post(ch.socketPath, "/report", ch.token, { epoch: "e1", fromSeq: 5, events: [ev(5)] });
    let done = false;
    const r = post(ch.socketPath, "/inbox", ch.token, { epoch: "e1" }).then((x) => { done = true; return x; });
    await settle(); expect(done).toBe(false);
    advance(25001);
    expect((await r).body).toEqual({}); await ch.close();
  });
});

describe("LiveChannel final-review minors", () => {
  it('leaves a listening Morgan socket alone', async () => {
    const socketPath = join(dir, 'morgan-123abc.sock');
    const server = createServer();
    await new Promise<void>(r => server.listen(socketPath, r));
    try { await sweepStaleSockets(dir); expect(existsSync(socketPath)).toBe(true); }
    finally { await new Promise<void>(r => server.close(() => r())); }
  });
  it("create answers listen-failed when the run dir cannot be made (M9)", async () => {
    const { sink } = sinkLog();
    writeFileSync(join(dir, "file"), "x");
    const r = await LiveChannel.create({ runDir: join(dir, "file", "run"), now: () => clock, setTimer: () => ({ cancel: () => {} }), sink });
    expect(r).toEqual({ unavailable: "listen-failed" });
  });

  it("sweeps only stale morgan-*.sock files in the run dir (M11)", async () => {
    for (const f of ["morgan-1a2b3c4d.sock", "morgan-ffffffff.sock", "other.sock", "morgan-notes.txt"]) writeFileSync(join(dir, f), "");
    await sweepStaleSockets(dir);
    expect(["morgan-1a2b3c4d.sock", "morgan-ffffffff.sock", "other.sock", "morgan-notes.txt"].map((f) => existsSync(join(dir, f)))).toEqual([false, false, true, true]);
    await expect(sweepStaleSockets(join(dir, "missing"))).resolves.toBeUndefined();
  });
});

describe('approval and proposal polling', () => {
  it('delivers page proposals including a 30 KB treatment to onProposal and returns its outcome', async () => {
    const received: unknown[] = [];
    const { sink } = sinkLog();
    const ch = await open(sink, { onProposal: async ask => { received.push(ask); return { outcome: 'kept' }; } });
    await hello(ch);
    for (const page of ['synopsis', 'treatment', 'outline']) {
      const markdown = page === 'treatment' ? '# Treatment\n\n' + 'A courier crosses the city.\n\n'.repeat(1200) : '# Sample page\n\nA courier crosses the city.';
      if (page === 'treatment') expect(Buffer.byteLength(markdown)).toBeGreaterThan(30 * 1024);
      const ask = { epoch: 'e1', proposalId: page, proposal: { surface: 'page', page, baseRevision: 0, markdown, summary: 'Write the page' } };
      expect(await post(ch.socketPath, '/proposal', ch.token, ask)).toEqual({ status: 200, body: { outcome: 'kept' } });
      expect(received.at(-1)).toEqual(ask);
    }
    expect(received).toHaveLength(3);
  });

  it('refuses retired structured synopsis and treatment proposals with the plain message', async () => {
    const received: unknown[] = [];
    const { sink } = sinkLog();
    const ch = await open(sink, { onProposal: async ask => { received.push(ask); return { outcome: 'kept' }; } });
    await hello(ch);
    for (const surface of ['synopsis', 'treatment']) {
      const result = await post(ch.socketPath, '/proposal', ch.token, { epoch: 'e1', proposalId: surface,
        proposal: { surface, baseRevision: 0, content: {}, summary: 'Old structured proposal' } });
      expect(result).toEqual({ status: 200, body: { outcome: 'invalid', message: 'This page is now written by Morgan' } });
    }
    expect(received).toHaveLength(0);
  });

  it('a cached answer does not suppress future report stalls', async () => {
    const { s, sink } = sinkLog(); const ch = await open(sink, { onPermission: async () => ({ allow: true }) }); await hello(ch);
    await post(ch.socketPath, '/permission', ch.token, { epoch: 'e1', requestId: 'r1', tool: 'Edit', summary: 'Edit file', input: '{}' });
    for (let i = 0; i < 17; i++) { await post(ch.socketPath, '/ping', ch.token, { epoch: 'e1', enqueuedThrough: 1 }); run(1000); }
    expect(s.lost).toEqual(['stalled']);
  });
  const permission = { epoch: 'e1', requestId: 'r1', tool: 'Edit', summary: 'Update file', input: '{}' };
  const proposal = { epoch: 'e1', proposalId: 'p1', proposal: { surface: 'script', target: { kind: 'append' }, blocks: [{ type: 'action', text: 'Rain.' }], summary: 'Add rain' } };

  for (const kind of ['permission', 'proposal'] as const) {
    it(kind + ': validates token, epoch and body', async () => {
      const { sink } = sinkLog(); const ch = await open(sink); await hello(ch);
      const ask = kind === 'permission' ? permission : proposal;
      expect((await post(ch.socketPath, '/' + kind, 'wrong', ask)).status).toBe(401);
      expect((await post(ch.socketPath, '/' + kind, ch.token, { ...ask, epoch: 'old' })).status).toBe(409);
      expect((await post(ch.socketPath, '/' + kind, ch.token, { epoch: 'e1' })).status).toBe(400);
    });
    it(kind + ': creates once, holds 20 seconds, reattaches, and caches the answer', async () => {
      let resolve!: (a: any) => void; let calls = 0;
      const handler = () => { calls++; return new Promise<any>(r => { resolve = r; }); };
      const { sink } = sinkLog(); const ch = await open(sink, { onPermission: handler, onProposal: handler }); await hello(ch);
      const ask = kind === 'permission' ? permission : proposal;
      const first = post(ch.socketPath, '/' + kind, ch.token, ask);
      await settle(); run(20000);
      expect((await first).body).toEqual({ pending: true });
      const second = post(ch.socketPath, '/' + kind, ch.token, ask);
      const parallel = post(ch.socketPath, '/' + kind, ch.token, ask);
      await settle(); expect(calls).toBe(1);
      const answer = kind === 'permission' ? { allow: true } : { outcome: 'kept' };
      resolve(answer);
      expect((await second).body).toEqual(answer);
      expect((await parallel).body).toEqual(answer);
      expect((await post(ch.socketPath, '/' + kind, ch.token, ask)).body).toEqual(answer);
    });
    it(kind + ': abandons only after 60 seconds without a poll, including disconnected polls', async () => {
      const abandoned: unknown[] = [];
      const { sink } = sinkLog();
      const ch = await open(sink, { onPermission: () => new Promise(() => {}), onProposal: () => new Promise(() => {}), onAbandon: (k, id) => abandoned.push([k, id]) }); await hello(ch);
      const req = request({ socketPath: ch.socketPath, path: '/' + kind, method: 'POST', headers: { [TOKEN_HEADER]: ch.token } });
      req.on('error', () => {}); req.end(JSON.stringify(kind === 'permission' ? permission : proposal));
      await settle(); req.destroy(); await settle();
      run(59000); expect(abandoned).toEqual([]);
      run(1000); expect(abandoned).toEqual([[kind, kind === 'permission' ? 'r1' : 'p1']]);
    });
    it(kind + ': close settles a held poll before closing the socket', async () => {
      const { sink } = sinkLog(); const ch = await open(sink, { onPermission: () => new Promise(() => {}), onProposal: () => new Promise(() => {}) }); await hello(ch);
      const held = post(ch.socketPath, '/' + kind, ch.token, kind === 'permission' ? permission : proposal);
      await settle(); await ch.close();
      expect((await held).body).toEqual(kind === 'permission' ? { allow: false, note: 'the session ended' } : { outcome: 'session-ended' });
    });
  }
  it('keeps pinging and polling for over 30 seconds without a stall or duplicate card', async () => {
    const { s, sink } = sinkLog(); let calls = 0;
    const ch = await open(sink, { onPermission: () => { calls++; return new Promise(() => {}); } });
    await post(ch.socketPath, '/hello', ch.token, helloFixture());
    const first = post(ch.socketPath, '/permission', ch.token, permission);
    await settle();
    for (let i = 0; i < 20; i++) { await post(ch.socketPath, '/ping', ch.token, { epoch: 'e1', enqueuedThrough: 1 }); run(1000); }
    expect((await first).body).toEqual({ pending: true });
    const second = post(ch.socketPath, '/permission', ch.token, permission); await settle();
    for (let i = 0; i < 20; i++) { await post(ch.socketPath, '/ping', ch.token, { epoch: 'e1', enqueuedThrough: 1 }); run(1000); }
    expect((await second).body).toEqual({ pending: true });
    expect(s.lost).toEqual([]); expect(calls).toBe(1);
  });
});
