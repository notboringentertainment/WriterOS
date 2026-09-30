// look_spec 1.1: the typed look block a writer promotes from WriterOS.
//
// Mirrors OpenMontage schemas/look_spec.schema.json field for field (that file
// is the source of truth; 1.1 adds the WriterOS dependency reference). String
// bounds count code points, as JSON Schema does. The block carries no status,
// hash, receipt or supersedes field: look_hash lives outside it.
//
// validateLookSpecForPromotion adds the rules JSON Schema cannot express, the
// same ones OpenMontage's lib/look_spec.py applies (20–80 words, 600 characters,
// injection scan), plus the promotion rules (attested fictional subject, not a
// minor, no child/teen age band, no documented real-person name pattern).

import { z } from 'zod'
import { IMPERATIVE_PATTERNS } from './injectionPatterns'
import { PY_WHITESPACE_CLASS, findRealPersonName, foldPythonCaseEquivalents } from './realPersonPatterns'

export const LOOK_SPEC_VERSIONS = ['1.0', '1.1'] as const
export const DESCRIPTION_MIN_WORDS = 20
export const DESCRIPTION_MAX_WORDS = 80
export const DESCRIPTION_MAX_CHARS = 600

const codePoints = (value: string) => [...value].length
const text = (min: number, max: number) =>
  z.string().refine(value => codePoints(value) >= min && codePoints(value) <= max, {
    message: min === max ? `must be ${min} characters` : `must be ${min} to ${max} characters`,
  })
const shortText = text(1, 200)
const line = text(1, 300)
const sha256 = z.string().regex(/^[a-f0-9]{64}$/, 'must be a 64-character lowercase hex hash')
const ticketId = z.string().regex(/^wf-[0-9a-f]{8}$/, 'must look like wf-0123abcd')

const TicketIdRefSchema = z.object({ id: ticketId }).strict()
const TicketPathRefSchema = z.object({ path: text(1, 512), content_sha256: sha256 }).strict()
const TicketFullRefSchema = z.object({ id: ticketId, path: text(1, 512), content_sha256: sha256 }).strict()
export const TicketRefSchema = z.union([TicketIdRefSchema, TicketPathRefSchema])
export const WriterOSDependencyRefSchema = z.object({
  writeros_record_id: z.string().regex(/^mem_[0-9a-f]{32}$/, 'must be a WriterOS memory record id'),
  content_hash: sha256,
}).strict()
export const DependencyRefSchema = z.union([TicketIdRefSchema, TicketPathRefSchema, TicketFullRefSchema, WriterOSDependencyRefSchema])
export type WriterOSDependencyRef = z.infer<typeof WriterOSDependencyRefSchema>
export type DependencyRef = z.infer<typeof DependencyRefSchema>

export const EntityIdSchema = z.string().regex(/^[a-z0-9-]+$/, 'must use lowercase letters, digits and hyphens').max(96)

const common = {
  version: z.enum(LOOK_SPEC_VERSIONS),
  entity_id: EntityIdSchema,
  source_ticket_ref: TicketRefSchema.optional(),
  fictional_subject_attestation: z.boolean(),
  minor: z.boolean(),
  prompt_safe_description: text(60, 800),
  continuity_risks: z.array(line).min(1).max(12),
  negative_lines: z.array(line).max(12),
  spoiler: z.boolean(),
  depends_on: z.array(DependencyRefSchema).max(24),
  shape_only: z.boolean(),
}

export const AGE_BANDS = ['child', 'teen', 'twenties', 'thirties', 'forties', 'fifties', 'sixties', 'seventies_plus', 'ageless'] as const
export const BUILD_KINDS = ['slight', 'lean', 'average', 'athletic', 'stocky', 'heavy', 'towering', 'diminutive'] as const
export const TIMES_OF_DAY = ['dawn', 'morning', 'midday', 'afternoon', 'golden_hour', 'dusk', 'night', 'variable'] as const

