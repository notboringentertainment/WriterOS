import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { ComponentProps } from 'react'
import { LookPanel } from '../../client/src/components/writing/looks/LookPanel'
import { WritersRoom } from '../../client/src/components/writing/WritersRoom'
import { defaultProjectState, type TranscriptMessage } from '../../client/src/lib/projectState'
import { ensureDraft, setDraftField, setDraftReference, type LookTarget } from '../../client/src/lib/lookDraftEdits'
import { LookRequestUnanswered } from '../../client/src/lib/looksClient'
import { emptyLooks, type LookDraft, type LooksDocument } from '../../shared/looks'

const NOW = '2026-09-30T12:00:00.000Z'
const character: LookTarget = { entityKind: 'character', entityId: 'vector-engineer', entityName: 'Vector Engineer' }
const location: LookTarget = { entityKind: 'location', entityId: 'vector-station', entityName: 'Vector Station' }
const fixture = (name: string) => JSON.parse(readFileSync(resolve(__dirname, '../fixtures/lookSpec', name), 'utf8')) as Record<string, unknown>

function draftWith(target: LookTarget, fields: Record<string, unknown> = {}, reference: LookDraft['reference'] = 'unasked'): LookDraft {
  let doc: LooksDocument = ensureDraft(emptyLooks(), target, 'session-1', NOW)
  for (const [field, value] of Object.entries(fields)) doc = setDraftField(doc, target, field, value, NOW)
  doc = setDraftReference(doc, target, reference, NOW)
  return doc.drafts[`${target.entityKind}:${target.entityId}`]
}

/** Every writer field of the synthetic character, as if typed into the form. */
function completeCharacter(reference: LookDraft['reference'] = 'none'): LookDraft {
  const { version: _v, depends_on: _d, entity_kind: _k, ...fields } = fixture('synthetic-character.json')
  return draftWith(character, { ...fields, entity_id: 'vector-engineer' }, reference)
}

function renderPanel(overrides: Partial<ComponentProps<typeof LookPanel>> = {}) {
  const props: ComponentProps<typeof LookPanel> = {
    target: character,
    draft: draftWith(character),
    messages: [],
    sending: false,
    onSend: vi.fn(),
    prior: undefined,
    memoryRevision: 3,
    onField: vi.fn(),
    onClear: vi.fn(),
    onReference: vi.fn(),
    promote: vi.fn(),
    reexport: vi.fn().mockResolvedValue(undefined),
    onPromoted: vi.fn(),
    onMemoryStale: vi.fn(),
    onExit: vi.fn(),
    ...overrides,
  }
  const view = render(<LookPanel {...props} />)
  return { props, ...view }
}

