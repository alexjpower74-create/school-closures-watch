import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const ROOT = fileURLToPath(new URL('../../', import.meta.url))
export const sample = (rel) => readFileSync(ROOT + 'data/samples/' + rel, 'utf8')
export const fixture = (rel) => readFileSync(ROOT + 'core/tests/fixtures/' + rel, 'utf8')

/** Monday 2026-09-14 06:40 NDT */
export const MON_0640 = '2026-09-14T09:10:00.000Z'

export const NLS_OPEN_RULE = 'If your school is not listed below, the status is normal and open as usual.'

/** A healthy nlschools-status health row for `now` (last ok = now). */
export function healthyNls(now, patch = {}) {
  return {
    'nlschools-status': {
      id: 'nlschools-status',
      last_attempt_at: now,
      last_ok_at: now,
      last_result: 'ok',
      list_date: '2026-09-14',
      list_date_text: 'Monday, September 14, 2026',
      open_rule_quote: NLS_OPEN_RULE,
      ...patch,
    },
    'csfp-news': { id: 'csfp-news', last_attempt_at: now, last_ok_at: now, last_result: 'ok' },
  }
}
