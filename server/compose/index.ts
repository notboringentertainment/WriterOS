import type { ModelProvider } from '../ai/modelProvider'
import { createModelProvider } from '../ai/modelProvider'
import { buildOutlineFactSheet } from '../../shared/compose/factSheet'
import { getOutlineRecipe } from '../../shared/compose/recipe'
import { computeOutlineSourceHash } from '../../shared/compose/sourceHash'
import { buildSynopsisFactSheet } from '../../shared/compose/synopsisFactSheet'
import { getSynopsisRecipe } from '../../shared/compose/synopsisRecipe'
import { computeSynopsisSourceHash } from '../../shared/compose/synopsisSourceHash'
import { buildTreatmentFactSheet } from '../../shared/compose/treatmentFactSheet'
import { getTreatmentRecipe } from '../../shared/compose/treatmentRecipe'
import { computeTreatmentSourceHash } from '../../shared/compose/treatmentSourceHash'
import { COMPOSED_SCHEMA_VERSION, COMPOSER_VERSION } from '../../shared/compose/types'
import type { ComposedBlock, ComposeIdentity, ComposedDocument, ComposedRun, FactSheet, Recipe } from '../../shared/compose/types'
import type { OutlineDocumentContent, SynopsisDocumentContent, TreatmentDocumentContent } from '../../shared/documents'
import { buildComposePrompt } from './buildComposePrompt'
import { callComposeModel, MAX_TOKENS_BY_SURFACE } from './composeDocument'
import { buildEntityInventory } from './entityInventory'
import { runFidelityCheck, hasSevereInjection } from './runFidelityCheck'
import { renderWhatsStandingBlocks } from './whatsStandingRenderer'
import { buildWhatsStandingFactSheet } from '../../shared/compose/whatsStandingFactSheet'
import { getWhatsStandingRecipe } from '../../shared/compose/whatsStandingRecipe'
import { computeWhatsStandingSourceHash } from '../../shared/compose/whatsStandingSourceHash'
import type { ProjectMemorySnapshot } from '../../shared/projectMemory'

export type ComposeResult =
  | { ok: true; composed: ComposedDocument }
  | { ok: false; reason: string }

// Shared compose pipeline. The fact sheet, recipe, and source hash are surface-specific
// (built by the caller); everything from prompt → model → fidelity is shared.
async function composeFromRecipe(
  provider: ModelProvider,
  factSheet: FactSheet,
  recipe: Recipe,
  format: 'feature' | 'series',
  sourceHash: string,
  projectMemoryPrompt = '',
): Promise<ComposeResult> {
  const inventory = buildEntityInventory(factSheet)
  const { system, user } = buildComposePrompt(factSheet, recipe, projectMemoryPrompt)

  const model = await callComposeModel(provider, system, user, MAX_TOKENS_BY_SURFACE[recipe.surface])
  if (!model.ok) return { ok: false, reason: model.reason }
  if (hasSevereInjection(model.blocks)) return { ok: false, reason: 'severe injection echo' }

  const fidelity = runFidelityCheck(model.blocks, factSheet, recipe, inventory)
  const composed: ComposedDocument = {
    schemaVersion: COMPOSED_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    model: provider.model,
    recipeVersion: recipe.recipeVersion,
    composerVersion: COMPOSER_VERSION,
    sourceHash,
    format,
    blocks: model.blocks,
    fidelity,
  }
  return { ok: true, composed }
}

export interface ComposeOutlineArgs {
  content: OutlineDocumentContent
  format: 'feature' | 'series'
  identity: ComposeIdentity
  provider?: ModelProvider
  projectMemoryPrompt?: string
}
export type ComposeOutlineResult = ComposeResult

export async function composeOutline(args: ComposeOutlineArgs): Promise<ComposeOutlineResult> {
  const provider = args.provider ?? createModelProvider()
  const factSheet = buildOutlineFactSheet(args.content, args.format)
  const recipe = getOutlineRecipe(args.format)
  const sourceHash = computeOutlineSourceHash(args.content, args.format, args.identity)
  return composeFromRecipe(provider, factSheet, recipe, args.format, sourceHash, args.projectMemoryPrompt)
}

export interface ComposeSynopsisArgs {
  content: SynopsisDocumentContent
  format: 'feature' | 'series'
  identity: ComposeIdentity
  provider?: ModelProvider
  projectMemoryPrompt?: string
}

export async function composeSynopsis(args: ComposeSynopsisArgs): Promise<ComposeResult> {
  const provider = args.provider ?? createModelProvider()
  const factSheet = buildSynopsisFactSheet(args.content, args.format)
  const recipe = getSynopsisRecipe(args.format)
  const sourceHash = computeSynopsisSourceHash(args.content, args.format, args.identity)
  return composeFromRecipe(provider, factSheet, recipe, args.format, sourceHash, args.projectMemoryPrompt)
}

export interface ComposeTreatmentArgs {
  content: TreatmentDocumentContent
  format: 'feature' | 'series'
  identity: ComposeIdentity
  provider?: ModelProvider
  projectMemoryPrompt?: string
}

export async function composeTreatment(args: ComposeTreatmentArgs): Promise<ComposeResult> {
  const provider = args.provider ?? createModelProvider()
  const factSheet = buildTreatmentFactSheet(args.content, args.format)
  const recipe = getTreatmentRecipe(args.format)
  const sourceHash = computeTreatmentSourceHash(args.content, args.format, args.identity)
  return composeFromRecipe(provider, factSheet, recipe, args.format, sourceHash, args.projectMemoryPrompt)
}

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
  const applicable = fidelity.warnings.filter(w => w.kind !== 'injection_echo' && w.kind !== 'entity_diff')

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
}

export function composeWhatsStanding(args: ComposeWhatsStandingArgs): ComposeResult {
  const { snapshot } = args
  return composeDeterministic({
    factSheet: buildWhatsStandingFactSheet(snapshot),
    recipe: getWhatsStandingRecipe(snapshot),
    sourceHash: computeWhatsStandingSourceHash(snapshot),
    renderer: () => renderWhatsStandingBlocks(snapshot),
    run: { runId: args.runId, snapshotRevision: snapshot.revision },
  })
}
