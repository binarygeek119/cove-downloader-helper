/** The subset of Cove's API contract this extension uses. Mirrors ui/src/api/types.ts in the Cove repo. */

export type DownloaderEntity = "Video" | "Audio" | "Image" | "Gallery" | "Text";

export type JobStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface JobInfo {
  id: string;
  type: string;
  description: string;
  status: JobStatus;
  progress: number;
  subTask?: string;
  startedAt: string;
  completedAt?: string;
  error?: string;
  unitsTotal?: number;
  unitsCompleted?: number;
  unitsSucceeded?: number;
  unitsFailed?: number;
  unitsSkipped?: number;
}

export interface SystemStatus {
  version: string;
  authEnabled: boolean;
  migrationRequired?: boolean;
}

export interface DownloaderDescriptor {
  id: string;
  name: string;
  supportedEntity: string;
  supportedUrlPatterns: string[];
  capabilities: string[];
}

export interface DownloaderQualityOption {
  id: string;
  label: string;
  description?: string;
  width?: number;
  height?: number;
}

export interface DownloaderMatch {
  downloaderId: string;
  downloaderName: string;
  supportedEntity: string;
  normalizedUrl: string;
  label?: string | null;
  qualityOptions: DownloaderQualityOption[];
  sourceUrl?: string | null;
}

export interface DownloaderStartRequest {
  downloaderId: string;
  url: string;
  sourceUrl?: string;
  entity: DownloaderEntity;
  qualityId?: string;
  autoApplyMetadata: boolean;
  allowDuplicateDownload?: boolean;
}

export interface DownloaderBatchItem {
  downloaderId?: string;
  url: string;
  sourceUrl?: string;
  entity: DownloaderEntity;
  qualityId?: string;
  label?: string;
  title?: string;
  /** Create the library entity for video, image, and gallery items that have no entityId. */
  createEntityIfMissing?: boolean;
  autoApplyMetadata?: boolean;
}

export interface DownloaderBatchFollowUp {
  scrapeVideos?: boolean;
  autoApplyMetadata?: boolean;
  allowDuplicateDownloads?: boolean;
  createMissingTags?: boolean;
  createMissingPerformers?: boolean;
  createMissingStudio?: boolean;
  markOrganized?: boolean;
}

export interface DownloaderBatchStartRequest {
  items: DownloaderBatchItem[];
  followUp?: DownloaderBatchFollowUp;
  preflightBeforeQueue?: boolean;
}

export interface DownloaderBatchIssue {
  kind: "skipped" | "failed";
  label: string;
  reason: string;
}

export interface DownloaderBatchStartResponse {
  jobId: string | null;
  queuedCount: number;
  issues?: DownloaderBatchIssue[];
}

export function isActiveJob(job: Pick<JobInfo, "status">): boolean {
  return job.status === "pending" || job.status === "running";
}
