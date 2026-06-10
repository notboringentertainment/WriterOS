# Document Composer Surface Standards PRD

**Date:** 2026-06-09
**Status:** Planning PRD; no implementation in this slice
**Owner:** Ben
**Related docs:** `docs/product/README.md`, `docs/product/document-composer-prd.md`, `docs/product/structured-writing-surfaces-prd.md`, `docs/product/outline-story-coach-redesign-prd.md`, `docs/product/synopsis-story-coach-redesign-prd.md`, `docs/product/treatment-surface-prd.md`, `docs/product/story-bible-story-coach-redesign-prd.md`
**Research material (local skill pack, research only; never a runtime or repo dependency):** `ai-film-writing-templates/references/synopsis-best-practices-template.md`, `ai-film-writing-templates/references/treatment-best-practices-template.md`, `ai-film-writing-templates/references/story-bible-best-practices-template.md`, `ai-film-writing-templates/references/transformation-playbook.md`

## Summary

Outline Document Composer Slice 1 shipped the first bounded Composer surface. This PRD
defines what the remaining composed Document Views should become before any more composer
code lands:

- **Synopsis:** compact, complete reader orientation.
- **Treatment:** cinematic full-story prose.
- **Story Bible:** source-of-truth reference system.

The goal is to turn the film-writing template research into WriterOS product standards:
what each document is professionally supposed to do, what Edit View questions must
collect, what the Composer needs from those answers, what the final Document View should
look and read like, and what each surface must avoid.

This is a planning slice only. It does not add runtime files, routes, prompts, recipes,
schemas, UI, or tests. Future implementation should happen one surface at a time.

## Research Boundary

The skill-pack reference files are research inputs, not runtime dependencies.

Do:

- Translate the professional document principles into repo-local PRDs, recipes, prompts,
  rubrics, fixtures, and tests.
- Keep `docs/product/document-composer-prd.md` as the architecture authority for derived
  artifacts, single-call composition, provenance, fidelity, staleness, and prompt-injection
  handling.
- Keep Edit View question-first and Document View artifact-first.

Do not:

- Read from `~/.claude/skills/...` at runtime.
- Require those skill files to exist for tests or app behavior.
- Treat the templates as literal UI forms.
- Collapse Synopsis, Treatment, and Story Bible into one generic "polish" prompt.

## Global Composer Standards

These standards apply to Synopsis, Treatment, and Story Bible.

### Source Of Truth

- `documents.<surface>.content` remains canon.
- `documents.<surface>.composed` is derived and read-only.
- The Composer never writes back into authored answers.
- The only way to change story facts is through Edit View.
- `ProjectState.meta.format` is the only behavioral authority for Feature vs Series.
  Surface-local format fields remain mirrors for display/export compatibility.

### Edit View

Edit View is the intake layer. It asks plain-language story questions and stores the
writer's answers in stable professional schema fields.

Edit View must not:

- expose the composer recipe as a form,
- ask the writer to fill "paragraph 1 / paragraph 2" as if that were the product,
- require craft jargon knowledge,
- add composer-only fields merely because the model prompt wants them.

If the Composer needs an input the surface does not collect, the next product decision is
to either add a plain-language question or treat the missing material as missing context.
The Composer must not invent the missing answer.

### Composer Recipe

Each surface must define its own recipe:

- purpose and audience,
- format-specific section order,
- required and omittable source fields,
- important fields for coverage checks,
- block style targets,
- missing-information policy,
- anti-patterns,
- quality rubric.

Readiness language in this PRD ("enough material", "thin", "more than a synopsis") is
directional only. Each surface's implementation PRD must pin concrete per-field
thresholds before that composer slice starts.

Recipe output should use professional artifact headings, not Edit View question labels.
The model can compress, sequence, connect, and polish the writer's answers, but it cannot
add new facts, events, motives, relationships, stakes, causality, world rules, character
traits, or endings.

### Fact Sheet

Future implementation should keep the same server-side pattern established by Outline:

- build the Fact Sheet server-side from the submitted authored content and `meta.format`,
- drop empty fields,
- enumerate only the identity fields used for `sourceHash`,
- generate entity inventory from the server-side Fact Sheet,
- fence all answer text as untrusted source material,
- require every prose block to carry valid `sourceFieldIds`.

