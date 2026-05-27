#!/usr/bin/env node
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const writerOSPort = Number(process.env.PORT || '5177')
const writerOSHost = process.env.HOST || '127.0.0.1'
const openSwarmPort = Number(process.env.OPENSWARM_PORT || '8080')
const openSwarmHost = process.env.OPENSWARM_HOST || '127.0.0.1'
const openSwarmDir = path.resolve(
  process.env.OPENSWARM_DIR || path.join(os.homedir(), 'OpenSwarm')
)
const statusOnly = process.argv.includes('--status')
const children = []

function httpUrl(host, port) {
  return `http://${host}:${port}`
}

function hostPort(host, port) {
  return `${host}:${port}`
}

function serviceAddress(service, host, port) {
  return service === 'WriterOS' ? httpUrl(host, port) : hostPort(host, port)
}

function log(service, message) {
  console.log(`[${service}] ${message}`)
}

function isPortOpen(host, port, timeoutMs = 500) {
  return new Promise(resolve => {
    const socket = net.createConnection({ host, port })
    const done = result => {
      socket.removeAllListeners()
      socket.destroy()
      resolve(result)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
  })
}

async function waitForPort(service, host, port, timeoutMs = 90_000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await isPortOpen(host, port)) {
      log(service, `ready on ${serviceAddress(service, host, port)}`)
      return true
    }
    await new Promise(resolve => setTimeout(resolve, 750))
  }
  log(service, `did not become ready on ${host}:${port} within ${Math.round(timeoutMs / 1000)}s`)
  return false
}

function prefixOutput(service, stream) {
  let buffer = ''
  stream.on('data', chunk => {
    buffer += chunk.toString()
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (line.trim()) log(service, line)
    }
  })
}

function spawnService(service, command, args, options) {
  log(service, `starting: ${command} ${args.join(' ')}`)
  const child = spawn(command, args, {
    ...options,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...(options.env || {}) },
  })
  children.push(child)
  prefixOutput(service, child.stdout)
  prefixOutput(service, child.stderr)
  child.on('exit', (code, signal) => {
    if (signal) log(service, `stopped by ${signal}`)
    else if (code !== 0 && code !== null) log(service, `exited with code ${code}`)
  })
  child.on('error', error => {
    log(service, `failed to start: ${error.message}`)
  })
  return child
}

function pythonForOpenSwarm() {
  const venvPython = path.join(openSwarmDir, '.venv', 'bin', 'python')
  return fs.existsSync(venvPython) ? venvPython : 'python3'
}

async function printStatus() {
  const writerOSOpen = await isPortOpen(writerOSHost, writerOSPort)
  const openSwarmOpen = await isPortOpen(openSwarmHost, openSwarmPort)
  log('WriterOS', writerOSOpen ? `running on ${httpUrl(writerOSHost, writerOSPort)}` : `not running on ${hostPort(writerOSHost, writerOSPort)}`)
  log('OpenSwarm', openSwarmOpen ? `running on ${hostPort(openSwarmHost, openSwarmPort)}` : `not running on ${hostPort(openSwarmHost, openSwarmPort)}`)
}

async function main() {
  if (statusOnly) {
    await printStatus()
    return
  }

  log('dev', 'starting WriterOS development stack')
  const waiters = []

  if (await isPortOpen(writerOSHost, writerOSPort)) {
    log('WriterOS', `already running on ${httpUrl(writerOSHost, writerOSPort)}`)
    waiters.push(waitForPort('WriterOS', writerOSHost, writerOSPort))
  } else {
    spawnService(
      'WriterOS',
      'npm',
      ['run', 'dev:writeros'],
      {
        cwd: rootDir,
        env: {
          NODE_ENV: 'development',
          PORT: String(writerOSPort),
          HOST: writerOSHost,
        },
      }
    )
    waiters.push(waitForPort('WriterOS', writerOSHost, writerOSPort))
  }

  if (await isPortOpen(openSwarmHost, openSwarmPort)) {
    log('OpenSwarm', `already running on ${hostPort(openSwarmHost, openSwarmPort)}`)
    waiters.push(waitForPort('OpenSwarm', openSwarmHost, openSwarmPort))
  } else if (!fs.existsSync(path.join(openSwarmDir, 'server.py'))) {
    log('OpenSwarm', `not started: expected server.py at ${openSwarmDir}`)
    log('OpenSwarm', 'set OPENSWARM_DIR=/path/to/OpenSwarm if your repo lives somewhere else')
  } else {
    const python = pythonForOpenSwarm()
    spawnService(
      'OpenSwarm',
      python,
      ['server.py'],
      { cwd: openSwarmDir }
    )
    waiters.push(waitForPort('OpenSwarm', openSwarmHost, openSwarmPort))
  }

  await Promise.all(waiters)

  log('dev', `open WriterOS at ${httpUrl(writerOSHost, writerOSPort)}`)
  log('dev', 'press Ctrl+C to stop services started by this command')
}

function shutdown() {
  log('dev', 'shutting down')
  for (const child of children) {
    if (child.killed) continue
    try {
      if (process.platform !== 'win32' && child.pid) {
        process.kill(-child.pid, 'SIGINT')
      } else {
        child.kill('SIGINT')
      }
    } catch {
      child.kill('SIGINT')
    }
  }
  setTimeout(() => process.exit(0), 500)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

main().catch(error => {
  console.error('[dev] failed to start development stack')
  console.error(error)
  shutdown()
})
