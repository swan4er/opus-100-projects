'use strict';
/* ==========================================================================
   Садовник на Луне · движок кадра
   Кадр 320×180 — чистая функция от времени. Сцена рисуется в G-буфер
   (альбедо, нормаль, свечение, глубина), затем освещается динамическим
   светом с тенями, получает свечение (bloom) и упорядоченным дизерингом
   сводится к палитре из 32 цветов. Файл не трогает DOM.
   ========================================================================== */

const W = 320, H = 180, NPX = W * H;

/* ---------- Мелкие утилиты ---------- */
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const hyp = (x, y) => Math.sqrt(x * x + y * y);
const hyp3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z);
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

function ihash(x, y, s) { // целочисленный хеш → [0, 1)
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul((s | 0) + 0x3c6ef372, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/* Шум значений на таблице 256×256: вместо хеша — два чтения из массива */
const NT = new Float32Array(256 * 256);
{ const R = mulberry(1234567); for (let i = 0; i < NT.length; i++) NT[i] = R(); }
function vnoise(x, y, s) {
  x += s * 17.31; y += s * 9.73;
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const x0 = xi & 255, x1 = (xi + 1) & 255, y0 = (yi & 255) << 8, y1 = ((yi + 1) & 255) << 8;
  const a = NT[y0 + x0], b = NT[y0 + x1], c = NT[y1 + x0], d = NT[y1 + x1];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, oct, s) {
  let sum = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) { sum += amp * vnoise(x * f, y * f, s + i * 17); norm += amp; amp *= 0.5; f *= 2.03; }
  return sum / norm;
}

/* ---------- Палитра: 32 цвета ----------
   холодные нейтрали ночи · тёплые нейтрали · огонь и солнце · вода и глаз · зелень · цветок */
const PALETTE = [
  '050409', '0c0b17', '16162c', '232543', '333a5e', '4a557d', '67749b', '8c99b8', 'b5c0d6', 'dfe5ef', 'fbfcff',
  '3e2c38', '6b5452', '9c826f', 'cdb391', 'f3e3c3',
  'ffe690', 'ffb445', 'f2702e', 'c43f2c', '7a2331',
  '102a5c', '1f5eae', '3ea3e6', '86e4ff',
  '1e4a36', '438c46', '9cce5c',
  '5c1646', 'b02a72', 'f0609a', 'f5cf9f',
];
const PN = PALETTE.length;
const PR = new Float32Array(PN), PG = new Float32Array(PN), PB = new Float32Array(PN);
const PAL32 = new Uint32Array(PN);
PALETTE.forEach((hex, i) => {
  const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
  PR[i] = r / 255; PG[i] = g / 255; PB[i] = b / 255;
  PAL32[i] = (255 << 24 | b << 16 | g << 8 | r) >>> 0;
});

/* ---------- Таблица дизеринга ----------
   Для каждой ячейки куба 32³ ищем пару цветов палитры и долю смешения
   (как у Yliluoma): цвет = A·(1−t) + B·t. Дальние пары штрафуются, чтобы
   не смешивать несовместимые оттенки. Доля квантуется до восьмых —
   рисунок остаётся «рукотворным», но градиенты не рвутся на полосы. */
const LQ = 32, LQ3 = LQ * LQ * LQ;
const LUT_A = new Uint8Array(LQ3), LUT_B = new Uint8Array(LQ3), LUT_T = new Uint8Array(LQ3);
const DWR = 0.9, DWG = 1.15, DWB = 0.7;   // перцептивные веса каналов
const DITHER_STEPS = 8;                   // доли по восьмым: мягче градиенты неба и пола
function buildLUT() {
  const K = 5;
  const idx = new Int32Array(K), dist = new Float64Array(K);
  for (let r = 0; r < LQ; r++) for (let g = 0; g < LQ; g++) for (let b = 0; b < LQ; b++) {
    const pr = (r + 0.5) / LQ, pg = (g + 0.5) / LQ, pb = (b + 0.5) / LQ;
    dist.fill(Infinity);
    for (let p = 0; p < PN; p++) {
      const dr = PR[p] - pr, dg = PG[p] - pg, db = PB[p] - pb;
      const d = DWR * dr * dr + DWG * dg * dg + DWB * db * db;
      if (d < dist[K - 1]) {
        let k = K - 1;
        while (k > 0 && dist[k - 1] > d) { dist[k] = dist[k - 1]; idx[k] = idx[k - 1]; k--; }
        dist[k] = d; idx[k] = p;
      }
    }
    let best = Infinity, ba = idx[0], bb = idx[0], bt = 0;
    for (let i = 0; i < K; i++) for (let j = i; j < K; j++) {
      const A = idx[i], B = idx[j];
      const dr = PR[B] - PR[A], dg = PG[B] - PG[A], db = PB[B] - PB[A];
      const den = DWR * dr * dr + DWG * dg * dg + DWB * db * db;
      let t = den > 0 ? (DWR * (pr - PR[A]) * dr + DWG * (pg - PG[A]) * dg + DWB * (pb - PB[A]) * db) / den : 0;
      t = Math.round(clamp(t, 0, 1) * DITHER_STEPS) / DITHER_STEPS;
      const mr = PR[A] + dr * t - pr, mg = PG[A] + dg * t - pg, mb = PB[A] + db * t - pb;
      const e = DWR * mr * mr + DWG * mg * mg + DWB * mb * mb + 1.1 * den * t * (1 - t);
      if (e < best) { best = e; ba = A; bb = B; bt = t; }
    }
    const li = (r * LQ + g) * LQ + b;
    LUT_A[li] = ba; LUT_B[li] = bb; LUT_T[li] = Math.round(bt * 16);
  }
}
const BAYER = new Uint8Array([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]);

/* ---------- G-буфер ---------- */
const F_LIT = 1, F_FLOOR = 2, F_RECV = 4, F_SKY = 8, F_REGO = 16;
const REGO_LS = 0.75; // доля закона Ломмеля — Зеелигера для реголита
const GB_D = new Float32Array(NPX);        // глубина (расстояние вдоль взгляда, м)
const GB_A = new Float32Array(NPX * 3);    // альбедо
const GB_N = new Float32Array(NPX * 3);    // нормаль (x вправо, y вверх, z к зрителю)
const GB_E = new Float32Array(NPX * 3);    // собственное свечение
const GB_S = new Float32Array(NPX);        // сила блика
const GB_F = new Uint8Array(NPX);          // флаги
const GB_O = new Uint8Array(NPX);          // номер объекта
const COL = new Float32Array(NPX * 3);     // освещённый цвет (HDR)
const COL2 = new Float32Array(NPX * 3);    // второй план для переходов
const IMG32 = new Uint32Array(NPX);        // итоговые пиксели RGBA

function gbClear() {
  GB_D.fill(Infinity); GB_A.fill(0); GB_E.fill(0); GB_S.fill(0); GB_F.fill(0); GB_O.fill(0);
}

/* ---------- Материалы ---------- */
function mat(r, g, b, o) {
  o = o || {};
  return {
    r, g, b,
    er: o.er || 0, eg: o.eg || 0, eb: o.eb || 0,
    spec: o.spec || 0,
    flags: o.flags === undefined ? F_LIT : o.flags,
    obj: o.obj || 0,
    tex: o.tex || null,
  };
}
function hexMat(hex, o) {
  return mat(parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255, o);
}

/* ---------- Камера ----------
   Мир: x вправо, y вверх, z вглубь. Камера — точка (x, y, z) с фокусным
   расстоянием f (в пикселях) и малыми поворотами yaw/pitch (сдвиг кадра).
   Параллакс получается сам: дальние слои смещаются меньше. */
const CAM = { x: 0, y: 1, z: -6, f: 320, yaw: 0, pitch: 0 };
function camSet(c) { CAM.x = c.x; CAM.y = c.y; CAM.z = c.z; CAM.f = c.f; CAM.yaw = c.yaw || 0; CAM.pitch = c.pitch || 0; }
const sxOf = (X, D) => W / 2 + CAM.f * ((X - CAM.x) / D - CAM.yaw);
const syOf = (Y, D) => H / 2 - CAM.f * ((Y - CAM.y) / D - CAM.pitch);
const skyX = (az) => W / 2 + CAM.f * (az - CAM.yaw);
const skyY = (el) => H / 2 - CAM.f * (el - CAM.pitch);
const horizonY = () => H / 2 + CAM.f * CAM.pitch;

/* Аффинные преобразования: [a, b, c, d, e, f] — sx = a·x + c·y + e, sy = b·x + d·y + f.
   Локальные координаты — метры, y вверх; экран — пиксели, y вниз. */
function tMul(A, B) {
  return [
    A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1],
    A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3],
    A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5],
  ];
}
function tTRS(tx, ty, rot, sx, sy) {
  const c = Math.cos(rot || 0), s = Math.sin(rot || 0);
  sx = sx === undefined ? 1 : sx; sy = sy === undefined ? sx : sy;
  return [c * sx, s * sx, -s * sy, c * sy, tx, ty];
}
function tPt(T, x, y) { return [T[0] * x + T[2] * y + T[4], T[1] * x + T[3] * y + T[5]]; }
/* Опора объекта в мире → преобразование «локальные метры → экран» и глубина. */
function placeAt(X, Y, Z) {
  const D = Z - CAM.z;
  if (D < 0.04) return null;
  const k = CAM.f / D;
  return { D, k, T: [k, 0, 0, -k, sxOf(X, D), syOf(Y, D)] };
}

