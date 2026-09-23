'use strict';
/* ==========================================================================
   Кот-фонарщик · film2.js
   Сцены 2–5: последний фонарь, лунная дорожка, Луна, дорога домой, финал.
   ========================================================================== */

/* ---------- Луна: место в мире (лист на глубине 3), лицо, ломтик ---------- */
const MOON = { X: 6266, d: 3, k: 2 };
const SLIVER_C = [-226, 0];      // центр серпа в координатах Луны
function moonY(T) {
  if (T < 44.5) return 1320;
  if (T < 48.6) return lerp(1320, 188, EASE.out(sat((T - 44.5) / 4.1)));
  if (T < 82) return 188;
  return lerp(188, -560, ramp(T, 82, 117, 'io'));
}
function moonFace(T) {
  const F = { eyeL: 'closed', eyeR: 'closed', mouth: 'sleep', pupil: [-7, 7] };
  if (T >= 71.2) F.eyeL = 'open';
  if (T >= 72.0) F.eyeR = 'open';
  if (T >= 72.3 && T < 73.2) F.mouth = 'o';
  else if (T >= 73.2 && T < 75.7) F.mouth = 'sleep';
  else if (T >= 75.7) F.mouth = 'smile';
  if (T >= 76.0 && T < 76.9) { F.eyeL = F.eyeR = 'closed'; }
  if ((T >= 80.0 && T < 80.4) || (T >= 111.5 && T < 111.95)) F.eyeR = 'closed';
  if (T >= 81) F.pupil = [-4, 5];
  return F;
}
function moonMat(T) {
  const br = 1 + 0.006 * Math.sin(T * 1.3);
  return mTRS(MOON.X, moonY(T), 0, MOON.k * br, MOON.k * br);
}
function moonItems(S, T, o = {}) {
  const M = moonMat(T), d = MOON.d, F = moonFace(T), z = 30;
  const put = (s, x, y, zz, k = 1, r = 0) => S.items.push({ s, m: mMul(M, mTRS(x, y, r, k, k)), d, z: z + zz });
  put('moon.body', 0, 0, 0);
  if (T < 76.2) put('moon.sliver', 0, 0, 0.01);
  put('moon.cheek', -44, 34, 0.02); put('moon.cheek', 134, 28, 0.02);
  put('moon.nose', 44, 8, 0.03);
  for (const [side, ex, ey] of [['L', -18, -56], ['R', 104, -60]]) {
    const st = side === 'L' ? F.eyeL : F.eyeR;
    if (st === 'closed') put('moon.eye.closed', ex, ey, 0.04);
    else { put('moon.eye.open', ex, ey, 0.04); put('moon.pupil', ex + F.pupil[0], ey + F.pupil[1], 0.05); }
  }
  put('moon.mouth.' + F.mouth, 44, 78, 0.04);
  const y = moonY(T);
  if (y < 1200) {
    const up = sat((1320 - y) / 500);
    S.glows.push({ x: MOON.X, y, d, r: 700, a: 0.2 * up, c: [255, 240, 205] });
    S.glows.push({ x: MOON.X, y, d, r: 1500, a: 0.1 * up, c: [210, 205, 255] });
    S.lights.push({ x: MOON.X, y: y + 120, d, r: o.lightR ?? 1500, k: 0.55 * up, warm: 0.05, wc: [215, 220, 255] });
  }
}
/* ломтик в полёте: от края Луны к фитилю шеста */
function sliverFly(S, T, tipW, tipD) {
  if (T < 76.2 || T >= 77.62) return;
  const M = moonMat(T), c0 = mApply(M, SLIVER_C[0], SLIVER_C[1]);
  const u = sat((T - 76.2) / 1.42), e = EASE.io(u);
  const sep = ramp(T, 76.2, 76.55, 'out');
  const x = lerp(c0[0] - 40 * sep, tipW[0], e) - Math.sin(Math.PI * e) * 120;
  const y = lerp(c0[1], tipW[1], e) - Math.sin(Math.PI * e) * 60 * (1 - e);
  const k = MOON.k * lerp(1, 0.06, EASE.in(u)), r = -0.6 * e - 3.2 * EASE.in3(u);
  const d = lerp(MOON.d, tipD - 0.01, e);
  S.items.push({ s: 'moon.sliver', m: mMul(mTRS(x, y, r, k, k), mTRS(-SLIVER_C[0], -SLIVER_C[1])), d, z: 300 });
  S.glows.push({ x, y, d, r: 160 * (1 - 0.6 * u), a: 0.35, c: [255, 246, 214] });
  for (let i = 1; i <= 6; i++) {
    const uu = sat(u - i * 0.05); if (uu <= 0) continue;
    const ee = EASE.io(uu), sx = lerp(c0[0] - 40, tipW[0], ee) - Math.sin(Math.PI * ee) * 120, sy = lerp(c0[1], tipW[1], ee) - Math.sin(Math.PI * ee) * 60 * (1 - ee);
    S.items.push(IT('spark', sx + Math.sin(i * 7 + T * 9) * 10, sy + Math.cos(i * 5 + T * 8) * 8, lerp(MOON.d, tipD, ee) - 0.012, { k: 2.2 - i * 0.25, z: 299, a: 1 - i / 7 }));
  }
}

/* ---------- лунная дорожка ---------- */
const PATH = { x0: 4800, x1: 5985, d1: 2.85, N: 84 };
const pathPt = (s) => [lerp(PATH.x0, PATH.x1, s), PATH.d1 * s];
const PATH_G = (() => {
  const r = rng(314), out = [];
  for (let i = 0; i < PATH.N; i++) {
    const s = (i + r()) / PATH.N, [x, d] = pathPt(s);
    out.push({ s, x: x + (r() - 0.5) * 110, d, k: 0.9 + r() * 0.9, g: Math.floor(r() * 3), ph: r() * TAU, sp: 2 + r() * 3 });
  }
  for (let i = 0; i < 40; i++) {   // у самой Луны — гуще и ярче
    const s = 0.82 + r() * 0.18, [x, d] = pathPt(s);
    out.push({ s, x: x + (r() - 0.2) * 260, d: d + r() * 0.12, k: 1 + r(), g: Math.floor(r() * 3), ph: r() * TAU, sp: 2 + r() * 3 });
  }
  return out;
})();
function pathItems(S, T, o = {}) {
  const appear = (g) => sat((T - (47.0 + (1 - g.s) * 2.6)) / 0.35);
  for (const g of PATH_G) {
    let a = appear(g);
    if (o.fadeBehind !== undefined) a *= 1 - sat((g.s - o.fadeBehind - 0.08) / 0.12);
    if (T > 88.4) a *= 1 - ramp(T, 88.4, 89.4);
    if (a <= 0.01) continue;
    const tw = 0.6 + 0.4 * Math.sin(T * g.sp + g.ph), bob = Math.sin(T * 1.05 + g.d * 1.7) * 3;
    S.items.push(IT('glint.' + g.g, g.x + Math.sin(T * 0.7 + g.ph) * 6, Y_SEA - 4 + bob, g.d - 0.004, { k: g.k * (1 + g.d * 0.15), a: a * tw, z: -1 }));
  }
}
/* вспышка под лапой и круги на воде */
function stepFlash(S, x, d, T, t0) {
  const u = (T - t0) / 0.55;
  if (u < 0 || u > 1) return;
  S.items.push(IT('glint.step', x, Y_SEA - 4, d - 0.006, { k: 1 + u * 0.4, a: 1 - u, z: 0 }));
  S.items.push(IT('ripple', x, Y_SEA - 3, d - 0.005, { sx: 0.5 + u * 1.3, sy: 0.5 + u * 1.3, a: (1 - u) * 0.8, z: 0 }));
}

