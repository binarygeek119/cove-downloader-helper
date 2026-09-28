// xHamster stores player addresses as hex ciphertext. The open page has the
// ciphertext; Cove's copy of yt-dlp often sees a page with no formats.

function xhamsterByteGenerator(algoId, seed) {
  const state = { s: seed | 0 };
  const step = {
    1() {
      state.s = (Math.imul(state.s, 1664525) + 1013904223) | 0;
      return state.s;
    },
    2() {
      let s = state.s;
      s = (s ^ (s << 13)) | 0;
      s = (s ^ (s >>> 17)) | 0;
      state.s = (s ^ (s << 5)) | 0;
      return state.s;
    },
    3() {
      let s = (state.s + 0x9e3779b9) | 0;
      state.s = s;
      s = (s ^ (s >>> 16)) | 0;
      s = Math.imul(s, 0x85ebca77);
      s = (s ^ (s >>> 13)) | 0;
      s = Math.imul(s, 0xc2b2ae3d);
      return (s ^ (s >>> 16)) | 0;
    },
    4() {
      let s = (state.s + 0x6d2b79f5) | 0;
      state.s = s;
      s = ((s << 7) | (s >>> 25)) | 0;
      s = (s + 0x9e3779b9) | 0;
      s = (s ^ (s >>> 11)) | 0;
      return Math.imul(s, 0x27d4eb2d);
    },
    5() {
      let s = state.s;
      s = (s ^ (s << 7)) | 0;
      s = (s ^ (s >>> 9)) | 0;
      s = (s ^ (s << 8)) | 0;
      state.s = (s + 0xa5a5a5a5) | 0;
      return state.s;
    },
    6() {
      const s = (Math.imul(state.s, 0x2c9277b5) + (0xac564b05 | 0)) | 0;
      state.s = s;
      const s2 = (s ^ (s >>> 18)) | 0;
      const shift = (s >>> 27) & 31;
      return (s2 >>> shift) | 0;
    },
    7() {
      const s = (state.s + 0x9e3779b9) | 0;
      state.s = s;
      let mixed = (s ^ (s << 5)) | 0;
      mixed = Math.imul(mixed, 0x7feb352d);
      mixed = (mixed ^ (mixed >>> 15)) | 0;
      return Math.imul(mixed, 0x846ca68b);
    },
  }[algoId];
  if (!step) return null;
  return () => step() & 0xff;
}

function decipherXhamsterHex(hex) {
  if (typeof hex !== 'string' || !/^[0-9a-fA-F]{12,}$/.test(hex) || hex.length % 2 !== 0) return '';
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  const seed = (bytes[1] | (bytes[2] << 8) | (bytes[3] << 16) | (bytes[4] << 24)) | 0;
  const next = xhamsterByteGenerator(bytes[0], seed);
  if (!next) return '';
  let text = '';
  for (let index = 5; index < bytes.length; index += 1) {
    text += String.fromCharCode(bytes[index] ^ next());
  }
  return text;
}

function resolveXhamsterFormatUrl(formatUrl) {
  if (typeof formatUrl !== 'string') return '';
  const trimmed = formatUrl.trim();
  if (!trimmed || trimmed.indexOf('blob:') === 0 || trimmed.indexOf('data:') === 0) return '';
  if (/^[0-9a-fA-F]+$/.test(trimmed)) {
    const text = decipherXhamsterHex(trimmed);
    return /^https?:\/\//i.test(text) ? text : '';
  }
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch (_) {
    return '';
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
  const match = parsed.pathname.match(/^\/([0-9a-fA-F]{12,})([/,].+)$/);
  if (!match) return parsed.href;
  const text = decipherXhamsterHex(match[1]);
  if (!text) return '';
  return (
    parsed.protocol +
    '//' +
    parsed.host +
    '/' +
    text.replace(/^\/+/, '') +
    match[2] +
    parsed.search +
    parsed.hash
  );
}

function xhamsterPlaylistUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    if (!/\.m3u8$/i.test(parsed.pathname)) return '';
    return parsed.href;
  } catch (_) {
    return '';
  }
}

function xhamsterStreamUrl(candidates) {
  const list = Array.isArray(candidates) ? candidates : [];
  for (let index = 0; index < list.length; index += 1) {
    const playlist = xhamsterPlaylistUrl(resolveXhamsterFormatUrl(list[index]));
    if (playlist) return playlist;
  }
  return '';
}

