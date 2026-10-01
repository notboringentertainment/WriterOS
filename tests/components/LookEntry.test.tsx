import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { CharacterLookButton, LookEntryButton, PromotedLooksLine } from '../../client/src/components/writing/looks/LookEntryButton'
import { LookSessionsProvider, type LookSessionsContextValue } from '../../client/src/lib/lookSessionsContext'

function withLooks(ui: React.ReactElement, overrides: Partial<LookSessionsContextValue> = {}) {
  const value: LookSessionsContextValue = { openLook: vi.fn(), characterNames: ['Vector Engineer'], promotedLooks: [], ...overrides }
  render(<LookSessionsProvider value={value}>{ui}</LookSessionsProvider>)
  return value
}

describe('look entry points', () => {
  it('render nothing outside a project (no provider)', () => {
    const { container } = render(<><LookEntryButton beatTitle="Opening" /><CharacterLookButton name="Ash" /><PromotedLooksLine text="Ash" /></>)
    expect(container).toBeEmptyDOMElement()
  })

  it('a beat opens a look for a Story Bible character or a named location', () => {
    const value = withLooks(<LookEntryButton beatTitle="Opening" />)
    fireEvent.click(screen.getByRole('button', { name: 'Start a look' }))
    fireEvent.change(screen.getByLabelText('Who or where is this look for?'), { target: { value: 'Vector Engineer' } })
    fireEvent.click(screen.getByRole('button', { name: 'Open look' }))
    expect(value.openLook).toHaveBeenCalledWith({ entityKind: 'character', entityId: 'vector-engineer', entityName: 'Vector Engineer' })
    fireEvent.click(screen.getByRole('button', { name: 'Start a look' }))
    fireEvent.change(screen.getByLabelText('Who or where is this look for?'), { target: { value: '__location__' } })
    fireEvent.change(screen.getByLabelText('Location name'), { target: { value: 'The Salt Dock' } })
    fireEvent.click(screen.getByRole('button', { name: 'Open look' }))
    expect(value.openLook).toHaveBeenLastCalledWith({ entityKind: 'location', entityId: 'the-salt-dock', entityName: 'The Salt Dock' })
  })

  it('the character card button opens that character and says when a look is promoted', () => {
    const value = withLooks(<CharacterLookButton name="Vector Engineer" />, {
      promotedLooks: [{ recordId: 'm', entityKind: 'character', entityId: 'vector-engineer', entityName: 'Vector Engineer', lookHash: 'x', reference: 'none' as const, spec: {} as never }],
    })
    fireEvent.click(screen.getByRole('button', { name: 'Look · promoted' }))
    expect(value.openLook).toHaveBeenCalledWith({ entityKind: 'character', entityId: 'vector-engineer', entityName: 'Vector Engineer' })
  })

  it('a beat that names a promoted look shows it, read-only', () => {
    withLooks(<PromotedLooksLine text={'The dinner.\nVector Engineer sets the table.'} />, {
      promotedLooks: [{ recordId: 'm', entityKind: 'character', entityId: 'vector-engineer', entityName: 'Vector Engineer', lookHash: 'x', reference: 'none' as const, spec: {} as never }],
    })
    expect(screen.getByText('Look promoted: Vector Engineer')).toBeInTheDocument()
  })
})
