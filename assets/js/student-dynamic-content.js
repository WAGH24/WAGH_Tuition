/* WAGH Tuition Classes — Dynamic Student Content & MCQ Test Engine v2.3.2-runtime-reliability */
window.WTC_DYNAMIC_CONTENT = (() => {
  const state = {
    context:null, user:null, mcqSetId:'', questions:[], questionMap:{}, tests:[],
    progressReport:null, activeTest:null, activeQuestions:[], answers:{},
    questionTimes:{}, currentIndex:0, startedAt:0, enteredAt:0,
    remainingSec:0, timerId:null, submitting:false
  };
  let unloadBound = false;
  let confirmState = null;
  let mathJaxPromise = null;

  function rememberRoute(value) {
    if (window.StudentApp?.setDynamicRoute) window.StudentApp.setDynamicRoute(value || {});
  }

  async function openFeature(feature) {
    if (!feature || feature.type !== 'dynamic') return false;
    setFocusMode(false);
    state.context = feature;
    state.user = feature.user || (window.WTC_AUTH && WTC_AUTH.getUser ? WTC_AUTH.getUser() : null) || {};
    rememberRoute({ view:feature.action === 'mcq' ? 'hub' : 'content', action:feature.action || '', contentId:feature.contentId || '' });
    if (feature.action === 'lesson') return renderLesson(feature.contentId);
    if (feature.action === 'solutions') return renderSolutions(feature.contentId, contextChapterId(feature));
    if (feature.action === 'mcq') return openMCQEngine(feature.contentId);
    if (feature.action === 'worksheet' || feature.action === 'answerWriting') return renderWorksheet(feature.contentId);
    return false;
  }


  function contextChapterId(feature) {
    return String(
      feature?.chapterId ||
      feature?.chapter?.chapterId ||
      feature?.chapter?.id ||
      state.context?.chapterId ||
      state.context?.chapter?.chapterId ||
      state.context?.chapter?.id ||
      ''
    ).trim();
  }

  function progressProfile() {
    return {
      studentId:studentId(),
      board:state.user?.board || '',
      className:state.user?.className || state.user?.class || '',
      medium:state.user?.medium || ''
    };
  }

  function currentAttemptId() {
    const safeTest = String(state.activeTest?.testId || 'TEST').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 48);
    return `MCQATT${Number(state.startedAt || Date.now())}_${safeTest}_${studentId().slice(-12)}`;
  }

  async function openMCQEngine(mcqSetId) {
    renderContentShell('MCQ Test', loadingCard('Preparing your personalized tests…'));
    const response = await WTC_ASSESSMENT_API.getMCQ(mcqSetId);
    if (!response || response.success === false) throw new Error((response && response.message) || 'MCQ content could not be loaded.');

    state.mcqSetId = mcqSetId;
    state.questions = response.mcq || [];
    state.tests = response.tests || [];
    state.questionMap = {};
    state.questions.forEach(question => {
      [question.mcqId, question.sourceQuestionId].filter(Boolean).forEach(id => state.questionMap[String(id)] = question);
    });
    if (!state.tests.length && state.questions.length) {
      state.tests = [{
        testId:mcqSetId + '-ALL', testTitle:'Complete Chapter Test', testType:'FULL_LENGTH',
        topic:'Complete Chapter', questionCount:state.questions.length,
        questionIds:state.questions.map(question => question.mcqId)
      }];
    }

    try {
      state.progressReport = await WTC_API.getMCQProgressReport(progressProfile());
    } catch (error) {
      state.progressReport = { success:false, testPerformance:[] };
    }
    bindUnload();
    renderTestHub();
    return true;
  }

  function renderTestHub() {
    clearTimer();
    setFocusMode(false);
    state.activeTest = null;
    rememberRoute({ view:'hub', action:'mcq', contentId:state.mcqSetId || state.context?.contentId || '', testId:null, result:null });
    const name = esc((state.user && state.user.name) || 'Student');
    const currentPerformance = state.tests.map(test => testPerformance(test.testId)).filter(Boolean);
    const completed = currentPerformance.filter(item => Number(item.attempts || 0) > 0).length;
    const best = currentPerformance.reduce((highest, item) => Math.max(highest, Number(item.bestPercent || 0)), 0);
    const cards = state.tests.map((test, index) => testCard(test, index)).join('');
    const html = `
      <div class="wtc-mcq-hub">
        <section class="mcq-welcome">
          <div><span class="mcq-kicker">PERSONALIZED PRACTICE</span><h2>Ready, ${name}?</h2>
          <p>Choose a topic test for focused practice or a full-length test for chapter mastery.</p></div>
          <div class="mcq-mini-stats"><span><b>${state.tests.length}</b> tests</span><span><b>${completed}</b> completed</span><span><b>${best}%</b> best</span></div>
        </section>
        <div class="mcq-profile-line">
          ${profileChip('🎓', state.user.className || state.user.class || 'Class')}
          ${profileChip('📘', state.context?.subject?.subjectName || state.context?.subject?.name || 'Subject')}
          ${profileChip('📖', state.context?.chapter?.chapterName || 'Chapter')}
        </div>
        <div class="mcq-test-grid">${cards || emptyCard('No published test definitions were found.')}</div>
      </div>`;
    renderContentShell('MCQ Test', html);
  }

  function testCard(test, index) {
    const performance = testPerformance(test.testId);
    const resume = loadResume(test.testId);
    const count = Number(test.questionCount || (test.questionIds || []).length || 0);
    const full = String(test.testType || '').toUpperCase().includes('FULL');
    const best = performance ? Number(performance.bestPercent || 0) : 0;
    const attempts = performance ? Number(performance.attempts || 0) : 0;
    return `<article class="mcq-test-card ${full ? 'is-full' : ''}">
      <div class="mcq-test-top"><span class="mcq-test-number">${full ? '🏆' : String(index + 1).padStart(2, '0')}</span><span class="mcq-type">${full ? 'FULL LENGTH' : 'TOPIC TEST'}</span></div>
      <h3>${esc(test.testTitle || `Test ${index + 1}`)}</h3>
      <p>${esc(test.topic || test.questionLabel || 'Chapter practice')}</p>
      <div class="mcq-test-meta"><span>❓ ${count} questions</span><span>⏱ ${count} min</span><span>🎯 ${best}% best</span></div>
      <div class="mcq-test-progress"><i style="width:${best}%"></i></div>
      <div class="mcq-test-footer"><small>${attempts ? `${attempts} attempt${attempts === 1 ? '' : 's'}` : 'Not attempted yet'}</small>
      <div class="mcq-card-actions">${resume ? `<button class="mcq-btn secondary" onclick="WTC_DYNAMIC_CONTENT.startTest('${attr(test.testId)}',true)">Resume</button>` : ''}<button class="mcq-btn" onclick="WTC_DYNAMIC_CONTENT.startTest('${attr(test.testId)}',false)">${attempts ? 'Try again' : 'Start test'}</button></div></div>
    </article>`;
  }

  async function startTest(testId, resume) {
    const test = state.tests.find(item => String(item.testId) === String(testId));
    if (!test) return;
    const saved = loadResume(testId);
    if (saved && !resume) {
      const savedAnswers = Object.values(saved.answers || {}).filter(Boolean).length;
      const startAgain = await confirmAction({
        icon:'↻', eyebrow:'SAVED TEST FOUND', title:'Start this test again?',
        message:'Starting again will remove the saved answers and remaining time for this test.',
        stats:[
          { label:'Saved answers', value:String(savedAnswers) },
          { label:'Time remaining', value:formatDuration(saved.remainingSec) }
        ],
        confirmLabel:'Start again', cancelLabel:'Keep saved progress', tone:'warning'
      });
      if (!startAgain) return;
    }

    const ids = Array.isArray(test.questionIds) ? test.questionIds : [];
    const questions = ids.length ? ids.map(id => state.questionMap[String(id)]).filter(Boolean) : state.questions.slice();
    if (!questions.length) return toast('No published questions were found for this test.', 'error');

    state.activeTest = test;
    state.activeQuestions = questions;
    state.answers = resume && saved ? saved.answers || {} : {};
    state.questionTimes = resume && saved ? saved.questionTimes || {} : {};
    state.currentIndex = resume && saved ? Math.min(Number(saved.currentIndex || 0), questions.length - 1) : 0;
    state.startedAt = resume && saved ? Number(saved.startedAt || Date.now()) : Date.now();
    state.remainingSec = resume && saved
      ? Number(saved.remainingSec || questions.length * 60)
      : Number(test.timeLimitSec || test.durationSeconds || questions.length * 60);
    state.enteredAt = Date.now();
    state.submitting = false;
    rememberRoute({ view:'active-test', action:'mcq', contentId:state.mcqSetId, testId:state.activeTest.testId, result:null });
    setFocusMode(true);
    startTimer();
    renderQuestion();
  }

  function renderQuestion() {
    const question = state.activeQuestions[state.currentIndex];
    if (!question) return;
    const selected = state.answers[question.mcqId] || '';
    rememberRoute({ view:'active-test', action:'mcq', contentId:state.mcqSetId, testId:state.activeTest?.testId || '', currentIndex:state.currentIndex, result:null });
    const answered = Object.keys(state.answers).filter(key => state.answers[key]).length;
    const percent = Math.round((answered / state.activeQuestions.length) * 100);
    const options = ['A','B','C','D'].map(letter => {
      const text = question['option' + letter] || '';
      return `<button class="mcq-option ${selected === letter ? 'selected' : ''}" onclick="WTC_DYNAMIC_CONTENT.selectOption('${letter}')"><b>${letter}</b><span>${esc(text)}</span><i>✓</i></button>`;
    }).join('');
    const palette = state.activeQuestions.map((item, index) => {
      const isAnswered = Boolean(state.answers[item.mcqId]);
      return `<button class="mcq-palette-item ${index === state.currentIndex ? 'current' : ''} ${isAnswered ? 'answered' : ''}" onclick="WTC_DYNAMIC_CONTENT.goTo(${index})">${index + 1}</button>`;
    }).join('');
    const html = `<div class="wtc-test-stage">
      <header class="mcq-stage-head"><div><button class="mcq-text-btn" onclick="WTC_DYNAMIC_CONTENT.backToTests()">← Exit test</button><span class="mcq-kicker">${esc(state.activeTest.testType || 'MCQ TEST')}</span><h2>${esc(state.activeTest.testTitle || 'MCQ Test')}</h2></div>
      <div class="mcq-clock"><small>TIME LEFT</small><b id="mcqTimer">${formatDuration(state.remainingSec)}</b></div></header>
      <div class="mcq-answer-progress"><div><b>${answered}/${state.activeQuestions.length}</b> answered</div><span><i style="width:${percent}%"></i></span></div>
      <div class="mcq-stage-layout">
        <main class="mcq-question-card"><div class="mcq-question-label"><span>Question ${state.currentIndex + 1} of ${state.activeQuestions.length}</span><em>${esc(question.topic || 'General')} · ${esc(question.difficulty || 'Medium')}</em></div>
          <h3>${esc(question.questionText)}</h3><div class="mcq-options">${options}</div>
          <div class="mcq-question-actions"><button class="mcq-btn secondary" onclick="WTC_DYNAMIC_CONTENT.goTo(${state.currentIndex - 1})" ${state.currentIndex === 0 ? 'disabled' : ''}>← Previous</button>
          <button class="mcq-text-btn danger-text" onclick="WTC_DYNAMIC_CONTENT.clearAnswer()">Clear answer</button>
          ${state.currentIndex < state.activeQuestions.length - 1
            ? `<button class="mcq-btn" onclick="WTC_DYNAMIC_CONTENT.goTo(${state.currentIndex + 1})">Next →</button>`
            : `<button class="mcq-btn success" onclick="WTC_DYNAMIC_CONTENT.submitTest(false)">Submit test</button>`}</div>
        </main>
        <aside class="mcq-palette"><h4>Question palette</h4><div>${palette}</div><p><span class="dot answered"></span>Answered <span class="dot current"></span>Current</p><button class="mcq-btn success wide" onclick="WTC_DYNAMIC_CONTENT.submitTest(false)">Submit Test</button></aside>
      </div></div>`;
    renderContentShell('MCQ Test', html, true);
    updateTimerNode();
  }

  function selectOption(letter) {
    const question = state.activeQuestions[state.currentIndex];
    if (!question) return;
    state.answers[question.mcqId] = letter;
    saveResume();
    renderQuestion();
  }

  function clearAnswer() {
    const question = state.activeQuestions[state.currentIndex];
    if (!question) return;
    delete state.answers[question.mcqId];
    saveResume();
    renderQuestion();
  }

  function goTo(index) {
    if (index < 0 || index >= state.activeQuestions.length) return;
    syncQuestionTime();
    state.currentIndex = index;
    state.enteredAt = Date.now();
    saveResume();
    renderQuestion();
  }

  async function submitTest(autoSubmit) {
    if (state.submitting || !state.activeTest) return;
    const unanswered = state.activeQuestions.filter(question => !state.answers[question.mcqId]).length;
    const totalQuestions = state.activeQuestions.length;
    const answered = totalQuestions - unanswered;
    if (autoSubmit) {
      closeConfirmDialog(false);
    } else {
      const noneAnswered = unanswered === totalQuestions;
      const confirmed = await confirmAction({
        icon:unanswered ? '📝' : '✓', eyebrow:'SUBMIT TEST',
        title:noneAnswered ? 'No answers selected yet' : (unanswered ? 'Some questions need attention' : 'Ready to submit?'),
        message:noneAnswered
          ? `You have not answered any questions. If you submit now, all ${totalQuestions} will be marked unanswered.`
          : (unanswered
            ? `${unanswered} question${unanswered === 1 ? ' is' : 's are'} still unanswered. You can continue the test or submit them unanswered.`
            : 'Every question has an answer. You can submit now or continue reviewing your choices.'),
        stats:[
          { label:'Answered', value:`${answered}/${totalQuestions}`, accent:answered === totalQuestions },
          { label:'Unanswered', value:String(unanswered), warning:unanswered > 0 },
          { label:'Time left', value:formatDuration(state.remainingSec) }
        ],
        confirmLabel:unanswered ? 'Submit anyway' : 'Submit test',
        cancelLabel:unanswered ? 'Continue answering' : 'Review answers',
        tone:unanswered ? 'warning' : 'success'
      });
      if (!confirmed || state.submitting || !state.activeTest) return;
    }
    state.submitting = true;
    syncQuestionTime();
    clearTimer();

    const totalTimeSec = Math.max(1, Math.round((Date.now() - state.startedAt) / 1000));
    const details = state.activeQuestions.map((question, index) => {
      const selected = state.answers[question.mcqId] || '';
      return {
        questionNo:index + 1, questionId:question.mcqId,
        questionText:question.questionText, topic:question.topic || 'General',
        difficulty:question.difficulty || 'Medium', selectedOption:selected,
        correctOption:String(question.correctOption || '').toUpperCase(),
        isCorrect:Boolean(selected && selected === String(question.correctOption || '').toUpperCase()),
        marks:Number(question.marks || 1), timeTakenSec:Number(state.questionTimes[question.mcqId] || 0),
        explanationViewed:true
      };
    });
    const correct = details.filter(item => item.isCorrect).length;
    const total = details.length;
    const percent = total ? Math.round((correct / total) * 100) : 0;
    const subject = state.context.subject || {};
    const chapter = state.context.chapter || {};
    renderContentShell('MCQ Test', loadingCard('Saving your result and updating your personal report…'), true);

    let saveResult = { success:false, message:'Result could not be saved.' };
    try {
      saveResult = await WTC_API.saveMCQResult({
        attemptId:currentAttemptId(),
        studentId:studentId(), name:state.user.name || '', mobile:state.user.mobile || '',
        board:state.user.board || '', className:state.user.className || state.user.class || '',
        medium:state.user.medium || '', subjectId:subject.subjectId || subject.id || '',
        subjectName:subject.subjectName || subject.name || '',
        chapterId:chapter.chapterId || state.activeQuestions[0]?.chapterId || '',
        chapterName:chapter.chapterName || chapter.name || '',
        testId:state.activeTest.testId, testTitle:state.activeTest.testTitle,
        testType:state.activeTest.testType || 'Dynamic MCQ', score:correct, total:total,
        percent:percent, earnedMarks:correct, totalMarks:total,
        unansweredCount:details.filter(item => !item.selectedOption).length,
        totalTimeSec:totalTimeSec, page:location.pathname, sourceType:'Dynamic MCQ v2.2',
        attemptDetails:JSON.stringify(details)
      });
      localStorage.removeItem(resumeKey(state.activeTest.testId));
      try { state.progressReport = await WTC_API.getMCQProgressReport(progressProfile()); } catch (error) {}
      document.dispatchEvent(new CustomEvent('wtc:progress-updated'));
    } catch (error) {
      saveResult = { success:false, message:error.message || 'Result could not be saved.' };
    }
    renderResult(details, percent, totalTimeSec, saveResult, autoSubmit);
    state.submitting = false;
  }

  function renderResult(details, percent, totalTimeSec, saveResult, autoSubmit) {
    setFocusMode(false);
    rememberRoute({
      view:'result', action:'mcq', contentId:state.mcqSetId,
      testId:state.activeTest?.testId || '',
      result:{
        details:details || [], percent:Number(percent || 0), totalTimeSec:Number(totalTimeSec || 0),
        saveResult:{ success:Boolean(saveResult?.success), message:saveResult?.message || '', personalizedMessage:saveResult?.personalizedMessage || '' },
        autoSubmit:Boolean(autoSubmit)
      }
    });
    const correct = details.filter(item => item.isCorrect).length;
    const unanswered = details.filter(item => !item.selectedOption).length;
    const wrong = details.length - correct - unanswered;
    const message = saveResult.personalizedMessage || personalMessage(percent);
    const review = details.map((detail, index) => {
      const question = state.activeQuestions[index];
      const cls = detail.isCorrect ? 'correct' : (!detail.selectedOption ? 'unanswered' : 'wrong');
      return `<details class="mcq-review ${cls}"><summary><span>${detail.isCorrect ? '✓' : (!detail.selectedOption ? '–' : '×')}</span><div><small>Question ${index + 1} · ${esc(detail.topic)}</small><b>${esc(detail.questionText)}</b></div><em>${detail.isCorrect ? 'Correct' : (!detail.selectedOption ? 'Unanswered' : 'Review')}</em></summary>
        <div class="mcq-review-body"><p><b>Your answer:</b> ${detail.selectedOption ? `${detail.selectedOption}. ${esc(question['option' + detail.selectedOption] || '')}` : 'Not answered'}</p>
        <p><b>Correct answer:</b> ${esc(detail.correctOption)}. ${esc(question['option' + detail.correctOption] || '')}</p>
        <div class="mcq-explanation"><b>Explanation</b><p>${esc(question.explanation || 'Review this concept in your chapter notes.')}</p></div></div></details>`;
    }).join('');
    const html = `<div class="wtc-result-page">
      <section class="mcq-result-hero"><div class="result-score" style="--score:${percent}"><b>${percent}%</b><span>${correct}/${details.length}</span></div>
      <div><span class="mcq-kicker">${autoSubmit ? 'TIME COMPLETED' : 'TEST COMPLETED'}</span><h2>${esc(state.activeTest.testTitle)}</h2><p>${esc(message)}</p>
      <div class="result-pills"><span>✅ ${correct} correct</span><span>❌ ${wrong} wrong</span><span>➖ ${unanswered} unanswered</span><span>⏱ ${formatDuration(totalTimeSec)}</span></div></div></section>
      <div class="save-status ${saveResult.success ? 'saved' : 'failed'}">${saveResult.success ? '✓ Result saved and Progress dashboard updated.' : '⚠ ' + esc(saveResult.message || 'Result was not saved.')}</div>
      <div class="result-actions"><button class="mcq-btn secondary" onclick="WTC_DYNAMIC_CONTENT.backToTests()">← All tests</button><button class="mcq-btn" onclick="WTC_DYNAMIC_CONTENT.startTest('${attr(state.activeTest.testId)}',false)">Retake test</button></div>
      <section class="mcq-review-list"><div class="review-heading"><div><span class="mcq-kicker">PERSONAL REVIEW</span><h3>Answers and explanations</h3></div><span>${details.length} questions</span></div>${review}</section>
    </div>`;
    renderContentShell('Test Result', html, true);
  }

  function backToTests() {
    syncQuestionTime();
    if (state.activeTest && !state.submitting) saveResume();
    setFocusMode(false);
    renderTestHub();
  }

  function confirmAction(options={}) {
    closeConfirmDialog(false);
    document.querySelectorAll('.mcq-confirm-backdrop').forEach(node => node.remove());
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      const stats = (options.stats || []).map(item => `<div class="mcq-confirm-stat ${item.accent ? 'accent' : ''} ${item.warning ? 'warning' : ''}"><small>${esc(item.label)}</small><b>${esc(item.value)}</b></div>`).join('');
      overlay.className = 'mcq-confirm-backdrop';
      overlay.innerHTML = `<section class="mcq-confirm-dialog ${esc(options.tone || '')}" role="dialog" aria-modal="true" aria-labelledby="mcqConfirmTitle">
        <div class="mcq-confirm-icon" aria-hidden="true">${esc(options.icon || '?')}</div>
        <span class="mcq-kicker">${esc(options.eyebrow || 'PLEASE CONFIRM')}</span>
        <h2 id="mcqConfirmTitle">${esc(options.title || 'Are you sure?')}</h2>
        <p>${esc(options.message || '')}</p>
        ${stats ? `<div class="mcq-confirm-stats">${stats}</div>` : ''}
        <div class="mcq-confirm-actions">
          <button type="button" class="mcq-btn secondary" data-dialog-cancel>${esc(options.cancelLabel || 'Cancel')}</button>
          <button type="button" class="mcq-btn ${options.tone === 'success' ? 'success' : ''}" data-dialog-confirm>${esc(options.confirmLabel || 'Confirm')}</button>
        </div>
      </section>`;

      const previousFocus = document.activeElement;
      const finish = value => {
        if (!confirmState || confirmState.overlay !== overlay) return;
        confirmState = null;
        document.removeEventListener('keydown', onKeydown);
        document.body.classList.remove('mcq-dialog-open');
        overlay.classList.remove('visible');
        window.setTimeout(() => overlay.remove(), 160);
        if (previousFocus && previousFocus.focus) previousFocus.focus();
        resolve(Boolean(value));
      };
      const onKeydown = event => {
        if (event.key === 'Escape') finish(false);
      };

      confirmState = { overlay, finish };
      overlay.querySelector('[data-dialog-cancel]').addEventListener('click', () => finish(false));
      overlay.querySelector('[data-dialog-confirm]').addEventListener('click', () => finish(true));
      overlay.addEventListener('click', event => { if (event.target === overlay) finish(false); });
      document.addEventListener('keydown', onKeydown);
      document.body.classList.add('mcq-dialog-open');
      document.body.appendChild(overlay);
      window.requestAnimationFrame(() => {
        overlay.classList.add('visible');
        overlay.querySelector('[data-dialog-cancel]').focus();
      });
    });
  }

  function closeConfirmDialog(value=false) {
    if (confirmState && confirmState.finish) confirmState.finish(value);
  }

  function startTimer() {
    clearTimer();
    state.timerId = window.setInterval(() => {
      state.remainingSec = Math.max(0, state.remainingSec - 1);
      updateTimerNode();
      if (state.remainingSec === 0) submitTest(true);
      else if (state.remainingSec % 10 === 0) saveResume();
    }, 1000);
  }

  function clearTimer() {
    if (state.timerId) window.clearInterval(state.timerId);
    state.timerId = null;
  }

  function updateTimerNode() {
    const node = document.getElementById('mcqTimer');
    if (!node) return;
    node.textContent = formatDuration(state.remainingSec);
    node.closest('.mcq-clock')?.classList.toggle('urgent', state.remainingSec <= 60);
  }

  function syncQuestionTime() {
    const question = state.activeQuestions[state.currentIndex];
    if (!question || !state.enteredAt) return;
    const elapsed = Math.max(0, Math.round((Date.now() - state.enteredAt) / 1000));
    state.questionTimes[question.mcqId] = Number(state.questionTimes[question.mcqId] || 0) + elapsed;
    state.enteredAt = Date.now();
  }

  function saveResume() {
    if (!state.activeTest || state.submitting) return;
    localStorage.setItem(resumeKey(state.activeTest.testId), JSON.stringify({
      testId:state.activeTest.testId, answers:state.answers, questionTimes:state.questionTimes,
      currentIndex:state.currentIndex, startedAt:state.startedAt,
      remainingSec:state.remainingSec, savedAt:Date.now()
    }));
  }

  function loadResume(testId) {
    try { return JSON.parse(localStorage.getItem(resumeKey(testId)) || 'null'); }
    catch (error) { return null; }
  }

  function resumeKey(testId) { return `wtc:dynamic-mcq:${studentId()}:${testId}`; }
  function studentId() { return String(state.user?.studentId || state.user?.id || 'guest'); }
  function testPerformance(testId) { return (state.progressReport?.testPerformance || []).find(item => String(item.testId) === String(testId)); }
  function profileChip(icon, text) { return `<span>${icon} ${esc(text)}</span>`; }
  function personalMessage(percent) {
    if (percent >= 90) return 'Outstanding mastery! Keep your accuracy strong.';
    if (percent >= 75) return 'Strong work. Review the missed questions and aim for mastery.';
    if (percent >= 50) return 'Good progress. Revise the focus topics before retrying.';
    return 'Keep practising. Review each explanation and improve one concept at a time.';
  }
  function formatDuration(seconds) { const value = Math.max(0, Number(seconds || 0)); return `${String(Math.floor(value / 60)).padStart(2,'0')}:${String(value % 60).padStart(2,'0')}`; }
  function loadingCard(message) { return `<div class="mcq-loading"><span></span><h3>${esc(message)}</h3></div>`; }
  function emptyCard(message) { return `<div class="mcq-empty"><span>📝</span><h3>${esc(message)}</h3></div>`; }
  function toast(message, type) {
    if (window.WTC_UI?.toast) return WTC_UI.toast(message, type);
    const node = document.createElement('div');
    node.className = `mcq-inline-toast ${type || 'info'}`;
    node.setAttribute('role', type === 'error' ? 'alert' : 'status');
    node.textContent = message;
    document.body.appendChild(node);
    window.requestAnimationFrame(() => node.classList.add('visible'));
    window.setTimeout(() => {
      node.classList.remove('visible');
      window.setTimeout(() => node.remove(), 180);
    }, 3600);
  }

  async function renderLesson(lessonId) {
    const response = await WTC_ASSESSMENT_API.getLesson(lessonId);
    renderContentShell('Lesson', response.lesson ? response.lesson.formattedHTML : emptyCard('Lesson not published yet.'));
  }
  async function renderSolutions(solutionSetId, chapterId) {
    const response = await WTC_ASSESSMENT_API.getSolutions(solutionSetId, chapterId);
    const inside = response.solutions?.insideChapter || [], end = response.solutions?.endExercise || [];
    const total = inside.length + end.length;
    if (!total) {
      throw new Error('Dynamic solutions are not published for this exact chapter. Open the available static Solution feature instead.');
    }
    renderContentShell('Solutions', `<div class="solution-page"><h1>Solutions</h1><section><h2>Inside Chapter Questions</h2>${inside.length ? inside.map(solutionCard).join('') : '<p>No inside chapter solutions published.</p>'}</section><section><h2>End Exercise Questions</h2>${end.length ? end.map(solutionCard).join('') : '<p>No end exercise solutions published.</p>'}</section></div>`);
  }
  async function renderWorksheet(worksheetSetId) {
    const response = await WTC_ASSESSMENT_API.getWorksheet(worksheetSetId), rows = response.worksheet || [];
    renderContentShell('Worksheet', `<div class="worksheet-page"><h1>Worksheet</h1>${rows.map((q,i)=>`<div class="content-card"><h3>${i+1}. ${esc(q.questionText)}</h3><p><b>Type:</b> ${esc(q.questionType)} · <b>Marks:</b> ${esc(q.marks)}</p><details><summary>Answer Key</summary>${q.answerKeyHTML || ''}</details></div>`).join('') || '<p>No worksheet published yet.</p>'}</div>`);
  }

  function renderContentShell(title, html, compact) {
    let section = document.getElementById('dynamicContentSection');
    if (!section) {
      section = document.createElement('section'); section.id = 'dynamicContentSection'; section.className = 'page-section';
      document.querySelector('.main-area').appendChild(section);
    }
    clearTypeset(section);
    const language = detectContentLanguage(`${title} ${stripHTML(html)}`);
    section.innerHTML = `<div class="section-head dynamic-section-head ${compact ? 'compact' : ''}"><div><h2>${esc(title)}</h2><p class="muted">Personalized content from WTC AI Content Engine.</p></div><button class="btn outline" onclick="WTC_DYNAMIC_CONTENT.exitToFeatures()">← Features</button></div><div class="student-content-render" lang="${language}" data-content-lang="${language}">${html}</div>`;
    StudentApp.show('dynamicContentSection');
    bindSolutionAccordions(section);
    typesetContent(section);
    window.scrollTo({ top:0, behavior:'smooth' });
  }

  function setFocusMode(active) { document.body.classList.toggle('mcq-focus-mode', Boolean(active)); }
  function detectContentLanguage(text) { return /[\u0A80-\u0AFF]/.test(String(text || '')) ? 'gu' : 'en'; }
  function stripHTML(html) {
    const holder = document.createElement('div');
    holder.innerHTML = String(html || '');
    return holder.textContent || holder.innerText || '';
  }
  function clearTypeset(node) {
    try { if (window.MathJax?.typesetClear) window.MathJax.typesetClear([node]); }
    catch (error) { console.warn('MathJax cleanup skipped:', error.message); }
  }
  function ensureMathJax() {
    if (window.MathJax?.typesetPromise) return Promise.resolve(window.MathJax);
    if (mathJaxPromise) return mathJaxPromise;
    window.MathJax = window.MathJax || {
      loader:{ load:['[tex]/mhchem'] },
      tex:{ packages:{ '[+]':['mhchem'] }, inlineMath:[['\\(','\\)']], displayMath:[['\\[','\\]']], processEscapes:true },
      options:{ skipHtmlTags:['script','noscript','style','textarea','pre','code'] }
    };
    mathJaxPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-mml-chtml.js';
      script.async = true;
      script.onload = () => resolve(window.MathJax);
      script.onerror = () => reject(new Error('MathJax could not be loaded.'));
      document.head.appendChild(script);
    }).catch(error => {
      mathJaxPromise = null;
      console.warn(error.message);
      return null;
    });
    return mathJaxPromise;
  }
  function typesetContent(node) {
    ensureMathJax().then(() => {
      const run = () => window.MathJax?.typesetPromise
        ? window.MathJax.typesetPromise([node]).catch(error => console.warn('MathJax typesetting skipped:', error.message))
        : Promise.resolve();
      if (window.MathJax?.startup?.promise) return window.MathJax.startup.promise.then(run);
      return run();
    }).catch(error => console.warn('MathJax startup skipped:', error.message));
  }
  function bindSolutionAccordions(section) {
    section.querySelectorAll('.solution-page details').forEach(details => {
      details.addEventListener('toggle', () => {
        if (!details.open) return;
        section.querySelectorAll('.solution-page details[open]').forEach(other => {
          if (other !== details) other.open = false;
        });
      });
    });
  }
  async function restoreRefreshState(route={}) {
    if (route.view === 'active-test' && route.testId) {
      if (loadResume(route.testId)) {
        await startTest(route.testId, true);
        return true;
      }
      renderTestHub();
      toast('Your saved test attempt was not available, so the test list was restored.', 'error');
      return false;
    }

    if (route.view === 'result' && route.testId && route.result) {
      const test = state.tests.find(item => String(item.testId) === String(route.testId));
      if (!test) return false;
      const ids = Array.isArray(test.questionIds) ? test.questionIds : [];
      state.activeTest = test;
      state.activeQuestions = ids.length ? ids.map(id => state.questionMap[String(id)]).filter(Boolean) : state.questions.slice();
      renderResult(
        Array.isArray(route.result.details) ? route.result.details : [],
        Number(route.result.percent || 0),
        Number(route.result.totalTimeSec || 0),
        route.result.saveResult || { success:true },
        Boolean(route.result.autoSubmit)
      );
      return true;
    }
    return true;
  }
  function exitToFeatures() { closeConfirmDialog(false); clearTimer(); setFocusMode(false); if (state.activeTest) saveResume(); StudentApp.show('featuresSection'); }
  function solutionCard(item) {
    return `<details class="content-card"><summary class="solution-question-summary"><span class="solution-question-title">${esc(item.questionGroup)} ${esc(item.questionNumber)}</span>${formatSolutionQuestion(item.questionText)}</summary><div class="solution-answer-body">${item.solutionHTML || esc(item.stepByStepSolution || '')}</div></details>`;
  }
  function formatSolutionQuestion(value) {
    const text = String(value || '').trim();
    if (!text) return '';

    // Accept only a sequential (a), (b), (c)... series. This deliberately
    // leaves chemistry state symbols such as (aq), (s), (g) and (l) alone.
    const candidates = Array.from(text.matchAll(/\(([a-h])\)/gi));
    const markers = [];
    let expectedCode = 'a'.charCodeAt(0);
    candidates.forEach(match => {
      if (match[1].toLowerCase().charCodeAt(0) !== expectedCode) return;
      markers.push({ label: match[1].toLowerCase(), index: match.index, length: match[0].length });
      expectedCode += 1;
    });

    if (!markers.length) return `<span class="solution-question-copy">${escLines(text)}</span>`;

    const prompt = text.slice(0, markers[0].index).trim();
    const parts = markers.map((marker, index) => {
      const end = markers[index + 1] ? markers[index + 1].index : text.length;
      const partText = text.slice(marker.index + marker.length, end).trim();
      return `<span class="solution-question-part"><span class="solution-part-marker">${marker.label}</span><span>${escLines(partText)}</span></span>`;
    }).join('');

    return `<span class="solution-question-copy">${prompt ? `<span class="solution-question-prompt">${escLines(prompt)}</span>` : ''}<span class="solution-question-parts">${parts}</span></span>`;
  }
  function escLines(value='') { return esc(value).replace(/\r?\n/g, '<br>'); }
  function bindUnload() { if (unloadBound) return; unloadBound = true; window.addEventListener('beforeunload', saveResume); }
  function esc(value='') { return String(value).replace(/[&<>\"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[char])); }
  function attr(value='') { return esc(value).replace(/'/g, '&#39;'); }

  return {
    openFeature, startTest, selectOption, clearAnswer, goTo, submitTest,
    backToTests, exitToFeatures, restoreRefreshState
  };
})();
