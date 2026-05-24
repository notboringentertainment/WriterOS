import { buildScriptIndex } from './scriptIndex'
import type { ProjectSourceImportMetadata, ScriptScene } from './projectState'
import type { ElementType } from './screenplay'

export type FdxImportErrorCode =
  | 'unsupported-extension'
  | 'malformed-xml'
  | 'unsupported-document'
  | 'missing-content'
  | 'unsupported-encoding'

export class FdxImportError extends Error {
  constructor(readonly code: FdxImportErrorCode, message: string) {
    super(message)
    this.name = 'FdxImportError'
  }
}

export interface ImportedFdxScreenplay {
  rawHtml: string
  scenes: ScriptScene[]
  title: string | null
  wordCount: number
  pageCount: number
  warnings: string[]
  sourceImport: ProjectSourceImportMetadata
}

const FDX_ELEMENT_TYPES: Record<string, ElementType> = {
  'Scene Heading': 'scene-heading',
  Action: 'action',
  Character: 'character',
  Dialogue: 'dialogue',
  Parenthetical: 'parenthetical',
  Transition: 'transition',
  Shot: 'action',
  General: 'action',
}

function localName(element: Element): string {
  return element.localName || element.nodeName.replace(/^.*:/, '')
}

function directChild(element: Element, name: string): Element | null {
  return Array.from(element.children).find(child => localName(child) === name) ?? null
}

function directChildren(element: Element, name: string): Element[] {
  return Array.from(element.children).filter(child => localName(child) === name)
}

function descendants(element: Element, name: string): Element[] {
  const found: Element[] = []
  for (const child of Array.from(element.children)) {
    if (localName(child) === name) found.push(child)
    found.push(...descendants(child, name))
  }
  return found
}

function hasXmlParseError(doc: Document): boolean {
  return localName(doc.documentElement) === 'parsererror' || doc.getElementsByTagName('parsererror').length > 0
}

function normalizeParagraphText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function paragraphText(paragraph: Element): string {
  const textNodes = directChildren(paragraph, 'Text')
  if (textNodes.length === 0) return ''
  return normalizeParagraphText(textNodes.map(node => node.textContent ?? '').join(''))
}

function typeForParagraph(paragraph: Element, warnings: string[]): ElementType {
  const finalDraftType = paragraph.getAttribute('Type') ?? ''
  const mappedType = FDX_ELEMENT_TYPES[finalDraftType]
  if (mappedType) return mappedType

  warnings.push(
    finalDraftType
      ? `Unknown Final Draft paragraph type "${finalDraftType}" imported as Action.`
      : 'Final Draft paragraph without a type imported as Action.',
  )
  return 'action'
}

function trimOuterBlankBlocks<T extends { text: string }>(blocks: T[]): T[] {
  const firstContentIndex = blocks.findIndex(block => block.text.length > 0)
  if (firstContentIndex === -1) return []
  let lastContentIndex = blocks.length - 1
  while (lastContentIndex > firstContentIndex && blocks[lastContentIndex].text.length === 0) {
    lastContentIndex -= 1
  }
  return blocks.slice(firstContentIndex, lastContentIndex + 1)
}

function extractTitle(root: Element): string | null {
  const titlePage = directChild(root, 'TitlePage')
  if (!titlePage) return null

  const titleParagraph = Array.from(titlePage.getElementsByTagName('Paragraph')).find(paragraph =>
    paragraph.getAttribute('Type') === 'Title'
  )
  const title = titleParagraph ? paragraphText(titleParagraph) : ''
  return title.length > 0 ? title : null
}

export function titleFromFdxFilename(filename: string): string | null {
  const basename = filename.split(/[\\/]/).pop() ?? filename
  const withoutExtension = basename.replace(/\.fdx$/i, '')
  const title = withoutExtension.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
  return title.length > 0 ? title : null
}

