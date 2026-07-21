window.WTC_CONFIG = {
  APP_NAME: 'WAGH Tuition Classes',
  API_URL: 'https://script.google.com/macros/s/AKfycbxVRRmp3rw9kPWlBNmS0px0Tce2HCEnU_epWJjnghooNJlxu5vdqJnKVuyKsRIDOEN0/exec',
  STORAGE_KEY: 'wtcUser',
  DEVICE_KEY: 'wtcDeviceId',
  FALLBACK_CONTENT_URL: 'assets/data/fallback-content.json',
  BASE_URL: '/WAGH_Tuition/',
  LOGIN_PAGE: '/WAGH_Tuition/index.html#login',
  WHATSAPP_NUMBER: '919537036383',
  WHATSAPP_LINK: 'https://wa.me/919537036383',
  PERFORMANCE: {
    CACHE_VERSION: 'stage1-si1-fv1-rp1-pcr1',
    API_TIMEOUT_MS: 15000,
    WRITE_TIMEOUT_MS: 45000,
    ASSESSMENT_TIMEOUT_MS: 18000,
    READ_RETRY_COUNT: 1,
    CACHE_TTL_MS: {
      SUBJECTS: 15 * 60 * 1000,
      CHAPTERS: 15 * 60 * 1000,
      CHAPTER_FEATURES: 5 * 60 * 1000,
      FEATURE_REGISTRY: 5 * 60 * 1000,
      STUDENT_BOOTSTRAP: 30 * 1000,
      PROGRESS: 10 * 1000,
      MCQ_PROGRESS: 15 * 1000,
      FEATURE_MAP: 5 * 60 * 1000,
      PUBLISHED_CONTENT: 10 * 60 * 1000
    }
  },
  ROLES: {
    STUDENT: 'Student',
    TEACHER: 'Teacher',
    ADMIN: 'Admin',
    PARENT: 'Parent'
  },
  ACCESS: {
    PUBLIC: 'PUBLIC',
    PREMIUM: 'PREMIUM'
  }
};
