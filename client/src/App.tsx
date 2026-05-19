import React, { useState, useCallback, useEffect, useRef } from 'react'
import { useShellState } from './lib/shellState'
import { useProjectState } from './lib/useProjectState'
import { parseMention, parseOpenSwarmCommand, getDefaultPersona, buildProjectContext, formatWritingPartnerSpeaker } from './lib/wpRouting'
import { loadCompletedVoiceProfile, loadCompletedVoiceProfileSliced } from './lib/voiceProfile'
import { classifyPersonaCapability } from './lib/personaCapabilityRouting'
import { isAbortError, postPersonaCapability } from './lib/postPersonaCapability'
import { Shell } from './components/shell/Shell'
import { ScriptTab } from './components/writing/ScriptTab'
import { SynopsisTab } from './components/writing/SynopsisTab'
import { OutlineTab } from './components/writing/OutlineTab'
import { StoryBibleTab } from './components/writing/StoryBibleTab'
import { WritersRoom } from './components/writing/WritersRoom'
import { PERSONAS } from '@shared/personas'
import type { TranscriptMessage, AgentId, ScriptScene } from './lib/projectState'
import type { ScriptFocusState } from './lib/scriptIndex'
import type { VoiceProfileDocument } from '@shared/voiceProfile'
import type { CapabilityReceipt } from '@shared/personaCapability'

type ScriptSnapshot = {
  rawHtml: string
  scenes: ScriptScene[]
  focus?: ScriptFocusState
}

function makeMessage(
  role: 'user' | 'assistant',
  content: string,
  speaker: string,
  options: { capabilityReceipt?: CapabilityReceipt } = {}
): TranscriptMessage {
  return { id: crypto.randomUUID(), role, content, speaker, ts: Date.now(), ...options }
}

function historyFromTranscript(transcript: TranscriptMessage[]) {
  return transcript.slice(-6).map(m => ({ role: m.role, content: m.content }))
}

