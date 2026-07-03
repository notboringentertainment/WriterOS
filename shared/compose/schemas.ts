import { z } from 'zod'

const sourceFieldIds = z.array(z.string().min(1)).min(1)

export const ComposedBlockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('heading'), text: z.string() }),
  z.object({ type: z.literal('subheading'), text: z.string() }),
  z.object({ type: z.literal('divider') }),
  z.object({ type: z.literal('meta'), text: z.string() }),
  z.object({ type: z.literal('logline'), text: z.string(), sourceFieldIds }),
  z.object({ type: z.literal('paragraph'), text: z.string(), sourceFieldIds }),
  z.object({ type: z.literal('leadInParagraph'), lead: z.string(), text: z.string(), sourceFieldIds }),
])

export const FidelityWarningSchema = z.object({
  kind: z.enum(['missing_provenance', 'dangling_source_id', 'coverage', 'entity_diff', 'injection_echo']),
  message: z.string(),
  blockIndex: z.number().int().optional(),
  fieldId: z.string().optional(),
  entity: z.string().optional(),
})

export const ComposedDocumentSchema = z.object({
  schemaVersion: z.number().int(),
  generatedAt: z.string(),
  model: z.string(),
  recipeVersion: z.number().int(),
  composerVersion: z.number().int(),
  sourceHash: z.string(),
  format: z.enum(['feature', 'series']),
  blocks: z.array(ComposedBlockSchema),
  fidelity: z.object({
    status: z.enum(['clean', 'flagged']),
    warnings: z.array(FidelityWarningSchema),
  }),
})

export const ModelComposeOutputSchema = z.object({ blocks: z.array(ComposedBlockSchema) })
