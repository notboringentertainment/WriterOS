# WriterOS — New UI Plan

**Status:** Aesthetic locked (Phase 0). Implementation not started.
**Date:** 2026-06-16
**Source of truth:** the three mockups in this directory —
- `writers-room-vertical-slice.html`
- `writeros-working-surface.html`
- `writeros-outline-surface.html`

This document consolidates the aesthetic into one reviewable place. Every token below is extracted from those mockups, not invented.

**The three mockups, the writers-room slice, and the live `client/src/index.css` do not agree on several tokens.** §1a is the full reconciliation. The rule applied: **the surface mockups (`working` + `outline`) win** — they are the newest aesthetic-lock artifacts; the writers-room slice is older and `index.css` is the pre-aesthetic live state to be overwritten.

---

## 1. Aesthetic principles

The look is **noir / black void**: a near-black workspace shell, warm "paper" for the document the writer is actually working on, and a small set of saturated persona accent colors that are the only real color in the room. Color means *something* — it identifies who is speaking — so the chrome stays desaturated and gets out of the way.

Five principles:

1. **Black void canvas.** The shell (spine, rails, top bar) sits on a cold near-black. Color is reserved for personas and semantic state.
2. **Warm paper for the work.** The center document is a warm dark "paper" tone with its own warm ink, visually distinct from the cold chrome — the writing is the lit object on the desk.
3. **Color-coded persona roster.** Each room member owns one accent hue, used consistently everywhere they appear (name, plate, their edits, their thread).
4. **Surface-aware left spine.** The spine reads differently per surface and per altitude — see §3.
5. **Earned structure.** Acts/sequences are never pre-printed. They appear only when the writer's beats earn them and the writer approves the grouping. See §4.

### Design tokens (canonical)

The mockups note **"Palette = canonical index.css"** — these tokens should live in `index.css` as the single source, and all surfaces consume them. Do not redefine per-surface.

**Chrome / void**
| Token | Value | Use |
|---|---|---|
| `--bg` | `hsl(220 14% 7%)` | App void background |
| `--bg-deep` | `hsl(220 16% 5%)` | Deepest backdrop (writers-room) |
| `--rail` | `hsl(220 14% 8.5%)` | Rails / spine background |
| `--rail-2` | `hsl(220 13% 11%)` | Raised rail surface |
| `--surface` | `hsl(220 13% 12%)` | Raised chrome surface |
| `--border` | `hsl(220 13% 16%)` | Default hairline |
| `--border-2` | `hsl(220 13% 22%)` | Emphasized border |

**Paper / document**
| Token | Value | Use |
|---|---|---|
| `--paper` | `hsl(36 9% 9.5%)` | Document paper (warm) |
| `--paper-hi` | `hsl(38 11% 12.5%)` | Paper highlight / active slot |
| `--ink` | `hsl(40 14% 87%)` | Paper body text |
| `--ink-soft` | `hsl(40 10% 64%)` | Paper secondary text |

**Foreground (chrome text)**
| Token | Value |
|---|---|
| `--fg` | `hsl(220 10% 86%)` |
| `--fg-muted` | `hsl(220 10% 52%)` |
| `--fg-subtle` | `hsl(220 10% 34%)` |

**Persona accents** (one hue per member; `-dim` = de-emphasized/idle state)
| Persona | Accent | Dim |
|---|---|---|
| Morgan (host) | `--amber hsl(38 90% 68%)` | `--amber-dim hsl(38 55% 44%)` |
| Alex | `hsl(15 80% 70%)` | — |
| Casey | `hsl(200 100% 75%)` | — |
| Maya | `hsl(330 80% 75%)` | — |
| Sam | `hsl(45 100% 75%)` | — |
| Oliver | `hsl(120 38% 64%)` | `hsl(120 22% 40%)` |
| Zoe | `hsl(270 70% 75%)` | — |

**Host accent naming — DECIDED:** use **`--amber` as the literal token, with `--host: var(--amber)` as the semantic alias.** (The writers-room slice names this hue `--host`/`--host-dim`; the surfaces name it `--amber`/`--amber-dim`. They are also *different values* — see §1a — so this is a value reconciliation, not just a rename.)

