import { z } from 'zod'
import { ProjectDocumentsSchema, type ProjectDocuments } from '@shared/documents'
import { normalizeProjectFormat } from '@shared/projectFormat'
import { documentsToLegacy } from './documentMigration'
import { getDisplayProjectTitle, normalizeProjectTitle } from './projectIdentity'
import {
  CURRENT_SCHEMA_VERSION,
  defaultProjectState,
  defaultTitlePageMetadata,
  migrateState,
  normalizeTitlePageMetadata,
} from './projectState'
import { buildScriptIndex } from './scriptIndex'
import type { AgentId, ProjectSourceImportMetadata, ProjectState, ScriptScene, TitlePageMetadata, TranscriptMessage } from './projectState'
import type { StoredProject } from './projectLibrary'
import { defaultScriptFactsCache, normalizeScriptFactsCache, type ScriptFactsCache } from './scriptFacts'

export const WRITEROS_PACKAGE_EXTENSION = '.writeros'
export const WRITEROS_PACKAGE_SCHEMA_VERSION = 1
export const WRITEROS_APP_VERSION = '0.2.0'

export const WRITEROS_PROJECT_MANIFEST_PATH = 'project.json'
export const WRITEROS_SCRIPT_HTML_PATH = 'script/script.writeros.html'
export const WRITEROS_SCRIPT_FACTS_PATH = 'script/script-facts.json'
export const WRITEROS_IMPORTED_FDX_SOURCE_PATH = 'script/imported-source.fdx'
export const WRITEROS_TITLE_PAGE_PATH = 'metadata/title-page.json'
export const WRITEROS_DOCUMENT_PATHS = {
  synopsis: 'documents/synopsis.json',
  outline: 'documents/outline.json',
  treatment: 'documents/treatment.json',
  storyBible: 'documents/story-bible.json',
} as const
export const WRITEROS_TRANSCRIPT_PATHS = {
  writingPartner: 'transcripts/writing-partner.json',
  specialists: 'transcripts/specialists.json',
} as const

const SPECIALIST_AGENT_IDS = ['sam', 'casey', 'oliver', 'maya', 'zoe', 'alex'] as const

type SpecialistAgentId = Extract<AgentId, typeof SPECIALIST_AGENT_IDS[number]>

const TimestampStringSchema = z.string().refine(
  value => Number.isFinite(Date.parse(value)),
  'Expected a valid timestamp',
)

const SourceImportSchema = z.object({
  kind: z.enum(['fdx', 'fountain', 'plain-text', 'unknown']),
  originalFilename: z.string().optional(),
  importedAt: TimestampStringSchema,
  copiedSourcePath: z.string().optional(),
}).passthrough()

export const WriterOSProjectManifestSchema = z.object({
  schemaVersion: z.literal(WRITEROS_PACKAGE_SCHEMA_VERSION),
  projectId: z.string().min(1),
  title: z.string(),
  format: z.preprocess(value => normalizeProjectFormat(value), z.enum(['feature', 'series'])),
  createdAt: TimestampStringSchema,
  updatedAt: TimestampStringSchema,
  openedAt: TimestampStringSchema,
  sourceImport: SourceImportSchema.nullable(),
  appVersion: z.string().min(1),
}).passthrough()

export type WriterOSProjectManifest = z.infer<typeof WriterOSProjectManifestSchema>

const ScriptFactEntrySchema = z.object({
  label: z.string(),
  count: z.number(),
  blockIndices: z.array(z.number()),
})

const ScriptFactWarningSchema = z.object({
  kind: z.literal('near-match'),
  section: z.enum(['characters', 'locations']),
  labels: z.tuple([z.string(), z.string()]),
  reason: z.enum(['edit-distance', 'token-containment']),
})

const ScriptFactsCacheSchema: z.ZodType<ScriptFactsCache> = z.object({
  rebuiltAt: TimestampStringSchema.nullable(),
  contentHash: z.string(),
  characters: z.array(ScriptFactEntrySchema),
  locations: z.array(ScriptFactEntrySchema),
  times: z.array(ScriptFactEntrySchema),
  transitions: z.array(ScriptFactEntrySchema),
  warnings: z.array(ScriptFactWarningSchema),
})

