'use strict';
/* ==========================================================================
   world.js — лес. Камера с перспективой (параллакс слоёв), небо, дальние
   планы, земля, деревья и частицы. Рисуется подмалёвок на Canvas 2D,
   живопись поверх делает шейдер.
   Мировые единицы — метры: x вправо, y вверх, z вглубь кадра.
   ========================================================================== */

const CAM = { x: 0, y: 1.6, z: 0, f: 900, hy: 470 };
let BK = 1;             // пикселей подмалёвка на единицу виртуального кадра
let ENV = null;         // палитра и параметры сезона текущего плана
let TNOW = 0;           // время текущего кадра

function setCam(c) { CAM.x = c[0]; CAM.y = c[1]; CAM.z = c[2]; CAM.f = c[3]; CAM.hy = c[4]; }
function proj(x, y, z) {
  const d = z - CAM.z, s = CAM.f / d;
  return { x: VW / 2 + (x - CAM.x) * s, y: CAM.hy - (y - CAM.y) * s, s, d };
}
// Локальная система: начало в экранной точке (sx, sy), масштаб s пикс/м, ось y вверх
function place(ctx, sx, sy, s, fx = 1) { ctx.setTransform(BK * s * fx, 0, 0, -BK * s, BK * sx, BK * sy); }
function scr(ctx) { ctx.setTransform(BK, 0, 0, BK, 0, 0); }
const fogK = (d) => {
  let k = 1 - Math.exp(-Math.max(0, d) * ENV.fogDen);
  if (ENV.dof) k += ENV.dof * clamp((d - ENV.focus) / (ENV.focus * 2.5)) * 0.55;   // «глубина резкости» для крупных планов
  return Math.min(0.86, k);
};
const fogged = (c, d) => mixc(c, ENV.fog, fogK(d));
const lit = (c, k) => mixc(c, mulc(light(c, 0.35), ENV.light), k);

/* ---------- ветер: сила и накопленный снос ---------- */
let WIND = () => 0.2;
let windTable = null;
function buildWind(fn) {
  WIND = fn;
  const n = Math.ceil((DURATION + 10) * 30);
  windTable = new Float32Array(n + 1);
  let acc = 0;
  for (let i = 0; i <= n; i++) { windTable[i] = acc; acc += (0.15 + fn(i / 30) * 2.2) / 30; }
}
function windX(t) {
  const f = clamp(t, 0, DURATION + 9.9) * 30, i = Math.floor(f);
  return lerp(windTable[i], windTable[i + 1], f - i);
}
const gust = (t, seed = 0) => WIND(t) * (0.55 + 0.45 * fbm1(t * 0.9 + seed * 3.1));

/* ---------- небо ---------- */
function drawSky(ctx, t) {
  scr(ctx);
  const hy = CAM.hy, E = ENV;
  ctx.fillStyle = linear(ctx, 0, hy - 760, 0, hy + 4, [
    [0, css(E.top)], [0.55, css(E.mid)], [0.88, css(mixc(E.mid, E.hor, 0.65))], [1, css(E.hor)],
  ]);
  ctx.fillRect(0, 0, VW, VH);
  // звёзды
  if (E.stars > 0.02) {
    ctx.fillStyle = css(E.sun, E.stars * 0.8);
    ctx.beginPath();
    for (let i = 0; i < 70; i++) {
      const x = hash(i * 3.1) * VW, y = hy - 180 - hash(i * 7.7) * 700;
      if (y < -10 || y > hy - 150) continue;
      circ(ctx, x, y, 0.8 + hash(i * 1.3) * 1.4);
    }
    ctx.fill();
  }
  // светило
  const sx = E.sunX - (CAM.x * 2), sy = hy - E.sunE * CAM.f / 900;
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = radial(ctx, sx, sy, 0, 560 * (0.5 + E.glow), [
    [0, css(E.glowC, 0.55 * E.glow)], [0.25, css(E.glowC, 0.22 * E.glow)], [1, css(E.glowC, 0)],
  ]);
  ctx.fillRect(0, 0, VW, VH);
  ctx.globalCompositeOperation = 'source-over';
  // облака: мягкие пятна, дрейфуют
  if (E.cloudAmt > 0.02) {
    for (let i = 0; i < 9; i++) {
      const w = 260 + hash(i * 5.3) * 380, h = 40 + hash(i * 2.9) * 60;
      const x = ((hash(i * 9.1) * 2400 + t * (6 + hash(i) * 8) - CAM.x * 6) % 2400 + 2400) % 2400 - 400;
      const y = hy - 250 - hash(i * 4.4) * 330 - (1 - E.cloudAmt) * 120;
      const a = E.cloudAmt * (0.35 + 0.35 * hash(i * 6.6));
      for (let j = 0; j < 4; j++) {
        const cx = x + (hash(i * 17 + j) - 0.5) * w * 0.8, cy = y + (hash(i * 13 + j) - 0.5) * h * 0.6;
        const rr = w * (0.28 + hash(i * 11 + j) * 0.25);
        ctx.fillStyle = radial(ctx, cx, cy - h * 0.2, 0, rr, [
          [0, css(light(E.cloud, 0.12), a)], [0.55, css(E.cloud, a * 0.7)], [1, css(E.cloud, 0)],
        ]);
        ctx.save(); ctx.translate(cx, cy); ctx.scale(1, h / rr * 1.4); ctx.translate(-cx, -cy);
        ctx.beginPath(); circ(ctx, cx, cy, rr); ctx.fill();
        ctx.restore();
      }
    }
  }
  // диск
  if (E.sunR > 0) {
    ctx.fillStyle = radial(ctx, sx, sy, E.sunR * 0.6, E.sunR * 1.25, [[0, css(E.sun)], [1, css(E.sun, 0)]]);
    ctx.beginPath(); circ(ctx, sx, sy, E.sunR * 1.25); ctx.fill();
    if (E.moon > 0.5) {
      ctx.fillStyle = css(mixc(E.sun, E.mid, 0.25), 0.35);
      ctx.beginPath(); circ(ctx, sx + E.sunR * 0.3, sy - E.sunR * 0.15, E.sunR * 0.35); circ(ctx, sx - E.sunR * 0.35, sy + E.sunR * 0.25, E.sunR * 0.22); ctx.fill();
    }
  }
}

