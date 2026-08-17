import { describe, expect, it } from 'vitest'
import { LOCKS_PREFACE, OPEN_QUESTIONS_PREFACE } from '../../shared/seedMarkdown'
import { pitchPacketFileNames, renderPitchPacketJson, renderPitchPacketMarkdown, type PitchPacket } from '../../shared/pitchPacket'

const approved = <T>(value: T, sourceRef = 'writer:test') => ({ value, origin: 'writer' as const, approved: true, sourceRef })

const packet: PitchPacket = {
  packetVersion: 1, projectId: 'p1', exportedAt: '2026-07-14T12:00:00.000Z', directionRevision: 9,
  title: approved('Ace: Handler'), logline: approved('A handler faces her last impossible client.'), format: approved('Feature'),
  genre: approved('Thriller'), tone: approved('Tense and humane'), premise: approved('Loyalty becomes a weapon.'), storyEngine: approved('Each alliance creates a worse betrayal.'),
  coreCharacters: approved([{ name: 'Ace', role: 'handler', want: 'Retire', need: 'Trust', flawOrWound: 'Control', secretOrContradiction: 'She made the threat', arc: 'Chooses truth' }]),
  locks: approved([{ statement: 'Ace lives.', originMarker: '[SEED]' }]),
  openQuestions: approved([{ text: 'Who sent the client?', category: 'Story' }]), comps: approved(['Michael Clayton']), device: approved('24-hour clock'),
}

describe('Pitch Packet renderers', () => {
  it('renders contracted YAML frontmatter and real Markdown sections with shared prefaces', () => {
    const markdown = renderPitchPacketMarkdown(packet)
    expect(markdown).toContain('packet_version: 1')
    expect(markdown).toContain('direction_revision: 9')
    expect(markdown).toContain('## Premise')
    expect(markdown).toContain('## Story Engine')
    expect(markdown).toContain('## Core Characters')
    expect(markdown).toContain('## Locks — do not violate')
    expect(markdown).toContain(LOCKS_PREFACE)
    expect(markdown).toContain(OPEN_QUESTIONS_PREFACE)
    expect(markdown.endsWith('\n')).toBe(true)
  })

  it('pretty-prints deterministic JSON and builds the contracted filenames', () => {
    expect(renderPitchPacketJson(packet)).toBe(`${JSON.stringify(packet, null, 2)}\n`)
    expect(pitchPacketFileNames(packet)).toEqual({ markdown: 'ace-handler-pitch-packet-v1-r9.md', json: 'ace-handler-pitch-packet-v1-r9.json' })
  })
})
