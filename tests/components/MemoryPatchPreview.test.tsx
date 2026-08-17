import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryPatchPreview } from '../../client/src/components/memory/MemoryPatchPreview'
import type { MemoryGroundedPatch } from '@shared/memoryPatches'

function makePatch(overrides: Partial<MemoryGroundedPatch> = {}): MemoryGroundedPatch {
  return {
    kind: 'structured-document',
    surface: 'storyBible',
    baseVersion: 3,
    proposedContent: {},
    changedPaths: ['premiseAndWorld.worldRules', 'toneAndStyle.pacingRules'],
    memoryIds: ['[M-ABCD-1234]'],
    ...overrides,
  }
}

describe('MemoryPatchPreview', () => {
  it('shows the surface name, rationale, changed fields, and cited memories', () => {
    render(
      <MemoryPatchPreview
        patch={makePatch()}
        rationale="Aligns the world rules with what was decided in Writer's Room."
        canonConflicts={[]}
        citations={[{ id: '[M-ABCD-1234]', workflow: 'writeros-room', sourceUri: 'writeros-room://project/1/turn/9' }]}
        onApply={() => {}}
        onKeepAsSuggestion={() => {}}
        onDismiss={() => {}}
      />,
    )

    expect(screen.getByText('Suggested update to Story Bible')).toBeInTheDocument()
    expect(screen.getByText("Aligns the world rules with what was decided in Writer's Room.")).toBeInTheDocument()
    expect(screen.getByText('premiseAndWorld.worldRules')).toBeInTheDocument()
    expect(screen.getByText('toneAndStyle.pacingRules')).toBeInTheDocument()
    expect(screen.getByText('[M-ABCD-1234]')).toBeInTheDocument()
    expect(screen.getByText("Writer's Room")).toBeInTheDocument()
    expect(screen.getByText('writeros-room://project/1/turn/9')).toBeInTheDocument()
  })

  it('shows canon conflicts only when there are some', () => {
    const { rerender } = render(
      <MemoryPatchPreview
        patch={makePatch()}
        rationale="R"
        canonConflicts={[]}
        citations={[]}
        onApply={() => {}}
        onKeepAsSuggestion={() => {}}
        onDismiss={() => {}}
      />,
    )
    expect(screen.queryByText('Canon conflicts')).not.toBeInTheDocument()

    rerender(
      <MemoryPatchPreview
        patch={makePatch()}
        rationale="R"
        canonConflicts={['World rule contradicts active canon: no travel after dark.']}
        citations={[]}
        onApply={() => {}}
        onKeepAsSuggestion={() => {}}
        onDismiss={() => {}}
      />,
    )
    expect(screen.getByText('Canon conflicts')).toBeInTheDocument()
    expect(screen.getByText('World rule contradicts active canon: no travel after dark.')).toBeInTheDocument()
  })

  it('renders exactly the three required buttons and wires their callbacks', () => {
    const onApply = vi.fn()
    const onKeepAsSuggestion = vi.fn()
    const onDismiss = vi.fn()

    render(
      <MemoryPatchPreview
        patch={makePatch()}
        rationale="R"
        canonConflicts={[]}
        citations={[]}
        onApply={onApply}
        onKeepAsSuggestion={onKeepAsSuggestion}
        onDismiss={onDismiss}
      />,
    )

    expect(screen.getByRole('button', { name: 'Apply' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Keep as suggestion' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(3)

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(onApply).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Keep as suggestion' }))
    expect(onKeepAsSuggestion).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('disables the buttons while applying', () => {
    render(
      <MemoryPatchPreview
        patch={makePatch()}
        rationale="R"
        canonConflicts={[]}
        citations={[]}
        applying
        onApply={() => {}}
        onKeepAsSuggestion={() => {}}
        onDismiss={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Keep as suggestion' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeDisabled()
  })

  it('shows an apply error inline rather than in a modal', () => {
    render(
      <MemoryPatchPreview
        patch={makePatch()}
        rationale="R"
        canonConflicts={[]}
        citations={[]}
        applyError="This suggestion is out of date because the document changed — ask for a new version."
        onApply={() => {}}
        onKeepAsSuggestion={() => {}}
        onDismiss={() => {}}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('This suggestion is out of date because the document changed')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
