# Chrome Web Store submission guide

Use this checklist when uploading Cove Downloader Helper to the [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole).

## Package

Build and zip (manifest at the archive root):

```bash
npm run pack
```

Upload `builds/cove-downloader-helper-{version}-chrome.zip`. The version comes from `package.json`.

## Automatic updates

Pushes to `master` run `.github/workflows/pack-and-release.yml`. After the GitHub Release is updated, `scripts/publish-chrome-webstore.sh` uploads the zip when the `package.json` version is newer than the store item `okmkahgbcigkpmaagpddnadpffjpibgm`, then submits it for review. A manual run can turn off **Publish a newer package to the Chrome Web Store**.

| Secret                          | Value                                                                    |
| ------------------------------- | ------------------------------------------------------------------------ |
| `CHROME_WEBSTORE_CLIENT_ID`     | OAuth client ID                                                          |
| `CHROME_WEBSTORE_CLIENT_SECRET` | OAuth client secret                                                      |
| `CHROME_WEBSTORE_REFRESH_TOKEN` | Refresh token for scope `https://www.googleapis.com/auth/chromewebstore` |
| `CHROME_PUBLISHER_ID`           | Publisher ID from Developer Dashboard → Publisher → Settings             |
| `CHROME_EXTENSION_ID`           | Optional. Defaults to `okmkahgbcigkpmaagpddnadpffjpibgm`                 |

The job skips with a warning until the four required secrets are set. Raise `version` in `package.json` before each update.

### Minting the refresh token

