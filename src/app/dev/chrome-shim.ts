/**
 * A browser-only stand-in for the Chrome extension APIs, so the panel can be developed in a normal
 * tab with `npm run dev:ui`. Serves canned Cove responses. Never shipped: only dev/index.html loads it.
 */
import type { JobInfo } from "@/shared/cove/types";
import type { MessageMap, RequestEnvelope } from "@/shared/messaging";
import type { PoolEntry } from "@/shared/models";

type Listener = (...args: unknown[]) => void;

function event() {
  const listeners = new Set<Listener>();
  return {
    addListener: (listener: Listener) => listeners.add(listener),
    removeListener: (listener: Listener) => listeners.delete(listener),
    emit: (...args: unknown[]) => listeners.forEach((listener) => listener(...args)),
  };
}

const storageChanged = event();

function storageArea(name: string) {
  const data = new Map<string, unknown>();
  const emit = (changes: Record<string, unknown>) => storageChanged.emit(changes, name);
  return {
    async get(keys?: string | string[] | null) {
      const list = keys == null ? [...data.keys()] : typeof keys === "string" ? [keys] : keys;
      return Object.fromEntries(list.filter((key) => data.has(key)).map((key) => [key, data.get(key)]));
    },
    async set(values: Record<string, unknown>) {
      const changes: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(values)) {
        changes[key] = { oldValue: data.get(key), newValue: value };
        data.set(key, value);
      }
      emit(changes);
    },
    async remove(keys: string | string[]) {
      for (const key of typeof keys === "string" ? [keys] : keys) data.delete(key);
    },
  };
}

const pool: PoolEntry[] = [
  {
    key: "example.com/watch?v=1",
    url: "https://example.com/watch?v=1",
    title: "A pooled page with a fairly long title that should truncate nicely",
    favicon: "",
    thumbnail: "",
    addedAt: Date.now() - 60_000,
  },
  {
    key: "example.com/watch?v=2",
    url: "https://example.com/watch?v=2",
    title: "Second pooled page",
    favicon: "",
    thumbnail: "",
    addedAt: Date.now(),
  },
];

const jobs: JobInfo[] = [
  {
    id: "a",
    type: "download",
    description: "Downloading https://example.com/watch?v=9",
    status: "running",
    progress: 0.42,
    subTask: "Downloading 1080p",
    startedAt: new Date().toISOString(),
  },
  {
    id: "b",
    type: "download-batch",
    description: "Downloading 3 items",
    status: "pending",
    progress: 0,
    startedAt: new Date().toISOString(),
    unitsTotal: 3,
    unitsCompleted: 0,
  },
];
const history: JobInfo[] = [
  {
    id: "c",
    type: "download",
    description: "Downloading https://example.com/watch?v=5",
    status: "completed",
    progress: 1,
    subTask: "Imported into video 1203",
    startedAt: new Date(Date.now() - 600_000).toISOString(),
    completedAt: new Date(Date.now() - 500_000).toISOString(),
  },
  {
    id: "d",
    type: "download",
    description: "Downloading https://example.com/watch?v=6",
    status: "failed",
    progress: 0.3,
    error: "yt-dlp: Unsupported URL",
    startedAt: new Date(Date.now() - 900_000).toISOString(),
    completedAt: new Date(Date.now() - 800_000).toISOString(),
  },
];

