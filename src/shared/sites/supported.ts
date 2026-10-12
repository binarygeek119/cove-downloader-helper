import { hostMatchesSite, parseHttpUrl, stripWww } from "../url";

/**
 * Hosts the bundled Cove downloaders handle. yt-dlp advertises every http(s) URL, so its
 * wildcard patterns are ignored and the common yt-dlp hosts are listed here instead.
 * Cove adds more hosts at runtime from the downloaders installed on the instance.
 */
export const SUPPORTED_SITE_HOSTS: readonly string[] = [
  "literotica.com",
  "soundgasm.net",
  "whyp.it",
  "reddit.com",
  "redd.it",
  "redgifs.com",
  "redgif.com",
  "youtube.com",
  "youtu.be",
  "youtube-nocookie.com",
  "vimeo.com",
  "twitch.tv",
  "tiktok.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "facebook.com",
  "fb.watch",
  "dailymotion.com",
  "soundcloud.com",
  "bandcamp.com",
  "rumble.com",
  "bitchute.com",
  "odysee.com",
  "nicovideo.jp",
  "bilibili.com",
  "streamable.com",
  "imgur.com",
  "pornhub.com",
  "xvideos.com",
  "xnxx.com",
  "xhamster.com",
  "spankbang.com",
  "eporner.com",
  "youporn.com",
  "redtube.com",
  "tnaflix.com",
  "motherless.com",
  "erome.com",
];

export const DIRECT_MEDIA_EXTENSIONS: readonly string[] = [
  "mp4",
  "webm",
  "mkv",
  "mov",
  "m4v",
  "mp3",
  "m4a",
  "flac",
  "wav",
  "ogg",
  "opus",
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
];

const DIRECT_MEDIA_RE = new RegExp(`\\.(${DIRECT_MEDIA_EXTENSIONS.join("|")})$`, "i");

export function isDirectMediaUrl(value: string): boolean {
  const url = parseHttpUrl(value);
  return !!url && DIRECT_MEDIA_RE.test(url.pathname);
}

export function isSupportedSiteUrl(value: string, extraHosts: readonly string[] = []): boolean {
  const url = parseHttpUrl(value);
  if (!url) return false;
  if (DIRECT_MEDIA_RE.test(url.pathname)) return true;
  return [...SUPPORTED_SITE_HOSTS, ...extraHosts].some((site) => hostMatchesSite(url.hostname, site));
}

/** Pull a concrete host out of a downloader URL pattern such as `https://*.example.com/*`. */
export function hostsFromUrlPattern(pattern: string): string[] {
  let raw = String(pattern || "")
    .trim()
    .toLowerCase();
  if (!raw || raw === "*" || raw === "http://*/*" || raw === "https://*/*" || raw === "*://*/*") return [];
  raw = raw.replace(/^[a-z*]+:\/\//, "").replace(/^\*\./, "");
  const host =
    raw
      .split(/[/?#]/)[0]
      ?.replace(/^\*\./, "")
      .replace(/^www\./, "") ?? "";
  if (!host || host === "*" || host.includes("*")) return [];
  return [host];
}

const TEXT_HOSTS = ["literotica.com"];
const AUDIO_HOSTS = ["soundgasm.net", "whyp.it"];

/** Sites whose pages are a text story or an audio clip rather than a video. */
export function siteMediaKind(value: string): "text" | "audio" | null {
  const url = parseHttpUrl(value);
  if (!url) return null;
  const host = stripWww(url.hostname);
  if (TEXT_HOSTS.some((site) => hostMatchesSite(host, site))) return "text";
  if (AUDIO_HOSTS.some((site) => hostMatchesSite(host, site))) return "audio";
  return null;
}
