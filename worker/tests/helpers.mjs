import { scenarioPayloads } from './payloads.mjs'
import { SCHOOLS, schoolsInRegion } from '../../core/schools.js'

// QA runs on other ports (SC_WORKER_PORT=8208, SC_WORKER_FIXTURE_PORT=8206); run.mjs also passes the URLs.
export const BASE = process.env.SC_WORKER_URL ?? `http://127.0.0.1:${process.env.SC_WORKER_PORT ?? 8202}`
export const FX = process.env.SC_FIXTURE_URL ?? `http://127.0.0.1:${process.env.SC_WORKER_FIXTURE_PORT ?? 8204}`
export const TOKEN = process.env.SC_ADMIN_TOKEN ?? 'test-admin-token'

const byName = n => SCHOOLS.find(s => s.name === n)
export const GLOVERTOWN = byName('Glovertown Academy').id
export const EASTSIDE = byName('Eastside Elementary').id
export const BOREALE = byName('École Boréale').id
export const SAINTE_ANNE = byName('École Sainte-Anne').id
export const PRIVATE = SCHOOLS.find(s => s.board === 'Private').id
export const OTHER_CENTRAL = schoolsInRegion('central').find(s => s.id !== GLOVERTOWN).id
export const CENTRAL_IDS = schoolsInRegion('central').map(s => s.id)
export const WESTERN_IDS = schoolsInRegion('western').map(s => s.id)

/** Monday 2026-09-14 06:40 NDT (busy window) */
export const T0 = '2026-09-14T09:10:00.000Z'
export const plus = (t, min, sec = 0) => new Date(Date.parse(t) + min * 60000 + sec * 1000).toISOString()

const qs = params => {
  const e = Object.entries(params).filter(([, v]) => v !== undefined && v !== null)
  return e.length ? '?' + e.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&') : ''
}

export async function get (path, params = {}) {
  const res = await fetch(BASE + path + qs(params))
  const text = await res.text()
  let body = text
  try { body = JSON.parse(text) } catch {}
  return { res, status: res.status, body, text }
}

export async function post (path, body, { token = TOKEN, params = {} } = {}) {
  const headers = { 'content-type': 'application/json' }
  if (token) headers.authorization = `Bearer ${token}`
  const res = await fetch(BASE + path + qs(params), { method: 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await res.text()
  let parsed = text
  try { parsed = JSON.parse(text) } catch {}
  return { res, status: res.status, body: parsed }
}

export async function reset () {
  const r = await post('/api/admin/reset')
  if (r.status !== 200) throw new Error(`reset failed: ${r.status} ${JSON.stringify(r.body)}`)
  await fetch(FX + '/__reset', { method: 'POST' })
}

export const fixtureScenario = name => fetch(`${FX}/__scenario?name=${name}`, { method: 'POST' })
export const fixtureLog = async () => (await fetch(`${FX}/__log`)).json()

export async function ingestScenario (name, now, { tamper = null, only = null } = {}) {
  const out = []
  for (let p of await scenarioPayloads(name, now, { only })) {
    if (tamper) p = tamper(p)
    const r = await post('/api/admin/ingest', p, { params: { now } })
    if (r.status !== 200) throw new Error(`ingest ${p.source_id}: ${r.status} ${JSON.stringify(r.body)}`)
    out.push(r.body)
  }
  return out
}

export const adminScan = (now, params = {}) => post('/api/admin/scan', undefined, { params: { now, ...params } })

/** GET /api/status for any number of ids (chunks of 30). */
export async function statuses (ids, params) {
  const out = []
  for (let i = 0; i < ids.length; i += 30) {
    const r = await get('/api/status', { ids: ids.slice(i, i + 30).join(','), ...params })
    if (r.status !== 200) throw new Error(`status ${r.status}`)
    out.push(...r.body.schools)
  }
  return out
}
