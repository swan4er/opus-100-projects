'use strict';
/* =========================================================================
   Оркестр на кувшинке — КИСТИ И ДЕКОРАЦИИ
   Утилиты, свет по времени суток, многоплановая камера, небо, вода,
   камыши, кувшинки, колокольчики, светлячки, бумажное зерно.
   ========================================================================= */

const TAU = Math.PI * 2;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const inv = (a, b, x) => clamp((x - a) / (b - a), 0, 1);
const EASE = {
  lin: (t) => t,
  in: (t) => t * t,
  out: (t) => 1 - (1 - t) * (1 - t),
  io: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  io3: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out3: (t) => 1 - Math.pow(1 - t, 3),
  in3: (t) => t * t * t,
  back: (t) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  step: (t) => (t < 1 ? 0 : 1),
};
// Ключевые кадры: [[t, v, 'ease'], ...] — easing относится к отрезку, который заканчивается ключом
function K(t, keys) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t < keys[i][0]) {
      const a = keys[i - 1], b = keys[i];
      const u = (t - a[0]) / (b[0] - a[0]);
      return a[1] + (b[1] - a[1]) * EASE[b[2] || 'io'](u);
    }
  }
  return keys[keys.length - 1][1];
}
// Затухающая пружина: доводка, захлёст, покачивание после удара
const spring = (tau, freq, damp) => (tau < 0 ? 0 : Math.exp(-damp * tau) * Math.sin(TAU * freq * tau));
const decay = (tau, k) => (tau < 0 ? 0 : Math.exp(-tau / k));
function hash(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(hash(i), hash(i + 1), u) * 2 - 1; }

/* ---------- Цвет и свет ------------------------------------------------- */
const RGB = new Map();
function rgbOf(h) {
  let v = RGB.get(h);
  if (!v) { const n = parseInt(h.slice(1), 16); v = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; RGB.set(h, v); }
  return v;
}
const css = (r, g, b, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;
function mix(a, b, t) { const A = rgbOf(a), B = rgbOf(b); return css(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)); }
function mixRGB(a, b, t) { const A = rgbOf(a), B = rgbOf(b); return [lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)]; }
// Свет кадра: множитель и подъём цвета, цвет контрового света
const LIGHT = { tint: [1, 1, 1], lift: [0, 0, 0], rim: [255, 214, 140], rimA: 1, glow: 0 };
const SHADE = new Map();
function lit(h, a = 1) {
  const key = h + a;
  let v = SHADE.get(key);
  if (v) return v;
  const c = rgbOf(h), T = LIGHT.tint, L = LIGHT.lift;
  v = css(clamp(c[0] * T[0] + L[0], 0, 255), clamp(c[1] * T[1] + L[1], 0, 255), clamp(c[2] * T[2] + L[2], 0, 255), a);
  SHADE.set(key, v);
  return v;
}
const rimC = (a = 1) => css(LIGHT.rim[0], LIGHT.rim[1], LIGHT.rim[2], a * LIGHT.rimA);

/* ---------- Примитивы ---------------------------------------------------- */
function ell(c, x, y, rx, ry, rot = 0) { c.beginPath(); c.ellipse(x, y, Math.max(0.01, Math.abs(rx)), Math.max(0.01, Math.abs(ry)), rot, 0, TAU); }
function circ(c, x, y, r) { c.beginPath(); c.arc(x, y, Math.max(0.01, r), 0, TAU); }
// Сглаженная кривая через точки (Катмулл — Ром)
function spline(c, pts, closed, move = true) {
  const n = pts.length;
  if (move) c.moveTo(pts[0][0], pts[0][1]);
  const P = (i) => pts[closed ? (i + n) % n : clamp(i, 0, n - 1)];
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    c.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
  }
  if (closed) c.closePath();
}
// Двухзвенная конечность с обратной кинематикой: плечо → цель
function ik(sx, sy, tx, ty, l1, l2, bend) {
  let dx = tx - sx, dy = ty - sy, d = Math.hypot(dx, dy);
  const md = l1 + l2 - 0.01;
  if (d > md) { dx *= md / d; dy *= md / d; d = md; }
  if (d < 1e-3) d = 1e-3;
  const a = Math.atan2(dy, dx);
  const A = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const a1 = a + bend * A;
  return { ex: sx + Math.cos(a1) * l1, ey: sy + Math.sin(a1) * l1, hx: sx + dx, hy: sy + dy };
}
// Резиновая конечность с контуром (обводка + заливка)
function limb(c, pts, w, fill, line, ow = 2.2) {
  c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
  if (pts.length === 3) c.quadraticCurveTo(pts[1][0], pts[1][1], pts[2][0], pts[2][1]);
  else for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  c.strokeStyle = line; c.lineWidth = w + ow * 2; c.stroke();
  c.strokeStyle = fill; c.lineWidth = w; c.stroke();
}
// Искорка-звёздочка (как в детской книжке)
function sparkle(c, x, y, r, a, col) {
  if (a <= 0.01) return;
  c.save(); c.globalAlpha = a; c.fillStyle = col;
  c.beginPath();
  for (let i = 0; i < 8; i++) { const ang = i * TAU / 8 - Math.PI / 2, rr = i % 2 ? r * 0.22 : r; c.lineTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr); }
  c.closePath(); c.fill(); c.restore();
}

