'use strict';
/* ==========================================================================
   Кот-фонарщик · paper.js
   Бумажная мастерская: шум, цвет, формы, неровный край ножниц и рваный край,
   фактура бумаги, «выпечка» фигурок в растровые спрайты с мягкой тенью.
   ========================================================================== */

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sat = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, k) => a + (b - a) * k;
const sstep = (a, b, v) => { const k = sat((v - a) / (b - a)); return k * k * (3 - 2 * k); };

/* ---------- детерминированный шум ---------- */
function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function hash1(i, seed) {
  let x = Math.imul(i | 0, 374761393) ^ Math.imul((seed | 0) + 0x9e3779b9, 668265263);
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}
function hash2(i, j, seed) { return hash1(Math.imul(i | 0, 73856093) ^ Math.imul(j | 0, 19349663), seed); }
function noise1(x, seed) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return lerp(hash1(i, seed), hash1(i + 1, seed), u);
}
function fbm1(x, seed, oct = 3) {
  let s = 0, a = 1, n = 0, f = 1;
  for (let o = 0; o < oct; o++) { s += a * noise1(x * f, seed + o * 131); n += a; a *= 0.5; f *= 2.07; }
  return s / n;
}
/* периодический 2D-шум: для бесшовных плиток фактуры */
function noise2p(x, y, P, seed) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const m = (v) => ((v % P) + P) % P;
  const a = hash2(m(i), m(j), seed), b = hash2(m(i + 1), m(j), seed);
  const c = hash2(m(i), m(j + 1), seed), d = hash2(m(i + 1), m(j + 1), seed);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy);
}
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- цвет ---------- */
const HEXC = new Map();
function col(c) {
  if (typeof c !== 'string') return c;
  let v = HEXC.get(c);
  if (!v) { const n = parseInt(c.slice(1), 16); v = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; HEXC.set(c, v); }
  return v;
}
function rgba(c, a = 1) { c = col(c); return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`; }
function mixc(a, b, k) { a = col(a); b = col(b); return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)]; }
/* затемнение к тёплой тьме, осветление к тёплой бумаге — не к чистым #000/#fff */
function shade(c, k) { return k < 0 ? mixc(c, [22, 14, 30], -k) : mixc(c, [255, 249, 234], k); }

/* ---------- формы: массив многоугольников [x0,y0,x1,y1,…] ---------- */
function parsePath(d) {
  const tk = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) || [];
  const polys = [];
  let i = 0, cmd = 'M', x = 0, y = 0, sx = 0, sy = 0, lcx = 0, lcy = 0, cur = null, prev = '';
  const num = () => parseFloat(tk[i++]);
  const push = (px, py) => { if (!cur) { cur = [x, y]; polys.push(cur); } cur.push(px, py); };
  const cubic = (x1, y1, x2, y2, x3, y3) => {
    const L = Math.hypot(x1 - x, y1 - y) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(x3 - x2, y3 - y2);
    const n = clamp(Math.ceil(L / 2.2), 3, 48);
    for (let k = 1; k <= n; k++) {
      const t = k / n, u = 1 - t;
      push(u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
           u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3);
    }
  };
  while (i < tk.length) {
    if (/[a-zA-Z]/.test(tk[i])) cmd = tk[i++];
    const rel = cmd !== cmd.toUpperCase(), C = cmd.toUpperCase();
    const ox = rel ? x : 0, oy = rel ? y : 0;
    if (C === 'M') {
      x = num() + ox; y = num() + oy; sx = x; sy = y; cur = [x, y]; polys.push(cur);
      cmd = rel ? 'l' : 'L'; lcx = x; lcy = y;
    } else if (C === 'L') { const nx = num() + ox, ny = num() + oy; push(nx, ny); x = nx; y = ny; lcx = x; lcy = y; }
    else if (C === 'H') { const nx = num() + ox; push(nx, y); x = nx; lcx = x; lcy = y; }
    else if (C === 'V') { const ny = num() + oy; push(x, ny); y = ny; lcx = x; lcy = y; }
    else if (C === 'C' || C === 'S') {
      let x1, y1;
      if (C === 'C') { x1 = num() + ox; y1 = num() + oy; }
      else if (prev === 'C' || prev === 'S') { x1 = 2 * x - lcx; y1 = 2 * y - lcy; }
      else { x1 = x; y1 = y; }
      const x2 = num() + ox, y2 = num() + oy, x3 = num() + ox, y3 = num() + oy;
      cubic(x1, y1, x2, y2, x3, y3); x = x3; y = y3; lcx = x2; lcy = y2;
    } else if (C === 'Q' || C === 'T') {
      let qx, qy;
      if (C === 'Q') { qx = num() + ox; qy = num() + oy; }
      else if (prev === 'Q' || prev === 'T') { qx = 2 * x - lcx; qy = 2 * y - lcy; }
      else { qx = x; qy = y; }
      const x3 = num() + ox, y3 = num() + oy;
      cubic(x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), x3 + (2 / 3) * (qx - x3), y3 + (2 / 3) * (qy - y3), x3, y3);
      x = x3; y = y3; lcx = qx; lcy = qy;
    } else if (C === 'Z') { x = sx; y = sy; cur = null; lcx = x; lcy = y; }
    else { i++; }
    prev = C;
  }
  return polys.filter((p) => p.length >= 6);
}
function ell(cx, cy, rx, ry, rot = 0, n = 0) {
  n = n || clamp(Math.ceil((rx + ry) * 0.9), 14, 120);
  const p = [], c = Math.cos(rot), s = Math.sin(rot);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU, ex = Math.cos(a) * rx, ey = Math.sin(a) * ry;
    p.push(cx + ex * c - ey * s, cy + ex * s + ey * c);
  }
  return [p];
}
function rect(x, y, w, h) { return [[x, y, x + w, y, x + w, y + h, x, y + h]]; }
function rrect(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  const p = [], seg = 6;
  const arc = (cx, cy, a0) => { for (let k = 0; k <= seg; k++) { const a = a0 + (k / seg) * (Math.PI / 2); p.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } };
  arc(x + w - r, y + r, -Math.PI / 2); arc(x + w - r, y + h - r, 0); arc(x + r, y + h - r, Math.PI / 2); arc(x + r, y + r, Math.PI);
  return [p];
}
/* сужающаяся «сосиска» конечности от (x0,y0) до (x1,y1) */
function limb(x0, y0, x1, y1, w0, w1) {
  const a = Math.atan2(y1 - y0, x1 - x0), r0 = w0 / 2, r1 = w1 / 2, p = [], n = 9;
  for (let k = 0; k <= n; k++) { const t = a - Math.PI / 2 + (k / n) * Math.PI; p.push(x1 + Math.cos(t) * r1, y1 + Math.sin(t) * r1); }
  for (let k = 0; k <= n; k++) { const t = a + Math.PI / 2 + (k / n) * Math.PI; p.push(x0 + Math.cos(t) * r0, y0 + Math.sin(t) * r0); }
  return [p];
}
function poly(...pts) { return [pts]; }
function xformS(shape, a, b, c, d, e, f) {
  return shape.map((p) => { const q = new Array(p.length); for (let k = 0; k < p.length; k += 2) { q[k] = a * p[k] + c * p[k + 1] + e; q[k + 1] = b * p[k] + d * p[k + 1] + f; } return q; });
}
function moveS(s, dx, dy) { return xformS(s, 1, 0, 0, 1, dx, dy); }
function scaleS(s, sx, sy = sx, cx = 0, cy = 0) { return xformS(s, sx, 0, 0, sy, cx - cx * sx, cy - cy * sy); }
function rotS(s, ang, cx = 0, cy = 0) { const c = Math.cos(ang), n = Math.sin(ang); return xformS(s, c, n, -n, c, cx - c * cx + n * cy, cy - n * cx - c * cy); }
function sbounds(shape) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of shape) for (let k = 0; k < p.length; k += 2) {
    if (p[k] < x0) x0 = p[k]; if (p[k] > x1) x1 = p[k]; if (p[k + 1] < y0) y0 = p[k + 1]; if (p[k + 1] > y1) y1 = p[k + 1];
  }
  return [x0, y0, x1, y1];
}
function shapeOf(s) { return typeof s === 'string' ? parsePath(s) : s; }

/* равномерная перенарезка замкнутого контура */
function resample(p, step) {
  const n = p.length >> 1, out = [];
  let carry = 0;
  for (let i = 0; i < n; i++) {
    const x0 = p[2 * i], y0 = p[2 * i + 1], j = (i + 1) % n, x1 = p[2 * j], y1 = p[2 * j + 1];
    const L = Math.hypot(x1 - x0, y1 - y0);
    let s = carry;
    while (s < L) { const k = s / L; out.push(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k); s += step; }
    carry = s - L;
  }
  return out.length < 6 ? p.slice() : out;
}
function area2(p) { let a = 0; const n = p.length >> 1; for (let i = 0; i < n; i++) { const j = (i + 1) % n; a += p[2 * i] * p[2 * j + 1] - p[2 * j] * p[2 * i + 1]; } return a; }

/* Неровный край: смещение по нормали — медленная «волна ножниц» + мелкие волокна. bias > 0 раздувает контур. */
const EDGE = {
  cut: { step: 1.5, amp: 0.55, freq: 0.05, fib: 0.1 },
  fine: { step: 0.8, amp: 0.2, freq: 0.1, fib: 0.05 },
  torn: { step: 1.1, amp: 1.5, freq: 0.1, fib: 0.5 },
  soft: { step: 1.0, amp: 0.3, freq: 0.14, fib: 0.16 },
  clean: null,
};
function roughen(shape, o) {
  const step = o.step || 1.5, amp = o.amp ?? 0.5, freq = o.freq || 0.05, fib = o.fib ?? 0.1, bias = o.bias || 0, seed = o.seed || 1;
  return shape.map((p0, pi) => {
    const p = resample(p0, step), n = p.length >> 1, sg = area2(p) > 0 ? 1 : -1, out = new Array(p.length);
    const sd = seed + pi * 977;
    for (let k = 0; k < n; k++) {
      const a = ((k - 1 + n) % n) * 2, b = ((k + 1) % n) * 2;
      let tx = p[b] - p[a], ty = p[b + 1] - p[a + 1];
      const L = Math.hypot(tx, ty) || 1; tx /= L; ty /= L;
      const nx = ty * sg, ny = -tx * sg;
      const off = bias + amp * (fbm1(k * step * freq, sd, 2) - 0.5) * 2.2 + fib * (hash1(k, sd + 7) - 0.5) * 2;
      out[2 * k] = p[2 * k] + nx * off; out[2 * k + 1] = p[2 * k + 1] + ny * off;
    }
    return out;
  });
}
/* дрожащая открытая линия (для штрихов кистью и нитей) */
function wobble(pts, amp, freq, seed, step = 1.2) {
  const out = [];
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const x0 = pts[i], y0 = pts[i + 1], x1 = pts[i + 2], y1 = pts[i + 3], L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(L / step));
    const nx = -(y1 - y0) / (L || 1), ny = (x1 - x0) / (L || 1);
    for (let k = 0; k < n; k++) {
      const t = k / n, s = (i * 50 + k) * 0.37;
      const o = amp * (noise1(s * freq * 3, seed) - 0.5) * 2;
      out.push(x0 + (x1 - x0) * t + nx * o, y0 + (y1 - y0) * t + ny * o);
    }
  }
  out.push(pts[pts.length - 2], pts[pts.length - 1]);
  return out;
}
function traceS(ctx, shape) {
  ctx.beginPath();
  for (const p of shape) { ctx.moveTo(p[0], p[1]); for (let k = 2; k < p.length; k += 2) ctx.lineTo(p[k], p[k + 1]); ctx.closePath(); }
}
function traceL(ctx, pts) { ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let k = 2; k < pts.length; k += 2) ctx.lineTo(pts[k], pts[k + 1]); }
/* soft = холст для выпечки: растр на процессоре (willReadFrequently). Тысячи мелких
   заливок с обрезкой и размытием тени CPU-растр делает быстрее, чем GPU с его накладными
   расходами на каждую операцию; готовый спрайт один раз уходит в текстуру основного холста. */
function mkCanvas(w, h, soft) {
  const c = document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0);
  if (soft) c.getContext('2d', { willReadFrequently: true });
  return c;
}

/* ---------- фактура бумаги (бесшовные плитки, создаются один раз) ---------- */
const TEX = {};
/* быстрый генератор для плиток фактуры (xorshift) и решётки для гладкого шума */
function xs32(seed) { let x = seed | 0 || 1; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; }; }
function lattice(n, seed) { const r = xs32(seed), g = new Float32Array(n * n); for (let i = 0; i < g.length; i++) g[i] = r(); return g; }
/* гладкий бесшовный шум по решётке n×n (координаты по модулю n) сразу для всей плитки
   size×size: веса по столбцам и строкам считаются один раз — запуск не ждёт
   сотни тысяч вызовов функции в ещё не разогретом коде */
function smoothField(g, n, size) {
  const out = new Float32Array(size * size), c0 = new Int32Array(size), c1 = new Int32Array(size), w = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const x = (i * n) / size, xi = Math.floor(x), f = x - xi;
    c0[i] = ((xi % n) + n) % n; c1[i] = (c0[i] + 1) % n; w[i] = f * f * (3 - 2 * f);
  }
  for (let j = 0; j < size; j++) {
    const r0 = c0[j] * n, r1 = c1[j] * n, uy = w[j];
    for (let i = 0; i < size; i++) {
      const a = g[r0 + c0[i]], b = g[r0 + c1[i]], c = g[r1 + c0[i]], d = g[r1 + c1[i]], ux = w[i];
      out[j * size + i] = a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
    }
  }
  return out;
}
function makeTextures() {
  // зерно: светлые и тёмные крапинки + короткие волокна
  const N = 256, g = mkCanvas(N, N, true), x = g.getContext('2d'), im = x.createImageData(N, N), d = im.data;
  const m1 = smoothField(lattice(52, 3), 52, N);
  let s0 = 11;   // xorshift прямо в цикле (та же последовательность, что xs32(11))
  for (let k = 0, p = 0; k < N * N; k++, p += 4) {
    s0 ^= s0 << 13; s0 ^= s0 >>> 17; s0 ^= s0 << 5;
    const n = (s0 >>> 0) / 4294967296, v = n < 0.5 ? 0 : 255, a = Math.abs(n - 0.5) * 2;
    d[p] = d[p + 1] = d[p + 2] = v;
    d[p + 3] = (a * a * 46 + (m1[k] - 0.5) * 20 * (v ? 1 : -1) + 8) | 0;
  }
  x.putImageData(im, 0, 0);
  const r = xs32(77);
  x.lineCap = 'round';
  for (let f = 0; f < 300; f++) {
    const light = r() < 0.55;
    x.strokeStyle = light ? 'rgba(255,251,236,0.20)' : 'rgba(46,30,24,0.13)';
    x.lineWidth = 0.4 + r() * 0.9;
    const px = r() * N, py = r() * N, a0 = r() * TAU, len = 5 + r() * 26, bend = (r() - 0.5) * 0.9;
    const near = (v) => (v < 30 ? [0, N] : v > N - 30 ? [0, -N] : [0]);
    for (const ox of near(px)) for (const oy of near(py)) {
      x.beginPath(); let qx = px + ox, qy = py + oy, a = a0; x.moveTo(qx, qy);
      for (let s = 0; s < 6; s++) { a += bend * 0.3; qx += Math.cos(a) * len / 6; qy += Math.sin(a) * len / 6; x.lineTo(qx, qy); }
      x.stroke();
    }
  }
  TEX.grain = g;
  // пятна: мягкая неравномерность тона (две октавы периодического шума)
  const M = 128, m = mkCanvas(M, M, true), mx = m.getContext('2d'), mi = mx.createImageData(M, M), md = mi.data;
  const fa = smoothField(lattice(8, 21), 8, M), fb = smoothField(lattice(20, 22), 20, M);
  for (let k = 0, p = 0; k < M * M; k++, p += 4) {
    const n = fa[k] * 0.65 + fb[k] * 0.35, v = n > 0.5 ? 255 : 0;
    md[p] = md[p + 1] = md[p + 2] = v; md[p + 3] = (Math.abs(n - 0.5) * 2 * 150) | 0;
  }
  mx.putImageData(mi, 0, 0);
  TEX.mottle = m;
  // зерно плёнки для всего кадра
  const F = 192, fg = mkCanvas(F, F, true), fx = fg.getContext('2d'), fi = fx.createImageData(F, F), fd = fi.data;
  let s2 = 91;
  for (let k = 0, p = 0; k < F * F; k++, p += 4) {
    s2 ^= s2 << 13; s2 ^= s2 >>> 17; s2 ^= s2 << 5;
    const n = (s2 >>> 0) / 4294967296, v = n < 0.5 ? 20 : 250;
    fd[p] = fd[p + 1] = fd[p + 2] = v; fd[p + 3] = (Math.abs(n - 0.5) * 2 * 255) | 0;
  }
  fx.putImageData(fi, 0, 0);
  TEX.film = fg;
}

/* ---------- Перо: рисование одной фигурки в её собственных единицах ---------- */
class Pen {
  constructor(ctx, seed, scale, measure) {
    this.x = ctx; this.seed = seed; this.k = 0; this.s = scale; this.m = measure;
    this.bb = [Infinity, Infinity, -Infinity, -Infinity];
  }
  ns() { this.k++; return (this.seed + this.k * 7919) | 0; }
  grow(b, pad = 0) {
    const q = this.bb;
    if (b[0] - pad < q[0]) q[0] = b[0] - pad; if (b[1] - pad < q[1]) q[1] = b[1] - pad;
    if (b[2] + pad > q[2]) q[2] = b[2] + pad; if (b[3] + pad > q[3]) q[3] = b[3] + pad;
  }
  /* кусок бумаги: неровный край, пятна, зерно, фаска, рваная белая кромка (edge:'torn') */
  paper(shape, color, o = {}) {
    shape = shapeOf(shape);
    const sd = o.seed ?? this.ns();
    if (this.m) { this.grow(sbounds(shape), 3.5); return shape; }
    const ctx = this.x, E = o.edge === 'clean' ? null : EDGE[o.edge || 'cut'], k = o.k ?? 1;
    const main = E ? roughen(shape, { step: E.step, amp: E.amp * k, freq: E.freq / Math.sqrt(k), fib: E.fib * k, seed: sd, bias: o.inset ? -o.inset : 0 }) : shape;
    const rule = o.rule || 'nonzero';
    if (o.edge === 'torn' || o.rim) {
      const T = EDGE.torn;
      const rim = roughen(shape, { step: T.step, amp: T.amp * k * 1.1, freq: T.freq * 1.4, fib: T.fib * k * 1.5, seed: sd + 5, bias: (o.rimW ?? 1.5) * k });
      ctx.fillStyle = rgba(o.rim || '#F1E7D0', o.rimA ?? 0.95); traceS(ctx, rim); ctx.fill(rule);
    }
    ctx.fillStyle = rgba(color); traceS(ctx, main); ctx.fill(rule);
    ctx.save(); traceS(ctx, main); ctx.clip(rule);
    const b = sbounds(main);
    if (o.grad) {
      const g = o.gradH ? ctx.createLinearGradient(b[0], 0, b[2], 0) : ctx.createLinearGradient(0, b[1], 0, b[3]);
      g.addColorStop(0, rgba(shade(color, o.grad[0]))); g.addColorStop(1, rgba(shade(color, o.grad[1])));
      ctx.fillStyle = g; ctx.fillRect(b[0], b[1], b[2] - b[0], b[3] - b[1]);
    }
    this.texture(b, o.mottle ?? 0.55, o.grain ?? 1, sd);
    if (o.draw) o.draw(this);
    const bv = o.bevel ?? 1;
    if (bv > 0) this.bevel(main, bv * k, rule);
    ctx.restore();
    return main;
  }
  texture(b, mottle, grain, sd) {
    const ctx = this.x, ox = hash1(sd, 3) * 200, oy = hash1(sd, 4) * 200;
    const small = (b[2] - b[0]) * (b[3] - b[1]) < 1800;
    // пятна тона растут вместе с листом: на небе и море мелкая плитка читалась бы как обои
    const mu = clamp(Math.max(b[2] - b[0], b[3] - b[1]) / 360, 0.5, 4);
    if (!this.pats) this.pats = { m: ctx.createPattern(TEX.mottle, 'repeat'), g: ctx.createPattern(TEX.grain, 'repeat') };
    const pat = (p, upt, a) => {
      if (a <= 0) return;
      ctx.save(); ctx.globalAlpha = a; ctx.translate(b[0], b[1]); ctx.scale(upt, upt); ctx.translate(-ox, -oy);
      ctx.fillStyle = p;
      ctx.fillRect(ox, oy, (b[2] - b[0]) / upt + 2, (b[3] - b[1]) / upt + 2);
      ctx.restore();
    };
    if (!small) pat(this.pats.m, mu, 0.42 * mottle);
    pat(this.pats.g, Math.max(0.2, 1.05 / this.s), 0.85 * grain);
  }
  bevel(main, k, rule) {
    const ctx = this.x;
    ctx.lineJoin = 'round';
    ctx.save(); ctx.translate(0.55 * k, 0.65 * k); ctx.strokeStyle = `rgba(255,248,228,${0.26 * Math.min(1, k)})`; ctx.lineWidth = 1.3 * k; traceS(ctx, main); ctx.stroke(); ctx.restore();
    ctx.save(); ctx.translate(-0.6 * k, -0.8 * k); ctx.strokeStyle = `rgba(36,20,24,${0.3 * Math.min(1, k)})`; ctx.lineWidth = 1.5 * k; traceS(ctx, main); ctx.stroke(); ctx.restore();
  }
  /* краска внутри куска: мягкий край, без фаски */
  paint(shape, color, a = 1, o = {}) {
    shape = shapeOf(shape);
    if (this.m) { this.grow(sbounds(shape), 2); return; }
    const ctx = this.x, E = o.edge === 'clean' ? null : EDGE[o.edge || 'soft'];
    const s = E ? roughen(shape, { ...E, amp: E.amp * (o.k ?? 1), seed: o.seed ?? this.ns() }) : shape;
    ctx.globalAlpha = a; ctx.fillStyle = rgba(color); traceS(ctx, s); ctx.fill(o.rule || 'nonzero'); ctx.globalAlpha = 1;
  }
  /* линия тушью или гуашью */
  line(pts, w, color, a = 1, o = {}) {
    if (this.m) { let b = [Infinity, Infinity, -Infinity, -Infinity]; for (let k = 0; k < pts.length; k += 2) { b[0] = Math.min(b[0], pts[k]); b[1] = Math.min(b[1], pts[k + 1]); b[2] = Math.max(b[2], pts[k]); b[3] = Math.max(b[3], pts[k + 1]); } this.grow(b, w + 2); return; }
    const ctx = this.x, p = o.wob === 0 ? pts : wobble(pts, o.wob ?? 0.35, 0.3, o.seed ?? this.ns());
    ctx.globalAlpha = a; ctx.strokeStyle = rgba(color); ctx.lineWidth = w; ctx.lineCap = o.cap || 'round'; ctx.lineJoin = 'round';
    traceL(ctx, p); ctx.stroke(); ctx.globalAlpha = 1;
  }
  /* сужающийся мазок: pts — осевая линия */
  brush(pts, w0, w1, color, a = 1) {
    if (this.m) { this.line(pts, Math.max(w0, w1), color, a); return; }
    const n = pts.length >> 1, L = [], R = [];
    for (let k = 0; k < n; k++) {
      const i0 = Math.max(0, k - 1) * 2, i1 = Math.min(n - 1, k + 1) * 2;
      let tx = pts[i1] - pts[i0], ty = pts[i1 + 1] - pts[i0 + 1]; const d = Math.hypot(tx, ty) || 1; tx /= d; ty /= d;
      const t = n > 1 ? k / (n - 1) : 0, w = lerp(w0, w1, t) * (0.5 + 0.5 * Math.sin(Math.PI * clamp(t * 1.15, 0, 1))) * 0.5 + 0.02;
      L.push(pts[2 * k] - ty * w, pts[2 * k + 1] + tx * w); R.unshift(pts[2 * k] + ty * w, pts[2 * k + 1] - tx * w);
    }
    this.paint([L.concat(R)], color, a, { edge: 'fine' });
  }
  dot(x, y, r, color, a = 1) { this.paint(ell(x, y, r, r), color, a, { edge: r > 2 ? 'fine' : 'clean' }); }
  glow(x, y, r, color, a = 1, inner = 0) {
    if (this.m) { this.grow([x - r, y - r, x + r, y + r]); return; }
    const ctx = this.x, g = ctx.createRadialGradient(x, y, r * inner, x, y, r), c = col(color);
    g.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${a})`); g.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  clip(shape, fn) {
    shape = shapeOf(shape);
    if (this.m) { fn(this); return; }
    const ctx = this.x; ctx.save(); traceS(ctx, shape); ctx.clip(); fn(this); ctx.restore();
  }
  text(str, x, y, font, color, o = {}) {
    const ctx = this.x;
    ctx.font = font; ctx.textAlign = o.align || 'center'; ctx.textBaseline = o.base || 'alphabetic';
    if (this.m) {
      const w = ctx.measureText(str).width, h = o.h || 40, x0 = o.align === 'left' ? x : o.align === 'right' ? x - w : x - w / 2;
      this.grow([x0, y - h, x0 + w, y + h * 0.35], 6); return;
    }
    if (o.stroke) { ctx.lineJoin = 'round'; ctx.lineWidth = o.stroke; ctx.strokeStyle = rgba(o.strokeC || color); ctx.strokeText(str, x, y); }
    ctx.fillStyle = rgba(color); ctx.fillText(str, x, y);
  }
}

