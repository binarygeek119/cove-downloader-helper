import { describe, expect, it, vi } from "vitest";
import { CoveApiError, type CoveClient } from "@/shared/cove/client";
import { YTDLP_VIDEO_ID } from "@/shared/cove/match";
import type { DownloaderMatch, JobInfo } from "@/shared/cove/types";
import { DEFAULT_SETTINGS, type Settings } from "@/shared/settings";
import { urlKey } from "@/shared/url";
import { createPipeline, type PipelineDeps } from "./pipeline";

const PAGE_A = "https://example.com/watch?v=a";
const PAGE_B = "https://example.com/watch?v=b";

function matchFor(url: string): DownloaderMatch {
  return {
    downloaderId: "cove.community.downloaders.site/video",
    downloaderName: "Site",
    supportedEntity: "Video",
    normalizedUrl: url,
    qualityOptions: [
      { id: "best", label: "Best" },
      { id: "720p", label: "720p" },
    ],
  };
}

function fakeClient(overrides: Partial<CoveClient> = {}): CoveClient {
  return {
    baseUrl: "http://localhost:5073",
    status: vi.fn(async () => ({ version: "1.0.0", authEnabled: false })),
    listDownloaders: vi.fn(async () => []),
    match: vi.fn(async (url: string) => [matchFor(url)]),
    startDownload: vi.fn(async () => ({ jobId: "job-1" })),
    startBatch: vi.fn(async (request) => ({ jobId: "batch-1", queuedCount: request.items.length, issues: [] })),
    listJobs: vi.fn(async (): Promise<JobInfo[]> => []),
    listJobHistory: vi.fn(async () => []),
    getJob: vi.fn(async () => ({}) as JobInfo),
    cancelJob: vi.fn(async () => undefined),
    ...overrides,
  };
}

function harness(settings: Partial<Settings> = {}, client = fakeClient()) {
  const reserved = new Set<string>();
  const deps: PipelineDeps = {
    getSettings: async () => ({ ...DEFAULT_SETTINGS, ...settings }),
    clientFor: () => client,
    resolveSiteMedia: vi.fn(async () => null),
    reserveKeys: vi.fn(async (keys: string[]) => {
      const busy = keys.filter((key) => reserved.has(key));
      for (const key of keys) reserved.add(key);
      return busy;
    }),
    releaseKeys: vi.fn(async (keys: string[]) => {
      for (const key of keys) reserved.delete(key);
    }),
    trackJob: vi.fn(async () => undefined),
    addToPool: vi.fn(async (inputs) => ({ added: inputs.length, duplicates: 0, total: inputs.length })),
    describeTab: vi.fn(async (_tabId, url) => ({ url, title: "Tab title" })),
    closeTab: vi.fn(async () => undefined),
    requestReview: vi.fn(),
    onError: vi.fn(),
    now: () => 1700000000000,
  };
  return { pipeline: createPipeline(deps), deps, client, reserved };
}

