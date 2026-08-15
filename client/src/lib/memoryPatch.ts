// Client-side handling for memory-grounded document patches (Task 10):
// deciding whether a user message may have earned a patch, parsing one out
// of an agent response, and applying an approved one through the existing
// useProjectState document setters. Mirrors the never-throw parsing style of
// ./memoryReceipt.ts and the scope-generation caution used throughout
// useProjectMemory.ts — nothing here ever writes project memory or canon;
// Apply only ever calls a document setter.
import type {
  OutlineDocumentContent,
  ProjectDocuments,
  StoryBibleDocumentContent,
  SynopsisDocumentContent,
  TreatmentDocumentContent,
} from '@shared/documents'
import {
  MemoryGroundedPatchProposalSchema,
  validateMemoryGroundedPatch,
  type MemoryGroundedPatch,
  type MemoryGroundedPatchProposal,
  type StructuredDocumentSurface,
} from '@shared/memoryPatches'

// Plan ruling: "Generate a patch only when the user asks to fill, rewrite,
// apply, or revise the current surface — never unprompted." The actual
// decision to ask the agent for a patch happens server-side (out of this
// task's scope); this is the client's own belt-and-suspenders check so a
// patch never gets displayed off the back of an unrelated message, no matter
// what a future server sends back.
const PATCH_TRIGGER_PATTERN = /\b(fill|re-?write|apply|revise)\b/i

export function shouldRequestDocumentPatch(userMessage: string): boolean {
  return PATCH_TRIGGER_PATTERN.test(userMessage)
}

const ACTIVE_TAB_TO_SURFACE: Record<string, StructuredDocumentSurface | undefined> = {
  synopsis: 'synopsis',
  outline: 'outline',
  treatment: 'treatment',
  'story-bible': 'storyBible',
}

/** Maps a WritingTab id (client/src/lib/shellState.ts) to the structured-
 * document surface it corresponds to, or undefined for tabs with no
 * structured document (script) or no matching surface. */
export function surfaceForActiveTab(activeTab: string): StructuredDocumentSurface | undefined {
  return ACTIVE_TAB_TO_SURFACE[activeTab]
}

/**
 * Parses a raw agent-response value into a validated patch proposal, or
 * returns undefined for anything malformed — including a patch whose
 * `proposedContent` no longer matches its surface's schema. Never throws:
 * callers (App.tsx) treat "no proposal" the same whether the field was
 * absent, malformed, or failed content validation.
 */
export function parsePatchProposal(raw: unknown): MemoryGroundedPatchProposal | undefined {
  const parsed = MemoryGroundedPatchProposalSchema.safeParse(raw)
  if (!parsed.success) return undefined
  if (!validateMemoryGroundedPatch(parsed.data.patch).ok) return undefined
  // Zod infers `patch.proposedContent` as optional (z.unknown() accepts a
  // missing key); the validateMemoryGroundedPatch call above is the actual
  // guarantee that it is present and schema-valid, so this cast is safe.
  return parsed.data as MemoryGroundedPatchProposal
}

export type PatchApplyRejectionReason = 'stale' | 'invalid'

export type PatchApplyResult =
  | { ok: true }
  | { ok: false; reason: PatchApplyRejectionReason; message: string }

/** The four document setters this module needs from useProjectState's return
 * value — narrowed to just the shape Apply calls, so tests can pass plain
 * spies instead of the whole hook. */
export interface StructuredDocumentSetters {
  synopsis: (updater: (content: SynopsisDocumentContent) => SynopsisDocumentContent) => void
  outline: (updater: (content: OutlineDocumentContent) => OutlineDocumentContent) => void
  treatment: (updater: (content: TreatmentDocumentContent) => TreatmentDocumentContent) => void
  storyBible: (updater: (content: StoryBibleDocumentContent) => StoryBibleDocumentContent) => void
}

const STALE_PATCH_MESSAGE = 'This document changed since the suggestion was made. Refresh and try again.'
const INVALID_PATCH_MESSAGE = "The suggested content no longer matches this document's format."

/**
 * Applies an approved patch through the matching useProjectState setter.
 * Rejects (without ever calling a setter) when the patch's own shape/content
 * no longer validates, or when the document's `revision` has moved past the
 * patch's `baseVersion` — a stale patch is refused rather than silently
 * applied over newer edits. On success, the setter is called exactly once,
 * so `revision` increments exactly once.
 *
 * Deliberately does not touch project memory or canon: if the applied
 * content conflicts with canon, that is for the existing Task 8 observer to
 * notice from the resulting document save and route through the normal
 * capture path.
 */
export function applyMemoryGroundedPatch(
  patch: MemoryGroundedPatch,
  documents: ProjectDocuments,
  setters: StructuredDocumentSetters,
): PatchApplyResult {
  const validated = validateMemoryGroundedPatch(patch)
  if (!validated.ok) {
    return { ok: false, reason: 'invalid', message: INVALID_PATCH_MESSAGE }
  }

  const current = documents[validated.patch.surface]
  if (current.revision !== validated.patch.baseVersion) {
    return { ok: false, reason: 'stale', message: STALE_PATCH_MESSAGE }
  }

  switch (validated.patch.surface) {
    case 'synopsis':
      setters.synopsis(() => validated.content as SynopsisDocumentContent)
      break
    case 'outline':
      setters.outline(() => validated.content as OutlineDocumentContent)
      break
    case 'treatment':
      setters.treatment(() => validated.content as TreatmentDocumentContent)
      break
    case 'storyBible':
      setters.storyBible(() => validated.content as StoryBibleDocumentContent)
      break
  }
  return { ok: true }
}