/* ---------- Спрайты свечения (готовятся один раз) ---------------------- */
function sprite(w, h, draw) { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h); return cv; }
const GLOW = sprite(128, 128, (c, w) => {
  const g = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  g.addColorStop(0, 'rgba(255,255,235,1)'); g.addColorStop(0.08, 'rgba(250,255,190,0.95)');
  g.addColorStop(0.22, 'rgba(226,250,120,0.42)'); g.addColorStop(0.5, 'rgba(190,230,90,0.12)'); g.addColorStop(1, 'rgba(160,210,80,0)');
  c.fillStyle = g; c.fillRect(0, 0, w, w);
});
const WARM = sprite(128, 128, (c, w) => {
  const g = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  g.addColorStop(0, 'rgba(255,244,210,1)'); g.addColorStop(0.25, 'rgba(255,214,140,0.5)'); g.addColorStop(1, 'rgba(255,170,90,0)');
  c.fillStyle = g; c.fillRect(0, 0, w, w);
});
// Бумажное зерно: крапинки и волокна
const GRAIN = sprite(256, 256, (c, w) => {
  const img = c.createImageData(w, w), d = img.data;
  for (let i = 0; i < w * w; i++) {
    const x = i % w, y = (i / w) | 0;
    const fib = 0.5 + 0.5 * Math.sin(x * 0.09 + Math.sin(y * 0.05) * 3.1) * Math.sin(y * 0.021 + x * 0.004);
    const v = 222 + (hash(i * 1.37) - 0.5) * 60 + fib * 14;
    d[i * 4] = v + 8; d[i * 4 + 1] = v; d[i * 4 + 2] = v - 16; d[i * 4 + 3] = 255;
  }
  c.putImageData(img, 0, 0);
});

/* ---------- Камера: многоплановая перспектива ---------------------------
   Каждый план имеет параллакс p (0 — горизонт, 1 — сцена-кувшинка,
   больше 1 — передний план). Ватерлиния плана лежит на y = HZ·(p − 1).
   ------------------------------------------------------------------------ */
const VIEW = { c: null, W: 1920, H: 1080, K: 1, cam: { x: 0, y: -150, z: 1, tx: 0, ty: 0, rot: 0 } };
const AX = 0, AY = -150, HZ = 270;
const qOf = (p) => (p <= 1 ? 0.12 + 0.88 * p : 1 + 0.85 * (p - 1));
const wyOf = (p) => HZ * (p - 1);
function layerT(p) {
  const { cam, W, H, K: k } = VIEW;
  const s = k * Math.pow(cam.z, qOf(p));
  return {
    s,
    ox: W / 2 - s * (p * cam.x + (1 - p) * AX) + cam.tx * k,
    oy: H / 2 - s * (p * cam.y + (1 - p) * AY) + cam.ty * k,
  };
}
function useLayer(p) { const L = layerT(p); VIEW.c.setTransform(L.s, 0, 0, L.s, L.ox, L.oy); return L; }
const screenY = (p, y) => { const L = layerT(p); return L.oy + L.s * y; };
const screenX = (p, x) => { const L = layerT(p); return L.ox + L.s * x; };

