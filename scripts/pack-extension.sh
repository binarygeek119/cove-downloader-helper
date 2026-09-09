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

# Validate pack contents
test -f "$STAGE/manifest.json"
test -f "$STAGE/background.js"
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

# Optional CRX when a PEM is provided (local path or CI secret written to file).
CRX_PATH="$OUT_DIR/${NAME}-${VERSION}.crx"
if [[ -n "${EXTENSION_PEM_PATH:-}" && -f "${EXTENSION_PEM_PATH}" ]]; then
  if command -v google-chrome >/dev/null 2>&1 || command -v chromium-browser >/dev/null 2>&1 || command -v chromium >/dev/null 2>&1; then
    CHROME_BIN="$(command -v google-chrome || command -v chromium-browser || command -v chromium)"
    PACK_DIR="$OUT_DIR/.crx-src"
    rm -rf "$PACK_DIR"
    mkdir -p "$PACK_DIR"
    unzip -q "$ZIP_PATH" -d "$PACK_DIR"
    "$CHROME_BIN" --pack-extension="$PACK_DIR" --pack-extension-key="$EXTENSION_PEM_PATH" >/dev/null 2>&1 || true
    if [[ -f "$OUT_DIR/.crx-src.crx" ]]; then
      mv -f "$OUT_DIR/.crx-src.crx" "$CRX_PATH"
    elif [[ -f "${PACK_DIR}.crx" ]]; then
      mv -f "${PACK_DIR}.crx" "$CRX_PATH"
    fi
    rm -rf "$PACK_DIR"
  fi
fi

echo "Packed Chrome extension: $ZIP_PATH"
ls -la "$ZIP_PATH" "$ALIAS"
if [[ -f "$CRX_PATH" ]]; then
  echo "Packed CRX: $CRX_PATH"
  ls -la "$CRX_PATH"
fi
