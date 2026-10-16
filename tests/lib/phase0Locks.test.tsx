import { afterEach, expect, it, vi } from 'vitest'
import { act, fireEvent, render, renderHook, waitFor } from '@testing-library/react'
import { useStoryLocksSync } from '../../client/src/lib/useStoryLocksSync'
import { syncSurfaceLocks } from '../../server/room/surfaceLockSync'
import { StoryBibleLocksEditor } from '../../client/src/components/writing/storyBible/StoryBibleLocksEditor'

const room = vi.hoisted(() => ({ blocks: new Map<string, string>(), banked: [] as string[] }))
vi.mock('../../server/room/store', () => ({
  getSharedBlockValue: async (id: string) => room.blocks.get(id) ?? '',
  casUpdateSharedBlock: async ({ projectId, expected, next }: { projectId: string; expected: string; next: string }) => {
    if ((room.blocks.get(projectId) ?? '') !== expected) return false
    room.blocks.set(projectId, next)
    return true
  },
}))
vi.mock('../../server/projectMemory/roomBridge', () => ({
  bridgeStoryLocksToMemory: async ({ storyLocksValue }: { storyLocksValue: string }) => { room.banked.push(storyLocksValue) },
}))
afterEach(() => { vi.unstubAllGlobals(); room.blocks.clear(); room.banked.length = 0 })

it('F18 finishes lock edits once through the unchanged server banking path without Room mounted', async () => {
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    const id = url.split('/')[3]
    const result = await syncSurfaceLocks(id, JSON.parse(String(init.body)).value)
    return new Response(JSON.stringify({ ok: result === 'ok' }), { status: result === 'ok' ? 200 : 409 })
  })
  const view = render(<><StoryBibleLocksEditor value={[]} onChange={() => {}} /><button>Outside</button></>)
  const editor = view.container.firstElementChild!
  const hook = renderHook(({ id, text, editing }) => useStoryLocksSync(id, text, editing), {
    initialProps: { id: 'a', text: '', editing: true },
  })
  await act(async () => {})
  hook.rerender({ id: 'a', text: 'Half', editing: true })
  hook.rerender({ id: 'a', text: 'Final lock', editing: true })
  expect(room.banked).toEqual([])
  fireEvent.focusOut(editor, { relatedTarget: view.getByText('Outside') })
  await waitFor(() => expect(room.banked).toHaveLength(1))
  expect(room.banked[0]).toContain('Final lock')
  expect(room.banked[0]).not.toContain('Half')
  await act(async () => { await hook.result.current() })
  expect(room.banked).toHaveLength(1)
  hook.rerender({ id: 'a', text: 'Saved lock', editing: true })
  await act(async () => { await hook.result.current() })
  expect(room.banked).toHaveLength(2)
  hook.rerender({ id: 'a', text: 'Leaving lock', editing: false })
  await waitFor(() => expect(room.banked).toHaveLength(3))
  hook.rerender({ id: 'a', text: 'Before switching', editing: true })
  hook.rerender({ id: 'b', text: '', editing: true })
  await waitFor(() => expect(room.banked).toHaveLength(4))
  expect(room.blocks.get('a')).toContain('Before switching')
  expect(room.blocks.get('b') ?? '').not.toContain('Before switching')
})