/* ---------- Небо --------------------------------------------------------- */
function drawSky(c, P, t) {
  const { W, H } = VIEW;
  const hy = screenY(0, -HZ);
  c.setTransform(1, 0, 0, 1, 0, 0);
  const g = c.createLinearGradient(0, hy - H * 1.25, 0, hy);
  g.addColorStop(0, P.sky[0]); g.addColorStop(0.42, P.sky[1]); g.addColorStop(0.78, P.sky[2]); g.addColorStop(1, P.sky[3]);
  c.fillStyle = g; c.fillRect(0, 0, W, Math.max(0, Math.min(H, hy + 4)));
  // звёзды
  if (P.stars > 0.01) {
    for (let i = 0; i < 90; i++) {
      const x = hash(i * 3.1) * W, y = hy - (0.12 + hash(i * 7.7) * 1.1) * H * 0.9;
      if (y < 0 || y > hy - 20) continue;
      const tw = 0.6 + 0.4 * Math.sin(t * (1.3 + hash(i) * 2) + i);
      const a = P.stars * tw * (0.35 + 0.65 * hash(i * 1.9)) * inv(hy - 20, hy - 180, y);
      c.fillStyle = `rgba(255,248,225,${a})`;
      const r = (0.6 + hash(i * 5.3) * 1.3) * VIEW.K * 1.4;
      c.fillRect(x - r / 2, y - r / 2, r, r);
    }
  }
}
// Солнце, луна и облака живут на дальнем плане
function drawSun(c, P) {
  const L = useLayer(0.02);
  const x = 360, y = -HZ - P.sunH;
  c.globalCompositeOperation = 'lighter';
  const R = 520;
  const g = c.createRadialGradient(x, y, 0, x, y, R);
  g.addColorStop(0, css(P.sunGlow[0], P.sunGlow[1], P.sunGlow[2], 0.55 * P.sunA));
  g.addColorStop(0.25, css(P.sunGlow[0], P.sunGlow[1] * 0.9, P.sunGlow[2] * 0.8, 0.22 * P.sunA));
  g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g; c.fillRect(x - R, y - R, R * 2, R * 2);
  c.globalCompositeOperation = 'source-over';
  if (P.sunA > 0.02) {
    const d = c.createRadialGradient(x, y - 10, 0, x, y, 62);
    d.addColorStop(0, `rgba(255,252,236,${P.sunA})`); d.addColorStop(0.7, css(P.sunDisc[0], P.sunDisc[1], P.sunDisc[2], P.sunA)); d.addColorStop(1, css(P.sunDisc[0], P.sunDisc[1] * 0.92, P.sunDisc[2] * 0.85, P.sunA));
    c.fillStyle = d; circ(c, x, y, 62); c.fill();
  }
  // луна
  if (P.moon > 0.01) {
    const mx = -560, my = -HZ - 430;
    c.globalCompositeOperation = 'lighter';
    c.drawImage(WARM, mx - 160, my - 160, 320, 320);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = P.moon;
    c.fillStyle = '#FFF4D6'; circ(c, mx, my, 34); c.fill();
    c.fillStyle = 'rgba(225,205,170,0.5)'; circ(c, mx - 9, my - 6, 7); c.fill(); circ(c, mx + 10, my + 9, 5); c.fill(); circ(c, mx + 4, my - 14, 3.5); c.fill();
    c.globalAlpha = 1;
  }
  return L;
}
const CLOUDS = [
  { x: -700, y: -560, w: 520, h: 42, sp: 4 }, { x: 150, y: -690, w: 700, h: 50, sp: 3 }, { x: 900, y: -470, w: 420, h: 34, sp: 5 },
  { x: -1300, y: -420, w: 380, h: 30, sp: 4 }, { x: 560, y: -380, w: 300, h: 22, sp: 6 }, { x: -200, y: -820, w: 560, h: 46, sp: 2 },
];
function drawClouds(c, P, t) {
  useLayer(0.05);
  for (let i = 0; i < CLOUDS.length; i++) {
    const cl = CLOUDS[i], x = cl.x + t * cl.sp, y = cl.y;
    const g = c.createLinearGradient(0, y - cl.h, 0, y + cl.h);
    g.addColorStop(0, P.cloud[0]); g.addColorStop(0.6, P.cloud[1]); g.addColorStop(1, P.cloud[2]);
    c.fillStyle = g;
    c.beginPath();
    const n = 7;
    for (let k = 0; k < n; k++) {
      const u = k / (n - 1), bx = x - cl.w / 2 + u * cl.w;
      const r = cl.h * (0.55 + 0.6 * Math.sin(u * Math.PI)) * (0.8 + 0.4 * hash(i * 13 + k));
      c.moveTo(bx + r, y - r * 0.2); c.ellipse(bx, y - r * 0.2, r * 1.5, r, 0, 0, TAU);
    }
    c.fill();
    // плоское подсвеченное дно
    c.fillStyle = P.cloud[2];
    ell(c, x, y + cl.h * 0.25, cl.w * 0.55, cl.h * 0.28); c.fill();
  }
}

