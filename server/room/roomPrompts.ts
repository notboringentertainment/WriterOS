// Writers' Room — prompt assembly for room turns.
// Persona identity comes from shared/personas.ts (single source of truth).
// Context assembly order per §6.3: persona system prompt → shared blocks →
// private blocks → last 30 channel messages → trigger event → tools (tools are
// carried by the API request itself).

import { PERSONAS } from '../../shared/personas';
import { SurfaceAwarenessSchema } from '../../shared/surfaceAwareness';
import { renderSurfaceAwareness } from '../../shared/surfaceAwarenessPrompt';
import type { MemoryBlockRow, RoomEventRow, RoomMessageRow } from './types';

function renderBlocks(title: string, blocks: MemoryBlockRow[]): string {
  if (blocks.length === 0) return '';
  const body = blocks
    .map((b) => `[${b.label}]\n${b.value.trim() || '(empty)'}`)
    .join('\n\n');
  return `${title}\n${body}`;
}

export function buildRoomSystemPrompt(input: {
  agentId: string;
  sharedBlocks: MemoryBlockRow[];
  privateBlocks: MemoryBlockRow[];
  ambient: boolean; // true when the trigger is not a writer message
}): string {
  const persona = PERSONAS[input.agentId];
  if (!persona) throw new Error(`Unknown persona: ${input.agentId}`);
  const name = persona.displayName ?? persona.name;
  const role = persona.displayRole ?? persona.role;

  const sections = [
    `You are ${name}, ${role} in the writers' room. ${persona.personality}.`,
    `Your expertise: ${persona.expertise.join(', ')}.`,

    `THE ROOM
You are a persistent resident of a shared writers'-room channel. Everyone —
the writer and every agent — speaks in the same channel. You were woken by an
event, not summoned by a chat request. You read the room, then act through
your tools.

YOUR TOOLS
- speak(content, replyTo?): say one thing in the channel. This ends your turn.
- propose_field_write(surface, fieldPath, value, rationale): file a proposal
  card for a document field. You NEVER write document fields directly — the
  writer adopts or rejects every proposal. You may combine this with speak.
- remember(label, value): update one of your private memory blocks
  (lane_notes or writer_rapport). Rewrite the whole block, condensed.
- pass(reason): end your turn silently. The reason goes to the ledger, not
  the channel.

Every turn MUST end in exactly one speak or one pass.

VALUE GATE
If your contribution would not change what the writer does next, call pass.
Passing is free and logged; speaking is a claim on the writer's attention.

HONESTY RULES
- Never present another agent's position unless they actually said it in the
  channel messages you can see. Credit the writer's material to the writer.
- Story locks are the writer's alone. You may argue against a lock in the
  channel — that is the room working — but you cannot propose around one.`,
  ];

  if (input.ambient) {
    sections.push(
      `AMBIENT TURN
No greetings, no recaps, no "I noticed that…" throat-clearing. Enter
mid-thought, like a real room. React to the substance of the event.`,
    );
  }

  const shared = renderBlocks('SHARED MEMORY (the room blackboard — read every turn):', input.sharedBlocks);
  if (shared) sections.push(shared);

  const priv = renderBlocks('YOUR PRIVATE MEMORY (only you see these; update via remember):', input.privateBlocks);
  if (priv) sections.push(priv);

  return sections.join('\n\n');
}

export function renderChannel(messages: RoomMessageRow[]): string {
  if (messages.length === 0) return 'CHANNEL (empty — the room has not spoken yet)';
  const lines = messages.map((m) => {
    const who = m.author === 'writer' ? 'WRITER' : (PERSONAS[m.author]?.displayName ?? PERSONAS[m.author]?.name ?? m.author);
    const tag = m.kind === 'say' ? '' : ` [${m.kind}]`;
    return `${who}${tag}: ${m.content}`;
  });
  return `CHANNEL (most recent ${messages.length} messages, oldest first):\n${lines.join('\n')}`;
}

export function renderTriggerEvent(event: RoomEventRow): string {
  switch (event.kind) {
    case 'writer_message': {
      const content = String(event.payload.content ?? '');
      const characters = Array.isArray(event.payload.characters)
        ? (event.payload.characters as Array<Record<string, unknown>>)
        : [];
      const characterContext =
        characters.length > 0
          ? [
              'VISIBLE STORY BIBLE CHARACTER CARDS (use exact ids if filing storyBible proposals):',
              ...characters.map((c) => {
                const bits = ['want', 'need', 'flaw', 'secret', 'arc']
                  .map((field) => {
                    const value = typeof c[field] === 'string' ? String(c[field]).trim() : '';
                    return value ? `${field}: ${value}` : null;
                  })
                  .filter(Boolean)
                  .join('; ');
                return `- ${String(c.name || c.id || 'Unnamed')} [id: ${String(c.id || 'unknown')}]${bits ? ` — ${bits}` : ''}`;
              }),
            ].join('\n')
          : 'VISIBLE STORY BIBLE CHARACTER CARDS: none. If the writer asks for character-field help, do not invent a field path; help them shape the answer in the channel and ask them to create/select a character card before filing a proposal.';
      const surfaceResult = SurfaceAwarenessSchema.safeParse(event.payload.surfaceAwareness);
      const surfaceContext = surfaceResult.success ? renderSurfaceAwareness(surfaceResult.data) : '';
      return [
        `TRIGGER: The writer just said (final message in the channel above): ${content}`,
        surfaceContext ? `LIVE SURFACE QUESTION DECK:\n${surfaceContext}` : null,
        characterContext,
        'If the writer is asking for character psychology help, help actively. If an exact character id is visible and the value is ready, file propose_field_write before you speak. Otherwise speak one useful next step or one sharp question.',
      ].filter(Boolean).join('\n');
    }
    case 'doc_field_changed': {
      const { surface, fieldPath, characterName, oldValue, newValue } = event.payload as Record<string, unknown>;
      return [
        `TRIGGER: The writer changed a document field (not a chat message — they are working in the ${String(surface)} surface).`,
        characterName ? `Character: ${String(characterName)}` : null,
        `Field: ${String(fieldPath)}`,
        `Before: ${String(oldValue ?? '(empty)') || '(empty)'}`,
        `After: ${String(newValue ?? '(empty)') || '(empty)'}`,
        'If your read implies a concrete, better value for this field (or a related one in your lane), ' +
          'file propose_field_write with it BEFORE you speak — analysis without the fix is half a turn. ' +
          'If the writer\'s version already works, say so plainly instead of proposing for the sake of it. ' +
          'If neither, pass.',
      ]
        .filter(Boolean)
        .join('\n');
    }
    default:
      return `TRIGGER: ${event.kind} ${JSON.stringify(event.payload)}`;
  }
}

export function buildTurnUserMessage(input: {
  channel: RoomMessageRow[];
  event: RoomEventRow;
}): string {
  return `${renderChannel(input.channel)}\n\n${renderTriggerEvent(input.event)}\n\nTake your turn now: use your tools, ending in exactly one speak or one pass.`;
}
