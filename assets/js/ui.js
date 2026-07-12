const WTC_UI = (() => {
  function toast(message, type='success') {
    let box = document.getElementById('wtcToastBox');
    if (!box) { box = document.createElement('div'); box.id = 'wtcToastBox'; box.className = 'toast-box'; document.body.appendChild(box); }
    const item = document.createElement('div'); item.className = `toast ${type}`; item.textContent = message; box.appendChild(item);
    setTimeout(() => item.remove(), 3500);
  }
  function initials(name='User') { return String(name).trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase() || 'U'; }
  function escape(v='') { return String(v).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])); }
  function loadingHTML(text='Loading...') { return `<div class="empty-card">${escape(text)}</div>`; }
  return { toast, initials, escape, loadingHTML };
})();
