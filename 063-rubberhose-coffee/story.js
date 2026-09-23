'use strict';
/* =====================================================================
   Кофейник Жорж · режиссура
   Монтажный лист (планы и движение камеры), эффекты, титры и сборка кадра.
   renderFilm(ctx, t, W, H) рисует кадр плёнки для момента t.
   ===================================================================== */

const DUR = 115;

/** Сцены для шкалы плеера. */
const SCENES = [
  { t: 0, name: 'Титры' },
  { t: 7, name: 'Кухня спит' },
  { t: 20, name: 'Будильник' },
  { t: 30, name: 'Кофе' },
  { t: 46, name: 'Пляс' },
  { t: 62, name: 'Кроха одна' },
  { t: 70, name: 'Прыжок' },
  { t: 86, name: 'Первая чашка' },
  { t: 94, name: 'Все вместе' },
  { t: 110, name: 'Конец' },
];

/* ---------- окружение ---------- */
function envAt(t) {
  const groove = Math.max(
    seg(t, 45.6, 46.3) * (1 - seg(t, 61.6, 62.2)),
    0.35 * seg(t, 62, 62.5) * (1 - seg(t, 69.6, 70.1)),
    seg(t, 93.6, 94.3) * (1 - seg(t, 106.2, 108)),
  );
  return {
    t,
    day: Ease.io(seg(t, 8, 20.5)),
    groove,
    sleep: t >= 7 && t < 21.1 ? 1 : 0,
    knob: t >= 30.36 ? 1.3 : 0,
  };
}

/* ---------- камера ---------- */
function cam(x, y, z) { return { x, y, z }; }
function camLerp(a, b, u) { return { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), z: lerp(a.z, b.z, u) }; }
function shake(c, t, t0, amp, dur = 0.5) {
  if (t < t0 || t > t0 + dur) return c;
  const k = (1 - (t - t0) / dur) * amp, f = Math.floor(t * 24);
  return { x: c.x + (hash2(f, 21) - 0.5) * k, y: c.y + (hash2(f, 22) - 0.5) * k, z: c.z };
}

