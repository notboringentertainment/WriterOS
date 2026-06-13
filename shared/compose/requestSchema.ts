import { z } from 'zod'
import { OutlineDocumentContentSchema, SynopsisDocumentContentSchema, TreatmentDocumentContentSchema } from '../documents'

const IdentitySchema = z.object({ title: z.string(), genre: z.string() })
const FormatSchema = z.enum(['feature', 'series'])

export const ComposeDocumentRequestSchema = z.discriminatedUnion('surface', [
  z.object({
    surface: z.literal('outline'),
    format: FormatSchema,
    content: OutlineDocumentContentSchema,
    identity: IdentitySchema,
  }),
  z.object({
    surface: z.literal('synopsis'),
    format: FormatSchema,
    content: SynopsisDocumentContentSchema,
    identity: IdentitySchema,
  }),
  z.object({
    surface: z.literal('treatment'),
    format: FormatSchema,
    content: TreatmentDocumentContentSchema,
    identity: IdentitySchema,
  }),
])
export type ComposeDocumentRequest = z.infer<typeof ComposeDocumentRequestSchema>
