# Cove Downloader Helper

<p align="center">
  <img src="src/icon.png" alt="Cove Downloader Helper logo" width="160" />
</p>

Browser extension that sends page and link URLs to your [Cove](https://github.com/yourcove/cove) instance so registered downloaders can fetch them.

**This project is a fork of [Chrome MeTube Downloader](https://github.com/Rpsl/metube-browser-extension)** by Rpsl. The original extension queued URLs into [MeTube](https://github.com/alexta69/metube). This fork reworks that idea for Cove’s downloaders API, match/quality picking, in-page controls, and a live job queue.

Repository: https://github.com/binarygeek119/cove-downloader-helper

## Features

- **Left-click** the toolbar icon to download the **current page**
- **Right-click** a link or page → Send to Cove
- Optional **in-page** floating button and link chip (toggle in Settings)
- Cove **match** API with quality picker and **Video / Audio / Text** type override
- **Job Queue** tab for live Cove jobs (progress, cancel, history)
- Settings in-app: Cove URL, optional PAT, preferred mode, auto-send, queue-all, in-page buttons

## Requirements

1. A running [Cove](https://github.com/yourcove/cove) instance
2. These downloaders available in Cove:
   - [Common Audio Downloader](https://github.com/yourcove/officialextensionregistry/blob/main/extensions/cove.community.downloaders.common-audio.json)
   - [Common Text Downloader](https://github.com/yourcove/officialextensionregistry/blob/main/extensions/cove.community.downloaders.common-text.json)
   - [Direct File Downloader](https://github.com/yourcove/cove/blob/main/src/Cove.Api/Extensions/DirectFileDownloaderExtension.cs) (built into Cove)
   - [Reddit Downloader](https://github.com/yourcove/officialextensionregistry/blob/main/extensions/cove.community.downloaders.reddit.json)
   - [yt-dlp Downloader](https://github.com/yourcove/officialextensionregistry/blob/main/extensions/cove.community.downloaders.ytdlp.json)

Install the community downloaders from the [official extension registry](https://github.com/yourcove/officialextensionregistry). Direct File Downloader ships with Cove.

## Setup

1. Install and start Cove; install the required community downloaders listed above.
2. Load this extension (see below).
3. Open **Settings** (extension options, or the Settings tab in the helper window).
4. Set your **Cove URL** (example: `http://127.0.0.1:5000`).
5. If Cove auth is enabled, paste a **PAT** (`cove_pat_…`) with permission to run jobs.

## Installation from source

1. Clone or download this repository  
   `https://github.com/binarygeek119/cove-downloader-helper`
2. Open [chrome://extensions](chrome://extensions/)
3. Enable **Developer mode**
4. Click **Load unpacked**
5. Choose the `src` folder

## Usage

- Left-click the icon on a page to open the Download tab for that URL.
- Right-click a link or the page background to send that URL.
- If the matcher picks the wrong type, use **Type override** (Video / Audio / Text) before sending.
- Toggle **Show in-page buttons** in Settings.
- Use **Job Queue** to watch and cancel active Cove jobs.

## Build / CI

```bash
./scripts/pack-extension.sh --force
# or
./build.sh --force
```

Creates a packed Chrome extension zip in `builds/`:

- `cove-downloader-helper-{version}-chrome.zip` (preferred)
- `cove-downloader-helper-{version}.zip` (alias)

On every push to `master`/`main`, GitHub Actions packs the extension and publishes/updates the GitHub Release `v{version}` with those zip assets. When the manifest `version` is newer than the Chrome Web Store item, the same workflow uploads that zip and submits it for review.

The store item ID is `okmkahgbcigkpmaagpddnadpffjpibgm`. Add these repository secrets before the store update will run:

- `CHROME_WEBSTORE_CLIENT_ID`
- `CHROME_WEBSTORE_CLIENT_SECRET`
- `CHROME_WEBSTORE_REFRESH_TOKEN`
- `CHROME_PUBLISHER_ID` (Developer Dashboard → Publisher → Settings)

The refresh token has to be minted for this scope only:

`https://www.googleapis.com/auth/chromewebstore`

That scope belongs to the current API host `chromewebstore.googleapis.com`. The old host `www.googleapis.com/chromewebstore/v1.1` rejects it with “OAuth2 scope name is invalid or it refers to a newer scope”. In the [OAuth playground](https://developers.google.com/oauthplayground):

1. Enable **Chrome Web Store API** on the same Google Cloud project as the OAuth client.
2. Open the gear icon. Choose **Use your own OAuth credentials**, enter the client ID and secret, and set **Access type** to **Offline**. The client’s redirect URI must be `https://developers.google.com/oauthplayground`.
3. In **Input your own scopes**, enter `https://www.googleapis.com/auth/chromewebstore` and click **Authorize APIs**. Sign in with the account that owns the store item.
4. Click **Exchange authorization code for tokens**. Copy the `refresh_token` value into `CHROME_WEBSTORE_REFRESH_TOKEN`.
5. The playground then puts the scope string in **Request URI** and a GET of that address returns the “newer scope / legacy API” error. That response is not a failed token. Replace the Request URI with `https://chromewebstore.googleapis.com/v2/publishers/PUBLISHER_ID/items/okmkahgbcigkpmaagpddnadpffjpibgm:fetchStatus` and send the GET again.

`CHROME_EXTENSION_ID` is optional. Set it only to publish a different item than `okmkahgbcigkpmaagpddnadpffjpibgm`.

Create the store item once in the Developer Dashboard. Until the secrets exist, the store job logs a warning and succeeds. A push that does not raise `version` leaves the store item as it is. A manual run can turn off **Publish a newer package to the Chrome Web Store**.

## Credits

- Forked from [Rpsl/metube-browser-extension](https://github.com/Rpsl/metube-browser-extension) (Chrome MeTube Downloader)
- Targets [Cove](https://github.com/yourcove/cove) and community downloaders from [yourcove/officialextensionregistry](https://github.com/yourcove/officialextensionregistry)

## Contributing

- [Bug report](https://github.com/binarygeek119/cove-downloader-helper/issues/new?template=bug_report.yml)
- [Feature request](https://github.com/binarygeek119/cove-downloader-helper/issues/new?template=feature_request.yml)

For Cove server, yt-dlp inside Cove, or registry downloaders, prefer upstream: [yourcove/cove](https://github.com/yourcove/cove/issues).

## Chrome Web Store

Submission package and listing copy: see [store/STORE_LISTING.md](store/STORE_LISTING.md).  
Privacy policy: [PRIVACY.md](PRIVACY.md).

```bash
./scripts/pack-extension.sh --force
# upload builds/cove-downloader-helper-*-chrome.zip in the Developer Dashboard
```
