import { broadcast } from "../shared/messaging";
import { PANEL_INTENT_KEY, type PanelIntent } from "../shared/panel-intent";

export const PANEL_PATH = "panel.html";

export function enablePanel(): void {
  chrome.sidePanel.setOptions({ path: PANEL_PATH, enabled: true }).catch(() => {});
}

/**
 * Open the side panel on `windowId`. Call this synchronously inside the user gesture that
 * triggered it; after an `await` Chrome refuses. The tab switch is delivered two ways because the
 * panel may already be open (event) or still loading (stored intent).
 */
export function openPanel(windowId: number | undefined, intent: PanelIntent = { tab: "queue" }): void {
  void chrome.storage.session.set({ [PANEL_INTENT_KEY]: intent });
  broadcast({ kind: "show-tab", tab: intent.tab });
  if (windowId === undefined || windowId === null || !chrome.sidePanel) return;
  chrome.sidePanel.open({ windowId }).catch((error: unknown) => {
    console.warn("Could not open the side panel", error);
  });
}
