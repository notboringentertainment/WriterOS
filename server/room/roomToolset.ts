// Writers' Room — the §7.1 room toolset (Phase 1: no message_agent).
// Built per-turn: dispatch closes over a recorder + turn context so runRoomTurn
// can act on what happened after runAgent returns.
//
// Side-effect discipline: speak/pass record and return `final` with NO writes —
// the attribution guard runs after dispatch, so the channel insert happens in
// runRoomTurn only once the turn is accepted. propose_field_write and remember
// DO write during dispatch (cards and private memory aren't guard-governed) and
// return `continue` so the model can still end the turn properly.

import { PERSONAS } from '../../shared/personas';
import type { DispatchOutcome, ToolSpec, ToolUse } from '../ai/morganRuntime/types';
import type { AgentToolset } from '../ai/agentRuntime/types';
import { ATTRIBUTION_PATTERNS, escapeRegExp } from '../ai/agentRuntime/toolsets';
import { checkProposalAgainstLocks } from './lockGate';
import { broadcast } from './sseHub';
import * as store from './store';
import type { RoomMessageRow, RoomTurnRecorder } from './types';

export const SPEAK_TOOL = 'speak';
export const PROPOSE_TOOL = 'propose_field_write';
export const REMEMBER_TOOL = 'remember';
export const PASS_TOOL = 'pass';

const PRIVATE_BLOCK_LABELS = ['lane_notes', 'writer_rapport'] as const;
const PROPOSAL_SURFACES = ['storyBible', 'outline', 'synopsis', 'treatment'] as const;

export const ROOM_TOOLS: ToolSpec[] = [
  {
    name: SPEAK_TOOL,
    description:
      'Say one thing in the shared channel. Ends your turn. Use only if it changes what the writer does next.',
    input_schema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'What you say in the channel.' },
        replyTo: { type: 'string', description: 'Optional id of the channel message you are replying to.' },
      },
      required: ['content'],
    },
  },
  {
    name: PROPOSE_TOOL,
    description:
      'File a proposal card for a document field. The writer adopts or rejects it — you never write fields directly.',
    input_schema: {
      type: 'object',
      properties: {
        surface: { type: 'string', enum: [...PROPOSAL_SURFACES] },
        fieldPath: {
          type: 'string',
          description: "Field path on the surface, e.g. 'characters[<characterId>].want'.",
        },
        value: { type: 'string', description: 'The proposed new value for the field.' },
        rationale: { type: 'string', description: 'Why this change serves the story. One or two sentences.' },
      },
      required: ['surface', 'fieldPath', 'value', 'rationale'],
    },
  },
  {
    name: REMEMBER_TOOL,
    description:
      'Rewrite one of your private memory blocks (lane_notes or writer_rapport). Send the full condensed block, not an append.',
    input_schema: {
      type: 'object',
      properties: {
        label: { type: 'string', enum: [...PRIVATE_BLOCK_LABELS] },
        value: { type: 'string' },
      },
      required: ['label', 'value'],
    },
  },
  {
    name: PASS_TOOL,
    description:
      'End your turn without speaking. Use when your contribution would not change what the writer does next.',
    input_schema: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Why you passed (logged, never shown in the channel).' },
      },
      required: ['reason'],
    },
  },
];

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

export interface RoomTurnContext {
  projectId: string;
  agentId: string;
  recorder: RoomTurnRecorder;
  locksText: string;
  // Authors who actually have messages in the assembled channel window —
  // the evidence set for the room attribution guard (§7.2, D9).
  channelAuthors: Set<string>;
}

