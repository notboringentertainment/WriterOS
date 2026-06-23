# WriterOS UI Redesign — PRD

**Status:** Draft for review. Implementation not started.
**Date:** 2026-06-17
**Author:** prepared after a rendered visual pass (see `visual-findings-2026-06-17.md`).
**Scope:** three surface groups — **Project / Home page**, **Voice Profile / Writers' Room intake**, **Working surfaces** (Working + Outline; the same grid hosts Treatment, Synopsis, Story Bible).
**Sources of truth:** `new-ui-plan.md` (aesthetic + tokens), the mockups in `docs/design/`, `visual-findings-2026-06-17.md` (rendered evidence), `docs/product/README.md`, `docs/plans/voice-profile-room.md`, `CLAUDE.md`.

This PRD is a design + behavior contract. It does not contain implementation code. Mockups are reference for intent, not files to port.

---

## 0. Resolved decisions (locked for this PRD)

These were open in the handoff; the rendered pass + Ben's direction resolve them. Encoded here so downstream work doesn't relitigate.

1. **Console scope = LEAN, with a separate persistent spine.** *(Revises the handoff.)*
   The handoff said "the console absorbs navigation + the earned-structure spine." **The rendered console is already full at a 7-beat project**, and the spine grows unbounded — at real feature scale it pushes glanceable state below the fold. **Resolution:** split responsibilities.
   - A **persistent Navigation / Structure Spine** owns documents + the growing earned-structure tree.
   - A **lean Context Console** owns fixed, glanceable state only: host, story facts, voice signals, pending linter/structure items.
   - The two have **independent scroll**; growing structure never scrolls active state out of view.
   - **Guardrail:** this must NOT become a permanent four-column desktop at laptop widths. Spine + console **share the left zone** as two independently-scrolling regions (spine = main scroll area, console = pinned compact state strip), so the working surface stays a **three-zone** composition (left zone | paper | teleprompter), not four columns. See §5.C and §6.

2. **Voice Profile intake = the pure theatrical slice** (`writers-room-vertical-slice.html`). The console-hybrid intake is kept as research only. Theatre is the **one-time identity moment**; console/paper/teleprompter is the **daily workbench**. Keeping the intake console-free preserves that distinction.

3. **No surface may hide agent voice or state on narrow widths.** The working-console variant's `display:none` of the rail under 1320px is rejected. Collapse = dock/overlay/toggle, never vanish. See §6.

4. **Legacy purple (`--primary`) is retired.** Zoe's persona violet (`hsl(270 70% 75%)`) is a distinct identity token and stays. They are not the same color and never were.

---

## 1. Goals & non-goals

### Goals
- Bring three surface groups into the locked noir / paper / persona language with a single canonical token source.
- Make context state **glanceable and theatrical-where-earned** without adding friction to daily writing.
- Preserve every existing function (no feature regression), especially the gated-diff contract, story linter, and earned-structure rule.
- Keep the writing-first posture: documents are the star; agents support the writing.

### Non-goals
- No backend, persistence, routing, or API changes. `/api/wp-chat` stays a thin adapter over `OpenAIService.generatePersonaResponse`.
- No new agent capabilities; this is presentation + interaction.
- No reintroduction of Replit/Drizzle/Neon/Passport/session scaffold.
- "Story-coach" remains internal-only — never a visible tab/title/string.

---

## 2. Design language reference

Tokens are canonical in `new-ui-plan.md §1` and must live once in `client/src/index.css`; surfaces consume, never redefine. Do not restate token values elsewhere. The laws:

