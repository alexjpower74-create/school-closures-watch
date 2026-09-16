import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchRow, csfpSchoolsNamed, nameKey } from '../match.js'
import { classifyNotice, noticeId } from '../notice.js'
import { SCHOOLS } from '../schools.js'

const NLS = SCHOOLS.filter((s) => s.coverage === 'nlschools')
const idOf = (name) => SCHOOLS.find((s) => s.name === name).id
const GLOVERTOWN = idOf('Glovertown Academy')

test('the six real row schools match exactly on name + community', () => {
  const rows = [
    ['Glovertown Academy', 'Glovertown, NL'],
    ['Eastside Elementary', 'Corner Brook, NL'],
    ["Bay d'Espoir Academy", "St. Alban's, NL"],
    ['Bishop White School', 'Port Rexton, NL'],
    ["St. Mark's School", "King's Cove, NL"],
    ['Upper Gullies Elementary', 'Conception Bay South, NL'],
  ]
  for (const [school_text, community_text] of rows) {
    assert.deepEqual(
      matchRow({ school_text, community_text }, NLS),
      { matches: [{ school_id: idOf(school_text), how: 'exact', reason: null }], unmatched_reason: null },
      school_text,
    )
  }
})

test('may_apply: "SAMPLE Glovertown" / "Gander, NL" → Glovertown Academy, name_similar (never exact)', () => {
  assert.deepEqual(matchRow({ school_text: 'SAMPLE Glovertown', community_text: 'Gander, NL' }, NLS), {
    matches: [{ school_id: GLOVERTOWN, how: 'may_apply', reason: 'name_similar' }],
    unmatched_reason: null,
  })
})

test('may_apply: same name, different or missing community → name_same_community_differs', () => {
  const want = { matches: [{ school_id: GLOVERTOWN, how: 'may_apply', reason: 'name_same_community_differs' }], unmatched_reason: null }
  assert.deepEqual(matchRow({ school_text: 'Glovertown Academy', community_text: 'Gander, NL' }, NLS), want)
  assert.deepEqual(matchRow({ school_text: 'Glovertown Academy', community_text: null }, NLS), want)
})

test('may_apply: a name shared by more than one school → name_shared', () => {
  const schools = [
    { id: 'a', name: 'SAMPLE Twin School', community: 'Alpha', coverage: 'nlschools' },
    { id: 'b', name: 'SAMPLE Twin School', community: 'Beta', coverage: 'nlschools' },
  ]
  assert.deepEqual(
    matchRow({ school_text: 'SAMPLE Twin School', community_text: 'Gamma, NL' }, schools).matches.map((m) => [
      m.school_id,
      m.how,
      m.reason,
    ]),
    [
      ['a', 'may_apply', 'name_shared'],
      ['b', 'may_apply', 'name_shared'],
    ],
  )
  assert.deepEqual(matchRow({ school_text: 'SAMPLE Twin School', community_text: 'Alpha, NL' }, schools).matches, [
    { school_id: 'a', how: 'exact', reason: null },
  ])
})

test('similar names: 1–5 candidates may_apply, more than 5 → too_many, shared token + same community', () => {
  const many = (n) =>
    Array.from({ length: n }, (_, i) => ({
      id: `h${i}`,
      name: `SAMPLE Harbour Elementary ${i + 1}`,
      community: `Place ${i}`,
      coverage: 'nlschools',
    }))
  assert.equal(matchRow({ school_text: 'SAMPLE Harbour', community_text: 'Elsewhere, NL' }, many(5)).matches.length, 5)
  assert.deepEqual(matchRow({ school_text: 'SAMPLE Harbour', community_text: 'Elsewhere, NL' }, many(6)), {
    matches: [],
    unmatched_reason: 'too_many',
  })
  const pine = [{ id: 'p', name: 'Pine Valley School', community: 'Spruce Cove', coverage: 'nlschools' }]
  assert.deepEqual(matchRow({ school_text: 'SAMPLE Pine Hill', community_text: 'Spruce Cove, NL' }, pine).matches, [
    { school_id: 'p', how: 'may_apply', reason: 'name_similar' },
  ])
  assert.deepEqual(matchRow({ school_text: 'SAMPLE Pine Hill', community_text: 'Gander, NL' }, pine).matches, [])
  assert.equal(matchRow({ school_text: 'Holy Cross', community_text: 'Nowhere, NL' }, NLS).matches.length, 3)
  assert.deepEqual(nameKey("St. Mark's Memorial Academy"), ['marks'])
})

