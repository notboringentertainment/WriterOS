import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { StructureSpine } from '../../client/src/components/shell/StructureSpine'
import type { SurfaceStructure } from '../../client/src/lib/leftZone'

const structure: SurfaceStructure = {
  surface: 'outline',
  heading: 'Outline',
  nodes: [
    { id: 'a1', label: 'Act One', detail: '3 beats' },
    { id: 'a2', label: 'Act Two', detail: '5 beats' },
  ],
  empty: false,
}

describe('StructureSpine (Surface Map)', () => {
  it('renders the active surface section labels', () => {
    render(<StructureSpine structure={structure} />)
    expect(screen.getByText('Act One')).toBeInTheDocument()
    expect(screen.getByText('Act Two')).toBeInTheDocument()
  })

  it('renders an honest empty state instead of inventing structure', () => {
    render(
      <StructureSpine
        structure={{ surface: 'outline', heading: 'Outline', nodes: [], empty: true, emptyHint: 'No beats yet — build the outline.' }}
      />
    )
    expect(screen.getByText('No beats yet — build the outline.')).toBeInTheDocument()
  })

  it('is display-only — nodes are not interactive controls', () => {
    // Guard against re-introducing fake navigation: the map must never present clickable
    // buttons/links until real navigation exists.
    const { container } = render(<StructureSpine structure={structure} />)
    expect(within(container).queryAllByRole('button')).toHaveLength(0)
    expect(within(container).queryAllByRole('link')).toHaveLength(0)
    expect(container.querySelectorAll('a, button')).toHaveLength(0)
  })
})
