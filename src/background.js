importScripts('shared.js', 'layout-schema.js', 'xhamster-media.js');

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
    openAppWindow('?tab=pool&side=1').catch(() => {});
  });
}

// sidePanel.open has to run in the click turn, before any await. These flags
// are refreshed from storage so that call can stay synchronous.
let openQueueOnDownload = false;
let autoSendDownloads = false;
let coveUrlConfigured = false;

function rememberQueueGestureSettings(data) {
  const source = data || {};
  openQueueOnDownload = !!source.openQueueOnDownload;
  autoSendDownloads = !!source.autoSend;
  coveUrlConfigured = !!normalizeCoveUrl(source.coveUrl || '');
}

function loadQueueGestureSettings() {
  chrome.storage.sync.get(['openQueueOnDownload', 'autoSend', 'coveUrl'], rememberQueueGestureSettings);
}

function notifyJobQueue() {
  if (!coveUrlConfigured) return;
  chrome.runtime.sendMessage({ type: 'show-job-queue' }).catch(() => {});
}

function openJobQueueForDownload(windowId) {
  if (!openQueueOnDownload || !coveUrlConfigured) return;
  openJobQueue(windowId);
  notifyJobQueue();
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
const EROME_MATCHES = [
  'http://erome.com/*',
  'https://erome.com/*',
  'http://*.erome.com/*',
  'https://*.erome.com/*',
];
let eromeSelectorToken = 0;

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

async function injectDownloaderButtonIntoOpenTabs(matches) {
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({ url: matches || HOST_ORIGINS });
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

function isDuplicateScriptError(error) {
  const message = error && error.message ? error.message : String(error || '');
  return /duplicate script id/i.test(message);
}

function sameMatchList(registered, matches) {
  const current = (registered && registered.matches) || [];
  if (current.length !== matches.length) return false;
  const left = [...current].sort();
  const right = [...matches].sort();
  return left.every((value, index) => value === right[index]);
}

async function syncInPageContentScriptNow() {
  const settings = await getSettings();
  const allowed = await hasBroadHostPermission();
  const buttons =
    !!settings.showInPageButtons ||
    !!settings.showOnSupportedSites ||
    !!settings.showStylizedDownloadButton;
  // Album hover icons on Erome stay on even when the other in-page buttons are off.
  const matches = buttons ? HOST_ORIGINS : EROME_MATCHES;
  const want = allowed;

  const existing = await chrome.scripting.getRegisteredContentScripts({
    ids: [CONTENT_SCRIPT_ID],
  });
  const registered = existing && existing[0];
  const current = !!(want && registered && sameMatchList(registered, matches));

  if (registered && !current) {
    await chrome.scripting.unregisterContentScripts({ ids: [CONTENT_SCRIPT_ID] });
  }

  if (want && !current) {
    try {
      await chrome.scripting.registerContentScripts([
        {
          id: CONTENT_SCRIPT_ID,
          js: ['content.js'],
          matches,
          runAt: 'document_idle',
          persistAcrossSessions: true,
        },
      ]);
    } catch (error) {
      // Startup, permission grant, and settings changes can all sync at once.
      // Another call may have registered this id after the check above.
      if (!isDuplicateScriptError(error)) throw error;
    }
  }

  // Registered scripts only run on later navigations. Inject now so every
  // open http(s) page gets the downloader button immediately.
  if (want) {
    await injectDownloaderButtonIntoOpenTabs(matches);
  }
}

function eromeSelectorVideos(list) {
  if (!Array.isArray(list)) return [];
  const videos = [];
  list.slice(0, 80).forEach((item) => {
    if (!item || !isHttpUrl(item.url)) return;
    const duration = typeof item.duration === 'string' ? item.duration : '';
    videos.push({
      url: item.url,
      title: String(item.title || '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Video ' + (videos.length + 1),
      thumbnail: isHttpUrl(item.thumbnail) ? item.thumbnail : '',
      duration: /^\d{1,2}:\d{2}(:\d{2})?$/.test(duration) ? duration : '',
    });
  });
  return videos;
}

function publishEromeSelector(payload) {
  chrome.storage.session.set({ eromeSelector: payload });
  chrome.runtime.sendMessage(Object.assign({ type: 'show-video-selector' }, payload)).catch(() => {});
}

// One registration at a time. Overlapping syncs both observe "not registered"
// and the second registerContentScripts throws Duplicate script ID.
let contentScriptSync = Promise.resolve();

function syncInPageContentScript() {
  const run = contentScriptSync.then(() => syncInPageContentScriptNow());
  contentScriptSync = run.then(
    () => {},
    () => {}
  );
  return run;
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
loadQueueGestureSettings();
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
  if (changes.openQueueOnDownload || changes.autoSend || changes.coveUrl) {
    if (changes.openQueueOnDownload) openQueueOnDownload = !!changes.openQueueOnDownload.newValue;
    if (changes.autoSend) autoSendDownloads = !!changes.autoSend.newValue;
    if (changes.coveUrl) coveUrlConfigured = !!normalizeCoveUrl(changes.coveUrl.newValue || '');
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

async function startVideoDownload(settings, url, sourceUrl) {
  let matches = await matchDownloaders(settings, url);
  if (!matches.length) {
    matches = [ytDlpFallback(url, 'Video')];
  }
  const chosen = applyEntityOverride(url, matches, 'Video');
  const match = chosen && chosen[0];
  if (!match) {
    throw new Error('Video is not supported for this page.');
  }
  if (isHttpUrl(sourceUrl) && sourceUrl !== url) match.sourceUrl = sourceUrl;
  await startDownload(settings, buildDownloadPayload(match, settings));
}

function sameWatchPath(pageUrl, tabUrl) {
  try {
    const page = new URL(pageUrl);
    const tab = new URL(tabUrl);
    return page.origin === tab.origin && page.pathname === tab.pathname;
  } catch (_) {
    return false;
  }
}

async function xhamsterMediaForTab(pageUrl, tab) {
  if (!isXhamsterWatchUrl(pageUrl) || !tab || tab.id === undefined) return '';
  let tabUrl = tab.url || '';
  try {
    const fresh = await chrome.tabs.get(tab.id);
    if (fresh && fresh.url) tabUrl = fresh.url;
  } catch (_) {
    return '';
  }
  if (!sameWatchPath(pageUrl, tabUrl)) return '';
  let candidates = [];
  try {
    const [injected] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: collectXhamsterPlayerUrlsInPage,
    });
    if (injected && Array.isArray(injected.result)) candidates = injected.result;
  } catch (_) {
    return '';
  }
  const stream = xhamsterStreamUrl(candidates);
  if (!stream || !isHttpUrl(stream)) return '';
  return isVideoFileUrl(stream) ? videoUrlForCove(stream, pageUrl) : withYtDlpReferer(stream, pageUrl);
}

const POOL_KEY = 'coveHelperPool';

async function getPool() {
  const data = await sessionGet([POOL_KEY]);
  return Array.isArray(data[POOL_KEY]) ? data[POOL_KEY] : [];
}

async function addToPool(entry) {
  const pool = await getPool();
  pool.push(entry);
  await sessionSet({ [POOL_KEY]: pool });
}

async function clearPool() {
  await sessionSet({ [POOL_KEY]: [] });
}

async function fetchPageThumbnail(tab) {
  if (!tab || tab.id === undefined) return '';
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const og = document.querySelector('meta[property="og:image"]');
        if (og && og.content) return og.content;
        const tw = document.querySelector('meta[name="twitter:image"]');
        if (tw && tw.content) return tw.content;
        return '';
      },
    });
    return (result && result.result) || '';
  } catch (_) {
    return '';
  }
}

