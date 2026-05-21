# Writing Partner AI — Implementation Plan (Plan 3 of 3)

> **Historical note (2026-05-18):** This plan records the original Writing Partner / Writer's Room implementation. It is useful for transcript boundaries, early routing, and `/api/wp-chat` history, but it should not override current product direction in `docs/product/README.md`, `docs/product/agent-workflow-prd.md`, or `docs/product/project-wide-format-agent-context-prd.md`.
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the Writing Partner rail into live AI chat, add tab-aware and @mention routing, persist transcripts in `ProjectState`, and replace the Writer's Room placeholder with a three-panel specialist chat view.

**Architecture:** Two separate conversation surfaces share one thin `/api/wp-chat` adapter. The LeftRail always owns `projectState.agents.writingPartner.transcript`; @mention responses render inline there with specialist speaker labels. Writer's Room owns each specialist's own `projectState.agents[id].transcript`. The stores never merge or duplicate.

**Tech Stack:** React 18, Vite, Express, existing `openaiService.generatePersonaResponse`, Vitest + Testing Library, localStorage via existing `useProjectState`.

**Spec:** `docs/superpowers/specs/2026-05-04-writing-partner-design.md`

---

## Prerequisites

- [ ] Start from branch/worktree `feat/night-desk-shell`.
- [ ] Confirm Plan 1 shell cleanup is present: focus mode hides rail, `Cmd+1-5` shortcuts work, Outline drag/drop reorder is wired.
- [ ] Review the final Plan 3 spec before editing code:

```bash
sed -n '1,360p' docs/superpowers/specs/2026-05-04-writing-partner-design.md
```

- [ ] Run the current test suite for a baseline:

```bash
npm run test:run
```

Expected: tests pass. `npm run check` may still fail on the pre-existing `server/routes.ts` `StoryMemory.userProfile` type mismatch unless it has already been fixed separately.

---

## File Map

```
client/src/lib/
  projectState.ts        MODIFY — TranscriptMessage, AgentId, marcus -> alex
  useProjectState.ts     MODIFY — addMessage(agentId, msg)
  shellState.ts          MODIFY — storyBibleSection state
  wpRouting.ts           NEW — parseMention, getDefaultPersona, buildProjectContext

shared/
  personas.ts            MODIFY — add writingPartner host persona

server/
  routes.ts              MODIFY — add /api/wp-chat adapter

client/src/components/shell/
  LeftRail.tsx           MODIFY — transcript render, loading state, send handler prop
  Shell.tsx              MODIFY — railProps passthrough

client/src/components/writing/
  WritersRoom.tsx        NEW — 3-panel specialist room
  StoryBibleTab.tsx      MODIFY — onSectionChange prop

client/src/
  App.tsx                MODIFY — route messages, wire Writer's Room

tests/lib/
  wpRouting.test.ts      NEW

tests/components/
  LeftRail.test.tsx      MODIFY — transcript + send behavior
  StoryBibleTab.test.tsx MODIFY — section-change behavior
  WritersRoom.test.tsx   NEW
```

---

## Task 1: Reconcile Agent Data Model

**Files:**
- Modify: `client/src/lib/projectState.ts`
- Modify: `client/src/lib/useProjectState.ts`
- Modify: `tests/lib/projectState.test.ts`
- Modify: `tests/lib/useProjectState.test.ts`

- [ ] Add exported types:

```typescript
export type AgentId = 'writingPartner' | 'sam' | 'casey' | 'oliver' | 'maya' | 'zoe' | 'alex'

export interface TranscriptMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  speaker: string
  ts: number
}
```

- [ ] Replace `unknown[]` transcript typing with `TranscriptMessage[]`.
- [ ] Rename `marcus` to `alex` in `defaultProjectState().agents`.
- [ ] Keep `writingPartner` in agents, but remember it is a rail host, not a Writer's Room specialist.
- [ ] Add `addMessage(agentId: AgentId, msg: TranscriptMessage)` to `useProjectState`.
- [ ] Use immutable updates and save through the existing `update` helper.
- [ ] Add/update tests:
  - default agents include `alex`.
  - default agents do not include `marcus`.
  - `addMessage` appends to the selected transcript.
  - `addMessage` persists to localStorage.

- [ ] Run focused tests:

```bash
npm run test:run -- tests/lib/projectState.test.ts tests/lib/useProjectState.test.ts
```

- [ ] Commit:

