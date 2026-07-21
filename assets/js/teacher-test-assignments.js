/* WAGH Tuition Classes — Teacher Test Assignment UI Phase 2.5F v1.0 */
const WTC_TEACHER_TEST_ASSIGNMENTS = (() => {
  const HASHES = { assignTestsPanel:'assign-tests', sentTestsPanel:'sent-tests', assignmentDetailPanel:'assignment-report' };
  let user = null;
  let tests = [];
  let students = [];
  let sent = [];
  let report = null;
  let selectedTestId = '';
  let busy = false;
  const pendingRequestIds = new Map();

  function init() {
    user = safeUser();
    if (!user || normalize(user.role) !== 'teacher') return;
    bindFilters();
    bindEvents();
    wrapTeacherRefresh();
    loadHub();
    restoreAssignmentPanel();
  }

  function safeUser() {
    try { return WTC_AUTH.getUser ? WTC_AUTH.getUser() : WTC_AUTH.requireRole('Teacher'); }
    catch (error) { return null; }
  }

  function identity() {
    return {
      teacherId:user.teacherId || user.id || '',
      mobile:user.mobile || '',
      deviceId:typeof WTC_AUTH.deviceId === 'function' ? WTC_AUTH.deviceId() : ''
    };
  }

  function bindFilters() {
    ['teacherAssignableSearch','teacherAssignableChapterFilter','teacherAssignableTypeFilter']
      .forEach(id => document.getElementById(id)?.addEventListener('input', renderTests));
    ['teacherSentSearch','teacherSentStatusFilter']
      .forEach(id => document.getElementById(id)?.addEventListener('input', renderSent));
    document.getElementById('teacherAssignmentSelectionMode')?.addEventListener('change', updateStudentPickerVisibility);
  }

  function bindEvents() {
    document.addEventListener('click', event => {
      const quick = event.target.closest('[data-quick-assign]');
      if (quick) return quickAssign(quick.dataset.quickAssign, quick);
      const configure = event.target.closest('[data-configure-assignment]');
      if (configure) return openDialog(configure.dataset.configureAssignment);
      const reportButton = event.target.closest('[data-assignment-report]');
      if (reportButton) return openReport(reportButton.dataset.assignmentReport, reportButton);
      const cancelButton = event.target.closest('[data-cancel-assignment]');
      if (cancelButton) return cancelAssignment(cancelButton.dataset.cancelAssignment, cancelButton);
      const selectAll = event.target.closest('[data-select-all-assignment-students]');
      if (selectAll) return setAllStudents(true);
      const clearAll = event.target.closest('[data-clear-assignment-students]');
      if (clearAll) return setAllStudents(false);
      if (event.target.matches('.teacher-assignment-modal')) closeDialog();
    });
    document.getElementById('teacherAssignmentForm')?.addEventListener('submit', submitAssignment);
    document.addEventListener('keydown', event => { if (event.key === 'Escape') closeDialog(); });
  }

  function wrapTeacherRefresh() {
    if (!window.TeacherApp || TeacherApp.__assignmentRefreshWrapped) return;
    const original = TeacherApp.refresh;
    TeacherApp.refresh = async function() {
      const result = typeof original === 'function' ? await original.apply(TeacherApp, arguments) : null;
      await loadHub(true);
      return result;
    };
    TeacherApp.__assignmentRefreshWrapped = true;
  }

  function restoreAssignmentPanel() {
    const hash = String(location.hash || '').replace(/^#/, '');
    if (hash.startsWith('assignment-')) {
      const groupId = decodeURIComponent(hash.slice('assignment-'.length));
      if (groupId) window.setTimeout(() => openReport(groupId), 80);
      return;
    }
    const panel = Object.keys(HASHES).find(key => HASHES[key] === hash);
    if (panel) window.setTimeout(() => openPanel(panel, false), 20);
  }

  function openPanel(panelId, updateHash=true) {
    if (!document.getElementById(panelId)) return;
    TeacherApp.openPanel(panelId, null, false);
    if (updateHash) history.replaceState(null, '', `#${HASHES[panelId] || 'assign-tests'}`);
    if (panelId === 'assignTestsPanel' && !tests.length) loadHub();
    if (panelId === 'sentTestsPanel' && !sent.length) loadSent();
  }

  async function loadHub(force=false) {
    if (busy && !force) return;
    busy = true;
    setStatus('Loading published tests and sent-test analytics…', 'info');
    try {
      const [catalog, sentData] = await Promise.all([
        WTC_API.call({ action:'teacherGetAssignableTests', ...identity() }),
        WTC_API.call({ action:'teacherGetSentTests', ...identity() })
      ]);
      if (catalog?.success === false) throw new Error(catalog.message || 'Published test library could not be loaded.');
      if (sentData?.success === false) throw new Error(sentData.message || 'Sent tests could not be loaded.');
      tests = Array.isArray(catalog.tests) ? catalog.tests : [];
      students = Array.isArray(catalog.students) ? catalog.students : [];
      sent = Array.isArray(sentData.assignments) ? sentData.assignments : [];
      populateFilters();
      renderTests();
      renderSent();
      renderSummary(sentData.summary || {});
      setStatus('Published test library and assignment analytics loaded.', 'success');
    } catch (error) {
      setStatus(error.message || 'Test Assignment Centre could not be loaded.', 'error');
      empty('teacherAssignableTestList', error.message);
      empty('teacherSentTestList', error.message);
      toast(error.message || 'Test Assignment Centre could not be loaded.', 'error');
    } finally { busy = false; }
  }

  async function loadSent() {
    try {
      const data = await WTC_API.call({ action:'teacherGetSentTests', ...identity() });
      if (data?.success === false) throw new Error(data.message || 'Sent tests could not be loaded.');
      sent = Array.isArray(data.assignments) ? data.assignments : [];
      renderSent();
      renderSummary(data.summary || {});
    } catch (error) { toast(error.message, 'error'); }
  }

  function populateFilters() {
    fillSelect('teacherAssignableChapterFilter', uniqueObjects(tests.map(test => ({ value:test.chapterId, label:chapterLabel(test) }))), 'All chapters');
    fillSelect('teacherAssignableTypeFilter', unique(tests.map(test => test.testType)), 'All test types');
  }

  function renderTests() {
    const box = document.getElementById('teacherAssignableTestList');
    if (!box) return;
    const search = normalize(value('teacherAssignableSearch'));
    const chapter = value('teacherAssignableChapterFilter');
    const type = value('teacherAssignableTypeFilter');
    const rows = tests.filter(test => {
      const haystack = normalize([test.testTitle,test.topic,test.chapterName,test.testId].join(' '));
      return (!search || haystack.includes(search)) && (!chapter || test.chapterId === chapter) && (!type || test.testType === type);
    });
    text('teacherAssignableCountLabel', `${rows.length} test${rows.length === 1 ? '' : 's'}`);
    box.innerHTML = rows.length ? rows.map(testCard).join('') : '<div class="teacher-empty">No published tests match these filters.</div>';
  }

  function testCard(test) {
    return `<article class="teacher-assignable-card">
      <div class="teacher-assignment-card-top"><span class="teacher-chip active">${esc(test.status || 'Published')}</span><span>${esc(test.questionCount || 0)} questions</span></div>
      <h3>${esc(test.testTitle || test.testId)}</h3>
      <p>${esc(chapterLabel(test))}</p>
      <div class="teacher-assignment-meta"><span>${esc(test.testType || 'MCQ Test')}</span><span>${esc(test.topic || 'Complete chapter')}</span><span>${esc(test.eligibleStudentCount || 0)} eligible</span></div>
      <div class="teacher-assignment-actions">
        <button class="btn small" type="button" data-quick-assign="${attr(test.testId)}">Quick Assign to All</button>
        <button class="btn outline small" type="button" data-configure-assignment="${attr(test.testId)}">Choose Students &amp; Options</button>
      </div>
    </article>`;
  }

  async function quickAssign(testId, button) {
    const test = tests.find(item => item.testId === testId);
    if (!test) return;
    if (!confirm(`Assign “${test.testTitle}” to all ${test.eligibleStudentCount} eligible students?\n\nQuick Assign uses 1 maximum attempt and no due date.`)) return;
    const requestKey = assignmentRequestKey({ testId, selectionMode:'ALL', studentIds:[], maxAttempts:1, dueAt:'', teacherMessage:'' });
    const clientRequestId = pendingRequestId(requestKey);
    setBusy(button, true, 'Assigning…');
    try {
      const data = await WTC_API.call({
        action:'teacherCreateTestAssignment', ...identity(), testId,
        selectionMode:'ALL', maxAttempts:1, dueAt:'', teacherMessage:'', clientRequestId
      });
      if (data?.success === false) throw new Error(data.message || 'Assignment failed.');
      clearPendingRequestId(requestKey);
      toast(data.message || 'Test assigned.', 'success');
      await loadSent();
      openPanel('sentTestsPanel');
    } catch (error) { toast(error.message || 'Assignment failed.', 'error'); }
    finally { setBusy(button, false); }
  }

  function openDialog(testId) {
    const test = tests.find(item => item.testId === testId);
    if (!test) return;
    selectedTestId = testId;
    text('teacherAssignmentDialogTitle', test.testTitle || test.testId);
    text('teacherAssignmentDialogMeta', `${chapterLabel(test)} • ${test.testType || 'MCQ Test'} • ${test.eligibleStudentCount || 0} eligible students`);
    const eligible = eligibleStudents(test);
    const box = document.getElementById('teacherAssignmentStudentPicker');
    box.innerHTML = eligible.map(student => `<label class="teacher-student-check"><input type="checkbox" value="${attr(student.studentId)}"><span><b>${esc(student.name || student.studentId)}</b><small>${esc([student.studentId,student.board,student.medium,student.performanceStatus].filter(Boolean).join(' • '))}</small></span></label>`).join('') || '<div class="teacher-empty">No eligible assigned students.</div>';
    document.getElementById('teacherAssignmentForm')?.reset();
    document.getElementById('teacherAssignmentSelectionMode').value = 'ALL';
    document.getElementById('teacherAssignmentMaxAttempts').value = '1';
    updateStudentPickerVisibility();
    const modal = document.getElementById('teacherAssignmentModal');
    modal?.classList.add('open');
    modal?.setAttribute('aria-hidden','false');
    document.body.classList.add('teacher-modal-open');
  }

  function closeDialog() {
    const modal = document.getElementById('teacherAssignmentModal');
    modal?.classList.remove('open');
    modal?.setAttribute('aria-hidden','true');
    document.body.classList.remove('teacher-modal-open');
    selectedTestId = '';
  }

  function updateStudentPickerVisibility() {
    const selected = value('teacherAssignmentSelectionMode') === 'SELECTED';
    document.getElementById('teacherAssignmentStudentPickerWrap')?.classList.toggle('hidden', !selected);
  }

  function setAllStudents(checked) {
    document.querySelectorAll('#teacherAssignmentStudentPicker input[type="checkbox"]').forEach(input => { input.checked = checked; });
  }

  async function submitAssignment(event) {
    event.preventDefault();
    if (!selectedTestId) return;
    const mode = value('teacherAssignmentSelectionMode') || 'ALL';
    const studentIds = [...document.querySelectorAll('#teacherAssignmentStudentPicker input:checked')].map(input => input.value);
    if (mode === 'SELECTED' && !studentIds.length) return toast('Select at least one student.', 'error');
    const dueAt = value('teacherAssignmentDueAt');
    const maxAttempts = value('teacherAssignmentMaxAttempts');
    const teacherMessage = value('teacherAssignmentMessage');
    const requestKey = assignmentRequestKey({ testId:selectedTestId, selectionMode:mode, studentIds, dueAt, maxAttempts, teacherMessage });
    const clientRequestId = pendingRequestId(requestKey);
    const button = document.getElementById('teacherAssignmentSubmit');
    setBusy(button, true, 'Sending…');
    try {
      const data = await WTC_API.call({
        action:'teacherCreateTestAssignment', ...identity(),
        testId:selectedTestId, selectionMode:mode, studentIds:JSON.stringify(studentIds),
        dueAt, maxAttempts, teacherMessage, clientRequestId
      });
      if (data?.success === false) throw new Error(data.message || 'Assignment failed.');
      clearPendingRequestId(requestKey);
      toast(data.message || 'Test assigned successfully.', 'success');
      closeDialog();
      await loadSent();
      openPanel('sentTestsPanel');
    } catch (error) { toast(error.message || 'Assignment failed.', 'error'); }
    finally { setBusy(button, false); }
  }

  function eligibleStudents(test) {
    return students.filter(student => {
      if (student.status && normalize(student.status) !== 'active') return false;
      if (test.className && normalize(student.className) !== normalize(test.className)) return false;
      if (test.board && normalize(student.board) !== normalize(test.board)) return false;
      if (test.medium && normalize(student.medium) !== normalize(test.medium)) return false;
      return true;
    });
  }

  function renderSent() {
    const box = document.getElementById('teacherSentTestList');
    if (!box) return;
    const search = normalize(value('teacherSentSearch'));
    const status = value('teacherSentStatusFilter');
    const rows = sent.filter(item => {
      const haystack = normalize([item.testTitle,item.testId,item.chapterId].join(' '));
      return (!search || haystack.includes(search)) && (!status || item.status === status);
    });
    text('teacherSentCountLabel', `${rows.length} assignment${rows.length === 1 ? '' : 's'}`);
    box.innerHTML = rows.length ? rows.map(sentCard).join('') : '<div class="teacher-empty">No sent tests match these filters.</div>';
    renderSnapshot(rows.slice(0,3));
  }

  function sentCard(item) {
    const s = item.summary || {};
    return `<article class="teacher-sent-card">
      <div class="teacher-sent-card-head"><div><span class="teacher-assignment-status ${attr(normalize(item.status))}">${esc(statusLabel(item.status))}</span><h3>${esc(item.testTitle || item.testId)}</h3><p>${esc(item.chapterId || '')} • Assigned ${esc(formatDate(item.assignedAt))}${item.dueAt ? ` • Due ${esc(formatDate(item.dueAt,true))}` : ''}</p></div><strong>${esc(s.completionRate || 0)}%</strong></div>
      <div class="teacher-sent-metrics"><span><small>Assigned</small><b>${esc(s.assigned || 0)}</b></span><span><small>Attempted</small><b>${esc(s.attempted || 0)}</b></span><span><small>Pending</small><b>${esc(s.pending || 0)}</b></span><span><small>Overdue</small><b>${esc(s.overdue || 0)}</b></span><span><small>Average</small><b>${esc(s.averagePercent || 0)}%</b></span></div>
      <div class="teacher-assignment-actions"><button class="btn small" type="button" data-assignment-report="${attr(item.assignmentGroupId)}">View Analytics</button>${item.status !== 'COMPLETED' && item.status !== 'CANCELLED' ? `<button class="btn outline small danger-outline" type="button" data-cancel-assignment="${attr(item.assignmentGroupId)}">Cancel Pending</button>` : ''}</div>
    </article>`;
  }

  function renderSummary(summary) {
    text('teacherSentGroupTotal', summary.groups || 0);
    text('teacherSentAssignedStudents', summary.assignedStudents || 0);
    text('teacherSentAttemptedTotal', summary.attempted || 0);
    text('teacherSentPendingTotal', summary.pending || 0);
    text('teacherSentOverdueTotal', summary.overdue || 0);
    text('teacherAssignmentNavCount', summary.pending || 0);
    text('teacherSentNavCount', summary.groups || 0);
    text('teacherAssignedTestsOverview', summary.groups || 0);
    text('teacherPendingAssignmentsOverview', summary.pending || 0);
  }

  function renderSnapshot(rows) {
    const box = document.getElementById('teacherAssignmentSnapshot');
    if (!box) return;
    box.innerHTML = rows.length ? rows.map(item => `<button type="button" data-assignment-report="${attr(item.assignmentGroupId)}"><span><b>${esc(item.testTitle)}</b><small>${esc(item.summary.completionRate || 0)}% complete • ${esc(item.summary.pending || 0)} pending</small></span><strong>›</strong></button>`).join('') : '<div class="teacher-empty">No tests assigned yet.</div>';
  }

  async function openReport(groupId, button=null) {
    setBusy(button, true, 'Opening…');
    try {
      const data = await WTC_API.call({ action:'teacherGetAssignmentReport', ...identity(), assignmentGroupId:groupId });
      if (data?.success === false) throw new Error(data.message || 'Assignment report failed.');
      report = data.assignment;
      renderReport(data);
      openPanel('assignmentDetailPanel', false);
      history.replaceState(null, '', `#assignment-${encodeURIComponent(groupId)}`);
    } catch (error) { toast(error.message || 'Assignment report failed.', 'error'); }
    finally { setBusy(button, false); }
  }

  function renderReport(data) {
    const item = data.assignment || {};
    const s = data.summary || {};
    text('teacherAssignmentReportTitle', item.testTitle || item.testId || 'Assignment Report');
    text('teacherAssignmentReportMeta', `${item.chapterId || ''} • Assigned ${formatDate(item.assignedAt)}${item.dueAt ? ` • Due ${formatDate(item.dueAt,true)}` : ''}`);
    const summary = document.getElementById('teacherAssignmentReportSummary');
    if (summary) summary.innerHTML = metric('Assigned',s.assigned) + metric('Attempted',s.attempted) + metric('Pending',s.pending) + metric('Overdue',s.overdue) + metric('Completion',`${s.completionRate || 0}%`) + metric('Average',`${s.averagePercent || 0}%`) + metric('Highest',`${s.highestPercent || 0}%`) + metric('Below 50%',s.below50);
    const rows = Array.isArray(data.students) ? data.students : [];
    const table = document.getElementById('teacherAssignmentReportStudents');
    if (table) table.innerHTML = rows.length ? `<div class="teacher-table-wrap"><table class="teacher-assignment-table"><thead><tr><th>Student</th><th>Status</th><th>Attempts</th><th>Latest</th><th>Best</th><th>Submitted</th><th>Trend</th></tr></thead><tbody>${rows.map(studentRow).join('')}</tbody></table></div>` : '<div class="teacher-empty">No student rows.</div>';
  }

  function studentRow(row) {
    const trend = row.trend === null || row.trend === undefined ? '—' : `${row.trend > 0 ? '+' : ''}${row.trend}%`;
    return `<tr><td><b>${esc(row.studentName || row.studentId)}</b><small>${esc(row.studentId || '')}</small></td><td><span class="teacher-assignment-status ${attr(normalize(row.status))}">${esc(statusLabel(row.status))}</span></td><td>${esc(row.attempts || 0)}</td><td>${row.latestPercent === null ? '—' : `${esc(row.latestPercent)}%`}</td><td>${row.bestPercent === null ? '—' : `${esc(row.bestPercent)}%`}</td><td>${esc(row.lastSubmittedAt ? formatDate(row.lastSubmittedAt) : 'Not attempted')}</td><td>${esc(trend)}</td></tr>`;
  }

  async function cancelAssignment(groupId, button) {
    if (!confirm('Cancel this assignment for students who have not completed it? Completed evidence will be preserved.')) return;
    setBusy(button, true, 'Cancelling…');
    try {
      const data = await WTC_API.call({ action:'teacherCancelTestAssignment', ...identity(), assignmentGroupId:groupId });
      if (data?.success === false) throw new Error(data.message || 'Cancellation failed.');
      toast(data.message || 'Assignment cancelled.', 'success');
      await loadSent();
    } catch (error) { toast(error.message || 'Cancellation failed.', 'error'); }
    finally { setBusy(button, false); }
  }

  function backToSent() { openPanel('sentTestsPanel'); }

  function downloadAssignmentCsv() {
    if (!report?.students?.length) return toast('Open an assignment report first.', 'error');
    const rows = [['Student ID','Student','Status','Attempts','First %','Latest %','Best %','Trend %','Submitted','On Time']];
    report.students.forEach(item => rows.push([item.studentId,item.studentName,item.status,item.attempts,item.firstPercent ?? '',item.latestPercent ?? '',item.bestPercent ?? '',item.trend ?? '',item.lastSubmittedAt,item.onTime === null ? '' : item.onTime ? 'Yes' : 'No']));
    downloadCsv(`WTC_Assignment_${report.testId || 'Report'}.csv`, rows);
  }

  function printAssignmentReport() { if (!report) return toast('Open an assignment report first.', 'error'); window.print(); }

  function metric(label,value) { return `<article><small>${esc(label)}</small><strong>${esc(value ?? 0)}</strong></article>`; }
  function chapterLabel(test) { return `${test.chapterNo ? `Chapter ${test.chapterNo}: ` : ''}${test.chapterName || test.chapterId || 'Chapter'}`; }
  function statusLabel(value) { return String(value || 'ASSIGNED').replace(/_/g,' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()); }
  function value(id) { return document.getElementById(id)?.value || ''; }
  function text(id,value) { const el=document.getElementById(id); if(el) el.textContent=String(value ?? ''); }
  function empty(id,message) { const el=document.getElementById(id); if(el) el.innerHTML=`<div class="teacher-empty">${esc(message || 'Unable to load data.')}</div>`; }
  function setStatus(message,type='info') { const el=document.getElementById('teacherAssignmentGlobalStatus'); if(el){ el.className=`teacher-status ${type}`; el.textContent=message; } }
  function toast(message,type='success') { if(window.WTC_UI?.toast) WTC_UI.toast(message,type); }
  function setBusy(button,busy,label='Loading…') { if(!button)return; if(window.WTC_UI?.setBusy)return WTC_UI.setBusy(button,busy,label); if(busy){button.dataset.old=button.textContent;button.textContent=label;button.disabled=true;}else{button.textContent=button.dataset.old||button.textContent;button.disabled=false;delete button.dataset.old;} }
  function normalize(value='') { return String(value || '').trim().toLowerCase(); }
  function esc(value='') { return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
  function attr(value='') { return esc(value).replace(/`/g,'&#096;'); }
  function unique(values) { return [...new Set((values||[]).filter(Boolean))].sort(); }
  function uniqueObjects(values) { const map=new Map(); (values||[]).forEach(item=>{ if(item?.value&&!map.has(item.value))map.set(item.value,item); }); return [...map.values()].sort((a,b)=>a.label.localeCompare(b.label)); }
  function fillSelect(id,items,label) { const el=document.getElementById(id); if(!el)return; const current=el.value; el.innerHTML=`<option value="">${esc(label)}</option>`+items.map(item=>typeof item==='string'?`<option>${esc(item)}</option>`:`<option value="${attr(item.value)}">${esc(item.label)}</option>`).join(''); if([...el.options].some(option=>option.value===current))el.value=current; }
  function formatDate(value,dateOnly=false) { if(!value)return 'No due date'; let date=new Date(String(value).replace(' ','T')); if(Number.isNaN(date.getTime()))return String(value); return new Intl.DateTimeFormat('en-IN',dateOnly?{day:'2-digit',month:'short',year:'numeric'}:{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(date); }
  function assignmentRequestKey(input={}) {
    return JSON.stringify({
      teacherId:identity().teacherId,
      testId:String(input.testId || ''),
      selectionMode:String(input.selectionMode || 'ALL'),
      studentIds:[...(input.studentIds || [])].map(String).sort(),
      dueAt:String(input.dueAt || ''),
      maxAttempts:String(input.maxAttempts ?? ''),
      teacherMessage:String(input.teacherMessage || '').trim()
    });
  }
  function requestStorageKey(requestKey) { return `wtc:teacher-assignment:req:${simpleHash(requestKey)}`; }
  function pendingRequestId(requestKey) {
    if (pendingRequestIds.has(requestKey)) return pendingRequestIds.get(requestKey);
    const storageKey = requestStorageKey(requestKey);
    let id = '';
    try { id = sessionStorage.getItem(storageKey) || ''; } catch (error) {}
    if (!id) {
      id = uuid();
      try { sessionStorage.setItem(storageKey, id); } catch (error) {}
    }
    pendingRequestIds.set(requestKey, id);
    return id;
  }
  function clearPendingRequestId(requestKey) {
    pendingRequestIds.delete(requestKey);
    try { sessionStorage.removeItem(requestStorageKey(requestKey)); } catch (error) {}
  }
  function simpleHash(value='') {
    let hash = 2166136261;
    for (let index=0; index<String(value).length; index++) {
      hash ^= String(value).charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }
  function uuid() { return window.crypto?.randomUUID?.() || `REQ-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
  function downloadCsv(filename,rows) { const content=rows.map(row=>row.map(cell=>`"${String(cell??'').replace(/"/g,'""')}"`).join(',')).join('\n'); const blob=new Blob(['\ufeff'+content],{type:'text/csv;charset=utf-8'}); const url=URL.createObjectURL(blob); const a=document.createElement('a');a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url); }

  return { init, openPanel, loadHub, openDialog, closeDialog, backToSent, downloadAssignmentCsv, printAssignmentReport };
})();

document.addEventListener('DOMContentLoaded', WTC_TEACHER_TEST_ASSIGNMENTS.init);