- **Void vs paper is load-bearing.** Shell / rails / management pages = cold near-black with a faint gridded field. Documents = warm paper + warm ink. Never paper on chrome, never void on the work. *Paper means "the work you're in."* (Rendered pass confirmed this reads clearly.)
- **Color is identity.** One hue per persona, used wherever they appear. Morgan/host = amber (also app accent); Oliver = green; Sam = yellow; Casey = blue; Maya = pink; Zoe = violet; Alex = coral. Accent = identity + semantic state (`--ok`, `--del`), never decoration.
- **Type carries register.** Fraunces = display/headings; Newsreader = reading & document prose + human/authored voice; IBM Plex Mono = system labels, structural callouts, the machine/console voice. Choose by **speaker**, not size.
- **Two postures.** Theatre (cinematic, centered, spotlit) for the intake only. Quiet docked workbench for everything daily.
- **Gated + earned are visual laws.** AI proposes; nothing mutates until the writer accepts. Acts/sequences are never pre-drawn — they appear only when beats earn them and the writer commits. Proposal and commit are **distinct, legible states**.
- **Atmosphere, restrained.** Grid line opacity ~4–5%, always behind a vignette, never crossing onto paper. A soft persona-hued bloom may shift on handoff. Loud on the intake stage; quiet on working + management surfaces.

---

## 3. Token & identity migration (must precede shell build)

Follow `new-ui-plan.md §1a` (the reconciliation table) and §7 (order). Summary of required work:

1. **Land canonical tokens in `index.css`:** overwrite divergent values to the surface-canonical set, add the new tokens (paper/ink, rail/rail-2, persona accents, `--ok`/`--del`, motion), keep legacy names as **compatibility aliases** (`--wp-amber: var(--amber)`, `--marcus: var(--alex)`) until consumers migrate. **Retire `--primary` purple** — alias to amber only if a live consumer still references it, then remove.
2. **Define the persona-id → token map** (`writingPartner → --host`, `sam → --sam`, …) and point `shared/personas.ts` `accentColor` at it; keep legacy accent strings as aliases during the slice.
3. **Host display-alias:** keep `id: writingPartner` (load-bearing for routing/transcripts/tests/API). Add `displayName: "Morgan"`, `displayRole: "Showrunner"`. Re-source every hardcoded "Writing Partner" site (`LeftRail.tsx`, `wpRouting.ts`, `openaiService.ts`) from the display fields. **Must land before any shell build.**
4. **Verify** every value against the current `index.css` before overwriting (§1a notes the live state was 28 vars; do not bulldoze).

---

## 4. Component inventory

Each component is a reusable unit consumed across surfaces. Behavior is specified; visual values come from §2 tokens.

### 4.0 Layout model — canonical vocabulary (read first)

All left-zone terms map to **one** model. Use these words exactly; they are not interchangeable synonyms.

```
WORKING-SURFACE = THREE ZONES, always:

┌──────────────┬───────────────────────┬──────────────────┐
│  LEFT ZONE   │        PAPER          │   TELEPROMPTER   │
│  ┌────────┐  │   (warm document      │   (agent rail)   │
│  │ SPINE  │↕ │    sheet, own scroll) │   own scroll     │
│  │ region │  │                       │                  │
│  ├────────┤  │                       │                  │
│  │CONSOLE │  │                       │                  │
│  │ region │  │                       │                  │
│  └────────┘  │                       │                  │
└──────────────┴───────────────────────┴──────────────────┘
   one column        one column              one column
```

| Term | Definition | What it is NOT |
|---|---|---|
| **Three-zone** | The whole working-surface layout: **Left Zone · Paper · Teleprompter**. Always three columns. | Never four. The Spine and Console are not separate columns. |
| **Left Zone** | The single left column. Contains exactly two stacked **regions** with independent scroll. | Not two columns; one column, two regions. |
| **Structure Spine** (region) | Top region of the Left Zone. Documents + the **growing** earned-structure tree. The primary scroll area — it absorbs project growth. | Not state. Not the console. |
| **Context Console** (region) | Bottom region of the Left Zone. **Lean, bounded** fixed state: host · facts · voice signals · pending. Pinned; does not scroll in the common case. | Not navigation. Not the spine. Never holds the beat tree. |
| **Console forms** | The Context Console is one component with three responsive **forms** — same content, different footprint: **panel form** (desktop, pinned in the Left Zone) → **strip form** (laptop, slim always-visible state line / edge toggle) → **overlay form** (narrow, summoned sheet over the paper). | "State strip" and "overlay" are *forms of the console*, not new components. |
| **Spine forms** | The Spine likewise has **panel form** (desktop) → **rail/overlay form** (collapses to icon rail or summoned overlay at narrow widths). | Not a new component when collapsed. |