/** Монтажный лист: план начинается в t и длится до следующего. */
const SHOTS = [
  { t: 0, set: 'title' },
  { t: 7, cam: (t) => cam(960 + (t - 7) * 3, 506, 1.06) },
  { t: 12, cam: (t) => camLerp(cam(975, 506, 1.06), cam(430, 404, 2.55), Ease.io3(seg(t, 12, 19.6))) },
  { t: 20, cam: (t) => cam(POS.alarm + 10 + (t - 20) * 4, 404, 4.4) },
  { t: 21.42, cam: (t) => shake(shake(cam(415, 368, 2.7), t, 21.72, 26), t, 22.5, 14, 0.3) },
  { t: 23.33, cam: (t) => shake(cam(566, 404, 1.95), t, 24.35, 16, 0.35) },
  { t: 25.08, cam: (t) => cam(420 + (t - 25) * 2, 398, 2.45) },
  { t: 30, cam: (t) => cam(436, 420, 2.15) },
  { t: 36, cam: (t) => { const u = Ease.io(seg(t, 36, 39)); return cam(lerp(520, 1340, u), lerp(360, 300, u), 1.55); } },
  { t: 39, cam: (t) => cam(1672, 360, 2.6) },
  { t: 41, cam: (t) => cam(1712, 238, 3.5) },
  { t: 43, cam: (t) => cam(1010, 486, 1.12) },
  { t: 46, cam: (t) => cam(1110, 548, 1.9) },
  { t: 50, cam: (t) => cam(1010, 552, 2.05) },
  { t: 54, cam: (t) => cam(930, 500, 2.3) },
  { t: 58, cam: (t) => cam(1220, 540, 2.2) },
  { t: 59, cam: (t) => cam(910, 500, 2.3) },
  { t: 60, cam: (t) => cam(1090, 540, 1.75) },
  { t: 61, cam: (t) => cam(1220, 540, 2.2) },
  { t: 62, cam: (t) => {
    const walk = Ease.io(seg(t, 62.8, 64.4));
    const tilt = Ease.io(seg(t, 65.0, 65.9)) * (1 - Ease.io(seg(t, 66.2, 67.0)));
    const c = cam(lerp(1690, 1566, walk), 238, lerp(4.2, 4.6, walk));
    const push = Ease.io(seg(t, 67.4, 70));
    return camLerp(camLerp(c, cam(1420, 560, 2.2), tilt), cam(1570, 246, 5.2), push * (1 - tilt));
  } },
  { t: 70, cam: (t) => cam(930, 500, 2.3) },
  { t: 72, cam: (t) => cam(1572, 244, 4.6) },
  { t: 74, cam: (t) => cam(lerp(1568, 1558, seg(t, 74, 77)), 248, lerp(4.6, 5.6, Ease.io(seg(t, 74, 77)))) },
  { t: 77, cam: (t) => { const f = Ease.io(seg(t, 79.35, 79.6)); return cam(1400, lerp(410, 560, f), 1.6); } },
  { t: 79.6, cam: (t) => shake(cam(POS.jCatch + 6, 494, 3.4), t, 79.6, 10, 0.3) },
  { t: 79.92, cam: (t) => shake(cam(1180, 590, 1.32), t, 80.55, 18, 0.4) },
  { t: 81.5, cam: (t) => cam(POS.catchP[0] + 4, POS.catchP[1] - 50, 3.6) },
  { t: 83.5, cam: (t) => { const u = Ease.io(seg(t, 83.5, 85.4)); return cam(lerp(1360, 1180, u), lerp(620, 520, u), 1.75); } },
  { t: 86, cam: (t) => camLerp(cam(1030, 520, 2.4), cam(1052, 548, 3.1), Ease.io(seg(t, 86.8, 88.6))) },
  { t: 92, cam: (t) => camLerp(cam(1040, 530, 2.5), cam(1060, 530, 1.75), Ease.io(seg(t, 92.9, 93.8))) },
  { t: 94, cam: (t) => cam(1100, 540, 1.75) },
  { t: 98, cam: (t) => cam(1130, 500, 2.2) },
  { t: 102, cam: (t) => cam(1120, 520, 1.7) },
  { t: 106, cam: (t) => camLerp(cam(1120, 520, 1.7), cam(1150, 470, 2.4), Ease.io(seg(t, 106, 108.4))) },
  { t: 110, set: 'end' },
];
function shotAt(t) {
  let s = SHOTS[0];
  for (const x of SHOTS) if (t >= x.t) s = x;
  return s;
}

/* ---------- эффекты ---------- */
const WHISTLE = [];   // моменты нот свиста — общие для пара и для музыки (заполняет score.js)

function steamFX(ctx, t) {
  // выдохи спящего Жоржа
  if (t >= 7 && t < 21.4) {
    for (let k = 0; k < 8; k++) {
      const ts = 8 + k * 2;
      const age = t - ts;
      if (age < 0 || age > 1.6) continue;
      const P = jorzh(ts);
      const tip = jPoint(P, J.tip[0], J.tip[1]);
      puff(ctx, tip[0] + age * 26, tip[1] - age * 60, 8 + age * 14, 1 - age / 1.6, k + 3);
    }
  }
  // «горячо!» и перколятор
  const spawns = [];
  if (t >= 31.0 && t < 32.5) spawns.push([31.0, 20, 1]);
  for (let b = 31.5; b < 43.3; b += 0.5) spawns.push([b, 7, 0]);
  for (const w of WHISTLE) if (w >= 33 && w < 39) spawns.push([w, 9, 0]);
  for (const [ts, sz, big] of spawns) {
    const age = t - ts;
    if (age < 0 || age > 1.2) continue;
    const P = jorzh(ts);
    const tip = jPoint(P, J.tip[0], J.tip[1]);
    const n = big ? 3 : 1;
    for (let j = 0; j < n; j++) puff(ctx, tip[0] + age * (30 + j * 20), tip[1] - age * (50 + j * 16) - j * 12, sz + age * 16, 1 - age / 1.2, Math.round(ts * 10) + j);
  }
  // свист финала: струя пара из носика
  if (t >= 109.4 && t < 110) {
    const P = jorzh(t);
    const tip = jPoint(P, J.tip[0], J.tip[1]);
    for (let j = 0; j < 4; j++) puff(ctx, tip[0] + 14 + j * 16, tip[1] - 10 - j * 16, 10 + j * 5, 1, j + 50);
  }
}

