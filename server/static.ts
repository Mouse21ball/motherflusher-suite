import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // Detroit 2026-10-15: Cache strategy — hashed assets (JS/CSS) can cache long-term
  // because Vite renames them every build. index.html must NEVER cache, otherwise
  // phones keep loading old JS bundles after a deploy.
  app.use(express.static(distPath, {
    // 1 year for hashed assets
    maxAge: '1y',
    immutable: true,
    setHeaders: (res, filePath) => {
      // Override: never cache index.html even when requested directly
      if (filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
    },
  }));

  // fall through to index.html if the file doesn't exist
  // NEVER cache index.html — always check the server for the latest version
  app.use("/{*path}", (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
