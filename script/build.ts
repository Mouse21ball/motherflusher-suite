import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile } from "fs/promises";
import { execFileSync } from "node:child_process";

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "@googleapis/androidpublisher", // bundled: Replit VM deploy has no node_modules at runtime
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pg",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

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

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  const buildCommit =
    process.env.GIT_COMMIT_SHA?.trim()
    || process.env.CM_COMMIT?.trim()
    || resolveGitCommit();
  const buildTimestamp =
    process.env.BUILD_TIMESTAMP?.trim()
    || process.env.CM_BUILD_TIMESTAMP?.trim()
    || new Date().toISOString();

  // Vite reads these from process.env while loading vite.config.ts. The
  // server bundle receives the same values through esbuild defines below.
  process.env.GIT_COMMIT_SHA = buildCommit;
  process.env.BUILD_TIMESTAMP = buildTimestamp;
  process.env.VITE_BUILD_COMMIT = buildCommit;
  process.env.VITE_BUILD_TIMESTAMP = buildTimestamp;

  console.log("building client...");
  await viteBuild();

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
      "process.env.GIT_COMMIT_SHA": JSON.stringify(buildCommit),
      "process.env.BUILD_TIMESTAMP": JSON.stringify(buildTimestamp),
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
