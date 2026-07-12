function showPanel(panelId, btn) {

  document.querySelectorAll('.panel').forEach(panel=>{
    panel.classList.remove('active');
  });

  const panel=document.getElementById(panelId);

  if(panel){
    panel.classList.add('active');
    panel.scrollIntoView({
      behavior:'smooth',
      block:'start'
    });
  }

  document.querySelectorAll('.btn').forEach(button=>{
    button.classList.remove('active');
  });

  if(btn) btn.classList.add('active');
}

const AdminApp = (() => {
  let adminUser = null;

  async function init() {
    adminUser = WTC_AUTH.requireRole('Admin');
    if (!adminUser) return;

    fillHeader();
    await loadDashboard();
    bindAIInputForm();
    await loadAIQueue();
    bindSubjectManager(); //for subject update to excel by admin 
    bindChapterManager(); // for chapter update to excel by admin 
    bindFeatureUrlManager(); // for chapter feature update to excel by admin 
  }

  function fillHeader() {
    document.querySelectorAll('[data-user-name]').forEach(el => {
      el.textContent = adminUser.name || 'Admin';
    });
    document.querySelectorAll('[data-user-avatar]').forEach(el => {
      el.textContent = WTC_UI.initials(adminUser.name || 'Admin');
    });
  }

  async function loadDashboard() {
    try {
      const data = await WTC_API.call({ action: 'adminDashboard' });
      document.getElementById('studentTotal').textContent = data.totalStudents || 0;
      document.getElementById('teacherTotal').textContent = data.totalTeachers || 0;
      document.getElementById('logTotal').textContent = data.totalLogs || 0;
    } catch (err) {
      WTC_UI.toast(err.message || 'Admin dashboard failed.', 'error');
    }
  }

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
          WTC_UI.toast('File selected. Paste extracted/OCR text in Raw Chapter Text before saving.', 'success');
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

    try {
      const data = await WTC_ASSESSMENT_API.submitAIInput(payload);
      if (!data.success) return WTC_UI.toast(data.message || 'AI input failed.', 'error');
      WTC_UI.toast('Saved to AI input queue.', 'success');
      form.reset();
      form.dataset.fileName = '';
      await loadAIQueue();
    } catch (err) {
      WTC_UI.toast(err.message || 'AI input failed.', 'error');
    }
  }

  async function loadAIQueue() {
    const box = document.getElementById('aiQueueBox');
    if (!box) return;
    box.innerHTML = '<div class="ai-empty">Loading AI queue...</div>';

    try {
      const data = await WTC_ASSESSMENT_API.listAIQueue();
      const rows = data.queue || [];
      if (!rows.length) {
        box.innerHTML = '<div class="ai-empty">No uploads yet. Paste a chapter text and save it first.</div>';
        return;
      }

      box.innerHTML = rows.map(renderQueueItem).join('');
    } catch (err) {
      box.innerHTML = `<div class="ai-empty error">${escapeHTML(err.message || 'Could not load AI queue.')}</div>`;
    }
  }

  function renderQueueItem(item) {
    const uploadId = escapeHTML(item.uploadId || '');
    const chapterTitle = escapeHTML(item.chapterName || item.chapterId || 'Chapter');
    const meta = escapeHTML(`${item.board || ''} · ${item.className || ''} · ${item.medium || ''}`);
    const status = escapeHTML(item.processingStatus || 'Pending');

    return `
      <div class="ai-queue-item">
        <div>
          <h4>${chapterTitle}</h4>
          <p>${meta}</p>
          <small><b>Upload ID:</b> ${uploadId} · <b>Status:</b> ${status}</small>
        </div>
        <div class="ai-actions">
          <button class="btn small" onclick="AdminApp.generateAI('${uploadId}')">Generate</button>
          <button class="btn small outline" onclick="AdminApp.formatLatest('${uploadId}')">Format Latest</button>
        </div>
      </div>
    `;
  }

  async function generateAI(uploadId) {
    try {
      WTC_UI.toast('Generating AI content...', 'success');
      const data = await WTC_ASSESSMENT_API.generateAIContent(uploadId);
      if (!data.success) return WTC_UI.toast(data.message || 'Generation failed.', 'error');
      WTC_UI.toast(`Generated content: ${data.contentId}`, 'success');
      await loadAIQueue();
    } catch (err) {
      WTC_UI.toast(err.message || 'Generation failed.', 'error');
    }
  }

  async function formatLatest(uploadId) {
    const contentId = prompt('Enter contentId generated for this upload. Example: CNT-...');
    if (!contentId) return;

    try {
      const data = await WTC_ASSESSMENT_API.formatGeneratedContent(contentId.trim());
      if (!data.success) return WTC_UI.toast(data.message || 'Formatting failed.', 'error');
      WTC_UI.toast('Formatted content created for review.', 'success');

      if (confirm('Approve and publish this content to students now?')) {
        await WTC_ASSESSMENT_API.reviewContent({
          contentId: contentId.trim(),
          reviewStatus: 'Approved',
          approvedBy: adminUser.name || 'Admin',
          publishLesson: 'Yes',
          publishSolutions: 'Yes',
          publishMCQ: 'Yes',
          publishWorksheet: 'Yes',
          remarks: 'Approved from admin AI engine.'
        });
        const pub = await WTC_ASSESSMENT_API.publishContent(contentId.trim());
        WTC_UI.toast(pub.message || 'Published.', pub.success ? 'success' : 'error');
      }
    } catch (err) {
      WTC_UI.toast(err.message || 'Formatting/publish failed.', 'error');
    }
  }
  
  //subject manager code start here
  
function bindSubjectManager() {
  const form = document.getElementById('subjectManagerForm');
  if (!form) return;

  form.addEventListener('submit', async event => {
    event.preventDefault();

    const payload = Object.fromEntries(new FormData(form).entries());
    payload.action = 'adminSaveSubject';

    try {
      const data = await WTC_API.call(payload);
      if (!data.success) return WTC_UI.toast(data.message || 'Subject save failed.', 'error');

      WTC_UI.toast(data.message || 'Subject saved.', 'success');
      form.reset();
      await loadSubjectsManager();
    } catch (err) {
      WTC_UI.toast(err.message || 'Subject save failed.', 'error');
    }
  });

  loadSubjectsManager();
}

async function loadSubjectsManager() {
  const box = document.getElementById('subjectManagerList');
  if (!box) return;

  box.innerHTML = 'Loading subjects...';

  try {
    const data = await WTC_API.call({ action: 'adminGetSubjects' });
    const subjects = data.subjects || [];

    if (!subjects.length) {
      box.innerHTML = 'No subjects found.';
      return;
    }

    box.innerHTML = subjects.map(s => `
      <div class="card" style="margin-bottom:10px;">
        <b>${escapeHTML(s.icon || '📚')} ${escapeHTML(s.subjectName || '')}</b>
        <p class="muted">
          ID: ${escapeHTML(s.subjectId || '')}<br>
          ${escapeHTML(s.board || '')} · ${escapeHTML(s.className || '')} · ${escapeHTML(s.medium || '')}<br>
          Status: ${escapeHTML(s.status || '')} · Sort: ${escapeHTML(s.sortOrder || '')}
        </p>
        <button class="btn small outline" onclick='AdminApp.editSubject(${JSON.stringify(s)})'>Edit</button>
      </div>
    `).join('');
  } catch (err) {
    box.innerHTML = escapeHTML(err.message || 'Failed to load subjects.');
  }
}

function editSubject(subject) {
  const form = document.getElementById('subjectManagerForm');
  if (!form) return;

  Object.keys(subject).forEach(key => {
    if (form[key]) form[key].value = subject[key] || '';
  });

  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
  //subject manager code end here

  //chapter update to excel by admin start here

  function bindChapterManager() {
  const form = document.getElementById('chapterManagerForm');
  if (!form) return;

  form.addEventListener('submit', async event => {
    event.preventDefault();

    const payload = Object.fromEntries(new FormData(form).entries());
    payload.action = 'adminSaveChapter';

    try {
      const data = await WTC_API.call(payload);
      if (!data.success) return WTC_UI.toast(data.message || 'Chapter save failed.', 'error');

      WTC_UI.toast(data.message || 'Chapter saved.', 'success');
      form.reset();
      await loadChaptersManager();
    } catch (err) {
      WTC_UI.toast(err.message || 'Chapter save failed.', 'error');
    }
  });

  loadChaptersManager();
}

async function loadChaptersManager() {
  const box = document.getElementById('chapterManagerList');
  if (!box) return;

  box.innerHTML = 'Loading chapters...';

  try {
    const data = await WTC_API.call({ action: 'adminGetChapters' });
    const chapters = data.chapters || [];

    if (!chapters.length) {
      box.innerHTML = 'No chapters found.';
      return;
    }

    box.innerHTML = chapters.map(ch => `
      <div class="card" style="margin-bottom:10px;">
        <b>Chapter ${escapeHTML(ch.chapterNo || '')}: ${escapeHTML(ch.chapterName || '')}</b>
        <p class="muted">
          Chapter ID: ${escapeHTML(ch.chapterId || '')}<br>
          Subject ID: ${escapeHTML(ch.subjectId || '')}<br>
          ${escapeHTML(ch.board || '')} · ${escapeHTML(ch.className || '')} · ${escapeHTML(ch.medium || '')}<br>
          Status: ${escapeHTML(ch.status || '')} · Sort: ${escapeHTML(ch.sortOrder || '')}
        </p>
        <button class="btn small outline" onclick='AdminApp.editChapter(${JSON.stringify(ch)})'>Edit</button>
      </div>
    `).join('');
  } catch (err) {
    box.innerHTML = escapeHTML(err.message || 'Failed to load chapters.');
  }
}

function editChapter(chapter) {
  const form = document.getElementById('chapterManagerForm');
  if (!form) return;

  Object.keys(chapter).forEach(key => {
    if (form[key]) form[key].value = chapter[key] || '';
  });

  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
  // chapter update to excel by admin code end here

// chapter feature update to excel by admin code start here 

function bindFeatureUrlManager() {
  const form = document.getElementById('featureUrlManagerForm');
  if (!form) return;

  form.addEventListener('submit', async event => {
    event.preventDefault();

    const payload = Object.fromEntries(new FormData(form).entries());
    payload.action = 'adminSaveChapterFeatures';

    try {
      const data = await WTC_API.call(payload);
      if (!data.success) return WTC_UI.toast(data.message || 'Feature URL save failed.', 'error');

      WTC_UI.toast(data.message || 'Feature URLs saved.', 'success');

      const status = document.getElementById('featureUrlManagerStatus');
      if (status) status.textContent = data.message || 'Feature URLs saved.';
    } catch (err) {
      WTC_UI.toast(err.message || 'Feature URL save failed.', 'error');
    }
  });
}

async function loadChapterFeaturesManager() {
  const form = document.getElementById('featureUrlManagerForm');
  const status = document.getElementById('featureUrlManagerStatus');

  if (!form) return;

  const chapterId = form.chapterId.value.trim();

  if (!chapterId) {
    return WTC_UI.toast('Enter Chapter ID first.', 'error');
  }

  if (status) status.textContent = 'Loading feature URLs...';

  try {
    const data = await WTC_API.call({
      action: 'adminGetChapterFeatures',
      chapterId
    });

    if (!data.success) {
      if (status) status.textContent = data.message || 'Could not load feature URLs.';
      return WTC_UI.toast(data.message || 'Could not load feature URLs.', 'error');
    }

    const features = data.features || {};

    Object.keys(features).forEach(key => {
      if (form[key]) form[key].value = features[key] || '';
    });

    if (status) status.textContent = 'Feature URLs loaded.';
    WTC_UI.toast('Feature URLs loaded.', 'success');
  } catch (err) {
    if (status) status.textContent = err.message || 'Feature URL load failed.';
    WTC_UI.toast(err.message || 'Feature URL load failed.', 'error');
  }
}
// feature chapter update to excel by admin code end here

  function escapeHTML(value = '') {
    return String(value).replace(/[&<>\"]/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;'
    }[char]));
  }

  return {
    init,
    loadDashboard,
    loadAIQueue,
    generateAI,
    formatLatest,
    loadSubjectsManager, //loads subject to subject manager in admin 
    editSubject, //edit subject master from admin panel 
    loadChaptersManager, //load chapters to chapter manager in admin 
    editChapter, //edit chapters to excel by admin 
    loadChapterFeaturesManager // feature chapter update to excel by admin 
  };
})();

document.addEventListener('DOMContentLoaded', AdminApp.init);