/* ---------- Растеризация ----------
   Любая фигура задаётся функцией расстояния (SDF) в своих локальных
   координатах. Пиксель внутри, если SDF ≤ 0. Нормаль строится по
   градиенту SDF и «фаске»: край фигуры смотрит вбок, середина — на нас. */
let TG = null; // цель: null — G-буфер, иначе маска тени {w, h, data}

function writePx(i, z, m, nx, ny, nz) {
  GB_D[i] = z;
  const j = i * 3;
  GB_A[j] = m.r; GB_A[j + 1] = m.g; GB_A[j + 2] = m.b;
  GB_N[j] = nx; GB_N[j + 1] = ny; GB_N[j + 2] = nz;
  GB_E[j] = m.er; GB_E[j + 1] = m.eg; GB_E[j + 2] = m.eb;
  GB_S[i] = m.spec; GB_F[i] = m.flags; GB_O[i] = m.obj;
}

function fillSDF(T, sdf, u0, v0, u1, v1, z, m, bevel, nbx, nby) {
  const a = T[0], b = T[1], c = T[2], d = T[3], e = T[4], f = T[5];
  let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
  for (let k = 0; k < 4; k++) {
    const u = k & 1 ? u1 : u0, v = k & 2 ? v1 : v0;
    const sx = a * u + c * v + e, sy = b * u + d * v + f;
    if (sx < minx) minx = sx; if (sx > maxx) maxx = sx;
    if (sy < miny) miny = sy; if (sy > maxy) maxy = sy;
  }
  const tw = TG ? TG.w : W, th = TG ? TG.h : H;
  const x0 = Math.max(0, Math.floor(minx)), x1 = Math.min(tw - 1, Math.ceil(maxx));
  const y0 = Math.max(0, Math.floor(miny)), y1 = Math.min(th - 1, Math.ceil(maxy));
  if (x0 > x1 || y0 > y1) return;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-12) return;
  const ia = d / det, ib = -b / det, ic = -c / det, id = a / det;
  const ie = -(ia * e + ic * f), iff = -(ib * e + id * f);
  const hs = 0.35 / Math.sqrt(Math.abs(det)); // полпикселя в локальных единицах
  const bev = bevel || 0;
  nbx = nbx || 0; nby = nby || 0;
  const tex = m.tex;
  for (let py = y0; py <= y1; py++) {
    const syc = py + 0.5;
    for (let px = x0; px <= x1; px++) {
      const sxc = px + 0.5;
      const u = ia * sxc + ic * syc + ie, v = ib * sxc + id * syc + iff;
      const dd = sdf(u, v);
      if (dd > 0) continue;
      if (TG) { TG.data[py * TG.w + px] = 1; continue; }
      const i = py * W + px;
      if (z > GB_D[i]) continue;
      let nx = 0, ny = 0, nz = 1;
      if (bev > 0 && dd > -bev) {
        const gu = sdf(u + hs, v) - sdf(u - hs, v), gv = sdf(u, v + hs) - sdf(u, v - hs);
        let vx = a * gu + c * gv, vy = -(b * gu + d * gv);
        const L = hyp(vx, vy);
        if (L > 1e-12) {
          vx /= L; vy /= L;
          const t = 1 + dd / bev;
          nx = vx * t; ny = vy * t; nz = Math.sqrt(Math.max(0, 1 - t * t));
        }
      }
      if (nbx !== 0 || nby !== 0) {
        nx += nbx; ny += nby;
        const L = hyp3(nx, ny, nz); nx /= L; ny /= L; nz /= L;
      }
      writePx(i, z, m, nx, ny, nz);
      if (tex) tex(u, v, dd, i);
    }
  }
}

