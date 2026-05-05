import { useState, useCallback } from 'react'
import { loadProjectState, saveProjectState } from './projectState'
import type { ProjectState, Beat, Character, AgentId, TranscriptMessage, ScriptScene } from './projectState'

export function useProjectState() {
  const [state, setState] = useState<ProjectState>(() => loadProjectState())

  const update = useCallback((updater: (s: ProjectState) => ProjectState) => {
    setState(prev => {
      const next = updater(prev)
      saveProjectState(next)
      return next
    })
  }, [])

  const setMeta = useCallback((patch: Partial<ProjectState['meta']>) => {
    update(s => ({ ...s, meta: { ...s.meta, ...patch } }))
  }, [update])

  const setSynopsisSection = useCallback((key: string, value: string) => {
    update(s => ({
      ...s,
      synopsis: {
        ...s.synopsis,
        ...(key === 'logline'
          ? { logline: value }
          : { sections: { ...s.synopsis.sections, [key]: value } }),
      },
    }))
  }, [update])

  const setBeat = useCallback((beatId: string, patch: Partial<Beat>) => {
    update(s => ({
      ...s,
      outline: {
        ...s.outline,
        beats: s.outline.beats.map(b => b.id === beatId ? { ...b, ...patch } : b),
      },
    }))
  }, [update])

  const reorderBeats = useCallback((fromIndex: number, toIndex: number) => {
    update(s => {
      const beats = [...s.outline.beats]
      const [moved] = beats.splice(fromIndex, 1)
      beats.splice(toIndex, 0, moved)
      return { ...s, outline: { ...s.outline, beats } }
    })
  }, [update])

  const addCharacter = useCallback((character: Omit<Character, 'id'>) => {
    update(s => ({
      ...s,
      storyBible: {
        ...s.storyBible,
        characters: [...s.storyBible.characters, { id: crypto.randomUUID(), ...character }],
      },
    }))
  }, [update])

  const updateCharacter = useCallback((id: string, patch: Partial<Character>) => {
    update(s => ({
      ...s,
      storyBible: {
        ...s.storyBible,
        characters: s.storyBible.characters.map(c => c.id === id ? { ...c, ...patch } : c),
      },
    }))
  }, [update])

  const setWorld = useCallback((patch: Partial<ProjectState['storyBible']['world']>) => {
    update(s => ({
      ...s,
      storyBible: { ...s.storyBible, world: { ...s.storyBible.world, ...patch } },
    }))
  }, [update])

  const setThemes = useCallback((value: string) => {
    update(s => ({ ...s, storyBible: { ...s.storyBible, themes: value } }))
  }, [update])

  const setRules = useCallback((value: string) => {
    update(s => ({ ...s, storyBible: { ...s.storyBible, rules: value } }))
  }, [update])

  const addMessage = useCallback((agentId: AgentId, msg: TranscriptMessage) => {
    update(s => ({
      ...s,
      agents: {
        ...s.agents,
        [agentId]: {
          ...s.agents[agentId],
          transcript: [...s.agents[agentId].transcript, msg],
        },
      },
    }))
  }, [update])

  const updateScript = useCallback((rawHtml: string, scenes: ScriptScene[]) => {
    update(s => ({ ...s, script: { ...s.script, rawHtml, scenes } }))
  }, [update])

  return {
    state,
    setMeta,
    setSynopsisSection,
    setBeat,
    reorderBeats,
    addCharacter,
    updateCharacter,
    setWorld,
    setThemes,
    setRules,
    addMessage,
    updateScript,
  }
}
