import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from '../../client/src/App'

describe('App Script Scratchpad persistence', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('keeps scratchpad notes after the app reloads from stored project state', async () => {
    const first = render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Open Current' }))

    fireEvent.click(await screen.findByRole('button', { name: 'Add note' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Scratchpad note 1' }), {
      target: { value: 'Remember the midpoint button' },
    })

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('writeros_project_state')!)
      expect(stored.script.scratchpad.items[0].text).toBe('Remember the midpoint button')
    })

    first.unmount()
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Open Current' }))

    expect(await screen.findByRole('textbox', { name: 'Scratchpad note 1' })).toHaveValue(
      'Remember the midpoint button',
    )
  })
})
