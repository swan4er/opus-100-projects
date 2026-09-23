'use strict';
/* ==========================================================================
   Перо Жар-птицы — ядро.
   Математика, easing, шум, кисть с переменной шириной, «картины» (Pic)
   с прорисовкой штрихов, спрайты свечения и карта света.
   Всё детерминировано: кадр однозначно задаётся временем t.
   ========================================================================== */

const W = 1600, H = 900;          // мир кадра 16:9
const BORDER = 30;                // ширина орнаментальной рамки
const TAU = Math.PI * 2, PI = Math.PI;

const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const inv = (a, b, x) => clamp((x - a) / (b - a));
const sstep = (a, b, x) => { const t = inv(a, b, x); return t * t * (3 - 2 * t); };
const fract = (x) => x - Math.floor(x);
const bump = (a, b, c, d, x) => sstep(a, b, x) * (1 - sstep(c, d, x)); // подъём и спад

/* ---------- easing: замедление в начале и в конце, упреждение, захлёст ---------- */
const Ease = {
  lin: (t) => t,
  inQ: (t) => t * t,
  outQ: (t) => 1 - (1 - t) * (1 - t),
  io: (t) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t)),
  inC: (t) => t * t * t,
  outC: (t) => 1 - Math.pow(1 - t, 3),
  ioC: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  ioS: (t) => 0.5 - 0.5 * Math.cos(PI * t),
  inS: (t) => 1 - Math.cos((t * PI) / 2),
  outS: (t) => Math.sin((t * PI) / 2),
  outBack: (t) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
  outBackS: (t) => { const c = 0.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
  inBack: (t) => { const c = 1.70158; return (c + 1) * t * t * t - c * t * t; },
  ioBack: (t) => {
    const c = 1.70158 * 1.525;
    return t < 0.5 ? (Math.pow(2 * t, 2) * ((c + 1) * 2 * t - c)) / 2
      : (Math.pow(2 * t - 2, 2) * ((c + 1) * (t * 2 - 2) + c) + 2) / 2;
  },
  outEl: (t) => (t <= 0 || t >= 1 ? t : Math.pow(2, -9 * t) * Math.sin(((t * 10 - 0.75) * TAU) / 3.2) + 1),
  step: (t) => (t < 1 ? 0 : 1),
};

/* Смешивание чисел, массивов и объектов (позы персонажей) */
function mix(a, b, u) {
  if (typeof a === 'number') return a + (b - a) * u;
  if (Array.isArray(a)) { const r = new Array(a.length); for (let i = 0; i < a.length; i++) r[i] = mix(a[i], b[i], u); return r; }
  const o = {};
  for (const k in a) o[k] = k in b ? mix(a[k], b[k], u) : a[k];
  for (const k in b) if (!(k in a)) o[k] = b[k];
  return o;
}

/* Ключевые кадры: [[t, значение, 'easing'], ...]. Easing — у входящего ключа. */
function key(t, kf) {
  if (t <= kf[0][0]) return kf[0][1];
  for (let i = 1; i < kf.length; i++) {
    const k = kf[i];
    if (t < k[0]) {
      const p = kf[i - 1];
      const u = (t - p[0]) / (k[0] - p[0]);
      return mix(p[1], k[1], (Ease[k[2] || 'ioS'])(u));
    }
  }
  return kf[kf.length - 1][1];
}

/* ---------- детерминированный шум и генератор ---------- */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash1(i) { // целое → [0, 1)
  let x = Math.imul((i | 0) ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}
function vnoise(x) { // гладкий шум [-1, 1]
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return lerp(hash1(i), hash1(i + 1), u) * 2 - 1;
}
function fbm(x) { return vnoise(x) * 0.62 + vnoise(x * 2.13 + 17.3) * 0.28 + vnoise(x * 4.7 + 5.1) * 0.1; }
function vnoise2(x, y) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const h = (a, b) => hash1(a * 73856093 ^ b * 19349663);
  return lerp(lerp(h(i, j), h(i + 1, j), ux), lerp(h(i, j + 1), h(i + 1, j + 1), ux), uy) * 2 - 1;
}

