import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryPatchSuggestionChip } from '../../client/src/components/memory/MemoryPatchSuggestionChip'

describe('MemoryPatchSuggestionChip', () => {
  it('renders a chip and calls onReopen when clicked', () => {
    const onReopen = vi.fn()
    render(<MemoryPatchSuggestionChip onReopen={onReopen} />)

    const chip = screen.getByRole('button', { name: /suggested update kept/i })
    expect(chip).toBeInTheDocument()

    fireEvent.click(chip)
    expect(onReopen).toHaveBeenCalledTimes(1)
  })
})
