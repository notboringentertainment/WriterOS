import { createHash } from 'node:crypto'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import type { PublishMemoryInput } from '../../../shared/projectMemory'
import { UnsafeProjectMemoryPathError } from '../safePaths'
import {
  buildImportCounts,
  ProjectMemoryImportInputError,
  promptInjectionLine,
  readImportSource,
  truncateImportText,
  type ImportPreview,
  type MemorySourceAdapter,
} from '../importer'

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function parseTicket(content: string): {
  title: string
  headers: Map<string, string>
  sections: Map<string, string>
} {
  const lines = content.replace(/\r\n?/g, '\n').split('\n')
  const title = /^#\s+(.+?)\s*$/.exec(lines[0] ?? '')?.[1] ?? ''
  const headers = new Map<string, string>()
  let index = 1
  while (index < lines.length) {
    const line = lines[index] ?? ''
    if (line.trim() === '') {
      index += 1
      if (headers.size > 0) break
      continue
    }
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line)
    if (!match) break
    headers.set(match[1].toLowerCase(), match[2].trim())
    index += 1
  }

  const sections = new Map<string, string>()
  let heading: string | undefined
  let body: string[] = []
  const save = () => {
    if (heading) sections.set(heading, body.join('\n').trim())
  }
  for (; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    const match = /^##\s+(.+?)\s*$/.exec(line)
    if (match) {
      save()
      heading = match[1]
      body = []
    } else if (heading) {
      body.push(line)
    }
  }
  save()
  return { title, headers, sections }
}

function capturedAt(value: string | undefined): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value ?? '')
    ? `${value}T00:00:00.000Z`
    : '1970-01-01T00:00:00.000Z'
}

async function listMarkdown(directory: string): Promise<{ exists: boolean; files: string[] }> {
  try {
    const entries = await readdir(directory, { withFileTypes: true })
    if (entries.some(entry => entry.isSymbolicLink())) {
      throw new UnsafeProjectMemoryPathError('The source contains a symbolic link.')
    }
    return {
      exists: true,
      files: entries
        .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
        .map(entry => entry.name)
        .sort(),
    }
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return { exists: false, files: [] }
    }
    throw error
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isSafeLegacyAtomId(value: string): boolean {
  if (value !== value.trim() || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value)) return false
  if (!value.includes(':')) return true
  const segments = value.split(':')
  return segments[0] === 'atom'
    && segments.length >= 3
    && segments.slice(1).every(segment => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(segment))
}

function isSafeLegacySourceLocator(value: string): boolean {
  if (!value || value.length > 500 || value !== value.trim()) return false
  if (/[\\?%\u0000-\u001f\u007f]/.test(value)) return false
  const parts = value.split('#')
  if (parts.length > 2) return false
  const [relativePath, fragment] = parts
  if (!relativePath) return false
  const segments = relativePath.split('/')
  if (segments.some(segment => !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(segment))) return false
  return fragment === undefined || /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(fragment)
}

async function rootMetadata(sourceRoot: string): Promise<{ canonNotes: string[]; hasToDelete: boolean }> {
  const entries = await readdir(sourceRoot, { withFileTypes: true })
  if (entries.some(entry => entry.isSymbolicLink())) {
    throw new UnsafeProjectMemoryPathError('The source contains a symbolic link.')
  }
  return {
    canonNotes: entries
      .filter(entry => entry.isFile() && / Canon Note\.md$/i.test(entry.name))
      .map(entry => entry.name)
      .sort(),
    hasToDelete: entries.some(entry => entry.isDirectory() && entry.name === '_to_delete'),
  }
}

