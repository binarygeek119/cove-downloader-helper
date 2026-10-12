# Cove Downloader Helper

<p align="center">
  <img src="src/icons/icon.png" alt="Cove Downloader Helper logo" width="128" />
</p>

A Chrome extension that sends pages, links, and videos to your self-hosted [Cove](https://github.com/yourcove/cove) server. Cove matches the address against its installed downloaders (yt-dlp, Reddit, Common Text, Common Audio, and others from the [official extension registry](https://github.com/yourcove/officialextensionregistry)), downloads the media, and imports it into your library.

Works out of the box with a Cove instance on `http://localhost:5073`. Point it at another URL, and add a personal access token if Cove has authentication on, in Settings.

## Features

- **One click, anywhere.** Right-click a page or link, press the keyboard shortcut, or use the floating Cove button on supported sites. Buttons show busy, done, and error states so you always know what happened.
- **Site-styled buttons.** On sites with a [layout file](src/layouts/README.md), a Download button appears right in the page's own toolbar, styled to match.
- **Side panel.** Click the toolbar icon for a panel that stays open while you browse: pick the downloader and quality for the current page, watch live job progress, and manage the pool.
- **Multi-video pages.** When a page embeds several videos, the panel lists them with thumbnails and durations. Select some or all and send them as a single Cove job.
- **Pool.** Collect URLs as you browse, then send them to Cove as one batch job or save them as a text file. The pool survives browser restarts and closed incognito windows.
- **No duplicates.** A second click on something already on its way is ignored, Cove's own duplicate check is surfaced as "already in Cove", and batch sends report what was skipped.
- **Type override.** Ask for video, audio, image, or text when Cove's best guess is not what you meant.
- **Preferred quality.** Cap downloads at 1080p, 1440p, or 4K, or take the best available. The panel still lets you pick per send.
- **Settings sync, export, and import.** Settings live in Chrome sync storage. Export them to a file and import them on another machine; 1.x export files are converted automatically.

## Requirements

- Chrome 116 or newer (or another Chromium browser with side panel support).
- A running Cove instance with the downloaders you want installed. yt-dlp covers most video sites.

## Install

**Chrome Web Store:** [Cove Downloader Helper](https://chrome.google.com/webstore/detail/okmkahgbcigkpmaagpddnadpffjpibgm).

**From source:**

```bash
npm install
npm run build
```

Then open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and choose the `dist` folder.

## Setup

1. Click the toolbar icon. The panel opens on the queue and shows the connection status in the header.
2. If Cove is not on `http://localhost:5073`, open **Settings** in the panel, enter the Cove URL and (if needed) a token, and click **Save**. **Test connection** confirms Cove answers and lists its downloaders.
3. Grant site access when Chrome asks. The extension needs it to reach Cove and to read the page you send.

## Usage

| Action                                                              | What it does                                                                                                                                                                                                  |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Toolbar icon                                                        | Opens the side panel on the queue.                                                                                                                                                                            |
| Right-click → **Send page to Cove** / **Send link to Cove**         | Sends immediately with the best match.                                                                                                                                                                        |
| Right-click → **Add page to Cove pool** / **Add link to Cove pool** | Adds to the pool without sending.                                                                                                                                                                             |
| Keyboard shortcut (default `Alt+Shift+C`)                           | Sends the current page. Two more shortcuts, unbound by default, add the page to the pool and send the pool to Cove. Change them at `chrome://extensions/shortcuts`; the Settings tab shows the live bindings. |
| Floating Cove button (bottom right)                                 | Sends the page. Hover a link to get a chip that sends that link instead.                                                                                                                                      |
| Site-styled Download button                                         | Sends the page as video, image, or text, as the layout file says.                                                                                                                                             |
| Panel → **Download**                                                | Shows the matches for the current page or any address you paste, with a type override and quality picker. Lists embedded videos when a page has more than one.                                                |
| Panel → **Queue**                                                   | Live progress for running jobs, with cancel, and recent history.                                                                                                                                              |
| Panel → **Pool**                                                    | Review collected URLs, remove some, send all as one job, or save as `.txt`.                                                                                                                                   |

**Pool mode** (Settings or the Pool tab) makes the in-page buttons add to the pool instead of sending. The context menu and shortcuts always offer both.

**Confirm before sending** opens the panel to review the match and quality instead of sending right away.

See [SUPPORTED_SITES.md](SUPPORTED_SITES.md) for where the floating and site-styled buttons appear.

## Development

The extension is TypeScript, React 19, Tailwind 4, and Vite, with the same tooling as the Cove UI (oxlint, oxfmt, vitest).

```bash
npm install
npm run dev:ui      # panel in a normal browser tab with a Chrome API shim
npm run dev         # rebuild dist/ on every change, for loading unpacked in Chrome
npm run check       # typecheck, lint, format check, tests, vulnerability scan
npm run build       # production build into dist/
npm run pack        # build and zip for the Chrome Web Store
```

Layout of `src/`:

| Folder        | Runs in                     | Purpose                                                                                                            |
| ------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `background/` | Service worker              | The single send pipeline, pool, job tracking, context menus, shortcuts, content-script registration.               |
| `content/`    | Web pages                   | Floating button, link chip, toasts, site-styled buttons, Erome album icons, embedded-video collector.              |
| `app/`        | Side panel and options page | React UI.                                                                                                          |
| `shared/`     | Everywhere                  | Cove API client and types, match ranking, settings, messaging contract, URL helpers, layout schema, site adapters. |
| `layouts/`    | Data                        | One `.lay` file per site with a styled button.                                                                     |

[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) explains how the pieces fit together and the rules that keep Chrome happy (user gestures, duplicate protection, storage areas).

### Adding a site

- A site that just needs a styled button in its toolbar: add a `.lay` file. See [src/layouts/README.md](src/layouts/README.md). No code.
- A site that needs the page's player address rather than the page URL (xHamster) or a custom picker (Erome): add a module under `src/shared/sites/` and wire it in `src/background/site-media.ts`. Keep the pure parts testable without Chrome.
- Then update [SUPPORTED_SITES.md](SUPPORTED_SITES.md). A test fails if the doc, the host list, and the layout files disagree.

## Releases

Every push to `master` runs the checks, builds, and publishes a GitHub Release `v{version}` with the packed zip. When `version` in `package.json` is newer than the Chrome Web Store item, the workflow also uploads the zip and submits it for review. Store credentials and the one-time OAuth setup are described in [store/STORE_LISTING.md](store/STORE_LISTING.md).

## Privacy

The extension talks only to the Cove server you configure. See [PRIVACY.md](PRIVACY.md).

## Credits

Started as a fork of [Rpsl/metube-browser-extension](https://github.com/Rpsl/metube-browser-extension), rewritten for Cove. The download glyph is from [Font Awesome Free](https://fontawesome.com/license/free) (CC BY 4.0).
