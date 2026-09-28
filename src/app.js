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

  const els = {
    tabs: [...document.querySelectorAll('.tab')],
    panels: {
      download: document.getElementById('panel-download'),
      queue: document.getElementById('panel-queue'),
      settings: document.getElementById('panel-settings'),
    },
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
    btnGotoQueue: document.getElementById('btn-goto-queue'),
    queueStatus: document.getElementById('queue-status'),
    queueList: document.getElementById('queue-list'),
    historyList: document.getElementById('history-list'),
    btnRefreshQueue: document.getElementById('btn-refresh-queue'),
    btnOpenSideQueue: document.getElementById('btn-open-side-queue'),
    btnOpenCove: document.getElementById('btn-open-cove'),
    settingsForm: document.getElementById('settings-form'),
    settingsSaved: document.getElementById('settings-saved'),
    btnTestCove: document.getElementById('btn-test-cove'),
    coveTestStatus: document.getElementById('cove-test-status'),
    coveUrl: document.getElementById('coveUrl'),
    apiToken: document.getElementById('apiToken'),
    preferredMode: document.getElementById('preferredMode'),
    showInPageButtons: document.getElementById('showInPageButtons'),
    showOnSupportedSites: document.getElementById('showOnSupportedSites'),
    showStylizedDownloadButton: document.getElementById('showStylizedDownloadButton'),
    autoSend: document.getElementById('autoSend'),
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

  function fillSettingsForm(data) {
    els.coveUrl.value = data.coveUrl || '';
    els.apiToken.value = data.apiToken || '';
    els.preferredMode.value = data.preferredMode || 'Video';
    els.showInPageButtons.checked = !!data.showInPageButtons;
    els.showOnSupportedSites.checked = !!data.showOnSupportedSites;
    els.showStylizedDownloadButton.checked = !!data.showStylizedDownloadButton;
    els.autoSend.checked = !!data.autoSend;
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
      queueAllMatches: els.queueAllMatches.checked,
      autoApplyMetadata: els.autoApplyMetadata.checked,
    };
  }

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
      showStatus(els.downloadStatus, 'No pending URL. Left-click the toolbar icon on a page, or use the context menu.', 'error');
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

  function renderJobCard(job, { cancellable }) {
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
        els.historyList.innerHTML = '';
        history.slice(0, 20).forEach((job) => {
          els.historyList.appendChild(renderJobCard(job, { cancellable: false }));
        });
        if (!history.length) {
          els.historyList.innerHTML = '<p class="muted">No history yet.</p>';
        }
      } catch (_) {
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

  els.settingsForm.addEventListener('submit', saveSettings);
  els.btnTestCove.addEventListener('click', () => {
    testCoveConnection().catch((error) => {
      showStatus(els.coveTestStatus, error.message || String(error), 'error');
      els.btnTestCove.disabled = false;
    });
  });
  els.btnRematch.addEventListener('click', () => runMatch(pendingUrl, activePlacementEntity));
  els.btnSend.addEventListener('click', sendSelected);
  els.btnGotoQueue.addEventListener('click', () => setTab('queue'));
  els.btnRefreshQueue.addEventListener('click', refreshQueue);
  let helperWindowId = null;
  chrome.windows.getCurrent((win) => {
    helperWindowId = win && win.id;
  });
  if (els.btnOpenSideQueue) {
    els.btnOpenSideQueue.addEventListener('click', () => {
      if (helperWindowId === null) return;
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
    await loadSettings();

    const errorParam = params.get('error');
    if (errorParam) {
      showStatus(els.downloadStatus, errorParam, 'error');
    }

    setTab(['download', 'queue', 'settings'].includes(currentTab) ? currentTab : 'download');

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
        els.downloadUrl.textContent = 'No pending URL. Left-click the toolbar icon on a page.';
      }
    }
  }

  init().catch((error) => {
    console.error(error);
    showStatus(els.downloadStatus, error.message || String(error), 'error');
  });
})();