/* Готовые SDF (локальные метры) */
const sdCircle = (cx, cy, r) => (u, v) => hyp(u - cx, v - cy) - r;
const sdEllipse = (cx, cy, rx, ry) => (u, v) => {
  const x = (u - cx) / rx, y = (v - cy) / ry;
  return (hyp(x, y) - 1) * Math.min(rx, ry);
};
const sdBox = (cx, cy, hw, hh, r) => (u, v) => {
  const qx = Math.abs(u - cx) - hw + r, qy = Math.abs(v - cy) - hh + r;
  return hyp(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};
const sdSeg = (ax, ay, bx, by, ra, rb) => {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1e-12;
  rb = rb === undefined ? ra : rb;
  return (u, v) => {
    const h = clamp(((u - ax) * dx + (v - ay) * dy) / l2, 0, 1);
    return hyp(u - ax - dx * h, v - ay - dy * h) - (ra + (rb - ra) * h);
  };
};
function sdPoly(pts) { // pts: [x0, y0, x1, y1, ...] — SDF многоугольника (Инго Килез)
  const n = pts.length / 2;
  return (u, v) => {
    let d = Infinity, s = 1;
    for (let i = 0, j = n - 1; i < n; j = i, i++) {
      const xi = pts[i * 2], yi = pts[i * 2 + 1], xj = pts[j * 2], yj = pts[j * 2 + 1];
      const ex = xj - xi, ey = yj - yi, wx = u - xi, wy = v - yi;
      const h = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey || 1e-12), 0, 1);
      const bx = wx - ex * h, by = wy - ey * h;
      d = Math.min(d, bx * bx + by * by);
      const c1 = v >= yi, c2 = v < yj, c3 = ex * wy > ey * wx;
      if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
    }
    return s * Math.sqrt(d);
  };
}
function bboxOf(pts, pad) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]);
    y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1]);
  }
  pad = pad || 0;
  return [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
}

