import { chromium, defineConfig } from '@playwright/test';
import { findChromiumExecutable } from './browser-discovery';

export default defineConfig({
  testDir: './tests/browser',
  testMatch: '**/*.spec.ts',
  timeout: 10_000,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 375, height: 667 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      executablePath: findChromiumExecutable({
        playwrightExecutablePath: () => chromium.executablePath(),
      }),
      args: ['--no-sandbox'],
    },
  },
  webServer: {
    command: 'npm run dev:client -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173/table-deal-test.html',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});