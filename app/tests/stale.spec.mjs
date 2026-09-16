// Stale: the banner on all five screens; nothing is called Open; a listed school keeps its notice.
import { test, expect } from '@playwright/test'
import { pickSchools, card, mockUrl } from './helpers.mjs'

// core/schedule.js staleText wording (API.md §5.2, lead answer 14:50).
const BANNER = "We couldn't reach the NLSchools list at 2:55 PM. Statuses below are from 2:15 PM."

async function expectBanner(page) {
  const banner = page.getByTestId('stale-banner')
  await expect(banner).toBeVisible()
  await expect(banner).toHaveAttribute('role', 'alert')
  await expect(banner).toContainText(BANNER)
  await expect(banner.getByRole('link', { name: 'Open NLSchools School Status Report' })).toHaveAttribute(
    'href',
    'https://www.nlschools.ca/schools/statusreport.jsp',
  )
  // Not dismissible: no button inside it.
  await expect(banner.getByRole('button')).toHaveCount(0)
  // At the very top of the page.
  const top = await banner.evaluate((el) => el.getBoundingClientRect().top + window.scrollY)
  expect(top).toBeLessThanOrEqual(1)
}

test('stale banner on all five screens; unlisted school Unknown with the stale reason', async ({ page }, testInfo) => {
  await pickSchools(page, testInfo, 'stale', [
    ['gander elementary', 'nls-300495'],
    ['glover', 'nls-300422'],
  ])
  await expectBanner(page) // My schools

  const gander = card(page, 'nls-300495')
  await expect(gander).toHaveAttribute('data-status', 'unknown')
  await expect(gander.getByTestId('status-label')).toHaveText('Unknown')
  await expect(gander.getByTestId('reason')).toHaveText("We couldn't check NLSchools since 2:15 PM. Check nlschools.ca or call the school.")
  await expect(page.locator('[data-testid="school-card"][data-status="open"]')).toHaveCount(0)
  const glover = card(page, 'nls-300422')
  await expect(glover).toHaveAttribute('data-status', 'closed')
  await expect(glover.getByTestId('as-of')).toHaveText('As of 2:15 PM, the last good check')

  for (const path of ['pick.html', 'today.html', 'sources.html']) {
    await page.goto(mockUrl(path, 'stale'))
    await expectBanner(page)
  }
  await page.goto(mockUrl('notice.html', 'stale', '&id=nlschools-status-2026-09-14-468-mock'))
  await expect(page.getByTestId('notice-detail')).toBeVisible()
  await expectBanner(page)
})

test('no banner when every source is healthy', async ({ page }) => {
  await page.goto(mockUrl('today.html', 'today'))
  await expect(page.getByTestId('region-section')).toHaveCount(4)
  await expect(page.getByTestId('stale-banner')).toHaveCount(0)
})