/* Удобные обёртки */
function fCircle(T, cx, cy, r, z, m, bevel, nbx, nby) {
  fillSDF(T, sdCircle(cx, cy, r), cx - r, cy - r, cx + r, cy + r, z, m, bevel === undefined ? r : bevel, nbx, nby);
}
function fEllipse(T, cx, cy, rx, ry, z, m, bevel, nbx, nby) {
  fillSDF(T, sdEllipse(cx, cy, rx, ry), cx - rx, cy - ry, cx + rx, cy + ry, z, m, bevel === undefined ? Math.min(rx, ry) : bevel, nbx, nby);
}
function fBox(T, cx, cy, hw, hh, r, z, m, bevel, nbx, nby) {
  fillSDF(T, sdBox(cx, cy, hw, hh, r), cx - hw, cy - hh, cx + hw, cy + hh, z, m, bevel === undefined ? r : bevel, nbx, nby);
}
function fSeg(T, ax, ay, bx, by, ra, rb, z, m, bevel) {
  rb = rb === undefined ? ra : rb;
  const r = Math.max(ra, rb);
  fillSDF(T, sdSeg(ax, ay, bx, by, ra, rb), Math.min(ax, bx) - r, Math.min(ay, by) - r, Math.max(ax, bx) + r, Math.max(ay, by) + r, z, m, bevel === undefined ? r : bevel);
}
function fPoly(T, pts, z, m, bevel, nbx, nby) {
  const bb = bboxOf(pts, 0.0001);
  fillSDF(T, sdPoly(pts), bb[0], bb[1], bb[2], bb[3], z, m, bevel || 0, nbx, nby);
}