export interface WriterOSProjectPackage {
  manifest: WriterOSProjectManifest
  files: Record<string, string>
}

export interface SerializeWriterOSProjectPackageOptions {
  openedAt?: number
  appVersion?: string
  sourceImport?: ProjectSourceImportMetadata | WriterOSProjectManifest['sourceImport']
}

export type ProjectPackageErrorCode =
  | 'missing-file'
  | 'invalid-json'
  | 'invalid-manifest'
  | 'invalid-document'
  | 'invalid-title-page'
  | 'invalid-script-facts'
  | 'invalid-transcript'

export interface ProjectPackageReadError {
  code: ProjectPackageErrorCode
  path: string
  message: string
}

export type ProjectPackageReadResult =
  | {
      ok: true
      manifest: WriterOSProjectManifest
      project: StoredProject
      warnings: string[]
    }
  | {
      ok: false
      error: ProjectPackageReadError
      warnings: string[]
    }

function stringifyPackageJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function timestampFromNumber(value: number): string {
  return new Date(value).toISOString()
}

function numberFromTimestamp(value: string): number {
  return new Date(value).getTime()
}

function zodMessage(error: z.ZodError): string {
  return error.issues
    .map(issue => `${issue.path.join('.') || 'value'}: ${issue.message}`)
    .join('; ')
}

function parseJsonFile(path: string, raw: string): { ok: true; value: unknown } | { ok: false; error: ProjectPackageReadError } {
  try {
    return { ok: true, value: JSON.parse(raw) }
  } catch {
    return {
      ok: false,
      error: {
        code: 'invalid-json',
        path,
        message: `${path} is not valid JSON.`,
      },
    }
  }
}

function requiredFile(files: Record<string, string | undefined>, path: string): string | ProjectPackageReadError {
  const value = files[path]
  if (typeof value === 'string') return value
  return {
    code: 'missing-file',
    path,
    message: `${path} is missing from the WriterOS project package.`,
  }
}

export function getWriterOSProjectPackageDirectoryName(title: unknown, projectId: string): string {
  const safeTitle = getDisplayProjectTitle(title)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '')
    .slice(0, 80)
  const safeId = projectId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8)
  const base = safeTitle || getDisplayProjectTitle('')

  return safeId
    ? `${base} (${safeId})${WRITEROS_PACKAGE_EXTENSION}`
    : `${base}${WRITEROS_PACKAGE_EXTENSION}`
}

function scriptScenesFromHtml(rawHtml: string): ScriptScene[] {
  return buildScriptIndex(rawHtml).scenes.map(scene => ({
    id: scene.id,
    heading: scene.heading,
    index: scene.index,
  }))
}

function scriptMetaFromHtml(rawHtml: string): Pick<ProjectState['meta'], 'wordCount' | 'pageCount'> {
  const index = buildScriptIndex(rawHtml)
  return {
    wordCount: index.totalWordCount,
    pageCount: Math.max(1, index.estimatedPageCount || 1),
  }
}

function specialistAgentsFromState(state: ProjectState): Record<SpecialistAgentId, ProjectState['agents'][SpecialistAgentId]> {
  return Object.fromEntries(
    SPECIALIST_AGENT_IDS.map(agentId => [agentId, state.agents[agentId]]),
  ) as Record<SpecialistAgentId, ProjectState['agents'][SpecialistAgentId]>
}

function sourceImportForManifest(sourceImport: ProjectSourceImportMetadata | WriterOSProjectManifest['sourceImport'] | undefined | null): WriterOSProjectManifest['sourceImport'] {
  if (!sourceImport) return null

  const copiedSourcePath =
    sourceImport.copiedSourcePath
    ?? (sourceImport.kind === 'fdx' && 'rawSource' in sourceImport && typeof sourceImport.rawSource === 'string'
      ? WRITEROS_IMPORTED_FDX_SOURCE_PATH
      : undefined)

  return {
    kind: sourceImport.kind,
    ...(sourceImport.originalFilename ? { originalFilename: sourceImport.originalFilename } : {}),
    importedAt: sourceImport.importedAt,
    ...(copiedSourcePath ? { copiedSourcePath } : {}),
  }
}

