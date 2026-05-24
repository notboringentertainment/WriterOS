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

  it('routes Final Draft import file selection from Home', () => {
    const onImportFdx = vi.fn()
    const { getByTestId } = render(
      <HomeSurface
        activeProjectId="project-1"
        projects={projects}
        onOpenProject={vi.fn()}
        onNewProject={vi.fn()}
        onImportFdx={onImportFdx}
      />
    )
    const file = new File(['<FinalDraft />'], 'Pilot.fdx', { type: 'application/xml' })

    fireEvent.click(screen.getByRole('button', { name: 'Import .fdx' }))
    fireEvent.change(getByTestId('home-fdx-import-input'), {
      target: { files: [file] },
    })

    expect(onImportFdx).toHaveBeenCalledWith(file)
  })

  it('shows Final Draft import errors without requiring a folder error', () => {
    render(
      <HomeSurface
        activeProjectId="project-1"
        projects={projects}
        onOpenProject={vi.fn()}
        onNewProject={vi.fn()}
        importError="This file is not valid Final Draft XML."
      />
    )

    expect(screen.getByText('This file is not valid Final Draft XML.')).toBeInTheDocument()
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

  it('shows a generic empty state when browser-local projects are empty without a filter', () => {
    render(
      <HomeSurface
        activeProjectId=""
        projects={[]}
        onOpenProject={vi.fn()}
        onNewProject={vi.fn()}
      />
    )

    expect(screen.getByText('No projects yet. Create your first project.')).toBeInTheDocument()
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

  it('shows scanned file-backed projects when a folder is connected', () => {
    const onOpenProject = vi.fn()
    render(
      <HomeSurface
        activeProjectId="project-1"
        projects={projects}
        folderProjects={[
          {
            id: 'folder-project-1',
            packageName: 'Harbor Lights (abc123ef).writeros',
            summary: {
              id: 'folder-project-1',
              title: 'Harbor Lights',
              createdAt: 500,
              updatedAt: 5000,
              format: 'feature',
              sceneCount: 8,
            },
            warnings: ['transcripts/writing-partner.json is missing; using an empty transcript.'],
          },
        ]}
        corruptFolderProjects={[
          {
            packageName: 'Broken.writeros',
            code: 'invalid-json',
            path: 'project.json',
            message: 'project.json is not valid JSON.',
            warnings: [],
          },
          {
            packageName: 'Also Broken.writeros',
            code: 'missing-file',
            path: 'project.json',
            message: 'project.json is missing from the WriterOS project package.',
            warnings: [],
          },
        ]}
        storageStatus={{
          status: 'ready',
          label: 'WriterOS Projects',
          defaultFolderLabel: '~/WriterOS Projects',
          fileSystemAccessSupported: true,
          folderPersistenceSupported: true,
          errorMessage: null,
        }}
        onOpenProject={onOpenProject}
        onOpenFolderProject={onOpenProject}
        onNewProject={vi.fn()}
      />
    )

    expect(screen.getByText('External folder')).toBeInTheDocument()
    expect(screen.getByText('WriterOS Projects')).toBeInTheDocument()
    expect(screen.getByText('2 project packages need attention')).toBeInTheDocument()
    expect(screen.getByText('Broken.writeros: project.json is not valid JSON.')).toBeInTheDocument()

    const list = screen.getByLabelText('Project list')
    expect(within(list).getByText('Harbor Lights')).toBeInTheDocument()
    expect(within(list).getByText(/Harbor Lights \(abc123ef\)\.writeros/)).toBeInTheDocument()
    expect(screen.queryByText('Current project')).not.toBeInTheDocument()

    const openButton = within(list).getByRole('button', { name: 'Open Harbor Lights' })
    fireEvent.click(openButton)
    expect(onOpenProject).toHaveBeenCalledWith('folder-project-1')
  })

  it('routes project folder actions', () => {
    const onChooseProjectFolder = vi.fn()
    const onRefreshProjectFolder = vi.fn()
    const onForgetProjectFolder = vi.fn()

    render(
      <HomeSurface
        activeProjectId="project-1"
        projects={projects}
        storageStatus={{
          status: 'ready',
          label: 'WriterOS Projects',
          defaultFolderLabel: '~/WriterOS Projects',
          fileSystemAccessSupported: true,
          folderPersistenceSupported: true,
          errorMessage: null,
        }}
        onOpenProject={vi.fn()}
        onNewProject={vi.fn()}
        onChooseProjectFolder={onChooseProjectFolder}
        onRefreshProjectFolder={onRefreshProjectFolder}
        onForgetProjectFolder={onForgetProjectFolder}
      />
    )

    fireEvent.click(screen.getAllByRole('button', { name: 'Change Folder' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    fireEvent.click(screen.getByRole('button', { name: 'Forget' }))

    expect(onChooseProjectFolder).toHaveBeenCalled()
    expect(onRefreshProjectFolder).toHaveBeenCalled()
    expect(onForgetProjectFolder).toHaveBeenCalled()
  })

  it('shows an explicit empty state when folder scanning fails', () => {
    render(
      <HomeSurface
        activeProjectId="project-1"
        projects={projects}
        folderProjects={[]}
        storageStatus={{
          status: 'error',
          label: 'WriterOS Projects',
          defaultFolderLabel: '~/WriterOS Projects',
          fileSystemAccessSupported: true,
          folderPersistenceSupported: true,
          errorMessage: null,
        }}
        onOpenProject={vi.fn()}
        onNewProject={vi.fn()}
      />
    )

    expect(screen.getByText('Unable to scan the project folder.')).toBeInTheDocument()
  })
})
