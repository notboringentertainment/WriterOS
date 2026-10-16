import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import App from '../../client/src/App'
import { defaultProjectState } from '../../client/src/lib/projectState'
import { seedSkippedVoiceProfileState } from '../helpers/voiceProfileTestState'

beforeEach(() => { localStorage.clear(); seedSkippedVoiceProfileState() })
afterEach(() => vi.unstubAllGlobals())

it('F21 reload opens the last folder project from disk, including when restoring fails', async () => {
  const state = defaultProjectState()
  state.meta.title = 'Last folder'
  const project = { id: 'last-folder', createdAt: 1, updatedAt: 2, state }
  const ref = { kind: 'server', id: project.id, packageName: 'Last.writeros', summary: { id: project.id, title: state.meta.title, createdAt: 1, updatedAt: 2 } }
  let fail = false
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    let body: unknown = {}
    if (url.endsWith('/bootstrap')) body = { enabled: true, label: 'Projects', sessionToken: 's' }
    if (url === '/api/project-library/projects') body = { entries: [{ status: 'ready', ref, warnings: [] }] }
    if (url === `/api/project-library/projects/${project.id}`) {
      if (init?.method === 'PUT') body = { ref }
      else if (fail) return new Response(JSON.stringify({ message: 'Folder is unavailable.' }), { status: 500 })
      else body = { result: { ok: true, project: structuredClone(project), warnings: [] } }
    }
    return new Response(JSON.stringify(body))
  }))
  const first = render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'Open Last folder' }))
  await screen.findByLabelText('Project title: Last folder')
  first.unmount()
  state.meta.title = 'Fresh from disk'
  const second = render(<App />)
  expect(await screen.findByLabelText('Project title: Fresh from disk')).toBeInTheDocument()
  second.unmount()
  fail = true
  render(<App />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Folder is unavailable.')
  expect(screen.queryByLabelText('Project title: Untitled Project')).not.toBeInTheDocument()
})
