import { broadcast, serveRequests } from "../shared/messaging";
import type { PanelTab, SendOutcome, SendSource } from "../shared/models";
import { onSettingsChanged } from "../shared/settings";
import { isHttpUrl, parseHttpUrl, sameOrigin } from "../shared/url";
import { flashErrorBadge, notePoolSize, updateBadge } from "./badge";
import { syncContentScripts } from "./content-scripts";
import { clientFor, supportedHostsFor } from "./cove";
import { hasHostPermission, hostPermission, requestHostPermission } from "./host-permission";
import { layoutTargetsFor } from "./layouts";
import { ensureContextMenus, MENU } from "./menus";
import { collectPageVideos } from "./page-videos";
import { enablePanel, openPanel } from "./panel";
import { createPipeline, POOLABLE_SOURCES, QUICK_SOURCES, type SendInput } from "./pipeline";
import { addToPool, clearPool, describeTab, exportPoolAsText, getPool, removeFromPool } from "./pool";
import { settingsCache } from "./settings-cache";
import { completeEromeSelector, openEromeSelector, resolveSiteMedia } from "./site-media";
import { listTrackedJobs, releaseKeys, reserveKeys, resumeTracking, TRACKING_ALARM, trackJob } from "./tracking";

async function tabById(tabId: number | undefined): Promise<chrome.tabs.Tab | undefined> {
  if (tabId === undefined) return undefined;
  try {
    return await chrome.tabs.get(tabId);
  } catch {
    return undefined;
  }
}

const pipeline = createPipeline({
  getSettings: () => settingsCache.get(),
  clientFor,
  resolveSiteMedia,
  reserveKeys,
  releaseKeys,
  trackJob,
  addToPool,
  describeTab: async (tabId, url) => describeTab(await tabById(tabId), url),
  closeTab: (tabId) => chrome.tabs.remove(tabId),
  requestReview: (item, input) =>
    openPanel(input.windowId, { tab: "download", review: { ...item, tabId: input.tabId } }),
  onError: () => void flashErrorBadge(),
});

/**
 * Decide synchronously, from cached settings, whether this send should open the panel. Must run
 * before the first `await` so the user gesture still covers `sidePanel.open`.
 */
function openPanelForSend(input: SendInput): void {
  const settings = settingsCache.current;
  if (!settings || input.windowId === undefined) return;
  const quick = QUICK_SOURCES.includes(input.source);
  const single = input.items.length === 1 && input.items[0] && !input.items[0].downloaderId;
  if (settings.poolMode && POOLABLE_SOURCES.includes(input.source)) {
    if (settings.openPanelOnSend) openPanel(input.windowId, { tab: "pool" });
    return;
  }
  if (quick && settings.confirmBeforeSend && single) {
    openPanel(input.windowId, { tab: "download", review: { ...input.items[0]!, tabId: input.tabId } });
    return;
  }
  if (settings.openPanelOnSend && input.source !== "panel") openPanel(input.windowId, { tab: "queue" });
}

function tellTab(tabId: number | undefined, outcome: SendOutcome, source: SendSource): void {
  broadcast({ kind: "send-result", source, outcome });
  if (tabId === undefined) return;
  chrome.tabs.sendMessage(tabId, { type: "content:send-result", outcome, source }).catch(() => {});
}

async function runSend(input: SendInput): Promise<SendOutcome> {
  openPanelForSend(input);
  const outcome = await pipeline.send(input);
  tellTab(input.tabId, outcome, input.source);
  return outcome;
}

/** Close `tab` after its own page was pooled, when the setting asks for it. Links to other pages leave the tab alone. */
async function closeTabAfterPool(tab: chrome.tabs.Tab | undefined, pooledUrls: readonly string[]): Promise<void> {
  const settings = await settingsCache.get();
  if (!settings.closeTabAfterPool || tab?.id === undefined || !tab.url || !pooledUrls.includes(tab.url)) return;
  await chrome.tabs.remove(tab.id).catch(() => {});
}

async function poolTab(tab: chrome.tabs.Tab | undefined, url: string): Promise<void> {
  const result = await addToPool([await describeTab(tab, url)]);
  const outcome: SendOutcome = { kind: "pooled", ...result };
  tellTab(tab?.id, outcome, "context-menu");
  await closeTabAfterPool(tab, [url]);
}

/** Send everything in the pool as one job and drop what Cove accepted or already had. */
async function sendPool(): Promise<SendOutcome> {
  const entries = await getPool();
  if (!entries.length) return { kind: "error", message: "The pool is empty." };
  const outcome = await pipeline.send({
    items: entries.map((entry) => ({ url: entry.url, title: entry.title })),
    source: "pool",
  });
  if (outcome.kind === "queued" || outcome.kind === "nothing-queued") {
    // Keep only entries the user still has to deal with: unsupported pages and hard failures.
    const keep = new Set(
      outcome.issues
        .filter((issue) => issue.kind === "failed" || issue.kind === "unsupported")
        .map((issue) => issue.url),
    );
    await removeFromPool(entries.filter((entry) => !keep.has(entry.url)).map((entry) => entry.key));
  }
  broadcast({ kind: "send-result", source: "pool", outcome });
  return outcome;
}

