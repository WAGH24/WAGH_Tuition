/* =====================================================
   WAGH Tuition Classes
   Core Bootstrap v1.0
   Optional loader for future protected content pages.
   Existing root pages may continue loading scripts directly.
===================================================== */

window.WTC_BOOTSTRAP = (() => {
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        if (existing.dataset.loaded === 'true') return resolve();
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.onload = () => {
        script.dataset.loaded = 'true';
        resolve();
      };
      script.onerror = () => reject(new Error('Failed to load: ' + src));
      document.head.appendChild(script);
    });
  }

  async function init(options = {}) {
    const currentScript = document.currentScript;
    const src = currentScript ? currentScript.getAttribute('src') || '' : '';
    const basePath = src.substring(0, src.lastIndexOf('/') + 1);
    const access = String(options.access || currentScript?.dataset.access || 'PUBLIC').toUpperCase();
    const includeApi = options.includeApi !== false;

    window.WTC_PAGE_ACCESS = access;

    if (!window.WTC_CONFIG) await loadScript(basePath + 'config.js');
    if (typeof WTC_AUTH === 'undefined') await loadScript(basePath + 'auth.js');
    if (includeApi && typeof WTC_API === 'undefined') await loadScript(basePath + 'api.js');
    await loadScript(basePath + 'access-guard.js');

    return true;
  }

  return { init };
})();
