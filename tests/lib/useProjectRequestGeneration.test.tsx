import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useProjectRequestGeneration } from '../../client/src/lib/useProjectRequestGeneration'

describe('useProjectRequestGeneration', () => {
  it('invalidates the current request when its component unmounts', () => {
    const { result, unmount } = renderHook(() => useProjectRequestGeneration('browser:project-a'))
    const requestIsCurrent = result.current()

    expect(requestIsCurrent()).toBe(true)
    unmount()

    expect(requestIsCurrent()).toBe(false)
  })
})
