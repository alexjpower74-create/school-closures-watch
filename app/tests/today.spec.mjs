// Today with the real rows of 2026-09-14, and the quiet scenario.
import { test, expect } from '@playwright/test'
import { pickSchools, card, openRegion, mockUrl } from './helpers.mjs'

const OPEN_RULE = 'If your school is not listed below, the status is normal and open as usual.'

test('today (real rows): Glovertown Closed and Eastside Other notice, verbatim', async ({ page }, testInfo) => {
  await page.goto(mockUrl('today.html'))
  await expect(page.locator('.lead')).toContainText('NLSchools list for Monday, September 14, 2026 · checked 2:10 PM')

  const central = await openRegion(page, testInfo, 'central')
  const glover = central.locator('[data-testid="today-notice"]', { hasText: 'Glovertown Academy' })
  await expect(glover).toHaveCount(1)
  await expect(glover.getByTestId('status-label')).toHaveText('Closed')
  await expect(glover.getByTestId('source-status-text')).toHaveText('CLOSED ALL DAY')
  await expect(glover.getByTestId('quote')).toHaveText('School closed all day NOTE: Water Shut Off')
  await expect(glover).toContainText("NLSchools doesn't show a posted time")

  const western = await openRegion(page, testInfo, 'western')
  const east = western.locator('[data-testid="today-notice"]', { hasText: 'Eastside Elementary' })
  await expect(east.getByTestId('status-label')).toHaveText('Other notice, read it')
  await expect(east.getByTestId('source-status-text')).toHaveText('OTHER STATUS')
  await expect(east.getByTestId('quote')).toContainText('Other NOTE: Due to a water main break at the bottom of Massey Dr')
  await expect(page.getByTestId('today-empty')).toHaveCount(0)
})

test('today (real rows): My schools shows Glovertown Closed with its words', async ({ page }, testInfo) => {
  await pickSchools(page, testInfo, 'today', [
    ['glover', 'nls-300422'],
    ['eastside', 'nls-200498'],
  ])
  const glover = card(page, 'nls-300422')
  await expect(glover.getByTestId('status-label')).toHaveText('Closed')
  await expect(glover.getByTestId('source-status-text')).toHaveText('CLOSED ALL DAY')
  await expect(glover.getByTestId('quote')).toHaveText('School closed all day NOTE: Water Shut Off')
  await expect(glover).toContainText("On the NLSchools list since 2:10 PM · NLSchools doesn't show a posted time")
  await expect(glover.getByTestId('as-of')).toHaveText('As of 2:10 PM')
  await expect(card(page, 'nls-200498').getByTestId('status-label')).toHaveText('Other notice, read it')
})

test('quiet: Today is empty with the open rule; a picked NLSchools school is Open with "as of"', async ({ page }, testInfo) => {
  await page.goto(mockUrl('today.html', 'quiet'))
  const empty = page.getByTestId('today-empty')
  await expect(empty).toBeVisible()
  await expect(empty).toContainText('No schools are on the NLSchools list right now')
  await expect(empty.getByTestId('open-rule-quote')).toHaveText(OPEN_RULE)
  await expect(empty).toContainText('checked 6:40 AM')

  await pickSchools(page, testInfo, 'quiet', [['gander elementary', 'nls-300495']])
  const gander = card(page, 'nls-300495')
  await expect(gander).toHaveAttribute('data-status', 'open')
  await expect(gander.getByTestId('status-label')).toHaveText('Open, no notice')
  await expect(gander.getByTestId('as-of')).toHaveText('No notice on the NLSchools list as of 6:40 AM')
})
