import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isPlainCssSelector, layoutKindEntity, matchLayoutTargets, validateLayout } from "./schema";

const layoutDir = path.resolve(__dirname, "../../layouts");
const index = JSON.parse(fs.readFileSync(path.join(layoutDir, "index.json"), "utf8")) as string[];
const layouts = Object.fromEntries(
  index.map((name) => [name, JSON.parse(fs.readFileSync(path.join(layoutDir, name), "utf8")) as unknown]),
);
const pornhub = layouts["pornhub.lay"]!;

describe("isPlainCssSelector", () => {
  it.each([
    ".video-wrapper .video-actions-tabs",
    ".photoAlbum",
    "div > span.item",
    "#id, .a + .b",
    '[data-role="download"]',
    "button.primary:hover",
    ".a:not(.b)",
    "ul.votingWrap > li:has(#favoriteGifButton)",
    "link[href*='-black-'], style[data-href*='-black-']",
  ])("accepts %s", (selector) => {
    expect(isPlainCssSelector(selector)).toBe(true);
  });

  it.each([
    "",
    "   ",
    "<img>",
    "div{color:red}",
    ".foo;background:url(javascript:alert(1))",
    "expression(alert(1))",
    "a\\b",
    "@import x",
  ])("rejects %s", (selector) => {
    expect(isPlainCssSelector(selector)).toBe(false);
  });
});

describe("bundled layout files", () => {
  it("lists every .lay file in the index and nothing else", () => {
    const files = fs
      .readdirSync(layoutDir)
      .filter((name) => name.endsWith(".lay"))
      .sort();
    expect([...index].sort()).toEqual(files);
  });

  it.each(index)("%s is valid", (name) => {
    expect(validateLayout(layouts[name])).toEqual([]);
  });
});

describe("validateLayout", () => {
  it("reports every problem in a broken file", () => {
    const errors = validateLayout({
      version: 2,
      hosts: ["bad host"],
      targets: [
        {
          id: "x y",
          kind: "movie",
          path: "watch",
          anchor: { selector: "<b>", insert: "inside", replace: true },
          button: { size: "huge", showText: "yes", label: "", shape: "blob", colors: { background: "red" } },
        },
      ],
    });
    expect(errors).toEqual(
      expect.arrayContaining([
        "version must be 1",
        "hosts[0] must be a hostname",
        "targets[0].id must be a short id",
        "targets[0].kind must be video, image, gif, or story",
        "targets[0].path must be a URL path prefix",
        "targets[0].anchor.selector is not a plain CSS selector",
        "targets[0].anchor.insert is invalid",
        "targets[0].button.size must be small, medium, or large",
        "targets[0].button.showText must be true or false",
        "targets[0].button.shape must be square, rounded, or pill",
        "targets[0].button.colors.background must be #rgb, #rrggbb, or transparent",
        "targets[0].button.colors.text must be #rgb or #rrggbb",
      ]),
    );
  });

  it("requires replace to sit beside the anchor", () => {
    const base = JSON.parse(JSON.stringify(pornhub)) as { targets: { anchor: Record<string, unknown> }[] };
    base.targets[0]!.anchor = { selector: ".x", insert: "beforeend", replace: true };
    expect(validateLayout(base)).toContain("targets[0].anchor.replace needs insert beforebegin or afterend");
  });
});

describe("matchLayoutTargets", () => {
  it("maps kinds to entities", () => {
    expect(layoutKindEntity("video")).toBe("Video");
    expect(layoutKindEntity("image")).toBe("Image");
    expect(layoutKindEntity("gif")).toBe("Image");
    expect(layoutKindEntity("story")).toBe("Text");
  });

  it("matches the Pornhub watch page", () => {
    const targets = matchLayoutTargets([pornhub], "https://www.pornhub.com/view_video.php?viewkey=63e69d5ec09f3");
    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({
      id: "video",
      kind: "video",
      entity: "Video",
      anchor: { selector: ".userActions .js_videoSubscribeButton", insert: "afterend", replace: false },
      button: { shape: "pill", showText: true, scale: 1, fit: false, hover: true },
    });
  });

  it("keeps every target with the longest matching path and ignores albums", () => {
    expect(matchLayoutTargets([pornhub], "https://www.pornhub.com/album/80791185")).toEqual([]);
    const photo = matchLayoutTargets([pornhub], "https://www.pornhub.com/photo/868704295");
    expect(photo.map((target) => target.id).sort()).toEqual(["album", "photo"]);
    expect(photo.every((target) => target.entity === "Image")).toBe(true);
    const gif = matchLayoutTargets([pornhub], "https://www.pornhub.com/gif/55153161");
    expect(gif.map((target) => target.id).sort()).toEqual(["gif", "gifs"]);
  });

  it("ignores other hosts, non-http pages, and invalid layouts", () => {
    expect(matchLayoutTargets([pornhub], "https://example.com/view_video.php")).toEqual([]);
    expect(matchLayoutTargets([pornhub], "chrome://extensions")).toEqual([]);
    expect(matchLayoutTargets([{ version: 1 }], "https://www.pornhub.com/view_video.php")).toEqual([]);
  });

  it("carries the theme and normalizes transparent colors for XVideos", () => {
    const [target] = matchLayoutTargets([layouts["xvideos.lay"]], "https://www.xvideos.com/video.abc/title");
    expect(target?.theme?.dark).toContain("-black-");
    expect(target?.anchor.replace).toBe(true);
    expect(target?.button.colors.background).toBe("transparent");
    expect(target?.button.dark?.text).toBe("#ffffff");
    expect(target?.button.hover).toBe(false);
  });

  it("fits the SpankBang button to its row and uses the root path", () => {
    const [target] = matchLayoutTargets([layouts["spankbang.lay"]], "https://spankbang.com/iavy/video/example");
    expect(target).toMatchObject({ id: "watch", path: "/", button: { fit: true, size: "large" } });
  });
});
