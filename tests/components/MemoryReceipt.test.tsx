import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryReceipt } from '../../client/src/components/memory/MemoryReceipt'
import type { MemoryReceipt as MemoryReceiptData } from '@shared/schema'

function makeReceipt(overrides: Partial<MemoryReceiptData> = {}): MemoryReceiptData {
  return {
    revision: 42,
    status: 'available',
    citations: [],
    conflictIds: [],
    ...overrides,
  }
}

describe('MemoryReceipt', () => {
  it('renders nothing when no receipt is supplied', () => {
    const { container } = render(<MemoryReceipt />)
    expect(container).toBeEmptyDOMElement()
  })

  it('discloses disabled status rather than hiding it', () => {
    render(<MemoryReceipt receipt={makeReceipt({ status: 'disabled', revision: 0 })} />)
    expect(screen.getByRole('status')).toHaveTextContent('Project memory disabled')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows the exact revision and no citation toggle when there are no citations', () => {
    render(<MemoryReceipt receipt={makeReceipt({ revision: 7 })} />)
    expect(screen.getByRole('status')).toHaveTextContent('Project memory revision 7')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('expands and collapses citations, showing id, workflow, and source locator for each', () => {
    render(<MemoryReceipt receipt={makeReceipt({
      citations: [
        { id: '[M-0001-abcd]', workflow: 'writeros', sourceUri: 'documents/outline.json::canon::spine' },
        { id: '[M-0002-ef01]', workflow: 'writeros-room', sourceUri: 'writeros-room:story_locks' },
      ],
    })} />)

    const toggle = screen.getByRole('button', { name: 'Show citations (2)' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('[M-0001-abcd]')).not.toBeInTheDocument()

    fireEvent.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Hide citations')).toBeInTheDocument()
    expect(screen.getByText('[M-0001-abcd]')).toBeInTheDocument()
    expect(screen.getByText('WriterOS')).toBeInTheDocument()
    expect(screen.getByText('documents/outline.json::canon::spine')).toBeInTheDocument()
    expect(screen.getByText('[M-0002-ef01]')).toBeInTheDocument()
    expect(screen.getByText("Writer's Room")).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Hide citations' }))
    expect(screen.queryByText('[M-0001-abcd]')).not.toBeInTheDocument()
  })

  it('discloses touched unresolved conflicts without hiding the rest of the receipt', () => {
    render(<MemoryReceipt receipt={makeReceipt({ conflictIds: ['conflict-1', 'conflict-2'] })} />)
    expect(screen.getByText('Touches 2 unresolved memory conflicts — see Memory.')).toBeInTheDocument()
  })
})
