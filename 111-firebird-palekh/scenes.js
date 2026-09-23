'use strict';
/* ==========================================================================
   Сцены «Пера Жар-птицы». Темп 96 ударов в минуту: такт 2/4 = 1,25 с.
   Все движения — функции времени; lt — время от начала плана.
   ========================================================================== */

/* ---------- помощники постановки ---------- */
/* Ставит фигуру на землю: самая низкая точка (стопа, колено или сиденье) касается gy */
function groundPose(po, gy) {
  const J = humanJoints(po), k = po.s / 100;
  let low = 5.5;
  for (const L of [J.legF, J.legB]) low = Math.max(low, L.A[1] + 3.8, L.K[1] + 3.4);
  po.y = gy - low * k;
  return po;
}
/* Ночь: затемнение с «дырами» света; огни в координатах мира */
function night(ctx, cam, dark, lights) {
  if (dark <= 0.003) return;
  const L = lights.map(([x, y, r, k]) => { const p = camPoint(cam, x, y); return [p[0], p[1], r * camScale(cam), k]; });
  Light.apply(ctx, R.base, dark, L);
}
function warm(ctx, x, y, r, a, spr) {
  ctx.globalCompositeOperation = 'lighter';
  drawGlow(ctx, spr || SPR.fire, x, y, r, a);
  ctx.globalCompositeOperation = 'source-over';
}
/* Полупрозрачная отрисовка сложной фигуры через буфер */
let ABUF = null;
function withAlpha(ctx, a, fn) {
  if (a <= 0.003) return;
  if (a >= 0.997) { fn(ctx); return; }
  const cv = ctx.canvas;
  if (!ABUF) ABUF = document.createElement('canvas');
  if (ABUF.width !== cv.width || ABUF.height !== cv.height) { ABUF.width = cv.width; ABUF.height = cv.height; }
  const b = ABUF.getContext('2d');
  b.setTransform(1, 0, 0, 1, 0, 0);
  b.clearRect(0, 0, ABUF.width, ABUF.height);
  b.setTransform(ctx.getTransform());
  fn(b);
  const m = ctx.getTransform();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = a;
  ctx.drawImage(ABUF, 0, 0);
  ctx.globalAlpha = 1;
  ctx.setTransform(m);
}
/* Перо в шапке Ивана */
function hatFeatherPos(po, J) {
  const a = J.headA, c = J.headC;
  const u = -4.6, v = -5.8;
  return humanWorld(po, [c[0] + u * Math.cos(a) - v * Math.sin(a), c[1] + u * Math.sin(a) + v * Math.cos(a)]);
}
function hatFeather(ctx, po, J, t, fire = 1, len) {
  const a = J.headA;
  const wp = hatFeatherPos(po, J);
  let ang = a - 2.2 + (po.rot || 0) * (po.dir || 1);
  if ((po.dir || 1) < 0) ang = PI - ang;
  drawFeather(ctx, P, wp[0], wp[1], ang, len || po.s * 0.34, t, { fire, barbs: 12, wk: 0.2, seed: 9 });
  return wp;
}
/* Кривая Безье по четырём точкам */
function bez(p0, p1, p2, p3, u) {
  const v = 1 - u;
  return [v * v * v * p0[0] + 3 * v * v * u * p1[0] + 3 * v * u * u * p2[0] + u * u * u * p3[0],
    v * v * v * p0[1] + 3 * v * v * u * p1[1] + 3 * v * u * u * p2[1] + u * u * u * p3[1]];
}
const human = (ctx, po, cos) => drawHuman(ctx, P, po, cos);

/* ---------- библиотека поз ---------- */
const PZ = {
  stand: pose({}),
  sleepSit: pose({ torso: -0.28, hF: 1.35, kF: 1.05, hB: 1.25, kB: 1.35, sF: 0.25, eF: 0.5, sB: 0.12, eB: 0.6, neck: 0.55, head: 0.35 }),
  sleepKnees: pose({ torso: 0.55, hF: 2.0, kF: 2.5, hB: 1.9, kB: 2.5, sF: 1.1, eF: 1.5, sB: 1.0, eB: 1.6, neck: 0.55, head: 0.4 }),
  hugKnees: pose({ torso: 0.12, hF: 1.95, kF: 2.45, hB: 1.85, kB: 2.4, sF: 1.25, eF: 1.35, sB: 1.15, eB: 1.45, neck: -0.25, head: -0.3, lookUp: 1 }),
  creep: pose({ torso: 0.62, hF: 0.95, kF: 1.55, hB: 0.1, kB: 1.1, sF: 1.0, eF: 0.7, sB: 0.4, eB: 0.9, neck: -0.45, head: -0.3, lookUp: 1 }),
  crouch: pose({ torso: 0.8, hF: 1.55, kF: 2.3, hB: 1.05, kB: 2.2, sF: 0.5, eF: 0.35, sB: -0.5, eB: 0.35, neck: -0.65, head: -0.35, lookUp: 1 }),
  leap: pose({ torso: 0.1, hF: 0.45, kF: 0.25, hB: -0.55, kB: 0.7, sF: 3.0, eF: 0.05, wF: 0, sB: -0.9, eB: 0.3, neck: -0.35, head: -0.35, hem: 1, fist: 0, lookUp: 1 }),
  hang: pose({ torso: 0.02, hF: 0.35, kF: 0.7, hB: -0.25, kB: 1.0, sF: 3.05, eF: 0.05, wF: 0, sB: 2.8, eB: 0.25, neck: -0.3, head: -0.35, fist: 1, hem: 0.6, lookUp: 1 }),
  fallBack: pose({ torso: -1.0, hF: 1.3, kF: 0.5, hB: 1.0, kB: 0.9, sF: 1.6, eF: 0.3, sB: -1.2, eB: 0.2, neck: 0.5, head: 0.3, hem: 0.6 }),
  sitReach: pose({ torso: -0.18, hF: 1.35, kF: 0.9, hB: 1.15, kB: 1.4, sF: 2.55, eF: 0.45, sB: 2.3, eB: 0.6, neck: -0.3, head: -0.4, lookUp: 1 }),
  sitHold: pose({ torso: 0.2, hF: 1.35, kF: 0.9, hB: 1.15, kB: 1.4, sF: 0.9, eF: 1.1, sB: 0.7, eB: 1.2, neck: 0.3, head: 0.25 }),
  raise: pose({ sF: 2.85, eF: 0.12, wF: 0, sB: 0.15, eB: 0.4, head: -0.15, lookUp: 0.5 }),
  point: pose({ sF: 1.72, eF: 0.04, wF: 0.05, sB: 0.1, eB: 0.5 }),
  pointPrep: pose({ sF: 0.5, eF: 1.6, wF: 0.2, sB: 0.1, eB: 0.5, torso: -0.08 }),
  ride: pose({ torso: 0.22, hF: 1.2, kF: 1.35, hB: 1.05, kB: 1.3, sF: 1.0, eF: 0.75, sB: 0.8, eB: 0.9, hem: 0.5 }),
  rideWolf: pose({ torso: 0.62, hF: 1.45, kF: 1.55, hB: 1.3, kB: 1.45, sF: 1.3, eF: 0.35, sB: 0.6, eB: 0.8, neck: -0.45, head: -0.25, hem: 1 }),
  grief: pose({ torso: 0.62, hF: 1.5, kF: 1.55, hB: 1.4, kB: 1.5, sF: 0.95, eF: 1.25, sB: 0.75, eB: 1.35, neck: 0.55, head: 0.45 }),
  sitUp: pose({ torso: 0.1, hF: 1.5, kF: 1.55, hB: 1.4, kB: 1.5, sF: 0.6, eF: 1.0, sB: 0.4, eB: 1.1, neck: -0.1, head: -0.1 }),
  hatOff: pose({ sF: 1.1, eF: 1.3, wF: 0.3, sB: 0.1, eB: 0.4 }),
  bow: pose({ torso: 1.38, hF: -0.36, kF: 0.08, hB: -0.47, kB: 0.12, sF: -1.05, eF: 0.22, sB: -1.2, eB: 0.3, neck: 0.22, head: 0.12, hem: 0.35 }),
  wave: pose({ sF: 2.7, eF: 0.45, wF: -0.2, sB: 0.1, eB: 0.4 }),
  handsUp: pose({ sF: 2.5, eF: 0.9, sB: 2.35, eB: 1.0, neck: -0.25, head: -0.1 }),
  reach: pose({ sF: 1.55, eF: 0.1, wF: 0.1, sB: 0.3, eB: 0.5, torso: 0.15, hF: 0.3, kF: 0.1, hB: -0.2, kB: 0.15 }),
  open: pose({ sF: 1.5, eF: 0.5, sB: 1.2, eB: 0.6, torso: -0.05 }),
};
/* плавный переход поз: kf = [[t, позa, easing], ...] */
const poseAt = (lt, kf) => key(lt, kf);

/* ==========================================================================
   СЦЕНА 1. САД
   ========================================================================== */
function* buildGarden() {
  const R = rng(2024);
  const back = new Pic(), mid = new Pic(), front = new Pic();
  const farEdge = 'rgba(200,215,235,0.28)';
  hill(back, -80, 430, 560, 150, { tones: TONES.far, peak: 0.55, seed: 1, gold: 2, edge: farEdge, comb: 20 });
  yield;
  hill(back, 1120, 1690, 560, 140, { tones: TONES.far, peak: 0.4, seed: 4, gold: 2, edge: farEdge, comb: 20 });
  yield;
  hill(back, 330, 820, 575, 105, { tones: TONES.far, peak: 0.4, seed: 2, gold: 2, edge: farEdge, comb: 16 });
  yield;
  hill(back, 720, 1260, 570, 165, { tones: TONES.far, peak: 0.52, seed: 3, gold: 2, edge: farEdge, comb: 24 });
  yield;
  for (const [x, h] of [[790, 96], [826, 124], [862, 92], [1206, 118], [1242, 146], [1276, 104]]) treeFir(back, x, 562 + (x % 7), h, { R, layers: 7 });
  yield;
  hill(back, 230, 800, 625, 108, { tones: TONES.olive, peak: 0.4, seed: 5 });
  yield;
  const pal = palace(back, 430, 540, 88);
  yield;
  treeRound(back, 300, 560, 130, { R, n: 9, leafR: 0.1 });
  yield;
  treeRound(back, 690, 575, 118, { R, n: 9, leafR: 0.1 });
  yield;
  hill(mid, -60, 540, 735, 132, { tones: TONES.olive, peak: 0.35, seed: 6 });
  yield;
  hill(mid, 1180, 1680, 720, 150, { tones: TONES.green, peak: 0.55, seed: 7 });
  yield;
  hill(mid, 560, 1260, 722, 118, { tones: TONES.green, peak: 0.5, seed: 8 });
  yield;
  treeRound(mid, 150, 756, 320, { R, lean: 0.05 });
  yield;
  treeRound(mid, 1450, 742, 350, { R, lean: -0.06, n: 18 });
  yield;
  bush(mid, 520, 712, 46, { R });
  yield;
  bush(mid, 1290, 706, 52, { R });
  yield;
  bush(mid, 700, 700, 40, { R });
  yield;
  bush(mid, 820, 694, 34, { R });
  yield;
  hill(front, 420, 1360, 935, 94, { tones: TONES.green, peak: 0.5, seed: 9, gold: 4 });
  yield;
  const hl = hill(front, -70, 640, 915, 178, { tones: TONES.ochre, peak: 0.72, seed: 10 });
  yield;
  const hr = hill(front, 1210, 1700, 918, 162, { tones: TONES.ochre, peak: 0.24, seed: 11 });
  yield;
  for (const u of [0.18, 0.34, 0.52, 0.66, 0.8]) { const [x, y] = hl.top(u); tulip(front, x, y + 14 + R() * 14, 30 + R() * 16, R() < 0.5 ? C.cinHi : C.wht, R); }
  for (const u of [0.2, 0.38, 0.55, 0.72]) { const [x, y] = hr.top(u); tulip(front, x, y + 14 + R() * 14, 28 + R() * 16, R() < 0.5 ? C.cinHi : C.wht, R); }
  for (let i = 0; i < 10; i++) { const [x, y] = (i % 2 ? hl : hr).top(0.1 + 0.8 * R()); grass(front, x, y + 22 + R() * 30, 16 + R() * 12, { R }); }
  const ord = (k) => (op) => clamp(((op.cx || (op.poly ? op.poly[0] : 0)) / W) * 0.6 + k + hash1(Math.floor((op.cy || 0) * 7)) * 0.1);
  back.order(ord(0)); mid.order(ord(0.15)); front.order(ord(0.3));
  const apple = new Pic();
  const tr = treeRound(apple, 1060, 748, 450, { R: rng(77), lean: 0.03, n: 26, rx: 0.33, ry: 0.27, leafR: 0.075, leaf: [C.emDeep, '#0c3a26', C.emLo, C.em] });
  apple.order(ord(0.2));
  const apples = [];
  const RA = rng(99);
  for (let i = 0; i < 16; i++) {
    const a = RA() * TAU, r = 0.25 + 0.75 * Math.sqrt(RA());
    apples.push([tr.cx + Math.cos(a) * tr.rx * r * 0.92, tr.cy + Math.sin(a) * tr.ry * r * 0.9 + 8, 7 + RA() * 3, RA() * TAU]);
  }
  apples.push([952, 486, 8.5, 1.3]); // яблоко, которое склюёт птица
  // камень, на котором сидит Иван
  const stone = new Pic();
  crossStone(stone, 905, 800, 64, 34);
  yield;
  return { back, mid, front, apple, apples, tree: tr, pal, stone, stars: makeStars(31, 110, 40, 40, 1560, 470) };
}
/* свечение у горизонта */
function drawHorizon(ctx, y, a = 1, col = '52,74,60') {
  const g = ctx.createLinearGradient(0, y - 170, 0, y + 40);
  g.addColorStop(0, `rgba(${col},0)`); g.addColorStop(0.7, `rgba(${col},${0.22 * a})`); g.addColorStop(1, `rgba(${col},${0.05 * a})`);
  ctx.fillStyle = g; ctx.fillRect(-500, y - 170, W + 1000, 210);
}
/* золотые яблоки */
function drawApples(ctx, list, t, glowK = 1, hide = -1) {
  list.forEach(([x, y, r, ph], i) => {
    if (i === hide) return;
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    g.addColorStop(0, '#fff3c4'); g.addColorStop(0.35, '#f0c35c'); g.addColorStop(0.8, '#b8791f'); g.addColorStop(1, '#6d4210');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(80,40,10,0.8)'; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x + 2, y - r - 5, x + 5, y - r - 7);
    ctx.strokeStyle = C.umb; ctx.lineWidth = 1.2; ctx.stroke();
    warm(ctx, x, y, r * 3.2, 0.13 * glowK * (0.8 + 0.2 * Math.sin(t * 2 + ph)), SPR.gold);
  });
}
/* Сад целиком. o: rv — прорисовка (0..1), dark, lights, light (для золота), actors — фигуры между средним и передним планом */
function drawGarden(ctx, t, cam, o = {}) {
  const G = lazy('garden', buildGarden);
  applyCam(ctx, R.base, cam);
  const rv = o.rv ?? 1;
  const sa = o.starA ?? sstep(0, 0.4, rv);
  drawStars(ctx, P, G.stars, t, sa, o.flare || 0);
  drawMoon(ctx, P, 1330, 150, 34, sa);
  drawHorizon(ctx, 560, sa);
  const L = o.light && rv >= 1 ? o.light : null;
  const rev = (pic, k) => { const p = clamp((rv - k) / 0.72); if (p >= 1) pic.draw(ctx, P, 1, L); else if (p > 0) pic.drawReveal(ctx, P, p); };
  rev(G.back, 0);
  rev(G.mid, 0.08);
  if (o.behind) o.behind(ctx);
  rev(G.apple, 0.14);
  if (rv > 0.5) drawApples(ctx, G.apples, t, sstep(0.55, 0.9, rv) * (o.appleGlow ?? 1), o.hideApple ?? -1);
  if (o.stone) G.stone.draw(ctx, P);
  if (o.actors) o.actors(ctx);
  rev(G.front, 0.22);
  if (o.over) o.over(ctx);
  if (o.dark) {
    night(ctx, cam, o.dark, o.lights || []);
    applyCam(ctx, R.base, cam);
  }
  if (o.top) o.top(ctx);
}

