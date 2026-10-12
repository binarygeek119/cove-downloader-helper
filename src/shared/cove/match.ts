/** Pure ranking of downloader matches. Nothing here touches Chrome or the network. */
import { siteMediaKind } from "../sites/supported";
import type { DownloaderEntity, DownloaderMatch, DownloaderQualityOption } from "./types";

export type EntityPreference = "auto" | "Video" | "Audio" | "Image" | "Text";

export const ENTITY_PREFERENCES: readonly EntityPreference[] = ["auto", "Video", "Audio", "Image", "Text"];

export const YTDLP_VIDEO_ID = "cove.community.downloaders.ytdlp/video";
export const YTDLP_AUDIO_ID = "cove.community.downloaders.ytdlp/audio";
export const TEXT_DOWNLOADER_ID = "cove.community.downloaders.common-text/literotica";

/** A match normalized for ranking and for building a download request. */
export interface Candidate {
  downloaderId: string;
  downloaderName: string;
  entity: DownloaderEntity;
  url: string;
  sourceUrl?: string;
  label: string;
  qualityOptions: DownloaderQualityOption[];
  /** True when no downloader matched and yt-dlp or the text downloader is offered anyway. */
  isFallback: boolean;
}

export function isYtDlpId(downloaderId: string): boolean {
  return downloaderId.startsWith("cove.community.downloaders.ytdlp/");
}

export function isEntityPreference(value: unknown): value is EntityPreference {
  return typeof value === "string" && (ENTITY_PREFERENCES as readonly string[]).includes(value);
}

const ENTITIES: readonly DownloaderEntity[] = ["Video", "Audio", "Image", "Gallery", "Text"];

/** The downloader id suffix is more reliable than `supportedEntity`, which some downloaders leave generic. */
export function matchEntity(match: Pick<DownloaderMatch, "downloaderId" | "supportedEntity">): DownloaderEntity {
  const id = match.downloaderId || "";
  if (/\/(video|divert)$/i.test(id)) return "Video";
  if (/\/audio$/i.test(id)) return "Audio";
  if (/\/image$/i.test(id)) return "Image";
  if (/\/gallery$/i.test(id)) return "Gallery";
  if (/common-text|literotica/i.test(id)) return "Text";
  const raw = String(match.supportedEntity || "");
  const normalized = (raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase()) as DownloaderEntity;
  return ENTITIES.includes(normalized) ? normalized : "Video";
}

export function toCandidate(match: DownloaderMatch): Candidate {
  return {
    downloaderId: match.downloaderId,
    downloaderName: match.downloaderName || match.downloaderId,
    entity: matchEntity(match),
    url: match.normalizedUrl,
    sourceUrl: match.sourceUrl || undefined,
    label: match.label || "",
    qualityOptions: Array.isArray(match.qualityOptions) ? match.qualityOptions : [],
    isFallback: false,
  };
}

const BEST_QUALITY: DownloaderQualityOption[] = [{ id: "best", label: "Best available" }];

export function fallbackCandidate(url: string, entity: "Video" | "Audio" | "Text"): Candidate {
  if (entity === "Text") {
    return {
      downloaderId: TEXT_DOWNLOADER_ID,
      downloaderName: "Common Text",
      entity,
      url,
      label: "Text fallback",
      qualityOptions: [],
      isFallback: true,
    };
  }
  return {
    downloaderId: entity === "Audio" ? YTDLP_AUDIO_ID : YTDLP_VIDEO_ID,
    downloaderName: entity === "Audio" ? "yt-dlp Audio" : "yt-dlp Video",
    entity,
    url,
    label: "yt-dlp fallback",
    qualityOptions: BEST_QUALITY,
    isFallback: true,
  };
}

/** `auto` on a story or audio site means that media kind. Elsewhere it stays `auto`. */
export function effectivePreference(preference: EntityPreference, url: string): EntityPreference {
  if (preference !== "auto") return preference;
  const kind = siteMediaKind(url);
  if (kind === "text") return "Text";
  if (kind === "audio") return "Audio";
  return "auto";
}

