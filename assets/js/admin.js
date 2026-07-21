/* WTC Admin Dashboard UI v2.0 — backward-compatible interface patch */
function showPanel(panelId, button) {
  if (window.AdminApp?.openPanel) return window.AdminApp.openPanel(panelId, button);
}

const AdminApp = (() => {
  const PANEL_HASH = {
    dashboardPanel:'dashboard',
    profileRequestPanel:'profile-requests',
    contentManagerPanel:'content',
    aiContentEnginePanel:'ai-content'
  };
  const HASH_PANEL = Object.fromEntries(Object.entries(PANEL_HASH).map(([panel, hash]) => [hash, panel]));
  const PANEL_STORAGE_KEY = 'wtc:admin:last-panel:v2';
  const CONTENT_TAB_KEY = 'wtc:admin:content-tab:v2';

  let adminUser = null;
  let subjectsCache = [];
  let chaptersCache = [];
  let currentProfileFilter = 'PENDING';

  async function init() {
    adminUser = WTC_AUTH.requireRole('Admin');
    if (!adminUser) return;

    fillHeader();
    bindLayout();
    bindAIInputForm();
    bindSubjectManager();
    bindChapterManager();
    bindFeatureUrlManager();
    restorePanel();

    await loadDashboard();
    await loadAIQueue(); // Legacy queue hook; safely returns when its old container is absent.
  }

  function fillHeader() {
    document.querySelectorAll('[data-user-name]').forEach(element => {
      element.textContent = adminUser.name || 'Admin';
    });
    document.querySelectorAll('[data-user-avatar]').forEach(element => {
      element.textContent = WTC_UI.initials(adminUser.name || 'Admin');
    });
  }

  function bindLayout() {
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') toggleSidebar(false);
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth > 980) toggleSidebar(false);
    });

    const savedTab = safeStorageGet(CONTENT_TAB_KEY) || 'subjects';
    openContentTab(savedTab, document.querySelector(`[data-content-tab="${cssEscape(savedTab)}"]`), false);
  }

  function restorePanel() {
    const hash = String(window.location.hash || '').replace(/^#/, '');
    const stored = safeStorageGet(PANEL_STORAGE_KEY);
    const panelId = HASH_PANEL[hash] || (document.getElementById(stored) ? stored : 'dashboardPanel');
    openPanel(panelId, document.querySelector(`[data-admin-nav="${cssEscape(panelId)}"]`), false);
  }

  function openPanel(panelId, sourceButton=null, updateLocation=true) {
    const panel = document.getElementById(panelId);
    if (!panel) return false;

    document.querySelectorAll('.admin-panel').forEach(item => item.classList.toggle('active', item === panel));
    document.querySelectorAll('[data-admin-nav]').forEach(button => {
      const active = button.dataset.adminNav === panelId;
      button.classList.toggle('active', active);
      button.setAttribute('aria-current', active ? 'page' : 'false');
    });

    if (sourceButton?.matches?.('[data-admin-nav]')) sourceButton.classList.add('active');

    const title = panel.dataset.panelTitle || 'Admin Dashboard';
    const subtitle = panel.dataset.panelSubtitle || '';
    setText('adminPageTitle', title);
    setText('adminBreadcrumbCurrent', title);
    setText('adminPageSubtitle', subtitle);

    safeStorageSet(PANEL_STORAGE_KEY, panelId);
    if (updateLocation && PANEL_HASH[panelId]) {
      history.replaceState(null, '', `#${PANEL_HASH[panelId]}`);
    }

    toggleSidebar(false);
    window.scrollTo({ top:0, behavior:'smooth' });

    if (panelId === 'profileRequestPanel') loadProfileChangeRequests(currentProfileFilter);
    return true;
  }

  function toggleSidebar(force) {
    const sidebar = document.getElementById('adminSidebar');
    const overlay = document.getElementById('adminSidebarOverlay');
    const toggle = document.querySelector('.admin-menu-toggle');
    if (!sidebar || !overlay) return;

    const open = typeof force === 'boolean' ? force : !sidebar.classList.contains('open');
    sidebar.classList.toggle('open', open);
    overlay.classList.toggle('open', open);
    document.body.classList.toggle('admin-nav-open', open);
    toggle?.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function openContentTab(tabName='subjects', sourceButton=null, remember=true) {
    const normalized = ['subjects', 'chapters', 'features'].includes(tabName) ? tabName : 'subjects';
    document.querySelectorAll('.content-tab-panel').forEach(panel => {
      panel.classList.toggle('active', panel.id === `contentTab${capitalize(normalized)}`);
    });
    document.querySelectorAll('[data-content-tab]').forEach(button => {
      const active = button.dataset.contentTab === normalized;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    if (sourceButton) sourceButton.classList.add('active');
    if (remember) safeStorageSet(CONTENT_TAB_KEY, normalized);
  }

  async function loadDashboard() {
    const button = document.querySelector('.admin-refresh-dashboard');
    WTC_UI.setBusy?.(button, true, 'Refreshing...');
    try {
      const data = await WTC_API.call({ action:'adminDashboard' });
      setText('studentTotal', data.totalStudents || 0);
      setText('teacherTotal', data.totalTeachers || 0);
      setText('logTotal', data.totalLogs || 0);
      updatePendingCounts(Number(data.pendingProfileRequests || 0));
    } catch (error) {
      WTC_UI.toast(error.message || 'Admin dashboard failed.', 'error');
    } finally {
      WTC_UI.setBusy?.(button, false);
    }
  }

  function updatePendingCounts(count) {
    ['profileRequestPendingTotal', 'profileRequestSidebarCount', 'profileRequestPanelCount'].forEach(id => setText(id, count));
  }

  /* Legacy AI form hooks retained for backward compatibility. The active AI UI is controlled by ai-content.js. */
  function bindAIInputForm() {
    const form = document.getElementById('aiInputForm');
    if (!form) return;

    const fileInput = document.getElementById('aiSourceFile');
    if (fileInput) {
      fileInput.addEventListener('change', async () => {
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;
        const rawBox = form.querySelector('[name="rawContent"]');
        form.dataset.fileName = file.name;
        if (file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt')) {
          rawBox.value = await file.text();
          WTC_UI.toast('Text file loaded.', 'success');
        } else {
          WTC_UI.toast('File selected. Paste extracted/OCR text before saving.', 'success');
        }
      });
    }
    form.addEventListener('submit', submitAIInput);
  }

  async function submitAIInput(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    payload.uploadedBy = adminUser.name || 'Admin';
    payload.fileName = form.dataset.fileName || '';

    if (!payload.chapterId || !payload.rawContent) {
      return WTC_UI.toast('Chapter ID and raw chapter text are required.', 'error');
    }

    const submit = form.querySelector('[type="submit"]');
    WTC_UI.setBusy?.(submit, true, 'Saving...');
    try {
      const data = await WTC_ASSESSMENT_API.submitAIInput(payload);
      if (!data.success) throw new Error(data.message || 'AI input failed.');
      WTC_UI.toast('Saved to AI input queue.', 'success');
      form.reset();
      form.dataset.fileName = '';
      await loadAIQueue();
    } catch (error) {
      WTC_UI.toast(error.message || 'AI input failed.', 'error');
    } finally {
      WTC_UI.setBusy?.(submit, false);
    }
  }

  async function loadAIQueue() {
    const box = document.getElementById('aiQueueBox');
    if (!box) return;
    box.innerHTML = WTC_UI.loadingHTML('Loading AI queue...');
    try {
      const data = await WTC_ASSESSMENT_API.listAIQueue();
      const rows = data.queue || [];
      box.innerHTML = rows.length
        ? rows.map(renderQueueItem).join('')
        : '<div class="ai-empty">No uploads yet.</div>';
    } catch (error) {
      box.innerHTML = `<div class="ai-empty error">${escapeHTML(error.message || 'Could not load AI queue.')}</div>`;
    }
  }

  function renderQueueItem(item) {
    const uploadId = escapeHTML(item.uploadId || '');
    const chapterTitle = escapeHTML(item.chapterName || item.chapterId || 'Chapter');
    const meta = escapeHTML(`${item.board || ''} · ${item.className || ''} · ${item.medium || ''}`);
    const status = escapeHTML(item.processingStatus || 'Pending');
    return `<div class="ai-queue-item"><div><h4>${chapterTitle}</h4><p>${meta}</p><small><b>Upload ID:</b> ${uploadId} · <b>Status:</b> ${status}</small></div><div class="ai-actions"><button class="btn small" type="button" onclick="AdminApp.generateAI('${uploadId}')">Generate</button><button class="btn small outline" type="button" onclick="AdminApp.formatLatest('${uploadId}')">Format Latest</button></div></div>`;
  }

  async function generateAI(uploadId) {
    try {
      WTC_UI.toast('Generating AI content...', 'success');
      const data = await WTC_ASSESSMENT_API.generateAIContent(uploadId);
      if (!data.success) throw new Error(data.message || 'Generation failed.');
      WTC_UI.toast(data.message || 'Content generated.', 'success');
      await loadAIQueue();
    } catch (error) {
      WTC_UI.toast(error.message || 'Generation failed.', 'error');
    }
  }

  async function formatLatest(uploadId) {
    try {
      const data = await WTC_ASSESSMENT_API.formatGeneratedContent(uploadId);
      if (!data.success) throw new Error(data.message || 'Formatting failed.');
      WTC_UI.toast('Formatted content created for review.', 'success');
    } catch (error) {
      WTC_UI.toast(error.message || 'Formatting failed.', 'error');
    }
  }

  /* SUBJECT_MASTER manager */
  function bindSubjectManager() {
    const form = document.getElementById('subjectManagerForm');
    if (!form) return;

    form.addEventListener('submit', async event => {
      event.preventDefault();
      const submit = form.querySelector('[type="submit"]');
      const payload = Object.fromEntries(new FormData(form).entries());
      payload.action = 'adminSaveSubject';
      WTC_UI.setBusy?.(submit, true, 'Saving Subject...');
      setManagerStatus('subjectManagerStatus', 'Saving subject...', 'info');

      try {
        const data = await WTC_API.call(payload);
        if (!data.success) throw new Error(data.message || 'Subject save failed.');
        WTC_UI.toast(data.message || 'Subject saved.', 'success');
        setManagerStatus('subjectManagerStatus', data.message || 'Subject saved.', 'success');
        form.reset();
        await loadSubjectsManager();
      } catch (error) {
        setManagerStatus('subjectManagerStatus', error.message || 'Subject save failed.', 'error');
        WTC_UI.toast(error.message || 'Subject save failed.', 'error');
      } finally {
        WTC_UI.setBusy?.(submit, false);
      }
    });

    document.getElementById('subjectManagerSearch')?.addEventListener('input', renderSubjectsManager);
    document.getElementById('subjectManagerList')?.addEventListener('click', event => {
      const button = event.target.closest('[data-edit-subject]');
      if (button) editSubjectById(button.dataset.editSubject);
    });
    loadSubjectsManager();
  }

  async function loadSubjectsManager() {
    const box = document.getElementById('subjectManagerList');
    if (!box) return;
    box.innerHTML = WTC_UI.loadingHTML('Loading subjects...');
    setManagerStatus('subjectManagerStatus', 'Loading subjects...', 'info');

    try {
      const data = await WTC_API.call({ action:'adminGetSubjects' });
      subjectsCache = Array.isArray(data.subjects) ? data.subjects : [];
      renderSubjectsManager();
      setManagerStatus('subjectManagerStatus', `${subjectsCache.length} subject record(s) loaded.`, 'success');
    } catch (error) {
      subjectsCache = [];
      box.innerHTML = `<div class="manager-empty">${escapeHTML(error.message || 'Failed to load subjects.')}</div>`;
      setManagerStatus('subjectManagerStatus', error.message || 'Failed to load subjects.', 'error');
    }
  }

  function renderSubjectsManager() {
    const box = document.getElementById('subjectManagerList');
    if (!box) return;
    const query = normalizeSearch(document.getElementById('subjectManagerSearch')?.value);
    const records = subjectsCache.filter(subject => normalizeSearch([
      subject.subjectId, subject.subjectName, subject.board, subject.className, subject.medium
    ].join(' ')).includes(query));

    if (!records.length) {
      box.innerHTML = `<div class="manager-empty">${subjectsCache.length ? 'No subjects match your search.' : 'No subjects found.'}</div>`;
      return;
    }

    box.innerHTML = records.map(subject => {
      const id = escapeHTML(subject.subjectId || '');
      const statusClass = normalizeSearch(subject.status) === 'active' ? 'active' : 'inactive';
      return `<article class="manager-record"><div class="manager-record-main"><h4 class="manager-record-title"><span>${escapeHTML(subject.icon || '📚')}</span>${escapeHTML(subject.subjectName || 'Unnamed Subject')}</h4><div class="manager-record-meta"><span>ID: ${id}</span><span>${escapeHTML(subject.board || '—')}</span><span>${escapeHTML(subject.className || '—')}</span><span>${escapeHTML(subject.medium || '—')}</span><span>Sort: ${escapeHTML(subject.sortOrder || '—')}</span><b class="status-chip ${statusClass}">${escapeHTML(subject.status || 'Unknown')}</b></div>${subject.description ? `<p class="manager-record-description">${escapeHTML(subject.description)}</p>` : ''}</div><button class="btn small outline" type="button" data-edit-subject="${id}">Edit</button></article>`;
    }).join('');
  }

  function editSubjectById(subjectId) {
    const subject = subjectsCache.find(item => String(item.subjectId || '') === String(subjectId || ''));
    if (subject) editSubject(subject);
  }

  function editSubject(subject) {
    const form = document.getElementById('subjectManagerForm');
    if (!form || !subject) return;
    fillForm(form, subject);
    openPanel('contentManagerPanel');
    openContentTab('subjects');
    form.scrollIntoView({ behavior:'smooth', block:'center' });
    form.elements.subjectName?.focus();
    setManagerStatus('subjectManagerStatus', `Editing ${subject.subjectId || 'subject'}.`, 'info');
  }

  /* CHAPTER_MASTER manager */
  function bindChapterManager() {
    const form = document.getElementById('chapterManagerForm');
    if (!form) return;

    form.addEventListener('submit', async event => {
      event.preventDefault();
      const submit = form.querySelector('[type="submit"]');
      const payload = Object.fromEntries(new FormData(form).entries());
      payload.action = 'adminSaveChapter';
      WTC_UI.setBusy?.(submit, true, 'Saving Chapter...');
      setManagerStatus('chapterManagerStatus', 'Saving chapter...', 'info');

      try {
        const data = await WTC_API.call(payload);
        if (!data.success) throw new Error(data.message || 'Chapter save failed.');
        WTC_UI.toast(data.message || 'Chapter saved.', 'success');
        setManagerStatus('chapterManagerStatus', data.message || 'Chapter saved.', 'success');
        form.reset();
        await loadChaptersManager();
      } catch (error) {
        setManagerStatus('chapterManagerStatus', error.message || 'Chapter save failed.', 'error');
        WTC_UI.toast(error.message || 'Chapter save failed.', 'error');
      } finally {
        WTC_UI.setBusy?.(submit, false);
      }
    });

    document.getElementById('chapterManagerSearch')?.addEventListener('input', renderChaptersManager);
    document.getElementById('chapterManagerList')?.addEventListener('click', event => {
      const button = event.target.closest('[data-edit-chapter]');
      if (button) editChapterById(button.dataset.editChapter);
    });
    loadChaptersManager();
  }

  async function loadChaptersManager() {
    const box = document.getElementById('chapterManagerList');
    if (!box) return;
    box.innerHTML = WTC_UI.loadingHTML('Loading chapters...');
    setManagerStatus('chapterManagerStatus', 'Loading chapters...', 'info');

    try {
      const data = await WTC_API.call({ action:'adminGetChapters' });
      chaptersCache = Array.isArray(data.chapters) ? data.chapters : [];
      renderChaptersManager();
      setManagerStatus('chapterManagerStatus', `${chaptersCache.length} chapter record(s) loaded.`, 'success');
    } catch (error) {
      chaptersCache = [];
      box.innerHTML = `<div class="manager-empty">${escapeHTML(error.message || 'Failed to load chapters.')}</div>`;
      setManagerStatus('chapterManagerStatus', error.message || 'Failed to load chapters.', 'error');
    }
  }

  function renderChaptersManager() {
    const box = document.getElementById('chapterManagerList');
    if (!box) return;
    const query = normalizeSearch(document.getElementById('chapterManagerSearch')?.value);
    const records = chaptersCache.filter(chapter => normalizeSearch([
      chapter.chapterId, chapter.chapterName, chapter.subjectId, chapter.board, chapter.className, chapter.medium
    ].join(' ')).includes(query));

    if (!records.length) {
      box.innerHTML = `<div class="manager-empty">${chaptersCache.length ? 'No chapters match your search.' : 'No chapters found.'}</div>`;
      return;
    }

    box.innerHTML = records.map(chapter => {
      const id = escapeHTML(chapter.chapterId || '');
      const statusClass = normalizeSearch(chapter.status) === 'active' ? 'active' : 'inactive';
      return `<article class="manager-record"><div class="manager-record-main"><h4 class="manager-record-title">Chapter ${escapeHTML(chapter.chapterNo || '—')}: ${escapeHTML(chapter.chapterName || 'Unnamed Chapter')}</h4><div class="manager-record-meta"><span>ID: ${id}</span><span>Subject: ${escapeHTML(chapter.subjectId || '—')}</span><span>${escapeHTML(chapter.board || '—')}</span><span>${escapeHTML(chapter.className || '—')}</span><span>${escapeHTML(chapter.medium || '—')}</span><span>Sort: ${escapeHTML(chapter.sortOrder || '—')}</span><b class="status-chip ${statusClass}">${escapeHTML(chapter.status || 'Unknown')}</b></div>${chapter.description ? `<p class="manager-record-description">${escapeHTML(chapter.description)}</p>` : ''}</div><button class="btn small outline" type="button" data-edit-chapter="${id}">Edit</button></article>`;
    }).join('');
  }

  function editChapterById(chapterId) {
    const chapter = chaptersCache.find(item => String(item.chapterId || '') === String(chapterId || ''));
    if (chapter) editChapter(chapter);
  }

  function editChapter(chapter) {
    const form = document.getElementById('chapterManagerForm');
    if (!form || !chapter) return;
    fillForm(form, chapter);
    openPanel('contentManagerPanel');
    openContentTab('chapters');
    form.scrollIntoView({ behavior:'smooth', block:'center' });
    form.elements.chapterName?.focus();
    setManagerStatus('chapterManagerStatus', `Editing ${chapter.chapterId || 'chapter'}.`, 'info');
  }

  /* CHAPTER_LIST feature fallback manager */
  function bindFeatureUrlManager() {
    const form = document.getElementById('featureUrlManagerForm');
    if (!form) return;

    form.addEventListener('submit', async event => {
      event.preventDefault();
      const submit = form.querySelector('[type="submit"]');
      const payload = Object.fromEntries(new FormData(form).entries());
      payload.action = 'adminSaveChapterFeatures';
      WTC_UI.setBusy?.(submit, true, 'Saving URLs...');
      setManagerStatus('featureUrlManagerStatus', 'Saving feature URLs...', 'info');

      try {
        const data = await WTC_API.call(payload);
        if (!data.success) throw new Error(data.message || 'Feature URL save failed.');
        setManagerStatus('featureUrlManagerStatus', data.message || 'Feature URLs saved.', 'success');
        WTC_UI.toast(data.message || 'Feature URLs saved.', 'success');
      } catch (error) {
        setManagerStatus('featureUrlManagerStatus', error.message || 'Feature URL save failed.', 'error');
        WTC_UI.toast(error.message || 'Feature URL save failed.', 'error');
      } finally {
        WTC_UI.setBusy?.(submit, false);
      }
    });
  }

  async function loadChapterFeaturesManager() {
    const form = document.getElementById('featureUrlManagerForm');
    if (!form) return;
    const chapterId = form.elements.chapterId?.value.trim();
    if (!chapterId) {
      form.elements.chapterId?.focus();
      return WTC_UI.toast('Enter Chapter ID first.', 'error');
    }

    const loadButton = form.querySelector('button[onclick*="loadChapterFeaturesManager"]');
    WTC_UI.setBusy?.(loadButton, true, 'Loading...');
    setManagerStatus('featureUrlManagerStatus', 'Loading feature URLs...', 'info');

    try {
      const data = await WTC_API.call({ action:'adminGetChapterFeatures', chapterId });
      if (!data.success) throw new Error(data.message || 'Could not load feature URLs.');
      fillForm(form, data.features || {});
      form.elements.chapterId.value = chapterId;
      setManagerStatus('featureUrlManagerStatus', 'Feature URLs loaded.', 'success');
      WTC_UI.toast('Feature URLs loaded.', 'success');
    } catch (error) {
      setManagerStatus('featureUrlManagerStatus', error.message || 'Feature URL load failed.', 'error');
      WTC_UI.toast(error.message || 'Feature URL load failed.', 'error');
    } finally {
      WTC_UI.setBusy?.(loadButton, false);
    }
  }

  /* Profile change requests */
  async function loadProfileChangeRequests(status='PENDING', sourceButton=null) {
    const box = document.getElementById('profileRequestAdminList');
    if (!box) return;
    currentProfileFilter = String(status || 'PENDING').toUpperCase();
    updateProfileFilterButtons(currentProfileFilter, sourceButton);
    box.innerHTML = '<div class="profile-admin-empty" aria-busy="true"><span class="wtc-spinner" aria-hidden="true"></span>Loading student profile requests…</div>';

    try {
      const data = await WTC_API.getProfileChangeRequests(currentProfileFilter);
      if (!data.success) throw new Error(data.message || 'Could not load profile requests.');
      updatePendingCounts(Number(data.pendingCount || 0));
      const requests = Array.isArray(data.requests) ? data.requests : [];
      box.innerHTML = requests.length
        ? requests.map(renderAdminProfileRequest).join('')
        : `<div class="profile-admin-empty">No ${currentProfileFilter === 'ALL' ? '' : currentProfileFilter.toLowerCase() + ' '}profile change requests found.</div>`;
    } catch (error) {
      box.innerHTML = `<div class="profile-admin-empty">${escapeHTML(error.message || 'Could not load profile requests.')}</div>`;
      WTC_UI.toast(error.message || 'Could not load profile requests.', 'error');
    }
  }

  function updateProfileFilterButtons(status, sourceButton) {
    document.querySelectorAll('[data-profile-filter]').forEach(button => {
      const active = button.dataset.profileFilter === status;
      button.classList.toggle('active', active);
      button.classList.toggle('outline', !active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    sourceButton?.classList.add('active');
  }

  function renderAdminProfileRequest(item) {
    const status = String(item.status || 'PENDING').toUpperCase();
    const statusClass = status.toLowerCase();
    const changes = [];
    pushAdminDiff(changes, 'Name', item.studentName, item.requestedName);
    pushAdminDiff(changes, 'Mobile', item.currentMobile, item.requestedMobile);
    pushAdminDiff(changes, 'Board', item.currentBoard, item.requestedBoard);
    pushAdminDiff(changes, 'Class', item.currentClassName, item.requestedClassName);
    pushAdminDiff(changes, 'Medium', item.currentMedium, item.requestedMedium);

    return `<article class="profile-admin-request ${statusClass}"><div class="profile-admin-request-head"><div><h3>${escapeHTML(item.studentName || 'Student')}</h3><p class="muted">Student ID: ${escapeHTML(item.studentId || '')} · Request: ${escapeHTML(item.requestId || '')}</p></div><span class="profile-admin-status ${statusClass}">${escapeHTML(adminProfileStatusLabel(status))}</span></div><div class="profile-admin-diff">${changes.join('') || '<div class="profile-admin-empty">No changed fields found.</div>'}</div><div class="profile-admin-reason"><b>Student reason:</b> ${escapeHTML(item.reason || '—')}</div><p class="muted">Requested: ${escapeHTML(item.requestedAt || '—')}${item.reviewedAt ? ` · Reviewed: ${escapeHTML(item.reviewedAt)}` : ''}</p>${item.adminRemarks ? `<div class="profile-admin-reason"><b>Admin note:</b> ${escapeHTML(item.adminRemarks)}</div>` : ''}${status === 'PENDING' ? `<div class="profile-admin-actions"><button class="btn small success" type="button" onclick="AdminApp.approveProfileRequest('${escapeJsString(item.requestId || '')}')">Approve &amp; Apply</button><button class="btn small danger" type="button" onclick="AdminApp.rejectProfileRequest('${escapeJsString(item.requestId || '')}')">Reject</button></div>` : ''}</article>`;
  }

  function pushAdminDiff(lines, label, currentValue, requestedValue) {
    const current = String(currentValue || '—');
    const requested = String(requestedValue || current);
    if (current === requested) return;
    lines.push(`<div class="profile-admin-diff-row"><strong>${escapeHTML(label)}</strong><span>${escapeHTML(current)}</span><span class="profile-admin-arrow">→</span><span><b>${escapeHTML(requested)}</b></span></div>`);
  }

  function adminProfileStatusLabel(status) {
    return ({ PENDING:'Pending', APPLIED:'Approved & Applied', REJECTED:'Rejected', CANCELLED:'Cancelled' })[status] || status;
  }

  function adminReviewCredentials() {
    const input = document.getElementById('profileRequestAdminPassword');
    const adminPassword = input?.value || '';
    if (!adminPassword) {
      WTC_UI.toast('Enter your admin password before reviewing a request.', 'error');
      input?.focus();
      return null;
    }
    return { adminId:adminUser.adminId || adminUser.id || '', adminMobile:adminUser.mobile || '', adminPassword };
  }

  async function approveProfileRequest(requestId) {
    const credentials = adminReviewCredentials();
    if (!credentials) return;
    if (!window.confirm('Approve this request and update the student profile now? Existing progress will remain stored under the previous Board, Class and Medium.')) return;
    const adminRemarks = window.prompt('Optional admin note for this approval:', '') || '';
    try {
      const data = await WTC_API.approveProfileChangeRequest({ requestId, adminRemarks, ...credentials });
      if (!data.success) throw new Error(data.message || 'Approval failed.');
      clearAdminReviewPassword();
      WTC_UI.toast(data.message || 'Request approved and applied.', 'success');
      await Promise.all([loadProfileChangeRequests('PENDING'), loadDashboard()]);
    } catch (error) {
      WTC_UI.toast(error.message || 'Approval failed.', 'error');
    }
  }

  async function rejectProfileRequest(requestId) {
    const credentials = adminReviewCredentials();
    if (!credentials) return;
    const adminRemarks = window.prompt('Reason for rejecting this request:');
    if (adminRemarks === null) return;
    if (!String(adminRemarks).trim()) return WTC_UI.toast('Enter a reason before rejecting the request.', 'error');
    try {
      const data = await WTC_API.rejectProfileChangeRequest({ requestId, adminRemarks:String(adminRemarks).trim(), ...credentials });
      if (!data.success) throw new Error(data.message || 'Rejection failed.');
      clearAdminReviewPassword();
      WTC_UI.toast(data.message || 'Request rejected.', 'success');
      await Promise.all([loadProfileChangeRequests('PENDING'), loadDashboard()]);
    } catch (error) {
      WTC_UI.toast(error.message || 'Rejection failed.', 'error');
    }
  }

  function toggleReviewPassword(button) {
    const input = document.getElementById('profileRequestAdminPassword');
    if (!input) return;
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    button.textContent = show ? 'Hide' : 'Show';
  }

  function clearAdminReviewPassword() {
    const input = document.getElementById('profileRequestAdminPassword');
    if (input) input.value = '';
  }

  function resetManagerForm(formId) {
    const form = document.getElementById(formId);
    if (!form) return;
    form.reset();
    form.querySelector('input,select,textarea')?.focus();
  }

  function fillForm(form, values) {
    Object.keys(values || {}).forEach(key => {
      if (form.elements?.[key]) form.elements[key].value = values[key] ?? '';
    });
  }

  function setManagerStatus(id, message, type='') {
    WTC_UI.setStatus?.(id, message, type);
  }

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = String(value ?? '');
  }

  function normalizeSearch(value='') {
    return String(value || '').trim().toLowerCase();
  }

  function capitalize(value='') {
    return String(value).charAt(0).toUpperCase() + String(value).slice(1);
  }

  function escapeHTML(value='') {
    return WTC_UI.escape ? WTC_UI.escape(value) : String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[char]));
  }

  function escapeJsString(value='') {
    return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/[\r\n]/g, ' ');
  }

  function cssEscape(value='') {
    if (window.CSS?.escape) return CSS.escape(String(value));
    return String(value).replace(/[^A-Za-z0-9_-]/g, '\\$&');
  }

  function safeStorageGet(key) {
    try { return localStorage.getItem(key) || ''; } catch (error) { return ''; }
  }

  function safeStorageSet(key, value) {
    try { localStorage.setItem(key, value); } catch (error) {}
  }

  return {
    init,
    openPanel,
    toggleSidebar,
    openContentTab,
    loadDashboard,
    loadAIQueue,
    generateAI,
    formatLatest,
    loadSubjectsManager,
    editSubject,
    loadChaptersManager,
    editChapter,
    loadChapterFeaturesManager,
    loadProfileChangeRequests,
    approveProfileRequest,
    rejectProfileRequest,
    toggleReviewPassword,
    resetManagerForm
  };
})();

document.addEventListener('DOMContentLoaded', AdminApp.init);
