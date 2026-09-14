// Verification of verbatim fields against raw copies (API.md §0). Runs in runScan and again in the Worker at
// ingest (against the raw bodies in the payload). The app runs its own quote ⊆ source_text check.
import { extractText, normText } from './text.js'
import { NOTICE_KINDS } from './notice.js'

const textCache = new WeakMap()
function rawText (raw) {
  if (!raw || typeof raw.body !== 'string') return ''
  let t = textCache.get(raw)
  if (t === undefined) { t = extractText(raw.body); textCache.set(raw, t) }
  return t
}

/** normText(v) has ≥ 2 chars and is a substring of extractText of one of `raws`. */
export function verifyValue (value, raws) {
  if (typeof value !== 'string') return false
  const v = normText(value)
  if (v.length < 2) return false
  return (raws ?? []).some(r => rawText(r).includes(v))
}

export function rawsFor (refs, raws) {
  const want = new Set(Array.isArray(refs) ? refs : [])
  return (raws ?? []).filter(r => want.has(r.raw_ref))
}

const NULLABLE = ['community_text', 'family_text', 'region_text', 'status_text', 'title', 'posted_text',
  'list_date_text', 'scope_evidence']

/**
 * → { notice, reason: null, nulled } or { notice: null, reason, nulled: [] }.
 * Drops on quote / source_text / quote ⊄ source_text / school_text (school rows). Other verbatim fields that fail
 * become null with their dependants: posted_text → posted_at, list_date_text → list_date, scope_evidence →
 * scope "district", status_evidence (phrase) → status "other". Derived fields are recomputed afterwards by
 * classifyNotice in both callers.
 */
export function verifyNotice (notice, raws) {
  const drop = reason => ({ notice: null, reason, nulled: [] })
  if (!notice || typeof notice !== 'object') return drop('not_an_object')
  const mine = rawsFor(notice.raw_refs, raws)
  if (!mine.length) return drop('no_raw')
  if (!verifyValue(notice.quote, mine)) return drop('quote')
  if (!verifyValue(notice.source_text, mine)) return drop('source_text')
  if (!normText(notice.source_text).includes(normText(notice.quote))) return drop('quote_not_in_source_text')
  if (notice.kind === 'school_row' && !verifyValue(notice.school_text, mine)) return drop('school_text')

  const out = { ...notice }
  const nulled = []
  for (const f of NULLABLE) {
    if (out[f] === null || out[f] === undefined) { out[f] = null; continue }
    if (verifyValue(out[f], mine)) continue
    out[f] = null
    nulled.push(f)
    if (f === 'posted_text') out.posted_at = null
    if (f === 'list_date_text') out.list_date = null
    if (f === 'scope_evidence' && (out.scope === 'region' || out.scope === 'province')) {
      out.scope = 'district'; out.scope_region = null
    }
  }
  if (out.status_basis === 'phrase' && !verifyValue(out.status_evidence, mine)) {
    Object.assign(out, { status: 'other', status_basis: 'none', status_evidence: null })
    nulled.push('status_evidence')
  }
  return { notice: out, reason: null, nulled }
}

const STR_OR_NULL = v => v === null || v === undefined || typeof v === 'string'

/** Shape check at ingest. → error string or null. */
export function noticeShapeError (n, sourceId) {
  if (!n || typeof n !== 'object') return 'notice is not an object'
  if (typeof n.id !== 'string' || !/^[A-Za-z0-9._:-]{1,200}$/.test(n.id)) return 'id'
  if (n.source_id !== sourceId) return 'source_id'
  if (!NOTICE_KINDS.includes(n.kind)) return 'kind'
  if (typeof n.row_id !== 'string' || !n.row_id) return 'row_id'
  for (const f of ['quote', 'source_text']) if (typeof n[f] !== 'string' || !n[f].trim()) return f
  for (const f of ['school_text', 'community_text', 'family_text', 'region_text', 'status_class', 'status_text', 'title',
    'posted_text', 'posted_at', 'list_date', 'list_date_text', 'link']) if (!STR_OR_NULL(n[f])) return f
  if (!Array.isArray(n.raw_refs) || !n.raw_refs.length || !n.raw_refs.every(r => typeof r === 'string')) return 'raw_refs'
  return null
}
