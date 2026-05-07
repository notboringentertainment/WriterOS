import { AssessmentProfile, StoryMemory, Persona } from "@shared/schema";
import { createModelProvider, type ModelMessage } from "./modelProvider";

export interface PersonaResponse {
  message: string;
  suggestions?: string[];
  storyUpdates?: Partial<StoryMemory>;
}

function filled(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function truncate(value: string, max = 220): string {
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

function wordCount(value: string): number {
  return value.trim().match(/\S+/g)?.length ?? 0;
}

export function parseJsonObject(rawContent: string | null | undefined): Record<string, any> {
  const raw = (rawContent || '{}').trim();
  const fenced = raw.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return JSON.parse(fenced ? fenced[1] : raw);
}

const SECTION_LABELS: Record<string, string> = {
  setup: 'Setup',
  act1Break: 'Act 1 Break',
  midpoint: 'Midpoint',
  act2Break: 'Act 2 Break',
  resolution: 'Resolution',
};

const DIALOGUE_SAMPLE_LIMIT = 12;

function sectionLines(sections?: Record<string, string>): string[] {
  if (!sections) return [];
  return Object.entries(sections)
    .filter(([, value]) => filled(value))
    .map(([key, value]) => `- ${SECTION_LABELS[key] ?? key}: ${truncate(value)}`);
}

function filledCount(values: unknown[]): number {
  return values.filter(filled).length;
}

function compactList(values: string[], maxItems = 6): string {
  const filledValues = values.filter(filled);
  if (!filledValues.length) return '';
  const visible = filledValues.slice(0, maxItems).join(', ');
  const extra = filledValues.length > maxItems ? ` +${filledValues.length - maxItems} more` : '';
  return `${visible}${extra}`;
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function speakerFromDialogueSample(sample: string): string {
  const match = sample.match(/^([^:]{1,60}):\s+/);
  return match ? match[1].trim() : '';
}

function requestedSpeakers(dialogueSamples: string[], characterNames: string[], userMessage: string): string[] {
  const normalizedMessage = ` ${normalizeName(userMessage)} `;
  if (!normalizedMessage.trim()) return [];

  const candidates = [
    ...characterNames,
    ...dialogueSamples.map(speakerFromDialogueSample),
  ].filter(filled);
  const seen = new Set<string>();

  return candidates.filter(candidate => {
    const normalized = normalizeName(candidate);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return normalizedMessage.includes(` ${normalized} `);
  });
}

function dialogueSpeakerCounts(dialogueSamples: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const sample of dialogueSamples) {
    const speaker = normalizeName(speakerFromDialogueSample(sample));
    if (!speaker) continue;
    counts.set(speaker, (counts.get(speaker) ?? 0) + 1);
  }
  return counts;
}

function addDialogueWindow(indices: Set<number>, center: number, sampleCount: number): void {
  const start = Math.max(0, center - 5);
  const end = Math.min(sampleCount - 1, center + 6);
  for (let i = start; i <= end; i++) indices.add(i);
}

function selectDialogueSamples(
  samples: string[],
  characterNames: string[],
  userMessage: string,
): string[] {
  // Server fallback for legacy/capped script packs; client retrieval sends focused samples when it can.
  const filledSamples = samples.filter(filled);
  const speakers = requestedSpeakers(filledSamples, characterNames, userMessage);
  if (!speakers.length) return filledSamples.slice(0, DIALOGUE_SAMPLE_LIMIT);

  const counts = dialogueSpeakerCounts(filledSamples);
  const anchorSpeaker = speakers
    .filter(speaker => (counts.get(normalizeName(speaker)) ?? 0) > 0)
    .sort((a, b) => (counts.get(normalizeName(a)) ?? 0) - (counts.get(normalizeName(b)) ?? 0))[0];

  if (!anchorSpeaker) return filledSamples.slice(0, DIALOGUE_SAMPLE_LIMIT);

  const selectedIndices = new Set<number>();
  const normalizedAnchor = normalizeName(anchorSpeaker);
  const anchorIndex = filledSamples.findIndex(sample => normalizeName(speakerFromDialogueSample(sample)) === normalizedAnchor);
  if (anchorIndex >= 0) addDialogueWindow(selectedIndices, anchorIndex, filledSamples.length);

  for (const speaker of speakers) {
    const normalizedSpeaker = normalizeName(speaker);
    const hasSpeaker = Array.from(selectedIndices).some(index => (
      normalizeName(speakerFromDialogueSample(filledSamples[index])) === normalizedSpeaker
    ));
    if (hasSpeaker) continue;

    const speakerIndex = filledSamples.findIndex(sample => normalizeName(speakerFromDialogueSample(sample)) === normalizedSpeaker);
    if (speakerIndex >= 0) addDialogueWindow(selectedIndices, speakerIndex, filledSamples.length);
  }

  return Array.from(selectedIndices)
    .sort((a, b) => a - b)
    .slice(0, DIALOGUE_SAMPLE_LIMIT)
    .map(index => filledSamples[index]);
}

export function createWritingPartnerBrief(storyMemory: StoryMemory): string {
  const lines: string[] = [];
  const titleGenre = [
    storyMemory.project.title && `"${storyMemory.project.title}"`,
    storyMemory.project.genre,
  ].filter(Boolean).join(' | ');
  if (titleGenre) lines.push(`- Project: ${titleGenre}`);
  if (filled(storyMemory.project.logline)) lines.push(`- Logline: ${truncate(storyMemory.project.logline, 180)}`);

  const characterNames = compactList(Object.values(storyMemory.characters).map(character => character.name));
  if (characterNames) lines.push(`- Primary characters: ${characterNames}`);

  const script = storyMemory.script;
  const sceneCount = (script?.sceneHeadings ?? []).filter(filled).length;
  const rawScriptExcerpt = script?.excerpt;
  if (filled(rawScriptExcerpt)) {
    const excerptWords = script?.excerptWordCount ?? wordCount(rawScriptExcerpt);
    const wordLimit = script?.excerptWordLimit ?? 500;
    const capNote = script?.excerptTruncated ? `, capped at first ${wordLimit} words` : '';
    const sceneNote = sceneCount ? `, ${sceneCount} scene heading${sceneCount === 1 ? '' : 's'}` : '';
    const pageNote = script?.estimatedPageCount ? `, about ${script.estimatedPageCount} estimated page${script.estimatedPageCount === 1 ? '' : 's'}` : '';
    lines.push(`- Script: ${excerptWords} excerpt words available${capNote}${sceneNote}${pageNote}.`);
  } else if (sceneCount) {
    lines.push(`- Script: ${sceneCount} scene heading${sceneCount === 1 ? '' : 's'} available; no page excerpt packaged.`);
  }

  if (storyMemory.outline.beats.length) {
    lines.push(`- Outline: ${storyMemory.outline.beats.length} beat${storyMemory.outline.beats.length === 1 ? '' : 's'} available.`);
  }

  const synopsisSectionCount = filledCount(Object.values(storyMemory.project.synopsisSections ?? {}));
  if (synopsisSectionCount) {
    lines.push(`- Synopsis: ${synopsisSectionCount} section${synopsisSectionCount === 1 ? '' : 's'} filled.`);
  } else if (filled(storyMemory.project.synopsis)) {
    lines.push('- Synopsis: summary text available.');
  }

  const storyBibleFieldCount = filledCount([
    storyMemory.worldRules.setting,
    storyMemory.worldRules.toneAnchors,
    storyMemory.worldRules.rules,
    storyMemory.project.themes,
    storyMemory.dialogue.voiceNotes,
  ]);
  if (storyBibleFieldCount) {
    lines.push(`- Story Bible: ${storyBibleFieldCount} field${storyBibleFieldCount === 1 ? '' : 's'} filled.`);
  }

  if (storyMemory.decisions.length) {
    lines.push(`- Project memory: ${storyMemory.decisions.length} decision${storyMemory.decisions.length === 1 ? '' : 's'} captured.`);
  }

  return lines.length ? `WRITING PARTNER BRIEF:\n${lines.join('\n')}` : '';
}

type ContextSection = 'brief' | 'synopsis' | 'characters' | 'outline' | 'scenes' | 'storyBible';

const DEFAULT_CONTEXT_ORDER: ContextSection[] = ['brief', 'synopsis', 'characters', 'outline', 'scenes', 'storyBible'];

const PERSONA_CONTEXT_ORDER: Record<string, ContextSection[]> = {
  writingPartner: DEFAULT_CONTEXT_ORDER,
  sam: ['brief', 'synopsis', 'outline', 'characters'],
  casey: ['brief', 'characters', 'storyBible', 'scenes', 'synopsis'],
  oliver: ['brief', 'outline', 'scenes', 'synopsis'],
  maya: ['brief', 'scenes', 'characters', 'storyBible'],
  zoe: ['brief', 'storyBible', 'scenes', 'characters'],
  alex: ['brief', 'outline', 'scenes', 'synopsis', 'storyBible', 'characters'],
};

export function createContextSummary(storyMemory: StoryMemory, personaId = 'writingPartner', userMessage = ''): string {
  const contextOrder = PERSONA_CONTEXT_ORDER[personaId] ?? DEFAULT_CONTEXT_ORDER;
  const writingPartnerBrief = createWritingPartnerBrief(storyMemory);
  const characterLines = Object.values(storyMemory.characters)
    .filter(character => filled(character.name))
    .slice(0, 8)
    .map(character => {
      const details = [
        character.role && `role: ${character.role}`,
        character.backstory && `wound/backstory: ${character.backstory}`,
        character.motivation && `motivation: ${character.motivation}`,
        character.arc && `arc: ${character.arc}`,
      ].filter(Boolean).join('; ');
      return `- ${character.name}${details ? ` (${truncate(details, 180)})` : ''}`;
    });

  const beatLines = storyMemory.outline.beats
    .slice(0, 15)
    .map(beat => `- ${truncate(beat.description, 220)}`);

  const script = storyMemory.script;
  const scriptSceneLines = script?.sceneHeadings?.filter(filled)
    .slice(0, 12)
    .map((heading, index) => `- ${index + 1}. ${truncate(heading, 120)}`) ?? [];
  const legacySceneLines = (storyMemory.outline.scenes ?? [])
    .slice(0, 12)
    .map(scene => `- ${scene.index}. ${truncate(scene.heading, 120)}`);
  const sceneLines = scriptSceneLines.length ? scriptSceneLines : legacySceneLines;

  const rawDialogueSamples = script?.dialogueSnippets?.length ? script.dialogueSnippets : storyMemory.dialogue.samples ?? [];
  const dialogueSamples = selectDialogueSamples(rawDialogueSamples, script?.characterNames ?? [], userMessage)
    .map(sample => `- ${truncate(sample, 220)}`);
  const actionSnippets = (script?.actionSnippets ?? [])
    .filter(filled)
    .slice(0, 8)
    .map(sample => `- ${truncate(sample, 220)}`);
  const scriptCharacterNames = compactList(script?.characterNames ?? []);
  const rawScriptExcerpt = script?.excerpt;
  const scriptExcerpt = filled(rawScriptExcerpt)
    ? `SCRIPT EXCERPT (${script?.excerptWordCount ?? wordCount(rawScriptExcerpt)} words${script?.excerptTruncated ? `, first ${script?.excerptWordLimit ?? 500} words` : ''}):\n${rawScriptExcerpt}`
    : '';
  const pageRange = script?.pageRange;
  const selectedText = script?.selectedText?.trim();
  const scriptContextLine = script?.contextReason
    ? `SCRIPT CONTEXT:\n- ${[
      script.contextLabel,
      pageRange ? `estimated page${pageRange.start === pageRange.end ? '' : 's'} ${pageRange.start === pageRange.end ? pageRange.start : `${pageRange.start}-${pageRange.end}`}` : '',
      script.contextReason,
    ].filter(filled).join(' | ')}`
    : '';
  const scriptBlocks = [
    scriptContextLine,
    selectedText ? `SELECTED TEXT:\n${truncate(selectedText, 600)}` : '',
    sceneLines.length ? `SCRIPT SCENES:\n${sceneLines.join('\n')}` : '',
    scriptCharacterNames ? `SCRIPT CHARACTER NAMES:\n- ${scriptCharacterNames}` : '',
    scriptExcerpt,
    dialogueSamples.length ? `DIALOGUE SAMPLES:\n${dialogueSamples.join('\n')}` : '',
    actionSnippets.length ? `ACTION SNIPPETS:\n${actionSnippets.join('\n')}` : '',
  ].filter(Boolean);

  const synopsisLines = sectionLines(storyMemory.project.synopsisSections);
  const worldLines = [
    filled(storyMemory.worldRules.setting) && `- Setting: ${truncate(storyMemory.worldRules.setting)}`,
    filled(storyMemory.worldRules.toneAnchors) && `- Tone anchors: ${truncate(storyMemory.worldRules.toneAnchors)}`,
    filled(storyMemory.worldRules.rules) && `- Rules: ${truncate(storyMemory.worldRules.rules)}`,
    filled(storyMemory.project.themes) && `- Themes: ${truncate(storyMemory.project.themes)}`,
    filled(storyMemory.dialogue.voiceNotes) && `- Voice notes: ${truncate(storyMemory.dialogue.voiceNotes)}`,
  ].filter(Boolean);

  const sectionBlocks: Record<ContextSection, string> = {
    brief: writingPartnerBrief,
    synopsis: synopsisLines.length ? `SYNOPSIS SECTIONS:\n${synopsisLines.join('\n')}` : '',
    characters: characterLines.length ? `CHARACTERS:\n${characterLines.join('\n')}` : '',
    outline: beatLines.length ? `OUTLINE BEATS:\n${beatLines.join('\n')}` : '',
    scenes: scriptBlocks.join('\n\n'),
    storyBible: worldLines.length ? `STORY BIBLE:\n${worldLines.join('\n')}` : '',
  };

  return contextOrder.map(section => sectionBlocks[section]).filter(Boolean).join('\n\n') || 'No structured project details yet.';
}

export class OpenAIService {
  private createPersonaSystemPrompt(
    persona: Persona, 
    userProfile: AssessmentProfile, 
    storyMemory: StoryMemory,
    userMessage: string
  ): string {
    const contextSummary = createContextSummary(storyMemory, persona.id, userMessage);
    const basePrompt = `You are ${persona.name}, a ${persona.role}. ${persona.personality}.

YOUR PERSONALITY TRAITS:
- Warm and encouraging, but specific and actionable
- ${userProfile.feedbackStyle === 'direct' ? 'Direct and to-the-point' : 
     userProfile.feedbackStyle === 'gentle' ? 'Gentle and supportive' : 
     'Detailed with examples'}
- Expert in: ${persona.expertise.join(', ')}
- Always address the writer as ${userProfile.writerName}

CURRENT PROJECT CONTEXT:
${storyMemory.project.title ? `Project: "${storyMemory.project.title}"` : 'New project'}
${storyMemory.project.genre ? `Genre: ${storyMemory.project.genre}` : ''}
${storyMemory.project.logline ? `Logline: ${storyMemory.project.logline}` : ''}
${storyMemory.project.synopsis ? `Synopsis: ${storyMemory.project.synopsis}` : ''}

STRUCTURED PROJECT MEMORY:
${contextSummary}

WRITER'S STATE: ${userProfile.entryState.replace('_', ' ')}
IMMEDIATE NEED: ${userProfile.immediateNeed}

EXPERTISE-SPECIFIC GUIDELINES:`;

    // Add persona-specific expertise
    switch (persona.id) {
      case 'sam':
        return `${basePrompt}
- Help craft compelling loglines (20-35 words, protagonist + conflict + stakes)
- Develop one-page synopses with clear three-act structure
- Provide pitch strategies and comparable titles
- Focus on marketability and hook strength
- Ask probing questions about the core story conflict

RESPONSE STYLE: Like a mentor who's pitched 100 scripts to studios. Warm but business-savvy.

IMPORTANT: Respond with JSON in this format:
{
  "message": "Your response (150-220 words, greet ${userProfile.writerName} by name, ask 1-2 precise questions, provide 1 concrete next step, use market-savvy phrasing, optionally suggest comparable titles)",
  "suggestions": ["2-3 specific actionable suggestions"],
  "storyUpdates": {
    "project": {"field": "updated_value"} // only include if user provided new information about title, genre, logline, etc.
  }
}`;

      case 'casey':
        return `${basePrompt}
- Dive deep into character psychology and motivation
- Explore backstory, internal conflicts, and character arcs
- Use method acting insights and psychological understanding
- Help create authentic, complex characters
- Ask about characters' deepest fears and desires

RESPONSE STYLE: Like a method actor who lives inside characters' heads. Intuitive and empathetic.

IMPORTANT: Respond with JSON in this format:
{
  "message": "Your response (150-220 words, greet ${userProfile.writerName} by name, ask 1-2 deep psychological questions, provide intuitive character insights)",
  "suggestions": ["2-3 character development suggestions"],
  "storyUpdates": {
    "characters": {"characterName": {"field": "updated_value"}} // only if user provides character info
  }
}`;

      case 'oliver':
        return `${basePrompt}
- Focus on story structure, pacing, and narrative flow
- Help with three-act structure, beat sheets, and scene organization
- Identify structural problems and suggest solutions
- Balance plot advancement with character development
- Ensure each scene serves the larger story

RESPONSE STYLE: Like a seasoned story editor who spots issues while inspiring creativity.

IMPORTANT: Respond with JSON in this format:
{
  "message": "Your response (150-220 words, greet ${userProfile.writerName} by name, ask 1-2 structural questions, provide concrete story guidance)",
  "suggestions": ["2-3 structural improvements"],
  "storyUpdates": {
    "outline": {"beats": []} // only if user provides plot/structure info
  }
}`;

      case 'maya':
        return `${basePrompt}
- Focus on dialogue, character voice, and conversation dynamics
- Help with speech patterns, subtext, and authentic character voices
- Analyze dialogue for rhythm, flow, and character differentiation
- Provide techniques from acting and screenwriting
- Ensure each character sounds unique and authentic

RESPONSE STYLE: Like a former actor who can slip into any character's voice. Intuitive about speech patterns.

IMPORTANT: Respond with JSON in this format:
{
  "message": "Your response (150-220 words, greet ${userProfile.writerName} by name, focus on voice and dialogue craft, ask about character speech patterns)",
  "suggestions": ["2-3 dialogue improvement techniques"],
  "storyUpdates": {
    "dialogue": {"samples": "example dialogue"} // only if user provides dialogue to work on
  }
}`;

      case 'zoe':
        return `${basePrompt}
- Specialize in world-building, setting creation, and consistency
- Help with fantasy/sci-fi systems, cultural rules, and immersive settings
- Focus on internal logic, believability, and rich detail
- Balance world complexity with story needs
- Ensure consistent rules and cultural authenticity

RESPONSE STYLE: Like a fantasy author who's built dozens of consistent worlds. Detail-oriented but practical.

IMPORTANT: Respond with JSON in this format:
{
  "message": "Your response (150-220 words, greet ${userProfile.writerName} by name, focus on world consistency and immersion, ask about setting details)",
  "suggestions": ["2-3 world-building improvements"],
  "storyUpdates": {
    "worldRules": {"setting": "world details"} // only if user provides world information
  }
}`;

      case 'alex':
        return `${basePrompt}
- Focus on writing process, habits, and overcoming creative blocks
- Provide encouragement and practical daily writing strategies
- Help with motivation, momentum, and sustainable writing practices
- Address writer's block, perfectionism, and productivity issues
- Keep writers moving forward with their projects

RESPONSE STYLE: Like an encouraging writing coach who's been through every creative struggle. Supportive but action-oriented.

IMPORTANT: Respond with JSON in this format:
{
  "message": "Your response (150-220 words, greet ${userProfile.writerName} by name, focus on writing process and momentum, ask about current challenges)",
  "suggestions": ["2-3 practical writing strategies"],
  "storyUpdates": {
    "decisions": [{"type": "process", "decision": "writing habit change"}] // only if user commits to process changes
  }
}`;

      default:
        return basePrompt + '\n\nIMPORTANT: Respond with JSON format: {"message": "your response", "suggestions": []}';
    }
  }

  async generatePersonaResponse(
    persona: Persona,
    userMessage: string,
    userProfile: AssessmentProfile,
    storyMemory: StoryMemory,
    conversationHistory: Array<{role: 'user' | 'assistant', content: string}>
  ): Promise<PersonaResponse> {
    try {
      const systemPrompt = this.createPersonaSystemPrompt(persona, userProfile, storyMemory, userMessage);
      
      const messages: ModelMessage[] = [
        ...conversationHistory.slice(-6).map(msg => ({
          role: msg.role === 'user' ? 'user' as const : 'assistant' as const,
          content: msg.content
        })),
        { role: 'user', content: userMessage }
      ];

      const provider = createModelProvider();
      const rawContent = await provider.generateResponse({
        systemPrompt,
        messages,
        temperature: 0.7,
        maxTokens: 800,
      });
      
      try {
        const parsedResponse = parseJsonObject(rawContent);
        return {
          message: parsedResponse.message || "I'm here to help! What would you like to work on?",
          suggestions: parsedResponse.suggestions || [],
          storyUpdates: parsedResponse.storyUpdates
        };
      } catch (parseError) {
        // Fallback if JSON parsing fails
        return {
          message: rawContent || "I'm here to help! What would you like to work on?",
          suggestions: []
        };
      }
    } catch (error) {
      console.error('AI provider error:', error);
      return {
        message: `I'm having trouble connecting right now, ${userProfile.writerName}. Let me try to help based on what we've discussed so far.`
      };
    }
  }

  private async extractStoryUpdates(
    persona: Persona,
    userMessage: string,
    aiResponse: string,
    currentStory: StoryMemory
  ): Promise<Partial<StoryMemory> | undefined> {
    // Simple extraction based on keywords - in a full implementation, this could use a separate AI call
    const updates: Partial<StoryMemory> = {};
    let hasUpdates = false;

    // Extract potential title updates
    const titleMatch = userMessage.match(/(?:title|called|name).*?["']([^"']+)["']/i) || 
                      aiResponse.match(/(?:title|called|name).*?["']([^"']+)["']/i);
    if (titleMatch && !currentStory.project.title) {
      updates.project = { ...currentStory.project, title: titleMatch[1] };
      hasUpdates = true;
    }

    // Extract potential genre updates
    const genreMatch = userMessage.match(/(?:genre|type).*?(thriller|romance|horror|comedy|drama|sci-fi|fantasy|mystery)/i);
    if (genreMatch && !currentStory.project.genre) {
      if (!updates.project) updates.project = { ...currentStory.project };
      updates.project.genre = genreMatch[1];
      hasUpdates = true;
    }

    // For Sam specifically, look for logline/synopsis content
    if (persona.id === 'sam') {
      const loglineIndicators = /(?:logline|pitch|one[- ]line|elevator pitch)/i;
      if (loglineIndicators.test(userMessage) || loglineIndicators.test(aiResponse)) {
        // Mark that logline work is in progress
        if (!updates.project) updates.project = { ...currentStory.project };
        hasUpdates = true;
      }
    }

    return hasUpdates ? updates : undefined;
  }

  async generateSynopsisAssistance(
    userInput: string,
    currentLogline: string,
    currentSynopsis: string,
    projectDetails: { title?: string; genre?: string },
    userProfile: AssessmentProfile
  ): Promise<{
    feedback: string;
    suggestions: string[];
    improvedVersion?: string;
  }> {
    const prompt = `As Sam, a synopsis specialist and warm mentor, help ${userProfile.writerName} improve their logline/synopsis.

PROJECT: ${projectDetails.title || 'Untitled'} (${projectDetails.genre || 'Genre TBD'})
CURRENT LOGLINE: ${currentLogline || 'Not written yet'}
CURRENT SYNOPSIS: ${currentSynopsis || 'Not written yet'}
USER REQUEST: ${userInput}

FEEDBACK STYLE: ${userProfile.feedbackStyle}

Provide specific, actionable feedback that feels like it comes from someone who's pitched 100 scripts. Be encouraging but business-savvy.

Respond with JSON in this format:
{
  "feedback": "Your main response to their request",
  "suggestions": ["3-4 specific actionable suggestions"],
  "improvedVersion": "If they asked for help rewriting, provide an improved version"
}`;

    try {
      const provider = createModelProvider();
      const rawContent = await provider.generateResponse({
        systemPrompt: 'You are Sam, a synopsis specialist for WriterOS. Respond only with valid JSON.',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        maxTokens: 800,
      });

      return parseJsonObject(rawContent) as {
        feedback: string;
        suggestions: string[];
        improvedVersion?: string;
      };
    } catch (error) {
      console.error('Synopsis assistance error:', error);
      return {
        feedback: "I'm having trouble connecting right now, but I can see you're working hard on this. Keep refining your logline - focus on the central conflict and what makes your story unique.",
        suggestions: [
          "Make sure your protagonist's goal is clear",
          "Include the central conflict or obstacle",
          "Show what's at stake if they fail",
          "Keep it under 35 words for a logline"
        ]
      };
    }
  }

  async healthCheck(): Promise<{ status: string; model: string; error?: string }> {
    try {
      const provider = createModelProvider();
      if (!provider.isConfigured()) {
        return {
          status: 'error',
          model: provider.model,
          error: `${provider.name === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'} not configured`
        };
      }

      const rawContent = await provider.generateResponse({
        systemPrompt: 'Respond only with valid JSON.',
        messages: [{ role: 'user', content: 'Test connection. Respond with JSON: {"status": "ok"}' }],
        maxTokens: 50,
      });
      
      const result = parseJsonObject(rawContent);
      if (result.status !== 'ok') {
        throw new Error('AI model did not respond correctly');
      }
      
      return {
        status: 'ok',
        model: provider.model
      };
    } catch (error: any) {
      const provider = createModelProvider();
      return {
        status: 'error',
        model: provider.model,
        error: error.message
      };
    }
  }
}
