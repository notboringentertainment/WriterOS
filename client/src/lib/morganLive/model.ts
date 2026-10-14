// Ported from Story-drive's live model; WriterOS has approval cards and no raw terminal view.
import type { Hello, LiveEvent, MorganScreenEvent, ApprovalCard, PageProposal, ComposerUpdate } from '@shared/morganLive'
export type FeedItem =
  | { id: string; kind: 'prose'; markdown: string }
  | { id: string; kind: 'you'; text: string; earlier?: boolean }
  | { id: string; kind: 'tools'; label: string; files: string[]; open: boolean; helper?: boolean }
  | { id: string; kind: 'interrupted' }
export interface ToolGroup { tools: string[]; ids: string[]; agentId?: string }
export interface LiveModel {
  epoch: string | null; feed: FeedItem[]; provisional: string; working: { turnId: string } | null;
  openWaits: Map<string, string>; stuck: { reason: string; detail?: string } | null;
  cards: ApprovalCard[]; proposals: { proposalId: string; proposal: PageProposal }[];
  notice: string | null; ended: boolean; endReason?: string; endMessage?: string;
  earlierHidden: boolean; toolGroups: Record<string, ToolGroup>; down: string | null;
  composer: ComposerUpdate | null;
}
let nextId = 0
const id = () => `f${nextId++}`
const READS = new Set(['Read', 'Grep', 'Glob'])
const WRITES = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
export const initialModel = (): LiveModel => ({ epoch: null, feed: [], provisional: '', working: null, openWaits: new Map(), stuck: null, cards: [], proposals: [], notice: null, ended: false, earlierHidden: false, toolGroups: {}, down: null, composer: null })
export function toolLabel(tools: string[]): string {
  const reads = tools.filter((t) => READS.has(t)).length;
  const writes = tools.filter((t) => WRITES.has(t)).length;
  const other = [...new Set(tools.filter((t) => !READS.has(t) && !WRITES.has(t)))];
  const parts: string[] = [];
  if (reads) parts.push(`Read ${reads} file${reads === 1 ? "" : "s"}`);
  if (writes) parts.push(`Updated ${writes} file${writes === 1 ? "" : "s"}`);
  for (const o of other) parts.push(`Used ${o}`);
  return parts.join(" · ");
}

/** Same summary the mod sends for live tool events, rebuilt from a history tool input. */
export function historySummary(tool: string, input: Record<string, unknown>): string {
  const path = typeof input.file_path === "string" ? input.file_path : typeof input.path === "string" ? input.path : null;
  if (path) return path.replace(/^.*?\/(wayfinder\/)/, "$1");
  if (tool === "Bash" && typeof input.command === "string") return input.command.split("\n")[0]!.slice(0, 120);
  if (typeof input.pattern === "string") return input.pattern;
  return tool;
}

/** Adds one tool call to the current main group, or to its helper's group. Mutates `w`. */
function addTool(w: LiveModel, toolUseId: string, tool: string, summary: string, agentId?: string): void {
  let idx = -1;
  if (agentId !== undefined) {
    idx = w.feed.findIndex((f) => f.kind === "tools" && f.helper && w.toolGroups[f.id]?.agentId === agentId);
  } else {
    const last = w.feed.at(-1);
    if (last?.kind === "tools" && !last.helper) idx = w.feed.length - 1;
  }
  if (idx < 0) {
    const item: FeedItem = { id: id(), kind: "tools", label: "", files: [], open: false, ...(agentId !== undefined ? { helper: true } : {}) };
    w.feed.push(item);
    w.toolGroups = { ...w.toolGroups, [item.id]: { tools: [], ids: [], ...(agentId !== undefined ? { agentId } : {}) } };
    idx = w.feed.length - 1;
  }
  const item = w.feed[idx] as Extract<FeedItem, { kind: "tools" }>;
  const group = w.toolGroups[item.id]!;
  if (toolUseId && group.ids.includes(toolUseId)) return; // count each tool call once
  const next: ToolGroup = { ...group, tools: [...group.tools, tool], ids: [...group.ids, toolUseId] };
  w.toolGroups = { ...w.toolGroups, [item.id]: next };
  w.feed[idx] = {
    ...item,
    label: item.helper ? "Morgan used a helper" : toolLabel(next.tools),
    files: summary ? [...item.files, summary] : item.files,
  };
}

const textOf = (blocks: unknown[]): string =>
  blocks
    .filter((b): b is { type: "text"; text: string } => !!b && (b as any).type === "text" && typeof (b as any).text === "string")
    .map((b) => b.text)
    .join("\n\n");

