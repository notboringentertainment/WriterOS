// shared/morganLive.ts
export type {
  Hello, ReportBatch, LiveEvent, Stamped, InboxAction, InboxAck, Ping,
  PermissionAsk, PermissionAnswer, PermissionPoll, PageProposal, ProposalAsk, ProposalOutcome, ProposalPoll, ScriptBlock, ScriptTarget, ScriptElement,
} from '../mod/writeros-morgan/hooks/protocol'
import type { Hello, Stamped, PageProposal, ProposalOutcome } from '../mod/writeros-morgan/hooks/protocol'

export type ComposerUpdate = { id: string; text: string; outcome: 'sent' | 'not-sent' | 'uncertain'; reason?: string }
export interface ApprovalCard { requestId: string; tool: string; summary: string; input: string }

/** What the server streams to the browser. */
export type MorganScreenEvent =
  | { type: 'hello'; hello: Hello }
  | { type: 'events'; epoch: string; events: Stamped[] }
  | { type: 'lost'; epoch: string | null; reason: 'no-hello' | 'silence' | 'stalled' | 'rejected-batch' | 'channel-error' | 'queue-overflow' }
  | { type: 'recovered'; epoch: string }
  | { type: 'composer'; update: ComposerUpdate }
  | { type: 'approval'; card: ApprovalCard }
  | { type: 'approval-answered'; requestId: string; allow: boolean }
  | { type: 'proposal'; proposalId: string; proposal: PageProposal }
  | { type: 'proposal-answered'; proposalId: string; outcome: ProposalOutcome['outcome'] }
  | { type: 'truncated' }
  | { type: 'resumed'; ok: boolean; message?: string }
  | { type: 'project-changed'; summary: string }   // Morgan's turn changed the beat sheet; WriterOS synced the Outline and canon
  | { type: 'ended'; reason: 'exited' | 'stopped' | 'server-shutdown' | 'start-failed'; code: number | null; message?: string }
