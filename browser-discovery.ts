import { accessSync, constants } from 'node:fs';
import { delimiter, join } from 'node:path';

export const chromiumExecutableEnv = 'PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH';

export interface ChromiumDiscoveryOptions {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  playwrightExecutablePath: () => string;
  isExecutable?: (path: string) => boolean;
}

function executableCheck(platform: NodeJS.Platform): (path: string) => boolean {
  return (path) => {
    try {
      accessSync(path, platform === 'win32' ? constants.F_OK : constants.X_OK);
      return true;
    } catch {
      return false;
    }
  };
}

export function findChromiumExecutable({
  env = process.env,
  platform = process.platform,
  playwrightExecutablePath,
  isExecutable = executableCheck(platform),
}: ChromiumDiscoveryOptions): string {
  const configuredPath = env[chromiumExecutableEnv];
  if (configuredPath) {
    if (isExecutable(configuredPath)) {
      return configuredPath;
    }

    throw new Error(
      `${chromiumExecutableEnv} points to "${configuredPath}", but that file is not executable. ` +
        'Set it to a Chromium or Chrome executable, or unset it and run "npm run test:browser:install".',
    );
  }

  const playwrightPath = playwrightExecutablePath();
  if (isExecutable(playwrightPath)) {
    return playwrightPath;
  }

  const executableNames =
    platform === 'win32'
      ? ['chromium.exe', 'chrome.exe', 'msedge.exe']
      : ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable'];
  const pathDirectories = (env.PATH ?? '').split(delimiter).filter(Boolean);

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