async function poolUrl(url, tab) {
  const favicon = (tab && tab.favIconUrl) || `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32`;
  const title = (tab && tab.title) || new URL(url).hostname;
  const thumbnail = await fetchPageThumbnail(tab);
  await addToPool({
    url,
    addedAt: Date.now(),
    favicon,
    title,
    thumbnail,
  });
}

async function closeTabIfEnabled(tab) {
  if (!tab || tab.id === undefined) return;
  try {
    const settings = await getSettings();
    if (settings.closeTabAfterCapture) {
      await chrome.tabs.remove(tab.id);
    }
  } catch (_) {
    // Tab may already be closed.
  }
}

async function beginSendToCove(url, tab, placement, permissionGranted) {
  if (!isHttpUrl(url)) {
    throw new Error('Only http(s) URLs can be sent to Cove.');
  }

  const normalizedPlacement = placementFromEntity(placement && placement.entity);

  // First await must be permissions.request to keep the user gesture.
  const granted = permissionGranted !== undefined ? permissionGranted : await requestBroadHostPermission();
  if (!granted) {
    throw new Error('Site access permission is required to talk to Cove and read page URLs.');
  }

  const settings = await getSettings();
  if (!settings.coveUrl) {
    await openAppWindow('?tab=settings');
    return { openedSettings: true };
  }

  if (settings.poolDownloader) {
    await poolUrl(url, tab);
    chrome.runtime.sendMessage({ type: 'show-pool' }).catch(() => {});
    await closeTabIfEnabled(tab);
    return { ok: true, pooled: true };
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
  const mediaUrl = await xhamsterMediaForTab(url, tab);
  const downloadUrl = mediaUrl || url;
  if (normalizedPlacement && normalizedPlacement.entity === 'Video') {
    await startVideoDownload(settings, downloadUrl, mediaUrl ? url : '');
    await closeTabIfEnabled(tab);
    return { ok: true, started: true };
  }

  await setPending(downloadUrl, tab, normalizedPlacement && normalizedPlacement.entity);
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

  await closeTabIfEnabled(tab);
  return { ok: true };
}

chrome.action.onClicked.addListener((tab) => {
  // The pinned icon opens the job queue. Both calls stay in this click turn:
  // the panel needs the gesture, and site access lets the video list keep working.
  openJobQueue(tab && tab.windowId);
  notifyJobQueue();
  void requestBroadHostPermission();
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== 'send-page-to-cove') return;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    if (!tab || !tab.url) return;
    if (autoSendDownloads) openJobQueueForDownload(tab.windowId);
    const granted = requestBroadHostPermission();
    const run = async () => {
      try {
        const permissionResult = await granted;
        await beginSendToCove(tab.url, tab, null, permissionResult);
      } catch (error) {
        console.error('Cove keyboard shortcut failed:', error);
        const message = error && error.message ? error.message : String(error);
        await openAppWindow('?tab=download&error=' + encodeURIComponent(message));
      }
    };
    void run();
  });
});

