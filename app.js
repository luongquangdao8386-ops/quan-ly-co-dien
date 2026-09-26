/* =====================================================================
 * QUẢN LÝ CƠ ĐIỆN / 机电管理 — Frontend (PWA)
 * Phiên 1: đăng nhập PIN, thiết bị, quét QR, in tem, danh mục, mẫu kiểm tra,
 *          nhập Excel, nhật ký. Chạy trên GitHub Pages, dữ liệu qua Apps Script.
 * Phiên 2: phiếu sửa chữa (báo hỏng → nhận → chờ vật tư → hoàn thành → duyệt đóng),
 *          tự đổi trạng thái máy, lịch sử sửa chữa theo máy, danh mục Loại hư hỏng.
 * Phiên 3: bảo trì kế hoạch — kế hoạch theo chu kỳ + checklist, ghi thực hiện (phiếu BT),
 *          quản lý duyệt / trả lại, lịch 12 tháng, thẻ đến hạn trên trang chủ và trang máy.
 * Phiên 4: kiểm tra đầu ca theo ca làm việc (phiếu KT), giờ chạy máy (đồng hồ / số giờ mỗi ngày),
 *          bảo trì theo giờ chạy (chu kỳ giờ, cái nào tới trước).
 * Phiên 5: hợp đồng bảo trì thuê ngoài (nhắc sắp hết hạn, ký tiếp), bảo trì dự đoán (nhiệt ảnh, rung, cách điện,
 *          mức A–D, xu hướng từng điểm đo, chu kỳ đo), RCA / 5 Why + hành động khắc phục, email nhắc việc hằng tuần.
 * Phiên 6: báo cáo (dừng máy, MTTR/MTBF, tỷ lệ hoàn thành bảo trì, kiểm tra đầu ca, Pareto loại hỏng & 6M, dự đoán, RCA),
 *          bảng MTBF/MTTR theo máy, bản in A4 song ngữ đúng mã bộ biểu mẫu cơ điện (CĐ-SC-02/04/05, CĐ-BT-01/03/04/05/07/08,
 *          CĐ-BC-01/03, CĐ-TB-02), thông tin bản in (tên công ty, lần ban hành, ngày hiệu lực).
 * ===================================================================== */
'use strict';

// ⚠️ Dán URL Web app Apps Script (kết thúc bằng /exec) vào đây:
const API_URL = 'https://script.google.com/macros/s/AKfycbx0IuT4Ybp9jM_Pmzmh0NU4Ad9Heg8d3D0RVPL3jfe3fKUTVocFt1RkpwUWAw5-i7wD/exec';
// Link app trên GitHub Pages — mã QR trên tem trỏ về đây:
const APP_URL = 'https://luongquangdao8386-ops.github.io/quan-ly-co-dien/';
const APP_VERSION = '1.5.0';

const SCAN_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js';
const STOP_CODES = ['DUNG', 'DANGSUA'];
const STATUS_COLORS = ['CHAY', 'DUPHONG', 'DUNG', 'DANGSUA', 'NGUNG', 'THANHLY'];
const LS = {
  auth: 'qlcd_auth', cache: 'qlcd_cache', name: 'qlcd_ten', dev: 'qlcd_dev',
  role: 'qlcd_role', tem: 'qlcd_tem', filt: 'qlcd_filter'
};
const TB_FIELDS = ['MaNhaMay', 'TenMay', 'TenMayZH', 'NhomTB', 'ViTri', 'Hang', 'Model', 'SoSeri',
  'NamSuDung', 'CongSuatKW', 'ThongSo', 'TrangThai', 'LinkTaiLieu', 'GhiChu', 'KieuGioChay'];
// Khổ tem decal A4 21 tem (3 × 7), đơn vị mm
const LABEL = { cols: 3, rows: 7, w: 63.5, h: 38.1, top: 15.15, left: 7.25, gapX: 2.54, gapY: 0 };

const S = {
  auth: null, data: null, name: '', dev: '', online: navigator.onLine, syncing: false,
  f: { q: '', kv: '', nhom: '', tt: '_ACT' }, scroll: {}, lastHash: '', pendingId: null,
  form: null, scanner: null, scanBusy: false, tem: null, imp: null, mau: null,
  nk: { rows: [], total: 0, loading: false, q: '' }, installEvt: null, updating: false,
  // Phiếu sửa chữa: bộ lọc danh sách, form đang mở, máy đã tải đủ lịch sử, số phiếu cũ đã tải
  scf: { tab: 'XL', kv: '', q: '' }, scForm: null, scLoaded: new Set(), scOldLoaded: 0, scOldBusy: false,
  // Bảo trì kế hoạch: bộ lọc, form đang mở, lịch sử đã tải, kết quả hạng mục đã tải, lịch năm
  btf: { tab: 'CAN', kv: '', nhom: '', q: '' }, btForm: null, khForm: null, btLoaded: new Set(), btKhLoaded: new Set(),
  btOldLoaded: 0, btOldBusy: false, btKQ: {}, btKQBusy: {}, btYear: {}, btYearBusy: false, btNam: { y: 0, kv: '', nhom: '', q: '' },
  // Kiểm tra đầu ca: bộ lọc (ngay/ca trống = ca hiện tại), form, ngày đã tải, máy đã tải lịch sử, hàng đợi "máy tiếp theo"
  ktf: { tab: 'CHUA', kv: '', nhom: '', q: '', ngay: '', ca: '' }, ktForm: null, ktDay: {}, ktDayBusy: {}, ktTbLoaded: new Set(),
  ktNext: null, ktRet: null,
  // Giờ chạy: bộ lọc màn hình ghi, số đang nhập chưa lưu, máy đã tải lịch sử, màn hình chọn máy ghi giờ chạy
  gcf: { ngay: '', kv: '', nhom: '', q: '' }, gcEdit: {}, gcTbLoaded: new Set(), gcSet: null,
  // Phiên 5: hợp đồng · bảo trì dự đoán (máy đã tải đủ lịch sử đo, biểu đồ xu hướng đang hiện) · RCA
  hdf: { tab: 'CAN', q: '' }, hdForm: null,
  ddf: { tab: 'CAN', kv: '', nhom: '', q: '', loai: '' }, ddForm: null, ddLoaded: new Set(), ddOldLoaded: 0, ddOldBusy: false, trend: {},
  rcaf: { tab: 'MO', kv: '', nhom: '', q: '' }, rcaForm: null,
  // Phiên 6: kỳ + bộ lọc báo cáo, số liệu đã tải theo khoảng tháng, đang tải, tiến độ, lỗi, biểu đồ đang hiện
  bc: null, bcRes: {}, bcBusy: {}, bcProg: {}, bcErr: {}, chart: {}
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
  map: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  pause: '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
  play: '<path d="M7 4.5v15l12-7.5z"/>',
  userCheck: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M16 11l2 2 4-4"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  stop: '<circle cx="12" cy="12" r="9"/><rect x="9" y="9" width="6" height="6" rx="1"/>',
  repeat: '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
  grid: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 4v17M13 4v17M3 15h18"/>',
  forward: '<rect x="3" y="5" width="13" height="15" rx="2"/><path d="M3 10h13M7 3v4M12 3v4M16 14h6M19 11l3 3-3 3"/>',
  gauge: '<path d="M3.5 17a8.5 8.5 0 1 1 17 0"/><path d="M12 17l4.2-5.2"/><circle cx="12" cy="17" r="1.3"/><path d="M7 12.5l1 .8M12 8.5v1.3M17 12.5l-1 .8"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  skip: '<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>',
  thermo: '<path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z"/><path d="M12 9v7"/>',
  vibe: '<path d="M2 12h2l2-5 3 10 3-12 3 12 3-10 2 5h2"/>',
  insul: '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M13 8l-3 5h4l-3 4"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>'
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
    BUSY: 'eBusy', TOO_MANY: 'eTooMany', NO_SHEET: 'eNoSheet', BAD_STATE: 'eBadState',
    TPL_CHANGED: 'ktTplChanged', NO_TEMPLATE: 'ktNoTemplate', NOT_LATEST: 'gcOnlyLatest',
    DUPLICATE: 'eDuplicate', NOT_READY: 'rcaNotReady', NO_EMAIL: 'nhacNoEmail'
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
      phieuSC: d.phieuSC || [], scOld: d.scOld || 0,
      keHoachBT: d.keHoachBT || [], hangMucBT: d.hangMucBT || [], phieuBT: d.phieuBT || [], btOld: d.btOld || 0,
      kiemTra: d.kiemTra || [], mauBan: d.mauBan || [], gioChay: d.gioChay || [], today: d.today || '',
      hopDong: d.hopDong || [], phieuDD: d.phieuDD || [], ddOld: d.ddOld || 0, rca: d.rca || [], hanhDong: d.hanhDong || [],
      ktvSet: d.ktvSet, role: d.role, savedAt: new Date().toISOString()
    };
    S.ddLoaded = new Set();
    S.ddOldLoaded = 0;
    S.ktDay = {};
    S.ktTbLoaded = new Set();
    S.gcTbLoaded = new Set();
    S.scLoaded = new Set();
    S.scOldLoaded = 0;
    S.btLoaded = new Set();
    S.btKhLoaded = new Set();
    S.btOldLoaded = 0;
    S.btKQ = {};
    S.btYear = {};
    S.bcRes = {};
    S.bcErr = {};
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
      return items.filter(it => !n || norm(it.vi + ' ' + it.zh + ' ' + (it.v || '') + ' ' + (it.sub || '')).includes(n)).map(it => `
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
  const soon = [['energyMonth', 'flash'], ['leakAlert', 'alert']];
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
      ${homeScCard()}
      ${homeKtCard()}
      ${homeBtCard()}
      ${homeDdRcaCard()}
      ${homeHdCard()}
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
  const open = scOpenOfTb(tb.ID);
  const since = open.filter(x => isOn(x.MayDung) && x.TGDung).map(x => x.TGDung).sort()[0];
  return `<a class="mini ${statusCls(tb.TrangThai)}" href="#/tb/${encodeURIComponent(tb.ID)}">
    <div class="mini-main">
      <div class="mini-top"><span class="tb-id">${esc(tb.ID)}</span>${tb.MaNhaMay ? `<span class="tb-ma">${esc(tb.MaNhaMay)}</span>` : ''}
        ${open.map(x => `<span class="sc-chip">${esc(x.SoPhieu)}</span>`).join('')}</div>
      ${bi(tb.TenMay, tb.TenMayZH, 'tb-name')}
      ${dmBi('KHUVUC', tb.ViTri, 'meta')}
      ${since ? `<span class="dur live">${ic('clock')}${t('scDownLive', fmtDur(minutesSince(since)))}</span>` : ''}
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
  if (!S.data) return loadingView(); // lần đầu mở từ QR: chờ tải dữ liệu xong sẽ tự hiện
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
  const open = scOpenOfTb(tb.ID);
  const canReport = tb.TrangThai !== 'THANHLY';
  const ktBtn = tbKtButton(tb);
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
      ${open.map(x => `<a class="notice sc-open sc-${esc(x.TrangThaiPhieu)}" href="#/sc/${encodeURIComponent(x.SoPhieu)}">${ic('wrench')}
        <div>${t('scOpenOnTb', x.SoPhieu)}<div class="sc-desc one">${esc(x.MoTa)}</div></div>${scPill(x.TrangThaiPhieu)}</a>`).join('')}
      ${ktBtn || canReport ? `<div class="tb-main${ktBtn && canReport ? ' two' : ''}">
        ${ktBtn}
        ${canReport ? `<a class="btn ${ktBtn ? 'danger-outline' : 'primary'}" href="#/sc-moi/${encodeURIComponent(tb.ID)}">${ic('wrench')}${t('scReport')}</a>` : ''}
      </div>` : ''}
      <div class="actions-row">
        ${isQL() ? `<a class="btn" href="#/tb/${encodeURIComponent(tb.ID)}/sua">${ic('edit')}${t('edit')}</a>` : ''}
        <button class="btn" data-act="tbPrintMenu" data-id="${esc(tb.ID)}">${ic('print')}${t('pPrintMenu')}</button>
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
      ${tbHdSection(tb)}
      ${tbKtSection(tb)}
      ${tbGcSection(tb)}
      ${tbScHistory(tb)}
      ${tbBtSection(tb)}
      ${tbDdSection(tb)}
      ${tbRcaSection(tb)}
      <p class="muted small audit">${t('createdBy', fmtTime(tb.NgayTao), tb.NguoiTao || '—')}<br>${t('updatedBy', fmtTime(tb.NgaySua), tb.NguoiSua || '—')}</p>`,
    after: () => { loadTbScHistory(tb.ID); loadTbBtHistory(tb.ID); loadTbKtHistory(tb.ID); if (GC_KIEU.includes(tb.KieuGioChay) || gcOfTb(tb.ID).length) loadTbGcHistory(tb.ID); loadTbDdHistory(tb.ID); }
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
          <div class="fld" data-fld="KieuGioChay"><span class="lb">${t('fKieuGioChay')}</span>
            <div class="seg gs-seg">${['', 'DONGHO', 'NGAY'].map(k => `<label><input type="radio" name="tb-kgc" value="${k}" data-fr="KieuGioChay" ${(S.form.KieuGioChay || '') === k ? 'checked' : ''}><span>${biTr(tr(k ? 'gcK' + k + 'Short' : 'gcKNONEShort'))}</span></label>`).join('')}</div>
            <span class="fe"></span></div>
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
  $$('#f-tb input[data-fr]:checked').forEach(el => { S.form[el.dataset.fr] = el.value; });
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
    NOT_FOUND: 'eIdNotFound', DUPLICATE: 'eDupCode', BAD_CODE: 'eBadCode', SYSTEM_CODE: 'eSystemCode', MIN_GT_MAX: 'eMinMax',
    BAD_TIME: 'eTime', FUTURE: 'eFuture', TIME_ORDER: 'eTimeOrder', RETIRED: 'eRetired', BAD_DATE: 'eDate',
    NOT_IN_USE: 'ktNotInUse', SHIFT_DATE: 'ktShiftDateErr', AFTER_CREATE: 'ktAfterCreate', NOT_TRACKED: 'gcNotTracked', BAD_EMAIL: 'eEmail' })[r] || 'eInvalid';
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

VIEWS.cv = () => {
  const open = allSC().filter(x => SC_OPEN.includes(x.TrangThaiPhieu));
  const nWork = open.filter(x => x.TrangThaiPhieu !== 'CHODUYET').length;
  const nApprove = open.length - nWork;
  const ST = khStatuses();
  const nDue = allKH().filter(k => KH_DUE.includes(ST.get(k.MaKH).st)).length;
  const nLate = allKH().filter(k => ST.get(k.MaKH).st === 'QUAHAN').length;
  const nPend = allBT().filter(x => BT_CHO.includes(x.TrangThaiPhieu)).length;
  const kd = S.data ? ktShift(caNow()) : null;
  const gcT = S.data ? gcTracked() : [];
  const today = dToday();
  const gcLeft = gcT.filter(tb => !allGC().some(x => x.IDThietBi === tb.ID && x.Ngay === today)).length;
  const ddDueN = S.data ? ddTodo().length : 0, ddAl = S.data ? ddAlarms().length : 0;
  const rs = S.data ? rcaOpenStats() : { open: 0, late: 0 };
  const nSug = S.data ? rcaCandidates().length : 0;
  return {
    title: 'tabWork', live: true,
    html: `
      <a class="btn primary block" href="#/sc-moi">${ic('plus')}${t('scNew')}</a>
      <div class="menu">
        <a class="menu-item" href="#/sc" data-act="scTabGo" data-t="XL">${ic('wrench', 'mi')}
          <div class="mi-text">${t('repairTickets')}<span class="mi-desc">${t('repairDesc')}</span></div>
          ${nWork ? `<span class="badge sc-DANGXL">${nWork}</span>` : ''}${nApprove ? `<span class="badge sc-CHODUYET">${nApprove}</span>` : ''}
          ${ic('chev', 'mi-chev')}</a>
        <a class="menu-item" href="#/bt" data-act="btTabGo" data-t="${nDue || !nPend ? 'CAN' : 'DUYET'}">${ic('calendar', 'mi')}
          <div class="mi-text">${t('pmPlan')}<span class="mi-desc">${t('pmDesc')}</span></div>
          ${nDue ? `<span class="badge kh-${nLate ? 'QUAHAN' : 'DENHAN'}">${nDue}</span>` : ''}${nPend ? `<span class="badge bt-CHODUYET">${nPend}</span>` : ''}
          ${ic('chev', 'mi-chev')}</a>
        <a class="menu-item" href="#/kt" data-act="ktTabGo" data-t="CHUA">${ic('checklist', 'mi')}
          <div class="mi-text">${t('shiftCheck')}<span class="mi-desc">${kd ? caBi(kd.c) : t('checkDesc')}</span></div>
          ${kd && kd.todo.length ? `<span class="badge kt-TODO">${kd.todo.length}</span>` : ''}${kd && kd.bad.length ? `<span class="badge kt-BAD">${kd.bad.length}</span>` : ''}
          ${ic('chev', 'mi-chev')}</a>
        <a class="menu-item" href="#/gc">${ic('gauge', 'mi')}
          <div class="mi-text">${t('runHours')}<span class="mi-desc">${t('hoursDesc')}</span></div>
          ${gcLeft ? `<span class="badge kt-TODO">${gcLeft}</span>` : ''}
          ${ic('chev', 'mi-chev')}</a>
        <a class="menu-item" href="#/dd" data-act="ddTabGo" data-t="${ddAl ? 'CB' : 'CAN'}">${ic('pulse', 'mi')}
          <div class="mi-text">${t('predictive')}<span class="mi-desc">${t('ddDesc')}</span></div>
          ${ddDueN ? `<span class="badge kh-DENHAN">${ddDueN}</span>` : ''}${ddAl ? `<span class="badge dd-D">${ddAl}</span>` : ''}
          ${ic('chev', 'mi-chev')}</a>
        <a class="menu-item" href="#/rca" data-act="rcaTabGo" data-t="${rs.late ? 'HD' : 'MO'}">${ic('target', 'mi')}
          <div class="mi-text">${t('rca')}<span class="mi-desc">${nSug ? `<span class="warn-t">${t('rcaSugN', nSug)}</span>` : t('rcaDesc')}</span></div>
          ${rs.open ? `<span class="badge rc-KHACPHUC">${rs.open}</span>` : ''}${rs.late ? `<span class="badge kh-QUAHAN">${rs.late}</span>` : ''}
          ${ic('chev', 'mi-chev')}</a>
      </div>`
  };
};

/* ---------------------------- Phiếu sửa chữa ---------------------------- */
/* Trạng thái phiếu: MOI (chờ nhận) → DANGXL (đang xử lý) ⇄ CHOVT (chờ vật tư/nhà thầu)
 * → CHODUYET (chờ quản lý duyệt) → DONG (đã đóng). HUY = đã hủy. Máy tự đổi trạng thái ở backend. */

const SC_OPEN = ['MOI', 'DANGXL', 'CHOVT', 'CHODUYET'];
const SC_ORDER = ['MOI', 'DANGXL', 'CHOVT', 'CHODUYET', 'DONG', 'HUY'];
const SC_KTV_EDIT = ['MOI', 'DANGXL', 'CHOVT'];
const SC_TABS = [
  { id: 'XL', key: 'scTabWork', st: ['MOI', 'DANGXL', 'CHOVT'] },
  { id: 'DUYET', key: 'scTabApprove', st: ['CHODUYET'] },
  { id: 'DONG', key: 'scTabClosed', st: ['DONG'] },
  { id: 'ALL', key: 'scTabAll', st: null }
];
const TT_SAU = ['CHAY', 'DUPHONG', 'NGUNG'];   // lựa chọn "trạng thái máy sau khi đóng phiếu"

/* ---- Thời gian ---- */
function pad2(n) { return String(n).padStart(2, '0'); }
function tsNow() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}
function tsToInput(s) { const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/.exec(String(s || '')); return m ? `${m[1]}T${m[2]}` : ''; }
function inputToTs(v) { const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(String(v || '')); return m ? `${m[1]} ${m[2]}:00` : ''; }
function tsMs(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(s || ''));
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)).getTime() : NaN;
}
function minutesSince(s) { const ms = tsMs(s); return isFinite(ms) ? Math.max(0, Math.round((Date.now() - ms) / 60000)) : 0; }
function fmtShort(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(s || ''));
  if (!m) return String(s || '');
  return Number(m[1]) === new Date().getFullYear() ? `${m[3]}/${m[2]} ${m[4]}:${m[5]}` : `${m[3]}/${m[2]}/${m[1].slice(2)} ${m[4]}:${m[5]}`;
}
/** Số phút → { vi: '2 giờ 15 phút', zh: '2小时15分' } */
function fmtDur(min) {
  min = Math.max(0, Math.round(Number(min) || 0));
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
  if (d) return { vi: `${d} ngày${h ? ` ${h} giờ` : ''}`, zh: `${d}天${h ? `${h}小时` : ''}` };
  if (h) return { vi: `${h} giờ${m ? ` ${m} phút` : ''}`, zh: `${h}小时${m ? `${m}分` : ''}` };
  return { vi: `${m} phút`, zh: `${m}分钟` };
}
function durBi(min) { const x = fmtDur(min); return bi(x.vi, x.zh); }

/* ---- Dữ liệu phiếu ---- */
function allSC() { return (S.data && S.data.phieuSC) || []; }
function scBySo(so) { const k = String(so || '').toUpperCase(); return allSC().find(x => String(x.SoPhieu).toUpperCase() === k) || null; }
function scOfTb(id) { const k = String(id || '').toUpperCase(); return allSC().filter(x => String(x.IDThietBi).toUpperCase() === k).sort(scSortDesc); }
function scOpenOfTb(id) { return scOfTb(id).filter(x => SC_OPEN.includes(x.TrangThaiPhieu)); }
function scSortDesc(a, b) { return String(b.TGBao || '').localeCompare(String(a.TGBao || '')) || String(b.SoPhieu).localeCompare(String(a.SoPhieu)); }
function scSortOpen(a, b) { return SC_ORDER.indexOf(a.TrangThaiPhieu) - SC_ORDER.indexOf(b.TrangThaiPhieu) || scSortDesc(a, b); }
function mergeSC(rows) {
  if (!S.data) return;
  const arr = S.data.phieuSC || (S.data.phieuSC = []);
  rows.forEach(sc => {
    const i = arr.findIndex(x => x.SoPhieu === sc.SoPhieu);
    if (i >= 0) arr[i] = sc; else arr.push(sc);
  });
  saveCache();
}
function removeSC(so) {
  if (!S.data || !S.data.phieuSC) return;
  S.data.phieuSC = S.data.phieuSC.filter(x => x.SoPhieu !== so);
  saveCache();
}
function scPill(st) { return `<span class="pill sc-${esc(st)}">${t('sc' + st)}</span>`; }
/** Phút dừng máy: phiếu đã có giờ chạy lại → số đã tính; phiếu đang mở → tính đến bây giờ. */
function scDownMin(sc) {
  if (!isOn(sc.MayDung)) return null;
  if (sc.PhutDungMay !== '' && sc.PhutDungMay !== undefined && sc.PhutDungMay !== null) return { min: Number(sc.PhutDungMay), live: false };
  if (SC_OPEN.includes(sc.TrangThaiPhieu) && sc.TGDung) return { min: minutesSince(sc.TGDung), live: true };
  return null;
}
function scDownHtml(sc) {
  const d = scDownMin(sc);
  if (!isOn(sc.MayDung)) return `<span class="dur">${ic('pulse')}${t('scNoStop')}</span>`;
  if (!d) return '';
  return `<span class="dur${d.live ? ' live' : ''}">${ic('clock')}${t(d.live ? 'scDownLive' : 'scDownTotal', fmtDur(d.min))}</span>`;
}
function uniqueRecent(field, extra) {
  const seen = new Set();
  const out = [];
  (extra || []).concat(allSC().slice().sort(scSortDesc).map(x => x[field])).forEach(v => {
    String(v || '').split(/\s*,\s*/).forEach(p => {
      const s = p.trim();
      if (s && !seen.has(s.toLowerCase()) && out.length < 40) { seen.add(s.toLowerCase()); out.push(s); }
    });
  });
  return out;
}
function datalist(id, values) { return `<datalist id="${id}">${values.map(v => `<option value="${esc(v)}">`).join('')}</datalist>`; }

/* ---- Trang chủ: thẻ phiếu đang mở ---- */
function homeScCard() {
  const open = allSC().filter(x => SC_OPEN.includes(x.TrangThaiPhieu)).sort(scSortOpen);
  const c = st => open.filter(x => x.TrangThaiPhieu === st).length;
  return `<section class="card">
    <div class="card-h">${ic('wrench', open.length ? 'warn' : 'ok')}${t('openTickets')}<span class="count">${open.length}</span></div>
    <div class="sc-counters">
      ${SC_OPEN.map(st => `<a class="scc sc-${st}${c(st) ? ' has' : ''}" href="#/sc" data-act="scTabGo" data-t="${st === 'CHODUYET' ? 'DUYET' : 'XL'}">
        <b>${c(st)}</b>${t('sc' + st)}</a>`).join('')}
    </div>
    ${open.length ? `<div class="mini-list">${open.slice(0, 5).map(x => scMini(x, true)).join('')}</div>`
      : `<div class="empty ok small">${ic('check')}${t('scNoOpen')}</div>`}
    <div class="card-f">
      <a class="btn sm primary" href="#/sc-moi">${ic('plus')}${t('scNew')}</a>
      <span class="sp"></span>
      <a class="link" href="#/sc" data-act="scTabGo" data-t="XL">${t('scViewAll')}</a>
    </div>
  </section>`;
}

function scMini(sc, withTb) {
  const tb = withTb ? tbById(sc.IDThietBi) : null;
  return `<a class="mini sc-${esc(sc.TrangThaiPhieu)}" href="#/sc/${encodeURIComponent(sc.SoPhieu)}">
    <div class="mini-main">
      <div class="mini-top"><span class="sc-no">${esc(sc.SoPhieu)}</span><span class="muted small">${esc(fmtShort(sc.TGBao))}</span></div>
      ${tb ? `<div class="sc-tbline"><span class="tb-id">${esc(tb.ID)}</span> ${esc(tb.TenMay)}</div>` : ''}
      <div class="sc-desc one">${esc(sc.MoTa)}</div>
      ${scDownHtml(sc)}
    </div>
    ${scPill(sc.TrangThaiPhieu)}
  </a>`;
}

/* ---- Trang máy: lịch sử sửa chữa ---- */
function tbScHistory(tb) {
  const list = scOfTb(tb.ID);
  const loading = S.online && !S.scLoaded.has(tb.ID);
  const closed = list.filter(x => x.TrangThaiPhieu === 'DONG');
  const down = closed.reduce((s, x) => s + (Number(x.PhutDungMay) || 0), 0);
  return `<section class="card">
    <div class="card-h">${ic('wrench')}${t('histRepair')}<span class="count">${list.length}</span></div>
    ${closed.length ? `<div class="sc-sum">${t('scHistSum', closed.length, fmtDur(down))}</div>` : ''}
    ${list.length ? `<div class="mini-list">${list.slice(0, 50).map(x => scMini(x, false)).join('')}</div>` : ''}
    ${loading ? `<div class="empty small"><div class="spinner"></div></div>`
      : (list.length ? '' : `<div class="empty small">${t('scNoHistory')}</div>`)}
  </section>`;
}

async function loadTbScHistory(id) {
  if (!S.online || S.scLoaded.has(id)) return;
  S.scLoaded.add(id);
  try {
    const r = await api('listSC', { id });
    mergeSC(r.rows);
  } catch (e) { /* giữ dữ liệu đã có */ }
  const p = route();
  if (p[0] === 'tb' && p[1] && p[1].toUpperCase() === String(id).toUpperCase() && !p[2] && !$('.overlay.open')) {
    const y = window.scrollY; render(true); window.scrollTo(0, y);
  }
}

/* ---- Danh sách phiếu ---- */
function scFiltered() {
  const f = S.scf;
  const tab = SC_TABS.find(x => x.id === f.tab) || SC_TABS[0];
  const n = norm(f.q);
  return allSC().filter(x => {
    if (tab.st && !tab.st.includes(x.TrangThaiPhieu)) return false;
    const tb = tbById(x.IDThietBi);
    if (f.kv && (!tb || tb.ViTri !== f.kv)) return false;
    if (n) {
      const hay = norm([x.SoPhieu, x.IDThietBi, tb && tb.TenMay, tb && tb.TenMayZH, tb && tb.MaNhaMay, x.MoTa, x.NguoiBao,
        x.NguoiNhan, x.NguoiThucHien, x.NguyenNhan, x.CachXuLy, x.VatTu, x.NhaThau].join(' '));
      if (!hay.includes(n)) return false;
    }
    return true;
  }).sort(tab.id === 'XL' ? scSortOpen : scSortDesc);
}

function viewScList() {
  if (!S.data) return loadingView();
  const f = S.scf;
  const cnt = id => { const tb = SC_TABS.find(x => x.id === id); return allSC().filter(x => tb.st && tb.st.includes(x.TrangThaiPhieu)).length; };
  return {
    live: true, restoreScroll: true, title: 'repairTickets', back: 'cv', tab: 'cv',
    html: `
      <div class="toolbar sticky">
        <div class="seg sc-tabs">${SC_TABS.map(x => {
          const lb = tr(x.key);
          const n = x.id === 'XL' || x.id === 'DUYET' ? cnt(x.id) : 0;
          return `<a data-act="scTab" data-t="${x.id}" class="${x.id === f.tab ? 'on' : ''}">${bi(lb.vi, lb.zh)}${n ? `<span class="tcount ${x.id === 'XL' ? 'sc-DANGXL' : 'sc-CHODUYET'}">${n}</span>` : ''}</a>`;
        }).join('')}</div>
        <div class="search">${ic('search')}<input type="search" id="sc-q" value="${esc(f.q)}" placeholder="${esc(tp('scSearch'))}" autocomplete="off"></div>
        <div class="chips">
          <button class="chip${f.kv ? ' on' : ''}" data-act="scFilterKv">${ic('map')}${f.kv ? dmBi('KHUVUC', f.kv) : t('allAreas')}</button>
        </div>
      </div>
      <div class="list-bar">
        <span id="sc-count" class="muted"></span><span class="sp"></span>
        <button class="link" data-act="scCsv">${t('exportCsv')}</button>
      </div>
      <div id="sc-list" class="tb-list"></div>
      <div id="sc-more"></div>
      <a class="fab" href="#/sc-moi" aria-label="${esc(tp('scNew'))}">${ic('plus')}</a>`,
    after: () => {
      drawScList();
      $('#sc-q').addEventListener('input', debounce(e => { S.scf.q = e.target.value; drawScList(); }, 150));
    }
  };
}

function drawScList() {
  const list = scFiltered();
  $('#sc-count').innerHTML = t('scNTickets', list.length);
  const box = $('#sc-list');
  box.innerHTML = list.length ? list.slice(0, 300).map(scItem).join('')
    : `<div class="empty">${ic('wrench')}${allSC().length ? t('noResult') : t('scNoTickets')}</div>`;
  // Phiếu cũ (ngoài 180 ngày) chỉ tải khi cần
  const more = $('#sc-more');
  const left = (S.data.scOld || 0) - S.scOldLoaded;
  more.innerHTML = (S.scf.tab === 'DONG' || S.scf.tab === 'ALL') && left > 0
    ? `<button class="btn block" data-act="scLoadOld">${ic('download')}${t('scLoadOld', left)}</button>` : '';
}

function scItem(sc) {
  const tb = tbById(sc.IDThietBi);
  return `<a class="sc-item sc-${esc(sc.TrangThaiPhieu)}" href="#/sc/${encodeURIComponent(sc.SoPhieu)}">
    <div class="tb-top"><span class="sc-no">${esc(sc.SoPhieu)}</span>${scPill(sc.TrangThaiPhieu)}<span class="sp"></span><span class="muted small">${esc(fmtShort(sc.TGBao))}</span></div>
    <div class="sc-tbline"><span class="tb-id">${esc(sc.IDThietBi)}</span> ${tb ? bi(tb.TenMay, tb.TenMayZH, 'tb-name') : ''}</div>
    <div class="sc-desc">${esc(sc.MoTa)}</div>
    <div class="sc-meta">${tb ? dmBi('KHUVUC', tb.ViTri, 'meta') : ''}<span class="sp"></span>${scDownHtml(sc)}</div>
  </a>`;
}

async function scLoadOld(btn) {
  if (!needOnline() || S.scOldBusy) return;
  S.scOldBusy = true;
  btn.disabled = true; btn.classList.add('loading');
  try {
    const r = await api('listSC', { old: true, offset: S.scOldLoaded, limit: 200 });
    S.scOldLoaded += r.rows.length;
    S.data.scOld = r.total;
    mergeSC(r.rows);
    drawScList();
  } catch (e) {
    if (e.code !== 'AUTH') toast(errText(e), 'err');
  } finally { S.scOldBusy = false; if (btn.isConnected) { btn.disabled = false; btn.classList.remove('loading'); } }
}

const SC_CSV = [
  ['SoPhieu', 'Số phiếu', '单号'], ['TrangThaiPhieu', 'Trạng thái', '状态'], ['IDThietBi', 'ID', ''],
  ['_TenMay', 'Tên máy', '设备名称'], ['_KhuVuc', 'Khu vực', '区域'], ['MoTa', 'Mô tả hư hỏng', '故障描述'],
  ['NguoiBao', 'Người báo', '报修人'], ['TGBao', 'Thời gian báo', '报修时间'], ['MayDung', 'Máy dừng', '是否停机'],
  ['TGDung', 'Máy dừng lúc', '停机时间'], ['NguoiNhan', 'Người nhận', '接单人'], ['TGNhan', 'Nhận lúc', '接单时间'],
  ['LyDoCho', 'Lý do chờ', '等待原因'], ['LoaiHong', 'Loại hư hỏng', '故障类别'], ['NguyenNhan', 'Nguyên nhân', '故障原因'],
  ['CachXuLy', 'Cách xử lý', '处理措施'], ['VatTu', 'Vật tư thay thế', '更换备件'], ['NhaThau', 'Nhà thầu', '外协单位'],
  ['NguoiThucHien', 'Người thực hiện', '执行人'], ['TGHoanThanh', 'Hoàn thành lúc', '完成时间'],
  ['TGChayLai', 'Máy chạy lại lúc', '恢复运行时间'], ['PhutPhanHoi', 'Phản hồi (phút)', '响应（分钟）'],
  ['PhutSua', 'Sửa (phút)', '维修（分钟）'], ['PhutCho', 'Chờ vật tư (phút)', '待料（分钟）'],
  ['PhutDungMay', 'Dừng máy (phút)', '停机（分钟）'], ['NguoiDuyet', 'Người duyệt', '审核人'],
  ['TGDuyet', 'Duyệt lúc', '审核时间'], ['YKienDuyet', 'Ý kiến duyệt', '审核意见'], ['LyDoHuy', 'Lý do hủy', '作废原因'],
  ['PhieuNguon', 'Từ phiếu', '来源单号']
];
function exportScCsv() {
  const list = scFiltered();
  const rows = [SC_CSV.map(c => c[2] ? `${c[1]} / ${c[2]}` : c[1])].concat(list.map(x => {
    const tb = tbById(x.IDThietBi);
    return SC_CSV.map(c => {
      const f = c[0];
      if (f === '_TenMay') return tb ? tb.TenMay : '';
      if (f === '_KhuVuc') return tb ? dmVi('KHUVUC', tb.ViTri) : '';
      if (f === 'TrangThaiPhieu') return tr('sc' + x.TrangThaiPhieu).vi;
      if (f === 'MayDung') return isOn(x.MayDung) ? 'Có' : 'Không';
      if (f === 'LoaiHong') return x.LoaiHong ? dmVi('LOAIHONG', x.LoaiHong) : '';
      return x[f] || '';
    });
  }));
  const d = new Date();
  downloadCsv(`phieu-sua-chua_${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}.csv`, rows);
}

/* ---- Chi tiết phiếu ---- */
VIEWS.sc = p => {
  if (p[1] && p[2] === 'sua') return viewScForm('edit', p[1]);
  if (p[1] && p[2] === 'xong') return viewScForm('done', p[1]);
  if (p[1]) return viewScDetail(p[1]);
  return viewScList();
};
VIEWS['sc-moi'] = p => viewScForm('new', null, p[1], p[2]);

function viewScDetail(so) {
  if (!S.data) return loadingView();
  const sc = scBySo(so);
  if (!sc) {
    if (S.online) {
      setTimeout(() => fetchMissingSC(so), 0);
      return { title: 'scDetail', back: 'sc', tab: 'cv', html: `<div class="card pad center"><div class="spinner"></div><p class="muted">${t('loading')}</p></div>` };
    }
    return { title: 'scDetail', back: 'sc', tab: 'cv', html: `<div class="empty">${ic('search')}${t('scNotFound', so)}</div>` };
  }
  const tb = tbById(sc.IDThietBi);
  const st = sc.TrangThaiPhieu;
  const may = isOn(sc.MayDung);
  const ql = isQL();
  const enc = encodeURIComponent(sc.SoPhieu);
  const kv = (key, val, raw) => (val === '' || val === null || val === undefined) ? '' :
    `<div class="kv"><div class="k">${t(key)}</div><div class="v">${raw ? val : esc(val)}</div></div>`;
  const kvCol = (key, val) => val ? `<div class="kv col"><div class="k">${t(key)}</div><div class="v pre">${esc(val)}</div></div>` : '';
  const hasResult = sc.LoaiHong || sc.NguyenNhan || sc.CachXuLy || sc.VatTu || sc.NhaThau || sc.NguoiThucHien;

  // Nút thao tác theo trạng thái + vai trò
  const main = [];
  if (st === 'MOI') main.push(`<button class="btn primary" data-act="scOp" data-op="nhan" data-so="${esc(sc.SoPhieu)}">${ic('userCheck')}${t('scDoNhan')}</button>`);
  if (st === 'DANGXL') {
    main.push(`<button class="btn" data-act="scOp" data-op="cho" data-so="${esc(sc.SoPhieu)}">${ic('pause')}${t('scDoCho')}</button>`);
    main.push(`<a class="btn primary" href="#/sc/${enc}/xong">${ic('checkCircle')}${t('scDoXong')}</a>`);
  }
  if (st === 'CHOVT') main.push(`<button class="btn primary" data-act="scOp" data-op="tieptuc" data-so="${esc(sc.SoPhieu)}">${ic('play')}${t('scDoTiepTuc')}</button>`);
  if (st === 'CHODUYET' && ql) {
    main.push(`<button class="btn" data-act="scOp" data-op="tralai" data-so="${esc(sc.SoPhieu)}">${ic('undo')}${t('scDoTraLai')}</button>`);
    main.push(`<button class="btn primary" data-act="scOp" data-op="duyet" data-so="${esc(sc.SoPhieu)}">${ic('checkCircle')}${t('scDoDuyet')}</button>`);
  }
  const canEdit = ql || SC_KTV_EDIT.includes(st);
  const canCancel = SC_OPEN.includes(st) && (ql || st === 'MOI');
  // Phân tích RCA: phiếu chưa hủy, chưa có RCA, không nằm trong gợi ý (gợi ý đã có nút riêng)
  const canRca = st !== 'HUY' && !rcaOfSc(sc.SoPhieu).some(r => r.TrangThai !== 'HUY') && !rcaSuggest(sc);

  const notices = [];
  if (st === 'CHOVT') notices.push(`<div class="notice wait">${ic('pause')}<div>${t('scWaitingFor', sc.LyDoCho || '')}</div></div>`);
  if (st === 'DANGXL' && Number(sc.SoLanTraLai) > 0) notices.push(`<div class="notice warn">${ic('undo')}<div>${t('scReturnedNote', sc.LyDoTraLai || '')}</div></div>`);
  if (st === 'CHODUYET' && !ql) notices.push(`<div class="notice">${ic('info')}<div>${t('scWaitApprove')}</div></div>`);
  if (st === 'HUY') notices.push(`<div class="notice warn">${ic('ban')}<div>${t('scCancelledNote', sc.LyDoHuy || '')}</div></div>`);

  const down = scDownMin(sc);
  const waitLive = st === 'CHOVT' && sc.TGBatDauCho ? minutesSince(sc.TGBatDauCho) : 0;
  const waitTotal = (Number(sc.PhutCho) || 0) + waitLive;
  return {
    live: true, title: 'scDetail', back: 'sc', tab: 'cv',
    html: `
      <section class="card hero sc-${esc(st)}">
        <div class="hero-main">
          <div class="hero-ids"><span class="sc-no big">${esc(sc.SoPhieu)}</span>${scPill(st)}</div>
          <div class="sc-desc full">${esc(sc.MoTa)}</div>
          ${scDownHtml(sc)}
        </div>
      </section>
      ${notices.join('')}
      ${scSourceLink(sc.PhieuNguon)}
      ${scRcaBlock(sc)}
      ${tb ? `<a class="card tb-link ${statusCls(tb.TrangThai)}" href="#/tb/${encodeURIComponent(tb.ID)}">
          <div class="grow"><div class="mini-top"><span class="tb-id">${esc(tb.ID)}</span>${tb.MaNhaMay ? `<span class="tb-ma">${esc(tb.MaNhaMay)}</span>` : ''}</div>
            ${bi(tb.TenMay, tb.TenMayZH, 'tb-name')}${dmBi('KHUVUC', tb.ViTri, 'meta')}</div>
          ${pill(tb.TrangThai)}${ic('chev', 'mi-chev')}</a>`
        : `<div class="card pad slim"><span class="tb-id">${esc(sc.IDThietBi)}</span></div>`}
      <div class="actions-row">
        ${canEdit ? `<a class="btn sm" href="#/sc/${enc}/sua">${ic('edit')}${t('edit')}</a>` : ''}
        ${canCancel ? `<button class="btn sm" data-act="scOp" data-op="huy" data-so="${esc(sc.SoPhieu)}">${ic('ban')}${t('scDoHuy')}</button>` : ''}
        ${canRca ? `<a class="btn sm" href="#/rca-moi/${enc}">${ic('target')}${t('rcaDo')}</a>` : ''}
        <button class="btn sm" data-act="printSc02" data-so="${esc(sc.SoPhieu)}">${ic('print')}${t('pPrintShort')}</button>
      </div>
      <section class="card">
        <div class="card-h">${ic('log')}${t('scProgress')}</div>
        ${scStepper(sc)}
      </section>
      <section class="card">
        <div class="card-h">${ic('alert')}${t('scReportInfo')}</div>
        ${kv('scNguoiBao', sc.NguoiBao)}
        ${kv('scTGBao', fmtTime(sc.TGBao))}
        ${kv('scMayDung', may ? `<span class="tag bad">${t('scYesStop')}</span>` : `<span class="tag ok">${t('scNoStop')}</span>`, true)}
        ${may ? kv('scTGDung', fmtTime(sc.TGDung)) : ''}
        ${kv('scNguoiLap', `${esc(sc.NguoiTao || '')} · ${esc(fmtTime(sc.NgayTao))}`, true)}
      </section>
      ${hasResult ? `<section class="card">
        <div class="card-h">${ic('wrench')}${t('scResult')}</div>
        ${sc.LoaiHong ? kv('scLoaiHong', dmBi('LOAIHONG', sc.LoaiHong), true) : ''}
        ${kvCol('scNguyenNhan', sc.NguyenNhan)}
        ${kvCol('scCachXuLy', sc.CachXuLy)}
        ${kvCol('scVatTu', sc.VatTu)}
        ${kv('scNhaThau', sc.NhaThau)}
        ${kv('scNguoiThucHien', sc.NguoiThucHien)}
        ${kv('scTGHoanThanh', fmtTime(sc.TGHoanThanh))}
        ${may ? kv('scTGChayLai', fmtTime(sc.TGChayLai)) : ''}
        ${may && sc.TTMaySau ? kv('scTTMaySau', pill(sc.TTMaySau), true) : ''}
      </section>` : ''}
      <section class="card">
        <div class="card-h">${ic('clock')}${t('scDurations')}</div>
        <div class="dur-grid">
          ${durCell('scDurResp', sc.PhutPhanHoi !== '' && sc.PhutPhanHoi !== undefined ? Number(sc.PhutPhanHoi) : (st === 'MOI' ? minutesSince(sc.TGBao) : null), st === 'MOI')}
          ${durCell('scDurRepair', sc.PhutSua !== '' && sc.PhutSua !== undefined ? Number(sc.PhutSua) : null, false)}
          ${durCell('scDurWait', waitTotal || null, !!waitLive)}
          ${durCell('scDurDown', down ? down.min : null, down && down.live, !may)}
        </div>
      </section>
      ${st === 'DONG' ? `<section class="card">
        <div class="card-h">${ic('checkCircle', 'ok')}${t('scApproval')}</div>
        ${kv('scNguoiDuyet', `${esc(sc.NguoiDuyet || '')} · ${esc(fmtTime(sc.TGDuyet))}`, true)}
        ${kvCol('scYKien', sc.YKienDuyet)}
      </section>` : ''}
      ${Number(sc.SoLanTraLai) > 0 && st !== 'DANGXL' ? `<p class="muted small audit">${t('scReturnedCount', sc.SoLanTraLai)}: ${esc(sc.LyDoTraLai)}</p>` : ''}
      ${sc.GhiChu ? `<section class="card">${kvCol('fGhiChu', sc.GhiChu)}</section>` : ''}
      <p class="muted small audit">${t('updatedBy', fmtTime(sc.NgaySua), sc.NguoiSua || '—')}</p>
      ${ql ? `<button class="btn block danger-outline" data-act="scDelete" data-so="${esc(sc.SoPhieu)}">${ic('trash')}${t('scDelete')}</button>` : ''}
      ${main.length ? `<div class="form-actions">${main.join('')}</div>` : ''}`
  };
}

function durCell(key, min, live, na) {
  return `<div class="dcell${live ? ' live' : ''}">
    <div class="dk">${t(key)}</div>
    <div class="dv">${na ? `<span class="muted">${t('scNA')}</span>` : (min === null || min === undefined || isNaN(min) ? '<span class="muted">—</span>' : durBi(min))}</div>
  </div>`;
}

function scStepper(sc) {
  const st = sc.TrangThaiPhieu;
  const who = (a, b) => [a ? fmtTime(a) : '', b || ''].filter(Boolean).join(' · ');
  const steps = [
    { key: 'scStepBao', done: true, sub: who(sc.TGBao, sc.NguoiBao || sc.NguoiTao) },
    { key: 'scStepNhan', done: !!sc.TGNhan, sub: who(sc.TGNhan, sc.NguoiNhan) },
    { key: 'scStepXong', done: !!sc.TGHoanThanh && ['CHODUYET', 'DONG'].includes(st), sub: who(sc.TGHoanThanh, sc.NguoiThucHien) },
    { key: 'scStepDuyet', done: st === 'DONG', sub: who(sc.TGDuyet, sc.NguoiDuyet) }
  ];
  if (Number(sc.PhutCho) > 0 || st === 'CHOVT') {
    steps.splice(2, 0, { key: 'scStepCho', done: st !== 'CHOVT', wait: st === 'CHOVT', sub: sc.LyDoCho || '' });
  }
  let curSet = false;
  const items = steps.map(s => {
    let cls = s.done ? 'done' : 'todo';
    if (!s.done && !curSet && SC_OPEN.includes(st)) { cls = s.wait ? 'cur wait' : 'cur'; curSet = true; }
    return `<li class="${cls}"><span class="sdot"></span>${t(s.key)}${s.sub && (s.done || s.wait) ? `<div class="st-s">${esc(s.sub)}</div>` : ''}</li>`;
  });
  if (st === 'HUY') items.push(`<li class="bad"><span class="sdot"></span>${t('scHUY')}<div class="st-s">${esc(fmtTime(sc.NgaySua))} · ${esc(sc.NguoiSua || '')}</div></li>`);
  return `<ol class="stepper">${items.join('')}</ol>`;
}

async function fetchMissingSC(so) {
  try {
    const r = await api('listSC', { so });
    mergeSC(r.rows);
  } catch (e) { /* hiển thị không tìm thấy */ }
  const p = route();
  if (p[0] !== 'sc' || !p[1] || p[1].toUpperCase() !== String(so).toUpperCase()) return;
  if (scBySo(so)) render(true);
  else $('#view .page').innerHTML = `<div class="empty">${ic('search')}${t('scNotFound', so)}</div>`;
}

/* ---- Biểu mẫu: tạo (new) · sửa (edit) · hoàn thành (done) ---- */
/** Liên kết tới phiếu sinh ra phiếu sửa chữa này (VD phiếu bảo trì có hạng mục không đạt) */
function scSourceLink(src) {
  if (!src) return '';
  if (/^BT-/i.test(src)) return `<a class="notice src-link" href="#/bt/${encodeURIComponent(src)}">${ic('checklist')}<div>${t('scFromBt', src)}</div>${ic('chev')}</a>`;
  if (/^KT-/i.test(src)) return `<a class="notice src-link" href="#/kt/${encodeURIComponent(src)}">${ic('checklist')}<div>${t('scFromKt', src)}</div>${ic('chev')}</a>`;
  if (/^DD-/i.test(src)) return `<a class="notice src-link" href="#/dd/${encodeURIComponent(src)}">${ic('pulse')}<div>${t('scFromDd', src)}</div>${ic('chev')}</a>`;
  return `<div class="notice">${ic('info')}<div>${t('scFromSrc', src)}</div></div>`;
}

function viewScForm(mode, so, tbId, src) {
  if (!S.data) return loadingView();
  let cur = null;
  if (mode !== 'new') {
    cur = scBySo(so);
    if (!cur) return { title: 'scDetail', back: 'sc', tab: 'cv', html: `<div class="empty">${t('scNotFound', so)}</div>` };
    const st = cur.TrangThaiPhieu;
    if (mode === 'edit' && !(isQL() || SC_KTV_EDIT.includes(st))) return forbiddenView('sc/' + encodeURIComponent(cur.SoPhieu));
    if (mode === 'done' && st !== 'DANGXL') {
      return { title: 'scDoneTitle', back: 'sc/' + encodeURIComponent(cur.SoPhieu), tab: 'cv', html: `<div class="notice warn">${ic('alert')}<div>${t('eBadState')}</div></div>` };
    }
  }
  const pre = tbId ? tbById(tbId) : null;
  const nowTs = tsNow();
  const srcBt = mode === 'new' && src ? btBySo(src) : null;
  const srcKt = mode === 'new' && src && !srcBt ? ktBySo(src) : null;
  const srcDd = mode === 'new' && src && !srcBt && !srcKt ? ddBySo(src) : null;
  const F = S.scForm = cur ? Object.assign({}, cur) : {
    IDThietBi: pre && pre.TrangThai !== 'THANHLY' ? pre.ID : '', MoTa: '', NguoiBao: '', TGBao: nowTs, MayDung: '1', TGDung: nowTs, GhiChu: ''
  };
  if (srcBt) {
    // Tạo từ phiếu bảo trì: điền sẵn mô tả các hạng mục không đạt, mặc định máy vẫn chạy
    F.PhieuNguon = srcBt.SoPhieu;
    F.MoTa = scMoTaFromBt(srcBt);
    F.NguoiBao = S.name;
    F.MayDung = '0';
    F.TGDung = '';
    if (!S.btKQ[srcBt.SoPhieu] && S.online) setTimeout(() => loadBtKQ(srcBt.SoPhieu), 0);
  } else if (srcKt) {
    // Tạo từ phiếu kiểm tra đầu ca có hạng mục không đạt
    F.PhieuNguon = srcKt.SoPhieu;
    F.MoTa = scMoTaFromKt(srcKt);
    F.NguoiBao = srcKt.NguoiKiemTra || S.name;
    F.MayDung = '0';
    F.TGDung = '';
  } else if (srcDd) {
    // Tạo từ phiếu đo dự đoán có điểm mức C/D
    F.PhieuNguon = srcDd.SoPhieu;
    F.MoTa = scMoTaFromDd(srcDd);
    F.NguoiBao = srcDd.NguoiDo || S.name;
    F.MayDung = '0';
    F.TGDung = '';
  }
  if (isOn(F.MayDung) && !F.TGDung) F.TGDung = F.TGBao;
  S.scFormMode = mode;
  S.scFormOrig = cur ? cur.NgaySua : undefined;
  const st = cur ? cur.TrangThaiPhieu : 'MOI';
  const may = isOn(F.MayDung);
  const ql = isQL();
  if (mode === 'done') {
    F.NguoiThucHien = F.NguoiThucHien || F.NguoiNhan || S.name;
    F.TGHoanThanh = F.TGHoanThanh || tsNow();
    F.TGChayLai = F.TGChayLai || '';
    F.TTMaySau = F.TTMaySau || (TT_SAU.includes(F.TTMayTruoc) ? F.TTMayTruoc : 'CHAY');
  }
  const resultReq = mode === 'done' || st === 'CHODUYET' || st === 'DONG';
  const showResult = mode === 'done' || (mode === 'edit' && st !== 'MOI');
  const showFinishTimes = mode === 'done' || (mode === 'edit' && ql && (st === 'CHODUYET' || st === 'DONG'));
  const showTTSau = may && (mode === 'done' || (mode === 'edit' && ql && st === 'CHODUYET'));
  const names = uniqueRecent('NguoiThucHien', [S.name].concat(allSC().map(x => x.NguoiNhan)));
  const title = { new: 'scNewTitle', edit: 'scEditTitle', done: 'scDoneTitle' }[mode];
  const back = cur ? 'sc/' + encodeURIComponent(cur.SoPhieu) : (pre ? 'tb/' + encodeURIComponent(pre.ID) : 'sc');
  const tbSel = F.IDThietBi ? tbById(F.IDThietBi) : null;

  const summary = cur && mode === 'done' ? `<section class="card pad slim sc-sumcard">
      <div class="mini-top"><span class="sc-no">${esc(cur.SoPhieu)}</span>${scPill(st)}</div>
      ${tbSel ? `<div class="sc-tbline"><span class="tb-id">${esc(tbSel.ID)}</span> ${bi(tbSel.TenMay, tbSel.TenMayZH, 'tb-name')}</div>` : ''}
      <div class="sc-desc full">${esc(cur.MoTa)}</div>
      <div class="sum-times">
        <div>${t('scTGBao')}<b>${esc(fmtTime(cur.TGBao))}</b></div>
        ${may ? `<div>${t('scTGDung')}<b>${esc(fmtTime(cur.TGDung))}</b></div>` : ''}
        <div>${t('scTGNhan')}<b>${esc(fmtTime(cur.TGNhan))}</b></div>
        ${Number(cur.PhutCho) > 0 ? `<div>${t('scDurWait')}<b>${durBi(Number(cur.PhutCho))}</b></div>` : ''}
      </div>
    </section>` : '';

  const tbBlock = mode === 'new'
    ? `<div class="fld" data-fld="IDThietBi" data-req="1"><span class="lb">${t('scMay')} <b class="req">*</b></span>
        <button type="button" class="select" data-act="scPickTb">${scTbLabel(F.IDThietBi)}${ic('down')}</button><span class="fe"></span></div>
       <div id="sc-dup">${scDupNotice(F.IDThietBi)}</div>`
    : `<div class="fld"><span class="lb">${t('scMay')}</span>
        <div class="static">${tbSel ? `<span class="tb-id">${esc(tbSel.ID)}</span> ${bi(tbSel.TenMay, tbSel.TenMayZH)}` : esc(F.IDThietBi)}</div></div>`;

  return {
    title, back, tab: 'cv', noPtr: true,
    html: `
      <form id="f-sc" class="form" autocomplete="off" novalidate>
        ${summary}
        ${mode === 'new' ? scSourceLink(F.PhieuNguon) : ''}
        ${mode !== 'done' ? `<section class="card pad">
          <div class="card-h flat">${ic('alert')}${t('scReportInfo')}</div>
          ${tbBlock}
          ${scArea('MoTa', 'scMoTa', 3, true, 'scMoTaPh')}
          ${scText('NguoiBao', 'scNguoiBao', false, 'maxlength="100" list="dl-nb"', 'scNguoiBaoPh')}
          ${scTime('TGBao', 'scTGBao', true)}
          <label class="switch" data-fld="MayDung"><input type="checkbox" data-sf="MayDung" id="sc-may" ${may ? 'checked' : ''}><span class="sw"></span>${t('scMayDungQ')}</label>
          <div data-show="may" ${may ? '' : 'hidden'}>${scTime('TGDung', 'scTGDung', true)}</div>
          ${mode === 'new' ? `<p class="muted small">${t('scMayDungHint')}</p>` : ''}
        </section>` : ''}
        ${mode === 'new' ? `<section class="card pad">
          <label class="switch"><input type="checkbox" id="sc-nhan"><span class="sw"></span>${t('scNhanLuon')}</label>
          <div data-show="nhan" hidden>${scTime('TGNhan', 'scTGNhanStart', false, tsNow())}</div>
        </section>` : ''}
        ${mode === 'edit' && cur.TGNhan ? `<section class="card pad">
          <div class="card-h flat">${ic('userCheck')}${t('scStepNhan')}</div>
          ${scText('NguoiNhan', 'scNguoiNhan', true, 'maxlength="60" list="dl-ng"')}${scTime('TGNhan', 'scTGNhan', true)}
        </section>` : ''}
        ${showResult ? `<section class="card pad">
          <div class="card-h flat">${ic('wrench')}${t('scResult')}</div>
          ${mode === 'edit' && st === 'DANGXL' ? `<p class="muted small">${t('scResultDraftHint')}</p>` : ''}
          <div class="fld" data-fld="LoaiHong" ${resultReq ? 'data-req="1"' : ''}><span class="lb">${t('scLoaiHong')}${resultReq ? ' <b class="req">*</b>' : ''}</span>
            <button type="button" class="select" data-act="scPickLoai">${F.LoaiHong ? dmBi('LOAIHONG', F.LoaiHong) : `<span class="muted">${t('choose')}</span>`}${ic('down')}</button><span class="fe"></span></div>
          ${scArea('NguyenNhan', 'scNguyenNhan', 2, resultReq, 'scNguyenNhanPh')}
          ${scArea('CachXuLy', 'scCachXuLy', 2, resultReq, 'scCachXuLyPh')}
          ${scArea('VatTu', 'scVatTu', 2, false, 'scVatTuPh')}
          ${scText('NhaThau', 'scNhaThau', false, 'maxlength="150" list="dl-nt"', 'scNhaThauPh')}
          ${scText('NguoiThucHien', 'scNguoiThucHien', resultReq, 'maxlength="150" list="dl-ng"', 'scNguoiThucHienPh')}
        </section>` : ''}
        ${showFinishTimes ? `<section class="card pad">
          <div class="card-h flat">${ic('clock')}${t('scFinishTimes')}</div>
          ${scTime('TGHoanThanh', 'scTGHoanThanh', true)}
          ${may ? `<div data-show="may">${scTime('TGChayLai', 'scTGChayLai', true, mode === 'done' ? '' : undefined)}
            ${mode === 'done' ? `<p class="muted small">${t('scChayLaiHint')}</p>` : ''}</div>` : ''}
        </section>` : ''}
        ${showTTSau ? `<section class="card pad" data-show="may">
          <div class="fld" data-fld="TTMaySau"><span class="lb">${t('scTTMaySau')} <b class="req">*</b></span>
            <div class="seg">${TT_SAU.filter(c => dmGet('TRANGTHAI', c)).map(c => `<label><input type="radio" name="TTMaySau" value="${c}" data-sf="TTMaySau" ${F.TTMaySau === c ? 'checked' : ''}><span>${dmBi('TRANGTHAI', c)}</span></label>`).join('')}</div>
            <span class="fe"></span></div>
          <p class="muted small">${t('scTTMaySauHint')}</p>
        </section>` : ''}
        ${mode === 'edit' && ql && st === 'DONG' ? `<section class="card pad">${scArea('YKienDuyet', 'scYKien', 2, false)}</section>` : ''}
        ${mode === 'edit' && ql && st === 'HUY' ? `<section class="card pad">${scArea('LyDoHuy', 'scLyDoHuy', 2, true)}</section>` : ''}
        <section class="card pad">
          ${scArea('GhiChu', 'fGhiChu', 2, false)}
          ${mode === 'done' && ql ? `<label class="switch"><input type="checkbox" id="sc-duyet" checked><span class="sw"></span>${t('scDuyetLuon')}</label>` : ''}
        </section>
        ${datalist('dl-nb', uniqueRecent('NguoiBao'))}${datalist('dl-nt', uniqueRecent('NhaThau'))}${datalist('dl-ng', names)}
        <div class="form-actions">
          <a class="btn" href="#/${back}">${t('cancel')}</a>
          <button class="btn primary" type="submit">${ic('check')}${t(mode === 'done' ? 'scDoXong' : (mode === 'new' ? 'scCreate' : 'save'))}</button>
        </div>
      </form>`,
    after: () => {
      const form = $('#f-sc');
      form.addEventListener('submit', saveScForm);
      form.addEventListener('input', clearFieldErr);
      const mayBox = $('#sc-may');
      const dung = $('[data-sf="TGDung"]', form);
      const bao = $('[data-sf="TGBao"]', form);
      if (mayBox) mayBox.addEventListener('change', () => {
        $$('[data-show="may"]', form).forEach(el => { el.hidden = !mayBox.checked; });
        if (mayBox.checked && dung && !dung.value && bao) dung.value = bao.value;
      });
      // Giờ máy dừng đi theo giờ báo hỏng cho tới khi người dùng tự sửa
      if (dung && bao) {
        let touched = mode !== 'new' && dung.value !== bao.value;
        dung.addEventListener('input', () => { touched = true; });
        bao.addEventListener('input', () => { if (!touched) dung.value = bao.value; });
      }
      const nhan = $('#sc-nhan');
      if (nhan) nhan.addEventListener('change', () => { $('[data-show="nhan"]', form).hidden = !nhan.checked; });
      if (mode === 'done' && may) {
        // Giờ chạy lại mặc định = giờ hoàn thành (đổi được)
        const done = $('[data-sf="TGHoanThanh"]', form), run = $('[data-sf="TGChayLai"]', form);
        if (run && !run.value) run.value = done.value;
        let touched = false;
        run.addEventListener('input', () => { touched = true; });
        done.addEventListener('input', () => { if (!touched) run.value = done.value; });
      }
      if (mode === 'new' && !F.IDThietBi) setTimeout(() => { const b = $('[data-act="scPickTb"]'); if (b && !tbId) b.focus(); }, 50);
    }
  };
}

function scText(f, key, req, attrs, ph) {
  return `<label class="fld" data-fld="${f}" ${req ? 'data-req="1"' : ''}><span class="lb">${t(key)}${req ? ' <b class="req">*</b>' : ''}</span>
    <input data-sf="${f}" value="${esc(S.scForm[f] || '')}" ${attrs || ''} ${ph ? `placeholder="${esc(tp(ph))}"` : ''}><span class="fe"></span></label>`;
}
function scArea(f, key, rows, req, ph) {
  return `<label class="fld" data-fld="${f}" ${req ? 'data-req="1"' : ''}><span class="lb">${t(key)}${req ? ' <b class="req">*</b>' : ''}</span>
    <textarea data-sf="${f}" rows="${rows}" maxlength="2000" ${ph ? `placeholder="${esc(tp(ph))}"` : ''}>${esc(S.scForm[f] || '')}</textarea><span class="fe"></span></label>`;
}
function scTime(f, key, req, def) {
  const v = def !== undefined ? def : S.scForm[f];
  return `<label class="fld" data-fld="${f}" ${req ? 'data-req="1"' : ''}><span class="lb">${t(key)}${req ? ' <b class="req">*</b>' : ''}</span>
    <input type="datetime-local" data-sf="${f}" value="${esc(tsToInput(v))}"><span class="fe"></span></label>`;
}
function scTbLabel(id) {
  const tb = id ? tbById(id) : null;
  return tb ? `<span class="grow"><span class="tb-id">${esc(tb.ID)}</span> ${bi(tb.TenMay, tb.TenMayZH)}</span>` : `<span class="muted">${t('scChooseTb')}</span>`;
}
function scDupNotice(id) {
  const open = id ? scOpenOfTb(id) : [];
  if (!open.length) return '';
  return `<div class="notice warn">${ic('alert')}<div>${t('scDupWarn')}
    ${open.map(x => `<a class="link" href="#/sc/${encodeURIComponent(x.SoPhieu)}">${esc(x.SoPhieu)}</a>`).join(' ')}</div></div>`;
}

function scCollect(form) {
  const o = {};
  $$('[data-sf]', form).forEach(el => {
    const f = el.dataset.sf;
    if (el.type === 'radio') { if (el.checked) o[f] = el.value; return; }
    if (el.type === 'checkbox') { o[f] = el.checked ? '1' : '0'; return; }
    if (el.type === 'datetime-local') { o[f] = inputToTs(el.value); return; }
    o[f] = el.value.trim();
  });
  if ($('[data-fld="IDThietBi"]', form)) o.IDThietBi = S.scForm.IDThietBi || '';
  if ($('[data-fld="LoaiHong"]', form)) o.LoaiHong = S.scForm.LoaiHong || '';
  if (form.id === 'f-sc' && S.scFormMode === 'new' && S.scForm.PhieuNguon) o.PhieuNguon = S.scForm.PhieuNguon;
  return o;
}

function clearFieldErr(e) {
  const box = e.target.closest('.has-err');
  if (!box) return;
  box.classList.remove('has-err');
  const fe = $('.fe', box);
  if (fe) fe.innerHTML = '';
}

function scFieldErr(form, f, key, args) {
  const box = $(`[data-fld="${f}"]`, form);
  if (!box || box.closest('[hidden]')) return false;
  box.classList.add('has-err');
  const fe = $('.fe', box);
  if (fe) fe.innerHTML = t(key, ...(args || []));
  return true;
}

function scShowErrors(form, errors) {
  let shown = 0;
  errors.forEach(x => {
    const args = x.reason === 'TIME_ORDER' && x.after ? [scFieldName(x.after)] : [];
    if (scFieldErr(form, x.field, x.reason === 'TIME_ORDER' && x.after ? 'eTimeAfter' : reasonKey(x.reason), args)) shown++;
    else toast(tr('eFieldX', [scFieldName(x.field), tr(reasonKey(x.reason))]), 'err');
  });
  if (shown) toast('eInvalid', 'err');
  const first = $('.has-err', form);
  if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

const SC_FIELD_KEYS = {
  IDThietBi: 'scMay', MoTa: 'scMoTa', NguoiBao: 'scNguoiBao', TGBao: 'scTGBao', TGDung: 'scTGDung', NguoiNhan: 'scNguoiNhan',
  TGNhan: 'scTGNhan', LyDoCho: 'scLyDoCho', TGBatDauCho: 'scTGCho', TGTiepTuc: 'scTGTiepTuc', LoaiHong: 'scLoaiHong',
  NguyenNhan: 'scNguyenNhan', CachXuLy: 'scCachXuLy', NguoiThucHien: 'scNguoiThucHien', TGHoanThanh: 'scTGHoanThanh',
  TGChayLai: 'scTGChayLai', TTMaySau: 'scTTMaySau', LyDoTraLai: 'scLyDoTraLai', LyDoHuy: 'scLyDoHuy'
};
/** Tên ô song ngữ {vi, zh} để ghép vào thông báo lỗi */
function scFieldName(f) { return SC_FIELD_KEYS[f] ? tr(SC_FIELD_KEYS[f]) : { vi: f, zh: f }; }

async function saveScForm(ev) {
  ev.preventDefault();
  if (!needOnline()) return;
  const form = ev.target;
  const mode = S.scFormMode;
  $$('.has-err', form).forEach(el => { el.classList.remove('has-err'); const fe = $('.fe', el); if (fe) fe.innerHTML = ''; });
  const o = scCollect(form);
  // Kiểm tra nhanh các ô bắt buộc đang hiển thị (backend kiểm tra lại đầy đủ)
  let bad = false;
  $$('[data-req="1"]', form).forEach(box => {
    if (box.closest('[hidden]')) return;
    const f = box.dataset.fld;
    if (!String(o[f] || '').trim()) { scFieldErr(form, f, 'eRequired'); bad = true; }
  });
  if (bad) { toast('eInvalid', 'err'); const first = $('.has-err', form); if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
  const payload = { sc: o };
  let op;
  if (mode === 'new') {
    op = 'create';
    const nhan = $('#sc-nhan');
    if (nhan && nhan.checked) { payload.nhanLuon = true; o.NguoiNhan = S.name; }
    else delete o.TGNhan;
  } else {
    op = mode === 'done' ? 'hoanthanh' : 'capnhat';
    payload.so = S.scForm.SoPhieu;
    payload.ngaySuaCu = S.scFormOrig || '';
    if (mode === 'done' && $('#sc-duyet') && $('#sc-duyet').checked) payload.duyetLuon = true;
  }
  payload.op = op;
  busy(form, true);
  try {
    const r = await api('scAction', payload);
    mergeSC([r.sc]);
    if (r.tb) upsertTb(r.tb);
    toast(r.unchanged ? tr('scNoChange') : tr(op === 'create' ? 'scCreated' : 'saved', [r.sc.SoPhieu]), 'ok');
    const detail = '#/sc/' + encodeURIComponent(r.sc.SoPhieu);
    if (mode !== 'new' && S.prevHash === detail) history.back();
    else location.replace(detail);
  } catch (e) {
    if (e.code === 'INVALID' && e.extra && e.extra.errors) scShowErrors(form, e.extra.errors);
    else await scHandleErr(e);
  } finally { if (form.isConnected) busy(form, false); }
}

/** Lỗi chung khi thao tác phiếu: xung đột / sai trạng thái → tải lại phiếu. */
async function scHandleErr(e) {
  if (e.code === 'CONFLICT' || e.code === 'BAD_STATE') {
    const ex = e.extra || {};
    const msg = e.code === 'CONFLICT' ? tr('scConflictMsg', [ex.nguoiSua || '?', fmtTime(ex.ngaySua)]) : tr('eBadState');
    closeSheet();
    if (await confirmDlg('eConflict', msg, { ok: 'reload' })) {
      await refresh(true);
      const p = route();
      if (p[0] === 'sc' && p[1] && p[2]) location.replace('#/sc/' + encodeURIComponent(p[1]));
      else render();
    }
  } else if (e.code !== 'AUTH') {
    toast(errText(e), 'err');
  }
}

/* ---- Hộp thoại thao tác nhanh: nhận · chờ · tiếp tục · duyệt · trả lại · hủy ---- */
const SC_OPS = {
  nhan: { title: 'scDoNhan', btn: 'scDoNhan', icon: 'userCheck',
    fields: sc => [['text', 'NguoiNhan', 'scNguoiNhan', true, S.name], ['time', 'TGNhan', 'scTGNhanStart', true, tsNow()]] },
  cho: { title: 'scDoCho', btn: 'scDoCho', icon: 'pause', hint: 'scChoHint',
    fields: sc => [['area', 'LyDoCho', 'scLyDoCho', true, '', 'scLyDoChoPh'], ['time', 'TGBatDauCho', 'scTGCho', true, tsNow()]] },
  tieptuc: { title: 'scDoTiepTuc', btn: 'scDoTiepTuc', icon: 'play',
    info: sc => t('scWaitingFor', sc.LyDoCho || ''),
    fields: sc => [['time', 'TGTiepTuc', 'scTGTiepTuc', true, tsNow()]] },
  duyet: { title: 'scDoDuyet', btn: 'scDoDuyet', icon: 'checkCircle',
    info: sc => scApproveSummary(sc),
    fields: sc => (isOn(sc.MayDung) ? [['ttsau', 'TTMaySau', 'scTTMaySau', true, sc.TTMaySau || 'CHAY']] : [])
      .concat([['area', 'YKienDuyet', 'scYKien', false, '']]) },
  tralai: { title: 'scDoTraLai', btn: 'scDoTraLai', icon: 'undo',
    fields: sc => [['area', 'LyDoTraLai', 'scLyDoTraLai', true, '', 'scLyDoTraLaiPh']] },
  huy: { title: 'scDoHuy', btn: 'scDoHuy', icon: 'ban', danger: true, hint: 'scHuyHint',
    fields: sc => [['area', 'LyDoHuy', 'scLyDoHuy', true, '']] }
};

function scApproveSummary(sc) {
  const d = scDownMin(sc);
  return `<div class="appr">
    ${sc.LoaiHong ? `<div>${dmBi('LOAIHONG', sc.LoaiHong, 'b')}</div>` : ''}
    <div class="pre small">${esc(sc.NguyenNhan)}</div>
    <div class="pre small muted">${esc(sc.CachXuLy)}</div>
    <div class="row gap wrap small">${sc.PhutSua !== '' ? `<span class="dur">${ic('wrench')}${durBi(Number(sc.PhutSua))}</span>` : ''}
      ${d ? `<span class="dur">${ic('clock')}${t('scDownTotal', fmtDur(d.min))}</span>` : ''}</div>
  </div>`;
}

function scOpSheet(op, so) {
  const sc = scBySo(so);
  const cfg = SC_OPS[op];
  if (!sc || !cfg) return;
  if (!needOnline()) return;
  const fld = ([kind, f, key, req, def, ph]) => {
    const lb = `<span class="lb">${t(key)}${req ? ' <b class="req">*</b>' : ''}</span>`;
    if (kind === 'text') return `<label class="fld" data-fld="${f}">${lb}<input data-sf="${f}" value="${esc(def || '')}" maxlength="60" list="dl-op"><span class="fe"></span></label>`;
    if (kind === 'area') return `<label class="fld" data-fld="${f}">${lb}<textarea data-sf="${f}" rows="3" maxlength="1000" ${ph ? `placeholder="${esc(tp(ph))}"` : ''}>${esc(def || '')}</textarea><span class="fe"></span></label>`;
    if (kind === 'time') return `<label class="fld" data-fld="${f}">${lb}<input type="datetime-local" data-sf="${f}" value="${esc(tsToInput(def))}"><span class="fe"></span></label>`;
    if (kind === 'ttsau') return `<div class="fld" data-fld="${f}">${lb}<div class="seg">${TT_SAU.filter(c => dmGet('TRANGTHAI', c)).map(c =>
      `<label><input type="radio" name="op-${f}" value="${c}" data-sf="${f}" ${def === c ? 'checked' : ''}><span>${dmBi('TRANGTHAI', c)}</span></label>`).join('')}</div><span class="fe"></span></div>`;
    return '';
  };
  const fields = cfg.fields(sc);
  const sh = openSheet(`
    <form id="f-op" class="form" autocomplete="off" novalidate>
      <div class="pk-head"><h3 class="h3">${t(cfg.title)}</h3><button type="button" class="hbtn" data-act="closeSheet">${ic('x')}</button></div>
      <div class="muted small"><span class="sc-no">${esc(sc.SoPhieu)}</span> · ${esc(sc.IDThietBi)}</div>
      ${cfg.info ? cfg.info(sc) : ''}
      ${fields.map(fld).join('')}
      ${cfg.hint ? `<p class="muted small">${t(cfg.hint)}</p>` : ''}
      ${datalist('dl-op', uniqueRecent('NguoiNhan', [S.name]))}
      <div class="msg" id="op-msg"></div>
      <button class="btn ${cfg.danger ? 'danger' : 'primary'} block" type="submit">${ic(cfg.icon)}${t(cfg.btn)}</button>
    </form>`);
  const form = $('#f-op', sh);
  form.addEventListener('input', clearFieldErr);
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    if (!needOnline()) return;
    $$('.has-err', form).forEach(el => { el.classList.remove('has-err'); $('.fe', el).innerHTML = ''; });
    $('#op-msg').innerHTML = '';
    const o = scCollect(form);
    let bad = false;
    fields.forEach(([kind, f, key, req]) => { if (req && !String(o[f] || '').trim()) { scFieldErr(form, f, 'eRequired'); bad = true; } });
    if (bad) return;
    busy(form, true);
    try {
      const r = await api('scAction', { op, so: sc.SoPhieu, ngaySuaCu: sc.NgaySua || '', sc: o });
      mergeSC([r.sc]);
      if (r.tb) upsertTb(r.tb);
      closeSheet();
      toast(tr('scOpDone_' + op), 'ok');
      render(true);
    } catch (e) {
      if (e.code === 'INVALID' && e.extra && e.extra.errors) {
        e.extra.errors.forEach(x => {
          const args = x.reason === 'TIME_ORDER' && x.after ? [scFieldName(x.after)] : [];
          if (!scFieldErr(form, x.field, x.reason === 'TIME_ORDER' && x.after ? 'eTimeAfter' : reasonKey(x.reason), args)) {
            const m = tr('eFieldX', [scFieldName(x.field), tr(reasonKey(x.reason))]);
            $('#op-msg').innerHTML += bi(m.vi, m.zh);
          }
        });
      } else if (e.code === 'CONFLICT' || e.code === 'BAD_STATE') {
        await scHandleErr(e);
      } else if (e.code !== 'AUTH') {
        $('#op-msg').innerHTML = errHtml(e);
      }
    } finally { if (form.isConnected) busy(form, false); }
  });
}

async function scDelete(so) {
  const sc = scBySo(so);
  if (!sc || !needOnline()) return;
  if (!(await confirmDlg(tr('scDeleteQ', [so]), 'scDeleteMsg', { ok: 'delete', danger: true }))) return;
  try {
    const r = await api('scAction', { op: 'xoa', so, ngaySuaCu: sc.NgaySua || '' });
    removeSC(so);
    if (r.tb) upsertTb(r.tb);
    toast(tr('scDeleted', [so]), 'ok');
    location.replace('#/sc');
  } catch (e) { await scHandleErr(e); }
}

/* --------------------------- Bảo trì kế hoạch (phiên 3) --------------------------- */
/* Kế hoạch (KH0001…) = 1 máy + 1 công việc + chu kỳ + checklist. Ghi thực hiện → phiếu BT-yyyy-nnnn
 * (chờ duyệt). Quản lý duyệt thì kế hoạch mới dời hạn lần sau; trả lại → KTV sửa rồi gửi lại.
 * Hạn lần sau: THUCTE = ngày làm + chu kỳ · LICH = hạn cũ + k × chu kỳ (giữ đúng lịch). */

const BT_CHO = ['CHODUYET', 'TRALAI'];
const BT_UNITS = ['NGAY', 'TUAN', 'THANG', 'NAM'];
const KH_ORDER = ['QUAHAN', 'DENHAN', 'CHODUYET', 'CHUADEN', 'MAYNGUNG', 'NGUNG'];
const KH_DUE = ['QUAHAN', 'DENHAN'];
const MAY_NGUNG = ['NGUNG', 'THANHLY'];
const BT_TABS = [
  { id: 'CAN', key: 'btTabDue' },
  { id: 'DUYET', key: 'btTabApprove' },
  { id: 'XONG', key: 'btTabDone' },
  { id: 'KH', key: 'btTabPlans' }
];

/* ---- Ngày dạng yyyy-MM-dd (tính theo UTC, không lệch múi giờ) ---- */
function dToday() { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function dMs(s) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN; }
function dFmt(ms) { return new Date(ms).toISOString().slice(0, 10); }
function dAdd(s, n, unit) {
  const ms = dMs(s);
  if (unit === 'NGAY') return dFmt(ms + n * 86400000);
  if (unit === 'TUAN') return dFmt(ms + n * 7 * 86400000);
  const d = new Date(ms);
  const mo = d.getUTCMonth() + (unit === 'NAM' ? 12 * n : n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), mo + 1, 0)).getUTCDate();
  return dFmt(Date.UTC(d.getUTCFullYear(), mo, Math.min(d.getUTCDate(), last)));
}
function dDiff(a, b) { return Math.round((dMs(b) - dMs(a)) / 86400000); }
function fmtDate(s) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; }
function tsAddMin(ts, min) {
  const ms = tsMs(ts) + min * 60000;
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:00`;
}

/* ---- Chu kỳ, hạn (giống hệt backend btNext_ / btEffDue_) ---- */
function khUnit(kh) { return BT_UNITS.includes(kh.ChuKyDonVi) ? kh.ChuKyDonVi : 'THANG'; }
function khN(kh) { return Math.max(1, Number(kh.ChuKySo) || 1); }
function khNext(kh, han, ngay) {
  const n = khN(kh), u = khUnit(kh);
  if (kh.CachTinhHan === 'LICH' && han) {
    let k = 1, next = dAdd(han, n * k, u);
    while (next <= ngay && k < 20000) { k++; next = dAdd(han, n * k, u); }
    return next;
  }
  return dAdd(ngay, n, u);
}
function khEffDue(kh, pend) {
  let due = kh.HanTiepTheo || '';
  let last = kh.LanCuoi || '';
  (pend || []).slice().sort((a, b) => String(a.TGKetThuc).localeCompare(String(b.TGKetThuc))).forEach(p => {
    const ngay = String(p.TGKetThuc).slice(0, 10);
    if (last && ngay < last) return;
    const nx = khNext(kh, due || ngay, ngay);
    if (!due || nx > due) due = nx;
    last = ngay;
  });
  return due;
}
function khCycleDays(kh) { return khN(kh) * ({ NGAY: 1, TUAN: 7, THANG: 30, NAM: 365 }[khUnit(kh)]); }
/** Số ngày trước hạn tính là "Đến hạn": 7 ngày; chu kỳ dưới 1 tháng thì 1/4 chu kỳ. */
function khWindow(kh) { const c = khCycleDays(kh); return c >= 28 ? 7 : Math.floor(c / 4); }
function khGio(kh) { return Number(String(kh.ChuKyGio || '').replace(/[.\s,]/g, '')) || 0; }
function cycleTr(kh) {
  const c = tr('cyc' + khUnit(kh), [khN(kh)]);
  const g = khGio(kh);
  return g ? tr('cycOrHours', [c, fmtH(g)]) : c;
}
/** Dòng giải thích dưới ô "đã chạy bao nhiêu giờ" trong form kế hoạch */
function khGioInfo() {
  const F = S.khForm;
  if (!F) return '';
  const ids = [...F.ids];
  if (ids.length !== 1) return t('khGioMulti');
  const tb = tbById(ids[0]);
  if (!tb || !GC_KIEU.includes(tb.KieuGioChay)) return `<span class="warn-t">${t('hrsNoTrack')}</span>`;
  const g = gcIdx()[String(tb.ID).toUpperCase()];
  if (!g || g.luyKe === null) return t('khGioNoData');
  return t('khGioNow', fmtH(g.luyKe), fmtDate(g.ngay));
}

/* ---- Bảo trì theo giờ chạy (phiên 4): đến hạn khi giờ chạy từ lần bảo trì trước ≥ ChuKyGio ---- */
/** Mốc giờ chạy hiệu lực (coi như phiếu chưa duyệt đã được duyệt — giống backend btEffGio_) */
function khEffGio(kh, pend) {
  let g = String(kh.GioLanCuoi || '');
  let last = kh.LanCuoi || '';
  (pend || []).slice().sort((a, b) => String(a.TGKetThuc).localeCompare(String(b.TGKetThuc))).forEach(p => {
    const ngay = String(p.TGKetThuc).slice(0, 10);
    if (last && ngay < last) return;
    if (String(p.GioChay || '') !== '') g = String(p.GioChay);
    last = ngay;
  });
  return g;
}
/** { cyc, since, rem, pred (ngày dự báo đến hạn theo giờ), st: QUAHAN|DENHAN|CHUADEN|UNKNOWN } hoặc null */
function khHours(kh, pend, gi, today) {
  const cyc = khGio(kh);
  if (!cyc) return null;
  const g = gi[String(kh.IDThietBi).toUpperCase()];
  const base = khEffGio(kh, pend);
  const h = { cyc, now: g ? g.luyKe : null, ngay: g ? g.ngay : '', avg: g ? g.avg : null, base: base === '' ? null : Number(base) };
  if (h.base === null || h.now === null) { h.st = 'UNKNOWN'; return h; }
  h.since = Math.max(0, h.now - h.base);
  h.rem = cyc - h.since;
  if (h.avg > 0) h.pred = dAdd(h.ngay, Math.max(0, Math.ceil(h.rem / h.avg)), 'NGAY');
  const hDays = h.avg > 0 ? cyc / h.avg : 0;
  const win = hDays >= 28 || !hDays ? 7 : Math.floor(hDays / 4);
  if (h.rem <= 0) h.st = 'QUAHAN';
  else if (h.pred) h.st = dDiff(today, h.pred) <= win ? 'DENHAN' : 'CHUADEN';
  else h.st = h.rem <= cyc * 0.1 ? 'DENHAN' : 'CHUADEN';
  return h;
}
function hrsHtml(s) {
  const h = s && s.hrs;
  if (!h) return '';
  if (h.st === 'UNKNOWN') return `<span class="hrs muted">${ic('gauge')}${t('hrsUnknown')}</span>`;
  const x = h.rem <= 0 ? tr('hrsLate', [fmtH(-h.rem)]) : tr('hrsLeft', [fmtH(h.rem)]);
  const p = h.pred && h.rem > 0 ? ` · ~${fmtDate(h.pred)}` : '';
  return `<span class="hrs kh-${esc(h.st)}">${ic('gauge')}${bi(x.vi + p, x.zh + p)}</span>`;
}

/* ---- Dữ liệu ---- */
function allKH() { return (S.data && S.data.keHoachBT) || []; }
function allHM() { return (S.data && S.data.hangMucBT) || []; }
function allBT() { return (S.data && S.data.phieuBT) || []; }
function khByMa(ma) { const k = String(ma || '').toUpperCase(); return allKH().find(x => String(x.MaKH).toUpperCase() === k) || null; }
function khOfTb(id) { const k = String(id || '').toUpperCase(); return allKH().filter(x => String(x.IDThietBi).toUpperCase() === k); }
function hmOf(ma) {
  const k = String(ma || '').toUpperCase();
  return allHM().filter(x => String(x.MaKH).toUpperCase() === k).sort((a, b) => (Number(a.STT) || 0) - (Number(b.STT) || 0));
}
function btBySo(so) { const k = String(so || '').toUpperCase(); return allBT().find(x => String(x.SoPhieu).toUpperCase() === k) || null; }
function btSortDesc(a, b) { return String(b.TGKetThuc || '').localeCompare(String(a.TGKetThuc || '')) || String(b.SoPhieu).localeCompare(String(a.SoPhieu)); }
function btOfKh(ma) { const k = String(ma || '').toUpperCase(); return allBT().filter(x => String(x.MaKH).toUpperCase() === k).sort(btSortDesc); }
function btOfTb(id) { const k = String(id || '').toUpperCase(); return allBT().filter(x => String(x.IDThietBi).toUpperCase() === k).sort(btSortDesc); }
function mergeBT(rows) {
  if (!S.data) return;
  const arr = S.data.phieuBT || (S.data.phieuBT = []);
  rows.forEach(bt => { const i = arr.findIndex(x => x.SoPhieu === bt.SoPhieu); if (i >= 0) arr[i] = bt; else arr.push(bt); });
  saveCache();
}
function removeBT(so) {
  if (!S.data || !S.data.phieuBT) return;
  S.data.phieuBT = S.data.phieuBT.filter(x => x.SoPhieu !== so);
  delete S.btKQ[so];
  saveCache();
}
function upsertKH(kh) {
  if (!S.data || !kh) return;
  const arr = S.data.keHoachBT || (S.data.keHoachBT = []);
  const i = arr.findIndex(x => x.MaKH === kh.MaKH);
  if (i >= 0) arr[i] = kh; else arr.push(kh);
  saveCache();
}
function btPendIdx() {
  const m = {};
  allBT().forEach(x => { if (BT_CHO.includes(x.TrangThaiPhieu)) (m[x.MaKH] = m[x.MaKH] || []).push(x); });
  return m;
}

/** Trạng thái kế hoạch: QUAHAN · DENHAN · CHODUYET (đã làm, chờ duyệt) · CHUADEN · MAYNGUNG · NGUNG */
function khStatus(kh, idx, today, gi) {
  idx = idx || btPendIdx();
  today = today || dToday();
  gi = gi || gcIdx();
  const pend = idx[kh.MaKH] || [];
  const tb = tbById(kh.IDThietBi);
  const due = khEffDue(kh, pend);
  const days = due ? dDiff(today, due) : null;
  const hrs = khHours(kh, pend, gi, today);
  let st, dSt;
  if (!isOn(kh.DangDung)) st = dSt = 'NGUNG';
  else if (!tb || MAY_NGUNG.includes(tb.TrangThai)) st = dSt = 'MAYNGUNG';
  else {
    // Theo lịch và theo giờ chạy: cái nào tới trước quyết định
    dSt = days === null ? 'CHUADEN' : (days < 0 ? 'QUAHAN' : (days <= khWindow(kh) ? 'DENHAN' : 'CHUADEN'));
    const hSt = hrs && hrs.st !== 'UNKNOWN' ? hrs.st : 'CHUADEN';
    st = dSt === 'QUAHAN' || hSt === 'QUAHAN' ? 'QUAHAN' : (dSt === 'DENHAN' || hSt === 'DENHAN' ? 'DENHAN' : (pend.length ? 'CHODUYET' : 'CHUADEN'));
    if (dSt === 'CHUADEN' && st === 'CHODUYET') dSt = 'CHODUYET';
  }
  const sortDue = hrs && hrs.pred && (!due || hrs.pred < due) ? hrs.pred : due;
  return { st, dSt, due, days, pend: pend.length, tb, hrs, sortDue };
}
function khStatuses() {
  const idx = btPendIdx(), today = dToday(), gi = gcIdx(), m = new Map();
  allKH().forEach(k => m.set(k.MaKH, khStatus(k, idx, today, gi)));
  return m;
}
function khSortBy(ST) {
  return (a, b) => {
    const x = ST.get(a.MaKH), y = ST.get(b.MaKH);
    return KH_ORDER.indexOf(x.st) - KH_ORDER.indexOf(y.st) || String(x.sortDue || '9').localeCompare(String(y.sortDue || '9')) ||
      String(a.IDThietBi).localeCompare(String(b.IDThietBi), 'en', { numeric: true });
  };
}

/* ---- Hiển thị ---- */
function khPill(st) { return `<span class="pill kh-${esc(st)}">${t('kh' + st)}</span>`; }
function btPill(st) { return `<span class="pill bt-${esc(st)}">${t('bt' + st)}</span>`; }
function dueTr(s) {
  if (s.days === null || s.days === undefined) return { vi: '—', zh: '' };
  if (s.days < 0) return tr('dueLate', [-s.days]);
  if (s.days === 0) return tr('dueToday');
  if (s.days === 1) return tr('dueTomorrow');
  return tr('dueIn', [s.days]);
}
function dueHtml(s) {
  if (!s.due) return '';
  const x = dueTr(s);
  const st = s.dSt || s.st;   // màu theo hạn lịch; hạn theo giờ có dòng riêng (hrsHtml)
  const show = KH_DUE.includes(st) || st === 'CHUADEN' || st === 'CHODUYET';
  return `<span class="due kh-${esc(st)}">${ic('calendar')}${bi(show ? `${x.vi} · ${fmtDate(s.due)}` : fmtDate(s.due), show ? x.zh : '')}</span>`;
}
function cycHtml(kh) { const c = cycleTr(kh); return `<span class="cyc">${ic('repeat')}${bi(c.vi, c.zh)}</span>`; }
/** Làm so với hạn: đúng hạn / sớm / trễ N ngày */
function btTiming(bt) {
  const ngay = String(bt.TGKetThuc || '').slice(0, 10);
  if (!bt.HanKeHoach || !ngay) return '';
  const d = dDiff(bt.HanKeHoach, ngay);
  const x = d > 0 ? tr('timeLate', [d]) : (d < 0 ? tr('timeEarly', [-d]) : tr('timeOnDue'));
  return `<span class="tag ${d > 0 ? 'warn' : 'ok'}">${bi(x.vi, x.zh)}</span>`;
}
function kqSumHtml(bt) {
  const all = Number(bt.SoMuc) || 0, bad = Number(bt.SoMucKhongDat) || 0;
  if (!all) return '';
  return `<span class="kq-sum ${bad ? 'bad' : 'ok'}">${ic(bad ? 'alert' : 'checkCircle')}${bad ? t('kqBadN', bad, all) : t('kqAllOk', all)}</span>`;
}
function kqTag(k) {
  if (k === 'DAT') return `<span class="tag ok">${ic('check')}${t('kqDAT')}</span>`;
  if (k === 'KHONGDAT') return `<span class="tag bad">${ic('x')}${t('kqKHONGDAT')}</span>`;
  return '';
}
function rangeText(it) {
  const a = it.Min !== '' && it.Min !== undefined && it.Min !== null, b = it.Max !== '' && it.Max !== undefined && it.Max !== null;
  if (!a && !b) return '';
  const u = it.DonVi ? ' ' + it.DonVi : '';
  if (a && b) return `${fmtNum(it.Min)} – ${fmtNum(it.Max)}${u}`;
  return a ? `≥ ${fmtNum(it.Min)}${u}` : `≤ ${fmtNum(it.Max)}${u}`;
}
function tbLine(id) {
  const tb = tbById(id);
  return `<div class="sc-tbline"><span class="tb-id">${esc(id)}</span> ${tb ? bi(tb.TenMay, tb.TenMayZH, 'tb-name') : ''}</div>`;
}
function tbCard(id) {
  const tb = tbById(id);
  if (!tb) return `<div class="card pad slim"><span class="tb-id">${esc(id)}</span></div>`;
  return `<a class="card tb-link ${statusCls(tb.TrangThai)}" href="#/tb/${encodeURIComponent(tb.ID)}">
    <div class="grow"><div class="mini-top"><span class="tb-id">${esc(tb.ID)}</span>${tb.MaNhaMay ? `<span class="tb-ma">${esc(tb.MaNhaMay)}</span>` : ''}</div>
      ${bi(tb.TenMay, tb.TenMayZH, 'tb-name')}${dmBi('KHUVUC', tb.ViTri, 'meta')}</div>
    ${pill(tb.TrangThai)}${ic('chev', 'mi-chev')}</a>`;
}

function khItem(kh, s) {
  const tb = s.tb;
  return `<a class="kh-item kh-${esc(s.st)}" href="#/kh/${encodeURIComponent(kh.MaKH)}">
    <div class="tb-top"><span class="tb-id">${esc(kh.IDThietBi)}</span>${tb && tb.MaNhaMay ? `<span class="tb-ma">${esc(tb.MaNhaMay)}</span>` : ''}<span class="sp"></span>${khPill(s.st)}</div>
    ${tb ? bi(tb.TenMay, tb.TenMayZH, 'tb-name') : ''}
    <div class="kh-name">${ic('wrench')}${bi(kh.TenVI, kh.TenZH)}</div>
    <div class="sc-meta">${dueHtml(s)}<span class="sp"></span>${cycHtml(kh)}</div>
    ${s.hrs ? `<div class="sc-meta">${hrsHtml(s)}</div>` : ''}
    ${s.pend ? `<div class="pend-note">${ic('clock')}${t('khPendN', s.pend)}</div>` : ''}
  </a>`;
}
function khMini(kh, s, withTb) {
  const tb = s.tb;
  return `<a class="mini kh-${esc(s.st)}" href="#/kh/${encodeURIComponent(kh.MaKH)}">
    <div class="mini-main">
      ${withTb ? `<div class="sc-tbline"><span class="tb-id">${esc(kh.IDThietBi)}</span> ${tb ? `<span class="tb-name">${esc(tb.TenMay)}</span>` : ''}</div>` : ''}
      <div class="kh-name">${bi(kh.TenVI, kh.TenZH)}</div>
      <div class="sc-meta">${dueHtml(s)}${withTb ? '' : `<span class="sp"></span>${cycHtml(kh)}`}</div>
      ${s.hrs ? `<div class="sc-meta">${hrsHtml(s)}</div>` : ''}
    </div>
    ${khPill(s.st)}
  </a>`;
}
function btItem(bt) {
  const tb = tbById(bt.IDThietBi);
  return `<a class="sc-item bt-${esc(bt.TrangThaiPhieu)}" href="#/bt/${encodeURIComponent(bt.SoPhieu)}">
    <div class="tb-top"><span class="sc-no">${esc(bt.SoPhieu)}</span>${btPill(bt.TrangThaiPhieu)}<span class="sp"></span><span class="muted small">${esc(fmtShort(bt.TGKetThuc))}</span></div>
    <div class="sc-tbline"><span class="tb-id">${esc(bt.IDThietBi)}</span> ${tb ? bi(tb.TenMay, tb.TenMayZH, 'tb-name') : ''}</div>
    <div class="kh-name">${ic('wrench')}${bi(bt.TenVI, bt.TenZH)}</div>
    <div class="sc-meta">${kqSumHtml(bt)}${btTiming(bt)}<span class="sp"></span><span class="muted small">${esc(bt.NguoiThucHien)}</span></div>
  </a>`;
}
function btMini(bt, withName) {
  return `<a class="mini bt-${esc(bt.TrangThaiPhieu)}" href="#/bt/${encodeURIComponent(bt.SoPhieu)}">
    <div class="mini-main">
      <div class="mini-top"><span class="sc-no">${esc(bt.SoPhieu)}</span><span class="muted small">${esc(fmtShort(bt.TGKetThuc))}</span></div>
      ${withName ? `<div class="kh-name">${bi(bt.TenVI, bt.TenZH)}</div>` : ''}
      <div class="sc-meta">${kqSumHtml(bt)}${btTiming(bt)}</div>
    </div>
    ${btPill(bt.TrangThaiPhieu)}
  </a>`;
}

/* ---- Trang chủ ---- */
function homeBtCard() {
  const ST = khStatuses();
  const due = allKH().filter(k => KH_DUE.includes(ST.get(k.MaKH).st)).sort(khSortBy(ST));
  const nQ = due.filter(k => ST.get(k.MaKH).st === 'QUAHAN').length;
  const nP = allBT().filter(x => BT_CHO.includes(x.TrangThaiPhieu)).length;
  const cells = [['QUAHAN', nQ, 'CAN', 'khQUAHAN'], ['DENHAN', due.length - nQ, 'CAN', 'khDENHAN'], ['CHODUYET', nP, 'DUYET', 'btCHODUYET']];
  return `<section class="card">
    <div class="card-h">${ic('calendar', nQ ? 'bad' : (due.length ? 'warn' : 'ok'))}${t('pmDue')}<span class="count">${due.length}</span></div>
    <div class="sc-counters c3">
      ${cells.map(([st, n, tab, key]) => `<a class="scc kh-${st}${n ? ' has' : ''}" href="#/bt" data-act="btTabGo" data-t="${tab}"><b>${n}</b>${t(key)}</a>`).join('')}
    </div>
    ${due.length ? `<div class="mini-list">${due.slice(0, 5).map(k => khMini(k, ST.get(k.MaKH), true)).join('')}</div>`
      : `<div class="empty ok small">${ic('check')}${allKH().length ? t('btNoDue') : t('khNone')}</div>`}
    <div class="card-f">
      <a class="btn sm" href="#/bt-nam">${ic('grid')}${t('btYearPlan')}</a>
      <span class="sp"></span>
      <a class="link" href="#/bt" data-act="btTabGo" data-t="CAN">${t('scViewAll')}</a>
    </div>
  </section>`;
}

/* ---- Trang máy: kế hoạch + lịch sử bảo trì ---- */
function tbBtSection(tb) {
  const idx = btPendIdx(), today = dToday(), gi = gcIdx();
  const plans = khOfTb(tb.ID).map(k => [k, khStatus(k, idx, today, gi)])
    .sort((a, b) => KH_ORDER.indexOf(a[1].st) - KH_ORDER.indexOf(b[1].st) || String(a[1].due).localeCompare(String(b[1].due)));
  const hist = btOfTb(tb.ID);
  const loading = S.online && !S.btLoaded.has(tb.ID);
  return `<section class="card">
      <div class="card-h">${ic('calendar')}${t('pmPlan')}<span class="count">${plans.length}</span></div>
      ${plans.length ? `<div class="mini-list">${plans.map(([k, s]) => khMini(k, s, false)).join('')}</div>`
        : `<div class="empty small">${t('khNoneForTb')}</div>`}
      ${isQL() && tb.TrangThai !== 'THANHLY' ? `<div class="card-f"><a class="btn sm" href="#/kh-moi/${encodeURIComponent(tb.ID)}">${ic('plus')}${t('khAdd')}</a></div>` : ''}
    </section>
    <section class="card">
      <div class="card-h">${ic('checklist')}${t('histPM')}<span class="count">${hist.length}</span></div>
      ${hist.length ? `<div class="mini-list">${hist.slice(0, 30).map(x => btMini(x, true)).join('')}</div>` : ''}
      ${loading ? `<div class="empty small"><div class="spinner"></div></div>` : (hist.length ? '' : `<div class="empty small">${t('btNoHistory')}</div>`)}
    </section>`;
}
async function loadTbBtHistory(id) {
  if (!S.online || S.btLoaded.has(id)) return;
  S.btLoaded.add(id);
  try { const r = await api('listBT', { id }); mergeBT(r.rows); } catch (e) { /* giữ dữ liệu đã có */ }
  const p = route();
  if (p[0] === 'tb' && p[1] && p[1].toUpperCase() === String(id).toUpperCase() && !p[2] && !$('.overlay.open')) {
    const y = window.scrollY; render(true); window.scrollTo(0, y);
  }
}

/* ---- Danh sách: Cần làm · Chờ duyệt · Đã làm · Kế hoạch ---- */
function btMatch(id, extra) {
  const f = S.btf;
  const tb = tbById(id);
  if (f.kv && (!tb || tb.ViTri !== f.kv)) return false;
  if (f.nhom && (!tb || tb.NhomTB !== f.nhom)) return false;
  const n = norm(f.q);
  if (n) {
    const hay = norm([id, tb && tb.TenMay, tb && tb.TenMayZH, tb && tb.MaNhaMay].concat(extra || []).join(' '));
    if (!hay.includes(n)) return false;
  }
  return true;
}
function khFiltered(ST, onlyDue) {
  return allKH().filter(k => (!onlyDue || KH_DUE.includes(ST.get(k.MaKH).st)) &&
    btMatch(k.IDThietBi, [k.MaKH, k.TenVI, k.TenZH, k.NhaThau])).sort(khSortBy(ST));
}
function btFiltered(tab) {
  const st = tab === 'DUYET' ? BT_CHO : ['DONG'];
  return allBT().filter(x => st.includes(x.TrangThaiPhieu) &&
    btMatch(x.IDThietBi, [x.SoPhieu, x.MaKH, x.TenVI, x.TenZH, x.NguoiThucHien, x.NhaThau, x.VatTu, x.NhanXet]))
    .sort((a, b) => (tab === 'DUYET' ? BT_CHO.indexOf(b.TrangThaiPhieu) - BT_CHO.indexOf(a.TrangThaiPhieu) : 0) || btSortDesc(a, b));
}

function viewBtList() {
  if (!S.data) return loadingView();
  const f = S.btf;
  const ST = khStatuses();
  const nDue = allKH().filter(k => KH_DUE.includes(ST.get(k.MaKH).st)).length;
  const nLate = allKH().filter(k => ST.get(k.MaKH).st === 'QUAHAN').length;
  const nPend = allBT().filter(x => BT_CHO.includes(x.TrangThaiPhieu)).length;
  return {
    live: true, restoreScroll: true, title: 'pmPlan', back: 'cv', tab: 'cv',
    html: `
      <div class="toolbar sticky">
        <div class="seg sc-tabs">${BT_TABS.map(x => {
          const lb = tr(x.key);
          const n = x.id === 'CAN' ? nDue : (x.id === 'DUYET' ? nPend : 0);
          const cls = x.id === 'CAN' ? (nLate ? 'kh-QUAHAN' : 'kh-DENHAN') : 'bt-CHODUYET';
          return `<a data-act="btTab" data-t="${x.id}" class="${x.id === f.tab ? 'on' : ''}">${bi(lb.vi, lb.zh)}${n ? `<span class="tcount ${cls}">${n}</span>` : ''}</a>`;
        }).join('')}</div>
        <div class="search">${ic('search')}<input type="search" id="bt-q" value="${esc(f.q)}" placeholder="${esc(tp('btSearch'))}" autocomplete="off"></div>
        <div class="chips">
          <a class="chip" href="#/bt-nam">${ic('grid')}${t('btYearPlan')}</a>
          <button class="chip${f.kv ? ' on' : ''}" data-act="btFilter" data-k="kv">${ic('map')}${f.kv ? dmBi('KHUVUC', f.kv) : t('allAreas')}</button>
          <button class="chip${f.nhom ? ' on' : ''}" data-act="btFilter" data-k="nhom">${ic('device')}${f.nhom ? dmBi('NHOMTB', f.nhom) : t('allGroups')}</button>
        </div>
      </div>
      <div class="list-bar"><span id="bt-count" class="muted"></span><span class="sp"></span>
        <button class="link" data-act="btCsv">${t('exportCsv')}</button></div>
      <div id="bt-list"></div>
      <div id="bt-more"></div>
      ${isQL() ? `<a class="fab" href="#/kh-moi" aria-label="${esc(tp('khAdd'))}">${ic('plus')}</a>` : ''}`,
    after: () => {
      drawBtList();
      $('#bt-q').addEventListener('input', debounce(e => { S.btf.q = e.target.value; drawBtList(); }, 150));
    }
  };
}

function drawBtList() {
  const f = S.btf;
  const box = $('#bt-list');
  if (!box) return;
  const more = $('#bt-more');
  more.innerHTML = '';
  if (f.tab === 'CAN' || f.tab === 'KH') {
    const ST = khStatuses();
    const list = khFiltered(ST, f.tab === 'CAN');
    $('#bt-count').innerHTML = t('khNPlans', list.length);
    if (!list.length) {
      box.innerHTML = f.tab === 'CAN'
        ? `<div class="empty ok">${ic('checkCircle')}${allKH().length ? t('btNoDue') : t('khNone')}</div>`
        : `<div class="empty">${ic('calendar')}${allKH().length ? t('noResult') : t('khNone')}${isQL() && !allKH().length ? `<a class="btn primary" href="#/kh-moi">${ic('plus')}${t('khAdd')}</a>` : ''}</div>`;
      return;
    }
    box.innerHTML = KH_ORDER.map(st => {
      const g = list.filter(k => ST.get(k.MaKH).st === st);
      if (!g.length) return '';
      return `<h4 class="sec-h grp-h kh-${st}"><span class="dot"></span>${t('kh' + st)}<span class="count">${g.length}</span></h4>
        <div class="tb-list">${g.slice(0, 300).map(k => khItem(k, ST.get(k.MaKH))).join('')}</div>`;
    }).join('');
    return;
  }
  const list = btFiltered(f.tab);
  $('#bt-count').innerHTML = t('scNTickets', list.length);
  box.innerHTML = list.length ? `<div class="tb-list">${list.slice(0, 300).map(btItem).join('')}</div>`
    : `<div class="empty${f.tab === 'DUYET' ? ' ok' : ''}">${ic(f.tab === 'DUYET' ? 'checkCircle' : 'checklist')}${f.tab === 'DUYET' ? t('btNoPending') : (allBT().length ? t('noResult') : t('btNoRecords'))}</div>`;
  const left = (S.data.btOld || 0) - S.btOldLoaded;
  if (f.tab === 'XONG' && left > 0) more.innerHTML = `<button class="btn block" data-act="btLoadOld">${ic('download')}${t('scLoadOld', left)}</button>`;
}

async function btLoadOld(btn) {
  if (!needOnline() || S.btOldBusy) return;
  S.btOldBusy = true;
  btn.disabled = true; btn.classList.add('loading');
  try {
    const r = await api('listBT', { old: true, offset: S.btOldLoaded, limit: 200 });
    S.btOldLoaded += r.rows.length;
    S.data.btOld = r.total;
    mergeBT(r.rows);
    drawBtList();
  } catch (e) {
    if (e.code !== 'AUTH') toast(errText(e), 'err');
  } finally { S.btOldBusy = false; if (btn.isConnected) { btn.disabled = false; btn.classList.remove('loading'); } }
}

const KH_CSV = [
  ['MaKH', 'Mã kế hoạch', '计划编号'], ['IDThietBi', 'ID', ''], ['_TenMay', 'Tên máy', '设备名称'], ['_KhuVuc', 'Khu vực', '区域'],
  ['TenVI', 'Công việc', '保养内容'], ['TenZH', 'Công việc (Trung)', '保养内容(中文)'], ['_ChuKy', 'Chu kỳ', '周期'],
  ['CachTinhHan', 'Cách tính hạn', '到期计算方式'], ['_Han', 'Hạn', '到期日'], ['_TrangThai', 'Trạng thái', '状态'],
  ['LanCuoi', 'Lần gần nhất', '上次保养'], ['PhieuCuoi', 'Phiếu gần nhất', '上次保养单'], ['NhaThau', 'Nhà thầu', '外协单位'],
  ['CanDungMay', 'Máy phải dừng', '需停机'], ['_SoMuc', 'Số hạng mục', '检查项目数'], ['DangDung', 'Đang dùng', '启用'],
  ['ChuKyGio', 'Chu kỳ giờ chạy (h)', '运行小时周期(h)'], ['_GioSau', 'Giờ chạy từ lần bảo trì trước (h)', '上次保养后运行小时(h)']
];
const BT_CSV = [
  ['SoPhieu', 'Số phiếu', '单号'], ['TrangThaiPhieu', 'Trạng thái', '状态'], ['MaKH', 'Mã kế hoạch', '计划编号'],
  ['IDThietBi', 'ID', ''], ['_TenMay', 'Tên máy', '设备名称'], ['_KhuVuc', 'Khu vực', '区域'], ['TenVI', 'Công việc', '保养内容'],
  ['HanKeHoach', 'Hạn kế hoạch', '计划到期日'], ['TGBatDau', 'Bắt đầu', '开始时间'], ['TGKetThuc', 'Kết thúc', '结束时间'],
  ['PhutThucHien', 'Thực hiện (phút)', '实施（分钟）'], ['MayDung', 'Máy dừng', '是否停机'], ['PhutDungMay', 'Dừng máy (phút)', '停机（分钟）'],
  ['NguoiThucHien', 'Người thực hiện', '执行人'], ['NhaThau', 'Nhà thầu', '外协单位'], ['VatTu', 'Vật tư', '更换备件'],
  ['GioChay', 'Giờ chạy', '运行小时'], ['SoMuc', 'Số hạng mục', '检查项目数'], ['SoMucKhongDat', 'Không đạt', '不合格'],
  ['NhanXet', 'Nhận xét', '备注'], ['NguoiDuyet', 'Người duyệt', '审核人'], ['TGDuyet', 'Duyệt lúc', '审核时间'], ['YKienDuyet', 'Ý kiến duyệt', '审核意见']
];
function csvHead(cols) { return cols.map(c => c[2] ? `${c[1]} / ${c[2]}` : c[1]); }
function exportBtCsv() {
  const d = new Date();
  const stamp = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
  if (S.btf.tab === 'CAN' || S.btf.tab === 'KH') {
    const ST = khStatuses();
    const rows = [csvHead(KH_CSV)].concat(khFiltered(ST, S.btf.tab === 'CAN').map(k => {
      const tb = tbById(k.IDThietBi), s = ST.get(k.MaKH);
      return KH_CSV.map(([f]) => {
        if (f === '_TenMay') return tb ? tb.TenMay : '';
        if (f === '_KhuVuc') return tb ? dmVi('KHUVUC', tb.ViTri) : '';
        if (f === '_ChuKy') return cycleTr(k).vi;
        if (f === 'CachTinhHan') return tr(k.CachTinhHan === 'LICH' ? 'khModeLICH' : 'khModeTHUCTE').vi;
        if (f === '_Han') return s.due || '';
        if (f === '_TrangThai') return tr('kh' + s.st).vi;
        if (f === '_SoMuc') return hmOf(k.MaKH).length;
        if (f === '_GioSau') return s.hrs && s.hrs.st !== 'UNKNOWN' ? Math.round(s.hrs.since * 10) / 10 : '';
        if (f === 'CanDungMay' || f === 'DangDung') return isOn(k[f]) ? 'Có' : 'Không';
        return k[f] || '';
      });
    }));
    downloadCsv(`ke-hoach-bao-tri_${stamp}.csv`, rows);
    return;
  }
  const rows = [csvHead(BT_CSV)].concat(btFiltered(S.btf.tab).map(x => {
    const tb = tbById(x.IDThietBi);
    return BT_CSV.map(([f]) => {
      if (f === '_TenMay') return tb ? tb.TenMay : '';
      if (f === '_KhuVuc') return tb ? dmVi('KHUVUC', tb.ViTri) : '';
      if (f === 'TrangThaiPhieu') return tr('bt' + x.TrangThaiPhieu).vi;
      if (f === 'MayDung') return isOn(x.MayDung) ? 'Có' : 'Không';
      return x[f] || '';
    });
  }));
  downloadCsv(`phieu-bao-tri_${stamp}.csv`, rows);
}

/* ---- Lịch 12 tháng (kế hoạch bảo trì năm) ---- */
/** Các lần đến hạn dự kiến của kế hoạch trong năm y (từ hạn hiệu lực). late = đang quá hạn. */
function khOccurrences(kh, s, y, today) {
  const out = [];
  if (!s.due || s.st === 'NGUNG' || s.st === 'MAYNGUNG') return out;
  const n = khN(kh), u = khUnit(kh);
  const yEnd = y + '-12-31', yStart = y + '-01-01';
  const push = (d, late) => { if (d >= yStart && d <= yEnd) out.push({ d, late }); };
  // Bảo trì theo giờ: dự báo theo giờ chạy trung bình/ngày; mỗi lần làm đặt lại cả hai bộ đếm
  const h = s.hrs && s.hrs.st !== 'UNKNOWN' ? s.hrs : null;
  const hDays = h && h.avg > 0 ? Math.max(1, Math.round(h.cyc / h.avg)) : 0;
  const hDue = h ? (h.rem <= 0 ? h.ngay : (h.pred ? (h.pred < today ? today : h.pred) : null)) : null;
  const byHours = hDue && hDue < s.due;
  const first = byHours ? hDue : s.due;
  const late = byHours ? h.rem <= 0 : s.due < today;
  push(first, late);
  // Quá hạn: coi như làm hôm nay. LICH giữ nhịp theo hạn lịch (hạn cũ + k × chu kỳ), THUCTE tính từ lần làm
  let base = late ? today : first;
  let m = 0;
  for (let k = 0; k < 800; k++) {
    let dNext;
    if (kh.CachTinhHan === 'LICH') { do { m++; dNext = dAdd(s.due, n * m, u); } while (dNext <= base && m < 20000); }
    else dNext = dAdd(base, n, u);
    const hNext = hDays ? dAdd(base, hDays, 'NGAY') : null;
    const e = hNext && hNext < dNext ? hNext : dNext;
    if (kh.CachTinhHan === 'LICH' && e !== dNext) m--;   // làm theo giờ trước → mốc lịch kế tiếp vẫn giữ
    if (e > yEnd) break;
    if (e > today) push(e, false);
    base = e;
  }
  return out;
}

function btYearRows(y) {
  const map = {};
  (S.btYear[y] || []).forEach(x => { map[x.SoPhieu] = x; });
  allBT().forEach(x => { if (String(x.TGKetThuc).slice(0, 4) === String(y)) map[x.SoPhieu] = x; });
  return Object.values(map);
}

function yearGrid(y, flt) {
  const ST = khStatuses();
  const today = dToday();
  const done = {};
  btYearRows(y).forEach(x => {
    const m = Number(String(x.TGKetThuc).slice(5, 7));
    const o = done[x.MaKH] || (done[x.MaKH] = {});
    const c = o[m] || (o[m] = { done: 0, pend: 0 });
    if (x.TrangThaiPhieu === 'DONG') c.done++; else if (BT_CHO.includes(x.TrangThaiPhieu)) c.pend++;
  });
  const f = flt || S.btNam;
  const n = norm(f.q);
  const plans = allKH().filter(k => {
    const s = ST.get(k.MaKH);
    if ((s.st === 'NGUNG' || s.st === 'MAYNGUNG') && !done[k.MaKH]) return false;
    const tb = s.tb;
    if (f.kv && (!tb || tb.ViTri !== f.kv)) return false;
    if (f.nhom && (!tb || tb.NhomTB !== f.nhom)) return false;
    if (n && !norm([k.IDThietBi, k.MaKH, k.TenVI, k.TenZH, tb && tb.TenMay, tb && tb.MaNhaMay].join(' ')).includes(n)) return false;
    return true;
  }).sort((a, b) => String(a.IDThietBi).localeCompare(String(b.IDThietBi), 'en', { numeric: true }) || String(a.TenVI).localeCompare(String(b.TenVI), 'vi'));
  return plans.map(k => {
    const s = ST.get(k.MaKH);
    const cells = [];
    for (let m = 1; m <= 12; m++) cells.push(Object.assign({ done: 0, pend: 0, plan: 0, late: 0 }, (done[k.MaKH] || {})[m] || {}));
    khOccurrences(k, s, y, today).forEach(o => { const c = cells[Number(o.d.slice(5, 7)) - 1]; if (o.late) c.late++; else c.plan++; });
    return { kh: k, s, cells };
  });
}

function yearCellCls(c) {
  if (c.late) return 'late';
  if (c.pend) return 'pend';
  if (c.done && c.plan) return 'part';
  if (c.done) return 'done';
  if (c.plan) return 'plan';
  return '';
}

VIEWS['bt-nam'] = () => {
  if (!S.data) return loadingView();
  const f = S.btNam;
  if (!f.y) f.y = new Date().getFullYear();
  return {
    live: true, title: 'btYearPlan', back: 'bt', tab: 'cv',
    html: `
      <div class="toolbar sticky">
        <div class="yr-nav">
          <button class="hbtn" data-act="btYear" data-d="-1" aria-label="-1">${ic('back')}</button>
          <b class="yr-y">${f.y}</b>
          <button class="hbtn" data-act="btYear" data-d="1" aria-label="+1">${ic('chev')}</button>
          <span class="sp"></span>
          <span id="yr-load" class="muted small"></span>
          <button class="btn sm" data-act="printBt01Nam" aria-label="${esc(tp('pfBT01'))}">${ic('print')}</button>
          <button class="btn sm" data-act="btNamCsv">${ic('download')}${t('exportCsv')}</button>
        </div>
        <div class="search">${ic('search')}<input type="search" id="yr-q" value="${esc(f.q)}" placeholder="${esc(tp('btSearch'))}" autocomplete="off"></div>
        <div class="chips">
          <button class="chip${f.kv ? ' on' : ''}" data-act="btNamFilter" data-k="kv">${ic('map')}${f.kv ? dmBi('KHUVUC', f.kv) : t('allAreas')}</button>
          <button class="chip${f.nhom ? ' on' : ''}" data-act="btNamFilter" data-k="nhom">${ic('device')}${f.nhom ? dmBi('NHOMTB', f.nhom) : t('allGroups')}</button>
        </div>
      </div>
      <div class="yr-legend">
        <span><i class="yc c-done">${ic('check')}</i>${t('yrDone')}</span>
        <span><i class="yc c-pend">${ic('clock')}</i>${t('btCHODUYET')}</span>
        <span><i class="yc c-plan"></i>${t('yrPlan')}</span>
        <span><i class="yc c-late">!</i>${t('khQUAHAN')}</span>
      </div>
      <div id="yr-box"></div>
      <p class="muted small">${t('yrHint')}</p>`,
    after: () => {
      drawYear();
      $('#yr-q').addEventListener('input', debounce(e => { S.btNam.q = e.target.value; drawYear(); }, 150));
      if (!(f.y in S.btYear) && S.online) loadBtYear(f.y);
    }
  };
};

function drawYear() {
  const box = $('#yr-box');
  if (!box) return;
  const y = S.btNam.y;
  const rows = yearGrid(y);
  const now = new Date();
  const curM = now.getFullYear() === y ? now.getMonth() + 1 : 0;
  const ld = $('#yr-load');
  if (ld) ld.innerHTML = S.btYearBusy ? `<span class="spinner inline"></span>` : '';
  if (!rows.length) { box.innerHTML = `<div class="empty">${ic('grid')}${allKH().length ? t('noResult') : t('khNone')}</div>`; return; }
  const mh = m => bi('T' + m, m + '月');
  box.innerHTML = `<div class="yr-wrap"><table class="yr">
    <thead><tr><th class="yr-h">${t('yrPlanCol')}</th>${Array.from({ length: 12 }, (_, i) => `<th class="${i + 1 === curM ? 'now' : ''}">${mh(i + 1)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => {
      const href = `#/kh/${encodeURIComponent(r.kh.MaKH)}`;
      const tb = r.s.tb;
      return `<tr><th class="yr-h"><a href="${href}"><span class="yr-tb"><span class="tb-id">${esc(r.kh.IDThietBi)}</span> ${esc(tb ? tb.TenMay : '')}</span>
          <span class="yr-kh">${esc(r.kh.TenVI)}</span><span class="yr-cyc">${esc(cycleTr(r.kh).vi)}</span></a></th>
        ${r.cells.map((c, i) => {
          const cls = yearCellCls(c);
          const tot = c.done + c.pend + c.plan + c.late;
          const inner = !cls ? '' : (tot > 1 ? String(tot) : (cls === 'done' || cls === 'part' ? ic('check') : (cls === 'pend' ? ic('clock') : (cls === 'late' ? '!' : ''))));
          const tip = [c.done && `✓${c.done}`, c.pend && `◐${c.pend}`, c.plan && `○${c.plan}`, c.late && `!${c.late}`].filter(Boolean).join(' ');
          return `<td class="${i + 1 === curM ? 'now' : ''}">${cls ? `<a class="yc c-${cls}" href="${href}" title="${esc(tip)}">${inner}</a>` : ''}</td>`;
        }).join('')}</tr>`;
    }).join('')}</tbody></table></div>`;
  // Cuộn ngang tới tháng hiện tại (để lại 1 tháng trước) cho khỏi phải vuốt tìm
  const wrap = $('.yr-wrap', box), th = curM ? $('thead th.now', box) : null, h = $('thead th.yr-h', box);
  if (wrap && th && h) wrap.scrollLeft = Math.max(0, th.offsetLeft - h.offsetWidth - th.offsetWidth);
}

async function loadBtYear(y) {
  if (S.btYearBusy) return;
  S.btYearBusy = true;
  drawYearLoading();
  try {
    const r = await api('listBT', { year: y });
    S.btYear[y] = r.rows;
  } catch (e) {
    if (e.code !== 'AUTH') toast(errText(e), 'err');
  }
  S.btYearBusy = false;
  if (S.cur && S.cur.name === 'bt-nam') drawYear();
}
function drawYearLoading() { const ld = $('#yr-load'); if (ld) ld.innerHTML = `<span class="spinner inline"></span>`; }

function exportYearCsv() {
  const y = S.btNam.y;
  const head = ['ID', 'Tên máy / 设备名称', 'Mã kế hoạch / 计划编号', 'Công việc / 保养内容', 'Chu kỳ / 周期']
    .concat(Array.from({ length: 12 }, (_, i) => `T${i + 1} / ${i + 1}月`));
  const rows = [head].concat(yearGrid(y).map(r => [r.kh.IDThietBi, r.s.tb ? r.s.tb.TenMay : '', r.kh.MaKH, r.kh.TenVI, cycleTr(r.kh).vi]
    .concat(r.cells.map(c => [c.done && `✓${c.done > 1 ? c.done : ''}`, c.pend && `◐${c.pend > 1 ? c.pend : ''}`,
      c.plan && `○${c.plan > 1 ? c.plan : ''}`, c.late && '!'].filter(Boolean).join(' ')))));
  rows.push([]);
  rows.push(['✓ = Đã làm / 已完成', '◐ = Chờ duyệt / 待审核', '○ = Kế hoạch / 计划', '! = Quá hạn / 逾期']);
  downloadCsv(`lich-bao-tri-${y}.csv`, rows);
}

/* ---- Chi tiết kế hoạch ---- */
VIEWS.kh = p => {
  if (p[1] && p[2] === 'sua') return viewKhForm(p[1], null);
  if (p[1]) return viewKhDetail(p[1]);
  location.replace('#/bt');
  return loadingView();
};
VIEWS['kh-moi'] = p => viewKhForm(null, p[1]);

function ckRo(it, i) {
  const range = rangeText(it);
  return `<div class="mau-ro">
    <span class="mau-no">${i + 1}</span>
    <div class="grow">${bi(it.HangMucVI, it.HangMucZH)}</div>
    <span class="mau-kind">${it.KieuNhap === 'SO' ? bi(tr('kindNum').vi + (it.DonVi ? ' (' + it.DonVi + ')' : ''), tr('kindNum').zh) + (range ? `<span class="small muted">${esc(range)}</span>` : '') : t('kindPass')}</span>
  </div>`;
}

function viewKhDetail(ma) {
  if (!S.data) return loadingView();
  const kh = khByMa(ma);
  if (!kh) return { title: 'khDetail', back: 'bt', tab: 'cv', html: `<div class="empty">${ic('search')}${t('khNotFound', ma)}</div>` };
  const s = khStatus(kh);
  const tb = s.tb;
  const items = hmOf(kh.MaKH);
  const hist = btOfKh(kh.MaKH);
  const pend = hist.filter(x => BT_CHO.includes(x.TrangThaiPhieu));
  const ql = isQL();
  const enc = encodeURIComponent(kh.MaKH);
  const canRecord = isOn(kh.DangDung) && tb && tb.TrangThai !== 'THANHLY' && items.length;
  const last = kh.PhieuCuoi ? btBySo(kh.PhieuCuoi) : null;
  const loading = S.online && !S.btKhLoaded.has(kh.MaKH);
  const kv = (key, val, raw) => (val === '' || val === null || val === undefined) ? '' :
    `<div class="kv"><div class="k">${t(key)}</div><div class="v">${raw ? val : esc(val)}</div></div>`;
  const x = dueTr(s);
  return {
    live: true, title: 'khDetail', back: 'bt', tab: 'cv',
    html: `
      <section class="card hero kh-${esc(s.st)}">
        <div class="hero-main">
          <div class="hero-ids"><span class="sc-no big">${esc(kh.MaKH)}</span>${khPill(s.st)}</div>
          ${bi(kh.TenVI, kh.TenZH, 'hero-name')}
          ${s.due ? `<div class="due-big kh-${esc(s.dSt || s.st)}">${ic('calendar')}${bi(`${x.vi} · ${fmtDate(s.due)}`, x.zh)}</div>` : ''}
          ${s.hrs ? hrsHtml(s) : ''}
          ${cycHtml(kh)}
        </div>
      </section>
      ${pend.map(b => `<a class="notice sc-open bt-${esc(b.TrangThaiPhieu)}" href="#/bt/${encodeURIComponent(b.SoPhieu)}">${ic('checklist')}
        <div>${t('btPendOnKh', b.SoPhieu)}<div class="small muted">${esc(fmtShort(b.TGKetThuc))} · ${esc(b.NguoiThucHien)}</div></div>${btPill(b.TrangThaiPhieu)}</a>`).join('')}
      ${!isOn(kh.DangDung) ? `<div class="notice warn">${ic('ban')}<div>${t('khStoppedNote')}</div></div>` : ''}
      ${isOn(kh.DangDung) && tb && MAY_NGUNG.includes(tb.TrangThai) ? `<div class="notice warn">${ic('info')}<div>${t('khMachineStopped')}</div></div>` : ''}
      ${isOn(kh.DangDung) && !items.length ? `<div class="notice warn">${ic('alert')}<div>${t('khNoItems')}</div></div>` : ''}
      ${tbCard(kh.IDThietBi)}
      ${canRecord ? `<a class="btn primary block" href="#/bt-moi/${enc}">${ic('checklist')}${t('btRecord')}</a>` : ''}
      ${ql ? `<div class="actions-row">
        <a class="btn sm" href="#/kh/${enc}/sua">${ic('edit')}${t('edit')}</a>
        <button class="btn sm" data-act="khDoiHan" data-ma="${esc(kh.MaKH)}">${ic('forward')}${t('khReschedule')}</button>
      </div>` : ''}
      <section class="card">
        <div class="card-h">${ic('info')}${t('info')}</div>
        ${kv('khCycle', bi(cycleTr(kh).vi, cycleTr(kh).zh), true)}
        ${kv('khDueMode', t(kh.CachTinhHan === 'LICH' ? 'khModeLICH' : 'khModeTHUCTE'), true)}
        ${kv('khNextDue', fmtDate(kh.HanTiepTheo))}
        ${s.hrs ? kv('khHoursRun', s.hrs.st === 'UNKNOWN' ? `<span class="muted">${t(GC_KIEU.includes(tb && tb.KieuGioChay) ? 'hrsNoBase' : 'hrsNoTrack')}</span>`
          : `${esc(fmtH(s.hrs.since))} / ${esc(fmtH(s.hrs.cyc))} h${s.hrs.avg !== null ? ` <span class="muted small">(${esc(tp('gcAvgN', fmtH(s.hrs.avg)))})</span>` : ''}`, true) : ''}
        ${kv('khLast', kh.LanCuoi ? `${esc(fmtDate(kh.LanCuoi))}${kh.PhieuCuoi ? ` · <a class="link" href="#/bt/${encodeURIComponent(kh.PhieuCuoi)}">${esc(kh.PhieuCuoi)}</a>` : ''}` : `<span class="muted">${t('khNever')}</span>`, true)}
        ${kv('scNhaThau', kh.NhaThau ? esc(kh.NhaThau) : `<span class="muted">${t('khInHouse')}</span>`, true)}
        ${kv('khNeedStop', isOn(kh.CanDungMay) ? `<span class="tag warn">${t('yes')}</span>` : `<span class="tag">${t('no')}</span>`, true)}
        ${kh.LyDoDoiHan ? kv('khLastResched', kh.LyDoDoiHan) : ''}
        ${kh.HuongDan ? `<div class="kv col"><div class="k">${t('khGuide')}</div><div class="v pre">${esc(kh.HuongDan)}</div></div>` : ''}
      </section>
      <section class="card">
        <div class="card-h">${ic('checklist')}${t('khChecklist')}<span class="count">${items.length}</span></div>
        ${items.map(ckRo).join('') || `<div class="empty small">${t('noCheckItems')}</div>`}
      </section>
      <section class="card">
        <div class="card-h">${ic('log')}${t('btHistory')}<span class="count">${hist.length}</span></div>
        ${hist.length ? `<div class="mini-list">${hist.slice(0, 50).map(b => btMini(b, false)).join('')}</div>` : ''}
        ${loading ? `<div class="empty small"><div class="spinner"></div></div>` : (hist.length ? '' : `<div class="empty small">${t('btNoHistory')}</div>`)}
      </section>
      <p class="muted small audit">${t('createdBy', fmtTime(kh.NgayTao), kh.NguoiTao || '—')}<br>${t('updatedBy', fmtTime(kh.NgaySua), kh.NguoiSua || '—')}</p>`,
    after: () => loadKhHistory(kh.MaKH)
  };
}

async function loadKhHistory(ma) {
  if (!S.online || S.btKhLoaded.has(ma)) return;
  S.btKhLoaded.add(ma);
  try { const r = await api('listBT', { kh: ma }); mergeBT(r.rows); } catch (e) { /* giữ dữ liệu đã có */ }
  const p = route();
  if (p[0] === 'kh' && p[1] && p[1].toUpperCase() === String(ma).toUpperCase() && !p[2] && !$('.overlay.open')) {
    const y = window.scrollY; render(true); window.scrollTo(0, y);
  }
}

function khDoiHanSheet(ma) {
  const kh = khByMa(ma);
  if (!kh || !needOnline()) return;
  const sh = openSheet(`
    <form id="f-dh" class="form" autocomplete="off" novalidate>
      <div class="pk-head"><h3 class="h3">${t('khReschedule')}</h3><button type="button" class="hbtn" data-act="closeSheet">${ic('x')}</button></div>
      <div class="muted small"><span class="sc-no">${esc(kh.MaKH)}</span> · ${esc(kh.IDThietBi)} · ${esc(kh.TenVI)}</div>
      <div class="kv"><div class="k">${t('khNextDue')}</div><div class="v">${esc(fmtDate(kh.HanTiepTheo))}</div></div>
      <label class="fld" data-fld="han"><span class="lb">${t('khNewDue')} <b class="req">*</b></span><input type="date" name="han" value="${esc(kh.HanTiepTheo)}"><span class="fe"></span></label>
      <label class="fld" data-fld="lyDo"><span class="lb">${t('khReschedReason')} <b class="req">*</b></span>
        <textarea name="lyDo" rows="3" maxlength="500" placeholder="${esc(tp('khReschedPh'))}"></textarea><span class="fe"></span></label>
      <div class="msg" id="dh-msg"></div>
      <button class="btn primary block" type="submit">${ic('forward')}${t('khReschedule')}</button>
    </form>`);
  const form = $('#f-dh', sh);
  form.addEventListener('input', clearFieldErr);
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    if (!needOnline()) return;
    const han = form.han.value, lyDo = form.lyDo.value.trim();
    let bad = false;
    if (!han) { scFieldErr(form, 'han', 'eRequired'); bad = true; }
    if (!lyDo) { scFieldErr(form, 'lyDo', 'eRequired'); bad = true; }
    if (bad) return;
    busy(form, true);
    try {
      const r = await api('doiHanKH', { ma: kh.MaKH, han, lyDo, ngaySuaCu: kh.NgaySua || '' });
      upsertKH(r.kh);
      closeSheet();
      toast('khReschedDone', 'ok');
      render(true);
    } catch (e) {
      if (e.code === 'INVALID' && e.extra && e.extra.errors) e.extra.errors.forEach(x => scFieldErr(form, x.field, reasonKey(x.reason)));
      else if (e.code === 'CONFLICT') { closeSheet(); await khConflict(e); }
      else if (e.code !== 'AUTH') $('#dh-msg').innerHTML = errHtml(e);
    } finally { if (form.isConnected) busy(form, false); }
  });
}

async function khConflict(e) {
  const ex = e.extra || {};
  if (await confirmDlg('eConflict', tr('scConflictMsg', [ex.nguoiSua || '?', fmtTime(ex.ngaySua)]), { ok: 'reload' })) {
    S.khForm = null;
    await refresh(true);
    render();
  }
}

/* ---- Biểu mẫu kế hoạch (quản lý) ---- */
function viewKhForm(ma, preId) {
  if (!isQL()) return forbiddenView('bt');
  if (!S.data) return loadingView();
  const cur = ma ? khByMa(ma) : null;
  if (ma && !cur) return { title: 'khDetail', back: 'bt', tab: 'cv', html: `<div class="empty">${t('khNotFound', ma)}</div>` };
  const key = ma ? 'edit:' + cur.MaKH : 'new:' + (preId || '');
  if (!S.khForm || S.khForm.key !== key) {
    const pre = preId ? tbById(preId) : null;
    S.khForm = {
      key, orig: cur ? cur.NgaySua : undefined,
      kh: cur ? Object.assign({}, cur) : { TenVI: '', TenZH: '', ChuKySo: '1', ChuKyDonVi: 'THANG', CachTinhHan: 'THUCTE',
        HanTiepTheo: dToday(), CanDungMay: '0', NhaThau: '', HuongDan: '', DangDung: '1', ChuKyGio: '' },
      ids: new Set(cur ? [cur.IDThietBi] : (pre && pre.TrangThai !== 'THANHLY' ? [pre.ID] : [])),
      items: cur ? hmOf(cur.MaKH).map(x => Object.assign({}, x)) : [],
      apDung: false,
      gdc: '', gdcDirty: false   // "đã chạy bao nhiêu giờ kể từ lần bảo trì gần nhất"
    };
    if (cur && cur.ChuKyGio && cur.GioLanCuoi !== '' && cur.GioLanCuoi !== undefined) {
      const g = gcIdx()[String(cur.IDThietBi).toUpperCase()];
      if (g && g.luyKe !== null) S.khForm.gdc = String(Math.max(0, Math.round((g.luyKe - Number(cur.GioLanCuoi)) * 10) / 10)).replace('.', ',');
    }
  }
  const F = S.khForm;
  const K = F.kh;
  const others = khSameName(cur);
  const back = cur ? 'kh/' + encodeURIComponent(cur.MaKH) : (preId ? 'tb/' + encodeURIComponent(preId) : 'bt');
  const txt = (f, key, req, attrs, ph) => `<label class="fld" data-fld="${f}"><span class="lb">${t(key)}${req ? ' <b class="req">*</b>' : ''}</span>
    <input data-kf="${f}" value="${esc(K[f] || '')}" ${attrs || ''} ${ph ? `placeholder="${esc(tp(ph))}"` : ''}><span class="fe"></span></label>`;
  const names = [...new Set(allKH().map(k => k.TenVI).filter(Boolean))].slice(0, 60);
  return {
    title: cur ? 'khEditTitle' : 'khNewTitle', back, tab: 'cv', noPtr: true,
    html: `
      <form id="f-kh" class="form" autocomplete="off" novalidate>
        ${cur ? `<div class="card pad slim"><span class="sc-no big">${esc(cur.MaKH)}</span></div>` : ''}
        <section class="card pad">
          <div class="card-h flat">${ic('device')}${t('scMay')}</div>
          ${cur ? `<div class="static">${tbLine(cur.IDThietBi)}</div>`
            : `<div class="fld" data-fld="ids"><button type="button" class="select" data-act="khPickTb">${khTbLabel()}${ic('down')}</button><span class="fe"></span></div>
               <div id="kh-tbs" class="kh-tbs">${khTbChips()}</div>
               <p class="muted small">${t('khMultiHint')}</p>`}
        </section>
        <section class="card pad">
          <div class="card-h flat">${ic('wrench')}${t('khWork')}</div>
          ${txt('TenVI', 'khTenVI', true, 'maxlength="200" list="dl-khn"', 'khTenPh')}
          ${txt('TenZH', 'khTenZH', false, 'maxlength="200" lang="zh"')}
          <div class="fld" data-fld="ChuKySo"><span class="lb">${t('khCycle')} <b class="req">*</b></span>
            <div class="cyc-row">
              <input data-kf="ChuKySo" value="${esc(K.ChuKySo)}" inputmode="numeric" maxlength="3" class="cyc-n">
              <div class="seg grow">${BT_UNITS.map(u => `<label><input type="radio" name="kh-u" value="${u}" data-kr="ChuKyDonVi" ${K.ChuKyDonVi === u ? 'checked' : ''}><span>${t('unit' + u)}</span></label>`).join('')}</div>
            </div>
            <span class="fe"></span>
            <span class="muted small" id="kh-cyc">${biTr(cycleTr(K))}</span>
          </div>
          <div class="fld" data-fld="CachTinhHan"><span class="lb">${t('khDueMode')}</span>
            <div class="seg">${['THUCTE', 'LICH'].map(m => `<label><input type="radio" name="kh-m" value="${m}" data-kr="CachTinhHan" ${K.CachTinhHan === m ? 'checked' : ''}><span>${t('khMode' + m)}</span></label>`).join('')}</div>
            <span class="muted small" id="kh-mode-hint">${t(K.CachTinhHan === 'LICH' ? 'khModeLICHHint' : 'khModeTHUCTEHint')}</span>
          </div>
          <label class="fld" data-fld="HanTiepTheo"><span class="lb">${t(cur ? 'khNextDue' : 'khFirstDue')} <b class="req">*</b></span>
            <input type="date" data-kf="HanTiepTheo" value="${esc(K.HanTiepTheo)}"><span class="fe"></span></label>
          <div class="fld" data-fld="ChuKyGio"><span class="lb">${t('khCycleHours')}</span>
            <div class="ck-num"><input data-kf="ChuKyGio" value="${esc(K.ChuKyGio || '')}" inputmode="numeric" maxlength="7" placeholder="${esc(tp('khCycleHoursPh'))}"><span class="ck-unit">${t('hoursUnit')}</span></div>
            <span class="fe"></span><span class="muted small">${t('khCycleHoursHint')}</span></div>
          <div id="kh-gio" class="fld" data-fld="gioDaChay" ${K.ChuKyGio ? '' : 'hidden'}>
            <span class="lb">${t('khGioDaChay')}</span>
            <div class="ck-num"><input id="kh-gdc" value="${esc(F.gdc)}" inputmode="decimal" maxlength="9"><span class="ck-unit">${t('hoursUnit')}</span></div>
            <span class="fe"></span><span class="muted small" id="kh-gio-info">${khGioInfo()}</span>
          </div>
        </section>
        <section class="card pad">
          <label class="switch"><input type="checkbox" data-kc="CanDungMay" ${isOn(K.CanDungMay) ? 'checked' : ''}><span class="sw"></span>${t('khNeedStopQ')}</label>
          ${txt('NhaThau', 'scNhaThau', false, 'maxlength="150" list="dl-nt"', 'scNhaThauPh')}
          <label class="fld" data-fld="HuongDan"><span class="lb">${t('khGuide')}</span>
            <textarea data-kf="HuongDan" rows="3" maxlength="2000" placeholder="${esc(tp('khGuidePh'))}">${esc(K.HuongDan || '')}</textarea><span class="fe"></span></label>
          ${cur ? `<label class="switch"><input type="checkbox" data-kc="DangDung" ${isOn(K.DangDung) ? 'checked' : ''}><span class="sw"></span>${t('khActive')}</label>
            <p class="muted small">${t('khActiveHint')}</p>` : ''}
        </section>
        <section class="card pad">
          <div class="card-h flat" data-fld="items">${ic('checklist')}${t('khChecklist')}</div>
          <div class="ck-bar"><span class="muted small">${t('khCopyHint')}</span>
            <button type="button" class="btn sm" data-act="khCopyCk">${ic('download')}${t('khCopyFrom')}</button></div>
          <div id="kh-ck">${drawKhCk()}</div>
          <button type="button" class="btn block" data-act="khCkAdd">${ic('plus')}${t('addCheckItem')}</button>
          ${cur ? `<p class="muted small">${t('khCkSnapHint')}</p>` : ''}
          ${others.length ? `<label class="switch"><input type="checkbox" id="kh-ap" ${F.apDung ? 'checked' : ''}><span class="sw"></span>${t('khApplySame', others.length)}</label>` : ''}
        </section>
        ${datalist('dl-khn', names)}${datalist('dl-nt', uniqueRecent('NhaThau', allKH().map(k => k.NhaThau)))}
        <div class="form-actions">
          <a class="btn" href="#/${back}">${t('cancel')}</a>
          <button class="btn primary" type="submit">${ic('check')}${t('save')}</button>
        </div>
      </form>`,
    after: () => {
      const form = $('#f-kh');
      form.addEventListener('submit', saveKhForm);
      form.addEventListener('input', e => {
        clearFieldErr(e);
        const el = e.target;
        if (el.dataset.kf) {
          K[el.dataset.kf] = el.value;
          if (el.dataset.kf === 'ChuKySo' || el.dataset.kf === 'ChuKyGio') $('#kh-cyc').innerHTML = biTr(cycleTr(K));
          if (el.dataset.kf === 'ChuKyGio') $('#kh-gio').hidden = !String(el.value).trim();
        }
        if (el.id === 'kh-gdc') { F.gdc = el.value; F.gdcDirty = true; }
        if (el.dataset.hf) {
          const it = F.items[Number(el.dataset.i)];
          if (it) it[el.dataset.hf] = el.value;
        }
      });
      form.addEventListener('change', e => {
        const el = e.target;
        if (el.dataset.kr) {
          K[el.dataset.kr] = el.value;
          $('#kh-cyc').innerHTML = biTr(cycleTr(K));
          $('#kh-mode-hint').innerHTML = t(K.CachTinhHan === 'LICH' ? 'khModeLICHHint' : 'khModeTHUCTEHint');
        }
        if (el.dataset.kc) K[el.dataset.kc] = el.checked ? '1' : '0';
        if (el.id === 'kh-ap') F.apDung = el.checked;
        if (el.dataset.hkind !== undefined) {
          const it = F.items[Number(el.dataset.i)];
          if (it) { it.KieuNhap = el.value; $('#kh-ck').innerHTML = drawKhCk(); }
        }
      });
    }
  };
}

function biTr(x) { return bi(x.vi, x.zh); }
function khSameName(cur) {
  if (!cur) return [];
  const n = norm(cur.TenVI);
  return allKH().filter(k => k.MaKH !== cur.MaKH && norm(k.TenVI) === n);
}
function khTbLabel() {
  const n = S.khForm ? S.khForm.ids.size : 0;
  return n ? `<span class="grow">${t('nSelected', n)}</span>` : `<span class="muted">${t('khChooseTb')}</span>`;
}
function khTbChips() {
  const ids = S.khForm ? [...S.khForm.ids] : [];
  return ids.sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).map(id => {
    const tb = tbById(id);
    return `<div class="kh-tb"><span class="tb-id">${esc(id)}</span><span class="grow small">${esc(tb ? tb.TenMay : '')}</span>
      <button type="button" class="hbtn sm" data-act="khTbRemove" data-id="${esc(id)}" aria-label="x">${ic('x')}</button></div>`;
  }).join('');
}
function drawKhCk() {
  const items = S.khForm.items;
  if (!items.length) return `<div class="empty small">${t('noCheckItems')}</div>`;
  return items.map((it, i) => `
    <div class="card pad mau-item" data-fld="hm${i}">
      <div class="mau-head">
        <span class="mau-no">${i + 1}</span>
        <span class="sp"></span>
        <button type="button" class="hbtn sm" data-act="khCkMove" data-i="${i}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="up">${ic('up')}</button>
        <button type="button" class="hbtn sm" data-act="khCkMove" data-i="${i}" data-d="1" ${i === items.length - 1 ? 'disabled' : ''} aria-label="down">${ic('down')}</button>
        <button type="button" class="hbtn sm danger" data-act="khCkDel" data-i="${i}" aria-label="delete">${ic('trash')}</button>
      </div>
      <label class="fld"><span class="lb">${t('itemVI')} <b class="req">*</b></span><input data-hf="HangMucVI" data-i="${i}" value="${esc(it.HangMucVI)}" maxlength="200"></label>
      <label class="fld"><span class="lb">${t('itemZH')}</span><input data-hf="HangMucZH" data-i="${i}" value="${esc(it.HangMucZH)}" maxlength="200" lang="zh"></label>
      <div class="seg">
        <label><input type="radio" name="hk${i}" value="DAT" data-hkind data-i="${i}" ${it.KieuNhap !== 'SO' ? 'checked' : ''}><span>${t('kindPass')}</span></label>
        <label><input type="radio" name="hk${i}" value="SO" data-hkind data-i="${i}" ${it.KieuNhap === 'SO' ? 'checked' : ''}><span>${t('kindNum')}</span></label>
      </div>
      ${it.KieuNhap === 'SO' ? `<div class="grid3">
        <label class="fld"><span class="lb">${t('unit')}</span><input data-hf="DonVi" data-i="${i}" value="${esc(it.DonVi)}" maxlength="20"></label>
        <label class="fld"><span class="lb">${t('min')}</span><input data-hf="Min" data-i="${i}" value="${esc(it.Min)}" inputmode="decimal" maxlength="12"></label>
        <label class="fld"><span class="lb">${t('max')}</span><input data-hf="Max" data-i="${i}" value="${esc(it.Max)}" inputmode="decimal" maxlength="12"></label>
      </div>` : ''}
    </div>`).join('');
}

/** Chọn nhiều máy (hộp thoại có ô đánh dấu) → Promise<Set | undefined> */
function pickMany(opts) {
  return new Promise(res => {
    const sel = new Set(opts.selected || []);
    const T1 = tr(opts.title);
    const sh = openSheet(`
      <div class="pk-head"><h3 class="h3">${bi(T1.vi, T1.zh)}</h3><button type="button" class="hbtn" data-act="closeSheet">${ic('x')}</button></div>
      <div class="search sm">${ic('search')}<input type="search" id="pm-q" placeholder="${esc(tp('searchTb'))}" autocomplete="off"></div>
      <div class="row gap wrap">
        <button type="button" class="btn sm" id="pm-all">${ic('check')}${t('selectAllShown')}</button>
        <button type="button" class="btn sm" id="pm-none">${ic('x')}${t('clearSelection')}</button>
      </div>
      <div class="tem-list" id="pm-list"></div>
      <button type="button" class="btn primary block" id="pm-ok"></button>`, { onClose: v => res(v) });
    const shown = () => {
      const n = norm($('#pm-q', sh).value);
      return opts.items.filter(it => !n || norm(it.v + ' ' + it.vi + ' ' + it.zh + ' ' + (it.sub || '')).includes(n));
    };
    const draw = () => {
      const list = shown();
      $('#pm-list', sh).innerHTML = list.length ? list.map(it => `
        <label class="tem-row"><input type="checkbox" data-v="${esc(it.v)}" ${sel.has(it.v) ? 'checked' : ''}>
          <span class="tb-id">${esc(it.v)}</span><span class="grow">${bi(it.vi, it.zh)}${it.sub ? `<span class="pk-sub">${esc(it.sub)}</span>` : ''}</span></label>`).join('')
        : `<div class="empty small">${t('noResult')}</div>`;
      count();
    };
    const count = () => { $('#pm-ok', sh).innerHTML = `${ic('check')}${t('pmDoneN', sel.size)}`; };
    $('#pm-q', sh).addEventListener('input', draw);
    $('#pm-list', sh).addEventListener('change', e => {
      const cb = e.target.closest('input[data-v]');
      if (!cb) return;
      if (cb.checked) sel.add(cb.dataset.v); else sel.delete(cb.dataset.v);
      count();
    });
    $('#pm-all', sh).addEventListener('click', () => { shown().forEach(it => sel.add(it.v)); draw(); });
    $('#pm-none', sh).addEventListener('click', () => { sel.clear(); draw(); });
    $('#pm-ok', sh).addEventListener('click', () => closeSheet(sel));
    draw();
  });
}

function khCkNumOk(v) { const s = String(v || '').trim().replace(',', '.'); return !s || /^-?\d+(\.\d+)?$/.test(s); }

async function saveKhForm(ev) {
  ev.preventDefault();
  if (!needOnline()) return;
  const form = ev.target;
  const F = S.khForm;
  const K = F.kh;
  const cur = K.MaKH ? khByMa(K.MaKH) : null;
  $$('.has-err', form).forEach(el => { el.classList.remove('has-err'); const fe = $('.fe', el); if (fe) fe.innerHTML = ''; });
  let bad = false;
  const err = (f, k) => { scFieldErr(form, f, k); bad = true; };
  if (!cur && !F.ids.size) err('ids', 'eRequired');
  if (!String(K.TenVI || '').trim()) err('TenVI', 'eRequired');
  if (!/^\d{1,3}$/.test(String(K.ChuKySo).trim()) || Number(K.ChuKySo) < 1) err('ChuKySo', 'eNumber');
  if (!K.HanTiepTheo) err('HanTiepTheo', 'eRequired');
  const gRaw = String(K.ChuKyGio || '').replace(/[.\s,]/g, '');
  if (gRaw && (!/^\d{1,6}$/.test(gRaw) || Number(gRaw) < 1)) err('ChuKyGio', 'eNumber');
  const gdc = String(F.gdc || '').trim().replace(/\s/g, '').replace(',', '.');
  if (gRaw && gdc && !/^\d+(\.\d+)?$/.test(gdc)) err('gioDaChay', 'eNumber');
  let itemErr = null;
  if (!F.items.length) itemErr = tr('khNeedItems');
  F.items.forEach((it, i) => {
    if (itemErr) return;
    if (!String(it.HangMucVI || '').trim()) itemErr = tr('eItemReq', [i + 1]);
    else if (it.KieuNhap === 'SO' && (!khCkNumOk(it.Min) || !khCkNumOk(it.Max))) itemErr = tr('eItemNum', [i + 1]);
    else if (it.KieuNhap === 'SO' && String(it.Min).trim() && String(it.Max).trim() &&
      Number(String(it.Min).replace(',', '.')) > Number(String(it.Max).replace(',', '.'))) itemErr = tr('eItemMinMax', [i + 1]);
  });
  if (itemErr) { toast(itemErr, 'err'); bad = true; }
  if (bad) { const first = $('.has-err', form); if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' }); if (!itemErr) toast('eInvalid', 'err'); return; }
  const payload = {
    kh: Object.assign({}, K, { MaKH: cur ? cur.MaKH : '', ChuKyGio: gRaw }),
    items: F.items.map(it => ({ HangMucVI: it.HangMucVI, HangMucZH: it.HangMucZH, KieuNhap: it.KieuNhap === 'SO' ? 'SO' : 'DAT',
      DonVi: it.DonVi || '', Min: it.Min || '', Max: it.Max || '' }))
  };
  // Mốc giờ chạy: chỉ gửi khi tạo mới hoặc người dùng vừa sửa (tránh mốc bị trôi theo số giờ mới ghi)
  if (gRaw && gdc && (!cur || F.gdcDirty || !cur.ChuKyGio)) payload.gioDaChay = gdc;
  if (cur) {
    payload.ngaySuaCu = F.orig || '';
    if (F.apDung) payload.apDung = khSameName(cur).map(k => k.MaKH);
  } else {
    payload.ids = [...F.ids];
  }
  busy(form, true);
  try {
    const r = await api('saveKeHoach', payload);
    S.data.keHoachBT = r.keHoachBT;
    S.data.hangMucBT = r.hangMucBT;
    saveCache();
    S.khForm = null;
    if (cur) {
      toast(r.unchanged ? 'scNoChange' : 'saved', 'ok');
      const detail = '#/kh/' + encodeURIComponent(cur.MaKH);
      if (S.prevHash === detail) history.back(); else location.replace(detail);
    } else {
      toast(tr('khCreated', [r.created.length]), 'ok');
      if (r.created.length === 1) location.replace('#/kh/' + encodeURIComponent(r.created[0]));
      else { S.btf.tab = 'KH'; location.replace('#/bt'); }
    }
  } catch (e) {
    if (e.code === 'INVALID' && e.extra && e.extra.errors) {
      const lines = [];
      e.extra.errors.forEach(x => {
        if (x.field === 'items' && x.line) lines.push(x.line);
        else if (!scFieldErr(form, x.field, reasonKey(x.reason))) toast(tr('eFieldX', [{ vi: x.field + (x.value ? ' ' + x.value : ''), zh: x.field }, tr(reasonKey(x.reason))]), 'err');
      });
      toast(lines.length ? tr('eItemLine', [lines.join(', ')]) : tr('eInvalid'), 'err');
    } else if (e.code === 'CONFLICT') {
      await khConflict(e);
    } else if (e.code !== 'AUTH') {
      toast(errText(e), 'err');
    }
  } finally { if (form.isConnected) busy(form, false); }
}

/* ---- Chi tiết phiếu bảo trì ---- */
VIEWS.bt = p => {
  if (p[1] && p[2] === 'sua') return viewBtForm('edit', p[1]);
  if (p[1]) return viewBtDetail(p[1]);
  return viewBtList();
};
VIEWS['bt-moi'] = p => viewBtForm('new', p[1]);

function kqRow(x) {
  const range = x.KieuNhap === 'SO' ? rangeText(x) : '';
  return `<div class="kq-row ${x.KetQua === 'KHONGDAT' ? 'fail' : 'pass'}">
    <span class="mau-no">${esc(x.STT)}</span>
    <div class="grow">${bi(x.HangMucVI, x.HangMucZH)}
      ${range ? `<div class="small muted">${t('ckRange', range)}</div>` : ''}
      ${x.GhiChu ? `<div class="kq-note">${esc(x.GhiChu)}</div>` : ''}</div>
    <div class="kq-val">${x.KieuNhap === 'SO' ? `<b>${esc(fmtNum(x.GiaTri))}${x.DonVi ? ' ' + esc(x.DonVi) : ''}</b>` : ''}${kqTag(x.KetQua)}</div>
  </div>`;
}

function viewBtDetail(so) {
  if (!S.data) return loadingView();
  const bt = btBySo(so);
  if (!bt) {
    if (S.online) {
      setTimeout(() => fetchMissingBT(so), 0);
      return { title: 'btDetail', back: 'bt', tab: 'cv', html: `<div class="card pad center"><div class="spinner"></div><p class="muted">${t('loading')}</p></div>` };
    }
    return { title: 'btDetail', back: 'bt', tab: 'cv', html: `<div class="empty">${ic('search')}${t('btNotFound', so)}</div>` };
  }
  const st = bt.TrangThaiPhieu;
  const ql = isQL();
  const kh = khByMa(bt.MaKH);
  const enc = encodeURIComponent(bt.SoPhieu);
  const kq = S.btKQ[bt.SoPhieu];
  const nBad = Number(bt.SoMucKhongDat) || 0;
  const nAll = Number(bt.SoMuc) || 0;
  const linked = allSC().filter(x => x.PhieuNguon === bt.SoPhieu).sort(scSortDesc);
  const canEdit = ql || BT_CHO.includes(st);
  const may = isOn(bt.MayDung);
  const kv = (key, val, raw) => (val === '' || val === null || val === undefined) ? '' :
    `<div class="kv"><div class="k">${t(key)}</div><div class="v">${raw ? val : esc(val)}</div></div>`;
  const kvCol = (key, val) => val ? `<div class="kv col"><div class="k">${t(key)}</div><div class="v pre">${esc(val)}</div></div>` : '';
  const main = [];
  if (st === 'CHODUYET' && ql) {
    main.push(`<button class="btn" data-act="btOp" data-op="tralai" data-so="${esc(bt.SoPhieu)}">${ic('undo')}${t('scDoTraLai')}</button>`);
    main.push(`<button class="btn primary" data-act="btOp" data-op="duyet" data-so="${esc(bt.SoPhieu)}">${ic('checkCircle')}${t('btDoApprove')}</button>`);
  }
  if (st === 'TRALAI') main.push(`<a class="btn primary" href="#/bt/${enc}/sua">${ic('edit')}${t('btFixResend')}</a>`);
  return {
    live: true, title: 'btDetail', back: 'bt', tab: 'cv',
    html: `
      <section class="card hero bt-${esc(st)}">
        <div class="hero-main">
          <div class="hero-ids"><span class="sc-no big">${esc(bt.SoPhieu)}</span>${btPill(st)}</div>
          ${bi(bt.TenVI, bt.TenZH, 'hero-name')}
          <div class="sc-meta">${kqSumHtml(bt)}${btTiming(bt)}</div>
        </div>
      </section>
      ${st === 'TRALAI' ? `<div class="notice warn">${ic('undo')}<div>${t('scReturnedNote', bt.LyDoTraLai || '')}</div></div>` : ''}
      ${st === 'CHODUYET' && !ql ? `<div class="notice">${ic('info')}<div>${t('btWaitApprove')}</div></div>` : ''}
      ${tbCard(bt.IDThietBi)}
      ${kh ? `<a class="card tb-link kh-link" href="#/kh/${encodeURIComponent(kh.MaKH)}">${ic('calendar', 'mi')}
          <div class="grow"><div class="mini-top"><span class="sc-no">${esc(kh.MaKH)}</span></div>${bi(kh.TenVI, kh.TenZH, 'kh-name')}</div>${ic('chev', 'mi-chev')}</a>` : ''}
      <div class="actions-row">
        ${canEdit && st !== 'TRALAI' ? `<a class="btn sm" href="#/bt/${enc}/sua">${ic('edit')}${t('edit')}</a>` : ''}
        ${nBad ? `<a class="btn sm" href="#/sc-moi/${encodeURIComponent(bt.IDThietBi)}/${enc}">${ic('wrench')}${t('btMakeSc')}</a>` : ''}
        <button class="btn sm" data-act="printBt03" data-so="${esc(bt.SoPhieu)}">${ic('print')}${t('pPrintShort')}</button>
      </div>
      <section class="card">
        <div class="card-h">${ic('checklist')}${t('btResults')}<span class="count">${nAll - nBad}/${nAll}</span></div>
        ${kq ? kq.map(kqRow).join('') : (S.online ? `<div class="empty small"><div class="spinner"></div></div>` : `<div class="empty small">${ic('offline')}${t('btKqOffline')}</div>`)}
      </section>
      <section class="card">
        <div class="card-h">${ic('clock')}${t('btExec')}</div>
        ${kv('btStart', fmtTime(bt.TGBatDau))}
        ${kv('btEnd', fmtTime(bt.TGKetThuc))}
        ${bt.PhutThucHien !== '' ? kv('btDuration', durBi(Number(bt.PhutThucHien)), true) : ''}
        ${kv('scMayDung', may ? `<span class="tag bad">${t('scYesStop')}</span> ${bt.PhutDungMay !== '' ? durBi(Number(bt.PhutDungMay)) : ''}` : `<span class="tag ok">${t('scNoStop')}</span>`, true)}
        ${kv('khDue', bt.HanKeHoach ? fmtDate(bt.HanKeHoach) : '')}
        ${kv('scNguoiThucHien', bt.NguoiThucHien)}
        ${kv('scNhaThau', bt.NhaThau)}
        ${kvCol('scVatTu', bt.VatTu)}
        ${bt.GioChay !== '' ? kv('btGioChay', fmtNum(bt.GioChay) + ' h') : ''}
        ${kvCol('btNhanXet', bt.NhanXet)}
      </section>
      ${linked.length ? `<section class="card">
        <div class="card-h">${ic('wrench')}${t('btLinkedSc')}<span class="count">${linked.length}</span></div>
        <div class="mini-list">${linked.map(x => scMini(x, false)).join('')}</div>
      </section>` : ''}
      ${st === 'DONG' ? `<section class="card">
        <div class="card-h">${ic('checkCircle', 'ok')}${t('scApproval')}</div>
        ${kv('scNguoiDuyet', `${esc(bt.NguoiDuyet || '')} · ${esc(fmtTime(bt.TGDuyet))}`, true)}
        ${kvCol('scYKien', bt.YKienDuyet)}
      </section>` : ''}
      ${Number(bt.SoLanTraLai) > 0 && st !== 'TRALAI' ? `<p class="muted small audit">${t('scReturnedCount', bt.SoLanTraLai)}: ${esc(bt.LyDoTraLai)}</p>` : ''}
      <p class="muted small audit">${t('createdBy', fmtTime(bt.NgayTao), bt.NguoiTao || '—')}<br>${t('updatedBy', fmtTime(bt.NgaySua), bt.NguoiSua || '—')}</p>
      ${ql ? `<button class="btn block danger-outline" data-act="btDelete" data-so="${esc(bt.SoPhieu)}">${ic('trash')}${t('btDelete')}</button>` : ''}
      ${main.length ? `<div class="form-actions">${main.join('')}</div>` : ''}`,
    after: () => { if (!kq) loadBtKQ(bt.SoPhieu); }
  };
}

async function loadBtKQ(so, force) {
  if (!S.online || (!force && S.btKQ[so]) || S.btKQBusy[so]) return;
  S.btKQBusy[so] = true;
  try {
    const r = await api('listBT', { so });
    mergeBT(r.rows);
    S.btKQ[so] = r.ketQua || [];
  } catch (e) { if (e.code !== 'AUTH' && e.code !== 'NOT_FOUND') toast(errText(e), 'err'); }
  delete S.btKQBusy[so];
  const p = route();
  if (p[0] === 'sc-moi') {
    const ta = $('#f-sc [data-sf="MoTa"]'), bt = btBySo(so);
    if (ta && bt && S.scForm && S.scForm.PhieuNguon === bt.SoPhieu && ta.value === S.scForm.MoTa) {
      S.scForm.MoTa = scMoTaFromBt(bt);
      ta.value = S.scForm.MoTa;
    }
    return;
  }
  if (p[0] === 'bt' && p[1] && p[1].toUpperCase() === String(so).toUpperCase() && !$('.overlay.open')) {
    const y = window.scrollY; render(true); window.scrollTo(0, y);
  }
}

async function fetchMissingBT(so) {
  try {
    const r = await api('listBT', { so });
    mergeBT(r.rows);
    S.btKQ[r.rows[0].SoPhieu] = r.ketQua || [];
  } catch (e) { /* hiển thị không tìm thấy */ }
  const p = route();
  if (p[0] !== 'bt' || !p[1] || p[1].toUpperCase() !== String(so).toUpperCase()) return;
  if (btBySo(so)) render(true);
  else $('#view .page').innerHTML = `<div class="empty">${ic('search')}${t('btNotFound', so)}</div>`;
}

/* ---- Hộp thoại: duyệt · trả lại ---- */
function btOpSheet(op, so) {
  const bt = btBySo(so);
  if (!bt || !needOnline()) return;
  const isDuyet = op === 'duyet';
  const f = isDuyet ? 'YKienDuyet' : 'LyDoTraLai';
  const sh = openSheet(`
    <form id="f-btop" class="form" autocomplete="off" novalidate>
      <div class="pk-head"><h3 class="h3">${t(isDuyet ? 'btDoApprove' : 'scDoTraLai')}</h3><button type="button" class="hbtn" data-act="closeSheet">${ic('x')}</button></div>
      <div class="muted small"><span class="sc-no">${esc(bt.SoPhieu)}</span> · ${esc(bt.IDThietBi)} · ${esc(bt.TenVI)}</div>
      ${isDuyet ? `<div class="appr"><div class="row gap wrap">${kqSumHtml(bt)}${btTiming(bt)}</div>
        <div class="small">${esc(fmtTime(bt.TGBatDau))} → ${esc(fmtTime(bt.TGKetThuc))} · ${esc(bt.NguoiThucHien)}</div>
        ${bt.VatTu ? `<div class="pre small muted">${esc(bt.VatTu)}</div>` : ''}</div>
        <p class="muted small">${t('btApproveHint')}</p>` : ''}
      <label class="fld" data-fld="${f}"><span class="lb">${t(isDuyet ? 'scYKien' : 'scLyDoTraLai')}${isDuyet ? '' : ' <b class="req">*</b>'}</span>
        <textarea data-sf="${f}" rows="3" maxlength="1000" ${isDuyet ? '' : `placeholder="${esc(tp('btTraLaiPh'))}"`}></textarea><span class="fe"></span></label>
      <div class="msg" id="btop-msg"></div>
      <button class="btn primary block" type="submit">${ic(isDuyet ? 'checkCircle' : 'undo')}${t(isDuyet ? 'btDoApprove' : 'scDoTraLai')}</button>
    </form>`);
  const form = $('#f-btop', sh);
  form.addEventListener('input', clearFieldErr);
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    if (!needOnline()) return;
    const o = scCollect(form);
    if (!isDuyet && !String(o[f] || '').trim()) { scFieldErr(form, f, 'eRequired'); return; }
    busy(form, true);
    try {
      const r = await api('btAction', { op, so: bt.SoPhieu, ngaySuaCu: bt.NgaySua || '', bt: o });
      mergeBT([r.bt]);
      if (r.kh) upsertKH(r.kh);
      closeSheet();
      toast(isDuyet ? (r.kh ? tr('btApprovedNext', [fmtDate(r.kh.HanTiepTheo)]) : tr('scOpDone_duyet')) : tr('scOpDone_tralai'), 'ok');
      render(true);
    } catch (e) {
      if (e.code === 'INVALID' && e.extra && e.extra.errors) e.extra.errors.forEach(x => scFieldErr(form, x.field, reasonKey(x.reason)) || ($('#btop-msg').innerHTML = t(reasonKey(x.reason))));
      else if (e.code === 'CONFLICT' || e.code === 'BAD_STATE') await btHandleErr(e);
      else if (e.code !== 'AUTH') $('#btop-msg').innerHTML = errHtml(e);
    } finally { if (form.isConnected) busy(form, false); }
  });
}

async function btHandleErr(e) {
  if (e.code === 'CONFLICT' || e.code === 'BAD_STATE') {
    const ex = e.extra || {};
    const msg = e.code === 'CONFLICT' ? tr('scConflictMsg', [ex.nguoiSua || '?', fmtTime(ex.ngaySua)]) : tr('eBadState');
    closeSheet();
    if (await confirmDlg('eConflict', msg, { ok: 'reload' })) {
      S.btForm = null;
      S.btKQ = {};
      await refresh(true);
      const p = route();
      if (p[0] === 'bt' && p[1] && p[2]) location.replace('#/bt/' + encodeURIComponent(p[1]));
      else render();
    }
  } else if (e.code !== 'AUTH') {
    toast(errText(e), 'err');
  }
}

async function btDelete(so) {
  const bt = btBySo(so);
  if (!bt || !needOnline()) return;
  if (!(await confirmDlg(tr('btDeleteQ', [so]), 'btDeleteMsg', { ok: 'delete', danger: true }))) return;
  try {
    const r = await api('btAction', { op: 'xoa', so, ngaySuaCu: bt.NgaySua || '' });
    removeBT(so);
    if (r.kh) upsertKH(r.kh);
    toast(tr('scDeleted', [so]), 'ok');
    location.replace('#/bt');
  } catch (e) { await btHandleErr(e); }
}

/* ---- Biểu mẫu ghi thực hiện (new) / sửa phiếu (edit) ---- */
function viewBtForm(mode, key) {
  if (!S.data) return loadingView();
  let kh, cur = null, snap;
  if (mode === 'new') {
    kh = khByMa(key);
    if (!kh) return { title: 'btRecord', back: 'bt', tab: 'cv', html: `<div class="empty">${t('khNotFound', key)}</div>` };
    const tb = tbById(kh.IDThietBi);
    const bad = !isOn(kh.DangDung) ? 'khStoppedNote' : (tb && tb.TrangThai === 'THANHLY' ? 'eRetired' : (!hmOf(kh.MaKH).length ? 'khNoItems' : ''));
    if (bad) return { title: 'btRecord', back: 'kh/' + encodeURIComponent(kh.MaKH), tab: 'cv', html: `<div class="notice warn">${ic('alert')}<div>${t(bad)}</div></div>` };
    snap = hmOf(kh.MaKH);
  } else {
    cur = btBySo(key);
    if (!cur) return { title: 'btDetail', back: 'bt', tab: 'cv', html: `<div class="empty">${t('btNotFound', key)}</div>` };
    if (!(isQL() || BT_CHO.includes(cur.TrangThaiPhieu))) return forbiddenView('bt/' + encodeURIComponent(cur.SoPhieu));
    kh = khByMa(cur.MaKH) || { MaKH: cur.MaKH, TenVI: cur.TenVI, TenZH: cur.TenZH, IDThietBi: cur.IDThietBi, ChuKySo: '1', ChuKyDonVi: 'THANG' };
    snap = S.btKQ[cur.SoPhieu];
    if (!snap) {
      if (!S.online) return { title: 'btEditTitle', back: 'bt/' + encodeURIComponent(cur.SoPhieu), tab: 'cv', html: `<div class="notice warn">${ic('offline')}<div>${t('btKqOffline')}</div></div>` };
      setTimeout(() => loadBtKQ(cur.SoPhieu), 0);
      return { title: 'btEditTitle', back: 'bt/' + encodeURIComponent(cur.SoPhieu), tab: 'cv', html: `<div class="card pad center"><div class="spinner"></div><p class="muted">${t('loading')}</p></div>` };
    }
  }
  const fkey = mode + ':' + (cur ? cur.SoPhieu : kh.MaKH);
  const tbK = tbById(kh.IDThietBi);
  const gTb = tbK && GC_KIEU.includes(tbK.KieuGioChay) ? gcIdx()[String(tbK.ID).toUpperCase()] : null;
  if (!S.btForm || S.btForm.key !== fkey) {
    const end = tsNow();
    S.btForm = {
      key: fkey, mode, orig: cur ? cur.NgaySua : undefined, items: snap.map(x => Object.assign({}, x)),
      bt: cur ? Object.assign({}, cur) : { TGBatDau: tsAddMin(end, -60), TGKetThuc: end, MayDung: isOn(kh.CanDungMay) ? '1' : '0',
        NhaThau: kh.NhaThau || '', NguoiThucHien: S.name, VatTu: '', NhanXet: '',
        // Máy có ghi giờ chạy → điền sẵn giờ chạy lũy kế gần nhất (sửa được)
        GioChay: gTb && gTb.luyKe !== null ? String(gTb.luyKe).replace('.', ',') : '' },
      kq: snap.map(x => ({ STT: x.STT, KetQua: cur ? x.KetQua : '', GiaTri: cur ? x.GiaTri : '', GhiChu: cur ? x.GhiChu : '' }))
    };
  }
  const F = S.btForm;
  const B = F.bt;
  const ql = isQL();
  const s = kh.HanTiepTheo !== undefined ? khStatus(kh) : null;
  const dueDate = cur ? cur.HanKeHoach : (s && s.due);
  const back = cur ? 'bt/' + encodeURIComponent(cur.SoPhieu) : 'kh/' + encodeURIComponent(kh.MaKH);
  const hasDat = F.items.some(x => x.KieuNhap !== 'SO');
  const btTime = (f, key) => `<label class="fld" data-fld="${f}"><span class="lb">${t(key)} <b class="req">*</b></span>
    <input type="datetime-local" data-bf="${f}" value="${esc(tsToInput(B[f]))}"><span class="fe"></span></label>`;
  const btText = (f, key, req, attrs, ph) => `<label class="fld" data-fld="${f}"><span class="lb">${t(key)}${req ? ' <b class="req">*</b>' : ''}</span>
    <input data-bf="${f}" value="${esc(B[f] || '')}" ${attrs || ''} ${ph ? `placeholder="${esc(tp(ph))}"` : ''}><span class="fe"></span></label>`;
  const btArea = (f, key, ph) => `<label class="fld" data-fld="${f}"><span class="lb">${t(key)}</span>
    <textarea data-bf="${f}" rows="2" maxlength="2000" ${ph ? `placeholder="${esc(tp(ph))}"` : ''}>${esc(B[f] || '')}</textarea><span class="fe"></span></label>`;
  const resend = cur && cur.TrangThaiPhieu === 'TRALAI';
  const names = uniqueRecent('NguoiThucHien', [S.name].concat(allBT().slice().sort(btSortDesc).map(x => x.NguoiThucHien)));
  return {
    title: cur ? 'btEditTitle' : 'btRecord', back, tab: 'cv', noPtr: true,
    html: `
      <form id="f-bt" class="form" autocomplete="off" novalidate>
        <section class="card pad slim sc-sumcard kh-${s && !cur ? esc(s.st) : 'CHUADEN'}">
          <div class="mini-top"><span class="sc-no">${esc(cur ? cur.SoPhieu : kh.MaKH)}</span>${cur ? btPill(cur.TrangThaiPhieu) : (s ? khPill(s.st) : '')}</div>
          <div class="kh-name">${bi(kh.TenVI, kh.TenZH)}</div>
          ${tbLine(kh.IDThietBi)}
          <div class="sum-times">
            <div>${t('khDue')}<b>${esc(fmtDate(dueDate)) || '—'}</b></div>
            <div>${t('khCycle')}<b>${biTr(cycleTr(kh))}</b></div>
          </div>
          ${cur && cur.TrangThaiPhieu === 'TRALAI' ? `<div class="notice warn">${ic('undo')}<div>${t('scReturnedNote', cur.LyDoTraLai || '')}</div></div>` : ''}
          ${kh.HuongDan ? `<details class="guide"><summary>${ic('info')}${t('khGuide')}</summary><div class="pre small">${esc(kh.HuongDan)}</div></details>` : ''}
        </section>
        <section class="card pad">
          <div class="card-h flat">${ic('clock')}${t('btExec')}</div>
          ${btTime('TGBatDau', 'btStart')}${btTime('TGKetThuc', 'btEnd')}
          <label class="switch"><input type="checkbox" data-bf="MayDung" ${isOn(B.MayDung) ? 'checked' : ''}><span class="sw"></span>${t('scMayDungQ')}</label>
          <p class="muted small">${t('btStopHint')}</p>
        </section>
        <section class="card pad ck-card">
          <div class="card-h flat" data-fld="ketQua">${ic('checklist')}${t('khChecklist')}</div>
          <div class="ck-bar"><span id="ck-prog"></span>
            ${hasDat ? `<button type="button" class="btn sm" data-act="btAllPass">${ic('check')}${t('btAllPass')}</button>` : ''}</div>
          <div id="ck-list">${F.items.map((it, i) => ckItemHtml(it, i, F.kq[i])).join('')}</div>
        </section>
        <section class="card pad">
          <div class="card-h flat">${ic('wrench')}${t('scResult')}</div>
          ${btText('NguoiThucHien', 'scNguoiThucHien', true, 'maxlength="150" list="dl-ng"', 'scNguoiThucHienPh')}
          ${btText('NhaThau', 'scNhaThau', false, 'maxlength="150" list="dl-nt"', 'scNhaThauPh')}
          ${btArea('VatTu', 'scVatTu', 'scVatTuPh')}
          ${btText('GioChay', 'btGioChay', !!khGio(kh), 'inputmode="decimal" maxlength="12"', gTb ? '' : 'btGioChayPh')}
          ${gTb && gTb.luyKe !== null ? `<p class="muted small gio-hint">${t('btGioAutoHint', fmtH(gTb.luyKe), fmtDate(gTb.ngay))}</p>` : ''}
          ${btArea('NhanXet', 'btNhanXet')}
          ${cur && ql && cur.TrangThaiPhieu === 'DONG' ? btArea('YKienDuyet', 'scYKien') : ''}
          ${!cur && ql ? `<label class="switch"><input type="checkbox" id="bt-duyet" checked><span class="sw"></span>${t('btDuyetLuon')}</label>` : ''}
          ${!cur && !ql ? `<p class="muted small">${t('btAfterSaveHint')}</p>` : ''}
        </section>
        ${datalist('dl-ng', names)}${datalist('dl-nt', uniqueRecent('NhaThau', allKH().map(k => k.NhaThau)))}
        <div class="form-actions">
          <a class="btn" href="#/${back}">${t('cancel')}</a>
          <button class="btn primary" type="submit">${ic('check')}${t(resend && !ql ? 'btResend' : (cur ? 'save' : 'btSave'))}</button>
        </div>
      </form>`,
    after: () => {
      const form = $('#f-bt');
      form.addEventListener('submit', saveBtForm);
      form.addEventListener('input', e => { clearFieldErr(e); btFormInput(e.target); });
      form.addEventListener('change', e => btFormInput(e.target));
      ckProgress();
    }
  };
}

function ckItemHtml(it, i, r) {
  const fail = r.KetQua === 'KHONGDAT';
  const range = it.KieuNhap === 'SO' ? rangeText(it) : '';
  const showNote = fail || !!r.GhiChu;
  return `<div class="ck-item${r.KetQua ? (fail ? ' fail' : ' pass') : ''}" data-ck="${i}" data-fld="ck${i}">
    <div class="ck-head"><span class="mau-no">${i + 1}</span><div class="grow">${bi(it.HangMucVI, it.HangMucZH)}</div></div>
    ${it.KieuNhap === 'SO'
      ? `<div class="ck-num"><input data-ckf="GiaTri" data-i="${i}" value="${esc(String(r.GiaTri || '').replace('.', ','))}" inputmode="decimal" maxlength="14" placeholder="${esc(range || tp('kindNum'))}">
          ${it.DonVi ? `<span class="ck-unit">${esc(it.DonVi)}</span>` : ''}<span class="ck-res">${kqTag(r.KetQua)}</span></div>
         ${range ? `<div class="small muted">${t('ckRange', range)}</div>` : ''}`
      : `<div class="seg ck-seg">
          <label class="yes"><input type="radio" name="ck${i}" value="DAT" data-ckf="KetQua" data-i="${i}" ${r.KetQua === 'DAT' ? 'checked' : ''}><span>${ic('check')}${t('kqDAT')}</span></label>
          <label class="no"><input type="radio" name="ck${i}" value="KHONGDAT" data-ckf="KetQua" data-i="${i}" ${fail ? 'checked' : ''}><span>${ic('x')}${t('kqKHONGDAT')}</span></label>
        </div>`}
    <div class="ck-note" ${showNote ? '' : 'hidden'}><input data-ckf="GhiChu" data-i="${i}" value="${esc(r.GhiChu || '')}" maxlength="500" placeholder="${esc(tp(fail ? 'ckNoteFailPh' : 'ckNotePh'))}"></div>
    ${showNote ? '' : `<button type="button" class="link ck-add" data-act="ckNote" data-i="${i}">+ ${tp('ckAddNote')}</button>`}
    <span class="fe"></span>
  </div>`;
}

/** Chấm kết quả kiểu SO theo ngưỡng (giống backend btKetQua_) */
function ckEval(it, v) {
  const s = String(v || '').trim().replace(',', '.');
  if (!s) return '';
  if (!/^-?\d+(\.\d+)?$/.test(s)) return 'BAD';
  const n = Number(s);
  const lo = it.Min !== '' && it.Min !== undefined && it.Min !== null ? Number(it.Min) : null;
  const hi = it.Max !== '' && it.Max !== undefined && it.Max !== null ? Number(it.Max) : null;
  return (lo !== null && n < lo) || (hi !== null && n > hi) ? 'KHONGDAT' : 'DAT';
}

/** Form checklist đang mở: phiếu kiểm tra đầu ca (#f-kt) hoặc phiếu bảo trì (#f-bt) */
function ckForm(el) { return (el && el.closest ? el.closest('#f-kt') : $('#f-kt')) ? S.ktForm : S.btForm; }

function btFormInput(el) {
  const F = ckForm(el);
  if (!F) return;
  if (el.dataset.bf) {
    const f = el.dataset.bf;
    if (el.type === 'checkbox') F.bt[f] = el.checked ? '1' : '0';
    else if (el.type === 'datetime-local') F.bt[f] = inputToTs(el.value);
    else F.bt[f] = el.value;
    return;
  }
  if (!el.dataset.ckf) return;
  const i = Number(el.dataset.i);
  const r = F.kq[i], it = F.items[i];
  if (!r || !it) return;
  const box = el.closest('.ck-item');
  if (el.dataset.ckf === 'GhiChu') { r.GhiChu = el.value; return; }
  if (el.dataset.ckf === 'GiaTri') {
    r.GiaTri = el.value.trim();
    const k = ckEval(it, r.GiaTri);
    r.KetQua = k === 'BAD' ? '' : k;
    $('.ck-res', box).innerHTML = k === 'BAD' ? `<span class="tag bad">${t('eNumber')}</span>` : kqTag(r.KetQua);
  } else if (el.checked) {
    r.KetQua = el.value;
  }
  box.classList.toggle('pass', r.KetQua === 'DAT');
  box.classList.toggle('fail', r.KetQua === 'KHONGDAT');
  box.classList.remove('has-err');
  if (r.KetQua === 'KHONGDAT') {
    const nw = $('.ck-note', box);
    if (nw.hidden) { nw.hidden = false; const b = $('.ck-add', box); if (b) b.remove(); }
    $('input', nw).placeholder = tp('ckNoteFailPh');
  }
  ckProgress();
}

function ckProgress() {
  const F = ckForm(), el = $('#ck-prog');
  if (!F || !el) return;
  const done = F.kq.filter(r => r.KetQua).length, bad = F.kq.filter(r => r.KetQua === 'KHONGDAT').length;
  const x = tr('ckProg', [done, F.kq.length]);
  el.innerHTML = bi(x.vi, x.zh) + (bad ? ` <span class="tag bad">${ic('x')}${bad}</span>` : '');
}

async function saveBtForm(ev) {
  ev.preventDefault();
  if (!needOnline()) return;
  const form = ev.target;
  const F = S.btForm;
  if (!F) return;
  const B = F.bt;
  $$('.has-err', form).forEach(el => { el.classList.remove('has-err'); const fe = $('.fe', el); if (fe) fe.innerHTML = ''; });
  let bad = false;
  ['TGBatDau', 'TGKetThuc'].forEach(f => { if (!B[f]) { scFieldErr(form, f, 'eRequired'); bad = true; } });
  if (B.TGBatDau && B.TGKetThuc && tsMs(B.TGKetThuc) < tsMs(B.TGBatDau)) { scFieldErr(form, 'TGKetThuc', 'eTimeAfter', [tr('btStart')]); bad = true; }
  if (!String(B.NguoiThucHien || '').trim()) { scFieldErr(form, 'NguoiThucHien', 'eRequired'); bad = true; }
  if (String(B.GioChay || '').trim() && !/^\d+([.,]\d+)?$/.test(String(B.GioChay).trim())) { scFieldErr(form, 'GioChay', 'eNumber'); bad = true; }
  const khF = khByMa(F.mode === 'new' ? F.key.split(':')[1] : B.MaKH);
  if (khF && khGio(khF) && !String(B.GioChay || '').trim()) { scFieldErr(form, 'GioChay', 'eRequired'); bad = true; }
  F.kq.forEach((r, i) => {
    const it = F.items[i];
    const k = it.KieuNhap === 'SO' ? ckEval(it, r.GiaTri) : r.KetQua;
    if (!k || k === 'BAD') { scFieldErr(form, 'ck' + i, k === 'BAD' ? 'eNumber' : 'ckMissing'); bad = true; }
  });
  if (bad) { toast('eInvalid', 'err'); const first = $('.has-err', form); if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
  const bt = {};
  ['TGBatDau', 'TGKetThuc', 'MayDung', 'NguoiThucHien', 'NhaThau', 'VatTu', 'GioChay', 'NhanXet'].forEach(f => { bt[f] = String(B[f] === undefined ? '' : B[f]).trim(); });
  bt.GioChay = bt.GioChay.replace(',', '.');
  if (F.mode === 'edit' && isQL() && B.TrangThaiPhieu === 'DONG') bt.YKienDuyet = String(B.YKienDuyet || '').trim();
  const ketQua = F.kq.map(r => ({ STT: r.STT, KetQua: r.KetQua, GiaTri: String(r.GiaTri || '').replace(',', '.'), GhiChu: String(r.GhiChu || '').trim() }));
  const payload = { bt, ketQua };
  if (F.mode === 'new') {
    payload.op = 'create';
    payload.kh = F.key.split(':')[1];
    if ($('#bt-duyet') && $('#bt-duyet').checked) payload.duyetLuon = true;
  } else {
    payload.op = 'capnhat';
    payload.so = B.SoPhieu;
    payload.ngaySuaCu = F.orig || '';
  }
  busy(form, true);
  try {
    const r = await api('btAction', payload);
    mergeBT([r.bt]);
    if (r.ketQua) S.btKQ[r.bt.SoPhieu] = r.ketQua;
    if (r.kh) upsertKH(r.kh);
    S.btForm = null;
    const so = r.bt.SoPhieu;
    if (r.unchanged) toast('scNoChange', 'ok');
    else if (F.mode === 'new') toast(r.kh ? tr('btSavedNext', [so, fmtDate(r.kh.HanTiepTheo)]) : tr('btSaved', [so]), 'ok');
    else toast(B.TrangThaiPhieu === 'TRALAI' ? 'btResent' : 'saved', 'ok');
    const detail = '#/bt/' + encodeURIComponent(so);
    if (F.mode === 'edit' && S.prevHash === detail) history.back(); else location.replace(detail);
    const nBad = Number(r.bt.SoMucKhongDat) || 0;
    if (F.mode === 'new' && nBad) setTimeout(() => offerScFromBt(so, nBad), 400);
  } catch (e) {
    if (e.code === 'INVALID' && e.extra && e.extra.errors) {
      e.extra.errors.forEach(x => {
        if (x.field === 'ketQua') (x.items || []).forEach(stt => { const i = F.items.findIndex(it => String(it.STT) === String(stt)); if (i >= 0) scFieldErr(form, 'ck' + i, 'ckMissing'); });
        else if (!scFieldErr(form, x.field, x.reason === 'TIME_ORDER' ? 'eTimeAfter' : reasonKey(x.reason), x.reason === 'TIME_ORDER' ? [tr('btStart')] : [])) {
          toast(tr('eFieldX', [{ vi: x.field, zh: x.field }, tr(reasonKey(x.reason))]), 'err');
        }
      });
      toast('eInvalid', 'err');
      const first = $('.has-err', form); if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } else await btHandleErr(e);
  } finally { if (form.isConnected) busy(form, false); }
}

async function offerScFromBt(so, nBad) {
  const bt = btBySo(so);
  if (!bt) return;
  if (await confirmDlg(tr('btOfferScQ', [nBad]), 'btOfferScMsg', { ok: 'btMakeSc' })) {
    location.hash = '#/sc-moi/' + encodeURIComponent(bt.IDThietBi) + '/' + encodeURIComponent(so);
  }
}

/** Mô tả phiếu sửa chữa điền sẵn từ các hạng mục không đạt của phiếu bảo trì */
function scMoTaFromBt(bt) {
  const kq = S.btKQ[bt.SoPhieu] || [];
  const bad = kq.filter(x => x.KetQua === 'KHONGDAT');
  const head = `[${bt.SoPhieu}] ${bt.TenVI}`;
  if (!bad.length) return `${head}: ${tr('kqBadN', [Number(bt.SoMucKhongDat) || 0, Number(bt.SoMuc) || 0]).vi}`;
  return head + ':\n' + bad.map(x => `- ${x.HangMucVI}${x.KieuNhap === 'SO' ? ` = ${fmtNum(x.GiaTri)}${x.DonVi ? ' ' + x.DonVi : ''}` : ''}${x.GhiChu ? ` (${x.GhiChu})` : ''}`).join('\n');
}

/* ------------------- Kiểm tra đầu ca & giờ chạy (phiên 4) ------------------- */
/* Phiếu KT-yyyy-nnnnnn: mỗi máy mỗi ca, checklist theo mẫu kiểm tra của nhóm máy (không có → Mẫu chung),
 * không cần duyệt. Máy bắt buộc kiểm tra = mọi máy trừ Ngừng sử dụng, Thanh lý và máy đang dừng chờ sửa / đang sửa.
 * Giờ chạy: máy có KieuGioChay = DONGHO (nhập chỉ số đồng hồ) hoặc NGAY (nhập số giờ), mỗi máy mỗi ngày một lần. */

const KT_NOT_REQ = ['NGUNG', 'THANHLY', 'DUNG', 'DANGSUA'];   // không bắt buộc kiểm tra đầu ca
const KT_NO_CHECK = ['NGUNG', 'THANHLY'];                    // không kiểm tra được
const KT_EARLY_MIN = 60;                                     // kiểm tra sớm ≤ 60 phút trước giờ vào ca vẫn tính cho ca đó
const KT_EDIT_HOURS = 12;                                    // KTV sửa được trong 12 giờ sau khi ghi
const GC_KIEU = ['DONGHO', 'NGAY'];
const GC_DAYS = 15;                                          // màn hình ghi giờ chạy lùi tối đa 14 ngày
const KT_TABS = [{ id: 'CHUA', key: 'ktTabTodo' }, { id: 'DA', key: 'ktTabDone' }, { id: 'LOI', key: 'ktTabBad' }];
const CA_PRESET = { 1: ['06:00'], 2: ['06:00', '18:00'], 3: ['06:00', '14:00', '22:00'] };

/* ---- Ca làm việc (giống hệt backend caOf_) ---- */
function parseCa(s) {
  const arr = String(s || '').split(/[,;\s]+/).filter(Boolean).map(x => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(x);
    return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? Number(m[1]) * 60 + Number(m[2]) : null;
  });
  if (!arr.length || arr.length > 3 || arr.some(x => x === null)) return null;
  const u = arr.filter((x, i) => arr.indexOf(x) === i).sort((a, b) => a - b);
  return u.length === arr.length ? u : null;
}
function caStarts() { return parseCa(S.data && S.data.cauHinh && S.data.cauHinh.CaBatDau) || [360, 1080]; }
function hhmmOf(m) { return pad2(Math.floor(m / 60)) + ':' + pad2(m % 60); }
function tsUtc(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(s || ''));
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) : NaN;
}
function caOf(ts) {
  const d = String(ts).slice(0, 10), ms = tsUtc(ts), st = caStarts();
  let best = null;
  [-1, 0, 1].forEach(k => {
    const day = dAdd(d, k, 'NGAY');
    st.forEach((m, i) => {
      const x = dMs(day) + (m - KT_EARLY_MIN) * 60000;
      if (x <= ms && (!best || x > best.x)) best = { x, ngay: day, ca: String(i + 1) };
    });
  });
  return best ? { ngay: best.ngay, ca: best.ca } : { ngay: d, ca: '1' };
}
function caNow() { return caOf(tsNow()); }
function caKey(c) { return c.ngay + '#' + c.ca; }
function caCmp(a, b) { return a.ngay.localeCompare(b.ngay) || Number(a.ca) - Number(b.ca); }
function caStep(c, d) {
  const n = caStarts().length;
  let ngay = c.ngay, ca = Math.min(Number(c.ca), n) + d;
  if (ca > n) { ca = 1; ngay = dAdd(ngay, 1, 'NGAY'); }
  if (ca < 1) { ca = n; ngay = dAdd(ngay, -1, 'NGAY'); }
  return { ngay, ca: String(ca) };
}
/** "06:00–18:00" */
function caTimes(ca) {
  const st = caStarts(), i = Number(ca) - 1;
  return i < st.length ? hhmmOf(st[i]) + '–' + hhmmOf(st[(i + 1) % st.length]) : '';
}
const DOW = { vi: ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'], zh: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] };
function dowOf(ngay) { return new Date(dMs(ngay)).getUTCDay(); }
function fmtDM(s) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? `${m[3]}/${m[2]}` : ''; }
/** { vi: 'Ca 1 · T5 25/09', zh: '第1班 · 周四 25/09' } */
function caTr(c) {
  const w = dowOf(c.ngay), d = fmtDM(c.ngay);
  return { vi: `${tr('caN', [c.ca]).vi} · ${DOW.vi[w]} ${d}`, zh: `${tr('caN', [c.ca]).zh} · ${DOW.zh[w]} ${d}` };
}
function caBi(c, cls) { const x = caTr(c); return bi(x.vi, x.zh, cls); }
function fmtH(v) { const n = Number(v); return isFinite(n) ? (Math.round(n * 10) / 10).toLocaleString('vi-VN') : ''; }

/* ---- Mẫu kiểm tra áp dụng cho máy (giống hệt backend mauOfNhom_ / mauCanon_) ---- */
function cleanTxt(v, max) {
  return String(v === undefined || v === null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
}
function numCanon(v) {
  const s = String(v === undefined || v === null ? '' : v).trim().replace(',', '.');
  return s !== '' && /^-?\d+(\.\d+)?$/.test(s) ? String(Number(s)) : '';
}
function mauCanon(rows) {
  return rows.map(r => {
    const kieu = r.KieuNhap === 'SO' ? 'SO' : 'DAT';
    return [cleanTxt(r.HangMucVI, 200), cleanTxt(r.HangMucZH, 200), kieu, kieu === 'SO' ? cleanTxt(r.DonVi, 20) : '',
      kieu === 'SO' ? numCanon(r.Min) : '', kieu === 'SO' ? numCanon(r.Max) : ''];
  });
}
let mauMemo = { ref: null, map: {} };
function mauFor(tb) {
  const nhom = String((tb && tb.NhomTB) || '').toUpperCase();
  const ref = S.data && S.data.mauKiemTra;
  if (mauMemo.ref !== ref) mauMemo = { ref, map: {} };   // tính lại khi danh sách mẫu đổi
  if (mauMemo.map[nhom]) return mauMemo.map[nhom];
  const act = n => mauOf(n).filter(x => isOn(x.DangDung));
  let rows = act(nhom), used = nhom;
  if (!rows.length) { rows = act('CHUNG'); used = 'CHUNG'; }
  const items = mauCanon(rows);
  return (mauMemo.map[nhom] = { nhom: used, items, key: JSON.stringify(items) });
}
function mauItems(arr) {
  return arr.map((it, i) => ({ STT: String(i + 1), HangMucVI: it[0] || '', HangMucZH: it[1] || '', KieuNhap: it[2] === 'SO' ? 'SO' : 'DAT',
    DonVi: it[3] || '', Min: it[4] || '', Max: it[5] || '' }));
}
function mauBanOf(ma) { return ((S.data && S.data.mauBan) || []).find(x => String(x.MaBan) === String(ma)) || null; }
function mauBanItems(ma) { const b = mauBanOf(ma); return b ? mauItems(jparse(b.HangMuc, [])) : null; }
function mergeMauBan(rows) {
  if (!S.data) return;
  const arr = S.data.mauBan || (S.data.mauBan = []);
  rows.forEach(r => { if (!arr.some(x => x.MaBan === r.MaBan)) arr.push(r); });
  saveCache();
}
function mauName(nhom) { return nhom === 'CHUNG' ? tr('generalTpl') : { vi: dmVi('NHOMTB', nhom), zh: dmZh('NHOMTB', nhom) }; }
function ktCanCheck(tb) { return tb && !KT_NO_CHECK.includes(tb.TrangThai) && mauFor(tb).items.length > 0; }

/* ---- Dữ liệu phiếu kiểm tra ---- */
function allKT() { return (S.data && S.data.kiemTra) || []; }
function ktBySo(so) { const k = String(so || '').toUpperCase(); return allKT().find(x => String(x.SoPhieu).toUpperCase() === k) || null; }
function ktSortDesc(a, b) { return String(b.TGKiemTra || '').localeCompare(String(a.TGKiemTra || '')) || String(b.SoPhieu).localeCompare(String(a.SoPhieu)); }
function mergeKT(rows) {
  if (!S.data) return;
  const arr = S.data.kiemTra || (S.data.kiemTra = []);
  rows.forEach(r => { const i = arr.findIndex(x => x.SoPhieu === r.SoPhieu); if (i >= 0) arr[i] = r; else arr.push(r); });
  saveCache();
}
function removeKT(so) { if (S.data && S.data.kiemTra) { S.data.kiemTra = S.data.kiemTra.filter(x => x.SoPhieu !== so); saveCache(); } }
/** Kết quả từng hạng mục của phiếu (ghép phiên bản mẫu + KetQua) — null nếu thiếu phiên bản mẫu */
function ktDecode(kt) {
  const items = mauBanItems(kt.MaBan);
  if (!items) return null;
  const kq = jparse(kt.KetQua, []);
  return items.map((it, i) => {
    const a = kq[i] || [];
    return Object.assign({}, it, { KetQua: a[0] === 'K' ? 'KHONGDAT' : (a[0] === 'D' ? 'DAT' : ''), GiaTri: a[1] || '', GhiChu: a[2] || '' });
  });
}
function ktBad(kt) { return (Number(kt.SoMucKhongDat) || 0) > 0; }
function ktCls(kt) { return kt ? (ktBad(kt) ? 'kt-BAD' : 'kt-OK') : 'kt-TODO'; }
function ktCanEdit(kt) { return isQL() || (Date.now() - tsMs(kt.NgayTao) <= KT_EDIT_HOURS * 3600000); }
/** Ngày ca đã có dữ liệu: cửa sổ tải sẵn (từ hôm qua) hoặc đã tải thêm */
function ktDayLoaded(ngay) {
  const today = (S.data && S.data.today) || dToday();
  return ngay >= dAdd(today, -1, 'NGAY') || !!S.ktDay[ngay];
}
async function loadKtDay(ngay) {
  if (!S.online || S.ktDayBusy[ngay] || S.ktDay[ngay]) return;
  S.ktDayBusy[ngay] = true;
  try { const r = await api('listKT', { ngay }); mergeKT(r.rows); S.ktDay[ngay] = true; } catch (e) { if (e.code !== 'AUTH') toast(errText(e), 'err'); }
  delete S.ktDayBusy[ngay];
  if (S.cur && S.cur.name === 'kt' && !route()[1]) render(true);
}
/** Tình hình một ca: máy bắt buộc, đã / chưa kiểm tra, không đạt (lấy lần kiểm tra mới nhất của mỗi máy trong ca) */
function ktShift(c) {
  const rows = allKT().filter(x => x.NgayCa === c.ngay && String(x.Ca) === String(c.ca)).sort(ktSortDesc);
  const last = new Map();
  rows.forEach(x => { const k = String(x.IDThietBi).toUpperCase(); if (!last.has(k)) last.set(k, x); });
  const req = allTb().filter(tb => !KT_NOT_REQ.includes(tb.TrangThai) && ktCanCheck(tb));
  const todo = req.filter(tb => !last.has(String(tb.ID).toUpperCase()));
  const nDone = req.length - todo.length;
  const bad = [...last.values()].filter(ktBad);
  return { c, rows, last, req, todo, nDone, bad };
}
function ktLastOf(id, c) {
  const k = String(id).toUpperCase();
  return allKT().filter(x => String(x.IDThietBi).toUpperCase() === k && x.NgayCa === c.ngay && String(x.Ca) === String(c.ca)).sort(ktSortDesc)[0] || null;
}
function ktPill(kt) {
  return kt ? `<span class="pill ${ktCls(kt)}">${t(ktBad(kt) ? 'ktBadPill' : 'ktOkPill')}</span>` : `<span class="pill kt-TODO">${t('ktTodoPill')}</span>`;
}

/* ---- Trang chủ ---- */
function homeKtCard() {
  const d = ktShift(caNow());
  const pct = d.req.length ? Math.round(d.nDone * 100 / d.req.length) : 0;
  const gcT = gcTracked();
  const today = dToday();
  const gcDone = gcT.filter(tb => allGC().some(x => x.IDThietBi === tb.ID && x.Ngay === today)).length;
  const cells = [['TODO', d.todo.length, 'CHUA', 'ktTabTodo'], ['OK', d.nDone, 'DA', 'ktTabDone'], ['BAD', d.bad.length, 'LOI', 'ktTabBad']];
  return `<section class="card">
    <div class="card-h">${ic('checklist', d.bad.length ? 'bad' : (d.todo.length ? 'warn' : 'ok'))}${t('shiftCheck')}
      <span class="sp"></span><span class="muted small ca-h">${caBi(d.c)}</span></div>
    <div class="kt-prog"><div class="prog"><i style="width:${pct}%"></i></div><b>${d.nDone}/${d.req.length}</b></div>
    <div class="sc-counters c3">
      ${cells.map(([cls, n, tab, key]) => `<a class="scc kt-${cls}${n ? ' has' : ''}" href="#/kt" data-act="ktTabGo" data-t="${tab}"><b>${n}</b>${t(key)}</a>`).join('')}
    </div>
    ${d.bad.length ? `<div class="mini-list">${d.bad.slice(0, 5).map(x => ktMini(x, true)).join('')}</div>` : ''}
    <div class="card-f">
      <a class="btn sm primary" href="#/kt" data-act="ktTabGo" data-t="CHUA">${ic('checklist')}${t('ktDoCheck')}</a>
      <span class="sp"></span>
      ${gcT.length ? `<a class="link gc-link" href="#/gc">${ic('gauge')}${t('gcTodayN', gcDone, gcT.length)}</a>` : ''}
    </div>
  </section>`;
}

function ktMini(kt, withTb) {
  const tb = withTb ? tbById(kt.IDThietBi) : null;
  return `<a class="mini ${ktCls(kt)}" href="#/kt/${encodeURIComponent(kt.SoPhieu)}">
    <div class="mini-main">
      <div class="mini-top"><span class="sc-no">${esc(kt.SoPhieu)}</span><span class="muted small">${esc(fmtShort(kt.TGKiemTra))}</span></div>
      ${tb ? `<div class="sc-tbline"><span class="tb-id">${esc(tb.ID)}</span> <span class="tb-name">${esc(tb.TenMay)}</span></div>`
        : `<div class="small muted">${caBi({ ngay: kt.NgayCa, ca: String(kt.Ca) })}</div>`}
      <div class="sc-meta">${kqSumHtml(kt)}<span class="sp"></span><span class="muted small">${esc(kt.NguoiKiemTra)}</span></div>
    </div>
    ${ktPill(kt)}
  </a>`;
}

/* ---- Trang máy ---- */
function tbKtButton(tb) {
  if (!ktCanCheck(tb)) return '';
  const cur = ktLastOf(tb.ID, caNow());
  return cur ? `<a class="btn" href="#/kt/${encodeURIComponent(cur.SoPhieu)}">${ic(ktBad(cur) ? 'alert' : 'checkCircle', ktBad(cur) ? 'bad' : 'ok')}${t('ktDoneAt', hhmm(new Date(tsMs(cur.TGKiemTra))))}</a>`
    : `<a class="btn primary" href="#/kt-moi/${encodeURIComponent(tb.ID)}">${ic('checklist')}${t('ktDoCheck')}</a>`;
}
function tbKtSection(tb) {
  const c = caNow();
  const k = String(tb.ID).toUpperCase();
  const hist = allKT().filter(x => String(x.IDThietBi).toUpperCase() === k).sort(ktSortDesc);
  const cur = ktLastOf(tb.ID, c);
  const loading = S.online && !S.ktTbLoaded.has(tb.ID);
  const req = !KT_NOT_REQ.includes(tb.TrangThai);
  const can = ktCanCheck(tb);
  const stHtml = cur ? `${ktPill(cur)}<span class="small">${esc(fmtShort(cur.TGKiemTra))} · ${esc(cur.NguoiKiemTra)}</span>`
    : (!can ? `<span class="pill kt-SKIP">${t(KT_NO_CHECK.includes(tb.TrangThai) ? 'ktNotInUse' : 'ktNoTemplate')}</span>`
      : (req ? ktPill(null) : `<span class="pill kt-SKIP">${t('ktNotRequired')}</span>`));
  return `<section class="card">
    <div class="card-h">${ic('checklist')}${t('shiftCheck')}<span class="count">${hist.length}</span></div>
    <div class="kt-now">${caBi(c, 'ca-h')}<span class="sp"></span>${stHtml}</div>
    ${hist.length ? `<div class="mini-list">${hist.slice(0, 10).map(x => ktMini(x, false)).join('')}</div>` : ''}
    ${loading ? `<div class="empty small"><div class="spinner"></div></div>` : (hist.length ? '' : `<div class="empty small">${t('ktNoHistory')}</div>`)}
  </section>`;
}
async function loadTbKtHistory(id) {
  if (!S.online || S.ktTbLoaded.has(id)) return;
  S.ktTbLoaded.add(id);
  try { const r = await api('listKT', { id, limit: 20 }); mergeKT(r.rows); } catch (e) { /* giữ dữ liệu đã có */ }
  rerenderTb(id);
}
function rerenderTb(id) {
  const p = route();
  if (p[0] === 'tb' && p[1] && p[1].toUpperCase() === String(id).toUpperCase() && !p[2] && !$('.overlay.open')) {
    const y = window.scrollY; render(true); window.scrollTo(0, y);
  }
}

/* ---- Danh sách kiểm tra theo ca ---- */
VIEWS.kt = p => {
  if (p[1] && p[2] === 'sua') return viewKtForm('edit', p[1]);
  if (p[1]) return viewKtDetail(p[1]);
  return viewKtList();
};
VIEWS['kt-moi'] = p => viewKtForm('new', p[1]);

function ktSel() { return S.ktf.ngay ? { ngay: S.ktf.ngay, ca: S.ktf.ca } : caNow(); }
function ktMatch(tb) {
  const f = S.ktf;
  if (f.kv && tb.ViTri !== f.kv) return false;
  if (f.nhom && tb.NhomTB !== f.nhom) return false;
  const n = norm(f.q);
  return !n || norm([tb.ID, tb.MaNhaMay, tb.TenMay, tb.TenMayZH, dmVi('NHOMTB', tb.NhomTB), dmVi('KHUVUC', tb.ViTri)].join(' ')).includes(n);
}
function ktSortTb(a, b) {
  const ka = dmGet('KHUVUC', a.ViTri), kb = dmGet('KHUVUC', b.ViTri);
  return ((ka ? Number(ka.ThuTu) : 999) - (kb ? Number(kb.ThuTu) : 999)) || String(a.ID).localeCompare(String(b.ID), 'en', { numeric: true });
}
/** Máy hiện trong tab đang chọn (đã lọc, xếp theo khu vực) → [{tb, kt}] */
function ktListItems(d, tab) {
  let list;
  if (tab === 'CHUA') list = d.todo.map(tb => ({ tb, kt: null }));
  else {
    list = [...d.last.values()].filter(kt => tab === 'DA' || ktBad(kt))
      .map(kt => ({ tb: tbById(kt.IDThietBi) || { ID: kt.IDThietBi, TenMay: '', ViTri: '' }, kt }));
  }
  return list.filter(x => ktMatch(x.tb)).sort((a, b) => ktSortTb(a.tb, b.tb));
}

function viewKtList() {
  if (!S.data) return loadingView();
  const f = S.ktf;
  const c = ktSel(), now = caNow();
  const loaded = ktDayLoaded(c.ngay);
  const d = ktShift(c);
  const isNow = caKey(c) === caKey(now);
  const pct = d.req.length ? Math.round(d.nDone * 100 / d.req.length) : 0;
  const cnt = { CHUA: d.todo.length, DA: d.last.size, LOI: d.bad.length };
  const skip = allTb().filter(tb => ['DUNG', 'DANGSUA'].includes(tb.TrangThai)).length;
  return {
    live: true, restoreScroll: true, title: 'shiftCheck', back: 'cv', tab: 'cv',
    html: `
      <section class="card pad slim ca-card">
        <div class="ca-nav">
          <button class="hbtn" data-act="ktCa" data-d="-1" aria-label="-1">${ic('back')}</button>
          <div class="grow ca-cur">${caBi(c, 'ca-name')}<span class="muted small">${esc(caTimes(c.ca))}${isNow ? ` · ${tp('caCurrent')}` : ''}</span></div>
          <button class="hbtn" data-act="ktCa" data-d="1" ${caCmp(c, now) >= 0 ? 'disabled' : ''} aria-label="+1">${ic('chev')}</button>
          ${isQL() ? `<button class="hbtn" data-act="caSettings" aria-label="${esc(tp('caSettings'))}">${ic('gear')}</button>` : ''}
        </div>
        ${!isNow ? `<button class="link ca-back" data-act="ktNow">${t('caBackNow')}</button>` : ''}
        <div class="kt-prog"><div class="prog"><i style="width:${pct}%"></i></div><b>${d.nDone}/${d.req.length}</b></div>
        <div class="small muted">${t('ktProgNote', d.bad.length)}</div>
      </section>
      <div class="toolbar sticky">
        <div class="seg sc-tabs">${KT_TABS.map(x => {
          const lb = tr(x.key);
          const n = cnt[x.id];
          const cls = x.id === 'CHUA' ? 'kt-TODO' : (x.id === 'LOI' ? 'kt-BAD' : 'kt-OK');
          return `<a data-act="ktTab" data-t="${x.id}" class="${x.id === f.tab ? 'on' : ''}">${bi(lb.vi, lb.zh)}${n ? `<span class="tcount ${cls}">${n}</span>` : ''}</a>`;
        }).join('')}</div>
        <div class="search">${ic('search')}<input type="search" id="kt-q" value="${esc(f.q)}" placeholder="${esc(tp('searchTb'))}" autocomplete="off"></div>
        <div class="chips">
          <button class="chip${f.kv ? ' on' : ''}" data-act="ktFilter" data-k="kv">${ic('map')}${f.kv ? dmBi('KHUVUC', f.kv) : t('allAreas')}</button>
          <button class="chip${f.nhom ? ' on' : ''}" data-act="ktFilter" data-k="nhom">${ic('device')}${f.nhom ? dmBi('NHOMTB', f.nhom) : t('allGroups')}</button>
        </div>
      </div>
      <div class="list-bar"><span id="kt-count" class="muted"></span><span class="sp"></span>
        <button class="link" data-act="ktCsv">${t('exportCsv')}</button><button class="link" data-act="ktCsvRange">${t('csvRangeShort')}</button></div>
      <div id="kt-list">${loaded ? '' : `<div class="card pad center"><div class="spinner"></div></div>`}</div>
      ${f.tab === 'CHUA' && skip ? `<p class="muted small">${t('ktSkipNote', skip)}</p>` : ''}`,
    after: () => {
      if (!loaded) { loadKtDay(c.ngay); return; }
      drawKtList();
      $('#kt-q').addEventListener('input', debounce(e => { S.ktf.q = e.target.value; drawKtList(); }, 150));
    }
  };
}

function drawKtList() {
  const box = $('#kt-list');
  if (!box) return;
  const c = ktSel();
  const d = ktShift(c);
  const list = ktListItems(d, S.ktf.tab);
  $('#kt-count').innerHTML = t('nDevices', list.length);
  if (!list.length) {
    const done = S.ktf.tab === 'CHUA' && d.req.length;
    box.innerHTML = `<div class="empty${done || S.ktf.tab === 'LOI' ? ' ok' : ''}">${ic(done || S.ktf.tab === 'LOI' ? 'checkCircle' : 'checklist')}${
      S.ktf.q || S.ktf.kv || S.ktf.nhom ? t('noResult') : t(S.ktf.tab === 'CHUA' ? (d.req.length ? 'ktAllDone' : 'noDevicesYet') : (S.ktf.tab === 'LOI' ? 'ktNoBad' : 'ktNoneYet'))}</div>`;
    return;
  }
  let html = '', kv = null;
  list.forEach(({ tb, kt }) => {
    if (tb.ViTri !== kv) {
      if (kv !== null) html += '</div>';
      kv = tb.ViTri;
      const n = list.filter(x => x.tb.ViTri === kv).length;
      html += `<h4 class="sec-h grp-h">${ic('map')}${tb.ViTri ? dmBi('KHUVUC', tb.ViTri) : '—'}<span class="count">${n}</span></h4><div class="tb-list">`;
    }
    html += ktTbItem(tb, kt);
  });
  box.innerHTML = html + '</div>';
}

function ktTbItem(tb, kt) {
  const ma = tb.MaNhaMay ? `<span class="tb-ma">${esc(tb.MaNhaMay)}</span>` : '';
  if (kt) {
    return `<a class="kt-item ${ktCls(kt)}" href="#/kt/${encodeURIComponent(kt.SoPhieu)}">
      <div class="tb-top"><span class="tb-id">${esc(tb.ID)}</span>${ma}<span class="sp"></span>${kqSumHtml(kt)}</div>
      ${bi(tb.TenMay, tb.TenMayZH, 'tb-name')}
      <div class="sc-meta"><span class="muted small">${ic('clock')} ${esc(fmtShort(kt.TGKiemTra))} · ${esc(kt.NguoiKiemTra)}</span></div>
    </a>`;
  }
  return `<a class="kt-item kt-TODO" href="#/kt-moi/${encodeURIComponent(tb.ID)}" data-act="ktGo" data-id="${esc(tb.ID)}">
    <div class="tb-top"><span class="tb-id">${esc(tb.ID)}</span>${ma}<span class="sp"></span>${tb.TrangThai !== 'CHAY' ? pill(tb.TrangThai) : ''}${ic('chev', 'mi-chev')}</div>
    ${bi(tb.TenMay, tb.TenMayZH, 'tb-name')}
    ${dmBi('NHOMTB', tb.NhomTB, 'meta')}
  </a>`;
}

/* ---- Chi tiết phiếu kiểm tra ---- */
function viewKtDetail(so) {
  if (!S.data) return loadingView();
  const kt = ktBySo(so);
  if (!kt) {
    if (S.online) {
      setTimeout(() => fetchMissingKT(so), 0);
      return { title: 'ktDetail', back: 'kt', tab: 'cv', html: `<div class="card pad center"><div class="spinner"></div><p class="muted">${t('loading')}</p></div>` };
    }
    return { title: 'ktDetail', back: 'kt', tab: 'cv', html: `<div class="empty">${ic('search')}${t('ktNotFound', so)}</div>` };
  }
  const items = ktDecode(kt);
  const nBad = Number(kt.SoMucKhongDat) || 0, nAll = Number(kt.SoMuc) || 0;
  const linked = allSC().filter(x => x.PhieuNguon === kt.SoPhieu).sort(scSortDesc);
  const ql = isQL();
  const enc = encodeURIComponent(kt.SoPhieu);
  const canEdit = ktCanEdit(kt);
  const ban = mauBanOf(kt.MaBan);
  const tpl = ban ? mauName(ban.NhomTB) : { vi: kt.MaBan, zh: '' };
  const kv = (key, val, raw) => (val === '' || val === null || val === undefined) ? '' :
    `<div class="kv"><div class="k">${t(key)}</div><div class="v">${raw ? val : esc(val)}</div></div>`;
  return {
    live: true, title: 'ktDetail', back: 'kt', tab: 'cv',
    html: `
      <section class="card hero ${ktCls(kt)}">
        <div class="hero-main">
          <div class="hero-ids"><span class="sc-no big">${esc(kt.SoPhieu)}</span>${ktPill(kt)}</div>
          <div class="ca-line">${caBi({ ngay: kt.NgayCa, ca: String(kt.Ca) }, 'ca-name')}<span class="muted small">${esc(caTimes(kt.Ca))}</span></div>
          <div class="sc-meta">${kqSumHtml(kt)}</div>
        </div>
      </section>
      ${tbCard(kt.IDThietBi)}
      <div class="actions-row">
        ${canEdit ? `<a class="btn sm" href="#/kt/${enc}/sua">${ic('edit')}${t('edit')}</a>` : ''}
        ${nBad ? `<a class="btn sm" href="#/sc-moi/${encodeURIComponent(kt.IDThietBi)}/${enc}">${ic('wrench')}${t('btMakeSc')}</a>` : ''}
        <button class="btn sm" data-act="printBt04One" data-id="${esc(kt.IDThietBi)}" data-m="${esc(String(kt.NgayCa).slice(0, 7))}">${ic('print')}${t('pKtMonth')}</button>
      </div>
      <section class="card">
        <div class="card-h">${ic('checklist')}${t('btResults')}<span class="count">${nAll - nBad}/${nAll}</span></div>
        ${items ? items.map(kqRow).join('') : `<div class="empty small">${t('ktTplMissing', kt.MaBan)}</div>`}
      </section>
      <section class="card">
        <div class="card-h">${ic('info')}${t('info')}</div>
        ${kv('ktTime', fmtTime(kt.TGKiemTra))}
        ${kv('ktNguoi', kt.NguoiKiemTra)}
        ${kv('ktTpl', `${bi(tpl.vi, tpl.zh)} <span class="dm-code">${esc(kt.MaBan)}</span>`, true)}
        ${kt.GhiChu ? `<div class="kv col"><div class="k">${t('fGhiChu')}</div><div class="v pre">${esc(kt.GhiChu)}</div></div>` : ''}
      </section>
      ${linked.length ? `<section class="card">
        <div class="card-h">${ic('wrench')}${t('btLinkedSc')}<span class="count">${linked.length}</span></div>
        <div class="mini-list">${linked.map(x => scMini(x, false)).join('')}</div>
      </section>` : ''}
      <p class="muted small audit">${t('createdBy', fmtTime(kt.NgayTao), kt.NguoiTao || '—')}${kt.NgaySua !== kt.NgayTao ? `<br>${t('updatedBy', fmtTime(kt.NgaySua), kt.NguoiSua || '—')}` : ''}</p>
      ${!ql && !canEdit ? `<p class="muted small audit">${t('ktEditWindow', KT_EDIT_HOURS)}</p>` : ''}
      ${ql ? `<button class="btn block danger-outline" data-act="ktDelete" data-so="${esc(kt.SoPhieu)}">${ic('trash')}${t('ktDelete')}</button>` : ''}`
  };
}

async function fetchMissingKT(so) {
  try { const r = await api('listKT', { so }); mergeKT(r.rows); } catch (e) { /* hiển thị không tìm thấy */ }
  const p = route();
  if (p[0] !== 'kt' || !p[1] || p[1].toUpperCase() !== String(so).toUpperCase()) return;
  if (ktBySo(so)) render(true);
  else $('#view .page').innerHTML = `<div class="empty">${ic('search')}${t('ktNotFound', so)}</div>`;
}

async function ktDelete(so) {
  const kt = ktBySo(so);
  if (!kt || !needOnline()) return;
  if (!(await confirmDlg(tr('ktDeleteQ', [so]), 'ktDeleteMsg', { ok: 'delete', danger: true }))) return;
  try {
    await api('ktAction', { op: 'xoa', so, ngaySuaCu: kt.NgaySua || '' });
    removeKT(so);
    toast(tr('scDeleted', [so]), 'ok');
    location.replace('#/kt');
  } catch (e) { await ktHandleErr(e); }
}

async function ktHandleErr(e) {
  if (e.code === 'CONFLICT') {
    const ex = e.extra || {};
    closeSheet();
    if (await confirmDlg('eConflict', tr('scConflictMsg', [ex.nguoiSua || '?', fmtTime(ex.ngaySua)]), { ok: 'reload' })) {
      S.ktForm = null;
      await refresh(true);
      const p = route();
      if (p[0] === 'kt' && p[1] && p[2]) location.replace('#/kt/' + encodeURIComponent(p[1])); else render();
    }
  } else if (e.code === 'FORBIDDEN' && e.extra && e.extra.hours) {
    toast(tr('ktEditWindow', [e.extra.hours]), 'err');
  } else if (e.code !== 'AUTH') {
    toast(errText(e), 'err');
  }
}

/* ---- Biểu mẫu kiểm tra: ghi mới (new) · sửa (edit) ---- */
function viewKtForm(mode, key) {
  if (!S.data) return loadingView();
  let tb, cur = null, items, mau = null;
  if (mode === 'new') {
    tb = tbById(key);
    if (!tb) return { title: 'ktNewTitle', back: 'kt', tab: 'cv', html: `<div class="empty">${ic('search')}${t('tbNotFound', key)}</div>` };
    const bad = KT_NO_CHECK.includes(tb.TrangThai) ? 'ktNotInUse' : (!mauFor(tb).items.length ? 'ktNoTemplate' : '');
    if (bad) return { title: 'ktNewTitle', back: 'tb/' + encodeURIComponent(tb.ID), tab: 'cv', html: `<div class="notice warn">${ic('alert')}<div>${t(bad)}</div></div>` };
    mau = mauFor(tb);
    items = mauItems(mau.items);
  } else {
    cur = ktBySo(key);
    if (!cur) {
      if (S.online) { setTimeout(() => fetchMissingKT(key), 0); return loadingView(); }
      return { title: 'ktEditTitle', back: 'kt', tab: 'cv', html: `<div class="empty">${t('ktNotFound', key)}</div>` };
    }
    if (!ktCanEdit(cur)) return forbiddenView('kt/' + encodeURIComponent(cur.SoPhieu));
    tb = tbById(cur.IDThietBi) || { ID: cur.IDThietBi, TenMay: '', NhomTB: '' };
    items = mauBanItems(cur.MaBan);
    if (!items) return { title: 'ktEditTitle', back: 'kt/' + encodeURIComponent(cur.SoPhieu), tab: 'cv', html: `<div class="notice warn">${ic('alert')}<div>${t('ktTplMissing', cur.MaBan)}</div></div>` };
  }
  const fkey = mode + ':' + (cur ? cur.SoPhieu : tb.ID + ':' + mau.key);
  if (!S.ktForm || S.ktForm.key !== fkey) {
    // Mẫu vừa đổi (tải lại) → giữ các kết quả đã chấm của hạng mục trùng tên
    const prev = S.ktForm && S.ktForm.mode === mode && S.ktForm.id === tb.ID ? S.ktForm : null;
    const same = it => prev ? prev.items.findIndex(x => x.HangMucVI === it.HangMucVI && x.KieuNhap === it.KieuNhap) : -1;
    const dec = cur ? ktDecode(cur) : null;
    const c = caNow();
    const ret = S.ktRet || { ret: S.lastHash || '', canBack: !!S.lastHash };
    S.ktRet = null;
    S.ktForm = {
      key: fkey, mode, id: tb.ID, orig: cur ? cur.NgaySua : undefined, mauKey: mau ? mau.key : '', nhom: mau ? mau.nhom : '',
      items,
      kq: items.map((it, i) => {
        if (dec) return { STT: it.STT, KetQua: dec[i].KetQua, GiaTri: dec[i].GiaTri, GhiChu: dec[i].GhiChu };
        const j = same(it);
        return j >= 0 ? Object.assign({}, prev.kq[j], { STT: it.STT }) : { STT: it.STT, KetQua: '', GiaTri: '', GhiChu: '' };
      }),
      kt: cur ? { NgayCa: cur.NgayCa, Ca: String(cur.Ca), TGKiemTra: cur.TGKiemTra, NguoiKiemTra: cur.NguoiKiemTra, GhiChu: cur.GhiChu || '' }
        : (prev ? Object.assign({}, prev.kt) : { NgayCa: c.ngay, Ca: c.ca, TGKiemTra: tsNow(), NguoiKiemTra: S.name, GhiChu: '' }),
      caTouched: prev ? prev.caTouched : !!cur,
      ret: prev ? prev.ret : ret.ret, canBack: prev ? prev.canBack : ret.canBack
    };
  }
  const F = S.ktForm;
  const K = F.kt;
  const hasDat = F.items.some(x => x.KieuNhap !== 'SO');
  const tpl = mauName(mode === 'new' ? F.nhom : ((mauBanOf(cur.MaBan) || {}).NhomTB || ''));
  const dup = mode === 'new' ? ktLastOf(tb.ID, { ngay: K.NgayCa, ca: K.Ca }) : null;
  const nCa = caStarts().length;
  const cas = Array.from({ length: Math.max(nCa, Number(K.Ca) || 1) }, (_, i) => String(i + 1));
  const next = mode === 'new' && F.ret === '#/kt' && ktNextId(tb.ID);
  const back = cur ? 'kt/' + encodeURIComponent(cur.SoPhieu) : (F.ret ? F.ret.replace(/^#\//, '') : 'tb/' + encodeURIComponent(tb.ID));
  const names = uniqueRecent('NguoiThucHien', [S.name].concat(allKT().slice().sort(ktSortDesc).map(x => x.NguoiKiemTra)));
  return {
    title: cur ? 'ktEditTitle' : 'ktNewTitle', back, tab: 'cv', noPtr: true,
    html: `
      <form id="f-kt" class="form" autocomplete="off" novalidate>
        <section class="card pad slim sc-sumcard ${cur ? ktCls(cur) : 'kt-TODO'}">
          <div class="mini-top"><span class="tb-id">${esc(tb.ID)}</span>${tb.MaNhaMay ? `<span class="tb-ma">${esc(tb.MaNhaMay)}</span>` : ''}
            <span class="sp"></span>${cur ? `<span class="sc-no">${esc(cur.SoPhieu)}</span>` : ''}</div>
          ${bi(tb.TenMay, tb.TenMayZH, 'tb-name')}
          <div class="small muted">${t('ktTplUsedN', tpl, F.items.length)}</div>
        </section>
        <div id="kt-dup">${dup ? ktDupNotice(dup) : ''}</div>
        <section class="card pad ck-card">
          <div class="card-h flat" data-fld="ketQua">${ic('checklist')}${t('khChecklist')}</div>
          <div class="ck-bar"><span id="ck-prog"></span>
            ${hasDat ? `<button type="button" class="btn sm" data-act="btAllPass">${ic('check')}${t('btAllPass')}</button>` : ''}</div>
          <div id="ck-list">${F.items.map((it, i) => ckItemHtml(it, i, F.kq[i])).join('')}</div>
        </section>
        <section class="card pad">
          <div class="card-h flat">${ic('clock')}${t('ktShiftTime')}</div>
          <div class="grid2">
            <label class="fld" data-fld="NgayCa"><span class="lb">${t('ktNgayCa')} <b class="req">*</b></span>
              <input type="date" data-tf="NgayCa" value="${esc(K.NgayCa)}"><span class="fe"></span></label>
            <div class="fld" data-fld="Ca"><span class="lb">${t('ktCa')} <b class="req">*</b></span>
              <div class="seg ca-seg">${cas.map(n => `<label><input type="radio" name="kt-ca" value="${n}" data-tf="Ca" ${String(K.Ca) === n ? 'checked' : ''}><span>${t('caN', n)}</span></label>`).join('')}</div>
              <span class="fe"></span></div>
          </div>
          <label class="fld" data-fld="TGKiemTra"><span class="lb">${t('ktTime')} <b class="req">*</b></span>
            <input type="datetime-local" data-tf="TGKiemTra" value="${esc(tsToInput(K.TGKiemTra))}"><span class="fe"></span></label>
          <label class="fld" data-fld="NguoiKiemTra"><span class="lb">${t('ktNguoi')} <b class="req">*</b></span>
            <input data-tf="NguoiKiemTra" value="${esc(K.NguoiKiemTra || '')}" maxlength="150" list="dl-ng" placeholder="${esc(tp('scNguoiThucHienPh'))}"><span class="fe"></span></label>
          <label class="fld" data-fld="GhiChu"><span class="lb">${t('fGhiChu')}</span>
            <textarea data-tf="GhiChu" rows="2" maxlength="1000">${esc(K.GhiChu || '')}</textarea><span class="fe"></span></label>
          ${mode === 'new' ? `<p class="muted small">${t('ktAfterSaveHint')}</p>` : ''}
        </section>
        ${datalist('dl-ng', names)}
        <div class="form-actions">
          ${next ? `<button class="btn" type="submit">${ic('check')}${t('save')}</button>
            <button class="btn primary" type="submit" data-next="1">${t('ktSaveNext')}${ic('chev')}</button>`
            : `<a class="btn" href="#/${back}">${t('cancel')}</a>
            <button class="btn primary" type="submit">${ic('check')}${t('save')}</button>`}
        </div>
      </form>`,
    after: () => {
      const form = $('#f-kt');
      form.addEventListener('submit', saveKtForm);
      form.addEventListener('input', e => { clearFieldErr(e); ktFormInput(e.target); btFormInput(e.target); });
      form.addEventListener('change', e => { ktFormInput(e.target); btFormInput(e.target); });
      ckProgress();
    }
  };
}

function ktDupNotice(kt) {
  return `<a class="notice warn" href="#/kt/${encodeURIComponent(kt.SoPhieu)}">${ic('alert')}<div>${t('ktDupWarn', fmtShort(kt.TGKiemTra), kt.NguoiKiemTra || '')}</div>${ic('chev')}</a>`;
}

function ktFormInput(el) {
  const F = S.ktForm;
  if (!F || !el.dataset.tf) return;
  const f = el.dataset.tf, K = F.kt;
  if (el.type === 'radio') { if (el.checked) K[f] = el.value; }
  else if (el.type === 'datetime-local') K[f] = inputToTs(el.value);
  else K[f] = el.value;
  if (f === 'NgayCa' || f === 'Ca') F.caTouched = true;
  // Đổi thời gian kiểm tra → ngày ca / ca đi theo (cho tới khi người dùng tự chọn ca)
  if (f === 'TGKiemTra' && K.TGKiemTra && !F.caTouched) {
    const c = caOf(K.TGKiemTra);
    K.NgayCa = c.ngay; K.Ca = c.ca;
    const d = $('#f-kt [data-tf="NgayCa"]');
    if (d) d.value = c.ngay;
    $$('#f-kt [data-tf="Ca"]').forEach(r => { r.checked = r.value === c.ca; });
  }
  if (F.mode === 'new' && ['TGKiemTra', 'NgayCa', 'Ca'].includes(f)) {
    const dup = ktLastOf(F.id, { ngay: K.NgayCa, ca: K.Ca });
    const box = $('#kt-dup');
    if (box) box.innerHTML = dup ? ktDupNotice(dup) : '';
  }
}

/** Máy chưa kiểm tra kế tiếp trong danh sách đã mở form (theo cùng ca) */
function ktNextId(curId) {
  const q = S.ktNext;
  if (!q || !q.ids || !q.ids.length) return null;
  const c = q.ca;
  const d = ktShift(c);
  const todo = new Set(d.todo.map(tb => tb.ID));
  const i = q.ids.indexOf(curId);
  for (let k = i + 1; k < q.ids.length; k++) if (q.ids[k] !== curId && todo.has(q.ids[k])) return q.ids[k];
  return null;
}

function ktGoBack(F, so) {
  if (F.canBack && F.ret) history.back();
  else location.replace(F.ret || '#/kt/' + encodeURIComponent(so));
}

async function saveKtForm(ev) {
  ev.preventDefault();
  if (!needOnline()) return;
  const form = ev.target;
  const F = S.ktForm;
  if (!F) return;
  const nextMode = !!(ev.submitter && ev.submitter.dataset.next);
  const K = F.kt;
  $$('.has-err', form).forEach(el => { el.classList.remove('has-err'); const fe = $('.fe', el); if (fe) fe.innerHTML = ''; });
  let bad = false;
  const err = (f, k, a) => { scFieldErr(form, f, k, a); bad = true; };
  if (!K.TGKiemTra) err('TGKiemTra', 'eRequired');
  if (!K.NgayCa) err('NgayCa', 'eRequired');
  if (!K.Ca) err('Ca', 'eRequired');
  if (!String(K.NguoiKiemTra || '').trim()) err('NguoiKiemTra', 'eRequired');
  F.kq.forEach((r, i) => {
    const it = F.items[i];
    const k = it.KieuNhap === 'SO' ? ckEval(it, r.GiaTri) : r.KetQua;
    if (!k || k === 'BAD') err('ck' + i, k === 'BAD' ? 'eNumber' : 'ckMissing');
  });
  if (bad) { toast('eInvalid', 'err'); const first = $('.has-err', form); if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
  const kt = { NgayCa: K.NgayCa, Ca: String(K.Ca), TGKiemTra: K.TGKiemTra, NguoiKiemTra: String(K.NguoiKiemTra).trim(), GhiChu: String(K.GhiChu || '').trim() };
  const ketQua = F.kq.map(r => ({ STT: r.STT, KetQua: r.KetQua, GiaTri: String(r.GiaTri || '').replace(',', '.'), GhiChu: String(r.GhiChu || '').trim() }));
  const payload = F.mode === 'new'
    ? { op: 'create', kt: Object.assign({ IDThietBi: F.id }, kt), mauKey: F.mauKey, ketQua }
    : { op: 'capnhat', so: F.key.split(':')[1], ngaySuaCu: F.orig || '', kt, ketQua };
  busy(form, true);
  try {
    const r = await api('ktAction', payload);
    mergeKT([r.kt]);
    if (r.mauBan && r.mauBan.length) mergeMauBan(r.mauBan);
    S.ktForm = null;
    const so = r.kt.SoPhieu;
    const nBad = Number(r.kt.SoMucKhongDat) || 0;
    if (r.unchanged) toast('scNoChange', 'ok');
    else toast(F.mode === 'new' ? tr(nBad ? 'ktSavedBad' : 'ktSaved', [so, nBad]) : tr('saved'), nBad ? 'warn' : 'ok');
    if (F.mode === 'edit') {
      const detail = '#/kt/' + encodeURIComponent(so);
      if (S.prevHash === detail) history.back(); else location.replace(detail);
    } else if (nBad) {
      // Có hạng mục không đạt → mở phiếu kiểm tra và đề nghị tạo phiếu sửa chữa (dừng chuỗi "máy tiếp theo")
      location.replace('#/kt/' + encodeURIComponent(so));
      setTimeout(() => offerScFromKt(so, nBad), 400);
    } else if (nextMode && F.ret === '#/kt' && ktNextId(F.id)) {
      S.ktRet = { ret: F.ret, canBack: F.canBack };
      location.replace('#/kt-moi/' + encodeURIComponent(ktNextId(F.id)));
    } else {
      ktGoBack(F, so);
    }
  } catch (e) {
    if (e.code === 'TPL_CHANGED') {
      toast('ktTplChanged', 'warn');
      await refresh(true);
      render();
    } else if (e.code === 'INVALID' && e.extra && e.extra.errors) {
      e.extra.errors.forEach(x => {
        if (x.field === 'ketQua') (x.items || []).forEach(stt => { const i = F.items.findIndex(it => String(it.STT) === String(stt)); if (i >= 0) scFieldErr(form, 'ck' + i, 'ckMissing'); });
        else if (!scFieldErr(form, x.field, reasonKey(x.reason))) toast(tr('eFieldX', [ktFieldName(x.field), tr(reasonKey(x.reason))]), 'err');
      });
      toast('eInvalid', 'err');
      const first = $('.has-err', form); if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } else await ktHandleErr(e);
  } finally { if (form.isConnected) busy(form, false); }
}
function ktFieldName(f) {
  const k = { IDThietBi: 'scMay', TGKiemTra: 'ktTime', NgayCa: 'ktNgayCa', Ca: 'ktCa', NguoiKiemTra: 'ktNguoi' }[f];
  return k ? tr(k) : { vi: f, zh: f };
}

async function offerScFromKt(so, nBad) {
  const kt = ktBySo(so);
  if (!kt) return;
  if (await confirmDlg(tr('btOfferScQ', [nBad]), 'btOfferScMsg', { ok: 'btMakeSc' })) {
    location.hash = '#/sc-moi/' + encodeURIComponent(kt.IDThietBi) + '/' + encodeURIComponent(so);
  }
}

/** Mô tả phiếu sửa chữa điền sẵn từ các hạng mục không đạt của phiếu kiểm tra */
function scMoTaFromKt(kt) {
  const c = caTr({ ngay: kt.NgayCa, ca: String(kt.Ca) });
  const head = `[${kt.SoPhieu}] ${tr('shiftCheck').vi} ${c.vi}`;
  const bad = (ktDecode(kt) || []).filter(x => x.KetQua === 'KHONGDAT');
  if (!bad.length) return `${head}: ${tr('kqBadN', [Number(kt.SoMucKhongDat) || 0, Number(kt.SoMuc) || 0]).vi}`;
  return head + ':\n' + bad.map(x => `- ${x.HangMucVI}${x.KieuNhap === 'SO' ? ` = ${fmtNum(x.GiaTri)}${x.DonVi ? ' ' + x.DonVi : ''}` : ''}${x.GhiChu ? ` (${x.GhiChu})` : ''}`).join('\n');
}

/* ---- Xuất CSV kiểm tra (mỗi hạng mục một dòng) ---- */
function ktCsvRows(list) {
  const head = csvHead([['', 'Số phiếu', '单号'], ['', 'Ngày ca', '班次日期'], ['', 'Ca', '班次'], ['', 'ID', ''], ['', 'Tên máy', '设备名称'],
    ['', 'Khu vực', '区域'], ['', 'Thời gian kiểm tra', '点检时间'], ['', 'Người kiểm tra', '点检人'], ['', 'STT', '序号'],
    ['', 'Hạng mục', '点检项目'], ['', 'Hạng mục (Trung)', '点检项目(中文)'], ['', 'Giá trị', '数值'], ['', 'Đơn vị', '单位'],
    ['', 'Kết quả', '结果'], ['', 'Ghi chú hạng mục', '项目备注'], ['', 'Ghi chú phiếu', '点检备注']]);
  const rows = [head];
  list.slice().sort((a, b) => String(a.NgayCa).localeCompare(String(b.NgayCa)) || Number(a.Ca) - Number(b.Ca) ||
    String(a.IDThietBi).localeCompare(String(b.IDThietBi), 'en', { numeric: true }) || String(a.TGKiemTra).localeCompare(String(b.TGKiemTra))).forEach(kt => {
    const tb = tbById(kt.IDThietBi);
    const base = [kt.SoPhieu, kt.NgayCa, kt.Ca, kt.IDThietBi, tb ? tb.TenMay : '', tb ? dmVi('KHUVUC', tb.ViTri) : '', kt.TGKiemTra, kt.NguoiKiemTra];
    const items = ktDecode(kt) || [];
    if (!items.length) rows.push(base.concat(['', '', '', '', '', '', '', kt.GhiChu || '']));
    items.forEach(x => rows.push(base.concat([x.STT, x.HangMucVI, x.HangMucZH, x.GiaTri, x.DonVi, x.KetQua ? tr('kq' + x.KetQua).vi : '', x.GhiChu, kt.GhiChu || ''])));
  });
  return rows;
}
function exportKtShiftCsv() {
  const c = ktSel();
  downloadCsv(`kiem-tra-dau-ca_${c.ngay}_ca${c.ca}.csv`, ktCsvRows(ktShift(c).rows));
}

/** Hộp chọn khoảng ngày → Promise<{tu, den} | undefined> */
function rangeSheet(titleKey) {
  return new Promise(res => {
    const today = dToday();
    const sh = openSheet(`
      <form class="form" id="f-rg" autocomplete="off">
        <div class="pk-head"><h3 class="h3">${t(titleKey)}</h3><button type="button" class="hbtn" data-act="closeSheet">${ic('x')}</button></div>
        <div class="grid2">
          <label class="fld"><span class="lb">${t('rgFrom')}</span><input type="date" name="tu" value="${today.slice(0, 8)}01" max="${today}"></label>
          <label class="fld"><span class="lb">${t('rgTo')}</span><input type="date" name="den" value="${today}" max="${today}"></label>
        </div>
        <div class="msg" id="rg-msg"></div>
        <button class="btn primary block" type="submit">${ic('download')}${t('exportCsv')}</button>
      </form>`, { onClose: v => res(v) });
    $('#f-rg', sh).addEventListener('submit', ev => {
      ev.preventDefault();
      const tu = ev.target.tu.value, den = ev.target.den.value;
      if (!tu || !den || tu > den) { $('#rg-msg').innerHTML = t('eDate'); return; }
      closeSheet({ tu, den });
    });
  });
}
async function exportRangeCsv(kind) {
  if (!needOnline()) return;
  const rg = await rangeSheet(kind === 'kt' ? 'ktCsvRange' : 'gcCsvRange');
  if (!rg) return;
  toast('loading');
  try {
    const r = await api(kind === 'kt' ? 'listKT' : 'listGC', rg);
    if (kind === 'kt') downloadCsv(`kiem-tra-dau-ca_${rg.tu}_${rg.den}.csv`, ktCsvRows(r.rows));
    else downloadCsv(`gio-chay_${rg.tu}_${rg.den}.csv`, gcCsvRows(r.rows));
    if (r.more) toast('csvCapped', 'warn');
  } catch (e) { if (e.code !== 'AUTH') toast(errText(e), 'err'); }
}

/* ---- Ca làm việc (quản lý) ---- */
function caSettingsSheet() {
  if (!isQL()) return;
  const cur = caStarts().map(hhmmOf);
  const draw = n => {
    const base = cur.length === n ? cur : CA_PRESET[n];
    return base.map((v, i) => `<label class="fld"><span class="lb">${t('caStartN', i + 1)}</span><input type="time" name="ca${i}" value="${v}" required></label>`).join('');
  };
  const sh = openSheet(`
    <form class="form" id="f-ca" autocomplete="off">
      <div class="pk-head"><h3 class="h3">${t('caSettings')}</h3><button type="button" class="hbtn" data-act="closeSheet">${ic('x')}</button></div>
      <div class="fld"><span class="lb">${t('caCount')}</span>
        <div class="seg">${[1, 2, 3].map(n => `<label><input type="radio" name="n" value="${n}" ${cur.length === n ? 'checked' : ''}><span>${t('caCountN', n)}</span></label>`).join('')}</div></div>
      <div id="ca-times" class="grid3 ca-times">${draw(cur.length)}</div>
      <p class="muted small">${t('caHint', KT_EARLY_MIN)}</p>
      <div class="msg" id="ca-msg"></div>
      <button class="btn primary block" type="submit">${ic('check')}${t('save')}</button>
    </form>`);
  const form = $('#f-ca', sh);
  form.addEventListener('change', e => { if (e.target.name === 'n') $('#ca-times', sh).innerHTML = draw(Number(e.target.value)); });
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    if (!needOnline()) return;
    const v = $$('input[type=time]', form).map(x => x.value).join(',');
    if (!parseCa(v)) { $('#ca-msg').innerHTML = t('caBad'); return; }
    busy(form, true);
    try {
      const r = await api('saveCauHinh', { CaBatDau: v });
      S.data.cauHinh = Object.assign({}, S.data.cauHinh, r.cauHinh);
      saveCache();
      closeSheet();
      S.ktf.ngay = ''; S.ktf.ca = '';
      toast('saved', 'ok');
      render(true);
    } catch (e) { $('#ca-msg').innerHTML = errHtml(e); } finally { if (form.isConnected) busy(form, false); }
  });
}

/* ---- Giờ chạy: dữ liệu ---- */
function allGC() { return (S.data && S.data.gioChay) || []; }
function gcSortDesc(a, b) { return String(b.Ngay).localeCompare(String(a.Ngay)); }
function mergeGC(rows) {
  if (!S.data) return;
  const arr = S.data.gioChay || (S.data.gioChay = []);
  rows.forEach(r => {
    const i = arr.findIndex(x => x.IDThietBi === r.IDThietBi && x.Ngay === r.Ngay);
    if (i >= 0) arr[i] = r; else arr.push(r);
  });
  saveCache();
}
function gcOfTb(id) { const k = String(id).toUpperCase(); return allGC().filter(x => String(x.IDThietBi).toUpperCase() === k).sort(gcSortDesc); }
function gcTracked() { return allTb().filter(x => GC_KIEU.includes(x.KieuGioChay) && !KT_NO_CHECK.includes(x.TrangThai)); }
/** Mỗi máy: lần ghi gần nhất, lũy kế, giờ chạy trung bình/ngày (15 ngày gần nhất) */
function gcIdx() {
  const by = {};
  allGC().forEach(x => { const k = String(x.IDThietBi).toUpperCase(); (by[k] = by[k] || []).push(x); });
  const out = {};
  const from = dAdd(dToday(), -GC_DAYS, 'NGAY');
  Object.keys(by).forEach(k => {
    const a = by[k].sort(gcSortDesc);
    const last = a[0];
    const win = a.filter(x => x.Ngay >= from && x.LuyKe !== '');
    let avg = null;
    if (win.length >= 2) {
      const n = dDiff(win[win.length - 1].Ngay, win[0].Ngay);
      if (n >= 2) avg = Math.max(0, (Number(win[0].LuyKe) - Number(win[win.length - 1].LuyKe)) / n);
    }
    out[k] = { last, ngay: last.Ngay, luyKe: last.LuyKe === '' ? null : Number(last.LuyKe), avg };
  });
  return out;
}
function gcKieuTr(k) { return tr(k === 'DONGHO' ? 'gcKDONGHO' : (k === 'NGAY' ? 'gcKNGAY' : 'gcKNONE')); }
function gcValOf(x) { return x.Kieu === 'DONGHO' ? x.ChiSo : x.SoGio; }
function gcCanEdit(x) { return isQL() || (Date.now() - tsMs(x.NgayTao) <= KT_EDIT_HOURS * 3600000); }

/* ---- Trang máy: giờ chạy ---- */
function tbGcSection(tb) {
  const tracked = GC_KIEU.includes(tb.KieuGioChay);
  const rows = gcOfTb(tb.ID);
  if (!tracked && !rows.length) {
    return `<section class="card">
      <div class="card-h">${ic('gauge')}${t('runHours')}</div>
      <div class="empty small">${t('gcNotTracked')}</div>
      ${isQL() && tb.TrangThai !== 'THANHLY' ? `<div class="card-f"><button class="btn sm" data-act="gcKieuOne" data-id="${esc(tb.ID)}">${ic('gear')}${t('gcSetKieu')}</button></div>` : ''}
    </section>`;
  }
  const g = gcIdx()[String(tb.ID).toUpperCase()];
  const loading = S.online && !S.gcTbLoaded.has(tb.ID);
  const k = gcKieuTr(tb.KieuGioChay);
  return `<section class="card">
    <div class="card-h">${ic('gauge')}${t('runHours')}<span class="sp"></span><span class="tag">${bi(k.vi, k.zh)}</span></div>
    <div class="dur-grid">
      <div class="dcell"><div class="dk">${t('gcLuyKe')}</div><div class="dv">${g && g.luyKe !== null ? esc(fmtH(g.luyKe)) + ' h' : '—'}</div>
        ${g ? `<div class="small muted">${esc(fmtDate(g.ngay))}</div>` : ''}</div>
      <div class="dcell"><div class="dk">${t('gcAvg')}</div><div class="dv">${g && g.avg !== null ? esc(fmtH(g.avg)) + ' h' : '—'}</div></div>
    </div>
    ${rows.length ? `<div class="mini-list">${rows.slice(0, 5).map((x, i) => gcMini(x, i === 0)).join('')}</div>` : ''}
    ${loading ? `<div class="empty small"><div class="spinner"></div></div>` : (rows.length ? '' : `<div class="empty small">${t('gcNoData')}</div>`)}
    <div class="card-f">
      ${tracked && tb.TrangThai !== 'THANHLY' ? `<button class="btn sm primary" data-act="gcOne" data-id="${esc(tb.ID)}">${ic('gauge')}${t('gcRecord')}</button>` : ''}
      <span class="sp"></span>
      ${isQL() ? `<button class="btn sm" data-act="gcKieuOne" data-id="${esc(tb.ID)}">${ic('gear')}${t('gcSetKieu')}</button>` : ''}
    </div>
  </section>`;
}
function gcMini(x, latest) {
  const v = gcValOf(x);
  return `<div class="mini gc-mini">
    <div class="mini-main">
      <div class="mini-top"><b>${esc(fmtDate(x.Ngay))}</b><span class="muted small">${esc(x.NguoiTao || '')}</span></div>
      <div class="sc-meta"><span class="small">${x.Kieu === 'DONGHO' ? `${t('gcChiSoShort')} <b>${esc(fmtH(v))}</b>` : `<b>${esc(fmtH(v))} h</b>`}</span>
        ${x.SoGio !== '' && x.Kieu === 'DONGHO' ? `<span class="tag">+${esc(fmtH(x.SoGio))} h</span>` : ''}
        ${isOn(x.ThayDongHo) ? `<span class="tag warn">${t('gcResetTag')}</span>` : ''}
        <span class="sp"></span><span class="muted small">Σ ${esc(fmtH(x.LuyKe))} h</span></div>
      ${x.GhiChu ? `<div class="small muted">${esc(x.GhiChu)}</div>` : ''}
    </div>
    ${latest && isQL() ? `<button class="hbtn sm danger" data-act="gcDelete" data-id="${esc(x.IDThietBi)}" data-ngay="${esc(x.Ngay)}" aria-label="${esc(tp('delete'))}">${ic('trash')}</button>` : ''}
  </div>`;
}
async function loadTbGcHistory(id) {
  if (!S.online || S.gcTbLoaded.has(id)) return;
  S.gcTbLoaded.add(id);
  try { const r = await api('listGC', { id, limit: 30 }); mergeGC(r.rows); } catch (e) { /* giữ dữ liệu đã có */ }
  rerenderTb(id);
}

/* ---- Màn hình ghi giờ chạy (nhiều máy một lần) ---- */
function gcNgay() { return S.gcf.ngay || dToday(); }
/** Trạng thái ô nhập của một máy tại ngày đang chọn */
function gcRowState(tb, ngay) {
  const rows = gcOfTb(tb.ID);
  const at = rows.find(x => x.Ngay === ngay) || null;
  const last = rows[0] || null;
  const prev = rows.find(x => x.Ngay < ngay) || null;
  let mode;
  if (at) mode = last === at && gcCanEdit(at) ? 'edit' : 'done';
  else mode = !last || last.Ngay < ngay ? 'new' : 'locked';
  return { at, last, prev, mode, days: prev ? Math.max(1, dDiff(prev.Ngay, ngay)) : 1 };
}
function gcFiltered() {
  const f = S.gcf, n = norm(f.q);
  return gcTracked().filter(tb => (!f.kv || tb.ViTri === f.kv) && (!f.nhom || tb.NhomTB === f.nhom) &&
    (!n || norm([tb.ID, tb.MaNhaMay, tb.TenMay, tb.TenMayZH].join(' ')).includes(n))).sort(ktSortTb);
}

VIEWS.gc = () => {
  if (!S.data) return loadingView();
  const f = S.gcf;
  const ngay = gcNgay(), today = dToday();
  const all = gcTracked();
  const nDone = all.filter(tb => allGC().some(x => x.IDThietBi === tb.ID && x.Ngay === ngay)).length;
  const pct = all.length ? Math.round(nDone * 100 / all.length) : 0;
  const minDay = dAdd(today, -(GC_DAYS - 1), 'NGAY');
  const w = dowOf(ngay);
  return {
    live: true, restoreScroll: true, title: 'runHours', back: 'cv', tab: 'cv', noPtr: Object.keys(S.gcEdit).length > 0,
    html: `
      <section class="card pad slim ca-card">
        <div class="ca-nav">
          <button class="hbtn" data-act="gcDay" data-d="-1" ${ngay <= minDay ? 'disabled' : ''} aria-label="-1">${ic('back')}</button>
          <div class="grow ca-cur">${bi(`${DOW.vi[w]} ${fmtDate(ngay)}`, `${DOW.zh[w]} ${fmtDate(ngay)}`, 'ca-name')}<span class="muted small">${ngay === today ? tp('today') : ''}</span></div>
          <button class="hbtn" data-act="gcDay" data-d="1" ${ngay >= today ? 'disabled' : ''} aria-label="+1">${ic('chev')}</button>
        </div>
        <div class="kt-prog"><div class="prog"><i style="width:${pct}%"></i></div><b>${nDone}/${all.length}</b></div>
        <div class="small muted">${t('gcHint')}</div>
      </section>
      <div class="toolbar sticky">
        <div class="search">${ic('search')}<input type="search" id="gc-q" value="${esc(f.q)}" placeholder="${esc(tp('searchTb'))}" autocomplete="off"></div>
        <div class="chips">
          <button class="chip${f.kv ? ' on' : ''}" data-act="gcFilter" data-k="kv">${ic('map')}${f.kv ? dmBi('KHUVUC', f.kv) : t('allAreas')}</button>
          <button class="chip${f.nhom ? ' on' : ''}" data-act="gcFilter" data-k="nhom">${ic('device')}${f.nhom ? dmBi('NHOMTB', f.nhom) : t('allGroups')}</button>
        </div>
      </div>
      <div class="list-bar"><span id="gc-count" class="muted"></span><span class="sp"></span>
        <button class="link" data-act="gcCsv">${t('exportCsv')}</button></div>
      ${isQL() ? `<a class="btn sm" href="#/gc-cai">${ic('gear')}${t('gcSetup')}</a>` : ''}
      <form id="f-gc" autocomplete="off" novalidate>
        <div id="gc-list"></div>
        <div class="form-actions" id="gc-actions"></div>
      </form>`,
    after: () => {
      drawGcList();
      $('#gc-q').addEventListener('input', debounce(e => { S.gcf.q = e.target.value; drawGcList(); }, 150));
      const form = $('#f-gc');
      form.addEventListener('input', e => gcInput(e.target));
      form.addEventListener('change', e => gcInput(e.target));
      form.addEventListener('submit', e => { e.preventDefault(); gcSaveAll(); });
    }
  };
};

function drawGcList() {
  const box = $('#gc-list');
  if (!box) return;
  const ngay = gcNgay();
  const list = gcFiltered();
  $('#gc-count').innerHTML = t('nDevices', list.length);
  if (!gcTracked().length) {
    box.innerHTML = `<div class="empty">${ic('gauge')}${t('gcNoneTracked')}${isQL() ? `<a class="btn primary" href="#/gc-cai">${ic('gear')}${t('gcSetup')}</a>` : ''}</div>`;
  } else if (!list.length) {
    box.innerHTML = `<div class="empty">${ic('search')}${t('noResult')}</div>`;
  } else {
    let html = '', kv = null;
    list.forEach(tb => {
      if (tb.ViTri !== kv) {
        if (kv !== null) html += '</div>';
        kv = tb.ViTri;
        html += `<h4 class="sec-h grp-h">${ic('map')}${dmBi('KHUVUC', kv)}<span class="count">${list.filter(x => x.ViTri === kv).length}</span></h4><div class="tb-list">`;
      }
      html += gcRowHtml(tb, ngay);
    });
    box.innerHTML = html + '</div>';
  }
  drawGcActions();
}

function gcRowHtml(tb, ngay) {
  const s = gcRowState(tb, ngay);
  const e = S.gcEdit[tb.ID];
  const dh = tb.KieuGioChay === 'DONGHO';
  const val = e ? e.v : (s.at ? String(gcValOf(s.at)).replace('.', ',') : '');
  const prevTxt = s.prev ? (dh ? t('gcPrevDH', fmtDM(s.prev.Ngay), fmtH(s.prev.ChiSo !== '' ? s.prev.ChiSo : s.prev.LuyKe))
    : t('gcPrevNG', fmtDM(s.prev.Ngay), fmtH(s.prev.SoGio))) : t('gcFirst');
  const locked = s.mode === 'done' || s.mode === 'locked';
  const cls = s.at && !e ? 'gc-ok' : (e ? 'gc-dirty' : '');
  return `<div class="gc-row ${cls}" data-fld="gc-${esc(tb.ID)}">
    <div class="gc-main">
      <div class="tb-top"><span class="tb-id">${esc(tb.ID)}</span>${s.at && !e ? ic('checkCircle', 'ok') : ''}</div>
      <div class="gc-name">${bi(tb.TenMay, tb.TenMayZH)}</div>
      <div class="small muted">${prevTxt}${s.days > 1 && !dh ? ` · ${tp('gcDaysN', s.days)}` : ''}</div>
      ${s.mode === 'locked' ? `<div class="small warn-t">${t('gcLocked', fmtDM(s.last.Ngay))}</div>` : ''}
      <span class="fe"></span>
    </div>
    <div class="gc-in">
      <label class="gc-lb">${t(dh ? 'gcChiSoShort' : 'gcSoGioShort')}</label>
      <div class="ck-num"><input data-gc="${esc(tb.ID)}" value="${esc(val)}" inputmode="decimal" maxlength="12" ${locked ? 'disabled' : ''}
        placeholder="${dh ? '' : '0–' + 24 * s.days}"><span class="ck-unit">h</span></div>
      <div class="gc-delta small" id="gcd-${esc(tb.ID)}">${gcDeltaHtml(tb, s, val)}</div>
      ${dh && s.prev ? `<label class="gc-reset" ${e && e.reset ? '' : (gcNeedReset(tb, s, val) ? '' : 'hidden')}><input type="checkbox" data-gcr="${esc(tb.ID)}" ${e && e.reset ? 'checked' : ''}>${t('gcReset')}</label>` : ''}
    </div>
  </div>`;
}
function gcNum(v) { const s = String(v || '').trim().replace(/\s/g, '').replace(',', '.'); return s !== '' && /^\d+(\.\d+)?$/.test(s) ? Number(s) : (s === '' ? null : NaN); }
function gcNeedReset(tb, s, val) {
  const n = gcNum(val);
  return tb.KieuGioChay === 'DONGHO' && s.prev && s.prev.Kieu === 'DONGHO' && s.prev.ChiSo !== '' && n !== null && !isNaN(n) && n < Number(s.prev.ChiSo);
}
function gcDeltaHtml(tb, s, val) {
  const n = gcNum(val);
  if (n === null) return '';
  if (isNaN(n)) return `<span class="bad-n">${t('eNumber')}</span>`;
  const e = S.gcEdit[tb.ID];
  if (tb.KieuGioChay === 'DONGHO') {
    if (!s.prev || s.prev.Kieu !== 'DONGHO' || s.prev.ChiSo === '') return '';
    if (e && e.reset) return `<span class="muted">${t('gcResetNote')}</span>`;
    const d = n - Number(s.prev.ChiSo);
    if (d < 0) return `<span class="bad-n">${t('gcLess')}</span>`;
    return `<span class="${d > 24 * s.days ? 'bad-n' : 'muted'}">+${esc(fmtH(d))} h</span>`;
  }
  return n > 24 * s.days ? `<span class="bad-n">${t('gcMax', 24 * s.days)}</span>` : '';
}
function gcInput(el) {
  const id = el.dataset.gc || el.dataset.gcr;
  if (!id) return;
  const tb = tbById(id);
  if (!tb) return;
  const s = gcRowState(tb, gcNgay());
  const e = S.gcEdit[id] || { v: s.at ? String(gcValOf(s.at)).replace('.', ',') : '', reset: false };
  if (el.dataset.gc) e.v = el.value; else e.reset = el.checked;
  const orig = s.at ? String(gcValOf(s.at)).replace('.', ',') : '';
  if (e.v.trim() === orig && !e.reset) delete S.gcEdit[id]; else S.gcEdit[id] = e;
  const row = el.closest('.gc-row');
  row.classList.toggle('gc-dirty', !!S.gcEdit[id]);
  row.classList.remove('has-err');
  $('.fe', row).innerHTML = '';
  $('#gcd-' + CSS.escape(id)).innerHTML = gcDeltaHtml(tb, s, e.v);
  const rs = $('.gc-reset', row);
  if (rs) rs.hidden = !(e.reset || gcNeedReset(tb, s, e.v));
  document.body.classList.toggle('no-ptr', Object.keys(S.gcEdit).length > 0);
  drawGcActions();
}
function drawGcActions() {
  const box = $('#gc-actions');
  if (!box) return;
  const n = Object.keys(S.gcEdit).length;
  // Không dựng lại nút khi đang có: ô nhập mất focus (change) ngay lúc chạm nút Lưu sẽ làm mất cú chạm
  const sb = $('button[type=submit]', box);
  if (n && sb) { if (sb.dataset.n !== String(n)) { sb.dataset.n = n; sb.innerHTML = `${ic('check')}${t('gcSaveN', n)}`; } return; }
  box.innerHTML = n ? `<button type="button" class="btn" data-act="gcUndo">${t('gcUndo')}</button>
    <button class="btn primary" type="submit" data-n="${n}">${ic('check')}${t('gcSaveN', n)}</button>` : '';
}

async function gcSaveAll() {
  if (!needOnline()) return;
  const form = $('#f-gc');
  const ngay = gcNgay();
  const ids = Object.keys(S.gcEdit);
  if (!ids.length) return;
  $$('.gc-row.has-err', form).forEach(el => { el.classList.remove('has-err'); $('.fe', el).innerHTML = ''; });
  const rows = [];
  let bad = false;
  const rowErr = (id, key, args) => {
    bad = true;
    const box = $(`[data-fld="gc-${CSS.escape(id)}"]`, form);
    if (box) { box.classList.add('has-err'); $('.fe', box).innerHTML = t(key, ...(args || [])); }
  };
  ids.forEach(id => {
    const tb = tbById(id), e = S.gcEdit[id];
    if (!tb) return;
    const s = gcRowState(tb, ngay);
    const n = gcNum(e.v);
    if (n === null) { rowErr(id, 'eRequired'); return; }
    if (isNaN(n)) { rowErr(id, 'eNumber'); return; }
    if (tb.KieuGioChay === 'DONGHO') {
      if (gcNeedReset(tb, s, e.v) && !e.reset) { rowErr(id, 'gcLessErr', [fmtH(s.prev.ChiSo)]); return; }
      if (s.prev && s.prev.Kieu === 'DONGHO' && s.prev.ChiSo !== '' && !e.reset && n - Number(s.prev.ChiSo) > 24 * s.days + 0.05) { rowErr(id, 'gcMax', [24 * s.days]); return; }
      rows.push({ IDThietBi: id, Ngay: ngay, ChiSo: String(n), ThayDongHo: e.reset ? '1' : '' });
    } else {
      if (n > 24 * s.days + 0.05) { rowErr(id, 'gcMax', [24 * s.days]); return; }
      rows.push({ IDThietBi: id, Ngay: ngay, SoGio: String(n) });
    }
  });
  if (bad) { toast('eInvalid', 'err'); const f = $('.gc-row.has-err', form); if (f) f.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
  busy(form, true);
  try {
    const r = await api('gcSave', { rows });
    mergeGC(r.rows);
    S.gcEdit = {};
    document.body.classList.remove('no-ptr');
    toast(tr('gcSaved', [r.rows.length]), 'ok');
    render(true);
  } catch (e) {
    if (e.code === 'INVALID' && e.extra && e.extra.errors) {
      e.extra.errors.forEach(x => rowErr(x.id, gcReasonKey(x.reason), x.reason === 'LESS_THAN_PREV' ? [fmtH(x.prev)] : (x.reason === 'TOO_MANY_HOURS' ? [x.max] : (x.reason === 'NOT_LATEST' ? [fmtDM(x.last)] : []))));
      toast('eInvalid', 'err');
    } else if (e.code !== 'AUTH') toast(errText(e), 'err');
  } finally { if (form.isConnected) busy(form, false); }
}
function gcReasonKey(r) {
  return ({ LESS_THAN_PREV: 'gcLessErr', TOO_MANY_HOURS: 'gcMax', NOT_LATEST: 'gcLocked', NOT_TRACKED: 'gcNotTracked', FORBIDDEN: 'gcEditWindow' })[r] || reasonKey(r);
}

function gcCsvRows(list) {
  const head = csvHead([['', 'Ngày', '日期'], ['', 'ID', ''], ['', 'Tên máy', '设备名称'], ['', 'Khu vực', '区域'], ['', 'Kiểu ghi', '记录方式'],
    ['', 'Chỉ số đồng hồ (h)', '计时表读数(h)'], ['', 'Giờ chạy (h)', '运行小时(h)'], ['', 'Lũy kế (h)', '累计(h)'], ['', 'Thay đồng hồ', '更换计时表'],
    ['', 'Ghi chú', '备注'], ['', 'Người ghi', '记录人'], ['', 'Ghi lúc', '记录时间']]);
  return [head].concat(list.slice().sort((a, b) => String(a.Ngay).localeCompare(String(b.Ngay)) ||
    String(a.IDThietBi).localeCompare(String(b.IDThietBi), 'en', { numeric: true })).map(x => {
    const tb = tbById(x.IDThietBi);
    return [x.Ngay, x.IDThietBi, tb ? tb.TenMay : '', tb ? dmVi('KHUVUC', tb.ViTri) : '', gcKieuTr(x.Kieu).vi, x.ChiSo, x.SoGio, x.LuyKe,
      isOn(x.ThayDongHo) ? 'Có' : '', x.GhiChu, x.NguoiTao, x.NgayTao];
  }));
}

/** Ghi nhanh giờ chạy một máy (từ trang máy) */
function gcOneSheet(id) {
  const tb = tbById(id);
  if (!tb || !needOnline()) return;
  const today = dToday();
  const s = gcRowState(tb, today);
  if (s.mode === 'done' || s.mode === 'locked') { toast(s.mode === 'done' ? 'gcEditWindow' : tr('gcLocked', [fmtDM(s.last.Ngay)]), 'warn'); return; }
  const dh = tb.KieuGioChay === 'DONGHO';
  const cur = s.at ? String(gcValOf(s.at)).replace('.', ',') : '';
  const sh = openSheet(`
    <form class="form" id="f-gc1" autocomplete="off" novalidate>
      <div class="pk-head"><h3 class="h3">${t('gcRecord')}</h3><button type="button" class="hbtn" data-act="closeSheet">${ic('x')}</button></div>
      <div class="muted small"><span class="tb-id">${esc(tb.ID)}</span> ${esc(tb.TenMay)} · ${esc(fmtDate(today))}</div>
      <div class="small muted">${s.prev ? (dh ? t('gcPrevDH', fmtDM(s.prev.Ngay), fmtH(s.prev.ChiSo || s.prev.LuyKe)) : t('gcPrevNG', fmtDM(s.prev.Ngay), fmtH(s.prev.SoGio))) : t('gcFirst')}</div>
      <label class="fld" data-fld="v"><span class="lb">${t(dh ? 'gcChiSo' : 'gcSoGio')} <b class="req">*</b></span>
        <div class="ck-num"><input name="v" value="${esc(cur)}" inputmode="decimal" maxlength="12"><span class="ck-unit">h</span></div><span class="fe"></span></label>
      ${dh && s.prev ? `<label class="switch"><input type="checkbox" name="reset" ${s.at && isOn(s.at.ThayDongHo) ? 'checked' : ''}><span class="sw"></span>${t('gcReset')}</label>` : ''}
      <p class="muted small">${t(dh ? 'gcHintDH' : 'gcHintNG')}</p>
      <div class="msg" id="gc1-msg"></div>
      <button class="btn primary block" type="submit">${ic('check')}${t('save')}</button>
    </form>`);
  const form = $('#f-gc1', sh);
  form.addEventListener('input', clearFieldErr);
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    if (!needOnline()) return;
    const n = gcNum(form.v.value);
    if (n === null || isNaN(n)) { scFieldErr(form, 'v', n === null ? 'eRequired' : 'eNumber'); return; }
    const row = dh ? { IDThietBi: tb.ID, Ngay: today, ChiSo: String(n), ThayDongHo: form.reset && form.reset.checked ? '1' : '' }
      : { IDThietBi: tb.ID, Ngay: today, SoGio: String(n) };
    busy(form, true);
    try {
      const r = await api('gcSave', { rows: [row] });
      mergeGC(r.rows);
      closeSheet();
      toast(tr('gcSaved', [1]), 'ok');
      render(true);
    } catch (e) {
      if (e.code === 'INVALID' && e.extra && e.extra.errors) {
        const x = e.extra.errors[0];
        scFieldErr(form, 'v', gcReasonKey(x.reason), x.reason === 'LESS_THAN_PREV' ? [fmtH(x.prev)] : (x.reason === 'TOO_MANY_HOURS' ? [x.max] : (x.reason === 'NOT_LATEST' ? [fmtDM(x.last)] : [])));
      } else if (e.code !== 'AUTH') $('#gc1-msg').innerHTML = errHtml(e);
    } finally { if (form.isConnected) busy(form, false); }
  });
}

async function gcDelete(id, ngay) {
  if (!needOnline()) return;
  if (!(await confirmDlg(tr('gcDeleteQ', [id, fmtDate(ngay)]), 'gcDeleteMsg', { ok: 'delete', danger: true }))) return;
  try {
    await api('gcDelete', { id, ngay });
    if (S.data) { S.data.gioChay = allGC().filter(x => !(x.IDThietBi === id && x.Ngay === ngay)); saveCache(); }
    toast('gcDeleted', 'ok');
    render(true);
  } catch (e) { if (e.code !== 'AUTH') toast(e.code === 'NOT_LATEST' ? tr('gcOnlyLatest') : errText(e), 'err'); }
}

/** Chọn kiểu ghi giờ chạy cho một máy (quản lý) */
async function gcKieuOne(id) {
  const tb = tbById(id);
  if (!tb || !isQL() || !needOnline()) return;
  const items = ['', 'DONGHO', 'NGAY'].map(k => { const x = gcKieuTr(k); return { v: k || '-', vi: x.vi, zh: x.zh, sub: tp('gcK' + (k || 'NONE') + 'Hint') }; });
  const v = await picker({ title: 'gcSetKieu', items, value: tb.KieuGioChay || '-' });
  if (v === undefined) return;
  const k = v === '-' ? '' : v;
  if (k === (tb.KieuGioChay || '')) return;
  try {
    const r = await api('saveKieuGioChay', { items: [{ ID: tb.ID, KieuGioChay: k }] });
    r.thietBi.forEach(upsertTb);
    toast('saved', 'ok');
    render(true);
  } catch (e) { if (e.code !== 'AUTH') toast(errText(e), 'err'); }
}

/* ---- Chọn máy ghi giờ chạy (quản lý, nhiều máy một lần) ---- */
VIEWS['gc-cai'] = () => {
  if (!isQL()) return forbiddenView('gc');
  if (!S.data) return loadingView();
  const st = S.gcSet || (S.gcSet = { q: '', kv: '', nhom: '', ch: {} });
  return {
    title: 'gcSetup', back: 'gc', tab: 'cv', noPtr: true,
    html: `
      <div class="notice">${ic('info')}<div>${t('gcSetupIntro')}</div></div>
      <div class="toolbar sticky">
        <div class="search">${ic('search')}<input type="search" id="gs-q" value="${esc(st.q)}" placeholder="${esc(tp('searchTb'))}" autocomplete="off"></div>
        <div class="chips">
          <button class="chip${st.kv ? ' on' : ''}" data-act="gsFilter" data-k="kv">${ic('map')}${st.kv ? dmBi('KHUVUC', st.kv) : t('allAreas')}</button>
          <button class="chip${st.nhom ? ' on' : ''}" data-act="gsFilter" data-k="nhom">${ic('device')}${st.nhom ? dmBi('NHOMTB', st.nhom) : t('allGroups')}</button>
        </div>
      </div>
      <div class="card pad slim gs-bulk"><span class="small">${t('gcSetAllShown')}</span>
        <div class="row gap wrap">${['', 'DONGHO', 'NGAY'].map(k => `<button class="btn sm" data-act="gsAll" data-k="${k}">${biTr(gcKieuTr(k))}</button>`).join('')}</div></div>
      <div id="gs-list" class="tb-list"></div>
      <div class="form-actions" id="gs-actions"></div>`,
    after: () => {
      drawGsList();
      $('#gs-q').addEventListener('input', debounce(e => { st.q = e.target.value; drawGsList(); }, 150));
      $('#gs-list').addEventListener('change', e => {
        const el = e.target.closest('input[data-gs]');
        if (!el) return;
        const tb = tbById(el.dataset.gs);
        if (el.value === (tb.KieuGioChay || '')) delete st.ch[tb.ID]; else st.ch[tb.ID] = el.value;
        el.closest('.gs-row').classList.toggle('gc-dirty', tb.ID in st.ch);
        drawGsActions();
      });
    }
  };
};
function gsShown() {
  const st = S.gcSet, n = norm(st.q);
  return allTb().filter(tb => tb.TrangThai !== 'THANHLY' && (!st.kv || tb.ViTri === st.kv) && (!st.nhom || tb.NhomTB === st.nhom) &&
    (!n || norm([tb.ID, tb.MaNhaMay, tb.TenMay, tb.TenMayZH, dmVi('NHOMTB', tb.NhomTB)].join(' ')).includes(n))).sort(ktSortTb);
}
function drawGsList() {
  const box = $('#gs-list');
  if (!box) return;
  const st = S.gcSet;
  const list = gsShown();
  box.innerHTML = list.length ? list.map(tb => {
    const v = tb.ID in st.ch ? st.ch[tb.ID] : (tb.KieuGioChay || '');
    return `<div class="gs-row${tb.ID in st.ch ? ' gc-dirty' : ''}">
      <div class="tb-top"><span class="tb-id">${esc(tb.ID)}</span><span class="grow small">${esc(tb.TenMay)}</span></div>
      <div class="seg gs-seg">${['', 'DONGHO', 'NGAY'].map(k => `<label><input type="radio" name="gs-${esc(tb.ID)}" value="${k}" data-gs="${esc(tb.ID)}" ${v === k ? 'checked' : ''}><span>${biTr(tr(k ? 'gcK' + k + 'Short' : 'gcKNONEShort'))}</span></label>`).join('')}</div>
    </div>`;
  }).join('') : `<div class="empty">${t('noResult')}</div>`;
  drawGsActions();
}
function drawGsActions() {
  const box = $('#gs-actions');
  if (!box) return;
  const n = Object.keys(S.gcSet.ch).length;
  const sb = $('[data-act=gsSave]', box);
  if (n && sb) { if (sb.dataset.n !== String(n)) { sb.dataset.n = n; sb.innerHTML = `${ic('check')}${t('gcSaveKieuN', n)}`; } return; }
  box.innerHTML = n ? `<button type="button" class="btn" data-act="gsUndo">${t('gcUndo')}</button>
    <button type="button" class="btn primary" data-act="gsSave" data-n="${n}">${ic('check')}${t('gcSaveKieuN', n)}</button>` : '';
}
async function gsSave(btn) {
  if (!needOnline()) return;
  const st = S.gcSet;
  const items = Object.keys(st.ch).map(ID => ({ ID, KieuGioChay: st.ch[ID] }));
  if (!items.length) return;
  btn.disabled = true; btn.classList.add('loading');
  try {
    const r = await api('saveKieuGioChay', { items });
    r.thietBi.forEach(upsertTb);
    st.ch = {};
    toast(tr('gcKieuSaved', [r.thietBi.length]), 'ok');
    drawGsList();
  } catch (e) {
    if (e.code !== 'AUTH') toast(errText(e), 'err');
  } finally { if (btn.isConnected) { btn.disabled = false; btn.classList.remove('loading'); } }
}

/* ===================== PHIÊN 5: HỢP ĐỒNG · BẢO TRÌ DỰ ĐOÁN · RCA ===================== */

/* ---- Dùng chung ---- */
function cfgInt(k, d) { const v = String((S.data && S.data.cauHinh && S.data.cauHinh[k]) || '').trim(); return /^\d+$/.test(v) ? Number(v) : d; }
/** Danh sách máy cho hộp chọn (bỏ máy thanh lý) */
function tbPickItems(filter) {
  return allTb().filter(x => x.TrangThai !== 'THANHLY' && (!filter || filter(x)))
    .sort((a, b) => String(a.ID).localeCompare(String(b.ID), 'en', { numeric: true }))
    .map(x => ({ v: x.ID, vi: `${x.ID} · ${x.TenMay}`, zh: x.TenMayZH || dmZh('NHOMTB', x.NhomTB),
      sub: [x.MaNhaMay, dmVi('KHUVUC', x.ViTri)].filter(Boolean).join(' · ') }));
}
/** Hộp chọn khu vực / nhóm máy dùng chung cho bộ lọc danh sách → Promise<value | undefined> */
function pickKvNhom(k, cur) {
  const loai = k === 'kv' ? 'KHUVUC' : 'NHOMTB', all = tr(k === 'kv' ? 'allAreas' : 'allGroups');
  return picker({ title: k === 'kv' ? 'fViTri' : 'fNhomTB', value: cur,
    items: [{ v: '', vi: all.vi, zh: all.zh }].concat(dmList(loai, true).map(d => ({ v: d.Ma, vi: d.TenVI, zh: d.TenZH }))) });
}
function tbMatchF(tb, f, extra) {
  if (f.kv && (!tb || tb.ViTri !== f.kv)) return false;
  if (f.nhom && (!tb || tb.NhomTB !== f.nhom)) return false;
  const n = norm(f.q);
  return !n || norm([tb && tb.ID, tb && tb.TenMay, tb && tb.TenMayZH, tb && tb.MaNhaMay].concat(extra || []).join(' ')).includes(n);
}
function stamp() { const d = new Date(); return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`; }
/** Liên kết trong kết quả API lỗi INVALID → hiển thị dưới ô, trả số ô đã hiện */
function showErrs(form, errors, nameOf) {
  let shown = 0;
  errors.forEach(x => {
    const key = x.reason === 'TIME_ORDER' ? 'eTimeAfter' : reasonKey(x.reason);
    const args = x.reason === 'TIME_ORDER' && x.after ? [nameOf(x.after)] : [];
    if (scFieldErr(form, x.field + (x.line ? ':' + x.line : ''), key, args) || scFieldErr(form, x.field, key, args)) shown++;
    else toast(tr('eFieldX', [nameOf(x.field, x), tr(key, args)]), 'err');
  });
  if (shown) toast('eInvalid', 'err');
  const first = $('.has-err', form);
  if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

/* ---------------------- Hợp đồng bảo trì thuê ngoài ---------------------- */
/* HD0001…: nhà thầu + phạm vi + máy áp dụng + thời hạn. Trạng thái tính theo ngày (giống backend hdStatus_):
 * còn hạn · sắp hết hạn (còn ≤ NhacTruoc ngày) · hết hạn · chưa hiệu lực · đã ký tiếp · không ký tiếp. */
const HD_ORDER = ['HETHAN', 'SAPHET', 'CHUAHL', 'CONHAN', 'DAKYTIEP', 'KETTHUC'];
const HD_DUE = ['HETHAN', 'SAPHET'];
const HD_TABS = [{ id: 'CAN', key: 'hdTabDue' }, { id: 'HL', key: 'hdTabActive' }, { id: 'ALL', key: 'scTabAll' }];

function allHD() { return (S.data && S.data.hopDong) || []; }
function hdByMa(ma) { const k = String(ma || '').toUpperCase(); return allHD().find(x => String(x.MaHD).toUpperCase() === k) || null; }
function hdNhacDef() { return String(cfgInt('HD_NhacTruoc', 60)); }
function hdIds(h) { return String((h && h.DSThietBi) || '').split(/[,;\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean); }
function hdStatus(h, today) {
  today = today || dToday();
  const left = h.NgayKetThuc ? dDiff(today, h.NgayKetThuc) : null;
  if (h.TrangThai === 'KETTHUC') return { st: 'KETTHUC', left };
  if (h.TrangThai === 'DAKYTIEP') return { st: 'DAKYTIEP', left };
  if (h.NgayBatDau && today < h.NgayBatDau) return { st: 'CHUAHL', left };
  if (left === null) return { st: 'CONHAN', left };
  if (left < 0) return { st: 'HETHAN', left };
  const n = /^\d+$/.test(String(h.NhacTruoc || '')) ? Number(h.NhacTruoc) : 60;
  return { st: left <= n ? 'SAPHET' : 'CONHAN', left };
}
function hdSort(a, b) {
  const x = hdStatus(a), y = hdStatus(b);
  return HD_ORDER.indexOf(x.st) - HD_ORDER.indexOf(y.st) || String(a.NgayKetThuc).localeCompare(String(b.NgayKetThuc)) || String(a.MaHD).localeCompare(String(b.MaHD));
}
function hdDue() { return allHD().filter(h => HD_DUE.includes(hdStatus(h).st)).sort(hdSort); }
function hdOfTb(id) { const k = String(id).toUpperCase(); return allHD().filter(h => hdIds(h).includes(k)).sort(hdSort); }
function hdPill(st) { return `<span class="pill hd-${esc(st)}">${t('hd' + st)}</span>`; }
/** "Còn 45 ngày" · "Quá hạn 3 ngày" · "Hiệu lực từ 01/11/2026" */
function hdLeftTr(h, s) {
  if (s.st === 'CHUAHL') return tr('hdFrom', [fmtDate(h.NgayBatDau)]);
  if (s.st === 'KETTHUC') return tr('hdKETTHUC');
  if (s.left === null) return { vi: '', zh: '' };
  if (s.left < 0) return tr('hdLate', [-s.left]);
  if (s.left === 0) return tr('hdEndsToday');
  return tr('hdLeftN', [s.left]);
}
function hdLeftHtml(h, s) {
  const x = hdLeftTr(h, s);
  if (!x.vi) return '';
  return `<span class="due hd-${esc(s.st)}">${ic('clock')}${bi(x.vi, x.zh)}</span>`;
}
/** Thời hạn: "12 tháng" nếu tròn tháng, không thì số ngày */
function hdDurTr(h) {
  if (!h.NgayBatDau || !h.NgayKetThuc) return { vi: '', zh: '' };
  const end1 = dAdd(h.NgayKetThuc, 1, 'NGAY');
  for (let m = 1; m <= 120; m++) if (dAdd(h.NgayBatDau, m, 'THANG') === end1) return tr('nMonths', [m]);
  return tr('nDays', [dDiff(h.NgayBatDau, end1)]);
}
function hdNhaThauMatch(a, b) {
  const x = norm(a), y = norm(b);
  return !!x && !!y && (x.includes(y) || y.includes(x));
}
/** Kế hoạch bảo trì do nhà thầu của hợp đồng làm (trên các máy trong hợp đồng; không khai máy → mọi máy) */
function hdPlans(h) {
  const ids = hdIds(h);
  return allKH().filter(k => hdNhaThauMatch(k.NhaThau, h.NhaThau) && (!ids.length || ids.includes(String(k.IDThietBi).toUpperCase())));
}
/** Phiếu bảo trì / sửa chữa nhà thầu đã làm trong thời hạn hợp đồng (trong dữ liệu đã tải) */
function hdWork(h) {
  const ids = hdIds(h);
  const inIds = id => !ids.length || ids.includes(String(id).toUpperCase());
  const inTerm = ts => { const d = String(ts || '').slice(0, 10); return d && d >= h.NgayBatDau && d <= h.NgayKetThuc; };
  const bt = allBT().filter(x => hdNhaThauMatch(x.NhaThau, h.NhaThau) && inIds(x.IDThietBi) && inTerm(x.TGKetThuc)).sort(btSortDesc);
  const sc = allSC().filter(x => x.TrangThaiPhieu !== 'HUY' && hdNhaThauMatch(x.NhaThau, h.NhaThau) && inIds(x.IDThietBi) && inTerm(x.TGHoanThanh || x.TGBao)).sort(scSortDesc);
  return { bt, sc };
}
function hdNames() { return uniqueRecent('NhaThau', allHD().map(h => h.NhaThau).concat(allKH().map(k => k.NhaThau), allBT().map(b => b.NhaThau))); }

/* ---- Trang chủ ---- */
function homeHdCard() {
  const due = hdDue();
  const nLate = due.filter(h => hdStatus(h).st === 'HETHAN').length;
  return `<section class="card">
    <div class="card-h">${ic('file', nLate ? 'bad' : (due.length ? 'warn' : 'ok'))}${t('contractsDue')}<span class="count">${due.length}</span></div>
    ${due.length ? `<div class="mini-list">${due.slice(0, 5).map(hdMini).join('')}</div>`
      : `<div class="empty ok small">${ic('check')}${allHD().length ? t('hdNoDue') : t('hdNone')}</div>`}
    <div class="card-f">
      ${isQL() ? `<a class="btn sm" href="#/hd-moi">${ic('plus')}${t('hdAdd')}</a>` : ''}
      <span class="sp"></span>
      <a class="link" href="#/hd" data-act="hdTabGo" data-t="${due.length ? 'CAN' : 'HL'}">${t('hdViewAll')}</a>
    </div>
  </section>`;
}
function hdMini(h) {
  const s = hdStatus(h);
  return `<a class="mini hd-${esc(s.st)}" href="#/hd/${encodeURIComponent(h.MaHD)}">
    <div class="mini-main">
      <div class="mini-top"><span class="sc-no">${esc(h.MaHD)}</span><span class="muted small ell">${esc(h.NhaThau)}</span></div>
      <div class="kh-name">${bi(h.TenVI, h.TenZH)}</div>
      <div class="sc-meta">${hdLeftHtml(h, s)}<span class="muted small">${esc(fmtDate(h.NgayKetThuc))}</span></div>
    </div>
    ${hdPill(s.st)}
  </a>`;
}

/* ---- Danh sách ---- */
function hdFiltered() {
  const f = S.hdf;
  const today = dToday();
  const n = norm(f.q);
  return allHD().filter(h => {
    const s = hdStatus(h, today);
    if (f.tab === 'CAN' && !HD_DUE.includes(s.st)) return false;
    if (f.tab === 'HL' && !(['CONHAN', 'SAPHET', 'CHUAHL'].includes(s.st) || (s.st === 'DAKYTIEP' && s.left !== null && s.left >= 0))) return false;
    if (n) {
      const names = hdIds(h).map(id => { const tb = tbById(id); return tb ? tb.TenMay : ''; });
      if (!norm([h.MaHD, h.SoHopDong, h.TenVI, h.TenZH, h.NhaThau, h.LienHe, h.PhamVi, h.DSThietBi].concat(names).join(' ')).includes(n)) return false;
    }
    return true;
  }).sort(hdSort);
}
function viewHdList() {
  if (!S.data) return loadingView();
  const f = S.hdf;
  const nDue = hdDue().length;
  return {
    live: true, restoreScroll: true, title: 'hdList', back: 'them', tab: 'them',
    html: `
      <div class="toolbar sticky">
        <div class="seg sc-tabs">${HD_TABS.map(x => {
          const lb = tr(x.key);
          const n = x.id === 'CAN' ? nDue : 0;
          return `<a data-act="hdTab" data-t="${x.id}" class="${x.id === f.tab ? 'on' : ''}">${bi(lb.vi, lb.zh)}${n ? `<span class="tcount hd-SAPHET">${n}</span>` : ''}</a>`;
        }).join('')}</div>
        <div class="search">${ic('search')}<input type="search" id="hd-q" value="${esc(f.q)}" placeholder="${esc(tp('hdSearch'))}" autocomplete="off"></div>
      </div>
      <div class="list-bar"><span id="hd-count" class="muted"></span><span class="sp"></span>
        <button class="link" data-act="hdCsv">${t('exportCsv')}</button></div>
      <div id="hd-list" class="tb-list"></div>
      ${isQL() ? `<a class="fab" href="#/hd-moi" aria-label="${esc(tp('hdAdd'))}">${ic('plus')}</a>` : ''}`,
    after: () => {
      drawHdList();
      $('#hd-q').addEventListener('input', debounce(e => { S.hdf.q = e.target.value; drawHdList(); }, 150));
    }
  };
}
function drawHdList() {
  const box = $('#hd-list');
  if (!box) return;
  const list = hdFiltered();
  $('#hd-count').innerHTML = t('hdN', list.length);
  box.classList.toggle('bare', !list.length);
  box.innerHTML = list.length ? list.map(hdItem).join('')
    : `<div class="empty${S.hdf.tab === 'CAN' && allHD().length ? ' ok' : ''}">${ic(S.hdf.tab === 'CAN' && allHD().length ? 'checkCircle' : 'file')}${
      allHD().length ? (S.hdf.q ? t('noResult') : t(S.hdf.tab === 'CAN' ? 'hdNoDue' : 'noResult')) : t('hdNone')}${
      isQL() && !allHD().length ? `<a class="btn primary" href="#/hd-moi">${ic('plus')}${t('hdAdd')}</a>` : ''}</div>`;
}
function hdItem(h) {
  const s = hdStatus(h);
  const ids = hdIds(h);
  return `<a class="sc-item hd-${esc(s.st)}" href="#/hd/${encodeURIComponent(h.MaHD)}">
    <div class="tb-top"><span class="sc-no">${esc(h.MaHD)}</span>${h.SoHopDong ? `<span class="tb-ma">${esc(h.SoHopDong)}</span>` : ''}<span class="sp"></span>${hdPill(s.st)}</div>
    <div class="kh-name">${bi(h.TenVI, h.TenZH)}</div>
    <div class="hd-nt">${ic('user')}<span>${esc(h.NhaThau)}</span></div>
    <div class="sc-meta">${hdLeftHtml(h, s)}<span class="muted small">${esc(fmtDate(h.NgayBatDau))} → ${esc(fmtDate(h.NgayKetThuc))}</span>
      <span class="sp"></span>${ids.length ? `<span class="muted small">${t('nDevices', ids.length)}</span>` : ''}</div>
  </a>`;
}
const HD_CSV = [
  ['MaHD', 'Mã', '编号'], ['SoHopDong', 'Số hợp đồng', '合同编号'], ['TenVI', 'Hợp đồng', '合同名称'], ['TenZH', 'Tên (Trung)', '名称(中文)'],
  ['NhaThau', 'Nhà thầu', '外协单位'], ['LienHe', 'Liên hệ', '联系人'], ['PhamVi', 'Phạm vi', '维保范围'], ['TanSuat', 'Tần suất', '维保频次'],
  ['DSThietBi', 'Máy áp dụng (ID)', '适用设备(ID)'], ['_TenMay', 'Tên máy', '设备名称'], ['NgayBatDau', 'Bắt đầu', '开始日期'],
  ['NgayKetThuc', 'Kết thúc', '结束日期'], ['_Con', 'Còn (ngày)', '剩余(天)'], ['_TrangThai', 'Trạng thái', '状态'], ['NhacTruoc', 'Nhắc trước (ngày)', '提前提醒(天)'],
  ['LinkTaiLieu', 'Tài liệu', '资料链接'], ['HopDongTruoc', 'Ký tiếp từ', '续签自'], ['HopDongSau', 'Ký tiếp sang', '续签为'],
  ['LyDoKetThuc', 'Lý do không ký tiếp', '不续签原因'], ['GhiChu', 'Ghi chú', '备注']
];
function exportHdCsv() {
  const rows = [csvHead(HD_CSV)].concat(hdFiltered().map(h => {
    const s = hdStatus(h);
    return HD_CSV.map(([f]) => {
      if (f === '_TenMay') return hdIds(h).map(id => { const tb = tbById(id); return tb ? tb.TenMay : id; }).join('; ');
      if (f === '_Con') return s.left === null ? '' : s.left;
      if (f === '_TrangThai') return tr('hd' + s.st).vi;
      return h[f] || '';
    });
  }));
  downloadCsv(`hop-dong-bao-tri_${stamp()}.csv`, rows);
}

/* ---- Chi tiết ---- */
VIEWS.hd = p => {
  if (p[1] && p[2] === 'sua') return viewHdForm('edit', p[1]);
  if (p[1]) return viewHdDetail(p[1]);
  return viewHdList();
};
VIEWS['hd-moi'] = p => viewHdForm(p[1] ? 'renew' : 'new', p[1] || null);

function viewHdDetail(ma) {
  if (!S.data) return loadingView();
  const h = hdByMa(ma);
  if (!h) return { title: 'hdDetail', back: 'hd', tab: 'them', html: `<div class="empty">${ic('search')}${t('hdNotFound', ma)}</div>` };
  const s = hdStatus(h);
  const ql = isQL();
  const enc = encodeURIComponent(h.MaHD);
  const ids = hdIds(h);
  const plans = hdPlans(h);
  const work = hdWork(h);
  const ST = plans.length ? khStatuses() : null;
  const prev = h.HopDongTruoc ? hdByMa(h.HopDongTruoc) : null;
  const next = h.HopDongSau ? hdByMa(h.HopDongSau) : null;
  const x = hdLeftTr(h, s);
  const kv = (key, val, raw) => (val === '' || val === null || val === undefined) ? '' :
    `<div class="kv"><div class="k">${t(key)}</div><div class="v">${raw ? val : esc(val)}</div></div>`;
  const kvCol = (key, val) => val ? `<div class="kv col"><div class="k">${t(key)}</div><div class="v pre">${esc(val)}</div></div>` : '';
  const link = h.LinkTaiLieu && /^https?:\/\//i.test(h.LinkTaiLieu) ? h.LinkTaiLieu : '';
  const dur = hdDurTr(h);
  return {
    live: true, title: 'hdDetail', back: 'hd', tab: 'them',
    html: `
      <section class="card hero hd-${esc(s.st)}">
        <div class="hero-main">
          <div class="hero-ids"><span class="sc-no big">${esc(h.MaHD)}</span>${hdPill(s.st)}</div>
          ${bi(h.TenVI, h.TenZH, 'hero-name')}
          <div class="hd-nt big">${ic('user')}<span>${esc(h.NhaThau)}</span></div>
          ${x.vi ? `<div class="due-big hd-${esc(s.st)}">${ic('clock')}${bi(x.vi, x.zh)}</div>` : ''}
          <div class="muted small">${esc(fmtDate(h.NgayBatDau))} → ${esc(fmtDate(h.NgayKetThuc))}${dur.vi ? ` · ${esc(dur.vi)}` : ''}</div>
        </div>
      </section>
      ${next ? `<a class="notice src-link" href="#/hd/${encodeURIComponent(next.MaHD)}">${ic('repeat')}<div>${t('hdRenewedTo', next.MaHD, fmtDate(next.NgayBatDau), fmtDate(next.NgayKetThuc))}</div>${ic('chev')}</a>` : ''}
      ${h.TrangThai === 'DAKYTIEP' && !next ? `<div class="notice">${ic('repeat')}<div>${t('hdDAKYTIEP')}</div></div>` : ''}
      ${prev ? `<a class="notice src-link" href="#/hd/${encodeURIComponent(prev.MaHD)}">${ic('undo')}<div>${t('hdRenewedFrom', prev.MaHD)}</div>${ic('chev')}</a>` : ''}
      ${h.TrangThai === 'KETTHUC' ? `<div class="notice warn">${ic('ban')}<div>${t('hdEndedNote', h.LyDoKetThuc || '')}</div></div>` : ''}
      ${HD_DUE.includes(s.st) ? `<div class="notice warn">${ic('alert')}<div>${t(s.st === 'HETHAN' ? 'hdLateNote' : 'hdSoonNote')}</div></div>` : ''}
      ${ql ? `<div class="actions-row">
        <a class="btn sm" href="#/hd/${enc}/sua">${ic('edit')}${t('edit')}</a>
        ${h.TrangThai !== 'DAKYTIEP' ? `<a class="btn sm${HD_DUE.includes(s.st) ? ' primary' : ''}" href="#/hd-moi/${enc}">${ic('repeat')}${t('hdRenew')}</a>` : ''}
        ${!h.TrangThai ? `<button class="btn sm" data-act="hdEnd" data-ma="${esc(h.MaHD)}">${ic('ban')}${t('hdEnd')}</button>` : ''}
        ${h.TrangThai === 'KETTHUC' ? `<button class="btn sm" data-act="hdRestore" data-ma="${esc(h.MaHD)}">${ic('undo')}${t('hdRestore')}</button>` : ''}
      </div>` : ''}
      <section class="card">
        <div class="card-h">${ic('info')}${t('info')}</div>
        ${kv('hdSoHD', h.SoHopDong)}
        ${kv('hdNhaThau', h.NhaThau)}
        ${kv('hdLienHe', h.LienHe)}
        ${kv('hdTanSuat', h.TanSuat)}
        ${kv('hdTerm', `${esc(fmtDate(h.NgayBatDau))} → ${esc(fmtDate(h.NgayKetThuc))}${dur.vi ? `<div class="small muted">${biTr(dur)}</div>` : ''}`, true)}
        ${kv('hdNhacTruoc', t('nDaysBefore', h.NhacTruoc || '60'), true)}
        ${kvCol('hdPhamVi', h.PhamVi)}
        ${kv('fLinkTaiLieu', link ? `<a href="${esc(link)}" target="_blank" rel="noopener" class="link">${t('openDocs')}</a>` : '', true)}
        ${kvCol('fGhiChu', h.GhiChu)}
      </section>
      <section class="card">
        <div class="card-h">${ic('device')}${t('hdDevices')}<span class="count">${ids.length}</span></div>
        ${ids.length ? `<div class="mini-list">${ids.map(id => { const tb = tbById(id); return tb ? miniItem(tb) : `<div class="mini"><span class="tb-id">${esc(id)}</span></div>`; }).join('')}</div>`
          : `<div class="empty small">${t('hdNoDevices')}</div>`}
      </section>
      <section class="card">
        <div class="card-h">${ic('calendar')}${t('hdPlans')}<span class="count">${plans.length}</span></div>
        ${plans.length ? `<div class="mini-list">${plans.sort(khSortBy(ST)).map(k => khMini(k, ST.get(k.MaKH), true)).join('')}</div>`
          : `<div class="empty small">${t('hdNoPlans')}</div>`}
      </section>
      <section class="card">
        <div class="card-h">${ic('checklist')}${t('hdWork')}<span class="count">${work.bt.length + work.sc.length}</span></div>
        <div class="sc-sum">${t('hdWorkSum', work.bt.length, work.sc.length)}</div>
        ${work.bt.length || work.sc.length ? `<div class="mini-list">${work.bt.slice(0, 20).map(b => btMini(b, true)).join('')}${work.sc.slice(0, 20).map(x => scMini(x, true)).join('')}</div>` : ''}
        <p class="muted small pad-x">${t('hdWorkHint')}</p>
      </section>
      <p class="muted small audit">${t('createdBy', fmtTime(h.NgayTao), h.NguoiTao || '—')}<br>${t('updatedBy', fmtTime(h.NgaySua), h.NguoiSua || '—')}</p>
      ${ql ? `<button class="btn block danger-outline" data-act="hdDelete" data-ma="${esc(h.MaHD)}">${ic('trash')}${t('hdDelete')}</button>` : ''}`
  };
}

/* ---- Biểu mẫu: thêm (new) · ký tiếp (renew) · sửa (edit) ---- */
function viewHdForm(mode, ma) {
  if (!isQL()) return forbiddenView('hd');
  if (!S.data) return loadingView();
  const cur = ma ? hdByMa(ma) : null;
  if (ma && !cur) return { title: 'hdDetail', back: 'hd', tab: 'them', html: `<div class="empty">${t('hdNotFound', ma)}</div>` };
  if (mode === 'renew' && cur.TrangThai === 'DAKYTIEP') return { title: 'hdRenew', back: 'hd/' + encodeURIComponent(cur.MaHD), tab: 'them', html: `<div class="notice warn">${ic('alert')}<div>${t('eBadState')}</div></div>` };
  const key = mode + ':' + (cur ? cur.MaHD : '');
  if (!S.hdForm || S.hdForm.key !== key) {
    let h;
    if (mode === 'edit') h = Object.assign({}, cur);
    else if (mode === 'renew') {
      // Hợp đồng mới nối tiếp: bắt đầu ngay sau ngày kết thúc cũ, cùng thời hạn
      const start = dAdd(cur.NgayKetThuc, 1, 'NGAY');
      const end1 = dAdd(cur.NgayKetThuc, 1, 'NGAY');
      let end = '';
      for (let m = 1; m <= 120 && !end; m++) if (dAdd(cur.NgayBatDau, m, 'THANG') === end1) end = dAdd(dAdd(start, m, 'THANG'), -1, 'NGAY');
      if (!end) end = dAdd(start, dDiff(cur.NgayBatDau, cur.NgayKetThuc), 'NGAY');
      h = Object.assign({}, cur, { SoHopDong: '', NgayBatDau: start, NgayKetThuc: end, LinkTaiLieu: '', GhiChu: '' });
    } else {
      const today = dToday();
      h = { TenVI: '', TenZH: '', SoHopDong: '', NhaThau: '', LienHe: '', PhamVi: '', TanSuat: '', DSThietBi: '',
        NgayBatDau: today, NgayKetThuc: dAdd(dAdd(today, 12, 'THANG'), -1, 'NGAY'), NhacTruoc: hdNhacDef(), LinkTaiLieu: '', GhiChu: '' };
    }
    S.hdForm = { key, mode, orig: cur ? cur.NgaySua : undefined, ma: cur ? cur.MaHD : '', h, ids: new Set(hdIds(h)) };
  }
  const F = S.hdForm, H = F.h;
  const back = cur ? 'hd/' + encodeURIComponent(cur.MaHD) : 'hd';
  const txt = (f, key, req, attrs, ph) => `<label class="fld" data-fld="${f}"><span class="lb">${t(key)}${req ? ' <b class="req">*</b>' : ''}</span>
    <input data-hf="${f}" value="${esc(H[f] || '')}" ${attrs || ''} ${ph ? `placeholder="${esc(tp(ph))}"` : ''}><span class="fe"></span></label>`;
  const area = (f, key, ph) => `<label class="fld" data-fld="${f}"><span class="lb">${t(key)}</span>
    <textarea data-hf="${f}" rows="3" maxlength="2000" ${ph ? `placeholder="${esc(tp(ph))}"` : ''}>${esc(H[f] || '')}</textarea><span class="fe"></span></label>`;
  return {
    title: { new: 'hdNewTitle', renew: 'hdRenew', edit: 'hdEditTitle' }[mode], back, tab: 'them', noPtr: true,
    html: `
      <form id="f-hd" class="form" autocomplete="off" novalidate>
        ${mode === 'renew' ? `<div class="notice">${ic('repeat')}<div>${t('hdRenewNote', cur.MaHD)}</div></div>` : ''}
        ${mode === 'edit' ? `<div class="card pad slim"><span class="sc-no big">${esc(cur.MaHD)}</span></div>` : ''}
        <section class="card pad">
          <div class="card-h flat">${ic('file')}${t('hdContract')}</div>
          ${txt('TenVI', 'hdTenVI', true, 'maxlength="200"', 'hdTenPh')}
          ${txt('TenZH', 'hdTenZH', false, 'maxlength="200" lang="zh"')}
          ${txt('SoHopDong', 'hdSoHD', false, 'maxlength="100"', 'hdSoHDPh')}
          ${txt('NhaThau', 'hdNhaThau', true, 'maxlength="150" list="dl-hdnt"')}
          ${txt('LienHe', 'hdLienHe', false, 'maxlength="300"', 'hdLienHePh')}
          ${txt('TanSuat', 'hdTanSuat', false, 'maxlength="200"', 'hdTanSuatPh')}
          ${area('PhamVi', 'hdPhamVi', 'hdPhamViPh')}
        </section>
        <section class="card pad">
          <div class="card-h flat">${ic('device')}${t('hdDevices')}</div>
          <div class="fld" data-fld="DSThietBi"><button type="button" class="select" data-act="hdPickTb">${hdTbLabel()}${ic('down')}</button><span class="fe"></span></div>
          <div id="hd-tbs" class="kh-tbs">${hdTbChips()}</div>
          <p class="muted small">${t('hdDevicesHint')}</p>
        </section>
        <section class="card pad">
          <div class="card-h flat">${ic('calendar')}${t('hdTerm')}</div>
          <div class="grid2">
            <label class="fld" data-fld="NgayBatDau"><span class="lb">${t('hdStart')} <b class="req">*</b></span><input type="date" data-hf="NgayBatDau" value="${esc(H.NgayBatDau)}"><span class="fe"></span></label>
            <label class="fld" data-fld="NgayKetThuc"><span class="lb">${t('hdEnd2')} <b class="req">*</b></span><input type="date" data-hf="NgayKetThuc" value="${esc(H.NgayKetThuc)}"><span class="fe"></span></label>
          </div>
          <div class="row gap wrap hd-dur">${[6, 12, 24, 36].map(m => `<button type="button" class="chip" data-act="hdDur" data-m="${m}">+${biTr(tr('nMonths', [m]))}</button>`).join('')}</div>
          <span class="muted small" id="hd-dur-now">${biTr(hdDurTr(H))}</span>
          <label class="fld" data-fld="NhacTruoc"><span class="lb">${t('hdNhacTruoc')}</span>
            <div class="ck-num"><input data-hf="NhacTruoc" value="${esc(H.NhacTruoc || '')}" inputmode="numeric" maxlength="3"><span class="ck-unit">${t('daysUnit')}</span></div>
            <span class="fe"></span><span class="muted small">${t('hdNhacHint')}</span></label>
        </section>
        <section class="card pad">
          ${txt('LinkTaiLieu', 'fLinkTaiLieu', false, 'type="url" inputmode="url" maxlength="500" placeholder="https://drive.google.com/…"')}
          ${area('GhiChu', 'fGhiChu')}
        </section>
        ${datalist('dl-hdnt', hdNames())}
        <div class="form-actions">
          <a class="btn" href="#/${back}">${t('cancel')}</a>
          <button class="btn primary" type="submit">${ic('check')}${t(mode === 'renew' ? 'hdRenewSave' : 'save')}</button>
        </div>
      </form>`,
    after: () => {
      const form = $('#f-hd');
      form.addEventListener('submit', saveHdForm);
      form.addEventListener('input', e => {
        clearFieldErr(e);
        const el = e.target;
        if (el.dataset.hf) {
          F.h[el.dataset.hf] = el.value;
          if (el.dataset.hf === 'NgayBatDau' || el.dataset.hf === 'NgayKetThuc') $('#hd-dur-now').innerHTML = biTr(hdDurTr(F.h));
        }
      });
    }
  };
}
function hdTbLabel() {
  const n = S.hdForm ? S.hdForm.ids.size : 0;
  return n ? `<span class="grow">${t('nSelected', n)}</span>` : `<span class="muted">${t('hdChooseTb')}</span>`;
}
function hdTbChips() {
  const ids = S.hdForm ? [...S.hdForm.ids] : [];
  return ids.sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).map(id => {
    const tb = tbById(id);
    return `<div class="kh-tb"><span class="tb-id">${esc(id)}</span><span class="grow small">${esc(tb ? tb.TenMay : '')}</span>
      <button type="button" class="hbtn sm" data-act="hdTbRemove" data-id="${esc(id)}" aria-label="x">${ic('x')}</button></div>`;
  }).join('');
}
const HD_FIELD_KEYS = { TenVI: 'hdTenVI', NhaThau: 'hdNhaThau', NgayBatDau: 'hdStart', NgayKetThuc: 'hdEnd2', NhacTruoc: 'hdNhacTruoc',
  LinkTaiLieu: 'fLinkTaiLieu', DSThietBi: 'hdDevices', lyDo: 'hdEndReason' };
function hdFieldName(f, x) { const k = HD_FIELD_KEYS[f]; const b = k ? tr(k) : { vi: f, zh: f }; return x && x.value ? { vi: b.vi + ' ' + x.value, zh: b.zh + ' ' + x.value } : b; }

async function saveHdForm(ev) {
  ev.preventDefault();
  if (!needOnline()) return;
  const form = ev.target;
  const F = S.hdForm;
  if (!F) return;
  const H = F.h;
  $$('.has-err', form).forEach(el => { el.classList.remove('has-err'); const fe = $('.fe', el); if (fe) fe.innerHTML = ''; });
  let bad = false;
  const err = (f, k, a) => { scFieldErr(form, f, k, a); bad = true; };
  if (!String(H.TenVI || '').trim()) err('TenVI', 'eRequired');
  if (!String(H.NhaThau || '').trim()) err('NhaThau', 'eRequired');
  if (!H.NgayBatDau) err('NgayBatDau', 'eRequired');
  if (!H.NgayKetThuc) err('NgayKetThuc', 'eRequired');
  if (H.NgayBatDau && H.NgayKetThuc && H.NgayKetThuc < H.NgayBatDau) err('NgayKetThuc', 'eTimeAfter', [tr('hdStart')]);
  if (String(H.NhacTruoc || '').trim() && (!/^\d{1,3}$/.test(String(H.NhacTruoc).trim()) || Number(H.NhacTruoc) > 365)) err('NhacTruoc', 'eNumber');
  if (H.LinkTaiLieu && !/^https?:\/\/\S+$/i.test(String(H.LinkTaiLieu).trim())) err('LinkTaiLieu', 'eLink');
  if (bad) { toast('eInvalid', 'err'); const first = $('.has-err', form); if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
  const hd = {};
  ['SoHopDong', 'TenVI', 'TenZH', 'NhaThau', 'LienHe', 'PhamVi', 'TanSuat', 'NgayBatDau', 'NgayKetThuc', 'NhacTruoc', 'LinkTaiLieu', 'GhiChu']
    .forEach(f => { hd[f] = String(H[f] === undefined || H[f] === null ? '' : H[f]).trim(); });
  hd.DSThietBi = [...F.ids];
  const payload = { op: { new: 'create', renew: 'kytiep', edit: 'capnhat' }[F.mode], hd };
  if (F.mode !== 'new') { payload.ma = F.ma; payload.ngaySuaCu = F.orig || ''; }
  busy(form, true);
  try {
    const r = await api('hdAction', payload);
    S.data.hopDong = r.hopDong;
    saveCache();
    S.hdForm = null;
    toast(r.unchanged ? tr('scNoChange') : tr(F.mode === 'edit' ? 'saved' : (F.mode === 'renew' ? 'hdRenewed' : 'hdCreated'), [r.ma]), 'ok');
    const detail = '#/hd/' + encodeURIComponent(r.ma);
    if (F.mode === 'edit' && S.prevHash === detail) history.back(); else location.replace(detail);
  } catch (e) {
    if (e.code === 'INVALID' && e.extra && e.extra.errors) showErrs(form, e.extra.errors, hdFieldName);
    else await hdHandleErr(e);
  } finally { if (form.isConnected) busy(form, false); }
}
async function hdHandleErr(e) {
  if (e.code === 'CONFLICT' || e.code === 'BAD_STATE') {
    const ex = e.extra || {};
    closeSheet();
    if (await confirmDlg('eConflict', e.code === 'CONFLICT' ? tr('scConflictMsg', [ex.nguoiSua || '?', fmtTime(ex.ngaySua)]) : tr('eBadState'), { ok: 'reload' })) {
      S.hdForm = null;
      await refresh(true);
      const p = route();
      if (p[0] === 'hd' && p[1] && p[2]) location.replace('#/hd/' + encodeURIComponent(p[1])); else render();
    }
  } else if (e.code !== 'AUTH') toast(errText(e), 'err');
}
/** Không ký tiếp (kết thúc) — bắt buộc lý do */
function hdEndSheet(ma) {
  const h = hdByMa(ma);
  if (!h || !needOnline()) return;
  const sh = openSheet(`
    <form id="f-hde" class="form" autocomplete="off" novalidate>
      <div class="pk-head"><h3 class="h3">${t('hdEnd')}</h3><button type="button" class="hbtn" data-act="closeSheet">${ic('x')}</button></div>
      <div class="muted small"><span class="sc-no">${esc(h.MaHD)}</span> · ${esc(h.NhaThau)} · ${esc(h.TenVI)}</div>
      <label class="fld" data-fld="lyDo"><span class="lb">${t('hdEndReason')} <b class="req">*</b></span>
        <textarea name="lyDo" rows="3" maxlength="1000" placeholder="${esc(tp('hdEndReasonPh'))}"></textarea><span class="fe"></span></label>
      <p class="muted small">${t('hdEndHint')}</p>
      <div class="msg" id="hde-msg"></div>
      <button class="btn danger block" type="submit">${ic('ban')}${t('hdEnd')}</button>
    </form>`);
  const form = $('#f-hde', sh);
  form.addEventListener('input', clearFieldErr);
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const lyDo = form.lyDo.value.trim();
    if (!lyDo) { scFieldErr(form, 'lyDo', 'eRequired'); return; }
    busy(form, true);
    try {
      const r = await api('hdAction', { op: 'ketthuc', ma: h.MaHD, ngaySuaCu: h.NgaySua || '', lyDo });
      S.data.hopDong = r.hopDong; saveCache();
      closeSheet(); toast('saved', 'ok'); render(true);
    } catch (e) {
      if (e.code === 'CONFLICT' || e.code === 'BAD_STATE') await hdHandleErr(e);
      else if (e.code !== 'AUTH') $('#hde-msg').innerHTML = errHtml(e);
    } finally { if (form.isConnected) busy(form, false); }
  });
}
async function hdSimpleOp(op, ma) {
  const h = hdByMa(ma);
  if (!h || !needOnline()) return;
  if (op === 'xoa' && !(await confirmDlg(tr('hdDeleteQ', [ma]), 'hdDeleteMsg', { ok: 'delete', danger: true }))) return;
  try {
    const r = await api('hdAction', { op, ma, ngaySuaCu: h.NgaySua || '' });
    S.data.hopDong = r.hopDong; saveCache();
    toast(op === 'xoa' ? tr('scDeleted', [ma]) : tr('saved'), 'ok');
    if (op === 'xoa') location.replace('#/hd'); else render(true);
  } catch (e) { await hdHandleErr(e); }
}

/* ---- Trang máy: hợp đồng áp dụng ---- */
function tbHdSection(tb) {
  const list = hdOfTb(tb.ID).filter(h => { const s = hdStatus(h); return s.st !== 'KETTHUC' && !(s.st === 'DAKYTIEP' && s.left < 0); });
  if (!list.length) return '';
  return `<section class="card">
    <div class="card-h">${ic('file')}${t('contracts')}<span class="count">${list.length}</span></div>
    <div class="mini-list">${list.map(hdMini).join('')}</div>
  </section>`;
}

/* ---------------------- Bảo trì dự đoán ---------------------- */
/* Phiếu đo DD-yyyy-nnnn: 1 máy + 1 loại đo (nhiệt ảnh · rung · cách điện) + nhiều điểm đo, mỗi điểm xếp mức A–D
 * theo ngưỡng chép vào phiếu (giống backend ddEval_). Chu kỳ đo (tháng) → hạn đo lần sau. */
const DD_LOAI = ['NHIET', 'RUNG', 'CACHDIEN'];
const DD_MUC = ['A', 'B', 'C', 'D'];
const DD_ICON = { NHIET: 'thermo', RUNG: 'vibe', CACHDIEN: 'insul' };
const DD_UNIT = { NHIET: '°C', RUNG: 'mm/s', CACHDIEN: 'MΩ' };
const DD_CHUAN = {
  NHIET: { NETA_PT: ['1', '3', '15'], NETA_MT: ['10', '20', '40'] },
  RUNG: { ISO1_I: ['0.71', '1.8', '4.5'], ISO1_II: ['1.12', '2.8', '7.1'], ISO1_III: ['1.8', '4.5', '11.2'], ISO1_IV: ['2.8', '7.1', '18'],
    ISO3_2R: ['1.4', '2.8', '4.5'], ISO3_2F: ['2.3', '4.5', '7.1'], ISO3_1R: ['2.3', '4.5', '7.1'], ISO3_1F: ['3.5', '7.1', '11'] },
  CACHDIEN: { MIN1: ['1'] }
};
const DD_KEYS = { NHIET: ['td', 'tr'], RUNG: ['h', 'v', 'a'], CACHDIEN: ['l1', 'l2', 'l3', 'l12', 'l23', 'l31'] };
const DD_TABS = [{ id: 'CAN', key: 'ddTabDue' }, { id: 'CB', key: 'ddTabAlarm' }, { id: 'LS', key: 'ddTabHist' }];
const DD_VOLTS = ['250', '500', '1000', '2500', '5000'];

function allDD() { return (S.data && S.data.phieuDD) || []; }
function ddBySo(so) { const k = String(so || '').toUpperCase(); return allDD().find(x => String(x.SoPhieu).toUpperCase() === k) || null; }
function ddSortDesc(a, b) { return String(b.TGDo || '').localeCompare(String(a.TGDo || '')) || String(b.SoPhieu).localeCompare(String(a.SoPhieu)); }
function ddOf(id, loai) { const k = String(id).toUpperCase(); return allDD().filter(x => String(x.IDThietBi).toUpperCase() === k && (!loai || x.Loai === loai)).sort(ddSortDesc); }
function mergeDD(rows) {
  if (!S.data) return;
  const arr = S.data.phieuDD || (S.data.phieuDD = []);
  rows.forEach(r => { const i = arr.findIndex(x => x.SoPhieu === r.SoPhieu); if (i >= 0) arr[i] = r; else arr.push(r); });
  saveCache();
}
function removeDD(so) { if (S.data && S.data.phieuDD) { S.data.phieuDD = S.data.phieuDD.filter(x => x.SoPhieu !== so); saveCache(); } }
function ddPts(dd) { return jparse(dd.DiemDo, []); }
function ddNum(v) { const s = String(v === undefined || v === null ? '' : v).trim().replace(/\s/g, '').replace(',', '.'); return s === '' ? '' : (/^-?\d+(\.\d+)?$/.test(s) ? String(Number(s)) : null); }
function irNum(v) {
  const s = String(v === undefined || v === null ? '' : v).trim().replace(/\s/g, '');
  if (!s) return '';
  const over = /^[>≥]/.test(s);
  const n = ddNum(over ? s.slice(1) : s);
  return n === null || n === '' || Number(n) < 0 ? null : (over ? '>' + n : n);
}
function irVal(s) { return Number(String(s).replace(/^[>≥]/, '')); }
/** Mức của một điểm (giống backend ddEval_) */
function ddEval(loai, ng, x, pi) {
  const tt = (ng || []).map(Number);
  if (loai === 'CACHDIEN') {
    if (x < tt[0]) return 'D';
    if (pi !== undefined && pi !== '') { const p = Number(pi); if (p < 1) return 'D'; if (p < 2) return 'B'; }
    return 'A';
  }
  return x <= tt[0] ? 'A' : (x <= tt[1] ? 'B' : (x <= tt[2] ? 'C' : 'D'));
}
/** Tính chỉ số đại diện + mức cho một điểm đang nhập → { x, m } | { err } | null */
function ddCalc(loai, ng, p) {
  if (loai === 'NHIET') {
    const a = ddNum(p.td), b = ddNum(p.tr);
    if (a === null || b === null) return { err: 'eNumber' };
    if (a === '' || b === '') return null;
    const x = Math.round((Number(a) - Number(b)) * 10) / 10;
    return { x, m: ddEval(loai, ng, x) };
  }
  const vals = [];
  let bad = false;
  DD_KEYS[loai].forEach(k => {
    const n = loai === 'CACHDIEN' ? irNum(p[k]) : ddNum(p[k]);
    if (n === null || (loai === 'RUNG' && n !== '' && Number(n) < 0)) bad = true;
    else if (n !== '') vals.push(loai === 'CACHDIEN' ? irVal(n) : Number(n));
  });
  const pi = loai === 'CACHDIEN' ? ddNum(p.pi) : '';
  if (pi === null || (pi !== '' && Number(pi) <= 0)) bad = true;
  if (bad) return { err: 'eNumber' };
  if (!vals.length) return null;
  const x = loai === 'CACHDIEN' ? Math.min(...vals) : Math.max(...vals);
  return { x, m: ddEval(loai, ng, x, pi) };
}
function ddNg(dd) { return String(dd.Nguong || '').split(',').filter(Boolean); }
function ddMucPill(m, cls) { return m ? `<span class="pill dd-${esc(m)}${cls ? ' ' + cls : ''}">${t('ddM' + m)}</span>` : ''; }
function ddLoaiBi(loai, cls) { return `<span class="dd-loai${cls ? ' ' + cls : ''}">${ic(DD_ICON[loai] || 'pulse')}${t('ddL' + loai)}</span>`; }
/** Tên chuẩn đánh giá + ngưỡng: "ISO 10816-3 nhóm 2, móng cứng — A ≤ 1,4 < B ≤ 2,8 < C ≤ 4,5 < D mm/s" */
function ddChuanTr(loai, chuan) { return tr('ddC_' + (DD_CHUAN[loai] && DD_CHUAN[loai][chuan] ? chuan : 'TUY')); }
function ddZones(loai, ng) {
  const f = v => fmtNum(v);
  if (loai === 'CACHDIEN') return ng[0] ? tp('ddZonesCD', f(ng[0])) : '';
  if (ng.length < 3) return '';
  return `A ≤ ${f(ng[0])} < B ≤ ${f(ng[1])} < C ≤ ${f(ng[2])} < D` + (loai === 'NHIET' ? ' (ΔT °C)' : ' (mm/s)');
}
/** Lần đo gần nhất của mỗi máy + loại */
function ddZonesHtml(loai, ng) { return loai === 'CACHDIEN' ? (ng[0] ? t('ddZonesCD', fmtNum(ng[0])) : '') : esc(ddZones(loai, ng)); }
function ddLatestMap() {
  const m = new Map();
  allDD().forEach(r => { const k = String(r.IDThietBi).toUpperCase() + '|' + r.Loai; const c = m.get(k); if (!c || ddSortDesc(r, c) < 0) m.set(k, r); });
  return m;
}
/** Hạn đo: QUAHAN · DENHAN (≤ 7 ngày) · CHUADEN */
function ddDue(rec, today) {
  if (!rec.HanDoTiep) return null;
  const days = dDiff(today || dToday(), rec.HanDoTiep);
  return { days, st: days < 0 ? 'QUAHAN' : (days <= 7 ? 'DENHAN' : 'CHUADEN') };
}
function ddTodo() {
  const today = dToday(), out = [];
  ddLatestMap().forEach(r => {
    const tb = tbById(r.IDThietBi);
    if (!tb || MAY_NGUNG.includes(tb.TrangThai)) return;
    const d = ddDue(r, today);
    if (d && d.st !== 'CHUADEN') out.push({ r, tb, d });
  });
  return out.sort((a, b) => String(a.r.HanDoTiep).localeCompare(String(b.r.HanDoTiep)));
}
function ddAlarms() {
  const out = [];
  ddLatestMap().forEach(r => { const tb = tbById(r.IDThietBi); if ((r.MucDo === 'C' || r.MucDo === 'D') && (!tb || tb.TrangThai !== 'THANHLY')) out.push({ r, tb }); });
  return out.sort((a, b) => DD_MUC.indexOf(b.r.MucDo) - DD_MUC.indexOf(a.r.MucDo) || ddSortDesc(a.r, b.r));
}
function ddDueHtml(d) {
  if (!d) return '';
  const x = d.days < 0 ? tr('dueLate', [-d.days]) : (d.days === 0 ? tr('dueToday') : (d.days === 1 ? tr('dueTomorrow') : tr('dueIn', [d.days])));
  return `<span class="due kh-${esc(d.st)}">${ic('calendar')}${bi(x.vi, x.zh)}</span>`;
}
function ddCanEdit(dd) { return isQL() || (Date.now() - tsMs(dd.NgayTao) <= KT_EDIT_HOURS * 3600000); }
/** Giá trị một điểm dạng chữ (không kèm mức) */
function ddValTxt(loai, p) {
  const f = v => (v === undefined || v === '' ? '–' : (String(v)[0] === '>' ? '>' + fmtNum(String(v).slice(1)) : fmtNum(v)));
  if (loai === 'NHIET') return `${f(p.td)} °C − ${f(p.tr)} °C = ΔT ${f(p.x)} °C`;
  if (loai === 'RUNG') return `H ${f(p.h)} · V ${f(p.v)} · A ${f(p.a)} mm/s`;
  const pp = ['l12', 'l23', 'l31'].some(k => p[k] !== undefined) ? ` · L1–L2 ${f(p.l12)} · L2–L3 ${f(p.l23)} · L3–L1 ${f(p.l31)}` : '';
  return `L1–E ${f(p.l1)} · L2–E ${f(p.l2)} · L3–E ${f(p.l3)}${pp} MΩ${p.pi !== undefined ? ` · PI ${f(p.pi)}` : ''}`;
}
function ddXTxt(loai, x) { return (loai === 'NHIET' ? 'ΔT ' : '') + fmtNum(x) + ' ' + DD_UNIT[loai]; }

/* ---- Trang chủ + Công việc ---- */
function homeDdRcaCard() {
  if (!allDD().length && !allRCA().length) return '';
  const al = ddAlarms().length, todo = ddTodo(), nLate = todo.filter(x => x.d.st === 'QUAHAN').length;
  const rs = rcaOpenStats();
  const cells = [
    ['dd-D', al, '#/dd', 'ddTabGo', 'CB', 'ddTabAlarm'],
    [nLate ? 'kh-QUAHAN' : 'kh-DENHAN', todo.length, '#/dd', 'ddTabGo', 'CAN', 'ddTabDue'],
    ['rc-KHACPHUC', rs.open, '#/rca', 'rcaTabGo', 'MO', 'rcaOpenShort'],
    ['kh-QUAHAN', rs.late, '#/rca', 'rcaTabGo', 'HD', 'rcaLateShort']
  ];
  const worst = al || rs.late ? 'bad' : (todo.length || rs.open ? 'warn' : 'ok');
  return `<section class="card">
    <div class="card-h">${ic('pulse', worst)}${t('ddRcaTitle')}</div>
    <div class="sc-counters">
      ${cells.map(([cls, n, href, act, tab, key]) => `<a class="scc ${cls}${n ? ' has' : ''}" href="${href}" data-act="${act}" data-t="${tab}"><b>${n}</b>${t(key)}</a>`).join('')}
    </div>
    <div class="card-f">
      <a class="link" href="#/dd" data-act="ddTabGo" data-t="${al ? 'CB' : 'CAN'}">${t('predictive')}</a>
      <span class="sp"></span>
      <a class="link" href="#/rca" data-act="rcaTabGo" data-t="MO">${t('rcaShort')}</a>
    </div>
  </section>`;
}

/* ---- Trang máy ---- */
function tbDdSection(tb) {
  const rows = DD_LOAI.map(l => ({ l, r: ddOf(tb.ID, l)[0] || null })).filter(x => x.r);
  const loading = S.online && !S.ddLoaded.has(tb.ID);
  const can = tb.TrangThai !== 'THANHLY';
  return `<section class="card">
    <div class="card-h">${ic('pulse')}${t('predictive')}<span class="count">${ddOf(tb.ID).length}</span></div>
    ${rows.length ? `<div class="mini-list">${rows.map(({ l, r }) => `<a class="mini dd-${esc(r.MucDo)}" href="#/dd/${encodeURIComponent(r.SoPhieu)}">
        <div class="mini-main">
          <div class="mini-top">${ddLoaiBi(l)}<span class="sp"></span><span class="muted small">${esc(fmtShort(r.TGDo))}</span></div>
          <div class="sc-meta">${Number(r.SoDiemCanhBao) ? `<span class="small">${t('ddNWarn', r.SoDiemCanhBao, r.SoDiem)}</span>` : `<span class="muted small">${t('ddNPoints', r.SoDiem)}</span>`}
            ${ddDueHtml(ddDue(r))}</div>
        </div>
        ${ddMucPill(r.MucDo)}</a>`).join('')}</div>`
      : (loading ? `<div class="empty small"><div class="spinner"></div></div>` : `<div class="empty small">${t('ddNoneTb')}</div>`)}
    ${can ? `<div class="card-f"><button class="btn sm primary" data-act="ddNewTb" data-id="${esc(tb.ID)}">${ic('plus')}${t('ddRecord')}</button></div>` : ''}
  </section>`;
}
async function loadTbDdHistory(id, then) {
  if (!S.online || S.ddLoaded.has(id)) return;
  S.ddLoaded.add(id);
  try { const r = await api('listDD', { id }); mergeDD(r.rows); } catch (e) { /* giữ dữ liệu đã có */ }
  if (then) then(); else rerenderTb(id);
}

/* ---- Danh sách ---- */
function ddMatch(tb, extra) { return tbMatchF(tb, S.ddf, extra) && true; }
function ddListItems(tab) {
  const f = S.ddf;
  const okL = l => !f.loai || l === f.loai;
  if (tab === 'CAN') return ddTodo().filter(x => okL(x.r.Loai) && ddMatch(x.tb));
  if (tab === 'CB') return ddAlarms().filter(x => okL(x.r.Loai) && ddMatch(x.tb, [x.r.SoPhieu]));
  return allDD().filter(r => okL(r.Loai) && ddMatch(tbById(r.IDThietBi) || { ID: r.IDThietBi }, [r.SoPhieu, r.NguoiDo, r.NhaThau, r.DeXuat]))
    .sort(ddSortDesc).map(r => ({ r, tb: tbById(r.IDThietBi) }));
}
function viewDdList() {
  if (!S.data) return loadingView();
  const f = S.ddf;
  const todo = ddTodo(), al = ddAlarms();
  const nLate = todo.filter(x => x.d.st === 'QUAHAN').length;
  return {
    live: true, restoreScroll: true, title: 'predictive', back: 'cv', tab: 'cv',
    html: `
      <div class="toolbar sticky">
        <div class="seg sc-tabs">${DD_TABS.map(x => {
          const lb = tr(x.key);
          const n = x.id === 'CAN' ? todo.length : (x.id === 'CB' ? al.length : 0);
          const cls = x.id === 'CAN' ? (nLate ? 'kh-QUAHAN' : 'kh-DENHAN') : 'dd-D';
          return `<a data-act="ddTab" data-t="${x.id}" class="${x.id === f.tab ? 'on' : ''}">${bi(lb.vi, lb.zh)}${n ? `<span class="tcount ${cls}">${n}</span>` : ''}</a>`;
        }).join('')}</div>
        <div class="search">${ic('search')}<input type="search" id="dd-q" value="${esc(f.q)}" placeholder="${esc(tp('searchTb'))}" autocomplete="off"></div>
        <div class="chips">
          <button class="chip${f.loai ? ' on' : ''}" data-act="ddFilterLoai">${ic('pulse')}${f.loai ? t('ddL' + f.loai) : t('ddAllTypes')}</button>
          <button class="chip${f.kv ? ' on' : ''}" data-act="ddFilter" data-k="kv">${ic('map')}${f.kv ? dmBi('KHUVUC', f.kv) : t('allAreas')}</button>
          <button class="chip${f.nhom ? ' on' : ''}" data-act="ddFilter" data-k="nhom">${ic('device')}${f.nhom ? dmBi('NHOMTB', f.nhom) : t('allGroups')}</button>
        </div>
      </div>
      <div class="list-bar"><span id="dd-count" class="muted"></span><span class="sp"></span>
        <button class="link" data-act="ddCsv">${t('exportCsv')}</button></div>
      <div id="dd-list" class="tb-list"></div>
      <div id="dd-more"></div>
      <a class="fab" href="#/dd" data-act="ddNew" aria-label="${esc(tp('ddRecord'))}">${ic('plus')}</a>`,
    after: () => {
      drawDdList();
      $('#dd-q').addEventListener('input', debounce(e => { S.ddf.q = e.target.value; drawDdList(); }, 150));
    }
  };
}
function drawDdList() {
  const box = $('#dd-list');
  if (!box) return;
  const tab = S.ddf.tab;
  const list = ddListItems(tab);
  $('#dd-count').innerHTML = tab === 'LS' ? t('scNTickets', list.length) : t('nDevices', list.length);
  box.classList.toggle('bare', !list.length);
  const filtered = S.ddf.q || S.ddf.kv || S.ddf.nhom || S.ddf.loai;
  if (!list.length) {
    const okTab = tab !== 'LS' && allDD().length && !filtered;
    box.innerHTML = `<div class="empty${okTab ? ' ok' : ''}">${ic(okTab ? 'checkCircle' : 'pulse')}${
      filtered ? t('noResult') : t(!allDD().length ? 'ddNone' : (tab === 'CAN' ? 'ddNoDue' : (tab === 'CB' ? 'ddNoAlarm' : 'noResult')))}</div>`;
  } else if (tab === 'CAN') {
    box.innerHTML = list.slice(0, 300).map(({ r, tb, d }) => `<a class="sc-item kh-${esc(d.st)}" href="#/dd-moi/${encodeURIComponent(r.IDThietBi)}/${r.Loai}">
      <div class="tb-top"><span class="tb-id">${esc(r.IDThietBi)}</span>${tb.MaNhaMay ? `<span class="tb-ma">${esc(tb.MaNhaMay)}</span>` : ''}<span class="sp"></span>${ddLoaiBi(r.Loai, 'sm')}</div>
      ${bi(tb.TenMay, tb.TenMayZH, 'tb-name')}
      <div class="sc-meta">${ddDueHtml(d)}<span class="muted small">${esc(fmtDate(r.HanDoTiep))}</span><span class="sp"></span>
        <span class="muted small">${t('ddLastShort', fmtDate(r.TGDo))}</span>${ddMucPill(r.MucDo, 'sm')}</div>
    </a>`).join('');
  } else {
    box.innerHTML = list.slice(0, 300).map(({ r, tb }) => ddItem(r, tb)).join('');
  }
  const more = $('#dd-more');
  const left = (S.data.ddOld || 0) - S.ddOldLoaded;
  more.innerHTML = tab === 'LS' && left > 0 ? `<button class="btn block" data-act="ddLoadOld">${ic('download')}${t('scLoadOld', left)}</button>` : '';
}
function ddItem(r, tb) {
  const sc = allSC().filter(x => x.PhieuNguon === r.SoPhieu);
  return `<a class="sc-item dd-${esc(r.MucDo)}" href="#/dd/${encodeURIComponent(r.SoPhieu)}">
    <div class="tb-top"><span class="sc-no">${esc(r.SoPhieu)}</span>${ddMucPill(r.MucDo)}<span class="sp"></span><span class="muted small">${esc(fmtShort(r.TGDo))}</span></div>
    <div class="sc-tbline"><span class="tb-id">${esc(r.IDThietBi)}</span> ${tb ? bi(tb.TenMay, tb.TenMayZH, 'tb-name') : ''}</div>
    <div class="sc-meta">${ddLoaiBi(r.Loai, 'sm')}${Number(r.SoDiemCanhBao) ? `<span class="small">${t('ddNWarn', r.SoDiemCanhBao, r.SoDiem)}</span>` : `<span class="muted small">${t('ddNPoints', r.SoDiem)}</span>`}
      ${sc.length ? `<span class="sc-chip">${esc(sc[0].SoPhieu)}</span>` : ''}<span class="sp"></span><span class="muted small">${esc(r.NguoiDo)}</span></div>
  </a>`;
}
async function ddLoadOld(btn) {
  if (!needOnline() || S.ddOldBusy) return;
  S.ddOldBusy = true;
  btn.disabled = true; btn.classList.add('loading');
  try {
    const r = await api('listDD', { old: true, offset: S.ddOldLoaded, limit: 200 });
    S.ddOldLoaded += r.rows.length;
    S.data.ddOld = r.total;
    mergeDD(r.rows);
    drawDdList();
  } catch (e) { if (e.code !== 'AUTH') toast(errText(e), 'err'); } finally { S.ddOldBusy = false; if (btn.isConnected) { btn.disabled = false; btn.classList.remove('loading'); } }
}
function exportDdCsv() {
  const head = csvHead([['', 'Số phiếu', '单号'], ['', 'Ngày đo', '检测时间'], ['', 'ID', ''], ['', 'Tên máy', '设备名称'], ['', 'Khu vực', '区域'],
    ['', 'Loại đo', '检测类型'], ['', 'Chuẩn đánh giá', '评价标准'], ['', 'Ngưỡng', '阈值'], ['', 'Điện áp thử (V)', '测试电压(V)'], ['', 'Điểm đo', '测点'],
    ['', 'T đo (°C)', '实测温度(°C)'], ['', 'T tham chiếu (°C)', '参考温度(°C)'], ['', 'ΔT (°C)', '温差(°C)'], ['', 'H (mm/s)', ''], ['', 'V (mm/s)', ''], ['', 'A (mm/s)', ''],
    ['', 'L1–E (MΩ)', ''], ['', 'L2–E (MΩ)', ''], ['', 'L3–E (MΩ)', ''], ['', 'L1–L2 (MΩ)', ''], ['', 'L2–L3 (MΩ)', ''], ['', 'L3–L1 (MΩ)', ''], ['', 'PI', ''],
    ['', 'Chỉ số', '指标'], ['', 'Mức', '等级'], ['', 'Ghi chú điểm', '测点备注'], ['', 'Người đo', '检测人'], ['', 'Đơn vị đo', '检测单位'], ['', 'Thiết bị đo', '检测仪器'],
    ['', 'Đề xuất', '建议措施'], ['', 'Hạn đo tiếp', '下次检测日期']]);
  const rows = [head];
  const recs = S.ddf.tab === 'LS' ? ddListItems('LS').map(x => x.r) : ddListItems(S.ddf.tab).map(x => x.r);
  recs.forEach(r => {
    const tb = tbById(r.IDThietBi);
    const base = [r.SoPhieu, r.TGDo, r.IDThietBi, tb ? tb.TenMay : '', tb ? dmVi('KHUVUC', tb.ViTri) : '', tr('ddL' + r.Loai).vi, ddChuanTr(r.Loai, r.Chuan).vi, r.Nguong, r.DienApThu];
    const tail = [r.NguoiDo, r.NhaThau || tr('ddInHouse').vi, r.ThietBiDo, r.DeXuat, r.HanDoTiep];
    const pts = ddPts(r);
    if (!pts.length) rows.push(base.concat(new Array(17).fill(''), tail));
    pts.forEach(p => rows.push(base.concat([p.t, p.td, p.tr, r.Loai === 'NHIET' ? p.x : '', p.h, p.v, p.a, p.l1, p.l2, p.l3, p.l12, p.l23, p.l31, p.pi, p.x, p.m, p.g].map(v => v === undefined ? '' : v), tail)));
  });
  downloadCsv(`bao-tri-du-doan_${stamp()}.csv`, rows);
}

/* ---- Chi tiết + xu hướng ---- */
VIEWS.dd = p => {
  if (p[1] && p[2] === 'sua') return viewDdForm('edit', p[1]);
  if (p[1]) return viewDdDetail(p[1]);
  return viewDdList();
};
VIEWS['dd-moi'] = p => viewDdForm('new', p[1], p[2]);

/** Lịch sử một điểm đo của máy (theo tên điểm, cùng loại) → [{d, y, m, so}] tăng dần theo thời gian */
function ddPointHist(id, loai, name) {
  const n = norm(name);
  const out = [];
  ddOf(id, loai).slice().reverse().forEach(r => {
    const p = ddPts(r).find(q => norm(q.t) === n);
    if (p && p.x !== undefined && p.x !== '') out.push({ d: String(r.TGDo).slice(0, 10), ts: r.TGDo, y: Number(p.x), m: p.m, so: r.SoPhieu });
  });
  return out;
}

function viewDdDetail(so) {
  if (!S.data) return loadingView();
  const dd = ddBySo(so);
  if (!dd) {
    if (S.online) {
      setTimeout(() => fetchMissingDD(so), 0);
      return { title: 'ddDetail', back: 'dd', tab: 'cv', html: `<div class="card pad center"><div class="spinner"></div><p class="muted">${t('loading')}</p></div>` };
    }
    return { title: 'ddDetail', back: 'dd', tab: 'cv', html: `<div class="empty">${ic('search')}${t('ddNotFound', so)}</div>` };
  }
  const ql = isQL();
  const enc = encodeURIComponent(dd.SoPhieu);
  const pts = ddPts(dd);
  const ng = ddNg(dd);
  const loading = S.online && !S.ddLoaded.has(dd.IDThietBi);
  const hist = ddOf(dd.IDThietBi, dd.Loai);
  const prev = hist.find(r => ddSortDesc(r, dd) > 0) || null;   // lần đo trước phiếu này
  const prevPts = prev ? ddPts(prev) : [];
  const linked = allSC().filter(x => x.PhieuNguon === dd.SoPhieu).sort(scSortDesc);
  const nWarn = Number(dd.SoDiemCanhBao) || 0;
  const canEdit = ddCanEdit(dd);
  const due = ddDue(dd);
  const isLatest = hist[0] && hist[0].SoPhieu === dd.SoPhieu;
  S.trend = {};
  const kv = (key, val, raw) => (val === '' || val === null || val === undefined) ? '' :
    `<div class="kv"><div class="k">${t(key)}</div><div class="v">${raw ? val : esc(val)}</div></div>`;
  const kvCol = (key, val) => val ? `<div class="kv col"><div class="k">${t(key)}</div><div class="v pre">${esc(val)}</div></div>` : '';
  const ptRow = (p, i) => {
    const pp = prevPts.find(q => norm(q.t) === norm(p.t));
    const h = ddPointHist(dd.IDThietBi, dd.Loai, p.t);
    const cid = 'tr' + i;
    if (h.length >= 2) S.trend[cid] = { pts: h, ng, loai: dd.Loai, cur: dd.SoPhieu };
    return `<div class="dd-pt dd-${esc(p.m || 'A')}">
      <div class="dd-pt-h"><span class="mau-no">${i + 1}</span><div class="grow"><b>${esc(p.t)}</b></div>${ddMucPill(p.m)}</div>
      <div class="dd-pt-x"><b>${esc(ddXTxt(dd.Loai, p.x))}</b>${pp && pp.x !== undefined ? `<span class="muted small">${t('ddPrevVal', ddXTxt(dd.Loai, pp.x), pp.m || '')}</span>` : ''}</div>
      <div class="small muted">${esc(ddValTxt(dd.Loai, p))}</div>
      ${p.g ? `<div class="kq-note">${esc(p.g)}</div>` : ''}
      ${h.length >= 2 ? `<div class="trend" data-trend="${cid}">${trendSvg(S.trend[cid])}</div>` : ''}
    </div>`;
  };
  return {
    live: true, title: 'ddDetail', back: 'dd', tab: 'cv',
    html: `
      <section class="card hero dd-${esc(dd.MucDo)}">
        <div class="hero-main">
          <div class="hero-ids"><span class="sc-no big">${esc(dd.SoPhieu)}</span>${ddMucPill(dd.MucDo)}</div>
          ${ddLoaiBi(dd.Loai, 'big')}
          <div class="sc-meta"><span class="small">${esc(fmtTime(dd.TGDo))}</span><span class="sp"></span>
            ${nWarn ? `<span class="small">${t('ddNWarn', nWarn, dd.SoDiem)}</span>` : `<span class="muted small">${t('ddNPoints', dd.SoDiem)}</span>`}</div>
        </div>
      </section>
      ${tbCard(dd.IDThietBi)}
      ${nWarn && !linked.length ? `<div class="notice warn">${ic('alert')}<div>${t('ddWarnNote')}</div></div>` : ''}
      <div class="actions-row">
        ${canEdit ? `<a class="btn sm" href="#/dd/${enc}/sua">${ic('edit')}${t('edit')}</a>` : ''}
        ${nWarn ? `<a class="btn sm${linked.length ? '' : ' primary'}" href="#/sc-moi/${encodeURIComponent(dd.IDThietBi)}/${enc}">${ic('wrench')}${t('btMakeSc')}</a>` : ''}
        ${isLatest && tbById(dd.IDThietBi) ? `<a class="btn sm" href="#/dd-moi/${encodeURIComponent(dd.IDThietBi)}/${dd.Loai}">${ic('repeat')}${t('ddMeasureAgain')}</a>` : ''}
        <button class="btn sm" data-act="printDd" data-so="${esc(dd.SoPhieu)}">${ic('print')}${t('pPrintShort')}</button>
      </div>
      <section class="card">
        <div class="card-h">${ic(DD_ICON[dd.Loai])}${t('ddResults')}<span class="count">${pts.length}</span></div>
        <div class="dd-std">${biTr(ddChuanTr(dd.Loai, dd.Chuan))}<div class="small muted">${ddZonesHtml(dd.Loai, ng)}</div>${dd.DienApThu ? `<div class="small muted">${t('ddVoltV', fmtNum(dd.DienApThu))}</div>` : ''}</div>
        ${pts.map(ptRow).join('')}
        ${loading ? `<div class="empty small"><div class="spinner"></div></div>` : ''}
        ${!loading && hist.length < 2 ? `<p class="muted small pad-x">${t('ddTrendHint')}</p>` : ''}
      </section>
      <section class="card">
        <div class="card-h">${ic('info')}${t('info')}</div>
        ${kv('ddNguoiDo', dd.NguoiDo)}
        ${kv('ddDonVi', dd.NhaThau || tr('ddInHouse').vi)}
        ${kv('ddThietBiDo', dd.ThietBiDo)}
        ${kvCol('ddDieuKien', dd.DieuKien)}
        ${kvCol('ddDeXuat', dd.DeXuat)}
        ${kv('ddChuKy', dd.ChuKyThang ? `${biTr(tr('nMonths', [dd.ChuKyThang]))}` : `<span class="muted">${t('ddNoCycle')}</span>`, true)}
        ${dd.HanDoTiep ? kv('ddNext', `${esc(fmtDate(dd.HanDoTiep))} ${isLatest ? ddDueHtml(due) : ''}`, true) : ''}
        ${kvCol('fGhiChu', dd.GhiChu)}
      </section>
      ${linked.length ? `<section class="card">
        <div class="card-h">${ic('wrench')}${t('btLinkedSc')}<span class="count">${linked.length}</span></div>
        <div class="mini-list">${linked.map(x => scMini(x, false)).join('')}</div>
      </section>` : ''}
      ${hist.length > 1 ? `<section class="card">
        <div class="card-h">${ic('log')}${t('ddHistory')}<span class="count">${hist.length}</span></div>
        <div class="mini-list">${hist.slice(0, 30).map(r => `<a class="mini dd-${esc(r.MucDo)}${r.SoPhieu === dd.SoPhieu ? ' cur' : ''}" href="#/dd/${encodeURIComponent(r.SoPhieu)}">
          <div class="mini-main"><div class="mini-top"><span class="sc-no">${esc(r.SoPhieu)}</span><span class="muted small">${esc(fmtShort(r.TGDo))}</span></div>
          <div class="sc-meta"><span class="muted small">${esc(r.NguoiDo)}${r.NhaThau ? ' · ' + esc(r.NhaThau) : ''}</span></div></div>${ddMucPill(r.MucDo)}</a>`).join('')}</div>
      </section>` : ''}
      <p class="muted small audit">${t('createdBy', fmtTime(dd.NgayTao), dd.NguoiTao || '—')}${dd.NgaySua !== dd.NgayTao ? `<br>${t('updatedBy', fmtTime(dd.NgaySua), dd.NguoiSua || '—')}` : ''}</p>
      ${!ql && !canEdit ? `<p class="muted small audit">${t('ktEditWindow', KT_EDIT_HOURS)}</p>` : ''}
      ${ql ? `<button class="btn block danger-outline" data-act="ddDelete" data-so="${esc(dd.SoPhieu)}">${ic('trash')}${t('ddDelete')}</button>` : ''}`,
    after: () => {
      bindTrends();
      if (loading) loadTbDdHistory(dd.IDThietBi, () => { const p = route(); if (p[0] === 'dd' && p[1] && p[1].toUpperCase() === dd.SoPhieu.toUpperCase() && !p[2] && !$('.overlay.open')) { const y = window.scrollY; render(true); window.scrollTo(0, y); } });
    }
  };
}
async function fetchMissingDD(so) {
  try { const r = await api('listDD', { so }); mergeDD(r.rows); } catch (e) { /* không tìm thấy */ }
  const p = route();
  if (p[0] !== 'dd' || !p[1] || p[1].toUpperCase() !== String(so).toUpperCase()) return;
  if (ddBySo(so)) render(true); else $('#view .page').innerHTML = `<div class="empty">${ic('search')}${t('ddNotFound', so)}</div>`;
}

/**
 * Biểu đồ xu hướng một điểm đo (SVG, một chuỗi): đường 2px màu thương hiệu, điểm tô theo mức A–D (vòng nền 2px),
 * vạch ngưỡng mảnh có nhãn B/C/D (cách điện: vạch tối thiểu), nhãn giá trị ở điểm cuối, chạm để xem từng lần đo.
 */
function trendSvg(o) {
  const W = 320, H = 112, L = 34, R = 30, T = 10, B = 20;
  const pts = o.pts;
  const ys = pts.map(p => p.y);
  const ng = (o.ng || []).map(Number).filter(v => isFinite(v));
  const dMax = Math.max(...ys);
  let yMax = dMax;
  // Hiện thêm ranh giới mức kế tiếp nếu không quá xa (≤ 2,5 lần giá trị lớn nhất) để biết còn cách bao nhiêu
  const above = ng.filter(v => v > dMax).sort((a, b) => a - b)[0];
  if (above !== undefined && above <= Math.max(dMax, 0.1) * 2.5) yMax = Math.max(yMax, above);
  if (o.loai === 'CACHDIEN' && ng[0] !== undefined) yMax = Math.max(yMax, ng[0]);
  const yMin = Math.min(0, ...ys);
  yMax = yMax + (yMax - yMin) * 0.12 || 1;
  const x0 = dMs(pts[0].d), x1 = dMs(pts[pts.length - 1].d);
  const X = (p, i) => L + (x1 > x0 ? (dMs(p.d) - x0) / (x1 - x0) : (pts.length > 1 ? i / (pts.length - 1) : 0.5)) * (W - L - R);
  const Y = v => T + (1 - (v - yMin) / (yMax - yMin)) * (H - T - B);
  const ticks = [yMin, (yMin + yMax) / 2, yMax].map(v => Math.round(v * 10) / 10);
  const grid = ticks.map(v => `<line class="tr-grid" x1="${L}" x2="${W - R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text class="tr-tick" x="${L - 5}" y="${(Y(v) + 3.5).toFixed(1)}" text-anchor="end">${esc(fmtNum(v))}</text>`).join('');
  // Vạch ngưỡng: nhãn chữ bên phải; hai vạch quá sát nhau thì chỉ ghi nhãn của mức nặng hơn
  let lastLblY = -Infinity;
  const refs = (o.loai === 'CACHDIEN' ? [[ng[0], 'D']] : [[ng[2], 'D'], [ng[1], 'C'], [ng[0], 'B']])
    .filter(([v]) => v !== undefined && v > yMin && v < yMax)
    .map(([v, m]) => {
      const y = Y(v);
      const lbl = y - lastLblY >= 10 ? `<text class="tr-reft" x="${W - R + 9}" y="${(y + 3.5).toFixed(1)}">${m}</text>` : '';
      if (lbl) lastLblY = y;
      return `<line class="tr-ref lv-${m}" x1="${L}" x2="${W - R}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"/>${lbl}`;
    }).join('');
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p, i).toFixed(1)},${Y(p.y).toFixed(1)}`).join('');
  const dots = pts.map((p, i) => `<circle class="tr-dot lv-${esc(p.m || 'A')}${p.so === o.cur ? ' cur' : ''}" cx="${X(p, i).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="${p.so === o.cur ? 5.5 : 4}"/>`).join('');
  const last = pts[pts.length - 1];
  const lx = X(last, pts.length - 1), ly = Y(last.y);
  // Nhãn giá trị cuối đặt bên trái điểm: đường đi lên thì nhãn nằm trên, đi xuống thì nằm dưới (tránh đè lên đường)
  const rising = pts.length < 2 || last.y >= pts[pts.length - 2].y;
  const ey = Math.max(T + 8, Math.min(H - B - 3, rising ? ly - 7 : ly + 14));
  const endLbl = `<text class="tr-end" x="${(lx - 9).toFixed(1)}" y="${ey.toFixed(1)}" text-anchor="end">${esc(fmtNum(last.y))} · ${esc(last.m || '')}</text>`;
  const xl = `<text class="tr-tick" x="${L}" y="${H - 5}">${esc(fmtDM(pts[0].d))}/${pts[0].d.slice(2, 4)}</text><text class="tr-tick" x="${W - R}" y="${H - 5}" text-anchor="end">${esc(fmtDM(last.d))}/${last.d.slice(2, 4)}</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(tp('ddTrend'))}">${grid}${refs}<path class="tr-line" d="${path}"/>${dots}${endLbl}${xl}
    <line class="tr-x" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/></svg><div class="tr-tip" hidden></div>`;
}
/** Chạm / rê trên biểu đồ → đường dóng + ô giá trị của lần đo gần nhất theo trục thời gian */
function bindTrends() {
  $$('.trend[data-trend]').forEach(box => {
    const o = S.trend && S.trend[box.dataset.trend];
    if (!o) return;
    const svg = $('svg', box), tip = $('.tr-tip', box), xl = $('.tr-x', box);
    const dots = $$('.tr-dot', box);
    const show = ev => {
      const rc = svg.getBoundingClientRect();
      const px = (ev.clientX - rc.left) / rc.width * 320;
      let bi0 = 0, best = Infinity;
      dots.forEach((d, i) => { const dx = Math.abs(Number(d.getAttribute('cx')) - px); if (dx < best) { best = dx; bi0 = i; } });
      const p = o.pts[bi0], d = dots[bi0];
      const cx = Number(d.getAttribute('cx'));
      xl.setAttribute('x1', cx); xl.setAttribute('x2', cx); xl.setAttribute('visibility', 'visible');
      tip.innerHTML = `<b>${esc(fmtDate(p.d))}</b> · ${esc(ddXTxt(o.loai, p.y))} ${ddMucPill(p.m, 'sm')}<div class="small muted">${esc(p.so)}</div>`;
      tip.hidden = false;
      const left = cx / 320 * rc.width;
      tip.style.left = Math.max(0, Math.min(rc.width - tip.offsetWidth, left - tip.offsetWidth / 2)) + 'px';
    };
    const hide = () => { tip.hidden = true; xl.setAttribute('visibility', 'hidden'); };
    svg.addEventListener('pointermove', show);
    svg.addEventListener('pointerdown', show);
    svg.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') hide(); });
  });
}

/* ---- Biểu mẫu đo: ghi mới (new) · sửa (edit) ---- */
function ddDefaultChuan(loai, tb) {
  if (loai === 'NHIET') return 'NETA_PT';
  if (loai === 'CACHDIEN') return 'MIN1';
  const kw = Number(tb && tb.CongSuatKW) || 0;
  return !kw ? 'ISO3_2R' : (kw <= 15 ? 'ISO1_I' : (kw <= 300 ? 'ISO3_2R' : 'ISO3_1R'));
}
function viewDdForm(mode, key, loaiArg) {
  if (!S.data) return loadingView();
  let tb, cur = null, loai;
  if (mode === 'new') {
    tb = tbById(key);
    loai = String(loaiArg || '').toUpperCase();
    if (!tb) return { title: 'ddNewTitle', back: 'dd', tab: 'cv', html: `<div class="empty">${ic('search')}${t('tbNotFound', key)}</div>` };
    if (!DD_LOAI.includes(loai)) return { title: 'ddNewTitle', back: 'tb/' + encodeURIComponent(tb.ID), tab: 'cv', html: `<div class="empty">${t('eCode')}</div>` };
    if (tb.TrangThai === 'THANHLY') return { title: 'ddNewTitle', back: 'tb/' + encodeURIComponent(tb.ID), tab: 'cv', html: `<div class="notice warn">${ic('alert')}<div>${t('eRetired')}</div></div>` };
  } else {
    cur = ddBySo(key);
    if (!cur) {
      if (S.online) { setTimeout(() => fetchMissingDD(key), 0); return loadingView(); }
      return { title: 'ddEditTitle', back: 'dd', tab: 'cv', html: `<div class="empty">${t('ddNotFound', key)}</div>` };
    }
    if (!ddCanEdit(cur)) return forbiddenView('dd/' + encodeURIComponent(cur.SoPhieu));
    tb = tbById(cur.IDThietBi) || { ID: cur.IDThietBi, TenMay: '' };
    loai = cur.Loai;
  }
  const fkey = mode + ':' + (cur ? cur.SoPhieu : tb.ID + ':' + loai);
  const last = mode === 'new' ? (ddOf(tb.ID, loai)[0] || null) : null;
  if (!S.ddForm || S.ddForm.key !== fkey) {
    const src = cur || last;
    const chuan = src ? (src.Chuan || 'TUY') : ddDefaultChuan(loai, tb);
    const ng = src ? ddNg(src) : (DD_CHUAN[loai][chuan] || []).slice();
    const blank = p => ({ t: p ? p.t : '' });
    S.ddForm = {
      key: fkey, mode, id: tb.ID, loai, orig: cur ? cur.NgaySua : undefined, so: cur ? cur.SoPhieu : '',
      d: cur ? { TGDo: cur.TGDo, NguoiDo: cur.NguoiDo, NhaThau: cur.NhaThau || '', ThietBiDo: cur.ThietBiDo || '', DieuKien: cur.DieuKien || '',
        DienApThu: cur.DienApThu || '', DeXuat: cur.DeXuat || '', ChuKyThang: cur.ChuKyThang || '', GhiChu: cur.GhiChu || '' }
        : { TGDo: tsNow(), NguoiDo: S.name, NhaThau: last ? last.NhaThau || '' : '', ThietBiDo: last ? last.ThietBiDo || '' : '', DieuKien: '',
          DienApThu: last ? last.DienApThu || '' : (loai === 'CACHDIEN' ? '500' : ''), DeXuat: '', ChuKyThang: last ? last.ChuKyThang || '' : '', GhiChu: '' },
      chuan, ng,
      // Ghi mới: chép tên các điểm đo của lần trước (để so sánh xu hướng đúng điểm)
      pts: cur ? ddPts(cur).map(p => Object.assign({}, p)) : (last ? ddPts(last).map(blank) : [blank(null)])
    };
  }
  const F = S.ddForm, D = F.d;
  const back = cur ? 'dd/' + encodeURIComponent(cur.SoPhieu) : 'tb/' + encodeURIComponent(tb.ID);
  const txt = (f, key, req, attrs, ph) => `<label class="fld" data-fld="${f}"><span class="lb">${t(key)}${req ? ' <b class="req">*</b>' : ''}</span>
    <input data-df="${f}" value="${esc(D[f] || '')}" ${attrs || ''} ${ph ? `placeholder="${esc(tp(ph))}"` : ''}><span class="fe"></span></label>`;
  const area = (f, key, ph) => `<label class="fld" data-fld="${f}"><span class="lb">${t(key)}</span>
    <textarea data-df="${f}" rows="2" maxlength="2000" ${ph ? `placeholder="${esc(tp(ph))}"` : ''}>${esc(D[f] || '')}</textarea><span class="fe"></span></label>`;
  const names = uniqueRecent('NguoiThucHien', [S.name].concat(allDD().slice().sort(ddSortDesc).map(x => x.NguoiDo)));
  return {
    title: cur ? 'ddEditTitle' : 'ddNewTitle', back, tab: 'cv', noPtr: true,
    html: `
      <form id="f-dd" class="form" autocomplete="off" novalidate>
        <section class="card pad slim sc-sumcard dd-${esc(cur ? cur.MucDo : (last ? last.MucDo : 'A'))}">
          <div class="mini-top"><span class="tb-id">${esc(tb.ID)}</span>${tb.MaNhaMay ? `<span class="tb-ma">${esc(tb.MaNhaMay)}</span>` : ''}<span class="sp"></span>${cur ? `<span class="sc-no">${esc(cur.SoPhieu)}</span>` : ''}</div>
          ${bi(tb.TenMay, tb.TenMayZH, 'tb-name')}
          ${ddLoaiBi(loai, 'big')}
          ${last ? `<a class="small link-row" href="#/dd/${encodeURIComponent(last.SoPhieu)}">${t('ddLastWas', fmtDate(last.TGDo), last.MucDo)}</a>` : ''}
        </section>
        <section class="card pad">
          <div class="card-h flat">${ic('gauge')}${t('ddStd')}</div>
          <div class="fld" data-fld="Nguong"><button type="button" class="select" data-act="ddPickChuan">${ddChuanLabel()}${ic('down')}</button><span class="fe"></span></div>
          <div id="dd-ng">${ddNgHtml()}</div>
          ${loai === 'CACHDIEN' ? `<div class="fld" data-fld="DienApThu"><span class="lb">${t('ddVolt')}</span>
            <div class="seg dd-volt">${DD_VOLTS.map(v => `<label><input type="radio" name="dd-v" value="${v}" data-df="DienApThu" ${String(D.DienApThu) === v ? 'checked' : ''}><span>${v}</span></label>`).join('')}</div>
            <span class="fe"></span></div>` : ''}
          <p class="muted small">${t('ddStdHint')}</p>
        </section>
        <section class="card pad ck-card">
          <div class="card-h flat" data-fld="DiemDo">${ic(DD_ICON[loai])}${t('ddPoints')}<span class="sp"></span><span class="muted small" id="dd-sum"></span></div>
          <p class="muted small">${t('ddPtHint_' + loai)}</p>
          <div id="dd-pts">${F.pts.map((p, i) => ddPtForm(p, i)).join('')}</div>
          <button type="button" class="btn block" data-act="ddPtAdd">${ic('plus')}${t('ddPtAdd')}</button>
        </section>
        <section class="card pad">
          <div class="card-h flat">${ic('clock')}${t('btExec')}</div>
          <label class="fld" data-fld="TGDo"><span class="lb">${t('ddTime')} <b class="req">*</b></span>
            <input type="datetime-local" data-df="TGDo" value="${esc(tsToInput(D.TGDo))}"><span class="fe"></span></label>
          ${txt('NguoiDo', 'ddNguoiDo', true, 'maxlength="150" list="dl-ng"')}
          ${txt('NhaThau', 'ddDonVi', false, 'maxlength="150" list="dl-nt"', 'ddDonViPh')}
          ${txt('ThietBiDo', 'ddThietBiDo', false, 'maxlength="150"', 'ddThietBiDoPh_' + loai)}
          ${txt('DieuKien', 'ddDieuKien', false, 'maxlength="300"', 'ddDieuKienPh')}
        </section>
        <section class="card pad">
          <div class="card-h flat">${ic('wrench')}${t('ddConclusion')}</div>
          ${area('DeXuat', 'ddDeXuat', 'ddDeXuatPh')}
          <label class="fld" data-fld="ChuKyThang"><span class="lb">${t('ddChuKy')}</span>
            <div class="ck-num"><input data-df="ChuKyThang" value="${esc(D.ChuKyThang || '')}" inputmode="numeric" maxlength="3" placeholder="${esc(tp('ddChuKyPh'))}"><span class="ck-unit">${t('monthsUnit')}</span></div>
            <span class="fe"></span><span class="muted small">${t('ddChuKyHint')}</span></label>
          ${area('GhiChu', 'fGhiChu')}
        </section>
        ${datalist('dl-ng', names)}${datalist('dl-nt', hdNames())}
        <div class="form-actions">
          <a class="btn" href="#/${back}">${t('cancel')}</a>
          <button class="btn primary" type="submit">${ic('check')}${t('save')}</button>
        </div>
      </form>`,
    after: () => {
      const form = $('#f-dd');
      form.addEventListener('submit', saveDdForm);
      form.addEventListener('input', e => { clearFieldErr(e); ddFormInput(e.target); });
      form.addEventListener('change', e => ddFormInput(e.target));
      ddSum();
    }
  };
}
function ddChuanLabel() {
  const F = S.ddForm;
  const x = ddChuanTr(F.loai, F.chuan);
  return `<span class="grow">${bi(x.vi, x.zh)}</span>`;
}
function ddNgHtml() {
  const F = S.ddForm;
  if (F.chuan !== 'TUY') return `<div class="small muted dd-zones">${ddZonesHtml(F.loai, F.ng)}</div>`;
  if (F.loai === 'CACHDIEN') {
    return `<label class="fld"><span class="lb">${t('ddMinMOhm')}</span><div class="ck-num"><input data-ng="0" value="${esc(String(F.ng[0] || '').replace('.', ','))}" inputmode="decimal" maxlength="10"><span class="ck-unit">MΩ</span></div></label>`;
  }
  return `<div class="grid3 dd-ng3">${['A/B', 'B/C', 'C/D'].map((lb, i) => `<label class="fld"><span class="lb">${esc(lb)}</span>
    <input data-ng="${i}" value="${esc(String(F.ng[i] || '').replace('.', ','))}" inputmode="decimal" maxlength="10"></label>`).join('')}</div>
    <div class="small muted">${t(F.loai === 'NHIET' ? 'ddCustomNhiet' : 'ddCustomRung')}</div>`;
}
/** Ô nhập một điểm đo */
function ddPtForm(p, i) {
  const F = S.ddForm, L = F.loai;
  const inp = (k, lb, ph) => `<label class="fld"><span class="lb">${lb}</span><input data-pk="${k}" data-i="${i}" value="${esc(String(p[k] === undefined ? '' : p[k]).replace('.', ','))}" inputmode="decimal" maxlength="12" ${ph ? `placeholder="${esc(ph)}"` : ''}></label>`;
  let vals;
  if (L === 'NHIET') vals = `<div class="grid2">${inp('td', t('ddTdo'))}${inp('tr', t('ddTref'))}</div>`;
  else if (L === 'RUNG') vals = `<div class="grid3 eq">${inp('h', t('ddH'), 'mm/s')}${inp('v', t('ddV'), 'mm/s')}${inp('a', t('ddA'), 'mm/s')}</div>`;
  else {
    const more = ['l12', 'l23', 'l31', 'pi'].some(k => p[k] !== undefined && p[k] !== '');
    vals = `<div class="grid3 eq">${inp('l1', 'L1–E', 'MΩ')}${inp('l2', 'L2–E', 'MΩ')}${inp('l3', 'L3–E', 'MΩ')}</div>
      <details class="dd-more"${more ? ' open' : ''}><summary>${t('ddMoreIR')}</summary>
        <div class="grid3 eq">${inp('l12', 'L1–L2', 'MΩ')}${inp('l23', 'L2–L3', 'MΩ')}${inp('l31', 'L3–L1', 'MΩ')}</div>
        <div class="grid3 eq">${inp('pi', 'PI', 'R10/R1')}</div></details>`;
  }
  const c = ddCalc(L, F.ng, p);
  return `<div class="ck-item dd-ptf${c && c.m ? ' dd-' + c.m : ''}" data-fld="DiemDo:${i + 1}">
    <div class="ck-head"><span class="mau-no">${i + 1}</span>
      <input class="grow dd-ptname" data-pk="t" data-i="${i}" value="${esc(p.t || '')}" maxlength="150" placeholder="${esc(tp('ddPtNamePh_' + L))}">
      <button type="button" class="hbtn sm danger" data-act="ddPtDel" data-i="${i}" aria-label="${esc(tp('delete'))}">${ic('trash')}</button></div>
    ${vals}
    <div class="dd-ptres" id="ddr-${i}">${ddResHtml(c)}</div>
    <input class="dd-ptnote" data-pk="g" data-i="${i}" value="${esc(p.g || '')}" maxlength="300" placeholder="${esc(tp('ckNotePh'))}">
    <span class="fe"></span>
  </div>`;
}
function ddResHtml(c) {
  const F = S.ddForm;
  if (!c) return `<span class="muted small">${t('ddEnterVals')}</span>`;
  if (c.err) return `<span class="bad-n small">${t(c.err)}</span>`;
  return `<b>${esc(ddXTxt(F.loai, c.x))}</b>${ddMucPill(c.m)}`;
}
function ddSum() {
  const F = S.ddForm, el = $('#dd-sum');
  if (!F || !el) return;
  const ms = F.pts.map(p => ddCalc(F.loai, F.ng, p)).filter(c => c && c.m).map(c => c.m);
  const worst = ms.reduce((w, m) => (DD_MUC.indexOf(m) > DD_MUC.indexOf(w) ? m : w), ms.length ? 'A' : '');
  el.innerHTML = ms.length ? `${t('ddNPoints', F.pts.length)} · ${ddMucPill(worst, 'sm')}` : t('ddNPoints', F.pts.length);
}
function ddPtRefresh(i) {
  const F = S.ddForm;
  const box = $(`#f-dd [data-fld="DiemDo:${i + 1}"]`);
  if (!box || !F.pts[i]) return;
  const c = ddCalc(F.loai, F.ng, F.pts[i]);
  $('#ddr-' + i).innerHTML = ddResHtml(c);
  DD_MUC.forEach(m => box.classList.toggle('dd-' + m, !!(c && c.m === m)));
}
function ddFormInput(el) {
  const F = S.ddForm;
  if (!F) return;
  if (el.dataset.df) { F.d[el.dataset.df] = el.type === 'datetime-local' ? inputToTs(el.value) : el.value; return; }
  if (el.dataset.ng !== undefined) {
    F.ng[Number(el.dataset.ng)] = String(el.value).trim().replace(',', '.');
    F.pts.forEach((p, i) => ddPtRefresh(i));
    ddSum();
    return;
  }
  if (el.dataset.pk) {
    const p = F.pts[Number(el.dataset.i)];
    if (!p) return;
    p[el.dataset.pk] = el.value;
    if (el.dataset.pk !== 't' && el.dataset.pk !== 'g') { ddPtRefresh(Number(el.dataset.i)); ddSum(); }
  }
}
const DD_FIELD_KEYS = { TGDo: 'ddTime', NguoiDo: 'ddNguoiDo', Nguong: 'ddStd', DiemDo: 'ddPoints', ChuKyThang: 'ddChuKy', DienApThu: 'ddVolt', IDThietBi: 'scMay', Loai: 'ddType' };
function ddFieldName(f, x) { const b = DD_FIELD_KEYS[f] ? tr(DD_FIELD_KEYS[f]) : { vi: f, zh: f }; return x && x.line ? { vi: `${b.vi} ${x.line}`, zh: `${b.zh} ${x.line}` } : b; }

async function saveDdForm(ev) {
  ev.preventDefault();
  if (!needOnline()) return;
  const form = ev.target;
  const F = S.ddForm;
  if (!F) return;
  const D = F.d;
  $$('.has-err', form).forEach(el => { el.classList.remove('has-err'); const fe = $('.fe', el); if (fe) fe.innerHTML = ''; });
  let bad = false;
  const err = (f, k) => { scFieldErr(form, f, k); bad = true; };
  if (!D.TGDo) err('TGDo', 'eRequired');
  if (!String(D.NguoiDo || '').trim()) err('NguoiDo', 'eRequired');
  if (String(D.ChuKyThang || '').trim() && (!/^\d{1,3}$/.test(String(D.ChuKyThang).trim()) || Number(D.ChuKyThang) < 1 || Number(D.ChuKyThang) > 120)) err('ChuKyThang', 'eNumber');
  if (F.chuan === 'TUY') {
    const need = F.loai === 'CACHDIEN' ? 1 : 3;
    const v = F.ng.slice(0, need).map(x => ddNum(x));
    if (v.length < need || v.some(x => x === null || x === '' || Number(x) <= 0) || (need === 3 && !(Number(v[0]) < Number(v[1]) && Number(v[1]) < Number(v[2])))) err('Nguong', 'ddNgBad');
  }
  if (!F.pts.length) { toast('ddNeedPoint', 'err'); bad = true; }
  F.pts.forEach((p, i) => {
    const c = ddCalc(F.loai, F.ng, p);
    if (!String(p.t || '').trim()) err('DiemDo:' + (i + 1), 'ddPtNameReq');
    else if (!c) err('DiemDo:' + (i + 1), 'ddEnterVals');
    else if (c.err) err('DiemDo:' + (i + 1), 'eNumber');
  });
  if (bad) { toast('eInvalid', 'err'); const first = $('.has-err', form); if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
  const dd = {};
  ['TGDo', 'NguoiDo', 'NhaThau', 'ThietBiDo', 'DieuKien', 'DienApThu', 'DeXuat', 'ChuKyThang', 'GhiChu'].forEach(f => { dd[f] = String(D[f] === undefined || D[f] === null ? '' : D[f]).trim(); });
  dd.Chuan = F.chuan;
  if (F.chuan === 'TUY') dd.Nguong = F.ng.slice(0, F.loai === 'CACHDIEN' ? 1 : 3).map(x => ddNum(x));
  const keys = F.loai === 'NHIET' ? ['td', 'tr'] : DD_KEYS[F.loai].concat(F.loai === 'CACHDIEN' ? ['pi'] : []);
  const diem = F.pts.map(p => {
    const o = { t: String(p.t || '').trim(), g: String(p.g || '').trim() };
    keys.forEach(k => { const v = String(p[k] === undefined ? '' : p[k]).trim(); if (v !== '') o[k] = F.loai === 'CACHDIEN' && k !== 'pi' ? irNum(v) : ddNum(v); });
    return o;
  });
  const payload = F.mode === 'new' ? { op: 'create', dd: Object.assign({ IDThietBi: F.id, Loai: F.loai }, dd), diem }
    : { op: 'capnhat', so: F.so, ngaySuaCu: F.orig || '', dd, diem };
  busy(form, true);
  try {
    const r = await api('ddAction', payload);
    mergeDD([r.dd]);
    S.ddForm = null;
    const so = r.dd.SoPhieu;
    const warn = r.dd.MucDo === 'C' || r.dd.MucDo === 'D';
    toast(r.unchanged ? tr('scNoChange') : (F.mode === 'new' ? tr('ddSaved', [so, r.dd.MucDo]) : tr('saved')), warn ? 'warn' : 'ok');
    const detail = '#/dd/' + encodeURIComponent(so);
    if (F.mode === 'edit' && S.prevHash === detail) history.back(); else location.replace(detail);
    if (F.mode === 'new' && warn) setTimeout(() => offerScFromDd(so), 400);
  } catch (e) {
    if (e.code === 'INVALID' && e.extra && e.extra.errors) showErrs(form, e.extra.errors, ddFieldName);
    else await ddHandleErr(e);
  } finally { if (form.isConnected) busy(form, false); }
}
async function ddHandleErr(e) {
  if (e.code === 'CONFLICT') {
    const ex = e.extra || {};
    closeSheet();
    if (await confirmDlg('eConflict', tr('scConflictMsg', [ex.nguoiSua || '?', fmtTime(ex.ngaySua)]), { ok: 'reload' })) {
      S.ddForm = null;
      await refresh(true);
      const p = route();
      if (p[0] === 'dd' && p[1] && p[2]) location.replace('#/dd/' + encodeURIComponent(p[1])); else render();
    }
  } else if (e.code === 'FORBIDDEN' && e.extra && e.extra.hours) toast(tr('ktEditWindow', [e.extra.hours]), 'err');
  else if (e.code !== 'AUTH') toast(errText(e), 'err');
}
async function offerScFromDd(so) {
  const dd = ddBySo(so);
  if (!dd) return;
  if (await confirmDlg(tr('ddOfferScQ', [dd.SoDiemCanhBao]), 'ddOfferScMsg', { ok: 'btMakeSc' })) {
    location.hash = '#/sc-moi/' + encodeURIComponent(dd.IDThietBi) + '/' + encodeURIComponent(so);
  }
}
/** Mô tả phiếu sửa chữa điền sẵn từ các điểm đo mức C/D */
function scMoTaFromDd(dd) {
  const bad = ddPts(dd).filter(p => p.m === 'C' || p.m === 'D');
  const head = `[${dd.SoPhieu}] ${tr('ddL' + dd.Loai).vi} – ${tr('ddM' + dd.MucDo).vi}`;
  return head + ':\n' + bad.map(p => `- ${p.t}: ${ddXTxt(dd.Loai, p.x)} (${p.m})${p.g ? ` – ${p.g}` : ''}`).join('\n') + (dd.DeXuat ? `\n${tr('ddDeXuat').vi}: ${dd.DeXuat}` : '');
}
async function ddDelete(so) {
  const dd = ddBySo(so);
  if (!dd || !needOnline()) return;
  if (!(await confirmDlg(tr('ddDeleteQ', [so]), 'ktDeleteMsg', { ok: 'delete', danger: true }))) return;
  try {
    await api('ddAction', { op: 'xoa', so, ngaySuaCu: dd.NgaySua || '' });
    removeDD(so);
    toast(tr('scDeleted', [so]), 'ok');
    location.replace('#/dd');
  } catch (e) { await ddHandleErr(e); }
}
/** Chọn máy (nếu chưa có) rồi loại đo → mở form ghi phiếu đo */
async function ddNewFlow(id) {
  if (!id) {
    id = await picker({ title: 'scMay', items: tbPickItems() });
    if (!id) return;
  }
  const items = DD_LOAI.map(l => {
    const x = tr('ddL' + l), last = ddOf(id, l)[0];
    return { v: l, vi: x.vi, zh: x.zh, sub: last ? tp('ddLastWas', fmtDate(last.TGDo), last.MucDo) : '' };
  });
  const l = await picker({ title: 'ddType', items });
  if (!l) return;
  location.hash = '#/dd-moi/' + encodeURIComponent(id) + '/' + l;
}

/* ---------------------- RCA / 5 Why + hành động khắc phục ---------------------- */
/* RC-yyyy-nnnn nối với phiếu sửa chữa (SoPhieu + PhieuLienQuan). Trạng thái hiển thị (từ dữ liệu):
 * PHANTICH (chưa có nguyên nhân gốc) → KHACPHUC (còn hành động chưa xong) → CHOHL (chờ quản lý kiểm tra hiệu lực)
 * → DONG. HUY = đã hủy. */
const RCA_LYDO = ['LON', 'LAPLAI', 'ANTOANSP', 'ATLD', 'KHAC'];
const RCA_6M = ['NGUOI', 'MAY', 'VATLIEU', 'PHUONGPHAP', 'MOITRUONG', 'DOLUONG'];
const HDK_LOAI = ['TAMTHOI', 'KHACPHUC', 'PHONGNGUA'];
const RCA_ORDER = ['PHANTICH', 'KHACPHUC', 'CHOHL', 'DONG', 'HUY'];
const RCA_TABS = [{ id: 'MO', key: 'rcaTabOpen' }, { id: 'HD', key: 'rcaTabActs' }, { id: 'GY', key: 'rcaTabSuggest' }, { id: 'DONG', key: 'rcaTabClosed' }];

function allRCA() { return (S.data && S.data.rca) || []; }
function allHDK() { return (S.data && S.data.hanhDong) || []; }
function rcaBySo(so) { const k = String(so || '').toUpperCase(); return allRCA().find(x => String(x.SoRCA).toUpperCase() === k) || null; }
function hdkOf(so) { const k = String(so || '').toUpperCase(); return allHDK().filter(a => String(a.SoRCA).toUpperCase() === k).sort((a, b) => (Number(a.STT) || 0) - (Number(b.STT) || 0)); }
function rcaSortDesc(a, b) { return String(b.NgayTao || '').localeCompare(String(a.NgayTao || '')) || String(b.SoRCA).localeCompare(String(a.SoRCA)); }
function mergeRCA(rca, acts) {
  if (!S.data) return;
  const arr = S.data.rca || (S.data.rca = []);
  const i = arr.findIndex(x => x.SoRCA === rca.SoRCA);
  if (i >= 0) arr[i] = rca; else arr.push(rca);
  if (acts) S.data.hanhDong = allHDK().filter(a => a.SoRCA !== rca.SoRCA).concat(acts);
  saveCache();
}
function removeRCA(so) {
  if (!S.data) return;
  S.data.rca = allRCA().filter(x => x.SoRCA !== so);
  S.data.hanhDong = allHDK().filter(a => a.SoRCA !== so);
  saveCache();
}
function rcaScList(r) { return [r.SoPhieu].concat(String(r.PhieuLienQuan || '').split(',')).map(s => String(s || '').trim()).filter(Boolean); }
function rcaOfSc(so) { const k = String(so || '').toUpperCase(); return allRCA().filter(r => rcaScList(r).some(s => s.toUpperCase() === k)).sort((a, b) => (a.TrangThai === 'HUY') - (b.TrangThai === 'HUY') || rcaSortDesc(a, b)); }
function rcaOfTb(id) { const k = String(id).toUpperCase(); return allRCA().filter(r => String(r.IDThietBi).toUpperCase() === k).sort(rcaSortDesc); }
function hdkLate(a, today) { return !a.NgayXong && a.Han && a.Han < (today || dToday()); }
/** { st, acts, done, late, hlLate } */
function rcaStatus(r, today) {
  today = today || dToday();
  const acts = hdkOf(r.SoRCA);
  const done = acts.filter(a => a.NgayXong).length;
  const late = r.TrangThai === 'MO' ? acts.filter(a => hdkLate(a, today)).length : 0;
  let st;
  if (r.TrangThai === 'HUY' || r.TrangThai === 'DONG') st = r.TrangThai;
  else if (!String(r.NguyenNhanGoc || '').trim()) st = 'PHANTICH';
  else if (!acts.length || done < acts.length) st = 'KHACPHUC';
  else st = 'CHOHL';
  const hlLate = st === 'CHOHL' && r.HanKiemTraHL && r.HanKiemTraHL < today;
  return { st, acts, done, late, hlLate };
}
function rcaOpenStats() {
  const today = dToday();
  let open = 0, late = 0;
  allRCA().forEach(r => { if (r.TrangThai !== 'MO') return; open++; late += rcaStatus(r, today).late; });
  return { open, late };
}
function rcaPill(st) { return `<span class="pill rc-${esc(st)}">${t('rc' + st)}</span>`; }
function rcaJson(s, d) { return jparse(s, d); }
/**
 * Gợi ý RCA cho phiếu sửa chữa: máy hỏng ≥ RCA_LapLai lần trong RCA_SoNgay ngày (tính tới phiếu này)
 * hoặc phiếu này dừng máy ≥ RCA_GioDung giờ. → { rep: số lần, win: [phiếu trong khoảng], long: phút } | null
 */
function rcaSuggest(sc) {
  if (!sc || sc.TrangThaiPhieu === 'HUY') return null;
  const lap = cfgInt('RCA_LapLai', 3), ngay = cfgInt('RCA_SoNgay', 90), gio = cfgInt('RCA_GioDung', 8);
  const t1 = String(sc.TGBao || '').slice(0, 10), t0 = dAdd(t1, -ngay, 'NGAY');
  const win = scOfTb(sc.IDThietBi).filter(x => x.TrangThaiPhieu !== 'HUY' && String(x.TGBao).slice(0, 10) > t0 && String(x.TGBao) <= String(sc.TGBao));
  const d = scDownMin(sc);
  const long = d && d.min >= gio * 60 ? d.min : 0;
  const rep = win.length >= lap ? win.length : 0;
  return rep || long ? { rep, win, long, lap, ngay, gio } : null;
}
function rcaSugTags(sg) {
  const out = [];
  if (sg.rep) out.push(`<span class="tag warn">${ic('repeat')}${t('rcaSugRep', sg.rep, sg.ngay)}</span>`);
  if (sg.long) out.push(`<span class="tag bad">${ic('clock')}${t('rcaSugLong', fmtDur(sg.long))}</span>`);
  return out.join('');
}
/** Phiếu sửa chữa nên phân tích RCA (chưa có RCA nào phủ) — mỗi máy một phiếu mới nhất */
function rcaCandidates() {
  const covered = new Set();
  allRCA().forEach(r => { if (r.TrangThai !== 'HUY') rcaScList(r).forEach(s => covered.add(s.toUpperCase())); });
  const from = dAdd(dToday(), -cfgInt('RCA_SoNgay', 90), 'NGAY');
  const byTb = new Map();
  allSC().filter(x => x.TrangThaiPhieu !== 'HUY' && String(x.TGBao).slice(0, 10) >= from).sort(scSortDesc).forEach(sc => {
    if (byTb.has(sc.IDThietBi) || covered.has(String(sc.SoPhieu).toUpperCase())) return;
    const sg = rcaSuggest(sc);
    if (!sg) return;
    if (sg.rep && !sg.long && sg.win.some(x => covered.has(String(x.SoPhieu).toUpperCase()))) return;
    byTb.set(sc.IDThietBi, { sc, sg });
  });
  return [...byTb.values()];
}

/* ---- Trang máy ---- */
function tbRcaSection(tb) {
  const list = rcaOfTb(tb.ID);
  if (!list.length) return '';
  return `<section class="card">
    <div class="card-h">${ic('target')}${t('rcaShort')}<span class="count">${list.length}</span></div>
    <div class="mini-list">${list.slice(0, 20).map(r => rcaMini(r, false)).join('')}</div>
  </section>`;
}
function rcaMini(r, withTb) {
  const s = rcaStatus(r);
  const tb = withTb ? tbById(r.IDThietBi) : null;
  return `<a class="mini rc-${esc(s.st)}" href="#/rca/${encodeURIComponent(r.SoRCA)}">
    <div class="mini-main">
      <div class="mini-top"><span class="sc-no">${esc(r.SoRCA)}</span><span class="muted small">${esc(fmtDate(r.NgayPhanTich || r.NgayTao))}</span></div>
      ${tb ? `<div class="sc-tbline"><span class="tb-id">${esc(tb.ID)}</span> <span class="tb-name">${esc(tb.TenMay)}</span></div>` : ''}
      <div class="sc-desc one">${esc(r.TieuDe)}</div>
      <div class="sc-meta">${s.acts.length ? `<span class="muted small">${t('rcaActProg', s.done, s.acts.length)}</span>` : ''}${s.late ? `<span class="tag bad">${t('rcaLateN', s.late)}</span>` : ''}</div>
    </div>
    ${rcaPill(s.st)}
  </a>`;
}

/* ---- Danh sách ---- */
function rcaMatch(r) {
  const tb = tbById(r.IDThietBi);
  return tbMatchF(tb || { ID: r.IDThietBi }, S.rcaf, [r.SoRCA, r.SoPhieu, r.TieuDe, r.MoTa, r.NguyenNhanGoc, r.NhomPhanTich]);
}
function rcaListData(tab) {
  const today = dToday();
  if (tab === 'MO') return allRCA().filter(r => r.TrangThai === 'MO' && rcaMatch(r)).map(r => ({ r, s: rcaStatus(r, today) }))
    .sort((a, b) => (b.s.late - a.s.late) || RCA_ORDER.indexOf(a.s.st) - RCA_ORDER.indexOf(b.s.st) || rcaSortDesc(a.r, b.r));
  if (tab === 'DONG') return allRCA().filter(r => (r.TrangThai === 'DONG' || r.TrangThai === 'HUY') && rcaMatch(r)).map(r => ({ r, s: rcaStatus(r, today) })).sort((a, b) => rcaSortDesc(a.r, b.r));
  if (tab === 'HD') {
    const out = [];
    allRCA().forEach(r => { if (r.TrangThai === 'MO' && rcaMatch(r)) hdkOf(r.SoRCA).forEach(a => { if (!a.NgayXong) out.push({ r, a }); }); });
    return out.sort((x, y) => String(x.a.Han || '9').localeCompare(String(y.a.Han || '9')) || rcaSortDesc(x.r, y.r));
  }
  return rcaCandidates().filter(x => tbMatchF(tbById(x.sc.IDThietBi) || { ID: x.sc.IDThietBi }, S.rcaf, [x.sc.SoPhieu, x.sc.MoTa]));
}
function viewRcaList() {
  if (!S.data) return loadingView();
  const f = S.rcaf;
  const st = rcaOpenStats();
  const nSug = rcaCandidates().length;
  const nActs = allRCA().filter(r => r.TrangThai === 'MO').reduce((n, r) => n + hdkOf(r.SoRCA).filter(a => !a.NgayXong).length, 0);
  return {
    live: true, restoreScroll: true, title: 'rca', back: 'cv', tab: 'cv',
    html: `
      <div class="toolbar sticky">
        <div class="seg sc-tabs">${RCA_TABS.map(x => {
          const lb = tr(x.key);
          const n = { MO: st.open, HD: st.late || nActs, GY: nSug, DONG: 0 }[x.id];
          const cls = { MO: 'rc-KHACPHUC', HD: st.late ? 'kh-QUAHAN' : 'rc-KHACPHUC', GY: 'kh-DENHAN' }[x.id];
          return `<a data-act="rcaTab" data-t="${x.id}" class="${x.id === f.tab ? 'on' : ''}">${bi(lb.vi, lb.zh)}${n ? `<span class="tcount ${cls}">${n}</span>` : ''}</a>`;
        }).join('')}</div>
        <div class="search">${ic('search')}<input type="search" id="rca-q" value="${esc(f.q)}" placeholder="${esc(tp('rcaSearch'))}" autocomplete="off"></div>
        <div class="chips">
          <button class="chip${f.kv ? ' on' : ''}" data-act="rcaFilter" data-k="kv">${ic('map')}${f.kv ? dmBi('KHUVUC', f.kv) : t('allAreas')}</button>
          <button class="chip${f.nhom ? ' on' : ''}" data-act="rcaFilter" data-k="nhom">${ic('device')}${f.nhom ? dmBi('NHOMTB', f.nhom) : t('allGroups')}</button>
          ${isQL() ? `<button class="chip" data-act="nguongSettings">${ic('gear')}${t('rcaSugSettings')}</button>` : ''}
        </div>
      </div>
      <div class="list-bar"><span id="rca-count" class="muted"></span><span class="sp"></span>
        <button class="link" data-act="rcaCsv">${t('exportCsv')}</button></div>
      <div id="rca-list" class="tb-list"></div>
      ${f.tab === 'GY' ? `<p class="muted small">${t('rcaSugHint', cfgInt('RCA_LapLai', 3), cfgInt('RCA_SoNgay', 90), cfgInt('RCA_GioDung', 8))}</p>` : ''}
      <a class="fab" href="#/rca-moi" aria-label="${esc(tp('rcaNew'))}">${ic('plus')}</a>`,
    after: () => {
      drawRcaList();
      $('#rca-q').addEventListener('input', debounce(e => { S.rcaf.q = e.target.value; drawRcaList(); }, 150));
    }
  };
}
function drawRcaList() {
  const box = $('#rca-list');
  if (!box) return;
  const tab = S.rcaf.tab;
  const list = rcaListData(tab);
  const today = dToday();
  $('#rca-count').innerHTML = tab === 'HD' ? t('rcaNActs', list.length) : (tab === 'GY' ? t('scNTickets', list.length) : t('rcaN', list.length));
  box.classList.toggle('bare', !list.length);
  const filtered = S.rcaf.q || S.rcaf.kv || S.rcaf.nhom;
  if (!list.length) {
    const ok = !filtered && (tab === 'HD' || tab === 'GY' || (tab === 'MO' && allRCA().length));
    box.innerHTML = `<div class="empty${ok ? ' ok' : ''}">${ic(ok ? 'checkCircle' : 'target')}${filtered ? t('noResult')
      : t({ MO: allRCA().length ? 'rcaNoOpen' : 'rcaNone', HD: 'rcaNoActs', GY: 'rcaNoSug', DONG: 'rcaNoClosed' }[tab])}</div>`;
    return;
  }
  if (tab === 'HD') {
    box.innerHTML = list.slice(0, 300).map(({ r, a }) => {
      const late = hdkLate(a, today);
      const tb = tbById(r.IDThietBi);
      return `<a class="sc-item ${late ? 'kh-QUAHAN' : 'rc-KHACPHUC'}" href="#/rca/${encodeURIComponent(r.SoRCA)}">
        <div class="tb-top">${hdkTag(a.Loai)}<span class="sp"></span>${a.Han ? hdkDueHtml(a, today) : `<span class="muted small">${t('rcaNoDeadline')}</span>`}</div>
        <div class="hdk-text">${esc(a.NoiDung)}</div>
        <div class="sc-meta"><span class="sc-no">${esc(r.SoRCA)}</span><span class="muted small ell">${esc(r.IDThietBi)} ${esc(tb ? tb.TenMay : '')}</span>
          <span class="sp"></span>${a.PhuTrach ? `<span class="small">${ic('user')} ${esc(a.PhuTrach)}</span>` : ''}</div>
      </a>`;
    }).join('');
    return;
  }
  if (tab === 'GY') {
    box.innerHTML = list.map(({ sc, sg }) => `<div class="sc-item rc-sug">
      <a class="rc-sug-main" href="#/sc/${encodeURIComponent(sc.SoPhieu)}">
        <div class="tb-top"><span class="sc-no">${esc(sc.SoPhieu)}</span>${scPill(sc.TrangThaiPhieu)}<span class="sp"></span><span class="muted small">${esc(fmtShort(sc.TGBao))}</span></div>
        ${tbLine(sc.IDThietBi)}
        <div class="sc-desc one">${esc(sc.MoTa)}</div>
      </a>
      <div class="sc-meta">${rcaSugTags(sg)}<span class="sp"></span><a class="btn sm primary" href="#/rca-moi/${encodeURIComponent(sc.SoPhieu)}">${ic('target')}${t('rcaDo')}</a></div>
    </div>`).join('');
    return;
  }
  box.innerHTML = list.slice(0, 300).map(({ r, s }) => {
    const tb = tbById(r.IDThietBi);
    return `<a class="sc-item rc-${esc(s.st)}" href="#/rca/${encodeURIComponent(r.SoRCA)}">
      <div class="tb-top"><span class="sc-no">${esc(r.SoRCA)}</span>${rcaPill(s.st)}<span class="sp"></span><span class="muted small">${esc(fmtDate(r.NgayPhanTich || r.NgayTao))}</span></div>
      <div class="sc-tbline"><span class="tb-id">${esc(r.IDThietBi)}</span> ${tb ? bi(tb.TenMay, tb.TenMayZH, 'tb-name') : ''}</div>
      <div class="sc-desc">${esc(r.TieuDe)}</div>
      <div class="sc-meta">${r.SoPhieu ? `<span class="sc-chip">${esc(r.SoPhieu)}</span>` : ''}${s.acts.length ? `<span class="muted small">${t('rcaActProg', s.done, s.acts.length)}</span>` : ''}
        ${s.late ? `<span class="tag bad">${t('rcaLateN', s.late)}</span>` : ''}${s.hlLate ? `<span class="tag warn">${t('rcaHlLate')}</span>` : ''}</div>
    </a>`;
  }).join('');
}
function hdkTag(l) { return `<span class="tag hdk-${esc(l)}">${t('hdk' + l)}</span>`; }
function hdkDueHtml(a, today) {
  if (a.NgayXong) return `<span class="due kh-CHUADEN">${ic('check')}${t('rcaDoneOn', fmtDate(a.NgayXong))}</span>`;
  const d = dDiff(today || dToday(), a.Han);
  const x = d < 0 ? tr('dueLate', [-d]) : (d === 0 ? tr('dueToday') : (d === 1 ? tr('dueTomorrow') : tr('dueIn', [d])));
  return `<span class="due kh-${d < 0 ? 'QUAHAN' : (d <= 7 ? 'DENHAN' : 'CHUADEN')}">${ic('calendar')}${bi(`${x.vi} · ${fmtDate(a.Han)}`, x.zh)}</span>`;
}
function exportRcaCsv() {
  const head = csvHead([['', 'Số RCA', '分析编号'], ['', 'Trạng thái', '状态'], ['', 'ID', ''], ['', 'Tên máy', '设备名称'], ['', 'Phiếu sửa chữa', '维修单'],
    ['', 'Phiếu liên quan', '相关维修单'], ['', 'Sự cố', '故障'], ['', 'Lý do phân tích', '分析原因'], ['', 'Nhóm phân tích', '分析小组'], ['', 'Ngày phân tích', '分析日期'],
    ['', 'Tại sao 1', '为什么1'], ['', 'Tại sao 2', '为什么2'], ['', 'Tại sao 3', '为什么3'], ['', 'Tại sao 4', '为什么4'], ['', 'Tại sao 5', '为什么5'],
    ['', 'Nguyên nhân gốc', '根本原因'], ['', 'Nhóm 6M', '6M类别'], ['', 'STT', '序号'], ['', 'Loại hành động', '措施类型'], ['', 'Hành động', '措施'],
    ['', 'Phụ trách', '责任人'], ['', 'Hạn', '期限'], ['', 'Ngày xong', '完成日期'], ['', 'Kết quả', '结果'], ['', 'Hiệu lực', '有效性'], ['', 'Ngày kiểm tra', '验证日期']]);
  const rows = [head];
  const recs = S.rcaf.tab === 'DONG' ? rcaListData('DONG').map(x => x.r) : allRCA().filter(rcaMatch).sort(rcaSortDesc);
  recs.forEach(r => {
    const s = rcaStatus(r), tb = tbById(r.IDThietBi), why = rcaJson(r.Why, []);
    const base = [r.SoRCA, tr('rc' + s.st).vi, r.IDThietBi, tb ? tb.TenMay : '', r.SoPhieu, r.PhieuLienQuan, r.TieuDe,
      String(r.LyDo || '').split(',').filter(Boolean).map(x => tr('rcaLD' + x).vi).join('; '), r.NhomPhanTich, r.NgayPhanTich,
      why[0] || '', why[1] || '', why[2] || '', why[3] || '', why[4] || '', r.NguyenNhanGoc, r.NhomNguyenNhan ? tr('m6' + r.NhomNguyenNhan).vi : ''];
    const tail = [r.KetQuaHL ? tr('rcaHL' + r.KetQuaHL).vi : '', r.TGKiemTraHL];
    if (!s.acts.length) rows.push(base.concat(['', '', '', '', '', '', ''], tail));
    s.acts.forEach(a => rows.push(base.concat([a.STT, tr('hdk' + a.Loai).vi, a.NoiDung, a.PhuTrach, a.Han, a.NgayXong, a.KetQua], tail)));
  });
  downloadCsv(`rca_${stamp()}.csv`, rows);
}

/* ---- Chi tiết ---- */
VIEWS.rca = p => {
  if (p[1] && p[2] === 'sua') return viewRcaForm('edit', p[1]);
  if (p[1]) return viewRcaDetail(p[1]);
  return viewRcaList();
};
VIEWS['rca-moi'] = p => viewRcaForm('new', p[1] || '');

function viewRcaDetail(so) {
  if (!S.data) return loadingView();
  const r = rcaBySo(so);
  if (!r) return { title: 'rcaDetail', back: 'rca', tab: 'cv', html: `<div class="empty">${ic('search')}${t('rcaNotFound', so)}</div>` };
  const s = rcaStatus(r);
  const ql = isQL();
  const enc = encodeURIComponent(r.SoRCA);
  const today = dToday();
  const why = rcaJson(r.Why, []);
  const m6 = rcaJson(r.SauM, {});
  const scMain = r.SoPhieu ? scBySo(r.SoPhieu) : null;
  const rel = String(r.PhieuLienQuan || '').split(',').filter(Boolean).map(x => scBySo(x) || { SoPhieu: x, missing: true });
  const since = r.NgayPhanTich || String(r.NgayTao).slice(0, 10);
  const linked = new Set(rcaScList(r).map(x => x.toUpperCase()));
  const after = scOfTb(r.IDThietBi).filter(x => x.TrangThaiPhieu !== 'HUY' && String(x.TGBao).slice(0, 10) > since && !linked.has(String(x.SoPhieu).toUpperCase()));
  const canEdit = ql || r.TrangThai === 'MO';
  const kv = (key, val, raw) => (val === '' || val === null || val === undefined) ? '' :
    `<div class="kv"><div class="k">${t(key)}</div><div class="v">${raw ? val : esc(val)}</div></div>`;
  const scLine = x => x.missing ? `<div class="mini"><span class="sc-no">${esc(x.SoPhieu)}</span></div>` : scMini(x, false);
  return {
    live: true, title: 'rcaDetail', back: 'rca', tab: 'cv',
    html: `
      <section class="card hero rc-${esc(s.st)}">
        <div class="hero-main">
          <div class="hero-ids"><span class="sc-no big">${esc(r.SoRCA)}</span>${rcaPill(s.st)}</div>
          <div class="hero-name">${esc(r.TieuDe)}</div>
          ${r.LyDo ? `<div class="sc-meta">${String(r.LyDo).split(',').filter(Boolean).map(x => `<span class="tag">${t('rcaLD' + x)}</span>`).join('')}</div>` : ''}
          ${s.acts.length ? `<div class="kt-prog rc-prog"><div class="prog"><i style="width:${Math.round(s.done * 100 / s.acts.length)}%"></i></div><b>${s.done}/${s.acts.length}</b></div>` : ''}
        </div>
      </section>
      ${r.TrangThai === 'HUY' ? `<div class="notice warn">${ic('ban')}<div>${t('scCancelledNote', r.LyDoHuy || '')}</div></div>` : ''}
      ${r.TrangThai === 'MO' && r.KetQuaHL === 'KHONGHIEULUC' ? `<div class="notice warn">${ic('undo')}<div>${t('rcaNotEffNote', fmtDate(r.TGKiemTraHL), r.NhanXetHL || '')}</div></div>` : ''}
      ${s.st === 'PHANTICH' ? `<div class="notice">${ic('info')}<div>${t('rcaNeedRoot')}</div></div>` : ''}
      ${s.st === 'CHOHL' ? `<div class="notice ${s.hlLate ? 'warn' : ''}">${ic('checkCircle')}<div>${t(ql ? 'rcaReadyQL' : 'rcaReadyKTV')}${r.HanKiemTraHL ? ` · ${esc(tp('rcaHanHL'))}: ${esc(fmtDate(r.HanKiemTraHL))}` : ''}</div></div>` : ''}
      ${tbCard(r.IDThietBi)}
      <div class="actions-row">
        ${canEdit ? `<a class="btn sm" href="#/rca/${enc}/sua">${ic('edit')}${t('edit')}</a>` : ''}
        ${ql && r.TrangThai === 'MO' ? `<button class="btn sm${s.st === 'CHOHL' ? ' primary' : ''}" data-act="rcaVerify" data-so="${esc(r.SoRCA)}">${ic('checkCircle')}${t('rcaVerify')}</button>` : ''}
        ${ql && r.TrangThai !== 'MO' ? `<button class="btn sm" data-act="rcaReopen" data-so="${esc(r.SoRCA)}">${ic('undo')}${t('rcaReopen')}</button>` : ''}
        ${ql && r.TrangThai === 'MO' ? `<button class="btn sm" data-act="rcaCancel" data-so="${esc(r.SoRCA)}">${ic('ban')}${t('rcaCancel')}</button>` : ''}
        <button class="btn sm" data-act="printRca" data-so="${esc(r.SoRCA)}">${ic('print')}${t('pPrintShort')}</button>
      </div>
      <section class="card">
        <div class="card-h">${ic('alert')}${t('rcaIncident')}</div>
        <div class="kv col"><div class="v pre">${esc(r.MoTa)}</div></div>
        ${kv('rcaTeam', r.NhomPhanTich)}
        ${kv('rcaDate', fmtDate(r.NgayPhanTich))}
      </section>
      ${scMain || rel.length ? `<section class="card">
        <div class="card-h">${ic('wrench')}${t('rcaTickets')}<span class="count">${(scMain ? 1 : 0) + rel.length}</span></div>
        <div class="mini-list">${scMain ? scMini(scMain, false) : (r.SoPhieu ? scLine({ SoPhieu: r.SoPhieu, missing: true }) : '')}${rel.map(scLine).join('')}</div>
      </section>` : ''}
      <section class="card">
        <div class="card-h">${ic('help')}${t('rca5Why')}</div>
        ${why.length ? `<ol class="why-chain">${why.map((w, i) => `<li><span class="why-q">${t('rcaWhyN', i + 1)}</span><div class="pre">${w ? esc(w) : '<span class="muted">—</span>'}</div></li>`).join('')}</ol>`
          : `<div class="empty small">${t('rcaNoWhy')}</div>`}
      </section>
      ${Object.keys(m6).length ? `<section class="card">
        <div class="card-h">${ic('grid')}${t('rca6M')}</div>
        <div class="m6-grid">${RCA_6M.filter(k => m6[k]).map(k => `<div class="m6${r.NhomNguyenNhan === k ? ' root' : ''}"><div class="m6-k">${t('m6' + k)}</div><div class="pre small">${esc(m6[k])}</div></div>`).join('')}</div>
      </section>` : ''}
      <section class="card root-card${r.NguyenNhanGoc ? '' : ' empty-root'}">
        <div class="card-h">${ic('target')}${t('rcaRoot')}${r.NhomNguyenNhan ? `<span class="sp"></span><span class="tag info">${t('m6' + r.NhomNguyenNhan)}</span>` : ''}</div>
        <div class="kv col"><div class="v pre">${r.NguyenNhanGoc ? esc(r.NguyenNhanGoc) : `<span class="muted">${t('rcaNoRoot')}</span>`}</div></div>
      </section>
      <section class="card">
        <div class="card-h">${ic('checklist')}${t('rcaActions')}<span class="count">${s.done}/${s.acts.length}</span></div>
        ${s.acts.length ? s.acts.map(a => hdkRow(r, a, today)).join('') : `<div class="empty small">${t('rcaNoActs2')}</div>`}
      </section>
      <section class="card">
        <div class="card-h">${ic('checkCircle')}${t('rcaEff')}</div>
        ${kv('rcaHanHL', r.HanKiemTraHL ? fmtDate(r.HanKiemTraHL) : '')}
        ${r.KetQuaHL ? kv('rcaLastHL', `<span class="tag ${r.KetQuaHL === 'HIEULUC' ? 'ok' : 'bad'}">${t('rcaHL' + r.KetQuaHL)}</span> ${esc(fmtDate(r.TGKiemTraHL))} · ${esc(r.NguoiKiemTraHL || '')}${Number(r.SoLanKTHL) > 1 ? ` <span class="muted small">(${esc(tp('rcaNthCheck', r.SoLanKTHL))})</span>` : ''}`, true) : ''}
        ${r.NhanXetHL ? `<div class="kv col"><div class="k">${t('rcaHLNote')}</div><div class="v pre">${esc(r.NhanXetHL)}</div></div>` : ''}
        ${!r.KetQuaHL && !r.HanKiemTraHL ? `<div class="empty small">${t('rcaNoHL')}</div>` : ''}
      </section>
      <section class="card">
        <div class="card-h">${ic('repeat')}${t('rcaAfter')}<span class="count">${after.length}</span></div>
        ${after.length ? `<div class="mini-list">${after.slice(0, 20).map(x => scMini(x, false)).join('')}</div>`
          : `<div class="empty ok small">${ic('check')}${t('rcaNoAfter', fmtDate(since))}</div>`}
      </section>
      <p class="muted small audit">${t('createdBy', fmtTime(r.NgayTao), r.NguoiTao || '—')}<br>${t('updatedBy', fmtTime(r.NgaySua), r.NguoiSua || '—')}</p>
      ${ql ? `<button class="btn block danger-outline" data-act="rcaDelete" data-so="${esc(r.SoRCA)}">${ic('trash')}${t('rcaDelete')}</button>` : ''}`
  };
}
function hdkRow(r, a, today) {
  const late = r.TrangThai === 'MO' && hdkLate(a, today);
  return `<div class="hdk-row${a.NgayXong ? ' done' : (late ? ' late' : '')}">
    <div class="tb-top">${hdkTag(a.Loai)}<span class="sp"></span>${a.Han || a.NgayXong ? hdkDueHtml(a, today) : ''}</div>
    <div class="hdk-text">${esc(a.NoiDung)}</div>
    ${a.PhuTrach ? `<div class="small muted">${ic('user')} ${esc(a.PhuTrach)}</div>` : ''}
    ${a.KetQua ? `<div class="kq-note">${esc(a.KetQua)}</div>` : ''}
    ${r.TrangThai === 'MO' ? `<div class="hdk-act">${a.NgayXong
      ? `<button class="link small" data-act="hdkUndo" data-so="${esc(r.SoRCA)}" data-stt="${esc(a.STT)}">${t('rcaUndoDone')}</button>`
      : `<button class="btn sm" data-act="hdkDone" data-so="${esc(r.SoRCA)}" data-stt="${esc(a.STT)}">${ic('check')}${t('rcaMarkDone')}</button>`}</div>` : ''}
  </div>`;
}

/* ---- Biểu mẫu RCA ---- */
/** Mô tả sự cố điền sẵn từ phiếu sửa chữa */
function rcaMoTaFromSc(sc) {
  const d = scDownMin(sc);
  const lines = [`${tr('scMoTa').vi}: ${sc.MoTa}`];
  if (d) lines.push(`${tr('scDurDown').vi}: ${fmtDur(d.min).vi}`);
  if (sc.NguyenNhan) lines.push(`${tr('scNguyenNhan').vi}: ${sc.NguyenNhan}`);
  if (sc.CachXuLy) lines.push(`${tr('scCachXuLy').vi}: ${sc.CachXuLy}`);
  return lines.join('\n');
}
function viewRcaForm(mode, key) {
  if (!S.data) return loadingView();
  let cur = null, sc = null, tb = null;
  if (mode === 'edit') {
    cur = rcaBySo(key);
    if (!cur) return { title: 'rcaDetail', back: 'rca', tab: 'cv', html: `<div class="empty">${t('rcaNotFound', key)}</div>` };
    if (!isQL() && cur.TrangThai !== 'MO') return forbiddenView('rca/' + encodeURIComponent(cur.SoRCA));
    tb = tbById(cur.IDThietBi);
    sc = cur.SoPhieu ? scBySo(cur.SoPhieu) : null;
  } else if (key) {
    sc = scBySo(key);
    if (!sc) tb = tbById(key);
    else tb = tbById(sc.IDThietBi);
    if (sc) {
      const ex = rcaOfSc(sc.SoPhieu).find(r => r.TrangThai !== 'HUY');
      if (ex) return { title: 'rcaNew', back: 'sc/' + encodeURIComponent(sc.SoPhieu), tab: 'cv', html: `<a class="notice src-link" href="#/rca/${encodeURIComponent(ex.SoRCA)}">${ic('target')}<div>${t('rcaExists', ex.SoRCA)}</div>${ic('chev')}</a>` };
    }
  }
  const fkey = mode + ':' + (cur ? cur.SoRCA : key);
  if (!S.rcaForm || S.rcaForm.key !== fkey) {
    const sg = sc ? rcaSuggest(sc) : null;
    const r = cur ? Object.assign({}, cur) : {
      IDThietBi: tb ? tb.ID : '', SoPhieu: sc ? sc.SoPhieu : '',
      TieuDe: sc ? String(sc.MoTa || '').split('\n')[0].slice(0, 200) : '', MoTa: sc ? rcaMoTaFromSc(sc) : '',
      LyDo: sg ? [sg.long ? 'LON' : '', sg.rep ? 'LAPLAI' : ''].filter(Boolean).join(',') : '',
      NhomPhanTich: S.name, NgayPhanTich: dToday(), NguyenNhanGoc: '', NhomNguyenNhan: '', HanKiemTraHL: ''
    };
    const rel = new Set(cur ? String(cur.PhieuLienQuan || '').split(',').filter(Boolean)
      : (sg && sg.rep ? sg.win.map(x => x.SoPhieu).filter(x => x !== sc.SoPhieu) : []));
    const why = rcaJson(cur && cur.Why, []);
    S.rcaForm = {
      key: fkey, mode, orig: cur ? cur.NgaySua : undefined, r, rel,
      why: [0, 1, 2, 3, 4].map(i => why[i] || ''),
      m6: Object.assign({}, rcaJson(cur && cur.SauM, {})),
      acts: cur ? hdkOf(cur.SoRCA).map(a => Object.assign({}, a)) : []
    };
  }
  const F = S.rcaForm, R = F.r;
  const tbSel = tbById(R.IDThietBi);
  const back = cur ? 'rca/' + encodeURIComponent(cur.SoRCA) : (sc ? 'sc/' + encodeURIComponent(sc.SoPhieu) : (tb ? 'tb/' + encodeURIComponent(tb.ID) : 'rca'));
  const others = R.IDThietBi ? scOfTb(R.IDThietBi).filter(x => x.SoPhieu !== R.SoPhieu && x.TrangThaiPhieu !== 'HUY').slice(0, 25) : [];
  const lyDo = String(R.LyDo || '').split(',').filter(Boolean);
  const names = uniqueRecent('NguoiThucHien', [S.name].concat(allHDK().map(a => a.PhuTrach)));
  const txt = (f, key, req, attrs, ph) => `<label class="fld" data-fld="${f}"><span class="lb">${t(key)}${req ? ' <b class="req">*</b>' : ''}</span>
    <input data-rf="${f}" value="${esc(R[f] || '')}" ${attrs || ''} ${ph ? `placeholder="${esc(tp(ph))}"` : ''}><span class="fe"></span></label>`;
  const area = (f, key, req, rows, ph) => `<label class="fld" data-fld="${f}"><span class="lb">${t(key)}${req ? ' <b class="req">*</b>' : ''}</span>
    <textarea data-rf="${f}" rows="${rows}" maxlength="2000" ${ph ? `placeholder="${esc(tp(ph))}"` : ''}>${esc(R[f] || '')}</textarea><span class="fe"></span></label>`;
  return {
    title: cur ? 'rcaEditTitle' : 'rcaNew', back, tab: 'cv', noPtr: true,
    html: `
      <form id="f-rca" class="form" autocomplete="off" novalidate>
        ${cur ? `<div class="card pad slim"><span class="sc-no big">${esc(cur.SoRCA)}</span></div>` : ''}
        <section class="card pad">
          <div class="card-h flat">${ic('alert')}${t('rcaIncident')}</div>
          ${mode === 'new' && !sc && !tb ? `<div class="fld" data-fld="IDThietBi"><span class="lb">${t('scMay')} <b class="req">*</b></span>
              <button type="button" class="select" data-act="rcaPickTb">${scTbLabel(R.IDThietBi)}${ic('down')}</button><span class="fe"></span></div>`
            : `<div class="static">${tbSel ? `<span class="tb-id">${esc(tbSel.ID)}</span> ${bi(tbSel.TenMay, tbSel.TenMayZH)}` : esc(R.IDThietBi)}</div>`}
          ${R.SoPhieu ? `<div class="small muted">${t('rcaFromSc', R.SoPhieu)}</div>` : ''}
          ${txt('TieuDe', 'rcaTitle', true, 'maxlength="200"', 'rcaTitlePh')}
          ${area('MoTa', 'rcaMoTa', true, 4, 'rcaMoTaPh')}
          <div class="fld"><span class="lb">${t('rcaWhyDo')}</span>
            <div class="chk-chips">${RCA_LYDO.map(x => `<label class="chk"><input type="checkbox" data-ld="${x}" ${lyDo.includes(x) ? 'checked' : ''}><span>${t('rcaLD' + x)}</span></label>`).join('')}</div></div>
          ${others.length ? `<div class="fld" data-fld="PhieuLienQuan"><span class="lb">${t('rcaRelated')}</span>
            <div class="rel-list">${others.map(x => `<label class="tem-row"><input type="checkbox" data-rel="${esc(x.SoPhieu)}" ${F.rel.has(x.SoPhieu) ? 'checked' : ''}>
              <span class="sc-no">${esc(x.SoPhieu)}</span><span class="grow small">${esc(fmtDate(x.TGBao))} · ${esc(String(x.MoTa || '').slice(0, 80))}</span></label>`).join('')}</div>
            <span class="fe"></span></div>` : ''}
          <div class="grid2">
            ${txt('NhomPhanTich', 'rcaTeam', false, 'maxlength="300"', 'rcaTeamPh')}
            <label class="fld" data-fld="NgayPhanTich"><span class="lb">${t('rcaDate')}</span><input type="date" data-rf="NgayPhanTich" value="${esc(R.NgayPhanTich || '')}"><span class="fe"></span></label>
          </div>
        </section>
        <section class="card pad">
          <div class="card-h flat">${ic('help')}${t('rca5Why')}</div>
          <p class="muted small">${t('rcaWhyHint')}</p>
          ${F.why.map((w, i) => `<label class="fld why-f"><span class="lb"><span class="why-n">${i + 1}</span>${t('rcaWhyN', i + 1)}</span>
            <textarea data-why="${i}" rows="2" maxlength="1000" placeholder="${esc(i === 0 ? tp('rcaWhy1Ph') : '')}">${esc(w)}</textarea></label>`).join('')}
        </section>
        <details class="card pad m6-f"${Object.keys(F.m6).length ? ' open' : ''}>
          <summary class="card-h flat">${ic('grid')}${t('rca6M')}<span class="sp"></span><span class="muted small">${t('optional')}</span></summary>
          <p class="muted small">${t('rca6MHint')}</p>
          ${RCA_6M.map(k => `<label class="fld"><span class="lb">${t('m6' + k)}</span><textarea data-m6="${k}" rows="1" maxlength="1000">${esc(F.m6[k] || '')}</textarea></label>`).join('')}
        </details>
        <section class="card pad root-f">
          <div class="card-h flat">${ic('target')}${t('rcaRoot')}</div>
          ${area('NguyenNhanGoc', 'rcaRootLbl', false, 3, 'rcaRootPh')}
          <div class="fld" data-fld="NhomNguyenNhan"><span class="lb">${t('rcaRootCat')}</span>
            <button type="button" class="select" data-act="rcaPickCat">${R.NhomNguyenNhan ? t('m6' + R.NhomNguyenNhan) : `<span class="muted">${t('choose')}</span>`}${ic('down')}</button><span class="fe"></span></div>
        </section>
        <section class="card pad">
          <div class="card-h flat" data-fld="hanhDong">${ic('checklist')}${t('rcaActions')}</div>
          <div id="rca-acts">${rcaActsForm()}</div>
          <button type="button" class="btn block" data-act="hdkAdd">${ic('plus')}${t('rcaActAdd')}</button>
        </section>
        <section class="card pad">
          <div class="card-h flat">${ic('checkCircle')}${t('rcaEff')}</div>
          <label class="fld" data-fld="HanKiemTraHL"><span class="lb">${t('rcaHanHL')}</span><input type="date" data-rf="HanKiemTraHL" value="${esc(R.HanKiemTraHL || '')}"><span class="fe"></span></label>
          <p class="muted small">${t('rcaHanHLHint')}</p>
        </section>
        ${datalist('dl-pt', names)}
        <div class="form-actions">
          <a class="btn" href="#/${back}">${t('cancel')}</a>
          <button class="btn primary" type="submit">${ic('check')}${t(cur ? 'save' : 'rcaCreate')}</button>
        </div>
      </form>`,
    after: () => {
      const form = $('#f-rca');
      form.addEventListener('submit', saveRcaForm);
      form.addEventListener('input', e => { clearFieldErr(e); rcaFormInput(e.target); });
      form.addEventListener('change', e => rcaFormInput(e.target));
    }
  };
}
function rcaActsForm() {
  const F = S.rcaForm;
  if (!F.acts.length) return `<div class="empty small">${t('rcaActEmpty')}</div>`;
  return F.acts.map((a, i) => `<div class="card pad mau-item hdk-f" data-fld="hanhDong:${i + 1}">
    <div class="mau-head"><span class="mau-no">${i + 1}</span><span class="sp"></span>
      <button type="button" class="hbtn sm danger" data-act="hdkDel" data-i="${i}" aria-label="${esc(tp('delete'))}">${ic('trash')}</button></div>
    <div class="seg hdk-seg">${HDK_LOAI.map(l => `<label><input type="radio" name="hk${i}" value="${l}" data-ak="Loai" data-i="${i}" ${(a.Loai || 'KHACPHUC') === l ? 'checked' : ''}><span>${t('hdk' + l)}</span></label>`).join('')}</div>
    <label class="fld"><span class="lb">${t('rcaActText')} <b class="req">*</b></span><textarea data-ak="NoiDung" data-i="${i}" rows="2" maxlength="1000">${esc(a.NoiDung || '')}</textarea></label>
    <div class="grid2">
      <label class="fld"><span class="lb">${t('rcaActWho')}</span><input data-ak="PhuTrach" data-i="${i}" value="${esc(a.PhuTrach || '')}" maxlength="150" list="dl-pt"></label>
      <label class="fld"><span class="lb">${t('rcaActDue')}</span><input type="date" data-ak="Han" data-i="${i}" value="${esc(a.Han || '')}"></label>
    </div>
    <div class="grid2">
      <label class="fld"><span class="lb">${t('rcaActDoneOn')}</span><input type="date" data-ak="NgayXong" data-i="${i}" value="${esc(a.NgayXong || '')}" max="${dToday()}"></label>
      <label class="fld"><span class="lb">${t('rcaActResult')}</span><input data-ak="KetQua" data-i="${i}" value="${esc(a.KetQua || '')}" maxlength="1000"></label>
    </div>
    <span class="fe"></span>
  </div>`).join('');
}
function rcaFormInput(el) {
  const F = S.rcaForm;
  if (!F) return;
  if (el.dataset.rf) F.r[el.dataset.rf] = el.value;
  else if (el.dataset.why !== undefined) F.why[Number(el.dataset.why)] = el.value;
  else if (el.dataset.m6) { if (el.value.trim()) F.m6[el.dataset.m6] = el.value; else delete F.m6[el.dataset.m6]; }
  else if (el.dataset.ld) {
    const set = new Set(String(F.r.LyDo || '').split(',').filter(Boolean));
    if (el.checked) set.add(el.dataset.ld); else set.delete(el.dataset.ld);
    F.r.LyDo = RCA_LYDO.filter(x => set.has(x)).join(',');
  } else if (el.dataset.rel) { if (el.checked) F.rel.add(el.dataset.rel); else F.rel.delete(el.dataset.rel); }
  else if (el.dataset.ak) {
    const a = F.acts[Number(el.dataset.i)];
    if (!a) return;
    if (el.type === 'radio') { if (el.checked) a.Loai = el.value; } else a[el.dataset.ak] = el.value;
  }
}
const RCA_FIELD_KEYS = { TieuDe: 'rcaTitle', MoTa: 'rcaMoTa', IDThietBi: 'scMay', SoPhieu: 'scDetail', PhieuLienQuan: 'rcaRelated', hanhDong: 'rcaActions',
  NgayPhanTich: 'rcaDate', HanKiemTraHL: 'rcaHanHL', NhomNguyenNhan: 'rcaRootCat', KetQuaHL: 'rcaHLResult', NhanXetHL: 'rcaHLNote', NgayXong: 'rcaActDoneOn',
  TGKiemTraHL: 'rcaHLDate', LyDoHuy: 'scLyDoHuy' };
function rcaFieldName(f, x) { const b = RCA_FIELD_KEYS[f] ? tr(RCA_FIELD_KEYS[f]) : { vi: f, zh: f }; return x && (x.line || x.value) ? { vi: `${b.vi} ${x.line || x.value}`, zh: `${b.zh} ${x.line || x.value}` } : b; }

async function saveRcaForm(ev) {
  ev.preventDefault();
  if (!needOnline()) return;
  const form = ev.target;
  const F = S.rcaForm;
  if (!F) return;
  const R = F.r;
  $$('.has-err', form).forEach(el => { el.classList.remove('has-err'); const fe = $('.fe', el); if (fe) fe.innerHTML = ''; });
  let bad = false;
  const err = (f, k) => { scFieldErr(form, f, k); bad = true; };
  if (!R.IDThietBi) err('IDThietBi', 'eRequired');
  if (!String(R.TieuDe || '').trim()) err('TieuDe', 'eRequired');
  if (!String(R.MoTa || '').trim()) err('MoTa', 'eRequired');
  const today = dToday();
  F.acts.forEach((a, i) => {
    if (!String(a.NoiDung || '').trim()) err('hanhDong:' + (i + 1), 'rcaActTextReq');
    else if (a.NgayXong && a.NgayXong > today) err('hanhDong:' + (i + 1), 'eFuture');
  });
  if (bad) { toast('eInvalid', 'err'); const first = $('.has-err', form); if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
  const rca = {};
  ['TieuDe', 'MoTa', 'LyDo', 'NhomPhanTich', 'NgayPhanTich', 'NguyenNhanGoc', 'NhomNguyenNhan', 'HanKiemTraHL'].forEach(f => { rca[f] = String(R[f] === undefined || R[f] === null ? '' : R[f]).trim(); });
  rca.Why = F.why.map(w => String(w || '').trim());
  rca.SauM = {};
  RCA_6M.forEach(k => { if (String(F.m6[k] || '').trim()) rca.SauM[k] = String(F.m6[k]).trim(); });
  rca.PhieuLienQuan = [...F.rel];
  const hanhDong = F.acts.map(a => ({ Loai: a.Loai || 'KHACPHUC', NoiDung: String(a.NoiDung || '').trim(), PhuTrach: String(a.PhuTrach || '').trim(),
    Han: a.Han || '', NgayXong: a.NgayXong || '', KetQua: String(a.KetQua || '').trim() }));
  const payload = { rca, hanhDong };
  if (F.mode === 'new') { payload.op = 'create'; rca.SoPhieu = R.SoPhieu || ''; rca.IDThietBi = R.IDThietBi; }
  else { payload.op = 'capnhat'; payload.so = R.SoRCA; payload.ngaySuaCu = F.orig || ''; }
  busy(form, true);
  try {
    const r = await api('rcaAction', payload);
    mergeRCA(r.rca, r.hanhDong);
    S.rcaForm = null;
    toast(r.unchanged ? tr('scNoChange') : tr(F.mode === 'new' ? 'rcaCreated' : 'saved', [r.rca.SoRCA]), 'ok');
    const detail = '#/rca/' + encodeURIComponent(r.rca.SoRCA);
    if (F.mode === 'edit' && S.prevHash === detail) history.back(); else location.replace(detail);
  } catch (e) {
    if (e.code === 'INVALID' && e.extra && e.extra.errors) showErrs(form, e.extra.errors, rcaFieldName);
    else if (e.code === 'DUPLICATE') { toast(tr('rcaExists', [(e.extra || {}).so || '']), 'err'); }
    else await rcaHandleErr(e);
  } finally { if (form.isConnected) busy(form, false); }
}
async function rcaHandleErr(e) {
  if (e.code === 'CONFLICT' || e.code === 'BAD_STATE') {
    const ex = e.extra || {};
    closeSheet();
    if (await confirmDlg('eConflict', e.code === 'CONFLICT' ? tr('scConflictMsg', [ex.nguoiSua || '?', fmtTime(ex.ngaySua)]) : tr('eBadState'), { ok: 'reload' })) {
      S.rcaForm = null;
      await refresh(true);
      const p = route();
      if (p[0] === 'rca' && p[1] && p[2]) location.replace('#/rca/' + encodeURIComponent(p[1])); else render();
    }
  } else if (e.code !== 'AUTH') toast(errText(e), 'err');
}
/** Đánh dấu hành động xong (ngày + kết quả) / bỏ đánh dấu */
function hdkDoneSheet(so, stt, undo) {
  const r = rcaBySo(so);
  const a = r && hdkOf(so).find(x => String(x.STT) === String(stt));
  if (!a || !needOnline()) return;
  const run = async (NgayXong, KetQua, form) => {
    if (form) busy(form, true);
    try {
      const res = await api('rcaAction', { op: 'hanhdong', so, stt: a.STT, ngaySuaCu: r.NgaySua || '', NgayXong, KetQua });
      mergeRCA(res.rca, res.hanhDong);
      closeSheet();
      toast(NgayXong ? 'rcaActDoneToast' : 'saved', 'ok');
      render(true);
    } catch (e) {
      if (e.code === 'INVALID' && e.extra && e.extra.errors && form) e.extra.errors.forEach(x => scFieldErr(form, x.field, reasonKey(x.reason)));
      else await rcaHandleErr(e);
    } finally { if (form && form.isConnected) busy(form, false); }
  };
  if (undo) { confirmDlg('rcaUndoDone', { vi: a.NoiDung, zh: '' }).then(ok => { if (ok) run('', a.KetQua, null); }); return; }
  const sh = openSheet(`
    <form id="f-hdk" class="form" autocomplete="off" novalidate>
      <div class="pk-head"><h3 class="h3">${t('rcaMarkDone')}</h3><button type="button" class="hbtn" data-act="closeSheet">${ic('x')}</button></div>
      <div class="appr">${hdkTag(a.Loai)}<div class="pre small">${esc(a.NoiDung)}</div></div>
      <label class="fld" data-fld="NgayXong"><span class="lb">${t('rcaActDoneOn')} <b class="req">*</b></span><input type="date" name="d" value="${dToday()}" max="${dToday()}"><span class="fe"></span></label>
      <label class="fld"><span class="lb">${t('rcaActResult')}</span><textarea name="kq" rows="3" maxlength="1000" placeholder="${esc(tp('rcaActResultPh'))}">${esc(a.KetQua || '')}</textarea></label>
      <button class="btn primary block" type="submit">${ic('check')}${t('rcaMarkDone')}</button>
    </form>`);
  const form = $('#f-hdk', sh);
  form.addEventListener('submit', ev => {
    ev.preventDefault();
    if (!form.d.value) { scFieldErr(form, 'NgayXong', 'eRequired'); return; }
    run(form.d.value, form.kq.value.trim(), form);
  });
}
/** Quản lý kiểm tra hiệu lực: hiệu lực → đóng RCA; chưa hiệu lực → giữ mở (bắt buộc nhận xét) */
function rcaVerifySheet(so) {
  const r = rcaBySo(so);
  if (!r || !needOnline()) return;
  const s = rcaStatus(r);
  const sh = openSheet(`
    <form id="f-hl" class="form" autocomplete="off" novalidate>
      <div class="pk-head"><h3 class="h3">${t('rcaVerify')}</h3><button type="button" class="hbtn" data-act="closeSheet">${ic('x')}</button></div>
      <div class="muted small"><span class="sc-no">${esc(r.SoRCA)}</span> · ${esc(r.IDThietBi)} · ${esc(r.TieuDe)}</div>
      <div class="appr small">${t('rcaActProg', s.done, s.acts.length)}${r.NguyenNhanGoc ? '' : ` · <span class="bad-n">${t('rcaNoRoot')}</span>`}</div>
      <div class="fld" data-fld="KetQuaHL"><span class="lb">${t('rcaHLResult')} <b class="req">*</b></span>
        <div class="seg ck-seg">
          <label class="yes"><input type="radio" name="kq" value="HIEULUC" ${s.st === 'CHOHL' ? 'checked' : ''}><span>${ic('check')}${t('rcaHLHIEULUC')}</span></label>
          <label class="no"><input type="radio" name="kq" value="KHONGHIEULUC"><span>${ic('x')}${t('rcaHLKHONGHIEULUC')}</span></label>
        </div><span class="fe"></span></div>
      <label class="fld" data-fld="TGKiemTraHL"><span class="lb">${t('rcaHLDate')}</span><input type="date" name="d" value="${dToday()}" max="${dToday()}"><span class="fe"></span></label>
      <label class="fld" data-fld="NhanXetHL"><span class="lb">${t('rcaHLNote')}</span><textarea name="nx" rows="3" maxlength="1000" placeholder="${esc(tp('rcaHLNotePh'))}"></textarea><span class="fe"></span></label>
      <p class="muted small">${t('rcaHLHint')}</p>
      <div class="msg" id="hl-msg"></div>
      <button class="btn primary block" type="submit">${ic('checkCircle')}${t('save')}</button>
    </form>`);
  const form = $('#f-hl', sh);
  form.addEventListener('input', clearFieldErr);
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    $('#hl-msg').innerHTML = '';
    const kq = form.kq.value;
    if (!kq) { scFieldErr(form, 'KetQuaHL', 'eRequired'); return; }
    if (kq === 'KHONGHIEULUC' && !form.nx.value.trim()) { scFieldErr(form, 'NhanXetHL', 'eRequired'); return; }
    busy(form, true);
    try {
      const res = await api('rcaAction', { op: 'kiemtra', so, ngaySuaCu: r.NgaySua || '', rca: { KetQuaHL: kq, TGKiemTraHL: form.d.value, NhanXetHL: form.nx.value.trim() } });
      mergeRCA(res.rca, res.hanhDong);
      closeSheet();
      toast(kq === 'HIEULUC' ? 'rcaClosedToast' : 'saved', 'ok');
      render(true);
    } catch (e) {
      if (e.code === 'NOT_READY') $('#hl-msg').innerHTML = ((e.extra && e.extra.missing) || []).map(m => t('rcaMiss_' + m)).join('');
      else if (e.code === 'INVALID' && e.extra && e.extra.errors) e.extra.errors.forEach(x => scFieldErr(form, x.field, reasonKey(x.reason)));
      else if (e.code === 'CONFLICT' || e.code === 'BAD_STATE') await rcaHandleErr(e);
      else if (e.code !== 'AUTH') $('#hl-msg').innerHTML = errHtml(e);
    } finally { if (form.isConnected) busy(form, false); }
  });
}
function rcaCancelSheet(so) {
  const r = rcaBySo(so);
  if (!r || !needOnline()) return;
  const sh = openSheet(`
    <form id="f-rch" class="form" autocomplete="off" novalidate>
      <div class="pk-head"><h3 class="h3">${t('rcaCancel')}</h3><button type="button" class="hbtn" data-act="closeSheet">${ic('x')}</button></div>
      <div class="muted small"><span class="sc-no">${esc(r.SoRCA)}</span> · ${esc(r.TieuDe)}</div>
      <label class="fld" data-fld="LyDoHuy"><span class="lb">${t('scLyDoHuy')} <b class="req">*</b></span><textarea name="ly" rows="3" maxlength="1000"></textarea><span class="fe"></span></label>
      <div class="msg" id="rch-msg"></div>
      <button class="btn danger block" type="submit">${ic('ban')}${t('rcaCancel')}</button>
    </form>`);
  const form = $('#f-rch', sh);
  form.addEventListener('input', clearFieldErr);
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    if (!form.ly.value.trim()) { scFieldErr(form, 'LyDoHuy', 'eRequired'); return; }
    busy(form, true);
    try {
      const res = await api('rcaAction', { op: 'huy', so, ngaySuaCu: r.NgaySua || '', rca: { LyDoHuy: form.ly.value.trim() } });
      mergeRCA(res.rca, res.hanhDong);
      closeSheet(); toast('scOpDone_huy', 'ok'); render(true);
    } catch (e) {
      if (e.code === 'CONFLICT' || e.code === 'BAD_STATE') await rcaHandleErr(e);
      else if (e.code !== 'AUTH') $('#rch-msg').innerHTML = errHtml(e);
    } finally { if (form.isConnected) busy(form, false); }
  });
}
async function rcaSimpleOp(op, so) {
  const r = rcaBySo(so);
  if (!r || !needOnline()) return;
  if (op === 'xoa' && !(await confirmDlg(tr('rcaDeleteQ', [so]), 'rcaDeleteMsg', { ok: 'delete', danger: true }))) return;
  if (op === 'molai' && !(await confirmDlg('rcaReopen', 'rcaReopenMsg', { ok: 'rcaReopen' }))) return;
  try {
    const res = await api('rcaAction', { op, so, ngaySuaCu: r.NgaySua || '' });
    if (op === 'xoa') { removeRCA(so); toast(tr('scDeleted', [so]), 'ok'); location.replace('#/rca'); return; }
    mergeRCA(res.rca, res.hanhDong);
    toast('saved', 'ok'); render(true);
  } catch (e) { await rcaHandleErr(e); }
}

/* ---- Phiếu sửa chữa: liên kết RCA + gợi ý ---- */
function scRcaBlock(sc) {
  const list = rcaOfSc(sc.SoPhieu);
  if (list.length) {
    return list.map(r => `<a class="notice sc-open rc-${esc(rcaStatus(r).st)}" href="#/rca/${encodeURIComponent(r.SoRCA)}">${ic('target')}
      <div>${t('rcaOnSc', r.SoRCA)}<div class="sc-desc one">${esc(r.TieuDe)}</div></div>${rcaPill(rcaStatus(r).st)}</a>`).join('');
  }
  const sg = rcaSuggest(sc);
  if (!sg) return '';
  return `<div class="notice warn rca-sug">${ic('target')}<div>${t('rcaSugNote')}<div class="sc-meta">${rcaSugTags(sg)}</div>
    <a class="btn sm primary" href="#/rca-moi/${encodeURIComponent(sc.SoPhieu)}">${ic('target')}${t('rcaDo')}</a></div></div>`;
}

/* ---- Cài đặt: nhắc việc qua email · ngưỡng nhắc & gợi ý (quản lý) ---- */
function nguongSheet() {
  if (!isQL() || !needOnline()) return;
  const v = k => cfgInt(k, { HD_NhacTruoc: 60, RCA_LapLai: 3, RCA_SoNgay: 90, RCA_GioDung: 8 }[k]);
  const num = (k, key, unit) => `<label class="fld" data-fld="${k}"><span class="lb">${t(key)}</span>
    <div class="ck-num"><input name="${k}" value="${v(k)}" inputmode="numeric" maxlength="4"><span class="ck-unit">${t(unit)}</span></div><span class="fe"></span></label>`;
  const sh = openSheet(`
    <form id="f-ng" class="form" autocomplete="off" novalidate>
      <div class="pk-head"><h3 class="h3">${t('nguongSettings')}</h3><button type="button" class="hbtn" data-act="closeSheet">${ic('x')}</button></div>
      <div class="card-h flat">${ic('file')}${t('contracts')}</div>
      ${num('HD_NhacTruoc', 'hdNhacDefault', 'daysUnit')}
      <div class="card-h flat">${ic('target')}${t('rcaSugSettings')}</div>
      <div class="grid2">${num('RCA_LapLai', 'rcaSetLap', 'timesUnit')}${num('RCA_SoNgay', 'rcaSetNgay', 'daysUnit')}</div>
      ${num('RCA_GioDung', 'rcaSetGio', 'hoursUnit')}
      <p class="muted small">${t('rcaSetHint')}</p>
      <div class="msg" id="ng-msg"></div>
      <button class="btn primary block" type="submit">${ic('check')}${t('save')}</button>
    </form>`);
  const form = $('#f-ng', sh);
  form.addEventListener('input', clearFieldErr);
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const data = {};
    ['HD_NhacTruoc', 'RCA_LapLai', 'RCA_SoNgay', 'RCA_GioDung'].forEach(k => { data[k] = form[k].value.trim(); });
    busy(form, true);
    try {
      const r = await api('saveCauHinh', data);
      S.data.cauHinh = Object.assign({}, S.data.cauHinh, r.cauHinh);
      saveCache(); closeSheet(); toast('saved', 'ok'); render(true);
    } catch (e) {
      if (e.code === 'INVALID' && e.extra && e.extra.errors) e.extra.errors.forEach(x => scFieldErr(form, x.field, 'eRange', [x.min, x.max]));
      else $('#ng-msg').innerHTML = errHtml(e);
    } finally { if (form.isConnected) busy(form, false); }
  });
}
async function nhacSheet() {
  if (!isQL() || !needOnline()) return;
  const sh = openSheet(`<div class="pk-head"><h3 class="h3">${t('nhacSettings')}</h3><button type="button" class="hbtn" data-act="closeSheet">${ic('x')}</button></div>
    <div id="nh-body"><div class="center pad"><div class="spinner"></div></div></div>`);
  let st;
  try { st = await api('nhacEmail', { op: 'status' }); } catch (e) {
    if ($('#nh-body', sh)) $('#nh-body', sh).innerHTML = `<div class="msg">${errHtml(e)}</div><p class="muted small">${t('nhacAuthHint')}</p>`;
    return;
  }
  const body = $('#nh-body', sh);
  if (!body) return;
  body.innerHTML = `<form id="f-nh" class="form" autocomplete="off" novalidate>
      <label class="switch"><input type="checkbox" name="bat" ${st.on ? 'checked' : ''}><span class="sw"></span>${t('nhacOn')}</label>
      <label class="fld" data-fld="emails"><span class="lb">${t('nhacEmails')}</span>
        <input name="emails" type="text" inputmode="email" value="${esc(st.emails)}" placeholder="${esc(st.owner || 'email@…')}" maxlength="600"><span class="fe"></span>
        <span class="muted small">${t('nhacEmailsHint', st.owner || '—')}</span></label>
      <div class="notice">${ic('info')}<div>${t('nhacWhat')}</div></div>
      ${st.quota !== null && st.quota !== undefined ? `<p class="muted small">${t('nhacQuota', st.quota)}</p>` : ''}
      <div class="msg" id="nh-msg"></div>
      <div class="row gap"><button type="button" class="btn block" data-act="nhacTest">${ic('mail')}${t('nhacTest')}</button>
        <button class="btn primary block" type="submit">${ic('check')}${t('save')}</button></div>
    </form>`;
  const form = $('#f-nh', body);
  form.addEventListener('input', clearFieldErr);
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    busy(form, true);
    try {
      const r = await api('nhacEmail', { op: 'save', emails: form.emails.value.trim(), bat: form.bat.checked });
      closeSheet();
      toast(r.on ? tr('nhacSavedOn', [r.emails || r.owner]) : tr('nhacSavedOff'), 'ok');
    } catch (e) {
      if (e.code === 'INVALID') scFieldErr(form, 'emails', 'eEmail');
      else $('#nh-msg').innerHTML = errHtml(e) + `<div class="small">${t('nhacAuthHint')}</div>`;
    } finally { if (form.isConnected) busy(form, false); }
  });
}
async function nhacTest(btn) {
  if (!needOnline()) return;
  btn.disabled = true; btn.classList.add('loading');
  try {
    const f = $('#f-nh');
    const r = await api('nhacEmail', { op: 'test', emails: f ? f.emails.value.trim() : '' });
    toast(tr('nhacTestSent', [r.sent && r.sent.to ? r.sent.to : '']), 'ok');
  } catch (e) {
    const m = $('#nh-msg');
    if (m) m.innerHTML = errHtml(e) + `<div class="small">${t('nhacAuthHint')}</div>`;
  } finally { if (btn.isConnected) { btn.disabled = false; btn.classList.remove('loading'); } }
}

/* ===================== PHIÊN 6: BÁO CÁO · BẢN IN ===================== */

/* ---- Tiện ích thời gian, số ---- */
/** "yyyy-MM-dd HH:mm[:ss]" → ms (đọc như UTC, chỉ dùng để trừ nhau / so sánh) */
function tsU(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(s || ''));
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) : NaN;
}
function nowU() { return tsU(tsNow()); }
function mEnd(M) { return dAdd(dAdd(M + '-01', 1, 'THANG'), -1, 'NGAY'); }
function mAdd(M, n) { return dAdd(M + '-01', n, 'THANG').slice(0, 7); }
function mList(tu, den) { const o = []; for (let M = tu; M <= den && o.length < 40; M = mAdd(M, 1)) o.push(M); return o; }
function avgOf(a) { return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null; }
function fmtH1(h) { return h === null || h === undefined || !isFinite(h) ? '—' : fmtNum(Math.round(h * 10) / 10); }
function fmtPct(x) { return x === null || x === undefined || !isFinite(x) ? '—' : fmtNum(Math.round(x * 1000) / 10) + '%'; }
function ratio(a, b) { return b > 0 ? a / b : null; }
function monthTr(M) { return tr('bcMonth', [Number(M.slice(5, 7)), M.slice(0, 4)]); }

/* ---- Kỳ báo cáo ---- */
function bcState() {
  if (!S.bc) {
    const t = dToday();
    const y = Number(t.slice(0, 4)), m = Number(t.slice(5, 7));
    S.bc = { k: 'M', y, m, q: Math.floor((m - 1) / 3) + 1, kv: '', nhom: '', pm: 'n', by: 'kv', sort: 'down', all: false };
  }
  return S.bc;
}
/** Kỳ đang xem (cur), kỳ trước để so sánh (prev), khoảng tháng cần tải (fetch) */
function bcPeriod(b) {
  const mk = (y, a, z) => {
    const tu = `${y}-${pad2(a)}`, den = `${y}-${pad2(z)}`;
    return { tu, den, from: tu + '-01', to: mEnd(den), months: mList(tu, den) };
  };
  let cur, prev;
  if (b.k === 'Y') {
    cur = mk(b.y, 1, 12); prev = mk(b.y - 1, 1, 12);
    cur.lbl = tr('bcYear', [b.y]); prev.lbl = tr('bcYear', [b.y - 1]);
  } else if (b.k === 'Q') {
    const a = (b.q - 1) * 3 + 1;
    const pq = b.q === 1 ? { y: b.y - 1, q: 4 } : { y: b.y, q: b.q - 1 };
    cur = mk(b.y, a, a + 2); prev = mk(pq.y, (pq.q - 1) * 3 + 1, (pq.q - 1) * 3 + 3);
    cur.lbl = tr('bcQuarter', [b.q, b.y]); prev.lbl = tr('bcQuarter', [pq.q, pq.y]);
  } else {
    const pm = b.m === 1 ? { y: b.y - 1, m: 12 } : { y: b.y, m: b.m - 1 };
    cur = mk(b.y, b.m, b.m); prev = mk(pm.y, pm.m, pm.m);
    cur.lbl = tr('bcMonth', [b.m, b.y]); prev.lbl = tr('bcMonth', [pm.m, pm.y]);
  }
  cur.k = prev.k = b.k;
  const nowM = dToday().slice(0, 7);
  return { cur, prev, fetch: { tu: prev.tu, den: cur.den > nowM ? nowM : cur.den } };
}
/** Kỳ một năm (in BT-01, BT-05, BC-01) */
function bcYearPer(y) {
  const tu = `${y}-01`, den = `${y}-12`;
  const nowM = dToday().slice(0, 7);
  return { per: { k: 'Y', tu, den, from: tu + '-01', to: mEnd(den), months: mList(tu, den), lbl: tr('bcYear', [y]) },
    fetch: { tu, den: den > nowM ? nowM : den } };
}
function bcIsLatest(b) {
  const t = dToday(), y = Number(t.slice(0, 4)), m = Number(t.slice(5, 7));
  if (b.k === 'Y') return b.y >= y;
  if (b.k === 'Q') return b.y > y || (b.y === y && b.q >= Math.floor((m - 1) / 3) + 1);
  return b.y > y || (b.y === y && b.m >= m);
}
function bcStep(d) {
  const b = bcState();
  if (d > 0 && bcIsLatest(b)) return;
  if (b.k === 'Y') b.y += d;
  else if (b.k === 'Q') { b.q += d; if (b.q < 1) { b.q = 4; b.y--; } if (b.q > 4) { b.q = 1; b.y++; } }
  else { b.m += d; if (b.m < 1) { b.m = 12; b.y--; } if (b.m > 12) { b.m = 1; b.y++; } }
}
function bcSetKind(k) {
  const b = bcState();
  if (b.k === k) return;
  // Giữ mốc thời gian: lấy tháng cuối của kỳ đang xem (không vượt tháng hiện tại)
  const t = dToday(), cy = Number(t.slice(0, 4)), cm = Number(t.slice(5, 7));
  let y = b.y, mo = b.k === 'M' ? b.m : (b.k === 'Q' ? b.q * 3 : 12);
  if (y > cy || (y === cy && mo > cm)) { y = cy; mo = cm; }
  b.k = k; b.y = y; b.m = mo; b.q = Math.floor((mo - 1) / 3) + 1;
}

/* ---- Tải số liệu (action baoCao; tháng chưa tổng hợp xong → gọi tiếp) ---- */
function bcKey(f) { return f.tu + '|' + f.den; }
/** Bộ số liệu đã tải bao trùm khoảng f (dùng lại, không tải lại) */
function bcHave(f) {
  const exact = S.bcRes[bcKey(f)];
  if (exact) return exact;
  return Object.values(S.bcRes).find(R => R.tu <= f.tu && R.den >= f.den && !R.thieu.length) || null;
}
async function bcFetch(f) {
  const k = bcKey(f);
  if (S.bcBusy[k]) return S.bcBusy[k];
  const job = (async () => {
    let R = null;
    for (let i = 0; i < 8; i++) {
      const r = await api('baoCao', { tu: f.tu, den: f.den });
      if (!R) R = r;
      else { Object.assign(R.kt, r.kt); Object.assign(R.gc, r.gc); Object.assign(R, { sc: r.sc, bt: r.bt, dd: r.dd, now: r.now, today: r.today, thieu: r.thieu }); }
      if (!r.thieu.length) break;
      S.bcProg[k] = r.thieu.length;
      if (S.cur && S.cur.name === 'bc' && !$('.overlay.open')) { const y = window.scrollY; render(true); window.scrollTo(0, y); }
    }
    bcPrep(R);
    S.bcRes[k] = R;
    return R;
  })();
  S.bcBusy[k] = job;
  try { return await job; } finally { delete S.bcBusy[k]; delete S.bcProg[k]; }
}
/**
 * Chuẩn bị: thời điểm sự kiện của phiếu; theo máy: khoảng dừng máy do hỏng (stops: tới lúc chạy lại — dùng cho MTBF)
 * và khoảng máy ở trạng thái Dừng / Đang sửa (off: tới lúc quản lý duyệt đóng phiếu — máy không bắt buộc kiểm tra đầu ca)
 */
function bcPrep(R) {
  R.stops = {};
  R.off = {};
  R.sc.forEach(x => {
    x._stop = isOn(x.MayDung) && !!x.TGDung;
    x._ev = String(x._stop ? x.TGDung : x.TGBao).slice(0, 10);
    if (!x._stop) return;
    const a = tsU(x.TGDung);
    const open = SC_OPEN.includes(x.TrangThaiPhieu);
    const b = x.TGChayLai ? tsU(x.TGChayLai) : (open ? Infinity : a);
    const c = open ? Infinity : (x.TGDuyet ? tsU(x.TGDuyet) : b);
    const id = String(x.IDThietBi).toUpperCase();
    (R.stops[id] = R.stops[id] || []).push([a, b]);
    (R.off[id] = R.off[id] || []).push([a, Math.max(b, c)]);
  });
}

/* ---- Tính chỉ số cho một kỳ ---- */
function bcTbOk(id, f) {
  if (!f.kv && !f.nhom) return true;
  const tb = tbById(id);
  return !!tb && (!f.kv || tb.ViTri === f.kv) && (!f.nhom || tb.NhomTB === f.nhom);
}
/** Mốc chia cột biểu đồ: kỳ tháng → từng ngày; quý / năm → từng tháng */
function bcBuckets(per) {
  if (per.k === 'M') {
    const n = Number(per.to.slice(8, 10));
    return Array.from({ length: n }, (_, i) => { const d = per.from.slice(0, 8) + pad2(i + 1); return { key: d, lbl: String(i + 1), tip: { vi: fmtDate(d), zh: '' } }; });
  }
  return per.months.map(M => ({ key: M, lbl: 'T' + Number(M.slice(5, 7)), tip: monthTr(M) }));
}
function bcBucketOf(per, d) { return per.k === 'M' ? d : String(d).slice(0, 7); }
function bcDownMin(x, nowMs) {
  if (!x._stop) return 0;
  if (x.PhutDungMay !== '' && x.PhutDungMay !== undefined && x.PhutDungMay !== null) return Math.max(0, Number(x.PhutDungMay) || 0);
  if (SC_OPEN.includes(x.TrangThaiPhieu)) return Math.max(0, Math.round((nowMs - tsU(x.TGDung)) / 60000));
  return 0;
}
/** Dừng máy do hỏng của máy id nằm trong [a, b) (phút) */
function bcClipDown(R, id, a, b) {
  return (R.stops[String(id).toUpperCase()] || []).reduce((s, [x, y]) => s + Math.max(0, Math.min(y, b) - Math.max(x, a)), 0) / 60000;
}

function bcStats(R, per, f) {
  const nowMs = nowU();
  const today = dToday();
  const inP = d => d >= per.from && d <= per.to;
  const ok = id => bcTbOk(id, f);
  const fromMs = dMs(per.from);
  const endMs = Math.min(dMs(per.to) + 86400000, nowMs);
  const bks = bcBuckets(per);
  const bIdx = {};
  bks.forEach((b, i) => { bIdx[b.key] = i; });

  /* Sửa chữa, dừng máy */
  const sc = R.sc.filter(x => inP(x._ev) && ok(x.IDThietBi));
  sc.forEach(x => { x._down = bcDownMin(x, nowMs); x._live = x._stop && SC_OPEN.includes(x.TrangThaiPhieu) && !x.TGChayLai; });
  const fail = sc.filter(x => x._stop);
  const downMin = fail.reduce((s, x) => s + x._down, 0);
  const sua = fail.filter(x => x.PhutSua !== '' && x.PhutSua !== undefined).map(x => Number(x.PhutSua) || 0);
  const closedStops = fail.filter(x => x.TGChayLai && x.PhutDungMay !== '');
  const btStop = R.bt.filter(b => isOn(b.MayDung) && inP(String(b.TGBatDau).slice(0, 10)) && ok(b.IDThietBi));
  const planMin = btStop.reduce((s, b) => s + (Number(b.PhutDungMay) || 0), 0);
  const serFail = bks.map(() => 0), serPlan = bks.map(() => 0), serN = bks.map(() => 0);
  fail.forEach(x => { const i = bIdx[bcBucketOf(per, x._ev)]; if (i !== undefined) { serFail[i] += x._down / 60; serN[i]++; } });
  btStop.forEach(b => { const i = bIdx[bcBucketOf(per, String(b.TGBatDau).slice(0, 10))]; if (i !== undefined) serPlan[i] += (Number(b.PhutDungMay) || 0) / 60; });

  /* Theo máy: lần hỏng, giờ dừng, MTTR, giờ vận hành, MTBF */
  const byTb = {};
  const g = id => { const k = String(id).toUpperCase(); return byTb[k] || (byTb[k] = { id: k, nAll: 0, n: 0, down: 0, sua: [] }); };
  sc.forEach(x => { const o = g(x.IDThietBi); o.nAll++; if (x._stop) { o.n++; o.down += x._down; if (x.PhutSua !== '' && x.PhutSua !== undefined) o.sua.push(Number(x.PhutSua) || 0); } });
  const gcOf = (M, id) => { const a = R.gc[M] && R.gc[M].m[id]; return a && Number(a[1]) > 0 ? a : null; };
  allTb().forEach(tb => {
    const id = String(tb.ID).toUpperCase();
    if (ok(tb.ID) && (!MAY_NGUNG.includes(tb.TrangThai) || per.months.some(M => gcOf(M, id)))) g(tb.ID);
  });
  const gcMiss = per.months.some(M => M <= today.slice(0, 7) && !R.gc[M]);
  let opSum = 0, nSum = 0;
  Object.values(byTb).forEach(o => {
    const tb = tbById(o.id);
    const born = tb && tsU(tb.NgayTao);
    // Từng tháng: có ghi giờ chạy → giờ chạy thực; không ghi → giờ lịch (từ ngày thêm máy, tới hiện tại) trừ dừng do hỏng
    let run = 0, cal = 0, nGc = 0, nCal = 0;
    per.months.forEach(M => {
      const a = gcOf(M, o.id);
      if (a) { run += Number(a[0]) || 0; nGc++; return; }
      const m0 = Math.max(dMs(M + '-01'), fromMs, isFinite(born) ? born : -Infinity);
      const m1 = Math.min(dMs(mEnd(M)) + 86400000, endMs);
      if (m1 <= m0) return;
      cal += Math.max(0, (m1 - m0) / 3600000 - bcClipDown(R, o.id, m0, m1) / 60);
      nCal++;
    });
    o.src = nGc && nCal ? 'MIX' : (nGc ? 'GC' : 'LICH');
    o.op = run + cal;
    o.mttr = o.sua.length ? avgOf(o.sua) / 60 : null;
    o.mtbf = o.n ? o.op / o.n : null;
    o.tb = tb;
    opSum += o.op; nSum += o.n;
  });

  /* Pareto loại hư hỏng · khu vực · nhóm (mọi phiếu trong kỳ; giờ dừng từ phiếu dừng máy) */
  const agg = keyOf => {
    const m = {};
    sc.forEach(x => { const k = keyOf(x) || '_'; const o = m[k] || (m[k] = { k, n: 0, stops: 0, down: 0 }); o.n++; if (x._stop) { o.stops++; o.down += x._down; } });
    return Object.values(m);
  };
  const byLoai = agg(x => x.LoaiHong);
  const byKv = agg(x => { const tb = tbById(x.IDThietBi); return tb && tb.ViTri; });
  const byNhom = agg(x => { const tb = tbById(x.IDThietBi); return tb && tb.NhomTB; });

  return {
    per, f, bks, sc, fail, nAll: sc.length, nFail: fail.length, downH: downMin / 60, planH: planMin / 60,
    nLive: fail.filter(x => x._live).length,
    mttr: sua.length ? avgOf(sua) / 60 : null,
    mdt: closedStops.length ? avgOf(closedStops.map(x => Number(x.PhutDungMay) || 0)) / 60 : null,
    mtbf: nSum ? opSum / nSum : null, opSum, nSum, gcMiss,
    serFail, serPlan, serN, byTb, byLoai, byKv, byNhom,
    pm: bcPm(R, per, f, today, bks, bIdx),
    kt: bcKt(R, per, f, bks, bIdx),
    dd: bcDd(R, per, f),
    rca: bcRca(per, f, today)
  };
}

/** Bảo trì kế hoạch: các lần đến hạn trong kỳ (theo hạn kế hoạch), đã làm / đúng hạn / trễ / quá hạn chưa làm */
function bcPm(R, per, f, today, bks, bIdx) {
  const inP = d => d >= per.from && d <= per.to;
  const items = [];
  R.bt.forEach(b => {
    const due = String(b.HanKeHoach || b.TGKetThuc).slice(0, 10);
    if (!inP(due) || !bcTbOk(b.IDThietBi, f)) return;
    const ngay = String(b.TGKetThuc).slice(0, 10);
    const kh = khByMa(b.MaKH);
    const gio = kh ? khGio(kh) : 0;
    const hOk = !gio || b.GioChay === '' || b.GioLanTruoc === '' || b.GioChay === undefined || b.GioLanTruoc === undefined ||
      Number(b.GioChay) <= Number(b.GioLanTruoc) + gio;
    items.push({ kind: b.TrangThaiPhieu === 'DONG' ? 'done' : 'pend', due, ngay, onTime: !!ngay && ngay <= due && hOk, b });
  });
  const ST = khStatuses();
  let upcoming = 0;
  allKH().forEach(kh => {
    if (!bcTbOk(kh.IDThietBi, f)) return;
    const s = ST.get(kh.MaKH);
    if (s.st === 'QUAHAN') {
      let d = s.due && s.due < today ? s.due : null;
      if (s.hrs && s.hrs.st === 'QUAHAN') { const hd = khHrsCross(kh, s.hrs) || today; if (!d || hd < d) d = hd; }
      d = d || today;
      if (inP(d)) items.push({ kind: 'miss', due: d, onTime: false, kh, s });
    } else if (['DENHAN', 'CHUADEN', 'CHODUYET'].includes(s.st) && s.due && s.due >= today && inP(s.due)) upcoming++;
  });
  const cnt = list => {
    const c = { due: list.length, done: 0, pend: 0, miss: 0, onTime: 0 };
    list.forEach(x => { c[x.kind]++; if (x.onTime) c.onTime++; });
    c.made = c.done + c.pend;
    c.late = c.due - c.onTime;
    c.lateDone = c.made - c.onTime;
    c.pct = ratio(c.made, c.due);
    c.pctOn = ratio(c.onTime, c.due);
    return c;
  };
  const byB = bks.map(() => []);
  items.forEach(x => { const i = bIdx[bcBucketOf(per, x.due)]; if (i !== undefined) byB[i].push(x); });
  return Object.assign(cnt(items), { items, upcoming, byBucket: byB.map(cnt) });
}

/** Ngày kế hoạch theo giờ chạy bị vượt mốc: lần ghi đầu tiên có lũy kế ≥ mốc; lần ghi đó là lần sớm nhất đang có → ước lùi theo giờ chạy trung bình */
function khHrsCross(kh, h) {
  if (!h || h.base === null || h.now === null) return '';
  const lim = h.base + h.cyc;
  const k = String(kh.IDThietBi).toUpperCase();
  const rows = allGC().filter(x => String(x.IDThietBi).toUpperCase() === k && x.LuyKe !== '').sort((a, b) => String(a.Ngay).localeCompare(String(b.Ngay)));
  const i = rows.findIndex(x => Number(x.LuyKe) >= lim);
  if (i > 0) return rows[i].Ngay;
  const est = h.avg > 0 && h.ngay ? dAdd(h.ngay, -Math.floor((h.now - lim) / h.avg), 'NGAY') : '';
  if (i === 0) return est && est < rows[0].Ngay ? est : rows[0].Ngay;
  return est || h.ngay || '';
}

/** Kiểm tra đầu ca: số ca-máy phải kiểm tra / đã kiểm tra / có mục không đạt (chỉ tính các ca đã kết thúc) */
function bcKt(R, per, f, bks, bIdx) {
  const starts = caStarts();
  const now = caNow();
  const tbs = allTb().filter(tb => bcTbOk(tb.ID, f) && ktCanCheck(tb));
  const res = { req: 0, done: 0, bad: 0, missing: [], byTb: {}, ser: bks.map(() => ({ req: 0, done: 0, bad: 0 })), items: [] };
  const last = per.to < now.ngay ? per.to : now.ngay;
  for (let d = per.from; d <= last; d = dAdd(d, 1, 'NGAY')) {
    const M = d.slice(0, 7);
    const sm = R.kt[M];
    if (!sm) { if (!res.missing.includes(M)) res.missing.push(M); continue; }
    const day = Number(d.slice(8, 10));
    const bi0 = bIdx[bcBucketOf(per, d)];
    for (let ca = 1; ca <= starts.length; ca++) {
      if (caCmp({ ngay: d, ca: String(ca) }, now) >= 0) break;
      const st = dMs(d) + starts[ca - 1] * 60000;
      tbs.forEach(tb => {
        const id = String(tb.ID).toUpperCase();
        if (tb.NgayTao && String(tb.NgayTao).slice(0, 10) > d) return;
        if ((R.off[id] || []).some(([a, b]) => a <= st && st < b)) return;   // máy đang dừng / đang sửa: không bắt buộc
        const c = (sm.m[id] || '')[(day - 1) * 3 + ca - 1];
        const o = res.byTb[id] || (res.byTb[id] = { id, req: 0, done: 0, bad: 0, tb });
        o.req++; res.req++;
        if (bi0 !== undefined) res.ser[bi0].req++;
        if (c === 'o' || c === 'x') { o.done++; res.done++; if (bi0 !== undefined) res.ser[bi0].done++; }
        if (c === 'x') { o.bad++; res.bad++; if (bi0 !== undefined) res.ser[bi0].bad++; }
      });
    }
  }
  // Hạng mục hay không đạt (gộp theo tên hạng mục)
  const agg = {};
  per.months.forEach(M => {
    const sm = R.kt[M];
    if (!sm || !sm.hm) return;
    Object.keys(sm.hm).forEach(hk => {
      const [id, mb] = hk.split('|');
      if (!bcTbOk(id, f)) return;
      const its = mauBanItems(mb) || [];
      Object.keys(sm.hm[hk]).forEach(i => {
        const it = its[Number(i)];
        const vi = it ? it.HangMucVI : `${mb} #${Number(i) + 1}`;
        const key = norm(vi);
        const o = agg[key] || (agg[key] = { vi, zh: it ? it.HangMucZH : '', n: 0, tbs: new Set() });
        o.n += Number(sm.hm[hk][i]) || 0;
        o.tbs.add(id);
      });
    });
  });
  res.items = Object.values(agg).sort((a, b) => b.n - a.n);
  res.pct = ratio(res.done, res.req);
  res.pctBad = ratio(res.bad, res.done);
  return res;
}

/** Bảo trì dự đoán trong kỳ: số phiếu theo loại, điểm đo theo mức, điểm cảnh báo C–D */
function bcDd(R, per, f) {
  const inP = d => d >= per.from && d <= per.to;
  const list = R.dd.filter(r => inP(String(r.TGDo).slice(0, 10)) && bcTbOk(r.IDThietBi, f)).sort(ddSortDesc);
  const byLoai = { NHIET: 0, RUNG: 0, CACHDIEN: 0 };
  const lv = { A: 0, B: 0, C: 0, D: 0 };
  const alarms = [];
  list.forEach(r => {
    byLoai[r.Loai] = (byLoai[r.Loai] || 0) + 1;
    ddPts(r).forEach(p => {
      if (lv[p.m] !== undefined) lv[p.m]++;
      if (p.m === 'C' || p.m === 'D') alarms.push({ r, p });
    });
  });
  return { list, n: list.length, byLoai, lv, nPts: lv.A + lv.B + lv.C + lv.D, alarms };
}

/** RCA & hành động khắc phục trong kỳ */
function bcRca(per, f, today) {
  const inP = d => !!d && d >= per.from && d <= per.to;
  const rcas = allRCA().filter(r => bcTbOk(r.IDThietBi, f));
  const opened = rcas.filter(r => r.TrangThai !== 'HUY' && inP(String(r.NgayTao).slice(0, 10)));
  const closed = rcas.filter(r => r.TrangThai === 'DONG' && inP(String(r.TGKiemTraHL).slice(0, 10)));
  const first = closed.filter(r => Number(r.SoLanKTHL) === 1).length;
  const openNow = rcas.filter(r => r.TrangThai === 'MO').length;
  const live = new Set(rcas.filter(r => r.TrangThai !== 'HUY').map(r => String(r.SoRCA).toUpperCase()));
  let onTime = 0, late = 0, pending = 0;
  const lateList = [];
  allHDK().forEach(a => {
    if (!live.has(String(a.SoRCA).toUpperCase()) || !inP(a.Han)) return;
    if (a.NgayXong && a.NgayXong <= a.Han) onTime++;
    else if (a.NgayXong || a.Han < today) { late++; lateList.push(a); } else pending++;
  });
  const m6 = {};
  opened.forEach(r => { const k = r.NhomNguyenNhan || '_'; m6[k] = (m6[k] || 0) + 1; });
  return { opened, closed, first, openNow, onTime, late, pending, lateList, pctOn: ratio(onTime, onTime + late),
    pctFirst: ratio(first, closed.length), m6: Object.keys(m6).map(k => ({ k, n: m6[k] })) };
}

/* ---- Biểu đồ (SVG / HTML tự vẽ, không thư viện) ---- */
/** Trục y "đẹp": 0 · max/2 · max */
function niceMax(v) {
  if (!(v > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}
/** Cột có đầu tròn (bo 4px ở đầu, chân vuông) */
function barPath(x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h));
  return `M${x.toFixed(1)},${(y + h).toFixed(1)}V${(y + r).toFixed(1)}Q${x.toFixed(1)},${y.toFixed(1)} ${(x + r).toFixed(1)},${y.toFixed(1)}` +
    `H${(x + w - r).toFixed(1)}Q${(x + w).toFixed(1)},${y.toFixed(1)} ${(x + w).toFixed(1)},${(y + r).toFixed(1)}V${(y + h).toFixed(1)}Z`;
}
/**
 * Biểu đồ cột theo mốc thời gian. o = { id, bks: [{lbl, tip}], series: [{name, cls, vals}], max?, fmt(v) }
 * Cột mảnh ≤ 24px, đầu tròn, nhiều chuỗi thì xếp chồng với khe 2px; chạm / rê → ô giá trị của mọi chuỗi tại mốc đó.
 */
function colChart(o) {
  const W = 340, H = 150, L = 34, R = 6, T = 10, B = 20;
  const n = o.bks.length;
  const slot = (W - L - R) / Math.max(1, n);
  const bw = Math.max(2, Math.min(24, slot * 0.64));
  const tot = o.bks.map((_, i) => o.series.reduce((s, se) => s + (se.vals[i] || 0), 0));
  const max = o.max || niceMax(Math.max(0, ...tot));
  const ph = H - T - B;
  const Y = v => T + (1 - v / max) * ph;
  const fmt = o.fmt || (v => fmtH1(v));
  const grid = [0, max / 2, max].map(v => `<line class="cc-grid" x1="${L}" x2="${W - R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/>` +
    `<text class="cc-tick" x="${L - 5}" y="${(Y(v) + 3.5).toFixed(1)}" text-anchor="end">${esc(fmtNum(Math.round(v * 10) / 10))}${o.pct ? '%' : ''}</text>`).join('');
  let bars = '';
  o.bks.forEach((bk, i) => {
    const x = L + i * slot + (slot - bw) / 2;
    const segs = o.series.map((se, j) => ({ v: se.vals[i] || 0, cls: se.cls, j })).filter(s => s.v > 0);
    let base = H - B;
    segs.forEach((s, k) => {
      const h = Math.max(1.5, s.v / max * ph);
      const top = k === segs.length - 1;
      const gap = top ? 0 : Math.min(2, h / 2);
      bars += `<path class="cc-bar ${s.cls}" data-i="${i}" d="${top ? barPath(x, base - h, bw, h, 4) : barPath(x, base - h + gap, bw, h - gap, 0)}"/>`;
      base -= h;
    });
  });
  const step = n <= 12 ? 1 : (n <= 16 ? 2 : 5);
  const xl = o.bks.map((bk, i) => (n <= 12 || i === 0 || (i + 1) % step === 0) && !(n > 12 && i === n - 1 && (i + 1) % step !== 0 && (n - 1) % step < 2)
    ? `<text class="cc-tick" x="${(L + i * slot + slot / 2).toFixed(1)}" y="${H - 5}" text-anchor="middle">${esc(bk.lbl)}</text>` : '').join('');
  S.chart[o.id] = Object.assign({}, o, { max, slot, L, W, fmt });
  return `<div class="cc" data-cc="${esc(o.id)}"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.aria || '')}">${grid}${bars}${xl}
    <rect class="cc-hl" x="0" y="${T}" width="${slot.toFixed(1)}" height="${ph}" visibility="hidden"/></svg><div class="tr-tip cc-tip" hidden></div></div>`;
}
/** Chú giải cho biểu đồ ≥ 2 chuỗi (ô màu giống cột + tên) */
function ccLegend(series) {
  return `<div class="cc-leg">${series.map(s => `<span><i class="cc-sw ${s.cls}"></i>${biTr(s.name)}</span>`).join('')}</div>`;
}
function bindCharts() {
  $$('.cc[data-cc]').forEach(box => {
    const o = S.chart[box.dataset.cc];
    if (!o) return;
    const svg = $('svg', box), tip = $('.cc-tip', box), hl = $('.cc-hl', box);
    const show = ev => {
      const rc = svg.getBoundingClientRect();
      const px = (ev.clientX - rc.left) / rc.width * o.W;
      const i = Math.max(0, Math.min(o.bks.length - 1, Math.floor((px - o.L) / o.slot)));
      const bk = o.bks[i];
      hl.setAttribute('x', (o.L + i * o.slot).toFixed(1));
      hl.setAttribute('visibility', 'visible');
      const tp = bk.tip || { vi: bk.lbl, zh: '' };
      tip.innerHTML = `<div class="cc-th">${biTr(tp)}</div>` + o.series.map(s => `<div class="cc-row"><i class="cc-key ${s.cls}"></i><b>${esc(o.fmt(s.vals[i] || 0))}</b>${biTr(s.name)}</div>`).join('') +
        (o.extra ? o.extra(i) : '');
      tip.hidden = false;
      const cx = (o.L + (i + 0.5) * o.slot) / o.W * rc.width;
      tip.style.left = Math.max(0, Math.min(rc.width - tip.offsetWidth, cx - tip.offsetWidth / 2)) + 'px';
    };
    const hide = () => { tip.hidden = true; hl.setAttribute('visibility', 'hidden'); };
    svg.addEventListener('pointermove', show);
    svg.addEventListener('pointerdown', show);
    svg.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') hide(); });
    box.__hide = hide;
  });
}
/** Thanh ngang (HTML): nhãn + giá trị một dòng, thanh bên dưới — đọc tốt trên màn hình hẹp */
function hbars(rows, max) {
  max = max || Math.max(0, ...rows.map(r => r.v)) || 1;
  return `<div class="hb-list">${rows.map(r => {
    const w = r.v > 0 ? Math.max(1.5, r.v / max * 100) : 0;
    const tag = r.href ? 'a' : 'div';
    return `<${tag} class="hb"${r.href ? ` href="${esc(r.href)}"` : ''}>
      <div class="hb-top"><div class="hb-l">${r.lbl}</div><div class="hb-v">${r.txt}</div></div>
      <div class="hb-t"><i class="${r.cls || 'c1'}" style="width:${w.toFixed(1)}%"></i></div>
      ${r.sub ? `<div class="hb-s">${r.sub}</div>` : ''}
    </${tag}>`;
  }).join('')}</div>`;
}
/** Thanh 100% chia đoạn theo trạng thái (màu trạng thái luôn kèm chữ ở chú giải) */
function meterBar(segs) {
  const tot = segs.reduce((s, x) => s + x.n, 0);
  if (!tot) return '';
  return `<div class="mt">${segs.filter(s => s.n > 0).map(s => `<i class="${s.cls}" style="flex:${s.n}"></i>`).join('')}</div>
    <div class="mt-leg">${segs.map(s => `<span><i class="mt-sw ${s.cls}"></i><b>${fmtNum(s.n)}</b>${biTr(s.lbl)}</span>`).join('')}</div>`;
}
/** Bảng số liệu đi kèm biểu đồ (mở ra khi cần) */
function dataTable(head, rows) {
  return `<details class="bc-tbl"><summary>${ic('grid')}${t('bcDataTable')}</summary><div class="bt-wrap"><table class="bt">
    <thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td${i ? ' class="num"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;
}

/* ---- Thẻ chỉ số ---- */
function kpiTile(o) {
  const has = o.cur !== null && o.cur !== undefined && isFinite(o.cur);
  let d = '';
  if (has && o.prev !== null && o.prev !== undefined && isFinite(o.prev)) {
    const diff = Math.round((o.cur - o.prev) * 10) / 10;
    if (Math.abs(diff) < 0.05) d = `<div class="kpi-d same">${ic('skip')}${t('deltaSame')}</div>`;
    else {
      const up = diff > 0;
      const cls = !o.better ? 'neu' : ((o.better === 'up') === up ? 'good' : 'bad');
      const txt = (up ? '+' : '−') + (o.dfmt || fmtH1)(Math.abs(diff)) + (o.dunit || '');
      d = `<div class="kpi-d ${cls}">${ic(up ? 'up' : 'down')}<span>${esc(txt)}</span></div>`;
    }
  }
  const tag = o.href ? 'a' : 'div';
  return `<${tag} class="kpi${o.tone ? ' ' + o.tone : ''}"${o.href ? ` href="${esc(o.href)}"` : ''}>
    <div class="kpi-l">${t(o.key)}</div>
    <div class="kpi-v">${has ? esc(o.val) : '—'}${has && o.unit ? `<span class="kpi-u">${esc(o.unit)}</span>` : ''}</div>
    ${o.sub ? `<div class="kpi-s">${o.sub}</div>` : ''}
    ${d}
  </${tag}>`;
}

/* ---- Màn hình Báo cáo ---- */
VIEWS.bc = p => {
  if (!S.data) return loadingView();
  if (p[1] === 'may') return viewBcMay();
  const b = bcState();
  const P = bcPeriod(b);
  const key = bcKey(P.fetch);
  const R = bcHave(P.fetch);
  const busy = !!S.bcBusy[key];
  const err = S.bcErr[key];
  let body;
  if (!R) {
    body = err ? `<div class="card pad center">${errHtml(err)}<button class="btn" data-act="bcRetry">${ic('refresh')}${t('retry')}</button></div>`
      : (!S.online && !busy ? `<div class="empty">${ic('offline')}${t('bcNeedNet')}</div>`
        : `<div class="card pad center"><div class="spinner"></div><p class="muted">${t('bcLoading')}</p></div>`);
  } else {
    body = bcBody(bcStats(R, P.cur, b), bcStats(R, P.prev, b), R, P, busy);
  }
  return {
    title: 'bcTitle', back: 'them', live: true, restoreScroll: true,
    html: `
      <div class="toolbar sticky">
        <div class="seg bc-kind">${['M', 'Q', 'Y'].map(k => `<a data-act="bcKind" data-k="${k}" class="${b.k === k ? 'on' : ''}">${t('bcK' + k)}</a>`).join('')}</div>
        <div class="bc-nav">
          <button class="hbtn" data-act="bcStep" data-d="-1" aria-label="${esc(tp('bcPrevPer'))}">${ic('back')}</button>
          <div class="bc-per">${biTr(P.cur.lbl)}</div>
          <button class="hbtn" data-act="bcStep" data-d="1" aria-label="${esc(tp('bcNextPer'))}" ${bcIsLatest(b) ? 'disabled' : ''}>${ic('chev')}</button>
        </div>
        <div class="chips">
          <button class="chip${b.kv ? ' on' : ''}" data-act="bcFilter" data-k="kv">${ic('map')}${b.kv ? dmBi('KHUVUC', b.kv) : t('allAreas')}</button>
          <button class="chip${b.nhom ? ' on' : ''}" data-act="bcFilter" data-k="nhom">${ic('device')}${b.nhom ? dmBi('NHOMTB', b.nhom) : t('allGroups')}</button>
        </div>
      </div>
      ${body}`,
    after: () => {
      if (!R && !busy && !err && S.online) bcLoad(P.fetch);
      bindCharts();
    }
  };
};

async function bcLoad(f) {
  const k = bcKey(f);
  try { await bcFetch(f); delete S.bcErr[k]; } catch (e) { if (e.code !== 'AUTH') S.bcErr[k] = e; }
  if (S.cur && S.cur.name === 'bc' && !$('.overlay.open')) { const y = window.scrollY; render(true); window.scrollTo(0, y); }
}

/** Ngày bắt đầu có số liệu (máy đầu tiên được thêm vào app) — kỳ trước ngày này không đem ra so sánh */
function bcDataStart() {
  return allTb().reduce((m, tb) => { const d = String(tb.NgayTao || '').slice(0, 10); return d && (!m || d < m) ? d : m; }, '');
}
function bcBody(c, pv0, R, P, busy) {
  const b = c.f;
  const cmp = !!bcDataStart() && P.prev.to >= bcDataStart();
  const pv = cmp ? pv0 : { nFail: null, downH: null, mttr: null, mtbf: null, pm: { pct: null }, kt: { pct: null } };
  const prog = S.bcProg[bcKey(P.fetch)];
  const miss = c.kt.missing.length || c.gcMiss;
  const notes = [];
  if (busy || prog) notes.push(`<div class="notice">${ic('refresh')}<div>${t('bcPartial', prog || '…')}</div></div>`);
  else if (miss) notes.push(`<div class="notice warn">${ic('alert')}<div>${t('bcIncomplete')}</div><button class="btn sm" data-act="bcRetry">${t('retry')}</button></div>`);
  const pmSub = c.pm.due ? tr('bcPmSub', [c.pm.made, c.pm.due, fmtPct(c.pm.pctOn)]) : tr('bcNoDue');
  const ktSub = c.kt.req ? tr('bcKtSub', [fmtNum(c.kt.done), fmtNum(c.kt.req)]) : tr('bcKtNone');
  const tiles = [
    kpiTile({ key: 'kpiFail', val: fmtNum(c.nFail), cur: c.nFail, prev: pv.nFail, better: 'down', dfmt: fmtNum, sub: biTr(tr('bcOfTickets', [c.nAll])), href: '#/bc/may' }),
    kpiTile({ key: 'kpiDown', val: fmtH1(c.downH), unit: 'h', cur: c.downH, prev: pv.downH, better: 'down', dunit: ' h', tone: c.nLive ? 'live' : '',
      sub: c.nLive ? `<span class="bad-t">${biTr(tr('bcNLive', [c.nLive]))}</span>` : biTr(tr('bcPlanDown', [fmtH1(c.planH)])) }),
    kpiTile({ key: 'kpiMttr', val: fmtH1(c.mttr), unit: 'h', cur: c.mttr, prev: pv.mttr, better: 'down', dunit: ' h', sub: biTr(tr('bcMdtSub', [fmtH1(c.mdt)])) }),
    kpiTile({ key: 'kpiMtbf', val: fmtNum(Math.round(c.mtbf || 0)), unit: 'h', cur: c.mtbf, prev: pv.mtbf, better: 'up', dfmt: v => fmtNum(Math.round(v)), dunit: ' h',
      sub: biTr(c.nSum ? tr('bcMtbfSub', [fmtNum(Math.round(c.opSum)), c.nSum]) : tr('bcNoFail')), href: '#/bc/may' }),
    kpiTile({ key: 'kpiPm', val: fmtPct(c.pm.pct), cur: c.pm.pct === null ? null : c.pm.pct * 100, prev: pv.pm.pct === null ? null : pv.pm.pct * 100, better: 'up', dunit: ' %',
      sub: biTr(pmSub) }),
    kpiTile({ key: 'kpiKt', val: fmtPct(c.kt.pct), cur: c.kt.pct === null ? null : c.kt.pct * 100, prev: pv.kt.pct === null ? null : pv.kt.pct * 100, better: 'up', dunit: ' %',
      sub: biTr(ktSub) })
  ];
  return `${notes.join('')}
    <div class="kpi-grid">${tiles.join('')}</div>
    <p class="muted small bc-cmp">${ic('info')}${cmp ? t('bcCmpNote', P.prev.lbl) : t('bcNoCmp')}</p>
    ${bcDownCard(c)}
    ${bcParetoCard(c)}
    ${bcTopCard(c)}
    ${bcAreaCard(c)}
    ${bcPmCard(c)}
    ${bcKtCard(c)}
    ${bcDdCard(c)}
    ${bcRcaCard(c)}
    ${bcPrintCard(P)}
    <p class="muted small audit">${t('bcDefs')}</p>`;
}

function bcDownCard(c) {
  const series = [
    { name: tr('bcSerFail'), cls: 'c1', vals: c.serFail },
    { name: tr('bcSerPlan'), cls: 'c2', vals: c.serPlan }
  ];
  const any = c.serFail.some(v => v > 0) || c.serPlan.some(v => v > 0);
  const byDay = c.per.k === 'M';
  return `<section class="card">
    <div class="card-h">${ic('clock')}${t('bcDownChart')}<span class="sp"></span><span class="muted small">${t(byDay ? 'bcByDay' : 'bcByMonth')}</span></div>
    <div class="cc-body">
      ${any ? ccLegend(series) + colChart({ id: 'down', bks: c.bks, series, fmt: v => fmtH1(v) + ' h', aria: tp('bcDownChart'),
        extra: i => c.serN[i] ? `<div class="cc-row muted">${biTr(tr('bcNStops', [c.serN[i]]))}</div>` : '' })
        : `<div class="empty ok small">${ic('checkCircle')}${t('bcNoDown')}</div>`}
    </div>
    ${any ? dataTable([t(byDay ? 'bcDay' : 'bcMonthCol'), t('bcSerFail'), t('bcNStopsCol'), t('bcSerPlan')],
      c.bks.map((bk, i) => [esc(byDay ? fmtDate(bk.key) : monthTr(bk.key).vi), fmtH1(c.serFail[i]), fmtNum(c.serN[i]), fmtH1(c.serPlan[i])]).filter((r, i) => c.serFail[i] || c.serPlan[i])) : ''}
  </section>`;
}

/** Pareto: sắp giảm dần, nhóm chiếm ~80% tô màu nhấn, còn lại màu nhạt; ghi % lũy kế */
function paretoRows(list, valOf, lblOf, txtOf) {
  const tot = list.reduce((s, x) => s + valOf(x), 0);
  let cum = 0, vital = true;
  return list.filter(x => valOf(x) > 0).sort((a, b) => valOf(b) - valOf(a)).map(x => {
    const v = valOf(x);
    const cls = vital ? 'c1' : 'mute';
    cum += v;
    if (cum / tot >= 0.8) vital = false;
    return { v, lbl: lblOf(x), cls, txt: txtOf(x), sub: `<span class="muted">${biTr(tr('bcCum', [fmtPct(cum / tot)]))}</span>` };
  });
}
function bcParetoCard(c) {
  const b = c.f;
  const byH = b.pm === 'h';
  const valOf = x => byH ? x.down : x.n;
  const rows = paretoRows(c.byLoai, valOf, x => x.k === '_' ? `<span class="muted">${t('bcUnclassified')}</span>` : dmBi('LOAIHONG', x.k),
    x => byH ? `${fmtH1(x.down / 60)} h` : biTr(tr('bcNTickets', [x.n])));
  return `<section class="card">
    <div class="card-h">${ic('chart')}${t('bcPareto')}</div>
    <div class="cc-body">
      <div class="seg bc-mini">${[['n', 'bcByCount'], ['h', 'bcByHours']].map(([k, key]) => `<a data-act="bcSet" data-f="pm" data-v="${k}" class="${b.pm === k ? 'on' : ''}">${t(key)}</a>`).join('')}</div>
      ${rows.length ? hbars(rows) + `<div class="cc-leg"><span><i class="cc-sw c1"></i>${t('bcVital')}</span><span><i class="cc-sw mute"></i>${t('bcTrivial')}</span></div>`
        : `<div class="empty ok small">${ic('checkCircle')}${t(c.nAll ? 'bcNoDownPareto' : 'bcNoTickets')}</div>`}
    </div>
  </section>`;
}

function bcTopCard(c) {
  const list = Object.values(c.byTb).filter(o => o.n > 0).sort((a, b) => b.down - a.down || b.n - a.n).slice(0, 8);
  return `<section class="card">
    <div class="card-h">${ic('alert')}${t('bcTopTb')}</div>
    <div class="cc-body">
      ${list.length ? hbars(list.map(o => ({
        v: o.down, href: '#/tb/' + encodeURIComponent(o.id),
        lbl: `<span class="tb-id">${esc(o.id)}</span> <span class="hb-name">${esc(o.tb ? o.tb.TenMay : '')}</span>`,
        txt: `${fmtH1(o.down / 60)} h`,
        sub: biTr(tr('bcTbSub', [o.n, fmtH1(o.mttr), o.mtbf === null ? '—' : fmtNum(Math.round(o.mtbf))]))
      }))) : `<div class="empty ok small">${ic('checkCircle')}${t('bcNoFail')}</div>`}
    </div>
    <div class="card-f"><a class="link" href="#/bc/may">${t('bcAllTbTable')}</a><span class="sp"></span>${ic('chev', 'mi-chev')}</div>
  </section>`;
}

function bcAreaCard(c) {
  const b = c.f;
  const kv = b.by !== 'nhom';
  const list = (kv ? c.byKv : c.byNhom).slice().sort((a, x) => x.down - a.down || x.n - a.n);
  const rows = list.map(o => ({
    v: o.down || 0, lbl: o.k === '_' ? '<span class="muted">—</span>' : dmBi(kv ? 'KHUVUC' : 'NHOMTB', o.k),
    txt: `${fmtH1(o.down / 60)} h`, sub: biTr(tr('bcAreaSub', [o.n, o.stops]))
  }));
  return `<section class="card">
    <div class="card-h">${ic('map')}${t(kv ? 'bcByArea' : 'bcByGroup')}</div>
    <div class="cc-body">
      <div class="seg bc-mini">${[['kv', 'fViTri'], ['nhom', 'fNhomTB']].map(([k, key]) => `<a data-act="bcSet" data-f="by" data-v="${k}" class="${(kv ? 'kv' : 'nhom') === k ? 'on' : ''}">${t(key)}</a>`).join('')}</div>
      ${rows.length ? hbars(rows, Math.max(...rows.map(r => r.v)) || 1) : `<div class="empty small">${t('bcNoTickets')}</div>`}
    </div>
  </section>`;
}

function bcPmCard(c) {
  const pm = c.pm;
  const late = pm.items.filter(x => !x.onTime).sort((a, b) => String(a.due).localeCompare(String(b.due))).slice(0, 8);
  const byMonth = c.per.k !== 'M';
  return `<section class="card">
    <div class="card-h">${ic('calendar')}${t('bcPm')}<span class="sp"></span><a class="link small" href="#/bt">${t('bcOpen')}</a></div>
    <div class="cc-body">
      ${pm.due ? `<div class="big2">
          <div><b>${fmtPct(pm.pct)}</b>${t('bcPmDone')}</div>
          <div><b>${fmtPct(pm.pctOn)}</b>${t('bcPmOnTimePct')}</div>
        </div>
        ${meterBar([{ n: pm.onTime, cls: 'ok', lbl: tr('bcPmOnTime') }, { n: pm.lateDone, cls: 'warn', lbl: tr('bcPmLateDone') }, { n: pm.miss, cls: 'bad', lbl: tr('bcPmMiss') }])}
        ${pm.pend ? `<p class="muted small">${t('bcPmPend', pm.pend)}</p>` : ''}
        ${byMonth ? colChart({ id: 'pm', bks: c.bks, series: [{ name: tr('bcPmDone'), cls: 'c1', vals: pm.byBucket.map(x => x.pct === null ? 0 : Math.round(x.pct * 1000) / 10) }],
          max: 100, pct: true, fmt: v => fmtNum(v) + '%', aria: tp('bcPm'),
          extra: i => pm.byBucket[i].due ? `<div class="cc-row muted">${biTr(tr('bcPmCell', [pm.byBucket[i].made, pm.byBucket[i].due]))}</div>` : '' }) : ''}
        ${late.length ? `<div class="bc-sub">${t('bcPmLateList')}</div><div class="mini-list flat">${late.map(x => bcPmLateItem(x)).join('')}</div>` : ''}`
        : `<div class="empty small">${t('bcNoDue')}</div>`}
      ${pm.upcoming ? `<p class="muted small">${t('bcPmUpcoming', pm.upcoming)}</p>` : ''}
    </div>
  </section>`;
}
function bcPmLateItem(x) {
  const today = dToday();
  if (x.kind === 'miss') {
    const kh = x.kh;
    return `<a class="mini kh-QUAHAN" href="#/kh/${encodeURIComponent(kh.MaKH)}"><div class="mini-main">
      <div class="sc-tbline"><span class="tb-id">${esc(kh.IDThietBi)}</span> <span class="tb-name">${esc(x.s.tb ? x.s.tb.TenMay : '')}</span></div>
      <div class="kh-name">${bi(kh.TenVI, kh.TenZH)}</div></div>
      <span class="tag bad">${biTr(tr('dueLate', [Math.max(0, dDiff(x.due, today))]))}</span></a>`;
  }
  const bt = x.b;
  const tb = tbById(bt.IDThietBi);
  const d = dDiff(x.due, x.ngay);
  return `<a class="mini kh-DENHAN" href="#/bt/${encodeURIComponent(bt.SoPhieu)}"><div class="mini-main">
    <div class="sc-tbline"><span class="tb-id">${esc(bt.IDThietBi)}</span> <span class="tb-name">${esc(tb ? tb.TenMay : '')}</span></div>
    <div class="kh-name">${bi(bt.TenVI, bt.TenZH)}</div></div>
    <span class="tag warn">${biTr(d > 0 ? tr('timeLate', [d]) : tr('bcLateHours'))}</span></a>`;
}

function bcKtCard(c) {
  const k = c.kt;
  const low = Object.values(k.byTb).filter(o => o.req > 0 && o.done < o.req).sort((a, b) => a.done / a.req - b.done / b.req || b.req - a.req).slice(0, 5);
  const byDay = c.per.k === 'M';
  return `<section class="card">
    <div class="card-h">${ic('checklist')}${t('shiftCheck')}<span class="sp"></span><a class="link small" href="#/kt">${t('bcOpen')}</a></div>
    <div class="cc-body">
      ${k.req ? `<div class="big2">
          <div><b>${fmtPct(k.pct)}</b>${t('bcKtRate')}</div>
          <div><b>${fmtPct(k.pctBad)}</b>${t('bcKtBadRate')}</div>
        </div>
        ${colChart({ id: 'kt', bks: c.bks, series: [{ name: tr('bcKtRate'), cls: 'c1', vals: k.ser.map(x => x.req ? Math.round(x.done / x.req * 1000) / 10 : 0) }],
          max: 100, pct: true, fmt: v => fmtNum(v) + '%', aria: tp('shiftCheck'),
          extra: i => k.ser[i].req ? `<div class="cc-row muted">${biTr(tr('bcKtCell', [k.ser[i].done, k.ser[i].req, k.ser[i].bad]))}</div>` : '' })}
        ${low.length ? `<div class="bc-sub">${t('bcKtLow')}</div>${hbars(low.map(o => ({ v: o.done / o.req * 100, href: '#/tb/' + encodeURIComponent(o.id), cls: 'c1',
          lbl: `<span class="tb-id">${esc(o.id)}</span> <span class="hb-name">${esc(o.tb ? o.tb.TenMay : '')}</span>`,
          txt: fmtPct(o.done / o.req), sub: biTr(tr('bcKtTbSub', [o.done, o.req])) })), 100)}` : ''}
        ${k.items.length ? `<div class="bc-sub">${t('bcKtItems')}</div>${hbars(k.items.slice(0, 6).map(x => ({ v: x.n, cls: 'c1', lbl: bi(x.vi, x.zh),
          txt: biTr(tr('bcNTimes', [x.n])), sub: biTr(tr('bcKtItemSub', [x.tbs.size])) })))}` : ''}
        <p class="muted small">${t('bcKtNote')}</p>`
        : `<div class="empty small">${t('bcKtNone')}</div>`}
    </div>
  </section>`;
}

function bcDdCard(c) {
  const d = c.dd;
  const al = d.alarms.slice(0, 6);
  return `<section class="card">
    <div class="card-h">${ic('pulse')}${t('predictive')}<span class="sp"></span><a class="link small" href="#/dd">${t('bcOpen')}</a></div>
    <div class="cc-body">
      ${d.n ? `<div class="bc-3">${DD_LOAI.map(l => `<div>${ddLoaiBi(l, 'sm')}<b>${fmtNum(d.byLoai[l] || 0)}</b></div>`).join('')}</div>
        <div class="bc-sub">${t('bcDdPts', d.nPts)}</div>
        ${meterBar(DD_MUC.map(m => ({ n: d.lv[m], cls: 'lv-' + m.toLowerCase(), lbl: tr('ddM' + m) })))}
        ${al.length ? `<div class="bc-sub">${t('bcDdAlarm')}</div><div class="mini-list flat">${al.map(({ r, p }) => `<a class="mini dd-${esc(p.m)}" href="#/dd/${encodeURIComponent(r.SoPhieu)}">
          <div class="mini-main"><div class="sc-tbline"><span class="tb-id">${esc(r.IDThietBi)}</span> <span class="tb-name">${esc((tbById(r.IDThietBi) || {}).TenMay || '')}</span></div>
          <div class="small"><b>${esc(p.t)}</b> · ${esc(ddXTxt(r.Loai, p.x))} · <span class="muted">${esc(fmtDate(r.TGDo))}</span></div></div>${ddMucPill(p.m)}</a>`).join('')}</div>` : ''}`
        : `<div class="empty small">${t('bcDdNone')}</div>`}
    </div>
  </section>`;
}

function bcRcaCard(c) {
  const r = c.rca;
  const rows = r.m6.slice().sort((a, b) => b.n - a.n).map(x => ({ v: x.n, cls: x.k === '_' ? 'mute' : 'c1',
    lbl: x.k === '_' ? `<span class="muted">${t('bcNoRootYet')}</span>` : t('m6' + x.k), txt: fmtNum(x.n) }));
  return `<section class="card">
    <div class="card-h">${ic('target')}${t('bcRca')}<span class="sp"></span><a class="link small" href="#/rca">${t('bcOpen')}</a></div>
    <div class="cc-body">
      <div class="bc-4">
        <div><b>${fmtNum(r.opened.length)}</b>${t('bcRcaNew')}</div>
        <div><b>${fmtNum(r.closed.length)}</b>${t('bcRcaClosed')}</div>
        <div><b>${fmtPct(r.pctOn)}</b>${t('bcActOnTime')}</div>
        <div><b>${fmtPct(r.pctFirst)}</b>${t('bcFirstEff')}</div>
      </div>
      <p class="muted small">${t('bcRcaNow', r.openNow, r.late)}</p>
      ${rows.length ? `<div class="bc-sub">${t('bc6M')}</div>${hbars(rows)}` : ''}
    </div>
  </section>`;
}

/* ---- Bảng MTBF / MTTR theo máy ---- */
const BC_SORT = [['down', 'bcSortDown'], ['n', 'bcSortN'], ['mtbf', 'bcSortMtbf'], ['mttr', 'bcSortMttr']];
function bcTbRows(c) {
  const b = c.f;
  const list = Object.values(c.byTb).filter(o => b.all || o.nAll > 0);
  const val = { down: o => o.down, n: o => o.n, mtbf: o => (o.mtbf === null ? Infinity : o.mtbf), mttr: o => (o.mttr === null ? -1 : o.mttr) }[b.sort] || (o => o.down);
  const asc = b.sort === 'mtbf';
  return list.sort((x, y) => (asc ? val(x) - val(y) : val(y) - val(x)) || String(x.id).localeCompare(String(y.id), 'en', { numeric: true }));
}
function viewBcMay() {
  const b = bcState();
  const P = bcPeriod(b);
  const R = bcHave(P.fetch);
  if (!R) { location.replace('#/bc'); return loadingView(); }
  const c = bcStats(R, P.cur, b);
  const rows = bcTbRows(c);
  return {
    title: 'bcTbTitle', back: 'bc', live: true, restoreScroll: true,
    html: `
      <div class="toolbar sticky">
        <div class="bc-per center">${biTr(P.cur.lbl)}${b.kv || b.nhom ? `<span class="muted small">${[b.kv && dmVi('KHUVUC', b.kv), b.nhom && dmVi('NHOMTB', b.nhom)].filter(Boolean).map(esc).join(' · ')}</span>` : ''}</div>
        <div class="chips">${BC_SORT.map(([k, key]) => `<button class="chip${b.sort === k ? ' on' : ''}" data-act="bcSet" data-f="sort" data-v="${k}">${t(key)}</button>`).join('')}
          <button class="chip${b.all ? ' on' : ''}" data-act="bcSet" data-f="all" data-v="${b.all ? '' : '1'}">${ic(b.all ? 'check' : 'plus')}${t('bcShowAll')}</button></div>
      </div>
      <div class="list-bar"><span class="muted">${t('nDevices', rows.length)}</span><span class="sp"></span><button class="link" data-act="bcTbCsv">${t('exportCsv')}</button></div>
      ${rows.length ? `<div class="bt-wrap card"><table class="bt tb-tbl">
        <thead><tr><th class="stick">${t('bcColTb')}</th><th>${t('bcColFail')}</th><th>${t('bcColDown')}</th><th>${t('bcColMttr')}</th><th>${t('bcColMtbf')}</th><th>${t('bcColOp')}</th></tr></thead>
        <tbody>${rows.map(o => `<tr>
          <th class="stick"><a href="#/tb/${encodeURIComponent(o.id)}"><span class="tb-id">${esc(o.id)}</span><span class="tbl-name">${esc(o.tb ? o.tb.TenMay : '')}</span></a></th>
          <td class="num">${fmtNum(o.n)}${o.nAll > o.n ? `<span class="muted small"> / ${fmtNum(o.nAll)}</span>` : ''}</td>
          <td class="num">${fmtH1(o.down / 60)}</td>
          <td class="num">${fmtH1(o.mttr)}</td>
          <td class="num">${o.mtbf === null ? '—' : fmtNum(Math.round(o.mtbf))}</td>
          <td class="num">${fmtNum(Math.round(o.op))}<span class="src ${o.src}">${t(o.src === 'GC' ? 'bcSrcGC' : (o.src === 'MIX' ? 'bcSrcMix' : 'bcSrcCal'))}</span></td>
        </tr>`).join('')}</tbody></table></div>` : `<div class="empty ok">${ic('checkCircle')}${t('bcNoFail')}</div>`}
      <p class="muted small">${t('bcTbNote')}</p>`
  };
}
function exportBcTbCsv() {
  const b = bcState();
  const P = bcPeriod(b);
  const R = bcHave(P.fetch);
  if (!R) return;
  const c = bcStats(R, P.cur, b);
  const head = ['ID', 'Tên máy / 设备名称', 'Khu vực / 区域', 'Nhóm / 类别', 'Lần hỏng dừng máy / 故障停机次数', 'Tổng phiếu / 维修单数',
    'Giờ dừng / 停机小时', 'MTTR (h)', 'MTBF (h)', 'Giờ vận hành / 运行小时', 'Nguồn giờ / 小时来源'];
  const rows = [head].concat(bcTbRows(c).map(o => [o.id, o.tb ? o.tb.TenMay : '', o.tb ? dmVi('KHUVUC', o.tb.ViTri) : '', o.tb ? dmVi('NHOMTB', o.tb.NhomTB) : '',
    o.n, o.nAll, Math.round(o.down / 6) / 10, o.mttr === null ? '' : Math.round(o.mttr * 10) / 10, o.mtbf === null ? '' : Math.round(o.mtbf),
    Math.round(o.op), o.src === 'GC' ? 'Giờ chạy / 运行记录' : (o.src === 'MIX' ? 'Giờ chạy + giờ lịch / 运行记录+日历小时' : 'Giờ lịch / 日历小时')]));
  downloadCsv(`mtbf-mttr_${P.cur.tu}${P.cur.den !== P.cur.tu ? '_' + P.cur.den : ''}.csv`, rows);
}

/* ===================== Bản in A4 song ngữ (khung kiểm soát tài liệu như bộ biểu mẫu cơ điện) ===================== */
const PRINT_FORMS = [
  ['CĐ-TB-02', 'pfTB02'], ['CĐ-BT-01', 'pfBT01'], ['CĐ-BT-03', 'pfBT03'], ['CĐ-BT-04', 'pfBT04'], ['CĐ-BT-05', 'pfBT05'],
  ['CĐ-BT-07', 'pfBT07'], ['CĐ-BT-08', 'pfBT08'], ['CĐ-SC-02', 'pfSC02'], ['CĐ-SC-04', 'pfSC04'], ['CĐ-SC-05', 'pfSC05'],
  ['CĐ-BC-01', 'pfBC01'], ['CĐ-BC-03', 'pfBC03']
];
function pfKey(code) { const x = PRINT_FORMS.find(f => f[0] === code); return x ? x[1] : ''; }
function banIn() {
  const o = jparse(S.data && S.data.cauHinh && S.data.cauHinh.BanIn, null);
  return o && typeof o === 'object' ? { cv: o.cv || '', cz: o.cz || '', f: o.f && typeof o.f === 'object' ? o.f : {} } : { cv: '', cz: '', f: {} };
}
const P_DOTS = '……………';
/** Ô nhãn song ngữ trong bản in (Việt trên, Trung dưới) */
function pl(x) { return biTr(typeof x === 'string' ? (T[x] ? tr(x) : { vi: x, zh: '' }) : x); }
function pv(v) { return v === '' || v === null || v === undefined ? '' : esc(v); }
/** Khung đầu 4 dòng: tên công ty / bộ phận · tên biểu mẫu · mã số, lần ban hành, ngày hiệu lực, ngày in */
function docHead(code, sub) {
  const b = banIn();
  const f = b.f[code] || [];
  const title = tr(pfKey(code));
  const now = tsNow();
  return `<table class="d-head"><tr>
      <td class="d-co" rowspan="4">${b.cv ? `<div class="d-cv">${esc(b.cv)}</div>` : ''}${b.cz ? `<div class="d-cz">${esc(b.cz)}</div>` : ''}<div class="d-dept">${pl('pDept')}</div></td>
      <td class="d-title" rowspan="4"><div class="d-tvi">${esc(title.vi)}</div><div class="d-tzh">${esc(title.zh)}</div>${sub ? `<div class="d-sub">${sub}</div>` : ''}</td>
      <td class="d-k">${pl('pCode')}</td><td class="d-v"><b>${esc(code)}</b></td></tr>
    <tr><td class="d-k">${pl('pRev')}</td><td class="d-v">${esc(f[0] || '00')}</td></tr>
    <tr><td class="d-k">${pl('pEff')}</td><td class="d-v">${f[1] ? esc(fmtDate(f[1])) : P_DOTS}</td></tr>
    <tr><td class="d-k">${pl('pPrinted')}</td><td class="d-v">${esc(fmtDate(now))}</td></tr></table>`;
}
/** Bảng thông tin: items [[nhãn, giá trị html, rộng?]] — 2 cặp mỗi dòng, mục "rộng" chiếm cả dòng */
function docInfo(items) {
  const rows = [];
  let cur = [];
  items.filter(Boolean).forEach(it => {
    if (it[2]) { if (cur.length) { rows.push(cur); cur = []; } rows.push([it]); return; }
    cur.push(it);
    if (cur.length === 2) { rows.push(cur); cur = []; }
  });
  if (cur.length) rows.push(cur);
  return `<table class="d-info"><colgroup><col class="c-k"><col class="c-v"><col class="c-k"><col class="c-v"></colgroup>${rows.map(r => r.length === 1
    ? `<tr><th>${pl(r[0][0])}</th><td colspan="${r[0][2] ? 3 : 1}"${r[0][3] && !r[0][1] ? ` style="height:${r[0][3]}mm"` : ''}>${r[0][1] || ''}</td>${r[0][2] ? '' : '<th></th><td></td>'}</tr>`
    : `<tr>${r.map(x => `<th>${pl(x[0])}</th><td>${x[1] || ''}</td>`).join('')}</tr>`).join('')}</table>`;
}
function docSec(x, n) { return `<div class="d-sec">${n ? `<span class="d-no">${n}</span>` : ''}${pl(x)}</div>`; }
function docBox(label, text, lines) {
  return `<table class="d-box"><tr><th>${pl(label)}</th></tr><tr><td class="pre" style="height:${text ? 'auto' : (lines || 2) * 6 + 'mm'}">${text ? esc(text) : ''}</td></tr></table>`;
}
/** Bảng dữ liệu: heads [[nhãn, rộng (mm hoặc ''), lớp]]; rows: mảng ô html; foot: dòng tổng (tùy chọn) */
function docTable(heads, rows, o) {
  o = o || {};
  const cols = heads.map(h => `<col${h[1] ? ` style="width:${h[1]}"` : ''}>`).join('');
  const empty = !rows.length ? `<tr><td colspan="${heads.length}" class="d-empty">${pl(o.empty || 'pNoData')}</td></tr>` : '';
  const blanks = Array.from({ length: Math.max(0, (o.minRows || 0) - rows.length) }, () => `<tr class="d-blank">${heads.map(() => '<td></td>').join('')}</tr>`).join('');
  return `<table class="d-tbl${o.cls ? ' ' + o.cls : ''}"><colgroup>${cols}</colgroup>
    <thead><tr>${heads.map(h => `<th class="${h[2] || ''}">${pl(h[0])}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td class="${heads[i] && heads[i][2] ? heads[i][2] : ''}">${c === null || c === undefined ? '' : c}</td>`).join('')}</tr>`).join('')}${empty}${blanks}</tbody>
    ${o.foot ? `<tfoot><tr>${o.foot}</tr></tfoot>` : ''}</table>`;
}
function docChk(on, x) { return `<span class="d-chk"><span class="d-box1">${on ? '✔' : ''}</span>${pl(x)}</span>`; }
/** Khối ký: roles [[nhãn, họ tên đã biết, ngày]] */
function docSign(roles) {
  return `<table class="d-sign"><tr>${roles.map(r => `<td>
      <div class="d-role">${pl(r[0])}</div><div class="d-signhint">${pl('pSignHint')}</div>
      <div class="d-signspace"></div>
      <div class="d-signname">${r[1] ? esc(r[1]) : P_DOTS + P_DOTS}</div>
      <div class="d-signdate">${pl({ vi: 'Ngày ' + (r[2] ? fmtDate(r[2]) : '…… / …… / ………'), zh: '日期 ' + (r[2] ? fmtDate(r[2]) : '…… / …… / ………') })}</div>
    </td>`).join('')}</tr></table>`;
}
function docFoot() {
  return `<div class="d-foot">${pl(tr('pFoot', [fmtTime(tsNow()), S.name || '—']))}</div>`;
}
function docLegend(items) { return `<div class="d-legend">${items.map(x => `<span>${pl(x)}</span>`).join('')}</div>`; }
/** In: đặt nội dung vào #print-root, khổ A4 dọc / ngang, số trang ở chân trang (trình duyệt hỗ trợ) */
function printDoc(code, orient, inner) {
  const root = $('#print-root');
  root.innerHTML = `<div class="doc ${orient}">${inner}</div>`;
  let st = $('#pg-style');
  if (!st) { st = document.createElement('style'); st.id = 'pg-style'; document.head.appendChild(st); }
  st.textContent = `@media print { @page { size: A4 ${orient}; margin: 9mm 9mm 11mm 9mm;
    @bottom-right { content: "${code} · Trang " counter(page) "/" counter(pages) " · 第" counter(page) "/" counter(pages) "页"; font: 7pt Arial, sans-serif; color: #555; } } }`;
  document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => window.print(), 250);
}
function tbText(id) { const tb = tbById(id); return tb ? `${esc(tb.ID)}${tb.MaNhaMay ? ` (${esc(tb.MaNhaMay)})` : ''} – ${esc(tb.TenMay)}${tb.TenMayZH ? `<br><span class="zh">${esc(tb.TenMayZH)}</span>` : ''}` : esc(id); }
function tbShort(id) { const tb = tbById(id); return `${esc(id)}${tb ? ' ' + esc(tb.TenMay) : ''}`; }
function dmPrint(loai, ma) { return ma ? bi(dmVi(loai, ma), dmZh(loai, ma)) : ''; }
function hmin(min) { return min === '' || min === null || min === undefined || !isFinite(Number(min)) ? '' : fmtNum(Number(min)); }
function hh(min) { return min === '' || min === null || min === undefined || !isFinite(Number(min)) ? '' : fmtH1(Number(min) / 60); }
function filterSub(f) {
  const a = [f.kv && tr('pFltKv', [{ vi: dmVi('KHUVUC', f.kv), zh: dmZh('KHUVUC', f.kv) }]), f.nhom && tr('pFltNhom', [{ vi: dmVi('NHOMTB', f.nhom), zh: dmZh('NHOMTB', f.nhom) }])].filter(Boolean);
  return a.length ? biTr({ vi: a.map(x => x.vi).join(' · '), zh: a.map(x => x.zh).join(' · ') }) : '';
}
function perSub(per, f) { return `${biTr(per.lbl)}${filterSub(f) ? `<div>${filterSub(f)}</div>` : ''}`; }

/* ---- CĐ-SC-02 · Phiếu công việc / báo cáo sửa chữa ---- */
function printSc02(so) {
  const sc = scBySo(so);
  if (!sc) return;
  const tb = tbById(sc.IDThietBi);
  const may = isOn(sc.MayDung);
  const cats = dmList('LOAIHONG', true);
  const d = scDownMin(sc);
  const steps = [
    ['pStepBao', sc.TGBao, sc.NguoiBao || sc.NguoiTao, ''],
    ['scTGNhan', sc.TGNhan, sc.NguoiNhan, ''],
    Number(sc.PhutCho) > 0 || sc.LyDoCho ? ['scDurWait', sc.TGBatDauCho, '', `${sc.LyDoCho ? esc(sc.LyDoCho) + ' · ' : ''}${esc(fmtDur(Number(sc.PhutCho) || 0).vi)}`] : null,
    ['scTGHoanThanh', sc.TGHoanThanh, sc.NguoiThucHien, ''],
    may ? ['scTGChayLai', sc.TGChayLai, '', sc.TTMaySau ? esc(dmVi('TRANGTHAI', sc.TTMaySau)) : ''] : null,
    ['pStepDuyet', sc.TGDuyet, sc.NguoiDuyet, sc.YKienDuyet ? esc(sc.YKienDuyet) : '']
  ].filter(Boolean);
  const html = `${docHead('CĐ-SC-02', `<span class="d-no2">${esc(sc.SoPhieu)}</span>`)}
    ${docInfo([
      ['scDetail', `<b>${esc(sc.SoPhieu)}</b>`], ['fTrangThai', pl('sc' + sc.TrangThaiPhieu)],
      ['scMay', tbText(sc.IDThietBi), true],
      ['fViTri', tb ? dmPrint('KHUVUC', tb.ViTri) : ''], ['fNhomTB', tb ? dmPrint('NHOMTB', tb.NhomTB) : ''],
      ['scNguoiBao', pv(sc.NguoiBao)], ['scTGBao', pv(fmtTime(sc.TGBao))],
      ['scMayDung', `${docChk(may, 'pYes')} ${docChk(!may, 'pNo')}`], ['scTGDung', may ? pv(fmtTime(sc.TGDung)) : ''],
      sc.PhieuNguon ? ['pFromTicket', pv(sc.PhieuNguon)] : null,
      ['pMoTaHong', `<span class="pre">${pv(sc.MoTa)}</span>`, true, 8]
    ])}
    ${docSec('pProgress')}
    ${docTable([['pStep', '22mm']].concat(steps.map(x => [x[0], ''])),
      [[pl('pTime')].concat(steps.map(x => pv(fmtTime(x[1])))), [pl('pPerson')].concat(steps.map(x => pv(x[2]))),
        [pl('fGhiChu')].concat(steps.map(x => x[3]))], { cls: 'small' })}
    ${docSec('pResult')}
    <div class="d-line"><span class="d-lbl">${pl('scLoaiHong')}</span> ${cats.map(c => docChk(sc.LoaiHong === c.Ma, { vi: c.TenVI, zh: c.TenZH })).join(' ')}</div>
    ${docInfo([
      ['scNguyenNhan', sc.NguyenNhan ? `<span class="pre">${pv(sc.NguyenNhan)}</span>` : '', true, 10],
      ['scCachXuLy', sc.CachXuLy ? `<span class="pre">${pv(sc.CachXuLy)}</span>` : '', true, 14],
      ['scVatTu', sc.VatTu ? `<span class="pre">${pv(sc.VatTu)}</span>` : '', true, 8],
      ['scNhaThau', sc.NhaThau ? pv(sc.NhaThau) : pl('pInHouse')], ['scNguoiThucHien', pv(sc.NguoiThucHien)],
      ['scDurResp', sc.PhutPhanHoi !== '' ? pl(fmtDur(Number(sc.PhutPhanHoi))) : ''], ['scDurRepair', sc.PhutSua !== '' ? pl(fmtDur(Number(sc.PhutSua))) : ''],
      ['scDurWait', Number(sc.PhutCho) ? pl(fmtDur(Number(sc.PhutCho))) : ''], ['scDurDown', may && d ? pl(fmtDur(d.min)) + (d.live ? ' *' : '') : (may ? '' : pl('scNA'))]
    ])}
    <div class="d-line">${pl('pInProd')} ${docChk(false, 'pYesSC03')} ${docChk(false, 'pNo')}</div>
    ${sc.YKienDuyet ? docInfo([['scYKien', `<span class="pre">${pv(sc.YKienDuyet)}</span>`, true]]) : ''}
    ${docSign([['pSignKTV', sc.NguoiThucHien], ['pSignToTruong', ''], ['pSignDuyet', sc.NguoiDuyet, sc.TGDuyet]])}
    ${docFoot()}`;
  printDoc('CĐ-SC-02', 'portrait', html);
}

/* ---- CĐ-BT-03 · Checklist bảo trì (kết quả một phiếu) ---- */
async function printBt03(so) {
  const bt0 = btBySo(so);
  if (!bt0) return;
  if (!S.btKQ[so]) { if (!needOnline()) return; toast('pPreparing'); await loadBtKQ(so, true); }
  const bt = btBySo(so), kq = S.btKQ[so] || [];
  const kh = khByMa(bt.MaKH);
  const tb = tbById(bt.IDThietBi);
  const nBad = Number(bt.SoMucKhongDat) || 0;
  const linked = allSC().filter(x => x.PhieuNguon === bt.SoPhieu).map(x => x.SoPhieu);
  const html = `${docHead('CĐ-BT-03', `${bi(bt.TenVI, bt.TenZH)}`)}
    ${docInfo([
      ['pTicketNo', `<b>${esc(bt.SoPhieu)}</b>`], ['fTrangThai', pl('bt' + bt.TrangThaiPhieu)],
      ['scMay', tbText(bt.IDThietBi), true],
      ['fViTri', tb ? dmPrint('KHUVUC', tb.ViTri) : ''], ['pPlanCode', pv(bt.MaKH)],
      ['khTenVI', bi(bt.TenVI, bt.TenZH), true],
      ['khCycle', kh ? biTr(cycleTr(kh)) : ''], ['khDue', pv(fmtDate(bt.HanKeHoach))],
      ['btStart', pv(fmtTime(bt.TGBatDau))], ['btEnd', pv(fmtTime(bt.TGKetThuc))],
      ['scMayDung', `${docChk(isOn(bt.MayDung), 'pYes')} ${docChk(!isOn(bt.MayDung), 'pNo')}${isOn(bt.MayDung) && bt.PhutDungMay !== '' ? ' · ' + esc(fmtDur(Number(bt.PhutDungMay)).vi) : ''}`],
      ['btGioChay', bt.GioChay !== '' ? esc(fmtNum(bt.GioChay)) + ' h' : ''],
      ['scNguoiThucHien', pv(bt.NguoiThucHien)], ['scNhaThau', bt.NhaThau ? pv(bt.NhaThau) : pl('pInHouse')]
    ])}
    ${docTable([['pSTT', '9mm', 'c'], ['pItem', ''], ['pStandard', '30mm'], ['kqDAT', '12mm', 'c'], ['pKDat', '12mm', 'c'], ['pValue', '20mm', 'r'], ['fGhiChu', '38mm']],
      kq.map(x => [esc(x.STT), bi(x.HangMucVI, x.HangMucZH), esc(x.KieuNhap === 'SO' ? rangeText(x) : ''), x.KetQua === 'DAT' ? '✔' : '', x.KetQua === 'KHONGDAT' ? '✘' : '',
        x.KieuNhap === 'SO' ? esc(fmtNum(x.GiaTri)) + (x.DonVi ? ' ' + esc(x.DonVi) : '') : '', pv(x.GhiChu)]))}
    ${docInfo([['scVatTu', bt.VatTu ? `<span class="pre">${pv(bt.VatTu)}</span>` : '', true, 8], ['btNhanXet', bt.NhanXet ? `<span class="pre">${pv(bt.NhanXet)}</span>` : '', true, 10]])}
    <div class="d-line"><span class="d-lbl">${pl('pConclusion')}</span> ${docChk(!nBad, 'kqDAT')} ${docChk(nBad > 0, 'pKDatSC')}${linked.length ? ` · ${esc(linked.join(', '))}` : ''}</div>
    ${bt.YKienDuyet ? docBox('scYKien', bt.YKienDuyet) : ''}
    ${docSign([['pSignKTV', bt.NguoiThucHien], ['pSignToTruongDuyet', bt.TrangThaiPhieu === 'DONG' ? bt.NguoiDuyet : '', bt.TrangThaiPhieu === 'DONG' ? bt.TGDuyet : '']])}
    ${docFoot()}`;
  printDoc('CĐ-BT-03', 'portrait', html);
}

/* ---- CĐ-BT-07 / CĐ-BT-08 · một phiếu đo dự đoán ---- */
function ddPv(v) { return v === undefined || v === '' ? '' : (String(v)[0] === '>' ? '&gt;' + esc(fmtNum(String(v).slice(1))) : esc(fmtNum(v))); }
function ddLvCell(m) { return m ? `<b>${esc(m)}</b> ${pl('ddLv' + m)}` : ''; }
function ddTableHtml(loai, pts, withRec) {
  const pre = withRec ? [['pDate', '19mm'], ['pTicketNo', '24mm'], ['scMay', '40mm']] : [['pSTT', '8mm', 'c']];
  const rowPre = (r, i) => withRec ? [esc(fmtDate(r.TGDo)), esc(r.SoPhieu), tbShort(r.IDThietBi)] : [String(i + 1)];
  if (loai === 'RUNG') {
    return docTable(pre.concat([['pPoint', ''], ['H (mm/s)', '15mm', 'r'], ['V (mm/s)', '15mm', 'r'], ['A (mm/s)', '15mm', 'r'], ['pMaxVal', '16mm', 'r'], ['pZone', '24mm'], ['fGhiChu', withRec ? '34mm' : '40mm']]),
      pts.map(({ r, p }, i) => rowPre(r, i).concat([esc(p.t), ddPv(p.h), ddPv(p.v), ddPv(p.a), `<b>${ddPv(p.x)}</b>`, ddLvCell(p.m), pv(p.g)])));
  }
  if (loai === 'NHIET') {
    return docTable(pre.concat([['pPos', ''], ['pTempMeas', '19mm', 'r'], ['pTempRef', '19mm', 'r'], ['ΔT (°C)', '15mm', 'r'], ['pLevel', '24mm'], ['fGhiChu', withRec ? '34mm' : '40mm']]),
      pts.map(({ r, p }, i) => rowPre(r, i).concat([esc(p.t), ddPv(p.td), ddPv(p.tr), `<b>${ddPv(p.x)}</b>`, ddLvCell(p.m), pv(p.g)])));
  }
  if (withRec) {
    return docTable(pre.concat([['pPoint', ''], ['ddVolt', '16mm', 'r'], ['pMinMOhm', '20mm', 'r'], ['PI', '10mm', 'r'], ['pLevel', '24mm'], ['fGhiChu', '34mm']]),
      pts.map(({ r, p }) => rowPre(r).concat([esc(p.t), r.DienApThu ? esc(fmtNum(r.DienApThu)) + ' V' : '', `<b>${ddPv(p.x)}</b>`, ddPv(p.pi), ddLvCell(p.m), pv(p.g)])));
  }
  return docTable(pre.concat([['pPoint', ''], ['L1–E', '13mm', 'r'], ['L2–E', '13mm', 'r'], ['L3–E', '13mm', 'r'], ['L1–L2', '13mm', 'r'], ['L2–L3', '13mm', 'r'], ['L3–L1', '13mm', 'r'], ['PI', '9mm', 'r'], ['pConclusion', '24mm'], ['fGhiChu', '26mm']]),
    pts.map(({ r, p }, i) => rowPre(r, i).concat([esc(p.t), ddPv(p.l1), ddPv(p.l2), ddPv(p.l3), ddPv(p.l12), ddPv(p.l23), ddPv(p.l31), ddPv(p.pi),
      `${p.m === 'D' ? pl('pKDat') : pl('kqDAT')}<span class="d-lvs"> · ${esc(p.m || '')}</span>`, pv(p.g)])));
}
function printDd(so) {
  const dd = ddBySo(so);
  if (!dd) return;
  const cd = dd.Loai === 'CACHDIEN';
  const code = cd ? 'CĐ-BT-08' : 'CĐ-BT-07';
  const tb = tbById(dd.IDThietBi);
  const ng = ddNg(dd);
  const pts = ddPts(dd).map(p => ({ r: dd, p }));
  const nWarn = Number(dd.SoDiemCanhBao) || 0;
  const linked = allSC().filter(x => x.PhieuNguon === dd.SoPhieu).map(x => x.SoPhieu);
  const html = `${docHead(code, cd ? '' : pl('ddL' + dd.Loai))}
    ${docInfo([
      ['pTicketNo', `<b>${esc(dd.SoPhieu)}</b>`], ['ddType', pl('ddL' + dd.Loai)],
      ['scMay', tbText(dd.IDThietBi), true],
      ['fViTri', tb ? dmPrint('KHUVUC', tb.ViTri) : ''], ['pMeasTime', pv(fmtTime(dd.TGDo))],
      ['ddNguoiDo', pv(dd.NguoiDo)], ['ddDonVi', dd.NhaThau ? pv(dd.NhaThau) : pl('ddInHouse')],
      ['ddThietBiDo', pv(dd.ThietBiDo)], cd ? ['ddVolt', dd.DienApThu ? esc(fmtNum(dd.DienApThu)) + ' V' : ''] : ['ddDieuKien', pv(dd.DieuKien)],
      cd ? ['ddDieuKien', pv(dd.DieuKien), true] : null,
      ['ddStd', `${pl(ddChuanTr(dd.Loai, dd.Chuan))}<div class="d-small">${cd ? pl(tr('ddZonesCD', [fmtNum(ng[0] || '')])) : esc(ddZones(dd.Loai, ng))}</div>`, true]
    ])}
    ${docSec(cd ? 'pIrResults' : 'ddResults')}
    ${ddTableHtml(dd.Loai, pts, false)}
    ${docLegend(cd ? ['pLegendIr'] : ['pLegendLv'])}
    ${docBox('ddDeXuat', dd.DeXuat, 2)}
    ${docInfo([
      ['pConclusion', `${docChk(!nWarn, cd ? 'kqDAT' : 'pNoAlarm')} ${docChk(nWarn > 0, cd ? 'pKDatSC' : 'pAlarmSC')}${linked.length ? ` · ${esc(linked.join(', '))}` : ''}`, true],
      ['ddChuKy', dd.ChuKyThang ? biTr(tr('nMonths', [dd.ChuKyThang])) : ''], ['ddNext', pv(fmtDate(dd.HanDoTiep))]
    ])}
    ${dd.GhiChu ? docBox('fGhiChu', dd.GhiChu) : ''}
    ${docSign(cd ? [['pSignKTVDien', dd.NguoiDo, String(dd.TGDo).slice(0, 10)], ['pSignKS', '']] : [['pSignNguoiDo', dd.NguoiDo, String(dd.TGDo).slice(0, 10)], ['pSignKS', ''], ['pSignQL', '']])}
    ${docFoot()}`;
  printDoc(code, 'portrait', html);
}

/* ---- CĐ-SC-05 · Báo cáo RCA ---- */
function printRca(so) {
  const r = rcaBySo(so);
  if (!r) return;
  const tb = tbById(r.IDThietBi);
  const why = rcaJson(r.Why, []);
  const m6 = rcaJson(r.SauM, {});
  const s = rcaStatus(r);
  const lyDo = String(r.LyDo || '').split(',').filter(Boolean);
  const html = `${docHead('CĐ-SC-05', `<span class="d-no2">${esc(r.SoRCA)}</span>`)}
    ${docInfo([
      ['pRcaNo', `<b>${esc(r.SoRCA)}</b>`], ['fTrangThai', pl('rc' + s.st)],
      ['scMay', tbText(r.IDThietBi), true],
      ['fViTri', tb ? dmPrint('KHUVUC', tb.ViTri) : ''], ['rcaTickets', pv([r.SoPhieu].concat(String(r.PhieuLienQuan || '').split(',')).filter(Boolean).join(', '))],
      ['rcaDate', pv(fmtDate(r.NgayPhanTich))], ['rcaTeam', pv(r.NhomPhanTich)],
      ['pRcaReason', RCA_LYDO.map(k => docChk(lyDo.includes(k), 'rcaLD' + k)).join(' '), true]
    ])}
    ${docBox('rcaIncident', (r.TieuDe ? r.TieuDe + '\n' : '') + (r.MoTa || ''), 3)}
    ${docSec('rca5Why', 1)}
    ${docTable([['pWhy', '26mm'], ['pAnswer', '']], [0, 1, 2, 3, 4].map(i => [pl(tr('rcaWhyN', [i + 1])), pv(why[i])]))}
    ${docSec('rca6M', 2)}
    ${docTable([['pCat6M', '30mm'], ['pAnalysis', ''], ['pRootMark', '18mm', 'c']], RCA_6M.map(k => [pl('m6' + k), pv(m6[k]), r.NhomNguyenNhan === k ? '★' : '']))}
    ${docSec('rcaRoot', 3)}
    ${docBox(r.NhomNguyenNhan ? { vi: `${tr('rcaRootCat').vi}: ${tr('m6' + r.NhomNguyenNhan).vi}`, zh: `${tr('rcaRootCat').zh}：${tr('m6' + r.NhomNguyenNhan).zh}` } : 'rcaRootCat', r.NguyenNhanGoc, 2)}
    ${docSec('rcaActions', 4)}
    ${docTable([['pSTT', '8mm', 'c'], ['pActType', '22mm'], ['pActContent', ''], ['rcaActWho', '26mm'], ['rcaActDue', '18mm'], ['rcaActDoneOn', '18mm'], ['rcaActResult', '36mm']],
      s.acts.map(a => [esc(a.STT), pl('hdk' + a.Loai), pv(a.NoiDung), pv(a.PhuTrach), pv(fmtDate(a.Han)), pv(fmtDate(a.NgayXong)), pv(a.KetQua)]), { minRows: s.acts.length ? 0 : 3 })}
    ${docSec('rcaEff', 5)}
    ${docInfo([
      ['rcaHanHL', pv(fmtDate(r.HanKiemTraHL))], ['rcaHLDate', pv(fmtDate(r.TGKiemTraHL))],
      ['pChecker', pv(r.NguoiKiemTraHL)], ['pNChecks', r.SoLanKTHL ? esc(r.SoLanKTHL) : ''],
      ['rcaHLResult', `${docChk(r.KetQuaHL === 'HIEULUC', 'rcaHLHIEULUC')} ${docChk(r.KetQuaHL === 'KHONGHIEULUC', 'rcaHLKHONGHIEULUC')}`, true],
      ['rcaHLNote', pv(r.NhanXetHL), true]
    ])}
    ${docSign([['pSignLapKS', r.NguoiTao], ['pSignQL', r.TrangThai === 'DONG' ? r.NguoiKiemTraHL : '', r.TrangThai === 'DONG' ? r.TGKiemTraHL : '']])}
    ${docFoot()}`;
  printDoc('CĐ-SC-05', 'portrait', html);
}

/* ---- CĐ-TB-02 · Lý lịch thiết bị ---- */
async function ensureTbHistory(id) {
  const jobs = [];
  if (!S.scLoaded.has(id)) jobs.push(api('listSC', { id }).then(r => { mergeSC(r.rows); S.scLoaded.add(id); }));
  if (!S.btLoaded.has(id)) jobs.push(api('listBT', { id }).then(r => { mergeBT(r.rows); S.btLoaded.add(id); }));
  if (!S.ddLoaded.has(id)) jobs.push(api('listDD', { id }).then(r => { mergeDD(r.rows); S.ddLoaded.add(id); }));
  await Promise.all(jobs);
}
async function printTb02(id) {
  const tb0 = tbById(id);
  if (!tb0) return;
  if (S.online) {
    toast('pPreparing');
    try { await ensureTbHistory(tb0.ID); } catch (e) { if (e.code !== 'AUTH') toast(errText(e), 'err'); return; }
  }
  const tb = tbById(id);
  const ST = khStatuses();
  const plans = khOfTb(tb.ID).filter(k => isOn(k.DangDung));
  const hds = hdOfTb(tb.ID);
  const g = gcIdx()[String(tb.ID).toUpperCase()];
  const hist = [];
  scOfTb(tb.ID).filter(x => x.TrangThaiPhieu !== 'HUY').forEach(x => hist.push({ d: x.TGBao, k: 'pHistSC', txt: [x.MoTa, x.NguyenNhan && `${tr('scNguyenNhan').vi}: ${x.NguyenNhan}`, x.CachXuLy && `${tr('scCachXuLy').vi}: ${x.CachXuLy}`].filter(Boolean).join('\n'),
    vt: x.VatTu, so: x.SoPhieu, who: x.NguoiThucHien || x.NhaThau, down: isOn(x.MayDung) ? x.PhutDungMay : '' }));
  btOfTb(tb.ID).forEach(x => hist.push({ d: x.TGKetThuc, k: 'pHistPM', txt: x.TenVI + (Number(x.SoMucKhongDat) ? ` (${tr('kqBadN', [x.SoMucKhongDat, x.SoMuc]).vi})` : ''), vt: x.VatTu, so: x.SoPhieu, who: x.NguoiThucHien || x.NhaThau }));
  ddOf(tb.ID).forEach(x => hist.push({ d: x.TGDo, k: 'pHistDD', txt: `${tr('ddL' + x.Loai).vi} – ${tr('ddM' + (x.MucDo || 'A')).vi}${Number(x.SoDiemCanhBao) ? ` (${x.SoDiemCanhBao}/${x.SoDiem})` : ''}`, vt: '', so: x.SoPhieu, who: x.NguoiDo }));
  rcaOfTb(tb.ID).filter(r => r.TrangThai !== 'HUY').forEach(r => hist.push({ d: r.NgayTao, k: 'pHistRCA', txt: `${r.TieuDe}${r.NguyenNhanGoc ? '\n' + tr('rcaRoot').vi + ': ' + r.NguyenNhanGoc : ''}`, vt: '', so: r.SoRCA, who: r.NhomPhanTich }));
  hist.sort((a, b) => String(b.d).localeCompare(String(a.d)));
  const nStop = scOfTb(tb.ID).filter(x => x.TrangThaiPhieu !== 'HUY' && isOn(x.MayDung)).length;
  const downAll = scOfTb(tb.ID).filter(x => x.TrangThaiPhieu !== 'HUY').reduce((s, x) => s + (Number(x.PhutDungMay) || 0), 0);
  const html = `${docHead('CĐ-TB-02', `<span class="d-no2">${esc(tb.ID)}</span>`)}
    ${docSec('pGeneral', 1)}
    ${docInfo([
      ['pSysId', `<b>${esc(tb.ID)}</b>`], ['fMaNhaMay', pv(tb.MaNhaMay)],
      ['fTenMay', bi(tb.TenMay, tb.TenMayZH), true],
      ['fNhomTB', dmPrint('NHOMTB', tb.NhomTB)], ['fViTri', dmPrint('KHUVUC', tb.ViTri)],
      ['fHang', pv(tb.Hang)], ['fModel', pv(tb.Model)],
      ['fSoSeri', pv(tb.SoSeri)], ['fNamSuDung', pv(tb.NamSuDung)],
      ['fCongSuatKW', pv(tb.CongSuatKW ? fmtNum(tb.CongSuatKW) : '')], ['fTrangThai', dmPrint('TRANGTHAI', tb.TrangThai)],
      ['gcLuyKe', GC_KIEU.includes(tb.KieuGioChay) ? `${pl(gcKieuTr(tb.KieuGioChay))}${g && g.luyKe !== null ? ` · ${esc(fmtH(g.luyKe))} h (${esc(fmtDate(g.ngay))})` : ''}` : pl('gcKNONE')],
      ['pAddedOn', pv(fmtDate(tb.NgayTao))],
      ['fLinkTaiLieu', tb.LinkTaiLieu ? `<span class="d-small break">${esc(tb.LinkTaiLieu)}</span>` : '', true]
    ])}
    ${docBox('fThongSo', tb.ThongSo, 2)}
    ${tb.GhiChu ? docBox('fGhiChu', tb.GhiChu) : ''}
    ${docSec('pPlansNow', 2)}
    ${docTable([['pPlanCode', '18mm'], ['khTenVI', ''], ['khCycle', '32mm'], ['khLast', '20mm'], ['khNextDue', '20mm'], ['pResp', '30mm']],
      plans.map(k => { const s = ST.get(k.MaKH); return [esc(k.MaKH), bi(k.TenVI, k.TenZH), pl(cycleTr(k)), pv(fmtDate(k.LanCuoi)), pv(fmtDate(s && s.due)), k.NhaThau ? pv(k.NhaThau) : pl('pInHouse')]; }), { empty: 'pNoPlans' })}
    ${hds.length ? `${docSec('contracts', 3)}${docTable([['pCode2', '18mm'], ['hdTenVI', ''], ['hdNhaThau', '40mm'], ['pValidity', '40mm']],
      hds.map(h => [esc(h.MaHD), bi(h.TenVI, h.TenZH), pv(h.NhaThau), `${esc(fmtDate(h.NgayBatDau))} – ${esc(fmtDate(h.NgayKetThuc))}`]))}` : ''}
    ${docSec('pHistory', hds.length ? 4 : 3)}
    <div class="d-line">${pl(tr('pHistSum', [nStop, fmtH1(downAll / 60), btOfTb(tb.ID).length, ddOf(tb.ID).length]))}</div>
    ${docTable([['pDate', '19mm'], ['pHistType', '22mm'], ['pContent', ''], ['scVatTu', '34mm'], ['pTicketNo', '24mm'], ['pPerson', '26mm']],
      hist.map(h => [esc(fmtDate(h.d)), pl(h.k), `<span class="pre">${esc(h.txt)}</span>${h.down ? `<div class="d-small">${pl(tr('pDownMin', [fmtDur(Number(h.down)).vi, fmtDur(Number(h.down)).zh]))}</div>` : ''}`, pv(h.vt), esc(h.so), pv(h.who)]), { minRows: hist.length ? 0 : 3 })}
    ${!S.online ? `<p class="d-small">${pl('pOfflineHist')}</p>` : ''}
    ${docSign([['pSignKTVPhuTrach', ''], ['pSignQL', '']])}
    ${docFoot()}`;
  printDoc('CĐ-TB-02', 'portrait', html);
}

/* ---- Số liệu kỳ cho các bản in tổng hợp ---- */
async function bcEnsure(fetch, needAgg) {
  let R = bcHave(fetch);
  if (!R || R.thieu.length) {
    if (!needOnline()) return needAgg ? null : R;
    toast('pPreparing');
    try { R = await bcFetch(fetch); } catch (e) { if (e.code !== 'AUTH') toast(errText(e), 'err'); return null; }
  }
  return needAgg && !bcAggOk(R) ? null : R;
}
/** Bản in cần tổng hợp kiểm tra đầu ca / giờ chạy: chưa tổng hợp xong thì không in (tránh in số liệu thiếu) */
function bcAggOk(R) {
  if (R && R.thieu && R.thieu.length) { toast('pIncompleteNoPrint', 'warn'); return false; }
  return !!R;
}
function monthPer(M) { return { k: 'M', tu: M, den: M, from: M + '-01', to: mEnd(M), months: [M], lbl: monthTr(M) }; }
function curView() { const b = bcState(); const P = bcPeriod(b); return { b, P, R: bcHave(P.fetch) }; }

/* ---- CĐ-SC-04 · Sổ theo dõi hư hỏng – dừng máy (kỳ đang xem) ---- */
function printSc04() {
  const { b, P, R } = curView();
  if (!bcAggOk(R)) return;
  const c = bcStats(R, P.cur, b);
  const list = c.sc.slice().sort((a, x) => String(a.TGBao).localeCompare(String(x.TGBao)));
  const html = `${docHead('CĐ-SC-04', perSub(P.cur, b))}
    ${docTable([['pSTT', '8mm', 'c'], ['pTicketNo', '21mm'], ['scTGBao', '17mm'], ['scMay', '34mm'], ['pMoTaHong', ''], ['scLoaiHong', '17mm'], ['scNguyenNhan', '32mm'],
      ['scCachXuLy', '32mm'], ['scTGDung', '17mm'], ['scTGChayLai', '17mm'], ['pDownMinCol', '12mm', 'r'], ['pRepairMinCol', '12mm', 'r'], ['scNguoiThucHien', '20mm'], ['fTrangThai', '14mm']],
      list.map((x, i) => [String(i + 1), esc(x.SoPhieu), esc(fmtTime(x.TGBao)), tbShort(x.IDThietBi), pv(x.MoTa), x.LoaiHong ? pl({ vi: dmVi('LOAIHONG', x.LoaiHong), zh: dmZh('LOAIHONG', x.LoaiHong) }) : '',
        pv(x.NguyenNhan), pv(x.CachXuLy), x._stop ? esc(fmtTime(x.TGDung)) : pl('pNoStopShort'), x._stop ? pv(fmtTime(x.TGChayLai)) : '', x._stop ? hmin(x._down) + (x._live ? '*' : '') : '',
        hmin(x.PhutSua), pv(x.NguoiThucHien || x.NhaThau), pl('sc' + x.TrangThaiPhieu)]),
      { cls: 'small', foot: `<td colspan="10" class="r">${pl('pTotal')}</td><td class="r"><b>${fmtNum(Math.round(c.downH * 60))}</b></td><td></td><td colspan="2"></td>` })}
    ${docInfo([
      ['pTotalTickets', fmtNum(c.nAll)], ['kpiFail', fmtNum(c.nFail)],
      ['kpiDown', `${fmtH1(c.downH)} h`], ['kpiMttr', `${fmtH1(c.mttr)} h`],
      ['kpiMdt', `${fmtH1(c.mdt)} h`], ['kpiMtbf', c.mtbf === null ? '—' : `${fmtNum(Math.round(c.mtbf))} h`]
    ])}
    ${c.nLive ? `<p class="d-small">${pl('pLiveNote')}</p>` : ''}
    <p class="d-small">${pl('bcDefs')}</p>
    ${docSign([['pSignLapToTruong', ''], ['pSignQL', '']])}
    ${docFoot()}`;
  printDoc('CĐ-SC-04', 'landscape', html);
}

/* ---- CĐ-BT-07 · Hồ sơ bảo trì dự đoán theo kỳ ---- */
function printBt07k() {
  const { b, P, R } = curView();
  if (!R) return;
  const d = bcDd(R, P.cur, b);
  const byL = l => d.list.filter(r => r.Loai === l).slice().reverse().flatMap(r => ddPts(r).map(p => ({ r, p })));
  const html = `${docHead('CĐ-BT-07', perSub(P.cur, b))}
    ${docSec('ddLRUNG', 1)}${ddTableHtml('RUNG', byL('RUNG'), true)}
    ${docSec('ddLNHIET', 2)}${ddTableHtml('NHIET', byL('NHIET'), true)}
    ${docSec('ddLCACHDIEN', 3)}${ddTableHtml('CACHDIEN', byL('CACHDIEN'), true)}
    ${docSec('pOilTitle', 4)}
    ${docTable([['pDate', '20mm'], ['scMay', '50mm'], ['pSample', '40mm'], ['pIndicator', ''], ['rcaActResult', '40mm'], ['pConclusion', '30mm']], [], { minRows: 3, empty: null })}
    ${docLegend(['pLegendLv', 'pStdNote'])}
    ${docSign([['pSignLapKS', ''], ['pSignQL', '']])}
    ${docFoot()}`;
  printDoc('CĐ-BT-07', 'landscape', html);
}

/* ---- CĐ-BT-04 · Checklist kiểm tra hằng ngày trước ca (1 tháng, mỗi máy một trang) ---- */
async function printBt04(ids, M) {
  if (!needOnline()) return;
  toast('pPreparing');
  let rows;
  try { rows = (await api('listKT', { tu: M + '-01', den: mEnd(M), ids })).rows; } catch (e) { if (e.code !== 'AUTH') toast(errText(e), 'err'); return; }
  // Khoảng máy Dừng / Đang sửa: tháng gần dùng phiếu sửa chữa đã tải sẵn (180 ngày); tháng cũ lấy từ số liệu báo cáo
  let Rb = bcHave({ tu: M, den: M });
  if (!Rb && M < dAdd(dToday(), -150, 'NGAY').slice(0, 7)) {
    try { Rb = await bcFetch({ tu: M, den: M }); } catch (e) { if (e.code !== 'AUTH') toast(errText(e), 'err'); return; }
  }
  const starts = caStarts();
  const nDay = Number(mEnd(M).slice(8, 10));
  const days = Array.from({ length: nDay }, (_, i) => i + 1);
  const pages = ids.map(id => {
    const tb = tbById(id);
    const mine = rows.filter(x => String(x.IDThietBi).toUpperCase() === String(id).toUpperCase()).sort(ktSortDesc);
    const last = {};
    mine.forEach(x => { const k = x.NgayCa + '#' + x.Ca; if (!last[k]) last[k] = x; });
    const recs = Object.values(last);
    const bans = [...new Set(recs.map(x => x.MaBan))];
    if (!bans.length && tb) { const m = mauFor(tb); if (m.items.length) bans.push(null); }
    // Máy ở trạng thái Dừng / Đang sửa (từ lúc dừng tới khi quản lý duyệt đóng phiếu) → ô "D"
    const stops = Rb ? (Rb.off[String(id).toUpperCase()] || []) : scOfTb(id).filter(x => isOn(x.MayDung) && x.TGDung && x.TrangThaiPhieu !== 'HUY')
      .map(x => [tsU(x.TGDung), SC_OPEN.includes(x.TrangThaiPhieu) ? Infinity : Math.max(tsU(x.TGChayLai) || 0, tsU(x.TGDuyet) || 0, tsU(x.TGDung))]);
    const bad = [];
    const tables = bans.map(mb => {
      const items = mb ? (mauBanItems(mb) || []) : mauItems(mauFor(tb).items);
      const nCa = Math.max(starts.length, ...recs.filter(x => x.MaBan === mb).map(x => Number(x.Ca) || 1));
      return Array.from({ length: nCa }, (_, i) => i + 1).map(ca => {
        const cell = {};
        recs.filter(x => x.MaBan === mb && Number(x.Ca) === ca && x.NgayCa.slice(0, 7) === M).forEach(x => { cell[Number(x.NgayCa.slice(8, 10))] = x; });
        const body = items.map((it, i) => `<tr><th class="d-item">${bi(it.HangMucVI, it.HangMucZH)}${it.KieuNhap === 'SO' && rangeText(it) ? `<div class="d-small">${esc(rangeText(it))}</div>` : ''}</th>${days.map(dn => {
          const x = cell[dn];
          if (!x) {
            const st = dMs(`${M}-${pad2(dn)}`) + (starts[ca - 1] || 0) * 60000;
            return `<td class="dc">${stops.some(([a, z]) => a <= st && st < z) ? '<span class="d-stop">D</span>' : ''}</td>`;
          }
          const a = (jparse(x.KetQua, [])[i]) || [];
          const k = a[0] === 'K';
          if (k) bad.push({ x, it, a });
          if (it.KieuNhap === 'SO') return `<td class="dc${k ? ' bad' : ''}">${esc(a[1] !== undefined ? fmtNum(a[1]) : '')}${k ? '✘' : ''}</td>`;
          return `<td class="dc${k ? ' bad' : ''}">${k ? '✘' : (a[0] === 'D' ? '✔' : '')}</td>`;
        }).join('')}</tr>`).join('');
        const who = `<tr class="d-who"><th>${pl('pCheckerInit')}</th>${days.map(dn => `<td class="dc">${cell[dn] ? esc(initials(cell[dn].NguoiKiemTra)) : ''}</td>`).join('')}</tr>`;
        return `<div class="d-cahead">${pl(tr('caN', [ca]))} · ${esc(caTimes(String(ca)))}${mb ? ` · ${pl('ktTpl')} ${esc(mb)}` : ''}</div>
          <table class="d-tbl d-month"><colgroup><col style="width:50mm">${days.map(() => '<col>').join('')}</colgroup>
          <thead><tr><th>${pl('pItemDay')}</th>${days.map(dn => `<th class="dc${[0, 6].includes(dowOf(`${M}-${pad2(dn)}`)) ? ' we' : ''}">${dn}</th>`).join('')}</tr></thead>
          <tbody>${body}${who}</tbody></table>`;
      }).join('');
    }).join('');
    const seen = new Set();
    const badRows = bad.filter(y => { const k = y.x.SoPhieu + '|' + y.it.HangMucVI; if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, z) => String(a.x.TGKiemTra).localeCompare(String(z.x.TGKiemTra)))
      .map(y => [esc(fmtDate(y.x.NgayCa)), esc(y.x.Ca), bi(y.it.HangMucVI, y.it.HangMucZH), `${y.a[1] !== undefined && y.a[1] !== '' ? esc(fmtNum(y.a[1])) + ' ' : ''}${pv(y.a[2])}`, esc(y.x.NguoiKiemTra), esc(allSC().filter(s => s.PhieuNguon === y.x.SoPhieu).map(s => s.SoPhieu).join(', '))]);
    return `<section class="d-page">${docHead('CĐ-BT-04', biTr(monthTr(M)))}
      ${docInfo([['scMay', tbText(id), true], ['fViTri', tb ? dmPrint('KHUVUC', tb.ViTri) : ''], ['fNhomTB', tb ? dmPrint('NHOMTB', tb.NhomTB) : ''],
        ['pMonth', biTr(monthTr(M))], ['pNChecks2', fmtNum(recs.length)]])}
      ${tables || `<p class="d-empty">${pl('pNoData')}</p>`}
      ${docLegend(['pLegendKt'])}
      ${badRows.length ? `${docSec('pAbnormal')}${docTable([['pDate', '18mm'], ['pCa', '10mm', 'c'], ['pItem', ''], ['pValueNote', '60mm'], ['ktNguoi', '30mm'], ['pScTicket', '30mm']], badRows)}` : ''}
      ${docSign([['pSignNguoiKT', ''], ['pSignToTruong', '']])}
      ${docFoot()}</section>`;
  });
  printDoc('CĐ-BT-04', 'landscape', pages.join(''));
}
function initials(name) {
  const w = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!w.length) return '';
  return w.length === 1 ? w[0].slice(0, 3) : w.map(x => x[0]).join('').toUpperCase().slice(0, 4);
}

/* ---- CĐ-BT-01 · Kế hoạch bảo trì năm ---- */
async function printBt01(y, f) {
  if (!(y in S.btYear) && S.online) { toast('pPreparing'); await loadBtYear(y); }
  const rows = yearGrid(y, Object.assign({ q: '', kv: '', nhom: '' }, f || {}));
  let nPlan = 0, nDone = 0;
  const cellTxt = c => {
    const out = [];
    if (c.done) { out.push(c.done > 1 ? `${c.done}P✔` : 'P✔'); nDone += c.done; }
    if (c.pend) { out.push(c.pend > 1 ? `${c.pend}P◐` : 'P◐'); nDone += c.pend; }
    if (c.late) out.push('P✘');
    if (c.plan) out.push(c.plan > 1 ? `${c.plan}P` : 'P');
    nPlan += c.done + c.pend + c.late + c.plan;
    return out.join(' ');
  };
  const body = rows.map((r, i) => {
    const tb = r.s.tb;
    return [String(i + 1), esc(r.kh.IDThietBi), tb ? bi(tb.TenMay, tb.TenMayZH) : '', tb ? pl({ vi: dmVi('NHOMTB', tb.NhomTB), zh: dmZh('NHOMTB', tb.NhomTB) }) : '',
      bi(r.kh.TenVI, r.kh.TenZH), pl(cycleTr(r.kh)), r.kh.NhaThau ? pv(r.kh.NhaThau) : pl('pInHouse')].concat(r.cells.map(c => `<span class="${c.late ? 'd-late' : ''}">${esc(cellTxt(c))}</span>`)).concat(['']);
  });
  const html = `${docHead('CĐ-BT-01', `${biTr(tr('bcYear', [y]))}${filterSub(f || {}) ? `<div>${filterSub(f || {})}</div>` : ''}`)}
    ${docTable([['pSTT', '8mm', 'c'], ['ID', '14mm'], ['scMay', '34mm'], ['fNhomTB', '20mm'], ['pJob', ''], ['khCycle', '22mm'], ['pResp', '18mm']]
      .concat(Array.from({ length: 12 }, (_, i) => [{ vi: 'T' + (i + 1), zh: (i + 1) + '月' }, '9.5mm', 'c'])).concat([['fGhiChu', '16mm']]), body, { cls: 'small d-yr' })}
    ${docInfo([['pNPlan', fmtNum(nPlan)], ['pNDone', fmtNum(nDone)], ['pDoneRate', fmtPct(ratio(nDone, nPlan))], ['pAsOf', esc(fmtDate(dToday()))]])}
    ${docLegend(['pLegendYr'])}
    ${docSign([['pSignLapQL', ''], ['pSignGD', '']])}
    ${docFoot()}`;
  printDoc('CĐ-BT-01', 'landscape', html);
}

/* ---- CĐ-BT-05 · Tỷ lệ hoàn thành kế hoạch bảo trì (12 tháng) ---- */
async function printBt05(y, f) {
  const Y = bcYearPer(y);
  const R = await bcEnsure(Y.fetch);
  if (!R) return;
  const nowM = dToday().slice(0, 7);
  const grid = yearGrid(y, Object.assign({ q: '', kv: '', nhom: '' }, f));
  const tot = { due: 0, made: 0, pend: 0, onTime: 0, late: 0, miss: 0 };
  const lateAll = [];
  const ds = bcDataStart().slice(0, 7);
  const rows = Y.per.months.map(M => {
    const mo = Number(M.slice(5, 7));
    const lbl = biTr(monthTr(M));
    if (!ds || M < ds) return [lbl, '', '', '', '', '', '', '', ''];
    if (M > nowM) {
      const plan = grid.reduce((s, r) => s + r.cells[mo - 1].plan, 0);
      return [lbl, plan ? `<span class="d-muted">${fmtNum(plan)}</span>` : '', '', '', '', '', '', '', ''];
    }
    const per = monthPer(M);
    const bks = bcBuckets(per), bIdx = {};
    bks.forEach((x, i) => { bIdx[x.key] = i; });
    const p = bcPm(R, per, f, dToday(), bks, bIdx);
    ['due', 'made', 'pend', 'onTime', 'miss'].forEach(k => { tot[k] += p[k]; });
    tot.late += p.lateDone;
    p.items.filter(x => !x.onTime).forEach(x => lateAll.push(x));
    return [lbl, fmtNum(p.due), fmtNum(p.made), p.pend ? fmtNum(p.pend) : '', fmtNum(p.onTime), p.lateDone ? fmtNum(p.lateDone) : '', p.miss ? fmtNum(p.miss) : '', fmtPct(p.pct), fmtPct(p.pctOn)];
  });
  const lateRows = lateAll.sort((a, b) => String(a.due).localeCompare(String(b.due))).map(x => {
    const kh = x.kind === 'miss' ? x.kh : khByMa(x.b.MaKH);
    const id = x.kind === 'miss' ? x.kh.IDThietBi : x.b.IDThietBi;
    return [tbShort(id), x.kind === 'miss' ? bi(kh.TenVI, kh.TenZH) : bi(x.b.TenVI, x.b.TenZH), esc(fmtDate(x.due)),
      x.kind === 'miss' ? pl('bcPmMiss') : esc(fmtDate(x.ngay)), x.kind === 'miss' ? pl(tr('dueLate', [Math.max(0, dDiff(x.due, dToday()))])) : (dDiff(x.due, x.ngay) > 0 ? pl(tr('timeLate', [dDiff(x.due, x.ngay)])) : pl('bcLateHours')),
      x.kind === 'miss' ? '' : esc(x.b.SoPhieu)];
  });
  const html = `${docHead('CĐ-BT-05', `${biTr(tr('bcYear', [y]))}${filterSub(f) ? `<div>${filterSub(f)}</div>` : ''}`)}
    ${docTable([['pMonth', '24mm'], ['pDueCol', ''], ['pMadeCol', ''], ['pPendCol', ''], ['bcPmOnTime', ''], ['bcPmLateDone', ''], ['bcPmMiss', ''], ['pPctDone', ''], ['pPctOn', '']], rows,
      { cls: 'center', foot: `<td>${pl('pYearTotal')}</td><td><b>${fmtNum(tot.due)}</b></td><td><b>${fmtNum(tot.made)}</b></td><td>${fmtNum(tot.pend)}</td><td>${fmtNum(tot.onTime)}</td><td>${fmtNum(tot.late)}</td><td>${fmtNum(tot.miss)}</td><td><b>${fmtPct(ratio(tot.made, tot.due))}</b></td><td><b>${fmtPct(ratio(tot.onTime, tot.due))}</b></td>` })}
    <p class="d-small">${pl('pBt05Note')}</p>
    ${docSec('pLateList')}
    ${docTable([['scMay', '46mm'], ['pJob', ''], ['khDue', '20mm'], ['pDoneOn', '22mm'], ['pLateBy', '24mm'], ['pTicketNo', '24mm']], lateRows, { empty: 'pNoLate' })}
    ${docSign([['pSignLapToTruong', ''], ['pSignQL', '']])}
    ${docFoot()}`;
  printDoc('CĐ-BT-05', 'portrait', html);
}

/* ---- CĐ-BC-01 · Bảng theo dõi KPI 12 tháng ---- */
async function printBc01(y, f) {
  const Y = bcYearPer(y);
  const R = await bcEnsure(Y.fetch, true);
  if (!R) return;
  const nowM = dToday().slice(0, 7);
  const ds = bcDataStart().slice(0, 7);
  const ms = Y.per.months.map(M => (M > nowM || !ds || M < ds ? null : bcStats(R, monthPer(M), f)));
  const yr = bcStats(R, Y.per, f);
  const K = [
    ['kpiFail', 'timesUnit', c => fmtNum(c.nFail)],
    ['kpiDown', 'hoursUnit', c => fmtH1(c.downH)],
    ['kpiMtbf', 'hoursUnit', c => (c.mtbf === null ? '—' : fmtNum(Math.round(c.mtbf)))],
    ['kpiMttr', 'hoursUnit', c => fmtH1(c.mttr)],
    ['kpiMdt', 'hoursUnit', c => fmtH1(c.mdt)],
    ['kpiPlanDown', 'hoursUnit', c => fmtH1(c.planH)],
    ['kpiPm', '%', c => fmtPct(c.pm.pct)],
    ['bcPmOnTimePct', '%', c => fmtPct(c.pm.pctOn)],
    ['kpiKt', '%', c => fmtPct(c.kt.pct)],
    ['bcKtBadRate', '%', c => fmtPct(c.kt.pctBad)],
    ['kpiDdN', 'pUnitTicket', c => fmtNum(c.dd.n)],
    ['bcDdAlarm', 'pUnitPoint', c => fmtNum(c.dd.lv.C + c.dd.lv.D)],
    ['bcRcaNew', 'pUnitCase', c => fmtNum(c.rca.opened.length)],
    ['bcRcaClosed', 'pUnitCase', c => fmtNum(c.rca.closed.length)],
    ['bcActOnTime', '%', c => fmtPct(c.rca.pctOn)]
  ];
  const body = K.map((k, i) => [String(i + 1), pl(k[0]), k[1] === '%' ? '%' : pl(k[1]), ''].concat(ms.map(c => (c ? esc(k[2](c)) : ''))).concat([`<b>${esc(k[2](yr))}</b>`, '']));
  const html = `${docHead('CĐ-BC-01', `${biTr(tr('bcYear', [y]))}${filterSub(f) ? `<div>${filterSub(f)}</div>` : ''}`)}
    ${docTable([['pSTT', '8mm', 'c'], ['pKpi', ''], ['pUnit', '14mm', 'c'], ['pTarget', '14mm', 'c']]
      .concat(Array.from({ length: 12 }, (_, i) => [{ vi: 'T' + (i + 1), zh: (i + 1) + '月' }, '12mm', 'r'])).concat([['pYearCol', '14mm', 'r'], ['pAchieved', '12mm', 'c']]), body, { cls: 'small' })}
    <p class="d-small">${pl('bcDefs')}</p>
    <p class="d-small">${pl('pBc01Note')}</p>
    ${docSign([['pSignLapQL', ''], ['pSignGD', '']])}
    ${docFoot()}`;
  printDoc('CĐ-BC-01', 'landscape', html);
}

/* ---- CĐ-BC-03 · Báo cáo tháng bộ phận cơ điện ---- */
/** Biểu đồ cột đen trắng cho bản in */
function printBars(bks, vals) {
  const W = 180, H = 42, L = 10, B = 6, T = 3;
  const max = niceMax(Math.max(0, ...vals));
  const slot = (W - L) / bks.length, bw = Math.min(4, slot * 0.66);
  const bars = vals.map((v, i) => v > 0 ? `<rect x="${(L + i * slot + (slot - bw) / 2).toFixed(2)}" y="${(T + (1 - v / max) * (H - T - B)).toFixed(2)}" width="${bw.toFixed(2)}" height="${(v / max * (H - T - B)).toFixed(2)}" fill="#555"/>` : '').join('');
  const lbl = bks.map((b, i) => (i === 0 || (i + 1) % 5 === 0) ? `<text x="${(L + i * slot + slot / 2).toFixed(2)}" y="${H - 1}" font-size="2.6" text-anchor="middle">${esc(b.lbl)}</text>` : '').join('');
  return `<svg class="d-chart" viewBox="0 0 ${W} ${H}"><line x1="${L}" x2="${W}" y1="${H - B}" y2="${H - B}" stroke="#000" stroke-width=".2"/>
    <line x1="${L}" x2="${W}" y1="${T}" y2="${T}" stroke="#bbb" stroke-width=".15"/><text x="${L - 1}" y="${T + 1}" font-size="2.6" text-anchor="end">${esc(fmtNum(max))}</text>
    <text x="${L - 1}" y="${H - B}" font-size="2.6" text-anchor="end">0</text>${bars}${lbl}</svg>`;
}
function printBc03() {
  const { b, P, R } = curView();
  if (b.k !== 'M' || !bcAggOk(R)) return;
  const c = bcStats(R, P.cur, b), p0 = bcStats(R, P.prev, b);
  const cmp = !!bcDataStart() && P.prev.to >= bcDataStart();
  const p = cmp ? p0 : { nFail: null, downH: null, mttr: null, mtbf: null, planH: null, pm: { pct: null }, kt: { pct: null }, dd: { n: null }, rca: { opened: { length: null } } };
  const row = (key, a, z, fmt, unit) => [pl(key), esc(fmt(a)) + (unit || ''), z === null ? '—' : esc(fmt(z)) + (unit || ''),
    a === null || z === null || !isFinite(a) || !isFinite(z) ? '' : esc((a - z > 0 ? '+' : (a - z < 0 ? '−' : '')) + fmt(Math.abs(a - z)))];
  const top = c.fail.slice().sort((a, z) => z._down - a._down).slice(0, 5);
  const loai = paretoRowsPrint(c.byLoai);
  const hdList = hdDue();
  const html = `${docHead('CĐ-BC-03', perSub(P.cur, b))}
    ${docInfo([['pMonth', biTr(P.cur.lbl)], ['pPreparedBy', pv(S.name)]])}
    ${docSec('pKeyKpi', 1)}
    ${docTable([['pKpi', ''], ['pThisMonth', '28mm', 'r'], ['pPrevMonth', '28mm', 'r'], ['pChange', '24mm', 'r']], [
      row('kpiFail', c.nFail, p.nFail, fmtNum),
      row('kpiDown', c.downH, p.downH, fmtH1, ' h'),
      row('kpiMttr', c.mttr, p.mttr, fmtH1, ' h'),
      row('kpiMtbf', c.mtbf, p.mtbf, v => (v === null ? '—' : fmtNum(Math.round(v))), ' h'),
      row('kpiPlanDown', c.planH, p.planH, fmtH1, ' h'),
      row('kpiPm', c.pm.pct === null ? null : c.pm.pct * 100, p.pm.pct === null ? null : p.pm.pct * 100, v => (v === null ? '—' : fmtNum(Math.round(v * 10) / 10)), '%'),
      row('kpiKt', c.kt.pct === null ? null : c.kt.pct * 100, p.kt.pct === null ? null : p.kt.pct * 100, v => (v === null ? '—' : fmtNum(Math.round(v * 10) / 10)), '%'),
      row('kpiDdN', c.dd.n, p.dd.n, fmtNum),
      row('bcRcaNew', c.rca.opened.length, p.rca.opened.length, fmtNum)
    ])}
    ${docSec('pDownByDay', 2)}
    ${printBars(c.bks, c.serFail)}
    ${docSec('pMainIncidents', 3)}
    ${docTable([['pTicketNo', '22mm'], ['scMay', '36mm'], ['pMoTaHong', ''], ['pDownH', '14mm', 'r'], ['scNguyenNhan', '40mm'], ['scCachXuLy', '40mm']],
      top.map(x => [esc(x.SoPhieu), tbShort(x.IDThietBi), pv(x.MoTa), fmtH1(x._down / 60) + (x._live ? '*' : ''), pv(x.NguyenNhan), pv(x.CachXuLy)]), { cls: 'small', empty: 'bcNoFail' })}
    ${docSec('bcPareto', 4)}
    ${docTable([['scLoaiHong', ''], ['pCount', '18mm', 'r'], ['pShare', '18mm', 'r'], ['pCum', '18mm', 'r'], ['pDownH', '18mm', 'r']], loai, { empty: 'bcNoTickets' })}
    ${docSec('bcPm', 5)}
    ${docInfo([['pDueCol', fmtNum(c.pm.due)], ['pMadeCol', fmtNum(c.pm.made)], ['bcPmOnTime', fmtNum(c.pm.onTime)], ['bcPmLateDone', fmtNum(c.pm.lateDone)],
      ['bcPmMiss', fmtNum(c.pm.miss)], ['pPctDone', fmtPct(c.pm.pct)]])}
    ${docSec('shiftCheck', 6)}
    ${docInfo([['bcKtRate', `${fmtPct(c.kt.pct)} (${fmtNum(c.kt.done)}/${fmtNum(c.kt.req)})`], ['bcKtBadRate', fmtPct(c.kt.pctBad)],
      ['bcKtItems', esc(c.kt.items.slice(0, 5).map(x => `${x.vi} (${x.n})`).join('; ')), true]])}
    ${docSec('predictive', 7)}
    ${docInfo([['kpiDdN', `${fmtNum(c.dd.n)} (${DD_LOAI.map(l => `${tr('ddL' + l).vi}: ${c.dd.byLoai[l] || 0}`).join(', ')})`, true],
      ['bcDdAlarm', esc(c.dd.alarms.slice(0, 8).map(({ r, p: q }) => `${r.IDThietBi} ${q.t} (${q.m})`).join('; ')) || '0', true]])}
    ${docSec('bcRca', 8)}
    ${docInfo([['bcRcaNew', fmtNum(c.rca.opened.length)], ['bcRcaClosed', fmtNum(c.rca.closed.length)], ['bcRcaOpenNow', fmtNum(c.rca.openNow)], ['bcActOnTime', fmtPct(c.rca.pctOn)]])}
    ${docSec('contractsDue', 9)}
    ${docTable([['pCode2', '18mm'], ['hdTenVI', ''], ['hdNhaThau', '44mm'], ['hdEnd2', '22mm']], hdList.map(h => [esc(h.MaHD), bi(h.TenVI, h.TenZH), pv(h.NhaThau), esc(fmtDate(h.NgayKetThuc))]), { empty: 'hdNoDue' })}
    ${docSec('pProposals', 10)}
    ${docBox('pProposalsBox', '', 4)}
    ${docSign([['pSignLapQL', S.name], ['pSignGD', '']])}
    ${docFoot()}`;
  printDoc('CĐ-BC-03', 'portrait', html);
}
function paretoRowsPrint(list) {
  const tot = list.reduce((s, x) => s + x.n, 0);
  let cum = 0;
  return list.slice().sort((a, b) => b.n - a.n).map(x => {
    cum += x.n;
    return [x.k === '_' ? pl('bcUnclassified') : dmPrint('LOAIHONG', x.k), fmtNum(x.n), fmtPct(ratio(x.n, tot)), fmtPct(ratio(cum, tot)), fmtH1(x.down / 60)];
  });
}

/* ---- Thẻ "Bản in" trên màn hình Báo cáo ---- */
function bcPrintCard(P) {
  const b = bcState();
  const y = Number(P.cur.den.slice(0, 4));
  const items = [
    ['CĐ-SC-04', 'printSc04', P.cur.lbl],
    ['CĐ-BT-07', 'printBt07k', P.cur.lbl],
    ['CĐ-BT-04', 'printBt04Pick', tr('pBt04Scope')],
    ['CĐ-BT-05', 'printBt05', tr('bcYear', [y])],
    ['CĐ-BT-01', 'printBt01', tr('bcYear', [y])],
    ['CĐ-BC-01', 'printBc01', tr('bcYear', [y])],
    ['CĐ-BC-03', 'printBc03', b.k === 'M' ? P.cur.lbl : tr('pNeedMonth')]
  ];
  return `<section class="card">
    <div class="card-h">${ic('print')}${t('bcPrint')}${isQL() ? `<span class="sp"></span><button class="link small" data-act="banInSettings">${t('banInShort')}</button>` : ''}</div>
    <div class="menu flat">${items.map(([code, act, scope]) => {
      const dis = code === 'CĐ-BC-03' && b.k !== 'M';
      return `<button class="menu-item" data-act="${act}" ${dis ? 'disabled' : ''}>${ic('print', 'mi')}<div class="mi-text"><span class="pf-code">${esc(code)}</span>${t(pfKey(code))}<span class="mi-desc">${biTr(scope)}</span></div>${ic('chev', 'mi-chev')}</button>`;
    }).join('')}</div>
    <p class="muted small pad-x">${t('bcPrintHint')}</p>
  </section>`;
}
/** Chọn máy + tháng để in sổ kiểm tra đầu ca */
async function bt04Pick(preId, preM) {
  if (!needOnline()) return;
  const b = bcState();
  const defM = preM || (b.k === 'M' && S.cur && S.cur.name === 'bc' ? `${b.y}-${pad2(b.m)}` : dToday().slice(0, 7));
  let ids = preId ? [preId] : null;
  if (!ids) {
    const items = allTb().filter(tb => ktCanCheck(tb) && bcTbOk(tb.ID, b)).sort((a, z) => String(a.ID).localeCompare(String(z.ID), 'en', { numeric: true }))
      .map(x => ({ v: x.ID, vi: x.TenMay, zh: x.TenMayZH || dmZh('NHOMTB', x.NhomTB), sub: [x.MaNhaMay, dmVi('KHUVUC', x.ViTri)].filter(Boolean).join(' · ') }));
    if (!items.length) { toast('bcKtNone', 'warn'); return; }
    const v = await pickMany({ title: 'pBt04Choose', items, selected: new Set() });
    if (!v || !v.size) return;
    ids = [...v].slice(0, 60);
  }
  const sh = openSheet(`<form class="form" id="f-bt04" novalidate>
      <div class="pk-head"><h3 class="h3">${t('pfBT04')}</h3><button type="button" class="hbtn" data-act="closeSheet">${ic('x')}</button></div>
      <p class="muted small">${ids.length === 1 ? tbShort(ids[0]) : t('nDevices', ids.length)}</p>
      <label class="fld"><span class="lb">${t('pMonth')}</span><input name="m" type="month" value="${esc(defM)}" max="${esc(dToday().slice(0, 7))}" required></label>
      <button class="btn primary block" type="submit">${ic('print')}${t('pPrintNow')}</button>
    </form>`);
  $('#f-bt04', sh).addEventListener('submit', ev => {
    ev.preventDefault();
    const M = ev.target.m.value;
    if (!/^\d{4}-\d{2}$/.test(M)) return;
    closeSheet();
    printBt04(ids, M);
  });
}

/* ---- Thông tin bản in (quản lý): tên công ty, lần ban hành / ngày hiệu lực từng mẫu ---- */
function banInSheet() {
  if (!isQL() || !needOnline()) return;
  const b = banIn();
  const sh = openSheet(`<form id="f-bi" class="form" autocomplete="off" novalidate>
      <div class="pk-head"><h3 class="h3">${t('banInSettings')}</h3><button type="button" class="hbtn" data-act="closeSheet">${ic('x')}</button></div>
      <label class="fld"><span class="lb">${t('banInCv')}</span><input name="cv" value="${esc(b.cv)}" maxlength="150" placeholder="${esc(tp('banInCvPh'))}"></label>
      <label class="fld"><span class="lb">${t('banInCz')}</span><input name="cz" value="${esc(b.cz)}" maxlength="150"></label>
      <p class="muted small">${t('banInHint')}</p>
      <div class="bi-forms">${PRINT_FORMS.map(([code, key]) => {
        const f = b.f[code] || [];
        return `<div class="bi-form" data-code="${esc(code)}"><div class="bi-name"><span class="pf-code">${esc(code)}</span>${t(key)}</div>
          <div class="bi-in"><label class="fld"><span class="lb">${t('pRev')}</span><input class="bi-rev" value="${esc(f[0] || '')}" maxlength="10" placeholder="00"></label>
          <label class="fld"><span class="lb">${t('pEff')}</span><input class="bi-eff" type="date" value="${esc(f[1] || '')}"></label></div></div>`;
      }).join('')}</div>
      <div class="msg" id="bi-msg"></div>
      <button class="btn primary block" type="submit">${ic('check')}${t('save')}</button>
    </form>`);
  const form = $('#f-bi', sh);
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const o = { cv: form.cv.value.trim(), cz: form.cz.value.trim(), f: {} };
    $$('.bi-form', form).forEach(el => {
      const rev = $('.bi-rev', el).value.trim(), eff = $('.bi-eff', el).value;
      if (rev || eff) o.f[el.dataset.code] = [rev, eff];
    });
    busy(form, true);
    try {
      const r = await api('saveCauHinh', { BanIn: JSON.stringify(o) });
      S.data.cauHinh = Object.assign({}, S.data.cauHinh, r.cauHinh);
      saveCache(); closeSheet(); toast('saved', 'ok');
    } catch (e) { $('#bi-msg').innerHTML = errHtml(e); } finally { if (form.isConnected) busy(form, false); }
  });
}

/** Menu in trên trang máy: lý lịch thiết bị, sổ kiểm tra đầu ca tháng, tem QR */
function tbPrintMenu(id) {
  const tb = tbById(id);
  if (!tb) return;
  const item = (act, icon, code, key) => `<button class="menu-item" data-act="${act}" data-id="${esc(tb.ID)}">${ic(icon, 'mi')}<div class="mi-text">${code ? `<span class="pf-code">${esc(code)}</span>` : ''}${t(key)}</div>${ic('chev', 'mi-chev')}</button>`;
  openSheet(`<div class="pk-head"><h3 class="h3">${t('pPrintMenu')}</h3><button type="button" class="hbtn" data-act="closeSheet">${ic('x')}</button></div>
    <p class="muted small"><span class="tb-id">${esc(tb.ID)}</span> ${esc(tb.TenMay)}</p>
    <div class="menu flat">
      ${item('printTb02', 'doc', 'CĐ-TB-02', 'pfTB02')}
      ${ktCanCheck(tb) ? item('printBt04One', 'checklist', 'CĐ-BT-04', 'pfBT04') : ''}
      ${item('temOne', 'qr', '', 'printLabel')}
    </div>`);
}

/* -------------------------------- Thêm -------------------------------- */

VIEWS.them = () => {
  const live = [['contracts', 'file', '#/hd', 'contractsDesc'], ['predictive', 'pulse', '#/dd', 'ddDesc'], ['rca', 'target', '#/rca', 'rcaDesc'],
    ['reports', 'chart', '#/bc', 'reportsDesc']];
  const mods = [['energy', 'flash'], ['circuits', 'plug'], ['monitoring', 'monitor']];
  const nHd = S.data ? hdDue().length : 0;
  const set = [
    { href: '#/dm', icon: 'tag', key: 'catalogs' },
    { href: '#/mau', icon: 'checklist', key: 'checkTemplates' },
    { href: '#/tem', icon: 'print', key: 'printLabels', act: 'temBlank' },
    isQL() && { icon: 'clock', key: 'caSettings', act: 'caSettings' },
    isQL() && { href: '#/gc-cai', icon: 'gauge', key: 'gcSetup' },
    isQL() && { icon: 'mail', key: 'nhacSettings', act: 'nhacSettings' },
    isQL() && { icon: 'gear', key: 'nguongSettings', act: 'nguongSettings' },
    isQL() && { icon: 'print', key: 'banInSettings', act: 'banInSettings' },
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
        ${live.map(m => `<a class="menu-item" href="${m[2]}">${ic(m[1], 'mi')}<div class="mi-text">${t(m[0])}<span class="mi-desc">${t(m[3])}</span></div>
          ${m[0] === 'contracts' && nHd ? `<span class="badge hd-SAPHET">${nHd}</span>` : ''}${ic('chev', 'mi-chev')}</a>`).join('')}
        ${mods.map(m => `<div class="menu-item soon-item">${ic(m[1], 'mi')}<div class="mi-text">${t(m[0])}</div><span class="soon-tag">${t('comingSoon')}</span></div>`).join('')}
      </div>
      <h4 class="sec-h">${t('settings')}</h4>
      <div class="menu">
        ${set.map(m => m.href ? `<a class="menu-item" href="${m.href}" ${m.act ? `data-act="${m.act}"` : ''}>${ic(m.icon, 'mi')}<div class="mi-text">${t(m.key)}</div>${ic('chev', 'mi-chev')}</a>`
          : `<button class="menu-item" data-act="${m.act}">${ic(m.icon, 'mi')}<div class="mi-text">${t(m.key)}${m.key === 'caSettings' ? `<span class="mi-desc">${esc(caStarts().map(hhmmOf).join(' · '))}</span>` : ''}</div>${ic('chev', 'mi-chev')}</button>`).join('')}
        ${!standalone && S.installEvt ? `<button class="menu-item" data-act="install">${ic('phone', 'mi')}<div class="mi-text">${t('installApp')}</div>${ic('chev', 'mi-chev')}</button>` : ''}
        <button class="menu-item danger" data-act="logout">${ic('logout', 'mi')}<div class="mi-text">${t('logout')}</div></button>
      </div>
      ${!standalone && /iphone|ipad|ipod/i.test(navigator.userAgent) ? `<p class="muted small center">${t('iosInstall')}</p>` : ''}
      <p class="muted small center">${t('appName')} · v${APP_VERSION}</p>`
  };
};

/* ------------------------------ Danh mục ------------------------------ */

const DM_TABS = [['KHUVUC', 'dmKhuVuc'], ['NHOMTB', 'dmNhomTB'], ['TRANGTHAI', 'dmTrangThai'], ['LOAIHONG', 'dmLoaiHong']];

VIEWS.dm = p => {
  if (!S.data) return loadingView();
  const loai = DM_TABS.some(x => x[0] === p[1]) ? p[1] : 'KHUVUC';
  const used = {};
  if (loai === 'LOAIHONG') {
    allSC().forEach(x => { if (x.LoaiHong) used[x.LoaiHong] = (used[x.LoaiHong] || 0) + 1; });
  } else {
    const field = { KHUVUC: 'ViTri', NHOMTB: 'NhomTB', TRANGTHAI: 'TrangThai' }[loai];
    allTb().forEach(x => { used[x[field]] = (used[x[field]] || 0) + 1; });
  }
  const usedKey = loai === 'LOAIHONG' ? 'nUsedSC' : 'nUsed';
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
            <span class="dm-used">${t(usedKey, used[d.Ma] || 0)}</span>
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
  DOI_PIN_QL: 'aPinQl', SUA_MAU: 'aTpl', RESET_PIN_QL: 'aReset',
  NHAN: 'aNhan', CHO: 'aCho', TIEPTUC: 'aTiepTuc', HOANTHANH: 'aHoanThanh', DUYET: 'aDuyet',
  TRALAI: 'aTraLai', HUY: 'aHuy', XOA: 'aXoa', DOI_HAN: 'aDoiHan',
  KY_TIEP: 'aKyTiep', KET_THUC: 'aKetThuc', KHOI_PHUC: 'aKhoiPhuc', XONG_HD: 'aXongHd', KIEM_TRA_HL: 'aKiemTraHl',
  MO_LAI: 'aMoLai', EMAIL_NHAC: 'aEmailNhac', CAI_NHAC: 'aCaiNhac'
};
/** Liên kết mã bản ghi trong nhật ký tới màn hình tương ứng */
const NK_LINK = {
  ThietBi: m => '#/tb/' + m, PhieuSuaChua: m => '#/sc/' + m, PhieuBaoTri: m => '#/bt/' + m, KeHoachBaoTri: m => '#/kh/' + m,
  KiemTraDauCa: m => '#/kt/' + m, HopDong: m => '#/hd/' + m, BaoTriDuDoan: m => '#/dd/' + m, RCA: m => '#/rca/' + m,
  HanhDongKhacPhuc: m => '#/rca/' + m.split('/')[0], GioChay: m => (/^TB\d+\//i.test(m) ? '#/tb/' + m.split('/')[0] : '')
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
    // Bản ghi đã xóa thì không còn trang để mở (trừ máy: không xóa cứng)
    const href = r.MaBanGhi && NK_LINK[r.Sheet] && (r.HanhDong !== 'XOA' || ['ThietBi', 'GioChay', 'KeHoachBaoTri'].includes(r.Sheet)) ? NK_LINK[r.Sheet](r.MaBanGhi) : '';
    const link = href ? `<a class="tb-id" href="${esc(href.split('/').slice(0, 2).join('/') + '/' + encodeURIComponent(href.split('/').slice(2).join('/')))}">${esc(r.MaBanGhi)}</a>`
      : (r.MaBanGhi ? `<span class="tb-id">${esc(r.MaBanGhi)}</span>` : '');
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
  const pgs = $('#pg-style');
  if (pgs) pgs.remove();   // khổ giấy của bản in biểu mẫu (phiên 6) không áp cho tem
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
  ['GhiChu', 'Ghi chú', '备注'],
  ['KieuGioChay', 'Ghi giờ chạy', '运行小时记录']
];
const HEADER_ALIASES = {
  id: 'ID', idhethong: 'ID', manhamay: 'MaNhaMay', mathietbi: 'MaNhaMay', tenmay: 'TenMay', tenthietbi: 'TenMay',
  tenmayzh: 'TenMayZH', tenmaytrung: 'TenMayZH', tentrung: 'TenMayZH', tenmaytiengtrung: 'TenMayZH',
  nhomtb: 'NhomTB', nhomthietbi: 'NhomTB', nhom: 'NhomTB', loaithietbi: 'NhomTB',
  vitri: 'ViTri', khuvuc: 'ViTri', hang: 'Hang', hangsanxuat: 'Hang', nhasanxuat: 'Hang', model: 'Model',
  soseri: 'SoSeri', seri: 'SoSeri', serial: 'SoSeri', namsudung: 'NamSuDung', namsd: 'NamSuDung',
  congsuatkw: 'CongSuatKW', congsuat: 'CongSuatKW', thongso: 'ThongSo', thongsokythuat: 'ThongSo',
  trangthai: 'TrangThai', linktailieu: 'LinkTaiLieu', tailieu: 'LinkTaiLieu', link: 'LinkTaiLieu', ghichu: 'GhiChu',
  ghigiochay: 'KieuGioChay', kieugiochay: 'KieuGioChay', giochay: 'KieuGioChay'
};
/** Kiểu ghi giờ chạy từ ô Excel: '' = không ghi, null = không hiểu (giống backend gcKieuIn_) */
function gcKieuIn(v) {
  const n = norm(v);
  if (!n || ['khong', 'khongghi', 'khongtheodoi', 'no', 'none', '0', '不记录', '无'].includes(n)) return '';
  if (['dongho', 'donghogiochay', 'chisodongho', 'meter', 'hourmeter', '计时表', '计时表读数'].includes(n)) return 'DONGHO';
  if (['ngay', 'giongay', 'sogio', 'sogiomoingay', 'giomoingay', 'daily', '每日运行小时', '每日小时'].includes(n)) return 'NGAY';
  return null;
}
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
    if (f === 'KieuGioChay') return gcKieuTr(x[f]).vi;
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
    if (o.KieuGioChay) {
      const k = gcKieuIn(o.KieuGioChay);
      if (k === null) errs.push({ k: 'impBadDm', a: [o.KieuGioChay] });
      else o.KieuGioChay = k || 'KHONG';   // "Không" = bỏ ghi giờ chạy (ô trống = giữ nguyên)
    }
    let kind = errs.length ? 'err' : (cur ? 'upd' : 'new');
    if (kind === 'upd') {
      const val = f => (f === 'KieuGioChay' && o[f] === 'KHONG' ? '' : o[f]);
      const changed = TB_FIELDS.some(f => o[f] !== undefined && o[f] !== '' && String(val(f)) !== String(cur[f] || ''));
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
  nkMore: () => loadNk(false),

  /* Phiếu sửa chữa */
  scTab: el => { S.scf.tab = el.dataset.t; render(true); },
  scTabGo: el => { S.scf.tab = el.dataset.t; S.scf.q = ''; },
  scFilterKv: async () => {
    const all = tr('allAreas');
    const v = await picker({ title: 'fViTri', value: S.scf.kv,
      items: [{ v: '', vi: all.vi, zh: all.zh }].concat(dmList('KHUVUC', true).map(d => ({ v: d.Ma, vi: d.TenVI, zh: d.TenZH }))) });
    if (v === undefined) return;
    S.scf.kv = v; render(true);
  },
  scCsv: () => exportScCsv(),
  scLoadOld: el => scLoadOld(el),
  scOp: el => scOpSheet(el.dataset.op, el.dataset.so),
  scDelete: el => scDelete(el.dataset.so),
  scPickTb: async el => {
    const items = allTb().filter(x => x.TrangThai !== 'THANHLY')
      .sort((a, b) => String(a.ID).localeCompare(String(b.ID), 'en', { numeric: true }))
      .map(x => ({ v: x.ID, vi: `${x.ID} · ${x.TenMay}`, zh: x.TenMayZH || dmZh('NHOMTB', x.NhomTB),
        sub: [x.MaNhaMay, dmVi('KHUVUC', x.ViTri)].filter(Boolean).join(' · ') }));
    const v = await picker({ title: 'scMay', items, value: S.scForm && S.scForm.IDThietBi });
    if (v === undefined || !S.scForm) return;
    S.scForm.IDThietBi = v;
    el.innerHTML = scTbLabel(v) + ic('down');
    const box = el.closest('.fld');
    box.classList.remove('has-err');
    $('.fe', box).innerHTML = '';
    const dup = $('#sc-dup');
    if (dup) dup.innerHTML = scDupNotice(v);
  },
  /* Bảo trì kế hoạch */
  btTab: el => { S.btf.tab = el.dataset.t; render(true); },
  btTabGo: el => { S.btf.tab = el.dataset.t; S.btf.q = ''; },
  btFilter: async el => {
    const k = el.dataset.k, loai = k === 'kv' ? 'KHUVUC' : 'NHOMTB', all = tr(k === 'kv' ? 'allAreas' : 'allGroups');
    const v = await picker({ title: k === 'kv' ? 'fViTri' : 'fNhomTB', value: S.btf[k],
      items: [{ v: '', vi: all.vi, zh: all.zh }].concat(dmList(loai, true).map(d => ({ v: d.Ma, vi: d.TenVI, zh: d.TenZH }))) });
    if (v === undefined) return;
    S.btf[k] = v; render(true);
  },
  btNamFilter: async el => {
    const k = el.dataset.k, loai = k === 'kv' ? 'KHUVUC' : 'NHOMTB', all = tr(k === 'kv' ? 'allAreas' : 'allGroups');
    const v = await picker({ title: k === 'kv' ? 'fViTri' : 'fNhomTB', value: S.btNam[k],
      items: [{ v: '', vi: all.vi, zh: all.zh }].concat(dmList(loai, true).map(d => ({ v: d.Ma, vi: d.TenVI, zh: d.TenZH }))) });
    if (v === undefined) return;
    S.btNam[k] = v; render(true);
  },
  btYear: el => { S.btNam.y += Number(el.dataset.d); render(true); },
  btCsv: () => exportBtCsv(),
  btNamCsv: () => exportYearCsv(),
  btLoadOld: el => btLoadOld(el),
  btOp: el => btOpSheet(el.dataset.op, el.dataset.so),
  btDelete: el => btDelete(el.dataset.so),
  btAllPass: () => {
    const F = ckForm();
    if (!F) return;
    F.items.forEach((it, i) => { if (it.KieuNhap !== 'SO' && !F.kq[i].KetQua) F.kq[i].KetQua = 'DAT'; });
    $('#ck-list').innerHTML = F.items.map((it, i) => ckItemHtml(it, i, F.kq[i])).join('');
    ckProgress();
  },
  ckNote: el => {
    const box = el.closest('.ck-item');
    const nw = $('.ck-note', box);
    nw.hidden = false;
    el.remove();
    $('input', nw).focus();
  },
  khDoiHan: el => khDoiHanSheet(el.dataset.ma),
  khPickTb: async el => {
    if (!S.khForm) return;
    const items = allTb().filter(x => x.TrangThai !== 'THANHLY')
      .sort((a, b) => String(a.ID).localeCompare(String(b.ID), 'en', { numeric: true }))
      .map(x => ({ v: x.ID, vi: x.TenMay, zh: x.TenMayZH || dmZh('NHOMTB', x.NhomTB),
        sub: [x.MaNhaMay, dmVi('NHOMTB', x.NhomTB), dmVi('KHUVUC', x.ViTri)].filter(Boolean).join(' · ') }));
    const v = await pickMany({ title: 'khChooseTb', items, selected: S.khForm.ids });
    if (!v || !S.khForm) return;
    S.khForm.ids = new Set(v);
    el.innerHTML = khTbLabel() + ic('down');
    $('#kh-tbs').innerHTML = khTbChips();
    if ($('#kh-gio-info')) $('#kh-gio-info').innerHTML = khGioInfo();
    const box = el.closest('.fld');
    box.classList.remove('has-err');
    $('.fe', box).innerHTML = '';
  },
  khTbRemove: el => {
    if (!S.khForm) return;
    S.khForm.ids.delete(el.dataset.id);
    $('#kh-tbs').innerHTML = khTbChips();
    if ($('#kh-gio-info')) $('#kh-gio-info').innerHTML = khGioInfo();
    const b = $('[data-act="khPickTb"]');
    if (b) b.innerHTML = khTbLabel() + ic('down');
  },
  khCopyCk: async () => {
    const F = S.khForm;
    if (!F) return;
    const items = allKH().filter(k => k.MaKH !== F.kh.MaKH && hmOf(k.MaKH).length)
      .sort((a, b) => String(a.TenVI).localeCompare(String(b.TenVI), 'vi') || String(a.MaKH).localeCompare(String(b.MaKH)))
      .map(k => { const tb = tbById(k.IDThietBi); return { v: 'KH:' + k.MaKH, vi: k.TenVI, zh: k.TenZH,
        sub: `${k.MaKH} · ${k.IDThietBi}${tb ? ' ' + tb.TenMay : ''} · ${tp('nItems', hmOf(k.MaKH).length)}` }; });
    const tpl = tr('khFromShiftTpl');
    [{ Ma: 'CHUNG', TenVI: tr('generalTpl').vi, TenZH: tr('generalTpl').zh }].concat(dmList('NHOMTB')).forEach(g => {
      const m = mauOf(g.Ma).filter(x => isOn(x.DangDung));
      if (m.length) items.push({ v: 'MAU:' + g.Ma, vi: `${tpl.vi}: ${g.TenVI}`, zh: `${tpl.zh}：${g.TenZH || ''}`, sub: tp('nItems', m.length) });
    });
    if (!items.length) { toast('khNoCopySrc', 'warn'); return; }
    const v = await picker({ title: 'khCopyFrom', items });
    if (!v || !S.khForm) return;
    const src = v.startsWith('KH:') ? hmOf(v.slice(3)) : mauOf(v.slice(4)).filter(x => isOn(x.DangDung));
    if (F.items.length && !(await confirmDlg('khCopyFrom', 'khCopyReplaceQ', { ok: 'khCopyReplace' }))) return;
    F.items = src.map(x => ({ HangMucVI: x.HangMucVI, HangMucZH: x.HangMucZH, KieuNhap: x.KieuNhap === 'SO' ? 'SO' : 'DAT',
      DonVi: x.DonVi || '', Min: x.Min || '', Max: x.Max || '' }));
    $('#kh-ck').innerHTML = drawKhCk();
    toast(tr('khCopied', [F.items.length]), 'ok');
  },
  khCkAdd: () => {
    const F = S.khForm;
    if (!F) return;
    F.items.push({ HangMucVI: '', HangMucZH: '', KieuNhap: 'DAT', DonVi: '', Min: '', Max: '' });
    $('#kh-ck').innerHTML = drawKhCk();
    const last = $$('#kh-ck .mau-item').pop();
    if (last) { last.scrollIntoView({ behavior: 'smooth', block: 'center' }); $('input', last).focus(); }
  },
  khCkMove: el => {
    const F = S.khForm;
    if (!F) return;
    const i = Number(el.dataset.i), d = Number(el.dataset.d), a = F.items;
    if (i + d < 0 || i + d >= a.length) return;
    [a[i], a[i + d]] = [a[i + d], a[i]];
    $('#kh-ck').innerHTML = drawKhCk();
  },
  khCkDel: async el => {
    const F = S.khForm;
    if (!F) return;
    const i = Number(el.dataset.i);
    const it = F.items[i];
    if (it.HangMucVI && !(await confirmDlg('deleteItem', { vi: it.HangMucVI, zh: it.HangMucZH }, { ok: 'delete', danger: true }))) return;
    F.items.splice(i, 1);
    $('#kh-ck').innerHTML = drawKhCk();
  },
  /* Kiểm tra đầu ca & giờ chạy (phiên 4) */
  ktTab: el => { S.ktf.tab = el.dataset.t; render(true); },
  ktTabGo: el => { S.ktf.tab = el.dataset.t; S.ktf.q = ''; S.ktf.ngay = ''; S.ktf.ca = ''; },
  ktCa: el => {
    const c = caStep(ktSel(), Number(el.dataset.d)), now = caNow();
    if (caCmp(c, now) > 0) return;
    if (caKey(c) === caKey(now)) { S.ktf.ngay = ''; S.ktf.ca = ''; } else { S.ktf.ngay = c.ngay; S.ktf.ca = c.ca; }
    render(true);
  },
  ktNow: () => { S.ktf.ngay = ''; S.ktf.ca = ''; render(true); },
  ktFilter: async el => {
    const k = el.dataset.k, loai = k === 'kv' ? 'KHUVUC' : 'NHOMTB', all = tr(k === 'kv' ? 'allAreas' : 'allGroups');
    const v = await picker({ title: k === 'kv' ? 'fViTri' : 'fNhomTB', value: S.ktf[k],
      items: [{ v: '', vi: all.vi, zh: all.zh }].concat(dmList(loai, true).map(d => ({ v: d.Ma, vi: d.TenVI, zh: d.TenZH }))) });
    if (v === undefined) return;
    S.ktf[k] = v; render(true);
  },
  ktGo: el => {
    // Nhớ thứ tự các máy chưa kiểm tra đang hiện → nút "Lưu & máy tiếp"
    const c = ktSel();
    S.ktNext = { ca: c, ids: ktListItems(ktShift(c), 'CHUA').map(x => x.tb.ID) };
  },
  ktCsv: () => exportKtShiftCsv(),
  ktCsvRange: () => exportRangeCsv('kt'),
  ktDelete: el => ktDelete(el.dataset.so),
  caSettings: () => caSettingsSheet(),
  gcDay: el => {
    const d = dAdd(gcNgay(), Number(el.dataset.d), 'NGAY'), today = dToday();
    if (d > today || d < dAdd(today, -(GC_DAYS - 1), 'NGAY')) return;
    S.gcEdit = {};
    S.gcf.ngay = d === today ? '' : d;
    render(true);
  },
  gcFilter: async el => {
    const k = el.dataset.k, loai = k === 'kv' ? 'KHUVUC' : 'NHOMTB', all = tr(k === 'kv' ? 'allAreas' : 'allGroups');
    const v = await picker({ title: k === 'kv' ? 'fViTri' : 'fNhomTB', value: S.gcf[k],
      items: [{ v: '', vi: all.vi, zh: all.zh }].concat(dmList(loai, true).map(d => ({ v: d.Ma, vi: d.TenVI, zh: d.TenZH }))) });
    if (v === undefined) return;
    S.gcf[k] = v; render(true);
  },
  gcUndo: () => { S.gcEdit = {}; document.body.classList.remove('no-ptr'); drawGcList(); },
  gcCsv: () => exportRangeCsv('gc'),
  gcOne: el => gcOneSheet(el.dataset.id),
  gcKieuOne: el => gcKieuOne(el.dataset.id),
  gcDelete: el => gcDelete(el.dataset.id, el.dataset.ngay),
  gsFilter: async el => {
    const st = S.gcSet, k = el.dataset.k, loai = k === 'kv' ? 'KHUVUC' : 'NHOMTB', all = tr(k === 'kv' ? 'allAreas' : 'allGroups');
    const v = await picker({ title: k === 'kv' ? 'fViTri' : 'fNhomTB', value: st[k],
      items: [{ v: '', vi: all.vi, zh: all.zh }].concat(dmList(loai, true).map(d => ({ v: d.Ma, vi: d.TenVI, zh: d.TenZH }))) });
    if (v === undefined) return;
    st[k] = v; render(true);
  },
  gsAll: el => {
    const st = S.gcSet, k = el.dataset.k;
    gsShown().forEach(tb => { if (k === (tb.KieuGioChay || '')) delete st.ch[tb.ID]; else st.ch[tb.ID] = k; });
    drawGsList();
  },
  gsUndo: () => { S.gcSet.ch = {}; drawGsList(); },
  gsSave: el => gsSave(el),
  /* Phiên 5 — hợp đồng */
  hdTab: el => { S.hdf.tab = el.dataset.t; render(true); },
  hdTabGo: el => { S.hdf.tab = el.dataset.t; S.hdf.q = ''; },
  hdCsv: () => exportHdCsv(),
  hdPickTb: async el => {
    const F = S.hdForm;
    if (!F) return;
    const items = allTb().filter(x => x.TrangThai !== 'THANHLY' || F.ids.has(String(x.ID).toUpperCase()))
      .sort((a, b) => String(a.ID).localeCompare(String(b.ID), 'en', { numeric: true }))
      .map(x => ({ v: x.ID, vi: x.TenMay, zh: x.TenMayZH || dmZh('NHOMTB', x.NhomTB), sub: [x.MaNhaMay, dmVi('NHOMTB', x.NhomTB), dmVi('KHUVUC', x.ViTri)].filter(Boolean).join(' · ') }));
    const v = await pickMany({ title: 'hdChooseTb', items, selected: F.ids });
    if (!v || !S.hdForm) return;
    F.ids = new Set(v);
    el.innerHTML = hdTbLabel() + ic('down');
    $('#hd-tbs').innerHTML = hdTbChips();
  },
  hdTbRemove: el => {
    if (!S.hdForm) return;
    S.hdForm.ids.delete(el.dataset.id);
    $('#hd-tbs').innerHTML = hdTbChips();
    const b = $('[data-act="hdPickTb"]');
    if (b) b.innerHTML = hdTbLabel() + ic('down');
  },
  hdDur: el => {
    const F = S.hdForm;
    if (!F || !F.h.NgayBatDau) return;
    F.h.NgayKetThuc = dAdd(dAdd(F.h.NgayBatDau, Number(el.dataset.m), 'THANG'), -1, 'NGAY');
    const inp = $('#f-hd [data-hf="NgayKetThuc"]');
    if (inp) { inp.value = F.h.NgayKetThuc; const box = inp.closest('.has-err'); if (box) { box.classList.remove('has-err'); $('.fe', box).innerHTML = ''; } }
    $('#hd-dur-now').innerHTML = biTr(hdDurTr(F.h));
  },
  hdEnd: el => hdEndSheet(el.dataset.ma),
  hdRestore: el => hdSimpleOp('khoiphuc', el.dataset.ma),
  hdDelete: el => hdSimpleOp('xoa', el.dataset.ma),
  /* Phiên 5 — bảo trì dự đoán */
  ddTab: el => { S.ddf.tab = el.dataset.t; render(true); },
  ddTabGo: el => { S.ddf.tab = el.dataset.t; S.ddf.q = ''; },
  ddFilter: async el => { const k = el.dataset.k; const v = await pickKvNhom(k, S.ddf[k]); if (v === undefined) return; S.ddf[k] = v; render(true); },
  ddFilterLoai: async () => {
    const all = tr('ddAllTypes');
    const v = await picker({ title: 'ddType', value: S.ddf.loai,
      items: [{ v: '', vi: all.vi, zh: all.zh }].concat(DD_LOAI.map(l => { const x = tr('ddL' + l); return { v: l, vi: x.vi, zh: x.zh }; })) });
    if (v === undefined) return;
    S.ddf.loai = v; render(true);
  },
  ddCsv: () => exportDdCsv(),
  ddLoadOld: el => ddLoadOld(el),
  ddNew: () => ddNewFlow(null),
  ddNewTb: el => ddNewFlow(el.dataset.id),
  ddDelete: el => ddDelete(el.dataset.so),
  ddPickChuan: async el => {
    const F = S.ddForm;
    if (!F) return;
    const items = Object.keys(DD_CHUAN[F.loai]).concat('TUY').map(c => {
      const x = ddChuanTr(F.loai, c);
      return { v: c, vi: x.vi, zh: x.zh, sub: c !== 'TUY' ? ddZones(F.loai, DD_CHUAN[F.loai][c]) : '' };
    });
    const v = await picker({ title: 'ddStd', items, value: F.chuan });
    if (!v || !S.ddForm) return;
    F.chuan = v;
    if (v !== 'TUY') F.ng = DD_CHUAN[F.loai][v].slice();
    el.innerHTML = ddChuanLabel() + ic('down');
    const box = el.closest('.fld'); box.classList.remove('has-err'); $('.fe', box).innerHTML = '';
    $('#dd-ng').innerHTML = ddNgHtml();
    F.pts.forEach((p, i) => ddPtRefresh(i));
    ddSum();
  },
  ddPtAdd: () => {
    const F = S.ddForm;
    if (!F) return;
    if (F.pts.length >= 60) { toast('eTooMany', 'warn'); return; }
    F.pts.push({ t: '' });
    $('#dd-pts').innerHTML = F.pts.map((p, i) => ddPtForm(p, i)).join('');
    ddSum();
    const last = $$('#dd-pts .dd-ptf').pop();
    if (last) { last.scrollIntoView({ behavior: 'smooth', block: 'center' }); $('.dd-ptname', last).focus(); }
  },
  ddPtDel: async el => {
    const F = S.ddForm;
    if (!F) return;
    const i = Number(el.dataset.i), p = F.pts[i];
    const has = p && Object.keys(p).some(k => String(p[k] || '').trim());
    if (has && !(await confirmDlg('deleteItem', { vi: p.t || tr('ddPoints').vi + ' ' + (i + 1), zh: '' }, { ok: 'delete', danger: true }))) return;
    F.pts.splice(i, 1);
    $('#dd-pts').innerHTML = F.pts.map((q, j) => ddPtForm(q, j)).join('');
    ddSum();
  },
  /* Phiên 5 — RCA */
  rcaTab: el => { S.rcaf.tab = el.dataset.t; render(true); },
  rcaTabGo: el => { S.rcaf.tab = el.dataset.t; S.rcaf.q = ''; },
  rcaFilter: async el => { const k = el.dataset.k; const v = await pickKvNhom(k, S.rcaf[k]); if (v === undefined) return; S.rcaf[k] = v; render(true); },
  rcaCsv: () => exportRcaCsv(),
  rcaPickTb: async el => {
    const F = S.rcaForm;
    if (!F) return;
    const v = await picker({ title: 'scMay', items: tbPickItems(), value: F.r.IDThietBi });
    if (!v || !S.rcaForm) return;
    F.r.IDThietBi = v;
    F.rel = new Set();
    const y = window.scrollY; render(true); window.scrollTo(0, y);
  },
  rcaPickCat: async el => {
    const F = S.rcaForm;
    if (!F) return;
    const none = tr('none');
    const v = await picker({ title: 'rcaRootCat', value: F.r.NhomNguyenNhan || '',
      items: [{ v: '', vi: none.vi, zh: none.zh }].concat(RCA_6M.map(k => { const x = tr('m6' + k); return { v: k, vi: x.vi, zh: x.zh }; })) });
    if (v === undefined || !S.rcaForm) return;
    F.r.NhomNguyenNhan = v;
    el.innerHTML = (v ? t('m6' + v) : `<span class="muted">${t('choose')}</span>`) + ic('down');
  },
  hdkAdd: () => {
    const F = S.rcaForm;
    if (!F) return;
    if (F.acts.length >= 30) { toast('eTooMany', 'warn'); return; }
    F.acts.push({ Loai: F.acts.length ? 'KHACPHUC' : 'TAMTHOI', NoiDung: '', PhuTrach: '', Han: '', NgayXong: '', KetQua: '' });
    $('#rca-acts').innerHTML = rcaActsForm();
    const last = $$('#rca-acts .hdk-f').pop();
    if (last) { last.scrollIntoView({ behavior: 'smooth', block: 'center' }); $('textarea', last).focus(); }
  },
  hdkDel: async el => {
    const F = S.rcaForm;
    if (!F) return;
    const i = Number(el.dataset.i), a = F.acts[i];
    if (a && a.NoiDung && !(await confirmDlg('deleteItem', { vi: a.NoiDung, zh: '' }, { ok: 'delete', danger: true }))) return;
    F.acts.splice(i, 1);
    $('#rca-acts').innerHTML = rcaActsForm();
  },
  hdkDone: el => hdkDoneSheet(el.dataset.so, el.dataset.stt, false),
  hdkUndo: el => hdkDoneSheet(el.dataset.so, el.dataset.stt, true),
  rcaVerify: el => rcaVerifySheet(el.dataset.so),
  rcaReopen: el => rcaSimpleOp('molai', el.dataset.so),
  rcaCancel: el => rcaCancelSheet(el.dataset.so),
  rcaDelete: el => rcaSimpleOp('xoa', el.dataset.so),
  nhacSettings: () => nhacSheet(),
  nguongSettings: () => nguongSheet(),
  /* Phiên 6 — báo cáo, bản in */
  bcKind: el => { bcSetKind(el.dataset.k); render(true); },
  bcStep: el => { bcStep(Number(el.dataset.d)); render(true); },
  bcFilter: async el => { const b = bcState(), k = el.dataset.k; const v = await pickKvNhom(k, b[k]); if (v === undefined) return; b[k] = v; render(true); },
  bcSet: el => { const b = bcState(), f = el.dataset.f; b[f] = f === 'all' ? !!el.dataset.v : el.dataset.v; render(true); },
  bcRetry: () => { const P = bcPeriod(bcState()), k = bcKey(P.fetch); delete S.bcErr[k]; delete S.bcRes[k]; render(true); },
  bcTbCsv: () => exportBcTbCsv(),
  printSc04: () => printSc04(),
  printBt07k: () => printBt07k(),
  printBt04Pick: () => bt04Pick(null),
  printBt04One: el => { closeSheet(); bt04Pick(el.dataset.id, el.dataset.m); },
  printBt05: () => { const b = bcState(); printBt05(Number(bcPeriod(b).cur.den.slice(0, 4)), { kv: b.kv, nhom: b.nhom }); },
  printBt01: () => { const b = bcState(); printBt01(Number(bcPeriod(b).cur.den.slice(0, 4)), { kv: b.kv, nhom: b.nhom }); },
  printBt01Nam: () => printBt01(S.btNam.y, { kv: S.btNam.kv, nhom: S.btNam.nhom, q: S.btNam.q }),
  printBc01: () => { const b = bcState(); printBc01(Number(bcPeriod(b).cur.den.slice(0, 4)), { kv: b.kv, nhom: b.nhom }); },
  printBc03: () => printBc03(),
  printSc02: el => printSc02(el.dataset.so),
  printBt03: el => printBt03(el.dataset.so),
  printDd: el => printDd(el.dataset.so),
  printRca: el => printRca(el.dataset.so),
  printTb02: el => { closeSheet(); printTb02(el.dataset.id); },
  tbPrintMenu: el => tbPrintMenu(el.dataset.id),
  banInSettings: () => banInSheet(),
  nhacTest: el => nhacTest(el),
  scPickLoai: async el => {
    if (!S.scForm) return;
    const cur = S.scForm.LoaiHong;
    const items = dmList('LOAIHONG').map(d => ({ v: d.Ma, vi: d.TenVI, zh: d.TenZH }));
    if (cur && !items.some(i => i.v === cur)) { const d = dmGet('LOAIHONG', cur); if (d) items.unshift({ v: d.Ma, vi: d.TenVI, zh: d.TenZH, sub: tp('inactive') }); }
    const v = await picker({ title: 'scLoaiHong', items, value: cur });
    if (v === undefined) return;
    S.scForm.LoaiHong = v;
    el.innerHTML = dmBi('LOAIHONG', v) + ic('down');
    const box = el.closest('.fld');
    box.classList.remove('has-err');
    $('.fe', box).innerHTML = '';
  }
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
    if (S.btForm && !/^#\/(bt-moi\/|bt\/[^/]+\/sua)/.test(location.hash)) S.btForm = null;
    if (S.khForm && !/^#\/(kh-moi|kh\/[^/]+\/sua)/.test(location.hash)) S.khForm = null;
    if (S.ktForm && !/^#\/(kt-moi\/|kt\/[^/]+\/sua)/.test(location.hash)) S.ktForm = null;
    if (!/^#\/gc(\/|$)/.test(location.hash)) S.gcEdit = {};
    if (S.gcSet && !/^#\/gc-cai/.test(location.hash)) S.gcSet = null;
    if (S.hdForm && !/^#\/(hd-moi|hd\/[^/]+\/sua)/.test(location.hash)) S.hdForm = null;
    if (S.ddForm && !/^#\/(dd-moi\/|dd\/[^/]+\/sua)/.test(location.hash)) S.ddForm = null;
    if (S.rcaForm && !/^#\/(rca-moi|rca\/[^/]+\/sua)/.test(location.hash)) S.rcaForm = null;
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
