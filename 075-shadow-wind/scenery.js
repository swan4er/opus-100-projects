'use strict';
/* ==========================================================================
   «Девочка и ветер» · scenery.js
   Декорации театра теней: небо, слои холмов в дымке, мельница, озеро
   с лодкой, кружевное дерево, трава с одуванчиками, птицы, змей, банка.

   Мир задан в «опорных» координатах кадра: при камере (960, 540, ×1)
   мировая точка совпадает с точкой кадра 1920×1080. Каждый слой сдвигается
   с камерой с собственным параллаксом — так работала многоплановая
   установка Лотты Райнигер: стёкла с бумажными фигурами на разной высоте.
   ========================================================================== */

const INK = hex('#0b0707');
const INK_CSS = rgba(INK);

/* ---------- Камера и слои ---------- */

/** Трансформ слоя: экран = (pos − C − (cam − C)·p)·z + C, где z = 1 + (zoom − 1)·pz. */
function layerTf(ctx, k, cam, px, py, pz) {
  const z = 1 + (cam.z - 1) * pz;
  const ox = 960 - (960 + (cam.x - 960) * px) * z + (cam.sx || 0);
  const oy = 540 - (540 + (cam.y - 540) * py) * z + (cam.sy || 0);
  ctx.setTransform(k * z, 0, 0, k * z, k * ox, k * oy);
  return z;
}
/** Видимый по x диапазон слоя — для отсечения травы и профилей. */
function layerSpan(cam, p, pz) {
  const z = 1 + (cam.z - 1) * pz;
  const cx = 960 + (cam.x - 960) * p - (cam.sx || 0) / z;
  return [cx - 980 / z, cx + 980 / z];
}
/** Мировая точка главного плана → точка кадра (для звука, свечения, диафрагмы). */
function worldToScreen(cam, x, y) {
  return [(x - cam.x) * cam.z + 960 + (cam.sx || 0), (y - cam.y) * cam.z + 540 + (cam.sy || 0)];
}

/* ---------- Палитры неба ---------- */
const PAL_SRC = {
  dawn:    { top: '#093844', mid: '#2b8687', low: '#a4d2bc', hor: '#f8d8a8', fog: '#86b3a3', glow: '#ffdca6', sun: '#fff4da' },
  morning: { top: '#0d4c56', mid: '#46a295', low: '#cde4b2', hor: '#fbe6aa', fog: '#9fc3a0', glow: '#fff0bc', sun: '#fffbe8' },
  day:     { top: '#1a5c64', mid: '#71b19b', low: '#dfe2a4', hor: '#ffe6a0', fog: '#b0c294', glow: '#fff3c4', sun: '#fffdf2' },
  golden:  { top: '#26475c', mid: '#ae936a', low: '#efb762', hor: '#ffc463', fog: '#c09163', glow: '#ffc670', sun: '#fff1c6' },
  sunset:  { top: '#221a39', mid: '#8a3141', low: '#df5c39', hor: '#ffae48', fog: '#ab513f', glow: '#ff8a3d', sun: '#ffe8aa' },
  ember:   { top: '#1b1627', mid: '#552a35', low: '#934536', hor: '#cf844c', fog: '#6e4239', glow: '#dd6c38', sun: '#ffd08e' },
  ash:     { top: '#151315', mid: '#2d2627', low: '#4a3c39', hor: '#67544b', fog: '#443835', glow: '#7a5c4e', sun: '#a88c7c' },
  dull:    { top: '#0e1519', mid: '#1e2b2f', low: '#374444', hor: '#5a5b52', fog: '#303b3b', glow: '#5d5d53', sun: '#a3a39a' },
  night:   { top: '#021720', mid: '#08414c', low: '#146d75', hor: '#e46f38', fog: '#185258', glow: '#ffd79e', sun: '#fff4d8' },
};
const PAL = {};
for (const k in PAL_SRC) { PAL[k] = {}; for (const f in PAL_SRC[k]) PAL[k][f] = hex(PAL_SRC[k][f]); }
function mixPal(a, b, u) {
  const o = {};
  for (const f in a) o[f] = Array.isArray(a[f]) ? cmix(a[f], b[f], u) : lerp(a[f], b[f], u);
  return o;
}

/* ---------- Небо ---------- */

/** Небесный слой почти неподвижен по x и заметно сдвигается по y — при наклоне камеры видно зенит. */
function skyTf(ctx, k, cam) { return layerTf(ctx, k, cam, 0.05, 0.24, 0.12); }

function drawSkyGradient(ctx, pal) {
  const g = ctx.createLinearGradient(0, -760, 0, 700);
  g.addColorStop(0, rgba(pal.top));
  g.addColorStop(0.46, rgba(pal.mid));
  g.addColorStop(0.8, rgba(pal.low));
  g.addColorStop(1, rgba(pal.hor));
  ctx.fillStyle = g;
  ctx.fillRect(-3000, -3000, 8000, 6000);
}

