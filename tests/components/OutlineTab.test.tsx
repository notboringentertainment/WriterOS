import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { OutlineTab } from '../../client/src/components/writing/OutlineTab'
import { defaultProjectState } from '../../client/src/lib/projectState'

describe('OutlineTab', () => {
  const defaultDocument = defaultProjectState().documents.outline

  function renderOutline(overrides: Partial<ComponentProps<typeof OutlineTab>> = {}) {
    const props: ComponentProps<typeof OutlineTab> = {
      document: defaultDocument,
      projectFormat: 'feature',
      onProjectFormatChange: vi.fn(),
      onContentChange: vi.fn(),
      onAddEpisode: vi.fn(),
      onEpisodeFieldChange: vi.fn(),
      onClear: vi.fn(),
      ...overrides,
    }

    render(<OutlineTab {...props} />)
    return props
  }

  it('renders feature deck cards with plain-language questions', () => {
    renderOutline()

    expect(screen.getByText('Who are we following?')).toBeInTheDocument()
    expect(screen.getByText('What disrupts it?')).toBeInTheDocument()
    expect(screen.getByText('What final choice resolves the pressure?')).toBeInTheDocument()
    expect(screen.queryByText('Inciting incident')).not.toBeInTheDocument()
    expect(screen.queryByText('All-is-lost (with subplot)')).not.toBeInTheDocument()
  })

  it('calls onContentChange with the resolved card mapping when an answer changes', () => {
    const onContentChange = vi.fn()
    renderOutline({ onContentChange })

    fireEvent.change(screen.getByLabelText('Who are we following?'), {
      target: { value: 'Sara, a widowed firefighter.' },
    })

    const updater = onContentChange.mock.calls[0][0]
    expect(updater(defaultDocument.content).spine.protagonist).toBe('Sara, a widowed firefighter.')
  })

  it('shows existing document answers', () => {
    const document = {
      ...defaultDocument,
      content: {
        ...defaultDocument.content,
        spine: {
          ...defaultDocument.content.spine,
          protagonist: 'Sara, a widowed firefighter.',
        },
      },
    }

    renderOutline({ document })

    expect(screen.getByDisplayValue('Sara, a widowed firefighter.')).toBeInTheDocument()
  })

  it('opens a clear dialog and clears the whole outline', () => {
    const onClear = vi.fn()
    const document = {
      ...defaultDocument,
      content: {
        ...defaultDocument.content,
        spine: {
          ...defaultDocument.content.spine,
          theme: 'Mercy under pressure',
        },
      },
    }

    renderOutline({ document, onClear })
    fireEvent.click(screen.getByRole('button', { name: 'Clear outline' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear everything' }))

    expect(onClear).toHaveBeenCalledWith({ keep: 'all' })
  })

  it('disables clear outline when the outline is empty', () => {
    renderOutline()
    expect(screen.getByRole('button', { name: 'Clear outline' })).toBeDisabled()
  })

  it('renders project format selector when format props are supplied', () => {
    renderOutline({ projectFormat: 'series' })

    expect(screen.getByLabelText(/^format$/i)).toHaveValue('series')
  })

  it('calls onProjectFormatChange when the project format selector changes', () => {
    const onProjectFormatChange = vi.fn()
    renderOutline({ projectFormat: 'feature', onProjectFormatChange })

    fireEvent.change(screen.getByLabelText(/^format$/i), { target: { value: 'series' } })

    expect(onProjectFormatChange).toHaveBeenCalledWith('series')
  })

  it('renders the series deck and seeds starter episodes on first series mount', async () => {
    const onContentChange = vi.fn()
    renderOutline({ projectFormat: 'series', onContentChange })

    expect(screen.getByText('What keeps generating stories?')).toBeInTheDocument()
    expect(screen.getByText('Episode map')).toBeInTheDocument()
    await waitFor(() => expect(onContentChange).toHaveBeenCalled())
    const seeded = onContentChange.mock.calls[0][0](defaultDocument.content)
    expect(seeded.episodes.map((episode: { label: string }) => episode.label)).toEqual([
      'Episode 101',
      'Episode 102',
      'Episode 103',
    ])
  })
})
