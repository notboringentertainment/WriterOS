# Beat Sheet and Lookbook Implementation Plan

_Reviewed by Codex (gpt-5.5) in 3 rounds on 2026-09-29, verdict APPROVED; the argument is in `2026-09-29-beat-sheet-and-lookbook-review-log.md` beside this file._

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Outline page becomes a read-only Beat Sheet fed from the show's ratified Story-drive beat-sheet decision, kept current on open and on demand, with a per-beat Lookbook of visual questions Ben answers in his own words.

**Architecture:** One shared parser turns a Story-drive decision file's "Playing order" into keyed beats. One server module (`beatSheetSync`) finds the decision through a link registry kept beside the packages (not inside them), parses it, diffs it against `documents/outline.json`, and writes the outline atomically under the package lock only when the beats changed; the whole read-compare-write happens inside the lock. The project-open read path, a Refresh button, and the CLI import all call that module. On every client save the server treats the beat fields of the outline (`units`, `beatSheetSource`) as server-owned: it keeps what is on disk, so a stale browser tab can never roll a synced beat sheet back. Lookbook answers live in a new optional package file, `documents/lookbook.json`, keyed by beat identity, written only through the normal client save path.

**Tech Stack:** TypeScript, Express, React 18, zod, vitest (jsdom), existing project-memory CLI (`npx tsx server/projectMemory/cli.ts`), Anthropic/OpenAI persona runtime (Zoe), existing package write lock and atomic-replace helpers.

**Spec:** `docs/superpowers/specs/2026-09-29-beat-sheet-and-lookbook-spec.md` (Ben's spec, copied verbatim from his Desktop on 2026-09-29).

**Sequencing:** This branch is cut from `not-66-wayfinder` (the two unmerged import-fix commits 8816537 and 37ec703). Merge NOT-66 to main first, or merge this branch after it. Nothing here edits the same lines as NOT-66.

---

## Part A — Answers for Ben (read this part; the rest is for the engineers)

### A1. The plan in plain English

| Step | What it does | What it touches |
|---|---|---|
| 1 | Teach WriterOS to read a beat-sheet decision file and split "Playing order" into beats with a stable key each | New shared parser + tests. No package files. |
| 2 | Record, per show, where its Story-drive folder is and (for Grave Affairs) which decision is the beat sheet | One small registry file beside the packages (`~/WriterOS Projects/.writeros-story-drive-links.json`), written by the existing `link-source` command. No package file changes. No deploy writes this. |
| 3 | Sync: read the decision, compare to the beat list, rewrite the beat list only if it changed | New server module. Writes `documents/outline.json` only when beats differ. Nothing else in the package. |
| 4 | Run the sync when a project opens, and from a Refresh button with a status line; make the beat fields server-owned on every save so a stale tab cannot undo a sync | Project read route, project save route, one new refresh route, page header. |
| 5 | Make the same sync part of the Terminal import (preview and apply) | `import --source wayfinder` and a new `sync-beats` command. |
| 6 | Rename what Ben sees: Beat Sheet, Lookbook; page shows the beats read-only | Nav tab, page title, left spine heading, buttons, export heading. Document file names unchanged. |
| 7 | Lookbook: per-beat visual questions from Zoe on request, answers in Ben's words, orphan flag when a beat disappears | New `documents/lookbook.json` (only created once Ben answers something), one new server route, page middle section. |
| 8 | Go live: backup, dry run on copies, byte-identical check on every package, deploy, link Grave Affairs, verify | Ben's `writeros-backup` and `writeros-deploy`. |

### A2. Answers to the key question (spec section 2)

**Does refreshing on open write to the package every time Ben opens a show?** No new writes. Today the app already rewrites every file in the package on every open: the client sends a save about 600 ms after opening (and usually a second one right after, because of a migration marker), and the server rebuilds the whole package folder on each save. That is what Ben saw on Grave Affairs: identical bytes, new `openedAt`, and a fresh analysis queue. The refresh adds nothing to that cycle when the beats are unchanged: it reads the decision file, compares a hash, and stops. When the beats did change, it writes `documents/outline.json` once, atomically (temp file, fsync, rename) under the package lock, before the project is returned to the browser. The browser's own save then carries the same beats. And because the server now keeps the on-disk beat fields on every save, a second browser tab that still holds the old beats cannot write them back over the synced ones, and the memory observer never sees a beat-sheet "change" it should analyse.

**What if Story-drive is mid-sync in iCloud?** The decision file is one Markdown file. iCloud replaces a file atomically, so a read gets either the old or the new bytes, never half. If the file is evicted (an `.icloud` placeholder is present instead), the read fails with "file not found" and the sync reports "Story-drive not available", leaving the beats untouched. The read has a 1.5 s budget so a stalled iCloud read cannot hang project open; on timeout, same result: untouched, reported.

**What if the ledger file is malformed?** The parser refuses unless it finds a `## Answer` section, a `### Playing order` heading inside it, and at least one numbered beat with a bold title, with every bold title distinct. Anything else (no Answer, no Playing order, zero beats, two beats with the same title) returns a "malformed" result with a plain sentence, and the beat list stays exactly as it was. If the decision has been reopened in Story-drive (moved back to `tickets/`), the page says so and keeps the last ratified beats. The Refresh button and the status line show the last successful sync time, and whether Story-drive's file differs from what is shown.

**Two things Ben should know:** (1) the memory analysis queue will not fire for a beat refresh, because the refreshed outline reaches disk before the browser saves it and the server keeps the disk beats on every save; (2) the whole-package rewrite on open is pre-existing behaviour, not something this build introduces or fixes.

### A3. What this does to each live show

- **Grave Affairs:** its fourteen hand-typed beats are replaced on first sync by the same fourteen beats read from the ratified decision, now keyed by title so they follow Story-drive from then on; the middle of the page becomes the Lookbook.
- **Yes Chef!:** nothing changes except the names on screen; it has a Story-drive ledger but no beat-sheet decision, so its eight empty template beats and its series questions stay as they are.
- **Bloodless:** same as Yes Chef!: names on screen only; ledger present, no beat-sheet decision, template beats and series questions untouched.
- **Dog Years:** nothing at all; it has no WriterOS package and no Story-drive ledger (its beat outline is a Markdown file under My Scripts/Dog years/outline), so no code here can reach it.

### A4. Rollback and backup

- **Backup:** Ben's `writeros-backup` runs daily at 18:00 and streams a full copy of `~/WriterOS Projects` to the Studio (`writeros-backups/`). The go-live step runs it by hand first and records the archive name; the deploy does not proceed until the log shows `OK:` for that archive. Today's archives already on the Studio: `writeros-projects-2026-09-29_171229.tar.gz` and `writeros-projects-2026-09-29_180005.tar.gz`. The registry file sits inside `~/WriterOS Projects`, so the same archive covers it.
- **App rollback:** `git tag live-before-beatsheet` on the commit that is live before deploy; rollback is `cd ~/WriterOS-Prod && git reset --hard live-before-beatsheet && npm ci && npm run build && launchctl kickstart -k gui/$UID/tv.notboring.writeros`. The old build ignores the registry file (it only scans `*.writeros` folders) and reads a synced Grave Affairs package fine: `beatSheetSource` is an optional field the old outline schema does not know, and that schema is not strict, so it passes through and is dropped on the old build's next save. Neither the sync nor the registry writes `project.json` (the app's own save keeps rewriting it with `openedAt`, as today), which is why the link lives outside it: the old build's `sources` schema is strict and would reject a new key.
- **Package rollback:** the only package file the sync writes is `documents/outline.json` (and only for shows in the registry with a beat-sheet decision, so Grave Affairs alone). The only new file is `documents/lookbook.json`, created only after Ben answers a question. Restoring either is copying that file out of the day's archive.
- **Byte-identical proof:** the go-live step diffs every package before and after a full open-and-close in the new build, and the deploy stops if any file other than `project.json`'s `openedAt` and `memory/analysis-queue.json` differs (for Grave Affairs, `documents/outline.json` is the one expected difference, and only after it is linked).

### A5. Where the spec is wrong or needs a decision

