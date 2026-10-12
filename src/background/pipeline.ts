/**
 * The one path every download takes, whatever button started it. Handles pool mode, the review
 * step, duplicate protection, matching, batching into a single Cove job, and job tracking.
 */
import { mapLimit } from "../shared/async";
import { CoveApiError, describeCoveError, type CoveClient } from "../shared/cove/client";
import {
  pickQualityId,
  matchEntity,
  rankCandidates,
  YTDLP_VIDEO_ID,
  type EntityPreference,
} from "../shared/cove/match";
import {
  isActiveJob,
  type DownloaderBatchItem,
  type DownloaderEntity,
  type DownloaderMatch,
} from "../shared/cove/types";
import type { SendIssue, SendItem, SendOutcome, SendSource, TrackedJob } from "../shared/models";
import type { Settings } from "../shared/settings";
import { isVideoFileUrl, videoUrlForCove } from "../shared/sites/media-url";
import { isHttpUrl, urlKey } from "../shared/url";

/** In-page buttons follow pool mode; menus and hotkeys have explicit pool variants instead. */
export const POOLABLE_SOURCES: readonly SendSource[] = ["fab", "chip", "layout"];
/** One-click surfaces. These honor "confirm before sending" and "close tab after sending". */
export const QUICK_SOURCES: readonly SendSource[] = ["context-menu", "hotkey", "fab", "chip", "layout"];

export interface SendInput {
  items: SendItem[];
  source: SendSource;
  tabId?: number;
  windowId?: number;
}

export interface PoolInput {
  url: string;
  title?: string;
  favicon?: string;
  thumbnail?: string;
}

export interface PipelineDeps {
  getSettings(): Promise<Settings>;
  clientFor(settings: Settings): CoveClient;
  /** Site-specific media address for the page open in `tabId`, or null to match the page URL. */
  resolveSiteMedia(url: string, tabId: number | undefined): Promise<string | null>;
  reserveKeys(keys: string[]): Promise<string[]>;
  releaseKeys(keys: string[]): Promise<void>;
  trackJob(job: TrackedJob, keys: string[]): Promise<void>;
  addToPool(inputs: PoolInput[]): Promise<{ added: number; duplicates: number; total: number }>;
  describeTab(tabId: number | undefined, url: string): Promise<PoolInput>;
  closeTab(tabId: number): Promise<void>;
  requestReview(item: SendItem, input: SendInput): void;
  onError?(): void;
  now?(): number;
}

type Resolved =
  | { ok: true; key: string; url: string; batchItem: DownloaderBatchItem }
  | { ok: false; key: string; issue: SendIssue };

