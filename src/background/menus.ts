export const MENU = {
  sendLink: "cove-send-link",
  sendPage: "cove-send-page",
  poolLink: "cove-pool-link",
  poolPage: "cove-pool-page",
  openPanel: "cove-open-panel",
  openPanelAction: "cove-open-panel-action",
} as const;

const HTTP_PATTERNS = ["http://*/*", "https://*/*"];

export function ensureContextMenus(): void {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU.sendLink,
      title: "Send link to Cove",
      contexts: ["link"],
      targetUrlPatterns: HTTP_PATTERNS,
    });
    chrome.contextMenus.create({
      id: MENU.poolLink,
      title: "Add link to Cove pool",
      contexts: ["link"],
      targetUrlPatterns: HTTP_PATTERNS,
    });
    chrome.contextMenus.create({
      id: MENU.sendPage,
      title: "Send page to Cove",
      contexts: ["page"],
      documentUrlPatterns: HTTP_PATTERNS,
    });
    chrome.contextMenus.create({
      id: MENU.poolPage,
      title: "Add page to Cove pool",
      contexts: ["page"],
      documentUrlPatterns: HTTP_PATTERNS,
    });
    chrome.contextMenus.create({
      id: MENU.openPanel,
      title: "Open Cove panel",
      contexts: ["page"],
      documentUrlPatterns: HTTP_PATTERNS,
    });
    chrome.contextMenus.create({ id: MENU.openPanelAction, title: "Open Cove panel", contexts: ["action"] });
  });
}