- **F1. The beat sheet is already in Grave Affairs' canon.** Record `mem_1058f424…` is active and its source hash matches today's file. It is one flattened claim (the whole Answer collapsed to one line, capped at 600 characters, full text in `detail` capped at 8,000, so the last beats are cut off). Spec item 5 says it may not be there; it is, just useless as beats. Nothing in this build changes that record.
- **F2. There is no per-beat stable key in the ledger, and adding one costs a supersession.** The story-wayfinder skill forbids editing legacy tickets (any ticket without an `id:` line, which includes this one): the file's bytes are the memory key, and any edit re-imports as a new version that supersedes the old record. Adding keys to the Grave Affairs decision would therefore cost one supersession event and break the skill's own rule. Plan: identity is derived from the beat's bold title (`beat.cold-open-a-routine-family-grave-job`). Reordering or rewriting a beat's body keeps its identity. Retitling a beat reads as cut-plus-new, and its Lookbook answers show as orphaned, which is the behaviour the spec asks for anyway. Two beats with the same title cannot be told apart by title, so that case is refused as malformed until the titles are made distinct in Story-drive (Grave Affairs' fourteen are distinct today). No ledger edits.
- **F3. Declaring a beat sheet.** Story-drive's parser ignores header keys it does not know (verified in `story-drive/src/reader/ticket.ts`), so a `beat-sheet: pilot` header line is free for new shows. For Grave Affairs the same legacy-ticket rule as F2 applies, so the registry names the file instead. The sync honours either. Recommendation: header for new shows, registry pointer for Grave Affairs (D1).
- **F4. "Template questions" includes Ben's Foundations answers.** The series deck on the page is five Foundations cards (protagonist, goal, need, opposition, stakes, theme) followed by five series-engine cards and an Episode map. Grave Affairs has the Foundations filled in; the five series cards and the episode map are empty on every show. Plan: on a show with a synced beat sheet, the five series cards and the Episode map go, the Foundations stay above the Beat Sheet. Shows without a beat sheet keep the whole deck. Ben can overrule this in one line (D4).
- **F5. "Series notes" do not exist.** The series answers save into `seriesEngine` and `seasonArc` inside `documents/outline.json`. Nothing is lost by hiding the cards; the fields stay in the file.
- **F6. The left-hand beat list is not the Outline page.** It is the shell's display-only Structure Spine, and its heading also says "Outline". The rename covers it.
- **F7. No link exists today between a package and its Story-drive folder.** `link-source` is Buzz-only and `import` takes a folder path every run. Step 2 adds the link, in a registry file beside the packages rather than in `project.json`, because the currently live build validates `project.json`'s `sources` strictly and would refuse to open a package carrying a new key after a rollback.
- **F8. The canon import stays manual.** This build keeps beats current automatically; it does not run the full Wayfinder canon import on open, because that import proposes candidates, supersedes records and closes questions, which should not happen silently when a project opens. If Ben wants that too, it is a separate decision.
- **F9. Yes Chef! and Bloodless are listed as live shows, PSYOP is not.** PSYOP is a series package with template beats and no ledger; it is treated like Yes Chef!.

### Decisions taken in this plan (say "change D3" to change one)

- **D1** Beat-sheet declaration: `beat-sheet:` header for new decisions; a registry pointer (`beatSheet: resolved/<file>.md`) for legacy decisions. If both exist and disagree, the sync reports "ambiguous" and does nothing.
- **D2** Beat identity: `beat.<slug of bold title>`. Duplicate titles in one Playing order are malformed (refused, beats untouched, message names the title). Retitle = orphan.
- **D3** Refresh: both on open (server-side, inside the project read, 1.5 s budget) and a Refresh button with a status line. Zero writes when unchanged. The whole read-compare-plan-write runs inside the package lock.
- **D4** Page layout with a synced beat sheet: Foundations cards, then Beat Sheet (read-only beats, each with its Lookbook). Without one: today's deck, renamed.
- **D5** Lookbook storage: `documents/lookbook.json`, optional, created on first answer, excluded from the memory observer, never sent to Story-drive.
- **D6** Question writer: Zoe (World-Building Architect), on request per beat, three to five questions, may answer "nothing to see" for a beat. The server builds the prompt from the live outline unit on disk; the client sends only the beat key.
- **D7** Names: on-screen strings only; `outline` ids, routes and file names unchanged.
- **D8** Link registry: `<projectsRoot>/.writeros-story-drive-links.json`, `{ version: 1, links: { [projectId]: { root: <absolute path>, beatSheet?: 'resolved/<file>.md' } } }`, written atomically by the CLI only, re-validated (existing directory, no symlink in the path, canonical path) on every sync.
- **D9** Beat fields are server-owned on save. In the PUT route, before the save and before the memory observer's diff, `keepServerOwnedBeatFields(prior, incoming)` builds the effective project: when the on-disk outline has `beatSheetSource`, the incoming outline's `units` and `beatSheetSource` are replaced by the on-disk values. If the merged outline content then deep-equals the on-disk content (a stale tab that changed nothing else), the on-disk outline document is used wholesale, `revision` and `updatedAt` included, so the observer sees no change; otherwise the merged content keeps the payload's other edits with `revision = max(payload, disk)`. The effective project is what gets written and what the observer hashes. One log line when a replacement happened.

---

## Global Constraints

- One direction only: nothing in WriterOS edits a ratified beat; no write to any Story-drive file, ever.
- No package file other than `documents/outline.json` is written by the sync; `documents/lookbook.json` is written by the normal client save only when it has content and is removed from the package when it has none; the beat sync and the link registry never write `project.json` (the normal client save still rewrites it with `openedAt`, exactly as today).
- Shows without a registered beat-sheet decision keep their template beats and their full question deck.
- On-screen strings say "Beat Sheet" and "Lookbook"; the word "Outline" disappears from the UI. Document ids, routes, and file names stay `outline`.
- A failed or partial read leaves the existing beat list untouched and says so on the page.
- Tests and fixtures never use Ben's story or character names. Use synthetic beats (e.g. "Cold open: the harbour", "The dinner").
- Backup before deploy; deploy only via `writeros-deploy`; tag `live-before-beatsheet` first.
- Existing unit fields in outline.json keep their exact shape; new fields are optional so old packages parse unchanged.
- Any absolute path read from the registry is re-guarded on every use with the same guard the CLI uses (`guardExistingPath(root, 'directory')` plus `verify()`), and the canonical (realpath) form is what gets read.

## Review Focus

1. **Decision file with the beat sheet reopened** (file moved from `resolved/` to `tickets/`): the page must keep the last ratified beats and say "reopened in Story-drive"; test in Task 3.
2. **Two beats with the same bold title** in one Playing order: refused as malformed, beats untouched, message names the title; test in Task 1 and Task 3.
3. **A stale browser tab saving after a sync**: the server keeps the on-disk `units` and `beatSheetSource`, the observer queues nothing for the outline; test in Task 5.
4. **Lookbook answer whose beat was retitled**: answer must render under "Orphaned", never under a different beat; test in Task 8.
5. **Zoe returns malformed or zero questions**: no file write, page shows the reason; test in Task 9.

---

## File map

Create:
- `shared/beatSheet.ts` — parser + key derivation (pure, shared by client/server).
- `shared/lookbook.ts` — `LookbookDocumentSchema`, helpers (`orphanedBeatKeys`), request/response schemas for the Zoe route.
- `server/projectLibrary/storyDriveLinks.ts` — registry read/write (`readStoryDriveLinks`, `writeStoryDriveLink`, `StoryDriveLinksSchema`).
- `server/projectMemory/beatSheetSync.ts` — locate, read with timeout, parse, diff, atomic write; all under the package lock.
- `server/projectLibrary/beatSheetRoutes.ts` — `refreshBeatSheetOnOpen`, `POST /api/project-library/projects/:id/beat-sheet/refresh`, `GET …/beat-sheet/status`.
- `server/lookbook/lookbookRoutes.ts` — `POST /api/lookbook/:projectId/questions` (Zoe).
- `server/lookbook/buildLookbookPrompt.ts` — prompt text.
- `client/src/components/writing/outline/BeatSheetView.tsx` — read-only beats + Lookbook per beat.
- `client/src/components/writing/outline/LookbookBeat.tsx` — questions/answers for one beat.
- `client/src/components/writing/outline/BeatSheetStatusLine.tsx` — status + Refresh button.
- `client/src/lib/beatSheetClient.ts`, `client/src/lib/lookbookClient.ts` — fetch wrappers.
- Tests under `tests/shared/`, `tests/server/`, `tests/components/`, `tests/lib/`, fixtures under `tests/fixtures/beatSheet/`.

Modify:
- `shared/documents.ts` — `OutlineDocumentContentSchema` gains optional `beatSheetSource`.
- `shared/projectLibraryApi.ts` — `ProjectLibraryReadResponseSchema` gains `beatSheet`; new `BeatSheetSyncStatusSchema`.
- `client/src/lib/projectPackage.ts` — package path `documents/lookbook.json` (optional on read, written only when non-empty).
- `client/src/lib/projectState.ts` — `ProjectDocuments.lookbook?`, defaults, `migrateState`, `saveProjectState` all carry it.
- `client/src/lib/projectStorage.ts`, `client/src/lib/serverProjectStorage.ts`, `client/src/lib/useWriterOSProjectLibrary.ts`, `client/src/App.tsx` — read result carries `beatSheet`.
- `client/src/lib/useProjectState.ts` — `replaceOutlineDocument`, `setLookbook`.
- `server/projectLibrary/store.ts` — `writeProject` removes a stale `documents/lookbook.json` from staging when the payload has none.
- `server/projectLibrary/routes.ts` — GET `:projectId` runs sync first and returns `beatSheet`; PUT merges server-owned beat fields (D9) before save and observer.
- `server/projectMemory/cli.ts` — `link-source --workflow wayfinder`, `sync-beats`, `import` beat step with `--relink` guard.
- `server/routes.ts` — register the two new route groups.
- `client/src/components/writing/OutlineTab.tsx`, `outline/OutlineEditView.tsx`, `shell/TopBar.tsx`, `lib/leftZone.ts`, `outline/ClearOutlineDialog.tsx`, `outline/OutlineDocumentView.tsx`, `lib/documentMarkdown.ts`, `components/writing/WritersRoom.tsx`, `components/home/HomeSurface.tsx`, `components/memory/MemoryPatchPreview.tsx`, `lib/surfaceAwareness.ts` — strings.
- `server/projectMemory/writerOSObserver.ts` — one comment; confirm `lookbook.json` is not in its document list (it hashes only the four documents).
- `docs/runbooks/unified-project-memory.md` — link-source, sync-beats, registry paragraphs.

Not modified: `project.json` schema, `ProjectSourcesSchema`, `preserveManifestSources`.

---

### Task 1: Beat-sheet parser (shared)

**Files:**
- Create: `shared/beatSheet.ts`
- Create: `tests/shared/beatSheet.test.ts`
- Create: `tests/fixtures/beatSheet/synthetic-beat-sheet.md`

**Interfaces:**
- Produces:
  ```ts
  export interface ParsedBeat { key: string; number: number; title: string; body: string; movement: string }
  export type BeatSheetParseResult =
    | { ok: true; beats: ParsedBeat[]; label: string | null }
    | { ok: false; reason: 'no-answer' | 'no-playing-order' | 'no-beats' | 'not-resolved' | 'duplicate-title'; message: string }
  export function parseBeatSheetDecision(markdown: string): BeatSheetParseResult
  export function beatKey(title: string): string           // 'beat.<slug>'; pure, no suffixing
  export function isBeatSheetDeclared(markdown: string): boolean  // header line `beat-sheet:` present
  ```

- [ ] **Step 1: Write the fixture** `tests/fixtures/beatSheet/synthetic-beat-sheet.md`

```markdown
# Lay the pilot beat sheet
type: grill
mode: hitl
created: 2026-01-10
resolved: 2026-01-12
beat-sheet: pilot

## Question

What are the beats?

## Answer

Resolved live. Three movements.

### Playing order

**Movement one — Arrival**

1. **Cold open: the harbour.** Night. A ferry docks late. Nobody is waiting.
   The harbour master counts cars.

2. **The dinner.** Two things happen. A guest arrives uninvited; the host
   says yes to a job.

**Movement two — The turn**

3. **The second dinner.** Same table, different guest.

### The ticket's named questions

- ignored by the parser
```

- [ ] **Step 2: Write the failing tests** `tests/shared/beatSheet.test.ts`

```ts
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { beatKey, isBeatSheetDeclared, parseBeatSheetDecision } from '../../shared/beatSheet'

const fixture = readFileSync(path.join(__dirname, '../fixtures/beatSheet/synthetic-beat-sheet.md'), 'utf8')

describe('parseBeatSheetDecision', () => {
  it('splits the playing order into keyed beats with movement and full body', () => {
    const result = parseBeatSheetDecision(fixture)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.label).toBe('pilot')
    expect(result.beats.map(b => b.key)).toEqual(['beat.cold-open-the-harbour', 'beat.the-dinner', 'beat.the-second-dinner'])
    expect(result.beats[0]).toMatchObject({ number: 1, title: 'Cold open: the harbour.', movement: 'Movement one — Arrival' })
    expect(result.beats[0].body).toBe('Night. A ferry docks late. Nobody is waiting. The harbour master counts cars.')
    expect(result.beats[2].movement).toBe('Movement two — The turn')
  })

  it('stops at the next ### heading', () => {
    const result = parseBeatSheetDecision(fixture)
    expect(result.ok && result.beats).toHaveLength(3)
  })

  it('refuses two beats with the same title and names it', () => {
    const dup = fixture.replace('**The second dinner.**', '**The dinner.**')
    const result = parseBeatSheetDecision(dup)
    expect(result).toMatchObject({ ok: false, reason: 'duplicate-title' })
    expect(!result.ok && result.message).toContain('The dinner.')
  })

  it('refuses a file with no Answer section', () => {
    const result = parseBeatSheetDecision('# T\ntype: grill\nresolved: 2026-01-01\n\n## Question\n\nq\n')
    expect(result).toMatchObject({ ok: false, reason: 'no-answer' })
  })

  it('refuses an Answer without a Playing order', () => {
    const result = parseBeatSheetDecision('# T\nresolved: 2026-01-01\n\n## Answer\n\nProse only.\n')
    expect(result).toMatchObject({ ok: false, reason: 'no-playing-order' })
  })

  it('refuses a Playing order with no bold-titled numbered beats', () => {
    const result = parseBeatSheetDecision('# T\nresolved: 2026-01-01\n\n## Answer\n\n### Playing order\n\n1. plain line\n')
    expect(result).toMatchObject({ ok: false, reason: 'no-beats' })
  })

  it('refuses a file that is not resolved', () => {
    const unresolved = fixture.replace('resolved: 2026-01-12\n', '')
    expect(parseBeatSheetDecision(unresolved)).toMatchObject({ ok: false, reason: 'not-resolved' })
  })

  it('keeps sub-items (a., b.) inside the parent beat body', () => {
    const md = '# T\nresolved: 2026-01-01\n\n## Answer\n\n### Playing order\n\n1. **The kitchen.** In this order:\n   a. First.\n   b. Second.\n'
    const result = parseBeatSheetDecision(md)
    expect(result.ok && result.beats[0].body).toBe('In this order: a. First. b. Second.')
  })
})

describe('beatKey', () => {
  it('slugs the title deterministically', () => {
    expect(beatKey("The chef's kitchen.")).toBe('beat.the-chef-s-kitchen')
    expect(beatKey("The chef's kitchen.")).toBe('beat.the-chef-s-kitchen')
  })
})

describe('isBeatSheetDeclared', () => {
  it('finds the header line only in the header block', () => {
    expect(isBeatSheetDeclared(fixture)).toBe(true)
    expect(isBeatSheetDeclared('# T\n\n## Answer\n\nbeat-sheet: no\n')).toBe(false)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/shared/beatSheet.test.ts`
Expected: FAIL, module `shared/beatSheet` not found.

- [ ] **Step 4: Implement** `shared/beatSheet.ts`

```ts
export interface ParsedBeat { key: string; number: number; title: string; body: string; movement: string }

export type BeatSheetParseResult =
  | { ok: true; beats: ParsedBeat[]; label: string | null }
  | { ok: false; reason: 'no-answer' | 'no-playing-order' | 'no-beats' | 'not-resolved' | 'duplicate-title'; message: string }

const BEAT_LINE = /^(\d+)\.\s+\*\*(.+?)\*\*\s*(.*)$/
const MOVEMENT_LINE = /^\*\*(.+?)\*\*\s*$/

function headerBlock(lines: string[]): Map<string, string> {
  const headers = new Map<string, string>()
  let index = lines[0]?.startsWith('# ') ? 1 : 0
  for (; index < lines.length; index += 1) {
    const line = lines[index]
    if (line.startsWith('## ')) break
    const match = /^([a-z][a-z0-9-]*):\s*(.*?)\s*$/.exec(line)
    if (match) headers.set(match[1], match[2])
  }
  return headers
}

function section(lines: string[], heading: string, level: '##' | '###'): string[] | null {
  const start = lines.findIndex(line => line.trim() === `${level} ${heading}`)
  if (start < 0) return null
  const stop = level === '##' ? /^##\s/ : /^##{1,2}\s/
  const out: string[] = []
  for (let index = start + 1; index < lines.length; index += 1) {
    if (stop.test(lines[index])) break
    out.push(lines[index])
  }
  return out
}

export function beatKey(title: string): string {
  const slug = title.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'beat'
  return `beat.${slug}`
}

export function isBeatSheetDeclared(markdown: string): boolean {
  return headerBlock(markdown.replace(/\r\n?/g, '\n').split('\n')).has('beat-sheet')
}

export function parseBeatSheetDecision(markdown: string): BeatSheetParseResult {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  const headers = headerBlock(lines)
  if (!headers.get('resolved')) return { ok: false, reason: 'not-resolved', message: 'The decision is not marked resolved.' }
  const answer = section(lines, 'Answer', '##')
  if (!answer) return { ok: false, reason: 'no-answer', message: 'The decision has no Answer section.' }
  const order = section(answer, 'Playing order', '###')
  if (!order) return { ok: false, reason: 'no-playing-order', message: 'The Answer has no "Playing order" heading.' }

  const beats: ParsedBeat[] = []
  let movement = ''
  let current: { number: number; title: string; body: string[] } | null = null
  const flush = () => {
    if (!current) return
    beats.push({ key: beatKey(current.title), number: current.number, title: current.title,
      body: current.body.join(' ').replace(/\s+/g, ' ').trim(), movement })
    current = null
  }
  for (const raw of order) {
    const line = raw.trimEnd()
    const beat = BEAT_LINE.exec(line.trim())
    if (beat) { flush(); current = { number: Number(beat[1]), title: beat[2].trim(), body: beat[3] ? [beat[3]] : [] }; continue }
    const move = MOVEMENT_LINE.exec(line.trim())
    // A bold-only line at column 0 is a movement heading; indented bold lines belong to the beat body.
    if (move && line === line.trim()) { flush(); movement = move[1].trim(); continue }
    if (current && line.trim()) current.body.push(line.trim())
  }
  flush()
  if (beats.length === 0) return { ok: false, reason: 'no-beats', message: 'The Playing order has no numbered beats with bold titles.' }
  const seen = new Map<string, string>()
  for (const beat of beats) {
    const prior = seen.get(beat.key)
    if (prior !== undefined) return { ok: false, reason: 'duplicate-title', message: `Two beats share the title "${beat.title}" (also "${prior}"). Give them distinct titles in Story-drive.` }
    seen.set(beat.key, beat.title)
  }
  return { ok: true, beats, label: headers.get('beat-sheet') || null }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/shared/beatSheet.test.ts`
Expected: PASS (10 tests). This parser (minus the duplicate check) was run against the synthetic fixture and the real Grave Affairs decision on 2026-09-29: 3 and 14 beats, all titles distinct, sub-items kept inside beat 9.

- [ ] **Step 6: Verify against the real file (read-only, not a test)**

Run:
```bash
npx tsx -e "import {parseBeatSheetDecision} from './shared/beatSheet'; import {readFileSync} from 'node:fs'; const r=parseBeatSheetDecision(readFileSync(process.argv[1],'utf8')); console.log(r.ok? r.beats.map(b=>b.key+' | '+b.number+' | '+b.movement) : r)" "/Users/ben/Library/Mobile Documents/com~apple~CloudDocs/My Scripts/Grave Affairs/wayfinder/resolved/lay-the-pilot-beat-sheet.md"
```
Expected: 14 keys, numbers 1–14, five movement labels. Paste the 14 keys into the PR description.

- [ ] **Step 7: Commit**

```bash
git add shared/beatSheet.ts tests/shared/beatSheet.test.ts tests/fixtures/beatSheet/synthetic-beat-sheet.md
git commit -m "feat(beat-sheet): parse a Story-drive beat-sheet decision into keyed beats"
```

---

### Task 2: Schema, package and client-state plumbing

**Files:**
- Modify: `shared/documents.ts` (OutlineDocumentContentSchema, ~line 220)
- Create: `shared/lookbook.ts`
- Modify: `client/src/lib/projectPackage.ts` (package paths lines 22-36; serialize ~269; read ~441-544)
- Modify: `client/src/lib/projectState.ts` (`ProjectDocuments` type, `defaultProjectState`, `migrateState` ~401, `saveProjectState` ~461)
- Test: `tests/shared/lookbook.test.ts`, `tests/lib/projectPackageLookbook.test.ts`, `tests/lib/projectStateLookbook.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // shared/documents.ts
  export const BeatSheetSourceSchema = z.object({
    ticket: z.string().min(1),            // 'resolved/lay-the-pilot-beat-sheet.md'
    sourceHash: z.string().min(1),        // sha256 of file bytes at last successful sync
    syncedAt: z.string().min(1),          // ISO
    beatCount: z.number().int().nonnegative(),
    label: z.string().nullable(),
  }).strict()
  // OutlineDocumentContentSchema gains: beatSheetSource: BeatSheetSourceSchema.optional()

  // shared/lookbook.ts
  export const LookbookQuestionSchema = z.object({
    id: z.string().min(1), prompt: z.string().min(1), answer: z.string(),
    askedBy: z.literal('zoe'), createdAt: z.string().min(1), dismissedAt: z.string().optional(),
  }).strict()
  export const LookbookBeatSchema = z.object({ titleAtAsk: z.string(), questions: z.array(LookbookQuestionSchema) }).strict()
  export const LookbookDocumentSchema = z.object({ version: z.literal(1), beats: z.record(z.string(), LookbookBeatSchema) }).strict()
  export type LookbookDocument = z.infer<typeof LookbookDocumentSchema>
  export function emptyLookbook(): LookbookDocument
  export function hasLookbookContent(doc: LookbookDocument | undefined): boolean
  export function orphanedBeatKeys(doc: LookbookDocument, liveKeys: ReadonlySet<string>): string[]

  // projectPackage.ts
  export const WRITEROS_LOOKBOOK_PATH = 'documents/lookbook.json'
  // projectState.ts
  interface ProjectDocuments { synopsis; outline; treatment; storyBible; lookbook?: LookbookDocument }
  ```

- [ ] **Step 1: Write failing tests**

`tests/shared/lookbook.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { LookbookDocumentSchema, emptyLookbook, hasLookbookContent, orphanedBeatKeys } from '../../shared/lookbook'

describe('lookbook', () => {
  it('empty lookbook has no content', () => {
    expect(hasLookbookContent(emptyLookbook())).toBe(false)
    expect(hasLookbookContent(undefined)).toBe(false)
  })
  it('a beat with one question counts as content', () => {
    const doc = LookbookDocumentSchema.parse({ version: 1, beats: { 'beat.the-dinner': { titleAtAsk: 'The dinner.', questions: [
      { id: 'q1', prompt: 'What is on the table?', answer: '', askedBy: 'zoe', createdAt: '2026-01-01T00:00:00.000Z' } ] } } })
    expect(hasLookbookContent(doc)).toBe(true)
  })
  it('orphans are beats in the lookbook that are not live', () => {
    const doc = emptyLookbook()
    doc.beats['beat.gone'] = { titleAtAsk: 'Gone.', questions: [] }
    doc.beats['beat.here'] = { titleAtAsk: 'Here.', questions: [] }
    expect(orphanedBeatKeys(doc, new Set(['beat.here']))).toEqual(['beat.gone'])
  })
})
```

`tests/lib/projectPackageLookbook.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { defaultProjectState } from '../../client/src/lib/projectState'
import { readWriterOSProjectPackage, serializeWriterOSProjectPackage, WRITEROS_LOOKBOOK_PATH } from '../../client/src/lib/projectPackage'
import { emptyLookbook } from '../../shared/lookbook'

function storedProject(state = defaultProjectState()) {
  return { id: 'p1', title: 'T', createdAt: 1, updatedAt: 2, state }
}
function lookbookWithOneAnswer() {
  const lookbook = emptyLookbook()
  lookbook.beats['beat.the-dinner'] = { titleAtAsk: 'The dinner.', questions: [
    { id: 'q1', prompt: 'What is on the table?', answer: 'Bread.', askedBy: 'zoe', createdAt: '2026-01-01T00:00:00.000Z' } ] }
  return lookbook
}

describe('lookbook package file', () => {
  it('is not written when the project has no lookbook content', () => {
    const files = serializeWriterOSProjectPackage(storedProject()).files
    expect(files[WRITEROS_LOOKBOOK_PATH]).toBeUndefined()
  })
  it('is written once it has content, and read back', () => {
    const state = defaultProjectState()
    state.documents.lookbook = lookbookWithOneAnswer()
    const files = serializeWriterOSProjectPackage(storedProject(state)).files
    expect(files[WRITEROS_LOOKBOOK_PATH]).toContain('"Bread."')
    const read = readWriterOSProjectPackage(files)
    expect(read.ok && read.project.state.documents.lookbook?.beats['beat.the-dinner'].questions[0].answer).toBe('Bread.')
  })
  it('a package without the file reads with lookbook undefined', () => {
    const read = readWriterOSProjectPackage(serializeWriterOSProjectPackage(storedProject()).files)
    expect(read.ok && read.project.state.documents.lookbook).toBeUndefined()
  })
  it('an invalid lookbook file fails the read with a named path', () => {
    const files = { ...serializeWriterOSProjectPackage(storedProject()).files, [WRITEROS_LOOKBOOK_PATH]: '{"version":2}' }
    const read = readWriterOSProjectPackage(files)
    expect(!read.ok && read.error.path).toBe(WRITEROS_LOOKBOOK_PATH)
  })
  it('beatSheetSource on the outline survives a round trip', () => {
    const state = defaultProjectState()
    state.documents.outline.content.beatSheetSource = { ticket: 'resolved/x.md', sourceHash: 'abc', syncedAt: '2026-01-01T00:00:00.000Z', beatCount: 3, label: 'pilot' }
    const read = readWriterOSProjectPackage(serializeWriterOSProjectPackage(storedProject(state)).files)
    expect(read.ok && read.project.state.documents.outline.content.beatSheetSource?.beatCount).toBe(3)
  })
})
```

`tests/lib/projectStateLookbook.test.ts` (this is the gap Codex found: `migrateState` rebuilds `documents` from four surfaces and `saveProjectState` writes only four):
```ts
import { describe, expect, it } from 'vitest'
import { defaultProjectState, migrateState, saveProjectState, loadProjectState } from '../../client/src/lib/projectState'
import { emptyLookbook } from '../../shared/lookbook'

describe('lookbook in project state', () => {
  it('migrateState keeps documents.lookbook', () => {
    const state = defaultProjectState()
    state.documents.lookbook = emptyLookbook()
    state.documents.lookbook.beats['beat.x'] = { titleAtAsk: 'X.', questions: [] }
    expect(migrateState(JSON.parse(JSON.stringify(state))).documents.lookbook?.beats['beat.x']).toBeDefined()
  })
  it('migrateState leaves lookbook undefined when absent', () => {
    expect(migrateState(JSON.parse(JSON.stringify(defaultProjectState()))).documents.lookbook).toBeUndefined()
  })
  it('browser save/load round-trips documents.lookbook', () => {
    const state = defaultProjectState()
    state.documents.lookbook = emptyLookbook()
    state.documents.lookbook.beats['beat.x'] = { titleAtAsk: 'X.', questions: [] }
    saveProjectState(state)
    expect(loadProjectState()?.documents.lookbook?.beats['beat.x']).toBeDefined()
  })
})
```
(Use the real names of the localStorage save/load functions at `projectState.ts:461` and its counterpart; adjust the import if they differ.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/shared/lookbook.test.ts tests/lib/projectPackageLookbook.test.ts tests/lib/projectStateLookbook.test.ts`
Expected: FAIL (missing module / unknown export / strict schema rejects `beatSheetSource` / lookbook dropped by migrateState).

- [ ] **Step 3: Implement**

`shared/lookbook.ts`:
```ts
import { z } from 'zod'

export const LookbookQuestionSchema = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1),
  answer: z.string(),
  askedBy: z.literal('zoe'),
  createdAt: z.string().min(1),
  dismissedAt: z.string().optional(),
}).strict()
export const LookbookBeatSchema = z.object({ titleAtAsk: z.string(), questions: z.array(LookbookQuestionSchema) }).strict()
export const LookbookDocumentSchema = z.object({ version: z.literal(1), beats: z.record(z.string(), LookbookBeatSchema) }).strict()
export type LookbookDocument = z.infer<typeof LookbookDocumentSchema>
export type LookbookQuestion = z.infer<typeof LookbookQuestionSchema>

