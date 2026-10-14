// mod/writeros-morgan/tests/guard.test.ts
import { test, expect } from 'claude-code/testing'
import { guardTool, type GuardContext } from '../hooks/guard'

const ctx = (resolved: Record<string, string | null> = {}, pkg = '/projects/Test Project.writeros'): GuardContext => ({
  packagePath: pkg,
  resolve: async p => (p in resolved ? resolved[p] : p),
})

test('refuses casting-inspiration reads, including through a link', async () => {
  expect((await guardTool('Read', { file_path: '/a/canon/visual/casting-inspiration/face.png' }, ctx())).allow).toBe(false)
  const linked = await guardTool('Read', { file_path: '/a/pic.png' }, ctx({ '/a/pic.png': '/a/casting-inspiration/face.png' }))
  expect(linked.allow === false && linked.reason).toMatch(/real people/)
  expect((await guardTool('Grep', { path: '/a/casting-inspiration' }, ctx())).allow).toBe(false)
  expect((await guardTool('Glob', { path: '/a', pattern: '**/casting-inspiration/*' }, ctx())).allow).toBe(false)
})

test('allows ordinary images and text', async () => {
  expect(await guardTool('Read', { file_path: '/a/notes/frame1.png' }, ctx())).toEqual({ allow: true })
  expect(await guardTool('Read', { file_path: '/a/MAP.md' }, ctx())).toEqual({ allow: true })
})

test('refuses a read it cannot resolve', async () => {
  expect((await guardTool('Read', { file_path: '/a/x.md' }, ctx({ '/a/x.md': null }))).allow).toBe(false)
})

test('refuses writes inside the WriterOS package and points to page proposals', async () => {
  for (const tool of ['Edit', 'Write']) {
    const r = await guardTool(tool, { file_path: '/projects/Test Project.writeros/documents/outline.json' }, ctx())
    expect(r.allow === false && r.reason).toMatch(/propose_page_change/)
  }
  const viaLink = await guardTool('Edit', { file_path: '/tmp/o.json' }, ctx({ '/tmp/o.json': '/projects/Test Project.writeros/documents/outline.json' }))
  expect(viaLink.allow).toBe(false)
  // memory files are not pages: canon imports and Morgan's own fixes there go through her normal approval card
  expect(await guardTool('Edit', { file_path: '/projects/Test Project.writeros/memory/x.json' }, ctx())).toEqual({ allow: true })
})

test('lets Edit and Write elsewhere through to Claude Code\'s own approval card', async () => {
  expect(await guardTool('Edit', { file_path: '/icloud/Test Project/wayfinder/resolved/28.md' }, ctx())).toEqual({ allow: true })
})

test('refuses a page proposal for the Look panel', async () => {
  const r = await guardTool('mcp__writeros-morgan__propose_page_change', { surface: 'lookbook' }, ctx())
  expect(r.allow === false && r.reason).toMatch(/Look/)
})

test('a command or a linked search root that reaches a casting folder is refused', async () => {
  expect((await guardTool('Bash', { command: 'ls ~/x/canon/visual/casting-inspiration' }, ctx())).allow).toBe(false)
  expect((await guardTool('Grep', { path: '/a/refs', pattern: 'x' }, ctx({ '/a/refs': '/a/canon/visual/casting-inspiration' }))).allow).toBe(false)
})

test('everything else passes to Claude Code\'s permissions', async () => {
  for (const tool of ['Bash', 'Grep', 'Glob', 'TodoWrite', 'WebSearch', 'WebFetch', 'Agent']) {
    expect(await guardTool(tool, { path: '/a' }, ctx())).toEqual({ allow: true })
  }
})
