#!/usr/bin/env bash
# Pack Cove Downloader Helper as a Chrome extension archive (manifest at zip root).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/src"
OUT_DIR="$ROOT/builds"
FORCE=0

if [[ "${1:-}" == "--force" ]]; then
  FORCE=1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required" >&2
  exit 1
fi

VERSION="$(jq -r '.version' "$SRC/manifest.json")"
if [[ -z "$VERSION" || "$VERSION" == "null" ]]; then
  echo "can't parse version from manifest file" >&2
  exit 1
fi

NAME="cove-downloader-helper"
ZIP_NAME="${NAME}-${VERSION}-chrome.zip"
ZIP_PATH="$OUT_DIR/$ZIP_NAME"
STAGE="$OUT_DIR/.pack-staging"

if [[ -f "$ZIP_PATH" && "$FORCE" -ne 1 ]]; then
  echo "file $ZIP_PATH already exists. use --force to overwrite" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
rm -rf "$STAGE"
mkdir -p "$STAGE"

# Copy only extension files needed to load/pack (no repo junk).
cp "$SRC/manifest.json" "$STAGE/"
cp "$SRC"/*.js "$STAGE/" 2>/dev/null || true
cp "$SRC"/*.html "$STAGE/" 2>/dev/null || true
cp "$SRC"/*.css "$STAGE/" 2>/dev/null || true
cp "$SRC"/*.png "$STAGE/" 2>/dev/null || true
mkdir -p "$STAGE/layouts"
cp "$SRC/layouts/"*.lay "$STAGE/layouts/"
cp "$SRC/layouts/index.json" "$STAGE/layouts/index.json"

# Validate pack contents
test -f "$STAGE/manifest.json"
test -f "$STAGE/background.js"
test -f "$STAGE/layout-schema.js"
test -f "$STAGE/layouts/index.json"
test -n "$(find "$STAGE/layouts" -maxdepth 1 -name '*.lay' -print -quit)"
jq -e '.manifest_version == 3 and .name and .version' "$STAGE/manifest.json" >/dev/null

rm -f "$ZIP_PATH"
(
  cd "$STAGE"
  zip -9 -r "$ZIP_PATH" ./*
)

# Keep a stable alias used by older docs/scripts
ALIAS="$OUT_DIR/${NAME}-${VERSION}.zip"
cp -f "$ZIP_PATH" "$ALIAS"

rm -rf "$STAGE"

echo "Packed Chrome extension: $ZIP_PATH"
ls -la "$ZIP_PATH" "$ALIAS"
