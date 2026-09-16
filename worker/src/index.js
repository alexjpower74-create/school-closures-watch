// School Closures Watch Worker (API.md §7). Local only. Imports core directly; verification runs again at ingest,
// and everything derived (status, scope, matches) is recomputed from the verified fields.
import { runScan, verifyAndClassify, parseOriginMap } from '../../core/pipeline.js'
import { REGISTRY, REGISTRY_BY_ID, USED, NLS_OPEN_RULE } from '../../core/sources/registry.js'
import { staleness, staleText, nextDue, intervalMinutes } from '../../core/schedule.js'
import { schoolStatus, indexNotices, sortStatuses, mayApplyReasonText } from '../../core/status.js'
import { SCHOOLS, SCHOOL_BY_ID, publicSchool, schoolCounts, REGION_NAMES, REGIONS, schoolsInRegion } from '../../core/schools.js'
import { SCHOOLS_DATA } from '../../core/schools-data.js'
import { noticeShapeError, verifyValue } from '../../core/verify.js'
import { rankOf } from '../../core/labels.js'
import { localDate, parseListDate, iso } from '../../core/time.js'
import { normName } from '../../core/text.js'

const MAX_INGEST_BYTES = 10 * 1024 * 1024
const RAW_KEEP_INGESTS = 3
const MAX_IDS = 30

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Max-Age': '86400',
}
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
const fail = (status, error, message) => json({ error, message }, status)
const isIso = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v))

function nowFrom(url, env) {
  const q = url.searchParams.get('now')
  if (env.ALLOW_FAKE_NOW === '1' && isIso(q)) return iso(q)
  return new Date().toISOString()
}
const includeSampleFrom = (url) => url.searchParams.get('include_sample') === '1'

async function authorized(request, env) {
  const m = /^Bearer\s+(.+)$/.exec(request.headers.get('authorization') ?? '')
  if (!m || !env.ADMIN_TOKEN) return false
  const enc = new TextEncoder()
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(m[1])),
    crypto.subtle.digest('SHA-256', enc.encode(env.ADMIN_TOKEN)),
  ])
  const x = new Uint8Array(a)
  const y = new Uint8Array(b)
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]
  return diff === 0
}

// ---------- reads ----------

async function healthRows(env) {
  const { results } = await env.DB.prepare('SELECT * FROM source_health').all()
  return Object.fromEntries(results.map((r) => [r.id, { ...r, unmapped_classes: safeJson(r.unmapped_classes, []) }]))
}

function safeJson(s, fallback) {
  try {
    return JSON.parse(s)
  } catch {
    return fallback
  }
}

async function loadNotices(env, { includeSample, current }) {
  let sql = 'SELECT json FROM notices'
  const where = []
  if (current) where.push('removed_at IS NULL')
  if (!includeSample) where.push('sample = 0')
  if (where.length) sql += ' WHERE ' + where.join(' AND ')
  const { results } = await env.DB.prepare(sql).all()
  return results.map((r) => JSON.parse(r.json))
}

/** §5.2 for a registry entry. */
function healthView(entry, row, now, notices) {
  const used = entry.kind === 'used'
  const s = used ? staleness(entry.id, now, row) : { stale: false, stale_reason: null }
  return {
    id: entry.id,
    name: entry.name,
    kind: entry.kind,
    human_url: entry.human_url,
    last_attempt_at: row?.last_attempt_at ?? null,
    last_ok_at: row?.last_ok_at ?? null,
    last_result: row?.last_result ?? 'never',
    last_error: row?.last_error ?? null,
    list_date: row?.list_date ?? null,
    list_date_text: row?.list_date_text ?? null,
    open_rule_quote: row?.open_rule_quote ?? null,
    notices_current: notices.filter((n) => n.source_id === entry.id && !n.removed_at).length,
    rows_skipped: row?.rows_skipped ?? 0,
    quotes_dropped: row?.quotes_dropped ?? 0,
    unmapped_classes: row?.unmapped_classes ?? [],
    stale: s.stale,
    stale_reason: s.stale_reason,
    stale_text: used ? staleText(entry.id, s.stale_reason, row) : null,
    next_due_at: used ? (row?.last_attempt_at ? nextDue(entry.id, row.last_attempt_at) : now) : null,
    interval_minutes_now: used ? intervalMinutes(entry.id, now) : null,
  }
}