/* ---------- дальние планы: силуэты леса и холмов ---------- */
const BANDS = [];
function makeBand(seed, z, kind, spacing, hMin, hMax, rise) {
  const N = 4000, x0 = -200, dx = 0.1, prof = new Float32Array(N), r = rng(seed);
  for (let i = 0; i < N; i++) {
    const x = x0 + i * dx;
    prof[i] = rise * (0.5 + 0.5 * fbm1(x * 0.012 + seed));
  }
  if (kind !== 'hill') {
    const top = new Float32Array(N);
    for (let x = x0; x < 200;) {
      const h = hMin + (hMax - hMin) * r();
      const w = kind === 'spruce' ? h * 0.2 : h * 0.42;
      const i0 = Math.max(0, Math.floor((x - w - x0) / dx)), i1 = Math.min(N - 1, Math.ceil((x + w - x0) / dx));
      for (let i = i0; i <= i1; i++) {
        const u = Math.abs(x0 + i * dx - x) / w;
        if (u > 1) continue;
        let v = kind === 'spruce' ? h * (1 - u) * (1 - 0.08 * Math.sin(u * 40)) : h * Math.sqrt(1 - u * u);
        if (v > top[i]) top[i] = v;
      }
      x += spacing * (0.55 + 0.9 * r());
    }
    for (let i = 0; i < N; i++) prof[i] += top[i];
  }
  BANDS.push({ z, kind, prof, x0, dx });
}
makeBand(3, 190, 'hill', 0, 0, 0, 26);
makeBand(5, 95, 'spruce', 2.6, 11, 21, 4);
makeBand(8, 55, 'mixed', 3.4, 9, 16, 1.5);

function bandH(b, x) {
  const f = (x - b.x0) / b.dx, i = Math.floor(f);
  if (i < 0 || i >= b.prof.length - 1) return b.prof[0];
  return lerp(b.prof[i], b.prof[i + 1], f - i);
}
function drawBands(ctx, colorFn) {
  scr(ctx);
  for (const b of BANDS) {
    const d = b.z - CAM.z; if (d < 5) continue;
    const s = CAM.f / d;
    const baseY = CAM.hy + CAM.y * s;
    const k = Math.min(0.72, 1 - Math.exp(-d * ENV.fogDen * 0.8));
    const base = colorFn(b);
    const cTop = mixc(mixc(base.top, ENV.fog, k), ENV.hor, 0.1), cBot = mixc(base.bot, ENV.fog, k * 0.85);
    let minY = baseY;
    ctx.beginPath();
    ctx.moveTo(-10, baseY + 40);
    for (let sx = -10; sx <= VW + 10; sx += 5) {
      const wx = CAM.x + (sx - VW / 2) / s;
      const y = baseY - bandH(b, wx) * s;
      if (y < minY) minY = y;
      ctx.lineTo(sx, y);
    }
    ctx.lineTo(VW + 10, baseY + 40);
    ctx.closePath();
    ctx.fillStyle = linear(ctx, 0, minY, 0, baseY + 10, [[0, css(cTop)], [1, css(cBot)]]);
    ctx.fill();
  }
}

/* ---------- земля ---------- */
function groundY(z) { return CAM.hy + CAM.y * CAM.f / (z - CAM.z); }
function drawGroundBase(ctx) {
  scr(ctx);
  const E = ENV, hy = CAM.hy;
  const far = mixc(E.groundFar, E.fog, 0.3);
  ctx.fillStyle = linear(ctx, 0, hy, 0, VH + 40, [[0, css(far)], [0.35, css(mixc(far, E.groundNear, 0.6))], [1, css(E.groundNear)]]);
  ctx.fillRect(0, hy - 1, VW, VH - hy + 2);
}
// Цвет земли на высоте sy экрана — тот же градиент, что в drawGroundBase
function groundAt(sy) {
  const E = ENV, far = mixc(E.groundFar, E.fog, 0.3), mid = mixc(far, E.groundNear, 0.6);
  const k = clamp((sy - CAM.hy) / (VH + 40 - CAM.hy));
  return k < 0.35 ? mixc(far, mid, k / 0.35) : mixc(mid, E.groundNear, (k - 0.35) / 0.65);
}
// Полосы на земле (сугробы/трава), привязанные к миру — дают параллакс
function drawGroundStrokes(ctx, t) {
  scr(ctx);
  const E = ENV;
  const snow = E.snow;
  for (let li = 0; li < 16; li++) {
    const z = 4 + li * li * 0.55 + 1.5;
    const d = z - CAM.z; if (d < 1.2) continue;
    const s = CAM.f / d, gy = groundY(z);
    if (gy > VH + 60 || gy < CAM.hy - 2) continue;
    const kf = fogK(d);
    const cSnowL = mixc(light(E.groundNear, 0.25), E.fog, kf * 0.7);
    const cSnowD = mixc(mixc(E.snowSh, E.groundNear, 0.3), E.fog, kf * 0.7);
    const cGrass = mixc(mixc(E.groundNear, E.groundFar, 0.3), E.fog, kf);
    // волнистая линия на глубине z
    ctx.beginPath();
    let first = true;
    for (let sx = -20; sx <= VW + 40; sx += 26) {
      const wx = CAM.x + (sx - VW / 2) / s;
      const y = gy - (0.06 + 0.1 * (0.5 + 0.5 * fbm1(wx * 0.35 + li * 7.3))) * s * (0.4 + snow * 0.6);
      if (first) { ctx.moveTo(sx, y); first = false; } else ctx.lineTo(sx, y);
    }
    const th = Math.max(1.2, 0.05 * s);
    ctx.lineWidth = th;
    ctx.strokeStyle = css(snow > 0.5 ? cSnowD : cGrass, 0.35 * (0.4 + 0.6 * snow) + 0.15);
    ctx.stroke();
    ctx.translate(0, th * 1.1);
    ctx.strokeStyle = css(snow > 0.5 ? cSnowL : light(cGrass, 0.15), 0.35);
    ctx.stroke();
    scr(ctx);
  }
}

