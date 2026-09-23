'use strict';
/* ==========================================================================
   Кот-фонарщик · film.js
   Режиссура: шот-лист, камера и игра персонажей. Кадр — чистая функция от
   времени фильма T, поэтому работает перемотка в любую точку.
   ========================================================================== */

const DURATION = 118;
const SCENES = [
  { t: 0, name: 'Сумерки' },
  { t: 30, name: 'Последний фонарь' },
  { t: 50, name: 'Лунная дорожка' },
  { t: 68, name: 'Луна' },
  { t: 81, name: 'Домой' },
];

/* ---------- титр: буквы на нитках ---------- */
const TITLE_L = [];
function layoutTitle() {
  const c = mkCanvas(4, 4).getContext('2d');
  c.font = `118px ${FONT_TITLE}`;
  const ms = [...TITLE].map((ch) => { const m = c.measureText(ch); return { w: m.width, asc: m.actualBoundingBoxAscent || 84 }; });
  const gap = 6, total = ms.reduce((s, m) => s + m.w + gap, -gap);
  let x = 800 - total / 2;
  TITLE_L.length = 0;
  ms.forEach((m, i) => {
    TITLE_L.push({ x: x + m.w / 2, top: 40 - m.asc, hang: 205 + 34 * Math.sin(i * 1.9 + 0.4) + (i % 3) * 10 });
    x += m.w + gap;
  });
}
function titleScreen(S, T, dy) {
  for (let i = 0; i < TITLE_L.length; i++) {
    const L = TITLE_L[i], py = L.hang + dy;
    if (py < -140) continue;
    const ang = 0.055 * Math.sin(T * 1.25 + i * 0.85) + 0.02 * Math.sin(T * 2.9 + i * 2.1);
    S.lines.push([L.x + Math.sin(ang) * -2, -20, L.x, py, 0.55]);
    S.screen.push({ s: 'title.' + i, m: mMul(mTRS(L.x, py, ang), mTRS(0, -L.top + 2)), a: 1 });
  }
}

