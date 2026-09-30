import { mkdtemp, mkdir, readFile, readdir, rm, stat, symlink, writeFile, rename } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defaultProjectState } from '../../client/src/lib/projectState'
import { serializeWriterOSProjectPackage } from '../../client/src/lib/projectPackage'
import { acquirePackageWriteLock } from '../../server/projectLibrary/packageLock'
import { writeStoryDriveLink } from '../../server/projectLibrary/storyDriveLinks'
import { syncBeatSheet, planBeatUnits, type BeatSheetSyncOptions } from '../../server/projectMemory/beatSheetSync'
import type { OutlineDocumentContent } from '../../shared/documents'

const roots: string[] = []
const FIXTURE = path.resolve(__dirname, '../fixtures/beatSheet/synthetic-beat-sheet.md')
const PROJECT_ID = 'proj-abcd1234'
const DECISION = 'wayfinder/resolved/synthetic-beat-sheet.md'

let workspace: string
let drive: string
let packagePath: string
let opts: BeatSheetSyncOptions

async function tmp(label: string) {
  const dir = await mkdtemp(path.join(tmpdir(), label))
  roots.push(dir)
  return dir
}

async function snapshotTree(dir: string, base = dir): Promise<Record<string, { bytes: string; mtimeMs: number }>> {
  const out: Record<string, { bytes: string; mtimeMs: number }> = {}
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) Object.assign(out, await snapshotTree(full, base))
    else if (!entry.name.endsWith('.lock')) out[path.relative(base, full)] = { bytes: await readFile(full, 'utf8'), mtimeMs: (await stat(full)).mtimeMs }
  }
  return out
}

const outlinePath = () => path.join(packagePath, 'documents/outline.json')
const readOutline = async () => JSON.parse(await readFile(outlinePath(), 'utf8'))

