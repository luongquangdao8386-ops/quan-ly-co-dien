/* =====================================================================
 * QUẢN LÝ CƠ ĐIỆN / 机电管理 — Frontend (PWA)
 * Phiên 1: đăng nhập PIN, thiết bị, quét QR, in tem, danh mục, mẫu kiểm tra,
 *          nhập Excel, nhật ký. Chạy trên GitHub Pages, dữ liệu qua Apps Script.
 * ===================================================================== */
'use strict';

// ⚠️ Dán URL Web app Apps Script (kết thúc bằng /exec) vào đây:
const API_URL = 'https://script.google.com/macros/s/AKfycbx0IuT4Ybp9jM_Pmzmh0NU4Ad9Heg8d3D0RVPL3jfe3fKUTVocFt1RkpwUWAw5-i7wD/exec';
// Link app trên GitHub Pages — mã QR trên tem trỏ về đây:
const APP_URL = 'https://luongquangdao8386-ops.github.io/quan-ly-co-dien/';
const APP_VERSION = '1.0.0';

const SCAN_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js';
const STOP_CODES = ['DUNG', 'DANGSUA'];
const STATUS_COLORS = ['CHAY', 'DUPHONG', 'DUNG', 'DANGSUA', 'NGUNG', 'THANHLY'];
const LS = {
  auth: 'qlcd_auth', cache: 'qlcd_cache', name: 'qlcd_ten', dev: 'qlcd_dev',
  role: 'qlcd_role', tem: 'qlcd_tem', filt: 'qlcd_filter'
};
const TB_FIELDS = ['MaNhaMay', 'TenMay', 'TenMayZH', 'NhomTB', 'ViTri', 'Hang', 'Model', 'SoSeri',
  'NamSuDung', 'CongSuatKW', 'ThongSo', 'TrangThai', 'LinkTaiLieu', 'GhiChu'];
// Khổ tem decal A4 21 tem (3 × 7), đơn vị mm
const LABEL = { cols: 3, rows: 7, w: 63.5, h: 38.1, top: 15.15, left: 7.25, gapX: 2.54, gapY: 0 };

const S = {
  auth: null, data: null, name: '', dev: '', online: navigator.onLine, syncing: false,
  f: { q: '', kv: '', nhom: '', tt: '_ACT' }, scroll: {}, lastHash: '', pendingId: null,
  form: null, scanner: null, scanBusy: false, tem: null, imp: null, mau: null,
  nk: { rows: [], total: 0, loading: false, q: '' }, installEvt: null, updating: false
};

/* ============================== TIỆN ÍCH ============================== */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
function esc(v) {
  return String(v === undefined || v === null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* đầy bộ nhớ hoặc chế độ riêng tư */ } }
function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* bỏ qua */ } }
function jparse(s, d) { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } }
function norm(v) {
  return String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9一-鿿]/g, '');
}
function fmtTime(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(s || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : String(s || '');
}
function fmtNum(v) {
  const n = Number(v);
  return v === '' || v === null || v === undefined || !isFinite(n) ? String(v || '') : n.toLocaleString('vi-VN');
}
function hhmm(d) { return d.toTimeString().slice(0, 5); }
function debounce(fn, ms) { let tm; return (...a) => { clearTimeout(tm); tm = setTimeout(() => fn(...a), ms); }; }
function isQL() { return S.auth && S.auth.role === 'QL'; }
function randId() {
  const a = new Uint8Array(12);
  (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach((_, i) => { a[i] = Math.random() * 256; });
  return 'd-' + Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
}
function loadScript(src) {
  return new Promise((ok, fail) => {
    if ($(`script[src="${src}"]`)) { ok(); return; }
    const s = document.createElement('script');
    s.src = src; s.async = true; s.onload = ok;
    s.onerror = () => { s.remove(); fail(new Error('load')); };
    document.head.appendChild(s);
  });
}

/* ----------------------------- Song ngữ ----------------------------- */

function tr(key, args) {
  const e = T[key];
  if (!e) { console.warn('Thiếu từ điển:', key); return { vi: key, zh: '' }; }
  const f = v => (typeof v === 'function' ? v.apply(null, args || []) : v);
  return { vi: f(e.vi), zh: f(e.zh) };
}
/** Khối song ngữ: tiếng Việt dòng trên, tiếng Trung dòng dưới. */
function bi(vi, zh, cls) {
  return `<span class="bi${cls ? ' ' + cls : ''}"><span class="vi">${esc(vi)}</span>` +
    (zh ? `<span class="zh">${esc(zh)}</span>` : '') + '</span>';
}
function t(key, ...a) { const x = tr(key, a); return bi(x.vi, x.zh); }
/** Chuỗi thuần "Việt / 中文" cho placeholder, title… */
function tp(key, ...a) { const x = tr(key, a); return x.zh ? `${x.vi} / ${x.zh}` : x.vi; }

/* ------------------------------ Biểu tượng ------------------------------ */

const IC = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  device: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h8"/><circle cx="12" cy="16" r="1.5"/>',
  qr: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z"/><path d="M14 14h3v3h-3zM20 14v1M14 20h1M17 17h3v3h-3"/>',
  work: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3"/>',
  more: '<rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  chev: '<path d="M9 5l7 7-7 7"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  print: '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  flash: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 17-5-5-9 8"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  logout: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l-5-5 5-5M5 12h11"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 16V5M7 10l5-5 5 5M5 20h14"/>',
  tag: '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  checklist: '<path d="M10 6h10M10 12h10M10 18h10"/><path d="m3 6 1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17"/>',
  log: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 3"/>',
  wrench: '<path d="M21 7a5 5 0 0 1-6.6 4.7L6 20a2.1 2.1 0 0 1-3-3l8.3-8.4A5 5 0 0 1 17 3l-3 3 1 3 3 1z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
  pulse: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17h.01"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  plug: '<path d="M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-12 0zM12 17v5"/>',
  monitor: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4M6 12l3-3 3 3 4-4"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M15 8l2 2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/>',
  camera: '<path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="4"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
  offline: '<path d="M3 3l18 18"/><path d="M8.5 6.2A6 6 0 0 1 17.7 10H18a4 4 0 0 1 2.3 7.3M17 18H7a5 5 0 0 1-1.6-9.7"/>',
  phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  map: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>'
};
function ic(name, cls) {
  return `<svg class="ic${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true">${IC[name] || ''}</svg>`;
}

/* =============================== API =============================== */

class AppError extends Error {
  constructor(code, extra) { super(code); this.code = code; this.extra = extra || null; }
}

async function api(action, data) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 45000);
  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, data: data || {}, token: S.auth ? S.auth.token : '', nguoi: S.name, device: S.dev }),
      signal: ctl.signal,
      redirect: 'follow'
    });
  } catch (e) {
    clearTimeout(timer);
    setOnline(false);
    throw new AppError(e.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK');
  }
  clearTimeout(timer);
  let j;
  try { j = await res.json(); } catch (e) { throw new AppError('BAD_RESPONSE'); }
  setOnline(true);
  if (!j.ok) {
    if (j.code === 'AUTH' && S.auth) { authExpired(); }
    throw new AppError(j.code || 'SERVER', j.extra || (j.msg ? { msg: j.msg } : null));
  }
  return j.data;
}

function errText(e) {
  const code = (e && e.code) || 'SERVER';
  const map = {
    NETWORK: 'eNetwork', TIMEOUT: 'eNetwork', AUTH: 'eAuth', FORBIDDEN: 'eForbidden', WRONG_PIN: 'eWrongPin',
    LOCKED: 'eLocked', PIN_NOT_SET: 'ePinNotSet', NOT_SETUP: 'eNotSetup', ALREADY_SETUP: 'eAlreadySetup',
    PIN_FORMAT: 'ePinFormat', CONFLICT: 'eConflict', NOT_FOUND: 'eNotFound', INVALID: 'eInvalid',
    BUSY: 'eBusy', TOO_MANY: 'eTooMany', NO_SHEET: 'eNoSheet'
  };
  const k = map[code] || 'eServer';
  const ex = (e && e.extra) || {};
  if (k === 'eLocked') return tr('eLocked', [Math.ceil((ex.wait || 300) / 60)]);
  if (k === 'eWrongPin' && ex.left !== null && ex.left !== undefined) return tr('eWrongPinLeft', [ex.left]);
  if (k === 'eServer' && ex.msg) { const x = tr('eServer'); return { vi: x.vi + ' (' + ex.msg + ')', zh: x.zh }; }
  return tr(k);
}
function errHtml(e) { const x = errText(e); return bi(x.vi, x.zh); }

function setOnline(v) {
  if (S.online === v) return;
  S.online = v;
  renderBanner();
  document.body.classList.toggle('is-offline', !v);
}

function authExpired() {
  S.auth = null;
  lsDel(LS.auth);
  stopScanner();
  toast('eAuth', 'warn');
  renderAuth();
}

/* ============================ DỮ LIỆU CỤC BỘ ============================ */

function saveCache() {
  if (!S.data) return;
  lsSet(LS.cache, JSON.stringify(S.data));
}
function dmList(loai, withInactive) {
  const arr = ((S.data && S.data.danhMuc) || []).filter(d => d.Loai === loai && (withInactive || isOn(d.DangDung)));
  return arr.sort((a, b) => (Number(a.ThuTu) || 0) - (Number(b.ThuTu) || 0) || String(a.TenVI).localeCompare(String(b.TenVI), 'vi'));
}
function dmGet(loai, ma) {
  return ((S.data && S.data.danhMuc) || []).find(d => d.Loai === loai && String(d.Ma).toUpperCase() === String(ma).toUpperCase()) || null;
}
function dmVi(loai, ma) { const d = dmGet(loai, ma); return d ? d.TenVI : (ma || ''); }
function dmZh(loai, ma) { const d = dmGet(loai, ma); return d ? d.TenZH : ''; }
function dmBi(loai, ma, cls) { return ma ? bi(dmVi(loai, ma), dmZh(loai, ma), cls) : '<span class="muted">—</span>'; }
function isOn(v) { return ['1', 'true', 'x', 'có', 'co', 'yes', 'y', 'on', '是'].includes(String(v).trim().toLowerCase()); }
function allTb() { return (S.data && S.data.thietBi) || []; }
function tbById(id) {
  const k = String(id || '').toUpperCase();
  return allTb().find(x => String(x.ID).toUpperCase() === k) || null;
}
function tbFind(q) {
  let k = String(q || '').trim().toUpperCase();
  if (/^\d{1,6}$/.test(k)) k = 'TB' + k.padStart(4, '0');
  return tbById(k) || allTb().find(x => x.MaNhaMay && String(x.MaNhaMay).toUpperCase() === k) || null;
}
function upsertTb(tb) {
  const arr = allTb();
  const i = arr.findIndex(x => x.ID === tb.ID);
  if (i >= 0) arr[i] = tb; else arr.push(tb);
  saveCache();
}
function statusCls(ma) { return STATUS_COLORS.includes(ma) ? 's-' + ma : 's-OTHER'; }
function pill(ma) { return `<span class="pill ${statusCls(ma)}">${dmBi('TRANGTHAI', ma)}</span>`; }
function qrUrl(id) { return APP_URL + '?id=' + encodeURIComponent(id); }

/* ================================ KHỞI ĐỘNG ================================ */

async function refresh(silent) {
  if (!S.auth || S.syncing) return;
  S.syncing = true;
  renderSync();
  try {
    const d = await api('bootstrap');
    S.data = {
      thietBi: d.thietBi, danhMuc: d.danhMuc, mauKiemTra: d.mauKiemTra, cauHinh: d.cauHinh,
      ktvSet: d.ktvSet, role: d.role, savedAt: new Date().toISOString()
    };
    if (S.auth.role !== d.role) { S.auth.role = d.role; lsSet(LS.auth, JSON.stringify(S.auth)); }
    saveCache();
    rerenderIfLive();
    if (!silent) toast('synced', 'ok');
  } catch (e) {
    if (e.code !== 'AUTH') {
      if (!silent || !S.data) toast(errText(e), 'err');
      if (!S.data) render();
    }
  } finally {
    S.syncing = false;
    renderSync();
    renderBanner();
  }
}