/* Сонное дыхание братьев: вдох-выдох каждые 2,5 с (два такта) */
const breath = (t, ph = 0) => Math.sin(((t + ph) / 2.5) * TAU);
function brothers(ctx, t) {
  const b1 = breath(t), b2 = breath(t, 1.1);
  const dm = Object.assign({}, PZ.sleepSit, { x: 182, s: 122, dir: 1, neck: 0.55 + 0.1 * b1, head: 0.35 + 0.06 * b1, torso: -0.28 + 0.03 * b1 });
  groundPose(dm, 776);
  human(ctx, dm, COSTUME.dmitri);
  const vs = Object.assign({}, PZ.sleepKnees, { x: 300, s: 120, dir: -1, torso: 0.55 + 0.04 * b2, neck: 0.55 + 0.05 * b2 });
  groundPose(vs, 768);
  human(ctx, vs, COSTUME.vasili);
  // копьё Василия, прислонённое к дереву
  ctx.save();
  brushLine(ctx, [[232, 772], [262, 560]], 2.4, C.umb, Prof.even);
  ctx.fillStyle = '#d9d2c0';
  ctx.beginPath(); ctx.moveTo(262, 560); ctx.lineTo(258, 540); ctx.lineTo(268, 520); ctx.lineTo(271, 541); ctx.closePath(); ctx.fill();
  ctx.restore();
}

/* ---------- 1.1 Титр ---------- */
function drawTitleText(ctx, t, a0, alpha) {
  const text = 'Перо Жар-птицы';
  ctx.save();
  ctx.font = '112px Ponomar, "Times New Roman", serif';
  ctx.textBaseline = 'alphabetic';
  const chars = [...text];
  const ws = chars.map((ch) => ctx.measureText(ch).width);
  const total = ws.reduce((a, b) => a + b, 0);
  let x = W / 2 - total / 2;
  const y = 450;
  const g = ctx.createLinearGradient(0, y - 90, 0, y + 20);
  g.addColorStop(0, '#fff0c2'); g.addColorStop(0.35, '#e9c06a'); g.addColorStop(0.62, '#b8842f'); g.addColorStop(0.8, '#f2d38a'); g.addColorStop(1, '#9a6a24');
  ctx.fillStyle = g;
  chars.forEach((ch, i) => {
    const a = clamp((t - a0 - i * 0.075) / 0.45);
    if (a > 0) { ctx.globalAlpha = Ease.outQ(a) * alpha; ctx.fillText(ch, x, y + (1 - Ease.outC(a)) * 10); }
    x += ws[i];
  });
  ctx.font = 'italic 30px Kurale, Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#c9a766';
  ctx.globalAlpha = sstep(a0 + 1.5, a0 + 2.3, t) * alpha;
  ctx.fillText('по мотивам русской народной сказки', W / 2, y + 62);
  ctx.restore();
}
function buildTitleOrn() {
  const pic = new Pic();
  const y = 548, cx = W / 2;
  for (const d of [-1, 1]) {
    pic.line([[cx + d * 18, y], [cx + d * 120, y - 4], [cx + d * 210, y + 3], [cx + d * 250, y - 6]], 1.4, 'gold', { prof: Prof.tail }).t0 = 0.05;
    pic.line(curlPts(cx + d * 258, y - 12, 9, d > 0 ? PI * 0.6 : PI * 0.4, 1.2, d > 0 ? -1 : 1), 1.3, 'gold', { prof: Prof.tail, seg: 3 }).t0 = 0.45;
    pic.line([[cx + d * 90, y - 3], [cx + d * 104, y - 16]], 4, 'gold', { prof: Prof.leaf }).t0 = 0.3;
    pic.line([[cx + d * 160, y + 1], [cx + d * 176, y + 12]], 4, 'gold', { prof: Prof.leaf }).t0 = 0.4;
  }
  const dm = pic.shape([[cx - 9, y], [cx, y - 8], [cx + 9, y], [cx, y + 8]], 'gold', { seg: 1 }); dm.t0 = 0;
  const dt = pic.dot(cx, y, 2.6, C.cin); dt.t0 = 0.1;
  return pic;
}
shot(0, 6.25, (ctx, t, lt) => {
  applyCam(ctx, R.base, { x: W / 2, y: H / 2, z: 1 });
  const fade = 1 - sstep(4.9, 6.1, lt);
  drawTitleText(ctx, t, 1.0, fade);
  const orn = lazy('titleOrn', buildTitleOrn);
  withAlpha(ctx, fade, (c) => { const p = inv(1.8, 3.4, lt); if (p >= 1) orn.draw(c, P); else if (p > 0) orn.drawReveal(c, P, p, { dur: 0.5 }); });
  // перо плывёт сквозь тьму
  const u = lt / 6.25;
  const fx = lerp(1330, 560, Ease.ioS(u)), fy = lerp(170, 660, u) + Math.sin(lt * 1.6) * 26;
  drawFeather(ctx, P, fx, fy, -0.95 + 0.28 * Math.sin(lt * 1.6 + 0.6), 150, t, { fire: sstep(0.2, 1.2, lt) * (0.75 + 0.25 * fade), barbs: 22, seed: 4 });
}, { name: 'title' });

/* ---------- 1.2 Сад проступает из лака ---------- */
cap(7.0, 12.2, 'В царском саду росли золотые яблоки. И каждую ночь кто-то их воровал.', 'top');
shot(6.25, 12.5, (ctx, t, lt) => {
  const cam = { x: key(lt, [[0, 800], [6.25, 830]]), y: key(lt, [[0, 450], [6.25, 462]]), z: key(lt, [[0, 1], [6.25, 1.07]]) };
  const rv = inv(0, 3.4, lt);
  drawGarden(ctx, t, cam, {
    rv,
    actors: (c) => { if (rv > 0.62) withAlpha(c, sstep(0.62, 0.9, rv), (cc) => { brothers(cc, t); ivanWatch(cc, t); }); },
    dark: 0.3 * sstep(0.8, 1, rv), lights: [[1330, 150, 500, 0.5]],
  });
}, { name: 'garden' });

/* Иван караулит: сидит на камне, обхватив колени */
function ivanWatch(ctx, t, o = {}) {
  let po = Object.assign({}, PZ.hugKnees, { x: 905, s: 128, dir: 1 });
  if (o.pose) po = Object.assign(po, o.pose);
  po.x = o.x ?? 905;
  groundPose(po, 792);
  const J = human(ctx, po, COSTUME.ivan);
  return [po, J];
}

/* ---------- 1.3 Братья спят, Иван не спит ---------- */
cap(12.9, 17.2, 'Старшие братья проспали. А младший, Иван, не сомкнул глаз.');
shot(12.5, 17.5, (ctx, t, lt) => {
  const cam = { x: key(lt, [[0, 262], [0.7, 262], [4.4, 858, 'ioC']]), y: key(lt, [[0, 650], [4.4, 668]]), z: 2.25 };
  // Иван клюёт носом и встряхивается
  const nod = key(lt, [[0, 0], [2.6, 0], [3.5, 0.75, 'inQ'], [3.62, -0.2, 'outQ'], [3.8, 0.15], [3.95, -0.12], [4.15, 0]]);
  const shake = key(lt, [[0, 0], [3.62, 0], [3.7, 0.3], [3.8, -0.3], [3.9, 0.25], [4.0, -0.2], [4.12, 0]]);
  drawGarden(ctx, t, cam, {
    stone: true,
    actors: (c) => {
      brothers(c, t);
      ivanWatch(c, t, { pose: { neck: -0.25 + nod * 0.9, head: -0.3 + nod * 0.5 + shake, lookUp: 1 - clamp(nod), torso: 0.12 + nod * 0.25 } });
    },
    dark: 0.3, lights: [[1330, 150, 600, 0.5]],
  });
}, { name: 'brothers' });

/* ---------- 1.4 Крупно: Иван видит свет ---------- */
function closeBackdrop(ctx, t, glowK, o = {}) {
  const st = lazy('closeStars', () => makeStars(57, 70, 40, 40, 1560, 860));
  drawStars(ctx, P, st, t, 0.8);
  // ветви яблони в углу
  const pic = lazy('closeLeaves', () => {
    const p = new Pic(), Rl = rng(5);
    for (let i = 0; i < 9; i++) leafFan(p, 1180 + i * 52 + Rl() * 30, 60 + Math.sin(i) * 40 + Rl() * 60, 70 + Rl() * 20, PI + 0.4 + Rl() * 0.6, [C.emDeep, '#0c3a26', C.emLo, C.em], Rl);
    for (let i = 0; i < 5; i++) leafFan(p, 1330 + i * 60, 190 + Rl() * 60, 60, PI + 0.8 + Rl() * 0.5, [C.emDeep, '#0c3a26', C.emLo, C.em], Rl);
    return p;
  });
  pic.draw(ctx, P, 1, o.light || null);
  drawApples(ctx, [[1260, 150, 16, 1], [1415, 240, 14, 2], [1520, 120, 15, 3]], t, glowK);
}
shot(17.5, 21.25, (ctx, t, lt) => {
  const cam = { x: key(lt, [[0, 800], [3.75, 820]]), y: key(lt, [[0, 450], [3.75, 440]]), z: key(lt, [[0, 1], [3.75, 1.07]]) };
  applyCam(ctx, R.base, cam);
  const g = sstep(0.7, 2.6, lt);
  closeBackdrop(ctx, t, 1 + g * 2, { light: [1350, 60, 700, g] });
  warm(ctx, 1400, 40, 700 * g, 0.4 * g);
  const rise = key(lt, [[0, 0], [2.4, 0], [3.6, -34, 'ioS']]);
  const lid = key(lt, [[0, 0.35], [0.9, 0.35], [1.02, 1], [1.14, 0.3], [1.9, 0.3], [2.3, 0, 'outQ']]);
  drawIvanClose(ctx, P, {
    x: 640, y: 520 + rise, s: 2.9, tilt: -0.1 - g * 0.05,
    look: [0.7, -1.3 - g * 0.3], lid, brow: g, mouth: key(lt, [[0, 0], [2.3, 0], [2.8, 1.8]]),
    light: [180, -220, g * 1.2], eyeFire: g * 0.8,
  }, t);
  sparks(ctx, t, { t0: 17.5 + 1.2, rate: 12, life: 2.5, seed: 21, size: 1.6, rise: -40, spread: 220, alpha: g, emit: (tb, i) => [1300 + hash1(i) * 260, 40 + hash1(i + 9) * 120] });
}, { name: 'ivanUp', fin: 0.12 });

/* ==========================================================================
   СЦЕНА 2. ПОЛНОЧЬ
   ========================================================================== */
const PERCH = [985, 452];
/* Птица на ветке: клюёт, тревожится */
function perchedBird(t, lt, o = {}) {
  const peck = o.peck || 0;
  return birdPose(Object.assign({
    x: PERCH[0], y: PERCH[1] + (o.dy || 0), s: 1.0, dir: -1, rot: -0.22,
    lift: -0.4, bend: 0.25, spread: 0.08, liftB: -0.35, spreadB: 0.1,
    neck: [0.25 + peck * 0.5, 0.45 + peck * 0.6, 0.55 + peck * 0.4], head: 0.25 + peck * 0.5, beak: o.beak || 0,
    tailA: 0.58 * PI, tailSpread: 0.95, tailCurl: 0.55, tailWave: 0.12, tailDroop: 0.72, tailLen: 1.05,
    glow: o.glow ?? 1, fire: o.fire ?? 1,
  }, o.extra || {}));
}
/* Полёт по кривой: точка, наклон, масштаб */
const ARRIVE = [[1500, 70], [1330, 140], [1250, 610], [PERCH[0], PERCH[1]]];
function arrivalBird(lt, t) {
  const u = Ease.outS(inv(0.3, 3.5, lt));
  const p = bez(...ARRIVE, u), q = bez(...ARRIVE, Math.min(1, u + 0.02));
  const sc = lerp(0.3, 1.0, Math.pow(u, 1.4));
  const land = sstep(3.1, 3.6, lt), settle = sstep(3.5, 4.3, lt);
  const f = flap(lt * 2.6, 1 - settle * 0.9);
  let rot = Math.atan2(q[1] - p[1], -(q[0] - p[0])) * 0.55 * (1 - land);
  rot = lerp(rot, -0.5, land * (1 - settle)) + settle * -0.22 * 1;
  const b = birdPose({
    x: p[0], y: p[1] - Math.sin(PI * settle) * 6, s: sc, dir: -1, rot,
    lift: lerp(f.lift, -0.4, settle), bend: lerp(f.bend, 0.25, settle), spread: lerp(lerp(f.spread, 1, land), 0.08, settle),
    liftB: lerp(f.liftB, -0.35, settle), spreadB: lerp(f.spreadB, 0.1, settle),
    neck: [lerp(0.95, 0.25, settle), lerp(0.1, 0.45, settle), lerp(0.2, 0.55, settle)], head: lerp(0.05, 0.25, settle),
    tailA: lerp(0.98 * PI, 0.58 * PI, sstep(3.0, 4.2, lt)), tailSpread: lerp(0.7, 0.95, settle), tailCurl: lerp(-0.4, 0.55, settle),
    tailWave: lerp(0.35, 0.12, settle), tailDroop: lerp(0.08, 0.72, sstep(3.2, 4.4, lt)), tailLen: 1.05, lean: 0.5 * (1 - settle),
    glow: sstep(0.2, 1.2, lt), fire: 1,
  });
  void t;
  return b;
}
shot(21.25, 26.25, (ctx, t, lt) => {
  const cam = { x: key(lt, [[0, 820], [5, 850]]), y: key(lt, [[0, 445], [5, 452]]), z: key(lt, [[0, 1.0], [5, 1.08]]) };
  const b = arrivalBird(lt, t);
  const lk = sstep(0.3, 2.0, lt);
  const rad = lerp(180, 560, sstep(0.5, 3.8, lt));
  let bw = null;
  drawGarden(ctx, t, cam, {
    stone: true, flare: bump(0.4, 1.0, 1.4, 2.4, lt), appleGlow: 1 + lk * 2,
    light: [b.x, b.y, rad * 1.2, lk],
    actors: (c) => {
      brothers(c, t);
      const upk = sstep(1.0, 2.0, lt);
      ivanWatch(c, t, { pose: mix(PZ.hugKnees, Object.assign({}, PZ.hugKnees, { torso: -0.05, neck: -0.45, head: -0.45, lookUp: 1 }), upk) });
    },
    over: (c) => {
      // след огня за птицей
      sparks(c, t, { t0: t - lt + 0.3, t1: t - lt + 3.6, rate: 40, life: 1.2, seed: 7, size: 2, rise: 20, spread: 30, alpha: 1,
        emit: (tb) => { const u2 = Ease.outS(inv(0.3, 3.5, tb - (t - lt))); return bez(...ARRIVE, u2); } });
      bw = drawBird(c, P, b, t);
    },
    dark: 0.42, lights: [[b.x, b.y, rad, lk], [1330, 150, 400, 0.4]],
    top: (c) => { warm(c, b.x, b.y, rad * 0.9, 0.22 * lk); },
  });
  void bw;
}, { name: 'arrival' });

