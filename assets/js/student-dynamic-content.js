/*
Patch helper for student.js dynamic feature buttons.
Use this after loading assessment-config.js and assessment-api.js.
It lets dynamic feature buttons open clean lesson/solutions/MCQ/worksheet content from WTC_AI_CONTENT_ENGINE.
*/
const WTC_DYNAMIC_CONTENT = (() => {
  async function openFeature(feature) {
    if (!feature || feature.type !== 'dynamic') return false;
    if (feature.action === 'lesson') return renderLesson(feature.contentId);
    if (feature.action === 'solutions') return renderSolutions(feature.contentId);
    if (feature.action === 'mcq') return renderMCQ(feature.contentId);
    if (feature.action === 'worksheet' || feature.action === 'answerWriting') return renderWorksheet(feature.contentId);
    return false;
  }

  async function renderLesson(lessonId) {
    const res = await WTC_ASSESSMENT_API.getLesson(lessonId);
    const html = res.lesson ? res.lesson.formattedHTML : '<div class="card">Lesson not published yet.</div>';
    renderContentShell('Lesson', html);
  }

  async function renderSolutions(solutionSetId) {
    const res = await WTC_ASSESSMENT_API.getSolutions(solutionSetId);
    const inside = (res.solutions && res.solutions.insideChapter) || [];
    const end = (res.solutions && res.solutions.endExercise) || [];
    const html = `<div class="solution-page"><h1>Solutions</h1>
      <section><h2>Inside Chapter Questions</h2>${inside.length ? inside.map(solutionCard).join('') : '<p>No inside chapter solutions published.</p>'}</section>
      <section><h2>End Exercise Questions</h2>${end.length ? end.map(solutionCard).join('') : '<p>No end exercise solutions published.</p>'}</section></div>`;
    renderContentShell('Solutions', html);
  }

  async function renderMCQ(mcqSetId) {
    const res = await WTC_ASSESSMENT_API.getMCQ(mcqSetId);
    const rows = res.mcq || [];
    const html = `<div class="mcq-page"><h1>MCQ Test</h1>${rows.map((q,i)=>`<div class="content-card"><h3>Q${i+1}. ${esc(q.questionText)}</h3><ol type="A"><li>${esc(q.optionA)}</li><li>${esc(q.optionB)}</li><li>${esc(q.optionC)}</li><li>${esc(q.optionD)}</li></ol><details><summary>Answer & Explanation</summary><b>Answer: ${esc(q.correctOption)}</b><p>${esc(q.explanation)}</p></details></div>`).join('') || '<p>No MCQ published yet.</p>'}</div>`;
    renderContentShell('MCQ Test', html);
  }

  async function renderWorksheet(worksheetSetId) {
    const res = await WTC_ASSESSMENT_API.getWorksheet(worksheetSetId);
    const rows = res.worksheet || [];
    const html = `<div class="worksheet-page"><h1>Worksheet</h1>${rows.map((q,i)=>`<div class="content-card"><h3>${i+1}. ${esc(q.questionText)}</h3><p><b>Type:</b> ${esc(q.questionType)} | <b>Marks:</b> ${esc(q.marks)}</p><details><summary>Answer Key</summary>${q.answerKeyHTML || ''}</details></div>`).join('') || '<p>No worksheet published yet.</p>'}</div>`;
    renderContentShell('Worksheet', html);
  }

  function renderContentShell(title, html) {
    let sec = document.getElementById('dynamicContentSection');
    if (!sec) {
      sec = document.createElement('section');
      sec.id = 'dynamicContentSection';
      sec.className = 'page-section';
      document.querySelector('.main-area').appendChild(sec);
    }
    sec.innerHTML = `<div class="section-head"><div><h2>${esc(title)}</h2><p class="muted">Clean student-ready content from WTC AI Content Engine.</p></div><button class="btn outline" onclick="StudentApp.show('featuresSection')">← Features</button></div><div class="student-content-render">${html}</div>`;
    StudentApp.show('dynamicContentSection');
  }

  function solutionCard(s) {
    return `<details class="content-card"><summary><b>${esc(s.questionGroup)} ${esc(s.questionNumber)}</b> — ${esc(s.questionText)}</summary><div>${s.solutionHTML || esc(s.stepByStepSolution || '')}</div></details>`;
  }
  function esc(s='') { return String(s).replace(/[&<>\"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[m])); }
  return { openFeature };
})();