function rememberXhamsterCandidate(list, value) {
  if (typeof value !== 'string') return;
  const raw = value.trim();
  if (!raw || raw.indexOf('blob:') === 0 || raw.indexOf('data:') === 0) return;
  list.push(raw);
}

function xhamsterPlayerCandidates(initials, extraUrls) {
  const found = [];
  const sources = initials && initials.xplayerSettings && initials.xplayerSettings.sources;
  if (sources && typeof sources === 'object') {
    const hls = sources.hls;
    if (hls && typeof hls === 'object') {
      rememberXhamsterCandidate(found, hls.url);
      rememberXhamsterCandidate(found, hls.fallback);
    }
    const standard = sources.standard;
    if (standard && typeof standard === 'object') {
      Object.keys(standard).forEach((key) => {
        const group = standard[key];
        if (!Array.isArray(group)) return;
        group.forEach((item) => {
          if (!item || typeof item !== 'object') return;
          rememberXhamsterCandidate(found, item.url);
          rememberXhamsterCandidate(found, item.fallback);
        });
      });
    }
  }
  const model = initials && initials.videoModel && initials.videoModel.sources;
  if (model && typeof model === 'object') {
    Object.keys(model).forEach((formatId) => {
      if (formatId === 'download') return;
      const group = model[formatId];
      if (!group || typeof group !== 'object' || Array.isArray(group)) return;
      Object.keys(group).forEach((quality) => rememberXhamsterCandidate(found, group[quality]));
    });
  }
  (Array.isArray(extraUrls) ? extraUrls : []).forEach((url) => rememberXhamsterCandidate(found, url));
  return found;
}

function isXhamsterWatchUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    if (typeof hostMatchesSite !== 'function' || !hostMatchesSite(parsed.hostname, 'xhamster.com')) return false;
    const path = parsed.pathname || '/';
    return path === '/videos/' || path.startsWith('/videos/');
  } catch (_) {
    return false;
  }
}

// Runs in the page. It only returns address strings.
function collectXhamsterPlayerUrlsInPage() {
  const found = [];
  const remember = (value) => {
    if (typeof value !== 'string') return;
    const raw = value.trim();
    if (!raw || raw.indexOf('blob:') === 0 || raw.indexOf('data:') === 0) return;
    found.push(raw);
  };
  const initials = window.initials;
  const sources = initials && initials.xplayerSettings && initials.xplayerSettings.sources;
  if (sources && typeof sources === 'object') {
    const hls = sources.hls;
    if (hls && typeof hls === 'object') {
      remember(hls.url);
      remember(hls.fallback);
    }
    const standard = sources.standard;
    if (standard && typeof standard === 'object') {
      Object.keys(standard).forEach((key) => {
        const group = standard[key];
        if (!Array.isArray(group)) return;
        group.forEach((item) => {
          if (!item || typeof item !== 'object') return;
          remember(item.url);
          remember(item.fallback);
        });
      });
    }
  }
  const model = initials && initials.videoModel && initials.videoModel.sources;
  if (model && typeof model === 'object') {
    Object.keys(model).forEach((formatId) => {
      if (formatId === 'download') return;
      const group = model[formatId];
      if (!group || typeof group !== 'object' || Array.isArray(group)) return;
      Object.keys(group).forEach((quality) => remember(group[quality]));
    });
  }
  try {
    const video = document.querySelector('video');
    const src = video && (video.currentSrc || video.src);
    remember(src);
  } catch (_) {
    // The page has no player yet.
  }
  try {
    performance.getEntriesByType('resource').forEach((entry) => {
      if (entry && typeof entry.name === 'string') remember(entry.name);
    });
  } catch (_) {
    // Resource timing can be unavailable.
  }
  return found;
}

globalThis.decipherXhamsterHex = decipherXhamsterHex;
globalThis.resolveXhamsterFormatUrl = resolveXhamsterFormatUrl;
globalThis.xhamsterStreamUrl = xhamsterStreamUrl;
globalThis.xhamsterPlayerCandidates = xhamsterPlayerCandidates;
globalThis.isXhamsterWatchUrl = isXhamsterWatchUrl;
globalThis.collectXhamsterPlayerUrlsInPage = collectXhamsterPlayerUrlsInPage;
