// MOCK-ONLY scenarios (API.md §8.4). Every notice here is sample: true.
// Real rows (REAL_ROWS) keep their verbatim text; invented rows start their text with "SAMPLE ".
// The app has no matching engine: `matches` are written out by hand here, as core would produce them.
import { REAL_ROWS, OPEN_RULE, LIST_DATE_TEXT_2026_09_14 } from './data.js'
import { REGISTRY } from './registry.js'
import { fmtTime } from '../format.js'

const NLS_HUMAN = 'https://www.nlschools.ca/schools/statusreport.jsp'
const CLASS_STATUS = {
  closedAllDay: 'closed',
  closedForPD: 'closed',
  closedForHoliday: 'closed',
  closedForMorning: 'closed_part',
  closedForAfternoon: 'closed_part',
  closingEarly: 'early_dismissal',
  delayedOpening: 'delayed',
  busDelayed: 'buses_delayed',
  otherStatus: 'other',
}

const at = (iso, minutes = 0) => new Date(Date.parse(iso) + minutes * 60_000).toISOString()
const ref = (iso, name) => `nlschools-status/${iso.replace(/[:.]/g, '-')}-${name}.html`
const real = (day, school) => {
  const row = REAL_ROWS[day].find((r) => r.school_text === school)
  if (!row) throw new Error(`mock: no real row for ${school}`)
  return row
}

function rowNotice(row, o) {
  return {
    id: `nlschools-status-${o.list_date}-${row.row_id}-mock`,
    source_id: 'nlschools-status',
    sample: true,
    kind: 'school_row',
    list_date: o.list_date,
    list_date_text: o.list_date_text,
    row_id: row.row_id,
    school_text: row.school_text,
    community_text: row.community_text,
    family_text: row.family_text ?? null,
    region_text: row.region_text,
    status_class: row.status_class,
    status_text: row.status_text,
    status: CLASS_STATUS[row.status_class] || 'other',
    status_basis: 'class',
    status_evidence: row.status_class,
    title: null,
    quote: row.quote,
    source_text: row.source_text,
    posted_at: null,
    posted_text: null,
    first_seen_at: o.first_seen_at,
    last_seen_at: o.last_seen_at ?? o.first_seen_at,
    removed_at: o.removed_at ?? null,
    scope: o.scope ?? 'school',
    scope_region: null,
    scope_evidence: null,
    unmatched_reason: o.unmatched_reason ?? null,
    matches: o.matches ?? [],
    link: NLS_HUMAN,
    raw_refs: [ref(o.first_seen_at, 'statusreport'), ref(o.first_seen_at, 'schoolstatus')],
  }
}

/** An invented status row: every invented text starts with "SAMPLE ". */
function sampleRow(row_id, school_text, status_class, status_text, note, region_text) {
  const quote = note
  return {
    row_id,
    school_text,
    community_text: null,
    status_class,
    status_text,
    quote,
    family_text: null,
    region_text,
    source_text: [school_text, status_text, quote, region_text].join(' '),
  }
}

function health(id, o) {
  const r = REGISTRY.find((x) => x.id === id)
  const base = {
    id,
    name: r.name,
    kind: r.kind,
    human_url: r.human_url,
    last_attempt_at: o.last_ok_at,
    last_ok_at: o.last_ok_at,
    last_result: 'ok',
    last_error: null,
    list_date: null,
    list_date_text: null,
    open_rule_quote: null,
    notices_current: 0,
    rows_skipped: 0,
    quotes_dropped: 0,
    unmapped_classes: [],
    stale: false,
    stale_reason: null,
    stale_text: null,
    interval_minutes_now: o.interval ?? 60,
  }
  const h = { ...base, ...o }
  delete h.interval
  h.next_due_at = at(h.last_attempt_at, h.interval_minutes_now)
  return h
}

function healthySet({ now, last_ok_at, list_date, list_date_text, interval = 5, counts = {} }) {
  return {
    'nlschools-status': health('nlschools-status', {
      last_ok_at,
      list_date,
      list_date_text,
      open_rule_quote: OPEN_RULE,
      interval,
      notices_current: counts.status ?? 0,
    }),
    'nlschools-notices': health('nlschools-notices', { last_ok_at, interval, notices_current: counts.notices ?? 0 }),
    'csfp-news': health('csfp-news', {
      last_ok_at: at(last_ok_at, -2),
      interval: interval === 5 ? 15 : 60,
      notices_current: counts.csfp ?? 0,
    }),
    now,
  }
}

const splitHealth = (set) => {
  const { now, ...h } = set
  return h
}

// today: the two real rows of Monday, September 14, 2026 (verbatim).
function todayRows(first_seen_at, last_seen_at) {
  const o = { list_date: '2026-09-14', list_date_text: LIST_DATE_TEXT_2026_09_14, first_seen_at, last_seen_at }
  return [
    rowNotice(real('today', 'Glovertown Academy'), { ...o, matches: [{ school_id: 'nls-300422', how: 'exact', reason: null }] }),
    rowNotice(real('today', 'Eastside Elementary'), { ...o, matches: [{ school_id: 'nls-200498', how: 'exact', reason: null }] }),
  ]
}