/* ---------- деревья ---------- */
function makeSpruce(seed, x, z, h) {
  const r = rng(seed);
  const boughs = [];
  const n = 15 + Math.floor(r() * 6);
  for (let i = 0; i < n; i++) {
    const f = i / n;
    const y = h * (0.07 + 0.88 * f);
    const len0 = h * 0.26 * Math.pow(1 - f, 0.9) + 0.22;
    for (const side of [-1, 1]) {
      if (f > 0.2 && r() < 0.12) continue;           // просветы
      boughs.push({
        y: y + (r() - 0.5) * h * 0.025, side,
        len: len0 * (0.72 + r() * 0.5),
        droop: 0.22 + r() * 0.3 + f * 0.1,
        th: h * 0.028 * (0.7 + (1 - f) * 0.8) * (0.8 + r() * 0.4) + 0.06,
        j: [r(), r(), r(), r(), r(), r()],
      });
    }
  }
  return { kind: 'spruce', seed, x, z, h, boughs, tw: h * 0.022 };
}
function makeDeciduous(kind, seed, x, z, h) {
  const r = rng(seed);
  const lean = (r() - 0.5) * 0.05;
  const branches = [], dabs = [], berries = [], twigs = [];
  const birch = kind === 'birch';
  const nb = birch ? 11 : 9;
  for (let i = 0; i < nb; i++) {
    const f = i / (nb - 1);
    const by = h * (birch ? 0.38 : 0.36) + f * h * 0.56;
    const side = i % 2 ? 1 : -1;
    const len = h * (0.2 + 0.16 * (1 - f)) * (0.75 + r() * 0.5) * (kind === 'rowan' ? 1.1 : 1);
    let a = side * (0.45 + r() * 0.5);
    const bx = lean * by;
    const pts = [[bx, by]];
    let px = bx, py = by;
    for (let k = 1; k <= 4; k++) {
      a += (birch ? 0.2 : 0.08) * side * (k * 0.5);
      px += Math.sin(a) * len / 4; py += Math.cos(a) * len / 4 - (birch ? k * 0.06 * len / 4 : 0);
      pts.push([px, py]);
    }
    branches.push({ pts, w: h * 0.0065 * (1.25 - f * 0.55) + 0.02 });
    // гроздья листвы вдоль ветки
    const nc = birch ? 4 : 4;
    for (let c = 0; c < nc; c++) {
      const u = 0.35 + 0.65 * (c + r()) / nc;
      const seg = Math.min(3, Math.floor(u * 4)), fu = u * 4 - seg;
      const p0 = pts[seg], p1 = pts[seg + 1];
      const cx = lerp(p0[0], p1[0], fu), cy = lerp(p0[1], p1[1], fu);
      // свисающий прут берёзы
      if (birch) {
        const tl = h * (0.06 + r() * 0.1);
        twigs.push({ x: cx, y: cy, l: tl, c: (r() - 0.5) * 0.3 });
        for (let k = 0; k < 9; k++) {
          const v = r();
          dabs.push({ x: cx + (r() - 0.5) * h * 0.035 + v * tl * 0.1, y: cy - v * tl - r() * h * 0.02, r: h * (0.011 + r() * 0.008), g: Math.floor(r() * 4), o: r(), rot: r() * 3 });
        }
      } else {
        for (let k = 0; k < 10; k++) {
          dabs.push({ x: cx + (r() - 0.5) * h * 0.09, y: cy + (r() - 0.35) * h * 0.07, r: h * (0.014 + r() * 0.012) * (kind === 'aspen' ? 1.2 : 1), g: Math.floor(r() * 4), o: r(), rot: r() * 3 });
        }
      }
    }
    if (kind === 'rowan') {
      const q = pts[3];
      berries.push({ x: q[0] + (r() - 0.5) * 0.2, y: q[1] - 0.1, n: 9 + Math.floor(r() * 6) });
      const q2 = pts[4];
      berries.push({ x: q2[0], y: q2[1] - 0.08, n: 7 + Math.floor(r() * 5) });
    }
  }
  // верхушка
  for (let k = 0; k < 26; k++) {
    dabs.push({ x: lean * h + (r() - 0.5) * h * 0.14, y: h * (0.86 + r() * 0.15), r: h * (0.012 + r() * 0.01), g: Math.floor(r() * 4), o: r(), rot: r() * 3 });
  }
  dabs.sort((a, b) => a.o - b.o);
  const marks = Array.from({ length: 26 }, () => ({ y: r() * h * 0.92, side: r() < 0.5 ? -1 : 1, len: 0.3 + r() * 0.6, th: 0.02 + r() * 0.04 }));
  return { kind, seed, x, z, h, lean, branches, dabs, marks, berries, twigs, tw: birch ? h * 0.018 : h * 0.024 };
}

