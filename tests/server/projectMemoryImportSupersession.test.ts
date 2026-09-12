import { access, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { defaultProjectState } from '../../client/src/lib/projectState'
import { createProjectLibraryStore } from '../../server/projectLibrary/store'
import { projectMemoryStore } from '../../server/projectMemory/store'
import { runProjectMemoryCli } from '../../server/projectMemory/cli'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function createProject(projectId: string) {
  const root = await mkdtemp(path.join(tmpdir(), 'writeros-memory-import-spv-'))
  temporaryRoots.push(root)
  const library = await createProjectLibraryStore(root)
  await library.writeProject({
    id: projectId,
    createdAt: Date.parse('2026-09-01T12:00:00.000Z'),
    updatedAt: Date.parse('2026-09-02T12:00:00.000Z'),
    state: defaultProjectState(),
  })
  const sourceRoot = await mkdtemp(path.join(root, 'wayfinder-source-'))
  return { root, projectPath: await library.resolveProjectPackagePath(projectId), sourceRoot }
}

function ticketRecord(projectId: string, hash: string, overrides: Record<string, unknown> = {}) {
  return {
    projectId,
    dedupeKey: `import:story-wayfinder:${hash}`,
    kind: 'canon',
    requestedStatus: 'active',
    claim: `The solo rule, version ${hash}.`,
    source: {
      workflow: 'story-wayfinder',
      sourceId: 'resolved/the-solo-rule.md',
      sourceUri: 'story-wayfinder:resolved/the-solo-rule.md',
      sourceHash: hash,
      capturedAt: '2026-09-01T00:00:00.000Z',
      approval: 'explicit',
      authority: { ticketType: 'grill', mode: 'hitl' },
    },
    ...overrides,
  }
}

function preview(projectId: string, records: Record<string, unknown>[], source = 'story-wayfinder') {
  return {
    source,
    projectId,
    records,
    warnings: [],
    duplicates: 0,
    counts: {
      activeCanon: records.filter(record => record.kind === 'canon' && record.requestedStatus === 'active').length,
      candidates: records.filter(record => record.requestedStatus === 'candidate').length,
      development: records.filter(record => record.kind === 'development').length,
      openQuestions: records.filter(record => record.kind === 'open_question').length,
      conflicts: 0,
      duplicates: 0,
      flagged: 0,
    },
  }
}

async function runImport(
  projectPath: string,
  sourceRoot: string,
  mode: '--dry-run' | '--apply',
  previewValue: unknown,
  source: 'wayfinder' | 'pitchstudio' = 'wayfinder',
) {
  const output: string[] = []
  const errors: string[] = []
  const code = await runProjectMemoryCli(
    ['import', '--source', source, '--from', sourceRoot, '--project', projectPath, mode],
    { stdout: (value: string) => output.push(value), stderr: (value: string) => errors.push(value) },
    { importPreview: async () => previewValue as never },
  )
  if (code !== 0) throw new Error(`import exited ${code}: ${errors.join('')}`)
  return { code, output: JSON.parse(output.join('')) as Record<string, unknown> }
}

describe('import supersedes prior versions of a Wayfinder ticket', () => {
  it('retires the earlier published version when an amended ticket is imported', async () => {
    const projectId = 'import-amended'
    const { projectPath, sourceRoot } = await createProject(projectId)

    const first = await runImport(projectPath, sourceRoot, '--apply', preview(projectId, [ticketRecord(projectId, 'v1')]))
    expect(first.code).toBe(0)
    expect(first.output).toMatchObject({ applied: 1, supersessions: 0 })

    const dry = await runImport(projectPath, sourceRoot, '--dry-run', preview(projectId, [ticketRecord(projectId, 'v2')]))
    expect(dry.code).toBe(0)
    expect(dry.output).toMatchObject({ supersessionsExpected: 1 })
    expect((dry.output.records as Array<Record<string, unknown>>)[0]).toMatchObject({ supersedesPriorVersions: true })

    const second = await runImport(projectPath, sourceRoot, '--apply', preview(projectId, [ticketRecord(projectId, 'v2')]))
    expect(second.code).toBe(0)
    expect(second.output).toMatchObject({ applied: 1, supersessions: 1, revision: 2 })

    const snapshot = await projectMemoryStore.readSnapshotReadOnly(projectPath)
    const active = snapshot.records.filter(record => record.status === 'active')
    expect(active).toHaveLength(1)
    expect(active[0]).toMatchObject({ claim: 'The solo rule, version v2.' })
    expect(snapshot.records.find(record => record.source.sourceHash === 'v1')?.status).toBe('superseded')
    expect(active[0].supersedes).toEqual([snapshot.records.find(record => record.source.sourceHash === 'v1')?.id])
  })

  it('does not retire canon when the amended version imports as a candidate', async () => {
    const projectId = 'import-candidate'
    const { projectPath, sourceRoot } = await createProject(projectId)
    await runImport(projectPath, sourceRoot, '--apply', preview(projectId, [ticketRecord(projectId, 'v1')]))

    const candidate = ticketRecord(projectId, 'v2', { requestedStatus: 'candidate' })
    const dry = await runImport(projectPath, sourceRoot, '--dry-run', preview(projectId, [candidate]))
    // A candidate never retires anything, so the estimate must say zero.
    expect(dry.output).toMatchObject({ supersessionsExpected: 0 })
    const apply = await runImport(projectPath, sourceRoot, '--apply', preview(projectId, [candidate]))
    expect(apply.output).toMatchObject({ applied: 1, supersessions: 0 })

    const snapshot = await projectMemoryStore.readSnapshotReadOnly(projectPath)
    expect(snapshot.records.find(record => record.source.sourceHash === 'v1')?.status).toBe('active')
    expect(snapshot.records.find(record => record.source.sourceHash === 'v2')).toMatchObject({ status: 'candidate', supersedes: [] })
  })

  it('resolves priors per publication so two versions in one preview collapse to the last', async () => {
    const projectId = 'import-two-in-one'
    const { projectPath, sourceRoot } = await createProject(projectId)
    const apply = await runImport(
      projectPath,
      sourceRoot,
      '--apply',
      preview(projectId, [ticketRecord(projectId, 'v1'), ticketRecord(projectId, 'v2')]),
    )
    expect(apply.output).toMatchObject({ applied: 2, supersessions: 1 })
    const snapshot = await projectMemoryStore.readSnapshotReadOnly(projectPath)
    expect(snapshot.records.filter(record => record.status === 'active').map(record => record.source.sourceHash)).toEqual(['v2'])
  })

  it('treats re-importing a published version as a no-op with no retirements', async () => {
    const projectId = 'import-idempotent'
    const { projectPath, sourceRoot } = await createProject(projectId)
    await runImport(projectPath, sourceRoot, '--apply', preview(projectId, [ticketRecord(projectId, 'v1')]))
    await runImport(projectPath, sourceRoot, '--apply', preview(projectId, [ticketRecord(projectId, 'v2')]))

    const dry = await runImport(projectPath, sourceRoot, '--dry-run', preview(projectId, [ticketRecord(projectId, 'v1')]))
    expect(dry.output).toMatchObject({ supersessionsExpected: 0 })
    const retry = await runImport(projectPath, sourceRoot, '--apply', preview(projectId, [ticketRecord(projectId, 'v1')]))
    expect(retry.output).toMatchObject({ applied: 0, supersessions: 0, duplicates: 1, revision: 2 })

    const snapshot = await projectMemoryStore.readSnapshotReadOnly(projectPath)
    expect(snapshot.records.find(record => record.source.sourceHash === 'v2')?.status).toBe('active')
  })

  it('reports no expected retirements for the original version after a maintenance replacement', async () => {
    const projectId = 'import-after-cleanup'
    const { projectPath, sourceRoot } = await createProject(projectId)
    await runImport(projectPath, sourceRoot, '--apply', preview(projectId, [ticketRecord(projectId, 'v1')]))
    const original = (await projectMemoryStore.readSnapshotReadOnly(projectPath)).records[0]

    // A cleanup republishes the same content under a maintenance dedupe key,
    // so the active record for this source now has a different id.
    const replacement = await projectMemoryStore.publish(projectPath, {
      ...ticketRecord(projectId, 'v1'),
      dedupeKey: 'maintenance:collapse:story-wayfinder:the-solo-rule',
      supersedes: [original.id],
    } as never)
    expect(replacement.published).toBe(true)
    expect(replacement.record.id).not.toBe(original.id)

    const dry = await runImport(projectPath, sourceRoot, '--dry-run', preview(projectId, [ticketRecord(projectId, 'v1')]))
    expect(dry.output).toMatchObject({ supersessionsExpected: 0 })
    const retry = await runImport(projectPath, sourceRoot, '--apply', preview(projectId, [ticketRecord(projectId, 'v1')]))
    expect(retry.output).toMatchObject({ applied: 0, supersessions: 0 })
    const snapshot = await projectMemoryStore.readSnapshotReadOnly(projectPath)
    expect(snapshot.records.find(record => record.id === replacement.record.id)?.status).toBe('active')
  })

  it('leaves non-Wayfinder imports unchanged', async () => {
    const projectId = 'import-pitchstudio'
    const { projectPath, sourceRoot } = await createProject(projectId)
    const pitch = (hash: string) => ({
      projectId,
      dedupeKey: `import:pitchstudio:${hash}`,
      kind: 'development',
      requestedStatus: 'active',
      claim: `Pitch decision ${hash}.`,
      source: {
        workflow: 'pitchstudio',
        sourceId: 'decisions.md#decision-1',
        sourceUri: 'pitchstudio:decisions.md#decision-1',
        sourceHash: hash,
        capturedAt: '2026-09-01T00:00:00.000Z',
        approval: 'none',
      },
    })
    const dry = await runImport(projectPath, sourceRoot, '--dry-run', preview(projectId, [pitch('p1')], 'pitchstudio'), 'pitchstudio')
    expect(dry.output).toMatchObject({ supersessionsExpected: 0 })
    expect((dry.output.records as Array<Record<string, unknown>>)[0]).toMatchObject({ supersedesPriorVersions: false })
    await runImport(projectPath, sourceRoot, '--apply', preview(projectId, [pitch('p1')], 'pitchstudio'), 'pitchstudio')
    const second = await runImport(projectPath, sourceRoot, '--apply', preview(projectId, [pitch('p2')], 'pitchstudio'), 'pitchstudio')
    expect(second.output).toMatchObject({ applied: 1, supersessions: 0 })
    const snapshot = await projectMemoryStore.readSnapshotReadOnly(projectPath)
    expect(snapshot.records.filter(record => record.status === 'active')).toHaveLength(2)
  })

  it('keeps dry-run read-only on a package that has never initialized memory', async () => {
    const projectId = 'import-dry-run-readonly'
    const { projectPath, sourceRoot } = await createProject(projectId)
    const dry = await runImport(projectPath, sourceRoot, '--dry-run', preview(projectId, [ticketRecord(projectId, 'v1')]))
    expect(dry.code).toBe(0)
    expect(dry.output).toMatchObject({ supersessionsExpected: 0 })
    await expect(access(path.join(projectPath, 'memory'))).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
