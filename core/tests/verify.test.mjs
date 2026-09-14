import { test } from 'node:test'
import assert from 'node:assert/strict'
import { verifyNotice, verifyValue, noticeShapeError } from '../verify.js'
import { sample } from './helpers.mjs'

const raws = [
  { raw_ref: 'nlschools-status/page.html', body: sample('nlschools/statusreport-2026-09-14T1408NDT.html') },
  { raw_ref: 'nlschools-status/frag.html', body: sample('nlschools/schoolstatus-2026-09-14T1640Z.html') },
  { raw_ref: 'other/elsewhere.html', body: '<p>SAMPLE School closed all day NOTE: Water Shut Off elsewhere</p>' }
]

const glovertown = () => ({
  id: 'nlschools-status-2026-09-14-468-00000000', source_id: 'nlschools-status', sample: false, kind: 'school_row',
  list_date: '2026-09-14', list_date_text: 'Monday, September 14, 2026', row_id: '468',
  school_text: 'Glovertown Academy', community_text: 'Glovertown, NL', family_text: 'FOS 05', region_text: 'CENTRAL',
  status_class: 'closedAllDay', status_text: 'CLOSED ALL DAY', status: 'closed', status_basis: 'class', status_evidence: 'closedAllDay',
  title: null, quote: 'School closed all day NOTE: Water Shut Off',
  source_text: 'Glovertown Academy Glovertown, NL CLOSED ALL DAY School closed all day NOTE: Water Shut Off FOS 05 CENTRAL',
  posted_at: null, posted_text: null, scope: 'school', scope_region: null, scope_evidence: null, unmatched_reason: null,
  matches: [], link: 'https://www.nlschools.ca/schools/statusreport.jsp',
  raw_refs: ['nlschools-status/page.html', 'nlschools-status/frag.html']
})

test('a real row verifies unchanged', () => {
  const v = verifyNotice(glovertown(), raws)
  assert.equal(v.reason, null)
  assert.deepEqual(v.notice, glovertown())
  assert.deepEqual(v.nulled, [])
})

test('whitespace differences do not matter; one-character values never verify', () => {
  assert.equal(verifyNotice({ ...glovertown(), quote: '  School closed   all day\nNOTE: Water Shut Off ' }, raws).reason, null)
  assert.equal(verifyValue('W', raws), false)
})

test('drops: tampered quote, source_text, quote outside source_text, school_text, foreign raw', () => {
  const r = patch => verifyNotice({ ...glovertown(), ...patch }, raws)
  assert.deepEqual(r({ quote: 'School closed all day NOTE: Gas Leak' }), { notice: null, reason: 'quote', nulled: [] })
  assert.equal(r({ source_text: glovertown().source_text + ' SAMPLE extra' }).reason, 'source_text')
  // in the raw, but from Eastside's row: not inside this notice's source_text
  assert.equal(r({ quote: 'Due to a water main break' }).reason, 'quote_not_in_source_text')
  assert.equal(r({ school_text: 'Glovertown Academy Annex' }).reason, 'school_text')
  // only the notice's own raw_refs count
  assert.equal(r({ raw_refs: ['other/elsewhere.html'] }).reason, 'source_text')
  assert.equal(r({ raw_refs: ['nope'] }).reason, 'no_raw')
})

test('other verbatim fields that fail become null (with dependants)', () => {
  const v = verifyNotice({ ...glovertown(), family_text: 'FOS 99', list_date_text: 'Tuesday, September 15, 2026', posted_text: 'SAMPLE 6:00 AM', posted_at: '2026-09-14T09:30:00Z' }, raws)
  assert.equal(v.notice.family_text, null)
  assert.equal(v.notice.list_date_text, null)
  assert.equal(v.notice.list_date, null)
  assert.equal(v.notice.posted_text, null)
  assert.equal(v.notice.posted_at, null)
  assert.deepEqual(v.nulled, ['family_text', 'posted_text', 'list_date_text'])
})

test('text notices: failed scope_evidence → district; failed phrase evidence → other', () => {
  const body = '<div>SAMPLE All schools in the Central region are closed for the day</div>'
  const tr = [{ raw_ref: 'nlschools-notices/n.html', body }]
  const n = {
    id: 'x', source_id: 'nlschools-notices', kind: 'text_notice', row_id: 'x', quote: 'SAMPLE All schools in the Central region are closed for the day',
    source_text: 'SAMPLE All schools in the Central region are closed for the day', status: 'closed', status_basis: 'phrase',
    status_evidence: 'closed for the day', scope: 'region', scope_region: 'central', scope_evidence: 'All schools in the Central region', raw_refs: ['nlschools-notices/n.html']
  }
  assert.deepEqual(verifyNotice(n, tr).nulled, [])
  const bad = verifyNotice({ ...n, scope_evidence: 'All schools in the Western region', status_evidence: 'closed all day' }, tr).notice
  assert.deepEqual([bad.scope, bad.scope_region, bad.scope_evidence], ['district', null, null])
  assert.deepEqual([bad.status, bad.status_basis, bad.status_evidence], ['other', 'none', null])
})

test('noticeShapeError', () => {
  assert.equal(noticeShapeError(glovertown(), 'nlschools-status'), null)
  assert.equal(noticeShapeError(glovertown(), 'csfp-news'), 'source_id')
  assert.equal(noticeShapeError({ ...glovertown(), kind: 'tweet' }, 'nlschools-status'), 'kind')
  assert.equal(noticeShapeError({ ...glovertown(), raw_refs: [] }, 'nlschools-status'), 'raw_refs')
})