export function makeRoomToolset(turn: RoomTurnContext): AgentToolset {
  const dispatchTool = async (use: ToolUse): Promise<DispatchOutcome> => {
    const args = asRecord(use.input);

    switch (use.name) {
      case SPEAK_TOOL: {
        const content = typeof args.content === 'string' ? args.content.trim() : '';
        if (!content) {
          return { kind: 'error', toolUseId: use.id, content: 'speak requires non-empty content.' };
        }
        turn.recorder.speak = {
          content,
          replyTo: typeof args.replyTo === 'string' ? args.replyTo : undefined,
        };
        return { kind: 'final', result: { message: content, suggestions: [], ok: true } };
      }

      case PASS_TOOL: {
        turn.recorder.passReason = typeof args.reason === 'string' ? args.reason : 'no reason given';
        return { kind: 'final', result: { message: '', suggestions: [], ok: true } };
      }

      case REMEMBER_TOOL: {
        const label = typeof args.label === 'string' ? args.label : '';
        const value = typeof args.value === 'string' ? args.value : '';
        if (!(PRIVATE_BLOCK_LABELS as readonly string[]).includes(label)) {
          return {
            kind: 'error',
            toolUseId: use.id,
            content: `remember accepts labels ${PRIVATE_BLOCK_LABELS.join(', ')} — got "${label}".`,
          };
        }
        const written = await store.writeBlock({
          projectId: turn.projectId,
          agentId: turn.agentId,
          label,
          value,
          updatedBy: turn.agentId,
          charCap: label === 'lane_notes' ? 4000 : 1500, // §4.1 standard private caps
        });
        if (!written.ok) {
          return { kind: 'error', toolUseId: use.id, content: written.reason };
        }
        turn.recorder.remembers += 1;
        if (written.nearCap) {
          // §7.4: >85% cap queues a digest turn rather than crashing or clipping.
          await store.insertEvent({
            projectId: turn.projectId,
            kind: 'idle_tick',
            payload: { reason: 'cap_overflow', agentId: turn.agentId, label },
          });
        }
        return { kind: 'continue', toolUseId: use.id, content: `Saved ${label}.` };
      }

      case PROPOSE_TOOL: {
        const surface = typeof args.surface === 'string' ? args.surface : '';
        const fieldPath = typeof args.fieldPath === 'string' ? args.fieldPath : '';
        const value = typeof args.value === 'string' ? args.value : '';
        const rationale = typeof args.rationale === 'string' ? args.rationale : '';
        if (!(PROPOSAL_SURFACES as readonly string[]).includes(surface) || !fieldPath || !value || !rationale) {
          return {
            kind: 'error',
            toolUseId: use.id,
            content: 'propose_field_write requires surface (storyBible|outline|synopsis|treatment), fieldPath, value, rationale.',
          };
        }

        // §7.3 lock fidelity gate — before the proposal persists as pending.
        const lockCheck = await checkProposalAgainstLocks({
          locksText: turn.locksText,
          surface,
          fieldPath,
          proposedValue: value,
        });

        if (lockCheck.blocked) {
          await store.insertProposal({
            projectId: turn.projectId,
            agentId: turn.agentId,
            surface,
            fieldPath,
            proposedValue: value,
            rationale,
            status: 'blocked',
          });
          turn.recorder.proposalsBlocked += 1;
          return {
            kind: 'continue',
            toolUseId: use.id,
            content:
              `BLOCKED by an active story lock: ${lockCheck.reason ?? 'the proposal contradicts a lock'}. ` +
              'The proposal was not filed. You may argue against the lock in the channel, but only the writer edits locks.',
          };
        }

        const proposal = await store.insertProposal({
          projectId: turn.projectId,
          agentId: turn.agentId,
          surface,
          fieldPath,
          proposedValue: value,
          rationale,
        });
        turn.recorder.proposalsFiled += 1;

        // §4.4: auto-post a one-line channel ref for the card.
        const personaName = PERSONAS[turn.agentId]?.displayName ?? PERSONAS[turn.agentId]?.name ?? turn.agentId;
        const ref = await store.insertMessage({
          projectId: turn.projectId,
          author: turn.agentId,
          kind: 'proposal_ref',
          content: `${personaName} proposed a change to ${surface} → ${fieldPath} (proposal ${proposal.id})`,
        });
        broadcast(turn.projectId, { type: 'proposal', proposal });
        broadcast(turn.projectId, { type: 'message', message: ref as RoomMessageRow });

        return {
          kind: 'continue',
          toolUseId: use.id,
          content: `Proposal ${proposal.id} filed as pending. Now finish your turn with speak or pass.`,
        };
      }

      default:
        return { kind: 'error', toolUseId: use.id, content: `Unknown tool ${use.name}.` };
    }
  };

  return {
    tools: ROOM_TOOLS,
    terminalToolName: SPEAK_TOOL,
    malformedNudge:
      'You must end your turn by calling exactly one of the speak or pass tools. Do not answer in plain text.',
    dispatchTool,
    attributionGuard: {
      // §7.2 adapted to the room (D9): an agent may reference another agent's
      // position only if that agent actually spoke in the visible channel
      // window. Reuses Morgan's attribution regexes via the shared helper.
      findViolations: (result) => findRoomAttributionViolations(result.message, turn.channelAuthors, turn.agentId),
      formatError: (ids) => {
        const names = ids.map((id) => PERSONAS[id]?.displayName ?? PERSONAS[id]?.name ?? id).join(', ');
        return (
          `${names} has not said that in the channel you can see. ` +
          'Do not attribute positions to agents who have not spoken. Speak in your own voice or pass.'
        );
      },
    },
  };
}

// Morgan's attribution patterns (shared), plus room-specific phrasings for
// live-channel speech. Evidence set = authors present in the channel window
// instead of a consult ledger.
const ROOM_ATTRIBUTION_PATTERNS = [
  ...ATTRIBUTION_PATTERNS,
  (name: string) => String.raw`\b${name}\s+(?:said|thinks|flagged|pointed out)\b`,
];

export function findRoomAttributionViolations(
  message: string,
  channelAuthors: Set<string>,
  selfId: string,
): string[] {
  if (!message) return [];
  return Object.keys(PERSONAS).filter((id) => {
    if (id === selfId) return false;
    if (channelAuthors.has(id)) return false;
    const persona = PERSONAS[id];
    const names = [persona.name, persona.displayName].filter((n): n is string => Boolean(n));
    return names.some((name) => {
      const escaped = escapeRegExp(name);
      return ROOM_ATTRIBUTION_PATTERNS.some((pattern) => new RegExp(pattern(escaped), 'i').test(message));
    });
  });
}
