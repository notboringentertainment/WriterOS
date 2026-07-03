// shared/compose/identity.ts
import type { ComposeIdentity } from './types'

export const IDENTITY_ALLOWLIST = ['title', 'genre'] as const

export function pickIdentity(meta: { title?: string; genre?: string }): ComposeIdentity {
  return { title: meta.title ?? '', genre: meta.genre ?? '' }
}