/* Тонкая линия в один пиксель (Брезенхэм) — для антенн, стеблей, штрихов */
function putPx(x, y, z, m, nx, ny, nz) {
  x |= 0; y |= 0;
  if (x < 0 || y < 0 || x >= (TG ? TG.w : W) || y >= (TG ? TG.h : H)) return;
  if (TG) { TG.data[y * TG.w + x] = 1; return; }
  const i = y * W + x;
  if (z > GB_D[i]) return;
  writePx(i, z, m, nx === undefined ? 0 : nx, ny === undefined ? 0 : ny, nz === undefined ? 1 : nz);
}
function line1(x0, y0, x1, y1, z, m, nx, ny, nz) {
  x0 = Math.floor(x0); y0 = Math.floor(y0); x1 = Math.floor(x1); y1 = Math.floor(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, guard = 0;
  for (;;) {
    putPx(x0, y0, z, m, nx, ny, nz);
    if ((x0 === x1 && y0 === y1) || ++guard > 2000) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
/* Линия в локальных координатах: тоньше полутора пикселей — Брезенхэм, толще — капсула */
function lineL(T, ax, ay, bx, by, r, z, m, bevel) {
  const k = Math.sqrt(Math.abs(T[0] * T[3] - T[1] * T[2]));
  if (r * 2 * k < 1.5 && !TG) {
    const A = tPt(T, ax, ay), B = tPt(T, bx, by);
    const dx = B[0] - A[0], dy = B[1] - A[1], L = hyp(dx, dy) || 1;
    line1(A[0], A[1], B[0], B[1], z, m, -dy / L * 0.7, -dx / L * 0.7, 0.7);
  } else {
    fSeg(T, ax, ay, bx, by, Math.max(r, 0.5 / k), Math.max(r, 0.5 / k), z, m, bevel);
  }
}

/* ---------- Свет ----------
   Направленные источники (Земля, Солнце, далёкие метеоры) и точечные
   (метеоры рядом, вспышки, глаз робота, лёд). Координаты точечных —
   относительно камеры, в осях мира. */
const LIGHT = { amb: [0.03, 0.035, 0.06], ground: [0, 0, 0], dir: [], pt: [] };
function lightsReset(ar, ag, ab) { LIGHT.amb[0] = ar; LIGHT.amb[1] = ag; LIGHT.amb[2] = ab; LIGHT.ground[0] = LIGHT.ground[1] = LIGHT.ground[2] = 0; LIGHT.dir.length = 0; LIGHT.pt.length = 0; }
/* az, el — направление на источник (рад) от оси взгляда; в пространстве нормали z смотрит на зрителя */
function addDir(az, el, r, g, b, o) {
  o = o || {};
  const L = {
    x: Math.sin(az) * Math.cos(el), y: Math.sin(el), z: -Math.cos(az) * Math.cos(el),
    r, g, b, wrap: o.wrap || 0, shadow: !!o.shadow, term: o.term || null, spec: o.spec === undefined ? 1 : o.spec, sunMask: !!o.sunMask, noRego: !!o.noRego,
  };
  const hz = L.z + 1, hl = hyp3(L.x, L.y, hz) || 1;
  L.hx = L.x / hl; L.hy = L.y / hl; L.hz = hz / hl;
  LIGHT.dir.push(L);
  return L;
}
function addPoint(X, Y, Z, r, g, b, rad, o) {
  o = o || {};
  LIGHT.pt.push({
    x: X - CAM.x, y: Y - CAM.y, z: Z - CAM.z, r, g, b,
    r2: rad * rad, wrap: o.wrap === undefined ? 0.25 : o.wrap, shadow: !!o.shadow, spec: o.spec === undefined ? 1 : o.spec,
  });
}

/* ---------- Тени ----------
   Отбрасывающий тень объект — силуэт (маска) в плоскости билборда с
   толщиной по глубине. Для каждого принимающего пикселя (пол, цветок)
   луч к источнику проверяется на пересечение с коробкой объекта и маской. */
const OCC = [];
function makeOcc(w, h) { return { w, h, data: new Uint8Array(w * h), on: false }; }
/* Подготовить маску объекта: X, Y — опора в мире; ширина/высота охвата в метрах; толщина */
function occBegin(o, X, Y, Z, halfW, height, thick) {
  o.mx0 = X - halfW - CAM.x; o.my0 = Y - CAM.y; o.mpx = (halfW * 2) / o.w; o.mpy = height / o.h;
  o.x0 = o.mx0; o.x1 = o.mx0 + halfW * 2; o.y0 = o.my0; o.y1 = o.my0 + height;
  o.z0 = Z - CAM.z - thick; o.z1 = Z - CAM.z + thick;
  o.data.fill(0);
  o.T = [1 / o.mpx, 0, 0, -1 / o.mpy, halfW / o.mpx, o.h]; // локальные метры (опора в 0,0) → текстели
  o.on = true;
  TG = o;
  return o.T;
}
function occEnd(o) { TG = null; OCC.push(o); }

function inShadow(px, py, pz, dx, dy, dz, maxS) {
  for (let k = 0; k < OCC.length; k++) {
    const o = OCC[k];
    let t0 = 1e-4, t1 = maxS;
    // слэбы по трём осям
    if (Math.abs(dx) < 1e-9) { if (px < o.x0 || px > o.x1) continue; }
    else { let a = (o.x0 - px) / dx, b = (o.x1 - px) / dx; if (a > b) { const t = a; a = b; b = t; } if (a > t0) t0 = a; if (b < t1) t1 = b; if (t0 > t1) continue; }
    if (Math.abs(dy) < 1e-9) { if (py < o.y0 || py > o.y1) continue; }
    else { let a = (o.y0 - py) / dy, b = (o.y1 - py) / dy; if (a > b) { const t = a; a = b; b = t; } if (a > t0) t0 = a; if (b < t1) t1 = b; if (t0 > t1) continue; }
    if (Math.abs(dz) < 1e-9) { if (pz < o.z0 || pz > o.z1) continue; }
    else { let a = (o.z0 - pz) / dz, b = (o.z1 - pz) / dz; if (a > b) { const t = a; a = b; b = t; } if (a > t0) t0 = a; if (b < t1) t1 = b; if (t0 > t1) continue; }
    for (let s = 0; s < 4; s++) {
      const t = t0 + (t1 - t0) * (s + 0.5) / 4;
      const qx = px + dx * t, qy = py + dy * t;
      const u = ((qx - o.mx0) / o.mpx) | 0, v = (o.h - (qy - o.my0) / o.mpy) | 0;
      if (u >= 0 && v >= 0 && u < o.w && v < o.h && o.data[v * o.w + u]) return true;
    }
  }
  return false;
}

/* ---------- Освещение: G-буфер → COL ----------
   Три прохода: направленный свет по всему кадру, точечные источники —
   только в экранной рамке своей сферы влияния, затем сборка цвета. */
const LD = new Float32Array(NPX * 3);   // диффузный свет
const LSP = new Float32Array(NPX * 3);  // блики
const COLX = new Float32Array(W), ROWY = new Float32Array(H);
function shade() {
  const f = CAM.f, yaw = CAM.yaw, pitch = CAM.pitch, cx = CAM.x, cy = CAM.y;
  for (let px = 0; px < W; px++) COLX[px] = (px + 0.5 - W / 2) / f + yaw;
  for (let py = 0; py < H; py++) ROWY[py] = (H / 2 - py - 0.5) / f + pitch;
  const dirs = LIGHT.dir, pts = LIGHT.pt;
  const ar = LIGHT.amb[0], ag = LIGHT.amb[1], ab = LIGHT.amb[2];
  const gr = LIGHT.ground[0], gg = LIGHT.ground[1], gb = LIGHT.ground[2];
  const anyOcc = OCC.length > 0;
  const nd = dirs.length;
  // рамки, куда вообще может упасть тень каждого объекта от каждого источника
  for (let k = 0; k < nd; k++) {
    const L = dirs[k];
    L.sb = null;
    if (!L.shadow || !anyOcc || L.y < 0.02) continue;
    const boxes = [];
    for (const o of OCC) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let c = 0; c < 8; c++) {
        const X = c & 1 ? o.x1 : o.x0, Y = c & 2 ? o.y1 : o.y0, Z = c & 4 ? o.z1 : o.z0;
        const s = (Y + cy) / L.y;                       // до пола вдоль луча от источника
        for (let e = 0; e < 2; e++) {
          const px = e ? X - L.x * s : X, py = e ? -cy : Y, pz = e ? Z + L.z * s : Z;
          if (pz < 0.05) { x0 = 0; x1 = W; y0 = 0; y1 = H; continue; }
          const sx = W / 2 + f * (px / pz - yaw), sy = H / 2 - f * (py / pz - pitch);
          if (sx < x0) x0 = sx; if (sx > x1) x1 = sx; if (sy < y0) y0 = sy; if (sy > y1) y1 = sy;
        }
      }
      boxes.push(x0 - 2, y0 - 2, x1 + 2, y1 + 2);
    }
    L.sb = boxes;
  }
  /* 1. окружение и направленный свет */
  for (let py = 0; py < H; py++) {
    const ry = ROWY[py];
    for (let px = 0; px < W; px++) {
      const i = py * W + px, j = i * 3;
      const fl = GB_F[i];
      if (!(fl & F_LIT)) continue;
      const nx = GB_N[j], ny = GB_N[j + 1], nz = GB_N[j + 2];
      const up = 0.5 + 0.5 * ny, aw = 0.55 + 0.45 * up, gw = 1 - up;
      let lr = ar * aw + gr * gw, lg = ag * aw + gg * gw, lb = ab * aw + gb * gw;
      let sr = 0, sg = 0, sb = 0;
      const sp = GB_S[i];
      const recv = anyOcc && (fl & (F_FLOOR | F_RECV));
      const D = GB_D[i], Xc = COLX[px] * D, Yc = ry * D;
      // реголит: закон Ломмеля — Зеелигера (яркость почти не зависит от угла падения)
      let ndv = 1;
      const rego = fl & F_REGO;
      if (rego) { const vl = Math.sqrt(Xc * Xc + Yc * Yc + D * D) || 1; ndv = Math.max(0.02, (-nx * Xc - ny * Yc + nz * D) / vl); }
      for (let k = 0; k < nd; k++) {
        const L = dirs[k];
        let ndl = nx * L.x + ny * L.y + nz * L.z;
        if (L.wrap) ndl = (ndl + L.wrap) / (1 + L.wrap);
        if (ndl <= 0) continue;
        if (L.sunMask && GB_O[i] >= 250) continue;
        if (L.noRego && rego) continue;
        let vis = 1;
        if (L.term) {
          const wx = Xc + cx + (Yc + cy) * L.term.lift;
          vis = L.term.dir < 0 ? sstep(L.term.x + L.term.soft, L.term.x - L.term.soft, wx) : sstep(L.term.x - L.term.soft, L.term.x + L.term.soft, wx);
          if (vis <= 0) continue;
        }
        if (recv && L.sb) {
          const b = L.sb;
          let inBox = false;
          for (let q = 0; q < b.length; q += 4) if (px >= b[q] && px <= b[q + 2] && py >= b[q + 1] && py <= b[q + 3]) { inBox = true; break; }
          if (inBox && inShadow(Xc, Yc, D, L.x, L.y, -L.z, 60)) continue;
        }
        let q = ndl * vis;
        if (rego) q = lerp(ndl, 2 * ndl / (ndl + ndv), REGO_LS) * vis;
        lr += L.r * q; lg += L.g * q; lb += L.b * q;
        if (sp > 0 && L.spec) {
          const nh = nx * L.hx + ny * L.hy + nz * L.hz;
          if (nh > 0.7) { const s = sp * Math.pow(nh, 40) * vis * L.spec; sr += L.r * s; sg += L.g * s; sb += L.b * s; }
        }
      }
      LD[j] = lr; LD[j + 1] = lg; LD[j + 2] = lb;
      LSP[j] = sr; LSP[j + 1] = sg; LSP[j + 2] = sb;
    }
  }
  /* 2. точечные источники — в рамке сферы влияния */
  for (let k = 0; k < pts.length; k++) {
    const P = pts[k];
    const R = Math.sqrt(P.r2);
    let x0 = 0, x1 = W - 1, y0 = 0, y1 = H - 1;
    if (P.z - R > 0.05) {
      const rho = f * R / (P.z - R) * 1.15 + 2;
      const sx = W / 2 + f * (P.x / P.z - yaw), sy = H / 2 - f * (P.y / P.z - pitch);
      x0 = Math.max(0, Math.floor(sx - rho)); x1 = Math.min(W - 1, Math.ceil(sx + rho));
      y0 = Math.max(0, Math.floor(sy - rho)); y1 = Math.min(H - 1, Math.ceil(sy + rho));
      if (x0 > x1 || y0 > y1) continue;
    } else if (P.z + R < 0.05) continue;
    for (let py = y0; py <= y1; py++) {
      const ry = ROWY[py];
      for (let px = x0; px <= x1; px++) {
        const i = py * W + px;
        const fl = GB_F[i];
        if (!(fl & F_LIT)) continue;
        const D = GB_D[i];
        const dz = P.z - D;
        if (dz * dz >= P.r2) continue;
        const dx = P.x - COLX[px] * D, dy = P.y - ry * D;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= P.r2) continue;
        const j = i * 3;
        const d = Math.sqrt(d2) || 1e-6;
        const lx = dx / d, ly = dy / d, lz = -dz / d;
        const nx = GB_N[j], ny = GB_N[j + 1], nz = GB_N[j + 2];
        let ndl = nx * lx + ny * ly + nz * lz;
        ndl = (ndl + P.wrap) / (1 + P.wrap);
        if (ndl <= 0) continue;
        if (P.shadow && anyOcc && (fl & (F_FLOOR | F_RECV)) && inShadow(COLX[px] * D, ry * D, D, dx, dy, dz, 1)) continue;
        const q = 1 - d / Math.sqrt(P.r2), att = q * q * ndl;
        LD[j] += P.r * att; LD[j + 1] += P.g * att; LD[j + 2] += P.b * att;
        const sp = GB_S[i];
        if (sp > 0 && P.spec) {
          const hz = lz + 1, hl = Math.sqrt(lx * lx + ly * ly + hz * hz);
          const nh = (nx * lx + ny * ly + nz * hz) / hl;
          if (nh > 0.7) { const s = sp * Math.pow(nh, 40) * q * q * P.spec * 1.6; LSP[j] += P.r * s; LSP[j + 1] += P.g * s; LSP[j + 2] += P.b * s; }
        }
      }
    }
  }
  /* 3. сборка */
  for (let i = 0; i < NPX; i++) {
    const j = i * 3;
    if (!(GB_F[i] & F_LIT)) {
      COL[j] = GB_A[j] + GB_E[j]; COL[j + 1] = GB_A[j + 1] + GB_E[j + 1]; COL[j + 2] = GB_A[j + 2] + GB_E[j + 2];
    } else {
      COL[j] = GB_A[j] * LD[j] + LSP[j] + GB_E[j];
      COL[j + 1] = GB_A[j + 1] * LD[j + 1] + LSP[j + 1] + GB_E[j + 1];
      COL[j + 2] = GB_A[j + 2] * LD[j + 2] + LSP[j + 2] + GB_E[j + 2];
    }
  }
}

