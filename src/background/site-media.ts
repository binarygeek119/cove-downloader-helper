import { broadcast } from "../shared/messaging";
import type { EromeSelectorState, PageVideo } from "../shared/models";
import { EROME_SELECTOR_KEY } from "../shared/panel-intent";
import { isVideoFileUrl, videoUrlForCove, withYtDlpReferer } from "../shared/sites/media-url";
import { collectXhamsterPlayerUrlsInPage, isXhamsterWatchUrl, xhamsterStreamUrl } from "../shared/sites/xhamster";
import { isHttpUrl, parseHttpUrl } from "../shared/url";
import { openPanel } from "./panel";

/**
 * Site-specific media resolution that needs the open tab. Returns a replacement address for
 * Cove, or null to send the page URL and let Cove match it.
 */
export async function resolveSiteMedia(pageUrl: string, tabId: number | undefined): Promise<string | null> {
  if (tabId === undefined) return null;
  if (isXhamsterWatchUrl(pageUrl)) return xhamsterStreamForTab(pageUrl, tabId);
  return null;
}

function samePath(a: string, b: string): boolean {
  const left = parseHttpUrl(a);
  const right = parseHttpUrl(b);
  return !!left && !!right && left.origin === right.origin && left.pathname === right.pathname;
}

async function xhamsterStreamForTab(pageUrl: string, tabId: number): Promise<string | null> {
  let tabUrl = "";
  try {
    tabUrl = (await chrome.tabs.get(tabId)).url ?? "";
  } catch {
    return null;
  }
  if (!samePath(pageUrl, tabUrl)) return null;
  let candidates: string[] = [];
  try {
    const [injected] = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: collectXhamsterPlayerUrlsInPage,
    });
    if (Array.isArray(injected?.result)) candidates = injected.result as string[];
  } catch {
    return null;
  }
  const stream = xhamsterStreamUrl(candidates);
  if (!isHttpUrl(stream)) return null;
  return isVideoFileUrl(stream) ? videoUrlForCove(stream, pageUrl) : withYtDlpReferer(stream, pageUrl);
}

let eromeToken = 0;

function publishErome(state: EromeSelectorState): void {
  void chrome.storage.session.set({ [EROME_SELECTOR_KEY]: state });
  broadcast({ kind: "erome-selector", state });
}

/** Open the panel in a loading state while the content script reads the album. Needs the click gesture. */
export function openEromeSelector(albumUrl: string, windowId: number | undefined): number {
  eromeToken += 1;
  openPanel(windowId, { tab: "download" });
  publishErome({ token: eromeToken, albumUrl, loading: true, videos: [] });
  return eromeToken;
}

export function completeEromeSelector(token: number, albumUrl: string, videos: PageVideo[], error?: string): boolean {
  if (token !== eromeToken) return false;
  const cleaned = videos
    .filter((video) => isHttpUrl(video.url))
    .slice(0, 80)
    .map((video, index) => ({
      url: video.url,
      title:
        String(video.title || "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 120) || `Video ${index + 1}`,
      thumbnail: isHttpUrl(video.thumbnail) ? video.thumbnail : "",
      duration: /^\d{1,2}:\d{2}(:\d{2})?$/.test(video.duration) ? video.duration : "",
    }));
  publishErome({ token, albumUrl, loading: false, videos: cleaned, error: error?.slice(0, 200) });
  return true;
}