const ENTITY_PRIORITY: Record<DownloaderEntity, number> = { Video: 4, Image: 3, Gallery: 3, Audio: 2, Text: 1 };

function compareCandidates(a: Candidate, b: Candidate): number {
  const byEntity = ENTITY_PRIORITY[b.entity] - ENTITY_PRIORITY[a.entity];
  if (byEntity) return byEntity;
  // A downloader written for the site beats the generic yt-dlp one.
  const bySpecialization = Number(isYtDlpId(a.downloaderId)) - Number(isYtDlpId(b.downloaderId));
  if (bySpecialization) return bySpecialization;
  return a.downloaderName.localeCompare(b.downloaderName);
}

/**
 * Candidates ordered best first for `preference`. A specific preference keeps only matches of that
 * entity and falls back to yt-dlp or the text downloader when none matched. `auto` prefers video,
 * then images, then audio, and offers text only when nothing else matched.
 */
export function rankCandidates(
  matches: readonly DownloaderMatch[],
  preference: EntityPreference,
  url: string,
): Candidate[] {
  const wanted = effectivePreference(preference, url);
  const candidates = matches.map(toCandidate);

  if (wanted !== "auto") {
    const aligned = candidates.filter((candidate) => candidate.entity === wanted).sort(compareCandidates);
    if (aligned.length) return aligned;
    return wanted === "Image" ? [] : [fallbackCandidate(url, wanted)];
  }

  const nonText = candidates.filter((candidate) => candidate.entity !== "Text");
  const pool = nonText.length ? nonText : candidates;
  if (!pool.length) return [fallbackCandidate(url, "Video")];
  return [...pool].sort(compareCandidates);
}

export function defaultQualityId(candidate: Pick<Candidate, "qualityOptions">): string | undefined {
  const options = candidate.qualityOptions;
  if (!options.length) return undefined;
  return (options.find((option) => option.id === "best") ?? options[0])?.id;
}

/** Highest resolution to ask for. `best` leaves the choice to the downloader. */
export type QualityPreference = "best" | "1080p" | "1440p" | "2160p";

export const QUALITY_PREFERENCES: readonly QualityPreference[] = ["best", "1080p", "1440p", "2160p"];

export function isQualityPreference(value: unknown): value is QualityPreference {
  return typeof value === "string" && (QUALITY_PREFERENCES as readonly string[]).includes(value);
}

export function qualityCapHeight(preference: QualityPreference): number | null {
  const match = /^(\d+)p$/.exec(preference);
  return match ? Number(match[1]) : null;
}

/** Frame height of a quality option: from the downloader when it says, else parsed from the id or label. */
export function optionHeight(option: DownloaderQualityOption): number | null {
  if (typeof option.height === "number" && option.height > 0) return option.height;
  const fromId = /^max-height-(\d+)$/.exec(option.id);
  if (fromId) return Number(fromId[1]);
  const fromLabel = /^(\d+)p$/.exec(option.label);
  return fromLabel ? Number(fromLabel[1]) : null;
}

/**
 * The quality option to request under `preference`: the largest resolution at or below the cap.
 * When every listed resolution already fits under the cap, `best` is equivalent and preferred.
 * When nothing fits, the smallest option is used rather than exceeding the cap.
 */
export function pickQualityId(
  candidate: Pick<Candidate, "qualityOptions">,
  preference: QualityPreference,
): string | undefined {
  const cap = qualityCapHeight(preference);
  const options = candidate.qualityOptions;
  if (cap === null || !options.length) return defaultQualityId(candidate);
  const sized = options
    .map((option) => ({ option, height: optionHeight(option) }))
    .filter(
      (entry): entry is { option: DownloaderQualityOption; height: number } =>
        entry.height !== null && entry.option.id !== "best",
    );
  if (!sized.length) return defaultQualityId(candidate);
  const tallest = Math.max(...sized.map((entry) => entry.height));
  if (tallest <= cap) return defaultQualityId(candidate);
  const fitting = sized.filter((entry) => entry.height <= cap).sort((a, b) => b.height - a.height);
  if (fitting[0]) return fitting[0].option.id;
  return sized.sort((a, b) => a.height - b.height)[0]?.option.id;
}