/* ---------- лодка мышонка: где она ---------- */
function boatPos(T) {
  if (T < 30) { const u = sat(T / 30); return { x: lerp(3780, 5600, u), d: lerp(0.3, 3.4, u), face: 1 }; }
  // с 30-й секунды мышонок всё время смотрит на берег: ждёт огня пристани
  if (T < 94) return { x: 6150 + 160 * Math.sin(T * 0.11), d: 4.2 + 0.4 * Math.sin(T * 0.13), face: -1 };
  if (T < 101.8) { const u = EASE.io(sat((T - 94.6) / 7.2)); return { x: lerp(6150 + 160 * Math.sin(94 * 0.11), 4905, u), d: lerp(4.2 + 0.4 * Math.sin(94 * 0.13), 0.14, u), face: -1 }; }
  return { x: 4905 - 8 * EASE.out(sat((T - 101.8) / 0.3)) + wobbleOut(T, 101.8, 6, 12, 5), d: 0.14, face: -1 };
}
function boatNow(S, T, o = {}) {
  const b = boatPos(T);
  boatWithMouse(S, T, b.x, Y_SEA + 6, b.d, { face: b.face, ...o });
}

/* ---------- кот: общие позы ---------- */
function idleCat(P, T, seed = 5) {
  P.torso += 0.015 * Math.sin(T * 2.1);
  for (let i = 0; i < 5; i++) P['tail' + i] += 0.08 * Math.sin(T * 1.5 - i * 0.6);
  P.spr = P.spr || {};
  if (!P.spr.eye) P.spr.eye = blinkAt(T, seed) ? 'cat.eye.closed' : 'cat.eye.open';
  return P;
}
function windOn(P, T, w) {
  P.scarfT1 = 1.25 * w + P.scarfT1 * (1 - w) + 0.25 * w * Math.sin(T * 13);
  P.scarfT2 = 0.2 + 0.35 * w * Math.sin(T * 17 + 1);
  P.earN += -0.15 * w; P.earF += -0.15 * w;
  return P;
}
function ember(S, P, T) {
  if (!P._tip) return;
  S.items.push(IT('spark', P._tip[0], P._tip[1] + 1, P.d - 0.001, { k: 0.5, a: 0.5 + 0.3 * Math.sin(T * 7), z: 201 }));
}
function smoke(S, x, y, d, T, t0, dir = 1) {
  for (let i = 0; i < 5; i++) {
    const u = (T - t0 - i * 0.12) / 1.6;
    if (u < 0 || u > 1) continue;
    S.items.push(IT('puff.' + (i % 3), x + dir * u * 50 + Math.sin(u * 7 + i) * 10, y - u * 110, d - 0.002, { k: 0.6 + u * 1.4, a: (1 - u) * 0.8, z: 220, r: u * 2 }));
  }
}

/* ---------- кот анфас (крупные планы) ---------- */
function catFace(S, x, y, sc, E, T, d = 0) {
  const H = mTRS(x, y + (E.dy || 0), E.tilt || 0, sc, sc), z = 100;
  const put = (s, m, zz, a = 1) => S.items.push({ s, m, d, z: z + zz, a });
  put('cf.body', mMul(mTRS(x, y, 0, sc, sc), mTRS(0, 64)), 0);
  const eL = E.earL ?? 0, eR = E.earR ?? 0;
  put('cf.earL', mMul(H, mTRS(-70, -80, eL)), 0.5);
  put('cf.earR', mMul(H, mTRS(70, -80, eR)), 0.5);
  put('cf.head', H, 1);
  const lid = E.lid || 'open';
  for (const s of [-1, 1]) {
    const eyeM = s < 0 ? mMul(H, mTRS(-52, -14, 0, -1, 1)) : mMul(H, mTRS(52, -14));
    if (E.happy) { put('cf.eye.happy', eyeM, 2); continue; }
    put('cf.eye', eyeM, 2);
    const p = E.pupil || [0, 0];
    put(E.round ? 'cf.pupilR' : 'cf.pupil', mMul(H, mTRS(52 * s + p[0], -14 + p[1], 0, E.pk || 1, E.pk || 1)), 2.1);
    if (lid !== 'open') put('cf.lid.' + lid, eyeM, 2.2); else put('cf.lash', eyeM, 2.2);
  }
  for (const s of [-1, 1]) {
    const b = E.brow || [0, 0];
    put('cf.brow', mMul(H, mTRS(52 * s, -56 + b[0], s * (b[1] || 0))), 2.3);
  }
  put('cf.whL', mMul(H, mTRS(-44, 40, -(E.whisk || 0))), 2.4);
  put('cf.whR', mMul(H, mTRS(44, 40, E.whisk || 0)), 2.4);
  put('cf.nose', mMul(H, mTRS(0, 24)), 2.5);
  put('cf.mouth.' + (E.mouth || 'n'), mMul(H, mTRS(0, 33)), 2.5);
  if (E.cap !== false) put('cf.cap', mMul(H, mTRS(0, -88, E.capR || 0)), 3);
}

/* ---------- шоты сцен 2–5 ---------- */
const PIER_X = 4642;          // где стоит кот у последнего фонаря
const LAMPTIP = [4712, 448];  // куда упирается шест