/* ---------- Дальний берег (силуэт деревьев) ----------------------------- */
function buildShore(seed, x0, x1, base, hMin, hMax, kinds, land) {
  const p = new Path2D();
  let x = x0, i = 0;
  while (x < x1) {
    const r = hash(seed + i * 1.7), kind = kinds[Math.floor(hash(seed * 3 + i) * kinds.length)];
    const h = lerp(hMin, hMax, r);
    if (kind === 'willow') {
      const w = h * 0.9;
      for (let k = 0; k < 6; k++) { const a = k / 5, cy = base - h * 0.55 - Math.sin(a * Math.PI) * h * 0.35; p.moveTo(x + a * w + h * 0.3, cy); p.arc(x + a * w, cy, h * 0.3, 0, TAU); }
      p.rect(x - h * 0.25, base - h * 0.6, w + h * 0.5, h * 0.6);
      x += w * 0.85;
    } else if (kind === 'poplar') {
      p.moveTo(x + h * 0.14, base - h * 0.55); p.ellipse(x, base - h * 0.55, h * 0.14, h * 0.5, 0, 0, TAU);
      p.rect(x - h * 0.1, base - h * 0.2, h * 0.2, h * 0.2);
      x += h * 0.2;
    } else {
      const w = h * 1.4;
      for (let k = 0; k < 4; k++) { const a = k / 3, rr = h * (0.38 + 0.12 * hash(seed + i + k)); p.moveTo(x + a * w + rr, base - rr * 0.8); p.arc(x + a * w, base - rr * 0.8, rr, 0, TAU); }
      p.rect(x - h * 0.2, base - h * 0.6, w + h * 0.4, h * 0.6);
      x += w * 0.8;
    }
    i++;
  }
  p.rect(x0, base - land, x1 - x0, land + 2); // полоска земли до горизонта
  return p;
}
const SHORE_FAR = buildShore(17, -2800, 2800, wyOf(0.1), 90, 210, ['willow', 'poplar', 'bush', 'willow', 'bush'], 34);
const SHORE_NEAR = buildShore(41, -3000, 3000, wyOf(0.18), 40, 95, ['bush', 'bush', 'willow'], 10);
function drawShore(c, P) {
  useLayer(0.1); c.fillStyle = P.far; c.fill(SHORE_FAR);
  useLayer(0.18); c.fillStyle = P.bank; c.fill(SHORE_NEAR);
}

