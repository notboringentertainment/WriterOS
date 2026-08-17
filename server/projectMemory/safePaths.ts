import { lstat, realpath, stat } from 'node:fs/promises'
import path from 'node:path'

export class UnsafeProjectMemoryPathError extends Error {
  readonly name = 'UnsafeProjectMemoryPathError'
}

type ExpectedPathKind = 'directory' | 'file'

interface PathComponentIdentity {
  path: string
  dev: number
  ino: number
  symbolicLink: boolean
}

export interface SafeExistingPath {
  readonly path: string
  readonly canonicalPath: string
  verify(): Promise<void>
}

function componentsFor(absolutePath: string): string[] {
  const root = path.parse(absolutePath).root
  const relative = path.relative(root, absolutePath)
  const segments = relative === '' ? [] : relative.split(path.sep)
  const components = [root]
  for (const segment of segments) {
    components.push(path.join(components.at(-1) as string, segment))
  }
  return components
}

async function isAllowedPlatformRootAlias(component: string, index: number): Promise<boolean> {
  if (process.platform !== 'darwin' || index !== 1) return false
  if (!['/etc', '/tmp', '/var'].includes(component)) return false
  try {
    return await realpath(component) === `/private${component}`
  } catch {
    return false
  }
}

async function captureComponents(absolutePath: string): Promise<PathComponentIdentity[]> {
  const identities: PathComponentIdentity[] = []
  for (const [index, component] of componentsFor(absolutePath).entries()) {
    const stats = await lstat(component)
    const symbolicLink = stats.isSymbolicLink()
    if (symbolicLink && !await isAllowedPlatformRootAlias(component, index)) {
      throw new UnsafeProjectMemoryPathError('The path contains a symbolic-link component.')
    }
    identities.push({
      path: component,
      dev: stats.dev,
      ino: stats.ino,
      symbolicLink,
    })
  }
  return identities
}

function matchesExpectedKind(
  kind: ExpectedPathKind,
  stats: Awaited<ReturnType<typeof lstat>>,
): boolean {
  return kind === 'directory' ? stats.isDirectory() : stats.isFile()
}

async function assertExpectedKind(absolutePath: string, kind: ExpectedPathKind): Promise<void> {
  const stats = await lstat(absolutePath)
  if (stats.isSymbolicLink()) {
    const componentIndex = componentsFor(absolutePath).length - 1
    if (
      await isAllowedPlatformRootAlias(absolutePath, componentIndex)
      && matchesExpectedKind(kind, await stat(absolutePath))
    ) {
      return
    }
  } else if (matchesExpectedKind(kind, stats)) {
    return
  }
  throw new UnsafeProjectMemoryPathError(`The path must identify a real ${kind}.`)
}

/**
 * Captures every existing path component so callers can reject both symbolic-link
 * ancestors and a rename/swap before a later filesystem operation.
 */
export async function guardExistingPath(
  inputPath: string,
  kind: ExpectedPathKind,
): Promise<SafeExistingPath> {
  const absolutePath = path.resolve(inputPath)
  const identities = await captureComponents(absolutePath)
  await assertExpectedKind(absolutePath, kind)
  const canonicalPath = await realpath(absolutePath)

  return {
    path: absolutePath,
    canonicalPath,
    async verify() {
      const current = await captureComponents(absolutePath)
      if (
        current.length !== identities.length
        || current.some((identity, index) => {
          const original = identities[index]
          return original === undefined
            || identity.dev !== original.dev
            || identity.ino !== original.ino
            || identity.symbolicLink !== original.symbolicLink
        })
        || await realpath(absolutePath) !== canonicalPath
      ) {
        throw new UnsafeProjectMemoryPathError('The path changed during the operation.')
      }
      await assertExpectedKind(absolutePath, kind)
    },
  }
}
