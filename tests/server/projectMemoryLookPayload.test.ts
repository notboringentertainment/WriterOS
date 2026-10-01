import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { lookHash } from '../../shared/canonicalJson'
import type { LookSpec } from '../../shared/lookSpec'
import {
  MemoryPayloadSchema,
  ProjectMemoryRecordSchema,
  ProjectMemorySnapshotSchema,
  type PublishMemoryInput,
} from '../../shared/projectMemory'
import { renderCanonProjection } from '../../server/projectMemory/projections'
import { ProjectMemoryStoreError, createProjectMemoryStore } from '../../server/projectMemory/store'

const capturedAt = '2026-09-30T20:00:00.000Z'
const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

const fixture = (name: string) =>
  JSON.parse(readFileSync(path.resolve(__dirname, '../fixtures/lookSpec', name), 'utf8')) as LookSpec
const character = () => fixture('synthetic-character.json')

async function makeProject(projectId = 'project-look') {
  const root = await mkdtemp(path.join(tmpdir(), 'writeros-look-payload-'))
  roots.push(root)
  const projectPath = path.join(root, 'Vector Show.writeros')
  await mkdir(projectPath)
  await writeFile(path.join(projectPath, 'project.json'), `${JSON.stringify({
    schemaVersion: 1, projectId, title: 'Vector Show', format: 'feature', createdAt: capturedAt,
    updatedAt: capturedAt, openedAt: capturedAt, sourceImport: null, appVersion: '0.2.0',
  }, null, 2)}\n`, 'utf8')
  return { projectPath, projectId }
}

function lookInput(projectId: string, spec: LookSpec, overrides: Partial<PublishMemoryInput> = {}): PublishMemoryInput {
  const hash = lookHash(spec)
  return {
    projectId,
    dedupeKey: `writeros:look-promote:test-${hash.slice(0, 8)}`,
    kind: 'canon',
    requestedStatus: 'active',
    claim: `Look: ${spec.entity_id}`,
    detail: 'The block as YAML, for agent context.',
    tags: [],
    entities: ['Vector Engineer'],
    source: {
      workflow: 'writeros',
      sourceId: `looks/${spec.entity_kind}/${spec.entity_id}`,
      sourceUri: `writeros:looks/${spec.entity_kind}/${spec.entity_id}`,
      sourceHash: hash,
      capturedAt,
      approval: 'explicit',
    },
    evidence: [],
    safety: 'clear',
    spoiler: spec.spoiler,
    conflictsWith: [],
    supersedes: [],
    supersedesPriorVersions: false,
    payload: { kind: 'look_spec', version: spec.version, spec, lookHash: hash, reference: 'generated-elsewhere' },
    ...overrides,
  }
}

