# Plan: Story Bible page in Pages, Story Facts rename

Date: 2026-10-18. Status: Q1 decided (A). Codex APPROVED in round 2.

## What Ben asked for

1. **A Story Bible page in the Pages tab.** A story bible for a show or series, named "Story Bible". It sits beside Outline, Treatment and Synopsis and works the way they do.
2. **Rename the current Story Bible tab to "Story Facts".** Under the title it reads "Your story's facts in your words", followed by a line saying it is not a traditional story bible. Nothing else on that tab changes.

## How pages work today (found in the code)

- Pages are prose documents in `documents/pages/<name>.json` (`shared/pages.ts`, `client/src/lib/projectPackage.ts:37`).
- Morgan writes them. "Write it with Morgan" sends her a request; she reads the format file in `server/morganHost/formats/<name>.md`, canon, the other pages and the beat sheet, then proposes the whole page through `propose_page_change` (surface `page`). Ben keeps or dismisses it, then approves the page. A page goes "out of date" when canon changes after approval.
- **Nobody can type into a page by hand.** The page body is read-only (`PageProse` in `Pages.tsx`). The pare-down (2026-10-15 plan, line 56 and 165) removed the Synopsis and Treatment editors on purpose, because five of six work-loss bugs lived in the editors and their save layer.

## Q1: decided 2026-10-18, option A

You said the Story Bible should be written "with or without Morgan", the same as a Treatment. Today a Treatment can only be written *with* Morgan. You can approve it, but you can't type it yourself. So the two halves of the request point different ways:

- **Option A (recommended): match Treatment exactly.** Story Bible is Morgan-written and you approve it, like the other three pages. It's a small, safe change, and it ships now.
- **Option B: add hand-writing.** You can type into the Story Bible page yourself, and Morgan helps when asked. That brings back an editor, the thing the pare-down removed for losing work. If you want it, it should cover all four pages, not just the Story Bible. That's a separate plan with its own review.

I recommend A now, and B as its own plan if you want to type pages yourself. Mixing B into this change would make the Story Bible the only page that works differently.

**Ben chose A.** The Story Bible page is Morgan-written and Ben-approved, exactly like Treatment.

## Part 1: Story Bible page

**Internal name `bible`.** The page's internal id is `bible`, stored at `documents/pages/bible.json`, and it's shown as "Story Bible". It can't be `storyBible`, because `documents.storyBible` already holds the Story Facts data. The page loader also falls back to `state.documents[name]` for old projects (`server/projectLibrary/store.ts:432-441`). With the name `storyBible`, that fallback would turn Story Facts into the page's first draft.

Changes:
- `shared/pages.ts`: add `bible` to `PageNameSchema`.
- `client/src/lib/projectPackage.ts`: add `bible: 'documents/pages/bible.json'` to `WRITEROS_PAGE_PATHS`.
- `server/projectLibrary/store.ts` `accessPage`: an empty page for `bible` when its file is missing. It has no legacy document to convert, and it must never read `documents.storyBible`.
- `client/src/components/writing/Pages.tsx`:
  - Add the page to `PAGE_NAMES`, after Synopsis.
  - Show the title "Story Bible" from a label map, replacing the current `selected[0].toUpperCase()` at line 66 and in the switcher. The Morgan request and the lede also use the label, not the id.
  - Its "What a story bible needs" list: Identity and premise · Tone and style · The world and its rules · The characters · The story engine and seasons · Continuity and open questions.
