import { describe, expect, it } from 'vitest'
import { defaultProjectState } from '../../client/src/lib/projectState'
import { readWriterOSProjectPackage, serializeWriterOSProjectPackage, WRITEROS_LOOKBOOK_PATH } from '../../client/src/lib/projectPackage'
import { emptyLookbook } from '../../shared/lookbook'

function storedProject(state = defaultProjectState()) {
  return { id: 'p1', title: 'T', createdAt: 1, updatedAt: 2, state }
}
function lookbookWithOneAnswer() {
  const lookbook = emptyLookbook()
  lookbook.beats['beat.the-dinner'] = { titleAtAsk: 'The dinner.', questions: [
    { id: 'q1', prompt: 'What is on the table?', answer: 'Bread.', askedBy: 'zoe', createdAt: '2026-01-01T00:00:00.000Z' } ] }
  return lookbook
}

describe('lookbook package file', () => {
  it('is not written when the project has no lookbook content', () => {
    const files = serializeWriterOSProjectPackage(storedProject()).files
    expect(files[WRITEROS_LOOKBOOK_PATH]).toBeUndefined()
  })
  it('is written once it has content, and read back', () => {
    const state = defaultProjectState()
    state.documents.lookbook = lookbookWithOneAnswer()
    const files = serializeWriterOSProjectPackage(storedProject(state)).files
    expect(files[WRITEROS_LOOKBOOK_PATH]).toContain('"Bread."')
    const read = readWriterOSProjectPackage(files)
    expect(read.ok && read.project.state.documents.lookbook?.beats['beat.the-dinner'].questions[0].answer).toBe('Bread.')
  })
  it('a package without the file reads with lookbook undefined', () => {
    const read = readWriterOSProjectPackage(serializeWriterOSProjectPackage(storedProject()).files)
    expect(read.ok && read.project.state.documents.lookbook).toBeUndefined()
  })
  it('an invalid lookbook file fails the read with a named path', () => {
    const files = { ...serializeWriterOSProjectPackage(storedProject()).files, [WRITEROS_LOOKBOOK_PATH]: '{"version":2}' }
    const read = readWriterOSProjectPackage(files)
    expect(!read.ok && read.error.path).toBe(WRITEROS_LOOKBOOK_PATH)
  })
  it('beatSheetSource on the outline survives a round trip', () => {
    const state = defaultProjectState()
    state.documents.outline.content.beatSheetSource = { ticket: 'resolved/x.md', sourceHash: 'abc', syncedAt: '2026-01-01T00:00:00.000Z', beatCount: 3, label: 'pilot' }
    const read = readWriterOSProjectPackage(serializeWriterOSProjectPackage(storedProject(state)).files)
    expect(read.ok && read.project.state.documents.outline.content.beatSheetSource?.beatCount).toBe(3)
  })
})
