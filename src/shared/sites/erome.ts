import { hostMatchesSite, parseHttpUrl } from "../url";

export const EROME_HOST = "erome.com";

export const EROME_MATCH_PATTERNS = [
  "http://erome.com/*",
  "https://erome.com/*",
  "http://*.erome.com/*",
  "https://*.erome.com/*",
];

export function isEromeHost(hostname: string): boolean {
  return hostMatchesSite(hostname, EROME_HOST);
}

/** Canonical album address for an Erome `/a/<id>` link, or an empty string. */
export function eromeAlbumUrl(value: string, base?: string): string {
  let url: URL;
  try {
    url = new URL(value, base);
  } catch {
    return "";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "";
  if (!isEromeHost(url.hostname)) return "";
  if (!/^\/a\/[^/]+\/?$/i.test(url.pathname)) return "";
  url.hash = "";
  return url.href;
}

export interface AlbumVideo {
  url: string;
  title: string;
  thumbnail: string;
  duration: string;
}

const EROME_VIDEO_EXT = /\.(?:mp4|m4v|webm|mov|mkv|ogv|ogg|flv)(?:$|\?)/i;
const TIME_RE = /^\d{1,2}:\d{2}(:\d{2})?$/;
const ZERO_TIME_RE = /^0+:00(:00)?$/;

function absoluteHttp(value: string, baseUrl: string): URL | null {
  try {
    return parseHttpUrl(new URL(value, baseUrl).href);
  } catch {
    return null;
  }
}

/** Best-resolution source for every `.media-group` in an album document. */
export function eromeVideosFromDocument(doc: Document, baseUrl: string): AlbumVideo[] {
  const videos: AlbumVideo[] = [];
  const seen = new Set<string>();
  for (const group of doc.querySelectorAll(".media-group")) {
    let bestUrl = "";
    let bestRes = -1;
    let poster = "";
    for (const video of group.querySelectorAll("video")) {
      const rawPoster = video.getAttribute("poster") || "";
      if (!rawPoster) continue;
      const url = absoluteHttp(rawPoster, baseUrl);
      if (url) {
        poster = url.href;
        break;
      }
    }
    for (const source of group.querySelectorAll("source[src]")) {
      const href = absoluteHttp(source.getAttribute("src") || "", baseUrl);
      if (!href || !EROME_VIDEO_EXT.test(href.pathname)) continue;
      const res = parseInt(source.getAttribute("res") || "0", 10) || 0;
      if (res >= bestRes) {
        bestRes = res;
        bestUrl = href.href;
      }
    }
    if (!bestUrl || seen.has(bestUrl)) continue;
    seen.add(bestUrl);
    const durationText = (group.querySelector(".duration")?.textContent || "").replace(/\s+/g, " ").trim();
    videos.push({
      url: bestUrl,
      title: `Video ${videos.length + 1}`,
      thumbnail: poster,
      duration: TIME_RE.test(durationText) && !ZERO_TIME_RE.test(durationText) ? durationText : "",
    });
  }
  return videos;
}
