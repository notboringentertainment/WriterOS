import { InvalidLockSectionsError, containsReservedLockHeader, mergeLockSection } from './lockSections';
import * as store from './store';
import { bridgeStoryLocksToMemory } from '../projectMemory/roomBridge';

export async function syncSurfaceLocks(
  projectId: string,
  body: string,
): Promise<'ok' | 'conflict' | 'unavailable' | 'too_large' | 'invalid'> {
  if (containsReservedLockHeader(body)) return 'invalid';
  for (let attempt = 1; attempt <= 3; attempt++) {
    const current = await store.getSharedBlockValue(projectId, 'story_locks');
    if (current === null) return 'unavailable';
    let merged: string;
    try {
      merged = mergeLockSection(current, 'surface', body);
    } catch (error) {
      if (error instanceof InvalidLockSectionsError) return 'invalid';
      throw error;
    }
    if (merged.length > 2000) return 'too_large';
    if (merged === current) return 'ok';
    const written = await store.casUpdateSharedBlock({
      projectId, label: 'story_locks', expected: current, next: merged, updatedBy: 'writer',
    });
    if (written) {
      // Best-effort mirror into project memory as explicit canon (a writer
      // committing a lock IS explicit approval). The Supabase write above is
      // already durable and authoritative; a sync failure here is invisible
      // to this caller by design and simply retries from that durable source.
      void bridgeStoryLocksToMemory({ projectId, storyLocksValue: merged }).catch(() => {});
      return 'ok';
    }
  }
  return 'conflict';
}