/* ---------- 2.2 Птица клюёт, Иван подкрадывается ---------- */
function creepIvan(lt) {
  const x = key(lt, [[0, 730], [2.9, 878, 'ioS']]);
  const ph = key(lt, [[0, 0], [2.9, 1.6, 'ioS']]);
  const s = Math.sin(ph * TAU);
  const wp = Object.assign({}, PZ.creep, { hF: 0.95 + 0.35 * s, kF: 1.55 - 0.25 * s, hB: 0.1 - 0.35 * s, kB: 1.1 + 0.3 * s, sF: 1.0 + 0.2 * s, sB: 0.4 - 0.2 * s });
  const cr = sstep(3.0, 3.7, lt);
  const po = Object.assign(mix(wp, PZ.crouch, cr), { x, s: 128, dir: 1 });
  return po;
}
shot(26.25, 30, (ctx, t, lt) => {
  const cam = { x: key(lt, [[0, 930], [3.75, 952]]), y: key(lt, [[0, 575], [3.75, 580]]), z: key(lt, [[0, 1.78], [3.75, 1.86]]) };
  const pk = (c) => Math.max(0, Math.sin(clamp((lt - c) / 0.5) * PI));
  const peck = pk(0.625) + pk(1.25) + pk(1.875);
  const alert = sstep(2.5, 2.8, lt);
  const b = perchedBird(t, lt, { peck: peck * (1 - alert), beak: peck * 0.5, extra: { head: 0.25 + peck * 0.5 - alert * 0.35, neck: [0.25 + peck * 0.5 - alert * 0.2, 0.45 + peck * 0.6, 0.55 + peck * 0.4 - alert * 0.3] } });
  drawGarden(ctx, t, cam, {
    stone: true, appleGlow: 3, hideApple: lt > 1.9 ? 16 : -1,
    light: [b.x, b.y, 620, 1],
    actors: (c) => {
      brothers(c, t);
      const po = creepIvan(lt);
      groundPose(po, 800);
      human(c, po, COSTUME.ivan);
    },
    over: (c) => { drawBird(c, P, b, t); if (lt > 1.8 && lt < 2.6) sparks(c, t, { t0: t - lt + 1.85, t1: t - lt + 2.0, rate: 60, life: 0.8, seed: 3, size: 1.6, rise: 30, spread: 40, emit: () => [952, 486] }); },
    dark: 0.38, lights: [[b.x, b.y, 560, 1]],
    top: (c) => warm(c, b.x, b.y, 420, 0.2),
  });
}, { name: 'creep' });

/* ---------- 2.3 Прыжок: Иван хватает птицу за хвост ---------- */
const GRAB_T = 0.5, TEAR_T = 1.85;
shot(30, 32.5, (ctx, t, lt) => {
  const shake = bump(GRAB_T, GRAB_T + 0.05, TEAR_T, TEAR_T + 0.3, lt) * 3.2;
  const cam = {
    x: key(lt, [[0, 952], [0.5, 950], [2.5, 935]]) + Math.sin(lt * 53) * shake,
    y: key(lt, [[0, 580], [0.5, 560], [2.5, 560]]) + Math.cos(lt * 47) * shake,
    z: key(lt, [[0, 1.86], [0.5, 2.05, 'outQ'], [2.5, 1.95]]),
  };
  // Иван: присед → прыжок → вис → падение
  let po;
  const hand = [0, 0];
  if (lt < GRAB_T) {
    const u = lt / GRAB_T;
    po = Object.assign(mix(PZ.crouch, PZ.leap, Ease.outQ(clamp(u * 1.6))), { x: lerp(878, 905, u), s: 128, dir: 1 });
    groundPose(po, 800);
    po.y -= Ease.outQ(u) * 95;
  } else if (lt < TEAR_T) {
    const u = (lt - GRAB_T) / (TEAR_T - GRAB_T);
    const kick = Math.sin(lt * 17) * 0.35;
    po = Object.assign({}, PZ.hang, { x: 905 + Math.sin(lt * 9) * 6, s: 128, dir: 1, hF: 0.35 + kick, hB: -0.25 - kick, kF: 0.7 + kick * 0.5 });
    groundPose(po, 800);
    po.y -= 95 + Math.sin(u * PI) * 22 + Math.sin(lt * 13) * 4;
  } else {
    const u = clamp((lt - TEAR_T) / 0.45);
    po = Object.assign(mix(PZ.hang, PZ.fallBack, Ease.outQ(u)), { x: lerp(905, 880, u), s: 128, dir: 1 });
    groundPose(po, 800);
    po.y -= (1 - Ease.inQ(u)) * 95 - Math.sin(u * PI) * 0;
    po.rot = -0.2 * u;
  }
  const J = humanJoints(po);
  const hw = humanWorld(po, J.armF.H);
  hand[0] = hw[0]; hand[1] = hw[1];
  // птица бьётся
  const panic = sstep(GRAB_T, GRAB_T + 0.12, lt);
  const flee = sstep(TEAR_T, TEAR_T + 0.6, lt);
  const f = flap(lt * 5.2, 1);
  const b = perchedBird(t, lt, {
    extra: {
      x: PERCH[0] - flee * 30, y: PERCH[1] - panic * 26 - flee * 420,
      lift: lerp(-0.4, f.lift, panic), bend: lerp(0.25, f.bend, panic), spread: lerp(0.08, f.spread, panic), liftB: lerp(-0.35, f.liftB, panic), spreadB: lerp(0.1, f.spreadB, panic),
      rot: lerp(-0.22, -0.55, panic) + flee * -0.3, neck: [lerp(0.25, 1.1, panic), lerp(0.45, -0.2, panic), 0.2], head: lerp(0.25, -0.3, panic), beak: panic * (1 - flee) * (0.6 + 0.4 * Math.sin(lt * 20)),
      tailDroop: lerp(0.72, 0.35, panic), tailWave: lerp(0.12, 0.4, panic), grabW: lt >= GRAB_T && lt < TEAR_T ? hand : null,
      glow: 1 + panic * 0.5,
    },
  });
  drawGarden(ctx, t, cam, {
    stone: true, appleGlow: 3, hideApple: 16,
    light: [b.x, b.y, 640, 1 - flee * 0.6],
    actors: (c) => {
      brothers(c, t);
      human(c, po, COSTUME.ivan);
      // шапка слетает
      if (lt > GRAB_T + 0.05) {
        const u = clamp((lt - GRAB_T - 0.05) / 1.1);
        const hx = lerp(hand[0] - 20, hand[0] - 150, u), hy = hand[1] - 30 - Math.sin(u * PI) * 60 + u * u * 200;
        hatProp(c, hx, Math.min(hy, 788), 128, u * 7);
      }
    },
    over: (c) => {
      drawBird(c, P, b, t);
      if (lt > TEAR_T - 0.02 && lt < TEAR_T + 0.9) {
        warm(c, hand[0], hand[1] - 30, 380 * (1 - clamp((lt - TEAR_T) / 0.9)), 0.8);
        sparks(c, t, { t0: t - lt + TEAR_T, t1: t - lt + TEAR_T + 0.25, rate: 160, life: 1.0, seed: 41, size: 2.4, rise: 160, spread: 260, emit: () => [hand[0] + 20, hand[1] - 40] });
      }
      // вырванное перо взлетает
      if (lt > TEAR_T) {
        const u = clamp((lt - TEAR_T) / 0.65);
        drawFeather(c, P, lerp(hand[0] + 10, 960, u), lerp(hand[1] - 30, 380, Ease.outQ(u)), -1.2 + u * 4, 64, t, { fire: 1, barbs: 14, seed: 12 });
      }
    },
    dark: 0.4, lights: [[b.x, b.y, 580, 1 - flee * 0.5], [hand[0], hand[1], 260, panic]],
    top: (c) => warm(c, b.x, b.y, 440, 0.24 * (1 - flee)),
  });
}, { name: 'grab' });

/* шапка Ивана как отдельный предмет */
function hatProp(ctx, x, y, s, rot) {
  const k = s / 100;
  ctx.save();
  ctx.translate(x, y); ctx.rotate(rot); ctx.scale(k, k);
  const crown = sp([[-4.9, -3.4], [-4.5, -7.2], [-1.4, -10.2], [2.2, -9.4], [4.6, -6.4], [4.6, -3.6]]);
  ctx.fillStyle = C.cin; ctx.fill(crown);
  const band = new Path2D(); limb(band, [-5.3, -3.3], [5.0, -3.9], 3.1, 3.1);
  ctx.fillStyle = '#3b2413'; ctx.fill(band);
  ctx.fillStyle = P.gold; ctx.beginPath(); ctx.arc(-1.2, -10.4, 0.9, 0, TAU); ctx.fill();
  ctx.restore();
}

/* ---------- 2.4 Птица улетает, перо опускается ---------- */
function fallingFeather(lt) {
  const u = clamp(lt / 2.5);
  const sw = Math.sin(lt * 3.1) * (1 - u * 0.7);
  return { x: 930 + sw * 70, y: lerp(360, 690, Ease.inS(u)), a: -1.6 + sw * 0.9, u };
}
shot(32.5, 35, (ctx, t, lt) => {
  const cam = { x: key(lt, [[0, 920], [2.5, 905]]), y: key(lt, [[0, 470], [2.5, 520]]), z: key(lt, [[0, 1.3], [2.5, 1.42]]) };
  const u = Ease.inQ(clamp(lt / 1.9));
  const bp = bez([960, 170], [1100, 60], [1320, 120], [1470, 70], u);
  const f = flap(lt * 4, 1);
  const b = birdPose(Object.assign({ x: bp[0], y: bp[1], s: lerp(0.8, 0.12, u), dir: 1, rot: -0.35, tailA: 0.98 * PI, tailDroop: 0.08, tailSpread: 0.6, tailWave: 0.35, tailCurl: -0.4, neck: [0.95, 0.1, 0.2], head: 0.05, lean: -0.5 }, f));
  const fe = fallingFeather(lt);
  drawGarden(ctx, t, cam, {
    stone: true, appleGlow: 2, hideApple: 16, flare: bump(1.7, 1.9, 2.0, 2.5, lt),
    light: [fe.x, fe.y, 300, 0.8],
    actors: (c) => {
      brothers(c, t);
      const reach = sstep(0.4, 1.4, lt);
      const po = Object.assign(mix(PZ.fallBack, PZ.sitReach, reach), { x: 880, s: 128, dir: 1 });
      groundPose(po, 800);
      human(c, po, COSTUME.ivan);
      hatProp(c, 745, 790, 128, 7);
    },
    over: (c) => {
      if (u < 1) drawBird(c, P, b, t);
      if (lt > 1.8 && lt < 2.5) { const k = bump(1.8, 1.9, 2.0, 2.5, lt); warm(c, 1470, 70, 160 * k, k, SPR.white); }
      drawFeather(c, P, fe.x, fe.y, fe.a, 64, t, { fire: 1, barbs: 14, seed: 12 });
    },
    dark: 0.44, lights: [[b.x, b.y, 400 * (1 - u), 1 - u], [fe.x, fe.y, 330, 1]],
    top: (c) => warm(c, fe.x, fe.y, 200, 0.3),
  });
}, { name: 'escape' });

/* ---------- 2.5 Крупно: перо в ладонях ---------- */
cap(36.1, 39.8, 'Птица улетела. А перо осталось — и горело, как живой огонь.');
shot(35, 40, (ctx, t, lt) => {
  const cam = { x: key(lt, [[0, 800], [5, 780]]), y: key(lt, [[0, 470], [5, 500]]), z: key(lt, [[0, 1.0], [5, 1.1]]) };
  applyCam(ctx, R.base, cam);
  const land = sstep(0.0, 0.95, lt);
  const flare = 1 + 0.45 * bump(0.85, 1.0, 1.1, 1.9, lt);
  const fx = lerp(760, 700, land) + Math.sin(lt * 3) * 60 * (1 - land), fy = lerp(90, 720, Ease.outQ(land));
  const fa = lerp(-1.4 + Math.sin(lt * 3) * 0.6, -0.32, land);
  const fl = 0.8 + 0.2 * vnoise(t * 7) + 0.1 * Math.sin(t * 13);
  closeBackdrop(ctx, t, 2.5, { light: [fx, fy, 900, 0.9 * land] });
  drawIvanClose(ctx, P, {
    x: 690, y: 400, s: 2.35, tilt: 0.06,
    look: [0.3, lerp(0.6, 1.4, land)], lid: lerp(0.1, 0.32, land), smile: sstep(1.4, 3.2, lt) * 0.9, brow: 0.3 * (1 - land),
    hands: true, handsY: 150, light: [0, 150, (0.5 + 0.7 * land) * fl * flare],
  }, t);
  drawFeather(ctx, P, fx - 150 * land, fy - 10, fa, 330, t, { fire: flare * (0.7 + 0.3 * land), barbs: 34, seed: 2 });
}, { name: 'featherClose' });

/* ==========================================================================
   СЦЕНА 3. РАСПУТЬЕ
   ========================================================================== */
