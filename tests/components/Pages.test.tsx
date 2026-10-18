import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import * as pagesApi from '../../client/src/lib/pagesApi'
import { Pages, PageProse, changedCanon, pageStatus } from '../../client/src/components/writing/Pages'
import type { PageDocument } from '../../shared/pages'
import type { ProjectMemorySnapshot } from '../../shared/projectMemory'

const page: PageDocument = { page: 'synopsis', markdown: 'A traveler returns home.', status: 'approved', revision: 2,
  approvedAt: '2026-10-15T12:00:00.000Z', approvedCanon: [{ id: 'earlier', version: 'v1' }] }
const snapshot = { records: [
  { id: 'earlier', kind: 'canon', status: 'superseded', updatedAt: 'v2', claim: 'The traveler leaves.' },
  { id: 'new', kind: 'canon', status: 'active', updatedAt: 'v2', claim: 'The traveler stays.' },
  { id: 'note', kind: 'development', status: 'active', updatedAt: 'v2', claim: 'Consider another ending.' },
] } as ProjectMemorySnapshot

describe('Pages', () => {
  it('offers Story Bible after Synopsis with its own needs and Morgan request', async () => {
    const ask = vi.fn().mockResolvedValue(undefined)
    vi.spyOn(pagesApi, 'requestPage').mockResolvedValue({ page: 'bible', markdown: '', status: 'draft', revision: 0 })
    render(<Pages projectId="sample-project" selected="bible" onSelect={vi.fn()} pages={{}}
      onPage={vi.fn()} onAskMorgan={ask} />)
    expect(screen.getByRole('navigation', { name: 'Pages' }).textContent).toContain('Synopsis not startedStory Bible not started')
    expect(screen.getByRole('heading', { name: 'Story Bible' })).toBeDefined()
    expect(screen.getByText('Continuity and open questions')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Write it with Morgan' }))
    await waitFor(() => expect(ask).toHaveBeenCalledWith(expect.stringContaining('Write the Story Bible page')))
  })
  afterEach(() => vi.restoreAllMocks())
  it('uses a styled plain message when Morgan cannot be reached', async () => {
    vi.spyOn(pagesApi, 'requestPage').mockResolvedValue({ page: 'outline', markdown: '', status: 'draft', revision: 0 })
    render(<Pages projectId="sample-project" selected="outline" onSelect={vi.fn()} pages={{}}
      onPage={vi.fn()} onAskMorgan={vi.fn().mockRejectedValue(new Error('live view is not connected'))} />)
    fireEvent.click(screen.getByRole('button', { name: 'Write it with Morgan' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("Morgan isn't running yet. Open her panel with the M button and try again.")
    expect(alert).toHaveClass('pages-notice')
    expect(screen.queryByText('live view is not connected')).toBeNull()
  })
  it('renders adjacent legacy markdown headings as headings', () => {
    const { container } = render(<PageProse markdown={'# Treatment\n## Logline\n\nA courier crosses the city.\n'} />)
    expect(screen.getByRole('heading', { name: 'Treatment' })).toBeDefined()
    expect(screen.getByRole('heading', { name: 'Logline' })).toBeDefined()
    expect(container.textContent).not.toContain('#')
  })
  it.each(['success', 'stale'] as const)('ignores a deferred approval %s after a project switch and unmount', async outcome => {
    const draft = { ...page, status: 'draft' as const }
    let resolve!: (page: PageDocument) => void
    let reject!: (error: Error) => void
    const pending = new Promise<PageDocument>((yes, no) => { resolve = yes; reject = no })
    vi.spyOn(pagesApi, 'requestPage').mockImplementation(async (_id, _name, write) => write ? pending : draft)
    const oldOnPage = vi.fn()
    const newOnPage = vi.fn()
    const props = { selected: 'synopsis' as const, onSelect: vi.fn(), pages: { synopsis: draft }, snapshot, onAskMorgan: vi.fn() }
    const oldView = render(<Pages {...props} projectId="earlier-project" onPage={oldOnPage} />)
    await waitFor(() => expect(oldOnPage).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    oldView.unmount()
    render(<Pages {...props} projectId="new-project" onPage={newOnPage} />)
    await waitFor(() => expect(newOnPage).toHaveBeenCalledTimes(1))
    await act(async () => {
      if (outcome === 'success') resolve({ ...page, revision: 3 })
      else reject(new pagesApi.StalePageError({ ...page, revision: 4 }))
    })
    expect(oldOnPage).toHaveBeenCalledTimes(1)
    expect(newOnPage).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled()
  })
  it('names added and superseded canon while ignoring development events', () => {
    expect(changedCanon(page, snapshot).map(record => record.id)).toEqual(['earlier', 'new'])
    expect(pageStatus(page, snapshot)).toBe('out of date')
    expect(pageStatus({ ...page, status: 'draft' }, snapshot)).toBe('draft')
    expect(pageStatus(undefined, snapshot)).toBe('not started')
  })
  it('shows a plain start list and all three page statuses without editing controls', () => {
    const { container } = render(<Pages projectId={null} selected="outline" onSelect={vi.fn()} pages={{ synopsis: page }}
      onPage={vi.fn()} onAskMorgan={vi.fn()} />)
    expect(screen.getByRole('navigation', { name: 'Pages' }).textContent).toContain('Outline not started')
    expect(screen.getByRole('button', { name: 'Write it with Morgan' })).toBeDefined()
    expect(screen.getByText('The setup')).toBeDefined()
    expect(container.querySelectorAll('input, textarea, svg').length).toBe(0)
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
  })
  it('shows prose, approval date and the names of canon changes', () => {
    render(<Pages projectId={null} selected="synopsis" onSelect={vi.fn()} pages={{ synopsis: page }} snapshot={snapshot}
      onPage={vi.fn()} onAskMorgan={vi.fn()} />)
    expect(screen.getByText('Approved Oct 15')).toBeDefined()
    expect(screen.getByText('A traveler returns home.')).toBeDefined()
    expect(screen.getByText('The traveler stays.')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Ask Morgan to update' })).toBeDefined()
  })
})
