import type {
  PersonaCapabilityProjectContext,
  PersonaCapabilityRequest,
  WorldContextVoiceProfileSlice,
} from '@shared/personaCapability'

function filled(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function truncate(value: string, limit = 900): string {
  const trimmed = value.trim()
  return trimmed.length <= limit ? trimmed : `${trimmed.slice(0, limit).trim()}...`
}

function bulletLines(items: string[]): string {
  return items.length ? items.map(item => `- ${item}`).join('\n') : '- None supplied'
}

function compactList(values: string[], limit = 5): string {
  const compacted = values.filter(filled).map(value => truncate(value, 120))
  if (!compacted.length) return ''
  const visible = compacted.slice(0, limit).join('; ')
  const extra = compacted.length > limit ? `; +${compacted.length - limit} more` : ''
  return `${visible}${extra}`
}

function formatVoiceProfileSlice(voiceProfile?: WorldContextVoiceProfileSlice): string[] {
  if (!voiceProfile) return []

  return [
    voiceProfile.displayName && `Display name: ${truncate(voiceProfile.displayName, 120)}`,
    `Archetype: ${truncate(voiceProfile.archetype, 180)}`,
    `Core statement: ${truncate(voiceProfile.coreStatement, 260)}`,
    voiceProfile.storytellingDNA.recurringThemes.length
      ? `Recurring themes: ${compactList(voiceProfile.storytellingDNA.recurringThemes)}`
      : '',
    filled(voiceProfile.influences.notes)
      ? `Influence notes: ${truncate(voiceProfile.influences.notes, 260)}`
      : '',
    voiceProfile.visualLanguage.instincts.length
      ? `Visual instincts: ${compactList(voiceProfile.visualLanguage.instincts)}`
      : '',
    filled(voiceProfile.visualLanguage.notes)
      ? `Visual notes: ${truncate(voiceProfile.visualLanguage.notes, 260)}`
      : '',
  ].filter(filled)
}

function formatProjectContext(projectContext: PersonaCapabilityProjectContext): string {
  const synopsisSections = Object.entries(projectContext.synopsis.sections)
    .filter(([, value]) => filled(value))
    .map(([key, value]) => `${key}: ${truncate(value, 300)}`)

  const characterLines = projectContext.characters
    .filter(character => filled(character.name))
    .slice(0, 8)
    .map(character => {
      const details = [
        character.role && `role: ${character.role}`,
        character.wound && `wound: ${character.wound}`,
        character.want && `want: ${character.want}`,
        character.need && `need: ${character.need}`,
        character.arc && `arc: ${character.arc}`,
      ].filter(Boolean).join('; ')
      return `${character.name}${details ? ` (${truncate(details, 180)})` : ''}`
    })

  const storyBibleLines = [
    projectContext.storyBible.world.setting && `Setting: ${projectContext.storyBible.world.setting}`,
    projectContext.storyBible.world.toneAnchors && `Tone anchors: ${projectContext.storyBible.world.toneAnchors}`,
    projectContext.storyBible.world.voiceNotes && `Project voice notes: ${projectContext.storyBible.world.voiceNotes}`,
    projectContext.storyBible.themes && `Themes: ${projectContext.storyBible.themes}`,
    projectContext.storyBible.rules && `Rules: ${projectContext.storyBible.rules}`,
  ].filter(filled).map(line => truncate(line, 500))

  const script = projectContext.script
  const scriptLines = [
    script?.contextLabel && `Context: ${script.contextLabel}`,
    script?.selectedText && `Selected text: ${truncate(script.selectedText, 600)}`,
    script?.excerpt && `Excerpt: ${truncate(script.excerpt, 900)}`,
    script?.sceneHeadings?.length ? `Scene headings: ${script.sceneHeadings.slice(0, 10).join('; ')}` : '',
  ].filter(filled)

  return [
    `Project: ${projectContext.title || 'Untitled'}`,
    `Genre: ${projectContext.genre || 'Not supplied'}`,
    `Logline: ${projectContext.logline || projectContext.synopsis.logline || 'Not supplied'}`,
    '',
    'Synopsis:',
    bulletLines(synopsisSections),
    '',
    'Characters:',
    bulletLines(characterLines),
    '',
    'Story Bible:',
    bulletLines(storyBibleLines),
    '',
    'Script context:',
    scriptLines.length ? scriptLines.join('\n') : '- None supplied',
  ].join('\n')
}

export function buildResearchWorldContextPrompt(request: PersonaCapabilityRequest): string {
  const voiceProfileLines = formatVoiceProfileSlice(request.voiceProfile)

  return `You are running a bounded world-context research task for WriterOS.

Visible WriterOS persona: Zoe, the world-building architect.
Capability: research_world_context.

Task:
${request.message}

Hard boundaries:
- This is a quick capability lookup, not a comprehensive research report.
- Prefer 1-2 targeted web searches; stop once you have enough evidence for 3-5 useful findings.
- Do not ask clarifying questions. Put missing inputs in "missing" and continue with the supplied packet.
- Return source-grounded findings only. Do not invent citations.
- If a claim is useful but not source-backed, put it in "unverified" instead of "findings".
- Do not speak as Zoe. This is intermediate task output, not the final user-facing answer.
- Do not claim access to WriterOS state beyond this packet.
- Do not create or reference assistant/thread ids.
- Keep the writer's Voice Profile separate from project canon. It is writer identity guidance only.

Return ONLY JSON matching this shape:
{
  "findings": [
    {
      "claim": "one concise, source-backed fact or context note",
      "sourceLabel": "short label matching one item in sources",
      "url": "optional source URL",
      "verified": true
    }
  ],
  "sources": [
    { "label": "short label", "url": "optional source URL" }
  ],
  "missing": ["clarification the writer could provide for better targeting"],
  "unverified": ["useful but unsourced idea or claim, clearly not established"]
}

WriterOS project packet:
${formatProjectContext(request.projectContext)}

Writer Voice Profile slice supplied by WriterOS:
${voiceProfileLines.length ? bulletLines(voiceProfileLines) : '- None supplied for this request.'}`
}
