/** URL helpers shared by the service worker, content scripts, and the panel. */

export function parseHttpUrl(value: unknown): URL | null {
  if (typeof value !== "string" || !value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

export function isHttpUrl(value: unknown): value is string {
  return parseHttpUrl(value) !== null;
}

export function stripWww(hostname: string): string {
  return String(hostname || "")
    .replace(/^www\./i, "")
    .toLowerCase();
}

/** True when `hostname` is `site` or a subdomain of it. `www.` is ignored on both sides. */
export function hostMatchesSite(hostname: string, site: string): boolean {
  const host = stripWww(hostname);
  const normalized = stripWww(site);
  if (!host || !normalized || normalized === "*") return false;
  return host === normalized || host.endsWith("." + normalized);
}

const TRACKING_PARAMS = /^(utm_|fbclid$|gclid$|igshid$|si$|ref$|ref_src$)/i;

/**
 * Stable key for duplicate detection. Two URLs that differ only by scheme, `www.`, fragment,
 * trailing slash, tracking parameters, or query-parameter order share a key.
 */
export function urlKey(value: string): string {
  const url = parseHttpUrl(value);
  if (!url) return String(value || "").trim();
  const params = [...url.searchParams.entries()]
    .filter(([name]) => !TRACKING_PARAMS.test(name))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const query = params.length ? "?" + new URLSearchParams(params).toString() : "";
  const path = url.pathname.replace(/\/+$/, "") || "/";
  return `${stripWww(url.hostname)}${path}${query}`;
}

export function sameOrigin(a: string, b: string): boolean {
  const left = parseHttpUrl(a);
  const right = parseHttpUrl(b);
  return !!left && !!right && left.origin === right.origin;
}

/** Trimmed http(s) origin plus optional path, without a trailing slash. Empty when invalid. */
export function normalizeBaseUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim().replace(/\/+$/, "");
  return parseHttpUrl(trimmed) ? trimmed : "";
}
