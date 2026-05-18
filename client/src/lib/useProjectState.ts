import { useState, useCallback } from 'react'
import { defaultProjectState } from './projectState'
import {
  createBlankProject,
  deleteProjectFromLibrary,
  getStoredProject,
  loadActiveProjectLibrary,
  saveProjectToLibrary,
  summarizeProjects,
} from './projectLibrary'
import type { ProjectState, Beat, Character, AgentId, TranscriptMessage, ScriptScene } from './projectState'
import { normalizeProjectTitle } from './projectIdentity'
import type { SynopsisDocumentContent, StoryBibleDocumentContent, DocumentViewPreferences } from '@shared/documents'
import {
  createEmptySeriesContent,
  createEmptyStoryBibleContent,
  createEmptySynopsisContent,
  DOCUMENT_SCHEMA_VERSION,
} from '@shared/documents'
import { documentsToLegacy, mergeStoryBibleLegacyIntoContent } from './documentMigration'
import { normalizeProjectFormat, type ProjectFormat } from '@shared/projectFormat'

function nextTimestampAfter(value: string): string {
  return new Date(Math.max(Date.now(), new Date(value).getTime() + 1)).toISOString()
}

function withProjectFormat(state: ProjectState, value: unknown): ProjectState {
  const format = normalizeProjectFormat(value)
  const seriesPatch =
    format === 'series' && state.documents.synopsis.content.series === undefined
      ? { series: createEmptySeriesContent() }
      : {}

  return {
    ...state,
    meta: {
      ...state.meta,
      format,
    },
    documents: {
      ...state.documents,
      synopsis: {
        ...state.documents.synopsis,
        updatedAt: nextTimestampAfter(state.documents.synopsis.updatedAt),
        content: {
          ...state.documents.synopsis.content,
          ...seriesPatch,
          header: {
            ...state.documents.synopsis.content.header,
            format,
          },
        },
      },
      storyBible: {
        ...state.documents.storyBible,
        updatedAt: nextTimestampAfter(state.documents.storyBible.updatedAt),
        content: {
          ...state.documents.storyBible.content,
          cover: {
            ...state.documents.storyBible.content.cover,
            format,
          },
        },
      },
    },
  }
}

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
    update(s => {
      const next = {
        ...s,
        meta: {
          ...s.meta,
          ...patch,
          ...(patch.title !== undefined ? { title: normalizeProjectTitle(patch.title) } : {}),
        },
      }

      return patch.format !== undefined
        ? withProjectFormat(next, patch.format)
        : next
    })
  }, [update])

  const setProjectFormat = useCallback((format: ProjectFormat) => {
    update(s => withProjectFormat(s, format))
  }, [update])

  const clearSynopsis = useCallback(() => {
    update(s => {
      const ts = new Date(
        Math.max(Date.now(), new Date(s.documents.synopsis.updatedAt).getTime() + 1),
      ).toISOString()
      const format = normalizeProjectFormat(s.meta.format)
      const content = createEmptySynopsisContent()
      content.header.format = format
      if (format === 'series') {
        content.series = createEmptySeriesContent()
      }
      return {
        ...s,
        synopsis: defaultProjectState().synopsis,
        documents: {
          ...s.documents,
          synopsis: {
            version: DOCUMENT_SCHEMA_VERSION,
            mode: 'prose' as const,
            updatedAt: ts,
            content,
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

  const setStoryBibleDocument = useCallback(
    (updater: (content: StoryBibleDocumentContent) => StoryBibleDocumentContent) => {
      update(s => {
        const format = normalizeProjectFormat(s.meta.format)
        const nextContent = updater(s.documents.storyBible.content)
        const nextStoryBibleDoc = {
          ...s.documents.storyBible,
          updatedAt: nextTimestampAfter(s.documents.storyBible.updatedAt),
          content: {
            ...nextContent,
            cover: {
              ...nextContent.cover,
              format,
            },
          },
        }
        const nextDocuments = { ...s.documents, storyBible: nextStoryBibleDoc }
        const nextLegacySlice = documentsToLegacy(nextDocuments).storyBible
        return {
          ...s,
          documents: nextDocuments,
          storyBible: nextLegacySlice,
        }
      })
    },
    [update],
  )

  const setStoryBibleViewPreferences = useCallback(
    (patch: Partial<DocumentViewPreferences>) => {
      update(s => ({
        ...s,
        documents: {
          ...s.documents,
          storyBible: {
            ...s.documents.storyBible,
            viewPreferences: {
              ...(s.documents.storyBible.viewPreferences ?? {}),
              ...patch,
            },
          },
        },
      }))
    },
    [update],
  )

  const migrateStoryBibleLegacyToDocument = useCallback(() => {
    update(s => {
      if (s.documents.storyBible.viewPreferences?.migratedFromLegacyStoryBible) return s

      const format = normalizeProjectFormat(s.meta.format)
      const mergedContent = mergeStoryBibleLegacyIntoContent(
        s.documents.storyBible.content,
        s.storyBible,
      )
      const nextStoryBibleDoc = {
        ...s.documents.storyBible,
        updatedAt: nextTimestampAfter(s.documents.storyBible.updatedAt),
        content: {
          ...mergedContent,
          cover: {
            ...mergedContent.cover,
            format,
          },
        },
        viewPreferences: {
          ...(s.documents.storyBible.viewPreferences ?? {}),
          migratedFromLegacyStoryBible: true,
        },
      }
      const nextDocuments = { ...s.documents, storyBible: nextStoryBibleDoc }

      return {
        ...s,
        documents: nextDocuments,
        storyBible: documentsToLegacy(nextDocuments).storyBible,
      }
    })
  }, [update])

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
    setStoryBibleDocument(content => ({
      ...content,
      characters: [
        ...content.characters,
        {
          id: crypto.randomUUID(),
          name: character.name,
          role: character.role,
          want: character.want,
          need: character.need,
          flaw: character.wound,
          secret: '',
          contradiction: '',
          arc: character.arc,
          relationshipPressure: '',
          behavioralAnchors: '',
          speechPatterns: '',
          neverWriteThemAs: '',
          continuityFacts: '',
        },
      ],
    }))
  }, [setStoryBibleDocument])

  const updateCharacter = useCallback((id: string, patch: Partial<Character>) => {
    setStoryBibleDocument(content => ({
      ...content,
      characters: content.characters.map(c => c.id === id
        ? {
            ...c,
            ...(patch.name !== undefined ? { name: patch.name } : {}),
            ...(patch.role !== undefined ? { role: patch.role } : {}),
            ...(patch.want !== undefined ? { want: patch.want } : {}),
            ...(patch.need !== undefined ? { need: patch.need } : {}),
            ...(patch.wound !== undefined ? { flaw: patch.wound } : {}),
            ...(patch.arc !== undefined ? { arc: patch.arc } : {}),
          }
        : c),
    }))
  }, [setStoryBibleDocument])

  const setWorld = useCallback((patch: Partial<ProjectState['storyBible']['world']>) => {
    setStoryBibleDocument(content => ({
      ...content,
      premiseAndWorld: {
        ...content.premiseAndWorld,
        ...(patch.setting !== undefined ? { premise: patch.setting } : {}),
      },
      toneAndStyle: {
        ...content.toneAndStyle,
        ...(patch.toneAnchors !== undefined
          ? {
              comps: patch.toneAnchors
                .split(',')
                .map(value => value.trim())
                .filter(value => value.length > 0),
            }
          : {}),
        ...(patch.voiceNotes !== undefined ? { dialogueStyle: patch.voiceNotes } : {}),
      },
    }))
  }, [setStoryBibleDocument])

  const setThemes = useCallback((value: string) => {
    setStoryBibleDocument(content => ({
      ...content,
      onePagePitch: { ...content.onePagePitch, whyThisMatters: value },
    }))
  }, [setStoryBibleDocument])

  const setRules = useCallback((value: string) => {
    setStoryBibleDocument(content => ({
      ...content,
      premiseAndWorld: { ...content.premiseAndWorld, worldRules: value },
    }))
  }, [setStoryBibleDocument])

  const clearStoryBible = useCallback(() => {
    update(s => {
      const format = normalizeProjectFormat(s.meta.format)
      const content = createEmptyStoryBibleContent()
      content.cover.format = format
      const nextStoryBibleDoc = {
        version: DOCUMENT_SCHEMA_VERSION,
        mode: 'development' as const,
        updatedAt: nextTimestampAfter(s.documents.storyBible.updatedAt),
        content,
        // viewPreferences intentionally omitted on clear
      }
      const nextDocuments = { ...s.documents, storyBible: nextStoryBibleDoc }
      return {
        ...s,
        storyBible: defaultProjectState().storyBible,
        documents: nextDocuments,
      }
    })
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

  const saveNow = useCallback(() => {
    const nextProjects = saveProjectToLibrary(activeProjectId, state, projects)
    setProjects(nextProjects)
  }, [activeProjectId, projects, state])

  const deleteProject = useCallback(() => {
    const next = deleteProjectFromLibrary(activeProjectId, projects)
    setActiveProjectId(next.activeProjectId)
    setState(next.state)
    setProjects(next.projects)
  }, [activeProjectId, projects])

  return {
    state,
    activeProjectId,
    projects: summarizeProjects(projects),
    setMeta,
    setProjectFormat,
    clearSynopsis,
    setSynopsisDocument,
    setSynopsisViewPreferences,
    setStoryBibleDocument,
    setStoryBibleViewPreferences,
    migrateStoryBibleLegacyToDocument,
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
    saveNow,
    deleteProject,
  }
}
