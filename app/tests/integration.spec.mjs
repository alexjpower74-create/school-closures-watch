// Integration against a real local Worker seeded with sc1's worker/tests/seed.mjs.
// SC_WORKER_URL=http://127.0.0.1:8208 npx playwright test -c app/playwright.config.mjs integration
// Skipped unless SC_WORKER_URL is set. Runs on chromium-390 and webkit-1280 only.
// SC_INTEGRATION_IDS (optional) = comma-separated school ids to pick; defaults to the two real 2026-09-14 rows + one
// unlisted NLSchools school + one CSFP school.
import { test, expect } from '@playwright/test'
import { press, typeSearch, openRegion } from './helpers.mjs'

const API = (process.env.SC_WORKER_URL || '').replace(/\/+$/, '')
const PICKS = [
  ['glover', 'nls-300422'],
  ['eastside', 'nls-200498'],
  ['gander elementary', 'nls-300495'],
  ['boreale', 'csfp-500472'],
]
const IDS = (process.env.SC_INTEGRATION_IDS || '').split(',').filter(Boolean)

test.skip(!API, 'SC_WORKER_URL is not set')

const q = `api=${encodeURIComponent(API)}&sample=1`

test('My schools, Today and a notice match the Worker', async ({ page, request }, testInfo) => {
  test.skip(!['chromium-390', 'webkit-1280'].includes(testInfo.project.name), 'integration runs on chromium-390 and webkit-1280')

  // Pick through the UI against the real school list.
  await page.goto(`/pick.html?${q}`)
  const picks = IDS.length ? IDS.map((id) => [null, id]) : PICKS
  for (const [text, id] of picks) {
    if (text) await typeSearch(page, testInfo, text)
    else {
      const { schools } = await (await request.get(`${API}/api/schools`)).json()
      const s = schools.find((x) => x.id === id)
      await typeSearch(page, testInfo, s.name)
    }
    const result = page.locator(`[data-testid="pick-result"][data-school-id="${id}"]`)
    await press(result, testInfo)
    await expect(result).toHaveAttribute('aria-pressed', 'true')
  }
  await press(page.getByRole('link', { name: 'Done' }), testInfo)
  await page.waitForURL(/\/index\.html\?/)
  const ids = picks.map(([, id]) => id)
  await expect(page.getByTestId('school-card')).toHaveCount(ids.length)

  // My schools: same order, statuses and labels as /api/status (which is already sorted, API.md §7).
  const status = await (await request.get(`${API}/api/status?ids=${ids.join(',')}&include_sample=1`)).json()
  const pageIds = await page.getByTestId('school-card').evaluateAll((els) => els.map((e) => e.dataset.schoolId))
  expect(pageIds).toEqual(status.schools.map((s) => s.school.id))
  for (const s of status.schools) {
    const c = page.locator(`[data-testid="school-card"][data-school-id="${s.school.id}"]`)
    await expect(c).toHaveAttribute('data-status', s.status)
    await expect(c.getByTestId('status-label')).toHaveText(s.label)
    if (s.reason_text) await expect(c.getByTestId('reason')).toHaveText(s.reason_text)
  }
  await expect(page.getByTestId('stale-banner')).toHaveCount(status.stale.length > 0 ? 1 : 0)

  // Today: every current notice id in its region.
  const today = await (await request.get(`${API}/api/today?include_sample=1`)).json()
  await page.goto(`/today.html?${q}`)
  await expect(page.getByTestId('region-section')).toHaveCount(4)
  for (const r of today.regions) {
    if (r.notices.length === 0) continue
    const section = await openRegion(page, testInfo, r.region)
    for (const n of r.notices) {
      await expect(section.locator(`[data-testid="today-notice"][data-notice-id="${n.id}"]`)).toHaveCount(1)
    }
  }

  // A notice: the first applied notice from My schools, if any.
  const withNotice = status.schools.find((s) => s.applies.length > 0)
  test.skip(!withNotice, 'the seeded scenario has no applied notice')
  const noticeId = withNotice.applies[0].notice_id
  const detail = await (await request.get(`${API}/api/notices/${encodeURIComponent(noticeId)}?include_sample=1`)).json()
  await page.goto(`/notice.html?${q}&id=${encodeURIComponent(noticeId)}`)
  const d = page.getByTestId('notice-detail')
  await expect(d.getByTestId('quote')).toHaveText(detail.notice.quote)
  await expect(d.getByTestId('source-text')).toHaveText(detail.notice.source_text)
  const raw = d.getByRole('link', { name: /See the saved copy/ }).first()
  if (detail.raw_links.length) await expect(raw).toHaveAttribute('href', `${API}${detail.raw_links[0].href}`)
})
