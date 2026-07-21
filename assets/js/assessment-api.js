/* WTC Assessment API client Stage 1 Performance v1.2 — Static Import Reliability */
window.WTC_ASSESSMENT_API = (() => {
  const inFlight = new Map();
  const memoryCache = new Map();
  const CACHE_PREFIX = 'wtc:assessment-cache:';

  function perf() { return (window.WTC_CONFIG && WTC_CONFIG.PERFORMANCE) || {}; }
  function ttl(name, fallback) { return Number(perf().CACHE_TTL_MS?.[name] || fallback || 0); }
  function identity(payload) {
    const sort = value => {
      if (Array.isArray(value)) return value.map(sort);
      if (!value || typeof value !== 'object') return value;
      return Object.keys(value).sort().reduce((copy, key) => { if (value[key] !== undefined) copy[key] = sort(value[key]); return copy; }, {});
    };
    return JSON.stringify(sort(payload || {}));
  }
  function key(payload) { return `${CACHE_PREFIX}${perf().CACHE_VERSION || 'v1'}:${identity(payload)}`; }
  function readCache(payload, maxAgeMs) {
    const cacheKey = key(payload);
    let entry = memoryCache.get(cacheKey) || null;
    if (!entry) {
      try { entry = JSON.parse(localStorage.getItem(cacheKey) || 'null'); } catch (error) {}
    }
    if (!entry || Date.now() - Number(entry.savedAt || 0) > maxAgeMs) {
      memoryCache.delete(cacheKey);
      try { localStorage.removeItem(cacheKey); } catch (error) {}
      return null;
    }
    memoryCache.set(cacheKey, entry);
    return entry.data;
  }
  function writeCache(payload, data) {
    const cacheKey = key(payload);
    const entry = { savedAt:Date.now(), data };
    memoryCache.set(cacheKey, entry);
    try { localStorage.setItem(cacheKey, JSON.stringify(entry)); } catch (error) {}
    return data;
  }
  function clearReadCache() {
    memoryCache.clear();
    try {
      for (let index = localStorage.length - 1; index >= 0; index--) {
        const cacheKey = localStorage.key(index);
        if (cacheKey?.startsWith(CACHE_PREFIX)) localStorage.removeItem(cacheKey);
      }
    } catch (error) {}
  }
  function delay(ms) { return new Promise(resolve => window.setTimeout(resolve, ms)); }

  async function fetchJson(payload, options={}) {
    if (!WTC_ASSESSMENT_CONFIG.API_URL || WTC_ASSESSMENT_CONFIG.API_URL.includes('PASTE_')) {
      throw new Error('Assessment API URL is not set in assets/js/assessment-config.js');
    }
    const timeoutMs = Number(options.timeoutMs || perf().ASSESSMENT_TIMEOUT_MS || 18000);
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? window.setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const response = await fetch(WTC_ASSESSMENT_CONFIG.API_URL, {
        method:'POST',
        headers:{ 'Content-Type':'text/plain;charset=utf-8' },
        body:JSON.stringify(payload),
        signal:controller?.signal
      });
      if (!response.ok) throw new Error(`Assessment API request failed (${response.status}).`);
      const text = await response.text();
      try { return JSON.parse(text); }
      catch (error) { throw new Error('Assessment API returned an invalid response.'); }
    } catch (error) {
      if (error?.name === 'AbortError') {
        const timeoutError = new Error(payload?.action === 'importStaticContent'
          ? 'Static import is taking longer than expected. The server may still finish. Wait a moment, then tap Import as Draft again; duplicate-safe mode will reuse the same import.'
          : 'Content request timed out. Please try again.');
        timeoutError.code = payload?.action === 'importStaticContent' ? 'STATIC_IMPORT_TIMEOUT' : 'REQUEST_TIMEOUT';
        throw timeoutError;
      }
      throw error;
    } finally {
      if (timer) window.clearTimeout(timer);
    }
  }

  async function call(payload, options={}) {
    const requestKey = identity(payload);
    if (options.dedupe !== false && inFlight.has(requestKey)) return inFlight.get(requestKey);
    const promise = (async () => {
      const retries = Math.max(0, Number(options.retries || 0));
      let lastError;
      for (let attempt = 0; attempt <= retries; attempt++) {
        try { return await fetchJson(payload, options); }
        catch (error) {
          lastError = error;
          if (attempt < retries) await delay(300 * (attempt + 1));
        }
      }
      throw lastError;
    })().finally(() => inFlight.delete(requestKey));
    if (options.dedupe !== false) inFlight.set(requestKey, promise);
    return promise;
  }

  async function read(payload, ttlMs, forceRefresh=false) {
    if (!forceRefresh && ttlMs) {
      const cached = readCache(payload, ttlMs);
      if (cached) return cached;
    }
    const data = await call(payload, { retries:Number(perf().READ_RETRY_COUNT ?? 1), dedupe:true });
    if (data?.success === false) throw new Error(data.message || 'Published content could not be loaded.');
    if (ttlMs) writeCache(payload, data);
    return data;
  }

  async function write(payload, options={}) {
    const data = await call(payload, {
      retries:0,
      dedupe:true,
      timeoutMs:Number(options.timeoutMs || perf().WRITE_TIMEOUT_MS || 30000)
    });
    return data;
  }

  return {
    call,
    clearReadCache,
    submitAIInput: data => write({ action:'submitAIInput', ...data }),
    listAIQueue: () => call({ action:'listAIQueue' }, { retries:0 }),
    extractOCRContent: uploadId => write({ action:'extractOCRContent', uploadId }),
    parseChapterStructure: uploadId => write({ action:'parseChapterStructure', uploadId }),
    detectInsideChapterQuestions: uploadId => write({ action:'detectInsideChapterQuestions', uploadId }),
    detectEndExerciseQuestions: uploadId => write({ action:'detectEndExerciseQuestions', uploadId }),
    generateAIContent: uploadId => write({ action:'generateAIContent', uploadId }),
    formatGeneratedContent: uploadId => write({ action:'formatGeneratedContent', uploadId }),
    fullExtractAndGenerate: uploadId => write({ action:'fullExtractAndGenerate', uploadId }),
    importStaticContent: importData => write(
      { action:'importStaticContent', importData, uploadedBy:'Admin' },
      { timeoutMs:Number(perf().STATIC_IMPORT_TIMEOUT_MS || 120000) }
    ),
    publishStaticImport: async uploadId => {
      const data = await write({ action:'publishStaticImport', uploadId, approvedBy:'Admin' }, { timeoutMs:Number(perf().STATIC_PUBLISH_TIMEOUT_MS || 60000) });
      if (data?.success !== false) clearReadCache();
      return data;
    },
    reviewContent: data => {
      const payload = (data && typeof data === 'object') ? { ...data } : { uploadId:data };
      return write({ action:'reviewContent', reviewedBy:'Admin', ...payload });
    },
    publishContent: async data => {
      const payload = (data && typeof data === 'object') ? { ...data } : { uploadId:data };
      const result = await write({ action:'publishContent', approvedBy:'Admin', ...payload });
      if (result?.success !== false) clearReadCache();
      return result;
    },
    getFeatureMap: (chapterId, forceRefresh=false) => read({ action:'getFeatureMap', chapterId }, ttl('FEATURE_MAP', 300000), forceRefresh),
    getLesson: (lessonId, forceRefresh=false) => read({ action:'getLesson', lessonId }, ttl('PUBLISHED_CONTENT', 600000), forceRefresh),
    getSolutions: (solutionSetId, chapterIdOrForceRefresh='', forceRefresh=false) => {
      const chapterId = typeof chapterIdOrForceRefresh === 'string' ? chapterIdOrForceRefresh : '';
      const refresh = typeof chapterIdOrForceRefresh === 'boolean' ? chapterIdOrForceRefresh : forceRefresh;
      return read({ action:'getSolutions', solutionSetId, chapterId }, ttl('PUBLISHED_CONTENT', 600000), refresh);
    },
    getMCQ: (mcqSetId, forceRefresh=false) => read({ action:'getMCQ', mcqSetId }, ttl('PUBLISHED_CONTENT', 600000), forceRefresh),
    getWorksheet: (worksheetSetId, forceRefresh=false) => read({ action:'getWorksheet', worksheetSetId }, ttl('PUBLISHED_CONTENT', 600000), forceRefresh)
  };
})();
