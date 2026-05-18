import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import App from '../../client/src/App'

describe("App Writer's Room layout", () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('keeps the active writing surface visible when Writer Room is open', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('tab', { name: 'Outline' }))
    expect(screen.getByRole('heading', { name: 'Outline' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: "Writer's Room" }))

    expect(screen.getByRole('heading', { name: 'Outline' })).toBeInTheDocument()
    expect(screen.getByTestId('specialist-nav')).toBeInTheDocument()
    expect(screen.getByText('Oliver Chat')).toBeInTheDocument()
    expect(screen.queryByTestId('specialist-workspace')).not.toBeInTheDocument()
  })

  it('preserves the chosen surface when switching specialists', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('tab', { name: 'Synopsis' }))
    expect(screen.getByRole('heading', { name: 'Synopsis' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: "Writer's Room" }))
    fireEvent.click(screen.getAllByText('Sam')[0])

    expect(screen.getByRole('heading', { name: 'Synopsis' })).toBeInTheDocument()
    expect(screen.getByText('Sam Chat')).toBeInTheDocument()
  })
})
