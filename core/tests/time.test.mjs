import { test } from 'node:test'
import assert from 'node:assert/strict'
import { localParts, localDate, localToMs, isNdt, fmtTime, parseRfc822, parseListDate, refStamp } from '../time.js'

const at = (s) => localParts(s)

test('September is NDT (UTC−2:30): Monday 2026-09-14', () => {
  assert.deepEqual(at('2026-09-14T09:10:00Z'), { y: 2026, m: 9, d: 14, hh: 6, mm: 40, weekday: 1 })
  assert.equal(localDate('2026-09-14T02:29:00Z'), '2026-09-13')
  assert.equal(localDate('2026-09-14T02:30:00Z'), '2026-09-14')
})

test('January is NST (UTC−3:30)', () => {
  assert.equal(isNdt('2026-01-15T12:00:00Z'), false)
  assert.deepEqual(at('2026-01-15T12:00:00Z'), { y: 2026, m: 1, d: 15, hh: 8, mm: 30, weekday: 4 })
  assert.equal(new Date(localToMs({ y: 2026, m: 1, d: 15, hh: 8, mm: 30 })).toISOString(), '2026-01-15T12:00:00.000Z')
})

test('spring forward: second Sunday in March 02:00 NST (2026-03-08)', () => {
  assert.deepEqual(at('2026-03-08T05:29:00Z'), { y: 2026, m: 3, d: 8, hh: 1, mm: 59, weekday: 0 })
  assert.deepEqual(at('2026-03-08T05:30:00Z'), { y: 2026, m: 3, d: 8, hh: 3, mm: 0, weekday: 0 })
  assert.equal(isNdt('2026-03-01T12:00:00Z'), false) // first Sunday is not the switch
  assert.equal(new Date(localToMs({ y: 2026, m: 3, d: 8, hh: 1, mm: 59 })).toISOString(), '2026-03-08T05:29:00.000Z')
  assert.equal(new Date(localToMs({ y: 2026, m: 3, d: 8, hh: 3, mm: 0 })).toISOString(), '2026-03-08T05:30:00.000Z')
})

test('fall back: first Sunday in November 02:00 NDT (2026-11-01)', () => {
  assert.deepEqual(at('2026-11-01T04:29:00Z'), { y: 2026, m: 11, d: 1, hh: 1, mm: 59, weekday: 0 })
  assert.deepEqual(at('2026-11-01T04:30:00Z'), { y: 2026, m: 11, d: 1, hh: 1, mm: 0, weekday: 0 })
  assert.equal(isNdt('2026-11-01T04:30:00Z'), false)
  // 2027: second Sunday in March is the 14th, first Sunday in November is the 7th
  assert.equal(isNdt('2027-03-14T05:29:00Z'), false)
  assert.equal(isNdt('2027-03-14T05:30:00Z'), true)
  assert.equal(isNdt('2027-11-07T04:29:00Z'), true)
  assert.equal(isNdt('2027-11-07T04:30:00Z'), false)
})

test('fmtTime, parseRfc822, parseListDate, refStamp', () => {
  assert.equal(fmtTime('2026-09-14T09:12:00Z'), '6:42 AM')
  assert.equal(fmtTime('2026-09-14T15:30:00Z'), '1:00 PM')
  assert.equal(fmtTime('2026-09-14T02:30:00Z'), '12:00 AM')
  assert.equal(parseRfc822('Fri, 04 Sep 2026 14:47:43 +0000'), '2026-09-04T14:47:43.000Z')
  assert.equal(parseRfc822('Fri, 04 Sep 2026 11:17:43 -0330'), '2026-09-04T14:47:43.000Z')
  assert.equal(parseRfc822('nonsense'), null)
  assert.equal(parseListDate('Monday, September 14, 2026'), '2026-09-14')
  assert.equal(parseListDate('Monday, Septembre 14, 2026'), null)
  assert.equal(refStamp('2026-09-14T16:40:05.000Z'), '2026-09-14T16-40-05-000Z')
})
