# Phase 3 reader inventory: synopsis / treatment / outline content

Date: 2026-10-16 · Branch: `build/pare-down-phase3` · Plan: `2026-10-15-writeros-pare-down.md`, section "Phase 3: Story Bible and readers"

Built from a grep of `client/`, `server/`, `shared/`, `mod/` for reads and writes of `documents.synopsis`, `documents.treatment`, `documents.outline`, the legacy mirrors `state.synopsis` / `state.outline`, and the `projectContext.synopsis` / `.treatment` fields derived from them. Tests are not listed.

## Outcomes

- **page prose**: the reader needs the written document. It reads `pages[page].markdown` (draft or approved) and falls back to the legacy fields only when no page has text.
- **Story Bible**: the reader needs a fact. Story Bible field first, then the frozen legacy field (fact rule). Legacy values are a fallback, never a competing candidate.
- **legacy fallback**: stays on the frozen legacy document on purpose.
- **remove**: dead code behind a write target already closed in Phase 2.

Two labels are not reader moves, and are listed so nothing is silently skipped:

- **keep: beat sheet**. `documents/outline.json` holds the beat sheet, which is frozen canon (hard boundary). Readers of its units/spine are not readers of the Outline *page*, so they stay.
- **keep: refusal**. The Phase 2 closures that refuse synopsis/treatment writes stay, so a late proposal or patch still gets the plain refusal.

## The table

