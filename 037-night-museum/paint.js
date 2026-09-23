/* Ночной музей — генератор живописи.
   Каждый жанр описан функцией сцены: цвет в точке, направление мазка и степень детализации.
   Художник кладёт подмалёвок, затем три слоя мазков от крупных к мелким, потом лак, подпись и края.
   Координаты картины: x ∈ [0, A], y ∈ [0, 1] сверху вниз, A — отношение ширины к высоте. */
(function (root) {
'use strict';
const NM = root.NM = root.NM || {};
const SIZE = 256;
// Холст с программной растеризацией: тысячи мазков на CPU идут в разы быстрее,
// чем отдельные вызовы через GPU-холст, и не требуют обратного чтения при загрузке в текстуру.
function cpuCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d', { willReadFrequently: true });
  return c;
}

// ---------- случайность и шум ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const PERM = new Uint8Array(512), GX = new Float32Array(256), GY = new Float32Array(256);
(function () {
  const r = mulberry32(20260923);
  for (let i = 0; i < 256; i++) { PERM[i] = i; const a = r() * Math.PI * 2; GX[i] = Math.cos(a); GY[i] = Math.sin(a); }
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = PERM[i]; PERM[i] = PERM[j]; PERM[j] = t; }
  for (let i = 0; i < 256; i++) PERM[i + 256] = PERM[i];
})();
function noise(x, y) {
  let xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  xi &= 255; yi &= 255;
  const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10), v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
  const p0 = PERM[xi], p1 = PERM[xi + 1];
  const aa = PERM[p0 + yi], ab = PERM[p0 + yi + 1], ba = PERM[p1 + yi], bb = PERM[p1 + yi + 1];
  const x1 = GX[aa] * xf + GY[aa] * yf, x2 = GX[ba] * (xf - 1) + GY[ba] * yf;
  const y1 = GX[ab] * xf + GY[ab] * (yf - 1), y2 = GX[bb] * (xf - 1) + GY[bb] * (yf - 1);
  const a = x1 + (x2 - x1) * u, b = y1 + (y2 - y1) * u;
  return (a + (b - a) * v) * 1.41;
}
function fbm(x, y, oct) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * noise(x * f, y * f); f *= 2.03; a *= 0.5; }
  return s;
}
function seeded(rng) {
  const ox = rng() * 200, oy = rng() * 200;
  return {
    n: (x, y) => noise(x + ox, y + oy),
    f: (x, y, o) => fbm(x + ox, y + oy, o || 4),
  };
}

// ---------- цвет ----------
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
function pal(o) { const r = {}; for (const k in o) r[k] = hex(o[k]); return r; }
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
const sstep = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length) % arr.length];
const lum = (c) => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
function rgb(c) {
  const r = c[0] < 0 ? 0 : c[0] > 255 ? 255 : c[0] | 0;
  const g = c[1] < 0 ? 0 : c[1] > 255 ? 255 : c[1] | 0;
  const b = c[2] < 0 ? 0 : c[2] > 255 ? 255 : c[2] | 0;
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}

// ---------- кисть ----------
// Сцена один раз считается на сетке (подмалёвок, цвет и направление крупных и средних мазков).
// Мелкие мазки ставятся выборкой по важности туда, где сцена просит детали, с точным цветом.
function evalGrid(S, A, gw, gh) {
  const n = gw * gh;
  const col = new Float32Array(n * 3), flow = new Float32Array(n), det = new Float32Array(n);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const x = (i + 0.5) / gw * A, y = (j + 0.5) / gh;
    const c = S.color(x, y);
    const k = j * gw + i;
    col[k * 3] = c[0]; col[k * 3 + 1] = c[1]; col[k * 3 + 2] = c[2];
    flow[k] = S.flow ? S.flow(x, y) : 0;
    det[k] = S.detail ? S.detail(x, y) : 0.5;
  }
  return { gw, gh, col, flow, det, A };
}
const TMP = [0, 0, 0];
function gridColor(G, x, y) {
  let fx = x / G.A * G.gw - 0.5, fy = y * G.gh - 0.5;
  if (fx < 0) fx = 0; if (fy < 0) fy = 0;
  if (fx > G.gw - 1) fx = G.gw - 1; if (fy > G.gh - 1) fy = G.gh - 1;
  const i0 = Math.floor(fx), j0 = Math.floor(fy);
  const i1 = Math.min(i0 + 1, G.gw - 1), j1 = Math.min(j0 + 1, G.gh - 1);
  const tx = fx - i0, ty = fy - j0;
  const a = (j0 * G.gw + i0) * 3, b = (j0 * G.gw + i1) * 3, c = (j1 * G.gw + i0) * 3, d = (j1 * G.gw + i1) * 3;
  const C = G.col;
  for (let k = 0; k < 3; k++) {
    const top = C[a + k] + (C[b + k] - C[a + k]) * tx, bot = C[c + k] + (C[d + k] - C[c + k]) * tx;
    TMP[k] = top + (bot - top) * ty;
  }
  return TMP;
}
function gridCell(G, x, y) {
  const i = Math.max(0, Math.min(G.gw - 1, Math.floor(x / G.A * G.gw)));
  const j = Math.max(0, Math.min(G.gh - 1, Math.floor(y * G.gh)));
  return j * G.gw + i;
}
function stroke(ctx, x, y, c, L, rng, a, r, curve) {
  const v = 1 + (rng() - 0.5) * L.cv;
  const hj = (rng() - 0.5) * L.hv;
  const cr = c[0] * v + hj * 1.2, cg = c[1] * v + hj * 0.2, cb = c[2] * v - hj;
  const len = r * (L.l0 + rng() * (L.l1 - L.l0));
  const dx = Math.cos(a) * len * 0.5, dy = Math.sin(a) * len * 0.5;
  ctx.globalAlpha = L.alpha;
  ctx.strokeStyle = rgb([cr, cg, cb]);
  ctx.lineWidth = r * 2;
  ctx.beginPath();
  ctx.moveTo(x - dx, y - dy);
  if (curve) {
    const bend = (rng() - 0.5) * len * 0.35;
    ctx.quadraticCurveTo(x - Math.sin(a) * bend, y + Math.cos(a) * bend, x + dx, y + dy);
  } else ctx.lineTo(x + dx, y + dy);
  ctx.stroke();
  if (L.bristle && rng() < L.bristle) {
    // следы щетины: две тонкие полоски светлее и темнее по краям мазка
    const ox = -Math.sin(a) * r * 0.45, oy = Math.cos(a) * r * 0.45;
    ctx.globalAlpha = L.alpha * 0.35;
    ctx.lineWidth = r * 0.3;
    ctx.strokeStyle = rgb([cr * 1.13, cg * 1.13, cb * 1.13]);
    ctx.beginPath(); ctx.moveTo(x - dx + ox, y - dy + oy); ctx.lineTo(x + dx + ox, y + dy + oy); ctx.stroke();
    ctx.strokeStyle = rgb([cr * 0.85, cg * 0.85, cb * 0.85]);
    ctx.beginPath(); ctx.moveTo(x - dx - ox, y - dy - oy); ctx.lineTo(x + dx - ox, y + dy - oy); ctx.stroke();
  }
}
// Слои: r — радиус кисти в долях высоты; gap — шаг сетки мазков; fine — мелкие мазки по выборке важности.
const LAYERS = {
  base: (q) => [
    { r: 0.034, gap: 1.5, l0: 1.6, l1: 3.4, alpha: 0.92, cv: 0.12, hv: 10, aj: 0.5, bristle: 0.5, curve: true },
    { r: 0.016, gap: 1.9, l0: 1.4, l1: 3.2, alpha: 0.9, cv: 0.1, hv: 8, aj: 0.45, skip: 0.12 },
    { r: 0.0075, fine: Math.round(620 * (0.45 + q * 0.55)), l0: 1.2, l1: 2.8, alpha: 0.92, cv: 0.08, hv: 6, aj: 0.35 },
    { r: 0.0042, fine: q >= 1 ? 900 : 0, l0: 1.2, l1: 3.0, alpha: 0.9, cv: 0.07, hv: 5, aj: 0.3 },
  ],
  dabs: (q) => [
    { r: 0.03, gap: 1.45, l0: 1.1, l1: 2.2, alpha: 0.94, cv: 0.16, hv: 18, aj: 1.2, bristle: 0.45, curve: true },
    { r: 0.016, gap: 1.6, l0: 1.0, l1: 2.0, alpha: 0.94, cv: 0.16, hv: 16, aj: 1.0 },
    { r: 0.0085, fine: Math.round(700 * (0.45 + q * 0.55)), l0: 0.9, l1: 1.8, alpha: 0.95, cv: 0.14, hv: 14, aj: 0.9 },
    { r: 0.0048, fine: q >= 1 ? 900 : 0, l0: 0.9, l1: 1.8, alpha: 0.95, cv: 0.12, hv: 12, aj: 0.8 },
  ],
  smooth: () => [
    { r: 0.04, gap: 1.5, l0: 2.5, l1: 5, alpha: 0.7, cv: 0.06, hv: 5, aj: 0.2, bristle: 0.6, curve: true },
    { r: 0.02, gap: 1.6, l0: 2.2, l1: 4.5, alpha: 0.65, cv: 0.05, hv: 4, aj: 0.2 },
  ],
};
// Генератор мазков: отдаёт управление каждые ~150 мазков, чтобы кадр не замирал.
function* paintLayers(ctx, A, S, G, rng, layers) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  let n = 0;
  for (const L of layers) {
    if (L.fine) {
      // выборка по важности: чем больше «деталь» клетки, тем чаще туда ложатся мелкие мазки
      const cdf = new Float32Array(G.gw * G.gh);
      let acc = 0;
      for (let k = 0; k < cdf.length; k++) { const d = G.det[k]; acc += d > 0.3 ? d * d * d : 0; cdf[k] = acc; }
      if (acc <= 0) continue;
      for (let s = 0; s < L.fine; s++) {
        const t = rng() * acc;
        let lo = 0, hi = cdf.length - 1;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (cdf[mid] < t) lo = mid + 1; else hi = mid; }
        const x = ((lo % G.gw) + rng()) / G.gw * A, y = (Math.floor(lo / G.gw) + rng()) / G.gh;
        const c = S.color(x, y);
        const a = (S.flow ? S.flow(x, y) : 0) + (rng() - 0.5) * L.aj;
        const r = L.r * (0.75 + rng() * 0.5) * (S.size ? S.size(x, y) : 1);
        stroke(ctx, x, y, c, L, rng, a, r, false);
        if (++n % 150 === 0) yield;
      }
      continue;
    }
    const step = L.r * L.gap;
    const pts = [];
    for (let y = -step * 0.3; y < 1 + step * 0.5; y += step) {
      for (let x = -step * 0.3; x < A + step * 0.5; x += step) pts.push(x + (rng() - 0.5) * step, y + (rng() - 0.5) * step);
    }
    for (let i = pts.length / 2 - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      let t = pts[2 * i]; pts[2 * i] = pts[2 * j]; pts[2 * j] = t;
      t = pts[2 * i + 1]; pts[2 * i + 1] = pts[2 * j + 1]; pts[2 * j + 1] = t;
    }
    for (let i = 0; i < pts.length; i += 2) {
      const x = pts[i], y = pts[i + 1];
      const k = gridCell(G, x, y);
      if (L.skip && G.det[k] < L.skip && rng() < 0.5) continue;
      const c = gridColor(G, x, y);
      const a = G.flow[k] + (rng() - 0.5) * L.aj;
      const r = L.r * (0.75 + rng() * 0.5);
      stroke(ctx, x, y, c, L, rng, a, r, L.curve);
      if (++n % 150 === 0) yield;
    }
  }
  ctx.globalAlpha = 1;
}

