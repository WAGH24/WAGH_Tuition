const WTC_AUTH = (() => {
  function deviceId() { let id = localStorage.getItem(WTC_CONFIG.DEVICE_KEY); if (!id) { id = 'DEV-' + Math.random().toString(36).slice(2) + Date.now(); localStorage.setItem(WTC_CONFIG.DEVICE_KEY, id); } return id; }
  function normalizeUser(raw={}) {
    const role = raw.role || raw.userRole || 'Student';
    const id = raw.studentId || raw.teacherId || raw.adminId || raw.parentId || raw.id || '';
    return {
  ...raw,
  id,
  studentId: raw.studentId || (role === 'Student' ? id : ''),
  name: raw.name || raw.studentName || raw.teacherName || 'User',
  mobile: raw.mobile || '',
  role,
  board: raw.board || '',
  className: raw.className || raw.class || '',
  medium: raw.medium || '',
  status: raw.status || 'Active',
  studentType: raw.studentType || ''
};}
  function getUser() { try { return JSON.parse(localStorage.getItem(WTC_CONFIG.STORAGE_KEY) || sessionStorage.getItem(WTC_CONFIG.STORAGE_KEY) || 'null'); } catch { return null; } }
  function setUser(user) { const clean = normalizeUser(user); localStorage.setItem(WTC_CONFIG.STORAGE_KEY, JSON.stringify(clean)); sessionStorage.setItem(WTC_CONFIG.STORAGE_KEY, JSON.stringify(clean)); }
  function clearUser() { localStorage.removeItem(WTC_CONFIG.STORAGE_KEY); sessionStorage.removeItem(WTC_CONFIG.STORAGE_KEY); }
  function redirectByRole(user) {
  const role = String(user.role || 'Student').toLowerCase();

  let page = 'student.html';

  if (role === 'teacher') page = 'teacher.html';
  else if (role === 'admin') page = 'admin.html';
  else if (role === 'parent') page = 'parent.html';

  window.location.replace((WTC_CONFIG.BASE_URL || '/') + page);
  }
  function requireRole(role) { const user = getUser(); if (!user || String(user.role || '').toLowerCase() !== role.toLowerCase()) { location.href = WTC_CONFIG.LOGIN_PAGE; return null; } return normalizeUser(user); }
  async function handleLogin(formId='loginForm') { const form = document.getElementById(formId); const fd = Object.fromEntries(new FormData(form).entries()); const mobile = String(fd.mobile || '').trim(); const password = String(fd.password || '').trim(); const role = fd.role || 'Student'; if (!mobile || !password) return WTC_UI.toast('Please enter mobile and password.', 'error'); try { const data = await WTC_API.login(mobile,password,role); if (!data.success) return WTC_UI.toast(data.message || 'Login failed.', 'error'); setUser(data.user); WTC_UI.toast('Login successful.', 'success'); setTimeout(() => redirectByRole(normalizeUser(data.user)), 500); } catch (err) { WTC_UI.toast(err.message, 'error'); } }
  async function handleSignup(formId='signupForm') { const form = document.getElementById(formId); const fd = Object.fromEntries(new FormData(form).entries()); if (!fd.name || !fd.mobile || !fd.password) return WTC_UI.toast('Please fill required fields.', 'error'); try { const data = await WTC_API.signupStudent(fd); if (!data.success) return WTC_UI.toast(data.message || 'Signup failed.', 'error'); setUser(data.user); WTC_UI.toast('Account created successfully.', 'success'); setTimeout(() => redirectByRole(normalizeUser(data.user)), 500); } catch (err) { WTC_UI.toast(err.message, 'error'); } }
  function logout() { clearUser(); location.href = WTC_CONFIG.LOGIN_PAGE; }
  return { deviceId, normalizeUser, getUser, setUser, clearUser, redirectByRole, requireRole, handleLogin, handleSignup, logout };
})();