/** Солнце или луна: мягкое свечение и диск. Полосы облаков перечёркивают закатное солнце. */
function drawSun(ctx, sun, pal, t) {
  if (!sun || sun.a <= 0) return;
  const { x, y, r } = sun;
  const glow = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * sun.halo);
  glow.addColorStop(0, rgba(pal.glow, 0.62 * sun.a));
  glow.addColorStop(0.25, rgba(pal.glow, 0.24 * sun.a));
  glow.addColorStop(1, rgba(pal.glow, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(x - r * sun.halo, y - r * sun.halo, r * sun.halo * 2, r * sun.halo * 2);
  ctx.fillStyle = rgba(pal.sun, sun.a);
  ctx.beginPath();
  circle(ctx, x, y, r);
  ctx.fill();
  if (sun.bands > 0) {
    // тонкие облачные полосы поперёк диска — ар-деко заката
    ctx.fillStyle = rgba(cmix(pal.mid, INK, 0.25), 0.55 * sun.bands * sun.a);
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const yy = y + r * (0.05 + i * 0.24) + Math.sin(t * 0.2 + i) * 2;
      const hw = r * (1.9 - i * 0.25);
      const dx = Math.sin(t * 0.07 + i * 1.7) * 30;
      lens(ctx, x - hw + dx, yy, x + hw + dx, yy, 2.2 + i * 0.9);
    }
    ctx.fill();
  }
}

