#!/usr/bin/env node
// npm run demo
// Applies local D1 migrations, starts the Worker (wrangler dev --local, port 8202) and the app
// (node app/serve.mjs --port 8201, sc2's server), runs one forced live scan, then `scan.mjs --watch` (every minute,
// whatever §6 says is due). Ctrl-C stops every child. Local demo: talks only to the local Worker, nothing --remote.
import { spawn } from 'node:child_process'
import { existsSync, copyFileSync } from 'node:fs'
import { createConnection } from 'node:net'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const WORKER_PORT = Number(process.env.SC_WORKER_PORT ?? 8202)
const APP_PORT = Number(process.env.SC_APP_PORT ?? 8201)
const WORKER_URL = `http://127.0.0.1:${WORKER_PORT}`
const children = new Set()
let stopping = false

const log = (...a) => console.log(`[demo ${new Date().toLocaleTimeString('en-CA', { hour12: false })}]`, ...a)

function start (name, cmd, args, opts = {}) {
  const { longLived, ...spawnOpts } = opts
  const child = spawn(cmd, args, { cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'], detached: true, ...spawnOpts })
  children.add(child)
  child.on('exit', code => {
    children.delete(child)
    if (!stopping && longLived) { log(`${name} exited (${code}); stopping`); stop(1) }
  })
  return child
}

const runOnce = (name, cmd, args, opts = {}) => new Promise(resolve => {
  start(name, cmd, args, opts).on('exit', code => resolve(code ?? 1))
})

function stop (code = 0) {
  if (stopping) return
  stopping = true
  for (const c of children) {
    try { process.kill(-c.pid, 'SIGTERM') } catch { try { c.kill('SIGTERM') } catch {} }
  }
  setTimeout(() => process.exit(code), 800)
}
process.on('SIGINT', () => { log('Ctrl-C: stopping the Worker, the app and the scanner'); stop(0) })
process.on('SIGTERM', () => stop(0))

const portInUse = port => new Promise(resolve => {
  const s = createConnection({ port, host: '127.0.0.1' })
  s.once('connect', () => { s.destroy(); resolve(true) })
  s.once('error', () => resolve(false))
})

async function waitFor (url, ms) {
  const until = Date.now() + ms
  while (Date.now() < until) {
    try { if ((await fetch(url)).ok) return true } catch {}
    await new Promise(r => setTimeout(r, 400))
  }
  return false
}

for (const [what, port] of [['Worker', WORKER_PORT], ['app', APP_PORT]]) {
  if (await portInUse(port)) { log(`port ${port} (${what}) is already in use; stop that first`); process.exit(1) }
}
if (!existsSync(ROOT + 'worker/.dev.vars')) {
  copyFileSync(ROOT + 'worker/.dev.vars.example', ROOT + 'worker/.dev.vars')
  log('created worker/.dev.vars from .dev.vars.example (ADMIN_TOKEN=local-dev-token)')
}
const hasApp = existsSync(ROOT + 'app/serve.mjs')
if (!hasApp) log('app/serve.mjs is not in this tree yet (sc2 builds it): running the Worker and scans only')

const wEnv = { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false' }
log('applying local D1 migrations')
const mig = await runOnce('migrations', 'wrangler', ['d1', 'migrations', 'apply', 'school-closures-watch', '--local'], { cwd: ROOT + 'worker', env: wEnv })
if (mig !== 0) { log(`migrations failed (${mig})`); stop(1) }

log(`starting the Worker on ${WORKER_PORT}`)
start('worker', 'wrangler', ['dev', '--local', '--ip', '127.0.0.1', '--port', String(WORKER_PORT)], { cwd: ROOT + 'worker', env: wEnv, longLived: true })
if (hasApp) {
  log(`starting the app on ${APP_PORT}`)
  start('app', process.execPath, ['app/serve.mjs', '--port', String(APP_PORT)], { longLived: true })
}
if (!(await waitFor(`${WORKER_URL}/api/health`, 90000))) { log('the Worker did not start'); stop(1) }

const scanEnv = { ...process.env, SC_WORKER_URL: WORKER_URL }
log('one forced live scan (polite: ≥ 1.1 s between requests to one host)')
const code = await runOnce('scan', process.execPath, ['scripts/scan.mjs', '--force'], { env: scanEnv })
log(`forced scan finished (${code === 0 ? 'ok' : `exit ${code}`}); now watching the schedule`)
if (!stopping) start('scan --watch', process.execPath, ['scripts/scan.mjs', '--watch'], { env: scanEnv, longLived: true })

console.log(`\nOpen http://127.0.0.1:${APP_PORT}/   (API: ${WORKER_URL})\n`)
