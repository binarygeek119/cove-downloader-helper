#!/usr/bin/env node
// Build the whole extension into dist/: pages and worker via vite.config.ts, each content script
// as a classic IIFE bundle, then the manifest (version from package.json), icons, and layouts.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const watch = process.argv.includes("--watch");

const CONTENT_SCRIPTS = [
  { name: "content/main", entry: "src/content/main.ts" },
  { name: "content/page-videos", entry: "src/content/page-videos.ts" },
];

async function buildPages() {
  await build({ configFile: path.join(root, "vite.config.ts"), logLevel: "info" });
}

async function buildContentScript({ name, entry }) {
  await build({
    configFile: false,
    root,
    logLevel: "warn",
    resolve: { alias: { "@": path.join(root, "src") } },
    build: {
      outDir: dist,
      emptyOutDir: false,
      target: "chrome116",
      sourcemap: false,
      lib: {
        entry: path.join(root, entry),
        formats: ["iife"],
        name: "CoveContentScript",
        fileName: () => `${name}.js`,
      },
    },
  });
}

function copyDir(from, to, filter = () => true) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (!entry.isFile() || !filter(entry.name)) continue;
    fs.copyFileSync(path.join(from, entry.name), path.join(to, entry.name));
  }
}

function writeManifest() {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "src/manifest.json"), "utf8"));
  manifest.version = pkg.version;
  fs.writeFileSync(path.join(dist, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
}

function assertExists(relative) {
  if (!fs.existsSync(path.join(dist, relative))) throw new Error(`Build output is missing ${relative}`);
}

function verify(manifest) {
  assertExists(manifest.background.service_worker);
  assertExists(manifest.side_panel.default_path);
  assertExists(manifest.options_ui.page);
  for (const file of Object.values(manifest.icons)) assertExists(file);
  for (const script of CONTENT_SCRIPTS) assertExists(`${script.name}.js`);
  assertExists("layouts/index.json");
  for (const entry of manifest.web_accessible_resources ?? []) for (const file of entry.resources) assertExists(file);
}

async function run() {
  await buildPages();
  for (const script of CONTENT_SCRIPTS) await buildContentScript(script);
  copyDir(path.join(root, "src/icons"), path.join(dist, "icons"), (name) => name.endsWith(".png"));
  copyDir(
    path.join(root, "src/layouts"),
    path.join(dist, "layouts"),
    (name) => name.endsWith(".lay") || name === "index.json",
  );
  const manifest = writeManifest();
  verify(manifest);
  console.log(`Built Cove Downloader Helper ${manifest.version} into ${path.relative(root, dist)}/`);
}

if (watch) {
  // Simple watch: rebuild everything when a source file changes.
  let timer = null;
  let running = false;
  const rebuild = async () => {
    if (running) return;
    running = true;
    try {
      await run();
    } catch (error) {
      console.error(error);
    } finally {
      running = false;
    }
  };
  await rebuild();
  fs.watch(path.join(root, "src"), { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(rebuild, 250);
  });
  console.log("Watching src/ for changes…");
} else {
  await run();
}
