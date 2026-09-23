'use strict';
/* ==========================================================================
   core.js — общие инструменты фильма: время и easing, ключи, шум, цвет.
   Всё детерминировано: кадр — чистая функция от времени t.
   ========================================================================== */

const TAU = Math.PI * 2;
const VW = 1600, VH = 900;            // виртуальный кадр 16:9 — все рисунки в этих единицах
const DURATION = 114;                 // длительность фильма, с

const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (k) => k * k * (3 - 2 * k);
const fract = (x) => x - Math.floor(x);

const Ease = {
  lin: (k) => k,
  in: (k) => k * k * k,
  out: (k) => 1 - (1 - k) ** 3,
  inOut: (k) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2),
  sine: (k) => 0.5 - 0.5 * Math.cos(Math.PI * k),
  quadOut: (k) => 1 - (1 - k) * (1 - k),
  quadIn: (k) => k * k,
  back: (k) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * (k - 1) ** 3 + c1 * (k - 1) ** 2; },
  hold: () => 0,
};

// 0 → 1 между моментами a и b (с easing)
function ramp(t, a, b, e = smooth) { return e(clamp((t - a) / (b - a))); }
// «окно»: 0 → 1 на [a, b], держится, 1 → 0 на [c, d]
function win(t, a, b, c, d) { return ramp(t, a, b) * (1 - ramp(t, c, d)); }

// Ключевые кадры: [[t, v, 'ease'], ...]; easing относится к отрезку от этого ключа к следующему.
// v — число или массив чисел (цвет, точка).
function track(list) {
  const ks = list.map((k) => ({ t: k[0], v: k[1], e: Ease[k[2] || 'sine'] }));
  return function (t) {
    if (t <= ks[0].t) return ks[0].v;
    for (let i = 0; i < ks.length - 1; i++) {
      const a = ks[i], b = ks[i + 1];
      if (t < b.t) {
        const k = a.e((t - a.t) / (b.t - a.t));
        if (typeof a.v === 'number') return a.v + (b.v - a.v) * k;
        return a.v.map((x, j) => x + (b.v[j] - x) * k);
      }
    }
    return ks[ks.length - 1].v;
  };
}

/* ---------- детерминированный шум ---------- */
function hash(n) {
  let x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}
const hash2 = (a, b) => hash(a * 157.31 + b * 971.17);
function vnoise(x) {                      // 1D value noise, [-1, 1]
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return (hash(i) + (hash(i + 1) - hash(i)) * u) * 2 - 1;
}
const fbm1 = (x) => vnoise(x) * 0.62 + vnoise(x * 2.13 + 7.1) * 0.27 + vnoise(x * 4.37 + 3.3) * 0.11;

