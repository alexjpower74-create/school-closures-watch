// Pick your schools: search, tap to add, Done, reload keeps it, Remove, accent-insensitive search.
import { test, expect } from '@playwright/test'
import { press, typeSearch, mockUrl, card, savedIds } from './helpers.mjs'

test('pick Glovertown, keep it across a reload, remove it; "boreale" finds École Boréale', async ({ page }, testInfo) => {
  await page.goto(mockUrl('index.html'))
  await expect(page.getByRole('link', { name: 'Pick your schools' })).toBeVisible()
  await press(page.getByRole('link', { name: 'Pick your schools' }), testInfo)
  await page.waitForURL(/\/pick\.html\?/)

  await typeSearch(page, testInfo, 'glover')
  const result = page.locator('[data-testid="pick-result"][data-school-id="nls-300422"]')
  await expect(result).toContainText('Glovertown Academy')
  await expect(result).toHaveAttribute('aria-pressed', 'false')
  await press(result, testInfo)
  await expect(result).toHaveAttribute('aria-pressed', 'true')
  await expect(result).toContainText('Added')
  await expect(page.getByTestId('pick-selected')).toContainText('Glovertown Academy')

  await press(page.getByRole('link', { name: 'Done' }), testInfo)
  await page.waitForURL(/\/index\.html\?/)
  await expect(card(page, 'nls-300422')).toBeVisible()
  await expect(card(page, 'nls-300422').locator('.school-name')).toHaveText('Glovertown Academy')
  expect(await savedIds(page)).toEqual(['nls-300422'])

  await page.reload()
  await expect(card(page, 'nls-300422')).toBeVisible()
  await expect(page.getByTestId('school-card')).toHaveCount(1)

  await press(page.getByRole('link', { name: 'Change my schools' }), testInfo)
  await page.waitForURL(/\/pick\.html\?/)
  const selected = page.getByTestId('pick-selected')
  await expect(selected).toContainText('Glovertown Academy')
  await press(selected.getByRole('button', { name: 'Remove Glovertown Academy' }), testInfo)
  await expect(selected).not.toContainText('Glovertown Academy')
  expect(await savedIds(page)).toEqual([])

  await typeSearch(page, testInfo, 'boreale')
  const boreale = page.locator('[data-testid="pick-result"][data-school-id="csfp-500472"]')
  await expect(boreale).toContainText('École Boréale')
  await expect(page.getByTestId('pick-result')).toHaveCount(1)

  await press(page.getByRole('link', { name: 'Done' }), testInfo)
  await page.waitForURL(/\/index\.html\?/)
  await expect(page.getByTestId('school-card')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Pick your schools' })).toBeVisible()
})

test('private schools say there is no official closure list', async ({ page }, testInfo) => {
  await page.goto(mockUrl('pick.html'))
  await typeSearch(page, testInfo, 'anchor')
  await expect(page.locator('[data-testid="pick-result"][data-school-id="private-anchor-academy"]')).toContainText(
    'No official closure list, call the school',
  )
})
