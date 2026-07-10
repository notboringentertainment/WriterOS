import type { BankPreview } from './banking';
import { renderOpenQuestionsBlock, renderStoryLocksBlock } from './banking';

const FRONTMATTER_KEYS = [
  'title',
  'logline',
  'format',
  'tone',
  'device',
  'status',
  'date',
  'run_mode',
  'seed_fidelity',
  'developed_on',
  'developed_by',
  'showrunner',
  'room_cast',
  'benched',
  'rounds_completed',
  'feedback_rounds',
] as const;

export const DEVELOPMENT_SUBSECTIONS = [
  'Room casting',
  'Polished loglines',
  'Concept test',
  'Premise',
  'One-page synopsis',
  'Comps',
  'Three-act beat skeleton',
  'Character spine',
  'Voiceover voice sample',
  'Opening scene',
  'World and rules',
  'Cross-critique log',
  'Provenance summary',
  'Feasibility gate',
  'Dissent ledger',
  'Producer notes',
  'Note compliance audit',
  'Cut ledger',
  'Per-specialist contribution',
  "Morgan's verdict",
] as const;

export type ExportCheckResult = { ok: true } | { ok: false; errors: string[] };

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function frontmatter(preview: BankPreview, date: string): string {
  return [
    '---',
    `title: ${yamlString(preview.title)}`,
    'logline: ""',
    'format: ""',
    'tone: ""',
    'device: ""',
    'status: seed',
    `date: ${date}`,
    'run_mode: ""',
    'seed_fidelity: ""',
    'developed_on: ""',
    'developed_by: ""',
    'showrunner: ""',
    'room_cast: []',
    'benched: []',
    'rounds_completed: 0',
    'feedback_rounds: 0',
    '---',
  ].join('\n');
}

export function renderPitchStudioSeedExport(preview: BankPreview, opts: { date?: string } = {}): string {
  const date = opts.date ?? new Date().toISOString().slice(0, 10);
  const seedLines = [preview.seedText.trim(), ...preview.datedAnswers, ...preview.seedColor, ...preview.leanings].filter(Boolean);
  const devSections = DEVELOPMENT_SUBSECTIONS.map((section) => `### ${section}\n`).join('\n');
  return [
    frontmatter(preview, date),
    '',
    `# ${preview.title}`,
    '',
    '## Seed',
    '',
    seedLines.join('\n\n'),
    '',
    '## Locks — do not violate',
    '',
    renderStoryLocksBlock(preview),
    '',
    '## Open questions — invent here',
    '',
    renderOpenQuestionsBlock(preview),
    '',
    '## Development',
    '',
    devSections,
  ].join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

function frontmatterBlock(markdown: string): string | null {
  if (!markdown.startsWith('---\n')) return null;
  const end = markdown.indexOf('\n---', 4);
  if (end === -1) return null;
  return markdown.slice(4, end);
}

function sectionBody(markdown: string, heading: string): string | null {
  const start = markdown.indexOf(`${heading}\n`);
  if (start === -1) return null;
  const after = start + heading.length + 1;
  const next = markdown.indexOf('\n## ', after);
  return (next === -1 ? markdown.slice(after) : markdown.slice(after, next)).trim();
}

export function checkInterviewExport(markdown: string): ExportCheckResult {
  const errors: string[] = [];
  const fm = frontmatterBlock(markdown);
  if (!fm) {
    errors.push('frontmatter block missing or invalid');
  } else {
    for (const key of FRONTMATTER_KEYS) {
      if (!new RegExp(`^${key}:`, 'm').test(fm)) errors.push(`frontmatter key missing: ${key}`);
    }
    if (!/^status:\s*seed\s*$/m.test(fm)) errors.push('frontmatter status must be seed');
  }

  const seed = sectionBody(markdown, '## Seed');
  if (!seed) errors.push('Seed section missing or empty');
  const locks = sectionBody(markdown, '## Locks — do not violate');
  if (!locks) errors.push('Locks section missing or empty');
  const openQuestions = sectionBody(markdown, '## Open questions — invent here');
  if (!openQuestions) errors.push('Open questions section missing or empty');
  const development = sectionBody(markdown, '## Development');
  if (!development) {
    errors.push('Development section missing');
  } else {
    for (const section of DEVELOPMENT_SUBSECTIONS) {
      const heading = `### ${section}`;
      if (!development.includes(heading)) errors.push(`Development subsection missing: ${section}`);
    }
    const filled = development
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('###'));
    if (filled.length > 0) errors.push('Development skeleton must be unfilled');
  }

  return errors.length ? { ok: false, errors } : { ok: true };
}