function stateSourceImportFromManifest(
  sourceImport: WriterOSProjectManifest['sourceImport'],
  rawSource: string | undefined,
): ProjectSourceImportMetadata | null {
  if (!sourceImport) return null

  return {
    ...sourceImport,
    ...(rawSource && sourceImport.kind === 'fdx' ? { rawSource } : {}),
  }
}

export function serializeWriterOSProjectPackage(
  project: StoredProject,
  options: SerializeWriterOSProjectPackageOptions = {},
): WriterOSProjectPackage {
  const state = migrateState(project.state)
  const packageSourceImport = options.sourceImport ?? state.meta.sourceImport
  const manifest: WriterOSProjectManifest = {
    schemaVersion: WRITEROS_PACKAGE_SCHEMA_VERSION,
    projectId: project.id,
    title: normalizeProjectTitle(state.meta.title),
    format: normalizeProjectFormat(state.meta.format),
    createdAt: timestampFromNumber(project.createdAt),
    updatedAt: timestampFromNumber(project.updatedAt),
    openedAt: timestampFromNumber(options.openedAt ?? project.updatedAt),
    sourceImport: sourceImportForManifest(packageSourceImport),
    appVersion: options.appVersion ?? WRITEROS_APP_VERSION,
  }

  const files: Record<string, string> = {
    [WRITEROS_PROJECT_MANIFEST_PATH]: stringifyPackageJson(manifest),
    [WRITEROS_TITLE_PAGE_PATH]: stringifyPackageJson(state.meta.titlePage),
    [WRITEROS_SCRIPT_HTML_PATH]: state.script.rawHtml,
    [WRITEROS_SCRIPT_FACTS_PATH]: stringifyPackageJson(normalizeScriptFactsCache(state.script.facts)),
    [WRITEROS_DOCUMENT_PATHS.synopsis]: stringifyPackageJson(state.documents.synopsis),
    [WRITEROS_DOCUMENT_PATHS.outline]: stringifyPackageJson(state.documents.outline),
    [WRITEROS_DOCUMENT_PATHS.treatment]: stringifyPackageJson(state.documents.treatment),
    [WRITEROS_DOCUMENT_PATHS.storyBible]: stringifyPackageJson(state.documents.storyBible),
    [WRITEROS_TRANSCRIPT_PATHS.writingPartner]: stringifyPackageJson(state.agents.writingPartner),
    [WRITEROS_TRANSCRIPT_PATHS.specialists]: stringifyPackageJson(specialistAgentsFromState(state)),
  }

  const rawFdxSource =
    state.meta.sourceImport?.rawSource
    ?? (packageSourceImport && 'rawSource' in packageSourceImport ? packageSourceImport.rawSource : undefined)

  if (packageSourceImport?.kind === 'fdx' && typeof rawFdxSource === 'string' && rawFdxSource.length > 0) {
    files[WRITEROS_IMPORTED_FDX_SOURCE_PATH] = rawFdxSource
  }

  return {
    manifest,
    files,
  }
}

const TranscriptMessageSchema: z.ZodType<TranscriptMessage> = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  speaker: z.string(),
  ts: z.number(),
  capabilityReceipt: z.unknown().optional(),
}).passthrough() as z.ZodType<TranscriptMessage>

const WritingPartnerAgentSchema: z.ZodType<ProjectState['agents']['writingPartner']> = z.object({
  transcript: z.array(TranscriptMessageSchema),
  lastActive: z.number().nullable(),
})

const SpecialistAgentSchema: z.ZodType<ProjectState['agents'][SpecialistAgentId]> = z.object({
  transcript: z.array(TranscriptMessageSchema),
  lastTouched: z.number().nullable(),
})

const SpecialistAgentsSchema: z.ZodType<Partial<Record<SpecialistAgentId, ProjectState['agents'][SpecialistAgentId]>>> = z.object({
  sam: SpecialistAgentSchema.optional(),
  casey: SpecialistAgentSchema.optional(),
  oliver: SpecialistAgentSchema.optional(),
  maya: SpecialistAgentSchema.optional(),
  zoe: SpecialistAgentSchema.optional(),
  alex: SpecialistAgentSchema.optional(),
})

