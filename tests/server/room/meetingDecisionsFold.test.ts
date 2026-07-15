import { describe, expect, it, vi } from 'vitest';

import {
  foldMeetingDecisions,
  type MeetingDecisionRow,
} from '../../../server/room/interview/meetingDecisions';

function decision(
  input: Partial<MeetingDecisionRow> & Pick<MeetingDecisionRow, 'id' | 'op'>,
): MeetingDecisionRow {
  return {
    id: input.id,
    project_id: input.project_id ?? 'project-1',
    session_id: input.session_id ?? 'session-1',
    area: input.area ?? 'locks',
    field_path: input.field_path ?? 'story_locks',
    op: input.op,
    content: input.content ?? {
      statement: input.id,
      mutability: 'locked',
      originMarker: '[SEED]',
      disposition: 'field_mapped',
    },
    targets: input.targets ?? [],
    created_at: input.created_at ?? '2026-07-14T00:00:00.000Z',
  };
}

describe('foldMeetingDecisions', () => {
  it('keeps only the last active value in a revise chain', () => {
    const result = foldMeetingDecisions([
      decision({ id: 'a', op: 'assert' }),
      decision({ id: 'b', op: 'revise', targets: ['a'], created_at: '2026-07-14T00:01:00.000Z' }),
      decision({ id: 'c', op: 'revise', targets: ['b'], created_at: '2026-07-14T00:02:00.000Z' }),
    ]);

    expect(result.entries.map((row) => row.id)).toEqual(['c']);
    expect(result.byArea.get('locks')?.map((row) => row.id)).toEqual(['c']);
  });

  it.each(['retract', 'redirect'] as const)('%s never becomes active content', (op) => {
    const result = foldMeetingDecisions([decision({ id: 'x', op })]);
    expect(result.entries).toEqual([]);
  });

  it('orders equal timestamps by id', () => {
    const result = foldMeetingDecisions([
      decision({ id: 'b', op: 'assert' }),
      decision({ id: 'a', op: 'assert' }),
    ]);

    expect(result.entries.map((row) => row.id)).toEqual(['a', 'b']);
  });

  it('allows one supersede entry to deactivate several earlier entries', () => {
    const result = foldMeetingDecisions([
      decision({ id: 'a', op: 'assert', area: 'locks' }),
      decision({ id: 'b', op: 'assert', area: 'ending' }),
      decision({
        id: 'c',
        op: 'supersede',
        area: 'premise',
        targets: ['a', 'b'],
        created_at: '2026-07-14T00:01:00.000Z',
      }),
    ]);

    expect(result.entries.map((row) => row.id)).toEqual(['c']);
  });

  it('deactivates a target idempotently when several later entries target it', () => {
    const result = foldMeetingDecisions([
      decision({ id: 'a', op: 'assert' }),
      decision({ id: 'b', op: 'retract', targets: ['a'], created_at: '2026-07-14T00:01:00.000Z' }),
      decision({ id: 'c', op: 'retract', targets: ['a'], created_at: '2026-07-14T00:02:00.000Z' }),
    ]);

    expect(result.entries).toEqual([]);
  });

  it('excludes an entry with a missing target but still applies valid targets', () => {
    const onInvalid = vi.fn();
    const result = foldMeetingDecisions([
      decision({ id: 'a', op: 'assert' }),
      decision({
        id: 'b',
        op: 'revise',
        targets: ['a', 'missing'],
        created_at: '2026-07-14T00:01:00.000Z',
      }),
    ], onInvalid);

    expect(result.entries).toEqual([]);
    expect(onInvalid).toHaveBeenCalledWith(expect.objectContaining({
      entryId: 'b',
      invalidTargets: ['missing'],
    }));
  });

  it('rejects targets that are later or non-content entries', () => {
    const onInvalid = vi.fn();
    const result = foldMeetingDecisions([
      decision({ id: 'a', op: 'retract' }),
      decision({ id: 'b', op: 'revise', targets: ['a', 'c'], created_at: '2026-07-14T00:01:00.000Z' }),
      decision({ id: 'c', op: 'assert', created_at: '2026-07-14T00:02:00.000Z' }),
    ], onInvalid);

    expect(result.entries.map((row) => row.id)).toEqual(['c']);
    expect(onInvalid).toHaveBeenCalledWith(expect.objectContaining({
      entryId: 'b',
      invalidTargets: ['a', 'c'],
    }));
  });

  it('returns current behavior identity for an empty ledger', () => {
    const result = foldMeetingDecisions([]);
    expect(result.entries).toEqual([]);
    expect([...result.byArea]).toEqual([]);
  });
});