/* ---------- Вода --------------------------------------------------------- */
function drawWaterBase(c, P) {
  const { W, H } = VIEW;
  const hy = screenY(0, -HZ);
  c.setTransform(1, 0, 0, 1, 0, 0);
  if (hy >= H) return;
  const g = c.createLinearGradient(0, hy, 0, Math.max(hy + 10, H));
  g.addColorStop(0, P.water[0]); g.addColorStop(0.16, P.water[1]); g.addColorStop(0.55, P.water[2]); g.addColorStop(1, P.water[3]);
  c.fillStyle = g; c.fillRect(0, Math.max(0, hy - 1), W, H - Math.max(0, hy - 1));
}
function mirror(c, p, y, squash) { // отражение плана p относительно ватерлинии y
  const L = layerT(p);
  c.setTransform(L.s, 0, 0, -L.s * squash, L.ox, L.oy + L.s * y * (1 + squash));
}
function drawWaterDetail(c, P, t, sunScreenX) {
  const { W, H, K: k } = VIEW;
  const hy = screenY(0, -HZ);
  if (hy >= H) return;
  // отражения берегов
  c.save();
  mirror(c, 0.1, wyOf(0.1), 0.9); c.globalAlpha = 0.5; c.fillStyle = P.farRefl; c.fill(SHORE_FAR);
  mirror(c, 0.18, wyOf(0.18), 0.85); c.globalAlpha = 0.6; c.fillStyle = P.bankRefl; c.fill(SHORE_NEAR);
  c.restore();
  c.setTransform(1, 0, 0, 1, 0, 0);
  const rows = 64;
  // солнечная дорожка
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < rows; i++) {
    const p = 0.03 + Math.pow(i / rows, 1.15) * 2.3;
    const L = layerT(p), y = L.oy + L.s * wyOf(p);
    if (y < hy || y > H + 8) continue;
    const w = (26 + 150 * p) * k * (0.6 + 0.4 * Math.min(1, L.s / k));
    const n = 1 + (i % 3);
    for (let j = 0; j < n; j++) {
      const sh = 0.5 + 0.5 * Math.sin(t * (1.7 + hash(i * 3 + j) * 2.3) + i * 1.3 + j * 2.1);
      const off = (hash(i * 5.1 + j) - 0.5) * w * 1.6 + Math.sin(t * 0.6 + i) * 6 * k;
      const len = w * (0.25 + 0.75 * sh) * (1 - Math.abs(off) / (w * 1.2));
      if (len <= 1) continue;
      const a = P.glint * (0.25 + 0.75 * sh) * (1 - (i / rows) * 0.6);
      c.strokeStyle = css(P.glintC[0], P.glintC[1], P.glintC[2], a);
      c.lineWidth = Math.max(1, (1 + p * 2.2) * k);
      c.beginPath(); c.moveTo(sunScreenX + off - len / 2, y); c.lineTo(sunScreenX + off + len / 2, y); c.stroke();
    }
  }
  c.globalCompositeOperation = 'source-over';
  // тонкая рябь по всей глади
  for (let i = 0; i < rows; i++) {
    const p = 0.05 + Math.pow(i / rows, 1.1) * 2.4;
    const L2 = layerT(p), y = L2.oy + L2.s * wyOf(p);
    if (y < hy + 2 || y > H + 4) continue;
    for (let j = 0; j < 5; j++) {
      const wx = (hash(i * 7 + j * 13) * 2 - 1) * 2200 + Math.sin(t * 0.35 + i + j) * 30 + t * 6 * (j % 2 ? 1 : -1);
      const x = L2.ox + L2.s * wx, len = (50 + 140 * hash(i + j * 3)) * L2.s;
      if (x + len < 0 || x - len > W) continue;
      c.strokeStyle = j % 2 ? P.rippleLight : P.rippleDark;
      c.lineWidth = Math.max(0.8, 1.6 * L2.s);
      c.beginPath(); c.moveTo(x - len / 2, y); c.quadraticCurveTo(x, y - 1.5 * L2.s, x + len / 2, y); c.stroke();
    }
  }
}

