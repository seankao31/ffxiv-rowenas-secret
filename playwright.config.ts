import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /\.mobile\.test\.ts$/,
    },
    {
      name: 'mobile',
      use: { ...devices['iPhone 14'] },
      testIgnore: [/\.desktop\.test\.ts$/, /craft-api\.test\.ts$/],
    },
  ],
  webServer: {
    command: 'unset FORCE_COLOR; NO_COLOR=1 FIXTURE_DATA=true vite dev',
    wait: {
      stdout: /Local:\s+(?<playwright_test_base_url>http:\/\/localhost:\d+)/,
    },
    reuseExistingServer: false,
  },
})
