import { randomBytes } from 'node:crypto'
import { lstat, realpath } from 'node:fs/promises'
import path from 'node:path'

export interface ProjectLibraryConfig {
  enabled: boolean
  rootPath: string | null
  label: string | null
  allowedOrigins: ReadonlySet<string>
  sessionToken: string
}

function loopbackOrigins(port: string): ReadonlySet<string> {
  return new Set([
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
    `http://[::1]:${port}`,
  ])
}

export async function loadProjectLibraryConfig(
  env: NodeJS.ProcessEnv,
): Promise<ProjectLibraryConfig> {
  const sessionToken = randomBytes(32).toString('base64url')
  const allowedOrigins = loopbackOrigins(env.PORT || '5000')
  const configuredRoot = env.WRITEROS_PROJECTS_ROOT?.trim()

  if (!configuredRoot) {
    return {
      enabled: false,
      rootPath: null,
      label: null,
      allowedOrigins,
      sessionToken,
    }
  }

  if (!path.isAbsolute(configuredRoot)) {
    throw new Error('WRITEROS_PROJECTS_ROOT must be an absolute directory path.')
  }

  const rootStats = await lstat(configuredRoot)
  if (!rootStats.isDirectory()) {
    throw new Error('WRITEROS_PROJECTS_ROOT must point to a directory.')
  }

  const rootPath = await realpath(configuredRoot)
  return {
    enabled: true,
    rootPath,
    label: path.basename(rootPath),
    allowedOrigins,
    sessionToken,
  }
}
