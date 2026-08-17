import type {
  MeetingDecisionContent,
  MeetingDecisionOp,
  MeetingDecisionRow,
} from './types';

export type {
  MeetingDecisionContent,
  MeetingDecisionOp,
  MeetingDecisionRow,
} from './types';

const CONTENT_BEARING_OPS: ReadonlySet<MeetingDecisionOp> = new Set([
  'assert',
  'revise',
  'supersede',
]);

export interface MeetingDecisionInvariantEvent {
  entryId: string;
  invalidTargets: string[];
  reason: 'target_not_earlier_content';
}

export interface ActiveMeetingDirection {
  entries: MeetingDecisionRow[];
  byArea: Map<string, MeetingDecisionRow[]>;
}

function isContentBearing(row: MeetingDecisionRow): row is MeetingDecisionRow & {
  content: MeetingDecisionContent;
} {
  return CONTENT_BEARING_OPS.has(row.op);
}

function compareDecisions(a: MeetingDecisionRow, b: MeetingDecisionRow): number {
  return a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
}

function reportInvariant(event: MeetingDecisionInvariantEvent): void {
  if (process.env.NODE_ENV !== 'production') {
    throw new Error(
      `[meeting.direction] invalid ledger entry ${event.entryId}: ${event.invalidTargets.join(', ')}`,
    );
  }
  console.error('[meeting.direction] invalid ledger entry', event);
}

export function foldMeetingDecisions(
  rows: readonly MeetingDecisionRow[],
  onInvalid: (event: MeetingDecisionInvariantEvent) => void = reportInvariant,
): ActiveMeetingDirection {
  const ordered = [...rows].sort(compareDecisions);
  const earlierContentIds = new Set<string>();
  const validContent: MeetingDecisionRow[] = [];
  const deactivated = new Set<string>();

  for (const row of ordered) {
    const validTargets = row.targets.filter((target) => earlierContentIds.has(target));
    const invalidTargets = row.targets.filter((target) => !earlierContentIds.has(target));

    for (const target of validTargets) deactivated.add(target);

    if (invalidTargets.length > 0) {
      onInvalid({
        entryId: row.id,
        invalidTargets,
        reason: 'target_not_earlier_content',
      });
    } else if (isContentBearing(row)) {
      validContent.push(row);
    }

    if (isContentBearing(row)) earlierContentIds.add(row.id);
  }

  const entries = validContent.filter((row) => !deactivated.has(row.id));
  const byArea = new Map<string, MeetingDecisionRow[]>();
  for (const row of entries) {
    const areaEntries = byArea.get(row.area) ?? [];
    areaEntries.push(row);
    byArea.set(row.area, areaEntries);
  }

  return { entries, byArea };
}
