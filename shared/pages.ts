import { z } from 'zod'

export const PageNameSchema = z.enum(['synopsis', 'treatment', 'outline'])
export type PageName = z.infer<typeof PageNameSchema>
export const PageDocumentSchema = z.object({
  page: PageNameSchema,
  markdown: z.string(),
  status: z.enum(['draft', 'approved']),
  revision: z.number().int().nonnegative(),
  approvedAt: z.string().datetime().optional(),
  approvedCanon: z.array(z.object({ id: z.string(), version: z.string() })).optional(),
})
export type PageDocument = z.infer<typeof PageDocumentSchema>
export type ProjectPages = Partial<Record<PageName, PageDocument>>
