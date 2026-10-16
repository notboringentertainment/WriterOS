# WriterOS pare-down: canon home + script, pages written by Morgan

Date: 2026-10-15 · Branch: `plan/pare-down` · Status: APPROVED by Codex (round 4) and Ben — Codex builds
Review log: `docs/plans/2026-10-15-writeros-pare-down-review-log.md`

## Why

WriterOS tries to be four editors plus a canon home. The 2026-10-15 audit (`~/Projects/dry-runs/2026-10-15-writeros-audit/`) found what that costs:

- three character lists that never sync (F3)
- five ways canon gets written (F4)
- five of the six work-loss bugs, in the editors and their save layer (F19–F24)
- question decks that re-ask what canon already knows. The Story Bible asks 29 questions, several of them twice.

Ben's direction (2026-10-15):

- WriterOS is the home for canon and the script.
- Synopsis, Treatment and Outline stay as pages, but Morgan writes them on request, in that format, from canon. There are no preformed question boxes.
- Morgan asks only what canon doesn't answer, and every question names the gap it fills.
- A later page works around what an earlier page settled, and warns of any clash before changing it.
- Voice profile and Writers' Room get their own page about the writer.
- Economy: the build is judged by what it removes.
- **The canon system does not change behaviour.** Impeccable improves the UI, not function.

## Hard boundary: the canon system is frozen

These keep their current behaviour. The plan may read from them and add UI around them, but never change what they do, which files they watch, or what they write:

- The project memory ledger and records (`server/projectMemory/*`): promote / ratify / lock, `buildAgentMemoryContext`, the analyzer.
- The save observer (`server/projectMemory/writerOSObserver.ts`): its watched files (synopsis, outline, treatment, story-bible) and its hashing are unchanged.
- Its appeals to Story-drive (`server/appeals/*`).
- Beat sheet sync (`server/projectMemory/beatSheetSync.ts`, `server/beatSheet/*`) and `documents/outline.json`, which holds the beat sheet.
- Morgan's `outline` and `storyBible` proposal targets, and the synced-beat guard (`server/morganHost/proposals.ts:30-41`).
- Look drafting and promotion, and everything Front Lot reads.
- The wayfinder import CLI, `npm run memory -- report`, What's Standing.
- Morgan's canon rule: canon changes only with the writer's yes in conversation (`server/morganHost/persona.md`).

**Enforcement.** The canon test files run unedited in every phase, except as noted below:
- `tests/server/projectMemory*`
- `appeal*`
- `beatSheet*`
- `look*`
- `whatsStanding*`
- `structuredDocumentPatch`
- `tests/server/room/`
- `tests/components/MemoryAppeals*`

Editing any of them needs Ben's explicit sign-off in the PR.