function today() {
  const now = '2026-09-14T16:45:00.000Z'
  const seen = '2026-09-14T16:40:05.000Z'
  return {
    now,
    health: splitHealth(
      healthySet({ now, last_ok_at: seen, list_date: '2026-09-14', list_date_text: LIST_DATE_TEXT_2026_09_14, interval: 60, counts: { status: 2 } }),
    ),
    notices: todayRows(seen),
  }
}

// storm: the three real rows of 2024-01-10 + SAMPLE region-wide Central closure + SAMPLE ambiguous row +
// SAMPLE unmatched Western row. Also one SAMPLE row that was removed earlier that morning, for the notice page.
function storm() {
  const now = '2024-01-10T10:12:00.000Z' // Wednesday 6:42 AM NST
  const seen = '2024-01-10T10:05:00.000Z'
  const later = '2024-01-10T10:10:00.000Z'
  // The 2024 archive has no saved page, so there's no real date line to copy.
  const day = { list_date: '2024-01-10', list_date_text: 'SAMPLE Wednesday, January 10, 2024' }
  const o = { ...day, first_seen_at: seen, last_seen_at: later }
  const regionQuote = 'SAMPLE All schools in the Central region are closed for the day'
  const regionWide = {
    id: 'nlschools-notices-2024-01-10-sample-central-mock',
    source_id: 'nlschools-notices',
    sample: true,
    kind: 'text_notice',
    ...day,
    row_id: 'sample-central',
    school_text: null,
    community_text: null,
    family_text: null,
    region_text: null,
    status_class: null,
    status_text: null,
    status: 'closed',
    status_basis: 'phrase',
    status_evidence: 'closed for the day',
    title: null,
    quote: regionQuote,
    source_text: regionQuote,
    posted_at: null,
    posted_text: null,
    first_seen_at: later,
    last_seen_at: later,
    removed_at: null,
    scope: 'region',
    scope_region: 'central',
    scope_evidence: 'All schools in the Central region',
    unmatched_reason: null,
    matches: [],
    link: 'https://www.nlschools.ca/',
    raw_refs: [`nlschools-notices/${later.replace(/[:.]/g, '-')}-newspostings_5.html`],
  }
  const notices = [
    rowNotice(real('storm', "Bay d'Espoir Academy"), { ...o, matches: [{ school_id: 'nls-300407', how: 'exact', reason: null }] }),
    rowNotice(real('storm', 'Bishop White School'), { ...o, matches: [{ school_id: 'nls-400240', how: 'exact', reason: null }] }),
    rowNotice(real('storm', "St. Mark's School"), { ...o, matches: [{ school_id: 'nls-400430', how: 'exact', reason: null }] }),
    regionWide,
    rowNotice(
      {
        ...sampleRow('sample-1', 'SAMPLE Glovertown', 'closedAllDay', 'SAMPLE CLOSED ALL DAY', 'SAMPLE Closed due to storm', 'CENTRAL'),
        community_text: 'Gander, NL',
        source_text: 'SAMPLE Glovertown Gander, NL SAMPLE CLOSED ALL DAY SAMPLE Closed due to storm CENTRAL',
      },
      { ...o, first_seen_at: later, matches: [{ school_id: 'nls-300422', how: 'may_apply', reason: 'name_similar' }] },
    ),
    rowNotice(
      sampleRow('sample-2', 'SAMPLE Western Bus Depot', 'otherStatus', 'SAMPLE OTHER STATUS', 'SAMPLE Some bus runs will be delayed', 'WESTERN'),
      { ...o, first_seen_at: later, scope: 'unmatched', unmatched_reason: 'no_school' },
    ),
    rowNotice(
      sampleRow('sample-3', 'SAMPLE Gander Academy', 'delayedOpening', 'SAMPLE DELAYED OPENING', 'SAMPLE Delayed opening - 1 hour', 'CENTRAL'),
      {
        ...day,
        first_seen_at: '2024-01-10T09:35:00.000Z',
        last_seen_at: '2024-01-10T10:00:00.000Z',
        removed_at: seen,
        matches: [{ school_id: 'nls-300417', how: 'exact', reason: null }],
      },
    ),
  ]
  return {
    now,
    health: splitHealth(healthySet({ now, last_ok_at: later, ...day, interval: 5, counts: { status: 5, notices: 1 } })),
    notices,
  }
}

// quiet: no notices, healthy sources.
function quiet() {
  const now = '2026-09-14T09:12:00.000Z' // Monday 6:42 AM NDT
  const last = '2026-09-14T09:10:00.000Z'
  return {
    now,
    health: splitHealth(
      healthySet({ now, last_ok_at: last, list_date: '2026-09-14', list_date_text: LIST_DATE_TEXT_2026_09_14, interval: 5 }),
    ),
    notices: [],
  }
}

