/* Declarative site-button layouts. Data only: no remote code. */

const LAYOUT_VERSION = 1;
const LAYOUT_KINDS = ['video', 'image', 'gif', 'story'];
const LAYOUT_SIZES = ['small', 'medium', 'large'];
const LAYOUT_SHAPES = ['square', 'rounded', 'pill'];
const LAYOUT_INSERTS = ['beforebegin', 'afterbegin', 'beforeend', 'afterend'];
const LAYOUT_COLOR_KEYS = ['background', 'text', 'icon', 'border', 'hoverBackground'];
const LAYOUT_CLEAR_COLOR_KEYS = ['background', 'border', 'hoverBackground'];
const LAYOUT_HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function isLayoutColor(key, value) {
  if (typeof value !== 'string') return false;
  const color = value.trim();
  if (LAYOUT_HEX_COLOR.test(color)) return true;
  return LAYOUT_CLEAR_COLOR_KEYS.indexOf(key) !== -1 && color.toLowerCase() === 'transparent';
}

function normalizeLayoutColor(key, value) {
  const color = String(value).trim();
  if (LAYOUT_CLEAR_COLOR_KEYS.indexOf(key) !== -1 && color.toLowerCase() === 'transparent') {
    return 'transparent';
  }
  return color;
}

function layoutKindEntity(kind) {
  if (kind === 'video') return 'Video';
  if (kind === 'image' || kind === 'gif') return 'Image';
  if (kind === 'story') return 'Text';
  return '';
}

