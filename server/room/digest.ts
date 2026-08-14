// Writers' Room — digest turns (§7.4, sleep-time pattern). Phase 1: Casey only.
// Cheap model, no channel output unless the digest surfaces a genuine flag
// (then one message max, marked as such). This is what makes memory feel
// curated, not hoarded.

import { sendStreamingMessage } from '../ai/morganRuntime/anthropicToolClient';
import { PERSONAS } from '../../shared/personas';
import { DIGEST_MODEL } from './lockGate';
import { broadcast } from './sseHub';
import * as store from './store';
import type { RoomEventRow } from './types';
import { RoomMemoryError, ensureProjectMemory } from './memoryContract';
import {
  ProjectMemoryAgentUnavailableError,
  buildAgentMemoryContext,
  capAgentMemoryText,
  finalizeAgentMemoryText,
  type ProjectMemoryProvider,
} from '../projectMemory/agentContext';

const CASEY_ID = 'casey';
const LANE_NOTES_CAP = 3400;
const WRITER_RAPPORT_CAP = 1200;

export async function runCaseyDigest(input: {
  projectId: string;
  event: RoomEventRow;
  memoryProvider?: ProjectMemoryProvider | null;
}): Promise<void> {
  const { projectId, event } = input;

  try {
    await ensureProjectMemory(projectId);
    let projectMemory;
    try {
      projectMemory = await buildAgentMemoryContext(input.memoryProvider ?? null, projectId, {
        message: JSON.stringify(event.payload),
        surface: 'writers-room-digest',
        personaId: CASEY_ID,
      });
    } catch (error) {
      if (error instanceof ProjectMemoryAgentUnavailableError) {
        throw new RoomMemoryError('Project memory is unavailable and needs repair.');
      }
      throw error;
    }
    const [privateBlocks, sharedBlocks, channel] = await Promise.all([
      store.getPrivateBlocks(projectId, CASEY_ID),
      store.getSharedBlocksForAgent(projectId, CASEY_ID),
      store.listRecentMessages(projectId, 50),
    ]);

    const persona = PERSONAS[CASEY_ID];
    const laneNotes = privateBlocks.find((b) => b.label === 'lane_notes')?.value ?? '';
    const rapport = privateBlocks.find((b) => b.label === 'writer_rapport')?.value ?? '';
    const transcript = channel
      .map((m) => `${m.author === 'writer' ? 'WRITER' : m.author}: ${m.content}`)
      .join('\n');
    const sharedContext = sharedBlocks.map((b) => `SHARED ${b.label}:\n${b.value}`).join('\n\n');

    const response = await sendStreamingMessage({
      model: DIGEST_MODEL,
      maxTokens: 1200,
      system:
        `You are the memory-digest process for ${persona.name}, ${persona.role}. ` +
        'Compress the channel history and current memory blocks into updated blocks. ' +
        `Digest bias (what lane_notes keeps): per-character psychology; contradictions between page behavior and stated spine. ` +
        `Keep what will matter next session; drop chatter. lane_notes max ${LANE_NOTES_CAP} chars, writer_rapport max ${WRITER_RAPPORT_CAP} chars. ` +
        'Respond with ONLY a JSON object: {"lane_notes": string, "writer_rapport": string, "flag": string | null}. ' +
        'Set flag ONLY for a genuine contradiction or risk the writer must see — almost always null.' +
        (projectMemory.prompt ? `\n\n${projectMemory.prompt}` : ''),
      messages: [
        {
          role: 'user',
          content:
            `${sharedContext ? `SHARED MEMORY (room blackboard):\n\n${sharedContext}\n\n` : ''}` +
            `CURRENT lane_notes:\n${laneNotes || '(empty)'}\n\n` +
            `CURRENT writer_rapport:\n${rapport || '(empty)'}\n\n` +
            `CHANNEL HISTORY (oldest first):\n${transcript || '(empty)'}`,
        },
      ],
    });

    const text = response.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`digest returned no JSON: ${text.slice(0, 200)}`);
    const parsed = JSON.parse(match[0]) as { lane_notes?: unknown; writer_rapport?: unknown; flag?: unknown };

    if (typeof parsed.lane_notes === 'string' && parsed.lane_notes.trim()) {
      const finalizedLaneNotes = finalizeAgentMemoryText(capAgentMemoryText(parsed.lane_notes, LANE_NOTES_CAP), projectMemory);
      await store.writeBlock({
        projectId,
        agentId: CASEY_ID,
        label: 'lane_notes',
        value: finalizedLaneNotes.text,
        memoryReceipt: finalizedLaneNotes.receipt,
        updatedBy: 'digest',
        charCap: LANE_NOTES_CAP,
      });
    }
    if (typeof parsed.writer_rapport === 'string' && parsed.writer_rapport.trim()) {
      const finalizedRapport = finalizeAgentMemoryText(capAgentMemoryText(parsed.writer_rapport, WRITER_RAPPORT_CAP), projectMemory);
      await store.writeBlock({
        projectId,
        agentId: CASEY_ID,
        label: 'writer_rapport',
        value: finalizedRapport.text,
        memoryReceipt: finalizedRapport.receipt,
        updatedBy: 'digest',
        charCap: WRITER_RAPPORT_CAP,
      });
    }

    if (typeof parsed.flag === 'string' && parsed.flag.trim()) {
      const finalizedFlag = finalizeAgentMemoryText(parsed.flag.trim(), projectMemory);
      const message = await store.insertMessage({
        projectId,
        author: CASEY_ID,
        kind: 'say',
        content: `⚑ (from my notes) ${finalizedFlag.text}`,
        memoryReceipt: finalizedFlag.receipt,
      });
      broadcast(projectId, { type: 'message', message });
    }

    await store.insertLedger({
      projectId,
      agentId: CASEY_ID,
      action: 'digested',
      triggerEvent: event.id,
      inputTokens: response.usage?.input_tokens ?? undefined,
      outputTokens: response.usage?.output_tokens ?? undefined,
    });
  } catch (error) {
    console.error('[room.digest] Casey digest failed:', error);
    await store.insertLedger({ projectId, agentId: CASEY_ID, action: 'errored', triggerEvent: event.id });
    if (error instanceof RoomMemoryError) throw error;
  }
}
