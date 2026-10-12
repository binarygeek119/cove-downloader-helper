/**
 * Injected on demand to list the videos embedded in a page for the panel. Exposes
 * `globalThis.__coveCollectPageVideos`, which the worker calls in a second injection. Keeps a cache
 * in the page so repeated calls while nothing changed are cheap.
 */
import type { PageVideo, PageVideosResult } from "../shared/models";
import { mapLimit } from "../shared/async";

interface Quick extends PageVideo {
  lightbox: boolean;
}

interface State {
  cache: { key: string; pageUrl: string; videos: PageVideo[] };
}

declare global {
  var __covePageVideosState: State | undefined;
  var __coveCollectPageVideos: (() => Promise<PageVideosResult>) | undefined;
}

const state: State = globalThis.__covePageVideosState ?? { cache: { key: "", pageUrl: "", videos: [] } };
globalThis.__covePageVideosState = state;

function absoluteUrl(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw || raw.startsWith("blob:") || raw.startsWith("data:")) return "";
  try {
    const url = new URL(raw, location.href);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

const RESOLUTION_HINTS: [RegExp, number][] = [
  [/2160|4k/, 2160],
  [/1440/, 1440],
  [/1080/, 1080],
  [/720/, 720],
  [/480/, 480],
  [/360/, 360],
  [/240/, 240],
];

function sourceScore(source: Element, url: string): number {
  const res = parseInt(source.getAttribute("res") || source.getAttribute("data-res") || "0", 10);
  let score = Number.isFinite(res) ? res : 0;
  const label = `${source.getAttribute("label") || ""} ${source.getAttribute("type") || ""} ${url}`.toLowerCase();
  for (const [pattern, value] of RESOLUTION_HINTS) if (pattern.test(label)) score = Math.max(score, value);
  return score;
}

function mediaUrl(video: HTMLVideoElement): string {
  let best = "";
  let bestScore = -1;
  for (const source of video.querySelectorAll("source")) {
    const url = absoluteUrl(
      source.getAttribute("src") || source.getAttribute("data-src") || source.getAttribute("data-url"),
    );
    if (!url) continue;
    const score = sourceScore(source, url);
    if (score >= bestScore) {
      bestScore = score;
      best = url;
    }
  }
  return (
    best ||
    absoluteUrl(video.currentSrc) ||
    absoluteUrl(video.getAttribute("src")) ||
    absoluteUrl(video.getAttribute("data-src")) ||
    absoluteUrl(video.getAttribute("data-video-src")) ||
    absoluteUrl(video.getAttribute("data-url"))
  );
}

function thumbnailUrl(video: HTMLVideoElement): string {
  const direct =
    absoluteUrl(video.getAttribute("poster")) ||
    absoluteUrl(video.getAttribute("data-poster")) ||
    absoluteUrl(video.getAttribute("data-thumbnail")) ||
    absoluteUrl(video.dataset.poster || video.dataset.thumbnail);
  if (direct) return direct;
  const img = video.parentElement?.querySelector("img[src], img[data-src]");
  return img ? absoluteUrl(img.getAttribute("src") || img.getAttribute("data-src")) : "";
}

const TIME_RE = /^\d{1,2}:\d{2}(:\d{2})?$/;
const ZERO_TIME_RE = /^0+:00(:00)?$/;

function clean(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 86400) return "";
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
}

function hasOtherVideo(node: Element, video: HTMLVideoElement, ownUrl: string): boolean {
  return [...node.querySelectorAll("video")].some((el) => {
    if (el === video) return false;
    const url = mediaUrl(el);
    return !!url && url !== ownUrl;
  });
}

function durationLabel(video: HTMLVideoElement): string {
  const ownUrl = mediaUrl(video);
  const found: string[] = [];
  let node: Element | null = video.parentElement;
  for (let depth = 0; node && depth < 6; depth += 1, node = node.parentElement) {
    for (const span of node.querySelectorAll('.duration, [class*="duration"], time')) {
      const owner = span.closest("video");
      if (owner && owner !== video) continue;
      const hostVideo = span.parentElement?.querySelector("video");
      if (hostVideo && hostVideo !== video) {
        const hostUrl = mediaUrl(hostVideo);
        if (hostUrl && hostUrl !== ownUrl) continue;
      }
      const text = clean(span.textContent);
      if (TIME_RE.test(text)) found.push(text);
    }
    if (hasOtherVideo(node, video, ownUrl)) break;
  }
  const positive = found.find((text) => !ZERO_TIME_RE.test(text));
  if (positive) return positive;
  const probed = formatDuration(video.duration);
  return probed && !ZERO_TIME_RE.test(probed) ? probed : "";
}