/* ---------- Выпечка спрайтов ---------- */
const SPR = new Map();
function def(id, o) { o.id = id; o.seed = o.seed ?? hashStr(id); SPR.set(id, o); return o; }

const Bake = {
  density: 1,      // пикселей холста на единицу кадра (кадр — 1600×900 единиц)
  cache: new Map(),
  need: new Map(), // id → наибольший экранный масштаб за фильм (из предпрохода)
  scratch: null,
  pending: [],
  get(id) {
    let r = this.cache.get(id);
    if (!r) { r = this.make(id); }
    return r;
  },
  scaleFor(d) {
    const n = this.need.get(d.id);
    const q = Math.min(n !== undefined ? n : (d.res ?? 0.6), d.maxQ ?? 3);
    return clamp(this.density * q * 1.06, 0.04, d.maxS || 9);
  },
  stats() { let px = 0; for (const r of this.cache.values()) px += r.c.width * r.c.height; return Math.round(px / 1e5) / 10 + ' Мпикс'; },
  slowest(n = 12) { return [...this.ms.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => k + ':' + v).join(' '); },
  bounds(d) {
    if (d._bb) return d._bb;
    const c = this.scratch || (this.scratch = mkCanvas(4, 4));
    const pen = new Pen(c.getContext('2d'), d.seed, 1, true);
    d.draw(pen);
    const b = pen.bb;
    if (!isFinite(b[0])) b[0] = b[1] = -1, b[2] = b[3] = 1;
    d._bb = b;
    return b;
  },
  ms: new Map(),    // id → мс на выпечку (для проверки производительности)
  make(id, forceScale) {
    const d = SPR.get(id);
    if (!d) throw new Error('нет спрайта ' + id);
    const t0 = performance.now();
    const b = this.bounds(d), sh = d.shadow;
    const pad = sh ? Math.max(Math.abs(sh.dx), Math.abs(sh.dy)) + sh.blur * 1.6 + 2 : 2;
    const w = b[2] - b[0] + pad * 2, h = b[3] - b[1] + pad * 2;
    let s = forceScale || this.scaleFor(d);
    const MAXD = 2600, MAXPX = 4.2e6;
    if (w * s > MAXD) s = MAXD / w;
    if (h * s > MAXD) s = MAXD / h;
    if (w * h * s * s > MAXPX) s = Math.sqrt(MAXPX / (w * h));
    const W = Math.ceil(w * s), H = Math.ceil(h * s);
    const c = mkCanvas(W, H, true), ctx = c.getContext('2d');
    ctx.setTransform(s, 0, 0, s, (pad - b[0]) * s, (pad - b[1]) * s);
    d.draw(new Pen(ctx, d.seed, s, false));
    let out = c;
    if (sh) {
      const f = mkCanvas(W, H, true), fx = f.getContext('2d');
      fx.shadowColor = `rgba(${sh.c || '30,18,34'},${sh.a ?? 0.38})`;
      fx.shadowBlur = sh.blur * s; fx.shadowOffsetX = sh.dx * s; fx.shadowOffsetY = sh.dy * s;
      fx.drawImage(c, 0, 0);
      out = f;
    }
    const r = { c: out, x: b[0] - pad, y: b[1] - pad, w: W / s, h: H / s, s, id };
    this.cache.set(id, r);
    this.ms.set(id, Math.round(performance.now() - t0));
    return r;
  },
  /* уменьшенная вдвое копия спрайта (делается один раз, по требованию): простое билинейное
     сглаживание при сжатии сильнее 0,5 рябит, а качественное строит mip-уровни каждый кадр */
  lod(r, k) {
    while (k < 0.5 && r.c.width > 16 && r.c.height > 16) {
      if (!r.half) {
        const w = Math.max(1, Math.round(r.c.width / 2)), h = Math.max(1, Math.round(r.c.height / 2));
        const c = mkCanvas(w, h, true), x = c.getContext('2d');
        x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
        x.drawImage(r.c, 0, 0, w, h);
        r.half = { c, x: r.x, y: r.y, w: r.w, h: r.h, s: (r.s * w) / r.c.width, id: r.id };
      }
      r = r.half; k *= 2;
    }
    return r;
  },
  /* при заметном росте плотности (полный экран) — перепечь постепенно */
  setDensity(dn) {
    const old = this.density;
    this.density = dn;
    if (this.cache.size && (dn > old * 1.18 || dn < old * 0.6)) {
      this.pending = [...this.cache.keys()];
    }
  },
  queue: [],       // заранее выпечь то, что скоро понадобится (по порядку появления в фильме)
  idle(budgetMs) {
    const t0 = performance.now();
    while (this.pending.length && performance.now() - t0 < budgetMs) {
      const id = this.pending.shift();
      this.make(id);
    }
    while (this.queue.length && performance.now() - t0 < budgetMs) {
      const id = this.queue.shift();
      if (!this.cache.has(id)) this.make(id);
    }
  },
};

/* двухзвенная обратная кинематика (плечо→локоть→кисть), углы в системе «0 = вниз» */
function ik2(sx, sy, tx, ty, L1, L2, bend) {
  let dx = tx - sx, dy = ty - sy, D = Math.hypot(dx, dy);
  const Dm = clamp(D, Math.abs(L1 - L2) + 0.01, L1 + L2 - 0.01);
  const base = Math.atan2(dy, dx);
  const a1 = Math.acos(clamp((L1 * L1 + Dm * Dm - L2 * L2) / (2 * L1 * Dm), -1, 1));
  const a2 = Math.acos(clamp((L1 * L1 + L2 * L2 - Dm * Dm) / (2 * L1 * L2), -1, 1));
  const up = base - bend * a1;                 // направление плеча
  const upper = up - Math.PI / 2;              // «0 = вниз»
  const lower = bend * (Math.PI - a2);         // сгиб локтя относительно плеча
  return [upper, lower];
}
