/* =====================================================
   WAGH Tuition Classes
   Access Guard v1.0
===================================================== */

(() => {
  const access = String(
    window.WTC_PAGE_ACCESS || WTC_CONFIG.ACCESS.PUBLIC
  ).trim().toUpperCase();

  const user = WTC_AUTH.getUser();

  if (!user) {
    window.location.replace(WTC_CONFIG.LOGIN_PAGE);
    return;
  }

  if (String(user.status || '').trim().toLowerCase() !== 'active') {
    alert('Your account is inactive. Please contact WAGH Tuition Classes.');
    WTC_AUTH.logout();
    return;
  }

  const studentType = String(user.studentType || '').trim().toUpperCase();

  if (
    access === WTC_CONFIG.ACCESS.PREMIUM &&
    studentType === 'GENERAL_STUDENT'
  ) {
    document.body.innerHTML = `
      <div class="wtc-access-overlay">
        <div class="wtc-access-box">
          <h2>🔒 Full Access Required</h2>
          <p>
            This feature is available only for
            <b>WAGH Tuition Classes</b> students.
          </p>
          <a class="wtc-whatsapp-btn" href="${WTC_CONFIG.WHATSAPP_LINK}" target="_blank" rel="noopener noreferrer">
            📱 Contact on WhatsApp
          </a>
        </div>
      </div>
    `;
  }
})();