export const CharacterLookSpecSchema = z.object({
  ...common,
  entity_kind: z.literal('character'),
  age_band: z.enum(AGE_BANDS),
  build: z.object({ kind: z.enum(BUILD_KINDS), note: shortText.optional() }).strict(),
  hair: shortText,
  distinguishing_marks: z.array(line).max(8),
  default_wardrobe: z.object({ pieces: z.array(line).min(1).max(8) }).strict(),
  wardrobe_variants: z.array(z.object({ name: shortText, when: line }).strict()).max(6),
  props: z.array(line).max(6),
  era_and_class_signals: line,
  heritage_note: line.optional(),
}).strict()

export const LocationLookSpecSchema = z.object({
  ...common,
  entity_kind: z.literal('location'),
  establishing_view: line,
  time_of_day_default: z.enum(TIMES_OF_DAY),
  palette_anchors: z.array(shortText).min(3).max(4),
  architecture_or_terrain: line,
  dressing: z.array(line).max(10),
  weather_or_light_rules: line,
}).strict()

export const LookSpecSchema = z.discriminatedUnion('entity_kind', [CharacterLookSpecSchema, LocationLookSpecSchema])
export type CharacterLookSpec = z.infer<typeof CharacterLookSpecSchema>
export type LocationLookSpec = z.infer<typeof LocationLookSpecSchema>
export type LookSpec = z.infer<typeof LookSpecSchema>

export type LookSpecProblem = { path: string; message: string }

function formatPath(path: ReadonlyArray<string | number>): string {
  return path.reduce<string>((out, part) => (typeof part === 'number' ? `${out}[${part}]` : out ? `${out}.${part}` : part), '')
}

function issueMessage(issue: z.ZodIssue): string {
  switch (issue.code) {
    case 'invalid_union_discriminator':
      return 'must be character or location.'
    case 'invalid_enum_value':
      return `must be one of: ${issue.options.join(', ')}.`
    case 'invalid_literal':
      return `must be ${JSON.stringify(issue.expected)}.`
    case 'unrecognized_keys':
      return `is not a look field: ${issue.keys.join(', ')}.`
    case 'invalid_type':
      return issue.received === 'undefined' ? 'is required.' : `must be a ${issue.expected}, not a ${issue.received}.`
    case 'too_small':
      return issue.type === 'array' ? `needs at least ${issue.minimum} item${issue.minimum === 1 ? '' : 's'}.` : `${issue.message}.`
    case 'too_big':
      return issue.type === 'array' ? `allows at most ${issue.maximum} items.` : `${issue.message}.`
    case 'invalid_union':
      return 'is not a recognised reference form.'
    default:
      return issue.message.endsWith('.') ? issue.message : `${issue.message}.`
  }
}

// Python str.split(): runs of Python whitespace separate words.
const PY_WHITESPACE_RUN = new RegExp(`[${PY_WHITESPACE_CLASS}]+`, 'u')
export function pythonWordCount(value: string): number {
  return value.split(PY_WHITESPACE_RUN).filter(Boolean).length
}

// OpenMontage matches "@\w+" with Python's Unicode \w; JS \w is ASCII only.
// This extra pattern refuses "@émile" here too, so Promote never accepts a
// block OpenMontage's ingest would refuse.
const UNICODE_MENTION = /@[\p{L}\p{N}_]/u

function stringLeaves(value: unknown, path: Array<string | number>, out: Array<[string, string]>): void {
  if (typeof value === 'string') out.push([formatPath(path), value])
  else if (Array.isArray(value)) value.forEach((item, index) => stringLeaves(item, [...path, index], out))
  else if (value && typeof value === 'object') {
    for (const [key, member] of Object.entries(value)) stringLeaves(member, [...path, key], out)
  }
}

