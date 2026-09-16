import { test } from 'node:test'
import assert from 'node:assert/strict'
import { REGISTRY, REGISTRY_BY_ID, NLS_OPEN_RULE, CSFP_RULE, planFor } from '../sources/registry.js'
import nlsStatus from '../sources/nlschools-status.js'
import nlsNotices from '../sources/nlschools-notices.js'
import csfpNews from '../sources/csfp-news.js'
import { extractText, fnv1a8 } from '../text.js'
import { verifyNotice } from '../verify.js'
import { SCHOOLS } from '../schools.js'
import { sample, fixture } from './helpers.mjs'

const NOW = '2026-09-14T16:40:05.000Z'
const idOf = (name) => SCHOOLS.find((s) => s.name === name).id
const PAGE = sample('nlschools/statusreport-2026-09-14T1408NDT.html')

const rawsFor = (adapter, bodies) =>
  adapter
    .fetchPlan(NOW)
    .map((p, i) => ({
      ...p,
      raw_ref: `${adapter.id}/2026-09-14T16-40-05-000Z-${p.name}.${p.format}`,
      fetched_at: NOW,
      body: bodies[i],
    }))
    .filter((r) => r.body !== undefined)

const ctx = (patch = {}) => ({ now: NOW, schools: SCHOOLS, ...patch })

/** Every notice an adapter returns must verify against its own raws. */
function assertAllVerify(res, raws) {
  for (const n of res.notices) {
    const v = verifyNotice(n, raws)
    assert.equal(v.reason, null, `${n.id} failed verification: ${v.reason}`)
    assert.deepEqual(v.nulled, [], `${n.id} nulled ${v.nulled}`)
  }
}

test('registry: §2 ids, kinds and fetch order; link-only and not-used have nothing to fetch', () => {
  assert.deepEqual(
    REGISTRY.map((e) => [e.id, e.kind]),
    [
      ['nlschools-status', 'used'],
      ['nlschools-notices', 'used'],
      ['csfp-news', 'used'],
      ['nlschools-busplanner', 'link_only'],
      ['nlschools-social', 'link_only'],
      ['nlschools-weather-protocol', 'link_only'],
      ['csfp-transport', 'link_only'],
      ['radio-aggregators', 'not_used'],
    ],
  )
  assert.deepEqual(
    planFor(REGISTRY_BY_ID['nlschools-status']).map((p) => p.url),
    ['https://www.nlschools.ca/schools/statusreport.jsp', 'https://www.nlschools.ca/schools/generated/schoolstatus.html'],
  )
  for (const e of REGISTRY.filter((x) => x.kind !== 'used')) assert.deepEqual(planFor(e), [], e.id)
  assert.equal(REGISTRY_BY_ID['csfp-news'].terms_quote, null)
  assert.equal(REGISTRY_BY_ID['nlschools-notices'].terms_quote, REGISTRY_BY_ID['nlschools-status'].terms_quote)
})

test('NLS_OPEN_RULE, CSFP_RULE and the NLSchools terms quote are exact substrings of their saved files', () => {
  assert.ok(extractText(PAGE).includes(NLS_OPEN_RULE))
  assert.ok(extractText(sample('csfp/transport-scolaire-2026-09-14.html')).includes(CSFP_RULE))
  assert.ok(extractText(sample('nlschools/termsofuse-2026-09-14.html')).includes(REGISTRY_BY_ID['nlschools-status'].terms_quote))
})

