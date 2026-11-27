// Browser end-to-end tests for the workbench (npm run test:e2e).
// They run against the production build in replay mode: no model key, no backend, so the saved
// sample tender (TENDER-2026-402) is the only data and every run gives the same result for free.
// Build first (npm run build or npm run cf:build), then run.
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT || 3100);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // Blank every engine setting so the run is always replay mode, even on a machine with .env.local.
    env: { LLM_API_KEY: '', LLM_MODEL_NAME: '', BACKEND_URL: '', NEXT_PUBLIC_API_URL: '', REVIEW_TOKEN: '' },
  },
});
