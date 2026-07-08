// Writers' Room — lock fidelity gate (§7.3).
// Before a proposal persists: does the proposed value contradict an active
// story lock? LLM check on the cheap tier, cached by content hash. Agents may
// argue against locks in the channel; they cannot write around them.

import { createHash } from 'node:crypto';
import { sendStreamingMessage } from '../ai/morganRuntime/anthropicToolClient';

export const DIGEST_MODEL = process.env.ANTHROPIC_DIGEST_MODEL || 'claude-haiku-4-5';

export interface LockCheckResult {
  blocked: boolean;
  reason?: string;
}

const cache = new Map<string, LockCheckResult>();

function cacheKey(locksText: string, surface: string, fieldPath: string, proposedValue: string): string {
  return createHash('sha256').update(`${locksText}\u0000${surface}\u0000${fieldPath}\u0000${proposedValue}`).digest('hex');
}

export async function checkProposalAgainstLocks(input: {
  locksText: string;
  surface: string;
  fieldPath: string;
  proposedValue: string;
}): Promise<LockCheckResult> {
  const locks = input.locksText.trim();
  if (!locks) return { blocked: false };

  const key = cacheKey(locks, input.surface, input.fieldPath, input.proposedValue);
  const cached = cache.get(key);
  if (cached) return cached;

  try {
    const response = await sendStreamingMessage({
      model: DIGEST_MODEL,
      maxTokens: 300,
      system:
        'You are a strict story-lock compliance checker. Locks are decisions the writer has frozen. ' +
        'A proposal is BLOCKED only if adopting it would contradict or overwrite what a lock pins down. ' +
        'Proposals about aspects no lock governs are allowed. ' +
        'Respond with ONLY a JSON object: {"blocked": boolean, "reason": string}. The reason must name the lock when blocked.',
      messages: [
        {
          role: 'user',
          content: `ACTIVE LOCKS:\n${locks}\n\nPROPOSAL:\nsurface: ${input.surface}\nfield: ${input.fieldPath}\nproposed value: ${input.proposedValue}\n\nDoes this proposal contradict any lock?`,
        },
      ],
    });

    const text = response.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('');
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`lock check returned no JSON: ${text.slice(0, 200)}`);
    const parsed = JSON.parse(match[0]) as { blocked?: unknown; reason?: unknown };
    const result: LockCheckResult = {
      blocked: parsed.blocked === true,
      reason: typeof parsed.reason === 'string' ? parsed.reason : undefined,
    };
    cache.set(key, result);
    return result;
  } catch (error) {
    // Fail open (D14): a flaky lock check must not silently swallow proposals —
    // the writer still adopts/rejects every card by hand, so the human gate holds.
    console.warn('[room.lockGate] check failed, allowing proposal through:', error);
    return { blocked: false };
  }
}

export function __clearLockGateCacheForTests(): void {
  cache.clear();
}
