/* WAGH Tuition Classes — Reusable Assigned MCQ Engine Phase 2.5F v1.0 */
const WTC_ASSIGNED_MCQ_ENGINE = (() => {
  let user = null;
  let assignment = null;
  let launch = null;
  let questions = [];
  let answers = {};
  let questionTimes = {};
  let openedAt = {};
  let startedAt = 0;
  let timer = null;
  let submitted = false;
  let clientAttemptId = '';

  async function init() {
    user = WTC_AUTH.requireRole('Student');
    if (!user) return;
    text('assignedStudentName', user.name || 'Student');
    const assignmentId = new URLSearchParams(location.search).get('assignmentId') || '';
    if (!assignmentId) return fail('Assignment ID is missing from this link.');
    try {
      const access = await WTC_API.call({ action:'studentOpenAssignedTest', ...identity(), assignmentId });
      if (access?.success === false) throw new Error(access.message || 'Assignment verification failed.');
      assignment = access.assignment || {};
      launch = access.launch || {};
      const data = await WTC_ASSESSMENT_API.getMCQ(launch.mcqSetId, true);
      const test = (data.tests || []).find(item => String(item.testId) === String(launch.testId));
      if (!test) throw new Error('The exact published test definition was not found.');
      const bank = Array.isArray(data.mcq) ? data.mcq : [];
      const map = new Map(bank.map(item => [String(item.mcqId || item.id), normalizeQuestion(item)]));
      const ids = Array.isArray(test.questionIds) && test.questionIds.length ? test.questionIds : bank.map(item => item.mcqId || item.id);
      questions = ids.map(id => map.get(String(id))).filter(Boolean);
      if (!questions.length) throw new Error('No published questions are connected to this test.');
      launch.topic = test.topic || '';
      launch.instructions = test.instructions || '';
      launch.questionLabel = test.questionLabel || '';
      clientAttemptId = pendingAttemptId(assignmentId, Number(launch.attemptsUsed || 0) + 1);
      start();
    } catch (error) { fail(error.message || 'Assigned test could not be loaded.'); }
  }

  function identity() { return { studentId:user.studentId || user.id || '', mobile:user.mobile || '', deviceId:typeof WTC_AUTH.deviceId === 'function' ? WTC_AUTH.deviceId() : '' }; }

  function normalizeQuestion(row) {
    return {
      id:String(row.mcqId || row.id || ''), topic:row.topic || 'General', difficulty:row.difficulty || 'Medium', marks:Number(row.marks || 1),
      text:row.questionText || row.question || '', options:{ A:row.optionA || '', B:row.optionB || '', C:row.optionC || '', D:row.optionD || '' },
      correct:String(row.correctOption || row.correct || '').toUpperCase(), explanation:row.explanation || ''
    };
  }

  function start() {
    startedAt = Date.now();
    text('assignedTestTitle', launch.testTitle || assignment.testTitle || 'Assigned MCQ Test');
    text('assignedTestMeta', [assignment.chapterName || launch.chapterId, launch.testType, launch.topic, `${questions.length} questions`, attemptLabel()].filter(Boolean).join(' • '));
    if (assignment.teacherMessage) { text('assignedTeacherMessage', assignment.teacherMessage); document.getElementById('assignedTeacherMessage')?.classList.remove('hidden'); }
    text('assignedTotal', questions.length);
    renderPalette();
    renderQuestions();
    bindActions();
    updateProgress();
    document.getElementById('assignedLoading')?.classList.add('hidden');
    document.getElementById('assignedQuiz')?.classList.remove('hidden');
    timer = window.setInterval(updateTimer, 1000);
    updateTimer();
  }

  function attemptLabel() {
    if (!launch.maxAttempts) return `Attempt ${Number(launch.attemptsUsed || 0) + 1} • Unlimited retries`;
    return `Attempt ${Number(launch.attemptsUsed || 0) + 1} of ${launch.maxAttempts}`;
  }

  function bindActions() {
    document.getElementById('assignedSubmitButton')?.addEventListener('click', submit);
    document.getElementById('assignedRetryButton')?.addEventListener('click', () => location.reload());
    document.getElementById('assignedReviewButton')?.addEventListener('click', reviewUnanswered);
  }

  function renderPalette() {
    const box = document.getElementById('assignedPalette');
    box.innerHTML = questions.map((q,index) => `<button id="assignedPal-${attr(q.id)}" type="button" data-question-id="${attr(q.id)}">${index+1}</button>`).join('');
    box.querySelectorAll('button').forEach(button => button.addEventListener('click', () => scrollToQuestion(button.dataset.questionId)));
  }

  function renderQuestions() {
    const box = document.getElementById('assignedQuestionList');
    box.innerHTML = questions.map((q,index) => `<article id="assignedQ-${attr(q.id)}" class="assigned-question" data-question-id="${attr(q.id)}"><div class="assigned-question-top"><span>Question ${index+1}</span><span>${esc(q.topic)}</span><span>${esc(q.difficulty)}</span><span>${esc(q.marks)} mark</span></div><h3>${esc(q.text)}</h3><div class="assigned-options">${Object.keys(q.options).map(letter => `<button class="assigned-option" type="button" data-question-id="${attr(q.id)}" data-option="${letter}"><b>${letter}</b><span>${esc(q.options[letter])}</span></button>`).join('')}</div><div class="assigned-answer-line hidden"></div><div class="assigned-explanation"><b>Explanation:</b> ${esc(q.explanation || 'Review this concept with your Teacher.')}</div></article>`).join('');
    box.querySelectorAll('.assigned-option').forEach(button => button.addEventListener('click', () => choose(button.dataset.questionId, button.dataset.option)));
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => entries.forEach(entry => { if(entry.isIntersecting) openedAt[entry.target.dataset.questionId] ||= Date.now(); }), {threshold:.35});
      box.querySelectorAll('.assigned-question').forEach(card => observer.observe(card));
    }
  }

  function choose(questionId, option) {
    if (submitted) return;
    answers[questionId] = option;
    questionTimes[questionId] = Math.max(1, Math.round((Date.now() - (openedAt[questionId] || startedAt)) / 1000));
    const card = document.getElementById(`assignedQ-${cssEscape(questionId)}`);
    card?.querySelectorAll('.assigned-option').forEach(button => button.classList.toggle('selected', button.dataset.option === option));
    document.getElementById(`assignedPal-${cssEscape(questionId)}`)?.classList.add('answered');
    updateProgress();
  }

  function updateProgress() {
    const count = Object.keys(answers).length;
    text('assignedAnswered', count);
    document.getElementById('assignedProgressFill')?.style.setProperty('width', `${questions.length ? (count/questions.length)*100 : 0}%`);
  }

  function reviewUnanswered() {
    const q = questions.find(item => !answers[item.id]) || questions[0];
    if (q) scrollToQuestion(q.id);
  }

  async function submit() {
    if (submitted) return;
    const unanswered = questions.filter(q => !answers[q.id]).length;
    if (unanswered && !confirm(`${unanswered} question(s) are unanswered. Submit now?`)) return;
    submitted = true;
    if (timer) clearInterval(timer);
    const result = calculate();
    reveal(result);
    showResult(result);
    await save(result);
  }

  function calculate() {
    let score=0,totalMarks=0,earnedMarks=0;
    const details = questions.map((q,index) => {
      const selected = answers[q.id] || '';
      const correct = selected === q.correct;
      totalMarks += q.marks;
      if (correct) { score += 1; earnedMarks += q.marks; }
      return { questionNo:index+1,questionId:q.id,questionText:q.text,topic:q.topic,difficulty:q.difficulty,selectedOption:selected,correctOption:q.correct,isCorrect:correct,marks:q.marks,timeTakenSec:questionTimes[q.id] || 0 };
    });
    const total=questions.length;
    return {score,total,percent:total?Math.round(score/total*100):0,earnedMarks,totalMarks,details,totalTimeSec:Math.round((Date.now()-startedAt)/1000)};
  }

  function reveal(result) {
    questions.forEach(q => {
      const card=document.getElementById(`assignedQ-${cssEscape(q.id)}`); card?.classList.add('submitted');
      card?.querySelectorAll('.assigned-option').forEach(button => { button.disabled=true; if(button.dataset.option===q.correct)button.classList.add('correct'); if(button.dataset.option===answers[q.id]&&button.dataset.option!==q.correct)button.classList.add('wrong'); });
      const line=card?.querySelector('.assigned-answer-line'); if(line){line.classList.remove('hidden');line.innerHTML=`Your answer: <b>${esc(answers[q.id] || 'Not answered')}</b> • Correct answer: <b>${esc(q.correct)}</b>`;}
    });
    result.details.forEach(item => document.getElementById(`assignedPal-${cssEscape(item.questionId)}`)?.classList.add(item.isCorrect?'correct':'wrong'));
  }

  function showResult(result) {
    const weak=[...new Set(result.details.filter(item=>!item.isCorrect).map(item=>item.topic).filter(Boolean))].slice(0,4);
    const box=document.getElementById('assignedResult'); box.classList.remove('hidden'); box.innerHTML=`<div class="assigned-result-head"><div><span class="eyebrow">Result Report</span><h2>${result.percent>=80?'Excellent work!':result.percent>=50?'Good attempt — revise weak topics.':'Review the chapter and ask your Teacher for support.'}</h2></div><div class="assigned-result-score">${result.percent}%</div></div><div class="assigned-result-grid"><div><small>Score</small><b>${result.score}/${result.total}</b></div><div><small>Marks</small><b>${result.earnedMarks}/${result.totalMarks}</b></div><div><small>Total Time</small><b>${formatTime(result.totalTimeSec)}</b></div><div><small>Weak Topics</small><b>${esc(weak.join(', ') || 'None')}</b></div></div><p id="assignedSaveStatus" class="assigned-save-status">Saving assigned-test result…</p>`;
    document.getElementById('assignedSubmitButton')?.classList.add('hidden');
    box.scrollIntoView({behavior:'smooth',block:'center'});
  }

  async function save(result) {
    try {
      const data = await WTC_API.call({
        action:'saveAssignedMCQResult', ...identity(), assignmentId:launch.assignmentId, clientAttemptId,
        board:launch.board,className:launch.className,medium:launch.medium,subjectId:launch.subjectId,chapterId:launch.chapterId,
        chapterName:assignment.chapterName || '',testId:launch.testId,testTitle:launch.testTitle,testType:launch.testType,topic:launch.topic || '',
        score:result.score,total:result.total,percent:result.percent,earnedMarks:result.earnedMarks,totalMarks:result.totalMarks,
        correctCount:result.score,wrongCount:Math.max(0,result.total-result.score),totalTimeSec:result.totalTimeSec,
        attemptDetails:JSON.stringify(result.details),page:location.pathname
      });
      if (data?.success === false) throw new Error(data.message || 'Result could not be saved.');
      clearPendingAttemptId(launch.assignmentId, Number(launch.attemptsUsed || 0) + 1);
      text('assignedSaveStatus', data.reused ? '✅ This attempt was already saved safely.' : '✅ Assigned-test result saved successfully.');
      const canRetry = data.remainingAttempts === null || Number(data.remainingAttempts || 0) > 0;
      document.getElementById('assignedRetryButton')?.classList.toggle('hidden', !canRetry);
    } catch (error) {
      text('assignedSaveStatus', `⚠️ ${error.message || 'Result shown, but it could not be saved.'}`);
      submitted = false;
      document.getElementById('assignedSubmitButton')?.classList.remove('hidden');
    }
  }

  function updateTimer() { text('assignedTimer', formatClock(Math.round((Date.now()-startedAt)/1000))); }
  function fail(message) { document.getElementById('assignedLoading')?.classList.add('hidden'); document.getElementById('assignedError')?.classList.remove('hidden'); text('assignedErrorText',message); }
  function scrollToQuestion(id) { document.getElementById(`assignedQ-${cssEscape(id)}`)?.scrollIntoView({behavior:'smooth',block:'start'}); }
  function text(id,value) { const el=document.getElementById(id); if(el)el.textContent=String(value ?? ''); }
  function formatClock(sec) { return `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`; }
  function formatTime(sec) { return `${Math.floor(sec/60)}m ${sec%60}s`; }
  function attemptStorageKey(assignmentId, attemptNumber) { return `wtc:assigned-test:attempt:${assignmentId}:${attemptNumber}`; }
  function pendingAttemptId(assignmentId, attemptNumber) {
    const key = attemptStorageKey(assignmentId, attemptNumber);
    let id = '';
    try { id = sessionStorage.getItem(key) || ''; } catch (error) {}
    if (!id) {
      id = uuid();
      try { sessionStorage.setItem(key, id); } catch (error) {}
    }
    return id;
  }
  function clearPendingAttemptId(assignmentId, attemptNumber) {
    try { sessionStorage.removeItem(attemptStorageKey(assignmentId, attemptNumber)); } catch (error) {}
  }
  function uuid() { return window.crypto?.randomUUID?.() || `ATT-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
  function cssEscape(value='') { return window.CSS?.escape ? CSS.escape(String(value)) : String(value).replace(/[^A-Za-z0-9_-]/g,'\\$&'); }
  function esc(value='') { return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
  function attr(value='') { return esc(value).replace(/`/g,'&#096;'); }
  return { init };
})();

document.addEventListener('DOMContentLoaded', WTC_ASSIGNED_MCQ_ENGINE.init);
