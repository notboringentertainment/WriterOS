import { describe, expect, it } from 'vitest'
import { computePostDeleteStorageEffect } from '../../client/src/lib/homeDelete'
import type { HomeDeleteTarget } from '../../client/src/components/home/HomeSurface'

const browserTarget: HomeDeleteTarget = {
  storageKind: 'browser',
  projectId: 'p-browser',
  title: 'Untitled',
}

const folderTarget: HomeDeleteTarget = {
  storageKind: 'folder',
  projectId: 'p-folder',
  title: 'Lifeline',
  packageName: 'Lifeline.writeros',
}

describe('computePostDeleteStorageEffect', () => {
  it('resets active storage and cancels pending folder save when the active project is deleted', () => {
    expect(computePostDeleteStorageEffect(folderTarget, true)).toEqual({
      resetToBrowser: true,
      cancelPendingFolderSave: true,
    })
    expect(computePostDeleteStorageEffect(browserTarget, true)).toEqual({
      resetToBrowser: true,
      cancelPendingFolderSave: true,
    })
  })

  it('does NOT touch active storage when a non-active folder project is deleted (regression: PR #8 Major)', () => {
    // The bug we are guarding against: deleting some other folder project from
    // Home must not silently switch the active session to browser storage and
    // must not cancel a pending folder save for the still-open active project.
    expect(computePostDeleteStorageEffect(folderTarget, false)).toEqual({
      resetToBrowser: false,
      cancelPendingFolderSave: false,
    })
  })

  it('does NOT touch active storage when a non-active browser project is deleted', () => {
    expect(computePostDeleteStorageEffect(browserTarget, false)).toEqual({
      resetToBrowser: false,
      cancelPendingFolderSave: false,
    })
  })
})