// S5 · мышонок в тёмном море высматривает огонь пристани
shot(30, 32.5, (T, lt) => {
  const b = boatPos(T);
  // средний план: лодка крупнее, мышонок всматривается в тёмный берег
  const near = lerp(0.72, 0.6, ramp(T, 30, 32.5, 'io'));
  const cam = { x: b.x - 150, y: Y_SEA - 96, dist: near - b.d, zoom: 1, sy: 30 };
  const S = townScene(T, cam);
  boatNow(S, T, { arm: -2.35 + 0.08 * Math.sin(T * 3), head: -0.12, wind: 1.6 });
  // волна перед лодкой: корпус сидит в воде, а не на ней
  // (масштаб подобран так, чтобы на экране полоса была натуральной величины, как лист на станке)
  const zf = near - 0.05, fx = 1.15 * zf, fy = 1.7 * zf, x0 = cam.x - 900 * zf + Math.sin(T * 0.6) * 12 * zf;
  for (let k = 0; k < 2; k++) S.items.push({ s: 'sea.5', m: mTRS(x0 + k * SEA_W * fx, Y_SEA + 12 + Math.sin(T * 1.3) * 2, 0, fx, fy), d: b.d - 0.05, z: -5 });
  S.lights.push({ x: b.x, y: Y_SEA - 70, d: b.d, r: 300, k: 0.35 });
  S.dark.k = 0.6;
  return S;
}, { tin: { k: 'dip', d: 0.5 } });

// S6 · пристань: две попытки, ветер задувает огонёк фонаря
shot(32.5, 40, (T, lt) => {
  const cam = { x: 4600, y: 548, dist: 0.74, zoom: 1, sy: 18, shx: 0, shy: 0 };
  const gust = Math.max(ramp(T, 34.2, 34.5) * (1 - ramp(T, 34.8, 35.3)), ramp(T, 36.5, 36.8) * (1 - ramp(T, 37.2, 37.8)), ramp(T, 39.4, 40) * 0.5);
  cam.shx = Math.sin(T * 31) * 1.5 * gust;
  const S = townScene(T, cam);
  const P = catBase();
  P.face = 1; P.ground = 680; P.reachL = CARRY; P.poleW = CARRY_W; P.spr = {};
  if (T < 33.4) {
    const u = (T - 32.5) / 0.9, x = lerp(4540, PIER_X, EASE.out(u));
    P.x = x; Object.assign(P, catWalk((x - 4540) / STRIDE, { A: 0.5 * Math.min(1, (1 - u) / 0.2) }));
    P.reachL = CARRY;
  } else {
    P.x = PIER_X;
    // попытки: шест вверх к фитилю, дуновение, вниз
    const up = Math.max(key(T, [[33.5, 0], [33.7, -0.1], [34.1, 1, 'out3'], [34.75, 1], [35.2, 0]]), key(T, [[35.3, 0], [35.5, -0.1], [35.95, 1, 'out3'], [37.25, 1], [37.7, 0]]));
    P.tip = LAMPTIP; P.tipK = up; P.carry = CARRY; P.carryW = CARRY_W; P.poleW = undefined;
    P.torso = 0.06 + 0.1 * Math.max(0, up); P.head = -0.18 * Math.max(0, up);
    if (T > 35.5 && T < 37.3) { const sh = ramp(T, 35.5, 35.9); P.armF1 = -2.3 * sh; P.armF2 = -0.8 * sh; P.torso += 0.08 * sh; }
    const react1 = ramp(T, 34.65, 34.9) * (1 - ramp(T, 35.3, 35.6));
    const react2 = ramp(T, 37.15, 37.4);
    P.earN += -0.5 * Math.max(react1, react2); P.earF += -0.5 * Math.max(react1, react2);
    P.spr.eye = (T > 34.62 && T < 34.78) || (T > 37.12 && T < 37.26) ? 'cat.eye.closed' : react2 > 0.5 ? 'cat.eye.half' : 'cat.eye.open';
    if (react2 > 0.3) { P.brow = 0.35; P.spr.mouth = 'cat.mouth.frown'; }
    for (let i = 0; i < 5; i++) P['tail' + i] += 0.25 * react2 * Math.sin(T * 7 - i * 0.8);
    // собирается с духом: шаг назад и упреждение
    const set = ramp(T, 38.4, 39.0);
    P.x -= 10 * set; P.sy = 1 - 0.05 * ramp(T, 39.3, 39.8); P.torso += 0.05 * set;
    if (T > 38.4) { P.spr.eye = 'cat.eye.half'; P.brow = 0.4; }
    idleCat(P, T);
  }
  windOn(P, T, 0.35 + gust * 0.65);
  catItems(P, S.items, 16);
  flameOn(S, P, T, 'fire', 1 - 0.25 * gust);
  mothNear(S, P, T);
  // фонарь: фитиль занимается и гаснет
  const L = WORLD.pierLamp;
  let lit = 0, pop = 0;
  for (const [a, b] of [[34.15, 34.62], [36.3, 37.12]]) if (T >= a && T < b) { lit = 1; pop = 0.45 * EASE.pop(sat((T - a) / 0.25)) * (1 - 0.6 * sat((T - (b - 0.25)) / 0.25)); }
  lampItems(L, T, S, { lit, pop, r: 120 });
  smoke(S, L.x, L.y - 20, L.d, T, 34.62, 1); smoke(S, L.x, L.y - 20, L.d, T, 37.12, 1);
  S.post.fade = 0;
  return S;
});

