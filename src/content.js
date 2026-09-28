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
    svg {
      fill: none;
      stroke: var(--cove-icon);
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
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
    button[data-size="medium"] svg { width: 16px; height: 16px; }
    button[data-size="large"] svg { width: 20px; height: 20px; }
    button[data-shape="square"] { border-radius: 0; }
    button[data-shape="rounded"] { border-radius: 8px; }
    button[data-shape="pill"] { border-radius: 999px; }
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

  function shouldShow() {
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

  function layoutColor(value) {
    return typeof value === 'string' && LAYOUT_HEX.test(value) ? value : '';
  }

  function findLayoutHost(id) {
    const nodes = document.querySelectorAll('[data-cove-layout-id]');
    for (const node of nodes) {
      if (node.getAttribute('data-cove-layout-id') === id) return node;
    }
    return null;
  }

  function removeLayoutButtons() {
    document.querySelectorAll('[data-cove-layout-id]').forEach((node) => node.remove());
  }

  function layoutHostPlaced(host, anchor, insert) {
    if (!host || !host.isConnected || !anchor || !anchor.isConnected) return false;
    if (insert === 'beforeend' || insert === 'afterbegin') return host.parentElement === anchor;
    if (insert === 'beforebegin') return host.nextElementSibling === anchor;
    if (insert === 'afterend') return host.previousElementSibling === anchor;
    return false;
  }

  function createLayoutButton(target) {
    const buttonSpec = target && target.button;
    const colors = buttonSpec && buttonSpec.colors;
    const background = layoutColor(colors && colors.background);
    const text = layoutColor(colors && colors.text);
    const icon = layoutColor(colors && colors.icon);
    const border = layoutColor(colors && colors.border);
    const hover = layoutColor(colors && colors.hoverBackground);
    const size = buttonSpec && buttonSpec.size;
    const shape = buttonSpec && buttonSpec.shape;
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
    button.setAttribute('aria-label', label);
    button.title = label;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M12 3v12M12 15l4.5-4.5M12 15l-4.5-4.5M4 21h16');
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
        return;
      }
      live.add(target.id);
      const existing = findLayoutHost(target.id);
      if (layoutHostPlaced(existing, anchor, insert)) return;
      if (existing) existing.remove();
      const host = createLayoutButton(target);
      if (!host) return;
      try {
        anchor.insertAdjacentElement(insert, host);
      } catch (_) {
        host.remove();
      }
    });
    document.querySelectorAll('[data-cove-layout-id]').forEach((node) => {
      if (!live.has(node.getAttribute('data-cove-layout-id'))) node.remove();
    });
  }

  function schedulePlaceLayoutButtons() {
    if (layoutPlaceQueued) return;
    layoutPlaceQueued = true;
    requestAnimationFrame(() => {
      layoutPlaceQueued = false;
      if (!settings.showStylizedDownloadButton) {
        removeLayoutButtons();
        return;
      }
      placeLayoutButtons(currentTargets);
    });
  }

  function ensureLayoutObserver() {
    if (layoutObserver || !document.documentElement) return;
    layoutObserver = new MutationObserver(() => schedulePlaceLayoutButtons());
    layoutObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  function stopLayoutObserver() {
    if (!layoutObserver) return;
    layoutObserver.disconnect();
    layoutObserver = null;
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

  ensureUi();
  fab.style.display = 'none';
  loadSettings();
})();
