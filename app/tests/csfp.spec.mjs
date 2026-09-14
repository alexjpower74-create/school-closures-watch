// CSFP and private schools are never Open.
import { test, expect } from '@playwright/test'
import { pickSchools, card } from './helpers.mjs'

test('csfp: Boréale may-apply, another CSFP school Unknown, a private school Unknown', async ({ page }, testInfo) => {
  await pickSchools(page, testInfo, 'csfp', [
    ['boreale', 'csfp-500472'],
    ['sainte-anne', 'csfp-500107'],
    ['anchor', 'private-anchor-academy'],
  ])
  const boreale = card(page, 'csfp-500472')
  await expect(boreale).toHaveAttribute('data-status', 'may_apply')
  await expect(boreale.getByTestId('status-label')).toHaveText('A notice may apply')
  const may = boreale.getByTestId('may-apply')
  await expect(may).toHaveCount(1)
  await expect(may).toContainText('This notice may apply to your school')
  await expect(may).toContainText('A CSFP news post mentions this school.')
  await expect(may.getByTestId('quote')).toHaveText("SAMPLE École Boréale fermée aujourd'hui en raison de la tempête")
  await expect(may).toContainText('Posted SAMPLE Mon, 14 Sep 2026 16:00:00 +0000')

  const anne = card(page, 'csfp-500107')
  await expect(anne).toHaveAttribute('data-status', 'unknown')
  await expect(anne.getByTestId('reason')).toHaveText(
    "CSFP schools don't post closures online. The school tells families directly.",
  )
  await expect(anne.getByTestId('may-apply')).toHaveCount(0)

  const anchor = card(page, 'private-anchor-academy')
  await expect(anchor).toHaveAttribute('data-status', 'unknown')
  await expect(anchor.getByTestId('reason')).toContainText(/call the school/i)
  await expect(anchor.getByTestId('as-of')).toHaveCount(0)

  await expect(page.locator('[data-testid="school-card"][data-status="open"]')).toHaveCount(0)
})
