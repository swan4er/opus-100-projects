'use strict';
/* ==========================================================================
   «Девочка и ветер» · lib.js
   Общие инструменты фильма: математика, шум, цвет, ключевые кадры,
   «пружина» для захлёста и кисти, из которых вырезаются силуэты.

   Соглашение о кистях. Сплошная фигура обходится по часовой стрелке
   (в экранных координатах, ось y вниз), прорезь — против часовой.
   Тогда при заливке по правилу nonzero прорезь прозрачна, только если её
   не закрывает другая фигура того же пути — как у настоящей бумаги.
   ========================================================================== */

const TAU = Math.PI * 2;
const PI = Math.PI;
const DEG = Math.PI / 180;

const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const inv = (a, b, x) => clamp((x - a) / (b - a));
const sstep = (a, b, x) => { const t = inv(a, b, x); return t * t * (3 - 2 * t); };
/** Окно: плавно растёт на [a,b], держится, плавно спадает на [c,d]. */
const win = (a, b, c, d, x) => sstep(a, b, x) * (1 - sstep(c, d, x));
const wrap = (x, m) => ((x % m) + m) % m;

/* ---------- Easing ---------- */
const EASE = {
  lin: (u) => u,
  in: (u) => u * u,
  out: (u) => 1 - (1 - u) * (1 - u),
  io: (u) => 0.5 - 0.5 * Math.cos(PI * u),
  in3: (u) => u * u * u,
  out3: (u) => 1 - (1 - u) ** 3,
  io3: (u) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2),
  out5: (u) => 1 - (1 - u) ** 5,
  outBack: (u) => { const c = 1.7; const v = u - 1; return 1 + (c + 1) * v * v * v + c * v * v; },
  softBack: (u) => { const c = 0.9; const v = u - 1; return 1 + (c + 1) * v * v * v + c * v * v; },
  inBack: (u) => { const c = 1.5; return (c + 1) * u * u * u - c * u * u; },
  ioBack: (u) => {
    const c = 1.2 * 1.525;
    return u < 0.5
      ? ((2 * u) ** 2 * ((c + 1) * 2 * u - c)) / 2
      : ((2 * u - 2) ** 2 * ((c + 1) * (u * 2 - 2) + c) + 2) / 2;
  },
  outEl: (u) => (u <= 0 ? 0 : u >= 1 ? 1 : 2 ** (-9 * u) * Math.sin((u * 9 - 0.75) * (TAU / 3)) + 1),
  hold: (u) => (u < 1 ? 0 : 1),
};

/* ---------- Ключевые кадры ----------
   keys = [[t, v, 'ease'], ...]. Easing относится к отрезку, который ПРИХОДИТ в ключ. */
/** Индекс первого ключа с временем ≥ t (двоичный поиск). */
function keyIndex(keys, t) {
  let lo = 1, hi = keys.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (keys[m][0] < t) lo = m + 1; else hi = m; }
  return lo;
}
function key(keys, t) {
  const n = keys.length;
  if (t <= keys[0][0]) return keys[0][1];
  if (t >= keys[n - 1][0]) return keys[n - 1][1];
  const i = keyIndex(keys, t);
  const a = keys[i - 1], b = keys[i];
  const e = EASE[b[2] || 'io'];
  return a[1] + (b[1] - a[1]) * e((t - a[0]) / (b[0] - a[0]));
}

/** То же для объектов (поз, палитр): поля смешиваются поимённо. */
function keyObj(keys, t, mixFn) {
  const n = keys.length;
  if (t <= keys[0][0]) return keys[0][1];
  if (t >= keys[n - 1][0]) return keys[n - 1][1];
  const i = keyIndex(keys, t);
  const a = keys[i - 1], b = keys[i];
  const u = EASE[b[2] || 'io']((t - a[0]) / (b[0] - a[0]));
  return mixFn(a[1], b[1], u);
}

function mixNum(a, b, u) {
  const o = {};
  for (const k in a) o[k] = typeof a[k] === 'number' && typeof b[k] === 'number' ? a[k] + (b[k] - a[k]) * u : u < 0.5 ? a[k] : b[k];
  return o;
}

/* ---------- Детерминированный шум ---------- */
function hash(n) {
  n = (n | 0) ^ 0x2545f491;
  n = Math.imul(n ^ (n >>> 16), 0x21f0aaad);
  n = Math.imul(n ^ (n >>> 15), 0x735a2d97);
  return ((n ^ (n >>> 15)) >>> 0) / 4294967296;
}
const hash2 = (a, b) => hash(Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263));
function noise(x) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return (hash(i) * (1 - u) + hash(i + 1) * u) * 2 - 1;
}
function fbm(x, oct = 3) {
  let s = 0, a = 1, n = 0, f = 1;
  for (let k = 0; k < oct; k++) { s += a * noise(x * f + k * 31.7); n += a; a *= 0.5; f *= 2.13; }
  return s / n;
}
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Таблица значений функции с линейной интерпольяцией: шумовые профили считаются один раз. */
function tabulate(fn, x0, x1, step) {
  const n = Math.ceil((x1 - x0) / step) + 1;
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = fn(x0 + i * step);
  return (x) => {
    const f = (x - x0) / step;
    if (f < 0 || f >= n - 1) return fn(x);
    const i = f | 0, r = f - i;
    return a[i] + (a[i + 1] - a[i]) * r;
  };
}