// S7 · крупно: третья попытка — задуло и огонь на шесте
shot(40, 43, (T, lt) => {
  const cam = { x: 0, y: 0, dist: 1, zoom: 1, sy: 0 };
  const S = { cam, items: [], lights: [], glows: [], sky: null, screen: [], lines: [], post: {} };
  S.items.push(IT('bg.harbor', 150, 0, 4, { k: 5.2, z: 0 }));
  const gust = ramp(T, 40.75, 41.05) * (1 - ramp(T, 41.5, 42.2));
  const out = T >= 41.3;
  const sad = ramp(T, 41.7, 42.8, 'io');
  const E = {
    tilt: -0.03 + 0.05 * sad + 0.02 * Math.sin(T * 1.7), dy: 16 * sad,
    earL: lerp(0.05, -0.75, sad) - 0.25 * gust, earR: lerp(-0.05, 0.75, sad) - 0.3 * gust,
    lid: T < 40.75 ? 'det' : T < 41.35 ? 'h' : T < 41.7 ? 'open' : 'sad',
    pupil: T < 41.35 ? [10, -8] : T < 41.7 ? [4, -4] : [-3, 10 * sad], pk: T > 41.35 && T < 41.7 ? 0.8 : 1,
    brow: T < 41.35 ? [8, -0.25] : [-10 * sad, 0.3 * sad],
    mouth: T < 41.35 ? 'n' : T < 41.8 ? 'o' : 'sad', whisk: -0.18 * sad + 0.1 * gust,
  };
  catFace(S, -150, 60, 1.35, E, T);
  // шест с огнём справа от лица
  const px = 520, py = -80;
  S.items.push({ s: 'cat.pole', m: mTRS(px + 120, py + 520, -0.3, 3.1, 3.1), d: -0.05, z: 150 });
  const tip = mApply(mTRS(px + 120, py + 520, -0.3, 3.1, 3.1), 0.4, -128);
  if (!out) {
    const fl = 1 - 0.4 * gust + 0.1 * Math.sin(T * 40) * gust;
    S.items.push(IT('flame.' + (Math.floor(T * 12) % 3), tip[0], tip[1] + 6, -0.06, { k: 3 * fl * (1 - 0.7 * ramp(T, 41.1, 41.3)), r: 0.5 * gust, z: 160 }));
    S.lights.push({ x: tip[0] - 60, y: tip[1] + 40, d: 0, r: 900, k: 0.85 * (1 - 0.4 * gust), warm: 0.25 });
    S.glows.push({ x: tip[0], y: tip[1] - 20, d: -0.06, r: 110, a: 0.55 * (1 - 0.5 * gust), c: [255, 205, 120] });
  } else {
    smoke(S, tip[0], tip[1] - 10, -0.06, T, 41.3, 1);
    const fade = 1 - ramp(T, 41.3, 41.9);
    if (fade > 0) S.lights.push({ x: tip[0] - 60, y: tip[1] + 40, d: 0, r: 900, k: 0.7 * fade, warm: 0.2 * fade });
    S.items.push(IT('spark', tip[0], tip[1] + 4, -0.061, { k: 1.4, a: 0.5 * (1 - ramp(T, 41.3, 42.4)), z: 161 }));
  }
  S.dark = { k: 0.62, top: [14, 16, 42], bot: [20, 20, 48] };
  // мотылёк беспокойно вьётся у погасшего фитиля
  mothAt(S, tip[0] - 40 + Math.cos(T * 4) * 40, tip[1] + 20 + Math.sin(T * 5) * 25, -0.07, T, 3);
  return S;
}, { tin: { k: 'cut' } });

// S8 · общий: кот сидит на краю пристани; мотылёк зовёт к восходящей Луне
shot(43, 50, (T, lt) => {
  const cam = { x: 4470, y: 560, dist: 1.7, zoom: 1, sy: 40 };
  const S = townScene(T, cam);
  moonItems(S, T);
  pathItems(S, T);
  const P = catBase();
  P.face = 1; P.spr = {}; P.reachL = [12, -12]; P.poleW = 1.5;
  const stand = ramp(T, 48.7, 49.4, 'io');
  const sitP = { x: 4735, y: 680 - 30, legN1: -1.45, legN2: 1.6, footN: 0.4, legF1: -1.3, legF2: 1.5, footF: 0.5, torso: 0.34, head: 0.3, armF1: -0.3, armF2: -0.6, tail0: 1.0, tail1: -0.2, tail2: -0.2, tail3: -0.1, tail4: 0 };
  Object.assign(P, sitP);
  const look = ramp(T, 44.9, 46.2) , perk = ramp(T, 47.4, 47.8);
  P.head = lerp(0.3, -0.34, look); P.torso = lerp(0.34, 0.12, look);
  P.earN = lerp(-0.45, 0.1, perk); P.earF = lerp(-0.5, -0.05, perk);
  P.spr.eye = look < 0.5 ? 'cat.eye.half' : perk > 0.5 ? 'cat.eye.wide' : 'cat.eye.open';
  P.pupilXY = [1.4 * look, -1.4 * look];
  if (stand > 0) {
    const st = catBase();
    const Q = mixPose(P, Object.assign(st, { x: 4728, torso: 0.02, head: -0.2, earN: 0.12, earF: -0.02 }), stand);
    Object.assign(P, Q);
    P.reachL = [lerp(12, CARRY[0], stand), lerp(-12, CARRY[1], stand)]; P.poleW = lerp(1.5, CARRY_W, stand);
    P.ground = 680; delete P.y;
    P.sy = 1 - 0.08 * Math.sin(Math.PI * stand);
  }
  catItems(P, S.items, 16);
  ember(S, P, T);
  // мотылёк: кружит над погасшим фитилём, потом летит к горизонту — к Луне
  const fly = sat((T - 44.3) / 2.4);
  if (fly < 1) {
    const tip = P._tip || [4800, 640];
    const e = EASE.in(fly);
    const x = lerp(tip[0] + Math.cos(T * 3) * 24, MOON.X - 160, e), y = lerp(tip[1] - 20 + Math.sin(T * 4) * 12, 380, e) - Math.sin(Math.PI * e) * 140;
    mothAt(S, x, y, lerp(0, MOON.d - 0.2, e) - 0.002, T, 1);
  }
  lampItems(WORLD.pierLamp, T, S, { lit: 0 });
  boatNow(S, T);
  S.dark.k = 0.66;
  return S;
}, { tin: { k: 'cut' } });

// S9 · первый шаг на лунную дорожку
shot(50, 55, (T, lt) => {
  const cam = { x: lerp(4760, 4860, ramp(T, 52.6, 55)), y: 600, dist: lerp(0.8, 0.9, ramp(T, 52.6, 55)), zoom: 1, sy: 20 };
  const S = townScene(T, cam);
  moonItems(S, T); pathItems(S, T);
  const P = catBase();
  P.face = 1; P.reachL = CARRY; P.poleW = CARRY_W; P.spr = {};
  if (T < 51.5) {
    // пробует лапкой воду с края пристани
    P.x = 4740; P.ground = 680;
    const toe = key(T, [[50, 0], [50.5, 1, 'io'], [51.0, 1.15, 'in'], [51.25, 0.6, 'out'], [51.5, 0.2]]);
    P.legN1 = -0.8 * toe; P.legN2 = 0.4 * toe; P.footN = 0.7 * toe; P.torso = 0.1 + 0.1 * toe; P.head = 0.25 * toe; P.armF1 = -0.9 * toe;
    P.spr.eye = T > 51.0 && T < 51.3 ? 'cat.eye.wide' : 'cat.eye.open';
    P.pupilXY = [0.8, 1.6];
  } else if (T < 52.9) {
    // спускается и балансирует шестом, как канатоходец
    const u = sat((T - 51.5) / 0.4);
    P.x = lerp(4740, 4800, u); P.ground = lerp(680, Y_SEA - 4, u);
    const wob = Math.sin((T - 51.9) * 10) * Math.exp(-(T - 51.9) * 2.4) * (T > 51.9 ? 1 : 0);
    P.rot = 0.12 * wob; P.armF1 = -1.5 - 0.4 * wob; P.armF2 = -0.3; P.poleW = 1.45 + 0.35 * wob; P.reachL = [16, -40];
    P.spr.eye = 'cat.eye.wide'; P.tail0 = 1.6 + 0.5 * wob;
  } else {
    const w = T - 52.9, x = 4800 + w * 60;
    P.x = x; P.ground = Y_SEA - 4;
    Object.assign(P, catWalk(w * 1.0, { A: 0.46 * Math.min(1, w / 0.3) }));
    P.reachL = CARRY; P.spr.mouth = 'cat.mouth.smile';
  }
  P.d = T < 52.9 ? 0 : 0.02 + (T - 52.9) * 0.02;
  idleCat(P, T);
  catItems(P, S.items, 16);
  ember(S, P, T);
  stepFlash(S, 4812, 0.01, T, 51.0); stepFlash(S, 4800, 0.02, T, 51.85);
  for (let t = 53; t < 55; t += 0.5) stepFlash(S, 4800 + (t - 52.9) * 60 + 10, 0.02 + (t - 52.9) * 0.02, T, t);
  mothAt(S, P.x + 70 + Math.cos(T * 2) * 16, P.y - 120 + Math.sin(T * 3) * 10, P.d - 0.002, T, 1);
  lampItems(WORLD.pierLamp, T, S, { lit: 0 });
  S.dark.k = 0.6;
  return S;
}, { tin: { k: 'dissolve', d: 0.6 } });