**The one authorised test edit** (Codex R2 #3): assertions that a retired Synopsis/Treatment write target *succeeds* are rewritten to assert it is now refused. This applies to `structuredDocumentPatch.test.ts` (the `/api/wp-chat` synopsis patch) and any Room or memory-patch test for those two targets. Every canon-authority assertion and every assertion on a surviving target (`storyBible`, `outline`) stays as it is. The PR lists each changed assertion.

**One exception: F18 (Phase 0).** Half-typed Story Bible locks become canon, which is a bug *against* the canon rule. Fixing it restores intended behaviour. It ships as its own reviewed PR.

## Key decision: new page files, legacy documents frozen in place

Synopsis and Treatment content is **not** migrated or rewritten. Their files (`documents/synopsis.json`, `documents/treatment.json`) stay on disk byte-for-byte. They are no longer editable in the UI and keep being read by existing readers. The prose pages live in new files, `documents/pages/{synopsis,treatment,outline}.json`.

What this design does:

- **No lossy migration** (Codex R1 #1, #2). Every authored field, series content included, stays exactly where it is.
- **No observer churn** (R1 #5). The frozen files never change, so they never trigger analysis. The new page files are not on the observer's list, which is unchanged. Approval stamps live in the page files and can't cause analysis.
- **No reader breaks between phases** (R1 #3). Legacy fields stay readable until each reader is moved, with a fallback.
- **Facts from pages reach canon only by explicit yes.** Morgan says what she'll change in canon, waits for Ben's yes, and changes it, exactly as today. This matches the 2026-08-15 "canon explicit only" ruling. (The draft's Q3 is withdrawn: watching a new file would be a canon behaviour change, R1 #6.)

What it costs: the duplicate fields (F3) stay in storage as frozen legacy data. They can no longer drift, because nothing edits them, but they aren't deleted. Deleting them is a later, separate decision.

## Design

The mockups are in the same WriterOS look, calmer, and were checked in the browser at 1440 and 1100 pixels wide. They're in `docs/plans/pare-down-mocks/*.html`, with screenshots in `docs/plans/pare-down-mocks/shots/`.

- **Top bar: four places, three quiet tools.**
  - The places: Script · Beat Sheet · Pages · Story Bible.
  - On the right: a real save status ("Saved 2:41 PM", or an error), **Writer**, **Canon**, and ···.
  - "WriterOS" goes Home. New script and Import .fdx move to Home, so neither creates a project by surprise (F9).
- **Pages** has one switch: Outline · Treatment · Synopsis.
  - Each shows its status: not started, draft, approved, or out of date.
  - The page is prose in the existing type (Fraunces headings, Newsreader body), with no input boxes.
- **Start state** (`pages-outline-start.html`): what the format needs, and "Write it with Morgan". The mockup ticks off items canon covers. Ben chose the plain list (Q2): the build shows the list without ticks.
- **Written state** (`pages-treatment.html`): who wrote it and when it was approved.
  - If canon has changed since approval, a notice names the canon records that moved, with "Ask Morgan to update".
  - A clash shows in Morgan's panel with its source and two choices.
- **Story Bible** (`story-bible.html`): the Story Bible's own text laid out by section, with inline edit (unchanged: it's Ben's tool, and the observer handles it as today). See Phase 3 for "Still open".
- **Writer**: one page for the voice profile and the Writers' Room.
- **Canon**: Memory and What's Standing, unchanged inside, reached from one place.
- **UI-only polish:**
  - IBM Plex Sans (the sibling of the Plex Mono already in use) for labels and buttons, instead of monospace capitals
  - no kicker labels above headings
  - secondary text raised to 4.5:1 contrast
  - the tokens in `client/src/index.css` otherwise unchanged

## Phases

Each phase is its own PR, with tests and a browser walkthrough in a sandbox copy of the app (port 5277, sandbox project copies; the setup is in `audit-live.md`). Screenshots go in the PR. Deploy happens with Ben after merge.

### Phase 0: stop losing work

- **F19:** "Saved" shows only after the save succeeds. Failures show in the top bar (`TopBar.tsx:72-75`, `App.tsx:731-734`).
- **F20:** when a server restart changes the session token, open tabs fetch the new token and retry. If they can't, they show "Reload to keep saving" (`server/projectLibrary/config.ts:27`).
- **F21:** reload reopens the last folder project, not a hidden blank "Untitled Project".
- **F24:** flush the script's pending save on tab switch and unmount instead of cancelling it (`ScreenplayEditor.tsx:51-56`).
- **F18:** Story Bible lock edits reach memory once, when editing finishes, whether or not the Room panel is open (`RoomChannel.tsx:199`).
  - Tested with a fake room backend around `syncStoryLocksBlock()` and the server banking path, because the sandbox can't use the shared Room database.
- **Morgan's first-start "trust this folder" card:** answered by WriterOS for the project's own folders (audit I13).

F22 is fixed in Phase 3 with the pitch packet repoint. F23 disappears in Phase 2.

### Phase 1: the shell

- New top bar and tool menus (`TopBar.tsx`, `ProjectMenu.tsx`, `shellState.ts`).
- **Writer page:** the voice profile and Writers' Room together.
  - The voice profile is stored in the project library on the server instead of browser storage (F11).
  - One line in Morgan's persona tells her to read it.
- The **Canon** menu opens the existing Memory and What's Standing pages, unchanged. What's Standing leaves the tab row.

### Phase 2: pages written by Morgan

**Storage**
- New schema `PageDocument`: `{ page: 'synopsis' | 'treatment' | 'outline', markdown, status: 'draft' | 'approved', revision, approvedAt?, approvedCanon? }`.
  - `approvedCanon` is the list of active canon record ids, each with its version marker, at approval.
- Add the three paths to `PACKAGE_TEXT_PATHS`, the package loader, and `projectState` / `useProjectState` as a separate `pages` slice. The existing `documents` slice and its schema are untouched.
- **Page writes are their own call** (R2 #4): `PUT /api/projects/:id/pages/:page` with `{ expectedRevision, page }`.
  - The server checks the persisted revision and writes, inside the existing package lock. A stale write is refused with the current page, and the newer page is never replaced.
  - The whole-project save never writes page files.
- **The legacy files are actually frozen** (R2 #1).
  - `serializeWriterOSProjectPackage()` copies `documents/synopsis.json` and `documents/treatment.json` from the locked on-disk snapshot instead of re-serializing them.
  - `withProjectFormat()` skips the two frozen documents, so their headers and timestamps never change.
  - `migrateState()` and `saveProjectState()` stop calling `syncSynopsisFormatMirror()` and `syncTreatmentFormatMirror()`, so the in-memory values match disk (R3).
  - The save route (`server/projectLibrary/routes.ts`) passes the observer the two frozen files' actual bytes from the preserved package snapshot, not a re-serialization. The observer itself is unchanged; it simply gets accurate inputs.
  - A test changes the project format, saves, and asserts that both files are byte-identical and that the observer queues neither document.
- **Seeding:** the first time a page opens with no page file, the server seeds the draft once and writes it only to the new file. Seeding is seed-if-absent inside the package lock, so two tabs can't both seed. The draft comes:
  - from the legacy `composed` prose, if any
  - otherwise from a full markdown rendering of every populated legacy field
- `synopsisToMarkdown` and the treatment converter are extended to cover the series branch, production notes and header fields. A test asserts that every populated string in a fixture appears in the output.
- The Outline page seeds from the legacy composed outline if one exists; otherwise it starts empty.

**Morgan**
- **Format files:** four short files, `server/morganHost/formats/{synopsis,treatment,outline,story-bible}.md`, each listing what that document must contain.
  - They're drawn from Ben's templates (`ai-film-writing-templates` references) and cut to the essentials.
  - For example, a synopsis needs: who we follow, what they want, what stands in the way, the stakes, the turn, and the ending.
- **Persona rules** (`persona.md`):
  - Read the format file and canon before writing a page.
  - Ask only about items canon doesn't cover, one at a time, naming the item each question fills. No other questions.
  - Read the other pages and the beat sheet first. Never change what they settled. If a request would, name the clash with its source and ask whether to change both or keep the earlier one.
- **The page proposal path:** a new proposal target, `page`: `{ page, baseRevision, markdown }`. It touches, end to end:
  - plugin tool enum and guard (`mod/writeros-morgan/hooks/proposeTool.ts`, `guard.ts`, `protocol.ts`)
  - live-channel validation (`server/morganHost/proposals.ts`)
  - shared schema (`shared/morganLive.ts`)
  - client adapter (`lib/morganProposal.ts`)
  - App routing and a pages setter
  - outcome posting
- **Revision check:** `baseRevision` must match the page's `revision`, or the proposal is stale. This uses the same outcome states as today.
- **Keeping a proposal** writes the page as a draft. **Approve** on the page sets `approved`, `approvedAt` and `approvedCanon`.
- **Every legacy write is closed in this phase** (R2 #2):
  - Morgan's `synopsis` and `treatment` targets come out of the tool enum.
  - The Room's `propose_field_write` refuses those two surfaces.
  - The `/api/wp-chat` structured patch and memory-patch application refuse them too.
  - A pending proposal or patch for them that arrives after the deploy is refused on application, with a plain "This page is now written by Morgan" message.
  - The `outline` and `storyBible` targets and the synced-beat guard are untouched.

**Out of date**
- A page is out of date when the current active canon set (record id plus version) differs from `approvedCanon`. The notice lists the records added, changed or superseded. This is read-only from the store.
- Non-canon memory events don't count (R1 #10). Page saves can't add any, because page files aren't observed.

**Removed in Phase 2**
- The Synopsis and Treatment edit views and question decks: `synopsisDeck.ts`, `treatmentDeck.ts`, the `SynopsisTab` / `TreatmentTab` edit views, and their `*Readiness.ts`.
- The Edit/Document toggle.
- The three **model** composition branches (`composeTreatment` / `composeSynopsis` / `composeOutline`), their clients, and those surfaces of `/api/compose-document`.
- **Kept:** `composeWhatsStanding()` and every helper it and the memory CLI depend on (deterministic composition, rendering, inventory, fidelity, `renderComposedMarkdown`) (R1 #8).

This removes F13, F23 and the gpt-4o-mini dependency for these documents (part of F5).

### Phase 3: Story Bible and readers

**Story Bible**
- Replace the 29-question deck (`storyBibleDeck.ts` questions, `StoryBibleStoryCoachEditView.tsx`) with a sectioned view of the same Story Bible fields, in about six sections from Ben's story-bible template, with inline edit.
  - Duplicate questions collapse to one shown section.
  - No field is deleted. A retired field with text in it is shown under its merged section.
- **Labels are honest** (R1 #9). It's the Story Bible text, not "canon". An empty section reads "Not written yet", with "Ask Morgan". She reads canon and proposes Story Bible text through her existing `storyBible` target, at Ben's yes.
- **"Still open"** lists the ledger's active `open_question` records, which are the same source What's Standing uses. Each has "Ask Morgan".
- Signed Front Lot looks show on the Story Bible's people (audit F7). This is read-only.

**Readers**
- **Inventory first** (R1 #4). The first task is a table of every read and write of synopsis / treatment / outline document content, built from a grep across `client/`, `server/`, `shared/`, `mod/`. It must include:
  - `surfaceAwareness.ts`
  - `documentMigration.ts`
  - project normalization and format mirrors
  - App's seed-export assembly (`App.tsx:745`)
  - the memory-patch path (`shared/memoryPatches.ts`, `client/src/lib/memoryPatch.ts`)
  - the Room's `propose_field_write` (`server/room/roomToolset.ts:31`)
  - pitch packet, seed markdown, `WritersRoom.tsx`, `wpRouting.ts`, `personaCapability.ts`, `leftZone.ts`, `reachContract.ts`
- Each entry is assigned one of four outcomes, and the table is reviewed before code:
  - **page prose:** it needs the written document
  - **Story Bible:** it needs a fact
  - **legacy fallback**
  - **remove:** a write target into a frozen document
- **Fact rule:** Story Bible first, then the frozen legacy field. Readers never write canon (R1 #11).
- **Write targets:** already closed in Phase 2. Phase 3 only removes the dead code behind them.

### Phase 4: script export

- **PDF:** a print layout from the existing `paginateScript`, with the title page (`metadata/title-page.json`). It uses the browser's Save as PDF, so no library.
- **FDX:** a small writer from `parseScriptBlocks`, the reverse of `fdxImport.ts`.
- Both are in the Script toolbar and the ··· menu.

### Docs

Update `CLAUDE.md` and `docs/product/README.md` (both still say "structured documents primary") to: canon home and script, with pages written by Morgan.

## Economy check

- **Removed:**
  - three question decks and the two edit views
  - three model composer branches and their clients
  - the readiness models
  - the Edit/Document toggle
  - two top-bar tabs
  - write targets into frozen documents
- **Added:**
  - four short format files and a few persona lines
  - one `pages` slice (schema, loader, three files)
  - one proposal target
  - approval and out-of-date logic
  - the Story Bible view, which replaces a bigger one
  - two exporters
- **Kept on purpose:** the legacy synopsis and treatment files, frozen, so nothing migrates and canon sees no change.
- No new service, database, AI provider or agent.

## Verification

- **Every phase:** `npm run test:run`, `npm run check`, `npm run build`, the canon test files unedited (see the hard boundary), and a sandbox walkthrough with screenshots.
- **Canon regression, every phase:** in the sandbox, run a beat sheet change, a look promote, a memory promote and ratify, a proposal rejection, and an appeal. Compare event types and authority transitions with the same run on `origin/main`. IDs and model text are excluded (R1 #12). Stale proposals are covered by tests.
- **Phase 2:** the frozen files are byte-identical before and after a full session of page work. No new ledger events come from page saves.
- **Phase 2 live test:** on a sandbox copy of a Story-drive-linked project, Morgan writes a synopsis.
  - Count her questions: each must name a missing item, and none may ask what canon holds.
  - Then request a treatment change that clashes with the outline. Confirm she raises the clash before any change.

## Decisions from Ben (2026-10-15)

- Q1: **Keep and repoint.** Project Meeting and pitch packets move to the ··· menu. Phase 3 points the pitch packet at the Story Bible and page prose, and fixes F22 so export never deletes a saved or approved packet.
- Q2: **Plain list first.** The start state shows what the format needs without ticks; Morgan says in chat what canon already covers.
