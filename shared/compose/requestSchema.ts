import { z } from 'zod'
import { OutlineDocumentContentSchema } from '../documents'

export const ComposeDocumentRequestSchema = z.object({
  surface: z.literal('outline'),
  format: z.enum(['feature', 'series']),
  content: OutlineDocumentContentSchema,
  identity: z.object({ title: z.string(), genre: z.string() }),
})
export type ComposeDocumentRequest = z.infer<typeof ComposeDocumentRequestSchema>