function notesFX(ctx, t) {
  for (const w of WHISTLE) {
    if (w < 33 || w >= 39) continue;
    const age = t - w;
    if (age < 0 || age > 1.3) continue;
    const P = jorzh(w);
    const m = jPoint(P, -8, -52);
    const k = Math.round(w * 8);
    noteGlyph(ctx, m[0] - age * 50 - 10, m[1] - age * 70 + Math.sin(age * 8 + k) * 6, 1.3, 1 - age / 1.3, Math.sin(k) * 0.3);
  }
}

/** Аромат кофе: волнистая лента от носика через всю кухню к чашкам. */
const AROMA_PATH = [[520, 350], [548, 272], [614, 214], [724, 186], [900, 168], [1110, 172], [1310, 214], [1470, 286], [1582, 340], [1680, 352]];
function aromaFX(ctx, t) {
  if (t < 34 || t > 41.6) return;
  const P = catmull(AROMA_PATH, 10);
  const n = P.length - 1;
  const head = Ease.io(seg(t, 34, 39.2)) * n;
  const tailLen = 34;
  const fade = 1 - seg(t, 40.6, 41.6);
  for (let strand = 0; strand < 2; strand++) {
    const pts = [];
    for (let i = Math.max(0, Math.floor(head - tailLen)); i <= head; i++) {
      const a = P[i], b = P[Math.min(n, i + 1)];
      const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1;
      const w = Math.sin(i * 0.5 - t * 5 + strand * 2.2) * (10 + strand * 4);
      pts.push([a[0] - dy / d * w, a[1] + dx / d * w + strand * 12]);
    }
    if (pts.length < 2) continue;
    ctx.save(); ctx.globalAlpha = 0.85 * fade;
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts) ctx.lineTo(p[0], p[1]);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = 7 * LWF + 3; ctx.strokeStyle = 'rgba(70,64,56,0.5)'; ctx.stroke();
    ctx.lineWidth = 5 * LWF + 1; ctx.strokeStyle = PAPER; ctx.stroke();
    ctx.restore();
  }
  // «рука» из аромата манит пальцем
  if (head > n - 2) {
    const hp = P[n];
    const u = seg(t, 39.2, 40.6);
    ctx.save(); ctx.globalAlpha = fade;
    ctx.translate(hp[0], hp[1]); ctx.rotate(-0.4 + Math.sin(t * TAU * 2) * 0.15);
    ctx.lineCap = 'round'; ctx.strokeStyle = PAPER; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(20, -14 - 10 * Math.sin(t * TAU * 2.2), 30 + 6 * u, -4);
    ctx.stroke();
    ctx.restore();
  }
}

function flameFX(ctx, t) {
  if (t < 30.45 || t > 43.6) return;
  const on = Ease.back(seg(t, 30.45, 30.6)) * (1 - seg(t, 43.35, 43.6));
  const f = Math.floor(t * 24);
  const cx = POS.stove, cy = 491;
  for (let i = 0; i < 9; i++) {
    const an = Math.PI * (0.1 + 0.8 * i / 8);
    const x = cx + Math.cos(an) * 46, y = cy + Math.sin(an) * 7;
    const h = (16 + hash2(f, i) * 16) * on;
    ctx.beginPath();
    ctx.moveTo(x - 7, y); ctx.quadraticCurveTo(x - 8, y - h * 0.6, x + (hash2(f, i + 9) - 0.5) * 6, y - h);
    ctx.quadraticCurveTo(x + 8, y - h * 0.6, x + 7, y); ctx.closePath();
    paint(ctx, PAPER, 2.2 * LWF, INK);
    ctx.beginPath(); ctx.moveTo(x - 3, y); ctx.quadraticCurveTo(x, y - h * 0.5, x + 3, y); ctx.closePath(); ctx.fillStyle = T[3]; ctx.fill();
  }
}