/* ---------- Камыш и рогоз ------------------------------------------------ */
// Лист: изогнутая сужающаяся лента от основания к кончику
function blade(c, x, y, h, lean, w, col) {
  const tx = x + lean * h, ty = y - h, cx = x + lean * h * 0.15, cy = y - h * 0.62;
  const N = 7, L = [], R = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N, a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, d = u * u;
    const px = a * x + b * cx + d * tx, py = a * y + b * cy + d * ty;
    const dx = 2 * (1 - u) * (cx - x) + 2 * u * (tx - cx), dy = 2 * (1 - u) * (cy - y) + 2 * u * (ty - cy);
    const len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len, hw = w * (1 - u * 0.96) * 0.5;
    L.push([px + nx * hw, py + ny * hw]); R.push([px - nx * hw, py - ny * hw]);
  }
  c.beginPath(); c.moveTo(L[0][0], L[0][1]);
  for (let i = 1; i <= N; i++) c.lineTo(L[i][0], L[i][1]);
  for (let i = N; i >= 0; i--) c.lineTo(R[i][0], R[i][1]);
  c.closePath(); c.fillStyle = col; c.fill();
  return [tx, ty, cx, cy];
}
function cattail(c, x, y, h, lean, col, headCol, rim) {
  const [tx, ty, cx, cy] = blade(c, x, y, h, lean, 3.2, col);
  // головка рогоза у верхушки стебля
  const u = 0.8, a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, d = u * u;
  const hx = a * x + b * cx + d * tx, hy = a * y + b * cy + d * ty;
  const ang = Math.atan2(ty - hy, tx - hx) + Math.PI / 2;
  c.save(); c.translate(hx, hy); c.rotate(ang);
  c.fillStyle = headCol; c.beginPath(); c.roundRect(-5.5, -h * 0.12, 11, h * 0.2, 5.5); c.fill();
  if (rim) { c.strokeStyle = rim; c.lineWidth = 1.6; c.beginPath(); c.moveTo(4.5, -h * 0.1); c.lineTo(4.5, h * 0.06); c.stroke(); }
  c.restore();
}
// Кусты камыша: позиции задаются один раз
function makeClumps() {
  const out = [];
  const add = (p, x, n, hMin, hMax, spread, cat) => {
    for (let i = 0; i < n; i++) {
      const r = hash(x * 0.37 + i * 9.1 + p * 100);
      out.push({ p, x: x + (hash(i * 3.3 + x) - 0.5) * spread, h: lerp(hMin, hMax, r), lean: (hash(i * 5.7 + x) - 0.5) * 0.5, ph: hash(i + x) * TAU, cat: cat && i % 4 === 1 });
    }
  };
  add(0.32, -1250, 16, 70, 150, 360, true); add(0.32, 1150, 14, 60, 140, 320, true);
  add(0.45, -1500, 18, 110, 220, 420, true); add(0.45, 1450, 16, 110, 230, 380, true);
  add(0.62, -1300, 12, 150, 300, 300, true); add(0.62, 1380, 14, 160, 320, 320, true);
  add(0.36, -380, 6, 50, 90, 120, false); add(0.4, 620, 5, 50, 100, 110, true);
  out.sort((a, b) => a.p - b.p);
  return out;
}
const CLUMPS = makeClumps();
function drawReeds(c, P, t, pMin, pMax, refl) {
  for (const r of CLUMPS) {
    if (r.p < pMin || r.p >= pMax) continue;
    const L = layerT(r.p);
    const y = wyOf(r.p), sw = Math.sin(t * 0.9 + r.ph) * 0.04 + Math.sin(t * 2.1 + r.ph * 2) * 0.012;
    if (refl) {
      mirror(c, r.p, y, 0.8);
      blade(c, r.x, y, r.h, r.lean + sw, 6 + r.h * 0.03, P.reedRefl);
      continue;
    }
    c.setTransform(L.s, 0, 0, L.s, L.ox, L.oy);
    const col = r.p < 0.4 ? P.reedFar : P.reedMid;
    if (r.cat) cattail(c, r.x, y, r.h * 1.1, r.lean * 0.6 + sw, col, P.cattail, rimC(0.5));
    else blade(c, r.x, y, r.h, r.lean + sw, 6 + r.h * 0.03, col);
  }
}