beforeEach(async () => {
  workspace = await tmp('writeros-sync-ws-')
  drive = await tmp('writeros-sync-drive-')
  packagePath = path.join(workspace, 'Show (abcd1234).writeros')
  const state = defaultProjectState()
  const pkg = serializeWriterOSProjectPackage({
    id: PROJECT_ID, createdAt: Date.parse('2026-05-01T10:00:00.000Z'), updatedAt: Date.parse('2026-05-02T10:00:00.000Z'), state,
  })
  for (const [rel, contents] of Object.entries(pkg.files)) {
    await mkdir(path.dirname(path.join(packagePath, rel)), { recursive: true })
    await writeFile(path.join(packagePath, rel), contents, 'utf8')
  }
  await mkdir(path.join(drive, 'wayfinder/resolved'), { recursive: true })
  await mkdir(path.join(drive, 'wayfinder/tickets'), { recursive: true })
  await writeFile(path.join(drive, DECISION), await readFile(FIXTURE, 'utf8'), 'utf8')
  await writeStoryDriveLink(workspace, PROJECT_ID, { root: drive })
  opts = { workspaceRoot: workspace, packagePath, projectId: PROJECT_ID }
})

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('syncBeatSheet', () => {
  it('reports not-linked when the registry has no entry', async () => {
    const result = await syncBeatSheet({ ...opts, projectId: 'someone-else' })
    expect(result).toEqual({ status: { kind: 'not-linked' } })
  })

  it('reports no-beat-sheet when nothing is declared and no pointer is set', async () => {
    await writeFile(path.join(drive, DECISION), '# Other\ntype: grill\nresolved: 2026-01-12\n\n## Answer\nx\n', 'utf8')
    const before = await readFile(outlinePath(), 'utf8')
    expect((await syncBeatSheet(opts)).status.kind).toBe('no-beat-sheet')
    expect(await readFile(outlinePath(), 'utf8')).toBe(before)
  })

  it('finds a declared decision by header and writes units keyed by title', async () => {
    const result = await syncBeatSheet(opts)
    expect(result.status.kind).toBe('updated')
    expect(result.outline?.content.units.map(u => u.id)).toEqual(['beat.cold-open-the-harbour', 'beat.the-dinner', 'beat.the-second-dinner'])
    const onDisk = await readOutline()
    expect(onDisk).toEqual(result.outline)
    expect(onDisk.content.units[0].actOrSequence).toBe('Movement one — Arrival')
    expect(onDisk.content.beatSheetSource.ticket).toBe('resolved/synthetic-beat-sheet.md')
    expect(onDisk.revision).toBe(1)
  })

  it('is a no-op with zero writes when the file hash is unchanged', async () => {
    await syncBeatSheet(opts)
    const before = await snapshotTree(workspace)
    const result = await syncBeatSheet(opts)
    expect(result.status.kind).toBe('unchanged')
    expect(result.outline).toBeUndefined()
    expect(await snapshotTree(workspace)).toEqual(before)
  })

  it('writes only documents/outline.json on an update', async () => {
    const beforePackage = await snapshotTree(packagePath)
    const beforeDrive = await snapshotTree(drive)
    const beforeWorkspace = await snapshotTree(workspace)
    await syncBeatSheet(opts)
    const afterWorkspace = await snapshotTree(workspace)
    const changed = Object.keys(afterWorkspace).filter(k => JSON.stringify(afterWorkspace[k]) !== JSON.stringify(beforeWorkspace[k]))
    const outlineRel = path.relative(workspace, outlinePath())
    expect(changed).toEqual([outlineRel])
    expect(Object.keys(await snapshotTree(packagePath)).sort()).toEqual(Object.keys(beforePackage).sort())
    expect(await snapshotTree(drive)).toEqual(beforeDrive)
  })

  it('uses the pointer for a legacy decision without a header', async () => {
    const legacy = (await readFile(FIXTURE, 'utf8')).replace(/^beat-sheet:.*\n/m, '')
    await writeFile(path.join(drive, DECISION), legacy, 'utf8')
    expect((await syncBeatSheet(opts)).status.kind).toBe('no-beat-sheet')
    await writeStoryDriveLink(workspace, PROJECT_ID, { root: drive, beatSheet: 'resolved/synthetic-beat-sheet.md' })
    const result = await syncBeatSheet(opts)
    expect(result.status.kind).toBe('updated')
    expect(result.outline?.content.units).toHaveLength(3)
  })

  it('leaves beats untouched and reports malformed when Playing order is missing', async () => {
    await writeFile(path.join(drive, DECISION), (await readFile(FIXTURE, 'utf8')).replace('### Playing order', '### Something else'), 'utf8')
    const before = await readFile(outlinePath(), 'utf8')
    const result = await syncBeatSheet(opts)
    expect(result.status.kind).toBe('malformed')
    expect(await readFile(outlinePath(), 'utf8')).toBe(before)
  })

  it('leaves beats untouched and reports malformed naming the title when two beats share a title', async () => {
    const dup = (await readFile(FIXTURE, 'utf8')).replace('**The second dinner.**', '**The dinner.**')
    await writeFile(path.join(drive, DECISION), dup, 'utf8')
    const before = await readFile(outlinePath(), 'utf8')
    const result = await syncBeatSheet(opts)
    expect(result.status.kind).toBe('malformed')
    if (result.status.kind === 'malformed') expect(result.status.message).toContain('The dinner')
    expect(await readFile(outlinePath(), 'utf8')).toBe(before)
  })

  it('leaves beats untouched and reports unavailable when the file is missing', async () => {
    await syncBeatSheet(opts)
    const before = await readFile(outlinePath(), 'utf8')
    await writeStoryDriveLink(workspace, PROJECT_ID, { root: drive, beatSheet: 'resolved/gone.md' })
    const result = await syncBeatSheet(opts)
    expect(result.status.kind).toBe('unavailable')
    expect(await readFile(outlinePath(), 'utf8')).toBe(before)
  })

  it('reports unavailable when the registry root is a symlink or does not exist', async () => {
    const link = path.join(await tmp('writeros-sync-link-'), 'drive-link')
    await symlink(drive, link)
    await writeStoryDriveLink(workspace, PROJECT_ID, { root: link })
    expect((await syncBeatSheet(opts)).status.kind).toBe('unavailable')
    await writeStoryDriveLink(workspace, PROJECT_ID, { root: path.join(drive, 'nope') })
    expect((await syncBeatSheet(opts)).status.kind).toBe('unavailable')
  })

  it('reports reopened when the pointed file moved to tickets/', async () => {
    await rename(path.join(drive, DECISION), path.join(drive, 'wayfinder/tickets/synthetic-beat-sheet.md'))
    await writeStoryDriveLink(workspace, PROJECT_ID, { root: drive, beatSheet: 'resolved/synthetic-beat-sheet.md' })
    expect((await syncBeatSheet(opts)).status.kind).toBe('reopened')
  })

  it('reports reopened when a header-declared decision that was synced moves to tickets/', async () => {
    expect((await syncBeatSheet(opts)).status.kind).toBe('updated')
    await rename(path.join(drive, DECISION), path.join(drive, 'wayfinder/tickets/synthetic-beat-sheet.md'))
    const before = await readFile(outlinePath(), 'utf8')
    const result = await syncBeatSheet(opts)
    expect(result.status).toMatchObject({ kind: 'reopened', ticket: 'resolved/synthetic-beat-sheet.md' })
    expect(await readFile(outlinePath(), 'utf8')).toBe(before)
  })

  it('reports no-beat-sheet (not reopened) when nothing was ever synced and nothing is declared', async () => {
    await rename(path.join(drive, DECISION), path.join(drive, 'wayfinder/tickets/synthetic-beat-sheet.md'))
    expect((await syncBeatSheet(opts)).status.kind).toBe('no-beat-sheet')
  })

  it('gives a fixed plain sentence for a missing pointed file, never a path', async () => {
    await writeStoryDriveLink(workspace, PROJECT_ID, { root: drive, beatSheet: 'resolved/gone.md' })
    const result = await syncBeatSheet(opts)
    expect(result.status).toEqual({ kind: 'unavailable', ticket: 'resolved/gone.md', message: 'Story-drive file not found.' })
  })

  it('reports ambiguous when two resolved files declare beat-sheet', async () => {
    await writeFile(path.join(drive, 'wayfinder/resolved/second.md'), await readFile(FIXTURE, 'utf8'), 'utf8')
    const before = await readFile(outlinePath(), 'utf8')
    expect((await syncBeatSheet(opts)).status.kind).toBe('ambiguous')
    expect(await readFile(outlinePath(), 'utf8')).toBe(before)
  })

  it('keeps WriterOS-side unit fields (draftNotes, linkedSceneIds) across a re-sync of the same key', async () => {
    await syncBeatSheet(opts)
    const doc = await readOutline()
    doc.content.units[1].draftNotes = 'keep me'
    doc.content.units[1].linkedSceneIds = ['scene-1']
    doc.content.units[1].location = 'Kitchen'
    doc.content.units[1].characters = ['Someone']
    doc.content.units[1].conflict = 'C'
    doc.content.units[1].turn = 'T'
    doc.content.units[1].consequence = 'Q'
    doc.content.units[1].whyNext = 'W'
    doc.content.units[1].aiProduction = { productionDifficulty: 'd', requiredReferences: 'r', continuityRisks: 'c', promptNotes: 'p', assetStatus: 'a' }
    await writeFile(outlinePath(), JSON.stringify(doc, null, 2), 'utf8')
    await writeFile(path.join(drive, DECISION), `${await readFile(FIXTURE, 'utf8')}\n`, 'utf8')
    const result = await syncBeatSheet(opts)
    expect(result.status.kind).toBe('updated')
    const unit = result.outline!.content.units[1]
    expect(unit).toMatchObject({ id: 'beat.the-dinner', draftNotes: 'keep me', linkedSceneIds: ['scene-1'], location: 'Kitchen', characters: ['Someone'], conflict: 'C', turn: 'T', consequence: 'Q', whyNext: 'W', aiProduction: doc.content.units[1].aiProduction })
  })

  it('refuses a symlinked decision file under resolved/', async () => {
    const outside = path.join(await tmp('writeros-sync-outside-'), 'secret.md')
    await writeFile(outside, await readFile(FIXTURE, 'utf8'), 'utf8')
    await rm(path.join(drive, DECISION))
    await symlink(outside, path.join(drive, 'wayfinder/resolved/x.md'))
    const before = await readFile(outlinePath(), 'utf8')
    expect((await syncBeatSheet(opts)).status.kind).toBe('unavailable')
    await writeStoryDriveLink(workspace, PROJECT_ID, { root: drive, beatSheet: 'resolved/x.md' })
    expect((await syncBeatSheet(opts)).status.kind).toBe('unavailable')
    expect(await readFile(outlinePath(), 'utf8')).toBe(before)
  })

  it('refuses a symlinked resolved/ directory', async () => {
    const outsideDir = await tmp('writeros-sync-outdir-')
    await writeFile(path.join(outsideDir, 'a.md'), await readFile(FIXTURE, 'utf8'), 'utf8')
    await rm(path.join(drive, 'wayfinder/resolved'), { recursive: true })
    await symlink(outsideDir, path.join(drive, 'wayfinder/resolved'))
    const before = await readFile(outlinePath(), 'utf8')
    expect((await syncBeatSheet(opts)).status.kind).toBe('unavailable')
    expect(await readFile(outlinePath(), 'utf8')).toBe(before)
  })

  it('uses the pointer without scanning even when two resolved files declare beat-sheet', async () => {
    await writeFile(path.join(drive, 'wayfinder/resolved/second.md'), await readFile(FIXTURE, 'utf8'), 'utf8')
    await writeStoryDriveLink(workspace, PROJECT_ID, { root: drive, beatSheet: 'resolved/synthetic-beat-sheet.md' })
    let scanned = false
    const result = await syncBeatSheet({ ...opts, readdir: async () => { scanned = true; return [] } })
    expect(result.status.kind).toBe('updated')
    expect(scanned).toBe(false)
  })

  it('reports added/removed/changed keys when the file changes', async () => {
    await syncBeatSheet(opts)
    const edited = (await readFile(FIXTURE, 'utf8'))
      .replace('Same table, different guest.', 'Same table, a different guest arrives.')
      .replace(/2\. \*\*The dinner\.\*\*[^]*?\n\n\*\*Movement two/, '2. **The letter.** A letter comes.\n\n**Movement two')
    await writeFile(path.join(drive, DECISION), edited, 'utf8')
    const result = await syncBeatSheet(opts)
    expect(result.status).toMatchObject({
      kind: 'updated', added: ['beat.the-letter'], removed: ['beat.the-dinner'], changed: ['beat.the-second-dinner'],
    })
  })

  it('dry run (write:false) reports updated, returns no outline, writes nothing', async () => {
    const before = await snapshotTree(workspace)
    const result = await syncBeatSheet({ ...opts, write: false })
    expect(result.status.kind).toBe('updated')
    expect(result.outline).toBeUndefined()
    expect(await snapshotTree(workspace)).toEqual(before)
  })

  it('times out on the decision read and reports unavailable', async () => {
    const { readFile: fsReadFile } = await import('node:fs/promises')
    const result = await syncBeatSheet({
      ...opts, timeoutMs: 1,
      readFile: (p) => p.endsWith('.md') ? new Promise(() => {}) : fsReadFile(p, 'utf8'),
    })
    expect(result.status).toMatchObject({ kind: 'unavailable', message: 'Story-drive did not answer in time.' })
  })

  it('times out during the resolved/ scan (no pointer, stalled readdir) and reports unavailable within the budget', async () => {
    const started = Date.now()
    const result = await syncBeatSheet({ ...opts, timeoutMs: 50, readdir: () => new Promise(() => {}) })
    expect(result.status.kind).toBe('unavailable')
    expect(Date.now() - started).toBeLessThan(1000)
  })

  it('reads Story-drive only under the canonical path (registry root via a symlinked parent -> unavailable)', async () => {
    const holder = await tmp('writeros-sync-holder-')
    const linkedParent = path.join(holder, 'parent-link')
    await symlink(path.dirname(drive), linkedParent)
    await writeStoryDriveLink(workspace, PROJECT_ID, { root: path.join(linkedParent, path.basename(drive)) })
    const before = await readFile(outlinePath(), 'utf8')
    expect((await syncBeatSheet(opts)).status.kind).toBe('unavailable')
    expect(await readFile(outlinePath(), 'utf8')).toBe(before)
  })

  it('holds the package lock for the whole sync (a concurrent acquire waits until the sync returns)', async () => {
    let releaseRead!: () => void
    const gate = new Promise<void>(resolve => { releaseRead = resolve })
    const { readFile: fsReadFile } = await import('node:fs/promises')
    let reading!: () => void
    const readingStarted = new Promise<void>(resolve => { reading = resolve })
    const sync = syncBeatSheet({
      ...opts, timeoutMs: 5000,
      readFile: async (p) => { if (p.endsWith('.md')) { reading(); await gate } return fsReadFile(p, 'utf8') },
    })
    await readingStarted
    let acquired = false
    const other = acquirePackageWriteLock({ workspaceRoot: workspace, projectId: PROJECT_ID }).then(lock => { acquired = true; return lock })
    await new Promise(resolve => setTimeout(resolve, 150))
    expect(acquired).toBe(false)
    releaseRead()
    const result = await sync
    expect(result.status.kind).toBe('updated')
    await (await other).release()
    expect(acquired).toBe(true)
  })
})

describe('planBeatUnits', () => {
  it('drops units that are not in the new set', () => {
    const content = { units: [{ id: 'beat.old', number: 1, actOrSequence: '', title: 'Old', location: '', characters: [], whatHappens: '', conflict: '', turn: '', consequence: '', whyNext: '', linkedSceneIds: [], draftNotes: '' }] } as unknown as OutlineDocumentContent
    const plan = planBeatUnits(content, [{ key: 'beat.new', number: 1, title: 'New', body: 'b', movement: 'm' }])
    expect(plan.units.map(u => u.id)).toEqual(['beat.new'])
    expect(plan.removed).toEqual(['beat.old'])
    expect(plan.added).toEqual(['beat.new'])
  })
})
