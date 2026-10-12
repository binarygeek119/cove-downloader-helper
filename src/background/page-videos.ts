import type { PageVideosResult } from "../shared/models";

const COLLECT_TIMEOUT = 8000;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Find the videos embedded in a tab. The collector script is injected on demand, keeps its own
 * cache in the page, and reports `unchanged` when nothing moved since the last call.
 */
export async function collectPageVideos(tabId: number): Promise<PageVideosResult> {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["content/page-videos.js"] });
  const [injected] = await withTimeout(
    chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const collect = (globalThis as { __coveCollectPageVideos?: () => Promise<unknown> }).__coveCollectPageVideos;
        return collect ? collect() : { pageUrl: location.href, videos: [] };
      },
    }),
    COLLECT_TIMEOUT,
    "Timed out reading the videos on this page.",
  );
  const result = injected?.result as Partial<PageVideosResult> | undefined;
  return {
    pageUrl: typeof result?.pageUrl === "string" ? result.pageUrl : "",
    videos: Array.isArray(result?.videos) ? result.videos : [],
    unchanged: result?.unchanged === true,
  };
}
