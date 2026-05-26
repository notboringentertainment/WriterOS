import { useState, useCallback } from 'react'
import { defaultProjectState } from './projectState'
import {
  activateStoredProject,
  archiveProjectInLibrary,
  createBlankProject,
  createProjectFromState,
  deleteProjectFromLibrary,
  getStoredProject,
  loadActiveProjectLibrary,
  projectsForActiveLibrary,
  restoreProjectInLibrary,
  saveProjectToLibrary,
  summarizeProjects,
} from './projectLibrary'
import type { StoredProject } from './projectLibrary'
import type { ProjectSourceImportMetadata, ProjectState, Beat, Character, AgentId, TranscriptMessage, ScriptScene } from './projectState'
import { normalizeProjectTitle } from './projectIdentity'
import type {
  SynopsisDocumentContent,
  StoryBibleDocumentContent,
  OutlineDocumentContent,
  OutlineEpisode,
  TreatmentDocumentContent,
  DocumentViewPreferences,
} from '@shared/documents'
import {
  createEmptyOutlineContent,
  createEmptySeriesContent,
  createEmptyStoryBibleContent,
  createEmptySynopsisContent,
  createEmptyTreatmentContent,
  DOCUMENT_SCHEMA_VERSION,
} from '@shared/documents'
import { documentsToLegacy, mergeOutlineLegacyIntoContent, mergeStoryBibleLegacyIntoContent, normalizeOutlineContent } from './documentMigration'
import { normalizeProjectFormat, type ProjectFormat } from '@shared/projectFormat'
import { createOutlineEpisode } from './outlineDeck'