serveRequests({
  send: (payload, sender) =>
    runSend({
      items: payload.items,
      source: payload.source,
      tabId: payload.tabId ?? sender.tab?.id,
      windowId: sender.tab?.windowId,
    }),
  "pool:add": async (payload, sender) => {
    const tab = sender.tab ?? (await tabById(payload.tabId));
    const inputs = await Promise.all(
      payload.items.map(async (item) => ({ ...(await describeTab(tab, item.url)), ...stripEmpty(item) })),
    );
    const result = await addToPool(inputs);
    await closeTabAfterPool(
      tab,
      inputs.map((input) => input.url),
    );
    return result;
  },
  "pool:list": async () => ({ entries: await getPool() }),
  "pool:remove": async ({ keys }) => ({ total: await removeFromPool(keys) }),
  "pool:clear": async () => {
    await clearPool();
    return { total: 0 };
  },
  "pool:send": () => sendPool(),
  "pool:export": async () => ({ saved: await exportPoolAsText() }),
  "content:settings": async () => {
    const settings = await settingsCache.get();
    return {
      inPageButton: settings.inPageButton,
      stylizedButtons: settings.stylizedButtons,
      poolMode: settings.poolMode,
      supportedHosts: await supportedHostsFor(settings),
      coveOrigin: parseHttpUrl(settings.coveUrl)?.origin ?? "",
    };
  },
  "layout:targets": async ({ url }, sender) => {
    const settings = await settingsCache.get();
    if (!settings.stylizedButtons) return { targets: [] };
    const tabUrl = sender.tab?.url ?? "";
    const pageUrl = tabUrl && sameOrigin(url, tabUrl) ? url : tabUrl || url;
    return { targets: await layoutTargetsFor(pageUrl) };
  },
  "page-videos:collect": ({ tabId }) => collectPageVideos(tabId),
  "erome:open-selector": async ({ albumUrl }, sender) => {
    if (!isHttpUrl(albumUrl)) throw new Error("That is not an album address.");
    return { token: openEromeSelector(albumUrl, sender.tab?.windowId) };
  },
  "erome:selector-ready": async ({ token, albumUrl, videos, error }) => ({
    accepted: completeEromeSelector(token, albumUrl, videos, error),
  }),
  "permission:request": async () => {
    const granted = await requestHostPermission();
    if (granted) await syncContentScripts();
    return { granted };
  },
  "permission:check": async () => ({ granted: await hasHostPermission() }),
  "tracked-jobs:list": async () => ({ jobs: await listTrackedJobs() }),
  "panel:open": async ({ tab, windowId }, sender) => {
    openPanel(windowId ?? sender.tab?.windowId, { tab: (tab ?? "queue") as PanelTab });
    return { opened: true };
  },
});

function stripEmpty<T extends Record<string, unknown>>(value: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined && entry !== "") (out as Record<string, unknown>)[key] = entry;
  }
  return out;
}

function bootstrap(): void {
  enablePanel();
  void syncContentScripts();
  void resumeTracking();
  void hostPermission.refresh();
}

chrome.runtime.onInstalled.addListener((details) => {
  ensureContextMenus();
  bootstrap();
  if (details.reason === "install") void chrome.tabs.create({ url: chrome.runtime.getURL("options.html?welcome=1") });
});

chrome.runtime.onStartup.addListener(() => {
  ensureContextMenus();
  bootstrap();
});

bootstrap();

chrome.action.onClicked.addListener((tab) => {
  openPanel(tab.windowId, { tab: "queue" });
  if (!hostPermission.granted) void requestHostPermission();
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "send-pool") {
    if (settingsCache.current?.openPanelOnSend) openPanel(tab?.windowId, { tab: "queue" });
    void sendPool().then((outcome) => tellTab(tab?.id, outcome, "hotkey"));
    return;
  }
  if (!tab?.url || !isHttpUrl(tab.url)) return;
  if (command === "send-page") {
    void runSend({
      items: [{ url: tab.url, title: tab.title }],
      source: "hotkey",
      tabId: tab.id,
      windowId: tab.windowId,
    });
  } else if (command === "pool-page") {
    void poolTab(tab, tab.url);
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const id = info.menuItemId;
  if (id === MENU.openPanel || id === MENU.openPanelAction) {
    openPanel(tab?.windowId, { tab: "queue" });
    if (!hostPermission.granted) void requestHostPermission();
    return;
  }
  const url = id === MENU.sendLink || id === MENU.poolLink ? info.linkUrl : tab?.url;
  if (!url || !isHttpUrl(url)) return;
  const granted = hostPermission.granted ? Promise.resolve(true) : requestHostPermission();
  if (id === MENU.sendLink || id === MENU.sendPage) {
    const input: SendInput = {
      items: [{ url, title: id === MENU.sendPage ? tab?.title : undefined }],
      source: "context-menu",
      tabId: tab?.id,
      windowId: tab?.windowId,
    };
    openPanelForSend(input);
    void granted.then(async () => {
      const outcome = await pipeline.send(input);
      tellTab(input.tabId, outcome, input.source);
    });
  } else if (id === MENU.poolLink || id === MENU.poolPage) {
    void granted.then(() => poolTab(tab, url));
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!changeInfo.url) return;
  chrome.tabs.sendMessage(tabId, { type: "content:url-changed", url: changeInfo.url }).catch(() => {});
});

onSettingsChanged(() => {
  void syncContentScripts();
  void updateBadge();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.pool) {
    const next = changes.pool.newValue;
    notePoolSize(Array.isArray(next) ? next.length : 0);
    void updateBadge();
  }
});

chrome.permissions.onAdded.addListener(() => {
  hostPermission.granted = true;
  void syncContentScripts();
});

chrome.permissions.onRemoved.addListener(() => {
  void hostPermission.refresh().then(() => syncContentScripts());
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === TRACKING_ALARM) void resumeTracking();
});