function rng(seed) {                      // mulberry32
  let a = (seed * 2654435761) >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- цвет: массивы [r, g, b] в 0..255 ---------- */
function hex(s) {
  const n = parseInt(s.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const mixc = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const mulc = (a, b) => [a[0] * b[0] / 255, a[1] * b[1] / 255, a[2] * b[2] / 255];
const addc = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
function css(c, a = 1) {
  const r = clamp(c[0], 0, 255) | 0, g = clamp(c[1], 0, 255) | 0, b = clamp(c[2], 0, 255) | 0;
  if (!(a < 1)) return `rgb(${r},${g},${b})`;
  a = a > 0 ? a : 0;
  return `rgba(${r},${g},${b},${a.toFixed(3)})`;
}
const WHITE = [255, 255, 255], BLACK = [0, 0, 0];
const light = (c, k) => mixc(c, WHITE, k);
const dark = (c, k) => mixc(c, BLACK, k);

/* ---------- безопасные примитивы Canvas 2D (отрицательный радиус — исключение) ---------- */
function ell(ctx, x, y, rx, ry, rot = 0) {
  if (!(rx > 0.0001) || !(ry > 0.0001)) return;
  ctx.moveTo(x + rx * Math.cos(rot), y + rx * Math.sin(rot));
  ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
}
function circ(ctx, x, y, r) {
  if (!(r > 0.0001)) return;
  ctx.moveTo(x + r, y);
  ctx.arc(x, y, r, 0, TAU);
}
function radial(ctx, x, y, r0, r1, stops) {
  const g = ctx.createRadialGradient(x, y, Math.max(0, r0), x, y, Math.max(0.01, r1));
  for (const s of stops) g.addColorStop(clamp(s[0]), s[1]);
  return g;
}
function linear(ctx, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const s of stops) g.addColorStop(clamp(s[0]), s[1]);
  return g;
}

/* ---------- палитры сцен (окружение) ---------- */
// Каждая палитра — небо, свет, туман, земля, хвоя. Между палитрами переходим плавно.
const PAL_SRC = {
  winterDusk: {
    top: '#1c2a4c', mid: '#3e5b8a', hor: '#a9b9d2', glowC: '#dfe4ee', sun: '#f4efdc', fog: '#8196b8',
    light: '#c9d6ec', shadow: '#26324f', groundFar: '#93a6c4', groundNear: '#dde5f1', snowSh: '#8494b8',
    spruce: '#1d3a3c', trunk: '#3a3336', cloud: '#5d7098',
    sunX: 1250, sunE: 430, sunR: 22, glow: 0.45, fogDen: 0.028, moon: 1, amb: 0.55, cloudAmt: 0.55, stars: 0.5,
  },
  winterStorm: {
    top: '#2b3650', mid: '#56668a', hor: '#9aa8c0', glowC: '#c6cedd', sun: '#d8dce6', fog: '#8a98b4',
    light: '#b8c4da', shadow: '#2c3652', groundFar: '#96a3bd', groundNear: '#d3dbe8', snowSh: '#8591ae',
    spruce: '#23393e', trunk: '#3a3538', cloud: '#6e7b98',
    sunX: 1250, sunE: 430, sunR: 22, glow: 0.12, fogDen: 0.06, moon: 1, amb: 0.5, cloudAmt: 0.9, stars: 0,
  },
  winterNight: {
    top: '#141d36', mid: '#2c3e66', hor: '#6f84aa', glowC: '#c3cde2', sun: '#eef0e6', fog: '#5c6f96',
    light: '#a9bad8', shadow: '#1b2440', groundFar: '#6f82a6', groundNear: '#b9c6de', snowSh: '#63729a',
    spruce: '#172f33', trunk: '#2c2a30', cloud: '#40507a',
    sunX: 1250, sunE: 430, sunR: 22, glow: 0.35, fogDen: 0.04, moon: 1, amb: 0.45, cloudAmt: 0.5, stars: 0.8,
  },
  springMorning: {
    top: '#6f9fd0', mid: '#b3d0e3', hor: '#f3e7c6', glowC: '#fff4d6', sun: '#fff6dc', fog: '#d6e1cf',
    light: '#fff1d2', shadow: '#4f6a70', groundFar: '#a9bd86', groundNear: '#6f9a45', snowSh: '#9fb3c8',
    spruce: '#2d573d', trunk: '#4a4038', cloud: '#fbf6ea',
    sunX: 380, sunE: 330, sunR: 30, glow: 0.7, fogDen: 0.022, moon: 0, amb: 0.8, cloudAmt: 0.45, stars: 0,
  },
  summerDay: {
    top: '#3f7cbf', mid: '#8ab9dc', hor: '#f4dfae', glowC: '#fff0c8', sun: '#fff1c4', fog: '#cfd6b8',
    light: '#ffe8b8', shadow: '#3d5a4a', groundFar: '#b4b86c', groundNear: '#7b9136', snowSh: '#9fb3c8',
    spruce: '#24472c', trunk: '#4b3f33', cloud: '#fffaf0',
    sunX: 1260, sunE: 360, sunR: 34, glow: 0.75, fogDen: 0.018, moon: 0, amb: 0.85, cloudAmt: 0.75, stars: 0,
  },
  summerSunset: {
    top: '#34396a', mid: '#d0705a', hor: '#f7c46c', glowC: '#ffd79a', sun: '#ffe0a0', fog: '#de9a6c',
    light: '#ffb67c', shadow: '#4a3048', groundFar: '#b87a4a', groundNear: '#5e5a2a', snowSh: '#9fb3c8',
    spruce: '#27342a', trunk: '#3b2c2a', cloud: '#f09a78',
    sunX: 700, sunE: 40, sunR: 50, glow: 1.0, fogDen: 0.03, moon: 0, amb: 0.7, cloudAmt: 0.6, stars: 0,
  },
  autumnDay: {
    top: '#7b95b4', mid: '#c4cdd0', hor: '#f0dab0', glowC: '#fff0d0', sun: '#ffecc0', fog: '#d9c9a6',
    light: '#ffe2b8', shadow: '#5b4a52', groundFar: '#c5a66e', groundNear: '#a8742e', snowSh: '#9fb3c8',
    spruce: '#2c4834', trunk: '#4a3b30', cloud: '#f4ecdc',
    sunX: 420, sunE: 290, sunR: 30, glow: 0.45, fogDen: 0.026, moon: 0, amb: 0.75, cloudAmt: 0.5, stars: 0,
  },
  autumnStorm: {
    top: '#5f6b80', mid: '#9da6b1', hor: '#cfcbc0', glowC: '#e4e2dc', sun: '#e8e6dc', fog: '#a9aeb4',
    light: '#d8dbe0', shadow: '#454a5c', groundFar: '#9aa0a8', groundNear: '#8d8a80', snowSh: '#8591ae',
    spruce: '#2b3c3a', trunk: '#3e3a3a', cloud: '#b5bac2',
    sunX: 420, sunE: 290, sunR: 30, glow: 0.1, fogDen: 0.05, moon: 0, amb: 0.6, cloudAmt: 0.9, stars: 0,
  },
  winterDawn: {
    top: '#46558a', mid: '#c996ad', hor: '#f6c79c', glowC: '#ffd9b0', sun: '#ffe2b4', fog: '#cfa9b8',
    light: '#ffd6bc', shadow: '#4a4670', groundFar: '#c8a9bd', groundNear: '#f1e2e2', snowSh: '#9d95bf',
    spruce: '#2a3a44', trunk: '#3c3036', cloud: '#e8a6a6',
    sunX: 1060, sunE: 70, sunR: 34, glow: 0.9, fogDen: 0.03, moon: 0, amb: 0.7, cloudAmt: 0.55, stars: 0,
  },
  winterMorning: {
    top: '#5f86c2', mid: '#b9c9e2', hor: '#f7e1c2', glowC: '#fff0d8', sun: '#fff3dc', fog: '#c9d0e0',
    light: '#fff0dc', shadow: '#48587e', groundFar: '#c3cde0', groundNear: '#f4f1ee', snowSh: '#9fa8cc',
    spruce: '#26403e', trunk: '#3a3336', cloud: '#f2e6e2',
    sunX: 1060, sunE: 200, sunR: 32, glow: 0.8, fogDen: 0.024, moon: 0, amb: 0.8, cloudAmt: 0.4, stars: 0,
  },
};
const PAL = {};
for (const name in PAL_SRC) {
  const src = PAL_SRC[name], out = {};
  for (const k in src) out[k] = typeof src[k] === 'string' ? hex(src[k]) : src[k];
  PAL[name] = out;
}
function mixPal(a, b, k) {
  const o = {};
  for (const key in a) {
    const va = a[key], vb = b[key];
    o[key] = typeof va === 'number' ? va + (vb - va) * k : mixc(va, vb, k);
  }
  return o;
}
// Дорожка палитр: [[t, 'имя'], ...] → функция t → палитра
function palTrack(list) {
  return function (t) {
    if (t <= list[0][0]) return PAL[list[0][1]];
    for (let i = 0; i < list.length - 1; i++) {
      const a = list[i], b = list[i + 1];
      if (t < b[0]) return mixPal(PAL[a[1]], PAL[b[1]], Ease.sine((t - a[0]) / (b[0] - a[0])));
    }
    return PAL[list[list.length - 1][1]];
  };
}
