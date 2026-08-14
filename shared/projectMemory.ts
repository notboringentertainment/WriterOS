import { z } from 'zod'

export const MemoryKindSchema = z.enum([
  'canon',
  'document_fact',
  'development',
  'decision',
  'open_question',
])

export const MemoryStatusSchema = z.enum([
  'candidate',
  'active',
  'superseded',
  'rejected',
])

export const MemoryWorkflowSchema = z.enum([
  'writeros',
  'writeros-room',
  'story-wayfinder',
  'pitchstudio',
  'buzz',
])

export const MemoryApprovalSchema = z.enum(['none', 'explicit'])
export const MemorySafetySchema = z.enum(['clear', 'flagged'])
export const RequestedMemoryStatusSchema = z.enum(['candidate', 'active'])
export const ProjectMemoryConflictStatusSchema = z.enum(['open', 'resolved'])
export const ProjectMemoryConflictResolutionSchema = z.enum([
  'left',
  'right',
  'both-valid',
  'not-conflict',
])

const TimestampSchema = z.string().datetime({ offset: true })
const IdentifierSchema = z.string().min(1).max(500)
const ReferenceListSchema = z.array(IdentifierSchema).max(100)

export const MemorySourceSchema = z.object({
  workflow: MemoryWorkflowSchema,
  sourceId: IdentifierSchema,
  sourceUri: z.string().min(1).max(2_000),
  sourceHash: z.string().min(1).max(500),
  capturedAt: TimestampSchema,
  approval: MemoryApprovalSchema,
}).strict()

export const MemoryEvidenceSchema = z.object({
  excerpt: z.string().min(1).max(1_500),
  locator: z.string().min(1).max(2_000).optional(),
}).strict()

export const ProjectMemoryRecordSchema = z.object({
  id: IdentifierSchema,
  projectId: IdentifierSchema,
  kind: MemoryKindSchema,
  status: MemoryStatusSchema,
  claim: z.string().min(1).max(600),
  detail: z.string().max(8_000).optional(),
  tags: z.array(z.string().min(1).max(100)).max(20),
  entities: z.array(z.string().min(1).max(200)).max(30),
  source: MemorySourceSchema,
  evidence: z.array(MemoryEvidenceSchema).max(3),
  safety: MemorySafetySchema,
  spoiler: z.boolean(),
  supersedes: ReferenceListSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
}).strict().superRefine((record, context) => {
  if (record.status === 'active' && record.safety === 'flagged') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['status'],
      message: 'Safety-flagged memory cannot be active.',
    })
  }
})

export const ProjectMemoryConflictSchema = z.object({
  id: IdentifierSchema,
  leftRecordId: IdentifierSchema,
  rightRecordId: IdentifierSchema,
  reason: z.string().min(1).max(2_000),
  status: ProjectMemoryConflictStatusSchema,
  resolution: ProjectMemoryConflictResolutionSchema.optional(),
}).strict().superRefine((conflict, context) => {
  if (conflict.status === 'open' && conflict.resolution !== undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['resolution'],
      message: 'An open conflict cannot have a resolution.',
    })
  }
  if (conflict.status === 'resolved' && conflict.resolution === undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['resolution'],
      message: 'A resolved conflict requires a resolution.',
    })
  }
})

export const PublishMemoryInputSchema = z.object({
  projectId: IdentifierSchema,
  dedupeKey: IdentifierSchema,
  kind: MemoryKindSchema,
  requestedStatus: RequestedMemoryStatusSchema,
  claim: z.string().min(1).max(600),
  detail: z.string().max(8_000).optional(),
  tags: z.array(z.string().min(1).max(100)).max(20).default([]),
  entities: z.array(z.string().min(1).max(200)).max(30).default([]),
  source: MemorySourceSchema,
  evidence: z.array(MemoryEvidenceSchema).max(3).default([]),
  safety: MemorySafetySchema.default('clear'),
  spoiler: z.boolean().default(false),
  conflictsWith: ReferenceListSchema.default([]),
  supersedes: ReferenceListSchema.default([]),
}).strict().superRefine((input, context) => {
  if (input.requestedStatus === 'active' && input.safety === 'flagged') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['requestedStatus'],
      message: 'Safety-flagged memory cannot be requested as active.',
    })
  }
})