```bash
git add client/src/lib/projectState.ts client/src/lib/useProjectState.ts tests/lib/projectState.test.ts tests/lib/useProjectState.test.ts
git commit -m "feat: add typed agent transcripts to ProjectState"
```

---

## Task 2: Add Pure Writing Partner Routing

**Files:**
- Create: `client/src/lib/wpRouting.ts`
- Create: `tests/lib/wpRouting.test.ts`

- [ ] Implement `parseMention(text)`:
  - Matches only a leading mention.
  - Case-insensitive.
  - Returns `{ personaId, strippedText }` for `@Sam`, `@Casey`, `@Oliver`, `@Maya`, `@Zoe`, `@Alex`.
  - Returns `null` for unknown mentions, no mention, and `@WritingPartner`.
  - Strips only the routing mention from the text sent to the model.

- [ ] Implement `getDefaultPersona(activeTab, storyBibleSection)`:

```typescript
script -> writingPartner
synopsis -> sam
outline -> oliver
story-bible + world/rules -> zoe
story-bible + characters/themes/tone/null -> casey
```

- [ ] Implement `buildProjectContext(state)`:
  - `title` from `state.meta.title`
  - `genre` from `state.meta.genre`
  - `logline` from `state.synopsis.logline`
  - `characters` from `state.storyBible.characters[].name`
  - `beats` from `state.outline.beats[].name`
  - `world.setting` from `state.storyBible.world.setting`

- [ ] Add tests for all routing table entries, empty state handling, case-insensitive mentions, stripped mention text, and unknown mentions.
- [ ] Run focused tests:

```bash
npm run test:run -- tests/lib/wpRouting.test.ts
```

- [ ] Commit:

```bash
git add client/src/lib/wpRouting.ts tests/lib/wpRouting.test.ts
git commit -m "feat: add Writing Partner routing helpers"
```

---

## Task 3: Add Writing Partner Host Persona

**Files:**
- Modify: `shared/personas.ts`

- [ ] Add a `writingPartner` entry to `PERSONAS` for server prompt compatibility.
- [ ] Use the spec's host/generalist identity:
  - name: `Writing Partner`
  - role: `Creative Director`
  - accentColor: `--wp-amber`
- [ ] Do not add `writingPartner` to any Writer's Room specialist list.
- [ ] If persona typing currently assumes only the six specialists, update the type narrowly so `PERSONAS['writingPartner']` is valid without changing specialist navigation.
- [ ] Run relevant tests and typecheck if feasible:

```bash
npm run test:run
npm run check
```

Note any pre-existing `server/routes.ts` type failure separately if still present.

- [ ] Commit:

```bash
git add shared/personas.ts
git commit -m "feat: add Writing Partner host persona"
```

---

## Task 4: Add `/api/wp-chat` Thin Adapter

**Files:**
- Modify: `server/routes.ts`

- [ ] Add a Zod schema for `/api/wp-chat` request body:
  - `personaId`
  - `message`
  - `projectContext`
  - `conversationHistory`
- [ ] Validate `personaId` against `PERSONAS`.
- [ ] Build hardcoded `userProfile`:

```typescript
{
  writerName: 'Writer',
  feedbackStyle: 'direct',
  entryState: 'idea_only',
  existingWork: []
}
```

- [ ] Adapt `projectContext` into the `StoryMemory` shape expected by `openaiService.generatePersonaResponse`.
- [ ] Ensure `StoryMemory.userProfile` is present if the service type requires it; this may also resolve the existing `npm run check` failure.
- [ ] Call the existing `openaiService.generatePersonaResponse`; do not add a second AI implementation path.
- [ ] Return `{ message, suggestions }`.
- [ ] Add lightweight route tests only if the repo already has a route-test pattern. If not, rely on typecheck and later manual API verification.
- [ ] Run:

```bash
npm run test:run
npm run check
```

- [ ] Commit:

```bash
git add server/routes.ts
git commit -m "feat: add Writing Partner chat API adapter"
```

---

## Task 5: Track Story Bible Section Awareness

**Files:**
- Modify: `client/src/lib/shellState.ts`
- Modify: `client/src/components/writing/StoryBibleTab.tsx`
- Modify: `tests/lib/shellState.test.ts`
- Modify: `tests/components/StoryBibleTab.test.tsx`

