import type { Express } from "express";
import { createServer, type Server } from "http";
import { OpenAIService } from "./ai/openaiService";
import { PERSONAS } from "@shared/personas";
import { z } from "zod";
import type { StoryMemory } from "@shared/schema";

const openaiService = new OpenAIService();

// Request schemas
const chatMessageSchema = z.object({
  personaId: z.string(),
  message: z.string(),
  userProfile: z.object({
    entryState: z.enum(['blank_slate', 'idea_only', 'outline_complete', 'pages_written_stuck', 'draft_complete_lost', 'revision_mode']),
    existingWork: z.array(z.string()),
    immediateNeed: z.string(),
    feedbackStyle: z.enum(['direct', 'gentle', 'detailed']),
    writerName: z.string()
  }),
  storyMemory: z.object({
    project: z.object({
      title: z.string().optional(),
      genre: z.string().optional(),
      logline: z.string().optional(),
      synopsis: z.string().optional()
    }),
    characters: z.record(z.any()),
    outline: z.object({
      acts: z.number(),
      beats: z.array(z.any())
    }),
    worldRules: z.object({
      setting: z.string().optional(),
      magicSystem: z.string().optional(),
      technology: z.string().optional()
    }),
    dialogue: z.object({
      samples: z.array(z.string()).optional(),
      characterVoices: z.record(z.string()).optional()
    }),
    userProfile: z.object({
      entryState: z.enum(['blank_slate', 'idea_only', 'outline_complete', 'pages_written_stuck', 'draft_complete_lost', 'revision_mode']),
      existingWork: z.array(z.string()),
      immediateNeed: z.string(),
      feedbackStyle: z.enum(['direct', 'gentle', 'detailed']),
      writerName: z.string(),
    }),
    decisions: z.array(z.any())
  }),
  conversationHistory: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string()
  }))
});

const synopsisAssistSchema = z.object({
  userInput: z.string(),
  currentLogline: z.string(),
  currentSynopsis: z.string(),
  projectDetails: z.object({
    title: z.string().optional(),
    genre: z.string().optional()
  }),
  userProfile: z.object({
    entryState: z.enum(['blank_slate', 'idea_only', 'outline_complete', 'pages_written_stuck', 'draft_complete_lost', 'revision_mode']),
    existingWork: z.array(z.string()),
    immediateNeed: z.string(),
    feedbackStyle: z.enum(['direct', 'gentle', 'detailed']),
    writerName: z.string()
  })
});

const scriptContextSchema = z.object({
  excerpt: z.string().default(''),
  sceneHeadings: z.array(z.string()).default([]),
  dialogueSnippets: z.array(z.string()).default([]),
  actionSnippets: z.array(z.string()).default([]),
  characterNames: z.array(z.string()).default([]),
  excerptWordCount: z.number().default(0),
  excerptWordLimit: z.number().default(500),
  excerptTruncated: z.boolean().default(false),
  totalWordCount: z.number().default(0),
  estimatedPageCount: z.number().default(0),
  sceneCount: z.number().default(0),
  contextReason: z.string().optional(),
  contextLabel: z.string().optional(),
  pageRange: z.object({
    start: z.number(),
    end: z.number(),
  }).optional(),
  selectedText: z.string().optional(),
}).optional();

const projectContextSchema = z.object({
  title: z.string().optional(),
  genre: z.string().optional(),
  logline: z.string().optional(),
  script: scriptContextSchema,
  synopsis: z.object({
    logline: z.string(),
    sections: z.object({
      setup: z.string(),
      act1Break: z.string(),
      midpoint: z.string(),
      act2Break: z.string(),
      resolution: z.string(),
    }),
  }),
  characters: z.array(z.object({
    id: z.string(),
    name: z.string(),
    role: z.string(),
    wound: z.string(),
    want: z.string(),
    need: z.string(),
    arc: z.string(),
  })),
  beats: z.array(z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    notes: z.string(),
    linkedSceneIds: z.array(z.string()).default([]),
  })),
  scenes: z.array(z.object({
    id: z.string(),
    heading: z.string(),
    index: z.number(),
  })),
  storyBible: z.object({
    themes: z.string().default(''),
    rules: z.string().default(''),
    world: z.object({
      setting: z.string().default(''),
      toneAnchors: z.string().default(''),
      voiceNotes: z.string().default(''),
    }),
  }),
  world: z.object({
    setting: z.string().default(''),
    toneAnchors: z.string().default(''),
    voiceNotes: z.string().default(''),
  }),
});

const wpChatSchema = z.object({
  personaId: z.string(),
  message: z.string(),
  projectContext: projectContextSchema,
  conversationHistory: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })),
});

const openSwarmWritingPartnerSchema = z.object({
  message: z.string(),
  projectContext: projectContextSchema,
});

type ProjectContextForOpenSwarm = z.infer<typeof projectContextSchema>;