/* ---------- кадр города: статика, окна, фонари, море, облака, звёзды ---------- */
function townScene(T, cam) {
  const S = { cam, items: [], lights: [], glows: [], sky: { night: 0, stars: [] }, screen: [], lines: [], post: {} };
  const n = STORY.night(T);
  S.sky.night = n;
  for (const it of WORLD.statics) S.items.push(it);
  // окна загораются по одному; объекты кадра создаются один раз и переиспользуются
  for (const w of WORLD.wins) {
    if (T < w.at) continue;
    const a = sat((T - w.at) / 0.18) * (0.88 + 0.12 * Math.sin(T * 2.3 + w.x * 0.01));
    const it = w.it || (w.it = IT(w.s, w.x, w.y, w.d, { k: w.k, z: w.z ?? 0.5 }));
    it.a = a; S.items.push(it);
    if (w.d === 0) S.lights.push({ x: w.x + 15, y: w.y + 22, d: 0, r: 64, k: 0.55 * a, warm: 0.12 });
  }
  for (const w of WORLD.farWins) if (T >= w.at) { const it = w.it || (w.it = IT(w.s, w.x, w.y, w.d, { k: w.k, z: 9 })); it.a = sat((T - w.at) / 0.3); S.items.push(it); }
  for (const L of WORLD.lamps) lampItems(L, T, S);
  // море: полосы-плитки на своих глубинах. Идём от ближней к дальней: всё ниже впадин
  // ближней полосы уже закрыто, поэтому дальнюю рисуем только до этой линии (it.ch) —
  // иначе каждая полоса тянулась бы до низа кадра и море перерисовывалось бы раз пять.
  const ds = WORLD.seaDepths, zm = cam.zoom || 1;
  const oy = FRAME_H / 2 + (cam.sy || 0) + (cam.shy || 0), ox = FRAME_W / 2 + (cam.sx || 0) + (cam.shx || 0);
  let cover = Infinity;   // экранная y, ниже которой море закрыто ближними полосами
  for (let i = 0; i < ds.length; i++) {
    const d = ds[i], f = 1 + d, zz = cam.dist + d;
    if (zz <= 0.05) continue;
    const syk = f / (1 + 0.2 * d), TW = SEA_W * f;
    const half = (800 + Math.abs(cam.sx || 0)) * zz / zm + TW;
    const drift = Math.sin(T * 0.23 + i * 1.3) * 26 * f + T * (i % 2 ? 7 : -7) * f * 0.35;
    const bob = Math.sin(T * 1.05 + i * 1.7) * 3.2 * syk;
    const org = d < 0.6 ? 3270 + Math.sin(T * 0.4 + i) * 12 : drift;
    const n0 = Math.floor((cam.x - half - org) / TW), n1 = Math.ceil((cam.x + half - org) / TW);
    const yTop = oy + (Y_SEA + bob - cam.y) * zm / zz, sv = syk * zm / zz;   // линия воды на экране и масштаб по вертикали
    const ch = cover < Infinity ? (cover - yTop) / sv + 4 : undefined;
    for (let k = n0; k <= n1; k++) {
      if (d < 0.6 && k < 0) continue;
      S.items.push({ s: 'sea.' + i, m: mTRS(org + k * TW, Y_SEA + bob, 0, f, syk), d, z: -5, ch });
    }
    // полосы у пристани начинаются от набережной: закрывают море, только если тянутся через весь кадр
    const leftX = d < 0.6 ? ox + (org + Math.max(n0, 0) * TW - cam.x) * zm / zz : -Infinity;
    if (leftX <= 0) cover = Math.min(cover, yTop + 6 * sv);
  }
  // облака
  for (const c of WORLD.clouds) S.items.push(IT(c.s, c.x + T * c.drift * (1 + c.d), c.y, c.d, { k: 1 + c.d, z: 0 }));
  // звёзды проступают вместе с ночью
  for (const s of WORLD.stars) {
    const a = sat((T - s.at) / 2.5) * sat((n - 0.2) * 2) * (0.65 + 0.35 * Math.sin(T * s.sp + s.ph));
    if (a > 0.01) S.sky.stars.push({ x: s.x, y: s.y, d: s.d, s: s.s, k: s.k * (0.9 + 0.1 * Math.sin(T * s.sp * 1.3 + s.ph)), a });
  }
  S.dark = { k: 0.64 * n, top: [16, 18, 48], bot: [30, 26, 60], kt: 1, kb: 0.92 };
  return S;
}