function init() {
  S.dev = lsGet(LS.dev) || randId();
  lsSet(LS.dev, S.dev);
  S.name = lsGet(LS.name) || '';
  S.auth = jparse(lsGet(LS.auth), null);
  if (S.auth && (!S.auth.token || (S.auth.exp < Date.now() && navigator.onLine))) { S.auth = null; lsDel(LS.auth); }
  S.data = jparse(lsGet(LS.cache), null);
  S.f = Object.assign(S.f, jparse(sessionStorage.getItem(LS.filt), {}));
  document.body.classList.toggle('is-offline', !S.online);

  // Mở từ mã QR: ?id=TB0001
  try {
    const u = new URL(location.href);
    const qid = u.searchParams.get('id');
    if (qid) {
      S.pendingId = qid.trim().toUpperCase();
      u.searchParams.delete('id');
      history.replaceState(null, '', u.pathname + (u.search || '') + (location.hash || ''));
    }
  } catch (e) { /* bỏ qua */ }

  bindGlobal();
  registerSW();

  if (!/^https:\/\/script\.google\.com\//.test(API_URL)) { renderNotConfigured(); return; }
  if (S.auth) {
    openPending();
    render();
    refresh(true);
  } else {
    renderAuth();
  }
}

function openPending() {
  if (!S.pendingId) return;
  location.hash = '#/tb/' + encodeURIComponent(S.pendingId);
  S.pendingId = null;
}

/* ============================ ĐĂNG NHẬP / PIN ============================ */

function authShell(inner) {
  document.body.classList.add('auth-mode');
  $('#view').innerHTML = `
    <div class="auth">
      <div class="auth-brand">
        <img src="icon-192.png" alt="" class="auth-logo">
        <div class="auth-title">${t('appName')}</div>
      </div>
      ${inner}
      <div class="auth-foot">v${APP_VERSION}</div>
    </div>`;
  $('#hdr').innerHTML = '';
  $('#tabs').innerHTML = '';
}

function renderNotConfigured() {
  authShell(`<div class="card pad">${ic('alert', 'ic-lg warn')}<p>${t('notConfigured')}</p><code class="code">const API_URL = '…/exec';</code></div>`);
}

async function renderAuth() {
  stopScanner();
  if (!navigator.onLine && !S.online) {
    authShell(`<div class="card pad center">${ic('offline', 'ic-lg')}<p>${t('needNetLogin')}</p>
      <button class="btn" data-act="retryAuth">${ic('refresh')}${t('retry')}</button></div>`);
    return;
  }
  authShell(`<div class="card pad center"><div class="spinner"></div><p class="muted">${t('connecting')}</p></div>`);
  try {
    const st = await api('status');
    if (!st.setup) renderSetup(); else renderLogin();
  } catch (e) {
    authShell(`<div class="card pad center">${ic('alert', 'ic-lg warn')}<p>${errHtml(e)}</p>
      <button class="btn" data-act="retryAuth">${ic('refresh')}${t('retry')}</button></div>`);
  }
}

function renderSetup() {
  authShell(`
    <form class="card pad form" id="f-setup" autocomplete="off">
      <h2 class="h2">${t('setupTitle')}</h2>
      <p class="muted small">${t('setupDesc')}</p>
      <label class="fld"><span class="lb">${t('yourName')}</span>
        <input name="name" value="${esc(S.name)}" maxlength="60" required placeholder="${esc(tp('yourNamePh'))}"></label>
      <label class="fld"><span class="lb">${t('pinQL')}</span>
        <input name="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="12" required autocomplete="new-password"></label>
      <label class="fld"><span class="lb">${t('pinConfirm')}</span>
        <input name="pin2" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="12" required autocomplete="new-password"></label>
      <div class="msg" id="setup-msg"></div>
      <button class="btn primary block" type="submit">${t('setupBtn')}</button>
    </form>`);
  $('#f-setup').addEventListener('submit', async ev => {
    ev.preventDefault();
    const f = ev.target;
    const name = f.name.value.trim(), pin = f.pin.value, pin2 = f.pin2.value;
    const msg = $('#setup-msg');
    if (name.length < 2) { msg.innerHTML = t('eNameReq'); return; }
    if (!/^\d{6,12}$/.test(pin)) { msg.innerHTML = t('ePinFormat'); return; }
    if (pin !== pin2) { msg.innerHTML = t('ePinMismatch'); return; }
    setName(name);
    busy(f, true);
    try {
      const r = await api('setupPin', { pin });
      loginDone(r);
      toast('setupOk', 'ok');
    } catch (e) {
      msg.innerHTML = errHtml(e);
    } finally { busy(f, false); }
  });
}

function renderLogin(msgHtml) {
  const role = lsGet(LS.role) === 'QL' ? 'QL' : 'KTV';
  authShell(`
    <form class="card pad form" id="f-login" autocomplete="off">
      <h2 class="h2">${t('loginTitle')}</h2>
      <div class="seg" role="radiogroup">
        <label><input type="radio" name="role" value="KTV" ${role === 'KTV' ? 'checked' : ''}><span>${t('roleKTV')}</span></label>
        <label><input type="radio" name="role" value="QL" ${role === 'QL' ? 'checked' : ''}><span>${t('roleQL')}</span></label>
      </div>
      <label class="fld"><span class="lb">${t('yourName')}</span>
        <input name="name" value="${esc(S.name)}" maxlength="60" required placeholder="${esc(tp('yourNamePh'))}"></label>
      <label class="fld"><span class="lb">${t('pin')}</span>
        <input name="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="12" required autocomplete="current-password" class="pin-input"></label>
      <div class="msg" id="login-msg">${msgHtml || ''}</div>
      <button class="btn primary block" type="submit">${t('loginBtn')}</button>
      <p class="muted small center">${t('loginHint')}</p>
    </form>`);
  const f = $('#f-login');
  if (S.name) f.pin.focus();
  f.addEventListener('submit', async ev => {
    ev.preventDefault();
    const role = f.role.value, name = f.name.value.trim(), pin = f.pin.value;
    const msg = $('#login-msg');
    if (name.length < 2) { msg.innerHTML = t('eNameReq'); return; }
    if (!pin) return;
    setName(name);
    lsSet(LS.role, role);
    busy(f, true);
    try {
      const r = await api('login', { role, pin });
      loginDone(r);
    } catch (e) {
      msg.innerHTML = errHtml(e);
      f.pin.value = '';
      f.pin.focus();
    } finally { busy(f, false); }
  });
}

function loginDone(r) {
  S.auth = { token: r.token, role: r.role, exp: r.exp };
  lsSet(LS.auth, JSON.stringify(S.auth));
  document.body.classList.remove('auth-mode');
  if (S.pendingId) openPending();
  else if (!location.hash || location.hash === '#' || location.hash === '#/') location.hash = '#/home';
  render();
  refresh(true);
}

function setName(n) {
  S.name = String(n || '').trim().slice(0, 60);
  lsSet(LS.name, S.name);
}

function logout() {
  S.auth = null;
  S.data = null;
  lsDel(LS.auth);
  lsDel(LS.cache);
  location.hash = '#/home';
  renderAuth();
}

/* ================================ KHUNG ================================ */

const TABS = [
  { id: 'home', icon: 'home', key: 'tabHome' },
  { id: 'tb', icon: 'device', key: 'tabTb' },
  { id: 'quet', icon: 'qr', key: 'tabScan', center: true },
  { id: 'cv', icon: 'work', key: 'tabWork' },
  { id: 'them', icon: 'more', key: 'tabMore' }
];

function route() {
  return location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(s => { try { return decodeURIComponent(s); } catch (e) { return s; } });
}

function render(keepScroll) {
  if (!S.auth) { renderAuth(); return; }
  document.body.classList.remove('auth-mode');
  stopScanner();
  const p = route();
  const name = p[0] || 'home';
  const v = VIEWS[name] || VIEWS.home;
  if (S.lastHash && !keepScroll) S.scroll[S.lastHash] = window.scrollY;
  const out = v(p);
  S.cur = { name, live: !!out.live, p };
  document.body.classList.toggle('no-ptr', !!out.noPtr);
  renderHeader(out);
  renderTabs(out.tab || name);
  renderBanner();
  $('#view').innerHTML = `<div class="page ${out.cls || ''}">${out.html}</div>`;
  if (out.after) out.after();
  const hash = location.hash;
  if (!keepScroll) window.scrollTo(0, out.restoreScroll ? (S.scroll[hash] || 0) : 0);
  if (hash !== S.lastHash) { S.prevHash = S.lastHash; S.lastHash = hash; }
}

function rerenderIfLive() {
  if (S.cur && S.cur.live && !$('.overlay.open')) {
    const y = window.scrollY;
    render(true);
    window.scrollTo(0, y);
  } else {
    renderSync();
  }
}

function renderHeader(out) {
  const title = out.title ? tr(out.title) : tr('appName');
  const left = out.back
    ? `<button class="hbtn" data-act="back" data-to="${esc(out.back)}" aria-label="${esc(tp('back'))}">${ic('back')}</button>`
    : `<img src="icon-192.png" alt="" class="hlogo">`;
  $('#hdr').innerHTML = `
    ${left}
    <div class="htitle">${bi(title.vi, title.zh)}</div>
    <span class="role-badge ${isQL() ? 'ql' : 'ktv'}">${isQL() ? t('roleQLShort') : t('roleKTVShort')}</span>
    <button class="hbtn sync" data-act="sync" aria-label="${esc(tp('refresh'))}">${ic('refresh')}</button>`;
  renderSync();
}

function renderSync() {
  const b = $('#hdr .sync');
  if (b) b.classList.toggle('spin', S.syncing);
}

function renderTabs(active) {
  $('#tabs').innerHTML = TABS.map(tb => `
    <a href="#/${tb.id}" class="tab${tb.center ? ' center' : ''}${active === tb.id ? ' on' : ''}">
      <span class="tic">${ic(tb.icon)}</span>${t(tb.key)}
    </a>`).join('');
}

function renderBanner() {
  const b = $('#banner');
  if (!b) return;
  if (!S.auth || S.online) { b.innerHTML = ''; b.className = ''; return; }
  const at = S.data && S.data.savedAt ? new Date(S.data.savedAt) : null;
  const when = at ? `${String(at.getDate()).padStart(2, '0')}/${String(at.getMonth() + 1).padStart(2, '0')} ${hhmm(at)}` : '—';
  b.className = 'offline-banner';
  b.innerHTML = `${ic('offline')}${t('offlineBanner', when)}`;
}

/* ------------------------------ Thông báo ------------------------------ */

function toast(keyOrObj, type) {
  const x = typeof keyOrObj === 'string' ? tr(keyOrObj) : keyOrObj;
  const el = document.createElement('div');
  el.className = 'toast ' + (type || '');
  el.innerHTML = bi(x.vi, x.zh);
  const box = $('#toasts');
  while (box.children.length >= 2) box.firstElementChild.remove(); // tối đa 2 thông báo cùng lúc
  box.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, type === 'err' ? 4500 : 2600);
}

function busy(form, on) {
  $$('button', form).forEach(b => { b.disabled = on; });
  const sb = $('button[type=submit], .btn.primary', form);
  if (sb) sb.classList.toggle('loading', on);
}

/* ------------------------------ Hộp thoại ------------------------------ */

function openSheet(html, opts) {
  opts = opts || {};
  const ov = $('#overlay');
  ov.innerHTML = `<div class="sheet ${opts.cls || ''}" role="dialog" aria-modal="true">${opts.noHandle ? '' : '<div class="handle"></div>'}${html}</div>`;
  ov.classList.add('open');
  document.body.classList.add('modal-open');
  S.sheetClose = opts.onClose || null;
  return $('.sheet', ov);
}
function closeSheet(val) {
  const ov = $('#overlay');
  if (!ov.classList.contains('open')) return;
  ov.classList.remove('open');
  document.body.classList.remove('modal-open');
  ov.innerHTML = '';
  const cb = S.sheetClose;
  S.sheetClose = null;
  if (cb) cb(val);
}

function confirmDlg(title, msg, opts) {
  opts = opts || {};
  return new Promise(res => {
    const T1 = typeof title === 'string' ? tr(title) : title;
    const M = msg ? (typeof msg === 'string' ? tr(msg) : msg) : null;
    const ok = tr(opts.ok || 'ok');
    openSheet(`
      <div class="dlg">
        <h3 class="h3">${bi(T1.vi, T1.zh)}</h3>
        ${M ? `<div class="dlg-msg">${bi(M.vi, M.zh)}</div>` : ''}
        <div class="row gap">
          <button class="btn block" data-act="dlgNo">${t('cancel')}</button>
          <button class="btn block ${opts.danger ? 'danger' : 'primary'}" data-act="dlgYes">${bi(ok.vi, ok.zh)}</button>
        </div>
      </div>`, { onClose: v => res(v === true), noHandle: true, cls: 'center-dlg' });
  });
}

/** Bảng chọn song ngữ: items [{v, vi, zh, sub}] → Promise<value | undefined> */
function picker(opts) {
  return new Promise(res => {
    const items = opts.items;
    const T1 = tr(opts.title);
    const list = q => {
      const n = norm(q);
      return items.filter(it => !n || norm(it.vi + ' ' + it.zh + ' ' + (it.v || '')).includes(n)).map(it => `
        <button class="pk-item${String(it.v) === String(opts.value) ? ' on' : ''}" data-act="pick" data-v="${esc(it.v)}">
          ${bi(it.vi, it.zh)}${it.sub ? `<span class="pk-sub">${esc(it.sub)}</span>` : ''}
          ${String(it.v) === String(opts.value) ? ic('check', 'pk-check') : ''}
        </button>`).join('') || `<div class="empty small">${t('noResult')}</div>`;
    };
    const sh = openSheet(`
      <div class="pk-head"><h3 class="h3">${bi(T1.vi, T1.zh)}</h3>
        <button class="hbtn" data-act="closeSheet">${ic('x')}</button></div>
      ${items.length > 8 ? `<div class="search sm">${ic('search')}<input type="search" id="pk-q" placeholder="${esc(tp('search'))}"></div>` : ''}
      <div class="pk-list">${list('')}</div>`, { onClose: v => res(v), cls: 'picker' });
    const q = $('#pk-q', sh);
    if (q) q.addEventListener('input', () => { $('.pk-list', sh).innerHTML = list(q.value); });
  });
}

/* ================================ MÀN HÌNH ================================ */

const VIEWS = {};

/* ------------------------------- Trang chủ ------------------------------- */

