import { test } from 'node:test'
import assert from 'node:assert/strict'
import { schoolStatus, indexNotices, sortStatuses } from '../status.js'
import { classifyNotice } from '../notice.js'
import { SCHOOLS, schoolsInRegion } from '../schools.js'
import { MON_0640, healthyNls } from './helpers.mjs'

const byName = name => SCHOOLS.find(s => s.name === name)
const GLOVERTOWN = byName('Glovertown Academy')
const EASTSIDE = byName('Eastside Elementary')
const OTHER_CENTRAL = schoolsInRegion('central').find(s => s.id !== GLOVERTOWN.id)
const BOREALE = byName('École Boréale')
const SAINTE_ANNE = byName('École Sainte-Anne')
const PRIVATE = SCHOOLS.find(s => s.board === 'Private')
const NOW = MON_0640

let seq = 0
const row = (school_text, community_text, status_class, patch = {}) => classifyNotice({
  id: `n${++seq}`, source_id: 'nlschools-status', kind: 'school_row', row_id: String(seq), list_date: '2026-09-14',
  school_text, community_text, region_text: 'CENTRAL', status_class, status_text: 'SAMPLE STATUS', quote: 'SAMPLE note',
  source_text: 'SAMPLE row', first_seen_at: NOW, removed_at: null, ...patch
}, SCHOOLS).notice
const text = (quote, patch = {}) => classifyNotice({ id: `t${++seq}`, source_id: 'nlschools-notices', kind: 'text_notice', row_id: String(seq), quote, source_text: quote, removed_at: null, ...patch }, SCHOOLS).notice
const feed = (source_text) => classifyNotice({ id: `f${++seq}`, source_id: 'csfp-news', kind: 'feed_post', row_id: String(seq), quote: source_text, source_text, removed_at: null }, SCHOOLS).notice

const st = (school, notices, health = healthyNls(NOW), now = NOW) => schoolStatus(school, indexNotices(notices), health, now)

const glovClosed = () => row('Glovertown Academy', 'Glovertown, NL', 'closedAllDay', { status_text: 'CLOSED ALL DAY' })

test('exact row applies: Glovertown closed, with source STATUS text and headline', () => {
  const n = glovClosed()
  const s = st(GLOVERTOWN, [n])
  assert.equal(s.status, 'closed')
  assert.equal(s.label, 'Closed')
  assert.equal(s.rank, 1)
  assert.equal(s.source_status_text, 'CLOSED ALL DAY')
  assert.equal(s.headline_notice_id, n.id)
  assert.deepEqual(s.applies, [{ notice_id: n.id, how: 'exact' }])
  assert.equal(s.stale, false)
  assert.equal(s.as_of, NOW)
  assert.equal(s.list_date_text, 'Monday, September 14, 2026')
})

test('open only with a healthy, current list and the open rule', () => {
  const s = st(OTHER_CENTRAL, [glovClosed()])
  assert.equal(s.status, 'open')
  assert.equal(s.label, 'Open, no notice')
  assert.equal(s.as_of, NOW)
  assert.equal(s.reason, null)
  assert.equal(s.source_status_text, null)
})

test('unknown reasons: list_date_old, list_date_missing, open_rule_missing', () => {
  const old = st(OTHER_CENTRAL, [], healthyNls(NOW, { list_date: '2026-09-11', list_date_text: 'Friday, September 11, 2026' }))
  assert.deepEqual([old.status, old.reason, old.reason_text], ['unknown', 'list_date_old', 'The NLSchools list is still showing Friday, September 11, 2026.'])
  // a list for tomorrow (after 6 PM) is fine
  assert.equal(st(OTHER_CENTRAL, [], healthyNls(NOW, { list_date: '2026-09-15' })).status, 'open')
  const missing = st(OTHER_CENTRAL, [], healthyNls(NOW, { list_date: null, list_date_text: null }))
  assert.deepEqual([missing.status, missing.reason, missing.reason_text], ['unknown', 'list_date_missing', "We couldn't read which day the NLSchools list is for."])
  const rule = st(OTHER_CENTRAL, [], healthyNls(NOW, { open_rule_quote: null }))
  assert.deepEqual([rule.status, rule.reason, rule.reason_text], ['unknown', 'open_rule_missing', "The NLSchools page no longer says unlisted schools are open, so we can't say this school is open."])
})

