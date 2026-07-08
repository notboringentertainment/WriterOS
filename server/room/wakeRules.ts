// Writers' Room — wake rules (§8, Phase 1 subset: Morgan + Casey only).
// This is data + pure functions so tuning never touches the engine.

import type { RoomEventRow } from './types';

export const MORGAN_ID = 'writingPartner';
export const CASEY_ID = 'casey';

// Casey's lane: character psychology fields (§8).
export const CASEY_CHARACTER_FIELDS = ['want', 'need', 'flaw', 'secret', 'arc'] as const;
const CASEY_DIRECT_RE = /\bcasey\b/i;
const CHARACTER_INTENT_RE =
  /\b(character|protagonist|lead|hero|heroine|cast|arc|want|need|flaw|secret|wound|motivation|desire)\b/i;

const CHARACTER_FIELD_RE = new RegExp(
  String.raw`^characters\[[^\]]+\]\.(${CASEY_CHARACTER_FIELDS.join('|')})$`,
);

export function isCaseyCharacterField(fieldPath: string): boolean {
  return CHARACTER_FIELD_RE.test(fieldPath);
}

export function isCaseyWriterMessage(input: { content: string; characterNames?: string[] }): boolean {
  const content = input.content.trim();
  if (!content) return false;
  if (CASEY_DIRECT_RE.test(content) && CHARACTER_INTENT_RE.test(content)) return true;
  const names = input.characterNames ?? [];
  return names.some(
    (name) => name.trim().length > 1 && content.toLowerCase().includes(name.trim().toLowerCase()),
  );
}

export type WakeDecision =
  | { agentId: string; mode: 'turn' }
  | { agentId: string; mode: 'digest' };

// Max 2 agent speakers per event (§6.2).
export function decideSpeakers(event: RoomEventRow): WakeDecision[] {
  switch (event.kind) {
    case 'writer_message': {
      // Morgan always evaluates a writer message (he passes freely).
      const decisions: WakeDecision[] = [{ agentId: MORGAN_ID, mode: 'turn' }];
      // Casey joins when a known character is mentioned OR the writer directly
      // asks for character-psychology work. This keeps the room useful before a
      // Story Bible is fully filled out.
      const content = String(event.payload.content ?? '');
      const names = Array.isArray(event.payload.characterNames)
        ? (event.payload.characterNames as string[])
        : [];
      if (isCaseyWriterMessage({ content, characterNames: names })) decisions.push({ agentId: CASEY_ID, mode: 'turn' });
      return decisions;
    }
    case 'doc_field_changed': {
      // Phase 1 wires exactly one source: Story Bible character fields → Casey.
      const surface = String(event.payload.surface ?? '');
      const fieldPath = String(event.payload.fieldPath ?? '');
      if (surface === 'storyBible' && isCaseyCharacterField(fieldPath)) {
        return [{ agentId: CASEY_ID, mode: 'turn' }];
      }
      return [];
    }
    case 'idle_tick':
      // Phase 1: digest for Casey only (§14 deliverable 4).
      return [{ agentId: CASEY_ID, mode: 'digest' }];
    case 'session_opened':
      // Recorded, not acted on in Phase 1 (D8).
      return [];
    default:
      // lock_changed / agent_mention are Phase 2 wake rules.
      return [];
  }
}