function ownTitle(video: HTMLVideoElement): string {
  const attr = clean(video.getAttribute("title") || video.getAttribute("aria-label"));
  if (attr) return attr.slice(0, 180);
  const ownUrl = mediaUrl(video);
  let node: Element | null = video.parentElement;
  for (let depth = 0; node && depth < 5; depth += 1, node = node.parentElement) {
    if (hasOtherVideo(node, video, ownUrl)) break;
    const heading = node.querySelector("h1, h2, h3, h4, figcaption, .media-title, .video-title");
    if (heading && !heading.querySelector("video")) {
      const text = clean(heading.textContent);
      if (text.length > 1 && text.length < 180 && !TIME_RE.test(text)) return text;
    }
  }
  return "";
}

function isLightbox(video: HTMLVideoElement): boolean {
  if (video.closest(".video-lg, .lg-outer, .lg-item, [class*='lightbox']")) return true;
  return String(video.className || "").includes("lg-video-object");
}

function score(item: Quick): number {
  return (item.duration ? 4 : 0) + (item.thumbnail ? 1 : 0) + (item.lightbox ? 0 : 8);
}

function probeDuration(url: string): Promise<string> {
  return new Promise((resolve) => {
    const el = document.createElement("video");
    el.preload = "metadata";
    let settled = false;
    const finish = (value: string) => {
      if (settled) return;
      settled = true;
      el.removeAttribute("src");
      try {
        el.load();
      } catch {
        // Nothing to release.
      }
      resolve(value);
    };
    const timer = setTimeout(() => finish(""), 1500);
    el.addEventListener("loadedmetadata", () => {
      clearTimeout(timer);
      finish(formatDuration(el.duration));
    });
    el.addEventListener("error", () => {
      clearTimeout(timer);
      finish("");
    });
    el.src = url;
  });
}

/** Inline small thumbnails so the panel can show them without a referer-gated request. */
async function thumbnailData(url: string): Promise<string> {
  if (!url) return "";
  try {
    const response = await fetch(url, { credentials: "omit", signal: AbortSignal.timeout(2000) });
    if (!response.ok) return url;
    const blob = await response.blob();
    if (!blob.size || blob.size > 180000) return url;
    return await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : url);
      reader.onerror = () => resolve(url);
      reader.readAsDataURL(blob);
    });
  } catch {
    return url;
  }
}

function pageTitle(): string {
  const heading = document.querySelector("h1");
  return clean(heading?.textContent || document.title || "Video").slice(0, 180) || "Video";
}

function pageUrl(): string {
  return location.href.split("#")[0] ?? location.href;
}

function collectQuick(): Quick[] {
  const byUrl = new Map<string, Quick>();
  for (const video of document.querySelectorAll("video")) {
    const url = mediaUrl(video);
    if (!url) continue;
    const item: Quick = {
      url,
      title: ownTitle(video),
      thumbnail: thumbnailUrl(video),
      duration: durationLabel(video),
      lightbox: isLightbox(video),
    };
    const previous = byUrl.get(url);
    if (!previous || score(item) > score(previous)) byUrl.set(url, item);
  }
  return [...byUrl.values()];
}

globalThis.__coveCollectPageVideos = async function collectPageVideos(): Promise<PageVideosResult> {
  const currentPage = pageUrl();
  const quick = collectQuick();
  if (quick.length < 2) {
    state.cache = { key: "", pageUrl: currentPage, videos: [] };
    return { pageUrl: currentPage, videos: [] };
  }
  const key = quick.map((item) => [item.url, item.duration, item.title].join("|")).join("\n");
  if (key === state.cache.key && state.cache.pageUrl === currentPage) {
    return { pageUrl: currentPage, unchanged: true, videos: state.cache.videos };
  }

  const title = pageTitle();
  const items = await mapLimit(quick, 4, async (item): Promise<PageVideo> => ({
    url: item.url,
    title: item.title,
    thumbnail: await thumbnailData(item.thumbnail),
    duration: item.duration || (await probeDuration(item.url)),
  }));
  const named = items.map((item) => item.title).filter(Boolean);
  const sharedTitle = named.length === items.length && new Set(named).size === 1;
  items.forEach((item, index) => {
    if (!item.title) item.title = `${title} (${index + 1})`;
    else if (sharedTitle) item.title = `${item.title} (${index + 1})`;
  });
  state.cache = { key, pageUrl: currentPage, videos: items };
  return { pageUrl: currentPage, videos: items };
};
