> A personality-driven, multi-agent writing studio. This document is the
> canonical task list for the next builder. Read `WriterOS.html` and the
> `lib/` + `ui/` tree before starting.

---

## What this repo is

A working **prototype UI** of a multi-agent writing studio. Six specialist
AI agents (Sam, Casey, Oliver, Maya, Zoe, Marcus) coordinated by a Triage
agent, sharing one ProjectState. The UI is done enough to demo. The backend,
agents, and editor are not.

## Architecture (keep it)

```
lib/
  state.mock.js   canonical ProjectState shape (REPLACE with live feed)
  bridge.js       ONLY outbound-call surface; swap MockBridge → WSBridge
  store.js        subscribe/select/mutate; UI never fetches directly
ui/
  frame.jsx             TopBar + LeftNav + RightDrawer (context-aware)
  screens-mission.jsx   Mission Control, Triage, Tasks, Handoffs
  screens-knowledge.jsx Hive Mind, Structure, Cast, World, Scenes, AgentWorkbench
  screens-system.jsx    State Inspector, Future Modules, Settings
WriterOS.html    app root + screen router
```

**Rule:** UI reads state via `useStore(selector)`, writes via
`window.WOS.store.actions.*`. Nothing else. All networking lives in
`lib/bridge.js`. Honor this contract and the UI never needs to change when
the backend is attached.

---

## Phase 1 — Backend substrate (blocks everything else)

- [ ] **Replace `MockBridge` with a real client**
  - WebSocket primary: `/ws/state` → emits `state.patch`, `state.replace`, `agent.status`, `notification`
  - REST fallback: `/api/state` (poll 5s), `/api/tasks`, `/api/handoffs`, `/api/memory`
  - Every `store.actions.*` already optimistically patches — server must echo or reject (add `rollback` path)
- [ ] **Persist ProjectState** to a single `.wos` file (JSON today; SQLite later)
  - Autosave on every mutation, debounced 600ms
  - Versioned by `schemaVersion` — write a migration runner before first bump
- [ ] **Lock the schema**
  - Move shapes from the comments in `state.mock.js` into `lib/schema.js` with runtime validation (zod or hand-rolled)
  - Every mutation validates before it hits the bridge

## Phase 2 — Live agents (the actual product)

- [ ] **Agent runtime in Claude Code**
  - One subprocess per specialist, plus Triage as coordinator
  - System prompt per agent = `role` + `personality` + `capabilities` + scoped `reads`/`writes`
  - Routing: Haiku-class for Triage and Marcus's scorecard; Sonnet-class for the 6 creatives
- [ ] **Wire `bridge.invoke(agentId, payload)`** to spawn a Claude call with:
  - The agent's system prompt
  - A filtered ProjectState slice per `agent.reads`
  - The last N entries of memory the agent has witnessed
  - Return streams → `eventBus.emit('agent.token', …)` so UI can render typing
- [ ] **Real per-agent chat**
  - Current `AgentWorkbench` shows focus + tasks + memory — add a chat pane
  - Messages persist on ProjectState under `agents[id].transcript`
  - "Attach context" button that pins the selected scene / character / beat into the next prompt
- [ ] **Triage as a real LLM**
  - On any unassigned task: Triage reads the task + full project context, outputs `{assignTo, reasoning, blockers}`
  - Show its reasoning in the Delegation Log

## Phase 3 — The missing writing surface

