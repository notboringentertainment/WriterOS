export type MeetingTraceEvent =
  | { type: 'meeting.direction.folded'; projectId: string; sessionId: string; activeCount: number; pendingCount: number }
  | { type: 'meeting.ledger.bank_started'; projectId: string; sessionId: string; attempt: number; pendingCount: number }
  | { type: 'meeting.ledger.bank_conflict'; projectId: string; sessionId: string; attempt: number; conflict: string }
  | { type: 'meeting.ledger.bank_committed'; projectId: string; sessionId: string; pendingCount: number };

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