- [ ] Add `StoryBibleSection = 'characters' | 'world' | 'themes' | 'tone' | 'rules'`.
- [ ] Add `storyBibleSection: StoryBibleSection | null` to `useShellState`.
- [ ] Add `setStoryBibleSection(section)`.
- [ ] Add `onSectionChange` prop to `StoryBibleTab`.
- [ ] Fire `onSectionChange` from section header/card `onClick` and `onFocus` where practical.
- [ ] Map Tone & Voice to `tone`.
- [ ] Keep this simple; do not add scroll observers.
- [ ] Add tests:
  - shell state defaults to `null`.
  - setter updates the section.
  - clicking/focusing each Story Bible section calls the expected section key.

- [ ] Run focused tests:

```bash
npm run test:run -- tests/lib/shellState.test.ts tests/components/StoryBibleTab.test.tsx
```

- [ ] Commit:

```bash
git add client/src/lib/shellState.ts client/src/components/writing/StoryBibleTab.tsx tests/lib/shellState.test.ts tests/components/StoryBibleTab.test.tsx
git commit -m "feat: track active Story Bible section"
```

---

## Task 6: Wire LeftRail Transcript UI

**Files:**
- Modify: `client/src/components/shell/LeftRail.tsx`
- Modify: `client/src/components/shell/Shell.tsx`
- Modify: `tests/components/LeftRail.test.tsx`
- Modify: `tests/components/Shell.test.tsx`

- [ ] Extend `LeftRailProps`:

```typescript
transcript: TranscriptMessage[]
loading: boolean
onSend: (text: string) => void
```

- [ ] Replace static empty state with transcript rendering.
- [ ] Preserve the existing empty state when transcript is empty.
- [ ] Render:
  - user messages right-aligned.
  - assistant messages left-aligned.
  - assistant speaker label above the bubble.
- [ ] Add loading indicator while awaiting response.
- [ ] Wire textarea submit:
  - Enter sends.
  - Shift+Enter inserts newline.
  - Ignore empty/whitespace sends.
  - Clear input after send.
- [ ] Auto-scroll transcript to bottom on new message or loading state change.
- [ ] Add `railProps` passthrough to `Shell` so layout stays owner of `LeftRail`.
- [ ] Add tests:
  - renders user and assistant messages.
  - sends entered text on Enter.
  - does not send empty text.
  - Shift+Enter does not send.
  - loading indicator appears.
  - Shell passes rail props through.

- [ ] Run focused tests:

```bash
npm run test:run -- tests/components/LeftRail.test.tsx tests/components/Shell.test.tsx
```

- [ ] Commit:

```bash
git add client/src/components/shell/LeftRail.tsx client/src/components/shell/Shell.tsx tests/components/LeftRail.test.tsx tests/components/Shell.test.tsx
git commit -m "feat: wire Writing Partner rail transcript UI"
```

---

## Task 7: Build Writer's Room Component

**Files:**
- Create: `client/src/components/writing/WritersRoom.tsx`
- Create: `tests/components/WritersRoom.test.tsx`

- [ ] Create a hardcoded specialist list:

```typescript
['sam', 'casey', 'oliver', 'maya', 'zoe', 'alex']
```

- [ ] Do not include `writingPartner`.
- [ ] Use local component state for selected specialist, default `oliver`.
- [ ] Build three-panel layout:
  - left nav: 180px specialist buttons.
  - center: selected persona name, role, personality, expertise, project context summary.
  - right: selected specialist transcript and input.
- [ ] Context summary examples:
  - Oliver: beat count and current beat type.
  - Sam: logline.
  - Casey: character names.
  - Zoe: world setting/rules.
  - Maya: tone/voice notes if available.
  - Alex: overall project title/genre and available context.
- [ ] Wire input:
  - Enter sends to `onSendToSpecialist(selectedId, text)`.
  - Shift+Enter newline.
  - Ignore empty/whitespace sends.
- [ ] Render empty state when selected transcript is empty.
- [ ] Add tests:
  - six specialist nav items render.
  - `Writing Partner` does not appear as a nav item.
  - default selected specialist is Oliver.
  - clicking Sam changes selected workspace.
  - send calls `onSendToSpecialist` with selected id.
  - selected transcript renders.

- [ ] Run focused tests:

```bash
npm run test:run -- tests/components/WritersRoom.test.tsx
```

- [ ] Commit:

```bash
git add client/src/components/writing/WritersRoom.tsx tests/components/WritersRoom.test.tsx
git commit -m "feat: add Writer's Room specialist workspace"
```

---

## Task 8: Wire App Send Handlers

**Files:**
- Modify: `client/src/App.tsx`
- Possibly modify: `client/src/components/shell/Shell.tsx` if `railProps` needs type adjustment

- [ ] Add local loading state:
  - `wpLoading`
  - `specialistLoading` if needed, or a map keyed by specialist id.
