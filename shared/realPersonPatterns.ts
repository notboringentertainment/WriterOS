// Known-person name patterns, ported from OpenMontage tools/prompt_builder.py
// (_NAME_PATTERNS, ~lines 138–145; normalisation canonical_text ~160–173;
// applied by check_safe_line ~182–200). OpenMontage refuses these at
// generation time, so WriterOS refuses them at Promote.
//
// This is a SMALL documented pattern list — honorific + capitalised name,
// "looks like / resembles / played by <Name>", "a young <Name>",
// "<Name>'s face" — not a celebrity database. The writer's
// fictional_subject_attestation remains the primary control.
//
// Sources and flags are copied verbatim; realPersonPatternsSha256() is pinned in
// tests and in OpenMontage. JS \b is ASCII-only where Python's is Unicode, and
// every \b here sits next to an ASCII letter, so the JS side refuses a superset.

import { sha256Hex } from './canonicalJson'

const CAP = "[A-Z][a-z]+(?:[-'][A-Z][a-z]+)?"
const NAME = `${CAP}(?:\\s+${CAP}){1,2}`

const SOURCES: ReadonlyArray<{ source: string; ignoreCase: boolean }> = [
  { source: `\\b(Mr|Mrs|Ms|Miss|Dr|Sir|Dame|Lord|Lady|President|Senator)\\.?\\s+${NAME}`, ignoreCase: false },
  {
    source: `\\b(looks?\\s+like|resembl(?:es|ing)|played\\s+by|portrayed\\s+by|in\\s+the\\s+style\\s+of\\s+actor|like\\s+actor|like\\s+actress|as\\s+played\\s+by|lookalike\\s+of|doppelg[aä]nger\\s+of)\\s+(?:a\\s+|an\\s+|the\\s+)?(?:young\\s+|old(?:er)?\\s+)?${NAME}`,
    ignoreCase: true,
  },
  { source: `\\b(a|an)\\s+(young|older|middle-aged)\\s+${NAME}\\b`, ignoreCase: false },
  { source: `\\b${NAME}'s\\s+(face|features|look|likeness|eyes|smile|jawline)\\b`, ignoreCase: false },
  {
    source: `\\b(celebrity|famous\\s+(?:actor|actress|singer|politician|athlete))\\s+${NAME}\\b`,
    ignoreCase: true,
  },
]

export const REAL_PERSON_NAME_PATTERNS: readonly RegExp[] = SOURCES.map(
  ({ source, ignoreCase }) => new RegExp(source, ignoreCase ? 'i' : ''),
)

// Python's re.IGNORECASE treats exactly these four non-ASCII characters as
// ASCII letters (enumerated over every code point with Python 3.10); JS /i
// treats none of them so. Fold them before any case-insensitive scan so
// "İgnore previous" or "looks like İvan Smith" is refused here as it is in
// OpenMontage. Scanning only: stored text and look_hash are untouched.
export const PYTHON_CASE_FOLDS: Readonly<Record<string, string>> = {
  'İ': 'i', // İ LATIN CAPITAL LETTER I WITH DOT ABOVE
  'ı': 'i', // ı LATIN SMALL LETTER DOTLESS I
  'ſ': 's', // ſ LATIN SMALL LETTER LONG S
  'K': 'k', // K KELVIN SIGN
}
export function foldPythonCaseEquivalents(value: string): string {
  return value.replace(/[İıſK]/g, ch => PYTHON_CASE_FOLDS[ch])
}

/** sha256 of the sources joined by newlines, each case-insensitive one suffixed "\0i" (as OpenMontage pins it). */
export function realPersonPatternsSha256(): string {
  return sha256Hex(SOURCES.map(({ source, ignoreCase }) => source + (ignoreCase ? '\u0000i' : '')).join('\n'))
}

// Python str.isspace() code points. canonical_text turns these into spaces.
export const PY_WHITESPACE_CLASS =
  '\\u0009-\\u000D\\u001C-\\u0020\\u0085\\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000'

/**
 * Port of prompt_builder.canonical_text: NFKC, Python whitespace to spaces,
 * control/format/unassigned/private-use/surrogate characters (category C) dropped,
 * whitespace collapsed and trimmed.
 */
export function canonicalText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(new RegExp(`[${PY_WHITESPACE_CLASS}]`, 'gu'), ' ')
    .replace(/\p{C}/gu, '')
    .replace(new RegExp(`[${PY_WHITESPACE_CLASS}]+`, 'gu'), ' ')
    .trim()
}

// prompt_builder._DELIMITER_MAP: the builder checks again after this translation.
const DELIMITER_MAP: Record<string, string> = {
  '"': "'", '`': "'", '{': '(', '}': ')', '[': '(', ']': ')', '<': '(', '>': ')', '|': '/', '\\': '/',
}

/**
 * The first matching pattern's text, or undefined when clean. Like
 * check_safe_line via _clean, checks the normalised text and again after
 * delimiters are neutralised (so `Name"s face` is caught as `Name's face`).
 */
export function findRealPersonName(text: string): string | undefined {
  const normalized = canonicalText(text)
  const neutralized = normalized.replace(/["`{}[\]<>|\\]/g, ch => DELIMITER_MAP[ch])
  for (const candidate of [normalized, neutralized]) {
    for (const pattern of REAL_PERSON_NAME_PATTERNS) {
      const match = pattern.exec(pattern.ignoreCase ? foldPythonCaseEquivalents(candidate) : candidate)
      if (match) return match[0]
    }
  }
  return undefined
}
