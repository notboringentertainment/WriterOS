# Shared Memory Contract (Addendum B) Implementation Plan — Rev 5.1 (Codex correction pass)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement PRD Addendum B — atomic idempotent shared-memory initialization, race-safe origin-sectioned `story_locks` writes, transactional Meeting banking against a durable canonical Meeting record, turn-boundary invariant enforcement, client failure surfacing, and real-database verification — so every project the room touches has all four shared blocks present, attached to all seven agents, and internally consistent before any agent turn.

**Architecture:** The **canonical Meeting record is `interview_sessions`** (verbatim `seed_text` up to 20,000 chars, append-only `answers` transcript, adopted proposals, and an immutable per-session `bank_snapshot`) — the shared `concept_seed` and `open_questions` blocks become **deterministic bounded projections** of that record, never the sole copy. Two Postgres functions carry the atomicity: `ensure_project_memory` (blocks + 28 attachments + blank-row repair, one transaction) and `bank_meeting_memory` (session-row-locked bank of all three meeting-owned writes + bank snapshot + state transition, one transaction, retry-safe). The `concept_seed` row's monotonic `revision` is also the project-wide Meeting-bank CAS token: two different sessions cannot both commit projections computed from the same prior history; the loser re-reads the canonical record and recomputes. `story_locks` concurrent writers use value compare-and-swap with the same bounded retry discipline, so neither writer can overwrite the opposite section from stale data. Final invariant checks run inside both model paths immediately before model execution, covering scheduler ticks and future internal producers that bypass routes.

**Tech Stack:** TypeScript, Express, Supabase (Postgres + supabase-js), Vitest, React Testing Library (already in devDependencies). Test seams: `__setRoomDbForTests` fake-chain, `vi.mock` route tests over a live express server, migration-content tests, env-gated real-database integration tests.

## Global Constraints

