// Fixed status table (API.md §4.1), phrase tables (§4.3) and whole-region phrases (§4.4).
import { normText, wordTokens } from './text.js'

export const STATUSES = [
  { code: 'closed', label: 'Closed', rank: 1 },
  { code: 'closed_part', label: 'Closed part of the day', rank: 2 },
  { code: 'buses_cancelled', label: 'Buses cancelled', rank: 3 },
  { code: 'early_dismissal', label: 'Closing early', rank: 4 },
  { code: 'delayed', label: 'Delayed opening', rank: 5 },
  { code: 'buses_delayed', label: 'Buses delayed', rank: 6 },
  { code: 'other', label: 'Other notice, read it', rank: 7 },
  { code: 'may_apply', label: 'A notice may apply', rank: 8 },
  { code: 'unknown', label: 'Unknown', rank: 9 },
  { code: 'open', label: 'Open, no notice', rank: 10 }
]
export const STATUS = Object.fromEntries(STATUSES.map(s => [s.code, s]))
export const rankOf = code => STATUS[code]?.rank ?? STATUS.other.rank
export const labelOf = code => STATUS[code]?.label ?? STATUS.other.label

/** NLSchools status CSS class → code. */
export const CLASS_STATUS = {
  closedAllDay: 'closed',
  closedForPD: 'closed',
  closedForHoliday: 'closed',
  closedForMorning: 'closed_part',
  closedForAfternoon: 'closed_part',
  closingEarly: 'early_dismissal',
  delayedOpening: 'delayed',
  busDelayed: 'buses_delayed',
  otherStatus: 'other'
}

/**
 * §4.1 for a status row. A class in the table decides. Otherwise the STATUS text rules; otherwise `other`.
 * → { status, status_basis, status_evidence, unmapped_class }
 */
export function statusFromRow (statusClass, statusText) {
  if (statusClass && Object.hasOwn(CLASS_STATUS, statusClass)) {
    return { status: CLASS_STATUS[statusClass], status_basis: 'class', status_evidence: statusClass, unmapped_class: null }
  }
  const unmapped_class = statusClass || null
  const text = normText(statusText)
  const up = text.toUpperCase()
  const starts = (...p) => p.some(x => up.startsWith(x))
  let status = null
  if (starts('CLOSED ALL DAY', 'CLOSED FOR PD', 'CLOSED FOR HOLIDAY')) status = 'closed'
  else if (starts('CLOSED FOR MORNING', 'CLOSED FOR AFTERNOON')) status = 'closed_part'
  else if (up.includes('BUS') && (up.includes('CANCELLED') || up.includes('CANCELED'))) status = 'buses_cancelled'
  else if (starts('CLOSING EARLY', 'EARLY DISMISSAL')) status = 'early_dismissal'
  else if (starts('DELAYED OPENING')) status = 'delayed'
  else if (up.includes('BUS') && up.includes('DELAY')) status = 'buses_delayed'
  if (status) return { status, status_basis: 'status_text', status_evidence: text, unmapped_class }
  return { status: 'other', status_basis: 'none', status_evidence: null, unmapped_class }
}

export const PHRASES = {
  closed_part: ['closed for the morning', 'closed this morning', 'closed for morning', 'closed for the afternoon',
    'closed this afternoon', 'closed for afternoon'],
  early_dismissal: ['closing early', 'early dismissal', 'dismissed early', 'dismissing early', 'will close early'],
  buses_cancelled: ['buses cancelled', 'buses canceled', 'bus cancelled', 'bus canceled', 'busing cancelled',
    'busing canceled', 'no busing', 'buses will not run', 'bus service cancelled'],
  buses_delayed: ['buses delayed', 'buses will be delayed', 'bus delayed', 'runs will be delayed'],
  delayed: ['delayed opening', 'delayed start', 'will open late', 'opening late'],
  closed: ['closed all day', 'closed for the day', 'closed today', 'will be closed', 'are closed', 'is closed',
    'remain closed']
}

export const CSFP_WORDS = ['ferme', 'fermee', 'fermees', 'fermes', 'fermeture', 'ouverture retardee', 'retard',
  'annule', 'annulee', 'annulation', 'intemperies', 'tempete', 'closed', 'closure', 'delayed', 'cancelled']

export const REGIONS = ['avalon', 'central', 'western', 'labrador']
const REGION_TEMPLATES = ['all schools in the {R} region', 'all schools in {R} region', 'all {R} region schools',
  'all {R} schools', '{R} region schools', 'schools in the {R} region']
const PROVINCE_PHRASES = ['all nlschools schools', 'all schools in the province', 'all schools province wide']

/**
 * Whole-word phrase search on normName words, longest phrase first; each match blanks its words.
 * `entries` = [{ phrase, value }]. → [{ value, evidence (verbatim slice of s), start }] in match order.
 */
export function findPhrases (s, entries) {
  const str = String(s ?? '')
  const toks = wordTokens(str)
  const used = new Array(toks.length).fill(false)
  const sorted = entries
    .map((e, i) => ({ ...e, words: e.phrase.split(' '), i }))
    .sort((a, b) => b.words.length - a.words.length || a.i - b.i)
  const found = []
  for (const e of sorted) {
    const n = e.words.length
    for (let i = 0; i + n <= toks.length; i++) {
      let ok = true
      for (let k = 0; k < n; k++) {
        if (used[i + k] || toks[i + k].norm !== e.words[k]) { ok = false; break }
      }
      if (!ok) continue
      for (let k = 0; k < n; k++) used[i + k] = true
      found.push({ value: e.value, phrase: e.phrase, evidence: str.slice(toks[i].start, toks[i + n - 1].end), start: toks[i].start })
      i += n - 1
    }
  }
  return found
}

const PHRASE_ENTRIES = Object.entries(PHRASES).flatMap(([code, list]) => list.map(phrase => ({ phrase, value: code })))

/** §4.3 for text notices. → { status, status_basis, status_evidence } */
export function statusFromPhrases (quote) {
  const found = findPhrases(quote, PHRASE_ENTRIES)
  const codes = new Set(found.map(f => f.value))
  if (codes.size !== 1) return { status: 'other', status_basis: 'none', status_evidence: null }
  const first = found.sort((a, b) => a.start - b.start)[0]
  return { status: first.value, status_basis: 'phrase', status_evidence: first.evidence }
}

const REGION_ENTRIES = [
  ...REGIONS.flatMap(r => REGION_TEMPLATES.map(t => ({ phrase: t.replace('{R}', r), value: { scope: 'region', scope_region: r } }))),
  ...PROVINCE_PHRASES.map(phrase => ({ phrase, value: { scope: 'province', scope_region: null } }))
]

/**
 * §4.4. → { scope: 'region'|'province', scope_region, scope_evidence } for the earliest phrase in the text, or null.
 * `ambiguous` is true when the text names more than one different region/province (see build report).
 */
export function findRegionPhrase (text) {
  const found = findPhrases(text, REGION_ENTRIES).sort((a, b) => a.start - b.start)
  if (!found.length) return null
  const kinds = new Set(found.map(f => `${f.value.scope}:${f.value.scope_region}`))
  return { ...found[0].value, scope_evidence: found[0].evidence, ambiguous: kinds.size > 1 }
}

/** True when a CSFP_WORDS word (or phrase) is in the text, on normName words. */
export function hasCsfpWord (text) {
  return findPhrases(text, CSFP_WORDS.map(phrase => ({ phrase, value: phrase }))).length > 0
}
