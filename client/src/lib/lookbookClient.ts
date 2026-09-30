import { MemoryReceiptSchema, type MemoryReceipt } from '@shared/schema'
import { z } from 'zod'

const LookbookQuestionsResponseSchema = z.object({
  questions: z.array(z.object({ prompt: z.string() })),
  nothingToSee: z.boolean(),
  memoryReceipt: MemoryReceiptSchema.optional(),
})

export interface LookbookQuestionsResult {
  questions: Array<{ prompt: string }>
  nothingToSee: boolean
  memoryReceipt?: MemoryReceipt
}

export interface LookbookQuestionsRequest {
  beatKey: string
  clientRequestId: string
}

export async function postLookbookQuestions(
  projectId: string,
  sessionToken: string,
  body: LookbookQuestionsRequest,
): Promise<LookbookQuestionsResult> {
  const res = await fetch(`/api/lookbook/${encodeURIComponent(projectId)}/questions`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-WriterOS-Session': sessionToken,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    let reason = ''
    if (res.status === 422) {
      try {
        const parsed = (await res.json()) as { reason?: unknown }
        if (typeof parsed.reason === 'string') reason = ` ${parsed.reason}`
      } catch {
        // fall through to the generic message
      }
    }
    throw new Error(`Zoe's questions failed (${res.status}).${reason}`.trim())
  }
  return LookbookQuestionsResponseSchema.parse(await res.json())
}