export interface ImportedScriptPayload {
  rawHtml: string
  scenes: ScriptScene[]
  title?: string | null
  wordCount: number
  pageCount: number
  sourceImport: ProjectSourceImportMetadata
}

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
      treatment: {
        ...state.documents.treatment,
        updatedAt: nextTimestampAfter(state.documents.treatment.updatedAt),
        content: {
          ...state.documents.treatment.content,
          header: {
            ...state.documents.treatment.content.header,
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
    update(s => {
      const outline = {
        ...s.outline,
        beats: s.outline.beats.map(b => b.id === beatId ? { ...b, ...patch } : b),
      }
      const nextOutlineDoc = {
        ...s.documents.outline,
        updatedAt: nextTimestampAfter(s.documents.outline.updatedAt),
        content: mergeOutlineLegacyIntoContent(s.documents.outline.content, outline),
      }
      return {
        ...s,
        outline,
        documents: {
          ...s.documents,
          outline: nextOutlineDoc,
        },
      }
    })
  }, [update])

  const setOutlineDocument = useCallback(
    (updater: (content: OutlineDocumentContent) => OutlineDocumentContent) => {
      update(s => {
        const outlineFormat = normalizeProjectFormat(s.meta.format)
        const nextContent = updater(normalizeOutlineContent(s.documents.outline.content))
        const nextOutlineDoc = {
          ...s.documents.outline,
          updatedAt: nextTimestampAfter(s.documents.outline.updatedAt),
          content: nextContent,
        }
        const nextDocuments = { ...s.documents, outline: nextOutlineDoc }
        return {
          ...s,
          documents: nextDocuments,
          outline: documentsToLegacy(nextDocuments, { outlineFormat }).outline,
        }
      })
    },
    [update],
  )

  const setOutlineViewPreferences = useCallback(
    (patch: Partial<DocumentViewPreferences>) => {
      update(s => ({
        ...s,
        documents: {
          ...s.documents,
          outline: {
            ...s.documents.outline,
            viewPreferences: {
              ...(s.documents.outline.viewPreferences ?? {}),
              ...patch,
            },
          },
        },
      }))
    },
    [update],
  )

  const setTreatmentDocument = useCallback(
    (updater: (content: TreatmentDocumentContent) => TreatmentDocumentContent) => {
      update(s => {
        const format = normalizeProjectFormat(s.meta.format)
        const nextContent = updater(s.documents.treatment.content)
        const nextTreatmentDoc = {
          ...s.documents.treatment,
          updatedAt: nextTimestampAfter(s.documents.treatment.updatedAt),
          content: {
            ...nextContent,
            header: {
              ...nextContent.header,
              format,
            },
          },
        }
        return {
          ...s,
          documents: {
            ...s.documents,
            treatment: nextTreatmentDoc,
          },
        }
      })
    },
    [update],
  )

  const setTreatmentViewPreferences = useCallback(
    (patch: Partial<DocumentViewPreferences>) => {
      update(s => ({
        ...s,
        documents: {
          ...s.documents,
          treatment: {
            ...s.documents.treatment,
            viewPreferences: {
              ...(s.documents.treatment.viewPreferences ?? {}),
              ...patch,
            },
          },
        },
      }))
    },
    [update],
  )

  const clearTreatment = useCallback(() => {
    update(s => {
      const format = normalizeProjectFormat(s.meta.format)
      const content = createEmptyTreatmentContent()
      content.header.format = format
      const nextTreatmentDoc = {
        version: DOCUMENT_SCHEMA_VERSION,
        mode: 'three_act_prose' as const,
        updatedAt: nextTimestampAfter(s.documents.treatment.updatedAt),
        content,
      }
      return {
        ...s,
        documents: {
          ...s.documents,
          treatment: nextTreatmentDoc,
        },
      }
    })
  }, [update])

  const addEpisode = useCallback(() => {
    setOutlineDocument(content => {
      const nextNumber = content.episodes.length > 0
        ? Math.max(...content.episodes.map(episode => episode.number)) + 1
        : 101
      return {
        ...content,
        episodes: [...content.episodes, createOutlineEpisode(nextNumber)],
      }
    })
  }, [setOutlineDocument])

  const renameEpisode = useCallback((episodeId: string, label: string) => {
    setOutlineDocument(content => ({
      ...content,
      episodes: content.episodes.map(episode =>
        episode.id === episodeId ? { ...episode, label } : episode,
      ),
    }))
  }, [setOutlineDocument])

  const setEpisodeField = useCallback(<K extends keyof OutlineEpisode>(
    episodeId: string,
    field: K,
    value: OutlineEpisode[K],
  ) => {
    setOutlineDocument(content => ({
      ...content,
      episodes: content.episodes.map(episode =>
        episode.id === episodeId ? { ...episode, [field]: value } : episode,
      ),
    }))
  }, [setOutlineDocument])

  const clearOutline = useCallback((options: { keep?: 'all' | 'foundations' } = {}) => {
    update(s => {
      const empty = createEmptyOutlineContent()
      const outlineFormat = normalizeProjectFormat(s.meta.format)
      const currentContent = normalizeOutlineContent(s.documents.outline.content)
      const content =
        options.keep === 'foundations'
          ? {
              ...empty,
              spine: { ...currentContent.spine },
              ...(outlineFormat === 'series'
                ? {
                    seriesEngine: { ...currentContent.seriesEngine },
                    seasonArc: { ...currentContent.seasonArc },
                  }
                : {}),
            }
          : empty
      const nextOutlineDoc = {
        version: DOCUMENT_SCHEMA_VERSION,
        mode: 'beat_sheet_save_the_cat' as const,
        updatedAt: nextTimestampAfter(s.documents.outline.updatedAt),
        content,
      }
      const nextDocuments = { ...s.documents, outline: nextOutlineDoc }
      return {
        ...s,
        outline: documentsToLegacy(nextDocuments, { outlineFormat }).outline,
        documents: nextDocuments,
      }
    })
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

  const stateFromImportedScript = useCallback((importedScript: ImportedScriptPayload): ProjectState => {
    const importedState = defaultProjectState()
    return {
      ...importedState,
      meta: {
        ...importedState.meta,
        title: normalizeProjectTitle(importedScript.title),
        wordCount: importedScript.wordCount,
        pageCount: importedScript.pageCount,
        sourceImport: importedScript.sourceImport,
      },
      script: {
        ...importedState.script,
        rawHtml: importedScript.rawHtml,
        scenes: importedScript.scenes,
      },
    }
  }, [])

  const createProject = useCallback(() => {
    const savedProjects = saveProjectToLibrary(activeProjectId, state, projects)
    const next = createBlankProject(savedProjects)
    setActiveProjectId(next.activeProjectId)
    setState(next.state)
    setProjects(next.projects)
    return getStoredProject(next.activeProjectId, next.projects)!
  }, [activeProjectId, projects, state])

  const createProjectFromImportedScript = useCallback((importedScript: ImportedScriptPayload) => {
    const savedProjects = saveProjectToLibrary(activeProjectId, state, projects)
    const next = createProjectFromState(savedProjects, stateFromImportedScript(importedScript))
    setActiveProjectId(next.activeProjectId)
    setState(next.state)
    setProjects(next.projects)
    return getStoredProject(next.activeProjectId, next.projects)!
  }, [activeProjectId, projects, state, stateFromImportedScript])

  const replaceScriptFromImport = useCallback((importedScript: ImportedScriptPayload) => {
    update(s => ({
      ...s,
      meta: {
        ...s.meta,
        title: normalizeProjectTitle(s.meta.title || importedScript.title),
        wordCount: importedScript.wordCount,
        pageCount: importedScript.pageCount,
        sourceImport: importedScript.sourceImport,
      },
      script: {
        ...s.script,
        rawHtml: importedScript.rawHtml,
        scenes: importedScript.scenes,
      },
    }))
  }, [update])

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

  const openStoredProject = useCallback((project: StoredProject) => {
    const savedProjects = saveProjectToLibrary(activeProjectId, state, projects)
    const next = activateStoredProject(project, savedProjects)
    setActiveProjectId(next.activeProjectId)
    setState(next.state)
    setProjects(next.projects)
  }, [activeProjectId, projects, state])

  const saveNow = useCallback(() => {
    const nextProjects = saveProjectToLibrary(activeProjectId, state, projects)
    setProjects(nextProjects)
    return getStoredProject(activeProjectId, nextProjects)!
  }, [activeProjectId, projects, state])

  const deleteProjectById = useCallback((projectId: string) => {
    const next = deleteProjectFromLibrary(projectId, projects)
    setActiveProjectId(next.activeProjectId)
    setState(next.state)
    setProjects(next.projects)
    return next
  }, [projects])

  const archiveProjectById = useCallback((projectId: string) => {
    const next = archiveProjectInLibrary(projectId, projects)
    setActiveProjectId(next.activeProjectId)
    setState(next.state)
    setProjects(next.projects)
    return next
  }, [projects])

  const restoreProjectById = useCallback((projectId: string) => {
    const next = restoreProjectInLibrary(projectId, projects)
    setActiveProjectId(next.activeProjectId)
    setState(next.state)
    setProjects(next.projects)
    return next
  }, [projects])

  const deleteProject = useCallback(() => {
    return deleteProjectById(activeProjectId)
  }, [activeProjectId, deleteProjectById])

  // Slice 4: re-read the persisted library and re-sync hook state. Used after
  // an out-of-band mutation to the localStorage library (e.g., stamping
  // `migratedToFolder` markers) so the active library, the active project id,
  // and the active session state stay in sync with what was just written.
  //
  // Per Decision 3 of the migration plan: if the currently-active project was
  // migrated to a folder-backed package, `loadActiveProjectLibrary` refuses to
  // activate it and returns activeProjectId='' + a default state — which
  // naturally drops the writer back to Home.
  const reloadLibrary = useCallback(() => {
    const next = loadActiveProjectLibrary()
    setActiveProjectId(next.activeProjectId)
    setState(next.state)
    setProjects(next.projects)
  }, [])

  return {
    state,
    activeProjectId,
    activeStoredProject: getStoredProject(activeProjectId, projects),
    // Display summaries intentionally hide migrated localStorage backups.
    // `storedProjects` below remains raw so migration/recovery code can still
    // see the non-destructive backup marker.
    projects: summarizeProjects(projectsForActiveLibrary(projects)),
    // Raw stored projects, including the localStorage-only `migratedToFolder`
    // marker. App.tsx uses this for migration scans; consumers that only need
    // display data should keep using the summarized `projects` array above.
    storedProjects: projects,
    setMeta,
    setProjectFormat,
    clearSynopsis,
    setSynopsisDocument,
    setSynopsisViewPreferences,
    setStoryBibleDocument,
    setStoryBibleViewPreferences,
    migrateStoryBibleLegacyToDocument,
    setBeat,
    setOutlineDocument,
    setOutlineViewPreferences,
    setTreatmentDocument,
    setTreatmentViewPreferences,
    clearTreatment,
    addEpisode,
    renameEpisode,
    setEpisodeField,
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
    createProjectFromImportedScript,
    replaceScriptFromImport,
    switchProject,
    openStoredProject,
    saveNow,
    deleteProject,
    deleteProjectById,
    archiveProjectById,
    restoreProjectById,
    reloadLibrary,
  }
}
