import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  // The motion checks sample animations in flight, so they run one at a time.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { viewport: { width: 1360, height: 900 } },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1360, height: 900 } } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1360, height: 900 } } },
  ],
});
