import React, { useEffect, useState } from 'react'
import { AGE_BANDS, BUILD_KINDS, TIMES_OF_DAY, pythonWordCount, type LookSpecProblem } from '@shared/lookSpec'
import type { LookDraft } from '@shared/looks'

// The look form (look sessions plan, Task 6). Every control writes only what
// the writer typed or chose; a Zoe reply never reaches this component.

export interface LookDraftFormProps {
  draft: LookDraft
  problems: LookSpecProblem[]
  onField: (field: string, value: unknown) => void
  onClear: (field: string) => void
  onReference: (reference: LookDraft['reference']) => void
  disabled?: boolean
}

export const LOOK_FIELD_LABELS: Record<string, string> = {
  entity_id: 'Look id',
  prompt_safe_description: 'Description',
  age_band: 'Age band',
  build: 'Build',
  hair: 'Hair',
  distinguishing_marks: 'Distinguishing marks',
  default_wardrobe: 'Default wardrobe',
  wardrobe_variants: 'Wardrobe variants',
  props: 'Props',
  era_and_class_signals: 'Era and class signals',
  heritage_note: 'Heritage note',
  establishing_view: 'Establishing view',
  time_of_day_default: 'Time of day',
  palette_anchors: 'Palette anchors',
  architecture_or_terrain: 'Architecture or terrain',
  dressing: 'Dressing',
  weather_or_light_rules: 'Weather and light rules',
  continuity_risks: 'Continuity risks',
  negative_lines: 'Never show',
  shape_only: 'Shape only',
  fictional_subject_attestation: 'Fictional subject',
  minor: 'Minor',
  spoiler: 'Spoiler',
}

const REFERENCE_OPTIONS: Array<{ value: Exclude<LookDraft['reference'], 'unasked'>; label: string }> = [
  { value: 'none', label: 'No reference image' },
  { value: 'generated-elsewhere', label: 'Generated elsewhere' },
  { value: 'casting-inspiration', label: 'A real person (casting inspiration)' },
]

/**
 * A problem in the writer's words: the field's label instead of its key. A
 * missing field is not shown under the field at all; the Promote area lists
 * what is still to fill.
 */