VIEWS.home = () => {
  if (!S.data) return loadingView();
  const tbs = allTb().filter(x => x.TrangThai !== 'THANHLY');
  const running = tbs.filter(x => x.TrangThai === 'CHAY').length;
  const stopped = tbs.filter(x => STOP_CODES.includes(x.TrangThai))
    .sort((a, b) => STOP_CODES.indexOf(a.TrangThai) - STOP_CODES.indexOf(b.TrangThai) || String(b.NgaySua).localeCompare(String(a.NgaySua)));
  const soon = [
    ['openTickets', 'wrench'], ['pmDue', 'calendar'], ['checkToday', 'checklist'],
    ['contractsDue', 'file'], ['energyMonth', 'flash'], ['leakAlert', 'alert']
  ];
  const warnKtv = isQL() && S.data.ktvSet === false;
  return {
    live: true,
    html: `
      ${warnKtv ? `<a class="notice warn" href="#/pin">${ic('key')}<div>${t('ktvPinMissing')}</div>${ic('chev')}</a>` : ''}
      <div class="stats">
        <a class="stat" href="#/tb" data-act="filterTo" data-tt="_ACT">${ic('device')}<b>${fmtNum(tbs.length)}</b>${t('statTotal')}</a>
        <a class="stat ok" href="#/tb" data-act="filterTo" data-tt="CHAY">${ic('pulse')}<b>${fmtNum(running)}</b>${t('statRunning')}</a>
        <a class="stat ${stopped.length ? 'bad' : ''}" href="#/tb" data-act="filterTo" data-tt="_STOP">${ic('alert')}<b>${fmtNum(stopped.length)}</b>${t('statStopped')}</a>
      </div>
      <section class="card">
        <div class="card-h">${ic('alert', stopped.length ? 'bad' : 'ok')}${t('stoppedTitle')}<span class="count">${stopped.length}</span></div>
        ${stopped.length ? `<div class="mini-list">${stopped.slice(0, 30).map(miniItem).join('')}</div>`
          : `<div class="empty ok">${ic('check')}${t('noStopped')}</div>`}
      </section>
      <div class="soon-grid">
        ${soon.map(s => `<div class="soon">${ic(s[1])}${t(s[0])}<span class="soon-tag">${t('comingSoon')}</span></div>`).join('')}
      </div>`
  };
};

function miniItem(tb) {
  return `<a class="mini ${statusCls(tb.TrangThai)}" href="#/tb/${encodeURIComponent(tb.ID)}">
    <div class="mini-main">
      <div class="mini-top"><span class="tb-id">${esc(tb.ID)}</span>${tb.MaNhaMay ? `<span class="tb-ma">${esc(tb.MaNhaMay)}</span>` : ''}</div>
      ${bi(tb.TenMay, tb.TenMayZH, 'tb-name')}
      ${dmBi('KHUVUC', tb.ViTri, 'meta')}
    </div>
    ${pill(tb.TrangThai)}
  </a>`;
}

function loadingView() {
  return { live: true, html: `<div class="card pad center"><div class="spinner"></div><p class="muted">${t('loading')}</p></div>` };
}

/* ------------------------------ Danh sách ------------------------------ */

function filteredTb(f) {
  f = f || S.f;
  const n = norm(f.q);
  return allTb().filter(x => {
    if (f.kv && x.ViTri !== f.kv) return false;
    if (f.nhom && x.NhomTB !== f.nhom) return false;
    if (f.tt === '_ACT' && x.TrangThai === 'THANHLY') return false;
    if (f.tt === '_STOP' && !STOP_CODES.includes(x.TrangThai)) return false;
    if (f.tt && f.tt[0] !== '_' && x.TrangThai !== f.tt) return false;
    if (n) {
      const hay = norm([x.ID, x.MaNhaMay, x.TenMay, x.TenMayZH, x.Hang, x.Model, x.SoSeri,
        dmVi('NHOMTB', x.NhomTB), dmVi('KHUVUC', x.ViTri)].join(' '));
      if (!hay.includes(n)) return false;
    }
    return true;
  }).sort((a, b) => String(a.ID).localeCompare(String(b.ID), 'en', { numeric: true }));
}

function saveFilter() { try { sessionStorage.setItem(LS.filt, JSON.stringify(S.f)); } catch (e) { /* bỏ qua */ } }

function ttOptions() {
  return [
    { v: '_ACT', vi: tr('ttActive').vi, zh: tr('ttActive').zh },
    { v: '_ALL', vi: tr('ttAll').vi, zh: tr('ttAll').zh },
    { v: '_STOP', vi: tr('ttStop').vi, zh: tr('ttStop').zh }
  ].concat(dmList('TRANGTHAI', true).map(d => ({ v: d.Ma, vi: d.TenVI, zh: d.TenZH })));
}
function filterLabel(kind) {
  if (kind === 'kv') return S.f.kv ? dmBi('KHUVUC', S.f.kv) : t('allAreas');
  if (kind === 'nhom') return S.f.nhom ? dmBi('NHOMTB', S.f.nhom) : t('allGroups');
  const o = ttOptions().find(x => x.v === S.f.tt) || ttOptions()[0];
  return bi(o.vi, o.zh);
}

VIEWS.tb = p => {
  if (p[1] && p[2] === 'sua') return viewForm(p[1]);
  if (p[1]) return viewDetail(p[1]);
  if (!S.data) return loadingView();
  return {
    live: true, restoreScroll: true, title: 'tabTb',
    html: `
      <div class="toolbar sticky">
        <div class="search">${ic('search')}<input type="search" id="q" value="${esc(S.f.q)}" placeholder="${esc(tp('searchTb'))}" autocomplete="off"></div>
        <div class="chips">
          <button class="chip${S.f.kv ? ' on' : ''}" data-act="pickFilter" data-k="kv">${ic('map')}${filterLabel('kv')}</button>
          <button class="chip${S.f.nhom ? ' on' : ''}" data-act="pickFilter" data-k="nhom">${ic('device')}${filterLabel('nhom')}</button>
          <button class="chip${S.f.tt !== '_ACT' ? ' on' : ''}" data-act="pickFilter" data-k="tt">${ic('filter')}${filterLabel('tt')}</button>
        </div>
      </div>
      <div class="list-bar">
        <span id="tb-count" class="muted"></span>
        <span class="sp"></span>
        ${(S.f.q || S.f.kv || S.f.nhom || S.f.tt !== '_ACT') ? `<button class="link" data-act="clearFilter">${t('clearFilter')}</button>` : ''}
      </div>
      <div class="actions-row">
        <button class="btn sm" data-act="temFromList">${ic('print')}${t('printLabels')}</button>
        <button class="btn sm" data-act="exportCsv">${ic('download')}${t('exportCsv')}</button>
        ${isQL() ? `<a class="btn sm" href="#/nhap">${ic('upload')}${t('importExcel')}</a>` : ''}
      </div>
      <div id="tb-list" class="tb-list"></div>
      ${isQL() ? `<a class="fab" href="#/tb-moi" aria-label="${esc(tp('addTb'))}">${ic('plus')}</a>` : ''}`,
    after: () => {
      drawTbList();
      $('#q').addEventListener('input', debounce(e => { S.f.q = e.target.value; saveFilter(); drawTbList(); }, 150));
    }
  };
};

function drawTbList() {
  const list = filteredTb();
  $('#tb-count').innerHTML = t('nDevices', list.length);
  const box = $('#tb-list');
  if (!list.length) {
    box.innerHTML = `<div class="empty">${ic('search')}${allTb().length ? t('noResult') : t('noDevicesYet')}</div>`;
    return;
  }
  box.innerHTML = list.map(tbItem).join('');
}

function tbItem(tb) {
  return `<a class="tb-item ${statusCls(tb.TrangThai)}" href="#/tb/${encodeURIComponent(tb.ID)}">
    <div class="tb-top"><span class="tb-id">${esc(tb.ID)}</span>${tb.MaNhaMay ? `<span class="tb-ma">${esc(tb.MaNhaMay)}</span>` : ''}<span class="sp"></span>${pill(tb.TrangThai)}</div>
    ${bi(tb.TenMay, tb.TenMayZH, 'tb-name')}
    ${bi([dmVi('NHOMTB', tb.NhomTB), dmVi('KHUVUC', tb.ViTri)].filter(Boolean).join(' · '),
    [dmZh('NHOMTB', tb.NhomTB), dmZh('KHUVUC', tb.ViTri)].filter(Boolean).join(' · '), 'meta')}
  </a>`;
}

/* ------------------------------ Chi tiết ------------------------------ */

function viewDetail(id) {
  const tb = tbById(id);
  if (!tb) {
    if (S.online && S.data) {
      setTimeout(() => fetchMissing(id), 0);
      return { title: 'tbDetail', back: 'tb', html: `<div class="card pad center"><div class="spinner"></div><p class="muted">${t('loading')}</p></div>` };
    }
    return { title: 'tbDetail', back: 'tb', html: `<div class="empty">${ic('search')}${t('tbNotFound', id)}</div>` };
  }
  const row = (key, val, raw) => `<div class="kv"><div class="k">${t(key)}</div><div class="v">${raw ? val : (val ? esc(val) : '<span class="muted">—</span>')}</div></div>`;
  const link = tb.LinkTaiLieu && /^https?:\/\//i.test(tb.LinkTaiLieu) ? tb.LinkTaiLieu : '';
  const hist = [['histRepair', 'wrench'], ['histPM', 'calendar'], ['histCheck', 'checklist'], ['histHours', 'clock']];
  return {
    live: true, title: 'tbDetail', back: 'tb',
    html: `
      <section class="card hero ${statusCls(tb.TrangThai)}">
        <div class="hero-main">
          <div class="hero-ids"><span class="tb-id big">${esc(tb.ID)}</span>${tb.MaNhaMay ? `<span class="tb-ma">${esc(tb.MaNhaMay)}</span>` : ''}</div>
          ${bi(tb.TenMay, tb.TenMayZH, 'hero-name')}
          <div class="hero-pill">${pill(tb.TrangThai)}</div>
        </div>
        <button class="hero-qr" data-act="showQr" data-id="${esc(tb.ID)}" aria-label="QR">${QR.svg(qrUrl(tb.ID), { margin: 1 })}</button>
      </section>
      <div class="actions-row">
        ${isQL() ? `<a class="btn" href="#/tb/${encodeURIComponent(tb.ID)}/sua">${ic('edit')}${t('edit')}</a>` : ''}
        <button class="btn" data-act="temOne" data-id="${esc(tb.ID)}">${ic('print')}${t('printLabel')}</button>
        ${link ? `<a class="btn" href="${esc(link)}" target="_blank" rel="noopener">${ic('doc')}${t('openDocs')}</a>` : ''}
      </div>
      <section class="card">
        <div class="card-h">${ic('info')}${t('info')}</div>
        ${row('fNhomTB', dmBi('NHOMTB', tb.NhomTB), true)}
        ${row('fViTri', dmBi('KHUVUC', tb.ViTri), true)}
        ${row('fHang', tb.Hang)}
        ${row('fModel', tb.Model)}
        ${row('fSoSeri', tb.SoSeri)}
        ${row('fNamSuDung', tb.NamSuDung)}
        ${row('fCongSuat', tb.CongSuatKW ? esc(fmtNum(tb.CongSuatKW)) + ' kW' : '', true)}
        ${tb.ThongSo ? `<div class="kv col"><div class="k">${t('fThongSo')}</div><div class="v pre">${esc(tb.ThongSo)}</div></div>` : ''}
        ${tb.GhiChu ? `<div class="kv col"><div class="k">${t('fGhiChu')}</div><div class="v pre">${esc(tb.GhiChu)}</div></div>` : ''}
        ${row('fLinkTaiLieu', link ? `<a href="${esc(link)}" target="_blank" rel="noopener" class="link">${t('openDocs')}</a>` : '', true)}
      </section>
      <section class="card">
        <div class="card-h">${ic('log')}${t('history')}</div>
        ${hist.map(h => `<div class="soon-row">${ic(h[1])}${t(h[0])}<span class="soon-tag">${t('comingSoon')}</span></div>`).join('')}
      </section>
      <p class="muted small audit">${t('createdBy', fmtTime(tb.NgayTao), tb.NguoiTao || '—')}<br>${t('updatedBy', fmtTime(tb.NgaySua), tb.NguoiSua || '—')}</p>`
  };
}

async function fetchMissing(id) {
  try {
    const r = await api('getThietBi', { id });
    upsertTb(r.tb);
  } catch (e) { /* hiển thị không tìm thấy */ }
  if (!tbById(id)) {
    $('#view .page').innerHTML = `<div class="empty">${ic('search')}${t('tbNotFound', id)}</div>`;
  } else if (route()[1] && route()[1].toUpperCase() === String(id).toUpperCase()) {
    render(true);
  }
}

/* -------------------------------- Biểu mẫu -------------------------------- */

VIEWS['tb-moi'] = () => viewForm(null);

