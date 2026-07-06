import React from 'react'
import type { StoryLock } from '@shared/documents'
import { StoryBibleLockCard } from './StoryBibleLockCard'

export interface StoryBibleLocksEditorProps {
  value: readonly StoryLock[]
  onChange: (next: StoryLock[]) => void
}

const emptyLock = (): StoryLock => ({
  id: crypto.randomUUID(),
  statement: '',
  scope: 'story',
  rationale: '',
  source: '',
  status: 'active',
  createdAt: new Date().toISOString(),
})

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
}

const buttonStyle: React.CSSProperties = {
  alignSelf: 'flex-start',
  border: '1px solid var(--border)',
  borderRadius: 4,
  background: 'transparent',
  color: 'var(--fg-muted)',
  fontFamily: 'var(--font-body)',
  fontSize: '0.86rem',
  padding: '6px 10px',
  cursor: 'pointer',
}

const emptyStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: '0.86rem',
  color: 'var(--fg-muted)',
  margin: 0,
  lineHeight: 1.5,
}

export function StoryBibleLocksEditor({ value, onChange }: StoryBibleLocksEditorProps) {
  function updateLock(id: string, nextLock: StoryLock) {
    onChange(value.map((lock) => (lock.id === id ? nextLock : lock)))
  }

  function removeLock(id: string) {
    onChange(value.filter((lock) => lock.id !== id))
  }

  function addLock() {
    onChange([...value, emptyLock()])
  }

  return (
    <div style={containerStyle}>
      {value.length === 0 && <p style={emptyStyle}>No locks yet.</p>}
      {value.map((lock) => (
        <StoryBibleLockCard
          key={lock.id}
          lock={lock}
          onChange={(nextLock) => updateLock(lock.id, nextLock)}
          onRemove={() => removeLock(lock.id)}
        />
      ))}
      <button type="button" style={buttonStyle} onClick={addLock}>
        Add a lock
      </button>
    </div>
  )
}