function pourFX(ctx, t) {
  if (t < 87.4 || t > 89.9) return;
  const P = jorzh(t);
  const tip = jPoint(P, J.tip[0], J.tip[1]);
  const K0 = kroha(t);
  const rim = rigMap(K0, KRO.H)(0, KRO.rimY);
  const grow = seg(t, 87.4, 87.6), end = seg(t, 89.6, 89.9);
  const ax = tip[0] + 4, ay = tip[1] + 2;
  const bx = rim[0], by = rim[1];
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const u = lerp(end, grow, i / 12);
    const x = lerp(ax, bx, u), y = lerp(ay, by, u) - Math.sin(Math.PI * u) * 22 + u * u * 10;
    pts.push([x + Math.sin(t * 30 + i) * 0.8, y]);
  }
  taper(ctx, pts, 7 * LWF + 3, 4 * LWF + 1.5, T[8]);
  if (grow >= 1 && end < 1) {
    ctx.fillStyle = T[8];
    for (let i = 0; i < 3; i++) {
      const a = frac(t * 3 + i / 3);
      ctx.beginPath(); circ(ctx, bx + (i - 1) * 12 * a, by - 8 * Math.sin(Math.PI * a), 2.2); ctx.fill();
    }
  }
}

function heartFX(ctx, t) {
  if (t < 89.9 || t > 91.9) return;
  const K0 = kroha(t);
  const rim = rigMap(K0, KRO.H)(0, KRO.rimY);
  const u = seg(t, 89.9, 91.9);
  const s = 10 + 16 * Ease.out(u), y = rim[1] - 26 - 60 * u;
  ctx.save(); ctx.globalAlpha = 1 - seg(t, 91.3, 91.9);
  // два завитка пара сходятся в сердце
  ctx.lineCap = 'round'; ctx.lineWidth = 4 * LWF + 1; ctx.strokeStyle = PAPER;
  for (const sd of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(rim[0] + sd * 8, rim[1] - 4);
    ctx.bezierCurveTo(rim[0] + sd * 22, rim[1] - 20, rim[0] - sd * 14, y + s, rim[0], y + s * 0.9);
    ctx.stroke();
  }
  ctx.beginPath(); heartPath(ctx, rim[0], y, s); ctx.lineWidth = 3.4 * LWF + 2; ctx.strokeStyle = T[6]; ctx.stroke();
  ctx.beginPath(); heartPath(ctx, rim[0], y, s); ctx.fillStyle = PAPER; ctx.fill();
  ctx.restore();
}

function kissFX(ctx, t) {
  if (t < 109 || t > 110) return;
  const K0 = kroha(t);
  for (let i = 0; i < 4; i++) {
    const a = seg(t, 109 + i * 0.08, 109.8 + i * 0.08);
    if (a <= 0 || a >= 1) continue;
    const x = K0.x - 30 + Math.sin(i * 2.1) * 30 * a, y = K0.y - 80 - 70 * a - i * 8;
    ctx.save(); ctx.globalAlpha = 1 - a;
    ctx.beginPath(); heartPath(ctx, x, y, 7 + i); paint(ctx, PAPER, 2.4 * LWF);
    ctx.restore();
  }
}

function dizzyFX(ctx, t) {
  if (t < 22.5 || t > 23.3) return;
  const P = jorzh(t);
  const c = jPoint(P, 0, -170);
  const a = 1 - seg(t, 23.0, 23.3);
  for (let i = 0; i < 3; i++) {
    const an = (t - 22.5) * 9 + i * TAU / 3;
    starGlyph(ctx, c[0] + Math.cos(an) * 58, c[1] - 26 + Math.sin(an) * 12, 10, an, a);
  }
}