/* ---------- кривые ---------- */
/* Катмулл–Ром через точки [[x,y],...] → плотная ломаная Float32Array */
function spline(P, seg = 8, closed = false) {
  const n = P.length;
  if (n < 2) return new Float32Array(n ? [P[0][0], P[0][1]] : []);
  const last = closed ? n : n - 1;
  const out = new Float32Array((last * seg + (closed ? 0 : 1)) * 2);
  let k = 0;
  for (let i = 0; i < last; i++) {
    const p0 = closed ? P[(i - 1 + n) % n] : P[i > 0 ? i - 1 : 0];
    const p1 = P[i % n];
    const p2 = closed ? P[(i + 1) % n] : P[i + 1];
    const p3 = closed ? P[(i + 2) % n] : P[i + 2 < n ? i + 2 : n - 1];
    const ax = -p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0], ay = -p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1];
    const bx = 2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0], by = 2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1];
    const cx = -p0[0] + p2[0], cy = -p0[1] + p2[1];
    for (let s = 0; s < seg; s++) {
      const t = s / seg, t2 = t * t, t3 = t2 * t;
      out[k++] = 0.5 * (2 * p1[0] + cx * t + bx * t2 + ax * t3);
      out[k++] = 0.5 * (2 * p1[1] + cy * t + by * t2 + ay * t3);
    }
  }
  if (!closed) { out[k++] = P[n - 1][0]; out[k++] = P[n - 1][1]; }
  return out;
}
function cumLen(poly) {
  const n = poly.length >> 1, c = new Float32Array(n);
  for (let i = 1; i < n; i++) { const dx = poly[2 * i] - poly[2 * i - 2], dy = poly[2 * i + 1] - poly[2 * i - 1]; c[i] = c[i - 1] + Math.sqrt(dx * dx + dy * dy); }
  return c;
}
/* Точка и касательная на ломаной по доле длины u ∈ [0,1] */
function polyAt(poly, cum, u) {
  const n = poly.length >> 1, L = cum[n - 1], d = clamp(u) * L;
  let i = 1;
  while (i < n - 1 && cum[i] < d) i++;
  const d0 = cum[i - 1], d1 = cum[i], f = d1 > d0 ? (d - d0) / (d1 - d0) : 0;
  const x = lerp(poly[2 * i - 2], poly[2 * i], f), y = lerp(poly[2 * i - 1], poly[2 * i + 1], f);
  let tx = poly[2 * i] - poly[2 * i - 2], ty = poly[2 * i + 1] - poly[2 * i - 1];
  const l = Math.hypot(tx, ty) || 1;
  return [x, y, tx / l, ty / l];
}
/* Контур по функции: f(u) → [x, y], n отрезков */
function sample(f, n) {
  const out = new Float32Array((n + 1) * 2);
  for (let i = 0; i <= n; i++) { const p = f(i / n); out[2 * i] = p[0]; out[2 * i + 1] = p[1]; }
  return out;
}
/* Замкнутая фигура из ломаной в Path2D */
function polyPath(poly, path = new Path2D(), close = true) {
  path.moveTo(poly[0], poly[1]);
  for (let i = 2; i < poly.length; i += 2) path.lineTo(poly[i], poly[i + 1]);
  if (close) path.closePath();
  return path;
}
function smoothPath(P, closed = true, path = new Path2D(), seg = 6) { return polyPath(spline(P, seg, closed), path, closed); }

/* ---------- кисть ---------- */
/* Профили ширины штриха по длине (u ∈ [0,1]) */
const Prof = {
  brush: (u) => sstep(0, 0.14, u) * (1 - 0.82 * sstep(0.55, 1, u)) * (0.9 + 0.2 * Math.sin(PI * u)),
  hair: (u) => 0.25 + 0.75 * sstep(0, 0.2, u) * (1 - sstep(0.75, 1, u)),
  even: (u) => 0.5 + 0.5 * sstep(0, 0.05, u) * (1 - sstep(0.95, 1, u)),
  leaf: (u) => Math.pow(Math.sin(PI * clamp(u)), 0.75),
  drop: (u) => Math.pow(Math.sin(PI * Math.pow(clamp(u), 0.62)), 0.8),
  tail: (u) => (1 - u) * (0.3 + 0.7 * sstep(0, 0.12, u)),
  flat: () => 1,
};

