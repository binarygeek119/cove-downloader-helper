import { describe, expect, it } from "vitest";
import { hostMatchesSite, isHttpUrl, normalizeBaseUrl, sameOrigin, urlKey } from "./url";

describe("isHttpUrl", () => {
  it("accepts http and https only", () => {
    expect(isHttpUrl("https://example.com/a")).toBe(true);
    expect(isHttpUrl("http://localhost:5073")).toBe(true);
    expect(isHttpUrl("ftp://example.com")).toBe(false);
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpUrl("")).toBe(false);
    expect(isHttpUrl(undefined)).toBe(false);
  });
});

describe("hostMatchesSite", () => {
  it("matches the host and its subdomains, ignoring www", () => {
    expect(hostMatchesSite("www.pornhub.com", "pornhub.com")).toBe(true);
    expect(hostMatchesSite("de.pornhub.com", "pornhub.com")).toBe(true);
    expect(hostMatchesSite("pornhub.com", "www.pornhub.com")).toBe(true);
    expect(hostMatchesSite("notpornhub.com", "pornhub.com")).toBe(false);
    expect(hostMatchesSite("example.com", "*")).toBe(false);
  });
});

describe("urlKey", () => {
  it("ignores scheme, www, fragment, trailing slash, and tracking parameters", () => {
    const key = urlKey("https://www.example.com/watch/?v=1&utm_source=x#t=10");
    expect(key).toBe("example.com/watch?v=1");
    expect(urlKey("http://example.com/watch?v=1")).toBe(key);
    expect(urlKey("https://example.com/watch?utm_campaign=a&v=1")).toBe(key);
  });

  it("keeps query order stable", () => {
    expect(urlKey("https://e.com/p?b=2&a=1")).toBe(urlKey("https://e.com/p?a=1&b=2"));
  });

  it("distinguishes different videos on the same host", () => {
    expect(urlKey("https://e.com/p?v=1")).not.toBe(urlKey("https://e.com/p?v=2"));
  });

  it("falls back to the trimmed input for non-URLs", () => {
    expect(urlKey("  nope ")).toBe("nope");
  });
});

describe("normalizeBaseUrl", () => {
  it("trims and strips trailing slashes", () => {
    expect(normalizeBaseUrl(" http://localhost:5073/ ")).toBe("http://localhost:5073");
    expect(normalizeBaseUrl("https://cove.example/app///")).toBe("https://cove.example/app");
  });

  it("rejects non-http values", () => {
    expect(normalizeBaseUrl("localhost:5073")).toBe("");
    expect(normalizeBaseUrl("ftp://x")).toBe("");
    expect(normalizeBaseUrl(42)).toBe("");
  });
});

describe("sameOrigin", () => {
  it("compares origins only", () => {
    expect(sameOrigin("http://localhost:5073/a", "http://localhost:5073/b")).toBe(true);
    expect(sameOrigin("http://localhost:5073", "http://localhost:5000")).toBe(false);
    expect(sameOrigin("nope", "http://localhost:5073")).toBe(false);
  });
});