/* ---------- кот по плану: шаг, прыжок, зажечь фонарь ---------- */
const CARRY = [15, -57], CARRY_W = 0.14, STRIDE = 76;
function buildPlan(segs) {
  let dist = 0;
  for (const s of segs) { s.dist0 = dist; if (s.k === 'walk') dist += Math.abs(s.x1 - s.x0); }
  return segs;
}
function planSeg(plan, T) {
  let s = plan[0];
  for (const q of plan) if (T >= q.t0) s = q;
  return s;
}
function catFromPlan(plan, T) {
  const s = planSeg(plan, T), P = catBase(), dur = s.t1 - s.t0, lt = T - s.t0;
  P.face = s.face ?? 1; P.reachL = CARRY.slice(); P.poleW = CARRY_W;
  const blink = blinkAt(T, 3);
  P.spr = { eye: blink ? 'cat.eye.closed' : 'cat.eye.open' };
  if (s.k === 'walk') {
    const u = sat(lt / dur), e = lerp(u, EASE.io(u), 0.35);
    const x = lerp(s.x0, s.x1, e), amp = Math.min(1, lt / 0.18, (dur - lt) / 0.18);
    P.x = x; P.ground = s.g;
    Object.assign(P, catWalk((s.dist0 + Math.abs(x - s.x0)) / STRIDE, { A: 0.5 * Math.max(0.05, amp) }));
    P.reachL = [CARRY[0], CARRY[1] + Math.sin(TAU * (s.dist0 + Math.abs(x - s.x0)) / STRIDE * 2) * 1.5];
    for (const tp of s.taps || []) {
      const k = Math.max(0, 1 - Math.abs(T - tp.t) / 0.32);
      if (k > 0) { P.tip = tp.tip; P.tipK = EASE.io(k); P.carry = P.reachL; P.carryW = CARRY_W; P.poleW = undefined; }
    }
  } else if (s.k === 'reach') {
    P.x = s.x; P.ground = s.g;
    const up = key(lt, [[0, 0], [0.14, -0.1, 'io'], [0.5, 1, 'out3'], [dur - 0.34, 1], [dur, 0, 'io']]);
    P.tip = s.tip; P.tipK = up; P.carry = CARRY; P.carryW = CARRY_W; P.poleW = undefined;
    P.torso = 0.06 + 0.12 * Math.max(0, up); P.head = -0.1 - 0.12 * Math.max(0, up) * (s.tip[1] < s.g - 120 ? 1 : -0.6);
    P.sy = 1 - 0.05 * Math.max(0, -up * 5) + 0.02 * Math.max(0, up);
    const after = T - s.tPop;
    if (after > 0 && after < 0.7) { P.spr.eye = 'cat.eye.happy'; P.head += 0.08 * Math.sin(after * 9) * Math.exp(-after * 3); P.spr.mouth = 'cat.mouth.smile'; }
    P.armF1 = -0.25 * Math.max(0, up); P.armF2 = -0.5;
    P.tail0 = 1.7 + 0.25 * Math.max(0, up);
    P.legN1 = -0.12; P.legF1 = 0.14; P.legN2 = 0.1; P.legF2 = 0.1; P.footN = 0.02; P.footF = -0.24;
  } else if (s.k === 'jump') {
    const a = 0.3 * dur, f = 0.45 * dur;
    if (lt < a) {
      const k = EASE.io(lt / a);
      P.x = s.x0; P.ground = s.g0;
      P.sy = 1 - 0.12 * k; P.sx = 1 + 0.06 * k; P.torso = 0.06 + 0.35 * k; P.head = -0.25 * k;
      P.legN1 = -0.6 * k; P.legN2 = 1.2 * k; P.footN = -0.6 * k; P.legF1 = -0.4 * k; P.legF2 = 1.1 * k; P.footF = -0.7 * k;
      P.armF1 = 0.6 * k; P.tail0 = 1.85 - 0.3 * k;
    } else if (lt < a + f) {
      const v = (lt - a) / f, x = lerp(s.x0, s.x1, v);
      P.x = x; P.y = lerp(s.g0, s.g1, v) - 50 - s.h * 4 * v * (1 - v);
      const st = Math.sin(Math.PI * v);
      P.sy = 1 + 0.1 * (1 - v) - 0.02; P.sx = 1 - 0.05 * (1 - v);
      P.torso = 0.25 - 0.2 * v; P.head = -0.1 + 0.15 * v;
      P.legN1 = -0.9 * st + 0.3 * (1 - st); P.legN2 = 1.4 * st; P.footN = 0.3; P.legF1 = 0.5 - 0.9 * st; P.legF2 = 1.1 * st + 0.2; P.footF = 0.4;
      P.armF1 = -1.2 * st; P.armF2 = -0.6;
      P.tail0 = 1.35; P.tail1 = 0.1; P.tail2 = 0.08; P.tail3 = 0.05; P.tail4 = 0.02;
      P.scarfT1 = 1.2; P.scarfT2 = 0.3;
      P.spr.eye = 'cat.eye.wide';
    } else {
      const k = (lt - a - f) / (dur - a - f), sq = Math.sin(Math.PI * Math.min(1, k * 1.4)) * (1 - k * 0.5);
      P.x = s.x1; P.ground = s.g1;
      P.sy = 1 - 0.14 * sq; P.sx = 1 + 0.08 * sq; P.torso = 0.06 + 0.3 * sq; P.head = -0.2 * sq + wobbleOut(lt, a + f, 0.06, 14, 6);
      P.legN1 = -0.5 * sq; P.legN2 = 1.1 * sq; P.footN = -0.6 * sq; P.legF1 = -0.3 * sq; P.legF2 = 1.0 * sq; P.footF = -0.7 * sq;
      P.tail0 = 1.85 + wobbleOut(lt, a + f, 0.35, 10, 4);
      P.scarfT1 = 0.55 + wobbleOut(lt, a + f, 0.6, 9, 4);
    }
  } else {
    P.x = s.x; P.ground = s.g;
    P.torso = 0.06 + 0.015 * Math.sin(T * 2.2);
    for (let i = 0; i < 5; i++) P['tail' + i] += 0.08 * Math.sin(T * 1.6 - i * 0.6);
  }
  P.x0 = P.x;
  return P;
}
/* огонь на шесте, мотылёк рядом */
function flameOn(S, P, T, kind = 'fire', k = 1) {
  if (!P._tip || kind === 'none') return;
  const [x, y] = P._tip, d = P.d, fi = Math.floor(T * 12) % 3, fl = 0.92 + 0.08 * noise1(T * 10, 7);
  S.items.push(IT((kind === 'moon' ? 'mflame.' : 'flame.') + fi, x, y + 2, d, { k: 0.95 * k * fl * (P.scale || 1), z: 200, r: (P.lean || 0) * 0.3 }));
  S.lights.push({ x, y: y - 10, d, r: 170 * k, k: 0.9 * k, warm: 0.22 * k, wc: kind === 'moon' ? [200, 215, 255] : undefined });
  S.glows.push({ x, y: y - 9, d, r: 34 * k, a: 0.6 * fl * k, c: kind === 'moon' ? [225, 235, 255] : [255, 208, 130] });
  S.glows.push({ x, y: y - 9, d, r: 120 * k, a: 0.14 * k, c: kind === 'moon' ? [190, 205, 255] : [255, 170, 80] });
}
function mothAt(S, x, y, d, T, k = 1) {
  const fl = Math.abs(Math.sin(T * 34)), z = 210;
  S.items.push({ s: 'moth.wing', m: mMul(mTRS(x, y, -0.3 + 0.2 * Math.sin(T * 5), k, k), mTRS(0, 0, 0, 1, -0.3 - 0.7 * fl)), d, z: z - 0.1 });
  S.items.push({ s: 'moth.body', m: mTRS(x, y, 0.4, k, k), d, z });
  S.items.push({ s: 'moth.wing', m: mMul(mTRS(x, y, -0.2 + 0.2 * Math.sin(T * 5), k, k), mTRS(0, 0, 0, 1, 0.35 + 0.65 * fl)), d, z: z + 0.1 });
}
function mothNear(S, P, T) {
  if (!P._tip) return;
  const x = P._tip[0] + Math.cos(T * 2.3) * 26 + Math.sin(T * 5.1) * 6, y = P._tip[1] - 22 + Math.sin(T * 3.1) * 14;
  mothAt(S, x, y, P.d - 0.001, T);
}