test('unmatched row → no_school; a row naming the whole Central region → scope region', () => {
  assert.deepEqual(matchRow({ school_text: 'SAMPLE Nowhere Harbour School', community_text: 'Nowhere, NL' }, NLS), {
    matches: [],
    unmatched_reason: 'no_school',
  })
  const base = {
    source_id: 'nlschools-status',
    kind: 'school_row',
    row_id: '1',
    list_date: '2026-09-14',
    status_class: 'closedAllDay',
    status_text: 'CLOSED ALL DAY',
    quote: 'SAMPLE Closed due to storm',
  }
  const region = classifyNotice({ ...base, school_text: 'SAMPLE All Central Region Schools', community_text: null }, SCHOOLS).notice
  assert.equal(region.scope, 'region')
  assert.equal(region.scope_region, 'central')
  assert.equal(region.scope_evidence, 'All Central Region Schools')
  assert.deepEqual(region.matches, [])
  const un = classifyNotice({ ...base, school_text: 'SAMPLE Nowhere Harbour School', community_text: 'Nowhere, NL' }, SCHOOLS).notice
  assert.equal(un.scope, 'unmatched')
  assert.equal(un.unmatched_reason, 'no_school')
  // an exact row whose note names a region is still scope school
  const ex = classifyNotice(
    {
      ...base,
      school_text: 'Glovertown Academy',
      community_text: 'Glovertown, NL',
      quote: 'SAMPLE like all schools in the Central region',
    },
    SCHOOLS,
  ).notice
  assert.equal(ex.scope, 'school')
})

test('classifyNotice: text notices and feed posts', () => {
  const t = classifyNotice(
    {
      source_id: 'nlschools-notices',
      kind: 'text_notice',
      row_id: 'x',
      quote: 'SAMPLE All schools in the Central region are closed for the day',
    },
    SCHOOLS,
  ).notice
  assert.deepEqual(
    [t.status, t.status_basis, t.status_evidence, t.scope, t.scope_region],
    ['closed', 'phrase', 'closed for the day', 'region', 'central'],
  )
  const d = classifyNotice(
    { source_id: 'nlschools-notices', kind: 'text_notice', row_id: 'y', quote: 'SAMPLE Parent-teacher night moved' },
    SCHOOLS,
  ).notice
  assert.deepEqual([d.status, d.scope], ['other', 'district'])
  const named = classifyNotice(
    {
      source_id: 'csfp-news',
      kind: 'feed_post',
      row_id: 'z',
      source_text: "SAMPLE École Boréale fermée aujourd'hui en raison de la tempête",
    },
    SCHOOLS,
  ).notice
  assert.deepEqual(named.matches, [{ school_id: idOf('École Boréale'), how: 'may_apply', reason: 'board_feed_names_school' }])
  assert.equal(named.status, 'may_apply')
  const none = classifyNotice(
    { source_id: 'csfp-news', kind: 'feed_post', row_id: 'z', source_text: 'SAMPLE Écoles fermées' },
    SCHOOLS,
  ).notice
  assert.equal(none.matches.length, 6)
  assert.ok(none.matches.every((m) => m.how === 'may_apply' && m.reason === 'board_feed_no_school_named'))
})

