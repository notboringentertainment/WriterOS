// Look sessions: the Promote request/response and the export file OpenMontage's
// look_lock gate reads (look sessions plan, Task 3).

import { z } from 'zod'
import { EntityIdSchema, LookSpecSchema } from './lookSpec'
import { LookReferenceModeSchema } from './projectMemory'

export const LOOK_ENTITY_KINDS = ['character', 'location'] as const
export type LookEntityKind = typeof LOOK_ENTITY_KINDS[number]

/**
 * Top-level spec fields the server sets itself, so they need no writer
 * provenance: `version` is always the current schema version and
 * `depends_on` is derived from the session's citations.
 */
export const SERVER_SET_LOOK_FIELDS = ['version', 'depends_on'] as const

export const LookPromoteRequestSchema = z.object({
  spec: z.unknown(),
  entityName: z.string().trim().min(1).max(200),
  sessionId: z.string().min(1).max(200),
  citedRecordIds: z.array(z.string().min(1).max(500)).max(24),
  reference: LookReferenceModeSchema,
  /**
   * Writer provenance, keyed by top-level spec field. Every field present in
   * `spec` other than SERVER_SET_LOOK_FIELDS must be here as 'writer'. This is
   * an audit of the form's writes, not a cryptographic proof.
   */
  fieldSources: z.record(z.string(), z.literal('writer')),
  expectedRevision: z.number().int().nonnegative(),
  /** One per Promote click; a retry of the same click reuses it. */
  promotionOpId: z.string().uuid(),
}).strict()
export type LookPromoteRequest = z.infer<typeof LookPromoteRequestSchema>

export const LookPromoteResponseSchema = z.object({
  recordId: z.string(),
  lookHash: z.string(),
  memoryRevision: z.number().int().nonnegative(),
  exportPath: z.string(),
  exportWritten: z.boolean(),
  supersededRecordId: z.string().nullable(),
  retried: z.boolean(),
}).strict()
export type LookPromoteResponse = z.infer<typeof LookPromoteResponseSchema>

export const LookLocksExportEntrySchema = z.object({
  entity_kind: z.enum(LOOK_ENTITY_KINDS),
  entity_id: EntityIdSchema,
  look_spec: LookSpecSchema,
  look_hash: z.string().regex(/^[0-9a-f]{64}$/),
  promotion_id: z.string().min(1),
  promoted_at: z.string().min(1),
  // Beside the block, never inside it: it does not enter look_hash. The gate shows it.
  reference: LookReferenceModeSchema,
}).strict()

export const LookLocksExportSchema = z.object({
  version: z.literal(1),
  project_id: z.string().min(1),
  memory_revision: z.number().int().nonnegative(),
  written_at: z.string().min(1),
  looks: z.array(LookLocksExportEntrySchema),
}).strict()
export type LookLocksExport = z.infer<typeof LookLocksExportSchema>

export const LookExportResponseSchema = z.object({
  /** Package-relative path, or null for a project with no memory yet (nothing written). */
  exportPath: z.string().nullable(),
  regenerated: z.boolean(),
  export: LookLocksExportSchema,
}).strict()
export type LookExportResponse = z.infer<typeof LookExportResponseSchema>

/**
 * What the Look panel sends with each Zoe message in a look session (Task 4).
 * `reference` is 'unasked' until the writer answers the reference-image
 * question. `draftSummary` is the writer's current draft rendered for Zoe to
 * read back; it is data, never instructions.
 */
export const LookSessionContextSchema = z.object({
  sessionId: z.string().min(1).max(200),
  entityKind: z.enum(LOOK_ENTITY_KINDS),
  entityId: EntityIdSchema,
  entityName: z.string().trim().min(1).max(200),
  reference: z.enum(['unasked', 'none', 'generated-elsewhere', 'casting-inspiration']),
  filledFields: z.array(z.string().min(1).max(100)).max(64),
  draftSummary: z.string().max(4000),
}).strict()
export type LookSessionContext = z.infer<typeof LookSessionContextSchema>

/**
 * One unpromoted look draft (Task 5): working notes, same rules as the
 * Lookbook file. Only the Look panel's form writes `spec` and `fieldSources`;
 * a model reply never does (Task 6).
 */
export const LookDraftSchema = z.object({
  sessionId: z.string().min(1).max(200),
  entityKind: z.enum(LOOK_ENTITY_KINDS),
  entityName: z.string().min(1).max(200),
  reference: LookSessionContextSchema.shape.reference,
  spec: z.record(z.string(), z.unknown()),
  fieldSources: z.record(z.string(), z.literal('writer')),
  citedRecordIds: z.array(z.string().min(1).max(500)).max(24),
  updatedAt: z.string().min(1),
}).strict()
export type LookDraft = z.infer<typeof LookDraftSchema>

/** documents/looks.json. Drafts are keyed `${entityKind}:${entityId}`. */
export const LooksDocumentSchema = z.object({
  version: z.literal(1),
  drafts: z.record(
    z.string().regex(/^(character|location):[a-z0-9-]+$/, 'draft keys are <kind>:<entity-id>'),
    LookDraftSchema,
  ),
}).strict().superRefine((doc, context) => {
  for (const [key, draft] of Object.entries(doc.drafts)) {
    if (!key.startsWith(`${draft.entityKind}:`)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['drafts', key], message: 'A draft key must start with its entity kind.' })
    }
  }
})
export type LooksDocument = z.infer<typeof LooksDocumentSchema>

export function emptyLooks(): LooksDocument {
  return { version: 1, drafts: {} }
}

export function lookDraftKey(entityKind: LookDraft['entityKind'], entityId: string): string {
  return `${entityKind}:${entityId}`
}
