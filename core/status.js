// School status per request (API.md §4.5 → §5.4). Pure: school + current notices + source health + now.
import { rankOf, labelOf } from './labels.js'
import { staleness } from './schedule.js'
import { localDate, fmtTime } from './time.js'
import { normName } from './text.js'

export const REASON_TEXT = {
  list_date_missing: "We couldn't read which day the NLSchools list is for.",
  open_rule_missing: "The NLSchools page no longer says unlisted schools are open, so we can't say this school is open.",
  csfp_no_online_status: "CSFP schools don't post closures online. The school tells families directly.",
  no_official_source: 'This school has no official online closure list. Call the school.',
}

export function reasonText(reason, { health, now: _now } = {}) {
  if (reason === 'stale') {
    if (!health?.last_ok_at) return "We haven't been able to check NLSchools yet. Check nlschools.ca or call the school."
    return `We couldn't check NLSchools since ${fmtTime(health.last_ok_at)}. Check nlschools.ca or call the school.`
  }
  if (reason === 'list_date_old') return `The NLSchools list is still showing ${health?.list_date_text ?? health?.list_date}.`
  return REASON_TEXT[reason] ?? null
}

export function mayApplyReasonText(reason, notice) {
  switch (reason) {
    case 'name_same_community_differs':
      return notice.community_text
        ? `The notice names this school but a different community: "${notice.community_text}".`
        : "The notice names this school but doesn't say which community."
    case 'name_shared':
      return 'More than one school has this name.'
    case 'name_similar':
      return `The notice names a similar school: "${notice.school_text ?? ''}".`
    case 'board_feed_names_school':
      return 'A CSFP news post mentions this school.'
    case 'board_feed_no_school_named':
      return 'A CSFP news post mentions a closure but no school.'
    default:
      return null
  }
}

/**
 * §4.5 (lead fix 14:55): a notice from an older list never sets today's status. `list_date: null` (feed posts,
 * important notices) is never old; those are bounded by their own windows.
 */
export function isOldList(notice, today) {
  return notice.list_date !== null && notice.list_date !== undefined && notice.list_date < today
}

/** Current notices → lookups used by schoolStatus. Removed notices are ignored; old lists are filtered per request. */
export function indexNotices(notices) {
  const byId = new Map()
  const bySchool = new Map() // school_id → [{notice, how, reason}]
  const byRegion = new Map() // region → [notice]
  const province = []
  const unmatchedByRegion = new Map() // region → [notice]
  for (const n of notices) {
    if (n.removed_at) continue
    byId.set(n.id, n)
    for (const m of n.matches ?? []) {
      if (!bySchool.has(m.school_id)) bySchool.set(m.school_id, [])
      bySchool.get(m.school_id).push({ notice: n, how: m.how, reason: m.reason ?? null })
    }
    if (n.scope === 'region' && n.scope_region) {
      if (!byRegion.has(n.scope_region)) byRegion.set(n.scope_region, [])
      byRegion.get(n.scope_region).push(n)
    }
    if (n.scope === 'province') province.push(n)
    if (n.scope === 'unmatched' && n.source_id === 'nlschools-status') {
      const r = normName(n.region_text)
      if (!unmatchedByRegion.has(r)) unmatchedByRegion.set(r, [])
      unmatchedByRegion.get(r).push(n)
    }
  }
  return { byId, bySchool, byRegion, province, unmatchedByRegion }
}

const worstFirst = (a, b) =>
  rankOf(a.notice.status) - rankOf(b.notice.status) ||
  String(a.notice.first_seen_at ?? '').localeCompare(String(b.notice.first_seen_at ?? '')) ||
  a.notice.id.localeCompare(b.notice.id)

/**
 * → SchoolStatus (§5.4).
 * `health` = { [source_id]: SourceHealth-like row with last_attempt_at, last_ok_at, last_result, list_date,
 * list_date_text, open_rule_quote }. `index` = indexNotices(currentNotices).
 */
export function schoolStatus(school, index, health, now) {
  const today = localDate(now)
  const fresh = (n) => !isOldList(n, today)
  const mine = (index.bySchool.get(school.id) ?? []).filter((m) => fresh(m.notice))
  const may = mine.filter((m) => m.how === 'may_apply')
  const base = {
    source_status_text: null,
    headline_notice_id: null,
    applies: [],
    may_apply: may.map((m) => ({ notice_id: m.notice.id, reason: m.reason, reason_text: mayApplyReasonText(m.reason, m.notice) })),
    reason: null,
    reason_text: null,
    as_of: null,
    stale: false,
    list_date_text: null,
    // NLSchools schools only (lead 15:10): unmatched rows are NLSchools rows
    unmatched_in_region:
      school.coverage === 'nlschools' && school.region ? (index.unmatchedByRegion.get(school.region) ?? []).filter(fresh).length : 0,
  }
  // §5.4 key order: school, status, label, rank, then the rest
  const finish = (status, extra = {}) => ({ school, status, label: labelOf(status), rank: rankOf(status), ...base, ...extra })
  const unknown = (reason, extra = {}, h = null) =>
    finish('unknown', { ...extra, reason, reason_text: reasonText(reason, { health: h, now }) })

  if (school.coverage === 'nlschools') {
    const h = health?.['nlschools-status'] ?? null
    const { stale } = staleness('nlschools-status', now, h)
    const applies = [
      ...mine.filter((m) => m.how === 'exact'),
      ...(index.byRegion.get(school.region) ?? []).filter(fresh).map((n) => ({ notice: n, how: 'region' })),
      ...index.province.filter(fresh).map((n) => ({ notice: n, how: 'province' })),
    ].sort(worstFirst)
    const common = { as_of: h?.last_ok_at ?? null, stale, list_date_text: h?.list_date_text ?? null }
    if (applies.length) {
      const head = applies[0].notice
      return finish(head.status, {
        ...common,
        applies: applies.map((a) => ({ notice_id: a.notice.id, how: a.how })),
        headline_notice_id: head.id,
        source_status_text: head.status_text ?? null,
      })
    }
    if (stale) return unknown('stale', common, h)
    if (may.length) return finish('may_apply', { ...common, headline_notice_id: may[0].notice.id })
    if (!h?.list_date) return unknown('list_date_missing', common, h)
    if (h.list_date < today) return unknown('list_date_old', common, h)
    if (!h.open_rule_quote) return unknown('open_rule_missing', common, h)
    return finish('open', common)
  }

  if (school.coverage === 'csfp') {
    const h = health?.['csfp-news'] ?? null
    const common = { as_of: h?.last_ok_at ?? null, stale: staleness('csfp-news', now, h).stale }
    if (may.length) return finish('may_apply', { ...common, headline_notice_id: may[0].notice.id })
    return unknown('csfp_no_online_status', common)
  }

  return unknown('no_official_source', { as_of: null })
}

/** §4.5 sort: rank ascending, then school name. */
export function sortStatuses(list) {
  return [...list].sort((a, b) => a.rank - b.rank || a.school.name.localeCompare(b.school.name, 'en'))
}
