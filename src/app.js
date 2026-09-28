(() => {
  const params = new URLSearchParams(location.search);
  if (params.get('side') === '1') document.body.classList.add('side-panel');
  let currentTab = params.get('tab') || 'download';
  let settings = null;
  let pendingUrl = null;
  let rawMatches = [];
  let currentMatches = [];
  let layoutEntityLock = '';
  let activePlacementEntity = '';
  let queueTimer = null;
  let startedJobIds = [];
  let startedTimer = null;
  const CLEARED_HISTORY_KEY = 'coveHelperClearedJobHistory';
  const CLEARED_HISTORY_LIMIT = 200;
  let clearedHistoryIds = [];
  let pageVideos = [];
  let pageVideoUrl = '';
  let videoSignature = '';
  let videoChecked = new Map();
  let videoTimer = null;
  let videoRequest = 0;
  let eromeSelector = null;

  const els = {
    tabs: [...document.querySelectorAll('.tab')],
    panels: {
      download: document.getElementById('panel-download'),
      videos: document.getElementById('panel-videos'),
      queue: document.getElementById('panel-queue'),
      settings: document.getElementById('panel-settings'),
    },
    tabVideos: document.querySelector('.tab[data-tab="videos"]'),
    videosHeading: document.getElementById('videos-heading'),
    videoList: document.getElementById('video-list'),
    videosStatus: document.getElementById('videos-status'),
    videosSelectAll: document.getElementById('videos-select-all'),
    btnDownloadVideos: document.getElementById('btn-download-videos'),
    btnDownloadAllVideos: document.getElementById('btn-download-all-videos'),
    downloadUrl: document.getElementById('download-url'),
    entityOverride: document.getElementById('entityOverride'),
    downloadStatus: document.getElementById('download-status'),
    downloadLoading: document.getElementById('download-loading'),
    matchList: document.getElementById('match-list'),
    downloadActions: document.getElementById('download-actions'),
    btnSend: document.getElementById('btn-send'),
    btnRematch: document.getElementById('btn-rematch'),
    startedJobs: document.getElementById('started-jobs'),
    startedJobsList: document.getElementById('started-jobs-list'),
    queueStatus: document.getElementById('queue-status'),
    queueList: document.getElementById('queue-list'),
    historyList: document.getElementById('history-list'),
    btnRefreshQueue: document.getElementById('btn-refresh-queue'),
    btnClearHistory: document.getElementById('btn-clear-history'),
    btnOpenSideQueue: document.getElementById('btn-open-side-queue'),
    btnOpenCove: document.getElementById('btn-open-cove'),
    settingsForm: document.getElementById('settings-form'),
    settingsSaved: document.getElementById('settings-saved'),
    btnImportSettings: document.getElementById('btn-import-settings'),
    btnExportSettings: document.getElementById('btn-export-settings'),
    settingsImportFile: document.getElementById('settings-import-file'),
    settingsTransferStatus: document.getElementById('settings-transfer-status'),
    btnTestCove: document.getElementById('btn-test-cove'),
    coveTestStatus: document.getElementById('cove-test-status'),
    coveUrl: document.getElementById('coveUrl'),
    apiToken: document.getElementById('apiToken'),
    preferredMode: document.getElementById('preferredMode'),
    showInPageButtons: document.getElementById('showInPageButtons'),
    showOnSupportedSites: document.getElementById('showOnSupportedSites'),
    showStylizedDownloadButton: document.getElementById('showStylizedDownloadButton'),
    autoSend: document.getElementById('autoSend'),
    openQueueOnDownload: document.getElementById('openQueueOnDownload'),
    queueAllMatches: document.getElementById('queueAllMatches'),
    autoApplyMetadata: document.getElementById('autoApplyMetadata'),
  };

  function showStatus(el, message, kind) {
    if (!message) {
      el.hidden = true;
      el.textContent = '';
      el.className = 'status';
      return;
    }
    el.hidden = false;
    el.textContent = message;
    el.className = 'status' + (kind ? ' ' + kind : '');
  }

  function setTab(tab) {
    if (tab !== 'videos') eromeSelector = null;
    currentTab = tab;
    els.tabs.forEach((button) => {
      const active = button.dataset.tab === tab;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    Object.entries(els.panels).forEach(([name, panel]) => {
      panel.hidden = name !== tab;
    });

    const url = new URL(location.href);
    url.searchParams.set('tab', tab);
    history.replaceState(null, '', url.toString());

    if (tab === 'queue') {
      startQueuePolling();
    } else {
      stopQueuePolling();
    }
  }

  function selectedVideoUrls() {
    if (!els.videoList) return [];
    return [...els.videoList.querySelectorAll('input[type="checkbox"][data-url]')]
      .filter((input) => input.checked)
      .map((input) => input.dataset.url);
  }

  function renderVideoList() {
    if (!els.videoList) return;
    if (els.videosHeading) {
      const count = pageVideos.length;
      els.videosHeading.textContent = count
        ? count + ' video' + (count === 1 ? '' : 's') + (eromeSelector ? ' in this album' : ' on this page')
        : eromeSelector
          ? 'Videos in this album'
          : 'Videos on this page';
    }
    if (els.tabVideos) {
      els.tabVideos.textContent = pageVideos.length ? 'Videos (' + pageVideos.length + ')' : 'Videos';
    }
    els.videoList.replaceChildren();
    pageVideos.forEach((video) => {
      const row = document.createElement('label');
      row.className = 'video-pick';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.dataset.url = video.url;
      input.checked = videoChecked.has(video.url) ? videoChecked.get(video.url) : true;
      input.addEventListener('change', () => {
        videoChecked.set(video.url, input.checked);
        syncVideoSelectAll();
      });
      const thumb = document.createElement('span');
      thumb.className = 'video-thumb-wrap';
      if (video.thumbnail) {
        const img = document.createElement('img');
        img.className = 'video-thumb';
        img.alt = '';
        img.referrerPolicy = 'no-referrer';
        img.src = video.thumbnail;
        img.addEventListener('error', () => {
          img.remove();
        });
        thumb.appendChild(img);
      }
      if (video.duration) {
        const badge = document.createElement('span');
        badge.className = 'video-duration';
        badge.textContent = video.duration;
        thumb.appendChild(badge);
      }
      const copy = document.createElement('span');
      copy.className = 'video-copy';
      const title = document.createElement('div');
      title.className = 'job-title';
      title.textContent = video.title || video.url;
      copy.appendChild(title);
      row.append(input, thumb, copy);
      els.videoList.appendChild(row);
    });
    syncVideoSelectAll();
  }

  function syncVideoSelectAll() {
    if (!els.videosSelectAll || !els.videoList) return;
    const boxes = [...els.videoList.querySelectorAll('input[type="checkbox"][data-url]')];
    const checkedCount = boxes.filter((input) => input.checked).length;
    els.videosSelectAll.checked = boxes.length > 0 && checkedCount === boxes.length;
    els.videosSelectAll.indeterminate = checkedCount > 0 && checkedCount < boxes.length;
    if (els.btnDownloadVideos) els.btnDownloadVideos.disabled = checkedCount === 0;
  }

  function setVideoChecks(checked) {
    pageVideos.forEach((video) => videoChecked.set(video.url, checked));
    if (!els.videoList) return;
    els.videoList.querySelectorAll('input[type="checkbox"][data-url]').forEach((input) => {
      input.checked = checked;
    });
    syncVideoSelectAll();
  }

  function applyEromeSelector(payload) {
    if (!payload || !payload.albumUrl || !document.body.classList.contains('side-panel')) return;
    eromeSelector = payload;
    pageVideoUrl = payload.albumUrl;
    pageVideos = Array.isArray(payload.videos) ? payload.videos : [];
    videoChecked = new Map();
    videoSignature = '';
    if (els.videoList) els.videoList.replaceChildren();
    showVideoTab(true);
    setTab('videos');
    if (payload.loading) {
      showStatus(els.videosStatus, 'Loading album videos…');
      if (els.videosHeading) els.videosHeading.textContent = 'Videos in this album';
      return;
    }
    renderVideoList();
    if (!pageVideos.length) {
      showStatus(els.videosStatus, payload.error || 'No videos found in this album.', 'error');
    } else {
      showStatus(els.videosStatus, 'Choose the videos to send.');
    }
    chrome.storage.session.remove('eromeSelector');
  }

  async function refreshPageVideos() {
    if (eromeSelector) return;
    const request = ++videoRequest;
    if (!els.tabVideos || !document.body.classList.contains('side-panel')) {
      showVideoTab(false);
      return;
    }
    let tab = null;
    try {
      const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (active && active.url && /^https?:/i.test(active.url)) tab = active;
    } catch (_) {
      tab = null;
    }
    if (!tab || !tab.id) {
      showVideoTab(false);
      return;
    }
    let response = null;
    try {
      response = await chrome.runtime.sendMessage({ type: 'collect-page-videos', tabId: tab.id });
    } catch (_) {
      response = null;
    }
    if (request !== videoRequest) return;
    if (!response || response.ok === false) {
      showVideoTab(false);
      return;
    }
    const nextPage = response.pageUrl || tab.url || '';
    if (nextPage !== pageVideoUrl) {
      pageVideoUrl = nextPage;
      videoChecked = new Map();
      videoSignature = '';
      pageVideos = [];
    }
    if (response.unchanged && pageVideos.length > 1) {
      showVideoTab(true);
      return;
    }
    const videos = Array.isArray(response.videos) ? response.videos : [];
    const show = videos.length > 1;
    showVideoTab(show);
    if (!show) {
      pageVideos = [];
      videoSignature = '';
      if (els.videoList) els.videoList.replaceChildren();
      if (els.tabVideos) els.tabVideos.textContent = 'Videos';
      return;
    }
    const signature = videos.map((video) => [video.url, video.duration, video.title].join('|')).join('\n');
    pageVideos = videos;
    if (signature !== videoSignature) {
      videoSignature = signature;
      renderVideoList();
    }
  }

  function showVideoTab(show) {
    if (!els.tabVideos) return;
    const visible = show && document.body.classList.contains('side-panel');
    els.tabVideos.hidden = !visible;
    if (!visible && currentTab === 'videos') {
      setTab('queue');
    }
  }

  function startVideoPolling() {
    if (!document.body.classList.contains('side-panel')) {
      showVideoTab(false);
      return;
    }
    refreshPageVideos();
    if (videoTimer) clearInterval(videoTimer);
    videoTimer = setInterval(refreshPageVideos, 2000);
    chrome.tabs.onActivated.addListener(() => {
      refreshPageVideos();
    });
    chrome.tabs.onUpdated.addListener((_tabId, info) => {
      if (info.status === 'complete' || info.url) refreshPageVideos();
    });
  }

  function openJobQueueForDownload() {
    if (!settings || !settings.openQueueOnDownload || !settings.coveUrl) return;
    if (document.body.classList.contains('side-panel')) {
      setTab('queue');
      return;
    }
    if (helperWindowId === null || helperWindowId === undefined) return;
    chrome.sidePanel.open({ windowId: helperWindowId }).catch(() => {});
    // Opening an already-visible panel does not change its tab.
    chrome.runtime.sendMessage({ type: 'show-job-queue' }).catch(() => {});
  }

  async function sendPageVideos(urls) {
    if (!urls.length) {
      showStatus(els.videosStatus, 'Select at least one video.', 'error');
      return;
    }
    openJobQueueForDownload();
    if (els.btnDownloadVideos) els.btnDownloadVideos.disabled = true;
    if (els.btnDownloadAllVideos) els.btnDownloadAllVideos.disabled = true;
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'download-page-videos',
        urls,
        pageUrl: pageVideoUrl,
      });
      if (!response || response.ok === false) {
        showStatus(els.videosStatus, (response && response.error) || 'Could not send the videos.', 'error');
        return;
      }
      if (response.openedSettings) {
        showStatus(els.videosStatus, 'Open Settings to configure Cove URL.', 'error');
        return;
      }
      const failed = response.failed ? ` ${response.failed} failed.` : '';
      showStatus(
        els.videosStatus,
        `Sent ${response.started} video${response.started === 1 ? '' : 's'} to Cove.${failed}`,
        response.failed ? 'error' : 'ok'
      );
    } catch (error) {
      showStatus(els.videosStatus, error.message || String(error), 'error');
    } finally {
      if (els.btnDownloadAllVideos) els.btnDownloadAllVideos.disabled = false;
      syncVideoSelectAll();
    }
  }

  function fillSettingsForm(data) {
    els.coveUrl.value = data.coveUrl || '';
    els.apiToken.value = data.apiToken || '';
    els.preferredMode.value = data.preferredMode || 'Video';
    els.showInPageButtons.checked = !!data.showInPageButtons;
    els.showOnSupportedSites.checked = !!data.showOnSupportedSites;
    els.showStylizedDownloadButton.checked = !!data.showStylizedDownloadButton;
    els.autoSend.checked = !!data.autoSend;
    els.openQueueOnDownload.checked = !!data.openQueueOnDownload;
    els.queueAllMatches.checked = !!data.queueAllMatches;
    els.autoApplyMetadata.checked = !!data.autoApplyMetadata;
    setOpenCoveButton(data.coveUrl);
  }

  function setOpenCoveButton(coveUrl) {
    const url = normalizeCoveUrl(coveUrl || '');
    let safe = '';
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') safe = url;
    } catch (_) {
      safe = '';
    }
    if (!els.btnOpenCove) return;
    if (!safe) {
      els.btnOpenCove.hidden = true;
      els.btnOpenCove.removeAttribute('href');
      return;
    }
    els.btnOpenCove.hidden = false;
    els.btnOpenCove.href = safe;
  }

  async function loadSettings() {
    settings = await getSettings();
    fillSettingsForm(settings);
    return settings;
  }

  function formSettings() {
    return {
      coveUrl: normalizeCoveUrl(els.coveUrl.value),
      apiToken: els.apiToken.value.trim(),
      preferredMode: els.preferredMode.value,
      showInPageButtons: els.showInPageButtons.checked,
      showOnSupportedSites: els.showOnSupportedSites.checked,
      showStylizedDownloadButton: els.showStylizedDownloadButton.checked,
      autoSend: els.autoSend.checked,
      openQueueOnDownload: els.openQueueOnDownload.checked,
      queueAllMatches: els.queueAllMatches.checked,
      autoApplyMetadata: els.autoApplyMetadata.checked,
    };
  }

  const HOST_PERMISSION = { origins: ['http://*/*', 'https://*/*'] };

  function requestHostPermission() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'request-host-permission' }, (response) => {
        if (chrome.runtime.lastError) {
          resolve(false);
          return;
        }
        resolve(!!(response && response.ok));
      });
    });
  }

  function containedHostPermission() {
    return new Promise((resolve) => {
      chrome.permissions.contains(HOST_PERMISSION, (has) => {
        resolve(!chrome.runtime.lastError && !!has);
      });
    });
  }

  function importHostPermission() {
    return new Promise((resolve) => {
      const result = { has: false, granted: false, pending: 2 };
      const finish = () => {
        result.pending -= 1;
        if (result.pending === 0) resolve(result.has || result.granted);
      };
      chrome.permissions.contains(HOST_PERMISSION, (has) => {
        result.has = !chrome.runtime.lastError && !!has;
        finish();
      });
      // Ask on the Import click, before the file dialog opens. contains still
      // counts when access is already granted.
      chrome.permissions.request(HOST_PERMISSION, (granted) => {
        result.granted = !chrome.runtime.lastError && !!granted;
        finish();
      });
    });
  }

  function connectionErrorMessage(error, coveUrl) {
    const status = error && error.status;
    if (status === 401 || status === 403) return 'Cove rejected the API token.';
    if (!status) return `Could not reach Cove at ${coveUrl}.`;
    const raw = error && error.message ? String(error.message) : '';
    const short = raw.replace(/\s+/g, ' ').trim().slice(0, 180);
    return short || `Cove returned ${status}.`;
  }

  async function testCoveConnection() {
    const probe = formSettings();
    if (!probe.coveUrl) {
      showStatus(els.coveTestStatus, 'Enter a Cove URL first.', 'error');
      return;
    }
    let parsed;
    try {
      parsed = new URL(probe.coveUrl);
    } catch (_) {
      parsed = null;
    }
    if (!parsed || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) {
      showStatus(els.coveTestStatus, 'Cove URL must start with http:// or https://.', 'error');
      return;
    }

    els.btnTestCove.disabled = true;
    showStatus(els.coveTestStatus, 'Testing connection…');
    try {
      const granted = await requestHostPermission();
      if (!granted) {
        showStatus(els.coveTestStatus, 'Site access was denied. Grant permission to reach Cove.', 'error');
        return;
      }
      const { body } = await coveFetch(probe, '/api/system/downloaders', { method: 'GET' });
      if (!Array.isArray(body)) {
        showStatus(els.coveTestStatus, 'Cove responded, but the downloaders list was not recognized.', 'error');
        return;
      }
      const noun = body.length === 1 ? 'downloader' : 'downloaders';
      showStatus(els.coveTestStatus, `Connected to Cove. ${body.length} ${noun} available.`, 'ok');
    } catch (error) {
      showStatus(els.coveTestStatus, connectionErrorMessage(error, probe.coveUrl), 'error');
    } finally {
      els.btnTestCove.disabled = false;
    }
  }

  async function saveSettings(event) {
    event.preventDefault();
    const next = formSettings();

    if (
      next.coveUrl ||
      next.showInPageButtons ||
      next.showOnSupportedSites ||
      next.showStylizedDownloadButton
    ) {
      const granted = await requestHostPermission();
      if (!granted) {
        els.settingsSaved.hidden = false;
        els.settingsSaved.textContent =
          'Settings saved locally, but site access was denied. Grant permission to talk to Cove and show download buttons.';
        els.settingsSaved.className = 'status error';
        await storageSet(next);
        settings = await getSettings();
        return;
      }
    }

    await storageSet(next);
    settings = await getSettings();
    fillSettingsForm(settings);
    els.settingsSaved.hidden = false;
    els.settingsSaved.textContent = 'Settings saved.';
    els.settingsSaved.className = 'ok';
    setTimeout(() => {
      els.settingsSaved.hidden = true;
    }, 2500);
  }

  function pluginVersion() {
    return chrome.runtime.getManifest().version;
  }

  function storageSetChecked(values) {
    return new Promise((resolve, reject) => {
      chrome.storage.sync.set(values, () => {
        const err = chrome.runtime.lastError;
        if (err) reject(new Error(err.message));
        else resolve();
      });
    });
  }

  function downloadSettingsFile(filename, contents) {
    const blob = new Blob([contents], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  async function exportSettings() {
    const saved = await getSettings();
    const version = pluginVersion();
    const payload = buildSettingsExport(version, saved);
    downloadSettingsFile(settingsExportFileName(version), JSON.stringify(payload, null, 2) + '\n');
    showStatus(els.settingsTransferStatus, `Exported settings for version ${version}.`, 'ok');
  }

  function importedSettingsNeedHostAccess(next) {
    return !!(
      next.coveUrl ||
      next.showInPageButtons ||
      next.showOnSupportedSites ||
      next.showStylizedDownloadButton
    );
  }

  async function importSettingsFile(file, permissionPromise) {
    if (!file) return;
    if (file.size > SETTINGS_EXPORT_MAX_BYTES) {
      showStatus(els.settingsTransferStatus, 'Settings file is too large.', 'error');
      return;
    }
    let text;
    try {
      text = await file.text();
    } catch (_) {
      showStatus(els.settingsTransferStatus, 'Could not read the settings file.', 'error');
      return;
    }
    const parsed = parseSettingsExport(text, pluginVersion());
    if (!parsed.ok) {
      showStatus(els.settingsTransferStatus, parsed.error, 'error');
      return;
    }
    const next = parsed.settings;
    try {
      if (importedSettingsNeedHostAccess(next)) {
        const granted = permissionPromise ? await permissionPromise : false;
        if (granted) {
          chrome.runtime.sendMessage({ type: 'sync-in-page-buttons' }).catch(() => {});
        } else {
          await storageSetChecked(next);
          settings = await getSettings();
          fillSettingsForm(settings);
          showStatus(
            els.settingsTransferStatus,
            'Settings imported locally, but site access was denied. Grant permission to talk to Cove and show download buttons.',
            'error'
          );
          return;
        }
      }
      await storageSetChecked(next);
      settings = await getSettings();
      fillSettingsForm(settings);
      showStatus(els.settingsTransferStatus, `Imported settings for version ${pluginVersion()}.`, 'ok');
    } catch (error) {
      showStatus(els.settingsTransferStatus, error.message || 'Could not save imported settings.', 'error');
    }
  }

  function renderMatches(matches) {
    els.matchList.innerHTML = '';
    const override = layoutEntityLock || els.entityOverride.value;
    const pickSettings =
      override && override !== 'auto'
        ? { ...settings, preferredMode: override, queueAllMatches: false }
        : settings;
    const preferred = pickMatches(matches, pickSettings).map((m) => m.downloaderId + '|' + m.normalizedUrl);
    const preferredSet = new Set(preferred);

    matches.forEach((match, index) => {
      const card = document.createElement('article');
      card.className = 'match-card';
      card.dataset.index = String(index);

      const key = match.downloaderId + '|' + match.normalizedUrl;
      const checked = override !== 'auto' || settings.queueAllMatches || preferredSet.has(key);

      const qualities = match.qualityOptions || [];
      const defaultQ = defaultQualityId(match) || '';

      card.innerHTML = `
        <header>
          <label class="checkbox" style="margin:0">
            <input type="checkbox" class="match-check" ${checked ? 'checked' : ''} />
            <span class="match-title">${escapeHtml(match.downloaderName || match.downloaderId)}</span>
          </label>
          <span class="badge">${escapeHtml(resolveMatchEntity(match))}</span>
        </header>
        <p class="muted" style="margin:8px 0 0;word-break:break-all">${escapeHtml(match.label || match.normalizedUrl || '')}</p>
        <label style="margin-top:10px">
          Quality
          <select class="match-quality" ${qualities.length ? '' : 'disabled'}>
            ${
              qualities.length
                ? qualities
                    .map(
                      (q) =>
                        `<option value="${escapeAttr(q.id)}" ${q.id === defaultQ ? 'selected' : ''}>${escapeHtml(
                          q.label || q.id
                        )}</option>`
                    )
                    .join('')
                : '<option value="">Default</option>'
            }
          </select>
        </label>
      `;
      els.matchList.appendChild(card);
    });

    els.downloadActions.hidden = matches.length === 0;
  }

  function showLockedEntity(entity) {
    const aligned = pickMatches(
      rawMatches.filter((match) => resolveMatchEntity(match) === entity),
      { ...settings, preferredMode: entity }
    );
    currentMatches = aligned;
    renderMatches(aligned);
    if (!aligned.length) {
      els.downloadActions.hidden = true;
      showStatus(els.downloadStatus, `${entity} is not supported for this page.`, 'error');
      return;
    }
    showStatus(
      els.downloadStatus,
      `${aligned.length} ${entity.toLowerCase()} match${aligned.length === 1 ? '' : 'es'} found.`
    );
  }

  function applyOverrideAndRender() {
    if (layoutEntityLock === 'Image' || layoutEntityLock === 'Text') {
      showLockedEntity(layoutEntityLock);
      return;
    }
    const override = els.entityOverride.value || 'auto';
    currentMatches = applyEntityOverride(pendingUrl, rawMatches, override);
    renderMatches(currentMatches);
    if (override !== 'auto') {
      showStatus(
        els.downloadStatus,
        `Override: forcing ${override}. Send will use that downloader type.`,
        'ok'
      );
    }
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/'/g, '&#39;');
  }

  function selectedPayloads() {
    const cards = [...els.matchList.querySelectorAll('.match-card')];
    const payloads = [];
    cards.forEach((card) => {
      const check = card.querySelector('.match-check');
      if (!check || !check.checked) return;
      const index = Number(card.dataset.index);
      const match = currentMatches[index];
      if (!match) return;
      const qualitySelect = card.querySelector('.match-quality');
      const qualityId = qualitySelect && !qualitySelect.disabled ? qualitySelect.value : undefined;
      payloads.push(buildDownloadPayload(match, settings, qualityId || undefined));
    });
    return payloads;
  }

  async function runMatch(url, placementEntity) {
    pendingUrl = url;
    els.downloadUrl.textContent = url || 'No URL selected.';
    els.matchList.innerHTML = '';
    els.downloadActions.hidden = true;
    els.startedJobs.hidden = true;
    layoutEntityLock = placementEntity === 'Image' || placementEntity === 'Text' ? placementEntity : '';
    els.entityOverride.value = placementEntity === 'Video' ? 'Video' : 'auto';
    rawMatches = [];
    currentMatches = [];
    showStatus(els.downloadStatus, '');

    if (!url) {
      showStatus(els.downloadStatus, 'No pending URL. Right-click the page and choose Send page to Cove.', 'error');
      return;
    }

    if (!settings.coveUrl) {
      showStatus(els.downloadStatus, 'Configure Cove URL in Settings first.', 'error');
      setTab('settings');
      return;
    }

    els.downloadLoading.hidden = false;
    const fallbackMode = placementEntity === 'Video' ? 'Video' : settings.preferredMode;
    try {
      let matches = await matchDownloaders(settings, url);
      if (layoutEntityLock) {
        rawMatches = matches;
        showLockedEntity(layoutEntityLock);
        return;
      }
      if (!matches.length) {
        matches = [ytDlpFallback(url, fallbackMode)];
        showStatus(els.downloadStatus, 'No downloader matched. Offering yt-dlp fallback.', 'ok');
      } else {
        // Drop Text matches on normal video pages unless preferred mode is Text / text site.
        if (fallbackMode !== 'Text' && !isTextSiteUrl(url)) {
          const withoutText = matches.filter((m) => resolveMatchEntity(m) !== 'Text');
          if (withoutText.length) matches = withoutText;
        }
        showStatus(els.downloadStatus, `${matches.length} match${matches.length === 1 ? '' : 'es'} found.`);
      }
      rawMatches = matches;
      applyOverrideAndRender();
    } catch (error) {
      if (layoutEntityLock) {
        rawMatches = [];
        currentMatches = [];
        els.matchList.innerHTML = '';
        els.downloadActions.hidden = true;
        showStatus(els.downloadStatus, `${layoutEntityLock} is not supported for this page.`, 'error');
        return;
      }
      rawMatches = [ytDlpFallback(url, fallbackMode)];
      applyOverrideAndRender();
      showStatus(
        els.downloadStatus,
        `Match failed (${error.message}). You can still try yt-dlp fallback or use Type override.`,
        'error'
      );
    } finally {
      els.downloadLoading.hidden = true;
    }
  }

  async function sendSelected() {
    const payloads = selectedPayloads();
    if (!payloads.length) {
      showStatus(els.downloadStatus, 'Select at least one match to send.', 'error');
      return;
    }
    openJobQueueForDownload();

    els.btnSend.disabled = true;
    const jobIds = [];
    try {
      for (const payload of payloads) {
        const result = await startDownload(settings, payload);
        if (result && result.jobId) jobIds.push(result.jobId);
      }
      startedJobIds = jobIds;
      els.startedJobs.hidden = false;
      showStatus(els.downloadStatus, `Queued ${jobIds.length} job${jobIds.length === 1 ? '' : 's'}.`, 'ok');
      startStartedPolling();
      setBadge(jobIds.length ? String(jobIds.length) : '');
    } catch (error) {
      showStatus(els.downloadStatus, error.message || String(error), 'error');
      setBadge('!');
    } finally {
      els.btnSend.disabled = false;
    }
  }

  function setBadge(text) {
    try {
      chrome.action.setBadgeText({ text: text || '' });
      chrome.action.setBadgeBackgroundColor({ color: text === '!' ? '#c0392b' : '#3d8bfd' });
    } catch (_) {
      /* ignore */
    }
  }

  function progressPercent(job) {
    const value = typeof job.progress === 'number' ? job.progress : 0;
    return Math.max(0, Math.min(100, Math.round(value <= 1 ? value * 100 : value)));
  }

  function localGet(keys) {
    return new Promise((resolve) => {
      chrome.storage.local.get(keys, (data) => resolve(data || {}));
    });
  }

  function localSet(values) {
    return new Promise((resolve) => {
      chrome.storage.local.set(values, () => resolve());
    });
  }

  async function loadClearedHistory() {
    const data = await localGet([CLEARED_HISTORY_KEY]);
    const ids = data[CLEARED_HISTORY_KEY];
    clearedHistoryIds = Array.isArray(ids) ? ids.map((id) => String(id)) : [];
  }

  function historyIsCleared(jobId) {
    return clearedHistoryIds.includes(String(jobId || ''));
  }

  async function clearHistoryJobs(ids) {
    for (const id of ids) {
      const key = String(id || '');
      if (!key || clearedHistoryIds.includes(key)) continue;
      clearedHistoryIds.push(key);
    }
    if (clearedHistoryIds.length > CLEARED_HISTORY_LIMIT) {
      clearedHistoryIds = clearedHistoryIds.slice(-CLEARED_HISTORY_LIMIT);
    }
    await localSet({ [CLEARED_HISTORY_KEY]: clearedHistoryIds });
  }

  function renderJobCard(job, { cancellable, clearable }) {
    const pct = progressPercent(job);
    const card = document.createElement('article');
    card.className = 'job-card';
    card.innerHTML = `
      <header>
        <div>
          <div class="job-title">${escapeHtml(job.description || job.type || job.id)}</div>
          <div class="muted">${escapeHtml(job.status || '')}${job.subTask ? ' · ' + escapeHtml(job.subTask) : ''}</div>
        </div>
        <span class="badge">${pct}%</span>
      </header>
      <div class="progress"><span style="width:${pct}%"></span></div>
      ${job.error ? `<p class="status error" style="margin:8px 0 0">${escapeHtml(job.error)}</p>` : ''}
      ${
        cancellable && (job.status === 'pending' || job.status === 'running')
          ? `<div class="row"><button type="button" class="secondary btn-cancel" data-id="${escapeAttr(job.id)}">Cancel</button></div>`
          : ''
      }
      ${
        clearable
          ? `<div class="row"><button type="button" class="secondary btn-clear-history" data-id="${escapeAttr(job.id)}">Clear</button></div>`
          : ''
      }
    `;
    return card;
  }

  async function refreshStartedJobs() {
    if (!startedJobIds.length) {
      els.startedJobsList.innerHTML = '';
      return;
    }
    els.startedJobsList.innerHTML = '';
    let allDone = true;
    for (const id of startedJobIds) {
      try {
        const job = await getJob(settings, id);
        els.startedJobsList.appendChild(renderJobCard(job, { cancellable: false }));
        if (job.status === 'pending' || job.status === 'running') allDone = false;
      } catch (error) {
        const failed = document.createElement('p');
        failed.className = 'muted';
        failed.textContent = `${id}: ${error.message}`;
        els.startedJobsList.appendChild(failed);
      }
    }
    if (allDone) {
      stopStartedPolling();
      setBadge('');
    }
  }

  function startStartedPolling() {
    stopStartedPolling();
    refreshStartedJobs();
    startedTimer = setInterval(refreshStartedJobs, 1000);
  }

  function stopStartedPolling() {
    if (startedTimer) {
      clearInterval(startedTimer);
      startedTimer = null;
    }
  }

  async function refreshQueue() {
    if (!settings.coveUrl) {
      showStatus(els.queueStatus, 'Configure Cove URL in Settings first.', 'error');
      return;
    }
    try {
      const jobs = await getJobs(settings);
      els.queueList.innerHTML = '';
      if (!jobs.length) {
        els.queueList.innerHTML = '<p class="muted">No active jobs.</p>';
      } else {
        jobs.forEach((job) => {
          const card = renderJobCard(job, { cancellable: true });
          els.queueList.appendChild(card);
        });
      }
      showStatus(els.queueStatus, '');

      try {
        const history = await getJobHistory(settings);
        const present = new Set(history.map((job) => String(job && job.id ? job.id : '')));
        const pruned = clearedHistoryIds.filter((id) => present.has(id));
        if (pruned.length !== clearedHistoryIds.length) {
          clearedHistoryIds = pruned;
          await localSet({ [CLEARED_HISTORY_KEY]: clearedHistoryIds });
        }
        const visible = history.filter((job) => !historyIsCleared(job && job.id));
        els.historyList.innerHTML = '';
        visible.slice(0, 20).forEach((job) => {
          els.historyList.appendChild(renderJobCard(job, { cancellable: false, clearable: true }));
        });
        if (els.btnClearHistory) els.btnClearHistory.hidden = visible.length === 0;
        if (!visible.length) {
          els.historyList.innerHTML = '<p class="muted">No history yet.</p>';
        }
      } catch (_) {
        if (els.btnClearHistory) els.btnClearHistory.hidden = true;
        els.historyList.innerHTML = '<p class="muted">History unavailable.</p>';
      }
    } catch (error) {
      showStatus(els.queueStatus, error.message || String(error), 'error');
    }
  }

  function startQueuePolling() {
    refreshQueue();
    stopQueuePolling();
    queueTimer = setInterval(refreshQueue, 1500);
  }

  function stopQueuePolling() {
    if (queueTimer) {
      clearInterval(queueTimer);
      queueTimer = null;
    }
  }

  els.tabs.forEach((button) => {
    button.addEventListener('click', () => setTab(button.dataset.tab));
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (!message || message.type !== 'show-job-queue') return;
    if (!document.body.classList.contains('side-panel')) return;
    setTab('queue');
  });

  if (els.videosSelectAll) {
    els.videosSelectAll.addEventListener('change', () => {
      setVideoChecks(els.videosSelectAll.checked);
    });
  }
  if (els.btnDownloadVideos) {
    els.btnDownloadVideos.addEventListener('click', () => {
      sendPageVideos(selectedVideoUrls());
    });
  }
  if (els.btnDownloadAllVideos) {
    els.btnDownloadAllVideos.addEventListener('click', () => {
      sendPageVideos(pageVideos.map((video) => video.url));
    });
  }

  els.settingsForm.addEventListener('submit', saveSettings);
  if (els.btnImportSettings && els.settingsImportFile) {
    els.btnImportSettings.addEventListener('click', () => {
      els.settingsImportFile.value = '';
      els.settingsImportFile._covePermission = importHostPermission();
      els.settingsImportFile.click();
    });
    els.settingsImportFile.addEventListener('change', () => {
      const file = els.settingsImportFile.files && els.settingsImportFile.files[0];
      const permissionPromise = els.settingsImportFile._covePermission || containedHostPermission();
      els.settingsImportFile._covePermission = null;
      els.settingsImportFile.value = '';
      importSettingsFile(file, permissionPromise).catch((error) => {
        showStatus(els.settingsTransferStatus, error.message || String(error), 'error');
      });
    });
  }
  if (els.btnExportSettings) {
    els.btnExportSettings.addEventListener('click', () => {
      exportSettings().catch((error) => {
        showStatus(els.settingsTransferStatus, error.message || String(error), 'error');
      });
    });
  }
  els.btnTestCove.addEventListener('click', () => {
    testCoveConnection().catch((error) => {
      showStatus(els.coveTestStatus, error.message || String(error), 'error');
      els.btnTestCove.disabled = false;
    });
  });
  els.btnRematch.addEventListener('click', () => runMatch(pendingUrl, activePlacementEntity));
  els.btnSend.addEventListener('click', sendSelected);
  els.btnRefreshQueue.addEventListener('click', refreshQueue);
  if (els.btnClearHistory) {
    els.btnClearHistory.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const details = event.currentTarget.closest('details');
      if (details) details.open = true;
      if (!settings || !settings.coveUrl) return;
      els.btnClearHistory.disabled = true;
      try {
        const history = await getJobHistory(settings);
        await clearHistoryJobs(history.map((job) => job && job.id));
        await refreshQueue();
      } catch (error) {
        showStatus(els.queueStatus, error.message || String(error), 'error');
      } finally {
        els.btnClearHistory.disabled = false;
      }
    });
  }
  let helperWindowId = null;
  chrome.windows.getCurrent((win) => {
    helperWindowId = win && win.id;
  });
  if (els.btnOpenSideQueue) {
    els.btnOpenSideQueue.addEventListener('click', () => {
      if (helperWindowId === null) return;
      void chrome.permissions.request({ origins: ['http://*/*', 'https://*/*'] });
      chrome.sidePanel.open({ windowId: helperWindowId }).catch((error) => {
        showStatus(els.queueStatus, error.message || 'Could not open the job queue beside the page.', 'error');
      });
    });
  }
  els.entityOverride.addEventListener('change', () => {
    layoutEntityLock = '';
    if (!pendingUrl && !rawMatches.length) return;
    applyOverrideAndRender();
    if (els.entityOverride.value === 'auto' && rawMatches.length) {
      showStatus(
        els.downloadStatus,
        `${rawMatches.length} match${rawMatches.length === 1 ? '' : 'es'} found.`
      );
    }
  });

  els.historyList.addEventListener('click', async (event) => {
    const button = event.target.closest('.btn-clear-history');
    if (!button) return;
    button.disabled = true;
    try {
      await clearHistoryJobs([button.dataset.id]);
      await refreshQueue();
    } catch (error) {
      showStatus(els.queueStatus, error.message || String(error), 'error');
      button.disabled = false;
    }
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (!message || message.type !== 'show-video-selector') return;
    applyEromeSelector(message);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && changes.eromeSelector && changes.eromeSelector.newValue) {
      applyEromeSelector(changes.eromeSelector.newValue);
    }
    if (area === 'sync' && settings) {
      if (changes.openQueueOnDownload) settings.openQueueOnDownload = !!changes.openQueueOnDownload.newValue;
      if (changes.autoSend) settings.autoSend = !!changes.autoSend.newValue;
      if (changes.coveUrl) settings.coveUrl = normalizeCoveUrl(changes.coveUrl.newValue || '');
    }
    if (area !== 'local' || !changes[CLEARED_HISTORY_KEY]) return;
    const ids = changes[CLEARED_HISTORY_KEY].newValue;
    const next = Array.isArray(ids) ? ids.map((id) => String(id)) : [];
    if (next.length === clearedHistoryIds.length && next.every((id, index) => id === clearedHistoryIds[index])) {
      return;
    }
    clearedHistoryIds = next;
    if (currentTab === 'queue') refreshQueue();
  });

  els.queueList.addEventListener('click', async (event) => {
    const button = event.target.closest('.btn-cancel');
    if (!button) return;
    button.disabled = true;
    try {
      await cancelJob(settings, button.dataset.id);
      await refreshQueue();
    } catch (error) {
      showStatus(els.queueStatus, error.message || String(error), 'error');
      button.disabled = false;
    }
  });

  async function init() {
    const versionEl = document.getElementById('extension-version');
    if (versionEl) versionEl.textContent = `Version ${chrome.runtime.getManifest().version}`;

    await loadSettings();
    await loadClearedHistory();

    const errorParam = params.get('error');
    if (errorParam) {
      showStatus(els.downloadStatus, errorParam, 'error');
    }

    setTab(['download', 'videos', 'queue', 'settings'].includes(currentTab) ? currentTab : 'download');
    const storedSelector = await sessionGet(['eromeSelector']);
    if (storedSelector.eromeSelector) applyEromeSelector(storedSelector.eromeSelector);
    startVideoPolling();

    const session = await sessionGet([PENDING_KEY]);
    const pending = session[PENDING_KEY];
    if (pending && pending.url) {
      pendingUrl = pending.url;
      if (pending.entity === 'Video' || pending.entity === 'Image' || pending.entity === 'Text') {
        activePlacementEntity = pending.entity;
      }
    }

    if (currentTab === 'download') {
      if (pendingUrl) {
        await runMatch(pendingUrl, activePlacementEntity);
        if ((params.get('auto') === '1' || settings.autoSend) && currentMatches.length) {
          // Ensure preferred checks then send. Image and text stay unsent when unsupported.
          await sendSelected();
        }
      } else {
        els.downloadUrl.textContent = 'No pending URL. Right-click the page and choose Send page to Cove.';
      }
    }
  }

  init().catch((error) => {
    console.error(error);
    showStatus(els.downloadStatus, error.message || String(error), 'error');
  });
})();