const TitlePageMetadataFileSchema: z.ZodType<Partial<TitlePageMetadata>> = z.object({
  writtenBy: z.string().optional(),
  basedOn: z.string().optional(),
  contactInfo: z.string().optional(),
  draftLabel: z.string().optional(),
  draftDate: z.string().optional(),
  formatDisplay: z.string().optional(),
}).passthrough()

function parseManifest(files: Record<string, string | undefined>): { ok: true; manifest: WriterOSProjectManifest } | { ok: false; error: ProjectPackageReadError } {
  const rawManifest = requiredFile(files, WRITEROS_PROJECT_MANIFEST_PATH)
  if (typeof rawManifest !== 'string') return { ok: false, error: rawManifest }

  const parsedJson = parseJsonFile(WRITEROS_PROJECT_MANIFEST_PATH, rawManifest)
  if (!parsedJson.ok) return { ok: false, error: parsedJson.error }

  const parsedManifest = WriterOSProjectManifestSchema.safeParse(parsedJson.value)
  if (!parsedManifest.success) {
    return {
      ok: false,
      error: {
        code: 'invalid-manifest',
        path: WRITEROS_PROJECT_MANIFEST_PATH,
        message: zodMessage(parsedManifest.error),
      },
    }
  }

  return { ok: true, manifest: parsedManifest.data }
}

function parseDocuments(files: Record<string, string | undefined>): { ok: true; documents: ProjectDocuments } | { ok: false; error: ProjectPackageReadError } {
  const rawDocuments: Partial<Record<keyof ProjectDocuments, unknown>> = {}

  for (const [documentKey, path] of Object.entries(WRITEROS_DOCUMENT_PATHS) as Array<[keyof ProjectDocuments, string]>) {
    const rawDocument = requiredFile(files, path)
    if (typeof rawDocument !== 'string') return { ok: false, error: rawDocument }

    const parsedJson = parseJsonFile(path, rawDocument)
    if (!parsedJson.ok) return { ok: false, error: parsedJson.error }
    rawDocuments[documentKey] = parsedJson.value
  }

  const parsedDocuments = ProjectDocumentsSchema.safeParse(rawDocuments)
  if (!parsedDocuments.success) {
    return {
      ok: false,
      error: {
        code: 'invalid-document',
        path: 'documents',
        message: zodMessage(parsedDocuments.error),
      },
    }
  }

  return { ok: true, documents: parsedDocuments.data }
}

function parseTitlePageMetadata(files: Record<string, string | undefined>): { ok: true; titlePage: TitlePageMetadata } | { ok: false; error: ProjectPackageReadError } {
  const rawTitlePage = files[WRITEROS_TITLE_PAGE_PATH]
  if (typeof rawTitlePage !== 'string') return { ok: true, titlePage: defaultTitlePageMetadata() }

  const parsedJson = parseJsonFile(WRITEROS_TITLE_PAGE_PATH, rawTitlePage)
  if (!parsedJson.ok) {
    return {
      ok: false,
      error: {
        ...parsedJson.error,
        code: 'invalid-title-page',
      },
    }
  }

  const parsedTitlePage = TitlePageMetadataFileSchema.safeParse(parsedJson.value)
  if (!parsedTitlePage.success) {
    return {
      ok: false,
      error: {
        code: 'invalid-title-page',
        path: WRITEROS_TITLE_PAGE_PATH,
        message: zodMessage(parsedTitlePage.error),
      },
    }
  }

  return { ok: true, titlePage: normalizeTitlePageMetadata(parsedTitlePage.data) }
}

function parseOptionalJson<T>(
  files: Record<string, string | undefined>,
  path: string,
  schema: z.ZodType<T>,
  fallback: T,
  options: { errorCode?: ProjectPackageErrorCode; missingWarning?: string } = {},
): { ok: true; value: T; warning?: string } | { ok: false; error: ProjectPackageReadError } {
  const raw = files[path]
  if (typeof raw !== 'string') {
    return {
      ok: true,
      value: fallback,
      ...(options.missingWarning ? { warning: options.missingWarning } : {}),
    }
  }

  const parsedJson = parseJsonFile(path, raw)
  const errorCode = options.errorCode ?? 'invalid-transcript'
  if (!parsedJson.ok) return { ok: false, error: { ...parsedJson.error, code: errorCode } }

  const parsed = schema.safeParse(parsedJson.value)
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: errorCode,
        path,
        message: zodMessage(parsed.error),
      },
    }
  }

  return { ok: true, value: parsed.data }
}