describe('Look form', () => {
  it('shows character fields for a character and location fields for a location', () => {
    renderPanel()
    expect(screen.getByLabelText('Age band')).toBeInTheDocument()
    expect(screen.getByLabelText('Default wardrobe')).toBeInTheDocument()
    expect(screen.queryByLabelText('Palette anchors')).toBeNull()
  })

  it('location branch', () => {
    renderPanel({ target: location, draft: draftWith(location) })
    expect(screen.getByLabelText('Palette anchors')).toBeInTheDocument()
    expect(screen.getByLabelText('Time of day')).toBeInTheDocument()
    expect(screen.queryByLabelText('Age band')).toBeNull()
  })

  it('casting-inspiration hides face-level free text and shows the firewall line', () => {
    renderPanel({ draft: draftWith(character, {}, 'casting-inspiration') })
    expect(screen.getByRole('note')).toHaveTextContent('describes type only')
    expect(screen.getByLabelText('Hair, as a category')).toBeInTheDocument()
    expect(screen.getByLabelText('None with a real-person reference.')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Distinguishing marks' })).toBeNull()
  })

  it('typing calls onField with the field and value; the reference is a word', () => {
    const { props } = renderPanel()
    fireEvent.change(screen.getByLabelText('Hair'), { target: { value: 'cropped' } })
    expect(props.onField).toHaveBeenCalledWith('hair', 'cropped')
    fireEvent.change(screen.getByLabelText('Continuity risks'), { target: { value: 'hair drifts\ncoat changes\n' } })
    expect(props.onField).toHaveBeenCalledWith('continuity_risks', ['hair drifts', 'coat changes'])
    fireEvent.click(screen.getByRole('button', { name: 'Generated elsewhere' }))
    expect(props.onReference).toHaveBeenCalledWith('generated-elsewhere')
    fireEvent.click(screen.getAllByRole('button', { name: 'No' })[1])
    expect(props.onField).toHaveBeenCalledWith('minor', false)
  })

  it('a Zoe reply containing field values never reaches the form', () => {
    const reply: TranscriptMessage = {
      id: 'z1', role: 'assistant', speaker: 'Zoe', ts: 1, lookSessionId: 'session-1',
      content: 'hair: grey\nage_band: forties\n{"hair":"grey"}',
    }
    const { props } = renderPanel({ messages: [reply] })
    expect(screen.getByText(/hair: grey/)).toBeInTheDocument()
    expect(props.onField).not.toHaveBeenCalled()
    expect((screen.getByLabelText('Hair') as HTMLInputElement).value).toBe('')
  })
})

describe('Promote', () => {
  it('is disabled until the look is valid, and lists what is missing in plain words', () => {
    renderPanel()
    expect(screen.getByRole('button', { name: 'Promote to canon' })).toBeDisabled()
    expect(screen.getByText(/Still to fill:/)).toHaveTextContent('Age band')
    expect(screen.getByText('Answer the reference-image question first.')).toBeInTheDocument()
  })

  it('is enabled for a complete look and sends writer provenance, reference and the memory revision', async () => {
    const promote = vi.fn().mockResolvedValue({ ok: true, response: {
      recordId: 'mem_x', lookHash: 'a'.repeat(64), memoryRevision: 4, exportPath: 'memory/exports/look-locks-4.json',
      exportWritten: true, supersededRecordId: null, retried: false } })
    const { props } = renderPanel({ draft: completeCharacter(), promote })
    const button = screen.getByRole('button', { name: 'Promote to canon' })
    expect(button).toBeEnabled()
    await act(async () => { fireEvent.click(button) })
    const body = promote.mock.calls[0][0]
    expect(body.reference).toBe('none')
    expect(body.expectedRevision).toBe(3)
    expect(body.spec.version).toBeUndefined()
    expect(body.spec.depends_on).toBeUndefined()
    expect(Object.keys(body.spec).every((field: string) => body.fieldSources[field] === 'writer')).toBe(true)
    expect(props.onPromoted).toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('Promoted · look_hash aaaaaaaaaaaa · awaiting Front Lot ratification')
    expect(screen.getByText(/--source writeros/)).toBeInTheDocument()
  })

  it('shows the server problems as sentences on a 400', async () => {
    const promote = vi.fn().mockResolvedValue({ ok: false, status: 400, error: 'firewall', message: 'With a real person as the reference, the look may describe type only.',
      problems: [{ path: 'prompt_safe_description', message: 'With a real person as the reference, describe type only; "eyes" describes the face.' }] })
    renderPanel({ draft: completeCharacter(), promote })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Promote to canon' })) })
    expect(screen.getByRole('alert')).toHaveTextContent('may describe type only')
    expect(screen.getByText(/"eyes" describes the face/)).toBeInTheDocument()
  })

  it('a 409 says memory moved on and refreshes memory', async () => {
    const promote = vi.fn().mockResolvedValue({ ok: false, status: 409, error: 'revision-conflict', message: 'x', problems: [] })
    const { props } = renderPanel({ draft: completeCharacter(), promote })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Promote to canon' })) })
    expect(screen.getByRole('alert')).toHaveTextContent('Memory moved on; reload and try again.')
    expect(props.onMemoryStale).toHaveBeenCalled()
  })

  it('an unanswered click is retried with the same promotion id; a new click after an answer gets a new one', async () => {
    const promote = vi.fn()
      .mockRejectedValueOnce(new LookRequestUnanswered('The server did not answer.'))
      .mockResolvedValueOnce({ ok: false, status: 400, error: 'invalid-look', message: 'no', problems: [] })
      .mockResolvedValueOnce({ ok: false, status: 400, error: 'invalid-look', message: 'no', problems: [] })
    renderPanel({ draft: completeCharacter(), promote })
    const click = async () => act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Promote to canon' })) })
    await click()
    expect(screen.getByRole('alert')).toHaveTextContent('Click Promote again to retry')
    await click()
    await click()
    const ids = promote.mock.calls.map(call => call[0].promotionOpId)
    expect(ids[0]).toBe(ids[1])
    expect(ids[2]).not.toBe(ids[1])
  })

  it('a failed export write offers Re-export', async () => {
    const promote = vi.fn().mockResolvedValue({ ok: true, response: {
      recordId: 'mem_x', lookHash: 'b'.repeat(64), memoryRevision: 4, exportPath: '', exportWritten: false, supersededRecordId: null, retried: false } })
    const { props } = renderPanel({ draft: completeCharacter(), promote })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Promote to canon' })) })
    expect(screen.getByText('Promoted, but the export file was not written. Click Re-export.')).toBeInTheDocument()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Re-export' })) })
    expect(props.reexport).toHaveBeenCalled()
    expect(screen.getByText('Export written. OpenMontage can read it now.')).toBeInTheDocument()
  })

  it('says a promoted look already exists and that promoting replaces it', () => {
    renderPanel({ prior: { recordId: 'mem_p', entityKind: 'character', entityId: 'vector-engineer', entityName: 'Vector Engineer', lookHash: 'c'.repeat(64), reference: 'none' as const, spec: {} as never } })
    expect(screen.getByText(/A promoted look already exists/)).toHaveTextContent('cccccccccccc')
  })

  it('without a server library, Promote explains why it is unavailable', () => {
    renderPanel({ draft: completeCharacter(), promote: undefined })
    expect(screen.getByRole('button', { name: 'Promote to canon' })).toBeDisabled()
    expect(screen.getByText(/needs this project open from the WriterOS project folder/)).toBeInTheDocument()
  })
})

describe('Start from the promoted look', () => {
  const prior = (spec: Record<string, unknown>, reference: LookDraft['reference'] = 'none') => ({
    recordId: 'mem_p', entityKind: 'character' as const, entityId: 'vector-engineer', entityName: 'Vector Engineer',
    lookHash: 'c'.repeat(64), reference: reference as 'none', spec: spec as never,
  })

  it('offers it only when a look is promoted and the draft is still empty', () => {
    const onStart = vi.fn()
    const { unmount } = renderPanel({ prior: prior({}), onStartFromPromoted: onStart })
    fireEvent.click(screen.getByRole('button', { name: 'Start from the promoted look' }))
    expect(onStart).toHaveBeenCalled()
    unmount()
    renderPanel({ prior: prior({}), draft: draftWith(character, { hair: 'cropped' }), onStartFromPromoted: vi.fn() })
    expect(screen.queryByRole('button', { name: 'Start from the promoted look' })).toBeNull()
  })

  it('is absent with no promoted look', () => {
    renderPanel({ onStartFromPromoted: vi.fn() })
    expect(screen.queryByRole('button', { name: 'Start from the promoted look' })).toBeNull()
  })

  it('blocks Promote while the draft is identical to the promoted look', () => {
    const draft = completeCharacter('none')
    const { version: _v, depends_on: _d, ...fields } = { ...draft.spec, version: '1.1', depends_on: [] }
    renderPanel({ draft, prior: prior({ ...fields, version: '1.1', depends_on: [] }, 'none') })
    expect(screen.getByRole('button', { name: 'Promote to canon' })).toBeDisabled()
    expect(screen.getByText(/identical to the promoted look/)).toBeInTheDocument()
  })
})

describe('Writers Room', () => {
  it('keeps look-session messages out of Zoe\'s ordinary chat', () => {
    const state = defaultProjectState()
    state.agents.zoe.transcript = [
      { id: 'a', role: 'user', content: 'Ordinary question', speaker: 'Writer', ts: 1 },
      { id: 'b', role: 'user', content: 'Look question', speaker: 'Writer', ts: 2, lookSessionId: 'look_1' },
    ]
    render(<WritersRoom projectState={state} onSendToSpecialist={vi.fn()} />)
    fireEvent.click(screen.getAllByRole('button').find(button => button.textContent?.includes('Zoe'))!)
    expect(screen.getByText('Ordinary question')).toBeInTheDocument()
    expect(screen.queryByText('Look question')).toBeNull()
  })
})

describe('Look review fixes', () => {
  it('after Promote, the next-step command names the id the writer promoted, not the opening id', async () => {
    const promote = vi.fn().mockResolvedValue({ ok: true, response: {
      recordId: 'mem_x', lookHash: 'a'.repeat(64), memoryRevision: 4, exportPath: 'memory/exports/look-locks-4.json',
      exportWritten: true, supersededRecordId: null, retried: false } })
    const draft = { ...completeCharacter(), spec: { ...completeCharacter().spec, entity_id: 'custom-joe' } }
    const { props, rerender } = renderPanel({ draft, promote })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Promote to canon' })) })
    rerender(<LookPanel {...props} draft={undefined} />)
    expect(screen.getByText(/--entity custom-joe/)).toBeInTheDocument()
  })

  it('a promotion that finishes after the panel closed does not call back', async () => {
    let resolve!: (value: unknown) => void
    const promote = vi.fn().mockReturnValue(new Promise(r => { resolve = r }))
    const { props, unmount } = renderPanel({ draft: completeCharacter(), promote })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Promote to canon' })) })
    unmount()
    await act(async () => { resolve({ ok: true, response: {
      recordId: 'mem_x', lookHash: 'a'.repeat(64), memoryRevision: 4, exportPath: 'p', exportWritten: true, supersededRecordId: null, retried: false } }) })
    expect(props.onPromoted).not.toHaveBeenCalled()
  })

  it('typing a wardrobe variant letter by letter keeps exactly what was typed', () => {
    let draft = draftWith(character)
    const onField = vi.fn((field: string, value: unknown) => {
      draft = { ...draft, spec: { ...draft.spec, [field]: value } }
      view.rerender(<LookPanel {...view.props} draft={draft} onField={onField} />)
    })
    const view = renderPanel({ draft, onField })
    const box = () => screen.getByLabelText('Wardrobe variants') as HTMLTextAreaElement
    for (const ch of 'wet: rain') fireEvent.change(box(), { target: { value: box().value + ch } })
    expect(box().value).toBe('wet: rain')
    expect(draft.spec.wardrobe_variants).toEqual([{ name: 'wet', when: 'rain' }])
  })
})

