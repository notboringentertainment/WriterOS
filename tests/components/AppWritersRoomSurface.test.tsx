import { seedSkippedVoiceProfileState } from '../helpers/voiceProfileTestState'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import App from '../../client/src/App'

describe("App Writer's Room layout", () => {
  beforeEach(() => {
    localStorage.clear()
    seedSkippedVoiceProfileState()
    vi.restoreAllMocks()
  })

  it('offers Project Meeting after creating a new project without auto-starting it', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'New Project' }))

    // A new project lands on the Project Meeting page in its intake state — the
    // page is the offer; nothing starts until the writer begins explicitly.
    const page = await screen.findByTestId('ritual-page')
    expect(page).toHaveTextContent('Project Meeting')
    expect(screen.getByLabelText('Project Meeting seed')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Begin the meeting' })).toBeInTheDocument()

    // Skipping drops the writer into the workspace underneath.
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }))
    expect(screen.queryByTestId('ritual-page')).not.toBeInTheDocument()
  })

  it('shows voice controls and the room together on Writer', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('tab', { name: 'Beat Sheet' }))
    expect(screen.getByRole('heading', { name: 'Beat Sheet' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: "Writer" }))

    expect(screen.getByRole('heading', { name: 'Writer' })).toBeInTheDocument()
    expect(screen.getByLabelText('Voice Profile')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Beat Sheet', hidden: true })).not.toBeVisible()
    expect(screen.getByTestId('specialist-nav')).toBeInTheDocument()
    // Phase 1: the dock opens on the live room channel; 1:1 chats sit below it.
    expect(screen.getByTestId('room-channel')).toBeInTheDocument()
    fireEvent.click(screen.getAllByText('Oliver')[0])
    expect(screen.getByText('Oliver Chat')).toBeInTheDocument()
    expect(screen.queryByTestId('specialist-workspace')).not.toBeInTheDocument()
  })

  it('preserves the chosen surface when switching specialists', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('tab', { name: 'Pages' }))
    fireEvent.click(screen.getByRole('button', { name: /^Synopsis / }))
    expect(screen.getByRole('heading', { name: 'Synopsis' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: "Writer" }))
    fireEvent.click(screen.getAllByText('Sam')[0])

    expect(screen.getByRole('heading', { name: 'Synopsis', hidden: true })).not.toBeVisible()
    expect(screen.getByText('Sam Chat')).toBeInTheDocument()
  })

  it('returns from Writer when switching writing places', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('tab', { name: 'Beat Sheet' }))
    fireEvent.click(screen.getByRole('button', { name: "Writer" }))
    expect(screen.getByTestId('specialist-nav')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Pages' }))
    fireEvent.click(screen.getByRole('button', { name: /^Synopsis / }))

    expect(screen.getByRole('heading', { name: 'Synopsis' })).toBeInTheDocument()
    expect(screen.queryByTestId('specialist-nav')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: "Writer" })).toHaveAttribute('aria-pressed', 'false')
  })

  it('does not remount the active script surface when toggling Writer Room', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Open Current' }))

    const scriptSurface = screen.getByTestId('script-tab-surface')

    fireEvent.click(screen.getByRole('button', { name: "Writer" }))

    expect(screen.getByTestId('script-tab-surface')).toBe(scriptSurface)

    fireEvent.click(screen.getByRole('tab', { name: 'Script' }))

    expect(screen.getByTestId('script-tab-surface')).toBe(scriptSurface)
  })
})
