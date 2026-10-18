# Plan Review Log: Story Bible page in Pages, Story Facts rename
Started 2026-10-18. MAX_ROUNDS=5. Plan: docs/plans/2026-10-18-story-bible-page.md

## Round 1 — Codex
The plan has material omissions. Option A and the internal name `bible` are sound.

1. **Morgan’s live channel rejects the new page.** [liveChannel.ts:387](/Users/ben/Projects/WriterOS/server/morganHost/liveChannel.ts:387) independently accepts only synopsis, treatment and outline; updating `proposals.ts` will still leave `/proposal` returning HTTP 400.
   **Fix:** Add `bible` to this validator and test an actual live-channel proposal.

2. **The shared proposal type excludes `bible`.** [protocol.ts:67](/Users/ben/Projects/WriterOS/mod/writeros-morgan/hooks/protocol.ts:67) hardcodes the three page names; `shared/morganLive.ts` re-exports this type, so the omission reaches the client.
   **Fix:** Extend the protocol union alongside the tool schema and server validators.

3. **The proposed TopBar change confuses page selection with shell tabs.** `bible` is selected through `selectedPage`, while Pages renders under the existing synopsis/treatment tabs; adding a `bible` tab would require changes to three tab unions, exhaustive records, rendering and location schemas.
   **Fix:** Explicitly retain the existing Pages shell and add `bible` only to page selection; remove the unnecessary TopBar page-list instruction.

4. **Renaming the format file breaks section-writing requests.** [StoryBibleSectionsView.tsx:48](/Users/ben/Projects/WriterOS/client/src/components/writing/storyBible/StoryBibleSectionsView.tsx:48) explicitly instructs Morgan to read `story-bible.md` and write Story Bible sections.
   **Fix:** Update this prompt to “Story Facts” and `story-facts.md`, preserving the `storyBible` proposal surface.

5. **Ordinary Morgan follow-ups identify the wrong page.** [LeftRail.tsx:113](/Users/ben/Projects/WriterOS/client/src/components/shell/LeftRail.tsx:113) derives Morgan’s surface from `activeTab`; with Story Bible selected, a typed “revise this” still reports Treatment or Synopsis. The dedicated writing button correctly sends `page:${selectedPage}`.
   **Fix:** Pass the selected page’s identity to Morgan for ordinary panel messages and test switching pages before a follow-up.

6. **The rename misses contextual labels.** [surfaceAwareness.ts:54](/Users/ben/Projects/WriterOS/client/src/lib/surfaceAwareness.ts:54) still calls the facts intake “Story Bible”; [leftZone.ts:53](/Users/ben/Projects/WriterOS/client/src/lib/leftZone.ts:53) does likewise. Separately, `App.tsx:1612` would label the new page merely “Bible.”
   **Fix:** Rename facts display titles and use the page label map in the App console, while keeping internal surface IDs unchanged.

7. **Package serialization does not export prose pages.** [projectPackage.ts:256](/Users/ben/Projects/WriterOS/client/src/lib/projectPackage.ts:256) ignores `state.pages`; adding a path only fixes reading. Existing server saves preserve page files by copying the package tree, so this is an existing serialization limitation—not proof that ordinary saves currently erase pages.
   **Fix:** Explicitly document this boundary and test Bible survival across save/reopen and copying; if state-only package serialization must preserve it, implement that without overwriting newer disk revisions.

8. **“Joins pitch packets automatically” overstates the behavior.** [pitchPacketRuntime.ts:50](/Users/ben/Projects/WriterOS/server/room/interview/pitchPacketRuntime.ts:50) includes page markdown as proposal context; it does not add a Bible section to the packet. Draft and stale pages also qualify.
   **Fix:** State that Bible becomes context for missing scalar-field proposals, and test that behavior rather than implying packet inclusion.

9. **The proposed tests miss the most likely integration failures.** Tool-schema acceptance and a switcher label would pass despite the live-channel rejection, wrong follow-up surface, or broken renamed-format reference.
   **Fix:** Add focused coverage for proposal transport, Keep→approve→reopen, stale approval/canon changes, format references, and unchanged Story Facts bytes.

VERDICT: REVISE
### Claude's response
Verified against the code: 1 (liveChannel.ts:387), 2 (protocol.ts:67), 4 (StoryBibleSectionsView.tsx:48), 6 (surfaceAwareness.ts:54, leftZone.ts:53, App.tsx:1612) are real.
- Accepted 1, 2: added to the validator list, plus a grep of every hardcoded page list as the first build task.
- Accepted 3: removed the TopBar instruction; the page is chosen through selectedPage, no new shell tab.
- Accepted 4, 6.
- 5 partly accepted: the left zone label uses the page label map. Typed follow-ups carrying the page identity is a pre-existing behavior shared by all pages (Outline has it today); not widened into this change.
- 7 accepted as a documented boundary plus a save/reopen survival test; no serializer change (same for all pages today).
- 8 accepted: wording corrected.
- 9 accepted in part: added proposal transport, Keep→approve→reopen with canon change, save/reopen, and format reference tests. Skipped the "unchanged Story Facts bytes" test; the rename is display text only and the canon test files already run unedited.

## Round 2 — Codex
The revision addresses the blocking omissions: both Morgan validators, the shared proposal type, the renamed format reference, contextual labels, and save/reopen coverage. Keeping `bible` inside the existing Pages shell avoids unnecessary tab unions and exhaustive-record changes.

The deferred items are reasonable scope decisions:

- Typed Morgan follow-ups still report the shell tab rather than the selected page. This is an existing Pages limitation; the dedicated writing button correctly supplies `page:bible`.
- State-only serialization still omits prose pages. Existing package-tree saves preserve them, and the revised plan explicitly tests that boundary.
- Pitch packets receive Bible prose as proposal context, without promising a new exported section.

No additional material blocker found. This approves the implementation plan; it does not certify unimplemented behavior.

VERDICT: APPROVED