// Цвета листвы: 0 — весна, 1 — лето, 2 — золотая осень, 3 — красная осень
const LEAF = [
  ['#b9dc6d', '#9fcb5a', '#d3e68e', '#86b84d'],
  ['#5f9139', '#4b7a30', '#76a449', '#3c6a2a'],
  ['#e8b83c', '#d99a2b', '#f3d25a', '#c7802a'],
  ['#d8662e', '#b84a2a', '#e98c3a', '#9b3a28'],
].map((g) => g.map(hex));
function leafColor(hue, g) {
  const i = Math.min(2, Math.floor(hue)), f = hue - i;
  return mixc(LEAF[i][g], LEAF[i + 1][g], f);
}

function drawSpruce(ctx, tr, t) {
  const p = proj(tr.x, 0, tr.z); if (p.d < 0.6) return;
  const s = p.s, halfW = tr.h * 0.3 * s;
  if (p.x + halfW < -40 || p.x - halfW > VW + 40 || tr.h * s < 3) return;
  const E = ENV, d = p.d, h = tr.h;
  const sway = gust(t, tr.seed) * 0.03;
  const base = fogged(mixc(E.spruce, E.shadow, 0.3), d);
  const litC = fogged(lit(E.spruce, 0.6), d);
  const snowC = fogged(light(E.groundNear, 0.12), d), snowD = fogged(mixc(E.snowSh, E.groundNear, 0.2), d);
  const side = E.sunX > VW / 2 ? 1 : -1;
  place(ctx, p.x, p.y, s);
  const lod = h * s < 110;
  const step = lod ? 2 : 1;
  const bx = (y) => sway * y * y / h;
  // ствол и тёмная сердцевина кроны
  ctx.fillStyle = css(fogged(E.trunk, d));
  ctx.beginPath();
  ctx.moveTo(-tr.tw, 0); ctx.lineTo(bx(h * 0.9) - tr.tw * 0.3, h * 0.9); ctx.lineTo(bx(h * 0.9) + tr.tw * 0.3, h * 0.9); ctx.lineTo(tr.tw, 0);
  ctx.fill();
  const dk = new Path2D(), lt = new Path2D(), sn = new Path2D();
  dk.moveTo(bx(h) , h);
  dk.lineTo(bx(h * 0.6) - h * 0.05, h * 0.6); dk.lineTo(-h * 0.07, h * 0.12); dk.lineTo(h * 0.07, h * 0.12); dk.lineTo(bx(h * 0.6) + h * 0.05, h * 0.6);
  dk.closePath();
  for (let i = 0; i < tr.boughs.length; i += step) {
    const b = tr.boughs[i];
    const x0 = bx(b.y), y0 = b.y, sd = b.side;
    const L = b.len * (lod ? 1.1 : 1), th = b.th * (lod ? 1.5 : 1);
    const tipX = x0 + sd * L, tipY = y0 - b.droop * L;
    // лапа: верхний край — дуга к кончику, нижний — неровная бахрома
    dk.moveTo(x0, y0 + th * 0.55);
    dk.quadraticCurveTo(x0 + sd * L * 0.55, y0 + th * 0.35 - b.droop * L * 0.15, tipX, tipY);
    const nF = lod ? 3 : 6;
    for (let k = 1; k <= nF; k++) {
      const u = 1 - k / (nF + 1);
      const fx = x0 + sd * L * u, fy = y0 - b.droop * L * u * u - th * (0.45 + 0.9 * u * (1 - u));
      dk.lineTo(fx + sd * th * 0.2, fy - th * 0.5 * b.j[k % 6] * (k % 2 ? 1 : 0.3));
      dk.lineTo(fx - sd * th * 0.15, fy + th * 0.1);
    }
    dk.lineTo(x0, y0 - th * 0.6);
    dk.closePath();
    // свет на верхней стороне лапы (со стороны солнца — ярче)
    const lk = sd === side ? 1 : 0.45;
    lt.moveTo(x0, y0 + th * 0.5);
    lt.quadraticCurveTo(x0 + sd * L * 0.55, y0 + th * 0.3 - b.droop * L * 0.15, x0 + sd * L * (0.55 + 0.4 * lk), y0 - b.droop * L * (0.55 + 0.4 * lk) * (0.55 + 0.4 * lk));
    lt.quadraticCurveTo(x0 + sd * L * 0.45, y0 - b.droop * L * 0.25, x0, y0 + th * 0.05);
    lt.closePath();
    // снежная подушка
    if (E.snow > 0.02) {
      const sh = th * (0.55 + 0.6 * b.j[2]) * E.snow;
      const ex = x0 + sd * L * 0.88, ey = y0 - b.droop * L * 0.8;
      sn.moveTo(x0, y0 + th * 0.45);
      sn.quadraticCurveTo(x0 + sd * L * 0.5, y0 + th * 0.3 - b.droop * L * 0.12, ex, ey);
      sn.quadraticCurveTo(x0 + sd * L * 0.52, y0 + th * 0.35 - b.droop * L * 0.1 + sh * 1.4, x0 + sd * th * 0.3, y0 + th * 0.45 + sh);
      sn.closePath();
    }
  }
  ctx.fillStyle = css(base); ctx.fill(dk);
  ctx.fillStyle = css(litC, 0.55); ctx.fill(lt);
  if (E.snow > 0.02) {
    ctx.fillStyle = css(snowC, clamp(E.snow * 1.3)); ctx.fill(sn);
    ctx.lineWidth = Math.max(0.03, h * 0.004);
    ctx.strokeStyle = css(snowD, 0.35 * E.snow); ctx.stroke(sn);
  }
}

