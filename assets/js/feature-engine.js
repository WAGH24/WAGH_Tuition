/* ============================================================================
   WAGH Tuition Classes — Feature Engine Frontend v1.0
   FILE: assets/js/feature-engine.js

   ROUTING PRIORITY
   ----------------
   1. Existing dynamic content handler
   2. Reusable dynamic enginePath
   3. Existing chapter-specific static URL fallback

   This preserves all current static pages while moving the project toward
   reusable API-driven engines.
============================================================================ */

const WTC_FEATURE_ENGINE = (() => {
  let registryPromise = null;

  const defaults = {
    accessLevel: 'PREMIUM',
    enabled: true,
    requiresLogin: true,
    saveProgress: false,
    resumeAllowed: false,
    logAccess: true,
    comingSoon: false,
    routingMode: 'HYBRID',
    enginePath: '',
    xpReward: 0,
    visible: true
  };


  function toBoolean(value, fallback) {
    if (value === true || value === false) return value;
    if (value === '' || value === null || value === undefined) return fallback;
    const v = String(value).trim().toLowerCase();
    if (['true','yes','1','active','enabled'].includes(v)) return true;
    if (['false','no','0','inactive','disabled'].includes(v)) return false;
    return fallback;
  }

  function normalizeDefinition(definition) {
    return {
      ...definition,
      enabled: toBoolean(definition.enabled, true),
      requiresLogin: toBoolean(definition.requiresLogin, true),
      saveProgress: toBoolean(definition.saveProgress, false),
      resumeAllowed: toBoolean(definition.resumeAllowed, false),
      logAccess: toBoolean(definition.logAccess, true),
      comingSoon: toBoolean(definition.comingSoon, false),
      visible: toBoolean(definition.visible, true),
      subscriptionRequired: toBoolean(definition.subscriptionRequired, false),
      displayOrder: Number(definition.displayOrder || 999),
      xpReward: Number(definition.xpReward || 0),
      unlockLevel: Number(definition.unlockLevel || 0),
      dailyLimit: Number(definition.dailyLimit || 0),
      cooldownMinutes: Number(definition.cooldownMinutes || 0)
    };
  }

  function normalizeId(value) {
    return String(value || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  function resolveFeatureId(feature) {
    if (feature && feature.featureId) return normalizeId(feature.featureId);

    const source = [
      feature && feature.featureName,
      feature && feature.name,
      feature && feature.type,
      feature && feature.url
    ].filter(Boolean).join(' ').toLowerCase();

    if (source.includes('solution')) return 'SOLUTION';
    if (source.includes('answer writing')) return 'ANSWER_WRITING';
    if (source.includes('digital lab')) return 'DIGITAL_LAB';
    if (source.includes('worksheet')) return 'WORKSHEET';
    if (source.includes('revision')) return 'REVISION';
    if (source.includes('notes')) return 'NOTES';
    if (source.includes('mcq') || source.includes('quiz') || source.includes('test')) return 'MCQ';
    if (source.includes('video')) return 'VIDEO';
    if (source.includes('activity')) return 'ACTIVITY';
    if (source.includes('lesson')) return 'LESSON';

    return normalizeId(
      (feature && (feature.featureName || feature.name || feature.type)) || 'FEATURE'
    );
  }

  async function loadRegistry(forceRefresh) {
    if (forceRefresh) registryPromise = null;

    if (!registryPromise) {
      registryPromise = WTC_API.getFeatureRegistry(Boolean(forceRefresh))
        .catch(error => {
          console.warn(
            'Feature registry unavailable. Existing static feature routing will remain active.',
            error.message
          );
          return { success: false, metadata: [], ui: [], rules: [] };
        });
    }

    return registryPromise;
  }

  function findById(list, featureId) {
    return (list || []).find(item => normalizeId(item.featureId) === featureId) || {};
  }

  async function getDefinition(feature) {
    const featureId = resolveFeatureId(feature || {});
    const registry = await loadRegistry(false);
    const metadata = findById(registry.metadata, featureId);
    const ui = findById(registry.ui, featureId);
    const rules = findById(registry.rules, featureId);

    return normalizeDefinition({
      ...defaults,
      ...metadata,
      ...ui,
      ...rules,
      featureId,
      featureName:
        metadata.featureName ||
        (feature && (feature.featureName || feature.name)) ||
        featureId,
      icon: ui.icon || (feature && feature.icon) || '🔗',
      xpReward: Number(rules.xpReward || 0)
    });
  }

  async function prepareFeatures(features) {
    const prepared = await Promise.all((features || []).map(async feature => {
      const definition = feature.__definition || await getDefinition(feature);
      return { ...feature, featureId: definition.featureId, __definition: definition };
    }));

    return prepared
      .filter(feature => feature.__definition.visible !== false)
      .sort((a, b) => a.__definition.displayOrder - b.__definition.displayOrder);
  }

  function showAccessPopup() {
    const oldPopup = document.getElementById('wtcAccessPopup');
    if (oldPopup) oldPopup.remove();

    const whatsappLink =
      (window.WTC_CONFIG && WTC_CONFIG.WHATSAPP_LINK) ||
      'https://wa.me/919537036383';

    document.body.insertAdjacentHTML('beforeend', `
      <div id="wtcAccessPopup" class="wtc-access-overlay">
        <div class="wtc-access-box">
          <h2>🔒 Full Access Required</h2>
          <p>Please contact <b>WAGH Tuition Classes</b> for full access.</p>
          <a class="wtc-whatsapp-btn" href="${whatsappLink}"
             target="_blank" rel="noopener">
            📱 Contact on WhatsApp
          </a>
          <button class="wtc-close-btn" type="button"
            onclick="document.getElementById('wtcAccessPopup').remove()">
            Close
          </button>
        </div>
      </div>
    `);
  }

  function showMessage(message, type) {
    if (typeof WTC_UI !== 'undefined' && WTC_UI.toast) {
      WTC_UI.toast(message, type || 'error');
      return;
    }
    alert(message);
  }

  function buildDynamicUrl(enginePath, context, definition) {
    const params = new URLSearchParams();
    const feature = context.feature || {};
    const subject = context.subject || {};
    const chapter = context.chapter || {};

    params.set('featureId', definition.featureId);
    if (feature.contentId) params.set('contentId', feature.contentId);
    if (chapter.chapterId || chapter.id) {
      params.set('chapterId', chapter.chapterId || chapter.id);
    }
    if (subject.subjectId || subject.id) {
      params.set('subjectId', subject.subjectId || subject.id);
    }

    const separator = enginePath.includes('?') ? '&' : '?';
    return enginePath + separator + params.toString();
  }

  async function logFeatureOpen(context, definition, destination) {
    if (!definition.logAccess) return;

    const user = context.user || {};
    await WTC_API.logAccess({
      userId: user.id || user.studentId,
      name: user.name,
      role: user.role,
      mobile: user.mobile,
      actionName: definition.featureName,
      url: destination || context.feature.url || context.feature.contentId || ''
    }).catch(() => {});
  }

  async function open(context) {
    const feature = context && context.feature;
    const user = context && context.user;
    if (!feature) return false;

    const definition = await getDefinition(feature);

    if (definition.visible === false) {
      showMessage('This feature is currently hidden.', 'error');
      return false;
    }

    if (!definition.enabled) {
      showMessage('This feature is currently disabled.', 'error');
      return false;
    }

    if (definition.comingSoon) {
      showMessage(definition.featureName + ' is coming soon.', 'error');
      return false;
    }

    if (String(definition.status || 'Active').toLowerCase() !== 'active') {
      showMessage(definition.featureName + ' is currently unavailable.', 'error');
      return false;
    }

    const userLevel = Number((user && user.level) || 0);
    if (definition.unlockLevel > userLevel) {
      showMessage('Unlocks at level ' + definition.unlockLevel + '.', 'error');
      return false;
    }

    if (definition.requiresLogin && !user) {
      window.location.href = WTC_CONFIG.LOGIN_PAGE;
      return false;
    }

    const studentType = String((user && user.studentType) || '')
      .trim()
      .toUpperCase();

    if (
      (String(definition.accessLevel || '').toUpperCase() === 'PREMIUM' ||
       definition.subscriptionRequired) &&
      studentType === 'GENERAL_STUDENT'
    ) {
      showAccessPopup();
      return false;
    }

    const routingMode = String(definition.routingMode || 'HYBRID').toUpperCase();
    const hasDynamicPayload = Boolean(
      feature.contentId || feature.dynamic === true || feature.type === 'dynamic'
    );

    /* Priority 1: Existing dynamic content handler. */
    if (
      routingMode !== 'STATIC' &&
      feature.type === 'dynamic' &&
      window.WTC_DYNAMIC_CONTENT
    ) {
      try {
        const opened = await WTC_DYNAMIC_CONTENT.openFeature({
          ...feature,
          featureId: definition.featureId
        });

        if (opened !== false) {
          await logFeatureOpen(
            context,
            definition,
            feature.contentId || 'dynamic-content'
          );
          return true;
        }
      } catch (error) {
        console.warn('Dynamic content handler failed.', error.message);
        if (routingMode === 'DYNAMIC') {
          showMessage(error.message || 'Dynamic content failed to open.', 'error');
          return false;
        }
      }
    }

    /* Priority 2: Reusable engine page with chapter/content parameters. */
    if (
      routingMode !== 'STATIC' &&
      definition.enginePath &&
      hasDynamicPayload
    ) {
      const dynamicUrl = buildDynamicUrl(definition.enginePath, context, definition);
      await logFeatureOpen(context, definition, dynamicUrl);
      window.location.href = dynamicUrl;
      return true;
    }

    /* Priority 3: Existing static chapter page fallback. */
    if (feature.url && feature.url !== '#') {
      await logFeatureOpen(context, definition, feature.url);
      window.location.href = feature.url;
      return true;
    }

    if (definition.enginePath && routingMode === 'DYNAMIC') {
      showMessage('Dynamic content is not available for this chapter yet.', 'error');
      return false;
    }

    showMessage('This feature is not available yet.', 'error');
    return false;
  }

  function clearCache() {
    registryPromise = null;
  }

  return {
    open,
    getDefinition,
    loadRegistry,
    clearCache,
    resolveFeatureId,
    prepareFeatures
  };
})();
