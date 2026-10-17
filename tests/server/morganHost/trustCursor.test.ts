import { describe, expect, it } from 'vitest'
import { trustCursor } from '../../../server/morganHost/morganSession'

describe('trustCursor', () => {
  it('reads the cursor from the latest redraw', () => {
    expect(trustCursor('❯ No, exit\r\n  Yes, I trust this folder')).toBe('no')
    expect(trustCursor('❯ No, exit\r\n  Yes, I trust this folder\x1b[2A  No, exit\r\n❯ Yes, I trust this folder')).toBe('yes')
    expect(trustCursor('\x1b[1m❯\x1b[22m \x1b[36mYes, I trust this folder\x1b[39m')).toBe('yes')
    expect(trustCursor('Quick safety check')).toBeNull()
  })
})
