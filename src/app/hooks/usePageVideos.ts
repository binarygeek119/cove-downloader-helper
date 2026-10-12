import { useEffect, useState } from "react";
import { request } from "@/shared/messaging";
import type { PageVideo } from "@/shared/models";

const POLL_MS = 3000;

export interface PageVideosState {
  pageUrl: string;
  videos: PageVideo[];
}

const EMPTY: PageVideosState = { pageUrl: "", videos: [] };

/**
 * Videos embedded in the active tab, refreshed while the panel is visible. Only pages with two or
 * more videos are reported; single-video pages take the normal send path.
 */
export function usePageVideos(tabId: number | null, tabUrl: string): PageVideosState {
  const key = tabId === null ? "" : `${tabId}\n${tabUrl}`;
  const [result, setResult] = useState<{ key: string; signature: string; state: PageVideosState } | null>(null);

  useEffect(() => {
    if (!key || tabId === null) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = () => {
      if (!cancelled) timer = setTimeout(tick, POLL_MS);
    };
    const tick = () => {
      if (document.visibilityState !== "visible") {
        schedule();
        return;
      }
      request("page-videos:collect", { tabId })
        .then((collected) => {
          if (cancelled) return;
          const videos = collected.videos.length > 1 ? collected.videos : [];
          const signature = videos.map((video) => [video.url, video.duration, video.title].join("|")).join("\n");
          setResult((previous) =>
            previous?.key === key && previous.signature === signature
              ? previous
              : { key, signature, state: { pageUrl: collected.pageUrl || tabUrl, videos } },
          );
        })
        .catch(() => {
          if (!cancelled)
            setResult((previous) =>
              previous?.key === key && !previous.signature ? previous : { key, signature: "", state: EMPTY },
            );
        })
        .finally(schedule);
    };
    tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [key, tabId, tabUrl]);

  return result?.key === key ? result.state : EMPTY;
}
