export interface ParsedBeat { key: string; number: number; title: string; body: string; movement: string }

export type BeatSheetParseResult =
  | { ok: true; beats: ParsedBeat[]; label: string | null }
  | { ok: false; reason: 'no-answer' | 'no-playing-order' | 'no-beats' | 'not-resolved' | 'duplicate-title'; message: string }

const BEAT_LINE = /^(\d+)\.\s+\*\*(.+?)\*\*\s*(.*)$/
const MOVEMENT_LINE = /^\*\*(.+?)\*\*\s*$/

function headerBlock(lines: string[]): Map<string, string> {
  const headers = new Map<string, string>()
  let index = lines[0]?.startsWith('# ') ? 1 : 0
  for (; index < lines.length; index += 1) {
    const line = lines[index]
    if (line.startsWith('## ')) break
    const match = /^([a-z][a-z0-9-]*):\s*(.*?)\s*$/.exec(line)
    if (match) headers.set(match[1], match[2])
  }
  return headers
}

function section(lines: string[], heading: string, level: '##' | '###'): string[] | null {
  const start = lines.findIndex(line => line.trim() === `${level} ${heading}`)
  if (start < 0) return null
  const stop = level === '##' ? /^##\s/ : /^##{1,2}\s/
  const out: string[] = []
  for (let index = start + 1; index < lines.length; index += 1) {
    if (stop.test(lines[index])) break
    out.push(lines[index])
  }
  return out
}

export function beatKey(title: string): string {
  const slug = title.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'beat'
  return `beat.${slug}`
}

export function isBeatSheetDeclared(markdown: string): boolean {
  return headerBlock(markdown.replace(/\r\n?/g, '\n').split('\n')).has('beat-sheet')
}

export function parseBeatSheetDecision(markdown: string): BeatSheetParseResult {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  const headers = headerBlock(lines)
  if (!headers.get('resolved')) return { ok: false, reason: 'not-resolved', message: 'The decision is not marked resolved.' }
  const answer = section(lines, 'Answer', '##')
  if (!answer) return { ok: false, reason: 'no-answer', message: 'The decision has no Answer section.' }
  const order = section(answer, 'Playing order', '###')
  if (!order) return { ok: false, reason: 'no-playing-order', message: 'The Answer has no "Playing order" heading.' }

  const beats: ParsedBeat[] = []
  let movement = ''
  let current: { number: number; title: string; body: string[] } | null = null
  const flush = () => {
    if (!current) return
    beats.push({ key: beatKey(current.title), number: current.number, title: current.title,
      body: current.body.join(' ').replace(/\s+/g, ' ').trim(), movement })
    current = null
  }
  for (const raw of order) {
    const line = raw.trimEnd()
    const beat = BEAT_LINE.exec(line.trim())
    if (beat) { flush(); current = { number: Number(beat[1]), title: beat[2].trim(), body: beat[3] ? [beat[3]] : [] }; continue }
    const move = MOVEMENT_LINE.exec(line.trim())
    // A bold-only line at column 0 is a movement heading; indented bold lines belong to the beat body.
    if (move && line === line.trim()) { flush(); movement = move[1].trim(); continue }
    if (current && line.trim()) current.body.push(line.trim())
  }
  flush()
  if (beats.length === 0) return { ok: false, reason: 'no-beats', message: 'The Playing order has no numbered beats with bold titles.' }
  const seen = new Map<string, string>()
  for (const beat of beats) {
    const prior = seen.get(beat.key)
    if (prior !== undefined) return { ok: false, reason: 'duplicate-title', message: `Two beats share the title "${beat.title}" (also "${prior}"). Give them distinct titles in Story-drive.` }
    seen.set(beat.key, beat.title)
  }
  return { ok: true, beats, label: headers.get('beat-sheet') || null }
}
