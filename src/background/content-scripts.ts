import { EROME_MATCH_PATTERNS } from "../shared/sites/erome";
import { hasHostPermission, HOST_ORIGINS } from "./host-permission";
import { settingsCache } from "./settings-cache";

const SCRIPT_ID = "cove-content";

function sameMatches(registered: chrome.scripting.RegisteredContentScript | undefined, matches: string[]): boolean {
  const current = registered?.matches ?? [];
  if (current.length !== matches.length) return false;
  const left = [...current].sort();
  const right = [...matches].sort();
  return left.every((value, index) => value === right[index]);
}

async function injectIntoOpenTabs(matches: string[]): Promise<void> {
  let tabs: chrome.tabs.Tab[] = [];
  try {
    tabs = await chrome.tabs.query({ url: matches });
  } catch {
    return;
  }
  await Promise.all(
    tabs.map(async (tab) => {
      if (!tab.id || tab.discarded) return;
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content/main.js"] });
      } catch {
        // Restricted, prerendered, or closed tabs cannot take the script.
      }
    }),
  );
}

async function syncNow(): Promise<void> {
  const settings = await settingsCache.get();
  const allowed = await hasHostPermission();
  const wantsButtons = settings.inPageButton !== "off" || settings.stylizedButtons;
  // Erome album icons stay on even with the other in-page buttons off.
  const matches = wantsButtons ? HOST_ORIGINS : EROME_MATCH_PATTERNS;

  const [registered] = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });
  const upToDate = allowed && registered && sameMatches(registered, matches);
  if (upToDate) return;

  if (registered) await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
  if (!allowed) return;

  try {
    await chrome.scripting.registerContentScripts([
      { id: SCRIPT_ID, js: ["content/main.js"], matches, runAt: "document_idle", persistAcrossSessions: true },
    ]);
  } catch (error) {
    if (!/duplicate script id/i.test(error instanceof Error ? error.message : String(error))) throw error;
  }
  // Registered scripts only run on later navigations. Reach the pages that are already open.
  await injectIntoOpenTabs(matches);
}

let chain: Promise<void> = Promise.resolve();

/** Register the content script to match the current settings and permission. Calls are serialized. */
export function syncContentScripts(): Promise<void> {
  const run = chain.then(syncNow);
  chain = run.catch((error: unknown) => console.warn("Content script sync failed", error));
  return run;
}
