# Privacy Policy — Cove Downloader Helper

**Last updated:** 2026-09-09

**Extension:** Cove Downloader Helper  
**Developer:** binarygeek119  
**Source:** https://github.com/binarygeek119/cove-downloader-helper

## Overview

Cove Downloader Helper is a Chrome extension that helps you send web page and link URLs to **your own** self-hosted [Cove](https://github.com/yourcove/cove) instance so Cove downloaders (such as yt-dlp) can retrieve media. The extension is designed for local / self-hosted use.

## Data we collect

This extension does **not** collect analytics, advertising identifiers, or account data for the developer.

It may process the following information **on your device** and, when you choose to send a download, **to the Cove server URL you configure**:

| Data | Where it stays | Why |
| --- | --- | --- |
| Cove base URL | Chrome sync/local storage on your browser | So the extension can call your Cove API |
| Optional Cove API token (PAT) | Chrome sync storage on your browser | To authenticate to your Cove instance when auth is enabled |
| Extension preferences (preferred mode, auto-send, in-page buttons, etc.) | Chrome sync storage | To remember your settings |
| Page / link URLs you explicitly send | Sent only to your configured Cove URL | To start a download / match job in Cove |
| Temporary pending URL in session storage | Browser session only | To open the helper Download tab for the URL you just selected |

The extension does **not** sell user data, does not use data for advertising, and does not send browsing data to the extension author.

## How data is used

- Stored settings are used only to operate the extension.
- URLs you send are transmitted to **your configured Cove host** over HTTP or HTTPS, depending on the URL you enter.
- Job status may be requested from your Cove host to show progress in the helper UI.

## Host / site access

Optional access to `http://*/*` and `https://*/*` is requested so the extension can:

1. Call the Cove API at whatever origin you configure (often a LAN or localhost URL)
2. Optionally show in-page download controls on websites you visit
3. Read the page or link URL you choose to send

You can deny site access; core settings still save, but talking to Cove and in-page buttons will not work until permission is granted.

## Third parties

The only network destination for download-related data is **the Cove server you configure**. There is no developer-operated backend for this extension.

If you use Cove with third-party downloaders (for example yt-dlp contacting media sites), that traffic is initiated by **your Cove server**, not by a developer cloud service for this extension. See Cove’s own documentation for server-side behavior.

## Data retention and deletion

- Extension storage can be cleared by removing the extension or clearing site/extension data in Chrome.
- Media files and job history retained by Cove are controlled by your Cove instance, not by this extension.

## Children’s privacy

This extension is not directed at children under 13.

## Changes

We may update this policy when the extension’s data practices change. The “Last updated” date at the top will be revised accordingly.

## Contact

Open an issue on the project repository:  
https://github.com/binarygeek119/cove-downloader-helper/issues