chrome.contextMenus.onClicked.addListener((item, tab) => {
  if (item.menuItemId === MENU_QUEUE_ID || item.menuItemId === MENU_QUEUE_ACTION_ID) {
    // Both calls stay in this click turn. The panel needs the gesture, and
    // site access lets the video list keep working after the page changes.
    openJobQueue(tab && tab.windowId);
    void requestBroadHostPermission();
    return;
  }
  let url = null;
  if (item.menuItemId === MENU_LINK_ID) {
    url = item.linkUrl;
  } else if (item.menuItemId === MENU_PAGE_ID) {
    url = tab && tab.url;
  }
  if (url && isHttpUrl(url) && autoSendDownloads) openJobQueueForDownload(tab && tab.windowId);
  const granted = requestBroadHostPermission();
  const run = async () => {
    try {
      if (!url) return;
      const permissionResult = await granted;
      await beginSendToCove(url, tab, null, permissionResult);
    } catch (error) {
      console.error('Cove context menu failed:', error);
      const message = error && error.message ? error.message : String(error);
      await openAppWindow('?tab=download&error=' + encodeURIComponent(message));
    }
  };
  void run();
});

const PROGRESSIVE_VIDEO_EXT = /\.(?:mp4|m4v|webm|mov|mkv|ogv|ogg|flv)$/i;
const STREAM_VIDEO_EXT = /\.(?:m3u8|mpd)$/i;

function pathHasExt(url, pattern) {
  try {
    return pattern.test(new URL(url).pathname);
  } catch (_) {
    return false;
  }
}

function isVideoFileUrl(url) {
  return pathHasExt(url, PROGRESSIVE_VIDEO_EXT) || pathHasExt(url, STREAM_VIDEO_EXT);
}

function utf8Base64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function fileNameForCove(mediaUrl) {
  let base = 'video.mp4';
  try {
    const segment = new URL(mediaUrl).pathname.split('/').filter(Boolean).pop();
    if (segment) {
      try {
        base = decodeURIComponent(segment);
      } catch (_) {
        base = segment;
      }
    }
  } catch (_) {
    // Keep the fallback name.
  }
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, '_');
  if (/\.[A-Za-z0-9]+$/.test(cleaned)) return cleaned.slice(0, 120);
  return (cleaned.slice(0, 110) || 'video') + '.mp4';
}

