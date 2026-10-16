import { defineConfig, devices } from '@playwright/test';

/**
 * E2E against two production builds:
 *  - dist/        built with synthetic fixtures (DEALS_USE_FIXTURES=true) → feature tests
 *  - dist-empty/  built with no provider configured → honest empty states
 * Run `npm run test:e2e:build` first (or `npm run test:e2e:all`).
 */
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    trace: 'retain-on-failure',
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  webServer: [
    { command: 'npx astro preview --port 4321', port: 4321, reuseExistingServer: true, timeout: 60_000 },
    { command: 'npx serve dist-empty -l 4322 --no-clipboard', port: 4322, reuseExistingServer: true, timeout: 60_000 },
  ],
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:4321' }, testIgnore: /empty\.spec/ },
    { name: 'mobile', use: { ...devices['Pixel 7'], baseURL: 'http://localhost:4321' }, testIgnore: /empty\.spec/ },
    { name: 'empty', use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:4322' }, testMatch: /empty\.spec/ },
  ],
});