function viewForm(id) {
  if (!isQL()) return forbiddenView('tb');
  const cur = id ? tbById(id) : null;
  if (id && !cur) return { title: 'tbDetail', back: 'tb', html: `<div class="empty">${t('tbNotFound', id)}</div>` };
  S.form = cur ? Object.assign({}, cur) : { TrangThai: 'CHAY', NhomTB: S.f.nhom || '', ViTri: S.f.kv || '' };
  S.formOrig = cur ? cur.NgaySua : undefined;
  const inp = (f, key, attrs) => `<label class="fld" data-fld="${f}"><span class="lb">${t(key)}</span>
      <input data-f="${f}" value="${esc(S.form[f] || '')}" ${attrs || ''}><span class="fe"></span></label>`;
  const pk = (f, key, loai) => `<div class="fld" data-fld="${f}"><span class="lb">${t(key)} <b class="req">*</b></span>
      <button type="button" class="select" data-act="pickField" data-f="${f}" data-loai="${loai}">${pickLabel(loai, S.form[f])}${ic('down')}</button><span class="fe"></span></div>`;
  return {
    title: cur ? 'editTb' : 'addTb', back: cur ? 'tb/' + cur.ID : 'tb', noPtr: true,
    html: `
      <form id="f-tb" class="form" autocomplete="off" novalidate>
        ${cur ? `<div class="card pad slim"><span class="tb-id big">${esc(cur.ID)}</span> <span class="muted small">${t('idFixed')}</span></div>`
          : `<div class="notice">${ic('info')}<div>${t('idAuto')}</div></div>`}
        <section class="card pad">
          <label class="fld" data-fld="TenMay"><span class="lb">${t('fTenMay')} <b class="req">*</b></span>
            <input data-f="TenMay" value="${esc(S.form.TenMay || '')}" maxlength="300" required><span class="fe"></span></label>
          ${inp('TenMayZH', 'fTenMayZH', 'maxlength="300" lang="zh"')}
          ${pk('NhomTB', 'fNhomTB', 'NHOMTB')}
          ${pk('ViTri', 'fViTri', 'KHUVUC')}
          ${pk('TrangThai', 'fTrangThai', 'TRANGTHAI')}
          ${inp('MaNhaMay', 'fMaNhaMay', 'maxlength="60" autocapitalize="characters"')}
        </section>
        <section class="card pad">
          <div class="grid2">
            ${inp('Hang', 'fHang', 'maxlength="100"')}
            ${inp('Model', 'fModel', 'maxlength="100"')}
            ${inp('SoSeri', 'fSoSeri', 'maxlength="100"')}
            ${inp('NamSuDung', 'fNamSuDung', 'inputmode="numeric" maxlength="4"')}
          </div>
          ${inp('CongSuatKW', 'fCongSuatKW', 'inputmode="decimal" maxlength="12"')}
          <label class="fld" data-fld="ThongSo"><span class="lb">${t('fThongSo')}</span>
            <textarea data-f="ThongSo" rows="3" maxlength="2000">${esc(S.form.ThongSo || '')}</textarea><span class="fe"></span></label>
          ${inp('LinkTaiLieu', 'fLinkTaiLieu', 'type="url" inputmode="url" maxlength="300" placeholder="https://drive.google.com/…"')}
          <label class="fld" data-fld="GhiChu"><span class="lb">${t('fGhiChu')}</span>
            <textarea data-f="GhiChu" rows="2" maxlength="2000">${esc(S.form.GhiChu || '')}</textarea><span class="fe"></span></label>
        </section>
        <section class="card pad">
          <label class="fld"><span class="lb">${t('doer')} <b class="req">*</b></span>
            <input id="f-doer" value="${esc(S.name)}" maxlength="60"></label>
        </section>
        <div class="form-actions">
          <a class="btn" href="#/${cur ? 'tb/' + encodeURIComponent(cur.ID) : 'tb'}">${t('cancel')}</a>
          <button class="btn primary" type="submit">${ic('check')}${t('save')}</button>
        </div>
      </form>`,
    after: () => { $('#f-tb').addEventListener('submit', saveTbForm); }
  };
}

function pickLabel(loai, ma) {
  return ma ? dmBi(loai, ma) : `<span class="muted">${t('choose')}</span>`;
}

function collectForm() {
  // Chỉ đọc ô nhập chữ; các ô chọn danh mục (nút) đã ghi thẳng vào S.form khi chọn
  $$('#f-tb input[data-f], #f-tb textarea[data-f]').forEach(el => { S.form[el.dataset.f] = el.value.trim(); });
  return S.form;
}

function fieldError(f, key) {
  const box = $(`#f-tb [data-fld="${f}"]`);
  if (!box) return;
  box.classList.add('has-err');
  $('.fe', box).innerHTML = t(key);
}