export function emptyLookbook(): LookbookDocument { return { version: 1, beats: {} } }
export function hasLookbookContent(doc: LookbookDocument | undefined): boolean {
  return !!doc && Object.values(doc.beats).some(beat => beat.questions.length > 0)
}
export function orphanedBeatKeys(doc: LookbookDocument, liveKeys: ReadonlySet<string>): string[] {
  return Object.keys(doc.beats).filter(key => !liveKeys.has(key)).sort()
}
```

`shared/documents.ts`: add `BeatSheetSourceSchema` (as in Interfaces) above `OutlineDocumentContentSchema`, and the line `beatSheetSource: BeatSheetSourceSchema.optional(),` after `aiProductionColumns`.

`client/src/lib/projectPackage.ts`:
- Add `export const WRITEROS_LOOKBOOK_PATH = 'documents/lookbook.json'` next to the other path constants.
- In `serializeWriterOSProjectPackage`, after the story-bible line: `if (hasLookbookContent(project.state.documents.lookbook)) files[WRITEROS_LOOKBOOK_PATH] = json(project.state.documents.lookbook)` (use the same JSON helper the other documents use, line ~137).
- In `readWriterOSProjectPackage`, after the four documents are parsed: if `files[WRITEROS_LOOKBOOK_PATH]` exists, `parseJsonFile` then `LookbookDocumentSchema.safeParse`; on failure return `{ ok: false, error: { code: 'invalid-json', path: WRITEROS_LOOKBOOK_PATH, message: 'documents/lookbook.json is not a valid Lookbook.' } }`; on success set `documents.lookbook`. Missing file → leave undefined.

`client/src/lib/projectState.ts`:
- `ProjectDocuments` gains `lookbook?: LookbookDocument`.
- `migrateState` (~line 401): after the four documents are rebuilt, `lookbook: LookbookDocumentSchema.safeParse(rawMigratedDocuments.lookbook).success ? rawMigratedDocuments.lookbook : undefined`.
- Browser save (~line 461): include `lookbook` in the documents object it writes; the load path parses it the same way as migrate.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/shared tests/lib`
Expected: PASS, and no regressions in the existing package/schema/state tests.

