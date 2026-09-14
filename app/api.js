// The real API client (API.md §7). Same exports as api.mock.js.
import { params, apiBase } from './params.js'

async function get(path, query = {}) {
  const url = new URL(apiBase() + path)
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)
  if (params.get('now')) url.searchParams.set('now', params.get('now'))
  if (params.get('sample') === '1') url.searchParams.set('include_sample', '1')
  const res = await fetch(url, { headers: { accept: 'application/json' } })
  let body = null
  try {
    body = await res.json()
  } catch {
    body = null
  }
  if (!res.ok) {
    const err = new Error(body?.message || `HTTP ${res.status}`)
    err.status = res.status
    err.code = body?.error ?? null
    throw err
  }
  return body
}

export const getSchools = () => get('/api/schools')
export const getStatus = (ids) => get('/api/status', { ids: ids.join(',') })
export const getToday = () => get('/api/today')
export const getNotice = (id) => get(`/api/notices/${encodeURIComponent(id)}`)
export const getSources = () => get('/api/sources')

/** Absolute link to a saved raw copy (`/api/raw/…` from the Worker). */
export const rawHref = (href) => (href ? apiBase() + href : null)