### Document View

Composed Document View should read like the professional document, not like a database
dump. Empty sections are omitted. Missing-context states name what is absent without
faking it.

The professional document body must not show:

- Edit View questions,
- schema paths,
- `sourceFieldIds`,
- fidelity internals,
- recipe keys,
- placeholder text,
- raw QA checklists unless a later PRD creates a diagnostics mode.

### Fidelity

All remaining surfaces inherit the Outline Slice 1 fidelity posture:

- deterministic provenance, coverage, entity diff, and injection echo checks first,
- honest labeling as structure-checked, not meaning-verified,
- entailment critic deferred until explicitly implemented,
- suspicious prompt-control echoes are flagged or fail the attempt, not silently cleaned.

## Surface Matrix

| Surface | Professional job | Default read | Primary risk |
| --- | --- | --- | --- |
| Synopsis | Let an outside reader understand the whole story quickly | Logline plus compact causal prose | Becoming marketing copy or hiding the ending |
| Treatment | Let a reader experience the full story before script pages | Present-tense cinematic prose with story movements | Becoming an outline, scriptment, or invented draft |
| Story Bible | Preserve the project's creative operating system | Organized pitch, tone, world, characters, engine, continuity | Becoming a long synopsis or hallucinated canon |

## Synopsis Composer Standard

### Professional Job

A synopsis is a compact, complete overview of the story. It orients an outside reader to
the protagonist, world, central conflict, stakes, major turns, climax, and ending without
requiring the script.

The synopsis is not a teaser, trailer, pitch-deck blurb, or mystery box. It reveals the
ending when known because the reader is evaluating the story as a complete dramatic
experience.

### Existing Edit View Intake

The current Synopsis story-coach deck is the right intake foundation. It already asks
plain-language questions for the material a synopsis needs.

Feature mode must collect:

- title, writer, genre, runtime, optional comps,
- one-sentence story,
- protagonist,
- visible goal,
- obstacle or pressure,
- stakes,
- hook or specificity,
- opening state,
- event or choice that forces the story forward,
- escalation and complications,
- biggest confrontation or turn,
- ending.

Series mode must collect:

- title, writer, genre, series type, episode length,
- one-sentence show promise,
- show overview with renewable pressure,
- pilot logline,
- complete pilot synopsis including ending,
- season one change,
- future-season direction when useful,
- sustaining characters,
- comps and why-now positioning.

The Composer should not require new Synopsis UI fields before the first Synopsis Composer
slice. If user testing shows a gap, add a plain-language question in a later product slice.

### Composer Needs

Feature core readiness should require enough material to identify:

- whose story it is,
- what they want or what pressure they face,
- what opposes them,
- what the cost is,
- how the story resolves or what ending is currently known.

Series core readiness should require enough material to identify:

- the show promise,
- the repeatable engine,
- the pilot promise,
- the season direction or series trajectory.

Important coverage fields:

- `logline.text`,
- `logline.protagonist`,
- `logline.goal`,
- `logline.obstacle`,
- `logline.stakes`,
- `logline.hook` (omittable; counts toward coverage when present),
- `prose.opening`,
- `prose.escalation`,
- `prose.middle`,
- `prose.climax`,
- `prose.resolution`,
- series equivalents: `series.showOverview`, `series.pilot.logline`,
  `series.pilot.prose`, `series.seasonOneArc`, `series.futureSeasons`,
  `series.characters`, `series.compsAndWhyThisShowNow`.

Missing-information policy:

- If the ending is missing, the artifact must say the ending is not yet answered in the
  missing-context state. It must not fabricate a resolution.
- If the obstacle or stakes are missing, compose a shorter orientation but do not inflate
  vague pressure into a false antagonist.
- If no protagonist or central show engine is present, Compose should hard-disable.

### Final Document View

Feature Synopsis Document View should render:

1. title and useful metadata,
2. logline as a lead line,
3. a compact synopsis body, usually three to five paragraphs,
4. optional missing-context note outside the professional body.

The prose should be present-tense, third-person, causal, and specific. It should name only
essential characters and make the "therefore / but" chain legible.

