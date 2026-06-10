import type { FactSheet, Recipe } from '../../shared/compose/types'
import { getPromptContract } from './promptContracts'

// Encode angle brackets so fence delimiters embedded in authored answers
// (e.g. a literal </source_facts>) cannot terminate or reopen the fenced block.
// Text is preserved verbatim, only the < and > characters are entity-encoded.
function fenceSafe(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function buildComposePrompt(factSheet: FactSheet, recipe: Recipe): { system: string; user: string } {
  const system = getPromptContract(recipe.surface).buildSystem(recipe)

  const facts = factSheet.fields.map(f => `  - id=${f.id} | ${fenceSafe(f.label)}: ${fenceSafe(f.value)}`).join('\n')
  const user = `Project format: ${factSheet.format}\n<source_facts>\n${facts}\n</source_facts>`

  return { system, user }
}