describe("send pipeline", () => {
  it("sends one item through the single download endpoint with the best match and default quality", async () => {
    const { pipeline, deps, client } = harness();
    const outcome = await pipeline.send({ items: [{ url: PAGE_A, title: "A" }], source: "fab", tabId: 7 });
    expect(outcome).toEqual({ kind: "queued", jobIds: ["job-1"], queued: 1, issues: [] });
    expect(client.startDownload).toHaveBeenCalledWith({
      downloaderId: "cove.community.downloaders.site/video",
      url: PAGE_A,
      sourceUrl: undefined,
      entity: "Video",
      qualityId: "best",
      autoApplyMetadata: true,
    });
    expect(client.startBatch).not.toHaveBeenCalled();
    expect(deps.trackJob).toHaveBeenCalledWith(
      { jobId: "job-1", startedAt: 1700000000000, urls: [PAGE_A], entity: "Video", source: "fab" },
      [urlKey(PAGE_A)],
    );
    expect(deps.closeTab).not.toHaveBeenCalled();
  });

  it("caps the quality at the preferred resolution when the match offers resolutions", async () => {
    const client = fakeClient({
      match: vi.fn(async (url: string) => [
        {
          ...matchFor(url),
          qualityOptions: [
            { id: "best", label: "Best available", height: 2160 },
            { id: "max-height-2160", label: "2160p", height: 2160 },
            { id: "max-height-1080", label: "1080p", height: 1080 },
            { id: "max-height-480", label: "480p", height: 480 },
          ],
        },
      ]),
    });
    const { pipeline } = harness({ preferredQuality: "1080p" }, client);
    await pipeline.send({ items: [{ url: PAGE_A }], source: "fab" });
    expect(vi.mocked(client.startDownload).mock.calls[0]![0].qualityId).toBe("max-height-1080");
    // An explicit choice from the panel always wins.
    await pipeline.send({ items: [{ url: PAGE_B, qualityId: "max-height-480" }], source: "panel" });
    expect(vi.mocked(client.startDownload).mock.calls[1]![0].qualityId).toBe("max-height-480");
  });

  it("sends several items as one batch job labelled by URL", async () => {
    const { pipeline, client } = harness();
    const outcome = await pipeline.send({ items: [{ url: PAGE_A }, { url: PAGE_B }], source: "videos" });
    expect(outcome).toMatchObject({ kind: "queued", jobIds: ["batch-1"], queued: 2 });
    expect(client.startDownload).not.toHaveBeenCalled();
    expect(client.startBatch).toHaveBeenCalledTimes(1);
    const request = vi.mocked(client.startBatch).mock.calls[0]![0];
    expect(request.preflightBeforeQueue).toBe(true);
    expect(request.followUp).toEqual({ autoApplyMetadata: true });
    expect(request.items.map((item) => item.label)).toEqual([PAGE_A, PAGE_B]);
    expect(request.items.every((item) => item.downloaderId && item.entity === "Video")).toBe(true);
    expect(request.items.every((item) => item.createEntityIfMissing === true)).toBe(true);
  });

  it("maps batch preflight issues back to URLs and releases their reservations", async () => {
    const client = fakeClient({
      startBatch: vi.fn(async () => ({
        jobId: "batch-1",
        queuedCount: 1,
        issues: [{ kind: "skipped" as const, label: PAGE_B, reason: "This URL is already downloaded for Video 3." }],
      })),
    });
    const { pipeline, deps, reserved } = harness({}, client);
    const outcome = await pipeline.send({ items: [{ url: PAGE_A }, { url: PAGE_B }], source: "pool" });
    expect(outcome).toEqual({
      kind: "queued",
      jobIds: ["batch-1"],
      queued: 1,
      issues: [{ url: PAGE_B, kind: "duplicate", reason: "This URL is already downloaded for Video 3." }],
    });
    expect(reserved.has(urlKey(PAGE_B))).toBe(false);
    expect(deps.trackJob).toHaveBeenCalledWith(expect.objectContaining({ urls: [PAGE_A] }), [urlKey(PAGE_A)]);
  });

  it("dedupes within a request and against sends still in flight", async () => {
    const { pipeline, client, reserved } = harness();
    reserved.add(urlKey(PAGE_B));
    const outcome = await pipeline.send({
      items: [{ url: PAGE_A }, { url: "http://www.example.com/watch/?v=a&utm_source=x" }, { url: PAGE_B }],
      source: "panel",
    });
    expect(outcome).toMatchObject({ kind: "queued", queued: 1, issues: [{ url: PAGE_B, kind: "in-flight" }] });
    expect(client.startDownload).toHaveBeenCalledTimes(1);
  });

  it("skips a URL Cove is already downloading", async () => {
    const client = fakeClient({
      listJobs: vi.fn(async () => [
        {
          id: "j",
          type: "download",
          description: `Downloading ${PAGE_A}`,
          status: "running",
          progress: 0.2,
          startedAt: "",
        } as JobInfo,
      ]),
    });
    const { pipeline } = harness({}, client);
    const outcome = await pipeline.send({ items: [{ url: PAGE_A }], source: "fab" });
    expect(outcome).toEqual({
      kind: "nothing-queued",
      issues: [{ url: PAGE_A, kind: "duplicate", reason: "Cove is already downloading this URL." }],
    });
    expect(client.startDownload).not.toHaveBeenCalled();
  });

  it("reports a 409 from Cove as a duplicate and frees the reservation", async () => {
    const client = fakeClient({
      startDownload: vi.fn(async () => {
        throw new CoveApiError("This URL is already downloaded for Video 9.", 409, null);
      }),
    });
    const { pipeline, reserved } = harness({}, client);
    const outcome = await pipeline.send({ items: [{ url: PAGE_A }], source: "layout" });
    expect(outcome).toMatchObject({ kind: "nothing-queued", issues: [{ kind: "duplicate", url: PAGE_A }] });
    expect(reserved.size).toBe(0);
  });

  it("pools instead of sending when pool mode is on and the click came from an in-page button", async () => {
    const { pipeline, deps, client } = harness({ poolMode: true, closeTabAfterPool: true });
    const outcome = await pipeline.send({ items: [{ url: PAGE_A }], source: "fab", tabId: 3 });
    expect(outcome).toEqual({ kind: "pooled", added: 1, duplicates: 0, total: 1 });
    expect(deps.addToPool).toHaveBeenCalledWith([{ url: PAGE_A, title: "Tab title" }]);
    expect(deps.closeTab).toHaveBeenCalledWith(3);
    expect(client.match).not.toHaveBeenCalled();
  });

  it("still sends from the context menu in pool mode, because the menu has its own pool item", async () => {
    const { pipeline, deps } = harness({ poolMode: true });
    const outcome = await pipeline.send({ items: [{ url: PAGE_A }], source: "context-menu" });
    expect(outcome.kind).toBe("queued");
    expect(deps.addToPool).not.toHaveBeenCalled();
  });

  it("asks for review instead of sending when confirmation is on", async () => {
    const { pipeline, deps, client } = harness({ confirmBeforeSend: true });
    const outcome = await pipeline.send({ items: [{ url: PAGE_A }], source: "hotkey", tabId: 1, windowId: 2 });
    expect(outcome).toEqual({ kind: "needs-review", url: PAGE_A });
    expect(deps.requestReview).toHaveBeenCalledWith(
      { url: PAGE_A },
      expect.objectContaining({ tabId: 1, windowId: 2 }),
    );
    expect(client.match).not.toHaveBeenCalled();
    // The panel already picked a downloader: no second confirmation.
    const direct = await pipeline.send({ items: [{ url: PAGE_A, downloaderId: YTDLP_VIDEO_ID }], source: "panel" });
    expect(direct.kind).toBe("queued");
  });

  it("wraps direct video files for yt-dlp without asking Cove to match", async () => {
    const { pipeline, client } = harness();
    const file = "https://v.example.com/clip_1080p.mp4";
    await pipeline.send({ items: [{ url: file, sourceUrl: "https://www.erome.com/a/abc" }], source: "videos" });
    expect(client.match).not.toHaveBeenCalled();
    const request = vi.mocked(client.startDownload).mock.calls[0]![0];
    expect(request.downloaderId).toBe(YTDLP_VIDEO_ID);
    expect(request.url.startsWith("data:application/vnd.apple.mpegurl;filename=/clip_1080p.mp4;")).toBe(true);
    expect(request.sourceUrl).toBe("https://www.erome.com/a/abc");
  });

  it("uses the site media hook when it returns a stream", async () => {
    const { pipeline, deps, client } = harness();
    vi.mocked(deps.resolveSiteMedia).mockResolvedValueOnce("https://cdn.example/master.m3u8#ref");
    await pipeline.send({ items: [{ url: PAGE_A }], source: "layout", tabId: 4 });
    expect(deps.resolveSiteMedia).toHaveBeenCalledWith(PAGE_A, 4);
    expect(vi.mocked(client.startDownload).mock.calls[0]![0]).toMatchObject({
      downloaderId: YTDLP_VIDEO_ID,
      url: "https://cdn.example/master.m3u8#ref",
      sourceUrl: PAGE_A,
    });
  });

  it("reports unsupported pages per item and still sends the rest", async () => {
    const client = fakeClient({
      match: vi.fn(async (url: string) => (url === PAGE_B ? [] : [matchFor(url)])),
    });
    const { pipeline } = harness({}, client);
    const outcome = await pipeline.send({
      items: [
        { url: PAGE_A, entity: "Image" },
        { url: PAGE_B, entity: "Image" },
      ],
      source: "panel",
    });
    expect(outcome).toEqual({
      kind: "nothing-queued",
      issues: [
        { url: PAGE_A, kind: "unsupported", reason: "Image is not supported by any Cove downloader." },
        { url: PAGE_B, kind: "unsupported", reason: "Image is not supported by any Cove downloader." },
      ],
    });
  });

  it("returns an error and releases reservations when Cove is unreachable", async () => {
    const client = fakeClient({
      match: vi.fn(async () => {
        throw new CoveApiError("Could not reach Cove at http://localhost:5073.", 0, null);
      }),
    });
    const { pipeline, deps, reserved } = harness({}, client);
    const outcome = await pipeline.send({ items: [{ url: PAGE_A }], source: "fab" });
    expect(outcome).toEqual({ kind: "error", message: "Could not reach Cove at http://localhost:5073." });
    expect(reserved.size).toBe(0);
    expect(deps.onError).toHaveBeenCalled();
  });

  it("rejects requests without an http address", async () => {
    const { pipeline } = harness();
    expect(await pipeline.send({ items: [{ url: "chrome://extensions" }], source: "hotkey" })).toMatchObject({
      kind: "error",
    });
  });
});