// ---------- жанры ----------
// Каждый возвращает { color, flow, detail, post?, layers?, age, under? }.

function landscape(A, rng, o) {
  const N = seeded(rng);
  const season = o.season || pick(rng, ['summer', 'summer', 'autumn', 'spring', 'evening']);
  const P = pal({
    summer: { top: '#55769f', hor: '#dde0d2', cl: '#fbf5e6', cs: '#8a93a3', far: '#8398a0', forest: '#2f4235', f1: '#7a8a46', f2: '#aaa65a', near: '#46592b', road: '#b39c74', leafA: '#415f26', leafB: '#98a84a', trunk: '#ebe7dc' },
    autumn: { top: '#6a7f9a', hor: '#e8dcc2', cl: '#f8eedb', cs: '#99939a', far: '#8e978f', forest: '#48432f', f1: '#a18844', f2: '#caa453', near: '#5e4d27', road: '#a98b62', leafA: '#c07e22', leafB: '#f2c64a', trunk: '#eee8dc' },
    spring: { top: '#7797bd', hor: '#e8ebe4', cl: '#ffffff', cs: '#a2aab8', far: '#9aacb0', forest: '#4a5a47', f1: '#869656', f2: '#bcbc8c', near: '#566437', road: '#9d8b6c', leafA: '#86a854', leafB: '#d0dc8c', trunk: '#eae8e2' },
    evening: { top: '#465676', hor: '#f0bd86', cl: '#f6cf9e', cs: '#766474', far: '#77778a', forest: '#2b322d', f1: '#6b6436', f2: '#9a8746', near: '#353321', road: '#8a7258', leafA: '#44532a', leafB: '#a08d3e', trunk: '#e4d4be' },
  }[season]);
  const hz = 0.5 + rng() * 0.14;
  const trees = o.trees || pick(rng, ['birch', 'birch', 'pine', 'mixed', 'none']);
  const side = o.trees === 'birch' ? 1 : rng() < 0.5 ? 0 : 1;
  const tx0 = side ? A * (0.52 + rng() * 0.1) : A * 0.02, tx1 = side ? A * 0.98 : A * (0.36 + rng() * 0.1);
  const trunks = [];
  const nT = trees === 'none' ? 0 : 4 + Math.floor(rng() * 5);
  for (let i = 0; i < nT; i++) {
    const kind = trees === 'mixed' ? pick(rng, ['birch', 'pine']) : trees;
    trunks.push({ x: tx0 + rng() * (tx1 - tx0), w: 0.008 + rng() * 0.009, base: hz + 0.1 + rng() * 0.28, top: 0.02 + rng() * 0.2,
      lean: (rng() - 0.5) * 0.05, kind, cx: 0, seed: rng() * 50 });
  }
  trunks.sort((a, b) => a.base - b.base);
  const water = rng() < 0.45;
  const road = !water && rng() < 0.75;
  const mx0 = A * (0.3 + rng() * 0.4), amp = 0.12 + rng() * 0.2, ph = rng() * 6;
  const pathX = (y) => mx0 + Math.sin((y - hz) * 6.5 + ph) * amp * (y - hz) * 2.4;
  const pathW = (y) => 0.004 + (y - hz) * (water ? 0.5 : 0.24);
  const church = rng() < 0.4 ? { x: A * (0.2 + rng() * 0.6), s: 0.016 + rng() * 0.01 } : null;
  let reg = 0;
  function color(x, y) {
    let c;
    reg = 0;
    if (y < hz) {
      const t = y / hz;
      c = mix(P.top, P.hor, Math.pow(t, 1.35));
      const k = 0.2 - Math.abs(t - 0.42) * 0.55;
      const cn = N.f(x * 2.1, y * 5.2, 5) + k;
      const dens = sstep(0.0, 0.18, cn);
      if (dens > 0.002) {
        const above = N.f(x * 2.1, (y - 0.04) * 5.2, 4) + k;
        const lit = 1 - sstep(-0.06, 0.22, above);
        c = mix(c, mix(P.cs, P.cl, 0.2 + 0.8 * lit), dens * 0.95);
        reg = 5;
      }
      const yh = hz - 0.035 - 0.05 * (0.5 + N.f(x * 2.2, 5.5, 3));
      if (y > yh) { c = mix(c, P.far, 0.55 + 0.3 * sstep(yh, hz, y)); reg = 6; }
      const yf = hz - 0.01 - 0.018 * (0.5 + N.f(x * 5, 9.1, 3)) - 0.02 * Math.max(0, N.n(x * 40, 3.3));
      if (y > yf) { c = mix(P.forest, P.far, 0.22 + 0.18 * N.n(x * 25, y * 25)); reg = 6; }
      if (church) {
        const dx = x - church.x, s = church.s;
        if (Math.abs(dx) < s && y > hz - 1.5 * s && y < hz) { c = mix(hex('#e9e1d2'), hex('#a9a092'), dx > 0 ? 0.5 : 0); reg = 7; }
        if (Math.abs(dx) < s * 1.15 && y > hz - 1.75 * s && y <= hz - 1.5 * s) { c = hex('#5a6b5a'); reg = 7; }
        if (Math.hypot(dx, (y - (hz - 2.05 * s)) * 1.2) < s * 0.45) { c = mix(hex('#e6bf5a'), hex('#8a6a2a'), dx > 0 ? 0.6 : 0); reg = 7; }
        if (Math.abs(dx - s * 1.6) < s * 0.32 && y > hz - 3.2 * s && y < hz) { c = mix(hex('#e3dccd'), hex('#9c9486'), 0.3); reg = 7; }
      }
    } else {
      const g = (y - hz) / (1 - hz);
      c = mix(P.f1, P.near, g * g * 0.9);
      const band = N.f(x * 1.1 / (0.12 + g), y * 15, 3);
      c = mix(c, P.f2, sstep(-0.05, 0.3, band) * 0.55 * (1 - g * 0.4));
      reg = 1;
      if (road || water) {
        const d = Math.abs(x - pathX(y)) / pathW(y);
        if (d < 1) {
          if (water) {
            const refl = mix(P.hor, P.top, 0.25 + 0.45 * (1 - g));
            c = mix(mul(refl, 0.92 + N.n(x * 50, y * 220) * 0.08), P.forest, 0.12 + g * 0.22);
            c = mix(c, P.near, sstep(0.78, 1.0, d) * 0.7);
            reg = 4;
          } else {
            c = mix(c, P.road, (1 - sstep(0.55, 1.0, d)) * 0.85);
            if (Math.abs(d - 0.45) < 0.12) c = mul(c, 0.86);
            reg = 3;
          }
        }
      }
      c = mul(c, 1 - 0.28 * g * sstep(0.1, 0.8, N.f(x * 3, y * 3 + 5, 3) + 0.5));
      if (g > 0.5 && reg === 1) {
        // трава переднего плана: вертикальные штрихи и кочки
        const tuft = N.n(x * 46, y * 9);
        c = mix(c, tuft > 0 ? mul(P.f2, 1.08) : mul(P.near, 0.72), Math.abs(tuft) * 0.55 * (g - 0.5) * 2);
        reg = 9;
        if (season !== 'autumn' && N.n(x * 90, y * 90) > 0.62) c = mix(c, hex(season === 'evening' ? '#e8c07a' : '#f2eee0'), 0.7);
      }
    }
    // деревья
    for (let i = 0; i < trunks.length; i++) {
      const T = trunks[i];
      const xt = T.x + T.lean * (T.base - y);
      if (T.kind === 'birch') {
        // крона — облако мазков вокруг верхней части ствола
        const cy = T.top + 0.2, dx = (x - xt) / 0.11, dy = (y - cy) / 0.24;
        const e = dx * dx + dy * dy;
        if (e < 1.6 && y < T.base - 0.08) {
          const leaf = N.f(x * 13 + T.seed, y * 13, 3) + 0.42 - e * 0.42;
          if (leaf > 0.12) {
            const lit = sstep(-0.3, 0.4, N.n(x * 9 + T.seed, y * 9) - dy * 0.5 - dx * 0.3);
            c = mix(P.leafA, P.leafB, lit); reg = 8;
          }
        }
        if (Math.abs(x - xt) < T.w * 0.5 && y < T.base && y > T.top) {
          const mark = N.n(T.seed + x * 30, y * 70) > 0.32 || N.n(T.seed, y * 25) > 0.55;
          c = mark ? hex('#2d2a24') : mul(P.trunk, x > xt ? 0.78 : 1.02);
          reg = 2;
        }
      } else {
        const h = T.base - y;
        const half = h * 0.2 * (0.8 + 0.35 * N.n(y * 45 + T.seed, T.seed));
        if (y > T.top && y < T.base && Math.abs(x - xt) < half) {
          const tip = sstep(0.0, 0.1, h);
          c = mix(hex('#1c2a1f'), hex('#3d5a36'), sstep(-0.2, 0.6, N.n(x * 30, y * 30) - (x - xt) / (half + 1e-4) * 0.3)) ;
          c = mul(c, 0.8 + 0.2 * tip);
          reg = 8;
        }
        if (Math.abs(x - xt) < T.w * 0.35 && y < T.base && y > T.base - 0.06) { c = hex('#3a2a1e'); reg = 2; }
      }
    }
    return c;
  }
  return {
    color,
    flow: (x, y) => reg === 2 || reg === 9 ? Math.PI / 2 + (reg === 9 ? N.n(x * 20, y * 20) * 0.5 : 0) : reg === 8 ? N.n(x * 6, y * 6) * 3 : reg === 5 ? N.n(x * 3, y * 3) * 0.8 : reg === 4 ? 0 : N.n(x * 2, y * 2) * 0.35,
    detail: () => (reg === 2 || reg === 7 ? 1 : reg === 8 || reg === 6 ? 0.7 : reg === 3 || reg === 4 || reg === 9 ? 0.55 : 0.25),
    age: 0.35,
  };
}

