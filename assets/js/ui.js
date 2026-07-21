/* WTC shared UI helpers v1.1 — backward compatible */
const WTC_UI = (() => {
  const TOAST_DURATION = 3800;

  function toast(message, type='success') {
    let box = document.getElementById('wtcToastBox');
    if (!box) {
      box = document.createElement('div');
      box.id = 'wtcToastBox';
      box.className = 'toast-box';
      box.setAttribute('aria-live', 'polite');
      box.setAttribute('aria-atomic', 'false');
      document.body.appendChild(box);
    }

    const item = document.createElement('div');
    item.className = `toast ${type || 'success'}`;
    item.setAttribute('role', type === 'error' ? 'alert' : 'status');

    const copy = document.createElement('span');
    copy.textContent = String(message || '');
    item.appendChild(copy);

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'toast-close';
    close.setAttribute('aria-label', 'Dismiss notification');
    close.textContent = '×';
    close.addEventListener('click', () => item.remove());
    item.appendChild(close);

    box.appendChild(item);
    window.setTimeout(() => item.remove(), TOAST_DURATION);
    return item;
  }

  function initials(name='User') {
    return String(name).trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase() || 'U';
  }

  function escape(value='') {
    return String(value).replace(/[&<>"']/g, char => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;'
    }[char]));
  }

  function loadingHTML(text='Loading...') {
    return `<div class="empty-card" aria-busy="true"><span class="wtc-spinner" aria-hidden="true"></span>${escape(text)}</div>`;
  }

  function setBusy(button, busy, busyText='Working...') {
    if (!button) return;
    if (!button.dataset.originalText) button.dataset.originalText = button.textContent.trim();
    button.disabled = Boolean(busy);
    button.setAttribute('aria-busy', busy ? 'true' : 'false');
    button.textContent = busy ? busyText : button.dataset.originalText;
  }

  function setStatus(elementOrId, message='', type='') {
    const element = typeof elementOrId === 'string' ? document.getElementById(elementOrId) : elementOrId;
    if (!element) return;
    element.textContent = String(message || '');
    element.classList.remove('success', 'error', 'info');
    if (type) element.classList.add(type);
  }

  return { toast, initials, escape, loadingHTML, setBusy, setStatus };
})();
