// The provincial school list (API.md §5.3), from core/schools-data.js (generated from data/schools.json).
import { SCHOOLS_DATA } from './schools-data.js'
import { REGIONS } from './labels.js'

export const SCHOOLS = SCHOOLS_DATA.schools
export const SCHOOL_BY_ID = new Map(SCHOOLS.map(s => [s.id, s]))
export const REGION_NAMES = { avalon: 'Avalon', central: 'Central', western: 'Western', labrador: 'Labrador' }
export { REGIONS }

const FIELDS = ['id', 'name', 'community', 'region', 'region_name', 'board', 'coverage', 'type_code', 'grades_text',
  'phone', 'operator', 'source_id', 'source_url']

/** §5.3 fields only (`operator` only when the school has one). */
export function publicSchool (s) {
  const out = {}
  for (const f of FIELDS) {
    if (f === 'operator' && (s.operator === undefined || s.operator === null)) continue
    out[f] = s[f] ?? null
  }
  return out
}

export function schoolsInRegion (region, schools = SCHOOLS) {
  return schools.filter(s => s.coverage === 'nlschools' && s.region === region)
}

export function schoolCounts (schools = SCHOOLS) {
  const by = (k) => schools.reduce((acc, s) => { const v = s[k] ?? 'none'; acc[v] = (acc[v] ?? 0) + 1; return acc }, {})
  return { total: schools.length, by_coverage: by('coverage'), by_board: by('board'), by_region: by('region') }
}