/* Штрих: подготовленная ломаная с длинами */
function mkStroke(pts, w, o = {}) {
  const poly = pts instanceof Float32Array ? pts : spline(pts, o.seg || 7);
  const cum = cumLen(poly);
  return { poly, cum, L: cum[cum.length - 1] || 0.001, w, prof: o.prof || Prof.brush, ord: 0, t0: 0, d: 0.2 };
}

/* Контур штриха в Path2D. reveal ∈ [0,1] — насколько прорисован (кисть ведёт линию).
   Все контуры обходятся в одну сторону, поэтому их можно сливать в один Path2D. */
let SX = new Float32Array(4096), SY = new Float32Array(4096);
function strokeInto(path, s, reveal = 1, ws = 1) {
  const poly = s.poly, cum = s.cum, L = s.L, n = poly.length >> 1;
  const Lr = L * reveal;
  if (Lr <= 0.05 || n < 2) return null;
  if (n * 2 > SX.length) { SX = new Float32Array(n * 4); SY = new Float32Array(n * 4); }
  let m = 0, ex = 0, ey = 0, ew = 0;
  const prof = s.prof, hw0 = 0.5 * s.w * ws;
  for (let i = 0; i < n; i++) {
    let x = poly[2 * i], y = poly[2 * i + 1], d = cum[i], end = false;
    if (d > Lr) {
      const d0 = cum[i - 1], f = (Lr - d0) / (d - d0 || 1);
      x = poly[2 * i - 2] + (x - poly[2 * i - 2]) * f; y = poly[2 * i - 1] + (y - poly[2 * i - 1]) * f; d = Lr; end = true;
    }
    const i0 = i > 0 ? i - 1 : 0, i1 = i < n - 1 ? i + 1 : n - 1;
    let tx = poly[2 * i1] - poly[2 * i0], ty = poly[2 * i1 + 1] - poly[2 * i0 + 1];
    const tl = Math.sqrt(tx * tx + ty * ty) || 1; tx /= tl; ty /= tl;
    const hw = hw0 * prof(d / L);
    SX[2 * m] = x - ty * hw; SY[2 * m] = y + tx * hw;
    SX[2 * m + 1] = x + ty * hw; SY[2 * m + 1] = y - tx * hw;
    m++;
    ex = x; ey = y; ew = hw;
    if (end) break;
  }
  path.moveTo(SX[0], SY[0]);
  for (let i = 1; i < m; i++) path.lineTo(SX[2 * i], SY[2 * i]);
  for (let i = m - 1; i >= 0; i--) path.lineTo(SX[2 * i + 1], SY[2 * i + 1]);
  path.closePath();
  if (reveal < 1 && ew > 0.35) { path.moveTo(ex + ew, ey); path.arc(ex, ey, ew, 0, TAU, true); }
  return [ex, ey, ew];
}
/* Быстрая волосяная линия: гладкая кривая через середины отрезков */
function hairPath(ctx, pts) {
  const n = pts.length;
  ctx.moveTo(pts[0][0], pts[0][1]);
  if (n === 2) { ctx.lineTo(pts[1][0], pts[1][1]); return; }
  for (let i = 1; i < n - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
    if (i === n - 2) ctx.quadraticCurveTo(pts[i][0], pts[i][1], pts[n - 1][0], pts[n - 1][1]);
    else ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
  }
}
/* Кружок в Path2D с тем же направлением обхода */
function dotInto(path, x, y, r) { path.moveTo(x + r, y); path.arc(x, y, r, 0, TAU, true); }

