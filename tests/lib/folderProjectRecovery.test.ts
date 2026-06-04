import { describe, expect, it } from 'vitest'
import { defaultProjectState } from '../../client/src/lib/projectState'
import { preferNewerMigratedBackup } from '../../client/src/lib/folderProjectRecovery'
import type { StoredProject } from '../../client/src/lib/projectLibrary'

function project(id: string, updatedAt: number, text: string, migrated = false): StoredProject {
  const state = defaultProjectState()
  state.script.scratchpad.items = text
    ? [{ id: `note-${updatedAt}`, type: 'text', text, checked: false, pinnedScene: null }]
    : []

  return {
    id,
    createdAt: 1,
    updatedAt,
    state,
    ...(migrated
      ? {
          migratedToFolder: {
            folderLabel: 'WriterOS Projects',
            packageName: 'Project.writeros',
            migratedAt: '2026-06-03T10:00:00.000Z',
          },
        }
      : {}),
  }
}

describe('preferNewerMigratedBackup', () => {
  it('uses a newer migrated local backup when the folder package is stale', () => {
    const folderProject = project('p1', 100, '')
    const backup = project('p1', 200, 'reload-safe note', true)

    const result = preferNewerMigratedBackup(folderProject, [backup])

    expect(result).toBe(backup)
    expect(result.state.script.scratchpad.items[0].text).toBe('reload-safe note')
  })

  it('keeps the folder project when the migrated backup is not newer', () => {
    const folderProject = project('p1', 200, 'folder note')
    const backup = project('p1', 100, 'old local note', true)

    expect(preferNewerMigratedBackup(folderProject, [backup])).toBe(folderProject)
  })

  it('ignores non-migrated browser projects with the same id', () => {
    const folderProject = project('p1', 100, 'folder note')
    const browserCopy = project('p1', 200, 'browser note', false)

    expect(preferNewerMigratedBackup(folderProject, [browserCopy])).toBe(folderProject)
  })
})
