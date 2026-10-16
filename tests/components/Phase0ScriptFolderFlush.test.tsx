import { afterEach, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Editor } from '@tiptap/core'
import App from '../../client/src/App'
import { defaultProjectState } from '../../client/src/lib/projectState'
import { seedSkippedVoiceProfileState } from '../helpers/voiceProfileTestState'

afterEach(() => vi.unstubAllGlobals())

it('F24 switching tabs sends the final script to its folder before the folder save delay', async () => {
  localStorage.clear()
  seedSkippedVoiceProfileState()
  const state = defaultProjectState()
  state.meta.title = 'Folder script'
  const project = { id: 'folder-script', createdAt: 1, updatedAt: 2, state }
  const ref = { kind: 'server', id: project.id, packageName: 'Script.writeros', summary: { id: project.id, title: state.meta.title, createdAt: 1, updatedAt: 2 } }
  const writes: string[] = []
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    let body: unknown = {}
    if (url.endsWith('/bootstrap')) body = { enabled: true, label: 'Projects', sessionToken: 's' }
    if (url === '/api/project-library/projects') body = { entries: [{ status: 'ready', ref, warnings: [] }] }
    if (url === `/api/project-library/projects/${project.id}`) {
      if (init?.method === 'PUT') { writes.push(String(init.body)); body = { ref } }
      else body = { result: { ok: true, project, warnings: [] } }
    }
    return new Response(JSON.stringify(body))
  })
  const view = render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'Open Folder script' }))
  await waitFor(() => expect(view.container.querySelector('.ProseMirror')).not.toBeNull())
  const editor = (view.container.querySelector('.ProseMirror') as HTMLElement & { editor: Editor }).editor
  act(() => { editor.commands.insertContent('Final pending words') })
  fireEvent.click(screen.getByRole('tab', { name: 'Pages' }))
  fireEvent.click(screen.getByRole('button', { name: 'Synopsis' }))
  expect(writes.some(body => body.includes('Final pending words'))).toBe(true)
})
