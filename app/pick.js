// Pick your schools (pick.html, API.md §8.1). Search as you type, tap to add or remove, Done goes back.
import { api } from './client.js'
import { el, put, mountChrome, renderStale, errorCard, main } from './common.js'
import { href } from './params.js'
import { loadIds, saveIds, storageWorks, MAX_SCHOOLS } from './store.js'
import { searchKey } from './text.js'

mountChrome(null)
api
  .getSources()
  .then((b) => renderStale(b.sources))
  .catch(() => {})

const root = main()
const RESULT_LIMIT = 40
let schools = null
let byId = {}
let ids = loadIds()

const selectedBox = el('section', { class: 'card', 'data-testid': 'pick-selected', 'aria-label': 'Your schools' })
const search = el('input', {
  id: 'pick-search',
  class: 'search',
  type: 'search',
  autocomplete: 'off',
  spellcheck: 'false',
  placeholder: 'School name or community',
  'data-testid': 'pick-search',
})
const note = el('p', { class: 'small', 'aria-live': 'polite' })
const results = el('div', { class: 'results' })

function doneHref() {
  return href('index.html', storageWorks() ? {} : { ids: ids.join(',') })
}
const done = el('a', { class: 'button primary', href: doneHref() }, 'Done')

function meta(s) {
  const bits = [s.community, s.region_name, s.board, s.grades_text ? `Grades ${s.grades_text}` : null]
  return bits.filter(Boolean).join(' · ')
}

function renderSelected() {
  const title = el('h2', { class: 'card-title' }, `Your schools (${ids.length})`)
  if (ids.length === 0) {
    put(selectedBox, title, el('p', { class: 'small' }, 'No schools picked yet. Search below.'))
  } else {
    put(
      selectedBox,
      title,
      el(
        'ul',
        { class: 'list-plain' },
        ids.map((id) => {
          const s = byId[id]
          const name = s ? s.name : id
          return el(
            'li',
            { class: 'selected-item', 'data-school-id': id },
            el('span', {}, el('strong', {}, name), s?.community ? el('span', { class: 'small' }, ` · ${s.community}`) : null),
            el('button', { class: 'button quiet', type: 'button', 'aria-label': `Remove ${name}`, onclick: () => toggle(id) }, 'Remove'),
          )
        }),
      ),
    )
  }
  if (!storageWorks()) selectedBox.append(el('p', { class: 'reason' }, "This browser won't remember your schools."))
  done.setAttribute('href', doneHref())
}

function resultButton(s) {
  const on = ids.includes(s.id)
  return el(
    'button',
    {
      class: 'result',
      type: 'button',
      'data-testid': 'pick-result',
      'data-school-id': s.id,
      'aria-pressed': String(on),
      onclick: () => toggle(s.id),
    },
    el(
      'span',
      { class: 'result-text' },
      el('span', { class: 'result-name' }, s.name),
      el('span', { class: 'result-meta' }, meta(s)),
      s.coverage === 'none' ? el('span', { class: 'result-meta' }, 'No official closure list, call the school') : null,
      s.coverage === 'csfp' ? el('span', { class: 'result-meta' }, "CSFP schools don't post closures online") : null,
    ),
    el('span', { class: 'result-state' }, on ? 'Added' : 'Add'),
  )
}

function renderResults() {
  if (!schools) {
    put(results, el('p', { class: 'small' }, 'Loading schools…'))
    return
  }
  const words = searchKey(search.value).split(' ').filter(Boolean)
  if (words.length === 0) {
    put(results, el('p', { class: 'small' }, 'Type part of a school name or a community.'))
    return
  }
  const found = schools.filter((s) => {
    const key = searchKey(`${s.name} ${s.community ?? ''}`)
    return words.every((w) => key.includes(w))
  })
  if (found.length === 0) {
    put(results, el('p', { class: 'small' }, 'No school matches that. Try fewer letters.'))
    return
  }
  put(
    results,
    el(
      'p',
      { class: 'small' },
      found.length > RESULT_LIMIT ? `Showing ${RESULT_LIMIT} of ${found.length}. Type more to narrow it.` : `${found.length} found`,
    ),
    found.slice(0, RESULT_LIMIT).map(resultButton),
  )
}

function toggle(id) {
  if (ids.includes(id)) {
    ids = ids.filter((x) => x !== id)
    note.textContent = `Removed ${byId[id]?.name ?? 'the school'}.`
  } else if (ids.length >= MAX_SCHOOLS) {
    note.textContent = `You can pick up to ${MAX_SCHOOLS} schools. Remove one first.`
    return
  } else {
    ids = [...ids, id]
    note.textContent = `Added ${byId[id]?.name ?? 'the school'}.`
  }
  saveIds(ids)
  renderSelected()
  // Update the result buttons in place so the list doesn't jump under the finger.
  for (const b of results.querySelectorAll('[data-testid="pick-result"]')) {
    const on = ids.includes(b.dataset.schoolId)
    b.setAttribute('aria-pressed', String(on))
    b.querySelector('.result-state').textContent = on ? 'Added' : 'Add'
  }
}

put(
  root,
  el(
    'div',
    { class: 'narrow' },
    el('h1', { class: 'page-title' }, 'Pick your schools'),
    el('p', { class: 'lead' }, `Search, then tap a school to add it. Up to ${MAX_SCHOOLS} schools.`),
    selectedBox,
    el('label', { class: 'search-label', for: 'pick-search' }, 'Find a school'),
    search,
    note,
    results,
    el('div', { class: 'done-bar' }, done),
  ),
)
search.addEventListener('input', renderResults)
renderSelected()
renderResults()

async function loadSchools() {
  try {
    const body = await api.getSchools()
    schools = [...body.schools].sort((a, b) => a.name.localeCompare(b.name))
    byId = Object.fromEntries(schools.map((s) => [s.id, s]))
    renderSelected()
    renderResults()
  } catch (e) {
    put(results, errorCard(`The school list didn't load (${e.message}).`, loadSchools))
  }
}
loadSchools()
