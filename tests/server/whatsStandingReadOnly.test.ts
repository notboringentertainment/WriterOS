import { mkdtemp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { projectMemoryStore } from '../../server/projectMemory/store'

async function makePackage(root: string): Promise<string> {
  const projectPath = path.join(root, 'proj.writeros')
  await mkdir(projectPath, { recursive: true })
  await writeFile(path.join(projectPath, 'project.json'), JSON.stringify({
    schemaVersion: 1,
    projectId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    title: 'ReadOnly Fixture',
    format: 'feature',
    createdAt: '2026-08-13T20:00:00.000Z',
    updatedAt: '2026-08-13T20:00:00.000Z',
    openedAt: '2026-08-13T20:00:00.000Z',
    sourceImport: null,
    appVersion: '0.2.0',
  }, null, 2))
  return projectPath
}

async function fileBytes(projectPath: string): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const memoryPath = path.join(projectPath, 'memory')
  let entries: string[]
  try {
    entries = await readdir(memoryPath)
  } catch {
    return out
  }
  for (const entry of entries.sort()) {
    if (entry.startsWith('.')) continue
    out.set(entry, await readFile(path.join(memoryPath, entry), 'utf8'))
  }
  return out
}

describe('readSnapshotReadOnly', () => {
  it('does not create memory state for a package that has none', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'writeros-ro-'))
    const projectPath = await makePackage(root)

    const snapshot = await projectMemoryStore.readSnapshotReadOnly(projectPath)

    expect(snapshot.revision).toBe(0)
    expect(snapshot.records).toEqual([])
    // The whole point: no memory/ directory sprang into being.
    await expect(readdir(path.join(projectPath, 'memory'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('leaves ledger and projection bytes untouched on a package that has memory', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'writeros-ro-'))
    const projectPath = await makePackage(root)

    // Initialize memory through the normal write path first.
    await projectMemoryStore.publish(projectPath, {
      projectId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      dedupeKey: 'test:record-1',
      kind: 'canon',
      requestedStatus: 'active',
      claim: 'A decision. Superseded by beats 9-11.',
      source: {
        workflow: 'writeros',
        sourceId: 'test/one',
        sourceUri: 'writeros:test/one',
        sourceHash: 'a'.repeat(64),
        capturedAt: '2026-08-13T20:00:00.000Z',
        approval: 'explicit',
      },
    } as Parameters<typeof projectMemoryStore.publish>[1])

    const before = await fileBytes(projectPath)
    expect(before.size).toBeGreaterThan(0)

    const snapshot = await projectMemoryStore.readSnapshotReadOnly(projectPath)
    expect(snapshot.revision).toBeGreaterThan(0)

    const after = await fileBytes(projectPath)
    expect([...after.keys()]).toEqual([...before.keys()])
    for (const [name, bytes] of before) {
      expect(after.get(name), name).toBe(bytes)
    }
  })
})
