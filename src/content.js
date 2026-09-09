(() => {
  const HOST_ID = 'cove-downloader-helper-root';
  let root = null;
  let shadow = null;
  let fab = null;
  let chip = null;
  let toastEl = null;
  let settings = {
    showInPageButtons: true,
    coveUrl: '',
  };
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

  function sendUrl(url) {
    chrome.runtime.sendMessage({ type: 'send-to-cove', url }, (response) => {
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
    shadow.innerHTML = `
      <style>
        :host, * { box-sizing: border-box; font-family: "Segoe UI", system-ui, sans-serif; }
        #fab {
          position: fixed;
          right: 16px;
          bottom: 16px;
          z-index: 2147483646;
          width: 44px;
          height: 44px;
          border-radius: 999px;
          border: none;
          background: #3d8bfd;
          color: #fff;
          font-weight: 700;
          font-size: 12px;
          letter-spacing: 0.02em;
          box-shadow: 0 8px 24px rgba(0,0,0,.28);
          cursor: pointer;
        }
        #fab:hover { filter: brightness(1.05); }
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
      </style>
      <button id="fab" type="button" title="Send page to Cove">Cove</button>
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

  function shouldShow() {
    if (!settings.showInPageButtons) return false;
    try {
      if (settings.coveUrl) {
        const coveOrigin = new URL(settings.coveUrl).origin;
        if (location.origin === coveOrigin) return false;
      }
    } catch (_) {
      /* ignore bad cove url */
    }
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return false;
    return true;
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

  function loadSettings() {
    chrome.runtime.sendMessage({ type: 'get-settings' }, (response) => {
      if (chrome.runtime.lastError || !response || !response.ok) {
        applyVisibility();
        return;
      }
      settings = response.settings || settings;
      applyVisibility();
    });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (changes.showInPageButtons || changes.coveUrl) {
      loadSettings();
    }
  });

  document.addEventListener('pointerover', onPointerOver, true);
  document.addEventListener('pointerout', onPointerOut, true);

  // Keep floating button meaningful on SPA navigations.
  const notifyUrlChange = () => {
    /* visibility depends on origin, not path; toast/chip cleared */
    chip.style.display = 'none';
    hoverLink = null;
  };
  window.addEventListener('popstate', notifyUrlChange);
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
  loadSettings();
})();