- No new shell tab. The page is chosen inside Pages through `selectedPage` (`App.tsx:354`), like the other three, so `TopBar.tsx` and the `ActiveTab` unions are untouched.
- `App.tsx:1612` (the left zone's surface label) uses the page label map, so it reads "Story Bible", not "Bible".
- `client/src/lib/wpRouting.ts:58` / `:581`: add `bible` to the `pages` context so readers see the page text.
- Morgan:
  - **Her page list:** every validator and type that lists page names accepts `bible`:
    - `server/morganHost/proposals.ts:45`
    - `server/morganHost/liveChannel.ts:387` (the `/proposal` body check; without it the proposal is refused with HTTP 400)
    - `mod/writeros-morgan/hooks/protocol.ts:67` (`PageProposal`, re-exported through `shared/morganLive.ts`)
    - `mod/writeros-morgan/hooks/proposeTool.ts` (the `page` enum and the description text)
    - The build's first task greps for `'synopsis', 'treatment', 'outline'` and `"synopsis", "treatment", "outline"` across `client/ server/ shared/ mod/` and lists every hit before code.
  - **Her format files:** the current `formats/story-bible.md` describes Story Facts text. It's renamed `formats/story-facts.md`, and the section request in `StoryBibleSectionsView.tsx:48` is updated to say "Story Facts" and `story-facts.md` (its `storyBible` proposal surface is unchanged). A new `formats/bible.md` holds the series-bible format, built from Ben's `story-bible-best-practices-template.md`: cover and identity, one-page pitch, tone and style, world, characters, story engine, pilot and season map, continuity log. Like the other formats, it says the text never changes canon without Ben's yes.
  - **Persona:** `server/morganHost/persona.md` lists `bible` with the other pages. It points to `story-facts.md` for Story Facts text, and names the facts tab "Story Facts" wherever it says "Story Bible" today (Looks section, character cards, the page list in the propose rule).
- **Pitch packets:** `server/room/interview/pitchPacketRuntime.ts:50` reads every page's markdown as context when it proposes missing packet fields. The Story Bible page becomes that context too. It doesn't add a Story Bible section to the packet. No code change.
- **Saving:** page files are kept by the server's package-tree save, not by `serializeWriterOSProjectPackage` (`projectPackage.ts:256` ignores `state.pages`). This is the same for all pages today and isn't changed here. A test checks that the Story Bible page survives a project save and reopen.

## Part 2: Story Facts rename

These are display text only. The internal ids `storyBible`, `story-bible` and `StoryBibleTab` stay as they are, so saved projects, the save observer and the canon test files are untouched.

- `client/src/components/shell/TopBar.tsx:142`: the tab reads "Story Facts".
- `client/src/components/writing/StoryBibleTab.tsx:80`:
  - The heading reads "Story Facts".
  - Under it: "Your story's facts in your words."
  - Then: "This isn't a traditional story bible. That page lives in Pages."
- `surfaceAwareness.ts:54`, `leftZone.ts:53`, `LeftRail.tsx:113`, `MemoryPatchPreview.tsx:14`, `CapabilityReceiptChip.tsx:23,31`, and the delete warning in `HomeSurface.tsx:681` say "Story Facts" (the warning names both).
- Any other place Ben reads "Story Bible" for the facts tab gets the same change. A grep for the user-facing string is the first build task.

## Out of scope

- Hand-editing pages (Q1 option B).
- Moving or reshaping Story Facts content. Filling the new page from Story Facts automatically. Morgan reads Story Facts and canon when she writes the page, which is enough.
- Renaming internal ids or files for the facts tab.

## Tests and proof

- Update the label assertions in `StoryBibleTab.test.tsx`, `TopBar.test.tsx` and `LeftRail.test.tsx`. None are canon test files.
- New tests:
  - `bible` page: read, write, a stale write refused, and a missing file returns empty. The test checks it's empty even when `documents.storyBible` has text.
  - A `page: bible` proposal passes the live channel's `/proposal` check and Morgan's propose tool.
  - Keep, then approve, then reopen: the approved Story Bible page comes back, and goes out of date when canon changes.
  - The page survives a project save and reopen.
  - The Story Facts section request names `story-facts.md`, and that file exists.
  - The Pages switcher shows "Story Bible".
- The canon test files from the pare-down hard boundary run unedited.
- `npm run test:run`, `npm run check`, `npm run build`.
- **Live run:** on a real project, click "Write it with Morgan" on the Story Bible page. Morgan proposes a series bible. Keep it, then approve it. Story Facts shows its new title and subtitle, with its sections and looks unchanged.
