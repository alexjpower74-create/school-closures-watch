// Worker API tests (ALLOW_FAKE_NOW=1 phase). Run through worker/tests/run.mjs.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  get, post, reset, ingestScenario, adminScan, statuses, fixtureScenario, fixtureLog,
  GLOVERTOWN, EASTSIDE, BOREALE, SAINTE_ANNE, PRIVATE, OTHER_CENTRAL, CENTRAL_IDS, WESTERN_IDS, T0, plus, FX, BASE, TOKEN
} from './helpers.mjs'
import { spawnSync } from 'node:child_process'
import { SCHOOLS } from '../../core/schools.js'
import { scenarioPayloads } from './payloads.mjs'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const S = { include_sample: 1 }
const statusOf = (list, id) => list.find(s => s.school.id === id)

beforeEach(reset)

test('today ingest → Glovertown closed exact, Eastside other, another NLSchools school open with as_of', async () => {
  const res = await ingestScenario('today', T0)
  assert.deepEqual(res.map(r => [r.source_id, r.accepted, r.quotes_dropped]), [['nlschools-status', 2, 0], ['nlschools-notices', 0, 0], ['csfp-news', 0, 0]])
  const r = await get('/api/status', { ids: [OTHER_CENTRAL, EASTSIDE, GLOVERTOWN].join(','), now: plus(T0, 1), ...S })
  assert.equal(r.status, 200)
  assert.equal(r.res.headers.get('access-control-allow-origin'), '*')
  assert.equal(r.res.headers.get('cache-control'), 'no-store')
  assert.equal(r.body.today_local, '2026-09-14')
  const [g, e, o] = r.body.schools
  assert.deepEqual([g.school.id, g.status, g.label, g.source_status_text, g.applies.map(a => a.how)], [GLOVERTOWN, 'closed', 'Closed', 'CLOSED ALL DAY', ['exact']])
  const gn = r.body.notices[g.headline_notice_id]
  assert.equal(gn.quote, 'School closed all day NOTE: Water Shut Off')
  assert.deepEqual([gn.first_seen_at, gn.last_seen_at, gn.removed_at, gn.posted_at], [T0, T0, null, null])
  assert.deepEqual([e.school.id, e.status, e.label, e.source_status_text], [EASTSIDE, 'other', 'Other notice, read it', 'OTHER STATUS'])
  assert.deepEqual([o.school.id, o.status, o.as_of, o.stale, o.reason], [OTHER_CENTRAL, 'open', T0, false, null])
  assert.equal(r.body.sources.find(s => s.id === 'nlschools-status').list_date_text, 'Monday, September 14, 2026')
  assert.deepEqual(r.body.stale, [])
})

test('École Boréale unknown csfp_no_online_status; a private school unknown no_official_source; unknown ids listed', async () => {
  await ingestScenario('today', T0)
  const r = await get('/api/status', { ids: `${BOREALE},${PRIVATE},nope-123`, now: plus(T0, 1), ...S })
  const b = statusOf(r.body.schools, BOREALE)
  assert.deepEqual([b.status, b.reason, b.reason_text], ['unknown', 'csfp_no_online_status', "CSFP schools don't post closures online. The school tells families directly."])
  const p = statusOf(r.body.schools, PRIVATE)
  assert.deepEqual([p.status, p.reason, p.as_of], ['unknown', 'no_official_source', null])
  assert.deepEqual(r.body.unknown_ids, ['nope-123'])
  assert.equal((await get('/api/status', { ids: '' })).body.error, 'bad_ids')
  assert.equal((await get('/api/status', { ids: CENTRAL_IDS.slice(0, 31).join(',') })).status, 400)
})

test('SAMPLE whole-Central closure → all 77 Central NLSchools schools closed how region; no Western or CSFP school affected', async () => {
  await ingestScenario('region', T0)
  const now = plus(T0, 1)
  const central = await statuses(CENTRAL_IDS, { now, ...S })
  assert.equal(central.length, 77)
  assert.ok(central.every(s => s.status === 'closed' && s.applies.length && s.applies.every(a => a.how === 'region')), JSON.stringify(central.find(s => s.status !== 'closed')))
  const western = await statuses(WESTERN_IDS, { now, ...S })
  assert.ok(western.every(s => s.status === 'open'), 'a Western school was affected')
  const csfp = await statuses([BOREALE, SAINTE_ANNE], { now, ...S })
  assert.ok(csfp.every(s => s.status === 'unknown' && s.applies.length === 0))
  const today = (await get('/api/today', { now, ...S })).body
  assert.deepEqual(today.region_wide.map(n => [n.source_id, n.scope, n.scope_region]).sort(), [['nlschools-notices', 'region', 'central'], ['nlschools-status', 'region', 'central']])
  const detail = (await get(`/api/notices/${today.region_wide[0].id}`, S)).body
  assert.equal(detail.applies_to.length, 77)
  assert.ok(detail.applies_to.every(a => a.how === 'region' && a.school.region === 'central'))
})

