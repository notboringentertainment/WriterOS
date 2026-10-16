import { afterEach, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Editor } from '@tiptap/core'
import { TopBar } from '../../client/src/components/shell/TopBar'
import { ScreenplayEditor } from '../../client/src/components/writing/screenplay/ScreenplayEditor'

afterEach(() => vi.useRealTimers())

it('F19 waits for a successful save and shows a failed save in the top bar', async () => {
  let finish!: (saved: boolean) => void
  const onSaveProject = () => new Promise<boolean>(resolve => { finish = resolve })
  render(<TopBar activeTab="script" writersRoomActive={false} projectTitle="Test"
    onTabChange={() => {}} onWritersRoom={() => {}} onVoiceProfile={() => {}}
    voiceProfileOpen={false} onSaveProject={onSaveProject} />)
  fireEvent.click(screen.getByRole('button', { name: /project actions/i }))
  fireEvent.click(screen.getByText('Save'))
  expect(screen.queryByText('Saved ✓')).not.toBeInTheDocument()
  await act(async () => finish(false))
  expect(screen.getByRole('alert')).toHaveTextContent('Could not save. Try again.')
  fireEvent.click(screen.getByRole('button', { name: /project actions/i }))
  fireEvent.click(screen.getByText('Save'))
  await act(async () => finish(true))
  expect(screen.getByText('Saved ✓')).toBeInTheDocument()
})

it('F24 flushes the latest script once when the editor unmounts', async () => {
  let editor!: Editor
  const changed = vi.fn()
  const view = render(<ScreenplayEditor onEditorReady={value => { editor = value }} onContentChange={changed} />)
  await waitFor(() => expect(editor).toBeDefined())
  vi.useFakeTimers()
  act(() => { editor.commands.insertContent('first'); editor.commands.insertContent(' last') })
  view.unmount()
  expect(changed).toHaveBeenCalledTimes(1)
  expect(changed.mock.calls[0][0]).toContain('first last')
  act(() => vi.runOnlyPendingTimers())
  expect(changed).toHaveBeenCalledTimes(1)
})
