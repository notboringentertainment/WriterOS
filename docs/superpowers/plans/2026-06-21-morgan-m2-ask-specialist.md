# Morgan M2 - Ask Specialist TDD Plan

> Status: drafted only. No M2 implementation has started.

## Milestone And PR

- Milestone: **Morgan M2 - Ask Specialist**
- Pull request: **not created yet**
- Expected future PR: the next PR opened for this M2 work; GitHub will assign the number
- Prior milestone: **Morgan M1 - Runtime Foundation**
- Prior PR: **PR #44**, already merged

## Plain Meaning

Morgan M2 is the next milestone after Morgan M1.

It means: Morgan can ask exactly one existing WriterOS specialist per tool call, then synthesize that specialist's read back to the writer.

Allowed specialists:
- Sam
- Casey
- Oliver
- Maya
- Zoe
- Alex

Not included:
- Morgan calling herself
- unknown specialist names
- parallel multi-specialist orchestration
- draft edits
- live web lookup
- UI redesign
- receipt UI
- `/swarm` reconciliation, unless the code forces it
- streaming changes, unless tests expose a real need

## Why This Is The Next Slice

M1 shipped the Claude-native Morgan tool loop with two tools:
- `readProjectContext`
- `respond_to_writer`

Morgan currently says she cannot call specialists directly. That is correct today.

The shipped reach contract treats the six specialists as one room capability:
- Morgan can recommend which specialist to visit.
- Morgan cannot yet call specialists directly to get their actual read.

So a Zoe-only implementation would be wrong. The smallest coherent M2 is all six named specialists, one at a time.

## M2 Task List

Use these task names when discussing the work before GitHub assigns a PR number.

- **M2 Task 0 - Baseline:** confirm clean `main`, M1 merged, M2 not started.
- **M2 Task 1 - Specialist Registry:** define one shared source of truth for the six callable specialist IDs.
- **M2 Task 2 - Async DI:** make Morgan tool dispatch async and inject tool dependencies into `runMorgan`.
- **M2 Task 3 - Ask Specialist Tool:** add the `askSpecialist` tool schema and dispatcher case.
- **M2 Task 4 - Specialist Caller:** wire the injected caller from `OpenAIService.generatePersonaResponse` using the existing specialist persona path.
- **M2 Task 5 - Synthesis Contract:** make Morgan synthesize the specialist read instead of passing it through raw.
- **M2 Task 6 - Reach Contract Flip:** move direct specialist calls from `cannotDoYet` to `canDoNow`, while keeping web, edits, and parallel orchestration as limits.
- **M2 Task 7 - Test Gates:** prove the slice with focused tests plus full repo gates.
- **M2 Hold - CodeRabbit:** after PR review starts, hold for CodeRabbit review before merge.

## Implementation Shape

### M2 Task 1 - Specialist Registry

Create one shared list for callable specialists:

```ts
['sam', 'casey', 'oliver', 'maya', 'zoe', 'alex']
```

The `askSpecialist` tool enum and reach contract must use this same list.

`writingPartner` must not be in the callable list.

### M2 Task 2 - Async DI

Change:

```ts
dispatchTool(use, ctx): DispatchOutcome
```

to:

```ts
dispatchTool(use, ctx): Promise<DispatchOutcome>
```

Thread injected deps through:

```ts
RunMorganInput -> runMorgan -> dispatchTool
```

The dependency shape should be runtime-owned and provider-agnostic, roughly:

```ts
callSpecialist(input: {
  specialistId: SpecialistId
  question: string
}): Promise<{ message: string }>
```

### M2 Task 3 - Ask Specialist Tool

Add a Morgan tool:

```ts
askSpecialist({
  specialistId: 'sam' | 'casey' | 'oliver' | 'maya' | 'zoe' | 'alex',
  question: string
})
```

Behavior:
- valid specialist plus non-empty question -> call injected dependency
- `writingPartner` -> error outcome
- unknown id -> error outcome
- blank question -> error outcome

### M2 Task 4 - Specialist Caller

In the Morgan branch of `OpenAIService.generatePersonaResponse`, build the dependency as a closure.

Plain shape:

```ts
callSpecialist(id, question) ->
  generatePersonaResponse(PERSONAS[id], question, userProfile, storyMemory, [], voiceProfile)
```

Important:
- specialists stay on the existing single-shot persona path
- `runMorgan` does not import `PERSONAS`
- `runMorgan` does not learn app-level persona types
- `/api/wp-chat` stays a thin adapter

### M2 Task 5 - Synthesis Contract

`askSpecialist` returns only the specialist's `message` as tool result content.

Morgan must then call `respond_to_writer` with her synthesized answer.

She should attribute the consult in plain language, for example:

```text
I asked Zoe. Her read is...
```

Specialist suggestions do not pass through directly. Morgan still owns the final `suggestions` array.

### M2 Task 6 - Reach Contract Flip

When and only when `askSpecialist` is live:
- move specialist calls into `canDoNow`
- remove the old "coming soon" specialist-call line from `cannotDoYet`

Keep these limits:
- cannot edit or rewrite drafts
- cannot look things up on the live web
- cannot run parallel multi-specialist orchestration yet

## Tests

### M2 Task 2 Tests

- Existing `dispatchTool` tests are updated to `await`.
- A full-loop test injects a stub async tool dependency and proves `runMorgan` waits for it.
- Multi-tool history batching still produces one assistant turn plus one combined tool-results turn.

### M2 Task 3 Tests

- Valid specialist id calls the injected dependency.
- Tool result includes the specialist message.
- `writingPartner` is rejected.
- unknown id is rejected.
- blank question is rejected.

### M2 Task 4 Tests

- Morgan branch wires `callSpecialist` using the existing persona service path.
- Specialist call uses the same `userProfile`, `storyMemory`, and `voiceProfile`.
- Specialist conversation history is empty for this first slice.

### M2 Task 5 Tests

- Morgan final response synthesizes the specialist read instead of raw pass-through.
- Final response still uses `respond_to_writer`.
- Final suggestions remain normalized to 0-3 non-empty strings.

### M2 Task 6 Tests

- Reach contract lists specialist consults in `canDoNow`.
- Reach contract no longer lists specialist calls as coming soon.
- Reach contract still says no live web, no draft edits, no parallel room orchestration.
- Tool enum equals the shared six-specialist registry.

### M2 Task 7 - Test Gates

Run:

```bash
npm run check
npm run test:run
npm run build
```

## Done Means

- Morgan can call Sam, Casey, Oliver, Maya, Zoe, or Alex one at a time.
- Morgan cannot call herself.
- Morgan cannot call unknown specialists.
- Morgan synthesizes the answer.
- Reach contract is truthful after the tool ships.
- No UI changes.
- No `/swarm` work unless proven necessary.
- No merge until Ben explicitly says merge.
