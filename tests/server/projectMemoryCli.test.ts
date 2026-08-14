import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { defaultProjectState } from '../../client/src/lib/projectState'
import { createProjectLibraryStore } from '../../server/projectLibrary/store'
import { projectMemoryStore } from '../../server/projectMemory/store'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function createProject(projectId: string) {
  const root = await mkdtemp(path.join(tmpdir(), 'writeros-memory-cli-'))
  temporaryRoots.push(root)
  const library = await createProjectLibraryStore(root)
  await library.writeProject({
    id: projectId,
    createdAt: Date.parse('2026-08-01T12:00:00.000Z'),
    updatedAt: Date.parse('2026-08-02T12:00:00.000Z'),
    state: defaultProjectState(),
  })
  return { root, projectPath: await library.resolveProjectPackagePath(projectId) }
}

describe('project memory CLI', () => {
  it('renders JSON context through the shared store and retrieval contracts', async () => {
    const projectId = 'cli-context-project'
    const { projectPath } = await createProject(projectId)
    await projectMemoryStore.publish(projectPath, {
      projectId,
      dedupeKey: 'cli-context-canon',
      kind: 'canon',
      requestedStatus: 'active',
      claim: 'The ending returns to the sea wall.',
      source: {
        workflow: 'writeros',
        sourceId: 'cli-source',
        sourceUri: 'writeros://cli/source',
        sourceHash: 'cli-context-hash',
        capturedAt: '2026-08-02T12:00:00.000Z',
        approval: 'explicit',
      },
    })
    const cliModulePath = '../../server/projectMemory/cli.ts'
    const cliModule = await import(cliModulePath).catch(() => undefined)
    const stdout: string[] = []
    const stderr: string[] = []

    const exitCode = await cliModule?.runProjectMemoryCli?.([
      'context',
      '--project', projectPath,
      '--query', 'ending',
      '--format', 'json',
    ], {
      stdout: (value: string) => stdout.push(value),
      stderr: (value: string) => stderr.push(value),
    })

    expect(exitCode).toBe(0)
    expect(stderr).toEqual([])
    expect(JSON.parse(stdout.join(''))).toMatchObject({
      projectId,
      revision: 1,
      activeCanon: [{ claim: 'The ending returns to the sea wall.' }],
    })
  })

  it('publishes a validated input and treats an idempotent retry as success', async () => {
    const projectId = 'cli-publish-project'
    const { root, projectPath } = await createProject(projectId)
    const inputPath = path.join(root, 'publication.json')
    await writeFile(inputPath, JSON.stringify({
      projectId,
      dedupeKey: 'cli-publication',
      kind: 'decision',
      requestedStatus: 'active',
      claim: 'The team chose the northern route.',
      source: {
        workflow: 'writeros',
        sourceId: 'cli-decision',
        sourceUri: 'writeros://decision/northern-route',
        sourceHash: 'cli-publish-hash',
        capturedAt: '2026-08-02T12:00:00.000Z',
        approval: 'explicit',
      },
    }))
    const cliModulePath = '../../server/projectMemory/cli.ts'
    const cliModule = await import(cliModulePath).catch(() => undefined)
    const output: string[] = []
    const io = { stdout: (value: string) => output.push(value), stderr: () => undefined }
    const command = ['publish', '--project', projectPath, '--input', inputPath]

    const first = await cliModule?.runProjectMemoryCli?.(command, io)
    const second = await cliModule?.runProjectMemoryCli?.(command, io)

    expect(first).toBe(0)
    expect(second).toBe(0)
    expect(output.map(value => JSON.parse(value).published)).toEqual([true, false])
    expect((await projectMemoryStore.readSnapshot(projectPath))).toMatchObject({ revision: 1 })
  })

  it('excludes spoiler records from exports unless inclusion is explicit', async () => {
    const projectId = 'cli-export-project'
    const { projectPath } = await createProject(projectId)
    for (const [dedupeKey, claim, spoiler] of [
      ['public-canon', 'The harbor is abandoned.', false],
      ['spoiler-canon', 'The harbor master is the saboteur.', true],
    ] as const) {
      await projectMemoryStore.publish(projectPath, {
        projectId,
        dedupeKey,
        kind: 'canon',
        requestedStatus: 'active',
        claim,
        spoiler,
        source: {
          workflow: 'writeros',
          sourceId: dedupeKey,
          sourceUri: `writeros://canon/${dedupeKey}`,
          sourceHash: `${dedupeKey}-hash`,
          capturedAt: '2026-08-02T12:00:00.000Z',
          approval: 'explicit',
        },
      })
    }
    const cliModulePath = '../../server/projectMemory/cli.ts'
    const cliModule = await import(cliModulePath).catch(() => undefined)
    const defaultOutput: string[] = []
    const spoilerOutput: string[] = []

    const defaultCode = await cliModule?.runProjectMemoryCli?.([
      'export', '--project', projectPath, '--format', 'markdown',
    ], { stdout: (value: string) => defaultOutput.push(value), stderr: () => undefined })
    const spoilerCode = await cliModule?.runProjectMemoryCli?.([
      'export', '--project', projectPath, '--format', 'markdown', '--include-spoilers',
    ], { stdout: (value: string) => spoilerOutput.push(value), stderr: () => undefined })

    expect(defaultCode).toBe(0)
    expect(spoilerCode).toBe(0)
    expect(defaultOutput.join('')).toContain('The harbor is abandoned.')
    expect(defaultOutput.join('')).not.toContain('The harbor master is the saboteur.')
    expect(spoilerOutput.join('')).toContain('The harbor master is the saboteur.')
  })

  it('links a Buzz channel under the package lock and project saves preserve the mapping', async () => {
    const projectId = 'cli-link-project'
    const { root, projectPath } = await createProject(projectId)
    const cliModulePath = '../../server/projectMemory/cli.ts'
    const cliModule = await import(cliModulePath).catch(() => undefined)
    const stdout: string[] = []

    const exitCode = await cliModule?.runProjectMemoryCli?.([
      'link-source',
      '--project', projectPath,
      '--workflow', 'buzz',
      '--source-id', '7ac91c24-09da-4b21-a093-f09aef717270',
    ], { stdout: (value: string) => stdout.push(value), stderr: () => undefined })

    expect(exitCode).toBe(0)
    expect(JSON.parse(await readFile(path.join(projectPath, 'project.json'), 'utf8'))).toMatchObject({
      projectId,
      sources: { buzzChannelId: '7ac91c24-09da-4b21-a093-f09aef717270' },
    })
    const library = await createProjectLibraryStore(root)
    const read = await library.readProject(projectId)
    expect(read.ok).toBe(true)
    if (!read.ok) return
    await library.writeProject(read.project)
    expect(JSON.parse(await readFile(path.join(projectPath, 'project.json'), 'utf8'))).toMatchObject({
      sources: { buzzChannelId: '7ac91c24-09da-4b21-a093-f09aef717270' },
    })
    expect(JSON.parse(stdout.join(''))).toEqual({
      linked: true,
      workflow: 'buzz',
      sourceId: '7ac91c24-09da-4b21-a093-f09aef717270',
    })
  })

  it('requires an explicit import mode, previews without writes, and applies through store publication', async () => {
    const projectId = 'cli-import-project'
    const { root, projectPath } = await createProject(projectId)
    const sourceRoot = await mkdtemp(path.join(root, 'wayfinder-source-'))
    const cliModulePath = '../../server/projectMemory/cli.ts'
    const cliModule = await import(cliModulePath).catch(() => undefined)
    const preview = {
      source: 'story-wayfinder',
      projectId,
      records: [{
        projectId,
        dedupeKey: 'imported-decision',
        kind: 'development',
        requestedStatus: 'active',
        claim: 'The lighthouse sequence should feel claustrophobic.',
        source: {
          workflow: 'story-wayfinder',
          sourceId: 'ticket-17',
          sourceUri: 'wayfinder://ticket/17',
          sourceHash: 'ticket-17-hash',
          capturedAt: '2026-08-02T12:00:00.000Z',
          approval: 'none',
          authority: { ticketType: 'homework', mode: 'hitl' },
        },
      }],
      warnings: ['fixture warning'],
      duplicates: 0,
    }
    let previewCalls = 0
    const dependencies = {
      importPreview: async () => {
        previewCalls += 1
        return preview
      },
    }
    const base = [
      'import', '--source', 'wayfinder', '--from', sourceRoot, '--project', projectPath,
    ]
    const dryOutput: string[] = []

    const missingMode = await cliModule?.runProjectMemoryCli?.(base, {
      stdout: () => undefined,
      stderr: () => undefined,
    }, dependencies)
    const dryRun = await cliModule?.runProjectMemoryCli?.([...base, '--dry-run'], {
      stdout: (value: string) => dryOutput.push(value),
      stderr: () => undefined,
    }, dependencies)
    const beforeApply = await projectMemoryStore.readSnapshot(projectPath)
    const apply = await cliModule?.runProjectMemoryCli?.([...base, '--apply'], {
      stdout: () => undefined,
      stderr: () => undefined,
    }, dependencies)
    const afterApply = await projectMemoryStore.readSnapshot(projectPath)

    expect(missingMode).toBe(2)
    expect(dryRun).toBe(0)
    expect(beforeApply.revision).toBe(0)
    expect(JSON.parse(dryOutput.join(''))).toMatchObject({ warnings: ['fixture warning'] })
    expect(apply).toBe(0)
    expect(afterApply).toMatchObject({
      revision: 1,
      records: [{ claim: 'The lighthouse sequence should feel claustrophobic.' }],
    })
    expect(previewCalls).toBe(2)
  })

  it('rejects a symbolic-link import source without invoking an adapter or leaking its path', async () => {
    const projectId = 'cli-unsafe-import-project'
    const { root, projectPath } = await createProject(projectId)
    const sourceRoot = await mkdtemp(path.join(root, 'real-source-'))
    const linkedSource = path.join(root, 'linked-source')
    await symlink(sourceRoot, linkedSource)
    const cliModulePath = '../../server/projectMemory/cli.ts'
    const cliModule = await import(cliModulePath).catch(() => undefined)
    const stderr: string[] = []
    let adapterCalled = false

    const exitCode = await cliModule?.runProjectMemoryCli?.([
      'import',
      '--source', 'wayfinder',
      '--from', linkedSource,
      '--project', projectPath,
      '--dry-run',
    ], {
      stdout: () => undefined,
      stderr: (value: string) => stderr.push(value),
    }, {
      importPreview: async () => {
        adapterCalled = true
        throw new Error('must not run')
      },
    })

    expect(exitCode).toBe(2)
    expect(adapterCalled).toBe(false)
    expect(stderr.join('')).not.toContain(root)
    expect((await projectMemoryStore.readSnapshot(projectPath)).revision).toBe(0)
  })
})
