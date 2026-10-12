/**
 * Site-styled download buttons described by `.lay` files. Each button is its own shadow host so
 * site CSS cannot restyle it. Placement is re-run on DOM changes, URL changes, resizes, and theme
 * changes, and is idempotent: a button that is already in the right slot is only re-synced.
 */
import type { LayoutColors, LayoutTarget } from "../shared/layouts/types";
import { STATE_ICON_STYLE, stateIconSvg } from "./icons";

const HOST_ATTR = "data-cove-layout-id";
const REPLACED_ATTR = "data-cove-replaced";
const REPLACED_DISPLAY_ATTR = "data-cove-replaced-display";

const BUTTON_STYLE = `
  :host { display: inline-flex; vertical-align: middle; margin-inline: 6px; }
  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    margin: 0;
    appearance: none;
    border-style: solid;
    border-width: 1px;
    background: var(--cove-bg);
    color: var(--cove-text);
    border-color: var(--cove-border);
    font-family: "Segoe UI", system-ui, sans-serif;
    font-weight: 600;
    line-height: 1;
    cursor: pointer;
    white-space: nowrap;
    transition: background-color 0.15s, opacity 0.15s;
  }
  button:hover { background: var(--cove-hover); }
  button[data-hover="0"]:hover { background: var(--cove-bg); }
  button:disabled { opacity: 0.85; }
  svg { fill: var(--cove-icon); color: var(--cove-icon); flex: 0 0 auto; }
  button[data-size="small"] { height: 28px; font-size: 12px; }
  button[data-size="medium"] { height: 36px; font-size: 14px; }
  button[data-size="large"] { height: 44px; font-size: 16px; }
  button[data-size="small"][data-text="1"] { padding: 0 8px; gap: 4px; }
  button[data-size="medium"][data-text="1"] { padding: 0 12px; gap: 6px; }
  button[data-size="large"][data-text="1"] { padding: 0 16px; gap: 8px; }
  button[data-size="small"][data-text="0"] { width: 28px; padding: 0; }
  button[data-size="medium"][data-text="0"] { width: 36px; padding: 0; }
  button[data-size="large"][data-text="0"] { width: 44px; padding: 0; }
  button[data-size="small"] svg { width: 14px; height: 14px; }
  button[data-size="small"][data-text="0"] svg { width: 18px; height: 18px; }
  button[data-size="medium"] svg { width: 16px; height: 16px; }
  button[data-size="large"] svg { width: 20px; height: 20px; }
  button[data-shape="square"] { border-radius: 0; }
  button[data-shape="rounded"] { border-radius: 8px; }
  button[data-shape="pill"] { border-radius: 999px; }
  button[data-shape="pill"][data-text="1"] { padding-inline: 18px; }
  ${STATE_ICON_STYLE}
`;

const PRESETS = {
  small: { height: 28, font: 12, icon: 14, pad: 8, gap: 4 },
  medium: { height: 36, font: 14, icon: 16, pad: 12, gap: 6 },
  large: { height: 44, font: 16, icon: 20, pad: 16, gap: 8 },
} as const;

function setStyle(node: HTMLElement | SVGElement | null, prop: string, value: string): void {
  if (node && node.style.getPropertyValue(prop) !== value) node.style.setProperty(prop, value);
}

function pageLooksDark(): boolean {
  const node = document.body || document.documentElement;
  const prefersDark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;
  if (!node) return prefersDark();
  const match = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/.exec(
    getComputedStyle(node).backgroundColor || "",
  );
  if (!match) return prefersDark();
  const alpha = match[4] === undefined ? 1 : Number(match[4]);
  if (!Number.isFinite(alpha) || alpha === 0) return prefersDark();
  const luma = 0.2126 * Number(match[1]) + 0.7152 * Number(match[2]) + 0.0722 * Number(match[3]);
  return luma < 140;
}

function safeQuery(selector: string | undefined): Element | null {
  if (!selector) return null;
  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
}

function layoutIsDark(theme: LayoutTarget["theme"]): boolean {
  const dark = !!safeQuery(theme?.dark);
  const light = !!safeQuery(theme?.light);
  if (dark && !light) return true;
  if (light && !dark) return false;
  return pageLooksDark();
}

