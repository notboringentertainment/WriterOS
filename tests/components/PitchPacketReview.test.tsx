import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PitchPacketReview } from '../../client/src/components/ritual/PitchPacketReview'
import type { PitchPacket } from '../../shared/pitchPacket'

const field = <T,>(value: T, origin: 'document' | 'meeting' | 'writer' | 'ai_proposed' = 'document', approved = false) => ({ value, origin, approved, sourceRef: `${origin}:test` })
function row() {
  const packet: PitchPacket = {
    packetVersion: 1, projectId: 'p1', exportedAt: '2026-07-14T00:00:00Z', directionRevision: 2,
    title: field('Ace'), logline: field('A handler takes one last job.', 'ai_proposed'), format: field('Feature'), genre: field('Thriller'),
    tone: field('Tense'), premise: field('Loyalty becomes a weapon.'), storyEngine: field('', 'writer'),
    coreCharacters: field([{ name: 'Ace', role: 'handler', want: 'Retire', need: 'Trust', flawOrWound: 'Control', secretOrContradiction: 'She caused it', arc: 'Chooses truth' }]),
    locks: field([{ statement: 'Ace lives.', originMarker: '[SEED]' }], 'meeting'), openQuestions: field([], 'meeting'),
  }
  return { id: 'packet-1', project_id: 'p1', session_id: 's1', packet, packet_version: 1, status: 'draft' as const, direction_revision: 2, created_at: 'now', exported_at: null }
}

describe('PitchPacketReview', () => {
  it('shows origins, approval guidance, edits as writer-owned, and gates packet approval', async () => {
    const onSave = vi.fn(async () => undefined)
    const onApprove = vi.fn(async () => undefined)
    render(<PitchPacketReview row={row()} proposalUnavailable={false} onSave={onSave} onApprove={onApprove} onExport={vi.fn()} onRedownload={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Pitch Packet review' })).toBeInTheDocument()
    expect(screen.getAllByText('From your documents').length).toBeGreaterThan(0)
    expect(screen.getAllByText('From the Meeting').length).toBeGreaterThan(0)
    expect(screen.getByText('Suggested — needs your approval')).toBeInTheDocument()
    expect(screen.getByText('Approve every required field to export.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve packet' })).toBeDisabled()

    fireEvent.change(screen.getByLabelText('storyEngine value'), { target: { value: 'Every rescue exposes a deeper betrayal.' } })
    expect(screen.getByText('You wrote this')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve storyEngine' })).toBeEnabled()
  })

  it('shows proposal failure guidance without preventing writer edits', () => {
    render(<PitchPacketReview row={row()} proposalUnavailable onSave={vi.fn()} onApprove={vi.fn()} onExport={vi.fn()} onRedownload={vi.fn()} />)
    expect(screen.getByText(/Suggestions are unavailable/)).toBeInTheDocument()
    expect(screen.getByLabelText('storyEngine value')).toBeEnabled()
  })

  it('resolves a source conflict and saves the writer-reviewed draft', async () => {
    const conflicted = row()
    conflicted.packet.tone = {
      value: 'Tense', origin: 'document', approved: false, sourceRef: 'treatment.concept.tone', conflict: true,
      candidates: [
        { value: 'Tense', origin: 'document', sourceRef: 'treatment.concept.tone' },
        { value: 'Dreamlike', origin: 'document', sourceRef: 'storyBible.toneAndStyle.toneWords' },
      ],
    }
    const onSave = vi.fn(async () => undefined)
    render(<PitchPacketReview row={conflicted} proposalUnavailable={false} onSave={onSave} onApprove={vi.fn()} onExport={vi.fn()} onRedownload={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Dreamlike' }))
    expect(screen.getByLabelText('tone value')).toHaveValue('Dreamlike')
    fireEvent.click(screen.getByRole('button', { name: 'Approve tone' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ tone: expect.objectContaining({ value: 'Dreamlike', approved: true, conflict: undefined }) }))
  })
})