| # | Where | What it reads or writes | Outcome | Change in Phase 3 |
|---|---|---|---|---|
| I1 | `client/src/lib/wpRouting.ts:515-667` `buildProjectContext` | `synopsis` logline, prose, series, sections; `treatment` concept, characters, prose, visual, open questions; for every `/api/wp-chat`, specialist, Zoe look and OpenSwarm call | page prose + Story Bible | Add `pages: { synopsis, treatment, outline }` (page markdown) to the context. `logline` becomes Story Bible `onePagePitch.logline`, then legacy. Legacy structured fields stay in the context as the fallback the server uses when a page is empty. |
| I2 | `server/routes.ts:295` `projectContextSchema` (wp-chat / OpenSwarm request) and `shared/personaCapability.ts:268` (Zoe research request) | shape of I1 | page prose | Add optional `pages` to both. Optional so an older open tab still validates. |
| I3 | `server/routes.ts:589` `projectContextLogline` | synopsis logline parts, legacy logline | Story Bible | Story Bible logline (arrives via I1 `logline`) first, then legacy. |
| I4 | `server/routes.ts:606-660` `buildSynopsisContextLines` / `buildStoryMemorySynopsis` | synopsis prose / series / sections | page prose | Synopsis page markdown when it has text; legacy lines otherwise. Feeds wp-chat StoryMemory and the OpenSwarm prompt. |
| I5 | `server/routes.ts:1179` `synopsisSections` in StoryMemory | legacy synopsis sections | page prose | Sent only when there is no synopsis page text; otherwise `{}`. (`openaiService.ts:598` prefers sections over prose, so leaving them would hide the page.) |
| I6 | `server/routes.ts:662-720` `buildTreatmentContextLines` / `buildStoryMemoryTreatment` | treatment concept, characters, prose, visual, open questions | page prose | Treatment page markdown when it has text; legacy lines otherwise. |
| I7 | `server/routes.ts:506-583` `buildStoryMemoryCharacters` | Story Bible characters, then treatment main characters and synopsis series characters merged in | Story Bible | Story Bible characters win. A legacy character is added only when no Story Bible character has that name. |
| I8 | `server/routes.ts:800-835` OpenSwarm context inventory counts | synopsis/treatment field counts | page prose | Counts follow I4/I6 (a page counts as written). |
| I9 | `server/ai/openaiService.ts:436-443, 598-627, 752, 840` | StoryMemory `synopsis`, `synopsisSections`, `treatment`, logline | page prose | No code change: it reads StoryMemory, which I4–I6 now fill from the pages. |
| I10 | `server/ai/morganRuntime/reachContract.ts:25-27` | StoryMemory synopsis / sections / treatment | page prose | No code change: follows I4–I6. |
| I11 | `server/persona-capability/buildResearchPrompt.ts:52, 91` (Zoe research) | synopsis sections, logline | page prose | Synopsis page markdown when present, else legacy sections. |
| I12 | `shared/personaCapability.ts:413-452` context chips | logline, synopsis sections | page prose | `synopsis` chip lights when the synopsis page has text or legacy sections do. |
| I13 | `client/src/components/writing/WritersRoom.tsx:37` Sam's summary | `state.synopsis.logline` | Story Bible | Story Bible logline, then legacy. |
| I14 | `client/src/components/writing/WritersRoom.tsx:47-49` Alex's summary | treatment prose opening / premise | page prose | First line of the treatment page, then Story Bible premise, then legacy. |
| I15 | `client/src/components/writing/WritersRoom.tsx:24` Oliver's summary | outline spine and units | keep: beat sheet | None. |
| I16 | `client/src/lib/leftZone.ts:104-118, 182-186` synopsis spine + count | synopsis prose sections | page prose | Nodes are the synopsis page's `##` headings; count is headings written. |
| I17 | `client/src/lib/leftZone.ts:121-145, 178-179` treatment spine + count | treatment acts, custom sections, characters | page prose | Same as I16 for the treatment page. |
| I18 | `client/src/lib/leftZone.ts:88-102, 176-177` | outline units | keep: beat sheet | None. |
| I19 | `client/src/lib/surfaceAwareness.ts:20-38` | outline deck answers | keep: beat sheet | None. |
| I20 | `client/src/lib/surfaceAwareness.ts:41-43` | synopsis / treatment → `none` | legacy fallback | None (already reads nothing). |
| I21 | `client/src/App.tsx:847-856` `handleExportSeed` | synopsis + treatment content into the seed | page prose + Story Bible | Passes the synopsis page markdown; see I22. |
| I22 | `shared/seedMarkdown.ts:59-184` | title, logline, format, genre, comps from synopsis header; synopsis prose; treatment open questions | page prose + Story Bible | Facts: Story Bible cover/pitch/tone first, legacy synopsis header second. Synopsis section: page markdown, else legacy prose. Open questions: legacy fallback (no other written home; ledger questions go through What's Standing). |
| I23 | `shared/pitchPacket.ts:152-220` `composePitchPacket` | title, logline, format, genre, tone, premise, comps, characters, open questions from synopsis/treatment/Story Bible | Story Bible | Each scalar: Story Bible field if written, else the legacy candidates as today. Story engine: Story Bible `storyEngine` (feature propulsion or series engine by format), which today is always empty. Comps: Story Bible comps, else legacy. Characters already Story Bible first. Treatment open questions stay as a legacy source. |
| I24 | `server/room/interview/pitchPacketRuntime.ts:47-90` + `client/src/lib/useInterviewSession.ts:368` | `documents` sent to the packet composer and the AI proposal pass | page prose | Client also sends `pages`; the proposal pass is grounded on the page prose too. |
| I25 | `server/room/interview/pitchPacketStore.ts:30-42` (F22) | deletes every draft/approved packet before a new draft | (bug fix, Q1) | Opening the packet returns the session's existing draft or approved packet instead of deleting it; a new draft is made only when none exists. |
| I26 | `client/src/App.tsx:1133-1144` wp-chat `documentSnapshot` | sends `documents[synopsis\|treatment]` as a patch base | remove | Snapshot only for `outline` and `storyBible`; the server refuses the other two anyway. |
| I27 | `client/src/App.tsx:456-463` patch setters | `setSynopsisDocument`, `setTreatmentDocument` passed to `applyMemoryGroundedPatch` | remove | Drop the two setters. |
| I28 | `client/src/lib/memoryPatch.ts:73-75, 114, 127-135` | synopsis/treatment setters and apply cases | remove (keep refusal) | The refusal at :114 stays; the unreachable `case 'synopsis'` / `'treatment'` and their setter types go. |
| I29 | `client/src/lib/useProjectState.ts:140-190, 275-293, 434-503` | `clearSynopsis`, `setSynopsisDocument`, `setSynopsisViewPreferences`, `setTreatmentDocument`, `setTreatmentViewPreferences`, `clearTreatment` | remove | No caller after I27 (verified by grep: only App.tsx:461/463 today). |
| I30 | `shared/memoryPatches.ts:25, 57-59, 103-105, 193-202` | synopsis/treatment in surfaces, routing regexes, schemas | keep: refusal | Unchanged. The server's refusal (`structuredDocumentPatch` protected test) needs the surface to parse so it can say "now written by Morgan". |
| I31 | `server/routes.ts:959-1060` `attemptStructuredDocumentPatch` | refuses synopsis/treatment | keep: refusal | None. |
| I32 | `server/room/roomToolset.ts:170` | refuses synopsis/treatment | keep: refusal | None. |
| I33 | `server/morganHost/proposals.ts:42`, `liveChannel.ts:212`, `mod/.../guard.ts:61` | refuse synopsis/treatment | keep: refusal | None. |
| I34 | `server/projectLibrary/store.ts:424-460` `accessPage` seeding | legacy composed / content → first draft | legacy fallback | None (Phase 2 design). |
| I35 | `client/src/lib/projectPackage.ts:279-281` serialize | writes `documents/{synopsis,outline,treatment}.json` | legacy fallback | None. Frozen-copy logic from Phase 2 (server keeps on-disk bytes). |
| I36 | `client/src/lib/projectState.ts:228, 409-472` normalize + `withProjectFormat` | legacy documents | legacy fallback | None. |
| I37 | `client/src/lib/documentMigration.ts` | legacy → document migration, `documentStoryBibleToLegacy`, `outlineContentToTreatmentContent` | legacy fallback | None. |
| I38 | `client/src/lib/documentMarkdown.ts:168-170` | synopsis/treatment → markdown (used only by I34) | legacy fallback | None. |
| I39 | `client/src/App.tsx:1301-1320` `OutlineTab` | `documents.outline`, `setOutlineDocument`, `setComposedDocument('outline')` | keep: beat sheet | None. |
| I40 | `server/projectLibrary/beatSheetRoutes.ts:53-57`, `server/lookbook/lookbookRoutes.ts:110` | outline units | keep: beat sheet | None. |
| I41 | `server/projectMemory/writerOSObserver.ts` and the rest of `server/projectMemory/*` | synopsis, outline, treatment, story-bible files | keep (hard boundary) | None. |
| I42 | `server/morganHost/persona.md` | tells hosted Morgan to read `documents/pages/*` and canon | page prose | None (already pages since Phase 2). |
| I43 | `server/routes.ts:1112` `/api/synopsis-assist` | request-body synopsis only; no client caller | not a document reader | None. Logged: route has no caller. |

## Not changed by this inventory

The Story Bible view itself (deck → sections, "Still open", looks on people) is Phase 3's other half and doesn't read synopsis/treatment. `surfaceAwareness`'s `story-bible` case reads the deck, so it moves to the new sections in the same change.
