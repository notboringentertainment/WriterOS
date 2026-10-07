// server/morganHost/repoRoot.ts
// The WriterOS folder: two levels up from server/morganHost/ under tsx, one level up from dist/ in production.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export function writerosRoot(fromUrl: string = import.meta.url): string {
  let dir = path.dirname(fileURLToPath(fromUrl))
  for (let i = 0; i < 6; i++) {
    const pkg = path.join(dir, 'package.json')
    if (existsSync(pkg) && existsSync(path.join(dir, 'mod', 'writeros-morgan'))) return dir
    dir = path.dirname(dir)
  }
  throw new Error('WriterOS folder not found from ' + fromUrl)
}

