import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { OutlineTab } from '../../client/src/components/writing/OutlineTab'
import type { StoryDriveLinking } from '../../client/src/components/writing/outline/StoryDriveLinkPicker'
import { defaultProjectState } from '../../client/src/lib/projectState'

const folders = [
  { id: 'Harbour Lights', name: 'Harbour Lights', linkedTo: { projectId: 'other', title: 'Harbour Lights' } },
  { id: 'The Salt Line', name: 'The Salt Line', linkedTo: null },
  { id: 'Fog Bank', name: 'Fog Bank', linkedTo: null },
]

function linking(overrides: Partial<StoryDriveLinking> = {}): StoryDriveLinking {
  return {
    folders: vi.fn(async () => ({ searchRoot: '/Scripts', folders })),
    link: vi.fn(async (folder: string) => ({ folderName: folder, canon: { status: 'imported' as const }, morganOpen: false })),
    importCanon: vi.fn(async () => ({ status: 'imported' as const })),
    ...overrides,
  }
}

function renderOutline(overrides: Partial<ComponentProps<typeof OutlineTab>> = {}) {
  const props: ComponentProps<typeof OutlineTab> = {
    document: defaultProjectState().documents.outline,
    projectFormat: 'feature',
    identity: { title: 'The Salt Line', genre: 'Drama' },
    onProjectFormatChange: vi.fn(),
    onContentChange: vi.fn(),
    onViewPreferencesPatch: vi.fn(),
    onComposed: vi.fn(),
    beatSheetStatus: { kind: 'not-linked' },
    ...overrides,
  }
  return render(<OutlineTab {...props} />)
}

describe('Link to Story-drive', () => {
  it('is not offered without the linking capability (browser and local-folder projects)', () => {
    renderOutline({ storyDriveLinking: undefined })
    expect(screen.queryByRole('button', { name: 'Link to Story-drive' })).toBeNull()
  })

  it('is not offered when the status is unknown or the project is already linked', () => {
    const { unmount } = renderOutline({ storyDriveLinking: linking(), beatSheetStatus: null })
    expect(screen.queryByRole('button', { name: 'Link to Story-drive' })).toBeNull()
    unmount()
    renderOutline({ storyDriveLinking: linking(), beatSheetStatus: { kind: 'no-beat-sheet' } })
    expect(screen.queryByRole('button', { name: 'Link to Story-drive' })).toBeNull()
  })

  it('lists folders, preselects the name match, and disables a folder another project owns', async () => {
    renderOutline({ storyDriveLinking: linking() })
    fireEvent.click(screen.getByRole('button', { name: 'Link to Story-drive' }))
    expect(await screen.findByRole('radio', { name: 'The Salt Line' })).toBeChecked()
    expect(screen.getByRole('radio', { name: /Harbour Lights/ })).toBeDisabled()
    expect(screen.getByText('linked to Harbour Lights')).toBeInTheDocument()
    expect(screen.getByText(/brings this folder's Story-drive decisions into WriterOS canon/)).toBeInTheDocument()
  })

  it('preselects nothing without an exact name match', async () => {
    renderOutline({ storyDriveLinking: linking(), identity: { title: 'Salt', genre: 'Drama' } })
    fireEvent.click(screen.getByRole('button', { name: 'Link to Story-drive' }))
    await screen.findByRole('radio', { name: 'The Salt Line' })
    expect(screen.getAllByRole('radio').some(radio => (radio as HTMLInputElement).checked)).toBe(false)
    expect(screen.getByRole('button', { name: 'Link' })).toBeDisabled()
  })

  it('links the chosen folder and says what happened', async () => {
    const capability = linking()
    renderOutline({ storyDriveLinking: capability })
    fireEvent.click(screen.getByRole('button', { name: 'Link to Story-drive' }))
    fireEvent.click(await screen.findByRole('radio', { name: 'Fog Bank' }))
    fireEvent.click(screen.getByRole('button', { name: 'Link' }))
    expect(await screen.findByText(/Linked to Story-drive folder Fog Bank\. Its Story-drive decisions are now in WriterOS canon\./)).toBeInTheDocument()
    expect(capability.link).toHaveBeenCalledWith('Fog Bank')
  })

  it('shows a failed canon import with a Try again button that reruns only the import', async () => {
    const capability = linking({
      link: vi.fn(async (folder: string) => ({
        folderName: folder,
        canon: { status: 'failed' as const, message: "WriterOS linked the folder but couldn't bring in its Story-drive canon." },
        morganOpen: true,
      })),
    })
    renderOutline({ storyDriveLinking: capability })
    fireEvent.click(screen.getByRole('button', { name: 'Link to Story-drive' }))
    await screen.findByRole('radio', { name: 'The Salt Line' })
    fireEvent.click(screen.getByRole('button', { name: 'Link' }))
    expect(await screen.findByText(/couldn't bring in its Story-drive canon/)).toBeInTheDocument()
    expect(screen.getByText(/Morgan is open on this project\. Click New conversation/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.queryByText(/couldn't bring in its Story-drive canon/)).toBeNull())
    expect(capability.importCanon).toHaveBeenCalledTimes(1)
    expect(capability.link).toHaveBeenCalledTimes(1)
  })

  it('shows the server message when linking fails', async () => {
    renderOutline({
      storyDriveLinking: linking({ link: vi.fn(async () => { throw new Error('That Story-drive folder is already linked to another project.') }) }),
    })
    fireEvent.click(screen.getByRole('button', { name: 'Link to Story-drive' }))
    await screen.findByRole('radio', { name: 'The Salt Line' })
    fireEvent.click(screen.getByRole('button', { name: 'Link' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('already linked to another project')
  })

  it('says where it looked when no folders are found', async () => {
    renderOutline({ storyDriveLinking: linking({ folders: vi.fn(async () => ({ searchRoot: '/Scripts', folders: [] })) }) })
    fireEvent.click(screen.getByRole('button', { name: 'Link to Story-drive' }))
    expect(await screen.findByText(/found no Story-drive projects in \/Scripts/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Link' })).toBeNull()
  })
})
