// NLSchools School Status Report (API.md §3.1). Page = date line + open rule; fragment = the rows.
import { extractText } from '../text.js'
import { parseListDate } from '../time.js'
import { isDue } from '../schedule.js'
import { classifyNotice, noticeId } from '../notice.js'
import { CLASS_STATUS } from '../labels.js'
import { REGISTRY_BY_ID, NLS_OPEN_RULE, planFor } from './registry.js'

const ENTRY = REGISTRY_BY_ID['nlschools-status']
const DATE_RE = /Real-time school closure information for:\s*((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), (?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, \d{4})/

const attr = (attrs, name) => {
  const m = new RegExp(`\\b${name}\\s*=\\s*(?:'([^']*)'|"([^"]*)"|([^\\s>]+))`, 'i').exec(attrs ?? '')
  return m ? (m[1] ?? m[2] ?? m[3]) : null
}

export function parsePage (body) {
  const text = extractText(body)
  const m = DATE_RE.exec(text)
  const list_date_text = m ? m[1] : null
  return {
    list_date_text,
    list_date: list_date_text ? parseListDate(list_date_text) : null,
    open_rule_quote: text.includes(NLS_OPEN_RULE) ? NLS_OPEN_RULE : null
  }
}

/** → { rows: [{ row_id, cells: [{attrs, inner}], html }], skipped } or null when the table isn't there. */
export function parseFragment (body) {
  const b = String(body ?? '')
  if (!/id\s*=\s*(['"])schoolStatusTable\1/.test(b)) return null
  const tbody = /<tbody\b[^>]*>([\s\S]*?)<\/tbody\s*>/i.exec(b)
  const rows = []
  let skipped = 0
  for (const tr of (tbody ? tbody[1] : '').matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr\s*>/gi)) {
    const row_id = attr(tr[1], 'id')
    const cells = [...tr[2].matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td\s*>/gi)].map(c => ({ attrs: c[1], inner: c[2] }))
    if (row_id === null || cells.length < 5) { skipped++; continue }
    rows.push({ row_id, cells, html: tr[0] })
  }
  return { rows, skipped }
}

function rowFields ({ row_id, cells, html }) {
  const [c1, c2, c3, c4, c5] = cells
  const span = /<span\b[^>]*>([\s\S]*?)<\/span\s*>/i.exec(c1.inner)
  const br = /<br\s*\/?>/i.exec(c1.inner)
  const community = br ? extractText(c1.inner.slice(br.index + br[0].length)) : ''
  const tokens = (attr(c2.attrs, 'class') ?? '').split(/\s+/).filter(Boolean)
  const status_class = tokens.find(t => Object.hasOwn(CLASS_STATUS, t)) ?? tokens[0] ?? null
  const status_text = extractText(c2.inner) || null
  const description = extractText(c3.inner)
  return {
    row_id,
    school_text: extractText(span ? span[1] : c1.inner),
    community_text: community || null,
    status_class,
    status_text,
    // An empty DESCRIPTION/NOTES cell would leave nothing to quote; the STATUS cell is quoted instead.
    quote: description || status_text || '',
    family_text: extractText(c4.inner) || null,
    region_text: extractText(c5.inner) || null,
    source_text: extractText(html)
  }
}

export const adapter = {
  id: ENTRY.id,
  due: (now, health) => isDue(ENTRY.id, now, health),
  fetchPlan: () => planFor(ENTRY),
  /**
   * raws: [{ name: 'statusreport'|'schoolstatus', raw_ref, body }]. ctx: { now, schools, sample, list_date?,
   * list_date_text? } — the list_date overrides are only for fragments with no page (wayback tests).
   */
  parse (raws, ctx) {
    const page = raws.find(r => r.name === 'statusreport')
    const frag = raws.find(r => r.name === 'schoolstatus')
    const head = page ? parsePage(page.body) : { list_date: ctx.list_date ?? null, list_date_text: ctx.list_date_text ?? null, open_rule_quote: ctx.open_rule_quote ?? null }
    const base = { result: 'ok', error: null, ...head, notices: [], rows_skipped: 0, unmapped_classes: [] }
    const parsed = frag ? parseFragment(frag.body) : null
    if (!parsed) return { ...base, result: 'format_changed', error: 'table not found' }
    base.rows_skipped = parsed.skipped
    if (!parsed.rows.length && parsed.skipped > 0) return { ...base, result: 'format_changed', error: 'no readable rows' }
    const raw_refs = [page?.raw_ref, frag.raw_ref].filter(Boolean)
    const unmapped = new Set()
    for (const r of parsed.rows) {
      const f = rowFields(r)
      const n = {
        id: null,
        source_id: ENTRY.id,
        sample: !!ctx.sample,
        kind: 'school_row',
        list_date: head.list_date,
        list_date_text: head.list_date_text,
        ...f,
        title: null,
        posted_at: null,
        posted_text: null,
        link: ENTRY.human_url,
        raw_refs
      }
      const { notice, unmapped_class } = classifyNotice(n, ctx.schools)
      if (unmapped_class) unmapped.add(unmapped_class)
      notice.id = noticeId(notice, ctx.now)
      base.notices.push(notice)
    }
    base.unmapped_classes = [...unmapped]
    return base
  }
}

export default adapter