**Invariants:** (1) the layout is always three zones; (2) the Left Zone is always one column holding Spine-region + Console-region; (3) the two regions scroll independently — growing structure never scrolls active state out of view; (4) at every width, **state and agent voice remain reachable** — a form may shrink or be summoned, never `display:none`.

### 4.1 App shell & grid
- Working surfaces use the §4.0 three-zone model: **Left Zone | Paper | Teleprompter**. The Left Zone holds the Spine region above the Console region (two independent scrolls, one column).
- Void header (44–54px): brand (amber mono), surface breadcrumb, draft/autosave status, `⌘K`, Voice + Writer's Room entry. Translucent rail bg over the gridded field.

### 4.2 Navigation / Structure Spine (persistent)
- Owns Documents list + the **surface-aware earned-structure tree** (§3 of new-ui-plan): Synopsis = Need slots; Outline = Sequences → beats + Unsequenced; higher surfaces = their altitude.
- Earned structure is visible here: formed sequences, loose beats, "structure deepens as you group" note. Acts never auto-draw.
- **Own scroll.** Growth here never affects the console.
- Selecting a node scrolls + pings the target on the paper.

### 4.3 Context Console (lean)
- Fixed, glanceable state only: **host** (name/role/accent dot), **story facts** (grounding context the agent reasons over), **voice signals** (from profile), **pending** linter + structure items with persona routing.
- Terminal chrome (lamps, `writeros://` path, LIVE pip) is retained as the instrument identity, but content is bounded — it should not need to scroll in the common case.
- **Own scroll**, independent of the spine. Never pushed below the fold by structure growth.
- Pending items reflect the gated/earned loop: a staged edit appears as a `Gate` item awaiting accept; on resolve it marks done and the matching linter flag clears.

