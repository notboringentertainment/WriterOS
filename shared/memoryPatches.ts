// Memory-grounded document patches (Task 10): an agent's proposed rewrite of
// a structured document, carried alongside its chat response next to the
// Task 7 MemoryReceipt (server/projectMemory/agentContext.ts). The writer
// always previews and approves — nothing here writes a document or canon on
// its own.
//
// Scope is structured documents ONLY. Script-selection patches are deferred
// to V1.1 by plan ruling: the focus-range plumbing and selection hashing they
// would need do not exist yet. When that lands, this becomes a discriminated
// union over `kind`; for now `MemoryGroundedPatch` (`kind:
// 'structured-document'`) is the whole story — no script patch path exists.
import { z } from 'zod'
import {
  OutlineDocumentContentSchema,
  StoryBibleDocumentContentSchema,
  SynopsisDocumentContentSchema,
  TreatmentDocumentContentSchema,
  type OutlineDocumentContent,
  type StoryBibleDocumentContent,
  type SynopsisDocumentContent,
  type TreatmentDocumentContent,
} from './documents'
import { MemoryWorkflowSchema, type MemorySource } from './projectMemory'

export const STRUCTURED_DOCUMENT_SURFACES = ['synopsis', 'outline', 'treatment', 'storyBible'] as const
export type StructuredDocumentSurface = (typeof STRUCTURED_DOCUMENT_SURFACES)[number]

// Plan ruling: "Generate a patch only when the user asks to fill, rewrite,
// apply, or revise the current surface — never unprompted." Shared so the
// server (deciding whether to spend a model call generating a patch) and the
// client (deciding whether to trust/display one that came back) enforce the
// identical rule rather than two regexes drifting apart.
const PATCH_TRIGGER_PATTERN = /\b(fill|re-?write|apply|revise)\b/i

export function shouldRequestDocumentPatch(userMessage: string): boolean {
  return PATCH_TRIGGER_PATTERN.test(userMessage)
}

// shared/surfaceAwareness.ts's SurfaceIdSchema ('outline' | 'synopsis' |
// 'treatment' | 'story-bible') is the "current surface" the writer is on;
// this maps it onto the structured-document surface it corresponds to.
// 'story-bible' -> 'storyBible' is the only non-identity mapping.
const SURFACE_ID_TO_STRUCTURED_DOCUMENT_SURFACE: Record<string, StructuredDocumentSurface | undefined> = {
  synopsis: 'synopsis',
  outline: 'outline',
  treatment: 'treatment',
  'story-bible': 'storyBible',
}

export function structuredDocumentSurfaceFromSurfaceId(surfaceId: string): StructuredDocumentSurface | undefined {
  return SURFACE_ID_TO_STRUCTURED_DOCUMENT_SURFACE[surfaceId]
}

/** Verbatim patch shape from the plan. `baseVersion` refers to the document's
 * `revision` counter (shared/documents.ts), not its schema `version`. */
export interface MemoryGroundedPatch {
  kind: 'structured-document'
  surface: StructuredDocumentSurface
  baseVersion: number
  proposedContent: unknown
  changedPaths: string[]
  memoryIds: string[]
}

// Not annotated as z.ZodType<MemoryGroundedPatch>: zod infers `proposedContent`
// as optional (z.unknown() accepts a missing key, same as it accepts any
// other value), so the schema's own output type would never satisfy the
// interface's required `proposedContent: unknown`. validateMemoryGroundedPatch
// below is the single place that turns a successful parse into the typed
// `MemoryGroundedPatch` — do that assertion there, not on the schema itself.
export const MemoryGroundedPatchSchema = z.object({
  kind: z.literal('structured-document'),
  surface: z.enum(STRUCTURED_DOCUMENT_SURFACES),
  baseVersion: z.number().int().nonnegative(),
  proposedContent: z.unknown(),
  changedPaths: z.array(z.string()),
  memoryIds: z.array(z.string()),
})

export interface MemoryGroundedPatchCitation {
  id: string
  workflow: z.infer<typeof MemoryWorkflowSchema>
  sourceUri: string
}

export const MemoryGroundedPatchCitationSchema: z.ZodType<MemoryGroundedPatchCitation> = z.object({
  id: z.string(),
  workflow: MemoryWorkflowSchema,
  sourceUri: z.string(),
})

/**
 * The "agent response, extended" shape (plan checklist: "Extend agent
 * response with optional validated patch"). `MemoryGroundedPatch` itself
 * stays exactly the plan's verbatim shape; rationale, canon conflicts, and
 * resolved citation info live alongside it here because the preview needs
 * them but they are not part of the patch that gets persisted or applied.
 */
