// My schools (index.html, API.md §8.1): one card per saved school, worst first.
import { api } from './client.js'
import { el, put, mountChrome, renderStale, errorCard, main } from './common.js'
import { href } from './params.js'
import { loadIds, storageWorks } from './store.js'
import { guardStatusBody, schoolCard, districtNotice } from './render.js'
import { byRankThenName } from './labels.js'
import { fmtTime } from './format.js'

mountChrome('my')
const root = main()
let lastLoad = 0

function welcome() {
  put(
    root,
    el(
      'section',
      { class: 'card welcome narrow' },
      el('h1', { class: 'page-title' }, 'Is your school open today?'),
      el(
        'p',
        { class: 'lead' },
        "Pick your schools once. You'll see whether each one is open, delayed or closed, in the official source's own words.",
      ),
      el('a', { class: 'button primary', href: href('pick.html') }, 'Pick your schools'),
    ),
  )
}

async function load() {
  lastLoad = Date.now()
  const ids = loadIds()
  if (ids.length === 0) {
    welcome()
    try {
      renderStale((await api.getSources()).sources)
    } catch {
      // The banner is best-effort on the welcome screen; there is no status to protect yet.
    }
    return
  }
  let body
  try {
    body = guardStatusBody(await api.getStatus(ids))
  } catch (e) {
    put(root, errorCard(`The status service didn't answer (${e.message}).`, load))
    return
  }
  renderStale(body.sources)
  const statuses = [...body.schools].sort(byRankThenName)
  put(
    root,
    el('h1', { class: 'page-title' }, 'My schools'),
    el(
      'div',
      { class: 'toolbar' },
      el('span', { 'data-testid': 'checked-at' }, `Checked at ${fmtTime(body.now)}`),
      el('button', { class: 'button quiet', type: 'button', onclick: load }, 'Refresh'),
      el('a', { class: 'inline-link', href: href('today.html') }, "Today's full list"),
      el('a', { class: 'inline-link', href: href('pick.html') }, 'Change my schools'),
    ),
    storageWorks() ? null : el('p', { class: 'reason' }, "This browser won't remember your schools."),
    (body.district_notices || []).map((n) => districtNotice(n, body.now)),
    el(
      'div',
      { class: 'grid two' },
      statuses.map((st) => schoolCard(st, body.notices, body.now)),
    ),
  )
}

load()

// Re-fetch every 60 s while the page is visible, and on coming back to a page left for over a minute.
setInterval(() => {
  if (document.visibilityState === 'visible') load()
}, 60_000)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && Date.now() - lastLoad > 60_000) load()
})
