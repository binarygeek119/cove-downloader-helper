import { settingsCache } from "./settings-cache";

const ACTIVE_COLOR = "#4f8ff7";
const POOL_COLOR = "#6b7085";
const ERROR_COLOR = "#dc2626";

let activeJobs = 0;
let poolSize: number | null = null;

export function setActiveJobCount(count: number): void {
  activeJobs = count;
}

/**
 * The toolbar badge shows the number of downloads this extension started that are still running.
 * When pool mode is on and nothing is running, it shows how many URLs are waiting in the pool.
 */
export async function updateBadge(): Promise<void> {
  const settings = await settingsCache.get();
  if (activeJobs > 0) {
    await paint(String(activeJobs), ACTIVE_COLOR);
    return;
  }
  if (settings.poolMode) {
    if (poolSize === null) {
      const stored = await chrome.storage.local.get("pool");
      poolSize = Array.isArray(stored.pool) ? stored.pool.length : 0;
    }
    await paint(poolSize ? String(poolSize) : "", POOL_COLOR);
    return;
  }
  await paint("", POOL_COLOR);
}

export function notePoolSize(size: number): void {
  poolSize = size;
}

export async function flashErrorBadge(): Promise<void> {
  await paint("!", ERROR_COLOR);
  setTimeout(() => void updateBadge(), 4000);
}

async function paint(text: string, color: string): Promise<void> {
  try {
    await chrome.action.setBadgeBackgroundColor({ color });
    await chrome.action.setBadgeText({ text });
  } catch {
    // The action may be unavailable while the extension is updating.
  }
}
