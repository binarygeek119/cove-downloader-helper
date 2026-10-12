# Privacy Policy — Cove Downloader Helper

**Last updated:** 2026-10-12

**Extension:** Cove Downloader Helper
**Audience:** Adults 18+ only
**Developer:** binarygeek119
**Source:** https://github.com/binarygeek119/cove-downloader-helper

## Overview

Cove Downloader Helper is a Chrome extension for **adult (18+) users** that sends page, link, and video URLs to **your own** self-hosted [Cove](https://github.com/yourcove/cove) server so its downloaders (such as yt-dlp) can retrieve the media. It is designed for local and self-hosted use.

## Data we collect

This extension does **not** collect analytics, advertising identifiers, or account data for the developer. There is no developer-operated backend.

It processes the following information **on your device** and, when you choose to send a download, **to the Cove server URL you configure**:

| Data                                                                              | Where it stays                                                                                 | Why                                                                                                                                                                       |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cove URL and extension settings                                                   | Chrome sync storage                                                                            | So the extension can call your Cove API and remember your preferences across your signed-in browsers                                                                      |
| Optional Cove API token                                                           | Chrome sync storage                                                                            | To authenticate to your Cove instance when it has authentication on                                                                                                       |
| Page, link, and video URLs you explicitly send                                    | Sent only to your configured Cove URL                                                          | To start a download job in Cove                                                                                                                                           |
| Title, favicon, and preview image of pages you add to the pool, and the pool URLs | Chrome local storage on this device                                                            | So you can recognize pooled pages and send them later. The pool stays until you send, export, or clear it, including across browser restarts and closed incognito windows |
| Pool text file (optional)                                                         | Saved on your computer through Chrome's download dialog                                        | Only when you choose to export the pool                                                                                                                                   |
| Titles, lengths, and thumbnails of videos on the current page                     | Read from that page and shown in the panel on your device. Not stored or sent to the developer | So you can pick which videos to download when a page has more than one                                                                                                    |
| Ids and URLs of downloads you started                                             | Chrome session storage, cleared when the browser exits                                         | To show the badge, to stop a second click from downloading the same URL twice                                                                                             |
| Ids of finished jobs you hid from the panel                                       | Chrome local storage                                                                           | So hidden history stays hidden                                                                                                                                            |
| Job status                                                                        | Requested from your Cove server                                                                | To show progress in the panel                                                                                                                                             |

The extension does not sell data, does not use data for advertising, and does not send browsing data to the developer.

## Host / site access

The extension asks for optional access to `http://*/*` and `https://*/*` so it can:

1. Call the Cove API at whatever origin you configure (often a LAN or localhost address).
2. Show the floating download button and site-styled buttons on pages, when you turn them on.
3. Read the address, title, and embedded videos of the page you choose to send.

You can deny site access. Settings still save, but the extension cannot reach Cove or place buttons until access is granted.

## Third parties

The only network destination for download-related data is **the Cove server you configure**. If you use Cove with third-party downloaders (for example yt-dlp contacting media sites), that traffic comes from **your Cove server**, not from this extension or any developer service. See Cove's own documentation for server-side behavior.

## Data retention and deletion

- Remove the extension, or clear extension data in Chrome, to delete everything it stores.
- Media files and job history kept by Cove are controlled by your Cove instance.

## Children's privacy / age restriction

**This extension is intended only for adults (18+).** It is not directed at children under 18, and we do not knowingly collect personal information from anyone under 18. If you believe a minor has provided information through this extension, open an issue on the project repository so it can be addressed. Do not use this extension if you are under 18.

## Changes

This policy is updated when the extension's data practices change. The date at the top is revised accordingly.

## Contact

Open an issue on the project repository:
https://github.com/binarygeek119/cove-downloader-helper/issues