/* ---------- Свечение (bloom) ----------
   Яркое сжимаем вчетверо, размываем и возвращаем в кадр — после дизеринга
   ореол превращается в пиксельную «ауру». */
const BW = W >> 2, BH = H >> 2;
const BL1 = new Float32Array(BW * BH * 3), BL2 = new Float32Array(BW * BH * 3);
function blurH(src, dst, r) {
  const inv = 1 / (2 * r + 1);
  for (let y = 0; y < BH; y++) {
    const row = y * BW;
    for (let c = 0; c < 3; c++) {
      let s = 0;
      for (let p = -r; p <= r; p++) s += src[(row + clamp(p, 0, BW - 1)) * 3 + c];
      for (let x = 0; x < BW; x++) {
        dst[(row + x) * 3 + c] = s * inv;
        s += src[(row + Math.min(BW - 1, x + r + 1)) * 3 + c] - src[(row + Math.max(0, x - r)) * 3 + c];
      }
    }
  }
}
function blurV(src, dst, r) {
  const inv = 1 / (2 * r + 1);
  for (let x = 0; x < BW; x++) {
    for (let c = 0; c < 3; c++) {
      let s = 0;
      for (let p = -r; p <= r; p++) s += src[(clamp(p, 0, BH - 1) * BW + x) * 3 + c];
      for (let y = 0; y < BH; y++) {
        dst[(y * BW + x) * 3 + c] = s * inv;
        s += src[(Math.min(BH - 1, y + r + 1) * BW + x) * 3 + c] - src[(Math.max(0, y - r) * BW + x) * 3 + c];
      }
    }
  }
}
function bloom(buf, thr, strength) {
  if (strength <= 0) return;
  BL1.fill(0);
  for (let y = 0; y < H; y++) {
    const brow = (y >> 2) * BW;
    for (let x = 0; x < W; x++) {
      const j = (y * W + x) * 3;
      const r = buf[j], g = buf[j + 1], b = buf[j + 2];
      const l = r > g ? (r > b ? r : b) : (g > b ? g : b);
      if (l <= thr) continue;
      const s = (l - thr) / l * 0.0625, o = (brow + (x >> 2)) * 3;
      BL1[o] += r * s; BL1[o + 1] += g * s; BL1[o + 2] += b * s;
    }
  }
  blurH(BL1, BL2, 2); blurV(BL2, BL1, 2); blurH(BL1, BL2, 2); blurV(BL2, BL1, 2);
  for (let y = 0; y < H; y++) {
    const fy = clamp((y - 1.5) / 4, 0, BH - 1), y0 = fy | 0, y1 = Math.min(BH - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < W; x++) {
      const fx = clamp((x - 1.5) / 4, 0, BW - 1), x0 = fx | 0, x1 = Math.min(BW - 1, x0 + 1), tx = fx - x0;
      const a = (y0 * BW + x0) * 3, b = (y0 * BW + x1) * 3, c = (y1 * BW + x0) * 3, d = (y1 * BW + x1) * 3;
      const w0 = (1 - tx) * (1 - ty), w1 = tx * (1 - ty), w2 = (1 - tx) * ty, w3 = tx * ty;
      const j = (y * W + x) * 3;
      // слабый хвост ореола срезаем: в палитре он превращается в тёмную «грязь» вокруг огней
      const br = BL1[a] * w0 + BL1[b] * w1 + BL1[c] * w2 + BL1[d] * w3;
      const bg = BL1[a + 1] * w0 + BL1[b + 1] * w1 + BL1[c + 1] * w2 + BL1[d + 1] * w3;
      const bb = BL1[a + 2] * w0 + BL1[b + 2] * w1 + BL1[c + 2] * w2 + BL1[d + 2] * w3;
      const m = br > bg ? (br > bb ? br : bb) : (bg > bb ? bg : bb);
      if (m < 0.035) continue;
      const k = strength * (1 - 0.035 / m);
      buf[j] += br * k; buf[j + 1] += bg * k; buf[j + 2] += bb * k;
    }
  }
}

