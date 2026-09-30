import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { BeatSheetView } from '../../client/src/components/writing/outline/BeatSheetView'
import { OutlineTab } from '../../client/src/components/writing/OutlineTab'
import { SERIES_FOUNDATIONS, getOutlineDeck, createOutlineUnit } from '../../client/src/lib/outlineDeck'
import { createEmptyOutlineContent, type OutlineDocumentContent } from '../../shared/documents'
import { defaultProjectState } from '../../client/src/lib/projectState'

function beat(id: string, number: number, movement: string, title: string, body: string) {
  return { ...createOutlineUnit(id), number, actOrSequence: movement, title, whatHappens: body }
}

const content: OutlineDocumentContent = {
  ...createEmptyOutlineContent(),
  units: [
    beat('b1', 1, 'Setup', 'Opening image', 'A quiet street at dawn.'),
    beat('b2', 2, 'Setup', 'Theme stated', 'Someone says the quiet part.'),
    beat('b3', 3, 'Confrontation', 'Break into two', 'The door opens.'),
  ],
  beatSheetSource: { ticket: 'T-1', sourceHash: 'h', syncedAt: '2026-09-29T17:42:00.000Z', beatCount: 3, label: null },
}

const synced = { kind: 'unchanged' as const, ticket: 'T-1', syncedAt: '2026-09-29T17:42:00.000Z', beatCount: 3 }

function renderView(overrides: Partial<ComponentProps<typeof BeatSheetView>> = {}) {
  const props: ComponentProps<typeof BeatSheetView> = {
    content,
    status: synced,
    lookbook: undefined,
    onRefresh: vi.fn().mockResolvedValue(undefined),
    onAskQuestions: vi.fn().mockResolvedValue(undefined),
    onAnswer: vi.fn(),
    onDismiss: vi.fn(),
    onRemoveOrphan: vi.fn(),
    onContentChange: vi.fn(),
    refreshing: false,
    ...overrides,
  }
  const view = render(<BeatSheetView {...props} />)
  return { props, ...view }
}

describe('BeatSheetView', () => {
  it('renders each beat read-only with movement headers and no textarea for beat text', () => {
    const { container } = renderView()

    expect(screen.getByText('1. Opening image')).toBeInTheDocument()
    expect(screen.getByText('A quiet street at dawn.')).toBeInTheDocument()
    expect(screen.getByText('3. Break into two')).toBeInTheDocument()
    // Movement label appears once per change, not once per beat.
    expect(screen.getAllByText('Setup')).toHaveLength(1)
    expect(screen.getAllByText('Confrontation')).toHaveLength(1)
    for (const article of container.querySelectorAll('article')) {
      if (article.querySelector('h4')) expect(article.querySelector('textarea')).toBeNull()
    }
    expect(screen.queryByDisplayValue('A quiet street at dawn.')).toBeNull()
  })

  it('keeps the Foundations cards above the beats', () => {
    renderView()
    const first = SERIES_FOUNDATIONS[0]
    const question = screen.getByText(first.question)
    const firstBeat = screen.getByText('1. Opening image')
    expect(question.compareDocumentPosition(firstBeat) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    for (const card of SERIES_FOUNDATIONS) expect(screen.getByText(card.question)).toBeInTheDocument()
  })

  it('hides the five series-engine cards and the Episode map when a beat sheet is synced', () => {
    const foundationIds = new Set(SERIES_FOUNDATIONS.map(card => card.id))
    const engine = getOutlineDeck('series').filter(card => !foundationIds.has(card.id))
    expect(engine.length).toBeGreaterThan(0)
    renderView()
    for (const card of engine) expect(screen.queryByText(card.question)).toBeNull()
    expect(screen.queryByText('Episode map')).toBeNull()
  })

  it('shows the full deck when there is no beat sheet', () => {
    const state = defaultProjectState()
    render(
      <OutlineTab
        document={state.documents.outline}
        projectFormat="series"
        identity={{ title: 'T', genre: 'Drama' }}
        onContentChange={vi.fn()}
        onAddEpisode={vi.fn()}
        onEpisodeFieldChange={vi.fn()}
        onViewPreferencesPatch={vi.fn()}
        onComposed={vi.fn()}
        beatSheetStatus={{ kind: 'not-linked' }}
      />,
    )
    const foundationIds = new Set(SERIES_FOUNDATIONS.map(card => card.id))
    const engine = getOutlineDeck('series').filter(card => !foundationIds.has(card.id))
    for (const card of engine) expect(screen.getByText(card.question)).toBeInTheDocument()
    expect(screen.getByText('Episode map')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull()
  })

  it('status line says synced with count and time', () => {
    renderView()
    const text = screen.getByRole('status').textContent ?? ''
    expect(text).toContain('Beat sheet from Story-drive · 3 beats · synced ')
    expect(text).toContain('2026')
    expect(text).not.toContain('has changed since')
  })

  it('shows the changed-since suffix when Story-drive has moved on', () => {
    renderView({ changedSince: true })
    expect(screen.getByRole('status').textContent).toContain(' · Story-drive has changed since — Refresh')
  })

  it('status line says the beats are untouched on unavailable/malformed/reopened', () => {
    const cases: Array<[Parameters<typeof renderView>[0], string]> = [
      [{ status: { kind: 'unavailable', ticket: 'T-1', message: 'offline' } }, "Couldn't reach Story-drive (offline). Showing the last synced beats."],
      [{ status: { kind: 'malformed', ticket: 'T-1', message: 'bad table' } }, "Story-drive's beat sheet couldn't be read (bad table). Showing the last synced beats."],
      [{ status: { kind: 'reopened', ticket: 'T-1', message: 'x' } }, 'This beat sheet was reopened in Story-drive. Showing the last ratified beats.'],
    ]
    for (const [overrides, expected] of cases) {
      const { unmount } = renderView(overrides)
      expect(screen.getByRole('status')).toHaveTextContent(expected)
      unmount()
    }
  })

  it('Refresh calls onRefresh and disables while refreshing', () => {
    const { props, unmount } = renderView()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(props.onRefresh).toHaveBeenCalledOnce()
    unmount()

    renderView({ refreshing: true })
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled()
  })
})
