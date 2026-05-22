import React from 'react'
import type {
  AuthoredDocumentState,
  TreatmentDocumentContent,
  TreatmentMainCharacter,
} from '@shared/documents'
import { normalizeProjectFormat, type ProjectFormat } from '@shared/projectFormat'
import { DocumentViewToggle } from '../shared/DocumentViewToggle'
import { ProjectFormatSelector } from '../shared/ProjectFormatSelector'
import { TreatmentDocumentView } from './treatment/TreatmentDocumentView'
import {
  TREATMENT_PASSAGE_TEMPLATES,
  createPassageSection,
  getPassagePlaceholder,
  type TreatmentPassageTemplate,
} from '../../lib/treatmentPassages'

interface TreatmentTabProps {
  document: AuthoredDocumentState<TreatmentDocumentContent>
  projectFormat?: ProjectFormat
  onProjectFormatChange?: (next: ProjectFormat) => void
  onContentChange: (updater: (content: TreatmentDocumentContent) => TreatmentDocumentContent) => void
  onViewPreferencesPatch?: (patch: { activeView?: 'edit' | 'document' }) => void
  onClear?: () => void
}

type ConceptField = keyof TreatmentDocumentContent['concept']
type ProseField = Exclude<keyof TreatmentDocumentContent['prose'], 'customSections'>
type VisualField = keyof TreatmentDocumentContent['visualAndTonal']
type QuestionField = keyof TreatmentDocumentContent['openQuestions']
type CharacterField = keyof TreatmentMainCharacter

const PROSE_FIELDS: Array<{ field: ProseField; question: string; helper: string }> = [
  {
    field: 'opening',
    question: 'How does the story open on screen?',
    helper: 'Establish the person, world, tone, and first disturbance in present tense.',
  },
  {
    field: 'actOne',
    question: 'What pulls them into the story?',
    helper: 'Tell the setup, first choices, conflict, and commitment into the story.',
  },
  {
    field: 'actTwo',
    question: 'How does the pressure build and turn?',
    helper: 'Follow escalation, reversals, discoveries, relationship pressure, and collapse.',
  },
  {
    field: 'actThree',
    question: 'How does it resolve?',
    helper: 'Tell the final plan, decisive choice, cost, resolution, and last image.',
  },
]

const VISUAL_FIELDS: Array<{ field: VisualField; label: string }> = [
  { field: 'overallTone', label: "What's the atmosphere from scene to scene?" },
  { field: 'visualWorld', label: 'What does the world look like?' },
  { field: 'recurringImagesOrMotifs', label: 'What images or motifs keep returning?' },
  { field: 'musicOrSoundFeeling', label: 'What should it sound like?' },
  { field: 'pacing', label: 'How should the story move?' },
  { field: 'genreRules', label: 'What genre promises or rules matter?' },
  { field: 'compsAndReferences', label: 'What does this remind people of?' },
]

const QUESTION_FIELDS: Array<{ field: QuestionField; label: string }> = [
  { field: 'story', label: 'Story decisions still needed' },
  { field: 'character', label: 'Character decisions still needed' },
  { field: 'worldOrMythology', label: 'World or mythology decisions still needed' },
  { field: 'production', label: 'Production decisions still needed' },
]

function linesToArray(value: string): string[] {
  return value
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
}

function arrayToLines(value: string[]): string {
  return value.join('\n')
}

function passageOptionLabel(template: TreatmentPassageTemplate): string {
  if (template.id === 'free') return template.label
  const name = template.specialist.charAt(0).toUpperCase() + template.specialist.slice(1)
  return `${template.label} · ${name} can help`
}

function createTreatmentCharacter(): TreatmentMainCharacter {
  return {
    id: crypto.randomUUID(),
    name: '',
    role: '',
    externalWant: '',
    internalNeed: '',
    flawOrWound: '',
    secretOrContradiction: '',
    arc: '',
    relationshipPressure: '',
  }
}

