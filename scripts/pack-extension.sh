#!/usr/bin/env bash
# Zip the built extension in dist/ with the manifest at the archive root.
# Run `npm run build` first, or use `npm run pack`, which does both.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist"
OUT_DIR="$ROOT/builds"
FORCE=0

if [[ "${1:-}" == "--force" ]]; then
  FORCE=1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required" >&2
  exit 1
fi

if [[ ! -f "$DIST/manifest.json" ]]; then
  echo "dist/manifest.json is missing. Run npm run build first." >&2
  exit 1
fi

VERSION="$(jq -r '.version' "$DIST/manifest.json")"
NAME="cove-downloader-helper"
ZIP_PATH="$OUT_DIR/${NAME}-${VERSION}-chrome.zip"

if [[ -f "$ZIP_PATH" && "$FORCE" -ne 1 ]]; then
  echo "file $ZIP_PATH already exists. use --force to overwrite" >&2
  exit 1
fi

jq -e '.manifest_version == 3 and .name and .version' "$DIST/manifest.json" >/dev/null
test -f "$DIST/background.js"
test -f "$DIST/panel.html"
test -f "$DIST/content/main.js"
test -f "$DIST/layouts/index.json"

mkdir -p "$OUT_DIR"
rm -f "$ZIP_PATH"
(
  cd "$DIST"
  zip -9 -r "$ZIP_PATH" ./* >/dev/null
)

echo "Packed Chrome extension: $ZIP_PATH"
ls -la "$ZIP_PATH"