function takeFX(ctx, t) {
  for (const [t0, t1, who] of [[21.72, 22.05, 'j'], [79.35, 79.9, 'j'], [72.1, 72.4, 'k'], [79.0, 79.3, 'k']]) {
    if (t < t0 || t > t1) continue;
    let c, r;
    if (who === 'j') { const P = jorzh(t); c = jPoint(P, 0, -96); r = 110; }
    else { const K0 = kroha(t); c = rigMap(K0, KRO.H)(0, -34); r = 52; }
    takeLines(ctx, c[0], c[1], r, r * 1.5, 1 - seg(t, t0, t1) * 0.6, 12, Math.floor(t * 12));
  }
  // линии скорости: падение Крохи и выстрел руки
  if (t > 79.4 && t < 80.55) {
    const K0 = kroha(t);
    speedLines(ctx, K0.x, K0.y - 60, 0, 1, 90, 40, 0.8, 4, Math.floor(t * 12));
  }
  // капли пота
  if (t > 74.2 && t < 75.4) {
    const K0 = kroha(t);
    for (let i = 0; i < 2; i++) {
      const a = frac((t - 74.2) * 1.4 + i * 0.5);
      const sd = i ? 1 : -1;
      ctx.save(); ctx.globalAlpha = 1 - a;
      const x = K0.x + sd * (24 + a * 20), y = K0.y - 58 - Math.sin(Math.PI * a) * 16 + a * 10;
      ctx.beginPath(); ctx.moveTo(x, y - 7); ctx.quadraticCurveTo(x + 5, y, x, y + 3); ctx.quadraticCurveTo(x - 5, y, x, y - 7); paint(ctx, PAPER, 1.8 * LWF);
      ctx.restore();
    }
  }
}

/* ---------- сборка кадра ---------- */
function setCam(ctx, W, H, c, wx, wy) {
  const k = (W / 1920) * c.z;
  ctx.setTransform(k, 0, 0, k, W / 2 - c.x * k + wx, H / 2 - c.y * k + wy);
  LWF = 1 / Math.sqrt(c.z);
  return { x0: c.x - 960 / c.z, x1: c.x + 960 / c.z, y0: c.y - 540 / c.z, y1: c.y + 540 / c.z };
}

function linkArms(cups) {
  // сцепленные руки в канкане: каждая держит соседку за плечо
  for (let i = 0; i < cups.length; i++) {
    const C = cups[i];
    if (!C.linked) continue;
    const L = cups[i - 1], R = cups[i + 1];
    if (L && L.linked) { const p = cupShoulder(L, 1); Object.assign(C.arms[0], { world: true, x: p[0] + 4, y: p[1] + 6, pose: 'open', ang: 0.3 }); }
    else Object.assign(C.arms[0], { world: false, x: -30, y: -44, pose: 'jazz', ang: null });
    if (R && R.linked) { const p = cupShoulder(R, 0); Object.assign(C.arms[1], { world: true, x: p[0] - 4, y: p[1] + 6, pose: 'open', ang: Math.PI - 0.3 }); }
    else Object.assign(C.arms[1], { world: false, x: 30, y: -44, pose: 'jazz', ang: null });
  }
}

