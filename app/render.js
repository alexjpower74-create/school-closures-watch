// Renderers shared by the screens: school cards, notice blocks, may-apply cards, the quote guard.
import { el, statusIcon } from './common.js'
import { href } from './params.js'
import { fmtWhen } from './format.js'
import { labelFor, rankFor, noticesWorstFirst } from './labels.js'
import { quoteIsVerified } from './text.js'

const SOURCE_NAMES = {
  'nlschools-status': 'NLSchools School Status Report',
  'nlschools-notices': 'NLSchools important notices',
  'csfp-news': 'CSFP news feed',
}
export const sourceName = (id) => SOURCE_NAMES[id] || id

export const GUARD_REASON =
  "A notice for this school didn't match the words we saved from the source, so we don't show it. Check nlschools.ca or call the school."

/**
 * The quote guard (API.md §8.2): drop every notice whose quote isn't an exact substring of its source_text, with a
 * console warning. Nothing downstream ever sees a dropped notice.
 */
export function guardNotices(list) {
  return (list || []).filter((n) => {
    if (quoteIsVerified(n)) return true
    console.warn(`[scw] quote guard: notice ${n?.id} not shown, its quote is not in its source text`)
    return false
  })
}

/** Apply the guard to a /api/status body, and fix up any school status that leaned on a dropped notice. */
export function guardStatusBody(body) {
  const notices = {}
  for (const n of guardNotices(Object.values(body.notices || {}))) notices[n.id] = n
  const schools = (body.schools || []).map((st) => {
    const applies = (st.applies || []).filter((a) => notices[a.notice_id])
    const may_apply = (st.may_apply || []).filter((m) => notices[m.notice_id])
    const out = { ...st, applies, may_apply }
    if (applies.length === (st.applies || []).length && may_apply.length === (st.may_apply || []).length) return out
    const worst = applies.map((a) => notices[a.notice_id]).sort(noticesWorstFirst)[0]
    const set = (code) => ({ status: code, label: labelFor(code), rank: rankFor(code) })
    if (worst) {
      return { ...out, ...set(worst.status), headline_notice_id: worst.id, source_status_text: worst.status_text ?? null }
    }
    if (may_apply.length) {
      return { ...out, ...set('may_apply'), headline_notice_id: may_apply[0].notice_id, source_status_text: null }
    }
    if (st.status === 'open' || st.status === 'unknown') return out
    return {
      ...out,
      ...set('unknown'),
      headline_notice_id: null,
      source_status_text: null,
      reason: 'quote_check_failed',
      reason_text: GUARD_REASON,
    }
  })
  return { ...body, notices, schools, district_notices: guardNotices(body.district_notices) }
}

const capital = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '')

export function regionLineText(n) {
  if (n.scope === 'province') return 'This notice names every NLSchools school in the province.'
  if (n.scope === 'region' && n.scope_region) return `This notice names the whole ${capital(n.scope_region)} region.`
  return null
}

/** "On the NLSchools list since 6:42 AM · NLSchools doesn't show a posted time", or "Posted …". */
export function seenLineText(n, now) {
  if (n.posted_text) return `Posted ${n.posted_text}`
  const t = fmtWhen(n.first_seen_at, now)
  if (n.source_id === 'nlschools-status') return `On the NLSchools list since ${t} · NLSchools doesn't show a posted time`
  if (n.source_id === 'nlschools-notices') {
    return `On the NLSchools home page since ${t} · NLSchools doesn't show a posted time`
  }
  return `First seen at ${t}`
}

export function statusLabel(code, label, size = 'big') {
  return el(
    'p',
    { class: `status-label status-label-${size} tone-${code}`, 'data-testid': 'status-label' },
    statusIcon(code, size === 'big' ? 38 : 24),
    el('span', {}, label || labelFor(code)),
  )
}

export function quoteBlock(n) {
  return el(
    'figure',
    { class: 'quote-figure' },
    el('blockquote', { class: 'quote', 'data-testid': 'quote' }, n.quote),
    el('figcaption', { class: 'quote-source' }, `Source: ${sourceName(n.source_id)}`),
  )
}

export function noticeLink(n, text = 'Read the notice') {
  return el('a', { class: 'button-link', href: href('notice.html', { id: n.id }) }, text)
}

/**
 * One applying notice inside a school card. The first one is the card's headline and is shown in full. Any other
 * applying notice is compact: label, the STATUS text verbatim, the region line if any, a Read the notice link, and
 * its words behind a tap-to-show details.
 */
function noticeBlock(n, how, now, primary) {
  const region = how === 'region' || how === 'province' ? regionLineText(n) : null
  const regionLine = region ? el('p', { class: 'region-line', 'data-testid': 'region-wide-line' }, region) : null
  const attrs = { 'data-notice-id': n.id, 'data-notice-status': n.status }
  if (primary) {
    return el(
      'div',
      { class: 'notice-block is-headline', ...attrs },
      quoteBlock(n),
      regionLine,
      el('p', { class: 'seen-line' }, seenLineText(n, now)),
      noticeLink(n),
    )
  }
  return el(
    'div',
    { class: 'notice-block is-compact', ...attrs },
    el(
      'p',
      { class: `notice-mini-label tone-${n.status}` },
      statusIcon(n.status, 22),
      el('span', {}, labelFor(n.status)),
      n.status_text ? el('span', { class: 'verbatim small' }, ` · ${n.status_text}`) : null,
    ),
    regionLine,
    el(
      'details',
      { class: 'notice-words' },
      el('summary', { class: 'notice-words-summary' }, "Show the notice's words"),
      quoteBlock(n),
      el('p', { class: 'seen-line' }, seenLineText(n, now)),
    ),
    noticeLink(n),
  )
}