test('stale: applying notices keep their status with stale true; everything else unknown "stale"', () => {
  const ok = '2026-09-14T09:05:00.000Z'
  const failed = healthyNls(NOW, { last_attempt_at: NOW, last_ok_at: ok, last_result: 'error' })
  const g = st(GLOVERTOWN, [glovClosed()], failed)
  assert.deepEqual([g.status, g.stale], ['closed', true])
  const o = st(OTHER_CENTRAL, [glovClosed()], failed)
  assert.deepEqual([o.status, o.reason, o.stale, o.as_of], ['unknown', 'stale', true, ok])
  assert.equal(o.reason_text, "We couldn't check NLSchools since 6:35 AM. Check nlschools.ca or call the school.")
  // overdue with no failure
  const late = st(OTHER_CENTRAL, [], healthyNls(ok), '2026-09-14T09:30:01.000Z')
  assert.deepEqual([late.status, late.reason], ['unknown', 'stale'])
  // never checked
  const never = st(OTHER_CENTRAL, [], {})
  assert.deepEqual([never.status, never.reason, never.as_of], ['unknown', 'stale', null])
  // may_apply is not shown as the status while stale, but the list is kept
  const amb = row('SAMPLE Glovertown', 'Gander, NL', 'closedAllDay')
  const gs = st(GLOVERTOWN, [amb], failed)
  assert.deepEqual([gs.status, gs.may_apply.length], ['unknown', 1])
})

test('may_apply: ambiguous row is NOT applied', () => {
  const amb = row('SAMPLE Glovertown', 'Gander, NL', 'closedAllDay')
  const s = st(GLOVERTOWN, [amb])
  assert.equal(s.status, 'may_apply')
  assert.equal(s.label, 'A notice may apply')
  assert.deepEqual(s.applies, [])
  assert.deepEqual(s.may_apply, [{ notice_id: amb.id, reason: 'name_similar', reason_text: 'The notice names a similar school: "SAMPLE Glovertown".' }])
  assert.equal(s.headline_notice_id, amb.id)
  const diff = row('Glovertown Academy', 'Gander, NL', 'closedAllDay')
  assert.equal(st(GLOVERTOWN, [diff]).may_apply[0].reason_text, 'The notice names this school but a different community: "Gander, NL".')
})

test("old lists never set today's status (lead fix 14:55): a 2026-09-11 closed exact notice on Monday 07:00 → open", () => {
  const now = '2026-09-14T09:30:00.000Z' // Monday 2026-09-14 07:00 NDT
  const h = healthyNls(now) // today's list, open rule present
  const oldClosed = row('Glovertown Academy', 'Glovertown, NL', 'closedAllDay', { status_text: 'CLOSED ALL DAY', list_date: '2026-09-11' })
  const s = st(GLOVERTOWN, [oldClosed], h, now)
  assert.deepEqual([s.status, s.applies, s.headline_notice_id, s.source_status_text], ['open', [], null, null])
  const oldAmb = row('SAMPLE Glovertown', 'Gander, NL', 'closedAllDay', { list_date: '2026-09-11' })
  const a = st(GLOVERTOWN, [oldAmb], h, now)
  assert.deepEqual([a.status, a.may_apply], ['open', []])
  const oldRegion = row('SAMPLE All Central Region Schools', null, 'closedAllDay', { list_date: '2026-09-11' })
  assert.equal(st(OTHER_CENTRAL, [oldRegion], h, now).status, 'open')
  const oldUn = row('SAMPLE Nowhere Harbour School', 'Nowhere, NL', 'closedAllDay', { list_date: '2026-09-11' })
  assert.equal(st(OTHER_CENTRAL, [oldUn], h, now).unmatched_in_region, 0)
  // today's list still applies, and list_date null (important notices, feed posts) is never "old"
  assert.equal(st(GLOVERTOWN, [glovClosed()], h, now).status, 'closed')
  assert.equal(st(OTHER_CENTRAL, [text('SAMPLE All schools in the Central region are closed for the day', { list_date: null })], h, now).status, 'closed')
})

test('may_apply reason text when the row gives no community (lead 15:10)', () => {
  const n = row('Glovertown Academy', null, 'closedAllDay')
  assert.equal(st(GLOVERTOWN, [n]).may_apply[0].reason_text, "The notice names this school but doesn't say which community.")
})

