import { useCallback, useRef } from 'react'

export function useProjectRequestGeneration(projectId: string | undefined): () => () => boolean {
  const stateRef = useRef({ projectId, generation: 0 })
  if (stateRef.current.projectId !== projectId) {
    stateRef.current = { projectId, generation: stateRef.current.generation + 1 }
  }

  return useCallback(() => {
    const requestProjectId = projectId
    const requestGeneration = ++stateRef.current.generation
    return () => (
      stateRef.current.projectId === requestProjectId
      && stateRef.current.generation === requestGeneration
    )
  }, [projectId])
}
