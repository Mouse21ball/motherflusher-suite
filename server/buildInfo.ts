import { execFileSync } from "node:child_process";

function resolveGitCommit(): string {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim() || "unknown";
  } catch {
    return "unknown";
  }
}

// Production builds receive these as compile-time defines from script/build.ts.
// Development servers fall back to the checked-out repository when available.
export const BUILD_COMMIT =
  process.env.GIT_COMMIT_SHA?.trim()
  || process.env.CM_COMMIT?.trim()
  || resolveGitCommit();

export const BUILD_TIMESTAMP =
  process.env.BUILD_TIMESTAMP?.trim()
  || process.env.CM_BUILD_TIMESTAMP?.trim()
  || new Date().toISOString();