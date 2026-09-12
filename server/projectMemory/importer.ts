import type {
  MemoryWorkflow,
  ProjectMemoryImportCounts,
  PublishMemoryInput,
} from '../../shared/projectMemory'
import { createHash } from 'node:crypto'
import { constants, type BigIntStats } from 'node:fs'
import { lstat, open } from 'node:fs/promises'
import { guardExistingPath } from './safePaths'

export interface ImportPreview {
  source: MemoryWorkflow
  projectId: string
  records: PublishMemoryInput[]
  warnings: string[]
  duplicates: number
  counts: ProjectMemoryImportCounts
  /**
   * Wayfinder only: every markdown filename seen under tickets/ and
   * resolved/ (as `tickets/<name>` / `resolved/<name>`), whether or not it
   * imported. Lets the CLI tell "the open ticket is gone" from "the open
   * ticket was skipped".
   */
  ticketFiles?: string[]
  /** Wayfinder only: normalized Question text per `resolved/<name>` file. */
  ticketQuestions?: Record<string, string>
}

export interface MemorySourceAdapter {
  preview(input: {
    projectId: string
    sourceRoot: string
    linkedSourceId?: string
  }): Promise<ImportPreview>
}

export class ProjectMemoryImportInputError extends Error {
  readonly name = 'ProjectMemoryImportInputError'
  readonly code = 'ERR_PROJECT_MEMORY_IMPORT_INPUT'
}

const MAX_IMPORT_SOURCE_BYTES = 1_000_000

function sameImportFileState(left: BigIntStats, right: BigIntStats): boolean {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.size === right.size
    && left.ctimeNs === right.ctimeNs
    && left.mtimeNs === right.mtimeNs
}

export async function readImportSource(
  filePath: string,
  options: { afterRead?: () => Promise<void> } = {},
): Promise<{
  text: string
  sourceHash: string
}> {
  const source = await guardExistingPath(filePath, 'file')
  const before = await lstat(source.path, { bigint: true })
  if (!before.isFile() || before.isSymbolicLink() || before.size > BigInt(MAX_IMPORT_SOURCE_BYTES)) {
    throw new ProjectMemoryImportInputError('Import source file is not a bounded regular file.')
  }
  const handle = await open(source.path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const opened = await handle.stat({ bigint: true })
    if (!opened.isFile() || !sameImportFileState(opened, before)) {
      throw new ProjectMemoryImportInputError('Import source file changed while opening.')
    }
    const buffer = Buffer.alloc(MAX_IMPORT_SOURCE_BYTES + 1)
    let offset = 0
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset)
      if (bytesRead === 0) break
      offset += bytesRead
    }
    await options.afterRead?.()
    await source.verify()
    const after = await handle.stat({ bigint: true })
    if (
      !after.isFile()
      || !sameImportFileState(after, opened)
      || BigInt(offset) !== opened.size
      || BigInt(offset) !== after.size
      || offset > MAX_IMPORT_SOURCE_BYTES
      || after.size > BigInt(MAX_IMPORT_SOURCE_BYTES)
    ) {
      throw new ProjectMemoryImportInputError('Import source file is not stable and bounded.')
    }
    const rawBytes = buffer.subarray(0, offset)
    const sourceHash = createHash('sha256').update(rawBytes).digest('hex')
    if (rawBytes.length >= 3 && rawBytes[0] === 0xef && rawBytes[1] === 0xbb && rawBytes[2] === 0xbf) {
      throw new ProjectMemoryImportInputError('Import source file must not contain a UTF-8 BOM.')
    }
    try {
      return {
        text: new TextDecoder('utf-8', { fatal: true }).decode(rawBytes),
        sourceHash,
      }
    } catch {
      throw new ProjectMemoryImportInputError('Import source file is not valid UTF-8.')
    }
  } finally {
    await handle.close()
  }
}

export function buildImportCounts(
  records: readonly PublishMemoryInput[],
  duplicates: number,
): ProjectMemoryImportCounts {
  return {
    activeCanon: records.filter(record => (
      record.kind === 'canon' && record.requestedStatus === 'active'
    )).length,
    candidates: records.filter(record => record.requestedStatus === 'candidate').length,
    development: records.filter(record => record.kind === 'development').length,
    openQuestions: records.filter(record => record.kind === 'open_question').length,
    conflicts: records.reduce((total, record) => (
      total
      + (record.conflictsWith?.length ?? 0)
      + (record.tags?.includes('memory:conflict') ? 1 : 0)
    ), 0),
    duplicates,
    flagged: records.filter(record => record.safety === 'flagged').length,
  }
}

const IMPERATIVE_PATTERNS = [
  /@\w+/i,
  /\bignore (all |any )?(previous|prior|above)\b/i,
  /\byou (must|should|will) now\b/i,
  /\bsystem prompt\b/i,
  /\bnew instructions?\b/i,
]

export function promptInjectionLine(content: string): number | undefined {
  const lines = content.replace(/\r\n?/g, '\n').split('\n')
  const index = lines.findIndex(line => IMPERATIVE_PATTERNS.some(pattern => pattern.test(line)))
  return index < 0 ? undefined : index + 1
}

export function truncateImportText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value
  let truncated = value.slice(0, maxLength)
  if (/[\uD800-\uDBFF]$/.test(truncated)) truncated = truncated.slice(0, -1)
  return truncated
}

function finalizePreview(preview: ImportPreview): ImportPreview {
  const seen = new Set<string>()
  const records = preview.records.filter(record => {
    const key = `${record.source.workflow}\0${record.source.sourceId}\0${record.source.sourceHash}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  const duplicates = preview.duplicates + (preview.records.length - records.length)
  return {
    ...preview,
    records,
    duplicates,
    counts: buildImportCounts(records, duplicates),
  }
}

export async function previewProjectMemoryImport(_input: {
  source: 'wayfinder' | 'pitchstudio' | 'buzz'
  projectId: string
  sourceRoot: string
  linkedSourceId?: string
}): Promise<ImportPreview> {
  const source = await guardExistingPath(_input.sourceRoot, 'directory')
  const input = { ..._input, sourceRoot: source.path }
  let preview: ImportPreview
  if (_input.source === 'wayfinder') {
    const { wayfinderMemorySourceAdapter } = await import('./adapters/wayfinder')
    preview = await wayfinderMemorySourceAdapter.preview(input)
  } else if (_input.source === 'pitchstudio') {
    const { pitchStudioMemorySourceAdapter } = await import('./adapters/pitchStudio')
    preview = await pitchStudioMemorySourceAdapter.preview(input)
  } else if (_input.source === 'buzz') {
    const { buzzMemorySourceAdapter } = await import('./adapters/buzz')
    preview = await buzzMemorySourceAdapter.preview(input)
  } else {
    return undefined as never
  }
  await source.verify()
  return finalizePreview(preview)
}
