import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MorganApprovalCard } from '../../client/src/components/shell/MorganApprovalCard'

function card(input: object, tool = 'Edit') { return { requestId: 'r', tool, summary: 'Review change', input: JSON.stringify(input) } }
describe('MorganApprovalCard', () => {
  it('wraps a long folder-trust summary and keeps the card within the rail width', () => {
    const summary = 'Let Morgan work in /projects/' + 'long-folder-name'.repeat(40) + '?'
    render(<MorganApprovalCard card={{ ...card({}, 'FolderTrust'), summary }} onAnswer={vi.fn()} onNoLongerWaiting={vi.fn()} />)
    expect(screen.getByText(summary)).toHaveStyle({ overflowWrap: 'anywhere', wordBreak: 'break-word' })
    expect(screen.getByRole('region', { name: 'Morgan approval' })).toHaveStyle({ maxWidth: '100%', boxSizing: 'border-box', minWidth: 0 })
  })
  it('shows the file path and complete old and new text as plain text', () => {
    render(<MorganApprovalCard card={card({ file_path: '/x/28.md', old_string: 'Before <b>', new_string: 'After <img>' })} onAnswer={vi.fn()} onNoLongerWaiting={vi.fn()} />)
    expect(screen.getByText('/x/28.md')).toBeTruthy()
    expect(screen.getByText('Before <b>')).toBeTruthy(); expect(screen.getByText('After <img>')).toBeTruthy()
    expect(document.querySelector('b, img')).toBeNull()
    expect(screen.getByText('Details')).toBeTruthy()
  })
  it('shows full write content and command text without truncation', () => {
    const command = 'echo ' + 'x'.repeat(300)
    render(<MorganApprovalCard card={card({ content: 'Entire write', command }, 'Bash')} onAnswer={vi.fn()} onNoLongerWaiting={vi.fn()} />)
    expect(screen.getByText('Entire write')).toBeTruthy(); expect(screen.getByText(command)).toBeTruthy()
  })
  it('keeps both answer buttons disabled after answering until the card is removed', async () => {
    const answer = vi.fn(async () => {})
    render(<MorganApprovalCard card={card({})} onAnswer={answer} onNoLongerWaiting={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }))
    await waitFor(() => expect(answer).toHaveBeenCalledWith({ allow: true }))
    expect((screen.getByRole('button', { name: 'Allow' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: "Don't allow" }) as HTMLButtonElement).disabled).toBe(true)
  })
  it('removes a no-longer-waiting card and lets a failed answer be retried', async () => {
    const gone = vi.fn()
    const answer = vi.fn().mockRejectedValueOnce(new Error('Network unavailable')).mockRejectedValueOnce(Object.assign(new Error('Gone'), { status: 404 }))
    render(<MorganApprovalCard card={card({})} onAnswer={answer} onNoLongerWaiting={gone} />)
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Network unavailable')
    expect((screen.getByRole('button', { name: 'Allow' }) as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }))
    await waitFor(() => expect(gone).toHaveBeenCalledOnce())
  })
})
