importScripts('shared.js', 'layout-schema.js');

const MENU_LINK_ID = 'cove-send-link';
const MENU_PAGE_ID = 'cove-send-page';
const MENU_QUEUE_ID = 'cove-open-queue';
const MENU_QUEUE_ACTION_ID = 'cove-open-queue-action';
const JOB_QUEUE_PATH = 'app.html?tab=queue&side=1';
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
    chrome.contextMenus.create({
      id: MENU_QUEUE_ID,
      title: 'Open job queue',
      contexts: ['page'],
      documentUrlPatterns: ['http://*/*', 'https://*/*'],
    });
    chrome.contextMenus.create({
      id: MENU_QUEUE_ACTION_ID,
      title: 'Open job queue',
      contexts: ['action'],
    });
  });
}

function enableJobQueuePanel() {
  if (!chrome.sidePanel) return;
  chrome.sidePanel.setOptions({ path: JOB_QUEUE_PATH, enabled: true }).catch(() => {});
}

function openJobQueue(windowId) {
  if (!chrome.sidePanel || windowId === undefined || windowId === null) return;
  chrome.sidePanel.open({ windowId }).catch((error) => {
    console.error('Could not open job queue', error);
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

const HOST_ORIGINS = ['http://*/*', 'https://*/*'];

async function hasBroadHostPermission() {
  return chrome.permissions.contains({
    origins: HOST_ORIGINS,
  });
}

/**
 * Request optional host access. Must not await anything before
 * chrome.permissions.request or Chrome drops the user-gesture and the prompt fails.
 */
function requestBroadHostPermission() {
  return chrome.permissions.request({
    origins: HOST_ORIGINS,
  });
}

async function injectDownloaderButtonIntoOpenTabs() {
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({ url: HOST_ORIGINS });
  } catch (_) {
    return;
  }

  await Promise.all(
    tabs.map(async (tab) => {
      if (!tab.id || tab.discarded) return;
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id, allFrames: false },
          files: ['content.js'],
        });
      } catch (_) {
        // Restricted, prerendered, or closed tabs cannot take the button.
      }
    })
  );
}

async function syncInPageContentScript() {
  const settings = await getSettings();
  const allowed = await hasBroadHostPermission();
  const want =
    (!!settings.showInPageButtons ||
      !!settings.showOnSupportedSites ||
      !!settings.showStylizedDownloadButton) &&
    allowed;

  const existing = await chrome.scripting.getRegisteredContentScripts({
    ids: [CONTENT_SCRIPT_ID],
  });
  const registered = existing && existing.length > 0;

  if (want && !registered) {
    await chrome.scripting.registerContentScripts([
      {
        id: CONTENT_SCRIPT_ID,
        js: ['content.js'],
        matches: HOST_ORIGINS,
        runAt: 'document_idle',
        persistAcrossSessions: true,
      },
    ]);
  } else if (!want && registered) {
    await chrome.scripting.unregisterContentScripts({ ids: [CONTENT_SCRIPT_ID] });
  }

  // Registered scripts only run on later navigations. Inject now so every
  // open http(s) page gets the downloader button immediately.
  if (want) {
    await injectDownloaderButtonIntoOpenTabs();
  }
}

chrome.runtime.onInstalled.addListener(() => {
  ensureContextMenus();
  enableJobQueuePanel();
  applyToolbarIcon();
  syncInPageContentScript().catch((error) => console.warn('content script sync failed', error));
});

chrome.runtime.onStartup.addListener(() => {
  ensureContextMenus();
  enableJobQueuePanel();
  applyToolbarIcon();
  syncInPageContentScript().catch((error) => console.warn('content script sync failed', error));
});

enableJobQueuePanel();

applyToolbarIcon();
syncInPageContentScript().catch(() => {});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!changeInfo.url) return;
  chrome.tabs.sendMessage(tabId, { type: 'cove-url-changed', url: changeInfo.url }).catch(() => {});
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  if (
    changes.showInPageButtons ||
    changes.showOnSupportedSites ||
    changes.showStylizedDownloadButton ||
    changes.coveUrl
  ) {
    syncInPageContentScript().catch(() => {});
  }
});

chrome.permissions.onAdded.addListener(() => {
  syncInPageContentScript().catch(() => {});
});

chrome.permissions.onRemoved.addListener(() => {
  syncInPageContentScript().catch(() => {});
});

async function setPending(url, tab, entity) {
  const pending = {
    url,
    openedAt: Date.now(),
    sourceTabId: tab && tab.id,
  };
  if (entity === 'Video' || entity === 'Image' || entity === 'Text') {
    pending.entity = entity;
  }
  await sessionSet({
    [PENDING_KEY]: pending,
  });
}

function placementFromEntity(entity) {
  if (entity !== 'Video' && entity !== 'Image' && entity !== 'Text') return null;
  return {
    entity,
    strict: entity === 'Image' || entity === 'Text',
  };
}

let cachedLayouts = null;

