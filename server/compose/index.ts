import type { ModelProvider } from '../ai/modelProvider'
import { createModelProvider } from '../ai/modelProvider'
import { buildOutlineFactSheet } from '../../shared/compose/factSheet'
import { getOutlineRecipe } from '../../shared/compose/recipe'
import { computeOutlineSourceHash } from '../../shared/compose/sourceHash'
import { COMPOSED_SCHEMA_VERSION, COMPOSER_VERSION } from '../../shared/compose/types'
import type { ComposeIdentity, ComposedDocument } from '../../shared/compose/types'
import type { OutlineDocumentContent } from '../../shared/documents'
import { buildComposePrompt } from './buildComposePrompt'
import { callComposeModel } from './composeDocument'
import { buildEntityInventory } from './entityInventory'
import { runFidelityCheck, hasSevereInjection } from './runFidelityCheck'

export interface ComposeOutlineArgs {
  content: OutlineDocumentContent
  format: 'feature' | 'series'
  identity: ComposeIdentity
  provider?: ModelProvider
}
export type ComposeOutlineResult =
  | { ok: true; composed: ComposedDocument }
  | { ok: false; reason: string }

export async function composeOutline(args: ComposeOutlineArgs): Promise<ComposeOutlineResult> {
  const provider = args.provider ?? createModelProvider()
  const factSheet = buildOutlineFactSheet(args.content, args.format)
  const recipe = getOutlineRecipe(args.format)
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
    sourceHash: computeOutlineSourceHash(args.content, args.format, args.identity),
    format: args.format,
    blocks: model.blocks,
    fidelity,
  }
  return { ok: true, composed }
}
