import { createCoveClient, type CoveClient } from "../shared/cove/client";
import type { Settings } from "../shared/settings";
import { hostsFromUrlPattern, SUPPORTED_SITE_HOSTS } from "../shared/sites/supported";

export function clientFor(settings: Settings): CoveClient {
  return createCoveClient({ baseUrl: settings.coveUrl, token: settings.apiToken });
}

const HOST_CACHE_TTL = 10 * 60 * 1000;
let hostCache: { at: number; baseUrl: string; hosts: string[] } | null = null;

/** Hosts advertised by the downloaders installed on this Cove instance, cached for ten minutes. */
export async function supportedHostsFor(settings: Settings): Promise<string[]> {
  const now = Date.now();
  if (hostCache && hostCache.baseUrl === settings.coveUrl && now - hostCache.at < HOST_CACHE_TTL) {
    return [...SUPPORTED_SITE_HOSTS, ...hostCache.hosts];
  }
  let hosts: string[] = hostCache?.hosts ?? [];
  try {
    const downloaders = await clientFor(settings).listDownloaders();
    hosts = downloaders.flatMap((item) => (item.supportedUrlPatterns ?? []).flatMap(hostsFromUrlPattern));
    hostCache = { at: now, baseUrl: settings.coveUrl, hosts };
  } catch {
    // Cove is offline; keep whatever was cached.
  }
  return [...SUPPORTED_SITE_HOSTS, ...hosts];
}