/**
 * Кеш функции времени на сетке шага dt с линейной интерполяцией.
 * Узлы переживают кадры, поэтому «следы» по недавнему прошлому (завитки,
 * захлёст) стоят одну-две новые точки за кадр. fn(t) → массив чисел или null.
 */
function gridCache(fn, dt, cap = 8000) {
  const m = new Map();
  const at = (i) => {
    let v = m.get(i);
    if (v === undefined) {
      v = fn(i * dt);
      if (m.size > cap) { let n = 0; for (const k of m.keys()) { m.delete(k); if (++n > cap / 4) break; } }
      m.set(i, v);
    }
    return v;
  };
  return (t) => {
    const f = t / dt, i = Math.floor(f), r = f - i;
    const a = at(i), b = at(i + 1);
    if (!a || !b) return r < 0.5 ? a || b : b || a;
    const o = new Array(a.length);
    for (let j = 0; j < a.length; j++) o[j] = a[j] + (b[j] - a[j]) * r;
    return o;
  };
}

/* ---------- Цвет ---------- */
function hex(s) { const n = parseInt(s.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function cmix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function cmul(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
function cdesat(c, k) { const l = c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11; return cmix(c, [l, l, l], k); }
const c255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
function rgba(c, a = 1) { return 'rgba(' + c255(c[0]) + ',' + c255(c[1]) + ',' + c255(c[2]) + ',' + (+a).toFixed(3) + ')'; }

/* ---------- Захлёст: отклик затухающей пружины на движение опоры ----------
   posFn(t) → [x, y]. Возвращает смещение груза относительно опоры.
   y(t) = −∫ h'(τ)·b'(t−τ) dτ, h — импульсный отклик осциллятора.
   Всё — функция времени, поэтому перемотка не ломает физику. */
function springLag(posFn, t, freq = 2, zeta = 0.35, span = 1.2, n = 22) {
  const w = TAU * freq, wd = w * Math.sqrt(1 - zeta * zeta), dt = span / n;
  let yx = 0, yy = 0, prev = posFn(t);
  for (let j = 0; j < n; j++) {
    const tau = (j + 1) * dt, tm = tau - dt / 2;
    const cur = posFn(t - tau);
    const hp = Math.exp(-zeta * w * tm) * (Math.cos(wd * tm) - (zeta * w / wd) * Math.sin(wd * tm));
    yx -= hp * (prev[0] - cur[0]);
    yy -= hp * (prev[1] - cur[1]);
    prev = cur;
  }
  return [yx, yy];
}
/** Скалярный вариант — для «пружинящей» травы и мельницы. */
function springLag1(fn, t, freq = 1.4, zeta = 0.3, span = 1.6, n = 24) {
  const w = TAU * freq, wd = w * Math.sqrt(1 - zeta * zeta), dt = span / n;
  let y = 0, prev = fn(t);
  for (let j = 0; j < n; j++) {
    const tau = (j + 1) * dt, tm = tau - dt / 2;
    const cur = fn(t - tau);
    y -= Math.exp(-zeta * w * tm) * (Math.cos(wd * tm) - (zeta * w / wd) * Math.sin(wd * tm)) * (prev - cur);
    prev = cur;
  }
  return y;
}

/* ---------- Кисти ---------- */

/** Плавная кривая через точки: промежуточные — контрольные, середины — опорные. */
function curveThrough(p, pts, move) {
  const n = pts.length;
  if (move) p.moveTo(pts[0][0], pts[0][1]); else p.lineTo(pts[0][0], pts[0][1]);
  if (n === 2) { p.lineTo(pts[1][0], pts[1][1]); return; }
  for (let i = 1; i < n - 1; i++) {
    const last = i === n - 2;
    const ex = last ? pts[n - 1][0] : (pts[i][0] + pts[i + 1][0]) / 2;
    const ey = last ? pts[n - 1][1] : (pts[i][1] + pts[i + 1][1]) / 2;
    p.quadraticCurveTo(pts[i][0], pts[i][1], ex, ey);
  }
}

/** Круг; hole = true — прорезь. */
function circle(p, x, y, r, hole) { p.moveTo(x + r, y); p.arc(x, y, r, 0, hole ? -TAU : TAU, !!hole); }

/** Эллипс; hole = true — прорезь. */
function oval(p, x, y, rx, ry, rot, hole) { p.moveTo(x + rx * Math.cos(rot), y + rx * Math.sin(rot)); p.ellipse(x, y, rx, ry, rot, 0, hole ? -TAU : TAU, !!hole); }

/** Конус из двух окружностей: сустав-капсула для рук, ног, веток. */
function capsule(p, ax, ay, ra, bx, by, rb) {
  const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy);
  if (d < 1e-3 || Math.abs(ra - rb) >= d) { if (ra >= rb) circle(p, ax, ay, ra); else circle(p, bx, by, rb); return; }
  const ang = Math.atan2(dy, dx);
  const phi = Math.acos((ra - rb) / d);
  p.moveTo(ax + ra * Math.cos(ang + phi), ay + ra * Math.sin(ang + phi));
  p.arc(ax, ay, ra, ang + phi, ang - phi + TAU, false);
  p.lineTo(bx + rb * Math.cos(ang - phi), by + rb * Math.sin(ang - phi));
  p.arc(bx, by, rb, ang - phi, ang + phi, false);
  p.closePath();
}

/** Лента вдоль ломаной pts с полуширинами ws (волосы, ветки, ленточки, завитки). */
function ribbon(p, pts, ws) {
  const n = pts.length;
  if (n < 2) return;
  const L = new Array(n), R = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = pts[i > 0 ? i - 1 : 0], b = pts[i < n - 1 ? i + 1 : n - 1];
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const d = Math.hypot(dx, dy) || 1;
    dx /= d; dy /= d;
    const w = ws[i];
    L[i] = [pts[i][0] - dy * w, pts[i][1] + dx * w];
    R[i] = [pts[i][0] + dy * w, pts[i][1] - dx * w];
  }
  curveThrough(p, R, true);
  L.reverse();
  curveThrough(p, L, false);
  p.closePath();
}

/** Линза от A до B с полушириной w: лист, лепесток, прорезь. */
function lens(p, ax, ay, bx, by, w, hole) {
  const mx = (ax + bx) / 2, my = (ay + by) / 2;
  let nx = -(by - ay), ny = bx - ax;
  const d = Math.hypot(nx, ny) || 1;
  nx = (nx / d) * 2 * w; ny = (ny / d) * 2 * w;
  const s = hole ? -1 : 1;
  p.moveTo(ax, ay);
  p.quadraticCurveTo(mx - s * nx, my - s * ny, bx, by);
  p.quadraticCurveTo(mx + s * nx, my + s * ny, ax, ay);
  p.closePath();
}

/** Травинка: основание (x,y), высота h, полуширина w, наклон ang (рад, от вертикали). */
function blade(p, x, y, h, w, ang) {
  const a1 = ang * 0.42;
  const s1 = Math.sin(a1), c1 = Math.cos(a1);
  const mx = x + s1 * h * 0.52, my = y - c1 * h * 0.52;
  const tx = x + Math.sin(ang) * h, ty = y - Math.cos(ang) * h;
  const px = c1 * w, py = s1 * w;
  p.moveTo(x - px, y - py);
  p.quadraticCurveTo(mx - px * 0.55, my - py * 0.55, tx, ty);
  p.quadraticCurveTo(mx + px * 0.55, my + py * 0.55, x + px, y + py);
  p.closePath();
}

/** Точки завитка: из (x,y) под углом a, длина len, витков turns, dir = ±1. */
function curlPts(x, y, a, len, turns, dir, n = 18) {
  const pts = [[x, y]];
  const ds = len / n;
  let ang = a;
  for (let i = 1; i <= n; i++) {
    const u = i / n;
    ang += (dir * turns * TAU * 2 * u) / n;
    const step = ds * (1 - 0.55 * u);
    x += Math.cos(ang) * step;
    y += Math.sin(ang) * step;
    pts.push([x, y]);
  }
  return pts;
}

/** Полуширины, сужающиеся от w0 к w1 по степени pow. */
function taper(n, w0, w1, pow = 1) {
  const ws = new Array(n);
  for (let i = 0; i < n; i++) ws[i] = w0 + (w1 - w0) * (i / (n - 1)) ** pow;
  return ws;
}

/** Поворот точки вокруг начала координат. */
function rot2(x, y, a) { const c = Math.cos(a), s = Math.sin(a); return [x * c - y * s, x * s + y * c]; }

/** Многоугольник с гарантированным обходом: сплошной или прорезь. */
function poly(p, pts, hole) {
  let A = 0;
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; A += a[0] * b[1] - b[0] * a[1]; }
  const arr = (hole ? A <= 0 : A >= 0) ? pts : pts.slice().reverse();
  p.moveTo(arr[0][0], arr[0][1]);
  for (let i = 1; i < arr.length; i++) p.lineTo(arr[i][0], arr[i][1]);
  p.closePath();
}

/** Повёрнутый прямоугольник вдоль оси от (ax,ay) под углом a: длина len, полуширины назад/вперёд. */
function barPts(ax, ay, a, r0, r1, w0, w1) {
  const c = Math.cos(a), s = Math.sin(a), nx = -s, ny = c;
  return [
    [ax + c * r0 - nx * w0, ay + s * r0 - ny * w0],
    [ax + c * r1 - nx * w0, ay + s * r1 - ny * w0],
    [ax + c * r1 + nx * w1, ay + s * r1 + ny * w1],
    [ax + c * r0 + nx * w1, ay + s * r0 + ny * w1],
  ];
}
