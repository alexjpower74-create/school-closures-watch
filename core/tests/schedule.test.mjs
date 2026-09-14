import { test } from 'node:test'
import assert from 'node:assert/strict'
import { inBusyWindow, intervalMinutes, nextDue, isDue, staleness, staleText } from '../schedule.js'
import { localToMs } from '../time.js'

const nf = (y, m, d, hh, mm = 0, ss = 0) => new Date(localToMs({ y, m, d, hh, mm, ss })).toISOString()
const S = 'nlschools-status'

test('§6 worked example: Mon 06:40 NDT last ok → next due 06:45, stale after 06:55', () => {
  const ok = nf(2026, 9, 14, 6, 40)
  assert.equal(nextDue(S, ok), nf(2026, 9, 14, 6, 45))
  const h = { last_attempt_at: ok, last_ok_at: ok, last_result: 'ok' }
  assert.equal(staleness(S, nf(2026, 9, 14, 6, 55), h).stale, false)
  assert.deepEqual(staleness(S, nf(2026, 9, 14, 6, 55, 1), h), { stale: true, stale_reason: 'overdue' })
})

test('§6 worked example: Mon 04:02 NDT last ok → next due 05:00, stale after 05:10', () => {
  const ok = nf(2026, 9, 14, 4, 2)
  assert.equal(nextDue(S, ok), nf(2026, 9, 14, 5, 0))
  const h = { last_attempt_at: ok, last_ok_at: ok, last_result: 'ok' }
  assert.equal(staleness(S, nf(2026, 9, 14, 5, 10), h).stale, false)
  assert.equal(staleness(S, nf(2026, 9, 14, 5, 10, 1), h).stale, true)
})

test('§6 worked example: Mon 14:00 NDT last ok → next due 15:00', () => {
  assert.equal(nextDue(S, nf(2026, 9, 14, 14, 0)), nf(2026, 9, 14, 15, 0))
})

test('§6 worked example: Saturday 06:40 → 60-minute interval', () => {
  assert.equal(intervalMinutes(S, nf(2026, 9, 19, 6, 40)), 60)
  assert.equal(nextDue(S, nf(2026, 9, 19, 6, 40)), nf(2026, 9, 19, 7, 40))
  assert.equal(intervalMinutes('csfp-news', nf(2026, 9, 19, 6, 40)), 60)
})

test('§6 worked example: a January date uses NST', () => {
  const ok = nf(2026, 1, 12, 6, 40) // Monday
  assert.equal(ok, '2026-01-12T10:10:00.000Z')
  assert.equal(nextDue(S, ok), '2026-01-12T10:15:00.000Z')
  assert.equal(nextDue(S, nf(2026, 1, 12, 4, 2)), '2026-01-12T08:30:00.000Z')
})

test('busy window edges: 05:00–08:59 and 11:00–12:59, weekdays only', () => {
  const mon = (hh, mm) => inBusyWindow(nf(2026, 9, 14, hh, mm))
  assert.equal(mon(4, 59), false)
  assert.equal(mon(5, 0), true)
  assert.equal(mon(8, 59), true)
  assert.equal(mon(9, 0), false)
  assert.equal(mon(10, 59), false)
  assert.equal(mon(11, 0), true)
  assert.equal(mon(12, 59), true)
  assert.equal(mon(13, 0), false)
  assert.equal(inBusyWindow(nf(2026, 9, 18, 6, 0)), true) // Friday
  assert.equal(inBusyWindow(nf(2026, 9, 20, 6, 0)), false) // Sunday
})

test('intervals: status and notices 5 busy / 60; csfp-news 15 busy / 60', () => {
  const busy = nf(2026, 9, 14, 7, 0)
  const quiet = nf(2026, 9, 14, 20, 0)
  assert.equal(intervalMinutes('nlschools-status', busy), 5)
  assert.equal(intervalMinutes('nlschools-notices', busy), 5)
  assert.equal(intervalMinutes('csfp-news', busy), 15)
  assert.equal(intervalMinutes('nlschools-notices', quiet), 60)
  assert.equal(intervalMinutes('csfp-news', quiet), 60)
})

test('nextDue across the end of the week and a window', () => {
  assert.equal(nextDue(S, nf(2026, 9, 18, 12, 58)), nf(2026, 9, 18, 13, 3)) // Fri, still busy
  assert.equal(nextDue(S, nf(2026, 9, 18, 23, 30)), nf(2026, 9, 19, 0, 30)) // hourly overnight
  assert.equal(nextDue(S, nf(2026, 9, 18, 10, 30)), nf(2026, 9, 18, 11, 0)) // window starts first
})

test('isDue: never attempted, and 30 s slack', () => {
  const last = nf(2026, 9, 14, 6, 40)
  assert.equal(isDue(S, last, null), true)
  assert.equal(isDue(S, nf(2026, 9, 14, 6, 44, 29), { last_attempt_at: last }), false)
  assert.equal(isDue(S, nf(2026, 9, 14, 6, 44, 30), { last_attempt_at: last }), true)
})

test('staleness reasons and plain text', () => {
  const t = nf(2026, 9, 14, 6, 40)
  assert.deepEqual(staleness(S, t, null), { stale: true, stale_reason: 'never_checked' })
  const failed = { last_attempt_at: t, last_ok_at: nf(2026, 9, 14, 6, 35), last_result: 'error' }
  assert.deepEqual(staleness(S, t, failed), { stale: true, stale_reason: 'last_attempt_failed' })
  assert.equal(staleText(S, 'last_attempt_failed', failed), "We couldn't reach the NLSchools list at 6:40 AM. Statuses below are from 6:35 AM.")
  assert.equal(staleness(S, t, { ...failed, last_result: 'format_changed' }).stale, true)
  assert.equal(staleText(S, null, failed), null)
})

test('stale_text when no check was ever good but an attempt failed (lead 15:10)', () => {
  const t = nf(2026, 9, 14, 6, 40)
  const h = { last_attempt_at: t, last_ok_at: null, last_result: 'error' }
  assert.equal(staleness(S, t, h).stale_reason, 'never_checked')
  assert.equal(staleText(S, 'never_checked', h), "We couldn't reach the NLSchools list at 6:40 AM. We haven't had a good check yet.")
  assert.equal(staleText('csfp-news', 'never_checked', h), "We couldn't reach the CSFP news feed at 6:40 AM. We haven't had a good check yet.")
  assert.equal(staleText(S, 'never_checked', null), "We haven't checked the NLSchools list yet.")
})
