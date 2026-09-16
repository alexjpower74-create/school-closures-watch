// Newfoundland time without Intl time zones (docs/API.md §0).
// NST = UTC−3:30. NDT = UTC−2:30 from the second Sunday in March 02:00 local to the first Sunday in November
// 02:00 local. A wall time in the skipped March hour or the repeated November hour is read as NDT.

export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MON3 = MONTHS.map((m) => m.slice(0, 3).toLowerCase())
const NDT_MIN = 150
const NST_MIN = 210

function nthSunday(y, month1, n) {
  const firstDow = new Date(Date.UTC(y, month1 - 1, 1)).getUTCDay()
  return 1 + ((7 - firstDow) % 7) + 7 * (n - 1)
}

export const toMs = (t) => (typeof t === 'number' ? t : +new Date(t))
export const iso = (t) => new Date(toMs(t)).toISOString()

/** Is this UTC instant in NDT? */
export function isNdt(t) {
  const ms = toMs(t)
  const y = new Date(ms).getUTCFullYear()
  const start = Date.UTC(y, 2, nthSunday(y, 3, 2), 2, 0) + NST_MIN * 60000 // 02:00 NST
  const end = Date.UTC(y, 10, nthSunday(y, 11, 1), 2, 0) + NDT_MIN * 60000 // 02:00 NDT
  return ms >= start && ms < end
}

/** UTC instant → Newfoundland wall-clock parts. weekday 0 = Sunday. */
export function localParts(t) {
  const ms = toMs(t)
  const l = new Date(ms - (isNdt(ms) ? NDT_MIN : NST_MIN) * 60000)
  return {
    y: l.getUTCFullYear(),
    m: l.getUTCMonth() + 1,
    d: l.getUTCDate(),
    hh: l.getUTCHours(),
    mm: l.getUTCMinutes(),
    weekday: l.getUTCDay(),
  }
}

const pad = (n) => String(n).padStart(2, '0')

/** "2026-09-14" in Newfoundland. */
export function localDate(t) {
  const p = localParts(t)
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`
}

/** Newfoundland wall time → epoch ms. */
export function localToMs({ y, m, d, hh = 0, mm = 0, ss = 0 }) {
  const wall = Date.UTC(y, m - 1, d, hh, mm, ss)
  const start = Date.UTC(y, 2, nthSunday(y, 3, 2), 2, 0)
  const end = Date.UTC(y, 10, nthSunday(y, 11, 1), 2, 0)
  const ndt = wall >= start && wall < end
  return wall + (ndt ? NDT_MIN : NST_MIN) * 60000
}

/** "6:42 AM" in Newfoundland (for health text written by the Worker). */
export function fmtTime(t) {
  const { hh, mm } = localParts(t)
  const h12 = hh % 12 === 0 ? 12 : hh % 12
  return `${h12}:${pad(mm)} ${hh < 12 ? 'AM' : 'PM'}`
}

export function monthNumber(name) {
  const i = MON3.indexOf(String(name).slice(0, 3).toLowerCase())
  return i < 0 ? null : i + 1
}

/** "Fri, 04 Sep 2026 14:47:43 +0000" → ISO, or null. */
export function parseRfc822(s) {
  const m = /(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([+-]\d{4}|GMT|UT|UTC|Z)?/.exec(String(s ?? ''))
  if (!m) return null
  const mon = monthNumber(m[2])
  if (!mon) return null
  let t = Date.UTC(+m[3], mon - 1, +m[1], +m[4], +m[5], +(m[6] ?? 0))
  const z = m[7]
  if (z && /^[+-]\d{4}$/.test(z)) {
    const sign = z[0] === '-' ? -1 : 1
    t -= sign * (parseInt(z.slice(1, 3), 10) * 60 + parseInt(z.slice(3), 10)) * 60000
  }
  return new Date(t).toISOString()
}

/** "Monday, September 14, 2026" → "2026-09-14", or null. */
export function parseListDate(s) {
  const m = /^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), ([A-Za-z]+) (\d{1,2}), (\d{4})$/.exec(String(s ?? ''))
  if (!m) return null
  const mon = MONTHS.indexOf(m[1]) + 1
  if (!mon) return null
  return `${m[3]}-${pad(mon)}-${pad(+m[2])}`
}

/** raw_ref time part: ISO with : and . replaced by - (§0). */
export const refStamp = (t) => iso(t).replace(/[:.]/g, '-')
