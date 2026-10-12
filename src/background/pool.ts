import { broadcast } from "../shared/messaging";
import type { PoolEntry } from "../shared/models";
import { isHttpUrl, parseHttpUrl, urlKey } from "../shared/url";
import { notePoolSize, updateBadge } from "./badge";

/**
 * The pool lives in `chrome.storage.local`, so it survives closing an incognito window and
 * restarting the browser. (`storage.session` is wiped when the browser exits, which is how 1.x lost
 * pooled URLs.)
 */
const POOL_KEY = "pool";
const POOL_LIMIT = 2000;

export interface PoolInput {
  url: string;
  title?: string;
  favicon?: string;
  thumbnail?: string;
}

export async function getPool(): Promise<PoolEntry[]> {
  const stored = await chrome.storage.local.get(POOL_KEY);
  const entries = stored[POOL_KEY];
  return Array.isArray(entries) ? (entries as PoolEntry[]) : [];
}

async function writePool(entries: PoolEntry[]): Promise<void> {
  await chrome.storage.local.set({ [POOL_KEY]: entries });
  notePoolSize(entries.length);
  broadcast({ kind: "pool-changed", total: entries.length });
  await updateBadge();
}

export async function addToPool(inputs: PoolInput[]): Promise<{ added: number; duplicates: number; total: number }> {
  const entries = await getPool();
  const keys = new Set(entries.map((entry) => entry.key));
  let added = 0;
  let duplicates = 0;
  for (const input of inputs) {
    if (!isHttpUrl(input.url)) continue;
    const key = urlKey(input.url);
    if (keys.has(key)) {
      duplicates += 1;
      continue;
    }
    keys.add(key);
    const host = parseHttpUrl(input.url)?.hostname ?? "";
    entries.push({
      key,
      url: input.url,
      title: (input.title || "").trim().slice(0, 200) || host,
      favicon: isHttpUrl(input.favicon) ? input.favicon : "",
      thumbnail: isHttpUrl(input.thumbnail) ? input.thumbnail : "",
      addedAt: Date.now(),
    });
    added += 1;
  }
  const trimmed = entries.slice(-POOL_LIMIT);
  if (added) await writePool(trimmed);
  return { added, duplicates, total: trimmed.length };
}

export async function removeFromPool(keys: string[]): Promise<number> {
  const drop = new Set(keys);
  const entries = (await getPool()).filter((entry) => !drop.has(entry.key));
  await writePool(entries);
  return entries.length;
}

export async function clearPool(): Promise<void> {
  await writePool([]);
}

/** Save the pooled URLs as a text file. The pool is cleared only after the file finishes saving. */
export async function exportPoolAsText(): Promise<boolean> {
  const entries = await getPool();
  if (!entries.length) return false;
  const text = entries.map((entry) => entry.url).join("\n") + "\n";
  const dataUrl = "data:text/plain;charset=utf-8," + encodeURIComponent(text);
  const stamp = new Date().toISOString().slice(0, 10);
  let downloadId: number;
  try {
    downloadId = await chrome.downloads.download({ url: dataUrl, filename: `cove-pool-${stamp}.txt`, saveAs: true });
  } catch {
    return false;
  }
  const onChanged = (delta: chrome.downloads.DownloadDelta) => {
    if (delta.id !== downloadId || !delta.state) return;
    if (delta.state.current === "complete") void clearPool();
    if (delta.state.current === "complete" || delta.state.current === "interrupted") {
      chrome.downloads.onChanged.removeListener(onChanged);
    }
  };
  chrome.downloads.onChanged.addListener(onChanged);
  return true;
}

/** Title, favicon, and social image for a tab, used to make pool rows recognizable. */
export async function describeTab(tab: chrome.tabs.Tab | undefined, url: string): Promise<PoolInput> {
  const input: PoolInput = { url, title: tab?.title, favicon: tab?.favIconUrl };
  if (!tab?.id || tab.url !== url) return input;
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const pick = (selector: string) => document.querySelector<HTMLMetaElement>(selector)?.content || "";
        return pick('meta[property="og:image"]') || pick('meta[name="twitter:image"]');
      },
    });
    if (typeof result?.result === "string") input.thumbnail = result.result;
  } catch {
    // Restricted page; the row shows without a thumbnail.
  }
  return input;
}