/* ---------- план крыш: сцена 1 ---------- */
const PLAN1 = buildPlan([
  { k: 'walk', t0: 12.5, t1: 14.3, x0: 560, x1: 782, g: 398 },
  { k: 'reach', t0: 14.3, t1: 15.6, x: 782, g: 398, tip: [895, 360], tPop: 15.0 },
  { k: 'jump', t0: 15.6, t1: 16.85, x0: 782, g0: 398, x1: 1040, g1: 414, h: 120 },
  { k: 'walk', t0: 16.85, t1: 18.05, x0: 1040, x1: 1188, g: 414 },
  { k: 'reach', t0: 18.05, t1: 19.15, x: 1188, g: 414, tip: [1300, 400], tPop: 18.75 },
  { k: 'walk', t0: 19.15, t1: 20.3, x0: 1188, x1: 1392, g: 414 },
  { k: 'jump', t0: 20.3, t1: 20.95, x0: 1392, g0: 414, x1: 1486, g1: 470, h: 34 },
  { k: 'walk', t0: 20.95, t1: 21.95, x0: 1486, x1: 1668, g: 470 },
  { k: 'reach', t0: 21.95, t1: 23.0, x: 1668, g: 470, tip: [1760, 508], tPop: 22.5 },
  { k: 'walk', t0: 23.0, t1: 24.1, x0: 1668, x1: 1910, g: 470 },
  { k: 'jump', t0: 24.1, t1: 24.7, x0: 1910, g0: 470, x1: 2000, g1: 510, h: 28 },
  { k: 'walk', t0: 24.7, t1: 26.5, x0: 2000, x1: 2352, g: 510, taps: [{ t: 26.0, tip: [2330, 548] }] },
  { k: 'jump', t0: 26.5, t1: 27.0, x0: 2352, g0: 510, x1: 2440, g1: 550, h: 26 },
  { k: 'walk', t0: 27.0, t1: 27.7, x0: 2440, x1: 2770, g: 550, taps: [{ t: 27.3, tip: [2790, 580] }] },
  { k: 'jump', t0: 27.7, t1: 28.2, x0: 2770, g0: 550, x1: 2860, g1: 590, h: 26 },
  { k: 'walk', t0: 28.2, t1: 29.4, x0: 2860, x1: 3160, g: 590 },
  { k: 'jump', t0: 29.4, t1: 30, x0: 3160, g0: 590, x1: 3280, g1: 680, h: 40 },
]);
function catPlan1(T) { return catFromPlan(PLAN1, T); }

