import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { HomeSurface } from '../../client/src/components/home/HomeSurface'

const projects = [
  {
    id: 'project-1',
    title: 'The Salt Line',
    createdAt: 1000,
    updatedAt: 3000,
    format: 'feature' as const,
    sceneCount: 12,
  },
  {
    id: 'project-2',
    title: 'Quiet Frequencies',
    createdAt: 2000,
    updatedAt: 2000,
    format: 'series' as const,
    sceneCount: 3,
  },
]

describe('HomeSurface', () => {
  it('shows storage status, current project, and project rows', () => {
    render(
      <HomeSurface
        activeProjectId="project-1"
        projects={projects}
        onOpenProject={vi.fn()}
        onNewProject={vi.fn()}
      />
    )

    expect(screen.getByRole('heading', { name: 'Projects' })).toBeInTheDocument()
    expect(screen.getByText('Browser fallback')).toBeInTheDocument()
    expect(screen.getByText('Not connected')).toBeInTheDocument()
    const list = screen.getByLabelText('Project list')
    expect(within(list).getByText('The Salt Line')).toBeInTheDocument()
    expect(within(list).getByText('Quiet Frequencies')).toBeInTheDocument()
  })

  it('opens the selected project', () => {
    const onOpenProject = vi.fn()
    render(
      <HomeSurface
        activeProjectId="project-1"
        projects={projects}
        onOpenProject={onOpenProject}
        onNewProject={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Open Quiet Frequencies' }))

    expect(onOpenProject).toHaveBeenCalledWith('project-2')
  })

  it('creates a new project from Home', () => {
    const onNewProject = vi.fn()
    render(
      <HomeSurface
        activeProjectId="project-1"
        projects={projects}
        onOpenProject={vi.fn()}
        onNewProject={onNewProject}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'New Project' }))

    expect(onNewProject).toHaveBeenCalled()
  })

  it('filters projects by title', () => {
    render(
      <HomeSurface
        activeProjectId="project-1"
        projects={projects}
        onOpenProject={vi.fn()}
        onNewProject={vi.fn()}
      />
    )

    fireEvent.change(screen.getByLabelText('Filter projects'), {
      target: { value: 'quiet' },
    })

    const list = screen.getByLabelText('Project list')
    expect(within(list).queryByText('The Salt Line')).not.toBeInTheDocument()
    expect(within(list).getByText('Quiet Frequencies')).toBeInTheDocument()
  })

  it('sorts projects by title', () => {
    render(
      <HomeSurface
        activeProjectId="project-1"
        projects={projects}
        onOpenProject={vi.fn()}
        onNewProject={vi.fn()}
      />
    )

    fireEvent.change(screen.getByLabelText('Sort projects'), {
      target: { value: 'title' },
    })

    const rows = screen.getAllByRole('article')
    expect(within(rows[0]).getByText('Quiet Frequencies')).toBeInTheDocument()
    expect(within(rows[1]).getByText('The Salt Line')).toBeInTheDocument()
  })
})
