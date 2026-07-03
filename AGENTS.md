# WriterOS — agent context (keep this file thin)

Models are strong enough to infer stack from `package.json` and `src/`. Only document what is **not obvious** from the tree.

## Product

Personality-driven multi-agent **writing studio**. Six specialists + Triage share one `ProjectState`. React + Vite app in `src/`; HTML prototype in `project/` is visual spec only — do not port its structure.

## Architecture contract

- Read state: `useStore(selector)` from `src/lib/store.js`.
- Write state: `window.WOS.store.actions.*` only — never mutate state ad hoc.
- Networking: `src/lib/bridge.js` only. **UI must not import or call `bridge.js`.**
- Triage routes work; specialists do not call each other directly.
- Memory classes: `canon` (immutable except Zoe), `pinned` (user approval to delete) — never conflate.

Full rules: `.cursor/rules/writeros.mdc` and `CLAUDE.md`.

## opensrc — dependency source truth

When implementing a feature that depends on an npm package or upstream repo:

1. Prefer reading **actual source**, not guessed APIs.
2. Run `npm run opensrc:fetch -- <package>` or `opensrc path <package>` (global CLI).
3. Optional vendor for `@` mentions: `npm run opensrc:vendor -- <package>` → under `repos/`.
4. In prompts: **reference the vendored path or `$(opensrc path <pkg>)` output** — find the exact function; do not invent signatures.

## When to use which agent (human choice in Cursor)

| Work | Suggested agent |
|------|-----------------|
| UI in `src/ui/`, CSS, layout, visual polish | `/ui-builder` (see `.cursor/agents/ui-builder.md`) |
| Store, bridge, schema, multi-file logic | `/implementer` (see `.cursor/agents/implementer.md`) |

## After each feature

1. Test locally (`npm run dev`).
2. Run **`/refactor-service-layer`** if the agent duplicated helpers instead of reusing them.
3. Small PR → Greptile → **`/greploop`** when MCP is configured.

Setup guide: `docs/AGENTIC_ENGINEERING_SETUP.md`.