const usedHealth = (health, now, notices) => USED.map((e) => healthView(e, health[e.id], now, notices))
const staleList = (sources) => sources.filter((s) => s.stale).map((s) => ({ source_id: s.id, text: s.stale_text }))

const regionOf = (n) => {
  const r = normName(n.region_text)
  if (REGIONS.includes(r)) return r
  for (const m of n.matches ?? []) {
    const s = SCHOOL_BY_ID.get(m.school_id)
    if (s?.region) return s.region
  }
  return null
}

const byRankThenText = (a, b) =>
  rankOf(a.status) - rankOf(b.status) ||
  String(a.school_text ?? a.title ?? a.quote).localeCompare(String(b.school_text ?? b.title ?? b.quote), 'en')

function appliesTo(n) {
  if (n.scope === 'region') return schoolsInRegion(n.scope_region).map((s) => ({ school: s, how: 'region' }))
  if (n.scope === 'province') return SCHOOLS.filter((s) => s.coverage === 'nlschools').map((s) => ({ school: s, how: 'province' }))
  return (n.matches ?? [])
    .filter((m) => m.how === 'exact')
    .map((m) => ({ school: SCHOOL_BY_ID.get(m.school_id), how: 'exact' }))
    .filter((x) => x.school)
}

async function handleSchools() {
  return json({ built_from_fetch: SCHOOLS_DATA.built_from_fetch, count: SCHOOLS.length, schools: SCHOOLS.map(publicSchool) })
}

