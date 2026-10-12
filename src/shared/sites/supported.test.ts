import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isLayoutFile } from "../layouts/schema";
import {
  DIRECT_MEDIA_EXTENSIONS,
  hostsFromUrlPattern,
  isSupportedSiteUrl,
  siteMediaKind,
  SUPPORTED_SITE_HOSTS,
} from "./supported";

const root = path.resolve(__dirname, "../../..");

/** Rows of the first markdown table in the `## Sites` section of SUPPORTED_SITES.md. */
function supportedSitesRows(): string[][] {
  const markdown = fs.readFileSync(path.join(root, "SUPPORTED_SITES.md"), "utf8");
  const section = markdown.split(/^## Sites\s*$/m)[1]?.split(/^## /m)[0] ?? "";
  return section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|"))
    .map((line) =>
      line
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((cell) => cell.trim()),
    )
    .filter((cells) => !cells.every((cell) => /^:?-+:?$/.test(cell)))
    .slice(1);
}

function backticked(cell: string): string[] {
  return [...cell.matchAll(/`([^`]+)`/g)].map((match) => match[1]!.toLowerCase());
}

describe("isSupportedSiteUrl", () => {
  it("matches bundled hosts, their subdomains, direct media, and extra hosts from Cove", () => {
    expect(isSupportedSiteUrl("https://www.youtube.com/watch?v=x")).toBe(true);
    expect(isSupportedSiteUrl("https://m.pornhub.com/view_video.php?viewkey=1")).toBe(true);
    expect(isSupportedSiteUrl("https://files.example/clip.MP4")).toBe(true);
    expect(isSupportedSiteUrl("https://unknown.example/page")).toBe(false);
    expect(isSupportedSiteUrl("https://unknown.example/page", ["unknown.example"])).toBe(true);
    expect(isSupportedSiteUrl("ftp://youtube.com/x")).toBe(false);
  });
});

describe("hostsFromUrlPattern", () => {
  it("extracts concrete hosts and ignores wildcards", () => {
    expect(hostsFromUrlPattern("https://*.example.com/*")).toEqual(["example.com"]);
    expect(hostsFromUrlPattern("*://www.example.com/path/*")).toEqual(["example.com"]);
    expect(hostsFromUrlPattern("https://*/*")).toEqual([]);
    expect(hostsFromUrlPattern("*")).toEqual([]);
    expect(hostsFromUrlPattern("https://*.ex*.com/*")).toEqual([]);
  });
});

describe("siteMediaKind", () => {
  it("knows the story and audio sites", () => {
    expect(siteMediaKind("https://www.literotica.com/s/x")).toBe("text");
    expect(siteMediaKind("https://soundgasm.net/u/a/b")).toBe("audio");
    expect(siteMediaKind("https://whyp.it/tracks/1")).toBe("audio");
    expect(siteMediaKind("https://youtube.com/watch?v=1")).toBeNull();
  });
});

describe("SUPPORTED_SITES.md stays in sync with the code", () => {
  const rows = supportedSitesRows();
  const docHosts = rows
    .filter((cells) => cells[0] !== "Direct media file")
    .flatMap((cells) => backticked(cells[1] ?? ""));
  const layoutNames = JSON.parse(fs.readFileSync(path.join(root, "src/layouts/index.json"), "utf8")) as string[];
  const layoutHosts = layoutNames
    .map((name) => JSON.parse(fs.readFileSync(path.join(root, "src/layouts", name), "utf8")) as unknown)
    .filter(isLayoutFile)
    .flatMap((layout) => layout.hosts.map((host) => host.toLowerCase()));

  it("lists exactly the bundled hosts", () => {
    expect([...docHosts].sort()).toEqual([...SUPPORTED_SITE_HOSTS].sort());
  });

  it("lists exactly the direct media extensions", () => {
    const row = rows.find((cells) => cells[0] === "Direct media file");
    const extensions = backticked(row?.[1] ?? "").map((ext) => ext.replace(/^\./, ""));
    expect(extensions.sort()).toEqual([...DIRECT_MEDIA_EXTENSIONS].sort());
  });

  it("marks the stylized button column to match the layout files", () => {
    const stylized = rows
      .filter((cells) => /^yes/i.test(cells[3] ?? ""))
      .flatMap((cells) => backticked(cells[1] ?? ""));
    expect(stylized.sort()).toEqual([...new Set(layoutHosts)].sort());
  });
});