// S10 · по дорожке к Луне: камера летит сквозь планы вслед за котом
function catOnPath(T) {
  const s = key(T, [[55, 0.035], [67.4, 0.975, 'lin'], [68, 0.985, 'out'], [69.4, 1.0, 'out']]);
  return { s, x: lerp(PATH.x0, PATH.x1, s), d: PATH.d1 * s };
}
shot(55, 68, (T, lt) => {
  const c = catOnPath(T), far = sat((T - 55) / 13);
  const cam = { x: c.x + 150 - 40 * far, y: 600 - 60 * far, dist: 1.1 - c.d, zoom: 1, sy: 50 - 20 * far };
  const S = townScene(T, cam);
  moonItems(S, T); pathItems(S, T);
  const P = catBase();
  P.face = 1; P.x = c.x; P.d = c.d; P.ground = Y_SEA - 4; P.spr = { mouth: 'cat.mouth.smile' };
  Object.assign(P, catWalk((T - 53) * 1.0, { A: 0.46 }));
  P.reachL = CARRY; P.poleW = CARRY_W; P.head = -0.12 - 0.08 * far;
  idleCat(P, T);
  catItems(P, S.items, 16);
  ember(S, P, T);
  for (let k = 0; k < 3; k++) { const t0 = Math.floor(T * 2) / 2 - k * 0.5; const q = catOnPath(t0); stepFlash(S, q.x + 8, q.d, T, t0); }
  mothAt(S, P.x + 90 + Math.cos(T * 2.2) * 20, P.y - 130 + Math.sin(T * 3.1) * 12, P.d - 0.003, T, 1);
  S.dark.k = 0.6;
  return S;
}, { tin: { k: 'cut' } });

/* кот у Луны: стоит на конце дорожки */
function catAtMoon(T) {
  const c = catOnPath(T);
  const P = catBase();
  P.face = 1; P.x = c.x; P.d = c.d; P.ground = Y_SEA - 4; P.spr = {}; P.reachL = CARRY; P.poleW = CARRY_W;
  return P;
}
// S11 · Луна спит; кот снимает фуражку и деликатно кашляет
shot(68, 73, (T, lt) => {
  const cam = { x: 6040, y: 331, dist: 1.1 - PATH.d1, zoom: 1, sy: 0 };
  const S = townScene(T, cam);
  moonItems(S, T); pathItems(S, T);
  const P = catAtMoon(T);
  if (T < 69.4) { Object.assign(P, catWalk((T - 53) * 1.0, { A: 0.46 * sat((69.4 - T) / 0.4) })); P.reachL = CARRY; }
  const look = ramp(T, 69.3, 69.8);
  P.head = -0.35 * look; P.pupilXY = [1, -1.5 * look];
  // фуражка — в лапу
  const cap = ramp(T, 69.9, 70.3);
  if (T > 70.05) { P.hide = { cap: 1 }; }
  P.armF1 = -2.0 * cap + (T > 70.3 ? 0.8 * ramp(T, 70.3, 70.6) : 0); P.armF2 = -0.9 * cap;
  const ahem = ramp(T, 70.25, 70.35) * (1 - ramp(T, 70.5, 70.7));
  P.sy = 1 - 0.05 * ahem; P.spr.mouth = ahem > 0.3 ? 'cat.mouth.o' : 'cat.mouth.n';
  // осторожно постучать шестом по краю Луны
  const tap = key(T, [[70.5, 0], [70.75, 1, 'out'], [70.9, 0.8], [71.2, 0]]);
  if (tap > 0) { P.tip = [5930, 330]; P.tipK = tap; P.carry = CARRY; P.carryW = CARRY_W; P.poleW = undefined; }
  const surprised = ramp(T, 71.2, 71.35);
  P.spr.eye = surprised > 0.5 && T < 72.4 ? 'cat.eye.wide' : blinkAt(T, 7) ? 'cat.eye.closed' : 'cat.eye.open';
  P.earN += 0.12 * surprised; P.sx = 1 - 0.03 * surprised * (1 - ramp(T, 71.6, 72));
  P.y = undefined;
  idleCat(P, T);
  catItems(P, S.items, 16);
  if (T > 70.05 && P._W && P._W.armF2) S.items.push({ s: 'cat.cap', m: mMul(P._W.armF2, mTRS(0, 22, 1.4)), d: P.d, z: 16.031 });
  ember(S, P, T);
  mothAt(S, P.x + 60 + Math.cos(T * 2) * 30, P.y - 150 + Math.sin(T * 2.6) * 20, P.d - 0.003, T, 1);
  S.dark.k = 0.55;
  return S;
}, { tin: { k: 'cut' } });

// S12 · крупно: кот просит — показывает погасший фитиль
shot(73, 75.5, (T, lt) => {
  const cam = { x: 0, y: 0, dist: 1, zoom: 1, sy: 0 };
  const S = { cam, items: [], lights: [], glows: [], sky: null, screen: [], lines: [], post: {} };
  S.items.push(IT('bg.moonlit', 0, 0, 4, { k: 5.2, z: 0 }));
  const plead = ramp(T, 73.2, 73.7);
  const E = {
    tilt: 0.08 * plead + 0.02 * Math.sin(T * 2), dy: 6,
    earL: -0.45 * plead, earR: 0.45 * plead,
    lid: 'sad', round: true, pupil: [8, -12], pk: 1.05,
    brow: [-6, 0.35 * plead], mouth: T > 73.75 && T < 74.35 ? 'o' : 'sad', whisk: -0.12 * plead, cap: false,
  };
  catFace(S, -120, 110, 1.3, E, T);
  const lift = ramp(T, 73.4, 74.0, 'out');
  const pm = mTRS(560, 700 - 160 * lift, -0.12 - 0.1 * lift, 3, 3);
  S.items.push({ s: 'cat.pole', m: pm, d: -0.05, z: 150 });
  const tip = mApply(pm, 0.4, -128);
  S.items.push(IT('spark', tip[0], tip[1] + 3, -0.06, { k: 1.2, a: 0.4, z: 151 }));
  S.lights.push({ x: 400, y: -300, d: 0, r: 1400, k: 0.8, warm: 0.04, wc: [220, 225, 255] });
  S.dark = { k: 0.5, top: [40, 44, 90], bot: [36, 38, 80] };
  return S;
}, { tin: { k: 'cut' } });