/* ---------- 3.1 Крыльцо терема: царь велит добыть птицу ---------- */
function* buildPorch() {
  const R = rng(3100);
  const back = new Pic(), front = new Pic();
  hill(back, -100, 700, 700, 120, { tones: TONES.far, peak: 0.3, seed: 31, gold: 2, edge: 'rgba(200,215,235,0.28)' });
  yield;
  hill(back, 600, 1700, 690, 150, { tones: TONES.far, peak: 0.62, seed: 32, gold: 2, edge: 'rgba(200,215,235,0.28)' });
  yield;
  for (const [x, h] of [[1010, 130], [1060, 170], [1110, 120], [1420, 150], [1470, 190]]) treeFir(back, x, 680, h, { R, layers: 8 });
  yield;
  hill(back, -100, 1700, 800, 110, { tones: TONES.olive, peak: 0.5, seed: 33, gold: 8, flat: 0.35 });
  yield;
  const pal = palace(back, 330, 752, 250);
  yield;
  treeRound(back, 1300, 790, 330, { R, n: 18 });
  yield;
  bush(back, 820, 780, 60, { R });
  yield;
  bush(back, 1480, 780, 70, { R });
  yield;
  hill(front, -100, 560, 930, 110, { tones: TONES.green, peak: 0.6, seed: 34, gold: 5 });
  yield;
  hill(front, 1150, 1700, 940, 120, { tones: TONES.ochre, peak: 0.3, seed: 35 });
  yield;
  for (let i = 0; i < 7; i++) tulip(front, 1180 + i * 55 + R() * 20, 905 - Math.sin(i) * 20, 34 + R() * 14, i % 2 ? C.cinHi : C.wht, R);
  yield;
  return { back, front, pal, stars: makeStars(310, 90, 40, 40, 1560, 520) };
}
cap(40.9, 44.8, '— Мало мне пера, — сказал царь. — Добудь саму Жар-птицу!', 'top');
shot(40, 45, (ctx, t, lt) => {
  const S3 = lazy('porch', buildPorch);
  const cam = { x: key(lt, [[0, 820], [5, 800]]), y: key(lt, [[0, 470], [5, 480]]), z: key(lt, [[0, 1.05], [5, 1.12]]) };
  applyCam(ctx, R.base, cam);
  drawStars(ctx, P, S3.stars, t, 1);
  drawMoon(ctx, P, 1380, 140, 30);
  drawHorizon(ctx, 690);
  // Иван поднимает перо: упреждение — чуть присесть, потом вытянуться
  const up = key(lt, [[0, 0], [0.25, -0.12, 'ioS'], [0.95, 1, 'outBackS']]);
  const iv = mix(Object.assign({}, PZ.stand, { sF: 0.9, eF: 1.0 }), PZ.raise, clamp(up));
  Object.assign(iv, { x: 1010, s: 150, dir: -1, torso: 0.02 - Math.min(0, up) * 0.4, head: -0.2 * clamp(up) });
  if (lt > 3.9) Object.assign(iv, mix(iv, Object.assign({}, PZ.stand, { sF: 0.4, eF: 0.8 }), sstep(3.9, 4.8, lt)), { x: 1010, s: 150, dir: -1 });
  groundPose(iv, 842);
  const J = humanJoints(iv);
  const hand = humanWorld(iv, J.armF.H);
  const lightK = sstep(0.4, 1.4, lt);
  S3.back.draw(ctx, P, 1, [hand[0], hand[1], 900 * lightK + 80, lightK]);
  // окна загораются от пера: ближние раньше
  S3.pal.win.forEach((w, i) => {
    const k = sstep(0.8 + (6 - i % 7) * 0.08, 1.5 + (6 - i % 7) * 0.08, lt);
    if (k > 0) { ctx.globalAlpha = k * (0.85 + 0.15 * Math.sin(t * 7 + i)); ctx.fillStyle = '#ffb347'; ctx.fill(w.path); ctx.globalAlpha = 1; warm(ctx, w.cx, w.cy, 26, 0.35 * k); }
  });
  // царь на крыльце
  const pt = key(lt, [[0, 0], [1.9, 0], [2.3, 1, 'ioS'], [2.52, 2, 'outBack']]);
  let ts;
  if (pt < 1) ts = mix(Object.assign({}, PZ.open, { torso: 0.12 }), PZ.pointPrep, pt);
  else ts = mix(PZ.pointPrep, Object.assign({}, PZ.point, { torso: 0.05 }), clamp(pt - 1));
  const wonder = sstep(0.8, 1.6, lt) * (1 - sstep(1.9, 2.3, lt));
  Object.assign(ts, { x: 572, s: 150, dir: 1, sway: Math.sin(t * 2) * 0.05 });
  ts.torso = (ts.torso || 0) + wonder * 0.12;
  groundPose(ts, S3.pal.porch[1] + 2);
  human(ctx, ts, COSTUME.tsar);
  human(ctx, iv, COSTUME.ivan);
  drawFeather(ctx, P, hand[0], hand[1] + 4, -1.45 - 0.3 * (1 - clamp(up)), 88, t, { fire: 0.85 + 0.35 * lightK, barbs: 20, seed: 14 });
  S3.front.draw(ctx, P, 1, [hand[0], hand[1], 700, lightK * 0.8]);
  night(ctx, cam, 0.45, [[hand[0], hand[1], 380 + 520 * lightK, 1], [330, 520, 500 * lightK, lightK * 0.9]]);
  applyCam(ctx, R.base, cam);
  warm(ctx, hand[0], hand[1], 380, 0.35);
}, { name: 'tsar' });

/* ---------- панорама дороги: слои с параллаксом ---------- */
function* buildRoad(seed, o = {}) {
  const R = rng(seed);
  const far = new Pic(), mid = new Pic(), near = new Pic(), fore = new Pic();
  const X0 = -600, X1 = o.len || 4200;
  for (let x = X0; x < X1; x += 420 + R() * 200) { hill(far, x, x + 560 + R() * 260, 600, 110 + R() * 90, { tones: TONES.far, peak: 0.3 + R() * 0.4, seed: Math.floor(x), gold: 2, comb: 8, terr: 1, edge: 'rgba(200,215,235,0.26)' }); yield; }
  yield;
  for (let x = X0; x < X1; x += 380 + R() * 180) {
    hill(mid, x, x + 520 + R() * 200, 700, 100 + R() * 80, { tones: R() < 0.5 ? TONES.olive : TONES.green, peak: 0.3 + R() * 0.4, seed: Math.floor(x) + 3, gold: 5, comb: 26, terr: 2 });
    yield;
    const k = Math.floor(R() * 3);
    for (let j = 0; j < k; j++) treeFir(mid, x + 120 + j * 44 + R() * 20, 640 + R() * 20, 90 + R() * 60, { R, layers: 7 });
    yield;
    if (R() < 0.4) treeRound(mid, x + 300 + R() * 100, 660, 150 + R() * 40, { R, n: 10, leafR: 0.1 });
    yield;
  }
  if (o.river) waves(mid, X0, X1, 712, 3, { R, gap: 13, step: 40 });
  for (let x = X0; x < X1; x += 300 + R() * 160) {
    hill(near, x, x + 460 + R() * 160, 860, 90 + R() * 60, { tones: R() < 0.6 ? TONES.ochre : TONES.olive, peak: 0.3 + R() * 0.4, seed: Math.floor(x) + 7, gold: 5, comb: 30, terr: 2 });
    yield;
    if (R() < 0.6) tulip(near, x + 200 + R() * 100, 830 + R() * 20, 30 + R() * 12, R() < 0.5 ? C.cinHi : C.wht, R);
    if (R() < 0.5) grass(near, x + 120 + R() * 200, 846, 18, { R });
    yield;
  }
  for (let x = X0; x < X1 * 1.4; x += 700 + R() * 500) treeFir(fore, x, 940, 360 + R() * 160, { R, layers: 10, tones: ['#06140e', '#0a2319', '#0f3324'] });
  yield;
  return { far, mid, near, fore, stars: makeStars(seed + 1, 90, 40, 40, 1560, 540) };
}
/* Слой с параллаксом: k — скорость относительно камеры */
/* o.light — источник в координатах основной камеры, o.dx — сдвиг слоя */
function drawLayer(ctx, pic, cam, k, o = {}) {
  const c2 = { x: cam.x * k + W / 2 * (1 - k) + (o.dx || 0), y: cam.y, z: cam.z };
  applyCam(ctx, R.base, c2);
  const L = o.light ? [o.light[0] - (cam.x - c2.x), o.light[1], o.light[2], o.light[3]] : null;
  pic.draw(ctx, P, 1, L);
  return c2;
}

/* ---------- 3.2 Иван скачет в ночь, перо в шапке освещает путь ---------- */
shot(45, 50, (ctx, t, lt) => {
  const S = lazy('road', () => buildRoad(4500, { len: 4200 }));
  const hx = 520 + lt * 380;
  const cam = { x: hx + 120, y: 520, z: 1.25 };
  applyCam(ctx, R.base, { x: W / 2, y: 450, z: 1 });
  drawStars(ctx, P, S.stars, t, 1);
  drawMoon(ctx, P, 1320, 150, 28);
  drawHorizon(ctx, 600);
  // сначала поза и перо в шапке: от пера светятся слои
  const ph = lt * 2.1;
  const hq = gallopPose(ph, { x: hx, y: 718, s: 1.55, dir: 1, neck: 0.5, head: 0.75 }, 0.6);
  const sd = quadAt(hq, 'horse', [0, SPECIES.horse.top - 2]);
  const bounce = Math.sin(ph * TAU * 2 + 0.6) * 4;
  const iv = Object.assign({}, PZ.ride, { x: sd[0] - 4, y: sd[1] - 18 + bounce, s: 132, dir: 1, sway: Math.sin(ph * TAU) * 0.2, hem: 0.7 });
  const fp = hatFeatherPos(iv, humanJoints(iv));
  drawLayer(ctx, S.far, cam, 0.25);
  drawLayer(ctx, S.mid, cam, 0.6, { light: [fp[0], fp[1], 520, 0.7] });
  applyCam(ctx, R.base, cam);
  drawQuad(ctx, P, hq, 'horse', t, { saddle: C.em });
  const J = human(ctx, iv, COSTUME.ivan);
  hatFeather(ctx, iv, J, t, 1, 44);
  sparks(ctx, t, { t0: 45, rate: 30, life: 1.1, seed: 33, size: 1.6, rise: 20, spread: 30, wind: -300, emit: (tb) => [520 + (tb - 45) * 380 + 20, 540] });
  const cn = drawLayer(ctx, S.near, cam, 1, { light: [fp[0], fp[1] + 160, 420, 0.9] });
  drawLayer(ctx, S.fore, cam, 1.5);
  night(ctx, cn, 0.5, [[fp[0], fp[1], 420, 1]]);
  applyCam(ctx, R.base, cam);
  warm(ctx, fp[0], fp[1], 300, 0.35);
}, { name: 'rideOut', dis: 0.5 });

/* ---------- 3.3 Камень на распутье ---------- */
function* buildCross() {
  const R = rng(3300);
  const back = new Pic(), mid = new Pic(), front = new Pic(), stone = new Pic();
  hill(back, -100, 620, 590, 130, { tones: TONES.far, peak: 0.4, seed: 41, gold: 2, edge: 'rgba(200,215,235,0.28)' });
  yield;
  hill(back, 500, 1150, 600, 110, { tones: TONES.far, peak: 0.5, seed: 42, gold: 2, edge: 'rgba(200,215,235,0.28)' });
  yield;
  hill(back, 1000, 1700, 585, 150, { tones: TONES.far, peak: 0.55, seed: 43, gold: 2, edge: 'rgba(200,215,235,0.28)' });
  yield;
  hill(mid, -100, 800, 700, 110, { tones: TONES.olive, peak: 0.35, seed: 44 });
  yield;
  hill(mid, 700, 1700, 690, 140, { tones: TONES.green, peak: 0.6, seed: 45 });
  yield;
  // три дороги: охристые полосы сходятся к зрителю и сужаются к горизонту,
  // по краю — золотая кромка, по середине — светлая колея
  const road = (pts) => {
    const taper = (u) => Math.pow(1 - u, 1.15) * 0.94 + 0.06;
    mid.line(pts, 118, '#5e4526', { prof: taper, seg: 8 });
    mid.line(pts, 118, 'rgba(214,172,104,0.42)', { prof: (u) => taper(u) * 0.62, seg: 8 });
    const L = spline(pts, 8), n = L.length / 2;
    for (const sd of [-1, 1]) {
      const e = [];
      for (let i = 0; i < n; i += 2) {
        const u = i / (n - 1), j = Math.min(i, n - 2);
        let tx = L[2 * j + 2] - L[2 * j], ty = L[2 * j + 3] - L[2 * j + 1];
        const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
        const hw = 59 * taper(u) * 0.97;
        e.push([L[2 * i] - ty * hw * sd, L[2 * i + 1] + tx * hw * sd]);
      }
      mid.line(e, 1.3, 'gold', { prof: Prof.hair, seg: 2 });
    }
  };
  road([[770, 905], [705, 790], [575, 702], [420, 628]]);
  road([[800, 905], [793, 780], [778, 700], [768, 652]]);
  road([[830, 905], [920, 800], [1090, 722], [1265, 676]]);
  // тёмный лес справа
  for (let i = 0; i < 9; i++) treeFir(mid, 1220 + i * 46 + R() * 20, 640 + (i % 2) * 20, 180 + R() * 110, { R, layers: 9 });
  yield;
  treeRound(mid, 180, 700, 250, { R, n: 14 });
  yield;
  hill(front, -100, 560, 950, 150, { tones: TONES.ochre, peak: 0.55, seed: 46 });
  yield;
  hill(front, 1100, 1700, 960, 170, { tones: TONES.ochre, peak: 0.4, seed: 47 });
  yield;
  for (let i = 0; i < 8; i++) grass(front, 60 + i * 60 + R() * 20, 860 + R() * 30, 20, { R });
  yield;
  const st = crossStone(stone, 985, 784, 290, 212);
  yield;
  return { back, mid, front, stone, st, stars: makeStars(330, 100, 40, 40, 1560, 520) };
}
/* надпись на камне прорисовывается кистью */
function stoneText(ctx, S, p, a = 1) {
  if (p <= 0) return;
  const lines = ['Направо поедешь —', 'коня потеряешь,', 'налево — сам пропадёшь'];
  ctx.save();
  ctx.font = '21px Ponomar, "Times New Roman", serif';
  ctx.textAlign = 'left';
  const y0 = S.st.y - 32;
  const n = lines.join('').length;
  let idx = 0;
  lines.forEach((ln, li) => {
    const w = ctx.measureText(ln).width;
    let x = S.st.x + 4 - w / 2;
    for (const ch of ln) {
      const k = clamp(p * n * 1.1 - idx);
      if (k > 0) { ctx.globalAlpha = k * a; ctx.fillStyle = P.gold; ctx.fillText(ch, x, y0 + li * 27); }
      x += ctx.measureText(ch).width; idx++;
    }
  });
  ctx.restore();
}
function drawCross(ctx, t, cam, o = {}) {
  const S = lazy('cross', buildCross);
  applyCam(ctx, R.base, cam);
  const dawn = o.dawn || 0;
  drawStars(ctx, P, S.stars, t, 1 - dawn * 0.7);
  if (dawn < 1) drawMoon(ctx, P, 1360, 150, 30, 1 - dawn);
  drawDawn(ctx, 610, dawn);
  drawHorizon(ctx, 600, 1, dawn > 0 ? '150,90,60' : '52,74,60');
  S.back.draw(ctx, P);
  S.mid.draw(ctx, P, 1, o.light || null);
  S.stone.draw(ctx, P, 1, o.light || null);
  stoneText(ctx, S, o.text ?? 1, o.textA ?? 1);
  if (o.actors) o.actors(ctx);
  S.front.draw(ctx, P, 1, o.light || null);
  if (o.dark) { night(ctx, cam, o.dark, o.lights || []); applyCam(ctx, R.base, cam); }
  if (o.top) o.top(ctx);
}
cap(51.0, 53.6, 'Направо поедешь — коня потеряешь, налево — сам пропадёшь.');
shot(50, 53.75, (ctx, t, lt) => {
  const cam = {
    x: key(lt, [[0, 760], [1.0, 800], [2.3, 930, 'ioC'], [3.0, 940], [3.75, 1000]]),
    y: key(lt, [[0, 560], [2.3, 640, 'ioC'], [3.75, 620]]),
    z: key(lt, [[0, 1.1], [1.0, 1.15], [2.3, 1.85, 'ioC'], [3.0, 1.8], [3.75, 1.5]]),
  };
  // конь: рысью входит, встаёт, мотает головой, поворачивает направо
  const x = key(lt, [[0, 380], [1.1, 740, 'outQ'], [2.7, 745], [3.75, 1000, 'inQ']]);
  const moving = 1 - bump(1.0, 1.2, 2.6, 2.9, lt);
  const ph = key(lt, [[0, 0], [1.1, 1.3, 'outQ'], [2.7, 1.3], [3.75, 3.2, 'inQ']]);
  const toss = bump(1.1, 1.25, 1.4, 1.7, lt);
  let hq = walkQuad(ph, { x, y: 790, s: 1.5, dir: 1, neck: 0.45 - toss * 0.35, head: 0.75 - toss * 0.5 }, 0.36 * moving + 0.02);
  if (lt > 2.6) hq.head = 0.75 + bump(2.6, 2.75, 2.8, 3.0, lt) * 0.3;
  const rear = bump(2.62, 2.75, 2.85, 3.05, lt);
  hq.pitch = -rear * 0.18;
  let fp = null;
  drawCross(ctx, t, cam, {
    text: inv(1.3, 2.5, lt),
    actors: (c) => {
      const hr = drawQuad(c, P, hq, 'horse', t, { saddle: C.em });
      const read = sstep(1.2, 1.6, lt) * (1 - sstep(2.6, 2.9, lt));
      const iv = Object.assign({}, PZ.ride, { x: hr.saddle[0] - 4, y: hr.saddle[1] - 18, s: 128, dir: 1, torso: 0.22 - read * 0.2, neck: -read * 0.1, head: -read * 0.12 });
      const J = human(c, iv, COSTUME.ivan);
      fp = hatFeather(c, iv, J, t, 1, 42);
    },
    light: [x + 100, 620, 600, 0.9],
    dark: 0.45, lights: [[x + 60, 640, 420, 1], [980, 690, 300, 0.8 * sstep(1.2, 1.8, lt)]],
    top: (c) => { if (fp) warm(c, fp[0], fp[1], 260, 0.3); },
  });
}, { name: 'stone', dis: 0.4 });

