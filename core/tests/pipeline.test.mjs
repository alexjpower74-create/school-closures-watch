// runScan against the fixture server on SC_FIXTURE_PORT (8203). No live requests.
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { runScan, ADAPTERS, USER_AGENT, HOST_GAP_MS, mapOrigin } from '../pipeline.js'
import { REGISTRY, USED } from '../sources/registry.js'
import { startFixtureServer } from './fixture-server.mjs'
import { ROOT } from './helpers.mjs'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtempSync, mkdirSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const PORT = Number(process.env.SC_FIXTURE_PORT ?? 8203)
const NOW = '2026-09-14T16:40:05.000Z'
let fx

before(async () => { fx = await startFixtureServer({ port: PORT }) })
after(async () => { await fx?.close() })
beforeEach(() => fx.reset())

const scan = (opts = {}) => runScan({ now: NOW, force: true, fetchImpl: fetch, originMap: fx.originMap, ...opts })
const byId = (res, id) => res.sources.find(s => s.source_id === id)

test('forced scan of the real 2026-09-14 files: three used sources, ingest payloads, raw copies', async () => {
  const raws = []
  const res = await scan({ onRaw: r => raws.push(r) })
  assert.deepEqual(res.sources.map(s => [s.source_id, s.result]), [['nlschools-status', 'ok'], ['nlschools-notices', 'ok'], ['csfp-news', 'ok']])
  const st = byId(res, 'nlschools-status')
  assert.equal(st.notices.length, 2)
  assert.equal(st.list_date, '2026-09-14')
  assert.equal(st.open_rule_quote, 'If your school is not listed below, the status is normal and open as usual.')
  assert.equal(st.http_status, 200)
  assert.equal(st.quotes_dropped, 0)
  assert.equal(st.sample, true) // origins mapped → replay → sample
  assert.equal(byId(res, 'nlschools-notices').notices.length, 0)
  assert.equal(byId(res, 'csfp-news').notices.length, 0)
  assert.equal(raws.length, 4)
  assert.match(st.raws[0].raw_ref, /^nlschools-status\/2026-\d\d-\d\dT\d\d-\d\d-\d\d-\d{3}Z-statusreport\.html$/)
  assert.deepEqual(st.raws.map(r => r.url), ['https://www.nlschools.ca/schools/statusreport.jsp', 'https://www.nlschools.ca/schools/generated/schoolstatus.html'])
  assert.deepEqual(st.notices[0].raw_refs, st.raws.map(r => r.raw_ref))
  assert.ok(st.requests.every(r => r.bytes > 0 && r.http_status === 200))
})

test('every request carries the research User-Agent; order per host is page, fragment, notices', async () => {
  await scan()
  assert.ok(fx.hits.length === 4)
  assert.ok(fx.hits.every(h => h.ua === USER_AGENT), JSON.stringify(fx.hits.map(h => h.ua)))
  const nls = fx.hits.filter(h => h.path !== '/feed/').map(h => h.path)
  assert.deepEqual(nls, ['/schools/statusreport.jsp', '/schools/generated/schoolstatus.html', '/about/generated/newspostings_5.html'])
})

test('≥ 1.1 s between requests to one host (measured at the fixture server)', async () => {
  await scan()
  const at = fx.hits.filter(h => h.path !== '/feed/').map(h => h.at)
  assert.equal(at.length, 3)
  for (let i = 1; i < at.length; i++) assert.ok(at[i] - at[i - 1] >= HOST_GAP_MS, `gap ${at[i] - at[i - 1]} ms`)
  // a different host is not held back by nlschools.ca
  const feedAt = fx.hits.find(h => h.path === '/feed/').at
  assert.ok(feedAt - at[0] < HOST_GAP_MS, 'csfp.nl.ca waited for nlschools.ca')
})

test('≥ 1.1 s between requests to one host (fake clock)', async () => {
  let t = Date.parse(NOW)
  const calls = []
  const fakeFetch = async (url) => { calls.push({ url, t }); t += 250; return new Response('<rss><channel></channel></rss>', { status: 200 }) }
  await runScan({ now: NOW, force: true, fetchImpl: fakeFetch, clock: () => t, sleep: async ms => { t += ms } })
  const nls = calls.filter(c => c.url.startsWith('https://www.nlschools.ca'))
  assert.equal(nls.length, 3)
  for (let i = 1; i < nls.length; i++) assert.ok(nls[i].t - nls[i - 1].t >= HOST_GAP_MS + 250, `gap ${nls[i].t - nls[i - 1].t}`)
})

