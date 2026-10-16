import React, { useEffect, useState } from 'react'
import type { PageDocument, PageName, ProjectPages } from '@shared/pages'
import type { ProjectMemoryRecord, ProjectMemorySnapshot } from '@shared/projectMemory'
import { requestPage, StalePageError } from '../../lib/pagesApi'
import { useBoundProjectScopeKey, useProjectScopeCurrent } from '../../lib/useProjectRequestGeneration'
import './pages.css'

export const PAGE_NAMES: PageName[] = ['outline', 'treatment', 'synopsis']
const needs: Record<PageName, string[]> = {
  synopsis: ['Who we follow', 'What they want', 'What stands in the way', 'The stakes', 'The turn', 'The ending'],
  treatment: ['The story and its world', 'The people we follow', 'The opening', 'The acts and turning points', 'The ending', 'Tone and style'],
  outline: ['The setup', 'The people and their goals', 'The story in order', 'The turning points', 'The stakes', 'The ending'],
}
export function changedCanon(page: PageDocument | undefined, snapshot?: ProjectMemorySnapshot): Array<Pick<ProjectMemoryRecord, 'id' | 'claim'>> {
  if (page?.status !== 'approved' || !snapshot) return []
  const approved = new Map((page.approvedCanon ?? []).map(record => [record.id, record.version]))
  const active = snapshot.records.filter(record => record.kind === 'canon' && record.status === 'active')
  const current = new Map(active.map(record => [record.id, record.updatedAt]))
  const changed = snapshot.records.filter(record => record.kind === 'canon' && (
    (current.has(record.id) && approved.get(record.id) !== current.get(record.id)) ||
    (approved.has(record.id) && !current.has(record.id))
  ))
  for (const id of approved.keys()) {
    if (!snapshot.records.some(record => record.id === id)) changed.push({ id, claim: `Earlier canon record ${id} is no longer active.` } as ProjectMemoryRecord)
  }
  return changed
}
export function pageStatus(page: PageDocument | undefined, snapshot?: ProjectMemorySnapshot) {
  return !page?.markdown.trim() ? 'not started' : changedCanon(page, snapshot).length ? 'out of date' : page.status
}
export function PageProse({ markdown }: { markdown: string }) {
  const inline = (text: string) => text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/).map((part, i) =>
    part.startsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part.startsWith('*') ? <em key={i}>{part.slice(1, -1)}</em> : part)
  const blocks = markdown.replace(/^(#{1,6}\s+.+)$/gm, '\n\n$1\n\n').split(/\n\s*\n/).map(block => block.trim()).filter(Boolean)
  return <article className="pages-prose">{blocks.map((block, i) => {
    const heading = /^(#{1,6})\s+(.+)$/.exec(block)
    if (heading) return <h2 key={i}>{inline(heading[2])}</h2>
    if (/^[-*] /m.test(block)) return <ul key={i}>{block.split('\n').map((line, j) => <li key={j}>{inline(line.replace(/^[-*] /, ''))}</li>)}</ul>
    return <p key={i}>{inline(block)}</p>
  })}</article>
}
export function Pages({ projectId, selected, onSelect, pages, onPage, snapshot, onAskMorgan }: {
  projectId: string | null; selected: PageName; onSelect: (page: PageName) => void;
  pages: ProjectPages; onPage: (page: PageDocument) => void; snapshot?: ProjectMemorySnapshot;
  onAskMorgan: (text: string) => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const scopeKey = useBoundProjectScopeKey(projectId ?? undefined, selected)
  const scopeIsCurrent = useProjectScopeCurrent(scopeKey)
  useEffect(() => { setBusy(false) }, [scopeKey])
  useEffect(() => {
    setError(null)
    if (!projectId) return
    let cancelled = false
    setLoading(true)
    void requestPage(projectId, selected).then(page => { if (!cancelled) onPage(page) })
      .catch(error => { if (!cancelled) setError(error.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [projectId, selected, onPage])
  const page = pages[selected]
  const title = selected[0].toUpperCase() + selected.slice(1)
  const changed = changedCanon(page, snapshot)
  async function approve() {
    if (!page || !projectId || !snapshot) return
    setBusy(true); setError(null)
    try {
      const approved = await requestPage(projectId, selected, { ...page, status: 'approved', approvedAt: new Date().toISOString(),
        approvedCanon: snapshot.records.filter(record => record.kind === 'canon' && record.status === 'active').map(record => ({ id: record.id, version: record.updatedAt })) })
      if (scopeIsCurrent()) onPage(approved)
    } catch (error) {
      if (!scopeIsCurrent()) return
      if (error instanceof StalePageError) onPage(error.currentPage)
      setError(error instanceof Error ? error.message : 'Could not approve this page. Try again.')
    } finally { if (scopeIsCurrent()) setBusy(false) }
  }
  async function ask(update = false) {
    setBusy(true); setError(null)
    try { await onAskMorgan(`${update ? 'Update' : 'Write'} the ${selected} page from canon. Read its format, the other pages and the beat sheet first. Ask only about missing items, one at a time.`) }
    catch { if (scopeIsCurrent()) setError("Morgan isn't running yet. Open her panel with the M button and try again.") }
    finally { if (scopeIsCurrent()) setBusy(false) }
  }
  return <section className="pages-sheet">
    <nav aria-label="Pages" className="pages-switch">{PAGE_NAMES.map(name => <button key={name} aria-current={selected === name ? 'page' : undefined} onClick={() => onSelect(name)}>
      {name[0].toUpperCase() + name.slice(1)} <small>{pageStatus(pages[name], snapshot)}</small>
    </button>)}</nav>
    <h1>{title}</h1>
    {error && <p role="alert" className="pages-notice">{error}</p>}
    {loading && <p role="status">Opening {selected}…</p>}
    {!page?.markdown.trim() ? <>
      <p className="pages-lede">Morgan writes the {selected} from canon. She asks only about what canon doesn't answer yet.</p>
      <button className="pages-button" disabled={busy || !projectId} onClick={() => void ask()}>Write it with Morgan</button>
      {!projectId && <p>Open a project from your project folder to write pages with Morgan.</p>}
      <ul className="pages-needs" aria-label={`What an ${selected} needs`}>{needs[selected].map(item => <li key={item}>{item}</li>)}</ul>
    </> : <>
      <div className="pages-meta"><span>Written by Morgan from canon</span><span>·</span>
        <span>{page.status === 'approved' && page.approvedAt ? `Approved ${new Date(page.approvedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : 'Draft'}</span>
        <span>·</span><span>{page.markdown.trim().split(/\s+/).length.toLocaleString()} words</span>
        {page.status === 'draft' && <button className="pages-button" disabled={busy || !snapshot || !projectId} onClick={() => void approve()}>Approve</button>}
      </div>
      {changed.length > 0 && <div className="pages-notice"><p>Canon changed after this was approved.</p>
        <ul>{changed.map(record => <li key={record.id}>{record.claim}</li>)}</ul>
        <button className="pages-button" disabled={busy || !projectId} onClick={() => void ask(true)}>Ask Morgan to update</button>
      </div>}
      <PageProse markdown={page.markdown} />
    </>}
  </section>
}
