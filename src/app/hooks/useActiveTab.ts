import { useEffect, useState } from "react";
import { isHttpUrl } from "@/shared/url";

export interface ActiveTab {
  id: number;
  windowId: number;
  url: string;
  title: string;
}

/** The http(s) tab the user is looking at in this window, or null. Panel mode only. */
export function useActiveTab(enabled: boolean): ActiveTab | null {
  const [tab, setTab] = useState<ActiveTab | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const read = async () => {
      try {
        const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (cancelled) return;
        const id = active?.id;
        const windowId = active?.windowId;
        const url = active?.url;
        const title = active?.title ?? "";
        if (id !== undefined && windowId !== undefined && isHttpUrl(url)) {
          setTab((previous) =>
            previous && previous.id === id && previous.url === url && previous.title === title
              ? previous
              : { id, windowId, url, title },
          );
        } else {
          setTab(null);
        }
      } catch {
        if (!cancelled) setTab(null);
      }
    };

    void read();
    const onActivated = () => void read();
    const onUpdated = (_tabId: number, info: chrome.tabs.OnUpdatedInfo) => {
      if (info.url || info.title || info.status === "complete") void read();
    };
    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    return () => {
      cancelled = true;
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, [enabled]);

  return tab;
}
