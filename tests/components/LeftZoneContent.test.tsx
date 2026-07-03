import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { StructureSpine } from '../../client/src/components/shell/StructureSpine'
import { ContextConsole } from '../../client/src/components/shell/ContextConsole'
import type { SurfaceStructure, ConsoleState } from '../../client/src/lib/leftZone'

describe('StructureSpine', () => {
  it('renders the surface heading and its nodes with details', () => {
    const structure: SurfaceStructure = {
      surface: 'outline',
      heading: 'Outline',
      empty: false,
      nodes: [
        { id: 'a', label: 'Cold open', detail: 'Act 1' },
        { id: 'b', label: 'Beat 2' },
      ],
    }
    render(<StructureSpine structure={structure} />)
    expect(screen.getByText('Outline')).toBeInTheDocument()
    expect(screen.getByText('Cold open')).toBeInTheDocument()
    expect(screen.getByText('Act 1')).toBeInTheDocument()
    expect(screen.getByText('Beat 2')).toBeInTheDocument()
  })

  it('shows the honest empty hint when there are no nodes', () => {
    const structure: SurfaceStructure = {
      surface: 'script',
      heading: 'Script',
      empty: true,
      nodes: [],
      emptyHint: 'No scenes yet — import or write a script.',
    }
    render(<StructureSpine structure={structure} />)
    expect(screen.getByText('No scenes yet — import or write a script.')).toBeInTheDocument()
  })
})

describe('ContextConsole', () => {
  it('renders title, surface, persona and counts', () => {
    const state: ConsoleState = {
      title: 'The Long Hallway',
      surface: 'outline',
      surfaceLabel: 'Outline',
      persona: 'Morgan (@Oliver)',
      counts: [{ label: 'beats', value: 12 }],
    }
    render(<ContextConsole state={state} />)
    const region = screen.getByLabelText('Project state')
    expect(within(region).getByText('The Long Hallway')).toBeInTheDocument()
    expect(within(region).getByText('Outline')).toBeInTheDocument()
    expect(within(region).getByText('Morgan (@Oliver)')).toBeInTheDocument()
    expect(within(region).getByText('12')).toBeInTheDocument()
    expect(within(region).getByText('beats')).toBeInTheDocument()
  })
})
