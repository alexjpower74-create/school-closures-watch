// Layout: no horizontal scroll, and every button / link / result is ≥ 44×44 and hit-tested at its centre.
import { test, expect } from '@playwright/test'
import { pickSchools, typeSearch, openRegion, mockUrl, expectTargetsHittable, expectNoHorizontalScroll } from './helpers.mjs'

test.describe.configure({ timeout: 240_000 })

test('My schools (storm, with may-apply and unmatched)', async ({ page }, testInfo) => {
  await pickSchools(page, testInfo, 'storm', [['glover', 'nls-300422'], ['loughlin', 'nls-200060'], ["bay d'espoir", 'nls-300407']])
  await expectNoHorizontalScroll(page)
  await expectTargetsHittable(page)
})

test('Pick (with results)', async ({ page }, testInfo) => {
  await pickSchools(page, testInfo, 'stale', [['glover', 'nls-300422']])
  await page.goto(mockUrl('pick.html', 'stale'))
  await typeSearch(page, testInfo, 'gander')
  await expect(page.getByTestId('pick-result')).not.toHaveCount(0)
  await expectNoHorizontalScroll(page)
  await expectTargetsHittable(page)
})

test('Today (storm, regions open)', async ({ page }, testInfo) => {
  await page.goto(mockUrl('today.html', 'storm'))
  await openRegion(page, testInfo, 'central')
  await openRegion(page, testInfo, 'western')
  await expectNoHorizontalScroll(page)
  await expectTargetsHittable(page)
})

test('Notice', async ({ page }) => {
  await page.goto(mockUrl('notice.html', 'storm', '&id=nlschools-status-2024-01-10-459-mock'))
  await expect(page.getByTestId('notice-detail')).toBeVisible()
  await expectNoHorizontalScroll(page)
  await expectTargetsHittable(page)
})

test('Sources', async ({ page }) => {
  await page.goto(mockUrl('sources.html'))
  await expect(page.getByTestId('source-row')).toHaveCount(8)
  await expectNoHorizontalScroll(page)
  await expectTargetsHittable(page)
})
