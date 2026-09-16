// Everything about a Notice that is DERIVED from its verbatim fields: status (§4.1/§4.3), scope and matches
// (§4.2/§4.4), and its id (§5.1). Adapters call it after parsing; the Worker calls it again at ingest after
// re-verification, so a payload can never bring its own matches or status.
import { fnv1a8 } from './text.js'
import { localDate } from './time.js'
import { statusFromRow, statusFromPhrases, findRegionPhrase } from './labels.js'
import { matchRow, csfpSchoolsNamed } from './match.js'

export const NOTICE_KINDS = ['school_row', 'text_notice', 'feed_post']

/** §5.1 id. `now` is used only when the notice has no list_date. */
export function noticeId(n, now) {
  const day = n.list_date ?? localDate(now)
  const h = fnv1a8(`${n.status_class ?? ''}|${n.status_text ?? ''}|${n.quote ?? ''}`)
  return `${n.source_id}-${day}-${n.row_id}-${h}`
}

const NONE = { scope_region: null, scope_evidence: null, unmatched_reason: null, matches: [] }

/** §4.4: one region → region; province → province; more than one distinct region named → district (lead 14:50). */
const regionScope = (r) =>
  r.ambiguous ? { ...NONE, scope: 'district' } : { ...NONE, scope: r.scope, scope_region: r.scope_region, scope_evidence: r.scope_evidence }

const SAME_NAME = (m) => m.how === 'exact' || m.reason === 'name_same_community_differs' || m.reason === 'name_shared'

/** → { notice, unmapped_class } with status, status_basis, status_evidence, scope, scope_*, unmatched_reason, matches set. */
export function classifyNotice(n, schools) {
  const out = { ...n }
  let unmapped_class = null

  if (n.kind === 'school_row') {
    const s = statusFromRow(n.status_class, n.status_text)
    unmapped_class = s.unmapped_class
    Object.assign(out, { status: s.status, status_basis: s.status_basis, status_evidence: s.status_evidence })
    const nls = schools.filter((x) => x.coverage === 'nlschools')
    const m = matchRow(n, nls)
    const sameName = m.matches.some(SAME_NAME)
    // §4.2 rule 3a (lead fix 14:55): with no same-name school, a region phrase is checked BEFORE similar names.
    const region = sameName ? null : findRegionPhrase(n.school_text)
    if (sameName) Object.assign(out, NONE, { scope: 'school', matches: m.matches })
    else if (region) Object.assign(out, regionScope(region))
    else if (m.matches.length) Object.assign(out, NONE, { scope: 'school', matches: m.matches })
    else Object.assign(out, NONE, { scope: 'unmatched', unmatched_reason: m.unmatched_reason })
  } else if (n.kind === 'text_notice') {
    Object.assign(out, statusFromPhrases(n.quote))
    const r = findRegionPhrase(n.quote)
    Object.assign(out, r ? regionScope(r) : { ...NONE, scope: 'district' })
  } else if (n.kind === 'feed_post') {
    const named = csfpSchoolsNamed(n.source_text, schools)
    const matches = named.length
      ? named.map((s) => ({ school_id: s.id, how: 'may_apply', reason: 'board_feed_names_school' }))
      : schools
          .filter((s) => s.coverage === 'csfp')
          .map((s) => ({ school_id: s.id, how: 'may_apply', reason: 'board_feed_no_school_named' }))
    Object.assign(out, NONE, { status: 'may_apply', status_basis: 'none', status_evidence: null, scope: 'board', matches })
  }
  return { notice: out, unmapped_class }
}