/* ---------- Pic: картина из заливок и штрихов, умеет «прорисовываться» ---------- */
/* Стиль: строка цвета, 'gold' (металлический градиент кадра) или функция (P) → стиль. */
class Pic {
  constructor() { this.ops = []; this.baked = null; this.box = [1e9, 1e9, -1e9, -1e9]; }
  _grow(poly) {
    const b = this.box;
    for (let i = 0; i < poly.length; i += 2) {
      if (poly[i] < b[0]) b[0] = poly[i]; if (poly[i] > b[2]) b[2] = poly[i];
      if (poly[i + 1] < b[1]) b[1] = poly[i + 1]; if (poly[i + 1] > b[3]) b[3] = poly[i + 1];
    }
  }
  /* заливка готовым Path2D; cx — точка для порядка прорисовки */
  fill(path, style, o = {}) {
    const op = { f: 1, path, style, a: o.a ?? 1, cx: o.cx ?? 0, cy: o.cy ?? 0, t0: 0, rule: o.rule };
    this.ops.push(op); this.baked = null; this._bk = null; return op;
  }
  /* заливка по точкам (гладкий замкнутый контур) */
  shape(P, style, o = {}) {
    const poly = o.poly || spline(P, o.seg || 6, true);
    this._grow(poly);
    let cx = 0, cy = 0; for (let i = 0; i < poly.length; i += 2) { cx += poly[i]; cy += poly[i + 1]; }
    cx /= poly.length / 2; cy /= poly.length / 2;
    return this.fill(polyPath(poly), style, { a: o.a, cx, cy, rule: o.rule });
  }
  line(pts, w, style, o = {}) {
    const s = mkStroke(pts, w, o);
    s.style = style; s.lit = o.lit ?? (style === 'gold');
    this._grow(s.poly); this.ops.push(s); this.baked = null; this._bk = null; return s;
  }
  dot(x, y, r, style) { // точка — как короткий штрих
    const p = new Path2D(); dotInto(p, x, y, r);
    return this.fill(p, style, { cx: x, cy: y });
  }
  /* Порядок прорисовки: ord(op) → t0 ∈ [0,1] */
  order(fn) { for (const op of this.ops) op.t0 = fn(op); return this; }
  bake() { while (!this.bakeStep(Infinity)); return this; }
  /* запекание по кусочкам: сливает подряд идущие штрихи одного цвета в один Path2D */
  bakeStep(deadline) {
    if (this.baked) return true;
    const st = this._bk || (this._bk = { i: 0, calls: [], cur: null });
    const ops = this.ops;
    while (st.i < ops.length) {
      const op = ops[st.i++];
      if (op.f) { st.cur = null; st.calls.push(op); }
      else {
        if (!st.cur || st.cur.style !== op.style) { st.cur = { f: 0, path: new Path2D(), style: op.style, lit: op.lit }; st.calls.push(st.cur); }
        strokeInto(st.cur.path, op, 1);
      }
      if ((st.i & 31) === 0 && performance.now() > deadline) return false;
    }
    this.baked = st.calls; this._bk = null;
    return true;
  }
  /* light = [x, y, r, k]: золото рядом с источником вспыхивает. Отсвет ложится
     в том же проходе, сразу после своего штриха, — поэтому то, что нарисовано
     позже (стена терема, ближний холм), закрывает и сам штрих, и его блеск */
  draw(ctx, P, a = 1, light = null) {
    if (!this.baked) this.bake();
    const g = light && light[3] > 0.01 ? litGrad(ctx, light) : null;
    for (const c of this.baked) {
      ctx.globalAlpha = a * (c.a ?? 1);
      ctx.fillStyle = styleOf(c.style, P);
      if (c.rule) ctx.fill(c.path, c.rule); else ctx.fill(c.path);
      if (g && !c.f && c.lit) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = a; ctx.fillStyle = g; ctx.fill(c.path);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    ctx.globalAlpha = 1;
  }
  /* Прорисовка: p ∈ [0,1]. Штрихи ведутся кистью, заливки проявляются позже. */
  drawReveal(ctx, P, p, o = {}) {
    if (p >= 1) return this.draw(ctx, P);
    const dur = o.dur ?? 0.22, fillLag = o.fillLag ?? 0.18, fillDur = o.fillDur ?? 0.35;
    const tips = [];
    for (const op of this.ops) {
      if (op.f) {
        const a = inv(op.t0 + fillLag, op.t0 + fillLag + fillDur, p);
        if (a <= 0) continue;
        ctx.globalAlpha = a * op.a;
        ctx.fillStyle = styleOf(op.style, P);
        if (op.rule) ctx.fill(op.path, op.rule); else ctx.fill(op.path);
      } else {
        const r = inv(op.t0, op.t0 + dur, p);
        if (r <= 0) continue;
        const path = new Path2D();
        const tip = strokeInto(path, op, Ease.outQ(r));
        ctx.globalAlpha = 1;
        ctx.fillStyle = styleOf(op.style, P);
        ctx.fill(path);
        if (tip && r < 1 && op.style === 'gold') tips.push(tip);
      }
    }
    ctx.globalAlpha = 1;
    // «мокрый» блеск на кончике кисти
    if (tips.length && o.tips !== false) {
      ctx.globalCompositeOperation = 'lighter';
      for (const [x, y, w] of tips) drawGlow(ctx, SPR.gold, x, y, 4 + w * 5, 0.5);
      ctx.globalCompositeOperation = 'source-over';
    }
  }
}
function litGrad(ctx, [lx, ly, r, k]) {
  const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, r);
  g.addColorStop(0, `rgba(255,236,170,${0.9 * k})`);
  g.addColorStop(0.35, `rgba(255,200,110,${0.45 * k})`);
  g.addColorStop(1, 'rgba(255,170,80,0)');
  return g;
}
function styleOf(s, P) {
  if (s === 'gold') return P.gold;
  if (typeof s === 'function') return s(P);
  return s;
}