function colorsFor(target: LayoutTarget): LayoutColors {
  const button = target.button;
  const mode = layoutIsDark(target.theme) ? button.dark : button.light;
  return { ...button.colors, ...mode };
}

function isFixed(target: LayoutTarget): boolean {
  return Number.isInteger(target.anchor.x) && Number.isInteger(target.anchor.y);
}

function hostPlaced(host: HTMLElement | null, anchor: Element, insert: string): boolean {
  if (!host || !host.isConnected || !anchor.isConnected) return false;
  if (insert === "beforeend" || insert === "afterbegin") return host.parentElement === anchor;
  if (insert === "beforebegin") return host.nextElementSibling === anchor;
  if (insert === "afterend") return host.previousElementSibling === anchor;
  return false;
}

function alignWithFloatedItem(host: HTMLElement): void {
  const parent = host.parentElement;
  const sibling = host.previousElementSibling || host.nextElementSibling;
  if (!parent || parent.tagName !== "UL" || !sibling || sibling.tagName !== "LI") return;
  host.style.display = "flex";
  host.style.alignItems = "center";
  host.style.justifyContent = "center";
  host.style.margin = "0";
  const height = sibling.getBoundingClientRect().height;
  if (height > 0) host.style.height = `${Math.round(height)}px`;
  const floated = getComputedStyle(sibling).float;
  if (floated === "left" || floated === "right") host.style.float = floated;
}

function dropMarginWhenRowHasGap(host: HTMLElement, parentStyle: CSSStyleDeclaration): void {
  const gap = parentStyle.columnGap || parentStyle.gap;
  if (!gap || gap === "normal" || gap === "0px") return;
  host.style.margin = "0";
}

/** Make the host behave like a sibling control in whatever row layout the site uses. */
function stayInButtonRow(host: HTMLElement): void {
  const parent = host.parentElement;
  if (!parent) return;
  const parentStyle = getComputedStyle(parent);
  if (parent.tagName === "UL") {
    alignWithFloatedItem(host);
    if (parentStyle.display === "flex" || parentStyle.display === "inline-flex") {
      host.style.float = "";
      host.style.flex = "0 0 auto";
      host.style.alignSelf = "center";
      dropMarginWhenRowHasGap(host, parentStyle);
    }
    return;
  }
  if (parentStyle.display === "flex" || parentStyle.display === "inline-flex") {
    host.style.flex = "0 0 auto";
    host.style.alignSelf = "center";
    dropMarginWhenRowHasGap(host, parentStyle);
    return;
  }
  if ((parentStyle.float === "left" || parentStyle.float === "right") && parent.childElementCount <= 6) {
    parent.style.display = "flex";
    parent.style.alignItems = "center";
    parent.style.flexWrap = "nowrap";
    host.style.flex = "0 0 auto";
    host.style.alignSelf = "center";
    return;
  }
  alignWithFloatedItem(host);
}

function sizeSibling(host: HTMLElement): Element | null {
  const parent = host.parentElement;
  if (!parent) return null;
  const candidates: Element[] = [];
  for (const el of parent.children) {
    if (el === host || el.hasAttribute(REPLACED_ATTR)) continue;
    if (getComputedStyle(el).display === "none") continue;
    const rect = el.getBoundingClientRect();
    if (rect.height < 16 || rect.height > 80 || rect.width < 8) continue;
    candidates.push(el);
  }
  return (
    candidates.find((el) => el.tagName === "BUTTON" || el.tagName === "A" || el.querySelector("button, a")) ??
    candidates[0] ??
    null
  );
}

function rowStacks(host: HTMLElement): boolean {
  const direction = host.parentElement ? getComputedStyle(host.parentElement).flexDirection : "";
  return direction === "column" || direction === "column-reverse";
}

export interface LayoutButtonHandlers {
  onClick(target: LayoutTarget, button: HTMLButtonElement): void;
}

