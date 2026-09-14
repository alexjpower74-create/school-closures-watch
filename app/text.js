// Text helpers the app needs (API.md §0). Same rules as core/text.js; the app keeps its own copy because the
// static server only serves app/.

/** Every run of whitespace (including U+00A0) becomes one space, then trim. */
export function normText(s) {
  return String(s ?? '')
    .replace(/[\s ]+/g, ' ')
    .trim()
}

/**
 * The quote guard (API.md §8.2): a notice is only rendered when its quote is an exact substring of its row text.
 * Returns false for anything missing or shorter than 2 characters.
 */
export function quoteIsVerified(notice) {
  if (!notice) return false
  const q = normText(notice.quote)
  if (q.length < 2) return false
  return normText(notice.source_text).includes(q)
}

/** Accent- and case-insensitive search key (NFKD, drop combining marks, lowercase, punctuation to spaces). */
export function searchKey(s) {
  return String(s ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’‘]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}
