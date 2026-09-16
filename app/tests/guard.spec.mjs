// Quote guard (API.md §8.2): a notice whose quote isn't in its source_text is never rendered.
import { test, expect } from '@playwright/test'
import { pickSchools, card, mockUrl, openRegion } from './helpers.mjs'

const TAMPERED = 'nlschools-status-2026-09-14-sample-tampered-mock'

test('the tampered notice is not shown on My schools, Today or its notice page', async ({ page }, testInfo) => {
  const warnings = []
  page.on('console', (m) => {
    if (m.type() === 'warning') warnings.push(m.text())
  })
  await pickSchools(page, testInfo, 'checks', [
    ['gander academy', 'nls-300417'],
    ['glover', 'nls-300422'],
  ])
  const gander = card(page, 'nls-300417')
  await expect(gander).toHaveAttribute('data-status', 'unknown')
  await expect(gander.getByTestId('reason')).toContainText("didn't match the words we saved from the source")
  await expect(page.getByText('tampered quote')).toHaveCount(0)
  await expect(page.locator(`[data-notice-id="${TAMPERED}"]`)).toHaveCount(0)
  // A verified notice next to it still shows.
  await expect(card(page, 'nls-300422').getByTestId('quote')).toHaveText('School closed all day NOTE: Water Shut Off')
  // The district notice from the same scenario shows at the top.
  await expect(page.getByTestId('district-notice')).toContainText('SAMPLE Parents: check this page again at 11:00 a.m.')
  expect(warnings.some((w) => w.includes('quote guard') && w.includes(TAMPERED))).toBe(true)

  await page.goto(mockUrl('today.html', 'checks'))
  await openRegion(page, testInfo, 'central')
  await expect(page.locator('[data-testid="today-notice"]', { hasText: 'Glovertown Academy' })).toHaveCount(1)
  await expect(page.locator(`[data-notice-id="${TAMPERED}"]`)).toHaveCount(0)
  await expect(page.getByText('tampered quote')).toHaveCount(0)

  await page.goto(mockUrl('notice.html', 'checks', `&id=${TAMPERED}`))
  await expect(page.getByRole('heading', { name: "This notice can't be shown" })).toBeVisible()
  await expect(page.getByTestId('notice-detail')).toHaveCount(0)
  await expect(page.getByText('tampered quote')).toHaveCount(0)
})