export const wayfinderMemorySourceAdapter: MemorySourceAdapter = {
  async preview({ projectId, sourceRoot }): Promise<ImportPreview> {
    const records: PublishMemoryInput[] = []
    const warnings: string[] = []
    const root = await rootMetadata(sourceRoot)
    if (root.hasToDelete) warnings.push('_to_delete: ignored undocumented directory')
    for (const filename of root.canonNotes) {
      warnings.push(`${filename}:1: root Canon Note is not included in V1 preview`)
    }
    for (const directory of ['assets', 'resolved', 'tickets'] as const) {
      const listing = await listMarkdown(path.join(sourceRoot, directory))
      if (!listing.exists) {
        if (directory === 'assets') warnings.push('assets: absent (valid); no groundwork assets')
        else if (directory === 'tickets') warnings.push('tickets: absent (valid); no open tickets')
        else warnings.push('resolved: absent; no resolved tickets found')
      } else if (listing.files.length === 0) {
        if (directory === 'assets') warnings.push('assets: empty; no groundwork assets were included')
        else if (directory === 'tickets') warnings.push('tickets: empty; no open tickets were included')
        else warnings.push('resolved: empty; no resolved tickets were included')
      }
      for (const filename of listing.files) {
        const relativePath = path.posix.join(directory, filename)
        const sourceFile = await readImportSource(path.join(sourceRoot, relativePath))
        const content = sourceFile.text
        const parsed = parseTicket(content)
        if (!parsed.title) {
          warnings.push(`${relativePath}:1: missing H1 title; record not imported`)
          continue
        }
        const unsafeLine = promptInjectionLine(content)
        const ticketType = parsed.headers.get('type')
        const mode = parsed.headers.get('mode')
        const verifiedType = ticketType === 'grill' || ticketType === 'sketch' || ticketType === 'homework'
          ? ticketType
          : undefined
        const verifiedMode = mode === 'hitl' || mode === 'afk' ? mode : undefined
        const invalidTicketMetadata = directory !== 'assets' && (!verifiedType || !verifiedMode)
        if (directory !== 'assets' && !verifiedType) {
          const typeLine = content.replace(/\r\n?/g, '\n').split('\n')
            .findIndex(line => line.startsWith('type:')) + 1
          warnings.push(
            `${relativePath}:${typeLine || 1}: unrecognized ticket type "${ticketType ?? '<missing>'}"; imported as a development candidate`,
          )
        }
        if (directory !== 'assets' && !verifiedMode) {
          const modeLine = content.replace(/\r\n?/g, '\n').split('\n')
            .findIndex(line => line.startsWith('mode:')) + 1
          warnings.push(
            `${relativePath}:${modeLine || 1}: unrecognized ticket mode "${mode ?? '<missing>'}"; imported as a development candidate`,
          )
        }
        const scopedAnswer = parsed.sections.get('Answer — scoped out')
        const nearScopedHeading = [...parsed.sections.keys()].find(heading => (
          heading !== 'Answer — scoped out'
          && /^Answer\b/i.test(heading)
          && /scoped[ -]out/i.test(heading)
        ))
        const nearScopedAnswer = nearScopedHeading ? parsed.sections.get(nearScopedHeading) : undefined
        const superseded = [...parsed.sections.entries()].find(([heading]) => (
          /^Superseded answer \(\d{4}-\d{2}-\d{2}\)$/.test(heading)
        ))
        const nearSupersededHeadings = [...parsed.sections.keys()].filter(heading => (
          heading !== superseded?.[0] && /^Superseded\s+answer\b/i.test(heading)
        ))
        if (nearScopedHeading) {
          const line = content.replace(/\r\n?/g, '\n').split('\n')
            .findIndex(value => value === `## ${nearScopedHeading}`) + 1
          warnings.push(
            `${relativePath}:${line}: unrecognized scoped-out heading "${nearScopedHeading}"; imported as a development candidate`,
          )
        }
        for (const nearSupersededHeading of nearSupersededHeadings) {
          const line = content.replace(/\r\n?/g, '\n').split('\n')
            .findIndex(value => value === `## ${nearSupersededHeading}`) + 1
          warnings.push(
            `${relativePath}:${line}: unrecognized superseded-answer heading "${nearSupersededHeading}"; history not imported`,
          )
        }
        if (unsafeLine !== undefined) {
          warnings.push(
            `${relativePath}:${unsafeLine}: prompt-injection pattern detected; active authority withheld`,
          )
        }
        const activeCanon = directory === 'resolved'
          && (verifiedType === 'grill' || verifiedType === 'sketch')
          && verifiedMode === 'hitl'
          && scopedAnswer === undefined
          && nearScopedHeading === undefined
          && parsed.sections.has('Answer')
        const answer = parsed.sections.get('Answer')?.replace(/\s+/g, ' ').trim()
        const question = parsed.sections.get('Question')?.replace(/\s+/g, ' ').trim()
        const missingResolvedAnswer = directory === 'resolved'
          && answer === undefined
          && scopedAnswer === undefined
          && nearScopedAnswer === undefined
        if (missingResolvedAnswer) {
          warnings.push(
            `${relativePath}:1: resolved ticket has no recognized Answer; imported as a development candidate`,
          )
        }
        const scoped = scopedAnswer !== undefined
        const nearScoped = nearScopedAnswer !== undefined
        const rawClaim = scoped
          ? question || parsed.title
          : nearScoped
            ? nearScopedAnswer?.replace(/\s+/g, ' ').trim() || parsed.title
            : directory === 'tickets'
          ? question || parsed.title
          : directory === 'assets'
            ? parsed.title
            : answer || parsed.title
        if (!rawClaim) continue
        const claim = truncateImportText(rawClaim, 600)
        const claimTruncated = claim !== rawClaim
        if (claimTruncated) {
          warnings.push(
            `${relativePath}:1: claim truncated to 600 characters${activeCanon ? '; active canon withheld' : ''}`,
          )
        }
        const kind = scoped
          ? 'open_question'
          : nearScoped
            ? 'development'
            : activeCanon
              ? 'canon'
              : directory === 'tickets'
                ? 'open_question'
                : 'development'
        const rawDetail = scoped
          ? `Scoped-out answer: ${scopedAnswer?.replace(/\s+/g, ' ').trim()}`
          : superseded
            ? `${superseded[0]}: ${superseded[1].replace(/\s+/g, ' ').trim()}`
            : undefined
        const detail = rawDetail === undefined ? undefined : truncateImportText(rawDetail, 8_000)
        const detailTruncated = detail !== rawDetail
        if (detailTruncated) {
          warnings.push(
            `${relativePath}:1: detail truncated to 8000 characters${activeCanon ? '; active canon withheld' : ''}`,
          )
        }
        const requestedStatus = scoped
          || nearScoped
          || unsafeLine !== undefined
          || invalidTicketMetadata
          || missingResolvedAnswer
          || (activeCanon && (claimTruncated || detailTruncated))
          ? 'candidate'
          : 'active'
        const sourceHash = sourceFile.sourceHash
        records.push({
          projectId,
          dedupeKey: `import:story-wayfinder:${sha256(`story-wayfinder\0${relativePath}\0${sourceHash}`)}`,
          kind,
          requestedStatus,
          claim,
          ...(detail ? { detail } : {}),
          source: {
            workflow: 'story-wayfinder',
            sourceId: relativePath,
            sourceUri: `story-wayfinder:${relativePath}`,
            sourceHash,
            capturedAt: capturedAt(parsed.headers.get('resolved') ?? parsed.headers.get('created')),
            approval: activeCanon ? 'explicit' : 'none',
            ...(verifiedType && verifiedMode ? {
              authority: { ticketType: verifiedType, mode: verifiedMode },
            } : {}),
          },
          evidence: [{
            excerpt: claim,
            locator: `story-wayfinder:${relativePath}${directory === 'tickets' ? '#Question' : '#Answer'}`,
          }],
          safety: unsafeLine === undefined ? 'clear' : 'flagged',
          spoiler: parsed.headers.get('spoiler')?.toLowerCase() === 'true',
        })
      }
    }

    const atomsPath = path.join(sourceRoot, 'atoms', 'atoms.jsonl')
    let atomsContent: string | undefined
    try {
      const sourceFile = await readImportSource(atomsPath)
      atomsContent = sourceFile.text
    } catch (error) {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error
    }
    if (atomsContent !== undefined) {
      const recordsBeforeAtoms = records.length
      const lines = atomsContent.split(/\r\n|\n|\r/)
      const atomVersions = new Map<string, { sourceHash: string; claim: string; line: number }>()
      for (const [index, rawLine] of lines.entries()) {
        const lineNumber = index + 1
        if (!rawLine.trim()) continue
        let rawAtom: unknown
        try {
          rawAtom = JSON.parse(rawLine)
        } catch {
          warnings.push(`atoms/atoms.jsonl:${lineNumber}: malformed JSON; record not imported`)
          continue
        }
        if (!isObject(rawAtom)) {
          warnings.push(`atoms/atoms.jsonl:${lineNumber}: malformed atom object; record not imported`)
          continue
        }
        const status = typeof rawAtom.canon_status === 'string' ? rawAtom.canon_status : ''
        if (!['canon-ratified', 'open', 'unratified-input'].includes(status)) {
          warnings.push(
            `atoms/atoms.jsonl:${lineNumber}: unmapped canon_status "${status || '<missing>'}"; record not imported`,
          )
          continue
        }
        const rawClaim = typeof rawAtom.claim === 'string' ? rawAtom.claim.trim() : ''
        const rawAtomId = typeof rawAtom.id === 'string' ? rawAtom.id : ''
        const atomId = rawAtomId.trim()
        if (!rawClaim || !atomId) {
          warnings.push(`atoms/atoms.jsonl:${lineNumber}: atom lacks id or claim; record not imported`)
          continue
        }
        if (!isSafeLegacyAtomId(rawAtomId)) {
          warnings.push(
            `atoms/atoms.jsonl:${lineNumber}: atom id is not a bounded opaque identifier; record not imported`,
          )
          continue
        }
        const sourceId = `atoms/atoms.jsonl:${atomId}`
        const sourceHash = createHash('sha256').update(Buffer.from(rawLine, 'utf8')).digest('hex')
        const existingVersion = atomVersions.get(sourceId)
        if (
          existingVersion
          && (existingVersion.sourceHash !== sourceHash || existingVersion.claim !== rawClaim)
        ) {
          throw new ProjectMemoryImportInputError(
            `atoms/atoms.jsonl lines ${existingVersion.line} and ${lineNumber} contain conflicting versions of one atom id.`,
          )
        }
        if (!existingVersion) atomVersions.set(sourceId, { sourceHash, claim: rawClaim, line: lineNumber })
        const claim = truncateImportText(rawClaim, 600)
        if (claim !== rawClaim) {
          warnings.push(`atoms/atoms.jsonl:${lineNumber}: claim truncated to 600 characters`)
        }
        if (status === 'canon-ratified') {
          warnings.push(
            `atoms/atoms.jsonl:${lineNumber}: canon-ratified lacks verifiable hitl grill/sketch authority; imported as a candidate`,
          )
        }
        const unsafeLine = promptInjectionLine(rawLine)
        if (unsafeLine !== undefined) {
          warnings.push(
            `atoms/atoms.jsonl:${lineNumber}: prompt-injection pattern detected; imported as a flagged candidate`,
          )
        }
        const defaultLocator = `story-wayfinder:atoms/atoms.jsonl#atom=${encodeURIComponent(atomId)}`
        const rawLocator = typeof rawAtom.source === 'string' ? rawAtom.source : ''
        const safeRawLocator = isSafeLegacySourceLocator(rawLocator)
        if (rawLocator && !safeRawLocator) {
          warnings.push(
            `atoms/atoms.jsonl:${lineNumber}: unsafe legacy source locator discarded; stable atom locator used`,
          )
        }
        const locator = safeRawLocator ? rawLocator : defaultLocator
        const entities = Array.isArray(rawAtom.entities)
          ? rawAtom.entities
            .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
            .slice(0, 30)
            .map(value => {
              const normalized = value.trim()
              const bounded = truncateImportText(normalized, 200)
              if (bounded !== normalized) {
                warnings.push(`atoms/atoms.jsonl:${lineNumber}: entity truncated to 200 characters`)
              }
              return bounded
            })
          : []
        records.push({
          projectId,
          dedupeKey: `import:story-wayfinder:${sha256(`story-wayfinder\0${sourceId}\0${sourceHash}`)}`,
          kind: status === 'open' ? 'open_question' : 'canon',
          requestedStatus: status === 'open' && unsafeLine === undefined ? 'active' : 'candidate',
          claim,
          tags: [`legacy-canon-status:${status}`],
          entities,
          source: {
            workflow: 'story-wayfinder',
            sourceId,
            sourceUri: defaultLocator,
            sourceHash,
            capturedAt: capturedAt(typeof rawAtom.extracted === 'string' ? rawAtom.extracted.slice(0, 10) : undefined),
            approval: status === 'canon-ratified' ? 'explicit' : 'none',
          },
          evidence: [{ excerpt: claim, locator }],
          safety: unsafeLine === undefined ? 'clear' : 'flagged',
          spoiler: rawAtom.spoiler === true,
        })
      }
      if (records.length === recordsBeforeAtoms) {
        warnings.push('atoms/atoms.jsonl:1: legacy atoms file exists but no records were included')
      }
    }
    return {
      source: 'story-wayfinder',
      projectId,
      records,
      warnings,
      duplicates: 0,
      counts: buildImportCounts(records, 0),
    }
  },
}
