import { defineConfig, devices } from '@playwright/test'
import process from 'node:process'

const productionUrl = process.env.PRODUCTION_APP_URL

if (!productionUrl) {
  throw new Error('PRODUCTION_APP_URL is required for production smoke tests.')
}

export default defineConfig({
  testDir: './tests/production',
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  forbidOnly: true,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  outputDir: 'test-results-production',
  reporter: [['list'], ['html', {
    outputFolder: 'playwright-report-production',
    open: 'never',
  }]],
  use: {
    baseURL: productionUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'production-chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
