/* ==========================================================================
   Анатомия JPEG — кодек baseline JPEG (ITU-T T.81), написанный вручную.
   Кодер: RGB → YCbCr → прореживание цвета → ДКП 8×8 → квантование →
          зигзаг → серии нулей → коды Хаффмана → настоящий файл .jpg.
   Декодер: читает этот же файл байт за байтом и собирает картинку обратно.
   ========================================================================== */
(function (root) {
  'use strict';

  /* ---------- Таблицы стандарта (приложение K) ---------- */

  // K.1: базовые таблицы квантования, обычный (построчный) порядок
  const STD_Q_LUMA = [
    16, 11, 10, 16, 24, 40, 51, 61,
    12, 12, 14, 19, 26, 58, 60, 55,
    14, 13, 16, 24, 40, 57, 69, 56,
    14, 17, 22, 29, 51, 87, 80, 62,
    18, 22, 37, 56, 68, 109, 103, 77,
    24, 35, 55, 64, 81, 104, 113, 92,
    49, 64, 78, 87, 103, 121, 120, 101,
    72, 92, 95, 98, 112, 100, 103, 99,
  ];
  const STD_Q_CHROMA = [
    17, 18, 24, 47, 99, 99, 99, 99,
    18, 21, 26, 66, 99, 99, 99, 99,
    24, 26, 56, 99, 99, 99, 99, 99,
    47, 66, 99, 99, 99, 99, 99, 99,
    99, 99, 99, 99, 99, 99, 99, 99,
    99, 99, 99, 99, 99, 99, 99, 99,
    99, 99, 99, 99, 99, 99, 99, 99,
    99, 99, 99, 99, 99, 99, 99, 99,
  ];

  // K.3: типовые таблицы Хаффмана. bits[i] — сколько кодов длины i+1.
  const range12 = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const STD_HUFF = {
    dcY: { bits: [0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0], vals: range12 },
    dcC: { bits: [0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0], vals: range12 },
    acY: {
      bits: [0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d],
      vals: [
        0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07,
        0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08, 0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0,
        0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28,
        0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49,
        0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69,
        0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
        0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7,
        0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5,
        0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2,
        0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8,
        0xf9, 0xfa,
      ],
    },
    acC: {
      bits: [0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 0x77],
      vals: [
        0x00, 0x01, 0x02, 0x03, 0x11, 0x04, 0x05, 0x21, 0x31, 0x06, 0x12, 0x41, 0x51, 0x07, 0x61, 0x71,
        0x13, 0x22, 0x32, 0x81, 0x08, 0x14, 0x42, 0x91, 0xa1, 0xb1, 0xc1, 0x09, 0x23, 0x33, 0x52, 0xf0,
        0x15, 0x62, 0x72, 0xd1, 0x0a, 0x16, 0x24, 0x34, 0xe1, 0x25, 0xf1, 0x17, 0x18, 0x19, 0x1a, 0x26,
        0x27, 0x28, 0x29, 0x2a, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48,
        0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68,
        0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87,
        0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5,
        0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3,
        0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda,
        0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8,
        0xf9, 0xfa,
      ],
    },
  };

  // Зигзаг: ZZ[k] — индекс в обычном порядке для k-го элемента зигзага
  const ZZ = (() => {
    const zz = new Int32Array(64);
    let i = 0;
    for (let s = 0; s < 15; s++) {
      if (s % 2 === 0) {
        for (let y = Math.min(s, 7); y >= Math.max(0, s - 7); y--) zz[i++] = y * 8 + (s - y);
      } else {
        for (let x = Math.min(s, 7); x >= Math.max(0, s - 7); x--) zz[i++] = (s - x) * 8 + x;
      }
    }
    return zz;
  })();
  const UNZZ = (() => { const u = new Int32Array(64); for (let k = 0; k < 64; k++) u[ZZ[k]] = k; return u; })();

  // Схемы прореживания: множители h×v у яркости (у цветовых каналов всегда 1×1)
  const SUBSAMPLING = {
    '444': { h: 1, v: 1, label: '4:4:4' },
    '422': { h: 2, v: 1, label: '4:2:2' },
    '420': { h: 2, v: 2, label: '4:2:0' },
  };

  /* ---------- ДКП: матрица косинусов ---------- */

  // COS[u*8+x] = ½·c(u)·cos((2x+1)uπ/16), c(0)=1/√2. Матрица ортонормирована.
  const COS = (() => {
    const c = new Float64Array(64);
    for (let u = 0; u < 8; u++) {
      const cu = u === 0 ? Math.SQRT1_2 : 1;
      for (let x = 0; x < 8; x++) c[u * 8 + x] = 0.5 * cu * Math.cos(((2 * x + 1) * u * Math.PI) / 16);
    }
    return c;
  })();

  // Прямое ДКП блока: inp — 64 отсчёта (со сдвигом −128), результат пишется в out[outOff..]
  const _t1 = new Float64Array(64);
  function fdct8x8(inp, out, outOff) {
    const C = COS, t = _t1;
    for (let y = 0; y < 8; y++) {
      const r = y * 8;
      const a0 = inp[r], a1 = inp[r + 1], a2 = inp[r + 2], a3 = inp[r + 3], a4 = inp[r + 4], a5 = inp[r + 5], a6 = inp[r + 6], a7 = inp[r + 7];
      for (let u = 0; u < 8; u++) {
        const c = u * 8;
        t[r + u] = C[c] * a0 + C[c + 1] * a1 + C[c + 2] * a2 + C[c + 3] * a3 + C[c + 4] * a4 + C[c + 5] * a5 + C[c + 6] * a6 + C[c + 7] * a7;
      }
    }
    for (let u = 0; u < 8; u++) {
      const a0 = t[u], a1 = t[8 + u], a2 = t[16 + u], a3 = t[24 + u], a4 = t[32 + u], a5 = t[40 + u], a6 = t[48 + u], a7 = t[56 + u];
      for (let v = 0; v < 8; v++) {
        const c = v * 8;
        out[outOff + c + u] = C[c] * a0 + C[c + 1] * a1 + C[c + 2] * a2 + C[c + 3] * a3 + C[c + 4] * a4 + C[c + 5] * a5 + C[c + 6] * a6 + C[c + 7] * a7;
      }
    }
  }

  // Обратное ДКП: coef — 64 коэффициента (уже умноженные на шаг), out — 64 отсчёта.
  // Строки коэффициентов, где всё нули, пропускаются: у фотографий их большинство.
  const _t2 = new Float64Array(64);
  const _rowNZ = new Uint8Array(8);
  function idct8x8(coef, out) {
    const C = COS, t = _t2;
    for (let v = 0; v < 8; v++) {
      const r = v * 8;
      const f0 = coef[r], f1 = coef[r + 1], f2 = coef[r + 2], f3 = coef[r + 3], f4 = coef[r + 4], f5 = coef[r + 5], f6 = coef[r + 6], f7 = coef[r + 7];
      if (f1 === 0 && f2 === 0 && f3 === 0 && f4 === 0 && f5 === 0 && f6 === 0 && f7 === 0) {
        if (f0 === 0) { _rowNZ[v] = 0; continue; }
        const d = f0 * C[0];
        for (let x = 0; x < 8; x++) t[r + x] = d;
        _rowNZ[v] = 1;
        continue;
      }
      _rowNZ[v] = 1;
      for (let x = 0; x < 8; x++) {
        t[r + x] = C[x] * f0 + C[8 + x] * f1 + C[16 + x] * f2 + C[24 + x] * f3 + C[32 + x] * f4 + C[40 + x] * f5 + C[48 + x] * f6 + C[56 + x] * f7;
      }
    }
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) out[y * 8 + x] = 0;
    }
    for (let v = 0; v < 8; v++) {
      if (!_rowNZ[v]) continue;
      const r = v * 8, c = v * 8;
      for (let y = 0; y < 8; y++) {
        const k = C[c + y], o = y * 8;
        out[o] += k * t[r]; out[o + 1] += k * t[r + 1]; out[o + 2] += k * t[r + 2]; out[o + 3] += k * t[r + 3];
        out[o + 4] += k * t[r + 4]; out[o + 5] += k * t[r + 5]; out[o + 6] += k * t[r + 6]; out[o + 7] += k * t[r + 7];
      }
    }
  }

  // Базисная функция (u, v) как блок 8×8 значений в диапазоне [−1, 1] (для показа)
  function basis(u, v) {
    const b = new Float32Array(64);
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        b[y * 8 + x] = Math.cos(((2 * x + 1) * u * Math.PI) / 16) * Math.cos(((2 * y + 1) * v * Math.PI) / 16);
      }
    }
    return b;
  }

  /* ---------- Качество → таблица квантования (формула IJG) ---------- */

  function qualityScale(q) {
    q = Math.max(1, Math.min(100, Math.round(q)));
    return q < 50 ? Math.floor(5000 / q) : 200 - 2 * q;
  }
  function scaleTable(base, q) {
    const s = qualityScale(q);
    const t = new Uint8Array(64);
    for (let i = 0; i < 64; i++) t[i] = Math.max(1, Math.min(255, Math.floor((base[i] * s + 50) / 100)));
    return t;
  }

  /* ---------- Цвет: RGB ↔ YCbCr (JFIF, BT.601 полный диапазон) ---------- */

  function rgbToYcc(r, g, b) {
    return [
      0.299 * r + 0.587 * g + 0.114 * b,
      128 - 0.168736 * r - 0.331264 * g + 0.5 * b,
      128 + 0.5 * r - 0.418688 * g - 0.081312 * b,
    ];
  }
  function yccToRgb(y, cb, cr) {
    return [
      y + 1.402 * (cr - 128),
      y - 0.344136 * (cb - 128) - 0.714136 * (cr - 128),
      y + 1.772 * (cb - 128),
    ];
  }

  // Целочисленные таблицы обратного преобразования — так же, как в libjpeg (jdcolor.c)
  const CR_R = new Int32Array(256), CB_B = new Int32Array(256), CR_G = new Int32Array(256), CB_G = new Int32Array(256);
  (() => {
    const FIX = (x) => Math.round(x * 65536), HALF = 1 << 15;
    for (let i = 0; i < 256; i++) {
      const x = i - 128;
      CR_R[i] = (FIX(1.402) * x + HALF) >> 16;
      CB_B[i] = (FIX(1.772) * x + HALF) >> 16;
      CR_G[i] = -FIX(0.714136286) * x;
      CB_G[i] = -FIX(0.344136286) * x + HALF;
    }
  })();

  /* ---------- Подготовка: всё, что не зависит от качества ---------- */

  // Полноразмерные плоскости Y, Cb, Cr исходной картинки (без дополнения)
  function analyze(img) {
    const W = img.w, H = img.h, src = img.data, n = W * H;
    const Y = new Float32Array(n), Cb = new Float32Array(n), Cr = new Float32Array(n);
    for (let o = 0, i = 0; o < n; o++, i += 4) {
      const r = src[i], g = src[i + 1], b = src[i + 2];
      Y[o] = 0.299 * r + 0.587 * g + 0.114 * b;
      Cb[o] = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      Cr[o] = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
    }
    return { w: W, h: H, Y, Cb, Cr };
  }

  function makeComp(id, name, h, v, pw, ph, tq) {
    const bw = pw / 8, bh = ph / 8;
    return { id, name, h, v, pw, ph, bw, bh, nb: bw * bh, tq, plane: new Float32Array(pw * ph), dct: new Float32Array(bw * bh * 64) };
  }

  // img: {w, h, data: RGBA}; A — результат analyze (можно передать готовый)
  function prepare(img, sub, A) {
    A = A || analyze(img);
    const S = SUBSAMPLING[sub] || SUBSAMPLING['420'];
    const W = A.w, H = A.h;
    const mcuW = 8 * S.h, mcuH = 8 * S.v;
    const PW = Math.ceil(W / mcuW) * mcuW, PH = Math.ceil(H / mcuH) * mcuH;
    const CW = PW / S.h, CH = PH / S.v;
    const comps = [
      makeComp(1, 'Y', S.h, S.v, PW, PH, 0),
      makeComp(2, 'Cb', 1, 1, CW, CH, 1),
      makeComp(3, 'Cr', 1, 1, CW, CH, 1),
    ];
    // Яркость: копия с продлением краёв до целых MCU
    const Yp = comps[0].plane;
    for (let y = 0; y < PH; y++) {
      const sy = y < H ? y : H - 1;
      for (let x = 0; x < PW; x++) Yp[y * PW + x] = A.Y[sy * W + (x < W ? x : W - 1)];
    }
    // Цвет: среднее по окну h×v (прореживание)
    const k = 1 / (S.h * S.v);
    for (const [ci, P] of [[1, A.Cb], [2, A.Cr]]) {
      const out = comps[ci].plane;
      for (let y = 0; y < CH; y++) {
        for (let x = 0; x < CW; x++) {
          let s = 0;
          for (let dy = 0; dy < S.v; dy++) {
            const sy = Math.min(H - 1, y * S.v + dy);
            for (let dx = 0; dx < S.h; dx++) s += P[sy * W + Math.min(W - 1, x * S.h + dx)];
          }
          out[y * CW + x] = s * k;
        }
      }
    }
    // ДКП всех блоков
    const blk = new Float64Array(64);
    for (const c of comps) {
      const plane = c.plane, pw = c.pw, dct = c.dct;
      for (let by = 0; by < c.bh; by++) {
        for (let bx = 0; bx < c.bw; bx++) {
          for (let y = 0; y < 8; y++) {
            const row = (by * 8 + y) * pw + bx * 8;
            for (let x = 0; x < 8; x++) blk[y * 8 + x] = plane[row + x] - 128;
          }
          fdct8x8(blk, dct, (by * c.bw + bx) * 64);
        }
      }
    }
    // Порядок блоков в потоке: MCU за MCU, внутри — Y, Cb, Cr
    let n = 0;
    for (const c of comps) n += c.nb;
    const oc = new Uint8Array(n), ob = new Int32Array(n);
    const mcuX = PW / mcuW, mcuY = PH / mcuH;
    let t = 0;
    for (let my = 0; my < mcuY; my++) {
      for (let mx = 0; mx < mcuX; mx++) {
        for (let ci = 0; ci < 3; ci++) {
          const c = comps[ci];
          for (let v = 0; v < c.v; v++) for (let h = 0; h < c.h; h++) { oc[t] = ci; ob[t] = (my * c.v + v) * c.bw + mx * c.h + h; t++; }
        }
      }
    }
    return { w: W, h: H, pw: PW, ph: PH, sub, S, mcuX, mcuY, A, comps, order: { ci: oc, bi: ob, n } };
  }

  /* ---------- Хаффман ---------- */

  function buildCodes(spec) {
    const code = new Uint16Array(256), size = new Uint8Array(256);
    let c = 0, k = 0;
    for (let len = 1; len <= 16; len++) {
      for (let i = 0; i < spec.bits[len - 1]; i++) {
        const s = spec.vals[k++];
        code[s] = c; size[s] = len; c++;
      }
      c <<= 1;
    }
    return { code, size, spec };
  }

  // Оптимальная таблица по частотам (процедура приложения K.2, как в libjpeg)
  function optimalSpec(freqIn) {
    const freq = new Float64Array(257);
    for (let i = 0; i < 256; i++) freq[i] = freqIn[i];
    freq[256] = 1; // зарезервированный код: ни один код не состоит из одних единиц
    const codesize = new Int32Array(257), others = new Int32Array(257).fill(-1);
    for (;;) {
      let c1 = -1, v = Infinity;
      for (let i = 0; i <= 256; i++) if (freq[i] && freq[i] <= v) { v = freq[i]; c1 = i; }
      let c2 = -1; v = Infinity;
      for (let i = 0; i <= 256; i++) if (freq[i] && freq[i] <= v && i !== c1) { v = freq[i]; c2 = i; }
      if (c2 < 0) break;
      freq[c1] += freq[c2]; freq[c2] = 0;
      codesize[c1]++;
      while (others[c1] >= 0) { c1 = others[c1]; codesize[c1]++; }
      others[c1] = c2;
      codesize[c2]++;
      while (others[c2] >= 0) { c2 = others[c2]; codesize[c2]++; }
    }
    const bits = new Int32Array(40);
    for (let i = 0; i <= 256; i++) if (codesize[i]) bits[codesize[i]]++;
    for (let i = 32; i > 16; i--) {
      while (bits[i] > 0) {
        let j = i - 2;
        while (bits[j] === 0) j--;
        bits[i] -= 2; bits[i - 1]++; bits[j + 1] += 2; bits[j]--;
      }
    }
    let i = 16;
    while (bits[i] === 0) i--;
    bits[i]--; // убираем зарезервированный код
    const vals = [];
    for (let len = 1; len <= 32; len++) for (let s = 0; s <= 255; s++) if (codesize[s] === len) vals.push(s);
    return { bits: Array.from(bits.subarray(1, 17)), vals };
  }

  const bitLen = (a) => { a = a < 0 ? -a : a; let n = 0; while (a) { n++; a >>= 1; } return n; };

  /* ---------- Выходной буфер ---------- */

  class ByteOut {
    constructor(cap) { this.buf = new Uint8Array(cap || 65536); this.pos = 0; }
    grow(n) {
      if (this.pos + n <= this.buf.length) return;
      let cap = this.buf.length * 2;
      while (cap < this.pos + n) cap *= 2;
      const nb = new Uint8Array(cap); nb.set(this.buf.subarray(0, this.pos)); this.buf = nb;
    }
    byte(b) { if (this.pos >= this.buf.length) this.grow(1); this.buf[this.pos++] = b; }
    word(w) { this.byte((w >> 8) & 255); this.byte(w & 255); }
    bytes(arr) { this.grow(arr.length); for (let i = 0; i < arr.length; i++) this.buf[this.pos++] = arr[i]; }
    result() { return this.buf.slice(0, this.pos); }
  }

  /* ---------- Кодер ---------- */

  function quantizeComp(c, qt) {
    const n = c.nb * 64, out = new Int16Array(n), d = c.dct;
    const rq = new Float64Array(64);
    for (let i = 0; i < 64; i++) rq[i] = 1 / qt[i];
    for (let o = 0; o < n; o += 64) {
      // DC лежит в [−1024, 1016] и так, AC у baseline не длиннее 10 бит
      const v0 = d[o] * rq[0];
      out[o] = v0 < 0 ? -((0.5 - v0) | 0) : (v0 + 0.5) | 0;
      for (let i = 1; i < 64; i++) {
        const v = d[o + i] * rq[i];
        let q = v < 0 ? -((0.5 - v) | 0) : (v + 0.5) | 0;
        if (q > 1023) q = 1023; else if (q < -1023) q = -1023;
        out[o + i] = q;
      }
    }
    return out;
  }

  // Частоты символов для четырёх таблиц (нужны для оптимальных кодов и статистики)
  function gatherFreq(P, quant) {
    const fDY = new Uint32Array(256), fAY = new Uint32Array(256), fDC = new Uint32Array(256), fAC = new Uint32Array(256);
    const { ci: oc, bi: ob, n } = P.order;
    const zz = ZZ;
    let p0 = 0, p1 = 0, p2 = 0, valueBits = 0, zeros = 0, eobs = 0;
    for (let t = 0; t < n; t++) {
      const ci = oc[t], q = quant[ci], o = ob[t] * 64;
      const dcF = ci === 0 ? fDY : fDC, acF = ci === 0 ? fAY : fAC;
      const dc = q[o];
      let diff;
      if (ci === 0) { diff = dc - p0; p0 = dc; } else if (ci === 1) { diff = dc - p1; p1 = dc; } else { diff = dc - p2; p2 = dc; }
      const cat = bitLen(diff); dcF[cat]++; valueBits += cat;
      let run = 0;
      for (let k = 1; k < 64; k++) {
        const v = q[o + zz[k]];
        if (v === 0) { run++; zeros++; continue; }
        while (run > 15) { acF[0xf0]++; run -= 16; }
        const s = bitLen(v); acF[(run << 4) | s]++; valueBits += s; run = 0;
      }
      if (run > 0) { acF[0]++; eobs++; }
    }
    return { freq: { dcY: fDY, acY: fAY, dcC: fDC, acC: fAC }, valueBits, zeros, coefs: n * 63, eobs };
  }

  // Энтропийное кодирование скана. out — ByteOut или null (только посчитать байты).
  // rec — {bits: [Uint16Array×3], at: [Uint32Array×3]}: сколько бит занял каждый блок и где он начался.
  function writeScan(P, quant, T, out, rec) {
    const { ci: oc, bi: ob, n } = P.order;
    const zz = ZZ;
    let acc = 0, nb = 0, total = 0, stuffed = 0;
    let buf = out ? out.buf : null, pos = out ? out.pos : 0;
    const start = pos;
    const put = (val, len) => {
      acc = (acc << len) | (val & ((1 << len) - 1));
      nb += len; total += len;
      while (nb >= 8) {
        nb -= 8;
        const b = (acc >>> nb) & 255;
        if (buf) { buf[pos++] = b; if (b === 255) { buf[pos++] = 0; stuffed++; } } else { pos++; if (b === 255) { pos++; stuffed++; } }
      }
      acc &= (1 << nb) - 1;
    };
    const pred = [0, 0, 0];
    for (let t = 0; t < n; t++) {
      if (buf && pos + 600 > buf.length) { out.pos = pos; out.grow(65536); buf = out.buf; }
      const ci = oc[t], b = ob[t], q = quant[ci], o = b * 64;
      const dcT = ci === 0 ? T.dcY : T.dcC, acT = ci === 0 ? T.acY : T.acC;
      const dcCode = dcT.code, dcSize = dcT.size, acCode = acT.code, acSize = acT.size;
      const t0 = total;
      if (rec) rec.at[ci][b] = pos;
      const diff = q[o] - pred[ci]; pred[ci] = q[o];
      const cat = bitLen(diff);
      put(dcCode[cat], dcSize[cat]);
      if (cat) put(diff < 0 ? diff - 1 : diff, cat);
      let run = 0;
      for (let k = 1; k < 64; k++) {
        const v = q[o + zz[k]];
        if (v === 0) { run++; continue; }
        while (run > 15) { put(acCode[0xf0], acSize[0xf0]); run -= 16; }
        const s = bitLen(v), sym = (run << 4) | s;
        put(acCode[sym], acSize[sym]);
        put(v < 0 ? v - 1 : v, s);
        run = 0;
      }
      if (run > 0) put(acCode[0], acSize[0]);
      if (rec) rec.bits[ci][b] = total - t0;
    }
    if (nb > 0) put((1 << (8 - nb)) - 1, 8 - nb); // добиваем последний байт единицами
    if (out) out.pos = pos;
    return { bytes: pos - start, bits: total, stuffed };
  }

  const JFIF_APP0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00];
  const COMMENT = 'Anatomy of JPEG / 040 - hand-written encoder';

  function dhtLen(sp) { let n = 4; for (const k of ['dcY', 'acY', 'dcC', 'acC']) n += 17 + sp[k].vals.length; return n; }
  const buildAll = (sp) => ({ dcY: buildCodes(sp.dcY), acY: buildCodes(sp.acY), dcC: buildCodes(sp.dcC), acC: buildCodes(sp.acC) });

  // Полный проход: квантование, энтропийное кодирование, сборка файла.
  // opts: {quality, optimize, measureAlt} — measureAlt: точно посчитать размер и со вторым вариантом таблиц
  function encode(P, opts) {
    const quality = Math.max(1, Math.min(100, Math.round(opts.quality)));
    const qtY = scaleTable(STD_Q_LUMA, quality), qtC = scaleTable(STD_Q_CHROMA, quality);
    const quant = [quantizeComp(P.comps[0], qtY), quantizeComp(P.comps[1], qtC), quantizeComp(P.comps[2], qtC)];
    const stats = gatherFreq(P, quant);

    const std = STD_HUFF;
    let opt = null;
    if (opts.optimize || opts.measureAlt) {
      opt = {
        dcY: optimalSpec(stats.freq.dcY), acY: optimalSpec(stats.freq.acY),
        dcC: optimalSpec(stats.freq.dcC), acC: optimalSpec(stats.freq.acC),
      };
    }
    const specs = opts.optimize ? opt : std;
    const T = buildAll(specs);

    const out = new ByteOut(Math.max(65536, P.w * P.h));
    const segs = [];
    const seg = (kind, label, fn) => { const s = out.pos; fn(); segs.push({ kind, label, start: s, end: out.pos }); };

    seg('soi', 'SOI · начало файла', () => out.bytes([0xff, 0xd8]));
    seg('app', 'APP0 · метка JFIF', () => out.bytes(JFIF_APP0));
    seg('com', 'COM · комментарий', () => {
      out.bytes([0xff, 0xfe]); out.word(COMMENT.length + 2);
      for (let i = 0; i < COMMENT.length; i++) out.byte(COMMENT.charCodeAt(i));
    });
    seg('dqt', 'DQT · таблицы квантования', () => {
      out.bytes([0xff, 0xdb]); out.word(2 + 65 * 2);
      out.byte(0x00); for (let k = 0; k < 64; k++) out.byte(qtY[ZZ[k]]);
      out.byte(0x01); for (let k = 0; k < 64; k++) out.byte(qtC[ZZ[k]]);
    });
    seg('sof', 'SOF0 · размер и каналы', () => {
      out.bytes([0xff, 0xc0]); out.word(8 + 3 * 3);
      out.byte(8); out.word(P.h); out.word(P.w); out.byte(3);
      for (const c of P.comps) { out.byte(c.id); out.byte((c.h << 4) | c.v); out.byte(c.tq); }
    });
    seg('dht', 'DHT · таблицы Хаффмана', () => {
      const list = [[0x00, specs.dcY], [0x10, specs.acY], [0x01, specs.dcC], [0x11, specs.acC]];
      out.bytes([0xff, 0xc4]); out.word(dhtLen(specs) - 2);
      for (const [tc, sp] of list) { out.byte(tc); out.bytes(sp.bits); out.bytes(sp.vals); }
    });
    seg('sos', 'SOS · начало скана', () => {
      out.bytes([0xff, 0xda]); out.word(6 + 2 * 3); out.byte(3);
      out.bytes([1, 0x00, 2, 0x11, 3, 0x11]);
      out.bytes([0, 63, 0]);
    });

    const scanStart = out.pos;
    const rec = { bits: P.comps.map((c) => new Uint16Array(c.nb)), at: P.comps.map((c) => new Uint32Array(c.nb)) };
    const scan = writeScan(P, quant, T, out, rec);
    const scanEnd = out.pos;
    segs.push({ kind: 'scan', label: 'Скан · сжатые данные', start: scanStart, end: scanEnd });
    seg('eoi', 'EOI · конец файла', () => out.bytes([0xff, 0xd9]));
    const bytes = out.result();

    const compBits = [0, 0, 0];
    for (let ci = 0; ci < 3; ci++) { const a = rec.bits[ci]; let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; compBits[ci] = s; }

    let sizeStd = bytes.length, sizeOpt = bytes.length;
    if (opts.measureAlt) {
      const altSpecs = opts.optimize ? std : opt;
      const alt = writeScan(P, quant, buildAll(altSpecs), null, null);
      const altSize = bytes.length - (scanEnd - scanStart) - dhtLen(specs) + dhtLen(altSpecs) + alt.bytes;
      if (opts.optimize) sizeStd = altSize; else sizeOpt = altSize;
    }
    return {
      quality, optimize: !!opts.optimize, P, qt: [qtY, qtC], quant, T, specs, stats,
      blockBits: rec.bits, blockAt: rec.at, compBits, stuffed: scan.stuffed, scanBits: scan.bits,
      bytes, segs, scanStart, scanEnd, headerBytes: bytes.length - (scanEnd - scanStart),
      sizeStd, sizeOpt: opts.optimize || opts.measureAlt ? sizeOpt : null,
    };
  }

  /* ---------- Декодер: читает файл честно, маркер за маркером ---------- */

  const LOOK = 9; // сколько бит смотрим вперёд в быстрой таблице
  function buildDecodeTable(bits, vals) {
    const maxcode = new Int32Array(18).fill(-1), valptr = new Int32Array(17), mincode = new Int32Array(17);
    const lut = new Int32Array(1 << LOOK);
    let code = 0, k = 0;
    for (let l = 1; l <= 16; l++) {
      const n = bits[l - 1];
      if (n) {
        valptr[l] = k; mincode[l] = code;
        for (let i = 0; i < n; i++) {
          if (l <= LOOK) {
            const c = code + i, sh = LOOK - l;
            for (let j = c << sh, e = (c + 1) << sh; j < e; j++) lut[j] = (l << 8) | vals[k + i] | 0x10000;
          }
        }
        code += n; k += n; maxcode[l] = code - 1;
      }
      code <<= 1;
    }
    return { maxcode, valptr, mincode, vals, lut };
  }

  function decode(bytes) {
    let p = 0;
    const u16 = () => { const v = (bytes[p] << 8) | bytes[p + 1]; p += 2; return v; };
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('Это не JPEG: нет маркера SOI');
    p = 2;
    const qts = [], dcTables = [], acTables = [];
    let frame = null;
    for (;;) {
      if (p >= bytes.length - 1) throw new Error('Файл оборвался');
      if (bytes[p] !== 0xff) { p++; continue; }
      const m = bytes[p + 1]; p += 2;
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) continue;
      if (m === 0xff) { p--; continue; }
      if (m === 0xd9) break;
      const len = u16(), end = p + len - 2;
      if (m === 0xdb) {
        while (p < end) {
          const pq = bytes[p] >> 4, tq = bytes[p] & 15; p++;
          const t = new Uint16Array(64);
          for (let k = 0; k < 64; k++) t[ZZ[k]] = pq ? u16() : bytes[p++];
          qts[tq] = t;
        }
      } else if (m === 0xc0 || m === 0xc1) {
        const prec = bytes[p++], h = u16(), w = u16(), n = bytes[p++];
        const comps = [];
        for (let i = 0; i < n; i++) { comps.push({ id: bytes[p], h: bytes[p + 1] >> 4, v: bytes[p + 1] & 15, tq: bytes[p + 2], bw: 0, bh: 0, nb: 0, pw: 0, ph: 0, coef: null, plane: null }); p += 3; }
        frame = { prec, w, h, comps, hmax: 1, vmax: 1, mcuX: 0, mcuY: 0, done: false };
      } else if (m >= 0xc2 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        throw new Error('Поддерживается только baseline JPEG');
      } else if (m === 0xc4) {
        while (p < end) {
          const tc = bytes[p] >> 4, th = bytes[p] & 15; p++;
          const bits = Array.from(bytes.subarray(p, p + 16)); p += 16;
          let n = 0; for (const b of bits) n += b;
          const vals = Array.from(bytes.subarray(p, p + n)); p += n;
          (tc === 0 ? dcTables : acTables)[th] = { bits, vals, dec: buildDecodeTable(bits, vals) };
        }
      } else if (m === 0xda) {
        const n = bytes[p++];
        const scanComps = [];
        for (let i = 0; i < n; i++) { scanComps.push({ id: bytes[p], td: bytes[p + 1] >> 4, ta: bytes[p + 1] & 15 }); p += 2; }
        p = end;
        if (!frame || n !== frame.comps.length) throw new Error('Поддерживается только baseline JPEG с одним сканом');
        p = decodeScan(bytes, p, frame, scanComps, dcTables, acTables);
        continue;
      }
      p = end;
    }
    if (!frame || !frame.done) throw new Error('В файле нет данных изображения');
    return reconstruct(frame, qts);
  }

  function decodeScan(bytes, p, frame, scanComps, dcTables, acTables) {
    const hmax = Math.max(...frame.comps.map((c) => c.h)), vmax = Math.max(...frame.comps.map((c) => c.v));
    const mcuX = Math.ceil(frame.w / (8 * hmax)), mcuY = Math.ceil(frame.h / (8 * vmax));
    for (const c of frame.comps) {
      c.bw = mcuX * c.h; c.bh = mcuY * c.v; c.nb = c.bw * c.bh;
      c.coef = new Int16Array(c.nb * 64);
    }
    Object.assign(frame, { hmax, vmax, mcuX, mcuY });
    const len = bytes.length, zz = ZZ;

    // Битовый буфер: подкачиваем байты, выбрасывая вставленные 00 после FF
    let buf = 0, cnt = 0, marker = false;
    const fill = () => {
      while (cnt <= 24) {
        let b = 0;
        if (!marker && p < len) {
          b = bytes[p];
          if (b === 0xff) {
            const nx = bytes[p + 1];
            if (nx === 0) p += 2; else { marker = true; b = 0; }
          } else p++;
        }
        buf = ((buf << 8) | b) >>> 0; cnt += 8;
      }
    };
    const take = (n) => { const v = (buf >>> (cnt - n)) & ((1 << n) - 1); cnt -= n; buf &= cnt === 32 ? 0xffffffff : (1 << cnt) - 1; return v; };
    const decodeSym = (t) => {
      if (cnt < 16) fill();
      const e = t.lut[(buf >>> (cnt - LOOK)) & ((1 << LOOK) - 1)];
      if (e) { take((e >> 8) & 255); return e & 255; }
      const code16 = (buf >>> (cnt - 16)) & 0xffff;
      for (let l = LOOK + 1; l <= 16; l++) {
        const c = code16 >>> (16 - l);
        if (c <= t.maxcode[l]) { take(l); return t.vals[t.valptr[l] + c - t.mincode[l]]; }
      }
      throw new Error('Испорченный код Хаффмана');
    };
    const receiveExtend = (s) => {
      if (cnt < s) fill();
      const v = take(s);
      return v < 1 << (s - 1) ? v - (1 << s) + 1 : v;
    };

    const sc = scanComps.map((s) => ({ comp: frame.comps.find((c) => c.id === s.id), dc: dcTables[s.td].dec, ac: acTables[s.ta].dec, pred: 0 }));
    for (let my = 0; my < mcuY; my++) {
      for (let mx = 0; mx < mcuX; mx++) {
        for (let si = 0; si < sc.length; si++) {
          const s = sc[si], c = s.comp, coef = c.coef, dcT = s.dc, acT = s.ac;
          for (let v = 0; v < c.v; v++) {
            for (let h = 0; h < c.h; h++) {
              const o = ((my * c.v + v) * c.bw + mx * c.h + h) * 64;
              const t = decodeSym(dcT);
              s.pred += t ? receiveExtend(t) : 0;
              coef[o] = s.pred;
              for (let k = 1; k < 64;) {
                const rs = decodeSym(acT), r = rs >> 4, sz = rs & 15;
                if (sz === 0) { if (r === 15) { k += 16; continue; } break; }
                k += r;
                if (k > 63) break;
                coef[o + zz[k]] = receiveExtend(sz);
                k++;
              }
            }
          }
        }
      }
    }
    frame.done = true;
    // ищем следующий маркер
    while (p < len - 1 && !(bytes[p] === 0xff && bytes[p + 1] !== 0 && !(bytes[p + 1] >= 0xd0 && bytes[p + 1] <= 0xd7))) p++;
    return p;
  }

  // Деквантование, обратное ДКП, растяжение цвета, YCbCr → RGB
  function reconstruct(frame, qts) {
    const blockF = new Float64Array(64), px = new Float64Array(64);
    for (const c of frame.comps) {
      const qt = qts[c.tq], coef = c.coef, bw = c.bw, bh = c.bh;
      const pw = bw * 8, ph = bh * 8;
      c.pw = pw; c.ph = ph;
      const plane = new Uint8ClampedArray(pw * ph);
      const q0 = qt[0] / 8;
      for (let by = 0; by < bh; by++) {
        for (let bx = 0; bx < bw; bx++) {
          const o = (by * bw + bx) * 64;
          let ac = false;
          for (let i = 1; i < 64; i++) if (coef[o + i] !== 0) { ac = true; break; }
          const base = by * 8 * pw + bx * 8;
          if (!ac) {
            const v = Math.round(coef[o] * q0 + 128);
            for (let y = 0; y < 8; y++) plane.fill(v, base + y * pw, base + y * pw + 8);
            continue;
          }
          for (let i = 0; i < 64; i++) blockF[i] = coef[o + i] * qt[i];
          idct8x8(blockF, px);
          for (let y = 0; y < 8; y++) {
            const row = base + y * pw, r = y * 8;
            for (let x = 0; x < 8; x++) plane[row + x] = px[r + x] + 128.5 | 0;
          }
        }
      }
      c.plane = plane;
    }
    const W = frame.w, H = frame.h;
    const rgba = new Uint8ClampedArray(W * H * 4);
    if (frame.comps.length === 1) {
      const c = frame.comps[0];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const v = c.plane[y * c.pw + x], i = (y * W + x) * 4;
        rgba[i] = rgba[i + 1] = rgba[i + 2] = v; rgba[i + 3] = 255;
      }
      return { w: W, h: H, rgba, frame, planes: [c.plane] };
    }
    // Растягиваем цветовые каналы до размера яркости «треугольным» фильтром, как libjpeg
    const PW = frame.comps[0].pw, PH = frame.comps[0].ph;
    const up = frame.comps.map((c) => upsample(c, frame.hmax / c.h, frame.vmax / c.v, PW, PH));
    const Yp = up[0], Cbp = up[1], Crp = up[2];
    for (let y = 0; y < H; y++) {
      let s = y * PW, i = y * W * 4;
      for (let x = 0; x < W; x++, s++, i += 4) {
        const Yv = Yp[s], cb = Cbp[s], cr = Crp[s];
        rgba[i] = Yv + CR_R[cr];
        rgba[i + 1] = Yv + ((CB_G[cb] + CR_G[cr]) >> 16);
        rgba[i + 2] = Yv + CB_B[cb];
        rgba[i + 3] = 255;
      }
    }
    return { w: W, h: H, rgba, frame, planes: up };
  }

  // Растяжение плоскости: fh, fv ∈ {1, 2}. «Треугольная» интерполяция libjpeg (jdsample.c).
  function upsample(c, fh, fv, PW, PH) {
    const inW = c.pw, inH = c.ph, src = c.plane;
    if (fh === 1 && fv === 1) return src;
    const out = new Uint8ClampedArray(PW * PH);
    if (fh === 2 && fv === 1) {
      for (let y = 0; y < inH && y < PH; y++) {
        const ri = y * inW, ro = y * PW;
        out[ro] = src[ri];
        out[ro + 1] = (src[ri] * 3 + src[ri + 1] + 2) >> 2;
        for (let x = 1; x < inW - 1; x++) {
          const iv = src[ri + x] * 3;
          out[ro + 2 * x] = (iv + src[ri + x - 1] + 1) >> 2;
          out[ro + 2 * x + 1] = (iv + src[ri + x + 1] + 2) >> 2;
        }
        const l = inW - 1;
        out[ro + 2 * l] = (src[ri + l] * 3 + src[ri + l - 1] + 1) >> 2;
        out[ro + 2 * l + 1] = src[ri + l];
      }
      return out;
    }
    if (fh === 2 && fv === 2) {
      for (let y = 0; y < inH; y++) {
        for (let half = 0; half < 2; half++) {
          const oy = 2 * y + half;
          if (oy >= PH) continue;
          const ny = half === 0 ? Math.max(0, y - 1) : Math.min(inH - 1, y + 1);
          const r0 = y * inW, r1 = ny * inW, ro = oy * PW;
          let thiscol = src[r0] * 3 + src[r1];
          let nextcol = src[r0 + 1] * 3 + src[r1 + 1];
          out[ro] = (thiscol * 4 + 8) >> 4;
          out[ro + 1] = (thiscol * 3 + nextcol + 7) >> 4;
          let lastcol = thiscol; thiscol = nextcol;
          for (let x = 1; x < inW - 1; x++) {
            nextcol = src[r0 + x + 1] * 3 + src[r1 + x + 1];
            out[ro + 2 * x] = (thiscol * 3 + lastcol + 8) >> 4;
            out[ro + 2 * x + 1] = (thiscol * 3 + nextcol + 7) >> 4;
            lastcol = thiscol; thiscol = nextcol;
          }
          const l = inW - 1;
          out[ro + 2 * l] = (thiscol * 3 + lastcol + 8) >> 4;
          out[ro + 2 * l + 1] = (thiscol * 4 + 7) >> 4;
        }
      }
      return out;
    }
    // прочие схемы — повторение отсчётов
    for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) out[y * PW + x] = src[Math.min(inH - 1, (y / fv) | 0) * inW + Math.min(inW - 1, (x / fh) | 0)];
    return out;
  }

  /* ---------- Метрики ---------- */

  function psnr(a, b) {
    let se = 0, n = 0;
    for (let i = 0; i < a.length; i += 4) {
      const d0 = a[i] - b[i], d1 = a[i + 1] - b[i + 1], d2 = a[i + 2] - b[i + 2];
      se += d0 * d0 + d1 * d1 + d2 * d2; n += 3;
    }
    const mse = se / n;
    return mse === 0 ? Infinity : 10 * Math.log10((255 * 255) / mse);
  }
  function maxDiff(a, b) {
    let m = 0;
    for (let i = 0; i < a.length; i++) { if ((i & 3) === 3) continue; const d = Math.abs(a[i] - b[i]); if (d > m) m = d; }
    return m;
  }

  // Разбор чужого JPEG: только заголовки (для «рентгена» файла)
  function inspect(bytes) {
    const info = { qts: [], sof: null, huff: 0, progressive: false, markers: [] };
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
    let p = 2;
    while (p < bytes.length - 3) {
      if (bytes[p] !== 0xff) { p++; continue; }
      const m = bytes[p + 1];
      if (m === 0xff) { p++; continue; }
      if (m === 0xd9 || m === 0xda) { info.markers.push(m); break; }
      const len = (bytes[p + 2] << 8) | bytes[p + 3];
      const s = p + 4, e = p + 2 + len;
      info.markers.push(m);
      if (m === 0xdb) {
        let q = s;
        while (q < e) {
          const pq = bytes[q] >> 4, tq = bytes[q] & 15; q++;
          const t = new Uint16Array(64);
          for (let k = 0; k < 64; k++) { t[ZZ[k]] = pq ? (bytes[q] << 8) | bytes[q + 1] : bytes[q]; q += pq ? 2 : 1; }
          info.qts[tq] = t;
        }
      } else if (m >= 0xc0 && m <= 0xc3) {
        info.progressive = m === 0xc2;
        const n = bytes[s + 5], comps = [];
        for (let i = 0; i < n; i++) comps.push({ id: bytes[s + 6 + i * 3], h: bytes[s + 7 + i * 3] >> 4, v: bytes[s + 7 + i * 3] & 15 });
        info.sof = { h: (bytes[s + 1] << 8) | bytes[s + 2], w: (bytes[s + 3] << 8) | bytes[s + 4], comps };
      } else if (m === 0xc4) {
        info.huff++;
      }
      p = e;
    }
    return info;
  }

  // Оценка качества по таблице яркости: подбираем q, при котором таблица IJG ближе всего
  function estimateQuality(qt) {
    if (!qt) return null;
    let best = null, bestErr = Infinity;
    for (let q = 1; q <= 100; q++) {
      const t = scaleTable(STD_Q_LUMA, q);
      let err = 0;
      for (let i = 0; i < 64; i++) err += Math.abs(t[i] - qt[i]);
      if (err < bestErr) { bestErr = err; best = q; }
    }
    return { quality: best, exact: bestErr === 0, err: bestErr / 64 };
  }

  const JPEG = {
    STD_Q_LUMA, STD_Q_CHROMA, STD_HUFF, ZZ, UNZZ, SUBSAMPLING, COS,
    fdct8x8, idct8x8, basis, qualityScale, scaleTable, rgbToYcc, yccToRgb,
    analyze, prepare, encode, decode, buildCodes, optimalSpec, bitLen, psnr, maxDiff, inspect, estimateQuality,
  };
  root.JPEG = JPEG;
  if (typeof module !== 'undefined' && module.exports) module.exports = JPEG;
})(typeof window !== 'undefined' ? window : globalThis);