function streamResolution(fileName) {
  const match = String(fileName).match(/(?:^|[^0-9])(240|360|480|720|1080|1440|2160)p/i);
  const height = match ? Number(match[1]) : 720;
  const width = { 240: 426, 360: 640, 480: 854, 720: 1280, 1080: 1920, 1440: 2560, 2160: 3840 }[height] || 1280;
  return width + 'x' + height;
}

function withYtDlpReferer(url, pageUrl) {
  if (!isHttpUrl(pageUrl)) return url;
  try {
    const page = new URL(pageUrl);
    const payload = encodeURIComponent(JSON.stringify({ referer: page.href }));
    return url + '#__youtubedl_smuggle=' + payload;
  } catch (_) {
    return url;
  }
}

// A bare MP4 has no codec and no height, so Cove's yt-dlp downloader reports
// that it is not a video. One HLS segment keeps the original file bytes and
// gives yt-dlp a codec. The page referer is what a browser save sends; file
// hosts such as Erome reject the download without it.
function progressiveVideoUrlForCove(mediaUrl, pageUrl) {
  const media = new URL(mediaUrl);
  media.hash = '';
  const fileHref = media.href.replace(/[\r\n]/g, '');
  const fileName = fileNameForCove(fileHref);
  const mediaPlaylist = [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    '#EXT-X-TARGETDURATION:86400',
    '#EXT-X-PLAYLIST-TYPE:VOD',
    '#EXTINF:86400.0,',
    fileHref,
    '#EXT-X-ENDLIST',
    '',
  ].join('\n');
  const masterPlaylist = [
    '#EXTM3U',
    '#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=' +
      streamResolution(fileName) +
      ',CODECS="avc1.4d401f,mp4a.40.2"',
    'data:application/vnd.apple.mpegurl;base64,' + utf8Base64(mediaPlaylist),
    '',
  ].join('\n');
  const wrapped =
    'data:application/vnd.apple.mpegurl;filename=/' +
    fileName +
    ';base64,' +
    utf8Base64(masterPlaylist);
  return withYtDlpReferer(wrapped, pageUrl);
}

function videoUrlForCove(mediaUrl, pageUrl) {
  try {
    if (pathHasExt(mediaUrl, PROGRESSIVE_VIDEO_EXT)) {
      return progressiveVideoUrlForCove(mediaUrl, pageUrl);
    }
    if (!pathHasExt(mediaUrl, STREAM_VIDEO_EXT) || !isHttpUrl(pageUrl)) return mediaUrl;
    const media = new URL(mediaUrl);
    const page = new URL(pageUrl);
    if (media.href === page.href) return mediaUrl;
    return withYtDlpReferer(media.href, page.href);
  } catch (_) {
    return mediaUrl;
  }
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out reading videos on the page.')), ms);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

async function collectPageVideos(tabId) {
  if (!tabId) return { videos: [], pageUrl: '' };
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['page-videos.js'],
  });
  const [injected] = await withTimeout(
    chrome.scripting.executeScript({
      target: { tabId },
      func: () => (globalThis.coveCollectPageVideos ? globalThis.coveCollectPageVideos() : { videos: [] }),
    }),
    8000
  );
  const result = injected && injected.result;
  if (Array.isArray(result)) return { videos: result, pageUrl: '' };
  const videos = result && Array.isArray(result.videos) ? result.videos : [];
  return {
    videos,
    pageUrl: (result && result.pageUrl) || '',
    unchanged: !!(result && result.unchanged),
    count: result && result.count,
  };
}

