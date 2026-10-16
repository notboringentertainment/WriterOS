import { afterEach, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Editor } from '@tiptap/core'
import App from '../../client/src/App'
import { defaultProjectState } from '../../client/src/lib/projectState'
import { seedSkippedVoiceProfileState } from '../helpers/voiceProfileTestState'

afterEach(() => vi.unstubAllGlobals())

it.each([false, true])('orders script and explicit folder saves even when the first is slow (fails: %s)', async failFirst => {
  localStorage.clear()
  seedSkippedVoiceProfileState()
  const state = defaultProjectState()
  state.meta.title = 'Folder script'
  const project = { id: 'ordered-script', createdAt: 1, updatedAt: 2, state }
  const ref = { kind: 'server', id: project.id, packageName: 'Script.writeros', summary: { id: project.id, title: state.meta.title, createdAt: 1, updatedAt: 2 } }
  let release!: () => void
  const firstWrite = new Promise<void>(resolve => { release = resolve })
  const writes: string[] = []
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    let body: unknown = {}
    if (url.endsWith('/bootstrap')) body = { enabled: true, label: 'Projects', sessionToken: 's' }
    if (url === '/api/project-library/projects') body = { entries: [{ status: 'ready', ref, warnings: [] }] }
    if (url === `/api/project-library/projects/${project.id}`) {
      if (init?.method === 'PUT') {
        writes.push(JSON.parse(String(init.body)).project.state.meta.title)
        if (writes.length === 1) {
          await firstWrite
          if (failFirst) return new Response(JSON.stringify({ message: 'First save failed.' }), { status: 500 })
        }
        body = { ref }
      } else body = { result: { ok: true, project, warnings: [] } }
    }
    return new Response(JSON.stringify(body))
  })
  const view = render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'Open Folder script' }))
  await waitFor(() => expect(view.container.querySelector('.ProseMirror')).not.toBeNull())
  const editor = (view.container.querySelector('.ProseMirror') as HTMLElement & { editor: Editor }).editor
  act(() => { editor.commands.insertContent('Pending script') })
  fireEvent.click(screen.getByRole('tab', { name: 'Synopsis' }))
  await waitFor(() => expect(writes).toEqual(['Folder script']))
  fireEvent.click(screen.getByLabelText('Project title: Folder script'))
  fireEvent.change(screen.getByLabelText('Project title'), { target: { value: 'New title' } })
  fireEvent.keyDown(screen.getByLabelText('Project title'), { key: 'Enter' })
  fireEvent.click(screen.getByRole('button', { name: 'Project actions' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Save' }))
  await act(async () => {})
  expect(writes).toEqual(['Folder script'])
  await act(async () => { release() })
  await waitFor(() => expect(writes).toEqual(['Folder script', 'New title']))
  expect(await screen.findByText('Saved ✓')).toBeInTheDocument()
})
