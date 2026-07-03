# WriterOS Writer Voice Profile PRD

**Date:** 2026-05-08
**Status:** Draft for implementation planning
**Branch context:** `feature/screenplay-editor-core`
**Related docs:** `docs/product/writeros-future-work-prd.md`, `docs/product/agent-workflow-prd.md`

## Summary

Writer Voice Profile is a writer-scoped, project-agnostic identity layer for WriterOS. It is generated through a guided first-run assessment, refined by the writer, saved as an editable profile, and used by the AI personas when helping with any project.

It is not project memory. It does not remember script content, scenes, transcripts, or story decisions. It remembers the writer: taste, influences, recurring themes, craft instincts, process needs, feedback preferences, and the kind of creative accountability that helps them do their best work.

The product thesis:

> More important than the stories you tell is the story of you.

WriterOS already helps agents understand the work through project context and script retrieval. Voice Profile helps agents understand the person doing the work.

## Current Codebase Fit

This feature is viable without a major refactor if implemented additively.

Current relevant facts:

- Project state is stored client-side in `client/src/lib/projectState.ts` under the `writeros_project_state` localStorage key.
- `ProjectState` is project-scoped and should not absorb writer identity.
- `AssessmentProfile` in `shared/schema.ts` is live prompt metadata, not dead code. It is currently shallow and hardcoded for `/api/wp-chat`.
- `/api/wp-chat` in `server/routes.ts` should remain a thin adapter over `OpenAIService.generatePersonaResponse`.
- Persona prompt construction lives in `server/ai/openaiService.ts`.
- Persona role definitions live in `shared/personas.ts`.
- Writing Partner and Writer's Room transcripts are intentionally separate and must remain separate.
- There is no settings/profile UI today.
- There is no backend storage plan today; localStorage is acceptable for this additive feature.

Key architectural decision:

- Do not extend `AssessmentProfile` into this feature.
- Do not nest Voice Profile inside `ProjectState`.
- Add a separate writer-scoped localStorage document and pass it into AI calls only when present.

## Problem

WriterOS can now package useful project context: title, synopsis, outline, Story Bible, script pages, scenes, speakers, selected text, and overview context. But the agents still know almost nothing about the writer unless the current project happens to reveal it.

That creates several product problems:

- A new writer begins with generic AI help.
- Alex, the Draft Coach, cannot coach the writer's actual process or blind spots.
- Maya can analyze dialogue on the page, but not against the writer's declared dialogue instincts.
- The Writing Partner can understand a project, but not the deeper creative identity behind multiple projects.
- Every new project starts from zero in terms of writer relationship.

WriterOS needs a gentle first-run way to learn the writer before it helps the work.

## Goals

- Make the first meaningful WriterOS experience a skippable writer assessment.
- Generate a human-readable, editable Writer Voice Profile from assessment answers.
- Store the profile outside project state so it applies across projects.
- Let the writer refine, edit, retake, skip, and export the profile.
- Let AI personas use profile sections relevant to their role.
- Preserve current app behavior when no profile exists.
- Avoid storage, transcript, and persona-system overhauls.

## Non-Goals

- No authentication or multi-user account system.
- No cloud database.
- No cross-project story memory.
- No vector database or embeddings.
- No Replit, Drizzle, Neon, Passport, or session scaffold.
- No mandatory onboarding wall; the assessment is skippable.
- No therapy, diagnosis, or mental-health profiling.
- No model-generated changes written into projects without explicit user action.
- No changes to transcript ownership or transcript separation.
- No requirement that every persona mention the profile in every response.

## Product Principles

1. **Assessment is a creative mirror, not a setup tax.**
   The UX should feel like WriterOS is learning how to help the writer, not forcing account setup.

2. **The profile belongs to the writer, not a project.**
   A writer may have many projects, but one slow-changing creative identity document.

3. **Taste is signal.**
   What a writer loves, envies, repeats, and returns to reveals values, instincts, voice, and blind spots.

4. **Depth should be optional.**
   The first-run assessment should be meaningful but not overwhelming. Deeper psychology belongs behind an optional "go deeper" step.

5. **Use the profile actively but sparingly.**
   Personas should cite or apply the profile when relevant, not turn every response into a profile lecture.

6. **Absent profile means zero regression.**
   If the writer skips the assessment, WriterOS should behave exactly as it does today.

## User Flow

### First-Run Gate

When WriterOS opens and there is no completed profile and no persisted skipped state, show a full-screen first-run assessment entry before the main studio.

Primary action:

