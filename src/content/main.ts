/**
 * Content script entry. Registered on every http(s) page when in-page buttons are on, or only on
 * Erome otherwise. Guards against double injection because the worker also injects it into tabs
 * that were already open.
 */
import type { LayoutTarget } from "../shared/layouts/types";
import { request } from "../shared/messaging";
import type { ContentSettings, SendOutcome } from "../shared/models";
import { isDirectMediaUrl, isSupportedSiteUrl } from "../shared/sites/supported";
import { parseHttpUrl } from "../shared/url";
import { isErome, onEromeAlbumPage, openEromeSelector, placeEromeAlbumIcons } from "./erome";
import { describeOutcome, sendWithFeedback } from "./feedback";
import { LayoutButtons } from "./layout-buttons";
import { ensureOverlay } from "./overlay";

declare global {
  var __coveDownloaderHelperInjected: boolean | undefined;
}

if (!globalThis.__coveDownloaderHelperInjected) {
  globalThis.__coveDownloaderHelperInjected = true;
  start();
}

function start(): void {
  let settings: ContentSettings = {
    inPageButton: "off",
    stylizedButtons: false,
    poolMode: false,
    supportedHosts: [],
    coveOrigin: "",
  };
  let hoverLink: HTMLAnchorElement | null = null;
  let layoutRequest = 0;

  const overlay = ensureOverlay();
  const toast = (text: string, error = false) => overlay.toast(text, error);
  const layouts = new LayoutButtons({
    onClick(target: LayoutTarget, button: HTMLButtonElement) {
      void sendWithFeedback({ url: location.href, entity: target.entity, title: document.title }, "layout", {
        button,
        toast,
      });
    },
  });

  function fabTitle(): string {
    return settings.poolMode ? "Add this page to the Cove pool" : "Send this page to Cove";
  }

  function shouldShowFab(): boolean {
    if (onEromeAlbumPage()) return true;
    if (settings.inPageButton === "off") return false;
    if (location.protocol !== "http:" && location.protocol !== "https:") return false;
    if (settings.coveOrigin && location.origin === settings.coveOrigin) return false;
    if (settings.inPageButton === "all") return true;
    return isDirectMediaUrl(location.href) || isSupportedSiteUrl(location.href, settings.supportedHosts);
  }

  function applyVisibility(): void {
    overlay.setFabVisible(shouldShowFab());
    overlay.fab.title = fabTitle();
    overlay.fab.setAttribute("aria-label", fabTitle());
  }

  function refreshLayoutButtons(): void {
    const requestId = ++layoutRequest;
    if (!settings.stylizedButtons) {
      layouts.clear();
      return;
    }
    request("layout:targets", { url: location.href })
      .then(({ targets }) => {
        if (requestId !== layoutRequest) return;
        layouts.setTargets(settings.stylizedButtons ? targets : []);
      })
      .catch(() => {
        if (requestId === layoutRequest) layouts.clear();
      });
  }

  function loadSettings(): void {
    request("content:settings", {})
      .then((next) => {
        settings = next;
      })
      .catch(() => {})
      .finally(() => {
        applyVisibility();
        refreshLayoutButtons();
      });
  }

  overlay.fab.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const album = onEromeAlbumPage();
    if (album) {
      void openEromeSelector(album, toast);
      return;
    }
    void sendWithFeedback({ url: location.href, title: document.title }, "fab", { button: overlay.fab, toast });
  });

  overlay.chip.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const href = hoverLink?.href;
    if (href)
      void sendWithFeedback({ url: href, title: hoverLink?.textContent?.trim().slice(0, 200) || undefined }, "chip", {
        button: overlay.chip,
        toast,
      });
  });

  document.addEventListener(
    "pointerover",
    (event) => {
      if (!shouldShowFab() || isEditable(event.target)) {
        overlay.hideChip();
        return;
      }
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      if (!parseHttpUrl(anchor.href)) {
        overlay.hideChip();
        return;
      }
      hoverLink = anchor;
      overlay.showChipAt(anchor.getBoundingClientRect());
    },
    true,
  );

  document.addEventListener(
    "pointerout",
    (event) => {
      const related = event.relatedTarget as Node | null;
      if (related && (overlay.chip === related || overlay.chip.contains(related))) return;
      if (related && hoverLink?.contains(related)) return;
      overlay.hideChip();
      hoverLink = null;
    },
    true,
  );

  const onUrlChanged = () => {
    overlay.hideChip();
    hoverLink = null;
    applyVisibility();
    layouts.clear();
    refreshLayoutButtons();
    requestAnimationFrame(() => placeEromeAlbumIcons(toast));
  };
  window.addEventListener("popstate", onUrlChanged);
  for (const method of ["pushState", "replaceState"] as const) {
    try {
      const original = history[method];
      history[method] = function patched(this: History, ...args: Parameters<History["pushState"]>) {
        const result = original.apply(this, args);
        onUrlChanged();
        return result;
      };
    } catch {
      // Some pages freeze history.
    }
  }

  chrome.runtime.onMessage.addListener((message: unknown) => {
    if (!message || typeof message !== "object") return;
    const typed = message as { type?: string; url?: string; outcome?: SendOutcome };
    if (typed.type === "content:url-changed" && typed.url === location.href) onUrlChanged();
    if (typed.type === "content:send-result" && typed.outcome) {
      const summary = describeOutcome(typed.outcome);
      toast(summary.text, summary.tone === "error");
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.settings) loadSettings();
  });

  if (isErome()) {
    placeEromeAlbumIcons(toast);
    let queued = false;
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        placeEromeAlbumIcons(toast);
      });
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  loadSettings();
}

function isEditable(target: EventTarget | null): boolean {
  return !!(target as Element | null)?.closest?.('input, textarea, select, [contenteditable="true"]');
}
