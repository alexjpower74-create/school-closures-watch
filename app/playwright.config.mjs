// School Closures Watch app tests: npm run test:app (playwright test -c app/playwright.config.mjs)
import { defineConfig } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const PORT = Number(process.env.SC_APP_PORT || 8201)
const REPO = fileURLToPath(new URL('..', import.meta.url))

const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: false, deviceScaleFactor: 2 }
const desktop = { viewport: { width: 1280, height: 900 } }

export default defineConfig({
  testDir: './tests',
  testMatch: /.*\.spec\.mjs$/,
  outputDir: '../test-results/app',
  fullyParallel: true,
  retries: 0,
  reporter: [['list']],
  timeout: 90_000,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `node app/serve.mjs --port ${PORT}`,
    cwd: REPO,
    url: `http://127.0.0.1:${PORT}/index.html`,
    // Never measure somebody else's server on this port.
    reuseExistingServer: false,
    timeout: 15_000,
  },
  projects: [
    { name: 'chromium-390', use: { browserName: 'chromium', ...phone } },
    { name: 'chromium-1280', use: { browserName: 'chromium', ...desktop } },
    { name: 'webkit-390', use: { browserName: 'webkit', ...phone } },
    { name: 'webkit-1280', use: { browserName: 'webkit', ...desktop } },
  ],
})