- [ ] Implement a small helper to create transcript messages:

```typescript
function makeMessage(role, content, speaker): TranscriptMessage
```

- [ ] Implement `historyFromTranscript(transcript)`:
  - last 6 messages.
  - map to `{ role, content }`.
  - snapshot before appending the current user message.
- [ ] Implement `postWPChat({ personaId, message, projectContext, conversationHistory })`.
- [ ] Implement `handleWPSend(text)`:
  - snapshot prior history from `writingPartner.transcript`.
  - parse leading mention.
  - use stripped text for API message when mention is found.
  - use original text for the user transcript message.
  - default route from `getDefaultPersona(activeTab, storyBibleSection)`.
  - append user message to `writingPartner`.
  - post to `/api/wp-chat`.
  - append assistant response to `writingPartner` with speaker from `PERSONAS[personaId].name`.
  - on error, append assistant error message from `Writing Partner` rather than losing the user text.
  - always clear loading in `finally`.
- [ ] Implement `handleSpecialistSend(specialistId, text)`:
  - snapshot prior history from that specialist transcript.
  - append user message to `agents[specialistId]`.
  - post to `/api/wp-chat` with `personaId = specialistId`.
  - append assistant response to same specialist transcript.
  - do not touch `writingPartner.transcript`.
- [ ] Wire:
  - `LeftRail` transcript = `project.state.agents.writingPartner.transcript`.
  - `LeftRail` loading = `wpLoading`.
  - `LeftRail` onSend = `handleWPSend`.
  - `StoryBibleTab` onSectionChange = `shellState.setStoryBibleSection`.
  - Writer's Room placeholder -> `<WritersRoom projectState={project.state} onSendToSpecialist={handleSpecialistSend} />`.

- [ ] Add/extend App-level tests only if there is already an App test pattern. Otherwise rely on component/lib coverage and manual verification.
- [ ] Run full suite:

```bash
npm run test:run
```

- [ ] Commit:

```bash
git add client/src/App.tsx client/src/components/shell/Shell.tsx
git commit -m "feat: wire Writing Partner and Writer's Room chat handlers"
```

---

## Task 9: Manual API and UI Verification

**Files:** No required source edits unless bugs are found.

- [ ] Start the app:

```bash
npm run dev
```

- [ ] Verify LeftRail:
  - Open the rail with avatar or `Cmd+\`.
  - Send a normal Script-tab message; it routes to Writing Partner.
  - Switch to Outline and send a normal message; it routes to Oliver.
  - Send `@Sam tighten this logline`; transcript displays the original text, API message excludes `@Sam`.
  - Confirm assistant response appears in `writingPartner.transcript` only.

- [ ] Verify Story Bible routing:
  - Click Characters or Tone & Voice; message routes to Casey.
  - Click World or Rules; message routes to Zoe.

- [ ] Verify Writer's Room:
  - Enter with `Cmd+5` or the top bar.
  - Select Sam/Oliver/etc.
  - Send a message.
  - Confirm it writes only to that specialist transcript.
  - Confirm `writingPartner` is not in the nav.

- [ ] Verify persistence:
  - Refresh page.
  - Confirm rail transcript and specialist transcripts remain.

- [ ] Run final checks:

```bash
npm run test:run
npm run check
```

- [ ] Commit any bug fixes discovered during manual verification.

---

## Task 10: Final Handoff

- [ ] Confirm `git status --short` contains only intended changes.
- [ ] Summarize:
  - files changed.
  - tests run.
  - whether `npm run check` passes or still has a known baseline issue.
  - any out-of-scope follow-ups.
- [ ] Suggested final commit if not already committed task-by-task:

```bash
git add client/src shared server tests docs
git commit -m "feat: wire Writing Partner AI and Writer's Room"
```

---

## Implementation Notes and Guardrails

- Preserve Plan 1 shell behavior:
  - focus mode hides top bar and rail.
  - `Cmd+1-4` switch writing tabs.
  - `Cmd+5` enters Writer's Room.
  - Writer's Room auto-collapses rail.
- Do not add onboarding or user profile UI.
- Do not add streaming.
- Do not add @mention autocomplete.
- Do not duplicate LeftRail @mention responses into specialist transcripts.
- Do not show `writingPartner` in Writer's Room nav.
- Keep `/api/wp-chat` a thin adapter over `openaiService.generatePersonaResponse`.
- Prefer focused unit/component tests over broad brittle App tests unless the repo already has a pattern for them.
