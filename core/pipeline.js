// runScan (API.md §3, §6): due sources only unless `force`, ≥ 1.1 s between requests to one host, the research
// User-Agent, 20 s timeouts, origin mapping for fixtures, raw copies, parsing and verification. Returns one ingest
// payload (§5.5) per source. Runs in Node (scripts/scan.mjs) and in the Worker (scheduled, /api/admin/scan).
import { USED, REGISTRY_BY_ID } from './sources/registry.js'
import nlschoolsStatus from './sources/nlschools-status.js'
import nlschoolsNotices from './sources/nlschools-notices.js'
import csfpNews from './sources/csfp-news.js'
import { verifyNotice, verifyValue } from './verify.js'
import { classifyNotice } from './notice.js'
import { refStamp, iso } from './time.js'
import { SCHOOLS } from './schools.js'

export const USER_AGENT = 'APCO-Software-Tools-research/1.0 (+https://apcosoftwaretools.ca)'
export const HOST_GAP_MS = 1100
export const REQUEST_TIMEOUT_MS = 20000

export const ADAPTERS = {
  'nlschools-status': nlschoolsStatus,
  'nlschools-notices': nlschoolsNotices,
  'csfp-news': csfpNews
}

export function parseOriginMap (v) {
  if (!v) return {}
  if (typeof v === 'object') return v
  try { return JSON.parse(v) } catch { throw new Error('SOURCE_ORIGIN_MAP is not valid JSON') }
}

export function mapOrigin (url, originMap) {
  for (const [from, to] of Object.entries(originMap ?? {})) {
    const f = from.replace(/\/+$/, '')
    if (url.startsWith(f) && (url.length === f.length || '/?#'.includes(url[f.length]))) {
      return to.replace(/\/+$/, '') + url.slice(f.length)
    }
  }
  return url
}

const byteLength = s => new TextEncoder().encode(s).length
const stripName = ({ name, ...raw }) => raw
const failure = (message, req) => Object.assign(new Error(message), { req })

/**
 * → { trigger, now, started_at, finished_at, sources: [payload (§5.5) + requests + quotes_dropped |
 *     { source_id, result: 'skipped', skipped_reason: 'not_due' }] }
 * `originMap` non-empty → notices are `sample: true` unless `sample` is given.
 * `health` = { [source_id]: { last_attempt_at } } for the due check. `sleep`/`clock` are injectable for tests.
 */