/* ---------- золото ---------- */
/* Металлический градиент в координатах мира; phase двигает блик */
function makeGold(ctx, phase = 0, x0 = 0, y0 = 0, x1 = W, y1 = H) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  const stops = [
    [0, '#9a6a24'], [0.12, '#e3b659'], [0.2, '#fbe3a0'], [0.3, '#d6a44b'], [0.45, '#a8772c'],
    [0.58, '#e9c06a'], [0.66, '#fff0bd'], [0.75, '#d9a94e'], [0.9, '#9d6d26'], [1, '#c99640'],
  ];
  const ph = fract(phase);
  // сдвиг блика по кругу
  const arr = stops.map(([o, c]) => [fract(o + ph), c]).sort((a, b) => a[0] - b[0]);
  for (const [o, c] of arr) g.addColorStop(o, c);
  return g;
}

/* ---------- спрайты свечения ---------- */
const SPR = {};
function makeGlowSprite(r, g, b, soft = 0.35) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const grd = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, `rgba(${r},${g},${b},1)`);
  grd.addColorStop(soft * 0.5, `rgba(${r},${g},${b},0.55)`);
  grd.addColorStop(soft, `rgba(${r},${g},${b},0.22)`);
  grd.addColorStop(0.7, `rgba(${r},${g},${b},0.05)`);
  grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
  x.fillStyle = grd; x.fillRect(0, 0, 128, 128);
  return c;
}
function initSprites() {
  SPR.gold = makeGlowSprite(255, 214, 130);
  SPR.fire = makeGlowSprite(255, 140, 50, 0.3);
  SPR.ember = makeGlowSprite(255, 90, 30, 0.25);
  SPR.white = makeGlowSprite(255, 246, 220, 0.3);
  SPR.cool = makeGlowSprite(170, 200, 255, 0.3);
  // зерно темперы и лака
  const n = document.createElement('canvas');
  n.width = n.height = 192;
  const nx = n.getContext('2d');
  const img = nx.createImageData(192, 192);
  const R = rng(1071);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = R() * 255;
    img.data[i] = v; img.data[i + 1] = v * 0.94; img.data[i + 2] = v * 0.86; img.data[i + 3] = 255;
  }
  nx.putImageData(img, 0, 0);
  SPR.grain = n;
}
function drawGlow(ctx, spr, x, y, r, a = 1) {
  if (a <= 0.003 || r <= 0.5) return;
  ctx.globalAlpha = Math.min(1, a);
  ctx.drawImage(spr, x - r, y - r, 2 * r, 2 * r);
  ctx.globalAlpha = 1;
}

/* ---------- камера ---------- */
/* cam = {x, y, z, r}: центр кадра в мире, увеличение, поворот.
   base = [масштаб, сдвиг X, сдвиг Y] — мир кадра в пиксели холста;
   par — родительская матрица в единицах кадра (для клейм: сцена внутри рамки). */
