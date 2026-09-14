// Notice detail: fields as given, removed notices, applies-to and may-apply-to.
import { test, expect } from '@playwright/test'
import { press, mockUrl, pickSchools, card } from './helpers.mjs'

test('a real row: every field, as given', async ({ page }) => {
  await page.goto(mockUrl('notice.html', 'storm', '&id=nlschools-status-2024-01-10-459-mock'))
  const d = page.getByTestId('notice-detail')
  await expect(d).toBeVisible()
  await expect(d.getByRole('heading', { level: 1 })).toHaveText("Bay d'Espoir Academy, St. Alban's, NL")
  await expect(d.getByTestId('status-label')).toHaveText('Closed part of the day')
  await expect(d.getByTestId('source-status-text')).toHaveText('CLOSED FOR MORNING')
  await expect(d.getByTestId('quote')).toHaveText('School closed for the morning, further announcement at 11:00 a.m. NOTE: Water Outage')
  await expect(d.getByTestId('source-text')).toHaveText(
    "Bay d'Espoir Academy St. Alban's, NL CLOSED FOR MORNING School closed for the morning, further announcement at 11:00 a.m. NOTE: Water Outage FOS 05 CENTRAL",
  )
  await expect(d).toContainText('FOS 05')
  await expect(d).toContainText('CENTRAL')
  await expect(d).toContainText("NLSchools doesn't show a posted time")
  await expect(d).toContainText('First seen6:35 AM')
  await expect(d).toContainText('Last seen6:40 AM')
  await expect(d.getByTestId('removed-at')).toHaveCount(0)
  await expect(d.getByRole('link', { name: 'Open NLSchools School Status Report' })).toHaveAttribute(
    'href',
    'https://www.nlschools.ca/schools/statusreport.jsp',
  )
  await expect(d.getByTestId('applies-to')).toHaveText("Bay d'Espoir Academy (St. Alban's): named on the list")
  await expect(d.getByTestId('may-apply-to')).toHaveCount(0)
})

test('a removed notice says "No longer on the list since"', async ({ page }) => {
  await page.goto(mockUrl('notice.html', 'storm', '&id=nlschools-status-2024-01-10-sample-3-mock'))
  const d = page.getByTestId('notice-detail')
  await expect(d.getByTestId('removed-at')).toHaveText('No longer on the list since 6:35 AM')
})

test('the region-wide notice applies to Central NLSchools schools only', async ({ page }) => {
  await page.goto(mockUrl('notice.html', 'storm', '&id=nlschools-notices-2024-01-10-sample-central-mock'))
  const list = page.getByTestId('applies-to')
  await expect(list).toContainText('Botwood Collegiate (Botwood): the notice names the whole region')
  await expect(list.locator('li')).toHaveCount(12)
  await expect(list).not.toContainText('Eastside Elementary')
  await expect(list).not.toContainText('École')
  await expect(page.getByTestId('region-wide-line')).toContainText('names the whole Central region')
})

test('the ambiguous row lists who it may apply to, and why; reached from My schools', async ({ page }, testInfo) => {
  await pickSchools(page, testInfo, 'storm', [['glover', 'nls-300422']])
  await press(card(page, 'nls-300422').getByTestId('may-apply').getByRole('link', { name: 'Read the notice' }), testInfo)
  await page.waitForURL(/\/notice\.html\?/)
  const d = page.getByTestId('notice-detail')
  await expect(d.getByTestId('may-apply-to')).toHaveText(
    'Glovertown Academy (Glovertown): The notice names a similar school: "SAMPLE Glovertown".',
  )
  await expect(d.getByTestId('applies-to')).toHaveText('No school for certain.')
})
