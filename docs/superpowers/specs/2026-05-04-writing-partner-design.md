# Writing Partner AI — Design Spec (Plan 3)

**Date:** 2026-05-04  
**Status:** Approved  
**Builds on:** Plan 1 (Shell + Structured Tabs), Plan 2 (Screenplay Editor)

---

## Goal

Wire the Writing Partner LeftRail into a live AI chat, route messages to the correct specialist persona based on active tab and @mentions, persist transcripts in localStorage via `projectState`, and build the Writer's Room as a three-panel view for dedicated specialist sessions.

---

## Architecture Overview

Two distinct conversation surfaces:

1. **LeftRail (Writing Partner host)** — always visible, always Writing Partner identity. Tab-aware routing sends messages to the correct specialist under the hood. @mentions override routing. All responses land in `projectState.agents.writingPartner.transcript`, labeled with the responding specialist's name.

2. **Writer's Room** — dedicated 3-panel view (`⌘5` / Writer's Room tab). Left nav selects a specialist. Center shows specialist context. Right panel is a live chat that writes to `projectState.agents[specialistId].transcript`. Completely separate from the LeftRail transcript.

These two stores never merge, duplicate, or cross-write.

---

## Data Model

### `TranscriptMessage` (new type in `projectState.ts`)

```typescript
interface TranscriptMessage {
  id: string           // nanoid or Date.now().toString()
  role: 'user' | 'assistant'
  content: string
  speaker: string      // "You" | "Sam" | "Oliver" | "Writing Partner" etc.
  ts: number           // Date.now()
}
```

### `projectState.agents` (reconciled)

Current `projectState.agents` has `marcus`; `PERSONAS` has `alex`. Plan 3 renames `marcus → alex` in `projectState.ts` and `defaultProjectState()`. No migration needed (dev localStorage is ephemeral).

```typescript
agents: {
  writingPartner: { transcript: TranscriptMessage[], lastActive: number | null },
  sam:            { transcript: TranscriptMessage[], lastTouched: number | null },
  casey:          { transcript: TranscriptMessage[], lastTouched: number | null },
  oliver:         { transcript: TranscriptMessage[], lastTouched: number | null },
  maya:           { transcript: TranscriptMessage[], lastTouched: number | null },
  zoe:            { transcript: TranscriptMessage[], lastTouched: number | null },
  alex:           { transcript: TranscriptMessage[], lastTouched: number | null },
}

type AgentId = 'writingPartner' | 'sam' | 'casey' | 'oliver' | 'maya' | 'zoe' | 'alex'
```

### `useProjectState` additions

One new action:

```typescript
addMessage(agentId: AgentId, msg: TranscriptMessage): void
// Appends to agents[agentId].transcript and calls saveProjectState.
```

---

## Routing Logic (`client/src/lib/wpRouting.ts`)

Pure module, fully unit-tested. No side effects.

### Types

```typescript
type PersonaId = 'writingPartner' | 'sam' | 'casey' | 'oliver' | 'maya' | 'zoe' | 'alex'
type WritingTab = 'script' | 'story-bible' | 'outline' | 'synopsis'
type StoryBibleSection = 'characters' | 'world' | 'themes' | 'tone' | 'rules'
```

### `parseMention(text: string): { personaId: PersonaId; strippedText: string } | null`

Matches `@Name` at the start of the message (case-insensitive). Returns the persona ID and the message text with the leading mention removed, or `null` if no valid mention found.

```
"@Sam tighten this logline"  → { personaId: 'sam', strippedText: 'tighten this logline' }
"@Oliver what's wrong here?" → { personaId: 'oliver', strippedText: "what's wrong here?" }
"no mention"                 → null
```

The **original text** (with @mention) is stored in the user's `TranscriptMessage.content` for display. The **strippedText** is what gets sent as `message` in the `/api/wp-chat` request body — the model never sees the routing prefix.

`@WritingPartner` and unrecognised mentions → `null` (fall through to default routing).

### `getDefaultPersona(activeTab, storyBibleSection): PersonaId`

```
script                            → 'writingPartner'
synopsis                          → 'sam'
outline                           → 'oliver'
story-bible + characters/themes/tone (or null) → 'casey'
story-bible + world/rules         → 'zoe'
```

### `buildProjectContext(state: ProjectState): ProjectContext`

Maps `projectState` to the `/api/wp-chat` request body's `projectContext` field:

```typescript
interface ProjectContext {
  title?: string
  genre?: string
  logline?: string
  characters: string[]   // character names from storyBible.characters
  beats: string[]        // beat names from outline.beats
  world: { setting?: string }
}
```

