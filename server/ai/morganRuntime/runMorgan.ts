// Morgan Runtime adapter. The shared loop now lives in agentRuntime; this file
// preserves Morgan's public API and behavior for existing call sites/tests.

import { runAgent } from '../agentRuntime/runAgent';
import { getAgentToolset } from '../agentRuntime/toolsets';
import type { MorganRuntimeResult, RunMorganInput } from './types';

export async function runMorgan(input: RunMorganInput): Promise<MorganRuntimeResult> {
  return runAgent({
    ...input,
    personaId: input.personaId ?? 'writingPartner',
    toolset: getAgentToolset('writingPartner'),
    errorLogLabel: 'Morgan runtime error:',
  });
}
