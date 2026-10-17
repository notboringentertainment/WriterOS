import { execFile } from 'node:child_process'
import path from 'node:path'
import { writerosRoot } from '../morganHost/repoRoot'

/**
 * The canon import Morgan's instructions describe (`npm run memory -- import --source wayfinder ... --apply`),
 * run by WriterOS itself. Callers decide what counts as the writer's approval.
 */
export function importWayfinderCanon(packagePath: string, storyDriveRoot: string): Promise<void> {
  const root = writerosRoot()
  const args = [path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs'), path.join(root, 'server', 'projectMemory', 'cli.ts'),
    'import', '--source', 'wayfinder', '--project', packagePath, '--from', storyDriveRoot, '--apply']
  return new Promise((resolve, reject) => {
    execFile(process.execPath, args, { cwd: root, timeout: 120_000 }, (error, _stdout, stderr) => {
      if (error) reject(Object.assign(error, { stderr })); else resolve()
    })
  })
}