async function saveTbForm(ev) {
  ev.preventDefault();
  if (!needOnline()) return;
  const form = ev.target;
  const tb = collectForm();
  $$('#f-tb .has-err').forEach(el => { el.classList.remove('has-err'); $('.fe', el).innerHTML = ''; });
  const doer = $('#f-doer').value.trim();
  let bad = false;
  const err = (f, k) => { fieldError(f, k); bad = true; };
  if (!tb.TenMay) err('TenMay', 'eRequired');
  ['NhomTB', 'ViTri', 'TrangThai'].forEach(f => { if (!tb[f]) err(f, 'eRequired'); });
  if (tb.NamSuDung && !/^\d{4}$/.test(tb.NamSuDung)) err('NamSuDung', 'eYear');
  if (tb.CongSuatKW && !/^\d+([.,]\d+)?$/.test(tb.CongSuatKW.replace(/\s/g, ''))) err('CongSuatKW', 'eNumber');
  if (tb.LinkTaiLieu && !/^https?:\/\/\S+$/i.test(tb.LinkTaiLieu)) err('LinkTaiLieu', 'eLink');
  if (doer.length < 2) { toast('eNameReq', 'err'); bad = true; }
  if (bad) { const first = $('#f-tb .has-err'); if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
  setName(doer);
  if (tb.MaNhaMay) {
    const up = tb.MaNhaMay.toUpperCase();
    const dup = allTb().find(x => x.ID !== tb.ID && String(x.MaNhaMay || '').toUpperCase() === up);
    if (dup && !(await confirmDlg('dupMaTitle', tr('dupMaMsg', [up, dup.ID, dup.TenMay]), { ok: 'saveAnyway' }))) return;
  }
  const payload = { tb: {} };
  ['ID'].concat(TB_FIELDS).forEach(f => { payload.tb[f] = tb[f] || ''; });
  if (tb.ID) payload.ngaySuaCu = S.formOrig || '';
  busy(form, true);
  try {
    const r = await api('saveThietBi', payload);
    upsertTb(r.tb);
    toast('saved', 'ok');
    if (r.canhBao && r.canhBao.length) toast(tr('dupMaAfter', [r.canhBao.map(x => x.ID).join(', ')]), 'warn');
    const detail = '#/tb/' + encodeURIComponent(r.tb.ID);
    if (tb.ID && S.prevHash === detail) history.back(); // quay lại trang chi tiết đã mở trước đó
    else location.replace(detail);
  } catch (e) {
    if (e.code === 'INVALID' && e.extra && e.extra.errors) {
      e.extra.errors.forEach(x => fieldError(x.field, reasonKey(x.reason)));
      toast('eInvalid', 'err');
    } else if (e.code === 'CONFLICT') {
      const ex = e.extra || {};
      if (await confirmDlg('eConflict', tr('conflictMsg', [ex.nguoiSua || '?', fmtTime(ex.ngaySua)]), { ok: 'reload' })) {
        await refresh(true);
        render();
      }
    } else if (e.code !== 'AUTH') {
      toast(errText(e), 'err');
    }
  } finally { busy(form, false); }
}

function reasonKey(r) {
  return ({ REQUIRED: 'eRequired', INVALID_CODE: 'eCode', BAD_YEAR: 'eYear', BAD_NUMBER: 'eNumber', BAD_LINK: 'eLink',
    NOT_FOUND: 'eIdNotFound', DUPLICATE: 'eDupCode', BAD_CODE: 'eBadCode', SYSTEM_CODE: 'eSystemCode', MIN_GT_MAX: 'eMinMax' })[r] || 'eInvalid';
}

function needOnline() {
  if (!S.online) { toast('offlineNoEdit', 'warn'); return false; }
  return true;
}

function forbiddenView(back) {
  return { title: 'appName', back, html: `<div class="empty">${ic('lock')}${t('eForbidden')}</div>` };
}

/* -------------------------------- Quét QR -------------------------------- */

VIEWS.quet = () => ({
  title: 'scanTitle', noPtr: true, cls: 'scan-page',
  html: `
    <div class="scan-box">
      <div id="reader"></div>
      <div class="scan-msg" id="scan-msg"><div class="spinner light"></div>${t('cameraStarting')}</div>
      <div class="scan-frame" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
    </div>
    <div class="scan-tools">
      <button class="btn" id="btn-torch" data-act="torch" hidden>${ic('flash')}${t('torch')}</button>
      <label class="btn">${ic('image')}${t('scanImage')}<input type="file" accept="image/*" id="scan-file" hidden></label>
    </div>
    <form class="card pad manual" id="f-manual" autocomplete="off">
      <label class="fld"><span class="lb">${t('manualId')}</span>
        <div class="row gap"><input id="manual-q" placeholder="TB0001" autocapitalize="characters">
        <button class="btn primary" type="submit">${ic('search')}</button></div></label>
    </form>
    <div id="reader-file" hidden></div>`,
  after: () => {
    $('#f-manual').addEventListener('submit', ev => { ev.preventDefault(); openDevice($('#manual-q').value, false); });
    $('#scan-file').addEventListener('change', scanFromFile);
    startScanner();
  }
});

async function scanLib() {
  await loadScript(SCAN_LIB);
  const L = window.__Html5QrcodeLibrary__ || window;
  const H = L.Html5Qrcode || window.Html5Qrcode;
  const F = L.Html5QrcodeSupportedFormats || window.Html5QrcodeSupportedFormats;
  if (!H) throw new Error('lib');
  const cfg = { verbose: false, experimentalFeatures: { useBarCodeDetectorIfSupported: true } };
  if (F) cfg.formatsToSupport = [F.QR_CODE];
  return { H, cfg };
}

async function startScanner() {
  const msg = $('#scan-msg');
  S.scanBusy = false;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { msg.innerHTML = `${ic('camera')}${t('noCamera')}`; return; }
  let lib;
  try { lib = await scanLib(); } catch (e) { if (msg) msg.innerHTML = `${ic('offline')}${t('scanLibFail')}`; return; }
  if (!$('#reader')) return; // đã rời trang
  const token = Symbol('scan');
  S.scanToken = token;
  try {
    const sc = new lib.H('reader', lib.cfg);
    S.scanner = sc;
    // Không dùng qrbox: quét toàn khung hình (nhận mã từ xa tốt hơn), khung góc chỉ để ngắm.
    await sc.start({ facingMode: 'environment' }, { fps: 12 }, onScanned, () => {});
    if (S.scanToken !== token || !$('#reader')) {
      // Người dùng đã rời trang trong lúc camera đang khởi động → tắt ngay
      try { await sc.stop(); } catch (e) { /* bỏ qua */ }
      try { sc.clear(); } catch (e) { /* bỏ qua */ }
      if (S.scanner === sc) S.scanner = null;
      return;
    }
    if ($('#scan-msg')) $('#scan-msg').remove();
    try {
      const caps = sc.getRunningTrackCapabilities ? sc.getRunningTrackCapabilities() : null;
      if (caps && caps.torch) $('#btn-torch').hidden = false;
    } catch (e) { /* không có đèn */ }
  } catch (e) {
    S.scanner = null;
    const m = $('#scan-msg');
    if (m) m.innerHTML = `${ic('camera')}${t(/NotAllowed|Permission/i.test(String(e && (e.name || e))) ? 'cameraDenied' : 'cameraError')}`;
  }
}

async function stopScanner() {
  const sc = S.scanner;
  S.scanner = null;
  S.scanToken = null;
  S.torchOn = false;
  if (!sc) return;
  try { await sc.stop(); } catch (e) { /* đã dừng */ }
  try { sc.clear(); } catch (e) { /* bỏ qua */ }
}

function parseScanned(text) {
  const s = String(text || '').trim();
  try {
    const u = new URL(s);
    const id = u.searchParams.get('id');
    if (id) return id;
  } catch (e) { /* không phải URL */ }
  const m = /\bTB\d{3,}\b/i.exec(s);
  return m ? m[0] : s;
}

function onScanned(text) {
  if (S.scanBusy) return;
  S.scanBusy = true;
  if (navigator.vibrate) navigator.vibrate(60);
  openDevice(parseScanned(text), true);
}

async function openDevice(q, fromCamera) {
  q = String(q || '').trim();
  if (!q) { S.scanBusy = false; return; }
  let tb = tbFind(q);
  if (!tb && S.online) {
    try { const r = await api('getThietBi', { id: q }); upsertTb(r.tb); tb = r.tb; } catch (e) { /* không có */ }
  }
  if (tb) {
    await stopScanner();
    location.hash = '#/tb/' + encodeURIComponent(tb.ID);
  } else {
    toast(tr('tbNotFound', [q]), 'err');
    setTimeout(() => { S.scanBusy = false; }, fromCamera ? 1500 : 0);
  }
}

async function scanFromFile(ev) {
  const file = ev.target.files && ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  let lib;
  try { lib = await scanLib(); } catch (e) { toast('scanLibFail', 'err'); return; }
  const h = new lib.H('reader-file', lib.cfg);
  try {
    const text = await h.scanFile(file, false);
    openDevice(parseScanned(text), false);
  } catch (e) {
    toast('noQrInImage', 'err');
  } finally {
    try { h.clear(); } catch (e) { /* bỏ qua */ }
  }
}

async function toggleTorch() {
  if (!S.scanner) return;
  S.torchOn = !S.torchOn;
  try {
    await S.scanner.applyVideoConstraints({ advanced: [{ torch: S.torchOn }] });
    $('#btn-torch').classList.toggle('on', S.torchOn);
  } catch (e) { S.torchOn = false; }
}

/* ------------------------------ Công việc ------------------------------ */

VIEWS.cv = () => ({
  title: 'tabWork', live: true,
  html: `
    <div class="menu">
      ${[['repairTickets', 'wrench', 'repairDesc'], ['pmPlan', 'calendar', 'pmDesc'], ['shiftCheck', 'checklist', 'checkDesc'], ['runHours', 'clock', 'hoursDesc']]
      .map(m => `<div class="menu-item soon-item">${ic(m[1], 'mi')}<div class="mi-text">${t(m[0])}<span class="mi-desc">${t(m[2])}</span></div><span class="soon-tag">${t('comingSoon')}</span></div>`).join('')}
    </div>`
});

/* -------------------------------- Thêm -------------------------------- */

VIEWS.them = () => {
  const mods = [['contracts', 'file'], ['predictive', 'pulse'], ['rca', 'help'], ['reports', 'chart'],
    ['energy', 'flash'], ['circuits', 'plug'], ['monitoring', 'monitor']];
  const set = [
    { href: '#/dm', icon: 'tag', key: 'catalogs' },
    { href: '#/mau', icon: 'checklist', key: 'checkTemplates' },
    { href: '#/tem', icon: 'print', key: 'printLabels', act: 'temBlank' },
    isQL() && { href: '#/nhap', icon: 'upload', key: 'importExcel' },
    isQL() && { href: '#/pin', icon: 'key', key: 'changePin' },
    isQL() && { href: '#/nk', icon: 'log', key: 'auditLog' }
  ].filter(Boolean);
  const standalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
  return {
    title: 'tabMore', live: true,
    html: `
      <section class="card user-card">
        ${ic('user', 'ic-lg')}
        <div class="grow"><div class="uname">${esc(S.name || '—')}</div>${isQL() ? t('roleQL') : t('roleKTV')}</div>
        <button class="btn sm" data-act="editName">${ic('edit')}${t('changeName')}</button>
      </section>
      <h4 class="sec-h">${t('modules')}</h4>
      <div class="menu">
        ${mods.map(m => `<div class="menu-item soon-item">${ic(m[1], 'mi')}<div class="mi-text">${t(m[0])}</div><span class="soon-tag">${t('comingSoon')}</span></div>`).join('')}
      </div>
      <h4 class="sec-h">${t('settings')}</h4>
      <div class="menu">
        ${set.map(m => `<a class="menu-item" href="${m.href}" ${m.act ? `data-act="${m.act}"` : ''}>${ic(m.icon, 'mi')}<div class="mi-text">${t(m.key)}</div>${ic('chev', 'mi-chev')}</a>`).join('')}
        ${!standalone && S.installEvt ? `<button class="menu-item" data-act="install">${ic('phone', 'mi')}<div class="mi-text">${t('installApp')}</div>${ic('chev', 'mi-chev')}</button>` : ''}
        <button class="menu-item danger" data-act="logout">${ic('logout', 'mi')}<div class="mi-text">${t('logout')}</div></button>
      </div>
      ${!standalone && /iphone|ipad|ipod/i.test(navigator.userAgent) ? `<p class="muted small center">${t('iosInstall')}</p>` : ''}
      <p class="muted small center">${t('appName')} · v${APP_VERSION}</p>`
  };
};

/* ------------------------------ Danh mục ------------------------------ */

const DM_TABS = [['KHUVUC', 'dmKhuVuc'], ['NHOMTB', 'dmNhomTB'], ['TRANGTHAI', 'dmTrangThai']];

VIEWS.dm = p => {
  if (!S.data) return loadingView();
  const loai = DM_TABS.some(x => x[0] === p[1]) ? p[1] : 'KHUVUC';
  const field = { KHUVUC: 'ViTri', NHOMTB: 'NhomTB', TRANGTHAI: 'TrangThai' }[loai];
  const used = {};
  allTb().forEach(x => { used[x[field]] = (used[x[field]] || 0) + 1; });
  const items = dmList(loai, true);
  return {
    title: 'catalogs', back: 'them', live: true,
    html: `
      <div class="seg tabs3">${DM_TABS.map(x => `<a href="#/dm/${x[0]}" class="${x[0] === loai ? 'on' : ''}">${t(x[1])}</a>`).join('')}</div>
      ${isQL() ? '' : `<div class="notice">${ic('lock')}<div>${t('readOnlyKTV')}</div></div>`}
      <div class="dm-list">
        ${items.map(d => `
          <button class="dm-item${isOn(d.DangDung) ? '' : ' off'}" ${isQL() ? `data-act="editDm" data-loai="${loai}" data-ma="${esc(d.Ma)}"` : 'disabled'}>
            ${loai === 'TRANGTHAI' ? `<span class="dot ${statusCls(d.Ma)}"></span>` : ''}
            <div class="grow">${bi(d.TenVI, d.TenZH)}</div>
            <span class="dm-code">${esc(d.Ma)}</span>
            <span class="dm-used">${t('nUsed', used[d.Ma] || 0)}</span>
            ${isOn(d.DangDung) ? '' : `<span class="tag-off">${t('inactive')}</span>`}
          </button>`).join('')}
      </div>
      ${isQL() ? `<button class="btn primary block" data-act="addDm" data-loai="${loai}">${ic('plus')}${t('addItem')}</button>` : ''}`
  };
};

function dmEditor(loai, ma) {
  const cur = ma ? dmGet(loai, ma) : null;
  const d = cur || { Loai: loai, Ma: '', TenVI: '', TenZH: '', ThuTu: '', DangDung: '1' };
  const sys = loai === 'TRANGTHAI' && cur && STATUS_COLORS.includes(cur.Ma);
  const sh = openSheet(`
    <form id="f-dm" class="form" autocomplete="off">
      <div class="pk-head"><h3 class="h3">${t(cur ? 'editItem' : 'addItem')}</h3><button type="button" class="hbtn" data-act="closeSheet">${ic('x')}</button></div>
      <label class="fld"><span class="lb">${t('nameVI')} <b class="req">*</b></span><input name="TenVI" value="${esc(d.TenVI)}" maxlength="100" required></label>
      <label class="fld"><span class="lb">${t('nameZH')}</span><input name="TenZH" value="${esc(d.TenZH)}" maxlength="100" lang="zh"></label>
      <div class="grid2">
        <label class="fld"><span class="lb">${t('code')}</span><input name="Ma" value="${esc(d.Ma)}" ${cur ? 'readonly' : ''} maxlength="20" autocapitalize="characters" placeholder="${esc(tp('autoCode'))}"></label>
        <label class="fld"><span class="lb">${t('order')}</span><input name="ThuTu" value="${esc(d.ThuTu)}" inputmode="numeric" maxlength="4"></label>
      </div>
      <label class="switch"><input type="checkbox" name="DangDung" ${isOn(d.DangDung) ? 'checked' : ''} ${sys ? 'disabled' : ''}><span class="sw"></span>${t('active')}</label>
      ${sys ? `<p class="muted small">${t('systemStatus')}</p>` : ''}
      ${cur ? `<p class="muted small">${t('codeFixed')}</p>` : ''}
      <div class="msg" id="dm-msg"></div>
      <button class="btn primary block" type="submit">${ic('check')}${t('save')}</button>
    </form>`);
  $('#f-dm', sh).addEventListener('submit', async ev => {
    ev.preventDefault();
    if (!needOnline()) return;
    const f = ev.target;
    const item = {
      isNew: !cur, Loai: loai, Ma: f.Ma.value.trim().toUpperCase(), TenVI: f.TenVI.value.trim(), TenZH: f.TenZH.value.trim(),
      ThuTu: f.ThuTu.value.trim(), DangDung: f.DangDung.checked || sys ? '1' : '0'
    };
    if (!item.TenVI) { $('#dm-msg').innerHTML = t('eRequired'); return; }
    busy(f, true);
    try {
      const r = await api('saveDanhMuc', { item });
      S.data.danhMuc = r.danhMuc;
      saveCache();
      closeSheet();
      toast('saved', 'ok');
      render(true);
    } catch (e) {
      $('#dm-msg').innerHTML = e.code === 'INVALID' && e.extra ? e.extra.errors.map(x => t(reasonKey(x.reason))).join('') : errHtml(e);
    } finally { busy(f, false); }
  });
}

/* ---------------------------- Mẫu kiểm tra ---------------------------- */

function mauOf(nhom) {
  return ((S.data && S.data.mauKiemTra) || []).filter(m => String(m.NhomTB).toUpperCase() === nhom)
    .sort((a, b) => (Number(a.STT) || 0) - (Number(b.STT) || 0));
}

VIEWS.mau = p => {
  if (!S.data) return loadingView();
  if (p[1]) return viewMauEdit(p[1].toUpperCase());
  const groups = [{ Ma: 'CHUNG', TenVI: tr('generalTpl').vi, TenZH: tr('generalTpl').zh }].concat(dmList('NHOMTB'));
  return {
    title: 'checkTemplates', back: 'them', live: true,
    html: `
      <div class="notice">${ic('info')}<div>${t('mauIntro')}</div></div>
      <div class="menu">
        ${groups.map(g => {
          const items = mauOf(g.Ma);
          const on = items.filter(x => isOn(x.DangDung)).length;
          const sub = items.length ? t('nItems', on) : (g.Ma === 'CHUNG' ? t('nItems', 0) : t('usesGeneral'));
          return `<a class="menu-item" href="#/mau/${encodeURIComponent(g.Ma)}">
            <div class="mi-text">${bi(g.TenVI, g.TenZH)}<span class="mi-desc${items.length ? '' : ' muted'}">${sub}</span></div>${ic('chev', 'mi-chev')}</a>`;
        }).join('')}
      </div>`
  };
};

function viewMauEdit(nhom) {
  const name = nhom === 'CHUNG' ? tr('generalTpl') : { vi: dmVi('NHOMTB', nhom), zh: dmZh('NHOMTB', nhom) };
  if (!S.mau || S.mau.nhom !== nhom) {
    S.mau = { nhom, items: mauOf(nhom).map(m => Object.assign({}, m)), dirty: false };
  }
  const ro = !isQL();
  return {
    title: 'checkTemplates', back: 'mau', noPtr: !ro,
    html: `
      <div class="card pad slim">${bi(name.vi, name.zh, 'h3')}</div>
      ${!S.mau.items.length && nhom !== 'CHUNG' ? `<div class="notice">${ic('info')}<div>${t('usesGeneralLong')}</div></div>` : ''}
      <div id="mau-list">${drawMauItems(ro)}</div>
      ${ro ? '' : `
        <button class="btn block" data-act="mauAdd">${ic('plus')}${t('addCheckItem')}</button>
        <div class="form-actions">
          <button class="btn" data-act="mauReset">${t('cancel')}</button>
          <button class="btn primary" data-act="mauSave">${ic('check')}${t('save')}</button>
        </div>`}`,
    after: () => {
      const box = $('#mau-list');
      box.addEventListener('input', e => {
        const el = e.target.closest('[data-mf]');
        if (!el) return;
        const it = S.mau.items[Number(el.dataset.i)];
        it[el.dataset.mf] = el.type === 'checkbox' ? (el.checked ? '1' : '0') : el.value;
        S.mau.dirty = true;
      });
      box.addEventListener('change', e => {
        const el = e.target.closest('[data-kieu]');
        if (!el) return;
        S.mau.items[Number(el.dataset.i)].KieuNhap = el.value;
        S.mau.dirty = true;
        box.innerHTML = drawMauItems(false);
      });
    }
  };
}

function drawMauItems(ro) {
  const items = S.mau.items;
  if (!items.length) return `<div class="empty small">${t('noCheckItems')}</div>`;
  if (ro) {
    return `<div class="card">${items.map((it, i) => `
      <div class="mau-ro${isOn(it.DangDung) ? '' : ' off'}">
        <span class="mau-no">${i + 1}</span>
        <div class="grow">${bi(it.HangMucVI, it.HangMucZH)}</div>
        <span class="mau-kind">${it.KieuNhap === 'SO' ? bi(tr('kindNum').vi + (it.DonVi ? ' (' + it.DonVi + ')' : ''), tr('kindNum').zh) + (it.Min || it.Max ? `<span class="small muted">${esc(it.Min || '…')} – ${esc(it.Max || '…')}</span>` : '') : t('kindPass')}</span>
      </div>`).join('')}</div>`;
  }
  return items.map((it, i) => `
    <div class="card pad mau-item${isOn(it.DangDung) ? '' : ' off'}">
      <div class="mau-head">
        <span class="mau-no">${i + 1}</span>
        <span class="sp"></span>
        <button class="hbtn sm" data-act="mauMove" data-i="${i}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="up">${ic('up')}</button>
        <button class="hbtn sm" data-act="mauMove" data-i="${i}" data-d="1" ${i === items.length - 1 ? 'disabled' : ''} aria-label="down">${ic('down')}</button>
        <button class="hbtn sm danger" data-act="mauDel" data-i="${i}" aria-label="delete">${ic('trash')}</button>
      </div>
      <label class="fld"><span class="lb">${t('itemVI')} <b class="req">*</b></span><input data-mf="HangMucVI" data-i="${i}" value="${esc(it.HangMucVI)}" maxlength="200"></label>
      <label class="fld"><span class="lb">${t('itemZH')}</span><input data-mf="HangMucZH" data-i="${i}" value="${esc(it.HangMucZH)}" maxlength="200" lang="zh"></label>
      <div class="seg">
        <label><input type="radio" name="k${i}" value="DAT" data-kieu data-i="${i}" ${it.KieuNhap !== 'SO' ? 'checked' : ''}><span>${t('kindPass')}</span></label>
        <label><input type="radio" name="k${i}" value="SO" data-kieu data-i="${i}" ${it.KieuNhap === 'SO' ? 'checked' : ''}><span>${t('kindNum')}</span></label>
      </div>
      ${it.KieuNhap === 'SO' ? `<div class="grid3">
        <label class="fld"><span class="lb">${t('unit')}</span><input data-mf="DonVi" data-i="${i}" value="${esc(it.DonVi)}" maxlength="20"></label>
        <label class="fld"><span class="lb">${t('min')}</span><input data-mf="Min" data-i="${i}" value="${esc(it.Min)}" inputmode="decimal" maxlength="12"></label>
        <label class="fld"><span class="lb">${t('max')}</span><input data-mf="Max" data-i="${i}" value="${esc(it.Max)}" inputmode="decimal" maxlength="12"></label>
      </div>` : ''}
      <label class="switch"><input type="checkbox" data-mf="DangDung" data-i="${i}" ${isOn(it.DangDung) ? 'checked' : ''}><span class="sw"></span>${t('active')}</label>
    </div>`).join('');
}

async function mauSave() {
  if (!needOnline()) return;
  const items = S.mau.items;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!String(it.HangMucVI || '').trim()) { toast(tr('eItemReq', [i + 1]), 'err'); return; }
    if (it.KieuNhap === 'SO') {
      const mn = String(it.Min || '').replace(',', '.'), mx = String(it.Max || '').replace(',', '.');
      if ((mn && isNaN(Number(mn))) || (mx && isNaN(Number(mx)))) { toast(tr('eItemNum', [i + 1]), 'err'); return; }
      if (mn && mx && Number(mn) > Number(mx)) { toast(tr('eItemMinMax', [i + 1]), 'err'); return; }
    }
  }
  const btn = $('[data-act="mauSave"]');
  btn.disabled = true; btn.classList.add('loading');
  try {
    const r = await api('saveMauKiemTra', { NhomTB: S.mau.nhom, items });
    S.data.mauKiemTra = r.mauKiemTra;
    saveCache();
    S.mau = null;
    toast('saved', 'ok');
    location.hash = '#/mau';
  } catch (e) {
    if (e.code === 'INVALID' && e.extra) toast(tr('eItemLine', [e.extra.errors.map(x => x.line).join(', ')]), 'err');
    else if (e.code !== 'AUTH') toast(errText(e), 'err');
  } finally { if (btn.isConnected) { btn.disabled = false; btn.classList.remove('loading'); } }
}

