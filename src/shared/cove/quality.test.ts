import { describe, expect, it } from "vitest";
import { optionHeight, pickQualityId, qualityCapHeight } from "./match";
import type { DownloaderQualityOption } from "./types";

const ytdlp: DownloaderQualityOption[] = [
  { id: "best", label: "Best available", height: 2160 },
  { id: "max-height-2160", label: "2160p", height: 2160 },
  { id: "max-height-1440", label: "1440p", height: 1440 },
  { id: "max-height-1080", label: "1080p", height: 1080 },
  { id: "max-height-720", label: "720p", height: 720 },
];

describe("qualityCapHeight", () => {
  it("maps preferences to a height", () => {
    expect(qualityCapHeight("best")).toBeNull();
    expect(qualityCapHeight("1080p")).toBe(1080);
    expect(qualityCapHeight("2160p")).toBe(2160);
  });
});

describe("optionHeight", () => {
  it("reads the height from the option, then the id, then the label", () => {
    expect(optionHeight({ id: "x", label: "x", height: 480 })).toBe(480);
    expect(optionHeight({ id: "max-height-720", label: "HD" })).toBe(720);
    expect(optionHeight({ id: "hd", label: "1080p" })).toBe(1080);
    expect(optionHeight({ id: "hd", label: "High" })).toBeNull();
  });
});

describe("pickQualityId", () => {
  it("returns best when there is no cap", () => {
    expect(pickQualityId({ qualityOptions: ytdlp }, "best")).toBe("best");
  });

  it("picks the largest option at or below the cap", () => {
    expect(pickQualityId({ qualityOptions: ytdlp }, "1080p")).toBe("max-height-1080");
    expect(pickQualityId({ qualityOptions: ytdlp }, "1440p")).toBe("max-height-1440");
  });

  it("falls back to best when every option already fits under the cap", () => {
    const small = ytdlp.filter((option) => option.id === "best" || (option.height ?? 0) <= 1080);
    expect(pickQualityId({ qualityOptions: small }, "1440p")).toBe("best");
  });

  it("takes the smallest option when nothing fits under the cap", () => {
    const large = ytdlp.filter((option) => option.id === "best" || (option.height ?? 0) >= 1440);
    expect(pickQualityId({ qualityOptions: large }, "1080p")).toBe("max-height-1440");
  });

  it("leaves downloaders without resolutions alone", () => {
    expect(pickQualityId({ qualityOptions: [] }, "1080p")).toBeUndefined();
    expect(pickQualityId({ qualityOptions: [{ id: "hq", label: "High" }] }, "1080p")).toBe("hq");
  });
});
