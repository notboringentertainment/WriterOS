import { CALLABLE_SPECIALIST_IDS, PERSONAS } from '../../../shared/personas';
import {
  ASK_SPECIALIST_TOOL_NAME,
  MORGAN_TOOLS,
  RESPOND_TOOL_NAME,
  dispatchTool as dispatchMorganTool,
} from '../morganRuntime/tools';
import type { MorganRuntimeResult, SpecialistConsultTrace } from '../morganRuntime/types';
import type { AgentToolset } from './types';

const ONE_AT_A_TIME =
  'Consult one specialist at a time — re-issue a single askSpecialist call.';
const PREMATURE_FINAL =
  'You called respond_to_writer before seeing the specialist answer. Wait for the askSpecialist result, then call respond_to_writer with your synthesized answer.';

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const ATTRIBUTION_PATTERNS = [
  (name: string) => String.raw`\b(?:I|we|Morgan)\s+(?:asked|consulted|called|checked with|brought in)\s+${name}\b`,
  (name: string) => String.raw`\b(?:read|take|view|note|notes|question|questions|diagnosis|assessment|analysis)\s+from\s+${name}\b`,
  (name: string) => String.raw`\b${name}'s\s+(?:read|take|view|note|notes|question|questions|diagnosis|assessment|analysis)\b`,
  (name: string) => String.raw`\b${name}\s+(?:came back with|returned with|reported back with|gave me)\b`,
  (name: string) => String.raw`\b(?:according to|per)\s+${name}\b`,
];

function unverifiedSpecialistAttributions(
  result: MorganRuntimeResult,
  consultLedger: Map<string, SpecialistConsultTrace>,
): string[] {
  const text = [result.message, ...result.suggestions].join('\n');
  return CALLABLE_SPECIALIST_IDS.filter((id) => {
    if (consultLedger.has(id)) return false;
    const name = escapeRegExp(PERSONAS[id].name);
    return ATTRIBUTION_PATTERNS.some((pattern) => new RegExp(pattern(name), 'i').test(text));
  });
}

function attributionError(ids: string[]): string {
  const names = ids.map((id) => PERSONAS[id as keyof typeof PERSONAS]?.name ?? id).join(', ');
  return (
    `You have not consulted ${names} in this Morgan run. ` +
    `Do not attribute reads, questions, notes, or claims to ${names}. ` +
    'Either call askSpecialist for the relevant specialist now, or answer in Morgan\'s voice and credit the writer\'s material to the writer.'
  );
}

export const hostToolset: AgentToolset = {
  tools: MORGAN_TOOLS,
  terminalToolName: RESPOND_TOOL_NAME,
  consultToolName: ASK_SPECIALIST_TOOL_NAME,
  maxConsultsPerTurn: 1,
  parallelConsultError: ONE_AT_A_TIME,
  prematureFinalError: PREMATURE_FINAL,
  malformedNudge: 'You must finish by calling the respond_to_writer tool with your answer. Do not answer in plain text.',
  dispatchTool: dispatchMorganTool,
  attributionGuard: {
    findViolations: unverifiedSpecialistAttributions,
    formatError: attributionError,
  },
};

export const AGENT_TOOLSETS: Record<string, AgentToolset> = {
  writingPartner: hostToolset,
};

export function getAgentToolset(personaId: string): AgentToolset {
  const toolset = AGENT_TOOLSETS[personaId];
  if (!toolset) throw new Error(`No agent toolset registered for ${personaId}`);
  return toolset;
}