The scope belongs to the current API host `chromewebstore.googleapis.com`. The old host `www.googleapis.com/chromewebstore/v1.1` rejects it with "OAuth2 scope name is invalid or it refers to a newer scope". In the [OAuth playground](https://developers.google.com/oauthplayground):

1. Enable **Chrome Web Store API** on the same Google Cloud project as the OAuth client.
2. Open the gear icon. Choose **Use your own OAuth credentials**, enter the client ID and secret, and set **Access type** to **Offline**. The client's redirect URI must be `https://developers.google.com/oauthplayground`.
3. In **Input your own scopes**, enter `https://www.googleapis.com/auth/chromewebstore` and click **Authorize APIs**. Sign in with the account that owns the store item.
4. Click **Exchange authorization code for tokens**. Copy the `refresh_token` value into `CHROME_WEBSTORE_REFRESH_TOKEN`.
5. The playground then puts the scope string in **Request URI** and a GET of that address returns the "newer scope / legacy API" error. That response is not a failed token. Replace the Request URI with `https://chromewebstore.googleapis.com/v2/publishers/PUBLISHER_ID/items/okmkahgbcigkpmaagpddnadpffjpibgm:fetchStatus` and send the GET again.

## Store listing

| Field                    | Value                                                                         |
| ------------------------ | ----------------------------------------------------------------------------- |
| **Name**                 | Cove Downloader Helper                                                        |
| **Summary** (≤132 chars) | Send pages, links, and videos to your self-hosted Cove server with one click. |
| **Category**             | Productivity (or Tools)                                                       |
| **Language**             | English                                                                       |
| **Homepage**             | https://github.com/binarygeek119/cove-downloader-helper                       |
| **Support**              | https://github.com/binarygeek119/cove-downloader-helper/issues                |
| **Mature / age**         | **18+ only** — intended for adult users; not for children                     |

### Detailed description (paste)

```text
Cove Downloader Helper connects your browser to your self-hosted Cove media library.

18+ only. This extension is intended for adult users and is not directed at children.

Send the current page, a link, or the videos on a page to your Cove server so it can download the media into your library. Works out of the box when Cove runs on your computer with its default port.

Features:
• Right-click a page or link → Send to Cove, or press the keyboard shortcut
• A Cove button on supported sites, with clear sent / already-in-Cove feedback
• A side panel with live download progress, a quality and type picker for the current page, and a list of the videos on a page so you can choose which to send
• Pool: collect pages as you browse and send them to Cove as one job, or save them as a text file
• Duplicate protection: nothing is downloaded twice
• Works with your Cove URL and optional personal access token

Requirements:
• A running Cove instance you control
• The downloaders you use, installed on that Cove server

This extension does not provide a cloud download service. All downloads are handled by your Cove server.
```

## Graphics

| Asset                  | File                              | Size     |
| ---------------------- | --------------------------------- | -------- |
| Store icon             | `store/store-icon-128.png`        | 128×128  |
| Screenshot 1           | `store/screenshot-1280x800-1.png` | 1280×800 |
| Screenshot 2           | `store/screenshot-1280x800-2.png` | 1280×800 |
| Small promo (optional) | `store/promo-small-440x280.png`   | 440×280  |

The screenshots show the 1.x interface. Capture new ones of the side panel (Download, Queue, Pool, Settings) before submitting 2.0.

## Privacy tab

**Single purpose:**
Help users send selected page, link, and video URLs to their self-hosted Cove instance to queue downloads.

**Privacy policy URL:**
https://github.com/binarygeek119/cove-downloader-helper/blob/master/PRIVACY.md

**Remote code:** None. The extension only loads its own packaged scripts. It calls the user-configured Cove HTTP API.

### Permission justifications

| Permission                                         | Justification                                                                                                                                                                                                                  |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `storage`                                          | Save the Cove URL, optional API token, and preferences (sync); the pool and hidden history (local); in-flight download tracking (session).                                                                                     |
| `tabs`                                             | Read the active tab's URL and title for the panel and for "send this page", and notify the page's content script after navigation.                                                                                             |
| `activeTab`                                        | Temporary access to the tab the user invokes the extension on.                                                                                                                                                                 |
| `contextMenus`                                     | "Send to Cove" and "Add to Cove pool" items in the right-click menu.                                                                                                                                                           |
| `scripting`                                        | Register the in-page button script when the user turns buttons on and grants site access; inject the embedded-video collector into the active tab while the panel is open; read a page's player address on sites that need it. |
| `sidePanel`                                        | Open the extension's panel beside the page. See the paste block below.                                                                                                                                                         |
| `downloads`                                        | Save the pool as a local text file. See the paste block below.                                                                                                                                                                 |
| `alarms`                                           | Resume tracking of downloads the user started if Chrome suspends the service worker mid-download, so the toolbar badge stays correct. No alarm runs while nothing is downloading.                                              |
| Host access `http://*/*`, `https://*/*` (optional) | Call the user-configured Cove origin (any host/port they choose, including LAN/localhost); show buttons on sites when enabled; read the page the user sends. Requested at runtime, not granted until the user approves.        |

**sidePanel** — Developer Dashboard → Privacy practices → Permission justification:

```text
Opens this extension's own panel in Chrome's side panel beside the page the user is viewing. The panel opens only after the user clicks the toolbar icon, chooses Open Cove panel in the context menu, clicks a video picker button on a page, or starts a download with "Open the panel when a download starts" or "Confirm before sending" turned on. It shows the matches and quality options for the current page, progress for downloads sent to the user's Cove server, the videos embedded in the current page so the user can choose which to send, the pool of collected URLs, and settings. The side panel never opens on its own.
```

**downloads** — Developer Dashboard → Privacy practices → Permission justification:

```text
Used only to save a local text file of URLs the user already collected in this extension's Pool tab. When the user clicks the .txt button in the Pool tab, the extension writes those URLs (one per line) to a file named cove-pool-<date>.txt through Chrome's Save As dialog. The user picks the location. This permission is not used to download media, crawl the web, or save files in the background.
```

### Data disclosure

- Certify: no sale of user data; not used for creditworthiness / lending.
- Collected / transmitted: Web history is **not** collected broadly. Only URLs the user explicitly sends, plus settings they enter, go to **their** Cove server. Pooled pages (URL, title, favicon, preview image) stay on the device until sent or cleared.
- Personally identifiable information: optional API token stored in Chrome sync storage; not sent to the developer.

## Distribution

- Visibility: Public, Unlisted, or Private (testers) — your choice for first publish.
- Pricing: Free.

## Pre-submit checklist

- [ ] `npm run check` passes
- [ ] Load unpacked `dist/` and smoke-test: toolbar icon, context menu, shortcut, floating button, site-styled button, panel Download / Queue / Pool / Settings
- [ ] Confirm the optional host permission prompt appears on first action
- [ ] In-page buttons appear only when enabled and permission is granted
- [ ] Zip built with `npm run pack`
- [ ] Store secrets added if GitHub Actions should publish later versions
- [ ] Privacy policy URL opens publicly
- [ ] Store icon and at least one 1280×800 screenshot of the 2.0 panel uploaded
- [ ] Permission justifications pasted into Privacy practices, including `sidePanel`, `downloads`, and `alarms`