Series Synopsis Document View should render:

1. title and useful metadata,
2. series logline,
3. show overview,
4. pilot synopsis,
5. season one arc,
6. where it goes,
7. characters,
8. comps and why this show now.

Series output can use short sections rather than one continuous body because the buyer is
evaluating both the pilot and the show's renewability.

### Quality Rubric

A strong composed Synopsis:

- identifies the lead or ensemble early,
- makes the goal, pressure, and stakes readable,
- connects major turns causally,
- reveals the known ending,
- avoids unnecessary subplots and backstory,
- keeps tone aligned with the project,
- reads like an external-facing story summary, not a worksheet.

### Must Avoid

- hiding the ending to preserve suspense,
- writing poster copy or vague market language,
- turning into a scene-by-scene outline,
- overloading names and subplots,
- explaining internal emotion unsupported by visible choices,
- adding camera directions,
- adding unsupported theme claims, motives, or stakes.

## Treatment Composer Standard

### Professional Job

A treatment is the full story in readable cinematic prose before the script. It is longer
and more vivid than a synopsis, but less mechanically structured than an outline. Its job
is to let a producer, collaborator, reader, or AI specialist experience the dramatic flow,
tone, characters, major turns, climax, and ending.

Treatment is the bridge between structure and pages. It is not a beat sheet, screenplay,
scriptment, pitch blurb, or story bible.

### Existing Edit View Intake

The current Treatment surface is a usable intake foundation. It collects:

- logline,
- premise, tone, theme, emotional promise,
- main characters with wants, needs, flaws, secrets/contradictions, arcs, and
  relationship pressure,
- opening, act one, act two, and act three prose,
- optional custom story passages,
- visual and tonal language,
- open questions.

The first Treatment Composer should not expand Treatment's schema. Its job is to learn
how far the current authored material can go when composed well.

### Composer Needs

Core readiness should require:

- a story engine or premise (`logline` or `concept.premise`),
- at least one meaningful character or clearly named protagonist in the prose,
- enough story flow to compose more than a synopsis,
- a known ending or an explicit missing-ending state.

Important coverage fields:

- `logline`,
- `concept.premise`,
- `concept.tone`,
- `concept.theme`,
- `concept.emotionalPromise`,
- `mainCharacters[]`,
- `prose.opening`,
- `prose.actOne`,
- `prose.actTwo`,
- `prose.actThree`,
- `prose.customSections[]`,
- `visualAndTonal.overallTone`,
- `visualAndTonal.visualWorld`,
- `visualAndTonal.recurringImagesOrMotifs`,
- `visualAndTonal.musicOrSoundFeeling`,
- `visualAndTonal.pacing`,
- `visualAndTonal.genreRules`,
- `visualAndTonal.compsAndReferences`.

Open questions are not source material for invented answers. They can inform
missing-context messaging and, if a later PRD chooses, a development addendum. They should
not be quietly resolved by the Composer.

Missing-information policy:

- If a story movement is empty, omit it or compose around the answered movements with a
  missing-context state.
- If the ending is missing, do not supply one.
- If character wants or arcs are thin, keep character presentation brief and factual.
- If visual/tone fields are empty, keep the prose clean rather than adding atmosphere.

### Final Document View

Composed Treatment Document View should render:

1. title and metadata,
2. logline,
3. concept or overview,
4. main characters,
5. treatment prose organized into readable movements,
6. authored custom passages where they support the story flow,
7. visual and tonal language as a separate section when authored,
8. optional missing-context note outside the professional body.

The treatment body should use present-tense, third-person cinematic prose. Paragraphs
should be vivid but controlled, emphasizing visible action, choices, consequences,
images, turns, climax, and resolution.

For the first Treatment Composer, default Document View should keep open questions and AI
production implications out of the professional story body. They can be used for
diagnostics or future addenda, but they should not interrupt the reader's treatment read.

### Quality Rubric

A strong composed Treatment:

- makes the premise clear early,
- lets the reader understand who carries the story,
- tells the whole known story, including climax and ending when supplied,
- balances plot, character change, tone, and cinematic detail,
- turns authored story-flow answers into prose rather than bullets,
- keeps custom passages integrated without bloating the spine,
- leaves unresolved decisions unresolved instead of masking them.

