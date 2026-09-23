'use strict';
/* ==========================================================================
   Кот-фонарщик · world.js
   Мир в «2,5D»: каждый план — лист на своей глубине d. Главный план (d=0)
   в опорном кадре совпадает с экраном; дальние листы увеличены в (1+d) раз,
   чтобы в опорном кадре выглядеть как нарисованы. Море — горизонтальная
   плоскость Y_SEA, поэтому полосы волн сами сходятся к горизонту.
   ========================================================================== */

const Y_SEA = 720;          // уровень моря в мире
const REF = { x: 800, y: 560, dist: 1, zoom: 1, sy: 110 };   // опорная камера: горизонт на экране в y=560

/* элемент кадра */
function IT(s, x, y, d, o = {}) {
  return { s, m: mTRS(x, y, o.r || 0, o.sx ?? o.k ?? 1, o.sy ?? o.k ?? 1), d, z: o.z || 0, a: o.a ?? 1, em: o.em };
}
/* лист дальнего плана: (u,v) — где он стоит в опорном кадре, k — натуральный масштаб */
function FAR(s, u, v, d, o = {}) {
  const f = 1 + d;
  return IT(s, REF.x + (u - REF.x) * f, REF.y + (v - REF.y) * f, d, { ...o, sx: (o.sx ?? o.k ?? 1) * f, sy: (o.sy ?? o.k ?? 1) * f });
}
const farX = (u, d) => REF.x + (u - REF.x) * (1 + d);
const farY = (v, d) => REF.y + (v - REF.y) * (1 + d);

const WORLD = {
  statics: [],      // неподвижные листы
  lamps: [],        // {x, y, d, k (масштаб), post, at (время зажжения), id}
  wins: [],         // окна: {x,y,w,h,d,s,at}
  farWins: [],
  stars: [],
  clouds: [],
  seaDepths: [0.1, 0.32, 0.6, 1.0, 1.55, 2.3, 3.4, 5, 7.5, 11, 17, 26],
};

/* ---------- море: полоса волны, бесшовная по X ---------- */
const SEA_W = 1200;
function seaParts() {
  const cols = ['#18264A', '#1C2B4F', '#213155', '#27375B', '#2E3D61', '#364467', '#3F4B6E', '#495375', '#545C7C', '#5F6683', '#6A6F8A', '#747791'];
  cols.forEach((c, i) => {
    def('sea.' + i, {
      res: 0.9, seed: 400 + i, maxQ: 1.1,
      draw(g) {
        const n = 6 + (i % 3) * 2, A = 9 + (12 - i) * 0.9, ph = hash1(i, 3) * TAU;
        const top = (x) => {
          const u = x / SEA_W;
          let y = -A * Math.pow(Math.abs(Math.sin(Math.PI * n * u + ph)), 0.7);
          for (let k = 1; k <= 24; k++) y += Math.sin(TAU * (k * 5 + i) * u + k * 1.7) * (1.4 / k);
          return y;
        };
        const pts = [-4, 520];
        for (let x = -4; x <= SEA_W + 4; x += 4) pts.push(x, top(x));
        pts.push(SEA_W + 4, 520);
        g.paper([pts], c, { edge: 'clean', bevel: 0, mottle: 0.7, grain: 0.9, draw: (p) => {
          const hl = [];
          for (let x = -4; x <= SEA_W + 4; x += 4) hl.push(x, top(x) + 1.2);
          p.line(hl, 2.2, shade(c, 0.32), 0.7, { wob: 0 });
          const dk = [];
          for (let x = -4; x <= SEA_W + 4; x += 4) dk.push(x, top(x) + 11);
          p.line(dk, 9, shade(c, -0.22), 0.35, { wob: 0 });
          const r = rng(90 + i);
          for (let k = 0; k < 16; k++) { const x = r() * SEA_W, y = 14 + r() * 60; p.line([x, y, x + 20 + r() * 40, y + (r() - 0.5) * 3], 1.6, shade(c, 0.18), 0.35); }
        } });
      },
    });
  });
}

