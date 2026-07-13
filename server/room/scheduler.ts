// Writers' Room — scheduler (§6.2). Single worker loop, setInterval 5s in dev.
// Pulls unprocessed room_events, applies wake rules, runs turns. Also generates
// idle_tick: fires after 10 min of no channel activity while a project is open
// (open = live SSE connection, D11).

import { isAnthropicConfigured } from '../ai/morganRuntime/anthropicToolClient';
import { runCaseyDigest } from './digest';
import { runRoomTurn } from './runRoomTurn';
import { openProjectIds } from './sseHub';
import * as store from './store';
import { isRoomConfigured } from './supabaseClient';
import { decideSpeakers } from './wakeRules';
import { RoomMemoryError } from './memoryContract';

const TICK_MS = 5_000;
const IDLE_AFTER_MS = 10 * 60 * 1000;

let timer: ReturnType<typeof setInterval> | null = null;
let ticking = false;
// One idle_tick per idle period per project: remember the last channel
// timestamp we ticked for so we don't re-fire until someone speaks again.
const idleTickedFor = new Map<string, number>();

async function maybeEmitIdleTicks(): Promise<void> {
  for (const projectId of openProjectIds()) {
    const last = await store.lastMessageAt(projectId);
    if (!last) continue; // empty room — nothing to digest
    const lastMs = last.getTime();
    if (Date.now() - lastMs < IDLE_AFTER_MS) continue;
    if (idleTickedFor.get(projectId) === lastMs) continue;
    idleTickedFor.set(projectId, lastMs);
    await store.insertEvent({ projectId, kind: 'idle_tick', payload: { reason: 'channel_idle' } });
  }
}

async function processEvents(): Promise<void> {
  const events = await store.claimQueuedEvents();
  for (const event of events) {
    const speakers = decideSpeakers(event);
    const retries = typeof event.payload.memoryRetries === 'number' ? event.payload.memoryRetries : 0;
    const completed = new Set(Array.isArray(event.payload.memoryCompletedSpeakers)
      ? event.payload.memoryCompletedSpeakers.filter((value): value is string => typeof value === 'string')
      : []);
    for (const speaker of speakers.slice(0, 2)) {
      const speakerKey = `${speaker.mode}:${speaker.agentId}`;
      if (completed.has(speakerKey)) continue;
      try {
        if (speaker.mode === 'digest') {
          await runCaseyDigest({ projectId: event.project_id, event });
        } else {
          await runRoomTurn({ projectId: event.project_id, agentId: speaker.agentId, event });
        }
        completed.add(speakerKey);
      } catch (error) {
        console.error(`[room.scheduler] turn failed (${speaker.agentId}, ${event.kind}):`, error);
        if (error instanceof RoomMemoryError) {
          if (retries < 3) {
            await store.requeueRoomEvent(event.id, {
              ...event.payload,
              memoryRetries: retries + 1,
              memoryCompletedSpeakers: [...completed],
            });
          }
          break;
        }
      }
    }
  }
}

export const __processEventsForTests = processEvents;

async function tick(): Promise<void> {
  if (ticking) return; // never overlap turns; slow turns just delay the next tick
  ticking = true;
  try {
    await maybeEmitIdleTicks();
    await processEvents();
  } catch (error) {
    console.error('[room.scheduler] tick failed:', error);
  } finally {
    ticking = false;
  }
}

export function startRoomScheduler(): boolean {
  if (timer) return true;
  if (!isRoomConfigured() || !isAnthropicConfigured()) {
    console.log('[room] scheduler not started (needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY)');
    return false;
  }
  timer = setInterval(() => void tick(), TICK_MS);
  timer.unref?.();
  console.log('[room] scheduler started (5s tick)');
  return true;
}

export function stopRoomScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
  idleTickedFor.clear();
}
