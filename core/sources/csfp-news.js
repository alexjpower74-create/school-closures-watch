// CSFP news feed (API.md §3.3). Not a closure list: recent posts with a closure word become "may apply".
import { extractText, normText, fnv1a8, clip } from '../text.js'
import { parseRfc822, toMs } from '../time.js'
import { isDue } from '../schedule.js'
import { hasCsfpWord } from '../labels.js'
import { classifyNotice, noticeId } from '../notice.js'
import { REGISTRY_BY_ID, planFor } from './registry.js'

const ENTRY = REGISTRY_BY_ID['csfp-news']
const H = 3600000
export const KEEP_BEFORE_MS = 36 * H
export const KEEP_AFTER_MS = 1 * H

const tag = (xml, name) => {
  const m = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}\\s*>`, 'i').exec(xml)
  return m ? m[1] : null
}

export const adapter = {
  id: ENTRY.id,
  due: (now, health) => isDue(ENTRY.id, now, health),
  fetchPlan: () => planFor(ENTRY),
  parse(raws, ctx) {
    const raw = raws.find((r) => r.name === 'feed') ?? raws[0]
    const base = {
      result: 'ok',
      error: null,
      list_date: null,
      list_date_text: null,
      open_rule_quote: null,
      notices: [],
      rows_skipped: 0,
      unmapped_classes: [],
    }
    const body = String(raw?.body ?? '')
    if (!/<rss\b|<channel\b/i.test(body)) return { ...base, result: 'format_changed', error: 'not an RSS feed' }
    const now = toMs(ctx.now)
    for (const m of body.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item\s*>/gi)) {
      const xml = m[1]
      const title = extractText(tag(xml, 'title'))
      const description = extractText(tag(xml, 'description'))
      const posted_text = normText(extractText(tag(xml, 'pubDate'))) || null
      const posted_at = parseRfc822(posted_text)
      if (!title || !posted_at) {
        base.rows_skipped++
        continue
      }
      const t = Date.parse(posted_at)
      if (t < now - KEEP_BEFORE_MS || t > now + KEEP_AFTER_MS) continue
      if (!hasCsfpWord(`${title} ${description}`)) continue
      const guid = extractText(tag(xml, 'guid')) || extractText(tag(xml, 'link')) || title
      const n = {
        id: null,
        source_id: ENTRY.id,
        sample: !!ctx.sample,
        kind: 'feed_post',
        list_date: null,
        list_date_text: null,
        row_id: fnv1a8(guid),
        school_text: null,
        community_text: null,
        family_text: null,
        region_text: null,
        status_class: null,
        status_text: null,
        title,
        quote: title,
        // The whole <item> as text: one contiguous place in the raw copy that holds both title and description
        // (title + " " + description is not contiguous in the feed, so it could never verify).
        source_text: clip(extractText(m[0]), 6000),
        posted_at,
        posted_text,
        link: extractText(tag(xml, 'link')) || ENTRY.human_url,
        raw_refs: [raw.raw_ref],
      }
      const { notice } = classifyNotice(n, ctx.schools)
      notice.id = noticeId(notice, ctx.now)
      base.notices.push(notice)
    }
    return base
  },
}

export default adapter
