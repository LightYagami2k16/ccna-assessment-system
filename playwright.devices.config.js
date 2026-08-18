import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'device-compatibility.spec.js',
  timeout: 60_000,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    { name: 'android-chrome', use: { ...devices['Pixel 7'] } },
    { name: 'iphone-safari', use: { ...devices['iPhone 14'] } },
    { name: 'ipad-safari', use: { ...devices['iPad Pro 11'] } },
    { name: 'desktop-edge', use: { ...devices['Desktop Edge'] } },
  ],
})
