import OpenAI from "openai";
import { AssessmentProfile, StoryMemory, Persona } from "@shared/schema";

const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";

function createOpenAIClient() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export interface PersonaResponse {
  message: string;
  suggestions?: string[];
  storyUpdates?: Partial<StoryMemory>;
}

export class OpenAIService {
  private createPersonaSystemPrompt(
    persona: Persona, 
    userProfile: AssessmentProfile, 
    storyMemory: StoryMemory
  ): string {
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
      const systemPrompt = this.createPersonaSystemPrompt(persona, userProfile, storyMemory);
      
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        ...conversationHistory.slice(-6).map(msg => ({
          role: msg.role === 'user' ? 'user' as const : 'assistant' as const,
          content: msg.content
        })),
        { role: 'user', content: userMessage }
      ];

      const response = await createOpenAIClient().chat.completions.create({
        model: CHAT_MODEL,
        messages,
        temperature: 0.7,
        max_tokens: 800,
        response_format: { type: "json_object" }
      });

      const rawContent = response.choices[0].message.content;
      
      try {
        const parsedResponse = JSON.parse(rawContent || '{}');
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
      console.error('OpenAI API error:', error);
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
      const response = await createOpenAIClient().chat.completions.create({
        model: CHAT_MODEL,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.7
      });

      return JSON.parse(response.choices[0].message.content || '{}');
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
      if (!process.env.OPENAI_API_KEY) {
        return {
          status: 'error',
          model: CHAT_MODEL,
          error: 'OPENAI_API_KEY not configured'
        };
      }

      const response = await createOpenAIClient().chat.completions.create({
        model: CHAT_MODEL,
        messages: [{ role: 'user', content: 'Test connection. Respond with JSON: {"status": "ok"}' }],
        response_format: { type: "json_object" },
        max_tokens: 50
      });
      
      const result = JSON.parse(response.choices[0].message.content || '{}');
      if (result.status !== 'ok') {
        throw new Error('AI model did not respond correctly');
      }
      
      return {
        status: 'ok',
        model: CHAT_MODEL
      };
    } catch (error: any) {
      return {
        status: 'error',
        model: CHAT_MODEL,
        error: error.message
      };
    }
  }
}
