import { useCallback, useEffect, useId, useRef } from 'react'

/**
 * Bind request freshness to both the server project and a concrete UI instance.
 * Caller keys are hints, never the whole identity: reused and blank keys cannot
 * let work from one project complete into another.
 */
export function useBoundProjectScopeKey(projectId: string | undefined, projectScopeKey?: string): string {
  const componentScopeId = useId()
  const callerKey = projectScopeKey?.trim()
  const uiInstanceKey = callerKey ? `caller:${projectScopeKey}` : `component:${componentScopeId}`
  return JSON.stringify([projectId ?? null, uiInstanceKey])
}

/** A render-synchronous mounted/scope predicate without operation invalidation. */
export function useProjectScopeCurrent(projectScopeKey: string): () => boolean {
  const stateRef = useRef({ projectScopeKey, mounted: true })
  if (stateRef.current.projectScopeKey !== projectScopeKey) {
    stateRef.current = { projectScopeKey, mounted: true }
  }

  useEffect(() => {
    const effectScopeKey = projectScopeKey
    stateRef.current.mounted = true
    return () => {
      if (stateRef.current.projectScopeKey === effectScopeKey) stateRef.current.mounted = false
    }
  }, [projectScopeKey])

  return useCallback(() => (
    stateRef.current.mounted
    && stateRef.current.projectScopeKey === projectScopeKey
  ), [projectScopeKey])
}

export function useProjectRequestGeneration(projectScopeKey: string): () => () => boolean {
  const stateRef = useRef({ projectScopeKey, generation: 0, mounted: true })
  if (stateRef.current.projectScopeKey !== projectScopeKey) {
    stateRef.current = { projectScopeKey, generation: stateRef.current.generation + 1, mounted: true }
  }

  useEffect(() => {
    const effectScopeKey = projectScopeKey
    stateRef.current.mounted = true
    return () => {
      if (stateRef.current.projectScopeKey === effectScopeKey) {
        stateRef.current.mounted = false
        stateRef.current.generation += 1
      }
    }
  }, [projectScopeKey])

  return useCallback(() => {
    const requestProjectScopeKey = projectScopeKey
    const requestGeneration = ++stateRef.current.generation
    return () => (
      stateRef.current.mounted
      && stateRef.current.projectScopeKey === requestProjectScopeKey
      && stateRef.current.generation === requestGeneration
    )
  }, [projectScopeKey])
}
