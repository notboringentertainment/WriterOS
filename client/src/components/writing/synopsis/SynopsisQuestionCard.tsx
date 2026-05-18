import React, { useState } from 'react'
import type {
  SynopsisDocumentContent,
  SynopsisEpisodeLength,
  SynopsisFutureSeason,
  SynopsisSeriesCharacter,
  SynopsisSeriesType,
} from '@shared/documents'
import {
  buildSynopsisPatch,
  resolveSynopsisPath,
  type SynopsisPromptDef,
  type SynopsisPromptInput,
} from '../../../lib/synopsisDeck'
import { SynopsisFutureSeasonsEditor } from './SynopsisFutureSeasonsEditor'
import { SynopsisSeriesCharactersEditor } from './SynopsisSeriesCharactersEditor'

export interface SynopsisQuestionCardProps {
  prompt: SynopsisPromptDef
  content: SynopsisDocumentContent
  onPatch: (patch: Partial<SynopsisDocumentContent>) => void
}

const cardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  padding: '20px 0',
  borderBottom: '1px solid var(--border-subtle, var(--border))',
}

const questionStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: '1rem',
  fontWeight: 500,
  color: 'var(--fg)',
  lineHeight: 1.4,
  margin: 0,
}

const helperStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: '0.85rem',
  color: 'var(--fg-muted)',
  margin: 0,
  lineHeight: 1.5,
}

const subLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  fontSize: '0.7rem',
  color: 'var(--fg-subtle)',
  marginBottom: 4,
  display: 'block',
}

const textInputStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: '0.95rem',
  color: 'var(--fg)',
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 4,
  padding: '8px 10px',
  width: '100%',
  outline: 'none',
}

const textareaStyle: React.CSSProperties = {
  ...textInputStyle,
  minHeight: 80,
  resize: 'vertical',
  lineHeight: 1.5,
  fontFamily: 'var(--font-body)',
}

const selectStyle: React.CSSProperties = {
  ...textInputStyle,
  cursor: 'pointer',
}

function readString(content: SynopsisDocumentContent, path: string): string {
  const { defined, value } = resolveSynopsisPath(content, path)
  if (!defined) return ''
  return typeof value === 'string' ? value : ''
}

function readArray<T>(content: SynopsisDocumentContent, path: string): T[] {
  const { defined, value } = resolveSynopsisPath(content, path)
  if (!defined) return []
  return Array.isArray(value) ? (value as T[]) : []
}

function readEnumOrDefault<T extends string>(
  content: SynopsisDocumentContent,
  path: string,
  fallback: T,
): T {
  const { defined, value } = resolveSynopsisPath(content, path)
  if (!defined || typeof value !== 'string') return fallback
  return value as T
}

interface InputRowProps {
  input: SynopsisPromptInput
  composite: boolean
  content: SynopsisDocumentContent
  onPatch: (patch: Partial<SynopsisDocumentContent>) => void
}

function TextInputRow({ input, composite, content, onPatch }: InputRowProps) {
  const value = readString(content, input.path)
  return (
    <div>
      {composite && input.label && <span style={subLabelStyle}>{input.label}</span>}
      <input
        type="text"
        aria-label={input.label ?? input.path}
        value={value}
        placeholder={input.placeholder}
        style={textInputStyle}
        onChange={(e) => onPatch(buildSynopsisPatch(content, input.path, e.target.value))}
      />
    </div>
  )
}

function TextareaInputRow({ input, composite, content, onPatch }: InputRowProps) {
  const value = readString(content, input.path)
  return (
    <div>
      {composite && input.label && <span style={subLabelStyle}>{input.label}</span>}
      <textarea
        aria-label={input.label ?? input.path}
        value={value}
        placeholder={input.placeholder}
        style={textareaStyle}
        onChange={(e) => onPatch(buildSynopsisPatch(content, input.path, e.target.value))}
      />
    </div>
  )
}

