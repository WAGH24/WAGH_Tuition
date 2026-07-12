/* =====================================================
   WAGH Tuition Classes
   Page Loader v1.0
   Loads config → auth → access guard
===================================================== */

(() => {
  const currentScript = document.currentScript;

  const accessLevel =
    (currentScript && currentScript.dataset.access) || "PUBLIC";

  window.WTC_PAGE_ACCESS = accessLevel;

  function getBasePath() {
    const src = currentScript.getAttribute("src") || "";
    return src.substring(0, src.lastIndexOf("/") + 1);
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Failed to load: " + src));
      document.head.appendChild(script);
    });
  }

  async function boot() {
    const basePath = getBasePath();

    if (!window.WTC_CONFIG) {
      await loadScript(basePath + "config.js");
    }

    if (typeof WTC_AUTH === 'undefined') {
      await loadScript(basePath + "auth.js");
    }

    await loadScript(basePath + "access-guard.js");
  }

  boot().catch(err => {
    console.error("WTC Page Loader Error:", err);
    alert("Website security system failed to load. Please refresh the page.");
  });
})();