- `Create my Writer Voice Profile`

Secondary action:

- `Skip for now`

Skipping should persist a skipped state so the user is not blocked or nagged every launch. The profile should remain accessible later from a profile/settings entry point.

The first-run copy should frame the benefit plainly:

- WriterOS can help the project better if it first understands the writer.
- The assessment is skippable.
- Without it, agents still work, but they will not have writer-specific voice or process context.

### Assessment

The writer answers a compact set of high-signal questions. Answers should autosave locally as a draft.

The assessment should not feel like a form about demographics or software preferences. It should feel like a creative interview.

### Synthesis

On submit, the answers are sent to an AI synthesis endpoint. The AI returns a structured first-draft Writer Voice Profile.

The profile should be written in clear markdown-like prose and organized into stable sections.

### Refinement

The writer answers a short refinement pass:

1. What felt accurate?
2. What felt wrong, generic, or overstated?
3. What important part of you did the profile miss?
4. How should WriterOS challenge or support you when the work drifts?

The AI uses those answers to produce a second-pass profile.

### Confirmation

The writer saves the profile and enters the main WriterOS studio.

### Later Access

The writer can later:

- read the profile
- edit the profile
- export it as markdown
- retake the assessment
- clear/reset it

## Assessment Question Set

V1 should use a lean assessment, not the old 31-question version.

### Core Questions

1. Name 3 to 5 writers, filmmakers, shows, books, scripts, or films that shaped you. What did each teach you?
2. Which writer or filmmaker feels closest to "home" for your taste, and why?
3. What scene, line, image, character intro, or reveal still haunts you?
4. What kind of story do you never get tired of?
5. What themes, moral questions, or emotional conflicts keep returning in your work?
6. What kind of character do you understand too well?
7. What kind of character feels false or dead on the page?
8. When a scene works, what is usually making it work?
9. What makes dialogue feel alive to you?
10. What makes dialogue feel lazy, fake, or dead?
11. How do you think visually on the page?
12. What tonal combination feels most like you?
13. When writing is going well, what is your process?
14. Where do you tend to get stuck or avoid the work?
15. What kind of feedback helps you, even when it stings?
16. What should an AI creative partner always do for you, and what should it never do?

### Optional Deep Dive

These prompts should be available after the core assessment or from the profile editor. They should not be required on first run.

1. What personal or moral question are you always circling?
2. What kind of flawed person do you secretly understand?
3. What type of scene scares you to write because it might reveal too much?
4. Whose creative success do you envy, and what does that reveal?
5. What do you hide behind when the writing gets hard?
6. What should Alex protect you from?
7. What should Alex never let you get away with?

## Voice Profile Document Shape

The generated profile should be readable by a human and structured enough for personas to consume selectively.

Working TypeScript shape:

```typescript
export interface VoiceProfileDocument {
  version: 1
  createdAt: string
  updatedAt: string
  displayName?: string
  archetype: string
  coreStatement: string
  creativeNorthStars: string[]
  storytellingDNA: {
    principles: string[]
    recurringThemes: string[]
    notes: string
  }
  influences: {
    writers: string[]
    directors: string[]
    filmsAndShows: string[]
    scenesAndLines: string[]
    notes: string
  }
  characterInstincts: {
    drawnTo: string[]
    rejects: string[]
    notes: string
  }
  dialogue: {
    rules: string[]
    instinctsByMode: string
    avoidances: string[]
  }
  visualLanguage: {
    instincts: string[]
    notes: string
  }
  process: {
    whenFlowing: string
    stuckPatterns: string[]
    supportNeeds: string[]
  }
  strengths: string[]
  growthEdges: string[]
  collaborationPreferences: {
    always: string[]
    never: string[]
    feedbackStyle: string
  }
  alexCoachingNotes: string[]
}
```

Storage wrapper:

```typescript
export interface VoiceProfileState {
  version: 1
  status: 'not_started' | 'skipped' | 'draft_answers' | 'draft_profile' | 'complete'
  skippedAt?: string
  answers: Record<string, string>
  deepDiveAnswers?: Record<string, string>
  refinementAnswers?: Record<string, string>
  profile?: VoiceProfileDocument
  createdAt?: string
  updatedAt: string
}
```

Markdown export should preserve the same sections in a stable order.

## Storage

Use a separate localStorage key:

```text
writeros_voice_profile_v1
```

This keeps the profile writer-scoped and project-agnostic.

Do not store it inside `ProjectState`. Do not increment `ProjectState` schema version for this feature unless a later implementation explicitly connects profile metadata to projects.

