import { resolve } from 'node:path';
import { chromium, defineConfig } from '@playwright/test';
import { findChromiumExecutable } from './browser-discovery';

export default defineConfig({
  testDir: './tests/browser',
  testMatch: '**/productionColdStart.spec.ts',
  timeout: 60_000,
  workers: 1,
  reporter: 'list',
  outputDir: '.local/qa/production-playwright-results',
  use: {
    baseURL: 'http://127.0.0.1:4181',
    viewport: { width: 412, height: 915 },
    serviceWorkers: 'block',
    trace: 'off',
    screenshot: 'off',
    launchOptions: {
      executablePath: findChromiumExecutable({
        playwrightExecutablePath: () => chromium.executablePath(),
      }),
      args: ['--no-sandbox'],
    },
  },
  webServer: {
    command: 'PORT=4181 node tests/browser/production-static-server.mjs',
    url: 'http://127.0.0.1:4181/',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});