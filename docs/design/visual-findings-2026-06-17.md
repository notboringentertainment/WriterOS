# Visual Findings / PRD Implications — 2026-06-17

Rendered the mockups headless (Chrome), drove them through their curtains + choreography, and inspected the pixels (full frames + zoomed console/rail at real width + two narrow-width captures). This is what the rendered output actually shows — including where it **contradicts the handoff**.

## Per-question findings

**1. Does the outline-console variant supersede the older quiet 3-column?**
Mostly yes — it's the right *direction*. But the original quiet working surface (`writeros-working-surface.html`) has three qualities the PRD must **carry forward**, because the console variant loses them:
- **Persistent full navigation.** The old left rail shows Documents + Synopsis spine + Characters all at once. The console buries nav inside a scroll.
- **Calm density.** The old surface doesn't fill every pixel; the console fills its column edge-to-edge (see #3).
- **Multi-turn conversation.** The old small chat rail handles dense back-and-forth; the teleprompter is built for one authored beat at a time.
→ Direction = console variant; *keep* persistent nav legibility and a compact conversation fallback.

**2. Teleprompter recede — dim vs shrink?**
**Honors Ben's preference.** Zoomed rail confirms: all turns keep substantial size; recede is pure opacity (most-recent history ~.34 → older .22 → oldest .14). The oldest line ("Sequence 1 is clean") is nearly invisible but readable on hover. Dim-not-shrink is real. One tweak for PRD: set a **dim floor (~.18)** so a long thread's oldest visible turns don't disappear entirely — rely on scroll for true history, not near-zero opacity.

**3. Console density — useful or crowded?**
At a **7-beat** project the console is *full but legible* top-to-bottom (bar → Documents → earned-structure spine → host → voice signals → pending → foot), no breathing room left. The earned-structure spine grows **unbounded** (real features = dozens of beats, multiple sequences). It will push host/signals/pending below the fold and force scrolling on the part of the console you most want glanceable (state).
→ **Recommend LEAN console (fixed state: host/facts/signals/pending) + a separate navigation/earned-structure rail** for the growing spine. One dense instrument doesn't scale.

**4. Paper/void distinction across surfaces?**
**Works.** On the working/outline surfaces the warm paper sheet visibly glows (brown-warm) against the cold blue-black console + field. On Projects there is no paper — it reads as cold shell. The "paper = the work object" law is legible. Keep it.

**5. Projects reskin — serious or decorative?**
**Serious.** Restrained hairline cards (not heavy/toy), amber primary button, ghost secondaries, real tabs/filter/sort, full row actions. Reads as a management page, not a marketing card-grid.
→ But the mockup only shows the **happy path** (2 active, 0 archive, folder remembered). PRD must explicitly cover the live states the sample omits: empty/no-folder, no-projects, populated archive, scanning/loading, folder-permission/error, per-row busy (duplicating/archiving/deleting), import flow, `⌘K`, Voice/Writer's-Room entry.

**6. Persona accents coherent?**
Coherent where seen: Morgan/amber, Oliver/green, Sam/yellow all read distinctly and consistently (name, spine, edits, bloom). Alex/coral and Zoe/violet appear only as small spine dots — fine, but **not stress-tested as a host accent**; PRD should show each persona owning a surface to confirm legibility at scale. Generic **`--primary` purple should be retired** (gone from Projects already); **Zoe's persona violet (hsl 270 70% 75%) stays valid** — it's an identity hue, not the legacy app accent. No conflict between the two; they're different tokens.

**7. Gridded field — substrate or noise?**
Substrate, **as tuned**. It's a quiet, masked, vignetted grid that reads as "desk," not pattern. The bloom adds warmth without busyness. One caution: on the working/outline surfaces the grid only shows in the gaps around the docked panels — it's fine there, but if panels ever go transparent/lighter it could get noisy. PRD: keep grid opacity low (~4–5% line) and always behind a vignette; never let it cross paper.

**8. Responsive — what the variants actually do.**
- Outline variant at **1180px**: all three zones still render but cramped — paper measure gets short, rail tight. No content lost, but uncomfortable.
- Working-console variant at **1180px**: **the readback/agent voice is HIDDEN** (media query `display:none` under 1320px). **This contradicts the handoff** — you lose the entire conversation on a narrow window. Unacceptable as a real rule.
→ PRD breakpoints (recommended): **≥1440** all three zones; **1100–1440** console collapses to an icon/overlay toggle, paper + rail stay; **<1100** single-column paper with console + rail as summoned overlays/bottom-sheets. **Nothing that carries agent voice or state may simply vanish** — it docks or toggles.

**9. Intake theatre — earned, and separate?**
Yes, earned as a one-time identity moment — and it reads as a distinct **stage** (centered, spotlit, single-focus, no paper sheet, no docked chrome). **But there are two intake variants that pull opposite directions:**
- `writers-room-vertical-slice.html` (**pure theatrical**, no console) separates *hardest* from daily surfaces.
- `writeros-context-console-variant.html` (**theatre + console**) shares the console grammar with the working surfaces, so it blurs the line the handoff wants drawn.
→ **Recommend the pure slice for the actual Voice Profile intake.** Reserve the console grammar for daily work, so theatre stays unmistakably separate.

**10. Voice-signal continuity — meaningful or weak?**
Present but **visually weak.** On the working-console readback the link is a small mono caption ("aligned to voice signal: interiority · being known"); on accept the console chip lights. The mechanism is right but the evidence is faint.
→ PRD: strengthen the tie — e.g., on a proposed edit, **pulse/halo the exact console signal chip it honors in sync with the readback**, share an accent between the readback align-line and that chip, or draw a brief connecting accent. Make "this edit came from your profile" *seen*, not just captioned.

## Contradictions with the handoff (explicit)

1. **Narrow-width vanishing (Q8).** Working-console variant hides the agent rail under 1320px. Handoff demands "real collapse/stack/dock rules, nothing hidden." Must be specified, not inherited.
2. **Two intake variants (Q9).** The console-grammar intake undercuts the "theatre clearly separate" goal. Pick the pure slice.
3. **Console scope (Q3) is unresolved and load-bearing.** Rendered density says lean-console-plus-spine-rail; the outline mockup shipped full-console. This is the deferred decision and it changes the component inventory.

## Net

Direction is clear enough to write the PRD **after** locking three forks below (two of which the rendered output now argues a side on). Smoothing them over would bake a contradiction into the spec.
