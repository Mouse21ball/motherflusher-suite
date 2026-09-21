import { accessSync, constants } from 'node:fs';
import { delimiter, join } from 'node:path';
import { chromium, defineConfig } from '@playwright/test';

const chromiumExecutableEnv = 'PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH';

function isExecutable(path: string): boolean {
  try {
    accessSync(path, process.platform === 'win32' ? constants.F_OK : constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function findChromiumExecutable(): string {
  const configuredPath = process.env[chromiumExecutableEnv];
  if (configuredPath) {
    if (isExecutable(configuredPath)) {
      return configuredPath;
    }

    throw new Error(
      `${chromiumExecutableEnv} points to "${configuredPath}", but that file is not executable. ` +
        'Set it to a Chromium or Chrome executable, or unset it and run "npm run test:browser:install".',
    );
  }

  const playwrightPath = chromium.executablePath();
  if (isExecutable(playwrightPath)) {
    return playwrightPath;
  }

  const executableNames =
    process.platform === 'win32'
      ? ['chromium.exe', 'chrome.exe', 'msedge.exe']
      : ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable'];
  const pathDirectories = (process.env.PATH ?? '').split(delimiter).filter(Boolean);

  for (const directory of pathDirectories) {
    for (const executableName of executableNames) {
      const candidate = join(directory, executableName);
      if (isExecutable(candidate)) {
        return candidate;
      }
    }
  }

  throw new Error(
    'No Chromium browser was found for the deal animation checks. ' +
      'Run "npm run test:browser:install", install Chromium or Chrome on PATH, ' +
      `or set ${chromiumExecutableEnv} to its executable path.`,
  );
}

export default defineConfig({
  testDir: './tests/browser',
  testMatch: '**/*.spec.ts',
  timeout: 10_000,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 375, height: 667 },
    launchOptions: {
      executablePath: findChromiumExecutable(),
      args: ['--no-sandbox'],
    },
  },
  webServer: {
    command: 'npm run dev:client -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173/table-deal-test.html',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});