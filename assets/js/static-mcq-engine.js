(function(){
  'use strict';

  const data = window.WTC_STATIC_MCQ || {};
  const questions = Array.isArray(data.questions) ? data.questions : [];
  const state = {
    startedAt: Date.now(),
    submitted: false,
    answers: {},
    questionTimes: {},
    openedAt: {},
    visited: {}
  };

  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  const optionLetters = ['A','B','C','D'];

  function getUser(){
    try {
      return typeof WTC_AUTH !== 'undefined' && WTC_AUTH.getUser
        ? WTC_AUTH.getUser()
        : null;
    } catch(e) {
      return null;
    }
  }

  function loginPath(){
    return (typeof WTC_CONFIG !== 'undefined' && WTC_CONFIG.LOGIN_PAGE)
      ? WTC_CONFIG.LOGIN_PAGE
      : '/WAGH_Tuition/index.html#login';
  }

  function requireStudent(){
    const user = getUser();

    if(!user || String(user.role || '').toLowerCase() !== 'student'){
      sessionStorage.setItem('WTC_NEXT_AFTER_LOGIN', location.pathname + location.search + location.hash);
      location.href = loginPath();
      return null;
    }

    return user;
  }

  function init(){
    const user = requireStudent();
    if(!user) return;

    $('studentName').textContent = `${user.name || 'Student'}${user.studentId || user.id ? ' • ' + (user.studentId || user.id) : ''}`;
    $('testTitle').textContent = data.testTitle || 'MCQ Practice';
    $('testMeta').textContent = [data.board, data.className, data.medium, data.subjectName, data.chapterName].filter(Boolean).join(' • ');
    $('questionCount').textContent = questions.length;

    renderPalette();
    renderQuestions();
    updateDashboard();
    bindActions();
    setInterval(updateTimer, 1000);
    logOpen(user);
  }

  function bindActions(){
    applySavedTheme();
    $('submitBtn')?.addEventListener('click', submitTest);
    $('retryBtn')?.addEventListener('click', () => location.reload());
    $('topBtn')?.addEventListener('click', () => scrollTo({top:0, behavior:'smooth'}));
    $('themeBtn')?.addEventListener('click', toggleTheme);
    $('reviewBtn')?.addEventListener('click', () => {
      const firstUnanswered = questions.find(q => !state.answers[q.id]);
      const target = firstUnanswered || questions[0];
      if(target) scrollToQuestion(target.id);
    });
  }

  function renderPalette(){
    const grid = $('paletteGrid');
    if(!grid) return;
    grid.innerHTML = questions.map((q, i) => `<button class="palette-dot" id="pal-${esc(q.id)}" data-qid="${esc(q.id)}" type="button">${i+1}</button>`).join('');
    grid.querySelectorAll('.palette-dot').forEach(btn => btn.addEventListener('click', () => scrollToQuestion(btn.dataset.qid)));
  }

  function renderQuestions(){
    const list = $('questionList');
    if(!list) return;

    list.innerHTML = questions.map((q, i) => {
      state.openedAt[q.id] = Date.now();
      const options = q.options || {};
      return `<article class="q-card" data-qid="${esc(q.id)}" id="q-${esc(q.id)}">
        <div class="q-top">
          <span class="q-no">Q${i+1}</span>
          <span class="tag">${esc(q.topic || 'General')}</span>
          <span class="level level-${esc(String(q.difficulty || 'Easy').toLowerCase())}">${esc(q.difficulty || 'Easy')}</span>
          <span class="marks">${esc(q.marks || 1)} Mark</span>
        </div>
        ${q.image ? `<img class="q-image" src="${esc(q.image)}" alt="Question image">` : ''}
        <p class="q-text">${esc(q.question)}</p>
        <div class="options" role="radiogroup" aria-label="Options for question ${i+1}">
          ${optionLetters.filter(key => options[key] !== undefined).map(key => `<button class="option" type="button" data-qid="${esc(q.id)}" data-option="${key}">
            <span class="option-key">${key}</span><span class="option-text">${esc(options[key])}</span>
          </button>`).join('')}
        </div>
        <div class="answer-line hidden"></div>
        <div class="explanation"><b>Explanation:</b> ${esc(q.explanation || 'Explanation will be added soon.')}</div>
      </article>`;
    }).join('');

    list.querySelectorAll('.option').forEach(btn => {
      btn.addEventListener('click', () => selectOption(btn.dataset.qid, btn.dataset.option));
    });

    observeCards();
  }

  function observeCards(){
    if(!('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if(entry.isIntersecting){
          const qid = entry.target.dataset.qid;
          state.visited[qid] = true;
          state.openedAt[qid] = state.openedAt[qid] || Date.now();
          updatePalette();
        }
      });
    }, {threshold: 0.35});
    document.querySelectorAll('.q-card').forEach(card => observer.observe(card));
  }

  function selectOption(qid, option){
    if(state.submitted) return;
    state.answers[qid] = option;
    state.questionTimes[qid] = Math.max(1, Math.round((Date.now() - (state.openedAt[qid] || state.startedAt))/1000));

    const card = document.querySelector(`[data-qid="${cssEscape(qid)}"]`);
    card?.querySelectorAll('.option').forEach(o => o.classList.toggle('selected', o.dataset.option === option));
    updateDashboard();
    updatePalette();
  }

  function updateDashboard(){
    const answered = Object.keys(state.answers).length;
    const total = questions.length || 1;
    $('answeredCount').textContent = answered;
    const deg = Math.round((answered / total) * 360);
    $('progressRing')?.style.setProperty('--deg', `${deg}deg`);
  }

  function updatePalette(){
    questions.forEach(q => {
      const dot = $(`pal-${q.id}`);
      if(!dot) return;
      dot.classList.toggle('visited', !!state.visited[q.id]);
      dot.classList.toggle('answered', !!state.answers[q.id]);
    });
  }

  function updateTimer(){
    const sec = Math.floor((Date.now() - state.startedAt)/1000);
    const m = String(Math.floor(sec/60)).padStart(2,'0');
    const s = String(sec%60).padStart(2,'0');
    $('timer').textContent = `${m}:${s}`;
  }

  function calculate(){
    let score = 0;
    let totalMarks = 0;
    let earnedMarks = 0;
    const details = questions.map((q, idx) => {
      const selected = state.answers[q.id] || '';
      const correct = q.correct;
      const marks = Number(q.marks || 1);
      const isCorrect = selected === correct;
      totalMarks += marks;
      if(isCorrect){ score++; earnedMarks += marks; }
      return {
        questionNo: idx + 1,
        questionId: q.id,
        questionText: q.question,
        topic: q.topic || '',
        difficulty: q.difficulty || '',
        selectedOption: selected,
        correctOption: correct,
        isCorrect,
        marks,
        timeTakenSec: state.questionTimes[q.id] || 0
      };
    });
    const total = questions.length;
    const percent = total ? Math.round((score / total) * 100) : 0;
    return {score, total, percent, earnedMarks, totalMarks, details, totalTimeSec: Math.round((Date.now() - state.startedAt)/1000)};
  }

  async function submitTest(){
    if(state.submitted) return;
    const unanswered = questions.filter(q => !state.answers[q.id]).length;
    if(unanswered && !confirm(`${unanswered} question(s) are unanswered. Submit now?`)) return;

    state.submitted = true;
    const result = calculate();
    revealAnswers(result);
    showResult(result);
    await saveProgress(result);
  }

  function revealAnswers(result){
    questions.forEach(q => {
      const card = document.querySelector(`#q-${cssEscape(q.id)}`);
      if(!card) return;
      card.classList.add('submitted');
      card.querySelectorAll('.option').forEach(opt => {
        const key = opt.dataset.option;
        opt.disabled = true;
        if(key === q.correct) opt.classList.add('correct');
        if(key === state.answers[q.id] && key !== q.correct) opt.classList.add('wrong');
      });
      const answerLine = card.querySelector('.answer-line');
      const selected = state.answers[q.id] || 'Not answered';
      answerLine.classList.remove('hidden');
      answerLine.innerHTML = `<b>Your answer:</b> ${esc(selected)} &nbsp; | &nbsp; <b>Correct answer:</b> ${esc(q.correct)}`;
      card.querySelector('.explanation')?.classList.add('show');
    });

    result.details.forEach(d => {
      const dot = $(`pal-${d.questionId}`);
      dot?.classList.add(d.isCorrect ? 'pal-correct' : 'pal-wrong');
    });
  }

  function showResult(r){
    const weakTopics = [...new Set(r.details.filter(d => !d.isCorrect).map(d => d.topic).filter(Boolean))].slice(0, 4);
    const message = r.percent >= 80 ? 'Excellent! Keep revising.' : r.percent >= 50 ? 'Good attempt. Revise weak topics.' : 'Revise the chapter and retry.';
    $('resultBox').classList.remove('hidden');
    $('resultBox').innerHTML = `<div class="result-header">
        <div><p class="eyebrow">Result Saved Report</p><h2>${message}</h2></div>
        <div class="result-percent">${r.percent}%</div>
      </div>
      <div class="result-grid">
        <div><span>Score</span><b>${r.score}/${r.total}</b></div>
        <div><span>Marks</span><b>${r.earnedMarks}/${r.totalMarks}</b></div>
        <div><span>Total Time</span><b>${formatTime(r.totalTimeSec)}</b></div>
        <div><span>Weak Topics</span><b>${weakTopics.length ? esc(weakTopics.join(', ')) : 'None'}</b></div>
      </div>
      <p id="saveStatus" class="save-status">Saving progress...</p>`;
    $('submitBtn').classList.add('hidden');
    $('retryBtn').classList.remove('hidden');
    $('resultBox').scrollIntoView({behavior:'smooth', block:'center'});
  }

  async function saveProgress(r){
    const user = getUser();
    const payload = {
      action: 'saveStaticMCQResult',
      studentId: user.studentId || user.id,
      name: user.name,
      mobile: user.mobile,
      board: data.board,
      className: data.className,
      medium: data.medium,
      subjectId: data.subjectId,
      subjectName: data.subjectName,
      chapterId: data.chapterId,
      chapterName: data.chapterName,
      testId: data.testId,
      testTitle: data.testTitle,
      testType: data.testType || 'Static MCQ Practice',
      score: r.score,
      total: r.total,
      percent: r.percent,
      earnedMarks: r.earnedMarks,
      totalMarks: r.totalMarks,
      totalTimeSec: r.totalTimeSec,
      attemptDetails: JSON.stringify(r.details),
      page: location.pathname,
      deviceId:
        typeof WTC_AUTH !== 'undefined' && WTC_AUTH.deviceId
          ? WTC_AUTH.deviceId()
          : ''
    };
    try{
      const res = await WTC_API.call(payload);
      $('saveStatus').textContent = res && res.success ? '✅ Progress saved successfully.' : '⚠️ Result shown, but progress could not be saved.';
    }catch(err){
      console.warn(err);
      $('saveStatus').textContent = '⚠️ Result shown, but progress could not be saved. Please add Apps Script patch and deploy new version.';
    }
  }

  async function logOpen(user){
    try{
      await WTC_API.logAccess({
        userId: user.studentId || user.id,
        name: user.name,
        role: 'Student',
        mobile: user.mobile,
        actionName: 'MCQ Open',
        url: location.pathname
      });
    }catch(e){}
  }

  function scrollToQuestion(qid){
    document.querySelector(`#q-${cssEscape(qid)}`)?.scrollIntoView({behavior:'smooth', block:'start'});
  }

  function applySavedTheme(){
    const theme = localStorage.getItem('WTC_MCQ_THEME') || 'light';
    document.body.classList.toggle('dark-mode', theme === 'dark');
    if($('themeBtn')) $('themeBtn').textContent = theme === 'dark' ? '☀️' : '🌙';
  }

  function toggleTheme(){
    const dark = !document.body.classList.contains('dark-mode');
    document.body.classList.toggle('dark-mode', dark);
    localStorage.setItem('WTC_MCQ_THEME', dark ? 'dark' : 'light');
    if($('themeBtn')) $('themeBtn').textContent = dark ? '☀️' : '🌙';
  }

  function formatTime(sec){
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m ${s}s`;
  }

  function cssEscape(value){
    if(window.CSS && CSS.escape) return CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
