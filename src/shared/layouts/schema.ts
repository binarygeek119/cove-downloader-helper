/** Declarative site-button layouts. Data only: no remote code, no free-form CSS. */
import { hostMatchesSite, parseHttpUrl } from "../url";
import {
  LAYOUT_INSERTS,
  LAYOUT_KINDS,
  LAYOUT_SHAPES,
  LAYOUT_SIZES,
  LAYOUT_VERSION,
  type LayoutColors,
  type LayoutEntity,
  type LayoutFile,
  type LayoutKind,
  type LayoutTarget,
  type LayoutTheme,
  type RawLayoutTarget,
} from "./types";

const LAYOUT_COLOR_KEYS = ["background", "text", "icon", "border", "hoverBackground"] as const;
const CLEAR_COLOR_KEYS: readonly string[] = ["background", "border", "hoverBackground"];
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

type ColorKey = (typeof LAYOUT_COLOR_KEYS)[number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (list as readonly string[]).includes(value);
}

export function isLayoutColor(key: string, value: unknown): boolean {
  if (typeof value !== "string") return false;
  const color = value.trim();
  if (HEX_COLOR.test(color)) return true;
  return CLEAR_COLOR_KEYS.includes(key) && color.toLowerCase() === "transparent";
}

function normalizeColor(key: string, value: unknown): string {
  const color = String(value).trim();
  if (CLEAR_COLOR_KEYS.includes(key) && color.toLowerCase() === "transparent") return "transparent";
  return color;
}

export function layoutKindEntity(kind: LayoutKind): LayoutEntity {
  if (kind === "video") return "Video";
  if (kind === "story") return "Text";
  return "Image";
}

/**
 * Accepts a conservative subset of CSS selectors: type, class, id, attribute, and pseudo selectors
 * joined by descendant, child, and sibling combinators, as a comma list. Rejects anything that
 * could smuggle style rules, markup, or URLs through a layout file.
 */