function isPlainCssSelector(input, depth) {
  if (typeof input !== 'string') return false;
  const selector = input.trim();
  if (!selector || selector.length > 300) return false;
  if (depth === undefined) depth = 0;
  if (depth > 3) return false;
  if (/[\n\r<{}\\@;]|\/\*|\*\/|url\s*\(|expression\s*\(|javascript\s*:/i.test(selector)) return false;

  let i = 0;

  function peek() {
    return selector[i];
  }

  function eof() {
    return i >= selector.length;
  }

  function isIdentStart(ch) {
    return !!ch && /[A-Za-z_\u00A0-\uFFFF-]/.test(ch);
  }

  function isIdentChar(ch) {
    return !!ch && /[A-Za-z0-9_\u00A0-\uFFFF-]/.test(ch);
  }

  function consumeIdent() {
    if (!isIdentStart(peek())) return false;
    i += 1;
    while (isIdentChar(peek())) i += 1;
    return true;
  }

  function consumeWhitespace() {
    let saw = false;
    while (peek() === ' ' || peek() === '\t') {
      saw = true;
      i += 1;
    }
    return saw;
  }

  function consumeAttribute() {
    if (peek() !== '[') return false;
    i += 1;
    consumeWhitespace();
    if (!consumeIdent()) return false;
    consumeWhitespace();
    if (peek() === ']') {
      i += 1;
      return true;
    }
    const two = selector.slice(i, i + 2);
    if (two === '~=' || two === '|=' || two === '^=' || two === '$=' || two === '*=') {
      i += 2;
    } else if (peek() === '=') {
      i += 1;
    } else {
      return false;
    }
    consumeWhitespace();
    if (peek() === '"' || peek() === "'") {
      const quote = peek();
      i += 1;
      while (!eof() && peek() !== quote) i += 1;
      if (peek() !== quote) return false;
      i += 1;
    } else if (!consumeIdent()) {
      return false;
    }
    consumeWhitespace();
    if (peek() === 'i' || peek() === 'I' || peek() === 's' || peek() === 'S') {
      i += 1;
      consumeWhitespace();
    }
    if (peek() !== ']') return false;
    i += 1;
    return true;
  }

  function consumePseudo() {
    if (peek() !== ':') return false;
    i += 1;
    if (peek() === ':') i += 1;
    if (!consumeIdent()) return false;
    if (peek() !== '(') return true;
    i += 1;
    let depthCount = 1;
    const start = i;
    while (!eof() && depthCount > 0) {
      const ch = peek();
      if (ch === '(') depthCount += 1;
      else if (ch === ')') depthCount -= 1;
      if (depthCount > 0) i += 1;
    }
    if (depthCount !== 0) return false;
    const inner = selector.slice(start, i).trim();
    i += 1;
    if (!inner) return false;
    if (/^[0-9nN+\-\s]+$/.test(inner) || /^[A-Za-z_-][A-Za-z0-9_-]*$/.test(inner)) return true;
    return isPlainCssSelector(inner, depth + 1);
  }

  function consumeCompound() {
    let saw = false;
    if (peek() === '*') {
      i += 1;
      saw = true;
    } else if (isIdentStart(peek())) {
      consumeIdent();
      saw = true;
    }
    while (!eof()) {
      const ch = peek();
      if (ch === '#' || ch === '.') {
        i += 1;
        if (!consumeIdent()) return false;
        saw = true;
      } else if (ch === '[') {
        if (!consumeAttribute()) return false;
        saw = true;
      } else if (ch === ':') {
        if (!consumePseudo()) return false;
        saw = true;
      } else {
        break;
      }
    }
    return saw;
  }

  function consumeComplex() {
    consumeWhitespace();
    if (!consumeCompound()) return false;
    while (!eof()) {
      const beforeSpace = i;
      const sawSpace = consumeWhitespace();
      if (eof() || peek() === ',') return true;
      if (peek() === '>' || peek() === '+' || peek() === '~') {
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
  while (peek() === ',') {
    i += 1;
    if (!consumeComplex()) return false;
  }
  consumeWhitespace();
  return eof();
}

function isLayoutScale(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0.5 && value <= 2;
}

function isLayoutPixels(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

function validateModeColors(errors, where, modeColors) {
  if (modeColors === undefined) return;
  if (!modeColors || typeof modeColors !== 'object' || Array.isArray(modeColors)) {
    errors.push(`${where} must be an object`);
    return;
  }
  ['background', 'text', 'icon'].forEach((key) => {
    if (!isLayoutColor(key, modeColors[key])) {
      errors.push(`${where}.${key} must be a color`);
    }
  });
  ['border', 'hoverBackground'].forEach((key) => {
    if (modeColors[key] !== undefined && !isLayoutColor(key, modeColors[key])) {
      errors.push(`${where}.${key} must be a color`);
    }
  });
}

function validateTheme(errors, theme) {
  if (theme === undefined) return;
  if (!theme || typeof theme !== 'object' || Array.isArray(theme)) {
    errors.push('theme must be an object');
    return;
  }
  if (theme.dark === undefined && theme.light === undefined) {
    errors.push('theme needs a dark or light selector');
  }
  ['dark', 'light'].forEach((key) => {
    if (theme[key] === undefined) return;
    if (typeof theme[key] !== 'string' || !isPlainCssSelector(theme[key])) {
      errors.push(`theme.${key} must be a plain CSS selector`);
    }
  });
}

function sanitizeModeColors(modeColors, base) {
  if (!modeColors) return undefined;
  return {
    background: normalizeLayoutColor('background', modeColors.background),
    text: normalizeLayoutColor('text', modeColors.text),
    icon: normalizeLayoutColor('icon', modeColors.icon),
    border: normalizeLayoutColor(
      'border',
      modeColors.border !== undefined ? modeColors.border : base.border
    ),
    hoverBackground: normalizeLayoutColor(
      'hoverBackground',
      modeColors.hoverBackground !== undefined ? modeColors.hoverBackground : base.hoverBackground
    ),
  };
}

function sanitizeTheme(theme) {
  if (!theme || typeof theme !== 'object') return undefined;
  const out = {};
  if (typeof theme.dark === 'string') out.dark = theme.dark.trim();
  if (typeof theme.light === 'string') out.light = theme.light.trim();
  return out.dark || out.light ? out : undefined;
}

function validateLayout(data) {
  const errors = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return ['layout must be an object'];
  }
  if (data.version !== LAYOUT_VERSION) {
    errors.push('version must be 1');
  }
  validateTheme(errors, data.theme);
  if (!Array.isArray(data.hosts) || !data.hosts.length) {
    errors.push('hosts must be a non-empty array');
  } else {
    data.hosts.forEach((host, index) => {
      if (typeof host !== 'string' || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host) || host.includes('..')) {
        errors.push(`hosts[${index}] must be a hostname`);
      }
    });
  }
  if (!Array.isArray(data.targets) || !data.targets.length) {
    errors.push('targets must be a non-empty array');
    return errors;
  }

  const ids = new Set();
  data.targets.forEach((target, index) => {
    const where = `targets[${index}]`;
    if (!target || typeof target !== 'object' || Array.isArray(target)) {
      errors.push(`${where} must be an object`);
      return;
    }
    if (typeof target.id !== 'string' || !/^[a-z0-9_-]+$/i.test(target.id)) {
      errors.push(`${where}.id must be a short id`);
    } else if (ids.has(target.id)) {
      errors.push(`${where}.id is duplicated`);
    } else {
      ids.add(target.id);
    }
    if (!LAYOUT_KINDS.includes(target.kind)) {
      errors.push(`${where}.kind must be video, image, gif, or story`);
    }
    if (typeof target.path !== 'string' || !target.path.startsWith('/') || /[?#\s]/.test(target.path)) {
      errors.push(`${where}.path must be a URL path prefix`);
    }
    const anchor = target.anchor;
    if (!anchor || typeof anchor !== 'object') {
      errors.push(`${where}.anchor is required`);
    } else {
      if (typeof anchor.selector !== 'string' || !anchor.selector.trim()) {
        errors.push(`${where}.anchor.selector is empty`);
      } else if (!isPlainCssSelector(anchor.selector)) {
        errors.push(`${where}.anchor.selector is not a plain CSS selector`);
      }
      if (!LAYOUT_INSERTS.includes(anchor.insert)) {
        errors.push(`${where}.anchor.insert is invalid`);
      }
      if (anchor.replace !== undefined && typeof anchor.replace !== 'boolean') {
        errors.push(`${where}.anchor.replace must be true or false`);
      }
      if (
        anchor.replace === true &&
        anchor.insert !== 'beforebegin' &&
        anchor.insert !== 'afterend'
      ) {
        errors.push(`${where}.anchor.replace needs insert beforebegin or afterend`);
      }
      if (anchor.x !== undefined || anchor.y !== undefined) {
        if (!isLayoutPixels(anchor.x, -4000, 8000) || !isLayoutPixels(anchor.y, -4000, 8000)) {
          errors.push(`${where}.anchor.x and anchor.y must both be pixel offsets`);
        }
      }
    }
    const button = target.button;
    if (!button || typeof button !== 'object') {
      errors.push(`${where}.button is required`);
      return;
    }
    if (!LAYOUT_SIZES.includes(button.size)) {
      errors.push(`${where}.button.size must be small, medium, or large`);
    }
    if (button.height !== undefined && !isLayoutPixels(button.height, 16, 160)) {
      errors.push(`${where}.button.height must be a pixel size from 16 to 160`);
    }
    if (button.width !== undefined && !isLayoutPixels(button.width, 16, 480)) {
      errors.push(`${where}.button.width must be a pixel size from 16 to 480`);
    }
    if (button.scale !== undefined && !isLayoutScale(button.scale)) {
      errors.push(`${where}.button.scale must be a number from 0.5 to 2`);
    }
    if (button.fit !== undefined && typeof button.fit !== 'boolean') {
      errors.push(`${where}.button.fit must be true or false`);
    }
    if (button.hover !== undefined && typeof button.hover !== 'boolean') {
      errors.push(`${where}.button.hover must be true or false`);
    }
    if (typeof button.showText !== 'boolean') {
      errors.push(`${where}.button.showText must be true or false`);
    }
    if (typeof button.label !== 'string' || !button.label.trim() || button.label.length > 80) {
      errors.push(`${where}.button.label must be short text`);
    }
    if (!LAYOUT_SHAPES.includes(button.shape)) {
      errors.push(`${where}.button.shape must be square, rounded, or pill`);
    }
    const colors = button.colors;
    if (!colors || typeof colors !== 'object') {
      errors.push(`${where}.button.colors is required`);
      return;
    }
    LAYOUT_COLOR_KEYS.forEach((key) => {
      if (!isLayoutColor(key, colors[key])) {
        const allowed = LAYOUT_CLEAR_COLOR_KEYS.indexOf(key) === -1
          ? '#rgb or #rrggbb'
          : '#rgb, #rrggbb, or transparent';
        errors.push(`${where}.button.colors.${key} must be ${allowed}`);
      }
    });
    validateModeColors(errors, `${where}.button.light`, button.light);
    validateModeColors(errors, `${where}.button.dark`, button.dark);
  });

  return errors;
}

function layoutHostMatches(hostname, hosts) {
  return (hosts || []).some((site) => hostMatchesSite(hostname, site));
}

function layoutPathMatches(pathname, pathPrefix) {
  if (typeof pathname !== 'string' || typeof pathPrefix !== 'string' || !pathPrefix) return false;
  return pathname === pathPrefix || pathname.startsWith(pathPrefix);
}

function sanitizeLayoutTarget(target, theme) {
  const button = target.button;
  const colors = button.colors;
  const base = {
    background: normalizeLayoutColor('background', colors.background),
    text: normalizeLayoutColor('text', colors.text),
    icon: normalizeLayoutColor('icon', colors.icon),
    border: normalizeLayoutColor('border', colors.border),
    hoverBackground: normalizeLayoutColor('hoverBackground', colors.hoverBackground),
  };
  const anchor = {
    selector: target.anchor.selector.trim(),
    insert: target.anchor.insert,
    replace: target.anchor.replace === true,
  };
  if (isLayoutPixels(target.anchor.x, -4000, 8000) && isLayoutPixels(target.anchor.y, -4000, 8000)) {
    anchor.x = target.anchor.x;
    anchor.y = target.anchor.y;
  }
  const cleaned = {
    id: target.id,
    kind: target.kind,
    entity: layoutKindEntity(target.kind),
    path: target.path,
    anchor,
    button: {
      size: button.size,
      showText: button.showText,
      label: button.label.trim(),
      shape: button.shape,
      scale: isLayoutScale(button.scale) ? button.scale : 1,
      fit: button.fit === true,
      hover: button.hover !== false,
      colors: base,
    },
  };
  if (isLayoutPixels(button.height, 16, 160)) cleaned.button.height = button.height;
  if (isLayoutPixels(button.width, 16, 480)) cleaned.button.width = button.width;
  const light = sanitizeModeColors(button.light, base);
  const dark = sanitizeModeColors(button.dark, base);
  if (light) cleaned.button.light = light;
  if (dark) cleaned.button.dark = dark;
  const cleanedTheme = sanitizeTheme(theme);
  if (cleanedTheme) cleaned.theme = cleanedTheme;
  return cleaned;
}

function matchLayoutTargets(layouts, pageUrl) {
  let parsed;
  try {
    parsed = new URL(pageUrl);
  } catch (_) {
    return [];
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return [];

  const pathname = parsed.pathname || '/';
  const matches = [];
  (layouts || []).forEach((layout) => {
    if (!layout || validateLayout(layout).length) return;
    if (!layoutHostMatches(parsed.hostname, layout.hosts)) return;
    layout.targets.forEach((target) => {
      if (layoutPathMatches(pathname, target.path)) matches.push({ target, theme: layout.theme });
    });
  });
  if (!matches.length) return [];

  const longest = matches.reduce((max, item) => Math.max(max, item.target.path.length), 0);
  return matches
    .filter((item) => item.target.path.length === longest)
    .map((item) => sanitizeLayoutTarget(item.target, item.theme));
}

globalThis.isPlainCssSelector = isPlainCssSelector;
globalThis.validateLayout = validateLayout;
globalThis.layoutKindEntity = layoutKindEntity;
globalThis.matchLayoutTargets = matchLayoutTargets;
