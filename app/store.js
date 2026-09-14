// Saved schools (API.md §8.2): localStorage `scw.schools.v1` = JSON array of school ids.
// Every read and write is guarded; without storage the list lives in memory and travels in the Done link (?ids=).
import { params } from './params.js'

const KEY = 'scw.schools.v1'
export const MAX_SCHOOLS = 30

let memory = null
let ok = true

export const storageWorks = () => ok

function clean(list) {
  if (!Array.isArray(list)) return []
  return [...new Set(list.filter((x) => typeof x === 'string' && x.length > 0))].slice(0, MAX_SCHOOLS)
}

export function loadIds() {
  if (memory) return [...memory]
  try {
    const raw = localStorage.getItem(KEY)
    memory = clean(raw ? JSON.parse(raw) : [])
  } catch {
    ok = false
    memory = clean((params.get('ids') || '').split(','))
  }
  return [...memory]
}

export function saveIds(ids) {
  memory = clean(ids)
  try {
    localStorage.setItem(KEY, JSON.stringify(memory))
  } catch {
    ok = false
  }
  return ok
}
