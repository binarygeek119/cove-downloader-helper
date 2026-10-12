# Changelog

## 2.0.0

A ground-up rewrite in TypeScript, React, Tailwind, and Vite, with the same tooling as the Cove UI.

### New

- Works without configuration when Cove runs on `http://localhost:5073`.
- In-page buttons show busy, done, and error states. A second click on something already in flight is ignored.
- Duplicate protection: URLs already being sent, already downloading in Cove, or already in the library are reported instead of downloaded twice.
- Multiple videos (from a page, an Erome album, or the pool) go to Cove as one batch job through the `download-batch` endpoint. Skipped and failed items are listed.
- The pool persists across browser restarts and closed incognito windows, dedupes by URL, shows per-item remove, and only clears after a `.txt` export finishes saving.
- Explicit **Add to Cove pool** entries in the context menu, plus keyboard shortcuts to add the page to the pool and to send the pool to Cove.
- A separate "close the tab after adding it to the pool" option.
- A preferred quality setting: best available, or up to 1080p, 1440p, or 4K. Applies to every send unless the panel picks a quality explicitly.
- Settings shows the keyboard shortcuts Chrome has actually bound and links to the shortcuts page. The default is `Alt+Shift+C`.
- The toolbar badge counts downloads started from this browser, or pooled URLs in pool mode.
- Live job progress in the panel through Cove's SignalR hub, with polling as a fallback.
- Connection status in the panel header, and a welcome page on first install.
- 1.x settings and 1.x settings export files are migrated automatically.

### Changed

- The side panel replaces the full-tab picker. Sending opens the panel only when asked to (confirm before sending, or open the panel when a download starts).
- Settings simplified: one floating-button setting (off, supported sites, every page), one default type (auto, video, audio, image, text), and pool mode. The old "queue all matches" option is gone.
- Site-styled buttons are on by default.

### Internal

- One send pipeline in the service worker for every entry point.
- Typed messaging between the panel, content scripts, and the worker.
- Pure, tested modules for match ranking, settings, layouts, the xHamster cipher, and media URL wrapping.
- Build with Vite: ES module service worker, IIFE content scripts, version from `package.json`.
