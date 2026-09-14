// NLSchools important notices box (API.md §3.2). Usually only a script that hides the box.
import { extractText, normText, fnv1a8, clip } from '../text.js'
import { isDue } from '../schedule.js'
import { classifyNotice, noticeId } from '../notice.js'
import { REGISTRY_BY_ID, planFor } from './registry.js'

const ENTRY = REGISTRY_BY_ID['nlschools-notices']

export const adapter = {
  id: ENTRY.id,
  due: (now, health) => isDue(ENTRY.id, now, health),
  fetchPlan: () => planFor(ENTRY),
  parse (raws, ctx) {
    const raw = raws.find(r => r.name === 'newspostings_5') ?? raws[0]
    const base = { result: 'ok', error: null, list_date: null, list_date_text: null, open_rule_quote: null, notices: [], rows_skipped: 0, unmapped_classes: [] }
    if (!raw) return { ...base, result: 'format_changed', error: 'no body' }
    const text = extractText(raw.body)
    if (!text) return base
    const source_text = clip(text, 6000)
    const pageUrl = ENTRY.fetch_urls[0]
    const found = []
    for (const a of String(raw.body).matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)) {
      const title = extractText(a[2])
      if (title.length < 3) continue
      const href = /\bhref\s*=\s*(?:'([^']*)'|"([^"]*)"|([^\s>]+))/i.exec(a[1])
      let link = ENTRY.human_url
      try { if (href) link = new URL(href[1] ?? href[2] ?? href[3], pageUrl).href } catch {}
      found.push({ title, quote: title, link })
    }
    if (!found.length) found.push({ title: null, quote: clip(text, 600), link: ENTRY.human_url })
    for (const f of found) {
      const n = {
        id: null, source_id: ENTRY.id, sample: !!ctx.sample, kind: 'text_notice',
        list_date: null, list_date_text: null, row_id: fnv1a8(normText(f.quote)),
        school_text: null, community_text: null, family_text: null, region_text: null, status_class: null, status_text: null,
        title: f.title, quote: f.quote, source_text, posted_at: null, posted_text: null,
        link: f.link, raw_refs: [raw.raw_ref]
      }
      const { notice } = classifyNotice(n, ctx.schools)
      notice.id = noticeId(notice, ctx.now)
      base.notices.push(notice)
    }
    return base
  }
}

export default adapter