// S13 · Луна улыбается и отдаёт ломтик своего света
shot(75.5, 79, (T, lt) => {
  const cam = { x: 6120, y: 300, dist: 0.85 - PATH.d1, zoom: 1, sy: 0 };
  const S = townScene(T, cam);
  moonItems(S, T); pathItems(S, T);
  const P = catAtMoon(T);
  P.hide = { cap: 1 };
  const raise = ramp(T, 75.6, 76.2);
  P.tip = [6035, 420]; P.tipK = raise; P.carry = CARRY; P.carryW = CARRY_W; P.poleW = undefined;
  P.head = -0.42; P.pupilXY = [1.2, -1.6];
  P.spr.eye = T > 77.75 ? 'cat.eye.wide' : 'cat.eye.open';
  if (T > 78.3) { P.spr.eye = 'cat.eye.happy'; P.spr.mouth = 'cat.mouth.smile'; }
  P.armF1 = -0.5; P.armF2 = -1.4;
  idleCat(P, T);
  catItems(P, S.items, 16);
  if (P._W && P._W.armF2) S.items.push({ s: 'cat.cap', m: mMul(P._W.armF2, mTRS(0, 22, 1.4)), d: P.d, z: 16.031 });
  sliverFly(S, T, P._tip, P.d);
  if (T >= 77.62) {
    const bloom = 1 + 1.5 * (1 - ramp(T, 77.62, 78.3));
    flameOn(S, P, T, 'moon', bloom);
  } else ember(S, P, T);
  S.dark.k = 0.52;
  return S;
}, { tin: { k: 'cut' } });

// S14 · поклон, Луна подмигивает, кот бросается домой
shot(79, 81, (T, lt) => {
  const cam = { x: 6040, y: 331, dist: 1.1 - PATH.d1, zoom: 1, sy: 0 };
  const S = townScene(T, cam);
  moonItems(S, T); pathItems(S, T);
  const P = catAtMoon(T);
  const bow = key(T, [[79, 0], [79.35, 1, 'io'], [79.7, 1], [80.0, 0, 'io']]);
  P.torso = 0.06 + 0.9 * bow; P.head = 0.3 * bow - 0.3 * (1 - bow); P.armF1 = -0.4 - 0.6 * bow; P.armF2 = -1.2;
  P.hide = T < 80.0 ? { cap: 1 } : {};
  P.spr.eye = bow > 0.5 ? 'cat.eye.closed' : 'cat.eye.happy'; P.spr.mouth = 'cat.mouth.smile';
  if (T > 80.35) {
    const u = T - 80.35;
    P.face = -1;
    const x = P.x - u * u * 220 - u * 60;
    P.x = x; Object.assign(P, catRun(u * 1.4));
    P.spr.eye = 'cat.eye.open'; P.reachL = CARRY; P.poleW = CARRY_W;
  }
  idleCat(P, T);
  catItems(P, S.items, 16);
  if (T < 80.0 && P._W && P._W.armF2) S.items.push({ s: 'cat.cap', m: mMul(P._W.armF2, mTRS(0, 22, 1.4)), d: P.d, z: 16.031 });
  flameOn(S, P, T, 'moon');
  S.dark.k = 0.52;
  return S;
}, { tin: { k: 'cut' } });

// S15 · бегом домой по дорожке, которая гаснет за спиной; прыжок на пристань
function runPath(T) {
  const s = key(T, [[81, 0.97], [87.3, 0.04, 'in']]);
  return { s, x: lerp(PATH.x0, PATH.x1, s), d: PATH.d1 * s };
}
shot(81, 89, (T, lt) => {
  const c = runPath(Math.min(T, 87.3));
  // камера отъезжает перед бегущим котом на постоянном расстоянии, Луна за спиной уменьшается;
  // к 87,3 с расстояние сходится с планом прыжка (1,06)
  const cam = { x: c.x - 170, y: 590, dist: 1.17 - c.d, zoom: 1, sy: 40 };
  if (T > 87.3) { cam.x = lerp(4800 - 170, 4700, ramp(T, 87.3, 88.9)); cam.dist = lerp(1.06, 0.95, ramp(T, 87.3, 88.9)); cam.y = lerp(590, 570, ramp(T, 87.3, 88.9)); }
  const S = townScene(T, cam);
  moonItems(S, T);
  pathItems(S, T, { fadeBehind: c.s });
  const P = catBase();
  P.face = -1; P.spr = { eye: 'cat.eye.open', mouth: 'cat.mouth.smile' }; P.reachL = CARRY; P.poleW = CARRY_W;
  if (T < 87.3) {
    P.x = c.x; P.d = c.d; P.ground = Y_SEA - 4;
    Object.assign(P, catRun((T - 81.4) / 0.714));
    P.reachL = [18, -52]; P.poleW = -0.4;
  } else {
    // прыжок с дорожки на доски пристани
    const a = 0.22, fl = 1.08, u = T - 87.3;
    if (u < a) { const k = EASE.io(u / a); P.x = 4800; P.d = 0.04; P.ground = Y_SEA - 4; P.sy = 1 - 0.14 * k; P.torso = 0.35 * k; P.legN1 = -0.6 * k; P.legN2 = 1.2 * k; P.legF1 = -0.4 * k; P.legF2 = 1.1 * k; P.footN = -0.6 * k; P.footF = -0.7 * k; }
    else if (u < a + fl) {
      const v = (u - a) / fl, st = Math.sin(Math.PI * v);
      P.x = lerp(4800, 4652, v); P.d = lerp(0.04, 0, v); P.y = lerp(Y_SEA - 4, 680, v) - 52 - 150 * 4 * v * (1 - v);
      P.torso = 0.2; P.legN1 = -0.9 * st; P.legN2 = 1.4 * st; P.legF1 = 0.5 - 0.9 * st; P.legF2 = 1.1 * st; P.armF1 = -1.4 * st;
      P.tail0 = 1.35; P.tail1 = 0.1; P.tail2 = 0.08; P.scarfT1 = 1.3; P.spr.eye = 'cat.eye.wide';
      P.poleW = -0.2; P.reachL = [18, -58];
    } else {
      const k = (u - a - fl) / (1.7 - a - fl), sq = Math.sin(Math.PI * Math.min(1, k * 1.5)) * (1 - k * 0.5);
      P.x = 4652 - 8 * EASE.out(sat(k * 2)); P.d = 0; P.ground = 680;
      P.sy = 1 - 0.16 * sq; P.sx = 1 + 0.08 * sq; P.torso = 0.3 * sq; P.legN1 = -0.5 * sq; P.legN2 = 1.1 * sq; P.legF1 = -0.3 * sq; P.legF2 = 1.0 * sq; P.footN = -0.6 * sq; P.footF = -0.7 * sq;
      P.tail0 = 1.85 + wobbleOut(u, a + fl, 0.35, 10, 4);
    }
  }
  catItems(P, S.items, 16);
  flameOn(S, P, T, 'moon');
  for (let k = 0; k < 3; k++) { const t0 = 81.4 + Math.floor((T - 81.4) / 0.357) * 0.357 - k * 0.357; if (t0 < 81.4 || t0 > 87.3) continue; const q = runPath(t0); stepFlash(S, q.x - 8, q.d, T, t0); }
  mothAt(S, P.x - 60 + Math.cos(T * 3) * 14, (P.y || 600) - 140 + Math.sin(T * 4) * 10, (P.d || 0) - 0.003, T, 1);
  lampItems(WORLD.pierLamp, T, S, { lit: 0 });
  boatNow(S, T);
  S.dark.k = 0.6;
  return S;
}, { tin: { k: 'cut' } });

