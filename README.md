Chrome Cove Downloader Helper
=======

Send page and link URLs to your [Cove](https://github.com/yourcove/cove) instance using registered downloaders (yt-dlp, Common Text, Common Audio, Reddit, and others from the [official extension registry](https://github.com/yourcove/officialextensionregistry)).

Features
-----

- **Left-click** the toolbar icon to download the **current page**
- **Right-click** a link or page → Send to Cove
- Optional **in-page** floating button and link chip (toggle in Settings)
- Match / quality picker, then queue downloads
- **Job Queue** tab shows live Cove jobs

Setup
-----

1. Run Cove and install downloaders you need from the official registry (at least **yt-dlp**; add Common Text / Common Audio / Reddit as desired).
2. Load this extension (see below).
3. Open **Settings** (extension options, or the Settings tab in the helper window).
4. Set your **Cove URL** (example: `http://127.0.0.1:5000`).
5. If Cove auth is enabled, paste a **PAT** (`cove_pat_…`) with permission to run jobs.

Installation from sources
-----

- Download this repository
- Open [Extensions](chrome://extensions/) (`chrome://extensions/`)
- Enable **Developer mode**
- Click **Load unpacked**
- Choose the `src` folder

Usage
-----

- Left-click the icon on a video/story page to open the helper Download tab for that URL.
- Right-click a link or the page background to send that URL.
- Turn **Show in-page buttons** on/off in Settings.
- Use **Job Queue** to watch and cancel active Cove jobs.

Build
-----

```bash
./build.sh
```

Creates `builds/cove-downloader-helper-{version}.zip`.