function drawDeciduous(ctx, tr, t) {
  const p = proj(tr.x, 0, tr.z); if (p.d < 0.6) return;
  const s = p.s, halfW = tr.h * 0.4 * s;
  if (p.x + halfW < -40 || p.x - halfW > VW + 40 || tr.h * s < 3) return;
  const E = ENV, d = p.d, h = tr.h;
  const sway = gust(t, tr.seed) * 0.05;
  const side = E.sunX > VW / 2 ? 1 : -1;
  place(ctx, p.x, p.y, s);
  // ствол
  const bark = tr.kind === 'birch' ? hex('#e6e1d6') : tr.kind === 'aspen' ? hex('#8d9486') : hex('#6d625a');
  const barkC = fogged(mulc(light(bark, 0.1), mixc(ENV.light, WHITE, 0.3)), d);
  const barkS = fogged(mixc(bark, E.shadow, 0.55), d);
  const tw = tr.tw, lean = tr.lean;
  // контактная тень у корней (зимой её закроет снежный намёт)
  if (E.snow < 0.5) {
    ctx.fillStyle = css(fogged(E.shadow, d), 0.3 * (1 - E.snow * 2));
    ctx.beginPath(); ell(ctx, side * tw * 0.8, 0, tw * 3.2, tw * 0.55); ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(-tw, 0);
  ctx.quadraticCurveTo(-tw * 0.7 + lean * h * 0.4, h * 0.5, -tw * 0.18 + lean * h + sway * h * 0.3, h * 0.97);
  ctx.lineTo(tw * 0.18 + lean * h + sway * h * 0.3, h * 0.97);
  ctx.quadraticCurveTo(tw * 0.7 + lean * h * 0.4, h * 0.5, tw, 0);
  ctx.closePath();
  ctx.fillStyle = css(barkC); ctx.fill();
  // теневая сторона ствола
  ctx.beginPath();
  ctx.moveTo(-side * tw, 0);
  ctx.quadraticCurveTo(-side * tw * 0.7 + lean * h * 0.4, h * 0.5, -side * tw * 0.18 + lean * h + sway * h * 0.3, h * 0.97);
  ctx.lineTo(lean * h + sway * h * 0.3, h * 0.97);
  ctx.quadraticCurveTo(lean * h * 0.4 - side * tw * 0.15, h * 0.5, -side * tw * 0.2, 0);
  ctx.fillStyle = css(barkS, 0.65); ctx.fill();
  if (tr.kind === 'birch') {
    // чечевички
    ctx.fillStyle = css(fogged(hex('#2a2626'), d), 0.85);
    ctx.beginPath();
    for (const m of tr.marks) {
      const k = m.y / h, cw = tw * (1 - k * 0.82);
      const cx = lean * h * k * k + sway * h * 0.3 * k * k;
      ctx.rect(cx + (m.side > 0 ? cw * (1 - m.len) : -cw), m.y, cw * m.len, m.th * (1 + (1 - k)));
    }
    ctx.fill();
    // тёмный растрескавшийся комель: трещины разной высоты уходят вверх по бересте
    ctx.fillStyle = css(fogged(mixc(hex('#35302f'), barkS, 0.3), d), 0.82);
    ctx.beginPath();
    const nf = 6, bh = h * 0.07;
    ctx.moveTo(-tw, 0);
    for (let i = 0; i <= nf; i++) {
      const x = -tw + 2 * tw * i / nf, hh = bh * (0.2 + 0.8 * hash(tr.seed * 3.7 + i * 1.3));
      ctx.lineTo(clamp(x - tw / nf * 0.5, -tw, tw), hh * 0.3);
      ctx.lineTo(x, hh);
      ctx.lineTo(clamp(x + tw / nf * 0.5, -tw, tw), hh * 0.3);
    }
    ctx.lineTo(tw, 0);
    ctx.closePath();
    ctx.fill();
  }
  // снежный намёт у корней — того же тона, что снег вокруг ствола
  if (E.snow > 0.05) {
    ctx.fillStyle = css(lit(groundAt(p.y), 0.25), clamp(E.snow * 1.3));
    ctx.beginPath(); ell(ctx, -side * tw * 0.4, h * 0.004, tw * 2.3, tw * 0.75 + h * 0.012); ctx.fill();
  }
  // ветви
  ctx.lineCap = 'round';
  ctx.strokeStyle = css(fogged(tr.kind === 'birch' ? hex('#3b3434') : hex('#4a4038'), d));
  for (const b of tr.branches) {
    ctx.beginPath();
    for (let k = 0; k < b.pts.length; k++) {
      const q = b.pts[k], bx = q[0] + sway * q[1] * q[1] / h;
      if (k === 0) ctx.moveTo(bx, q[1]); else ctx.lineTo(bx, q[1]);
    }
    ctx.lineWidth = b.w;
    ctx.stroke();
  }
  // свисающие прутья берёзы
  if (tr.twigs.length) {
    ctx.lineWidth = Math.max(0.012, h * 0.0016);
    ctx.strokeStyle = css(fogged(hex('#5a4a44'), d), 0.8);
    ctx.beginPath();
    for (const w of tr.twigs) {
      const x0 = w.x + sway * w.y * w.y / h, dx = Math.sin(t * 1.3 + w.x * 3) * 0.04 * w.l * (0.4 + WIND(t));
      ctx.moveTo(x0, w.y); ctx.quadraticCurveTo(x0 + w.c * w.l, w.y - w.l * 0.5, x0 + dx + w.c * w.l * 0.4, w.y - w.l);
    }
    ctx.stroke();
  }
  // снег на ветвях
  if (E.snow > 0.05) {
    ctx.strokeStyle = css(fogged(light(E.groundNear, 0.15), d), E.snow);
    for (const b of tr.branches) {
      ctx.beginPath();
      for (let k = 0; k < b.pts.length; k++) {
        const q = b.pts[k], bx = q[0] + sway * q[1] * q[1] / h;
        if (k === 0) ctx.moveTo(bx, q[1] + b.w * 0.8); else ctx.lineTo(bx, q[1] + b.w * 0.8);
      }
      ctx.lineWidth = b.w * 0.8;
      ctx.stroke();
    }
  }
  // листва
  const hueMax = tr.kind === 'birch' ? 2 : 3;
  const hue = E.hue <= 1 ? E.hue : 1 + (E.hue - 1) * (hueMax - 1);
  const amount = E.leaf;
  if (amount > 0.01) {
    const px = h * s;
    const lodStep = px < 70 ? 3 : px < 140 ? 2 : 1, lodR = lodStep === 1 ? 1 : lodStep === 2 ? 1.3 : 1.6;
    const nD = Math.floor(tr.dabs.length * amount);
    const grow = (0.55 + 0.45 * clamp(amount * 1.4)) * lodR;
    const gT = gust(t, tr.seed) * h * 0.004;
    const paths = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
    for (let i = 0; i < nD; i += lodStep) {
      const dd = tr.dabs[i];
      const wob = Math.sin(t * 2.3 + dd.o * 9) * gT;
      ell(paths[dd.g], dd.x + sway * dd.y * dd.y / h + wob, dd.y, dd.r * grow * 1.25, dd.r * grow, dd.rot);
    }
    for (let g = 0; g < 4; g++) {
      const c0 = leafColor(hue, g);
      const cc = fogged(g === 2 ? lit(c0, 0.6) : g === 3 ? mixc(c0, E.shadow, 0.3) : lit(c0, 0.2), d);
      ctx.fillStyle = css(cc);
      ctx.fill(paths[g]);
    }
  }
  // цветение (рябина весной — белые соцветия) и ягоды
  if (tr.kind === 'rowan') {
    if (E.blossom > 0.02) {
      ctx.fillStyle = css(fogged(hex('#f6f0e2'), d), E.blossom);
      ctx.beginPath();
      for (const b of tr.berries) {
        for (let k = 0; k < 9; k++) {
          const a = k * 2.4, rr = 0.1 * Math.sqrt(k / 9) * (0.6 + 0.4 * E.blossom);
          circ(ctx, b.x + sway * b.y * b.y / h + Math.cos(a) * rr * 1.3, b.y + 0.08 + Math.sin(a) * rr * 0.8, 0.028 * E.blossom);
        }
      }
      ctx.fill();
    }
    if (E.berries > 0.02) {
      const bc = fogged(mixc(hex('#9dbb4a'), hex('#d3322a'), clamp(E.berries * 1.2 - 0.2)), d);
      ctx.fillStyle = css(bc);
      ctx.beginPath();
      for (const b of tr.berries) {
        for (let k = 0; k < b.n; k++) {
          const a = k * 2.4, rr = 0.03 + 0.045 * Math.sqrt(k / b.n);
          circ(ctx, b.x + sway * b.y * b.y / h + Math.cos(a) * rr * 1.3, b.y + Math.sin(a) * rr - 0.02, 0.028);
        }
      }
      ctx.fill();
      if (E.snow > 0.3) {
        ctx.fillStyle = css(fogged(light(E.groundNear, 0.2), d), E.snow * 0.9);
        ctx.beginPath();
        for (const b of tr.berries) ell(ctx, b.x + sway * b.y * b.y / h, b.y + 0.07, 0.11, 0.035, 0);
        ctx.fill();
      }
    }
  }
}

function drawTree(ctx, tr, t) {
  if (tr.kind === 'spruce') drawSpruce(ctx, tr, t); else drawDeciduous(ctx, tr, t);
}

/* ---------- раскладки мира ---------- */
function genForest() {
  const r = rng(42), trees = [];
  trees.push(makeDeciduous('rowan', 901, 3.3, 10.6, 5.4));
  trees.push(makeSpruce(902, 7.4, 19, 16.5));
  [[-5.4, 17, 15], [-4.0, 20.5, 13.5], [-7.2, 21.5, 16.5], [-2.8, 25, 14], [-9.5, 17.5, 14.5]].forEach((a, i) => trees.push(makeDeciduous('birch', 910 + i, a[0], a[1], a[2])));
  [[9.2, 24, 13], [11.5, 28, 15]].forEach((a, i) => trees.push(makeDeciduous('aspen', 920 + i, a[0], a[1], a[2])));
  // стена леса за поляной
  for (let i = 0; i < 80; i++) {
    const z = 38 + Math.pow(r(), 0.9) * 38;
    const x = (r() * 2 - 1) * (16 + z * 0.9);
    const k = r();
    if (k < 0.6) trees.push(makeSpruce(1000 + i, x, z, 11 + r() * 8));
    else trees.push(makeDeciduous(k < 0.84 ? 'birch' : 'aspen', 1000 + i, x, z, 10 + r() * 6));
  }
  // редкие деревья по краям поляны
  for (let i = 0; i < 14; i++) {
    const z = 14 + r() * 14, side = r() < 0.5 ? -1 : 1;
    const x = side * (10 + r() * 12);
    trees.push(r() < 0.6 ? makeSpruce(1200 + i, x, z, 12 + r() * 8) : makeDeciduous('birch', 1200 + i, x, z, 12 + r() * 5));
  }
  // рама переднего плана
  trees.push(makeSpruce(950, -10.5, 6.5, 13));
  trees.push(makeSpruce(951, 12.5, 7.5, 14));
  trees.push(makeDeciduous('birch', 952, -7.6, 8.4, 12.5));
  return trees;
}
function genMeadow() {
  const r = rng(77), trees = [];
  for (let i = 0; i < 46; i++) {
    const z = 48 + r() * 30, x = (r() * 2 - 1) * 70;
    const k = r();
    if (k < 0.55) trees.push(makeDeciduous('birch', 2000 + i, x, z, 12 + r() * 7));
    else if (k < 0.8) trees.push(makeSpruce(2000 + i, x, z, 13 + r() * 8));
    else trees.push(makeDeciduous('aspen', 2000 + i, x, z, 12 + r() * 5));
  }
  trees.push(makeDeciduous('birch', 2101, -13, 19, 15));
  trees.push(makeDeciduous('birch', 2102, -15.5, 21, 13));
  trees.push(makeDeciduous('birch', 2103, 16, 22, 14));
  return trees;
}
const FOREST = genForest();
const MEADOW = genMeadow();
const ROWAN = FOREST[0];

/* ---------- частицы: снег, лепестки, листья, светлячки ---------- */
// Все частицы — функции времени: позиция считается из номера частицы и t.
function drawSnowfall(ctx, t, amount, o = {}) {
  if (amount < 0.01) return;
  scr(ctx);
  const n = Math.floor((o.n || 700) * amount);
  const fall = o.fall || 1, streak = o.streak || 0, sizeK = o.size || 1;
  const col = o.color || light(ENV.groundNear, 0.2);
  const wx = windX(t) * (o.windK || 1);
  const tFall = o.freezeAt != null ? Math.min(t, o.freezeAt) : t;
  const groups = [[], [], []];
  for (let i = 0; i < n; i++) {
    const h1 = hash(i * 1.37 + 0.1), h2 = hash(i * 2.71 + 0.2), h3 = hash(i * 3.33 + 0.3), h4 = hash(i * 4.17 + 0.4);
    const zr = 1.3 + h1 * h1 * 34;
    const span = 1.2 * zr * VW / CAM.f + 4;
    const sp = (0.55 + h2 * 0.6) * fall;
    let y = ((h3 * 16 - sp * tFall - CAM.y) % 16 + 16) % 16 - 8 + CAM.y * 0 ;
    y = y + 1.5;
    const sw = Math.sin(tFall * (0.7 + h4) + i) * 0.35;
    let x = ((h4 * 97 * span + wx * (0.7 + h2 * 0.5) + sw - CAM.x) % span + span) % span - span / 2;
    let z = ((h1 * 400 - CAM.z) % 34 + 34) % 34 + 1.3;
    const s = CAM.f / z;
    const sx = VW / 2 + x * s, sy = CAM.hy - (y - 0) * s;
    if (sx < -30 || sx > VW + 30 || sy < -30 || sy > VH + 30) continue;
    const r = Math.max(0.7, (0.011 + h2 * 0.012) * s * sizeK);
    const gi = z < 3 ? 0 : z < 9 ? 1 : 2;
    groups[gi].push(sx, sy, r);
  }
  const alphas = [0.35, 0.75, 0.85];
  for (let g = 0; g < 3; g++) {
    const arr = groups[g];
    ctx.fillStyle = css(col, alphas[g] * (o.alpha || 1));
    ctx.strokeStyle = css(col, alphas[g] * 0.7 * (o.alpha || 1));
    ctx.beginPath();
    if (streak > 0.05) {
      const dx = (0.8 + WIND(t) * 2.5) * streak * 5, dy = 2.5 * streak;
      for (let i = 0; i < arr.length; i += 3) {
        ctx.moveTo(arr[i] - dx * arr[i + 2], arr[i + 1] - dy * arr[i + 2]);
        ctx.lineTo(arr[i] + dx * arr[i + 2], arr[i + 1] + dy * arr[i + 2]);
      }
      ctx.lineWidth = Math.max(1, g === 0 ? 4 : g === 1 ? 2.2 : 1.2);
      ctx.lineCap = 'round';
      ctx.stroke();
    } else {
      for (let i = 0; i < arr.length; i += 3) circ(ctx, arr[i], arr[i + 1], arr[i + 2]);
      ctx.fill();
    }
  }
}

// Лепестки и листья: плоские вращающиеся «чешуйки»
function drawFlutter(ctx, t, amount, o) {
  if (amount < 0.01) return;
  scr(ctx);
  const n = Math.floor((o.n || 160) * amount);
  const cols = o.colors;
  const wx = windX(t) * (o.windK || 1.2);
  for (let i = 0; i < n; i++) {
    const h1 = hash(i * 5.13 + 1), h2 = hash(i * 6.27 + 2), h3 = hash(i * 7.91 + 3), h4 = hash(i * 8.33 + 4);
    let zr = 1.6 + h1 * h1 * 22;
    const span = 1.2 * zr * VW / CAM.f + 4;
    const sp = (0.25 + h2 * 0.35) * (o.fall || 1);
    let y = ((h3 * 12 - sp * t) % 12 + 12) % 12 - 3 + (o.rise ? o.rise(t, i) : 0);
    let x = ((h4 * 53 * span + wx * (0.6 + h2 * 0.6) + Math.sin(t * (0.9 + h1) + i) * 0.6 - CAM.x) % span + span) % span - span / 2;
    let z = ((h1 * 300 - CAM.z) % 22 + 22) % 22 + 1.6;
    if (o.swirl) { const q = o.swirl(t, i, x, y, z); x = q[0]; y = q[1]; z = q[2]; }
    const s = CAM.f / z;
    const sx = VW / 2 + x * s, sy = CAM.hy - y * s;
    if (sx < -40 || sx > VW + 40 || sy < -40 || sy > VH + 40) continue;
    const r = Math.max(1.2, (o.size || 0.035) * (0.7 + h2 * 0.6) * s);
    const spin = t * (1.5 + h3 * 3) + i;
    const c = o.colorAt ? o.colorAt(i, t) : cols[i % cols.length];
    ctx.fillStyle = css(c, z < 2.5 ? 0.5 : 0.95);
    ctx.beginPath();
    ell(ctx, sx, sy, r, r * (0.25 + 0.75 * Math.abs(Math.sin(spin))) * (o.round ? 1 : 0.6), spin * 0.7);
    ctx.fill();
  }
}

function drawFireflies(ctx, t, amount) {
  if (amount < 0.01) return;
  scr(ctx);
  ctx.globalCompositeOperation = 'lighter';
  const n = Math.floor(46 * amount);
  for (let i = 0; i < n; i++) {
    const h1 = hash(i * 9.1), h2 = hash(i * 3.7), h3 = hash(i * 5.9);
    const x = (h1 - 0.5) * 26 + Math.sin(t * 0.4 + i) * 0.8 + 0;
    const y = 0.25 + h2 * 1.6 + Math.sin(t * 0.7 + i * 2) * 0.25;
    const z = 6 + h3 * 16;
    const p = proj(CAM.x + x, y, CAM.z + z);
    const blink = Math.max(0, Math.sin(t * (1.2 + h2) + i * 1.7)) ** 3;
    const r = 3 + 14 * blink * (p.s / 60);
    ctx.fillStyle = radial(ctx, p.x, p.y, 0, r * 2.2, [[0, `rgba(255,236,150,${(0.85 * blink * amount).toFixed(3)})`], [0.3, `rgba(220,240,120,${(0.3 * blink * amount).toFixed(3)})`], [1, 'rgba(200,220,100,0)']]);
    ctx.beginPath(); circ(ctx, p.x, p.y, r * 2.2); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

// Мягкий свет поверх всего: лучи и воздушная дымка
function drawLightRays(ctx, amount, t) {
  if (amount < 0.01) return;
  scr(ctx);
  const E = ENV;
  const sx = E.sunX - CAM.x * 2, sy = CAM.hy - E.sunE * CAM.f / 900;
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 7; i++) {
    const a = -0.9 + i * 0.3 + Math.sin(t * 0.1 + i) * 0.03 + (sx > VW / 2 ? 0.25 : -0.25);
    const len = 1400, w = 0.05 + hash(i * 3.3) * 0.06;
    const g = ctx.createLinearGradient(sx, sy, sx + Math.sin(a) * len, sy + Math.cos(a) * len);
    g.addColorStop(0, css(E.glowC, 0.16 * amount));
    g.addColorStop(1, css(E.glowC, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + Math.sin(a - w) * len, sy + Math.cos(a - w) * len);
    ctx.lineTo(sx + Math.sin(a + w) * len, sy + Math.cos(a + w) * len);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

// Крупные ветки ели по краю кадра (рама переднего плана)
function drawForeBoughs(ctx, t, amount, color, snow) {
  if (amount < 0.01) return;
  scr(ctx);
  const E = ENV;
  const c = mixc(color || E.spruce, E.shadow, 0.55);
  for (let side = -1; side <= 1; side += 2) {
    const ox = side < 0 ? -40 + CAM.x * -8 : VW + 40 + CAM.x * -8;
    const sw = Math.sin(t * 0.8 + side) * 6 * (0.3 + gust(t, side));
    ctx.save();
    ctx.translate(ox, -30);
    ctx.rotate(side < 0 ? 0.35 : -0.35);
    for (let k = 0; k < 3; k++) {
      const len = (380 + k * 120) * amount, y = 40 + k * 70;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let j = 0; j <= 14; j++) {
        const u = j / 14, x = -side * len * u, yy = y + u * u * 90 + Math.sin(u * 3 + t) * 4 + sw * u;
        const tooth = (j % 2 ? 1 : -1) * (26 - u * 18);
        ctx.lineTo(x, yy + tooth + 30);
      }
      for (let j = 14; j >= 0; j--) {
        const u = j / 14, x = -side * len * u, yy = y + u * u * 90 + sw * u;
        ctx.lineTo(x, yy - 18 + u * 10);
      }
      ctx.closePath();
      ctx.fillStyle = css(c);
      ctx.fill();
      if (snow > 0.05) {
        ctx.beginPath();
        for (let j = 0; j <= 14; j++) {
          const u = j / 14, x = -side * len * u, yy = y + u * u * 90 + sw * u - 18 + u * 10;
          if (j === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy + (j % 3 === 0 ? 5 : 0));
        }
        ctx.lineWidth = 16 * snow;
        ctx.lineCap = 'round';
        ctx.strokeStyle = css(light(E.groundNear, 0.1), 0.95);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}