function renderKitchen(ctx, t, W, H, wx, wy, c) {
  const env = envAt(t);
  const view = setCam(ctx, W, H, c, wx, wy);
  drawKitchen(ctx, env, view);
  drawAlarm(ctx, alarmPose(t, env), t);
  aromaFX(ctx, t);
  flameFX(ctx, t);
  const Jp = jorzh(t);
  const kp = kroha(t);
  const cups = [0, 1, 2, 3].map((i) => cupPose(i, t));
  // Кроха встаёт в линию канкана между второй и третьей чашкой
  const lineup = kp.linked ? [cups[0], cups[1], kp, cups[2], cups[3]] : cups;
  linkArms(lineup);
  if (kp.behind) drawCup(ctx, kp, t);
  for (const C of cups) drawCup(ctx, C, t);
  drawJorzh(ctx, Jp, t);
  if (!kp.behind) drawCup(ctx, kp, t);
  drawSugarJar(ctx, env);
  if (Jp.armsLate) drawJorzh(ctx, Jp, t, 'arms');
  steamFX(ctx, t);
  notesFX(ctx, t);
  pourFX(ctx, t);
  heartFX(ctx, t);
  kissFX(ctx, t);
  dizzyFX(ctx, t);
  takeFX(ctx, t);
  // одна наверху: мир вокруг Крохи темнеет, остаётся пятно света — пока Жорж её не позовёт
  const lone = seg(t, 67.6, 68.8) * (1 - seg(t, 72.1, 72.6));
  if (lone > 0.01) {
    const p = rigMap(kp, KRO.H)(0, -30);
    // радиус — в единицах мира: при крупном плане (зум ~5) в кадр помещается ~190 единиц от центра
    const g = ctx.createRadialGradient(p[0], p[1], 34, p[0], p[1], 150);
    g.addColorStop(0, 'rgba(16,13,10,0)'); g.addColorStop(0.55, `rgba(16,13,10,${(0.3 * lone).toFixed(3)})`);
    g.addColorStop(1, `rgba(16,13,10,${(0.58 * lone).toFixed(3)})`);
    ctx.fillStyle = g; ctx.fillRect(view.x0 - 50, view.y0 - 50, view.x1 - view.x0 + 100, view.y1 - view.y0 + 100);
  }
  // ночь: кухня темнее, пока не встало солнце
  if (env.day < 1) {
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = `rgba(16,13,10,${(0.46 * (1 - env.day)).toFixed(3)})`; ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}

function renderTitle(ctx, t, W, H, wx, wy) {
  setCam(ctx, W, H, cam(960, 540, 1), wx, wy);
  sunburst(ctx, t, 960, 1260, 32, '#8c867a', '#a39d90');
  decoFrame(ctx, 300, 120, 1320, 700, 3);
  ctx.save(); ctx.globalAlpha = seg(t, 0.7, 1.3);
  smallCaps(ctx, 'Мультфабрика «Пружинка» представляет', 960, 212, 34, PAPER);
  ctx.restore();
  fancyText(ctx, 'Кофейник', 960, 390, 118, {
    offset: (i) => { const t0 = 1.0 + i * 0.05; const u = seg(t, t0, t0 + 0.35); return { dx: 0, dy: -500 * (1 - Ease.back(u)), sy: 1 + wob(t, t0 + 0.35, 0.15, 4, 8), a: u > 0 ? 1 : 0 }; },
  });
  fancyText(ctx, 'ЖОРЖ', 960, 640, 250, {
    inline: true,
    offset: (i) => {
      const t0 = 1.5 + i * 0.5;
      const u = seg(t, t0 - 0.28, t0);
      const land = t >= t0 ? -0.28 * Math.exp(-(t - t0) * 9) * Math.cos((t - t0) * 20) : 0;
      const dance = t > 3.5 ? Math.sin(Math.PI * beatU(t, i * 0.125)) ** 2 * 14 : 0;
      return { dx: 0, dy: -700 * (1 - Ease.in(u)) - dance, sy: 1 + land, a: u > 0 ? 1 : 0 };
    },
  });
  ctx.save(); ctx.globalAlpha = seg(t, 3.2, 3.8);
  line(ctx, 700, 716, 830, 716, 3, PAPER); line(ctx, 1090, 716, 1220, 716, 3, PAPER);
  smallCaps(ctx, 'звуковой мультфильм', 960, 716, 30, T[1]);
  ctx.restore();
  // Жорж выглядывает из-за рамки и приподнимает крышку-котелок
  if (t > 3.3 && t < 6.6) {
    const rise = Ease.back(seg(t, 3.4, 3.85)) * (1 - Ease.antic(seg(t, 6.0, 6.5)));
    const P = makeJ(1560, 1180 - 330 * rise);
    P.s = 1.55; P.shadow = false;
    P.mouth = { type: 'grin', open: 0.6 };
    P.eye.lx = -0.5; P.eye.ly = 0.1;
    P.sq = wob(t, 3.85, 0.12, 3, 5);
    const tip = seg(t, 4.3, 4.5) * (1 - seg(t, 5.2, 5.45));
    P.lid.pivot = -44; P.lid.rot = -0.45 * Ease.back(tip); P.lid.dy = -26 * tip;
    setArm(P.arms[1], 12, -76 - 20 * tip, tip > 0.05 ? 'pinch' : 'open');
    setArm(P.arms[0], -60, -30, 'wave', { ang: -2.4 + Math.sin(t * 12) * 0.3 });
    P.eye.wL = t > 4.5 && t < 4.95 ? 1 : 0;
    drawJorzh(ctx, P, t);
  }
  const fin = seg(t, 0.15, 0.7), fout = seg(t, 6.55, 7.0);
  const a = Math.max(1 - fin, fout);
  if (a > 0) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = `rgba(14,12,10,${a.toFixed(3)})`; ctx.fillRect(0, 0, W, H); ctx.restore(); }
}

