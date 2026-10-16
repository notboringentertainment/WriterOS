import { act, renderHook } from '@testing-library/react'
import { beforeEach, expect, it } from 'vitest'
import { useProjectState } from '../../client/src/lib/useProjectState'
import { defaultProjectState } from '../../client/src/lib/projectState'

beforeEach(() => {
  localStorage.clear()
  const projects = ['a', 'b'].map(id => {
    const state = defaultProjectState()
    state.meta.title = id
    state.script.rawHtml = `<p>${id} original</p>`
    return { id, createdAt: 1, updatedAt: 2, state }
  })
  localStorage.setItem('writeros_project_library', JSON.stringify(projects))
  localStorage.setItem('writeros_active_project_id', 'a')
})

it('F24 an old editor flush saves its own project without changing the new one', () => {
  const hook = renderHook(() => useProjectState())
  const oldEditorChange = hook.result.current.updateScript
  act(() => hook.result.current.switchProject('b'))
  act(() => oldEditorChange('<p>a pending</p>', []))
  expect(hook.result.current.state.meta.title).toBe('b')
  expect(hook.result.current.state.script.rawHtml).toBe('<p>b original</p>')
  const projects = JSON.parse(localStorage.getItem('writeros_project_library')!)
  expect(projects.find((p: { id: string }) => p.id === 'a').state.script.rawHtml).toBe('<p>a pending</p>')
  expect(projects.find((p: { id: string }) => p.id === 'a').state.meta.title).toBe('a')
  expect(localStorage.getItem('writeros_active_project_id')).toBe('b')
})

it('F19 saves the current script snapshot even before the editor debounce fires', () => {
  const hook = renderHook(() => useProjectState())
  let saved: ReturnType<typeof hook.result.current.saveNow>
  act(() => { saved = hook.result.current.saveNow({ rawHtml: '<p>latest typing</p>', scenes: [] }) })
  expect(saved!.state.script.rawHtml).toBe('<p>latest typing</p>')
  expect(hook.result.current.state.script.rawHtml).toBe('<p>latest typing</p>')
})
