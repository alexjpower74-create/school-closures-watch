// School matching (API.md §4.2). Anything short of one exact name + community match is "may apply", never applied.
import { normName, normCommunity } from './text.js'

export { normName, normCommunity }

export const STOP = new Set([
  'school',
  'academy',
  'elementary',
  'primary',
  'high',
  'collegiate',
  'all',
  'grade',
  'the',
  'of',
  'and',
  'st',
  'saint',
  'memorial',
  'regional',
  'junior',
  'senior',
  'intermediate',
  'middle',
  'centre',
  'center',
  'k',
  '12',
  'nl',
])

export const MAX_SIMILAR = 5

const keyOf = (s) =>
  new Set(
    normName(s)
      .split(' ')
      .filter((w) => w && !STOP.has(w)),
  )
export const nameKey = (s) => [...keyOf(s)]

const subset = (a, b) => [...a].every((x) => b.has(x))
const shares = (a, b) => [...a].some((x) => b.has(x))

const cache = new WeakMap()
function prepared(school) {
  let p = cache.get(school)
  if (!p) {
    p = { name: normName(school.name), community: normCommunity(school.community), key: keyOf(school.name) }
    cache.set(school, p)
  }
  return p
}

/**
 * Match one NLSchools status row to `schools` (callers pass NLSchools schools only).
 * → { matches: [{ school_id, how: 'exact'|'may_apply', reason }], unmatched_reason: null|'no_school'|'too_many' }
 * The whole-region check for rows with no match is done by the caller (core/notice.js).
 */
export function matchRow({ school_text, community_text }, schools) {
  const name = normName(school_text)
  const community = community_text ? normCommunity(community_text) : ''
  const may = (list, reason) => ({
    matches: list.map((s) => ({ school_id: s.id, how: 'may_apply', reason })),
    unmatched_reason: null,
  })

  const same = name ? schools.filter((s) => prepared(s).name === name) : []
  const exact = community ? same.filter((s) => prepared(s).community === community) : []
  if (exact.length === 1) return { matches: [{ school_id: exact[0].id, how: 'exact', reason: null }], unmatched_reason: null }
  if (same.length === 1) return may(same, 'name_same_community_differs')
  if (same.length > 1) return may(exact.length > 1 ? exact : same, 'name_shared')

  const rowKey = keyOf(school_text)
  const similar = schools.filter((s) => {
    const p = prepared(s)
    if (rowKey.size && p.key.size && (subset(rowKey, p.key) || subset(p.key, rowKey))) return true
    return !!community && community === p.community && shares(rowKey, p.key)
  })
  if (similar.length > MAX_SIMILAR) return { matches: [], unmatched_reason: 'too_many' }
  if (similar.length) return may(similar, 'name_similar')
  return { matches: [], unmatched_reason: 'no_school' }
}

/** CSFP short names (§4.2), matched on normName words. A French elision (l', d') before the name also counts. */
export const CSFP_SHORT = [
  ['boreale', 'École Boréale'],
  ['envol', "École l'ENVOL"],
  ['notre dame du cap', 'École Notre-Dame-du-Cap'],
  ['sainte anne', 'École Sainte-Anne'],
  ['rocher du nord', 'École Rocher-du-Nord'],
  ['grands vents', 'École des Grands-Vents'],
]

/** CSFP schools named in `text` → [school]. */
export function csfpSchoolsNamed(text, schools) {
  const t = normName(text)
  const out = []
  for (const [short, fullName] of CSFP_SHORT) {
    if (!new RegExp(`(?:^| )[ld]?${short}(?= |$)`).test(t)) continue
    const school = schools.find((s) => s.coverage === 'csfp' && normName(s.name) === normName(fullName))
    if (school && !out.includes(school)) out.push(school)
  }
  return out
}
