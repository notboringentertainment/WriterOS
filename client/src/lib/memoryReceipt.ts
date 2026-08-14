import { MemoryReceiptSchema, type MemoryReceipt } from '@shared/schema'

export function parseMemoryReceipt(value: unknown): MemoryReceipt | undefined {
  const parsed = MemoryReceiptSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}