// stale: nlschools-status last attempt failed 5 minutes ago, last ok 45 minutes ago.
function stale() {
  const now = '2026-09-14T17:30:00.000Z'
  const failed = at(now, -5)
  const lastOk = at(now, -45)
  const set = splitHealth(
    healthySet({ now, last_ok_at: lastOk, list_date: '2026-09-14', list_date_text: LIST_DATE_TEXT_2026_09_14, interval: 60, counts: { status: 2 } }),
  )
  set['nlschools-status'] = {
    ...set['nlschools-status'],
    last_attempt_at: failed,
    last_result: 'error',
    last_error: 'HTTP 503',
    stale: true,
    stale_reason: 'last_attempt_failed',
    stale_text: `We couldn't reach the NLSchools list at ${fmtTime(failed)}. Statuses below are from ${fmtTime(lastOk)}.`,
    next_due_at: at(failed, 60),
  }
  return { now, health: set, notices: todayRows('2026-09-14T16:40:05.000Z', lastOk) }
}

// csfp: SAMPLE CSFP feed post, may apply to École Boréale.
function csfp() {
  const now = '2026-09-14T18:00:00.000Z'
  const title = "SAMPLE École Boréale fermée aujourd'hui en raison de la tempête"
  const post = {
    id: 'csfp-news-2026-09-14-sample-boreale-mock',
    source_id: 'csfp-news',
    sample: true,
    kind: 'feed_post',
    list_date: null,
    list_date_text: null,
    row_id: 'sample-boreale',
    school_text: null,
    community_text: null,
    family_text: null,
    region_text: null,
    status_class: null,
    status_text: null,
    status: 'may_apply',
    status_basis: 'none',
    status_evidence: null,
    title,
    quote: title,
    source_text: `${title} SAMPLE L'école est fermée aujourd'hui.`,
    posted_at: at(now, -120),
    posted_text: 'SAMPLE Mon, 14 Sep 2026 16:00:00 +0000',
    first_seen_at: at(now, -105),
    last_seen_at: at(now, -10),
    removed_at: null,
    scope: 'board',
    scope_region: null,
    scope_evidence: null,
    unmatched_reason: null,
    matches: [{ school_id: 'csfp-500472', how: 'may_apply', reason: 'board_feed_names_school' }],
    link: 'https://csfp.nl.ca/',
    raw_refs: [`csfp-news/${at(now, -10).replace(/[:.]/g, '-')}-feed.xml`],
  }
  return {
    now,
    health: splitHealth(
      healthySet({ now, last_ok_at: at(now, -5), list_date: '2026-09-14', list_date_text: LIST_DATE_TEXT_2026_09_14, interval: 60, counts: { csfp: 1 } }),
    ),
    notices: [post],
  }
}

// checks (test-only, not in §8.4): today's real rows + a SAMPLE row whose quote is NOT in its row text (the app's
// quote guard must drop it) + a SAMPLE district notice (no region named, attached to no school).
function checks() {
  const base = today()
  const seen = '2026-09-14T16:40:05.000Z'
  const tampered = rowNotice(
    {
      row_id: 'sample-tampered',
      school_text: 'SAMPLE Gander Academy',
      community_text: null,
      status_class: 'closedAllDay',
      status_text: 'SAMPLE CLOSED ALL DAY',
      quote: 'SAMPLE School closed all day because of a tampered quote',
      family_text: null,
      region_text: 'CENTRAL',
      source_text: 'SAMPLE Gander Academy SAMPLE CLOSED ALL DAY SAMPLE Water Shut Off CENTRAL',
    },
    { list_date: '2026-09-14', list_date_text: LIST_DATE_TEXT_2026_09_14, first_seen_at: seen, matches: [{ school_id: 'nls-300417', how: 'exact', reason: null }] },
  )
  const districtQuote = 'SAMPLE Parents: check this page again at 11:00 a.m. for an update.'
  const district = {
    ...base.notices[0],
    id: 'nlschools-notices-2026-09-14-sample-district-mock',
    source_id: 'nlschools-notices',
    kind: 'text_notice',
    row_id: 'sample-district',
    school_text: null,
    community_text: null,
    family_text: null,
    region_text: null,
    status_class: null,
    status_text: null,
    status: 'other',
    status_basis: 'none',
    status_evidence: null,
    quote: districtQuote,
    source_text: districtQuote,
    scope: 'district',
    matches: [],
    link: 'https://www.nlschools.ca/',
    raw_refs: [`nlschools-notices/${seen.replace(/[:.]/g, '-')}-newspostings_5.html`],
  }
  return { ...base, notices: [...base.notices, tampered, district] }
}

export const SCENARIOS = { today, storm, quiet, stale, csfp, checks }