/* -------------------------------- Đổi PIN -------------------------------- */

VIEWS.pin = () => {
  if (!isQL()) return forbiddenView('them');
  const ktvSet = S.data && S.data.ktvSet;
  return {
    title: 'changePin', back: 'them', noPtr: true,
    html: `
      <form class="card pad form" id="f-ktv" autocomplete="off">
        <div class="card-h flat">${ic('user')}${t('pinKTV')}<span class="sp"></span>
          <span class="tag ${ktvSet ? 'ok' : 'bad'}">${t(ktvSet ? 'pinIsSet' : 'pinNotSet')}</span></div>
        <p class="muted small">${t('pinKTVDesc')}</p>
        <label class="fld"><span class="lb">${t('newPin')}</span><input name="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="12" autocomplete="new-password"></label>
        <label class="fld"><span class="lb">${t('pinConfirm')}</span><input name="pin2" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="12" autocomplete="new-password"></label>
        <div class="msg" id="ktv-msg"></div>
        <button class="btn primary block" type="submit">${t(ktvSet ? 'changeKtvPin' : 'setKtvPin')}</button>
      </form>
      <form class="card pad form" id="f-ql" autocomplete="off">
        <div class="card-h flat">${ic('lock')}${t('pinQL')}</div>
        <p class="muted small">${t('pinQLDesc')}</p>
        <label class="fld"><span class="lb">${t('oldPin')}</span><input name="old" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="12" autocomplete="current-password"></label>
        <label class="fld"><span class="lb">${t('newPin')}</span><input name="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="12" autocomplete="new-password"></label>
        <label class="fld"><span class="lb">${t('pinConfirm')}</span><input name="pin2" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="12" autocomplete="new-password"></label>
        <div class="msg" id="ql-msg"></div>
        <button class="btn primary block" type="submit">${t('changeQlPin')}</button>
      </form>
      <p class="muted small">${t('pinForgot')}</p>`,
    after: () => {
      $('#f-ktv').addEventListener('submit', async ev => {
        ev.preventDefault();
        const f = ev.target, msg = $('#ktv-msg');
        if (!/^\d{6,12}$/.test(f.pin.value)) { msg.innerHTML = t('ePinFormat'); return; }
        if (f.pin.value !== f.pin2.value) { msg.innerHTML = t('ePinMismatch'); return; }
        if (!needOnline()) return;
        if (ktvSet && !(await confirmDlg('changeKtvPin', 'ktvLogoutWarn', { ok: 'changeKtvPin' }))) return;
        busy(f, true);
        try {
          await api('setPinKTV', { pin: f.pin.value });
          S.data.ktvSet = true; saveCache();
          toast('pinSaved', 'ok');
          render();
        } catch (e) { msg.innerHTML = errHtml(e); } finally { busy(f, false); }
      });
      $('#f-ql').addEventListener('submit', async ev => {
        ev.preventDefault();
        const f = ev.target, msg = $('#ql-msg');
        if (!/^\d{6,12}$/.test(f.pin.value)) { msg.innerHTML = t('ePinFormat'); return; }
        if (f.pin.value !== f.pin2.value) { msg.innerHTML = t('ePinMismatch'); return; }
        if (!needOnline()) return;
        busy(f, true);
        try {
          const r = await api('changePinQL', { oldPin: f.old.value, newPin: f.pin.value });
          S.auth = { token: r.token, role: r.role, exp: r.exp };
          lsSet(LS.auth, JSON.stringify(S.auth));
          toast('pinSaved', 'ok');
          f.reset();
        } catch (e) { msg.innerHTML = e.code === 'WRONG_PIN' ? t('eOldPin') : errHtml(e); } finally { busy(f, false); }
      });
    }
  };
};

/* -------------------------------- Nhật ký -------------------------------- */

const ACTION_KEYS = {
  THEM: 'aAdd', SUA: 'aEdit', DANG_NHAP: 'aLogin', THIET_LAP_PIN: 'aSetup', DOI_PIN_KTV: 'aPinKtv',
  DOI_PIN_QL: 'aPinQl', SUA_MAU: 'aTpl', RESET_PIN_QL: 'aReset'
};

VIEWS.nk = () => {
  if (!isQL()) return forbiddenView('them');
  setTimeout(() => loadNk(true), 0);
  return {
    title: 'auditLog', back: 'them', restoreScroll: true,
    html: `
      <div class="toolbar sticky"><div class="search">${ic('search')}<input type="search" id="nk-q" value="${esc(S.nk.q)}" placeholder="${esc(tp('searchLog'))}"></div></div>
      <div id="nk-list"></div>`,
    after: () => {
      drawNk();
      $('#nk-q').addEventListener('input', debounce(e => { S.nk.q = e.target.value; drawNk(); }, 150));
    }
  };
};

async function loadNk(reset) {
  if (S.nk.loading) return;
  S.nk.loading = true;
  if (reset) { S.nk.rows = []; S.nk.total = 0; }
  drawNk();
  try {
    const r = await api('getNhatKy', { offset: S.nk.rows.length, limit: 100 });
    S.nk.rows = S.nk.rows.concat(r.rows);
    S.nk.total = r.total;
  } catch (e) { if (e.code !== 'AUTH') toast(errText(e), 'err'); }
  S.nk.loading = false;
  drawNk();
}

function drawNk() {
  const box = $('#nk-list');
  if (!box) return;
  const n = norm(S.nk.q);
  const rows = S.nk.rows.filter(r => !n || norm(Object.values(r).join(' ')).includes(n));
  box.innerHTML = rows.map(r => {
    const k = ACTION_KEYS[r.HanhDong];
    const act = k ? t(k) : esc(r.HanhDong);
    const link = r.Sheet === 'ThietBi' && r.MaBanGhi ? `<a class="tb-id" href="#/tb/${encodeURIComponent(r.MaBanGhi)}">${esc(r.MaBanGhi)}</a>` : (r.MaBanGhi ? `<span class="tb-id">${esc(r.MaBanGhi)}</span>` : '');
    return `<div class="nk-item">
      <div class="nk-top"><span class="nk-act a-${esc(r.HanhDong)}">${act}</span>${link}<span class="sp"></span><span class="muted small">${esc(fmtTime(r.ThoiGian))}</span></div>
      <div class="nk-who">${ic('user')}${esc(r.NguoiThucHien)} · ${r.VaiTro === 'QL' ? t('roleQLShort') : t('roleKTVShort')}${r.Sheet ? ` · <span class="muted">${esc(r.Sheet)}</span>` : ''}</div>
      ${r.ChiTiet ? `<div class="nk-detail">${esc(r.ChiTiet)}</div>` : ''}
    </div>`;
  }).join('') + (S.nk.loading ? `<div class="center pad"><div class="spinner"></div></div>`
    : (S.nk.rows.length < S.nk.total ? `<button class="btn block" data-act="nkMore">${t('loadMore', S.nk.rows.length, S.nk.total)}</button>`
      : (S.nk.rows.length ? `<p class="muted small center">${t('endOfLog', S.nk.total)}</p>` : `<div class="empty">${t('noResult')}</div>`)));
}

/* -------------------------------- In tem QR -------------------------------- */

function temState() {
  if (!S.tem) {
    const saved = jparse(lsGet(LS.tem), {});
    S.tem = { sel: new Set(), start: 0, offX: Number(saved.offX) || 0, offY: Number(saved.offY) || 0,
      f: { q: '', kv: '', nhom: '' } };
  }
  return S.tem;
}

VIEWS.tem = () => {
  if (!S.data) return loadingView();
  const st = temState();
  return {
    title: 'printLabels', back: 'them', noPtr: true,
    html: `
      <section class="card pad">
        <div class="card-h flat">${ic('checklist')}${t('temStep1')}<span class="sp"></span><span class="count" id="tem-count"></span></div>
        <div class="search sm">${ic('search')}<input type="search" id="tem-q" value="${esc(st.f.q)}" placeholder="${esc(tp('searchTb'))}"></div>
        <div class="chips">
          <button class="chip${st.f.kv ? ' on' : ''}" data-act="temFilter" data-k="kv">${ic('map')}${st.f.kv ? dmBi('KHUVUC', st.f.kv) : t('allAreas')}</button>
          <button class="chip${st.f.nhom ? ' on' : ''}" data-act="temFilter" data-k="nhom">${ic('device')}${st.f.nhom ? dmBi('NHOMTB', st.f.nhom) : t('allGroups')}</button>
        </div>
        <div class="row gap wrap">
          <button class="btn sm" data-act="temAll">${ic('check')}${t('selectAllShown')}</button>
          <button class="btn sm" data-act="temNone">${ic('x')}${t('clearSelection')}</button>
        </div>
        <div class="tem-list" id="tem-list"></div>
      </section>
      <section class="card pad">
        <div class="card-h flat">${ic('print')}${t('temStep2')}</div>
        <p class="muted small">${t('temStartHint')}</p>
        <div class="tem-sheet-wrap"><div class="tem-grid" id="tem-grid"></div></div>
        <p class="small center" id="tem-pages"></p>
      </section>
      <details class="card pad">
        <summary class="card-h flat">${ic('filter')}${t('temCalib')}</summary>
        <p class="muted small">${t('temCalibHint')}</p>
        <div class="grid2">
          <label class="fld"><span class="lb">${t('offX')}</span><input id="offX" type="number" step="0.5" min="-10" max="10" value="${st.offX}"></label>
          <label class="fld"><span class="lb">${t('offY')}</span><input id="offY" type="number" step="0.5" min="-10" max="10" value="${st.offY}"></label>
        </div>
      </details>
      <section class="card pad">
        <div class="card-h flat">${ic('image')}${t('preview')}</div>
        <div class="tem-preview" id="tem-preview"></div>
      </section>
      <div class="notice">${ic('info')}<div>${t('printScaleHint')}</div></div>
      <div class="form-actions">
        <button class="btn" data-act="printTest">${ic('print')}${t('printTest')}</button>
        <button class="btn primary" data-act="printLabels">${ic('print')}${t('printNow')}</button>
      </div>`,
    after: () => {
      drawTemList(); drawTemGrid(); drawTemPreview();
      $('#tem-q').addEventListener('input', debounce(e => { st.f.q = e.target.value; drawTemList(); }, 150));
      $('#tem-list').addEventListener('change', e => {
        const cb = e.target.closest('input[data-id]');
        if (!cb) return;
        if (cb.checked) st.sel.add(cb.dataset.id); else st.sel.delete(cb.dataset.id);
        temCounts(); drawTemPreview();
      });
      ['offX', 'offY'].forEach(k => $('#' + k).addEventListener('input', e => {
        const v = Number(String(e.target.value).replace(',', '.'));
        st[k] = isFinite(v) ? Math.max(-10, Math.min(10, v)) : 0;
        lsSet(LS.tem, JSON.stringify({ offX: st.offX, offY: st.offY }));
        drawTemPreview();
      }));
    }
  };
};