/* ---------- 3.4 Из тьмы — волк ---------- */
function* buildForest() {
  const R = rng(3400);
  const pic = new Pic(), fore = new Pic();
  for (let i = 0; i < 18; i++) treeFir(pic, -40 + i * 95 + R() * 40, 700 + R() * 60, 380 + R() * 240, { R, layers: 11, tones: ['#071711', '#0b2219', '#113024'] });
  yield;
  hill(pic, -100, 1700, 900, 150, { tones: ['#0b0906', '#16100a', '#241a10', '#3a2a18', '#54402a'], peak: 0.5, flat: 0.4, seed: 51, gold: 4 });
  yield;
  for (let i = 0; i < 6; i++) treeFir(fore, i * 330 + R() * 80, 960, 520 + R() * 200, { R, layers: 12, tones: ['#040a07', '#07140e', '#0a1c14'] });
  yield;
  return { pic, fore };
}
shot(53.75, 55, (ctx, t, lt) => {
  const S = lazy('forest', buildForest);
  const shake = bump(0.95, 1.0, 1.1, 1.25, lt) * 8;
  const cam = { x: 800 + Math.sin(lt * 61) * shake, y: 470, z: key(lt, [[0, 1.2], [1.25, 1.35]]) };
  applyCam(ctx, R.base, cam);
  S.pic.draw(ctx, P);
  // конь с Иваном — у левого края, освещён пером
  const hq = walkQuad(0.3 + lt * 0.4, { x: 340, y: 760, s: 1.45, dir: 1, neck: 0.3 + bump(0.3, 0.5, 0.8, 1.2, lt) * -0.5, head: 0.7 }, 0.2);
  hq.pitch = -bump(0.35, 0.6, 0.9, 1.2, lt) * 0.35;
  const hr = drawQuad(ctx, P, hq, 'horse', t, { saddle: C.em });
  const iv = Object.assign({}, PZ.ride, { x: hr.saddle[0] - 4, y: hr.saddle[1] - 18, s: 124, dir: 1, torso: 0.1 - bump(0.4, 0.6, 0.9, 1.2, lt) * 0.5, sF: 1.8, eF: 0.8 });
  const J = human(ctx, iv, COSTUME.ivan);
  const fp = hatFeather(ctx, iv, J, t, 1, 40);
  // глаза во тьме, затем прыжок
  const jump = inv(0.42, 1.05, lt);
  const eyes = bump(0.08, 0.16, 0.36, 0.44, lt);
  if (eyes > 0) for (const dx of [0, 22]) { warm(ctx, 1180 + dx, 560, 30, eyes, SPR.gold); ctx.fillStyle = `rgba(255,220,120,${eyes})`; ctx.beginPath(); ctx.ellipse(1180 + dx, 560, 7, 3.5, -0.2, 0, TAU); ctx.fill(); }
  if (jump > 0) {
    const u = Ease.inQ(jump);
    const wp = [lerp(1240, 560, u), lerp(600, 520, u) - Math.sin(u * PI) * 160];
    const wq = gallopPose(0.55, { x: wp[0], y: wp[1], s: lerp(1.9, 3.2, u), dir: -1, neck: 1.25, head: 0.1, jaw: 1, eye: 1.2, tail: 0.05, pitch: -0.25 + u * 0.3 }, 0.7);
    drawQuad(ctx, P, wq, 'wolf', t);
  }
  S.fore.draw(ctx, P);
  night(ctx, cam, 0.55, [[fp[0], fp[1], 380, 1], [lerp(1240, 560, jump), 560, 260, jump]]);
  applyCam(ctx, R.base, cam);
  // вспышка — и тьма
  const fl = bump(1.02, 1.06, 1.12, 1.25, lt);
  if (fl > 0) { ctx.setTransform(R.base[0], 0, 0, R.base[0], 0, 0); ctx.fillStyle = `rgba(255,236,190,${fl})`; ctx.fillRect(0, 0, W, H); }
}, { name: 'attack' });

/* ---------- 3.5 Горе Ивана. Волк приходит с повинной ---------- */
function saddleProp(ctx, x, y, s) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  const cl = sp([[-30, 0], [-26, -18], [24, -20], [30, 0]]);
  ctx.fillStyle = C.em; ctx.fill(cl); ctx.lineWidth = 1.2; ctx.strokeStyle = P.gold; ctx.stroke(cl);
  for (let i = 0; i < 10; i++) brushLine(ctx, [[-28 + i * 6, 0], [-28 + i * 6, 5]], 1.2, P.gold, Prof.even);
  const sd = sp([[-18, -16], [-12, -28], [10, -28], [16, -18], [12, -12], [-14, -12]]);
  ctx.fillStyle = C.cin; ctx.fill(sd); ctx.stroke(sd);
  ctx.restore();
}
cap(57.4, 62.2, '— Не горюй, Иван. Коня твоего я съел — теперь сам тебе послужу.');
shot(55, 62.5, (ctx, t, lt) => {
  const S = lazy('forest', buildForest);
  const cam = { x: key(lt, [[0, 760], [7.5, 800]]), y: key(lt, [[0, 600], [7.5, 610]]), z: key(lt, [[0, 1.45], [7.5, 1.62]]) };
  applyCam(ctx, R.base, cam);
  S.pic.draw(ctx, P);
  // волк подходит осторожно, низко опустив голову
  const wx = key(lt, [[0, 1500], [1.1, 1500], [3.4, 930, 'outQ']]);
  const wph = key(lt, [[0, 0], [1.1, 0], [3.4, 2.4, 'outQ']]);
  const bowK = bump(3.7, 4.5, 6.8, 7.5, lt);
  const wq = walkQuad(wph, { x: wx, y: 772, s: 1.55, dir: -1, neck: 1.45 + bowK * 0.35, head: 0.55 + bowK * 0.35, tail: 0.85, ear: -0.4 }, 0.3 * (1 - sstep(3.2, 3.5, lt)));
  wq.fN = mix(wq.fN, [0.9, -0.9, -0.2], bowK); wq.fF = mix(wq.fF, [0.8, -0.8, -0.1], bowK);
  wq.pitch = bowK * 0.14; wq.bob = bowK * 10;
  // Иван: горе → поднимает голову → оживает
  const look = sstep(4.1, 4.9, lt);
  const iv = Object.assign(mix(PZ.grief, Object.assign({}, PZ.sitUp, { neck: -0.15, head: -0.05 }), look), { x: 620, s: 132, dir: 1 });
  iv.torso += Math.sin(t * 1.3) * 0.02 * (1 - look);
  groundPose(iv, 772);
  const pn = new Pic();
  void pn;
  // пень
  ctx.fillStyle = '#3a2412'; ctx.beginPath(); ctx.ellipse(620, 760, 44, 12, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#6a4424'; ctx.fillRect(578, 760, 84, 22);
  ctx.fillStyle = '#8a6030'; ctx.beginPath(); ctx.ellipse(620, 758, 40, 9, 0, 0, TAU); ctx.fill();
  saddleProp(ctx, 480, 790, 1.4);
  const fire = lerp(0.18, 1.0, sstep(5.0, 5.8, lt));
  const J = human(ctx, iv, COSTUME.ivan);
  const fp = hatFeather(ctx, iv, J, t, fire, 44);
  drawQuad(ctx, P, wq, 'wolf', t);
  S.fore.draw(ctx, P);
  night(ctx, cam, 0.5, [[fp[0], fp[1], 180 + 300 * fire, 1], [wx, 700, 200, 0.3]]);
  applyCam(ctx, R.base, cam);
  warm(ctx, fp[0], fp[1], 150 + 200 * fire, 0.3 * fire + 0.1);
}, { name: 'grief', fin: 0.35 });

/* ==========================================================================
   СЦЕНА 4. СЕРЫЙ ВОЛК
   ========================================================================== */
/* ---------- 4.1 Полёт на волке ---------- */
const FORE_DX = 330; // сдвиг ближних елей: в момент прыжка перед волком чисто
shot(62.5, 68.75, (ctx, t, lt) => {
  const S = lazy('ride', () => buildRoad(6200, { len: 5600, river: true }));
  const wx = 420 + lt * 470;
  const z = key(lt, [[0, 1.5], [2.0, 1.45], [4.7, 0.98, 'ioS'], [6.25, 1.0]]);
  const cam = { x: wx + 150 + (1.5 - z) * 60, y: key(lt, [[0, 640], [4.7, 505, 'ioS']]), z };
  applyCam(ctx, R.base, { x: W / 2, y: 450, z: 1 });
  drawStars(ctx, P, S.stars, t, 1);
  // большая луна у горизонта — волк проносится на её фоне
  const mr = key(lt, [[0, 150], [4.7, 118]]);
  drawMoon(ctx, P, 720, 470, mr);
  warm(ctx, 720, 470, mr * 3, 0.12, SPR.gold);
  drawHorizon(ctx, 600, 1);
  const ph = lt * 2.3;
  const bound = Math.max(0, Math.sin(clamp((lt - 3.7) / 1.1) * PI)) * 90;
  const wq = gallopPose(ph, { x: wx, y: 708 - bound, s: 1.9, dir: 1, neck: 1.12, head: 0.32, tail: 0.08, ear: -0.3 }, 0.7);
  if (bound > 1) { wq.fN = [1.3, 1.1, 0.9]; wq.fF = [1.2, 1.0, 0.9]; wq.hN = [-0.9, -1.2, -0.6]; wq.hF = [-0.8, -1.1, -0.5]; wq.pitch = -0.08; }
  const sd = quadAt(wq, 'wolf', [0, SPECIES.wolf.top - 2]);
  const bounce = Math.sin(ph * TAU * 2) * 3;
  const iv = Object.assign({}, PZ.rideWolf, { x: sd[0] + 2, y: sd[1] - 14 + bounce, s: 128, dir: 1, sway: -0.45, hem: 1 + 0.2 * Math.sin(t * 9), sB: 0.6 + 0.1 * Math.sin(t * 7) });
  const fp0 = hatFeatherPos(iv, humanJoints(iv));
  drawLayer(ctx, S.far, cam, 0.2);
  drawLayer(ctx, S.mid, cam, 0.55, { light: [fp0[0], fp0[1], 520, 0.6] });
  applyCam(ctx, R.base, cam);
  drawQuad(ctx, P, wq, 'wolf', t);
  const J = human(ctx, iv, COSTUME.ivan);
  // след искр за пером
  sparks(ctx, t, { t0: 62.5, rate: 55, life: 1.3, seed: 44, size: 1.8, rise: 10, spread: 26, wind: -380, emit: (tb) => { const l2 = tb - 62.5; return [420 + l2 * 470 - 30, 560 - Math.max(0, Math.sin(clamp((l2 - 3.7) / 1.1) * PI)) * 90]; } });
  const fp = hatFeather(ctx, iv, J, t, 1, 46);
  const cn = drawLayer(ctx, S.near, cam, 1, { light: [fp[0], fp[1] + 150, 460, 0.9] });
  drawLayer(ctx, S.fore, cam, 1.55, { dx: FORE_DX });
  night(ctx, cn, 0.36, [[fp[0], fp[1], 420, 1], [wx - 60, 640, 300, 0.5]]);
  applyCam(ctx, R.base, cam);
  warm(ctx, fp[0], fp[1], 280, 0.3);
}, { name: 'rideWolf', fin: 0.3 });

/* ---------- чужой сад: белокаменная стена, ворота, колокольцы, золотая клетка ---------- */
function* buildForeign() {
  const R = rng(4200);
  const back = new Pic(), mid = new Pic(), front = new Pic();
  hill(back, -100, 1700, 660, 90, { tones: TONES.far, peak: 0.5, flat: 0.3, seed: 61, gold: 2, edge: 'rgba(200,215,235,0.28)' });
  yield;
  // стена с зубцами-«ласточкиными хвостами»
  const wy0 = 452, wy1 = 646;
  const wallP = new Path2D(); wallP.rect(-100, wy0, 1800, wy1 - wy0);
  back.fill(wallP, vgrad(wy0, wy1, [[0, '#e8d8b4'], [1, '#a88e64']]), { cx: 800, cy: 550 });
  for (let x = -90; x < 1700; x += 64) {
    back.shape([[x, wy0 + 1], [x, wy0 - 30], [x + 12, wy0 - 20], [x + 24, wy0 - 30], [x + 24, wy0 + 1]], '#e2cfa6', { seg: 1 });
    back.line([[x + 1, wy0 - 29], [x + 12, wy0 - 19], [x + 23, wy0 - 29]], 1, 'gold', { prof: Prof.even, seg: 2 });
  }
  for (let r = 0; r < 6; r++) for (let x = -100 + (r % 2) * 30; x < 1700; x += 60) back.line([[x, wy0 + 12 + r * 30], [x + 52, wy0 + 12 + r * 30]], 0.8, 'rgba(120,90,50,0.45)', { prof: Prof.even, seg: 2 });
  back.line([[-100, wy0 + 4], [1700, wy0 + 4]], 1.4, 'gold', { prof: Prof.even, seg: 2 });
  // ворота
  const gx = 330, gw = 150, gh = 170;
  const gate = new Path2D();
  gate.moveTo(gx - gw / 2, wy1); gate.lineTo(gx - gw / 2, wy1 - gh + gw / 2);
  gate.arc(gx, wy1 - gh + gw / 2, gw / 2, PI, 0); gate.lineTo(gx + gw / 2, wy1); gate.closePath();
  back.fill(gate, '#07050a', { cx: gx, cy: wy1 - 80 });
  back.line([[gx - gw / 2 - 8, wy1], [gx - gw / 2 - 8, wy1 - gh + gw / 2], [gx - gw * 0.36, wy1 - gh - 10], [gx, wy1 - gh - 22], [gx + gw * 0.36, wy1 - gh - 10], [gx + gw / 2 + 8, wy1 - gh + gw / 2], [gx + gw / 2 + 8, wy1]], 2.2, 'gold', { prof: Prof.even });
  // башня справа
  wall(back, 1360, 660, 110, 330);
  yield;
  for (let i = 0; i < 3; i++) archWin(back, 1415, 620 - i * 90, 18, 38, true);
  tentRoof(back, 1415, 326, 130, 170, C.em);
  yield;
  onion(back, 1415, 156, 12);
  // деревья сада
  treeRound(mid, 620, 700, 300, { R, n: 16 });
  yield;
  treeRound(mid, 1250, 700, 280, { R, n: 16 });
  yield;
  bush(mid, 470, 700, 50, { R }); bush(mid, 1120, 704, 44, { R });
  yield;
  hill(mid, -100, 1700, 760, 80, { tones: TONES.green, peak: 0.5, flat: 0.3, seed: 62, gold: 6 });
  yield;
  hill(front, -100, 700, 930, 120, { tones: TONES.ochre, peak: 0.4, seed: 63 });
  yield;
  hill(front, 1200, 1700, 940, 130, { tones: TONES.ochre, peak: 0.5, seed: 64 });
  yield;
  for (let i = 0; i < 6; i++) tulip(front, 60 + i * 90 + R() * 30, 880 + R() * 20, 30 + R() * 10, i % 2 ? C.cinHi : C.wht, R);
  yield;
  // перекладина с колокольцами
  const beam = new Path2D(); beam.rect(1080, 470, 300, 7);
  mid.fill(beam, C.umb, { cx: 1230, cy: 470 });
  mid.line([[1090, 470], [1090, 700]], 5, C.umb, { prof: Prof.even });
  mid.line([[1370, 470], [1370, 700]], 5, C.umb, { prof: Prof.even });
  return { back, mid, front, stars: makeStars(420, 80, 40, 40, 1560, 420), bells: [1130, 1180, 1230, 1280, 1330] };
}
/* колокольчик на нитке */
function drawBell(ctx, x, y, s, ang) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.scale(s, s);
  brushLine(ctx, [[0, 0], [0, 10]], 0.8, P.gold, Prof.even);
  const b = sp([[-2, 10], [-4, 14], [-7, 22], [-8, 25], [8, 25], [7, 22], [4, 14], [2, 10]]);
  ctx.fillStyle = P.gold; ctx.fill(b);
  ctx.strokeStyle = 'rgba(90,50,15,0.8)'; ctx.lineWidth = 0.6; ctx.stroke(b);
  ctx.fillStyle = '#6d4210'; ctx.beginPath(); ctx.arc(0, 26.5, 2, 0, TAU); ctx.fill();
  ctx.restore();
}
/* золотая клетка-луковица с птицей */
function drawCage(ctx, x, y, s, t, o = {}) {
  const k = s / 100;
  const bars = 11, rx = 44 * k, h = 118 * k;
  const barPts = (i) => {
    const a = (i / bars) * TAU + 0.15;
    const c = Math.cos(a), sn = Math.sin(a);
    const pts = [];
    for (let j = 0; j <= 12; j++) {
      const v = j / 12;
      const r = rx * (v < 0.55 ? 1 : Math.sin(PI * 0.5 * (1 - (v - 0.55) / 0.45) ** 0.9) * (1 + 0.08 * Math.sin(PI * (v - 0.55) / 0.45)));
      pts.push([x + c * r, y - v * h + sn * r * 0.22]);
    }
    return { pts, front: sn > 0 };
  };
  const drawBars = (front) => {
    for (let i = 0; i < bars; i++) {
      const b = barPts(i);
      if (b.front !== front) continue;
      brushLine(ctx, b.pts, (front ? 2.2 : 1.6) * k, front ? P.gold : 'rgba(170,120,50,0.8)', Prof.even);
    }
  };
  // задняя половина
  ctx.strokeStyle = 'rgba(170,120,50,0.8)'; ctx.lineWidth = 1.6 * k;
  for (const yy of [0, 0.3, 0.55]) { ctx.beginPath(); ctx.ellipse(x, y - yy * h, rx, rx * 0.22, 0, PI, TAU); ctx.stroke(); }
  drawBars(false);
  if (o.bird) {
    // жёрдочка и птица
    brushLine(ctx, [[x - rx * 0.8, y - h * 0.3], [x + rx * 0.8, y - h * 0.3]], 1.8 * k, P.gold, Prof.even);
    drawBird(ctx, P, birdPose(Object.assign({ x: x + 4 * k, y: y - h * 0.47, s: 0.5 * k, dir: -1, rot: -0.3, lift: -0.45, bend: 0.3, spread: 0.06, liftB: -0.4, spreadB: 0.08, neck: [0.2, 0.4, 0.5], head: 0.3,
      tailA: 0.52 * PI, tailSpread: 0.5, tailCurl: 0.45, tailWave: 0.08, tailDroop: 0.85, tailLen: 0.62, glow: o.glow ?? 0.6, fire: o.fire ?? 0.5 }, o.birdPose || {})), t);
  }
  drawBars(true);
  ctx.strokeStyle = P.gold; ctx.lineWidth = 2.2 * k;
  for (const yy of [0, 0.3, 0.55]) { ctx.beginPath(); ctx.ellipse(x, y - yy * h, rx, rx * 0.22, 0, 0, PI); ctx.stroke(); }
  // основание и кольцо
  ctx.fillStyle = P.gold;
  ctx.beginPath(); ctx.ellipse(x, y + 3 * k, rx * 1.08, rx * 0.26, 0, 0, TAU); ctx.fill();
  ctx.lineWidth = 2.6 * k; ctx.strokeStyle = P.gold;
  ctx.beginPath(); ctx.arc(x, y - h - 9 * k, 8 * k, 0, TAU); ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y - h + 1 * k, 3.5 * k, 0, TAU); ctx.fill();
  return { ring: [x, y - h - 9 * k], top: [x, y - h] };
}
function drawForeign(ctx, t, cam, o = {}) {
  const S = lazy('foreign', buildForeign);
  applyCam(ctx, R.base, cam);
  drawStars(ctx, P, S.stars, t, 1);
  drawMoon(ctx, P, 240, 130, 26);
  const L = o.light || null;
  S.back.draw(ctx, P, 1, L);
  S.mid.draw(ctx, P, 1, L);
  // колокольцы: качаются, когда дёрнули нить
  const sw = o.ring || 0;
  const bells = S.bells.map((bx, i) => {
    const ang = sw * Math.sin(t * 14 + i * 1.3) * 0.5;
    drawBell(ctx, bx, 474, 1.4, ang);
    return [bx + Math.sin(ang) * 36, 474 + Math.cos(ang) * 36];
  });
  if (o.actors) o.actors(ctx, bells);
  S.front.draw(ctx, P, 1, L);
  if (o.dark) { night(ctx, cam, o.dark, o.lights || []); applyCam(ctx, R.base, cam); }
  if (o.top) o.top(ctx);
}
const CAGE = [1000, 752];
/* волк сидит */
function sitWolf(o) {
  return quadPose(Object.assign({ pitch: -0.42, hN: [1.3, -1.9, 1.35], hF: [1.25, -1.85, 1.3], fN: [0.42, 0.38, 0.5], fF: [0.3, 0.3, 0.42], neck: 0.55, head: 0.45, tail: 0.95 }, o));
}
cap(69.9, 74.6, '— Птицу бери, а золотую клетку не трогай, — сказал волк.', 'top');
shot(68.75, 75, (ctx, t, lt) => {
  const cam = { x: key(lt, [[0, 760], [4.0, 820], [6.25, 900]]), y: key(lt, [[0, 520], [6.25, 560]]), z: key(lt, [[0, 1.08], [4.0, 1.12], [6.25, 1.42]]) };
  const arr = Ease.outQ(clamp(lt / 1.0));
  const wx = lerp(250, 560, arr);
  const run = 1 - sstep(0.7, 1.05, lt);
  const sitK = sstep(1.9, 2.6, lt);
  let wq = gallopPose(lt * 2.2, { x: wx, y: 772, s: 1.7, dir: 1, neck: 1.0, head: 0.35 }, 0.62 * run + 0.02);
  if (sitK > 0) wq = Object.assign(mix(wq, sitWolf({ x: wx, y: 772, s: 1.7, dir: 1 }), sitK), { x: wx, y: 772 - sitK * 8, s: 1.7, dir: 1 });
  wq.head += bump(1.0, 1.3, 5.5, 5.9, lt) * -0.25;
  wq.jaw = Math.max(0, Math.sin(lt * 13)) * 0.25 * bump(1.1, 1.3, 5.5, 5.8, lt);
  // Иван спрыгивает и идёт к клетке
  const dis = sstep(1.2, 1.8, lt);
  const walkU = inv(2.1, 4.6, lt);
  const ix = lt < 1.2 ? wx : lt < 1.8 ? lerp(wx, 690, dis) : lerp(690, 872, Ease.ioS(walkU));
  let iv;
  if (lt < 1.2) iv = Object.assign({}, PZ.rideWolf, { hem: 0.6 });
  else if (lt < 2.1) iv = mix(PZ.leap, PZ.stand, dis);
  else if (lt < 4.6) iv = walkPose(walkU * 3.2, { sF: 0.3, sB: -0.2 });
  else iv = mix(PZ.stand, PZ.reach, sstep(4.9, 5.9, lt));
  const reachK = sstep(4.9, 5.9, lt);
  drawForeign(ctx, t, cam, {
    actors: (c) => {
      const wr = drawQuad(c, P, wq, 'wolf', t);
      Object.assign(iv, { x: ix, s: 130, dir: 1 });
      if (lt < 1.2) { iv.x = wr.saddle[0] + 2; iv.y = wr.saddle[1] - 14; }
      else { groundPose(iv, 800); if (lt < 1.8) iv.y -= Math.sin(dis * PI) * 50; }
      const J = human(c, iv, COSTUME.ivan);
      hatFeather(c, iv, J, t, 1, 42);
      drawCage(c, CAGE[0], CAGE[1], 100, t, { bird: true, glow: 0.6 + reachK * 0.3, fire: 0.45 + reachK * 0.3 });
      // тумба
      c.fillStyle = C.cin; c.fillRect(CAGE[0] - 34, CAGE[1] + 6, 68, 50);
      brushLine(c, [[CAGE[0] - 34, CAGE[1] + 10], [CAGE[0] + 34, CAGE[1] + 10]], 2, P.gold, Prof.even);
      // нити к колокольцам
      for (const bx of lazy('foreign', buildForeign).bells) brushLine(c, [[CAGE[0], CAGE[1] - 128], [lerp(CAGE[0], bx, 0.5), 560], [bx, 510]], 0.7, 'rgba(240,210,140,0.55)', Prof.even);
    },
    light: [CAGE[0], CAGE[1] - 70, 520, 0.8],
    dark: 0.42, lights: [[CAGE[0], CAGE[1] - 70, 360, 0.9], [ix, 640, 300, 0.8]],
    top: (c) => warm(c, CAGE[0], CAGE[1] - 70, 260, 0.25),
  });
}, { name: 'foreign', dis: 0.6 });

