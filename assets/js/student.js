window.StudentApp = (() => {
  let user = null;
  let subjects = [];
  let chapters = [];
  let selectedSubject = null;
  let selectedChapter = null;
  let currentFeatures = [];
  let progressRequest = null;
  let progressLoadedAt = 0;
  const ROUTE_VERSION = 1;
  let routeWritePaused = false;

  function studentId() {
    return String((user && (user.id || user.studentId)) || 'guest');
  }

  function routeKey() {
    return `wtc:student-route:${studentId()}`;
  }

  function readRoute() {
    try {
      const value = JSON.parse(sessionStorage.getItem(routeKey()) || 'null');
      if (!value || value.version !== ROUTE_VERSION || String(value.studentId) !== studentId()) return null;
      return value;
    } catch (error) {
      return null;
    }
  }

  function writeRoute(patch) {
    if (routeWritePaused || !user) return;
    const previous = readRoute() || {};
    const next = {
      ...previous,
      ...patch,
      version:ROUTE_VERSION,
      studentId:studentId(),
      savedAt:Date.now()
    };
    try { sessionStorage.setItem(routeKey(), JSON.stringify(next)); }
    catch (error) { console.warn('Student page position could not be saved.', error.message); }
  }

  function recordSection(sectionId) {
    const simple = ['homeSection','subjectsSection','progressSection','profileSection'].includes(sectionId);
    const route = {
      sectionId,
      subjectId:simple ? null : selectedSubjectId(),
      chapterId:simple ? null : selectedChapterId(),
      scrollY:0
    };
    if (simple || sectionId !== 'dynamicContentSection') {
      route.feature = null;
      route.dynamic = null;
    }
    writeRoute(route);
  }

  function selectedSubjectId() {
    return selectedSubject && (selectedSubject.subjectId || selectedSubject.id || selectedSubject.subjectName || selectedSubject.name) || '';
  }

  function selectedChapterId() {
    return selectedChapter && (selectedChapter.chapterId || selectedChapter.id || selectedChapter.chapterNo || selectedChapter.chapterName) || '';
  }

  function compactFeature(feature) {
    if (!feature) return null;
    return ['featureId','featureName','name','type','action','contentId','url','icon'].reduce((copy, key) => {
      if (feature[key] !== undefined && feature[key] !== null) copy[key] = feature[key];
      return copy;
    }, {});
  }

  function featureIdentity(feature) {
    if (!feature) return '';
    return [feature.featureId, feature.action, feature.contentId, feature.url, feature.featureName || feature.name]
      .map(value => String(value || '').trim().toLowerCase()).join('|');
  }

  function setDynamicRoute(dynamicState) {
    const previous = readRoute() || {};
    writeRoute({
      sectionId:'dynamicContentSection',
      subjectId:selectedSubjectId(),
      chapterId:selectedChapterId(),
      feature:previous.feature || null,
      dynamic:{ ...(previous.dynamic || {}), ...(dynamicState || {}) },
      scrollY:window.scrollY || 0
    });
  }

  /* ===== Student Navigation Engine ===== */

let navigationStack = [];

function pushScreen(screen) {

  const last = navigationStack[navigationStack.length - 1];

  if (last !== screen) {
    navigationStack.push(screen);
    history.pushState({ screen }, "", "");
  }
}

function restoreScreen(screen) {

  switch (screen) {

    case "subjects":
      show("subjectsSection");
      loadSubjects(); // for navigation edit 09/07
      break;

    case "chapters":
      show("chaptersSection");
      if (selectedSubject) { // for navigation edit 09/07
        loadChapters();
      }
      break;

    case "features":
      show("featuresSection");
      break;

    default:
      show("homeSection");
  }

}

  async function init() {
    user = WTC_AUTH.requireRole('Student');
    if (!user) {
      finishPageRestore();
      return;
    }

    try {
    fillUser();
    bindProfile();
    const savedRoute = readRoute();
    routeWritePaused = true;
    await loadInitialData();
    document.addEventListener('wtc:progress-updated', () => loadProgress(true));
    /* ==== Navigation code edit 09/07 ===== */
    pushScreen("dashboard");

window.addEventListener("popstate", () => {

  navigationStack.pop();

  const previous = navigationStack[navigationStack.length - 1];

  if (!previous) {

    history.pushState({ screen: "dashboard" }, "", "");
    navigationStack = ["dashboard"];
    restoreScreen("dashboard");
    return;

  }

  restoreScreen(previous);

});
    window.addEventListener('pagehide', saveCurrentScroll);
    window.addEventListener('beforeunload', saveCurrentScroll);

    const restoredSection = await restoreSavedRoute(savedRoute);
    routeWritePaused = false;
    if (!restoredSection) {
      show('homeSection', { persist:false });
      recordSection('homeSection');
    } else {
      const exactRestore = restoredSection === savedRoute?.sectionId;
      if (exactRestore) writeRoute({ ...(savedRoute || {}), scrollY:Number(savedRoute?.scrollY || 0) });
      else recordSection(restoredSection);
      const restoreY = exactRestore ? Number(savedRoute?.scrollY || 0) : 0;
      window.requestAnimationFrame(() => window.scrollTo(0, restoreY));
      window.setTimeout(() => window.scrollTo(0, restoreY), 350);
    }
    } catch (error) {
      routeWritePaused = false;
      console.error('Student page restoration failed.', error);
      show('homeSection', { persist:false });
      recordSection('homeSection');
    } finally {
      finishPageRestore();
    }
  }

  function finishPageRestore() {
    document.documentElement.classList.add('student-portal-ready');
    const splash = document.getElementById('studentRestoreSplash');
    if (splash) {
      splash.setAttribute('aria-hidden', 'true');
      window.setTimeout(() => splash.remove(), 260);
    }
  }

  function fillUser() {
    document.querySelectorAll('[data-user-name]').forEach(el => {
      el.textContent = user.name || 'Student';
    });

    document.querySelectorAll('[data-user-avatar]').forEach(el => {
      el.textContent = WTC_UI.initials(user.name || 'Student');
    });

    const meta = `${user.board || 'Board'} · ${user.className || user.class || 'Class'} · ${user.medium || 'Medium'}`;
    document.getElementById('studentMeta').textContent = meta;
  }

  function show(sectionId, options={}) {
    document.querySelectorAll('.page-section').forEach(section => {
      section.classList.remove('active');
    });

    const section = document.getElementById(sectionId);
    if (section) section.classList.add('active');

    document.querySelectorAll('[data-nav]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.nav === sectionId);
    });

    if (sectionId === 'progressSection') loadProgress();
    if (sectionId === 'profileSection') loadMyProfileRequests();
    if (options.persist !== false) recordSection(sectionId);
  }

  function subjectRequestProfile() {
    return {
      studentId:user.id || user.studentId,
      id:user.id || user.studentId,
      board:user.board,
      className:user.className || user.class,
      medium:user.medium
    };
  }

  function applySubjects(list) {
    subjects = Array.isArray(list) ? list : [];
    const box = document.getElementById('subjectGrid');
    document.getElementById('subjectCount').textContent = subjects.length;
    if (box) {
      box.innerHTML = subjects.length
        ? subjects.map(subjectCard).join('')
        : WTC_UI.loadingHTML('No subjects found for your profile yet.');
    }
  }

  function applyCatalogSummary(catalog={}) {
    const subjectTotal = Number(catalog.subjectCount ?? subjects.length ?? 0);
    const chapterTotal = Number(catalog.chapterCount ?? 0);
    setText('subjectCount', subjectTotal);
    setText('chapterCount', chapterTotal);
  }

  function applyBasicProgress(progress={}) {
    const percent = Number(progress.percent ?? progress.overallPercent ?? progress.averagePercent ?? 0);
    setText('progressPercent', percent + '%');
    setWidth('progressFill', percent);
    setWidth('progressFill2', percent);
    setText('progressOverall', percent + '%');
    setText('progressAttempts', Number(progress.totalAttempts || 0));
    setText('progressBest', Number(progress.bestPercent || 0) + '%');
    setText('progressTests', Number(progress.testsCompleted || 0));
    setText('testsCompletedHome', Number(progress.testsCompleted || 0));
  }

  async function loadInitialData() {
    const profile = subjectRequestProfile();
    const cached = window.WTC_API?.peekSubjects ? WTC_API.peekSubjects(profile) : null;
    if (cached?.subjects) applySubjects(cached.subjects);
    else {
      const box = document.getElementById('subjectGrid');
      if (box) box.innerHTML = WTC_UI.loadingHTML('Loading your subjects...');
    }

    const refresh = WTC_API.getStudentBootstrap(profile)
      .then(data => {
        applySubjects(data.subjects || []);
        applyCatalogSummary(data.catalog || { subjectCount:(data.subjects || []).length, chapterCount:data.chapterCount || 0 });
        applyBasicProgress(Array.isArray(data.progress) ? data.progress[0] : (data.progress || {}));
        return data;
      })
      .catch(error => {
        if (!cached?.subjects) throw error;
        console.warn('Background student bootstrap refresh failed.', error.message);
        return { success:true, subjects:cached.subjects, progress:{ percent:0 }, cachedOnly:true };
      });

    // Cached catalogue data lets refresh restoration continue immediately.
    if (cached?.subjects?.length) {
      refresh.catch(() => {});
      return;
    }
    await refresh;
  }

  async function loadSubjects(forceRefresh=false) {
    const box = document.getElementById('subjectGrid');
    if (!subjects.length || forceRefresh) box.innerHTML = WTC_UI.loadingHTML(forceRefresh ? 'Refreshing your subjects...' : 'Loading your subjects...');

    try {
      const data = await WTC_API.getSubjects(subjectRequestProfile(), forceRefresh);
      applySubjects(data.subjects || []);
    } catch (err) {
      if (!subjects.length) box.innerHTML = WTC_UI.loadingHTML(err.message);
    }
  }

  function subjectCard(subject) {
    const id = WTC_UI.escape(subject.subjectId || subject.id || subject.subjectName || subject.name);
    const name = WTC_UI.escape(subject.subjectName || subject.name || 'Subject');

    return `
      <div class="card subject-card" onclick="StudentApp.openSubject('${id}')">
        <div class="subject-icon">${subject.icon || '📚'}</div>
        <h3>${name}</h3>
        <p class="muted">${WTC_UI.escape(subject.description || 'Open chapters')}</p>
      </div>
    `;
  }

  async function openSubject(id, options={}) {
    selectedSubject = subjects.find(subject => {
      return String(subject.subjectId || subject.id || subject.subjectName || subject.name) === String(id);
    });

    if (!selectedSubject) return;

    document.getElementById('chapterSubjectTitle').textContent = selectedSubject.subjectName || selectedSubject.name || 'Subject';
    if (!options.restore) pushScreen("subjects"); // for navigation edit 09/07
    show('chaptersSection', { persist:false });
    if (!options.restore) pushScreen("chapters"); // edit 09/07 for navigation
    await loadChapters();
    if (!options.restore) writeRoute({ sectionId:'chaptersSection', subjectId:selectedSubjectId(), chapterId:null, feature:null, dynamic:null, scrollY:0 });
  }

  async function loadChapters(forceRefresh=false) {
    const box = document.getElementById('chapterGrid');
    box.innerHTML = WTC_UI.loadingHTML('Loading chapters...');

    const subjectId = selectedSubject.subjectId || selectedSubject.id;

    try {
      const data = await WTC_API.getChapters({
        studentId: user.id || user.studentId,
        board: user.board,
        className: user.className || user.class,
        medium: user.medium,
        subjectId,
        subjectName: selectedSubject.subjectName || selectedSubject.name
      }, forceRefresh);

      chapters = data.chapters || [];

      box.innerHTML = chapters.length
        ? chapters.map(chapterCard).join('')
        : WTC_UI.loadingHTML('No chapters added yet.');
    } catch (err) {
      box.innerHTML = WTC_UI.loadingHTML(err.message);
    }
  }

  function chapterCard(chapter) {
    const id = WTC_UI.escape(chapter.chapterId || chapter.id || chapter.chapterNo || chapter.chapterName);

    return `
      <div class="card chapter-card" onclick="StudentApp.openChapter('${id}')">
        <span class="pill">Chapter ${WTC_UI.escape(chapter.chapterNo || '')}</span>
        <h3>${WTC_UI.escape(chapter.chapterName || chapter.name || 'Chapter')}</h3>
        <p class="muted">${WTC_UI.escape(chapter.description || 'Open chapter features')}</p>
      </div>
    `;
  }

  async function openChapter(id, options={}) {
    selectedChapter = chapters.find(chapter => {
      return String(chapter.chapterId || chapter.id || chapter.chapterNo || chapter.chapterName) === String(id);
    });

    if (!selectedChapter) return;

    document.getElementById('featureChapterTitle').textContent = selectedChapter.chapterName || selectedChapter.name || 'Chapter';
    show('featuresSection', { persist:false });
    if (!options.restore) pushScreen("features"); // for navigation edit 09/07

    await loadFeatures();
    if (!options.restore) writeRoute({ sectionId:'featuresSection', subjectId:selectedSubjectId(), chapterId:selectedChapterId(), feature:null, dynamic:null, scrollY:0 });
  }

  async function loadFeatures() {

    const box = document.getElementById('featureGrid');
    box.innerHTML = WTC_UI.loadingHTML('Loading feature buttons...');

    try {
      const chapterId = selectedChapter.chapterId || selectedChapter.id;
      const [staticData, dynamicFeatures] = await Promise.all([
        WTC_API.getChapterFeatures({
          chapterId,
          subjectId:selectedSubject.subjectId || selectedSubject.id
        }),
        loadDynamicFeatures(chapterId)
      ]);

      const staticFeatures = staticData.features || [];
      currentFeatures = mergeFeatureSources(dynamicFeatures, staticFeatures);

      box.innerHTML = currentFeatures.length
        ? currentFeatures.map(featureButton).join('')
        : WTC_UI.loadingHTML('No feature buttons added yet.');
    } catch (err) {
      box.innerHTML = WTC_UI.loadingHTML(err.message);
    }
  }

  async function loadDynamicFeatures(chapterId) {
    if (!window.WTC_ASSESSMENT_API || !chapterId) return [];

    try {
      const data = await WTC_ASSESSMENT_API.getFeatureMap(chapterId);
      return data.features || [];
    } catch (err) {
      console.warn('Dynamic feature map not available:', err.message);
      return [];
    }
  }

  /*
   * One visible button per feature family.
   * Published dynamic content wins; the existing static page remains the fallback
   * only when that exact dynamic feature is unavailable.
   */
  function mergeFeatureSources(dynamicFeatures, staticFeatures) {
    const dynamic = Array.isArray(dynamicFeatures) ? dynamicFeatures : [];
    const fallback = Array.isArray(staticFeatures) ? staticFeatures : [];
    const dynamicFamilies = new Set(dynamic.map(featureFamily).filter(Boolean));
    return dynamic.concat(fallback.filter(feature => !dynamicFamilies.has(featureFamily(feature))));
  }

  function featureFamily(feature) {
    if (!feature) return '';
    if (window.WTC_FEATURE_ENGINE && typeof WTC_FEATURE_ENGINE.resolveFeatureId === 'function') {
      return WTC_FEATURE_ENGINE.resolveFeatureId(feature);
    }
    const source = [feature.featureId, feature.action, feature.featureName, feature.name, feature.type, feature.url]
      .filter(Boolean).join(' ').toLowerCase();
    if (source.includes('answer writing') || source.includes('answerwriting')) return 'ANSWER_WRITING';
    if (source.includes('solution')) return 'SOLUTION';
    if (source.includes('worksheet')) return 'WORKSHEET';
    if (source.includes('mcq') || source.includes('quiz') || source.includes('test')) return 'MCQ';
    if (source.includes('lesson')) return 'LESSON';
    if (source.includes('notes')) return 'NOTES';
    if (source.includes('video')) return 'VIDEO';
    if (source.includes('revision')) return 'REVISION';
    if (source.includes('digital lab')) return 'DIGITAL_LAB';
    if (source.includes('activity')) return 'ACTIVITY';
    return String(feature.featureId || feature.featureName || feature.name || feature.url || '').trim().toUpperCase();
  }

  function featureButton(feature, index) {
    const name = WTC_UI.escape(feature.featureName || feature.name || 'Feature');
    const label = feature.type === 'dynamic' ? 'AI Content Engine' : (feature.type || 'Learning feature');

    return `
      <button class="feature-btn" onclick="StudentApp.openFeatureByIndex(${index})">
        ${feature.icon || '🔗'} ${name}
        <small>${WTC_UI.escape(label)}</small>
      </button>
    `;
  }

  async function openFeatureByIndex(index, options={}) {
    const sourceFeature = currentFeatures[index];
    if (!sourceFeature) return false;
    const feature = { ...sourceFeature, user, subject:selectedSubject, chapter:selectedChapter };

    if (feature.type === 'dynamic' && !options.restore) {
      writeRoute({
        sectionId:'dynamicContentSection',
        subjectId:selectedSubjectId(),
        chapterId:selectedChapterId(),
        feature:compactFeature(feature),
        dynamic:{ view:feature.action === 'mcq' ? 'hub' : 'content', action:feature.action || '', contentId:feature.contentId || '' },
        scrollY:0
      });
    }

    /* ======================================================
       Feature Engine v1.0
       Dynamic engine first → static URL fallback.
       If the Feature Engine script is unavailable, the legacy
       code below still protects and opens existing pages.
    ====================================================== */
    if (typeof WTC_FEATURE_ENGINE !== 'undefined') {
      try {
        const opened = await WTC_FEATURE_ENGINE.open({
          feature,
          user,
          subject: selectedSubject,
          chapter: selectedChapter
        });
        return opened;
      } catch (error) {
        console.warn('Feature Engine failed; using legacy fallback.', error);
      }
    }

    /* ---------------- Legacy backward-compatible fallback ---------------- */
    const featureName = feature.featureName || feature.name || 'Feature';
    const featureType = String(feature.type || '').toLowerCase();
    const featureLabel = featureName.toLowerCase();

    const isSolution =
      featureLabel.includes('solution') ||
      featureType.includes('solution') ||
      String(feature.url || '').toLowerCase().includes('solution');

    if (
      String(user.studentType || '').toUpperCase() === 'GENERAL_STUDENT' &&
      !isSolution
    ) {
      return showFullAccessPopup();
    }

    WTC_API.logAccess({
      userId: user.id || user.studentId,
      name: user.name,
      role: user.role,
      mobile: user.mobile,
      actionName: featureName,
      url: feature.url || feature.contentId || ''
    }).catch(() => {});

    if (feature.type === 'dynamic' && window.WTC_DYNAMIC_CONTENT) {
      try {
        const opened = await WTC_DYNAMIC_CONTENT.openFeature(feature);
        if (opened !== false) return opened;
      } catch (error) {
        WTC_UI.toast(error.message || 'Dynamic content failed to open.', 'error');
        return false;
      }
    }

    openStaticFeature(feature.url, featureName);
    return true;
  }

  /* ------- feature buttons pop-up for general student --- */

  function showFullAccessPopup() {

  const old = document.getElementById("wtcAccessPopup");
  if (old) old.remove();

  document.body.insertAdjacentHTML("beforeend", `
<div id="wtcAccessPopup" class="wtc-access-overlay">

<div class="wtc-access-box">

<h2>🔒 Full Access Required</h2>

<p>
Please contact
<b>WAGH Tuition Classes</b>
to unlock all premium learning features.
</p>

<a
class="wtc-whatsapp-btn"
href="https://wa.me/919537036383"
target="_blank">
📱 Contact on WhatsApp
</a>

<button
class="wtc-close-btn"
onclick="document.getElementById('wtcAccessPopup').remove();">
Close
</button>

</div>

</div>
`);
  }
  function openStaticFeature(url, name) {
    if (!url || url === '#') {
      return WTC_UI.toast('This feature URL is not added yet.', 'error');
    }

    window.location.href = url;
  }

  function openFeature(url, name) {
    openStaticFeature(url, name);
  }

  async function loadProgress(forceRefresh=false) {
    const studentId = user.id || user.studentId;
    const text = document.getElementById('progressText');
    if (text && forceRefresh) text.textContent = 'Refreshing your personal report…';
    if (!forceRefresh && progressRequest) return progressRequest;
    if (!forceRefresh && progressLoadedAt && (Date.now() - progressLoadedAt) < 15000) return;

    progressRequest = (async () => {
    try {
      const [basic, report] = await Promise.all([
        WTC_API.getStudentProgress(studentId, forceRefresh).catch(() => ({ progress:{ percent:0 } })),
        WTC_API.getMCQProgressReport(subjectRequestProfile(), forceRefresh).catch(() => null)
      ]);
      const progress = Array.isArray(basic.progress) ? basic.progress[0] : basic.progress;
      const summary = report?.summary || {};
      const percent = Number(summary.overallPercent ?? progress?.percent ?? progress?.overallPercent ?? 0);

      setText('progressPercent', percent + '%');
      setWidth('progressFill', percent);
      setWidth('progressFill2', percent);
      setText('progressOverall', percent + '%');
      setText('progressStudentName', user.name || 'Student');
      setText('progressAttempts', Number(summary.totalAttempts || 0));
      setText('progressBest', Number(summary.bestPercent || 0) + '%');
      setText('progressTests', Number(summary.testsCompleted || 0));
      setText('testsCompletedHome', Number(summary.testsCompleted || 0));
      const xp = Number(report?.gamification?.xp || 0);
      const level = Number(report?.gamification?.level || 1);
      setText('progressXp', xp + ' · ' + level);
      const ring = document.getElementById('progressRing');
      if (ring) ring.style.setProperty('--progress', Math.max(0, Math.min(100, percent)));

      const message = report?.recentAttempts?.[0]?.personalizedMessage ||
        (percent >= 80 ? 'You are building strong chapter mastery.' :
          percent > 0 ? 'Keep practising your focus topics.' : 'Complete your first test to begin.');
      setText('progressMessage', message);
      if (text) text.textContent = summary.totalAttempts
        ? `Overall progress ${percent}% · Accuracy ${Number(summary.accuracy || 0)}% · ${formatStudyTime(summary.totalTimeSec || 0)} practised`
        : 'Your progress will update automatically after your first submitted MCQ test.';

      renderRecommendations(report?.recommendations || []);
      renderSkills(report?.skills || []);
      renderRecentAttempts(report?.recentAttempts || []);
      progressLoadedAt = Date.now();
    } catch (error) {
      if (text) text.textContent = 'Progress could not be loaded. Please refresh after checking the runtime deployment.';
    } finally {
      progressRequest = null;
    }
    })();
    return progressRequest;
  }

  function renderRecommendations(items) {
    const box = document.getElementById('progressRecommendations');
    if (!box) return;
    box.innerHTML = items.length ? items.map((item, index) => `
      <div class="recommendation-item ${WTC_UI.escape(item.type || 'practice')}">
        <span>${index + 1}</span><div><b>${WTC_UI.escape(item.title || 'Next step')}</b><p>${WTC_UI.escape(item.message || '')}</p></div>
      </div>`).join('') : '<div class="progress-empty">📝 Complete an MCQ test to receive personal recommendations.</div>';
  }

  function renderSkills(items) {
    const box = document.getElementById('progressSkills');
    if (!box) return;
    box.innerHTML = items.length ? items.map(item => {
      const accuracy = Number(item.accuracy || 0);
      return `<div class="skill-item"><div><b>${WTC_UI.escape(item.topic || 'General')}</b><span>${WTC_UI.escape(item.level || 'Developing')}</span></div>
        <div class="skill-track"><i style="width:${Math.max(0, Math.min(100, accuracy))}%"></i></div>
        <small>${accuracy}% accuracy · ${Number(item.attempted || 0)} questions</small></div>`;
    }).join('') : '<div class="progress-empty">📊 Topic strengths will appear after your first test.</div>';
  }

  function renderRecentAttempts(items) {
    const box = document.getElementById('progressRecentAttempts');
    if (!box) return;
    box.innerHTML = items.length ? items.map(item => `
      <article class="recent-attempt">
        <div class="attempt-score ${Number(item.percent || 0) >= 75 ? 'strong' : ''}">${Number(item.percent || 0)}%</div>
        <div><b>${WTC_UI.escape(item.testTitle || 'MCQ Test')}</b><p>${WTC_UI.escape(item.chapterName || item.chapterId || '')}</p>
        <small>${Number(item.correctCount || item.score || 0)}/${Number(item.total || 0)} correct · ${formatStudyTime(item.totalTimeSec || 0)} · ${WTC_UI.escape(item.createdAt || '')}</small></div>
        <span class="attempt-tag">${Number(item.retryCount || 0) ? 'Retry ' + Number(item.retryCount || 0) : 'First attempt'}</span>
      </article>`).join('') : '<div class="progress-empty">🕘 No test attempts have been saved yet.</div>';
  }

  function setText(id, value) { const element = document.getElementById(id); if (element) element.textContent = value; }
  function setWidth(id, percent) { const element = document.getElementById(id); if (element) element.style.width = Math.max(0, Math.min(100, Number(percent || 0))) + '%'; }
  function formatStudyTime(seconds) {
    const value = Number(seconds || 0);
    if (value < 60) return value + ' sec';
    if (value < 3600) return Math.round(value / 60) + ' min';
    return (value / 3600).toFixed(1) + ' hr';
  }

  function bindProfile() {
    renderProfileSummary();

    const requestForm = document.getElementById('profileChangeRequestForm');
    const passwordForm = document.getElementById('passwordChangeForm');

    fillProfileRequestForm();

    if (requestForm && !requestForm.dataset.bound) {
      requestForm.dataset.bound = 'true';
      requestForm.addEventListener('submit', async event => {
        event.preventDefault();
        const payload = Object.fromEntries(new FormData(requestForm).entries());
        payload.studentId = user.id || user.studentId;

        try {
          setProfileFormBusy(requestForm, true);
          const data = await WTC_API.createProfileChangeRequest(payload);
          if (!data.success) {
            await loadMyProfileRequests();
            return WTC_UI.toast(data.message || 'Profile change request failed.', 'error');
          }
          requestForm.currentPassword.value = '';
          requestForm.reason.value = '';
          requestForm.requestedMobile.value = '';
          WTC_UI.toast(data.message || 'Request sent for admin approval.', 'success');
          await loadMyProfileRequests();
        } catch (err) {
          WTC_UI.toast(err.message || 'Profile change request failed.', 'error');
        } finally {
          setProfileFormBusy(requestForm, false);
        }
      });
    }

    if (passwordForm && !passwordForm.dataset.bound) {
      passwordForm.dataset.bound = 'true';
      passwordForm.addEventListener('submit', async event => {
        event.preventDefault();

        const payload = Object.fromEntries(new FormData(passwordForm).entries());
        if (payload.newPassword !== payload.confirmPassword) {
          return WTC_UI.toast('New password and confirmation do not match.', 'error');
        }

        try {
          setProfileFormBusy(passwordForm, true);
          const data = await WTC_API.changeStudentPassword({
            studentId:user.id || user.studentId,
            currentPassword:payload.currentPassword,
            newPassword:payload.newPassword
          });
          if (!data.success) return WTC_UI.toast(data.message || 'Password change failed.', 'error');
          passwordForm.reset();
          WTC_UI.toast(data.message || 'Password changed successfully.', 'success');
        } catch (err) {
          WTC_UI.toast(err.message || 'Password change failed.', 'error');
        } finally {
          setProfileFormBusy(passwordForm, false);
        }
      });
    }

    loadMyProfileRequests();
  }

  function setProfileFormBusy(form, busy) {
    if (!form) return;
    form.querySelectorAll('input,select,textarea,button').forEach(control => {
      control.disabled = Boolean(busy);
    });
  }

  function maskMobile(value) {
    const digits = String(value || '').replace(/\D/g, '');
    return digits ? `••••••${digits.slice(-4)}` : 'Not available';
  }

  function renderProfileSummary(maskedMobile) {
    setText('profileDisplayName', user?.name || 'Student');
    setText('profileDisplayMobile', maskedMobile || maskMobile(user?.mobile));
    setText('profileDisplayBoard', user?.board || '—');
    setText('profileDisplayClass', user?.className || user?.class || '—');
    setText('profileDisplayMedium', user?.medium || '—');
  }

  function fillProfileRequestForm() {
    const form = document.getElementById('profileChangeRequestForm');
    if (!form) return;
    if (form.requestedName) form.requestedName.value = user?.name || '';
    if (form.requestedBoard) form.requestedBoard.value = user?.board || 'CBSE';
    if (form.requestedClassName) form.requestedClassName.value = user?.className || user?.class || 'Class 10';
    if (form.requestedMedium) form.requestedMedium.value = user?.medium || 'English Medium';
    if (form.requestedMobile) form.requestedMobile.value = '';
  }

  async function loadMyProfileRequests() {
    const box = document.getElementById('profileRequestStatus');
    const form = document.getElementById('profileChangeRequestForm');
    if (!box || !user) return;

    box.innerHTML = '<div class="profile-request-empty">Loading profile request status…</div>';

    try {
      const previousProfile = {
        name:user.name || '',
        mobile:user.mobile || '',
        board:user.board || '',
        className:user.className || user.class || '',
        medium:user.medium || ''
      };

      const data = await WTC_API.getMyProfileChangeRequests(user.id || user.studentId);
      if (!data.success) throw new Error(data.message || 'Could not load profile requests.');

      if (data.student) {
        user = { ...user, ...data.student };
        WTC_AUTH.setUser(user);
        fillUser();
        renderProfileSummary(data.maskedMobile);
        fillProfileRequestForm();

        const profileChanged = previousProfile.name !== (user.name || '') ||
          previousProfile.mobile !== (user.mobile || '') ||
          previousProfile.board !== (user.board || '') ||
          previousProfile.className !== (user.className || user.class || '') ||
          previousProfile.medium !== (user.medium || '');

        if (profileChanged) {
          WTC_API.clearStudentData(user.id || user.studentId);
          subjects = [];
          chapters = [];
          selectedSubject = null;
          selectedChapter = null;
          await loadInitialData();
        }
      } else {
        renderProfileSummary(data.maskedMobile);
      }

      const requests = Array.isArray(data.requests) ? data.requests : [];
      box.innerHTML = requests.length
        ? requests.map(renderStudentProfileRequest).join('')
        : '<div class="profile-request-empty">No profile change request has been submitted.</div>';

      if (form) form.hidden = Boolean(data.pendingRequest);
    } catch (err) {
      box.innerHTML = `<div class="profile-request-empty">${WTC_UI.escape(err.message || 'Could not load profile request status.')}</div>`;
      if (form) form.hidden = false;
    }
  }

  function renderStudentProfileRequest(item) {
    const status = String(item.status || 'PENDING').toUpperCase();
    const statusClass = status.toLowerCase();
    const changes = profileRequestChanges(item);
    const canCancel = status === 'PENDING';

    return `
      <article class="profile-request-entry ${statusClass}">
        <div class="profile-request-entry-head">
          <div>
            <h4>Request ${WTC_UI.escape(item.requestId || '')}</h4>
            <div class="profile-request-meta">Submitted ${WTC_UI.escape(item.requestedAt || '')}</div>
          </div>
          <span class="profile-request-status-pill ${statusClass}">${WTC_UI.escape(profileStatusLabel(status))}</span>
        </div>
        <div class="profile-change-list">${changes || '<div class="profile-request-meta">No visible change details.</div>'}</div>
        <div class="profile-request-meta"><b>Reason:</b> ${WTC_UI.escape(item.reason || '—')}</div>
        ${item.adminRemarks ? `<div class="profile-request-remarks"><b>Admin note:</b> ${WTC_UI.escape(item.adminRemarks)}</div>` : ''}
        ${canCancel ? `
          <div class="profile-cancel-row">
            <div class="field">
              <label>Current password to cancel</label>
              <input id="cancelPassword_${WTC_UI.escape(item.requestId || '')}" type="password" autocomplete="current-password">
            </div>
            <button class="btn small outline" type="button" onclick="StudentApp.cancelProfileRequest('${WTC_UI.escape(item.requestId || '')}')">Cancel Request</button>
          </div>` : ''}
      </article>
    `;
  }

  function profileRequestChanges(item) {
    const lines = [];
    addProfileChangeLine(lines, 'Name', userSafeCurrentName(item), item.requestedName);
    addProfileChangeLine(lines, 'Mobile', item.currentMobileMasked, item.requestedMobileMasked);
    addProfileChangeLine(lines, 'Board', item.currentBoard, item.requestedBoard);
    addProfileChangeLine(lines, 'Class', item.currentClassName, item.requestedClassName);
    addProfileChangeLine(lines, 'Medium', item.currentMedium, item.requestedMedium);
    return lines.join('');
  }

  function userSafeCurrentName(item) {
    return item.studentName || user?.name || 'Current name';
  }

  function addProfileChangeLine(lines, label, currentValue, requestedValue) {
    const current = String(currentValue || '—');
    const requested = String(requestedValue || current);
    if (current === requested) return;
    lines.push(`
      <div class="profile-change-line">
        <strong>${WTC_UI.escape(label)}</strong>
        <span>${WTC_UI.escape(current)}</span>
        <span class="profile-arrow">→</span>
        <span><b>${WTC_UI.escape(requested)}</b></span>
      </div>
    `);
  }

  function profileStatusLabel(status) {
    return ({
      PENDING:'Pending Admin Approval',
      APPLIED:'Approved & Applied',
      REJECTED:'Rejected',
      CANCELLED:'Cancelled'
    })[status] || status;
  }

  async function cancelProfileRequest(requestId) {
    const input = document.getElementById(`cancelPassword_${requestId}`);
    const currentPassword = input?.value || '';
    if (!currentPassword) return WTC_UI.toast('Enter your current password to cancel the request.', 'error');

    try {
      const data = await WTC_API.cancelProfileChangeRequest({
        requestId,
        studentId:user.id || user.studentId,
        currentPassword
      });
      if (!data.success) return WTC_UI.toast(data.message || 'Could not cancel the request.', 'error');
      WTC_UI.toast(data.message || 'Request cancelled.', 'success');
      await loadMyProfileRequests();
    } catch (err) {
      WTC_UI.toast(err.message || 'Could not cancel the request.', 'error');
    }
  }

  function findById(list, id, keys) {
    return (list || []).find(item => keys.some(key => String(item[key] || '') === String(id || ''))) || null;
  }

  async function restoreSavedRoute(route) {
    if (!route || !route.sectionId) return '';
    const sectionId = route.sectionId;
    const simpleSections = ['homeSection','subjectsSection','progressSection','profileSection'];

    if (simpleSections.includes(sectionId)) {
      show(sectionId, { persist:false });
      return sectionId;
    }

    selectedSubject = findById(subjects, route.subjectId, ['subjectId','id','subjectName','name']);
    if (!selectedSubject) {
      show('subjectsSection', { persist:false });
      return 'subjectsSection';
    }
    document.getElementById('chapterSubjectTitle').textContent = selectedSubject.subjectName || selectedSubject.name || 'Subject';
    await loadChapters();

    if (sectionId === 'chaptersSection') {
      show('chaptersSection', { persist:false });
      navigationStack = ['dashboard','subjects','chapters'];
      return 'chaptersSection';
    }

    selectedChapter = findById(chapters, route.chapterId, ['chapterId','id','chapterNo','chapterName','name']);
    if (!selectedChapter) {
      show('chaptersSection', { persist:false });
      return 'chaptersSection';
    }
    document.getElementById('featureChapterTitle').textContent = selectedChapter.chapterName || selectedChapter.name || 'Chapter';
    await loadFeatures();

    if (sectionId === 'featuresSection') {
      show('featuresSection', { persist:false });
      navigationStack = ['dashboard','subjects','chapters','features'];
      return 'featuresSection';
    }

    if (sectionId !== 'dynamicContentSection' || !route.feature) {
      show('featuresSection', { persist:false });
      return 'featuresSection';
    }

    const wantedIdentity = featureIdentity(route.feature);
    let featureIndex = currentFeatures.findIndex(feature => featureIdentity(feature) === wantedIdentity);
    if (featureIndex < 0 && route.feature.contentId) {
      featureIndex = currentFeatures.findIndex(feature => String(feature.contentId || '') === String(route.feature.contentId));
    }
    if (featureIndex < 0 && route.feature.action) {
      featureIndex = currentFeatures.findIndex(feature => String(feature.action || '') === String(route.feature.action));
    }
    if (featureIndex < 0) {
      show('featuresSection', { persist:false });
      return 'featuresSection';
    }

    const opened = await openFeatureByIndex(featureIndex, { restore:true });
    if (opened === false) {
      show('featuresSection', { persist:false });
      return 'featuresSection';
    }
    if (window.WTC_DYNAMIC_CONTENT?.restoreRefreshState) {
      await window.WTC_DYNAMIC_CONTENT.restoreRefreshState(route.dynamic || {});
    }
    navigationStack = ['dashboard','subjects','chapters','features','dynamic'];
    return 'dynamicContentSection';
  }

  function saveCurrentScroll() {
    if (routeWritePaused) return;
    const route = readRoute();
    if (route) writeRoute({ scrollY:window.scrollY || 0 });
  }

  /* smart navigation*/
function backToSubjects() {
  selectedChapter = null;
  currentFeatures = [];
  restoreScreen("subjects");
  pushScreen("subjects");
}

function backToChapters() {
  selectedChapter = null;
  currentFeatures = [];
  restoreScreen("chapters");
  pushScreen("chapters");
}
  return {
    init,
    show,
    loadSubjects,
    openSubject,
    openChapter,
    openFeature,
    openFeatureByIndex,
    loadProgress,
    loadMyProfileRequests,
    cancelProfileRequest,
    setDynamicRoute,
    backToSubjects, 
    backToChapters
  };
})();

document.addEventListener('DOMContentLoaded', StudentApp.init);