### 1a. Token reconciliation (REQUIRED before build)

The sources disagree. Canonical = surface mockups. `index.css` is **not empty — it carries an older token system** (28 vars) that must be migrated, not bulldozed. Strategy (per the §5 decisions): overwrite divergent values to canonical, **add** genuinely-new tokens, and keep legacy names as **compatibility aliases** (`--wp-amber: var(--amber)`) until every consumer is migrated.

**Values verified against `client/src/index.css` on 2026-06-16.**

| Token | writers-room | surfaces (canonical) | live `index.css` | Action |
|---|---|---|---|---|
| `--bg` | `hsl(220 13% 9%)` | `hsl(220 14% 7%)` | `hsl(220 13% 9%)` | overwrite → `220 14% 7%` |
| `--fg` | `hsl(220 10% 88%)` | `hsl(220 10% 86%)` | `hsl(220 10% 88%)` | overwrite → `86%` |
| `--fg-muted` | `hsl(220 10% 50%)` | `hsl(220 10% 52%)` | `hsl(220 10% 50%)` | overwrite → `52%` |
| `--fg-subtle` | `hsl(220 10% 33%)` | `hsl(220 10% 34%)` | `hsl(220 10% 35%)` | overwrite → `34%` (3-way split) |
| `--border` | — | `hsl(220 13% 16%)` | `hsl(220 13% 20%)` | overwrite → `16%` |
| `--surface` | `hsl(220 13% 12%)` | (uses `--rail`/`--paper`) | **present** `hsl(220 13% 12%)` | keep value; decide if still referenced |
| `--surface-2` | — | — | **present** `hsl(220 13% 15%)` | legacy; alias or migrate usages |
| `--oliver` | `hsl(120 38% 64%)` | `hsl(120 38% 64%)` | **`hsl(120 60% 70%)`** | overwrite → `120 38% 64%` (live is badly off) |
| host accent | `--host hsl(38 90% 68%)` | `--amber hsl(38 90% 68%)` | **present as `--wp-amber hsl(38 90% 68%)`** | add `--amber`; `--host: var(--amber)`; `--wp-amber: var(--amber)` (value already matches — visual no-op) |
| host dim | `--host-dim hsl(38 60% 45%)` | `--amber-dim hsl(38 55% 44%)` | **present as `--wp-amber-dim hsl(38 60% 45%)`** | add `--amber-dim 38 55% 44%`; alias `--host-dim`, `--wp-amber-dim` → it (slight value shift) |
| `--oliver-dim` | `hsl(120 22% 40%)` | `hsl(120 24% 42%)` (outline) | absent | add → `120 24% 42%` |
| `--paper` `--paper-hi` `--ink` `--ink-soft` | — | see §1 | **absent** | add (new) |
| `--rail` `--rail-2` `--bg-deep` `--border-2` | — | see §1 | **absent** | add (new) |
| `--del` `--ok` | — | see §1 | **absent** | add (new) |
| `--primary` `--primary-dim` | — | — | **present** `hsl(260 100% 80%)` / `hsl(260 60% 50%)` (purple) | legacy, not in new system — decide: alias or retire |
| `--alex` | `hsl(15 80% 70%)` | `hsl(15 80% 70%)` | **absent** | add → `15 80% 70%` |
| `--marcus` | — | — | **present** `hsl(15 80% 70%)` (= Alex's hue) | **orphan** — dead persona name; alias `--marcus: var(--alex)` then retire |

> **Registry accent naming is a third scheme.** `shared/personas.ts` stores `accentColor` as string tokens (`--wp-amber`, `persona-sam`, `persona-outline`, `persona-character`, …) — neither raw mockup tokens nor a consistent `index.css` var. **Decision (§5):** define one canonical map `persona id → token` (`writingPartner → --host`, `sam → --sam`, `casey → --casey`, `oliver → --oliver`, `maya → --maya`, `zoe → --zoe`, `alex → --alex`); point the registry at it; keep legacy names as aliases during the slice.

**Semantic state**
| Token | Value | Use |
|---|---|---|
| `--ok` | `hsl(120 40% 62%)` | Accept / resolved (shares Oliver's green family) |
| `--del` | `hsl(6 52% 60%)` | Deletion / reject |

**Type**
| Token | Stack | Role |
|---|---|---|
| `--serif` | `"Fraunces", Georgia, serif` | Display / headings |
| `--read` | `"Newsreader", Georgia, serif` | Reading / document prose |
| `--mono` | `"IBM Plex Mono", ui-monospace` | Personas' voice, structural labels, system |

**Motion**
| Token | Value |
|---|---|
| `--ease` | `cubic-bezier(.16,.84,.28,1)` |
| `--slow` | `cubic-bezier(.65,.02,.16,1)` |

---

## 2. The three surfaces

All working surfaces share **one layout grid** (from the mockups, identical across working + outline):

```
grid-template-columns: 266px  minmax(0,1fr)  360px;
grid-template-rows:    46px   1fr;
```

- **Top bar (46px):** breadcrumb / surface label.
- **Left (266px) — `nav.tree`:** the surface-aware spine (§3).
- **Center (`section.doc-wrap`):** the document on warm paper. The main stage.
- **Right (360px) — `section.chat` / `aside.rail`:** the persona chat rail for the surface's host.

### 2a. Working surface (`writeros-working-surface.html`)
The "Cursor for writers" surface. Center is the live document on paper. Two signature mechanics:

- **Gated diff edits.** A persona's proposed change lands as an inline diff *on a specific slot* and waits. Deletions render in `--del`, insertions tinted; the writer hits **✓ Accept** (`--ok`) or **✕ Reject** (`--border-2`). Nothing mutates the document until accepted. This is the core trust contract — the AI proposes, the writer commits.
- **Story linter.** A thin strip along the document flags weak elements (e.g. a weak Need slot). A flag routes to the right persona (weak Need → Sam elicits it); when the writer resolves it, **the linter clears and the loop closes.**

### 2b. Outline surface (`writeros-outline-surface.html`)
> "Same working surface, different altitude." Same grid, same paper, but the spine and center operate on **beats**, not finished prose. This is where earned structure (§4) is most visible: loose beats → writer-grouped sequences → (eventually) acts.

### 2c. Writers' Room (`writers-room-vertical-slice.html`)
The persona layer / vertical slice. Establishes the roster and the host handoff:

- **Morgan = Showrunner (`writingPartner`)** — amber, warm serif. Drives the "inward why": core statement, recurring themes.
- **Oliver = Story Structure Editor** — green, austere mono. Owns endings and structural principles.
- Flow demonstrated: **Morgan (why) → Oliver (structure) → Readback.**
- Other roster members (Alex, Casey, Maya, Sam, Zoe) each own an expertise and a hue; Sam owns Need/Synopsis elicitation (the Synopsis surface = 9 slots, Sam).

**Persona-per-surface:** each surface is hosted by the persona whose expertise it serves. The right rail's voice, accent, and prompts change with the surface.

---

## 3. Surface-aware spine

The left spine (`nav.tree`, 266px) is **not** a fixed project tree. It reflects the surface and the writer's progress:

- On the **Synopsis** surface it shows the 9 Need slots (Sam).
- On the **Outline** surface it shows captured **beats**, loosely held — and *only* the sequences/acts the writer has earned and grouped.
- Higher-fidelity surfaces (Treatment, Screenplay, Story Bible) show their own appropriate altitude.

The spine label pattern seen in the mockups: `Outline · Beats`, `… · 2 sequences formed · 1 loose`.

---

## 4. Earned structure (the rule)

Direct from the outline mockup, verbatim intent:

> "BEATS, not slots: structure is EARNED, not pre-printed."
> "acts aren't drawn until the beats earn them."
> "structure is only as deep as the work has earned."

Mechanic:
1. Writer captures **loose beats** (unsequenced).
2. When beats cohere, the system *suggests* grouping them into a **sequence** — but the **writer accepts** it. ("structure earned, writer-approved.")
3. Sequences are named by the writer (e.g. "Sequence 1 · The Cleanup").
4. **Acts** only emerge once sequences earn them. Loose beats may be "hiding your first act" — the system can hint, never auto-draw.

This is the structural analogue of the gated-diff contract: the system proposes structure, the writer commits it.

---

## 5. Locked vs open

### Locked
- Noir / black-void aesthetic; warm paper for the document.
- Full token set above (chrome, paper, persona accents, semantic, type, motion).
- 3-column grid: `266px | 1fr | 360px`, 46px top bar.
- Morgan = Showrunner = `writingPartner`, amber, warm serif — **as the design target.** (Not yet true in code; see Open below.)
- Persona-per-surface; one accent hue per roster member.
- Gated-diff edit contract + story linter on the working surface.
- Earned structure (beats → writer-approved sequences → acts).

### Open
- **Host identity not yet in the model — DECIDED: display-alias, not rename.** The aesthetic target is **Morgan / Showrunner**, but the live registry (`shared/personas.ts:12-20`) defines the host as `name: "Writing Partner"`, `role: "Creative Director"` — Morgan/Showrunner exist *nowhere* in code, and the UI hardcodes "Writing Partner" (`LeftRail.tsx:64,82,95`; `wpRouting.ts:153,169`; `openaiService.ts:750`).
  **Resolution:** keep the internal `id: writingPartner` stable (it's load-bearing for routing, transcripts, storage keys, tests, API). Add a public identity layer: `displayName: "Morgan"`, `displayRole: "Showrunner"`. UI and prompts render the display fields; all plumbing keeps using `writingPartner`. Then re-source every hardcoded "Writing Partner" site from the display fields. Must land before shell build (§7).
- **Token name collision.** `--host`/`--host-dim` (writers-room) vs `--amber`/`--amber-dim` (surfaces) are the same hue under two names. Reconcile in `index.css` before build (recommendation in §1).
- **Composer staleness (deferred).** Prompt/contract changes don't trigger a Recompose banner — tracked as separate architecture cleanup (PR #25 follow-up), not part of this aesthetic work.
- Surfaces beyond Synopsis/Outline (Treatment, Screenplay, Story Bible) have the grid + principles but their spine/center specifics aren't yet mocked to the same fidelity.

---

## 6. Project page — gated follow-up (do not fold in)

The existing **Project page is functionally complete** and must not be left behind. It will be **reskinned to this design system** so it reads as WriterOS — same void/paper/persona language, same tokens, same spine grammar — and **not** like a bolt-on from another app.

Constraints:
- **Preserve all current functionality.** Visual layer only; no feature regression.
- **Reskin only after the design system above is finalized** (tokens settled in `index.css`, host label + token collision resolved). This task is **gated on** §1–§5, not part of them.
- Treat as its **own task**, sequenced after aesthetic lock — not bundled into the lock work (avoids scope creep and delaying the lock).

---

## 7. Suggested build order (for review)

1. Land canonical tokens in `index.css` per §1a: overwrite divergent values, add the new set, `--amber` literal + `--host: var(--amber)` alias. Keep legacy names as **compatibility aliases** (`--wp-amber: var(--amber)`, `--marcus: var(--alex)`, decide `--primary`/`--surface-2`) — do **not** delete live tokens until consumers are migrated. Define the persona-id → canonical token map.
2. Add the host **display-alias** in `shared/personas.ts` (`displayName: "Morgan"`, `displayRole: "Showrunner"`; keep `id: writingPartner`), then re-source every hardcoded "Writing Partner" site (`LeftRail.tsx`, `wpRouting.ts`, `openaiService.ts`) from the display fields.
3. Build the shared shell: 3-column grid, top bar, void chrome, warm-paper center.
4. Working surface: gated-diff edit contract + story linter.
5. Outline surface: beats spine + earned-structure grouping.
6. Writers' Room roster + persona-per-surface host swap.
7. **Then** the gated Project-page reskin (§6).
