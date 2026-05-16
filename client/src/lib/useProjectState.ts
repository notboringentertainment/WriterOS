import { useState, useCallback } from 'react'
import { defaultProjectState } from './projectState'
import {
  createBlankProject,
  getStoredProject,
  loadActiveProjectLibrary,
  saveProjectToLibrary,
  summarizeProjects,
} from './projectLibrary'
import type { ProjectState, Beat, Character, AgentId, TranscriptMessage, ScriptScene } from './projectState'
import { normalizeProjectTitle } from './projectIdentity'
import type { SynopsisDocumentContent, DocumentViewPreferences } from '@shared/documents'
import { createEmptySynopsisContent, DOCUMENT_SCHEMA_VERSION } from '@shared/documents'
import { documentsToLegacy } from './documentMigration'

export function useProjectState() {
  const [initialLibrary] = useState(() => loadActiveProjectLibrary())
  const [state, setState] = useState<ProjectState>(() => initialLibrary.state)
  const [activeProjectId, setActiveProjectId] = useState(() => initialLibrary.activeProjectId)
  const [projects, setProjects] = useState(() => initialLibrary.projects)

  const update = useCallback((updater: (s: ProjectState) => ProjectState) => {
    setState(prev => {
      const next = updater(prev)
      setProjects(currentProjects => saveProjectToLibrary(activeProjectId, next, currentProjects))
      return next
    })
  }, [activeProjectId])

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
    update(s => {
      const ts = new Date(
        Math.max(Date.now(), new Date(s.documents.synopsis.updatedAt).getTime() + 1),
      ).toISOString()
      return {
        ...s,
        synopsis: defaultProjectState().synopsis,
        documents: {
          ...s.documents,
          synopsis: {
            version: DOCUMENT_SCHEMA_VERSION,
            mode: 'prose' as const,
            updatedAt: ts,
            content: createEmptySynopsisContent(),
            // viewPreferences intentionally omitted on clear
          },
        },
      }
    })
  }, [update])

  const setSynopsisDocument = useCallback(
    (updater: (content: SynopsisDocumentContent) => SynopsisDocumentContent) => {
      update(s => {
        const nextContent = updater(s.documents.synopsis.content)
        const prevUpdatedAt = new Date(s.documents.synopsis.updatedAt).getTime()
        const nextSynopsisDoc = {
          ...s.documents.synopsis,
          updatedAt: new Date(Math.max(Date.now(), prevUpdatedAt + 1)).toISOString(),
          content: nextContent,
        }
        const nextDocuments = { ...s.documents, synopsis: nextSynopsisDoc }
        const nextLegacySlice = documentsToLegacy(nextDocuments).synopsis
        return {
          ...s,
          documents: nextDocuments,
          synopsis: nextLegacySlice,
        }
      })
    },
    [update],
  )

  const setSynopsisViewPreferences = useCallback(
    (patch: Partial<DocumentViewPreferences>) => {
      update(s => ({
        ...s,
        documents: {
          ...s.documents,
          synopsis: {
            ...s.documents.synopsis,
            viewPreferences: {
              ...(s.documents.synopsis.viewPreferences ?? {}),
              ...patch,
            },
          },
        },
      }))
    },
    [update],
  )

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

  const createProject = useCallback(() => {
    const savedProjects = saveProjectToLibrary(activeProjectId, state, projects)
    const next = createBlankProject(savedProjects)
    setActiveProjectId(next.activeProjectId)
    setState(next.state)
    setProjects(next.projects)
  }, [activeProjectId, projects, state])

  const switchProject = useCallback((projectId: string) => {
    if (projectId === activeProjectId) return

    const savedProjects = saveProjectToLibrary(activeProjectId, state, projects)
    const project = getStoredProject(projectId, savedProjects)
    if (!project) return

    const nextProjects = saveProjectToLibrary(project.id, project.state, savedProjects)
    setActiveProjectId(project.id)
    setState(project.state)
    setProjects(nextProjects)
  }, [activeProjectId, projects, state])

  return {
    state,
    activeProjectId,
    projects: summarizeProjects(projects),
    setMeta,
    setSynopsisSection,
    clearSynopsis,
    setSynopsisDocument,
    setSynopsisViewPreferences,
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
    createProject,
    switchProject,
  }
}
