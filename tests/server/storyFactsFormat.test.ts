import { readFile } from 'node:fs/promises'
import { expect, it } from 'vitest'
import { PROPOSE_INPUT_SCHEMA, PROPOSE_DESCRIPTION } from '../../mod/writeros-morgan/hooks/proposeTool'

it('offers bible through the propose tool and supplies distinct bible and facts formats', async () => {
  expect(PROPOSE_INPUT_SCHEMA.properties.page.enum).toContain('bible')
  expect(PROPOSE_DESCRIPTION).toContain('bible')
  expect(await readFile('server/morganHost/formats/story-facts.md', 'utf8')).toContain('# Story Facts')
  const bible = await readFile('server/morganHost/formats/bible.md', 'utf8')
  expect(bible).toContain('Pilot and season map')
  expect(bible).toContain("never changes canon without the writer's explicit yes")
})