/** "This notice may apply to your school": an outlined card, never a status. */
export function mayApplyCard(n, reasonText, now) {
  const named = [n.school_text, n.community_text].filter(Boolean).join(', ')
  return el(
    'div',
    { class: 'may-apply', 'data-testid': 'may-apply', 'data-notice-id': n.id },
    el('p', { class: 'may-title' }, statusIcon('may_apply', 24), el('span', {}, 'This notice may apply to your school')),
    el('p', { class: 'may-reason' }, reasonText),
    named ? el('p', { class: 'small' }, 'The notice names: ', el('span', { class: 'verbatim' }, named)) : null,
    quoteBlock(n),
    el('p', { class: 'seen-line' }, seenLineText(n, now)),
    noticeLink(n),
  )
}

/** One card per school on My schools (API.md §8.1). */
export function schoolCard(st, notices, now) {
  const s = st.school
  const place = [s.community, s.region_name, s.board && s.board !== 'NLSchools' ? s.board : null]
    .filter(Boolean)
    .join(' · ')
  const card = el(
    'article',
    { class: `card school-card tone-edge-${st.status}`, 'data-testid': 'school-card', 'data-status': st.status, 'data-school-id': s.id },
    el('h2', { class: 'school-name' }, s.name),
    place ? el('p', { class: 'school-place' }, place) : null,
    statusLabel(st.status, st.label),
    st.source_status_text
      ? el(
          'p',
          { class: 'source-status' },
          'On the list as ',
          el('span', { class: 'verbatim', 'data-testid': 'source-status-text' }, st.source_status_text),
        )
      : null,
  )

  // Only `applies` notices decide the status. `may_apply` notices are shown apart, never as applied.
  const applied = (st.applies || [])
    .map((a) => ({ how: a.how, n: notices[a.notice_id] }))
    .filter((x) => x.n)
    .sort((a, b) => noticesWorstFirst(a.n, b.n))
    // The API's headline notice leads, so the card agrees with it when two notices share a rank.
    .sort((a, b) => (b.n.id === st.headline_notice_id) - (a.n.id === st.headline_notice_id))
  applied.forEach(({ n, how }, i) => card.append(noticeBlock(n, how, now, i === 0)))

  if (st.reason_text) card.append(el('p', { class: 'reason', 'data-testid': 'reason' }, st.reason_text))
  if (st.as_of && st.status !== 'unknown') {
    const t = fmtWhen(st.as_of, now)
    const text =
      st.status === 'open'
        ? `No notice on the NLSchools list as of ${t}`
        : st.stale
          ? `As of ${t}, the last good check`
          : `As of ${t}`
    card.append(el('p', { class: 'as-of', 'data-testid': 'as-of' }, text))
  }

  for (const m of st.may_apply || []) {
    const n = notices[m.notice_id]
    if (n) card.append(mayApplyCard(n, m.reason_text, now))
  }

  if (st.unmatched_in_region > 0) {
    const k = st.unmatched_in_region
    card.append(
      el(
        'p',
        { class: 'unmatched', 'data-testid': 'unmatched-count' },
        `${k} notice${k === 1 ? '' : 's'} in the ${s.region_name} region couldn't be matched to a school. `,
        el('a', { class: 'inline-link', href: href('today.html') }, 'See Today'),
      ),
    )
  }
  return card
}

/** A district notice (no school, no region): shown at the top of My schools and Today. */
export function districtNotice(n, now) {
  return el(
    'section',
    { class: 'card district-notice', 'data-testid': 'district-notice', 'data-notice-id': n.id },
    el('h2', { class: 'card-title' }, 'NLSchools notice'),
    quoteBlock(n),
    el('p', { class: 'seen-line' }, seenLineText(n, now)),
    noticeLink(n),
  )
}

/** A notice on Today's list. */
export function todayNotice(n, now, { heading = 'school' } = {}) {
  const named = [n.school_text, n.community_text].filter(Boolean).join(', ')
  const region = regionLineText(n)
  const exact = (n.applies_to || []).filter((a) => a.how === 'exact')
  const may = (n.applies_to || []).filter((a) => a.how === 'may_apply')
  return el(
    'article',
    { class: `card today-notice tone-edge-${n.status}`, 'data-testid': 'today-notice', 'data-notice-id': n.id, 'data-status': n.status },
    heading === 'school' && named ? el('h3', { class: 'today-school verbatim' }, named) : null,
    statusLabel(n.status, labelFor(n.status), 'mid'),
    n.status_text
      ? el('p', { class: 'source-status' }, 'On the list as ', el('span', { class: 'verbatim', 'data-testid': 'source-status-text' }, n.status_text))
      : null,
    quoteBlock(n),
    region ? el('p', { class: 'region-line', 'data-testid': 'region-wide-line' }, region) : null,
    exact.length
      ? el('p', { class: 'small' }, 'Matches: ', exact.map((a) => [a.community ? `${a.name} (${a.community})` : a.name]).join('; '))
      : null,
    may.length
      ? el('p', { class: 'small may-line' }, 'May apply to: ', may.map((a) => (a.community ? `${a.name} (${a.community})` : a.name)).join('; '))
      : null,
    el('p', { class: 'seen-line' }, seenLineText(n, now)),
    n.removed_at ? el('p', { class: 'small' }, `No longer on the list since ${fmtWhen(n.removed_at, now)}`) : null,
    noticeLink(n),
  )
}