test('link-only and not-used sources are never requested', async () => {
  const urls = []
  const spy = (url, init) => { urls.push(url); return fetch(url, init) }
  await scan({ fetchImpl: spy })
  const allowed = USED.flatMap(e => e.fetch_urls).map(u => mapOrigin(u, fx.originMap))
  assert.deepEqual([...new Set(urls)].sort(), [...new Set(allowed)].sort())
  assert.ok(fx.hits.every(h => !h.path.startsWith('/__linkonly')))
  for (const e of REGISTRY.filter(x => x.kind !== 'used')) {
    await assert.rejects(runScan({ now: NOW, force: true, only: e.id, fetchImpl: spy }), /never fetched/)
    assert.ok(!urls.some(u => u.startsWith(mapOrigin(e.human_url ?? 'x:', fx.originMap))), e.id)
  }
  assert.equal(fx.hits.length, 4)
})

test('due sources only unless force; --only scans one source', async () => {
  const health = Object.fromEntries(USED.map(e => [e.id, { last_attempt_at: NOW }]))
  const res = await runScan({ now: NOW, fetchImpl: fetch, originMap: fx.originMap, health })
  assert.deepEqual(res.sources.map(s => s.result), ['skipped', 'skipped', 'skipped'])
  assert.equal(fx.hits.length, 0)
  const later = await runScan({ now: '2026-09-14T17:40:06.000Z', fetchImpl: fetch, originMap: fx.originMap, health })
  assert.deepEqual(later.sources.map(s => s.result), ['ok', 'ok', 'ok'])
  fx.reset()
  const one = await scan({ only: 'csfp-news' })
  assert.deepEqual(one.sources.map(s => s.source_id), ['csfp-news'])
  assert.deepEqual(fx.hits.map(h => h.path), ['/feed/'])
})

test('HTTP 503 → result error, no notices; other hosts unaffected', async () => {
  fx.setScenario('stale')
  const res = await scan()
  const st = byId(res, 'nlschools-status')
  assert.deepEqual([st.result, st.error, st.http_status, st.notices.length, st.raws.length], ['error', 'HTTP 503', 503, 0, 0])
  assert.equal(byId(res, 'nlschools-notices').result, 'error')
  assert.equal(byId(res, 'csfp-news').result, 'ok')
})

test('a request that never answers fails its source with "timeout"', async () => {
  fx.hang('/feed/')
  const res = await scan({ only: 'csfp-news', timeoutMs: 400 })
  assert.deepEqual([res.sources[0].result, res.sources[0].error], ['error', 'timeout'])
})

test('format_changed from the adapter comes through with the raws kept', async () => {
  fx.setScenario('format')
  const st = byId(await scan({ only: 'nlschools-status' }), 'nlschools-status')
  assert.deepEqual([st.result, st.error, st.notices.length, st.raws.length], ['format_changed', 'table not found', 0, 2])
})

test('verification runs in runScan: a tampered quote is dropped and counted', async () => {
  const orig = ADAPTERS['nlschools-status']
  const tampering = { ...orig, parse: (raws, ctx) => { const r = orig.parse(raws, ctx); r.notices[0] = { ...r.notices[0], quote: 'SAMPLE School open as usual' }; return r } }
  const res = await scan({ only: 'nlschools-status', adapters: { ...ADAPTERS, 'nlschools-status': tampering } })
  assert.deepEqual([res.sources[0].notices.length, res.sources[0].quotes_dropped], [1, 1])
})

// ---------- scripts/scan.mjs (same fixture server; the data dir goes under the gitignored test-results/) ----------

const SCRIPT = fileURLToPath(new URL('../../scripts/scan.mjs', import.meta.url))
const tmpData = () => mkdtempSync(ROOT + 'test-results/sc1-scan-')

function runScript (args, env) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [SCRIPT, ...args], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''; let stderr = ''
    child.stdout.on('data', d => { stdout += d })
    child.stderr.on('data', d => { stderr += d })
    child.on('exit', code => resolve({ code, stdout, stderr }))
  })
}

