import { delimiter, join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  chromiumExecutableEnv,
  findChromiumExecutable,
  type ChromiumDiscoveryOptions,
} from '../browser-discovery';

function discover(
  executablePaths: string[],
  overrides: Partial<ChromiumDiscoveryOptions> = {},
): string {
  return findChromiumExecutable({
    env: {},
    platform: 'linux',
    playwrightExecutablePath: () => '/managed/chromium',
    isExecutable: (path) => executablePaths.includes(path),
    ...overrides,
  });
}

describe('findChromiumExecutable', () => {
  it('uses a valid environment override before other browser sources', () => {
    const managedPath = vi.fn(() => '/managed/chromium');

    expect(
      discover(['/override/chrome'], {
        env: { [chromiumExecutableEnv]: '/override/chrome' },
        playwrightExecutablePath: managedPath,
      }),
    ).toBe('/override/chrome');
    expect(managedPath).not.toHaveBeenCalled();
  });

  it('rejects an invalid environment override instead of falling back', () => {
    expect(() =>
      discover(['/managed/chromium'], {
        env: { [chromiumExecutableEnv]: '/missing/chrome' },
      }),
    ).toThrow(
      `${chromiumExecutableEnv} points to "/missing/chrome", but that file is not executable`,
    );
  });

  it('uses Playwright-managed Chromium before checking PATH', () => {
    expect(
      discover(['/managed/chromium', '/tools/chromium'], {
        env: { PATH: '/tools' },
      }),
    ).toBe('/managed/chromium');
  });

  it('falls back to the first supported executable on PATH', () => {
    const firstDirectory = '/empty';
    const secondDirectory = '/tools';
    const chromePath = join(secondDirectory, 'google-chrome');

    expect(
      discover([chromePath], {
        env: { PATH: [firstDirectory, secondDirectory].join(delimiter) },
      }),
    ).toBe(chromePath);
  });

  it('explains how to install or override Chromium when none is available', () => {
    expect(() => discover([])).toThrow(/npm run test:browser:install/);
    expect(() => discover([])).toThrow(new RegExp(chromiumExecutableEnv));
  });
});