test('CSFP short names, accent- and case-insensitive, French elision', () => {
  const named = (t) => csfpSchoolsNamed(t, SCHOOLS).map((s) => s.name)
  assert.deepEqual(named('SAMPLE ÉCOLE BOREALE fermée'), ['École Boréale'])
  assert.deepEqual(named("SAMPLE L'Envol fermée"), ["École l'ENVOL"])
  assert.deepEqual(named('SAMPLE Notre-Dame-du-Cap et Sainte-Anne'), ['École Notre-Dame-du-Cap', 'École Sainte-Anne'])
  assert.deepEqual(named('SAMPLE Grands Vents, Rocher du Nord'), ['École Rocher-du-Nord', 'École des Grands-Vents'])
  assert.deepEqual(named('SAMPLE développement'), [])
})

test('§4.2 rule 3a: a region phrase is checked BEFORE similar names (lead fix 14:55)', () => {
  const schools = [{ id: 'c1', name: 'Central High', community: 'Sample Cove', region: 'central', coverage: 'nlschools' }]
  assert.deepEqual(nameKey('Central High'), ['central'])
  const r = {
    source_id: 'nlschools-status',
    kind: 'school_row',
    row_id: '1',
    list_date: '2026-09-14',
    status_class: 'closedAllDay',
    status_text: 'CLOSED ALL DAY',
    quote: 'SAMPLE Closed due to storm',
    school_text: 'SAMPLE All schools in the Central region',
    community_text: null,
  }
  // on its own the similar-name rule would make this "may apply" to Central High
  assert.equal(matchRow(r, schools).matches[0]?.reason, 'name_similar')
  const n = classifyNotice(r, schools).notice
  assert.deepEqual([n.scope, n.scope_region, n.scope_evidence, n.matches], ['region', 'central', 'All schools in the Central region', []])
  // a same-name row is still about that school, whatever its note says
  const same = classifyNotice({ ...r, school_text: 'Central High', community_text: 'Sample Cove, NL' }, schools).notice
  assert.deepEqual([same.scope, same.matches[0].how], ['school', 'exact'])
})

test('§4.4 more than one distinct region named → district (status rows and text notices; lead 14:50)', () => {
  const r = classifyNotice(
    {
      source_id: 'nlschools-status',
      kind: 'school_row',
      row_id: '2',
      list_date: '2026-09-14',
      status_class: 'closedAllDay',
      status_text: 'CLOSED ALL DAY',
      quote: 'SAMPLE Closed',
      school_text: 'SAMPLE All Central schools and all Western schools',
      community_text: null,
    },
    SCHOOLS,
  ).notice
  assert.deepEqual([r.scope, r.scope_region, r.scope_evidence, r.matches, r.unmatched_reason], ['district', null, null, [], null])
  const t = classifyNotice(
    {
      source_id: 'nlschools-notices',
      kind: 'text_notice',
      row_id: 'x',
      quote: 'SAMPLE All Avalon schools and all Labrador schools will open late',
    },
    SCHOOLS,
  ).notice
  assert.deepEqual([t.scope, t.scope_region, t.status], ['district', null, 'delayed'])
  // the same region named twice is still one region
  const twice = classifyNotice(
    {
      source_id: 'nlschools-notices',
      kind: 'text_notice',
      row_id: 'y',
      quote: 'SAMPLE All Central schools are closed; Central region schools reopen tomorrow',
    },
    SCHOOLS,
  ).notice
  assert.deepEqual([twice.scope, twice.scope_region], ['region', 'central'])
})

test('noticeId follows §5.1', () => {
  const n = {
    source_id: 'nlschools-status',
    list_date: '2026-09-14',
    row_id: '468',
    status_class: 'closedAllDay',
    status_text: 'CLOSED ALL DAY',
    quote: 'q',
  }
  assert.match(noticeId(n), /^nlschools-status-2026-09-14-468-[0-9a-f]{8}$/)
  assert.equal(noticeId({ ...n, list_date: null, source_id: 'csfp-news' }, '2026-09-14T02:29:00Z').slice(0, 21), 'csfp-news-2026-09-13-')
})