/* ---------- пристань и набережная ---------- */
function harborParts() {
  def('quay', { res: 0.9, shadow: SHADOW_BG, draw(g) {
    g.paper(rect(0, 0, 340, 640), PAL.stone, { grad: [0.08, -0.25], draw: (p) => {
      const r = rng(5);
      for (let row = 0; row < 16; row++) for (let c = 0; c < 6; c++) {
        const x = c * 62 + (row % 2) * 31 - 20, y = 14 + row * 40;
        p.paint(rrect(x + 3, y + 3, 56, 34, 6), shade(PAL.stone, (r() - 0.5) * 0.25), 0.8);
        p.line([x + 2, y + 38, x + 60, y + 38], 1.2, PAL.stoneD, 0.6);
      }
    } });
    g.paper(rect(-8, -10, 356, 16), shade(PAL.stone, 0.15), { k: 1 });
  } });
  def('pier.deck', { res: 0.9, shadow: SHADOW, draw(g) {
    g.paper(rect(0, 0, 1280, 20), PAL.wood, { draw: (p) => {
      for (let x = 0; x < 1280; x += 38) p.line([x, 0, x + 1, 20], 1.2, PAL.woodD, 0.8);
      p.line([0, 6, 1280, 7], 0.8, PAL.woodL, 0.5); p.line([0, 14, 1280, 13], 0.8, PAL.woodD, 0.5);
    } });
    g.paper(rect(0, 20, 1280, 10), PAL.woodD, { k: 0.8 });
  } });
  def('pier.pile', { res: 1, shadow: SHADOW, draw(g) {
    g.paper(rect(-9, 0, 18, 210), PAL.woodD, { grad: [0.1, -0.2], draw: (p) => { p.line([-3, 10, -2, 200], 1, PAL.wood, 0.7); p.paint(rect(-9, 60, 18, 90), '#2E3E3E', 0.45); } });
  } });
  def('bollard', { res: 1.4, shadow: SHADOW, draw(g) {
    g.paper(parsePath('M -10 0 L -8 -26 Q 0 -34 8 -26 L 10 0 Z'), PAL.iron, { k: 0.7 });
    g.paper(rect(-13, -30, 26, 6), PAL.ironL, { k: 0.6 });
  } });
  def('rope', { res: 1.2, shadow: SHADOW, draw(g) {
    for (let i = 0; i < 3; i++) g.paper(ell(0, -i * 5, 16 - i * 3, 5), '#B89A6A', { k: 0.6, draw: (p) => p.line([-12 + i * 3, -i * 5, 12 - i * 3, -i * 5], 0.8, '#7E6440', 0.6) });
  } });
}