export function isPlainCssSelector(input: unknown, depth = 0): boolean {
  if (typeof input !== "string") return false;
  const selector = input.trim();
  if (!selector || selector.length > 300) return false;
  if (depth > 3) return false;
  if (/[\n\r<{}\\@;]|\/\*|\*\/|url\s*\(|expression\s*\(|javascript\s*:/i.test(selector)) return false;

  let i = 0;
  const peek = () => selector.charAt(i);
  const eof = () => i >= selector.length;
  const isIdentStart = (ch: string) => /[A-Za-z_-]/.test(ch);
  const isIdentChar = (ch: string) => /[A-Za-z0-9_-]/.test(ch);

  function consumeWhitespace(): boolean {
    const start = i;
    while (!eof() && /\s/.test(peek())) i += 1;
    return i > start;
  }

  function consumeIdent(): boolean {
    if (!isIdentStart(peek())) return false;
    while (!eof() && isIdentChar(peek())) i += 1;
    return true;
  }

  function consumeQuoted(quote: string): boolean {
    i += 1;
    while (!eof() && peek() !== quote) {
      if (peek() === "\\") return false;
      i += 1;
    }
    if (eof()) return false;
    i += 1;
    return true;
  }

  function consumeAttribute(): boolean {
    if (peek() !== "[") return false;
    i += 1;
    consumeWhitespace();
    if (!consumeIdent()) return false;
    consumeWhitespace();
    if (peek() === "]") {
      i += 1;
      return true;
    }
    if (/[~|^$*]/.test(peek())) i += 1;
    if (peek() !== "=") return false;
    i += 1;
    consumeWhitespace();
    if (peek() === '"' || peek() === "'") {
      if (!consumeQuoted(peek())) return false;
    } else if (!consumeIdent()) {
      return false;
    }
    consumeWhitespace();
    if (/[iIsS]/.test(peek())) {
      i += 1;
      consumeWhitespace();
    }
    if (peek() !== "]") return false;
    i += 1;
    return true;
  }

  function consumePseudo(): boolean {
    if (peek() !== ":") return false;
    i += 1;
    if (peek() === ":") i += 1;
    if (!consumeIdent()) return false;
    if (peek() !== "(") return true;
    i += 1;
    let depthCount = 1;
    const start = i;
    while (!eof() && depthCount > 0) {
      const ch = peek();
      if (ch === "(") depthCount += 1;
      else if (ch === ")") depthCount -= 1;
      if (depthCount > 0) i += 1;
    }
    if (depthCount !== 0) return false;
    const inner = selector.slice(start, i).trim();
    i += 1;
    if (!inner) return false;
    if (/^[0-9nN+\-\s]+$/.test(inner) || /^[A-Za-z_-][A-Za-z0-9_-]*$/.test(inner)) return true;
    return isPlainCssSelector(inner, depth + 1);
  }

  function consumeCompound(): boolean {
    let saw = false;
    if (peek() === "*") {
      i += 1;
      saw = true;
    } else if (isIdentStart(peek())) {
      consumeIdent();
      saw = true;
    }
    while (!eof()) {
      const ch = peek();
      if (ch === "#" || ch === ".") {
        i += 1;
        if (!consumeIdent()) return false;
        saw = true;
      } else if (ch === "[") {
        if (!consumeAttribute()) return false;
        saw = true;
      } else if (ch === ":") {
        if (!consumePseudo()) return false;
        saw = true;
      } else {
        break;
      }
    }
    return saw;
  }

  function consumeComplex(): boolean {
    consumeWhitespace();
    if (!consumeCompound()) return false;
    while (!eof()) {
      const beforeSpace = i;
      const sawSpace = consumeWhitespace();
      if (eof() || peek() === ",") return true;
      if (peek() === ">" || peek() === "+" || peek() === "~") {
        i += 1;
        consumeWhitespace();
        if (!consumeCompound()) return false;
        continue;
      }
      if (!sawSpace || !consumeCompound()) {
        i = beforeSpace;
        return false;
      }
    }
    return true;
  }

  if (!consumeComplex()) return false;
  while (peek() === ",") {
    i += 1;
    if (!consumeComplex()) return false;
  }
  consumeWhitespace();
  return eof();
}

function isPixels(value: unknown, min: number, max: number): value is number {
  return Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
}

function isScale(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0.5 && value <= 2;
}

function validateModeColors(errors: string[], where: string, modeColors: unknown) {
  if (modeColors === undefined) return;
  if (!isRecord(modeColors)) {
    errors.push(`${where} must be an object`);
    return;
  }
  for (const key of ["background", "text", "icon"]) {
    if (!isLayoutColor(key, modeColors[key])) errors.push(`${where}.${key} must be a color`);
  }
  for (const key of ["border", "hoverBackground"]) {
    if (modeColors[key] !== undefined && !isLayoutColor(key, modeColors[key])) {
      errors.push(`${where}.${key} must be a color`);
    }
  }
}

function validateTheme(errors: string[], theme: unknown) {
  if (theme === undefined) return;
  if (!isRecord(theme)) {
    errors.push("theme must be an object");
    return;
  }
  if (theme.dark === undefined && theme.light === undefined) errors.push("theme needs a dark or light selector");
  for (const key of ["dark", "light"]) {
    if (theme[key] === undefined) continue;
    if (typeof theme[key] !== "string" || !isPlainCssSelector(theme[key])) {
      errors.push(`theme.${key} must be a plain CSS selector`);
    }
  }
}

/** Every problem in a raw layout file. An empty list means the file is usable. */
export function validateLayout(data: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(data)) return ["layout must be an object"];
  if (data.version !== LAYOUT_VERSION) errors.push("version must be 1");
  validateTheme(errors, data.theme);
  if (!Array.isArray(data.hosts) || !data.hosts.length) {
    errors.push("hosts must be a non-empty array");
  } else {
    data.hosts.forEach((host, index) => {
      if (typeof host !== "string" || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host) || host.includes("..")) {
        errors.push(`hosts[${index}] must be a hostname`);
      }
    });
  }
  if (!Array.isArray(data.targets) || !data.targets.length) {
    errors.push("targets must be a non-empty array");
    return errors;
  }

  const ids = new Set<string>();
  data.targets.forEach((target: unknown, index: number) => {
    const where = `targets[${index}]`;
    if (!isRecord(target)) {
      errors.push(`${where} must be an object`);
      return;
    }
    if (typeof target.id !== "string" || !/^[a-z0-9_-]+$/i.test(target.id)) {
      errors.push(`${where}.id must be a short id`);
    } else if (ids.has(target.id)) {
      errors.push(`${where}.id is duplicated`);
    } else {
      ids.add(target.id);
    }
    if (!isOneOf(LAYOUT_KINDS, target.kind)) errors.push(`${where}.kind must be video, image, gif, or story`);
    if (typeof target.path !== "string" || !target.path.startsWith("/") || /[?#\s]/.test(target.path)) {
      errors.push(`${where}.path must be a URL path prefix`);
    }
    const anchor = target.anchor;
    if (!isRecord(anchor)) {
      errors.push(`${where}.anchor is required`);
    } else {
      if (typeof anchor.selector !== "string" || !anchor.selector.trim()) {
        errors.push(`${where}.anchor.selector is empty`);
      } else if (!isPlainCssSelector(anchor.selector)) {
        errors.push(`${where}.anchor.selector is not a plain CSS selector`);
      }
      if (!isOneOf(LAYOUT_INSERTS, anchor.insert)) errors.push(`${where}.anchor.insert is invalid`);
      if (anchor.replace !== undefined && typeof anchor.replace !== "boolean") {
        errors.push(`${where}.anchor.replace must be true or false`);
      }
      if (anchor.replace === true && anchor.insert !== "beforebegin" && anchor.insert !== "afterend") {
        errors.push(`${where}.anchor.replace needs insert beforebegin or afterend`);
      }
      if (anchor.x !== undefined || anchor.y !== undefined) {
        if (!isPixels(anchor.x, -4000, 8000) || !isPixels(anchor.y, -4000, 8000)) {
          errors.push(`${where}.anchor.x and anchor.y must both be pixel offsets`);
        }
      }
    }
    const button = target.button;
    if (!isRecord(button)) {
      errors.push(`${where}.button is required`);
      return;
    }
    if (!isOneOf(LAYOUT_SIZES, button.size)) errors.push(`${where}.button.size must be small, medium, or large`);
    if (button.height !== undefined && !isPixels(button.height, 16, 160)) {
      errors.push(`${where}.button.height must be a pixel size from 16 to 160`);
    }
    if (button.width !== undefined && !isPixels(button.width, 16, 480)) {
      errors.push(`${where}.button.width must be a pixel size from 16 to 480`);
    }
    if (button.scale !== undefined && !isScale(button.scale)) {
      errors.push(`${where}.button.scale must be a number from 0.5 to 2`);
    }
    if (button.fit !== undefined && typeof button.fit !== "boolean") {
      errors.push(`${where}.button.fit must be true or false`);
    }
    if (button.hover !== undefined && typeof button.hover !== "boolean") {
      errors.push(`${where}.button.hover must be true or false`);
    }
    if (typeof button.showText !== "boolean") errors.push(`${where}.button.showText must be true or false`);
    if (typeof button.label !== "string" || !button.label.trim() || button.label.length > 80) {
      errors.push(`${where}.button.label must be short text`);
    }
    if (!isOneOf(LAYOUT_SHAPES, button.shape)) errors.push(`${where}.button.shape must be square, rounded, or pill`);
    const colors = button.colors;
    if (!isRecord(colors)) {
      errors.push(`${where}.button.colors is required`);
      return;
    }
    for (const key of LAYOUT_COLOR_KEYS) {
      if (!isLayoutColor(key, colors[key])) {
        const allowed = CLEAR_COLOR_KEYS.includes(key) ? "#rgb, #rrggbb, or transparent" : "#rgb or #rrggbb";
        errors.push(`${where}.button.colors.${key} must be ${allowed}`);
      }
    }
    validateModeColors(errors, `${where}.button.light`, button.light);
    validateModeColors(errors, `${where}.button.dark`, button.dark);
  });

  return errors;
}

export function isLayoutFile(data: unknown): data is LayoutFile {
  return validateLayout(data).length === 0;
}

function sanitizeColors(colors: Record<ColorKey, string>): LayoutColors {
  return {
    background: normalizeColor("background", colors.background),
    text: normalizeColor("text", colors.text),
    icon: normalizeColor("icon", colors.icon),
    border: normalizeColor("border", colors.border),
    hoverBackground: normalizeColor("hoverBackground", colors.hoverBackground),
  };
}

function sanitizeModeColors(
  modeColors: Partial<LayoutColors> | undefined,
  base: LayoutColors,
): LayoutColors | undefined {
  if (!modeColors) return undefined;
  return {
    background: normalizeColor("background", modeColors.background),
    text: normalizeColor("text", modeColors.text),
    icon: normalizeColor("icon", modeColors.icon),
    border: normalizeColor("border", modeColors.border ?? base.border),
    hoverBackground: normalizeColor("hoverBackground", modeColors.hoverBackground ?? base.hoverBackground),
  };
}

function sanitizeTheme(theme: LayoutTheme | undefined): LayoutTheme | undefined {
  if (!theme) return undefined;
  const out: LayoutTheme = {};
  if (typeof theme.dark === "string") out.dark = theme.dark.trim();
  if (typeof theme.light === "string") out.light = theme.light.trim();
  return out.dark || out.light ? out : undefined;
}

function sanitizeTarget(target: RawLayoutTarget, theme: LayoutTheme | undefined): LayoutTarget {
  const button = target.button;
  const base = sanitizeColors(button.colors);
  const cleaned: LayoutTarget = {
    id: target.id,
    kind: target.kind,
    entity: layoutKindEntity(target.kind),
    path: target.path,
    anchor: {
      selector: target.anchor.selector.trim(),
      insert: target.anchor.insert,
      replace: target.anchor.replace === true,
    },
    button: {
      size: button.size,
      showText: button.showText,
      label: button.label.trim(),
      shape: button.shape,
      scale: isScale(button.scale) ? button.scale : 1,
      fit: button.fit === true,
      hover: button.hover !== false,
      colors: base,
    },
  };
  if (isPixels(target.anchor.x, -4000, 8000) && isPixels(target.anchor.y, -4000, 8000)) {
    cleaned.anchor.x = target.anchor.x;
    cleaned.anchor.y = target.anchor.y;
  }
  if (isPixels(button.height, 16, 160)) cleaned.button.height = button.height;
  if (isPixels(button.width, 16, 480)) cleaned.button.width = button.width;
  const light = sanitizeModeColors(button.light, base);
  const dark = sanitizeModeColors(button.dark, base);
  if (light) cleaned.button.light = light;
  if (dark) cleaned.button.dark = dark;
  const cleanedTheme = sanitizeTheme(theme);
  if (cleanedTheme) cleaned.theme = cleanedTheme;
  return cleaned;
}

/**
 * Targets that apply to `pageUrl`. The host must match and `path` must be a prefix of the page
 * path. When several targets match, only those with the longest path are kept.
 */
export function matchLayoutTargets(layouts: readonly unknown[], pageUrl: string): LayoutTarget[] {
  const parsed = parseHttpUrl(pageUrl);
  if (!parsed) return [];
  const pathname = parsed.pathname || "/";
  const matches: { target: RawLayoutTarget; theme: LayoutTheme | undefined }[] = [];
  for (const layout of layouts) {
    if (!isLayoutFile(layout)) continue;
    if (!layout.hosts.some((site) => hostMatchesSite(parsed.hostname, site))) continue;
    for (const target of layout.targets) {
      if (pathname === target.path || pathname.startsWith(target.path)) matches.push({ target, theme: layout.theme });
    }
  }
  if (!matches.length) return [];
  const longest = Math.max(...matches.map((item) => item.target.path.length));
  return matches
    .filter((item) => item.target.path.length === longest)
    .map((item) => sanitizeTarget(item.target, item.theme));
}
