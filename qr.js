/* Bộ tạo mã QR tự viết (chế độ byte, UTF-8), không cần mạng.
 * Dùng: QR.svg('https://...', { margin: 2 })  → chuỗi <svg>
 *       QR.encode('text', 'M')                → { size, isDark(x, y) }
 * Thuật toán theo chuẩn ISO/IEC 18004 (tham khảo cách làm của Project Nayuki, MIT).
 */
(function (global) {
  'use strict';

  var ECL = { L: 0, M: 1, Q: 2, H: 3 };
  var ECL_FORMAT = [1, 0, 3, 2];
  var ECC_PER_BLOCK = [
    [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30]
  ];
  var NUM_BLOCKS = [
    [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81]
  ];

  function bit(x, i) { return ((x >>> i) & 1) !== 0; }

  function rawModules(ver) {
    var r = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      var na = Math.floor(ver / 7) + 2;
      r -= (25 * na - 10) * na - 55;
      if (ver >= 7) r -= 36;
    }
    return r;
  }
  function dataCodewords(ver, e) {
    return Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[e][ver] * NUM_BLOCKS[e][ver];
  }

  function gfMul(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  }
  function rsDivisor(deg) {
    var res = [];
    for (var i = 0; i < deg - 1; i++) res.push(0);
    res.push(1);
    var root = 1;
    for (i = 0; i < deg; i++) {
      for (var j = 0; j < res.length; j++) {
        res[j] = gfMul(res[j], root);
        if (j + 1 < res.length) res[j] ^= res[j + 1];
      }
      root = gfMul(root, 0x02);
    }
    return res;
  }
  function rsRemainder(data, div) {
    var res = div.map(function () { return 0; });
    data.forEach(function (b) {
      var f = b ^ res.shift();
      res.push(0);
      div.forEach(function (c, i) { res[i] ^= gfMul(c, f); });
    });
    return res;
  }

  function utf8(str) {
    if (typeof TextEncoder !== 'undefined') return Array.prototype.slice.call(new TextEncoder().encode(str));
    var s = unescape(encodeURIComponent(str)), out = [];
    for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
    return out;
  }

  function encode(text, minEcl) {
    var bytes = utf8(String(text));
    var e = ECL[minEcl || 'M'];
    if (e === undefined) e = 1;
    var ver, ccBits, usedBits;
    for (ver = 1; ver <= 40; ver++) {
      ccBits = ver <= 9 ? 8 : 16;
      usedBits = 4 + ccBits + bytes.length * 8;
      if (usedBits <= dataCodewords(ver, e) * 8) break;
    }
    if (ver > 40) throw new Error('QR: dữ liệu quá dài');
    for (var ne = e + 1; ne <= 3; ne++) if (usedBits <= dataCodewords(ver, ne) * 8) e = ne;

    // Chuỗi bit dữ liệu
    var bb = [];
    function push(val, len) { for (var i = len - 1; i >= 0; i--) bb.push((val >>> i) & 1); }
    push(4, 4);
    push(bytes.length, ccBits);
    bytes.forEach(function (b) { push(b, 8); });
    var cap = dataCodewords(ver, e) * 8;
    push(0, Math.min(4, cap - bb.length));
    push(0, (8 - bb.length % 8) % 8);
    for (var pad = 0xEC; bb.length < cap; pad ^= 0xEC ^ 0x11) push(pad, 8);
    var data = [];
    for (var i = 0; i < bb.length; i += 8) {
      var v = 0;
      for (var j = 0; j < 8; j++) v = (v << 1) | bb[i + j];
      data.push(v);
    }

    // Thêm mã sửa lỗi và xen kẽ các khối
    var nb = NUM_BLOCKS[e][ver], eccLen = ECC_PER_BLOCK[e][ver];
    var raw = Math.floor(rawModules(ver) / 8);
    var nShort = nb - raw % nb, shortLen = Math.floor(raw / nb);
    var div = rsDivisor(eccLen), blocks = [];
    for (i = 0, j = 0; i < nb; i++) {
      var dat = data.slice(j, j + shortLen - eccLen + (i < nShort ? 0 : 1));
      j += dat.length;
      var ecc = rsRemainder(dat, div);
      if (i < nShort) dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    var all = [];
    for (i = 0; i < blocks[0].length; i++) {
      for (j = 0; j < blocks.length; j++) {
        if (i !== shortLen - eccLen || j >= nShort) all.push(blocks[j][i]);
      }
    }

    // Ma trận
    var size = ver * 4 + 17;
    var mod = [], fn = [];
    for (i = 0; i < size; i++) {
      mod.push(new Array(size).fill(false));
      fn.push(new Array(size).fill(false));
    }
    function setF(x, y, d) { mod[y][x] = d; fn[y][x] = true; }

    for (i = 0; i < size; i++) { setF(6, i, i % 2 === 0); setF(i, 6, i % 2 === 0); }
    function finder(cx, cy) {
      for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
        var d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) setF(x, y, d !== 2 && d !== 4);
      }
    }
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    var pos = [];
    if (ver > 1) {
      var na = Math.floor(ver / 7) + 2;
      var step = Math.floor((ver * 8 + na * 3 + 5) / (na * 4 - 4)) * 2;
      for (var p = size - 7; pos.length < na - 1; p -= step) pos.unshift(p);
      pos.unshift(6);
    }
    var last = pos.length - 1;
    pos.forEach(function (py, a) {
      pos.forEach(function (px, b) {
        if ((a === 0 && b === 0) || (a === 0 && b === last) || (a === last && b === 0)) return;
        for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) {
          setF(px + dx, py + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      });
    });
    function formatBits(mask) {
      var d = ECL_FORMAT[e] << 3 | mask, r = d;
      for (var k = 0; k < 10; k++) r = (r << 1) ^ ((r >>> 9) * 0x537);
      var bits = (d << 10 | r) ^ 0x5412;
      for (k = 0; k <= 5; k++) setF(8, k, bit(bits, k));
      setF(8, 7, bit(bits, 6)); setF(8, 8, bit(bits, 7)); setF(7, 8, bit(bits, 8));
      for (k = 9; k < 15; k++) setF(14 - k, 8, bit(bits, k));
      for (k = 0; k < 8; k++) setF(size - 1 - k, 8, bit(bits, k));
      for (k = 8; k < 15; k++) setF(8, size - 15 + k, bit(bits, k));
      setF(8, size - 8, true);
    }
    formatBits(0);
    if (ver >= 7) {
      var r = ver;
      for (i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1F25);
      var vb = ver << 12 | r;
      for (i = 0; i < 18; i++) {
        var c = bit(vb, i), a2 = size - 11 + i % 3, b2 = Math.floor(i / 3);
        setF(a2, b2, c); setF(b2, a2, c);
      }
    }

    // Đặt dữ liệu theo đường zigzag
    var bi = 0;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) {
        for (j = 0; j < 2; j++) {
          var x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
          if (!fn[y][x] && bi < all.length * 8) {
            mod[y][x] = bit(all[bi >>> 3], 7 - (bi & 7));
            bi++;
          }
        }
      }
    }

    function applyMask(m) {
      for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) {
        if (fn[y][x]) continue;
        var inv;
        switch (m) {
          case 0: inv = (x + y) % 2 === 0; break;
          case 1: inv = y % 2 === 0; break;
          case 2: inv = x % 3 === 0; break;
          case 3: inv = (x + y) % 3 === 0; break;
          case 4: inv = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: inv = x * y % 2 + x * y % 3 === 0; break;
          case 6: inv = (x * y % 2 + x * y % 3) % 2 === 0; break;
          default: inv = ((x + y) % 2 + x * y % 3) % 2 === 0;
        }
        if (inv) mod[y][x] = !mod[y][x];
      }
    }
    function penalty() {
      var score = 0, dark = 0, x, y, run, prev;
      var P1 = [true, false, true, true, true, false, true, false, false, false, false];
      var P2 = [false, false, false, false, true, false, true, true, true, false, true];
      function line(get) {
        run = 0; prev = null;
        for (var k = 0; k < size; k++) {
          var v = get(k);
          if (v === prev) { run++; if (run === 5) score += 3; else if (run > 5) score++; }
          else { run = 1; prev = v; }
        }
        for (k = 0; k + 11 <= size; k++) {
          var m1 = true, m2 = true;
          for (var t = 0; t < 11; t++) {
            var w = get(k + t);
            if (w !== P1[t]) m1 = false;
            if (w !== P2[t]) m2 = false;
          }
          if (m1) score += 40;
          if (m2) score += 40;
        }
      }
      for (y = 0; y < size; y++) line(function (k) { return mod[y][k]; });
      for (x = 0; x < size; x++) line(function (k) { return mod[k][x]; });
      for (y = 0; y < size - 1; y++) for (x = 0; x < size - 1; x++) {
        var cc = mod[y][x];
        if (cc === mod[y][x + 1] && cc === mod[y + 1][x] && cc === mod[y + 1][x + 1]) score += 3;
      }
      for (y = 0; y < size; y++) for (x = 0; x < size; x++) if (mod[y][x]) dark++;
      var total = size * size;
      score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
      return score;
    }
    var best = 0, bestScore = Infinity;
    for (var m = 0; m < 8; m++) {
      applyMask(m); formatBits(m);
      var s = penalty();
      if (s < bestScore) { bestScore = s; best = m; }
      applyMask(m);
    }
    applyMask(best); formatBits(best);

    return {
      version: ver, ecl: 'LMQH'.charAt(e), mask: best, size: size,
      isDark: function (x, y) { return x >= 0 && y >= 0 && x < size && y < size && mod[y][x]; }
    };
  }

  function svg(text, opt) {
    opt = opt || {};
    var q = encode(text, opt.ecl || 'M');
    var mg = opt.margin === undefined ? 4 : opt.margin, n = q.size + mg * 2, d = '';
    for (var y = 0; y < q.size; y++) {
      for (var x = 0; x < q.size; x++) {
        if (!q.isDark(x, y)) continue;
        var len = 1;
        while (q.isDark(x + len, y)) len++;
        d += 'M' + (x + mg) + ' ' + (y + mg) + 'h' + len + 'v1h-' + len + 'z';
        x += len - 1;
      }
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + n + ' ' + n + '" shape-rendering="crispEdges"' +
      (opt.cls ? ' class="' + opt.cls + '"' : '') + '><rect width="' + n + '" height="' + n + '" fill="#fff"/>' +
      '<path d="' + d + '" fill="#000"/></svg>';
  }

  global.QR = { encode: encode, svg: svg };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.QR;
})(typeof window !== 'undefined' ? window : this);
