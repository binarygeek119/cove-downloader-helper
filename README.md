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
./build.sh
```

Creates `builds/cove-downloader-helper-{version}.zip`.

On push to `master`/`main`, pull requests, and version tags (`v*`), GitHub Actions packages the extension and uploads the zip as a workflow artifact. Tags also attach the zip to a GitHub Release.

## Credits

- Forked from [Rpsl/metube-browser-extension](https://github.com/Rpsl/metube-browser-extension) (Chrome MeTube Downloader)
- Targets [Cove](https://github.com/yourcove/cove) and community downloaders from [yourcove/officialextensionregistry](https://github.com/yourcove/officialextensionregistry)

## Contributing

- [Bug report](https://github.com/binarygeek119/cove-downloader-helper/issues/new?template=bug_report.yml)
- [Feature request](https://github.com/binarygeek119/cove-downloader-helper/issues/new?template=feature_request.yml)

For Cove server, yt-dlp inside Cove, or registry downloaders, prefer upstream: [yourcove/cove](https://github.com/yourcove/cove/issues).