const responses: { [K in keyof MessageMap]: (payload: MessageMap[K]["request"]) => MessageMap[K]["response"] } = {
  send: ({ items }) => ({ kind: "queued", jobIds: ["dev"], queued: items.length, issues: [] }),
  "pool:add": ({ items }) => ({ added: items.length, duplicates: 0, total: pool.length + items.length }),
  "pool:list": () => ({ entries: pool }),
  "pool:remove": ({ keys }) => {
    for (const key of keys) {
      const index = pool.findIndex((entry) => entry.key === key);
      if (index >= 0) pool.splice(index, 1);
    }
    return { total: pool.length };
  },
  "pool:clear": () => {
    pool.length = 0;
    return { total: 0 };
  },
  "pool:send": () => ({ kind: "queued", jobIds: ["dev"], queued: pool.length, issues: [] }),
  "pool:export": () => ({ saved: true }),
  "content:settings": () => ({
    inPageButton: "supported",
    stylizedButtons: true,
    poolMode: false,
    supportedHosts: [],
    coveOrigin: "",
  }),
  "layout:targets": () => ({ targets: [] }),
  "page-videos:collect": () => ({
    pageUrl: "https://example.com/album",
    videos: [
      { url: "https://cdn.example/one_1080p.mp4", title: "First clip", thumbnail: "", duration: "1:23" },
      { url: "https://cdn.example/two.mp4", title: "Second clip", thumbnail: "", duration: "0:45" },
      { url: "https://cdn.example/three.mp4", title: "Third clip", thumbnail: "", duration: "12:03" },
    ],
  }),
  "erome:open-selector": () => ({ token: 1 }),
  "erome:selector-ready": () => ({ accepted: true }),
  "permission:request": () => ({ granted: true }),
  "permission:check": () => ({ granted: true }),
  "tracked-jobs:list": () => ({
    jobs: [
      { jobId: "a", startedAt: Date.now(), urls: ["https://example.com/watch?v=9"], entity: "Video", source: "panel" },
    ],
  }),
  "panel:open": () => ({ opened: true }),
};

const chromeShim = {
  runtime: {
    id: "dev",
    getURL: (file: string) => `/../${file}`.replace("/../", "/dev-assets/"),
    getManifest: () => ({ version: "2.0.0-dev", name: "Cove Downloader Helper" }),
    sendMessage: async (message: RequestEnvelope) => {
      const handler = responses[message.type] as ((payload: unknown) => unknown) | undefined;
      await new Promise((resolve) => setTimeout(resolve, 150));
      return handler
        ? { ok: true, data: handler(message.payload) }
        : { ok: false, error: `No dev response for ${message.type}` };
    },
    onMessage: event(),
  },
  storage: {
    sync: storageArea("sync"),
    local: storageArea("local"),
    session: storageArea("session"),
    onChanged: storageChanged,
  },
  tabs: {
    query: async () => [
      {
        id: 1,
        windowId: 1,
        url: "https://www.pornhub.com/view_video.php?viewkey=abc",
        title: "Example video page title",
      },
    ],
    create: async ({ url }: { url: string }) => window.open(url, "_blank"),
    onActivated: event(),
    onUpdated: event(),
  },
  permissions: { contains: async () => true, request: async () => true, onAdded: event(), onRemoved: event() },
  commands: {
    getAll: async () => [
      { name: "send-page", description: "Send the current page to Cove", shortcut: "Alt+Shift+C" },
      { name: "pool-page", description: "Add the current page to the Cove pool", shortcut: "" },
    ],
  },
};

(globalThis as unknown as { chrome: unknown }).chrome = chromeShim;

// Canned Cove API. The SignalR negotiate call fails on purpose so the panel exercises polling.
const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  if (url.includes("/api/system/status")) return json({ version: "1.4.0-dev", authEnabled: false });
  if (url.includes("/api/system/downloaders/match")) {
    const { url: page } = JSON.parse(String(init?.body ?? "{}")) as { url: string };
    return json([
      {
        downloaderId: "cove.community.downloaders.ytdlp/video",
        downloaderName: "yt-dlp Video",
        supportedEntity: "Video",
        normalizedUrl: page,
        qualityOptions: [
          { id: "best", label: "Best available" },
          { id: "1080p", label: "1080p" },
          { id: "720p", label: "720p" },
        ],
      },
      {
        downloaderId: "cove.community.downloaders.ytdlp/audio",
        downloaderName: "yt-dlp Audio",
        supportedEntity: "Audio",
        normalizedUrl: page,
        qualityOptions: [],
      },
    ]);
  }
  if (url.includes("/api/system/downloaders"))
    return json([{ id: "x", name: "yt-dlp", supportedEntity: "Video", supportedUrlPatterns: [], capabilities: [] }]);
  if (url.includes("/api/jobs/history")) return json(history);
  if (url.includes("/api/jobs")) return json(jobs);
  if (url.includes("/hubs/")) return new Response("", { status: 404 });
  return realFetch(input, init);
};
