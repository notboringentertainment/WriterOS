import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
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
  it('shows folder status, current project, and project rows', () => {
    render(
      <HomeSurface
        activeProjectId="project-1"
        projects={projects}
        onOpenProject={vi.fn()}
        onNewProject={vi.fn()}
      />
    )

    expect(screen.getByRole('heading', { name: 'Projects' })).toBeInTheDocument()
    expect(screen.getByText('Not connected')).toBeInTheDocument()
    expect(screen.getByText('Choose any folder')).toBeInTheDocument()
    expect(screen.queryByText('Browser fallback')).not.toBeInTheDocument()
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

  it('shows Project Meeting standing chips and opens the meeting for that project', () => {
    const onOpenProjectMeeting = vi.fn()
    render(
      <HomeSurface
        activeProjectId="project-1"
        projects={projects}
        onOpenProject={vi.fn()}
        onNewProject={vi.fn()}
        projectMeetingStandings={{ 'project-1': 'paused', 'project-2': 'not_started' }}
        onOpenProjectMeeting={onOpenProjectMeeting}
      />
    )

    expect(screen.getByRole('button', { name: 'Project Meeting for The Salt Line: paused' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Project Meeting for Quiet Frequencies: not started' }))
    expect(onOpenProjectMeeting).toHaveBeenCalledWith('project-2', 'browser')
  })

  it('omits meeting chips when no standings are provided', () => {
    render(
      <HomeSurface
        activeProjectId="project-1"
        projects={projects}
        onOpenProject={vi.fn()}
        onNewProject={vi.fn()}
      />
    )

    expect(screen.queryByRole('button', { name: /Project Meeting for/ })).not.toBeInTheDocument()
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

  it('shows Final Draft import errors alongside storage errors', () => {
    render(
      <HomeSurface
        activeProjectId="project-1"
        projects={projects}
        storageStatus={{
          status: 'error',
          label: "Ben's Projects",
          defaultFolderLabel: 'Selected folder',
          fileSystemAccessSupported: true,
          folderPersistenceSupported: true,
          errorMessage: 'Unable to scan the project folder.',
        }}
        onOpenProject={vi.fn()}
        onNewProject={vi.fn()}
        importError="This file is not valid Final Draft XML."
      />
    )

    const status = screen.getByRole('status')
    expect(within(status).getByText('Unable to scan the project folder.')).toBeInTheDocument()
    expect(within(status).getByText('This file is not valid Final Draft XML.')).toBeInTheDocument()
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

    expect(
      screen.getByText('No projects yet. Create a new project or import a Final Draft .fdx to get started.')
    ).toBeInTheDocument()
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
          label: "Ben's Projects",
          defaultFolderLabel: 'Selected folder',
          fileSystemAccessSupported: true,
          folderPersistenceSupported: true,
          errorMessage: null,
        }}
        onOpenProject={onOpenProject}
        onOpenFolderProject={onOpenProject}
        onNewProject={vi.fn()}
      />
    )

    expect(screen.getByText("Ben's Projects")).toBeInTheDocument()
    expect(screen.getByText('Remembered in this browser')).toBeInTheDocument()
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

  it('routes file-backed show-in-folder and duplicate actions', () => {
    const onShowProjectInFolder = vi.fn()
    const onDuplicateProject = vi.fn()
    render(
      <HomeSurface
        activeProjectId="folder-project-1"
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
            warnings: [],
          },
        ]}
        storageStatus={{
          status: 'ready',
          label: "Ben's Projects",
          defaultFolderLabel: 'Selected folder',
          fileSystemAccessSupported: true,
          folderPersistenceSupported: true,
          errorMessage: null,
        }}
        activeStorageKind="folder"
        onOpenProject={vi.fn()}
        onOpenFolderProject={vi.fn()}
        onNewProject={vi.fn()}
        onShowProjectInFolder={onShowProjectInFolder}
        onDuplicateProject={onDuplicateProject}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Show Harbor Lights in Folder' }))
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate Harbor Lights' }))

    const target = {
      storageKind: 'folder',
      projectId: 'folder-project-1',
      title: 'Harbor Lights',
      packageName: 'Harbor Lights (abc123ef).writeros',
    }
    expect(onShowProjectInFolder).toHaveBeenCalledWith(target)
    expect(onDuplicateProject).toHaveBeenCalledWith(target)
  })

  it('keeps show-in-folder and duplicate off browser-local project rows', () => {
    render(
      <HomeSurface
        activeProjectId="project-1"
        projects={projects}
        onOpenProject={vi.fn()}
        onNewProject={vi.fn()}
        onShowProjectInFolder={vi.fn()}
        onDuplicateProject={vi.fn()}
      />
    )

    expect(screen.queryByRole('button', { name: 'Show The Salt Line in Folder' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Duplicate The Salt Line' })).not.toBeInTheDocument()
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
          label: "Ben's Projects",
          defaultFolderLabel: 'Selected folder',
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

  it('uses folder-access copy when the remembered folder needs permission', () => {
    const onRefreshProjectFolder = vi.fn()

    render(
      <HomeSurface
        activeProjectId=""
        projects={[]}
        storageStatus={{
          status: 'permission-needed',
          label: 'WriterOS Projects',
          defaultFolderLabel: 'Selected folder',
          fileSystemAccessSupported: true,
          folderPersistenceSupported: true,
          errorMessage: null,
        }}
        onOpenProject={vi.fn()}
        onNewProject={vi.fn()}
        onRefreshProjectFolder={onRefreshProjectFolder}
      />
    )

    expect(screen.getAllByRole('button', { name: 'Allow Folder Access' })).toHaveLength(1)
    expect(screen.getByText('Allow access to the selected folder to scan projects')).toBeInTheDocument()
    expect(screen.getByText('Allow folder access to show projects.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Allow Folder Access' }))
    expect(onRefreshProjectFolder).toHaveBeenCalledTimes(1)
  })

  it('shows an explicit empty state when folder scanning fails', () => {
    render(
      <HomeSurface
        activeProjectId="project-1"
        projects={projects}
        folderProjects={[]}
        storageStatus={{
          status: 'error',
          label: "Ben's Projects",
          defaultFolderLabel: 'Selected folder',
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

  describe('project Delete (Slice 5a)', () => {
    it('renders Delete next to Open on each project card when onDeleteProject is provided', () => {
      render(
        <HomeSurface
          activeProjectId="project-1"
          projects={projects}
          onOpenProject={vi.fn()}
          onNewProject={vi.fn()}
          onDeleteProject={vi.fn()}
        />
      )

      expect(screen.getByRole('button', { name: 'Delete The Salt Line' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Delete Quiet Frequencies' })).toBeInTheDocument()
    })

    it('does not render Delete buttons when onDeleteProject is omitted', () => {
      render(
        <HomeSurface
          activeProjectId="project-1"
          projects={projects}
          onOpenProject={vi.fn()}
          onNewProject={vi.fn()}
        />
      )

      expect(screen.queryByRole('button', { name: /^Delete / })).not.toBeInTheDocument()
    })

    it('opens a confirm dialog showing the exact project title and cascade copy', () => {
      render(
        <HomeSurface
          activeProjectId="project-1"
          projects={projects}
          onOpenProject={vi.fn()}
          onNewProject={vi.fn()}
          onDeleteProject={vi.fn()}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: 'Delete Quiet Frequencies' }))

      const dialog = screen.getByRole('dialog')
      expect(within(dialog).getByText(/Delete .*Quiet Frequencies/)).toBeInTheDocument()
      expect(
        within(dialog).getByText(/script, synopsis, outline, story bible, treatment, and all transcripts/)
      ).toBeInTheDocument()
    })

    it('mentions the .writeros folder will be removed for folder-backed projects', () => {
      render(
        <HomeSurface
          activeProjectId="project-1"
          projects={projects}
          folderProjects={[
            {
              id: 'project-1',
              packageName: 'The Salt Line.writeros',
              summary: projects[0],
              warnings: [],
            },
          ]}
            storageStatus={{
              status: 'ready',
              label: "Ben's Projects",
              defaultFolderLabel: 'Selected folder',
              fileSystemAccessSupported: true,
              folderPersistenceSupported: true,
            errorMessage: null,
          }}
          activeStorageKind="folder"
          onOpenProject={vi.fn()}
          onOpenFolderProject={vi.fn()}
          onNewProject={vi.fn()}
          onDeleteProject={vi.fn()}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: 'Delete The Salt Line' }))

      const dialog = screen.getByRole('dialog')
      expect(within(dialog).getByText(/The Salt Line\.writeros/)).toBeInTheDocument()
      expect(within(dialog).getByText(/removed from disk/)).toBeInTheDocument()
    })

    it('calls onDeleteProject with the correct target when confirmed', () => {
      const onDeleteProject = vi.fn()
      render(
        <HomeSurface
          activeProjectId="project-1"
          projects={projects}
          onOpenProject={vi.fn()}
          onNewProject={vi.fn()}
          onDeleteProject={onDeleteProject}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: 'Delete Quiet Frequencies' }))
      fireEvent.click(screen.getByRole('button', { name: 'Delete project' }))

      expect(onDeleteProject).toHaveBeenCalledWith({
        storageKind: 'browser',
        projectId: 'project-2',
        title: 'Quiet Frequencies',
      })
    })

    it('keeps the confirm modal mounted during the async delete and closes after resolve', async () => {
      let resolveDelete: (() => void) | undefined
      const onDeleteProject = vi.fn(
        () =>
          new Promise<void>(resolve => {
            resolveDelete = resolve
          })
      )

      render(
        <HomeSurface
          activeProjectId="project-1"
          projects={projects}
          onOpenProject={vi.fn()}
          onNewProject={vi.fn()}
          onDeleteProject={onDeleteProject}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: 'Delete Quiet Frequencies' }))
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete project' }))

      // Modal must remain mounted until the parent resolves the delete so
      // the writer never sees the dialog vanish mid-action and so the
      // disabled / Deleting state on the confirm button is actually reachable.
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(onDeleteProject).toHaveBeenCalledTimes(1)

      await act(async () => {
        resolveDelete?.()
      })

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('shows the Deleting label when the parent reports the delete in flight', () => {
      render(
        <HomeSurface
          activeProjectId="project-1"
          projects={projects}
          deletingProjectId="project-1"
          onOpenProject={vi.fn()}
          onNewProject={vi.fn()}
          onDeleteProject={vi.fn()}
        />
      )

      // The card's Delete button shows "Deleting" while the parent has
      // marked this project as in-flight.
      expect(
        within(screen.getByRole('button', { name: 'Delete The Salt Line' })).getByText('Deleting')
      ).toBeInTheDocument()
    })

    it('closes the confirm modal after the delete rejects so the surrounding error notice remains visible', async () => {
      let rejectDelete: ((reason: unknown) => void) | undefined
      const onDeleteProject = vi.fn(
        () =>
          new Promise<void>((_resolve, reject) => {
            rejectDelete = reject
          })
      )

      render(
        <HomeSurface
          activeProjectId="project-1"
          projects={projects}
          onOpenProject={vi.fn()}
          onNewProject={vi.fn()}
          onDeleteProject={onDeleteProject}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: 'Delete The Salt Line' }))
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete project' }))

      expect(screen.getByRole('dialog')).toBeInTheDocument()

      await act(async () => {
        rejectDelete?.(new Error('disk failure'))
        // Swallow the rejection in the onClick handler's microtask queue so
        // the test does not surface it as an unhandled rejection.
        await Promise.resolve().catch(() => undefined)
      })

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('does not call onDeleteProject when canceled', () => {
      const onDeleteProject = vi.fn()
      render(
        <HomeSurface
          activeProjectId="project-1"
          projects={projects}
          onOpenProject={vi.fn()}
          onNewProject={vi.fn()}
          onDeleteProject={onDeleteProject}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: 'Delete The Salt Line' }))
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

      expect(onDeleteProject).not.toHaveBeenCalled()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('shows Active/Archive toggle with counts and filters cards (Slice 5a-2)', () => {
      const mixedProjects = [
        ...projects,
        {
          id: 'project-3',
          title: 'Archived One',
          createdAt: 500,
          updatedAt: 600,
          format: 'feature' as const,
          sceneCount: 1,
          archivedAt: '2026-05-25T00:00:00.000Z',
        },
      ]

      render(
        <HomeSurface
          activeProjectId="project-1"
          projects={mixedProjects}
          onOpenProject={vi.fn()}
          onNewProject={vi.fn()}
          onArchiveProject={vi.fn()}
          onRestoreProject={vi.fn()}
        />
      )

      // Active count = 2 (project-1, project-2), Archive count = 1
      const activeTab = screen.getByRole('tab', { name: /Active \(2\)/ })
      const archiveTab = screen.getByRole('tab', { name: /Archive \(1\)/ })
      expect(activeTab).toHaveAttribute('aria-selected', 'true')
      expect(archiveTab).toHaveAttribute('aria-selected', 'false')

      // Active list shows non-archived projects.
      let list = screen.getByLabelText('Project list')
      expect(within(list).getByText('The Salt Line')).toBeInTheDocument()
      expect(within(list).getByText('Quiet Frequencies')).toBeInTheDocument()
      expect(within(list).queryByText('Archived One')).not.toBeInTheDocument()

      fireEvent.click(archiveTab)

      list = screen.getByLabelText('Project list')
      expect(within(list).getByText('Archived One')).toBeInTheDocument()
      expect(within(list).queryByText('The Salt Line')).not.toBeInTheDocument()
    })

    it('clears the filter when switching between Active and Archive views (Slice 5a-2)', () => {
      const mixedProjects = [
        ...projects,
        {
          id: 'project-3',
          title: 'Archived One',
          createdAt: 500,
          updatedAt: 600,
          format: 'feature' as const,
          sceneCount: 1,
          archivedAt: '2026-05-25T00:00:00.000Z',
        },
      ]

      render(
        <HomeSurface
          activeProjectId="project-1"
          projects={mixedProjects}
          onOpenProject={vi.fn()}
          onNewProject={vi.fn()}
          onArchiveProject={vi.fn()}
          onRestoreProject={vi.fn()}
        />
      )

      fireEvent.change(screen.getByLabelText('Filter projects'), {
        target: { value: 'salt' },
      })
      expect(screen.getByLabelText('Filter projects')).toHaveValue('salt')

      fireEvent.click(screen.getByRole('tab', { name: /Archive \(1\)/ }))

      expect(screen.getByLabelText('Filter projects')).toHaveValue('')
      expect(within(screen.getByLabelText('Project list')).getByText('Archived One')).toBeInTheDocument()
    })

    it('Archive card shows Restore + Delete and no Open (Slice 5a-2)', () => {
      const mixedProjects = [
        ...projects,
        {
          id: 'project-3',
          title: 'Archived One',
          createdAt: 500,
          updatedAt: 600,
          format: 'feature' as const,
          sceneCount: 1,
          archivedAt: '2026-05-25T00:00:00.000Z',
        },
      ]

      render(
        <HomeSurface
          activeProjectId="project-1"
          projects={mixedProjects}
          initialView="archive"
          onOpenProject={vi.fn()}
          onNewProject={vi.fn()}
          onArchiveProject={vi.fn()}
          onRestoreProject={vi.fn()}
          onDeleteProject={vi.fn()}
        />
      )

      expect(screen.getByRole('button', { name: 'Restore Archived One' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Delete Archived One' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Open Archived One' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Archive Archived One' })).not.toBeInTheDocument()
    })

    it('opens an Archive confirm modal with exact title and cascade copy (Slice 5a-2)', () => {
      render(
        <HomeSurface
          activeProjectId="project-1"
          projects={projects}
          onOpenProject={vi.fn()}
          onNewProject={vi.fn()}
          onArchiveProject={vi.fn()}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: 'Archive Quiet Frequencies' }))

      const dialog = screen.getByRole('dialog')
      expect(within(dialog).getByText(/Archive .*Quiet Frequencies/)).toBeInTheDocument()
      expect(within(dialog).getByText(/hidden from your Active list/)).toBeInTheDocument()
    })

    it('mentions the Archive subfolder move for folder-backed projects (Slice 5a-2)', () => {
      render(
        <HomeSurface
          activeProjectId="project-1"
          projects={projects}
          folderProjects={[
            {
              id: 'project-1',
              packageName: 'The Salt Line.writeros',
              summary: projects[0],
              warnings: [],
            },
          ]}
            storageStatus={{
              status: 'ready',
              label: "Ben's Projects",
              defaultFolderLabel: 'Selected folder',
              fileSystemAccessSupported: true,
              folderPersistenceSupported: true,
            errorMessage: null,
          }}
          activeStorageKind="folder"
          onOpenProject={vi.fn()}
          onOpenFolderProject={vi.fn()}
          onNewProject={vi.fn()}
          onArchiveProject={vi.fn()}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: 'Archive The Salt Line' }))

      const dialog = screen.getByRole('dialog')
      expect(within(dialog).getByText(/The Salt Line\.writeros/)).toBeInTheDocument()
      expect(dialog.textContent).toMatch(/moved into/)
    })

    it('calls onArchiveProject with the correct target on confirm (Slice 5a-2)', async () => {
      const onArchiveProject = vi.fn().mockResolvedValue(undefined)
      render(
        <HomeSurface
          activeProjectId="project-1"
          projects={projects}
          onOpenProject={vi.fn()}
          onNewProject={vi.fn()}
          onArchiveProject={onArchiveProject}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: 'Archive The Salt Line' }))
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Archive project' }))

      await act(async () => {
        await Promise.resolve()
      })

      expect(onArchiveProject).toHaveBeenCalledWith({
        storageKind: 'browser',
        projectId: 'project-1',
        title: 'The Salt Line',
      })
    })

    it('Restore button fires onRestoreProject with the archive target (Slice 5a-2)', () => {
      const onRestoreProject = vi.fn()
      render(
        <HomeSurface
          activeProjectId=""
          projects={[
            {
              id: 'project-archive',
              title: 'Old Draft',
              createdAt: 500,
              updatedAt: 600,
              format: 'feature' as const,
              sceneCount: 0,
              archivedAt: '2026-05-25T00:00:00.000Z',
            },
          ]}
          initialView="archive"
          onOpenProject={vi.fn()}
          onNewProject={vi.fn()}
          onRestoreProject={onRestoreProject}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: 'Restore Old Draft' }))

      expect(onRestoreProject).toHaveBeenCalledWith({
        storageKind: 'browser',
        projectId: 'project-archive',
        title: 'Old Draft',
      })
    })

    it('shows Create / Import CTAs in the empty browser state', () => {
      const onNewProject = vi.fn()
      const onImportFdx = vi.fn()
      render(
        <HomeSurface
          activeProjectId=""
          projects={[]}
          onOpenProject={vi.fn()}
          onNewProject={onNewProject}
          onImportFdx={onImportFdx}
        />
      )

      const list = screen.getByLabelText('Project list')
      expect(within(list).getByText(/No projects yet/)).toBeInTheDocument()
      expect(within(list).getByRole('button', { name: 'Import .fdx' })).toBeInTheDocument()
      const createButtons = within(list).getAllByRole('button', { name: 'New Project' })
      expect(createButtons.length).toBeGreaterThan(0)
      fireEvent.click(createButtons[createButtons.length - 1])
      expect(onNewProject).toHaveBeenCalled()
    })
  })

  describe('localStorage → folder migration prompt', () => {
    const readyStorageStatus = {
      status: 'ready' as const,
      label: 'MyDocs',
      defaultFolderLabel: 'Selected folder',
      fileSystemAccessSupported: true,
      folderPersistenceSupported: true,
      errorMessage: null,
    }

    it('shows the migration modal when a folder is connected and unmigrated projects exist', () => {
      render(
        <HomeSurface
          activeProjectId=""
          projects={projects}
          onOpenProject={vi.fn()}
          onNewProject={vi.fn()}
          storageStatus={readyStorageStatus}
          folderLabel="MyDocs"
          unmigratedProjects={[
            { id: 'p1', title: 'Romeo' },
            { id: 'p2', title: 'Juliet' },
          ]}
        />
      )
      expect(screen.getByRole('dialog')).toHaveAccessibleName(/migrate.*projects/i)
    })

    it('does not show the modal when no folder is connected', () => {
      render(
        <HomeSurface
          activeProjectId=""
          projects={projects}
          onOpenProject={vi.fn()}
          onNewProject={vi.fn()}
          unmigratedProjects={[{ id: 'p1', title: 'Romeo' }]}
        />
      )
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('does not show the modal when there are no unmigrated projects', () => {
      render(
        <HomeSurface
          activeProjectId=""
          projects={projects}
          onOpenProject={vi.fn()}
          onNewProject={vi.fn()}
          storageStatus={readyStorageStatus}
          folderLabel="MyDocs"
          unmigratedProjects={[]}
        />
      )
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('clicking migrate calls onMigrateLocalStorage', () => {
      const onMigrateLocalStorage = vi.fn()
      render(
        <HomeSurface
          activeProjectId=""
          projects={projects}
          onOpenProject={vi.fn()}
          onNewProject={vi.fn()}
          storageStatus={readyStorageStatus}
          folderLabel="MyDocs"
          unmigratedProjects={[{ id: 'p1', title: 'Romeo' }]}
          onMigrateLocalStorage={onMigrateLocalStorage}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: /Migrate 1 project/i }))
      expect(onMigrateLocalStorage).toHaveBeenCalledTimes(1)
    })

    it('Cancel dismisses the modal and Migrate browser projects link reopens it', () => {
      render(
        <HomeSurface
          activeProjectId=""
          projects={projects}
          onOpenProject={vi.fn()}
          onNewProject={vi.fn()}
          storageStatus={readyStorageStatus}
          folderLabel="MyDocs"
          unmigratedProjects={[{ id: 'p1', title: 'Romeo' }]}
        />
      )

      expect(screen.getByRole('dialog')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: /Migrate browser projects/i }))
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('does NOT re-open the modal when unmigrated count decreases after a dismiss', () => {
      const { rerender } = render(
        <HomeSurface
          activeProjectId=""
          projects={projects}
          onOpenProject={vi.fn()}
          onNewProject={vi.fn()}
          storageStatus={readyStorageStatus}
          folderLabel="MyDocs"
          unmigratedProjects={[
            { id: 'p1', title: 'Romeo' },
            { id: 'p2', title: 'Juliet' },
            { id: 'p3', title: 'Hamlet' },
          ]}
        />
      )

      expect(screen.getByRole('dialog')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

      // Simulate a partial migration: count drops from 3 → 1.
      rerender(
        <HomeSurface
          activeProjectId=""
          projects={projects}
          onOpenProject={vi.fn()}
          onNewProject={vi.fn()}
          storageStatus={readyStorageStatus}
          folderLabel="MyDocs"
          unmigratedProjects={[{ id: 'p3', title: 'Hamlet' }]}
        />
      )

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('DOES re-open the modal when unmigrated count increases above the previous value', () => {
      const { rerender } = render(
        <HomeSurface
          activeProjectId=""
          projects={projects}
          onOpenProject={vi.fn()}
          onNewProject={vi.fn()}
          storageStatus={readyStorageStatus}
          folderLabel="MyDocs"
          unmigratedProjects={[
            { id: 'p1', title: 'Romeo' },
            { id: 'p2', title: 'Juliet' },
          ]}
        />
      )

      expect(screen.getByRole('dialog')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

      // Simulate writer adding a new browser project later: count grows 2 → 3.
      rerender(
        <HomeSurface
          activeProjectId=""
          projects={projects}
          onOpenProject={vi.fn()}
          onNewProject={vi.fn()}
          storageStatus={readyStorageStatus}
          folderLabel="MyDocs"
          unmigratedProjects={[
            { id: 'p1', title: 'Romeo' },
            { id: 'p2', title: 'Juliet' },
            { id: 'p3', title: 'Hamlet' },
          ]}
        />
      )

      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('does not show the "Migrate browser projects" status-row button while the modal is open', () => {
      render(
        <HomeSurface
          activeProjectId=""
          projects={projects}
          onOpenProject={vi.fn()}
          onNewProject={vi.fn()}
          storageStatus={readyStorageStatus}
          folderLabel="MyDocs"
          unmigratedProjects={[{ id: 'p1', title: 'Romeo' }]}
        />
      )

      // The migration modal opens automatically on first render. While it is
      // open, the status-row affordance that would reopen the same modal is
      // redundant and confusing — it must not render.
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: 'Migrate browser projects' }),
      ).not.toBeInTheDocument()
    })

    it('Migrate browser projects button is disabled while migrating', () => {
      // The status-row affordance is hidden while the modal is open (see the
      // prior test), so we first dismiss the modal, then flip the surface into
      // its migrating state so the affordance is reachable and we can assert
      // it is disabled.
      const { rerender } = render(
        <HomeSurface
          activeProjectId=""
          projects={projects}
          onOpenProject={vi.fn()}
          onNewProject={vi.fn()}
          storageStatus={readyStorageStatus}
          folderLabel="MyDocs"
          unmigratedProjects={[{ id: 'p1', title: 'Romeo' }]}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

      rerender(
        <HomeSurface
          activeProjectId=""
          projects={projects}
          onOpenProject={vi.fn()}
          onNewProject={vi.fn()}
          storageStatus={readyStorageStatus}
          folderLabel="MyDocs"
          unmigratedProjects={[{ id: 'p1', title: 'Romeo' }]}
          migratingLocalStorage
        />
      )

      // The status-row affordance lives outside the dialog. Querying by name
      // would match the in-modal primary "Migrate 1 project" too, so scope
      // explicitly to the exact status-row label.
      const button = screen.getByRole('button', { name: 'Migrate browser projects' })
      expect(button).toBeDisabled()
    })
  })
})
