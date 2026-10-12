# Architecture

This document explains how the extension is put together and the rules that are easy to break
without noticing. Read it before adding an entry point, a setting, or a site.

## Three runtimes

| Runtime         | Entry                                               | Notes                                                                                                                                                                                                                    |
| --------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Service worker  | `src/background/index.ts`                           | ES module (`"type": "module"` in the manifest). Owns every write to Cove. Can be suspended by Chrome at any time, so nothing important lives only in memory.                                                             |
| Content scripts | `src/content/main.ts`, `src/content/page-videos.ts` | Classic IIFE bundles. `main.ts` is registered through `chrome.scripting.registerContentScripts` for every http(s) page when in-page buttons are on, or only for Erome otherwise. `page-videos.ts` is injected on demand. |
| Extension pages | `src/app/panel.html`, `src/app/options.html`        | One React app, two shells. `data-mode` on `<html>` selects the layout.                                                                                                                                                   |

`src/shared/` has no Chrome-specific logic except thin storage and messaging wrappers, so it runs in all three and in tests.

## The send pipeline

`src/background/pipeline.ts` is the only code that starts a download. Every entry point (context menu, shortcut, floating button, link chip, site-styled button, panel, video picker, pool) builds `SendItem[]` and calls `send()`. The pipeline:

1. Drops non-http items and duplicates within the request (`urlKey`).
2. **Pool mode:** if the source is an in-page button and pool mode is on, adds to the pool and stops.
3. **Confirm before sending:** if the source is a one-click surface, confirmation is on, and there is one item without a chosen downloader, hands the item to the panel as a review and stops.
4. **Reservations:** reserves each URL key in `tracking.ts`. Keys already reserved are reported as `in-flight`.
5. **Active jobs:** reads Cove's active jobs once and skips URLs that appear as `Downloading <url>`.
6. **Resolution:** turns each item into a `DownloaderBatchItem`:
   - a chosen downloader from the panel is used as is;
   - a direct video file or playlist goes to yt-dlp wrapped by `media-url.ts`;
   - a site adapter (`site-media.ts`) may substitute the page's player stream;
   - otherwise Cove's `match` endpoint is asked and `rankCandidates` picks the best for the requested type. Items with no match are reported as `unsupported`.
7. **Send:** one item uses `POST /api/system/downloaders/download`; several use `POST /api/system/downloaders/download-batch` with `preflightBeforeQueue`, so Cove creates a single job and reports skipped duplicates. Items are labelled with their URL so issues map back.
8. **Tracking:** the job is recorded with its URL keys. The worker polls it until it finishes, keeps the toolbar badge current, and releases the keys.

The pipeline takes its dependencies as an object (`PipelineDeps`), so `pipeline.test.ts` covers all of the above with a fake Cove client and no Chrome.

## User gestures

Chrome lets an extension call `chrome.sidePanel.open` and `chrome.permissions.request` only while a user gesture is active, and the gesture ends at the first `await`. Two consequences:

- `settingsCache` keeps settings in memory so click handlers can decide synchronously whether to open the panel. The handler calls `openPanel` **before** awaiting the pipeline.
- `openPanel` writes a `PanelIntent` to session storage and also broadcasts an event. A panel that is already open reacts to the event; one that is still loading reads the intent on start. Both paths exist on purpose.

Messages from a content script click carry the gesture into the worker, which is why the in-page buttons can open the panel.

## Duplicate protection

Three layers, each catching what the others cannot:

| Layer                                                   | Catches                                                  | Where         |
| ------------------------------------------------------- | -------------------------------------------------------- | ------------- |
| Reservations in `storage.session`                       | Two clicks before the first request finishes             | `tracking.ts` |
| Active job descriptions                                 | A download started from Cove's own UI or another browser | `pipeline.ts` |
| Cove's library check (409, or batch preflight `issues`) | Media already imported                                   | Cove          |

The content script adds a fourth, purely cosmetic layer: a button in the `busy` state refuses clicks.

## Storage

| Area              | Keys                                       | Why there                                                                                                                            |
| ----------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `storage.sync`    | `settings`                                 | Follows the user across browsers. One object, validated by `sanitizeSettings` on every read. Legacy 1.x flat keys are migrated once. |
| `storage.local`   | `pool`, `hiddenJobs`                       | Must survive browser restarts and closed incognito windows, but is device-specific.                                                  |
| `storage.session` | `tracking`, `panelIntent`, `eromeSelector` | Survives worker suspension; cleared when the browser exits.                                                                          |

## Messaging

`src/shared/messaging.ts` defines `MessageMap`: for every request type, its payload and response. `request()` sends a typed envelope and unwraps `{ ok, data | error }`; `serveRequests()` routes to handlers in the worker. Events from the worker to open panels use `broadcast()` / `onEvent()` with the `PanelEvent` union. Adding a message means adding one entry to the map; the compiler finds every handler that needs updating.

The worker also sends two untyped notices to tabs: `content:url-changed` (after a navigation) and `content:send-result` (so a context-menu send can show a toast on the page).

## Site support

Two mechanisms, and the first should be preferred:

- **Layouts** (`src/layouts/*.lay`): data files that describe where a Download button goes and how it looks. Validated by `layouts/schema.ts`, which also rejects selectors that could smuggle CSS or URLs. The content script places buttons idempotently and re-places them on DOM, URL, size, and theme changes.
- **Adapters** (`src/shared/sites/`): code for sites where the page URL is not enough. xHamster deciphers the player's HLS address; Erome parses an album into a video list. Keep the pure functions here and the Chrome glue in `background/site-media.ts`.

`SUPPORTED_SITE_HOSTS` in `sites/supported.ts` decides where the floating button appears in "supported sites" mode. Cove adds hosts advertised by its installed downloaders at runtime. A test keeps the list, the layout files, and `SUPPORTED_SITES.md` consistent.

## Panel data

- Settings come from `useSettings` and update live through `storage.onChanged`.
- Jobs come from `useJobs`: a SignalR connection to `/hubs/jobs` (the same hub the Cove UI uses) with polling as a fallback, and a slow poll as a safety net while live.
- Reads (status, match, jobs) go straight to Cove from the panel. Writes (send, pool) go through the worker so the pipeline's protections apply.

## Build

`npm run build` runs `tsc -b`, then `scripts/build-extension.mjs`:

1. `vite build` with `vite.config.ts`: the two HTML pages and the worker, sharing chunks.
2. One `vite build` per content script in library mode with the `iife` format.
3. Copies icons and layouts, writes `manifest.json` with the version from `package.json`, and verifies every file the manifest references exists.

`npm run pack` zips `dist/` for the store. Tests run with vitest and jsdom against the Chrome mock in `src/test/chrome-mock.ts`.