function isPerson(origin: { kind: string; [k: string]: unknown }): boolean {
  if (origin.kind === "composer") return true;
  return origin.kind === "plugin" && origin.name === "writeros-morgan" && origin.asUser === true;
}


const waitState = (w: LiveModel) => w.openWaits.size ? { reason: 'waiting', detail: [...w.openWaits.values()].at(-1)! } : null
function applyEvent(w: LiveModel, ev: LiveEvent): void {
  switch (ev.kind) {
    case 'row': {
      if (ev.agentId !== undefined) return
      if (ev.role === 'assistant' || ev.type === 'assistant') {
        w.provisional = ''
        const text = textOf(ev.blocks)
        if (text.trim()) w.feed.push({ id: id(), kind: 'prose', markdown: text })
      } else if ((ev.role === 'user' || ev.type === 'user') && !ev.isMeta && isPerson(ev.origin)) {
        const text = textOf(ev.blocks)
        if (text.trim()) w.feed.push({ id: id(), kind: 'you', text })
      }
      return
    }
    case 'delta': w.provisional += ev.text; return
    case 'turn':
      if (ev.agentId !== undefined) return
      if (ev.phase === 'start') w.working = { turnId: ev.turnId }
      else { w.working = null; w.provisional = ''; if (ev.isAborted) w.feed.push({ id: id(), kind: 'interrupted' }) }
      return
    case 'tool': if (ev.phase === 'start') addTool(w, ev.toolUseId, ev.tool, ev.summary, ev.agentId); return
    case 'waiting-for-input':
      if (ev.reason === 'permission') return
      w.openWaits = new Map(w.openWaits).set(ev.requestId, ev.detail)
      if (!w.down) w.stuck = waitState(w)
      return
    case 'input-done':
      if (!w.openWaits.has(ev.requestId)) return
      w.openWaits = new Map(w.openWaits); w.openWaits.delete(ev.requestId)
      if (!w.down) w.stuck = waitState(w)
      return
    case 'channel-error': case 'queue-overflow': w.down = ev.kind; w.stuck = { reason: ev.kind }; return
    case 'session-end': w.working = null; w.provisional = ''; return
  }
}
export function reduce(m: LiveModel, msg: MorganScreenEvent | { type: 'reset' }): LiveModel {
  switch (msg.type) {
    case 'reset': return initialModel()
    case 'hello': {
      const h: Hello = msg.hello
      const w = { ...initialModel(), epoch: h.epoch, notice: m.notice === 'Morgan could not connect.' ? null : m.notice, cards: m.cards, proposals: m.proposals, earlierHidden: m.earlierHidden || h.historyUnavailable === true }
      for (const message of h.history ?? []) {
        if (message.text?.trim()) w.feed.push(message.role === 'user' ? { id: id(), kind: 'you', text: message.text, earlier: true } : { id: id(), kind: 'prose', markdown: message.text })
        for (const t of message.toolUses ?? []) addTool(w, t.tool_use_id, t.tool, historySummary(t.tool, t.input ?? {}))
      }
      return w
    }
    case 'events': {
      if (msg.epoch !== m.epoch) return m
      const w = { ...m, feed: m.feed.slice() }; for (const event of msg.events) applyEvent(w, event); return w
    }
    case 'lost':
      if (msg.epoch !== null && msg.epoch !== m.epoch) return m
      return msg.reason === 'no-hello' ? { ...m, notice: 'Morgan could not connect.' } : { ...m, down: msg.reason, stuck: { reason: msg.reason } }
    case 'recovered': return msg.epoch !== m.epoch || !m.down ? m : { ...m, down: null, stuck: waitState(m) }
    case 'approval': return { ...m, cards: [...m.cards.filter(c => c.requestId !== msg.card.requestId), msg.card] }
    case 'approval-answered': return { ...m, cards: m.cards.filter(c => c.requestId !== msg.requestId) }
    case 'proposal': return { ...m, proposals: [...m.proposals.filter(p => p.proposalId !== msg.proposalId), { proposalId: msg.proposalId, proposal: msg.proposal }] }
    case 'proposal-answered': return { ...m, proposals: m.proposals.filter(p => p.proposalId !== msg.proposalId) }
    case 'truncated': return { ...m, earlierHidden: true }
    case 'resumed': return { ...m, notice: msg.ok ? 'Picked up where you left off.' : msg.message ?? 'Morgan could not resume the conversation.' }
    case 'composer': return { ...m, composer: msg.update }
    case 'project-changed': return { ...m, notice: msg.summary }
    case 'ended': return { ...m, working: null, provisional: '', stuck: null, cards: [], proposals: [], ended: true, endReason: msg.reason, endMessage: msg.message }
  }
}
