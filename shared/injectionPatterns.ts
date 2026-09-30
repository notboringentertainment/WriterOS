// Prompt-injection line patterns shared by the memory importers and the look
// validator. OpenMontage vendors this exact list in lib/look_spec.py
// (PROMPT_INJECTION_PATTERNS) and pins sha256 of the newline-joined sources, so
// keep the ORDER and the SOURCE strings; a change here must be mirrored there.

import { sha256Hex } from './canonicalJson'

export const IMPERATIVE_PATTERNS: readonly RegExp[] = [
  /@\w+/i,
  /\bignore (all |any )?(previous|prior|above)\b/i,
  /\byou (must|should|will) now\b/i,
  /\bsystem prompt\b/i,
  /\bnew instructions?\b/i,
]

/** 1-based line number of the first injection-shaped line, or undefined. */
export function promptInjectionLine(content: string): number | undefined {
  const lines = content.replace(/\r\n?/g, '\n').split('\n')
  const index = lines.findIndex(line => IMPERATIVE_PATTERNS.some(pattern => pattern.test(line)))
  return index < 0 ? undefined : index + 1
}

/** sha256 of the newline-joined pattern sources, the value OpenMontage pins. */
export function injectionPatternsSha256(): string {
  return sha256Hex(IMPERATIVE_PATTERNS.map(pattern => pattern.source).join('\n'))
}
