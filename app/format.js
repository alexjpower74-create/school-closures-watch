// Newfoundland times for people (API.md §8.2): "6:42 AM".
const TIME = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/St_Johns', hour: 'numeric', minute: '2-digit' })
const DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/St_Johns',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const LONG_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/St_Johns',
  weekday: 'long',
  month: 'long',
  day: 'numeric',
})

/** "6:42 AM", or null for a missing time. */
export function fmtTime(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const parts = TIME.formatToParts(d)
  const get = (t) => parts.find((p) => p.type === t)?.value ?? ''
  const period = get('dayPeriod').replace(/\./g, '').toUpperCase()
  return `${get('hour')}:${get('minute')} ${period}`.trim()
}

/** "2026-09-14" in Newfoundland. */
export function localDate(iso) {
  return DATE.format(new Date(iso))
}

/** "6:42 AM" when the time is on the same Newfoundland day as `now`, else "Tuesday, September 15, 6:42 AM". */
export function fmtWhen(iso, now) {
  const t = fmtTime(iso)
  if (!t) return null
  if (!now || localDate(iso) === localDate(now)) return t
  return `${LONG_DATE.format(new Date(iso))}, ${t}`
}

/** Fill "{name}" placeholders. */
export function fill(template, vars) {
  return String(template ?? '').replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m))
}
