# WriterOS — Claude Code Context

A personality-driven, multi-agent writing studio. Six specialist agents (Sam, Casey, Oliver, Maya, Zoe, Marcus) coordinated by a Triage agent, sharing one ProjectState.

## Repo status

This repo is a **Claude Design handoff bundle**, not yet a built app. The prototype in `project/` is the visual + interaction spec. The real application is being built fresh in `src/` using Vite + React.

- `project/` — the HTML/CSS/JS prototype. Read to understand **what** to build. Do not port its structure directly.
- `chats/` — design conversation transcripts. The "why" behind decisions. Read once when starting on a new area.
- `src/` — the real app. Target architecture below.
- `docs/HANDOFF.md` — phase-by-phase roadmap. Read per phase, not per session.

## Target architecture (honor this contract)

```
src/
  lib/
    state.mock.js   canonical ProjectState shape (replace with live feed in Phase 1)
    bridge.js       ONLY outbound-call surface; MockBridge → WSBridge
    store.js        subscribe/select/mutate; UI never fetches directly
    schema.js       runtime validation for every mutation (Phase 1)
  ui/
    frame.jsx             TopBar + LeftNav + RightDrawer
    screens-mission.jsx   Mission Control, Triage, Tasks, Handoffs
    screens-knowledge.jsx Hive Mind, Structure, Cast, World, Scenes, AgentWorkbench
    screens-system.jsx    State Inspector, Future Modules, Settings
```

UI reads state via `useStore(selector)`, writes via `window.WOS.store.actions.*`. Nothing else. All networking lives in `lib/bridge.js`.

## Hard rules

1. **UI never touches `lib/bridge.js` directly.** If a new mutation is needed, add an action in `store.js`.
2. **Agents cannot write outside their declared scope.** `agent.writes` is a permission boundary, not documentation.
3. **Shared information lives in ProjectState.** No side channels between agents.
4. **Memory classes are not interchangeable.** `canon` is immutable except by Zoe. `pinned` requires user approval to delete. Never conflate.
5. **Triage is the only router.** Specialists file handoffs; they do not invoke each other.

## Working style

- Prototype in `project/` is HTML/CSS/JS. Target is React + Vite. Match visual output, not internal structure.
- Ambiguous scope? Ask before implementing. Cheaper than rebuilding.
- Phase roadmap and known debts live in `docs/HANDOFF.md` — load when starting a phase, not every session.
- No tests yet. Add Vitest once there is a backend worth testing (post-Phase 1).

## Coding discipline (Karpathy guidelines)

Always apply these four principles. Full text lives in `.claude/skills/karpathy-guidelines/SKILL.md` — invoke that skill when you want the long form.

1. **Think before coding.** State assumptions. Present alternatives instead of silently picking. If something is unclear, stop and ask.
2. **Simplicity first.** Minimum code that solves the stated problem. No speculative features, abstractions, or error handling for impossible cases.
3. **Surgical changes.** Touch only what the request requires. Don't refactor adjacent code, don't delete pre-existing dead code, match existing style.
4. **Goal-driven execution.** Convert tasks into verifiable success criteria before starting. For multi-step work, write a brief numbered plan with a verify step on each line.

Source: <https://github.com/multica-ai/andrej-karpathy-skills>
