export type MeetingTraceEvent =
  | { type: 'meeting.direction.folded'; projectId: string; sessionId: string; activeCount: number; pendingCount: number }
  | { type: 'meeting.ledger.bank_started'; projectId: string; sessionId: string; attempt: number; pendingCount: number }
  | { type: 'meeting.ledger.bank_conflict'; projectId: string; sessionId: string; attempt: number; conflict: string }
  | { type: 'meeting.ledger.bank_committed'; projectId: string; sessionId: string; pendingCount: number }
  | { type: 'meeting.packet.composed'; projectId: string; sessionId: string; directionRevision: number }
  | { type: 'meeting.packet.proposal_started' | 'meeting.packet.proposal_completed' | 'meeting.packet.proposal_failed'; projectId: string; sessionId: string }
  | { type: 'meeting.packet.export_started' | 'meeting.packet.export_completed'; projectId: string; sessionId: string; packetId: string };

type MeetingTraceSink = (event: MeetingTraceEvent) => void;

let sink: MeetingTraceSink = (event) => {
  if (process.env.NODE_ENV === 'production') console.info('[meeting.trace]', event);
};

export function emitMeetingTrace(event: MeetingTraceEvent): void {
  sink(event);
}

export function __setMeetingTraceSinkForTests(next: MeetingTraceSink | null): void {
  sink = next ?? ((event) => {
    if (process.env.NODE_ENV === 'production') console.info('[meeting.trace]', event);
  });
}
