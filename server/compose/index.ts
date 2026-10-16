import { COMPOSED_SCHEMA_VERSION, COMPOSER_VERSION } from '../../shared/compose/types'
import type { ComposedBlock, ComposedDocument, ComposedRun, FactSheet, FidelityWarning, Recipe } from '../../shared/compose/types'
import { buildEntityInventory } from './entityInventory'
import { runFidelityCheck } from './runFidelityCheck'
import { renderWhatsStandingBlocks } from './whatsStandingRenderer'
import { buildWhatsStandingFactSheet } from '../../shared/compose/whatsStandingFactSheet'
import { getWhatsStandingRecipe } from '../../shared/compose/whatsStandingRecipe'
import { computeWhatsStandingSourceHash } from '../../shared/compose/whatsStandingSourceHash'
import { unresolvedReferences } from '../../shared/compose/whatsStandingReadiness'
import type { ProjectMemorySnapshot } from '../../shared/projectMemory'
import type { AnnotationLogState } from '../../shared/projectMemoryAnnotations'

export type ComposeResult =
  | { ok: true; composed: ComposedDocument }
  | { ok: false; reason: string }

// ── Deterministic composition ────────────────────────────────────────────────
//
// The pipeline above is prompt → model → fidelity. A report has no authored prose: its
// content is records the writer already wrote, arranged. Running it through a model would
// add an invention risk for no gain, so the blocks are built by a renderer and the shared
// fidelity checks run over the result exactly as they do over model output.

/** Builds blocks from source. Must be pure — the same input always yields the same blocks. */
export type DeterministicRenderer = () => ComposedBlock[]

export interface ComposeDeterministicArgs {
  factSheet: FactSheet
  recipe: Recipe
  sourceHash: string
  renderer: DeterministicRenderer
  run: ComposedRun
  /**
   * Readiness warnings computed by the profile, outside the fidelity scan — e.g. an
   * unresolved reference. Any entry here marks the document non-clean.
   */
  extraWarnings?: FidelityWarning[]
}

export function composeDeterministic(args: ComposeDeterministicArgs): ComposeResult {
  const blocks = args.renderer()
  const inventory = buildEntityInventory(args.factSheet)
  const fidelity = runFidelityCheck(blocks, args.factSheet, args.recipe, inventory)

  // Two warning kinds check for model misbehaviour and cannot apply here.
  //
  // `injection_echo` asks whether the model repeated prompt-control phrasing back at us;
  // with no model, a match would only mean the writer's own record contains such a phrase,
  // which is not a fidelity problem and would be a confusing thing to flag.
  //
  // `entity_diff` asks whether the model introduced a name or number absent from the source;
  // blocks here quote the source verbatim, so any match is an artefact of the scanner rather
  // than a fabrication.
  //
  // This is filtered explicitly rather than left to chance: if a future renderer starts
  // paraphrasing, these checks must be reinstated deliberately.
  const applicable = [
    ...fidelity.warnings.filter(w => w.kind !== 'injection_echo' && w.kind !== 'entity_diff'),
    ...(args.extraWarnings ?? []),
  ]

  const composed: ComposedDocument = {
    schemaVersion: COMPOSED_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    model: null,
    recipeVersion: args.recipe.recipeVersion,
    composerVersion: COMPOSER_VERSION,
    sourceHash: args.sourceHash,
    format: args.recipe.format,
    blocks,
    fidelity: { status: applicable.length > 0 ? 'flagged' : 'clean', warnings: applicable },
    run: args.run,
  }
  return { ok: true, composed }
}

export interface ComposeWhatsStandingArgs {
  snapshot: ProjectMemorySnapshot
  runId: string
  /** Writer-approved reference resolutions; absent means none have been made yet. */
  annotations?: AnnotationLogState
}

export function composeWhatsStanding(args: ComposeWhatsStandingArgs): ComposeResult {
  const { snapshot, annotations } = args
  // Readiness is the design's central safety promise: a reference nobody has resolved must
  // mark the whole report incomplete, loudly, not render as a clean document. Each entry
  // names the settle action so the report never offers a second settlement path.
  const unresolved = unresolvedReferences(snapshot, annotations).map((item): FidelityWarning => ({
    kind: 'unresolved_reference',
    message: item.state === 'stale'
      ? `Resolution no longer holds for ${item.recordId}: the wording of ${item.changedRecordId} changed `
        + `since “${item.phrase}” was resolved. Reopen it with the invalidate command (question ${item.annotationId}).`
      : `Unresolved reference in ${item.recordId} (${item.state}): “${item.phrase}”. `
        + `Settle it with the questions/answer commands (question ${item.annotationId}).`,
    fieldId: item.recordId,
    referenceState: item.state,
  }))
  return composeDeterministic({
    factSheet: buildWhatsStandingFactSheet(snapshot, annotations),
    recipe: getWhatsStandingRecipe(snapshot),
    sourceHash: computeWhatsStandingSourceHash(snapshot, annotations),
    renderer: () => renderWhatsStandingBlocks(snapshot, annotations),
    extraWarnings: unresolved,
    run: {
      runId: args.runId,
      snapshotRevision: snapshot.revision,
      ...(annotations !== undefined ? { annotationRevision: annotations.revision } : {}),
    },
  })
}