/* ---------- Сведение к палитре ---------- */
function quantize(buf, ox, oy) {
  ox = ox | 0; oy = oy | 0;
  for (let py = 0; py < H; py++) {
    const brow = ((py + oy) & 3) * 4;
    for (let px = 0; px < W; px++) {
      const i = py * W + px, j = i * 3;
      let r = buf[j], g = buf[j + 1], b = buf[j + 2];
      const mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
      if (mx > 1) { // пересвет уходит в белое, а не в грязь
        const k = Math.min(1, (mx - 1) * 0.6);
        r = r / mx + (1 - r / mx) * k; g = g / mx + (1 - g / mx) * k; b = b / mx + (1 - b / mx) * k;
      }
      const ri = r <= 0 ? 0 : r >= 1 ? LQ - 1 : (r * LQ) | 0;
      const gi = g <= 0 ? 0 : g >= 1 ? LQ - 1 : (g * LQ) | 0;
      const bi = b <= 0 ? 0 : b >= 1 ? LQ - 1 : (b * LQ) | 0;
      const li = (ri * LQ + gi) * LQ + bi;
      IMG32[i] = PAL32[LUT_T[li] > BAYER[brow + ((px + ox) & 3)] ? LUT_B[li] : LUT_A[li]];
    }
  }
}

