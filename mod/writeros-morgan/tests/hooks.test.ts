import { expect, mock, test } from 'claude-code/testing'
import { PROPOSE_TOOL } from '../hooks/guard'

function wire(on: any, opts: { decision?: any; replies?: any[]; fetchDenied?: boolean; statThrows?: boolean; packageThrows?: boolean; packagePath?: string } = {}) {
  const requests: { route: string; body: any }[] = []
  const replies = [...(opts.replies ?? [{ allow: true }])]
  on('env.get', ($: any, e: any) => {
    if (opts.packageThrows && e.name === 'WRITEROS_MORGAN_PACKAGE') throw new Error('environment unavailable')
    return { value: e.name === 'WRITEROS_MORGAN_SOCKET' ? '/tmp/m.sock' : e.name === 'WRITEROS_MORGAN_PACKAGE' ? (opts.packagePath ?? '/projects/Test Project.writeros') : 'tok' }
  })
  on('fs.stat', ($: any, e: any) => { if (opts.statThrows) throw new Error('stat failed'); return { value: { realPath: e.path } } })
  on('http.fetch', ($: any, e: any) => {
    const route = new URL(e.url).pathname
    const body = JSON.parse(e.init.body)
    requests.push({ route, body })
    if (opts.fetchDenied && (route === '/permission' || route === '/proposal')) return { deny: 'socket gone' }
    const reply = route === '/report' ? { acceptedThrough: body.events.at(-1).seq }
      : route === '/permission' || route === '/proposal' ? replies.shift() : {}
    return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify(reply) } }
  })
  on('session.id', () => ({ value: 'sess' }))
  on('session.cwd', () => ({ value: '/work' }))
  on('session.version', () => ({ value: { version: '2.1.292' } }))
  on('tool.register', () => ({ value: { tool: PROPOSE_TOOL } }))
  on('session.start', () => ({ cwd: '/work' }))
  on('classic.SessionStart', () => ({}))
  on('tool.check', () => opts.decision ?? { decision: 'ask' })
  on('tool.call', () => ({ result: 'should not run' }))
  on('prompt.mention', () => ({ content: 'should not open' }))
  return requests
}

async function launch($: any) {
  await $.classic.SessionStart({ source: 'startup', session_id: 'sess' })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
}

test('approval polls the same card until denied with the writer note', async ($, on) => {
  mock.clock(on)
  const requests = wire(on, { replies: [{ pending: true }, { allow: false, note: 'no' }] })
  await launch($)
  expect(await $.tool.check({ tool: 'Write', input: { file_path: '/a/new.md', content: 'Draft' } })).toEqual({ decision: 'deny', reason: 'The writer said no: no' })
  const polls = requests.filter(r => r.route === '/permission')
  expect(polls.length).toBe(2)
  expect(polls[0].body).toEqual(polls[1].body)
  expect(polls[0].body).toMatchObject({ tool: 'Write', summary: 'Create or overwrite new.md (/a/new.md)', input: JSON.stringify({ file_path: '/a/new.md', content: 'Draft' }) })
  expect(polls[0].body.requestId.length).toBeGreaterThan(0)
  expect(polls[0].body.epoch.length).toBeGreaterThan(0)
})

test('Allow answers a tool.check approval', async ($, on) => {
  mock.clock(on)
  wire(on)
  await launch($)
  expect(await $.tool.check({ tool: 'Edit', input: { file_path: '/a/x.md' } })).toEqual({ decision: 'allow' })
})

test('settings allow and deny decisions pass through without an approval fetch', async ($, on) => {
  mock.clock(on)
  const decision = { decision: 'allow', reason: 'read', rule: 'Read' }
  const requests = wire(on, { decision })
  await launch($)
  expect(await $.tool.check({ tool: 'Read', input: { file_path: '/a/x.md' } })).toEqual(decision)
  expect(requests.filter(r => r.route === '/permission')).toEqual([])
})

test('settings deny passes through unchanged', async ($, on) => {
  mock.clock(on)
  const decision = { decision: 'deny', reason: 'settings' }
  const requests = wire(on, { decision })
  await launch($)
  expect(await $.tool.check({ tool: 'Write', input: {} })).toEqual(decision)
  expect(requests.filter(r => r.route === '/permission')).toEqual([])
})

test('an unavailable approval channel denies the change', async ($, on) => {
  mock.clock(on)
  wire(on, { fetchDenied: true })
  await launch($)
  expect(await $.tool.check({ tool: 'Bash', input: { command: 'touch /a/x' } })).toEqual({ decision: 'deny', reason: 'WriterOS could not show the approval card, so nothing was changed.' })
})