async function postWPChat(body: {
  personaId: string
  message: string
  projectContext: ReturnType<typeof buildProjectContext>
  conversationHistory: { role: 'user' | 'assistant'; content: string }[]
}): Promise<{ message: string; suggestions?: string[] }> {
  const res = await fetch('/api/wp-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`wp-chat ${res.status}`)
  return res.json()
}

async function postOpenSwarmWritingPartner(body: {
  message: string
  projectContext: ReturnType<typeof buildProjectContext>
  voiceProfile?: VoiceProfileDocument
}): Promise<{ message: string }> {
  const res = await fetch('/api/openswarm/writing-partner', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`openswarm writing-partner ${res.status}`)
  return res.json()
}

export default function App() {
  const shellState = useShellState()
  const project = useProjectState()
  const [wpLoading, setWpLoading] = useState(false)
  const latestScriptSnapshotRef = useRef<ScriptSnapshot>({
    rawHtml: project.state.script.rawHtml,
    scenes: project.state.script.scenes,
  })

  useEffect(() => {
    latestScriptSnapshotRef.current = {
      rawHtml: project.state.script.rawHtml,
      scenes: project.state.script.scenes,
    }
  }, [project.activeProjectId, project.state.script.rawHtml, project.state.script.scenes])

  const buildFreshProjectContext = useCallback(
    (message: string) => buildProjectContext(project.state, message, {
      script: {
        ...latestScriptSnapshotRef.current,
        focus: shellState.activeTab === 'script'
          ? latestScriptSnapshotRef.current.focus
          : undefined,
      },
    }),
    [project.state, shellState.activeTab]
  )

  const handleScriptSnapshotChange = useCallback((snapshot: ScriptSnapshot) => {
    latestScriptSnapshotRef.current = snapshot
  }, [])

  const handleScriptChange = useCallback(
    (html: string, scenes: ScriptScene[]) => {
      latestScriptSnapshotRef.current = {
        ...latestScriptSnapshotRef.current,
        rawHtml: html,
        scenes,
      }
      project.updateScript(html, scenes)
    },
    [project]
  )

  const handleWPSend = useCallback(async (text: string) => {
    const openSwarmMessage = parseOpenSwarmCommand(text)

    if (openSwarmMessage) {
      project.addMessage('writingPartner', makeMessage('user', text, 'Writer'))
      setWpLoading(true)
      try {
        const projectContext = buildFreshProjectContext(openSwarmMessage)
        const voiceProfile = loadCompletedVoiceProfile()
        const response = await postOpenSwarmWritingPartner({ message: openSwarmMessage, projectContext, voiceProfile })
        project.addMessage('writingPartner', makeMessage('assistant', response.message, 'Writing Partner (OpenSwarm)'))
      } catch {
        project.addMessage(
          'writingPartner',
          makeMessage(
            'assistant',
            'OpenSwarm connection error — start the OpenSwarm server on port 8080 and try again.',
            'Writing Partner (OpenSwarm)'
          )
        )
      } finally {
        setWpLoading(false)
      }
      return
    }

    // Step 1: snapshot prior history before appending current message
    const conversationHistory = historyFromTranscript(project.state.agents.writingPartner.transcript)

    // Step 2: parse @mention
    const mentionResult = parseMention(text)
    const personaId = mentionResult
      ? mentionResult.personaId
      : getDefaultPersona(shellState.activeTab, shellState.storyBibleSection, text)
    const messageToSend = mentionResult ? mentionResult.strippedText : text
    const capabilityKind = classifyPersonaCapability({ personaId, message: messageToSend })

    // Step 3: append user message (original text with @mention intact)
    project.addMessage('writingPartner', makeMessage('user', text, 'Writer'))

    // Step 4–8: API call
    setWpLoading(true)
    try {
      const projectContext = buildFreshProjectContext(messageToSend)
      const speakerName = formatWritingPartnerSpeaker(personaId)

      if (capabilityKind === 'research_world_context' && personaId === 'zoe') {
        const response = await postPersonaCapability({
          personaId: 'zoe',
          taskKind: 'research_world_context',
          message: messageToSend,
          projectContext,
          voiceProfile: loadCompletedVoiceProfileSliced('world_context'),
          sourceSurface: 'writingPartner',
          clientRequestId: crypto.randomUUID(),
        })

        if (response.status !== 'cancelled' && response.finalMessage.trim()) {
          project.addMessage(
            'writingPartner',
            makeMessage('assistant', response.finalMessage, speakerName, {
              capabilityReceipt: response.receipt,
            })
          )
        }
        return
      }

      const response = await postWPChat({ personaId, message: messageToSend, projectContext, conversationHistory })
      project.addMessage('writingPartner', makeMessage('assistant', response.message, speakerName))
    } catch (error) {
      if (isAbortError(error)) return
      project.addMessage('writingPartner', makeMessage('assistant', 'Connection error — please try again.', 'Writing Partner'))
    } finally {
      setWpLoading(false)
    }
  }, [buildFreshProjectContext, project, shellState.activeTab, shellState.storyBibleSection])

  const handleSpecialistSend = useCallback(async (specialistId: AgentId, text: string) => {
    // Snapshot BEFORE appending
    const conversationHistory = historyFromTranscript(project.state.agents[specialistId].transcript)

    project.addMessage(specialistId, makeMessage('user', text, 'Writer'))

    try {
      const projectContext = buildFreshProjectContext(text)
      const response = await postWPChat({ personaId: specialistId, message: text, projectContext, conversationHistory })
      const speakerName = PERSONAS[specialistId]?.name ?? specialistId
      project.addMessage(specialistId, makeMessage('assistant', response.message, speakerName))
    } catch (error) {
      if (isAbortError(error)) return
      project.addMessage(specialistId, makeMessage('assistant', 'Connection error — please try again.', PERSONAS[specialistId]?.name ?? specialistId))
    }
  }, [buildFreshProjectContext, project])

  const renderActiveSurface = () => {
    switch (shellState.activeTab) {
      case 'script':
        return (
          <ScriptTab
            key={project.activeProjectId}
            focusMode={shellState.focusMode}
            onToggleFocusMode={shellState.toggleFocusMode}
            initialScript={project.state.script.rawHtml || undefined}
            onScriptChange={handleScriptChange}
            onScriptSnapshotChange={handleScriptSnapshotChange}
          />
        )
      case 'synopsis':
        return (
          <SynopsisTab
            document={project.state.documents.synopsis}
            projectFormat={project.state.meta.format}
            onProjectFormatChange={project.setProjectFormat}
            onContentPatch={(patch) =>
              project.setSynopsisDocument((content) => ({ ...content, ...patch }))
            }
            onViewPreferencesPatch={(patch) => project.setSynopsisViewPreferences(patch)}
            onClear={project.clearSynopsis}
          />
        )
      case 'outline':
        return (
          <OutlineTab
            outline={project.state.outline}
            projectFormat={project.state.meta.format}
            onProjectFormatChange={project.setProjectFormat}
            onUpdateBeat={project.setBeat}
            onReorderBeats={project.reorderBeats}
            onClear={project.clearOutline}
          />
        )
      case 'story-bible':
        return (
          <StoryBibleTab
            document={project.state.documents.storyBible}
            projectFormat={project.state.meta.format}
            onProjectFormatChange={project.setProjectFormat}
            onContentPatch={(patch) =>
              project.setStoryBibleDocument((content) => ({ ...content, ...patch }))
            }
            onMigrateLegacyStoryBible={project.migrateStoryBibleLegacyToDocument}
            onSectionChange={shellState.setStoryBibleSection}
            onClear={project.clearStoryBible}
          />
        )
      default:
        return null
    }
  }

  const renderCenter = () => {
    const activeSurface = renderActiveSurface()

    if (shellState.writersRoomActive) {
      return (
        <div style={styles.surfaceWithWritersRoom}>
          <div style={styles.activeSurfacePane}>
            {activeSurface}
          </div>
          <WritersRoom
            mode="dock"
            projectState={project.state}
            onSendToSpecialist={handleSpecialistSend}
            onClearTranscript={project.clearTranscript}
          />
        </div>
      )
    }

    return activeSurface
  }

  const railProps = {
    transcript: project.state.agents.writingPartner.transcript,
    loading: wpLoading,
    onSend: handleWPSend,
    onClearTranscript: () => project.clearTranscript('writingPartner'),
  }

  return (
    <Shell
      shellState={shellState}
      projectTitle={project.state.meta.title}
      activeProjectId={project.activeProjectId}
      projectSummaries={project.projects}
      onProjectTitleChange={title => project.setMeta({ title })}
      onProjectChange={project.switchProject}
      onNewProject={project.createProject}
      onSaveProject={project.saveNow}
      onDeleteProject={project.deleteProject}
      railProps={railProps}
    >
      {renderCenter()}
    </Shell>
  )
}

const styles: Record<string, React.CSSProperties> = {
  surfaceWithWritersRoom: {
    height: '100%',
    minHeight: 0,
    display: 'flex',
    overflow: 'hidden',
  },
  activeSurfacePane: {
    flex: 1,
    minWidth: 0,
    overflow: 'auto',
  },
}