function hasTreatmentAnswers(content: TreatmentDocumentContent): boolean {
  return [
    content.logline,
    ...Object.values(content.concept),
    ...Object.values(content.prose).flatMap(value =>
      Array.isArray(value)
        ? value.flatMap(section => [section.heading, section.body])
        : [value],
    ),
    ...Object.values(content.visualAndTonal),
    ...Object.values(content.openQuestions).flat(),
    ...content.mainCharacters.flatMap(character => Object.values(character)),
  ].some(value => typeof value === 'string' && value.trim().length > 0)
}

export function TreatmentTab({
  document,
  projectFormat = 'feature',
  onProjectFormatChange,
  onContentChange,
  onViewPreferencesPatch,
  onClear,
}: TreatmentTabProps) {
  const content = document.content
  const activeView = document.viewPreferences?.activeView ?? 'edit'
  const activeFormat = normalizeProjectFormat(projectFormat)
  const canClear = hasTreatmentAnswers(content)
  const [collapsedIds, setCollapsedIds] = React.useState<Set<string>>(() => new Set())

  function toggleCollapsed(id: string) {
    setCollapsedIds(current => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function patchContent(patch: Partial<TreatmentDocumentContent>) {
    onContentChange(current => ({ ...current, ...patch }))
  }

  function setConceptField(field: ConceptField, value: string) {
    onContentChange(current => ({
      ...current,
      concept: { ...current.concept, [field]: value },
    }))
  }

  function setProseField(field: ProseField, value: string) {
    onContentChange(current => ({
      ...current,
      prose: { ...current.prose, [field]: value },
    }))
  }

  function setVisualField(field: VisualField, value: string) {
    onContentChange(current => ({
      ...current,
      visualAndTonal: { ...current.visualAndTonal, [field]: value },
    }))
  }

  function setQuestionField(field: QuestionField, value: string) {
    onContentChange(current => ({
      ...current,
      openQuestions: { ...current.openQuestions, [field]: linesToArray(value) },
    }))
  }

  function setCharacterField(id: string, field: CharacterField, value: string) {
    onContentChange(current => ({
      ...current,
      mainCharacters: current.mainCharacters.map(character =>
        character.id === id ? { ...character, [field]: value } : character,
      ),
    }))
  }

  function addCharacter() {
    onContentChange(current => ({
      ...current,
      mainCharacters: [...current.mainCharacters, createTreatmentCharacter()],
    }))
  }

  function removeCharacter(id: string) {
    const character = content.mainCharacters.find(item => item.id === id)
    if (!character) return
    const hasText = Object.entries(character).some(
      ([key, value]) => key !== 'id' && typeof value === 'string' && value.trim().length > 0,
    )
    if (hasText && !window.confirm('Remove this character? Their details will be deleted.')) {
      return
    }
    onContentChange(current => ({
      ...current,
      mainCharacters: current.mainCharacters.filter(item => item.id !== id),
    }))
  }

  function setCustomSection(id: string, patch: { heading?: string; body?: string }) {
    onContentChange(current => ({
      ...current,
      prose: {
        ...current.prose,
        customSections: current.prose.customSections.map(section =>
          section.id === id ? { ...section, ...patch } : section,
        ),
      },
    }))
  }

  function addPassage(template: TreatmentPassageTemplate) {
    onContentChange(current => ({
      ...current,
      prose: {
        ...current.prose,
        customSections: [...current.prose.customSections, createPassageSection(template)],
      },
    }))
  }

  function removePassage(id: string) {
    const section = content.prose.customSections.find(item => item.id === id)
    if (!section) return
    if (section.body.trim().length > 0 && !window.confirm('Remove this passage? Its text will be deleted.')) {
      return
    }
    onContentChange(current => ({
      ...current,
      prose: {
        ...current.prose,
        customSections: current.prose.customSections.filter(item => item.id !== id),
      },
    }))
  }

  function handleClear() {
    if (!onClear) return
    const confirmed = window.confirm('Clear this treatment? This keeps the rest of the project intact.')
    if (confirmed) onClear()
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Treatment</h2>
          <p style={styles.subtitle}>Tell the story in cinematic prose before pages lock it in.</p>
        </div>
        <div style={styles.titleControls}>
          <ProjectFormatSelector
            value={activeFormat}
            onChange={(next) => onProjectFormatChange?.(next)}
            variant="standalone"
          />
          <DocumentViewToggle
            value={activeView}
            onChange={(next) => onViewPreferencesPatch?.({ activeView: next })}
          />
          {onClear && activeView === 'edit' && (
            <button
              type="button"
              style={{
                ...styles.clearButton,
                ...(!canClear ? styles.clearButtonDisabled : {}),
              }}
              onClick={handleClear}
              disabled={!canClear}
            >
              Clear treatment
            </button>
          )}
        </div>
      </div>

      {activeView === 'edit' ? (
        <>
          <section style={styles.card}>
            <label style={styles.question} htmlFor="treatment-logline">What is the story in one sentence?</label>
            <p style={styles.helper}>Protagonist, goal, pressure, stakes, and hook.</p>
            <textarea
              id="treatment-logline"
              value={content.logline}
              onChange={(event) => patchContent({ logline: event.target.value })}
              style={styles.textarea}
              rows={3}
            />
          </section>

          <section style={styles.card}>
            <h3 style={styles.sectionTitle}>The promise</h3>
            <LabeledTextarea
              label="What is the premise?"
              value={content.concept.premise}
              onChange={(value) => setConceptField('premise', value)}
            />
            <LabeledTextarea
              label="What kind of story is this?"
              value={content.concept.tone}
              onChange={(value) => setConceptField('tone', value)}
            />
            <LabeledTextarea
              label="What truth is underneath it?"
              value={content.concept.theme}
              onChange={(value) => setConceptField('theme', value)}
            />
            <LabeledTextarea
              label="What should the audience feel by the end?"
              value={content.concept.emotionalPromise}
              onChange={(value) => setConceptField('emotionalPromise', value)}
            />
          </section>

          <section style={styles.card}>
            <div style={styles.sectionHeader}>
              <h3 style={styles.sectionTitle}>Who carries it</h3>
              <button type="button" style={styles.addButton} onClick={addCharacter}>
                Add character
              </button>
            </div>
            {content.mainCharacters.length === 0 ? (
              <p style={styles.emptyText}>No treatment characters yet.</p>
            ) : (
              content.mainCharacters.map(character => (
                <div key={character.id} style={styles.characterBlock}>
                  <div style={styles.headingRow}>
                    <input
                      aria-label="Character name"
                      value={character.name}
                      onChange={(event) => setCharacterField(character.id, 'name', event.target.value)}
                      style={{ ...styles.input, flex: 1 }}
                      placeholder="Character name"
                    />
                    <button
                      type="button"
                      aria-label="Remove character"
                      style={styles.removeButton}
                      onClick={() => removeCharacter(character.id)}
                    >
                      Remove
                    </button>
                  </div>
                  <div style={styles.grid}>
                    <LabeledInput
                      label="Role"
                      value={character.role}
                      onChange={(value) => setCharacterField(character.id, 'role', value)}
                    />
                    <LabeledInput
                      label="What they want"
                      value={character.externalWant}
                      onChange={(value) => setCharacterField(character.id, 'externalWant', value)}
                    />
                    <LabeledInput
                      label="What they need"
                      value={character.internalNeed}
                      onChange={(value) => setCharacterField(character.id, 'internalNeed', value)}
                    />
                    <LabeledInput
                      label="How they change"
                      value={character.arc}
                      onChange={(value) => setCharacterField(character.id, 'arc', value)}
                    />
                  </div>
                </div>
              ))
            )}
          </section>

          <section style={styles.stack}>
            {PROSE_FIELDS.map(item => {
              const collapsed = collapsedIds.has(item.field)
              return (
                <article key={item.field} style={styles.card}>
                  <div style={styles.headingRow}>
                    <label style={{ ...styles.question, flex: 1 }} htmlFor={`treatment-${item.field}`}>
                      {item.question}
                    </label>
                    <button
                      type="button"
                      style={styles.collapseButton}
                      aria-label={collapsed ? 'Expand' : 'Collapse'}
                      aria-expanded={!collapsed}
                      onClick={() => toggleCollapsed(item.field)}
                    >
                      {collapsed ? 'Expand' : 'Collapse'}
                    </button>
                  </div>
                  {!collapsed && (
                    <>
                      <p style={styles.helper}>{item.helper}</p>
                      <textarea
                        id={`treatment-${item.field}`}
                        value={content.prose[item.field]}
                        onChange={(event) => setProseField(item.field, event.target.value)}
                        style={styles.longTextarea}
                        rows={8}
                      />
                    </>
                  )}
                </article>
              )
            })}
          </section>

          <section style={styles.card}>
            <div style={styles.sectionHeader}>
              <h3 style={styles.sectionTitle}>Story passages</h3>
              <select
                aria-label="Add a passage"
                value=""
                onChange={(event) => {
                  const template = TREATMENT_PASSAGE_TEMPLATES.find(
                    item => item.id === event.target.value,
                  )
                  if (template) addPassage(template)
                }}
                style={styles.picker}
              >
                <option value="">Add a passage…</option>
                {TREATMENT_PASSAGE_TEMPLATES.map(template => (
                  <option key={template.id} value={template.id}>
                    {passageOptionLabel(template)}
                  </option>
                ))}
              </select>
            </div>
            <p style={styles.helper}>
              Add focused passages beyond the main flow above — a character&apos;s journey, a place, a
              major turn.
            </p>
            {content.prose.customSections.length === 0 ? (
              <p style={styles.emptyText}>No story passages yet.</p>
            ) : (
              content.prose.customSections.map(section => {
                const collapsed = collapsedIds.has(section.id)
                return (
                  <div key={section.id} style={styles.customSection}>
                    <div style={styles.headingRow}>
                      <input
                        aria-label="Passage heading"
                        value={section.heading}
                        onChange={(event) => setCustomSection(section.id, { heading: event.target.value })}
                        style={{ ...styles.input, flex: 1 }}
                      />
                      <button
                        type="button"
                        style={styles.collapseButton}
                        aria-label={collapsed ? 'Expand' : 'Collapse'}
                        aria-expanded={!collapsed}
                        onClick={() => toggleCollapsed(section.id)}
                      >
                        {collapsed ? 'Expand' : 'Collapse'}
                      </button>
                      <button
                        type="button"
                        aria-label="Remove passage"
                        style={styles.removeButton}
                        onClick={() => removePassage(section.id)}
                      >
                        Remove
                      </button>
                    </div>
                    {!collapsed && (
                      <textarea
                        aria-label="Passage body"
                        value={section.body}
                        onChange={(event) => setCustomSection(section.id, { body: event.target.value })}
                        placeholder={getPassagePlaceholder(section.heading)}
                        style={styles.textarea}
                        rows={5}
                      />
                    )}
                  </div>
                )
              })
            )}
          </section>

          <section style={styles.card}>
            <h3 style={styles.sectionTitle}>Texture</h3>
            <div style={styles.grid}>
              {VISUAL_FIELDS.map(item => (
                <LabeledTextarea
                  key={item.field}
                  label={item.label}
                  value={content.visualAndTonal[item.field]}
                  onChange={(value) => setVisualField(item.field, value)}
                  rows={3}
                />
              ))}
            </div>
          </section>

          <section style={styles.card}>
            <h3 style={styles.sectionTitle}>Open questions</h3>
            <div style={styles.grid}>
              {QUESTION_FIELDS.map(item => (
                <LabeledTextarea
                  key={item.field}
                  label={item.label}
                  value={arrayToLines(content.openQuestions[item.field])}
                  onChange={(value) => setQuestionField(item.field, value)}
                  rows={3}
                />
              ))}
            </div>
          </section>
        </>
      ) : (
        <TreatmentDocumentView
          content={content}
          projectFormat={activeFormat}
          updatedAt={document.updatedAt}
        />
      )}
    </div>
  )
}

function LabeledInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label style={styles.field}>
      <span style={styles.fieldLabel}>{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={styles.input}
      />
    </label>
  )
}

function LabeledTextarea({
  label,
  value,
  onChange,
  rows = 4,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  rows?: number
}) {
  return (
    <label style={styles.field}>
      <span style={styles.fieldLabel}>{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={styles.textarea}
        rows={rows}
      />
    </label>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 860,
    margin: '0 auto',
    padding: '32px 24px 64px',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
    marginBottom: 12,
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: 24,
    color: 'var(--fg)',
    margin: 0,
  },
  subtitle: {
    fontFamily: 'var(--font-body)',
    fontSize: 13,
    color: 'var(--fg-muted)',
    fontStyle: 'italic',
    margin: '4px 0 0',
  },
  titleControls: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    flexWrap: 'wrap',
  },
  card: {
    border: '1px solid var(--border)',
    borderRadius: 8,
    background: 'var(--surface)',
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  question: {
    display: 'block',
    fontFamily: 'var(--font-display)',
    fontSize: 18,
    fontWeight: 600,
    color: 'var(--fg)',
    lineHeight: 1.25,
  },
  helper: {
    fontFamily: 'var(--font-body)',
    fontSize: 13,
    color: 'var(--fg-muted)',
    lineHeight: 1.45,
    margin: '-6px 0 0',
  },
  sectionTitle: {
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
    fontWeight: 700,
    color: 'var(--fg-muted)',
    textTransform: 'uppercase',
    letterSpacing: 0,
    margin: 0,
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  fieldLabel: {
    fontFamily: 'var(--font-body)',
    fontSize: 13,
    color: 'var(--fg-muted)',
    lineHeight: 1.35,
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    border: '1px solid var(--border)',
    borderRadius: 8,
    background: 'var(--surface-2)',
    color: 'var(--fg)',
    fontFamily: 'var(--font-body)',
    fontSize: 14,
    padding: '9px 10px',
    outline: 'none',
  },
  textarea: {
    width: '100%',
    boxSizing: 'border-box',
    resize: 'vertical',
    minHeight: 86,
    border: '1px solid var(--border)',
    borderRadius: 8,
    background: 'var(--surface-2)',
    color: 'var(--fg)',
    fontFamily: 'var(--font-body)',
    fontSize: 14,
    lineHeight: 1.45,
    padding: '9px 10px',
    outline: 'none',
  },
  longTextarea: {
    width: '100%',
    boxSizing: 'border-box',
    resize: 'vertical',
    minHeight: 180,
    border: '1px solid var(--border)',
    borderRadius: 8,
    background: 'var(--surface-2)',
    color: 'var(--fg)',
    fontFamily: 'var(--font-body)',
    fontSize: 14,
    lineHeight: 1.55,
    padding: '10px 12px',
    outline: 'none',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 12,
  },
  characterBlock: {
    borderTop: '1px solid var(--border)',
    paddingTop: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  customSection: {
    borderTop: '1px solid var(--border)',
    paddingTop: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  addButton: {
    border: '1px solid var(--border)',
    borderRadius: 8,
    background: 'var(--surface-2)',
    color: 'var(--fg)',
    fontFamily: 'var(--font-body)',
    fontSize: 13,
    fontWeight: 600,
    padding: '8px 10px',
    cursor: 'pointer',
  },
  picker: {
    border: '1px solid var(--border)',
    borderRadius: 8,
    background: 'var(--surface-2)',
    color: 'var(--fg)',
    fontFamily: 'var(--font-body)',
    fontSize: 13,
    fontWeight: 600,
    padding: '8px 10px',
    cursor: 'pointer',
  },
  removeButton: {
    border: '1px solid var(--border)',
    borderRadius: 8,
    background: 'transparent',
    color: 'var(--fg-muted)',
    fontFamily: 'var(--font-body)',
    fontSize: 12,
    fontWeight: 600,
    padding: '6px 9px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  headingRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  collapseButton: {
    border: 'none',
    background: 'transparent',
    color: 'var(--fg-muted)',
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
    fontWeight: 700,
    padding: '2px 6px',
    cursor: 'pointer',
  },
  clearButton: {
    border: '1px solid var(--border)',
    borderRadius: 8,
    background: 'var(--surface-2)',
    color: 'var(--fg-muted)',
    fontFamily: 'var(--font-body)',
    fontSize: 12,
    fontWeight: 600,
    padding: '7px 10px',
    cursor: 'pointer',
  },
  clearButtonDisabled: {
    opacity: 0.45,
    cursor: 'not-allowed',
  },
  emptyText: {
    fontFamily: 'var(--font-body)',
    fontSize: 13,
    color: 'var(--fg-muted)',
    margin: 0,
  },
}
