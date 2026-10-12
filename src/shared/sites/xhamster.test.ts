import { describe, expect, it } from "vitest";
import vectors from "./__fixtures__/xhamster-vectors.json";
import {
  collectXhamsterPlayerUrlsInPage,
  decipherXhamsterHex,
  isXhamsterWatchUrl,
  resolveXhamsterFormatUrl,
  xhamsterStreamUrl,
} from "./xhamster";

/** Vectors were produced by the yt-dlp reference implementation of the cipher (see the fixture). */
describe("decipherXhamsterHex", () => {
  for (const vector of vectors) {
    it(`deciphers algorithm ${vector.algo} with seed ${vector.seed}`, () => {
      expect(decipherXhamsterHex(vector.cipher)).toBe(vector.text);
    });
  }

  it("ignores short hex and unknown algorithms", () => {
    expect(decipherXhamsterHex("abcd")).toBe("");
    expect(decipherXhamsterHex("001122334455")).toBe("");
    expect(decipherXhamsterHex("zz1122334455")).toBe("");
  });
});

describe("resolveXhamsterFormatUrl", () => {
  it("unwraps ciphertext embedded as the first path segment", () => {
    const vector = vectors[0]!;
    const wrapped = `https://files.example/${vector.cipher},rest?token=1`;
    expect(resolveXhamsterFormatUrl(wrapped)).toBe(`https://files.example/${vector.text},rest?token=1`);
  });

  it("returns a bare ciphertext as its plaintext address", () => {
    expect(resolveXhamsterFormatUrl(vectors[1]!.cipher)).toBe(vectors[1]!.text);
  });

  it("passes plain addresses through and drops blob and data URLs", () => {
    expect(resolveXhamsterFormatUrl("https://cdn.example/plain/master.m3u8")).toBe(
      "https://cdn.example/plain/master.m3u8",
    );
    expect(resolveXhamsterFormatUrl("blob:https://xhamster.com/player")).toBe("");
    expect(resolveXhamsterFormatUrl("data:text/plain,hi")).toBe("");
  });
});

describe("xhamsterStreamUrl", () => {
  it("returns the first HLS playlist, deciphered, and skips files", () => {
    const vector = vectors[0]!;
    expect(xhamsterStreamUrl(["https://cdn.example/file.mp4", vector.cipher, "https://cdn.example/other.m3u8"])).toBe(
      vector.text,
    );
    expect(xhamsterStreamUrl(["https://cdn.example/file.mp4"])).toBe("");
  });
});

describe("isXhamsterWatchUrl", () => {
  it("matches watch pages on any xHamster subdomain", () => {
    expect(isXhamsterWatchUrl("https://xhamster.com/videos/example-xh7BSw0")).toBe(true);
    expect(isXhamsterWatchUrl("https://www.xhamster.com/videos/example-xh7BSw0?foo=1")).toBe(true);
    expect(isXhamsterWatchUrl("https://ge.xhamster.com/videos/example-xh7BSw0")).toBe(true);
    expect(isXhamsterWatchUrl("https://xhamster.com/")).toBe(false);
    expect(isXhamsterWatchUrl("https://xhamster.com/categories/example")).toBe(false);
    expect(isXhamsterWatchUrl("https://example.com/videos/example-xh7BSw0")).toBe(false);
  });
});

describe("collectXhamsterPlayerUrlsInPage", () => {
  it("reads player sources, the video element, and resource timing, skipping download links and blobs", () => {
    const playlist = vectors[0]!.cipher;
    (window as unknown as { initials: unknown }).initials = {
      xplayerSettings: {
        sources: {
          hls: { url: playlist, fallback: "zz" },
          standard: { h264: [{ url: "https://cdn.example/file.mp4", fallback: "" }] },
        },
      },
      videoModel: {
        sources: {
          download: { "720p": "https://cdn.example/download.m3u8" },
          mp4: { "720p": "https://cdn.example/progressive.mp4" },
        },
      },
    };
    const video = document.createElement("video");
    video.src = "https://cdn.example/element.mp4";
    document.body.appendChild(video);
    const entries = performance.getEntriesByType;
    performance.getEntriesByType = () => [{ name: "https://cdn.example/seen.m3u8" } as PerformanceEntry];
    try {
      const found = collectXhamsterPlayerUrlsInPage();
      expect(found[0]).toBe(playlist);
      expect(found).toContain("https://cdn.example/progressive.mp4");
      expect(found).toContain("https://cdn.example/seen.m3u8");
      expect(found).not.toContain("https://cdn.example/download.m3u8");
      expect(found.some((value) => value.startsWith("blob:"))).toBe(false);
    } finally {
      performance.getEntriesByType = entries;
      video.remove();
    }
  });
});