test('real 2026-09-14: two rows, list date, open rule, Glovertown closed exact, Eastside other exact', () => {
  const raws = rawsFor(nlsStatus, [PAGE, sample('nlschools/schoolstatus-2026-09-14T1640Z.html')])
  const res = nlsStatus.parse(raws, ctx())
  assert.equal(res.result, 'ok')
  assert.equal(res.list_date, '2026-09-14')
  assert.equal(res.list_date_text, 'Monday, September 14, 2026')
  assert.equal(res.open_rule_quote, NLS_OPEN_RULE)
  assert.equal(res.notices.length, 2)
  assert.equal(res.rows_skipped, 0)
  assert.deepEqual(res.unmapped_classes, [])
  const g = res.notices.find((n) => n.school_text === 'Glovertown Academy')
  assert.deepEqual(
    [g.row_id, g.community_text, g.status_class, g.status_text, g.status, g.quote, g.family_text, g.region_text, g.scope, g.kind, g.link],
    [
      '468',
      'Glovertown, NL',
      'closedAllDay',
      'CLOSED ALL DAY',
      'closed',
      'School closed all day NOTE: Water Shut Off',
      'FOS 05',
      'CENTRAL',
      'school',
      'school_row',
      'https://www.nlschools.ca/schools/statusreport.jsp',
    ],
  )
  assert.deepEqual(g.matches, [{ school_id: idOf('Glovertown Academy'), how: 'exact', reason: null }])
  assert.equal(g.source_text, 'Glovertown Academy Glovertown, NL CLOSED ALL DAY School closed all day NOTE: Water Shut Off FOS 05 CENTRAL')
  assert.deepEqual(
    g.raw_refs,
    raws.map((r) => r.raw_ref),
  )
  assert.equal(g.id, `nlschools-status-2026-09-14-468-${fnv1a8('closedAllDay|CLOSED ALL DAY|School closed all day NOTE: Water Shut Off')}`)
  const e = res.notices.find((n) => n.school_text === 'Eastside Elementary')
  assert.deepEqual(
    [e.community_text, e.status_class, e.status_text, e.status, e.status_basis],
    ['Corner Brook, NL', 'otherStatus', 'OTHER STATUS', 'other', 'class'],
  )
  assert.ok(e.quote.startsWith('Other NOTE: Due to a water main break at the bottom of Massey Dr'))
  assert.notEqual(e.status, 'buses_delayed')
  assert.deepEqual(e.matches, [{ school_id: idOf('Eastside Elementary'), how: 'exact', reason: null }])
  assertAllVerify(res, raws)
})

test("wayback 2024-01-10: Bay d'Espoir closed_part; Bishop White and St. Mark's delayed; all exact", () => {
  const raws = rawsFor(nlsStatus, [undefined, sample('wayback/schoolstatus-20240110005921.html')])
  // No page in the archive: only list_date is supplied (a list_date_text would be unverifiable and nulled).
  const res = nlsStatus.parse(raws, ctx({ list_date: '2024-01-10' }))
  assert.equal(res.result, 'ok')
  assert.deepEqual(
    res.notices.map((n) => [n.school_text, n.community_text, n.status_class, n.status, n.matches[0].school_id, n.matches[0].how]),
    [
      ["Bay d'Espoir Academy", "St. Alban's, NL", 'closedForMorning', 'closed_part', idOf("Bay d'Espoir Academy"), 'exact'],
      ['Bishop White School', 'Port Rexton, NL', 'delayedOpening', 'delayed', idOf('Bishop White School'), 'exact'],
      ["St. Mark's School", "King's Cove, NL", 'delayedOpening', 'delayed', idOf("St. Mark's School"), 'exact'],
    ],
  )
  assert.ok(res.notices.every((n) => n.id.startsWith('nlschools-status-2024-01-10-')))
  assertAllVerify(res, raws)
})

test('wayback 2024-01-17: Eastside Elementary closedForPD → closed; 2025-07-31: Upper Gullies closingEarly → early_dismissal', () => {
  const pd = nlsStatus.parse(
    rawsFor(nlsStatus, [undefined, sample('wayback/schoolstatus-20240117055404.html')]),
    ctx({ list_date: '2024-01-17' }),
  )
  assert.deepEqual(
    pd.notices.map((n) => [n.school_text, n.status_class, n.status, n.matches[0].how]),
    [['Eastside Elementary', 'closedForPD', 'closed', 'exact']],
  )
  assert.equal(pd.notices[0].quote, 'School closed all day for teacher PD')
  const early = nlsStatus.parse(
    rawsFor(nlsStatus, [undefined, sample('wayback/schoolstatus-20250731230821.html')]),
    ctx({ list_date: '2025-07-31' }),
  )
  assert.deepEqual(
    early.notices.map((n) => [n.school_text, n.community_text, n.status, n.matches[0].school_id, n.matches[0].how]),
    [['Upper Gullies Elementary', 'Conception Bay South, NL', 'early_dismissal', idOf('Upper Gullies Elementary'), 'exact']],
  )
})

