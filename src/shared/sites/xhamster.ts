/**
 * xHamster stores player addresses as hex ciphertext. The open page has the ciphertext, while the
 * yt-dlp copy inside Cove often sees a page with no formats. The extension deciphers the playlist
 * address in the browser and sends that instead of the watch page.
 */
import { hostMatchesSite, parseHttpUrl } from "../url";

function xhamsterByteGenerator(algoId: number, seed: number): (() => number) | null {
  const state = { s: seed | 0 };
  const steps: Record<number, () => number> = {
    1() {
      state.s = (Math.imul(state.s, 1664525) + 1013904223) | 0;
      return state.s;
    },
    2() {
      let s = state.s;
      s = (s ^ (s << 13)) | 0;
      s = (s ^ (s >>> 17)) | 0;
      state.s = (s ^ (s << 5)) | 0;
      return state.s;
    },
    3() {
      let s = (state.s + 0x9e3779b9) | 0;
      state.s = s;
      s = (s ^ (s >>> 16)) | 0;
      s = Math.imul(s, 0x85ebca77);
      s = (s ^ (s >>> 13)) | 0;
      s = Math.imul(s, 0xc2b2ae3d);
      return (s ^ (s >>> 16)) | 0;
    },
    4() {
      let s = (state.s + 0x6d2b79f5) | 0;
      state.s = s;
      s = (s << 7) | (s >>> 25) | 0;
      s = (s + 0x9e3779b9) | 0;
      s = (s ^ (s >>> 11)) | 0;
      return Math.imul(s, 0x27d4eb2d);
    },
    5() {
      let s = state.s;
      s = (s ^ (s << 7)) | 0;
      s = (s ^ (s >>> 9)) | 0;
      s = (s ^ (s << 8)) | 0;
      state.s = (s + 0xa5a5a5a5) | 0;
      return state.s;
    },
    6() {
      const s = (Math.imul(state.s, 0x2c9277b5) + (0xac564b05 | 0)) | 0;
      state.s = s;
      const s2 = (s ^ (s >>> 18)) | 0;
      const shift = (s >>> 27) & 31;
      return (s2 >>> shift) | 0;
    },
    7() {
      const s = (state.s + 0x9e3779b9) | 0;
      state.s = s;
      let mixed = (s ^ (s << 5)) | 0;
      mixed = Math.imul(mixed, 0x7feb352d);
      mixed = (mixed ^ (mixed >>> 15)) | 0;
      return Math.imul(mixed, 0x846ca68b);
    },
  };
  const step = steps[algoId];
  if (!step) return null;
  return () => step() & 0xff;
}

export function decipherXhamsterHex(hex: string): string {
  if (typeof hex !== "string" || !/^[0-9a-fA-F]{12,}$/.test(hex) || hex.length % 2 !== 0) return "";
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  const seed = bytes[1]! | (bytes[2]! << 8) | (bytes[3]! << 16) | (bytes[4]! << 24) | 0;
  const next = xhamsterByteGenerator(bytes[0]!, seed);
  if (!next) return "";
  let text = "";
  for (let index = 5; index < bytes.length; index += 1) {
    text += String.fromCharCode(bytes[index]! ^ next());
  }
  return text;
}

/** Deciphers a bare hex token or a URL whose first path segment is hex ciphertext. */
export function resolveXhamsterFormatUrl(formatUrl: string): string {
  if (typeof formatUrl !== "string") return "";
  const trimmed = formatUrl.trim();
  if (!trimmed || trimmed.startsWith("blob:") || trimmed.startsWith("data:")) return "";
  if (/^[0-9a-fA-F]+$/.test(trimmed)) {
    const text = decipherXhamsterHex(trimmed);
    return /^https?:\/\//i.test(text) ? text : "";
  }
  const parsed = parseHttpUrl(trimmed);
  if (!parsed) return "";
  const match = /^\/([0-9a-fA-F]{12,})([/,].+)$/.exec(parsed.pathname);
  if (!match) return parsed.href;
  const text = decipherXhamsterHex(match[1]!);
  if (!text) return "";
  return `${parsed.protocol}//${parsed.host}/${text.replace(/^\/+/, "")}${match[2]}${parsed.search}${parsed.hash}`;
}

function playlistUrl(value: string): string {
  const url = parseHttpUrl(value);
  return url && /\.m3u8$/i.test(url.pathname) ? url.href : "";
}

/** First HLS playlist among the player candidates, deciphered. */
export function xhamsterStreamUrl(candidates: readonly string[]): string {
  for (const candidate of candidates) {
    const playlist = playlistUrl(resolveXhamsterFormatUrl(candidate));
    if (playlist) return playlist;
  }
  return "";
}

export function isXhamsterWatchUrl(value: string): boolean {
  const url = parseHttpUrl(value);
  if (!url || !hostMatchesSite(url.hostname, "xhamster.com")) return false;
  return url.pathname === "/videos/" || url.pathname.startsWith("/videos/");
}

interface XhamsterInitials {
  xplayerSettings?: { sources?: { hls?: { url?: unknown; fallback?: unknown }; standard?: Record<string, unknown> } };
  videoModel?: { sources?: Record<string, unknown> };
}

/**
 * Collect player address strings from `window.initials`, the video element, and the resource
 * timeline. Runs in the page's main world through `chrome.scripting.executeScript({ func })`, so it
 * is serialized and must stay self-contained: it cannot call anything else in this module.
 */
export function collectXhamsterPlayerUrlsInPage(): string[] {
  const found: string[] = [];
  const remember = (value: unknown) => {
    if (typeof value !== "string") return;
    const raw = value.trim();
    if (!raw || raw.startsWith("blob:") || raw.startsWith("data:")) return;
    found.push(raw);
  };
  const initials = (window as unknown as { initials?: XhamsterInitials }).initials;
  const sources = initials?.xplayerSettings?.sources;
  if (sources && typeof sources === "object") {
    const hls = sources.hls;
    if (hls && typeof hls === "object") {
      remember(hls.url);
      remember(hls.fallback);
    }
    const standard = sources.standard;
    if (standard && typeof standard === "object") {
      for (const group of Object.values(standard)) {
        if (!Array.isArray(group)) continue;
        for (const item of group) {
          if (!item || typeof item !== "object") continue;
          remember((item as { url?: unknown }).url);
          remember((item as { fallback?: unknown }).fallback);
        }
      }
    }
  }
  const model = initials?.videoModel?.sources;
  if (model && typeof model === "object") {
    for (const [formatId, group] of Object.entries(model)) {
      if (formatId === "download") continue;
      if (!group || typeof group !== "object" || Array.isArray(group)) continue;
      for (const value of Object.values(group as Record<string, unknown>)) remember(value);
    }
  }
  try {
    const video = document.querySelector("video");
    remember(video?.currentSrc || video?.src);
  } catch {
    // The page has no player yet.
  }
  try {
    for (const entry of performance.getEntriesByType("resource")) remember(entry.name);
  } catch {
    // Resource timing can be unavailable.
  }
  return found;
}