Suggested client modules:

```text
client/src/lib/voiceProfile.ts
client/src/lib/useVoiceProfile.ts
client/src/components/voice-profile/
```

Responsibilities:

- load profile state
- save profile state
- migrate profile state
- mark skipped
- save draft answers
- save generated profile
- export markdown

## AI Integration

### Synthesis Endpoint

Add a dedicated endpoint for profile synthesis rather than routing this through `/api/wp-chat`.

Suggested route:

```text
POST /api/voice-profile/synthesize
```

Request:

- core answers
- optional deep-dive answers
- optional existing draft profile
- optional refinement answers

Response:

- structured `VoiceProfileDocument`
- optional warnings if answers are too sparse

The route should be thin. Prompting and provider calls should live in `OpenAIService`, similar to existing AI helpers.

### Persona Injection

When a completed profile exists, the client should include it in AI chat requests:

```typescript
postWPChat({
  personaId,
  message,
  projectContext,
  voiceProfile,
  conversationHistory,
})
```

`server/routes.ts` should validate the optional profile and pass it through. It should not assemble profile prompt text.

`server/ai/openaiService.ts` should own:

```typescript
formatVoiceProfileForPersona(voiceProfile, personaId)
```

If no profile exists, the generated prompt should be identical in behavior to today's prompt.

### Prompt Behavior

Personas should be instructed to:

- use the profile when relevant
- cite or paraphrase it naturally when it helps
- challenge drift from the writer's declared creative identity
- avoid mentioning the profile when it would feel forced
- never invent profile details that are not present

Example behavior:

> Your profile says you like moral pressure under genre momentum. This scene has the pressure, but the genre engine has gone quiet.

## Per-Persona Consumption

| Persona | Profile sections consumed | Purpose |
| --- | --- | --- |
| Writing Partner | Core statement, archetype, creative north stars, storytelling DNA, process, collaboration preferences, compact influence notes | Acts as the relationship keeper and broad creative host. |
| Sam | Storytelling DNA, recurring themes, influences, creative north stars, collaboration preferences | Helps pitch-facing material preserve the writer's actual story values. |
| Casey | Core statement, recurring themes, character instincts, growth edges, relevant influence notes | Helps character psychology align with the writer's obsessions and emotional truth. |
| Oliver | Storytelling principles, process, strengths, growth edges, structure-related influence notes | Helps structure feedback fit how the writer builds and revises story. |
| Maya | Dialogue rules, dialogue instincts by mode, character instincts, scenes/lines influences, avoidances | Helps dialogue critique reflect the writer's voice standards, not generic dialogue advice. |
| Zoe | Visual language, tone/world influences, recurring themes, consistency preferences | Helps world and setting logic serve the writer's intended atmosphere and values. |
| Alex | Full compact profile, especially process, stuck patterns, support needs, growth edges, collaboration preferences, optional deep-dive answers | Coaches the writer, not just the project. Alex is the primary beneficiary of this feature. |

## UI Surfaces

### First-Run Assessment View

Recommended layout:

- focused, full-screen experience
- clear progress indicator
- autosave status
- `Skip for now` secondary action
- not a modal stacked on top of the studio

### Synthesis And Refinement View

Recommended layout:

- profile draft on the left or top
- refinement prompts below or beside it
- clear `Save profile` action
- clear `Revise profile` action after refinement

### Profile Editor

Recommended first version:

- readable document view
- structured edit fields by section
- export markdown action
- retake assessment action
- reset/clear profile action with confirmation

Raw markdown-only editing is not recommended for v1. It is expressive, but too easy to break the structure personas depend on.

## Implementation Phases

### Phase 0: PRD Approval

Goal: align on the product shape before code changes.

Tasks:

- Approve first-run assessment as skippable but primary.
- Approve the 16 core questions and optional deep-dive prompts.
- Approve writer-scoped localStorage outside `ProjectState`.
- Approve persona consumption table.

### Phase 1: Local Profile State And First-Run Gate

Goal: introduce the writer-scoped profile container without touching AI behavior.

Tasks:

- Add shared profile types.
- Add localStorage load/save/migration helpers.
- Add `useVoiceProfile`.
- Add first-run gate with start/skip behavior.
- Add draft answer autosave.

Success criteria:

- New users see the assessment entry first.
- Existing users can skip and continue to the current app.
- No project data or transcripts are modified.

### Phase 2: Assessment, Synthesis, Refinement, Save

Goal: complete the profile creation loop.