const ExpectedRevisionSchema = z.number().int().nonnegative()

export const ProjectMemoryActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('promote'),
    recordId: IdentifierSchema,
    expectedRevision: ExpectedRevisionSchema,
    supersedes: ReferenceListSchema,
  }).strict(),
  z.object({
    type: z.literal('reject'),
    recordId: IdentifierSchema,
    expectedRevision: ExpectedRevisionSchema,
  }).strict(),
  z.object({
    type: z.literal('resolve-conflict'),
    conflictId: IdentifierSchema,
    expectedRevision: ExpectedRevisionSchema,
    resolution: ProjectMemoryConflictResolutionSchema,
  }).strict(),
])

export const ProjectMemorySnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  projectId: IdentifierSchema,
  revision: z.number().int().nonnegative(),
  records: z.array(ProjectMemoryRecordSchema),
  conflicts: z.array(ProjectMemoryConflictSchema),
}).strict()

const EventBase = {
  schemaVersion: z.literal(1),
  id: IdentifierSchema,
  projectId: IdentifierSchema,
  revision: z.number().int().positive(),
  occurredAt: TimestampSchema,
}

const PublishedMemoryEventSchema = z.object({
  ...EventBase,
  type: z.literal('published'),
  dedupeKey: IdentifierSchema,
  record: ProjectMemoryRecordSchema,
  conflicts: z.array(ProjectMemoryConflictSchema),
  supersededRecordIds: ReferenceListSchema,
}).strict().superRefine((event, context) => {
  if (event.record.projectId !== event.projectId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['record', 'projectId'],
      message: 'Published record projectId must match its event.',
    })
  }
})

const PromotedMemoryEventSchema = z.object({
  ...EventBase,
  type: z.literal('promoted'),
  recordId: IdentifierSchema,
  supersededRecordIds: ReferenceListSchema,
  resolvedConflictIds: ReferenceListSchema,
}).strict()

const RejectedMemoryEventSchema = z.object({
  ...EventBase,
  type: z.literal('rejected'),
  recordId: IdentifierSchema,
}).strict()

const ConflictResolvedMemoryEventSchema = z.object({
  ...EventBase,
  type: z.literal('conflict-resolved'),
  conflictId: IdentifierSchema,
  resolution: ProjectMemoryConflictResolutionSchema,
  activatedRecordIds: ReferenceListSchema,
  supersededRecordIds: ReferenceListSchema,
  rejectedRecordIds: ReferenceListSchema,
}).strict()

export const ProjectMemoryEventSchema = z.union([
  PublishedMemoryEventSchema,
  PromotedMemoryEventSchema,
  RejectedMemoryEventSchema,
  ConflictResolvedMemoryEventSchema,
])

export type MemoryKind = z.infer<typeof MemoryKindSchema>
export type MemoryStatus = z.infer<typeof MemoryStatusSchema>
export type MemoryWorkflow = z.infer<typeof MemoryWorkflowSchema>
export type MemorySource = z.infer<typeof MemorySourceSchema>
export type MemoryEvidence = z.infer<typeof MemoryEvidenceSchema>
export type ProjectMemoryRecord = z.infer<typeof ProjectMemoryRecordSchema>
export type ProjectMemoryConflict = z.infer<typeof ProjectMemoryConflictSchema>
export type PublishMemoryInput = z.input<typeof PublishMemoryInputSchema>
export type ParsedPublishMemoryInput = z.output<typeof PublishMemoryInputSchema>
export type ProjectMemoryAction = z.infer<typeof ProjectMemoryActionSchema>
export type ProjectMemorySnapshot = z.infer<typeof ProjectMemorySnapshotSchema>
export type ProjectMemoryEvent = z.infer<typeof ProjectMemoryEventSchema>

export interface PublishResult {
  published: boolean
  record: ProjectMemoryRecord
  snapshot: ProjectMemorySnapshot
}

export interface MemoryContextPackage {
  projectId: string
  revision: number
  activeCanon: ProjectMemoryRecord[]
  relevant: ProjectMemoryRecord[]
  conflicts: ProjectMemoryConflict[]
  citationMap: Record<string, MemorySource>
}

export interface ProjectSources {
  buzzChannelId?: string
}
