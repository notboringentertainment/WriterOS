import { describe, expect, it } from 'vitest'
import {
  WRITEROS_DOCUMENT_PATHS,
  WRITEROS_IMPORTED_FDX_SOURCE_PATH,
  WRITEROS_PROJECT_MANIFEST_PATH,
  WRITEROS_SCRIPT_HTML_PATH,
  WRITEROS_TRANSCRIPT_PATHS,
  getWriterOSProjectPackageDirectoryName,
  readWriterOSProjectPackage,
  serializeWriterOSProjectPackage,
} from '../../client/src/lib/projectPackage'
import { defaultProjectState } from '../../client/src/lib/projectState'
import type { StoredProject } from '../../client/src/lib/projectLibrary'

function makeStoredProject(): StoredProject {
  const state = defaultProjectState()
  state.meta.title = 'The Salt Line'
  state.meta.format = 'series'
  state.script.rawHtml = [
    '<p data-element-type="scene-heading">INT. LIGHTHOUSE - NIGHT</p>',
    '<p data-element-type="action">Rain needles the windows.</p>',
    '<p data-element-type="character">MARA</p>',
    '<p data-element-type="dialogue">We keep the signal alive.</p>',
  ].join('')
  state.documents.synopsis.content.logline.text = 'A lighthouse keeper finds a message inside the storm.'
  state.agents.writingPartner.transcript = [{
    id: 'message-1',
    role: 'user',
    content: 'Help me tighten the opening.',
    speaker: 'Writer',
    ts: 1760000000000,
  }]

  return {
    id: 'project-123',
    createdAt: Date.parse('2026-05-01T10:00:00.000Z'),
    updatedAt: Date.parse('2026-05-02T11:30:00.000Z'),
    state,
  }
}

