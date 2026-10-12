/** Erome album support: a hover icon on album thumbnails that opens the video selector in the panel. */
import { request } from "../shared/messaging";
import { eromeAlbumUrl, eromeVideosFromDocument, isEromeHost } from "../shared/sites/erome";

const ICON_ATTR = "data-cove-erome-album";
const STYLE_ID = "cove-erome-hover-style";

export function onEromeAlbumPage(): string {
  return eromeAlbumUrl(location.href);
}

export function isErome(): boolean {
  return isEromeHost(location.hostname);
}

async function collectAlbumVideos(albumUrl: string) {
  if (eromeAlbumUrl(location.href) === albumUrl) return eromeVideosFromDocument(document, location.href);
  const response = await fetch(albumUrl, { credentials: "include" });
  if (!response.ok) throw new Error("Could not open that album.");
  const html = await response.text();
  return eromeVideosFromDocument(new DOMParser().parseFromString(html, "text/html"), albumUrl);
}

/** Open the panel in a loading state, read the album, then hand the panel the video list. */
export async function openEromeSelector(
  albumUrl: string,
  toast: (text: string, error: boolean) => void,
): Promise<void> {
  let token: number;
  try {
    ({ token } = await request("erome:open-selector", { albumUrl }));
  } catch (error) {
    toast(error instanceof Error ? error.message : "Could not open the video selector.", true);
    return;
  }
  try {
    const videos = await collectAlbumVideos(albumUrl);
    await request("erome:selector-ready", { token, albumUrl, videos });
  } catch (error) {
    await request("erome:selector-ready", {
      token,
      albumUrl,
      videos: [],
      error: error instanceof Error ? error.message : "Could not read this album.",
    }).catch(() => {});
  }
}

function ensureHoverStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    [${ICON_ATTR}] { opacity: 0; pointer-events: none; transition: opacity 0.15s; }
    .album:hover [${ICON_ATTR}], .album-thumbnail-container:hover [${ICON_ATTR}] { opacity: 1; pointer-events: auto; }
  `;
  document.documentElement.appendChild(style);
}

function createHoverIcon(albumUrl: string, toast: (text: string, error: boolean) => void): HTMLElement {
  const host = document.createElement("span");
  host.setAttribute(ICON_ATTR, albumUrl);
  host.style.position = "absolute";
  host.style.right = "8px";
  host.style.bottom = "8px";
  host.style.zIndex = "30";
  const root = host.attachShadow({ mode: "open" });
  const iconUrl = chrome.runtime.getURL("icons/cove-icon-32.png");
  const style = document.createElement("style");
  style.textContent = `
    button {
      width: 32px; height: 32px; padding: 0; border-radius: 999px; border: 1px solid #2a2d38;
      background: #1e2028 url("${iconUrl}") center / 20px 20px no-repeat;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35); cursor: pointer;
    }
    button:hover { filter: brightness(1.1); }
  `;
  const button = document.createElement("button");
  button.type = "button";
  button.title = "Choose videos in this album";
  button.setAttribute("aria-label", "Choose videos in this album");
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void openEromeSelector(albumUrl, toast);
  });
  root.append(style, button);
  return host;
}

export function placeEromeAlbumIcons(toast: (text: string, error: boolean) => void): void {
  if (!isErome()) {
    for (const node of document.querySelectorAll(`[${ICON_ATTR}]`)) node.remove();
    return;
  }
  for (const box of document.querySelectorAll<HTMLElement>(".album-thumbnail-container")) {
    if (box.querySelector(`[${ICON_ATTR}]`)) continue;
    const link = box.querySelector<HTMLAnchorElement>("a.album-link[href]");
    const albumUrl = link ? eromeAlbumUrl(link.href) : "";
    if (!albumUrl) continue;
    ensureHoverStyle();
    if (getComputedStyle(box).position === "static") box.style.position = "relative";
    box.appendChild(createHoverIcon(albumUrl, toast));
  }
}