function drawMoon(ctx, moon, pal, t) {
  if (!moon || moon.a <= 0) return;
  const { x, y, r, a } = moon;
  const g = ctx.createRadialGradient(x, y, r * 0.8, x, y, r * 7);
  g.addColorStop(0, rgba(pal.glow, 0.34 * a));
  g.addColorStop(0.3, rgba(pal.glow, 0.1 * a));
  g.addColorStop(1, rgba(pal.glow, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r * 7, y - r * 7, r * 14, r * 14);
  ctx.fillStyle = rgba(pal.sun, a);
  ctx.beginPath();
  circle(ctx, x, y, r);
  ctx.fill();
  // «моря» луны — едва заметные пятна
  ctx.fillStyle = rgba(cmix(pal.sun, pal.glow, 0.7), 0.35 * a);
  ctx.beginPath();
  oval(ctx, x - r * 0.28, y - r * 0.2, r * 0.3, r * 0.22, 0.4);
  oval(ctx, x + r * 0.2, y + r * 0.12, r * 0.22, r * 0.3, -0.3);
  oval(ctx, x - r * 0.05, y + r * 0.42, r * 0.16, r * 0.1, 0.1);
  ctx.fill();
}

const STARS = (() => {
  const R = rng(41);
  const s = [];
  for (let i = 0; i < 190; i++) s.push({ x: -700 + R() * 3300, y: -560 + R() * 900, r: 0.6 + R() * R() * 1.8, ph: R() * TAU, sp: 0.6 + R() * 2.2, big: R() < 0.05 });
  return s;
})();

/** Звёзды — будто проколы в бумаге неба; самые яркие с лучиками. */
function drawStars(ctx, pal, amt, t) {
  if (amt <= 0.01) return;
  ctx.fillStyle = rgba(pal.sun, 1);
  for (const s of STARS) {
    const tw = 0.55 + 0.45 * Math.sin(t * s.sp + s.ph);
    const a = amt * tw * clamp(1 - (s.y + 100) / 800, 0.15, 1);
    if (a < 0.02) continue;
    ctx.globalAlpha = a;
    ctx.beginPath();
    if (s.big) {
      const L = 5 + tw * 4;
      lens(ctx, s.x - L, s.y, s.x + L, s.y, 0.7);
      lens(ctx, s.x, s.y - L, s.x, s.y + L, 0.7);
    }
    circle(ctx, s.x, s.y, s.r);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

const CLOUDS = [
  { x: -380, y: 150, w: 520, h: 30, sp: 5, seed: 3 },
  { x: 380, y: 70, w: 760, h: 40, sp: 7, seed: 5 },
  { x: 1180, y: 205, w: 460, h: 26, sp: 4, seed: 8 },
  { x: 1720, y: 40, w: 640, h: 36, sp: 6, seed: 12 },
  { x: 760, y: 318, w: 330, h: 18, sp: 3, seed: 15 },
  { x: 2350, y: 240, w: 520, h: 28, sp: 5, seed: 21 },
];

/** Облако из бумаги: плоский низ и фестонный верх из дуг разного размера. */
function cloudPath(ctx, x, y, w, h, seed) {
  const R = rng(seed);
  const n = 5 + Math.floor(R() * 3);
  ctx.moveTo(x, y);
  let cx = x;
  const seg = w / n;
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    const r = h * (0.3 + 0.7 * Math.sin(u * PI)) * (0.75 + R() * 0.5);
    ctx.quadraticCurveTo(cx + seg * 0.15, y - r * 1.9, cx + seg * 0.55, y - r * 1.45);
    ctx.quadraticCurveTo(cx + seg * 0.95, y - r, cx + seg, y);
    cx += seg;
  }
  ctx.quadraticCurveTo(x + w * 0.5, y + h * 0.28, x, y);
  ctx.closePath();
}

/** Облака — полупрозрачная бумага; нижняя кромка подсвечена солнцем. */
function drawClouds(ctx, pal, drift, t, amt) {
  if (amt <= 0) return;
  const body = cmix(pal.mid, pal.low, 0.35);
  const shade = cmix(pal.mid, pal.top, 0.5);
  for (const c of CLOUDS) {
    const x = wrap(c.x + drift * c.sp + 800, 3800) - 1100;
    ctx.fillStyle = rgba(pal.glow, 0.26 * amt);
    ctx.beginPath();
    cloudPath(ctx, x + 5, c.y + 5, c.w, c.h, c.seed);
    ctx.fill();
    ctx.fillStyle = rgba(body, 0.42 * amt);
    ctx.beginPath();
    cloudPath(ctx, x, c.y, c.w, c.h, c.seed);
    ctx.fill();
    ctx.fillStyle = rgba(shade, 0.3 * amt);
    ctx.beginPath();
    cloudPath(ctx, x + c.w * 0.18, c.y + 3, c.w * 0.62, c.h * 0.62, c.seed + 1);
    ctx.fill();
  }
}

/* ---------- Земля главного плана ---------- */
const groundY = tabulate((x) => 880 - 150 * Math.exp(-(((x - 1150) / 720) ** 2)) + 9 * fbm(x * 0.0032 + 3, 2), -3200, 5200, 2);

/* ---------- Дальние слои ---------- */
const ridgeFar = tabulate((x) => 612 - 44 * (0.5 + 0.5 * fbm(x * 0.0021 + 11, 3)) - 86 * Math.exp(-(((x - 180) / 240) ** 2)) - 40 * Math.exp(-(((x + 420) / 200) ** 2)) - 30 * Math.exp(-(((x - 2050) / 260) ** 2)), -3200, 5200, 4);
const ridgeMid = tabulate((x) => 690 - 34 * (0.5 + 0.5 * fbm(x * 0.0029 + 5, 3)) - 62 * Math.exp(-(((x - 430) / 230) ** 2)) - 20 * Math.exp(-(((x - 1700) / 300) ** 2)), -3200, 5200, 4);
const ridgeNear = tabulate((x) => 800 - 30 * (0.5 + 0.5 * fbm(x * 0.0035 + 9, 3)) - 60 * Math.exp(-(((x - 200) / 380) ** 2)) + 40 * Math.exp(-(((x - 1000) / 260) ** 2)), -3200, 5200, 4);

/** Заливка профиля слоя от линии хребта вниз, с лёгким градиентом дымки. */
function fillRidge(ctx, fn, x0, x1, colTop, colBot, yTop) {
  const g = ctx.createLinearGradient(0, yTop, 0, yTop + 260);
  g.addColorStop(0, rgba(colTop));
  g.addColorStop(1, rgba(colBot));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x0, 2400);
  for (let x = x0; x <= x1 + 12; x += 12) ctx.lineTo(x, fn(x));
  ctx.lineTo(x1 + 12, 2400);
  ctx.closePath();
  ctx.fill();
}

const MID_TREES = (() => {
  const R = rng(17), a = [];
  for (let x = -900; x < 3000; x += 60 + R() * 170) {
    if (x > 560 && x < 1420) continue; // над озером деревьев нет
    a.push({ x, kind: R() < 0.45 ? 1 : 0, h: 26 + R() * 30, r: 12 + R() * 9, ph: R() * TAU });
  }
  return a;
})();

/** Деревца на среднем плане: «леденцы» с дырочками и пирамидальные тополя. */
function drawMidTrees(ctx, x0, x1, wind, t) {
  ctx.beginPath();
  for (const m of MID_TREES) {
    if (m.x < x0 - 60 || m.x > x1 + 60) continue;
    const y = ridgeMid(m.x) + 3;
    const sway = wind * 0.05 + Math.sin(t * 1.4 + m.ph) * 0.02 * (0.3 + Math.abs(wind));
    if (m.kind) {
      lens(ctx, m.x, y + 2, m.x + Math.sin(sway) * m.h * 2.2, y - m.h * 2.2, m.r * 0.42);
    } else {
      capsule(ctx, m.x, y + 2, 1.8, m.x + sway * 20, y - m.h, 1.2);
      circle(ctx, m.x + sway * m.h, y - m.h - m.r * 0.7, m.r);
      circle(ctx, m.x + sway * m.h - m.r * 0.3, y - m.h - m.r * 0.9, m.r * 0.22, true);
      circle(ctx, m.x + sway * m.h + m.r * 0.35, y - m.h - m.r * 0.45, m.r * 0.16, true);
    }
  }
  ctx.fill();
}

/** Мельница: башня с дверью-аркой, купол, решётчатые крылья — кружево на фоне неба. */
function drawWindmill(ctx, x, y, s, ang) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.beginPath();
  poly(ctx, [[-30, 4], [-19, -112], [19, -112], [30, 4]]);
  // купол
  ctx.moveTo(-25, -110);
  ctx.quadraticCurveTo(-24, -142, 0, -146);
  ctx.quadraticCurveTo(24, -142, 25, -110);
  ctx.closePath();
  // галерея
  poly(ctx, [[-31, -70], [31, -70], [31, -66], [-31, -66]]);
  // дверь и окна — прорези
  ctx.moveTo(6, -2);
  ctx.lineTo(6, -20);
  ctx.arc(0, -20, 6, 0, -PI, true);
  ctx.lineTo(-6, -2);
  ctx.closePath();
  circle(ctx, 0, -92, 4.5, true);
  poly(ctx, [[-4, -48], [4, -48], [4, -38], [-4, -38]], true);
  ctx.fill('evenodd');
  // перила галереи
  ctx.beginPath();
  for (let i = -3; i <= 3; i++) poly(ctx, [[i * 9 - 0.9, -66], [i * 9 + 0.9, -66], [i * 9 + 0.9, -58], [i * 9 - 0.9, -58]]);
  poly(ctx, [[-31, -59], [31, -59], [31, -57], [-31, -57]]);
  ctx.fill();
  // крылья
  const hx = 0, hy = -124;
  ctx.beginPath();
  for (let k = 0; k < 4; k++) {
    const a = ang + (k * PI) / 2;
    poly(ctx, barPts(hx, hy, a, -2, 118, 1.8, 1.8));
    const c = Math.cos(a), sn = Math.sin(a), nx = -sn, ny = c;
    // рама полотна
    poly(ctx, barPts(hx, hy, a, 24, 114, 0, 21));
    // ячейки — прорези
    const rows = 7, cols = 2;
    for (let r = 0; r < rows; r++) {
      for (let q = 0; q < cols; q++) {
        const r0 = 27 + r * 12.3, r1 = r0 + 9.6;
        const w0 = 2.4 + q * 9.4, w1 = w0 + 7.2;
        const P = (rr, ww) => [hx + c * rr + nx * ww, hy + sn * rr + ny * ww];
        poly(ctx, [P(r0, w0), P(r1, w0), P(r1, w1), P(r0, w1)], true);
      }
    }
  }
  circle(ctx, hx, hy, 6);
  ctx.fill();
  ctx.restore();
}

