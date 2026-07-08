import type { AuditVerdicts, InterviewMode } from './types';

export type InterviewLane = 'morgan' | 'casey' | 'zoe' | 'sam' | 'oliver' | 'maya' | 'alex';
export type InterviewRequirement = 'required' | 'conditional_required' | 'optional';
export type InterviewOriginOnConfirm = 'seed' | 'extrapolated' | 'seed_or_extrapolated' | 'delegation';

export interface QuestionBankRow {
  id: string;
  lane: InterviewLane;
  trigger: string;
  budget: number;
  question: string;
  writerOSTarget: string;
  templateDestination: string;
  originOnConfirm: InterviewOriginOnConfirm;
  requirement: InterviewRequirement;
}

export const QUESTION_BANK: readonly QuestionBankRow[] = [
  {
    id: 'morgan-locks',
    lane: 'morgan',
    trigger: 'locks',
    budget: 2,
    question: "What's the one thing this story is not allowed to become?",
    writerOSTarget: 'story_locks',
    templateDestination: '## Locks — do not violate',
    originOnConfirm: 'seed',
    requirement: 'required',
  },
  {
    id: 'morgan-ending',
    lane: 'morgan',
    trigger: 'ending',
    budget: 1,
    question: 'Do you know how it ends — even roughly? Or is the ending ours?',
    writerOSTarget: 'story_locks|open_questions',
    templateDestination: '## Locks / ## Open questions — invent here',
    originOnConfirm: 'seed',
    requirement: 'required',
  },
  {
    id: 'morgan-open-questions',
    lane: 'morgan',
    trigger: 'open_questions',
    budget: 1,
    question: "What's ours to invent — where do you want the room to surprise you?",
    writerOSTarget: 'open_questions',
    templateDestination: '## Open questions — invent here',
    originOnConfirm: 'delegation',
    requirement: 'required',
  },
  {
    id: 'casey-load-bearing-character',
    lane: 'casey',
    trigger: 'load_bearing_character',
    budget: 4,
    question: "What broke this person before page one? What can't they say out loud, even to themselves?",
    writerOSTarget: 'storyBible.characters[x].{flaw,secret,want,need}',
    templateDestination: '## Seed',
    originOnConfirm: 'seed_or_extrapolated',
    requirement: 'required',
  },
  {
    id: 'zoe-world-rules',
    lane: 'zoe',
    trigger: 'world_rules',
    budget: 3,
    question: 'What does this world refuse to allow?',
    writerOSTarget: 'story_locks + seed_color',
    templateDestination: '## Locks — do not violate + ## Seed',
    originOnConfirm: 'seed',
    requirement: 'conditional_required',
  },
  {
    id: 'sam-premise-identity',
    lane: 'sam',
    trigger: 'premise_identity',
    budget: 2,
    question: 'What is the trailer moment? And what is this absolutely NOT?',
    writerOSTarget: 'seed_color + frontmatter.tone',
    templateDestination: '## Seed + frontmatter',
    originOnConfirm: 'seed',
    requirement: 'optional',
  },
  {
    id: 'oliver-stakes-engine',
    lane: 'oliver',
    trigger: 'stakes_engine',
    budget: 2,
    question: 'What is the worst thing that could happen at the middle of this story?',
    writerOSTarget: 'seed_color|open_questions',
    templateDestination: '## Seed / ## Open questions — invent here',
    originOnConfirm: 'seed',
    requirement: 'optional',
  },
  {
    id: 'maya-voice-texture',
    lane: 'maya',
    trigger: 'voice_texture',
    budget: 2,
    question: 'What does this sound like — name a scene from anything that has the voice you hear.',
    writerOSTarget: 'seed_color + frontmatter.tone',
    templateDestination: '## Seed + frontmatter',
    originOnConfirm: 'seed',
    requirement: 'optional',
  },
  {
    id: 'alex-format-scope',
    lane: 'alex',
    trigger: 'format_scope',
    budget: 1,
    question: 'What is this — feature, pilot, short? And is there a budget reality I should know?',
    writerOSTarget: 'frontmatter.format + seed_color',
    templateDestination: 'frontmatter + ## Seed',
    originOnConfirm: 'seed',
    requirement: 'optional',
  },
];

const REQUIRED_TRIGGERS = ['locks', 'ending', 'open_questions', 'load_bearing_character'] as const;

export function getQuestionById(id: string): QuestionBankRow | undefined {
  return QUESTION_BANK.find((row) => row.id === id);
}

export function selectQuestionsForAudit(input: {
  audit: AuditVerdicts;
  mode: InterviewMode;
  speculative: boolean;
  includeOptional?: boolean;
}): QuestionBankRow[] {
  const requiredTriggers = [...REQUIRED_TRIGGERS];
  if (input.speculative) requiredTriggers.push('world_rules' as (typeof REQUIRED_TRIGGERS)[number]);

  if (input.mode === 'quick') {
    const selected: QuestionBankRow[] = [];
    for (const trigger of requiredTriggers) {
      if (input.audit[trigger] !== 'THIN') continue;
      const source = QUESTION_BANK.find((row) => row.trigger === trigger && row.requirement !== 'optional');
      if (source) selected.push({ ...source, lane: 'morgan', budget: 1 });
    }
    return selected;
  }

  return QUESTION_BANK.filter((row) => {
    if (row.requirement === 'optional') return Boolean(input.includeOptional) && input.audit[row.trigger] === 'THIN';
    if (row.trigger === 'world_rules' && !input.speculative) return false;
    return input.audit[row.trigger] === 'THIN';
  });
}
