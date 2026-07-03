import type { HomeDeleteTarget } from '../components/home/HomeSurface'

export interface PostDeleteStorageEffect {
  resetToBrowser: boolean
  cancelPendingFolderSave: boolean
}

// After deleting a project from Home, decide whether to reset the active
// storage context. Only the active project's deletion ends the active
// session — deleting a different (non-active) project must not disturb
// persistence for the project the writer still has open.
export function computePostDeleteStorageEffect(
  _target: HomeDeleteTarget,
  wasActive: boolean,
): PostDeleteStorageEffect {
  if (wasActive) {
    return { resetToBrowser: true, cancelPendingFolderSave: true }
  }
  return { resetToBrowser: false, cancelPendingFolderSave: false }
}