test('SAMPLE storm fragment: region row, ambiguous, same name other community, unmatched, unmapped class, skipped row', () => {
  const raws = rawsFor(nlsStatus, [PAGE, fixture('nlschools/schoolstatus-sample-storm.html')])
  const res = nlsStatus.parse(raws, ctx({ sample: true }))
  assert.equal(res.result, 'ok')
  assert.equal(res.rows_skipped, 1)
  assert.deepEqual(res.unmapped_classes, ['snowDay'])
  const by = (id) => res.notices.find((n) => n.row_id === id)
  const region = by('9001')
  assert.deepEqual(
    [region.status, region.scope, region.scope_region, region.scope_evidence, region.community_text, region.matches],
    ['closed', 'region', 'central', 'All Central Region Schools', null, []],
  )
  assert.deepEqual(by('9002').matches, [{ school_id: idOf('Glovertown Academy'), how: 'may_apply', reason: 'name_similar' }])
  assert.equal(by('9002').scope, 'school')
  assert.deepEqual(by('9003').matches, [{ school_id: idOf('Glovertown Academy'), how: 'may_apply', reason: 'name_same_community_differs' }])
  assert.deepEqual([by('9004').scope, by('9004').unmatched_reason, by('9004').matches], ['unmatched', 'no_school', []])
  assert.deepEqual([by('9005').status, by('9005').status_basis, by('9005').matches[0].how], ['other', 'none', 'exact'])
  assert.ok(res.notices.every((n) => n.sample === true))
  assertAllVerify(res, raws)
})

test('fragment without the table → format_changed, 0 notices', () => {
  const res = nlsStatus.parse(rawsFor(nlsStatus, [PAGE, fixture('nlschools/fragment-no-table.html')]), ctx())
  assert.deepEqual([res.result, res.error, res.notices.length], ['format_changed', 'table not found', 0])
  assert.equal(res.open_rule_quote, NLS_OPEN_RULE) // the page itself was still read
})

test('page without the date line → list_date null (still ok); page without the open rule → open_rule_quote null', () => {
  const frag = sample('nlschools/schoolstatus-2026-09-14T1640Z.html')
  const noDate = PAGE.replace('Real-time school closure information for:', 'SAMPLE School closure information')
  assert.notEqual(noDate, PAGE)
  const a = nlsStatus.parse(rawsFor(nlsStatus, [noDate, frag]), ctx())
  assert.deepEqual([a.result, a.list_date, a.list_date_text, a.notices.length], ['ok', null, null, 2])
  assert.ok(a.notices.every((n) => n.list_date === null && n.id.startsWith('nlschools-status-2026-09-14-')))
  const noRule = PAGE.replace('If your school is not listed below, the status is normal and open as usual.', '')
  assert.notEqual(noRule, PAGE)
  const b = nlsStatus.parse(rawsFor(nlsStatus, [noRule, frag]), ctx())
  assert.deepEqual([b.result, b.open_rule_quote, b.list_date], ['ok', null, '2026-09-14'])
})

test('important notices: the three real empty files → 0 notices', () => {
  for (const f of ['nlschools/newspostings_5-2026-09-14-empty.html', 'wayback/np5-20230516.html', 'wayback/np5-20240110.html']) {
    const res = nlsNotices.parse(rawsFor(nlsNotices, [sample(f)]), ctx())
    assert.deepEqual([res.result, res.notices.length], ['ok', 0], f)
  }
})

