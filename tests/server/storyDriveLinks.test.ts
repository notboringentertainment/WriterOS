import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  STORY_DRIVE_LINKS_FILE,
  StoryDriveLinksError,
  readStoryDriveLinks,
  writeStoryDriveLink,
} from '../../server/projectLibrary/storyDriveLinks'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})
async function tmp() {
  const dir = await mkdtemp(path.join(tmpdir(), 'writeros-links-'))
  roots.push(dir)
  return dir
}

describe('story-drive link registry', () => {
  it('reads an empty registry when the file is missing', async () => {
    expect(await readStoryDriveLinks(await tmp())).toEqual({ version: 1, links: {} })
  })

  it('writes atomically and reports changed=false on an identical second write', async () => {
    const root = await tmp()
    const link = { root: '/somewhere/drive', beatSheet: 'resolved/pilot.md' as const }
    expect(await writeStoryDriveLink(root, 'proj-1', link)).toEqual({ changed: true })
    const first = await readFile(path.join(root, STORY_DRIVE_LINKS_FILE), 'utf8')
    expect(await writeStoryDriveLink(root, 'proj-1', link)).toEqual({ changed: false })
    expect(await readFile(path.join(root, STORY_DRIVE_LINKS_FILE), 'utf8')).toBe(first)
    expect((await readStoryDriveLinks(root)).links['proj-1']).toEqual(link)
    expect((await readdir(root)).filter(name => name.endsWith('.tmp'))).toEqual([])
  })

  it('rejects a beatSheet outside resolved/ and a malformed registry file', async () => {
    const root = await tmp()
    await expect(writeStoryDriveLink(root, 'proj-1', { root: '/x', beatSheet: '../secret.md' } as never)).rejects.toThrow()
    await expect(writeStoryDriveLink(root, 'proj-1', { root: '/x', beatSheet: 'tickets/a.md' } as never)).rejects.toThrow()
    await writeFile(path.join(root, STORY_DRIVE_LINKS_FILE), '{"version":2}', 'utf8')
    await expect(readStoryDriveLinks(root)).rejects.toBeInstanceOf(StoryDriveLinksError)
    await writeFile(path.join(root, STORY_DRIVE_LINKS_FILE), 'not json', 'utf8')
    await expect(readStoryDriveLinks(root)).rejects.toBeInstanceOf(StoryDriveLinksError)
  })

  it('two concurrent writes for different projects both survive', async () => {
    const root = await tmp()
    await Promise.all([
      writeStoryDriveLink(root, 'proj-a', { root: '/a' }),
      writeStoryDriveLink(root, 'proj-b', { root: '/b' }),
    ])
    expect((await readStoryDriveLinks(root)).links).toEqual({ 'proj-a': { root: '/a' }, 'proj-b': { root: '/b' } })
  })
})
