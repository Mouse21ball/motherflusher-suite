import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { metaImagesPlugin } from "./vite-plugin-meta-images";

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    tailwindcss(),
    metaImagesPlugin(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  css: {
    postcss: {
      plugins: [],
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  // Read .env files from the project root (not client/) so VITE_* vars in
  // .env.local are picked up by the browser bundle.
  envDir: path.resolve(import.meta.dirname),
  define: {
    'import.meta.env.VITE_API_BASE_URL': JSON.stringify(
      process.env.VITE_API_BASE_URL ?? ''
    ),
    'import.meta.env.VITE_BUILD_COMMIT': JSON.stringify(
      process.env.VITE_BUILD_COMMIT ?? process.env.GIT_COMMIT_SHA ?? process.env.CM_COMMIT ?? 'unknown'
    ),
    'import.meta.env.VITE_BUILD_TIMESTAMP': JSON.stringify(
      process.env.VITE_BUILD_TIMESTAMP ?? process.env.BUILD_TIMESTAMP ?? process.env.CM_BUILD_TIMESTAMP ?? 'unknown'
    ),
  },
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  esbuild: {
    // In production builds, drop debugger statements and treat these
    // console methods as pure (no side-effects) so R8/tree-shaking removes
    // them.  console.error and console.warn are intentionally preserved for
    // crash reporting visibility.
    drop: process.env.NODE_ENV === "production" ? ["debugger"] : [],
    pure: process.env.NODE_ENV === "production"
      ? ["console.log", "console.debug", "console.info"]
      : [],
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
