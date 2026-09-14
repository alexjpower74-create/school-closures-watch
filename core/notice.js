// Everything about a Notice that is DERIVED from its verbatim fields: status (§4.1/§4.3), scope and matches
// (§4.2/§4.4), and its id (§5.1). Adapters call it after parsing; the Worker calls it again at ingest after
// re-verification, so a payload can never bring its own matches or status.
import { fnv1a8 } from './text.js'
import { localDate } from './time.js'
import { statusFromRow, statusFromPhrases, findRegionPhrase } from './labels.js'
import { matchRow, csfpSchoolsNamed } from './match.js'

export const NOTICE_KINDS = ['school_row', 'text_notice', 'feed_post']

/** §5.1 id. `now` is used only when the notice has no list_date. */
export function noticeId (n, now) {
  const day = n.list_date ?? localDate(now)
  const h = fnv1a8(`${n.status_class ?? ''}|${n.status_text ?? ''}|${n.quote ?? ''}`)
  return `${n.source_id}-${day}-${n.row_id}-${h}`
}

const NONE = { scope_region: null, scope_evidence: null, unmatched_reason: null, matches: [] }

/** → { notice, unmapped_class } with status, status_basis, status_evidence, scope, scope_*, unmatched_reason, matches set. */
export function classifyNotice (n, schools) {
  const out = { ...n }
  let unmapped_class = null

  if (n.kind === 'school_row') {
    const s = statusFromRow(n.status_class, n.status_text)
    unmapped_class = s.unmapped_class
    Object.assign(out, { status: s.status, status_basis: s.status_basis, status_evidence: s.status_evidence })
    const nls = schools.filter(x => x.coverage === 'nlschools')
    const m = matchRow(n, nls)
    if (m.matches.length) {
      Object.assign(out, NONE, { scope: 'school', matches: m.matches })
    } else {
      const r = findRegionPhrase(n.school_text)
      if (r) Object.assign(out, NONE, { scope: r.scope, scope_region: r.scope_region, scope_evidence: r.scope_evidence })
      else Object.assign(out, NONE, { scope: 'unmatched', unmatched_reason: m.unmatched_reason })
    }
  } else if (n.kind === 'text_notice') {
    const s = statusFromPhrases(n.quote)
    Object.assign(out, s)
    const r = findRegionPhrase(n.quote)
    if (r) Object.assign(out, NONE, { scope: r.scope, scope_region: r.scope_region, scope_evidence: r.scope_evidence })
    else Object.assign(out, NONE, { scope: 'district' })
  } else if (n.kind === 'feed_post') {
    const named = csfpSchoolsNamed(n.source_text, schools)
    const matches = named.length
      ? named.map(s => ({ school_id: s.id, how: 'may_apply', reason: 'board_feed_names_school' }))
      : schools.filter(s => s.coverage === 'csfp').map(s => ({ school_id: s.id, how: 'may_apply', reason: 'board_feed_no_school_named' }))
    Object.assign(out, NONE, { status: 'may_apply', status_basis: 'none', status_evidence: null, scope: 'board', matches })
  }
  return { notice: out, unmapped_class }
}
