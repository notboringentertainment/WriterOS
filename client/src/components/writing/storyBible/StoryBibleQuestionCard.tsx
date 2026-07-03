import React, { useState } from 'react'
import type {
  StoryBibleDocumentContent,
  StoryBibleCharacter,
  StoryBibleStatus,
  StoryLock,
} from '@shared/documents'
import {
  buildStoryBiblePatch,
  resolveStoryBiblePath,
  type StoryBiblePromptDef,
  type StoryBiblePromptInput,
} from '../../../lib/storyBibleDeck'
import { StoryBibleCharactersEditor } from './StoryBibleCharactersEditor'
import { StoryBibleLocksEditor } from './StoryBibleLocksEditor'

export interface StoryBibleQuestionCardProps {
  prompt: StoryBiblePromptDef
  content: StoryBibleDocumentContent
  onPatch: (patch: Partial<StoryBibleDocumentContent>) => void
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
}

const selectStyle: React.CSSProperties = {
  ...textInputStyle,
  cursor: 'pointer',
}

function readString(content: StoryBibleDocumentContent, path: string): string {
  const { defined, value } = resolveStoryBiblePath(content, path)
  if (!defined) return ''
  return typeof value === 'string' ? value : ''
}

function readArray<T>(content: StoryBibleDocumentContent, path: string): T[] {
  const { defined, value } = resolveStoryBiblePath(content, path)
  if (!defined) return []
  return Array.isArray(value) ? (value as T[]) : []
}

function readStatus(content: StoryBibleDocumentContent, path: string): StoryBibleStatus {
  const { defined, value } = resolveStoryBiblePath(content, path)
  if (!defined || typeof value !== 'string') return 'development'
  return value as StoryBibleStatus
}

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

interface InputRowProps {
  input: StoryBiblePromptInput
  composite: boolean
  content: StoryBibleDocumentContent
  onPatch: (patch: Partial<StoryBibleDocumentContent>) => void
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
        onChange={(event) => onPatch(buildStoryBiblePatch(content, input.path, event.target.value))}
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
        onChange={(event) => onPatch(buildStoryBiblePatch(content, input.path, event.target.value))}
      />
    </div>
  )
}

function ListInputRow({ input, composite, content, onPatch }: InputRowProps) {
  const items = readArray<string>(content, input.path)
  const [focused, setFocused] = useState(false)
  const [draft, setDraft] = useState<string | null>(null)
  const display = focused ? (draft ?? items.join(', ')) : items.join(', ')

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
          setDraft(items.join(', '))
        }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          onPatch(buildStoryBiblePatch(content, input.path, splitList(draft ?? '')))
          setFocused(false)
          setDraft(null)
        }}
      />
    </div>
  )
}

function StatusInputRow({ input, composite, content, onPatch }: InputRowProps) {
  const value = readStatus(content, input.path)
  return (
    <div>
      {composite && input.label && <span style={subLabelStyle}>{input.label}</span>}
      <select
        aria-label={input.label ?? input.path}
        value={value}
        style={selectStyle}
        onChange={(event) =>
          onPatch(buildStoryBiblePatch(content, input.path, event.target.value as StoryBibleStatus))
        }
      >
        <option value="pitch">Pitch</option>
        <option value="development">Development</option>
        <option value="production">Production</option>
        <option value="living_canon">Living canon</option>
      </select>
    </div>
  )
}

function CharactersRow({ input, content, onPatch }: InputRowProps) {
  const value = readArray<StoryBibleCharacter>(content, input.path)
  return (
    <StoryBibleCharactersEditor
      value={value}
      onChange={(next) => onPatch(buildStoryBiblePatch(content, input.path, next))}
    />
  )
}

function LocksRow({ input, content, onPatch }: InputRowProps) {
  const value = readArray<StoryLock>(content, input.path)
  return (
    <StoryBibleLocksEditor
      value={value}
      onChange={(next) => onPatch(buildStoryBiblePatch(content, input.path, next))}
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
    case 'tone-words':
      return <ListInputRow {...props} />
    case 'status':
      return <StatusInputRow {...props} />
    case 'characters':
      return <CharactersRow {...props} />
    case 'locks':
      return <LocksRow {...props} />
  }
}

export function StoryBibleQuestionCard({
  prompt,
  content,
  onPatch,
}: StoryBibleQuestionCardProps) {
  const composite = prompt.inputs.length > 1

  return (
    <div
      style={cardStyle}
      data-testid={`story-bible-question-${prompt.id}`}
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
