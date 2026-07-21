/*
WTC AI Content Engine — Admin OCR + Extraction Workflow
Architecture: WAGH Tuition Classes LOCKED v1.4
Requires:
- assets/js/assessment-config.js
- assets/js/assessment-api.js
*/
const WTC_AI_CONTENT_ADMIN = (() => {
  let selectedFilePayload = null;

  function init() {
    bindFileInput();
    refreshQueue();
  }

  function bindFileInput() {
    const input = document.getElementById('aiFileInput');
    if (!input) return;
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      selectedFilePayload = file ? await fileToBase64Payload(file) : null;
      const label = document.getElementById('aiFileName');
      if (label) label.textContent = file ? `${file.name} (${Math.round(file.size / 1024)} KB)` : 'No file selected';
    });
  }

  async function submitInput() {
    const data = collectFormData();
    if (!data.rawContent && !selectedFilePayload) {
      showStatus('Please paste chapter text or choose a PDF/image file.', 'error');
      return;
    }
    if (selectedFilePayload) Object.assign(data, selectedFilePayload);
    try {
      showStatus('Saving upload to AI_INPUT_QUEUE...', 'info');
      const res = await WTC_ASSESSMENT_API.call({ action: 'submitAIInput', ...data });
      if (!res.success) throw new Error(res.message || 'Upload failed');
      document.getElementById('currentUploadId').value = res.uploadId;
      showStatus(`Saved. Upload ID: ${res.uploadId}`, 'success');
      await refreshQueue();
    } catch (err) { showStatus(err.message, 'error'); }
  }

  async function runOCR() {
    const uploadId = getUploadId();
    if (!uploadId) return showStatus('Upload ID missing. Save input first.', 'error');
    try {
      showStatus('Running OCR/text extraction...', 'info');
      const res = await WTC_ASSESSMENT_API.call({ action: 'extractOCRContent', uploadId });
      if (!res.success) throw new Error(res.message || 'OCR failed');
      showStatus('OCR/text extraction completed.', 'success');
      preview('OCR Extracted Text', res.rawText || 'No text returned.');
      await refreshQueue();
    } catch (err) { showStatus(err.message, 'error'); }
  }

  async function parseChapter() {
    const uploadId = getUploadId();
    if (!uploadId) return showStatus('Upload ID missing.', 'error');
    try {
      showStatus('Detecting chapter metadata...', 'info');
      const res = await WTC_ASSESSMENT_API.call({ action: 'parseChapterStructure', uploadId });
      if (!res.success) throw new Error(res.message || 'Parsing failed');
      showStatus(`Chapter detected: ${res.chapterId}`, 'success');
      preview('Detected Metadata', JSON.stringify(res.metadata || {}, null, 2));
      await refreshQueue();
    } catch (err) { showStatus(err.message, 'error'); }
  }

  async function detectQuestions() {
    const uploadId = getUploadId();
    if (!uploadId) return showStatus('Upload ID missing.', 'error');
    try {
      showStatus('Detecting inside-chapter and end-exercise questions...', 'info');
      const inside = await WTC_ASSESSMENT_API.call({ action: 'detectInsideChapterQuestions', uploadId });
      const end = await WTC_ASSESSMENT_API.call({ action: 'detectEndExerciseQuestions', uploadId });
      if (!inside.success) throw new Error(inside.message || 'Inside question detection failed');
      if (!end.success) throw new Error(end.message || 'End exercise detection failed');
      showStatus(`Detected ${inside.count} inside-chapter and ${end.count} end-exercise questions.`, 'success');
      preview('Question Detection Result', JSON.stringify({ insideChapter: inside.questions, endExercise: end.questions }, null, 2));
    } catch (err) { showStatus(err.message, 'error'); }
  }

  async function generateContent() {
    const uploadId = getUploadId();
    if (!uploadId) return showStatus('Upload ID missing.', 'error');
    try {
      showStatus('Generating lesson, MCQ, worksheet and solutions...', 'info');
      const res = await WTC_ASSESSMENT_API.call({ action: 'generateAIContent', uploadId });
      if (!res.success) throw new Error(res.message || 'Generation failed');
      showStatus('Generated as Draft. Review it before publishing.', 'success');
      preview('Generated Content IDs', JSON.stringify(res, null, 2));
      await refreshQueue();
    } catch (err) { showStatus(err.message, 'error'); }
  }

  async function fullPipeline() {
    try {
      if (!getUploadId()) await submitInput();
      const uploadId = getUploadId();
      if (!uploadId) return;
      showStatus('Running full OCR + extraction + generation pipeline...', 'info');
      const res = await WTC_ASSESSMENT_API.call({ action: 'fullExtractAndGenerate', uploadId });
      if (!res.success) throw new Error(res.message || 'Full pipeline failed');
      showStatus('Full pipeline completed as Draft. Review it before publishing.', 'success');
      preview('Pipeline Result', JSON.stringify(res, null, 2));
      await refreshQueue();
    } catch (err) { showStatus(err.message, 'error'); }
  }

  async function refreshQueue() {
    const box = document.getElementById('aiQueueTable');
    if (!box || !window.WTC_ASSESSMENT_API) return;
    try {
      const res = await WTC_ASSESSMENT_API.listAIQueue();
      const rows = res.queue || [];
      box.innerHTML = rows.length ? renderQueueTable(rows) : '<div class="ai-empty">No AI uploads yet.</div>';
    } catch (err) {
      box.innerHTML = `<div class="ai-empty">${escapeHTML(err.message)}</div>`;
    }
  }

  async function markUnderReview() {
    const uploadId = getUploadId();
    if (!uploadId) return showStatus('Upload ID missing.', 'error');
    try {
      showStatus('Marking content as Under Review...', 'info');
      const res = await WTC_ASSESSMENT_API.reviewContent(uploadId);
      if (!res.success) throw new Error(res.message || 'Review update failed');
      showStatus('Content marked as Under Review.', 'success');
      await refreshQueue();
    } catch (err) { showStatus(err.message, 'error'); }
  }

  async function publishReviewed() {
    const uploadId = getUploadId();
    if (!uploadId) return showStatus('Upload ID missing.', 'error');
    if (!confirm('Publish this reviewed AI content to students?')) return;
    try {
      showStatus('Publishing reviewed content...', 'info');
      const res = await WTC_ASSESSMENT_API.publishContent(uploadId);
      if (!res.success) throw new Error(res.message || 'Publish failed');
      showStatus('Reviewed content published successfully.', 'success');
      preview('Publish Result', JSON.stringify(res, null, 2));
      await refreshQueue();
    } catch (err) { showStatus(err.message, 'error'); }
  }

  function renderQueueTable(rows) {
    return `<table class="ai-table"><thead><tr><th>Upload ID</th><th>Chapter</th><th>Source</th><th>OCR</th><th>Extraction</th><th>Generation</th><th>Action</th></tr></thead><tbody>${rows.map(row => `<tr><td>${escapeHTML(row.uploadId)}</td><td>${escapeHTML(row.chapterId || row.chapterName || '')}</td><td>${escapeHTML(row.sourceType)}</td><td>${escapeHTML(row.ocrStatus)}</td><td>${escapeHTML(row.extractionStatus)}</td><td>${escapeHTML(row.generationStatus)}</td><td><button class="ai-mini-btn" onclick="WTC_AI_CONTENT_ADMIN.useUpload('${escapeHTML(row.uploadId)}')">Use</button></td></tr>`).join('')}</tbody></table>`;
  }

  function useUpload(uploadId) {
    document.getElementById('currentUploadId').value = uploadId;
    showStatus(`Selected upload ${uploadId}`, 'success');
  }

  function collectFormData() {
    return {
      sourceType: document.getElementById('aiSourceType')?.value || 'text',
      board: document.getElementById('aiBoard')?.value || '',
      className: document.getElementById('aiClassName')?.value || '',
      medium: document.getElementById('aiMedium')?.value || '',
      subjectId: document.getElementById('aiSubjectId')?.value || '',
      chapterId: document.getElementById('aiChapterId')?.value || '',
      rawContent: document.getElementById('aiRawContent')?.value || '',
      uploadedBy: 'Admin'
    };
  }

  function getUploadId() { return document.getElementById('currentUploadId')?.value.trim(); }

  function fileToBase64Payload(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Unable to read file.'));
      reader.onload = () => {
        const result = String(reader.result || '');
        const base64 = result.split(',')[1] || '';
        resolve({ fileName: file.name, fileMimeType: file.type || 'application/octet-stream', fileBase64: base64, sourceType: file.type && file.type.includes('pdf') ? 'pdf' : 'image' });
      };
      reader.readAsDataURL(file);
    });
  }

  function showStatus(message, type) {
    const el = document.getElementById('aiStatus');
    if (el) { el.className = `ai-status ${type || 'info'}`; el.textContent = message; }
    if (window.WTC_UI && WTC_UI.toast) WTC_UI.toast(message, type === 'error' ? 'error' : 'success');
  }

  function preview(title, content) {
    const el = document.getElementById('aiPreview');
    if (!el) return;
    el.innerHTML = `<h3>${escapeHTML(title)}</h3><pre>${escapeHTML(content || '')}</pre>`;
  }

  function escapeHTML(s = '') { return String(s).replace(/[&<>\"]/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[m])); }

  return { init, submitInput, runOCR, parseChapter, detectQuestions, generateContent, fullPipeline, markUnderReview, publishReviewed, refreshQueue, useUpload };
})();

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('aiContentEnginePanel')) WTC_AI_CONTENT_ADMIN.init();
});
