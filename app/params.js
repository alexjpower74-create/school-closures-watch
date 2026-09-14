// URL parameters (API.md §1): ?mock=1, ?scenario=, ?now=, ?api=, ?sample=1. Links inside the app keep them.
export const params = new URLSearchParams(location.search)
export const isMock = params.get('mock') === '1'

const KEEP = ['mock', 'scenario', 'now', 'api', 'sample']

/** A same-app link that keeps the mock/scenario/now/api/sample parameters. */
export function href(path, extra = {}) {
  const q = new URLSearchParams()
  for (const k of KEEP) if (params.has(k)) q.set(k, params.get(k))
  for (const [k, v] of Object.entries(extra)) if (v !== null && v !== undefined) q.set(k, v)
  const s = q.toString()
  return s ? `${path}?${s}` : path
}

export function apiBase() {
  const fromUrl = params.get('api')
  if (fromUrl) return fromUrl.replace(/\/+$/, '')
  const meta = document.querySelector('meta[name="api-base"]')
  return (meta?.content || 'http://127.0.0.1:8202').replace(/\/+$/, '')
}