function winter(A, rng) {
  const N = seeded(rng);
  const P = pal({ top: '#6f84a8', mid: '#c4b3bd', hor: '#f3cfa2', sun: '#fff0cc', snow: '#eef1f5', shade: '#9aadcf', forest: '#39455a',
    wood: '#4a3327', dark: '#2a211d', roof: '#f6f6f3', win: '#ffae45', smoke: '#b9b7c2' });
  const hz = 0.5 + rng() * 0.1;
  const sx = A * (0.25 + rng() * 0.5);
  const huts = [];
  const nh = 2 + Math.floor(rng() * 3);
  for (let i = 0; i < nh; i++) {
    const w = 0.08 + rng() * 0.07;
    huts.push({ x: A * (0.08 + rng() * 0.8), w, h: w * (0.55 + rng() * 0.2), base: hz + 0.05 + rng() * 0.14, win: rng() < 0.8 });
  }
  huts.sort((a, b) => a.base - b.base);
  let reg = 0;
  function color(x, y) {
    let c;
    reg = 0;
    if (y < hz) {
      const t = y / hz;
      c = t < 0.6 ? mix(P.top, P.mid, t / 0.6) : mix(P.mid, P.hor, (t - 0.6) / 0.4);
      const d = Math.hypot(x - sx, (y - hz) * 1.6);
      c = mix(c, P.sun, Math.exp(-d * d * 30) * 0.8);
      const cl = N.f(x * 1.6, y * 6, 4);
      c = mix(c, mix(P.mid, P.top, 0.3), sstep(0.1, 0.4, cl) * 0.35);
      const yf = hz - 0.012 - 0.03 * (0.5 + N.f(x * 4, 2.1, 3)) - 0.015 * Math.max(0, N.n(x * 50, 7));
      if (y > yf) { c = mix(P.forest, P.mid, 0.25 + 0.1 * N.n(x * 20, y * 20)); reg = 6; }
    } else {
      const g = (y - hz) / (1 - hz);
      c = mix(P.snow, P.shade, 0.18 + 0.2 * (1 - g));
      const sh = N.f(x * 1.8, y * 7, 4);
      c = mix(c, P.shade, sstep(0.0, 0.35, sh) * 0.65);
      c = mix(c, P.sun, sstep(0.2, 0.5, -sh) * 0.25 * (1 - g));
      reg = 1;
    }
    for (const H of huts) {
      const dx = x - H.x;
      if (Math.abs(dx) < H.w / 2 && y > H.base - H.h && y < H.base) {
        c = mix(P.wood, P.dark, dx > 0 ? 0.55 : 0.1);
        if (Math.abs((y - H.base) * 60 % 1) < 0.2) c = mul(c, 0.8);
        if (H.win && Math.abs(dx + H.w * 0.12) < H.w * 0.1 && Math.abs(y - (H.base - H.h * 0.5)) < H.h * 0.16) c = P.win;
        reg = 7;
      }
      const ry = H.base - H.h, rt = H.w * 0.42;
      if (y < ry && y > ry - rt && Math.abs(dx) < (H.w * 0.62) * (1 - (ry - y) / rt)) { c = mix(P.roof, P.shade, dx > 0 ? 0.45 : 0); reg = 7; }
      // дым из трубы
      const sy = ry - rt * 0.7;
      if (y < sy && y > sy - 0.25) {
        const k = (sy - y) / 0.25;
        const px = H.x + H.w * 0.18 + Math.sin(k * 5 + H.x * 10) * 0.02 * k + k * 0.06;
        const wdt = 0.006 + k * 0.03;
        const dd = Math.abs(x - px) / wdt;
        if (dd < 1) c = mix(c, P.smoke, (1 - dd) * (1 - k) * 0.55);
      }
    }
    return c;
  }
  function post(ctx) {
    // голые деревья
    const draw = (x, y, a, len, w, d) => {
      const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
      ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
      if (d <= 0) return;
      draw(x2, y2, a - 0.35 - rng() * 0.3, len * (0.62 + rng() * 0.15), w * 0.62, d - 1);
      draw(x2, y2, a + 0.3 + rng() * 0.3, len * (0.6 + rng() * 0.15), w * 0.6, d - 1);
      if (rng() < 0.4) draw(x2, y2, a + (rng() - 0.5) * 0.4, len * 0.7, w * 0.6, d - 1);
    };
    ctx.strokeStyle = '#2b2622'; ctx.lineCap = 'round'; ctx.globalAlpha = 0.85;
    const nt = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < nt; i++) {
      const x = A * (0.05 + rng() * 0.9), y = hz + 0.15 + rng() * 0.3;
      draw(x, y, -Math.PI / 2 + (rng() - 0.5) * 0.2, 0.12 + rng() * 0.08, 0.012, 5);
    }
    // изгородь
    ctx.globalAlpha = 0.7; ctx.lineWidth = 0.004;
    const fy = hz + 0.08 + rng() * 0.1;
    for (let x = rng() * 0.05; x < A; x += 0.035 + rng() * 0.02) {
      const yy = fy + Math.sin(x * 3) * 0.02 + (x / A) * 0.05;
      ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + 0.002, yy - 0.03 - rng() * 0.012); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  return {
    color, post,
    flow: (x, y) => (reg === 1 ? N.n(x * 2, y * 4) * 0.4 : reg === 7 ? (rng() < 0.5 ? 0 : Math.PI / 2) : N.n(x * 3, y * 3) * 0.5),
    detail: () => (reg === 7 ? 1 : reg === 6 ? 0.6 : 0.25),
    age: 0.3,
  };
}

function sea(A, rng, o) {
  const N = seeded(rng);
  const mood = o.mood || pick(rng, ['storm', 'sunset', 'calm', 'storm', 'grey']);
  const P = pal({
    storm: { dark: '#252d30', mid: '#6b6f66', glow: '#f4dca4', deep: '#0f2a29', seamid: '#2c5a50', lit: '#76b39a', foam: '#e9efe4', ship: '#1a1a1a' },
    sunset: { dark: '#3f3446', mid: '#c26f58', glow: '#ffd99a', deep: '#252c3a', seamid: '#584e5e', lit: '#eaa272', foam: '#f7e6cf', ship: '#231a1e' },
    calm: { dark: '#7890ab', mid: '#dcdcd2', glow: '#fff4d6', deep: '#2b4858', seamid: '#6b8b96', lit: '#bdd3d0', foam: '#f3f4ef', ship: '#3a3834' },
    grey: { dark: '#3d4449', mid: '#9ba09a', glow: '#eef0e2', deep: '#1f3036', seamid: '#4f6a6c', lit: '#8fb0a8', foam: '#e8ece6', ship: '#222' },
  }[mood]);
  const storm = mood === 'storm' || mood === 'grey';
  const hz = 0.43 + rng() * 0.12;
  const gx = A * (0.3 + rng() * 0.45), gy = hz - 0.06 - rng() * 0.16;
  const ship = rng() < 0.75 ? { x: A * (0.15 + rng() * 0.7), s: 0.06 + rng() * 0.05, tilt: (rng() - 0.5) * (storm ? 0.5 : 0.1) } : null;
  const big = storm && rng() < 0.7 ? { x: rng() < 0.5 ? A * (0.15 + rng() * 0.2) : A * (0.65 + rng() * 0.2), y: 0.8 + rng() * 0.06, ph: rng() * 6 } : null;
  let reg = 0;
  function color(x, y) {
    let c;
    if (y < hz) {
      reg = 0;
      const cn = N.f(x * 2.3, y * 4.2, 5) + (storm ? 0.12 : -0.08);
      c = mix(P.mid, P.dark, sstep(-0.18, 0.35, cn) * (0.6 + 0.4 * (1 - y / hz)));
      const d2 = (x - gx) * (x - gx) + (y - gy) * (y - gy) * 2.2;
      const gl = Math.exp(-d2 * 16);
      c = mix(c, P.glow, gl * (1 - 0.65 * sstep(0.0, 0.4, cn)));
      const rim = Math.exp(-Math.pow((cn - 0.08) / 0.06, 2)) * Math.exp(-d2 * 5);
      c = mix(c, P.glow, rim * 0.7);
      c = mix(c, mix(P.mid, P.glow, 0.3), sstep(hz - 0.08, hz, y) * 0.4);
    } else {
      reg = 1;
      const q = (y - hz) / (1 - hz);
      const k = 1 / (q + 0.06);
      // две системы волн под углом друг к другу — ряды не выглядят линованными
      const w1 = Math.sin(k * 4.0 + N.f(x * 1.4 * (0.4 + q), k * 0.3, 3) * 3.0 + x * 1.3);
      const w2 = Math.sin(k * 2.3 - x * 2.1 + N.f(x * 0.9 + 7, k * 0.2, 2) * 2.2);
      const h = w1 * 0.65 + w2 * 0.35;
      c = mix(P.deep, P.seamid, 0.38 + 0.36 * h + 0.16 * (1 - q));
      const face = sstep(0.1, 0.62, h) * (1 - sstep(0.68, 0.9, h));
      const nearGlow = Math.exp(-Math.pow((x - gx) / (0.25 + q * 0.4), 2));
      c = mix(c, P.lit, face * (0.2 + 0.6 * nearGlow) * (storm ? 1 : 0.55));
      // пена только там, где гребень «ломается»
      const brk = sstep(-0.05, 0.25, N.f(x * 1.2 + 3, k * 0.25 + 1, 2));
      const streak = sstep(0.0, 0.45, N.f(x * 9 * (0.5 + q), y * 26, 3));
      const foam = sstep(0.66, 0.9, h) * brk * streak;
      if (foam > 0.05) { c = mix(c, P.foam, foam * (storm ? 0.95 : 0.5)); reg = 2; }
      // пенное кружево на спинах волн
      const lace = sstep(0.28, 0.4, N.f(x * 14, y * 40, 2)) * sstep(-0.2, 0.3, h) * (storm ? 0.35 : 0.15);
      c = mix(c, P.foam, lace);
      const refl = Math.exp(-Math.pow((x - gx) / (0.02 + 0.22 * q), 2)) * (1 - q * 0.6);
      const sp = sstep(0.1, 0.5, N.n(x * 70, y * 25));
      c = mix(c, P.glow, refl * (0.25 + 0.7 * sp));
      if (refl * sp > 0.3) reg = 3;
      c = mix(c, mix(P.mid, P.glow, 0.2), (1 - sstep(0, 0.05, q)) * 0.5);
      // большая волна на переднем плане
      if (big) {
        const yc = big.y + 0.05 * Math.sin(x * 3.1 + big.ph) - 0.13 * Math.max(0, 1 - Math.abs(x - big.x) / 0.55);
        if (y > yc) {
          const dd = y - yc;
          c = mix(mix(P.lit, P.seamid, 0.35), P.deep, sstep(0.0, 0.14, dd));
          c = mix(c, P.glow, Math.exp(-Math.pow((x - gx) / 0.3, 2)) * (1 - sstep(0, 0.06, dd)) * 0.35);
          const fz = 0.02 + 0.018 * N.n(x * 30, 1.7);
          if (dd < fz) { c = mix(c, P.foam, 0.9 * (1 - dd / fz)); reg = 2; }
          else if (N.f(x * 12, y * 18, 2) > 0.3 && dd < 0.2) { c = mix(c, P.foam, 0.4); reg = 2; }
          else reg = 4;
        }
      }
    }
    return c;
  }
  function post(ctx) {
    if (!ship) return;
    const { x, s, tilt } = ship;
    const y = hz + 0.012;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(tilt * 0.3);
    ctx.fillStyle = rgb(P.ship); ctx.strokeStyle = rgb(P.ship); ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.moveTo(-s * 0.6, -s * 0.05); ctx.lineTo(s * 0.62, -s * 0.07); ctx.lineTo(s * 0.45, s * 0.07); ctx.lineTo(-s * 0.45, s * 0.07); ctx.closePath(); ctx.fill();
    ctx.lineWidth = s * 0.03;
    const masts = [-0.3, 0.05, 0.35];
    for (const m of masts) {
      ctx.beginPath(); ctx.moveTo(m * s, -s * 0.05); ctx.lineTo(m * s, -s * 0.95); ctx.stroke();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = rgb(mix(P.mid, P.glow, storm ? 0.1 : 0.5));
      for (let k = 0; k < 3; k++) {
        const top = -s * (0.9 - k * 0.28), w = s * (0.18 - k * 0.02);
        ctx.fillRect(m * s - w, top, w * 2, s * 0.2);
      }
      ctx.globalAlpha = 0.9; ctx.fillStyle = rgb(P.ship);
    }
    ctx.restore();
  }
  return {
    color, post,
    flow: (x, y) => (reg === 0 ? N.n(x * 3, y * 3) * 0.9 : reg === 3 ? 0 : reg === 4 ? -0.5 + N.n(x * 4, y * 4) * 0.4 : -0.08 + N.n(x * 4, y * 8) * 0.25),
    detail: () => (reg === 2 || reg === 3 ? 0.9 : reg === 1 ? 0.45 : 0.3),
    age: 0.45,
  };
}