---

## Server: `/api/wp-chat`

New Express route in `server/routes.ts`. Thin adapter over the existing `openaiService.generatePersonaResponse`. Does not introduce a competing AI path.

### Request schema

```typescript
{
  personaId: string,
  message: string,
  projectContext: {
    title?: string,
    genre?: string,
    logline?: string,
    characters: string[],
    beats: string[],
    world: { setting?: string }
  },
  conversationHistory: Array<{ role: 'user' | 'assistant', content: string }>
}
```

### Handler logic

1. Validate with Zod.
2. Look up `PERSONAS[personaId]` — 400 if not found.
3. Build hardcoded `userProfile`:
   ```typescript
   { writerName: 'Writer', feedbackStyle: 'direct', entryState: 'idea_only', existingWork: [] }
   ```
4. Adapt `projectContext` → `StoryMemory` shape the existing service expects.
5. Call `openaiService.generatePersonaResponse(persona, message, userProfile, storyMemory, conversationHistory)`.
6. Return `{ message, suggestions }`.

### Response schema

```typescript
{ message: string, suggestions?: string[] }
```

---

## `shared/personas.ts` — `writingPartner` Addition

Add one entry. This persona is the rail host/generalist identity. It must NOT appear in the Writer's Room specialist nav.

```typescript
writingPartner: {
  id: 'writingPartner',
  name: 'Writing Partner',
  role: 'Creative Director',
  personality: 'Generalist who triages, asks good questions, and brings in specialists when the work calls for it',
  expertise: ['Story development', 'Creative unblocking', 'Craft questions', 'Big picture'],
  accentColor: '--wp-amber',
  greeting: () => `What are you working on?`
}
```

The Writer's Room specialist list = `['sam', 'casey', 'oliver', 'maya', 'zoe', 'alex']` — hardcoded, excludes `writingPartner`.

---

## `shellState.ts` — StoryBible Section Awareness

Add two fields:

```typescript
storyBibleSection: StoryBibleSection | null
setStoryBibleSection: (section: StoryBibleSection) => void
```

`setStoryBibleSection` is called from `StoryBibleTab` when the user clicks/focuses a section. Initial value: `null` (routes to `casey` by default).

`StoryBibleTab` gets a new prop: `onSectionChange: (section: StoryBibleSection) => void`. Each section header fires it via `onClick`. No scroll observers.

---

## LeftRail Wiring

### New props

```typescript
interface LeftRailProps {
  open: boolean
  onToggle: () => void
  projectTitle: string
  activeTab: WritingTab           // already exists, now used
  transcript: TranscriptMessage[] // NEW
  loading: boolean                // NEW — true while awaiting API response
  onSend: (text: string) => void  // NEW
}
```

### Transcript render

Replace the static empty state `<p>` with a scrollable list of message bubbles:
- User messages: right-aligned, `color: var(--fg)`
- Assistant messages: left-aligned, speaker name (`Sam`, `Oliver`, `Writing Partner`) in amber above the bubble
- Show empty state only when `transcript.length === 0`
- Auto-scroll to bottom on new message
- Show a pulsing `…` indicator when `loading === true`

### Send handler (in `App.tsx`)

```
1. Snapshot conversationHistory = last 6 messages from agents.writingPartner.transcript (BEFORE this message)
2. Parse @mention from text:
   - mention found → { personaId, strippedText }; messageToSend = strippedText
   - no mention    → personaId = getDefaultPersona(activeTab, storyBibleSection); messageToSend = text
3. Build user TranscriptMessage (content = original text with @mention intact) → addMessage('writingPartner', userMsg)
4. Set loading = true
5. POST /api/wp-chat { personaId, message: messageToSend, projectContext, conversationHistory }
6. Build assistant TranscriptMessage with speaker = PERSONAS[personaId].name
7. addMessage('writingPartner', assistantMsg)
8. Set loading = false
```

Key invariant: `conversationHistory` is snapshotted at step 1, before the current user message is appended (step 3). The model receives the prior context plus the current `message` field — no duplication.

---

## Writer's Room (`client/src/components/writing/WritersRoom.tsx`)

### Layout

Three panels, all inline styles:

```
┌──────────────┬──────────────────────────┬────────────────┐
│ Left nav     │ Center workspace          │ Right chat     │
│ 180px        │ flex-1                    │ 280px          │
│              │                           │                │
│ [Sam ●]      │  Name + Role              │ [transcript]   │
│ [Oliver]     │  Expertise chips          │                │
│ [Casey]      │  Relevant project context │ [input]        │
│ [Maya]       │  (logline, beats, chars…) │                │
│ [Zoe]        │                           │                │
│ [Alex]       │                           │                │
└──────────────┴──────────────────────────┴────────────────┘
```

