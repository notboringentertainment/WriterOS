import React, { useState, useCallback } from 'react'
import { useShellState } from './lib/shellState'
import { useProjectState } from './lib/useProjectState'
import { parseMention, getDefaultPersona, buildProjectContext } from './lib/wpRouting'
import { Shell } from './components/shell/Shell'
import { ScriptTab } from './components/writing/ScriptTab'
import { SynopsisTab } from './components/writing/SynopsisTab'
import { OutlineTab } from './components/writing/OutlineTab'
import { StoryBibleTab } from './components/writing/StoryBibleTab'
import { WritersRoom } from './components/writing/WritersRoom'
import { PERSONAS } from '@shared/personas'
import type { TranscriptMessage, AgentId, ScriptScene } from './lib/projectState'

function makeMessage(role: 'user' | 'assistant', content: string, speaker: string): TranscriptMessage {
  return { id: crypto.randomUUID(), role, content, speaker, ts: Date.now() }
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

export default function App() {
  const shellState = useShellState()
  const project = useProjectState()
  const [wpLoading, setWpLoading] = useState(false)

  const handleWPSend = useCallback(async (text: string) => {
    // Step 1: snapshot prior history before appending current message
    const conversationHistory = historyFromTranscript(project.state.agents.writingPartner.transcript)

    // Step 2: parse @mention
    const mentionResult = parseMention(text)
    const personaId = mentionResult
      ? mentionResult.personaId
      : getDefaultPersona(shellState.activeTab, shellState.storyBibleSection)
    const messageToSend = mentionResult ? mentionResult.strippedText : text

    // Step 3: append user message (original text with @mention intact)
    project.addMessage('writingPartner', makeMessage('user', text, 'Writer'))

    // Step 4–8: API call
    setWpLoading(true)
    try {
      const projectContext = buildProjectContext(project.state)
      const response = await postWPChat({ personaId, message: messageToSend, projectContext, conversationHistory })
      const speakerName = PERSONAS[personaId]?.name ?? 'Writing Partner'
      project.addMessage('writingPartner', makeMessage('assistant', response.message, speakerName))
    } catch {
      project.addMessage('writingPartner', makeMessage('assistant', 'Connection error — please try again.', 'Writing Partner'))
    } finally {
      setWpLoading(false)
    }
  }, [project, shellState.activeTab, shellState.storyBibleSection])

  const handleSpecialistSend = useCallback(async (specialistId: AgentId, text: string) => {
    // Snapshot BEFORE appending
    const conversationHistory = historyFromTranscript(project.state.agents[specialistId].transcript)

    project.addMessage(specialistId, makeMessage('user', text, 'Writer'))

    try {
      const projectContext = buildProjectContext(project.state)
      const response = await postWPChat({ personaId: specialistId, message: text, projectContext, conversationHistory })
      const speakerName = PERSONAS[specialistId]?.name ?? specialistId
      project.addMessage(specialistId, makeMessage('assistant', response.message, speakerName))
    } catch {
      project.addMessage(specialistId, makeMessage('assistant', 'Connection error — please try again.', PERSONAS[specialistId]?.name ?? specialistId))
    }
  }, [project])

  const renderCenter = () => {
    if (shellState.writersRoomActive) {
      return (
        <WritersRoom
          projectState={project.state}
          onSendToSpecialist={handleSpecialistSend}
        />
      )
    }
    switch (shellState.activeTab) {
      case 'script':
        return (
          <ScriptTab
            focusMode={shellState.focusMode}
            onToggleFocusMode={shellState.toggleFocusMode}
            initialScript={project.state.script.rawHtml || undefined}
            onScriptChange={(html: string, scenes: ScriptScene[]) => project.updateScript(html, scenes)}
          />
        )
      case 'synopsis':
        return (
          <SynopsisTab
            synopsis={project.state.synopsis}
            onUpdate={project.setSynopsisSection}
          />
        )
      case 'outline':
        return (
          <OutlineTab
            outline={project.state.outline}
            onUpdateBeat={project.setBeat}
            onReorderBeats={project.reorderBeats}
          />
        )
      case 'story-bible':
        return (
          <StoryBibleTab
            storyBible={project.state.storyBible}
            onAddCharacter={project.addCharacter}
            onUpdateCharacter={project.updateCharacter}
            onSetWorld={project.setWorld}
            onSetThemes={project.setThemes}
            onSetRules={project.setRules}
            onSectionChange={shellState.setStoryBibleSection}
          />
        )
      default:
        return null
    }
  }

  const railProps = {
    transcript: project.state.agents.writingPartner.transcript,
    loading: wpLoading,
    onSend: handleWPSend,
  }

  return (
    <Shell shellState={shellState} projectTitle={project.state.meta.title} railProps={railProps}>
      {renderCenter()}
    </Shell>
  )
}