export function friendlyProblem(problem: LookSpecProblem): string {
  const root = problem.path.split(/[.[]/)[0]
  const label = LOOK_FIELD_LABELS[root]
  if (!label || !problem.message.startsWith(problem.path)) return problem.message
  return `${label}${problem.message.slice(problem.path.length)}`
}

export function isMissingField(problem: LookSpecProblem): boolean {
  return / is required\.$/.test(problem.message)
}

const humanize = (value: string) => value.replace(/_/g, ' ').replace(/^\w/, ch => ch.toUpperCase())

function useListText(values: unknown, toText: (items: unknown[]) => string) {
  const external = Array.isArray(values) ? toText(values) : ''
  const [text, setText] = useState(external)
  useEffect(() => {
    // Keep a trailing newline the writer is typing; resync only when the stored list really changed.
    setText(current => (current.replace(/\n+$/, '') === external ? current : external))
  }, [external])
  return [text, setText] as const
}

function FieldShell({ id, label, hint, problem, children }: { id: string; label: string; hint?: string; problem?: string; children: React.ReactNode }) {
  return (
    <div style={styles.field}>
      <label htmlFor={id} style={styles.label}>{label}</label>
      {children}
      {hint && !problem && <p style={styles.hint}>{hint}</p>}
      {problem && <p style={styles.fieldProblem}>{problem}</p>}
    </div>
  )
}

export function LookDraftForm({ draft, problems, onField, onClear, onReference, disabled }: LookDraftFormProps) {
  const spec = draft.spec
  const isCharacter = draft.entityKind === 'character'
  const casting = draft.reference === 'casting-inspiration'
  const problemFor = (field: string) => {
    const problem = problems.find(p => !isMissingField(p) && (p.path === field || p.path.startsWith(`${field}.`) || p.path.startsWith(`${field}[`)))
    return problem ? friendlyProblem(problem) : undefined
  }
  const fid = (field: string) => `look-${draft.entityKind}-${field}`

  const text = (field: string, label: string, hint?: string, multiline = false) => {
    const value = typeof spec[field] === 'string' ? (spec[field] as string) : ''
    const onChange = (next: string) => (next === '' ? onClear(field) : onField(field, next))
    return (
      <FieldShell id={fid(field)} label={label} hint={hint} problem={problemFor(field)}>
        {multiline ? (
          <textarea id={fid(field)} style={styles.textarea} rows={3} value={value} disabled={disabled}
            onChange={event => onChange(event.target.value)} />
        ) : (
          <input id={fid(field)} style={styles.input} value={value} disabled={disabled}
            onChange={event => onChange(event.target.value)} />
        )}
      </FieldShell>
    )
  }

  const select = (field: string, label: string, options: readonly string[]) => (
    <FieldShell id={fid(field)} label={label} problem={problemFor(field)}>
      <select id={fid(field)} style={styles.input} disabled={disabled}
        value={typeof spec[field] === 'string' ? (spec[field] as string) : ''}
        onChange={event => (event.target.value === '' ? onClear(field) : onField(field, event.target.value))}>
        <option value="">Choose…</option>
        {options.map(option => <option key={option} value={option}>{humanize(option)}</option>)}
      </select>
    </FieldShell>
  )

  const yesNo = (field: string, question: string) => {
    const value = spec[field]
    return (
      <fieldset style={styles.fieldset}>
        <legend style={styles.label}>{question}</legend>
        <div style={styles.segmented}>
          {([true, false] as const).map(choice => (
            <button key={String(choice)} type="button" disabled={disabled}
              aria-pressed={value === choice}
              style={{ ...styles.segment, ...(value === choice ? styles.segmentOn : {}) }}
              onClick={() => onField(field, choice)}>
              {choice ? 'Yes' : 'No'}
            </button>
          ))}
        </div>
        {problemFor(field) && <p style={styles.fieldProblem}>{problemFor(field)}</p>}
      </fieldset>
    )
  }

  return (
    <div style={styles.form}>
      <fieldset style={styles.fieldset}>
        <legend style={styles.label}>Do you have a reference image for this {draft.entityKind}?</legend>
        <div style={styles.segmented}>
          {REFERENCE_OPTIONS.map(option => (
            <button key={option.value} type="button" disabled={disabled}
              aria-pressed={draft.reference === option.value}
              style={{ ...styles.segment, ...(draft.reference === option.value ? styles.segmentOn : {}) }}
              onClick={() => onReference(option.value)}>
              {option.label}
            </button>
          ))}
        </div>
        <p style={styles.hint}>WriterOS never receives the image; only your answer is recorded.</p>
        {casting && (
          <p style={styles.firewall} role="note">
            The reference is a real person, so this look describes type only: no face, no distinguishing marks.
            The face stays with the casting reference.
          </p>
        )}
      </fieldset>

      {text('entity_id', 'Look id', 'Lowercase letters, digits and hyphens. OpenMontage keys the look on this.')}
      <DescriptionField id={fid('prompt_safe_description')} value={typeof spec.prompt_safe_description === 'string' ? spec.prompt_safe_description : ''}
        problem={problemFor('prompt_safe_description')} disabled={disabled}
        onChange={next => (next === '' ? onClear('prompt_safe_description') : onField('prompt_safe_description', next))} />

      {isCharacter ? (
        <>
          <div style={styles.row}>
            {select('age_band', 'Age band', AGE_BANDS)}
            <BuildField id={fid('build')} value={spec.build} problem={problemFor('build')} disabled={disabled}
              onChange={next => (next ? onField('build', next) : onClear('build'))} />
          </div>
          {text('hair', casting ? 'Hair, as a category' : 'Hair')}
          {casting ? (
            <NoneOnly id={fid('distinguishing_marks')} label="Distinguishing marks" value={spec.distinguishing_marks}
              note="None with a real-person reference." problem={problemFor('distinguishing_marks')} disabled={disabled}
              onNone={() => onField('distinguishing_marks', [])} />
          ) : (
            <ListField id={fid('distinguishing_marks')} label="Distinguishing marks" value={spec.distinguishing_marks}
              allowNone problem={problemFor('distinguishing_marks')} disabled={disabled}
              onChange={items => (items === null ? onClear('distinguishing_marks') : onField('distinguishing_marks', items))} />
          )}
          <ListField id={fid('default_wardrobe')} label="Default wardrobe" hint="One piece per line."
            value={(spec.default_wardrobe as { pieces?: unknown } | undefined)?.pieces} problem={problemFor('default_wardrobe')} disabled={disabled}
            onChange={items => (items === null || items.length === 0 ? onClear('default_wardrobe') : onField('default_wardrobe', { pieces: items }))} />
          <VariantsField id={fid('wardrobe_variants')} value={spec.wardrobe_variants} problem={problemFor('wardrobe_variants')} disabled={disabled}
            onChange={items => (items === null ? onClear('wardrobe_variants') : onField('wardrobe_variants', items))} />
          <ListField id={fid('props')} label="Props" value={spec.props} allowNone problem={problemFor('props')} disabled={disabled}
            onChange={items => (items === null ? onClear('props') : onField('props', items))} />
          {text('era_and_class_signals', 'Era and class signals')}
          {text('heritage_note', 'Heritage note (optional)', "Yours to state if you want it. Zoe won't ask.")}
        </>
      ) : (
        <>
          {text('establishing_view', 'Establishing view')}
          <div style={styles.row}>{select('time_of_day_default', 'Time of day', TIMES_OF_DAY)}</div>
          <ListField id={fid('palette_anchors')} label="Palette anchors" hint="Three or four, one per line."
            value={spec.palette_anchors} problem={problemFor('palette_anchors')} disabled={disabled}
            onChange={items => (items === null || items.length === 0 ? onClear('palette_anchors') : onField('palette_anchors', items))} />
          {text('architecture_or_terrain', 'Architecture or terrain')}
          <ListField id={fid('dressing')} label="Dressing" value={spec.dressing} allowNone problem={problemFor('dressing')} disabled={disabled}
            onChange={items => (items === null ? onClear('dressing') : onField('dressing', items))} />
          {text('weather_or_light_rules', 'Weather and light rules')}
        </>
      )}

      <ListField id={fid('continuity_risks')} label="Continuity risks" hint="What could drift between shots. At least one."
        value={spec.continuity_risks} problem={problemFor('continuity_risks')} disabled={disabled}
        onChange={items => (items === null || items.length === 0 ? onClear('continuity_risks') : onField('continuity_risks', items))} />
      <ListField id={fid('negative_lines')} label="Never show" value={spec.negative_lines} allowNone problem={problemFor('negative_lines')} disabled={disabled}
        onChange={items => (items === null ? onClear('negative_lines') : onField('negative_lines', items))} />

      <div style={styles.questions}>
        {yesNo('fictional_subject_attestation', 'Is this subject fictional, with no real person depicted or intended?')}
        {yesNo('minor', 'Does this look depict a minor?')}
        {yesNo('spoiler', 'Is this look a spoiler?')}
        {yesNo('shape_only', 'Shape only: direction locked, details still open?')}
      </div>
    </div>
  )
}

function DescriptionField({ id, value, problem, disabled, onChange }: { id: string; value: string; problem?: string; disabled?: boolean; onChange: (next: string) => void }) {
  const words = value ? pythonWordCount(value) : 0
  const chars = [...value].length
  const over = words > 80 || chars > 600
  // Too short is normal while typing: the counter shows it and the Promote area lists it.
  // Only going over a limit is flagged at the field.
  return (
    <FieldShell id={id} label="Description" problem={words < 20 && !over ? undefined : problem}>
      <textarea id={id} style={{ ...styles.textarea, minHeight: 96 }} rows={4} value={value} disabled={disabled}
        onChange={event => onChange(event.target.value)} />
      <p style={{ ...styles.hint, color: over ? 'var(--danger, #b3261e)' : 'var(--fg-muted)' }}>
        <span style={styles.tabular}>{words}</span> words of 20 to 80 · <span style={styles.tabular}>{chars}</span> of 600 characters · present tense; this is what a generator reads.
      </p>
    </FieldShell>
  )
}

function BuildField({ id, value, problem, disabled, onChange }: { id: string; value: unknown; problem?: string; disabled?: boolean; onChange: (next: { kind: string; note?: string } | null) => void }) {
  const build = (value && typeof value === 'object' ? value : {}) as { kind?: string; note?: string }
  const update = (kind: string | undefined, note: string | undefined) => {
    if (!kind && !note) return onChange(null)
    onChange({ kind: kind ?? '', ...(note ? { note } : {}) })
  }
  return (
    <FieldShell id={id} label="Build" problem={problem}>
      <div style={styles.inlinePair}>
        <select id={id} style={styles.input} disabled={disabled} value={build.kind ?? ''}
          onChange={event => update(event.target.value || undefined, build.note)}>
          <option value="">Choose…</option>
          {BUILD_KINDS.map(kind => <option key={kind} value={kind}>{humanize(kind)}</option>)}
        </select>
        <input aria-label="Build note" placeholder="Note (optional)" style={styles.input} disabled={disabled} value={build.note ?? ''}
          onChange={event => update(build.kind, event.target.value || undefined)} />
      </div>
    </FieldShell>
  )
}

function ListField({ id, label, hint, value, allowNone, problem, disabled, onChange }: {
  id: string; label: string; hint?: string; value: unknown; allowNone?: boolean; problem?: string; disabled?: boolean
  onChange: (items: string[] | null) => void
}) {
  const [text, setText] = useListText(value, items => items.map(String).join('\n'))
  const isNone = allowNone && Array.isArray(value) && value.length === 0
  return (
    <FieldShell id={id} label={label} hint={hint ?? 'One per line.'} problem={problem}>
      <textarea id={id} style={styles.textarea} rows={3} value={text} disabled={disabled || isNone}
        onChange={event => {
          setText(event.target.value)
          const items = event.target.value.split('\n').map(line => line.trim()).filter(Boolean)
          onChange(items.length > 0 ? items : null)
        }} />
      {allowNone && (
        <label style={styles.noneToggle}>
          <input type="checkbox" checked={!!isNone} disabled={disabled}
            onChange={event => { setText(''); onChange(event.target.checked ? [] : null) }} />
          None
        </label>
      )}
    </FieldShell>
  )
}

function NoneOnly({ id, label, value, note, problem, disabled, onNone }: { id: string; label: string; value: unknown; note: string; problem?: string; disabled?: boolean; onNone: () => void }) {
  const confirmed = Array.isArray(value) && value.length === 0
  return (
    <FieldShell id={id} label={label} problem={problem}>
      <label style={styles.noneToggle}>
        <input id={id} type="checkbox" checked={confirmed} disabled={disabled || confirmed} onChange={onNone} />
        {note}
      </label>
    </FieldShell>
  )
}

function VariantsField({ id, value, problem, disabled, onChange }: { id: string; value: unknown; problem?: string; disabled?: boolean; onChange: (items: Array<{ name: string; when: string }> | null) => void }) {
  const [text, setText] = useListText(value, items => items.map(item => {
    const v = item as { name?: string; when?: string }
    return `${v.name ?? ''}: ${v.when ?? ''}`
  }).join('\n'))
  const isNone = Array.isArray(value) && value.length === 0
  return (
    <FieldShell id={id} label="Wardrobe variants" hint="One per line, as name: when it is worn." problem={problem}>
      <textarea id={id} style={styles.textarea} rows={2} value={text} disabled={disabled || isNone}
        onChange={event => {
          setText(event.target.value)
          const items = event.target.value.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
            const at = line.indexOf(':')
            return at < 0 ? { name: line, when: '' } : { name: line.slice(0, at).trim(), when: line.slice(at + 1).trim() }
          })
          onChange(items.length > 0 ? items : null)
        }} />
      <label style={styles.noneToggle}>
        <input type="checkbox" checked={isNone} disabled={disabled}
          onChange={event => { setText(''); onChange(event.target.checked ? [] : null) }} />
        None
      </label>
    </FieldShell>
  )
}

