import { seedSkippedVoiceProfileState } from '../helpers/voiceProfileTestState'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import App from '../../client/src/App'

function openTab(name: string) {
  if (name === 'Synopsis' || name === 'Treatment') {
    fireEvent.click(screen.getByRole('tab', { name: 'Pages' }))
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${name} `) }))
  } else fireEvent.click(screen.getByRole('tab', { name }))
}

function formatSelector() {
  return screen.getByLabelText(/^format$/i)
}

describe('App project format selectors', () => {
  beforeEach(() => {
    localStorage.clear()
    seedSkippedVoiceProfileState()
    vi.restoreAllMocks()
  })

  it('shares project format across Beat Sheet and Story Facts while Pages has no format editor', () => {
    render(<App />)

    openTab('Beat Sheet')
    expect(formatSelector()).toHaveValue('feature')
    fireEvent.change(formatSelector(), { target: { value: 'series' } })
    expect(formatSelector()).toHaveValue('series')

    openTab('Story Facts')
    expect(formatSelector()).toHaveValue('series')
    fireEvent.change(formatSelector(), { target: { value: 'feature' } })
    expect(formatSelector()).toHaveValue('feature')

    openTab('Synopsis')
    expect(screen.queryByLabelText(/^format$/i)).not.toBeInTheDocument()

    openTab('Beat Sheet')
    expect(formatSelector()).toHaveValue('feature')

    const stored = JSON.parse(localStorage.getItem('writeros_project_state')!)
    expect(stored.meta.format).toBe('feature')
  })
})