export async function runScan ({
  now,
  only = null,
  force = false,
  fetchImpl,
  originMap = {},
  onRaw = null,
  health = {},
  schools = SCHOOLS,
  trigger = 'npm-scan',
  sample,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  clock = () => Date.now(),
  timeoutMs = REQUEST_TIMEOUT_MS,
  adapters = ADAPTERS
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('runScan needs fetchImpl')
  if (only && !USED.some(e => e.id === only)) {
    throw new Error(REGISTRY_BY_ID[only] ? `${only} is ${REGISTRY_BY_ID[only].kind}: never fetched` : `unknown source id: ${only}`)
  }
  const map = parseOriginMap(originMap)
  const isSample = sample ?? Object.keys(map).length > 0
  const nowIso = iso(now ?? clock())
  const started_at = iso(clock())

  // Per real host: one request at a time, each starting ≥ HOST_GAP_MS after the previous one to that host ended.
  const hosts = new Map()
  function politely (host, fn) {
    const h = hosts.get(host) ?? { tail: Promise.resolve(), lastEnd: null }
    hosts.set(host, h)
    const run = h.tail.then(async () => {
      if (h.lastEnd !== null) {
        const wait = h.lastEnd + HOST_GAP_MS - clock()
        if (wait > 0) await sleep(wait)
      }
      try { return await fn() } finally { h.lastEnd = clock() }
    })
    h.tail = run.catch(() => {})
    return run
  }

  function fetchOne (entry, step) {
    return politely(new URL(step.url).host, async () => {
      const req = { url: step.url, http_status: null, bytes: 0, raw_ref: null }
      const abort = new AbortController()
      let timedOut = false
      const timer = setTimeout(() => { timedOut = true; abort.abort() }, timeoutMs)
      try {
        let res, body
        try {
          res = await fetchImpl(mapOrigin(step.url, map), {
            headers: { 'User-Agent': USER_AGENT, Accept: step.format === 'xml' ? 'application/rss+xml, application/xml;q=0.9, */*;q=0.1' : 'text/html, */*;q=0.1' },
            redirect: 'follow',
            signal: abort.signal
          })
          req.http_status = res.status
          body = await res.text()
        } catch {
          throw failure(timedOut ? 'timeout' : 'network error', req)
        }
        if (!res.ok) throw failure(`HTTP ${res.status}`, req)
        const fetched_at = iso(clock())
        req.bytes = byteLength(body)
        req.raw_ref = `${entry.id}/${refStamp(fetched_at)}-${step.name}.${step.format}`
        const raw = { raw_ref: req.raw_ref, url: step.url, name: step.name, fetched_at, format: step.format, body }
        if (onRaw) await onRaw(stripName(raw))
        return { raw, req }
      } finally {
        clearTimeout(timer)
      }
    })
  }

  async function runSource (entry) {
    const adapter = adapters[entry.id]
    if (!force && !adapter.due(nowIso, health?.[entry.id] ?? null)) {
      return { source_id: entry.id, result: 'skipped', skipped_reason: 'not_due' }
    }
    const payload = {
      source_id: entry.id, trigger, started_at: iso(clock()), finished_at: null,
      result: 'ok', error: null, http_status: null, raws: [],
      list_date: null, list_date_text: null, open_rule_quote: null,
      rows_skipped: 0, unmapped_classes: [], notices: [], sample: isSample,
      quotes_dropped: 0, requests: []
    }
    const done = patch => Object.assign(payload, patch, { finished_at: iso(clock()) })
    const raws = []
    for (const step of adapter.fetchPlan(nowIso)) {
      try {
        const { raw, req } = await fetchOne(entry, step)
        raws.push(raw)
        payload.requests.push(req)
        payload.http_status = req.http_status
      } catch (err) {
        if (err.req) { payload.requests.push(err.req); payload.http_status = err.req.http_status }
        return done({ result: 'error', error: err.message })
      }
    }
    let parsed
    try {
      parsed = adapter.parse(raws, { now: nowIso, schools, sample: isSample })
    } catch (err) {
      return done({ result: 'format_changed', error: `could not read the page (${err.message})`, raws: raws.map(stripName) })
    }
    const kept = raws.map(stripName)
    // Page-level verbatim fields verify like notice fields (§0).
    const list_date_text = parsed.list_date_text && verifyValue(parsed.list_date_text, kept) ? parsed.list_date_text : null
    const { notices, dropped } = verifyAndClassify(parsed.notices ?? [], kept, schools)
    return done({
      result: parsed.result,
      error: parsed.error ?? null,
      raws: kept,
      list_date: list_date_text ? parsed.list_date : null,
      list_date_text,
      open_rule_quote: parsed.open_rule_quote && verifyValue(parsed.open_rule_quote, kept) ? parsed.open_rule_quote : null,
      rows_skipped: parsed.rows_skipped ?? 0,
      unmapped_classes: parsed.unmapped_classes ?? [],
      notices,
      quotes_dropped: dropped
    })
  }

  // Sources on one host run one after another in registry order (nlschools-status, then nlschools-notices);
  // different hosts run side by side.
  const entries = USED.filter(e => !only || e.id === only)
  const groups = new Map()
  for (const e of entries) {
    const host = new URL(e.fetch_urls[0]).host
    if (!groups.has(host)) groups.set(host, [])
    groups.get(host).push(e)
  }
  const results = new Map()
  await Promise.all([...groups.values()].map(async group => {
    for (const e of group) results.set(e.id, await runSource(e))
  }))
  return { trigger, now: nowIso, started_at, finished_at: iso(clock()), sources: entries.map(e => results.get(e.id)) }
}

/** §0 verification, then re-derivation from the verified fields. Used by runScan and by the Worker at ingest. */
export function verifyAndClassify (notices, raws, schools = SCHOOLS) {
  const kept = []
  let dropped = 0
  for (const n of notices) {
    const v = verifyNotice(n, raws)
    if (!v.notice) { dropped++; continue }
    const { notice } = classifyNotice(v.notice, schools)
    // A phrase or region that verification refused stays refused.
    if (v.nulled.includes('status_evidence')) Object.assign(notice, { status: 'other', status_basis: 'none', status_evidence: null })
    kept.push(notice)
  }
  return { notices: kept, dropped }
}