/* ---------- сборка мира ---------- */
function buildWorld() {
  const S = WORLD.statics;
  // дальние холмы и холм с верхним городом
  S.push(FAR('hill.far', -250, 470, 9, { z: 0 }));
  S.push(FAR('hill.mid', -350, 520, 4.5, { z: 0 }));
  // верхний город на холме
  const ftown = [[-1500, 480, 2], [-900, 470, 0], [-50, 452, 1], [760, 470, 2]];
  ftown.forEach(([u, v, k], i) => {
    S.push(FAR('fartown.' + k, u, v, 1.7, { z: i, k: 1, sx: i % 2 ? -1 : 1 }));
    const r = rng(33 + i);
    for (let n = 0; n < 16; n++) {
      const wu = u + (i % 2 ? -1 : 1) * (20 + r() * 860), wv = v - 40 - r() * 110;
      WORLD.farWins.push({ x: farX(wu, 1.7), y: farY(wv, 1.7), d: 1.69, at: 12 + r() * 16, s: r() < 0.5 ? 'fwin' : 'fwin.s', k: 2.7 });
    }
  });
  S.push(FAR('belltower', 380, 440, 1.2, { z: 5, k: 0.9 }));
  S.push(FAR('tree.poplar', 150, 470, 0.9, { z: 5 }));
  S.push(FAR('tree.poplar', 1180, 500, 0.8, { z: 5, k: 0.85 }));
  // средний план: дома через улицу
  let u = -900, i = 0;
  while (u < 2560) {
    const w = 170 + ((i * 53) % 90), roofH = 50 + ((i * 29) % 40), eaveV = 390 + Math.max(0, u) * 0.028 + ((i * 17) % 30);
    const id = 'mid.' + i;
    makeMidHouse(id, w, 900, roofH, WALLS[(i * 3 + 1) % WALLS.length], ROOFS[(i + 1) % ROOFS.length]);
    const X = farX(u, 0.55), Y = farY(eaveV, 0.55);
    S.push(IT(id, X, Y, 0.55, { k: 1.55, z: i % 2 }));
    const mh = MIDHOUSES[MIDHOUSES.length - 1];
    for (const wd of mh.wins) {
      if (hash1(i * 31 + wd[1], 7) < 0.32) continue;
      WORLD.wins.push({ x: X + wd[0] * 1.55, y: Y + wd[1] * 1.55, d: 0.549, s: 'win.litm', k: 1.55, at: 11 + hash1(i * 7 + wd[0], 3) * 17 });
    }
    // фонарь на улице между домами
    if (i % 2 === 1) WORLD.lamps.push({ x: X - 16, y: Y + 60 * 1.55, d: 0.548, k: 1.2, post: true, at: 25.2 + (u + 900) / 3460 * 2.2 });
    u += w + 8 + ((i * 13) % 20);
    i++;
  }
  // главный план: дома по гребням которых идёт кот
  makeHouse('h.-2', -900, 400, 440, 90, { wall: PAL.teal });
  makeHouse('h.-1', -460, 430, 420, 100, { wall: PAL.rosewall });
  makeHouse('h.0', -40, 470, 470, 170, { wall: PAL.ochre, roof: PAL.roof, dormer: 170, chimneys: [390] });
  makeHouse('h.1', 430, 480, 400, 82, { wall: PAL.cream, roof: PAL.slate, chimneys: [300] });
  makeHouse('h.2', 960, 500, 470, 86, { wall: PAL.terra, roof: PAL.roofD, chimneys: [110] });
  makeHouse('h.3', 1430, 560, 520, 90, { wall: PAL.sage, roof: PAL.roof, chimneys: [420] });
  makeHouse('h.4', 1950, 590, 440, 80, { wall: PAL.ochreL, roof: PAL.slate });
  makeHouse('h.5', 2390, 620, 420, 70, { wall: PAL.rosewall, roof: PAL.roofL });
  makeHouse('h.6', 2810, 650, 380, 60, { wall: PAL.teal, roof: PAL.roofD });
  HOUSES.forEach((h, k) => {
    S.push(IT(h.id, h.x, h.eave, 0, { z: 10 + (k % 2) }));
    for (const wd of h.wins) {
      if (hash1(k * 17 + wd[0], 9) < 0.25) continue;
      WORLD.wins.push({ x: h.x + wd[0], y: h.eave + wd[1], d: 0, s: 'win.lit', k: 1, at: 10.5 + hash1(k * 5 + wd[1], 4) * 17, z: 10.5 + (k % 2) });
    }
  });
  // фонари, которые зажигает кот
  WORLD.lamps.push({ id: 'L1', x: 895, y: 392, d: -0.01, k: 1, post: true, at: 15.0 });
  WORLD.lamps.push({ id: 'L2', x: 1300, y: 432, d: -0.01, k: 1, post: true, at: 18.75 });
  WORLD.lamps.push({ id: 'L3', x: 1760, y: 540, d: -0.01, k: 1, post: true, at: 22.5 });
  WORLD.lamps.push({ id: 'L4', x: 2330, y: 580, d: -0.01, k: 1, post: true, at: 26.0 });
  WORLD.lamps.push({ id: 'L5', x: 2790, y: 612, d: -0.01, k: 1, post: true, at: 27.3 });
  // набережная и пристань
  S.push(IT('quay', 3190, 690, 0, { z: 12 }));
  S.push(IT('pier.deck', 3500, 680, 0, { z: 12 }));
  for (let x = 3540; x < 4780; x += 118) S.push(IT('pier.pile', x, 690, 0.012, { z: 11 }));
  S.push(IT('bollard', 3560, 681, -0.004, { z: 13 }));
  S.push(IT('bollard', 4620, 681, -0.004, { z: 13 }));
  S.push(IT('rope', 3600, 682, -0.004, { z: 13 }));
  WORLD.pierLamp = { id: 'LP', x: 4712, y: 470, d: -0.01, k: 1.25, post: true, at: 91.5, pier: true };
  // звёзды: в «небесных» координатах опорного кадра на большой глубине
  const r = rng(2024);
  for (let n = 0; n < 150; n++) {
    const u2 = -500 + r() * 2600, v2 = -900 + r() * 1400;
    const kind = r() < 0.12 ? 0 : r() < 0.45 ? 1 : 2;
    WORLD.stars.push({ x: farX(u2, 40), y: farY(v2, 40), d: 40, s: 'star.' + kind, k: 0.6 + r() * 0.7, at: 13 + r() * 16, ph: r() * TAU, sp: 1.5 + r() * 2.5 });
  }
  // облака
  const cl = [[200, 150, 7, 0], [1100, 90, 9, 2], [-500, 60, 8, 1], [1800, 190, 6, 3], [2600, 120, 8, 0], [3300, 60, 10, 2], [600, -250, 7, 1], [1500, -420, 9, 3]];
  for (const [cu, cv, d, k] of cl) WORLD.clouds.push({ s: 'cloud.' + k, x: farX(cu, d), y: farY(cv, d), d, drift: 6 + (k * 3) });
}

