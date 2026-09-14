// Storm scenario: worst first, verbatim words, region-wide closure, the ambiguous "may apply" row, unmatched count.
import { test, expect } from '@playwright/test'
import { press, pickSchools, card, openRegion, mockUrl } from './helpers.mjs'

const BAY = 'nls-300407' // Bay d'Espoir Academy: real row, CLOSED FOR MORNING
const BISHOP = 'nls-400240' // Bishop White School: real row, DELAYED OPENING
const BOTWOOD = 'nls-300132' // Botwood Collegiate: Central, in no row
const GLOVER = 'nls-300422' // Glovertown Academy: the SAMPLE ambiguous row may apply
const LOUGHLIN = 'nls-200060' // C. C. Loughlin Elementary: Western
const AMBIGUOUS = 'nlschools-status-2024-01-10-sample-1-mock'
const REGION_NOTICE = 'nlschools-notices-2024-01-10-sample-central-mock'

test.describe('storm', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    // Picked in the "wrong" order on purpose: the page must sort.
    await pickSchools(page, testInfo, 'storm', [
      ['loughlin', LOUGHLIN],
      ['glover', GLOVER],
      ['bishop white', BISHOP],
      ['botwood', BOTWOOD],
      ["bay d'espoir", BAY],
    ])
  })

  test('cards are worst first, then by name', async ({ page }) => {
    const ids = await page.getByTestId('school-card').evaluateAll((els) => els.map((e) => e.dataset.schoolId))
    expect(ids).toEqual([BAY, BISHOP, BOTWOOD, GLOVER, LOUGHLIN])
    const statuses = await page.getByTestId('school-card').evaluateAll((els) => els.map((e) => e.dataset.status))
    expect(statuses).toEqual(['closed', 'closed', 'closed', 'closed', 'open'])
    // Bay d'Espoir's own notice (closed_part) comes before Bishop White's (delayed).
    await expect(card(page, BAY).locator('[data-notice-status="closed_part"]')).toHaveCount(1)
    await expect(card(page, BISHOP).locator('[data-notice-status="delayed"]')).toHaveCount(1)
  })

  test("Bay d'Espoir: label, the source's STATUS text and the verbatim quote", async ({ page }) => {
    const bay = card(page, BAY)
    await expect(bay.getByTestId('status-label')).toHaveText('Closed')
    const own = bay.locator('[data-notice-status="closed_part"]')
    await expect(own).toContainText('Closed part of the day')
    await expect(own).toContainText('CLOSED FOR MORNING')
    await expect(own.getByTestId('quote')).toHaveText(
      'School closed for the morning, further announcement at 11:00 a.m. NOTE: Water Outage',
    )
    await expect(own).toContainText("On the NLSchools list since 6:35 AM · NLSchools doesn't show a posted time")
    const bishop = card(page, BISHOP).locator('[data-notice-status="delayed"]')
    await expect(bishop).toContainText('Delayed opening')
    await expect(bishop.getByTestId('quote')).toHaveText('Delayed opening - 2 hours. NOTE: Delayed opening due to icy roads.')
  })

  test("a second applying notice is compact; its words open on tap, verbatim", async ({ page }, testInfo) => {
    const own = card(page, BAY).locator('[data-notice-status="closed_part"]')
    await expect(own).toHaveClass(/is-compact/)
    await expect(own.locator('.notice-mini-label')).toHaveText('Closed part of the day · CLOSED FOR MORNING')
    await expect(own.getByRole('link', { name: 'Read the notice' })).toBeVisible()
    const quote = own.getByTestId('quote')
    await expect(quote).toBeHidden()
    await press(own.getByText("Show the notice's words"), testInfo)
    await expect(quote).toBeVisible()
    await expect(quote).toHaveText('School closed for the morning, further announcement at 11:00 a.m. NOTE: Water Outage')
    await expect(own).toContainText("On the NLSchools list since 6:35 AM · NLSchools doesn't show a posted time")
    // The headline (region-wide) notice is shown in full without a tap.
    await expect(card(page, BAY).locator('.notice-block.is-headline').getByTestId('quote')).toBeVisible()
  })

  test('a Central school in no row is closed by the region-wide notice, and says so', async ({ page }) => {
    const botwood = card(page, BOTWOOD)
    await expect(botwood).toHaveAttribute('data-status', 'closed')
    await expect(botwood.getByTestId('status-label')).toHaveText('Closed')
    await expect(botwood.getByTestId('region-wide-line')).toContainText('names the whole Central region')
    await expect(botwood.getByTestId('quote')).toHaveText('SAMPLE All schools in the Central region are closed for the day')
    await expect(botwood.getByTestId('may-apply')).toHaveCount(0)
  })

  test('Glovertown: the ambiguous row is a "may apply" card, never an applied notice', async ({ page }) => {
    const glover = card(page, GLOVER)
    const may = glover.locator(`[data-testid="may-apply"][data-notice-id="${AMBIGUOUS}"]`)
    await expect(may).toBeVisible()
    await expect(may).toContainText('This notice may apply to your school')
    await expect(may).toContainText('The notice names a similar school: "SAMPLE Glovertown".')
    await expect(may.getByTestId('quote')).toHaveText('SAMPLE Closed due to storm')
    await expect(may.getByTestId('status-label')).toHaveCount(0)
    // The only applied notice is the region-wide one: that, not the ambiguous row, is why it says Closed.
    const applied = await glover.locator('.notice-block').evaluateAll((els) => els.map((e) => e.dataset.noticeId))
    expect(applied).toEqual([REGION_NOTICE])
    await expect(glover.getByTestId('region-wide-line')).toContainText('names the whole Central region')
    await expect(glover.locator('.notice-block').getByText('SAMPLE Closed due to storm')).toHaveCount(0)
  })

  test('a Western school is not affected, and shows the unmatched count', async ({ page }) => {
    const west = card(page, LOUGHLIN)
    await expect(west).toHaveAttribute('data-status', 'open')
    await expect(west.getByTestId('status-label')).toHaveText('Open, no notice')
    await expect(west.locator('.notice-block')).toHaveCount(0)
    await expect(west.getByTestId('region-wide-line')).toHaveCount(0)
    await expect(west.getByTestId('unmatched-count')).toContainText(
      "1 notice in the Western region couldn't be matched to a school",
    )
    await expect(card(page, BOTWOOD).getByTestId('unmatched-count')).toHaveCount(0)
  })
})

