// Fixed wording (API.md §4.1, §4.5, §5.4). Labels and reasons come only from these tables.

export const STATUS = {
  closed: { label: 'Closed', rank: 1 },
  closed_part: { label: 'Closed part of the day', rank: 2 },
  buses_cancelled: { label: 'Buses cancelled', rank: 3 },
  early_dismissal: { label: 'Closing early', rank: 4 },
  delayed: { label: 'Delayed opening', rank: 5 },
  buses_delayed: { label: 'Buses delayed', rank: 6 },
  other: { label: 'Other notice, read it', rank: 7 },
  may_apply: { label: 'A notice may apply', rank: 8 },
  unknown: { label: 'Unknown', rank: 9 },
  open: { label: 'Open, no notice', rank: 10 },
}

export const labelFor = (code) => (STATUS[code] || STATUS.other).label
export const rankFor = (code) => (STATUS[code] || STATUS.other).rank

export const REASON_TEXT = {
  stale: "We couldn't check NLSchools since {time}. Check nlschools.ca or call the school.",
  // Same reason code when NLSchools was never checked (API.md §4.5, lead answer 14:50).
  stale_never: "We haven't been able to check NLSchools yet. Check nlschools.ca or call the school.",
  list_date_old: 'The NLSchools list is still showing {list_date_text}.',
  list_date_missing: "We couldn't read which day the NLSchools list is for.",
  open_rule_missing: "The NLSchools page no longer says unlisted schools are open, so we can't say this school is open.",
  csfp_no_online_status: "CSFP schools don't post closures online. The school tells families directly.",
  no_official_source: 'This school has no official online closure list. Call the school.',
}

export const MAY_APPLY_TEXT = {
  name_same_community_differs: 'The notice names this school but a different community: "{community_text}".',
  // Used when community_text is null (API.md §5.4, lead 15:10).
  name_same_community_differs_none: "The notice names this school but doesn't say which community.",
  name_shared: 'More than one school has this name.',
  name_similar: 'The notice names a similar school: "{school_text}".',
  board_feed_names_school: 'A CSFP news post mentions this school.',
  board_feed_no_school_named: 'A CSFP news post mentions a closure but no school.',
}

export const REGIONS = [
  { region: 'avalon', region_name: 'Avalon' },
  { region: 'central', region_name: 'Central' },
  { region: 'western', region_name: 'Western' },
  { region: 'labrador', region_name: 'Labrador' },
]

export const KIND_WORDS = { used: 'Checked', link_only: 'Link only', not_used: 'Not used' }

/** Worst first: rank ascending, then school name (API.md §4.5). */
export function byRankThenName(a, b) {
  return a.rank - b.rank || String(a.school?.name ?? '').localeCompare(String(b.school?.name ?? ''))
}

/** Notices worst first, then by school or title text. */
export function noticesWorstFirst(a, b) {
  return (
    rankFor(a.status) - rankFor(b.status) ||
    String(a.school_text ?? a.title ?? a.quote ?? '').localeCompare(String(b.school_text ?? b.title ?? b.quote ?? ''))
  )
}
