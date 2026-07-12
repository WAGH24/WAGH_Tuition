(function(){
  'use strict';

  /*
   * WAGH Tuition Classes — Static MCQ Engine v1.1
   * Backward-compatible modes:
   * 1) Single test: window.WTC_STATIC_MCQ.questions
   * 2) Multi test:  window.WTC_STATIC_MCQ.questionBank + tests
   */

  const data = window.WTC_STATIC_MCQ || {};
  const multiMode = Array.isArray(data.tests) && data.tests.length > 0;
  const optionLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

  let questions = [];
  let activeTest = null;
  let timerId = null;
  let cardObserver = null;

  const state = {
    startedAt: 0,
    submitted: false,
    answers: {},
    questionTimes: {},
    openedAt: {},
    visited: {}
  };

  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (m) => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;'
  }[m]));

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
      sessionStorage.setItem(
        'WTC_NEXT_AFTER_LOGIN',
        location.pathname + location.search + location.hash
      );
      location.href = loginPath();
      return null;
    }

    return user;
  }

  function normalizeQuestion(raw, index){
    const source = raw || {};
    const rawOptions = source.options !== undefined ? source.options : source.o;
    const options = {};

    if(Array.isArray(rawOptions)){
      rawOptions.forEach((value, optionIndex) => {
        if(optionLetters[optionIndex]) options[optionLetters[optionIndex]] = value;
      });
    } else if(rawOptions && typeof rawOptions === 'object') {
      Object.keys(rawOptions).forEach((key) => {
        options[String(key).toUpperCase()] = rawOptions[key];
      });
    }

    let correct = source.correct !== undefined ? source.correct : source.a;
    if(typeof correct === 'number') correct = optionLetters[correct] || '';
    correct = String(correct ?? '').toUpperCase();

    return {
      id: String(source.id || `Q${index + 1}`),
      topic: source.topic || 'General',
      difficulty: source.difficulty || 'Easy',
      marks: Number(source.marks || 1),
      question: source.question !== undefined ? source.question : source.q,
      options,
      correct,
      explanation: source.explanation !== undefined ? source.explanation : source.e,
      image: source.image || ''
    };
  }

  function normalizeTest(raw, index){
    const source = raw || {};
    return {
      testId: String(source.testId || source.id || `MCQ-TEST-${index + 1}`),
      testTitle: source.testTitle || source.title || `MCQ Test ${index + 1}`,
      testType: source.testType || source.type || 'Static MCQ Practice',
      topic: source.topic || '',
      instructions: source.instructions || data.instructions || '',
      questionLabel: source.questionLabel || '',
      questionIds: Array.isArray(source.questionIds) ? source.questionIds.map(String) : [],
      indices: Array.isArray(source.indices) ? source.indices : []
    };
  }

  function singleTestMeta(){
    return normalizeTest({
      testId: data.testId,
      testTitle: data.testTitle,
      testType: data.testType,
      topic: data.topic,
      instructions: data.instructions
    }, 0);
  }

  function activeMeta(){
    return activeTest || singleTestMeta();
  }

  function getQuestionBank(){
    const rawBank = multiMode ? data.questionBank : data.questions;
    return Array.isArray(rawBank)
      ? rawBank.map(normalizeQuestion)
      : [];
  }

  function questionsForTest(test){
    const bank = getQuestionBank();
    const byId = new Map(bank.map((q) => [q.id, q]));

    if(test.questionIds.length){
      return test.questionIds.map((id) => byId.get(String(id))).filter(Boolean);
    }

    if(test.indices.length){
      return test.indices.map((index) => bank[Number(index)]).filter(Boolean);
    }

    return bank;
  }

  function resetState(){
    state.startedAt = Date.now();
    state.submitted = false;
    state.answers = {};
    state.questionTimes = {};
    state.openedAt = {};
    state.visited = {};
  }

  function init(){
    const user = requireStudent();
    if(!user) return;

    bindActions();
    applySavedTheme();
    setStudentName(user);

    if(multiMode){
      prepareMultiTestMode(user);
    } else {
      activeTest = singleTestMeta();
      questions = questionsForTest(activeTest);
      startQuiz(user, false);
    }
  }

  function setStudentName(user){
    const id = user.studentId || user.id || '';
    if($('studentName')){
      $('studentName').textContent = `${user.name || 'Student'}${id ? ' • ' + id : ''}`;
    }
  }

  function bindActions(){
    $('submitBtn')?.addEventListener('click', submitTest);
    $('retryBtn')?.addEventListener('click', () => {
      if(multiMode) returnToTestSelector(false);
      else location.reload();
    });
    $('topBtn')?.addEventListener('click', () => scrollTo({top:0, behavior:'smooth'}));
    $('themeBtn')?.addEventListener('click', toggleTheme);
    $('reviewBtn')?.addEventListener('click', () => {
      const firstUnanswered = questions.find((q) => !state.answers[q.id]);
      const target = firstUnanswered || questions[0];
      if(target) scrollToQuestion(target.id);
    });
  }

  function prepareMultiTestMode(user){
    ensureChooseTestButton();
    renderTestSelector();
    showTestSelector();
    logPageOpen(user);
  }

  function ensureChooseTestButton(){
    if($('chooseTestBtn') || !$('themeBtn')) return;
    const button = document.createElement('button');
    button.id = 'chooseTestBtn';
    button.className = 'ghost-btn';
    button.type = 'button';
    button.textContent = '← Tests';
    button.addEventListener('click', () => returnToTestSelector(true));
    $('themeBtn').before(button);
  }

  function renderTestSelector(){
    let selector = $('mcqTestSelector');
    if(!selector){
      selector = document.createElement('section');
      selector.id = 'mcqTestSelector';
      selector.className = 'test-selector';
      const hero = document.querySelector('.hero-card');
      if(hero) hero.insertAdjacentElement('afterend', selector);
      else document.querySelector('.wtc-mcq-app')?.prepend(selector);
    }

    const tests = data.tests.map(normalizeTest);
    const topicTests = tests.filter((test) => isTopicTest(test));
    const fullTests = tests.filter((test) => !isTopicTest(test));
    const bankCount = getQuestionBank().length;

    selector.innerHTML = `
      <div class="selector-head">
        <div>
          <p class="eyebrow selector-eyebrow">Reusable Static MCQ Engine v1.1</p>
          <h2>Choose a test</h2>
          <p>${esc(data.selectorDescription || 'Practice topic-wise first, then attempt the full-length chapter tests.')}</p>
        </div>
        <div class="selector-summary">
          <b>${bankCount}</b>
          <span>Unique Questions</span>
        </div>
      </div>
      ${renderTestGroup(
        'Topic-wise Practice',
        'Each topic test uses its own question set without repetition.',
        topicTests
      )}
      ${renderTestGroup(
        'Full-Length Chapter Tests',
        'Balanced assessments covering the complete chapter.',
        fullTests
      )}
    `;

    selector.querySelectorAll('[data-start-test]').forEach((button) => {
      button.addEventListener('click', () => selectTest(button.dataset.startTest));
    });
  }

  function renderTestGroup(title, description, tests){
    if(!tests.length) return '';
    return `
      <section class="test-group">
        <div class="test-group-title">
          <h3>${esc(title)}</h3>
          <p>${esc(description)}</p>
        </div>
        <div class="mcq-test-grid">
          ${tests.map(renderTestCard).join('')}
        </div>
      </section>
    `;
  }

  function renderTestCard(test){
    const count = test.questionIds.length || test.indices.length || getQuestionBank().length;
    const label = isTopicTest(test) ? 'Topic Practice' : 'Chapter Assessment';
    return `
      <article class="mcq-test-card">
        <span class="test-kind">${esc(label)}</span>
        <h4>${esc(test.testTitle)}</h4>
        <p>${esc(test.topic || 'Complete Chapter')}</p>
        <div class="test-card-meta">
          <span>${count} Questions</span>
          ${test.questionLabel ? `<span>${esc(test.questionLabel)}</span>` : ''}
        </div>
        <button class="primary-btn test-start-btn" type="button" data-start-test="${esc(test.testId)}">
          Start Test
        </button>
      </article>
    `;
  }

  function isTopicTest(test){
    return String(test.testType || '').toUpperCase().includes('TOPIC');
  }

  function selectTest(testId){
    const tests = data.tests.map(normalizeTest);
    const selected = tests.find((test) => test.testId === String(testId));
    if(!selected) return;

    const user = getUser();
    if(!user) return;

    activeTest = selected;
    questions = questionsForTest(selected);

    if(!questions.length){
      showSelectorError(`No questions are connected to ${selected.testTitle}.`);
      return;
    }

    startQuiz(user, true);
  }

  function showSelectorError(message){
    const selector = $('mcqTestSelector');
    if(!selector) return;
    let error = selector.querySelector('.selector-error');
    if(!error){
      error = document.createElement('p');
      error.className = 'selector-error';
      selector.prepend(error);
    }
    error.textContent = message;
  }

  function startQuiz(user, fromSelector){
    resetState();
    clearRuntimeArtifacts();
    updateQuizHeader();
    setQuizVisibility(true);
    if(fromSelector) $('mcqTestSelector')?.classList.add('hidden');

    renderPalette();
    renderQuestions();
    updateDashboard();
    startTimer();
    logOpen(user);

    if(multiMode && $('retryBtn')) $('retryBtn').textContent = 'Choose Another Test';
    scrollTo({top:0, behavior:'smooth'});
  }

  function updateQuizHeader(){
    const meta = activeMeta();
    if($('testTitle')) $('testTitle').textContent = meta.testTitle || data.chapterName || 'MCQ Practice';
    if($('testMeta')){
      $('testMeta').textContent = [
        data.board,
        data.className,
        data.medium,
        data.subjectName,
        data.chapterName,
        meta.topic
      ].filter(Boolean).join(' • ');
    }
    if($('questionCount')) $('questionCount').textContent = questions.length;
    if(document.querySelector('.notice-card')){
      document.querySelector('.notice-card').textContent = meta.instructions || data.instructions ||
        'Select one option for each question. After submit, correct answers and explanations will open. Your result will be saved for progress report.';
    }
    const scoreLabel = document.querySelector('.hero-score small');
    if(scoreLabel) scoreLabel.textContent = 'Answered';
  }

  function clearRuntimeArtifacts(){
    stopTimer();
    if(cardObserver){
      cardObserver.disconnect();
      cardObserver = null;
    }
    if($('resultBox')){
      $('resultBox').classList.add('hidden');
      $('resultBox').innerHTML = '';
    }
    $('submitBtn')?.classList.remove('hidden');
    $('retryBtn')?.classList.add('hidden');
    if($('answeredCount')) $('answeredCount').textContent = '0';
    $('progressRing')?.style.setProperty('--deg', '0deg');
    if($('timer')) $('timer').textContent = '00:00';
  }

  function setQuizVisibility(visible){
    [
      document.querySelector('.sticky-dashboard'),
      document.querySelector('.notice-card'),
      document.querySelector('.layout-grid'),
      document.querySelector('.bottom-action-bar')
    ].forEach((element) => element?.classList.toggle('hidden', !visible));
  }

  function showTestSelector(){
    stopTimer();
    clearRuntimeArtifacts();
    setQuizVisibility(false);
    $('mcqTestSelector')?.classList.remove('hidden');

    const title = data.pageTitle || `${data.chapterName || 'Chapter'} MCQ Practice`;
    if($('testTitle')) $('testTitle').textContent = title;
    if($('testMeta')){
      $('testMeta').textContent = [data.board, data.className, data.medium, data.subjectName, data.chapterName]
        .filter(Boolean)
        .join(' • ');
    }

    const bankCount = getQuestionBank().length;
    if($('answeredCount')) $('answeredCount').textContent = bankCount;
    $('progressRing')?.style.setProperty('--deg', '360deg');
    const scoreLabel = document.querySelector('.hero-score small');
    if(scoreLabel) scoreLabel.textContent = 'Question Bank';
    scrollTo({top:0, behavior:'smooth'});
  }

  function returnToTestSelector(askBeforeLeaving){
    if(!multiMode) return;

    const hasAnswers = Object.keys(state.answers).length > 0;
    if(askBeforeLeaving && hasAnswers && !state.submitted){
      const leave = confirm('Leave this test? Your current answers will be cleared.');
      if(!leave) return;
    }

    activeTest = null;
    questions = [];
    showTestSelector();
  }

  function renderPalette(){
    const grid = $('paletteGrid');
    if(!grid) return;
    grid.innerHTML = questions.map((q, index) => `
      <button class="palette-dot" id="pal-${esc(q.id)}" data-qid="${esc(q.id)}" type="button">
        ${index + 1}
      </button>
    `).join('');
    grid.querySelectorAll('.palette-dot').forEach((button) => {
      button.addEventListener('click', () => scrollToQuestion(button.dataset.qid));
    });
  }

  function renderQuestions(){
    const list = $('questionList');
    if(!list) return;

    list.innerHTML = questions.map((q, index) => {
      const optionKeys = orderedOptionKeys(q.options);
      return `
        <article class="q-card" data-qid="${esc(q.id)}" id="q-${esc(q.id)}">
          <div class="q-top">
            <span class="q-no">Q${index + 1}</span>
            <span class="tag">${esc(q.topic || 'General')}</span>
            <span class="level level-${esc(String(q.difficulty || 'Easy').toLowerCase())}">
              ${esc(q.difficulty || 'Easy')}
            </span>
            <span class="marks">${esc(q.marks || 1)} Mark</span>
          </div>
          ${q.image ? `<img class="q-image" src="${esc(q.image)}" alt="Question image">` : ''}
          <p class="q-text">${esc(q.question)}</p>
          <div class="options" role="radiogroup" aria-label="Options for question ${index + 1}">
            ${optionKeys.map((key) => `
              <button class="option" type="button" data-qid="${esc(q.id)}" data-option="${esc(key)}">
                <span class="option-key">${esc(key)}</span>
                <span class="option-text">${esc(q.options[key])}</span>
              </button>
            `).join('')}
          </div>
          <div class="answer-line hidden"></div>
          <div class="explanation"><b>Explanation:</b> ${esc(q.explanation || 'Explanation will be added soon.')}</div>
        </article>
      `;
    }).join('');

    list.querySelectorAll('.option').forEach((button) => {
      button.addEventListener('click', () => selectOption(button.dataset.qid, button.dataset.option));
    });

    observeCards();
  }

  function orderedOptionKeys(options){
    const keys = Object.keys(options || {});
    return keys.sort((a, b) => {
      const ai = optionLetters.indexOf(a);
      const bi = optionLetters.indexOf(b);
      if(ai === -1 || bi === -1) return a.localeCompare(b);
      return ai - bi;
    });
  }

  function observeCards(){
    if(!('IntersectionObserver' in window)) return;
    if(cardObserver) cardObserver.disconnect();

    cardObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if(entry.isIntersecting){
          const qid = entry.target.dataset.qid;
          state.visited[qid] = true;
          state.openedAt[qid] = state.openedAt[qid] || Date.now();
          updatePalette();
        }
      });
    }, {threshold: 0.35});

    document.querySelectorAll('.q-card').forEach((card) => cardObserver.observe(card));
  }

  function selectOption(qid, option){
    if(state.submitted) return;
    state.answers[qid] = option;
    state.questionTimes[qid] = Math.max(
      1,
      Math.round((Date.now() - (state.openedAt[qid] || state.startedAt)) / 1000)
    );

    const card = document.querySelector(`#q-${cssEscape(qid)}`);
    card?.querySelectorAll('.option').forEach((item) => {
      item.classList.toggle('selected', item.dataset.option === option);
    });
    updateDashboard();
    updatePalette();
  }

  function updateDashboard(){
    const answered = Object.keys(state.answers).length;
    const total = questions.length || 1;
    if($('answeredCount')) $('answeredCount').textContent = answered;
    const deg = Math.round((answered / total) * 360);
    $('progressRing')?.style.setProperty('--deg', `${deg}deg`);
  }

  function updatePalette(){
    questions.forEach((q) => {
      const dot = $(`pal-${q.id}`);
      if(!dot) return;
      dot.classList.toggle('visited', !!state.visited[q.id]);
      dot.classList.toggle('answered', !!state.answers[q.id]);
    });
  }

  function startTimer(){
    stopTimer();
    updateTimer();
    timerId = window.setInterval(updateTimer, 1000);
  }

  function stopTimer(){
    if(timerId !== null){
      clearInterval(timerId);
      timerId = null;
    }
  }

  function updateTimer(){
    if(!state.startedAt || !$('timer')) return;
    const sec = Math.floor((Date.now() - state.startedAt) / 1000);
    const minutes = String(Math.floor(sec / 60)).padStart(2, '0');
    const seconds = String(sec % 60).padStart(2, '0');
    $('timer').textContent = `${minutes}:${seconds}`;
  }

  function calculate(){
    let score = 0;
    let totalMarks = 0;
    let earnedMarks = 0;

    const details = questions.map((q, index) => {
      const selected = state.answers[q.id] || '';
      const correct = q.correct;
      const marks = Number(q.marks || 1);
      const isCorrect = selected === correct;
      totalMarks += marks;
      if(isCorrect){
        score += 1;
        earnedMarks += marks;
      }
      return {
        questionNo: index + 1,
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
    return {
      score,
      total,
      percent,
      earnedMarks,
      totalMarks,
      details,
      totalTimeSec: Math.round((Date.now() - state.startedAt) / 1000)
    };
  }

  async function submitTest(){
    if(state.submitted || !questions.length) return;
    const unanswered = questions.filter((q) => !state.answers[q.id]).length;
    if(unanswered && !confirm(`${unanswered} question(s) are unanswered. Submit now?`)) return;

    state.submitted = true;
    stopTimer();
    const result = calculate();
    revealAnswers(result);
    showResult(result);
    await saveProgress(result);
  }

  function revealAnswers(result){
    questions.forEach((q) => {
      const card = document.querySelector(`#q-${cssEscape(q.id)}`);
      if(!card) return;
      card.classList.add('submitted');
      card.querySelectorAll('.option').forEach((option) => {
        const key = option.dataset.option;
        option.disabled = true;
        if(key === q.correct) option.classList.add('correct');
        if(key === state.answers[q.id] && key !== q.correct) option.classList.add('wrong');
      });

      const answerLine = card.querySelector('.answer-line');
      const selected = state.answers[q.id] || 'Not answered';
      answerLine?.classList.remove('hidden');
      if(answerLine){
        answerLine.innerHTML = `<b>Your answer:</b> ${esc(selected)} &nbsp; | &nbsp; <b>Correct answer:</b> ${esc(q.correct)}`;
      }
      card.querySelector('.explanation')?.classList.add('show');
    });

    result.details.forEach((detail) => {
      const dot = $(`pal-${detail.questionId}`);
      dot?.classList.add(detail.isCorrect ? 'pal-correct' : 'pal-wrong');
    });
  }

  function weakTopicsFor(result){
    return [...new Set(
      result.details
        .filter((detail) => !detail.isCorrect)
        .map((detail) => detail.topic)
        .filter(Boolean)
    )];
  }

  function showResult(result){
    const weakTopics = weakTopicsFor(result).slice(0, 4);
    const message = result.percent >= 80
      ? 'Excellent! Keep revising.'
      : result.percent >= 50
        ? 'Good attempt. Revise weak topics.'
        : 'Revise the chapter and retry.';

    if(!$('resultBox')) return;
    $('resultBox').classList.remove('hidden');
    $('resultBox').innerHTML = `
      <div class="result-header">
        <div>
          <p class="eyebrow">Result Report</p>
          <h2>${message}</h2>
        </div>
        <div class="result-percent">${result.percent}%</div>
      </div>
      <div class="result-grid">
        <div><span>Score</span><b>${result.score}/${result.total}</b></div>
        <div><span>Marks</span><b>${result.earnedMarks}/${result.totalMarks}</b></div>
        <div><span>Total Time</span><b>${formatTime(result.totalTimeSec)}</b></div>
        <div><span>Weak Topics</span><b>${weakTopics.length ? esc(weakTopics.join(', ')) : 'None'}</b></div>
      </div>
      <p id="saveStatus" class="save-status">Saving progress...</p>
    `;

    $('submitBtn')?.classList.add('hidden');
    $('retryBtn')?.classList.remove('hidden');
    $('resultBox').scrollIntoView({behavior:'smooth', block:'center'});
  }

  async function saveProgress(result){
    const user = getUser();
    const meta = activeMeta();
    const weakTopics = weakTopicsFor(result);
    const payload = {
      action: 'saveStaticMCQResult',
      studentId: user?.studentId || user?.id || '',
      name: user?.name || '',
      mobile: user?.mobile || '',
      board: data.board,
      className: data.className,
      medium: data.medium,
      subjectId: data.subjectId,
      subjectName: data.subjectName,
      chapterId: data.chapterId,
      chapterName: data.chapterName,
      testId: meta.testId,
      testTitle: meta.topic ? `${meta.testTitle}: ${meta.topic}` : meta.testTitle,
      testType: meta.testType || 'Static MCQ Practice',
      topic: meta.topic || '',
      score: result.score,
      total: result.total,
      percent: result.percent,
      earnedMarks: result.earnedMarks,
      totalMarks: result.totalMarks,
      totalTimeSec: result.totalTimeSec,
      weakTopics: weakTopics.join(', '),
      attemptDetails: JSON.stringify(result.details),
      page: location.pathname,
      deviceId:
        typeof WTC_AUTH !== 'undefined' && WTC_AUTH.deviceId
          ? WTC_AUTH.deviceId()
          : ''
    };

    try{
      if(typeof WTC_API === 'undefined' || typeof WTC_API.call !== 'function'){
        throw new Error('WTC_API is not available on this page.');
      }
      const response = await WTC_API.call(payload);
      $('saveStatus').textContent = response && (response.success || response.ok)
        ? '✅ Progress saved successfully.'
        : '⚠️ Result shown, but progress could not be saved.';
    } catch(error){
      console.warn(error);
      $('saveStatus').textContent = '⚠️ Result shown, but progress could not be saved.';
    }
  }

  async function logPageOpen(user){
    try{
      if(typeof WTC_API === 'undefined' || typeof WTC_API.logAccess !== 'function') return;
      await WTC_API.logAccess({
        userId: user.studentId || user.id,
        name: user.name,
        role: 'Student',
        mobile: user.mobile,
        actionName: 'MCQ Chapter Open',
        url: location.pathname
      });
    } catch(e){}
  }

  async function logOpen(user){
    try{
      if(typeof WTC_API === 'undefined' || typeof WTC_API.logAccess !== 'function') return;
      const meta = activeMeta();
      await WTC_API.logAccess({
        userId: user.studentId || user.id,
        name: user.name,
        role: 'Student',
        mobile: user.mobile,
        actionName: 'MCQ Open',
        url: location.pathname,
        testId: meta.testId,
        testTitle: meta.testTitle
      });
    } catch(e){}
  }

  function scrollToQuestion(qid){
    document.querySelector(`#q-${cssEscape(qid)}`)?.scrollIntoView({
      behavior:'smooth',
      block:'start'
    });
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
    const minutes = Math.floor(sec / 60);
    const seconds = sec % 60;
    return `${minutes}m ${seconds}s`;
  }

  function cssEscape(value){
    if(window.CSS && CSS.escape) return CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
