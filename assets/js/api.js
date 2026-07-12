const WTC_API = (() => {
  async function raw(payload) {
  if (!WTC_CONFIG.API_URL || WTC_CONFIG.API_URL.includes('PASTE')) {
    throw new Error('API URL is not set in assets/js/config.js');
  }

  const res = await fetch(WTC_CONFIG.API_URL, {
    method: 'POST',
    redirect: 'follow',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8'
    },
    body: JSON.stringify(payload)
  });

  const text = await res.text();

  try {
    return JSON.parse(text);
  } catch (e) {
    console.error('API returned non-JSON:', text);
    throw new Error('API returned HTML instead of JSON. Check Apps Script deployment/version.');
  }
  }
  async function fallback() { const res = await fetch(WTC_CONFIG.FALLBACK_CONTENT_URL); return await res.json(); }
  async function call(payload, fallbackKey=null) {
    try { const data = await raw(payload); if (data && data.success !== false) return data; throw new Error(data.message || 'API failed'); }
    catch (err) { console.warn('WTC API fallback:', err.message); if (!fallbackKey) throw err; const f = await fallback(); return { success:true, [fallbackKey]: f[fallbackKey] || [] }; }
  }
  return {
    call,
    login: (mobile,password,role='Student') => raw({ action:'login', mobile, password, role, deviceId:WTC_AUTH.deviceId() }),
    signupStudent: (student) => raw({ action:'signupStudent', ...student, deviceId:WTC_AUTH.deviceId() }),
    updateStudentProfile: (profile) => raw({ action:'updateStudentProfile', ...profile, deviceId:WTC_AUTH.deviceId() }),
    getSubjects: (student) => call({ action:'getSubjects', ...student }, 'subjects'),
    getChapters: (params) => call({ action:'getChapters', ...params }, 'chapters'),
    getChapterFeatures: (params) => call({ action:'getChapterFeatures', ...params }, 'features'),
    getFeatureRegistry: (forceRefresh=false) => raw({ action:'getFeatureRegistry', forceRefresh }),
    getStudentProgress: (studentId) => call({ action:'getStudentProgress', studentId }, 'progress'),
    logAccess: (data) => raw({ action:'logAccess', ...data, deviceId:WTC_AUTH.deviceId() })
  };
})();