/** Озеро: полоса отражённого неба с рябью; в штиль — зеркальная гладь. */
function drawLake(ctx, pal, t, ripple, drift) {
  const x0 = 520, x1 = 1480, y0 = 706;
  const g = ctx.createLinearGradient(0, y0, 0, y0 + 90);
  g.addColorStop(0, rgba(cmix(pal.hor, pal.low, 0.35)));
  g.addColorStop(1, rgba(cmix(pal.low, pal.fog, 0.55)));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y0);
  ctx.quadraticCurveTo(x1 - 40, y0 + 60, (x0 + x1) / 2, y0 + 90);
  ctx.quadraticCurveTo(x0 + 30, y0 + 60, x0, y0);
  ctx.fill();
  // блики и рябь
  const col = cmix(pal.fog, INK, 0.35);
  ctx.fillStyle = rgba(col, 0.55);
  ctx.beginPath();
  const R = rng(5);
  for (let i = 0; i < 46; i++) {
    const yy = y0 + 5 + R() * 70;
    const len = (10 + R() * 40) * (0.3 + ripple);
    const xx = x0 + 60 + wrap(R() * 900 + drift * (6 + R() * 10), 860);
    const w = 0.6 + R() * 0.9 * (yy - y0) / 60;
    if (ripple > 0.05) lens(ctx, xx, yy, xx + len, yy + Math.sin(t * 2 + i) * ripple, w * (0.4 + ripple * 0.6));
  }
  ctx.fill();
}

/** Лодка с парусом; billow — насколько надут парус (0 — висит). */
function drawBoat(ctx, x, y, s, billow, t, mirror) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, mirror ? -s * 0.8 : s);
  ctx.beginPath();
  ctx.moveTo(-26, -4);
  ctx.lineTo(26, -4);
  ctx.quadraticCurveTo(22, 5, 12, 6);
  ctx.lineTo(-18, 6);
  ctx.quadraticCurveTo(-26, 3, -26, -4);
  ctx.closePath();
  poly(ctx, [[-1.2, -4], [1.2, -4], [1.2, -58], [-1.2, -58]]);
  // парус: передняя шкаторина по мачте, задняя выгнута ветром
  const b = billow;
  ctx.moveTo(2, -56);
  ctx.quadraticCurveTo(2 + 10 * b + 4, -34, 4 + 22 * b + 3, -9 + (1 - b) * 3);
  ctx.lineTo(2, -9);
  ctx.closePath();
  ctx.moveTo(-2, -52);
  ctx.quadraticCurveTo(-2 - 6 * b - 3, -30, -2 - 14 * b - 4, -10);
  ctx.lineTo(-2, -10);
  ctx.closePath();
  // флажок
  const f = Math.sin(t * 7) * 2 * b;
  ctx.moveTo(1, -58);
  ctx.quadraticCurveTo(6, -60 + f, 11 * (0.4 + 0.6 * b), -59 + f + (1 - b) * 5);
  ctx.lineTo(1, -54);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/* ---------- Кружевное дерево ---------- */
