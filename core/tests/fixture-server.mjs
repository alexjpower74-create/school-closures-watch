// Fixture server: serves the REAL saved files in data/samples/ (and SAMPLE fixtures) at the real source paths.
// Core scan tests use SC_FIXTURE_PORT (8203); the Worker tests use SC_WORKER_FIXTURE_PORT (8204).
//   GET  /__log                 → { scenario, hits: [{ method, path, ua, at }] }
//   POST /__reset               → clears hits, failures, hangs; scenario back to "today"
//   POST /__scenario?name=storm → switch scenario (see SCENARIOS)
//   POST /__fail?path=/feed/    → that path answers 503 until reset
//   POST /__hang?path=/feed/    → that path never answers until reset
// `scenarioBody(name, path)` is also used in-process by worker/tests/seed.mjs.
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const read = (p) => readFileSync(p, 'utf8')
const S = (rel) => read(ROOT + 'data/samples/' + rel)
const F = (rel) => read(ROOT + 'core/tests/fixtures/' + rel)

export const PATHS = {
  page: '/schools/statusreport.jsp',
  frag: '/schools/generated/schoolstatus.html',
  notices: '/about/generated/newspostings_5.html',
  feed: '/feed/',
}

const PAGE = () => S('nlschools/statusreport-2026-09-14T1408NDT.html')
const TODAY_FRAG = () => S('nlschools/schoolstatus-2026-09-14T1640Z.html')
const STORM_FIX = () => F('nlschools/schoolstatus-sample-storm.html')
const WAYBACK_0110 = () => S('wayback/schoolstatus-20240110005921.html')

const rowsOf = (body, ids) => [...body.matchAll(/<tr id=(\d+)>[\s\S]*?<\/tr>/g)].filter((m) => !ids || ids.includes(m[1])).map((m) => m[0])

/** The real fragment's markup with only the given rows (from any fixture) inside <tbody>. */
export function fragmentWith(rows) {
  const b = TODAY_FRAG()
  const open = b.indexOf('<tbody>') + '<tbody>'.length
  return b.slice(0, open) + '\n' + rows.join('\n') + '\n' + b.slice(b.indexOf('</tbody>'))
}

const EMPTY_NOTICES = () => S('nlschools/newspostings_5-2026-09-14-empty.html')
const FEED = () => S('csfp/feed-2026-09-14.xml')
const DOWN = { status: 503, body: 'SAMPLE fixture: service unavailable' }

const BASE = { page: PAGE, frag: TODAY_FRAG, notices: EMPTY_NOTICES, feed: FEED }

/** Each scenario overrides the real 2026-09-14 files ("today"). */
export const SCENARIOS = {
  today: {},
  quiet: { frag: () => fragmentWith([]) },
  gone: { frag: () => fragmentWith(rowsOf(TODAY_FRAG(), ['695'])) }, // Glovertown no longer listed
  region: { frag: () => fragmentWith(rowsOf(STORM_FIX(), ['9001'])), notices: () => F('nlschools/newspostings_5-sample-text.html') },
  ambiguous: { frag: () => fragmentWith(rowsOf(STORM_FIX(), ['9002'])) },
  storm: {
    frag: () => fragmentWith([...rowsOf(WAYBACK_0110()), ...rowsOf(STORM_FIX(), ['9002', '9004'])]),
    notices: () => F('nlschools/newspostings_5-sample-text.html'),
  },
  stale: { page: () => DOWN, frag: () => DOWN, notices: () => DOWN },
  norule: { page: () => PAGE().replace('If your school is not listed below, the status is normal and open as usual.', '') },
  nodate: { page: () => PAGE().replace('Real-time school closure information for:', 'SAMPLE School closure information') },
  format: { frag: () => F('nlschools/fragment-no-table.html') },
  csfp: { feed: () => F('csfp/feed-sample.xml') },
}

const KEY_BY_PATH = Object.fromEntries(Object.entries(PATHS).map(([k, p]) => [p, k]))

