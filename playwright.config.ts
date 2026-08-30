import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: { baseURL: 'http://127.0.0.1:3100', trace: 'on-first-retry' },
  webServer: {
    command: 'node dist-server/server/index.js',
    env: { PORT: '3100' },
    url: 'http://127.0.0.1:3100/api/health',
    reuseExistingServer: false,
    timeout: 120_000
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
});
