// Today (today.html, API.md §8.1): the whole NLSchools list by region, plus CSFP posts.
import { api } from './client.js'
import { el, put, mountChrome, renderStale, errorCard, main } from './common.js'
import { guardNotices, districtNotice, todayNotice } from './render.js'
import { noticesWorstFirst } from './labels.js'
import { fmtWhen } from './format.js'

mountChrome('today')
const root = main()
const wide = () => window.matchMedia('(min-width: 900px)').matches

function regionSection(r, now) {
  const notices = guardNotices(r.notices).sort(noticesWorstFirst)
  const unmatched = guardNotices(r.unmatched).sort(noticesWorstFirst)
  const earlier = guardNotices(r.earlier).sort(noticesWorstFirst)
  const count = notices.length + unmatched.length
  return el(
    'details',
    { class: 'region-section', 'data-testid': 'region-section', 'data-region': r.region, open: wide() },
    el(
      'summary',
      { class: 'region-summary' },
      el('span', {}, `${r.region_name} · ${count === 0 ? 'no notices' : `${count} notice${count === 1 ? '' : 's'}`}`),
    ),
    el(
      'div',
      { class: 'region-body' },
      count === 0 ? el('p', { class: 'empty' }, 'No school in this region is on the list.') : null,
      el('div', { 'data-testid': 'region-current' }, notices.map((n) => todayNotice(n, now))),
      unmatched.length
        ? el('div', { 'data-testid': 'region-unmatched' }, el('h3', {}, 'Not matched to a school in the provincial list'), unmatched.map((n) => todayNotice(n, now)))
        : null,
      earlier.length
        ? el('div', { 'data-testid': 'region-earlier' }, el('h3', {}, 'Earlier today (no longer listed)'), earlier.map((n) => todayNotice(n, now)))
        : null,
    ),
  )
}

/** Anything to show for a region: current notices, unmatched notices or earlier (removed) ones. */
function hasNotices(r) {
  return guardNotices(r.notices).length + guardNotices(r.unmatched).length + guardNotices(r.earlier).length > 0
}

/**
 * Regions with notices go in the grid, in the contract's order. Regions with none share one compact line
 * ("No notices: Avalon, Labrador"), so an empty card never sits beside a tall one. Every region keeps its
 * region-section hook and data-region.
 */
function regionsBlock(regions, now) {
  const busy = regions.filter(hasNotices)
  const quiet = regions.filter((r) => !hasNotices(r))
  return [
    busy.length
      ? el('div', { class: `grid${busy.length > 1 ? ' two' : ''}` }, busy.map((r) => regionSection(r, now)))
      : null,
    quiet.length
      ? el(
          'p',
          { class: 'empty-regions', 'data-testid': 'empty-regions' },
          'No notices: ',
          quiet.map((r, i) => [
            i ? ', ' : '',
            el('span', { class: 'verbatim', 'data-testid': 'region-section', 'data-region': r.region }, r.region_name),
          ]),
        )
      : null,
  ]
}

async function load() {
  let body
  try {
    body = await api.getToday()
  } catch (e) {
    put(root, errorCard(`Today's list didn't load (${e.message}).`, load))
    return
  }
  renderStale(body.sources)
  const now = body.now
  const nls = (body.sources || []).find((s) => s.id === 'nlschools-status')
  const checked = fmtWhen(nls?.last_ok_at, now) || 'never'
  const district = guardNotices(body.district)
  const regionWide = guardNotices(body.region_wide)
  const csfp = guardNotices(body.csfp)
  const regionCount = (body.regions || []).reduce(
    (k, r) => k + guardNotices(r.notices).length + guardNotices(r.unmatched).length,
    0,
  )
  const empty = district.length + regionWide.length + regionCount === 0

  put(root, 
    el('h1', { class: 'page-title' }, 'Today'),
    el(
      'p',
      { class: 'lead' },
      'NLSchools list for ',
      el('span', { class: 'verbatim' }, body.list_date_text || 'a day we couldn’t read'),
      ` · checked ${checked}`,
    ),
    empty
      ? el(
          'section',
          { class: 'card tone-edge-open', 'data-testid': 'today-empty' },
          el('h2', { class: 'card-title' }, 'No schools are on the NLSchools list right now'),
          body.open_rule_quote
            ? el(
                'figure',
                { class: 'quote-figure' },
                el('blockquote', { class: 'quote', 'data-testid': 'open-rule-quote' }, body.open_rule_quote),
                el('figcaption', { class: 'quote-source' }, 'Source: NLSchools School Status Report'),
              )
            : el('p', { class: 'reason' }, "The NLSchools page no longer says unlisted schools are open, so we can't say they are."),
          el('p', {}, `checked ${checked}`),
          el(
            'p',
            { class: 'small' },
            'NLSchools only lists schools that are closed, delayed or have another notice. At night, on a weekend or on a calm day an empty list is the normal result.',
          ),
        )
      : null,
    district.map((n) => districtNotice(n, now)),
    regionWide.length
      ? [el('h2', { class: 'card-title' }, 'Notices for a whole region'), regionWide.map((n) => todayNotice(n, now))]
      : null,
    regionsBlock(body.regions || [], now),
    el(
      'section',
      { class: 'card', 'data-testid': 'csfp-section' },
      el('h2', { class: 'card-title' }, 'CSFP (French-language) schools'),
      csfp.length
        ? [
            el('p', { class: 'small' }, 'These news posts mention a closure. They may apply to a CSFP school.'),
            csfp.map((n) => todayNotice(n, now, { heading: 'none' })),
          ]
        : el(
            'p',
            {},
            "No recent CSFP news post mentions a closure. CSFP schools don't post closures online; the school tells families directly.",
          ),
    ),
  )
}

load()
