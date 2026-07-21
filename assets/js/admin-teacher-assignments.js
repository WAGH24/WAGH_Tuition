/* WAGH Tuition Classes — Admin Teacher Assignment Manager Phase 2.5G v1.0 */
const WTC_TEACHER_ASSIGNMENT_ADMIN = (() => {
  const state = {
    admin: null,
    loaded: false,
    data: { teachers: [], students: [], subjects: [], assignments: [], summary: {} },
    filters: { teacherId: '', status: 'ALL' }
  };

  function init() {
    if (!document.getElementById('teacherAssignmentPanel')) return;
    state.admin = WTC_AUTH.requireRole('Admin');
    if (!state.admin) return;
    bind();
  }

  function bind() {
    const form = document.getElementById('teacherAssignmentForm');
    form?.addEventListener('submit', saveAssignments);

    ['teacherAssignmentBoard', 'teacherAssignmentClass', 'teacherAssignmentMedium', 'teacherAssignmentSection']
      .forEach(id => document.getElementById(id)?.addEventListener('change', refreshCandidates));

    document.getElementById('teacherAssignmentScopeType')?.addEventListener('change', () => {
      updateScopeVisibility();
      refreshCandidates();
    });

    document.getElementById('teacherAssignmentTeacher')?.addEventListener('change', event => {
      state.filters.teacherId = event.target.value;
      applyTeacherDefaults(event.target.value);
      refreshCandidates();
      renderExistingAssignments();
    });

    document.getElementById('teacherAssignmentStatusFilter')?.addEventListener('change', event => {
      state.filters.status = event.target.value;
      renderExistingAssignments();
    });
  }

  async function open() {
    if (!state.loaded) await load();
  }

  async function load() {
    const status = byId('teacherAssignmentLoadStatus');
    setStatusBox(status, 'Loading teachers, students, subjects and assignments…', 'info');
    try {
      const data = await WTC_API.call({
        action: 'adminGetTeacherAssignmentBootstrap',
        adminId: state.admin.adminId || state.admin.id || '',
        adminMobile: state.admin.mobile || ''
      });
      if (!data.success) throw new Error(data.message || 'Could not load Teacher assignments.');
      state.data = data;
      state.loaded = true;
      renderBootstrap();
      setStatusBox(status, data.schemaInstalled
        ? 'Assignment manager is ready.'
        : 'Backend sheet is not installed. Run installTeacherAssignmentSystem() first.', data.schemaInstalled ? 'success' : 'warning');
    } catch (error) {
      setStatusBox(status, error.message || 'Could not load Teacher assignments.', 'error');
      toast(error.message || 'Could not load Teacher assignments.', 'error');
    }
  }

  function renderBootstrap() {
    fillSelect('teacherAssignmentTeacher', state.data.teachers, 'Select Teacher', item => item.teacherId, item => `${item.name} (${item.teacherId})`);
    fillSelect('teacherAssignmentBoard', uniqueProfiles('board'), 'Select Board');
    fillSelect('teacherAssignmentClass', uniqueProfiles('className'), 'Select Class');
    fillSelect('teacherAssignmentMedium', uniqueProfiles('medium'), 'Select Medium');
    fillSelect('teacherAssignmentSection', uniqueProfiles('section'), 'All Sections / No Section');

    setText('teacherAssignmentTotal', state.data.summary?.totalAssignments || 0);
    setText('teacherAssignmentActiveTotal', state.data.summary?.activeAssignments || 0);
    setText('teacherAssignmentClassTotal', state.data.summary?.classAssignments || 0);
    setText('teacherAssignmentStudentTotal', state.data.summary?.studentAssignments || 0);
    setText('teacherAssignmentLegacyTotal', state.data.summary?.legacyOnlyTeachers || 0);

    updateScopeVisibility();
    refreshCandidates();
    renderExistingAssignments();
  }

  function uniqueProfiles(field) {
    return [...new Set([
      ...state.data.students.map(item => String(item[field] || '').trim()),
      ...state.data.subjects.map(item => String(item[field] || '').trim())
    ].filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }

  function applyTeacherDefaults(teacherId) {
    if (!teacherId) return;
    const teacher = state.data.teachers.find(item => item.teacherId === teacherId) || {};
    const current = (state.data.assignments || []).find(item => item.teacherId === teacherId && item.status === 'ACTIVE') || {};
    setSelectIfAvailable('teacherAssignmentBoard', current.board || teacher.legacyBoard || '');
    setSelectIfAvailable('teacherAssignmentClass', current.className || teacher.legacyClassName || '');
    setSelectIfAvailable('teacherAssignmentMedium', current.medium || teacher.legacyMedium || '');
    setSelectIfAvailable('teacherAssignmentSection', current.section || '');
  }

  function setSelectIfAvailable(id, value) {
    const select = byId(id);
    if (!select || !value) return;
    const option = [...select.options].find(item => normalize(item.value) === normalize(value));
    if (option) select.value = option.value;
  }

  function refreshCandidates() {
    const profile = currentProfile();
    const subjects = state.data.subjects.filter(subject => profileMatch(subject, profile, true));
    const students = state.data.students.filter(student => profileMatch(student, profile, false));
    renderChecklist('teacherAssignmentSubjectList', subjects, {
      empty: profile.board && profile.className && profile.medium ? 'No active subjects match this profile.' : 'Select Board, Class and Medium to see subjects.',
      name: 'teacherAssignmentSubject',
      value: item => item.subjectId,
      label: item => `${item.subjectName} (${item.subjectId})`,
      meta: item => [item.board, item.className, item.medium].filter(Boolean).join(' • ')
    });
    renderChecklist('teacherAssignmentStudentList', students, {
      empty: profile.board && profile.className && profile.medium ? 'No active students match this profile.' : 'Select Board, Class and Medium to see students.',
      name: 'teacherAssignmentStudent',
      value: item => item.studentId,
      label: item => `${item.name} (${item.studentId})`,
      meta: item => [item.board, item.className, item.medium, item.section].filter(Boolean).join(' • ')
    });
    setText('teacherAssignmentSubjectCount', subjects.length);
    setText('teacherAssignmentStudentCount', students.length);
  }

  function currentProfile() {
    return {
      board: byId('teacherAssignmentBoard')?.value || '',
      className: byId('teacherAssignmentClass')?.value || '',
      medium: byId('teacherAssignmentMedium')?.value || '',
      section: byId('teacherAssignmentSection')?.value || ''
    };
  }

  function profileMatch(item, profile, allowBlankItemProfile = false) {
    if (profile.board && (!allowBlankItemProfile || item.board) && normalize(item.board) !== normalize(profile.board)) return false;
    if (profile.className && (!allowBlankItemProfile || item.className) && normalize(item.className) !== normalize(profile.className)) return false;
    if (profile.medium && (!allowBlankItemProfile || item.medium) && normalize(item.medium) !== normalize(profile.medium)) return false;
    if (profile.section && (!allowBlankItemProfile || item.section) && normalize(item.section) !== normalize(profile.section)) return false;
    return true;
  }

  function updateScopeVisibility() {
    const studentMode = byId('teacherAssignmentScopeType')?.value === 'STUDENT';
    byId('teacherAssignmentStudentBlock')?.classList.toggle('is-hidden', !studentMode);
    byId('teacherAssignmentScopeHelp') && (byId('teacherAssignmentScopeHelp').textContent = studentMode
      ? 'Choose specific students. One secure row is stored for every selected student and subject.'
      : 'All current and future active students matching Board, Class, Medium and optional Section are included automatically.');
  }

  function selectAllSubjects(checked = true) {
    document.querySelectorAll('input[name="teacherAssignmentSubject"]').forEach(input => { input.checked = checked; });
  }

  function selectAllStudents(checked = true) {
    document.querySelectorAll('input[name="teacherAssignmentStudent"]').forEach(input => { input.checked = checked; });
  }

  async function saveAssignments(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const teacherId = byId('teacherAssignmentTeacher')?.value || '';
    const scopeType = byId('teacherAssignmentScopeType')?.value || 'CLASS';
    const profile = currentProfile();
    const subjectIds = checkedValues('teacherAssignmentSubject');
    const studentIds = scopeType === 'STUDENT' ? checkedValues('teacherAssignmentStudent') : [];
    const adminPassword = byId('teacherAssignmentAdminPassword')?.value || '';

    if (!teacherId) return toast('Select a teacher.', 'error');
    if (!profile.board || !profile.className || !profile.medium) return toast('Select Board, Class and Medium.', 'error');
    if (!subjectIds.length) return toast('Select at least one subject.', 'error');
    if (scopeType === 'STUDENT' && !studentIds.length) return toast('Select at least one student.', 'error');
    if (!adminPassword) return toast('Enter your admin password to save assignments.', 'error');

    const teacher = state.data.teachers.find(item => item.teacherId === teacherId);
    const scopeLabel = scopeType === 'CLASS'
      ? `${profile.board} • ${profile.className} • ${profile.medium}${profile.section ? ` • ${profile.section}` : ''}`
      : `${studentIds.length} selected student(s)`;
    if (!window.confirm(`Assign ${subjectIds.length} subject(s) to ${teacher?.name || teacherId} for ${scopeLabel}?`)) return;

    setBusy(form, true);
    try {
      const data = await WTC_API.call({
        action: 'adminSaveTeacherAssignments',
        adminId: state.admin.adminId || state.admin.id || '',
        adminMobile: state.admin.mobile || '',
        adminPassword,
        teacherId,
        scopeType,
        board: profile.board,
        className: profile.className,
        medium: profile.medium,
        section: profile.section,
        subjectIds: JSON.stringify(subjectIds),
        studentIds: JSON.stringify(studentIds),
        isPrimary: byId('teacherAssignmentPrimary')?.checked ? 'TRUE' : 'FALSE',
        startDate: byId('teacherAssignmentStartDate')?.value || '',
        endDate: byId('teacherAssignmentEndDate')?.value || ''
      });
      if (!data.success) throw new Error(data.message || 'Assignment save failed.');
      byId('teacherAssignmentAdminPassword').value = '';
      toast(data.message || 'Teacher assignment saved.', 'success');
      await load();
    } catch (error) {
      toast(error.message || 'Assignment save failed.', 'error');
    } finally {
      setBusy(form, false);
    }
  }

  function renderExistingAssignments() {
    const box = byId('teacherAssignmentExistingList');
    if (!box) return;
    let rows = state.data.assignments || [];
    const teacherId = byId('teacherAssignmentTeacher')?.value || state.filters.teacherId;
    const status = byId('teacherAssignmentStatusFilter')?.value || state.filters.status;
    if (teacherId) rows = rows.filter(item => item.teacherId === teacherId);
    if (status && status !== 'ALL') rows = rows.filter(item => item.status === status);

    if (!rows.length) {
      box.innerHTML = '<div class="teacher-assignment-empty">No assignments match the current filters.</div>';
      return;
    }

    box.innerHTML = rows.map(item => {
      const active = item.status === 'ACTIVE';
      const scope = item.scopeType === 'STUDENT'
        ? `Selected student: ${item.studentName || item.studentId}`
        : `Whole class${item.section ? ` • Section ${item.section}` : ''}`;
      return `
        <article class="teacher-assignment-row ${active ? 'is-active' : 'is-inactive'}">
          <div class="teacher-assignment-row-main">
            <div class="teacher-assignment-row-head">
              <strong>${escapeHTML(item.teacherName || item.teacherId)}</strong>
              <span class="teacher-assignment-badge ${active ? 'success' : 'muted'}">${escapeHTML(item.status)}</span>
              ${item.isPrimary ? '<span class="teacher-assignment-badge primary">Primary</span>' : '<span class="teacher-assignment-badge">Supporting</span>'}
            </div>
            <h4>${escapeHTML(item.subjectName || item.subjectId)}</h4>
            <p>${escapeHTML([item.board, item.className, item.medium, item.section].filter(Boolean).join(' • '))}</p>
            <small>${escapeHTML(scope)} · Source: ${escapeHTML(item.source || 'ADMIN')}</small>
          </div>
          <div class="teacher-assignment-row-actions">
            <button class="btn small ${active ? 'danger' : 'success'}" type="button" onclick="WTC_TEACHER_ASSIGNMENT_ADMIN.setStatus('${escapeAttr(item.assignmentId)}','${active ? 'INACTIVE' : 'ACTIVE'}')">
              ${active ? 'Deactivate' : 'Reactivate'}
            </button>
          </div>
        </article>`;
    }).join('');
  }

  async function setStatus(assignmentId, status) {
    const password = byId('teacherAssignmentAdminPassword')?.value || '';
    if (!password) return toast('Enter your admin password before changing assignment status.', 'error');
    if (!window.confirm(`${status === 'ACTIVE' ? 'Reactivate' : 'Deactivate'} this assignment?`)) return;
    try {
      const data = await WTC_API.call({
        action: 'adminSetTeacherAssignmentStatus',
        adminId: state.admin.adminId || state.admin.id || '',
        adminMobile: state.admin.mobile || '',
        adminPassword: password,
        assignmentId,
        status
      });
      if (!data.success) throw new Error(data.message || 'Status update failed.');
      byId('teacherAssignmentAdminPassword').value = '';
      toast(data.message || 'Assignment status updated.', 'success');
      await load();
    } catch (error) {
      toast(error.message || 'Status update failed.', 'error');
    }
  }

  async function previewMigration() {
    const box = byId('teacherAssignmentMigrationPreview');
    setStatusBox(box, 'Preparing a read-only legacy migration preview…', 'info');
    try {
      const data = await WTC_API.call({
        action: 'adminPreviewTeacherAssignmentMigration',
        adminId: state.admin.adminId || state.admin.id || '',
        adminMobile: state.admin.mobile || ''
      });
      if (!data.success) throw new Error(data.message || 'Migration preview failed.');
      const warnings = (data.warnings || []).map(item => `<li>${escapeHTML(item)}</li>`).join('');
      box.className = 'teacher-assignment-status info';
      box.innerHTML = `<b>${Number(data.teacherCount || 0)} teacher(s), ${Number(data.rowCount || 0)} proposed assignment row(s).</b>${warnings ? `<ul>${warnings}</ul>` : '<p>No warnings.</p>'}`;
    } catch (error) {
      setStatusBox(box, error.message || 'Migration preview failed.', 'error');
    }
  }

  async function migrateLegacy() {
    const password = byId('teacherAssignmentAdminPassword')?.value || '';
    if (!password) return toast('Enter your admin password before migration.', 'error');
    if (!window.confirm('Migrate only legacy-only teachers now? Existing TEACHER_ASSIGNMENTS rows will not be replaced.')) return;
    try {
      const data = await WTC_API.call({
        action: 'adminMigrateTeacherAssignments',
        adminId: state.admin.adminId || state.admin.id || '',
        adminMobile: state.admin.mobile || '',
        adminPassword: password
      });
      if (!data.success) throw new Error(data.message || 'Migration failed.');
      byId('teacherAssignmentAdminPassword').value = '';
      toast(data.message || 'Legacy assignments migrated.', 'success');
      await load();
    } catch (error) {
      toast(error.message || 'Migration failed.', 'error');
    }
  }

  function renderChecklist(containerId, items, config) {
    const box = byId(containerId);
    if (!box) return;
    if (!items.length) {
      box.innerHTML = `<div class="teacher-assignment-empty">${escapeHTML(config.empty)}</div>`;
      return;
    }
    box.innerHTML = items.map(item => `
      <label class="teacher-assignment-check">
        <input type="checkbox" name="${escapeAttr(config.name)}" value="${escapeAttr(config.value(item))}">
        <span><strong>${escapeHTML(config.label(item))}</strong><small>${escapeHTML(config.meta(item))}</small></span>
      </label>`).join('');
  }

  function fillSelect(id, items, placeholder, valueFn = item => item, labelFn = item => item) {
    const select = byId(id);
    if (!select) return;
    const previous = select.value;
    select.innerHTML = `<option value="">${escapeHTML(placeholder)}</option>` + (items || []).map(item =>
      `<option value="${escapeAttr(valueFn(item))}">${escapeHTML(labelFn(item))}</option>`
    ).join('');
    if ([...select.options].some(option => option.value === previous)) select.value = previous;
  }

  function checkedValues(name) {
    return [...document.querySelectorAll(`input[name="${name}"]:checked`)].map(input => input.value);
  }

  function setBusy(form, busy) {
    form.querySelectorAll('button,input,select').forEach(element => { element.disabled = busy; });
    const button = form.querySelector('[type="submit"]');
    if (button) button.textContent = busy ? 'Saving…' : 'Save Teacher Assignment';
  }

  function setStatusBox(element, text, type = 'info') {
    if (!element) return;
    element.className = `teacher-assignment-status ${type}`;
    element.textContent = text;
  }

  function toast(message, type) {
    if (window.WTC_UI?.toast) WTC_UI.toast(message, type);
    else window.alert(message);
  }

  function byId(id) { return document.getElementById(id); }
  function setText(id, value) { const element = byId(id); if (element) element.textContent = value; }
  function normalize(value) { return String(value || '').trim().toLowerCase().replace(/\s+/g, ' '); }
  function escapeHTML(value = '') { return String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char])); }
  function escapeAttr(value = '') { return escapeHTML(value); }

  document.addEventListener('DOMContentLoaded', init);
  return { open, load, refreshCandidates, selectAllSubjects, selectAllStudents, setStatus, previewMigration, migrateLegacy };
})();
