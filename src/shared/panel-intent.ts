/** Session-storage handoff from the service worker to a panel that may still be loading. */
import type { EromeSelectorState, PanelTab, SendItem } from "./models";

export const PANEL_INTENT_KEY = "panelIntent";
export const EROME_SELECTOR_KEY = "eromeSelector";

export interface PanelIntent {
  tab: PanelTab;
  /** A send waiting for the user to confirm the match and quality. */
  review?: SendItem & { tabId?: number };
}

export async function takePanelIntent(): Promise<PanelIntent | null> {
  const stored = await chrome.storage.session.get(PANEL_INTENT_KEY);
  const intent = stored[PANEL_INTENT_KEY] as PanelIntent | undefined;
  if (!intent) return null;
  await chrome.storage.session.remove(PANEL_INTENT_KEY);
  return intent;
}

export async function readEromeSelector(): Promise<EromeSelectorState | null> {
  const stored = await chrome.storage.session.get(EROME_SELECTOR_KEY);
  return (stored[EROME_SELECTOR_KEY] as EromeSelectorState | undefined) ?? null;
}

export async function clearEromeSelector(): Promise<void> {
  await chrome.storage.session.remove(EROME_SELECTOR_KEY);
}
