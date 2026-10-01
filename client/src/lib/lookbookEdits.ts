import type { LookbookDocument } from '@shared/lookbook'

function randomHex(): string {
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

/** Appends Zoe's prompts as blank questions; zero prompts still records the beat entry. */
export function applyLookbookAsk(
  doc: LookbookDocument,
  beatKey: string,
  titleAtAsk: string,
  prompts: string[],
  now: string,
): LookbookDocument {
  const existing = doc.beats[beatKey]?.questions ?? []
  const added = prompts.map(prompt => ({
    id: `lb_${randomHex()}`,
    prompt,
    answer: '',
    askedBy: 'zoe' as const,
    createdAt: now,
  }))
  return { ...doc, beats: { ...doc.beats, [beatKey]: { titleAtAsk, questions: [...existing, ...added] } } }
}

function mapQuestion(
  doc: LookbookDocument,
  beatKey: string,
  questionId: string,
  change: (question: LookbookDocument['beats'][string]['questions'][number]) => LookbookDocument['beats'][string]['questions'][number],
): LookbookDocument {
  const beat = doc.beats[beatKey]
  if (!beat) return doc
  return {
    ...doc,
    beats: {
      ...doc.beats,
      [beatKey]: { ...beat, questions: beat.questions.map(q => (q.id === questionId ? change(q) : q)) },
    },
  }
}

export function setLookbookAnswer(doc: LookbookDocument, beatKey: string, questionId: string, answer: string) {
  return mapQuestion(doc, beatKey, questionId, q => ({ ...q, answer }))
}

/** Hides a question; it stays in the document. */
export function dismissLookbookQuestion(doc: LookbookDocument, beatKey: string, questionId: string, now: string) {
  return mapQuestion(doc, beatKey, questionId, q => ({ ...q, dismissedAt: now }))
}

export function removeLookbookBeat(doc: LookbookDocument, beatKey: string): LookbookDocument {
  const { [beatKey]: _removed, ...rest } = doc.beats
  return { ...doc, beats: rest }
}