test('SAMPLE ambiguous → Glovertown may_apply (NOT closed)', async () => {
  await ingestScenario('ambiguous', T0)
  const r = await get('/api/status', { ids: GLOVERTOWN, now: plus(T0, 1), ...S })
  const g = r.body.schools[0]
  assert.equal(g.status, 'may_apply')
  assert.notEqual(g.status, 'closed')
  assert.deepEqual(g.applies, [])
  assert.deepEqual(g.may_apply.map(m => [m.reason, m.reason_text]), [['name_similar', 'The notice names a similar school: "SAMPLE Glovertown".']])
  const n = (await get(`/api/notices/${g.may_apply[0].notice_id}`, S)).body
  assert.deepEqual(n.applies_to, [])
  assert.deepEqual(n.may_apply_to.map(m => [m.school.id, m.reason]), [[GLOVERTOWN, 'name_similar']])
})

test('stale (fixture 503) → stale true + stale_text; open schools become unknown stale; Glovertown stays closed with stale true', async () => {
  await fixtureScenario('today')
  assert.equal((await adminScan(T0, { force: 1 })).status, 200)
  await fixtureScenario('stale')
  const s2 = await adminScan(plus(T0, 5), { force: 1 })
  assert.deepEqual(s2.body.sources.map(s => [s.source_id, s.result, s.error]), [['nlschools-status', 'error', 'HTTP 503'], ['nlschools-notices', 'error', 'HTTP 503'], ['csfp-news', 'ok', null]])
  const r = await get('/api/status', { ids: [GLOVERTOWN, OTHER_CENTRAL].join(','), now: plus(T0, 5, 10), ...S })
  const src = r.body.sources.find(s => s.id === 'nlschools-status')
  assert.deepEqual([src.stale, src.stale_reason, src.last_result, src.last_error, src.last_ok_at], [true, 'last_attempt_failed', 'error', 'HTTP 503', T0])
  assert.equal(src.stale_text, "We couldn't reach the NLSchools list at 6:45 AM. Statuses below are from 6:40 AM.")
  assert.ok(r.body.stale.some(x => x.source_id === 'nlschools-status' && x.text === src.stale_text))
  const g = statusOf(r.body.schools, GLOVERTOWN)
  assert.deepEqual([g.status, g.stale], ['closed', true])
  const o = statusOf(r.body.schools, OTHER_CENTRAL)
  assert.deepEqual([o.status, o.reason, o.stale], ['unknown', 'stale', true])
  assert.equal(o.reason_text, "We couldn't check NLSchools since 6:40 AM. Check nlschools.ca or call the school.")
  // an error never removes notices
  assert.equal((await get(`/api/notices/${g.headline_notice_id}`, S)).body.notice.removed_at, null)
})

test('overdue without a failure is stale too (10 minutes after the next scan was due)', async () => {
  await ingestScenario('today', T0)
  const ok = await get('/api/status', { ids: OTHER_CENTRAL, now: plus(T0, 15), ...S })
  assert.equal(ok.body.schools[0].status, 'open')
  const late = await get('/api/status', { ids: OTHER_CENTRAL, now: plus(T0, 15, 1), ...S })
  assert.deepEqual([late.body.schools[0].status, late.body.schools[0].reason], ['unknown', 'stale'])
  assert.equal(late.body.sources.find(s => s.id === 'nlschools-status').stale_reason, 'overdue')
})