/** → { status, body, type } or null when the path isn't a source path. */
export function scenarioBody(name, path) {
  const key = KEY_BY_PATH[path]
  if (!key) return null
  const sc = SCENARIOS[name]
  if (!sc) throw new Error(`unknown scenario ${name}`)
  const v = (sc[key] ?? BASE[key])()
  const type = key === 'feed' ? 'application/rss+xml; charset=UTF-8' : 'text/html; charset=utf-8'
  return typeof v === 'string' ? { status: 200, body: v, type } : { status: v.status, body: v.body, type: 'text/plain' }
}

/** Every registry origin (fetched or never fetched) points at this server, so a stray request would be logged. */
export function originMapFor(port) {
  const b = `http://127.0.0.1:${port}`
  return {
    'https://www.nlschools.ca': b,
    'https://csfp.nl.ca': b,
    'https://nlschools.mybusplanner.ca': `${b}/__linkonly/busplanner`,
    'https://twitter.com': `${b}/__linkonly/twitter`,
    'https://www.facebook.com': `${b}/__linkonly/facebook`,
  }
}

export function startFixtureServer({ port }) {
  const hits = []
  const failing = new Set()
  const hanging = new Set()
  let scenario = 'today'
  const server = createServer((req, res) => {
    const u = new URL(req.url, 'http://x')
    const ctl = (code, obj) => {
      res.writeHead(code, { 'content-type': 'application/json' })
      res.end(obj ? JSON.stringify(obj) : '')
    }
    if (u.pathname === '/__log') return ctl(200, { scenario, hits })
    if (u.pathname === '/__reset') {
      hits.length = 0
      failing.clear()
      hanging.clear()
      scenario = 'today'
      return ctl(200, { ok: true })
    }
    if (u.pathname === '/__scenario') {
      const name = u.searchParams.get('name')
      if (!SCENARIOS[name]) return ctl(400, { error: 'unknown scenario' })
      scenario = name
      return ctl(200, { scenario })
    }
    if (u.pathname === '/__fail') {
      failing.add(u.searchParams.get('path'))
      return ctl(200, { ok: true })
    }
    if (u.pathname === '/__hang') {
      hanging.add(u.searchParams.get('path'))
      return ctl(200, { ok: true })
    }
    hits.push({ method: req.method, path: u.pathname + u.search, ua: req.headers['user-agent'] ?? null, at: Date.now() })
    if (hanging.has(u.pathname)) return // never answers; close() destroys the socket
    if (failing.has(u.pathname)) {
      res.writeHead(503, { 'content-type': 'text/plain' })
      return res.end('fixture failure')
    }
    const out = scenarioBody(scenario, u.pathname)
    if (!out) {
      res.writeHead(404, { 'content-type': 'text/plain' })
      return res.end('not in fixtures')
    }
    res.writeHead(out.status, { 'content-type': out.type })
    res.end(out.body)
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject) // EADDRINUSE: never reuse a server already on the port
    server.listen(port, '127.0.0.1', () =>
      resolve({
        hits,
        origin: `http://127.0.0.1:${port}`,
        originMap: originMapFor(port),
        setScenario(name) {
          if (!SCENARIOS[name]) throw new Error(`unknown scenario ${name}`)
          scenario = name
        },
        fail(path) {
          failing.add(path)
        },
        hang(path) {
          hanging.add(path)
        },
        reset() {
          hits.length = 0
          failing.clear()
          hanging.clear()
          scenario = 'today'
        },
        close: () =>
          new Promise((r) => {
            server.close(r)
            server.closeAllConnections()
          }),
      }),
    )
  })
}

// `node core/tests/fixture-server.mjs --port 8204` runs it standalone.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const i = process.argv.indexOf('--port')
  const port = Number(i >= 0 ? process.argv[i + 1] : (process.env.SC_FIXTURE_PORT ?? 8203))
  startFixtureServer({ port }).then(
    (f) => console.log(`fixture server on ${f.origin}`),
    (err) => {
      console.error(err.message)
      process.exit(1)
    },
  )
}
