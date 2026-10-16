import { useCallback, useEffect, useMemo } from 'react'
import { syncStoryLocksBlock } from './roomApi'

export function useStoryLocksSync(projectId: string, text: string, editing: boolean) {
  const pending = useMemo(() => ({ text, sent: '', writing: Promise.resolve(true) }), [projectId])
  pending.text = text
  const finish = useCallback(() => {
    if (!projectId || pending.text === pending.sent) return pending.writing
    const value = pending.text
    pending.sent = value
    pending.writing = pending.writing.then(async () => {
      const result = await syncStoryLocksBlock(projectId, value)
      if (result.outcome === 'ok') return true
      if (pending.sent === value) pending.sent = ''
      return false
    })
    return pending.writing
  }, [pending, projectId])

  useEffect(() => {
    void finish()
    return () => { void finish() }
  }, [finish])

  useEffect(() => {
    if (!editing) void finish()
  }, [editing, finish])

  useEffect(() => {
    const blur = (event: FocusEvent) => {
      const editor = event.target instanceof Element ? event.target.closest('[data-story-locks-editor]') : null
      if (editor && !(event.relatedTarget instanceof Node && editor.contains(event.relatedTarget))) void finish()
    }
    const leave = () => { void finish() }
    document.addEventListener('focusout', blur)
    window.addEventListener('pagehide', leave)
    return () => {
      document.removeEventListener('focusout', blur)
      window.removeEventListener('pagehide', leave)
    }
  }, [finish])
  return finish
}
