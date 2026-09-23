(() => {
'use strict';

/* ================================================================
   Оптика объектива. Ночная улица снята «камерой» с тонкой линзой:
   каждый огонь — точечный источник, его кружок нерезкости считается
   по формуле тонкой линзы и рисуется формой диафрагмы (боке),
   с сохранением энергии. Геометрия улицы размывается послойно.
   ================================================================ */

const $ = (s) => document.querySelector(s);
const SHOT = !!window.__SHOT__;
const COC_MM = 0.03;           // допустимый кружок нерезкости для полного кадра
const SENSOR_H = 24;           // высота матрицы, мм
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const nf1 = (v) => v.toLocaleString('ru-RU', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const nf2 = (v) => v.toLocaleString('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const fmtM = (m) => (!isFinite(m) ? '∞' : m >= 100 ? `${Math.round(m)} м` : m >= 10 ? `${nf1(m)} м` : `${nf2(m)} м`);

/* ---------- Состояние камеры ---------- */
const FOCALS = [24, 28, 35, 50, 85, 105, 135, 200];
const STOPS = [1.4, 2, 2.8, 4, 5.6, 8, 11, 16];
const cam = {
  f: 85, N: 1.4, focus: 6.5, blades: 7, keepSize: false, tab: 'focus',
  target: { f: 85, N: 1.4, focus: 6.5 },
};
const SIGN_Z = 6.5;   // неоновая вывеска стоит в 6,5 м от исходной точки съёмки
const BASE_F = 85;
function camZ() { return cam.keepSize ? SIGN_Z - SIGN_Z * (cam.f / BASE_F) : 0; }

/* ---------- Оптика ---------- */
// Кружок нерезкости на матрице (мм) для точки на расстоянии s, при фокусе на S.
function cocMM(s, S, f, N) {
  const fm = f / 1000, A = fm / N;             // метры
  const c = (A * Math.abs(s - S) / s) * (fm / (S - fm));
  return c * 1000;
}
function dof(S, f, N) {
  const fm = f / 1000, c = COC_MM / 1000;
  const Hf = (fm * fm) / (N * c) + fm;
  const near = (S * (Hf - fm)) / (Hf + S - 2 * fm);
  const far = S < Hf ? (S * (Hf - fm)) / (Hf - S) : Infinity;
  return { Hf, near, far };
}

/* ---------- Случайность ---------- */
function RNG(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* ================================================================
   Сцена: ночная улица (метры, камера смотрит вдоль +z, y — вверх)
   ================================================================ */
const scene = (() => {
  const r = RNG(1968);
  const lights = [];     // {x,y,z,col,p}
  const facades = [];    // {side, z0, z1, h, col}
  const windows = [];    // {side, z0, z1, y0, y1, col, a}
  const warm = ['#FFB347', '#FFC870', '#FF9F4A', '#FFD9A0', '#FFE6B8'];
  const tints = ['#FF6B6B', '#7BD3FF', '#9BFFB0', '#FFD36B', '#D69BFF'];
  // Фасады вдоль улицы
  for (const side of [-1, 1]) {
    let z = 2 + r() * 3;
    while (z < 260) {
      const len = 7 + r() * 14, h = 9 + r() * 20;
      facades.push({ side, z0: z, z1: z + len, h, x: side * (6.2 + r() * 0.8), shade: 0.6 + r() * 0.4 });
      // окна
      for (let fy = 3; fy < h - 1.5; fy += 3.1) {
        for (let fz = z + 1; fz < z + len - 1; fz += 2.4) {
          if (r() < 0.38) windows.push({ side, x: side * 6.1, z0: fz, z1: fz + 1.2, y0: fy, y1: fy + 1.6, col: r() < 0.8 ? warm[Math.floor(r() * warm.length)] : '#9FC8FF', a: 0.35 + r() * 0.5 });
        }
      }
      z += len + (r() < 0.25 ? 3 + r() * 6 : 0.2);
    }
  }
  // Гирлянды зигзагом над улицей
  for (let z = 7; z < 75; z += 6 + r() * 3) {
    const sag = 0.35 + r() * 0.35, y = 3.9 + r() * 0.6, dz = 4 + r() * 2, n = 20;
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = lerp(-6, 6, t), yy = y - Math.sin(t * Math.PI) * sag;
      lights.push({ x, y: yy, z: z + dz * t, col: r() < 0.82 ? warm[Math.floor(r() * warm.length)] : tints[Math.floor(r() * tints.length)], p: 0.55 + r() * 0.35 });
    }
  }
  // Фонари по обеим сторонам
  const lamps = [];
  for (let z = 9; z < 220; z += 17) for (const side of [-1, 1]) { const l = { x: side * 5.2, y: 4.9, z: z + (side > 0 ? 8 : 0), col: '#FFE2A8', p: 2.4 }; lights.push(l); lamps.push(l); }
  // Огни далёкого города
  for (let i = 0; i < 55; i++) lights.push({ x: (r() - 0.5) * 50, y: 1 + r() * 12, z: 270 + r() * 200, col: r() < 0.7 ? warm[Math.floor(r() * 5)] : tints[Math.floor(r() * 5)], p: 0.6 + r() * 1.2 });
  // Передний план: гирлянда прямо перед объективом — снимаем сквозь неё
  for (let i = 0; i < 8; i++) { const t = i / 7; lights.push({ x: lerp(-0.34, 0.36, t), y: 1.13 + Math.sin(t * Math.PI) * -0.06 + (i % 2) * 0.03, z: 0.78 + Math.sin(t * 2.4) * 0.16, col: warm[(i * 2) % warm.length], p: 0.75, fg: true }); }
  return { lights, facades, windows, lamps };
})();

/* ================================================================
   Рендер видоискателя (Canvas 2D)
   ================================================================ */
const vf = $('#vf'), g = vf.getContext('2d');
let VW = 0, VH = 0, DPR = 1;
const layerCv = document.createElement('canvas'), lg = layerCv.getContext('2d');
const tmpCv = document.createElement('canvas'), tg = tmpCv.getContext('2d');
const tmp2 = document.createElement('canvas'), t2 = tmp2.getContext('2d');

function resizeVF() {
  const r = vf.getBoundingClientRect();
  DPR = SHOT ? 1 : Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(r.width * DPR), h = Math.round(r.height * DPR);
  if (w === VW && h === VH) return false;
  VW = vf.width = layerCv.width = w;
  VH = vf.height = layerCv.height = h;
  return true;
}
// Проекция точки мира на кадр
function proj(x, y, z) {
  const zz = z - camZ();
  if (zz <= 0.05) return null;
  const k = (cam.f / (SENSOR_H / 2)) * (VH / 2);
  return [VW / 2 + (x / zz) * k, VH * 0.54 - ((y - 1.45) / zz) * k, zz];
}
function blurPx(zWorld) {
  const s = zWorld - camZ();
  return (cocMM(s, cam.focus, cam.f, cam.N) / SENSOR_H) * VH / 2;   // радиус в пикселях
}
// Размытие слоя сжатием-растяжением (дёшево и работает в любом браузере)
function blurLayer(radius) {
  if (radius < 0.7) return layerCv;
  const s = clamp(1.6 / radius, 1 / 48, 1);
  const w = Math.max(1, Math.round(VW * s)), h = Math.max(1, Math.round(VH * s));
  tmpCv.width = w; tmpCv.height = h;
  tg.imageSmoothingEnabled = true; tg.imageSmoothingQuality = 'high';
  // двухступенчатое сжатие мягче одноступенчатого
  const w2 = Math.max(1, Math.round(VW * Math.min(1, s * 2.2))), h2 = Math.max(1, Math.round(VH * Math.min(1, s * 2.2)));
  tmp2.width = w2; tmp2.height = h2;
  t2.imageSmoothingEnabled = true; t2.imageSmoothingQuality = 'high';
  t2.drawImage(layerCv, 0, 0, w2, h2);
  tg.drawImage(tmp2, 0, 0, w, h);
  t2.clearRect(0, 0, w2, h2);
  t2.drawImage(tmpCv, 0, 0, w2, h2);
  return tmp2;
}
const BINS = [0.5, 1.5, 2.6, 3.4, 4.0, 4.6, 5.6, 8, 12, 20, 35, 60, 110, 1000];
function binOf(z) { for (let i = 0; i < BINS.length - 1; i++) if (z < BINS[i + 1]) return i; return BINS.length - 2; }

function drawSky() {
  const gr = g.createLinearGradient(0, 0, 0, VH);
  gr.addColorStop(0, '#05060F');
  gr.addColorStop(0.45, '#11122A');
  gr.addColorStop(0.62, '#2A1B3A');
  gr.addColorStop(0.7, '#3A2233');
  gr.addColorStop(1, '#07070C');
  g.fillStyle = gr;
  g.fillRect(0, 0, VW, VH);
}
function drawFacadesInto(ctx, zMin, zMax) {
  for (const f of scene.facades) {
    const z0 = Math.max(f.z0, zMin), z1 = Math.min(f.z1, zMax);
    if (z1 <= z0) continue;
    const a = proj(f.x, 0, z0), b = proj(f.x, 0, z1), c = proj(f.x, f.h, z1), d = proj(f.x, f.h, z0);
    if (!a || !b || !c || !d) continue;
    const l = 9 + f.shade * 10;
    ctx.fillStyle = `rgb(${l},${l - 1},${l + 7})`;
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.closePath(); ctx.fill();
    // карниз
    ctx.strokeStyle = 'rgba(255,190,120,0.07)'; ctx.lineWidth = Math.max(1, 2 * DPR);
    ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.stroke();
  }
  for (const w of scene.windows) {
    const z0 = Math.max(w.z0, zMin), z1 = Math.min(w.z1, zMax);
    if (z1 <= z0) continue;
    const a = proj(w.x, w.y0, z0), b = proj(w.x, w.y0, z1), c = proj(w.x, w.y1, z1), d = proj(w.x, w.y1, z0);
    if (!a || !b || !c || !d) continue;
    ctx.globalAlpha = w.a;
    ctx.fillStyle = w.col;
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
  }
}
function drawRoadInto(ctx, zMin, zMax) {
  const z0 = Math.max(zMin, 0.5 + camZ()), z1 = zMax;
  if (z1 <= z0) return;
  const a = proj(-6, 0, z0), b = proj(6, 0, z0), c = proj(6, 0, z1), d = proj(-6, 0, z1);
  if (!a || !c) return;
  ctx.fillStyle = '#0B0A10';
  ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.closePath(); ctx.fill();
  // разметка
  ctx.fillStyle = 'rgba(230,220,200,0.16)';
  for (let z = Math.ceil(z0 / 6) * 6; z < z1; z += 6) {
    const p0 = proj(-0.08, 0, z), p1 = proj(0.08, 0, z), p2 = proj(0.08, 0, Math.min(z + 2.5, z1)), p3 = proj(-0.08, 0, Math.min(z + 2.5, z1));
    if (!p0 || !p2) continue;
    ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.lineTo(p3[0], p3[1]); ctx.closePath(); ctx.fill();
  }
}
// Мокрый асфальт: вертикальные дорожки отражений под фонарями и вывеской
function drawReflectionsInto(ctx, zMin, zMax) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const streak = (x, y, z, col, a, wMeters) => {
    const top = proj(x, 0.02, z), bot = proj(x, -y * 0.9, z);
    if (!top || !bot) return;
    const k = (cam.f / (SENSOR_H / 2)) * (VH / 2) / top[2];
    const w = Math.max(1.5 * DPR, wMeters * k);
    const gr = ctx.createLinearGradient(0, top[1], 0, bot[1]);
    gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = a;
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.ellipse(top[0], (top[1] + bot[1]) / 2, w, Math.max(2, (bot[1] - top[1]) / 2), 0, 0, Math.PI * 2); ctx.fill();
  };
  for (const l of scene.lamps) if (l.z >= zMin && l.z < zMax) streak(l.x * 0.92, l.y, l.z, '#FFD9A0', 0.32, 0.22);
  if (SIGN_Z >= zMin && SIGN_Z < zMax) { streak(1.0, 1.78, SIGN_Z + 0.4, '#FF3D7F', 0.34, 0.45); streak(1.7, 1.78, SIGN_Z + 0.4, '#FF5A93', 0.26, 0.35); }
  ctx.restore();
}
function drawLampPostsInto(ctx, zMin, zMax) {
  ctx.strokeStyle = '#141219';
  for (const l of scene.lamps) {
    if (l.z < zMin || l.z >= zMax) continue;
    const a = proj(l.x * 1.06, 0, l.z), b = proj(l.x * 1.06, l.y, l.z), c = proj(l.x * 0.8, l.y + 0.1, l.z);
    if (!a || !b) continue;
    ctx.lineWidth = Math.max(1, (0.14 / a[2]) * (cam.f / 12) * (VH / 2));
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.stroke();
  }
}
// Неоновая вывеска — главный объект, на него наведён фокус по умолчанию
function drawSignInto(ctx) {
  const x = 1.35, y = 1.78, z = SIGN_Z;
  const p = proj(x, y, z);
  if (!p) return;
  const k = (cam.f / (SENSOR_H / 2)) * (VH / 2) / p[2];
  const w = 1.7 * k, h = 0.52 * k;
  // кронштейн
  const br = proj(3.2, y + 0.42, z), bl = proj(x - 0.85, y + 0.42, z);
  ctx.strokeStyle = '#1D1A22'; ctx.lineWidth = Math.max(1, 0.05 * k);
  if (br && bl) { ctx.beginPath(); ctx.moveTo(br[0], br[1]); ctx.lineTo(bl[0], bl[1]); ctx.stroke(); }
  ctx.fillStyle = '#0E0C12';
  ctx.fillRect(p[0] - w / 2, p[1] - h / 2, w, h);
  ctx.strokeStyle = '#2A2530'; ctx.lineWidth = Math.max(1, 0.03 * k);
  ctx.strokeRect(p[0] - w / 2, p[1] - h / 2, w, h);
  ctx.font = `${Math.round(h * 0.62)}px Comfortaa, "Arial Rounded MT Bold", sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  for (const [blur, lw, col, alpha] of [[0.5, 0.075, '#FF3D7F', 0.55], [0.18, 0.05, '#FF5A93', 0.9], [0, 0.022, '#FFE3EE', 1]]) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = '#FF2F74'; ctx.shadowBlur = blur * h;
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, lw * h * 2.2);
    ctx.strokeText('ОПТИКА', p[0], p[1] + h * 0.04);
    ctx.restore();
  }
  signBox = [p[0] - w / 2, p[1] - h / 2, p[0] + w / 2, p[1] + h / 2];
}
let signBox = null;

// Форма боке: многоугольник лепестков, скруглённый на открытой диафрагме, с «кошачьим глазом» у краёв кадра
function bokehPath(ctx, x, y, r) {
  const n = cam.blades;
  const round = n === 0 ? 1 : clamp((2.8 - cam.N) / 1.4, 0, 1) * 0.85;
  ctx.beginPath();
  const rot = -Math.PI / 2 + 0.3;
  const steps = n === 0 ? 40 : n * 6;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2 + rot;
    let rr = r;
    if (n > 0) {
      const seg = (Math.PI * 2) / n;
      const local = ((a - rot) % seg + seg) % seg - seg / 2;
      const poly = Math.cos(seg / 2) / Math.cos(local);
      rr = r * lerp(poly, 1, round) * lerp(0.94, 1, round);
    }
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath();
}
function drawLights() {
  g.globalCompositeOperation = 'lighter';
  const cx = VW / 2, cy = VH / 2, diag = Math.hypot(cx, cy);
  const cat = clamp((4 - cam.N) / 2.6, 0, 1);
  for (const l of scene.lights) {
    const p = proj(l.x, l.y, l.z);
    if (!p) continue;
    const r = Math.abs(blurPx(l.z));
    if (p[0] < -r - 20 || p[0] > VW + r + 20 || p[1] < -r - 20 || p[1] > VH + r + 20) continue;
    const power = l.p * clamp(Math.pow(12 / p[2], 1.15), 0.07, 1.3) * DPR;
    if (r < 1.6 * DPR) {
      const s = (1.2 + power * 2.2) * DPR;
      const gr = g.createRadialGradient(p[0], p[1], 0, p[0], p[1], s * 3);
      gr.addColorStop(0, '#FFFFFF');
      gr.addColorStop(0.18, l.col);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = clamp(0.35 + power * 0.5, 0, 1);
      g.fillStyle = gr;
      g.fillRect(p[0] - s * 3, p[1] - s * 3, s * 6, s * 6);
      continue;
    }
    // энергия точки размазывается по площади кружка
    const alpha = clamp((power * 34 * DPR * DPR) / (r * r + 18), 0.018, 0.95);
    g.save();
    // оптическое виньетирование: у краёв кадра кружок срезается в «кошачий глаз»
    const ex = (p[0] - cx) / diag, ey = (p[1] - cy) / diag;
    const e = Math.hypot(ex, ey);
    if (cat > 0 && e > 0.25) {
      g.beginPath();
      g.arc(p[0] - ex * r * 1.25 * cat * e, p[1] - ey * r * 1.25 * cat * e, r * 1.02, 0, Math.PI * 2);
      g.clip();
    }
    g.globalAlpha = alpha;
    const gr = g.createRadialGradient(p[0], p[1], 0, p[0], p[1], r);
    gr.addColorStop(0, l.col);
    gr.addColorStop(0.82, l.col);
    gr.addColorStop(0.97, '#FFFFFF');
    gr.addColorStop(1, l.col);
    g.fillStyle = gr;
    bokehPath(g, p[0], p[1], r);
    g.fill();
    g.restore();
  }
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
}
function renderVF() {
  drawSky();
  // дальние слои → ближние; каждый слой размыт своим кружком
  for (let bi = BINS.length - 2; bi >= 0; bi--) {
    const z0 = BINS[bi] + camZ(), z1 = BINS[bi + 1] + camZ();
    const zc = Math.min(Math.sqrt(z0 * z1), 400);
    lg.clearRect(0, 0, VW, VH);
    drawRoadInto(lg, z0, z1);
    drawFacadesInto(lg, z0, z1);
    drawReflectionsInto(lg, z0, z1);
    drawLampPostsInto(lg, z0, z1);
    if (SIGN_Z >= z0 && SIGN_Z < z1) drawSignInto(lg);
    const src = blurLayer(Math.abs(blurPx(zc)));
    g.drawImage(src, 0, 0, VW, VH);
  }
  drawLights();
  // лёгкая виньетка
  const vg = g.createRadialGradient(VW / 2, VH / 2, VH * 0.3, VW / 2, VH / 2, Math.hypot(VW, VH) * 0.62);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.5)');
  g.fillStyle = vg;
  g.fillRect(0, 0, VW, VH);
}

/* ================================================================
   Лучевая схема
   ================================================================ */
const rd = $('#rays'), rg = rd.getContext('2d');
let RW = 0, RH = 0, RD = 1;
function resizeRays() {
  const r = rd.getBoundingClientRect();
  RD = SHOT ? 1.5 : Math.min(window.devicePixelRatio || 1, 2);
  RW = rd.width = Math.round(r.width * RD);
  RH = rd.height = Math.round(r.height * RD);
}
function renderRays() {
  const W = RW, H = RH, k = RD;
  rg.clearRect(0, 0, W, H);
  const ax = H * 0.5;                       // оптическая ось
  const lensX = W * 0.62;
  const fm = cam.f / 1000;
  // схема не в масштабе: предметы — в логарифмической шкале, за линзой — растянуто
  const objX = (s) => lensX - (Math.log10(s / 0.4) / Math.log10(200 / 0.4)) * (lensX - 26 * k);
  const v = (s) => (fm * s) / (s - fm);     // расстояние до изображения
  const vFocus = v(cam.focus);
  const sensorX = lensX + W * 0.26;
  const imgX = (s) => lensX + (v(s) / vFocus) * (sensorX - lensX);
  const apR = Math.min(H * 0.36, (H * 0.36 * 1.4) / cam.N * 1.25);
  // ось
  rg.strokeStyle = 'rgba(236,231,221,0.25)'; rg.lineWidth = k; rg.setLineDash([4 * k, 5 * k]);
  rg.beginPath(); rg.moveTo(8 * k, ax); rg.lineTo(W - 8 * k, ax); rg.stroke(); rg.setLineDash([]);
  // матрица
  rg.fillStyle = '#2B2A2E'; rg.fillRect(sensorX - 2 * k, ax - H * 0.3, 4 * k, H * 0.6);
  rg.fillStyle = 'rgba(236,231,221,0.75)'; rg.font = `${12 * k}px Manrope, sans-serif`; rg.textAlign = 'center';
  rg.fillText('матрица', sensorX, ax + H * 0.3 + 16 * k);
  const pts = [
    { s: cam.focus, col: '#FF5A93', label: 'в фокусе', h: 0.16 },
    { s: 60, col: '#FFC870', label: 'дальний фонарь', h: -0.22 },
    { s: 0.9, col: '#7BD3FF', label: 'гирлянда у объектива', h: 0.3 },
  ];
  for (const p of pts) {
    const ox = objX(p.s), oy = ax - p.h * H;
    const ix = imgX(p.s), iy = ax + (p.h * H) * (ix - lensX) / (lensX - ox) * 0.9;
    // пучок через край диафрагмы, центр и другой край
    rg.strokeStyle = p.col; rg.globalAlpha = 0.85; rg.lineWidth = 1.4 * k;
    for (const t of [-1, 0, 1]) {
      const ly = ax + t * apR;
      const slope = (iy - ly) / (ix - lensX);
      const sy = ly + slope * (sensorX - lensX);
      rg.beginPath(); rg.moveTo(ox, oy); rg.lineTo(lensX, ly); rg.lineTo(sensorX, sy); rg.stroke();
      if (ix > sensorX) { rg.globalAlpha = 0.25; rg.setLineDash([3 * k, 4 * k]); rg.beginPath(); rg.moveTo(sensorX, sy); rg.lineTo(ix, iy); rg.stroke(); rg.setLineDash([]); rg.globalAlpha = 0.85; }
    }
    rg.globalAlpha = 1;
    // пятно на матрице
    const s1 = ax + (-apR) + ((iy - (ax - apR)) / (ix - lensX)) * (sensorX - lensX);
    const s2 = ax + apR + ((iy - (ax + apR)) / (ix - lensX)) * (sensorX - lensX);
    rg.strokeStyle = p.col; rg.lineWidth = 6 * k; rg.lineCap = 'round';
    rg.beginPath(); rg.moveTo(sensorX + 7 * k, Math.min(s1, s2)); rg.lineTo(sensorX + 7 * k, Math.max(s1, s2) + 0.01); rg.stroke(); rg.lineCap = 'butt';
    // точка-предмет
    rg.fillStyle = p.col; rg.beginPath(); rg.arc(ox, oy, 4.5 * k, 0, Math.PI * 2); rg.fill();
  }
  // линза
  rg.fillStyle = 'rgba(142,196,230,0.16)'; rg.strokeStyle = 'rgba(190,225,245,0.8)'; rg.lineWidth = 1.5 * k;
  const lh = H * 0.38;
  rg.beginPath(); rg.moveTo(lensX, ax - lh); rg.quadraticCurveTo(lensX + 22 * k, ax, lensX, ax + lh); rg.quadraticCurveTo(lensX - 22 * k, ax, lensX, ax - lh); rg.fill(); rg.stroke();
  // диафрагма
  rg.fillStyle = '#E8763A';
  rg.fillRect(lensX - 3 * k, ax - lh - 4 * k, 6 * k, lh - apR + 4 * k);
  rg.fillRect(lensX - 3 * k, ax + apR, 6 * k, lh - apR + 4 * k);
  rg.fillStyle = 'rgba(236,231,221,0.75)'; rg.textAlign = 'center';
  rg.fillText('линза', lensX, ax + lh + 16 * k);
  const leg = document.getElementById('legend');
  if (leg) leg.innerHTML = pts.map((q) => `<span><i style="background:${q.col}"></i>${q.label} — ${fmtM(q.s)}</span>`).join('');
}

/* ================================================================
   Кольца объектива
   ================================================================ */
function makeRing(el, opts) {
  const track = el.querySelector('.ring-track');
  const state = { value: opts.get(), dragging: false, startX: 0, startV: 0 };
  const ticks = opts.ticks;
  track.innerHTML = ticks.map((t) => `<span class="tk" data-v="${t.v}"><b>${t.label}</b></span>`).join('');
  const pxPerUnit = () => el.clientWidth / (opts.span * (el.clientWidth < 520 ? 0.62 : 1));
  function layout() {
    const v = opts.toUnit(opts.get());
    const w = el.clientWidth;
    track.querySelectorAll('.tk').forEach((tk) => {
      const u = opts.toUnit(+tk.dataset.v);
      const x = w / 2 + (u - v) * pxPerUnit();
      tk.style.transform = `translateX(${x.toFixed(1)}px)`;
      const d = Math.abs(u - v) / ((el.clientWidth / pxPerUnit()) / 2);
      tk.style.opacity = String(clamp(1.15 - d * 1.1, 0, 1));
      tk.classList.toggle('near', Math.abs(u - v) < 0.12);
    });
    const knurl = el.querySelector('.knurl');
    knurl.style.backgroundPositionX = `${(-v * pxPerUnit()).toFixed(1)}px`;
  }
  el.addEventListener('pointerdown', (e) => {
    el.setPointerCapture(e.pointerId);
    state.dragging = true; state.startX = e.clientX; state.startU = opts.toUnit(opts.get());
    el.classList.add('grab');
  });
  el.addEventListener('pointermove', (e) => {
    if (!state.dragging) return;
    const u = clamp(state.startU - (e.clientX - state.startX) / pxPerUnit(), opts.min, opts.max);
    opts.set(opts.fromUnit(u), false);
  });
  const end = () => {
    if (!state.dragging) return;
    state.dragging = false; el.classList.remove('grab');
    if (opts.snap) opts.set(opts.snap(opts.get()), true);
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('wheel', (e) => { e.preventDefault(); const u = clamp(opts.toUnit(opts.get()) + e.deltaY * 0.004, opts.min, opts.max); opts.set(opts.fromUnit(u), false); }, { passive: false });
  el.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    opts.step(e.key === 'ArrowRight' ? 1 : -1);
  });
  return { layout };
}
const log2 = Math.log2;
const rings = {};
function buildRings() {
  rings.focal = makeRing($('#ringFocal'), {
    get: () => cam.target.f, span: 3.2, min: log2(24), max: log2(200),
    toUnit: (v) => log2(v), fromUnit: (u) => 2 ** u,
    ticks: FOCALS.map((v) => ({ v, label: String(v) })),
    set: (v, snap) => { cam.target.f = snap ? v : v; changed(); },
    snap: (v) => FOCALS.reduce((a, b) => (Math.abs(log2(b / v)) < Math.abs(log2(a / v)) ? b : a)),
    step: (d) => { const i = clamp(FOCALS.indexOf(rings.focal.snapVal()) + d, 0, FOCALS.length - 1); cam.target.f = FOCALS[i]; changed(); },
  });
  rings.focal.snapVal = () => FOCALS.reduce((a, b) => (Math.abs(log2(b / cam.target.f)) < Math.abs(log2(a / cam.target.f)) ? b : a));
  rings.ap = makeRing($('#ringAp'), {
    get: () => cam.target.N, span: 5.2, min: log2(1.4) * 2, max: log2(16) * 2,
    toUnit: (v) => log2(v) * 2, fromUnit: (u) => 2 ** (u / 2),
    ticks: STOPS.map((v) => ({ v, label: String(v).replace('.', ',') })),
    set: (v) => { cam.target.N = v; changed(); },
    snap: (v) => STOPS.reduce((a, b) => (Math.abs(log2(b / v)) < Math.abs(log2(a / v)) ? b : a)),
    step: (d) => { const cur = STOPS.reduce((a, b) => (Math.abs(log2(b / cam.target.N)) < Math.abs(log2(a / cam.target.N)) ? b : a)); cam.target.N = STOPS[clamp(STOPS.indexOf(cur) + d, 0, STOPS.length - 1)]; changed(); },
  });
  const FOC = [0.5, 0.7, 1, 1.5, 2, 3, 5, 10, 1000];
  rings.focus = makeRing($('#ringFocus'), {
    get: () => cam.target.focus, span: 4.2, min: 0, max: 3.199,
    toUnit: (v) => -1 / v * 1.6 + 3.2, fromUnit: (u) => 1.6 / Math.max(0.0001, 3.2 - u),
    ticks: FOC.map((v) => ({ v, label: v >= 1000 ? '∞' : String(v).replace('.', ',') })),
    set: (v) => { cam.target.focus = clamp(v, 0.5, 1000); changed(); },
    step: (d) => { cam.target.focus = clamp(cam.target.focus * (d > 0 ? 1.25 : 0.8), 0.5, 1000); changed(); },
  });
}

/* ================================================================
   Показатели и тексты
   ================================================================ */
const ui = {
  exif: $('#exif'), dofNear: $('#dofNear'), dofFar: $('#dofFar'), dofLen: $('#dofLen'), hyper: $('#hyper'), fov: $('#fov'), cinf: $('#cinf'),
  blades: $('#blades'), keep: $('#keep'), tabs: $('#tabs'), text: $('#tabText'), af: $('#af'), dofBar: $('#dofBar'), dofMark: $('#dofMark'),
};
const TEXTS = {
  focus: `<p>Линза собирает лучи от&nbsp;каждой точки в&nbsp;точку-изображение. Резко выходит только то, что лежит в&nbsp;<b>плоскости фокуса</b>: лучи от&nbsp;него сходятся ровно на&nbsp;матрице.</p><p>Лучи от&nbsp;более далёких предметов сходятся раньше матрицы, от&nbsp;близких — позже. На&nbsp;матрицу вместо точки попадает пятно — <b>кружок нерезкости</b>. Пока он меньше 0,03&nbsp;мм, глаз считает картинку резкой: так получается глубина резкости.</p><p class="tip">Нажмите на&nbsp;любой огонь в&nbsp;кадре — камера сфокусируется на&nbsp;нём.</p>`,
  bokeh: `<p><b>Диафрагма</b> — это отверстие из&nbsp;лепестков. Каждый размытый огонь рисуется её&nbsp;формой: семь лепестков дают семиугольное боке, а&nbsp;на&nbsp;открытой диафрагме лепестки уходят за&nbsp;оправу, и&nbsp;пятна становятся круглыми.</p><p>Чем больше число f, тем уже конус лучей и&nbsp;тем меньше кружок нерезкости — глубина резкости растёт. У&nbsp;краёв кадра на&nbsp;открытой диафрагме пятна срезаются оправой в&nbsp;«кошачий глаз» — это оптическое виньетирование.</p>`,
  persp: `<p><b>Фокусное расстояние</b> задаёт угол обзора, но&nbsp;не&nbsp;перспективу: перспектива зависит только от&nbsp;того, где стоит камера.</p><p>Включите «Держать размер вывески» и&nbsp;крутите кольцо фокусного: камера отъезжает так, чтобы вывеска оставалась того же размера. Фон при&nbsp;этом «прижимается» к&nbsp;ней — это и&nbsp;есть знаменитое сжатие перспективы длиннофокусником, эффект Хичкока.</p>`,
};
function updateStats() {
  const d = dof(cam.focus, cam.f, cam.N);
  ui.exif.innerHTML = `<b>${Math.round(cam.f)}&nbsp;мм</b><span>f/${nf1(cam.N)}</span><span>${fmtM(cam.focus)}</span><span>ISO 800 · 1/60</span>`;
  ui.dofNear.textContent = fmtM(d.near);
  ui.dofFar.textContent = fmtM(d.far);
  ui.dofLen.textContent = isFinite(d.far) ? fmtM(d.far - d.near) : 'до бесконечности';
  ui.hyper.textContent = fmtM(d.Hf);
  const fov = 2 * Math.atan(18 / cam.f) * 180 / Math.PI;
  ui.fov.textContent = `${Math.round(fov)}°`;
  const cInf = ((cam.f / 1000) ** 2) / (cam.N * (cam.focus - cam.f / 1000)) * 1000;
  ui.cinf.textContent = `${nf2(cInf)} мм · ${nf1((cInf / 36) * 100)} % кадра`;
  // шкала глубины резкости на кольце фокуса
  const u = (v) => clamp(-1 / v * 1.6 + 3.2, 0, 3.2);
  const w = $('#ringFocus').clientWidth, span = 4.2 * (w < 520 ? 0.62 : 1), uf = u(cam.focus);
  const x0 = w / 2 + (u(d.near) - uf) * (w / span), x1 = w / 2 + (u(isFinite(d.far) ? d.far : 1e9) - uf) * (w / span);
  ui.dofBar.style.transform = `translateX(${x0.toFixed(1)}px) scaleX(${Math.max(2, x1 - x0).toFixed(1)})`;
}

/* ---------- Анимация параметров и перерисовка ---------- */
let dirty = true, afAt = 0;
function changed() {
  // «Эффект Хичкока»: камера отъезжает, фокус остаётся на вывеске
  if (cam.keepSize) cam.target.focus = SIGN_Z * (cam.target.f / BASE_F);
  dirty = true;
}
function tick(now) {
  requestAnimationFrame(tick);
  if (document.hidden) return;
  let moving = false;
  const ease = (a, b, k) => { const d = b - a; if (Math.abs(d) < Math.abs(b) * 0.0015 + 1e-4) return b; moving = true; return a + d * k; };
  cam.f = ease(cam.f, cam.target.f, 0.22);
  cam.N = ease(cam.N, cam.target.N, 0.25);
  cam.focus = Math.exp(ease(Math.log(cam.focus), Math.log(cam.target.focus), 0.18));
  if (resizeVF()) dirty = true;
  if (moving || dirty) {
    dirty = false;
    renderVF();
    renderRays();
    updateStats();
    Object.values(rings).forEach((r) => r.layout());
  }
  ui.af.classList.toggle('on', now - afAt < 900);
}

/* ---------- События ---------- */
vf.addEventListener('click', (e) => {
  const r = vf.getBoundingClientRect();
  const x = (e.clientX - r.left) * DPR, y = (e.clientY - r.top) * DPR;
  // ближайший огонь или вывеска под курсором
  let best = null, bd = 42 * DPR;
  if (signBox && x > signBox[0] && x < signBox[2] && y > signBox[1] && y < signBox[3]) best = { z: SIGN_Z, d: 0 };
  if (!best) {
    for (const l of scene.lights) {
      const p = proj(l.x, l.y, l.z);
      if (!p) continue;
      const d = Math.hypot(p[0] - x, p[1] - y);
      if (d < bd) { bd = d; best = { z: l.z }; }
    }
  }
  if (!best) best = { z: 40 };
  cam.target.focus = clamp(best.z - camZ(), 0.5, 1000);
  document.querySelector('.vf-hint')?.classList.add('gone');
  ui.af.style.transform = `translate(${e.clientX - r.left}px, ${e.clientY - r.top}px)`;
  afAt = performance.now();
  changed();
});
ui.blades.addEventListener('click', (e) => {
  const b = e.target.closest('[data-b]');
  if (!b) return;
  cam.blades = +b.dataset.b;
  ui.blades.querySelectorAll('[data-b]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  changed();
});
ui.keep.addEventListener('click', () => {
  cam.keepSize = !cam.keepSize;
  ui.keep.setAttribute('aria-pressed', String(cam.keepSize));
  if (!cam.keepSize) cam.target.focus = SIGN_Z;
  changed();
});
ui.tabs.addEventListener('click', (e) => {
  const b = e.target.closest('[data-t]');
  if (!b) return;
  cam.tab = b.dataset.t;
  ui.tabs.querySelectorAll('[data-t]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
  ui.text.innerHTML = TEXTS[cam.tab];
});
window.addEventListener('resize', () => { resizeRays(); changed(); });


/* ---------- Старт ---------- */
ui.text.innerHTML = TEXTS.focus;
buildRings();
resizeRays();
document.fonts && document.fonts.ready.then(() => changed());
requestAnimationFrame(tick);
})();
