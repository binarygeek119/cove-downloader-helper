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
• Optional in-page button and link chip (Settings)
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
| `scripting` | Register optional in-page buttons only when the user enables them and grants site access. |
| Host access `http://*/*`, `https://*/*` (optional) | Call the user-configured Cove origin (any host/port they choose, including LAN/localhost) and optionally inject in-page controls on sites where the user wants one-click send. Requested at runtime, not granted until the user approves. |

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
- [ ] Privacy policy URL opens publicly
- [ ] Store icon + at least one 1280×800 screenshot uploaded
- [ ] Permission justifications pasted into Privacy tab
- [ ] Developer account one-time registration fee paid ($5 USD)
