import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import App from '../../client/src/App'

function openTab(name: string) {
  fireEvent.click(screen.getByRole('tab', { name }))
}

function formatSelector() {
  return screen.getByLabelText(/^format$/i)
}

describe('App project format selectors', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('shares one canonical project format across Synopsis, Outline, and Story Bible', () => {
    render(<App />)

    openTab('Outline')
    expect(formatSelector()).toHaveValue('feature')
    fireEvent.change(formatSelector(), { target: { value: 'series' } })
    expect(formatSelector()).toHaveValue('series')

    openTab('Story Bible')
    expect(formatSelector()).toHaveValue('series')
    fireEvent.change(formatSelector(), { target: { value: 'feature' } })
    expect(formatSelector()).toHaveValue('feature')

    openTab('Synopsis')
    expect(formatSelector()).toHaveValue('feature')
    fireEvent.change(formatSelector(), { target: { value: 'series' } })
    expect(formatSelector()).toHaveValue('series')

    openTab('Outline')
    expect(formatSelector()).toHaveValue('series')

    const stored = JSON.parse(localStorage.getItem('writeros_project_state')!)
    expect(stored.meta.format).toBe('series')
  })
})
