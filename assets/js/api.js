/* WAGH Tuition Classes — Runtime API client cumulative PCR1 */
const WTC_API = (() => {
  const inFlight = new Map();
  const memoryCache = new Map();
  const CACHE_PREFIX = 'wtc:runtime-cache:';

  function performanceConfig() {
    return (window.WTC_CONFIG && WTC_CONFIG.PERFORMANCE) || {};
  }

  function ttl(name, fallback) {
    return Number(performanceConfig().CACHE_TTL_MS?.[name] || fallback || 0);
  }

  function stableObject(value) {
    if (Array.isArray(value)) return value.map(stableObject);
    if (!value || typeof value !== 'object') return value;
    return Object.keys(value).sort().reduce((copy, key) => {
      if (value[key] !== undefined) copy[key] = stableObject(value[key]);
      return copy;
    }, {});
  }

  function requestIdentity(payload) {
    return JSON.stringify(stableObject(payload || {}));
  }

  function cacheKey(payload) {
    const version = performanceConfig().CACHE_VERSION || 'v1';
    return `${CACHE_PREFIX}${version}:${requestIdentity(payload)}`;
  }

  function readCache(payload, maxAgeMs, persistent) {
    const key = cacheKey(payload);
    let entry = memoryCache.get(key) || null;
    if (!entry && persistent) {
      try { entry = JSON.parse(localStorage.getItem(key) || 'null'); }
      catch (error) { entry = null; }
    }
    if (!entry || !entry.savedAt || (Date.now() - Number(entry.savedAt)) > maxAgeMs) {
      if (entry) clearCacheKey(key);
      return null;
    }
    memoryCache.set(key, entry);
    return entry.data;
  }

  function writeCache(payload, data, persistent) {
    const key = cacheKey(payload);
    const entry = { savedAt: Date.now(), data };
    memoryCache.set(key, entry);
    if (persistent) {
      try { localStorage.setItem(key, JSON.stringify(entry)); }
      catch (error) { /* Storage quota/private mode: memory cache still works. */ }
    }
    return data;
  }

  function clearCacheKey(key) {
    memoryCache.delete(key);
    try { localStorage.removeItem(key); } catch (error) {}
  }

  function clearCacheMatching(predicate) {
    [...memoryCache.keys()].forEach(key => { if (predicate(key)) clearCacheKey(key); });
    try {
      for (let index = localStorage.length - 1; index >= 0; index--) {
        const key = localStorage.key(index);
        if (key && key.startsWith(CACHE_PREFIX) && predicate(key)) localStorage.removeItem(key);
      }
    } catch (error) {}
  }

  function clearActions(actions) {
    const needles = (actions || []).map(action => `\"action\":\"${action}\"`);
    clearCacheMatching(key => needles.some(needle => key.includes(needle)));
  }

  function delay(ms) {
    return new Promise(resolve => window.setTimeout(resolve, ms));
  }

  async function fetchJson(payload, options={}) {
    if (!WTC_CONFIG.API_URL || WTC_CONFIG.API_URL.includes('PASTE')) {
      throw new Error('API URL is not set in assets/js/config.js');
    }

    const timeoutMs = Number(options.timeoutMs || performanceConfig().API_TIMEOUT_MS || 15000);
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? window.setTimeout(() => controller.abort(), timeoutMs) : null;

    try {
      const response = await fetch(WTC_CONFIG.API_URL, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        signal: controller?.signal,
        keepalive: Boolean(options.keepalive)
      });
      if (!response.ok) throw new Error(`API request failed (${response.status}).`);
      const text = await response.text();
      try { return JSON.parse(text); }
      catch (error) {
        console.error('API returned non-JSON:', text);
        throw new Error('API returned HTML instead of JSON. Check Apps Script deployment/version.');
      }
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('API request timed out. Please try again.');
      throw error;
    } finally {
      if (timer) window.clearTimeout(timer);
    }
  }

  async function raw(payload, options={}) {
    const key = requestIdentity(payload);
    if (options.dedupe !== false && inFlight.has(key)) return inFlight.get(key);

    const promise = (async () => {
      const retries = Math.max(0, Number(options.retries || 0));
      let lastError;
      for (let attempt = 0; attempt <= retries; attempt++) {
        try { return await fetchJson(payload, options); }
        catch (error) {
          lastError = error;
          if (attempt < retries) await delay(250 * (attempt + 1));
        }
      }
      throw lastError;
    })().finally(() => inFlight.delete(key));

    if (options.dedupe !== false) inFlight.set(key, promise);
    return promise;
  }

  async function fallback() {
    const response = await fetch(WTC_CONFIG.FALLBACK_CONTENT_URL, { cache: 'force-cache' });
    if (!response.ok) throw new Error('Fallback content is unavailable.');
    return response.json();
  }

  async function call(payload, fallbackKey=null) {
    try {
      const data = await raw(payload);
      if (data && data.success !== false) return data;
      throw new Error(data?.message || 'API failed');
    } catch (error) {
      console.warn('WTC API fallback:', error.message);
      if (!fallbackKey) throw error;
      const data = await fallback();
      return { success:true, [fallbackKey]:data[fallbackKey] || [] };
    }
  }

  async function read(payload, options={}) {
    const maxAgeMs = Math.max(0, Number(options.ttlMs || 0));
    if (!options.forceRefresh && maxAgeMs) {
      const cached = readCache(payload, maxAgeMs, options.persistent !== false);
      if (cached) return cached;
    }

    const retries = Number(options.retries ?? performanceConfig().READ_RETRY_COUNT ?? 1);
    try {
      const data = await raw(payload, { retries, dedupe:true });
      if (data && data.success === false) throw new Error(data.message || 'API failed');
      if (maxAgeMs) writeCache(payload, data, options.persistent !== false);
      return data;
    } catch (error) {
      if (!options.fallbackKey) throw error;
      const data = await fallback();
      const response = { success:true, [options.fallbackKey]:data[options.fallbackKey] || [] };
      if (maxAgeMs) writeCache(payload, response, options.persistent !== false);
      return response;
    }
  }

  function deviceId() {
    return window.WTC_AUTH?.deviceId ? WTC_AUTH.deviceId() : '';
  }

  function subjectPayload(student) {
    return {
      action:'getSubjects',
      studentId:student?.studentId || student?.id || '',
      board:student?.board || '',
      className:student?.className || student?.class || '',
      medium:student?.medium || ''
    };
  }

  function peekSubjects(student) {
    return readCache(subjectPayload(student), ttl('SUBJECTS', 900000), true);
  }

  async function getStudentBootstrap(student, forceRefresh=false) {
    const payload = {
      action:'getStudentBootstrap',
      studentId:student?.studentId || student?.id || '',
      board:student?.board || '',
      className:student?.className || student?.class || '',
      medium:student?.medium || ''
    };
    try {
      const data = await read(payload, {
        ttlMs:ttl('STUDENT_BOOTSTRAP', 30000),
        forceRefresh,
        persistent:false
      });
      if (Array.isArray(data.subjects)) {
        writeCache(subjectPayload(student), { success:true, subjects:data.subjects }, true);
      }
      return data;
    } catch (error) {
      // Compatibility bridge for an older runtime deployment.
      const [subjects, progress] = await Promise.all([
        getSubjects(student, forceRefresh),
        getStudentProgress(student?.studentId || student?.id || '', forceRefresh)
      ]);
      return { success:true, subjects:subjects.subjects || [], progress:progress.progress || { percent:0 }, compatibilityFallback:true };
    }
  }

  function progressPayload(studentOrParams, forceRefresh=false) {
    const source = (studentOrParams && typeof studentOrParams === 'object')
      ? studentOrParams
      : { studentId:studentOrParams };
    return {
      action:'getMCQProgressReport',
      studentId:source.studentId || source.id || '',
      board:source.board || '',
      className:source.className || source.class || '',
      medium:source.medium || '',
      forceRefresh:Boolean(forceRefresh)
    };
  }

  function clearStudentData(studentId) {
    const id = String(studentId || '');
    clearActions(['getStudentBootstrap','getStudentProgress','getMCQProgressReport']);
    if (id) clearCacheMatching(key => key.includes(id));
  }

  return {
    call,
    raw,
    peekSubjects,
    clearCache: () => clearCacheMatching(() => true),
    clearStudentData,
    login: (mobile,password,role='Student') => raw({ action:'login', mobile, password, role, deviceId:deviceId() }),
    signupStudent: (student) => raw({ action:'signupStudent', ...student, deviceId:deviceId() }),
    updateStudentProfile: async profile => {
      const data = await raw({ action:'updateStudentProfile', ...profile, deviceId:deviceId() }, {
        dedupe:false, retries:0, timeoutMs:Number(performanceConfig().WRITE_TIMEOUT_MS || 45000)
      });
      if (data?.success !== false) clearActions(['getStudentBootstrap','getSubjects','getChapters','getChapterFeatures']);
      return data;
    },
    changeStudentPassword: data => raw({
      action:'changeStudentPassword',
      ...data,
      deviceId:deviceId()
    }, {
      dedupe:false, retries:0, timeoutMs:Number(performanceConfig().WRITE_TIMEOUT_MS || 45000)
    }),
    createProfileChangeRequest: data => raw({
      action:'createProfileChangeRequest',
      ...data,
      deviceId:deviceId()
    }, {
      dedupe:false, retries:0, timeoutMs:Number(performanceConfig().WRITE_TIMEOUT_MS || 45000)
    }),
    getMyProfileChangeRequests: studentId => raw({
      action:'getMyProfileChangeRequests',
      studentId,
      deviceId:deviceId()
    }, { dedupe:true, retries:1 }),
    cancelProfileChangeRequest: data => raw({
      action:'cancelProfileChangeRequest',
      ...data,
      deviceId:deviceId()
    }, {
      dedupe:false, retries:0, timeoutMs:Number(performanceConfig().WRITE_TIMEOUT_MS || 45000)
    }),
    getProfileChangeRequests: (status='PENDING') => raw({
      action:'getProfileChangeRequests',
      status,
      deviceId:deviceId()
    }, { dedupe:true, retries:1 }),
    approveProfileChangeRequest: data => raw({
      action:'approveProfileChangeRequest',
      ...data,
      deviceId:deviceId()
    }, {
      dedupe:false, retries:0, timeoutMs:Number(performanceConfig().WRITE_TIMEOUT_MS || 45000)
    }),
    rejectProfileChangeRequest: data => raw({
      action:'rejectProfileChangeRequest',
      ...data,
      deviceId:deviceId()
    }, {
      dedupe:false, retries:0, timeoutMs:Number(performanceConfig().WRITE_TIMEOUT_MS || 45000)
    }),
    getStudentBootstrap,
    getSubjects: (student, forceRefresh=false) => read(subjectPayload(student), {
      ttlMs:ttl('SUBJECTS', 900000), forceRefresh, fallbackKey:'subjects', persistent:true
    }),
    getChapters: (params, forceRefresh=false) => read({ action:'getChapters', ...params }, {
      ttlMs:ttl('CHAPTERS', 900000), forceRefresh, fallbackKey:'chapters', persistent:true
    }),
    getChapterFeatures: (params, forceRefresh=false) => read({ action:'getChapterFeatures', ...params }, {
      ttlMs:ttl('CHAPTER_FEATURES', 300000), forceRefresh, fallbackKey:'features', persistent:true
    }),
    getFeatureRegistry: (forceRefresh=false) => read({ action:'getFeatureRegistry', forceRefresh:Boolean(forceRefresh) }, {
      ttlMs:ttl('FEATURE_REGISTRY', 300000), forceRefresh, persistent:true
    }),
    getStudentProgress: (studentId, forceRefresh=false) => read({ action:'getStudentProgress', studentId }, {
      ttlMs:ttl('PROGRESS', 10000), forceRefresh, persistent:false
    }),
    getMCQProgressReport: (studentOrParams, forceRefresh=false) => read(progressPayload(studentOrParams, forceRefresh), {
      ttlMs:ttl('MCQ_PROGRESS', 15000), forceRefresh, persistent:false
    }),
    saveMCQResult: async data => {
      const response = await raw({
        action:'saveStaticMCQResult',
        ...data,
        deviceId:data.deviceId || deviceId(),
        sourceType:data.sourceType || 'Dynamic MCQ'
      }, {
        dedupe:true, retries:0,
        timeoutMs:Number(performanceConfig().WRITE_TIMEOUT_MS || 45000)
      });
      if (response?.success !== false) clearStudentData(data.studentId);
      return response;
    },
    logAccess: data => raw({ action:'logAccess', ...data, deviceId:deviceId() }, {
      keepalive:true, dedupe:false, retries:0
    })
  };
})();
