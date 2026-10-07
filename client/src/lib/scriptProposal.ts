import type { Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { closeHistory } from '@tiptap/pm/history'
import type { PageProposal, ScriptTarget } from '@shared/morganLive'

export type ScriptProposal = Extract<PageProposal, { surface: 'script' }>
type Block = { type: string; text: string }
const same = (a: Block[], b: Block[]) => a.length === b.length && a.every((x, i) => x.type === b[i].type && x.text === b[i].text)
interface Scene { from: number; to: number; heading: string; blocks: Block[] }
function scenes(doc: PMNode): Scene[] {
  const out: Scene[] = []
  doc.forEach((node, offset) => {
    if (node.attrs.elementType === 'scene-heading') out.push({ from: offset, to: doc.content.size, heading: node.textContent, blocks: [] })
    out.at(-1)?.blocks.push({ type: String(node.attrs.elementType), text: node.textContent })
  })
  for (let i = 0; i < out.length - 1; i++) out[i].to = out[i + 1].from
  return out
}

export function locateTarget(doc: PMNode, target: ScriptTarget, expectedEnding?: Block[]):
  { from: number; to: number } | { at: number } | 'stale' | 'ambiguous' {
  const all = scenes(doc)
  if (target.kind === 'append') {
    if (expectedEnding !== undefined && !same(all.at(-1)?.blocks ?? [], expectedEnding)) return 'stale'
    return { at: doc.content.size }
  }
  const matches = all.filter(sc => sc.heading.trim().toUpperCase() === target.sceneHeading.trim().toUpperCase() && same(sc.blocks, target.expectedScene))
  if (!matches.length) return 'stale'
  if (matches.length > 1) return 'ambiguous'
  const sc = matches[0]
  return target.kind === 'replace-scene' ? { from: sc.from, to: sc.to } : { at: sc.to }
}

export function applyScriptProposal(editor: Editor, p: ScriptProposal): { ok: true } | { ok: false; reason: 'stale' | 'ambiguous' } {
  const place = locateTarget(editor.state.doc, p.target, p.expectedEnding)
  if (place === 'stale' || place === 'ambiguous') return { ok: false, reason: place }
  const { schema } = editor.state
  const nodes = p.blocks.map(b => schema.nodes.paragraph.create({ elementType: b.type }, b.text ? schema.text(b.text) : null))
  const tr = closeHistory(editor.state.tr)
  if ('from' in place) tr.replaceWith(place.from, place.to, nodes)
  else tr.insert(place.at, nodes)
  editor.view.dispatch(tr)
  editor.view.dispatch(closeHistory(editor.state.tr))
  return { ok: true }
}