export function validateLookSpecForPromotion(
  spec: unknown,
): { ok: true; spec: LookSpec } | { ok: false; problems: LookSpecProblem[] } {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    return { ok: false, problems: [{ path: '', message: 'A look must be a set of named fields.' }] }
  }
  const problems: LookSpecProblem[] = []
  const parsed = LookSpecSchema.safeParse(spec)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = formatPath(issue.path)
      problems.push({ path, message: `${path || 'The look'} ${issueMessage(issue)}` })
    }
  }

  const raw = spec as Record<string, unknown>
  const description = raw.prompt_safe_description
  if (typeof description === 'string') {
    const words = pythonWordCount(description)
    if (words < DESCRIPTION_MIN_WORDS || words > DESCRIPTION_MAX_WORDS) {
      problems.push({
        path: 'prompt_safe_description',
        message: `The description must be ${DESCRIPTION_MIN_WORDS} to ${DESCRIPTION_MAX_WORDS} words; it has ${words}.`,
      })
    }
    if (codePoints(description) > DESCRIPTION_MAX_CHARS) {
      problems.push({
        path: 'prompt_safe_description',
        message: `The description must be at most ${DESCRIPTION_MAX_CHARS} characters; it has ${codePoints(description)}.`,
      })
    }
  }
  if (raw.fictional_subject_attestation === false) {
    problems.push({
      path: 'fictional_subject_attestation',
      message: 'You must confirm the subject is fictional and depicts no real person before promoting.',
    })
  }
  if (raw.minor === true) {
    problems.push({ path: 'minor', message: 'Looks for a minor cannot be promoted.' })
  }
  if (raw.age_band === 'child' || raw.age_band === 'teen') {
    problems.push({ path: 'age_band', message: 'A child or teen age band cannot be promoted.' })
  }

  const leaves: Array<[string, string]> = []
  stringLeaves(raw, [], leaves)
  for (const [path, value] of leaves) {
    const lines = value.replace(/\r\n?/g, '\n').split('\n')
    const injected = lines.find(candidate => {
      const folded = foldPythonCaseEquivalents(candidate)
      return IMPERATIVE_PATTERNS.some(pattern => pattern.test(folded)) || UNICODE_MENTION.test(candidate)
    })
    if (injected !== undefined) {
      problems.push({ path, message: `${path} reads like an instruction to the model ("${injected.slice(0, 80)}"); rephrase it as description.` })
    }
    const name = findRealPersonName(value)
    if (name !== undefined) {
      problems.push({ path, message: `${path} names what looks like a real person ("${name}"); describe the fictional subject in type terms instead.` })
    }
  }

  if (problems.length > 0 || !parsed.success) return { ok: false, problems }
  return { ok: true, spec: parsed.data }
}

/**
 * Reference-image firewall (look sessions plan, Global Constraints). When the
 * writer's reference is a real person (`casting-inspiration`), the block may
 * describe type only: no distinguishing marks and no facial vocabulary in the
 * free-text fields a generator reads.
 */
export const FACE_VOCABULARY = [
  'eye', 'eyes', 'nose', 'jaw', 'lips', 'mouth', 'cheek', 'cheekbones', 'chin', 'brow', 'eyebrow',
  'face', 'facial', 'smile', 'teeth', 'complexion', 'skin', 'freckle', 'scar on the face', 'dimple', 'wrinkle',
] as const
const FACE_WORD = new RegExp(
  `\\b(${FACE_VOCABULARY.map(word => word.replace(/ /g, '\\s+')).join('|')})(e?s)?\\b`,
  'i',
)
const FIREWALL_TEXT_FIELDS = ['prompt_safe_description', 'continuity_risks', 'negative_lines', 'props'] as const

export function findFirewallProblems(spec: unknown, reference: string): LookSpecProblem[] {
  if (reference !== 'casting-inspiration' || !spec || typeof spec !== 'object') return []
  const raw = spec as Record<string, unknown>
  const problems: LookSpecProblem[] = []
  if (Array.isArray(raw.distinguishing_marks) && raw.distinguishing_marks.length > 0) {
    problems.push({
      path: 'distinguishing_marks',
      message: 'With a real person as the reference, distinguishing marks must stay empty.',
    })
  }
  for (const field of FIREWALL_TEXT_FIELDS) {
    const leaves: Array<[string, string]> = []
    stringLeaves(raw[field], [field], leaves)
    for (const [path, value] of leaves) {
      const hit = FACE_WORD.exec(foldPythonCaseEquivalents(canonicalizeSpaces(value)))
      if (hit) {
        problems.push({
          path,
          message: `With a real person as the reference, describe type only; "${hit[0]}" describes the face.`,
        })
      }
    }
  }
  return problems
}

function canonicalizeSpaces(value: string): string {
  return value.replace(new RegExp(`[${PY_WHITESPACE_CLASS}]+`, 'gu'), ' ')
}