/* ==========================================================================
   СЦЕНА 5. ДОЛГО ЛИ, КОРОТКО ЛИ — клейма, как на житийной иконе
   ========================================================================== */
const ICON = {
  slots: [[62, 62, 380, 376], [1158, 62, 380, 376], [62, 462, 380, 376], [1158, 462, 380, 376]],
  med: [474, 62, 652, 776],
};
function mulM(a, b) { // a ∘ b для матриц [a,b,c,d,e,f]
  return [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
}
function slotM(r) { const [x, y, w, h] = r; const k = Math.max(w / W, h / H) * 1.02; return [k, 0, 0, k, x + w / 2 - k * W / 2, y + h / 2 - k * H / 2]; }
function iconArch(r) { return klejmoPath(r[0], r[1], r[2], r[3], 0.16); }
/* контур клейма ломаной: те же кривые Безье, что в klejmoPath, и прямые стороны */
function klejmoPoly(x, y, w, h, arch) {
  const ah = h * arch, out = [];
  const seg = (a, b, n) => { for (let i = 0; i < n; i++) out.push(lerp(a[0], b[0], i / n), lerp(a[1], b[1], i / n)); };
  const cub = (p0, p1, p2, p3, n) => { for (let i = 0; i < n; i++) { const q = bez(p0, p1, p2, p3, i / n); out.push(q[0], q[1]); } };
  seg([x, y + h], [x, y + ah], 12);
  cub([x, y + ah], [x, y + ah * 0.3], [x + w * 0.3, y + ah * 0.35], [x + w / 2, y], 18);
  cub([x + w / 2, y], [x + w * 0.7, y + ah * 0.35], [x + w, y + ah * 0.3], [x + w, y + ah], 18);
  seg([x + w, y + ah], [x + w, y + h], 12);
  seg([x + w, y + h], [x, y + h], 16);
  out.push(x, y + h, x + 2, y + h);
  return new Float32Array(out);
}
/* рисует содержимое внутри рамки клейма; content(ctx) сам ставит камеру */
function inSlot(ctx, meta, r, content, parM) {
  ctx.save();
  ctx.setTransform(R.base[0], 0, 0, R.base[0], R.base[1], R.base[2]);
  ctx.transform(...meta);
  ctx.clip(iconArch(r));
  ctx.fillStyle = C.lac; ctx.fillRect(r[0], r[1], r[2], r[3]);
  CAM.par = mulM(meta, parM || slotM(r));
  content(ctx);
  CAM.par = null;
  ctx.restore();
}
function iconFrames(ctx, meta, rev, t) {
  ctx.setTransform(R.base[0], 0, 0, R.base[0], R.base[1], R.base[2]);
  ctx.transform(...meta);
  const pic = lazy('iconFrames', () => {
    const p = new Pic();
    for (const r of [...ICON.slots, ICON.med]) {
      for (const [d, w] of [[0, 2.2], [7, 1]]) {
        const [x, y, ww, hh] = [r[0] - d, r[1] - d, r[2] + 2 * d, r[3] + 2 * d];
        p.line(klejmoPoly(x, y, ww, hh, 0.16), w, 'gold', { prof: Prof.flat }).t0 = d ? 0.25 : 0;
      }
      const cx = r[0] + r[2] / 2;
      for (const sd of [-1, 1]) p.line(curlPts(cx + sd * 26, r[1] + 3, 7, sd > 0 ? PI : 0, 1.1, sd), 1.2, 'gold', { prof: Prof.tail, seg: 3 }).t0 = 0.4;
      p.dot(cx, r[1] - 3, 3, C.cin).t0 = 0.45;
    }
    return p;
  });
  const bp = { gold: P.gold, ctx };
  if (rev >= 1) pic.draw(ctx, bp); else pic.drawReveal(ctx, bp, rev, { dur: 0.45 });
  void t;
}

/* ---------- 5.1 Клетка поднята — звенят колокольцы, бежит стража ---------- */
function alarmScene(ctx, t, lt) {
  const cam = { x: key(lt, [[0, 930], [2.6, 960]]), y: key(lt, [[0, 610], [2.6, 600]]), z: key(lt, [[0, 1.6], [2.6, 1.7]]) };
  const lift = Ease.outBack(clamp((lt - 0.25) / 0.5));
  const ring = sstep(0.5, 0.7, lt);
  const gx = key(lt, [[0, 1560], [1.0, 1560], [2.2, 1170, 'outQ']]);
  drawForeign(ctx, t, cam, {
    ring,
    actors: (c) => {
      const wq = sitWolf({ x: 560, y: 764, s: 1.7, dir: 1, head: 0.45 + ring * -0.3, ear: -ring * 0.5 });
      drawQuad(c, P, wq, 'wolf', t);
      const scare = sstep(1.1, 1.5, lt);
      const iv = Object.assign(mix(Object.assign({}, PZ.reach, { sF: 1.75 + lift * 0.4, eF: 0.22 }), Object.assign({}, PZ.handsUp, { sF: 2.3, eF: 0.3, sB: 2.5, eB: 0.8 }), sstep(1.6, 2.1, lt)), { x: 872, s: 130, dir: 1 });
      iv.head = -0.2 + scare * 0.35; iv.torso = (iv.torso || 0) - scare * 0.12;
      groundPose(iv, 800);
      const J = human(c, iv, COSTUME.ivan);
      hatFeather(c, iv, J, t, 1, 42);
      const hand = humanWorld(iv, J.armF.H);
      const cy = lt < 0.25 ? CAGE[1] : hand[1] + 134;
      const cx = lt < 0.25 ? CAGE[0] : lerp(CAGE[0], hand[0] + 10, clamp((lt - 0.25) / 0.2));
      drawCage(c, cx, cy, 100, t, { bird: true, glow: 1, fire: 1, birdPose: { lift: -0.2 + ring * 0.5 * Math.sin(t * 20), spread: ring * 0.6 } });
      c.fillStyle = C.cin; c.fillRect(CAGE[0] - 34, CAGE[1] + 6, 68, 50);
      brushLine(c, [[CAGE[0] - 34, CAGE[1] + 10], [CAGE[0] + 34, CAGE[1] + 10]], 2, P.gold, Prof.even);
      for (const bx of lazy('foreign', buildForeign).bells) brushLine(c, [[cx, cy - 128], [lerp(cx, bx, 0.5), lerp(cy - 128, 510, 0.5) + 10 * (1 - ring)], [bx, 510]], 0.8, 'rgba(250,220,150,0.7)', Prof.even);
      // стража
      for (let i = 0; i < 2; i++) {
        const gp = walkPose(lt * 2.6 + i * 0.5, { torso: 0.35, sF: 2.2, eF: 0.4, sB: 0.6 });
        Object.assign(gp, { x: gx + i * 120, s: 128, dir: -1 });
        groundPose(gp, 804 + i * 6);
        const GJ = human(c, gp, COSTUME.guard);
        const hw = humanWorld(gp, GJ.armF.H);
        brushLine(c, [[hw[0] + 20, hw[1] + 60], [hw[0] - 30, hw[1] - 120]], 2.6, C.umb, Prof.even);
        c.fillStyle = '#d9d2c0';
        c.beginPath(); c.moveTo(hw[0] - 30, hw[1] - 120); c.quadraticCurveTo(hw[0] - 60, hw[1] - 140, hw[0] - 44, hw[1] - 170); c.quadraticCurveTo(hw[0] - 30, hw[1] - 140, hw[0] - 22, hw[1] - 110); c.fill();
      }
    },
    light: [CAGE[0], CAGE[1] - 100, 560, 1],
    dark: 0.4, lights: [[CAGE[0], CAGE[1] - 100, 420, 1], [gx, 640, 280, 0.7]],
  });
}
cap(75.3, 78.4, 'Не удержался Иван — схватил и клетку.');
const FREEZE = 2.6;
shot(75, 78.75, (ctx, t, lt) => {
  if (lt < FREEZE) { alarmScene(ctx, t, lt); return; }
  const u = Ease.ioC(inv(FREEZE, 3.7, lt));
  const meta = camMatrix({ x: W / 2, y: H / 2, z: 1 });
  // остальные клейма и средник проступают
  iconFrames(ctx, meta, inv(FREEZE + 0.3, 3.75, lt), t);
  // замерший кадр уменьшается в первое клеймо
  const full = [1, 0, 0, 1, 0, 0], sm = slotM(ICON.slots[0]);
  const m = full.map((v, i) => lerp(v, sm[i], u));
  const r0 = ICON.slots[0];
  const clipR = [lerp(BORDER, r0[0], u), lerp(BORDER, r0[1], u), lerp(W - 2 * BORDER, r0[2], u), lerp(H - 2 * BORDER, r0[3], u)];
  ctx.save();
  ctx.setTransform(R.base[0], 0, 0, R.base[0], R.base[1], R.base[2]);
  ctx.clip(klejmoPath(clipR[0], clipR[1], clipR[2], clipR[3], 0.16 * u));
  CAM.par = m;
  alarmScene(ctx, t - lt + FREEZE, FREEZE);
  CAM.par = null;
  // тон «застывшего» кадра — чуть золотистее
  ctx.setTransform(R.base[0], 0, 0, R.base[0], R.base[1], R.base[2]);
  ctx.fillStyle = `rgba(80,50,10,${0.18 * u})`; ctx.fillRect(0, 0, W, H);
  ctx.restore();
}, { name: 'alarm' });

/* ---------- клейма ---------- */
/* К2: конь златогривый и золотая узда */
function* buildStable() {
  const p = new Pic();
  const R = rng(5200);
  hill(p, -100, 1700, 900, 120, { tones: TONES.ochre, peak: 0.5, flat: 0.3, seed: 71, gold: 6 });
  yield;
  for (let i = 0; i < 4; i++) {
    const x = 330 + i * 300;
    const a = new Path2D(); a.moveTo(x - 110, 800); a.lineTo(x - 110, 420); a.arc(x, 420, 110, PI, 0); a.lineTo(x + 110, 800);
    p.fill(a, i % 2 ? '#3a1510' : '#2c1010', { cx: x, cy: 600 });
    p.line([[x - 110, 800], [x - 110, 420], [x - 78, 342], [x, 310], [x + 78, 342], [x + 110, 420], [x + 110, 800]], 2, 'gold', { prof: Prof.even });
  }
  treeRound(p, 120, 820, 200, { R, n: 10 });
  yield;
  return p;
}
function stableScene(ctx, t, lk) {
  const cam = { x: 820, y: 560, z: 1.25 };
  applyCam(ctx, R.base, cam);
  lazy('stable', buildStable).draw(ctx, P);
  const hq = quadPose({ x: 700, y: 752, s: 1.55, dir: 1, neck: 0.45 + bump(1.4, 1.6, 2.2, 2.6, lk) * -0.3, head: 0.7, tail: 0.6 });
  drawQuad(ctx, P, hq, 'goldhorse', t, { saddle: C.cin });
  // узда на крюке
  const grab = sstep(1.3, 1.6, lk);
  const ivx = key(lk, [[0, 1080], [1.3, 960, 'outQ']]);
  const iv = Object.assign(mix(walkPose(lk * 1.5, {}), Object.assign({}, PZ.reach, { sF: 2.2 }), sstep(1.0, 1.3, lk)), { x: ivx, s: 125, dir: -1 });
  groundPose(iv, 820);
  const caught = sstep(2.3, 2.7, lk);
  if (caught > 0) Object.assign(iv, mix(iv, Object.assign({}, PZ.handsUp, { x: ivx, s: 125, dir: -1, y: iv.y }), caught));
  const J = human(ctx, iv, COSTUME.ivan);
  hatFeather(ctx, iv, J, t, 1, 40);
  const hw = humanWorld(iv, J.armF.H);
  const bx = lerp(900, hw[0], grab), by = lerp(560, hw[1], grab);
  ctx.lineWidth = 3; ctx.strokeStyle = P.gold;
  ctx.beginPath(); ctx.ellipse(bx, by + 20, 16, 24, 0.3, 0, TAU); ctx.stroke();
  brushLine(ctx, [[bx, by], [bx - 10, by + 36], [bx + 6, by + 56]], 2, P.gold, Prof.even);
  // стража хватает
  const gx = key(lk, [[0, 1500], [2.0, 1500], [2.6, 1130, 'outQ']]);
  const gp = Object.assign(walkPose(lk * 2.4, { torso: 0.3, sF: 1.6, eF: 0.2 }), { x: gx, s: 125, dir: -1 });
  groundPose(gp, 824);
  human(ctx, gp, COSTUME.guard);
  warm(ctx, 700, 640, 300, 0.25, SPR.gold);
}
/* К3: волк уносит Елену Прекрасную */
function* buildMeadow() {
  const p = new Pic(), R = rng(5300);
  hill(p, -100, 900, 760, 160, { tones: TONES.green, peak: 0.4, seed: 72 });
  yield;
  hill(p, 700, 1700, 770, 150, { tones: TONES.olive, peak: 0.6, seed: 73 });
  yield;
  treeRound(p, 380, 720, 280, { R, n: 16 });
  yield;
  treeRound(p, 1240, 730, 260, { R, n: 14 });
  yield;
  for (let i = 0; i < 12; i++) tulip(p, 200 + i * 105 + R() * 30, 860 + R() * 20, 36 + R() * 14, i % 3 ? C.cinHi : C.wht, R);
  yield;
  hill(p, -100, 1700, 960, 110, { tones: TONES.ochre, peak: 0.5, flat: 0.3, seed: 74 });
  yield;
  return p;
}
function elenaScene(ctx, t, lk) {
  const cam = { x: 800, y: 560, z: 1.2 };
  applyCam(ctx, R.base, cam);
  const st = lazy('k3stars', () => makeStars(530, 40, 40, 40, 1560, 400));
  drawStars(ctx, P, st, t, 1);
  lazy('meadow', buildMeadow).draw(ctx, P);
  const grab = sstep(1.5, 2.1, lk);
  const run = inv(2.1, 3.75, lk);
  const wx = lk < 2.1 ? key(lk, [[0, 1500], [1.5, 1500], [2.1, 900, 'inQ']]) : lerp(900, 560, Ease.outQ(run));
  const wq = gallopPose(lk * 2.3, { x: wx, y: 776 - (lk > 1.5 && lk < 2.1 ? Math.sin(grab * PI) * 70 : 0), s: 1.55, dir: -1, neck: 1.05, head: 0.35 }, 0.7);
  const wr = drawQuad(ctx, P, wq, 'wolf', t);
  let el;
  if (lk < 2.0) {
    el = Object.assign(walkPose(lk * 1.1, {}), { x: lerp(560, 900, clamp(lk / 2)), s: 128, dir: 1 });
    el.hem = 0.2; el.sway = Math.sin(lk * 3) * 0.2;
    groundPose(el, 826);
  } else {
    el = Object.assign({}, PZ.ride, { x: wr.saddle[0] - 4, y: wr.saddle[1] - 16, s: 120, dir: -1, sF: 2.3, eF: 0.5, hem: 0.8, sway: 0.4 });
  }
  human(ctx, el, COSTUME.elena);
  warm(ctx, 800, 600, 400, 0.12, SPR.gold);
}
/* К4: волк ударился оземь — и обернулся Еленой */
function magicScene(ctx, t, lk) {
  const cam = { x: 800, y: 540, z: 1.25 };
  applyCam(ctx, R.base, cam);
  const st = lazy('k4stars', () => makeStars(540, 50, 40, 40, 1560, 500));
  drawStars(ctx, P, st, t, 1);
  lazy('meadow', buildMeadow).draw(ctx, P);
  const flip = inv(0.3, 1.25, lk);
  const turn = sstep(1.1, 1.5, lk);
  // золотой вихрь
  const sw = bump(0.4, 0.9, 1.3, 2.0, lk);
  if (sw > 0) {
    ctx.save(); ctx.translate(800, 690); ctx.rotate(t * 4);
    for (let i = 0; i < 5; i++) { ctx.rotate(TAU / 5); brushLine(ctx, curlPts(40, 0, 60 * sw, 0, 1.2, 1), 3 * sw, P.gold, Prof.tail); }
    ctx.restore();
    sparks(ctx, t, { t0: t - lk + 0.5, t1: t - lk + 1.5, rate: 80, life: 1.0, seed: 61, size: 1.8, rise: 80, spread: 200, emit: () => [800, 700] });
    warm(ctx, 800, 690, 260 * sw, 0.7 * sw, SPR.gold);
  }
  if (turn < 1) {
    const wq = gallopPose(0.3, { x: 800, y: 760 - Math.sin(flip * PI) * 120, s: 1.6, dir: 1, neck: 1.0, head: 0.4 }, 0.5);
    ctx.save(); ctx.translate(800, 700 - Math.sin(flip * PI) * 120); ctx.rotate(-Ease.ioS(flip) * TAU); ctx.translate(-800, -(700 - Math.sin(flip * PI) * 120));
    withAlpha(ctx, 1 - turn, (c) => drawQuad(c, P, wq, 'wolf', t));
    ctx.restore();
  }
  if (turn > 0) {
    const el = Object.assign({}, PZ.stand, { x: 800, s: 132, dir: 1, sF: 0.4, eF: 1.1, hem: 0.3, sway: 0.2 * Math.sin(t * 2) });
    groundPose(el, 830);
    withAlpha(ctx, turn, (c) => human(c, el, COSTUME.elena));
  }
  // обманутый царь хлопает в ладоши
  const ts = Object.assign({}, PZ.open, { x: 1180, s: 132, dir: -1, sF: 1.2 + Math.max(0, Math.sin(t * 9)) * 0.4 * turn, eF: 0.8 });
  groundPose(ts, 834);
  human(ctx, ts, COSTUME.tsar);
}
/* Средник: Иван и Елена на златогривом коне, в руках — клетка с Жар-птицей, рядом волк */
function* buildMedallion() {
  const p = new Pic(), R = rng(5500);
  hill(p, -100, 900, 700, 140, { tones: TONES.far, peak: 0.5, seed: 81, gold: 2, edge: 'rgba(200,215,235,0.28)' });
  yield;
  hill(p, 600, 1700, 690, 170, { tones: TONES.far, peak: 0.45, seed: 82, gold: 2, edge: 'rgba(200,215,235,0.28)' });
  yield;
  palace(p, 1040, 700, 70);
  yield;
  for (let i = 0; i < 5; i++) treeFir(p, 420 + i * 40, 700, 100 + R() * 40, { R, layers: 7 });
  yield;
  hill(p, -100, 1700, 900, 150, { tones: TONES.olive, peak: 0.5, flat: 0.35, seed: 83, gold: 8 });
  yield;
  for (let i = 0; i < 9; i++) tulip(p, 300 + i * 120 + R() * 30, 880 + R() * 20, 34, i % 2 ? C.cinHi : C.wht, R);
  yield;
  return p;
}
function medallionScene(ctx, t) {
  const cam = { x: 800, y: 520, z: 1.05 };
  applyCam(ctx, R.base, cam);
  const st = lazy('medStars', () => makeStars(550, 80, 40, 40, 1560, 560));
  drawStars(ctx, P, st, t, 1);
  drawMoon(ctx, P, 1120, 170, 30);
  lazy('medallion', buildMedallion).draw(ctx, P);
  const ph = t * 1.9;
  const hq = gallopPose(ph, { x: 770, y: 718, s: 1.75, dir: 1, neck: 0.45, head: 0.75 }, 0.55);
  const hr = drawQuad(ctx, P, hq, 'goldhorse', t, { saddle: C.cin });
  const b = Math.sin(ph * TAU * 2) * 3;
  const el = Object.assign({}, PZ.ride, { x: hr.saddle[0] - 26, y: hr.saddle[1] - 14 + b, s: 118, dir: 1, sF: 1.2, eF: 1.3, hem: 0.8, sway: 0.4 });
  human(ctx, el, COSTUME.elena);
  const iv = Object.assign({}, PZ.ride, { x: hr.saddle[0] + 10, y: hr.saddle[1] - 16 + b, s: 124, dir: 1, sF: 2.1, eF: 0.8, sB: 1.0 });
  const J = human(ctx, iv, COSTUME.ivan);
  hatFeather(ctx, iv, J, t, 1, 40);
  const hw = humanWorld(iv, J.armF.H);
  drawCage(ctx, hw[0] + 4, hw[1] + 96, 62, t, { bird: true, glow: 1.2, fire: 1 });
  const wq = gallopPose(ph + 0.35, { x: 660, y: 808, s: 1.45, dir: 1, neck: 1.1, head: 0.3 }, 0.7);
  drawQuad(ctx, P, wq, 'wolf', t);
  warm(ctx, hw[0], hw[1] + 50, 360, 0.3);
}
/* видно ли клеймо при текущей «камере иконы» */
function slotVisible(meta, r) {
  const x0 = meta[0] * r[0] + meta[4], y0 = meta[3] * r[1] + meta[5];
  const x1 = meta[0] * (r[0] + r[2]) + meta[4], y1 = meta[3] * (r[1] + r[3]) + meta[5];
  return x1 > BORDER && x0 < W - BORDER && y1 > BORDER && y0 < H - BORDER;
}
function drawIconAll(ctx, t, meta, o = {}) {
  const k0 = o.k || [FREEZE, 0, 0, 0];
  const S = ICON.slots;
  if (slotVisible(meta, S[0])) inSlot(ctx, meta, S[0], (c) => alarmScene(c, 75 + FREEZE, FREEZE));
  if (slotVisible(meta, S[1])) inSlot(ctx, meta, S[1], (c) => stableScene(c, t, k0[1]));
  if (slotVisible(meta, S[2])) inSlot(ctx, meta, S[2], (c) => elenaScene(c, t, k0[2]));
  if (slotVisible(meta, S[3])) inSlot(ctx, meta, S[3], (c) => magicScene(c, t, k0[3]));
  if (slotVisible(meta, ICON.med)) inSlot(ctx, meta, ICON.med, (c) => medallionScene(c, t));
  iconFrames(ctx, meta, 1, t);
}
cap(79.3, 83.0, 'За птицу — коня златогривого, за коня — Елену Прекрасную.');
cap(83.4, 87.7, 'И всякий раз серый волк выручал Ивана.');
cap(88.5, 92.3, 'Долго ли, коротко ли — добыл Иван и птицу, и коня, и невесту.', 'top');
shot(78.75, 92.5, (ctx, t, lt) => {
  const S = ICON.slots;
  const c = (r, z) => ({ x: r[0] + r[2] / 2, y: r[1] + r[3] / 2, z });
  const full = { x: W / 2, y: H / 2, z: 1 };
  const zK = 2.15;
  const mk = key(lt, [
    [0, full], [0.9, c(S[1], zK), 'ioC'], [3.6, c(S[1], zK + 0.08)],
    [4.4, c(S[2], zK), 'ioC'], [7.3, c(S[2], zK + 0.08)],
    [8.1, c(S[3], zK), 'ioC'], [10.0, c(S[3], zK + 0.06)],
    [11.6, full, 'ioC'], [13.75, { x: W / 2, y: H / 2, z: 1.02 }],
  ]);
  const meta = camMatrix(mk);
  const k = [FREEZE, clamp(lt - 0.2, 0, 3.6), clamp(lt - 3.75, 0, 3.6), clamp(lt - 7.5, 0, 2.6)];
  drawIconAll(ctx, t, meta, { k });
}, { name: 'klejma' });

/* ==========================================================================
   СЦЕНА 6. ПРОЩАНИЕ
   ========================================================================== */
/* поворот фигуры: dir плавно проходит через ноль — как разворот плоской куклы */
const turnDir = (lt, t0, d0, d1, dur = 0.26) => lerp(d0, d1, Ease.ioS(inv(t0, t0 + dur, lt)));
/* Елена верхом на златогривом коне, с клеткой в руках */
function elenaOnHorse(ctx, t, x, y, s, ph, stride, o = {}) {
  const hq = walkQuad(ph, { x, y, s, dir: o.dir ?? 1, neck: 0.42, head: 0.78 }, stride);
  const hr = drawQuad(ctx, P, hq, 'goldhorse', t, { saddle: C.cin });
  const el = Object.assign({}, PZ.ride, { x: hr.saddle[0] - 4, y: hr.saddle[1] - 14, s: s * 76, dir: o.dir ?? 1, sF: 1.25, eF: 1.25, sB: 1.0, eB: 1.3, hem: 0.3, torso: 0.05, sway: 0.1 * Math.sin(t * 2) });
  const J = human(ctx, el, COSTUME.elena);
  const hw = humanWorld(el, J.armF.H);
  drawCage(ctx, hw[0] + 6 * (o.dir ?? 1), hw[1] + 50, 44, t, { bird: true, glow: 1.3, fire: 1 });
  return { hr, hw };
}
cap(93.2, 97.3, '— Здесь я съел твоего коня. Здесь и простимся, Иван.', 'top');
shot(92.5, 97.5, (ctx, t, lt) => {
  const cam = { x: key(lt, [[0, 700], [5, 760]]), y: key(lt, [[0, 600], [5, 610]]), z: key(lt, [[0, 1.25], [5, 1.35]]) };
  const go = inv(0, 2.6, lt);
  const ph = key(lt, [[0, 0], [2.6, 2.4, 'outQ']]);
  let cage = null, ivp = null;
  drawCross(ctx, t, cam, {
    dawn: 1, text: 1, textA: 0.8,
    actors: (c) => {
      const wx = lerp(360, 830, Ease.outQ(go));
      const wq = walkQuad(ph * 1.1 + 0.3, { x: wx, y: 790, s: 1.5, dir: turnDir(lt, 2.9, 1, -1), neck: 1.1, head: 0.45, tail: 0.8 }, 0.3 * (1 - sstep(2.3, 2.6, lt)));
      drawQuad(c, P, wq, 'wolf', t);
      const eh = elenaOnHorse(c, t, lerp(80, 470, Ease.outQ(go)), 800, 1.45, ph, 0.32 * (1 - sstep(2.3, 2.6, lt)));
      cage = eh.hw;
      const iv = Object.assign(walkPose(ph * 1.2, { sF: 1.1, eF: 0.4 }), { x: lerp(170, 610, Ease.outQ(go)), s: 128, dir: 1 });
      if (lt > 2.6) Object.assign(iv, mix(iv, Object.assign({}, PZ.stand, { x: iv.x, s: 128, dir: 1 }), sstep(2.6, 3.0, lt)));
      groundPose(iv, 832);
      const J = human(c, iv, COSTUME.ivan);
      ivp = hatFeather(c, iv, J, t, 0.8, 42);
    },
    light: [800, 500, 900, 0.3],
    dark: 0.12, lights: [[800, 500, 800, 1]],
    top: (c) => { if (cage) warm(c, cage[0], cage[1] + 30, 220, 0.3); if (ivp) warm(c, ivp[0], ivp[1], 120, 0.2); },
  });
}, { name: 'arrive', dis: 0.8 });

/* ---------- 6.2 Иван кланяется волку до земли ---------- */
shot(97.5, 102.5, (ctx, t, lt) => {
  const cam = { x: key(lt, [[0, 820], [5, 830]]), y: key(lt, [[0, 650], [5, 660]]), z: key(lt, [[0, 1.75], [5, 1.85]]) };
  let fpos = null;
  drawCross(ctx, t, cam, {
    dawn: 1, text: 1, textA: 0.8,
    actors: (c) => {
      // Иван: снимает шапку → земной поклон → выпрямляется
      const hatK = sstep(0.15, 0.9, lt);
      const bowK = key(lt, [[0, 0], [1.15, 0], [2.55, 1, 'ioS'], [3.35, 1], [4.45, 0, 'ioS']]);
      let iv = mix(PZ.stand, Object.assign({}, PZ.hatOff), hatK);
      iv = mix(iv, PZ.bow, bowK);
      Object.assign(iv, { x: 712, s: 140, dir: 1 });
      groundPose(iv, 842);
      const J = human(c, iv, COSTUME.ivanBare);
      // шапка в руке, перо светится у самой земли
      const hw = humanWorld(iv, J.armF.W);
      const hatRot = lerp(0, -0.9, hatK) + bowK * 0.6;
      hatProp(c, hw[0] + 6, hw[1] + 8, 140, hatRot);
      const fa = -2.3 + hatRot;
      drawFeather(c, P, hw[0] - 2, hw[1] - 4, fa, 50, t, { fire: 0.9, barbs: 12, seed: 9 });
      fpos = [hw[0], hw[1]];
      // волк сидит и склоняет голову в ответ
      const nod = key(lt, [[0, 0], [1.7, 0], [2.7, 1, 'ioS'], [3.5, 1], [4.3, 0, 'ioS']]);
      const wq = sitWolf({ x: 990, y: 806, s: 1.6, dir: -1, head: 0.45 + nod * 0.55, neck: 0.55 + nod * 0.45, ear: -nod * 0.5, tail: 0.95, tailWave: 0.25 });
      drawQuad(c, P, wq, 'wolf', t);
    },
    light: [800, 520, 800, 0.3],
    dark: 0.1, lights: [[800, 520, 800, 1]],
    top: (c) => { if (fpos) warm(c, fpos[0], fpos[1], 140, 0.3); },
  });
}, { name: 'bow' });

/* ---------- 6.3 Волк уходит, оглядывается, воет — и скрывается в лесу ---------- */
shot(102.5, 107.5, (ctx, t, lt) => {
  const cam = { x: key(lt, [[0, 830], [5, 880]]), y: key(lt, [[0, 560], [5, 540]]), z: key(lt, [[0, 1.15], [5, 1.1]]) };
  let fp = null;
  drawCross(ctx, t, cam, {
    dawn: 1, text: 1, textA: 0.8,
    actors: (c) => {
      // Елена и Иван у камня
      elenaOnHorse(c, t, 470, 812, 1.3, 0.1, 0);
      const wave = sstep(1.3, 1.9, lt);
      const iv = Object.assign(mix(PZ.stand, PZ.wave, wave), { x: 640, s: 118, dir: 1 });
      iv.sF += Math.sin(t * 6) * 0.1 * wave;
      groundPose(iv, 842);
      const J = human(c, iv, COSTUME.ivan);
      fp = hatFeather(c, iv, J, t, 1, 38);
      // волк: рысью на гребень → оглянулся, завыл → ушёл в лес
      const up = Ease.ioS(inv(0.2, 2.6, lt)), up2 = inv(4.1, 5.0, lt);
      const wx = lerp(960, 1290, up) + up2 * 120, wy = lerp(800, 566, up) - up2 * 10;
      const ws = lerp(1.5, 0.95, up);
      const dir = lt < 3.0 ? 1 : lt < 4.0 ? turnDir(lt, 2.75, 1, -1) : turnDir(lt, 3.85, -1, 1);
      const howl = bump(3.05, 3.35, 3.7, 3.95, lt);
      const moving = up < 1 ? 1 : lt > 4.1 ? 1 : 0;
      const wq = walkQuad(lt * 1.6, { x: wx, y: wy, s: ws, dir, neck: lerp(1.0, 0.2, howl), head: lerp(0.35, -0.75, howl), jaw: howl * 0.5, tail: 0.75, ear: -0.2 }, 0.36 * moving + 0.01);
      withAlpha(c, 1 - sstep(4.35, 4.95, lt), (cc) => drawQuad(cc, P, wq, 'wolf', t));
    },
    light: [900, 500, 900, 0.3],
    dark: 0.08, lights: [[800, 500, 900, 1]],
    top: (c) => { if (fp) warm(c, fp[0], fp[1], 100, 0.2); },
  });
}, { name: 'leave' });

/* ---------- 6.4 Дома: Жар-птица освещает царство ---------- */
cap(108.3, 113.2, 'С тех пор в царском саду светло и ночью.', 'top');
function homeFinale(ctx, t, lt, cam, o = {}) {
  const k = o.k ?? 1;
  const b = perchedBird(t, lt, { glow: 1.6, fire: 1 });
  drawGarden(ctx, t, cam, {
    stone: false, appleGlow: 3, flare: 0.3,
    light: [PERCH[0], PERCH[1], 1100, k],
    actors: (c) => {
      // братья поодаль, понурив головы
      for (const [x, cos] of [[250, COSTUME.dmitri], [330, COSTUME.vasili]]) {
        const bp = Object.assign({}, PZ.stand, { x, s: 118, dir: 1, neck: 0.5, head: 0.35, sF: 0.2, eF: 0.4 });
        groundPose(bp, 792);
        human(c, bp, cos);
      }
      const ivp = Object.assign({}, PZ.stand, { x: 800, s: 130, dir: 1, sF: 0.7, eF: 0.4, head: -0.05 });
      groundPose(ivp, 806);
      const J = human(c, ivp, COSTUME.ivan);
      hatFeather(c, ivp, J, t, 1, 40);
      const el = Object.assign({}, PZ.stand, { x: 872, s: 124, dir: -1, sF: 0.7, eF: 0.4, sway: 0.15 * Math.sin(t * 1.6) });
      groundPose(el, 810);
      human(c, el, COSTUME.elena);
      // царь на холме у терема разводит руками от радости
      const ts = Object.assign({}, PZ.open, { x: 560, s: 64, dir: -1, sF: 1.7 + 0.2 * Math.sin(t * 3), sB: 1.5 });
      groundPose(ts, 552);
      human(c, ts, COSTUME.tsar);
      if (o.wolf) {
        const wq = sitWolf({ x: 1492, y: 548, s: 0.42, dir: -1, head: 0.2, neck: 0.4 });
        withAlpha(c, o.wolf, (cc) => drawQuad(cc, P, wq, 'wolf', t));
      }
    },
    over: (c) => {
      // клетка висит на яблоне, птица поёт
      brushLine(c, [[PERCH[0] + 10, 330], [PERCH[0] + 8, 380]], 1.4, P.gold, Prof.even);
      drawCage(c, PERCH[0] + 8, 520, 96, t, { bird: true, glow: 1.8, fire: 1.1, birdPose: { beak: Math.max(0, Math.sin(t * 5)) * 0.5, neck: [0.1, 0.2, -0.2], head: -0.2 } });
      sparks(c, t, { t0: 0, rate: 20, life: 2.2, seed: 91, size: 1.8, rise: 50, spread: 200, emit: () => [PERCH[0] + 8, 470] });
    },
    dark: 0.16 * k, lights: [[PERCH[0], 470, 900, 1]],
    top: (c) => warm(c, PERCH[0] + 8, 470, 700, 0.3 * k),
  });
}
shot(107.5, 113.75, (ctx, t, lt) => {
  const cam = { x: key(lt, [[0, 900], [5.2, 800, 'ioS']]), y: key(lt, [[0, 560], [5.2, 450, 'ioS']]), z: key(lt, [[0, 1.75], [5.2, 1.0, 'ioS']]) };
  homeFinale(ctx, t, lt, cam);
}, { name: 'home', fin: 0.6 });

/* ---------- 6.5 Конец ---------- */
FILM.sheen = (t) => inv(114.6, 117.6, t);
shot(113.75, 118.75, (ctx, t, lt) => {
  const cam = { x: 800, y: 450, z: key(lt, [[0, 1.0], [5, 0.985]]) };
  homeFinale(ctx, t, lt + 6.25, cam, { wolf: sstep(0.9, 1.9, lt) });
  applyCam(ctx, R.base, { x: W / 2, y: H / 2, z: 1 });
  const a = sstep(0.4, 1.6, lt);
  if (a > 0) {
    ctx.save();
    ctx.font = '104px Ponomar, "Times New Roman", serif';
    ctx.textAlign = 'center';
    const g = ctx.createLinearGradient(0, 190, 0, 290);
    g.addColorStop(0, '#fff0c2'); g.addColorStop(0.4, '#e9c06a'); g.addColorStop(0.7, '#b8842f'); g.addColorStop(1, '#f2d38a');
    ctx.fillStyle = g;
    ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 18;
    ctx.globalAlpha = a;
    ctx.fillText('Конец', W / 2, 270 - (1 - Ease.outC(a)) * 12);
    ctx.restore();
  }
}, { name: 'end', fout: 1.05 });

/* ---------- порядок заблаговременной постройки фонов ---------- */
builder('border', buildBorder);
builder('titleOrn', buildTitleOrn);
builder('garden', buildGarden);
builder('porch', buildPorch);
builder('road', () => buildRoad(4500, { len: 4200 }));
builder('cross', buildCross);
builder('forest', buildForest);
builder('ride', () => buildRoad(6200, { len: 5600, river: true }));
builder('foreign', buildForeign);
builder('stable', buildStable);
builder('meadow', buildMeadow);
builder('medallion', buildMedallion);
