import { defineConfig, devices } from '@playwright/test'

const baseURL = 'http://127.0.0.1:3111'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL,
    headless: true,
    colorScheme: 'light',
    reducedMotion: 'reduce',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm start -- -H 127.0.0.1 -p 3111',
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
  projects: [
    { name: 'phone-360', use: { ...devices['Pixel 5'], viewport: { width: 360, height: 800 } } },
    { name: 'phone-390', use: { ...devices['Pixel 5'], viewport: { width: 390, height: 844 } } },
    { name: 'phone-430', use: { ...devices['Pixel 5'], viewport: { width: 430, height: 932 } } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
  ],
})