- [ ] **Step 5: Type-check and commit**

Run: `npm run check`
```bash
git add shared/documents.ts shared/lookbook.ts client/src/lib/projectPackage.ts client/src/lib/projectState.ts tests/shared/lookbook.test.ts tests/lib/projectPackageLookbook.test.ts tests/lib/projectStateLookbook.test.ts
git commit -m "feat(beat-sheet): beatSheetSource on the outline, optional lookbook document carried through state and package"
```

---

### Task 3: Link registry and server sync module

**Files:**
- Create: `server/projectLibrary/storyDriveLinks.ts`
- Create: `server/projectMemory/beatSheetSync.ts`
- Test: `tests/server/storyDriveLinks.test.ts`, `tests/server/beatSheetSync.test.ts`

**Interfaces:**
- Consumes: `parseBeatSheetDecision`, `isBeatSheetDeclared` (Task 1); `WriterOSProjectManifestSchema`, `WRITEROS_PROJECT_MANIFEST_PATH` (projectPackage.ts); `acquirePackageWriteLock` (server/projectLibrary/packageLock.ts:258); `AuthoredDocumentStateSchema(OutlineDocumentContentSchema)` (shared/documents.ts:537, a factory); `guardExistingPath` (the same guard `cli.ts:489` uses for `--from`).
- Produces:
  ```ts
  // storyDriveLinks.ts
  export const STORY_DRIVE_LINKS_FILE = '.writeros-story-drive-links.json'
  export const StoryDriveLinkSchema = z.object({ root: z.string().min(1), beatSheet: z.string().regex(/^resolved\/[A-Za-z0-9._-]+\.md$/).optional() }).strict()
  export const StoryDriveLinksSchema = z.object({ version: z.literal(1), links: z.record(z.string().regex(WRITEROS_PROJECT_ID_PATTERN), StoryDriveLinkSchema) }).strict()
  export async function readStoryDriveLinks(projectsRoot: string): Promise<z.infer<typeof StoryDriveLinksSchema>>   // missing file → { version: 1, links: {} }; invalid → throws StoryDriveLinksError
  export async function writeStoryDriveLink(projectsRoot: string, projectId: string, link: StoryDriveLink): Promise<{ changed: boolean }>
  // read-modify-write under acquirePackageWriteLock({ workspaceRoot: projectsRoot, projectId: 'story-drive-links' })
  // (the lock helper hashes any id into its own lock file, so this is a registry-wide lock); atomic temp+fsync+rename; only the CLI calls it

  // beatSheetSync.ts
  export type BeatSheetSyncStatus =
    | { kind: 'not-linked' }
    | { kind: 'no-beat-sheet' }
    | { kind: 'unchanged'; ticket: string; syncedAt: string; beatCount: number }
    | { kind: 'updated'; ticket: string; syncedAt: string; beatCount: number; added: string[]; removed: string[]; changed: string[] }
    | { kind: 'unavailable'; ticket: string | null; message: string }
    | { kind: 'malformed'; ticket: string; message: string }
    | { kind: 'reopened'; ticket: string; message: string }
    | { kind: 'ambiguous'; message: string }
  export interface BeatSheetSyncOptions {
    workspaceRoot: string; packagePath: string; projectId: string
    timeoutMs?: number; now?: () => Date; write?: boolean
    readFile?: (p: string) => Promise<string>   // test seams for the timeout cases
    readdir?: (dir: string) => Promise<string[]>
  }
  export interface BeatSheetSyncResult { status: BeatSheetSyncStatus; outline?: AuthoredDocumentState<OutlineDocumentContent> }  // outline present exactly when a write happened
  export async function syncBeatSheet(options: BeatSheetSyncOptions): Promise<BeatSheetSyncResult>
  export function planBeatUnits(existing: OutlineDocumentContent, beats: ParsedBeat[]): { units: OutlineUnit[]; added: string[]; removed: string[]; changed: string[] }
  ```