/* ---------- Кувшинки на воде -------------------------------------------- */
function makePads() {
  const out = [];
  const spots = [[0.25, -700, 60], [0.28, 420, 50], [0.34, -1000, 70], [0.38, 900, 60], [0.42, -160, 55], [0.5, -820, 90], [0.52, 1100, 80],
    [0.6, 660, 70], [0.66, -560, 90], [0.74, 920, 85], [0.8, -1050, 110], [0.86, 480, 60], [1.2, -780, 120], [1.25, 860, 130], [1.3, 180, 90], [1.45, -300, 140], [1.6, 1100, 170], [1.7, -1200, 180]];
  spots.forEach(([p, x, r], i) => out.push({ p, x, r, rot: hash(i * 3.3) * TAU, flower: i % 3 === 1 ? (i % 2 ? 'pink' : 'white') : null, ph: hash(i) * TAU }));
  return out;
}
const PADS = makePads();
function lilyPad(c, x, y, rx, ry, rot, base, light, dark, rim, veins = true) {
  // лист с вырезом
  const notch = 0.28;
  c.beginPath();
  c.moveTo(x, y);
  c.ellipse(x, y, rx, ry, 0, rot + notch, rot + TAU - notch);
  c.closePath();
  const g = c.createLinearGradient(0, y - ry, 0, y + ry);
  g.addColorStop(0, light); g.addColorStop(1, base);
  c.fillStyle = g; c.fill();
  c.lineWidth = Math.max(1, rx * 0.02); c.strokeStyle = dark; c.stroke();
  if (veins) {
    c.strokeStyle = rim; c.lineWidth = Math.max(0.6, rx * 0.012);
    c.beginPath();
    for (let k = 1; k < 12; k++) {
      const a = rot + notch + (TAU - 2 * notch) * k / 12;
      c.moveTo(x, y); c.lineTo(x + Math.cos(a) * rx * 0.9, y + Math.sin(a) * ry * 0.9);
    }
    c.stroke();
  }
}
function waterLily(c, x, y, s, kind) {
  const petal = kind === 'pink' ? ['#F6B7C8', '#E77F9E'] : ['#FFF6EA', '#EBD9C6'];
  for (let ring = 0; ring < 2; ring++) {
    const n = ring ? 7 : 8, len = s * (ring ? 0.75 : 1), wdt = s * 0.26;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + ring * 0.4;
      const px = x + Math.cos(a) * len * 0.45, py = y + Math.sin(a) * len * 0.16 - (ring ? s * 0.22 : s * 0.06);
      c.save(); c.translate(px, py); c.rotate(a + Math.PI / 2 + (ring ? 0 : 0));
      c.scale(1, 0.5 + 0.5 * Math.abs(Math.cos(a)));
      c.beginPath(); c.moveTo(0, len * 0.4); c.quadraticCurveTo(wdt, 0, 0, -len * 0.45); c.quadraticCurveTo(-wdt, 0, 0, len * 0.4);
      c.fillStyle = lit(ring ? petal[0] : petal[1]); c.fill();
      c.restore();
    }
  }
  c.fillStyle = lit('#F5C542'); ell(c, x, y - s * 0.26, s * 0.17, s * 0.1); c.fill();
}
function drawPads(c, P, t, pMin, pMax) {
  for (const pd of PADS) {
    if (pd.p < pMin || pd.p >= pMax) continue;
    useLayer(pd.p);
    const y = wyOf(pd.p) + Math.sin(t * 0.8 + pd.ph) * 1.2;
    const flat = 0.06 + 0.12 * pd.p;
    c.fillStyle = 'rgba(10,30,30,0.18)'; ell(c, pd.x + 3, y + pd.r * flat * 0.25, pd.r * 1.02, pd.r * flat * 1.05); c.fill();
    lilyPad(c, pd.x, y, pd.r, pd.r * flat, pd.rot, lit('#3F7F3A'), lit('#7DB34F'), lit('#2A5A2E'), lit('#9CCB6A', 0.55), pd.p > 0.45);
    if (pd.flower) waterLily(c, pd.x + pd.r * 0.15, y - pd.r * flat * 0.2, pd.r * 0.42, pd.flower);
  }
}

/* ---------- Светлячки ---------------------------------------------------- */
function drawGlow(c, x, y, r, a) {
  if (a <= 0.01) return;
  c.globalAlpha = Math.min(1, a);
  c.drawImage(GLOW, x - r, y - r, r * 2, r * 2);
}

/* ---------- Бумага и виньетка ------------------------------------------- */
function drawPaper(c, amt) {
  const { W, H } = VIEW;
  c.setTransform(1, 0, 0, 1, 0, 0);
  if (!c.__grain) c.__grain = c.createPattern(GRAIN, 'repeat');
  const grainPat = c.__grain;
  c.globalCompositeOperation = 'multiply';
  c.globalAlpha = amt;
  c.fillStyle = grainPat;
  const s = Math.max(1, VIEW.K * 1.2);
  c.save(); c.scale(s, s); c.fillRect(0, 0, W / s + 1, H / s + 1); c.restore();
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
}
function drawVignette(c, amt, col = '40,22,20', cx = 0.5, cy = 0.5, r0 = 0.45) {
  const { W, H } = VIEW;
  c.setTransform(1, 0, 0, 1, 0, 0);
  const g = c.createRadialGradient(W * cx, H * cy, Math.min(W, H) * r0 * 0.5, W * cx, H * cy, Math.hypot(W, H) * 0.62);
  g.addColorStop(0, `rgba(${col},0)`); g.addColorStop(1, `rgba(${col},${amt})`);
  c.fillStyle = g; c.fillRect(0, 0, W, H);
}