async function handleStatus(url, env) {
  const now = nowFrom(url, env)
  const ids = [
    ...new Set(
      String(url.searchParams.get('ids') ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ]
  if (ids.length < 1 || ids.length > MAX_IDS) return fail(400, 'bad_ids', `Pass 1–${MAX_IDS} school ids as ids=a,b,c`)
  const [health, notices] = await Promise.all([healthRows(env), loadNotices(env, { includeSample: includeSampleFrom(url), current: true })])
  const index = indexNotices(notices)
  const known = ids.filter((id) => SCHOOL_BY_ID.has(id))
  const statuses = sortStatuses(known.map((id) => schoolStatus(publicSchool(SCHOOL_BY_ID.get(id)), index, health, now)))
  const district = notices.filter((n) => n.scope === 'district').sort(byRankThenText)
  const referenced = {}
  for (const s of statuses) {
    for (const a of s.applies) referenced[a.notice_id] = index.byId.get(a.notice_id)
    for (const m of s.may_apply) referenced[m.notice_id] = index.byId.get(m.notice_id)
  }
  for (const n of district) referenced[n.id] = n
  const sources = usedHealth(health, now, notices)
  return json({
    now,
    today_local: localDate(now),
    sources,
    stale: staleList(sources),
    district_notices: district,
    schools: statuses,
    notices: referenced,
    unknown_ids: ids.filter((id) => !SCHOOL_BY_ID.has(id)),
  })
}

async function handleToday(url, env) {
  const now = nowFrom(url, env)
  const includeSample = includeSampleFrom(url)
  const [health, all] = await Promise.all([healthRows(env), loadNotices(env, { includeSample, current: false })])
  const today = localDate(now)
  // §4.5 (lead fix 14:55): notices from an older list are not current today; they are listed under `earlier`.
  const old = (n) => n.list_date !== null && n.list_date !== undefined && n.list_date < today
  const current = all.filter((n) => !n.removed_at && !old(n))
  const sources = usedHealth(health, now, current)
  const nls = health['nlschools-status'] ?? null
  const listDate = nls?.list_date ?? today
  const by_status = {}
  for (const n of current) by_status[n.status] = (by_status[n.status] ?? 0) + 1
  const withApplies = (n) => ({
    ...n,
    applies_to: (n.matches ?? [])
      .map((m) => ({ m, s: SCHOOL_BY_ID.get(m.school_id) }))
      .filter((x) => x.s)
      .map(({ m, s }) => ({ school_id: s.id, name: s.name, community: s.community, how: m.how, reason: m.reason ?? null })),
  })
  const rows = current.filter((n) => n.source_id === 'nlschools-status')
  const isEarlier = (n) => n.source_id === 'nlschools-status' && ((n.removed_at && n.list_date === listDate) || (!n.removed_at && old(n)))
  const regions = REGIONS.map((region) => ({
    region,
    region_name: REGION_NAMES[region],
    notices: rows
      .filter((n) => n.scope === 'school' && regionOf(n) === region)
      .sort(byRankThenText)
      .map(withApplies),
    unmatched: rows.filter((n) => n.scope === 'unmatched' && regionOf(n) === region).sort(byRankThenText),
    earlier: all.filter((n) => isEarlier(n) && regionOf(n) === region).sort(byRankThenText),
  }))
  return json({
    now,
    today_local: localDate(now),
    list_date: nls?.list_date ?? null,
    list_date_text: nls?.list_date_text ?? null,
    sources,
    stale: staleList(sources),
    counts: { current: current.length, by_status },
    district: current.filter((n) => n.scope === 'district').sort(byRankThenText),
    region_wide: current.filter((n) => n.scope === 'region' || n.scope === 'province').sort(byRankThenText),
    regions,
    csfp: current.filter((n) => n.source_id === 'csfp-news').sort(byRankThenText),
    // Status rows that can't be placed in one of the four regions (no known region_text, no matched school): listed
    // here so they are never silently left out. Real rows always carry a region.
    unplaced: rows.filter((n) => (n.scope === 'school' || n.scope === 'unmatched') && regionOf(n) === null).sort(byRankThenText),
    open_rule_quote: nls?.open_rule_quote ?? null,
  })
}

async function handleNotice(url, env, id) {
  const now = nowFrom(url, env)
  const row = await env.DB.prepare('SELECT json, sample FROM notices WHERE id = ?1').bind(id).first()
  if (!row || (row.sample && !includeSampleFrom(url))) return fail(404, 'not_found', 'No notice with that id.')
  const notice = JSON.parse(row.json)
  const entry = REGISTRY_BY_ID[notice.source_id]
  const health = await healthRows(env)
  const counts = await loadNotices(env, { includeSample: includeSampleFrom(url), current: true })
  const refs = notice.raw_refs ?? []
  const raws = refs.length
    ? (
        await env.DB.prepare(`SELECT raw_ref, fetched_at FROM raw_copies WHERE raw_ref IN (${refs.map((_, i) => `?${i + 1}`).join(',')})`)
          .bind(...refs)
          .all()
      ).results
    : []
  const kept = new Map(raws.map((r) => [r.raw_ref, r]))
  return json({
    notice,
    source: { ...entry, ...healthView(entry, health[entry.id], now, counts) },
    applies_to: appliesTo(notice).map((a) => ({ school: publicSchool(a.school), how: a.how })),
    may_apply_to: (notice.matches ?? [])
      .filter((m) => m.how === 'may_apply')
      .map((m) => ({ m, s: SCHOOL_BY_ID.get(m.school_id) }))
      .filter((x) => x.s)
      .map(({ m, s }) => ({ school: publicSchool(s), reason: m.reason, reason_text: mayApplyReasonText(m.reason, notice) })),
    raw_links: refs.filter((r) => kept.has(r)).map((r) => ({ raw_ref: r, href: `/api/raw/${r}`, fetched_at: kept.get(r).fetched_at })),
  })
}

async function handleSources(url, env) {
  const now = nowFrom(url, env)
  const [health, notices] = await Promise.all([healthRows(env), loadNotices(env, { includeSample: includeSampleFrom(url), current: true })])
  return json({
    now,
    sources: REGISTRY.map((e) => ({ ...e, ...healthView(e, health[e.id], now, notices) })),
    schools: { counts: schoolCounts(), sources: SCHOOLS_DATA.sources },
  })
}

async function handleRaw(env, rawRef) {
  const row = await env.DB.prepare('SELECT body FROM raw_copies WHERE raw_ref = ?1').bind(rawRef).first()
  if (!row) return fail(404, 'not_found', 'That saved copy is not kept.')
  return new Response(row.body, { headers: { ...CORS, 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } })
}

// ---------- ingest ----------

function payloadError(p) {
  if (!p || typeof p !== 'object') return 'payload is not an object'
  const entry = REGISTRY_BY_ID[p.source_id]
  if (!entry) return 'unknown source_id'
  if (entry.kind !== 'used') return `${p.source_id} is ${entry.kind}: never ingested`
  if (!['ok', 'error', 'format_changed'].includes(p.result)) return 'result'
  if (p.raws !== undefined && !Array.isArray(p.raws)) return 'raws'
  if (p.notices !== undefined && !Array.isArray(p.notices)) return 'notices'
  return null
}

/** §5.5 → { ok, source_id, accepted, quotes_dropped, removed, notices_current }. `at` is the Worker's now. */
export async function ingestPayload(env, p, at, trigger = p.trigger) {
  const id = p.source_id
  const sample = p.sample === true ? 1 : 0
  const raws = (p.raws ?? []).filter(
    (r) => r && typeof r.raw_ref === 'string' && typeof r.body === 'string' && r.raw_ref.startsWith(`${id}/`) && r.raw_ref.length <= 300,
  )
  const stmts = []
  const prev = await env.DB.prepare('SELECT * FROM source_health WHERE id = ?1').bind(id).first()
  let accepted = 0
  let dropped = 0
  let removed = 0
  const unmapped = Array.isArray(p.unmapped_classes) ? p.unmapped_classes.filter((x) => typeof x === 'string').slice(0, 20) : []

  if (p.result === 'ok' || p.result === 'format_changed') {
    for (const r of raws) {
      stmts.push(
        env.DB.prepare(
          'INSERT OR REPLACE INTO raw_copies (raw_ref, source_id, url, fetched_at, format, body, ingested_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)',
        ).bind(
          r.raw_ref,
          id,
          typeof r.url === 'string' ? r.url : null,
          isIso(r.fetched_at) ? r.fetched_at : null,
          typeof r.format === 'string' ? r.format : null,
          r.body,
          at,
        ),
      )
    }
  }

  let health
  if (p.result === 'ok') {
    const shaped = []
    for (const n of p.notices ?? []) {
      if (noticeShapeError(n, id)) dropped++
      else shaped.push({ ...n, sample: sample === 1 })
    }
    const verified = verifyAndClassify(shaped, raws, SCHOOLS)
    dropped += verified.dropped
    const incoming = new Map(verified.notices.map((n) => [n.id, n]))
    const { results: existing } = await env.DB.prepare(
      'SELECT id, first_seen_at, removed_at FROM notices WHERE source_id = ?1 AND sample = ?2',
    )
      .bind(id, sample)
      .all()
    const existingById = new Map(existing.map((r) => [r.id, r]))
    for (const n of incoming.values()) {
      const first = existingById.get(n.id)?.first_seen_at ?? at
      const full = { ...n, first_seen_at: first, last_seen_at: at, removed_at: null }
      stmts.push(
        env.DB.prepare(`INSERT INTO notices (id, source_id, sample, list_date, status, rank, scope, scope_region, json, first_seen_at, last_seen_at, removed_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, NULL)
        ON CONFLICT(id) DO UPDATE SET list_date = ?4, status = ?5, rank = ?6, scope = ?7, scope_region = ?8, json = ?9, last_seen_at = ?11, removed_at = NULL`).bind(
          full.id,
          id,
          sample,
          full.list_date ?? null,
          full.status,
          rankOf(full.status),
          full.scope,
          full.scope_region ?? null,
          JSON.stringify(full),
          first,
          at,
        ),
      )
      accepted++
    }
    for (const r of existing) {
      if (r.removed_at || incoming.has(r.id)) continue
      stmts.push(
        env.DB.prepare("UPDATE notices SET removed_at = ?1, json = json_set(json, '$.removed_at', ?1) WHERE id = ?2").bind(at, r.id),
      )
      removed++
    }
    // Page-level verbatim fields are re-verified too; the date is re-read from the verified text.
    const list_date_text = typeof p.list_date_text === 'string' && verifyValue(p.list_date_text, raws) ? p.list_date_text : null
    const open_rule_quote =
      id === 'nlschools-status' && p.open_rule_quote === NLS_OPEN_RULE && verifyValue(p.open_rule_quote, raws) ? NLS_OPEN_RULE : null
    health = {
      last_attempt_at: at,
      last_ok_at: at,
      last_result: 'ok',
      last_error: null,
      http_status: Number.isInteger(p.http_status) ? p.http_status : null,
      list_date: list_date_text ? parseListDate(list_date_text) : null,
      list_date_text,
      open_rule_quote,
      rows_skipped: Number.isInteger(p.rows_skipped) ? p.rows_skipped : 0,
      quotes_dropped: dropped,
      unmapped_classes: unmapped,
    }
  } else {
    health = {
      last_attempt_at: at,
      last_ok_at: prev?.last_ok_at ?? null,
      last_result: p.result,
      last_error: String(p.error ?? p.result).slice(0, 200),
      http_status: Number.isInteger(p.http_status) ? p.http_status : null,
      list_date: prev?.list_date ?? null,
      list_date_text: prev?.list_date_text ?? null,
      open_rule_quote: prev?.open_rule_quote ?? null,
      rows_skipped: prev?.rows_skipped ?? 0,
      quotes_dropped: prev?.quotes_dropped ?? 0,
      unmapped_classes: p.result === 'format_changed' ? unmapped : safeJson(prev?.unmapped_classes, []),
    }
  }
  stmts.push(
    env.DB.prepare(`INSERT OR REPLACE INTO source_health (id, last_attempt_at, last_ok_at, last_result, last_error, http_status, list_date, list_date_text, open_rule_quote, rows_skipped, quotes_dropped, unmapped_classes)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`).bind(
      id,
      health.last_attempt_at,
      health.last_ok_at,
      health.last_result,
      health.last_error,
      health.http_status,
      health.list_date,
      health.list_date_text,
      health.open_rule_quote,
      health.rows_skipped,
      health.quotes_dropped,
      JSON.stringify(health.unmapped_classes),
    ),
  )
  const summary = {
    source_id: id,
    result: p.result,
    error: health.last_error,
    sample: !!sample,
    accepted,
    quotes_dropped: dropped,
    removed,
  }
  stmts.push(
    env.DB.prepare('INSERT OR REPLACE INTO scans (id, trigger, started_at, finished_at, summary) VALUES (?1, ?2, ?3, ?4, ?5)').bind(
      `${id}-${at}-${crypto.randomUUID().slice(0, 8)}`,
      ['npm-scan', 'cron', 'admin'].includes(trigger) ? trigger : 'admin',
      isIso(p.started_at) ? p.started_at : at,
      at,
      JSON.stringify(summary),
    ),
  )
  await env.DB.batch(stmts)
  await pruneRaws(env, id)
  const cur = await env.DB.prepare('SELECT COUNT(*) AS n FROM notices WHERE source_id = ?1 AND sample = ?2 AND removed_at IS NULL')
    .bind(id, sample)
    .first()
  return { ok: true, source_id: id, accepted, quotes_dropped: dropped, removed, notices_current: cur?.n ?? 0 }
}

async function pruneRaws(env, sourceId) {
  const { results: raws } = await env.DB.prepare(
    'SELECT raw_ref, ingested_at FROM raw_copies WHERE source_id = ?1 ORDER BY ingested_at DESC',
  )
    .bind(sourceId)
    .all()
  const keepIngests = [...new Set(raws.map((r) => r.ingested_at))].slice(0, RAW_KEEP_INGESTS)
  const { results: cur } = await env.DB.prepare('SELECT json FROM notices WHERE source_id = ?1 AND removed_at IS NULL').bind(sourceId).all()
  const referenced = new Set(cur.flatMap((r) => JSON.parse(r.json).raw_refs ?? []))
  const del = raws.filter((r) => !keepIngests.includes(r.ingested_at) && !referenced.has(r.raw_ref))
  if (del.length) await env.DB.batch(del.map((r) => env.DB.prepare('DELETE FROM raw_copies WHERE raw_ref = ?1').bind(r.raw_ref)))
}

async function readJsonBody(request) {
  const len = Number(request.headers.get('content-length') ?? 0)
  if (len > MAX_INGEST_BYTES) return { error: fail(413, 'too_large', 'Payload too large.') }
  const text = await request.text()
  if (text.length > MAX_INGEST_BYTES) return { error: fail(413, 'too_large', 'Payload too large.') }
  try {
    return { body: JSON.parse(text) }
  } catch {
    return { error: fail(400, 'bad_json', 'Body is not JSON.') }
  }
}

/** The scheduled() code path: runScan for due sources (or forced/only), then ingest every payload. */
export async function scanInWorker(env, { now, only = null, force = false, trigger = 'cron' }) {
  const health = await healthRows(env)
  const scan = await runScan({
    now,
    only,
    force,
    fetchImpl: (u, init) => fetch(u, init),
    originMap: parseOriginMap(env.SOURCE_ORIGIN_MAP ?? ''),
    health,
    trigger,
  })
  const sources = []
  for (const s of scan.sources) {
    if (s.result === 'skipped') {
      sources.push({ source_id: s.source_id, result: 'skipped', skipped_reason: s.skipped_reason })
      continue
    }
    const r = await ingestPayload(env, s, now, trigger)
    sources.push({ source_id: s.source_id, result: s.result, error: s.error, requests: s.requests, notices_found: s.notices.length, ...r })
  }
  return { trigger, now, started_at: scan.started_at, finished_at: new Date().toISOString(), sources }
}

// ---------- router ----------

async function route(request, env) {
  const url = new URL(request.url)
  const path = url.pathname
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })

  if (path.startsWith('/api/admin/')) {
    if (request.method !== 'POST') return fail(405, 'method_not_allowed', 'Use POST.')
    if (!(await authorized(request, env))) return fail(401, 'unauthorized', 'Bearer ADMIN_TOKEN required.')
    if (path === '/api/admin/ingest') {
      const { body, error } = await readJsonBody(request)
      if (error) return error
      const bad = payloadError(body)
      if (bad) return fail(400, 'bad_payload', bad)
      return json(await ingestPayload(env, body, nowFrom(url, env)))
    }
    if (path === '/api/admin/scan') {
      const only = url.searchParams.get('only') || null
      if (only && !USED.some((e) => e.id === only)) return fail(400, 'bad_source', `${only} is not a used source.`)
      return json(await scanInWorker(env, { now: nowFrom(url, env), only, force: url.searchParams.get('force') === '1', trigger: 'admin' }))
    }
    // Tests only: wipe the local database. Exists only while ALLOW_FAKE_NOW=1 (never in a real deployment).
    if (path === '/api/admin/reset' && env.ALLOW_FAKE_NOW === '1') {
      await env.DB.batch(['notices', 'raw_copies', 'source_health', 'scans'].map((t) => env.DB.prepare(`DELETE FROM ${t}`)))
      return json({ ok: true })
    }
    return fail(404, 'not_found', 'No such admin endpoint.')
  }

  if (request.method !== 'GET') return fail(405, 'method_not_allowed', 'Use GET.')
  if (path === '/api/health') return json({ ok: true, now: nowFrom(url, env) })
  if (path === '/api/schools') return handleSchools()
  if (path === '/api/status') return handleStatus(url, env)
  if (path === '/api/today') return handleToday(url, env)
  if (path === '/api/sources') return handleSources(url, env)
  if (path.startsWith('/api/notices/')) return handleNotice(url, env, decodeURIComponent(path.slice('/api/notices/'.length)))
  if (path.startsWith('/api/raw/')) return handleRaw(env, decodeURIComponent(path.slice('/api/raw/'.length)))
  return fail(404, 'not_found', 'No such endpoint.')
}

export default {
  async fetch(request, env) {
    try {
      return await route(request, env)
    } catch (err) {
      console.error(err?.stack ?? err)
      return fail(500, 'internal', 'Something went wrong.')
    }
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(scanInWorker(env, { now: new Date(event.scheduledTime ?? Date.now()).toISOString(), trigger: 'cron' }))
  },
}
