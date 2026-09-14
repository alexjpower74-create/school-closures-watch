// Scan schedule and staleness (API.md §6). Shared by the Worker cron and `scan.mjs --watch`.
import { localParts, localToMs, toMs, iso, fmtTime } from './time.js'

const MIN = 60000
/** Busy windows, Newfoundland local time, Monday–Friday: [startHour, endHour) */
export const BUSY_WINDOWS = [[5, 9], [11, 13]]
export const DUE_SLACK_MS = 30 * 1000
export const STALE_GRACE_MS = 10 * MIN

const idOf = source => (typeof source === 'string' ? source : source?.id)

export function inBusyWindow (t) {
  const p = localParts(t)
  if (p.weekday < 1 || p.weekday > 5) return false
  return BUSY_WINDOWS.some(([a, b]) => p.hh >= a && p.hh < b)
}

export function intervalMinutes (source, t) {
  const busy = inBusyWindow(t)
  const id = idOf(source)
  if (id === 'nlschools-status' || id === 'nlschools-notices') return busy ? 5 : 60
  if (id === 'csfp-news') return busy ? 15 : 60
  return 60
}

/** Start (epoch ms) of the first busy window that starts strictly after t. */
export function nextBusyStart (t) {
  const ms = toMs(t)
  const p = localParts(ms)
  for (let k = 0; k <= 8; k++) {
    const day = new Date(Date.UTC(p.y, p.m - 1, p.d + k))
    const dow = day.getUTCDay()
    if (dow < 1 || dow > 5) continue
    for (const [h] of BUSY_WINDOWS) {
      const s = localToMs({ y: day.getUTCFullYear(), m: day.getUTCMonth() + 1, d: day.getUTCDate(), hh: h })
      if (s > ms) return s
    }
  }
  return null
}

/** Epoch ms: the earlier of t + interval and the next busy window start. */
export function nextDueMs (source, t) {
  const ms = toMs(t)
  const byInterval = ms + intervalMinutes(source, ms) * MIN
  const busy = nextBusyStart(ms)
  return busy === null ? byInterval : Math.min(byInterval, busy)
}

export const nextDue = (source, t) => iso(nextDueMs(source, t))

export function isDue (source, now, health) {
  if (!health?.last_attempt_at) return true
  return toMs(now) >= nextDueMs(source, health.last_attempt_at) - DUE_SLACK_MS
}

/** → { stale, stale_reason: null | never_checked | last_attempt_failed | overdue } */
export function staleness (source, now, health) {
  if (!health?.last_ok_at) return { stale: true, stale_reason: 'never_checked' }
  if (health.last_result && health.last_result !== 'ok') return { stale: true, stale_reason: 'last_attempt_failed' }
  if (toMs(now) > nextDueMs(source, health.last_ok_at) + STALE_GRACE_MS) return { stale: true, stale_reason: 'overdue' }
  return { stale: false, stale_reason: null }
}

const SHORT = {
  'nlschools-status': 'the NLSchools list',
  'nlschools-notices': 'NLSchools important notices',
  'csfp-news': 'the CSFP news feed'
}

/** Plain-English stale banner text (§5.2 example), or null when not stale. */
export function staleText (source, reason, health) {
  if (!reason) return null
  const name = SHORT[idOf(source)] ?? 'this source'
  const from = health?.last_ok_at ? ` Statuses below are from ${fmtTime(health.last_ok_at)}.` : ''
  if (reason === 'never_checked') {
    if (health?.last_attempt_at) return `We couldn't reach ${name} at ${fmtTime(health.last_attempt_at)}. We haven't had a good check yet.`
    return `We haven't checked ${name} yet.`
  }
  if (reason === 'last_attempt_failed') {
    const what = health?.last_result === 'format_changed' ? `couldn't read ${name}` : `couldn't reach ${name}`
    return `We ${what} at ${fmtTime(health.last_attempt_at)}.${from}`
  }
  return `We haven't been able to check ${name} since ${fmtTime(health.last_ok_at)}.`
}