const CAM = { base: [1, 0, 0], par: null };
function camMatrix(cam) {
  const z = cam.z || 1, r = cam.r || 0;
  const c = Math.cos(r) * z, s = Math.sin(r) * z;
  return [c, s, -s, c, W / 2 - (c * cam.x - s * cam.y), H / 2 - (s * cam.x + c * cam.y)];
}
function applyCam(ctx, base, cam) {
  const k = base[0];
  ctx.setTransform(k, 0, 0, k, base[1], base[2]);
  if (CAM.par) ctx.transform(...CAM.par);
  ctx.transform(...camMatrix(cam));
}
/* Мировая точка → точка кадра (0..W, 0..H) при данной камере (с учётом родителя) */
function camPoint(cam, x, y) {
  const m = camMatrix(cam);
  let X = m[0] * x + m[2] * y + m[4], Y = m[1] * x + m[3] * y + m[5];
  if (CAM.par) { const p = CAM.par; [X, Y] = [p[0] * X + p[2] * Y + p[4], p[1] * X + p[3] * Y + p[5]]; }
  return [X, Y];
}
function camScale(cam) { return (cam.z || 1) * (CAM.par ? Math.hypot(CAM.par[0], CAM.par[1]) : 1); }

/* ---------- частицы-искры: детерминированы временем ---------- */
/* emit(tb) → [x, y] — где рождается i-я искра в момент tb */
function sparks(ctx, t, o) {
  const { t0 = -1e9, t1 = 1e9, rate = 30, life = 1.4, seed = 1, emit, size = 2.2, rise = 60, spread = 30,
    alpha = 1, spr = SPR.fire, wind = 0 } = o;
  const per = 1 / rate;
  const iMin = Math.max(Math.floor((Math.max(t0, t - life) - t0) / per), 0);
  const iMax = Math.floor((Math.min(t, t1) - t0) / per);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = iMin; i <= iMax; i++) {
    const tb = t0 + i * per + hash1(i * 7 + seed) * per;
    const age = t - tb;
    if (age < 0 || age > life) continue;
    const u = age / life;
    const p = emit(tb, i);
    if (!p) continue;
    const h = hash1(i * 13 + seed * 3), h2 = hash1(i * 29 + seed * 5);
    const x = p[0] + (h - 0.5) * spread * u + Math.sin(age * 3 + h * 9) * 6 * u + wind * age;
    const y = p[1] - rise * age * (0.6 + h2) + 10 * u * u;
    const a = alpha * (1 - u) * sstep(0, 0.08, u) * (0.6 + 0.4 * Math.sin(age * 23 + i));
    drawGlow(ctx, spr, x, y, size * (3 + 4 * h2) * (1 - 0.5 * u), a);
    drawGlow(ctx, SPR.white, x, y, size * (0.9 + h), a * 0.9);
  }
  ctx.globalCompositeOperation = 'source-over';
}

/* ---------- карта света: ночь темнеет, огонь высветляет ---------- */
const Light = {
  cv: null, cx: null, w: 320, h: 180,
  init() {
    this.cv = document.createElement('canvas');
    this.cv.width = this.w; this.cv.height = this.h;
    this.cx = this.cv.getContext('2d');
  },
  /* dark ∈ [0,1]; lights: [[fx, fy, r, k], ...] в координатах кадра (0..W, 0..H) */
  apply(ctx, base, dark, lights) {
    if (dark <= 0.005) return;
    const c = this.cx, sx = this.w / W, sy = this.h / H;
    c.globalCompositeOperation = 'source-over';
    c.clearRect(0, 0, this.w, this.h);
    c.fillStyle = `rgba(4,3,6,${dark})`;
    c.fillRect(0, 0, this.w, this.h);
    c.globalCompositeOperation = 'destination-out';
    for (const [x, y, r, k] of lights) {
      if (k <= 0) continue;
      const g = c.createRadialGradient(x * sx, y * sy, 0, x * sx, y * sy, r * sx);
      g.addColorStop(0, `rgba(0,0,0,${k})`);
      g.addColorStop(0.45, `rgba(0,0,0,${k * 0.7})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, this.w, this.h);
    }
    c.globalCompositeOperation = 'source-over';
    ctx.setTransform(base[0], 0, 0, base[0], base[1], base[2]);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.cv, 0, 0, W, H);
  },
};

/* ---------- текст на холсте ---------- */
function fontReady(name) {
  try { return document.fonts && document.fonts.check(`20px "${name}"`); } catch (e) { return false; }
}