const TREE = (() => {
  const R = rng(1926);
  const B = [];
  const add = (par, at, ang, len, w0, w1, curl, bend, depth) => {
    const n = Math.max(7, Math.round(len / 12));
    const b = { par, at, ang, len, w0, w1, curl, bend, depth, n, ph: R() * TAU, flex: 0.6 + R() * 0.6 };
    B.push(b);
    return B.length - 1;
  };
  const trunk = add(-1, 0, 0, 300, 18, 9.5, 0.05, 0.0006, 0);
  const limbs = [
    [0.5, -1.02, 250, -1.05],
    [0.7, -0.5, 275, -0.75],
    [0.93, -0.02, 230, 0.7],
    [0.82, 0.55, 265, 0.95],
    [0.6, 1.08, 215, 1.1],
  ];
  for (const [at, ang, len, curl] of limbs) {
    const pb = B[trunk];
    const L = add(trunk, at, ang + (R() - 0.5) * 0.1, len * (0.92 + R() * 0.16), lerp(pb.w0, pb.w1, at) * 0.62, 1.3, curl, 0, 1);
    const nk = 2 + (R() < 0.55 ? 1 : 0);
    for (let j = 0; j < nk; j++) {
      const at2 = 0.26 + (j / nk) * 0.46 + R() * 0.08;
      const side = j % 2 === 0 ? -Math.sign(curl) : Math.sign(curl);
      const lb = B[L];
      const S = add(L, at2, side * (0.55 + R() * 0.45), lb.len * (0.36 + R() * 0.22), lerp(lb.w0, lb.w1, at2) * 0.7, 0.9, side * (0.8 + R() * 0.8), 0, 2);
      if (R() < 0.75) {
        const at3 = 0.35 + R() * 0.35, side3 = -side, sb = B[S];
        add(S, at3, side3 * (0.6 + R() * 0.45), sb.len * (0.45 + R() * 0.25), lerp(sb.w0, sb.w1, at3) * 0.72, 0.7, side3 * (0.9 + R() * 0.7), 0, 3);
      }
    }
  }
  const leaves = [];
  B.forEach((b, bi) => {
    if (b.depth < 1) return;
    const start = Math.floor(b.n * (b.depth === 1 ? 0.3 : 0.12));
    for (let i = start; i < b.n; i++) {
      if (R() < 0.18) continue;
      const side = i % 2 ? 1 : -1;
      const big = b.depth === 1 ? 1.12 : b.depth === 3 ? 0.86 : 1;
      leaves.push({ bi, i, side, ang: side * (0.75 + R() * 0.55), L: (16 + R() * 10) * big, w: 0.22 + R() * 0.06, ph: R() * TAU, sp: 2 + R() * 2.5, lace: R() < 0.4 });
      if (R() < 0.35) leaves.push({ bi, i, side: -side, ang: -side * (0.5 + R() * 0.5), L: (12 + R() * 7) * big, w: 0.24, ph: R() * TAU, sp: 2 + R() * 2.5, lace: false });
    }
  });
  // плоды-колечки на тонких черенках
  const fruits = [];
  B.forEach((b, bi) => {
    if (b.depth < 2) return;
    if (R() < 0.55) fruits.push({ bi, i: Math.floor(b.n * (0.35 + R() * 0.3)), r: 5 + R() * 2.5, ph: R() * TAU, stem: 10 + R() * 8 });
  });
  return { B, leaves, fruits };
})();

/** Прямая кинематика дерева: точки и направления всех веток при ветре bend (рад). */
function treeSkeleton(t, bend, whip) {
  const out = new Array(TREE.B.length);
  for (let bi = 0; bi < TREE.B.length; bi++) {
    const b = TREE.B[bi];
    let x, y, a;
    if (b.par < 0) { x = 0; y = 0; a = -PI / 2; }
    else {
      const P = out[b.par];
      const idx = Math.min(P.pts.length - 1, Math.round(b.at * (P.pts.length - 1)));
      x = P.pts[idx][0]; y = P.pts[idx][1]; a = P.dir[idx] + b.ang;
    }
    const d1 = b.depth + 1;
    const flutter = (Math.sin(t * (1.1 + b.depth * 0.5) + b.ph) * (0.012 + Math.abs(bend) * 0.03) * d1 + whip * Math.sin(t * 9 + b.ph) * 0.03 * d1) * WORLD.life;
    a += bend * 0.045 * d1 * b.flex + flutter;
    const pts = [[x, y]], dir = [a];
    const ds0 = b.len / b.n;
    let wsum = 0;
    for (let i = 1; i <= b.n; i++) wsum += Math.max(0, i / b.n - 0.5) ** 2;
    for (let i = 1; i <= b.n; i++) {
      const u = i / b.n;
      const e = Math.max(0, u - 0.5);
      a += (b.curl * TAU * e * e) / (wsum || 1) + b.bend * ds0 + bend * 0.011 * d1 * b.flex;
      const ds = ds0 * (1 - 0.6 * e / 0.5);
      x += Math.cos(a) * ds;
      y += Math.sin(a) * ds;
      pts.push([x, y]);
      dir.push(a);
    }
    out[bi] = { pts, dir };
  }
  return out;
}

