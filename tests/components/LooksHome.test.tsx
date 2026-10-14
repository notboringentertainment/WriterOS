import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { ComponentProps } from 'react'
import { LookPanel } from '../../client/src/components/writing/looks/LookPanel'
import { PromotedLooksList } from '../../client/src/components/writing/looks/PromotedLooksList'
import { LookEntryButton } from '../../client/src/components/writing/looks/LookEntryButton'
import { LookSessionsProvider, type LookSessionsContextValue } from '../../client/src/lib/lookSessionsContext'
import { ensureDraft, setDraftField, setDraftName, setDraftReference, type LookTarget, type PromotedLook } from '../../client/src/lib/lookDraftEdits'
import { emptyLooks, type LookDraft, type LooksDocument } from '../../shared/looks'

const NOW = '2026-10-09T12:00:00.000Z'
const salon: LookTarget = { entityKind: 'location', entityId: 'vector-station', entityName: 'Vector Station' }
const fixture = (name: string) => JSON.parse(readFileSync(resolve(__dirname, '../fixtures/lookSpec', name), 'utf8')) as Record<string, unknown>
const prior: PromotedLook = {
  recordId: 'mem_prior', entityKind: 'location', entityId: 'vector-station', entityName: 'Vector Station', lookHash: 'c'.repeat(64),
  reference: 'none', promotedAt: '2026-10-06T21:20:45.637Z', spec: {} as never,
}

function completeLocation(name?: string): LookDraft {
  const { version: _v, depends_on: _d, entity_kind: _k, ...fields } = fixture('synthetic-location.json')
  let doc: LooksDocument = ensureDraft(emptyLooks(), salon, 'session-1', NOW)
  for (const [field, value] of Object.entries({ ...fields, entity_id: 'vector-station' })) doc = setDraftField(doc, salon, field, value, NOW)
  doc = setDraftReference(doc, salon, 'none', NOW)
  if (name) doc = setDraftName(doc, salon, name, NOW)
  return doc.drafts['location:vector-station']
}

function renderPanel(overrides: Partial<ComponentProps<typeof LookPanel>> = {}) {
  const props: ComponentProps<typeof LookPanel> = {
    target: salon, draft: completeLocation(), messages: [], sending: false, onSend: vi.fn(), prior: undefined, memoryRevision: 3,
    onField: vi.fn(), onClear: vi.fn(), onReference: vi.fn(), onName: vi.fn(), promote: vi.fn(), reexport: vi.fn(),
    onPromoted: vi.fn(), onMemoryStale: vi.fn(), onExit: vi.fn(), ...overrides,
  }
  render(<LookPanel {...props} />)
  return props
}

const promoted = { ok: true, response: {
  recordId: 'mem_new', lookHash: 'a'.repeat(64), memoryRevision: 4, exportPath: 'x', exportWritten: true, supersededRecordId: 'mem_prior', retried: false } }

describe('renaming in the Look panel', () => {
  it('shows the name as an editable field and in the heading', () => {
    const props = renderPanel({ draft: completeLocation('Parlor') })
    expect(screen.getByRole('heading', { name: 'Parlor' })).toBeInTheDocument()
    const name = screen.getByLabelText('Name')
    expect(name).toHaveValue('Parlor')
    fireEvent.change(name, { target: { value: 'Grand Parlor' } })
    expect(props.onName).toHaveBeenCalledWith('Grand Parlor')
  })

  it('says promoting renames the promoted look, and sends which look it replaces when the id changed', async () => {
    const promote = vi.fn().mockResolvedValue(promoted)
    renderPanel({ draft: completeLocation('Parlor'), prior, promote })
    expect(screen.getByText(/renames it from Vector Station to Parlor/)).toBeInTheDocument()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Promote to canon' })) })
    const body = promote.mock.calls[0][0]
    expect(body.entityName).toBe('Parlor')
    expect(body.spec.entity_id).toBe('parlor')
    expect(body.replacesRecordId).toBe('mem_prior')
  })

  it('sends no replacement when the look id is unchanged', async () => {
    const promote = vi.fn().mockResolvedValue(promoted)
    const draft = { ...completeLocation(), spec: { ...completeLocation().spec, palette_anchors: ['changed', 'two', 'three'] } }
    renderPanel({ draft, prior, promote })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Promote to canon' })) })
    expect(promote.mock.calls[0][0].replacesRecordId).toBeUndefined()
  })
})

function withLooks(ui: React.ReactElement, overrides: Partial<LookSessionsContextValue> = {}) {
  const value: LookSessionsContextValue = { openLook: vi.fn(), characterNames: [], promotedLooks: [prior], ...overrides }
  render(<LookSessionsProvider value={value}>{ui}</LookSessionsProvider>)
  return value
}

describe('the Looks list', () => {
  it('renders nothing outside a project', () => {
    const { container } = render(<PromotedLooksList />)
    expect(container).toBeEmptyDOMElement()
  })

  it('lists every promoted look with its kind and date, and opens one filled in', () => {
    const value = withLooks(<PromotedLooksList />)
    const row = screen.getByRole('listitem')
    expect(row).toHaveTextContent('Vector Station')
    expect(row).toHaveTextContent('Location')
    expect(row).toHaveTextContent('Oct 6, 2026')
    fireEvent.click(screen.getByRole('button', { name: 'Open Vector Station' }))
    expect(value.openLook).toHaveBeenCalledWith(
      { entityKind: 'location', entityId: 'vector-station', entityName: 'Vector Station' }, { fromPromoted: true })
  })

  it('says so when nothing is promoted yet', () => {
    withLooks(<PromotedLooksList />, { promotedLooks: [] })
    expect(screen.getByText(/No looks promoted yet/)).toBeInTheDocument()
  })

  it('starts a new look without a beat: name a character and open it', () => {
    const value = withLooks(<PromotedLooksList />, { promotedLooks: [] })
    fireEvent.click(screen.getByRole('button', { name: 'Start a look' }))
    fireEvent.change(screen.getByLabelText('Who or where is this look for?'), { target: { value: '__character__' } })
    fireEvent.change(screen.getByLabelText('Character name'), { target: { value: 'Night Courier' } })
    fireEvent.click(screen.getByRole('button', { name: 'Open look' }))
    expect(value.openLook).toHaveBeenCalledWith({ entityKind: 'character', entityId: 'night-courier', entityName: 'Night Courier' })
  })
})

describe('Start a look', () => {
  it('lists looks already promoted, and picking one opens it filled in', () => {
    const value = withLooks(<LookEntryButton beatTitle="The robot fight goes wrong" />)
    fireEvent.click(screen.getByRole('button', { name: 'Start a look' }))
    const picker = screen.getByLabelText('Who or where is this look for?')
    expect(screen.getByRole('option', { name: 'Vector Station (location, promoted)' })).toBeInTheDocument()
    fireEvent.change(picker, { target: { value: 'promoted:mem_prior' } })
    fireEvent.click(screen.getByRole('button', { name: 'Open look' }))
    expect(value.openLook).toHaveBeenCalledWith(
      { entityKind: 'location', entityId: 'vector-station', entityName: 'Vector Station' }, { fromPromoted: true })
  })
})