test('region-wide: every Central NLSchools school, no Western, no CSFP', () => {
  const r = row('SAMPLE All Central Region Schools', null, 'closedAllDay', { status_text: 'CLOSED ALL DAY' })
  const idx = indexNotices([r])
  const central = schoolsInRegion('central').map(s => schoolStatus(s, idx, healthyNls(NOW), NOW))
  assert.equal(central.length, 77)
  assert.ok(central.every(s => s.status === 'closed' && s.applies[0].how === 'region'))
  assert.equal(schoolStatus(EASTSIDE, idx, healthyNls(NOW), NOW).status, 'open')
  assert.equal(schoolStatus(SAINTE_ANNE, idx, healthyNls(NOW), NOW).status, 'unknown')
  const tn = text('SAMPLE All schools in the Central region are closed for the day')
  assert.equal(st(OTHER_CENTRAL, [tn]).applies[0].how, 'region')
  assert.equal(st(OTHER_CENTRAL, [tn]).source_status_text, null)
})

test('province notice applies to every NLSchools school; district notice to none', () => {
  const p = text('SAMPLE All schools in the province will open late')
  assert.deepEqual([st(EASTSIDE, [p]).status, st(EASTSIDE, [p]).applies[0].how], ['delayed', 'province'])
  assert.equal(st(BOREALE, [p]).status, 'unknown')
  assert.equal(st(EASTSIDE, [text('SAMPLE Parent night moved')]).status, 'open')
})

test('worst applying notice wins; removed notices are ignored', () => {
  const delayed = row('Glovertown Academy', 'Glovertown, NL', 'delayedOpening', { status_text: 'DELAYED OPENING' })
  const region = text('SAMPLE All schools in the Central region are closed for the day')
  const s = st(GLOVERTOWN, [delayed, region])
  assert.equal(s.status, 'closed')
  assert.deepEqual(s.applies.map(a => a.how), ['region', 'exact'])
  assert.equal(st(GLOVERTOWN, [{ ...glovClosed(), removed_at: NOW }]).status, 'open')
})

test('CSFP: unknown csfp_no_online_status, may_apply from the feed; private: no_official_source', () => {
  const b = st(BOREALE, [])
  assert.deepEqual([b.status, b.reason, b.reason_text], ['unknown', 'csfp_no_online_status', "CSFP schools don't post closures online. The school tells families directly."])
  assert.equal(b.as_of, NOW)
  const post = feed("SAMPLE École Boréale fermée aujourd'hui en raison de la tempête")
  const bm = st(BOREALE, [post])
  assert.deepEqual([bm.status, bm.may_apply[0].reason_text], ['may_apply', 'A CSFP news post mentions this school.'])
  assert.equal(st(SAINTE_ANNE, [post]).status, 'unknown')
  const p = st(PRIVATE, [glovClosed()])
  assert.deepEqual([p.status, p.reason, p.reason_text, p.as_of], ['unknown', 'no_official_source', 'This school has no official online closure list. Call the school.', null])
})

test('unmatched_in_region counts unmatched rows by region; sorting is rank then name', () => {
  const un = row('SAMPLE Nowhere Harbour School', 'Nowhere, NL', 'closedAllDay')
  assert.equal(st(OTHER_CENTRAL, [un]).unmatched_in_region, 1)
  assert.equal(st(EASTSIDE, [un]).unmatched_in_region, 0)
  // NLSchools schools only (lead 15:10): a Western unmatched row counts for Eastside, not for École Sainte-Anne
  const west = row('SAMPLE Nowhere Harbour School', 'Nowhere, NL', 'closedAllDay', { region_text: 'WESTERN' })
  assert.equal(st(EASTSIDE, [west]).unmatched_in_region, 1)
  assert.equal(st(SAINTE_ANNE, [west]).unmatched_in_region, 0)
  assert.equal(st(PRIVATE, [west]).unmatched_in_region, 0)
  const list = sortStatuses([st(PRIVATE, []), st(EASTSIDE, []), st(GLOVERTOWN, [glovClosed()]), st(BOREALE, [])])
  assert.deepEqual(list.map(s => s.status), ['closed', 'unknown', 'unknown', 'open'])
  assert.equal(list[1].school.name.localeCompare(list[2].school.name, 'en') < 0, true)
})
