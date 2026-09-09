/* Shared Cove helpers for the service worker and app UI. */

const YTDLP_VIDEO_ID = 'cove.community.downloaders.ytdlp/video';
const YTDLP_AUDIO_ID = 'cove.community.downloaders.ytdlp/audio';
const APP_WINDOW_ID_KEY = 'coveHelperAppWindowId';
const PENDING_KEY = 'coveHelperPending';

const DEFAULT_SETTINGS = {
  coveUrl: '',
  apiToken: '',
  preferredMode: 'Video',
  showInPageButtons: true,
  autoSend: false,
  queueAllMatches: false,
  autoApplyMetadata: true,
};

function normalizeCoveUrl(url) {
  if (!url) return '';
  return String(url).trim().replace(/\/+$/, '');
}

function storageGet(keys) {
  return new Promise((resolve) => {
    chrome.storage.sync.get(keys, (data) => resolve(data || {}));
  });
}

function storageSet(values) {
  return new Promise((resolve) => {
    chrome.storage.sync.set(values, () => resolve());
  });
}

function sessionGet(keys) {
  return new Promise((resolve) => {
    chrome.storage.session.get(keys, (data) => resolve(data || {}));
  });
}

function sessionSet(values) {
  return new Promise((resolve) => {
    chrome.storage.session.set(values, () => resolve());
  });
}

async function getSettings() {
  const data = await storageGet(Object.keys(DEFAULT_SETTINGS));
  return {
    coveUrl: normalizeCoveUrl(data.coveUrl || ''),
    apiToken: data.apiToken || '',
    preferredMode: data.preferredMode || DEFAULT_SETTINGS.preferredMode,
    showInPageButtons:
      data.showInPageButtons === undefined
        ? DEFAULT_SETTINGS.showInPageButtons
        : !!data.showInPageButtons,
    autoSend: !!data.autoSend,
    queueAllMatches: !!data.queueAllMatches,
    autoApplyMetadata:
      data.autoApplyMetadata === undefined
        ? DEFAULT_SETTINGS.autoApplyMetadata
        : !!data.autoApplyMetadata,
  };
}

function authHeaders(settings, extra) {
  const headers = Object.assign(
    {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    extra || {}
  );
  if (settings.apiToken) {
    headers.Authorization = `Bearer ${settings.apiToken}`;
  }
  return headers;
}

async function coveFetch(settings, path, options) {
  if (!settings.coveUrl) {
    throw new Error('Cove URL is not configured. Open Settings and save your Cove base URL.');
  }
  const response = await fetch(`${settings.coveUrl}${path}`, {
    ...options,
    headers: authHeaders(settings, options && options.headers),
  });

  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch (_) {
      body = text;
    }
  }

  if (!response.ok) {
    const message =
      (body && body.error) ||
      (typeof body === 'string' && body) ||
      `${response.status} ${response.statusText}`;
    const error = new Error(message);
    error.status = response.status;
    error.body = body;
    throw error;
  }

  return { response, body };
}

async function matchDownloaders(settings, url) {
  const { body } = await coveFetch(settings, '/api/system/downloaders/match', {
    method: 'POST',
    body: JSON.stringify({ url }),
  });
  return Array.isArray(body) ? body : [];
}

async function startDownload(settings, payload) {
  const { body } = await coveFetch(settings, '/api/system/downloaders/download', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return body;
}

async function getJobs(settings) {
  const { body } = await coveFetch(settings, '/api/jobs', { method: 'GET' });
  return Array.isArray(body) ? body : [];
}

async function getJobHistory(settings) {
  const { body } = await coveFetch(settings, '/api/jobs/history', { method: 'GET' });
  return Array.isArray(body) ? body : [];
}

async function getJob(settings, jobId) {
  const { body } = await coveFetch(settings, `/api/jobs/${encodeURIComponent(jobId)}`, {
    method: 'GET',
  });
  return body;
}

async function cancelJob(settings, jobId) {
  await coveFetch(settings, `/api/jobs/${encodeURIComponent(jobId)}`, {
    method: 'DELETE',
  });
}

function isYtDlpId(downloaderId) {
  return String(downloaderId || '').startsWith('cove.community.downloaders.ytdlp/');
}

function entityScore(entity, preferredMode) {
  const value = String(entity || '');
  if (value.toLowerCase() === String(preferredMode || '').toLowerCase()) return 3;
  if (value === 'Image' && preferredMode !== 'Text') return 1;
  return 0;
}

function matchRank(match, preferredMode) {
  let score = entityScore(match.supportedEntity, preferredMode) * 10;
  if (!isYtDlpId(match.downloaderId)) score += 5;
  if (isYtDlpId(match.downloaderId)) {
    if (preferredMode === 'Audio' && /\/audio$/i.test(match.downloaderId)) score += 2;
    if (preferredMode !== 'Audio' && /\/video$/i.test(match.downloaderId)) score += 2;
  }
  return score;
}

function defaultQualityId(match) {
  const options = (match && match.qualityOptions) || [];
  if (!options.length) return undefined;
  const best = options.find((option) => option.id === 'best');
  return (best || options[0]).id;
}

function pickMatches(matches, settings) {
  const list = Array.isArray(matches) ? matches.slice() : [];
  if (!list.length) return [];

  list.sort(
    (a, b) => matchRank(b, settings.preferredMode) - matchRank(a, settings.preferredMode)
  );

  if (settings.queueAllMatches) {
    return list;
  }
  return [list[0]];
}

function ytDlpFallback(url, preferredMode) {
  const audio = preferredMode === 'Audio';
  return {
    downloaderId: audio ? YTDLP_AUDIO_ID : YTDLP_VIDEO_ID,
    downloaderName: audio ? 'yt-dlp Audio (fallback)' : 'yt-dlp Video (fallback)',
    supportedEntity: audio ? 'Audio' : 'Video',
    normalizedUrl: url,
    label: 'yt-dlp fallback',
    qualityOptions: [{ id: 'best', label: 'Best available' }],
    sourceUrl: null,
    isFallback: true,
  };
}

function buildDownloadPayload(match, settings, qualityId) {
  const payload = {
    downloaderId: match.downloaderId,
    url: match.normalizedUrl || match.url,
    entity: match.supportedEntity,
    autoApplyMetadata: !!settings.autoApplyMetadata,
  };
  const q = qualityId || defaultQualityId(match);
  if (q) payload.qualityId = q;
  if (match.sourceUrl) payload.sourceUrl = match.sourceUrl;
  return payload;
}

function isHttpUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

function sameOriginAsCove(pageUrl, coveUrl) {
  try {
    if (!coveUrl) return false;
    return new URL(pageUrl).origin === new URL(coveUrl).origin;
  } catch (_) {
    return false;
  }
}
