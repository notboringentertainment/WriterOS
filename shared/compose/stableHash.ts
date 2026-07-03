// shared/compose/stableHash.ts
import { sha256Hex } from './sha256'
import { deterministicStringify } from './normalize'

export function stableHash(value: unknown): string {
  return sha256Hex(deterministicStringify(value))
}
