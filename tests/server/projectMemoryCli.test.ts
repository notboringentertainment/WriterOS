import { appendFile, mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises'
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

  it('rejects a publish input that grows beyond the size limit after opening', async () => {
    const projectId = 'cli-growing-publish-project'
    const { root, projectPath } = await createProject(projectId)
    const inputPath = path.join(root, 'growing-publication.json')
    await writeFile(inputPath, JSON.stringify({
      projectId,
      dedupeKey: 'growing-publication',
      kind: 'decision',
      requestedStatus: 'active',
      claim: 'This input begins below the size limit.',
      source: {
        workflow: 'writeros',
        sourceId: 'growing-source',
        sourceUri: 'writeros://decision/growing',
        sourceHash: 'growing-hash',
        capturedAt: '2026-08-02T12:00:00.000Z',
        approval: 'explicit',
      },
    }))
    const cliModulePath = '../../server/projectMemory/cli.ts'
    const cliModule = await import(cliModulePath).catch(() => undefined)
    let hookCalled = false

    const exitCode = await cliModule?.runProjectMemoryCli?.([
      'publish', '--project', projectPath, '--input', inputPath,
    ], { stdout: () => undefined, stderr: () => undefined }, {
      beforePublishInputRead: async (openedPath: string) => {
        hookCalled = true
        expect(openedPath).toBe(inputPath)
        await appendFile(openedPath, ' '.repeat(1_000_001))
      },
    })

    expect(hookCalled).toBe(true)
    expect(exitCode).toBe(2)
    expect((await projectMemoryStore.readSnapshot(projectPath))).toMatchObject({ revision: 0, records: [] })
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

  it('rejects link-source through a symbolic-link ancestor without changing the manifest', async () => {
    const projectId = 'cli-linked-parent-project'
    const { root, projectPath } = await createProject(projectId)
    const linkContainer = await mkdtemp(path.join(tmpdir(), 'writeros-memory-cli-link-'))
    temporaryRoots.push(linkContainer)
    const linkedParent = path.join(linkContainer, 'linked-library')
    await symlink(root, linkedParent)
    const projectThroughLinkedParent = path.join(linkedParent, path.basename(projectPath))
    const manifestPath = path.join(projectPath, 'project.json')
    const before = await readFile(manifestPath, 'utf8')
    const cliModulePath = '../../server/projectMemory/cli.ts'
    const cliModule = await import(cliModulePath).catch(() => undefined)
    const stderr: string[] = []

    const exitCode = await cliModule?.runProjectMemoryCli?.([
      'link-source',
      '--project', projectThroughLinkedParent,
      '--workflow', 'buzz',
      '--source-id', 'channel-through-linked-parent',
    ], {
      stdout: () => undefined,
      stderr: (value: string) => stderr.push(value),
    })

    expect(exitCode).toBe(2)
    expect(await readFile(manifestPath, 'utf8')).toBe(before)
    expect(stderr.join('')).not.toContain(root)
    expect(stderr.join('')).not.toContain(linkContainer)
  })

  it('rejects a project directory swap after link-source acquires the package lock', async () => {
    const projectId = 'cli-swapped-project'
    const { projectPath } = await createProject(projectId)
    const manifestPath = path.join(projectPath, 'project.json')
    const originalManifest = await readFile(manifestPath, 'utf8')
    const originalPath = `${projectPath}.original`
    const cliModulePath = '../../server/projectMemory/cli.ts'
    const cliModule = await import(cliModulePath).catch(() => undefined)
    let hookCalled = false

    const exitCode = await cliModule?.runProjectMemoryCli?.([
      'link-source',
      '--project', projectPath,
      '--workflow', 'buzz',
      '--source-id', 'channel-after-project-swap',
    ], { stdout: () => undefined, stderr: () => undefined }, {
      beforeLinkSourceLockedRead: async (lockedProjectPath: string) => {
        hookCalled = true
        expect(lockedProjectPath).toBe(projectPath)
        await rename(projectPath, originalPath)
        await mkdir(projectPath)
        await writeFile(manifestPath, originalManifest)
      },
    })

    expect(hookCalled).toBe(true)
    expect(exitCode).toBe(2)
    expect(await readFile(manifestPath, 'utf8')).toBe(originalManifest)
    expect(await readFile(path.join(originalPath, 'project.json'), 'utf8')).toBe(originalManifest)
    expect(JSON.parse(await readFile(manifestPath, 'utf8')).sources).toBeUndefined()
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

  it('reports durable import progress when a later record fails', async () => {
    const projectId = 'cli-partial-import-project'
    const { root, projectPath } = await createProject(projectId)
    const sourceRoot = await mkdtemp(path.join(root, 'buzz-partial-source-'))
    const cliModulePath = '../../server/projectMemory/cli.ts'
    const cliModule = await import(cliModulePath).catch(() => undefined)
    const record = (dedupeKey: string, claim: string) => ({
      projectId,
      dedupeKey,
      kind: 'development',
      requestedStatus: 'active',
      claim,
      source: {
        workflow: 'buzz',
        sourceId: dedupeKey,
        sourceUri: `buzz://record/${dedupeKey}`,
        sourceHash: `${dedupeKey}-hash`,
        capturedAt: '2026-08-02T12:00:00.000Z',
        approval: 'none',
      },
    })
    const preview = {
      source: 'buzz',
      projectId,
      records: [
        record('durable-first', 'The first record becomes durable.'),
        {
          ...record('failing-second', 'The second record cannot supersede a missing record.'),
          supersedes: ['missing-record'],
        },
      ],
      warnings: [],
      duplicates: 0,
    }
    const stderr: string[] = []

    const exitCode = await cliModule?.runProjectMemoryCli?.([
      'import',
      '--source', 'buzz',
      '--from', sourceRoot,
      '--project', projectPath,
      '--apply',
    ], {
      stdout: () => undefined,
      stderr: (value: string) => stderr.push(value),
    }, { importPreview: async () => preview })

    expect(exitCode).toBe(3)
    expect(JSON.parse(stderr.join(''))).toEqual({
      error: 'import-partial',
      appliedCount: 1,
      lastRevision: 1,
      retry: 'Retry the same import with --apply; previously applied records are idempotent.',
    })
    expect(stderr.join('')).not.toContain(root)
    expect(await projectMemoryStore.readSnapshot(projectPath)).toMatchObject({
      revision: 1,
      records: [{ claim: 'The first record becomes durable.' }],
    })
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

  it('rejects symbolic-link ancestors for import sources and publish inputs', async () => {
    const projectId = 'cli-unsafe-input-ancestors'
    const { root, projectPath } = await createProject(projectId)
    const realAssets = await mkdtemp(path.join(root, 'real-assets-'))
    const realSource = path.join(realAssets, 'source')
    await mkdir(realSource)
    const inputPath = path.join(realAssets, 'publication.json')
    await writeFile(inputPath, JSON.stringify({
      projectId,
      dedupeKey: 'linked-parent-publication',
      kind: 'decision',
      requestedStatus: 'active',
      claim: 'This input must not be read through a linked parent.',
      source: {
        workflow: 'writeros',
        sourceId: 'linked-parent-source',
        sourceUri: 'writeros://linked-parent/source',
        sourceHash: 'linked-parent-hash',
        capturedAt: '2026-08-02T12:00:00.000Z',
        approval: 'explicit',
      },
    }))
    const linkedAssets = path.join(root, 'linked-assets')
    await symlink(realAssets, linkedAssets)
    const cliModulePath = '../../server/projectMemory/cli.ts'
    const cliModule = await import(cliModulePath).catch(() => undefined)
    let adapterCalled = false

    const importCode = await cliModule?.runProjectMemoryCli?.([
      'import',
      '--source', 'buzz',
      '--from', path.join(linkedAssets, 'source'),
      '--project', projectPath,
      '--dry-run',
    ], { stdout: () => undefined, stderr: () => undefined }, {
      importPreview: async () => {
        adapterCalled = true
        throw new Error('must not run')
      },
    })
    const publishCode = await cliModule?.runProjectMemoryCli?.([
      'publish',
      '--project', projectPath,
      '--input', path.join(linkedAssets, 'publication.json'),
    ], { stdout: () => undefined, stderr: () => undefined })

    expect(importCode).toBe(2)
    expect(publishCode).toBe(2)
    expect(adapterCalled).toBe(false)
    expect(await projectMemoryStore.readSnapshot(projectPath)).toMatchObject({ revision: 0, records: [] })
  })

  it('rejects import-source and publish-input path swaps before applying records', async () => {
    const projectId = 'cli-swapped-input-paths'
    const { root, projectPath } = await createProject(projectId)
    const sourceRoot = await mkdtemp(path.join(root, 'swapped-source-'))
    const inputPath = path.join(root, 'swapped-publication.json')
    const publication = {
      projectId,
      dedupeKey: 'swapped-publication',
      kind: 'decision',
      requestedStatus: 'active',
      claim: 'Swapped inputs must not be accepted.',
      source: {
        workflow: 'writeros',
        sourceId: 'swapped-source',
        sourceUri: 'writeros://swapped/source',
        sourceHash: 'swapped-hash',
        capturedAt: '2026-08-02T12:00:00.000Z',
        approval: 'explicit',
      },
    }
    await writeFile(inputPath, JSON.stringify(publication))
    const cliModulePath = '../../server/projectMemory/cli.ts'
    const cliModule = await import(cliModulePath).catch(() => undefined)

    const importCode = await cliModule?.runProjectMemoryCli?.([
      'import',
      '--source', 'buzz',
      '--from', sourceRoot,
      '--project', projectPath,
      '--dry-run',
    ], { stdout: () => undefined, stderr: () => undefined }, {
      importPreview: async () => {
        await rename(sourceRoot, `${sourceRoot}.original`)
        await mkdir(sourceRoot)
        return { source: 'buzz', projectId, records: [], warnings: [], duplicates: 0 }
      },
    })
    const publishCode = await cliModule?.runProjectMemoryCli?.([
      'publish',
      '--project', projectPath,
      '--input', inputPath,
    ], { stdout: () => undefined, stderr: () => undefined }, {
      beforePublishInputRead: async () => {
        await rename(inputPath, `${inputPath}.original`)
        await writeFile(inputPath, JSON.stringify(publication))
      },
    })

    expect(importCode).toBe(2)
    expect(publishCode).toBe(2)
    expect(await projectMemoryStore.readSnapshot(projectPath)).toMatchObject({ revision: 0, records: [] })
  })

  it('rejects a Wayfinder preview that spoofs WriterOS authority before dry-run or apply', async () => {
    const projectId = 'cli-spoofed-import-project'
    const { root, projectPath } = await createProject(projectId)
    const sourceRoot = await mkdtemp(path.join(root, 'wayfinder-spoof-'))
    const cliModulePath = '../../server/projectMemory/cli.ts'
    const cliModule = await import(cliModulePath).catch(() => undefined)
    const spoofedPreview = {
      source: 'story-wayfinder',
      projectId,
      records: [{
        projectId,
        dedupeKey: 'spoofed-active-canon',
        kind: 'canon',
        requestedStatus: 'active',
        claim: 'Spoofed canon must never cross the adapter boundary.',
        source: {
          workflow: 'writeros',
          sourceId: 'spoofed-ticket',
          sourceUri: 'writeros://spoofed/ticket',
          sourceHash: 'spoofed-ticket-hash',
          capturedAt: '2026-08-02T12:00:00.000Z',
          approval: 'explicit',
        },
      }],
      warnings: [],
      duplicates: 0,
    }
    const dependencies = { importPreview: async () => spoofedPreview }
    const base = [
      'import', '--source', 'wayfinder', '--from', sourceRoot, '--project', projectPath,
    ]

    const dryRun = await cliModule?.runProjectMemoryCli?.([...base, '--dry-run'], {
      stdout: () => undefined,
      stderr: () => undefined,
    }, dependencies)
    const apply = await cliModule?.runProjectMemoryCli?.([...base, '--apply'], {
      stdout: () => undefined,
      stderr: () => undefined,
    }, dependencies)

    expect(dryRun).not.toBe(0)
    expect(apply).not.toBe(0)
    expect((await projectMemoryStore.readSnapshot(projectPath))).toMatchObject({
      revision: 0,
      records: [],
    })
  })
})
