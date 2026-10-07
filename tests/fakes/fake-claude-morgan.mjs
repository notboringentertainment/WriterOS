// tests/fakes/fake-claude-morgan.mjs
// Stands in for `claude`. FAKE_MODE:
//   ''        hello, one row, then serve inbox actions
//   'silent'  never says hello            'slow'   waits 500 ms before hello
//   'crash'   exits 1 after its first row 'chatty' reports FAKE_ROWS rows after hello
//   'approval' asks /permission and reports the answer as a row
//   'propose'  sends /proposal and reports the outcome as a row
//   'bash'     starts a detached child (like a Bash tool) and reports its pid
//   'orphan'   starts a detached child with an EMPTY environment , reports its pid, waits 3 s, exits
import http from 'node:http'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'

const socketPath = process.env.WRITEROS_MORGAN_SOCKET
const token = process.env.WRITEROS_MORGAN_TOKEN
const header = process.env.FAKE_TOKEN_HEADER
const mode = process.env.FAKE_MODE ?? ''
const template = JSON.parse(process.env.FAKE_ROW_TEMPLATE)
const epoch = randomUUID()
let seq = -1

const post = (route, body) => new Promise((resolve, reject) => {
  const req = http.request({ socketPath, path: route, method: 'POST', headers: { 'content-type': 'application/json', [header]: token } }, res => {
    let data = ''
    res.on('data', c => { data += c })
    res.on('end', () => {
      if (res.statusCode >= 300) { console.error(`fake: ${route} -> ${res.statusCode} ${data}`); process.exit(9) }
      resolve(data ? JSON.parse(data) : null)
    })
  })
  req.on('error', reject)
  req.end(JSON.stringify(body))
})
const row = text => ({ ...template, kind: 'row', seq: ++seq, at: Date.now(), uuid: randomUUID(), blocks: [{ type: 'text', text }] })
const report = events => post('/report', { epoch, fromSeq: events[0].seq, events })

if (mode === 'silent') setInterval(() => {}, 1000)
else {
  if (mode === 'trust') {
    process.stdout.write('Quick safety check: Is this a project you created or one you trust?\r\nNo, exit\r\nYes, I trust this folder\r\n');
    await new Promise(resolve => {
      let keys = '';
      const onData = data => {
        keys += data.toString();
        if (keys.includes('\x1b[B\r')) { process.stdin.off('data', onData); resolve(); }
        else if (keys.includes('\r')) process.exit(2);
      };
      process.stdin.setRawMode?.(true);
      process.stdin.on('data', onData);
      process.stdin.resume();
    });
  }
  if (mode === 'slow') await new Promise(r => setTimeout(r, 500))
  const idFlag = process.argv.includes('--resume') ? '--resume' : '--session-id'
  const sessionId = process.argv[process.argv.indexOf(idFlag) + 1]
  await post('/hello', { epoch, sessionId, source: 'launch', cwd: process.cwd(), claudeVersion: '2.1.292' })
  await report([row(idFlag === '--resume' ? 'Resumed.' : 'Ready.')])
  if (mode === 'crash') process.exit(1)
  setInterval(() => post('/ping', { epoch, enqueuedThrough: seq }).catch(() => {}), 1000)
  if (mode === 'chatty') for (let i = 1; i <= Number(process.env.FAKE_ROWS ?? 6); i++) await report([row(`row ${i}`)])
  if (mode === 'approval') {
    let a; do { a = await post('/permission', { epoch, requestId: 'r1', tool: 'Edit', summary: 'Edit 28.md (/x/28.md)', input: '{}' }) } while (a.pending)
    await report([row(`approval: ${a.allow ? 'allow' : 'deny'}${a.note ? ` (${a.note})` : ''}`)])
  }
  if (mode === 'propose') {
    let o; do { o = await post('/proposal', { epoch, proposalId: 'p1', proposal: { surface: 'script', target: { kind: 'append' }, blocks: [{ type: 'action', text: 'Rain.' }], summary: 'Add rain' } }) } while (o.pending)
    await report([row(`proposal: ${o.outcome}`)])
  }
  if (mode === 'orphan') {
    const c = spawn('/usr/bin/env', ['-i', '/bin/sleep', '60'], { detached: true, stdio: 'ignore' })
    c.unref()
    await report([row(`orphan ${c.pid}`)])
    await new Promise(r => setTimeout(r, 3000)) // longer than one 2-second ownership refresh
    process.exit(0)
  }
  if (mode === 'bash') {
    const c = spawn('/bin/sh', ['-c', 'trap "" TERM; exec sleep 60'], { detached: true, stdio: 'ignore' }) // found by parent link, like a Bash tool
    c.unref()
    await report([row(`bash ${c.pid}`)])
  }
  for (;;) {
    const action = await post('/inbox', { epoch })
    if (!action || !action.id) continue
    await post('/inbox-ack', { id: action.id, epoch, status: 'submitted' })
    if (action.submit) await report([row(`Heard: ${action.submit.text ?? action.submit}`)])
  }
}