// S16 · ветер снова дует, но лунный огонь не гаснет — фонарь горит!
shot(89, 93.5, (T, lt) => {
  const cam = { x: 4600, y: 548, dist: key(T, [[89, 0.74], [91.5, 0.7, 'io'], [93.5, 0.76, 'io']]), zoom: 1, sy: 18 };
  const gust = ramp(T, 89.8, 90.3) * (1 - ramp(T, 90.9, 91.4));
  cam.shx = Math.sin(T * 29) * 1.8 * gust;
  const S = townScene(T, cam);
  moonItems(S, T);
  const P = catBase();
  P.face = 1; P.x = PIER_X; P.ground = 680; P.spr = {};
  const up = key(T, [[89.1, 0], [89.3, -0.1], [89.8, 1, 'out3'], [91.9, 1], [92.4, 0.3], [92.9, 0]]);
  P.tip = LAMPTIP; P.tipK = up; P.carry = CARRY; P.carryW = CARRY_W; P.poleW = undefined;
  P.torso = 0.06 + 0.12 * Math.max(0, up) + 0.14 * gust; P.head = -0.18 * Math.max(0, up);
  P.armF1 = -2.2 * gust; P.armF2 = -0.8 * gust;
  P.spr.eye = gust > 0.3 ? 'cat.eye.half' : T > 91.6 ? 'cat.eye.wide' : 'cat.eye.open';
  if (T > 92.2) { P.spr.eye = 'cat.eye.happy'; P.spr.mouth = 'cat.mouth.smile'; P.tail0 = 1.85 + 0.5 * ramp(T, 92.2, 92.6); }
  P.brow = gust * 0.4;
  idleCat(P, T);
  windOn(P, T, 0.3 + gust * 0.7);
  catItems(P, S.items, 16);
  flameOn(S, P, T, 'moon', 1 - 0.1 * gust);
  lampItems(WORLD.pierLamp, T, S, { moon: true, r: 420 });
  if (T > 91.5) for (let i = 0; i < 10; i++) {
    const u = (T - 91.5) / 0.9; if (u > 1) break;
    const a = i / 10 * TAU + 0.3;
    S.items.push(IT('spark', LAMPTIP[0] + Math.cos(a) * u * 90, LAMPTIP[1] - 10 + Math.sin(a) * u * 70 + u * u * 40, -0.02, { k: 1.4 * (1 - u), z: 300 }));
  }
  mothNear(S, P, T);
  S.dark.k = 0.62;
  return S;
}, { tin: { k: 'cut' } });

// S17 · общий план: луч над водой, лодка поворачивает к свету
shot(93.5, 101, (T, lt) => {
  const e = ramp(T, 93.5, 101, 'io');
  const cam = { x: lerp(5150, 4990, e), y: 520, dist: lerp(2.25, 1.55, e), zoom: 1, sy: 60 };
  const S = townScene(T, cam);
  moonItems(S, T, { lightR: 1100 });
  lampItems(WORLD.pierLamp, T, S, { moon: true, r: 520 });
  S.items.push({ s: 'beam', m: mTRS(WORLD.pierLamp.x, WORLD.pierLamp.y - 26, 0.03 + 0.02 * Math.sin(T * 0.8), 1, 1), d: -0.02, z: 5, add: true, a: 0.9 });
  boatNow(S, T, { arm: T > 97 ? -2.6 + 0.3 * Math.sin(T * 8) : 0.2 });
  const P = catBase();
  P.face = 1; P.x = 4660; P.ground = 680; P.spr = { eye: blinkAt(T, 4) ? 'cat.eye.closed' : 'cat.eye.happy', mouth: 'cat.mouth.smile' };
  P.hide = { pole: 1 }; P.armN1 = 0.1; P.armN2 = -0.2; P.armF1 = 0.15;
  if (T > 97.5) { const wv = ramp(T, 97.5, 97.8); P.armN1 = -2.6 * wv; P.armN2 = -0.3 + 0.35 * Math.sin(T * 9) * wv; }
  idleCat(P, T);
  catItems(P, S.items, 16);
  S.items.push(IT('cat.pole', 4700, 682, -0.005, { r: 0.12, z: 17 }));
  S.dark.k = 0.62;
  return S;
}, { tin: { k: 'dissolve', d: 0.8 } });