async function downloadPageVideos(urls, pageUrl) {
  const granted = await requestBroadHostPermission();
  if (!granted) {
    throw new Error('Site access permission is required to talk to Cove.');
  }
  const settings = await getSettings();
  if (!settings.coveUrl) {
    await openAppWindow('?tab=settings');
    return { openedSettings: true, started: 0 };
  }
  const list = (Array.isArray(urls) ? urls : []).filter((url) => isHttpUrl(url));
  const referer = isHttpUrl(pageUrl) ? pageUrl : '';
  let started = 0;
  let failed = 0;
  let error = '';
  for (const url of list) {
    try {
      if (isVideoFileUrl(url)) {
        const match = ytDlpFallback(videoUrlForCove(url, referer), 'Video');
        if (referer) match.sourceUrl = referer;
        await startDownload(settings, buildDownloadPayload(match, settings));
      } else {
        await startVideoDownload(settings, url);
      }
      started += 1;
    } catch (downloadError) {
      failed += 1;
      if (!error) error = downloadError.message || String(downloadError);
    }
  }
  if (!started && error) throw new Error(error);
  return { started, failed, error };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      if (!message || !message.type) {
        sendResponse({ ok: false, error: 'Unknown message' });
        return;
      }

      if (message.type === 'open-erome-selector') {
        if (!isHttpUrl(message.albumUrl)) {
          sendResponse({ ok: false, error: 'Missing album URL' });
          return;
        }
        eromeSelectorToken += 1;
        const token = eromeSelectorToken;
        openJobQueue(sender.tab && sender.tab.windowId);
        publishEromeSelector({ token, albumUrl: message.albumUrl, loading: true, videos: [] });
        sendResponse({ ok: true, token });
        return;
      }

      if (message.type === 'erome-selector-ready') {
        if (message.token !== eromeSelectorToken) {
          sendResponse({ ok: true, ignored: true });
          return;
        }
        publishEromeSelector({
          token: message.token,
          albumUrl: message.albumUrl,
          loading: false,
          videos: eromeSelectorVideos(message.videos),
          error: typeof message.error === 'string' ? message.error.slice(0, 180) : '',
        });
        sendResponse({ ok: true });
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

      if (message.type === 'sync-in-page-buttons') {
        if (await hasBroadHostPermission()) await syncInPageContentScript();
        sendResponse({ ok: true });
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

      if (message.type === 'collect-page-videos') {
        try {
          const result = await collectPageVideos(message.tabId);
          sendResponse({ ok: true, ...result });
        } catch (error) {
          sendResponse({ ok: false, error: error.message || String(error), videos: [] });
        }
        return;
      }

      if (message.type === 'download-page-videos') {
        const videoUrls = Array.isArray(message.urls) ? message.urls.filter((url) => isHttpUrl(url)) : [];
        if (videoUrls.length) openJobQueueForDownload(sender.tab && sender.tab.windowId);
        try {
          const result = await downloadPageVideos(message.urls, message.pageUrl);
          sendResponse({ ok: true, ...result });
        } catch (error) {
          sendResponse({ ok: false, error: error.message || String(error) });
        }
        return;
      }

      if (message.type === 'send-to-cove') {
        if ((message.entity === 'Video' || autoSendDownloads) && isHttpUrl(message.url)) {
          openJobQueueForDownload(sender.tab && sender.tab.windowId);
        }
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

      if (message.type === 'get-pool') {
        const pool = await getPool();
        sendResponse({ ok: true, pool });
        return;
      }

      if (message.type === 'send-pool-to-cove') {
        const pool = await getPool();
        const settings = await getSettings();
        if (!settings.coveUrl) {
          await openAppWindow('?tab=settings');
          sendResponse({ ok: false, openedSettings: true });
          return;
        }
        let started = 0;
        let failed = 0;
        let error = '';
        for (const entry of pool) {
          if (!entry || !isHttpUrl(entry.url)) {
            failed += 1;
            continue;
          }
          try {
            let matches = await matchDownloaders(settings, entry.url);
            if (!matches.length) {
              matches = [ytDlpFallback(entry.url, settings.preferredMode)];
            }
            const chosen = pickMatches(matches, settings);
            if (!chosen.length) throw new Error('No downloader matched.');
            for (const match of chosen) {
              await startDownload(settings, buildDownloadPayload(match, settings));
              started += 1;
            }
          } catch (downloadError) {
            failed += 1;
            if (!error) error = downloadError.message || String(downloadError);
          }
        }
        await clearPool();
        sendResponse({ ok: true, started, failed, error });
        return;
      }

      if (message.type === 'download-pool-as-txt') {
        const pool = await getPool();
        const text = pool.map((entry) => entry.url).join('\n') + '\n';
        const dataUrl = 'data:text/plain;charset=utf-8,' + encodeURIComponent(text);
        await chrome.downloads.download({
          url: dataUrl,
          filename: 'cove-pool.txt',
          saveAs: true,
        });
        await clearPool();
        sendResponse({ ok: true });
        return;
      }

      if (message.type === 'clear-pool') {
        await clearPool();
        sendResponse({ ok: true });
        return;
      }

      sendResponse({ ok: false, error: 'Unhandled message type' });
    } catch (error) {
      const messageText = error && error.message ? error.message : String(error);
      try {
        sendResponse({ ok: false, error: messageText });
      } catch (_) {
        // The response was already sent.
      }
    }
  })();
  return true;
});