const styles: Record<string, React.CSSProperties> = {
  form: { display: 'flex', flexDirection: 'column', gap: 18 },
  field: { display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, flex: 1 },
  fieldset: { border: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 },
  label: { fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, color: 'var(--fg)', padding: 0 },
  hint: { fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--fg-muted)', margin: 0, lineHeight: 1.45 },
  fieldProblem: { fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--danger, #b3261e)', margin: 0, lineHeight: 1.45 },
  input: {
    fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--fg)', background: 'var(--surface-2)',
    border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', minWidth: 0, width: '100%', boxSizing: 'border-box',
  },
  textarea: {
    fontFamily: 'var(--font-body)', fontSize: 14, lineHeight: 1.5, color: 'var(--fg)', background: 'var(--surface-2)',
    border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', resize: 'vertical', width: '100%', boxSizing: 'border-box',
  },
  row: { display: 'flex', gap: 12, flexWrap: 'wrap' },
  inlinePair: { display: 'flex', gap: 8 },
  segmented: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  segment: {
    fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--fg-muted)', background: 'var(--surface-2)',
    border: '1px solid var(--border)', borderRadius: 999, padding: '6px 12px', cursor: 'pointer',
  },
  segmentOn: { color: 'var(--fg)', borderColor: 'var(--wp-amber)', background: 'color-mix(in srgb, var(--wp-amber) 14%, var(--surface-2))' },
  firewall: {
    fontFamily: 'var(--font-body)', fontSize: 13, lineHeight: 1.5, color: 'var(--fg)', margin: 0,
    padding: '10px 12px', borderRadius: 8, background: 'color-mix(in srgb, var(--wp-amber) 10%, transparent)',
    border: '1px solid color-mix(in srgb, var(--wp-amber) 40%, var(--border))',
  },
  questions: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 },
  noneToggle: { display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--fg-muted)' },
  tabular: { fontVariantNumeric: 'tabular-nums' },
}