- `write: false` is the dry run (used by `sync-beats --dry-run` and `GET …/status`).

**Behaviour spec (all of steps 4–9 run inside one `acquirePackageWriteLock({ workspaceRoot, projectId })`):**
1. `readStoryDriveLinks(workspaceRoot)`; no entry for `projectId` → `not-linked`.
2. Guard the root on every call: `const root = await guardExistingPath(link.root, 'directory')` then `await root.verify()`, and read only under `root.canonicalPath` (the guard exposes `path` and `canonicalPath` separately; `safePaths.ts:98`). Any guard failure → `unavailable` with the guard's message.
3. **One deadline for every Story-drive filesystem operation** (guard, `ticketRoot` stat, `readdir`, every file read): `deadline = Date.now() + (timeoutMs ?? 1500)`; each operation is `await withDeadline(deadline, op)` and a trip anywhere → `unavailable` with `'Story-drive did not answer in time.'`. The package lock is therefore held for at most the deadline plus the outline write.
4. Resolve the ticket root exactly as `ticketRoot()` in `adapters/wayfinder.ts:127` (`<root>/wayfinder` if it exists, else `<root>`), refusing symlinks the same way.
5. Find the decision: if `link.beatSheet` is set, use that path and do not scan. Otherwise scan `resolved/*.md` (non-recursive, under the same deadline) and read each file's header block only (first 64 lines) to test `isBeatSheetDeclared`. Zero → `no-beat-sheet`. More than one → `ambiguous`. If the pointer and a declared file both exist and differ → `ambiguous`. If the pointer's file is missing but `tickets/<same basename>` exists → `reopened`.
6. Read the decision file (under the deadline). ENOENT/EPERM/deadline → `unavailable`.
7. sha256 the bytes. Read `documents/outline.json` (inside the lock). If the hash equals `outline.content.beatSheetSource?.sourceHash` → `unchanged` (no parse, no write).
8. Parse. `ok: false` → `malformed` (never write).
9. `planBeatUnits` against the outline just read: for each parsed beat produce an `OutlineUnit` `{ id: beat.key, number: beat.number, actOrSequence: beat.movement, title: beat.title, whatHappens: beat.body, location: '', characters: [], conflict: '', turn: '', consequence: '', whyNext: '', linkedSceneIds: [], draftNotes: '' }`. If an existing unit with the same id exists, keep its `location`, `characters`, `linkedSceneIds`, `draftNotes`, `aiProduction`. Units whose ids are not in the new set are dropped. `added/removed/changed` are key lists. If `write !== false`, write `{ ...outlineDoc, revision: outlineDoc.revision + 1, updatedAt: syncedAt, content: { ...content, units, beatSheetSource } }` with a local `atomicReplace` copied from `server/projectMemory/store.ts:639`. Return `{ status: updated, outline: <the document written> }`.
10. Never touch any other file. Never write under `root`.

- [ ] **Step 1: Write failing tests**

`tests/server/storyDriveLinks.test.ts`:
```ts
it('reads an empty registry when the file is missing')
it('writes atomically and reports changed=false on an identical second write')
it('rejects a beatSheet outside resolved/ and a malformed registry file')
it('two concurrent writes for different projects both survive (Promise.all of two writeStoryDriveLink calls → both links present)')
```

`tests/server/beatSheetSync.test.ts` — build a temp workspace with one package (`serializeWriterOSProjectPackage(defaultProjectState())` written to `<tmp>/Show (abcd1234).writeros/…`), a registry entry, and a temp Story-drive folder with `wayfinder/resolved/synthetic-beat-sheet.md` from the Task 1 fixture. `snapshotTree(dir)` returns `{ [relPath]: { bytes, mtimeMs } }`. Cases:

```ts
it('reports not-linked when the registry has no entry')
it('reports no-beat-sheet when nothing is declared and no pointer is set')
it('finds a declared decision by header and writes units keyed by title', async () => {
  const result = await syncBeatSheet(opts)
  expect(result.status.kind).toBe('updated')
  expect(result.outline?.content.units.map(u => u.id)).toEqual(['beat.cold-open-the-harbour', 'beat.the-dinner', 'beat.the-second-dinner'])
  const onDisk = JSON.parse(await readFile(path.join(packagePath, 'documents/outline.json'), 'utf8'))
  expect(onDisk).toEqual(result.outline)
  expect(onDisk.content.units[0].actOrSequence).toBe('Movement one — Arrival')
  expect(onDisk.content.beatSheetSource.ticket).toBe('resolved/synthetic-beat-sheet.md')
  expect(onDisk.revision).toBe(1)
})
it('is a no-op with zero writes when the file hash is unchanged (tree snapshot identical, no outline in result)')
it('writes only documents/outline.json on an update')
it('uses the pointer for a legacy decision without a header')
it('leaves beats untouched and reports malformed when Playing order is missing')
it('leaves beats untouched and reports malformed naming the title when two beats share a title')
it('leaves beats untouched and reports unavailable when the file is missing')
it('reports unavailable when the registry root is a symlink or does not exist')
it('reports reopened when the pointed file moved to tickets/')
it('reports ambiguous when two resolved files declare beat-sheet')
it('keeps WriterOS-side unit fields (draftNotes, linkedSceneIds) across a re-sync of the same key')
it('reports added/removed/changed keys when the file changes')
it('dry run (write:false) reports updated, returns no outline, writes nothing')
it('times out on the decision read and reports unavailable', async () => {
  const result = await syncBeatSheet({ ...opts, timeoutMs: 1, readFile: (p) => p.endsWith('.md') ? new Promise(() => {}) : fsReadFile(p, 'utf8') })
  expect(result.status.kind).toBe('unavailable')
})
it('times out during the resolved/ scan (no pointer, many files, stalled readdir) and reports unavailable within the budget', async () => {
  const started = Date.now()
  const result = await syncBeatSheet({ ...opts, timeoutMs: 50, readdir: () => new Promise(() => {}) })
  expect(result.status.kind).toBe('unavailable')
  expect(Date.now() - started).toBeLessThan(1000)
})
it('reads Story-drive only under the canonical path (registry root given via a symlinked parent → unavailable)')
it('holds the package lock for the whole sync (a concurrent acquirePackageWriteLock waits until the sync returns)')
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/server/storyDriveLinks.test.ts tests/server/beatSheetSync.test.ts` → FAIL, modules missing.

- [ ] **Step 3: Implement** both modules per the behaviour spec. Skeleton of `syncBeatSheet`:

```ts
export async function syncBeatSheet(options: BeatSheetSyncOptions): Promise<BeatSheetSyncResult> {
  const read = options.readFile ?? ((p: string) => fsReadFile(p, 'utf8'))
  const registry = await readStoryDriveLinks(options.workspaceRoot)
  const link = registry.links[options.projectId]
  if (!link) return { status: { kind: 'not-linked' } }
  const lock = await acquirePackageWriteLock({ workspaceRoot: options.workspaceRoot, projectId: options.projectId })
  try {
    const deadline = Date.now() + (options.timeoutMs ?? 1500)
    const timed = <T>(op: () => Promise<T>) => withDeadline(deadline, op())   // rejects with DeadlineError when the clock runs out
    let root: SafeExistingPath
    try { root = await timed(() => guardExistingPath(link.root, 'directory')); await timed(() => root.verify()) }
    catch (error) { return { status: { kind: 'unavailable', ticket: link.beatSheet ?? null, message: messageOf(error) } } }
    let located: LocateResult
    let bytes: string
    try {
      const ticketDir = await timed(() => ticketRoot(root.canonicalPath))
      located = await locateDecision(ticketDir, link.beatSheet, p => timed(() => read(p)), () => timed(() => readdir(path.join(ticketDir, 'resolved'))))
      if (located.kind !== 'found') return { status: located }
      bytes = await timed(() => read(path.join(ticketDir, located.ticket)))
    } catch (error) {
      return { status: { kind: 'unavailable', ticket: link.beatSheet ?? null, message: messageOf(error) } }   // ENOENT, EPERM, DeadlineError
    }
    const sourceHash = createHash('sha256').update(bytes).digest('hex')
    const outlinePath = path.join(options.packagePath, 'documents/outline.json')
    const outlineDoc = AuthoredDocumentStateSchema(OutlineDocumentContentSchema).parse(JSON.parse(await read(outlinePath)))
    const content = outlineDoc.content
    if (content.beatSheetSource?.sourceHash === sourceHash) {
      return { status: { kind: 'unchanged', ticket: located.ticket, syncedAt: content.beatSheetSource.syncedAt, beatCount: content.beatSheetSource.beatCount } }
    }
    const parsed = parseBeatSheetDecision(bytes)
    if (!parsed.ok) return { status: { kind: 'malformed', ticket: located.ticket, message: parsed.message } }
    const plan = planBeatUnits(content, parsed.beats)
    const syncedAt = (options.now?.() ?? new Date()).toISOString()
    const status: BeatSheetSyncStatus = { kind: 'updated', ticket: located.ticket, syncedAt, beatCount: plan.units.length, added: plan.added, removed: plan.removed, changed: plan.changed }
    if (options.write === false) return { status }
    const next = { ...outlineDoc, revision: outlineDoc.revision + 1, updatedAt: syncedAt,
      content: { ...content, units: plan.units, beatSheetSource: { ticket: located.ticket, sourceHash, syncedAt, beatCount: plan.units.length, label: parsed.label } } }
    await atomicReplace(outlinePath, `${JSON.stringify(next, null, 2)}\n`)
    return { status, outline: next }
  } finally {
    await lock.release()
  }
}
```

