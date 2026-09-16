// Text extraction: what "the saved source says" (docs/API.md §0). Identical in core, Worker and app.

const NAMED = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  hellip: '…',
  eacute: 'é',
  egrave: 'è',
  agrave: 'à',
  ecirc: 'ê',
  ccedil: 'ç',
  ocirc: 'ô',
  icirc: 'î',
  laquo: '«',
  raquo: '»',
}

/** Every run of whitespace (U+00A0 included) becomes one space; then trim. */
export function normText(s) {
  return String(s ?? '')
    .replace(/[\s ]+/g, ' ')
    .trim()
}

/** The named entities in §0 plus numeric ones. Unknown named entities stay as they are. */
export function decodeEntities(s) {
  return String(s ?? '').replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (m, e) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return m
      return String.fromCodePoint(cp)
    }
    return Object.hasOwn(NAMED, e) ? NAMED[e] : m
  })
}

/** html and xml → text, per §0: drop script/style/comments, unwrap CDATA, tags → space, decode twice, normText. */
export function extractText(body) {
  let s = String(body ?? '')
  s = s.replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
  s = s.replace(/<style\b[\s\S]*?<\/style\s*>/gi, '')
  s = s.replace(/<!--[\s\S]*?-->/g, '')
  s = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  s = s.replace(/<[^>]*>/g, ' ')
  return normText(decodeEntities(decodeEntities(s)))
}

/** FNV-1a 32-bit over the UTF-8 bytes, 8 lowercase hex digits (§5.1). */
export function fnv1a8(s) {
  let h = 0x811c9dc5
  for (const b of new TextEncoder().encode(String(s ?? ''))) {
    h ^= b
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

const APOS = new Set(["'", '’', '‘'])
const WORD = /^[\p{L}\p{N}]$/u

/**
 * Words of `s` as normName sees them (§4.2), each with its [start, end) span in the ORIGINAL string, so a match
 * found on normalised words can be copied back verbatim. `&` is its own word "and"; apostrophes are deleted
 * without breaking a word; NFKD + combining marks dropped + lowercase.
 */
export function wordTokens(s) {
  const str = String(s ?? '')
  const out = []
  let cur = null
  const flush = () => {
    if (cur) out.push(cur)
    cur = null
  }
  for (let i = 0; i < str.length; ) {
    const ch = String.fromCodePoint(str.codePointAt(i))
    const next = i + ch.length
    if (APOS.has(ch)) {
      if (cur) cur.end = next
      i = next
      continue
    }
    if (ch === '&') {
      flush()
      out.push({ norm: 'and', start: i, end: next })
      i = next
      continue
    }
    const n = ch.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    let any = false
    for (const c of n) {
      if (WORD.test(c)) {
        if (!cur) cur = { norm: '', start: i, end: next }
        cur.norm += c
        cur.end = next
        any = true
      } else {
        flush()
      }
    }
    if (!any) flush()
    i = next
  }
  flush()
  // A trailing apostrophe run extended `end`; trim spans back to the last word character.
  return out
}

/** §4.2: NFKD, no marks, lowercase, & → and, apostrophes deleted, other non-alphanumeric runs → one space. */
export function normName(s) {
  return wordTokens(s)
    .map((t) => t.norm)
    .join(' ')
}

/** §4.2: drop a trailing ", NL" / " NL" (any case) and trailing commas, then normName. */
export function normCommunity(s) {
  let t = String(s ?? '')
    .trim()
    .replace(/[,\s]+$/, '')
  t = t.replace(/(?:,\s*|\s+)nl$/i, '').replace(/[,\s]+$/, '')
  return normName(t)
}

/** normText, then cut to at most `max` chars at a word boundary (the result is still a substring). */
export function clip(s, max = 6000) {
  const t = normText(s)
  if (t.length <= max) return t
  const cut = t.slice(0, max)
  const sp = cut.lastIndexOf(' ')
  return (sp > 0 ? cut.slice(0, sp) : cut).trim()
}