function renderEnd(ctx, t, W, H, wx, wy) {
  setCam(ctx, W, H, cam(960, 540, 1), wx, wy);
  sunburst(ctx, t, 960, 1260, 32, '#8c867a', '#a39d90');
  decoFrame(ctx, 380, 190, 1160, 600, 3);
  smallCaps(ctx, 'Кофейник Жорж', 960, 300, 38, PAPER, 0.24);
  fancyText(ctx, 'Конец', 960, 560, 210, {
    inline: true,
    offset: (i) => { const t0 = 110.2 + i * 0.07; const u = seg(t, t0, t0 + 0.3); return { dx: 0, dy: 60 * (1 - Ease.back(u)), sy: 1, a: u }; },
  });
  ctx.save(); ctx.globalAlpha = seg(t, 111, 111.8);
  smallCaps(ctx, 'нарисовано и сыграно кодом', 960, 680, 28, T[1]);
  ctx.restore();
  const fin = 1 - seg(t, 110.0, 110.35), fout = seg(t, 114.2, 115);
  const a = Math.max(fin, fout * 0.7);
  if (a > 0) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = `rgba(14,12,10,${a.toFixed(3)})`; ctx.fillRect(0, 0, W, H); ctx.restore(); }
}

/** Главный вход: кадр плёнки в момент t. */
function renderFilm(ctx, t, W, H) {
  const tf = Math.min(DUR - 1 / FPS, Math.floor(t * FPS + 1e-6) / FPS);
  const frame = Math.round(tf * FPS);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#0e0c0a'; ctx.fillRect(0, 0, W, H);
  const [wx, wy] = Film.weave(frame, H);
  const sh = shotAt(tf);
  if (sh.set === 'title') renderTitle(ctx, tf, W, H, wx, wy);
  else if (sh.set === 'end') renderEnd(ctx, tf, W, H, wx, wy);
  else {
    const c = sh.cam(tf);
    renderKitchen(ctx, tf, W, H, wx, wy, c);
    // диафрагма: открывается в начале кухни, сходится в круг в финале
    if (tf < 8.2) {
      const u = Ease.io3(seg(tf, 7.0, 8.2));
      iris(ctx, W, H, W * 0.5, H * 0.52, u * Math.hypot(W, H) * 0.56);
    } else if (tf >= 106) {
      const k = (W / 1920) * c.z;
      const cx = (1136 - c.x) * k + W / 2 + wx, cy = (452 - c.y) * k + H / 2 + wy;
      const r = K(tf, [[106, Math.hypot(W, H) * 0.62], [108.4, H * 0.3, 'io3'], [109.45, H * 0.28], [109.72, 0, 'in']]);
      iris(ctx, W, H, cx, cy, r);
    }
  }
  Film.apply(ctx, W, H, frame, tf);
}