test('Today (storm): region-wide first, Central worst first, unmatched and earlier sections', async ({ page }, testInfo) => {
  await page.goto(mockUrl('today.html', 'storm'))
  const wide = page.locator(`[data-testid="today-notice"][data-notice-id="${REGION_NOTICE}"]`)
  await expect(wide.getByTestId('region-wide-line')).toContainText('names the whole Central region')
  const central = await openRegion(page, testInfo, 'central')
  const statuses = await central
    .locator('[data-testid="region-current"] > [data-testid="today-notice"]')
    .evaluateAll((els) => els.map((e) => e.dataset.status))
  // The SAMPLE ambiguous row is listed as NLSchools lists it (closed), marked "May apply to".
  expect(statuses).toEqual(['closed', 'closed_part', 'delayed', 'delayed'])
  await expect(central.locator('[data-testid="region-current"] > [data-testid="today-notice"]').first()).toContainText(
    'May apply to: Glovertown Academy (Glovertown)',
  )
  const earlier = central.getByTestId('region-earlier')
  await expect(earlier).toContainText('Earlier today (no longer listed)')
  await expect(earlier).toContainText('No longer on the list since 6:35 AM')
  const western = await openRegion(page, testInfo, 'western')
  const unmatched = western.getByTestId('region-unmatched')
  await expect(unmatched).toContainText('Not matched to a school in the provincial list')
  await expect(unmatched).toContainText('SAMPLE Some bus runs will be delayed')
})