- [ ] **Manuscript editor** (the one thing the UI doesn't yet have)
  - Chapter/scene tree on the left, ProseMirror or Tiptap in the middle
  - Inline "Ask Maya about this line" / "Ask Casey about this beat" context menu
  - Scene-level metadata (beatId, characters, location, flags) live-bound to `state.scenes`
  - Word count feeds `project.wordCount` on save
- [ ] **Reading mode** — full-bleed serif, no chrome, for proofing

## Phase 4 — Memory semantics

- [ ] **Confidence decay** — write a nightly job that re-scores memory by age + cite count
- [ ] **Conflict detection** — Zoe auto-runs on every `scenes` write; files a Canon task if rules break
- [ ] **Witness injection** — before any agent call, silently prepend unseen high-confidence memory to their context (the Witness Matrix in the Hive Mind UI is the debugger for this)
- [ ] **User-pinned memory** — the UI has the button; wire it to `bridge.pinMemory`

## Phase 5 — The future modules (from the Future Modules screen)

Each is a self-contained screen that reads shared state, drop into the router:

- [ ] Voice War Room — Maya-led, multi-agent live edit on a single scene
- [ ] Mobile Inbox — PWA surface for async agent cards
- [ ] Self-Awareness / Meta-agent — watches the other agents, reports drift
- [ ] Writing Schedule — calendar + past stall patterns → agent-of-the-day
- [ ] Staged Reading — voice synthesis per character
- [ ] External Agents plugin API — spec a manifest format (`agent.json`) and a sandbox

## Phase 6 — Polish

- [ ] Keyboard nav (⌘1–⌘5 already labelled in the LeftNav — implement)
- [ ] ⌘K command palette (labelled in TopBar — implement)
- [ ] Drag-to-reorder on the Kanban task board
- [ ] Responsive: collapse drawer under 1280px, collapse nav under 900px
- [ ] Light mode (all colors are CSS vars — add a theme switcher)
- [ ] Real auth + multi-project picker

---

## Hard rules for the next builder

1. **Do not touch `lib/bridge.js` from UI code.** If you need a new mutation, add an action in `store.js`.
2. **Do not let agents write outside their declared scope.** `agent.writes` is a real permission boundary, not documentation.
3. **Every piece of information that more than one agent needs lives in ProjectState.** No side channels.
4. **Memory class matters.** `canon` is immutable by anything except Zoe. `pinned` needs user approval to delete. Never conflate.
5. **Triage is the only router.** Specialists never invoke each other directly — they file handoffs.

## Known debts

- `lib/state.mock.js` is hand-authored and will drift from the schema as screens evolve. Lock the schema in Phase 1 before that gets painful.
- The AgentWorkbench has a stub "Open agent chat" button — nothing behind it yet.
- `Settings` is display-only.
- No tests. Add Vitest once there's a backend worth testing.

## Start here

1. Read `WriterOS.html` top to bottom — it's ~100 lines and maps every screen.
2. Open `WriterOS.html` in a browser, click through all screens to feel the contract.
3. Read `lib/store.js` end to end.
4. Phase 1, task 1: stand up a WebSocket server that echoes mock state. Point `bridge.js` at it. Verify the UI doesn't need to change.

> A personality-driven, multi-agent writing studio. This document is the
> canonical task list for the next builder. Read `WriterOS.html` and the
> `lib/` + `ui/` tree before starting.

---

## What this repo is

A working **prototype UI** of a multi-agent writing studio. Six specialist
AI agents (Sam, Casey, Oliver, Maya, Zoe, Marcus) coordinated by a Triage
agent, sharing one ProjectState. The UI is done enough to demo. The backend,
agents, and editor are not.

## Architecture (keep it)

```
lib/
  state.mock.js   canonical ProjectState shape (REPLACE with live feed)
  bridge.js       ONLY outbound-call surface; swap MockBridge → WSBridge
  store.js        subscribe/select/mutate; UI never fetches directly
ui/
  frame.jsx             TopBar + LeftNav + RightDrawer (context-aware)
  screens-mission.jsx   Mission Control, Triage, Tasks, Handoffs
  screens-knowledge.jsx Hive Mind, Structure, Cast, World, Scenes, AgentWorkbench
  screens-system.jsx    State Inspector, Future Modules, Settings
WriterOS.html    app root + screen router
```

**Rule:** UI reads state via `useStore(selector)`, writes via
`window.WOS.store.actions.*`. Nothing else. All networking lives in
`lib/bridge.js`. Honor this contract and the UI never needs to change when
the backend is attached.

---

## Phase 1 — Backend substrate (blocks everything else)

- [ ] **Replace `MockBridge` with a real client**
  - WebSocket primary: `/ws/state` → emits `state.patch`, `state.replace`, `agent.status`, `notification`
  - REST fallback: `/api/state` (poll 5s), `/api/tasks`, `/api/handoffs`, `/api/memory`
  - Every `store.actions.*` already optimistically patches — server must echo or reject (add `rollback` path)
- [ ] **Persist ProjectState** to a single `.wos` file (JSON today; SQLite later)
  - Autosave on every mutation, debounced 600ms
  - Versioned by `schemaVersion` — write a migration runner before first bump
- [ ] **Lock the schema**
  - Move shapes from the comments in `state.mock.js` into `lib/schema.js` with runtime validation (zod or hand-rolled)
  - Every mutation validates before it hits the bridge

## Phase 2 — Live agents (the actual product)

- [ ] **Agent runtime in Claude Code**
  - One subprocess per specialist, plus Triage as coordinator
  - System prompt per agent = `role` + `personality` + `capabilities` + scoped `reads`/`writes`
  - Routing: Haiku-class for Triage and Marcus's scorecard; Sonnet-class for the 6 creatives
- [ ] **Wire `bridge.invoke(agentId, payload)`** to spawn a Claude call with:
  - The agent's system prompt
  - A filtered ProjectState slice per `agent.reads`
  - The last N entries of memory the agent has witnessed
  - Return streams → `eventBus.emit('agent.token', …)` so UI can render typing
- [ ] **Real per-agent chat**
  - Current `AgentWorkbench` shows focus + tasks + memory — add a chat pane
  - Messages persist on ProjectState under `agents[id].transcript`
  - "Attach context" button that pins the selected scene / character / beat into the next prompt
- [ ] **Triage as a real LLM**
  - On any unassigned task: Triage reads the task + full project context, outputs `{assignTo, reasoning, blockers}`
  - Show its reasoning in the Delegation Log

## Phase 3 — The missing writing surface

- [ ] **Manuscript editor** (the one thing the UI doesn't yet have)
  - Chapter/scene tree on the left, ProseMirror or Tiptap in the middle
  - Inline "Ask Maya about this line" / "Ask Casey about this beat" context menu
  - Scene-level metadata (beatId, characters, location, flags) live-bound to `state.scenes`
  - Word count feeds `project.wordCount` on save
- [ ] **Reading mode** — full-bleed serif, no chrome, for proofing

## Phase 4 — Memory semantics

- [ ] **Confidence decay** — write a nightly job that re-scores memory by age + cite count
- [ ] **Conflict detection** — Zoe auto-runs on every `scenes` write; files a Canon task if rules break
- [ ] **Witness injection** — before any agent call, silently prepend unseen high-confidence memory to their context (the Witness Matrix in the Hive Mind UI is the debugger for this)
- [ ] **User-pinned memory** — the UI has the button; wire it to `bridge.pinMemory`

## Phase 5 — The future modules (from the Future Modules screen)

Each is a self-contained screen that reads shared state, drop into the router:

- [ ] Voice War Room — Maya-led, multi-agent live edit on a single scene
- [ ] Mobile Inbox — PWA surface for async agent cards
- [ ] Self-Awareness / Meta-agent — watches the other agents, reports drift
- [ ] Writing Schedule — calendar + past stall patterns → agent-of-the-day
- [ ] Staged Reading — voice synthesis per character
- [ ] External Agents plugin API — spec a manifest format (`agent.json`) and a sandbox

## Phase 6 — Polish

- [ ] Keyboard nav (⌘1–⌘5 already labelled in the LeftNav — implement)
- [ ] ⌘K command palette (labelled in TopBar — implement)
- [ ] Drag-to-reorder on the Kanban task board
- [ ] Responsive: collapse drawer under 1280px, collapse nav under 900px
- [ ] Light mode (all colors are CSS vars — add a theme switcher)
- [ ] Real auth + multi-project picker

---

## Hard rules for the next builder

1. **Do not touch `lib/bridge.js` from UI code.** If you need a new mutation, add an action in `store.js`.
2. **Do not let agents write outside their declared scope.** `agent.writes` is a real permission boundary, not documentation.
3. **Every piece of information that more than one agent needs lives in ProjectState.** No side channels.
4. **Memory class matters.** `canon` is immutable by anything except Zoe. `pinned` needs user approval to delete. Never conflate.
5. **Triage is the only router.** Specialists never invoke each other directly — they file handoffs.

## Known debts

- `lib/state.mock.js` is hand-authored and will drift from the schema as screens evolve. Lock the schema in Phase 1 before that gets painful.
- The AgentWorkbench has a stub "Open agent chat" button — nothing behind it yet.
- `Settings` is display-only.
- No tests. Add Vitest once there's a backend worth testing.

## Start here

1. Read `WriterOS.html` top to bottom — it's ~100 lines and maps every screen.
2. Open `WriterOS.html` in a browser, click through all screens to feel the contract.
3. Read `lib/store.js` end to end.
4. Phase 1, task 1: stand up a WebSocket server that echoes mock state. Point `bridge.js` at it. Verify the UI doesn't need to change.