- Spec is **PRD Addendum B** (`docs/product/writers-room-runtime-prd.md`, PR #63 head `1ecd503`), as corrected by Task 1 of this plan. Task 1's PRD corrections are a **prerequisite** — this plan deliberately does not silently contradict the normative doc.
- Sentinel values verbatim from B1 (`story_locks` sentinel is the canonical two-section value with `None declared.` in both sections; headers `## Surface-declared locks` / `## Meeting locks`).
- Roster is exactly 7 agents and binds to **runtime persona ids**: `MORGAN_ID` (`'writingPartner'`, `server/room/wakeRules.ts:6` — Morgan is a display alias, `shared/personas.ts:1-5`) + `CALLABLE_SPECIALIST_IDS` (`shared/personas.ts`). Attachment matching is exact-id; using the display name `'morgan'` would attach blocks to an id no runtime path ever reads. 7 × 4 = 28 attachments.
- Origin markers are the full A8 set: `[SEED]`, `[EXTRAPOLATED]`, `[INVENTED]` — legacy classification and any origin-tag rendering must handle all three.
- Canonical record is **verbatim**: seed and answers are persisted raw (length validation runs on the raw value — raw length governs; trimmed copies are used only for empty-string checks; trimming before persistence is a bug this plan fixes).
- The two lock section headers (`## Surface-declared locks`, `## Meeting locks`) are **reserved lines**: parsing matches them only as exact physical lines, duplicate/partial canonical structure is invalid, and writer-supplied content containing a reserved header line is rejected (surface sync → 422 `invalid`) or removed line-by-line (Meeting answer-derived content) before merge. Malformed canonical values fail loudly; they are never adopted as sectionless legacy text.
- The **applied mutability classification**, exact current-round open/delegated question entries, and any pre-contract open-question units adopted on the first post-contract bank are part of the canonical Meeting record: `bank_meeting_memory` persists them in immutable `interview_sessions.bank_snapshot` JSONB in the same transaction as the block writes. Export, retry, and later projections read that snapshot — never defaults or a previously bounded block.
- B5 failure copy: HTTP 503, message `Room memory unavailable.`
- Caps: `concept_seed` 4,000; `story_locks`/`open_questions`/`project_state` 2,000. Cap policy by block: `concept_seed` and `open_questions` are **bounded projections** (explicit omission markers, never blind truncation); `story_locks` is **enforced content** — it is never silently truncated; an over-cap merge fails the bank with a visible, actionable validation error. Valid seed input (up to 20,000 chars, `MAX_INTERVIEW_TEXT_LENGTH`, `server/room/interview/runtime.ts:58`) can never fail a bank on cap grounds.
- Two additive schema changes: nullable `interview_sessions.bank_snapshot jsonb` for immutable bank-time decisions, and `memory_blocks.revision bigint NOT NULL DEFAULT 0` for optimistic concurrency. Existing rows remain readable and use legacy projection fallback. `memory_blocks` already has `unique nulls not distinct (project_id, agent_id, label)`; `block_attachments` PK `(block_id, agent_id)`.
- New SQL functions are service-role-only (`revoke … from public, anon, authenticated; grant … to service_role`).
- Fresh branch from `main`: `feat/shared-memory-contract`. Do NOT branch from `docs/memory-contract-addendum`.
- Per-task tests via `npx vitest run <file>`; full gates `npm run test:run` + `npm run check`.
- Rollout order is **database first** (Tasks 12–13): migration applied and smoke-tested against Supabase before server/client code deploys. CodeRabbit review must reach COMPLETED before merge. Migration SQL is human/AI-reviewed BEFORE it is applied to the shared dev database (Task 12 Step 0 gate) — once applied, any correction ships as a NEW forward migration, never an edit to the applied one.
- **Forward-compatibility boundary:** the canonical Meeting record must be able to represent future *generated* questions (exact question text, exact answer text, persona/asker, domain, sequence, provenance, timestamp) — but NO adaptive question generation, ranking, or Meeting UI work happens in this plan (see Non-Goals).

---

### Task 0: Branch setup

**Files:** none (git only)

- [ ] **Step 1: Create branch from main**

```bash
cd ~/Projects/WriterOS
git checkout main && git pull
git checkout -b feat/shared-memory-contract
```

Expected: `Switched to a new branch 'feat/shared-memory-contract'`

---

### Task 1: PRD corrections (prerequisite — normative doc must match what we build)

**Files:**
- Modify: `docs/product/writers-room-runtime-prd.md` (§4.1, §10, A8, A9, and Addendum B sections B1–B6)

**Why:** Addendum B currently describes `concept_seed` as the banked concept doc itself ("Append-only, dated rounds, never edited in place") with a 4,000 cap, while seed intake accepts 20,000 chars — the block cannot be the canonical record. B6 says existing blocks are "preserved verbatim", which conflicts with blank-row repair. Neither may be contradicted silently.

- [x] **Step 1: Amend the B1 block table row for `concept_seed`**

Change the `concept_seed` row's Content/Update rule from append-only banked doc to:

```
| `concept_seed` | 4,000 | Project Meeting bank only | Deterministic bounded projection of the canonical Meeting record (interview_sessions); regenerated at each bank, newest rounds first (§A9 history lives in the record, not the block) | `No concept seed banked yet. Offer the Project Meeting.` |
```

And add after the B1 table (before the voice_profile paragraph):

```markdown
**Canonical Meeting record:** the durable, project-scoped source of truth for
the Meeting is `interview_sessions` — verbatim `seed_text` (up to 20,000
chars), the append-only `answers` transcript, adopted proposals, and an
immutable per-session `bank_snapshot`. The snapshot records applied mutability
classifications, exact current-round open/delegated question entries, and any
pre-contract open-question units adopted once by the first post-contract bank,
in the same transaction that banks the round. Shared blocks are bounded
agent-facing working context projected from that record; no block is ever the sole copy of
Meeting data. Transcript entries carry exact question text, exact answer text,
asker persona, domain, sequence, provenance, and timestamp, so future generated
(non-bank) questions fit the same record.
```

- [x] **Step 2: Amend B4/B6 for blank-row repair**

In B4, after "upsert the four per-project blocks with sentinels (existing rows untouched)", change to:

```markdown
upsert the four per-project blocks with sentinels (existing non-blank rows
untouched; rows whose value is blank/whitespace-only are normalized to the
sentinel — a blank row is a broken write, not writer content)
```

In B6, change "existing blocks are preserved verbatim" to "existing non-blank blocks are preserved verbatim; blank/whitespace-only values normalize to the sentinel".

- [x] **Step 3: Reconcile §10, A8, and A9 (not only Addendum B)**

§10 (Shared Block Governance) currently reads "Only Morgan (and the writer) writes shared blocks." Append a cross-reference so it cannot contradict the ownership table:

```markdown
Ownership per block is normative in Addendum B1: the Meeting bank and the
structured-surface lock sync write as the writer; Morgan writes
`project_state` (digest) and, later, an `open_questions` synthesis section.
```

A9 (Banking Rules) says "Banking writes `concept_seed` (append)" and "Append-only: banked rounds are never edited in place." Amend to:

```markdown
Banking regenerates the `concept_seed` block as a bounded projection of the
canonical Meeting record (Addendum B1); append-only applies to the record
(sessions and transcripts are never edited in place), not to the block text.
Empty Locks / Open-questions sections in the readback UX keep their explicit
lines; the `story_locks` block itself uses the B3 canonical sections with
`None declared.`. "Showing exactly what will be written" means the FINAL
merged/projected block values (cross-session projection, cumulative lock
merge), computed by the same code path the bank uses. If a surface lock edit
lands between preview and commit, the lock sections re-merge at bank time. If
another Meeting session banks first, a project-wide bank-revision CAS rejects
the stale projection and the losing request re-reads the canonical record and
recomputes all three block values. Those are the only permitted concurrent
changes between preview and commit; neither path may lose prior content.
```

A8 provenance: note under B6 that legacy classification recognizes all three origin markers (`[SEED]`, `[EXTRAPOLATED]`, `[INVENTED]`).

Also add one sentence under the B2 matrix: column headers are display aliases; attachment rows bind to runtime persona ids (`writingPartner` for Morgan — `wakeRules.ts:6`).

Replace A8's claim that mutability lives only in shared-block text with the
canonical rule: applied classifications are stored in the session's immutable
`bank_snapshot`; `story_locks`, `open_questions`, and the `concept_seed`
leanings are projections of that stored decision.

- [x] **Step 3b: Fix the `concept_seed` descriptions in §4.1 and §10**

PRD §4.1 block table row (PRD line ~71): change the `concept_seed` description `| concept_seed | Banked concept doc / seed (never silently edited)| 4,000 |` to:

```
Bounded projection of the canonical Meeting record (regenerated at each bank; history lives in interview_sessions)
```

PRD §10 bullet (PRD line ~260): change "`concept_seed` is banked: appended by new interview rounds, never edited in place." to:

```markdown
`concept_seed` is regenerated at each bank as a bounded projection of the
canonical Meeting record; append-only applies to the record
(sessions/transcripts), not the block text.
```

- [x] **Step 3c: Amend B1/A9 with the two new normative semantics this plan implements**

Add to Addendum B1/A9:

```markdown
- Applied mutability classifications are persisted into the canonical Meeting
  record's immutable per-session `bank_snapshot` at bank time (same
  transaction); export and idempotent retries read the stored classifications,
  never defaults.
- `open_questions` update rule: the bank regenerates the block as a bounded
  projection of unresolved delegated/open entries across ALL terminal Meeting
  records (`banked` and `exported`), not only the current round. Both
  skipped/delegated transcript entries and adopted proposals classified `open`
  are included. The first post-contract bank adopts pre-contract block-only
  question units into its immutable snapshot before bounding, so projection
  overflow cannot erase them. Resolution semantics remain future
  Morgan-synthesis scope.
```

Add to B3: the reserved-header-lines rule — the two lock section headers
(`## Surface-declared locks`, `## Meeting locks`) are reserved full lines;
duplicate or partial canonical structure makes a value invalid, and
writer-supplied content containing a reserved header line is rejected (surface
sync → 422 `invalid`) or removed physical-line-by-physical-line (Meeting
answer-derived content) before merge. Malformed canonical values fail loudly;
they are not reclassified as legacy text.

In §4.1 replace the blanket overflow sentence with the per-block contract:
bounded projections use explicit omission markers; enforced `story_locks`
writes fail visibly when over cap and are never silently truncated; no overflow
path may crash an agent turn.

- [x] **Step 4: Add atomicity + turn-boundary sentences to B3/B4**

Append to B3's bullet list:

```markdown
- Section writes MUST be race-safe: a writer may not overwrite the opposite
  section from stale data. Compare-and-swap (write conditioned on the value
  read) with bounded retry, or equivalent database-side locking, is required.
```

Append to B4 (after the entry-point paragraph):

```markdown
Route guards are the early gate, not the only gate: the agent runtime MUST
re-verify the full contract (four blocks, 28 attachments) immediately before
prompt/model execution and MUST NOT run a turn when verification fails —
this covers queued events, scheduler ticks, and future internal callers.
```

Also add the project-wide bank serialization rule:

```markdown
Every Meeting bank MUST compare-and-swap a monotonic project bank revision in
the same transaction as its block writes and session transition. Two distinct
sessions computed from the same prior revision cannot both commit: the loser
MUST re-read terminal Meeting records and recompute. Locking only the current
session is insufficient because different sessions write the same projections.
```

- [ ] **Step 5: Commit**

```bash
git add docs/product/writers-room-runtime-prd.md
git commit -m "docs: Addendum B corrections — canonical Meeting record, blank repair, write atomicity, turn-boundary guard, §10/A8/A9 reconciliation"
```

**Gate:** show this diff to Ben for sign-off before starting Task 2 (it amends a normative doc).

---

### Task 2: `lockSections` module (B3 format, B6 adoption, round-merge for Meeting locks)

**Files:**
- Create: `server/room/lockSections.ts`
- Test: `tests/server/room/lockSections.test.ts`

**Interfaces:**
- Produces (consumed by Tasks 4, 7, 8):

```typescript
export const SURFACE_HEADER = '## Surface-declared locks';
export const MEETING_HEADER = '## Meeting locks';
export const NONE_DECLARED = 'None declared.';
export type LockSections = { surface: string; meeting: string };
export class InvalidLockSectionsError extends Error {}
export function renderLockSections(sections: LockSections): string;
export function parseLockSections(value: string): LockSections | null; // null = sectionless legacy; malformed canonical values throw
export function containsReservedLockHeader(text: string): boolean; // any line exactly a reserved header
export function classifyLegacyLocks(value: string): 'meeting' | 'surface';
export function adoptLegacyLocks(value: string): LockSections;
// Replace ONLY the named section (adopting legacy current first).
export function mergeLockSection(current: string, origin: 'surface' | 'meeting', body: string): string;
// Round-safe Meeting merge: union of existing meeting lines + new lines,
// exact-line dedupe, existing lines preserved when newLines is empty.
export function mergeMeetingLocks(current: string, newLines: string[]): string;
```

- [ ] **Step 1: Write the failing tests**

Create `tests/server/room/lockSections.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  InvalidLockSectionsError,
  MEETING_HEADER,
  NONE_DECLARED,
  SURFACE_HEADER,
  adoptLegacyLocks,
  classifyLegacyLocks,
  containsReservedLockHeader,
  mergeLockSection,
  mergeMeetingLocks,
  parseLockSections,
  renderLockSections,
} from '../../../server/room/lockSections';

const SENTINEL = renderLockSections({ surface: NONE_DECLARED, meeting: NONE_DECLARED });

describe('renderLockSections / parseLockSections', () => {
  it('round-trips the canonical two-section value', () => {
    const rendered = renderLockSections({ surface: '- No resurrections', meeting: '[SEED] Ending is fixed' });
    expect(rendered).toBe(`${SURFACE_HEADER}\n- No resurrections\n\n${MEETING_HEADER}\n[SEED] Ending is fixed`);
    expect(parseLockSections(rendered)).toEqual({ surface: '- No resurrections', meeting: '[SEED] Ending is fixed' });
  });

  it('parses the sentinel as two empty-meaning sections', () => {
    expect(parseLockSections(SENTINEL)).toEqual({ surface: NONE_DECLARED, meeting: NONE_DECLARED });
  });

  it('returns null for sectionless legacy values', () => {
    expect(parseLockSections('- Ace lives')).toBeNull();
    expect(parseLockSections('')).toBeNull();
  });

  it('does not split on header text embedded inside a larger line', () => {
    const rendered = renderLockSections({ surface: '- Ace lives\n## Meeting locks is a phrase in the bible', meeting: '[SEED] fixed' });
    expect(parseLockSections(rendered)).toEqual({
      surface: '- Ace lives\n## Meeting locks is a phrase in the bible',
      meeting: '[SEED] fixed',
    });
  });

  it('fails loudly when a header appears more than once', () => {
    const dup = `${SURFACE_HEADER}\n- Ace lives\n${MEETING_HEADER}\n[SEED] a\n${MEETING_HEADER}\n[SEED] b`;
    expect(() => parseLockSections(dup)).toThrow(InvalidLockSectionsError);
  });

  it('fails loudly on partial canonical structure instead of adopting it as legacy', () => {
    expect(() => parseLockSections(`${SURFACE_HEADER}\n- Ace lives`)).toThrow(InvalidLockSectionsError);
  });
});

describe('containsReservedLockHeader', () => {
  it('true when any line is exactly a reserved header', () => {
    expect(containsReservedLockHeader(`some text\n${MEETING_HEADER}\nmore`)).toBe(true);
    expect(containsReservedLockHeader(SURFACE_HEADER)).toBe(true);
  });

  it('false when the header only appears as a substring of a line', () => {
    expect(containsReservedLockHeader('the ## Meeting locks reference in prose')).toBe(false);
    expect(containsReservedLockHeader('- Ace lives')).toBe(false);
  });
});

describe('classifyLegacyLocks / adoptLegacyLocks (B6)', () => {
  it('classifies [SEED]/[EXTRAPOLATED]/[INVENTED] values as meeting-origin (full A8 set)', () => {
    expect(classifyLegacyLocks('[SEED] Interview answer, 2026-07-01: ending fixed')).toBe('meeting');
    expect(classifyLegacyLocks('[EXTRAPOLATED] tone locked')).toBe('meeting');
    expect(classifyLegacyLocks('[INVENTED] the lighthouse is sentient')).toBe('meeting');
  });

  it('classifies everything else as surface-origin', () => {
    expect(classifyLegacyLocks('- Ace lives\n- Tone stays noir')).toBe('surface');
  });

  it('adopts by origin, other section starts None declared.', () => {
    expect(adoptLegacyLocks('[SEED] ending fixed')).toEqual({ surface: NONE_DECLARED, meeting: '[SEED] ending fixed' });
    expect(adoptLegacyLocks('- Ace lives')).toEqual({ surface: '- Ace lives', meeting: NONE_DECLARED });
  });

  it('treats blank and legacy empty-bank prose as fully empty, not writer locks', () => {
    for (const legacyEmpty of ['', '   ', 'No locks — writer cedes broadly', 'No locks — writer cedes broadly.']) {
      expect(adoptLegacyLocks(legacyEmpty)).toEqual({ surface: NONE_DECLARED, meeting: NONE_DECLARED });
    }
  });

  it('adoption is idempotent: adopting an already-adopted value changes nothing', () => {
    const once = renderLockSections(adoptLegacyLocks('[SEED] ending fixed'));
    expect(mergeLockSection(once, 'surface', NONE_DECLARED)).toBe(once);
  });
});

describe('mergeLockSection (B3 clobber prevention)', () => {
  it('surface write rewrites only the surface section', () => {
    const current = renderLockSections({ surface: 'old surface', meeting: '[SEED] keep me' });
    expect(parseLockSections(mergeLockSection(current, 'surface', '- new lock'))).toEqual({
      surface: '- new lock',
      meeting: '[SEED] keep me',
    });
  });

  it('meeting write rewrites only the meeting section', () => {
    const current = renderLockSections({ surface: '- keep me too', meeting: '[SEED] old' });
    expect(parseLockSections(mergeLockSection(current, 'meeting', '[SEED] new'))).toEqual({
      surface: '- keep me too',
      meeting: '[SEED] new',
    });
  });

  it('legacy [SEED] locks survive the first post-contract surface write (B7 regression)', () => {
    const legacy = '[SEED] Interview answer, 2026-07-01: the ending is fixed';
    expect(parseLockSections(mergeLockSection(legacy, 'surface', '- bible lock'))).toEqual({
      surface: '- bible lock',
      meeting: legacy,
    });
  });

  it('empty body writes None declared., never an empty section', () => {
    expect(parseLockSections(mergeLockSection(SENTINEL, 'surface', '  '))).toEqual({
      surface: NONE_DECLARED,
      meeting: NONE_DECLARED,
    });
  });
});

describe('mergeMeetingLocks (round preservation)', () => {
  const round1 = renderLockSections({ surface: '- Ace lives', meeting: '[SEED] ending fixed' });

  it('appends new meeting locks to existing ones', () => {
    const merged = mergeMeetingLocks(round1, ['[EXTRAPOLATED] tone locked']);
    expect(parseLockSections(merged)).toEqual({
      surface: '- Ace lives',
      meeting: '[SEED] ending fixed\n[EXTRAPOLATED] tone locked',
    });
  });

  it('banking with no new locks preserves the existing Meeting section', () => {
    expect(mergeMeetingLocks(round1, [])).toBe(round1);
  });

  it('exact duplicate locks do not multiply', () => {
    const merged = mergeMeetingLocks(round1, ['[SEED] ending fixed', '[SEED] ending fixed']);
    expect(parseLockSections(merged)!.meeting).toBe('[SEED] ending fixed');
  });

  it('replaces None declared. instead of appending under it', () => {
    const merged = mergeMeetingLocks(SENTINEL, ['[SEED] first lock']);
    expect(parseLockSections(merged)).toEqual({ surface: NONE_DECLARED, meeting: '[SEED] first lock' });
  });

  it('adopts legacy values before merging', () => {
    const merged = mergeMeetingLocks('- Ace lives', ['[SEED] new']);
    expect(parseLockSections(merged)).toEqual({ surface: '- Ace lives', meeting: '[SEED] new' });
  });

  it('strips answer-derived lines that are exactly a reserved header before merging', () => {
    const merged = mergeMeetingLocks(round1, [MEETING_HEADER, SURFACE_HEADER, '[SEED] real lock']);
    expect(parseLockSections(merged)).toEqual({
      surface: '- Ace lives',
      meeting: '[SEED] ending fixed\n[SEED] real lock',
    });
  });

  it('strips reserved physical lines embedded inside multiline Meeting content', () => {
    const merged = mergeMeetingLocks(round1, [`[SEED] first line\n${MEETING_HEADER}\nsecond line`]);
    expect(parseLockSections(merged)!.meeting).toBe('[SEED] ending fixed\n[SEED] first line\nsecond line');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/server/room/lockSections.test.ts`
Expected: FAIL — `Cannot find module '../../../server/room/lockSections'`

- [ ] **Step 3: Write the implementation**

Create `server/room/lockSections.ts`:

```typescript
// Addendum B3/B6: the story_locks block is a canonical two-section value.
// Both sections are binding for enforcement; each writer may rewrite ONLY its
// own section. Legacy (sectionless, pre-contract) values are adopted at write
// time by whichever section writer touches the block first — the initializer
// preserves existing non-blank values verbatim (B6).
//
// Meeting locks are round-cumulative: each bank UNIONS its new lock lines into
// the section (exact-line dedupe). Existing Meeting locks stay active until an
// explicit future withdrawal/supersession workflow — out of scope here.

export const SURFACE_HEADER = '## Surface-declared locks';
export const MEETING_HEADER = '## Meeting locks';
export const NONE_DECLARED = 'None declared.';

export type LockSections = { surface: string; meeting: string };

export class InvalidLockSectionsError extends Error {
  constructor() {
    super('story_locks contains malformed reserved section headers');
    this.name = 'InvalidLockSectionsError';
  }
}

const LEGACY_EMPTY_VALUES = new Set(['No locks — writer cedes broadly', 'No locks — writer cedes broadly.']);

export function renderLockSections(sections: LockSections): string {
  return `${SURFACE_HEADER}\n${sections.surface}\n\n${MEETING_HEADER}\n${sections.meeting}`;
}

// Reserved headers are matched ONLY as exact full lines at line start — never
// as substrings of writer content. More than one occurrence of either header
// makes the value invalid (parse returns null → legacy-adopt/repair per B6,
// same as any malformed value).
export function containsReservedLockHeader(text: string): boolean {
  return text.split(/\r?\n/).some((line) => line === SURFACE_HEADER || line === MEETING_HEADER);
}

export function parseLockSections(value: string): LockSections | null {
  const lines = value.split(/\r?\n/);
  const surfaceIdxs = lines.flatMap((line, i) => (line === SURFACE_HEADER ? [i] : []));
  const meetingIdxs = lines.flatMap((line, i) => (line === MEETING_HEADER ? [i] : []));
  // No reserved lines means sectionless legacy input. Any partial, duplicate,
  // or out-of-order canonical structure is malformed and must fail loudly —
  // never feed it through legacy adoption and silently change ownership.
  if (surfaceIdxs.length === 0 && meetingIdxs.length === 0) return null;
  if (surfaceIdxs.length !== 1 || meetingIdxs.length !== 1) throw new InvalidLockSectionsError();
  const surfaceAt = surfaceIdxs[0];
  const meetingAt = meetingIdxs[0];
  if (surfaceAt !== 0 || meetingAt <= surfaceAt) throw new InvalidLockSectionsError();
  const surface = lines.slice(surfaceAt + 1, meetingAt).join('\n').trim();
  const meeting = lines.slice(meetingAt + 1).join('\n').trim();
  return { surface: surface || NONE_DECLARED, meeting: meeting || NONE_DECLARED };
}

export function classifyLegacyLocks(value: string): 'meeting' | 'surface' {
  // Full A8 origin-marker set — meeting-origin lock lines can carry any of the three.
  return /\[SEED\]|\[EXTRAPOLATED\]|\[INVENTED\]/.test(value) ? 'meeting' : 'surface';
}

export function adoptLegacyLocks(value: string): LockSections {
  const trimmed = value.trim();
  if (!trimmed || LEGACY_EMPTY_VALUES.has(trimmed)) {
    return { surface: NONE_DECLARED, meeting: NONE_DECLARED };
  }
  return classifyLegacyLocks(trimmed) === 'meeting'
    ? { surface: NONE_DECLARED, meeting: trimmed }
    : { surface: trimmed, meeting: NONE_DECLARED };
}

function sectionsOf(current: string): LockSections {
  return parseLockSections(current) ?? adoptLegacyLocks(current);
}

export function mergeLockSection(current: string, origin: 'surface' | 'meeting', body: string): string {
  const sections = sectionsOf(current);
  if (containsReservedLockHeader(body)) throw new InvalidLockSectionsError();
  const nextBody = body.trim() || NONE_DECLARED;
  return renderLockSections(origin === 'surface' ? { ...sections, surface: nextBody } : { ...sections, meeting: nextBody });
}

export function mergeMeetingLocks(current: string, newLines: string[]): string {
  const sections = sectionsOf(current);
  const existing = sections.meeting === NONE_DECLARED ? [] : sections.meeting.split('\n');
  const seen = new Set(existing.map((l) => l.trim()));
  const additions = newLines
    // Sanitize PHYSICAL lines, not only array entries: a proposal value may be
    // multiline and hide a reserved header between ordinary lines.
    .flatMap((entry) => entry.split(/\r?\n/))
    .map((line) => line.trim())
    .filter((l) => l && l !== SURFACE_HEADER && l !== MEETING_HEADER && !seen.has(l) && (seen.add(l), true));
  const merged = [...existing, ...additions];
  return renderLockSections({ ...sections, meeting: merged.length ? merged.join('\n') : NONE_DECLARED });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/server/room/lockSections.test.ts`
Expected: PASS (22 tests)

- [ ] **Step 5: Commit**

```bash
git add server/room/lockSections.ts tests/server/room/lockSections.test.ts
git commit -m "feat: story_locks two-section format, legacy adoption, round-safe meeting merge (Addendum B3/B6)"
```

---

### Task 3: Migration — `ensure_project_memory` + `bank_meeting_memory` (content test)

**Files:**
- Create: `supabase/migrations/20260712000001_shared_memory_contract_fns.sql`
- Test: `tests/server/room/sharedMemoryContractMigration.test.ts`

**Interfaces:**
- Produces two SQL functions (called from Tasks 4 and 7):
  - `ensure_project_memory(p_project_id text, p_agent_ids text[], p_blocks jsonb) returns void` — `p_blocks` = JSON array of `{label, cap, sentinel}`. Creates missing blocks with sentinels, normalizes blank/whitespace-only values to sentinels, inserts missing attachments. Never touches non-blank existing content.
  - additive `interview_sessions.bank_snapshot jsonb` — nullable for legacy rows; immutable once a session is banked.
  - additive `memory_blocks.revision bigint NOT NULL DEFAULT 0` — the `concept_seed` row's revision is the project-wide Meeting-bank generation token.
  - `bank_meeting_memory(p_project_id text, p_session_id uuid, p_bank_revision bigint, p_concept_seed text, p_locks_expected text, p_locks_next text, p_open_questions text, p_bank_snapshot jsonb) returns text` — one transaction: locks the session row, guards state, validates the snapshot shape, CAS-increments the project bank revision, CAS-updates `story_locks`, replaces `concept_seed` + `open_questions`, persists the immutable bank snapshot, and transitions the session to `banked`. Returns `'banked'` or `'already_banked'` (idempotent retry). Raises `projection_conflict`, `locks_conflict`, `session_not_found`, `invalid_state:<s>`, `invalid_bank_snapshot`, `memory_not_initialized`, or `cap_exceeded:<label>`.

Postgres cannot run in Vitest — the content test locks the load-bearing clauses; **real execution is covered by Task 12 (integration) and Task 13 (deploy smoke)**, not by this test.

- [ ] **Step 1: Write the failing test**

Create `tests/server/room/sharedMemoryContractMigration.test.ts`:

```typescript
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260712000001_shared_memory_contract_fns.sql'),
  'utf8',
);

describe('shared memory contract migration', () => {
  it('defines ensure_project_memory with the contracted signature', () => {
    expect(migration).toMatch(
      /create or replace function ensure_project_memory\(\s*p_project_id text,\s*p_agent_ids text\[\],\s*p_blocks jsonb\s*\)/,
    );
  });

  it('creates blocks idempotently and repairs blank rows without touching non-blank content', () => {
    expect(migration).toMatch(/on conflict \(project_id, agent_id, label\) do nothing/);
    expect(migration).toMatch(/mb\.value ~ '\^\\s\*\$'/); // regex ^\s*$ — matches JS .trim() blank set exactly
  });

  it('repairs char_cap drift without touching values', () => {
    expect(migration).toMatch(/set char_cap = b\.cap/);
    expect(migration).toMatch(/mb\.char_cap <> b\.cap/);
  });

  it('detects preserved over-cap values and warns without truncating', () => {
    expect(migration).toMatch(/length\(mb\.value\) > b\.cap/);
    expect(migration).toMatch(/raise warning 'memory_over_cap/);
  });

  it('inserts attachments idempotently for roster x blocks', () => {
    expect(migration).toContain('insert into block_attachments');
    expect(migration).toMatch(/on conflict \(block_id, agent_id\) do nothing/);
    expect(migration).toContain('unnest(p_agent_ids)');
  });

  it('defines bank_meeting_memory with session row lock, state guard, and locks CAS', () => {
    expect(migration).toMatch(/create or replace function bank_meeting_memory\(/);
    expect(migration).toContain('for update');
    expect(migration).toContain("return 'already_banked'");
    expect(migration).toMatch(/value = p_locks_expected/); // compare-and-swap predicate
    expect(migration).toContain("raise exception 'locks_conflict'");
    expect(migration).toMatch(/cap_exceeded/);
  });

  it('serializes different-session banks with a monotonic project revision CAS', () => {
    expect(migration).toMatch(/alter table memory_blocks\s+add column if not exists revision bigint not null default 0/);
    expect(migration).toMatch(/p_bank_revision bigint/);
    expect(migration).toMatch(/revision = revision \+ 1/);
    expect(migration).toMatch(/revision = p_bank_revision/);
    expect(migration).toContain("raise exception 'projection_conflict'");
  });

  it('adds and transactionally persists the immutable session bank snapshot', () => {
    expect(migration).toMatch(/alter table interview_sessions add column if not exists bank_snapshot jsonb/);
    expect(migration).toMatch(/p_bank_snapshot jsonb/);
    expect(migration).toMatch(/invalid_bank_snapshot/);
    // Missing JSON keys produce SQL NULL. `IS DISTINCT FROM` is required so
    // absent/wrong-shaped members fail validation instead of slipping through.
    expect(migration).toMatch(/jsonb_typeof\(p_bank_snapshot->'applied_classifications'\) is distinct from 'object'/);
    expect(migration).toMatch(/jsonb_typeof\(p_bank_snapshot->'open_questions'\) is distinct from 'array'/);
    expect(migration).toMatch(/jsonb_typeof\(p_bank_snapshot->'legacy_open_questions'\) is distinct from 'array'/);
    expect(migration).toMatch(/bank_snapshot = p_bank_snapshot/);
  });

  it('both functions are service-role only', () => {
    expect(migration).toMatch(/revoke execute on function ensure_project_memory.* from public, anon, authenticated/i);
    expect(migration).toMatch(/revoke execute on function bank_meeting_memory.* from public, anon, authenticated/i);
    expect(migration).toMatch(/grant execute on function ensure_project_memory.* to service_role/i);
    expect(migration).toMatch(/grant execute on function bank_meeting_memory.* to service_role/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/server/room/sharedMemoryContractMigration.test.ts`
Expected: FAIL — `ENOENT … 20260712000001_shared_memory_contract_fns.sql`

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260712000001_shared_memory_contract_fns.sql`:

```sql
-- Addendum B4: atomic, idempotent shared-memory initializer, plus the
-- transactional Meeting bank. Server-only (see 20260708000003): callable by
-- the service-role server, never by anon/authenticated clients. Sentinels,
-- caps, and the roster are passed in so the contract's source of truth stays
-- in TypeScript (server/room/memoryContract.ts).

alter table interview_sessions
  add column if not exists bank_snapshot jsonb;

alter table memory_blocks
  add column if not exists revision bigint not null default 0;

comment on column interview_sessions.bank_snapshot is
  'Immutable bank-time decisions, exact current-round open/delegated questions, and first-bank legacy question adoption.';

create or replace function ensure_project_memory(
  p_project_id text,
  p_agent_ids text[],
  p_blocks jsonb
)
returns void
language plpgsql
as $$
begin
  -- Missing rows get sentinels; existing rows are untouched here.
  insert into memory_blocks (project_id, agent_id, label, value, char_cap, updated_by)
  select p_project_id, null, b->>'label', b->>'sentinel', (b->>'cap')::int, 'system'
  from jsonb_array_elements(p_blocks) as b
  on conflict (project_id, agent_id, label) do nothing;

  -- Blank/whitespace-only rows are broken writes, not writer content:
  -- normalize them to the sentinel. Use the regex `^\s*$` so SQL classifies the
  -- SAME strings blank as JS `.trim()` — a btrim character set diverges (`\f`,
  -- `\v`, NBSP, etc.) and any mismatch drives a fail-closed repair loop where
  -- one layer keeps repairing what the other reads as content. Non-blank
  -- content is never modified.
  update memory_blocks mb
  set value = b.sentinel, updated_by = 'system', updated_at = now()
  from (select x->>'label' as label, x->>'sentinel' as sentinel from jsonb_array_elements(p_blocks) as x) b
  where mb.project_id = p_project_id
    and mb.agent_id is null
    and mb.label = b.label
    and mb.value ~ '^\s*$';

  -- Cap drift: a row carrying the wrong char_cap is not a healthy contract
  -- state. Repair the cap; never touch the value here.
  update memory_blocks mb
  set char_cap = b.cap, updated_at = now()
  from (select x->>'label' as label, (x->>'cap')::int as cap from jsonb_array_elements(p_blocks) as x) b
  where mb.project_id = p_project_id
    and mb.agent_id is null
    and mb.label = b.label
    and mb.char_cap <> b.cap;

  -- Over-cap detection: a preserved (non-blank) value longer than its contract
  -- cap is a broken contract state, but the value is REAL writer content — never
  -- truncate it here. Surface it loudly so the caller (readContractComplete,
  -- Task 4 — see E5) can fail closed. `raise warning` emits a diagnostic row per
  -- offending block without aborting the initialization transaction.
  declare
    v_over record;
  begin
    for v_over in
      select mb.label, length(mb.value) as len, b.cap
      from memory_blocks mb
      join (select x->>'label' as label, (x->>'cap')::int as cap from jsonb_array_elements(p_blocks) as x) b
        on b.label = mb.label
      where mb.project_id = p_project_id
        and mb.agent_id is null
        and mb.value !~ '^\s*$'
        and length(mb.value) > b.cap
    loop
      raise warning 'memory_over_cap:% length=% cap=%', v_over.label, v_over.len, v_over.cap;
    end loop;
  end;

  insert into block_attachments (block_id, agent_id)
  select mb.id, a.agent_id
  from memory_blocks mb
  cross join unnest(p_agent_ids) as a(agent_id)
  where mb.project_id = p_project_id
    and mb.agent_id is null
    and mb.label in (select b->>'label' from jsonb_array_elements(p_blocks) as b)
  on conflict (block_id, agent_id) do nothing;
end;
$$;

-- One transaction for everything a bank owns: story_locks (CAS against the
-- value the server read, so a concurrent surface sync cannot be clobbered),
-- concept_seed projection, open_questions, and the session state transition.
-- Retry-safe: a repeated call after success sees state 'banked'/'exported'
-- and no-ops; any raise rolls the whole bank back (session stays 'readback').
create or replace function bank_meeting_memory(
  p_project_id text,
  p_session_id uuid,
  p_bank_revision bigint,
  p_concept_seed text,
  p_locks_expected text,
  p_locks_next text,
  p_open_questions text,
  p_bank_snapshot jsonb
)
returns text
language plpgsql
as $$
declare
  v_state text;
begin
  select state into v_state
  from interview_sessions
  where id = p_session_id and project_id = p_project_id
  for update;

  if v_state is null then
    raise exception 'session_not_found';
  end if;
  if v_state in ('banked', 'exported') then
    return 'already_banked';
  end if;
  if v_state <> 'readback' then
    raise exception 'invalid_state:%', v_state;
  end if;

  if p_bank_snapshot is null
     or jsonb_typeof(p_bank_snapshot) is distinct from 'object'
     or jsonb_typeof(p_bank_snapshot->'applied_classifications') is distinct from 'object'
     or jsonb_typeof(p_bank_snapshot->'open_questions') is distinct from 'array'
     or jsonb_typeof(p_bank_snapshot->'legacy_open_questions') is distinct from 'array' then
    raise exception 'invalid_bank_snapshot';
  end if;

  if length(p_locks_next) > 2000 then raise exception 'cap_exceeded:story_locks'; end if;
  if length(p_concept_seed) > 4000 then raise exception 'cap_exceeded:concept_seed'; end if;
  if length(p_open_questions) > 2000 then raise exception 'cap_exceeded:open_questions'; end if;

  -- Project-wide bank CAS. Session-row locking alone is insufficient: two
  -- DIFFERENT readback sessions can otherwise both project the same old
  -- terminal history and the second silently overwrites the first. Every bank
  -- increments concept_seed.revision even when the rendered value is equal.
  update memory_blocks
  set revision = revision + 1
  where project_id = p_project_id and agent_id is null and label = 'concept_seed'
    and revision = p_bank_revision;
  if not found then
    raise exception 'projection_conflict';
  end if;

  update memory_blocks
  set value = p_locks_next, updated_by = 'writer', updated_at = now()
  where project_id = p_project_id and agent_id is null and label = 'story_locks'
    and value = p_locks_expected;
  if not found then
    raise exception 'locks_conflict';
  end if;

  update memory_blocks
  set value = p_concept_seed, updated_by = 'writer', updated_at = now()
  where project_id = p_project_id and agent_id is null and label = 'concept_seed';
  if not found then
    raise exception 'memory_not_initialized';
  end if;

  update memory_blocks
  set value = p_open_questions, updated_by = 'writer', updated_at = now()
  where project_id = p_project_id and agent_id is null and label = 'open_questions';
  if not found then
    raise exception 'memory_not_initialized';
  end if;

  -- Persist bank-time decisions into the canonical Meeting record IN THE SAME
  -- TRANSACTION as block writes and state transition. `bank_snapshot` contains
  -- applied_classifications, exact current-round open_questions, and any
  -- pre-contract units adopted before the bounded projection could omit them.
  -- It is immutable because this function accepts only readback sessions.
  update interview_sessions
  set state = 'banked',
      bank_snapshot = p_bank_snapshot,
      updated_at = now()
  where id = p_session_id;

  return 'banked';
end;
$$;

revoke execute on function ensure_project_memory(text, text[], jsonb) from public, anon, authenticated;
grant execute on function ensure_project_memory(text, text[], jsonb) to service_role;
revoke execute on function bank_meeting_memory(text, uuid, bigint, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function bank_meeting_memory(text, uuid, bigint, text, text, text, text, jsonb) to service_role;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/server/room/sharedMemoryContractMigration.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260712000001_shared_memory_contract_fns.sql tests/server/room/sharedMemoryContractMigration.test.ts
git commit -m "feat: shared-memory RPCs + immutable Meeting bank snapshot"
```

---

### Task 4: `memoryContract` module — constants + `ensureProjectMemory` wrapper

**Files:**
- Create: `server/room/memoryContract.ts`
- Test: `tests/server/room/memoryContract.test.ts`

**Interfaces:**
- Consumes: `renderLockSections`, `NONE_DECLARED` (Task 2); `CALLABLE_SPECIALIST_IDS` (`shared/personas.ts`); `getRoomDb`.
- Produces (consumed by Tasks 7, 9, 10):

```typescript
export const ROOM_AGENT_IDS: string[]; // 7 ids
export const SHARED_BLOCK_CONTRACT: ReadonlyArray<{ label: string; cap: number; sentinel: string }>; // 4 entries
export class RoomMemoryError extends Error {}
export async function ensureProjectMemory(projectId: string): Promise<void>; // throws RoomMemoryError
```

Fast path (SELECT-only) requires the full invariant: all four block rows exist, every value is **non-blank** (all whitespace kinds), every `char_cap` matches the contract, and all 28 roster attachments exist. Anything else runs the idempotent RPC repair — and the wrapper **re-reads the invariant after the RPC**; the repair only counts as success if the contract actually holds afterwards (fail-closed).

- [ ] **Step 1: Write the failing tests**

Create `tests/server/room/memoryContract.test.ts`:

```typescript
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { __setRoomDbForTests } from '../../../server/room/supabaseClient';
import {
  ROOM_AGENT_IDS,
  RoomMemoryError,
  SHARED_BLOCK_CONTRACT,
  ensureProjectMemory,
} from '../../../server/room/memoryContract';

afterEach(() => {
  __setRoomDbForTests(null);
  vi.restoreAllMocks();
});

type ContractRow = { label: string; value: string; char_cap: number; block_attachments: Array<{ agent_id: string }> };

// `reads` are consumed in order (fast-path read, then post-repair verify);
// the last entry repeats for any further reads.
function fakeDb(input: {
  reads: Array<ContractRow[] | null>;
  selectError?: { message: string };
  rpcError?: { message: string };
}) {
  const rpc = vi.fn(async () => ({ data: null, error: input.rpcError ?? null }));
  let call = 0;
  const chain = {
    select: () => chain,
    eq: () => chain,
    is: () => chain,
    in: async () => ({
      data: input.reads[Math.min(call++, input.reads.length - 1)],
      error: input.selectError ?? null,
    }),
  };
  const db = { from: () => chain, rpc } as unknown as SupabaseClient;
  return { db, rpc };
}

const fullAttachments = ROOM_AGENT_IDS.map((agent_id) => ({ agent_id }));
const completeRows: ContractRow[] = SHARED_BLOCK_CONTRACT.map((b) => ({
  label: b.label,
  value: b.sentinel,
  char_cap: b.cap,
  block_attachments: fullAttachments,
}));

describe('contract constants', () => {
  it('covers the seven-agent roster by RUNTIME id and four blocks (7 x 4 = 28)', () => {
    // 'writingPartner' is Morgan's runtime id (wakeRules.ts MORGAN_ID) — the
    // display name 'morgan' must never appear in the roster.
    expect(ROOM_AGENT_IDS).toEqual(['writingPartner', 'sam', 'casey', 'oliver', 'maya', 'zoe', 'alex']);
    expect(ROOM_AGENT_IDS).not.toContain('morgan');
    expect(SHARED_BLOCK_CONTRACT.map((b) => b.label)).toEqual([
      'concept_seed',
      'story_locks',
      'open_questions',
      'project_state',
    ]);
  });

  it('uses the B1 sentinels verbatim', () => {
    const byLabel = Object.fromEntries(SHARED_BLOCK_CONTRACT.map((b) => [b.label, b]));
    expect(byLabel.concept_seed.sentinel).toBe('No concept seed banked yet. Offer the Project Meeting.');
    expect(byLabel.concept_seed.cap).toBe(4000);
    expect(byLabel.story_locks.sentinel).toBe(
      '## Surface-declared locks\nNone declared.\n\n## Meeting locks\nNone declared.',
    );
    expect(byLabel.open_questions.sentinel).toBe('Nothing delegated — writer holds all intent.');
    expect(byLabel.project_state.sentinel).toBe('No project state recorded yet.');
  });
});

describe('ensureProjectMemory', () => {
  it('no-ops (SELECT-only fast path) when the full invariant already holds', async () => {
    const { db, rpc } = fakeDb({ reads: [completeRows] });
    __setRoomDbForTests(db);
    await ensureProjectMemory('p1');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('repairs when a block is missing, then verifies the invariant again', async () => {
    const { db, rpc } = fakeDb({ reads: [completeRows.slice(0, 3), completeRows] });
    __setRoomDbForTests(db);
    await ensureProjectMemory('p1');
    expect(rpc).toHaveBeenCalledWith('ensure_project_memory', {
      p_project_id: 'p1',
      p_agent_ids: ROOM_AGENT_IDS,
      p_blocks: SHARED_BLOCK_CONTRACT.map((b) => ({ label: b.label, cap: b.cap, sentinel: b.sentinel })),
    });
  });

  it('repairs blank/whitespace-only values (spaces, tabs, newlines — none count healthy)', async () => {
    const rows = completeRows.map((r, i) => (i === 0 ? { ...r, value: ' \t\n ' } : r));
    const { db, rpc } = fakeDb({ reads: [rows, completeRows] });
    __setRoomDbForTests(db);
    await ensureProjectMemory('p1');
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('repairs char_cap drift (wrong cap is not a healthy contract state)', async () => {
    const rows = completeRows.map((r, i) => (i === 0 ? { ...r, char_cap: 2000 } : r)); // concept_seed should be 4000
    const { db, rpc } = fakeDb({ reads: [rows, completeRows] });
    __setRoomDbForTests(db);
    await ensureProjectMemory('p1');
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('does NOT repair sentinel or writer-authored values (both are healthy)', async () => {
    const rows = completeRows.map((r, i) => (i === 0 ? { ...r, value: '## Round 1\nreal content' } : r));
    const { db, rpc } = fakeDb({ reads: [rows] });
    __setRoomDbForTests(db);
    await ensureProjectMemory('p1');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('repairs when any attachment is missing', async () => {
    const rows = completeRows.map((r, i) =>
      i === 1 ? { ...r, block_attachments: fullAttachments.slice(0, 6) } : r,
    );
    const { db, rpc } = fakeDb({ reads: [rows, completeRows] });
    __setRoomDbForTests(db);
    await ensureProjectMemory('p1');
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('fails CLOSED when the invariant is unreadable even after repair', async () => {
    const { db, rpc } = fakeDb({ reads: [null], selectError: { message: 'boom' } });
    __setRoomDbForTests(db);
    await expect(ensureProjectMemory('p1')).rejects.toBeInstanceOf(RoomMemoryError);
    expect(rpc).toHaveBeenCalledTimes(1); // repair was attempted
  });

  it('throws RoomMemoryError when the RPC fails', async () => {
    const { db } = fakeDb({ reads: [[]], rpcError: { message: 'db down' } });
    __setRoomDbForTests(db);
    await expect(ensureProjectMemory('p1')).rejects.toBeInstanceOf(RoomMemoryError);
  });

  it('throws RoomMemoryError when the RPC succeeds but the invariant STILL does not hold', async () => {
    const incomplete = completeRows.slice(0, 3);
    const { db, rpc } = fakeDb({ reads: [incomplete, incomplete] });
    __setRoomDbForTests(db);
    await expect(ensureProjectMemory('p1')).rejects.toThrow(/incomplete after repair/);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('fails CLOSED on a preserved over-cap value without truncating it', async () => {
    // A 2,500-char story_locks value (cap 2,000) is real writer content the RPC
    // never truncates (E4.2). readContractComplete must treat it as incomplete
    // so the wrapper throws; the value is left untouched.
    const overCap = completeRows.map((r) =>
      r.label === 'story_locks' ? { ...r, value: 's'.repeat(2500) } : r,
    );
    const { db, rpc } = fakeDb({ reads: [overCap, overCap] });
    __setRoomDbForTests(db);
    await expect(ensureProjectMemory('p1')).rejects.toBeInstanceOf(RoomMemoryError);
    expect(overCap.find((r) => r.label === 'story_locks')!.value).toHaveLength(2500); // untouched
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/server/room/memoryContract.test.ts`
Expected: FAIL — `Cannot find module '../../../server/room/memoryContract'`

- [ ] **Step 3: Write the implementation**

Create `server/room/memoryContract.ts`:

```typescript
// Addendum B: the shared-memory contract. Sentinels, caps, and the roster are
// defined here (single source of truth) and passed to the ensure_project_memory
// RPC, which creates blocks + attachments and repairs blank rows atomically (B4).

import { CALLABLE_SPECIALIST_IDS } from '../../shared/personas';
import { NONE_DECLARED, renderLockSections } from './lockSections';
import { getRoomDb } from './supabaseClient';
import { MORGAN_ID } from './wakeRules';

// RUNTIME ids, not display names: Morgan's internal id is 'writingPartner'
// (shared/personas.ts:1-5). getSharedBlocksForAgent matches agent_id exactly —
// attaching to a display alias would leave the host with no shared memory,
// which is the original bug this contract exists to kill.
export const ROOM_AGENT_IDS: string[] = [MORGAN_ID, ...CALLABLE_SPECIALIST_IDS];

export const SHARED_BLOCK_CONTRACT = [
  { label: 'concept_seed', cap: 4000, sentinel: 'No concept seed banked yet. Offer the Project Meeting.' },
  { label: 'story_locks', cap: 2000, sentinel: renderLockSections({ surface: NONE_DECLARED, meeting: NONE_DECLARED }) },
  { label: 'open_questions', cap: 2000, sentinel: 'Nothing delegated — writer holds all intent.' },
  { label: 'project_state', cap: 2000, sentinel: 'No project state recorded yet.' },
] as const;

const CONTRACT_LABELS = SHARED_BLOCK_CONTRACT.map((b) => b.label);

export class RoomMemoryError extends Error {}

type ContractRow = { label: string; value: string; char_cap: number; block_attachments: Array<{ agent_id: string }> | null };

// The invariant read: all four blocks exist, values are non-blank (JS trim
// covers tabs/newlines), char_cap matches the contract, and all 28 roster
// attachments exist. Used for the fast path AND re-verified after repair.
async function readContractComplete(projectId: string): Promise<boolean> {
  const res = await getRoomDb()
    .from('memory_blocks')
    .select('label, value, char_cap, block_attachments(agent_id)')
    .eq('project_id', projectId)
    .is('agent_id', null)
    .in('label', CONTRACT_LABELS);
  if (res.error) return false; // unreadable = not verifiably complete
  const rows = (res.data ?? []) as ContractRow[];
  return SHARED_BLOCK_CONTRACT.every((contract) => {
    const row = rows.find((r) => r.label === contract.label);
    // `.trim() === ''` is the TS blank predicate; it now matches the SQL
    // `^\s*$` predicate (E4.1) so both layers agree on what counts blank.
    if (!row || row.value.trim() === '' || row.char_cap !== contract.cap) return false;
    // Over-cap is a broken contract state too: a preserved value longer than the
    // cap is real writer content the RPC refused to truncate (E4.2). Treat the
    // contract as INCOMPLETE so ensureProjectMemory surfaces a loud, actionable
    // error — never silently truncate.
    if (row.value.length > contract.cap) return false;
    const attached = new Set((row.block_attachments ?? []).map((a) => a.agent_id));
    return ROOM_AGENT_IDS.every((agent) => attached.has(agent));
  });
}

// B4: SELECT-only fast path only when the full invariant already holds.
// Anything less runs the idempotent RPC repair — and success is defined by
// the INVARIANT holding afterwards, not by the RPC merely returning.
export async function ensureProjectMemory(projectId: string): Promise<void> {
  if (await readContractComplete(projectId)) return;

  const rpc = await getRoomDb().rpc('ensure_project_memory', {
    p_project_id: projectId,
    p_agent_ids: ROOM_AGENT_IDS,
    p_blocks: SHARED_BLOCK_CONTRACT.map((b) => ({ label: b.label, cap: b.cap, sentinel: b.sentinel })),
  });
  if (rpc.error) {
    throw new RoomMemoryError(`[room.memory] ensure_project_memory failed: ${rpc.error.message}`);
  }

  if (!(await readContractComplete(projectId))) {
    throw new RoomMemoryError(`[room.memory] contract incomplete after repair for project ${projectId}`);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/server/room/memoryContract.test.ts`
Expected: PASS (12 tests)

- [ ] **Step 5: Commit**

```bash
git add server/room/memoryContract.ts tests/server/room/memoryContract.test.ts
git commit -m "feat: ensureProjectMemory wrapper — blank-aware fast path, RPC repair (Addendum B4)"
```

---

### Task 5: Store — missing/null contract + revision read + CAS write helper

**Files:**
- Modify: `server/room/store.ts:98-109` (`getSharedBlockValue`); add `getSharedBlockSnapshot` and `casUpdateSharedBlock`
- Modify: `server/room/runRoomTurn.ts:37-42` (locksText caller)
- Test: `tests/server/room/storeSharedBlockValue.test.ts` (create)

**Interfaces:**
- Produces:

```typescript
export async function getSharedBlockValue(projectId: string, label: string): Promise<string | null>; // null = row absent
// `revision` is the optimistic-concurrency token used by Meeting banking.
export async function getSharedBlockSnapshot(
  projectId: string,
  label: string,
): Promise<{ value: string; revision: number } | null>;
// Compare-and-swap: UPDATE … WHERE value = expected. Returns false when the
// row changed since it was read (0 rows matched) — caller re-reads and retries.
export async function casUpdateSharedBlock(input: {
  projectId: string; label: string; expected: string; next: string; updatedBy: string;
}): Promise<boolean>;
```

- [ ] **Step 1: Write the failing tests**

Create `tests/server/room/storeSharedBlockValue.test.ts`:

```typescript
import { afterEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { __setRoomDbForTests } from '../../../server/room/supabaseClient';
import { casUpdateSharedBlock, getSharedBlockSnapshot, getSharedBlockValue } from '../../../server/room/store';

afterEach(() => __setRoomDbForTests(null));

function fakeDb(result: { data: unknown; error: { message: string } | null }): SupabaseClient {
  const chain = {
    select: () => chain,
    update: () => chain,
    eq: () => chain,
    is: () => chain,
    limit: async () => result,
    then: (resolve: (v: typeof result) => void) => resolve(result),
  };
  return { from: () => chain } as unknown as SupabaseClient;
}

describe('getSharedBlockValue missing-vs-empty (Addendum B1)', () => {
  it('returns null when the row is absent', async () => {
    __setRoomDbForTests(fakeDb({ data: [], error: null }));
    await expect(getSharedBlockValue('p1', 'story_locks')).resolves.toBeNull();
  });

  it('returns the empty string when the row exists with an empty value', async () => {
    __setRoomDbForTests(fakeDb({ data: [{ value: '' }], error: null }));
    await expect(getSharedBlockValue('p1', 'story_locks')).resolves.toBe('');
  });

  it('returns stored writer content verbatim', async () => {
    __setRoomDbForTests(fakeDb({ data: [{ value: '[SEED] ending fixed' }], error: null }));
    await expect(getSharedBlockValue('p1', 'story_locks')).resolves.toBe('[SEED] ending fixed');
  });
});

describe('getSharedBlockSnapshot (Meeting bank generation token)', () => {
  it('returns value + revision without collapsing a missing row', async () => {
    __setRoomDbForTests(fakeDb({ data: [{ value: 'seed projection', revision: 7 }], error: null }));
    await expect(getSharedBlockSnapshot('p1', 'concept_seed')).resolves.toEqual({
      value: 'seed projection',
      revision: 7,
    });

    __setRoomDbForTests(fakeDb({ data: [], error: null }));
    await expect(getSharedBlockSnapshot('p1', 'concept_seed')).resolves.toBeNull();
  });
});

describe('casUpdateSharedBlock (race-safe section writes)', () => {
  it('returns true when the conditioned update matched a row', async () => {
    __setRoomDbForTests(fakeDb({ data: [{ id: 'b1' }], error: null }));
    await expect(
      casUpdateSharedBlock({ projectId: 'p1', label: 'story_locks', expected: 'old', next: 'new', updatedBy: 'writer' }),
    ).resolves.toBe(true);
  });

  it('returns false when the value changed since it was read (0 rows matched)', async () => {
    __setRoomDbForTests(fakeDb({ data: [], error: null }));
    await expect(
      casUpdateSharedBlock({ projectId: 'p1', label: 'story_locks', expected: 'stale', next: 'new', updatedBy: 'writer' }),
    ).resolves.toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/server/room/storeSharedBlockValue.test.ts`
Expected: FAIL — `''` instead of `null`; `casUpdateSharedBlock` not exported.

- [ ] **Step 3: Implement store changes**

In `server/room/store.ts`, replace `getSharedBlockValue` and add `casUpdateSharedBlock`:

```typescript
// B1 missing-vs-empty: null = row absent (a system error after initialization);
// '' = row present with an empty value. Callers must handle null explicitly.
export async function getSharedBlockValue(projectId: string, label: string): Promise<string | null> {
  const res = await getRoomDb()
    .from('memory_blocks')
    .select('value')
    .eq('project_id', projectId)
    .is('agent_id', null)
    .eq('label', label)
    .limit(1);
  if (res.error) throw new Error(`[room.store] getSharedBlockValue: ${res.error.message}`);
  const row = (res.data ?? [])[0] as { value: string } | undefined;
  return row ? row.value : null;
}

// Read the row value and monotonic revision in ONE query. Meeting banking
// reads the concept_seed snapshot before reading terminal sessions; its RPC
// compares this revision so a concurrent bank cannot commit a stale projection.
export async function getSharedBlockSnapshot(
  projectId: string,
  label: string,
): Promise<{ value: string; revision: number } | null> {
  const res = await getRoomDb()
    .from('memory_blocks')
    .select('value, revision')
    .eq('project_id', projectId)
    .is('agent_id', null)
    .eq('label', label)
    .limit(1);
  if (res.error) throw new Error(`[room.store] getSharedBlockSnapshot: ${res.error.message}`);
  const row = (res.data ?? [])[0] as { value: string; revision: number } | undefined;
  return row ?? null;
}

// B3 race safety: the write only lands if the row still holds the value the
// caller read (compare-and-swap). false = concurrent writer won; re-read and
// re-merge. Never write a merged section value through plain writeBlock.
export async function casUpdateSharedBlock(input: {
  projectId: string;
  label: string;
  expected: string;
  next: string;
  updatedBy: string;
}): Promise<boolean> {
  const res = await getRoomDb()
    .from('memory_blocks')
    .update({ value: input.next, updated_by: input.updatedBy, updated_at: new Date().toISOString() })
    .eq('project_id', input.projectId)
    .is('agent_id', null)
    .eq('label', input.label)
    .eq('value', input.expected)
    .select('id');
  if (res.error) throw new Error(`[room.store] casUpdateSharedBlock: ${res.error.message}`);
  return ((res.data ?? []) as Array<{ id: string }>).length > 0;
}
```

- [ ] **Step 4: Migrate the `runRoomTurn` caller**

In `server/room/runRoomTurn.ts`, after the `Promise.all` destructure (lines 37-42), add:

```typescript
  if (locksText === null) {
    throw new Error(`[room.turn] story_locks block missing for project ${projectId} — memory not initialized.`);
  }
```

(The `bankInterview` caller is rebuilt in Task 7; if `npm run check` surfaces other callers, handle `null` by throwing `<label> block missing — room memory not initialized.` at the call site.)

- [ ] **Step 5: Typecheck + run tests**

Run: `npm run check` — expected clean apart from `interview/runtime.ts` (rebuilt in Task 7; if red there, leave until Task 7 only if the suite still runs; otherwise add the null-throw now).
Run: `npx vitest run tests/server/room/storeSharedBlockValue.test.ts tests/server/room/runRoomTurn.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/room/store.ts server/room/runRoomTurn.ts tests/server/room/storeSharedBlockValue.test.ts
git commit -m "feat: null for absent shared blocks + CAS block update (Addendum B1/B3)"
```

---

### Task 6: Canonical Meeting record shape + `concept_seed` projection

**Files:**
- Modify: `server/room/interview/types.ts` (`TranscriptEntry`, `MeetingBankSnapshot`, `InterviewSessionRow.bank_snapshot`)
- Modify: `server/room/interview/runtime.ts:150` area (answer append site — populate new fields; verbatim persistence)
- Modify: `server/room/roomRoutes.ts:226,250` (stop trimming seed/answer in transit)
- Modify: `client/src/lib/useInterviewSession.ts:109`, `client/src/components/ritual/ProjectMeetingPage.tsx:52` (trim for empty-check only)
- Create: `server/room/interview/conceptSeedProjection.ts`
- Test: `tests/server/room/conceptSeedProjection.test.ts`

**Interfaces:**
- Consumes: `QUESTION_BANK` (`server/room/interview/questionBank.ts`), `InterviewSessionRow`.
- Produces:

```typescript
// types.ts — TranscriptEntry gains optional fields (additive; answers is
// jsonb, no migration needed). Canonical-record shape per Addendum B1 (Task 1):
// question_text = exact question, domain = elicitation domain. Existing
// entries without them remain valid.
export interface TranscriptEntry {
  question_id: string;
  question_text?: string; // exact question as asked (future generated questions REQUIRE this)
  domain?: string; // OPEN string, not a closed union — the domain taxonomy is
                   // future Meeting scope; current values are provisional
  lane: string;
  answer_text: string;
  origin: ProposalOrigin | null;
  disposition: AnswerDisposition;
  at: string;
}

export type MeetingMutability = 'locked' | 'leaning' | 'open';

export interface MeetingBankSnapshot {
  applied_classifications: Record<string, MeetingMutability>;
  // Exact current-round entries before 2,000-char projection. Includes both
  // adopted proposals classified open and skipped/delegated transcript entries.
  open_questions: string[];
  // Pre-contract block-only questions adopted ONCE by the first post-contract
  // bank. They must enter canonical history before the bounded block can omit
  // them; later snapshots use an empty array and read the adopter's copy.
  legacy_open_questions: string[];
}

// InterviewSessionRow gains:
bank_snapshot: MeetingBankSnapshot | null;

// conceptSeedProjection.ts
export const DOMAIN_BY_TRIGGER: Record<string, string>; // PROVISIONAL mapping — no taxonomy decision implied
export function projectConceptSeed(sessions: InterviewSessionRow[], cap?: number): string; // deterministic, <= cap by construction
```

Projection rules (deterministic — same sessions in, same string out; ≤ cap **by construction**, no blind final slice):
1. Input: sessions with state `banked` or `exported`, sorted by `created_at` ascending (round order).
2. **The founding seed is reserved FIRST and can never disappear** — agent-facing seed context must survive any volume of answers and any round drops. The projection opens with `## Founding seed — <round-1 date> (verbatim excerpt)` holding up to `FOUNDING_SEED_RESERVE` (1,000) chars of round 1's seed (truncation marker when clipped). Only the leftover budget goes to rounds.
3. Rounds render **newest first**: `## Project Meeting Round — <created_at date> (round N of M)`, then `### Confirmed answers`, then (for non-founding rounds) `### Seed (verbatim excerpt)` — and within a round, `ROUND_SEED_MIN` (200) chars are **reserved for the round's seed excerpt BEFORE answers spend anything**, so answers can shorten a seed excerpt but never evict it.
4. Honest bounded behavior (answers alone can exceed the cap — nothing is promised "never truncated"):
   - Answer lines render in transcript order and drop **from the tail**, replaced by `- … (+N more answers — see Meeting record)`.
   - Seed excerpts truncate with `… [seed truncated — full text in the Meeting record]`.
   - Older rounds render whole-or-not-at-all; dropped rounds are announced by a reserved trailing marker `… (N earlier rounds in the Meeting record)`. The founding-seed section survives drops by construction (rule 2).
5. No banked sessions → the `concept_seed` sentinel.

- [ ] **Step 1: Write the failing tests**

Create `tests/server/room/conceptSeedProjection.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import type { InterviewSessionRow } from '../../../server/room/interview/types';
import { DOMAIN_BY_TRIGGER, projectConceptSeed } from '../../../server/room/interview/conceptSeedProjection';

function session(overrides: Partial<InterviewSessionRow>): InterviewSessionRow {
  return {
    id: 's1',
    project_id: 'p1',
    mode: 'full',
    state: 'banked',
    seed_text: 'A noir about a lighthouse keeper.',
    audit: {},
    cursor: { lane: null, question_id: null, budgets_spent: {} },
    answers: [],
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    ...overrides,
  } as InterviewSessionRow;
}

describe('DOMAIN_BY_TRIGGER', () => {
  it('maps every current question-bank trigger to a domain', () => {
    expect(DOMAIN_BY_TRIGGER).toEqual({
      locks: 'structure',
      ending: 'structure',
      open_questions: 'structure',
      load_bearing_character: 'character',
      world_rules: 'world',
      premise_identity: 'structure',
      stakes_engine: 'structure',
      voice_texture: 'dialogue',
      format_scope: 'scale',
    });
  });
});

describe('projectConceptSeed', () => {
  it('returns the sentinel when no sessions are banked', () => {
    expect(projectConceptSeed([])).toBe('No concept seed banked yet. Offer the Project Meeting.');
    expect(projectConceptSeed([session({ state: 'interviewing' })])).toBe(
      'No concept seed banked yet. Offer the Project Meeting.',
    );
  });

  it('opens with the founding seed and renders confirmed answers for a single round', () => {
    const s = session({
      answers: [
        {
          question_id: 'morgan-locks',
          question_text: "What's the one thing this story is not allowed to become?",
          domain: 'structure',
          lane: 'morgan',
          answer_text: 'Never a cynical ghost-hunt.',
          origin: 'seed',
          disposition: 'field_mapped',
          at: '2026-07-01T00:10:00Z',
        },
      ],
    });
    const out = projectConceptSeed([s]);
    expect(out.startsWith('## Founding seed —')).toBe(true);
    expect(out).toContain('A noir about a lighthouse keeper.');
    expect(out).toContain('[SEED]');
    expect(out).toContain('Never a cynical ghost-hunt.');
    expect(out.length).toBeLessThanOrEqual(4000);
  });

  it('is deterministic', () => {
    const s = session({});
    expect(projectConceptSeed([s])).toBe(projectConceptSeed([s]));
  });

  it('a 20k-char seed projects to <= 4000 with an intact truncation marker in the founding block', () => {
    const s = session({ seed_text: 'x'.repeat(20000) });
    const out = projectConceptSeed([s]);
    expect(out.length).toBeLessThanOrEqual(4000);
    expect(out).toContain('xxx');
    expect(out).toContain('[seed truncated — full text in the Meeting record]'); // intact, never sliced mid-marker
  });

  it('answers alone exceeding the cap are tail-dropped — and the founding seed still stands', () => {
    const answers = Array.from({ length: 200 }, (_, i) => ({
      question_id: `q${i}`,
      question_text: `Question number ${i}?`,
      lane: 'morgan',
      answer_text: `Answer ${i} with some meaningful length to overflow the budget.`,
      origin: 'seed' as const,
      disposition: 'field_mapped' as const,
      at: '2026-07-01T00:10:00Z',
    }));
    const out = projectConceptSeed([session({ answers })]);
    expect(out.length).toBeLessThanOrEqual(4000);
    expect(out).toMatch(/\+\d+ more answers — see Meeting record/);
    // The founding seed can NEVER be crowded out by answers:
    expect(out.startsWith('## Founding seed —')).toBe(true);
    expect(out).toContain('A noir about a lighthouse keeper.');
  });

  it('per-round seed slice is reserved before answers (answers shorten it, never evict it)', () => {
    const answers = Array.from({ length: 100 }, (_, i) => ({
      question_id: `q${i}`,
      question_text: `Q${i}?`,
      lane: 'morgan',
      answer_text: `A${i} — long enough answer text to soak up the round budget quickly here.`,
      origin: 'seed' as const,
      disposition: 'field_mapped' as const,
      at: '2026-07-02T00:10:00Z',
    }));
    const round1 = session({ id: 'r1', created_at: '2026-06-01T00:00:00Z', seed_text: 'founding seed text' });
    const round2 = session({ id: 'r2', created_at: '2026-07-01T00:00:00Z', seed_text: 'w'.repeat(500), answers });
    const out = projectConceptSeed([round1, round2]);
    expect(out.length).toBeLessThanOrEqual(4000);
    expect(out).toContain('### Seed (verbatim excerpt)'); // round 2's seed slice survived its answers
    expect(out).toContain('www');
  });

  it('renders newest round first, drops oldest whole rounds, announces the drop — founding seed survives', () => {
    const oldRound = session({ id: 'old', created_at: '2026-06-01T00:00:00Z', seed_text: 'y'.repeat(3000) });
    const newRound = session({ id: 'new', created_at: '2026-07-01T00:00:00Z', seed_text: 'z'.repeat(3000) });
    const out = projectConceptSeed([oldRound, newRound]);
    expect(out.length).toBeLessThanOrEqual(4000);
    expect(out.startsWith('## Founding seed —')).toBe(true);
    expect(out).toContain('yyy'); // founding (round 1) seed excerpt survives its round being dropped
    expect(out).toContain('zzz'); // newest round present
    expect(out).toContain('round 2 of 2');
    expect(out).toContain('(1 earlier rounds in the Meeting record)'); // drop announced
    expect(out).not.toContain('round 1 of 2'); // dropped round section is whole-or-nothing
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/server/room/conceptSeedProjection.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement types + projection**

In `server/room/interview/types.ts`, extend `TranscriptEntry` with the two optional fields shown in Interfaces above (keep every existing field unchanged). `domain` is a plain optional `string` — do NOT introduce a closed union type; the taxonomy is future Meeting scope and current values are provisional.

Create `server/room/interview/conceptSeedProjection.ts`:

```typescript
// Addendum B1 (as corrected): concept_seed is a deterministic bounded
// projection of the canonical Meeting record (interview_sessions). The record
// keeps the verbatim seed (<=20k) and full transcript; the block carries what
// fits in the agents' working context. The output is <= cap BY CONSTRUCTION —
// every piece is budgeted before it is added; there is no final blind slice.
// Honest bounds: answers drop from the tail with an omission marker, the seed
// excerpt truncates with a marker, dropped older rounds are announced.

import type { InterviewSessionRow, TranscriptEntry } from './types';

export const CONCEPT_SEED_SENTINEL = 'No concept seed banked yet. Offer the Project Meeting.';
const SEED_TRUNCATED = '… [seed truncated — full text in the Meeting record]';
const answersOmitted = (n: number) => `- … (+${n} more answers — see Meeting record)`;
const roundsOmitted = (n: number) => `… (${n} earlier rounds in the Meeting record)`;
const FOUNDING_SEED_RESERVE = 1000; // carved out of the cap before anything else
const ROUND_SEED_MIN = 200; // per-round seed slice reserved before answers

function excerpt(text: string, budget: number): string {
  if (text.length <= budget) return text;
  if (budget < SEED_TRUNCATED.length) return SEED_TRUNCATED.slice(0, Math.max(0, budget));
  return text.slice(0, budget - SEED_TRUNCATED.length) + SEED_TRUNCATED;
}

// PROVISIONAL trigger->domain mapping (open strings, additive). The domain
// taxonomy is future Meeting scope — nothing may assume this set is closed.
export const DOMAIN_BY_TRIGGER: Record<string, string> = {
  locks: 'structure',
  ending: 'structure',
  open_questions: 'structure',
  load_bearing_character: 'character',
  world_rules: 'world',
  premise_identity: 'structure',
  stakes_engine: 'structure',
  voice_texture: 'dialogue',
  format_scope: 'scale',
};

// Full A8 origin set.
function originTag(origin: TranscriptEntry['origin']): string {
  if (origin === 'extrapolated') return '[EXTRAPOLATED]';
  if (origin === 'invented') return '[INVENTED]';
  return '[SEED]';
}

// Fit whole lines into budget; when lines are dropped, the tail becomes an
// omission marker. Never slices a content line.
function fitLines(lines: string[], budget: number): string {
  if (lines.join('\n').length <= budget) return lines.join('\n');
  const kept: string[] = [];
  for (const line of lines) {
    const marker = answersOmitted(lines.length - kept.length);
    if ([...kept, line, marker].join('\n').length > budget) break;
    kept.push(line);
  }
  return [...kept, answersOmitted(lines.length - kept.length)].join('\n');
}

// Render one round into at most `budget` chars. The round's seed slice is
// reserved BEFORE answers spend anything (rule 3) — answers can shorten a
// seed excerpt, never evict it. Returns null when even the header cannot fit.
function renderRoundBounded(
  s: InterviewSessionRow,
  roundNo: number,
  total: number,
  budget: number,
  includeSeed: boolean,
): string | null {
  const header = `## Project Meeting Round — ${s.created_at.slice(0, 10)} (round ${roundNo} of ${total})`;
  if (header.length > budget) return null;
  const pieces: string[] = [header];
  let used = header.length;

  const seedTitle = '### Seed (verbatim excerpt)';
  const seedOverhead = 2 + seedTitle.length + 1; // separator + title + newline
  const seedReserve = includeSeed
    ? Math.min(ROUND_SEED_MIN + seedOverhead, Math.max(0, budget - used))
    : 0;

  const confirmed = s.answers.filter((a) => a.disposition === 'field_mapped' || a.disposition === 'seed_color');
  const answerLines = confirmed.map(
    (a) => `- ${originTag(a.origin)} ${(a.question_text ?? a.question_id)}: ${a.answer_text.trim()}`,
  );
  if (answerLines.length) {
    const title = '### Confirmed answers';
    const answersBudget = budget - used - seedReserve - (2 + title.length + 1);
    if (answersBudget > answersOmitted(answerLines.length).length) {
      const body = fitLines(answerLines, answersBudget);
      pieces.push(`${title}\n${body}`);
      used += 2 + title.length + 1 + body.length;
    }
  }

  if (includeSeed) {
    const seedBudget = budget - used - seedOverhead; // >= the reserve minus overhead, by construction
    if (seedBudget > 0) {
      pieces.push(`${seedTitle}\n${excerpt(s.seed_text, seedBudget)}`);
    }
  }

  return pieces.join('\n\n');
}

export function projectConceptSeed(sessions: InterviewSessionRow[], cap = 4000): string {
  const banked = sessions
    .filter((s) => s.state === 'banked' || s.state === 'exported')
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  if (banked.length === 0) return CONCEPT_SEED_SENTINEL;

  const total = banked.length;
  const founding = banked[0];

  // Rule 2: the founding seed is reserved FIRST — it survives any volume of
  // answers and any round drops. Round 1's own section skips its seed
  // subsection (the founding block already carries it).
  const foundingHeader = `## Founding seed — ${founding.created_at.slice(0, 10)} (verbatim excerpt)`;
  const foundingBudget = Math.max(0, Math.min(FOUNDING_SEED_RESERVE, cap) - foundingHeader.length - 1);
  const parts: string[] = [`${foundingHeader}\n${excerpt(founding.seed_text, foundingBudget)}`];
  let remaining = cap - parts[0].length;
  let dropped = 0;

  for (let i = total - 1; i >= 0; i--) {
    const isNewest = i === total - 1;
    const sep = 2;
    // Reserve space for the dropped-rounds marker while older rounds remain.
    const reserve = i > 0 ? roundsOmitted(i).length + sep : 0;
    const budget = remaining - sep - reserve;

    if (isNewest) {
      const rendered = renderRoundBounded(banked[i], i + 1, total, budget, i > 0);
      if (rendered === null) { dropped = total; break; } // degenerate cap: founding seed alone stands
      parts.push(rendered);
      remaining -= rendered.length + sep;
    } else {
      const full = renderRoundBounded(banked[i], i + 1, total, Number.MAX_SAFE_INTEGER, i > 0)!;
      if (full.length > budget) {
        dropped = i + 1; // this and all earlier rounds are whole-or-nothing
        break;
      }
      parts.push(full);
      remaining -= full.length + sep;
    }
  }

  if (dropped > 0) parts.push(roundsOmitted(dropped));
  return parts.join('\n\n');
}
```

- [ ] **Step 4: Populate the new fields at the answer-append site**

In `server/room/interview/runtime.ts` (~line 150, the `appendInterviewAnswer` call inside the answer handler), add to the entry object:

```typescript
      question_text: question.question,
      domain: DOMAIN_BY_TRIGGER[question.trigger],
```

where `question` is the `QuestionBankRow` already resolved for the current answer in that function (import `DOMAIN_BY_TRIGGER` from `./conceptSeedProjection`). Read the surrounding function first — the bank row variable may be named differently; the requirement is: every new transcript entry stores the exact question text and its (provisional) domain.

- [ ] **Step 4b: Make "verbatim" true through EVERY layer — trim only for empty checks, persist raw, validate raw**

Text is trimmed at four layers before it reaches the record; fixing only the runtime leaves "verbatim" false through the real UI path. Rule at every layer: `.trim()` may be used ONLY for the is-it-empty check; the raw string is what travels and persists; the 20k limit (`validateTextLength`) applies to the RAW text (a valid raw input must never pass at one layer and fail at another because trimming changed its length).

1. `server/room/interview/runtime.ts` `startInterview` (~line 94):

```typescript
  const seedText = input.seedText;
  if (!seedText.trim()) throw new Error('seedText is required.');
  validateTextLength('seedText', seedText); // RAW length governs the limit
  // persist seedText (raw) — the canonical record is verbatim
```

Answer path (~line 145), same shape:

```typescript
  const answerText = input.answerText;
  if (!answerText.trim()) throw new Error('answerText is required.');
  validateTextLength('answerText', answerText);
```

and keep persisting `answer_text: answerText` (raw).

2. `server/room/roomRoutes.ts:226` — `const seedText = typeof req.body?.seedText === 'string' ? req.body.seedText.trim() : '';` → drop the `.trim()` (pass raw; runtime does the empty check). Same at `:250` for `answerText`. (The writer-message trim at `:81` is channel content, not the Meeting record — leave it.)

3. `client/src/lib/useInterviewSession.ts:109` — `const answerText = input.answerText.trim()` → keep a trimmed copy ONLY for the empty guard, send raw:

```typescript
    const answerText = input.answerText
    if (!session || !answerText.trim()) return false
```

4. `client/src/components/ritual/ProjectMeetingPage.tsx:52` — `const seedText = seedDraft.trim()` → same pattern: guard on `seedDraft.trim()`, submit `seedDraft` raw.

Downstream renderers already `.trim()` at display/projection time (`banking.ts` datedAnswer, projection lines), so nothing double-renders whitespace. Tests: `tests/server/room/interviewRuntime.test.ts` — a seed of `'  padded seed  '` persists byte-identical, and a raw 20,001-char seed whose trimmed length is 19,999 is REJECTED (raw governs); update any assertions that expected trimmed persistence. Extend the interview-routes test: POSTed padded seedText reaches the runtime mock unmodified.

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run tests/server/room/conceptSeedProjection.test.ts tests/server/room/interviewRuntime.test.ts && npm run check`
Expected: PASS / clean.

- [ ] **Step 6: Commit**

```bash
git add server/room/interview/types.ts server/room/interview/runtime.ts server/room/roomRoutes.ts client/src/lib/useInterviewSession.ts client/src/components/ritual/ProjectMeetingPage.tsx server/room/interview/conceptSeedProjection.ts tests/server/room/conceptSeedProjection.test.ts
git commit -m "feat: canonical Meeting record — verbatim through every layer, question text/domain, seed-first bounded projection"
```

---

### Task 7: Atomic, retry-safe banking through `bank_meeting_memory`

**Files:**
- Modify: `server/room/interview/runtime.ts` (`bankInterview`, lines 215-233; add `computeBankValues`, `previewBankFinal`; `exportInterview` at `:238` reads stored applied classifications)
- Modify: `server/room/interview/banking.ts` (delegation-derived open questions; sentinel period; `renderOpenQuestionsBlockBounded`)
- Modify: `server/room/roomRoutes.ts:322` (bank-preview route returns `finalValues`)
- Modify: `client/src/lib/roomApi.ts:226` (`fetchInterviewBankPreview` returns `{ preview, finalValues }`; extend the client type)
- Modify: `client/src/lib/useInterviewSession.ts` (store `finalValues`; expose `previewPending`)
- Modify: `client/src/components/ritual/ProjectMeetingPage.tsx` (render exact final block values in the bank-preview panel; disable "Bank this round" while `previewPending`)
- Test: `tests/server/room/bankMeetingMemory.test.ts` (create)
- Test: `tests/lib/roomApi.test.ts`, `tests/lib/useInterviewSession.test.tsx`, `tests/components/ProjectMeetingPage.test.tsx` (return shape, hook storage/pending/failure state, page disable-while-pending-or-invalid)

**Interfaces:**
- Consumes: `bank_meeting_memory` RPC (Task 3); `mergeMeetingLocks`, `NONE_DECLARED` (Task 2); `projectConceptSeed` (Task 6); `getSharedBlockValue` null contract + `getSharedBlockSnapshot` revision read (Task 5); `listInterviewSessions` (`server/room/interview/store.ts:58`).
- Produces: `bankInterview` performs ALL memory writes + the state transition in one RPC transaction; retries both `locks_conflict` and `projection_conflict` up to 3 times with fresh reads; treats `already_banked` as success (idempotent retry). The old three-`writeBlock` sequence and the `renderStoryLocksBlock`-based whole-section replace are deleted from the bank path (`renderStoryLocksBlock` itself stays — `exportCheck.ts` uses it for the export document).

New `bankInterview` core (replaces lines 215-233):

```typescript
export async function bankInterview(input: { sessionId: string; projectId: string; mutability?: Record<string, Mutability> }): Promise<InterviewBankResult> {
  const session = await interviewStore.getInterviewSession(input.sessionId);
  if (!session) throw new Error(`Interview session ${input.sessionId} not found.`);
  assertSessionProject(session.project_id, input.projectId);
  // App-boundary idempotency: if a previous bank SUCCEEDED but the response
  // was lost, the session is already banked/exported — a retry must be a
  // success no-op, not a state-precondition rejection. Re-render from the
  // STORED decision map so the retry cannot fall back to different defaults.
  if (session.state === 'banked' || session.state === 'exported') {
    const preview = await previewBank({
      ...input,
      mutability: session.bank_snapshot?.applied_classifications ?? input.mutability ?? {},
    });
    return { session, preview };
  }
  if (session.state !== 'readback') throw new Error('Only readback sessions can be banked.');
  const preview = await previewBank(input);

  for (let attempt = 1; attempt <= 3; attempt++) {
    // ONE helper computes the exact block values for both preview and bank
    // (A9 parity: the writer sees exactly what will be written). Recomputed
    // per attempt from fresh reads; a concurrent surface sync raises
    // locks_conflict, while a different Meeting bank raises
    // projection_conflict. Both force a canonical re-read and retry.
    const values = await computeBankValues(session, preview);
    // Locks are ENFORCED content — never silently truncated. Over-cap merges
    // fail loudly and visibly ('exceeds maximum length' -> 413 in the routes).
    if (values.story_locks.length > 2000) {
      throw new Error(
        'Story locks block exceeds maximum length (2000 chars after merging Meeting locks). Consolidate locks at readback before banking.',
      );
    }

    const rpc = await getRoomDb().rpc('bank_meeting_memory', {
      p_project_id: session.project_id,
      p_session_id: session.id,
      p_bank_revision: values.bankRevision,
      p_concept_seed: values.concept_seed,
      p_locks_expected: values.currentLocks,
      p_locks_next: values.story_locks,
      p_open_questions: values.open_questions,
      // Exact bank-time decisions become canonical in the same transaction.
      p_bank_snapshot: values.bank_snapshot,
    });
    if (!rpc.error) {
      const refreshed = await interviewStore.getInterviewSession(session.id);
      if (!refreshed) throw new Error('Bank completed but the canonical session could not be reloaded.');
      if (rpc.data === 'already_banked') {
        // Another request won the session-row race. Return ITS stored decision,
        // never this losing request's locally computed preview.
        const storedPreview = await previewBank({
          ...input,
          mutability: refreshed.bank_snapshot?.applied_classifications ?? {},
        });
        return { session: refreshed, preview: storedPreview };
      }
      return { session: refreshed, preview };
    }
    const retryableConflict =
      rpc.error.message.includes('locks_conflict') ||
      rpc.error.message.includes('projection_conflict');
    if (!retryableConflict) {
      throw new Error(`Bank failed: ${rpc.error.message}`);
    }
    // A concurrent writer won — loop re-reads and recomputes all projections.
  }
  throw new Error('Bank failed: shared-memory contention persisted across 3 attempts.');
}
```

(Add imports: `getRoomDb` from `../supabaseClient`; `mergeMeetingLocks` from `../lockSections`; `getSharedBlockSnapshot` via the existing `roomStore` import; `projectConceptSeed` from `./conceptSeedProjection`; `parseOpenQuestionsBlock` and `renderOpenQuestionsBlockBounded` from `./banking`; `MeetingBankSnapshot` from `./types`.)

The shared helper and the preview-parity API (A9: the bank moment shows **exactly** what will be written — current-round additions alone no longer describe the write, which is a cross-session projection + cumulative lock merge):

```typescript
// The single source of truth for what a bank writes. previewBankFinal and
// bankInterview both call this — the preview IS the bank value (A9).
async function computeBankValues(session: InterviewSessionRow, preview: BankPreview): Promise<{
  concept_seed: string;
  story_locks: string;
  open_questions: string;
  currentLocks: string;
  bankRevision: number;
  bank_snapshot: MeetingBankSnapshot;
}> {
  // ORDER IS LOAD-BEARING: read the project bank generation first, then read
  // terminal sessions. A bank landing anywhere between those reads and the RPC
  // changes the revision and rejects this attempt. Reversing the order could
  // pair stale session history with a fresh token and permit an overwrite.
  const conceptSeedSnapshot = await roomStore.getSharedBlockSnapshot(
    session.project_id,
    'concept_seed',
  );
  if (conceptSeedSnapshot === null) {
    throw new Error('contracted concept_seed block missing — room memory not initialized.');
  }
  const allSessions = await interviewStore.listInterviewSessions(session.project_id);
  const [currentLocks, currentOpenQuestions] = await Promise.all([
    roomStore.getSharedBlockValue(session.project_id, 'story_locks'),
    roomStore.getSharedBlockValue(session.project_id, 'open_questions'),
  ]);
  if (currentLocks === null || currentOpenQuestions === null) {
    throw new Error('contracted memory block missing — room memory not initialized.');
  }
  const hasCanonicalSnapshot = allSessions.some(
    (s) => (s.state === 'banked' || s.state === 'exported') && s.bank_snapshot !== null,
  );
  const bankSnapshot: MeetingBankSnapshot = {
    applied_classifications: Object.fromEntries(
      preview.taggable.map((item) => [item.proposalId, item.applied]),
    ),
    // `buildBankPreview` includes adopted-open proposals AND transcript
    // skip/delegation entries. Store exact current-round units before bounding.
    open_questions: [...preview.openQuestions],
    // First post-contract bank adopts ALL pre-contract block-only units into
    // durable history BEFORE rendering the 2,000-char projection. A projection
    // omission can therefore never erase the only copy. Concurrent first banks
    // are resolved by the revision CAS; the retry sees the winner's snapshot.
    legacy_open_questions: hasCanonicalSnapshot
      ? []
      : parseOpenQuestionsBlock(currentOpenQuestions),
  };
  const sessionsAsBanked = allSessions.map((s) =>
    s.id === session.id
      ? { ...s, state: 'banked' as const, bank_snapshot: bankSnapshot }
      : s,
  );
  const projectedOpenQuestions = cumulativeOpenQuestions(
    sessionsAsBanked,
    session.id,
    bankSnapshot,
  );
  return {
    concept_seed: projectConceptSeed(sessionsAsBanked),
    story_locks: mergeMeetingLocks(currentLocks, preview.locks),
    open_questions: renderOpenQuestionsBlockBounded(
      { ...preview, openQuestions: projectedOpenQuestions },
      2000,
    ),
    currentLocks,
    bankRevision: conceptSeedSnapshot.revision,
    bank_snapshot: bankSnapshot,
  };
}

// Cumulative projection source order: current round, newest prior terminal
// Meeting snapshots, legacy-session delegation fallback, then durable legacy
// units adopted into the first post-contract snapshot. `banked` AND `exported`
// are terminal history. Exact-text dedupe; resolution remains future scope.
function cumulativeOpenQuestions(
  sessionsAsBanked: InterviewSessionRow[],
  currentSessionId: string,
  currentSnapshot: MeetingBankSnapshot,
): string[] {
  const terminal = sessionsAsBanked
    .filter((s) => s.state === 'banked' || s.state === 'exported');
  const priorLines = terminal
    .filter((s) => s.id !== currentSessionId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at)) // newest round first
    .flatMap((s) => s.bank_snapshot?.open_questions ?? s.answers
        .filter((a) => a.disposition === 'skipped_delegated')
        .map((a) => `Delegated to the room: ${a.question_text ?? a.question_id}`));
  const legacyLines = terminal.flatMap(
    (s) => s.bank_snapshot?.legacy_open_questions ?? [],
  );
  const seen = new Set<string>();
  return [...currentSnapshot.open_questions, ...priorLines, ...legacyLines]
    .filter((line) => (seen.has(line) ? false : (seen.add(line), true)));
}

export async function previewBankFinal(input: { sessionId: string; projectId: string; mutability?: Record<string, Mutability> }): Promise<{
  preview: BankPreview;
  finalValues: { concept_seed: string; story_locks: string; open_questions: string };
}> {
  const session = await interviewStore.getInterviewSession(input.sessionId);
  if (!session) throw new Error(`Interview session ${input.sessionId} not found.`);
  assertSessionProject(session.project_id, input.projectId);
  const preview = await previewBank(input);
  const { concept_seed, story_locks, open_questions } = await computeBankValues(session, preview);
  return { preview, finalValues: { concept_seed, story_locks, open_questions } };
}
```

Wire it through: the `bank-preview` route (`roomRoutes.ts:322`) calls `previewBankFinal` and returns `{ preview, finalValues }`; `client/src/components/ritual/ProjectMeetingPage.tsx` renders `finalValues` in the existing bank-preview panel (a collapsed "Exact block values to be written" section with the three values in `<pre>` blocks — no redesign, one addition to the readback panel). If a surface edit lands between preview and commit, the lock sections re-merge. If another Meeting session banks first, the project revision CAS forces a full canonical-record re-read and projection recompute. These are the only permitted preview/commit drifts, and neither may lose content (Task 1's A9 amendment states both).

`mergeMeetingLocks` may throw `InvalidLockSectionsError` when existing memory has
partial/duplicate canonical headers. Extend `handleInterviewError` to map that
error to HTTP 422 with actionable copy and perform no write. Do not collapse it
into a generic 500 or legacy adoption. Add route coverage for malformed existing
locks and multiline Meeting content containing a reserved physical header line.

**`exportInterview` reads STORED classifications (`runtime.ts:238`):** export currently calls `previewBank` with bare defaults, so a proposal the writer banked as (say) `leaning` re-renders at export time as its `locked` default. Read `session.bank_snapshot?.applied_classifications` and pass it as `mutability`. Legacy sessions with no snapshot retain existing default behavior because their original override was never recoverable. Idempotent bank retries use the same stored map.

**Exact-preview client plumbing (closes the stale-preview-bankable window):**

- `client/src/lib/roomApi.ts` — extend `InterviewSession` with nullable
  `bank_snapshot`; `fetchInterviewBankPreview` returns `{ preview, finalValues }`
  and its return type includes the three final block strings.
- `client/src/lib/useInterviewSession.ts` — at each preview request start, increment `previewSeqRef`, set `previewPending = true`, and clear BOTH `bankPreview` and `finalValues`. Store the matching response behind the sequence guard. Matching failure leaves both values null and clears pending; stale success/failure changes nothing. Thus a failed re-preview cannot re-enable Bank against old values.
- `client/src/components/ritual/ProjectMeetingPage.tsx` — render `finalValues` in the readback panel. "Bank this round" is disabled when `previewPending || !bankPreview || !finalValues`. No client-supplied preview token is added; the server recomputes and protects both mutable inputs with its lock-value CAS and project bank-revision CAS.
- Tests: API return shape; hook success, stale-response, and failed-latest-response state; page keeps Bank disabled during pending AND after failed re-preview.

Four changes to `server/room/interview/banking.ts`:

1. **Delegation must produce delegation memory, not its opposite.** `skipInterviewQuestion` records a `skipped_delegated` transcript entry and creates NO proposal (`runtime.ts:180-182`), while `buildBankPreview` derives `openQuestions` only from adopted proposals (`banking.ts:108-110`) — so banking after a delegation writes the sentinel `Nothing delegated — writer holds all intent.`, the exact opposite of what happened. In `buildBankPreview`, after the adopted-proposals loop, derive from the transcript too:

```typescript
  // §A6/A9: a skipped/delegated area IS delegation memory — it must surface
  // in open_questions, never collapse into the "nothing delegated" sentinel.
  const delegatedLines = input.session.answers
    .filter((a) => a.disposition === 'skipped_delegated')
    .map((a) => `Delegated to the room: ${a.question_text ?? a.question_id}`);
  for (const line of delegatedLines) {
    if (!openQuestions.includes(line)) openQuestions.push(line);
  }
```

2. **Preserved-block parser + canonical adoption:** existing pre-contract `open_questions` content must survive the first post-contract bank even though old sessions have no `bank_snapshot`. Parse it into whole units, store every recovered unit in that first bank's `bank_snapshot.legacy_open_questions`, and only then render the bounded block. Add:

```typescript
export function parseOpenQuestionsBlock(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'Nothing delegated — writer holds all intent.' || trimmed === 'Nothing delegated — writer holds all intent') return [];
  const units: string[] = [];
  let current: string[] = [];
  for (const line of trimmed.split(/\r?\n/)) {
    if (line.startsWith('- ')) {
      if (current.length) units.push(current.join('\n'));
      current = [line.slice(2)];
    } else if (current.length) {
      current.push(line);
    } else {
      // Sectionless legacy body: preserve it as one opaque question unit.
      current = [line];
    }
  }
  if (current.length) units.push(current.join('\n'));
  return units.filter((unit) => !/^… \(\+\d+ more — see Meeting record\)$/.test(unit));
}
```

Test both sentinel spellings (pre-contract no-period and canonical period), ordinary bullets, multiline question units, omission-marker removal, and opaque legacy text.

3. **Sentinel parity:** `renderOpenQuestionsBlock`'s empty output is `'Nothing delegated — writer holds all intent'` (no period) — one character off the B1 sentinel. Add the period so empty-render and sentinel are the same string; update any existing assertion in `tests/server/room/interviewBanking.test.ts`.

4. Bounded projection (same honest-marker discipline as the concept_seed projection):

```typescript
export function renderOpenQuestionsBlockBounded(preview: BankPreview, cap = 2000): string {
  const full = renderOpenQuestionsBlock(preview);
  if (full.length <= cap) return full;
  // Budget in whole-QUESTION units, never line-fragments: a question is a `- `
  // bullet plus any following continuation lines (a multi-line answer-derived
  // question is never split mid-entry). Any leading non-bullet lines (header)
  // are a preamble that is always kept. `+N more` counts dropped QUESTIONS.
  const preamble: string[] = [];
  const units: string[][] = [];
  for (const line of full.split('\n')) {
    if (line.startsWith('- ')) units.push([line]);
    else if (units.length === 0) preamble.push(line);
    else units[units.length - 1].push(line);
  }
  const omitted = (n: number) => `- … (+${n} more — see Meeting record)`;
  const kept: string[][] = [];
  for (const unit of units) {
    const candidate = [...preamble, ...kept.flat(), ...unit, omitted(units.length - kept.length)].join('\n');
    if (candidate.length > cap) break;
    kept.push(unit);
  }
  return [...preamble, ...kept.flat(), omitted(units.length - kept.length)].join('\n');
}
```

- [ ] **Step 1: Write the failing tests**

Create `tests/server/room/bankMeetingMemory.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const storeMock = vi.hoisted(() => ({
  getSharedBlockValue: vi.fn(),
  getSharedBlockSnapshot: vi.fn(),
  writeBlock: vi.fn(async () => ({ ok: true as const, nearCap: false })),
}));
vi.mock('../../../server/room/store', () => storeMock);

const rpcMock = vi.hoisted(() => vi.fn(async () => ({ data: 'banked', error: null })));
vi.mock('../../../server/room/supabaseClient', () => ({
  getRoomDb: () => ({ rpc: rpcMock }),
  isRoomConfigured: () => true,
}));

const interviewStoreMock = vi.hoisted(() => ({
  getInterviewSession: vi.fn(),
  updateInterviewSession: vi.fn(),
  listInterviewSessions: vi.fn(async () => [readbackSession]),
  listInterviewProposals: vi.fn(async () => [adoptedLock]),
}));
vi.mock('../../../server/room/interview/store', () => interviewStoreMock);

const readbackSession = {
  id: 's1',
  project_id: 'p1',
  mode: 'full',
  state: 'readback',
  seed_text: 'A noir about a lighthouse keeper.',
  audit: {},
  bank_snapshot: null,
  cursor: { lane: null, question_id: null, budgets_spent: {} },
  answers: [],
  created_at: '2026-07-08T00:00:00Z',
  updated_at: '2026-07-08T00:00:00Z',
};

// Fixture shape copied from interviewBanking.test.ts:21. field_path
// 'story_locks' + default mutability 'locked' => preview.locks gets
// '[SEED] The ending is fixed.' (effectiveValue = resolved_value ?? proposed_value).
const adoptedLock = {
  id: 'p-lock',
  project_id: 'p1',
  agent_id: 'morgan',
  surface: 'memory',
  field_path: 'story_locks',
  proposed_value: 'The ending is fixed.',
  resolved_value: null,
  rationale: 'writer stated a hard constraint',
  status: 'adopted',
  resolved_at: '2026-07-08T01:00:00Z',
  kind: 'interview_answer',
  session_id: 's1',
  question_id: 'morgan-locks',
  origin: 'seed',
  created_at: '2026-07-08T00:30:00Z',
};

const SENTINEL_LOCKS = '## Surface-declared locks\nNone declared.\n\n## Meeting locks\nNone declared.';
const SENTINEL_OPEN = 'Nothing delegated — writer holds all intent.';

beforeEach(() => {
  vi.clearAllMocks();
  interviewStoreMock.getInterviewSession.mockResolvedValue(readbackSession);
  interviewStoreMock.listInterviewSessions.mockResolvedValue([readbackSession]);
  interviewStoreMock.listInterviewProposals.mockResolvedValue([adoptedLock]);
  storeMock.getSharedBlockValue.mockImplementation(async (_projectId, label) =>
    label === 'story_locks' ? SENTINEL_LOCKS : SENTINEL_OPEN,
  );
  storeMock.getSharedBlockSnapshot.mockResolvedValue({
    value: 'No concept seed banked yet. Offer the Project Meeting.',
    revision: 0,
  });
  rpcMock.mockResolvedValue({ data: 'banked', error: null });
});
afterEach(() => vi.restoreAllMocks());

async function bank() {
  const { bankInterview } = await import('../../../server/room/interview/runtime');
  return bankInterview({ sessionId: 's1', projectId: 'p1' });
}

describe('bankInterview via bank_meeting_memory (atomic, retry-safe)', () => {
  it('performs all memory writes through ONE RPC call, no direct writeBlock', async () => {
    await bank();
    expect(rpcMock).toHaveBeenCalledTimes(1);
    const [name, args] = rpcMock.mock.calls[0];
    expect(name).toBe('bank_meeting_memory');
    expect(args.p_bank_revision).toBe(0);
    expect(args.p_locks_expected).toBe(SENTINEL_LOCKS);
    expect(args.p_locks_next).toContain('## Meeting locks\n[SEED] The ending is fixed.');
    expect(args.p_locks_next).toContain('## Surface-declared locks\nNone declared.');
    expect(args.p_concept_seed).toContain('A noir about a lighthouse keeper.');
    expect(storeMock.writeBlock).not.toHaveBeenCalled();
  });

  it('preserves existing meeting locks when a later round banks no new locks', async () => {
    interviewStoreMock.listInterviewProposals.mockResolvedValue([]); // no new locks this round
    storeMock.getSharedBlockValue.mockResolvedValue(
      '## Surface-declared locks\n- Ace lives\n\n## Meeting locks\n[SEED] earlier round lock',
    );
    await bank();
    const [, args] = rpcMock.mock.calls[0];
    expect(args.p_locks_next).toContain('[SEED] earlier round lock');
    expect(args.p_locks_next).toContain('- Ace lives');
  });

  it('does not duplicate an exact re-banked lock', async () => {
    storeMock.getSharedBlockValue.mockResolvedValue(
      '## Surface-declared locks\nNone declared.\n\n## Meeting locks\n[SEED] The ending is fixed.',
    );
    await bank();
    const [, args] = rpcMock.mock.calls[0];
    const occurrences = args.p_locks_next.split('[SEED] The ending is fixed.').length - 1;
    expect(occurrences).toBe(1);
  });

  it('retries with a fresh read on locks_conflict, then succeeds', async () => {
    rpcMock
      .mockResolvedValueOnce({ data: null, error: { message: 'locks_conflict' } })
      .mockResolvedValueOnce({ data: 'banked', error: null });
    storeMock.getSharedBlockValue
      .mockResolvedValueOnce(SENTINEL_LOCKS)
      .mockResolvedValueOnce('## Surface-declared locks\n- raced in\n\n## Meeting locks\nNone declared.');
    await bank();
    expect(rpcMock).toHaveBeenCalledTimes(2);
    expect(rpcMock.mock.calls[1][1].p_locks_expected).toContain('- raced in');
    expect(rpcMock.mock.calls[1][1].p_locks_next).toContain('- raced in'); // surface section preserved
  });

  it('recomputes from terminal history when a DIFFERENT session wins the project-revision CAS', async () => {
    const concurrentWinner = {
      ...readbackSession,
      id: 's0',
      state: 'banked',
      seed_text: 'Concurrent winner seed.',
      created_at: '2026-07-07T00:00:00Z',
      bank_snapshot: { applied_classifications: {}, open_questions: [], legacy_open_questions: [] },
    };
    rpcMock
      .mockResolvedValueOnce({ data: null, error: { message: 'projection_conflict' } })
      .mockResolvedValueOnce({ data: 'banked', error: null });
    storeMock.getSharedBlockSnapshot
      .mockResolvedValueOnce({ value: 'old projection', revision: 0 })
      .mockResolvedValueOnce({ value: 'winner projection', revision: 1 });
    interviewStoreMock.listInterviewSessions
      .mockResolvedValueOnce([readbackSession])
      .mockResolvedValueOnce([concurrentWinner, readbackSession]);

    await bank();

    expect(rpcMock).toHaveBeenCalledTimes(2);
    expect(rpcMock.mock.calls[0][1].p_bank_revision).toBe(0);
    expect(rpcMock.mock.calls[1][1].p_bank_revision).toBe(1);
    expect(rpcMock.mock.calls[1][1].p_concept_seed).toContain('Concurrent winner seed.');
  });

  it('retry after a LOST RESPONSE is success at the app boundary — session already banked, RPC never called', async () => {
    // The dangerous path: previous bank succeeded, response lost, client retries.
    interviewStoreMock.getInterviewSession.mockResolvedValue({ ...readbackSession, state: 'banked' });
    const result = await bank();
    expect(result.session.state).toBe('banked');
    expect(rpcMock).not.toHaveBeenCalled(); // no rejection, no re-write
  });

  it('RPC-level already_banked returns the WINNER stored classification, not the losing request preview', async () => {
    rpcMock.mockResolvedValue({ data: 'already_banked', error: null });
    interviewStoreMock.getInterviewSession
      .mockResolvedValueOnce(readbackSession) // app check still saw readback
      .mockResolvedValue({
        ...readbackSession,
        state: 'banked',
        bank_snapshot: {
          applied_classifications: { 'p-lock': 'open' },
          open_questions: ['[SEED] The ending is fixed.'],
          legacy_open_questions: [],
        },
      }); // refresh reads the concurrent winner's immutable snapshot
    const result = await bank();
    expect(result.session.state).toBe('banked');
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(result.preview.openQuestions.join('\n')).toContain('The ending is fixed.');
    expect(result.preview.locks.join('\n')).not.toContain('The ending is fixed.');
  });

  it('over-cap merged locks fail LOUDLY before any write — never silently truncated', async () => {
    // Surface body alone is 1,900 chars; after the meeting body + headers + the
    // merged new lock the MERGED story_locks value is > 2,000, so the enforced-
    // content cap actually trips (the old 1,500 fixture stayed under cap).
    storeMock.getSharedBlockValue.mockImplementation(async (_projectId, label) =>
      label === 'story_locks'
        ? `## Surface-declared locks\n${'s'.repeat(1900)}\n\n## Meeting locks\n${'m'.repeat(400)}`
        : SENTINEL_OPEN,
    );
    await expect(bank()).rejects.toThrow(/exceeds maximum length/);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('banking after a delegation writes the delegation into open_questions, not the sentinel', async () => {
    interviewStoreMock.listInterviewProposals.mockResolvedValue([]); // skip creates no proposal
    interviewStoreMock.getInterviewSession.mockResolvedValue({
      ...readbackSession,
      answers: [{
        question_id: 'casey-load-bearing-character',
        question_text: 'Which character is load-bearing?',
        lane: 'casey',
        answer_text: 'Writer skipped/delegated this area to the room.',
        origin: null,
        disposition: 'skipped_delegated',
        at: '2026-07-08T00:20:00Z',
      }],
    });
    await bank();
    const [, args] = rpcMock.mock.calls[0];
    expect(args.p_open_questions).toContain('Delegated to the room: Which character is load-bearing?');
    expect(args.p_open_questions).not.toBe('Nothing delegated — writer holds all intent.');
  });

  it('open_questions bounds the block but adopts omitted PRE-CONTRACT units into canonical snapshot history', async () => {
    const legacy = ['Legacy unresolved alpha', 'Legacy unresolved beta'];
    storeMock.getSharedBlockValue.mockImplementation(async (_projectId, label) =>
      label === 'story_locks' ? SENTINEL_LOCKS : legacy.map((q) => `- ${q}`).join('\n'),
    );
    interviewStoreMock.listInterviewProposals.mockResolvedValue(
      Array.from({ length: 80 }, (_, i) => ({
        ...adoptedLock,
        id: `p-oq-${i}`,
        field_path: 'open_questions',
        question_id: null,
        proposed_value: `Open question ${i} with enough text to overflow the two thousand character cap eventually.`,
      })),
    );
    await bank();
    const [, args] = rpcMock.mock.calls[0];
    expect(args.p_open_questions.length).toBeLessThanOrEqual(2000);
    expect(args.p_open_questions).toMatch(/more — see Meeting record/);
    // Current-round questions consume the visible budget, so at least one
    // legacy unit is absent from the block. Its ONLY durable copy must already
    // be in the immutable snapshot before the projection is bounded.
    expect(legacy.some((q) => !args.p_open_questions.includes(q))).toBe(true);
    expect(args.p_bank_snapshot.legacy_open_questions).toEqual(legacy);
  });

  it('bounds by whole question — a multi-line answer-derived question is never split mid-entry', async () => {
    // Each proposed_value spans multiple lines; the bounded render must keep or
    // drop each `- ` question as a whole unit and count dropped QUESTIONS in +N.
    interviewStoreMock.listInterviewProposals.mockResolvedValue(
      Array.from({ length: 60 }, (_, i) => ({
        ...adoptedLock,
        id: `p-oqml-${i}`,
        field_path: 'open_questions',
        question_id: null,
        proposed_value: `Open question ${i}\n  continued detail line for ${i} that adds bulk to overflow the cap`,
      })),
    );
    await bank();
    const [, args] = rpcMock.mock.calls[0];
    const oq = args.p_open_questions as string;
    expect(oq.length).toBeLessThanOrEqual(2000);
    // No orphaned continuation line: every non-bullet, non-preamble line must
    // sit directly under a kept `- ` bullet (units are never split).
    expect(oq).toMatch(/- … \(\+\d+ more — see Meeting record\)/);
  });

  it('previewBankFinal shows byte-identical values to what the bank writes (A9 parity)', async () => {
    const { previewBankFinal } = await import('../../../server/room/interview/runtime');
    const { finalValues } = await previewBankFinal({ sessionId: 's1', projectId: 'p1' });
    await bank();
    const [, args] = rpcMock.mock.calls[0];
    expect(args.p_concept_seed).toBe(finalValues.concept_seed);
    expect(args.p_locks_next).toBe(finalValues.story_locks);
    expect(args.p_open_questions).toBe(finalValues.open_questions);
  });

  it('a 20k seed banks fully — projection bounded, RPC called, no partial write path', async () => {
    interviewStoreMock.listInterviewSessions.mockResolvedValue([
      { ...readbackSession, seed_text: 'x'.repeat(20000) },
    ]);
    await bank();
    const [, args] = rpcMock.mock.calls[0];
    expect(args.p_concept_seed.length).toBeLessThanOrEqual(4000);
  });

  it('persists a NON-DEFAULT applied classification, and export reproduces it (not the default)', async () => {
    // p-lock has origin 'seed' → default mutability 'locked'. The writer banks it
    // as 'leaning'. The bank must persist that into bank_snapshot,
    // and export must read the stored map, never re-derive the 'locked' default.
    const { bankInterview, exportInterview } = await import('../../../server/room/interview/runtime');
    await bankInterview({ sessionId: 's1', projectId: 'p1', mutability: { 'p-lock': 'leaning' } });
    const [, args] = rpcMock.mock.calls[0];
    expect(args.p_bank_snapshot.applied_classifications).toEqual({ 'p-lock': 'leaning' });

    // Export side: the banked session carries the stored immutable snapshot.
    interviewStoreMock.getInterviewSession.mockResolvedValue({
      ...readbackSession,
      state: 'banked',
      bank_snapshot: {
        applied_classifications: { 'p-lock': 'leaning' },
        open_questions: [],
        legacy_open_questions: [],
      },
    });
    const exported = await exportInterview({ sessionId: 's1', projectId: 'p1' });
    // Assert MARKDOWN placement, not JSON.stringify(session), which would pass
    // merely because the snapshot contains the word "leaning".
    expect(exported.markdown).toContain('[SEED] The ending is fixed. — challenge permitted');
    expect(exported.markdown).not.toMatch(/## Locks — do not violate[\s\S]*\[SEED\] The ending is fixed\./);
  });

  it('open_questions carries prior adopted-open entries after their session is exported', async () => {
    const round1 = {
      ...readbackSession,
      id: 's0',
      state: 'exported',
      created_at: '2026-07-01T00:00:00Z',
      answers: [],
      bank_snapshot: {
        applied_classifications: { 'p-old': 'open' },
        open_questions: ['Should the sister be trusted?'],
        legacy_open_questions: [],
      },
    };
    interviewStoreMock.listInterviewSessions.mockResolvedValue([round1, readbackSession]);
    interviewStoreMock.listInterviewProposals.mockResolvedValue([]); // this round adds no new open questions
    await bank();
    const [, args] = rpcMock.mock.calls[0];
    expect(args.p_open_questions).toContain('Should the sister be trusted?');
  });

  it('first post-contract bank preserves pre-contract open_questions block content', async () => {
    storeMock.getSharedBlockValue.mockImplementation(async (_projectId, label) =>
      label === 'story_locks' ? SENTINEL_LOCKS : '- Legacy unresolved question',
    );
    await bank();
    const [, args] = rpcMock.mock.calls[0];
    expect(args.p_open_questions).toContain('Legacy unresolved question');
    expect(args.p_bank_snapshot.legacy_open_questions).toEqual(['Legacy unresolved question']);
  });

  it('gives up after 3 retryable shared-memory conflicts with a loud error', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'locks_conflict' } });
    await expect(bank()).rejects.toThrow(/shared-memory contention persisted/);
    expect(rpcMock).toHaveBeenCalledTimes(3);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/server/room/bankMeetingMemory.test.ts`
Expected: FAIL — current `bankInterview` calls `writeBlock` three times and never calls the RPC.

- [ ] **Step 3: Implement** the new `bankInterview` shown in Interfaces above. Delete the old three-`writeBlock` loop and the `conceptSeedValue` string-append. Fix the existing `tests/server/room/interviewRuntime.test.ts` bank cases to mock `rpc` instead of `writeBlock` where they exercise banking.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/server/room/bankMeetingMemory.test.ts tests/server/room/interviewRuntime.test.ts tests/server/room/interviewBanking.test.ts tests/lib/roomApi.test.ts tests/lib/useInterviewSession.test.tsx tests/components/ProjectMeetingPage.test.tsx && npm run check`
Expected: PASS / clean

- [ ] **Step 5: Commit**

```bash
git add server/room/interview/runtime.ts server/room/interview/banking.ts server/room/roomRoutes.ts client/src/lib/roomApi.ts client/src/lib/useInterviewSession.ts client/src/components/ritual/ProjectMeetingPage.tsx tests/server/room/bankMeetingMemory.test.ts tests/server/room/interviewRuntime.test.ts tests/server/room/interviewBanking.test.ts tests/lib/roomApi.test.ts tests/lib/useInterviewSession.test.tsx tests/components/ProjectMeetingPage.test.tsx
git commit -m "feat: atomic retry-safe Meeting bank with exact-value preview parity (Addendum B3/B4, A9)"
```

---

### Task 8: Surface lock sync — CAS write, section-safe cap

**Files:**
- Create: `server/room/surfaceLockSync.ts` (production CAS core — the route AND the integration suite both call this)
- Modify: `server/room/roomRoutes.ts:186-210` (story-locks route delegates)
- Test: `tests/server/room/roomRoutesStoryLocks.test.ts` (create)

**Interfaces:**
- Consumes: `mergeLockSection` (Task 2); `getSharedBlockValue` + `casUpdateSharedBlock` (Task 5).
- Produces: `syncSurfaceLocks(projectId, body): Promise<'ok' | 'conflict' | 'unavailable' | 'too_large' | 'invalid'>` — bounded CAS loop (≤3): read → merge surface section → conditioned write; on conflict re-read and re-merge. Locks are ENFORCED content (global cap policy): an over-cap merge returns `'too_large'` — declared locks are NEVER silently truncated. Writer content containing a reserved lock-section header line (`containsReservedLockHeader`, Task 2) returns `'invalid'` — it is rejected before any merge, never escaped or partially written. Route maps `'ok'`→200, `'unavailable'`→503, `'conflict'`→409, `'too_large'`→413, `'invalid'`→422.

Create `server/room/surfaceLockSync.ts`:

```typescript
// Addendum B3: the surface writer may replace only the Surface-declared
// section, and never from stale data — every write is compare-and-swap
// against the value that was read, with bounded re-read-and-merge retry.
// Locks are enforced content: over-cap merges fail visibly ('too_large');
// no writer-declared lock text is ever discarded to make a value fit.
// Extracted from the route so the real-database integration suite can drive
// the PRODUCTION retry path concurrently with a Meeting bank.

import { InvalidLockSectionsError, containsReservedLockHeader, mergeLockSection } from './lockSections';
import * as store from './store';

export async function syncSurfaceLocks(
  projectId: string,
  body: string,
): Promise<'ok' | 'conflict' | 'unavailable' | 'too_large' | 'invalid'> {
  // Reserved headers are structural: a body line equal to a section header
  // would corrupt section boundaries on the next parse. Reject, never escape.
  if (containsReservedLockHeader(body)) return 'invalid';
  for (let attempt = 1; attempt <= 3; attempt++) {
    const current = await store.getSharedBlockValue(projectId, 'story_locks');
    if (current === null) return 'unavailable';
    let merged: string;
    try {
      merged = mergeLockSection(current, 'surface', body);
    } catch (error) {
      if (error instanceof InvalidLockSectionsError) return 'invalid';
      throw error;
    }
    if (merged.length > 2000) return 'too_large';
    if (merged === current) return 'ok'; // no-op sync
    const written = await store.casUpdateSharedBlock({
      projectId, label: 'story_locks', expected: current, next: merged, updatedBy: 'writer',
    });
    if (written) return 'ok';
    // CAS lost: concurrent meeting bank landed — re-read and re-merge.
  }
  return 'conflict';
}
```

New route handler body (`roomRoutes.ts`):

```typescript
  app.post('/api/room/:projectId/blocks/story-locks', async (req, res) => {
    if (!requireRoom(res)) return;
    try {
      const body = typeof req.body?.value === 'string' ? req.body.value : '';
      const outcome = await syncSurfaceLocks(projectIdOf(req), body);
      if (outcome === 'ok') { res.json({ ok: true }); return; }
      if (outcome === 'unavailable') { res.status(503).json({ message: 'Room memory unavailable.' }); return; }
      if (outcome === 'too_large') {
        res.status(413).json({ message: 'Story locks exceed the 2,000-character block cap — shorten the lock list in the editor. Nothing was saved.' });
        return;
      }
      if (outcome === 'invalid') {
        res.status(422).json({ message: 'A lock contains a reserved section header line ("## Surface-declared locks" / "## Meeting locks") — reword it. Nothing was saved.' });
        return;
      }
      res.status(409).json({ message: 'Story locks are being updated concurrently — retry the sync.' });
    } catch (error) {
      console.error('[room.routes] story-locks failed:', error);
      res.status(500).json({ message: 'Failed to update story locks block.' });
    }
  });
```

Add import: `import { syncSurfaceLocks } from './surfaceLockSync';`

- [ ] **Step 1: Write the failing tests**

Create `tests/server/room/roomRoutesStoryLocks.test.ts` (server scaffold copied from `roomRoutesInterview.test.ts`; mock `memoryContract` with a resolved `ensureProjectMemory` so this file keeps passing after Task 9 adds guards):

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

const storeMock = vi.hoisted(() => ({
  getSharedBlockValue: vi.fn(),
  casUpdateSharedBlock: vi.fn(async () => true),
  writeBlock: vi.fn(),
  insertMessage: vi.fn(),
  listRecentMessages: vi.fn(async () => []),
  insertEvent: vi.fn(),
  listProposals: vi.fn(async () => []),
  resolveProposal: vi.fn(),
}));
vi.mock('../../../server/room/store', () => storeMock);
vi.mock('../../../server/room/supabaseClient', () => ({ isRoomConfigured: () => true }));
vi.mock('../../../server/room/scheduler', () => ({ startRoomScheduler: () => true }));
vi.mock('../../../server/room/sseHub', () => ({ addSseClient: vi.fn(), broadcast: vi.fn() }));
vi.mock('../../../server/room/memoryContract', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ensureProjectMemory: vi.fn(async () => undefined),
}));

import { registerRoomRoutes } from '../../../server/room/roomRoutes';

let server: http.Server;
let port: number;

beforeEach(async () => {
  vi.clearAllMocks();
  const app = express();
  app.use(express.json());
  registerRoomRoutes(app);
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});

afterEach(async () => {
  await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
});

const sync = (value: string) =>
  fetch(`http://127.0.0.1:${port}/api/room/p1/blocks/story-locks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ value }),
  });

describe('POST /blocks/story-locks (Addendum B3 surface sync, CAS)', () => {
  it('rewrites only the Surface-declared section via conditioned write', async () => {
    storeMock.getSharedBlockValue.mockResolvedValue(
      '## Surface-declared locks\nold\n\n## Meeting locks\n[SEED] ending fixed',
    );
    const res = await sync('- Ace lives');
    expect(res.status).toBe(200);
    const [args] = storeMock.casUpdateSharedBlock.mock.calls[0];
    expect(args.expected).toContain('old');
    expect(args.next).toContain('## Surface-declared locks\n- Ace lives');
    expect(args.next).toContain('## Meeting locks\n[SEED] ending fixed');
  });

  it('adopts legacy meeting-origin values before syncing (B6 regression)', async () => {
    storeMock.getSharedBlockValue.mockResolvedValue('[SEED] Interview answer, 2026-07-01: ending fixed');
    await sync('- bible lock');
    const [args] = storeMock.casUpdateSharedBlock.mock.calls[0];
    expect(args.next).toContain('## Meeting locks\n[SEED] Interview answer, 2026-07-01: ending fixed');
    expect(args.next).toContain('## Surface-declared locks\n- bible lock');
  });

  it('re-reads and re-merges when the CAS write loses the race', async () => {
    storeMock.getSharedBlockValue
      .mockResolvedValueOnce('## Surface-declared locks\nNone declared.\n\n## Meeting locks\nNone declared.')
      .mockResolvedValueOnce('## Surface-declared locks\nNone declared.\n\n## Meeting locks\n[SEED] banked mid-flight');
    storeMock.casUpdateSharedBlock.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const res = await sync('- Ace lives');
    expect(res.status).toBe(200);
    const [retryArgs] = storeMock.casUpdateSharedBlock.mock.calls[1];
    expect(retryArgs.next).toContain('[SEED] banked mid-flight'); // never overwritten from stale data
    expect(retryArgs.next).toContain('- Ace lives');
  });

  it('409s after 3 lost CAS attempts', async () => {
    storeMock.getSharedBlockValue.mockResolvedValue(
      '## Surface-declared locks\nNone declared.\n\n## Meeting locks\nNone declared.',
    );
    storeMock.casUpdateSharedBlock.mockResolvedValue(false);
    const res = await sync('- lock');
    expect(res.status).toBe(409);
    expect(storeMock.casUpdateSharedBlock).toHaveBeenCalledTimes(3);
  });

  it('413s on over-cap locks — declared locks are never silently truncated', async () => {
    storeMock.getSharedBlockValue.mockResolvedValue(
      '## Surface-declared locks\nNone declared.\n\n## Meeting locks\n[SEED] keep me',
    );
    const res = await sync('x'.repeat(3000));
    expect(res.status).toBe(413);
    expect(storeMock.casUpdateSharedBlock).not.toHaveBeenCalled(); // nothing written, nothing discarded
  });

  it('422s when a lock line is a reserved section header — rejected before merge, never escaped', async () => {
    const res = await sync('[world] real lock\n## Meeting locks\nsmuggled');
    expect(res.status).toBe(422);
    expect(storeMock.getSharedBlockValue).not.toHaveBeenCalled(); // rejected before any read/merge
    expect(storeMock.casUpdateSharedBlock).not.toHaveBeenCalled();
  });

  it('503s when the story_locks row is missing after init', async () => {
    storeMock.getSharedBlockValue.mockResolvedValue(null);
    const res = await sync('- anything');
    expect(res.status).toBe(503);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/server/room/roomRoutesStoryLocks.test.ts`
Expected: FAIL — current route writes raw value via `writeBlock`, no CAS.

- [ ] **Step 3: Implement** the handler shown in Interfaces above.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/server/room/roomRoutesStoryLocks.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add server/room/surfaceLockSync.ts server/room/roomRoutes.ts tests/server/room/roomRoutesStoryLocks.test.ts
git commit -m "feat: CAS surface lock sync — race-safe section writes (Addendum B3)"
```

---

### Task 9: Route guards — 503 before every mutating/turn-enabling entry point

**Files:**
- Modify: `server/room/roomRoutes.ts` (13 handlers)
- Test: `tests/server/room/roomRoutesMemoryGuard.test.ts` (create)

Guarded routes (line numbers pre-edit): stream `:42`, messages POST `:77`, events POST `:115`, story-locks `:188`, interview start `:222`, answer `:247`, skip `:274`, wrap `:283`, pause `:292`, resume `:301`, bank-preview `:322`, bank `:331`, export `:340`. NOT guarded (B4 exclusions): GET messages, GET proposals, proposal resolve, GET interview.

- [ ] **Step 1: Write the failing test**

Create `tests/server/room/roomRoutesMemoryGuard.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

const storeMock = vi.hoisted(() => ({
  getSharedBlockValue: vi.fn(async () => '## Surface-declared locks\nNone declared.\n\n## Meeting locks\nNone declared.'),
  casUpdateSharedBlock: vi.fn(async () => true),
  writeBlock: vi.fn(async () => ({ ok: true as const, nearCap: false })),
  insertMessage: vi.fn(async () => ({ id: 'm1' })),
  listRecentMessages: vi.fn(async () => []),
  insertEvent: vi.fn(async () => ({ id: 'e1' })),
  listProposals: vi.fn(async () => []),
  resolveProposal: vi.fn(async () => null),
}));
vi.mock('../../../server/room/store', () => storeMock);
vi.mock('../../../server/room/supabaseClient', () => ({ isRoomConfigured: () => true }));
vi.mock('../../../server/room/scheduler', () => ({ startRoomScheduler: () => true }));
// addSseClient must END the response — a plain vi.fn() leaves the SSE request
// hanging and the stream-guard test times out waiting for headers.
const sseMock = vi.hoisted(() => ({
  addSseClient: vi.fn((_projectId: string, res: { status: (n: number) => { end: () => void } }) => res.status(200).end()),
  broadcast: vi.fn(),
}));
vi.mock('../../../server/room/sseHub', () => sseMock);

const runtimeMock = vi.hoisted(() => ({
  getInterviewStatus: vi.fn(async () => ({ session: null })),
  startInterview: vi.fn(async () => ({ id: 's1' })),
  answerInterviewQuestion: vi.fn(async () => ({})),
  skipInterviewQuestion: vi.fn(async () => ({})),
  wrapInterview: vi.fn(async () => ({})),
  pauseInterview: vi.fn(async () => ({})),
  resumeInterview: vi.fn(async () => ({})),
  previewBank: vi.fn(async () => ({})),
  previewBankFinal: vi.fn(async () => ({ preview: {}, finalValues: {} })),
  bankInterview: vi.fn(async () => ({})),
  exportInterview: vi.fn(async () => ({})),
}));
vi.mock('../../../server/room/interview/runtime', () => runtimeMock);

const memoryMock = vi.hoisted(() => ({ ensureProjectMemory: vi.fn(async () => undefined) }));
vi.mock('../../../server/room/memoryContract', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ensureProjectMemory: memoryMock.ensureProjectMemory,
}));

import { registerRoomRoutes } from '../../../server/room/roomRoutes';

let server: http.Server;
let port: number;

beforeEach(async () => {
  vi.clearAllMocks();
  const app = express();
  app.use(express.json());
  registerRoomRoutes(app);
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});

afterEach(async () => {
  await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
});

const post = (path: string, body: object = {}) =>
  fetch(`http://127.0.0.1:${port}/api/room/p1${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const GUARDED_POSTS: Array<[string, object]> = [
  ['/memory/ensure', {}],
  ['/messages', { content: 'hi' }],
  ['/events', { kind: 'lock_changed' }],
  ['/blocks/story-locks', { value: '- lock' }],
  ['/interview/start', {}],
  ['/interview/s1/answer', { answer: 'a' }],
  ['/interview/s1/skip', {}],
  ['/interview/s1/wrap', {}],
  ['/interview/s1/pause', {}],
  ['/interview/s1/resume', {}],
  ['/interview/s1/bank-preview', {}],
  ['/interview/s1/bank', {}],
  ['/interview/s1/export', {}],
];

describe('memory guard on mutating/turn-enabling routes (Addendum B4/B5)', () => {
  it.each(GUARDED_POSTS)('initializes memory before %s', async (path, body) => {
    const res = await post(path, body);
    expect(res.status).not.toBe(503);
    expect(memoryMock.ensureProjectMemory).toHaveBeenCalledWith('p1');
  });

  it.each(GUARDED_POSTS)('returns 503 and performs no store/runtime writes when init fails: %s', async (path, body) => {
    memoryMock.ensureProjectMemory.mockRejectedValueOnce(new Error('db down'));
    const res = await post(path, body);
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ message: 'Room memory unavailable.' });
    expect(storeMock.writeBlock).not.toHaveBeenCalled();
    expect(storeMock.casUpdateSharedBlock).not.toHaveBeenCalled();
    expect(storeMock.insertMessage).not.toHaveBeenCalled();
    expect(storeMock.insertEvent).not.toHaveBeenCalled();
    expect(runtimeMock.startInterview).not.toHaveBeenCalled();
    expect(runtimeMock.bankInterview).not.toHaveBeenCalled();
  });

  it('guards the SSE stream open', async () => {
    const ok = await fetch(`http://127.0.0.1:${port}/api/room/p1/stream`);
    expect(ok.status).toBe(200);
    expect(memoryMock.ensureProjectMemory).toHaveBeenCalledWith('p1');

    memoryMock.ensureProjectMemory.mockRejectedValueOnce(new Error('db down'));
    const failed = await fetch(`http://127.0.0.1:${port}/api/room/p1/stream`);
    expect(failed.status).toBe(503);
    expect(sseMock.addSseClient).toHaveBeenCalledTimes(1); // not called on the failed open
  });

  it('does not guard read-only routes or proposal resolve (B4 exclusions)', async () => {
    await fetch(`http://127.0.0.1:${port}/api/room/p1/messages`);
    await fetch(`http://127.0.0.1:${port}/api/room/p1/proposals`);
    await fetch(`http://127.0.0.1:${port}/api/room/p1/interview`);
    await post('/proposals/x1/resolve', { status: 'rejected' });
    expect(memoryMock.ensureProjectMemory).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/server/room/roomRoutesMemoryGuard.test.ts`
Expected: FAIL — `ensureProjectMemory` never called.

- [ ] **Step 3: Add the guard helper and wire all 14 routes**

In `server/room/roomRoutes.ts`, add near `requireRoom`:

```typescript
import { ensureProjectMemory } from './memoryContract';

// Addendum B4/B5: initialize shared memory before any entry point that can
// mutate room state or enable an agent turn. On failure the action fails
// loudly — agents must never run against uninitialized memory.
async function ensureMemoryOr503(req: Request, res: Response): Promise<boolean> {
  try {
    await ensureProjectMemory(projectIdOf(req));
    return true;
  } catch (error) {
    console.error('[room.routes] ensureProjectMemory failed:', error);
    res.status(503).json({ message: 'Room memory unavailable.' });
    return false;
  }
}
```

Add an idempotent recovery probe used only by client Retry:

```typescript
app.post('/api/room/:projectId/memory/ensure', async (req, res) => {
  if (!requireRoom(res)) return;
  if (!(await ensureMemoryOr503(req, res))) return;
  res.json({ ok: true });
});
```

Insert `if (!(await ensureMemoryOr503(req, res))) return;` immediately after `if (!requireRoom(res)) return;` in every other guarded handler. The stream handler becomes async:

```typescript
  app.get('/api/room/:projectId/stream', async (req, res) => {
    if (!requireRoom(res)) return;
    if (!(await ensureMemoryOr503(req, res))) return;
    addSseClient(projectIdOf(req), res);
  });
```

Add the same `vi.mock('../../../server/room/memoryContract', …)` resolved-mock block to `tests/server/room/roomRoutesInterview.test.ts` and `tests/server/room/roomRoutesResolve.test.ts` (they don't mock it and would otherwise hit the real wrapper).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/server/room/roomRoutesMemoryGuard.test.ts tests/server/room/roomRoutesInterview.test.ts tests/server/room/roomRoutesResolve.test.ts tests/server/room/roomRoutesStoryLocks.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/room/roomRoutes.ts tests/server/room/roomRoutesMemoryGuard.test.ts tests/server/room/roomRoutesInterview.test.ts tests/server/room/roomRoutesResolve.test.ts
git commit -m "feat: memory guard on all mutating room entry points, 503 on failure (Addendum B4/B5)"
```

---

### Task 10: Turn-boundary invariant — verify contract immediately before model execution (BOTH model paths)

**Files:**
- Modify: `server/room/runRoomTurn.ts` (top of the turn function, before context assembly)
- Modify: `server/room/digest.ts` (top of `runCaseyDigest`, before `sendStreamingMessage`)
- Modify: `server/room/store.ts` (explicit event requeue mutation)
- Modify: `server/room/scheduler.ts` (failure handling with per-speaker completion)
- Test: `tests/server/room/runRoomTurnMemoryGuard.test.ts` (create), `tests/server/room/digest.test.ts`, `tests/server/room/scheduler.test.ts` (extend)

**Why:** route guards don't cover queued events already in `room_events`, scheduler `idle_tick`s, or future internal callers. And there are TWO model paths: the scheduler dispatches `mode: 'digest'` work directly to `runCaseyDigest` (`scheduler.ts:41`), which calls `sendStreamingMessage` without ever entering `runRoomTurn` (`digest.ts:36`). Guarding only `runRoomTurn` leaves the digest running against uninitialized memory.

- [ ] **Step 1: Write the failing test**

Create `tests/server/room/runRoomTurnMemoryGuard.test.ts`. Read `tests/server/room/runRoomTurn.test.ts` first and copy its existing mock scaffold for `openaiService`/`runAgent`, `store`, `sseHub`; then add:

```typescript
// Added mocks on top of the copied runRoomTurn.test.ts scaffold:
const memoryMock = vi.hoisted(() => ({ ensureProjectMemory: vi.fn(async () => undefined) }));
vi.mock('../../../server/room/memoryContract', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ensureProjectMemory: memoryMock.ensureProjectMemory,
}));

describe('runRoomTurn memory invariant (Addendum B4 turn boundary)', () => {
  it('verifies the contract before building the prompt', async () => {
    await runTurnWithScaffoldDefaults(); // the file's existing happy-path helper
    expect(memoryMock.ensureProjectMemory).toHaveBeenCalledWith('p1');
  });

  it('runs NO agent turn when verification fails', async () => {
    memoryMock.ensureProjectMemory.mockRejectedValueOnce(new Error('db down'));
    await expect(runTurnWithScaffoldDefaults()).rejects.toThrow(/memory/i);
    // the scaffold's runAgent/sendToolTurn mock must not have been called:
    expect(runAgentMock).not.toHaveBeenCalled();
  });
});
```

(Exact helper/mock names come from the existing `runRoomTurn.test.ts` — align identifiers when copying; the two assertions are the requirement.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/server/room/runRoomTurnMemoryGuard.test.ts`
Expected: FAIL — `ensureProjectMemory` not called.

- [ ] **Step 3: Implement the runtime guard**

In `server/room/runRoomTurn.ts`, as the FIRST await inside the turn function (before the `Promise.all` context assembly):

```typescript
  // Addendum B4 turn boundary: the last gate before the model runs. Covers
  // queued events, scheduler ticks, and internal callers that bypass routes.
  await ensureProjectMemory(projectId);
```

(import `ensureProjectMemory` from `./memoryContract`). Combined with the Task 5 `locksText === null` throw and `ensureProjectMemory`'s 4-block/28-attachment verification, a failed contract can never reach `runAgent`.

**Keep the EXISTING `runRoomTurn.test.ts` green:** that file mocks `store`/`sseHub`/`lockGate`/`anthropicToolClient` but NOT `memoryContract` — the new first-await guard will call the real `ensureProjectMemory` and break every case. Mirroring Task 9's L180 pattern, add the resolved mock to the existing file:

```typescript
const memoryMock = vi.hoisted(() => ({ ensureProjectMemory: vi.fn(async () => undefined) }));
vi.mock('../../../server/room/memoryContract', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ensureProjectMemory: memoryMock.ensureProjectMemory,
}));
```

Stage the updated `tests/server/room/runRoomTurn.test.ts` in this task's commit.

In `server/room/digest.ts`, add the same guard as the FIRST await inside `runCaseyDigest`, before any block reads or the `sendStreamingMessage` call:

```typescript
  // Addendum B4 turn boundary — the digest is a model turn too; it must not
  // run against uninitialized memory even though it bypasses runRoomTurn.
  await ensureProjectMemory(projectId);
```

**And fix the digest's memory-blindness:** the digest currently reads only private blocks + channel (`digest.ts:24-27`) — blocks exist, attachments exist, and the digest still can't see them, which defeats the whole contract for this model path. Add shared blocks to the parallel reads:

```typescript
    const [privateBlocks, sharedBlocks, channel] = await Promise.all([
      store.getPrivateBlocks(projectId, CASEY_ID),
      store.getSharedBlocksForAgent(projectId, CASEY_ID),
      store.listRecentMessages(projectId, 50),
    ]);
```

and render them into the digest's user content, before the channel history:

```typescript
    const sharedContext = sharedBlocks
      .map((b) => `SHARED ${b.label}:\n${b.value}`)
      .join('\n\n');
```

```typescript
          content:
            `${sharedContext ? `SHARED MEMORY (room blackboard):\n\n${sharedContext}\n\n` : ''}` +
            `CURRENT lane_notes:\n${laneNotes || '(empty)'}\n\n` +
            `CURRENT writer_rapport:\n${rapport || '(empty)'}\n\n` +
            `CHANNEL HISTORY (oldest first):\n${transcript || '(empty)'}`,
```

Extend `tests/server/room/digest.test.ts` (reuse its existing mocks) with:
- `ensureProjectMemory` rejected → `sendStreamingMessage` never called, error propagates.
- shared blocks returned by the store mock (banked `concept_seed` content + `story_locks` with a `[SEED]` line) → both strings appear in the `sendStreamingMessage` call's user content.

Add `store.requeueRoomEvent(eventId, payload)`: update that row's payload and
set `processed_at = null`; throw on database failure. Scheduler is a single
worker, so no competing claim mutation exists inside this process. The caller
MUST merge retry metadata into the original payload; replacing the payload
would erase wake inputs such as `content` and `characterNames`.

In `server/room/scheduler.ts`, use **bounded requeue with per-speaker
completion**, not whole-event replay. Event payload carries:

```typescript
memoryRetries?: number;
memoryCompletedSpeakers?: string[]; // stable keys: `${mode}:${agentId}`
```

Before dispatch, skip speaker keys already completed. After each successful
speaker, add its key to the in-memory set. On `RoomMemoryError`, stop processing
that event. If `memoryRetries < 3`, preserve the original payload and merge in
the incremented retry state exactly as follows, then break; retry runs only
remaining speakers:

```typescript
await store.requeueRoomEvent(event.id, {
  ...event.payload,
  memoryRetries: retries + 1,
  memoryCompletedSpeakers: [...completed],
});
```

At limit, log and leave event consumed. Any other error keeps existing
claimed-and-logged behavior and may continue to next speaker. This prevents a
successful first speaker from running twice when a later speaker fails.

Verified severity: the writer's message itself is durable in `room_messages` — the `room_events` row is only a wake trigger — so the bounded requeue recovers the *dropped agent wake*, and no writer content is ever lost.

Add to `tests/server/room/scheduler.test.ts`: first speaker succeeds and second
throws `RoomMemoryError` → requeue payload records first speaker complete AND
retains the original `content` and `characterNames`; reclaimed event skips first
and retries only second. Also test failure before any success, max retries
consumed, and `requeueRoomEvent` database failure.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/server/room/runRoomTurnMemoryGuard.test.ts tests/server/room/runRoomTurn.test.ts tests/server/room/digest.test.ts tests/server/room/scheduler.test.ts tests/server/room/wakeRules.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/room/runRoomTurn.ts server/room/digest.ts server/room/store.ts server/room/scheduler.ts tests/server/room/runRoomTurnMemoryGuard.test.ts tests/server/room/runRoomTurn.test.ts tests/server/room/digest.test.ts tests/server/room/scheduler.test.ts
git commit -m "feat: turn-boundary memory invariant on BOTH model paths — room turns and Casey digest (Addendum B4)"
```

---

### Task 11: Client failure behavior — 503 is visible, actionable, and recoverable

**Files:**
- Modify: `client/src/lib/roomApi.ts` (`openRoomStream`, `syncStoryLocksBlock`, `postRoomEvent`; add `isRoomMemoryUnavailable`)
- Modify: `client/src/components/room/RoomChannel.tsx`
- Test: `tests/lib/roomApi.test.ts` (extend), `tests/components/RoomChannelMemoryError.test.tsx` (create)

**Current holes (verified):** `syncStoryLocksBlock` swallows failures to `console.error` (`roomApi.ts:261-273`); `postRoomEvent` swallows everything (`roomApi.ts:145-152`); `openRoomStream` has no error handler (`roomApi.ts:277-290`); RoomChannel has an `error` line but nothing disables the composer and nothing distinguishes memory-unavailable.

- [ ] **Step 1: Write the failing tests**

Extend `tests/lib/roomApi.test.ts` (follow its existing fetch-stub pattern):

```typescript
import { ensureRoomMemory, isRoomMemoryUnavailable, postRoomEvent, syncStoryLocksBlock } from '../../client/src/lib/roomApi'

describe('room memory failure surfacing', () => {
  it('isRoomMemoryUnavailable recognizes ONLY the 503 memory-contract error', () => {
    expect(isRoomMemoryUnavailable(new Error('room api 503: {"message":"Room memory unavailable."}'))).toBe(true)
    expect(isRoomMemoryUnavailable(new Error('room api 500: boom'))).toBe(false)
    expect(isRoomMemoryUnavailable(new Error('room api 503: {"message":"Writers Room is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing)."}'))).toBe(false)
    expect(isRoomMemoryUnavailable(new TypeError('Failed to fetch'))).toBe(false) // network != memory
  })

  it('syncStoryLocksBlock preserves failure TYPE — memory 503 vs everything else', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"message":"Room memory unavailable."}', { status: 503 })))
    await expect(syncStoryLocksBlock('p1', '- lock')).resolves.toEqual({ outcome: 'memory_unavailable' })

    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"message":"Story locks exceed the 2,000-character block cap — shorten the lock list in the editor. Nothing was saved."}', { status: 413 })))
    await expect(syncStoryLocksBlock('p1', '- lock')).resolves.toEqual({
      outcome: 'failed',
      status: 413,
      message: expect.stringContaining('2,000-character'),
    })

    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })))
    await expect(syncStoryLocksBlock('p1', '- lock')).resolves.toEqual({ outcome: 'ok' })
  })

  it('postRoomEvent reports outcome instead of swallowing, and distinguishes memory 503', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"message":"Room memory unavailable."}', { status: 503 })))
    await expect(postRoomEvent('p1', 'session_opened', {})).resolves.toEqual({ outcome: 'memory_unavailable' })

    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    await expect(postRoomEvent('p1', 'session_opened', {})).resolves.toEqual({ outcome: 'failed' })
  })

  it('ensureRoomMemory uses the dedicated guarded recovery endpoint', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(ensureRoomMemory('p1')).resolves.toEqual({ outcome: 'ok' })
    expect(String(fetchMock.mock.calls[0][0])).toContain('/memory/ensure')
  })
})
```

Create `tests/components/RoomChannelMemoryError.test.tsx` (follow the render harness used by the other `tests/components/App*.test.tsx` files):

```tsx
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { RoomChannel } from '../../client/src/components/room/RoomChannel'

function fetchRespondingWith(status: number) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/api/room/')) {
      return new Response(JSON.stringify({ message: 'Room memory unavailable.' }), { status })
    }
    return new Response('{}', { status: 200 })
  })
}

const props = {
  projectId: 'p1',
  characterNames: [],
  locksText: '',
  onAdoptProposal: () => true,
}

describe('RoomChannel memory-unavailable behavior', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('shows an actionable inline error and disables the composer on 503', async () => {
    vi.stubGlobal('fetch', fetchRespondingWith(503))
    render(<RoomChannel {...props} />)
    await waitFor(() => expect(screen.getByText(/room memory unavailable/i)).toBeInTheDocument())
    expect(screen.getByRole('textbox')).toBeDisabled()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('retry after recovery clears the error and re-enables the composer', async () => {
    const failing = fetchRespondingWith(503)
    vi.stubGlobal('fetch', failing)
    render(<RoomChannel {...props} />)
    await waitFor(() => expect(screen.getByText(/room memory unavailable/i)).toBeInTheDocument())

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/memory/ensure')) return new Response('{"ok":true}', { status: 200 })
      if (url.includes('/messages')) return new Response(JSON.stringify({ messages: [] }), { status: 200 })
      if (url.includes('/proposals')) return new Response(JSON.stringify({ proposals: [] }), { status: 200 })
      return new Response('{}', { status: 200 })
    }))
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    await waitFor(() => expect(screen.queryByText(/room memory unavailable/i)).not.toBeInTheDocument())
    expect(screen.getByRole('textbox')).not.toBeDisabled()
  })

  it('does NOT close the room for non-memory failures (500 shows an error, composer stays open)', async () => {
    vi.stubGlobal('fetch', fetchRespondingWith(500))
    render(<RoomChannel {...props} />)
    await waitFor(() => expect(screen.getByText(/room api 500/i)).toBeInTheDocument())
    expect(screen.getByRole('textbox')).not.toBeDisabled()
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument()
  })

  it('a failed retry (server still 503) leaves the composer closed and the banner up', async () => {
    vi.stubGlobal('fetch', fetchRespondingWith(503))
    render(<RoomChannel {...props} />)
    await waitFor(() => expect(screen.getByText(/room memory unavailable/i)).toBeInTheDocument())
    // Dedicated guarded probe still returns 503, so read-only load success can
    // never reopen the room prematurely.
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    await waitFor(() => expect(screen.getByText(/room memory unavailable/i)).toBeInTheDocument())
    expect(screen.getByRole('textbox')).toBeDisabled()
  })

  it('surfaces a generic error for a message-less network failure (never silent)', async () => {
    // A fire-and-forget mutation throws with no message → { outcome: 'failed' }
    // with no message. The composer stays open but the writer must SEE something.
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/messages')) return new Response(JSON.stringify({ messages: [] }), { status: 200 })
      if (url.includes('/proposals')) return new Response(JSON.stringify({ proposals: [] }), { status: 200 })
      if (url.includes('/story-locks') || url.includes('/events')) throw new TypeError('Failed to fetch')
      return new Response('{}', { status: 200 })
    }))
    render(<RoomChannel {...props} />)
    await waitFor(() => expect(screen.getByText(/couldn't reach the room/i)).toBeInTheDocument())
    expect(screen.getByRole('textbox')).not.toBeDisabled() // composer stays open
  })
})
```

(If `RoomChannel`'s composer is not a `textbox` role or the send box uses a different element, align the queries with the actual markup — the behavioral requirements are: visible error text, disabled composer, working Retry.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/roomApi.test.ts tests/components/RoomChannelMemoryError.test.tsx`
Expected: FAIL — `isRoomMemoryUnavailable` not exported; no banner/retry/disable behavior.

- [ ] **Step 3: Implement roomApi changes**

In `client/src/lib/roomApi.ts`:

```typescript
export function isRoomMemoryUnavailable(err: unknown): boolean {
  return err instanceof Error && err.message.includes('room api 503') && err.message.includes('Room memory unavailable')
}

// Failure TYPE is preserved — the room closes ONLY for a confirmed memory
// 503. Everything else (413 cap, 409 contention, 500, network) surfaces as an
// ordinary visible error without closing the composer.
export type RoomMutationResult =
  | { outcome: 'ok' }
  | { outcome: 'memory_unavailable' }
  | { outcome: 'failed'; status?: number; message?: string }

async function classifyFailure(res: Response): Promise<RoomMutationResult> {
  const text = await res.text().catch(() => '')
  if (res.status === 503 && text.includes('Room memory unavailable')) return { outcome: 'memory_unavailable' }
  let message: string | undefined
  try { message = (JSON.parse(text) as { message?: string }).message } catch { message = text.slice(0, 160) || undefined }
  return { outcome: 'failed', status: res.status, message }
}

// Dedicated idempotent recovery probe. Read-only room loads are intentionally
// unguarded, so they cannot prove memory recovered.
export async function ensureRoomMemory(projectId: string): Promise<RoomMutationResult> {
  try {
    const res = await fetch(`/api/room/${encodeURIComponent(projectId)}/memory/ensure`, {
      method: 'POST',
    })
    return res.ok ? { outcome: 'ok' } : await classifyFailure(res)
  } catch {
    return { outcome: 'failed', message: "Couldn't reach the room." }
  }
}

// was: swallowed to console — now reports a typed outcome so callers can act
export async function syncStoryLocksBlock(projectId: string, locksText: string): Promise<RoomMutationResult> {
  try {
    const res = await fetch(`/api/room/${encodeURIComponent(projectId)}/blocks/story-locks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: locksText }),
    })
    if (!res.ok) {
      const result = await classifyFailure(res)
      console.error(`[roomApi] story-locks sync failed: ${res.status}`)
      return result
    }
    return { outcome: 'ok' }
  } catch (err) {
    console.error('[roomApi] story-locks sync failed:', err)
    return { outcome: 'failed' } // network — NOT a memory-contract failure
  }
}

export async function postRoomEvent(
  projectId: string,
  kind: 'doc_field_changed' | 'lock_changed' | 'session_opened',
  payload: Record<string, unknown>,
): Promise<RoomMutationResult> {
  try {
    const res = await fetch(`/api/room/${encodeURIComponent(projectId)}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, payload }),
    })
    return res.ok ? { outcome: 'ok' } : await classifyFailure(res)
  } catch {
    return { outcome: 'failed' } // ambient enrichment must never break the save path — but callers can now SEE the failure
  }
}

export function openRoomStream(
  projectId: string,
  onEvent: (event: RoomStreamEvent) => void,
  onConnectionError?: () => void, // connection signal — NOT a memory verdict (EventSource exposes no status)
): () => void {
  if (typeof EventSource === 'undefined') return () => {}
  const source = new EventSource(`/api/room/${encodeURIComponent(projectId)}/stream`)
  source.onmessage = (raw) => {
    try {
      onEvent(JSON.parse(raw.data) as RoomStreamEvent)
    } catch {
      // malformed frame — skip
    }
  }
  source.onerror = () => onConnectionError?.()
  return () => source.close()
}
```

`isRoomMemoryUnavailable(err)` (shown above) tightens to require BOTH the 503 status and the `Room memory unavailable` message in the error text — a configured-off room 503, a 500, or a network `TypeError` must all return false.

- [ ] **Step 4: Implement RoomChannel behavior**

In `client/src/components/room/RoomChannel.tsx` — the room closes ONLY for a confirmed memory 503; every other failure stays a visible, non-blocking error:
- Add state `const [memoryDown, setMemoryDown] = useState(false)` and `const [streamDown, setStreamDown] = useState(false)`.
- Extract initial read-only loads into `loadRoom()`, but do NOT use them as the
  recovery verdict: those routes intentionally bypass initialization. Add
  `retryMemory()` that awaits `ensureRoomMemory(projectId)` first. Only an `ok`
  result may run `loadRoom()` and then clear `memoryDown`. A
  `memory_unavailable` or ordinary failure leaves the composer closed and shows
  its message. Track `memoryRetrying` to prevent double clicks.
- Pass `() => setStreamDown(true)` as `openRoomStream`'s `onConnectionError` (EventSource gives no status — a dropped stream is a connection problem, NOT a memory verdict). Clear it on the next received event. Render `streamDown` as a small non-blocking "Live updates disconnected — reconnecting…" notice; do NOT disable the composer for it.
- The two fire-and-forget calls become outcome-checked:

```tsx
const handleMutationResult = (r: RoomMutationResult) => {
  if (r.outcome === 'memory_unavailable') setMemoryDown(true)
  else if (r.outcome === 'failed' && r.message) setError(r.message) // e.g. the 413 lock-cap message — visible, composer stays open
  else if (r.outcome === 'failed') setError("Couldn't reach the room — retrying may help.") // message-less network throw (syncStoryLocksBlock/postRoomEvent) — never silent
}
void syncStoryLocksBlock(projectId, locksText).then(handleMutationResult)
void postRoomEvent(projectId, 'session_opened', {}).then(handleMutationResult)
```

- In `handleSend`'s catch: `if (isRoomMemoryUnavailable(err)) setMemoryDown(true)` (existing `setError` keeps handling everything else).
- Render, above the composer, when `memoryDown`:

```tsx
{memoryDown && (
  <div role="alert" style={styles.error}>
    <p>Room memory unavailable — the room is closed until it recovers. Your work outside the room is unaffected.</p>
    <button
      disabled={memoryRetrying}
      onClick={() => void retryMemory()}
    >
      {memoryRetrying ? 'Retrying…' : 'Retry'}
    </button>
  </div>
)}
```

- Disable the composer input and send button with `disabled={memoryDown}` — and ONLY for `memoryDown`.

**Existing RoomChannel tests render the modified component:** `tests/components/RoomChannelAdopt.test.tsx` and `tests/components/RoomChannelProjectMeeting.test.tsx` both mount `RoomChannel` and will exercise the new `loadRoom`/`handleMutationResult`/`memoryDown` wiring. Run them; if the new props or handlers break their mocks (e.g. missing `/story-locks` or `/events` fetch stubs), update the mocks and stage the changed files in this task's commit.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/lib/roomApi.test.ts tests/components/RoomChannelMemoryError.test.tsx tests/components/RoomChannelAdopt.test.tsx tests/components/RoomChannelProjectMeeting.test.tsx && npm run check`
Expected: PASS / clean

- [ ] **Step 6: Commit**

```bash
git add client/src/lib/roomApi.ts client/src/components/room/RoomChannel.tsx tests/lib/roomApi.test.ts tests/components/RoomChannelMemoryError.test.tsx
# also stage any sibling RoomChannel tests updated to keep passing:
git add tests/components/RoomChannelAdopt.test.tsx tests/components/RoomChannelProjectMeeting.test.tsx
git commit -m "feat: room memory 503 is visible, composer-closing, and retryable in the client (Addendum B5)"
```

---

### Task 12: Real-database integration suite (env-gated)

**Files:**
- Create: `tests/integration/sharedMemoryContract.integration.test.ts`

**Runs against a real Supabase project** (the dev project — service-role env from `.env`). Env-gated so CI/local runs without creds skip it cleanly; it is REQUIRED to pass before Task 13's deploy. Every test uses throwaway project ids (`itest-mem-<random>`), and cleanup deletes them in `afterAll`.

- [ ] **Step 0: Apply the migration to the dev database + smoke-test it (BEFORE anything else in this task)**

The Task 3 migration must exist in the dev database before the suite can run — this is the one and only migration-apply step in the plan (Task 13 verifies it happened; it does not re-apply).

0. **Review gate (before applying):** the migration SQL is human/AI-reviewed before it touches the shared dev database. Read the full `20260712000001_shared_memory_contract_fns.sql` (Ben or an explicit review pass) and confirm the predicates, both CAS paths (project revision + lock value), over-cap warning, and classification-persistence are correct. Once applied, the migration is immutable — any correction ships as a NEW forward migration, never an edit to this one.
1. Apply `20260712000001_shared_memory_contract_fns.sql` via Supabase MCP `apply_migration` (name `shared_memory_contract_fns`) ONLY after the review gate. Additive and unused by deployed code — safe pre-deploy.
2. Smoke-test with throwaway data via `execute_sql` ("function exists" is NOT adequate):

```sql
-- create + verify (roster uses RUNTIME ids — writingPartner, not morgan)
select ensure_project_memory('smoke-mem-1', array['writingPartner','sam','casey','oliver','maya','zoe','alex'],
  '[{"label":"concept_seed","cap":4000,"sentinel":"No concept seed banked yet. Offer the Project Meeting."},
    {"label":"story_locks","cap":2000,"sentinel":"## Surface-declared locks\nNone declared.\n\n## Meeting locks\nNone declared."},
    {"label":"open_questions","cap":2000,"sentinel":"Nothing delegated — writer holds all intent."},
    {"label":"project_state","cap":2000,"sentinel":"No project state recorded yet."}]'::jsonb);
-- idempotent repeat: the SAME full call, executed a second time
select ensure_project_memory('smoke-mem-1', array['writingPartner','sam','casey','oliver','maya','zoe','alex'],
  '[{"label":"concept_seed","cap":4000,"sentinel":"No concept seed banked yet. Offer the Project Meeting."},
    {"label":"story_locks","cap":2000,"sentinel":"## Surface-declared locks\nNone declared.\n\n## Meeting locks\nNone declared."},
    {"label":"open_questions","cap":2000,"sentinel":"Nothing delegated — writer holds all intent."},
    {"label":"project_state","cap":2000,"sentinel":"No project state recorded yet."}]'::jsonb);
-- then assert: expect exactly 4 and 28
select count(*) from memory_blocks where project_id = 'smoke-mem-1' and agent_id is null;
select count(*) from block_attachments ba join memory_blocks mb on mb.id = ba.block_id where mb.project_id = 'smoke-mem-1';
select revision from memory_blocks where project_id = 'smoke-mem-1' and agent_id is null and label = 'concept_seed';
-- cleanup (attachments cascade)
delete from memory_blocks where project_id = 'smoke-mem-1';
```

Both counts must be exactly 4 and 28 after the repeat call, and the untouched
`concept_seed` revision must be `0`. Only proceed to Step 1 when this passes.

- [ ] **Step 1: Write the suite**

Create `tests/integration/sharedMemoryContract.integration.test.ts`:

```typescript
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ROOM_AGENT_IDS, SHARED_BLOCK_CONTRACT } from '../../server/room/memoryContract';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const enabled = Boolean(url && key);

const P_BLOCKS = SHARED_BLOCK_CONTRACT.map((b) => ({ label: b.label, cap: b.cap, sentinel: b.sentinel }));
const projectIds: string[] = [];
function freshProject(): string {
  const id = `itest-mem-${Math.random().toString(36).slice(2, 10)}`;
  projectIds.push(id);
  return id;
}

let db: SupabaseClient;

describe.skipIf(!enabled)('shared memory contract — real database', () => {
  beforeAll(() => {
    db = createClient(url!, key!);
  });

  afterAll(async () => {
    // FK order matters: proposals.session_id references interview_sessions
    // with NO cascade (20260708000001:29) — proposals must go first.
    // block_attachments cascade from memory_blocks. Cleanup failures are
    // ERRORS, not ignorable — leaked itest rows poison later runs.
    for (const table of ['proposals', 'room_events', 'room_messages', 'interview_sessions', 'memory_blocks']) {
      const res = await db.from(table).delete().in('project_id', projectIds);
      if (res.error) throw new Error(`integration cleanup failed for ${table}: ${res.error.message}`);
    }
  });

  async function ensure(projectId: string) {
    const res = await db.rpc('ensure_project_memory', {
      p_project_id: projectId,
      p_agent_ids: ROOM_AGENT_IDS,
      p_blocks: P_BLOCKS,
    });
    expect(res.error).toBeNull();
  }

  async function contractState(projectId: string) {
    const res = await db
      .from('memory_blocks')
      .select('label, value, block_attachments(agent_id)')
      .eq('project_id', projectId)
      .is('agent_id', null);
    expect(res.error).toBeNull();
    const rows = res.data as Array<{ label: string; value: string; block_attachments: Array<{ agent_id: string }> }>;
    return {
      rows,
      attachmentCount: rows.reduce((n, r) => n + r.block_attachments.length, 0),
    };
  }

  it('creates exactly four blocks and 28 attachments; double + concurrent calls stay at 4/28', async () => {
    const p = freshProject();
    await ensure(p);
    await ensure(p); // idempotent double-call
    await Promise.all([ensure(p), ensure(p), ensure(p)]); // concurrent
    const { rows, attachmentCount } = await contractState(p);
    expect(rows).toHaveLength(4);
    expect(attachmentCount).toBe(28);
    for (const b of SHARED_BLOCK_CONTRACT) {
      expect(rows.find((r) => r.label === b.label)?.value).toBe(b.sentinel);
    }
  });

  it('preserves existing non-blank content and repairs blank legacy rows', async () => {
    const p = freshProject();
    await db.from('memory_blocks').insert([
      { project_id: p, agent_id: null, label: 'concept_seed', value: 'real writer content', char_cap: 4000 },
      { project_id: p, agent_id: null, label: 'story_locks', value: '   ', char_cap: 2000 }, // blank legacy row
    ]);
    await ensure(p);
    const { rows, attachmentCount } = await contractState(p);
    expect(rows.find((r) => r.label === 'concept_seed')?.value).toBe('real writer content'); // untouched
    expect(rows.find((r) => r.label === 'story_locks')?.value).toBe(
      SHARED_BLOCK_CONTRACT.find((b) => b.label === 'story_locks')!.sentinel,
    ); // repaired
    expect(attachmentCount).toBe(28);
  });

  it('bank_meeting_memory: banks atomically, retries idempotently, rolls back on locks conflict', async () => {
    const p = freshProject();
    await ensure(p);
    const session = await db
      .from('interview_sessions')
      .insert({ project_id: p, mode: 'full', state: 'readback', seed_text: 'integration seed' })
      .select()
      .single();
    expect(session.error).toBeNull();
    const sid = (session.data as { id: string }).id;
    const sentinel = SHARED_BLOCK_CONTRACT.find((b) => b.label === 'story_locks')!.sentinel;
    const locksNext = '## Surface-declared locks\nNone declared.\n\n## Meeting locks\n[SEED] integration lock';

    // Stale expected value -> locks_conflict -> FULL rollback (state stays readback)
    const conflicted = await db.rpc('bank_meeting_memory', {
      p_project_id: p, p_session_id: sid,
      p_bank_revision: 0,
      p_concept_seed: 'projected seed', p_locks_expected: 'STALE', p_locks_next: locksNext,
      p_open_questions: 'Nothing delegated — writer holds all intent.',
      p_bank_snapshot: { applied_classifications: {}, open_questions: [], legacy_open_questions: [] },
    });
    expect(conflicted.error?.message).toContain('locks_conflict');
    const afterConflict = await db.from('interview_sessions').select('state').eq('id', sid).single();
    expect((afterConflict.data as { state: string }).state).toBe('readback'); // rollback proven
    const seedAfterConflict = await db.from('memory_blocks').select('value, revision').eq('project_id', p).is('agent_id', null).eq('label', 'concept_seed').single();
    expect((seedAfterConflict.data as { value: string }).value).not.toBe('projected seed'); // no partial write
    expect((seedAfterConflict.data as { revision: number }).revision).toBe(0); // revision CAS also rolled back

    // Correct expected value -> banked
    const banked = await db.rpc('bank_meeting_memory', {
      p_project_id: p, p_session_id: sid,
      p_bank_revision: 0,
      p_concept_seed: 'projected seed', p_locks_expected: sentinel, p_locks_next: locksNext,
      p_open_questions: 'Nothing delegated — writer holds all intent.',
      p_bank_snapshot: { applied_classifications: {}, open_questions: [], legacy_open_questions: [] },
    });
    expect(banked.error).toBeNull();
    expect(banked.data).toBe('banked');

    // Retry after success -> already_banked, nothing duplicated
    const retried = await db.rpc('bank_meeting_memory', {
      p_project_id: p, p_session_id: sid,
      p_bank_revision: 0, // ignored because the session is already terminal
      p_concept_seed: 'projected seed AGAIN', p_locks_expected: locksNext, p_locks_next: locksNext + '\n[SEED] dupe',
      p_open_questions: 'x',
      p_bank_snapshot: { applied_classifications: { fake: 'open' }, open_questions: ['x'], legacy_open_questions: [] },
    });
    expect(retried.data).toBe('already_banked');
    const finalSeed = await db.from('memory_blocks').select('value, revision').eq('project_id', p).is('agent_id', null).eq('label', 'concept_seed').single();
    expect((finalSeed.data as { value: string }).value).toBe('projected seed'); // retry wrote nothing
    expect((finalSeed.data as { revision: number }).revision).toBe(1);
  });

  it('concurrent PRODUCTION surface sync and Meeting bank both succeed and BOTH sections survive', async () => {
    const p = freshProject();
    await ensure(p);
    const { __setRoomDbForTests } = await import('../../server/room/supabaseClient');
    __setRoomDbForTests(db); // production modules with their real retry loops
    try {
      const session = await db
        .from('interview_sessions')
        .insert({ project_id: p, mode: 'full', state: 'readback', seed_text: 'race seed' })
        .select()
        .single();
      const sid = (session.data as { id: string }).id;
      await db.from('proposals').insert({
        project_id: p, agent_id: 'writingPartner', surface: 'memory', field_path: 'story_locks',
        proposed_value: 'The ending is fixed.', rationale: 'itest', status: 'adopted',
        kind: 'interview_answer', session_id: sid, question_id: 'morgan-locks', origin: 'seed',
      });

      const { syncSurfaceLocks } = await import('../../server/room/surfaceLockSync');
      const { bankInterview } = await import('../../server/room/interview/runtime');

      // Fire both writers at once. Whoever loses the CAS retries with a fresh
      // read — the production paths, not test re-implementations.
      const [surfaceOutcome, bankResult] = await Promise.all([
        syncSurfaceLocks(p, '- surface lock'),
        bankInterview({ sessionId: sid, projectId: p }),
      ]);
      expect(surfaceOutcome).toBe('ok');
      expect(bankResult.session.state).toBe('banked');

      // The real claim: both writers landed and NEITHER section was clobbered.
      const final = await db
        .from('memory_blocks').select('value')
        .eq('project_id', p).is('agent_id', null).eq('label', 'story_locks').single();
      const v = (final.data as { value: string }).value;
      expect(v).toContain('- surface lock');
      expect(v).toContain('[SEED] The ending is fixed.');
    } finally {
      __setRoomDbForTests(null);
    }
  });

  it('banks a Meeting through the PRODUCTION path and the banked content reaches real prompt assembly', async () => {
    const p = freshProject();
    await ensure(p);
    const { __setRoomDbForTests } = await import('../../server/room/supabaseClient');
    __setRoomDbForTests(db); // production modules, real database
    try {
      // Real session + adopted interview proposal (proposals table carries
      // interview proposals via kind/session_id — see 20260708000001).
      const session = await db
        .from('interview_sessions')
        .insert({ project_id: p, mode: 'full', state: 'readback', seed_text: 'production-path seed' })
        .select()
        .single();
      const sid = (session.data as { id: string }).id;
      await db.from('proposals').insert({
        project_id: p, agent_id: 'morgan', surface: 'memory', field_path: 'story_locks',
        proposed_value: 'The ending is fixed.', rationale: 'itest', status: 'adopted',
        kind: 'interview_answer', session_id: sid, question_id: 'morgan-locks', origin: 'seed',
      });

      const { bankInterview } = await import('../../server/room/interview/runtime');
      const result = await bankInterview({ sessionId: sid, projectId: p });
      expect(result.session.state).toBe('banked');

      // Banked content reaches agents through the production read path — no
      // hand-created attachment fixtures anywhere in this test.
      const { getSharedBlocksForAgent } = await import('../../server/room/store');
      const { buildRoomSystemPrompt } = await import('../../server/room/roomPrompts');
      const blocks = await getSharedBlocksForAgent(p, 'sam');
      expect(blocks.map((b) => b.label).sort()).toEqual(['concept_seed', 'open_questions', 'project_state', 'story_locks']);
      const prompt = buildRoomSystemPrompt({ agentId: 'sam', sharedBlocks: blocks, privateBlocks: [], ambient: false });
      expect(prompt).toContain('production-path seed');
      expect(prompt).toContain('[SEED] The ending is fixed.');
    } finally {
      __setRoomDbForTests(null);
    }
  });

  it('a NON-DEFAULT applied classification survives bank → stored in the record → export reproduces it', async () => {
    const p = freshProject();
    await ensure(p);
    const { __setRoomDbForTests } = await import('../../server/room/supabaseClient');
    __setRoomDbForTests(db);
    try {
      const session = await db
        .from('interview_sessions')
        .insert({ project_id: p, mode: 'full', state: 'readback', seed_text: 'classification seed' })
        .select().single();
      const sid = (session.data as { id: string }).id;
      const proposal = await db.from('proposals').insert({
        project_id: p, agent_id: 'writingPartner', surface: 'memory', field_path: 'story_locks',
        proposed_value: 'The ending is fixed.', rationale: 'itest', status: 'adopted',
        kind: 'interview_answer', session_id: sid, question_id: 'morgan-locks', origin: 'seed',
      }).select().single();
      const pid = (proposal.data as { id: string }).id;

      const { bankInterview, exportInterview } = await import('../../server/room/interview/runtime');
      // origin 'seed' default is 'locked'; the writer banks it as 'leaning'.
      await bankInterview({ sessionId: sid, projectId: p, mutability: { [pid]: 'leaning' } });

      // Persisted into the canonical record's immutable bank snapshot.
      const banked = await db.from('interview_sessions').select('bank_snapshot').eq('id', sid).single();
      const stored = (banked.data as { bank_snapshot: { applied_classifications: Record<string, string> } }).bank_snapshot;
      expect(stored.applied_classifications[pid]).toBe('leaning');

      // Export reads the stored map → reproduces 'leaning', never the 'locked' default (E7.2).
      const exported = await exportInterview({ sessionId: sid, projectId: p });
      expect(exported.markdown).toContain('[SEED] The ending is fixed. — challenge permitted');
      expect(exported.markdown).not.toMatch(/## Locks — do not violate[\s\S]*\[SEED\] The ending is fixed\./);
    } finally {
      __setRoomDbForTests(null);
    }
  });

  it('a second bank preserves an adopted-open question after the first session is exported', async () => {
    const p = freshProject();
    await ensure(p);
    const { __setRoomDbForTests } = await import('../../server/room/supabaseClient');
    __setRoomDbForTests(db);
    try {
      const { bankInterview, exportInterview } = await import('../../server/room/interview/runtime');
      const s1 = await db.from('interview_sessions').insert({
        project_id: p, mode: 'full', state: 'readback', seed_text: 'round one seed', answers: [],
      }).select().single();
      const s1id = (s1.data as { id: string }).id;
      await db.from('proposals').insert({
        project_id: p, agent_id: 'writingPartner', surface: 'memory', field_path: 'open_questions',
        proposed_value: 'Should the sister be trusted?', rationale: 'itest', status: 'adopted',
        kind: 'interview_answer', session_id: s1id, question_id: 'morgan-open', origin: 'seed',
      });
      await bankInterview({ sessionId: s1id, projectId: p });
      await exportInterview({ sessionId: s1id, projectId: p }); // state now exported

      // Round 2: no new open questions of its own.
      const s2 = await db.from('interview_sessions').insert({
        project_id: p, mode: 'full', state: 'readback', seed_text: 'round two seed', answers: [],
      }).select().single();
      await bankInterview({ sessionId: (s2.data as { id: string }).id, projectId: p });

      const oq = await db.from('memory_blocks').select('value')
        .eq('project_id', p).is('agent_id', null).eq('label', 'open_questions').single();
      expect((oq.data as { value: string }).value).toContain('Should the sister be trusted?');
    } finally {
      __setRoomDbForTests(null);
    }
  });
});
```

(Align `buildRoomSystemPrompt`'s exact input fields with `server/room/roomPrompts.ts:18-24` when writing — pass the minimum the type requires.)

- [ ] **Step 2: Run the suite against the dev database**

Run: `npx vitest run tests/integration/sharedMemoryContract.integration.test.ts`
Expected: PASS with creds in `.env` (7 tests); cleanly SKIPPED without. (Migration was applied and smoke-tested in Step 0.)

- [ ] **Step 3: Commit**

```bash
git add tests/integration/sharedMemoryContract.integration.test.ts
git commit -m "test: real-database integration coverage for the shared memory contract"
```

---

### Task 13: Verification, PR, and database-first rollout

**Files:** none new

- [ ] **Step 1: Full gates**

```bash
npm run check
npm run test:run
npx vitest run tests/integration/sharedMemoryContract.integration.test.ts
```

Expected: typecheck clean, full suite green, integration suite green against the dev database.

- [ ] **Step 2: B7 + revision coverage checklist**

- initializer idempotence (double + concurrent, real DB): `sharedMemoryContract.integration.test.ts`
- missing row vs initialized-empty sentinel: `storeSharedBlockValue.test.ts`
- blank / sentinel / writer-authored / missing row handling: `memoryContract.test.ts` + integration blank-repair test
- attachment completeness (4/28, real DB): integration suite
- surface sync preserves meeting locks and vice versa, including under concurrency: `lockSections.test.ts`, `roomRoutesStoryLocks.test.ts`, `bankMeetingMemory.test.ts`, integration concurrent-writer test
- meeting locks survive later no-lock rounds; exact duplicates don't multiply: `lockSections.test.ts`, `bankMeetingMemory.test.ts`
- legacy `[SEED]`/`[EXTRAPOLATED]`/`[INVENTED]` adoption + survival: `lockSections.test.ts`, `roomRoutesStoryLocks.test.ts`
- bank atomicity, rollback on failure, and idempotent retry (RPC AND app boundary): `bankMeetingMemory.test.ts` + integration bank tests; different-session projection-race rejection is mock-tested because `interview_sessions_one_active_per_project` prevents that concurrent state in the real schema
- oversized (20k) seed banks fully, no partial write; founding seed survives answer floods and round drops: `conceptSeedProjection.test.ts`, `bankMeetingMemory.test.ts`
- verbatim persistence through UI → hook → route → runtime (raw persisted, trimmed only for empty checks, 20k on raw): `interviewRuntime.test.ts`, `roomRoutesInterview.test.ts`
- over-cap surface locks 413 — declared locks never silently truncated: `roomRoutesStoryLocks.test.ts`
- delegation surfaces in open_questions (never the "nothing delegated" sentinel after a skip): `bankMeetingMemory.test.ts`
- pre-contract open-question units enter immutable snapshot history before a bounded projection can omit them: `bankMeetingMemory.test.ts`
- preview shows byte-identical final block values (A9 parity): `bankMeetingMemory.test.ts`
- repair completeness: all-whitespace blanks, char_cap drift, post-repair invariant re-read: `memoryContract.test.ts`, `sharedMemoryContractMigration.test.ts`
- entry-point 503 + no store/runtime writes after init failure: `roomRoutesMemoryGuard.test.ts`
- turn-boundary invariant on BOTH model paths (room turns + Casey digest, incl. shared blocks reaching the digest prompt): `runRoomTurnMemoryGuard.test.ts`, `digest.test.ts`
- client: inline actionable error, composer closed ONLY for confirmed memory 503, non-memory failures stay non-blocking, successful retry: `roomApi.test.ts`, `RoomChannelMemoryError.test.tsx`
- banked content reaches real prompt assembly with no manual fixtures: integration suite

- [ ] **Step 3: Push and open PR**

```bash
git push -u origin feat/shared-memory-contract
gh pr create --title "feat: shared memory contract — initializer, atomic banking, race-safe locks, turn guard (Addendum B)" --body "$(cat <<'EOF'
## Summary

- `ensure_project_memory` RPC: four sentinel blocks + 28 attachments + blank-row repair, atomic and idempotent (B4)
- `bank_meeting_memory` RPC: transactional bank with session lock, project-wide monotonic revision CAS, locks CAS, projections, snapshot, and state; retry-safe (`already_banked`); one-active-session schema prevents concurrent different-session banks while revision CAS remains defense-in-depth
- canonical Meeting record = `interview_sessions` (verbatim 20k seed + transcript with question text/domain); `concept_seed` block is a deterministic bounded projection
- `story_locks` writers are compare-and-swap with bounded retry — neither surface sync nor Meeting bank can clobber the opposite section, including concurrently
- Meeting locks are round-cumulative (append + exact-line dedupe; empty rounds preserve prior locks)
- applied mutability classifications, exact current-round open/delegated entries, and first-bank legacy question adoption are persisted in immutable `interview_sessions.bank_snapshot`; export/retry reproduce stored classifications
- `open_questions` is a cumulative cross-session projection across `banked` and `exported` records; adopted-open, skipped/delegated, and canonically adopted legacy entries carry forward with whole-question bounding
- reserved lock-header hardening: section headers are anchored full-line matches; duplicate/embedded headers are rejected (surface sync) or stripped (Meeting answers)
- migration review gate: SQL is reviewed before it touches the shared dev database; post-apply corrections are new forward migrations
- memory guard + 503 on all 14 guarded entry/recovery routes AND final invariant checks in both model paths; scheduler wake failures use bounded per-speaker requeue (max 3), not silent drop or whole-event replay
- client: `Room memory unavailable.` renders an inline actionable error, closes the composer, and retries cleanly
- env-gated real-database integration suite (idempotence, surface/bank concurrency, rollback, blank repair, classification survival, cumulative open_questions, prompt assembly)

Implements PRD Addendum B (#63) with the Task 1 PRD corrections.

## Rollout (database first)

1. Migration `20260712000001_shared_memory_contract_fns.sql` is ALREADY applied to Supabase and smoke-tested (see checklist below) before this PR merges.
2. Merge + deploy server/client after CodeRabbit review completes.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Confirm rollout preconditions (before merge — database is already ahead of the code)**

The migration was reviewed, applied, and smoke-tested in Task 12 Step 0 (review gate → apply); do NOT re-apply or edit it. Any post-apply correction ships as a NEW forward migration, never an edit to the applied file. Confirm:

1. `select proname from pg_proc where proname in ('ensure_project_memory','bank_meeting_memory');` returns both rows (sanity that Task 12 Step 0 ran against THIS database).
2. Existing-content preservation on a REAL project: select an existing project's non-blank shared-block values, run `ensure_project_memory` for it (runtime roster: `array['writingPartner','sam','casey','oliver','maya','zoe','alex']`, blocks jsonb as in Task 12 Step 0), re-select, and confirm the non-blank values are byte-identical; only missing blocks/attachments were added.
3. No `smoke-mem-*` / `itest-mem-*` rows remain (Task 12 cleanup ran).

- [ ] **Step 5: Wait for CodeRabbit — do not merge**

Wait for the CodeRabbit review to reach COMPLETED. Fix → commit → push → wait for re-review until clean. **Merge only after a completed clean CodeRabbit review, the Step 4 smoke checklist passing, and Ben's go-ahead.** Deploy server/client after merge.

---

## Non-Goals (deferred Writer Meeting work — explicitly out of scope)

This plan makes memory compatible with the future Writer Meeting direction (canonical record preserves verbatim seed; transcript entries can carry generated-question text, asker persona, domain, sequence, provenance, timestamp) — and builds none of it:

- No Morgan question-ranking algorithm (risk-ordered gating).
- No generated-question prompt policy or adaptive question generation from the seed.
- No specialist question rewriting or story-agnostic elicitation-question proposals.
- No Meeting UI redesign; existing fixed questions are unchanged.
- No stopping-rule design (when the Meeting ends).
- No VoiceProfile mapping into room memory (outside Addendum B per B1).
- No promotion of inferred/extrapolated answers into locks; only the writer promotes, exactly as today.
- No lock withdrawal/supersession workflow (Meeting locks stay active until that future spec).
- No domain taxonomy decision: `domain` stays an open optional string; `DOMAIN_BY_TRIGGER` is provisional data, not a blessed six-domain scheme. The taxonomy belongs to the future Meeting spec.
- **Explicit future requirement (recorded, not built):** when Morgan synthesis lands, `open_questions` becomes section-aware (`## Meeting` / `## Morgan` per B3) and its writers MUST adopt the same CAS/section-merge discipline as `story_locks`. Until then the meeting bank owns the whole body.

## Notes for the implementer

- **Two id namespaces — do not mix them.** Attachment/turn identity uses RUNTIME persona ids (`writingPartner`, `sam`, `casey`, …); the interview QUESTION-LANE namespace uses `'morgan'` (`questionBank.ts InterviewLane`, `TranscriptEntry.lane`, interview proposals `agent_id`). Lanes never touch `block_attachments`; the roster never uses `'morgan'`.
- **Dev server staleness:** `server/*` changes need a dev-server restart; a stale Node process looks like a code bug.
- **`renderStoryLocksBlock` stays** — `exportCheck.ts`/`exportInterview` use it for the PitchStudio export document; the bank path no longer calls it. `exportInterview` and already-banked retries render from `session.bank_snapshot.applied_classifications`, not defaults.
- **`renderBankedConceptSeed`/`conceptSeedAppend` in previews** remain for the readback UI; only the bank write path switches to the projection.
- **Do not** implement anything for `voice_profile` — outside this contract (Addendum B1). The `getSharedBlocksForAgent` project-only post-filter (`store.ts:84`) stays as-is.
- The integration suite mutates only `itest-mem-*` / `smoke-mem-*` project ids — never real project data.

## Review adjudication retained after Rev 5 corrections

- **Client-supplied preview token / fingerprint — NOT adopted.** The server owns both concurrency tokens: value CAS on `story_locks` catches surface edits, and the monotonic `concept_seed.revision` CAS catches another Meeting bank. Either conflict triggers a canonical re-read/recompute, while `previewPending` closes the client-only stale-preview window (E7.6).
- **Lost-response retry writes nothing.** It still re-renders the response from
  stored `bank_snapshot.applied_classifications`, so returned readback cannot
  contradict the completed bank.
- **Writer messages remain durable.** `room_events` is only the wake trigger.
  Bounded retry now records completed speaker keys, so a partial multi-speaker
  dispatch neither drops remaining wakes nor repeats successful speakers.