- [ ] **Step 4: Run tests** — both files PASS.

- [ ] **Step 5: Commit**

```bash
git add server/projectLibrary/storyDriveLinks.ts server/projectMemory/beatSheetSync.ts tests/server/storyDriveLinks.test.ts tests/server/beatSheetSync.test.ts
git commit -m "feat(beat-sheet): link registry beside the packages; sync beats from a Story-drive decision under the package lock"
```

---

### Task 4: CLI — link a Story-drive folder, sync beats, and fold the sync into import

**Files:**
- Modify: `server/projectMemory/cli.ts` (`runLinkSource` 347-395; `runImport` 474-740; command dispatch ~1266)
- Modify: `docs/runbooks/unified-project-memory.md`
- Test: `tests/server/projectMemoryCli.test.ts` (extend)

**Interfaces:**
- `link-source --project <abs> --workflow wayfinder --from <abs dir> [--beat-sheet resolved/<file>.md]` → guards `--from` (`guardExistingPath(from, 'directory')`, canonical path), validates `--beat-sheet` against the registry regex, then `writeStoryDriveLink(path.dirname(projectPath), projectId, { root: canonical, beatSheet })`; prints `{ linked, workflow: 'wayfinder', root, beatSheet }`. `project.json` is not written. The Buzz path is unchanged.
- `sync-beats --project <abs> (--dry-run | --apply)` → `syncBeatSheet({ write: flag === 'apply', … })`, prints the status JSON, exit 0 for unchanged/updated, exit 2 for every other kind.
- `import --source wayfinder --from <dir> (--dry-run|--apply) [--relink]` → if the package is registered and the canonical `--from` differs from the registered root, fail with `CliInputError('--from differs from the registered Story-drive folder; pass --relink to update the registry, or use the registered folder.')` unless `--relink` is given, in which case the registry is updated first. Then canon publish as today, then `syncBeatSheet` (write on apply, dry on dry-run) and print `{ beatSheet: status }`. An unregistered package imports canon as today and prints `beatSheet: { kind: 'not-linked' }`.

- [ ] **Step 1: Write failing tests** (extend the CLI test file; follow its existing temp-package helper):

```ts
it('link-source wayfinder writes the registry beside the packages and leaves project.json bytes identical')
it('link-source refuses a relative --from and a --beat-sheet outside resolved/')
it('link-source wayfinder does not disturb an existing buzzChannelId in project.json')
it('sync-beats --dry-run prints updated and writes nothing')
it('sync-beats --apply writes the outline and a second run prints unchanged')
it('sync-beats exits 2 on malformed and leaves outline bytes identical')
it('import --source wayfinder --apply syncs beats after publishing canon')
it('import fails when --from differs from the registered root and succeeds with --relink')
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/server/projectMemoryCli.test.ts` → FAIL ('Only the Buzz source linkage is supported.').

- [ ] **Step 3: Implement** per Interfaces. Register `'sync-beats': runSyncBeats` in the dispatch table; `assertAllowedOptions` lists for each command extended accordingly.

- [ ] **Step 4: Run tests** — CLI tests PASS; `npm run check` clean.

- [ ] **Step 5: Runbook** — add a "Beat sheet from Story-drive" section: the registry file and its shape, the three commands, the status kinds, one line each, and the `--relink` rule.

- [ ] **Step 6: Commit**

```bash
git add server/projectMemory/cli.ts tests/server/projectMemoryCli.test.ts docs/runbooks/unified-project-memory.md
git commit -m "feat(cli): register a Story-drive folder and sync beats from its beat-sheet decision"
```

---

### Task 5: Refresh on open, server-owned beat fields on save, refresh/status routes

**Files:**
- Create: `server/projectLibrary/beatSheetRoutes.ts`
- Modify: `server/projectLibrary/routes.ts` (GET `/projects/:projectId` lines 66-73; PUT lines 84-131)
- Modify: `server/projectLibrary/store.ts` (`writeProject`, ~444-556)
- Modify: `server/routes.ts` (register after line 1046)
- Modify: `shared/projectLibraryApi.ts` (`ProjectLibraryReadResponseSchema` gains `beatSheet`; add `BeatSheetSyncStatusSchema`)
- Test: `tests/server/beatSheetRoutes.test.ts` (copy the harness from `tests/server/projectLibraryRoutes.test.ts`), `tests/server/projectLibraryStore.test.ts` (extend)

**Interfaces:**
- `GET /api/project-library/projects/:projectId` → before `readProject`, `refreshBeatSheetOnOpen(config, store, projectId)` runs `syncBeatSheet({ workspaceRoot: config.rootPath, packagePath: await store.resolveProjectPackagePath(id), projectId: id, timeoutMs: 1500 })`, catches every thrown error (`console.warn('[beat-sheet] refresh on open failed:', …)`) into `{ kind: 'unavailable', ticket: null, message }`, and never fails the read. Response: `{ result, beatSheet }`.
- `keepServerOwnedBeatFields(prior: StoredProject | null, incoming: StoredProject): { project: StoredProject; replaced: boolean }` (D9), in `beatSheetRoutes.ts`, called by the PUT route right after `priorRead` and before both `writeProject` and the observer. If `prior` is null or its outline has no `beatSheetSource`, returns `incoming` unchanged. Otherwise builds `merged = { ...incoming.outline, content: { ...incoming.content, units: prior.units, beatSheetSource: prior.beatSheetSource } }`; if `deepEqual(merged.content, prior.content)` the effective outline is `prior.outline` exactly (revision and updatedAt included); else `merged` with `revision: Math.max(incoming.revision, prior.revision)`. The route then calls `writeProject(effective.project)` and computes `currentFiles` from `effective.project`, so the observer's prior/current agree on the outline whenever only beat fields differed. `console.info('[beat-sheet] kept on-disk beats for <id>')` when `replaced`.
- `writeProject` (store): one change only. After `writeStagedPackage`, if `serialized.files[WRITEROS_LOOKBOOK_PATH]` is undefined, `rm(path.join(stagingPath, WRITEROS_LOOKBOOK_PATH), { force: true })`, because `copyExistingPackageTree` would otherwise carry an old lookbook file forward forever.
- `POST /api/project-library/projects/:projectId/beat-sheet/refresh` (same-origin + session) → `syncBeatSheet({ …, timeoutMs: 10_000 })`; returns `{ beatSheet: status, outline: result.outline ?? null }`. The client only replaces its outline when `outline` is non-null (i.e. when the sync itself wrote); no separate read.
- `GET /api/project-library/projects/:projectId/beat-sheet/status` → `syncBeatSheet({ write: false })`, returns `{ beatSheet }`.
- `shared/projectLibraryApi.ts`: `export const BeatSheetSyncStatusSchema = z.discriminatedUnion('kind', [...])` mirroring Task 3; `ProjectLibraryReadResponseSchema = z.object({ result: …, beatSheet: BeatSheetSyncStatusSchema })`; `BeatSheetRefreshResponseSchema = z.object({ beatSheet, outline: AuthoredDocumentStateSchema(OutlineDocumentContentSchema).nullable() })`.

- [ ] **Step 1: Write failing tests**

