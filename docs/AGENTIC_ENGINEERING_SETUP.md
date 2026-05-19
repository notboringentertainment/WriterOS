# Agentic engineering setup (Mickey / David Ondrej workflow)

This guide mirrors the stack described around **10:12** in [Stop Vibe Coding, Start Agentic Engineering – Micky](https://www.youtube.com/watch?v=PzVV4X37ihg&t=612s): **Cursor as the harness**, **GPT‑5.5** for most work, **Claude Opus** for UI, **opensrc** for dependency truth, and **Greptile + greploop** for review loops.

Resources from the episode (skills, repos): [davidondrej.com/micky-podcast](https://www.davidondrej.com/micky-podcast).

---

## 1. Cursor as the harness

The **model** only predicts text. The **harness** (Cursor) supplies tools (read file, search, terminal, MCP), system instructions, and project rules so the model can act on your repo.

### Enable models in Cursor

1. Open **Cursor Settings** (`Cmd+Shift+J` / `Ctrl+Shift+J`).
2. Go to **Models**.
3. Turn on:
   - **GPT‑5.5** (pick **Extra High** + **Fast** if shown — Mickey’s default for large / complex codebases).
   - **Claude Opus 4.7** (pick **Max** + **Fast** for UI work).
4. Set a **default** model for day‑to‑day work (Mickey: GPT‑5.5 Extra High Fast).

### Model picker habit

| Task | Model (Mickey) |
|------|----------------|
| Backend, architecture, large refactors, most features | **GPT‑5.5 Extra High Fast** |
| UI, layout, CSS, React screens, visual polish | **Claude Opus 4.7 Max Fast** |

- Use the **model dropdown** at the top of Agent chat, or **`Cmd+/`** / **`Ctrl+/`** to cycle models.
- **Start a new chat** when context is bloated (Mickey restarts sessions instead of relying on compaction).
- For parallel work: **new chat tab** (`Cmd+T`) — e.g. Opus on UI tab, GPT on logic tab.

### Agent view

Use **Agent** mode (`Cmd+I` / `Ctrl+I`) for implementation. Use **Plan** mode when you want a plan before code (you stay in charge; shrink the plan if it’s too big for one pass).

---

## 2. Project harness (this repo)

Already added for WriterOS:

| Path | Purpose |
|------|---------|
| [`AGENTS.md`](../AGENTS.md) | Light, non‑obvious project facts + opensrc usage |
| [`.cursor/rules/`](../.cursor/rules/) | Architecture and hard rules (always on) |
| [`.cursor/agents/`](../.cursor/agents/) | Subagents: UI → Opus, implementation → GPT |
| [`.cursor/skills/`](../.cursor/skills/) | `/refactor-service-layer`, `/greploop` |
| [`.cursor/mcp.json.example`](../.cursor/mcp.json.example) | Greptile MCP template |

After pulling, restart Cursor once so rules, agents, and skills are picked up.

---

## 3. opensrc — source code as documentation

Mickey vendors upstream **source** so agents cite real implementations instead of guessing from docs.

Tool: [vercel-labs/opensrc](https://github.com/vercel-labs/opensrc) (`npx opensrc` / `npm i -g opensrc`).

### Install CLI (once)

```bash
npm install -g opensrc
# or per-run:
npx opensrc --help
```

### Fetch packages you depend on

```bash
npm run opensrc:fetch -- react react-dom vite
# GitHub repos:
npm run opensrc:fetch -- vercel/vite
```

### Optional: vendor into `repos/` for @‑mentions in Cursor

```bash
npm run opensrc:vendor -- react
```

Then in Agent chat you can `@repos/npm/react/...` (paths under `repos/` are gitignored).

### Prompt pattern

> Implement X using our patterns. **Reference the source in `repos/` (or run `opensrc path <pkg>`)** for API usage — do not guess.

---

## 4. Workflow loop (agentic, not vibe coding)

1. **You** decide the feature and write a **small plan** (Plan mode or a short bullet list).
2. **Implement** with GPT‑5.5 (or Opus for UI-only tasks / `@ui-builder`).
3. **Test locally** (`npm run dev`, manual check).
4. **`/refactor-service-layer`** — dedupe helpers into a clear service layer (see skill).
5. **Open a small PR** (one feature, minimal diff).
6. **Greptile** reviews on GitHub.
7. **`/greploop`** — fix review comments until 5/5 (needs Greptile MCP + `gh`).

### Context discipline

- Keep prompts **specific**; tag only the folders/files needed.
- If the thread feels “dumb,” **new chat** with a short summary + plan link.
- Big plans → split into **multiple small PRs** the model can finish in one context window.

---

## 5. Greptile + greploop in Cursor

1. Sign up: [app.greptile.com](https://app.greptile.com/signup) and install Greptile on your GitHub repo.
2. API key: [Organization → API Keys](https://app.greptile.com/settings/organization/api).
3. Copy [`.cursor/mcp.json.example`](../.cursor/mcp.json.example) → **Cursor Settings → Tools & MCP → Add Custom MCP** (or project `.cursor/mcp.json` with your key).
4. Install GitHub CLI and auth: `gh auth login`.
5. In Agent chat after a PR exists: **`/greploop`** or **`/greploop 42`**.

Official skill source: [github.com/greptileai/skills](https://github.com/greptileai/skills) (this repo includes a Cursor copy under `.cursor/skills/greploop/`).

---

## 6. Subagents (model per task)

Invoke explicitly or let Agent route by description:

| Subagent | Model | When |
|----------|-------|------|
| `/implementer` | GPT‑5.5 (set in frontmatter) | Default implementation |
| `/ui-builder` | Claude Opus 4.7 Max | `src/ui/**`, CSS, layout |

**Important:** Open **Cursor Settings → Models** and confirm the `model:` IDs in `.cursor/agents/*.md` match names in your model picker. Rename frontmatter if your labels differ (e.g. `gpt-5.5-high-fast`, `claude-4.7-opus-max`).

---

## 7. Cost note

Cursor bills premium models from your **API usage pool**; Claude Code / Codex subscriptions are separate products. Mickey’s point: the harness quality is worth it for switching models and tool integration — but you can still use **BYOK** (Settings → Models → add Anthropic/OpenAI keys) if you prefer.

---

## Quick checklist

- [ ] Cursor Pro (or plan with GPT‑5.5 + Opus)
- [ ] GPT‑5.5 Extra High Fast + Opus 4.7 Max Fast enabled
- [ ] `opensrc` installed; fetched deps you use often
- [ ] This repo’s `.cursor/` + `AGENTS.md` in place
- [ ] Greptile on GitHub + MCP configured
- [ ] `gh` authenticated
- [ ] Habit: plan → implement → refactor skill → small PR → greploop