describe('look_spec payload on memory records', () => {
  it('publishes a canon record carrying the payload and keeps it through snapshot, ledger replay and rebuild', async () => {
    const { projectPath, projectId } = await makeProject()
    const store = createProjectMemoryStore()
    const spec = character()
    const result = await store.publish(projectPath, lookInput(projectId, spec))
    expect(result.published).toBe(true)
    expect(result.record.status).toBe('active')
    expect(result.record.payload).toEqual({
      kind: 'look_spec', version: '1.1', spec, lookHash: lookHash(spec), reference: 'generated-elsewhere',
    })

    const onDisk = ProjectMemorySnapshotSchema.parse(JSON.parse(await readFile(path.join(projectPath, 'memory', 'snapshot.json'), 'utf8')))
    expect(onDisk.records[0].payload).toEqual(result.record.payload)

    const replayed = await store.readSnapshot(projectPath)
    expect(replayed.records[0].payload).toEqual(result.record.payload)

    await rm(path.join(projectPath, 'memory', 'snapshot.json'))
    await store.rebuild(projectPath)
    const rebuilt = await store.readSnapshot(projectPath)
    expect(rebuilt.records[0].payload).toEqual(result.record.payload)
  })

  it('carries the reference mode in the snapshot alone, so an export can be regenerated without request state', async () => {
    const { projectPath, projectId } = await makeProject()
    const store = createProjectMemoryStore()
    await store.publish(projectPath, lookInput(projectId, character(), {
      payload: { kind: 'look_spec', version: '1.1', spec: character(), lookHash: lookHash(character()), reference: 'casting-inspiration' },
    }))
    const raw = JSON.parse(await readFile(path.join(projectPath, 'memory', 'snapshot.json'), 'utf8'))
    expect(raw.records[0].payload.reference).toBe('casting-inspiration')
    expect(raw.records[0].payload.spec.reference).toBeUndefined()
  })

  it('refuses a payload whose lookHash does not match its spec', async () => {
    const { projectPath, projectId } = await makeProject()
    const store = createProjectMemoryStore()
    const input = lookInput(projectId, character())
    input.payload = { ...input.payload!, lookHash: 'f'.repeat(64) }
    const error = await store.publish(projectPath, input).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ProjectMemoryStoreError)
    expect((error as ProjectMemoryStoreError).code).toBe('invalid-payload')
  })

  it('refuses a look payload on a record that is not canon, and a version that disagrees with the spec', async () => {
    const { projectPath, projectId } = await makeProject()
    const store = createProjectMemoryStore()
    const notCanon = await store.publish(projectPath, lookInput(projectId, character(), { kind: 'decision' })).catch((caught: unknown) => caught)
    expect((notCanon as ProjectMemoryStoreError).code).toBe('invalid-payload')
    const input = lookInput(projectId, character())
    input.payload = { ...input.payload!, version: '1.0' }
    const wrongVersion = await store.publish(projectPath, input).catch((caught: unknown) => caught)
    expect((wrongVersion as ProjectMemoryStoreError).code).toBe('invalid-payload')
  })

  it('refuses a payload that is not a valid look block', async () => {
    const { projectPath, projectId } = await makeProject()
    const store = createProjectMemoryStore()
    const broken = { ...character(), age_band: 'forty' } as unknown as LookSpec
    const input = lookInput(projectId, broken)
    const error = await store.publish(projectPath, input).catch((caught: unknown) => caught)
    expect((error as ProjectMemoryStoreError).code).toBe('invalid-payload')
  })

  it('treats a ledger line whose payload hash was edited as a corrupt ledger', async () => {
    const { projectPath, projectId } = await makeProject()
    const store = createProjectMemoryStore()
    await store.publish(projectPath, lookInput(projectId, character()))
    const ledgerPath = path.join(projectPath, 'memory', 'ledger.jsonl')
    const lines = (await readFile(ledgerPath, 'utf8')).trim().split('\n')
    const event = JSON.parse(lines[lines.length - 1])
    event.record.payload.spec.hair = 'tampered'
    lines[lines.length - 1] = JSON.stringify(event)
    await writeFile(ledgerPath, `${lines.join('\n')}\n`, 'utf8')
    await rm(path.join(projectPath, 'memory', 'snapshot.json'))
    const error = await store.readSnapshot(projectPath).catch((caught: unknown) => caught)
    expect((error as ProjectMemoryStoreError).code).toBe('corrupt-ledger')
  })

  it('parses a record without a payload exactly as before', () => {
    const record = {
      id: 'mem_x', projectId: 'p', kind: 'canon', status: 'candidate', claim: 'A claim.', tags: [], entities: [],
      source: { workflow: 'writeros', sourceId: 's', sourceUri: 'u', sourceHash: 'h', capturedAt, approval: 'none' },
      evidence: [], safety: 'clear', spoiler: false, supersedes: [], createdAt: capturedAt, updatedAt: capturedAt,
    }
    expect(ProjectMemoryRecordSchema.parse(record)).toEqual(record)
    expect(MemoryPayloadSchema.safeParse({ kind: 'other' }).success).toBe(false)
  })
})

describe('canon.md rendering of a look record', () => {
  it('shows the look line and the block as a YAML fence in place of detail', async () => {
    const { projectPath, projectId } = await makeProject()
    const store = createProjectMemoryStore()
    const spec = character()
    await store.publish(projectPath, lookInput(projectId, spec))
    const canon = await readFile(path.join(projectPath, 'memory', 'canon.md'), 'utf8')
    expect(canon).toContain(`Look — vector-engineer (character) · look_hash ${lookHash(spec).slice(0, 12)}`)
    expect(canon).toContain('```yaml\n')
    expect(canon).toContain('entity_kind: "character"')
    expect(canon).toContain('build:\n  kind: "lean"')
    expect(canon).toContain('continuity_risks:\n  - "hair length drifts between shots"')
    expect(canon).toContain('negative_lines:\n  - "no hat"')
    expect(canon).toContain('depends_on:\n  - writeros_record_id: "mem_')
    expect(canon).toContain('wardrobe_variants:\n  - name: "dress blues"\n    when: "the ceremony"')
    expect(canon).not.toContain('The block as YAML, for agent context.')
    expect(canon).toBe(renderCanonProjection(await store.readSnapshot(projectPath)))
  })

  it('renders empty lists as [] and a backtick run cannot close the fence', async () => {
    const { projectPath, projectId } = await makeProject()
    const store = createProjectMemoryStore()
    const spec = { ...character(), props: ['a ```` fenced ```` prop'], wardrobe_variants: [] } as LookSpec
    await store.publish(projectPath, lookInput(projectId, spec))
    const canon = await readFile(path.join(projectPath, 'memory', 'canon.md'), 'utf8')
    expect(canon).toContain('wardrobe_variants: []')
    expect(canon).toContain('`````yaml\n')
    const fenceLines = canon.split('\n').filter(line => /^`{3,}/.test(line))
    expect(fenceLines).toEqual(['`````yaml', '`````'])
  })
})