function CompsInputRow({ input, composite, content, onPatch }: InputRowProps) {
  const comps = readArray<string>(content, input.path)
  const [focused, setFocused] = useState(false)
  const [draft, setDraft] = useState<string | null>(null)

  const display = focused ? (draft ?? comps.join(', ')) : comps.join(', ')

  return (
    <div>
      {composite && input.label && <span style={subLabelStyle}>{input.label}</span>}
      <input
        type="text"
        aria-label={input.label ?? input.path}
        value={display}
        placeholder={input.placeholder}
        style={textInputStyle}
        onFocus={() => {
          setFocused(true)
          setDraft(comps.join(', '))
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const next = (draft ?? '')
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s.length > 0)
          onPatch(buildSynopsisPatch(content, input.path, next))
          setFocused(false)
          setDraft(null)
        }}
      />
    </div>
  )
}

function SeriesTypeRow({ input, composite, content, onPatch }: InputRowProps) {
  const value = readEnumOrDefault<SynopsisSeriesType>(content, input.path, 'ongoing')
  return (
    <div>
      {composite && input.label && <span style={subLabelStyle}>{input.label}</span>}
      <select
        aria-label={input.label ?? input.path}
        value={value}
        style={selectStyle}
        onChange={(e) =>
          onPatch(buildSynopsisPatch(content, input.path, e.target.value as SynopsisSeriesType))
        }
      >
        <option value="limited">Limited</option>
        <option value="ongoing">Ongoing</option>
      </select>
    </div>
  )
}

function EpisodeLengthRow({ input, composite, content, onPatch }: InputRowProps) {
  const value = readEnumOrDefault<SynopsisEpisodeLength>(content, input.path, 'hour')
  return (
    <div>
      {composite && input.label && <span style={subLabelStyle}>{input.label}</span>}
      <select
        aria-label={input.label ?? input.path}
        value={value}
        style={selectStyle}
        onChange={(e) =>
          onPatch(
            buildSynopsisPatch(content, input.path, e.target.value as SynopsisEpisodeLength),
          )
        }
      >
        <option value="half_hour">Half-hour</option>
        <option value="hour">Hour</option>
        <option value="other">Other</option>
      </select>
    </div>
  )
}

function FutureSeasonsRow({ input, content, onPatch }: InputRowProps) {
  const value = readArray<SynopsisFutureSeason>(content, input.path)
  return (
    <SynopsisFutureSeasonsEditor
      value={value}
      hideHeading
      onChange={(next) => onPatch(buildSynopsisPatch(content, input.path, next))}
    />
  )
}

function CharactersRow({ input, content, onPatch }: InputRowProps) {
  const value = readArray<SynopsisSeriesCharacter>(content, input.path)
  return (
    <SynopsisSeriesCharactersEditor
      value={value}
      hideHeading
      onChange={(next) => onPatch(buildSynopsisPatch(content, input.path, next))}
    />
  )
}

function renderInput(props: InputRowProps): React.ReactNode {
  switch (props.input.kind) {
    case 'text':
      return <TextInputRow {...props} />
    case 'textarea':
      return <TextareaInputRow {...props} />
    case 'comps':
      return <CompsInputRow {...props} />
    case 'series-type':
      return <SeriesTypeRow {...props} />
    case 'episode-length':
      return <EpisodeLengthRow {...props} />
    case 'future-seasons':
      return <FutureSeasonsRow {...props} />
    case 'characters':
      return <CharactersRow {...props} />
  }
}

export function SynopsisQuestionCard({ prompt, content, onPatch }: SynopsisQuestionCardProps) {
  const composite = prompt.inputs.length > 1
  return (
    <div
      style={cardStyle}
      data-testid={`synopsis-question-${prompt.id}`}
      data-prompt-id={prompt.id}
    >
      <p style={questionStyle}>{prompt.question}</p>
      <p style={helperStyle}>{prompt.helper}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {prompt.inputs.map((input) => (
          <React.Fragment key={input.path}>
            {renderInput({ input, composite, content, onPatch })}
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}
