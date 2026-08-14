import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  guardExistingPath,
  UnsafeProjectMemoryPathError,
} from '../../server/projectMemory/safePaths'

const temporaryPaths: string[] = []

afterEach(async () => {
  await Promise.all(temporaryPaths.splice(0).map(value => rm(value, { recursive: true, force: true })))
})

describe('project memory safe path guard', () => {
  it('allows approved immutable platform root aliases as real directories', async () => {
    for (const approvedPath of ['/tmp', '/var', '/etc']) {
      const guarded = await guardExistingPath(approvedPath, 'directory')

      expect(guarded.path).toBe(approvedPath)
      await expect(guarded.verify()).resolves.toBeUndefined()
    }
  })

  it('rejects a symbolic-link component beneath an approved root alias', async () => {
    const root = await mkdtemp(path.join('/tmp', 'writeros-safe-path-'))
    temporaryPaths.push(root)
    const realDirectory = path.join(root, 'real-directory')
    const linkedDirectory = path.join(root, 'linked-directory')
    await mkdir(realDirectory)
    await symlink(realDirectory, linkedDirectory)

    await expect(guardExistingPath(linkedDirectory, 'directory'))
      .rejects.toBeInstanceOf(UnsafeProjectMemoryPathError)
  })
})