/* ---------- шоты ---------- */
const SHOTS = [];
function shot(t0, t1, fn, o = {}) { SHOTS.push({ t0, t1, fn, ...o }); }

// S1 · титр в сумеречном небе, камера опускается к городу
shot(0, 7.5, (T, lt) => {
  const e = ramp(lt, 1.4, 7.2, 'io3');
  const cam = { x: 1520, y: lerp(360, 420, e), dist: 2.3, zoom: 1, sy: lerp(640, 70, e) };
  const S = townScene(T, cam);
  titleScreen(S, T, -(640 - cam.sy) * 1.18);
  // лодка мышонка выходит из гавани
  boatAt(S, T, lerp(3700, 4600, sat(T / 30)), 0.9, 1.2);
  S.post.fade = 1 - ramp(lt, 0, 0.9, 'out');
  return S;
});

// S2 · слуховое окно: кот просыпается
const DORMER = { x: 130, y: 398 };
shot(7.5, 12.5, (T, lt) => {
  const camY = key(T, [[7.5, 395], [10.2, 395], [11.2, 330, 'io']]);
  const cam = { x: key(T, [[7.5, 150], [11.4, 200, 'io'], [12.5, 250, 'io']]), y: camY, dist: 0.56, zoom: 1, sy: 0 };
  const S = townScene(T, cam);
  const D = DORMER;
  const open = ramp(T, 8.35, 8.8, 'out3');
  const lit = ramp(T, 7.9, 8.1);
  S.items.push(IT(lit > 0 ? 'dormer.inside' : 'dormer.dark', D.x, D.y, 0, { z: 12.5, a: 1 }));
  if (lit > 0) S.lights.push({ x: D.x, y: D.y, d: 0, r: 150, k: 0.8 * lit, warm: 0.2 });
  S.items.push(IT('dormer.front', D.x, D.y, 0, { z: 14.5 }));
  const shx = 1 - 1.85 * open + wobbleOut(T, 8.8, 0.12, 12, 5);
  S.items.push({ s: 'dormer.shL', m: mTRS(D.x - 34, D.y, 0, shx, 1), d: 0, z: 14.6 });
  S.items.push({ s: 'dormer.shR', m: mTRS(D.x + 34, D.y, 0, shx, 1), d: 0, z: 14.6 });
  // кот: поднимается в окне, зевает, выпрыгивает на конёк, потягивается, берёт шест
  const P = catBase();
  P.face = 1; P.spr = {}; P.hide = {};
  const pickT = 12.05;
  const poleFree = T < pickT;
  if (T < 10.35) {
    const rise = ramp(T, 8.75, 9.35, 'out3');
    P.x = D.x + 2; P.y = D.y + 76 + 60 * (1 - rise);
    const yawn = ramp(T, 9.1, 9.35) * (1 - ramp(T, 9.85, 10.05));
    P.head = -0.28 * yawn + 0.05 * Math.sin(T * 2);
    P.earN = -0.35 * yawn; P.earF = -0.4 * yawn;
    P.spr.eye = yawn > 0.3 ? 'cat.eye.closed' : (T < 9.1 ? 'cat.eye.half' : 'cat.eye.open');
    P.spr.mouth = yawn > 0.3 ? 'cat.mouth.yawn' : 'cat.mouth.n';
    P.armN1 = 0.1; P.armN2 = -0.3; P.armF1 = 0.1;
    if (T > 10.05) { P.spr.eye = 'cat.eye.open'; P.pupilXY = [1.2, 0]; }
    P.zb = 13;
  } else if (T < 11.15) {
    // упреждение и прыжок из окна на конёк
    const a = ramp(T, 10.35, 10.6), v = sat((T - 10.6) / 0.45);
    if (T < 10.6) { P.x = D.x + 2; P.y = D.y + 76 + 14 * a; P.sy = 1 - 0.1 * a; P.torso = 0.25 * a; P.zb = 13; }
    else {
      P.x = lerp(D.x + 2, 250, v); P.y = lerp(D.y + 76, 300 - 52, v) - 70 * 4 * v * (1 - v);
      P.legN1 = -0.8; P.legN2 = 1.3; P.legF1 = -0.3; P.legF2 = 1.2; P.armF1 = -1.3; P.armN1 = -1.1; P.tail0 = 1.35;
      P.spr.eye = 'cat.eye.wide'; P.zb = v > 0.35 ? 16 : 13;
    }
  } else {
    P.x = 250; P.ground = 300; P.zb = 16;
    const land = 1 - ramp(T, 11.15, 11.4);
    const st = ramp(T, 11.35, 11.6) * (1 - ramp(T, 11.85, 12.0));
    P.sy = 1 - 0.12 * land * Math.sin(Math.PI * sat((T - 11.15) / 0.25)) + 0.07 * st; P.sx = 1 - 0.04 * st;
    P.armF1 = -2.9 * st + 0.2 * (1 - st); P.armF2 = -0.2 * st; P.armN1 = -2.8 * st; P.armN2 = -0.25 * st;
    P.head = -0.2 * st; P.torso = 0.06 - 0.12 * st;
    P.tail0 = 1.85 + 0.9 * st; P.tail1 = 0.3 - 0.5 * st; P.tail2 = 0.32 - 0.5 * st; P.tail3 = 0.3 - 0.4 * st; P.tail4 = 0.28 - 0.3 * st;
    P.spr.eye = st > 0.3 ? 'cat.eye.closed' : 'cat.eye.open'; P.spr.mouth = st > 0.3 ? 'cat.mouth.o' : 'cat.mouth.n';
    if (T > 11.95) {
      // берёт шест, прислонённый к окну
      const g = ramp(T, 11.95, pickT);
      if (T < pickT) { P.reach = [206, 372]; P.bend = -1; P.torso = 0.06 + 0.25 * g; }
      else { P.reachL = CARRY; P.poleW = CARRY_W; }
    }
    if (T > 12.1) {
      const w = T - 12.1;
      P.x = 250 + w * 150; Object.assign(P, catWalk(w * 150 / STRIDE, { A: 0.5 * Math.min(1, w / 0.2) }));
      P.reachL = CARRY; P.poleW = CARRY_W;
    }
  }
  if (poleFree) { P.hide.pole = 1; S.items.push(IT('cat.pole', 206, 430, 0, { r: -0.26, z: 15 })); }
  catItems(P, S.items, P.zb || 16);
  if (poleFree) { const tip = mApply(mTRS(206, 430, -0.26), 0.4, -128); flameOn(S, { _tip: tip, d: 0 }, T); mothAt(S, tip[0] + Math.cos(T * 2.2) * 22, tip[1] - 20 + Math.sin(T * 3) * 10, -0.001, T); }
  else { flameOn(S, P, T); mothNear(S, P, T); }
  return S;
});

