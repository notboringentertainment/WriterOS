import { useCallback, useEffect, useRef } from 'react'

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
