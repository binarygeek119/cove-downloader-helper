importScripts('shared.js');

const MENU_LINK_ID = 'cove-send-link';
const MENU_PAGE_ID = 'cove-send-page';
const CONTENT_SCRIPT_ID = 'cove-inpage-buttons';
const APP_TAB_ID_KEY = 'coveHelperAppTabId';

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

async function hasBroadHostPermission() {
  return chrome.permissions.contains({
    origins: ['http://*/*', 'https://*/*'],
  });
}

async function requestBroadHostPermission() {
  const already = await hasBroadHostPermission();
  if (already) return true;
  return chrome.permissions.request({
    origins: ['http://*/*', 'https://*/*'],
  });
}

async function syncInPageContentScript() {
  const settings = await getSettings();
  const allowed = await hasBroadHostPermission();
  const want = !!settings.showInPageButtons && allowed;

  const existing = await chrome.scripting.getRegisteredContentScripts({
    ids: [CONTENT_SCRIPT_ID],
  });
  const registered = existing && existing.length > 0;

  if (want && !registered) {
    await chrome.scripting.registerContentScripts([
      {
        id: CONTENT_SCRIPT_ID,
        js: ['content.js'],
        matches: ['http://*/*', 'https://*/*'],
        runAt: 'document_idle',
        persistAcrossSessions: true,
      },
    ]);
  } else if (!want && registered) {
    await chrome.scripting.unregisterContentScripts({ ids: [CONTENT_SCRIPT_ID] });
  }
}

chrome.runtime.onInstalled.addListener(() => {
  ensureContextMenus();
  applyToolbarIcon();
  syncInPageContentScript().catch((error) => console.warn('content script sync failed', error));
});

chrome.runtime.onStartup.addListener(() => {
  ensureContextMenus();
  applyToolbarIcon();
  syncInPageContentScript().catch((error) => console.warn('content script sync failed', error));
});

applyToolbarIcon();
syncInPageContentScript().catch(() => {});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  if (changes.showInPageButtons || changes.coveUrl) {
    syncInPageContentScript().catch(() => {});
  }
});

chrome.permissions.onAdded.addListener(() => {
  syncInPageContentScript().catch(() => {});
});

chrome.permissions.onRemoved.addListener(() => {
  syncInPageContentScript().catch(() => {});
});

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
  const session = await sessionGet([APP_TAB_ID_KEY]);
  const existingId = session[APP_TAB_ID_KEY];

  if (existingId !== undefined && existingId !== null) {
    try {
      const tab = await chrome.tabs.get(existingId);
      if (tab && tab.id !== undefined) {
        await chrome.tabs.update(tab.id, { url: appUrl, active: true });
        if (tab.windowId !== undefined) {
          await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
        }
        return;
      }
    } catch (_) {
      // Tab gone; create a new one.
    }
  }

  const created = await chrome.tabs.create({ url: appUrl, active: true });
  if (created && created.id !== undefined) {
    await sessionSet({ [APP_TAB_ID_KEY]: created.id });
  }
}

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const session = await sessionGet([APP_TAB_ID_KEY]);
  if (session[APP_TAB_ID_KEY] === tabId) {
    await sessionSet({ [APP_TAB_ID_KEY]: null });
  }
});

async function beginSendToCove(url, tab) {
  if (!isHttpUrl(url)) {
    throw new Error('Only http(s) URLs can be sent to Cove.');
  }

  const granted = await requestBroadHostPermission();
  if (!granted) {
    throw new Error('Site access permission is required to talk to Cove and read page URLs.');
  }

  const settings = await getSettings();
  if (!settings.coveUrl) {
    await openAppWindow('?tab=settings');
    return { openedSettings: true };
  }

  await setPending(url, tab);
  await syncInPageContentScript();

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

    if (message.type === 'request-host-permission') {
      const granted = await requestBroadHostPermission();
      if (granted) await syncInPageContentScript();
      sendResponse({ ok: granted });
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
