import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readWriterOSProjectPackage, serializeWriterOSProjectPackage, WRITEROS_LOOKS_PATH } from '../../client/src/lib/projectPackage'
import { defaultProjectState, loadProjectState, migrateState, saveProjectState } from '../../client/src/lib/projectState'
import { emptyLookbook } from '../../shared/lookbook'
import { emptyLooks, LooksDocumentSchema, type LooksDocument } from '../../shared/looks'

function storedProject(state = defaultProjectState()) {
  return { id: 'p1', title: 'T', createdAt: 1, updatedAt: 2, state }
}

function looksWithOneDraft(): LooksDocument {
  const spec = JSON.parse(readFileSync(resolve(__dirname, '../fixtures/lookSpec/synthetic-character.json'), 'utf8'))
  return {
    version: 1,
    drafts: {
      'character:vector-engineer': {
        sessionId: 'look-session-1', entityKind: 'character', entityName: 'Vector Engineer', reference: 'none',
        spec: { hair: spec.hair, age_band: spec.age_band }, fieldSources: { hair: 'writer', age_band: 'writer' },
        citedRecordIds: [], updatedAt: '2026-09-30T12:00:00.000Z',
      },
    },
  }
}

describe('looks package file (documents/looks.json)', () => {
  it('is not written when the project has no looks document', () => {
    expect(serializeWriterOSProjectPackage(storedProject()).files[WRITEROS_LOOKS_PATH]).toBeUndefined()
  })
  it('is written when defined, even with zero drafts', () => {
    const state = defaultProjectState()
    state.documents.looks = emptyLooks()
    const files = serializeWriterOSProjectPackage(storedProject(state)).files
    expect(JSON.parse(files[WRITEROS_LOOKS_PATH] as string)).toEqual(emptyLooks())
  })
  it('round-trips a draft, alongside the Lookbook', () => {
    const state = defaultProjectState()
    state.documents.looks = looksWithOneDraft()
    state.documents.lookbook = emptyLookbook()
    const read = readWriterOSProjectPackage(serializeWriterOSProjectPackage(storedProject(state)).files)
    expect(read.ok && read.project.state.documents.looks).toEqual(looksWithOneDraft())
    expect(read.ok && read.project.state.documents.lookbook).toEqual(emptyLookbook())
  })
  it('a package without the file reads with looks undefined', () => {
    const read = readWriterOSProjectPackage(serializeWriterOSProjectPackage(storedProject()).files)
    expect(read.ok && read.project.state.documents.looks).toBeUndefined()
  })
  it('an invalid looks file fails the read with a named path', () => {
    const files = { ...serializeWriterOSProjectPackage(storedProject()).files, [WRITEROS_LOOKS_PATH]: '{"version":2,"drafts":{}}' }
    const read = readWriterOSProjectPackage(files)
    expect(!read.ok && read.error.path).toBe(WRITEROS_LOOKS_PATH)
  })
})

describe('looks document schema', () => {
  it('refuses a draft key that does not match its entity kind, and model-sourced provenance', () => {
    const doc = looksWithOneDraft()
    const wrongKey = { ...doc, drafts: { 'location:vector-engineer': doc.drafts['character:vector-engineer'] } }
    expect(LooksDocumentSchema.safeParse(wrongKey).success).toBe(false)
    const zoeSourced = looksWithOneDraft()
    ;(zoeSourced.drafts['character:vector-engineer'].fieldSources as Record<string, string>).hair = 'zoe'
    expect(LooksDocumentSchema.safeParse(zoeSourced).success).toBe(false)
  })
})

describe('looks in project state', () => {
  it('migrateState keeps a valid looks document and drops an invalid one', () => {
    const state = defaultProjectState()
    state.documents.looks = looksWithOneDraft()
    expect(migrateState(JSON.parse(JSON.stringify(state))).documents.looks).toEqual(looksWithOneDraft())
    const broken = JSON.parse(JSON.stringify(state))
    broken.documents.looks.version = 9
    expect(migrateState(broken).documents.looks).toBeUndefined()
  })
  it('migrateState leaves looks undefined when absent', () => {
    expect(migrateState(JSON.parse(JSON.stringify(defaultProjectState()))).documents.looks).toBeUndefined()
  })
  it('browser save/load round-trips documents.looks', () => {
    const state = defaultProjectState()
    state.documents.looks = looksWithOneDraft()
    saveProjectState(state)
    expect(loadProjectState()?.documents.looks).toEqual(looksWithOneDraft())
  })
})
