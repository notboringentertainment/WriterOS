// Morgan Runtime — local observability trace (Slice 1 of the agent
// observability/provenance PRD). Pure formatting + an injectable sink so the
// operator can prove from the dev terminal whether Morgan actually consulted a
// specialist, what she asked, and whether it succeeded. No persistence, no API
// shape change, no user-facing surface. The writer experiences the same Morgan.

import { randomBytes } from 'crypto';

// One structured runtime event, correlated by runId. Kept deliberately small —
// Slice 1 only logs; Slice 3 promotes this to the shared cross-agent schema.
export type MorganTraceEvent =
  | { kind: 'run.started'; runId: string; personaId: string }
  | { kind: 'askSpecialist.started'; runId: string; specialistId: string; question: string }
  | { kind: 'askSpecialist.ok'; runId: string; specialistId: string; durationMs: number; chars: number }
  | { kind: 'askSpecialist.error'; runId: string; specialistId: string; durationMs: number; reason: string }
  | { kind: 'guard.attribution'; runId: string; status: 'passed' | 'blocked'; specialists: string[] }
  | { kind: 'final.accepted'; runId: string }
  | { kind: 'final.failed'; runId: string; reason: string };

// A sink consumes events. Tests inject a collector; dev gets the console sink.
export type TraceSink = (event: MorganTraceEvent) => void;

const DEFAULT_PREVIEW_MAX = 160;

// Keep previews short and single-line so trace output stays grep-friendly and
// never dumps raw specialist creative material into the terminal.
/** Return a truncated, single-line preview suitable for local trace output. */
export function truncatePreview(value: string, max = DEFAULT_PREVIEW_MAX): string {
  const flat = value.replace(/\s*[\r\n]+\s*/g, ' ').trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, Math.max(0, max - 1))}…`;
}

function quotedPreview(value: string): string {
  return truncatePreview(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// morgan_<random> — enough entropy to correlate one browser turn with terminal
// logs without colliding across concurrent runs.
/** Create a correlation id for one Morgan runtime invocation. */
export function createRunId(): string {
  return `morgan_${randomBytes(5).toString('hex')}`;
}

// Render one event as a single structured, grep-by-runId/specialist/guard line.
/** Format a Morgan trace event as one stable, grep-friendly terminal line. */
export function formatTraceLine(event: MorganTraceEvent): string {
  const head = `[morgan] run=${event.runId}`;
  switch (event.kind) {
    case 'run.started':
      return `${head} start persona=${event.personaId}`;
    case 'askSpecialist.started':
      return `${head} askSpecialist start specialist=${event.specialistId} question="${quotedPreview(event.question)}"`;
    case 'askSpecialist.ok':
      return `${head} askSpecialist ok specialist=${event.specialistId} durationMs=${event.durationMs} chars=${event.chars}`;
    case 'askSpecialist.error':
      return `${head} askSpecialist error specialist=${event.specialistId} durationMs=${event.durationMs} reason="${quotedPreview(event.reason)}"`;
    case 'guard.attribution':
      return event.status === 'passed'
        ? `${head} guard attribution passed consulted=${event.specialists.join(',')}`
        : `${head} guard attribution blocked unconsulted=${event.specialists.join(',')}`;
    case 'final.accepted':
      return `${head} final accepted`;
    case 'final.failed':
      return `${head} final failed reason=${event.reason}`;
  }
}

// Dev terminal sink. console.error keeps trace on stderr, out of any stdout the
// app may treat as data.
export const consoleTraceSink: TraceSink = (event) => {
  console.error(formatTraceLine(event));
};

const noopTraceSink: TraceSink = () => {};

// Decide the sink when none is injected. Local dev sees logs by default; the
// test suite stays quiet unless explicitly forced. Gating:
//   MORGAN_TRACE=off  → always silent
//   MORGAN_TRACE=<any other value> → always log
//   unset → log unless NODE_ENV==='test'
/** Choose the injected sink or the environment-controlled default trace sink. */
export function resolveTraceSink(injected?: TraceSink): TraceSink {
  if (injected) return injected;
  const flag = process.env.MORGAN_TRACE;
  if (flag === 'off') return noopTraceSink;
  if (flag) return consoleTraceSink;
  return process.env.NODE_ENV === 'test' ? noopTraceSink : consoleTraceSink;
}