test('scan.mjs --dry --force: data/sources.json (registry + last results), scan-latest.json without bodies, raw cache', async () => {
  mkdirSync(ROOT + 'test-results', { recursive: true })
  const dir = tmpData()
  try {
    const r = await runScript(['--dry', '--force', '--now', NOW], { SOURCE_ORIGIN_MAP: JSON.stringify(fx.originMap), SC_DATA_DIR: dir, SC_WORKER_URL: 'http://127.0.0.1:9' })
    assert.equal(r.code, 0, r.stderr)
    assert.match(r.stdout, /nlschools-status\s+ok\s+list 2026-09-14 notices\s+2/)
    const sj = JSON.parse(readFileSync(dir + '/sources.json', 'utf8'))
    assert.deepEqual(sj.sources.map(s => s.id), REGISTRY.map(e => e.id))
    const st = sj.sources.find(s => s.id === 'nlschools-status')
    assert.deepEqual([st.last.result, st.last.notices, st.last.list_date, st.last.requests.length], ['ok', 2, '2026-09-14', 2])
    assert.equal(sj.sources.find(s => s.id === 'nlschools-busplanner').last, null)
    const latest = readFileSync(dir + '/scan-latest.json', 'utf8')
    assert.ok(!latest.includes('"body"'))
    for (const req of st.last.requests) assert.ok(existsSync(`${dir}/sources/${req.raw_ref}`), req.raw_ref)
    assert.equal(fx.hits.length, 4)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

async function fakeWorker (lastAttempt) {
  const ingests = []
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', d => { body += d })
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' })
      if (req.url === '/api/sources') return res.end(JSON.stringify({ sources: REGISTRY.map(e => ({ id: e.id, kind: e.kind, last_attempt_at: lastAttempt })) }))
      if (req.url === '/api/admin/ingest') {
        const p = JSON.parse(body)
        ingests.push({ auth: req.headers.authorization, payload: p })
        return res.end(JSON.stringify({ ok: true, source_id: p.source_id, accepted: p.notices.length, quotes_dropped: 0, removed: 0, notices_current: p.notices.length }))
      }
      res.end('{}')
    })
  })
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  return { url: `http://127.0.0.1:${server.address().port}`, ingests, close: () => new Promise(r => server.close(r)) }
}

test('scan.mjs POSTs one ingest per scanned source with the admin token', async () => {
  const w = await fakeWorker(null)
  const dir = tmpData()
  try {
    const r = await runScript(['--now', NOW], { SOURCE_ORIGIN_MAP: JSON.stringify(fx.originMap), SC_DATA_DIR: dir, SC_WORKER_URL: w.url, SC_ADMIN_TOKEN: 'sample-token' })
    assert.equal(r.code, 0, r.stderr)
    assert.deepEqual(w.ingests.map(i => i.payload.source_id), ['nlschools-status', 'nlschools-notices', 'csfp-news'])
    assert.ok(w.ingests.every(i => i.auth === 'Bearer sample-token'))
    const st = w.ingests[0].payload
    assert.deepEqual([st.trigger, st.result, st.sample, st.notices.length, st.raws.length, 'requests' in st], ['npm-scan', 'ok', true, 2, 2, false])
    assert.ok(st.raws.every(x => typeof x.body === 'string' && x.body.length > 0))
  } finally { await w.close(); rmSync(dir, { recursive: true, force: true }) }
})

test('scan.mjs without --force skips what the Worker says was just attempted; --only rejects link-only ids', async () => {
  const w = await fakeWorker(NOW)
  const dir = tmpData()
  try {
    const r = await runScript(['--now', NOW], { SOURCE_ORIGIN_MAP: JSON.stringify(fx.originMap), SC_DATA_DIR: dir, SC_WORKER_URL: w.url })
    assert.equal(r.code, 0, r.stderr)
    assert.equal(w.ingests.length, 0)
    assert.equal(fx.hits.length, 0)
    const bad = await runScript(['--dry', '--only', 'nlschools-busplanner'], { SC_DATA_DIR: dir })
    assert.equal(bad.code, 2)
    assert.equal(fx.hits.length, 0)
  } finally { await w.close(); rmSync(dir, { recursive: true, force: true }) }
})

test('storm scenario: real 2024-01-10 rows plus SAMPLE rows and the SAMPLE region-wide text notice', async () => {
  fx.setScenario('storm')
  const res = await scan()
  const st = byId(res, 'nlschools-status')
  assert.deepEqual(st.notices.map(n => [n.school_text, n.status, n.scope]), [
    ["Bay d'Espoir Academy", 'closed_part', 'school'], ['Bishop White School', 'delayed', 'school'], ["St. Mark's School", 'delayed', 'school'],
    ['SAMPLE Glovertown', 'closed', 'school'], ['SAMPLE Nowhere Harbour School', 'closed', 'unmatched']
  ])
  const tn = byId(res, 'nlschools-notices').notices
  assert.deepEqual(tn.map(n => [n.status, n.scope, n.scope_region]), [['closed', 'region', 'central']])
})
