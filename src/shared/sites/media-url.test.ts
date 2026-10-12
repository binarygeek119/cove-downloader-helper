import { describe, expect, it } from "vitest";
import { fileNameForCove, isVideoFileUrl, streamResolution, videoUrlForCove, withYtDlpReferer } from "./media-url";

const PAGE = "https://www.erome.com/a/abc123";

describe("isVideoFileUrl", () => {
  it("recognizes progressive files and playlists by path only", () => {
    expect(isVideoFileUrl("https://cdn.example/v/clip.mp4?token=1")).toBe(true);
    expect(isVideoFileUrl("https://cdn.example/v/master.m3u8")).toBe(true);
    expect(isVideoFileUrl("https://cdn.example/v/clip.mpd")).toBe(true);
    expect(isVideoFileUrl("https://cdn.example/watch?file=clip.mp4")).toBe(false);
    expect(isVideoFileUrl("not a url")).toBe(false);
  });
});

describe("withYtDlpReferer", () => {
  it("smuggles the page as a referer in the fragment", () => {
    const url = withYtDlpReferer("https://cdn.example/master.m3u8", PAGE);
    expect(url.startsWith("https://cdn.example/master.m3u8#__youtubedl_smuggle=")).toBe(true);
    expect(JSON.parse(decodeURIComponent(url.split("=")[1]!))).toEqual({ referer: PAGE });
  });

  it("leaves the address alone without a valid page", () => {
    expect(withYtDlpReferer("https://cdn.example/master.m3u8", "")).toBe("https://cdn.example/master.m3u8");
  });
});

describe("videoUrlForCove", () => {
  it("wraps a progressive file in a data: HLS playlist that carries the file name and referer", () => {
    const wrapped = videoUrlForCove("https://cdn.example/v/clip_720p.mp4#frag", PAGE);
    expect(wrapped.startsWith("data:application/vnd.apple.mpegurl;filename=/clip_720p.mp4;base64,")).toBe(true);
    const [payload, fragment] = wrapped.split("#__youtubedl_smuggle=");
    expect(JSON.parse(decodeURIComponent(fragment!))).toEqual({ referer: PAGE });
    const master = atob(payload!.split(";base64,")[1]!);
    expect(master).toContain("RESOLUTION=1280x720");
    expect(master).toContain('CODECS="avc1.4d401f,mp4a.40.2"');
    const inner = atob(master.split("base64,")[1]!.trim());
    expect(inner).toContain("#EXTINF:86400.0,\nhttps://cdn.example/v/clip_720p.mp4\n#EXT-X-ENDLIST");
  });

  it("adds a referer to a playlist and passes other addresses through", () => {
    expect(videoUrlForCove("https://cdn.example/master.m3u8", PAGE)).toContain("#__youtubedl_smuggle=");
    expect(videoUrlForCove("https://cdn.example/master.m3u8", "")).toBe("https://cdn.example/master.m3u8");
    expect(videoUrlForCove("https://example.com/watch?v=1", PAGE)).toBe("https://example.com/watch?v=1");
  });
});

describe("fileNameForCove and streamResolution", () => {
  it("derives a safe file name with an extension", () => {
    expect(fileNameForCove("https://cdn.example/a/My%20Clip.MP4")).toBe("My_Clip.MP4");
    expect(fileNameForCove("https://cdn.example/a/noext")).toBe("noext.mp4");
    expect(fileNameForCove("https://cdn.example/")).toBe("video.mp4");
  });

  it("reads the height from the file name and defaults to 720p", () => {
    expect(streamResolution("clip_1080p.mp4")).toBe("1920x1080");
    expect(streamResolution("clip.mp4")).toBe("1280x720");
    expect(streamResolution("x2160p.mp4")).toBe("3840x2160");
  });
});
