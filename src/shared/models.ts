/** Domain types that cross the boundary between the service worker, content scripts, and the panel. */
import type { EntityPreference } from "./cove/match";
import type { DownloaderBatchIssue, DownloaderEntity } from "./cove/types";
import type { InPageButtonMode } from "./settings";

export type PanelTab = "download" | "queue" | "pool" | "settings";

/** Where a send started. Drives feedback and the close-tab behavior. */
export type SendSource = "context-menu" | "hotkey" | "fab" | "chip" | "layout" | "panel" | "videos" | "pool" | "erome";

export interface SendItem {
  url: string;
  /** Override the ranking for this item. Omitted means the saved default. */
  entity?: EntityPreference;
  /** Use this downloader and skip matching. Set when the panel already chose a match. */
  downloaderId?: string;
  /** The entity that downloader produces. Only meaningful with `downloaderId`. */
  downloaderEntity?: DownloaderEntity;
  qualityId?: string;
  /** The page the media came from, for the referer and the Cove source link. */
  sourceUrl?: string;
  title?: string;
}

export interface SendIssue {
  url: string;
  reason: string;
  kind: "duplicate" | "in-flight" | "unsupported" | "failed";
}

export type SendOutcome =
  | { kind: "queued"; jobIds: string[]; queued: number; issues: SendIssue[] }
  | { kind: "nothing-queued"; issues: SendIssue[] }
  | { kind: "pooled"; added: number; duplicates: number; total: number }
  | { kind: "needs-review"; url: string }
  | { kind: "error"; message: string };

export interface PoolEntry {
  key: string;
  url: string;
  title: string;
  favicon: string;
  thumbnail: string;
  addedAt: number;
}

export interface PageVideo {
  url: string;
  title: string;
  thumbnail: string;
  duration: string;
}

export interface PageVideosResult {
  pageUrl: string;
  videos: PageVideo[];
  unchanged?: boolean;
}

/** The slice of settings a content script needs, plus the live host list from Cove. */
export interface ContentSettings {
  inPageButton: InPageButtonMode;
  stylizedButtons: boolean;
  poolMode: boolean;
  supportedHosts: string[];
  coveOrigin: string;
}

export interface EromeSelectorState {
  token: number;
  albumUrl: string;
  loading: boolean;
  videos: PageVideo[];
  error?: string;
}

/** A job this extension started, tracked for the badge and completion toasts. */
export interface TrackedJob {
  jobId: string;
  startedAt: number;
  urls: string[];
  entity: DownloaderEntity | "mixed";
  source: SendSource;
}

/** What a tracked job reported when it ended. */
export interface JobFinished {
  job: TrackedJob;
  status: "completed" | "failed" | "cancelled";
  /** Cove's closing message, such as "Downloaded 3 of 5 items. Skipped 2." */
  message: string;
  /** Parsed from the message for batch jobs; null for single downloads. */
  succeeded: number | null;
  total: number | null;
  /** True when every URL of a pool batch failed and was returned to the pool. */
  restoredToPool: boolean;
}

export function issuesFromBatch(
  issues: readonly DownloaderBatchIssue[] | undefined,
  urls: readonly string[],
): SendIssue[] {
  return (issues ?? []).map((issue) => ({
    url: urls.find((url) => issue.label.includes(url)) ?? issue.label,
    reason: issue.reason,
    kind: issue.kind === "skipped" ? "duplicate" : "failed",
  }));
}
