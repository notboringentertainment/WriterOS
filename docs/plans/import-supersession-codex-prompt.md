Review the plan at docs/plans/import-supersession-plan.md against this repository. Read-only: do not change code. Report findings as numbered items, each with severity (blocking / should-fix / nit), the file and line it concerns, and what would go wrong if the plan is built as written.

Context you should verify yourself, not take from the plan:

1. server/projectMemory/store.ts: createPublicationEvent, validateSupersessionTargets, publicationStatus, the 'published' replay branch, derivePromotionMutation, and the applyAction switch. Confirm the plan's claim that explicit supersedes only takes effect when the new record lands active, and that a candidate cannot retire active canon through this path.
2. server/projectMemory/cli.ts runImport: the publish loop, the reconcilePublication failure path, the wayfinder authority check, and the ImportPreviewSchema. Confirm that adding supersedes to preview records before publish survives schema parsing and the reconcile path.
3. server/projectMemory/adapters/{wayfinder,pitchStudio,buzz}.ts: confirm each emits at most one record per (kind, workflow, sourceId) per run, so same-anchor supersession cannot retire a sibling record from the same import.
4. server/projectMemory/roomBridge.ts priorActiveRoomRecord and retireRoomMirror: the precedent the plan copies. Say if the CLI should share that helper.
5. shared/projectMemory.ts: ProjectMemoryActionSchema and ProjectMemoryEventSchema. Assess the new 'supersede' action / 'superseded' event: replay safety for existing ledgers, projections, and exposure through POST /actions in routes.ts.
6. server/projectMemory/retrieval.ts assertCanonContextFits: it measures max(JSON, markdown). Say whether you can find a reason the JSON size must be capped, or whether Step 4 option D4b (measure markdown only) is safe.

Questions I want answered explicitly:

- Is computing supersession in the CLI (plan D1) the right layer, or should the store do it automatically for imported workflows the way it does for document facts? Give the failure case for whichever you reject.
- Does the plan violate the canon-explicit-only ruling (nothing becomes or stops being canon without the writer's explicit act)? The plan argues an amended ticket superseding its own earlier version is the writer's act. Push back if that argument is wrong.
- Is the one-time cleanup (Steps 2 and 3) proportionate, or is there an existing ledger path that retires an active record without adding a stub record that I missed?
- What is missing from the test list that would let a regression through?

Do not propose raising the cap as the fix; the plan already rejects that as the primary remedy and asks a separate question about it in Step 4.