test('oversized approval input is denied without fetching', async ($, on) => {
  mock.clock(on)
  const requests = wire(on)
  await launch($)
  const result = await $.tool.check({ tool: 'Write', input: { content: 'x'.repeat(64 * 1024) } })
  expect(result.decision).toBe('deny')
  expect(result.reason).toMatch(/too large/)
  expect(requests.filter(r => r.route === '/permission')).toEqual([])
})

test('a proposal polls the same proposal twice while pending and returns the kept outcome', async ($, on) => {
  mock.clock(on)
  const requests = wire(on, { replies: [{ pending: true }, { pending: true }, { outcome: 'kept' }] })
  await launch($)
  const proposal = { surface: 'script', summary: 'Add an ending', target: { kind: 'append' }, expectedEnding: [{ type: 'action', text: 'Wind.' }], blocks: [{ type: 'action', text: 'Rain.' }] }
  expect(await $.tool.call({ tool: PROPOSE_TOOL, tool_use_id: 'p1', ...proposal } as any)).toEqual({ result: 'The writer kept the change. It is on the page now.', isError: false })
  const polls = requests.filter(r => r.route === '/proposal')
  expect(polls.length).toBe(3)
  expect(polls.map(r => r.body.proposalId)).toEqual(['p1', 'p1', 'p1'])
  expect(polls[0].body).toMatchObject({ proposalId: 'p1', proposal })
  expect(polls[1].body).toEqual(polls[0].body)
  expect(polls[2].body).toEqual(polls[0].body)
})

test('proposal transport failure returns a clear error', async ($, on) => {
  mock.clock(on)
  wire(on, { fetchDenied: true })
  await launch($)
  expect(await $.tool.call({ tool: PROPOSE_TOOL, tool_use_id: 'p1', surface: 'outline', summary: 'Tighten', baseRevision: 1, content: {} } as any)).toEqual({ result: 'WriterOS could not show the change.', isError: true })
})

test('the Look panel is denied before fetching a proposal', async ($, on) => {
  mock.clock(on)
  const requests = wire(on)
  await launch($)
  const result = await $.tool.call({ tool: PROPOSE_TOOL, tool_use_id: 'p1', surface: 'lookbook' } as any)
  expect(result.deny).toMatch(/Look/)
  expect(requests.filter(r => r.route === '/proposal')).toEqual([])
})

test('safety checks fail closed for tool calls and mentions', async ($, on) => {
  mock.clock(on)
  wire(on, { packageThrows: true })
  await launch($)
  expect((await $.tool.call({ tool: 'Read', file_path: '/a/x.md' } as any)).deny).toMatch(/safety check failed/)
  expect((await $.prompt.mention({ path: '/a/x.md' } as any)).deny).toMatch(/safety check failed/)
})

test('a new file outside package pages reaches the next tool-call handler', async ($, on) => {
  mock.clock(on)
  wire(on, { statThrows: true })
  await launch($)
  expect(await $.tool.call({ tool: 'Write', file_path: '/projects/notes/new.md', content: 'Draft' } as any)).toEqual({ result: 'should not run' })
})

test('a new file inside package documents is denied with the page-proposal reason', async ($, on) => {
  mock.clock(on)
  wire(on, { statThrows: true })
  await launch($)
  const result = await $.tool.call({ tool: 'Write', file_path: '/projects/Test Project.writeros/documents/new.md', content: 'Draft' } as any)
  expect(result.deny).toBe('That file belongs to an open WriterOS page. Use propose_page_change so the writer sees the change on the page and keeps or dismisses it.')
})

test('reading a missing file is denied because it could not be checked', async ($, on) => {
  mock.clock(on)
  wire(on, { statThrows: true })
  await launch($)
  expect(await $.tool.call({ tool: 'Read', file_path: '/projects/notes/missing.md' } as any)).toEqual({ deny: 'Morgan could not check this file, so it was not opened.' })
})

test('casting mentions are refused', async ($, on) => {
  mock.clock(on)
  wire(on)
  await launch($)
  expect((await $.prompt.mention({ path: '/a/casting-inspiration/face.png' } as any)).deny).toMatch(/real people/)
})

test('an empty package path refuses every write', async ($, on) => {
  mock.clock(on)
  wire(on, { packagePath: '' })
  await launch($)
  expect((await $.tool.call({ tool: 'Write', file_path: '/a/x.md' } as any)).deny).toBeTruthy()
})

test('the page proposal tool is described upfront', async ($, on) => {
  mock.clock(on)
  wire(on)
  await launch($)
  const result = await $.tool.describe({ tool: PROPOSE_TOOL, description: 'engine', isDeferred: true, provider: { plugin: 'writeros-morgan', tier: 'user' } } as any)
  expect(result.description).toMatch(/Show the writer/)
  expect(result.isDeferred).toBe(false)
})
