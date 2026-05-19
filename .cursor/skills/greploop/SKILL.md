---
name: greploop
description: Iteratively fix a GitHub PR until Greptile scores 5/5 with zero unresolved comments. Use after opening a PR with Greptile enabled.
disable-model-invocation: true
---

# Greploop (Cursor + Greptile)

Adapted from [greptileai/skills/greploop](https://github.com/greptileai/skills/blob/main/greploop/SKILL.md).

## Prerequisites

- Greptile installed on the GitHub repository
- Greptile MCP configured (see `.cursor/mcp.json.example` and `docs/AGENTIC_ENGINEERING_SETUP.md`)
- `gh` CLI installed and authenticated (`gh auth login`)

## Usage

User invokes: `/greploop` or `/greploop 42` (PR number).

## Loop (max 5 iterations)

1. Identify PR for current branch: `gh pr view --json number,headRefName`
2. Push latest commits if needed.
3. Trigger Greptile review if not already running (`@greptile review` comment when appropriate).
4. Wait for Greptile check to complete; read confidence score (e.g. `3/5`) from PR body or bot review.
5. Fetch unresolved inline review comments from Greptile.
6. **Exit** if score is **5/5** and zero unresolved actionable comments.
7. Fix actionable items; commit and push; resolve addressed review threads via `gh api graphql` where possible.
8. Repeat.

## Context discipline

- Works best on **small PRs** (single feature). Huge diffs will hit context limits — split the PR instead of looping forever.
- If stuck below 5/5 after 5 iterations, report remaining comments and stop.

## Output

On success:

```text
Greploop complete.
  Iterations:    N
  Confidence:    5/5
  Resolved:      N comments
  Remaining:     0
```

Use Greptile MCP tools when available; fall back to `gh` API as in the upstream skill.