/* ---------- сюжетные состояния: всё — функция от времени фильма T ---------- */
const STORY = {
  night: (T) => sstep(8, 28, T),
  /* зажжён ли фонарь и как «хлопнуло» пламя */
  lampK: (L, T) => (T < L.at ? 0 : 1),
  lampPop: (L, T) => (T < L.at ? 0 : EASE.pop(sat((T - L.at) / 0.32))),
};

/* фонарь → элементы, свет, свечение */
function lampItems(L, T, S, o = {}) {
  const k = L.k || 1, lit = o.lit ?? STORY.lampK(L, T), pop = o.pop ?? STORY.lampPop(L, T), z = L.z ?? 20;
  if (L.post) S.items.push(IT(L.pier ? 'lamp.postP' : 'lamp.post', L.x, L.y + 12 * k, L.d + 0.0005, { k, z: z - 0.1 }));
  S.items.push(IT('lamp.frame', L.x, L.y, L.d, { k, z }));
  S.items.push(IT(lit ? 'lamp.glassLit' : 'lamp.glass', L.x, L.y, L.d, { k, z: z + 0.05 }));
  if (lit > 0) {
    const fl = 0.9 + 0.1 * noise1(T * 9 + L.x, 3), fi = ((Math.floor(T * 11 + L.x) % 3) + 3) % 3;
    S.items.push(IT((o.moon ? 'mflame.' : 'flame.') + fi, L.x, L.y - 8 * k, L.d, { k: k * pop * fl * 0.95, z: z + 0.1, a: 1 }));
    const glowC = o.moon ? [214, 226, 255] : [255, 186, 96];
    S.lights.push({ x: L.x, y: L.y - 22 * k, d: L.d, r: (o.r ?? 260) * k * (0.92 + 0.08 * fl) * (1 + 0.5 * (1 - sat((T - L.at) / 0.8))), k: 0.95 * lit, warm: 0.2 * lit, wc: o.moon ? [190, 205, 255] : undefined });
    S.glows.push({ x: L.x, y: L.y - 20 * k, d: L.d, r: 70 * k * (1 + 0.8 * (1 - sat((T - L.at) / 0.5))), a: 0.55 * fl * lit, c: o.moon ? [225, 232, 255] : [255, 214, 140] });
    S.glows.push({ x: L.x, y: L.y - 20 * k, d: L.d, r: 230 * k, a: 0.13 * lit, c: glowC });
  }
}
