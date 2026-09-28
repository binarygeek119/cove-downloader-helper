(() => {
  if (globalThis.__coveDownloaderHelperInjected) return;
  globalThis.__coveDownloaderHelperInjected = true;

  const HOST_ID = 'cove-downloader-helper-root';
  let root = null;
  let shadow = null;
  let fab = null;
  let chip = null;
  let toastEl = null;
  const DIRECT_MEDIA_EXT = /\.(mp4|webm|mkv|mov|m4v|mp3|m4a|flac|wav|ogg|opus|jpg|jpeg|png|gif|webp)$/i;

  let settings = {
    showInPageButtons: false,
    showOnSupportedSites: false,
    showStylizedDownloadButton: false,
    supportedHosts: [],
    coveUrl: '',
  };
  let currentTargets = [];
  let layoutObserver = null;
  let layoutPlaceQueued = false;
  let layoutPlaceAgain = false;
  let layoutRequest = 0;
  const LAYOUT_HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
  const LAYOUT_BUTTON_STYLE = `
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
      line-height: 1;
      cursor: pointer;
      white-space: nowrap;
    }
    button:hover { background: var(--cove-hover); }
    button[data-hover="0"]:hover { background: var(--cove-bg); }
    svg {
      fill: var(--cove-icon);
      flex: 0 0 auto;
    }
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
  `;
  let hoverLink = null;

  function isEditableTarget(target) {
    if (!target || !target.closest) return false;
    return !!target.closest('input, textarea, select, [contenteditable="true"]');
  }

  function showToast(message, isError) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.dataset.error = isError ? '1' : '0';
    toastEl.hidden = false;
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => {
      toastEl.hidden = true;
    }, 2500);
  }

  function sendUrl(url, entity) {
    const message = { type: 'send-to-cove', url };
    if (entity === 'Video' || entity === 'Image' || entity === 'Text') message.entity = entity;
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        showToast(chrome.runtime.lastError.message, true);
        return;
      }
      if (!response || !response.ok) {
        showToast((response && response.error) || 'Failed to send to Cove', true);
        return;
      }
      if (response.openedSettings) {
        showToast('Open Settings to configure Cove URL', true);
        return;
      }
      if (response.started) {
        showToast('Sent to Cove as video.');
        return;
      }
      showToast('Opening Cove Downloader Helper…');
    });
  }

  function ensureUi() {
    if (document.getElementById(HOST_ID)) {
      root = document.getElementById(HOST_ID);
      shadow = root.shadowRoot;
      fab = shadow.getElementById('fab');
      chip = shadow.getElementById('chip');
      toastEl = shadow.getElementById('toast');
      return;
    }

    root = document.createElement('div');
    root.id = HOST_ID;
    shadow = root.attachShadow({ mode: 'open' });
    const iconUrl = chrome.runtime.getURL('cove-icon-32.png');
    shadow.innerHTML = `
      <style>
        :host, * { box-sizing: border-box; font-family: "Segoe UI", system-ui, sans-serif; }
        :host { color-scheme: light dark; }
        #fab {
          position: fixed;
          right: 16px;
          bottom: 16px;
          z-index: 2147483646;
          width: 44px;
          height: 44px;
          padding: 0;
          border-radius: 999px;
          border: 1px solid #2a3441;
          background-color: #171d25;
          background-image: url("${iconUrl}");
          background-position: center;
          background-size: 28px 28px;
          background-repeat: no-repeat;
          box-shadow: 0 8px 24px rgba(0,0,0,.28);
          cursor: pointer;
        }
        #fab:hover { filter: brightness(1.08); }
        #chip {
          position: fixed;
          z-index: 2147483646;
          display: none;
          transform: translate(-50%, -120%);
          background: #171d25;
          color: #e7ecf1;
          border: 1px solid #2a3441;
          border-radius: 999px;
          padding: 4px 10px;
          font-size: 12px;
          cursor: pointer;
          box-shadow: 0 6px 18px rgba(0,0,0,.25);
          white-space: nowrap;
        }
        #toast {
          position: fixed;
          left: 50%;
          bottom: 72px;
          transform: translateX(-50%);
          z-index: 2147483647;
          background: #171d25;
          color: #e7ecf1;
          border: 1px solid #2a3441;
          border-radius: 10px;
          padding: 8px 12px;
          font-size: 12px;
          max-width: min(420px, 90vw);
          box-shadow: 0 8px 24px rgba(0,0,0,.28);
        }
        #toast[data-error="1"] { border-color: #ff6b6b; color: #ffb4b4; }
        @media (prefers-color-scheme: light) {
          #fab, #chip, #toast {
            background-color: #ffffff;
            color: #1a2330;
            border-color: #d5dde6;
            box-shadow: 0 8px 24px rgba(20, 32, 48, .16);
          }
          #toast[data-error="1"] { border-color: #c62828; color: #a32020; }
        }
      </style>
      <button id="fab" type="button" title="Send page to Cove" aria-label="Send page to Cove"></button>
      <button id="chip" type="button" title="Send link to Cove">Cove</button>
      <div id="toast" hidden></div>
    `;
    document.documentElement.appendChild(root);
    fab = shadow.getElementById('fab');
    chip = shadow.getElementById('chip');
    toastEl = shadow.getElementById('toast');

    fab.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const albumUrl = eromeAlbumUrl(location.href);
      if (albumUrl) {
        openEromeSelector(albumUrl);
        return;
      }
      sendUrl(location.href);
    });

    chip.addEventListener('pointerenter', () => {
      chip.style.display = 'block';
    });
    chip.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (hoverLink && hoverLink.href) {
        sendUrl(hoverLink.href);
      }
    });
  }

  function setVisible(visible) {
    ensureUi();
    const display = visible ? '' : 'none';
    fab.style.display = display;
    if (!visible) {
      chip.style.display = 'none';
      toastEl.hidden = true;
    }
  }

  function hostMatchesSite(hostname, site) {
    const host = String(hostname || '').replace(/^www\./i, '').toLowerCase();
    const normalized = String(site || '').replace(/^www\./i, '').toLowerCase();
    if (!host || !normalized || normalized === '*') return false;
    return host === normalized || host.endsWith('.' + normalized);
  }

  function isSupportedPage() {
    if (DIRECT_MEDIA_EXT.test(location.pathname)) return true;
    const sites = settings.supportedHosts || [];
    return sites.some((site) => hostMatchesSite(location.hostname, site));
  }

  function isEromeHost() {
    return hostMatchesSite(location.hostname, 'erome.com');
  }

  function eromeAlbumUrl(value) {
    try {
      const url = new URL(value, location.href);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
      if (!hostMatchesSite(url.hostname, 'erome.com')) return '';
      if (!/^\/a\/[^/]+\/?$/i.test(url.pathname)) return '';
      url.hash = '';
      return url.href;
    } catch (_) {
      return '';
    }
  }

  function shouldShow() {
    if (eromeAlbumUrl(location.href)) return true;
    const wantsAll = !!settings.showInPageButtons;
    const wantsSupported = !!settings.showOnSupportedSites;
    if (!wantsAll && !wantsSupported) return false;
    try {
      if (settings.coveUrl) {
        const coveOrigin = new URL(settings.coveUrl).origin;
        if (location.origin === coveOrigin) return false;
      }
    } catch (_) {
      /* ignore bad cove url */
    }
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return false;
    if (wantsAll) return true;
    return isSupportedPage();
  }

  function applyVisibility() {
    setVisible(shouldShow());
  }

  function onPointerOver(event) {
    if (!shouldShow() || isEditableTarget(event.target)) {
      chip.style.display = 'none';
      return;
    }
    const anchor = event.target && event.target.closest && event.target.closest('a[href]');
    if (!anchor) {
      if (event.target !== chip) {
        /* keep chip while moving onto it */
      }
      return;
    }
    let href = anchor.href;
    try {
      const parsed = new URL(href, location.href);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        chip.style.display = 'none';
        return;
      }
      href = parsed.href;
    } catch (_) {
      chip.style.display = 'none';
      return;
    }

    hoverLink = anchor;
    const rect = anchor.getBoundingClientRect();
    chip.style.display = 'block';
    chip.style.left = `${Math.max(24, Math.min(window.innerWidth - 24, rect.left + rect.width / 2))}px`;
    chip.style.top = `${Math.max(24, rect.top)}px`;
  }

  function onPointerOut(event) {
    const related = event.relatedTarget;
    if (related === chip || (chip && chip.contains && chip.contains(related))) return;
    if (hoverLink && related && hoverLink.contains && hoverLink.contains(related)) return;
    chip.style.display = 'none';
    hoverLink = null;
  }

  function layoutColor(value, allowClear) {
    if (typeof value !== 'string') return '';
    const color = value.trim();
    if (LAYOUT_HEX.test(color)) return color;
    if (allowClear && color.toLowerCase() === 'transparent') return 'transparent';
    return '';
  }

  function findLayoutHost(id) {
    const nodes = document.querySelectorAll('[data-cove-layout-id]');
    for (const node of nodes) {
      if (node.getAttribute('data-cove-layout-id') === id) return node;
    }
    return null;
  }

  function restoreReplacedAnchor(node) {
    const previous = node.getAttribute('data-cove-replaced-display');
    node.style.removeProperty('display');
    if (previous) node.style.display = previous;
    node.removeAttribute('data-cove-replaced');
    node.removeAttribute('data-cove-replaced-display');
  }

  function restoreReplacedAnchors(id) {
    document.querySelectorAll('[data-cove-replaced]').forEach((node) => {
      if (!id || node.getAttribute('data-cove-replaced') === id) restoreReplacedAnchor(node);
    });
  }

  function hideReplacedAnchor(anchor, id) {
    if (!anchor.hasAttribute('data-cove-replaced-display')) {
      anchor.setAttribute('data-cove-replaced-display', anchor.style.display || '');
    }
    anchor.setAttribute('data-cove-replaced', id);
    anchor.style.setProperty('display', 'none', 'important');
  }

  function removeLayoutButtons() {
    document.querySelectorAll('[data-cove-layout-id]').forEach((node) => node.remove());
    restoreReplacedAnchors();
  }

  function alignHostWithFloatedItem(host) {
    const parent = host.parentElement;
    const sibling = host.previousElementSibling || host.nextElementSibling;
    if (!parent || parent.tagName !== 'UL' || !sibling || sibling.tagName !== 'LI') return;
    host.style.display = 'flex';
    host.style.alignItems = 'center';
    host.style.justifyContent = 'center';
    host.style.margin = '0';
    const height = sibling.getBoundingClientRect().height;
    if (height > 0) host.style.height = `${Math.round(height)}px`;
    const floated = getComputedStyle(sibling).float;
    if (floated === 'left' || floated === 'right') host.style.float = floated;
  }

  function dropHostMarginWhenRowHasGap(host, parentStyle) {
    const gap = parentStyle && (parentStyle.columnGap || parentStyle.gap);
    if (!gap || gap === 'normal' || gap === '0px') return;
    host.style.margin = '0';
  }

  function stayInButtonRow(host) {
    const parent = host.parentElement;
    if (!parent) return;
    if (parent.tagName === 'UL') {
      alignHostWithFloatedItem(host);
      const display = getComputedStyle(parent).display;
      if (display === 'flex' || display === 'inline-flex') {
        host.style.float = '';
        host.style.flex = '0 0 auto';
        host.style.alignSelf = 'center';
        dropHostMarginWhenRowHasGap(host, getComputedStyle(parent));
      }
      return;
    }
    const parentStyle = getComputedStyle(parent);
    const display = parentStyle.display;
    if (display === 'flex' || display === 'inline-flex') {
      host.style.flex = '0 0 auto';
      host.style.alignSelf = 'center';
      dropHostMarginWhenRowHasGap(host, parentStyle);
      return;
    }
    const parentFloat = parentStyle.float;
    if ((parentFloat === 'left' || parentFloat === 'right') && parent.childElementCount <= 6) {
      parent.style.display = 'flex';
      parent.style.alignItems = 'center';
      parent.style.flexWrap = 'nowrap';
      host.style.flex = '0 0 auto';
      host.style.alignSelf = 'center';
      return;
    }
    alignHostWithFloatedItem(host);
  }

  function layoutHostPlaced(host, anchor, insert) {
    if (!host || !host.isConnected || !anchor || !anchor.isConnected) return false;
    if (insert === 'beforeend' || insert === 'afterbegin') return host.parentElement === anchor;
    if (insert === 'beforebegin') return host.nextElementSibling === anchor;
    if (insert === 'afterend') return host.previousElementSibling === anchor;
    return false;
  }

  const LAYOUT_PRESETS = {
    small: { height: 28, font: 12, icon: 14, pad: 8, gap: 4 },
    medium: { height: 36, font: 14, icon: 16, pad: 12, gap: 6 },
    large: { height: 44, font: 16, icon: 20, pad: 16, gap: 8 },
  };

  function layoutScale(buttonSpec) {
    const scale = buttonSpec && buttonSpec.scale;
    if (typeof scale !== 'number' || !Number.isFinite(scale)) return 1;
    if (scale < 0.5) return 0.5;
    if (scale > 2) return 2;
    return scale;
  }

  function pageLooksDark() {
    const node = document.body || document.documentElement;
    if (!node) return window.matchMedia('(prefers-color-scheme: dark)').matches;
    const bg = getComputedStyle(node).backgroundColor || '';
    const match = bg.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/);
    if (!match) return window.matchMedia('(prefers-color-scheme: dark)').matches;
    const alpha = match[4] === undefined ? 1 : Number(match[4]);
    if (!Number.isFinite(alpha) || alpha === 0) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    const luma = 0.2126 * Number(match[1]) + 0.7152 * Number(match[2]) + 0.0722 * Number(match[3]);
    return luma < 140;
  }

  function layoutIsDark(theme) {
    const darkSelector = theme && theme.dark;
    const lightSelector = theme && theme.light;
    let darkMatch = false;
    let lightMatch = false;
    try {
      darkMatch = !!(darkSelector && document.querySelector(darkSelector));
    } catch (_) {
      darkMatch = false;
    }
    try {
      lightMatch = !!(lightSelector && document.querySelector(lightSelector));
    } catch (_) {
      lightMatch = false;
    }
    if (darkMatch && !lightMatch) return true;
    if (lightMatch && !darkMatch) return false;
    return pageLooksDark();
  }

  function colorsForMode(buttonSpec) {
    const base = (buttonSpec && buttonSpec.colors) || {};
    const mode = layoutIsDark(buttonSpec && buttonSpec._theme) ? buttonSpec.dark : buttonSpec.light;
    const overlay = mode || {};
    return {
      background: overlay.background || base.background,
      text: overlay.text || base.text,
      icon: overlay.icon || base.icon,
      border: overlay.border || base.border,
      hoverBackground: overlay.hoverBackground || base.hoverBackground,
    };
  }

  function setInlineStyle(node, prop, value) {
    if (!node) return;
    if (node.style.getPropertyValue(prop) !== value) node.style.setProperty(prop, value);
  }

  function sizeSibling(host) {
    const parent = host && host.parentElement;
    if (!parent) return null;
    const candidates = [];
    const children = parent.children;
    for (let index = 0; index < children.length; index += 1) {
      const el = children[index];
      if (el === host || el.hasAttribute('data-cove-replaced')) continue;
      if (getComputedStyle(el).display === 'none') continue;
      const rect = el.getBoundingClientRect();
      if (rect.height < 16 || rect.height > 80 || rect.width < 8) continue;
      candidates.push(el);
    }
    return (
      candidates.find((el) => el.tagName === 'BUTTON' || el.tagName === 'A' || el.querySelector('button, a')) ||
      candidates[0] ||
      null
    );
  }

  function syncLayoutButton(host, target) {
    const buttonSpec = target && target.button;
    const button = host && host.shadowRoot && host.shadowRoot.querySelector('button');
    if (!buttonSpec || !button) return;
    const themed = Object.assign({}, buttonSpec, { _theme: target.theme });
    const colors = colorsForMode(themed);
    setInlineStyle(host, '--cove-bg', colors.background);
    setInlineStyle(host, '--cove-text', colors.text);
    setInlineStyle(host, '--cove-icon', colors.icon);
    setInlineStyle(host, '--cove-border', colors.border);
    setInlineStyle(host, '--cove-hover', buttonSpec.hover === false ? colors.background : colors.hoverBackground);
    if (button.dataset.hover !== (buttonSpec.hover === false ? '0' : '1')) {
      button.dataset.hover = buttonSpec.hover === false ? '0' : '1';
    }
    const preset = LAYOUT_PRESETS[buttonSpec.size] || LAYOUT_PRESETS.medium;
    const scale = layoutScale(buttonSpec);
    const placed = target.anchor && Number.isInteger(target.anchor.x) && Number.isInteger(target.anchor.y);
    const customSize = scale !== 1 || !!buttonSpec.height || !!buttonSpec.width || !!buttonSpec.fit || placed;
    if (!customSize) return;
    let height = buttonSpec.height || preset.height;
    let width = buttonSpec.width || 0;
    if (buttonSpec.fit && !placed) {
      const sibling = sizeSibling(host);
      if (sibling) {
        const rect = sibling.getBoundingClientRect();
        if (rect.height >= 16) height = Math.round(rect.height);
        if (!buttonSpec.showText && !buttonSpec.width && rect.width >= 16 && rect.width <= 160) {
          width = Math.round(rect.width);
        }
      }
    }
    height = Math.max(16, Math.min(160, Math.round(height * scale)));
    setInlineStyle(button, 'height', `${height}px`);
    setInlineStyle(button, 'font-size', `${Math.max(10, Math.round(preset.font * scale))}px`);
    const svg = button.querySelector('svg');
    const icon = Math.max(10, Math.round((buttonSpec.showText ? preset.icon : Math.max(preset.icon, 18)) * scale));
    if (svg) {
      setInlineStyle(svg, 'width', `${icon}px`);
      setInlineStyle(svg, 'height', `${icon}px`);
    }
    if (buttonSpec.showText) {
      setInlineStyle(button, 'padding', `0 ${Math.round(preset.pad * scale)}px`);
      setInlineStyle(button, 'gap', `${Math.round(preset.gap * scale)}px`);
    }
    if (width) setInlineStyle(button, 'width', `${Math.max(16, Math.min(480, Math.round(width * scale)))}px`);
    if (placed) {
      setInlineStyle(host, 'position', 'fixed');
      setInlineStyle(host, 'left', `${target.anchor.x}px`);
      setInlineStyle(host, 'top', `${target.anchor.y}px`);
      setInlineStyle(host, 'z-index', '2147483646');
      setInlineStyle(host, 'margin', '0');
    }
  }

  let layoutSizeObserver = null;
  const layoutFitWatch = new WeakMap();

  function watchLayoutRow(host, target) {
    if (!window.ResizeObserver || !host || !host.parentElement) return;
    const anchor = target && target.anchor;
    const placed = !!(anchor && Number.isInteger(anchor.x) && Number.isInteger(anchor.y));
    if (!target || !target.button || target.button.fit !== true || placed) return;
    if (!layoutSizeObserver) {
      layoutSizeObserver = new ResizeObserver(() => schedulePlaceLayoutButtons());
    }
    const next = new Set();
    const children = host.parentElement.children;
    for (let index = 0; index < children.length; index += 1) {
      const el = children[index];
      if (el === host || el.hasAttribute('data-cove-replaced')) continue;
      next.add(el);
      layoutSizeObserver.observe(el);
    }
    const previous = layoutFitWatch.get(host);
    if (previous) {
      previous.forEach((el) => {
        if (!next.has(el)) layoutSizeObserver.unobserve(el);
      });
    }
    layoutFitWatch.set(host, next);
  }

  function createLayoutButton(target) {
    const buttonSpec = target && target.button;
    const colors = buttonSpec && buttonSpec.colors;
    const background = layoutColor(colors && colors.background, true);
    const text = layoutColor(colors && colors.text, false);
    const icon = layoutColor(colors && colors.icon, false);
    const border = layoutColor(colors && colors.border, true);
    const hover = layoutColor(colors && colors.hoverBackground, true);
    const size = buttonSpec && buttonSpec.size;
    const shape = buttonSpec && buttonSpec.shape;
    const height = buttonSpec && buttonSpec.height;
    const label = buttonSpec && typeof buttonSpec.label === 'string' ? buttonSpec.label.trim() : '';
    const entity = target && target.entity;
    if (!background || !text || !icon || !border || !hover || !label) return null;
    if (size !== 'small' && size !== 'medium' && size !== 'large') return null;
    if (shape !== 'square' && shape !== 'rounded' && shape !== 'pill') return null;
    if (entity !== 'Video' && entity !== 'Image' && entity !== 'Text') return null;
    if (typeof target.id !== 'string' || !target.id) return null;

    const host = document.createElement('span');
    host.setAttribute('data-cove-layout-id', target.id);
    host.style.setProperty('--cove-bg', background);
    host.style.setProperty('--cove-text', text);
    host.style.setProperty('--cove-icon', icon);
    host.style.setProperty('--cove-border', border);
    host.style.setProperty('--cove-hover', hover);

    const root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = LAYOUT_BUTTON_STYLE;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.size = size;
    button.dataset.text = buttonSpec.showText ? '1' : '0';
    button.dataset.shape = shape;
    if (Number.isInteger(height) && height >= 24 && height <= 64) {
      button.style.height = `${height}px`;
    }
    button.setAttribute('aria-label', label);
    button.title = label;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    // Font Awesome Free 6.7.2 download. https://fontawesome.com/license/free (CC BY 4.0)
    svg.setAttribute('viewBox', '0 0 512 512');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M288 32c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 242.7-73.4-73.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l128 128c12.5 12.5 32.8 12.5 45.3 0l128-128c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L288 274.7 288 32zM64 352c-35.3 0-64 28.7-64 64l0 32c0 35.3 28.7 64 64 64l384 0c35.3 0 64-28.7 64-64l0-32c0-35.3-28.7-64-64-64l-101.5 0-45.3 45.3c-25 25-65.5 25-90.5 0L165.5 352 64 352zm368 56a24 24 0 1 1 0 48 24 24 0 1 1 0-48z');
    svg.appendChild(path);
    button.appendChild(svg);
    if (buttonSpec.showText) {
      const span = document.createElement('span');
      span.textContent = label;
      button.appendChild(span);
    }
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      sendUrl(location.href, entity);
    });
    root.appendChild(style);
    root.appendChild(button);
    return host;
  }

  function placeLayoutButtons(targets) {
    const live = new Set();
    (targets || []).forEach((target) => {
      if (!target || typeof target.id !== 'string') return;
      const selector = target.anchor && target.anchor.selector;
      const insert = target.anchor && target.anchor.insert;
      if (typeof selector !== 'string' || !selector) return;
      if (insert !== 'beforebegin' && insert !== 'afterbegin' && insert !== 'beforeend' && insert !== 'afterend') {
        return;
      }
      let anchor = null;
      try {
        anchor = document.querySelector(selector);
      } catch (_) {
        return;
      }
      if (!anchor) {
        const missing = findLayoutHost(target.id);
        if (missing) missing.remove();
        restoreReplacedAnchors(target.id);
        return;
      }
      live.add(target.id);
      const replace = !!(target.anchor && target.anchor.replace);
      if (replace) hideReplacedAnchor(anchor, target.id);
      else restoreReplacedAnchors(target.id);
      const existing = findLayoutHost(target.id);
      if (layoutHostPlaced(existing, anchor, insert)) {
        syncLayoutButton(existing, target);
        watchLayoutRow(existing, target);
        return;
      }
      if (existing) existing.remove();
      const host = createLayoutButton(target);
      if (!host) return;
      try {
        anchor.insertAdjacentElement(insert, host);
        const placed = target.anchor && Number.isInteger(target.anchor.x) && Number.isInteger(target.anchor.y);
        if (!placed) stayInButtonRow(host);
        syncLayoutButton(host, target);
        watchLayoutRow(host, target);
      } catch (_) {
        host.remove();
      }
    });
    document.querySelectorAll('[data-cove-layout-id]').forEach((node) => {
      const id = node.getAttribute('data-cove-layout-id');
      if (live.has(id)) return;
      node.remove();
      restoreReplacedAnchors(id);
    });
  }

  function schedulePlaceLayoutButtons() {
    if (layoutPlaceQueued) {
      layoutPlaceAgain = true;
      return;
    }
    layoutPlaceQueued = true;
    requestAnimationFrame(() => {
      layoutPlaceQueued = false;
      if (!settings.showStylizedDownloadButton) {
        layoutPlaceAgain = false;
        removeLayoutButtons();
        return;
      }
      placeLayoutButtons(currentTargets);
      if (!layoutPlaceAgain) return;
      layoutPlaceAgain = false;
      schedulePlaceLayoutButtons();
    });
  }

  function ensureLayoutObserver() {
    if (!layoutObserver && document.documentElement) {
      layoutObserver = new MutationObserver(() => schedulePlaceLayoutButtons());
      layoutObserver.observe(document.documentElement, { childList: true, subtree: true });
      layoutObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      if (document.body) {
        layoutObserver.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });
      }
      if (document.head) {
        layoutObserver.observe(document.head, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['href', 'data-href'],
        });
      }
    }
    if (!ensureLayoutObserver.resizeBound) {
      ensureLayoutObserver.resizeBound = true;
      window.addEventListener('resize', schedulePlaceLayoutButtons);
      const scheme = window.matchMedia('(prefers-color-scheme: dark)');
      if (scheme.addEventListener) scheme.addEventListener('change', schedulePlaceLayoutButtons);
    }
  }

  function stopLayoutObserver() {
    if (layoutObserver) {
      layoutObserver.disconnect();
      layoutObserver = null;
    }
    if (layoutSizeObserver) {
      layoutSizeObserver.disconnect();
      layoutSizeObserver = null;
    }
  }

  function refreshLayoutButtons() {
    const requestId = ++layoutRequest;
    if (!settings.showStylizedDownloadButton) {
      currentTargets = [];
      removeLayoutButtons();
      stopLayoutObserver();
      return;
    }
    ensureLayoutObserver();
    chrome.runtime.sendMessage({ type: 'get-stylized-layout', url: location.href }, (response) => {
      if (requestId !== layoutRequest) return;
      if (!settings.showStylizedDownloadButton) {
        currentTargets = [];
        removeLayoutButtons();
        stopLayoutObserver();
        return;
      }
      if (chrome.runtime.lastError || !response || !response.ok) {
        currentTargets = [];
        removeLayoutButtons();
        return;
      }
      currentTargets = Array.isArray(response.targets) ? response.targets : [];
      placeLayoutButtons(currentTargets);
    });
  }

  function loadSettings() {
    chrome.runtime.sendMessage({ type: 'get-settings' }, (response) => {
      if (chrome.runtime.lastError || !response || !response.ok) {
        applyVisibility();
        refreshLayoutButtons();
        return;
      }
      settings = response.settings || settings;
      applyVisibility();
      refreshLayoutButtons();
    });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (
      changes.showInPageButtons ||
      changes.showOnSupportedSites ||
      changes.showStylizedDownloadButton ||
      changes.coveUrl
    ) {
      loadSettings();
    }
  });

  const EROME_VIDEO_EXT = /\.(?:mp4|m4v|webm|mov|mkv|ogv|ogg|flv)(?:$|\?)/i;
  let eromeIconQueued = false;

  function eromeVideosFromDocument(doc, baseUrl) {
    const videos = [];
    const seen = new Set();
    doc.querySelectorAll('.media-group').forEach((group) => {
      let bestUrl = '';
      let bestRes = -1;
      let poster = '';
      group.querySelectorAll('video').forEach((video) => {
        if (poster) return;
        const rawPoster = video.getAttribute('poster') || '';
        if (!rawPoster) return;
        try {
          const url = new URL(rawPoster, baseUrl);
          if (url.protocol === 'http:' || url.protocol === 'https:') poster = url.href;
        } catch (_) {
          poster = '';
        }
      });
      group.querySelectorAll('source[src]').forEach((source) => {
        let href = '';
        try {
          const url = new URL(source.getAttribute('src'), baseUrl);
          if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
          if (!EROME_VIDEO_EXT.test(url.pathname)) return;
          href = url.href;
        } catch (_) {
          return;
        }
        const res = parseInt(source.getAttribute('res') || '0', 10) || 0;
        if (res >= bestRes) {
          bestRes = res;
          bestUrl = href;
        }
      });
      if (!bestUrl || seen.has(bestUrl)) return;
      seen.add(bestUrl);
      const durationEl = group.querySelector('.duration');
      const durationText = durationEl ? String(durationEl.textContent || '').replace(/\s+/g, ' ').trim() : '';
      const duration = /^\d{1,2}:\d{2}(:\d{2})?$/.test(durationText) && !/^0+:00(:00)?$/.test(durationText)
        ? durationText
        : '';
      videos.push({
        url: bestUrl,
        title: 'Video ' + (videos.length + 1),
        thumbnail: poster,
        duration,
      });
    });
    return videos;
  }

  async function collectEromeAlbumVideos(albumUrl) {
    if (eromeAlbumUrl(location.href) === albumUrl) {
      return eromeVideosFromDocument(document, location.href);
    }
    const response = await fetch(albumUrl, { credentials: 'include' });
    if (!response.ok) throw new Error('Could not open that album.');
    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return eromeVideosFromDocument(doc, albumUrl);
  }

  function openEromeSelector(albumUrl) {
    chrome.runtime.sendMessage({ type: 'open-erome-selector', albumUrl }, (response) => {
      if (chrome.runtime.lastError || !response || !response.ok) {
        showToast(
          (chrome.runtime.lastError && chrome.runtime.lastError.message) || 'Could not open the video selector.',
          true
        );
        return;
      }
      const token = response.token;
      collectEromeAlbumVideos(albumUrl)
        .then((videos) => {
          chrome.runtime.sendMessage({ type: 'erome-selector-ready', token, albumUrl, videos }, () => {
            void chrome.runtime.lastError;
          });
        })
        .catch((error) => {
          chrome.runtime.sendMessage(
            {
              type: 'erome-selector-ready',
              token,
              albumUrl,
              videos: [],
              error: (error && error.message) || 'Could not read this album.',
            },
            () => {
              void chrome.runtime.lastError;
            }
          );
        });
    });
  }

  function ensureEromeHoverStyle() {
    if (document.getElementById('cove-erome-hover-style')) return;
    const style = document.createElement('style');
    style.id = 'cove-erome-hover-style';
    style.textContent = `
      [data-cove-erome-album] { opacity: 0; pointer-events: none; }
      .album:hover [data-cove-erome-album],
      .album-thumbnail-container:hover [data-cove-erome-album] {
        opacity: 1;
        pointer-events: auto;
      }
    `;
    document.documentElement.appendChild(style);
  }

  function createEromeHoverButton(albumUrl) {
    const host = document.createElement('span');
    host.setAttribute('data-cove-erome-album', albumUrl);
    host.style.position = 'absolute';
    host.style.right = '8px';
    host.style.bottom = '8px';
    host.style.zIndex = '30';
    const root = host.attachShadow({ mode: 'open' });
    const iconUrl = chrome.runtime.getURL('cove-icon-32.png');
    root.innerHTML = `
      <style>
        button {
          width: 32px;
          height: 32px;
          padding: 0;
          border-radius: 999px;
          border: 1px solid #2a3441;
          background-color: #171d25;
          background-image: url("${iconUrl}");
          background-position: center;
          background-size: 20px 20px;
          background-repeat: no-repeat;
          box-shadow: 0 4px 14px rgba(0,0,0,.35);
          cursor: pointer;
        }
        button:hover { filter: brightness(1.08); }
      </style>
      <button type="button" title="Choose videos in this album" aria-label="Choose videos in this album"></button>
    `;
    const button = root.querySelector('button');
    const open = (event) => {
      event.preventDefault();
      event.stopPropagation();
      openEromeSelector(albumUrl);
    };
    button.addEventListener('click', open);
    return host;
  }

  function placeEromeAlbumIcons() {
    if (!isEromeHost()) {
      document.querySelectorAll('[data-cove-erome-album]').forEach((node) => node.remove());
      return;
    }
    document.querySelectorAll('.album-thumbnail-container').forEach((box) => {
      if (box.querySelector('[data-cove-erome-album]')) return;
      const link = box.querySelector('a.album-link[href]');
      const albumUrl = link && eromeAlbumUrl(link.href);
      if (!albumUrl) return;
      ensureEromeHoverStyle();
      const host = createEromeHoverButton(albumUrl);
      if (getComputedStyle(box).position === 'static') box.style.position = 'relative';
      box.appendChild(host);
    });
  }

  function scheduleEromeAlbumIcons() {
    if (eromeIconQueued) return;
    eromeIconQueued = true;
    requestAnimationFrame(() => {
      eromeIconQueued = false;
      placeEromeAlbumIcons();
    });
  }

  document.addEventListener('pointerover', onPointerOver, true);
  document.addEventListener('pointerout', onPointerOut, true);

  // Keep floating button meaningful on SPA navigations.
  const notifyUrlChange = () => {
    chip.style.display = 'none';
    hoverLink = null;
    applyVisibility();
    currentTargets = [];
    removeLayoutButtons();
    refreshLayoutButtons();
    scheduleEromeAlbumIcons();
  };
  window.addEventListener('popstate', notifyUrlChange);
  chrome.runtime.onMessage.addListener((message) => {
    if (!message || message.type !== 'cove-url-changed' || message.url !== location.href) return;
    notifyUrlChange();
  });
  const wrapHistory = (method) => {
    const original = history[method];
    history[method] = function () {
      const result = original.apply(this, arguments);
      notifyUrlChange();
      return result;
    };
  };
  try {
    wrapHistory('pushState');
    wrapHistory('replaceState');
  } catch (_) {
    /* some pages freeze history */
  }

  if (isEromeHost() && document.documentElement) {
    scheduleEromeAlbumIcons();
    const eromeObserver = new MutationObserver(() => scheduleEromeAlbumIcons());
    eromeObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  ensureUi();
  fab.style.display = 'none';
  loadSettings();
})();
