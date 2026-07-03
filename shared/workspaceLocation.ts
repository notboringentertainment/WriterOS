import { z } from 'zod'

// WorkspaceLocation is a read-only, provenance-labeled snapshot of where the writer is
// in the work. It is assembled client-side, validated here, and rendered server-side by
// fixed templates.

export const LocationSurfaceSchema = z.enum(['script', 'outline', 'synopsis', 'treatment', 'story-bible'])
export type LocationSurface = z.infer<typeof LocationSurfaceSchema>

export const LocationSourceKindSchema = z.enum(['selected_text', 'editor_cursor', 'active_section', 'first_unanswered', 'none'])
export type LocationSourceKind = z.infer<typeof LocationSourceKindSchema>

export const LocationProvenanceSchema = z.enum(['confirmed', 'inferred', 'synthetic', 'none'])
export type LocationProvenance = z.infer<typeof LocationProvenanceSchema>

export const LocationAnchorKindSchema = z.enum(['block', 'scene', 'section', 'question'])
export type LocationAnchorKind = z.infer<typeof LocationAnchorKindSchema>

export const LocationAnchorSchema = z.object({
  kind: LocationAnchorKindSchema,
  stableId: z.string(),
  label: z.string(),
})
export type LocationAnchor = z.infer<typeof LocationAnchorSchema>

export const WorkspaceLocationSchema = z.object({
  activeSurface: LocationSurfaceSchema,
  sourceKind: LocationSourceKindSchema,
  provenance: LocationProvenanceSchema,
  anchor: LocationAnchorSchema.optional(),
  updatedAt: z.number().int().optional(),
}).superRefine((value, ctx) => {
  if (value.sourceKind === 'none' && value.anchor) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['anchor'],
      message: 'anchor must be absent when sourceKind is none',
    })
  }

  if (value.sourceKind !== 'none' && !value.anchor) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['anchor'],
      message: 'anchor required when sourceKind is not none',
    })
  }

  if (value.provenance === 'confirmed' && value.sourceKind !== 'selected_text' && value.sourceKind !== 'editor_cursor') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['provenance'],
      message: 'confirmed requires selected_text or editor_cursor',
    })
  }

  if ((value.provenance === 'none') !== (value.sourceKind === 'none')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['provenance'],
      message: 'provenance none iff sourceKind none',
    })
  }
})
export type WorkspaceLocation = z.infer<typeof WorkspaceLocationSchema>
