import { describe, expect, it } from 'vitest'
import { loginShellPath } from '../../../server/morganHost/shellPath'

describe('loginShellPath', () => {
  it('puts the login shell PATH first and appends the inherited PATH without duplicates', () => {
    const run = () => '/home/b/.local/bin:/opt/homebrew/bin:/usr/bin:/bin'
    expect(loginShellPath('/usr/bin:/bin:/usr/sbin', run, '/bin/zsh')).toBe(
      '/home/b/.local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin',
    )
  })

  it('invokes the shell as an interactive login shell so .zshrc PATH edits count', () => {
    const calls: string[][] = []
    loginShellPath('/usr/bin', (shell, args) => (calls.push([shell, ...args]), '/x'), '/bin/zsh')
    expect(calls).toEqual([['/bin/zsh', '-ilc', 'printf %s "$PATH"']])
  })

  it('falls back to the inherited PATH when the shell throws', () => {
    const run = () => {
      throw new Error('spawn failed')
    }
    expect(loginShellPath('/usr/bin:/bin', run)).toBe('/usr/bin:/bin')
  })

  it('falls back when the shell prints something that is not a PATH', () => {
    expect(loginShellPath('/usr/bin:/bin', () => '')).toBe('/usr/bin:/bin')
    expect(loginShellPath('/usr/bin:/bin', () => 'warning\n/a:/b')).toBe('/usr/bin:/bin')
  })

  it('defaults to /usr/bin:/bin when nothing is inherited', () => {
    expect(loginShellPath(undefined, () => '/a')).toBe('/a:/usr/bin:/bin')
  })
})
