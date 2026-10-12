import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vitest/config";

const repoRoot = import.meta.dirname;

/**
 * Builds the extension pages (panel, options) and the module service worker. Content scripts need
 * classic IIFE bundles and are built by scripts/build-extension.mjs with their own inline config.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: path.resolve(repoRoot, "src/app"),
  publicDir: false,
  resolve: {
    alias: { "@": path.resolve(repoRoot, "src") },
  },
  build: {
    outDir: path.resolve(repoRoot, "dist"),
    emptyOutDir: true,
    target: "chrome116",
    modulePreload: false,
    sourcemap: false,
    rollupOptions: {
      input: {
        panel: path.resolve(repoRoot, "src/app/panel.html"),
        options: path.resolve(repoRoot, "src/app/options.html"),
        background: path.resolve(repoRoot, "src/background/index.ts"),
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === "background" ? "background.js" : "assets/[name]-[hash].js"),
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
  test: {
    dir: path.resolve(repoRoot, "src"),
    environment: "jsdom",
    globals: true,
    setupFiles: [path.resolve(repoRoot, "src/test/setup.ts")],
    include: ["**/*.test.{ts,tsx}"],
  },
});