/** Дерево целиком: ветви лентами, листья линзами с прорезью-жилкой, плоды-колечки. */
function drawTree(ctx, x, y, s, t, bend, whip, leafLoss) {
  const sk = treeSkeleton(t, bend, whip);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.beginPath();
  for (let bi = 0; bi < TREE.B.length; bi++) {
    const b = TREE.B[bi];
    const n = sk[bi].pts.length;
    const ws = taper(n, b.w0, b.w1, 0.9);
    if (bi === 0) { ws[0] = b.w0 * 1.7; ws[1] = b.w0 * 1.2; }
    ribbon(ctx, sk[bi].pts, ws);
  }
  // корни
  ctx.moveTo(-40, 8);
  ctx.quadraticCurveTo(-14, -2, -16, -24);
  ctx.lineTo(16, -24);
  ctx.quadraticCurveTo(14, -2, 44, 8);
  ctx.closePath();
  ctx.fill();
  // плоды на черенках
  ctx.beginPath();
  for (const f of TREE.fruits) {
    const P = sk[f.bi];
    const [bx, by] = P.pts[Math.min(f.i, P.pts.length - 1)];
    const sw = Math.sin(t * 2.2 + f.ph) * (0.05 + Math.abs(bend) * 0.15) + bend * 0.25;
    const fx = bx + Math.sin(sw) * f.stem, fy = by + Math.cos(sw) * f.stem;
    capsule(ctx, bx, by, 0.9, fx, fy, 0.8);
    circle(ctx, fx, fy + f.r, f.r);
    circle(ctx, fx, fy + f.r, f.r * 0.45, true);
  }
  ctx.fill();
  // листья
  ctx.beginPath();
  let li = 0;
  for (const L of TREE.leaves) {
    li++;
    if (leafLoss > 0 && hash(li * 7) < leafLoss) continue;
    const P = sk[L.bi];
    const i = Math.min(L.i, P.pts.length - 1);
    const [bx, by] = P.pts[i];
    const fl = Math.sin(t * (L.sp + Math.abs(bend) * 3) + L.ph) * (0.06 + Math.abs(bend) * 0.28) * WORLD.life;
    // ветер разворачивает листья по потоку
    let a = P.dir[i] + L.ang + fl;
    const wa = bend > 0 ? 0 : PI;
    a = a + (Math.atan2(Math.sin(wa - a), Math.cos(wa - a))) * clamp(Math.abs(bend) * 0.35, 0, 0.6);
    const tx = bx + Math.cos(a) * L.L, ty = by + Math.sin(a) * L.L;
    lens(ctx, bx, by, tx, ty, L.L * L.w);
    if (L.lace) lens(ctx, bx + (tx - bx) * 0.2, by + (ty - by) * 0.2, bx + (tx - bx) * 0.84, by + (ty - by) * 0.84, L.L * L.w * 0.5, true);
    else lens(ctx, bx + (tx - bx) * 0.24, by + (ty - by) * 0.24, bx + (tx - bx) * 0.8, by + (ty - by) * 0.8, 0.95, true);
  }
  ctx.fill();
  ctx.restore();
  return sk;
}

/* ---------- Трава ---------- */
function buildGrass(seed, x0, x1, step, hMin, hMax, frontShare) {
  const R = rng(seed);
  const a = [];
  for (let x = x0; x < x1; x += step * (0.6 + R() * 0.8)) {
    const tuft = 0.5 + 0.5 * fbm(x * 0.0075 + seed, 2);
    a.push({
      x,
      h: lerp(hMin, hMax, Math.min(1, R() ** 1.5 * 0.55 + tuft * 0.6)),
      w: 1.35 + R() * 1.8,
      lean: (R() - 0.5) * 0.4,
      ph: R() * TAU,
      fl: 0.65 + R() * 0.7,
      front: R() < frontShare,
      dy: R() * 6,
    });
  }
  return a;
}
function buildPlants(seed, x0, x1) {
  const R = rng(seed);
  const d = [], o = [], b = [];
  for (let x = x0; x < x1; x += 40 + R() * 120) {
    const k = R();
    if (k < 0.34) d.push({ x, h: 48 + R() * 40, r: 9 + R() * 5, ph: R() * TAU, seeds: 17 + Math.floor(R() * 7), id: d.length });
    else if (k < 0.75) o.push({ x, h: 70 + R() * 50, ph: R() * TAU, n: 5 + Math.floor(R() * 4) });
    else b.push({ x, h: 36 + R() * 26, ph: R() * TAU, n: 2 + Math.floor(R() * 2) });
  }
  return { d, o, b };
}

const GRASS_MAIN = buildGrass(3, -1600, 3600, 4.9, 16, 62, 0.28);
const PLANTS_MAIN = buildPlants(8, -1600, 3600);
const GRASS_FG = buildGrass(11, -2200, 4400, 12.5, 90, 250, 0);
const PLANTS_FG = buildPlants(13, -2200, 4400);

/** Общее состояние мира на кадр: «жизнь» (трепет) — 0, когда ветер в банке. */
const WORLD = { life: 1 };

/** Угол травинки: ветер насыщается (трава не ложится плашмя), плюс трепет. */
function grassAngle(g, windFn, t, gain = 1) {
  const w = windFn(g.x, t) * gain;
  const bend = Math.tanh(w * 1.1) * 0.95;
  const fl = Math.sin(t * (2.1 + Math.abs(w) * 2.2) + g.ph + g.x * 0.013) * (0.025 + 0.13 * Math.abs(w)) * g.fl * WORLD.life;
  return g.lean * (1 - 0.6 * Math.min(1, Math.abs(w))) + bend * (0.55 + 0.45 * Math.min(1, g.h / 60)) * g.fl + fl;
}

/** Травинки главного плана (задний или передний ряд). */
function drawGrass(ctx, list, x0, x1, t, windFn, front, yFn, gain) {
  ctx.beginPath();
  for (let i = 0; i < list.length; i++) {
    const g = list[i];
    if (g.x < x0 || g.x > x1 || g.front !== front) continue;
    const y = yFn(g.x) + g.dy + (front ? 5 : 0);
    blade(ctx, g.x, y, g.h * (front ? 0.85 : 1), g.w, grassAngle(g, windFn, t, gain));
  }
  ctx.fill();
}

