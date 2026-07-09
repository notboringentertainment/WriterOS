import { describe, expect, it } from 'vitest';
import { checkInterviewExport, renderPitchStudioSeedExport } from '../../../server/room/interview/exportCheck';
import type { BankPreview } from '../../../server/room/interview/banking';

const preview: BankPreview = {
  title: 'Hearth Ghosts',
  seedText: 'A grieving chef returns home.',
  datedAnswers: ['[SEED] Interview answer, 2026-07-08: Mara cannot forgive herself.'],
  seedColor: [],
  locks: ['[SEED] Never become cynical.'],
  leanings: ['[EXTRAPOLATED] Mara may sell the restaurant — challenge permitted.'],
  openQuestions: ['Who buys the restaurant if Mara fails?'],
  conceptSeedAppend: 'placeholder',
  taggable: [],
};

describe('First Meeting PitchStudio export check', () => {
  it('renders TEMPLATE.md-compatible seed export with verbatim seed first and unfilled Development skeleton', () => {
    const markdown = renderPitchStudioSeedExport(preview, { date: '2026-07-08' });

    expect(markdown).toContain('status: seed');
    expect(markdown).toContain('run_mode: ""');
    expect(markdown).toMatch(/## Seed\n\nA grieving chef returns home\./);
    expect(markdown).toContain('[SEED] Interview answer');
    expect(markdown).toContain('## Locks — do not violate');
    expect(markdown).toContain('## Open questions — invent here');
    expect(markdown).toContain('## Development');
    expect(markdown).toContain('### Room casting');
    expect(markdown).toContain('### Morgan\'s verdict');
    expect(checkInterviewExport(markdown).ok).toBe(true);
  });

  it('fails export when required sections or explicit empty states are missing', () => {
    const bad = '---\ntitle: "Hearth Ghosts"\nstatus: seed\n---\n# Hearth Ghosts\n\n## Seed\n\nA grieving chef returns home.\n';

    const result = checkInterviewExport(bad);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toEqual(expect.arrayContaining([
        expect.stringContaining('frontmatter'),
        expect.stringContaining('Locks'),
        expect.stringContaining('Open questions'),
        expect.stringContaining('Development'),
      ]));
    }
  });

  it('allows explicit empty-state lines for Locks and Open questions', () => {
    const markdown = renderPitchStudioSeedExport({ ...preview, locks: [], openQuestions: [] }, { date: '2026-07-08' });

    expect(markdown).toContain('No locks — writer cedes broadly');
    expect(markdown).toContain('Nothing delegated — writer holds all intent');
    expect(checkInterviewExport(markdown).ok).toBe(true);
  });
});