describe('WriterOS project packages', () => {
  it('serializes the canonical .writeros file layout', () => {
    const storedProject = makeStoredProject()

    const projectPackage = serializeWriterOSProjectPackage(storedProject, {
      openedAt: Date.parse('2026-05-03T12:00:00.000Z'),
    })

    expect(Object.keys(projectPackage.files).sort()).toEqual([
      WRITEROS_DOCUMENT_PATHS.outline,
      WRITEROS_DOCUMENT_PATHS.storyBible,
      WRITEROS_DOCUMENT_PATHS.synopsis,
      WRITEROS_DOCUMENT_PATHS.treatment,
      WRITEROS_PROJECT_MANIFEST_PATH,
      WRITEROS_SCRIPT_HTML_PATH,
      WRITEROS_TRANSCRIPT_PATHS.specialists,
      WRITEROS_TRANSCRIPT_PATHS.writingPartner,
    ].sort())
    expect(JSON.parse(projectPackage.files[WRITEROS_PROJECT_MANIFEST_PATH])).toMatchObject({
      schemaVersion: 1,
      projectId: 'project-123',
      title: 'The Salt Line',
      format: 'series',
      createdAt: '2026-05-01T10:00:00.000Z',
      updatedAt: '2026-05-02T11:30:00.000Z',
      openedAt: '2026-05-03T12:00:00.000Z',
    })
    expect(projectPackage.files[WRITEROS_SCRIPT_HTML_PATH]).toContain('INT. LIGHTHOUSE - NIGHT')
    expect(projectPackage.files[WRITEROS_DOCUMENT_PATHS.synopsis]).toContain('lighthouse keeper')
  })

  it('round-trips a project from package files and rebuilds script scenes', () => {
    const storedProject = makeStoredProject()
    const projectPackage = serializeWriterOSProjectPackage(storedProject)

    const result = readWriterOSProjectPackage(projectPackage.files)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error.message)
    expect(result.project.id).toBe('project-123')
    expect(result.project.createdAt).toBe(storedProject.createdAt)
    expect(result.project.updatedAt).toBe(storedProject.updatedAt)
    expect(result.project.state.meta.title).toBe('The Salt Line')
    expect(result.project.state.meta.format).toBe('series')
    expect(result.project.state.script.rawHtml).toContain('We keep the signal alive.')
    expect(result.project.state.script.scenes).toEqual([
      expect.objectContaining({ heading: 'INT. LIGHTHOUSE - NIGHT', index: 1 }),
    ])
    expect(result.project.state.documents.synopsis.content.logline.text).toBe(
      'A lighthouse keeper finds a message inside the storm.',
    )
    expect(result.project.state.agents.writingPartner.transcript[0].content).toBe(
      'Help me tighten the opening.',
    )
  })

  it('stores Final Draft import metadata and source copy when present', () => {
    const storedProject = makeStoredProject()
    storedProject.state.meta.sourceImport = {
      kind: 'fdx',
      originalFilename: 'The Salt Line.fdx',
      importedAt: '2026-05-24T00:00:00.000Z',
      rawSource: '<FinalDraft><Content /></FinalDraft>',
    }

    const projectPackage = serializeWriterOSProjectPackage(storedProject)
    const manifest = JSON.parse(projectPackage.files[WRITEROS_PROJECT_MANIFEST_PATH])

    expect(manifest.sourceImport).toEqual({
      kind: 'fdx',
      originalFilename: 'The Salt Line.fdx',
      importedAt: '2026-05-24T00:00:00.000Z',
      copiedSourcePath: WRITEROS_IMPORTED_FDX_SOURCE_PATH,
    })
    expect(projectPackage.files[WRITEROS_IMPORTED_FDX_SOURCE_PATH]).toBe(
      '<FinalDraft><Content /></FinalDraft>',
    )

    const result = readWriterOSProjectPackage(projectPackage.files)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error.message)
    expect(result.project.state.meta.sourceImport).toMatchObject({
      kind: 'fdx',
      originalFilename: 'The Salt Line.fdx',
      copiedSourcePath: WRITEROS_IMPORTED_FDX_SOURCE_PATH,
      rawSource: '<FinalDraft><Content /></FinalDraft>',
    })
  })

  it('reports a missing manifest as a corrupt package', () => {
    const projectPackage = serializeWriterOSProjectPackage(makeStoredProject())
    const files = { ...projectPackage.files }
    delete files[WRITEROS_PROJECT_MANIFEST_PATH]

    const result = readWriterOSProjectPackage(files)

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('Expected package read to fail')
    expect(result.error).toMatchObject({
      code: 'missing-file',
      path: WRITEROS_PROJECT_MANIFEST_PATH,
    })
  })

  it('reports malformed document JSON without returning a partial project', () => {
    const projectPackage = serializeWriterOSProjectPackage(makeStoredProject())
    const files = {
      ...projectPackage.files,
      [WRITEROS_DOCUMENT_PATHS.synopsis]: '{not json',
    }

    const result = readWriterOSProjectPackage(files)

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('Expected package read to fail')
    expect(result.error).toMatchObject({
      code: 'invalid-json',
      path: WRITEROS_DOCUMENT_PATHS.synopsis,
    })
  })

  it('falls back safely when optional script and transcript files are absent', () => {
    const projectPackage = serializeWriterOSProjectPackage(makeStoredProject())
    const files = { ...projectPackage.files }
    delete files[WRITEROS_SCRIPT_HTML_PATH]
    delete files[WRITEROS_TRANSCRIPT_PATHS.writingPartner]
    delete files[WRITEROS_TRANSCRIPT_PATHS.specialists]

    const result = readWriterOSProjectPackage(files)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error.message)
    expect(result.project.state.script.rawHtml).toBe('')
    expect(result.project.state.agents.writingPartner.transcript).toEqual([])
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining(WRITEROS_SCRIPT_HTML_PATH),
      expect.stringContaining(WRITEROS_TRANSCRIPT_PATHS.writingPartner),
      expect.stringContaining(WRITEROS_TRANSCRIPT_PATHS.specialists),
    ]))
  })

  it('creates filesystem-safe package directory names', () => {
    expect(getWriterOSProjectPackageDirectoryName('My: Project/Final?', '8f4e2c9a-5c7d-4f6b-a1c2-123456789abc')).toBe(
      'My Project Final (8f4e2c9a).writeros',
    )
  })
})