test('a second ok scan without a row → removed_at set and it appears in /api/today earlier', async () => {
  await ingestScenario('today', T0)
  const gid = (await get('/api/status', { ids: GLOVERTOWN, now: T0, ...S })).body.schools[0].headline_notice_id
  const second = await ingestScenario('gone', plus(T0, 5))
  assert.deepEqual([second[0].accepted, second[0].removed, second[0].notices_current], [1, 1, 1])
  const d = (await get(`/api/notices/${gid}`, S)).body.notice
  assert.deepEqual([d.removed_at, d.first_seen_at, d.last_seen_at], [plus(T0, 5), T0, T0])
  const today = (await get('/api/today', { now: plus(T0, 6), ...S })).body
  assert.deepEqual(today.regions.map(r => r.region), ['avalon', 'central', 'western', 'labrador'])
  assert.deepEqual(today.unplaced, [])
  assert.equal(today.regions.reduce((n, r) => n + r.notices.length + r.unmatched.length, 0) + today.unplaced.length, today.counts.current)
  const central = today.regions.find(r => r.region === 'central')
  assert.deepEqual(central.earlier.map(n => n.id), [gid])
  assert.deepEqual(central.notices, [])
  const western = today.regions.find(r => r.region === 'western')
  assert.equal(western.notices.length, 1)
  assert.deepEqual([western.notices[0].first_seen_at, western.notices[0].last_seen_at], [T0, plus(T0, 5)])
  assert.deepEqual(western.notices[0].applies_to.map(a => [a.school_id, a.how]), [[EASTSIDE, 'exact']])
  assert.equal((await get('/api/status', { ids: GLOVERTOWN, now: plus(T0, 6), ...S })).body.schools[0].status, 'open')
  // it comes back if listed again
  await ingestScenario('today', plus(T0, 10))
  const back = (await get(`/api/notices/${gid}`, S)).body.notice
  assert.deepEqual([back.removed_at, back.first_seen_at], [null, T0])
})

test('old list date → unknown list_date_old', async () => {
  const tue = '2026-09-15T09:10:00.000Z' // the saved page still says Monday, September 14
  await ingestScenario('today', tue)
  const r = await get('/api/status', { ids: [OTHER_CENTRAL, GLOVERTOWN].join(','), now: plus(tue, 1), ...S })
  const o = statusOf(r.body.schools, OTHER_CENTRAL)
  assert.deepEqual([o.status, o.reason, o.reason_text], ['unknown', 'list_date_old', 'The NLSchools list is still showing Monday, September 14, 2026.'])
  // lead fix 14:55: Monday's closure row no longer makes Glovertown closed on Tuesday
  assert.deepEqual([statusOf(r.body.schools, GLOVERTOWN).status, statusOf(r.body.schools, GLOVERTOWN).reason], ['unknown', 'list_date_old'])
})

test('open rule missing → unknown open_rule_missing; date line missing → list_date_missing', async () => {
  await ingestScenario('norule', T0)
  const a = (await get('/api/status', { ids: OTHER_CENTRAL, now: plus(T0, 1), ...S })).body
  assert.deepEqual([a.schools[0].status, a.schools[0].reason], ['unknown', 'open_rule_missing'])
  assert.equal(a.sources.find(s => s.id === 'nlschools-status').open_rule_quote, null)
  await reset()
  await ingestScenario('nodate', T0)
  const b = (await get('/api/status', { ids: OTHER_CENTRAL, now: plus(T0, 1), ...S })).body
  assert.deepEqual([b.schools[0].status, b.schools[0].reason], ['unknown', 'list_date_missing'])
})

test('tampered quote at ingest → dropped', async () => {
  const tamper = p => p.source_id !== 'nlschools-status' ? p : {
    ...p, notices: p.notices.map(n => n.school_text === 'Glovertown Academy' ? { ...n, quote: 'School open as usual NOTE: Water Shut Off' } : n)
  }
  const [st] = await ingestScenario('today', T0, { tamper })
  assert.deepEqual([st.accepted, st.quotes_dropped, st.notices_current], [1, 1, 1])
  const r = await get('/api/status', { ids: GLOVERTOWN, now: plus(T0, 1), ...S })
  assert.equal(r.body.schools[0].status, 'open')
  assert.equal(r.body.sources.find(s => s.id === 'nlschools-status').quotes_dropped, 1)
})

test('a payload cannot bring its own matches or status: the Worker re-derives them', async () => {
  const tamper = p => p.source_id !== 'nlschools-status' ? p : {
    ...p, notices: p.notices.map(n => ({ ...n, status: 'open', matches: [{ school_id: OTHER_CENTRAL, how: 'exact', reason: null }] }))
  }
  await ingestScenario('ambiguous', T0, { tamper })
  const r = await get('/api/status', { ids: [GLOVERTOWN, OTHER_CENTRAL].join(','), now: plus(T0, 1), ...S })
  assert.equal(statusOf(r.body.schools, GLOVERTOWN).status, 'may_apply')
  assert.equal(statusOf(r.body.schools, OTHER_CENTRAL).status, 'open')
})

