importScripts('shared.js');

const MENU_LINK_ID = 'cove-send-link';
const MENU_PAGE_ID = 'cove-send-page';

function ensureContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_LINK_ID,
      title: 'Send link to Cove',
      contexts: ['link'],
      targetUrlPatterns: ['http://*/*', 'https://*/*'],
    });
    chrome.contextMenus.create({
      id: MENU_PAGE_ID,
      title: 'Send page to Cove',
      contexts: ['page'],
      documentUrlPatterns: ['http://*/*', 'https://*/*'],
    });
  });
}

function applyToolbarIcon() {
  chrome.action.setIcon({
    path: {
      16: 'cove-icon-16.png',
      32: 'cove-icon-32.png',
      48: 'cove-icon-48.png',
      128: 'cove-icon-128.png',
    },
  });
}

chrome.runtime.onInstalled.addListener(() => {
  ensureContextMenus();
  applyToolbarIcon();
});

chrome.runtime.onStartup.addListener(() => {
  ensureContextMenus();
  applyToolbarIcon();
});

applyToolbarIcon();

async function setPending(url, tab) {
  await sessionSet({
    [PENDING_KEY]: {
      url,
      openedAt: Date.now(),
      sourceTabId: tab && tab.id,
    },
  });
}

async function openAppWindow(query) {
  const appUrl = chrome.runtime.getURL(`app.html${query || ''}`);
  const session = await sessionGet([APP_WINDOW_ID_KEY]);
  const existingId = session[APP_WINDOW_ID_KEY];

  if (existingId !== undefined && existingId !== null) {
    try {
      const win = await chrome.windows.get(existingId);
      if (win) {
        const tabs = await chrome.tabs.query({ windowId: existingId });
        if (tabs[0]) {
          await chrome.tabs.update(tabs[0].id, { url: appUrl, active: true });
        }
        await chrome.windows.update(existingId, { focused: true });
        return;
      }
    } catch (_) {
      // Window gone; create a new one.
    }
  }

  const created = await chrome.windows.create({
    url: appUrl,
    type: 'popup',
    width: 440,
    height: 640,
    focused: true,
  });
  if (created && created.id !== undefined) {
    await sessionSet({ [APP_WINDOW_ID_KEY]: created.id });
  }
}

chrome.windows.onRemoved.addListener(async (windowId) => {
  const session = await sessionGet([APP_WINDOW_ID_KEY]);
  if (session[APP_WINDOW_ID_KEY] === windowId) {
    await sessionSet({ [APP_WINDOW_ID_KEY]: null });
  }
});

async function beginSendToCove(url, tab) {
  if (!isHttpUrl(url)) {
    throw new Error('Only http(s) URLs can be sent to Cove.');
  }

  const settings = await getSettings();
  if (!settings.coveUrl) {
    await openAppWindow('?tab=settings');
    return { openedSettings: true };
  }

  await setPending(url, tab);

  if (settings.autoSend) {
    await openAppWindow('?tab=download&auto=1');
  } else {
    await openAppWindow('?tab=download');
  }

  return { ok: true };
}

chrome.action.onClicked.addListener(async (tab) => {
  try {
    const url = tab && tab.url;
    if (!url || !isHttpUrl(url)) {
      await openAppWindow('?tab=settings');
      return;
    }
    await beginSendToCove(url, tab);
  } catch (error) {
    console.error('Cove left-click failed:', error);
    await openAppWindow('?tab=download&error=' + encodeURIComponent(error.message || String(error)));
  }
});

chrome.contextMenus.onClicked.addListener(async (item, tab) => {
  try {
    let url = null;
    if (item.menuItemId === MENU_LINK_ID) {
      url = item.linkUrl;
    } else if (item.menuItemId === MENU_PAGE_ID) {
      url = tab && tab.url;
    }
    if (!url) return;
    await beginSendToCove(url, tab);
  } catch (error) {
    console.error('Cove context menu failed:', error);
    await openAppWindow('?tab=download&error=' + encodeURIComponent(error.message || String(error)));
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (!message || !message.type) {
      sendResponse({ ok: false, error: 'Unknown message' });
      return;
    }

    if (message.type === 'get-settings') {
      sendResponse({ ok: true, settings: await getSettings() });
      return;
    }

    if (message.type === 'send-to-cove') {
      try {
        const result = await beginSendToCove(message.url, sender.tab);
        sendResponse({ ok: true, ...result });
      } catch (error) {
        sendResponse({ ok: false, error: error.message || String(error) });
      }
      return;
    }

    if (message.type === 'open-settings') {
      await openAppWindow('?tab=settings');
      sendResponse({ ok: true });
      return;
    }

    sendResponse({ ok: false, error: 'Unhandled message type' });
  })();
  return true;
});