// S3 · проводка по крышам: три фонаря на сильные доли
shot(12.5, 25, (T, lt) => {
  const P = catPlan1(T);
  // камера следует за котом с опозданием: среднее положение за последние полсекунды
  let cx = 0, n = 0;
  for (let k = 0; k <= 8; k++) { const q = catPlan1(T - 0.55 + k * 0.08); cx += q.x0; n++; }
  cx /= n;
  // первый фонарь — главный ритуал, камера подъезжает на средний план и отъезжает на прыжке
  const push = key(T, [[12.5, 0], [13.4, 0], [14.5, 1, 'io'], [15.7, 1], [16.7, 0, 'io']]);
  const cam = { x: cx + 110 - 30 * push, y: key(T, [[12.5, 330], [16, 345], [20, 380], [25, 420]]) + 18 * push, dist: lerp(0.86, 0.6, push), zoom: 1, sy: 40 };
  const S = townScene(T, cam);
  catItems(P, S.items, 16);
  flameOn(S, P, T); mothNear(S, P, T);
  return S;
}, { tin: { k: 'cut' } });

// S4 · общий план: город в огнях, кот бежит к пристани
shot(25, 30, (T, lt) => {
  const e = ramp(lt, 0.2, 5, 'io');
  const cam = { x: lerp(2300, 3880, e), y: lerp(470, 520, e), dist: lerp(2.15, 2.0, e), zoom: 1, sy: 70 };
  const S = townScene(T, cam);
  const P = catPlan1(T);
  catItems(P, S.items, 16);
  flameOn(S, P, T);
  lampItems(WORLD.pierLamp, T, S);
  boatAt(S, T, 5600, 3, 1);
  return S;
}, { tin: { k: 'dissolve', d: 0.7 } });