```ts
// beatSheetRoutes.test.ts
it('GET project returns beatSheet.kind not-linked for an unregistered package and leaves files untouched')
it('GET project syncs a registered package before returning it (units keyed by title in the response)')
it('GET project returns the project even when the Story-drive folder is missing (kind unavailable)')
it('POST refresh returns the outline it wrote, and a second call returns unchanged with outline null')
it('GET status reports updated without writing when the decision changed on disk')
it('refresh and status require the session header (401 without it)')
it('a stale client PUT after a sync keeps the on-disk units and beatSheetSource, and the analysis queue stays empty', async () => {
  // open (GET) → sync writes 3 beats (outline revision 1); craft a PUT body whose outline still has the 8 template units,
  // no beatSheetSource, revision 0 and the old updatedAt, everything else identical
  // expect disk outline to deep-equal the synced document (revision 1, same updatedAt) after the PUT
  // expect readAnalysisQueue(packagePath) to contain no item with surface 'outline'
})
it('a PUT that edits the spine AND carries stale beats keeps the disk beats, keeps the spine edit, bumps revision to max, and queues one outline analysis')
it('keepServerOwnedBeatFields returns the incoming project unchanged when the package has no beatSheetSource')
// projectLibraryStore.test.ts
it('writeProject removes documents/lookbook.json from the package when the payload has no lookbook content')
it('writeProject keeps documents/lookbook.json when the payload has lookbook content')
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement** — GET handler:
```ts
app.get('/api/project-library/projects/:projectId', requireSameOrigin, requireSession, async (req, res) => {
  try {
    const activeStore = dataStore(config, store)
    const beatSheet = await refreshBeatSheetOnOpen(config, activeStore, req.params.projectId)
    const result = await activeStore.readProject(req.params.projectId)
    return res.json({ result, beatSheet })
  } catch (error) { return routeError(res, error) }
})
```
PUT handler (routes.ts:84-131): after the `priorRead` block, `const effective = keepServerOwnedBeatFields(priorRead.ok ? priorRead.project : null, project)`; then `activeStore.writeProject(effective.project)` and `serializeWriterOSProjectPackage(effective.project).files` for `currentFiles`. `writeProject` itself gains only the lookbook `rm` described in Interfaces.

- [ ] **Step 4: Run tests; run the whole server suite** — `npx vitest run tests/server` → PASS.

- [ ] **Step 5: Commit**

```bash
git add server/projectLibrary/beatSheetRoutes.ts server/projectLibrary/routes.ts server/projectLibrary/store.ts server/routes.ts shared/projectLibraryApi.ts tests/server/beatSheetRoutes.test.ts tests/server/projectLibraryStore.test.ts
git commit -m "feat(beat-sheet): refresh on open, server-owned beat fields on save, refresh and status routes"
```

---

### Task 6: Names on screen

**Files:**
- Modify: `client/src/components/shell/TopBar.tsx:13` (`label: 'Beat Sheet'`)
- Modify: `client/src/lib/leftZone.ts:50` (`outline: 'Beat Sheet'`), `:100` (`'No beats yet.'`)
- Modify: `client/src/components/writing/OutlineTab.tsx:144` (`Beat Sheet`), `:146` subtitle → `'What Story-drive ratified, and what the camera sees.'`, `:121` confirm text, `:168-170` (`Clear answers`)
- Modify: `client/src/components/writing/outline/ClearOutlineDialog.tsx:21-22` (`Clear answers?` / `Choose how much to remove from this page.`)
- Modify: `client/src/components/writing/outline/OutlineDocumentView.tsx:50,56,74` (`Compose this Beat Sheet`)
- Modify: `client/src/lib/documentMarkdown.ts:67` (`# Beat Sheet`)
- Modify: `client/src/components/writing/WritersRoom.tsx:34` (`beats`), `client/src/components/home/HomeSurface.tsx:681` (`beat sheet`), `client/src/components/memory/MemoryPatchPreview.tsx:12` (`'Beat Sheet'`), `client/src/lib/surfaceAwareness.ts:44` (`'Beat Sheet'`)
- Test: `tests/components/OutlineTabNames.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TopBar } from '../../client/src/components/shell/TopBar'
// take minimalTopBarProps from the existing TopBar test in tests/components
describe('names on screen', () => {
  it('the writing tab says Beat Sheet, never Outline', () => {
    render(<TopBar {...minimalTopBarProps} />)
    expect(screen.getByText('Beat Sheet')).toBeInTheDocument()
    expect(screen.queryByText('Outline')).toBeNull()
  })
  it('no user-facing "Outline" label remains in the listed files', () => {
    for (const file of ['client/src/components/shell/TopBar.tsx', 'client/src/lib/leftZone.ts', 'client/src/components/writing/OutlineTab.tsx', 'client/src/components/writing/outline/ClearOutlineDialog.tsx', 'client/src/components/writing/outline/OutlineDocumentView.tsx', 'client/src/lib/documentMarkdown.ts']) {
      const lines = readFileSync(path.join(process.cwd(), file), 'utf8').split('\n').filter(line => !line.trimStart().startsWith('import'))
      expect(lines.join('\n'), file).not.toMatch(/['"`][^'"`\n]*\bOutline\b[^'"`\n]*['"`]/)
    }
  })
})
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Change the strings** listed in Files. Leave server prompt text (`server/routes.ts`, `openaiService.ts`, compose contracts) alone; the AI still calls the document "outline" internally and that is not on screen.
- [ ] **Step 4: Run** `npx vitest run tests/components` → PASS; fix any test that asserted the old label (search tests for `'Outline'`).
- [ ] **Step 5: Commit** `git commit -am "feat(beat-sheet): rename Outline to Beat Sheet on screen"`.

---

### Task 7: Beat Sheet page — read-only beats, status line, Refresh, read-response plumbing

**Files:**
- Create: `client/src/components/writing/outline/BeatSheetView.tsx`
- Create: `client/src/components/writing/outline/BeatSheetStatusLine.tsx`
- Create: `client/src/lib/beatSheetClient.ts`
- Modify: `client/src/components/writing/outline/OutlineEditView.tsx` (deck filtering)
- Modify: `client/src/lib/outlineDeck.ts` (export `SERIES_FOUNDATIONS` = the `SERIES_SPINE` cards)
- Modify: `client/src/lib/useProjectState.ts` (add `replaceOutlineDocument(doc)`)
- Modify: `client/src/lib/projectStorage.ts:118` (`ProjectStorageAdapter.readProject` returns `ProjectStorageReadResult = { result: ProjectPackageReadResult; beatSheet: BeatSheetSyncStatus | null }`; the File System Access adapter returns `beatSheet: null`), `client/src/lib/serverProjectStorage.ts:118-125` (parse `ProjectLibraryReadResponseSchema`, pass `beatSheet` through), `client/src/lib/useWriterOSProjectLibrary.ts:203-210` (`openProject` returns `{ project, beatSheet }`), `client/src/App.tsx:415-437` (store `beatSheetStatus`, pass it to `OutlineTab`)
- Test: `tests/components/BeatSheetView.test.tsx`, `tests/lib/useProjectStateReplaceOutline.test.ts`, `tests/lib/serverProjectStorageBeatSheet.test.ts`

**Interfaces:**
- `replaceOutlineDocument(doc: AuthoredDocumentState<OutlineDocumentContent>)`: sets `documents.outline` to exactly `doc` (no revision bump, no timestamp change) and rebuilds the legacy view; used only for server-written outlines.
- `BeatSheetView` props: `{ content: OutlineDocumentContent; status: BeatSheetSyncStatus | null; lookbook: LookbookDocument | undefined; onRefresh(): Promise<void>; onAskQuestions(beatKey): Promise<void>; onAnswer(beatKey, questionId, answer): void; onDismiss(beatKey, questionId): void; onRemoveOrphan(beatKey): void; refreshing: boolean }`.
- Layout when `content.beatSheetSource` exists: status line, then Foundations cards (unchanged `OutlineCard`s from `SERIES_FOUNDATIONS`), then one `<article>` per unit: movement label (when it changes), number + title, body paragraph, then `<LookbookBeat>` (Task 8). When it does not exist: today's `OutlineEditView` deck (renamed), plus the status line only if `status && status.kind !== 'not-linked'`.
- `BeatSheetStatusLine` copy, by kind:
  - `unchanged`/`updated`: `Beat sheet from Story-drive · 14 beats · synced 29 Sep 2026 17:42` and, when a background `GET status` says `updated`: ` · Story-drive has changed since — Refresh`.
  - `unavailable`: `Couldn't reach Story-drive (<message>). Showing the last synced beats.`
  - `malformed`: `Story-drive's beat sheet couldn't be read (<message>). Showing the last synced beats.`
  - `reopened`: `This beat sheet was reopened in Story-drive. Showing the last ratified beats.`
  - `ambiguous`: `More than one decision claims to be the beat sheet. Nothing changed.`
  - `no-beat-sheet`: `Linked to Story-drive, but no ratified beat sheet yet.`
  - Refresh button always present when linked; disabled while `refreshing`.

- [ ] **Step 1: Failing tests**

```tsx
describe('BeatSheetView', () => {
  it('renders each beat read-only with movement headers and no textarea for beat text')
  it('keeps the Foundations cards above the beats')
  it('hides the five series-engine cards and the Episode map when a beat sheet is synced')
  it('shows the full deck when there is no beat sheet')
  it('status line says synced with count and time')
  it('status line says the beats are untouched on unavailable/malformed/reopened')
  it('Refresh calls onRefresh and disables while refreshing')
})
describe('replaceOutlineDocument', () => {
  it('replaces the outline without bumping revision')
})
describe('server adapter read', () => {
  it('returns beatSheet from the GET body and throws on a body without it')
  it('the folder adapter returns beatSheet null')
})
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement.** `beatSheetClient.ts`:
```ts
export async function postBeatSheetRefresh(projectId: string, sessionToken: string) {
  const res = await fetch(`/api/project-library/projects/${encodeURIComponent(projectId)}/beat-sheet/refresh`, { method: 'POST', headers: { 'X-WriterOS-Session': sessionToken } })
  if (!res.ok) throw new Error(`Refresh failed (${res.status}).`)
  return BeatSheetRefreshResponseSchema.parse(await res.json())
}
export async function getBeatSheetStatus(projectId: string, sessionToken: string): Promise<BeatSheetSyncStatus> { /* GET …/status, parse */ }
```
In `App.tsx` `handleOpenFolderProject`, keep `beatSheet` from `openProject` in `beatSheetStatus` state and pass it down. `onRefresh`: `const { beatSheet, outline } = await postBeatSheetRefresh(...)`; `if (outline) project.replaceOutlineDocument(outline)`; `setBeatSheetStatus(beatSheet)`. On the page's mount when linked, call `getBeatSheetStatus` once and show "has changed since" if it returns `updated`.

- [ ] **Step 4: Run** `npx vitest run tests/components tests/lib` → PASS.
- [ ] **Step 5: Commit** `git commit -am "feat(beat-sheet): read-only Beat Sheet page with Story-drive status and Refresh"`.

---

### Task 8: Lookbook — questions, answers, orphans (client + state)

**Files:**
- Create: `client/src/components/writing/outline/LookbookBeat.tsx`
- Create: `client/src/lib/lookbookClient.ts`
- Modify: `client/src/lib/useProjectState.ts` (`setLookbook(updater)`), `client/src/components/writing/outline/BeatSheetView.tsx` (mount `LookbookBeat` per beat + an "Orphaned answers" section at the end)
- Test: `tests/components/LookbookBeat.test.tsx`, `tests/components/BeatSheetOrphans.test.tsx`

**Interfaces:**
- `setLookbook(updater: (doc: LookbookDocument) => LookbookDocument)`: starts from `documents.lookbook ?? emptyLookbook()`, goes through `update()` so the normal autosave writes `documents/lookbook.json`.
- `LookbookBeat` props: `{ beatKey: string; beatTitle: string; beat: LookbookBeat | undefined; nothingToSee: boolean; onAsk(): Promise<void>; asking: boolean; askError: string | null; onAnswer(questionId, answer): void; onDismiss(questionId): void }`.
- Per beat: button `Ask Zoe what this looks like` (label becomes `Ask Zoe for more` once questions exist); each live question is a prompt line plus a plain `<textarea>` (Ben's words, no options); `Dismiss` sets `dismissedAt` (hidden, not deleted). A beat whose last ask returned zero questions shows `Zoe found nothing to see here yet.`
- Orphans: `orphanedBeatKeys(lookbook, new Set(content.units.map(u => u.id)))` renders after the beats under the header `Answers from beats that are no longer in Story-drive`, each with `titleAtAsk`, its questions and answers read-only, and a `Remove` button that deletes that beat entry from the lookbook (explicit, never automatic).

- [ ] **Step 1: Failing tests**

```tsx
it('renders questions with a free-text answer box and no option pickers')
it('typing an answer calls onAnswer with the beat key and question id')
it('Dismiss hides the question but keeps it in the document (dismissedAt set)')
it('a beat with zero questions after an ask shows the nothing-to-see line')
it('answers for a beat key that is no longer live appear under the Orphaned header with titleAtAsk, not under any live beat')
it('Remove on an orphan deletes only that beat entry')
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** per Interfaces. `setLookbook` in `useProjectState.ts`:
```ts
const setLookbook = useCallback((updater: (doc: LookbookDocument) => LookbookDocument) => {
  update(s => ({ ...s, documents: { ...s.documents, lookbook: updater(s.documents.lookbook ?? emptyLookbook()) } }))
}, [update])
```
- [ ] **Step 4: Run → PASS.** Also run `tests/server/writerOSObserver*.test.ts` and confirm by reading `detectDocumentChanges` (writerOSObserver.ts:117-146) that `documents/lookbook.json` is not diffed; add the comment `// documents/lookbook.json is working notes, never analysed.`
- [ ] **Step 5: Commit** `git commit -am "feat(lookbook): per-beat visual questions, answers in the writer's words, orphaned answers kept visible"`.

---

### Task 9: Zoe writes the questions (server route)

**Files:**
- Create: `server/lookbook/buildLookbookPrompt.ts`, `server/lookbook/lookbookRoutes.ts`
- Modify: `server/routes.ts` (register), `shared/lookbook.ts` (request/response schemas)
- Test: `tests/server/lookbookRoutes.test.ts` (harness from `tests/server/personaCapabilityRoute.test.ts`; stub the model provider)

**Interfaces:**
- Request `POST /api/lookbook/:projectId/questions` (same-origin + session), body:
  ```ts
  LookbookQuestionsRequestSchema = z.object({ beatKey: z.string().min(1), clientRequestId: z.string().min(1) }).strict()
  ```
  The server reads the package (`store.readProject(projectId)`), finds the unit whose `id === beatKey` in `documents.outline.content.units`; 404 `{ error: 'beat_not_found' }` if absent. Beat title, body (`whatHappens`) and movement (`actOrSequence`) come from that unit, never from the client. `existingPrompts` are the live (non-dismissed) prompts already in `documents.lookbook?.beats[beatKey]` on disk.
- Response `{ questions: { prompt: string }[], nothingToSee: boolean, memoryReceipt }`, 3–5 prompts or zero with `nothingToSee: true`. 422 `{ error: 'lookbook_failed', reason }` when the model output does not validate after two tries.
- Server: builds `AgentMemoryContext` with `buildAgentMemoryContext(provider, projectId, { message: unit.whatHappens, surface: 'outline', personaId: 'zoe' })` so canon is in view; system prompt = Zoe's persona voice (from `PERSONAS.zoe` in `shared/personas.ts`) plus the Lookbook contract below; parses with `extractFirstJsonObject` (openaiService.ts:244) then `z.object({ questions: z.array(z.object({ prompt: z.string().min(8).max(240) })).max(5), nothingToSee: z.boolean() })`.
- Lookbook contract (verbatim in `buildLookbookPrompt.ts`):
  > You write questions for a Lookbook: what the camera sees in this beat. Ask only about place, time of day, light, what is in the room, wardrobe, the one image that tells us who these people are, and objects a later beat pays off. Three to five questions, each one sentence, each answerable by the writer in their own words. Never propose answers. Never question or contradict the project's canon; build on it. Do not repeat any prompt in `existingPrompts`. If this beat has nothing for the camera, return zero questions and nothingToSee true. Reply with JSON only: {"questions":[{"prompt":"…"}],"nothingToSee":false}.

- [ ] **Step 1: Failing tests**

```ts
it('returns 3–5 prompts from a valid model reply and a receipt')
it('returns zero prompts with nothingToSee when the model says so')
it('422s when the model reply is not JSON twice, and writes nothing')
it('builds the prompt from the on-disk unit, not from the request (assert on the stubbed provider call)')
it('404s for a beatKey that is not in the outline')
it('requires the session header')
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement**, reusing `createModelProvider()` and the retry-then-validate shape of `callComposeModel` (server/compose/composeDocument.ts:18).
- [ ] **Step 4: Client wiring:** `lookbookClient.ts` `postLookbookQuestions(projectId, sessionToken, { beatKey, clientRequestId })`; `BeatSheetView.onAskQuestions(beatKey)` posts, then `setLookbook(doc => …)` appends the returned prompts as questions with fresh ids (`lb_` + random hex), `titleAtAsk` = the beat's title. Zero prompts → set `beats[beatKey] = { titleAtAsk, questions: beat?.questions ?? [] }` and remember `nothingToSee` in component state for the line.
- [ ] **Step 5: Run** the full suite: `npx vitest run` → all green; `npm run check` clean; `npm run build` succeeds.
- [ ] **Step 6: Commit** `git commit -am "feat(lookbook): Zoe writes visual questions per beat on request"`.

---

### Task 10: Go-live (Ben runs the commands; Claude prepares and verifies)

**Files:** none in the repo. Uses `~/.local/bin/writeros-backup`, `~/.local/bin/writeros-deploy`, `~/WriterOS-Prod`.

- [ ] **Step 1: Merge order.** Merge NOT-66 (`not-66-wayfinder`) into dev main, then `feat/beat-sheet-lookbook`, push. Codex review of the built branch before merging (per Ben's standing rule).
- [ ] **Step 2: Dry run on copies.** Copy `~/WriterOS Projects` to `/private/tmp/…/writeros-dryrun/`, start the new build on port 5199 against the copy (as in the 2026-09-29 catch-up: `WRITEROS_PROJECTS_ROOT=<copy> PORT=5199 node dist/index.js`), register the *copied* Grave Affairs package against the real Story-drive folder (read-only source), open every package via the API, and run:
  ```bash
  # before/after hash of every package file; ignore project.json and memory/analysis-queue.json
  find "<copy>" -type f ! -name analysis-queue.json ! -name project.json -exec shasum -a 256 {} + | sort > after.txt
  diff before.txt after.txt
  ```
  Expected: the only differing line is Grave Affairs' `documents/outline.json`. Then `git diff --no-index` the before/after copies of Grave Affairs' `project.json`: only `openedAt`/`updatedAt` may differ.
- [ ] **Step 3: Backup.** Ben runs `writeros-backup`; confirm `OK:` in `~/Library/Logs/writeros-backup.log` and note the archive name in the deploy log line.
- [ ] **Step 4: Tag and deploy.** `cd ~/WriterOS-Prod && git tag live-before-beatsheet` then Ben runs `writeros-deploy`. Verify health 200 and the projects list.
- [ ] **Step 5: Register Grave Affairs (live).** Ben runs, from `~/WriterOS-Prod`:
  ```bash
  npx tsx server/projectMemory/cli.ts link-source --project "/Users/ben/WriterOS Projects/Grave Affairs (eea74df4).writeros" --workflow wayfinder --from "/Users/ben/Library/Mobile Documents/com~apple~CloudDocs/My Scripts/Grave Affairs" --beat-sheet resolved/lay-the-pilot-beat-sheet.md
  npx tsx server/projectMemory/cli.ts sync-beats --project "/Users/ben/WriterOS Projects/Grave Affairs (eea74df4).writeros" --dry-run
  ```
  Expected dry run: `kind: updated`, `beatCount: 14`, `removed` = the fourteen `pilot.beatNN` ids, `added` = fourteen `beat.…` keys. Then `--apply`, then open Grave Affairs in the app and confirm the status line reads synced with 14 beats.
- [ ] **Step 6: Record** the archive name, tag, and live commit in memory and the deploy log.

---

## Self-review

- **Spec coverage:** §1 beat sheet fed from Story-drive → Tasks 1, 3, 4, 5. Declaration → D1/Task 3 step 4. Identity → D2/Task 1. Read-only → Task 7. Shows without → Task 3 (not-linked) + Task 7 deck fallback. §2 stays current → Task 5 (open, server-owned beat fields) + Task 7 (button, status) + A2. §3 Lookbook → Tasks 8, 9; answers hang off keys, orphans shown → Task 8; storage → D5/Task 2; who writes → D6/Task 9; Front Lot out of scope, nothing blocks it (lookbook.json is a plain keyed file). §4 names → Task 6. "What we want back" 1–5 → Part A.
- **Round 1 changes:** link moved out of `project.json` into a registry (rollback-safe); whole sync inside the package lock; `POST refresh` returns the written outline; server-owned beat fields on save (D9) with an observer test; duplicate titles refused, A2 and D2 now agree; registry root re-guarded on every sync; Zoe route takes only `beatKey`; lookbook carried through `migrateState` and browser save with tests; read-response type plumbed through adapter/hook with tests; import fails on a folder mismatch unless `--relink`.
- **Round 2 changes:** D9 merge moved into the PUT route before save and observer, with whole-document reuse when only beat fields differed (revision/updatedAt included) and tests for the stale-only and stale-plus-edit cases; `documents/lookbook.json` is removed from staging when the payload has none; Story-drive reads use `root.canonicalPath`; one deadline covers every Story-drive filesystem call including the `resolved/` scan; the registry write runs under the package lock helper with a fixed id and has a concurrency test; the "never writes project.json" claim is scoped to the sync and registry.
- **Type consistency:** `BeatSheetSyncStatus` and `BeatSheetSyncResult` (Task 3) are what Tasks 4, 5 and 7 consume; `LookbookDocument` (Task 2) is what Tasks 8 and 9 consume; `replaceOutlineDocument` and `setLookbook` are named identically in Tasks 7 and 8; `beatKey(title)` takes one argument everywhere.
- **Review Focus:** items 1–5 each have a named test in Tasks 3, 1+3, 5, 8, 9 respectively.
