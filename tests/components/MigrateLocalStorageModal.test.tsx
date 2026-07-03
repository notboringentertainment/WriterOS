import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MigrateLocalStorageModal } from '../../client/src/components/home/MigrateLocalStorageModal'

describe('MigrateLocalStorageModal', () => {
  it('renders the project titles and the destination folder label', () => {
    render(
      <MigrateLocalStorageModal
        open
        projects={[
          { id: 'p1', title: 'Romeo' },
          { id: 'p2', title: 'Juliet' },
        ]}
        folderLabel="MyDocs"
        onMigrate={() => {}}
        onCancel={() => {}}
        migrating={false}
      />
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAccessibleName(/migrate.*projects/i)
    expect(within(dialog).getByText('Romeo')).toBeInTheDocument()
    expect(within(dialog).getByText('Juliet')).toBeInTheDocument()
    expect(within(dialog).getAllByText(/MyDocs/).length).toBeGreaterThan(0)
    expect(within(dialog).getByRole('button', { name: /Migrate 2 projects/i })).toBeEnabled()
  })

  it('calls onMigrate when the migrate button is clicked', () => {
    const onMigrate = vi.fn()
    render(
      <MigrateLocalStorageModal
        open
        projects={[{ id: 'p1', title: 'Romeo' }]}
        folderLabel="MyDocs"
        onMigrate={onMigrate}
        onCancel={() => {}}
        migrating={false}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /Migrate 1 project/i }))
    expect(onMigrate).toHaveBeenCalledTimes(1)
  })

  it('disables both buttons while migrating', () => {
    render(
      <MigrateLocalStorageModal
        open
        projects={[{ id: 'p1', title: 'Romeo' }]}
        folderLabel="MyDocs"
        onMigrate={() => {}}
        onCancel={() => {}}
        migrating
      />
    )
    expect(screen.getByRole('button', { name: /Migrating/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Cancel/i })).toBeDisabled()
  })

  it('does not render anything when open is false', () => {
    render(
      <MigrateLocalStorageModal
        open={false}
        projects={[{ id: 'p1', title: 'Romeo' }]}
        folderLabel="MyDocs"
        onMigrate={() => {}}
        onCancel={() => {}}
        migrating={false}
      />
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('calls onCancel when the cancel button is clicked', () => {
    const onCancel = vi.fn()
    render(
      <MigrateLocalStorageModal
        open
        projects={[{ id: 'p1', title: 'Romeo' }]}
        folderLabel="MyDocs"
        onMigrate={() => {}}
        onCancel={onCancel}
        migrating={false}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
