import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { downloadTextFile } from '../../client/src/lib/downloadTextFile'

describe('downloadTextFile', () => {
  let createObjectURL: ReturnType<typeof vi.fn>
  let revokeObjectURL: ReturnType<typeof vi.fn>
  let clickSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.useFakeTimers()
    createObjectURL = vi.fn(() => 'blob:mock-url')
    revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    clickSpy.mockRestore()
    vi.useRealTimers()
  })

  it('creates a blob URL with the given mime type and clicks a download anchor', () => {
    downloadTextFile('my-film-seed.md', '# Seed', 'text/markdown')

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    const blob = createObjectURL.mock.calls[0][0] as Blob
    expect(blob.type).toBe('text/markdown')
    expect(clickSpy).toHaveBeenCalledTimes(1)
  })

  it('sets the download filename and revokes the blob URL after a deferred tick', () => {
    let capturedDownload = ''
    clickSpy.mockImplementation(function (this: HTMLAnchorElement) {
      capturedDownload = this.download
    })

    downloadTextFile('my-film-seed.md', '# Seed', 'text/markdown')

    expect(capturedDownload).toBe('my-film-seed.md')
    // Revoke is deferred so the browser's async download can start first.
    expect(revokeObjectURL).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })
})
