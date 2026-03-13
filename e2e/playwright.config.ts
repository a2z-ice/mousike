import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  retries: 1,
  reporter: [['html'], ['list']],
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'on-first-retry',
    screenshot: 'on',
  },
  projects: [
    {
      name: 'api',
      testMatch: /api\/.+\.spec\.ts/,
    },
    {
      name: 'ui',
      testMatch: /ui\/.+\.spec\.ts/,
      use: { browserName: 'chromium' },
    },
    {
      name: 'full-stack',
      testMatch: /full-stack\/.+\.spec\.ts/,
      use: { browserName: 'chromium' },
    },
  ],
});