function temShown() {
  const st = temState();
  return filteredTb({ q: st.f.q, kv: st.f.kv, nhom: st.f.nhom, tt: '_ACT' });
}
function temSelected() {
  const st = temState();
  return allTb().filter(x => st.sel.has(x.ID)).sort((a, b) => String(a.ID).localeCompare(String(b.ID), 'en', { numeric: true }));
}
function drawTemList() {
  const st = temState();
  const list = temShown();
  $('#tem-list').innerHTML = list.length ? list.map(x => `
    <label class="tem-row"><input type="checkbox" data-id="${esc(x.ID)}" ${st.sel.has(x.ID) ? 'checked' : ''}>
      <span class="tb-id">${esc(x.ID)}</span>${bi(x.TenMay, x.TenMayZH, 'grow')}</label>`).join('')
    : `<div class="empty small">${t('noResult')}</div>`;
  temCounts();
}
function temCounts() {
  const st = temState();
  const n = st.sel.size;
  $('#tem-count').innerHTML = t('nSelected', n);
  const per = LABEL.cols * LABEL.rows;
  const pages = n ? Math.ceil((st.start + n) / per) : 0;
  $('#tem-pages').innerHTML = n ? t('nPages', pages) : t('selectSome');
  drawTemGrid();
}
function drawTemGrid() {
  const st = temState();
  const n = st.sel.size;
  let h = '';
  for (let i = 0; i < LABEL.cols * LABEL.rows; i++) {
    const cls = i < st.start ? 'used' : (i < st.start + n ? 'fill' : '');
    h += `<button class="tg ${cls}${i === st.start ? ' start' : ''}" data-act="temStart" data-i="${i}">${i + 1}</button>`;
  }
  $('#tem-grid').innerHTML = h;
}
function drawTemPreview() {
  const box = $('#tem-preview');
  if (!box) return;
  const items = temSelected();
  const pages = buildLabelPages(items, temState().start, false);
  box.innerHTML = pages.length ? `<div class="pv-scale">${pages[0]}</div>` : `<div class="empty small">${t('selectSome')}</div>`;
  const inner = $('.pv-scale', box);
  if (inner) {
    const mm = box.clientWidth / 210;
    inner.style.transform = `scale(${mm / (96 / 25.4)})`;
    box.style.height = (297 * mm) + 'px';
  }
}

function labelHtml(tb) {
  const zh = tb.TenMayZH || dmZh('NHOMTB', tb.NhomTB);
  const app = { vi: (S.data.cauHinh && S.data.cauHinh.TenApp_VI) || tr('appName').vi, zh: (S.data.cauHinh && S.data.cauHinh.TenApp_ZH) || tr('appName').zh };
  return `<div class="lq">${QR.svg(qrUrl(tb.ID), { margin: 2 })}</div>
    <div class="lt">
      <div class="lid">${esc(tb.ID)}</div>
      ${tb.MaNhaMay ? `<div class="lma">${esc(tb.MaNhaMay)}</div>` : ''}
      <div class="lvi">${esc(tb.TenMay)}</div>
      ${zh ? `<div class="lzh">${esc(zh)}</div>` : ''}
      <div class="lapp"><span>${esc(app.vi)}</span><span>${esc(app.zh)}</span></div>
    </div>`;
}

function buildLabelPages(items, start, test) {
  const st = temState();
  const per = LABEL.cols * LABEL.rows;
  const slots = test ? per : start + items.length;
  const pages = [];
  for (let p = 0; p * per < slots; p++) {
    let h = '';
    for (let i = 0; i < per; i++) {
      const g = p * per + i;
      const idx = g - start;
      const tb = test ? items[i] : (idx >= 0 ? items[idx] : null);
      if (!tb && !test) continue;
      const col = i % LABEL.cols, row = Math.floor(i / LABEL.cols);
      const x = LABEL.left + st.offX + col * (LABEL.w + LABEL.gapX);
      const y = LABEL.top + st.offY + row * (LABEL.h + LABEL.gapY);
      h += `<div class="lbl" style="left:${x.toFixed(2)}mm;top:${y.toFixed(2)}mm">${tb ? labelHtml(tb) : ''}</div>`;
    }
    const note = test ? `<div class="pg-note">${t('testSheetNote')}</div>` : '';
    pages.push(`<div class="pg${test ? ' test' : ''}">${note}${h}</div>`);
    if (test) break;
  }
  return pages;
}

function doPrint(test) {
  const items = temSelected();
  if (!items.length && !test) { toast('selectSome', 'warn'); return; }
  const sample = items.length ? items : allTb().slice(0, 3);
  const pages = buildLabelPages(test ? sample.slice(0, 21) : items, temState().start, test);
  const root = $('#print-root');
  root.innerHTML = pages.join('');
  document.body.classList.add('printing');
  // Không xóa nội dung in bằng hẹn giờ: Chrome Android dựng bản in không đồng bộ.
  // #print-root luôn ẩn trên màn hình nên để lại cũng không sao; lần in sau sẽ ghi đè.
  const done = () => { document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => window.print(), 150);
}

/* ------------------------------ Nhập Excel ------------------------------ */

const IMPORT_COLS = [
  ['ID', 'ID', ''],
  ['MaNhaMay', 'Mã nhà máy', '厂内编号'],
  ['TenMay', 'Tên máy', '设备名称'],
  ['TenMayZH', 'Tên máy (Trung)', '设备名称(中文)'],
  ['NhomTB', 'Nhóm thiết bị', '设备类别'],
  ['ViTri', 'Khu vực', '区域'],
  ['Hang', 'Hãng', '品牌'],
  ['Model', 'Model', '型号'],
  ['SoSeri', 'Số seri', '序列号'],
  ['NamSuDung', 'Năm sử dụng', '投用年份'],
  ['CongSuatKW', 'Công suất (kW)', '功率(kW)'],
  ['ThongSo', 'Thông số', '技术参数'],
  ['TrangThai', 'Trạng thái', '状态'],
  ['LinkTaiLieu', 'Link tài liệu', '资料链接'],
  ['GhiChu', 'Ghi chú', '备注']
];
const HEADER_ALIASES = {
  id: 'ID', idhethong: 'ID', manhamay: 'MaNhaMay', mathietbi: 'MaNhaMay', tenmay: 'TenMay', tenthietbi: 'TenMay',
  tenmayzh: 'TenMayZH', tenmaytrung: 'TenMayZH', tentrung: 'TenMayZH', tenmaytiengtrung: 'TenMayZH',
  nhomtb: 'NhomTB', nhomthietbi: 'NhomTB', nhom: 'NhomTB', loaithietbi: 'NhomTB',
  vitri: 'ViTri', khuvuc: 'ViTri', hang: 'Hang', hangsanxuat: 'Hang', nhasanxuat: 'Hang', model: 'Model',
  soseri: 'SoSeri', seri: 'SoSeri', serial: 'SoSeri', namsudung: 'NamSuDung', namsd: 'NamSuDung',
  congsuatkw: 'CongSuatKW', congsuat: 'CongSuatKW', thongso: 'ThongSo', thongsokythuat: 'ThongSo',
  trangthai: 'TrangThai', linktailieu: 'LinkTaiLieu', tailieu: 'LinkTaiLieu', link: 'LinkTaiLieu', ghichu: 'GhiChu'
};
IMPORT_COLS.forEach(c => { HEADER_ALIASES[norm(c[2])] = HEADER_ALIASES[norm(c[2])] || c[0]; });

