/*
WAGH Tuition Classes - Static Page Importer v1.3 Duplicate-Safe Import
Reads trusted WTC static HTML in the admin browser and sends normalized Draft
rows to WTC_AI_CONTENT_ENGINE. Static student pages are never modified.
*/
const WTC_STATIC_CONTENT_IMPORTER = (() => {
  let selectedHtml = '';
  let selectedName = '';
  let parsed = null;
  let importedUploadId = '';
  let importBusy = false;
  let publishBusy = false;

  function init() {
    const file = document.getElementById('staticImportFile');
    if (!file) return;
    file.addEventListener('change', async () => {
      const chosen = file.files && file.files[0];
      if (!chosen) return resetSelection();
      if (!/\.html?$/i.test(chosen.name)) return status('Please choose an HTML file.', 'error');
      if (chosen.size > 5 * 1024 * 1024) return status('HTML file is larger than the 5 MB import limit.', 'error');
      selectedHtml = await chosen.text();
      selectedName = chosen.name;
      parsed = null;
      importedUploadId = '';
      document.getElementById('staticImportUploadId').value = '';
      document.getElementById('staticImportFileName').textContent = `${chosen.name} (${Math.round(chosen.size / 1024)} KB)`;
      status('HTML loaded. Tap Analyze Static Page.', 'info');
    });
  }

  async function loadUrl() {
    const input = document.getElementById('staticImportUrl');
    const url = String(input?.value || '').trim();
    if (!url) return status('Enter a GitHub Pages URL or repository-relative HTML path.', 'error');
    try {
      status('Loading static page...', 'info');
      const res = await fetch(url, { credentials:'same-origin' });
      if (!res.ok) throw new Error(`Unable to load page (${res.status}).`);
      selectedHtml = await res.text();
      selectedName = url.split('/').pop() || 'static-page.html';
      parsed = null;
      importedUploadId = '';
      document.getElementById('staticImportUploadId').value = '';
      document.getElementById('staticImportFileName').textContent = selectedName;
      status('Static page loaded. Tap Analyze Static Page.', 'info');
    } catch (error) {
      status(`${error.message} If the site blocks access, upload the HTML file instead.`, 'error');
    }
  }

  function analyze() {
    if (!selectedHtml) return status('Choose an HTML file or load a URL first.', 'error');
    try {
      parsed = parseStaticHtml(selectedHtml, selectedName);
      const overrides = collectMetadataOverrides();
      parsed.metadata = Object.assign({}, parsed.metadata, onlyFilled(overrides));
      if (overrides.chapterId) parsed.metadata.chapterIdConfidence = 'Admin confirmed';
      isolateSolutionIdentity(parsed);
      validateParsed(parsed, true);
      importedUploadId = '';
      document.getElementById('staticImportUploadId').value = '';
      renderPreview(parsed);
      const count = parsed.pageType === 'MCQ' ? parsed.questions.length : parsed.solutions.length;
      status(`${parsed.pageType} page analyzed successfully: ${count} question(s).`, 'success');
    } catch (error) {
      parsed = null;
      previewError(error.message);
      status(error.message, 'error');
    }
  }

  async function importDraft() {
    if (!parsed) return status('Analyze the static page before importing.', 'error');
    if (importBusy) return status('The static import is already running.', 'info');
    importBusy = true;
    setActionBusy('importDraft', true, 'Importing Draft...');
    try {
      validateParsed(parsed, false);
      status('Importing validated content as Draft. Please keep this page open...', 'info');
      const result = await WTC_ASSESSMENT_API.importStaticContent(parsed);
      if (!result.success) throw new Error(result.message || 'Static import failed.');
      importedUploadId = result.uploadId;
      document.getElementById('staticImportUploadId').value = importedUploadId;
      renderImportResult(result);
      status(result.reusedExistingImport
        ? `Identical content already exists. Reused Upload ID: ${importedUploadId}`
        : `Draft imported. Upload ID: ${importedUploadId}`, 'success');
      if (window.WTC_AI_CONTENT_ADMIN?.refreshQueue) await WTC_AI_CONTENT_ADMIN.refreshQueue();
    } catch (error) {
      status(error?.code === 'STATIC_IMPORT_TIMEOUT'
        ? error.message
        : (error.message || 'Static import failed.'), error?.code === 'STATIC_IMPORT_TIMEOUT' ? 'info' : 'error');
    } finally {
      importBusy = false;
      setActionBusy('importDraft', false);
    }
  }

  async function publishImported() {
    const uploadId = importedUploadId || String(document.getElementById('staticImportUploadId')?.value || '').trim();
    if (!uploadId) return status('Import the page as Draft first.', 'error');
    if (publishBusy) return status('Publishing is already running.', 'info');
    if (!confirm('Publish this reviewed static-page import to the dynamic content bank?')) return;
    publishBusy = true;
    setActionBusy('publishImported', true, 'Publishing...');
    try {
      status('Publishing reviewed content...', 'info');
      const result = await WTC_ASSESSMENT_API.publishStaticImport(uploadId);
      if (!result.success) throw new Error(result.message || 'Publish failed.');
      status('Reviewed content published successfully.', 'success');
      renderImportResult(result);
      if (window.WTC_AI_CONTENT_ADMIN?.refreshQueue) await WTC_AI_CONTENT_ADMIN.refreshQueue();
    } catch (error) {
      status(error.message || 'Publish failed.', 'error');
    } finally {
      publishBusy = false;
      setActionBusy('publishImported', false);
    }
  }

  function parseStaticHtml(html, sourceName) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const scripts = [...doc.scripts].map(s => s.textContent || '');
    const modern = scripts.find(text => text.includes('window.WTC_STATIC_MCQ'));
    if (modern) return parseModernMcq(modern, sourceName);
    const legacy = scripts.find(text => /\bconst\s+BANK\s*=/.test(text) && /\bconst\s+TESTS\s*=/.test(text));
    if (legacy) return parseLegacyMcq(doc, legacy, sourceName);
    if (doc.querySelector('.q-card,.solution-card,.question-card')) {
      return parseSolutionEngine(doc, sourceName);
    }
    throw new Error('Unsupported page. Expected WTC_STATIC_MCQ, BANK/TESTS, or Solution Engine q-card markup.');
  }

  function parseModernMcq(script, sourceName) {
    const expression = extractBalancedAfter(script, 'window.WTC_STATIC_MCQ', '{', '}');
    const config = parseTrustedLiteral(expression);
    return {
      pageType:'MCQ', sourceName, sourcePage:sourceValue(sourceName), format:'WTC_STATIC_MCQ_v1.1',
      metadata:{
        board:config.board || '', className:config.className || '', medium:config.medium || '',
        subjectId:config.subjectId || '', subjectName:config.subjectName || '',
        chapterId:config.chapterId || '', chapterName:config.chapterName || '',
        chapterNo:chapterNumber(config.chapterId, config.pageTitle), detectedLanguage:languageFrom(config.medium), chapterIdConfidence:'Explicit in page data'
      },
      mcqSetId:'MCQSET-' + config.chapterId,
      questions:(config.questionBank || []).map((q, i) => ({
        id:q.id, sourceQuestionId:q.id, sortOrder:i + 1, topic:q.topic || '', difficulty:q.difficulty || 'Medium',
        marks:q.marks || 1, questionText:q.question, options:q.options || {}, correctOption:q.correct,
        explanation:q.explanation || '', tags:q.tags || q.topic || ''
      })),
      tests:(config.tests || []).map((t, i) => ({
        testId:t.testId, testTitle:t.testTitle, testType:t.testType, topic:t.topic || '',
        questionLabel:t.questionLabel || '', instructions:t.instructions || '', sortOrder:i + 1,
        questionIds:Array.isArray(t.questionIds) ? t.questionIds : []
      }))
    };
  }

  function parseLegacyMcq(doc, script, sourceName) {
    const bank = parseTrustedLiteral(extractBalancedAfter(script, 'const BANK', '[', ']'));
    const tests = parseTrustedLiteral(extractBalancedAfter(script, 'const TESTS', '[', ']'));
    const firstId = String(bank[0]?.id || '');
    const chapterId = firstId.split('-Q')[0] || '';
    const heroMeta = String(doc.querySelector('.hero p')?.textContent || '').split('•').map(x => x.trim());
    const title = text(doc.querySelector('.hero h1')) || text(doc.querySelector('h1'));
    const className = heroMeta.find(x => /^Class\s+/i.test(x)) || '';
    const medium = heroMeta.find(x => /Medium$/i.test(x)) || '';
    const board = heroMeta.find(x => /^(CBSE|GSEB)$/i.test(x)) || '';
    const subjectName = heroMeta.find(x => !/^(CBSE|GSEB|Class\s+|Chapter\s+|.*Medium$)/i.test(x)) || '';
    return {
      pageType:'MCQ', sourceName, sourcePage:sourceValue(sourceName), format:'BANK_TESTS_legacy',
      metadata:{ board, className, medium, subjectId:subjectFromChapter(chapterId), subjectName,
        chapterId, chapterName:title, chapterNo:chapterNumber(chapterId, heroMeta.join(' ')), detectedLanguage:languageFrom(medium), chapterIdConfidence:'Explicit in page data' },
      mcqSetId:'MCQSET-' + chapterId,
      questions:bank.map((q, i) => ({
        id:q.id, sourceQuestionId:q.id, sortOrder:i + 1, topic:q.topic || '', difficulty:q.difficulty || 'Medium',
        marks:q.marks || 1, questionText:q.q, options:Array.isArray(q.o) ? q.o : [],
        correctOption:['A','B','C','D'][Number(q.a)], explanation:q.e || '', tags:q.topic || ''
      })),
      tests:tests.map((t, i) => ({
        testId:t.id, testTitle:t.title, testType:t.type, topic:t.topic || '', questionLabel:t.questionLabel || '',
        instructions:t.instructions || '', sortOrder:i + 1,
        questionIds:(t.indices || []).map(index => bank[index]?.id).filter(Boolean)
      }))
    };
  }

  function parseSolutionEngine(doc, sourceName) {
    const meta = readSolutionMetadata(doc);
    const className = normalizeClassName(meta.className);
    const medium = normalizeMedium(meta.medium);
    const chapterHeading = text(doc.querySelector('.chapter,.chapter-title,header h1'));
    const chapterTitle = meta.chapterName || chapterHeading.replace(/^(?:Chapter|પ્રકરણ|અધ્યાય)\s*\d+\s*[:\-–—]\s*/i, '');
    const chapterNo = chapterNumber('', chapterHeading);
    const subjectName = meta.subjectName || '';
    const subjectId = makeSubjectId(subjectName, className);
    const fileChapterToken = (String(sourceName || '').match(/ch(0*\d+)/i) || [])[1] || String(chapterNo || '');
    const chapterId = subjectId && fileChapterToken ? `${subjectId}CH${fileChapterToken}` : '';
    const cards = [...doc.querySelectorAll('.q-card,.solution-card,.question-card')];
    const solutions = cards.map((card, index) => {
      const parts = readQuestionParts(card, index + 1);
      const parsedBadge = splitBadge(parts.label, index + 1);
      const section = previousMajorSection(card, doc);
      const questionSource = /part\s*ii|end|exercise|chapter\s*end|સ્વાધ્યાય|અંત/i.test(section) ? 'End Exercise' : 'Inside Chapter';
      const contentRoot = card.querySelector('.answer,.solution-inner,.solution-body');
      const detailClone = contentRoot?.cloneNode(true);
      detailClone?.querySelectorAll('.final,.final-box,.final-card,.final-answer,.gu-final,.gu-line,.gu-answer').forEach(el => el.remove());
      const finalBox = card.querySelector('.final,.final-box,.final-card,.final-answer');
      const finalClone = finalBox?.cloneNode(true);
      finalClone?.querySelectorAll('.gu-final,.gu-line,.gu-answer').forEach(el => el.remove());
      const gu = card.querySelector('.gu-final,.gu-line,.gu-answer');
      const diagrams = topLevelVisuals(card).map(el => el.outerHTML).join('');
      const sourceQuestionId = `${chapterId || 'CH'}-${slug(parsedBadge.group)}-${slug(parsedBadge.number || index + 1)}-${String(index + 1).padStart(3, '0')}`;
      return {
        solutionId:'SOL-' + sourceQuestionId, sourceQuestionId, sortOrder:index + 1,
        questionSource, questionGroup:parsedBadge.group, questionNumber:parsedBadge.number,
        questionText:parts.questionText, solutionHTML:detailClone?.innerHTML || contentRoot?.innerHTML || '',
        stepByStepSolution:text(detailClone || contentRoot), finalAnswerHTML:finalClone?.innerHTML || '',
        gujaratiFinalHTML:gu?.innerHTML || '', diagramHTML:diagrams, marks:'', difficulty:''
      };
    });
    return {
      pageType:'SOLUTION', sourceName, sourcePage:sourceValue(sourceName), format:detectSolutionFormat(cards[0]),
      metadata:{ board:meta.board || '', className, medium, subjectId, subjectName,
        chapterId, chapterName:chapterTitle, chapterNo, detectedLanguage:languageFrom(medium), chapterIdConfidence:'Inferred - admin confirmation required' },
      solutionSetId:'SOLSET-' + chapterId, solutions
    };
  }


  function isolateSolutionIdentity(data) {
    if (!data || data.pageType !== 'SOLUTION') return data;
    const chapterId = String(data.metadata?.chapterId || '').trim();
    if (!chapterId) return data;

    data.solutionSetId = `SOLSET-${chapterId}`;
    data.solutions = (data.solutions || []).map((solution, index) => {
      const sourceToken = identityToken(solution.questionSource || 'Question');
      const groupToken = identityToken(solution.questionGroup || 'Question');
      const numberToken = identityToken(solution.questionNumber || (index + 1));
      const sourceQuestionId = `${chapterId}-${sourceToken}-${groupToken}-${numberToken}-${String(index + 1).padStart(3, '0')}`;
      return {
        ...solution,
        sourceQuestionId,
        solutionId:`SOL-${sourceQuestionId}`
      };
    });
    return data;
  }

  function identityToken(value) {
    return String(value || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toUpperCase()
      .slice(0, 36) || 'Q';
  }

  function validateParsed(data, allowInferredChapterId) {
    if (!data.metadata?.chapterId) throw new Error('Chapter ID could not be detected. Enter it in the AI form, then analyze again.');
    if (!allowInferredChapterId && data.pageType === 'SOLUTION' && /Inferred/i.test(data.metadata.chapterIdConfidence || '')) {
      throw new Error('Confirm the exact Solution Chapter ID: enable metadata override, enter the existing Chapter ID, then analyze again.');
    }
    if (data.pageType === 'MCQ') {
      if (!data.questions?.length) throw new Error('No MCQ questions detected.');
      const ids = new Set();
      data.questions.forEach((q, i) => {
        if (!q.id || ids.has(q.id)) throw new Error(`Missing or duplicate MCQ ID at question ${i + 1}.`);
        ids.add(q.id);
        const options = optionValues(q.options);
        if (!q.questionText || options.length !== 4 || options.some(x => !String(x).trim())) throw new Error(`Incomplete MCQ at question ${i + 1}.`);
        if (!['A','B','C','D'].includes(String(q.correctOption || '').toUpperCase())) throw new Error(`Invalid correct answer at question ${i + 1}.`);
      });
      (data.tests || []).forEach(test => {
        const missing = (test.questionIds || []).filter(id => !ids.has(id));
        if (missing.length) throw new Error(`${test.testTitle || test.testId} references missing questions: ${missing.join(', ')}`);
      });
    } else {
      if (!data.solutions?.length) throw new Error('No Solution Engine questions detected.');
      const chapterId = String(data.metadata.chapterId || '').trim();
      const expectedSetId = `SOLSET-${chapterId}`;
      if (data.solutionSetId !== expectedSetId) throw new Error('Solution Set ID does not match the confirmed Chapter ID.');
      const ids = new Set();
      data.solutions.forEach((q, i) => {
        if (!q.questionText || (!q.solutionHTML && !q.finalAnswerHTML)) throw new Error(`Incomplete solution at question ${i + 1}.`);
        if (!q.sourceQuestionId?.startsWith(`${chapterId}-`) || !q.solutionId?.startsWith(`SOL-${chapterId}-`)) {
          throw new Error(`Solution identity does not match the confirmed Chapter ID at question ${i + 1}.`);
        }
        if (ids.has(q.solutionId)) throw new Error(`Duplicate Solution ID at question ${i + 1}.`);
        ids.add(q.solutionId);
      });
    }
  }

  function renderPreview(data) {
    const box = document.getElementById('staticImportPreview');
    const m = data.metadata;
    const rows = data.pageType === 'MCQ' ? data.questions : data.solutions;
    const extra = data.pageType === 'MCQ' ? `${data.tests.length} test(s)` : `${rows.filter(x => x.gujaratiFinalHTML).length} Gujarati final answer(s)`;
    box.innerHTML = `<div class="static-summary">
      <span><b>Format</b>${escapeHtml(data.format)}</span><span><b>Type</b>${escapeHtml(data.pageType)}</span>
      <span><b>Board / Class</b>${escapeHtml(`${m.board || '-'} • ${m.className || '-'}`)}</span><span><b>Medium</b>${escapeHtml(m.medium || '-')}</span>
      <span><b>Subject ID</b>${escapeHtml(m.subjectId || '-')}</span><span><b>Chapter ID</b>${escapeHtml(m.chapterId)}</span>
      <span><b>ID Status</b>${escapeHtml(m.chapterIdConfidence || 'Detected')}</span><span><b>Content</b>${rows.length} question(s), ${escapeHtml(extra)}</span>
    </div>${previewTable(data, rows.slice(0, 8))}<p class="static-preview-note">Preview shows the first ${Math.min(8, rows.length)} row(s). Import remains Draft until you approve and publish it.${data.pageType === 'SOLUTION' && /Inferred/i.test(m.chapterIdConfidence || '') ? ' Confirm the exact existing Chapter ID using metadata override before import.' : ''}</p>`;
  }

  function previewTable(data, rows) {
    if (data.pageType === 'MCQ') return `<div class="ai-table-wrap"><table class="ai-table"><thead><tr><th>ID</th><th>Topic</th><th>Question</th><th>Answer</th></tr></thead><tbody>${rows.map(q => `<tr><td>${escapeHtml(q.id)}</td><td>${escapeHtml(q.topic)}</td><td>${escapeHtml(q.questionText)}</td><td>${escapeHtml(q.correctOption)}</td></tr>`).join('')}</tbody></table></div>`;
    return `<div class="ai-table-wrap"><table class="ai-table"><thead><tr><th>No.</th><th>Group</th><th>Question</th><th>Gujarati</th></tr></thead><tbody>${rows.map(q => `<tr><td>${escapeHtml(q.questionNumber)}</td><td>${escapeHtml(q.questionGroup)}</td><td>${escapeHtml(q.questionText)}</td><td>${q.gujaratiFinalHTML ? 'Yes' : 'No'}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function renderImportResult(result) {
    const box = document.getElementById('staticImportPreview');
    const stats = result.stats ? `<p>Inserted: ${result.stats.inserted || 0} • Updated: ${result.stats.updated || 0} • Unchanged: ${result.stats.unchanged || 0}</p>` : '';
    const duplicateNote = result.duplicateSafe
      ? `<p><b>Duplicate protection:</b> ${result.reusedExistingImport ? 'Existing identical import reused' : 'Enabled'}</p>`
      : '';
    box.innerHTML = `<div class="static-result"><h3>${escapeHtml(result.message || 'Completed')}</h3><p><b>Upload ID:</b> ${escapeHtml(result.uploadId || importedUploadId)}</p>${duplicateNote}${stats}<pre>${escapeHtml(JSON.stringify(result, null, 2))}</pre></div>`;
  }

  function collectMetadataOverrides() {
    if (!document.getElementById('staticUseMetadataOverride')?.checked) return {};
    return {
      board:document.getElementById('aiBoard')?.value || '', className:document.getElementById('aiClassName')?.value || '',
      medium:document.getElementById('aiMedium')?.value || '', subjectId:document.getElementById('aiSubjectId')?.value.trim() || '',
      chapterId:document.getElementById('aiChapterId')?.value.trim() || ''
    };
  }
  function onlyFilled(obj) { return Object.fromEntries(Object.entries(obj).filter(([,v]) => String(v || '').trim())); }
  function optionValues(options) { return Array.isArray(options) ? options : ['A','B','C','D'].map(k => options?.[k]); }
  function sourceValue(name) { return String(document.getElementById('staticImportUrl')?.value || name || '').trim(); }
  function sourceFromChapter(id) { return String(id || '').split('CH')[0]; }
  function subjectFromChapter(id) { return sourceFromChapter(id); }
  function chapterNumber(id, textValue) { return (String(id || '').match(/CH0*(\d+)/i) || String(textValue || '').match(/(?:Chapter|પ્રકરણ|અધ્યાય)\s*0*(\d+)/i) || [])[1] || ''; }
  function languageFrom(medium) { return /Gujarati|ગુજરાતી/i.test(medium || '') ? 'Gujarati' : 'English'; }
  function makeSubjectId(subject, className) {
    const n = (String(className).match(/\d+/) || [])[0] || '';
    const s = String(subject || '').toLowerCase();
    const prefix = /science|વિજ્ઞાન/.test(s) ? 'SCI' : /math|ગણિત/.test(s) ? 'MATH' : /english/.test(s) ? 'ENG' : /social/.test(s) ? 'SS' : slug(subject).replace(/-/g,'').slice(0,5).toUpperCase();
    return prefix && n ? prefix + n : '';
  }
  function splitBadge(value, fallback) {
    const clean = String(value || 'Question ' + fallback).trim();
    const match = clean.match(/^(.*?)[\s#-]+(Q?\d+(?:\.\d+)?)$/i);
    return match ? { group:match[1].trim() || 'Question', number:match[2] } : { group:clean || 'Question', number:String(fallback) };
  }
  function readSolutionMetadata(doc) {
    const meta = {};
    doc.querySelectorAll('.meta > div,.meta-grid .meta-item,.chapter-meta > div').forEach(div => {
      const keyNode = div.querySelector('b,span:first-child');
      const strong = div.querySelector('strong');
      const key = standardMetaKey(text(keyNode));
      const clone = div.cloneNode(true);
      clone.querySelector('b,span:first-child')?.remove();
      const value = text(strong) || text(clone);
      if (key && value) meta[key] = value;
    });
    return meta;
  }
  function standardMetaKey(value) {
    const key = String(value || '').replace(/[:：]/g, '').trim().toLowerCase();
    if (/^board$|બોર્ડ/.test(key)) return 'board';
    if (/^class$|ધોરણ/.test(key)) return 'className';
    if (/^subject$|વિષય/.test(key)) return 'subjectName';
    if (/^medium$|માધ્યમ/.test(key)) return 'medium';
    if (/^chapter(?:\s*name)?$|પ્રકરણ|અધ્યાય/.test(key)) return 'chapterName';
    return '';
  }
  function normalizeClassName(value) {
    const raw = String(value || '').trim();
    if (/^Class\s+\d+/i.test(raw)) return raw;
    const number = (raw.match(/\d+/) || [])[0];
    return number ? `Class ${number}` : raw;
  }
  function normalizeMedium(value) {
    const raw = String(value || '').trim();
    if (/Gujarati|ગુજરાતી/i.test(raw)) return 'Gujarati Medium';
    if (/English|અંગ્રેજી/i.test(raw)) return 'English Medium';
    return raw && !/Medium$/i.test(raw) ? `${raw} Medium` : raw;
  }
  function readQuestionParts(card, fallback) {
    const separateText = card.querySelector('.question-text');
    if (separateText) return {
      label:text(card.querySelector('.question-number')) || `Question ${fallback}`,
      questionText:text(separateText)
    };
    const combined = card.querySelector('.qtext,.q-title');
    if (combined) {
      const label = text(combined.querySelector('.badge,.q-badge')) || `Question ${fallback}`;
      const clone = combined.cloneNode(true);
      clone.querySelectorAll('.badge,.q-badge,.indicator').forEach(el => el.remove());
      return { label, questionText:text(clone) };
    }
    const heading = card.querySelector('.accordion-title');
    const clone = heading?.cloneNode(true);
    clone?.querySelectorAll('.tap-indicator').forEach(el => el.remove());
    return splitInlineQuestion(text(clone), fallback);
  }
  function splitInlineQuestion(value, fallback) {
    const clean = String(value || '').trim();
    const match = clean.match(/^((?:Activity|Question|Example|Exercise|Solved\s+Example|In[-\s]?text\s+Question)\s*[A-Za-z0-9()./\-]+)[.:\s–—-]+(.+)$/i);
    return match ? { label:match[1].trim(), questionText:match[2].trim() }
      : { label:`Question ${fallback}`, questionText:clean };
  }
  function previousMajorSection(card, doc) {
    let latest = '';
    doc.querySelectorAll('.section-title,.part-heading,h2').forEach(heading => {
      if (heading.compareDocumentPosition(card) & 4) latest = text(heading);
    });
    return latest;
  }
  function topLevelVisuals(card) {
    const all = [...card.querySelectorAll('figure,.diagram,.solution-diagram,.mini-graph,.graph-grid,svg,canvas')];
    return all.filter(el => !all.some(parent => parent !== el && parent.contains(el)));
  }
  function detectSolutionFormat(card) {
    if (!card) return 'Solution_Engine_unknown';
    if (card.classList.contains('question-card')) return 'Solution_Engine_question_card';
    if (card.classList.contains('solution-card')) return 'Solution_Engine_solution_card';
    if (card.querySelector('.q-title,.q-badge')) return 'Solution_Engine_q_title';
    return 'Solution_Engine_q_card';
  }
  function extractBalancedAfter(source, marker, open, close) {
    const markerAt = source.indexOf(marker);
    if (markerAt < 0) throw new Error(`Missing ${marker}.`);
    const start = source.indexOf(open, markerAt + marker.length);
    if (start < 0) throw new Error(`Missing ${open} after ${marker}.`);
    let depth = 0, quote = '', escaped = false;
    for (let i = start; i < source.length; i++) {
      const ch = source[i];
      if (quote) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === quote) quote = '';
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
      if (ch === open) depth++;
      if (ch === close && --depth === 0) return source.slice(start, i + 1);
    }
    throw new Error(`Unclosed ${marker} data block.`);
  }
  function parseTrustedLiteral(expression) {
    try { return JSON.parse(expression); } catch (_) {}
    if (/\b(function|window|document|fetch|eval|constructor|prototype|__proto__|import|XMLHttpRequest)\b|=>/i.test(expression)) {
      throw new Error('Legacy data block contains executable code and was blocked.');
    }
    return Function(`"use strict";return (${expression});`)();
  }
  function slug(value) { return String(value || '').normalize('NFKD').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toUpperCase() || 'Q'; }
  function text(node) { return String(node?.textContent || '').replace(/\s+/g, ' ').trim(); }
  function escapeHtml(value='') { return String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
  function setActionBusy(actionName, busy, busyText='Working...') {
    const button = document.querySelector(
      `[data-static-import-action="${actionName}"],button[onclick*="WTC_STATIC_CONTENT_IMPORTER.${actionName}"]`
    );
    if (!button) return;
    if (!button.dataset.originalText) button.dataset.originalText = button.textContent.trim();
    button.disabled = !!busy;
    button.setAttribute('aria-busy', busy ? 'true' : 'false');
    button.textContent = busy ? busyText : button.dataset.originalText;
  }

  function status(message, type) {
    const el = document.getElementById('staticImportStatus');
    if (el) { el.className = `ai-status ${type || 'info'}`; el.textContent = message; }
    if (window.WTC_UI?.toast) WTC_UI.toast(message, type === 'error' ? 'error' : 'success');
  }
  function previewError(message) { const el = document.getElementById('staticImportPreview'); if (el) el.innerHTML = `<div class="ai-empty">${escapeHtml(message)}</div>`; }
  function resetSelection() {
    selectedHtml=''; selectedName=''; parsed=null; importedUploadId='';
    document.getElementById('staticImportUploadId').value='';
    document.getElementById('staticImportFileName').textContent='No HTML file selected';
  }

  return { init, loadUrl, analyze, importDraft, publishImported };
})();

document.addEventListener('DOMContentLoaded', () => WTC_STATIC_CONTENT_IMPORTER.init());
