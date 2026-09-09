(() => {
  const params = new URLSearchParams(location.search);
  let currentTab = params.get('tab') || 'download';
  let settings = null;
  let pendingUrl = null;
  let currentMatches = [];
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
    openCoveLink: document.getElementById('open-cove-link'),
    settingsForm: document.getElementById('settings-form'),
    settingsSaved: document.getElementById('settings-saved'),
    coveUrl: document.getElementById('coveUrl'),
    apiToken: document.getElementById('apiToken'),
    preferredMode: document.getElementById('preferredMode'),
    showInPageButtons: document.getElementById('showInPageButtons'),
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
    els.autoSend.checked = !!data.autoSend;
    els.queueAllMatches.checked = !!data.queueAllMatches;
    els.autoApplyMetadata.checked = !!data.autoApplyMetadata;
    if (data.coveUrl) {
      els.openCoveLink.href = data.coveUrl;
    }
  }

  async function loadSettings() {
    settings = await getSettings();
    fillSettingsForm(settings);
    return settings;
  }

  async function saveSettings(event) {
    event.preventDefault();
    const next = {
      coveUrl: normalizeCoveUrl(els.coveUrl.value),
      apiToken: els.apiToken.value.trim(),
      preferredMode: els.preferredMode.value,
      showInPageButtons: els.showInPageButtons.checked,
      autoSend: els.autoSend.checked,
      queueAllMatches: els.queueAllMatches.checked,
      autoApplyMetadata: els.autoApplyMetadata.checked,
    };
    await storageSet(next);
    settings = await getSettings();
    fillSettingsForm(settings);
    els.settingsSaved.hidden = false;
    setTimeout(() => {
      els.settingsSaved.hidden = true;
    }, 2500);
  }

  function renderMatches(matches) {
    els.matchList.innerHTML = '';
    const preferred = pickMatches(matches, settings).map((m) => m.downloaderId + '|' + m.normalizedUrl);
    const preferredSet = new Set(preferred);

    matches.forEach((match, index) => {
      const card = document.createElement('article');
      card.className = 'match-card';
      card.dataset.index = String(index);

      const key = match.downloaderId + '|' + match.normalizedUrl;
      const checked = settings.queueAllMatches || preferredSet.has(key);

      const qualities = match.qualityOptions || [];
      const defaultQ = defaultQualityId(match) || '';

      card.innerHTML = `
        <header>
          <label class="checkbox" style="margin:0">
            <input type="checkbox" class="match-check" ${checked ? 'checked' : ''} />
            <span class="match-title">${escapeHtml(match.downloaderName || match.downloaderId)}</span>
          </label>
          <span class="badge">${escapeHtml(match.supportedEntity || '')}</span>
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

  async function runMatch(url) {
    pendingUrl = url;
    els.downloadUrl.textContent = url || 'No URL selected.';
    els.matchList.innerHTML = '';
    els.downloadActions.hidden = true;
    els.startedJobs.hidden = true;
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
    try {
      let matches = await matchDownloaders(settings, url);
      if (!matches.length) {
        matches = [ytDlpFallback(url, settings.preferredMode)];
        showStatus(els.downloadStatus, 'No downloader matched. Offering yt-dlp fallback.', 'ok');
      } else {
        showStatus(els.downloadStatus, `${matches.length} match${matches.length === 1 ? '' : 'es'} found.`);
      }
      currentMatches = matches;
      renderMatches(matches);
    } catch (error) {
      currentMatches = [ytDlpFallback(url, settings.preferredMode)];
      renderMatches(currentMatches);
      showStatus(
        els.downloadStatus,
        `Match failed (${error.message}). You can still try yt-dlp fallback.`,
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
  els.btnRematch.addEventListener('click', () => runMatch(pendingUrl));
  els.btnSend.addEventListener('click', sendSelected);
  els.btnGotoQueue.addEventListener('click', () => setTab('queue'));
  els.btnRefreshQueue.addEventListener('click', refreshQueue);

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
    }

    if (currentTab === 'download') {
      if (pendingUrl) {
        await runMatch(pendingUrl);
        if (params.get('auto') === '1' || settings.autoSend) {
          // Ensure preferred checks then send.
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
