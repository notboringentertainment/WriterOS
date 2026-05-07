import React from 'react'
import { CharacterCard } from '../shared/CharacterCard'
import { GuidedSection } from '../shared/GuidedSection'
import type { StoryBibleSection } from '../../lib/shellState'

interface Character {
  id: string
  name: string
  role: string
  wound: string
  want: string
  need: string
  arc: string
}

interface WorldData {
  setting: string
  toneAnchors: string
  voiceNotes: string
}

interface StoryBibleData {
  characters: Character[]
  world: WorldData
  themes: string
  rules: string
}

interface StoryBibleTabProps {
  storyBible: StoryBibleData
  onAddCharacter: (character: Omit<Character, 'id'>) => void
  onUpdateCharacter: (id: string, patch: Partial<Character>) => void
  onSetWorld: (patch: Partial<WorldData>) => void
  onSetThemes: (value: string) => void
  onSetRules: (value: string) => void
  onSectionChange?: (section: StoryBibleSection) => void
}

export function StoryBibleTab({ storyBible, onAddCharacter, onUpdateCharacter, onSetWorld, onSetThemes, onSetRules, onSectionChange }: StoryBibleTabProps) {
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>Story Bible</h2>
        <p style={styles.subtitle}>
          A reference home for identity, continuity, tone, and rules. @Casey helps with characters, theme, and voice; @Zoe helps with world logic and constraints.
        </p>
      </div>

      {/* Characters */}
      <section style={styles.section} onFocusCapture={() => onSectionChange?.('characters')}>
        <div style={styles.sectionHeader} onClick={() => onSectionChange?.('characters')}>
          <h3 style={styles.sectionTitle}>Characters</h3>
          <p style={styles.sectionHint}>Wound, Want, Need, Arc</p>
          <span style={styles.routeChip} title="Default specialist: Casey">Casey</span>
          <button
            style={styles.addBtn}
            onClick={() => onAddCharacter({ name: 'New Character', role: '', wound: '', want: '', need: '', arc: '' })}
          >
            + Add Character
          </button>
        </div>
        <div style={styles.cards}>
          {storyBible.characters.map(char => (
            <CharacterCard key={char.id} character={char} onUpdate={onUpdateCharacter} />
          ))}
        </div>
      </section>

      {/* World */}
      <section style={styles.section} onFocusCapture={() => onSectionChange?.('world')}>
        <div style={styles.sectionHeader} onClick={() => onSectionChange?.('world')}>
          <h3 style={styles.sectionTitle}>World</h3>
          <p style={styles.sectionHint}>Setting and tone anchors</p>
          <span style={styles.routeChip} title="Default specialist: Zoe">Zoe</span>
        </div>
        <GuidedSection
          label="Setting"
          guidance="Where and when does this story take place? What makes this world distinct?"
          value={storyBible.world.setting}
          onChange={v => onSetWorld({ setting: v })}
        />
        <GuidedSection
          label="Tone Anchors"
          guidance="2–4 comparable works that capture the tone. e.g. 'Chinatown meets No Country for Old Men.'"
          value={storyBible.world.toneAnchors}
          onChange={v => onSetWorld({ toneAnchors: v })}
        />
      </section>

      {/* Themes */}
      <section style={styles.section} onFocusCapture={() => onSectionChange?.('themes')}>
        <div style={styles.sectionHeader} onClick={() => onSectionChange?.('themes')}>
          <h3 style={styles.sectionTitle}>Themes</h3>
          <p style={styles.sectionHint}>What is this story really about?</p>
          <span style={styles.routeChip} title="Default specialist: Casey">Casey</span>
        </div>
        <GuidedSection
          label="Central Theme"
          guidance="One sentence. What truth does this story argue? What does the protagonist learn?"
          value={storyBible.themes}
          onChange={onSetThemes}
        />
      </section>

      {/* Tone & Voice */}
      <section style={styles.section} onFocusCapture={() => onSectionChange?.('tone')}>
        <div style={styles.sectionHeader} onClick={() => onSectionChange?.('tone')}>
          <h3 style={styles.sectionTitle}>Tone & Voice</h3>
          <p style={styles.sectionHint}>How does this story feel to read?</p>
          <span style={styles.routeChip} title="Default specialist: Casey">Casey</span>
        </div>
        <GuidedSection
          label="Voice Notes"
          guidance="Describe the narrative voice. Fast or slow? Spare or lush? Cold or warm?"
          value={storyBible.world.voiceNotes}
          onChange={v => onSetWorld({ voiceNotes: v })}
        />
      </section>

      {/* Rules of the World */}
      <section style={styles.section} onFocusCapture={() => onSectionChange?.('rules')}>
        <div style={styles.sectionHeader} onClick={() => onSectionChange?.('rules')}>
          <h3 style={styles.sectionTitle}>Rules of the World</h3>
          <p style={styles.sectionHint}>Internal logic and constraints</p>
          <span style={styles.routeChip} title="Default specialist: Zoe">Zoe</span>
        </div>
        <GuidedSection
          label="World Rules"
          guidance="List the rules that govern this world. Violations break reader trust."
          value={storyBible.rules}
          onChange={onSetRules}
        />
      </section>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 760,
    margin: '0 auto',
    padding: '32px 24px 64px',
    display: 'flex',
    flexDirection: 'column',
    gap: 40,
  },
  header: { marginBottom: 0 },
  title: {
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: 24,
    color: 'var(--fg)',
    marginBottom: 6,
  },
  subtitle: {
    fontFamily: 'var(--font-body)',
    fontSize: 13,
    color: 'var(--fg-muted)',
    lineHeight: 1.5,
    maxWidth: 680,
  },
  section: { display: 'flex', flexDirection: 'column', gap: 16 },
  sectionHeader: { display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' },
  sectionTitle: {
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: 17,
    color: 'var(--fg)',
  },
  sectionHint: {
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    color: 'var(--fg-muted)',
    flex: 1,
    minWidth: 180,
  },
  routeChip: {
    border: '1px solid var(--border)',
    borderRadius: 999,
    color: 'var(--fg-subtle)',
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    padding: '2px 8px',
    flexShrink: 0,
  },
  addBtn: {
    background: 'none',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--fg-muted)',
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    padding: '4px 10px',
    cursor: 'pointer',
    flexShrink: 0,
  },
  cards: { display: 'flex', flexDirection: 'column', gap: 12 },
}