test('important notices: SAMPLE text notice naming the whole Central region', () => {
  const raws = rawsFor(nlsNotices, [fixture('nlschools/newspostings_5-sample-text.html')])
  const res = nlsNotices.parse(raws, ctx({ sample: true }))
  assert.equal(res.notices.length, 1)
  const n = res.notices[0]
  assert.deepEqual(
    [n.kind, n.status, n.status_basis, n.status_evidence, n.scope, n.scope_region, n.scope_evidence, n.title],
    ['text_notice', 'closed', 'phrase', 'closed for the day', 'region', 'central', 'All schools in the Central region', null],
  )
  assert.equal(n.quote, 'SAMPLE Important notice: SAMPLE All schools in the Central region are closed for the day due to the storm.')
  assert.equal(n.row_id, fnv1a8(n.quote))
  assert.ok(n.id.startsWith('nlschools-notices-2026-09-14-'))
  assertAllVerify(res, raws)
})

test('important notices: SAMPLE links → one notice per link ≥ 3 chars, absolute hrefs, district when no region', () => {
  const raws = rawsFor(nlsNotices, [fixture('nlschools/newspostings_5-sample-links.html')])
  const res = nlsNotices.parse(raws, ctx({ sample: true }))
  assert.deepEqual(
    res.notices.map((n) => [n.title, n.link, n.status, n.scope, n.scope_region]),
    [
      [
        'SAMPLE Delayed opening for all schools in the Avalon region',
        'https://www.nlschools.ca/about/news/sample-1.jsp',
        'delayed',
        'region',
        'avalon',
      ],
      ['SAMPLE Parent-teacher interviews moved to Thursday', 'https://www.nlschools.ca/about/news/sample-2.jsp', 'other', 'district', null],
    ],
  )
  assertAllVerify(res, raws)
})

test('CSFP real feed at 2026-09-14T18:00Z → 0 notices', () => {
  const res = csfpNews.parse(rawsFor(csfpNews, [sample('csfp/feed-2026-09-14.xml')]), ctx({ now: '2026-09-14T18:00:00Z' }))
  assert.deepEqual([res.result, res.notices.length], ['ok', 0])
})

test('CSFP SAMPLE post naming École Boréale 2 h before now → 1 notice, may_apply to École Boréale only', () => {
  const raws = rawsFor(csfpNews, [fixture('csfp/feed-sample.xml')])
  const res = csfpNews.parse(raws, ctx({ now: '2026-09-14T18:00:00Z', sample: true }))
  assert.equal(res.notices.length, 1) // the open-house post has no closure word; the closure post is 4 days old
  const n = res.notices[0]
  assert.deepEqual(
    [n.kind, n.status, n.status_basis, n.scope, n.quote, n.posted_text, n.posted_at, n.link, n.list_date],
    [
      'feed_post',
      'may_apply',
      'none',
      'board',
      'SAMPLE École Boréale fermée aujourd’hui en raison de la tempête',
      'Mon, 14 Sep 2026 16:00:00 +0000',
      '2026-09-14T16:00:00.000Z',
      'https://csfp.nl.ca/blog/2026/09/14/sample-boreale-fermee/',
      null,
    ],
  )
  assert.deepEqual(n.matches, [{ school_id: idOf('École Boréale'), how: 'may_apply', reason: 'board_feed_names_school' }])
  assert.equal(n.row_id, fnv1a8('https://csfp.nl.ca/?p=sample-1'))
  assert.ok(n.source_text.includes('SAMPLE L’école est fermée pour la journée.'))
  assertAllVerify(res, raws)
  // 37 h later it has aged out; 2 h before it was posted it is too far in the future
  assert.equal(csfpNews.parse(raws, ctx({ now: '2026-09-16T05:00:01Z' })).notices.length, 0)
  assert.equal(csfpNews.parse(raws, ctx({ now: '2026-09-14T14:59:59Z' })).notices.length, 0)
  assert.equal(csfpNews.parse(rawsFor(csfpNews, ['<html>SAMPLE not a feed</html>']), ctx()).result, 'format_changed')
})

test('due() uses the §6 schedule', () => {
  assert.equal(nlsStatus.due(NOW, null), true)
  assert.equal(nlsStatus.due(NOW, { last_attempt_at: NOW }), false)
  assert.equal(csfpNews.due('2026-09-14T17:40:05.000Z', { last_attempt_at: NOW }), true)
})
