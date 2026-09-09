#!/usr/bin/env bash
# Compatibility wrapper — prefer scripts/pack-extension.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
exec "$ROOT/scripts/pack-extension.sh" "$@"