export function importFdxXml(
  sourceXml: string,
  options: { filename?: string; importedAt?: number } = {},
): ImportedFdxScreenplay {
  if (typeof DOMParser === 'undefined') {
    throw new FdxImportError('unsupported-document', 'Final Draft import requires a browser XML parser.')
  }

  const doc = new DOMParser().parseFromString(sourceXml.trim(), 'application/xml')
  if (hasXmlParseError(doc)) {
    throw new FdxImportError('malformed-xml', 'This file is not valid Final Draft XML.')
  }

  const root = doc.documentElement
  if (!root || localName(root) !== 'FinalDraft') {
    throw new FdxImportError('unsupported-document', 'This file is not a supported Final Draft .fdx document.')
  }

  const content = directChild(root, 'Content')
  if (!content) {
    throw new FdxImportError('missing-content', 'This Final Draft file does not contain script content.')
  }

  const warnings: string[] = []
  const paragraphs = descendants(content, 'Paragraph')
  const blocks = trimOuterBlankBlocks(paragraphs.map(paragraph => ({
    type: typeForParagraph(paragraph, warnings),
    text: paragraphText(paragraph),
  })))

  if (blocks.length === 0) {
    throw new FdxImportError('missing-content', 'This Final Draft file does not contain importable screenplay text.')
  }

  const rawHtml = blocks
    .map(block => `<p data-element-type="${block.type}">${escapeHtml(block.text)}</p>`)
    .join('\n')
  const index = buildScriptIndex(rawHtml)
  const title = extractTitle(root) ?? (options.filename ? titleFromFdxFilename(options.filename) : null)
  const importedAt = new Date(options.importedAt ?? Date.now()).toISOString()

  return {
    rawHtml,
    scenes: index.scenes.map(scene => ({
      id: scene.id,
      heading: scene.heading,
      index: scene.index,
    })),
    title,
    wordCount: index.totalWordCount,
    pageCount: Math.max(1, index.estimatedPageCount || 1),
    warnings: Array.from(new Set(warnings)),
    sourceImport: {
      kind: 'fdx',
      ...(options.filename ? { originalFilename: options.filename } : {}),
      importedAt,
      rawSource: sourceXml,
    },
  }
}

export async function importFdxFile(file: File): Promise<ImportedFdxScreenplay> {
  if (!file.name.toLowerCase().endsWith('.fdx')) {
    throw new FdxImportError('unsupported-extension', 'Choose a Final Draft .fdx file to import.')
  }

  return importFdxXml(await decodeFdxFile(file), { filename: file.name })
}

function normalizeDeclaredEncoding(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/_/g, '-')
  if (normalized === 'utf8') return 'utf-8'
  if (normalized === 'latin1') return 'iso-8859-1'
  return normalized
}

function declaredXmlEncoding(preview: string): string | null {
  return preview.match(/<\?xml[^>]*encoding=["']([^"']+)["']/i)?.[1] ?? null
}

async function decodeFdxFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const preview = new TextDecoder('utf-8', { fatal: false }).decode(buffer.slice(0, 512))
  const encoding = declaredXmlEncoding(preview)
  const decoderName = encoding ? normalizeDeclaredEncoding(encoding) : 'utf-8'

  if (decoderName === 'windows-1252') return decodeWindows1252(buffer)

  try {
    return new TextDecoder(decoderName, { fatal: false }).decode(buffer)
  } catch {
    throw new FdxImportError(
      'unsupported-encoding',
      `This Final Draft file declares unsupported text encoding "${encoding}".`,
    )
  }
}

const WINDOWS_1252_CONTROL_CHARS: Record<number, string> = {
  0x80: '€',
  0x82: '‚',
  0x83: 'ƒ',
  0x84: '„',
  0x85: '…',
  0x86: '†',
  0x87: '‡',
  0x88: 'ˆ',
  0x89: '‰',
  0x8A: 'Š',
  0x8B: '‹',
  0x8C: 'Œ',
  0x8E: 'Ž',
  0x91: '‘',
  0x92: '’',
  0x93: '“',
  0x94: '”',
  0x95: '•',
  0x96: '–',
  0x97: '—',
  0x98: '˜',
  0x99: '™',
  0x9A: 'š',
  0x9B: '›',
  0x9C: 'œ',
  0x9E: 'ž',
  0x9F: 'Ÿ',
}

function decodeWindows1252(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), byte =>
    WINDOWS_1252_CONTROL_CHARS[byte] ?? String.fromCharCode(byte)
  ).join('')
}
