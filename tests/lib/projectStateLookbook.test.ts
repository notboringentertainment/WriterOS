import { describe, expect, it } from 'vitest'
import { defaultProjectState, migrateState, saveProjectState, loadProjectState } from '../../client/src/lib/projectState'
import { emptyLookbook } from '../../shared/lookbook'

describe('lookbook in project state', () => {
  it('migrateState keeps documents.lookbook', () => {
    const state = defaultProjectState()
    state.documents.lookbook = emptyLookbook()
    state.documents.lookbook.beats['beat.x'] = { titleAtAsk: 'X.', questions: [] }
    expect(migrateState(JSON.parse(JSON.stringify(state))).documents.lookbook?.beats['beat.x']).toBeDefined()
  })
  it('migrateState leaves lookbook undefined when absent', () => {
    expect(migrateState(JSON.parse(JSON.stringify(defaultProjectState()))).documents.lookbook).toBeUndefined()
  })
  it('browser save/load round-trips documents.lookbook', () => {
    const state = defaultProjectState()
    state.documents.lookbook = emptyLookbook()
    state.documents.lookbook.beats['beat.x'] = { titleAtAsk: 'X.', questions: [] }
    saveProjectState(state)
    expect(loadProjectState()?.documents.lookbook?.beats['beat.x']).toBeDefined()
  })
})
