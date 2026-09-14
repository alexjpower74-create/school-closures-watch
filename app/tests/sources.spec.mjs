// Sources: every registry entry, kinds in words, terms quotes, coverage gaps.
import { test, expect } from '@playwright/test'
import { mockUrl } from './helpers.mjs'

const KINDS = {
  'nlschools-status': 'Checked',
  'nlschools-notices': 'Checked',
  'csfp-news': 'Checked',
  'nlschools-busplanner': 'Link only',
  'nlschools-social': 'Link only',
  'nlschools-weather-protocol': 'Link only',
  'csfp-transport': 'Link only',
  'radio-aggregators': 'Not used',
}

test('every registry entry, kind in words, terms quotes', async ({ page }) => {
  await page.goto(mockUrl('sources.html'))
  const rows = page.getByTestId('source-row')
  await expect(rows).toHaveCount(Object.keys(KINDS).length)
  for (const [id, words] of Object.entries(KINDS)) {
    const row = page.locator(`[data-testid="source-row"][data-source="${id}"]`)
    await expect(row.getByTestId('source-kind')).toHaveText(words)
  }
  const status = page.locator('[data-testid="source-row"][data-source="nlschools-status"]')
  await expect(status.getByTestId('terms-quote')).toContainText(
    "may be used and reproduced solely for non-commercial, personal or educational purposes provided that it is not modified",
  )
  await expect(status).toContainText('Last good check')
  await expect(status).toContainText('Worked')
  await expect(page.locator('[data-testid="source-row"][data-source="csfp-news"]')).toContainText(
    'No terms of use found on this site.',
  )
  await expect(page.locator('[data-testid="source-row"][data-source="nlschools-busplanner"]')).toContainText(
    "Bus delays and cancellations aren't published publicly; the Parent Portal needs a login.",
  )
  await expect(page.locator('[data-testid="source-row"][data-source="radio-aggregators"]')).toContainText(
    'Not an official source.',
  )
  await expect(page.getByTestId('schools-origin')).toContainText('269 schools: 249 NLSchools, 6 CSFP, 8 private, 3 Indigenous and 3 other.')
  await expect(page.getByTestId('coverage-gaps')).toContainText("CSFP (French-language) schools don't post closures online")
})