// S18 · лодка у пристани: мышонок снимает шляпу и бросает рыбу
shot(101, 108, (T, lt) => {
  const cam = { x: 4790, y: 560, dist: 0.74, zoom: 1, sy: 20 };
  const S = townScene(T, cam);
  moonItems(S, T);
  lampItems(WORLD.pierLamp, T, S, { moon: true, r: 420 });
  const hat = key(T, [[102.2, 0], [102.6, 1, 'out'], [103.2, 1], [103.5, 0]]);
  const toss = key(T, [[103.3, 0], [103.8, -0.6, 'io'], [104.0, 1, 'out'], [104.4, 0.6]]);
  boatNow(S, T, { arm: 0.2 - 2.5 * hat - 2.2 * Math.max(0, toss), hatOff: hat > 0.3, fish: T > 103.3 && T < 104.02, head: 0.15 * hat - 0.12, lean: 0.2 * hat });
  // рыба летит дугой к коту
  if (T >= 104.0 && T < 104.8) {
    const u = (T - 104.0) / 0.8, b = boatPos(T);
    const x = lerp(b.x - 20, 4712, u), y = lerp(Y_SEA - 64, 600, u) - 170 * 4 * u * (1 - u);
    S.items.push(IT('fish', x, y, lerp(b.d, 0, u) - 0.01, { r: u * 8, z: 400 }));
  }
  const P = catBase();
  P.face = 1; P.x = 4700; P.ground = 680; P.spr = {}; P.hide = { pole: 1 };
  P.armN1 = 0.1; P.armN2 = -0.2;
  const hop = key(T, [[104.35, 0], [104.5, -0.3], [104.8, 1, 'out'], [105.0, 0, 'in']]);
  if (hop > 0) { P.y = 680 - 52 - 26 * hop; delete P.ground; P.legN1 = -0.3 * hop; P.legN2 = 0.6 * hop; P.legF1 = 0.2 * hop; P.legF2 = 0.7 * hop; }
  else if (hop < 0) P.sy = 1 + 0.3 * hop;
  const reachUp = ramp(T, 104.3, 104.75);
  const got = T >= 104.8;
  if (!got) { P.armN1 = lerp(0.1, -2.7, reachUp); P.armN2 = lerp(-0.2, -0.4, reachUp); P.armF1 = lerp(0.15, -2.6, reachUp); P.armF2 = -0.4 * reachUp; P.head = -0.35 * reachUp; P.spr.eye = reachUp > 0.2 ? 'cat.eye.wide' : 'cat.eye.open'; }
  else {
    const hug = ramp(T, 104.8, 105.2);
    P.armN1 = lerp(-2.7, -0.9, hug); P.armN2 = lerp(-0.4, -1.5, hug); P.armF1 = lerp(-2.6, -0.8, hug); P.armF2 = lerp(-0.4, -1.4, hug);
    P.head = lerp(-0.35, 0.1, hug) + 0.04 * Math.sin(T * 3); P.spr.eye = 'cat.eye.happy'; P.spr.mouth = 'cat.mouth.smile';
    P.tail0 = 1.85 + 0.4 * hug; P.tail1 = 0.3 + 0.2 * Math.sin(T * 3); P.tail4 = 0.6;
    P.torso = 0.02 - 0.06 * hug + 0.02 * Math.sin(T * 6);
  }
  if (T < 104.3) { P.head = 0.12; P.pupilXY = [1.2, 1]; P.spr.eye = blinkAt(T, 9) ? 'cat.eye.closed' : 'cat.eye.open'; if (T > 102.6) P.spr.mouth = 'cat.mouth.smile'; }
  idleCat(P, T);
  catItems(P, S.items, 16);
  if (got && P._W) S.items.push({ s: 'fish', m: mMul(P._W.torso, mTRS(14, -30, -0.4, 0.95, 0.95)), d: 0, z: 16.115 });
  S.items.push(IT('cat.pole', 4745, 682, -0.005, { r: 0.1, z: 17 }));
  mothAt(S, WORLD.pierLamp.x + Math.cos(T * 2.5) * 34, WORLD.pierLamp.y - 30 + Math.sin(T * 3.3) * 20, -0.015, T, 1);
  S.dark.k = 0.6;
  return S;
}, { tin: { k: 'cut' } });

// S19 · финал: кран вверх — город в огнях, Луна без ломтика подмигивает; интертитр
shot(108, 118, (T, lt) => {
  const e = ramp(T, 108.2, 113.5, 'io3');
  const cam = { x: lerp(4760, 4450, e), y: lerp(560, 360, e), dist: lerp(0.9, 2.5, e), zoom: 1, sy: lerp(20, 300, e) };
  const S = townScene(T, cam);
  moonItems(S, T, { lightR: 1100 });
  lampItems(WORLD.pierLamp, T, S, { moon: true, r: 520 });
  S.items.push({ s: 'beam', m: mTRS(WORLD.pierLamp.x, WORLD.pierLamp.y - 26, 0.03, 1, 1), d: -0.02, z: 5, add: true, a: 0.7 });
  boatNow(S, T, { arm: T > 110.8 && T < 112 ? -2.4 + 0.3 * Math.sin(T * 9) : 0.2 });
  const P = catBase();
  P.face = 1; P.x = 4700; P.ground = 680; P.hide = { pole: 1 }; P.spr = { eye: 'cat.eye.happy', mouth: 'cat.mouth.smile' };
  P.armN1 = -0.9; P.armN2 = -1.5; P.armF1 = -0.8; P.armF2 = -1.4; P.tail0 = 2.2; P.tail4 = 0.6;
  const salute = ramp(T, 110.6, 111.0) * (1 - ramp(T, 112.4, 112.9));
  P.armN1 = lerp(-0.9, -2.8, salute); P.head = -0.3 * salute + 0.04 * Math.sin(T * 3);
  idleCat(P, T);
  catItems(P, S.items, 16);
  if (P._W) S.items.push({ s: 'fish', m: salute > 0.5 ? mMul(P._W.armN2, mTRS(0, 24, -1.2, 0.95, 0.95)) : mMul(P._W.torso, mTRS(14, -30, -0.4, 0.95, 0.95)), d: 0, z: 16.115 });
  S.items.push(IT('cat.pole', 4745, 682, -0.005, { r: 0.1, z: 17 }));
  // интертитр и «Конец»
  const card = ramp(T, 112.1, 112.8) * (1 - ramp(T, 115.0, 115.5));
  if (card > 0) S.screen.push({ s: 'card.moral', m: mTRS(800, 250 + 10 * (1 - card), -0.012, 0.94, 0.94), a: card });
  const end = ramp(T, 115.6, 116.2);
  if (end > 0) S.screen.push({ s: 'card.end', m: mTRS(800, 300 + 8 * (1 - end), 0.02, 1, 1), a: end });
  S.post.fade = ramp(T, 117.2, 118) * 0.85;
  S.dark.k = 0.6;
  return S;
}, { tin: { k: 'dissolve', d: 0.8 } });

/* шаги по доскам для звуковой дорожки */
function EXTRA_STEPS() {
  const out = [];
  for (const t of [32.62, 32.9, 33.18]) out.push({ t, s: 'wood', v: 0.12 });
  out.push({ t: 49.25, s: 'wood', v: 0.08 });
  out.push({ t: 104.95, s: 'wood', v: 0.16 });
  return out;
}
