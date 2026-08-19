import type { ProjectMemoryRecord, ProjectMemorySnapshot } from '../../shared/projectMemory'
import type { AnnotationLogState, AnnotationState } from '../../shared/projectMemoryAnnotations'
import { annotationStaleness } from '../../shared/projectMemoryAnnotations'
import type { ComposedBlock } from '../../shared/compose/types'
import { buildStandingEntries, type StandingEntry } from '../../shared/compose/whatsStandingFactSheet'
import { annotationIdFor } from '../projectMemory/annotationStore'

/**
 * Block renderer for the "What's Standing" report.
 *
 * Pure and deterministic: same snapshot, same blocks, byte for byte. No model is involved,
 * so nothing here can invent a relationship between two decisions. The report shows the
 * writer's own sentences and the memory store's own fields, and leaves the reader to draw
 * the conclusion — asserting "these disagree" would require recognising what a phrase like
 * "Superseded by beats 9-11" claims, which is a relation grammar this version does not have.
 */

function standingLine(record: ProjectMemoryRecord): string {
  const supersedes = record.supersedes.length > 0
    ? record.supersedes.join(', ')
    : 'nothing recorded'
  return `Recorded standing: ${record.status} · supersedes: ${supersedes} · last changed ${record.updatedAt.slice(0, 10)}`
}

/**
 * The writer's own resolution of a phrase, if one exists: rendered as the referents'
 * opening words so the reader learns what "beats 9-11" means without leaving the page.
 * Only approved annotations render — a proposed or declined question changes nothing here.
 */
function resolutionText(
  annotation: AnnotationState | undefined,
  snapshot: ProjectMemorySnapshot,
): string | undefined {
  if (annotation === undefined || annotation.status !== 'approved') return undefined
  if (annotationStaleness(annotation.support, snapshot).stale) return undefined
  const referents = annotation.referentRecordIds ?? []
  const summaries = referents.map(id => {
    const record = snapshot.records.find(r => r.id === id)
    if (record === undefined) return id
    const head = record.claim.split('\n')[0]
    return head.length > 70 ? `${head.slice(0, 69)}…` : head
  })
  return `You resolved this: it refers to ${summaries.map(t => `“${t}”`).join('; ')}.`
}

function recordBlocks(entry: StandingEntry, snapshot: ProjectMemorySnapshot, annotations?: AnnotationLogState): ComposedBlock[] {
  const blocks: ComposedBlock[] = [
    { type: 'paragraph', text: entry.record.claim, sourceFieldIds: [entry.record.id] },
  ]

  if (entry.record.detail) {
    blocks.push({ type: 'paragraph', text: entry.record.detail, sourceFieldIds: [entry.record.id] })
  }

  // The record's own qualifying sentences, quoted. This is the part the throwaway test
  // showed carries the value: the sentence that says a decision points elsewhere has to sit
  // directly beneath the decision, not buried in a field dump.
  //
  // Deduped per annotation, not per sentence text: the same sentence in claim and detail,
  // or two distinct phrases in one sentence, each carry their own annotation, and dropping
  // one would let the banner name a reference the body never shows.
  const quoted = new Set<string>()
  for (const cue of entry.cues) {
    const key = `${cue.field} ${cue.occurrence} ${cue.sentence}`
    if (quoted.has(key)) continue
    quoted.add(key)
    const annotationId = annotationIdFor({
      recordId: entry.record.id,
      field: cue.field,
      sentence: cue.sentence,
      phrase: cue.phrase,
      occurrence: cue.occurrence,
      cue: cue.cue,
    })
    const annotation = annotations?.annotations.get(annotationId)
    const resolved = resolutionText(annotation, snapshot)
    const sourceFieldIds = resolved !== undefined && annotation?.referentRecordIds !== undefined
      ? [entry.record.id, ...annotation.referentRecordIds]
      : [entry.record.id]
    blocks.push({
      type: 'leadInParagraph',
      lead: 'This record points elsewhere:',
      text: `“${cue.sentence}”` + (resolved !== undefined
        ? ` ${resolved}`
        : ' — this report does not resolve what that refers to.'),
      sourceFieldIds,
      annotationId,
    })
  }

  blocks.push({ type: 'meta', text: standingLine(entry.record) })
  return blocks
}

export function renderWhatsStandingBlocks(snapshot: ProjectMemorySnapshot, annotations?: AnnotationLogState): ComposedBlock[] {
  const entries = buildStandingEntries(snapshot)
  const conflicts = [...snapshot.conflicts]
    .filter(c => c.status === 'open')
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  const blocks: ComposedBlock[] = [
    { type: 'heading', text: "What's Standing" },
    {
      type: 'meta',
      text: `As of memory revision ${snapshot.revision}. This is a snapshot, not a live view — `
        + 'if the project has moved past this revision, this report is out of date.',
    },
    {
      type: 'meta',
      text: [
        `${entries.filter(e => e.group === 'inForce').length} in force`,
        `${entries.filter(e => e.group === 'withdrawn').length} read as withdrawn`,
        `${conflicts.length} contested`,
        `${entries.filter(e => e.group === 'openQuestion').length} open`,
        `${entries.filter(e => e.group === 'awaiting').length} awaiting your decision`,
      ].join(' · '),
    },
  ]

  const section = (heading: string, body: ComposedBlock[]): void => {
    if (body.length === 0) return
    blocks.push({ type: 'divider' }, { type: 'subheading', text: heading }, ...body)
  }

  section('In force', entries.filter(e => e.group === 'inForce').flatMap(e => recordBlocks(e, snapshot, annotations)))

  // Ahead of nothing else in particular, but never merged into "In force": a record whose
  // own wording says it was struck, sitting under a heading that says it is in force, reads
  // as the opposite of what it says. Its true recorded standing is still printed with it.
  section(
    'Reads as withdrawn — check before relying on these',
    entries.filter(e => e.group === 'withdrawn').flatMap(e => recordBlocks(e, snapshot, annotations)),
  )

  section('Contested', conflicts.map(conflict => ({
    type: 'paragraph' as const,
    text: conflict.reason,
    sourceFieldIds: [conflict.id],
  })))

  section('Still open', entries.filter(e => e.group === 'openQuestion').flatMap(entry => ([
    { type: 'paragraph' as const, text: entry.record.claim, sourceFieldIds: [entry.record.id] },
  ])))

  section('Awaiting your decision', entries.filter(e => e.group === 'awaiting').flatMap(entry => ([
    { type: 'paragraph' as const, text: entry.record.claim, sourceFieldIds: [entry.record.id] },
  ])))

  return blocks
}
