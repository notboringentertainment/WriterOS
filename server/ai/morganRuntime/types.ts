// Morgan Runtime — shared type contracts (M1).
// One responsibility: the types every runtime module agrees on. No logic here.

import type { SpecialistId } from '../../../shared/personas';

export interface ReachInventory {
  canSee: string[]; // derived from populated StoryMemory fields — never claimed unless real
  cannotSee: string[]; // fixed honest truths (pixels, unlisted fields, other apps, live web)
  canDoNow: string[]; // M1 capabilities
  cannotDoYet: string[]; // M2+ capabilities, named honestly
}

export interface MorganRuntimeResult {
  message: string;
  suggestions: string[];
  ok: boolean; // false on honest-error paths
  // NOTE: receipts/limits intentionally absent in M1 — there is no response path
  // or render surface for them yet. They return in M2 alongside askSpecialist +
  // the "consulted specialists" receipt UI, wired end-to-end rather than dangling.
}

export interface ToolSpec {
  name: string;
  description: string;
  input_schema: Record<string, unknown>; // JSON Schema
}

export interface ToolUse {
  id: string;
  name: string;
  input: unknown;
}

export interface SpecialistConsultTrace {
  specialistId: SpecialistId;
  question: string;
  message: string;
}

// Outcome of dispatching one tool_use.
export type DispatchOutcome =
  | { kind: 'continue'; toolUseId: string; content: string; consult?: SpecialistConsultTrace } // read/consult tool → feed result back
  | { kind: 'final'; result: MorganRuntimeResult } // respond_to_writer → stop
  | { kind: 'error'; toolUseId: string; content: string }; // bad tool input → feed error back

// One model turn, provider-agnostic shape returned by the client.
export interface ToolTurn {
  stopReason: string;
  toolUses: ToolUse[];
  text: string;
  assistantContent: unknown; // opaque Anthropic content array, passed back verbatim next turn
}

// One specialist's read, returned by the injected caller. M1's two tools never
// touch this; askSpecialist (M2 Task 4) consumes it.
export interface SpecialistAnswer {
  message: string;
}

// Provider-agnostic dependencies injected into the runtime. The closure that
// implements callSpecialist lives in the app layer (openaiService); the runtime
// never imports PERSONAS or app persona types — only this contract.
export interface RuntimeDeps {
  callSpecialist(input: { specialistId: SpecialistId; question: string }): Promise<SpecialistAnswer>;
}

export interface RunMorganInput {
  systemPrompt: string;
  userMessage: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  inventory: ReachInventory;
  deps?: RuntimeDeps;
}
