import type { Express } from 'express'
import { z } from 'zod'
import { createModelProvider, type ModelProvider } from '../ai/modelProvider'
import { extractFirstJsonObject } from '../ai/openaiService'
import type { ProjectLibraryConfig } from '../projectLibrary/config'
import { authenticated, sameOrigin } from '../projectLibrary/security'
import { ProjectLibraryStoreError, type ProjectLibraryStore } from '../projectLibrary/store'
import {
  ProjectMemoryAgentUnavailableError,
  buildAgentMemoryContext,
  type AgentMemoryContext,
  finalizeAgentMemoryText,
  type ProjectMemoryProvider,
} from '../projectMemory/agentContext'
import type { MemoryReceipt } from '../../shared/schema'
import { LookbookQuestionsRequestSchema } from '../../shared/lookbook'
import { buildLookbookSystemPrompt, buildLookbookUserMessage } from './buildLookbookPrompt'

const ModelOutputSchema = z.object({
  questions: z.array(z.object({ prompt: z.string().min(8).max(240) })).max(5),
  nothingToSee: z.boolean(),
})

type ModelOutput = z.infer<typeof ModelOutputSchema>

type Citation = MemoryReceipt['citations'][number]
interface FinalOutput { output: ModelOutput; citations: Citation[] }

function validOutput(value: unknown, memory: AgentMemoryContext): FinalOutput | null {
  const parsed = ModelOutputSchema.safeParse(value)
  if (!parsed.success) return null
  const { questions, nothingToSee } = parsed.data
  if (questions.length === 0) return nothingToSee ? { output: parsed.data, citations: [] } : null
  if (questions.length < 3 || nothingToSee) return null

  // Run every prompt through the memory citation filter: unauthorised tokens are
  // stripped, authorised ones are recorded in the receipt and kept out of the text.
  const citations = new Map<string, Citation>()
  const finalised: Array<{ prompt: string }> = []
  for (const question of questions) {
    const result = finalizeAgentMemoryText(question.prompt, memory)
    let text = result.text
    for (const citation of result.receipt.citations) {
      citations.set(citation.id, citation)
      text = text.split(citation.id).join(' ')
    }
    text = text.replace(/\s+/g, ' ').trim()
    if (text.length < 8 || text.length > 240) return null
    finalised.push({ prompt: text })
  }
  return {
    output: { questions: finalised, nothingToSee },
    citations: [...citations.values()].sort((a, b) => a.id.localeCompare(b.id)),
  }
}

async function askZoe(
  provider: ModelProvider,
  system: string,
  user: string,
  memory: AgentMemoryContext,
): Promise<({ ok: true } & FinalOutput) | { ok: false; reason: string }> {
  let lastErr = 'unknown'
  for (let attempt = 0; attempt < 2; attempt++) {
    let raw: string
    try {
      raw = await provider.generateResponse({
        systemPrompt: system,
        messages: [{ role: 'user', content: user }],
        temperature: 0.7,
        maxTokens: 800,
      })
    } catch (error) {
      lastErr = error instanceof Error ? error.message : 'provider error'
      continue
    }
    const jsonText = extractFirstJsonObject(raw)
    let value: unknown = null
    try { value = jsonText ? JSON.parse(jsonText) : null } catch { value = null }
    const final = validOutput(value, memory)
    if (final) return { ok: true, ...final }
    lastErr = 'invalid model JSON'
  }
  return { ok: false, reason: lastErr }
}

export function registerLookbookRoutes(
  app: Express,
  config: ProjectLibraryConfig,
  store: ProjectLibraryStore | null,
  memoryProvider: ProjectMemoryProvider | null = null,
): void {
  app.post('/api/lookbook/:projectId/questions', sameOrigin(config), authenticated(config), async (req, res) => {
    try {
      const body = LookbookQuestionsRequestSchema.safeParse(req.body)
      if (!body.success) return res.status(400).json({ error: 'invalid_request' })
      if (!config.enabled || !store) {
        return res.status(503).json({ error: 'disabled', message: 'Server project library is disabled.' })
      }
      const modelProvider = createModelProvider()
      if (!modelProvider.isConfigured()) {
        return res.status(503).json({ error: 'lookbook_unavailable', reason: 'No model configured.' })
      }

      const projectId = req.params.projectId
      const read = await store.readProject(projectId)
      if (!read.ok) return res.status(422).json({ error: 'lookbook_failed', reason: 'The project package could not be read.' })
      const project = read.project
      const unit = project.state.documents.outline.content.units.find(u => u.id === body.data.beatKey)
      if (!unit) return res.status(404).json({ error: 'beat_not_found' })
      const existingPrompts = (project.state.documents.lookbook?.beats[body.data.beatKey]?.questions ?? [])
        .filter(q => !q.dismissedAt)
        .map(q => q.prompt)

      const memory = await buildAgentMemoryContext(memoryProvider, projectId, {
        message: unit.whatHappens,
        surface: 'outline',
        personaId: 'zoe',
      })
      const result = await askZoe(
        modelProvider,
        buildLookbookSystemPrompt(memory.prompt),
        buildLookbookUserMessage({
          movement: unit.actOrSequence,
          title: unit.title,
          body: unit.whatHappens,
          existingPrompts,
        }),
        memory,
      )
      if (!result.ok) return res.status(422).json({ error: 'lookbook_failed', reason: result.reason })

      const { receipt } = finalizeAgentMemoryText('', memory)
      return res.json({ ...result.output, memoryReceipt: { ...receipt, citations: result.citations } })
    } catch (error) {
      if (error instanceof ProjectLibraryStoreError) {
        return res.status(error.statusCode).json({ error: error.code, message: error.message })
      }
      if (error instanceof ProjectMemoryAgentUnavailableError) {
        return res.status(503).json({ error: 'project-memory-unavailable', message: error.message })
      }
      console.error('Lookbook questions failed:', error instanceof Error ? error.message : error)
      return res.status(500).json({ error: 'lookbook_failed', reason: 'Zoe could not write questions.' })
    }
  })
}
