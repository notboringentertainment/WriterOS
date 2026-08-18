// Reference cues for the "What's Standing" report.
//
// A cue match asserts exactly one thing: *this phrase appears to point at something
// else*. It never asserts what the relationship is. Deciding that "Superseded by
// beats 9-11" means supersession would require a relation grammar, and a wrong one
// silently misreports canon — so the report quotes the sentence and claims nothing.
//
// The list is data. Every pattern is tested with positive and negative cases, and
// adding one is a reviewable change rather than a tweak inside a renderer.

export interface CueMatch {
  /** Which record field the cue was found in. */
  field: 'claim' | 'detail'
  /** The sentence containing the cue, quoted verbatim for display. */
  sentence: string
  /** The exact text the cue pattern matched, within that sentence. */
  phrase: string
  /** 0-based index of this match among all matches for the record, in document order. */
  occurrence: number
  /** Which named pattern matched — surfaced in tests and diagnostics, never to the reader. */
  cue: string
}

interface CuePattern { name: string; pattern: RegExp }

// Ordered, and order is part of the contract: matches are reported in pattern order
// within a sentence so `occurrence` is stable across runs.
const CUE_PATTERNS: readonly CuePattern[] = [
  { name: 'superseded-by', pattern: /superseded by [^.;]+/gi },
  { name: 'struck', pattern: /\bstruck\b[^.;]*/gi },
  { name: 'do-not-use', pattern: /do not use[^.;]*/gi },
  { name: 'replaces', pattern: /\breplaces?\b [^.;]+/gi },
  // 'see' and 'per' were in an earlier draft as bare words and both fired constantly on
  // ordinary screenwriting prose — "we see the Zoe/Jack dynamic", "one call per episode".
  // A cue that fires on narration is worse than a missing cue: it buries the real ones and
  // trains the writer to ignore the section. 'see' is now anchored to an explicit pointer
  // and 'per' is dropped entirely.
  // Anchored to the start of a sentence, which is what separates an instruction to the
  // reader ("See the pilot ending ticket") from narration ("We see the Zoe/Jack dynamic").
  { name: 'see-also', pattern: /^see\s+(?:also\s+)?[^.;]*\b(?:ticket|beat|beats|record|decision|note)s?\b[^.;]*/gi },
  { name: 'beat-range', pattern: /\bbeats?\s+\d+\s*[–—-]\s*\d+/gi },
]

/**
 * Split text into sentences for quoting. Deliberately simple: the report shows the
 * writer's own words, so a slightly long or slightly short quote is acceptable, while
 * anything clever here would be a source of nondeterminism.
 */
export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.;])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 0)
}

/**
 * Find reference cues in one record field. Pure and deterministic: same input, same
 * matches, same order.
 */
export function findCues(field: 'claim' | 'detail', text: string | undefined): CueMatch[] {
  if (!text) return []
  const matches: CueMatch[] = []
  for (const sentence of splitSentences(text)) {
    const inSentence: Omit<CueMatch, 'occurrence'>[] = []
    for (const { name, pattern } of CUE_PATTERNS) {
      // Fresh RegExp per use: the module-level patterns carry /g and therefore
      // lastIndex state, which would leak between calls and drop matches.
      const scan = new RegExp(pattern.source, pattern.flags)
      for (const m of sentence.matchAll(scan)) {
        inSentence.push({ field, sentence, phrase: m[0].trim(), cue: name })
      }
    }
    // One question per stretch of text: a match whose phrase sits inside another match in
    // the same sentence is dropped. "Superseded by beats 9-11" would otherwise raise both
    // a superseded-by question and a beat-range question about the same words, and
    // answering one would still leave the other nagging.
    const kept = inSentence.filter((candidate, index) => !inSentence.some((other, otherIndex) => (
      otherIndex !== index
      && other.phrase !== candidate.phrase
      && other.phrase.includes(candidate.phrase)
    )))
    for (const match of kept) {
      matches.push({ ...match, occurrence: matches.length })
    }
  }
  return matches
}

/** Cue names that mean the record's own wording says it is no longer to be used. */
const WITHDRAWN_CUES = new Set(['struck', 'do-not-use', 'superseded-by'])

/**
 * True when a record's own wording carries a withdrawal cue.
 *
 * Used only to decide where a record is *displayed*. A withdrawn-sounding record whose
 * stored status is still `active` must not appear under a heading like "In force" — both
 * statements are true, but together they read as the opposite of what the record says,
 * which is the confusion this report exists to prevent. Its true structured standing is
 * still printed alongside it; nothing about the record is changed or reinterpreted.
 */
export function readsAsWithdrawn(cues: readonly CueMatch[]): boolean {
  return cues.some(c => WITHDRAWN_CUES.has(c.cue))
}

export const CUE_NAMES: readonly string[] = CUE_PATTERNS.map(p => p.name)
