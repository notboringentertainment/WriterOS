import { useState, useCallback } from 'react'
import { defaultProjectState, loadProjectState, saveProjectState } from './projectState'
import type { ProjectState, Beat, Character, AgentId, TranscriptMessage, ScriptScene } from './projectState'
import { normalizeProjectTitle } from './projectIdentity'

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
    update(s => ({
      ...s,
      meta: {
        ...s.meta,
        ...patch,
        ...(patch.title !== undefined ? { title: normalizeProjectTitle(patch.title) } : {}),
      },
    }))
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

  const clearSynopsis = useCallback(() => {
    update(s => ({ ...s, synopsis: defaultProjectState().synopsis }))
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

  const clearOutline = useCallback(() => {
    update(s => ({ ...s, outline: defaultProjectState().outline }))
  }, [update])

  const reorderBeats = useCallback((fromIndex: number, toIndex: number) => {
    update(s => {
      if (
        !Number.isInteger(fromIndex) ||
        !Number.isInteger(toIndex) ||
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= s.outline.beats.length ||
        toIndex >= s.outline.beats.length ||
        fromIndex === toIndex
      ) {
        return s
      }

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

  const clearStoryBible = useCallback(() => {
    update(s => ({ ...s, storyBible: defaultProjectState().storyBible }))
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

  const clearTranscript = useCallback((agentId: AgentId) => {
    update(s => ({
      ...s,
      agents: {
        ...s.agents,
        [agentId]: {
          ...s.agents[agentId],
          transcript: [],
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
    clearSynopsis,
    setBeat,
    clearOutline,
    reorderBeats,
    addCharacter,
    updateCharacter,
    setWorld,
    setThemes,
    setRules,
    clearStoryBible,
    addMessage,
    clearTranscript,
    updateScript,
  }
}
