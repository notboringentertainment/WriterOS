import { describe, expect, it } from 'vitest'
import { initialModel, reduce, type LiveModel } from '../../../client/src/lib/morganLive/model'
import { hello as buildHello, row, waiting } from '../../helpers/morganProtocol'
import type { MorganScreenEvent } from '../../../shared/morganLive'
const hello = (over: object = {}) => ({ type: 'hello' as const, hello: buildHello(over) })
const evs = (...events: object[]) => ({ type: 'events' as const, epoch: 'e1', events: events.map((e, i) => ({ ...e, seq: i, at: 0 })) as any })
const asst = (text: string) => row(0, text)
const user = (text: string, origin: object, isMeta?: boolean) => ({ kind: 'row', uuid: 'v'+text.length, door: 'prompt', type: 'user', role: 'user', origin, isMeta, blocks: [{ type: 'text', text }] })
const run = (...msgs: MorganScreenEvent[]): LiveModel => msgs.reduce((m, x) => reduce(m, x), initialModel())
describe('Morgan live model', () => {
  it('clears the could-not-connect notice and stuck state on a late hello', () => {
    const lost = run({ type: 'lost', epoch: null, reason: 'no-hello' })
    expect(lost.notice).toBe('Morgan could not connect.')
    const connected = reduce({ ...lost, stuck: { reason: 'silence' } }, hello())
    expect(connected.notice).toBeNull()
    expect(connected.stuck).toBeNull()
  })
  it('preserves a resume notice on hello', () => {
    const resumed = run({ type: 'resumed', ok: true }, hello())
    expect(resumed.notice).toBe('Picked up where you left off.')
  })
  it("composer rows are You; injected rows are hidden", () => {
    const m = run(hello(), evs(
      user("typed", { kind: "composer" }),
      user("sent from screen", { kind: "plugin", name: "writeros-morgan", asUser: true }),
      user("reminder", { kind: "plugin", name: "other" }),
      user("meta", { kind: "composer" }, true),
    ));
    expect(m.feed.filter((f) => f.kind === "you").map((f: any) => f.text)).toEqual(["typed", "sent from screen"]);
  });
  it("live writing is provisional and cleared by the committed row", () => {
    let m = run(hello(), evs({ kind: "turn", phase: "start", turnId: "t" }, { kind: "delta", turnId: "t", text: "Half a" }));
    expect(m.provisional).toBe("Half a");
    m = reduce(m, { type: "events", epoch: "e1", events: [{ ...asst("Half a sentence."), seq: 2, at: 0 } as any] });
    expect(m.provisional).toBe("");
    expect(m.feed.at(-1)).toMatchObject({ kind: "prose", markdown: "Half a sentence." });
  });
  it("an aborted turn marks interrupted and clears provisional", () => {
    const m = run(hello(), evs({ kind: "turn", phase: "start", turnId: "t" }, { kind: "delta", turnId: "t", text: "x" }, { kind: "turn", phase: "complete", turnId: "t", isAborted: true }));
    expect(m.provisional).toBe(""); expect(m.feed.at(-1)!.kind).toBe("interrupted"); expect(m.working).toBeNull();
  });
  it("helper turns never change working state", () => {
    const m = run(hello(), evs({ kind: "turn", phase: "start", turnId: "t" }, { kind: "turn", phase: "complete", turnId: "h", agentId: "a1" }));
    expect(m.working).toEqual({ turnId: "t" });
  });
  it("tool calls fold into one group with a plain label", () => {
    const m = run(hello(), evs(
      { kind: "tool", toolUseId: "1", tool: "Read", phase: "start", summary: "wayfinder/MAP.md" },
      { kind: "tool", toolUseId: "1", tool: "Read", phase: "end", summary: "wayfinder/MAP.md" },
      { kind: "tool", toolUseId: "2", tool: "Read", phase: "start", summary: "wayfinder/tickets/a.md" },
      { kind: "tool", toolUseId: "3", tool: "Edit", phase: "start", summary: "wayfinder/tickets/a.md" },
    ));
    expect(m.feed).toHaveLength(1);
    expect(m.feed[0]).toMatchObject({ kind: "tools", label: "Read 2 files · Updated 1 file", open: false });
  });
  it("events from an old epoch are ignored", () => {
    const m = reduce(run(hello()), { type: "events", epoch: "old", events: [{ ...asst("stale"), seq: 0, at: 0 } as any] });
    expect(m.feed).toEqual([]);
  });
  it("composer outcomes are retained so the renderer can restore text", () => {
    const h = run(hello());
    expect(reduce(h, { type: "composer", update: { id: "2", text: "b", outcome: "uncertain" } }).composer).toEqual({ id: "2", text: "b", outcome: "uncertain" });
  });
  it("helper tool calls fold into one row per helper and never into the main group", () => {
    const m = run(hello(), evs(
      { kind: "tool", toolUseId: "1", tool: "Read", phase: "start", summary: "a.md" },
      { kind: "tool", toolUseId: "2", tool: "Read", agentId: "h1", phase: "start", summary: "b.md" },
      { kind: "tool", toolUseId: "3", tool: "Grep", agentId: "h1", phase: "start", summary: "ferry" },
      { kind: "tool", toolUseId: "4", tool: "Bash", phase: "start", summary: "ls" },
    ));
    expect(m.feed.map((f: any) => [f.kind, f.label, f.helper ?? false])).toEqual([
      ["tools", "Read 1 file", false], ["tools", "Morgan used a helper", true], ["tools", "Used Bash", false],
    ]);
    expect((m.feed[1] as any).files).toEqual(["b.md", "ferry"]);
  });
  it("history folds ordinary tool uses and is rebuilt by a new epoch", () => {
    const m = run(hello({ history: [
      { role: "assistant", text: "Reading the map.", toolUses: [{ tool_use_id: "r1", tool: "Read", input: { file_path: "/p/wayfinder/MAP.md" } }, { tool_use_id: "r2", tool: "Edit", input: { file_path: "/p/wayfinder/tickets/a.md" } }] },
    ] }));
    expect(m.feed.map((f: any) => [f.kind, f.label])).toEqual([["prose", undefined], ["tools", "Read 1 file · Updated 1 file"]]);
    expect((m.feed[1] as any).files).toEqual(["wayfinder/MAP.md", "wayfinder/tickets/a.md"]);
    const next = reduce(m, { type: "hello", hello: { epoch: "e2", sessionId: "s2", source: "clear", cwd: "/w", claudeVersion: "2", history: [] } });
    expect([next.epoch, next.feed]).toEqual(["e2", []]);
  });
  it('holds all non-permission waits until their matching input-done', () => {
    let m = run(hello(), evs(waiting(0, 'q', 'question', 'Question'), waiting(1, 'e', 'elicitation', 'Form'), waiting(2, 'p', 'permission', 'Permission')))
    expect(m.stuck).toEqual({ reason: 'waiting', detail: 'Form' })
    m = reduce(m, evs({ kind: 'input-done', requestId: 'unknown' }))
    expect(m.openWaits.size).toBe(2)
    m = reduce(m, evs({ kind: 'input-done', requestId: 'e' }))
    expect(m.stuck?.detail).toBe('Question')
    m = reduce(m, evs({ kind: 'input-done', requestId: 'q' }))
    expect(m.stuck).toBeNull()
  })
  it('ignores stale loss and recovery, restores an outstanding wait on recovery', () => {
    const base = run(hello(), evs(waiting(0, 'q', 'question', 'Question')))
    expect(reduce(base, { type: 'lost', epoch: 'old', reason: 'silence' })).toBe(base)
    const lost = reduce(base, { type: 'lost', epoch: 'e1', reason: 'silence' })
    expect(lost.stuck?.reason).toBe('silence')
    expect(reduce(lost, { type: 'recovered', epoch: 'old' })).toBe(lost)
    expect(reduce(lost, { type: 'recovered', epoch: 'e1' }).stuck?.detail).toBe('Question')
    expect(run({ type: 'lost', epoch: null, reason: 'no-hello' }).stuck).toBeNull()
  })
  it('records cards, proposals, truncation and resume notices', () => {
    const card = { requestId: 'r', tool: 'Edit', summary: 'Edit file', input: '{}' }
    const proposal = { surface: 'script' as const, summary: 'Rain', target: { kind: 'append' as const }, blocks: [] }
    let m = run(hello(), { type: 'approval', card }, { type: 'approval', card }, { type: 'proposal', proposalId: 'p', proposal }, { type: 'truncated' }, { type: 'resumed', ok: true })
    expect(m.cards).toEqual([card]); expect(m.proposals).toEqual([{ proposalId: 'p', proposal }]); expect(m.earlierHidden).toBe(true)
    expect(m.notice).toBe('Picked up where you left off.')
    m = reduce(m, { type: 'resumed', ok: false, message: 'Could not resume.' }); expect(m.notice).toBe('Could not resume.')
    m = reduce(m, { type: 'approval-answered', requestId: 'r', allow: false })
    m = reduce(m, { type: 'proposal-answered', proposalId: 'p', outcome: 'dismissed' })
    expect(m.cards).toEqual([]); expect(m.proposals).toEqual([])
  })
  it('keeps the ended reason and message and clears live writing', () => {
    const m = run(hello(), evs({ kind: 'turn', phase: 'start', turnId: 't' }, { kind: 'delta', turnId: 't', text: 'Half' }), { type: 'ended', reason: 'start-failed', code: null, message: 'Run claude.' })
    expect(m.ended).toBe(true); expect(m.endReason).toBe('start-failed'); expect(m.endMessage).toBe('Run claude.'); expect(m.working).toBeNull(); expect(m.provisional).toBe('')
  })
})
