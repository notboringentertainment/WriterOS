import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { projectMemoryStore } from '../../server/projectMemory/store'
import { readWhatsStandingReport } from '../../server/projectMemory/whatsStandingReport'
import { WhatsStandingPayloadSchema } from '../../shared/whatsStandingPanel'

const PROJECT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

async function makePackage(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'writeros-ann-'))
  const projectPath = path.join(root, 'proj.writeros')
  await mkdir(projectPath, { recursive: true })
  await writeFile(path.join(projectPath, 'project.json'), JSON.stringify({
    schemaVersion: 1,
    projectId: PROJECT_ID,
    title: 'Annotation Fixture',
    format: 'feature',
    createdAt: '2026-08-13T20:00:00.000Z',
    updatedAt: '2026-08-13T20:00:00.000Z',
    openedAt: '2026-08-13T20:00:00.000Z',
    sourceImport: null,
    appVersion: '0.2.0',
  }, null, 2))
  return projectPath
}

async function publishRecord(
  projectPath: string,
  dedupeKey: string,
  claim: string,
  options: { supersedes?: string[]; kind?: 'canon' | 'development' } = {},
): Promise<void> {
  await projectMemoryStore.publish(projectPath, {
    projectId: PROJECT_ID,
    dedupeKey,
    kind: options.kind ?? 'canon',
    requestedStatus: 'active',
    claim,
    ...(options.supersedes !== undefined ? { supersedes: options.supersedes } : {}),
    source: {
      workflow: 'writeros',
      sourceId: dedupeKey,
      sourceUri: `writeros:${dedupeKey}`,
      sourceHash: 'a'.repeat(64),
      capturedAt: '2026-08-13T20:00:00.000Z',
      approval: 'explicit',
    },
  } as Parameters<typeof projectMemoryStore.publish>[1])
}

async function seeded(): Promise<{ projectPath: string }> {
  const projectPath = await makePackage()
  await publishRecord(projectPath, 'test:struck', 'STRUCK version of the engine. Superseded by beats 9-11.')
  await publishRecord(projectPath, 'test:beats', 'Beat sequence: 15 beats across three acts.')
  await publishRecord(projectPath, 'test:clean', 'The crime boss is Vincent Marcelli.')
  return { projectPath }
}

describe('readWhatsStandingReport', () => {
  it('returns a composed report and enriched questions with versions', async () => {
    const { projectPath } = await seeded()
    const result = await readWhatsStandingReport(projectPath)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(WhatsStandingPayloadSchema.safeParse(result.payload).success).toBe(true)
    expect(result.payload.questions.length).toBe(2)
    for (const q of result.payload.questions) {
      expect(q.questionVersion).toMatch(/^[0-9a-f]{64}$/)
      expect(q.candidates.length).toBe(2)
      expect(q.candidates[0].headline.length).toBeGreaterThan(0)
    }
  })

  it('writes nothing to the package', async () => {
    const { projectPath } = await seeded()
    await projectMemoryStore.readSnapshot(projectPath) // settle projections first
    const dir = path.join(projectPath, 'memory')
    const before = new Map<string, string>()
    for (const f of (await readdir(dir)).sort()) before.set(f, await readFile(path.join(dir, f), 'utf8'))
    await readWhatsStandingReport(projectPath)
    for (const [f, bytes] of before) expect(await readFile(path.join(dir, f), 'utf8')).toBe(bytes)
  })
})
