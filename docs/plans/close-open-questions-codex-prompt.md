Review the plan at docs/plans/close-open-questions-plan.md against this repository. Read-only: do not change code. Report findings as numbered items with severity (blocking / should-fix / nit), the file and line concerned, and what would go wrong if built as written.

Background you can trust: docs/plans/import-supersession-plan.md was built and merged (commits 4b4e49b, 950c457, bd528ae, 512147a, 330eec7). Read its "v1 review findings" table so you do not re-raise what is already handled.

Verify yourself:

1. server/projectMemory/store.ts validateSupersessionTargets and its three callers (createPublicationEvent, derivePromotionMutation, the 'published' replay branch). Confirm the plan's claim that one edit covers publish, promotion and replay, and look for any other place that assumes a record's supersedes list only names records of its own kind (projections.ts, whatsStandingReport.ts, annotationStore.ts, roomBridge.ts, agentContext.ts, retrieval.ts).
2. server/projectMemory/adapters/wayfinder.ts: what a ticket in tickets/ emits versus the same ticket in resolved/, including scoped-out and homework tickets. Confirm basename is the only cross-directory identity available, and say whether the adapter's handling of `assets/` or legacy atoms could produce a `tickets/<name>` sourceId that is not a ticket.
3. server/projectMemory/cli.ts runImport and runReconcileStale as merged. Assess the ordering the plan proposes (version groups, then question closures against the advanced snapshot) and the double id churn when an answer is both collapsed and republished to close questions in one apply. Say if a single publication per answer that does both is possible and safer.
4. server/projectMemory/projections.ts and the review projection: what happens to a closed question's row and to any open conflict that references it.

Questions I want answered explicitly:

- Is admitting open_question targets for canon/development winners (plan D1) the narrowest rule that solves this, and does it weaken canon-explicit-only anywhere? Give the failure case if you reject it.
- The plan keeps closure explicit (caller-supplied ids) and puts the basename lookup in the CLI. Is there a case where the CLI links the wrong question (renamed ticket, two tickets with the same basename in different states, a ticket that was split)?
- Should scoped-out resolutions close their question (plan Q1)? If yes, propose the smallest adapter change.
- What is missing from the test lists that would let a regression through, especially around reopen (resolved/<name> back to tickets/<name>) and the interaction with supersedesPriorVersions?

Do not propose a new ledger action or event type unless you can show the maintenance-publication path cannot express the cleanup; the previous review established that preference.
