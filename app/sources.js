// Sources (sources.html, API.md §8.1): every registry entry, its health, terms and the coverage gaps.
import { api } from './client.js'
import { el, put, mountChrome, renderStale, errorCard, main } from './common.js'
import { KIND_WORDS } from './labels.js'
import { fmtWhen } from './format.js'

mountChrome('sources')
const root = main()

// Coverage quote (API.md §2), verbatim from csfp/transport-scolaire-2026-09-14.html.
const CSFP_RULE =
  'C’est également à la direction que revient la décision de fermer l’école lorsque les conditions atmosphériques sont mauvaises et de prendre tous les moyens possibles pour en informer les élèves, leurs parents ou leurs tuteurs le plus rapidement possible.'

const RESULT_WORDS = {
  ok: 'Worked',
  error: 'Failed',
  format_changed: "The page changed and we couldn't read it",
  never: 'Not checked yet',
}

function row(term, ...value) {
  return [el('dt', {}, term), el('dd', {}, ...value)]
}

function hostOf(url) {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

function sourceCard(s, now) {
  const used = s.kind === 'used'
  return el(
    'section',
    { class: `card${s.stale ? ' tone-edge-early_dismissal' : ''}`, 'data-testid': 'source-row', 'data-source': s.id, 'data-kind': s.kind },
    el('h2', { class: 'card-title' }, s.name),
    el('p', {}, el('span', { class: `kind kind-${s.kind}`, 'data-testid': 'source-kind' }, KIND_WORDS[s.kind] || s.kind)),
    el('p', {}, `Covers: ${s.covers}`),
    s.publisher ? el('p', { class: 'small' }, `Published by ${s.publisher}`) : null,
    s.reason ? el('p', { class: 'reason' }, s.reason) : null,
    used
      ? el(
          'dl',
          { class: 'dl' },
          row('Last check', fmtWhen(s.last_attempt_at, now) || 'Never'),
          row('Last good check', fmtWhen(s.last_ok_at, now) || 'Never'),
          row('Next check', fmtWhen(s.next_due_at, now) || 'Not scheduled'),
          row('Result', `${RESULT_WORDS[s.last_result] || s.last_result}${s.last_error ? ` (${s.last_error})` : ''}`),
          s.list_date_text ? row('List for', el('span', { class: 'verbatim' }, s.list_date_text)) : null,
          row('Notices now', String(s.notices_current ?? 0)),
        )
      : null,
    s.stale ? el('p', { class: 'reason', 'data-testid': 'source-stale-text' }, s.stale_text) : null,
    s.terms_quote
      ? el(
          'figure',
          { class: 'quote-figure' },
          el('blockquote', { class: 'quote', 'data-testid': 'terms-quote' }, s.terms_quote),
          el(
            'figcaption',
            { class: 'quote-source' },
            'Terms of use',
            s.terms_url ? [' · ', el('a', { href: s.terms_url, rel: 'noopener' }, 'Read the terms')] : null,
          ),
        )
      : used
        ? el('p', { class: 'small' }, 'No terms of use found on this site.')
        : null,
    s.human_url ? el('a', { class: 'button-link', href: s.human_url, rel: 'noopener' }, `Open ${hostOf(s.human_url)}`) : null,
  )
}

function schoolsCard(schools) {
  const c = schools?.counts || {}
  const r = c.by_region || {}
  return el(
    'section',
    { class: 'card', 'data-testid': 'schools-origin' },
    el('h2', { class: 'card-title' }, 'The school list'),
    el(
      'p',
      {},
      `${c.total ?? '?'} schools: ${c.NLSchools ?? '?'} NLSchools, ${c.CSFP ?? '?'} CSFP, ${c.Private ?? '?'} private, ${c.Indigenous ?? '?'} Indigenous and ${c.Other ?? '?'} other.`,
    ),
    Object.keys(r).length
      ? el(
          'p',
          { class: 'small' },
          `Public schools by region: Avalon ${r.avalon}, Central ${r.central}, Western ${r.western}, Labrador ${r.labrador}.`,
        )
      : null,
    el(
      'ul',
      {},
      (schools?.sources || []).map((s) =>
        el(
          'li',
          {},
          `${s.name}${s.publisher ? `, ${s.publisher}` : ''} `,
          s.page_url || s.url ? el('a', { href: s.page_url || s.url, rel: 'noopener' }, 'Open') : null,
        ),
      ),
    ),
  )
}

function gapsCard() {
  return el(
    'section',
    { class: 'card', 'data-testid': 'coverage-gaps' },
    el('h2', { class: 'card-title' }, "What we can't tell you"),
    el(
      'ul',
      {},
      el(
        'li',
        {},
        "CSFP (French-language) schools don't post closures online. The principal decides and tells families directly, so we show these schools as Unknown.",
      ),
      el('li', {}, 'Private, Indigenous and other schools have no official online closure list. Call the school.'),
      el(
        'li',
        {},
        "Bus delays and cancellations in BusPlanner need a login, so we don't read them. We only show bus notes that NLSchools puts on its own status list, in its words.",
      ),
      el('li', {}, "NLSchools doesn't show when a notice was posted. We show when we first saw it."),
    ),
    el(
      'figure',
      { class: 'quote-figure' },
      el('blockquote', { class: 'quote', lang: 'fr' }, CSFP_RULE),
      el('figcaption', { class: 'quote-source' }, 'Source: CSFP school transport page'),
    ),
  )
}

async function load() {
  let body
  try {
    body = await api.getSources()
  } catch (e) {
    put(root, errorCard(`The sources didn't load (${e.message}).`, load))
    return
  }
  renderStale(body.sources)
  put(
    root,
    el('h1', { class: 'page-title' }, 'Sources'),
    el('p', { class: 'lead' }, 'Where every status comes from, and when we last checked.'),
    el(
      'div',
      { class: 'grid two' },
      body.sources.map((s) => sourceCard(s, body.now)),
    ),
    schoolsCard(body.schools),
    gapsCard(),
  )
}

load()
