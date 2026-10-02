import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sourceRoot = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  resolve: {
    alias: {
      "@": sourceRoot,
      "@shared": path.resolve(sourceRoot, "../../shared"),
    },
  },
  esbuild: {
    jsx: "automatic",
  },
  test: {
    include: ["client/src/**/*.test.ts", "client/src/**/*.test.tsx"],
  },
});