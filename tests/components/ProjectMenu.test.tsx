import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ProjectMenu } from '../../client/src/components/shell/ProjectMenu'

function openMenu() {
  fireEvent.click(screen.getByRole('button', { name: 'Project actions' }))
}

describe('ProjectMenu', () => {
  it('shows an Export seed item when onExportSeed is provided and fires it on click', () => {
    const onExportSeed = vi.fn()
    render(
      <ProjectMenu onSave={vi.fn()} onRename={vi.fn()} onDelete={vi.fn()} onExportSeed={onExportSeed} />,
    )
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Export seed' }))
    expect(onExportSeed).toHaveBeenCalledTimes(1)
  })

  it('hides the Export seed item when onExportSeed is not provided', () => {
    render(<ProjectMenu onSave={vi.fn()} onRename={vi.fn()} onDelete={vi.fn()} />)
    openMenu()
    expect(screen.queryByRole('menuitem', { name: 'Export seed' })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Save' })).toBeInTheDocument()
  })
})