/* лодка мышонка вдали (пока силуэт с парусом) */
function boatAt(S, T, x, d, k) {
  const bob = Math.sin(T * 1.3) * 3, r = Math.sin(T * 1.1) * 0.05;
  S.items.push(IT('boat.far', x, Y_SEA + bob - 2 * (1 + d) * 0, d - 0.02, { k: k * (1 + d) / (1 + d * 0.9), r, z: 1 }));
}

/* ---------- сборка кадра ---------- */
const Film = {
  shotAt(T) {
    let i = 0;
    for (let k = 0; k < SHOTS.length; k++) if (T >= SHOTS[k].t0) i = k;
    return i;
  },
  frame(T) {
    T = clamp(T, 0, DURATION - 1e-4);
    const i = this.shotAt(T), sh = SHOTS[i];
    const S = sh.fn(T, T - sh.t0);
    const tr = sh.tin;
    if (tr && i > 0 && T - sh.t0 < (tr.d || 0)) {
      const k = (T - sh.t0) / tr.d;
      if (tr.k === 'dissolve') {
        const prev = SHOTS[i - 1];
        S.dissolve = { scene: prev.fn(T, T - prev.t0), k: EASE.io(k) };
      } else if (tr.k === 'dip') S.post.fade = Math.max(S.post.fade || 0, 1 - EASE.out(k));
    }
    if (sh.tout && sh.t1 - T < sh.tout.d) S.post.fade = Math.max(S.post.fade || 0, EASE.in(1 - (sh.t1 - T) / sh.tout.d));
    return S;
  },
};

/* дальняя лодка: силуэт с парусом */
function boatFarParts() {
  def('boat.far', { res: 0.8, shadow: SHADOW, draw(g) {
    g.paper(parsePath('M -34 -6 L 34 -6 L 24 8 L -26 8 Z'), PAL.woodD, { k: 0.7 });
    g.paper(rect(-1.5, -62, 3, 58), PAL.woodD, { k: 0.5 });
    g.paper(parsePath('M 1 -60 Q 22 -34 26 -8 L 2 -8 Z'), '#E7DCC2', { k: 0.6 });
    g.paper(parsePath('M -2 -54 Q -16 -30 -18 -9 L -3 -9 Z'), '#D9CBAE', { k: 0.6 });
  } });
}
