// Writers' Room — one agent turn (§6.3, §7).
// Wraps the shared agentRuntime loop with room context assembly, the room
// toolset, live speak streaming over SSE, and ledger accounting. The loop,
// malformed-retry nudge, and honest-error paths come from runAgent unchanged.

import { runAgent } from '../ai/agentRuntime/runAgent';
import { sendToolTurn } from '../ai/morganRuntime/anthropicToolClient';
import { createRunId } from '../ai/morganRuntime/trace';
import type { ReachInventory } from '../ai/morganRuntime/types';
import { buildRoomSystemPrompt, buildTurnUserMessage } from './roomPrompts';
import { makeRoomToolset } from './roomToolset';
import { createSpeakStreamTracker } from './speakStream';
import { broadcast } from './sseHub';
import * as store from './store';
import type { LedgerAction, RoomEventRow } from './types';
import { newRecorder } from './types';

// The room's honest reach contract: agents see blocks + channel + the trigger,
// nothing else. Static because the room's reach IS static in Phase 1.
const ROOM_INVENTORY: ReachInventory = {
  canSee: ['the shared memory blocks', 'your private memory blocks', 'the last 30 channel messages', 'the trigger event'],
  cannotSee: ['the full documents', 'the writer\'s screen', 'other apps', 'the live web'],
  canDoNow: ['speak in the channel', 'file field proposals', 'update your private memory', 'pass'],
  cannotDoYet: ['message specific agents directly', 'edit documents', 'edit locks', 'research the web'],
};

export async function runRoomTurn(input: {
  projectId: string;
  agentId: string;
  event: RoomEventRow;
}): Promise<void> {
  const { projectId, agentId, event } = input;
  const turnId = createRunId();
  const recorder = newRecorder();

  // §6.3 context assembly.
  const [sharedBlocks, privateBlocks, channel, locksText] = await Promise.all([
    store.getSharedBlocksForAgent(projectId, agentId),
    store.getPrivateBlocks(projectId, agentId),
    store.listRecentMessages(projectId),
    store.getSharedBlockValue(projectId, 'story_locks'),
  ]);

  const ambient = event.kind !== 'writer_message';
  const systemPrompt = buildRoomSystemPrompt({ agentId, sharedBlocks, privateBlocks, ambient });
  const userMessage = buildTurnUserMessage({ channel, event });
  const channelAuthors = new Set(channel.map((m) => m.author));

  const toolset = makeRoomToolset({ projectId, agentId, recorder, locksText, channelAuthors });

  broadcast(projectId, { type: 'turn_started', agentId, turnId });

  const trackSpeak = createSpeakStreamTracker((content) => {
    broadcast(projectId, { type: 'speak_delta', agentId, turnId, content });
  });

  const result = await runAgent({
    personaId: agentId,
    systemPrompt,
    userMessage,
    history: [],
    inventory: ROOM_INVENTORY,
    toolset,
    runId: turnId,
    errorLogLabel: `Room turn error (${agentId}):`,
    sendTurn: (turnInput) =>
      sendToolTurn({
        ...turnInput,
        onStreamEvent: trackSpeak,
        onUsage: (usage) => {
          recorder.inputTokens += usage.inputTokens;
          recorder.outputTokens += usage.outputTokens;
        },
      }),
  });

  let action: LedgerAction;
  let messageLanded = false;
  try {
    if (!result.ok) {
      action = 'errored';
    } else if (recorder.speak) {
      // Channel insert happens HERE, after the guard accepted the turn.
      const message = await store.insertMessage({
        projectId,
        author: agentId,
        content: recorder.speak.content,
        replyTo: recorder.speak.replyTo,
      });
      broadcast(projectId, { type: 'message', message, turnId });
      messageLanded = true;
      action = 'spoke';
    } else if (recorder.proposalsFiled > 0) {
      action = 'proposed';
    } else {
      action = 'passed';
    }
  } catch (error) {
    console.error(`[room.turn] persistence failed (${agentId}):`, error);
    action = 'errored';
  }

  if (!messageLanded) {
    // No message landed for this turn — tell the UI to drop provisional bubbles.
    broadcast(projectId, { type: 'turn_ended', agentId, turnId, action });
  }

  try {
    await store.insertLedger({
      projectId,
      agentId,
      action,
      triggerEvent: event.id,
      inputTokens: recorder.inputTokens || undefined,
      outputTokens: recorder.outputTokens || undefined,
    });
  } catch (error) {
    console.error(`[room.turn] ledger insert failed (${agentId}):`, error);
  }
}