/** Одуванчики, овёс и колокольчики. seedsLeft(id) — сколько семян ещё держится на головке. */
function drawPlants(ctx, P, x0, x1, t, windFn, yFn, scale, seedsLeft, gain) {
  ctx.beginPath();
  for (const o of P.o) {
    if (o.x < x0 - 60 || o.x > x1 + 60) continue;
    const y = yFn(o.x) + 3;
    const g = { x: o.x, h: o.h, lean: 0, ph: o.ph, fl: 1 };
    const a = grassAngle(g, windFn, t, gain) * 1.1;
    const h = o.h * scale;
    blade(ctx, o.x, y, h, 0.9 * scale, a);
    const tx = o.x + Math.sin(a) * h, ty = y - Math.cos(a) * h;
    for (let j = 0; j < o.n; j++) {
      const u = 1 - j * 0.1;
      const px = o.x + Math.sin(a) * h * u, py = y - Math.cos(a) * h * u;
      const side = j % 2 ? 1 : -1;
      const sa = a + side * 0.9 + Math.sin(t * 3 + j + o.ph) * 0.1 + a * 0.5;
      const L = 9 * scale;
      lens(ctx, px, py, px + Math.sin(sa) * L, py - Math.cos(sa) * L * 0.4 + L * 0.8, 2.1 * scale);
    }
    lens(ctx, tx, ty, tx + Math.sin(a) * 8 * scale, ty - Math.cos(a) * 8 * scale, 1.8 * scale);
  }
  for (const b of P.b) {
    if (b.x < x0 - 60 || b.x > x1 + 60) continue;
    const y = yFn(b.x) + 3;
    const g = { x: b.x, h: b.h, lean: 0.1, ph: b.ph, fl: 1 };
    const a = grassAngle(g, windFn, t, gain);
    const h = b.h * scale;
    blade(ctx, b.x, y, h, 0.8 * scale, a);
    const tx = b.x + Math.sin(a) * h, ty = y - Math.cos(a) * h;
    for (let j = 0; j < b.n; j++) {
      const bx = tx + (j - 0.5) * 7 * scale + Math.sin(a) * 4, by = ty + j * 6 * scale;
      const sw = Math.sin(t * 2.6 + b.ph + j) * 0.2 + a;
      const cx = bx + Math.sin(sw) * 6 * scale, cy = by + Math.cos(sw) * 6 * scale;
      capsule(ctx, bx, by, 0.5 * scale, cx, cy, 0.5 * scale);
      // колокольчик: чашечка с зубчатым краем
      const r = 4.2 * scale;
      ctx.moveTo(cx - r * 0.3, cy);
      ctx.quadraticCurveTo(cx - r, cy + r * 0.4, cx - r * 1.05, cy + r * 1.5);
      ctx.lineTo(cx - r * 0.5, cy + r * 1.25);
      ctx.lineTo(cx, cy + r * 1.55);
      ctx.lineTo(cx + r * 0.5, cy + r * 1.25);
      ctx.lineTo(cx + r * 1.05, cy + r * 1.5);
      ctx.quadraticCurveTo(cx + r, cy + r * 0.4, cx + r * 0.3, cy);
      ctx.closePath();
    }
  }
  ctx.fill();
  ctx.beginPath();
  for (const d of P.d) {
    if (d.x < x0 - 60 || d.x > x1 + 60) continue;
    const y = yFn(d.x) + 3;
    const g = { x: d.x, h: d.h, lean: 0.05, ph: d.ph, fl: 0.8 };
    const a = grassAngle(g, windFn, t, gain) * 0.8;
    const h = d.h * scale;
    blade(ctx, d.x, y, h, 1.1 * scale, a);
    const cx = d.x + Math.sin(a) * h, cy = y - Math.cos(a) * h;
    dandelionHead(ctx, cx, cy, d.r * scale, d.seeds, seedsLeft ? seedsLeft(d) : d.seeds, a, t, d.ph, scale);
  }
  ctx.fill();
}

/** Головка одуванчика: лучи-волоски с зонтиками на концах — тончайшее кружево. */
function dandelionHead(ctx, cx, cy, r, total, left, a, t, ph, scale) {
  circle(ctx, cx, cy, 1.8 * scale);
  for (let i = 0; i < total; i++) {
    if (i >= left) break;
    const aa = (i / total) * TAU + ph + Math.sin(t * 2 + i) * 0.03 + a * 0.3;
    const ex = cx + Math.cos(aa) * r, ey = cy + Math.sin(aa) * r;
    lens(ctx, cx, cy, ex, ey, 0.32 * scale);
    circle(ctx, ex, ey, 0.95 * scale);
  }
}

/* ---------- Птицы ---------- */
function drawBird(ctx, x, y, s, flap, dir) {
  const wUp = Math.sin(flap) * 0.9;
  const L = 13 * s;
  ctx.moveTo(x - 5 * s * dir, y);
  lens(ctx, x - 6 * s * dir, y + 0.5 * s, x + 7 * s * dir, y - 1 * s, 2.2 * s);
  const wx = Math.cos(wUp), wy = Math.sin(wUp);
  lens(ctx, x, y - 1 * s, x - L * 0.35 * dir * wx - 2 * s * dir, y - L * wy - L * 0.25, 2.4 * s);
  lens(ctx, x + 1 * s * dir, y - 1 * s, x + L * 0.25 * dir * wx, y - L * 0.9 * wy - L * 0.2, 2.2 * s);
}

