/* Shared Cove helpers for the service worker and app UI. */

const YTDLP_VIDEO_ID = 'cove.community.downloaders.ytdlp/video';
const YTDLP_AUDIO_ID = 'cove.community.downloaders.ytdlp/audio';
const TEXT_DOWNLOADER_ID = 'cove.community.downloaders.common-text/literotica';
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
  return (Array.isArray(body) ? body : []).map(normalizeMatch);
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

function isTextSiteUrl(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
    return host === 'literotica.com' || host.endsWith('.literotica.com');
  } catch (_) {
    return false;
  }
}

function isAudioSiteUrl(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
    return (
      host === 'soundgasm.net' ||
      host.endsWith('.soundgasm.net') ||
      host === 'whyp.it' ||
      host.endsWith('.whyp.it')
    );
  } catch (_) {
    return false;
  }
}

/** Prefer downloaderId suffix over API entity — avoids yt-dlp/video being treated as Text. */
function resolveMatchEntity(match) {
  const id = String((match && match.downloaderId) || '');
  if (/\/video$/i.test(id) || /\/divert$/i.test(id)) return 'Video';
  if (/\/audio$/i.test(id)) return 'Audio';
  if (/\/image$/i.test(id)) return 'Image';
  if (/common-text/i.test(id) || /literotica/i.test(id)) return 'Text';

  const raw =
    (match && (match.supportedEntity || match.SupportedEntity || match.entity)) || '';
  if (raw) {
    const normalized = String(raw);
    return normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase();
  }
  return 'Video';
}

function normalizeMatch(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  const normalizedUrl = raw.normalizedUrl || raw.NormalizedUrl || raw.url || '';
  return {
    downloaderId: raw.downloaderId || raw.DownloaderId || '',
    downloaderName: raw.downloaderName || raw.DownloaderName || '',
    supportedEntity: resolveMatchEntity(raw),
    normalizedUrl,
    label: raw.label || raw.Label || '',
    qualityOptions: raw.qualityOptions || raw.QualityOptions || [],
    sourceUrl: raw.sourceUrl || raw.SourceUrl || null,
    isFallback: !!raw.isFallback,
  };
}

function entityScore(entity, preferredMode) {
  const value = String(entity || '').toLowerCase();
  const mode = String(preferredMode || 'Video').toLowerCase();
  if (value === mode) return 3;
  if (value === 'image' && mode === 'video') return 1;
  return 0;
}

function matchRank(match, preferredMode) {
  const mode = preferredMode || 'Video';
  const entity = resolveMatchEntity(match);
  let score = entityScore(entity, mode) * 10;

  // Specialized downloaders beat yt-dlp only when they match the preferred entity.
  if (!isYtDlpId(match.downloaderId) && entityScore(entity, mode) > 0) {
    score += 5;
  }

  if (isYtDlpId(match.downloaderId)) {
    if (mode === 'Audio' && /\/audio$/i.test(match.downloaderId)) score += 4;
    if (mode === 'Video' && /\/video$/i.test(match.downloaderId)) score += 4;
    if (mode !== 'Audio' && mode !== 'Text' && /\/video$/i.test(match.downloaderId)) score += 2;
  }

  // Keep Text from winning over yt-dlp on normal video/audio pages.
  if ((mode === 'Video' || mode === 'Audio') && entity === 'Text') score -= 50;
  if (mode === 'Text' && (entity === 'Video' || entity === 'Audio')) score -= 20;

  return score;
}

function defaultQualityId(match) {
  const options = (match && match.qualityOptions) || [];
  if (!options.length) return undefined;
  const best = options.find((option) => option.id === 'best');
  return (best || options[0]).id;
}

function filterMatchesForMode(matches, settings) {
  const mode = settings.preferredMode || 'Video';
  const url = (matches[0] && matches[0].normalizedUrl) || '';

  if (mode === 'Text' || isTextSiteUrl(url)) {
    const text = matches.filter((m) => resolveMatchEntity(m) === 'Text');
    if (text.length) return text;
  }

  if (mode === 'Audio' || isAudioSiteUrl(url)) {
    const audio = matches.filter((m) => resolveMatchEntity(m) === 'Audio');
    if (audio.length) return audio;
  }

  if (mode === 'Video' || mode === 'Audio') {
    const aligned = matches.filter((m) => {
      const entity = resolveMatchEntity(m);
      if (mode === 'Audio') return entity === 'Audio';
      return entity === 'Video' || entity === 'Image';
    });
    if (aligned.length) return aligned;

    // Never auto-pick Text for video/audio mode.
    const nonText = matches.filter((m) => resolveMatchEntity(m) !== 'Text');
    if (nonText.length) return nonText;
  }

  return matches;
}

function pickMatches(matches, settings) {
  const list = (Array.isArray(matches) ? matches : []).map(normalizeMatch);
  if (!list.length) return [];

  const candidates = filterMatchesForMode(list, settings);
  candidates.sort(
    (a, b) => matchRank(b, settings.preferredMode) - matchRank(a, settings.preferredMode)
  );

  if (settings.queueAllMatches) {
    return candidates;
  }
  return [candidates[0]];
}

function ytDlpFallback(url, preferredMode) {
  const audio = preferredMode === 'Audio' || isAudioSiteUrl(url);
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

/** Force Video / Audio / Text when auto-match picks the wrong type. */
function buildForcedMatch(url, mode, existingMatches) {
  const normalized = String(mode || '');
  const fromMatch = (existingMatches || [])
    .map(normalizeMatch)
    .find((match) => resolveMatchEntity(match) === normalized);
  if (fromMatch) {
    return {
      ...fromMatch,
      downloaderName: `${fromMatch.downloaderName || fromMatch.downloaderId} (override)`,
      label: fromMatch.label || `Forced ${normalized.toLowerCase()}`,
    };
  }

  if (normalized === 'Audio') {
    return {
      downloaderId: YTDLP_AUDIO_ID,
      downloaderName: 'yt-dlp Audio (override)',
      supportedEntity: 'Audio',
      normalizedUrl: url,
      label: 'Forced audio download',
      qualityOptions: [{ id: 'best', label: 'Best available' }],
      sourceUrl: null,
      isFallback: true,
    };
  }

  if (normalized === 'Text') {
    return {
      downloaderId: TEXT_DOWNLOADER_ID,
      downloaderName: 'Common Text (override)',
      supportedEntity: 'Text',
      normalizedUrl: url,
      label: 'Forced text download',
      qualityOptions: [],
      sourceUrl: null,
      isFallback: true,
    };
  }

  return {
    downloaderId: YTDLP_VIDEO_ID,
    downloaderName: 'yt-dlp Video (override)',
    supportedEntity: 'Video',
    normalizedUrl: url,
    label: 'Forced video download',
    qualityOptions: [{ id: 'best', label: 'Best available' }],
    sourceUrl: null,
    isFallback: true,
  };
}

function applyEntityOverride(url, matches, override) {
  const list = (Array.isArray(matches) ? matches : []).map(normalizeMatch);
  if (!override || override === 'auto') {
    return list;
  }
  return [buildForcedMatch(url, override, list)];
}

function buildDownloadPayload(match, settings, qualityId) {
  const normalized = normalizeMatch(match);
  const payload = {
    downloaderId: normalized.downloaderId,
    url: normalized.normalizedUrl,
    entity: resolveMatchEntity(normalized),
    autoApplyMetadata: !!settings.autoApplyMetadata,
  };
  const q = qualityId || defaultQualityId(normalized);
  if (q) payload.qualityId = q;
  if (normalized.sourceUrl) payload.sourceUrl = normalized.sourceUrl;
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