Tasks:

- Build assessment UI.
- Add profile synthesis route.
- Add `OpenAIService.generateVoiceProfileDraft`.
- Add refinement UI and second-pass synthesis.
- Save completed profile.
- Add markdown export.

Success criteria:

- A writer can answer the assessment, receive a profile, refine it, and save it.
- The saved profile survives reload.
- Exported markdown is readable and stable.

### Phase 3: Persona Consumption

Goal: let agents use the profile without changing behavior for users who skipped.

Tasks:

- Add optional `voiceProfile` to `/api/wp-chat` request body.
- Keep `/api/wp-chat` thin.
- Add profile formatting in `openaiService.ts`.
- Inject persona-specific profile excerpts.
- Add tests proving absent profile produces no profile block.
- Add tests proving Alex and Writing Partner receive the intended profile sections.

Success criteria:

- Alex references profile-relevant process context when useful.
- Writing Partner can connect project advice to the writer's stated creative identity.
- Specialists consume only relevant sections.
- No profile means existing responses still work.

### Phase 4: Polish And Manual QA

Goal: make the feature feel like part of WriterOS, not a bolt-on form.

Tasks:

- Tune first-run copy.
- Tune synthesis prompt.
- Verify skip/retry/edit/export flows.
- Manual QA with an empty project and an existing project.
- Verify Writing Partner and Writer's Room transcripts remain separate.

## Files Likely Touched

Shared types:

- `shared/voiceProfile.ts` or `shared/schema.ts`

Client state:

- `client/src/lib/voiceProfile.ts`
- `client/src/lib/useVoiceProfile.ts`
- `client/src/App.tsx`

Client UI:

- `client/src/components/voice-profile/VoiceProfileGate.tsx`
- `client/src/components/voice-profile/VoiceProfileAssessment.tsx`
- `client/src/components/voice-profile/VoiceProfileReview.tsx`
- `client/src/components/voice-profile/VoiceProfileEditor.tsx`

Routing and AI:

- `server/routes.ts`
- `server/ai/openaiService.ts`

Tests:

- `tests/lib/voiceProfile.test.ts`
- `tests/server/openaiService.test.ts`
- UI tests for first-run skip/save behavior if the existing test setup supports it cleanly.

## Risks

### AssessmentProfile Confusion

`AssessmentProfile` is live but shallow. It should not be extended into Voice Profile. It can coexist until a later cleanup.

### Profile Over-Injection

If every persona receives the entire profile, prompts will become bloated and responses may become self-conscious. Use persona-specific sections.

### First-Run Friction

If the assessment feels mandatory or bureaucratic, writers will skip. Copy and pacing matter.

### Storage Expectations

localStorage is acceptable for v1, but it is not a long-term account memory system. The profile should be easy to export so writers can keep their artifact.

### Generic Synthesis

The synthesis prompt must avoid vague praise. It should name concrete patterns from the answers and produce usable working preferences for agents.

### Privacy And Trust

The profile may contain personal creative psychology. Keep it local in v1. Do not imply cloud sync or sharing.

## Verification

Because implementation is additive, tests should prove both presence and absence:

- Profile absent: current app and AI calls still work.
- Profile skipped: current app and AI calls still work.
- Draft answers persist through reload.
- Completed profile persists through reload.
- Markdown export contains stable sections.
- `/api/wp-chat` remains a thin adapter.
- `OpenAIService` injects only persona-relevant profile sections.
- Writing Partner and Writer's Room transcripts remain separate.

After meaningful implementation changes, run:

```text
npm run test:run
npm run check
npm run build
```

## Success Criteria

- A new user sees the Writer Voice Profile assessment before the studio, with an obvious skip option.
- Completing the assessment produces a profile that feels like a useful mirror of the writer.
- The writer can refine, save, edit, retake, clear, and export the profile.
- The profile is available across projects without living inside project state.
- Alex can use the profile to coach the writer's actual process and blind spots.
- Writing Partner can use the profile to connect project advice to the writer's creative identity.
- Specialists use only the parts of the profile relevant to their jobs.
- Users who skip the feature experience no regression.

## Open Questions

1. Should the profile entry point live in the top bar, a settings menu, or a small writer badge?
2. Should the first-run gate appear again after a skip, or only remain accessible manually?
3. Should `displayName` be part of the profile assessment or left for later?
4. Should deep-dive answers be injected only into Alex, or also into Writing Partner when highly relevant?
5. Should profile export be markdown-only in v1, or include JSON export for backup/import?