function uniqueItems(items: readonly SendItem[]): SendItem[] {
  const seen = new Set<string>();
  const out: SendItem[] = [];
  for (const item of items) {
    if (!isHttpUrl(item.url)) continue;
    const key = urlKey(item.url);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/** URL keys of single downloads Cove is running right now, read from their job descriptions. */
async function activeDownloadKeys(client: CoveClient): Promise<Set<string>> {
  try {
    const jobs = await client.listJobs();
    const keys = new Set<string>();
    for (const job of jobs) {
      if (!isActiveJob(job)) continue;
      const match = /^Downloading (https?:\/\/\S+)$/.exec(job.description || "");
      if (match?.[1]) keys.add(urlKey(match[1]));
    }
    return keys;
  } catch {
    return new Set();
  }
}

export function createPipeline(deps: PipelineDeps) {
  const now = deps.now ?? (() => Date.now());

  async function resolveItem(
    client: CoveClient,
    settings: Settings,
    item: SendItem,
    key: string,
    tabId: number | undefined,
  ): Promise<Resolved> {
    const preference: EntityPreference = item.entity ?? settings.defaultEntity;
    const base = {
      label: item.url,
      title: item.title,
      autoApplyMetadata: settings.autoApplyMetadata,
      // Batch items without an existing library entity need Cove to create one, or the item is skipped.
      createEntityIfMissing: true,
    };

    if (item.downloaderId) {
      const entity: DownloaderEntity =
        item.downloaderEntity ??
        (preference !== "auto" ? preference : matchEntity({ downloaderId: item.downloaderId, supportedEntity: "" }));
      return {
        ok: true,
        key,
        url: item.url,
        batchItem: {
          ...base,
          downloaderId: item.downloaderId,
          url: item.url,
          entity,
          qualityId: item.qualityId,
          sourceUrl: item.sourceUrl,
        },
      };
    }

    if (isVideoFileUrl(item.url)) {
      return {
        ok: true,
        key,
        url: item.url,
        batchItem: {
          ...base,
          downloaderId: YTDLP_VIDEO_ID,
          url: videoUrlForCove(item.url, item.sourceUrl ?? ""),
          entity: "Video",
          sourceUrl: item.sourceUrl,
        },
      };
    }

    const media = await deps.resolveSiteMedia(item.url, tabId);
    if (media) {
      return {
        ok: true,
        key,
        url: item.url,
        batchItem: { ...base, downloaderId: YTDLP_VIDEO_ID, url: media, entity: "Video", sourceUrl: item.url },
      };
    }

    let matches: DownloaderMatch[] = [];
    try {
      matches = await client.match(item.url);
    } catch (error) {
      if (error instanceof CoveApiError && (error.isUnreachable || error.isAuthFailure)) throw error;
      matches = [];
    }
    const best = rankCandidates(matches, preference, item.url)[0];
    if (!best) {
      const wanted = preference === "auto" ? "This page" : preference;
      return {
        ok: false,
        key,
        issue: { url: item.url, kind: "unsupported", reason: `${wanted} is not supported by any Cove downloader.` },
      };
    }
    return {
      ok: true,
      key,
      url: item.url,
      batchItem: {
        ...base,
        downloaderId: best.downloaderId,
        url: best.url,
        entity: best.entity,
        qualityId: item.qualityId ?? pickQualityId(best, settings.preferredQuality),
        sourceUrl: item.sourceUrl ?? best.sourceUrl,
      },
    };
  }

  async function finishQuickAction(settings: Settings, input: SendInput): Promise<void> {
    if (!QUICK_SOURCES.includes(input.source) || !settings.closeTabAfterSend || input.tabId === undefined) return;
    await deps.closeTab(input.tabId).catch(() => {});
  }

  async function send(input: SendInput): Promise<SendOutcome> {
    const settings = await deps.getSettings();
    const items = uniqueItems(input.items);
    if (!items.length) return { kind: "error", message: "Nothing to send: that is not an http(s) address." };

    if (settings.poolMode && POOLABLE_SOURCES.includes(input.source)) {
      const inputs = await Promise.all(
        items.map(async (item) => {
          const described = await deps.describeTab(input.tabId, item.url);
          return { ...described, title: item.title || described.title };
        }),
      );
      const result = await deps.addToPool(inputs);
      if (settings.closeTabAfterPool && input.tabId !== undefined) await deps.closeTab(input.tabId).catch(() => {});
      return { kind: "pooled", ...result };
    }

    const single = items[0];
    if (
      QUICK_SOURCES.includes(input.source) &&
      settings.confirmBeforeSend &&
      items.length === 1 &&
      single &&
      !single.downloaderId
    ) {
      deps.requestReview(single, input);
      return { kind: "needs-review", url: single.url };
    }

    const client = deps.clientFor(settings);
    const keyed = items.map((item) => ({ item, key: urlKey(item.url) }));
    const busy = new Set(await deps.reserveKeys(keyed.map((entry) => entry.key)));
    const issues: SendIssue[] = [];
    let pending = keyed.filter(({ item, key }) => {
      if (!busy.has(key)) return true;
      issues.push({ url: item.url, kind: "in-flight", reason: "This URL is already on its way to Cove." });
      return false;
    });
    const reserved = pending.map((entry) => entry.key);

    try {
      const active = await activeDownloadKeys(client);
      pending = pending.filter(({ item, key }) => {
        if (!active.has(key)) return true;
        issues.push({ url: item.url, kind: "duplicate", reason: "Cove is already downloading this URL." });
        return false;
      });

      const resolved = await mapLimit(pending, 4, ({ item, key }) =>
        resolveItem(client, settings, item, key, input.tabId),
      );
      const ready = resolved.filter((entry): entry is Extract<Resolved, { ok: true }> => entry.ok);
      for (const entry of resolved) if (!entry.ok) issues.push(entry.issue);
      const readyKeys = new Set(ready.map((entry) => entry.key));
      await deps.releaseKeys(reserved.filter((key) => !readyKeys.has(key)));
      if (!ready.length) return { kind: "nothing-queued", issues };

      let jobId: string;
      let queued: number;
      const dropped = new Set<string>();

      if (ready.length === 1) {
        const only = ready[0]!;
        try {
          const response = await client.startDownload({
            downloaderId: only.batchItem.downloaderId!,
            url: only.batchItem.url,
            sourceUrl: only.batchItem.sourceUrl,
            entity: only.batchItem.entity,
            qualityId: only.batchItem.qualityId,
            autoApplyMetadata: settings.autoApplyMetadata,
          });
          jobId = response.jobId;
          queued = 1;
        } catch (error) {
          if (error instanceof CoveApiError && error.isDuplicate) {
            issues.push({ url: only.url, kind: "duplicate", reason: error.message });
            await deps.releaseKeys([only.key]);
            return { kind: "nothing-queued", issues };
          }
          throw error;
        }
      } else {
        const response = await client.startBatch({
          items: ready.map((entry) => entry.batchItem),
          // Tag, performer, and studio creation is left unspecified so Cove applies its Scraping defaults.
          followUp: { autoApplyMetadata: settings.autoApplyMetadata },
          preflightBeforeQueue: true,
        });
        for (const issue of response.issues ?? []) {
          const entry = ready.find(
            (candidate) => candidate.url === issue.label || candidate.batchItem.url === issue.label,
          );
          const url = entry?.url ?? issue.label;
          if (entry) dropped.add(entry.key);
          issues.push({ url, kind: issue.kind === "skipped" ? "duplicate" : "failed", reason: issue.reason });
        }
        await deps.releaseKeys([...dropped]);
        queued = response.queuedCount;
        if (!response.jobId || !queued) {
          await deps.releaseKeys(ready.map((entry) => entry.key));
          return { kind: "nothing-queued", issues };
        }
        jobId = response.jobId;
      }

      const tracked = ready.filter((entry) => !dropped.has(entry.key));
      const entities = new Set(tracked.map((entry) => entry.batchItem.entity));
      await deps.trackJob(
        {
          jobId,
          startedAt: now(),
          urls: tracked.map((entry) => entry.url),
          entity: entities.size === 1 ? [...entities][0]! : "mixed",
          source: input.source,
        },
        tracked.map((entry) => entry.key),
      );
      await finishQuickAction(settings, input);
      return { kind: "queued", jobIds: [jobId], queued, issues };
    } catch (error) {
      await deps.releaseKeys(reserved);
      deps.onError?.();
      return { kind: "error", message: describeCoveError(error, settings.coveUrl) };
    }
  }

  return { send };
}

export type Pipeline = ReturnType<typeof createPipeline>;