function filled(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function truncate(value: string, limit = 900): string {
  const trimmed = value.trim();
  return trimmed.length <= limit ? trimmed : `${trimmed.slice(0, limit).trim()}...`;
}

function bulletLines(items: string[]): string {
  return items.length ? items.map(item => `- ${item}`).join('\n') : '- None supplied';
}

function buildOpenSwarmWritingPartnerPrompt(message: string, projectContext: ProjectContextForOpenSwarm): string {
  const synopsisSections = Object.entries(projectContext.synopsis.sections)
    .filter(([, value]) => filled(value))
    .map(([key, value]) => `- ${key}: ${truncate(value, 500)}`);

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
      ].filter(Boolean).join('; ');
      return `${character.name}${details ? ` (${truncate(details, 220)})` : ''}`;
    });

  const beatLines = projectContext.beats
    .slice(0, 12)
    .map(beat => `${beat.name}: ${truncate(beat.notes || beat.description, 260)}`);

  const script = projectContext.script;
  const scriptLines = [
    script?.contextLabel && `Context: ${script.contextLabel}`,
    script?.selectedText && `Selected text: ${truncate(script.selectedText, 900)}`,
    script?.excerpt && `Excerpt: ${truncate(script.excerpt, 900)}`,
    script?.sceneHeadings?.length ? `Scene headings: ${script.sceneHeadings.slice(0, 10).join('; ')}` : '',
  ].filter(filled);

  const storyBibleLines = [
    projectContext.storyBible.world.setting && `Setting: ${projectContext.storyBible.world.setting}`,
    projectContext.storyBible.world.toneAnchors && `Tone anchors: ${projectContext.storyBible.world.toneAnchors}`,
    projectContext.storyBible.world.voiceNotes && `Voice notes: ${projectContext.storyBible.world.voiceNotes}`,
    projectContext.storyBible.themes && `Themes: ${projectContext.storyBible.themes}`,
    projectContext.storyBible.rules && `Rules: ${projectContext.storyBible.rules}`,
  ].filter(filled).map(line => truncate(line, 500));

  return `You are OpenSwarm Writing Partner. Review only this bounded WriterOS handoff packet.

Boundary rules:
- Do not claim access to WriterOS transcripts, files, Voice Profile, or project state beyond this packet.
- Do not mutate WriterOS state.
- Treat this as advisory output that may be shown in the WriterOS Writing Partner transcript.
- For story development, recommend only WriterOS creative partners: Sam, Casey, Oliver, Maya, Zoe, or Alex.
- Recommend Deep Research only when the user explicitly asks for current/recent facts, source-backed research, real-world analogs, or market comps.
- If current/recent web research is explicitly required, do not guess; provide a Deep Research brief.

Creative partner lanes:
- Sam: loglines, synopsis, pitch language, hook, stakes, comps framing.
- Casey: character motivation, want/need/wound, relationships, emotional engine, theme-through-behavior.
- Oliver: outline beats, act turns, scene-level escalation, pacing, causality, structure.
- Maya: dialogue, character voice, subtext, rhythm, line alternatives.
- Zoe: world-building, rules, continuity, canon questions, setting logic.
- Alex: draft readiness, process, momentum, treatment-to-pages planning.

User question:
${message}

Project context supplied by WriterOS:
- Title: ${projectContext.title || 'Untitled'}
- Genre: ${projectContext.genre || 'Not supplied'}
- Logline: ${projectContext.logline || projectContext.synopsis.logline || 'Not supplied'}

Synopsis sections:
${synopsisSections.length ? synopsisSections.join('\n') : '- None supplied'}

Characters:
${bulletLines(characterLines)}

Outline beats:
${bulletLines(beatLines)}

Story Bible:
${bulletLines(storyBibleLines)}

Script context:
${scriptLines.length ? scriptLines.join('\n') : '- None supplied'}`;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Chat with persona
  app.post("/api/chat", async (req, res) => {
    try {
      const data = chatMessageSchema.parse(req.body);
      const persona = PERSONAS[data.personaId];
      
      if (!persona) {
        return res.status(400).json({ error: "Invalid persona ID" });
      }

      const response = await openaiService.generatePersonaResponse(
        persona,
        data.message,
        data.userProfile,
        data.storyMemory,
        data.conversationHistory
      );

      res.json(response);
    } catch (error) {
      console.error("Chat error:", error);
      res.status(500).json({ 
        error: "Failed to process chat message",
        message: "I'm having trouble connecting right now. Please try again in a moment."
      });
    }
  });

  // Synopsis assistance
  app.post("/api/synopsis-assist", async (req, res) => {
    try {
      const data = synopsisAssistSchema.parse(req.body);
      
      const response = await openaiService.generateSynopsisAssistance(
        data.userInput,
        data.currentLogline,
        data.currentSynopsis,
        data.projectDetails,
        data.userProfile
      );

      res.json(response);
    } catch (error) {
      console.error("Synopsis assist error:", error);
      res.status(500).json({ 
        error: "Failed to process synopsis assistance",
        feedback: "I'm having trouble connecting right now, but keep working on making your story's central conflict clear and compelling."
      });
    }
  });

  // Writing Partner chat — thin adapter over generatePersonaResponse
  app.post("/api/wp-chat", async (req, res) => {
    try {
      const data = wpChatSchema.parse(req.body);
      const persona = PERSONAS[data.personaId];

      if (!persona) {
        return res.status(400).json({ error: "Invalid persona ID" });
      }

      const userProfile = {
        writerName: 'Writer',
        feedbackStyle: 'direct' as const,
        entryState: 'idea_only' as const,
        existingWork: [] as string[],
        immediateNeed: '',
      };
      const scriptContext = data.projectContext.script;

      const storyMemory: StoryMemory = {
        project: {
          title: data.projectContext.title,
          genre: data.projectContext.genre,
          logline: data.projectContext.logline,
          synopsis: Object.values(data.projectContext.synopsis.sections).filter(Boolean).join('\n\n'),
          synopsisSections: data.projectContext.synopsis.sections,
          themes: data.projectContext.storyBible.themes,
        },
        script: scriptContext ? {
          excerpt: scriptContext.excerpt,
          sceneHeadings: scriptContext.sceneHeadings,
          dialogueSnippets: scriptContext.dialogueSnippets,
          actionSnippets: scriptContext.actionSnippets,
          characterNames: scriptContext.characterNames,
          excerptWordCount: scriptContext.excerptWordCount,
          excerptWordLimit: scriptContext.excerptWordLimit,
          excerptTruncated: scriptContext.excerptTruncated,
          totalWordCount: scriptContext.totalWordCount,
          estimatedPageCount: scriptContext.estimatedPageCount,
          sceneCount: scriptContext.sceneCount,
          contextReason: scriptContext.contextReason,
          contextLabel: scriptContext.contextLabel,
          pageRange: scriptContext.pageRange,
          selectedText: scriptContext.selectedText,
        } : undefined,
        characters: Object.fromEntries(
          data.projectContext.characters.map(character => [
            character.id,
            {
              id: character.id,
              name: character.name,
              role: character.role,
              backstory: character.wound,
              motivation: character.want || character.need,
              arc: character.arc,
            },
          ])
        ),
        outline: {
          acts: 3,
          beats: data.projectContext.beats.map((beat, i) => ({
            id: beat.id,
            act: i < 5 ? 1 : i < 12 ? 2 : 3,
            description: beat.notes ? `${beat.name}: ${beat.notes}` : `${beat.name}: ${beat.description}`,
            purpose: beat.description,
          })),
          scenes: data.projectContext.scenes,
        },
        worldRules: {
          setting: data.projectContext.world.setting,
          toneAnchors: data.projectContext.world.toneAnchors,
          rules: data.projectContext.storyBible.rules,
        },
        dialogue: {
          samples: [],
          voiceNotes: data.projectContext.world.voiceNotes,
        },
        userProfile,
        decisions: [],
      };

      const response = await openaiService.generatePersonaResponse(
        persona,
        data.message,
        userProfile,
        storyMemory,
        data.conversationHistory
      );

      res.json({ message: response.message, suggestions: response.suggestions });
    } catch (error) {
      console.error("WP chat error:", error);
      res.status(500).json({
        error: "Failed to process message",
        message: "I'm having trouble connecting right now. Please try again."
      });
    }
  });

  // OpenSwarm Writing Partner bridge — explicit opt-in, separate from /api/wp-chat
  app.post("/api/openswarm/writing-partner", async (req, res) => {
    try {
      const data = openSwarmWritingPartnerSchema.parse(req.body);
      const baseUrl = process.env.OPENSWARM_URL || process.env.OPEN_SWARM_URL || 'http://localhost:8080';
      const token = process.env.OPENSWARM_APP_TOKEN || process.env.OPEN_SWARM_APP_TOKEN;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60_000);
      let response: Response;

      try {
        response = await fetch(`${baseUrl.replace(/\/$/, '')}/open-swarm/get_response`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            recipient_agent: 'Writing Partner',
            message: buildOpenSwarmWritingPartnerPrompt(data.message, data.projectContext),
            chat_history: [],
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error("OpenSwarm Writing Partner error:", response.status, errorText);
        return res.status(502).json({
          error: "OpenSwarm request failed",
          message: "OpenSwarm is reachable, but Writing Partner could not complete the request.",
        });
      }

      const payload = await response.json() as { response?: unknown; error?: unknown };
      if (payload.error) {
        console.error("OpenSwarm Writing Partner payload error:", payload.error);
        return res.status(502).json({
          error: "OpenSwarm returned an error",
          message: "OpenSwarm Writing Partner returned an error.",
        });
      }

      res.json({
        message: typeof payload.response === 'string' ? payload.response : "OpenSwarm Writing Partner did not return a text response.",
      });
    } catch (error) {
      console.error("OpenSwarm bridge error:", error);
      res.status(502).json({
        error: "Failed to reach OpenSwarm",
        message: "Start OpenSwarm's FastAPI server on port 8080, then try again.",
      });
    }
  });

  // Health check
  app.get("/api/health", async (req, res) => {
    const aiHealth = await openaiService.healthCheck();
    res.json({ 
      status: "ok", 
      ai: aiHealth.status === 'ok',
      aiService: aiHealth
    });
  });

  const httpServer = createServer(app);
  return httpServer;
}
