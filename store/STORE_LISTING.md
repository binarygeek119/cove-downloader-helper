# Chrome Web Store submission guide

Use this checklist when uploading Cove Downloader Helper to the [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole).

## Package

Build the store zip (manifest at archive root):

```bash
./scripts/pack-extension.sh --force
```

Upload:

`builds/cove-downloader-helper-1.0.5-chrome.zip`

(or the version printed by the script)

## Automatic updates

Pushes to `master` run `.github/workflows/pack-and-release.yml`. After the GitHub Release is updated, `scripts/publish-chrome-webstore.sh` uploads the zip when `src/manifest.json` `version` is newer than the store item `okmkahgbcigkpmaagpddnadpffjpibgm`, then submits that version for review. A manual run can turn off **Publish a newer package to the Chrome Web Store**.

| Secret | Value |
| --- | --- |
| `CHROME_WEBSTORE_CLIENT_ID` | OAuth client ID |
| `CHROME_WEBSTORE_CLIENT_SECRET` | OAuth client secret |
| `CHROME_WEBSTORE_REFRESH_TOKEN` | Refresh token for scope `https://www.googleapis.com/auth/chromewebstore` |
| `CHROME_PUBLISHER_ID` | Publisher ID from Developer Dashboard → Publisher → Settings |
| `CHROME_EXTENSION_ID` | Optional. Defaults to `okmkahgbcigkpmaagpddnadpffjpibgm` |

The job skips with a warning until the four required secrets are set. Mint the refresh token with scope `https://www.googleapis.com/auth/chromewebstore` and call `https://chromewebstore.googleapis.com`. The legacy host `www.googleapis.com/chromewebstore/v1.1` rejects that scope. Raise `version` in `src/manifest.json` before each update.

## Store listing

| Field | Value |
| --- | --- |
| **Name** | Cove Downloader Helper |
| **Summary** (≤132 chars) | Send the current page or a link to your self-hosted Cove server so it can download the media. |
| **Category** | Productivity (or Tools) |
| **Language** | English |
| **Homepage** | https://github.com/binarygeek119/cove-downloader-helper |
| **Support** | https://github.com/binarygeek119/cove-downloader-helper/issues |
| **Mature / age** | **18+ only** — intended for adult users; not for children |

### Detailed description (paste)

```text
Cove Downloader Helper connects your browser to your self-hosted Cove media library.

18+ only. This extension is intended for adult users and is not directed at children.

Send the current page or a link to your Cove server so it can download the media into your library.

Features:
• Left-click the toolbar icon to send the current page
• Right-click a link or page → Send to Cove
• Optional bottom-right download bubble on every page, or only on supported sites (Settings)
• Match results with quality picker and Video / Audio / Text override
• Live job queue for downloads you start from the helper
• Works with your Cove URL and optional personal access token

Requirements:
• A running Cove instance you control
• The downloaders you use, installed on that Cove server

This extension does not provide a cloud download service. All downloads are handled by your Cove server.
```

## Graphics

| Asset | File | Size |
| --- | --- | --- |
| Store icon | `store/store-icon-128.png` | 128×128 |
| Screenshot 1 | `store/screenshot-1280x800-1.png` | 1280×800 |
| Screenshot 2 | `store/screenshot-1280x800-2.png` | 1280×800 |
| Small promo (optional) | `store/promo-small-440x280.png` | 440×280 |

Capture extra real UI screenshots from the helper Download / Queue / Settings tabs if reviewers want more product shots.

## Privacy tab

**Single purpose:**  
Help users send selected page or link URLs to their self-hosted Cove instance to queue downloads.

**Privacy policy URL:**  
https://github.com/binarygeek119/cove-downloader-helper/blob/master/PRIVACY.md

(Prefer a GitHub Pages URL if you enable Pages on this repo; the blob URL is publicly readable.)

**Remote code:** None. The extension only loads its own packaged scripts. It calls the user-configured Cove HTTP API.

### Permission justifications

| Permission | Justification |
| --- | --- |
| `storage` | Save Cove URL, optional API token, and user preferences. |
| `tabs` | Read the active tab URL when the user clicks the toolbar icon or uses page context actions; open the helper UI tab. |
| `activeTab` | Temporary access to the tab the user invokes the extension on. |
| `contextMenus` | “Send link/page to Cove” items in the right-click menu. |
| `scripting` | Inject the optional downloader button on every page only when the user enables Show on all pages and grants site access. |
| Host access `http://*/*`, `https://*/*` (optional) | Call the user-configured Cove origin (any host/port they choose, including LAN/localhost) and, when Show on all pages is enabled, inject the downloader button on every site. Requested at runtime, not granted until the user approves. |

### Data disclosure

- Certify: no sale of user data; not used for creditworthiness / lending.
- Collected / transmitted: Web history is **not** collected broadly. Only URLs the user explicitly sends, plus settings they enter, go to **their** Cove server.
- Personally identifiable information: optional API token stored locally in extension storage; not sent to the developer.

## Distribution

- Visibility: Public, Unlisted, or Private (testers) — your choice for first publish.
- Pricing: Free.

## Pre-submit checklist

- [ ] Load unpacked `src/` and smoke-test toolbar, context menu, settings, match, queue
- [ ] Confirm optional host permission prompt appears on first send / settings save
- [ ] In-page buttons appear only when enabled + permission granted
- [ ] Zip built with `./scripts/pack-extension.sh --force`
- [ ] Store secrets added if GitHub Actions should publish later versions
- [ ] Privacy policy URL opens publicly
- [ ] Store icon + at least one 1280×800 screenshot uploaded
- [ ] Permission justifications pasted into Privacy tab
- [ ] Developer account one-time registration fee paid ($5 USD)
