import { describe, expect, it } from 'vitest'
import {
  readWriterOSProjectPackage,
  serializeWriterOSProjectPackage,
} from '../../client/src/lib/projectPackage'
import { defaultProjectState } from '../../client/src/lib/projectState'
import type { StoredProject } from '../../client/src/lib/projectLibrary'
import type { ComposedDocument } from '../../shared/compose/types'

const composed: ComposedDocument = {
  schemaVersion: 1,
  generatedAt: '2026-06-06T00:00:00.000Z',
  model: 'm',
  recipeVersion: 1,
  composerVersion: 1,
  sourceHash: 'h',
  format: 'feature',
  blocks: [{ type: 'paragraph', text: 'Mara returns home.', sourceFieldIds: ['spine.protagonist'] }],
  fidelity: { status: 'clean', warnings: [] },
}

describe('projectPackage composed round-trip', () => {
  it('serializes and reads back the composed outline artifact', () => {
    const state = defaultProjectState()
    state.documents.outline.composed = composed

    const storedProject: StoredProject = {
      id: 'project-123',
      createdAt: Date.parse('2026-05-01T10:00:00.000Z'),
      updatedAt: Date.parse('2026-05-02T11:30:00.000Z'),
      state,
    }

    const pkg = serializeWriterOSProjectPackage(storedProject)
    const read = readWriterOSProjectPackage(pkg.files)
    expect(read.ok).toBe(true)
    if (read.ok) {
      expect(read.project.state.documents.outline.composed?.sourceHash).toBe('h')
    }
  })
})
