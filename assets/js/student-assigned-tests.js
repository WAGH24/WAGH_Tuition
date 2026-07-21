/* WAGH Tuition Classes — Student Assigned Tests Widget Phase 2.5F v1.0 */
const WTC_STUDENT_ASSIGNED_TESTS = (() => {
  let user = null;
  let assignments = [];

  function init() {
    try { user = WTC_AUTH.getUser ? WTC_AUTH.getUser() : null; } catch (error) { user = null; }
    if (!user || normalize(user.role) !== 'student') return;
    injectWidget();
    bindEvents();
    load();
  }

  function identity() {
    return { studentId:user.studentId || user.id || '', mobile:user.mobile || '', deviceId:typeof WTC_AUTH.deviceId === 'function' ? WTC_AUTH.deviceId() : '' };
  }

  function injectWidget() {
    if (document.getElementById('wtcAssignedTestsWidget')) return;
    const host = document.getElementById('dashboardSection') || document.querySelector('.main-area') || document.querySelector('main');
    if (!host) return;
    const section = document.createElement('section');
    section.id = 'wtcAssignedTestsWidget';
    section.className = 'wtc-assigned-widget';
    section.innerHTML = `<div class="wtc-assigned-widget-copy"><span class="wtc-assigned-icon">📨</span><div><small>Teacher assignments</small><h2>Assigned Tests</h2><p id="wtcAssignedWidgetText">Checking your assignments…</p></div></div><div class="wtc-assigned-widget-actions"><span id="wtcAssignedPendingBadge" class="wtc-assigned-badge">0 pending</span><button class="btn" type="button" data-open-assigned-tests>Open Tests</button></div>`;
    const hero = host.querySelector('.hero-card');
    if (hero) hero.insertAdjacentElement('afterend', section);
    else host.prepend(section);

    const modal = document.createElement('div');
    modal.id = 'wtcAssignedTestsModal';
    modal.className = 'wtc-assigned-modal';
    modal.setAttribute('aria-hidden','true');
    modal.innerHTML = `<div class="wtc-assigned-dialog" role="dialog" aria-modal="true" aria-labelledby="wtcAssignedTestsTitle"><div class="wtc-assigned-dialog-head"><div><small>WAGH Tuition Classes</small><h2 id="wtcAssignedTestsTitle">Assigned Tests</h2><p>Tests sent by your Teacher appear here.</p></div><button type="button" aria-label="Close" data-close-assigned-tests>×</button></div><div id="wtcAssignedTestsSummary" class="wtc-assigned-summary"></div><div id="wtcAssignedTestsList" class="wtc-assigned-list"><div class="wtc-assigned-empty">Loading assignments…</div></div></div>`;
    document.body.appendChild(modal);
  }

  function bindEvents() {
    document.addEventListener('click', event => {
      if (event.target.closest('[data-open-assigned-tests]')) open();
      if (event.target.closest('[data-close-assigned-tests]') || event.target === document.getElementById('wtcAssignedTestsModal')) close();
      const start = event.target.closest('[data-start-assigned-test]');
      if (start) startTest(start.dataset.startAssignedTest, start);
    });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
  }

  async function load() {
    try {
      const data = await WTC_API.call({ action:'studentGetAssignedTests', ...identity() });
      if (data?.success === false) throw new Error(data.message || 'Assigned tests could not be loaded.');
      assignments = Array.isArray(data.assignments) ? data.assignments : [];
      render(data.summary || {});
    } catch (error) {
      setText('wtcAssignedWidgetText', error.message || 'Assigned tests are unavailable.');
      const list = document.getElementById('wtcAssignedTestsList');
      if (list) list.innerHTML = `<div class="wtc-assigned-empty">${esc(error.message || 'Assigned tests are unavailable.')}</div>`;
    }
  }

  function render(summary) {
    setText('wtcAssignedPendingBadge', `${summary.pending || 0} pending`);
    setText('wtcAssignedWidgetText', assignments.length ? `${summary.pending || 0} pending • ${summary.completed || 0} completed • ${summary.overdue || 0} overdue` : 'No tests have been assigned yet.');
    const summaryBox = document.getElementById('wtcAssignedTestsSummary');
    if (summaryBox) summaryBox.innerHTML = metric('Total',summary.total) + metric('Pending',summary.pending) + metric('Overdue',summary.overdue) + metric('Completed',summary.completed);
    const list = document.getElementById('wtcAssignedTestsList');
    if (list) list.innerHTML = assignments.length ? assignments.map(card).join('') : '<div class="wtc-assigned-empty">No assigned tests yet.</div>';
  }

  function card(item) {
    const status = String(item.status || 'PENDING').toUpperCase();
    const attempts = item.maxAttempts > 0 ? `${item.attemptsUsed || 0}/${item.maxAttempts} attempts` : `${item.attemptsUsed || 0} attempts`;
    return `<article class="wtc-assigned-card"><div class="wtc-assigned-card-head"><span class="wtc-assigned-status ${attr(status.toLowerCase())}">${esc(label(status))}</span><small>${esc(item.testType || 'MCQ Test')}</small></div><h3>${esc(item.testTitle || item.testId)}</h3><p>${esc(item.chapterName || item.chapterId || '')}</p><div class="wtc-assigned-meta"><span>Teacher: ${esc(item.teacherName || 'Teacher')}</span><span>Assigned: ${esc(formatDate(item.assignedAt,true))}</span>${item.dueAt ? `<span>Due: ${esc(formatDate(item.dueAt,true))}</span>` : ''}<span>${esc(attempts)}</span></div>${item.teacherMessage ? `<blockquote>${esc(item.teacherMessage)}</blockquote>` : ''}<div class="wtc-assigned-card-footer">${item.latestPercent !== null && item.latestPercent !== undefined ? `<span>Latest: <b>${esc(item.latestPercent)}%</b></span>` : '<span>Not attempted</span>'}<button class="btn small" type="button" data-start-assigned-test="${attr(item.assignmentId)}" ${item.canStart ? '' : 'disabled'}>${item.attemptsUsed ? 'Retry Test' : 'Start Test'}</button></div></article>`;
  }

  async function startTest(assignmentId, button) {
    setBusy(button,true,'Opening…');
    try {
      const data = await WTC_API.call({ action:'studentOpenAssignedTest', ...identity(), assignmentId });
      if (data?.success === false) throw new Error(data.message || 'Assigned test could not be opened.');
      sessionStorage.setItem('wtc:assigned-test:launch', JSON.stringify(data.launch || {}));
      const url = new URL('tests/online-test/assigned-test.html', document.baseURI);
      url.searchParams.set('assignmentId', assignmentId);
      location.href = url.href;
    } catch (error) {
      if (window.WTC_UI?.toast) WTC_UI.toast(error.message || 'Assigned test could not be opened.','error');
      setBusy(button,false);
      await load();
    }
  }

  function open() { document.getElementById('wtcAssignedTestsModal')?.classList.add('open'); document.getElementById('wtcAssignedTestsModal')?.setAttribute('aria-hidden','false'); document.body.classList.add('wtc-assigned-modal-open'); }
  function close() { document.getElementById('wtcAssignedTestsModal')?.classList.remove('open'); document.getElementById('wtcAssignedTestsModal')?.setAttribute('aria-hidden','true'); document.body.classList.remove('wtc-assigned-modal-open'); }
  function metric(labelText,value) { return `<div><small>${esc(labelText)}</small><strong>${esc(value || 0)}</strong></div>`; }
  function label(value) { return String(value || '').replace(/_/g,' ').toLowerCase().replace(/\b\w/g,c=>c.toUpperCase()); }
  function setText(id,value) { const el=document.getElementById(id); if(el)el.textContent=String(value ?? ''); }
  function setBusy(button,busy,labelText) { if(!button)return; if(window.WTC_UI?.setBusy)return WTC_UI.setBusy(button,busy,labelText); if(busy){button.dataset.old=button.textContent;button.textContent=labelText;button.disabled=true;}else{button.textContent=button.dataset.old||button.textContent;button.disabled=false;} }
  function formatDate(value,dateOnly=false) { if(!value)return ''; const date=new Date(String(value).replace(' ','T')); if(Number.isNaN(date.getTime()))return String(value); return new Intl.DateTimeFormat('en-IN',dateOnly?{day:'2-digit',month:'short',year:'numeric'}:{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(date); }
  function normalize(value='') { return String(value || '').trim().toLowerCase(); }
  function esc(value='') { return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
  function attr(value='') { return esc(value).replace(/`/g,'&#096;'); }
  return { init, load, open, close };
})();

document.addEventListener('DOMContentLoaded', WTC_STUDENT_ASSIGNED_TESTS.init);