export class LayoutButtons {
  private targets: LayoutTarget[] = [];
  private observer: MutationObserver | null = null;
  private sizeObserver: ResizeObserver | null = null;
  private readonly fitWatch = new WeakMap<HTMLElement, Set<Element>>();
  private queued = false;
  private again = false;
  private listening = false;

  constructor(private readonly handlers: LayoutButtonHandlers) {}

  setTargets(targets: LayoutTarget[]): void {
    this.targets = targets;
    if (!targets.length) {
      this.removeAll();
      this.stopObserving();
      return;
    }
    this.startObserving();
    this.place();
  }

  clear(): void {
    this.setTargets([]);
  }

  schedule(): void {
    if (this.queued) {
      this.again = true;
      return;
    }
    this.queued = true;
    requestAnimationFrame(() => {
      this.queued = false;
      this.place();
      if (this.again) {
        this.again = false;
        this.schedule();
      }
    });
  }

  private startObserving(): void {
    if (!this.observer && document.documentElement) {
      this.observer = new MutationObserver(() => this.schedule());
      this.observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class"],
      });
      if (document.body)
        this.observer.observe(document.body, { attributes: true, attributeFilter: ["class", "style"] });
      if (document.head) {
        this.observer.observe(document.head, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["href", "data-href"],
        });
      }
    }
    if (!this.listening) {
      this.listening = true;
      window.addEventListener("resize", () => this.schedule());
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => this.schedule());
    }
  }

  private stopObserving(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.sizeObserver?.disconnect();
    this.sizeObserver = null;
  }

  private findHost(id: string): HTMLElement | null {
    for (const node of allHosts()) if (node.getAttribute(HOST_ATTR) === id) return node;
    return null;
  }

  private removeAll(): void {
    for (const node of allHosts()) node.remove();
    restoreReplaced();
  }

  private place(): void {
    const live = new Set<string>();
    for (const target of this.targets) {
      const anchor = safeQuery(target.anchor.selector);
      if (!anchor) {
        this.findHost(target.id)?.remove();
        restoreReplaced(target.id);
        continue;
      }
      live.add(target.id);
      if (target.anchor.replace) hideReplaced(anchor as HTMLElement, target.id);
      else restoreReplaced(target.id);

      const existing = this.findHost(target.id);
      if (existing && hostPlaced(existing, anchor, target.anchor.insert)) {
        this.sync(existing, target);
        this.watchRow(existing, target);
        continue;
      }
      existing?.remove();
      const host = this.create(target);
      try {
        anchor.insertAdjacentElement(target.anchor.insert, host);
        if (!isFixed(target)) stayInButtonRow(host);
        this.sync(host, target);
        this.watchRow(host, target);
      } catch {
        host.remove();
      }
    }
    for (const node of allHosts()) {
      const id = node.getAttribute(HOST_ATTR) ?? "";
      if (live.has(id)) continue;
      node.remove();
      restoreReplaced(id);
    }
  }

  private create(target: LayoutTarget): HTMLElement {
    const host = document.createElement("span");
    host.setAttribute(HOST_ATTR, target.id);
    const root = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = BUTTON_STYLE;
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.size = target.button.size;
    button.dataset.text = target.button.showText ? "1" : "0";
    button.dataset.shape = target.button.shape;
    button.dataset.state = "idle";
    button.setAttribute("aria-label", target.button.label);
    button.title = target.button.label;
    button.appendChild(stateIconSvg());
    if (target.button.showText) {
      const label = document.createElement("span");
      label.textContent = target.button.label;
      button.appendChild(label);
    }
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.handlers.onClick(target, button);
    });
    root.append(style, button);
    return host;
  }

  private sync(host: HTMLElement, target: LayoutTarget): void {
    const button = host.shadowRoot?.querySelector("button");
    if (!button) return;
    const spec = target.button;
    const colors = colorsFor(target);
    setStyle(host, "--cove-bg", colors.background);
    setStyle(host, "--cove-text", colors.text);
    setStyle(host, "--cove-icon", colors.icon);
    setStyle(host, "--cove-border", colors.border);
    setStyle(host, "--cove-hover", spec.hover ? colors.hoverBackground : colors.background);
    button.dataset.hover = spec.hover ? "1" : "0";

    const preset = PRESETS[spec.size];
    const fixed = isFixed(target);
    const custom = spec.scale !== 1 || !!spec.height || !!spec.width || spec.fit || fixed;
    if (!custom) return;

    let height = spec.height ?? preset.height;
    let width = spec.width ?? 0;
    let stretch = false;
    if (spec.fit && !fixed) {
      const sibling = sizeSibling(host);
      if (sibling) {
        const rect = sibling.getBoundingClientRect();
        if (rect.height >= 16) height = Math.round(rect.height);
        stretch = rowStacks(host);
        if (!spec.width && rect.width >= 16 && !stretch && !spec.showText && rect.width <= 160)
          width = Math.round(rect.width);
      }
    }
    height = Math.max(16, Math.min(160, Math.round(height * spec.scale)));
    setStyle(button, "height", `${height}px`);
    setStyle(button, "font-size", `${Math.max(10, Math.round(preset.font * spec.scale))}px`);
    const icon = Math.max(10, Math.round((spec.showText ? preset.icon : Math.max(preset.icon, 18)) * spec.scale));
    const svg = button.querySelector("svg");
    setStyle(svg, "width", `${icon}px`);
    setStyle(svg, "height", `${icon}px`);
    if (spec.showText) {
      setStyle(button, "padding", `0 ${Math.round(preset.pad * spec.scale)}px`);
      setStyle(button, "gap", `${Math.round(preset.gap * spec.scale)}px`);
    }
    if (stretch && !spec.width) {
      setStyle(host, "align-self", "stretch");
      setStyle(host, "width", "100%");
      setStyle(button, "width", "100%");
    } else if (width) {
      if (host.style.alignSelf === "stretch") host.style.alignSelf = "center";
      host.style.removeProperty("width");
      setStyle(button, "width", `${Math.max(16, Math.min(480, Math.round(width * spec.scale)))}px`);
    } else if (!spec.width) {
      if (host.style.alignSelf === "stretch") host.style.alignSelf = "center";
      host.style.removeProperty("width");
      button.style.removeProperty("width");
    }
    if (fixed) {
      setStyle(host, "position", "fixed");
      setStyle(host, "left", `${target.anchor.x}px`);
      setStyle(host, "top", `${target.anchor.y}px`);
      setStyle(host, "z-index", "2147483646");
      setStyle(host, "margin", "0");
    }
  }

  /** Fitted buttons follow their row siblings when the window or the side panel changes size. */
  private watchRow(host: HTMLElement, target: LayoutTarget): void {
    if (!window.ResizeObserver || !host.parentElement || !target.button.fit || isFixed(target)) return;
    this.sizeObserver ??= new ResizeObserver(() => this.schedule());
    const next = new Set<Element>();
    for (const el of host.parentElement.children) {
      if (el === host || el.hasAttribute(REPLACED_ATTR)) continue;
      next.add(el);
      this.sizeObserver.observe(el);
    }
    for (const el of this.fitWatch.get(host) ?? []) if (!next.has(el)) this.sizeObserver.unobserve(el);
    this.fitWatch.set(host, next);
  }
}

/** Every layout-button host currently in the page. */
function allHosts(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(`[${HOST_ATTR}]`)];
}

function hideReplaced(anchor: HTMLElement, id: string): void {
  if (!anchor.hasAttribute(REPLACED_DISPLAY_ATTR))
    anchor.setAttribute(REPLACED_DISPLAY_ATTR, anchor.style.display || "");
  anchor.setAttribute(REPLACED_ATTR, id);
  anchor.style.setProperty("display", "none", "important");
}

function restoreReplaced(id?: string): void {
  for (const node of document.querySelectorAll<HTMLElement>(`[${REPLACED_ATTR}]`)) {
    if (id && node.getAttribute(REPLACED_ATTR) !== id) continue;
    const previous = node.getAttribute(REPLACED_DISPLAY_ATTR);
    node.style.removeProperty("display");
    if (previous) node.style.display = previous;
    node.removeAttribute(REPLACED_ATTR);
    node.removeAttribute(REPLACED_DISPLAY_ATTR);
  }
}
