import { describe, expect, it } from "vitest";
import { eromeAlbumUrl, eromeVideosFromDocument } from "./erome";

describe("eromeAlbumUrl", () => {
  it("accepts album links on any erome host and strips the fragment", () => {
    expect(eromeAlbumUrl("https://www.erome.com/a/AbC123#x")).toBe("https://www.erome.com/a/AbC123");
    expect(eromeAlbumUrl("/a/AbC123", "https://erome.com/")).toBe("https://erome.com/a/AbC123");
    expect(eromeAlbumUrl("https://erome.com/a/AbC123/")).toBe("https://erome.com/a/AbC123/");
  });

  it("rejects other pages and hosts", () => {
    expect(eromeAlbumUrl("https://erome.com/explore")).toBe("");
    expect(eromeAlbumUrl("https://erome.com/a/x/y")).toBe("");
    expect(eromeAlbumUrl("https://example.com/a/x")).toBe("");
    expect(eromeAlbumUrl("javascript:alert(1)")).toBe("");
  });
});

describe("eromeVideosFromDocument", () => {
  const html = `
    <div class="media-group">
      <div class="duration">1:23</div>
      <video poster="/thumbs/one.jpg">
        <source src="https://v.erome.com/one_480.mp4" res="480">
        <source src="https://v.erome.com/one_1080.mp4" res="1080">
      </video>
    </div>
    <div class="media-group">
      <video><source src="https://v.erome.com/one_1080.mp4" res="1080"></video>
    </div>
    <div class="media-group">
      <div class="duration">0:00</div>
      <video><source src="https://v.erome.com/two.webm"></video>
    </div>
    <div class="media-group"><img src="/photo.jpg"></div>
    <div class="media-group"><video><source src="data:video/mp4;base64,AAAA"></video></div>
  `;

  it("keeps the best resolution per group, dedupes, and resolves relative posters", () => {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const videos = eromeVideosFromDocument(doc, "https://www.erome.com/a/abc");
    expect(videos).toEqual([
      {
        url: "https://v.erome.com/one_1080.mp4",
        title: "Video 1",
        thumbnail: "https://www.erome.com/thumbs/one.jpg",
        duration: "1:23",
      },
      { url: "https://v.erome.com/two.webm", title: "Video 2", thumbnail: "", duration: "" },
    ]);
  });
});