function moonNight(A, rng, o) {
  const N = seeded(rng);
  const P = pal({ top: '#050a0e', mid: '#10252a', hor: '#2a4a42', moon: '#f6f7dc', glow: '#95d1b0', land: '#0a0f0d', land2: '#18211a',
    water: '#0b1719', path: '#d6f0cc', hut: '#15120f', win: '#f3a441', cloud: '#1c3033' });
  const hero = !!o.hero;
  const hz = hero ? 0.6 : 0.55 + rng() * 0.12;
  const mx = A * (hero ? 0.58 : 0.3 + rng() * 0.4), my = hero ? 0.22 : 0.12 + rng() * 0.16, R = hero ? 0.042 : 0.032 + rng() * 0.012;
  const riverC = A * (hero ? 0.5 : 0.35 + rng() * 0.3);
  const huts = [];
  for (let i = 0; i < 2 + Math.floor(rng() * 3); i++) huts.push({ x: A * (0.05 + rng() * 0.3) + (rng() < 0.5 ? 0 : A * 0.6), w: 0.035 + rng() * 0.03, y: hz + 0.02 + rng() * 0.05 });
  let reg = 0;
  function bankY(x) { return hz + 0.012 * N.f(x * 6, 1.3, 3); }
  function color(x, y) {
    let c;
    reg = 0;
    const dm = Math.hypot(x - mx, y - my);
    if (y < hz) {
      const t = y / hz;
      c = t < 0.55 ? mix(P.top, P.mid, t / 0.55) : mix(P.mid, P.hor, (t - 0.55) / 0.45);
      c = mix(c, P.glow, Math.exp(-dm * dm * 60) * 0.55 + Math.exp(-dm * dm * 6) * 0.18);
      const cl = N.f(x * 2.6, y * 7, 5);
      const cloud = sstep(0.05, 0.3, cl);
      const edge = Math.exp(-Math.pow((cl - 0.07) / 0.05, 2)) * Math.exp(-dm * dm * 14);
      c = mix(c, mix(P.cloud, P.top, 0.3), cloud * 0.8);
      c = mix(c, P.glow, edge * 0.8);
      if (dm < R) { c = mix(P.moon, hex('#d8dcc0'), sstep(-0.2, 0.6, N.n(x * 60, y * 60)) * 0.35); reg = 3; }
      else if (dm < R * 1.25) c = mix(c, P.moon, (1 - (dm - R) / (R * 0.25)) * 0.6);
      const yf = hz - 0.015 - 0.035 * (0.5 + N.f(x * 3.2, 4.4, 3)) - (Math.abs(x - riverC) < 0.12 ? -0.02 : 0);
      if (y > yf) { c = mix(P.land, P.land2, 0.3 + 0.3 * N.n(x * 20, y * 20)); reg = 4; }
    } else {
      const q = (y - hz) / (1 - hz);
      const half = 0.03 + q * (hero ? 0.75 : 0.55);
      const wx = riverC + Math.sin(q * 3 + 1) * 0.05 * q;
      if (Math.abs(x - wx) < half) {
        c = mix(P.water, P.mid, 0.25 + 0.2 * (1 - q));
        const band = Math.exp(-Math.pow((x - mx) / (0.012 + 0.16 * q), 2));
        const g = sstep(0.05, 0.45, N.n(x * 90, y * 32));
        c = mix(c, P.glow, band * 0.35);
        c = mix(c, P.path, band * g * 0.95);
        reg = band * g > 0.3 ? 5 : 1;
        // отражение неба у берегов
        c = mix(c, P.land, sstep(0.8, 1.0, Math.abs(x - wx) / half) * 0.7);
      } else {
        c = mix(P.land, P.land2, 0.2 + 0.3 * sstep(-0.2, 0.5, N.f(x * 3, y * 6, 3)));
        c = mix(c, P.glow, 0.06 * (1 - q));
        reg = 4;
      }
    }
    for (const H of huts) {
      const dx = x - H.x;
      if (Math.abs(dx) < H.w / 2 && y > H.y - H.w * 0.5 && y < H.y) {
        c = P.hut; reg = 6;
        if (Math.abs(dx + H.w * 0.12) < H.w * 0.08 && Math.abs(y - (H.y - H.w * 0.22)) < H.w * 0.07) c = P.win;
      }
      const ry = H.y - H.w * 0.5;
      if (y < ry && y > ry - H.w * 0.4 && Math.abs(dx) < H.w * 0.6 * (1 - (ry - y) / (H.w * 0.4))) { c = mix(P.hut, P.glow, 0.12); reg = 6; }
    }
    return c;
  }
  function post(ctx) {
    // тополя-силуэты
    ctx.fillStyle = '#070b09'; ctx.globalAlpha = 0.92;
    const n = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < n; i++) {
      const x = rng() < 0.5 ? A * (0.03 + rng() * 0.2) : A * (0.77 + rng() * 0.2), base = hz + 0.03 + rng() * 0.05, h = 0.22 + rng() * 0.18, w = 0.025 + rng() * 0.02;
      ctx.beginPath(); ctx.ellipse(x, base - h / 2, w, h / 2, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  return {
    color, post,
    flow: (x, y) => (reg === 5 || reg === 1 ? 0 : reg === 0 ? N.n(x * 3, y * 3) * 0.7 : N.n(x * 4, y * 4) * 1.2),
    detail: () => (reg === 3 || reg === 5 || reg === 6 ? 1 : reg === 1 ? 0.5 : 0.25),
    age: 0.4,
  };
}

// мягкое пятно-лессировка: для черт лица и бликов
function soft(ctx, x, y, rx, ry, rgbStr, a, rot) {
  ctx.save();
  ctx.translate(x, y); if (rot) ctx.rotate(rot); ctx.scale(rx, ry);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  g.addColorStop(0, 'rgba(' + rgbStr + ',' + a + ')');
  g.addColorStop(0.55, 'rgba(' + rgbStr + ',' + (a * 0.55).toFixed(3) + ')');
  g.addColorStop(1, 'rgba(' + rgbStr + ',0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function portrait(A, rng, o) {
  const N = seeded(rng);
  const female = o.female !== undefined ? o.female : rng() < 0.5;
  const old = !female && rng() < 0.3;
  const bgs = ['#2a2016', '#1d241e', '#34201a', '#1c1f27', '#2c291f'];
  const clothes = female ? ['#141418', '#1d2c48', '#5a1a22', '#243320', '#3c3f55'] : ['#15161a', '#232a22', '#2c211b', '#1b2334'];
  const hairs = old ? ['#b7b0a4', '#8d877e'] : ['#1c140f', '#382415', '#57381d', '#17130f', '#6f4222'];
  const P = pal({ bg: pick(rng, bgs), cloth: o.cloth || pick(rng, clothes), hair: pick(rng, hairs), skD: '#3e2319', skM: '#9b6246', skL: '#d49a74', skH: '#f0c7a2',
    lip: '#9a4038', white: '#ece4d4', eye: '#1e140e' });
  const cx = A / 2 + (rng() - 0.5) * 0.03, cy = 0.33 + (rng() - 0.5) * 0.02;
  const rx = 0.13, ry = 0.166;
  const turn = (rng() - 0.5) * 0.42;
  const L = [-0.62, -0.5, 0.6];
  const beard = !female && rng() < 0.35;
  const hairLong = female;
  let reg = 0, nxv = 0, nyv = 0;
  function skin(k) { return k < 0.45 ? mix(P.skD, P.skM, k / 0.45) : k < 0.82 ? mix(P.skM, P.skL, (k - 0.45) / 0.37) : mix(P.skL, P.skH, (k - 0.82) / 0.18); }
  function color(x, y) {
    reg = 0;
    const gd = Math.hypot(x - cx + 0.1, (y - cy + 0.03) * 0.9);
    let c = mix(P.bg, mul(P.bg, 2.1), Math.exp(-gd * gd * 6) * 0.95);
    c = mul(c, 0.85 + 0.2 * N.f(x * 3, y * 3, 3));
    // плечи и одежда: широкий бюст до краёв холста
    const sx = (x - cx) / 0.36;
    const shoulder = cy + 0.215 + 0.15 * sx * sx;
    if (y > shoulder && Math.abs(x - cx) < 0.62) {
      const fold = N.f(x * 9, y * 3, 3);
      c = mul(P.cloth, 0.7 + 0.55 * sstep(-0.4, 0.5, -sx * 0.7 + fold));
      reg = 2;
      if (female) {
        const dec = Math.abs(x - cx) < 0.17 - (y - shoulder) * 0.55 && y < shoulder + 0.2;
        if (dec) { c = skin(clamp01(0.6 - sx * 0.45 - (y - shoulder) * 1.2)); reg = 1; }
      } else {
        const col = Math.abs(x - cx) < 0.055 - (y - shoulder) * 0.12 && y < shoulder + 0.2;
        if (col) { c = mul(P.white, 0.8 + 0.2 * (-sx)); reg = 3; }
      }
    }
    // шея, нижняя часть в тени подбородка
    const neckX = cx + turn * 0.015;
    if (Math.abs(x - neckX) < 0.056 && y > cy + 0.1 && y < shoulder + 0.03) {
      const k = 0.52 - (x - neckX) / 0.056 * 0.28 - (y < cy + 0.2 ? 0.28 : 0);
      c = skin(clamp01(k));
      reg = 1;
    }
    // голова: эллипсоид, повёрнутый на turn, резкая светотень
    const ux = (x - cx) / rx, uy = (y - cy) / ry;
    const e = ux * ux + uy * uy;
    if (e < 1) {
      const nz = Math.sqrt(1 - e);
      const nx = ux * Math.cos(turn) + nz * Math.sin(turn), ny = uy;
      nxv = ux; nyv = uy;
      const lam = nx * L[0] + ny * L[1] + nz * L[2];
      let k = 0.12 + 0.95 * Math.max(0, lam) + 0.1 * (1 - e);
      k = clamp01(k);
      c = skin(k);
      reg = 1;
    }
    // волосы
    const hx = (x - cx) / (rx * (hairLong ? 1.22 : 1.12)), hy = (y - cy + 0.012) / (ry * 1.12);
    const he = hx * hx + hy * hy;
    const part = hairLong ? Math.abs(hx - turn * 0.3) * 0.12 : 0;
    const line = -0.36 + 0.16 * Math.cos(hx * 2.1) - part;
    let inHair = he < 1 && hy < line;
    if (hairLong && Math.abs(hx) > 0.7 && hy < 0.62 && hy > -0.95 && he < 1.4) inHair = true;
    if (!hairLong && Math.abs(hx) > 0.86 && hy < 0.05 && he < 1.05) inHair = true;
    if (inHair) {
      const sheen = sstep(-0.3, 0.7, N.n(x * 50, y * 14) - hx * 0.6 - hy * 0.3);
      c = mix(P.hair, mul(P.hair, 2.4), sheen * 0.4);
      reg = 5;
    }
    if (female) {
      const bd = Math.hypot((x - cx + 0.03) / 0.09, (y - (cy - ry * 1.0)) / 0.065);
      if (bd < 1) { c = mix(P.hair, mul(P.hair, 2), sstep(-0.2, 0.6, N.n(x * 50, y * 50)) * 0.35); reg = 5; }
    }
    if (beard && e < 1) {
      const fu = ux - turn * 0.5;
      if (uy > 0.32 && Math.abs(fu) < 0.92 && !(uy > 0.4 && uy < 0.6 && Math.abs(fu) < 0.28)) { c = mix(P.hair, mul(P.hair, 1.6), sstep(-0.3, 0.3, N.n(x * 70, y * 70))); reg = 5; }
    }
    return c;
  }
  function post(ctx) {
    // черты лица — лессировками поверх мазков
    const fx = cx + turn * rx * 0.55;
    const ey = cy - ry * 0.12;
    const eyeDx = rx * 0.4;
    const shadowSide = 1;
    soft(ctx, cx + rx * 0.5, cy + 0.01, rx * 0.62, ry * 0.95, '40,20,13', 0.44);
    for (const s of [-1, 1]) {
      const ex = fx + s * eyeDx * (s * turn > 0 ? 0.88 : 1);
      soft(ctx, ex, ey, rx * 0.3, rx * 0.17, '62,32,22', 0.5);
      soft(ctx, ex, ey + rx * 0.01, rx * 0.15, rx * 0.06, '24,14,10', 0.9);
      soft(ctx, ex + turn * rx * 0.08, ey + rx * 0.01, rx * 0.06, rx * 0.055, '14,8,6', 0.9);
      soft(ctx, ex - rx * 0.035, ey - rx * 0.015, rx * 0.022, rx * 0.02, '255,246,230', 0.85);
      ctx.strokeStyle = 'rgba(' + (female ? '40,24,18' : '34,20,14') + ',0.55)';
      ctx.lineWidth = rx * 0.055; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(ex - rx * 0.19, ey - rx * 0.2); ctx.quadraticCurveTo(ex, ey - rx * 0.29, ex + rx * 0.2, ey - rx * 0.21); ctx.stroke();
    }
    // нос: тень, крылья, блик на спинке
    soft(ctx, fx + rx * 0.12 * shadowSide, cy + ry * 0.12, rx * 0.08, ry * 0.2, '66,34,24', 0.45);
    soft(ctx, fx - rx * 0.07, cy + ry * 0.33, rx * 0.04, rx * 0.028, '40,20,14', 0.7);
    soft(ctx, fx + rx * 0.08, cy + ry * 0.33, rx * 0.04, rx * 0.028, '40,20,14', 0.7);
    soft(ctx, fx - rx * 0.03, cy + ry * 0.05, rx * 0.035, ry * 0.18, '255,226,196', 0.22);
    soft(ctx, fx - rx * 0.02, cy + ry * 0.27, rx * 0.06, rx * 0.045, '255,224,196', 0.35);
    // губы
    const my = cy + ry * 0.53;
    soft(ctx, fx, my - rx * 0.03, rx * 0.25, rx * 0.06, female ? '150,52,48' : '120,56,46', 0.65);
    soft(ctx, fx, my + rx * 0.06, rx * 0.2, rx * 0.07, female ? '176,84,72' : '140,76,62', 0.5);
    ctx.strokeStyle = 'rgba(52,22,18,0.7)'; ctx.lineWidth = rx * 0.03;
    ctx.beginPath(); ctx.moveTo(fx - rx * 0.21, my + rx * 0.01); ctx.quadraticCurveTo(fx, my + rx * 0.045, fx + rx * 0.21, my + rx * 0.01); ctx.stroke();
    // румянец и тень под подбородком
    soft(ctx, fx - rx * 0.5, cy + ry * 0.22, rx * 0.26, rx * 0.2, '200,96,80', 0.18);
    soft(ctx, fx + rx * 0.5, cy + ry * 0.22, rx * 0.22, rx * 0.18, '180,80,66', 0.12);
    soft(ctx, cx + rx * 0.15, cy + ry * 1.08, rx * 0.8, rx * 0.26, '30,16,10', 0.55);
    if (female && o.pearls !== false && (o.pearls || rng() < 0.5)) {
      // нитка жемчуга
      for (let i = -8; i <= 8; i++) {
        const t = i / 8;
        const px = cx + t * 0.13, py = cy + ry * 1.42 + 0.055 * t * t;
        soft(ctx, px, py, 0.0105, 0.0105, '236,228,214', 0.95);
        soft(ctx, px - 0.003, py - 0.003, 0.0035, 0.0035, '255,255,250', 0.9);
      }
    } else if (!female) {
      soft(ctx, cx, cy + ry * 1.62, 0.03, 0.05, '236,230,218', 0.5);
    }
  }
  return {
    color, post,
    flow: (x, y) => (reg === 1 ? Math.atan2(nyv, nxv) + Math.PI / 2 : reg === 5 ? Math.PI / 2 + N.n(x * 8, y * 8) * 0.8 : reg === 2 ? Math.PI / 2 + N.n(x * 4, y * 4) * 0.5 : N.n(x * 3, y * 3) * 2.5),
    detail: () => (reg === 1 ? 0.9 : reg === 5 || reg === 3 ? 0.6 : 0.15),
    size: () => (reg === 1 ? 0.7 : 1),
    age: 0.55,
  };
}

function stillLife(A, rng, o) {
  const N = seeded(rng);
  const P = pal({ bg: pick(rng, ['#2b2418', '#232519', '#2e1f17']), table: '#5a3a22', tableD: '#22150d', cloth: '#ece5d6', clothS: '#9c9487',
    copper: '#b56a36', copperD: '#401e0c', copperL: '#ffd9a6', jug: pick(rng, ['#e6dfcf', '#2f4d6a', '#56643a']), pewter: '#8f8f8a',
    lemon: '#e6bd2e', apple: '#ad2d25', apple2: '#86a03a', grape: '#3e2240', grapeL: '#a080ac', glass: '#22402b' });
  const tY = 0.6 + rng() * 0.04, eY = tY + 0.19;
  const copper = o.copper || rng() < 0.45;
  const Lx = -0.62, Ly = -0.55, Lz = 0.56;
  const lit = (nx, ny, nz) => clamp01(nx * Lx + ny * Ly + nz * Lz);
  const jug = { t: 'jug', x: A * (0.22 + rng() * 0.1), base: tY + 0.07, h: 0.4 + rng() * 0.06, r: 0.105 + rng() * 0.02, depth: 0 };
  const objs = [jug];
  if (rng() < 0.7) objs.push({ t: 'bottle', x: jug.x + 0.24 + rng() * 0.06, base: tY + 0.035, h: 0.44, r: 0.05, depth: -0.5 });
  const plate = { t: 'plate', x: A * (0.6 + rng() * 0.1), y: tY + 0.105, rx: 0.15, ry: 0.045, depth: 0.4 };
  objs.push(plate);
  const kinds = ['lemon', 'apple', 'apple2', 'apple', 'lemon'];
  for (let i = 0; i < 3; i++) objs.push({ t: pick(rng, kinds), x: plate.x + (i - 1) * 0.075 + (rng() - 0.5) * 0.02, base: plate.y + 0.012 + (rng() - 0.5) * 0.01, r: 0.042 + rng() * 0.012, depth: 0.5 + i * 0.01 });
  const front = 2 + Math.floor(rng() * 2);
  let lemonFront = null;
  for (let i = 0; i < front; i++) {
    const f = { t: i === 0 ? 'lemon' : pick(rng, kinds), x: A * (0.12 + (i + rng() * 0.8) / front * 0.76), base: eY - 0.012 - rng() * 0.035, r: 0.046 + rng() * 0.014, depth: 1 + rng() };
    if (i === 0) lemonFront = f;
    objs.push(f);
  }
  const gr = { t: 'grapes', x: plate.x + 0.13, base: plate.y + 0.035, r: 0.016, g: [], depth: 0.6 };
  for (let row = 0; row < 5; row++) for (let k = 0; k < 5 - row; k++) gr.g.push([gr.x + (k - (4 - row) / 2) * gr.r * 1.75 + (rng() - 0.5) * 0.004, gr.base - (4 - row) * gr.r * 1.55]);
  objs.push(gr);
  objs.sort((a, b) => a.depth - b.depth);
  const cloth = { x0: A * (0.02 + rng() * 0.05), w: A * (0.2 + rng() * 0.07) };
  let reg = 0, fa = 0;
  function sphere(x, y, ox, oy, r, base, hi) {
    const ux = (x - ox) / r, uy = (y - oy) / r, e = ux * ux + uy * uy;
    if (e >= 1) return null;
    const nz = Math.sqrt(1 - e);
    let c = mix(mul(base, 0.25), base, 0.2 + 0.9 * lit(ux, uy, nz));
    c = mix(c, mul(base, 0.55), sstep(0.55, 1, uy) * sstep(0, 0.6, ux) * 0.4);
    const hl = Math.hypot(ux + 0.38, uy + 0.4);
    if (hl < 0.2) c = mix(c, hi, (1 - hl / 0.2) * 0.9);
    fa = Math.atan2(uy, ux) + Math.PI / 2;
    return c;
  }
  function color(x, y) {
    reg = 0;
    let c = mix(mul(P.bg, 1.9), mul(P.bg, 0.7), clamp01(Math.hypot((x - A * 0.16) / A, y - 0.12) * 1.25));
    c = mul(c, 0.92 + 0.14 * N.f(x * 2.5, y * 2.5, 3));
    if (y > tY) {
      if (y < eY) {
        const k = (y - tY) / (eY - tY);
        c = mix(mul(P.table, 0.72), mul(P.table, 1.25), k * 0.55 + 0.2 * N.f(x * 1.5, y * 18, 3));
      } else {
        c = mix(P.tableD, mul(P.table, 0.65), 0.2 + 0.15 * N.n(x * 3, y * 20));
        if (y < eY + 0.012) c = mul(P.table, 1.45);
      }
      reg = 1;
      if (x > cloth.x0 && x < cloth.x0 + cloth.w) {
        const u = (x - cloth.x0) / cloth.w;
        if (y < eY) { c = mix(P.clothS, P.cloth, 0.55 + 0.35 * (1 - u) + 0.1 * N.n(x * 12, y * 30)); reg = 2; }
        else if (y < eY + 0.18 + 0.05 * Math.sin(u * 7)) {
          const fold = Math.sin(u * 17 + N.n(x * 5, 1) * 2);
          c = mix(P.clothS, P.cloth, clamp01(0.5 + 0.4 * fold - (y - eY) * 0.9));
          reg = 2;
        }
      }
      // тени от предметов на столе
      if (y < eY) for (const O of objs) {
        const oy = O.t === 'plate' ? O.y : O.base;
        const rr = O.t === 'plate' ? O.rx * 0.8 : O.t === 'grapes' ? 0.05 : O.r;
        const dx = (x - O.x - rr * 0.9) / (rr * 1.7), dy = (y - oy - 0.004) / 0.03;
        const dd = dx * dx + dy * dy;
        if (dd < 1) c = mul(c, 0.55 + 0.45 * dd);
      }
    }
    for (const O of objs) {
      let oc = null;
      if (O.t === 'jug' || O.t === 'bottle') {
        const t = (O.base - y) / O.h;
        if (t < -0.01 || t > 1) continue;
        let r;
        if (O.t === 'jug') r = t < 0.62 ? O.r * (0.62 + 0.38 * Math.sin(Math.PI * Math.min(1, (t + 0.08) / 0.7))) : t < 0.84 ? O.r * (0.5 - (t - 0.62) * 0.6) : O.r * (0.37 + (t - 0.84) * 1.4);
        else r = t < 0.58 ? O.r : t < 0.72 ? O.r * (1 - (t - 0.58) * 4.8) : O.r * 0.33;
        const ux = (x - O.x) / r;
        if (Math.abs(ux) >= 1) continue;
        const nz = Math.sqrt(1 - ux * ux);
        const d = lit(ux, -0.12, nz);
        if (O.t === 'bottle') {
          oc = mix(mul(P.glass, 0.35), P.glass, 0.3 + 0.9 * d);
          if (Math.abs(ux + 0.5) < 0.1 && t > 0.1) oc = mix(oc, hex('#e9f4e6'), 0.75);
          if (Math.abs(ux - 0.55) < 0.07 && t > 0.2 && t < 0.55) oc = mix(oc, hex('#9ac08a'), 0.35);
        } else if (copper) {
          oc = mix(P.copperD, P.copper, 0.15 + 1.0 * d);
          oc = mix(oc, P.copperL, sstep(0.74, 0.92, d) * 0.85);
          oc = mix(oc, mul(P.copperD, 0.7), sstep(0.5, 0.85, ux) * 0.55);
          oc = mix(oc, hex('#e0a070'), Math.exp(-Math.pow((ux - 0.62) / 0.08, 2)) * 0.35);
          if (Math.abs(t - 0.62) < 0.012 || Math.abs(t - 0.84) < 0.01) oc = mul(oc, 0.7);
        } else {
          oc = mix(mul(P.jug, 0.32), P.jug, 0.22 + 0.9 * d);
          if (Math.abs(ux + 0.42) < 0.09 && t > 0.15 && t < 0.6) oc = mix(oc, hex('#ffffff'), 0.55);
        }
        reg = 3; fa = Math.PI / 2;
      } else if (O.t === 'plate') {
        const ux = (x - O.x) / O.rx, uy = (y - O.y) / O.ry;
        const e = ux * ux + uy * uy;
        if (e < 1) {
          oc = mix(mul(P.pewter, 0.5), mul(P.pewter, 1.3), clamp01(0.5 - ux * 0.35 - uy * 0.25));
          if (e > 0.7) oc = mul(oc, 1.2 - (e - 0.7));
          reg = 3; fa = 0;
        }
      } else if (O.t === 'grapes') {
        for (let k = O.g.length - 1; k >= 0 && !oc; k--) oc = sphere(x, y, O.g[k][0], O.g[k][1], O.r, P.grape, P.grapeL);
        if (oc) reg = 4;
      } else {
        const base = O.t === 'lemon' ? P.lemon : O.t === 'apple' ? P.apple : P.apple2;
        const oy = O.base - O.r * (O.t === 'lemon' ? 0.72 : 0.92);
        if (O.t === 'lemon') oc = sphere(O.x + (x - O.x) * 0.72, y, O.x, oy, O.r * 0.78, base, hex('#fff7cf'));
        else oc = sphere(x, y, O.x, oy, O.r, base, hex('#ffeede'));
        if (oc) reg = 4;
      }
      if (oc) c = oc;
    }
    return c;
  }
  function post(ctx) {
    ctx.lineCap = 'round';
    // ручка и носик кувшина
    ctx.strokeStyle = copper ? '#5e2e12' : rgb(mul(P.jug, 0.55));
    ctx.lineWidth = 0.02;
    ctx.beginPath(); ctx.moveTo(jug.x + jug.r * 0.42, jug.base - jug.h * 0.8);
    ctx.bezierCurveTo(jug.x + jug.r * 1.55, jug.base - jug.h * 0.86, jug.x + jug.r * 1.5, jug.base - jug.h * 0.38, jug.x + jug.r * 0.86, jug.base - jug.h * 0.3); ctx.stroke();
    ctx.fillStyle = copper ? '#a45a2a' : rgb(mul(P.jug, 0.85));
    ctx.beginPath(); ctx.moveTo(jug.x - jug.r * 0.42, jug.base - jug.h * 0.985); ctx.lineTo(jug.x - jug.r * 0.9, jug.base - jug.h * 1.03); ctx.lineTo(jug.x - jug.r * 0.36, jug.base - jug.h * 0.9); ctx.closePath(); ctx.fill();
    // нож через край стола
    ctx.save();
    ctx.translate(plate.x - 0.1, tY + 0.13); ctx.rotate(0.5 + rng() * 0.2);
    ctx.fillStyle = '#bdbdb6'; ctx.fillRect(0, -0.006, 0.13, 0.012);
    ctx.fillStyle = '#f4f4ef'; ctx.fillRect(0.01, -0.006, 0.11, 0.003);
    ctx.fillStyle = '#3a2416'; ctx.fillRect(0.13, -0.008, 0.075, 0.016);
    ctx.restore();
    // лимонная корка спиралью свисает со стола
    if (lemonFront) {
      const lx = lemonFront.x + lemonFront.r * 0.4;
      ctx.lineWidth = 0.013; ctx.strokeStyle = '#e2b92e';
      ctx.beginPath(); ctx.moveTo(lx, eY - 0.01);
      for (let i = 1; i <= 26; i++) { const t = i / 26; ctx.lineTo(lx + Math.sin(t * 10) * 0.028 * (1 - t * 0.3), eY + t * 0.15); }
      ctx.stroke();
      ctx.lineWidth = 0.004; ctx.strokeStyle = 'rgba(250,244,220,0.8)';
      ctx.beginPath(); ctx.moveTo(lx + 0.004, eY - 0.008);
      for (let i = 1; i <= 26; i++) { const t = i / 26; ctx.lineTo(lx + 0.004 + Math.sin(t * 10) * 0.028 * (1 - t * 0.3), eY + t * 0.15 + 0.002); }
      ctx.stroke();
    }
  }
  return {
    color, post,
    flow: (x, y) => (reg === 3 || reg === 4 ? fa : reg === 1 ? 0 : reg === 2 ? Math.PI / 2 : N.n(x * 3, y * 3) * 2.5),
    detail: () => (reg === 4 ? 1 : reg === 3 ? 0.85 : reg === 2 ? 0.5 : 0.15),
    size: () => (reg === 4 ? 0.8 : 1),
    age: 0.5,
  };
}

function flowers(A, rng) {
  const N = seeded(rng);
  const P = pal({ bg: pick(rng, ['#1d2016', '#261c16', '#15191d']), leaf: '#2f4a24', leafL: '#6f8a3a', vase: pick(rng, ['#b9c4c0', '#3a4a6a', '#8a5a3a', '#d8d0c0']), table: '#3a2a1a' });
  const sets = [['#e8a0b0', '#f4f0e8', '#c0304a', '#f0c8d0'], ['#f4f2ea', '#e8d070', '#c05a3a', '#fff'], ['#b090c8', '#e8e0f0', '#6a4a8a', '#f0a0c0'], ['#e0403a', '#f0a030', '#f4f0e0', '#8a1a2a']];
  const cols = pick(rng, sets).map(hex);
  const vx = A / 2 + (rng() - 0.5) * 0.08, vBase = 0.9, vH = 0.24, vR = 0.09;
  const bx = vx, by = 0.42, brx = A * 0.36, bry = 0.3;
  const blooms = [];
  for (let i = 0; i < 40 && blooms.length < 18; i++) {
    const a = rng() * Math.PI * 2, rr = Math.sqrt(rng());
    const x = bx + Math.cos(a) * brx * rr, y = by + Math.sin(a) * bry * rr;
    const r = 0.035 + rng() * 0.035;
    if (blooms.some((b) => Math.hypot(b.x - x, b.y - y) < (b.r + r) * 0.7)) continue;
    blooms.push({ x, y, r, c: pick(rng, cols), petals: 5 + Math.floor(rng() * 4), ph: rng() * 6, depth: rng() });
  }
  blooms.sort((a, b) => a.depth - b.depth);
  let reg = 0, fa = 0;
  function color(x, y) {
    reg = 0;
    let c = mix(mul(P.bg, 1.8), P.bg, clamp01(Math.hypot(x - A * 0.25, y - 0.25) * 1.4));
    if (y > vBase) { c = mix(P.table, mul(P.table, 0.6), (y - vBase) * 8); reg = 1; }
    // листья
    const lf = N.f(x * 7, y * 7, 3) + 0.35 - Math.hypot((x - bx) / (brx * 1.15), (y - by) / (bry * 1.15)) * 0.55;
    if (lf > 0.12 && y < vBase - vH * 0.6) { c = mix(P.leaf, P.leafL, sstep(-0.2, 0.5, N.n(x * 20, y * 20) - (x - bx) * 2)); reg = 2; fa = N.n(x * 10, y * 10) * 3; }
    // стебли
    if (y > by + bry * 0.4 && y < vBase - vH && Math.abs(x - vx - Math.sin(y * 30) * 0.01) < 0.05 && N.n(x * 90, 3) > 0.1) { c = P.leaf; reg = 2; fa = Math.PI / 2; }
    // ваза
    const t = (vBase - y) / vH;
    if (t > 0 && t < 1) {
      const r = vR * (t < 0.8 ? 0.7 + 0.3 * Math.sin(Math.PI * t / 0.8) : 0.55 + (t - 0.8) * 1.2);
      const ux = (x - vx) / r;
      if (Math.abs(ux) < 1) {
        const nz = Math.sqrt(1 - ux * ux);
        c = mix(mul(P.vase, 0.3), P.vase, clamp01(-ux * 0.5 + nz * 0.7));
        if (Math.abs(ux + 0.45) < 0.1) c = mix(c, hex('#ffffff'), 0.6);
        reg = 3; fa = Math.PI / 2;
      }
    }
    for (const B of blooms) {
      const dx = x - B.x, dy = y - B.y, d = Math.hypot(dx, dy);
      if (d > B.r) continue;
      const a = Math.atan2(dy, dx);
      const petal = 0.75 + 0.25 * Math.cos(a * B.petals + B.ph);
      if (d > B.r * petal) continue;
      const k = d / (B.r * petal);
      c = mix(mul(B.c, 1.05), mul(B.c, 0.55), k * 0.7 + (dx + dy) / B.r * 0.2);
      if (k < 0.22) c = mix(hex('#e8c040'), mul(B.c, 0.5), 0.5);
      reg = 4; fa = a + Math.PI / 2;
    }
    return c;
  }
  return {
    color,
    flow: (x, y) => (reg ? fa : N.n(x * 3, y * 3) * 3),
    detail: () => (reg === 4 ? 1 : reg === 3 ? 0.7 : reg === 2 ? 0.5 : 0.1),
    layers: 'dabs',
    size: () => (reg === 4 ? 0.8 : 1),
    age: 0.45,
  };
}

function garden(A, rng, o) {
  const N = seeded(rng);
  const kind = o.kind || pick(rng, ['pond', 'poppies', 'pond']);
  let reg = 0;
  if (kind === 'poppies') {
    const P = pal({ sky: '#9fb8d8', sky2: '#e8e4d8', cloud: '#fbf8f0', trees: '#3f5a3a', trees2: '#6f8a4a', grass: '#7a9a48', grass2: '#b8c070', red: '#d8342a', red2: '#f0703a' });
    const hz = 0.36 + rng() * 0.1;
    return {
      color(x, y) {
        reg = 0;
        if (y < hz) {
          let c = mix(P.sky, P.sky2, y / hz);
          c = mix(c, P.cloud, sstep(0.05, 0.35, N.f(x * 2, y * 5, 4)) * 0.8);
          const tl = hz - 0.04 - 0.06 * (0.5 + N.f(x * 4, 3.1, 3));
          if (y > tl) { c = mix(P.trees, P.trees2, sstep(-0.3, 0.5, N.n(x * 18, y * 18))); reg = 1; }
          return c;
        }
        reg = 2;
        const g = (y - hz) / (1 - hz);
        let c = mix(P.grass2, P.grass, sstep(-0.2, 0.4, N.f(x * 4, y * 8, 3)));
        const p = N.f(x * 5 / (0.2 + g), y * 12, 3) + 0.08;
        if (p > 0.1 && N.n(x * 140, y * 140) > 0.15 - g * 0.3) { c = mix(P.red, P.red2, sstep(-0.3, 0.5, N.n(x * 60, y * 60))); reg = 3; }
        return c;
      },
      flow: (x, y) => (reg === 0 ? N.n(x * 3, y * 3) : N.n(x * 9, y * 9) * 3),
      detail: () => (reg === 3 ? 0.9 : 0.4),
      layers: 'dabs', age: 0.25,
    };
  }
  const P = pal({ water: '#3f6878', water2: '#86a9b8', sky: '#d3dde8', lilac: '#a894b8', dark: '#284636', willow: '#3a5a36', willow2: '#6f8f4a',
    pad: '#46743a', pad2: '#8cb25c', pink: '#f2a6bf', white: '#f8f4ec', bank: '#2f4a2a' });
  const pads = [];
  for (let i = 0; i < 38; i++) {
    const y = 0.2 + Math.pow(rng(), 0.7) * 0.82;
    pads.push({ x: rng() * A, y, r: 0.012 + (y - 0.15) * 0.08 + rng() * 0.01, notch: rng() * Math.PI * 2, fl: rng() < 0.35 ? pick(rng, [P.pink, P.white, P.pink]) : null });
  }
  pads.sort((a, b) => a.y - b.y);
  return {
    color(x, y) {
      reg = 0;
      // мягкие вертикальные отражения неба и деревьев, поверх — горизонтальная рябь
      const v = N.f(x * 2.2, y * 0.5, 3);
      let c = mix(P.water, P.water2, sstep(-0.3, 0.45, v) * 0.7);
      c = mix(c, P.lilac, sstep(0.0, 0.4, N.f(x * 1.6 + 5, y * 0.9, 3)) * 0.35);
      c = mix(c, P.dark, sstep(0.1, 0.45, N.f(x * 1.3 + 9, y * 0.6, 2)) * 0.45 * (1 - y * 0.6));
      const rip = N.n(x * 6, y * 70);
      c = mix(c, P.sky, sstep(0.35, 0.75, rip) * 0.45);
      c = mix(c, mul(P.water, 0.7), sstep(0.35, 0.75, -rip) * 0.3);
      const wl = N.f(x * 2.5, 0.5, 3);
      if (y < 0.1 + 0.1 * wl) { c = mix(P.willow, P.willow2, sstep(-0.3, 0.5, N.n(x * 16, y * 16))); reg = 3; }
      for (const p of pads) {
        const dx = x - p.x, dy = (y - p.y) / 0.34;
        const d = Math.hypot(dx, dy) / p.r;
        if (d < 1) {
          const a = Math.atan2(dy, dx);
          let da = Math.abs(((a - p.notch + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
          if (da > 2.9 && d > 0.15) continue;
          c = mix(P.pad, P.pad2, sstep(-0.4, 0.6, N.n(x * 50, y * 50) - dx / p.r * 0.5 - dy / p.r * 0.2));
          if (d > 0.86) c = mul(c, 0.8);
          reg = 2;
          if (p.fl && Math.hypot(dx / (p.r * 0.36), (y - p.y + p.r * 0.1) / (p.r * 0.22)) < 1) { c = mix(p.fl, hex('#fff4e0'), sstep(-0.2, 0.6, N.n(x * 90, y * 90)) * 0.4); reg = 4; }
        }
      }
      return c;
    },
    flow: (x, y) => (reg === 0 ? N.n(x * 4, y * 4) * 0.25 : reg === 2 ? N.n(x * 9, y * 9) * 0.5 : N.n(x * 8, y * 8) * 3),
    detail: () => (reg === 4 ? 1 : reg === 2 ? 0.6 : 0.3),
    layers: 'dabs', age: 0.2,
  };
}

function colorField(A, rng) {
  const N = seeded(rng);
  const sets = [
    ['#7a2a1e', '#c8602a', '#2a1410', '#e0a040'], ['#1e2a4a', '#3a5a8a', '#0e1424', '#6a8ab0'], ['#4a1a2a', '#a02a3a', '#e07a3a', '#2a0e14'],
    ['#c8a040', '#e8d8a8', '#8a3a1e', '#f0e8d0'], ['#1a2a24', '#3a6a4a', '#0a1410', '#a8c890'],
  ];
  const cs = pick(rng, sets).map(hex);
  const ground = cs[0];
  const n = 2 + (rng() < 0.4 ? 1 : 0);
  const rects = [];
  const m = 0.07, gap = 0.05;
  const hs = [];
  let tot = 0;
  for (let i = 0; i < n; i++) { const h = 0.5 + rng(); hs.push(h); tot += h; }
  let y = m;
  for (let i = 0; i < n; i++) {
    const h = (1 - 2 * m - gap * (n - 1)) * hs[i] / tot;
    rects.push({ y0: y, y1: y + h, c: cs[1 + (i % 3)] });
    y += h + gap;
  }
  return {
    color(x, yy) {
      let c = mul(ground, 0.9 + 0.2 * N.f(x * 3, yy * 3, 3));
      for (const R of rects) {
        const ex = Math.min(x - m * 0.8, A - m * 0.8 - x), ey = Math.min(yy - R.y0, R.y1 - yy);
        const w = 0.018 * (1 + 0.6 * N.n(x * 9, yy * 9));
        const k = sstep(-w, w, Math.min(ex, ey));
        if (k > 0) c = mix(c, mul(R.c, 0.92 + 0.14 * N.f(x * 2, yy * 8, 3)), k * 0.94);
      }
      return c;
    },
    flow: (x, y) => N.n(x * 2, y * 2) * 0.15,
    detail: () => 0.2,
    layers: 'smooth', age: 0, under: true,
  };
}

function suprem(A, rng, o) {
  const cols = ['#141414', '#c8281e', '#1f3f8a', '#e8b020', '#2a6a3a', '#e89aa0', '#8a4a2a', '#141414', '#c8281e'].map(hex);
  const base = -0.25 - rng() * 0.35;
  const shapes = [];
  const n = (o.rich ? 11 : 6) + Math.floor(rng() * 6);
  // крупная доминанта
  shapes.push({ x: A * (0.35 + rng() * 0.3), y: 0.3 + rng() * 0.35, w: 0.22 + rng() * 0.2, h: 0.12 + rng() * 0.18, a: base, c: pick(rng, [cols[0], cols[1], cols[2]]), circle: rng() < 0.18 });
  for (let i = 0; i < n; i++) {
    const thin = rng() < 0.55;
    shapes.push({ x: A * (0.12 + rng() * 0.76), y: 0.1 + rng() * 0.8, w: thin ? 0.12 + rng() * 0.35 : 0.05 + rng() * 0.14, h: thin ? 0.008 + rng() * 0.02 : 0.03 + rng() * 0.08,
      a: base + (rng() < 0.25 ? Math.PI / 2 : 0) + (rng() - 0.5) * 0.15, c: pick(rng, cols), circle: !thin && rng() < 0.12 });
  }
  return {
    vector(ctx) {
      const N = seeded(rng);
      ctx.fillStyle = '#e9e3d3';
      ctx.fillRect(0, 0, A, 1);
      // лёгкие мазки по фону
      ctx.lineCap = 'round';
      for (let i = 0; i < 260; i++) {
        const x = rng() * A, y = rng();
        ctx.globalAlpha = 0.18;
        ctx.strokeStyle = rgb(mul(hex('#e6dfcd'), 0.94 + rng() * 0.1));
        ctx.lineWidth = 0.03 + rng() * 0.03;
        const a = N.n(x * 2, y * 2) * 2;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * 0.08, y + Math.sin(a) * 0.08); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      for (const S of shapes) {
        ctx.save();
        ctx.translate(S.x, S.y); ctx.rotate(S.a);
        ctx.fillStyle = rgb(S.c);
        ctx.beginPath();
        if (S.circle) ctx.arc(0, 0, S.h * 1.1, 0, Math.PI * 2);
        else ctx.rect(-S.w / 2, -S.h / 2, S.w, S.h);
        ctx.fill();
        // фактура плоскости: продольные мазки чуть другого тона
        ctx.clip();
        ctx.lineCap = 'round';
        const L = S.circle ? S.h * 2.2 : S.w;
        for (let k = 0; k < 18; k++) {
          ctx.globalAlpha = 0.14;
          ctx.strokeStyle = rgb(mul(S.c, 0.85 + rng() * 0.3));
          ctx.lineWidth = Math.max(0.006, (S.circle ? S.h : S.h) * 0.35);
          const yy = (rng() - 0.5) * (S.circle ? S.h * 2 : S.h);
          ctx.beginPath(); ctx.moveTo(-L / 2, yy); ctx.lineTo(L / 2, yy + (rng() - 0.5) * 0.01); ctx.stroke();
        }
        ctx.restore();
        ctx.globalAlpha = 1;
      }
    },
    age: 0.12,
  };
}

const GENRES = { landscape, winter, sea, moon: moonNight, portrait, still: stillLife, flowers, garden, field: colorField, suprem };

// ---------- постобработка ----------
let GRAIN = null;
function grain() {
  if (GRAIN) return GRAIN;
  GRAIN = cpuCanvas(128, 128);
  const g = GRAIN.getContext('2d');
  const id = g.createImageData(128, 128);
  const r = mulberry32(99);
  for (let i = 0; i < 128 * 128; i++) {
    const v = 110 + r() * 36;
    id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255;
  }
  g.putImageData(id, 0, 0);
  return GRAIN;
}

function underpaint(ctx, A, G) {
  const c = cpuCanvas(G.gw, G.gh);
  const g = c.getContext('2d');
  const id = g.createImageData(G.gw, G.gh);
  for (let k = 0; k < G.gw * G.gh; k++) {
    id.data[k * 4] = G.col[k * 3]; id.data[k * 4 + 1] = G.col[k * 3 + 1]; id.data[k * 4 + 2] = G.col[k * 3 + 2]; id.data[k * 4 + 3] = 255;
  }
  g.putImageData(id, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(c, 0, 0, A, 1);
}

function signature(ctx, A, rng, dark) {
  ctx.save();
  const x = rng() < 0.7 ? A - 0.05 - rng() * 0.08 : 0.04 + rng() * 0.05, y = 0.95 - rng() * 0.02;
  ctx.strokeStyle = dark ? 'rgba(40,20,14,0.75)' : 'rgba(230,220,200,0.6)';
  ctx.lineWidth = 0.0035; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, y);
  let px = x, py = y;
  for (let i = 0; i < 7; i++) {
    const nx = px + 0.006 + rng() * 0.006, ny = y + (rng() - 0.5) * 0.012;
    ctx.quadraticCurveTo(px + 0.003, py - 0.012 * (rng() + 0.3), nx, ny);
    px = nx; py = ny;
  }
  ctx.stroke();
  ctx.restore();
}

// ---------- главная функция ----------
// steps(spec) — пошаговая генерация (для планировщика кадров); generate(spec) — всё сразу.
function* steps(spec, target) {
  const A = spec.aspect;
  const rng = mulberry32((spec.seed >>> 0) || 1);
  const Z = spec.size || SIZE;
  const cv = target || cpuCanvas(Z, Z);
  if (cv.width !== Z) cv.width = Z;
  if (cv.height !== Z) cv.height = Z;
  const ctx = cv.getContext('2d');
  ctx.setTransform(Z / A, 0, 0, Z, 0, 0);
  const S = GENRES[spec.genre](A, rng, spec.opts || {});
  const q = spec.quality == null ? 0.8 : spec.quality;
  if (S.vector) S.vector(ctx);
  else {
    const gh = 48, gw = Math.max(12, Math.round(48 * A));
    const G = evalGrid(S, A, gw, gh);
    yield;
    underpaint(ctx, A, G);
    const layers = (LAYERS[S.layers || 'base'])(q);
    yield* paintLayers(ctx, A, S, G, rng, layers);
    if (S.post) S.post(ctx);
  }
  // зерно холста
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.22;
  ctx.drawImage(grain(), 0, 0, Z, Z);
  ctx.globalAlpha = 1;
  ctx.setTransform(Z / A, 0, 0, Z, 0, 0);
  // лак: чем старше, тем теплее и темнее
  const age = (S.age || 0) * (0.7 + rng() * 0.6);
  if (age > 0.01) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = 'rgba(255,226,170,' + (age * 0.55).toFixed(3) + ')';
    ctx.fillRect(0, 0, A, 1);
  }
  // потемнение по краям под фальцем рамы
  ctx.globalCompositeOperation = 'multiply';
  const grd = ctx.createRadialGradient(A / 2, 0.5, 0.25, A / 2, 0.5, Math.max(A, 1) * 0.75);
  grd.addColorStop(0, 'rgba(255,255,255,0)');
  grd.addColorStop(1, 'rgba(120,100,80,' + (0.25 + age * 0.3).toFixed(3) + ')');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, A, 1);
  ctx.globalCompositeOperation = 'source-over';
  if (spec.opts && spec.opts.restore) {
    // реставрационная пробная расчистка: половина — под старым тёмным лаком
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = 'rgba(150,110,50,0.55)';
    const cut = A * (0.4 + rng() * 0.2);
    ctx.beginPath(); ctx.moveTo(cut, 0); ctx.lineTo(A, 0); ctx.lineTo(A, 1); ctx.lineTo(cut - 0.08, 1); ctx.closePath(); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
  if (!S.vector && spec.genre !== 'field') signature(ctx, A, rng, spec.genre !== 'moon');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return cv;
}
function generate(spec, target) {
  const it = steps(spec, target);
  let r = it.next();
  while (!r.done) r = it.next();
  return r.value;
}

// миниатюра с правильными пропорциями
function thumb(src, aspect, h, dpr) {
  const H = Math.round(h * (dpr || 1)), W = Math.round(H * aspect);
  const c = cpuCanvas(W, H);
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, 0, 0, W, H);
  return c;
}

NM.Paint = { SIZE, generate, steps, thumb, noise, fbm, mulberry32, GENRES, cpuCanvas };
})(typeof window !== 'undefined' ? window : globalThis);