/* ---------- Пиксельный шрифт 5×7 для титров ---------- */
const GLYPHS = {
  'С': ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  'А': ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  'Д': ['.###.', '.#.#.', '.#.#.', '.#.#.', '.#.#.', '#####', '#...#'],
  'О': ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  'В': ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  'Н': ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  'И': ['#...#', '#...#', '#..##', '#.#.#', '##..#', '#...#', '#...#'],
  'К': ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  'Л': ['..###', '.#..#', '.#..#', '.#..#', '.#..#', '.#..#', '#...#'],
  'У': ['#...#', '#...#', '#...#', '.####', '....#', '#...#', '.###.'],
  'Е': ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  'Ц': ['#..#.', '#..#.', '#..#.', '#..#.', '#..#.', '#####', '....#'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
};
function textWidth(str, sc) { return (str.length * 6 - 1) * sc; }
/* Титр прямо в HDR-кадр. alpha растворяется по матрице Байера — «пиксельный» наплыв. */
function drawText(buf, str, cx, y, sc, col, shadow, alpha) {
  const x0 = Math.round(cx - textWidth(str, sc) / 2);
  const a16 = alpha * 16;
  const put = (x, y2, c) => {
    if (x < 0 || y2 < 0 || x >= W || y2 >= H) return;
    if (a16 <= BAYER[(y2 & 3) * 4 + (x & 3)]) return;
    const j = (y2 * W + x) * 3; buf[j] = c[0]; buf[j + 1] = c[1]; buf[j + 2] = c[2];
  };
  for (let pass = 0; pass < 2; pass++) {
    for (let n = 0; n < str.length; n++) {
      const g = GLYPHS[str[n]] || GLYPHS[' '];
      for (let gy = 0; gy < 7; gy++) for (let gx = 0; gx < 5; gx++) {
        if (g[gy][gx] !== '#') continue;
        const bx = x0 + (n * 6 + gx) * sc, by = y + gy * sc;
        for (let yy = 0; yy < sc; yy++) for (let xx = 0; xx < sc; xx++) {
          if (pass === 0) { if (shadow) { put(bx + xx + 1, by + yy + 1, shadow); put(bx + xx + 1, by + yy, shadow); put(bx + xx, by + yy + 1, shadow); } }
          else {
            const k = (gy * sc + yy) / (7 * sc);
            put(bx + xx, by + yy, [col[0] * (1.05 - 0.25 * k), col[1] * (1.05 - 0.3 * k), col[2] * (1.05 - 0.45 * k)]);
          }
        }
      }
    }
  }
}
