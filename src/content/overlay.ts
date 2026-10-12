/** The floating button, the link chip, and the toast. One shadow root at the end of <html>. */
import { STATE_ICON_STYLE, stateIconSvg } from "./icons";

const HOST_ID = "cove-downloader-helper-root";
const TOAST_MS = 2800;

export interface Overlay {
  fab: HTMLButtonElement;
  chip: HTMLButtonElement;
  toast(text: string, error?: boolean): void;
  setFabVisible(visible: boolean): void;
  showChipAt(rect: DOMRect): void;
  hideChip(): void;
}

function styles(iconUrl: string): string {
  return `
    :host, * { box-sizing: border-box; font-family: "Open Sans", -apple-system, "Segoe UI", Roboto, system-ui, sans-serif; }
    :host { color-scheme: light dark; }
    #fab {
      position: fixed;
      right: 16px;
      bottom: 16px;
      z-index: 2147483646;
      display: none;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      padding: 0;
      border-radius: 999px;
      border: 1px solid #2a2d38;
      background: #1e2028 url("${iconUrl}") center / 28px 28px no-repeat;
      color: #ffffff;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
      cursor: pointer;
      transition: transform 0.15s, box-shadow 0.15s;
    }
    #fab[data-visible="1"] { display: inline-flex; }
    #fab:hover { transform: translateY(-1px); box-shadow: 0 10px 28px rgba(0, 0, 0, 0.34); }
    #fab:not([data-state]) .cove-state-icon, #fab[data-state="idle"] .cove-state-icon { display: none; }
    #fab[data-state="busy"], #fab[data-state="done"], #fab[data-state="error"] { background-image: none; }
    #fab[data-state="done"] { background-color: #16a34a; border-color: #16a34a; }
    #fab[data-state="error"] { background-color: #dc2626; border-color: #dc2626; }
    #fab .cove-state-icon { width: 22px; height: 22px; fill: currentColor; }
    #chip {
      position: fixed;
      z-index: 2147483646;
      display: none;
      align-items: center;
      gap: 6px;
      transform: translate(-50%, -120%);
      background: #1e2028;
      color: #e8eaf0;
      border: 1px solid #2a2d38;
      border-radius: 999px;
      padding: 4px 10px 4px 8px;
      font-size: 12px;
      line-height: 1.2;
      cursor: pointer;
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.25);
      white-space: nowrap;
    }
    #chip[data-visible="1"] { display: inline-flex; }
    #chip img { width: 14px; height: 14px; }
    #chip[data-state="busy"] img, #chip[data-state="done"] img, #chip[data-state="error"] img { display: none; }
    #chip .cove-state-icon { width: 14px; height: 14px; fill: currentColor; }
    #chip:not([data-state]) .cove-state-icon, #chip[data-state="idle"] .cove-state-icon { display: none; }
    #toast {
      position: fixed;
      left: 50%;
      bottom: 72px;
      transform: translateX(-50%) translateY(8px);
      z-index: 2147483647;
      display: flex;
      align-items: center;
      gap: 8px;
      background: #1e2028;
      color: #e8eaf0;
      border: 1px solid #2a2d38;
      border-left: 3px solid #4f8ff7;
      border-radius: 10px;
      padding: 9px 14px;
      font-size: 13px;
      line-height: 1.3;
      max-width: min(420px, 90vw);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.18s, transform 0.18s;
    }
    #toast[data-visible="1"] { opacity: 1; transform: translateX(-50%) translateY(0); }
    #toast[data-error="1"] { border-left-color: #dc2626; }
    @media (prefers-color-scheme: light) {
      #fab:not([data-state="done"]):not([data-state="error"]), #chip, #toast {
        background-color: #ffffff;
        color: #1a2330;
        border-color: #d5dde6;
        box-shadow: 0 8px 24px rgba(20, 32, 48, 0.16);
      }
      #toast { border-left-color: #4f8ff7; }
      #toast[data-error="1"] { border-left-color: #c62828; }
    }
    ${STATE_ICON_STYLE}
  `;
}

export function ensureOverlay(): Overlay {
  const existing = document.getElementById(HOST_ID);
  const root = existing ?? document.createElement("div");
  let shadow = root.shadowRoot;
  if (!shadow) {
    root.id = HOST_ID;
    shadow = root.attachShadow({ mode: "open" });
    const iconUrl = chrome.runtime.getURL("icons/cove-icon-32.png");
    const style = document.createElement("style");
    style.textContent = styles(iconUrl);
    shadow.appendChild(style);

    const fab = document.createElement("button");
    fab.id = "fab";
    fab.type = "button";
    fab.title = "Send this page to Cove";
    fab.setAttribute("aria-label", "Send this page to Cove");
    fab.appendChild(stateIconSvg());

    const chip = document.createElement("button");
    chip.id = "chip";
    chip.type = "button";
    chip.title = "Send this link to Cove";
    const chipIcon = document.createElement("img");
    chipIcon.src = iconUrl;
    chipIcon.alt = "";
    chip.append(chipIcon, stateIconSvg(), document.createTextNode("Cove"));

    const toast = document.createElement("div");
    toast.id = "toast";
    toast.setAttribute("role", "status");

    shadow.append(fab, chip, toast);
    (document.documentElement || document.body).appendChild(root);
  }

  const fab = shadow.getElementById("fab") as HTMLButtonElement;
  const chip = shadow.getElementById("chip") as HTMLButtonElement;
  const toastEl = shadow.getElementById("toast") as HTMLDivElement;
  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  return {
    fab,
    chip,
    toast(text, error = false) {
      toastEl.textContent = text;
      toastEl.dataset.error = error ? "1" : "0";
      toastEl.dataset.visible = "1";
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        toastEl.dataset.visible = "0";
      }, TOAST_MS);
    },
    setFabVisible(visible) {
      fab.dataset.visible = visible ? "1" : "0";
      if (!visible) chip.dataset.visible = "0";
    },
    showChipAt(rect) {
      chip.style.left = `${Math.max(24, Math.min(window.innerWidth - 24, rect.left + rect.width / 2))}px`;
      chip.style.top = `${Math.max(24, rect.top)}px`;
      chip.dataset.visible = "1";
    },
    hideChip() {
      chip.dataset.visible = "0";
    },
  };
}
