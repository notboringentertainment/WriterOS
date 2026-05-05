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

const wpChatSchema = z.object({
  personaId: z.string(),
  message: z.string(),
  projectContext: z.object({
    title: z.string().optional(),
    genre: z.string().optional(),
    logline: z.string().optional(),
    characters: z.array(z.string()),
    beats: z.array(z.string()),
    world: z.object({ setting: z.string().optional() }),
  }),
  conversationHistory: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })),
});

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

      const storyMemory: StoryMemory = {
        project: {
          title: data.projectContext.title,
          genre: data.projectContext.genre,
          logline: data.projectContext.logline,
        },
        characters: Object.fromEntries(
          data.projectContext.characters.map(name => [name, { id: name, name, role: '' }])
        ),
        outline: {
          acts: 3,
          beats: data.projectContext.beats.map((name, i) => ({ id: String(i), act: 1, description: name })),
        },
        worldRules: { setting: data.projectContext.world.setting },
        dialogue: { samples: [] },
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

  // Health check
  app.get("/api/health", async (req, res) => {
    const aiHealth = await openaiService.healthCheck();
    res.json({ 
      status: "ok", 
      ai: !!process.env.OPENAI_API_KEY,
      aiService: aiHealth
    });
  });

  const httpServer = createServer(app);
  return httpServer;
}
