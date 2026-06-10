import type { ModelProvider } from '../ai/modelProvider'
import { createModelProvider } from '../ai/modelProvider'
import { buildOutlineFactSheet } from '../../shared/compose/factSheet'
import { getOutlineRecipe } from '../../shared/compose/recipe'
import { computeOutlineSourceHash } from '../../shared/compose/sourceHash'
import { buildSynopsisFactSheet } from '../../shared/compose/synopsisFactSheet'
import { getSynopsisRecipe } from '../../shared/compose/synopsisRecipe'
import { computeSynopsisSourceHash } from '../../shared/compose/synopsisSourceHash'
import { COMPOSED_SCHEMA_VERSION, COMPOSER_VERSION } from '../../shared/compose/types'
import type { ComposeIdentity, ComposedDocument, FactSheet, Recipe } from '../../shared/compose/types'
import type { OutlineDocumentContent, SynopsisDocumentContent } from '../../shared/documents'
import { buildComposePrompt } from './buildComposePrompt'
import { callComposeModel } from './composeDocument'
import { buildEntityInventory } from './entityInventory'
import { runFidelityCheck, hasSevereInjection } from './runFidelityCheck'

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
): Promise<ComposeResult> {
  const inventory = buildEntityInventory(factSheet)
  const { system, user } = buildComposePrompt(factSheet, recipe)

  const model = await callComposeModel(provider, system, user)
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
}
export type ComposeOutlineResult = ComposeResult

export async function composeOutline(args: ComposeOutlineArgs): Promise<ComposeOutlineResult> {
  const provider = args.provider ?? createModelProvider()
  const factSheet = buildOutlineFactSheet(args.content, args.format)
  const recipe = getOutlineRecipe(args.format)
  const sourceHash = computeOutlineSourceHash(args.content, args.format, args.identity)
  return composeFromRecipe(provider, factSheet, recipe, args.format, sourceHash)
}

export interface ComposeSynopsisArgs {
  content: SynopsisDocumentContent
  format: 'feature' | 'series'
  identity: ComposeIdentity
  provider?: ModelProvider
}

export async function composeSynopsis(args: ComposeSynopsisArgs): Promise<ComposeResult> {
  const provider = args.provider ?? createModelProvider()
  const factSheet = buildSynopsisFactSheet(args.content, args.format)
  const recipe = getSynopsisRecipe(args.format)
  const sourceHash = computeSynopsisSourceHash(args.content, args.format, args.identity)
  return composeFromRecipe(provider, factSheet, recipe, args.format, sourceHash)
}
