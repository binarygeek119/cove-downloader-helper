/* Collect embedded videos on the current page for the side-panel picker. */
(function () {
  const state = globalThis.__covePageVideosState || { cache: { key: '', pageUrl: '', videos: [] } };
  globalThis.__covePageVideosState = state;

  function absoluteUrl(value) {
    if (!value) return '';
    const raw = String(value).trim();
    if (!raw || raw.indexOf('blob:') === 0 || raw.indexOf('data:') === 0) return '';
    try {
      const url = new URL(raw, location.href);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
      return url.href;
    } catch (_) {
      return '';
    }
  }

  function sourceScore(source, url) {
    const res = parseInt(source.getAttribute('res') || source.getAttribute('data-res') || '0', 10);
    let score = Number.isFinite(res) ? res : 0;
    const label = (
      (source.getAttribute('label') || '') +
      ' ' +
      (source.getAttribute('type') || '') +
      ' ' +
      url
    ).toLowerCase();
    const ranked = [
      [/2160|4k/, 2160],
      [/1440/, 1440],
      [/1080/, 1080],
      [/720/, 720],
      [/480/, 480],
      [/360/, 360],
      [/240/, 240],
    ];
    ranked.forEach(([pattern, value]) => {
      if (pattern.test(label)) score = Math.max(score, value);
    });
    return score;
  }

  function mediaUrl(video) {
    let best = '';
    let bestScore = -1;
    video.querySelectorAll('source').forEach((source) => {
      const url = absoluteUrl(
        source.getAttribute('src') || source.getAttribute('data-src') || source.getAttribute('data-url')
      );
      if (!url) return;
      const score = sourceScore(source, url);
      if (score >= bestScore) {
        bestScore = score;
        best = url;
      }
    });
    return (
      best ||
      absoluteUrl(video.currentSrc) ||
      absoluteUrl(video.getAttribute('src')) ||
      absoluteUrl(video.getAttribute('data-src')) ||
      absoluteUrl(video.getAttribute('data-video-src')) ||
      absoluteUrl(video.getAttribute('data-url'))
    );
  }

  function thumbnailUrl(video) {
    const direct =
      absoluteUrl(video.getAttribute('poster')) ||
      absoluteUrl(video.getAttribute('data-poster')) ||
      absoluteUrl(video.getAttribute('data-thumbnail')) ||
      absoluteUrl(video.dataset && (video.dataset.poster || video.dataset.thumbnail));
    if (direct) return direct;
    const parent = video.parentElement;
    if (!parent) return '';
    const img = parent.querySelector('img[src], img[data-src]');
    if (!img) return '';
    return absoluteUrl(img.getAttribute('src') || img.getAttribute('data-src'));
  }

  function looksLikeTime(value) {
    return /^\d{1,2}:\d{2}(:\d{2})?$/.test(value);
  }

  function isZeroTime(value) {
    return /^0+:00(:00)?$/.test(value);
  }

  function formatDuration(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 86400) return '';
    const total = Math.round(seconds);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    const pad = (n) => String(n).padStart(2, '0');
    if (hours) return hours + ':' + pad(minutes) + ':' + pad(secs);
    return minutes + ':' + pad(secs);
  }

  function cleanText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function durationLabel(video) {
    const ownUrl = mediaUrl(video);
    const found = [];
    let node = video.parentElement;
    for (let depth = 0; node && depth < 6; depth += 1, node = node.parentElement) {
      const times = node.querySelectorAll('.duration, [class*="duration"], time');
      for (const span of times) {
        const owner = span.closest('video');
        if (owner && owner !== video) continue;
        const host = span.parentElement;
        const hostVideo = host && host.querySelector('video');
        if (hostVideo && hostVideo !== video) {
          const hostUrl = mediaUrl(hostVideo);
          if (hostUrl && hostUrl !== ownUrl) continue;
        }
        const text = cleanText(span.textContent);
        if (looksLikeTime(text)) found.push(text);
      }
      const different = [...node.querySelectorAll('video')].some((el) => {
        if (el === video) return false;
        const url = mediaUrl(el);
        return url && url !== ownUrl;
      });
      if (different) break;
    }
    const positive = found.find((text) => !isZeroTime(text));
    if (positive) return positive;
    const probed = formatDuration(video.duration);
    if (probed && !isZeroTime(probed)) return probed;
    return '';
  }

  function ownTitle(video) {
    const attr = cleanText(video.getAttribute('title') || video.getAttribute('aria-label') || '');
    if (attr) return attr.slice(0, 180);
    const ownUrl = mediaUrl(video);
    let node = video.parentElement;
    for (let depth = 0; node && depth < 5; depth += 1, node = node.parentElement) {
      const different = [...node.querySelectorAll('video')].some((el) => {
        if (el === video) return false;
        const url = mediaUrl(el);
        return url && url !== ownUrl;
      });
      if (different) break;
      const heading = node.querySelector('h1, h2, h3, h4, figcaption, .media-title, .video-title');
      if (heading && !heading.querySelector('video')) {
        const text = cleanText(heading.textContent);
        if (text && text.length > 1 && text.length < 180 && !looksLikeTime(text)) return text;
      }
    }
    return '';
  }

  function isLightbox(video) {
    if (video.closest('.video-lg, .lg-outer, .lg-item, [class*="lightbox"]')) return true;
    const className = String(video.className || '');
    return className.indexOf('lg-video-object') !== -1;
  }

  function score(item) {
    let value = 0;
    if (item.duration) value += 4;
    if (item.thumbnail) value += 1;
    if (!item.lightbox) value += 8;
    return value;
  }

  function probeDuration(url) {
    return new Promise((resolve) => {
      const el = document.createElement('video');
      el.preload = 'metadata';
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        el.removeAttribute('src');
        try {
          el.load();
        } catch (_) {
          /* ignore */
        }
        resolve(value || '');
      };
      const timer = setTimeout(() => finish(''), 1500);
      el.addEventListener('loadedmetadata', () => {
        clearTimeout(timer);
        finish(formatDuration(el.duration));
      });
      el.addEventListener('error', () => {
        clearTimeout(timer);
        finish('');
      });
      el.src = url;
    });
  }

  async function thumbnailData(url) {
    if (!url) return '';
    try {
      const response = await fetch(url, { credentials: 'omit', signal: AbortSignal.timeout(2000) });
      if (!response.ok) return url;
      const blob = await response.blob();
      if (!blob.size || blob.size > 180000) return url;
      const dataUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
        reader.onerror = () => resolve('');
        reader.readAsDataURL(blob);
      });
      return dataUrl || url;
    } catch (_) {
      return url;
    }
  }

  async function mapLimit(items, limit, worker) {
    const results = new Array(items.length);
    let next = 0;
    async function run() {
      while (next < items.length) {
        const index = next;
        next += 1;
        results[index] = await worker(items[index], index);
      }
    }
    const runners = [];
    const count = Math.min(limit, items.length);
    for (let i = 0; i < count; i += 1) runners.push(run());
    await Promise.all(runners);
    return results;
  }

  function pageTitle() {
    const heading = document.querySelector('h1');
    const text = cleanText((heading && heading.textContent) || document.title || 'Video');
    return text.slice(0, 180) || 'Video';
  }

  function pageUrl() {
    return location.href.split('#')[0];
  }

  function collectQuick() {
    const byUrl = new Map();
    document.querySelectorAll('video').forEach((video) => {
      const url = mediaUrl(video);
      if (!url) return;
      const item = {
        url,
        title: ownTitle(video),
        thumbnail: thumbnailUrl(video),
        duration: durationLabel(video),
        lightbox: isLightbox(video),
      };
      const previous = byUrl.get(url);
      if (!previous || score(item) > score(previous)) byUrl.set(url, item);
    });
    return [...byUrl.values()];
  }

  globalThis.coveCollectPageVideos = async function coveCollectPageVideos() {
    const currentPage = pageUrl();
    const quick = collectQuick();
    if (quick.length < 2) {
      state.cache = { key: '', pageUrl: currentPage, videos: [] };
      return { pageUrl: currentPage, videos: [] };
    }

    const key = quick.map((item) => [item.url, item.duration, item.title].join('|')).join('\n');
    if (key === state.cache.key && state.cache.pageUrl === currentPage) {
      return { pageUrl: currentPage, unchanged: true, videos: state.cache.videos };
    }

    const title = pageTitle();
    let items = await mapLimit(quick, 4, async (item) => {
      const duration = item.duration || (await probeDuration(item.url));
      const thumbnail = await thumbnailData(item.thumbnail);
      return {
        url: item.url,
        title: item.title,
        thumbnail,
        duration,
      };
    });

    const named = items.map((item) => item.title).filter(Boolean);
    const sharedTitle = named.length === items.length && new Set(named).size === 1;
    items.forEach((item, index) => {
      if (!item.title) item.title = title + ' (' + (index + 1) + ')';
      else if (sharedTitle) item.title = item.title + ' (' + (index + 1) + ')';
    });

    state.cache = { key, pageUrl: currentPage, videos: items };
    return { pageUrl: currentPage, videos: items };
  };
})();
