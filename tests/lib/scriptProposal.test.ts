import { Editor } from '@tiptap/core'
import { afterEach, describe, expect, it } from 'vitest'
import { applyScriptProposal, locateTarget } from '../../client/src/lib/scriptProposal'
import { createScreenplayExtensions } from '../../client/src/components/writing/screenplay/ScreenplayEditor'
import type { ScriptBlock, PageProposal } from '@shared/morganLive'

const script: ScriptBlock[] = [
  { type: 'scene-heading', text: 'INT. ROOM - NIGHT' }, { type: 'action', text: 'Dishes.' },
  { type: 'scene-heading', text: 'EXT. YARD - DAY' }, { type: 'action', text: 'Wind.' },
  { type: 'scene-heading', text: 'INT. ROOM - NIGHT' }, { type: 'action', text: 'Later.' },
]
const editors: Editor[] = []
function editorWith(blocks = script) {
  const editor = new Editor({ extensions: createScreenplayExtensions({}), content: { type: 'doc', content: blocks.map(b => ({ type: 'paragraph', attrs: { elementType: b.type }, content: b.text ? [{ type: 'text', text: b.text }] : [] })) } })
  editors.push(editor)
  return editor
}
afterEach(() => editors.splice(0).forEach(e => e.destroy()))
function rows(e: Editor) { const blocks: ScriptBlock[] = []; e.state.doc.forEach(n => blocks.push({ type: n.attrs.elementType, text: n.textContent })); return blocks }
const yard = { kind: 'replace-scene' as const, sceneHeading: 'EXT. YARD - DAY', expectedScene: script.slice(2, 4) }
const proposal = (target: Extract<PageProposal, { surface: 'script' }>['target'] = yard): Extract<PageProposal, { surface: 'script' }> => ({ surface: 'script', summary: 'A change', target, blocks: [{ type: 'action', text: 'Rain.' }] })

describe('script proposals', () => {
  it('replaces exactly the scene read and preserves its neighbours', () => {
    const e = editorWith()
    expect(applyScriptProposal(e, proposal())).toEqual({ ok: true })
    expect(rows(e)).toEqual([...script.slice(0, 2), { type: 'action', text: 'Rain.' }, ...script.slice(4)])
    expect(locateTarget(editorWith().state.doc, yard)).toHaveProperty('from')
  })
  it.each([
    { type: 'action' as const, text: 'Wind. changed' },
    { type: 'dialogue' as const, text: 'Wind.' },
    { type: 'action' as const, text: 'Wind. ' },
  ])('rejects changes to exact text or element types: %j', changed => {
    const e = editorWith([...script.slice(0, 3), changed, ...script.slice(4)])
    const before = rows(e)
    expect(applyScriptProposal(e, proposal())).toEqual({ ok: false, reason: 'stale' })
    expect(rows(e)).toEqual(before)
  })
  it('distinguishes repeated headings by exact contents and rejects identical twins', () => {
    const target = { kind: 'insert-after-scene' as const, sceneHeading: 'INT. ROOM - NIGHT', expectedScene: script.slice(4) }
    const e = editorWith()
    expect(applyScriptProposal(e, proposal(target))).toEqual({ ok: true })
    expect(rows(e).at(-1)?.text).toBe('Rain.')
    const twins = editorWith([...script.slice(0, 2), ...script.slice(0, 2)])
    expect(applyScriptProposal(twins, proposal({ ...target, expectedScene: script.slice(0, 2) }))).toEqual({ ok: false, reason: 'ambiguous' })
  })
  it('checks the last scene before appending', () => {
    const e = editorWith()
    const p = { ...proposal({ kind: 'append' }), expectedEnding: script.slice(4) }
    expect(applyScriptProposal(e, p)).toEqual({ ok: true })
    expect(applyScriptProposal(e, p)).toEqual({ ok: false, reason: 'stale' })
  })
  it('isolates a kept change from typing on both sides', () => {
    const e = editorWith()
    e.commands.insertContentAt(e.state.doc.content.size - 1, ' More.')
    const typed = rows(e)
    applyScriptProposal(e, proposal({ kind: 'append' }))
    const kept = rows(e)
    e.commands.insertContentAt(e.state.doc.content.size - 1, '!')
    e.commands.undo()
    expect(rows(e)).toEqual(kept)
    e.commands.undo()
    expect(rows(e)).toEqual(typed)
    e.commands.undo()
    expect(rows(e)).toEqual(script)
  })
})
