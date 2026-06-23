// Morgan Runtime — reach contract.
// Pure derivation of what Morgan can honestly claim to see/do, computed from the
// real StoryMemory packet. Guards the recurring "agent claims to see what it can't"
// failure mode: a surface only appears in canSee when its field is actually populated.

import type { StoryMemory } from '../../../shared/schema';
import { CALLABLE_SPECIALIST_IDS, PERSONAS } from '../../../shared/personas';
import type { ReachInventory } from './types';

const filled = (v: unknown): boolean => typeof v === 'string' && v.trim().length > 0;

// Display names derived from the single callable-specialist registry, so the reach
// contract copy can never drift from the askSpecialist tool enum.
const SPECIALIST_NAMES = CALLABLE_SPECIALIST_IDS.map((id) => PERSONAS[id].name).join(', ');

/** Build Morgan's honest capability inventory from the current StoryMemory packet. */
export function buildReachInventory(memory: StoryMemory): ReachInventory {
  const canSee: string[] = [];
  const p = memory.project ?? ({} as StoryMemory['project']);

  if (filled(p.title)) canSee.push(`the project title ("${p.title}")`);
  if (filled(p.genre)) canSee.push('the genre');
  if (filled(p.format)) canSee.push('the format');
  if (filled(p.logline)) canSee.push('the logline');
  if (filled(p.synopsis)) canSee.push('the synopsis prose');
  if (p.synopsisSections && Object.values(p.synopsisSections).some(filled)) canSee.push('the synopsis sections');
  if (filled(p.treatment)) canSee.push('the treatment');
  if (filled(p.themes)) canSee.push('the story-bible themes');

  const characterCount = memory.characters ? Object.keys(memory.characters).length : 0;
  if (characterCount > 0) canSee.push(`${characterCount} character${characterCount === 1 ? '' : 's'}`);

  const beatCount = memory.outline?.beats?.length ?? 0;
  if (beatCount > 0) canSee.push(`${beatCount} outline beat${beatCount === 1 ? '' : 's'}`);

  const sceneCount = memory.outline?.scenes?.length ?? 0;
  if (sceneCount > 0) canSee.push(`${sceneCount} script scene${sceneCount === 1 ? '' : 's'}`);

  if (memory.script && filled(memory.script.excerpt)) canSee.push('a script excerpt (capped)');
  if (memory.surface) canSee.push('the live surface you are on');
  if (memory.location) canSee.push('your workspace location (cursor/selection)');

  if (canSee.length === 0) canSee.push('nothing yet — this project has no authored content in context');

  const cannotSee = [
    'the literal pixels or layout on your screen',
    'any fields that are not in this context packet',
    'other apps, your file system, or anything outside WriterOS',
    'the live web or anything after my knowledge cutoff',
  ];

  const canDoNow = [
    'read and synthesize the project context above',
    'answer film, reference, and general questions from my own knowledge',
    'give you a showrunner-level read: name the central problem, the tradeoff, the next move',
    `recommend which specialist (${SPECIALIST_NAMES}) is the right next visit`,
    `consult one specialist at a time (${SPECIALIST_NAMES}) to get their actual read, then synthesize it for you`,
  ];

  const cannotDoYet = [
    'consult more than one specialist at once (no parallel room orchestration yet)',
    'edit or rewrite your draft',
    'look things up on the live web',
  ];

  return { canSee, cannotSee, canDoNow, cannotDoYet };
}

/** Render Morgan's capability inventory as prompt text for the tool-loop runtime. */
export function renderReachContract(inv: ReachInventory): string {
  const section = (label: string, items: string[]) => `${label}:\n${items.map((i) => `- ${i}`).join('\n')}`;
  return [
    'MORGAN REACH (derived from the current context — state this honestly if the writer asks what you can see or do):',
    section('What I can see right now', inv.canSee),
    section('What I cannot see', inv.cannotSee),
    section('What I can do now', inv.canDoNow),
    section('What I cannot do yet', inv.cannotDoYet),
  ].join('\n\n');
}
