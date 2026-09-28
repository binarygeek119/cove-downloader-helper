# Chrome Web Store submission guide

Use this checklist when uploading Cove Downloader Helper to the [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole).

## Package

Build the store zip (manifest at archive root):

```bash
./scripts/pack-extension.sh --force
```

Upload:

`builds/cove-downloader-helper-1.0.1-chrome.zip`

(or the version printed by the script)

## Automated publish

After the first dashboard upload, `.github/workflows/pack-and-release.yml` publishes later versions. It runs `scripts/publish-chrome-webstore.sh` on pushes to `master`/`main`, and on a manual run unless **Publish the packed zip to the Chrome Web Store** is turned off.

Add these repository secrets ([Chrome Web Store API](https://developer.chrome.com/docs/webstore/using-api)):

| Secret | Value |
| --- | --- |
| `CHROME_WEBSTORE_CLIENT_ID` | OAuth client ID |
| `CHROME_WEBSTORE_CLIENT_SECRET` | OAuth client secret |
| `CHROME_WEBSTORE_REFRESH_TOKEN` | Refresh token for scope `https://www.googleapis.com/auth/chromewebstore` |
| `CHROME_EXTENSION_ID` | Store item ID |
| `CHROME_PUBLISHER_ID` | Publisher ID from Developer Dashboard → Publisher → Settings |

The job skips with a warning until every secret is set. Raise `version` in `src/manifest.json` before each publish; the store rejects an upload that does not increase it.

## Store listing

| Field | Value |
| --- | --- |
| **Name** | Cove Downloader Helper |
| **Summary** (≤132 chars) | Send page and link URLs to your self-hosted Cove app for yt-dlp and other downloaders. |
| **Category** | Productivity (or Tools) |
| **Language** | English |
| **Homepage** | https://github.com/binarygeek119/cove-downloader-helper |
| **Support** | https://github.com/binarygeek119/cove-downloader-helper/issues |
| **Mature / age** | **18+ only** — intended for adult users; not for children |

### Detailed description (paste)

```text
Cove Downloader Helper connects your browser to your self-hosted Cove media library.

18+ only. This extension is intended for adult users and is not directed at children.

Send the current page or a link to Cove so registered downloaders (yt-dlp, Common Text, Common Audio, Reddit, Direct File, and others) can fetch media into your library.

Features:
• Left-click the toolbar icon to send the current page
• Right-click a link or page → Send to Cove
• Optional bottom-right download bubble on every page, or only on supported sites (Settings)
• Match results with quality picker and Video / Audio / Text override
• Live job queue for downloads you start from the helper
• Works with your Cove URL and optional personal access token

Requirements:
• A running Cove instance you control
• Cove downloaders installed as needed (yt-dlp recommended)

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

## Privacy practices tab

Paste these into the Developer Dashboard → Privacy practices. Use the same privacy policy URL on the developer account page.

**Privacy policy URL:**  
https://github.com/binarygeek119/cove-downloader-helper/blob/master/PRIVACY.md

### Single purpose

```text
Send a page or link the user selects to the self-hosted Cove server they configure, so that server can download the media.
```

### Remote code

Select **No, I am not using remote code**.

The extension runs only the scripts packaged in the zip. It calls the Cove HTTP API the user configures. Those responses are JSON data, not code the extension executes.

### Permission justifications

If the form shows separate boxes for `http://*/*` and `https://*/*`, paste the host justification into both.

**storage**

```text
Saves the Cove server URL, an optional Cove personal access token, and the user's settings (download mode, in-page button choices, auto-send, and queue options) in Chrome sync storage. Also keeps the one URL the user just chose in session storage until the helper window opens. Nothing in storage is sent to the extension developer.
```

**tabs**

```text
Reads the URL of the tab the user clicks, or the page they right-click, so that URL can be sent to their Cove server. Finds already-open http(s) tabs so the optional download button can be injected on those tabs right after the user turns that setting on. Opens or focuses the helper tab.
```

**activeTab**

```text
Gives temporary access to the tab the user invokes the extension on, so a toolbar click can read that page's URL and send it to the user's Cove server.
```

**contextMenus**

```text
Adds "Send link to Cove" and "Send page to Cove" to the right-click menu so the user can choose a link or the current page to send.
```

**scripting**

```text
Injects this extension's own packaged content script to show the optional bottom-right download button. Injection runs only after the user enables Show on all pages or Show in supported sites and grants site access. The script does not load or execute remote code.
```

**Host permission (`http://*/*` and `https://*/*`, optional)**

```text
Requested at runtime and not granted until the user approves it. The user's Cove server can be any origin they type, including localhost or a LAN address, so the extension needs host access to call that server. The same permission lets the extension read the one page or link URL the user chooses to send, and show the optional download button only after they enable it.
```

### Data use

Check only these two:

- **Authentication information** — the optional Cove personal access token. It is stored in Chrome sync storage and sent only as an `Authorization: Bearer` header to the Cove URL the user entered.
- **Website content** — the page URL or link URL the user chooses to send, plus match details Cove returns for that URL (title, quality, downloader). The in-page button also reads a hovered link's URL locally so the user can send that link. The extension does not read page HTML, images, or video in the browser.

Leave these unchecked:

- Personally identifiable information
- Health information
- Financial and payment information
- Personal communications
- Location
- Web history — there is no list of visited pages, no visit times, and no background logging of browsing
- User activity — clicks only start a send the user asked for; mouse, scroll, and keystrokes are not collected

Check all three certifications:

- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

The only place download data goes is the Cove server the user configured. If Chrome Sync is on, settings in `chrome.storage.sync` sync to that user's Google account. The developer does not receive them.

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
- [ ] Privacy practices tab filled from the paste blocks above (single purpose, remote code = No, two data categories, three certifications)
- [ ] Developer account one-time registration fee paid ($5 USD)