export interface MemoryGroundedPatchProposal {
  patch: MemoryGroundedPatch
  rationale: string
  canonConflicts: string[]
  citations: MemoryGroundedPatchCitation[]
}

// Same reason as MemoryGroundedPatchSchema above: `patch.proposedContent`'s
// optionality propagates into this schema's inferred output type, so it is
// left unannotated rather than forced to match MemoryGroundedPatchProposal.
export const MemoryGroundedPatchProposalSchema = z.object({
  patch: MemoryGroundedPatchSchema,
  rationale: z.string(),
  canonConflicts: z.array(z.string()),
  citations: z.array(MemoryGroundedPatchCitationSchema),
})

/**
 * Outcome of one server-side attempt to generate a patch for the current
 * message. `not-requested` covers every case where generation was never
 * attempted (no fill/rewrite/apply/revise intent, no matching structured
 * surface, no folder-backed project to read a revision from) — this is the
 * normal, silent case and is never surfaced as a failure. `failed` is an
 * attempt that was made and produced nothing usable (provider error, invalid
 * JSON, or content that failed the exact surface schema after the bounded
 * retry) — plan ruling: this must be visible in the response payload rather
 * than silently dropped, even though the chat response itself still
 * succeeds.
 */
export type MemoryGroundedPatchAttempt =
  | { status: 'generated'; proposal: MemoryGroundedPatchProposal }
  | { status: 'not-requested' }
  | { status: 'failed'; reason: string }

const SURFACE_CONTENT_SCHEMAS = {
  synopsis: SynopsisDocumentContentSchema,
  outline: OutlineDocumentContentSchema,
  treatment: TreatmentDocumentContentSchema,
  storyBible: StoryBibleDocumentContentSchema,
} satisfies Record<StructuredDocumentSurface, z.ZodTypeAny>

export interface StructuredDocumentSurfaceContent {
  synopsis: SynopsisDocumentContent
  outline: OutlineDocumentContent
  treatment: TreatmentDocumentContent
  storyBible: StoryBibleDocumentContent
}

export type MemoryGroundedPatchValidationError = 'invalid-shape' | 'invalid-content'

export type MemoryGroundedPatchValidationResult =
  | { ok: true; patch: MemoryGroundedPatch; content: StructuredDocumentSurfaceContent[StructuredDocumentSurface] }
  | { ok: false; error: MemoryGroundedPatchValidationError; message: string }

/**
 * Validates a patch's own shape AND its `proposedContent` against the exact
 * surface Zod schema. Plan ruling: this same check runs both before the
 * agent response goes out and again before Apply commits it — call it at
 * both checkpoints rather than trusting a value that already looked right
 * once.
 */
export function validateMemoryGroundedPatch(input: unknown): MemoryGroundedPatchValidationResult {
  const shape = MemoryGroundedPatchSchema.safeParse(input)
  if (!shape.success) {
    return { ok: false, error: 'invalid-shape', message: 'Not a structured-document patch.' }
  }
  const patch = shape.data as MemoryGroundedPatch
  const contentSchema = SURFACE_CONTENT_SCHEMAS[patch.surface]
  const content = contentSchema.safeParse(patch.proposedContent)
  if (!content.success) {
    return {
      ok: false,
      error: 'invalid-content',
      message: `Proposed content does not match the ${patch.surface} schema.`,
    }
  }
  return { ok: true, patch, content: content.data as StructuredDocumentSurfaceContent[StructuredDocumentSurface] }
}

/**
 * Drops any memoryId the caller's supplied context does not vouch for, and
 * rebuilds `citations` to match. Mirrors the "invented IDs dropped" rule
 * agentContext.ts already applies to inline citations in prose
 * (server/projectMemory/agentContext.ts finalizeAgentMemoryText).
 */
export function filterMemoryGroundedPatchProposal(
  proposal: MemoryGroundedPatchProposal,
  allowedCitations: ReadonlyMap<string, MemorySource>,
): MemoryGroundedPatchProposal {
  const memoryIds = proposal.patch.memoryIds.filter(id => allowedCitations.has(id))
  const citations = memoryIds.map(id => {
    const source = allowedCitations.get(id) as MemorySource
    return { id, workflow: source.workflow, sourceUri: source.sourceUri }
  })
  return { ...proposal, patch: { ...proposal.patch, memoryIds }, citations }
}