async function loadSiteLayouts() {
  if (cachedLayouts) return cachedLayouts;
  const layouts = [];
  try {
    const indexResponse = await fetch(chrome.runtime.getURL('layouts/index.json'));
    if (indexResponse.ok) {
      const names = await indexResponse.json();
      if (Array.isArray(names)) {
        for (const name of names) {
          if (typeof name !== 'string' || !/^[a-z0-9-]+\.lay$/i.test(name)) continue;
          try {
            const response = await fetch(chrome.runtime.getURL(`layouts/${name}`));
            if (!response.ok) continue;
            const data = await response.json();
            if (validateLayout(data).length) {
              console.warn('Ignoring invalid layout', name);
              continue;
            }
            layouts.push(data);
          } catch (error) {
            console.warn('Ignoring unreadable layout', name, error);
          }
        }
      }
    }
  } catch (error) {
    console.warn('Layout index unavailable', error);
  }
  cachedLayouts = layouts;
  return layouts;
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

async function startVideoDownload(settings, url) {
  let matches = await matchDownloaders(settings, url);
  if (!matches.length) {
    matches = [ytDlpFallback(url, 'Video')];
  }
  const chosen = applyEntityOverride(url, matches, 'Video');
  const match = chosen && chosen[0];
  if (!match) {
    throw new Error('Video is not supported for this page.');
  }
  await startDownload(settings, buildDownloadPayload(match, settings));
}

async function beginSendToCove(url, tab, placement) {
  if (!isHttpUrl(url)) {
    throw new Error('Only http(s) URLs can be sent to Cove.');
  }

  const normalizedPlacement = placementFromEntity(placement && placement.entity);

  // First await must be permissions.request to keep the user gesture.
  const granted = await requestBroadHostPermission();
  if (!granted) {
    throw new Error('Site access permission is required to talk to Cove and read page URLs.');
  }

  const settings = await getSettings();
  if (!settings.coveUrl) {
    await openAppWindow('?tab=settings');
    return { openedSettings: true };
  }

  if (normalizedPlacement && normalizedPlacement.strict) {
    let matches = [];
    try {
      matches = await matchDownloaders(settings, url);
    } catch (error) {
      throw new Error(
        (error && error.message) || `${normalizedPlacement.entity} is not supported for this page.`
      );
    }
    const aligned = matches.filter((match) => resolveMatchEntity(match) === normalizedPlacement.entity);
    if (!aligned.length) {
      throw new Error(`${normalizedPlacement.entity} is not supported for this page.`);
    }
  }

  // A stylized video button already chose Video. Queue that download here
  // instead of opening the helper to confirm the type.
  if (normalizedPlacement && normalizedPlacement.entity === 'Video') {
    await startVideoDownload(settings, url);
    return { ok: true, started: true };
  }

  await setPending(url, tab, normalizedPlacement && normalizedPlacement.entity);
  try {
    await syncInPageContentScript();
  } catch (error) {
    console.warn('content script sync failed', error);
  }

  if (settings.autoSend) {
    await openAppWindow('?tab=download&auto=1');
  } else {
    await openAppWindow('?tab=download');
  }

  return { ok: true };
}

chrome.action.onClicked.addListener((tab) => {
  const url = tab && tab.url;
  const run = async () => {
    try {
      if (!url || !isHttpUrl(url)) {
        await openAppWindow('?tab=settings');
        return;
      }
      await beginSendToCove(url, tab);
    } catch (error) {
      console.error('Cove left-click failed:', error);
      const message = error && error.message ? error.message : String(error);
      await openAppWindow('?tab=download&error=' + encodeURIComponent(message));
    }
  };
  // Kick off without awaiting other work first so permission request stays gesture-bound.
  void run();
});

chrome.contextMenus.onClicked.addListener((item, tab) => {
  if (item.menuItemId === MENU_QUEUE_ID || item.menuItemId === MENU_QUEUE_ACTION_ID) {
    openJobQueue(tab && tab.windowId);
    return;
  }
  const run = async () => {
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
      const message = error && error.message ? error.message : String(error);
      await openAppWindow('?tab=download&error=' + encodeURIComponent(message));
    }
  };
  void run();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (!message || !message.type) {
      sendResponse({ ok: false, error: 'Unknown message' });
      return;
    }

    if (message.type === 'get-settings') {
      const settings = await getSettings();
      const extraHosts = await getExtraSupportedHosts(settings);
      settings.supportedHosts = SUPPORTED_SITE_HOSTS.concat(extraHosts);
      sendResponse({ ok: true, settings });
      return;
    }

    if (message.type === 'request-host-permission') {
      const granted = await requestBroadHostPermission();
      if (granted) await syncInPageContentScript();
      sendResponse({ ok: granted });
      return;
    }

    if (message.type === 'get-stylized-layout') {
      const settings = await getSettings();
      if (!settings.showStylizedDownloadButton) {
        sendResponse({ ok: true, targets: [] });
        return;
      }
      const tabUrl = (sender.tab && sender.tab.url) || '';
      let pageUrl = tabUrl;
      if (message.url && tabUrl) {
        try {
          const requested = new URL(message.url);
          const tab = new URL(tabUrl);
          if (requested.origin === tab.origin) pageUrl = requested.href;
        } catch (_) {
          pageUrl = tabUrl;
        }
      }
      const targets = matchLayoutTargets(await loadSiteLayouts(), pageUrl);
      sendResponse({ ok: true, targets });
      return;
    }

    if (message.type === 'send-to-cove') {
      try {
        const result = await beginSendToCove(message.url, sender.tab, { entity: message.entity });
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