### State

```typescript
const [selectedId, setSelectedId] = useState<SpecialistId>('oliver')
type SpecialistId = 'sam' | 'casey' | 'oliver' | 'maya' | 'zoe' | 'alex'
```

`writingPartner` is never in the list. Default selection: `oliver` (matches most common entry from outline tab).

### Left nav

One button per specialist. Amber left-border on selected. Unread dot if `transcript.length > 0` and not currently selected.

### Center workspace

Shows selected specialist's `name`, `role`, `personality`, and `expertise` chips. Below that: a contextual summary from `projectState` — e.g. Oliver shows beat count, Sam shows current logline, Casey shows character names. Read-only, no editing here.

### Right chat

Transcript from `projectState.agents[selectedId].transcript`. Input sends to `/api/wp-chat` with `personaId = selectedId`. Handler calls `addMessage(selectedId, msg)` — writes only to that specialist's transcript, never to `writingPartner`.

### Props

```typescript
interface WritersRoomProps {
  projectState: ProjectState
  onSendToSpecialist: (specialistId: SpecialistId, text: string) => Promise<void>
}
```

`App.tsx` provides `onSendToSpecialist`, which mirrors the LeftRail send handler but targets `agents[specialistId].transcript`.

---

## `App.tsx` Changes

- Wire `storyBibleSection` from `shellState` into `StoryBibleTab` as `onSectionChange`.
- Lift the WP send handler (`handleWPSend`) and specialist send handler (`handleSpecialistSend`) as functions here.
- Pass `transcript`, `loading`, `onSend` to `LeftRail` via `Shell` props (or directly — see note below).
- Replace Writer's Room placeholder div with `<WritersRoom projectState={project.state} onSendToSpecialist={handleSpecialistSend} />`.

**Shell passthrough note:** `Shell.tsx` currently renders `LeftRail` directly. To pass new LeftRail props without bloating `ShellProps`, the cleanest path is to extend `ShellProps` with `railProps: Pick<LeftRailProps, 'transcript' | 'loading' | 'onSend'>` and spread them in `Shell`. Keeps Shell as the layout owner without it knowing about AI logic.

---

## Testing

### `tests/lib/wpRouting.test.ts`

Unit tests for all three pure functions:

- `parseMention`: recognises all 6 specialist names, case-insensitive, null for unknown/no mention
- `getDefaultPersona`: all tabs, all storyBibleSection values including null
- `buildProjectContext`: maps projectState fields correctly, handles empty arrays

### `tests/components/WritersRoom.test.tsx`

- Renders specialist nav with 6 items (no writingPartner)
- Clicking a specialist changes the selected specialist
- `onSendToSpecialist` called with correct specialistId when input submitted
- Empty transcript shows empty state

---

## Out of Scope for Plan 3

- Streaming responses (chunked SSE). All responses are non-streaming.
- Onboarding flow / `userProfile` collection. Hardcoded defaults throughout.
- Proactive Writing Partner messages (the 20-min pulse timer stays, but no actual proactive message logic).
- @mention completions / autocomplete UI in the textarea.
- Cross-pollinating @mention responses into the specialist's own transcript.
- Writer's Room simultaneous multi-column view.

---

## File Map

| File | Action | Summary |
|---|---|---|
| `client/src/lib/projectState.ts` | Modify | Add `TranscriptMessage`, `AgentId`, rename `marcus→alex` |
| `client/src/lib/useProjectState.ts` | Modify | Add `addMessage(agentId, msg)` |
| `client/src/lib/shellState.ts` | Modify | Add `storyBibleSection`, `setStoryBibleSection` |
| `client/src/lib/wpRouting.ts` | New | `parseMention`, `getDefaultPersona`, `buildProjectContext` |
| `shared/personas.ts` | Modify | Add `writingPartner` host persona |
| `server/routes.ts` | Modify | Add `/api/wp-chat` (thin adapter) |
| `client/src/components/shell/LeftRail.tsx` | Modify | Wire transcript + send props |
| `client/src/components/writing/WritersRoom.tsx` | New | 3-panel specialist view |
| `client/src/components/writing/StoryBibleTab.tsx` | Modify | Add `onSectionChange` prop |
| `client/src/App.tsx` | Modify | Lift send handlers, wire everything |
| `tests/lib/wpRouting.test.ts` | New | Unit tests for routing logic |
| `tests/components/WritersRoom.test.tsx` | New | WritersRoom render + interaction tests |