/* ---------- Воздушный змей ---------- */
/** Змей-кружево: рамка, крестовина, в середине солнце-прорезь. tail — точки хвоста. */
function drawKite(ctx, x, y, s, ang, tail, t) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.scale(s, s);
  const T = [0, -46], Rr = [27, -10], Bm = [0, 40], Lf = [-27, -10];
  ctx.beginPath();
  poly(ctx, [T, Rr, Bm, Lf]);
  // четыре окна между крестовиной и рамкой
  const inset = (A, B, C, k) => [lerp(A[0], (A[0] + B[0] + C[0]) / 3, k), lerp(A[1], (A[1] + B[1] + C[1]) / 3, k)];
  const O = [0, -10];
  const tri = (A, B) => {
    const q = [inset(A, B, O, 0.28), inset(B, O, A, 0.28), inset(O, A, B, 0.28)];
    poly(ctx, q, true);
  };
  tri(T, Rr); tri(Rr, Bm); tri(Bm, Lf); tri(Lf, T);
  ctx.fill();
  ctx.beginPath();
  circle(ctx, 0, -10, 9);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    lens(ctx, Math.cos(a) * 9, -10 + Math.sin(a) * 9, Math.cos(a) * 15, -10 + Math.sin(a) * 15, 2.2);
  }
  circle(ctx, 0, -10, 4.2, true);
  ctx.fill();
  ctx.restore();
  if (tail && tail.length > 1) {
    ctx.beginPath();
    ribbon(ctx, tail, taper(tail.length, 1.3 * s, 0.7 * s));
    for (let i = 2; i < tail.length; i += 3) {
      const [px, py] = tail[i];
      const q = tail[Math.min(tail.length - 1, i + 1)];
      const aa = Math.atan2(q[1] - py, q[0] - px) + PI / 2;
      const L = 7 * s, w = 3.2 * s;
      lens(ctx, px, py, px + Math.cos(aa) * L, py + Math.sin(aa) * L, w);
      lens(ctx, px, py, px - Math.cos(aa) * L, py - Math.sin(aa) * L, w);
    }
    ctx.fill();
  }
}

/* ---------- Банка ---------- */
/** Стеклянная банка: контур, блики, крышка с просечным узором. Возвращает внутренний контур для подсветки. */
function jarOutline(ctx, s) {
  ctx.moveTo(-15 * s, -58 * s);
  ctx.lineTo(-15 * s, -54 * s);
  ctx.quadraticCurveTo(-22 * s, -52 * s, -22 * s, -44 * s);
  ctx.lineTo(-22 * s, -7 * s);
  ctx.quadraticCurveTo(-22 * s, 0, -14 * s, 0);
  ctx.lineTo(14 * s, 0);
  ctx.quadraticCurveTo(22 * s, 0, 22 * s, -7 * s);
  ctx.lineTo(22 * s, -44 * s);
  ctx.quadraticCurveTo(22 * s, -52 * s, 15 * s, -54 * s);
  ctx.lineTo(15 * s, -58 * s);
}
function drawJar(ctx, x, y, s, ang, lid, light) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  // стекло: едва заметная дымка, чтобы банка читалась и на чёрном;
  // с пойманным ветром — светится изнутри, как фонарик (свет складывается с тем, что за стеклом)
  ctx.beginPath();
  jarOutline(ctx, s);
  ctx.closePath();
  ctx.fillStyle = rgba([255, 240, 220], 0.09);
  ctx.fill();
  if (light && light.a > 0.01) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(0, -30 * s, 2 * s, 0, -30 * s, 38 * s);
    g.addColorStop(0, rgba(light.col, 0.8 * light.a));
    g.addColorStop(0.55, rgba(light.col, 0.42 * light.a));
    g.addColorStop(1, rgba(light.col, 0.16 * light.a));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
  }
  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK_CSS;
  ctx.lineWidth = 2.6 * s;
  ctx.stroke();
  // блики на стекле — тонкие чёрные «грани»
  ctx.fillStyle = INK_CSS;
  ctx.beginPath();
  lens(ctx, -16 * s, -42 * s, -16 * s, -12 * s, 1.1 * s);
  lens(ctx, -11 * s, -40 * s, -11 * s, -30 * s, 0.7 * s);
  poly(ctx, [[-16 * s, -57 * s], [16 * s, -57 * s], [16 * s, -55.4 * s], [-16 * s, -55.4 * s]]);
  ctx.fill();
  if (lid) {
    ctx.save();
    ctx.translate(lid.dx * s, lid.dy * s);
    ctx.rotate(lid.a || 0);
    lidShape(ctx, s);
    ctx.restore();
  }
  ctx.restore();
}

/** Крышка банки: обод с дырочками и петелька. Координаты — как у банки (низ банки в 0). */
function lidShape(ctx, s) {
  ctx.fillStyle = INK_CSS;
  ctx.beginPath();
  poly(ctx, [[-18 * s, -58 * s], [18 * s, -58 * s], [18 * s, -67 * s], [-18 * s, -67 * s]]);
  for (let i = 0; i < 7; i++) circle(ctx, (-13.5 + i * 4.5) * s, -62.5 * s, 1.3 * s, true);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-5 * s, -67 * s);
  ctx.quadraticCurveTo(-6 * s, -75 * s, 0, -75.5 * s);
  ctx.quadraticCurveTo(6 * s, -75 * s, 5 * s, -67 * s);
  ctx.lineTo(3 * s, -67 * s);
  ctx.quadraticCurveTo(3.5 * s, -72.5 * s, 0, -72.8 * s);
  ctx.quadraticCurveTo(-3.5 * s, -72.5 * s, -3 * s, -67 * s);
  ctx.closePath();
  ctx.fill();
}
/** Отдельная крышка: центр обода в (x, y), поворот a. */
function drawLid(ctx, x, y, s, a) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a || 0);
  ctx.translate(0, 62.5 * s);
  lidShape(ctx, s);
  ctx.restore();
}