### Must Avoid

- becoming a beat outline with prettier sentences,
- becoming screenplay pages or scriptment formatting,
- inventing dialogue, scenes, motivations, endings, or relationship changes,
- inserting camera directions,
- resolving open questions,
- mixing AI production notes into story prose,
- writing generic sensory atmosphere unsupported by the writer's texture answers.

## Story Bible Composer Standard

### Professional Job

A story bible is the project's source-of-truth reference system. It explains the creative
operating system of the project: premise, tone, world, rules, characters, story engine,
continuity, and future potential.

For series, it also proves the concept can sustain episodes and seasons. For features, it
preserves the project's identity, world logic, character rules, and future potential
without turning the bible into a long synopsis.

Story Bible is not a treatment, synopsis, lore dump, mood board, or prompt sheet.

### Existing Edit View Intake

The current Story Bible story-coach deck is the right intake foundation for a first
composer slice. It collects:

- cover identity,
- one-page pitch,
- tone and style,
- premise and world,
- character dossiers,
- feature propulsion or series engine,
- pilot, season, future, and renewal fields for series.

The Composer should not require locations, continuity logs, open questions, or AI
production annex fields until those are explicitly added by future Story Bible product
slices.

### Composer Needs

Core readiness should require:

- a project identity or logline,
- enough pitch material to explain what the project is,
- at least one of tone, world, character, or engine,
- format-specific engine material for Series mode before rendering series-specific
  sections.

Important coverage fields:

- `cover.title`,
- `cover.writer`,
- `cover.genre`,
- `cover.status`,
- `onePagePitch.logline`,
- `onePagePitch.inANutshell`,
- `onePagePitch.whyThisMatters`,
- `onePagePitch.corePromise`,
- `onePagePitch.centralQuestion`,
- `onePagePitch.whatMakesItDifferent`,
- `toneAndStyle.toneWords`,
- `toneAndStyle.comps`,
- `toneAndStyle.antiComps`,
- `toneAndStyle.dialogueStyle`,
- `toneAndStyle.visualStyle`,
- `toneAndStyle.soundOrMusicStyle`,
- `toneAndStyle.mustNeverFeelLike`,
- `toneAndStyle.pacingRules`,
- `toneAndStyle.humorRules`,
- `toneAndStyle.violenceOrIntensityRules`,
- `premiseAndWorld.premise`,
- `premiseAndWorld.worldRules`,
- `premiseAndWorld.publicHistory`,
- `premiseAndWorld.hiddenHistory`,
- `premiseAndWorld.mythologyReveals`,
- `characters[]`, including the canon-critical dossier fields `neverWriteThemAs`,
  `continuityFacts`, `behavioralAnchors`, and `speechPatterns`,
- `storyEngine.featurePropulsion`,
- `storyEngine.seriesEngine`,
- `storyEngine.pilotEngine`,
- `storyEngine.seasonArc`,
- `storyEngine.futureSeasonPotential`,
- `storyEngine.whatKeepsThePremiseAlive`,
- `episodeOrSequenceMap[]` when already populated.

Missing-information policy:

- If a section has no authored facts, omit it.
- If a character has only name and role, render only name and role.
- If world rules are thin, do not invent rules to make the bible feel complete.
- If Series engine fields are empty, do not imply repeatability.
- `cover.status` is metadata-only in V1 and must not change composer behavior, section
  visibility, or output density (per `story-bible-story-coach-redesign-prd.md`; pitch-vs-living
  density modes are deferred, see Open Question 4).

### Final Document View

Composed Story Bible Document View should render as an organized reference artifact:

1. cover and identity,
2. one-page pitch,
3. tone and style,
4. world,
5. characters,
6. story engine,
7. episode or sequence map only when authored,
8. optional missing-context note outside the professional body.

Story Bible output may use a mix of prose, tables, and concise reference entries. Unlike
Synopsis and Treatment, it does not need to become continuous prose. The professional
standard is clarity, retrievability, and canon protection.

Feature Story Bible should emphasize:

- feature premise and propulsion,
- character arcs,
- world/tone rules,
- sequel or franchise potential only when authored.

