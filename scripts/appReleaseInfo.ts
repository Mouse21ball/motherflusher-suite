import { readFileSync } from "node:fs";
import path from "node:path";

// Read native release sources, rather than package.json's unrelated npm version.
export function readAppReleaseInfo(root: string) {
  const ios = readFileSync(path.join(root, "ios/App/App.xcodeproj/project.pbxproj"), "utf8");
  const android = readFileSync(path.join(root, "android/app/build.gradle"), "utf8");
  function release(source: string, version: RegExp, build: RegExp) {
    const v = source.match(version)?.[1];
    const b = source.match(build)?.[1];
    if (!v || !b) throw new Error("Missing app release metadata");
    return { version: v, build: Number(b) };
  }
  const iosRelease = release(ios, /MARKETING_VERSION\s*=\s*([\d.]+);/, /CURRENT_PROJECT_VERSION\s*=\s*(\d+);/);
  const androidRelease = release(android, /versionName\s+"([^"]+)"/, /versionCode\s+(\d+)/);
  return { ios: iosRelease, android: androidRelease, web: androidRelease };
}
