import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ScriptTab } from '../../client/src/components/writing/ScriptTab'

describe('ScriptTab', () => {
  it('renders element type toolbar', () => {
    render(<ScriptTab />)
    expect(screen.getByRole('combobox', { name: /element type/i })).toBeInTheDocument()
  })

  it('accepts onEditorReady prop and calls it with editor instance', async () => {
    const onEditorReady = vi.fn()
    render(<ScriptTab onEditorReady={onEditorReady} />)
    await new Promise(r => setTimeout(r, 200))
    expect(onEditorReady).toHaveBeenCalledOnce()
    expect(onEditorReady.mock.calls[0][0]).toBeTruthy()
  })

  it('accepts initialScript prop without error', () => {
    expect(() =>
      render(
        <ScriptTab initialScript="<p data-element-type='action'>Test content</p>" />
      )
    ).not.toThrow()
  })

  it('updates toolbar counts from initial script content', async () => {
    render(
      <ScriptTab initialScript="<p data-element-type='scene-heading'>INT. ROOM - DAY</p><p data-element-type='action'>Test content</p>" />
    )

    expect(await screen.findByText(/1 page · 5 words/i)).toBeInTheDocument()
  })

  it('accepts onScriptChange prop without error', () => {
    const onScriptChange = vi.fn()
    expect(() =>
      render(<ScriptTab onScriptChange={onScriptChange} />)
    ).not.toThrow()
  })
})