### 4.4 Teleprompter conversation rail
- Latest agent line **large and in focus**; prior turns **recede by dimming, not shrinking** (rendered-confirmed). Graduated: most-recent history brightest, older dimmer.
- **Dim floor ≈ .18** — older turns must not fall to near-zero; rely on scroll for deep history. Hover restores any history turn to legible.
- **Pinned active proposal:** an agent's actionable proposal (gated edit, grouping) stays pinned with its controls until the writer resolves it; then it demotes to history with its turn.
- **Long single output:** one long answer does not shrink — the active line stays large and the rail scrolls internally. Committed history is smaller-dimmer, not tiny.
- **Conversation density fallback:** for dense multi-turn exchange, provide a compact/log reading mode (the original chat rail's strength) so the teleprompter doesn't force one-beat-at-a-time. Default = teleprompter; compact = opt-in toggle.
- Composer at the foot. Transcript is never destroyed — recede is visual only.
- **Transcript separation (hard constraint):** the host rail (Morgan/writingPartner) and Writers'-Room specialist rails draw from their own transcripts (`agents.writingPartner.transcript` vs `agents.sam/casey/…`). The redesigned rail must not merge them.

### 4.5 Warm-paper document sheet
- The work, on warm paper, floating on the gridded field with depth shadow. Own scroll. Holds slots/beats, the gated-diff blocks, and the story-linter strip.
- Active slot/beat gets a persona-accent spine + faint tint.

### 4.6 Gated-diff block
- A persona's proposed change lands inline on a specific slot: deletion in `--del` (struck), insertion tinted with the persona accent. **Nothing mutates** until **✓ Accept** (`--ok`) / **✕ Reject**.
- Controls appear both inline (on paper) and, when surfaced, on the teleprompter (large). Accept flashes the slot, updates state, and clears the routed linter flag.

### 4.7 Story linter
- Thin strip on the paper, count + flags. Each flag carries a craft/structure sig and **routes to a persona**. Resolving clears the flag and decrements the count; the console's matching pending item marks done. The loop visibly closes.

### 4.8 Voice-signal continuity (strengthen — rendered weak)
- Signals captured at intake condition edits on working surfaces. The current textual caption ("aligned to voice signal …") is **too faint**.
- **Requirement:** when an edit is proposed, the exact console signal chip it honors must **highlight in sync** (pulse/halo), sharing an accent with the readback's align-line. The writer should *see* "this edit came from your profile," not just read it.

### 4.9 Console-panel stat cards (Projects)
- Hairline-bordered, translucent rail panels with a subtle amber top-edge, mono micro-label, serif number/title, reading sub. Restrained — management seriousness, not marketing cards (rendered-confirmed).

### 4.10 Theatrical intake stage (intake only)
- Centered, spotlit, no docked chrome, no paper sheet. Curtain → staggered agent beats → large editorial readback. Persona spotlight hue slides on handoff. This composition appears **nowhere else**.

---

## 5. Per-surface specifications

### 5.A Project / Home page (cold shell)
Reference: `writeros-projects-reskin.html`. Cold-void chrome; **no paper** (it is shell, not work).

**Layout:** void header → breadcrumb → title row (`Projects` display + primary/secondary actions) → stat cards → tabs → filter/sort → project rows.

**Functions preserved (all):** New Project (amber primary), Change Folder, Import .fdx, folder/projects/local stat cards with Refresh/Forget, Active/Archive tabs, filter, sort, and per-row Open / Show in Folder / Duplicate / Archive / Delete (`--del`). Persona-hued left accent per row on hover.

**Live states the mockup omits — PRD requires explicit coverage:**
- **No folder chosen / permission needed** (first run, or revoked access).
- **Folder chosen, zero projects** (empty state with guidance).
- **Populated Archive** tab (rows + Restore action).
- **Scanning / loading** the folder (skeleton or progress).
- **Error** (folder unreadable, import failure) — surfaced, not silent.
- **Per-row busy** (duplicating / archiving / deleting in progress; disabled controls).
- **Import .fdx flow** (picker, parse, result).
- Header context for the currently-open project, `⌘K`, Voice, Writer's Room entry.

**Verification:** each state must be designed, not just the happy path.

### 5.B Voice Profile / Writers' Room intake (pure theatrical)
Reference: `writers-room-vertical-slice.html`. The **one-time identity moment**.

- **Composition:** theatrical stage only (§4.10). No docked console, no paper sheet, no teleprompter chrome. This is the visual signal that intake ≠ daily work.
- **Flow:** curtain → host beats (Morgan/Showrunner: the inward why, recurring themes) → handoff → Oliver (endings, structural principle) → **readback** assembling the writer's own words into the profile + an archetype.
- **Elicitation is real:** questions are the `docs/plans/voice-profile-room.md §4` domains. Readback maps to `coreStatement`, `storytellingDNA.recurringThemes`, `storytellingDNA.principles`.
- **Output:** the captured signals seed the working-surface voice signals (§4.8) — this is the continuity payoff.
- **Replication:** the two-agent slice is the approved pattern; the other specialists replicate it once approved. Specialist transcripts stay separate from the host transcript.
- **Re-entry:** spec how a writer revisits/edits a completed profile (the theatre is one-time; editing later should be a calmer surface, not a re-run of the curtain). Open item — see §9.

### 5.C Working surfaces (Working + Outline; shared grid)
Reference: `writeros-outline-console-variant.html` (direction) + `writeros-working-surface.html` (qualities to keep). Treatment, Synopsis, Story Bible inherit this grid at their altitude.

**Three-zone composition:**
- **Left zone** = Structure Spine (§4.2, main scroll) **+** lean Context Console (§4.3, pinned compact state strip). Independent scroll each. *Not a separate fourth column.*
- **Center** = warm-paper sheet (§4.5).
- **Right** = teleprompter rail (§4.4), hosted by the surface's persona (Sam on Synopsis, Oliver on Outline, etc.). Persona accent + voice change with the surface.

**Qualities carried forward from the quiet original (rendered finding Q1):**
- Persistent, legible navigation — the spine is always visible, not buried in a console scroll.
- Calm density — panels should breathe; don't fill every pixel.
- Conversation that handles multi-turn — the teleprompter's compact mode (§4.4) covers dense back-and-forth.

**Signature mechanics:**
- **Gated diff** (§4.6) on the active slot; accept/reject inline + on the rail.
- **Story linter** (§4.7) routes + clears.
- **Earned structure** (§4.2): on Outline, accepting a grouping forms a Sequence on both the paper and the spine, clears the structure linter, and lights the honored voice signal. Writer commits; system never auto-draws acts.
- **Voice-signal continuity** (§4.8) visibly ties edits to the profile.

---

## 6. Responsive behavior (real rules — nothing vanishes)

Responsive behavior = the §4.0 components changing **form**, never disappearing. Guardrail: never a permanent four-column layout; never hide agent voice or state. Recommended breakpoints (tune in build):

- **≥ 1440px (desktop):** full three-zone. Left Zone = Spine **panel form** + Console **panel form**, stacked, independent scroll. Paper. Teleprompter panel form.
- **1100–1440px (laptop):** Paper + Teleprompter stay in panel form. Console enters **strip form** (slim always-visible state line, or edge toggle to its overlay); Spine enters **rail/overlay form** (icon rail or summoned overlay). Still three zones conceptually — the Left Zone narrows, it does not split into columns.
- **< 1100px (narrow):** Paper is the single primary column. Console and Spine are in **overlay form** (summoned sheets); the Teleprompter docks to a bottom sheet / dockable panel — conversation always one tap away, never `display:none`.
- Intake stage is responsive within its own centered composition (no docked zones to collapse).
- Projects page: stat cards reflow to a column; rows wrap actions under the title; controls stack.

**Rejected:** the working-console variant's hard hide of the rail under 1320px.

---

## 7. Accessibility

- Real contrast on **both** void and paper (the two backgrounds need independent contrast checks).
- Visible focus states on every control; full keyboard path for accept/reject, grouping, nav, composer.
- `prefers-reduced-motion`: collapse choreography, grain, and blooms to near-instant; keep state changes legible.
- Teleprompter dim floor (~.18) keeps history readable; never rely on color alone to convey persona or state (pair with label/shape).
- Theatre is skippable / has a reduced-motion path; it must never block reaching the profile.

---

## 8. Slicing / build order

Per `new-ui-plan.md §7`, with the gating from `CLAUDE.md`/§6 of the plan:

1. **Tokens + host display-alias** (§3). Nothing renders correctly until this lands.
2. **Shared shell + gridded field + three-zone grid** (working surfaces), with the lean-console / persistent-spine split and independent scroll.
3. **Working surface:** gated-diff + story linter + teleprompter rail (incl. compact mode + dim floor).
4. **Outline surface:** spine earned-structure grouping + the form-on-commit behavior + voice-signal lighting.
5. **Voice Profile intake:** the pure theatrical slice; wire real §4 elicitation → profile → seed voice signals.
6. **Persona-per-surface** host swap across surfaces; confirm each accent as a host (esp. Alex/coral, Zoe/violet, not yet host-tested).
7. **Project / Home reskin — GATED.** Only after tokens settle + host label + token collision resolved. Its own task; cover **all** §5.A states, not the sample.

---

## 9. Open decisions & risks

- **Profile re-entry surface (§5.B):** how a writer edits a completed Voice Profile without re-running the curtain. Needs a calmer surface spec.
- **Compact-vs-teleprompter default (§4.4):** confirm default posture per surface; some surfaces may want compact-first.
- **Left-zone split mock — TOP PRIORITY visual follow-up before build.** The §4.0 model is locked in vocabulary; the exact Spine/Console proportion, the pin behavior, the independent-scroll feel, and the panel→strip→overlay form transitions must be proven on render (avoid the four-column trap in practice, not just in spec). Reference mock: `docs/design/writeros-left-zone-model.html`.
- **Signal-continuity visual (§4.8):** the exact highlight treatment (pulse vs halo vs connecting accent) should be prototyped and chosen on render, not on paper.
- **Persona accent stress test:** confirm coral/violet legibility as host accents at scale.
- **Composer staleness (deferred, from new-ui-plan §5 Open):** prompt/contract changes not triggering recompose — tracked separately, not part of this redesign.

---

## 10. Verification

Per `CLAUDE.md`, after meaningful changes: `npm run test:run`, `npm run check`, `npm run build`. **Visually verify each surface and each responsive breakpoint with browser tooling** — static inspection is insufficient for this work (this PRD itself was corrected by a rendered pass). Every §5.A live state and every §6 breakpoint is a verification target, not just the happy path.
