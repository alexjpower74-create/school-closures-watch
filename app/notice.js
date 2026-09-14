// Notice (notice.html?id=, API.md §8.1): everything we know about one notice, in the source's words.
import { api } from './client.js'
import { el, put, mountChrome, renderStale, errorCard, main } from './common.js'
import { href, params } from './params.js'
import { guardNotices, statusLabel, quoteBlock, regionLineText, seenLineText } from './render.js'
import { labelFor } from './labels.js'
import { fmtWhen } from './format.js'

mountChrome(null)
const root = main()
const id = params.get('id')

const HOW_WORDS = {
  exact: 'named on the list',
  region: 'the notice names the whole region',
  province: 'the notice names the whole province',
}

function row(term, ...value) {
  return [el('dt', {}, term), el('dd', {}, ...value)]
}

function schoolText(s) {
  return s.community ? `${s.name} (${s.community})` : s.name
}

async function load() {
  api
    .getSources()
    .then((b) => renderStale(b.sources))
    .catch(() => {})
  if (!id) {
    put(root, errorCard('No notice was named in the link.', null))
    return
  }
  let body
  try {
    body = await api.getNotice(id)
  } catch (e) {
    if (e.status === 404) {
      put(root, 
        el('section', { class: 'card' }, el('h1', { class: 'page-title' }, 'Notice not found'),
          el('p', {}, 'We no longer keep that notice. It may be from an older list.'),
          el('a', { class: 'button-link', href: href('today.html') }, "See today's list")),
      )
    } else put(root, errorCard(`The notice didn't load (${e.message}).`, load))
    return
  }
  const n = body.notice
  if (guardNotices([n]).length === 0) {
    put(root, 
      el('section', { class: 'card' }, el('h1', { class: 'page-title' }, "This notice can't be shown"),
        el('p', {}, "Its words didn't match the copy we saved from the source, so we don't show it. Check the official page."),
        body.source?.human_url ? el('a', { class: 'button-link', href: body.source.human_url }, `Open ${body.source.name}`) : null),
    )
    return
  }
  const now = null // notice times show the day when it isn't obvious
  const src = body.source || {}
  const named = [n.school_text, n.community_text].filter(Boolean).join(', ')
  const region = regionLineText(n)
  const isNls = n.source_id?.startsWith('nlschools')

  put(root, 
    el(
      'article',
      { class: 'card narrow', 'data-testid': 'notice-detail', 'data-notice-id': n.id, 'data-status': n.status },
      el('p', { class: 'small' }, src.name || n.source_id),
      el('h1', { class: 'page-title verbatim' }, named || n.title || 'Notice'),
      statusLabel(n.status, labelFor(n.status)),
      n.status_text
        ? el('p', { class: 'source-status' }, 'On the list as ', el('span', { class: 'verbatim', 'data-testid': 'source-status-text' }, n.status_text))
        : null,
      quoteBlock(n),
      region ? el('p', { class: 'region-line', 'data-testid': 'region-wide-line' }, region) : null,
      n.removed_at
        ? el('p', { class: 'reason', 'data-testid': 'removed-at' }, `No longer on the list since ${fmtWhen(n.removed_at, now)}`)
        : null,
      el(
        'dl',
        { class: 'dl' },
        row('Official page', el('a', { href: n.link || src.human_url, rel: 'noopener' }, `Open ${src.name || 'the source'}`)),
        n.list_date_text ? row('List for', el('span', { class: 'verbatim' }, n.list_date_text)) : null,
        row('Full row text', el('span', { class: 'verbatim', 'data-testid': 'source-text' }, n.source_text)),
        n.family_text ? row('Family', el('span', { class: 'verbatim' }, n.family_text)) : null,
        n.region_text ? row('Region', el('span', { class: 'verbatim' }, n.region_text)) : null,
        row('Posted', n.posted_text ? `Posted ${n.posted_text}` : isNls ? "NLSchools doesn't show a posted time" : 'No posted time given'),
        row('First seen', fmtWhen(n.first_seen_at, now) || 'Not recorded'),
        row('Last seen', fmtWhen(n.last_seen_at, now) || 'Not recorded'),
        n.removed_at ? row('Removed', `No longer on the list since ${fmtWhen(n.removed_at, now)}`) : null,
      ),
      el('p', { class: 'seen-line' }, seenLineText(n, now)),
      el('h2', { class: 'card-title' }, 'Applies to'),
      body.applies_to?.length
        ? el('ul', { 'data-testid': 'applies-to' }, body.applies_to.map((a) => el('li', {}, `${schoolText(a.school)}: ${HOW_WORDS[a.how] || a.how}`)))
        : el('p', { class: 'small', 'data-testid': 'applies-to' }, 'No school for certain.'),
      body.may_apply_to?.length
        ? [
            el('h2', { class: 'card-title' }, 'May apply to'),
            el('ul', { 'data-testid': 'may-apply-to' }, body.may_apply_to.map((m) => el('li', {}, `${schoolText(m.school)}: ${m.reason_text}`))),
          ]
        : null,
      el('h2', { class: 'card-title' }, 'Saved copies'),
      (body.raw_links || []).length
        ? el(
            'ul',
            {},
            body.raw_links.map((r) => {
              const link = api.rawHref(r.href)
              const when = fmtWhen(r.fetched_at, now)
              return el(
                'li',
                {},
                link
                  ? el('a', { href: link, rel: 'noopener' }, `See the saved copy${when ? ` (fetched ${when})` : ''}`)
                  : el('span', { class: 'small' }, `${r.raw_ref} (test data: no saved copy)`),
              )
            }),
          )
        : el('p', { class: 'small' }, 'No saved copy is kept for this notice any more.'),
      el('a', { class: 'button-link', href: href('today.html') }, "Back to today's list"),
    ),
  )
}

load()
