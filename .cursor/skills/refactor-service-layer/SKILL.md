---
name: refactor-service-layer
description: After a feature ships, find duplicated runtime/helpers and consolidate into a reusable service layer. Use when the agent rewrote similar functions instead of reusing them.
disable-model-invocation: true
---

# Refactor service layer

Run **after** a feature works locally and you are happy with behavior — not before first implementation.

## Goal

Reduce code smell from copy-pasted helpers (e.g. multiple "stream response" or "send message" paths). Extract **one** clear module per concern so the next agent session can navigate the codebase.

## Steps

1. Search for duplicated logic:
   - Similar function names (`send*`, `stream*`, `fetch*`, `handle*`).
   - Repeated blocks in `src/lib/` and feature files.
2. List candidates in chat (file + line + short reason).
3. Propose a **minimal** service module (e.g. `src/lib/services/<name>.js`) with shared functions.
4. Replace duplicates with imports from the service layer. **Do not change behavior.**
5. Run `npm run build` to verify.
6. Summarize what moved and what to call next time.

## WriterOS constraints

- Do not break store/bridge boundaries.
- UI still uses `window.WOS.store.actions.*` — services sit behind actions or in `src/lib/`, not in components as network clients.

## When to skip

- Tiny one-off scripts or mock-only phase-0 code with no duplication.
- Active feature still being debugged — finish behavior first.
