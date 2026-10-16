import React, { useEffect, useRef, useState } from 'react'
import type { StoryBibleDocumentContent } from '@shared/documents'
import type { ProjectFormat } from '@shared/projectFormat'
import type { ProjectMemorySnapshot } from '@shared/projectMemory'
import type { StoryBibleSection } from '../../../lib/shellState'
import {
  STORY_BIBLE_SECTIONS,
  STORY_BIBLE_STATUS_LABELS,
  canonLookFor,
  fieldIsWritten,
  readField,
  sectionIsWritten,
  stillOpen,
  visibleFields,
  writeField,
  writtenMapEntries,
  type StoryBibleSectionDef,
} from '../../../lib/storyBibleSections'
import { PromotedLooksList } from '../looks/PromotedLooksList'
import { StoryBibleCharactersEditor } from './StoryBibleCharactersEditor'
import { StoryBibleLocksEditor } from './StoryBibleLocksEditor'
import './storyBible.css'

export interface StoryBibleSectionsViewProps {
  format: ProjectFormat
  content: StoryBibleDocumentContent
  snapshot?: ProjectMemorySnapshot
  onContentPatch: (patch: Partial<StoryBibleDocumentContent>) => void
  onSectionChange?: (section: StoryBibleSection) => void
  onAskMorgan?: (text: string) => Promise<void>
  onClear: () => void
}

const CLEAR_TIMEOUT_MS = 3000

function sectionRequest(section: StoryBibleSectionDef): string {
  return `Write the "${section.title}" section of the Story Bible from canon. Read story-bible.md in your formats folder and active canon first, ask only about what canon doesn't cover, one question at a time, then propose it through storyBible.`
}

function openQuestionRequest(text: string): string {
  return `Help me settle this open question: "${text}". Tell me what canon already says about it, then ask what you need from me.`
}

export function StoryBibleSectionsView({
  format,
  content,
  snapshot,
  onContentPatch,
  onSectionChange,
  onAskMorgan,
  onClear,
}: StoryBibleSectionsViewProps) {
  const [editing, setEditing] = useState<string | null>(null)
  const [askError, setAskError] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)
  const [clearArmed, setClearArmed] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const open = stillOpen(snapshot)

  useEffect(() => () => { if (timerRef.current !== null) clearTimeout(timerRef.current) }, [])

  async function ask(text: string) {
    if (!onAskMorgan) return
    setAsking(true); setAskError(null)
    try { await onAskMorgan(text) }
    catch { setAskError("Morgan isn't running yet. Open her panel with the M button and try again.") }
    finally { setAsking(false) }
  }

  function handleClearClick() {
    if (!clearArmed) {
      setClearArmed(true)
      timerRef.current = setTimeout(() => { setClearArmed(false); timerRef.current = null }, CLEAR_TIMEOUT_MS)
      return
    }
    if (timerRef.current !== null) { clearTimeout(timerRef.current); timerRef.current = null }
    setClearArmed(false)
    onClear()
  }

  function askButton(text: string, label = 'Ask Morgan') {
    if (!onAskMorgan) return null
    return <button type="button" className="sb-button" disabled={asking} onClick={() => void ask(text)}>{label}</button>
  }

  function renderFields(section: StoryBibleSectionDef) {
    const fields = visibleFields(section, content, format)
    if (editing === section.id) {
      return <div className="sb-edit">
        {fields.map(field => {
          if (field.kind === 'status') {
            return <label key={field.path} className="sb-field">
              <span>{field.label}</span>
              <select value={readField(content, field.path)} onChange={event => onContentPatch(writeField(content, field, event.target.value))}>
                {Object.entries(STORY_BIBLE_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          }
          const Control = field.kind === 'text' ? 'input' : 'textarea'
          return <label key={field.path} className="sb-field">
            <span>{field.label}{field.kind === 'list' ? ' (separate with commas)' : ''}</span>
            <Control value={readField(content, field.path)}
              onChange={event => onContentPatch(writeField(content, field, event.target.value))} />
          </label>
        })}
        <button type="button" className="sb-button" onClick={() => setEditing(null)}>Done</button>
      </div>
    }
    const written = fields.filter(field => fieldIsWritten(content, field))
    const map = section.id === 'engine' ? writtenMapEntries(content) : []
    if (!written.length && !map.length) {
      return <div className="sb-empty">
        <p>Not written yet.</p>
        <div className="sb-actions">
          {askButton(sectionRequest(section))}
          <button type="button" className="sb-link" onClick={() => setEditing(section.id)}>Write it yourself</button>
        </div>
      </div>
    }
    return <>
      {written.map(field => <div key={field.path} className="sb-entry">
        <h3>{field.label}</h3>
        <p>{field.kind === 'status' ? STORY_BIBLE_STATUS_LABELS[content.cover.status] : readField(content, field.path)}</p>
      </div>)}
      {map.length > 0 && <div className="sb-entry">
        <h3>{format === 'series' ? 'Episode map' : 'Sequence map'}</h3>
        {map.map(entry => <p key={entry.id}>
          <strong>{[entry.unit, entry.title].filter(text => text.trim()).join(' · ')}</strong>
          {entry.storyEvents.trim() ? ` ${entry.storyEvents}` : ''}
        </p>)}
      </div>}
      <div className="sb-actions"><button type="button" className="sb-link" onClick={() => setEditing(section.id)}>Edit</button></div>
    </>
  }

  function renderSection(section: StoryBibleSectionDef) {
    if (section.special === 'characters') {
      return <>
        {!sectionIsWritten(section, content) && <div className="sb-empty">
          <p>Not written yet.</p>
          <div className="sb-actions">{askButton(sectionRequest(section))}</div>
        </div>}
        <StoryBibleCharactersEditor value={content.characters}
          lookFor={name => canonLookFor(snapshot, name)}
          onChange={characters => onContentPatch({ characters })} />
      </>
    }
    if (section.special === 'locks') {
      return <StoryBibleLocksEditor value={content.locks} onChange={locks => onContentPatch({ locks })} />
    }
    return renderFields(section)
  }

  return (
    <div className="sb-view" data-testid="story-bible-sections-view" data-active-format={format}>
      {askError && <p role="alert" className="sb-alert">{askError}</p>}
      {open.length > 0 && <section className="sb-open" aria-labelledby="sb-open-heading">
        <h2 id="sb-open-heading">Still open</h2>
        <ul>{open.map(item => <li key={item.id}>
          <span title={item.text}>{item.text}</span>
          {askButton(openQuestionRequest(item.text))}
        </li>)}</ul>
      </section>}
      <PromotedLooksList />
      {STORY_BIBLE_SECTIONS.map(section => (
        <section key={section.id} className="sb-section" data-testid={`story-bible-section-${section.id}`}
          onFocusCapture={() => onSectionChange?.(section.section)}>
          <h2 onClick={() => onSectionChange?.(section.section)}>{section.title}</h2>
          <div className="sb-body">{renderSection(section)}</div>
        </section>
      ))}
      <div className="sb-footer">
        <button type="button" className="sb-link" onClick={handleClearClick}>
          {clearArmed ? 'Click again to clear the whole Story Bible' : 'Clear story bible'}
        </button>
      </div>
    </div>
  )
}
