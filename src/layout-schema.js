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

function validateLayout(data) {
  const errors = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return ['layout must be an object'];
  }
  if (data.version !== LAYOUT_VERSION) {
    errors.push('version must be 1');
  }
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
    }
    const button = target.button;
    if (!button || typeof button !== 'object') {
      errors.push(`${where}.button is required`);
      return;
    }
    if (!LAYOUT_SIZES.includes(button.size)) {
      errors.push(`${where}.button.size must be small, medium, or large`);
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

function sanitizeLayoutTarget(target) {
  const colors = target.button.colors;
  return {
    id: target.id,
    kind: target.kind,
    entity: layoutKindEntity(target.kind),
    path: target.path,
    anchor: {
      selector: target.anchor.selector.trim(),
      insert: target.anchor.insert,
    },
    button: {
      size: target.button.size,
      showText: target.button.showText,
      label: target.button.label.trim(),
      shape: target.button.shape,
      colors: {
        background: normalizeLayoutColor('background', colors.background),
        text: normalizeLayoutColor('text', colors.text),
        icon: normalizeLayoutColor('icon', colors.icon),
        border: normalizeLayoutColor('border', colors.border),
        hoverBackground: normalizeLayoutColor('hoverBackground', colors.hoverBackground),
      },
    },
  };
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
      if (layoutPathMatches(pathname, target.path)) matches.push(target);
    });
  });
  if (!matches.length) return [];

  const longest = matches.reduce((max, target) => Math.max(max, target.path.length), 0);
  return matches.filter((target) => target.path.length === longest).map(sanitizeLayoutTarget);
}

globalThis.isPlainCssSelector = isPlainCssSelector;
globalThis.validateLayout = validateLayout;
globalThis.layoutKindEntity = layoutKindEntity;
globalThis.matchLayoutTargets = matchLayoutTargets;
