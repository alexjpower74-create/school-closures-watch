// MOCK-ONLY API (?mock=1). Same exports as api.js, no network. ?scenario= picks the data (API.md §8.4) and
// ?now= replaces the scenario's clock. Rows are all sample: true, so include_sample doesn't hide anything here.
import { params } from './params.js'
import { SCENARIOS } from './mock/scenarios.js'
import { createEngine } from './mock/engine.js'

function engine() {
  const make = SCENARIOS[params.get('scenario')] || SCENARIOS.today
  const scenario = make()
  return createEngine({ ...scenario, now: params.get('now') || scenario.now })
}

// Resolve on a later task, like a network call, so pages never depend on synchronous data.
const later = (fn) => new Promise((resolve, reject) => setTimeout(() => {
  try {
    resolve(structuredClone(fn()))
  } catch (e) {
    reject(e)
  }
}, 0))

export const getSchools = () => later(() => engine().schools())
export const getStatus = (ids) => later(() => engine().status(ids))
export const getToday = () => later(() => engine().today())
export const getNotice = (id) => later(() => engine().notice(id))
export const getSources = () => later(() => engine().sources())

/** The mock keeps no saved copies. */
export const rawHref = () => null
