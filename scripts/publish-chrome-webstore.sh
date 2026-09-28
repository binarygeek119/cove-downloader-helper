#!/usr/bin/env bash
# Upload a packed extension zip to the Chrome Web Store and submit it for review.
# https://developer.chrome.com/docs/webstore/using-api
set -euo pipefail

ZIP="${1:-}"
if [[ -z "$ZIP" || ! -f "$ZIP" ]]; then
  echo "usage: publish-chrome-webstore.sh <extension.zip>" >&2
  exit 1
fi

for name in \
  CHROME_WEBSTORE_CLIENT_ID \
  CHROME_WEBSTORE_CLIENT_SECRET \
  CHROME_WEBSTORE_REFRESH_TOKEN \
  CHROME_EXTENSION_ID \
  CHROME_PUBLISHER_ID
do
  if [[ -z "${!name:-}" ]]; then
    echo "missing required environment variable: $name" >&2
    exit 1
  fi
done

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required" >&2
  exit 1
fi

token_body="$(mktemp)"
upload_body="$(mktemp)"
publish_body="$(mktemp)"
status_body="$(mktemp)"
trap 'rm -f "$token_body" "$upload_body" "$publish_body" "$status_body"' EXIT

token_status="$(
  curl --silent --show-error --output "$token_body" --write-out "%{http_code}" \
    "https://oauth2.googleapis.com/token" \
    --data-urlencode "client_id=${CHROME_WEBSTORE_CLIENT_ID}" \
    --data-urlencode "client_secret=${CHROME_WEBSTORE_CLIENT_SECRET}" \
    --data-urlencode "refresh_token=${CHROME_WEBSTORE_REFRESH_TOKEN}" \
    --data-urlencode "grant_type=refresh_token"
)"

if [[ "$token_status" != "200" ]]; then
  echo "Chrome Web Store token request failed (HTTP ${token_status})" >&2
  jq -r '.error_description // .error // "unknown error"' "$token_body" >&2 || true
  exit 1
fi

access_token="$(jq -r '.access_token // empty' "$token_body")"
if [[ -z "$access_token" ]]; then
  echo "Chrome Web Store token response did not include an access token" >&2
  exit 1
fi

upload_status="$(
  curl --silent --show-error --output "$upload_body" --write-out "%{http_code}" \
    -X POST \
    -H "Authorization: Bearer ${access_token}" \
    -T "$ZIP" \
    "https://chromewebstore.googleapis.com/upload/v2/publishers/${CHROME_PUBLISHER_ID}/items/${CHROME_EXTENSION_ID}:upload"
)"

if [[ "$upload_status" != "200" ]]; then
  echo "Chrome Web Store upload failed (HTTP ${upload_status})" >&2
  cat "$upload_body" >&2
  exit 1
fi

upload_state="$(jq -r '.uploadState // empty' "$upload_body")"

wait_for_upload() {
  local state="$1"
  local attempt=0
  local status_code
  while [[ "$state" == "IN_PROGRESS" || "$state" == "UPLOAD_IN_PROGRESS" || "$state" == "UPLOAD_STATE_UNSPECIFIED" || -z "$state" ]]; do
    if (( attempt >= 30 )); then
      echo "timed out waiting for Chrome Web Store upload to finish (last state: ${state:-unknown})" >&2
      exit 1
    fi
    sleep 2
    attempt=$((attempt + 1))
    status_code="$(
      curl --silent --show-error --output "$status_body" --write-out "%{http_code}" \
        -X GET \
        -H "Authorization: Bearer ${access_token}" \
        "https://chromewebstore.googleapis.com/v2/publishers/${CHROME_PUBLISHER_ID}/items/${CHROME_EXTENSION_ID}:fetchStatus"
    )"
    if [[ "$status_code" != "200" ]]; then
      echo "Chrome Web Store status check failed (HTTP ${status_code})" >&2
      cat "$status_body" >&2
      exit 1
    fi
    state="$(jq -r '.lastAsyncUploadState // empty' "$status_body")"
    echo "Upload processing (state: ${state:-unknown}, attempt ${attempt})"
  done
  case "$state" in
    SUCCEEDED|SUCCESS) ;;
    *)
      echo "Chrome Web Store upload state: ${state}" >&2
      cat "$status_body" >&2
      exit 1
      ;;
  esac
}

case "$upload_state" in
  ""|SUCCEEDED|SUCCESS)
    echo "Uploaded ${ZIP} (state: ${upload_state:-ok})"
    ;;
  IN_PROGRESS|UPLOAD_IN_PROGRESS)
    echo "Uploaded ${ZIP} (state: ${upload_state}); waiting for the store to finish processing"
    wait_for_upload "$upload_state"
    echo "Upload finished"
    ;;
  *)
    echo "Chrome Web Store upload state: ${upload_state}" >&2
    cat "$upload_body" >&2
    exit 1
    ;;
esac

publish_status="$(
  curl --silent --show-error --output "$publish_body" --write-out "%{http_code}" \
    -X POST \
    -H "Authorization: Bearer ${access_token}" \
    "https://chromewebstore.googleapis.com/v2/publishers/${CHROME_PUBLISHER_ID}/items/${CHROME_EXTENSION_ID}:publish"
)"

if [[ "$publish_status" != "200" ]]; then
  echo "Chrome Web Store publish failed (HTTP ${publish_status})" >&2
  cat "$publish_body" >&2
  exit 1
fi

echo "Submitted to the Chrome Web Store for review"
jq -c '.' "$publish_body" 2>/dev/null || cat "$publish_body"