function csvCell(v) {
  const s = String(v === undefined || v === null ? '' : v);
  return /[",\n\r;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function downloadCsv(name, rows) {
  const text = '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function csvHeader() { return IMPORT_COLS.map(c => c[2] ? `${c[1]} / ${c[2]}` : c[1]); }

function exportCsv(list) {
  const rows = [csvHeader()].concat(list.map(x => IMPORT_COLS.map(c => {
    const f = c[0];
    if (f === 'NhomTB') return dmVi('NHOMTB', x[f]);
    if (f === 'ViTri') return dmVi('KHUVUC', x[f]);
    if (f === 'TrangThai') return dmVi('TRANGTHAI', x[f]);
    return x[f] || '';
  })));
  const d = new Date();
  downloadCsv(`thiet-bi_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.csv`, rows);
}

/** Tách bảng dán từ Excel (tab) hoặc CSV (phẩy/chấm phẩy), có hỗ trợ ô trong ngoặc kép. */
function parseTable(text) {
  text = String(text || '').replace(/^﻿/, '');
  const first = text.split(/\r?\n/)[0] || '';
  const sep = first.includes('\t') ? '\t' : (first.split(';').length > first.split(',').length ? ';' : ',');
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"' && cell === '') q = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim() !== ''));
}

function mapHeader(cells) {
  return cells.map(h => {
    const parts = String(h).split(/[\/\n]/).map(norm).filter(Boolean);
    for (const p of parts) if (HEADER_ALIASES[p]) return HEADER_ALIASES[p];
    return null;
  });
}

function resolveDm(loai, v) {
  const n = norm(v);
  if (!n) return '';
  const d = ((S.data && S.data.danhMuc) || []).find(x => x.Loai === loai && (norm(x.Ma) === n || norm(x.TenVI) === n || norm(x.TenZH) === n));
  return d ? d.Ma : null;
}

function analyzeImport(text) {
  const rows = parseTable(text);
  if (rows.length < 2) return { error: 'impNeedRows' };
  const head = mapHeader(rows[0]);
  if (!head.includes('TenMay') && !head.includes('ID')) return { error: 'impNoHeader' };
  const out = [];
  rows.slice(1).forEach((cells, k) => {
    const o = { _line: k + 2 };
    head.forEach((f, j) => { if (f) o[f] = String(cells[j] === undefined ? '' : cells[j]).trim(); });
    const errs = [];
    const id = (o.ID || '').toUpperCase();
    const cur = id ? tbById(id) : null;
    if (id && !cur) errs.push('eIdNotFound');
    if (!id && !o.TenMay) errs.push('impNoName');
    [['NhomTB', 'NHOMTB'], ['ViTri', 'KHUVUC'], ['TrangThai', 'TRANGTHAI']].forEach(([f, loai]) => {
      if (o[f]) {
        const c = resolveDm(loai, o[f]);
        if (c === null) errs.push({ k: 'impBadDm', a: [o[f]] });
        else o[f] = c;
      } else if (!id && f !== 'TrangThai') errs.push(f === 'NhomTB' ? 'impMissNhom' : 'impMissKv');
    });
    if (o.NamSuDung && !/^\d{4}$/.test(o.NamSuDung)) errs.push('eYear');
    if (o.CongSuatKW && !/^\d+([.,]\d+)?$/.test(o.CongSuatKW.replace(/\s/g, ''))) errs.push('eNumber');
    if (o.LinkTaiLieu && !/^https?:\/\//i.test(o.LinkTaiLieu)) errs.push('eLink');
    let kind = errs.length ? 'err' : (cur ? 'upd' : 'new');
    if (kind === 'upd') {
      const changed = TB_FIELDS.some(f => o[f] !== undefined && o[f] !== '' && String(o[f]) !== String(cur[f] || ''));
      if (!changed) kind = 'same';
    }
    out.push({ o, errs, kind, cur });
  });
  return { rows: out, cols: head.filter(Boolean) };
}

VIEWS.nhap = () => {
  if (!isQL()) return forbiddenView('tb');
  const st = S.imp || (S.imp = { text: '', res: null, done: null });
  return {
    title: 'importExcel', back: 'tb', noPtr: true,
    html: `
      <section class="card pad">
        <ol class="steps">
          <li>${t('impStep1')}<div class="row gap wrap"><button class="btn sm" data-act="impTemplate">${ic('download')}${t('impTemplate')}</button>
            <button class="btn sm" data-act="exportAll">${ic('download')}${t('impExportAll')}</button></div></li>
          <li>${t('impStep2')}</li>
          <li>${t('impStep3')}</li>
        </ol>
        <p class="muted small">${t('impRules')}</p>
      </section>
      <section class="card pad">
        <textarea id="imp-text" rows="7" class="mono" placeholder="${esc(tp('impPastePh'))}">${esc(st.text)}</textarea>
        <div class="row gap wrap">
          <label class="btn sm">${ic('upload')}${t('impChooseCsv')}<input type="file" accept=".csv,text/csv,.txt" id="imp-file" hidden></label>
          <span class="sp"></span>
          <button class="btn primary" data-act="impCheck">${ic('checklist')}${t('impCheck')}</button>
        </div>
      </section>
      <div id="imp-result"></div>`,
    after: () => {
      $('#imp-text').addEventListener('input', e => { st.text = e.target.value; });
      $('#imp-file').addEventListener('change', async e => {
        const f = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!f) return;
        st.text = await f.text();
        $('#imp-text').value = st.text;
        impCheck();
      });
      if (st.res || st.done) drawImport();
    }
  };
};

function impCheck() {
  const st = S.imp;
  st.text = $('#imp-text').value;
  st.done = null;
  st.res = analyzeImport(st.text);
  drawImport();
}

function drawImport() {
  const st = S.imp;
  const box = $('#imp-result');
  if (!box) return;
  if (st.done) {
    const d = st.done;
    box.innerHTML = `<section class="card pad">
      <div class="card-h flat">${ic('check', 'ok')}${t('impDone')}</div>
      <div class="imp-sum"><span class="tag ok">${t('impNew', d.created.length)}</span><span class="tag info">${t('impUpd', d.updated.length)}</span>
        <span class="tag">${t('impSame', d.unchanged)}</span>${d.errors.length ? `<span class="tag bad">${t('impErr', d.errors.length)}</span>` : ''}</div>
      ${d.errors.length ? `<div class="imp-errs">${d.errors.map(e => `<div>${t('impLine', e.line)}: ${e.errors.map(x => t(reasonKey(x.reason))).join(' ')}</div>`).join('')}</div>` : ''}
      ${d.created.length ? `<button class="btn block" data-act="temIds" data-ids="${esc(d.created.join(','))}">${ic('print')}${t('impPrintNew')}</button>` : ''}
    </section>`;
    return;
  }
  const r = st.res;
  if (!r) { box.innerHTML = ''; return; }
  if (r.error) { box.innerHTML = `<div class="notice warn">${ic('alert')}<div>${t(r.error)}</div></div>`; return; }
  const c = k => r.rows.filter(x => x.kind === k).length;
  const ok = c('new') + c('upd');
  const errTxt = e => typeof e === 'string' ? t(e) : t(e.k, ...e.a);
  box.innerHTML = `<section class="card pad">
    <div class="imp-sum"><span class="tag ok">${t('impNew', c('new'))}</span><span class="tag info">${t('impUpd', c('upd'))}</span>
      <span class="tag">${t('impSame', c('same'))}</span>${c('err') ? `<span class="tag bad">${t('impErr', c('err'))}</span>` : ''}</div>
    <p class="muted small">${t('impCols', r.cols.length)}</p>
    <div class="imp-rows">${r.rows.map(x => `
      <div class="imp-row k-${x.kind}">
        <span class="imp-ln">${x.o._line}</span>
        <div class="grow"><b>${esc(x.o.ID || '')}</b> ${esc(x.o.TenMay || (x.cur && x.cur.TenMay) || '')}
          ${x.errs.length ? `<div class="imp-e">${x.errs.map(errTxt).join('')}</div>` : ''}</div>
        <span class="imp-k">${t({ new: 'kNew', upd: 'kUpd', same: 'kSame', err: 'kErr' }[x.kind])}</span>
      </div>`).join('')}</div>
    <button class="btn primary block" data-act="impRun" ${ok ? '' : 'disabled'}>${ic('upload')}${t('impRun', ok)}</button>
  </section>`;
}

async function impRun(btn) {
  if (!needOnline()) return;
  const st = S.imp;
  const rows = st.res.rows.filter(x => x.kind === 'new' || x.kind === 'upd').map(x => x.o);
  if (!(await confirmDlg('impConfirmTitle', tr('impConfirmMsg', [rows.length])))) return;
  btn.disabled = true; btn.classList.add('loading');
  try {
    const r = await api('importThietBi', { rows });
    S.data.thietBi = r.thietBi;
    saveCache();
    st.done = r;
    st.res = null;
    drawImport();
    toast('saved', 'ok');
  } catch (e) {
    if (e.code !== 'AUTH') toast(errText(e), 'err');
    btn.disabled = false; btn.classList.remove('loading');
  }
}

/* ============================== SỰ KIỆN CHUNG ============================== */

const ACT = {
  back: el => { if (S.prevHash) history.back(); else location.hash = '#/' + el.dataset.to; },
  sync: () => refresh(false),
  retryAuth: () => renderAuth(),
  closeSheet: () => closeSheet(),
  dlgYes: () => closeSheet(true),
  dlgNo: () => closeSheet(false),
  pick: el => closeSheet(el.dataset.v),
  logout: async () => { if (await confirmDlg('logout', 'logoutMsg', { ok: 'logout', danger: true })) logout(); },
  install: async () => { if (S.installEvt) { S.installEvt.prompt(); S.installEvt = null; } },
  editName: async () => {
    const sh = openSheet(`<form class="form" id="f-name"><div class="pk-head"><h3 class="h3">${t('changeName')}</h3><button type="button" class="hbtn" data-act="closeSheet">${ic('x')}</button></div>
      <label class="fld"><span class="lb">${t('yourName')}</span><input name="n" value="${esc(S.name)}" maxlength="60"></label>
      <button class="btn primary block" type="submit">${t('save')}</button></form>`);
    $('#f-name', sh).addEventListener('submit', ev => {
      ev.preventDefault();
      const v = ev.target.n.value.trim();
      if (v.length < 2) { toast('eNameReq', 'err'); return; }
      setName(v); closeSheet(); render(true);
    });
  },
  filterTo: el => { S.f = { q: '', kv: '', nhom: '', tt: el.dataset.tt }; saveFilter(); },
  clearFilter: () => { S.f = { q: '', kv: '', nhom: '', tt: '_ACT' }; saveFilter(); render(true); },
  pickFilter: async el => {
    const k = el.dataset.k;
    let v;
    if (k === 'tt') v = await picker({ title: 'fTrangThai', items: ttOptions(), value: S.f.tt });
    else {
      const loai = k === 'kv' ? 'KHUVUC' : 'NHOMTB';
      const all = tr(k === 'kv' ? 'allAreas' : 'allGroups');
      v = await picker({ title: k === 'kv' ? 'fViTri' : 'fNhomTB', value: S.f[k],
        items: [{ v: '', vi: all.vi, zh: all.zh }].concat(dmList(loai, true).map(d => ({ v: d.Ma, vi: d.TenVI, zh: d.TenZH }))) });
    }
    if (v === undefined) return;
    S.f[k] = v; saveFilter(); render(true);
  },
  pickField: async el => {
    const f = el.dataset.f, loai = el.dataset.loai;
    collectForm();
    const items = dmList(loai).map(d => ({ v: d.Ma, vi: d.TenVI, zh: d.TenZH }));
    const curv = S.form[f];
    if (curv && !items.some(i => i.v === curv)) { const d = dmGet(loai, curv); if (d) items.unshift({ v: d.Ma, vi: d.TenVI, zh: d.TenZH, sub: tp('inactive') }); }
    const v = await picker({ title: { NhomTB: 'fNhomTB', ViTri: 'fViTri', TrangThai: 'fTrangThai' }[f], items, value: curv });
    if (v === undefined) return;
    S.form[f] = v;
    el.innerHTML = pickLabel(loai, v) + ic('down');
    const box = el.closest('.fld');
    box.classList.remove('has-err');
    $('.fe', box).innerHTML = '';
  },
  showQr: el => {
    const tb = tbById(el.dataset.id);
    if (!tb) return;
    openSheet(`<div class="qr-big">${QR.svg(qrUrl(tb.ID), { margin: 2 })}</div>
      <div class="center"><span class="tb-id big">${esc(tb.ID)}</span>${bi(tb.TenMay, tb.TenMayZH, 'hero-name')}</div>
      <p class="muted small center break">${esc(qrUrl(tb.ID))}</p>
      <button class="btn primary block" data-act="temOne" data-id="${esc(tb.ID)}">${ic('print')}${t('printLabel')}</button>`);
  },
  temOne: el => { closeSheet(); const st = temState(); st.sel = new Set([el.dataset.id]); location.hash = '#/tem'; },
  temIds: el => { const st = temState(); st.sel = new Set(el.dataset.ids.split(',').filter(Boolean)); location.hash = '#/tem'; },
  temFromList: () => { const st = temState(); st.sel = new Set(filteredTb().map(x => x.ID)); location.hash = '#/tem'; },
  temBlank: () => { temState(); },
  temAll: () => { const st = temState(); temShown().forEach(x => st.sel.add(x.ID)); drawTemList(); drawTemPreview(); },
  temNone: () => { const st = temState(); st.sel.clear(); drawTemList(); drawTemPreview(); },
  temStart: el => { temState().start = Number(el.dataset.i); temCounts(); drawTemPreview(); },
  temFilter: async el => {
    const st = temState(), k = el.dataset.k, loai = k === 'kv' ? 'KHUVUC' : 'NHOMTB';
    const all = tr(k === 'kv' ? 'allAreas' : 'allGroups');
    const v = await picker({ title: k === 'kv' ? 'fViTri' : 'fNhomTB', value: st.f[k],
      items: [{ v: '', vi: all.vi, zh: all.zh }].concat(dmList(loai, true).map(d => ({ v: d.Ma, vi: d.TenVI, zh: d.TenZH }))) });
    if (v === undefined) return;
    st.f[k] = v; render(true);
  },
  printTest: () => doPrint(true),
  printLabels: () => doPrint(false),
  exportCsv: () => exportCsv(filteredTb()),
  exportAll: () => exportCsv(filteredTb({ q: '', kv: '', nhom: '', tt: '_ALL' })),
  impTemplate: () => downloadCsv('mau-nhap-thiet-bi.csv', [csvHeader()]),
  impCheck: () => impCheck(),
  impRun: el => impRun(el),
  torch: () => toggleTorch(),
  editDm: el => dmEditor(el.dataset.loai, el.dataset.ma),
  addDm: el => dmEditor(el.dataset.loai, null),
  mauAdd: () => {
    S.mau.items.push({ HangMucVI: '', HangMucZH: '', KieuNhap: 'DAT', DonVi: '', Min: '', Max: '', DangDung: '1' });
    S.mau.dirty = true;
    $('#mau-list').innerHTML = drawMauItems(false);
    const last = $$('#mau-list .mau-item').pop();
    if (last) { last.scrollIntoView({ behavior: 'smooth', block: 'center' }); $('input', last).focus(); }
  },
  mauMove: el => {
    const i = Number(el.dataset.i), d = Number(el.dataset.d), a = S.mau.items;
    if (i + d < 0 || i + d >= a.length) return;
    [a[i], a[i + d]] = [a[i + d], a[i]];
    S.mau.dirty = true;
    $('#mau-list').innerHTML = drawMauItems(false);
  },
  mauDel: async el => {
    const i = Number(el.dataset.i);
    const it = S.mau.items[i];
    if (it.HangMucVI && !(await confirmDlg('deleteItem', { vi: it.HangMucVI, zh: it.HangMucZH }, { ok: 'delete', danger: true }))) return;
    S.mau.items.splice(i, 1);
    S.mau.dirty = true;
    $('#mau-list').innerHTML = drawMauItems(false);
  },
  mauReset: () => { S.mau = null; location.hash = '#/mau'; },
  mauSave: () => mauSave(),
  nkMore: () => loadNk(false)
};

function bindGlobal() {
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const fn = ACT[el.dataset.act];
    if (!fn) return;
    e.preventDefault();
    fn(el, e);
    // Liên kết có data-act (thẻ thống kê, mục menu): chạy hành động rồi mới chuyển trang
    if (el.tagName === 'A' && el.getAttribute('href')) location.hash = el.getAttribute('href');
  });
  $('#overlay').addEventListener('click', e => { if (e.target.id === 'overlay') closeSheet(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
  window.addEventListener('hashchange', () => {
    if ($('#overlay').classList.contains('open')) closeSheet();
    if (S.mau && !location.hash.startsWith('#/mau/')) S.mau = null;
    render();
  });
  window.addEventListener('online', () => { if (S.auth) refresh(true); else if (document.body.classList.contains('auth-mode')) renderAuth(); });
  window.addEventListener('offline', () => setOnline(false));
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); S.installEvt = e; });
  window.addEventListener('resize', debounce(() => { if (S.cur && S.cur.name === 'tem') drawTemPreview(); }, 200));
  bindPullToRefresh();
}

function bindPullToRefresh() {
  const ind = $('#ptr');
  let y0 = null, dy = 0;
  const TH = 120;
  window.addEventListener('touchstart', e => {
    y0 = (window.scrollY <= 0 && S.auth && !document.body.classList.contains('no-ptr') &&
      !document.body.classList.contains('modal-open') && e.touches.length === 1) ? e.touches[0].clientY : null;
    dy = 0;
  }, { passive: true });
  window.addEventListener('touchmove', e => {
    if (y0 === null) return;
    dy = e.touches[0].clientY - y0;
    if (dy <= 0) { ind.style.transform = ''; ind.style.opacity = ''; return; }
    const d = Math.min(dy * 0.5, 70);
    ind.style.transform = `translate(-50%, ${d - 40}px) rotate(${dy * 2}deg)`;
    ind.style.opacity = String(Math.min(1, dy / TH));
    ind.classList.toggle('ready', dy > TH);
  }, { passive: true });
  window.addEventListener('touchend', () => {
    if (y0 === null) return;
    if (dy > TH) refresh(false);
    y0 = null; dy = 0;
    ind.style.transform = '';
    ind.style.opacity = '';
    ind.classList.remove('ready');
  });
}

/* ================================ PWA ================================ */

function registerSW() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('sw.js').then(reg => {
    const show = () => {
      const b = $('#update');
      b.innerHTML = `${ic('download')}${t('updateReady')}`;
      b.hidden = false;
      b.onclick = () => { S.updating = true; if (reg.waiting) reg.waiting.postMessage('SKIP_WAITING'); else location.reload(); };
    };
    if (reg.waiting && navigator.serviceWorker.controller) show();
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      if (w) w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) show(); });
    });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (S.updating) location.reload(); });
}

document.addEventListener('DOMContentLoaded', init);