export function readWriterOSProjectPackage(
  files: Record<string, string | undefined>,
): ProjectPackageReadResult {
  const warnings: string[] = []
  const manifestResult = parseManifest(files)
  if (!manifestResult.ok) return { ok: false, error: manifestResult.error, warnings }

  const documentResult = parseDocuments(files)
  if (!documentResult.ok) return { ok: false, error: documentResult.error, warnings }

  const titlePageResult = parseTitlePageMetadata(files)
  if (!titlePageResult.ok) return { ok: false, error: titlePageResult.error, warnings }

  const defaults = defaultProjectState()
  const writingPartnerResult = parseOptionalJson(
    files,
    WRITEROS_TRANSCRIPT_PATHS.writingPartner,
    WritingPartnerAgentSchema,
    defaults.agents.writingPartner,
    {
      errorCode: 'invalid-transcript',
      missingWarning: `${WRITEROS_TRANSCRIPT_PATHS.writingPartner} is missing; using an empty transcript.`,
    },
  )
  if (!writingPartnerResult.ok) return { ok: false, error: writingPartnerResult.error, warnings }
  if (writingPartnerResult.warning) warnings.push(writingPartnerResult.warning)

  const specialistResult = parseOptionalJson(
    files,
    WRITEROS_TRANSCRIPT_PATHS.specialists,
    SpecialistAgentsSchema,
    specialistAgentsFromState(defaults),
    {
      errorCode: 'invalid-transcript',
      missingWarning: `${WRITEROS_TRANSCRIPT_PATHS.specialists} is missing; using an empty transcript.`,
    },
  )
  if (!specialistResult.ok) return { ok: false, error: specialistResult.error, warnings }
  if (specialistResult.warning) warnings.push(specialistResult.warning)

  const scriptHtml = files[WRITEROS_SCRIPT_HTML_PATH]
  if (typeof scriptHtml !== 'string') {
    warnings.push(`${WRITEROS_SCRIPT_HTML_PATH} is missing; using a blank script.`)
  }
  const rawHtml = scriptHtml ?? ''
  const scriptMeta = scriptMetaFromHtml(rawHtml)
  const scriptFactsResult = parseOptionalJson(
    files,
    WRITEROS_SCRIPT_FACTS_PATH,
    ScriptFactsCacheSchema,
    defaultScriptFactsCache(),
    { errorCode: 'invalid-script-facts' },
  )
  const scriptFactsCache = scriptFactsResult.ok
    ? scriptFactsResult.value
    : defaultScriptFactsCache()
  if (!scriptFactsResult.ok) {
    warnings.push(`${WRITEROS_SCRIPT_FACTS_PATH} is invalid; using an empty Script Facts cache.`)
  }
  const legacy = documentsToLegacy(documentResult.documents, { outlineFormat: manifestResult.manifest.format })

  const state = migrateState({
    ...defaults,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    meta: {
      ...defaults.meta,
      title: normalizeProjectTitle(manifestResult.manifest.title),
      format: normalizeProjectFormat(manifestResult.manifest.format),
      sourceImport: stateSourceImportFromManifest(
        manifestResult.manifest.sourceImport,
        files[WRITEROS_IMPORTED_FDX_SOURCE_PATH],
      ),
      titlePage: titlePageResult.titlePage,
      ...scriptMeta,
    },
    script: {
      rawHtml,
      scenes: scriptScenesFromHtml(rawHtml),
      revisionHistory: [],
      facts: normalizeScriptFactsCache(scriptFactsCache),
    },
    documents: documentResult.documents,
    synopsis: legacy.synopsis,
    outline: legacy.outline,
    storyBible: legacy.storyBible,
    agents: {
      ...defaults.agents,
      writingPartner: writingPartnerResult.value,
      ...specialistResult.value,
    },
  })

  return {
    ok: true,
    manifest: manifestResult.manifest,
    project: {
      id: manifestResult.manifest.projectId,
      createdAt: numberFromTimestamp(manifestResult.manifest.createdAt),
      updatedAt: numberFromTimestamp(manifestResult.manifest.updatedAt),
      state,
    },
    warnings,
  }
}
