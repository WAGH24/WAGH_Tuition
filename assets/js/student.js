const StudentApp = (() => {
  let user = null;
  let subjects = [];
  let chapters = [];
  let selectedSubject = null;
  let selectedChapter = null;
  let currentFeatures = [];

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
      show("dashboardSection");
  }

}

  function init() {
    user = WTC_AUTH.requireRole('Student');
    if (!user) return;

    fillUser();
    bindProfile();
    loadSubjects();
    loadProgress();
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

  function show(sectionId) {
    document.querySelectorAll('.page-section').forEach(section => {
      section.classList.remove('active');
    });

    const section = document.getElementById(sectionId);
    if (section) section.classList.add('active');

    document.querySelectorAll('[data-nav]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.nav === sectionId);
    });
  }

  async function loadSubjects() {
    const box = document.getElementById('subjectGrid');
    box.innerHTML = WTC_UI.loadingHTML('Loading your subjects...');

    try {
      const data = await WTC_API.getSubjects({
        studentId: user.id || user.studentId,
        board: user.board,
        className: user.className || user.class,
        medium: user.medium
      });

      subjects = data.subjects || [];
      document.getElementById('subjectCount').textContent = subjects.length;

      box.innerHTML = subjects.length
        ? subjects.map(subjectCard).join('')
        : WTC_UI.loadingHTML('No subjects found for your profile yet.');
    } catch (err) {
      box.innerHTML = WTC_UI.loadingHTML(err.message);
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

  async function openSubject(id) {
    selectedSubject = subjects.find(subject => {
      return String(subject.subjectId || subject.id || subject.subjectName || subject.name) === String(id);
    });

    if (!selectedSubject) return;

    document.getElementById('chapterSubjectTitle').textContent = selectedSubject.subjectName || selectedSubject.name || 'Subject';
    pushScreen("subjects"); // for navigation edit 09/07
    show('chaptersSection');
    pushScreen("chapters"); // edit 09/07 for navigation 
    await loadChapters();
  }

  async function loadChapters() {
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
      });

      chapters = data.chapters || [];
      document.getElementById('chapterCount').textContent = chapters.length;

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

  async function openChapter(id) {
    selectedChapter = chapters.find(chapter => {
      return String(chapter.chapterId || chapter.id || chapter.chapterNo || chapter.chapterName) === String(id);
    });

    if (!selectedChapter) return;

    document.getElementById('featureChapterTitle').textContent = selectedChapter.chapterName || selectedChapter.name || 'Chapter';
    show('featuresSection');
    pushScreen("features"); // for navigation edit 09/07

    const box = document.getElementById('featureGrid');
    box.innerHTML = WTC_UI.loadingHTML('Loading feature buttons...');

    try {
      const staticData = await WTC_API.getChapterFeatures({
        chapterId: selectedChapter.chapterId || selectedChapter.id,
        subjectId: selectedSubject.subjectId || selectedSubject.id
      });

      const staticFeatures = staticData.features || [];
      const dynamicFeatures = await loadDynamicFeatures(selectedChapter.chapterId || selectedChapter.id);

      currentFeatures = [...dynamicFeatures, ...staticFeatures];

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

  async function openFeatureByIndex(index) {
    const feature = currentFeatures[index];
    if (!feature) return;

    /* ======================================================
       Feature Engine v1.0
       Dynamic engine first → static URL fallback.
       If the Feature Engine script is unavailable, the legacy
       code below still protects and opens existing pages.
    ====================================================== */
    if (typeof WTC_FEATURE_ENGINE !== 'undefined') {
      try {
        await WTC_FEATURE_ENGINE.open({
          feature,
          user,
          subject: selectedSubject,
          chapter: selectedChapter
        });
        return;
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
        if (opened !== false) return;
      } catch (error) {
        WTC_UI.toast(error.message || 'Dynamic content failed to open.', 'error');
        return;
      }
    }

    openStaticFeature(feature.url, featureName);
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

  async function loadProgress() {
    try {
      const data = await WTC_API.getStudentProgress(user.id || user.studentId);
      const progress = Array.isArray(data.progress) ? data.progress[0] : data.progress;
      const percent = Number(progress?.percent || progress?.overallPercent || 0);

      document.getElementById('progressPercent').textContent = percent + '%';
      document.getElementById('progressFill').style.width = percent + '%';
      document.getElementById('progressFill2').style.width = percent + '%';
      document.getElementById('progressText').textContent = `Overall progress: ${percent}%`;
    } catch {
      document.getElementById('progressText').textContent = 'Progress will appear after test records are added.';
    }
  }

  function bindProfile() {
    const form = document.getElementById('profileForm');
    if (!form) return;

    ['name', 'mobile', 'board', 'className', 'medium'].forEach(key => {
      if (form[key]) form[key].value = user[key] || user.class || '';
    });

    form.addEventListener('submit', async event => {
      event.preventDefault();

      const payload = Object.fromEntries(new FormData(form).entries());
      payload.studentId = user.id || user.studentId;

      try {
        const data = await WTC_API.updateStudentProfile(payload);
        if (!data.success) return WTC_UI.toast(data.message || 'Profile update failed.', 'error');

        user = { ...user, ...payload };
        delete user.password;
        WTC_AUTH.setUser(user);
        fillUser();
        WTC_UI.toast('Profile saved successfully.', 'success');
        await loadSubjects();
      } catch (err) {
        WTC_UI.toast(err.message, 'error');
      }
    });
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
    backToSubjects, 
    backToChapters
  };
})();

document.addEventListener('DOMContentLoaded', StudentApp.init);
