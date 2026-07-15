import { z } from 'zod'
import { createModelProvider, type ModelProvider } from '../../ai/modelProvider'

export const PITCH_PACKET_PROPOSAL_SYSTEM_PROMPT = `You propose only missing scalar fields for a Pitch Packet.
Ground every proposal in the supplied project documents, Meeting seed, and banked answers. Do not invent unsupported plot facts.
Return one JSON object containing only these optional string keys: title, logline, format, genre, tone, premise, storyEngine.`

export const PitchPacketProposalSchema = z.object({
  title: z.string().optional(), logline: z.string().optional(), format: z.string().optional(), genre: z.string().optional(),
  tone: z.string().optional(), premise: z.string().optional(), storyEngine: z.string().optional(),
})
export type PitchPacketProposals = z.infer<typeof PitchPacketProposalSchema>

function extractJsonObject(raw: string): unknown {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end < start) throw new Error('proposal response did not contain a JSON object')
  return JSON.parse(raw.slice(start, end + 1))
}

export async function generatePitchPacketProposals(
  groundedProjectContext: unknown,
  provider: ModelProvider = createModelProvider(),
): Promise<{ proposals: PitchPacketProposals; unavailable: boolean }> {
  if (!provider.isConfigured()) return { proposals: {}, unavailable: true }
  try {
    const raw = await provider.generateResponse({
      systemPrompt: PITCH_PACKET_PROPOSAL_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: JSON.stringify(groundedProjectContext) }],
      temperature: 0.2,
      maxTokens: 900,
    })
    return { proposals: PitchPacketProposalSchema.parse(extractJsonObject(raw)), unavailable: false }
  } catch {
    return { proposals: {}, unavailable: true }
  }
}
