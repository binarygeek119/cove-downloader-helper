import { describe, expect, it } from "vitest";
import {
  defaultQualityId,
  effectivePreference,
  matchEntity,
  rankCandidates,
  TEXT_DOWNLOADER_ID,
  YTDLP_AUDIO_ID,
  YTDLP_VIDEO_ID,
} from "./match";
import type { DownloaderMatch } from "./types";

function match(downloaderId: string, overrides: Partial<DownloaderMatch> = {}): DownloaderMatch {
  return {
    downloaderId,
    downloaderName: downloaderId.split("/").pop() ?? downloaderId,
    supportedEntity: "Video",
    normalizedUrl: "https://example.com/watch?v=1",
    qualityOptions: [],
    ...overrides,
  };
}

const PAGE = "https://example.com/watch?v=1";

describe("matchEntity", () => {
  it("prefers the downloader id suffix over supportedEntity", () => {
    expect(matchEntity(match(YTDLP_VIDEO_ID, { supportedEntity: "Text" }))).toBe("Video");
    expect(matchEntity(match(YTDLP_AUDIO_ID))).toBe("Audio");
    expect(matchEntity(match("x/image", { supportedEntity: "Video" }))).toBe("Image");
    expect(matchEntity(match("x/gallery"))).toBe("Gallery");
    expect(matchEntity(match(TEXT_DOWNLOADER_ID, { supportedEntity: "Video" }))).toBe("Text");
  });

  it("falls back to supportedEntity, then Video", () => {
    expect(matchEntity(match("vendor/thing", { supportedEntity: "audio" }))).toBe("Audio");
    expect(matchEntity(match("vendor/thing", { supportedEntity: "" }))).toBe("Video");
    expect(matchEntity(match("vendor/thing", { supportedEntity: "Weird" }))).toBe("Video");
  });
});

describe("effectivePreference", () => {
  it("turns auto into Text or Audio on story and audio sites", () => {
    expect(effectivePreference("auto", "https://www.literotica.com/s/story")).toBe("Text");
    expect(effectivePreference("auto", "https://soundgasm.net/u/x/y")).toBe("Audio");
    expect(effectivePreference("auto", PAGE)).toBe("auto");
  });

  it("never overrides an explicit preference", () => {
    expect(effectivePreference("Video", "https://www.literotica.com/s/story")).toBe("Video");
  });
});

describe("rankCandidates", () => {
  it("prefers video over image over audio in auto mode and drops text when anything else matched", () => {
    const ranked = rankCandidates(
      [match(TEXT_DOWNLOADER_ID), match(YTDLP_AUDIO_ID), match("site/image"), match(YTDLP_VIDEO_ID)],
      "auto",
      PAGE,
    );
    expect(ranked.map((c) => c.entity)).toEqual(["Video", "Image", "Audio"]);
  });

  it("puts a site-specific downloader ahead of yt-dlp for the same entity", () => {
    const ranked = rankCandidates(
      [match(YTDLP_VIDEO_ID), match("cove.community.downloaders.reddit/video")],
      "auto",
      PAGE,
    );
    expect(ranked[0]?.downloaderId).toBe("cove.community.downloaders.reddit/video");
  });

  it("offers only text when text is all that matched", () => {
    const ranked = rankCandidates([match(TEXT_DOWNLOADER_ID)], "auto", PAGE);
    expect(ranked.map((c) => c.entity)).toEqual(["Text"]);
  });

  it("falls back to yt-dlp video when nothing matched", () => {
    const [only] = rankCandidates([], "auto", PAGE);
    expect(only?.downloaderId).toBe(YTDLP_VIDEO_ID);
    expect(only?.isFallback).toBe(true);
    expect(only?.url).toBe(PAGE);
  });

  it("filters to the requested entity and falls back per entity", () => {
    const all = [match(YTDLP_VIDEO_ID), match(YTDLP_AUDIO_ID), match("site/image")];
    expect(rankCandidates(all, "Audio", PAGE).map((c) => c.downloaderId)).toEqual([YTDLP_AUDIO_ID]);
    expect(rankCandidates([match(YTDLP_VIDEO_ID)], "Audio", PAGE)[0]).toMatchObject({
      downloaderId: YTDLP_AUDIO_ID,
      isFallback: true,
    });
    expect(rankCandidates([match(YTDLP_VIDEO_ID)], "Text", PAGE)[0]).toMatchObject({
      downloaderId: TEXT_DOWNLOADER_ID,
      isFallback: true,
    });
  });

  it("has no fallback for images", () => {
    expect(rankCandidates([match(YTDLP_VIDEO_ID)], "Image", PAGE)).toEqual([]);
  });

  it("uses the text downloader on a story site in auto mode", () => {
    const story = "https://www.literotica.com/s/example";
    const ranked = rankCandidates(
      [match(YTDLP_VIDEO_ID, { normalizedUrl: story }), match(TEXT_DOWNLOADER_ID, { normalizedUrl: story })],
      "auto",
      story,
    );
    expect(ranked.map((c) => c.entity)).toEqual(["Text"]);
  });
});

describe("defaultQualityId", () => {
  it("prefers best, then the first option", () => {
    expect(
      defaultQualityId({
        qualityOptions: [
          { id: "720p", label: "720p" },
          { id: "best", label: "Best" },
        ],
      }),
    ).toBe("best");
    expect(defaultQualityId({ qualityOptions: [{ id: "720p", label: "720p" }] })).toBe("720p");
    expect(defaultQualityId({ qualityOptions: [] })).toBeUndefined();
  });
});