Series Story Bible should emphasize:

- repeatable engine,
- pilot pressure,
- season arc,
- future seasons,
- recurring character pressure,
- tone/world rules that preserve the show's identity.

### Quality Rubric

A strong composed Story Bible:

- lets another writer or agent understand the project without chat context,
- separates pitch, tone, world, characters, and engine,
- preserves canon exactly enough to prevent contradictions,
- makes world rules operational,
- makes character entries useful for future writing,
- makes series renewability legible when format is Series,
- omits empty/deferred sections cleanly.

### Must Avoid

- turning the bible into a long synopsis,
- inventing canon, world rules, character facts, histories, or continuity,
- flattening character dossiers into generic archetypes,
- mixing feature and series engine sections,
- rendering empty headings,
- crowding the core bible with AI production annex material before that product slice,
- treating comps, anti-comps, and tone words as marketing filler.

## Composed Block Implications

Outline Slice 1 can represent its artifact with headings, metadata, paragraphs, loglines,
and lead-in paragraphs. The remaining surfaces may eventually need additional block types:

- Synopsis reuses the existing block set.
- Treatment reuses the existing block set; `subheading` and `divider` already exist in
  `ComposedBlock` (see `document-composer-prd.md`), so Treatment needs no new block types.
- New block types are reserved for Story Bible, which may need list, key-value,
  character-entry, or table-like blocks to avoid forcing reference material into
  paragraphs.

Do not add those block types in this planning slice. The first implementation surface
should drive the smallest necessary extension.

## Recommended Implementation Sequence

### Next: Synopsis Composer

Synopsis should be the next composer implementation.

Why:

- It is the smallest remaining professional artifact.
- Its current data model and story-coach deck already collect the right inputs.
- It tests multi-surface composer expansion without the heavier block-shape needs of Story
  Bible.
- It will clarify whether the current `ComposedDocument` block model can stay simple for
  another surface.

Recommended Synopsis Composer slice:

- Expand compose request/types from `outline` only to `outline | synopsis`.
- Add Synopsis Fact Sheet builder for Feature and Series.
- Add Synopsis recipe and readiness tiers.
- Add composer prompt/rubric for compact causal prose.
- Add Synopsis Document View states mirroring Outline's Compose/Recompose behavior.
- Keep `sourceHash` / `recipeVersion` / `composerVersion` tracking with distinct
  answer-stale and recipe-stale states, plus provenance, coverage, entity diff, and
  injection checks, aligned with Outline.
- Add synthetic Synopsis fixtures. Do not commit external template files.

### Then: Treatment Composer

Treatment should follow after Synopsis because it uses the same prose-composition
discipline at longer length. Lessons from Synopsis should inform:

- how much prose the model can safely compose from structured answers,
- how to handle missing endings,
- how to preserve house voice across longer artifacts,
- whether the block schema needs richer sectioning.

### Later: Story Bible Composer

Story Bible should come after Synopsis and Treatment because it is structurally different:
it is a reference system, not only prose. It may need additional block types and a more
careful canon-preservation rubric.

Story Bible should not be implemented until the product decides whether first-pass output
will support list/table/reference-entry blocks.

## Acceptance Criteria For This Planning Slice

This planning slice is complete when:

- a repo-local standards PRD exists for Synopsis, Treatment, and Story Bible Composer,
- the PRD explicitly treats the skill-pack docs as research only,
- each surface has a professional job, intake needs, composer needs, final Document View
  target, rubric, and anti-patterns,
- the PRD recommends Synopsis Composer as the next implementation slice,
- no runtime code is changed.

## Open Questions

1. Should Synopsis Composer keep a one-page-ish target as a rubric only, or should the
   recipe enforce a max word range?
2. Should Treatment Composer include authored open questions as a final addendum, or keep
   them only in missing-context/diagnostic UI?
3. What is the minimal Story Bible block schema: lists only, key-value entries, tables, or
   a surface-specific renderer?
4. Should Story Bible eventually support pitch-bible vs living-canon density modes?
5. Should the entailment critic land before Treatment or Story Bible because those surfaces
   have more room for subtle unsupported claims?
