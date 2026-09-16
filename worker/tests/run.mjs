#!/usr/bin/env node
// npm --prefix worker test
// 1. wipes and migrates a fresh local persist dir (.wrangler/test-state), --local only
// 2. starts the fixture server on SC_WORKER_FIXTURE_PORT (8204)
// 3. phase "real now": wrangler dev --local on SC_WORKER_PORT (8202) with ALLOW_FAKE_NOW=0 → tests/real-now.test.mjs
// 4. phase "fake now": wrangler dev again with ALLOW_FAKE_NOW=1 and --test-scheduled → every other tests/*.test.mjs
// 5. always stops what it started. Never reuses a server already on either port: it fails instead.
// NEVER --remote, never deploy.
import { spawn } from 'node:child_process'
import { rmSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs'
import { createConnection } from 'node:net'
import { fileURLToPath } from 'node:url'
import { startFixtureServer } from '../../core/tests/fixture-server.mjs'

const WORKER_DIR = fileURLToPath(new URL('..', import.meta.url))
const PORT = Number(process.env.SC_WORKER_PORT ?? 8202)
const FX_PORT = Number(process.env.SC_WORKER_FIXTURE_PORT ?? 8204)
const STATE = '.wrangler/test-state'
const TOKEN = 'test-admin-token'
const env = { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false' }

const children = new Set()
let fixture = null

const log = (...a) => console.log('[run]', ...a)

function portInUse(port) {
  return new Promise((resolve) => {
    const s = createConnection({ port, host: '127.0.0.1' })
    s.once('connect', () => {
      s.destroy()
      resolve(true)
    })
    s.once('error', () => resolve(false))
  })
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: WORKER_DIR, stdio: 'inherit', env, ...opts })
    children.add(child)
    child.on('exit', (code) => {
      children.delete(child)
      resolve(code ?? 1)
    })
  })
}

function kill(child) {
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    try {
      child.kill('SIGTERM')
    } catch {}
  }
}

async function cleanup() {
  for (const c of children) kill(c)
  if (fixture) await fixture.close().catch(() => {})
}
for (const sig of ['SIGINT', 'SIGTERM'])
  process.on(sig, async () => {
    await cleanup()
    process.exit(130)
  })

async function waitFor(check, ms, every = 300) {
  const until = Date.now() + ms
  while (Date.now() < until) {
    if (await check()) return true
    await new Promise((r) => setTimeout(r, every))
  }
  return false
}

async function startWorker({ fakeNow, envFile }) {
  if (await portInUse(PORT)) throw new Error(`port ${PORT} is already in use: refusing to reuse another server`)
  const args = [
    'dev',
    '--local',
    '--ip',
    '127.0.0.1',
    '--port',
    String(PORT),
    '--persist-to',
    STATE,
    '--env-file',
    envFile,
    '--var',
    `ADMIN_TOKEN:${TOKEN}`,
    '--var',
    `ALLOW_FAKE_NOW:${fakeNow ? '1' : '0'}`,
  ]
  if (fakeNow) args.push('--test-scheduled')
  const dev = spawn('wrangler', args, { cwd: WORKER_DIR, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
  children.add(dev)
  const out = []
  dev.stdout.on('data', (d) => out.push(String(d)))
  dev.stderr.on('data', (d) => out.push(String(d)))
  const exited = new Promise((resolve) =>
    dev.on('exit', () => {
      children.delete(dev)
      resolve()
    }),
  )
  const up = await waitFor(async () => {
    try {
      return (await fetch(`http://127.0.0.1:${PORT}/api/health`)).ok
    } catch {
      return false
    }
  }, 90000)
  if (!up) {
    console.error(out.join(''))
    throw new Error('Worker did not answer /api/health')
  }
  return {
    output: () => out.join(''),
    async stop() {
      kill(dev)
      await Promise.race([exited, new Promise((r) => setTimeout(r, 10000))])
      await waitFor(async () => !(await portInUse(PORT)), 15000)
    },
  }
}

const runTests = (files) =>
  run(process.execPath, ['--test', '--test-concurrency=1', ...files], {
    env: { ...process.env, SC_WORKER_URL: `http://127.0.0.1:${PORT}`, SC_FIXTURE_URL: fixture.origin, SC_ADMIN_TOKEN: TOKEN },
  })

let exitCode = 1
try {
  if (await portInUse(FX_PORT)) throw new Error(`port ${FX_PORT} is already in use: refusing to reuse another server`)
  rmSync(WORKER_DIR + STATE, { recursive: true, force: true })
  mkdirSync(WORKER_DIR + STATE, { recursive: true })

  log(`migrations → ${STATE} (local)`)
  const mig = await run('wrangler', ['d1', 'migrations', 'apply', 'school-closures-watch', '--local', '--persist-to', STATE])
  if (mig !== 0) throw new Error(`migrations failed (${mig})`)

  fixture = await startFixtureServer({ port: FX_PORT })
  log(`fixture server ${fixture.origin}`)

  // Only this env file is loaded (not worker/.dev.vars).
  const envFile = `${STATE}/test.env`
  writeFileSync(
    WORKER_DIR + envFile,
    `SOURCE_ORIGIN_MAP=${JSON.stringify({ 'https://www.nlschools.ca': fixture.origin, 'https://csfp.nl.ca': fixture.origin })}\n`,
  )

  const tests = readdirSync(WORKER_DIR + 'tests')
    .filter((f) => f.endsWith('.test.mjs'))
    .sort()
  const realNow = tests.filter((f) => f === 'real-now.test.mjs').map((f) => `tests/${f}`)
  const fakeNow = tests.filter((f) => f !== 'real-now.test.mjs').map((f) => `tests/${f}`)

  log(`phase 1: wrangler dev --local on ${PORT}, ALLOW_FAKE_NOW=0`)
  let w = await startWorker({ fakeNow: false, envFile })
  const c1 = await runTests(realNow)
  if (c1 !== 0 && process.env.SC_SHOW_WORKER_LOG) console.error(w.output())
  await w.stop()

  log(`phase 2: wrangler dev --local --test-scheduled on ${PORT}, ALLOW_FAKE_NOW=1`)
  w = await startWorker({ fakeNow: true, envFile })
  const c2 = await runTests(fakeNow)
  if (c2 !== 0 && process.env.SC_SHOW_WORKER_LOG) console.error(w.output())
  await w.stop()

  exitCode = c1 === 0 && c2 === 0 ? 0 : 1
  log(exitCode === 0 ? 'all Worker tests passed' : `Worker tests failed (phase 1: ${c1}, phase 2: ${c2})`)
} catch (err) {
  console.error('[run]', err.message)
  exitCode = 1
} finally {
  await cleanup()
}
process.exit(exitCode)
