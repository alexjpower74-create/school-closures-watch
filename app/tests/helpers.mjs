// Shared test helpers. Real input only: taps on phone projects, clicks on desktop, typing with the keyboard, the
// mouse wheel. Nothing is set through evaluate; evaluate only reads (elementFromPoint, localStorage, sizes).
import { expect } from '@playwright/test'

export const isPhone = (testInfo) => testInfo.project.name.endsWith('-390')

/** Tap on touch projects, click otherwise. */
export async function press(locator, testInfo) {
  await locator.scrollIntoViewIfNeeded()
  if (testInfo.project.use.hasTouch) await locator.tap()
  else await locator.click()
}

export const mockUrl = (path, scenario, extra = '') => `/${path}?mock=1${scenario ? `&scenario=${scenario}` : ''}${extra}`

/** Put the cursor in the search box and replace its text by typing. */
export async function typeSearch(page, testInfo, text) {
  const box = page.getByTestId('pick-search')
  await press(box, testInfo)
  await box.press('ControlOrMeta+a')
  await box.press('Backspace')
  await page.keyboard.type(text)
}

/**
 * Pick schools through the Pick screen and land on My schools.
 * `picks` = [[searchText, schoolId], …].
 */
export async function pickSchools(page, testInfo, scenario, picks) {
  await page.goto(mockUrl('pick.html', scenario))
  for (const [text, id] of picks) {
    await typeSearch(page, testInfo, text)
    const result = page.locator(`[data-testid="pick-result"][data-school-id="${id}"]`)
    await press(result, testInfo)
    await expect(result).toHaveAttribute('aria-pressed', 'true')
  }
  await press(page.getByRole('link', { name: 'Done' }), testInfo)
  await page.waitForURL(/\/index\.html\?/)
  await expect(page.getByTestId('school-card')).toHaveCount(picks.length)
}

export const card = (page, id) => page.locator(`[data-testid="school-card"][data-school-id="${id}"]`)

/** Open a region on Today (collapsed on phone): tap its summary if it is closed. */
export async function openRegion(page, testInfo, region) {
  const section = page.locator(`[data-testid="region-section"][data-region="${region}"]`)
  await expect(section).toHaveCount(1)
  if (!(await section.evaluate((d) => d.open))) await press(section.locator('summary'), testInfo)
  await expect(section).toHaveJSProperty('open', true)
  return section
}

/** Scroll with the mouse wheel until the element sits near the middle of the viewport. */
export async function wheelIntoView(page, locator) {
  const vp = page.viewportSize()
  await page.mouse.move(Math.round(vp.width / 2), Math.round(vp.height / 2))
  for (let i = 0; i < 60; i++) {
    const box = await locator.boundingBox()
    if (!box) throw new Error('element has no box')
    const cy = box.y + box.height / 2
    const target = vp.height * 0.45
    if (Math.abs(cy - target) < vp.height * 0.25) return
    const before = await page.evaluate(() => window.scrollY)
    await page.mouse.wheel(0, Math.max(-600, Math.min(600, cy - target)))
    await page.waitForFunction((b) => window.scrollY !== b, before, { timeout: 700, polling: 30 }).catch(() => {})
    if ((await page.evaluate(() => window.scrollY)) === before) return // top or bottom of the page
  }
}

export const TARGETS = 'a, button, input, summary, [data-testid="pick-result"]'

/**
 * Every visible tap target is at least 44×44 and is what the user hits at its centre
 * (document.elementFromPoint returns the element or a descendant).
 */
export async function expectTargetsHittable(page, selector = TARGETS) {
  const locator = page.locator(selector)
  const n = await locator.count()
  const failures = []
  let checked = 0
  for (let i = 0; i < n; i++) {
    const t = locator.nth(i)
    if (!(await t.isVisible())) continue
    await wheelIntoView(page, t)
    const r = await t.evaluate((el) => {
      const b = el.getBoundingClientRect()
      const x = b.left + b.width / 2
      const y = b.top + b.height / 2
      const hit = document.elementFromPoint(x, y)
      return {
        w: b.width,
        h: b.height,
        hit: !!hit && (hit === el || el.contains(hit)),
        by: hit ? `${hit.tagName.toLowerCase()}.${hit.className}` : 'nothing',
        label: (el.textContent || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.tagName)
          .trim()
          .replace(/\s+/g, ' ')
          .slice(0, 40),
      }
    })
    checked++
    if (!r.hit) failures.push(`"${r.label}" is covered by ${r.by}`)
    if (r.h < 44 || r.w < 44) failures.push(`"${r.label}" is ${Math.round(r.w)}×${Math.round(r.h)} (< 44)`)
  }
  expect(checked, 'visible tap targets checked').toBeGreaterThan(0)
  expect(failures).toEqual([])
  return checked
}

export async function expectNoHorizontalScroll(page) {
  const { sw, iw } = await page.evaluate(() => ({
    sw: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    iw: window.innerWidth,
  }))
  expect(sw, `page is ${sw}px wide in a ${iw}px viewport`).toBeLessThanOrEqual(iw)
}

/** Read the saved ids (assert only). */
export const savedIds = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('scw.schools.v1') || 'null'))