test('401 without token (ingest, scan); 400 on a bad payload', async () => {
  const [p] = await scenarioPayloads('today', T0)
  assert.equal((await post('/api/admin/ingest', p, { token: null })).status, 401)
  assert.equal((await post('/api/admin/ingest', p, { token: 'wrong-token' })).status, 401)
  assert.equal((await post('/api/admin/scan', undefined, { token: null })).status, 401)
  assert.equal((await post('/api/admin/reset', undefined, { token: null })).status, 401)
  const bad = await post('/api/admin/ingest', { ...p, source_id: 'nlschools-busplanner' })
  assert.deepEqual([bad.status, bad.body.error], [400, 'bad_payload'])
  assert.equal((await get('/api/status', { ids: GLOVERTOWN, ...S })).body.sources.find(s => s.id === 'nlschools-status').last_result, 'never')
})

test('/api/raw/… returns the saved body; unknown raw → 404', async () => {
  await ingestScenario('today', T0)
  const gid = (await get('/api/status', { ids: GLOVERTOWN, now: T0, ...S })).body.schools[0].headline_notice_id
  const d = (await get(`/api/notices/${gid}`, S)).body
  assert.equal(d.raw_links.length, 2)
  const frag = d.raw_links.find(l => l.raw_ref.endsWith('-schoolstatus.html'))
  assert.match(frag.href, /^\/api\/raw\/nlschools-status\//)
  const raw = await get(frag.href.replace(/^\/api/, '/api'))
  assert.equal(raw.status, 200)
  assert.equal(raw.res.headers.get('content-type'), 'text/plain; charset=utf-8')
  assert.equal(raw.text, readFileSync(ROOT + 'data/samples/nlschools/schoolstatus-2026-09-14T1640Z.html', 'utf8'))
  assert.equal((await get('/api/raw/nlschools-status/nope.html')).status, 404)
})

test('unknown notice → 404', async () => {
  const r = await get('/api/notices/nlschools-status-2026-09-14-0-00000000', S)
  assert.deepEqual([r.status, r.body.error], [404, 'not_found'])
})

test('SAMPLE rows hidden without include_sample=1', async () => {
  await ingestScenario('today', T0)
  const withS = await get('/api/today', { now: plus(T0, 1), ...S })
  assert.equal(withS.body.counts.current, 2)
  const without = await get('/api/today', { now: plus(T0, 1) })
  assert.equal(without.body.counts.current, 0)
  assert.ok(without.body.regions.every(r => r.notices.length === 0))
  const gid = (await get('/api/status', { ids: GLOVERTOWN, now: T0, ...S })).body.schools[0].headline_notice_id
  assert.equal((await get(`/api/notices/${gid}`)).status, 404)
  assert.equal((await get('/api/status', { ids: GLOVERTOWN, now: plus(T0, 1) })).body.schools[0].status, 'open')
})

test('/api/admin/scan (the scheduled() code path) against the fixture origin: polite, due-only unless forced', async () => {
  await fixtureScenario('today')
  const s1 = await adminScan(T0)
  assert.equal(s1.status, 200)
  assert.deepEqual(s1.body.sources.map(s => [s.source_id, s.result, s.notices_current]), [['nlschools-status', 'ok', 2], ['nlschools-notices', 'ok', 0], ['csfp-news', 'ok', 0]])
  let log = await fixtureLog()
  assert.deepEqual(log.hits.map(h => h.path).filter(p => p !== '/feed/'), ['/schools/statusreport.jsp', '/schools/generated/schoolstatus.html', '/about/generated/newspostings_5.html'])
  assert.ok(log.hits.every(h => h.ua === 'APCO-Software-Tools-research/1.0 (+https://apcosoftwaretools.ca)'))
  const at = log.hits.filter(h => h.path !== '/feed/').map(h => h.at)
  assert.ok(at[1] - at[0] >= 1100 && at[2] - at[1] >= 1100, `gaps ${at[1] - at[0]}, ${at[2] - at[1]}`)
  assert.ok(log.hits.every(h => !h.path.startsWith('/__linkonly')))
  // a minute later nothing is due
  const s2 = await adminScan(plus(T0, 1))
  assert.deepEqual(s2.body.sources.map(s => s.result), ['skipped', 'skipped', 'skipped'])
  assert.equal((await fixtureLog()).hits.length, 4)
  // five minutes later the NLSchools sources are due, CSFP (15 min in a busy window) is not
  const s3 = await adminScan(plus(T0, 5))
  assert.deepEqual(s3.body.sources.map(s => s.result), ['ok', 'ok', 'skipped'])
  log = await fixtureLog()
  assert.equal(log.hits.length, 7)
  const st = await get('/api/status', { ids: GLOVERTOWN, now: plus(T0, 5), ...S })
  assert.equal(st.body.schools[0].status, 'closed')
  assert.equal(st.body.sources.find(s => s.id === 'nlschools-status').next_due_at, plus(T0, 10))
})

test('CSFP SAMPLE post → École Boréale may_apply; École Sainte-Anne stays unknown', async () => {
  const now = '2026-09-14T18:00:00.000Z'
  await ingestScenario('csfp', now)
  const r = await get('/api/status', { ids: `${BOREALE},${SAINTE_ANNE}`, now, ...S })
  assert.deepEqual(r.body.schools.map(s => [s.school.id, s.status]), [[BOREALE, 'may_apply'], [SAINTE_ANNE, 'unknown']])
  const today = (await get('/api/today', { now, ...S })).body
  assert.equal(today.csfp.length, 1)
})

test('/api/schools, /api/sources, /api/health, CORS preflight', async () => {
  const s = (await get('/api/schools')).body
  assert.equal(s.count, 269)
  assert.equal(s.schools.length, 269)
  assert.ok(!('source_row' in s.schools[0]))
  const src = (await get('/api/sources')).body
  assert.deepEqual(src.sources.map(x => [x.id, x.kind]).slice(3), [['nlschools-busplanner', 'link_only'], ['nlschools-social', 'link_only'], ['nlschools-weather-protocol', 'link_only'], ['csfp-transport', 'link_only'], ['radio-aggregators', 'not_used']])
  assert.ok(src.sources.filter(x => x.kind !== 'used').every(x => x.stale === false && x.last_result === 'never'))
  assert.ok(src.sources.filter(x => x.kind === 'used').every(x => x.stale === true && x.stale_reason === 'never_checked'))
  assert.equal(src.schools.counts.total, 269)
  assert.equal((await get('/api/health', { now: T0 })).body.now, T0)
  const pre = await fetch(`${process.env.SC_WORKER_URL ?? 'http://127.0.0.1:8202'}/api/status`, { method: 'OPTIONS' })
  assert.equal(pre.status, 204)
  assert.equal((await get('/api/nope')).status, 404)
  assert.ok(FX)
})

test("old list (lead fix 14:55): Monday's rows never set Tuesday's status; /api/today lists them under earlier", async () => {
  await ingestScenario('today', T0) // list for Monday 2026-09-14
  const tue = '2026-09-15T09:30:00.000Z'
  await ingestScenario('today', plus(tue, -1)) // a healthy scan on Tuesday morning still shows Monday's list
  const gid = (await get('/api/status', { ids: GLOVERTOWN, now: T0, ...S })).body.schools[0].headline_notice_id
  const st = (await get('/api/status', { ids: GLOVERTOWN, now: tue, ...S })).body
  const g = st.schools[0]
  assert.notEqual(g.status, 'closed')
  assert.deepEqual([g.status, g.reason, g.applies], ['unknown', 'list_date_old', []])
  const today = (await get('/api/today', { now: tue, ...S })).body
  assert.equal(today.counts.current, 0)
  const central = today.regions.find(r => r.region === 'central')
  assert.deepEqual([central.notices, central.earlier.map(n => n.id)], [[], [gid]])
  assert.equal(today.regions.find(r => r.region === 'western').earlier.length, 1)
})

test('CORS: every GET (errors and raw copies too) carries Access-Control-Allow-Origin: *; preflight allows authorization', async () => {
  await ingestScenario('today', T0)
  const gid = (await get('/api/status', { ids: GLOVERTOWN, now: T0, ...S })).body.schools[0].headline_notice_id
  const detail = (await get(`/api/notices/${gid}`, S)).body
  const raw = detail.raw_links[0].href
  assert.match(raw, /^\/api\/raw\//) // relative: the app prefixes the API origin
  const cases = [
    ['/api/health', {}, 200], ['/api/schools', {}, 200], ['/api/status', { ids: GLOVERTOWN, ...S }, 200], ['/api/status', { ids: '' }, 400],
    ['/api/today', S, 200], ['/api/sources', {}, 200], [`/api/notices/${gid}`, S, 200], ['/api/notices/nope', {}, 404], [raw, {}, 200],
    ['/api/raw/nlschools-status/nope.html', {}, 404], ['/api/nope', {}, 404]
  ]
  for (const [path, params, code] of cases) {
    const r = await get(path, params)
    assert.equal(r.status, code, path)
    assert.equal(r.res.headers.get('access-control-allow-origin'), '*', path)
    assert.equal(r.res.headers.get('cache-control'), 'no-store', path)
  }
  const pre = await fetch(`${BASE}/api/admin/ingest`, { method: 'OPTIONS', headers: { Origin: 'http://127.0.0.1:8201', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization, content-type' } })
  assert.equal(pre.status, 204)
  assert.equal(pre.headers.get('access-control-allow-origin'), '*')
  assert.match(pre.headers.get('access-control-allow-headers'), /authorization/)
})

test('storm seed (seed.mjs): /api/status notices map is complete; /api/today applies_to has may_apply with reason; sources fields', async () => {
  const seed = spawnSync(process.execPath, [ROOT + 'worker/tests/seed.mjs', '--url', BASE, '--token', TOKEN, '--scenario', 'storm', '--now', T0, '--reset'], { encoding: 'utf8' })
  assert.equal(seed.status, 0, seed.stderr + seed.stdout)
  const idOf = name => SCHOOLS.find(s => s.name === name).id
  const ids = [GLOVERTOWN, idOf("Bay d'Espoir Academy"), idOf('Bishop White School'), idOf("St. Mark's School"), OTHER_CENTRAL, EASTSIDE, BOREALE]
  const r = (await get('/api/status', { ids: ids.join(','), now: plus(T0, 1), ...S })).body
  let referenced = 0
  for (const s of r.schools) {
    for (const x of [...s.applies, ...s.may_apply]) {
      assert.ok(r.notices[x.notice_id], `${s.school.name}: notice ${x.notice_id} missing from notices`)
      assert.equal(r.notices[x.notice_id].id, x.notice_id)
      referenced++
    }
    if (s.headline_notice_id) assert.ok(r.notices[s.headline_notice_id])
  }
  for (const n of r.district_notices) assert.ok(r.notices[n.id])
  // Glovertown region + may_apply (2), Bay d'Espoir / Bishop White / St. Mark's exact + region (6), another Central school region (1)
  assert.equal(referenced, 9)
  const g = statusOf(r.schools, GLOVERTOWN)
  assert.deepEqual([g.status, g.may_apply.map(m => m.reason), g.applies.map(a => a.how)], ['closed', ['name_similar'], ['region']])
  assert.equal(statusOf(r.schools, EASTSIDE).unmatched_in_region, 1)
  assert.equal(statusOf(r.schools, BOREALE).unmatched_in_region, 0)
  for (const src of r.sources) for (const k of ['id', 'name', 'kind', 'human_url', 'stale', 'stale_text']) assert.ok(k in src, `sources[].${k}`)
  const today = (await get('/api/today', { now: plus(T0, 1), ...S })).body
  const central = today.regions.find(x => x.region === 'central')
  const amb = central.notices.find(n => n.school_text === 'SAMPLE Glovertown')
  assert.deepEqual(amb.applies_to.map(a => [a.school_id, a.how, a.reason]), [[GLOVERTOWN, 'may_apply', 'name_similar']])
  const exact = central.notices.find(n => n.school_text === 'Bishop White School')
  assert.deepEqual(exact.applies_to.map(a => [a.how, a.reason]), [['exact', null]])
  const placed = today.regions.reduce((n, x) => n + x.notices.length + x.unmatched.length, 0)
  assert.equal(placed + today.district.length + today.region_wide.length + today.csfp.length + today.unplaced.length, today.counts.current)
})

test('cron: scheduled() runs a scan (wrangler --test-scheduled)', async () => {
  await fixtureScenario('today')
  const r = await fetch(`${process.env.SC_WORKER_URL ?? 'http://127.0.0.1:8202'}/__scheduled?cron=*/5+*+*+*+*`)
  assert.equal(r.status, 200)
  let src
  for (let i = 0; i < 40; i++) { // scheduled() finishes in the background (≥ 2.2 s of polite gaps)
    src = (await get('/api/sources')).body.sources.find(s => s.id === 'nlschools-status')
    if (src.last_result === 'ok') break
    await new Promise(res => setTimeout(res, 250))
  }
  assert.equal(src.last_result, 'ok')
  assert.equal(src.notices_current, 0) // replayed rows are sample (origin mapped), hidden without include_sample
  const withS = (await get('/api/sources', S)).body.sources.find(s => s.id === 'nlschools-status')
  assert.equal(withS.notices_current, 2)
})
