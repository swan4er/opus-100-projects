/* ================================================================
   world.js — квартира в хрущёвке 1974 года и двор за окном.
   Координаты в метрах. Y вверх, пол на y = 0, потолок 2,5 м.
   Окна и балкон — на стене z = 0 (смотрят на запад, вечером солнце
   бьёт прямо в зал). Все стены — плоскости «изнутри комнаты».
   ================================================================ */
'use strict';
const H = 2.5;
const W = {
  scene: null, colliders: [], inter: [], occl: [], paintables: [], objs: {}, mats: {}, lights: {},
  rooms: {
    zal:  { x0: 0,    x1: 5.0, z0: 0,    z1: 3.8, name: 'зал' },
    kit:  { x0: 5.12, x1: 7.6, z0: 0,    z1: 3.8, name: 'кухня' },
    bath: { x0: 0,    x1: 1.9, z0: 3.92, z1: 5.6, name: 'ванная' },
    hall: { x0: 2.02, x1: 7.6, z0: 3.92, z1: 5.6, name: 'прихожая' },
    balc: { x0: 2.5,  x1: 4.9, z0: -1.25, z1: -0.3, name: 'балкон' },
  },
  // проёмы: двери (низ = 0) проходимы, окна — нет
  doors: {
    D1: { x: 4.3, z: 3.86, a: 'zal', b: 'hall' },
    D2: { x: 5.87, z: 3.86, a: 'kit', b: 'hall' },
    D3: { x: 1.96, z: 4.62, a: 'bath', b: 'hall' },
    BD: { x: 3.47, z: -0.15, a: 'zal', b: 'balc' },
  },
};

/* ---------- мелкие помощники ---------- */
function mat(o) { return new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.85, metalness: 0 }, o)); }
function addMesh(geo, m, x = 0, y = 0, z = 0, parent) {
  const me = new THREE.Mesh(geo, m); me.position.set(x, y, z);
  (parent || W.scene).add(me); me.castShadow = true; me.receiveShadow = true; return me;
}
function box(w, h, d, m, x, y, z, parent) { return addMesh(new THREE.BoxGeometry(w, h, d), m, x, y, z, parent); }
function bx(x0, y0, z0, x1, y1, z1, m, parent) { return box(x1 - x0, y1 - y0, z1 - z0, m, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, parent); }
function rbox(w, h, d, r, m, x, y, z, parent) { return addMesh(new LIB.RoundedBoxGeometry(w, h, d, 3, r), m, x, y, z, parent); }
function cyl(rt, rb, h, m, x, y, z, seg = 16, parent) { return addMesh(new THREE.CylinderGeometry(rt, rb, h, seg), m, x, y, z, parent); }
function sph(r, m, x, y, z, parent, ws = 16, hs = 12) { return addMesh(new THREE.SphereGeometry(r, ws, hs), m, x, y, z, parent); }
function flatGeo(g) { const n = g.index ? g.toNonIndexed() : g; n.computeVertexNormals(); return n; }
function solid(x0, z0, x1, z1) { W.colliders.push([Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)]); }
function tagMesh(me, t, paint = true) { me.userData.tag = t; if (paint) W.paintables.push(me); return me; }
function tagAll(obj, t, paint = true) { obj.traverse((o) => { if (o.isMesh) tagMesh(o, t, paint); }); return obj; }
function occl(me) { W.occl.push(me); return me; }
// невидимый объём для взаимодействия
function hitBox(x0, y0, z0, x1, y1, z1, it) {
  const me = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), W.mats.hit);
  me.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); me.visible = false;
  me.userData.it = it; W.scene.add(me); W.inter.push(me); return me;
}
function markInter(me, it) { me.userData.it = it; W.inter.push(me); return me; }
function roomAt(x, z) {
  for (const k in W.rooms) { const r = W.rooms[k]; if (x >= r.x0 - 0.02 && x <= r.x1 + 0.02 && z >= r.z0 - 0.02 && z <= r.z1 + 0.02) return k; }
  if (z < 0 && z > -0.35) return 'zal';
  if (z > 3.75 && z < 3.97) return x < 5.06 ? 'zal' : 'kit';
  if (x > 1.85 && x < 2.07) return 'hall';
  return 'hall';
}

/* ---------- стена с проёмами ---------- */
// side: N (z = z0, смотрит +z), S, W (x = x0, смотрит +x), E. openings в абсолютных координатах вдоль стены
function wallGeo(room, side, openings = [], y0 = 0, y1 = H) {
  const r = room;
  let a, dir, len, toS;
  if (side === 'N') { a = [r.x0, r.z0]; dir = [1, 0]; len = r.x1 - r.x0; toS = (c) => c - r.x0; }
  if (side === 'S') { a = [r.x1, r.z1]; dir = [-1, 0]; len = r.x1 - r.x0; toS = (c) => r.x1 - c; }
  if (side === 'W') { a = [r.x0, r.z1]; dir = [0, -1]; len = r.z1 - r.z0; toS = (c) => r.z1 - c; }
  if (side === 'E') { a = [r.x1, r.z0]; dir = [0, 1]; len = r.z1 - r.z0; toS = (c) => c - r.z0; }
  const ops = openings.map((o) => { const s0 = toS(o.c0), s1 = toS(o.c1); return { s0: Math.min(s0, s1), s1: Math.max(s0, s1), y0: o.y0, y1: o.y1 }; });
  const cuts = new Set([0, len]); ops.forEach((o) => { cuts.add(Math.max(0, o.s0)); cuts.add(Math.min(len, o.s1)); });
  const xs = [...cuts].sort((p, q) => p - q);
  const rects = [];
  for (let i = 0; i < xs.length - 1; i++) {
    const s0 = xs[i], s1 = xs[i + 1]; if (s1 - s0 < 1e-4) continue;
    const o = ops.find((q) => q.s0 <= s0 + 1e-4 && q.s1 >= s1 - 1e-4);
    if (!o) rects.push([s0, y0, s1, y1]);
    else { if (o.y0 > y0) rects.push([s0, y0, s1, Math.min(o.y0, y1)]); if (o.y1 < y1) rects.push([s0, Math.max(o.y1, y0), s1, y1]); }
  }
  const nrm = { N: [0, 0, 1], S: [0, 0, -1], W: [1, 0, 0], E: [-1, 0, 0] }[side];
  const pos = [], nor = [], uv = [], idx = [];
  rects.forEach(([s0, ya, s1, yb], i) => {
    const P = (s, y) => [a[0] + dir[0] * s, y, a[1] + dir[1] * s];
    [[s0, ya], [s1, ya], [s1, yb], [s0, yb]].forEach(([s, y]) => { pos.push(...P(s, y)); nor.push(...nrm); uv.push(s, y); });
    const b = i * 4; idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return { geo: g, a, dir, len, ops, nrm };
}
function buildWall(room, side, openings, m, tag) {
  const w = wallGeo(room, side, openings);
  const me = addMesh(w.geo, m); me.castShadow = true;
  occl(me); tagMesh(me, tag || 'wall');
  // коллайдер: полоса толщиной 6 см за стеной, двери — разрывы
  const T = 0.06, r = room;
  const doorOps = w.ops.filter((o) => o.y0 < 0.3).sort((p, q) => p.s0 - q.s0);
  let s = -T; const segs = [];
  for (const o of doorOps) { segs.push([s, o.s0]); s = o.s1; }
  segs.push([s, w.len + T]);
  for (const [s0, s1] of segs) {
    if (s1 - s0 < 0.01) continue;
    if (side === 'N') solid(r.x0 + s0, r.z0 - T, r.x0 + s1, r.z0);
    if (side === 'S') solid(r.x1 - s1, r.z1, r.x1 - s0, r.z1 + T);
    if (side === 'W') solid(r.x0 - T, r.z1 - s1, r.x0, r.z1 - s0);
    if (side === 'E') solid(r.x1, r.z0 + s0, r.x1 + T, r.z0 + s1);
  }
  // плинтус
  if (tag !== 'bathwall') {
    for (const [s0, s1] of segs) {
      const a0 = Math.max(0, s0), a1 = Math.min(w.len, s1); if (a1 - a0 < 0.05) continue;
      const mid = (a0 + a1) / 2, L = a1 - a0;
      const cx = w.a[0] + w.dir[0] * mid + w.nrm[0] * 0.01, cz = w.a[1] + w.dir[1] * mid + w.nrm[2] * 0.01;
      const sk = box(side === 'N' || side === 'S' ? L : 0.02, 0.07, side === 'N' || side === 'S' ? 0.02 : L, W.mats.skirting, cx, 0.035, cz);
      sk.castShadow = false;
    }
  }
  return me;
}
function floorCeil(room, fm, repeatScale = 1) {
  const r = room, w = r.x1 - r.x0, d = r.z1 - r.z0;
  const g = new THREE.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w * repeatScale, uv.getY(i) * d * repeatScale);
  const f = addMesh(g, fm, (r.x0 + r.x1) / 2, 0, (r.z0 + r.z1) / 2); f.castShadow = false; tagMesh(f, 'floor');
  const gc = new THREE.PlaneGeometry(w, d); gc.rotateX(Math.PI / 2);
  const uc = gc.attributes.uv; for (let i = 0; i < uc.count; i++) uc.setXY(i, uc.getX(i) * w, uc.getY(i) * d);
  const c = addMesh(gc, W.mats.ceiling, (r.x0 + r.x1) / 2, H, (r.z0 + r.z1) / 2); tagMesh(c, 'ceiling');
  return f;
}
// дверная коробка и наличники; axis: вдоль какой оси идёт стена
function doorFrame(axis, c0, c1, at, thick, top = 2.05, m) {
  m = m || W.mats.trim;
  const L = c1 - c0, mid = (c0 + c1) / 2;
  if (axis === 'x') {
    bx(c0 - 0.02, 0, at - thick / 2, c0, top, at + thick / 2, m); bx(c1, 0, at - thick / 2, c1 + 0.02, top, at + thick / 2, m);
    bx(c0 - 0.02, top, at - thick / 2, c1 + 0.02, top + 0.02, at + thick / 2, m);
    for (const s of [-1, 1]) {
      const z = at + s * (thick / 2 + 0.008);
      bx(c0 - 0.09, 0, z - 0.008, c0 - 0.02, top + 0.07, z + 0.008, m); bx(c1 + 0.02, 0, z - 0.008, c1 + 0.09, top + 0.07, z + 0.008, m);
      bx(c0 - 0.09, top + 0.02, z - 0.008, c1 + 0.09, top + 0.09, z + 0.008, m);
    }
  } else {
    bx(at - thick / 2, 0, c0 - 0.02, at + thick / 2, top, c0, m); bx(at - thick / 2, 0, c1, at + thick / 2, top, c1 + 0.02, m);
    bx(at - thick / 2, top, c0 - 0.02, at + thick / 2, top + 0.02, c1 + 0.02, m);
    for (const s of [-1, 1]) {
      const x = at + s * (thick / 2 + 0.008);
      bx(x - 0.008, 0, c0 - 0.09, x + 0.008, top + 0.07, c0 - 0.02, m); bx(x - 0.008, 0, c1 + 0.02, x + 0.008, top + 0.07, c1 + 0.09, m);
      bx(x - 0.008, top + 0.02, c0 - 0.09, x + 0.008, top + 0.09, c1 + 0.09, m);
    }
  }
  // порог
  if (axis === 'x') bx(c0, -0.02, at - thick / 2, c1, 0.012, at + thick / 2, W.mats.skirting);
  else bx(at - thick / 2, -0.02, c0, at + thick / 2, 0.012, c1, W.mats.skirting);
  return mid + L * 0;
}

/* ---------- окно в наружной стене z = 0 (толщина 0,3) ---------- */
function windowUnit(x0, x1, y0, y1, opts = {}) {
  const g = new THREE.Group(); W.scene.add(g);
  const T = 0.3, zf = -0.14;
  // откосы
  bx(x0, y0 - 0.02, -T, x1, y0, 0, W.mats.reveal, g);
  bx(x0, y1, -T, x1, y1 + 0.02, 0, W.mats.reveal, g);
  bx(x0 - 0.02, y0, -T, x0, y1, 0, W.mats.reveal, g);
  bx(x1, y0, -T, x1 + 0.02, y1, 0, W.mats.reveal, g);
  const parts = [];
  const fm = opts.frameMat ? () => opts.frameMat.clone() : () => W.mats.frame;
  const part = (a, b, c, d, name) => { const me = bx(a, b, zf - 0.035, c, d, zf + 0.035, fm(), g); me.userData.part = name; parts.push(me); return me; };
  const f = 0.06, mx = x0 + (x1 - x0) * 0.5;
  part(x0, y0, x0 + f, y1, 'левая стойка рамы');
  part(x1 - f, y0, x1, y1, 'правая стойка рамы');
  part(x0 + f, y1 - f, x1 - f, y1, 'верх рамы');
  part(x0 + f, y0, x1 - f, y0 + f, 'низ рамы');
  part(mx - f / 2, y0 + f, mx + f / 2, y1 - f, 'средний импост');
  part(x0 + f, y1 - 0.42, mx - f / 2, y1 - 0.42 + f * 0.8, 'рама форточки');
  // стекло
  const glass = box(x1 - x0 - 0.04, y1 - y0 - 0.04, 0.01, W.mats.glass, (x0 + x1) / 2, (y0 + y1) / 2, zf, g);
  glass.castShadow = false; glass.receiveShadow = false; tagMesh(glass, 'glass');
  // подоконник
  if (opts.sill !== false) { const s = bx(x0 - 0.06, y0 - 0.04, -0.12, x1 + 0.06, y0, 0.06, W.mats.sill, g); tagMesh(s, 'sill'); }
  // отлив снаружи
  bx(x0, y0 - 0.05, -0.36, x1, y0 - 0.03, -0.28, W.mats.tin, g);
  parts.forEach((p) => tagMesh(p, opts.tag || 'frame'));
  return { group: g, parts, glass };
}

/* ---------- мебель и предметы ---------- */
function makeCrystal(x, y, z, kind, parent) {
  const m = W.mats.crystal;
  if (kind === 'vase') {
    const pts = [[0, 0], [0.05, 0], [0.055, 0.02], [0.035, 0.07], [0.06, 0.16], [0.075, 0.24], [0.068, 0.25]].map(([a, b]) => new THREE.Vector2(a, b));
    const me = addMesh(flatGeo(new THREE.LatheGeometry(pts, 10)), m, x, y, z, parent); me.castShadow = false; return me;
  }
  if (kind === 'bowl') {
    const pts = [[0, 0], [0.04, 0], [0.05, 0.03], [0.12, 0.08], [0.14, 0.1]].map(([a, b]) => new THREE.Vector2(a, b));
    const me = addMesh(flatGeo(new THREE.LatheGeometry(pts, 12)), m, x, y, z, parent); me.castShadow = false; return me;
  }
  const me = cyl(0.028, 0.022, 0.1, m, x, y + 0.05, z, 8, parent); me.castShadow = false; return me;
}

function buildZal() {
  const R = W.rooms.zal, M = W.mats;
  const fl = floorCeil(R, M.parquet);
  W.objs.zalWalls = {
    N: buildWall(R, 'N', [{ c0: 1.2, c1: 2.9, y0: 0.85, y1: 2.15 }, { c0: 3.1, c1: 3.85, y0: 0, y1: 2.2 }], M.wallOld),
    S: buildWall(R, 'S', [{ c0: 3.9, c1: 4.7, y0: 0, y1: 2.05 }], M.wallOld),
    W: buildWall(R, 'W', [], M.wallOld),
    E: buildWall(R, 'E', [], M.wallOld),
  };
  // окно и балконная дверь (рама окна — объект покраски)
  const w1 = windowUnit(1.2, 2.9, 0.85, 2.15, { frameMat: M.frameOld, tag: 'frame' });
  W.objs.windowParts = w1.parts; W.objs.windowGlass = w1.glass;
  // балконная дверь: откосы + открытая створка
  bx(3.08, 0, -0.3, 3.1, 2.2, 0, M.reveal); bx(3.85, 0, -0.3, 3.87, 2.2, 0, M.reveal); bx(3.08, 2.2, -0.3, 3.87, 2.22, 0, M.reveal);
  bx(3.1, -0.02, -0.3, 3.85, 0.04, 0, M.sill);
  const leaf = new THREE.Group(); leaf.position.set(3.1, 0, -0.08); leaf.rotation.y = -1.25; W.scene.add(leaf);
  bx(0, 0.04, -0.03, 0.06, 2.16, 0.03, M.frame, leaf); bx(0.69, 0.04, -0.03, 0.75, 2.16, 0.03, M.frame, leaf);
  bx(0.06, 2.1, -0.03, 0.69, 2.16, 0.03, M.frame, leaf); bx(0.06, 0.04, -0.03, 0.69, 0.9, 0.03, M.frame, leaf);
  const lg = box(0.63, 1.2, 0.01, M.glass, 0.375, 1.5, 0, leaf); lg.castShadow = false;
  // батарея под окном: 8 секций (объект покраски)
  const secs = [];
  for (let i = 0; i < 8; i++) {
    const x = 1.64 + i * 0.105;
    const s = rbox(0.085, 0.52, 0.11, 0.02, M.rust, x, 0.4, 0.12);
    s.userData.part = 'секция батареи №' + (i + 1); tagMesh(s, 'radiator'); secs.push(s);
  }
  cyl(0.018, 0.018, 0.92, M.pipe, 2.0, 0.2, 0.12).rotation.z = Math.PI / 2;
  cyl(0.018, 0.018, 0.92, M.pipe, 2.0, 0.6, 0.12).rotation.z = Math.PI / 2;
  cyl(0.016, 0.016, 2.5, M.pipe, 1.48, 1.25, 0.06);
  W.objs.radiator = secs; solid(1.55, 0, 2.5, 0.2);
  // шторы и тюль
  const curtain = (x, w) => {
    const g = new THREE.PlaneGeometry(w, 2.3, 16, 1); const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) / w * Math.PI * 6) * 0.035);
    g.computeVertexNormals();
    const me = addMesh(g, M.curtain, x, 1.2, 0.1); tagMesh(me, 'curtain'); return me;
  };
  curtain(1.02, 0.42); curtain(4.05, 0.42);
  const tulle = addMesh(new THREE.PlaneGeometry(1.2, 2.2), M.tulle, 2.35, 1.22, 0.07); tulle.castShadow = false; tagMesh(tulle, 'curtain');
  cyl(0.012, 0.012, 3.4, M.brass, 2.55, 2.38, 0.08).rotation.z = Math.PI / 2;

  // диван-книжка под ковром
  const sofa = new THREE.Group(); W.scene.add(sofa);
  bx(0.06, 0.1, 1.28, 0.92, 0.4, 3.22, M.fabricDark, sofa);
  rbox(0.78, 0.14, 1.92, 0.05, M.fabric, 0.53, 0.46, 2.25, sofa);
  const back = rbox(0.2, 0.52, 1.92, 0.06, M.fabric, 0.17, 0.72, 2.25, sofa); back.rotation.z = -0.1;
  bx(0.04, 0.08, 1.2, 0.95, 0.6, 1.3, M.walnut, sofa); bx(0.04, 0.08, 3.2, 0.95, 0.6, 3.3, M.walnut, sofa);
  for (const [x, z] of [[0.12, 1.25], [0.9, 1.25], [0.12, 3.25], [0.9, 3.25]]) cyl(0.02, 0.015, 0.1, M.walnut, x, 0.05, z, 8, sofa);
  const pillow = rbox(0.14, 0.34, 0.4, 0.07, M.pillow, 0.3, 0.72, 2.95, sofa); pillow.rotation.z = -0.2;
  const plaid = rbox(0.5, 0.06, 0.4, 0.03, M.plaid, 0.6, 0.55, 1.6, sofa); plaid.rotation.y = 0.2;
  tagAll(sofa, 'sofa'); solid(0.04, 1.2, 0.96, 3.3);

  // ковёр на стене + бахрома
  const carpet = new THREE.Group(); W.scene.add(carpet);
  const cm = addMesh(new THREE.PlaneGeometry(2.7, 1.75), M.carpet, 0.016, 1.495, 2.25, carpet);
  cm.rotation.y = Math.PI / 2; cm.castShadow = false; tagMesh(cm, 'carpet');
  const fr = addMesh(new THREE.PlaneGeometry(2.7, 0.08), M.fringe, 0.02, 0.585, 2.25, carpet); fr.rotation.y = Math.PI / 2; fr.castShadow = false;
  W.objs.carpet = carpet; W.objs.carpetMesh = cm; W.objs.carpetFringe = fr;
  // свёрнутый ковёр (появится, если снять)
  const roll = cyl(0.13, 0.13, 2.7, M.carpetRoll, 1.3, 0.13, 3.45, 20); roll.rotation.x = Math.PI / 2; roll.rotation.z = Math.PI / 2;
  roll.visible = false; W.objs.carpetRoll = roll;

  // телевизор на ножках в углу
  const tv = new THREE.Group(); tv.position.set(0.62, 0, 0.6); tv.rotation.y = Math.PI / 4; W.scene.add(tv);
  const body = rbox(0.68, 0.5, 0.46, 0.04, M.walnut, 0, 0.8, 0, tv); tagMesh(body, 'tv');
  const scr = addMesh(new THREE.PlaneGeometry(0.44, 0.34), M.tvScreen, -0.08, 0.81, 0.232, tv); tagMesh(scr, 'tvScreen'); scr.castShadow = false;
  const bezel = box(0.5, 0.4, 0.01, M.tvBezel, -0.08, 0.81, 0.226, tv); tagMesh(bezel, 'tv');
  const grill = box(0.12, 0.36, 0.01, M.grill, 0.24, 0.81, 0.232, tv); tagMesh(grill, 'tv');
  for (const y of [0.9, 0.76]) { const k = cyl(0.022, 0.022, 0.03, M.knob, 0.24, y, 0.245, 12, tv); k.rotation.x = Math.PI / 2; tagMesh(k, 'tv'); }
  for (const [x, z] of [[-0.28, -0.16], [0.28, -0.16], [-0.28, 0.16], [0.28, 0.16]]) { const l = cyl(0.012, 0.008, 0.56, M.walnut, x * 1.05, 0.28, z * 1.05, 6, tv); l.rotation.z = x * 0.18; l.rotation.x = -z * 0.18; }
  const doily = addMesh(new THREE.CircleGeometry(0.2, 24), M.doily, 0, 1.052, 0, tv); doily.rotation.x = -Math.PI / 2; doily.castShadow = false;
  for (const s of [-1, 1]) { const a = cyl(0.004, 0.004, 0.55, M.chrome, s * 0.14, 1.28, -0.05, 6, tv); a.rotation.z = -s * 0.5; }
  cyl(0.04, 0.05, 0.03, M.tvBezel, 0, 1.07, -0.05, 12, tv);
  W.objs.tv = tv; W.objs.tvScreen = scr; solid(0.2, 0.2, 1.05, 1.05);

  // кресло в углу
  const ch = new THREE.Group(); ch.position.set(4.5, 0, 0.62); ch.rotation.y = -Math.PI / 4; W.scene.add(ch);
  rbox(0.7, 0.3, 0.66, 0.06, M.armchair, 0, 0.3, 0, ch); rbox(0.7, 0.6, 0.16, 0.06, M.armchair, 0, 0.7, -0.28, ch);
  rbox(0.12, 0.26, 0.66, 0.05, M.walnut, -0.36, 0.52, 0, ch); rbox(0.12, 0.26, 0.66, 0.05, M.walnut, 0.36, 0.52, 0, ch);
  tagAll(ch, 'armchair'); solid(4.1, 0.2, 4.9, 1.05);

  // стол со скатертью, ваза с гладиолусами, стулья
  const tb = new THREE.Group(); tb.position.set(2.6, 0, 2.15); W.scene.add(tb);
  bx(-0.55, 0.7, -0.38, 0.55, 0.74, 0.38, M.walnut, tb);
  for (const [x, z] of [[-0.48, -0.32], [0.48, -0.32], [-0.48, 0.32], [0.48, 0.32]]) bx(x - 0.025, 0, z - 0.025, x + 0.025, 0.7, z + 0.025, M.walnut, tb);
  bx(-0.6, 0.74, -0.43, 0.6, 0.745, 0.43, M.tablecloth, tb);
  bx(-0.6, 0.55, -0.435, 0.6, 0.745, -0.43, M.tablecloth, tb); bx(-0.6, 0.55, 0.43, 0.6, 0.745, 0.435, M.tablecloth, tb);
  bx(-0.605, 0.55, -0.43, -0.6, 0.745, 0.43, M.tablecloth, tb); bx(0.6, 0.55, -0.43, 0.605, 0.745, 0.43, M.tablecloth, tb);
  makeCrystal(0, 0.745, 0, 'vase', tb);
  for (let i = 0; i < 5; i++) {
    const st = cyl(0.004, 0.004, 0.5, M.stem, (i - 2) * 0.02, 1.2, (i % 2) * 0.02, 5, tb); st.rotation.z = (i - 2) * 0.12;
    // соцветие-колос: раструбы по очереди вправо-влево, к верхушке мельче
    for (let k = 0; k < 6; k++) { const fl = sph(0.02 - k * 0.0018, i % 2 ? M.glad1 : M.glad2, (i - 2) * 0.02 + (i - 2) * 0.06 * (k / 6 + 0.5) + (k % 2 ? 0.012 : -0.012), 1.26 + k * 0.045, (i % 2) * 0.02, tb, 8, 6); fl.scale.set(1.25, 0.7, 1.0); fl.rotation.z = k % 2 ? 0.5 : -0.5; }
  }
  tagAll(tb, 'table'); solid(2.0, 1.72, 3.2, 2.58);
  const chair = (x, z, ry) => {
    const c = new THREE.Group(); c.position.set(x, 0, z); c.rotation.y = ry; W.scene.add(c);
    bx(-0.2, 0.44, -0.2, 0.2, 0.48, 0.2, M.lightWood, c);
    for (const [a, b] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) bx(a - 0.018, 0, b - 0.018, a + 0.018, 0.44, b + 0.018, M.lightWood, c);
    bx(-0.18, 0.48, -0.2, -0.15, 0.92, -0.17, M.lightWood, c); bx(0.15, 0.48, -0.2, 0.18, 0.92, -0.17, M.lightWood, c);
    bx(-0.18, 0.72, -0.2, 0.18, 0.9, -0.18, M.lightWood, c);
    tagAll(c, 'chair');
  };
  chair(2.6, 1.45, 0); chair(2.6, 2.85, Math.PI);

  // сервант с хрусталём
  const sv = new THREE.Group(); W.scene.add(sv);
  bx(4.52, 0.05, 0.9, 4.98, 0.85, 2.5, M.walnut, sv);
  bx(4.52, 0, 0.92, 4.96, 0.05, 2.48, M.tvBezel, sv);
  for (const z of [1.3, 1.7, 2.1]) cyl(0.012, 0.012, 0.03, M.brass, 4.51, 0.55, z, 8, sv).rotation.z = Math.PI / 2;
  bx(4.94, 0.85, 0.9, 4.98, 1.95, 2.5, M.walnut, sv);
  bx(4.6, 0.85, 0.9, 4.98, 1.95, 0.93, M.walnut, sv); bx(4.6, 0.85, 2.47, 4.98, 1.95, 2.5, M.walnut, sv);
  bx(4.56, 1.93, 0.88, 4.99, 1.99, 2.52, M.walnut, sv);
  for (const y of [1.2, 1.55]) { const sh = bx(4.62, y, 0.93, 4.94, y + 0.01, 2.47, M.glass, sv); sh.castShadow = false; }
  const gl = bx(4.595, 0.87, 0.93, 4.6, 1.92, 2.47, M.glass, sv); gl.castShadow = false;
  // хрусталь и фарфор
  makeCrystal(4.78, 0.86, 1.2, 'vase', sv); makeCrystal(4.78, 0.86, 2.2, 'vase', sv); makeCrystal(4.78, 0.86, 1.7, 'bowl', sv);
  for (let i = 0; i < 7; i++) makeCrystal(4.8, 1.21, 1.05 + i * 0.2, 'glass', sv);
  for (let i = 0; i < 5; i++) { cyl(0.04, 0.03, 0.06, M.porcelain, 4.8, 1.59, 1.15 + i * 0.28, 12, sv); }
  sph(0.08, M.porcelain, 4.8, 1.66, 1.7, sv);
  const plate = cyl(0.14, 0.14, 0.01, M.plate, 4.9, 1.75, 2.25, 20, sv); plate.rotation.z = Math.PI / 2 - 0.2;
  tagAll(sv, 'serv'); solid(4.5, 0.88, 5.0, 2.52);

  // полка с книгами, часы, картина, торшер, люстра, палас
  bx(4.8, 1.18, 2.72, 5.0, 1.2, 3.55, M.walnut);
  { const r = rnd(77); let z = 2.74; while (z < 3.52) { const w = 0.025 + r() * 0.03, h = 0.18 + r() * 0.08; const b = bx(4.82, 1.2, z, 4.98, 1.2 + h, z + w, W.mats.books[Math.floor(r() * W.mats.books.length)]); tagMesh(b, 'books'); z += w + 0.003; } }
  const clock = new THREE.Group(); clock.position.set(4.985, 1.85, 3.15); clock.rotation.y = -Math.PI / 2; W.scene.add(clock);
  cyl(0.19, 0.19, 0.04, M.walnut, 0, 0, -0.01, 24, clock).rotation.x = Math.PI / 2;
  const face = addMesh(new THREE.CircleGeometry(0.16, 32), M.clockFace, 0, 0, 0.012, clock); face.castShadow = false;
  const hg = new THREE.BoxGeometry(0.014, 0.09, 0.004); hg.translate(0, 0.04, 0);
  const mg = new THREE.BoxGeometry(0.009, 0.13, 0.003); mg.translate(0, 0.06, 0);
  const hh = addMesh(hg, M.ink, 0, 0, 0.016, clock), mh = addMesh(mg, M.ink, 0, 0, 0.02, clock);
  W.objs.clockH = hh; W.objs.clockM = mh; tagAll(clock, 'clock');
  const pnt = new THREE.Group(); pnt.position.set(4.5, 1.72, 0.015); W.scene.add(pnt);
  bx(-0.36, -0.27, 0, 0.36, 0.27, 0.03, M.gilt, pnt);
  addMesh(new THREE.PlaneGeometry(0.64, 0.46), M.painting, 0, 0, 0.032, pnt).castShadow = false;
  tagAll(pnt, 'painting');
  const lamp = new THREE.Group(); lamp.position.set(0.35, 0, 3.52); W.scene.add(lamp);
  cyl(0.16, 0.18, 0.03, M.tvBezel, 0, 0.015, 0, 20, lamp); cyl(0.012, 0.012, 1.45, M.brass, 0, 0.74, 0, 8, lamp);
  const shade = addMesh(new THREE.CylinderGeometry(0.16, 0.26, 0.3, 20, 1, true), M.lampShade, 0, 1.5, 0, lamp); shade.castShadow = false;
  tagAll(lamp, 'lamp'); solid(0.15, 3.32, 0.55, 3.72);
  const chand = new THREE.Group(); chand.position.set(2.5, H, 1.9); W.scene.add(chand);
  cyl(0.008, 0.008, 0.35, M.brass, 0, -0.17, 0, 6, chand); sph(0.05, M.brass, 0, -0.36, 0, chand);
  W.objs.chandShades = [];
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI * 2, x = Math.cos(a) * 0.22, z = Math.sin(a) * 0.22;
    const arm = cyl(0.006, 0.006, 0.24, M.brass, x / 2, -0.36, z / 2, 6, chand); arm.rotation.z = Math.PI / 2; arm.rotation.y = -a;
    const sh = addMesh(new THREE.SphereGeometry(0.075, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), M.shadeGlass, x, -0.3, z, chand);
    sh.rotation.x = Math.PI; sh.castShadow = false; W.objs.chandShades.push(sh);
  }
  const rug = addMesh(new THREE.PlaneGeometry(2.6, 1.72), M.rug, 2.5, 0.004, 2.15); rug.rotation.x = -Math.PI / 2; rug.castShadow = false; tagMesh(rug, 'rug');
  // выключатель у двери (на южной стене, смотрит в зал)
  const sw = new THREE.Group(); sw.position.set(3.72, 1.45, 3.8); W.scene.add(sw);
  const swPlate = bx(-0.04, -0.05, -0.012, 0.04, 0.05, 0, M.switchPlate, sw);
  const swKey = bx(-0.018, -0.03, -0.02, 0.018, 0.03, -0.012, M.switchKey, sw);
  tagAll(sw, 'switch'); W.objs.switchGroup = sw; W.objs.switchKey = swKey;
  // розетка у телевизора
  bx(0.001, 0.3, 1.02, 0.012, 0.37, 1.09, M.switchPlate);
  return fl;
}

function buildKitchen() {
  const R = W.rooms.kit, M = W.mats;
  floorCeil(R, M.linoK);
  buildWall(R, 'N', [{ c0: 5.8, c1: 7.0, y0: 0.85, y1: 2.15 }], M.kitchenWall);
  buildWall(R, 'S', [{ c0: 5.5, c1: 6.25, y0: 0, y1: 2.05 }], M.kitchenWall);
  buildWall(R, 'W', [], M.kitchenWall);
  buildWall(R, 'E', [], M.kitchenWall);
  const w2 = windowUnit(5.8, 7.0, 0.85, 2.15, {}); tagAll(w2.group, 'frame');
  cyl(0.016, 0.016, 2.5, M.pipe, 5.72, 1.25, 0.06);
  // мойка (кран и вентиль — объекты работы)
  const sink = new THREE.Group(); W.scene.add(sink);
  bx(7.02, 0.0, 0.55, 7.58, 0.06, 1.15, M.kitchenCab, sink);
  bx(7.02, 0.06, 0.55, 7.58, 0.78, 0.58, M.kitchenCab, sink); bx(7.02, 0.06, 1.12, 7.58, 0.78, 1.15, M.kitchenCab, sink);
  bx(7.55, 0.06, 0.58, 7.58, 0.78, 1.12, M.kitchenCab, sink);
  bx(7.0, 0.78, 0.53, 7.59, 0.84, 1.17, M.steel, sink);
  bx(7.1, 0.7, 0.65, 7.5, 0.78, 1.05, M.steelDark, sink);
  cyl(0.02, 0.02, 0.5, M.pipe, 7.3, 0.45, 0.85, 8, sink);
  tagAll(sink, 'sink', false); solid(7.0, 0.52, 7.6, 1.17);
  // трубы и вентиль под мойкой
  cyl(0.013, 0.013, 1.0, M.pipe, 7.55, 0.55, 0.78, 8);
  const valve = new THREE.Group(); valve.position.set(7.47, 0.42, 0.78); W.scene.add(valve);
  const vw = addMesh(new THREE.TorusGeometry(0.035, 0.008, 6, 14), M.valveRed, 0, 0, 0, valve); vw.rotation.y = Math.PI / 2;
  for (let k = 0; k < 2; k++) { const sp = bx(-0.004, -0.035, -0.003, 0.004, 0.035, 0.003, M.valveRed, valve); sp.rotation.x = k * Math.PI / 2; }
  bx(0, -0.012, -0.012, 0.08, 0.012, 0.012, M.brass, valve);
  W.objs.valve = valve;
  // старый кран на стене над мойкой (двухвентильный)
  const tapOld = new THREE.Group(); tapOld.position.set(7.58, 1.02, 0.85); W.scene.add(tapOld);
  bx(-0.03, -0.02, -0.12, 0, 0.02, 0.12, M.chromeOld, tapOld);
  const spout = cyl(0.012, 0.012, 0.22, M.chromeOld, -0.11, -0.01, 0, 8, tapOld); spout.rotation.z = Math.PI / 2 - 0.25;
  for (const z of [-0.1, 0.1]) { cyl(0.02, 0.02, 0.05, M.chromeOld, -0.03, 0.04, z, 8, tapOld); bx(-0.045, 0.06, z - 0.03, -0.015, 0.075, z + 0.03, M.chromeOld, tapOld); }
  W.objs.tapOld = tapOld;
  const tapNew = new THREE.Group(); tapNew.position.set(7.58, 1.02, 0.85); tapNew.visible = false; W.scene.add(tapNew);
  bx(-0.035, -0.022, -0.1, 0, 0.022, 0.1, M.chrome, tapNew);
  const sp2 = cyl(0.014, 0.014, 0.26, M.chrome, -0.13, 0.0, 0, 10, tapNew); sp2.rotation.z = Math.PI / 2 - 0.1;
  cyl(0.025, 0.025, 0.06, M.chrome, -0.04, 0.05, 0, 12, tapNew);
  const lever = bx(-0.05, 0.08, -0.008, -0.01, 0.092, 0.008, M.chrome, tapNew); lever.rotation.z = 0.3;
  W.objs.tapNew = tapNew;
  // газовая колонка над мойкой
  const col = new THREE.Group(); col.position.set(7.45, 1.78, 0.85); W.scene.add(col);
  rbox(0.26, 0.64, 0.36, 0.03, M.enamel, 0, 0, 0, col);
  const win = addMesh(new THREE.CircleGeometry(0.035, 16), M.flameWin, -0.131, -0.16, 0, col); win.rotation.y = -Math.PI / 2;
  const flame = addMesh(new THREE.ConeGeometry(0.012, 0.03, 8), M.flame, -0.128, -0.165, 0, col); W.objs.pilot = flame;
  cyl(0.06, 0.06, 0.4, M.tin, 0.02, 0.5, 0, 14, col);
  cyl(0.012, 0.012, 0.3, M.pipe, -0.04, -0.45, 0.1, 8, col);
  const knob = cyl(0.03, 0.03, 0.03, M.ink, -0.14, -0.26, 0.08, 12, col); knob.rotation.z = Math.PI / 2;
  tagAll(col, 'column', false); W.objs.column = col;
  // плита, чайник
  const st = new THREE.Group(); W.scene.add(st);
  rbox(0.56, 0.85, 0.55, 0.02, M.enamel, 7.3, 0.425, 1.55, st);
  bx(7.01, 0.15, 1.33, 7.03, 0.62, 1.77, M.tvBezel, st);
  bx(7.005, 0.25, 1.4, 7.012, 0.55, 1.7, M.glassDark, st);
  for (const [x, z] of [[7.18, 1.42], [7.18, 1.68], [7.42, 1.42], [7.42, 1.68]]) { const b = cyl(0.07, 0.07, 0.015, M.burner, x, 0.855, z, 16, st); b.castShadow = false; }
  for (let i = 0; i < 4; i++) { const k = cyl(0.018, 0.018, 0.02, M.ink, 7.015, 0.74, 1.38 + i * 0.11, 10, st); k.rotation.z = Math.PI / 2; }
  sph(0.1, M.kettle, 7.18, 0.94, 1.68, st); const ksp = cyl(0.012, 0.02, 0.12, M.kettle, 7.07, 0.97, 1.68, 8, st); ksp.rotation.z = 0.9;
  tagAll(st, 'stove', false); solid(7.0, 1.27, 7.6, 1.83);
  // тумба и навесной шкаф
  bx(7.02, 0, 1.9, 7.58, 0.84, 2.6, M.kitchenCab); bx(7.0, 0.84, 1.88, 7.6, 0.87, 2.62, M.counter);
  bx(7.28, 1.5, 1.6, 7.6, 2.15, 2.62, M.kitchenCab); solid(7.0, 1.85, 7.6, 2.62);
  // холодильник с радиоприёмником
  const fr = new THREE.Group(); W.scene.add(fr);
  rbox(0.62, 1.5, 0.64, 0.07, M.enamel, 7.27, 0.75, 3.4, fr);
  bx(6.94, 0.9, 3.12, 6.96, 1.35, 3.16, M.chrome, fr); bx(6.95, 0.02, 3.1, 6.97, 0.12, 3.7, M.tvBezel, fr);
  const radio = rbox(0.34, 0.2, 0.14, 0.02, M.radio, 7.27, 1.6, 3.4, fr); radio.rotation.y = -Math.PI / 2;
  bx(6.95, 1.55, 3.3, 7.2, 1.65, 3.5, M.grill, fr);
  tagAll(fr, 'fridge', false); W.objs.fridge = fr; solid(6.94, 3.05, 7.6, 3.75);
  // стол у окна, табуретки, ящик пива
  const kt = new THREE.Group(); W.scene.add(kt);
  bx(5.55, 0.7, 0.16, 6.75, 0.74, 0.86, M.oilcloth, kt);
  for (const [x, z] of [[5.6, 0.2], [6.7, 0.2], [5.6, 0.82], [6.7, 0.82]]) bx(x - 0.02, 0, z - 0.02, x + 0.02, 0.7, z + 0.02, M.lightWood, kt);
  tagAll(kt, 'ktable', false); solid(5.52, 0.12, 6.78, 0.9);
  const stool = (x, z) => { const s = new THREE.Group(); s.position.set(x, 0, z); W.scene.add(s); bx(-0.16, 0.42, -0.16, 0.16, 0.46, 0.16, M.kitchenCab, s); for (const [a, b] of [[-0.12, -0.12], [0.12, -0.12], [-0.12, 0.12], [0.12, 0.12]]) bx(a - 0.015, 0, b - 0.015, a + 0.015, 0.42, b + 0.015, M.lightWood, s); };
  stool(5.95, 1.15); stool(6.45, 1.2);
  const crate = new THREE.Group(); crate.position.set(5.42, 0, 1.55); W.scene.add(crate);
  bx(-0.21, 0, -0.29, 0.21, 0.02, 0.29, M.crate, crate);
  for (const s of [-1, 1]) { bx(s * 0.2 - 0.01, 0, -0.29, s * 0.2 + 0.01, 0.26, 0.29, M.crate, crate); bx(-0.21, 0, s * 0.28 - 0.01, 0.21, 0.26, s * 0.28 + 0.01, M.crate, crate); }
  const bottles = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 5; j++) { const b = makeBottle(); b.position.set(-0.15 + i * 0.1, 0.02, -0.22 + j * 0.11); crate.add(b); bottles.push(b); }
  W.objs.crate = crate; W.objs.bottles = bottles; solid(5.18, 1.23, 5.66, 1.87);
  // подоконник: алоэ и чайный гриб
  const pot = cyl(0.07, 0.05, 0.12, M.clay, 6.1, 0.91, -0.05, 12);
  for (let i = 0; i < 7; i++) { const lf = addMesh(new THREE.ConeGeometry(0.018, 0.22, 5), M.aloe, 6.1 + Math.cos(i) * 0.02, 1.05, -0.05 + Math.sin(i) * 0.02); lf.rotation.z = Math.cos(i * 2.1) * 0.5; lf.rotation.x = Math.sin(i * 2.1) * 0.5; }
  const jar = cyl(0.08, 0.08, 0.24, M.jar, 6.65, 0.97, -0.05, 16); jar.castShadow = false;
  cyl(0.075, 0.075, 0.16, M.kombucha, 6.65, 0.93, -0.05, 16).castShadow = false;
  cyl(0.083, 0.083, 0.01, M.gauze, 6.65, 1.09, -0.05, 16);
  tagMesh(pot, 'sill', false);
  // миска кота
  const bowl = cyl(0.09, 0.07, 0.05, M.bowl, 6.7, 0.025, 3.55, 16); W.objs.catBowl = bowl;
  const food = cyl(0.075, 0.075, 0.01, M.catFood, 6.7, 0.05, 3.55, 12); food.visible = false; W.objs.catFood = food;
  // лампочка
  cyl(0.004, 0.004, 0.3, M.ink, 6.36, 2.35, 1.9, 6); sph(0.05, M.bulb, 6.36, 2.18, 1.9);
  // радиоточка на стене
  const rt = rbox(0.18, 0.24, 0.08, 0.02, M.radio, 5.16, 1.7, 2.6); rt.rotation.y = Math.PI / 2;
  bx(5.2, 1.62, 2.53, 5.21, 1.76, 2.67, M.grill);
}

function makeBottle() {
  const M = W.mats;
  const pts = [[0, 0], [0.03, 0], [0.032, 0.005], [0.032, 0.15], [0.026, 0.18], [0.013, 0.21], [0.013, 0.26], [0.015, 0.265], [0, 0.265]].map(([a, b]) => new THREE.Vector2(a, b));
  const b = new THREE.Mesh(new THREE.LatheGeometry(pts, 10), M.bottle); b.castShadow = true;
  const lbl = new THREE.Mesh(new THREE.CylinderGeometry(0.0325, 0.0325, 0.06, 10, 1, true), M.beerLabel); lbl.position.y = 0.09; b.add(lbl);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.012, 8), M.cap); cap.position.y = 0.268; b.add(cap);
  return b;
}

function buildBath() {
  const R = W.rooms.bath, M = W.mats;
  floorCeil(R, M.bathFloor);
  buildWall(R, 'N', [], M.bathWall, 'bathwall');
  buildWall(R, 'S', [], M.bathWall, 'bathwall');
  buildWall(R, 'W', [], M.bathWall, 'bathwall');
  buildWall(R, 'E', [{ c0: 4.3, c1: 4.95, y0: 0, y1: 2.05 }], M.bathWall, 'bathwall');
  // старая плитка до 1,5 м (кроме зоны работ)
  const band = (side, ops) => { const w = wallGeo(R, side, ops, 0, 1.5); const me = addMesh(w.geo, M.tileOld); me.position.set(w.nrm[0] * 0.004, 0, w.nrm[2] * 0.004); me.castShadow = false; return me; };
  band('N'); band('W'); band('E', [{ c0: 4.3, c1: 4.95, y0: 0, y1: 2.05 }]);
  // голая стена над ванной — зона плитки
  const pl = addMesh(new THREE.PlaneGeometry(1.86, 1.5), M.plaster, 0.95, 1.33, 5.596); pl.rotation.y = Math.PI; pl.castShadow = false;
  W.objs.tileWall = pl;
  // ванна
  const tub = new THREE.Group(); W.scene.add(tub);
  bx(0.03, 0.02, 4.88, 1.73, 0.58, 4.92, M.enamel, tub); bx(0.03, 0.02, 5.54, 1.73, 0.58, 5.58, M.enamel, tub);
  bx(0.03, 0.02, 4.88, 0.07, 0.58, 5.58, M.enamel, tub); bx(1.69, 0.02, 4.88, 1.73, 0.58, 5.58, M.enamel, tub);
  bx(0.07, 0.15, 4.92, 1.69, 0.18, 5.54, M.enamelIn, tub);
  bx(0.03, 0.0, 4.86, 1.73, 0.5, 4.88, M.tubPanel, tub);
  const water = bx(0.08, 0.18, 4.93, 1.68, 0.19, 5.53, M.water, tub); water.visible = false;
  tagAll(tub, 'tub', false); solid(0.0, 4.84, 1.76, 5.6);
  // раковина, зеркало, полочка
  bx(0.02, 0.78, 4.28, 0.42, 0.86, 4.72, M.enamel); cyl(0.04, 0.04, 0.78, M.enamel, 0.2, 0.39, 4.5, 10);
  const mir = bx(0.005, 1.25, 4.3, 0.012, 1.75, 4.7, M.mirror); mir.castShadow = false;
  bx(0.02, 1.18, 4.3, 0.14, 1.2, 4.7, M.glass);
  cyl(0.025, 0.02, 0.09, M.glassDark, 0.07, 1.245, 4.6, 10);
  solid(0.0, 4.26, 0.44, 4.74);
  // унитаз с бачком
  const wc = new THREE.Group(); wc.position.set(1.15, 0, 4.2); W.scene.add(wc);
  cyl(0.16, 0.13, 0.4, M.enamel, 0, 0.2, 0.06, 16, wc); bx(-0.19, 0.4, -0.18, 0.19, 0.44, 0.3, M.enamel, wc);
  rbox(0.4, 0.36, 0.16, 0.03, M.enamel, 0, 0.72, -0.18, wc);
  solid(0.93, 3.92, 1.37, 4.52);
  // таз на гвозде и полотенце
  const basin = cyl(0.24, 0.18, 0.1, M.tin, 1.87, 1.7, 4.2, 20); basin.rotation.z = Math.PI / 2;
  bx(1.82, 1.1, 5.1, 1.88, 1.6, 5.4, M.towel);
  sph(0.04, M.bulb, 0.95, 2.4, 4.75);
}

function buildHall() {
  const R = W.rooms.hall, M = W.mats;
  floorCeil(R, M.linoH);
  buildWall(R, 'N', [{ c0: 3.9, c1: 4.7, y0: 0, y1: 2.05 }, { c0: 5.5, c1: 6.25, y0: 0, y1: 2.05 }], M.wallHall);
  buildWall(R, 'S', [{ c0: 6.5, c1: 7.35, y0: 0, y1: 2.05 }], M.wallHall);
  buildWall(R, 'W', [{ c0: 4.3, c1: 4.95, y0: 0, y1: 2.05 }], M.wallHall);
  buildWall(R, 'E', [], M.wallHall);
  doorFrame('x', 3.9, 4.7, 3.86, 0.12); doorFrame('x', 5.5, 6.25, 3.86, 0.12); doorFrame('z', 4.3, 4.95, 1.96, 0.12);
  doorFrame('x', 6.5, 7.35, 5.6 + 0.08, 0.16);
  // межкомнатные двери (открыты)
  const idoor = (px, pz, ry, w) => { const d = new THREE.Group(); d.position.set(px, 0, pz); d.rotation.y = ry; W.scene.add(d); bx(0, 0.01, -0.02, w, 2.02, 0.02, M.doorWhite, d); bx(0.08, 1.1, -0.035, 0.28, 1.95, -0.02, M.glassFrost, d); cyl(0.012, 0.012, 0.03, M.brass, w - 0.08, 1.0, 0.03, 8, d).rotation.x = Math.PI / 2; return d; };
  idoor(3.92, 3.95, -1.45, 0.76); idoor(6.23, 3.95, Math.PI + 1.45, 0.72);
  solid(3.88, 3.95, 4.02, 4.72); solid(6.12, 3.95, 6.26, 4.68); solid(6.5, 5.6, 7.35, 5.72);
  // входная дверь, обитая дерматином
  const ed = new THREE.Group(); ed.position.set(7.33, 0, 5.62); W.scene.add(ed);
  const leaf = bx(-0.82, 0.01, -0.03, 0, 2.03, 0.03, M.padded, ed); tagMesh(leaf, 'door', false);
  cyl(0.015, 0.015, 0.02, M.brass, -0.41, 1.55, -0.035, 8, ed).rotation.x = Math.PI / 2;
  bx(-0.1, 0.98, -0.06, -0.05, 1.02, -0.03, M.brass, ed); bx(-0.3, 1.25, -0.045, -0.12, 1.26, -0.035, M.chrome, ed);
  W.objs.entrance = ed;
  // лестничная площадка за дверью (зелёная краска, лампочка)
  bx(6.2, -0.02, 5.62, 7.7, 0, 7.1, M.concrete);                                    // пол площадки
  for (const [a, b] of [[6.18, 6.2], [7.7, 7.72]]) { bx(a, 0, 5.62, b, 1.5, 7.1, M.stairGreen); bx(a, 1.5, 5.62, b, 2.6, 7.1, M.reveal); }
  bx(6.2, 0, 7.1, 7.7, 1.5, 7.12, M.stairGreen); bx(6.2, 1.5, 7.1, 7.7, 2.6, 7.12, M.reveal);   // зелёная панель, выше — побелка
  bx(6.2, 2.6, 5.62, 7.7, 2.62, 7.12, M.reveal);
  sph(0.05, M.bulb, 6.95, 2.5, 6.4);
  // телефон на полочке
  const ph = new THREE.Group(); ph.position.set(3.25, 1.0, 5.45); W.scene.add(ph);
  bx(-0.2, -0.02, -0.14, 0.2, 0, 0.14, M.walnut, ph);
  rbox(0.22, 0.1, 0.2, 0.03, M.phone, 0, 0.05, 0, ph);
  const dial = addMesh(new THREE.CircleGeometry(0.065, 20), M.dial, 0, 0.104, 0.02, ph); dial.rotation.x = -Math.PI / 2 + 0.35;
  const hs = new THREE.Group(); hs.position.set(0, 0.13, -0.04); ph.add(hs);
  bx(-0.11, -0.012, -0.022, 0.11, 0.012, 0.022, M.phone, hs); rbox(0.06, 0.04, 0.05, 0.015, M.phone, -0.11, -0.01, 0, hs); rbox(0.06, 0.04, 0.05, 0.015, M.phone, 0.11, -0.01, 0, hs);
  W.objs.phone = ph; W.objs.handset = hs;
  // дыра в стене (объект работы) — на северной стене прихожей
  const hole = addMesh(new THREE.PlaneGeometry(0.42, 0.42), M.hole, 2.9, 1.3, 3.925); hole.castShadow = false; W.objs.hole = hole;
  for (let i = 0; i < 5; i++) { const ch = addMesh(new THREE.DodecahedronGeometry(0.02 + (i % 3) * 0.01), M.plasterBits, 2.75 + i * 0.07, 0.015, 4.0 + (i % 2) * 0.05); ch.castShadow = false; }
  // вешалка с пальто
  bx(7.56, 1.7, 4.0, 7.6, 1.76, 4.9, M.walnut);
  const coat = (z, m, h) => { const c = rbox(0.14, h, 0.34, 0.06, m, 7.48, 1.7 - h / 2, z); c.rotation.x = 0.05; return c; };
  coat(4.15, M.coat1, 0.95); coat(4.5, M.coat2, 0.8); coat(4.8, M.coat3, 1.0);
  sph(0.12, M.hat, 7.45, 1.86, 4.3).scale.set(1, 0.55, 1);
  solid(7.3, 3.95, 7.6, 4.95);
  // трюмо
  const tr = new THREE.Group(); W.scene.add(tr);
  bx(4.6, 0, 5.28, 5.4, 0.72, 5.58, M.walnut, tr); const tm = bx(4.7, 0.8, 5.56, 5.3, 1.8, 5.58, M.mirror, tr); tm.castShadow = false;
  solid(4.58, 5.26, 5.42, 5.6);
  // стройматериалы
  const pile = new THREE.Group(); W.scene.add(pile);
  for (let i = 0; i < 5; i++) { const rl = cyl(0.05, 0.05, 1.06, M.rollNew, 2.2 + (i % 3) * 0.11, 0.53, 5.4 + Math.floor(i / 3) * 0.11, 14, pile); rl.rotation.z = (i - 2) * 0.03; }
  for (let i = 0; i < 3; i++) { cyl(0.1, 0.1, 0.2, M.can, 2.75 + i * 0.22, 0.1, 5.45, 16, pile); }
  bx(2.6, 0.2, 5.3, 2.95, 0.22, 5.55, M.can, pile);
  bx(3.3, 0, 5.3, 3.7, 0.12, 5.55, M.tileBox, pile); bx(3.32, 0.12, 5.32, 3.68, 0.24, 5.53, M.tileBox, pile);
  const lad = new THREE.Group(); lad.position.set(3.95, 0, 5.52); lad.rotation.x = -0.12; W.scene.add(lad);
  for (const x of [-0.2, 0.2]) bx(x - 0.02, 0, -0.02, x + 0.02, 1.9, 0.02, M.alu, lad);
  for (let k = 0; k < 6; k++) bx(-0.2, 0.25 + k * 0.3, -0.03, 0.2, 0.27 + k * 0.3, 0.03, M.alu, lad);
  cyl(0.14, 0.12, 0.28, M.bucket, 2.3, 0.14, 4.95, 16);
  solid(2.08, 5.25, 4.2, 5.6); solid(2.12, 4.8, 2.5, 5.1);
  // счётчик у двери, лампочка
  bx(7.1, 1.9, 5.56, 7.4, 2.25, 5.6, M.meterBox);
  sph(0.05, M.bulb, 4.8, 2.4, 4.75);
  W.objs.pile = pile;
}

function buildBalcony() {
  const M = W.mats, B = W.rooms.balc;
  bx(2.45, -0.14, -1.32, 5.0, -0.02, -0.3, M.concrete);
  const rail = new THREE.Group(); W.scene.add(rail);
  bx(2.45, 0.98, -1.32, 5.0, 1.04, -1.24, M.railWood, rail);
  for (let x = 2.5; x < 5.0; x += 0.12) bx(x - 0.008, -0.02, -1.3, x + 0.008, 0.98, -1.285, M.railGreen, rail);
  bx(2.45, -0.02, -1.31, 5.0, 0.03, -1.27, M.railGreen, rail);
  bx(2.45, 0.98, -1.32, 2.52, 1.04, -0.3, M.railWood, rail);
  for (let z = -1.25; z < -0.35; z += 0.12) bx(2.46, -0.02, z - 0.008, 2.475, 0.98, z + 0.008, M.railGreen, rail);
  tagAll(rail, 'rail', false);
  // перегородка к соседу
  bx(4.9, -0.02, -1.3, 5.0, 1.15, -0.3, M.partition);
  solid(2.38, -1.4, 2.5, -0.28); solid(4.9, -1.4, 5.02, -0.28); solid(2.38, -1.4, 5.02, -1.25);
  // хлам: лыжи, стул, банки, санки, пепельница
  for (let i = 0; i < 2; i++) { const s = bx(-0.02, 0, -0.03, 0.02, 1.8, 0.03, M.ski, W.scene); s.position.set(2.62 + i * 0.07, 0, -0.42); s.rotation.x = -0.12; }
  const ch = new THREE.Group(); ch.position.set(2.95, -0.02, -0.85); ch.rotation.y = 0.5; W.scene.add(ch);
  bx(-0.2, 0.42, -0.2, 0.2, 0.46, 0.2, M.railWood, ch); for (const [a, b] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) bx(a - 0.015, 0, b - 0.015, a + 0.015, 0.42, b + 0.015, M.alu, ch);
  bx(-0.18, 0.46, -0.2, 0.18, 0.8, -0.17, M.railWood, ch);
  solid(2.75, -1.05, 3.15, -0.65);
  for (let i = 0; i < 4; i++) { const j = cyl(0.06, 0.06, 0.18, M.jar, 4.55 + (i % 2) * 0.14, 0.07, -0.5 - Math.floor(i / 2) * 0.14, 12); j.castShadow = false; cyl(0.055, 0.055, 0.1, i % 2 ? M.pickles : M.jam, 4.55 + (i % 2) * 0.14, 0.05, -0.5 - Math.floor(i / 2) * 0.14, 12); }
  solid(4.45, -0.8, 4.9, -0.4);
  const can = cyl(0.04, 0.04, 0.1, M.tin, 3.7, 1.09, -1.28, 12); W.objs.ashtray = can;
  // соседский балкон с бельём
  bx(5.02, -0.14, -1.32, 7.5, -0.02, -0.3, M.concrete);
  bx(5.02, 0.98, -1.32, 7.5, 1.04, -1.24, M.railWood);
  for (let x = 5.1; x < 7.5; x += 0.12) bx(x - 0.008, -0.02, -1.3, x + 0.008, 0.98, -1.285, M.railGreen);
  bx(7.45, -0.02, -1.32, 7.5, 1.04, -0.3, M.railWood);
  cyl(0.003, 0.003, 2.3, M.ink, 6.3, 1.95, -0.8, 4).rotation.z = Math.PI / 2;
  for (const [x, m, h] of [[5.6, M.sheet1, 0.9], [6.3, M.sheet2, 0.7], [6.95, M.shirt, 0.5]]) { const s = addMesh(new THREE.PlaneGeometry(0.55, h, 4, 4), m, x, 1.95 - h / 2, -0.8); s.castShadow = true; }
  // кусок фасада над балконом (козырёк — балкон пятого этажа)
  bx(2.45, 2.62, -1.32, 5.0, 2.74, -0.3, M.concrete);
  bx(5.02, 2.62, -1.32, 7.5, 2.74, -0.3, M.concrete);
  void B;
}

/* ---------- двор за окном ---------- */
// склеить статичные меши группы по материалам: сотни вызовов отрисовки → десяток
function mergeGroup(group) {
  group.updateMatrixWorld(true);
  const buckets = new Map();
  group.traverse((o) => {
    if (!o.isMesh || o.userData.keep) return;
    const key = o.material.uuid + (o.castShadow ? 's' : '');
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.applyMatrix4(o.matrixWorld);
    if (!buckets.has(key)) buckets.set(key, { mat: o.material, cast: o.castShadow, geos: [] });
    buckets.get(key).geos.push(g);
  });
  const out = new THREE.Group();
  for (const b of buckets.values()) {
    const merged = LIB.mergeGeometries(b.geos, false); if (!merged) continue;
    const me = new THREE.Mesh(merged, b.mat); me.castShadow = b.cast; me.receiveShadow = true; me.matrixAutoUpdate = false; out.add(me);
  }
  const keep = []; group.traverse((o) => { if (o.isMesh && o.userData.keep) keep.push(o); });
  group.parent.add(out); group.parent.remove(group);
  keep.forEach((o) => { o.updateMatrixWorld(true); out.attach(o); });
  return out;
}
function buildOutside() {
  const M = W.mats, G = -10.6;
  const realScene = W.scene; const OUT = new THREE.Group(); realScene.add(OUT); W.scene = OUT;
  // наш фасад с проёмами
  // (S-стена «смотрит» в −z — наружу)
  const R = { x0: -40, x1: 48, z0: -0.3, z1: -0.3 };
  const facGeo = wallGeo(R, 'S', [{ c0: 1.2, c1: 2.9, y0: 0.85, y1: 2.15 }, { c0: 3.1, c1: 3.85, y0: 0, y1: 2.2 }, { c0: 5.8, c1: 7.0, y0: 0.85, y1: 2.15 }], G, 5.8);
  const fm = addMesh(facGeo.geo, M.facade); fm.receiveShadow = true;
  // окна соседей на нашем фасаде
  const win = (x, y) => { bx(x - 0.7, y, -0.34, x + 0.7, y + 1.3, -0.31, M.farGlass); bx(x - 0.72, y - 0.04, -0.4, x + 0.72, y, -0.3, M.tin); };
  for (let f = -3; f <= 1; f++) for (let x = -34; x < 46; x += 3.3) {
    const y = f * 2.75 + 0.85;
    if (f === 0 && x > -0.6 && x < 8.2) continue;
    win(x, y);
  }
  for (const f of [-3, -2, -1, 1]) {
    const y = f * 2.75;
    bx(2.45, y - 0.14, -1.32, 5.0, y - 0.02, -0.3, M.concrete);
    bx(2.45, y - 0.02, -1.3, 5.0, y + 0.98, -1.26, f === 1 ? M.railSheet : M.railSheet2);
    win(1.95, y + 0.85);
  }
  // земля, дом напротив, деревья
  const gr = addMesh(new THREE.PlaneGeometry(140, 110), M.ground, 4, G, -40); gr.rotation.x = -Math.PI / 2; gr.receiveShadow = false; gr.castShadow = false;
  const far = new THREE.Group(); W.scene.add(far);
  const fb = (x, z, len, ry, m) => {
    const g = new THREE.Group(); g.position.set(x, G, z); g.rotation.y = ry; far.add(g);
    const front = addMesh(new THREE.PlaneGeometry(len, 14), m, 0, 7, 6, g); front.castShadow = false;
    bx(-len / 2, 0, -6, len / 2, 14, 5.94, M.farSide, g).castShadow = false;
    bx(-len / 2 - 0.2, 14, -6.2, len / 2 + 0.2, 14.4, 6.2, M.roof, g);
    for (let k = 0; k < 6; k++) { const ax = -len / 2 + 5 + k * len / 6; cyl(0.03, 0.03, 2.2, M.ink, ax, 15.5, 0, 4, g); for (let j = 0; j < 3; j++) bx(ax - 0.5, 15.8 + j * 0.3, -0.02, ax + 0.5, 15.83 + j * 0.3, 0.02, M.ink, g); }
    return g;
  };
  fb(4, -44, 64, 0, M.farB);
  fb(-44, -20, 50, Math.PI / 2, M.farA);
  fb(58, -20, 50, -Math.PI / 2, M.farA);
  // деревья: тополя и берёзы в сентябрьском золоте
  const r = rnd(501);
  const tree = (x, z, h, birch) => {
    const t = new THREE.Group(); t.position.set(x, G, z); W.scene.add(t);
    cyl(0.18, 0.28, h * 0.6, birch ? M.birch : M.trunk, 0, h * 0.3, 0, 7, t).castShadow = false;
    const n = 5 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) {
      const m = [M.leafGold, M.leafGreen, M.leafOlive, M.leafGold2][Math.floor(r() * 4)];
      const b = addMesh(flatGeo(new THREE.IcosahedronGeometry(1.4 + r() * 1.6, 1)), m, (r() - 0.5) * 3, h * 0.55 + r() * h * 0.45, (r() - 0.5) * 3, t);
      b.castShadow = false; b.scale.y = birch ? 1.1 : 1.5;
    }
  };
  for (let i = 0; i < 16; i++) tree(-26 + i * 4.2 + r() * 2, -9 - r() * 6, 11 + r() * 7, r() < 0.5);
  for (let i = 0; i < 9; i++) tree(-30 + i * 8 + r() * 3, -30 - r() * 6, 12 + r() * 6, r() < 0.4);
  // детская площадка: ракета, качели, песочница-грибок
  const pg = new THREE.Group(); pg.position.set(-2, G, -20); W.scene.add(pg);
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2; const l = cyl(0.05, 0.05, 4.4, M.railGreen, Math.cos(a) * 0.9, 2.2, Math.sin(a) * 0.9, 6, pg); l.rotation.z = Math.cos(a) * 0.12; l.rotation.x = -Math.sin(a) * 0.12; }
  cyl(0.8, 0.8, 1.6, M.rocket, 0, 3.4, 0, 12, pg); addMesh(new THREE.ConeGeometry(0.8, 1.6, 12), M.rocketTop, 0, 5.0, 0, pg);
  const sw = new THREE.Group(); sw.position.set(8, G, -18); W.scene.add(sw);
  for (const s of [-1, 1]) { const p = cyl(0.05, 0.05, 2.6, M.alu, s * 1.2, 1.3, 0, 6, sw); p.rotation.z = s * 0.1; }
  cyl(0.05, 0.05, 2.6, M.alu, 0, 2.55, 0, 6, sw).rotation.z = Math.PI / 2;
  bx(-0.3, 0.5, -0.15, 0.3, 0.55, 0.15, M.rocket, sw);
  const sb = new THREE.Group(); sb.position.set(14, G, -24); W.scene.add(sb);
  bx(-1.2, 0, -1.2, 1.2, 0.25, 1.2, M.railWood, sb); cyl(0.06, 0.06, 2.2, M.railWood, 0, 1.1, 0, 6, sb);
  addMesh(new THREE.ConeGeometry(1.4, 0.8, 12), M.rocketTop, 0, 2.5, 0, sb);
  // машины у подъезда
  const car = (x, z, m) => { const c = new THREE.Group(); c.position.set(x, G, z); W.scene.add(c); rbox(4.1, 0.7, 1.6, 0.15, m, 0, 0.6, 0, c); rbox(2.2, 0.55, 1.45, 0.15, m, -0.2, 1.15, 0, c); bx(-1.2, 0.92, -0.73, 0.8, 1.35, 0.73, M.farGlass, c); for (const [a, b] of [[-1.3, -0.8], [1.3, -0.8], [-1.3, 0.8], [1.3, 0.8]]) { const w = cyl(0.32, 0.32, 0.2, M.ink, a, 0.32, b, 12, c); w.rotation.x = Math.PI / 2; } };
  car(-6, -4.5, M.car1); car(12, -4.8, M.car2); car(20, -4.4, M.car3);
  // гаражи
  for (let i = 0; i < 8; i++) { bx(-40 + i * 3.4, G, -58, -37 + i * 3.4, G + 2.6, -52, i % 3 ? M.garage : M.garage2).castShadow = false; }
  W.scene = realScene;
  W.objs.outside = mergeGroup(OUT);
  // небо
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), M.sky); W.scene.add(sky); W.objs.sky = sky;
}

/* ---------- материалы ---------- */
function buildMaterials() {
  const T = TX, M = W.mats;
  M.hit = new THREE.MeshBasicMaterial({ visible: false });
  M.wallOld = mat({ map: T.wallOld, roughness: 0.92 });
  M.wallNew = mat({ map: T.wallNew, roughness: 0.8 });
  M.kitchenWall = mat({ map: T.kitchenWall, roughness: 0.6 });
  M.wallHall = mat({ map: T.wallHall, roughness: 0.9 });
  M.bathWall = mat({ map: T.bathWall, roughness: 0.55 });
  M.tileOld = mat({ map: T.tileOld, roughness: 0.25, envMapIntensity: 0.8 });
  M.plaster = mat({ map: T.plaster, roughness: 0.95 });
  M.tileNew = mat({ map: T.tileNew, roughness: 0.18, envMapIntensity: 1.0 });
  M.tileDecor = mat({ map: T.tileDecor, roughness: 0.18, envMapIntensity: 1.0 });
  M.tileEdge = mat({ color: 0xe8e0d0, roughness: 0.3 });
  M.parquet = mat({ map: T.parquet, roughness: 0.42, envMapIntensity: 0.9 });
  M.linoK = mat({ map: T.linoK, roughness: 0.55 });
  M.linoH = mat({ map: T.linoH, roughness: 0.6 });
  M.bathFloor = mat({ map: T.bathFloor, roughness: 0.4 });
  M.ceiling = mat({ map: T.ceiling, roughness: 1 });
  M.skirting = mat({ color: 0x5a3a22, roughness: 0.5 });
  M.trim = mat({ color: 0xe9e2d2, roughness: 0.45 });
  M.doorWhite = mat({ color: 0xe6dfcf, roughness: 0.45 });
  M.glassFrost = mat({ color: 0xdfe6e4, roughness: 0.3, transparent: true, opacity: 0.7 });
  M.reveal = mat({ color: 0xe4ddcd, roughness: 0.9 });
  M.frame = mat({ color: 0xece6d8, roughness: 0.45 });
  M.frameOld = mat({ color: 0xcfc2a2, roughness: 0.75 });
  M.sill = mat({ color: 0xeee8da, roughness: 0.4 });
  M.tin = mat({ color: 0x8e9294, roughness: 0.45, metalness: 0.6 });
  M.glass = new THREE.MeshStandardMaterial({ color: 0xcfe0e6, roughness: 0.04, metalness: 0.0, transparent: true, opacity: 0.16, envMapIntensity: 1.5, depthWrite: false });
  M.glassDark = mat({ color: 0x2a3230, roughness: 0.1, metalness: 0.2 });
  M.rust = mat({ map: T.rust, roughness: 0.8, metalness: 0.2 });
  M.pipe = mat({ color: 0xd9d4c8, roughness: 0.5, metalness: 0.2 });
  M.curtain = mat({ map: T.curtain, roughness: 0.95 });
  M.tulle = new THREE.MeshStandardMaterial({ map: T.tulle, transparent: true, roughness: 1, depthWrite: false });
  M.brass = mat({ color: 0xb08a45, roughness: 0.35, metalness: 0.85 });
  M.fabric = mat({ map: T.fabric, roughness: 0.95 });
  M.fabricDark = mat({ map: T.fabric, color: 0x9a8a80, roughness: 0.95 });
  M.pillow = mat({ color: 0x9e3b2b, roughness: 0.9 });
  M.plaid = mat({ color: 0x3f5d4a, roughness: 1 });
  M.walnut = mat({ map: T.walnut, roughness: 0.32, envMapIntensity: 0.8 });
  M.lightWood = mat({ map: T.lightWood, roughness: 0.5 });
  M.carpet = mat({ map: T.carpet, roughness: 1 });
  M.carpetRoll = mat({ map: T.carpet, roughness: 1 });
  M.fringe = new THREE.MeshStandardMaterial({ map: T.fringe, transparent: true, depthWrite: false, roughness: 1 });
  M.rug = mat({ map: T.rug, roughness: 1 });
  M.tvScreen = new THREE.MeshStandardMaterial({ color: 0x1f2825, roughness: 0.12, metalness: 0.3, envMapIntensity: 1.4 });
  M.tvOn = new THREE.MeshBasicMaterial({ map: T.tv });
  M.tvBezel = mat({ color: 0x2a2522, roughness: 0.5 });
  M.grill = mat({ color: 0x5b4a3c, roughness: 1 });
  M.knob = mat({ color: 0xd8d0c0, roughness: 0.4 });
  M.chrome = mat({ color: 0xdfe3e6, roughness: 0.12, metalness: 1 });
  M.chromeOld = mat({ color: 0xa9a598, roughness: 0.4, metalness: 0.8 });
  M.doily = new THREE.MeshStandardMaterial({ map: T.doily, transparent: true, depthWrite: false, roughness: 1 });
  M.armchair = mat({ color: 0x3e5c4c, roughness: 0.95 });
  M.tablecloth = mat({ map: T.tablecloth, roughness: 0.95 });
  M.stem = mat({ color: 0x4b7a3b }); M.glad1 = mat({ color: 0xd8483c, roughness: 0.7 }); M.glad2 = mat({ color: 0xf0d8e0, roughness: 0.7 });
  M.crystal = new THREE.MeshStandardMaterial({ color: 0xe8f0f5, roughness: 0.02, metalness: 0.9, envMapIntensity: 3.0, transparent: true, opacity: 0.82 });
  M.porcelain = mat({ color: 0xf5f1e8, roughness: 0.2 });
  M.plate = mat({ color: 0xe8d8b0, roughness: 0.3 });
  M.books = [0x7a2a22, 0x2e4a6b, 0x3f5b3a, 0x8a6a2a, 0x5a3a5a, 0xa0522d, 0x2b2b2b, 0x6b7a3a].map((c) => mat({ color: c, roughness: 0.8 }));
  M.gilt = mat({ color: 0xb8913e, roughness: 0.35, metalness: 0.7 });
  M.painting = mat({ map: T.painting, roughness: 0.8 });
  M.clockFace = mat({ map: T.clock, roughness: 0.6 });
  M.ink = mat({ color: 0x1e1a17, roughness: 0.6 });
  M.lampShade = new THREE.MeshStandardMaterial({ color: 0xd9822b, roughness: 0.9, emissive: 0x000000 });
  M.shadeGlass = new THREE.MeshStandardMaterial({ color: 0xf3ead8, roughness: 0.3, emissive: 0x000000 });
  M.switchPlate = mat({ color: 0xebe4d2, roughness: 0.4 });
  M.switchKey = mat({ color: 0xd9d0bc, roughness: 0.4 });
  M.kitchenCab = mat({ color: 0xdfe6e0, roughness: 0.5 });
  M.counter = mat({ color: 0x8c8a82, roughness: 0.4 });
  M.steel = mat({ color: 0xc9ccd0, roughness: 0.25, metalness: 0.9 });
  M.steelDark = mat({ color: 0x8a8e92, roughness: 0.3, metalness: 0.9 });
  M.valveRed = mat({ color: 0xb8322a, roughness: 0.5 });
  M.enamel = mat({ color: 0xf1eee6, roughness: 0.22 });
  M.enamelIn = mat({ color: 0xe6e2d8, roughness: 0.18 });
  M.tubPanel = mat({ color: 0xd8d2c2, roughness: 0.5 });
  M.water = mat({ color: 0x9fb8c0, roughness: 0.05, transparent: true, opacity: 0.5 });
  M.flameWin = mat({ color: 0x1a1a24, roughness: 0.2 });
  M.flame = new THREE.MeshBasicMaterial({ color: 0x5aa0ff });
  M.burner = mat({ color: 0x2a2a2a, roughness: 0.5, metalness: 0.3 });
  M.kettle = mat({ color: 0xc8402e, roughness: 0.3 });
  M.radio = mat({ color: 0x6b4a32, roughness: 0.5 });
  M.oilcloth = mat({ map: T.oilcloth, roughness: 0.4 });
  M.crate = mat({ color: 0x3f6b4a, roughness: 0.6 });
  M.bottle = new THREE.MeshStandardMaterial({ color: 0x5a3312, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.88, envMapIntensity: 1.6 });
  M.beerLabel = mat({ map: T.beer, roughness: 0.6 });
  M.cap = mat({ color: 0xc9a03a, roughness: 0.3, metalness: 0.8 });
  M.clay = mat({ color: 0xa0522d, roughness: 0.9 }); M.aloe = mat({ color: 0x5f8a4a, roughness: 0.6 });
  M.jar = new THREE.MeshStandardMaterial({ color: 0xdfe8e4, roughness: 0.05, transparent: true, opacity: 0.25, depthWrite: false });
  M.kombucha = mat({ color: 0x9a6a2a, roughness: 0.3, transparent: true, opacity: 0.8 });
  M.gauze = mat({ color: 0xeeeeee, roughness: 1 });
  M.bowl = mat({ color: 0xc8402e, roughness: 0.4 }); M.catFood = mat({ color: 0x8a5a3a, roughness: 0.9 });
  M.bulb = new THREE.MeshStandardMaterial({ color: 0xfff4d8, emissive: 0xffe0a0, emissiveIntensity: 0.6 });
  M.mirror = mat({ color: 0xc9d3d6, roughness: 0.06, metalness: 0.45, envMapIntensity: 2.4 });   // полностью металлическое зеркало без отражений комнаты выглядит чёрной дырой
  M.towel = mat({ color: 0xd8a0a8, roughness: 1 });
  M.padded = mat({ map: T.padded, roughness: 0.55 });
  M.stairGreen = mat({ color: 0x4e7a5e, roughness: 0.7 });
  M.concrete = mat({ color: 0x9a968e, roughness: 0.95 });
  M.phone = mat({ color: 0x9e2a24, roughness: 0.3 });
  M.dial = mat({ map: T.dial, roughness: 0.4 });
  M.hole = new THREE.MeshStandardMaterial({ map: T.hole, transparent: true, depthWrite: false, roughness: 1 });
  M.plasterBits = mat({ color: 0xc9c3b4, roughness: 1 });
  M.coat1 = mat({ color: 0x4a3a2e, roughness: 1 }); M.coat2 = mat({ color: 0x6b2e2a, roughness: 1 }); M.coat3 = mat({ color: 0x2e3a4a, roughness: 1 });
  M.hat = mat({ color: 0x8a7a6a, roughness: 1 });
  M.rollNew = mat({ map: T.wallNew, roughness: 0.8 });
  M.can = mat({ color: 0xe9e4d6, roughness: 0.35, metalness: 0.4 });
  M.tileBox = mat({ color: 0xa8864e, roughness: 0.9 });
  M.alu = mat({ color: 0xb8bcc0, roughness: 0.35, metalness: 0.8 });
  M.bucket = mat({ color: 0x9aa3a6, roughness: 0.4, metalness: 0.6 });
  M.meterBox = mat({ color: 0x3a3f3a, roughness: 0.6 });
  M.railWood = mat({ color: 0x6a4a2e, roughness: 0.8 });
  M.railGreen = mat({ color: 0x5f8a6a, roughness: 0.6 });
  M.railSheet = mat({ color: 0x8aa0a8, roughness: 0.7 }); M.railSheet2 = mat({ color: 0xa89a7a, roughness: 0.8 });
  M.partition = mat({ color: 0xb2ada2, roughness: 0.9 });
  M.ski = mat({ color: 0xb8322a, roughness: 0.4 });
  M.pickles = mat({ color: 0x5a7a3a, roughness: 0.6 }); M.jam = mat({ color: 0x8a2a3a, roughness: 0.5 });
  M.sheet1 = mat({ color: 0xf0ece4, roughness: 1 }); M.sheet2 = mat({ color: 0xc6d8e8, roughness: 1 }); M.shirt = mat({ color: 0xd8b24a, roughness: 1 });
  M.facade = mat({ map: T.facade, roughness: 0.95 });
  M.farGlass = mat({ color: 0x3a4650, roughness: 0.15, metalness: 0.4 });
  M.farA = mat({ map: T.farA, roughness: 0.9 }); M.farB = mat({ map: T.farB, roughness: 0.9 });
  M.farSide = mat({ color: 0xcfc8b8, roughness: 0.95 }); M.roof = mat({ color: 0x55504a, roughness: 0.9 });
  M.ground = mat({ map: T.ground, roughness: 1 });
  M.trunk = mat({ color: 0x5a4a3a, roughness: 1 }); M.birch = mat({ color: 0xe6e2d8, roughness: 1 });
  M.leafGold = mat({ color: 0xd9a63a, roughness: 1 }); M.leafGold2 = mat({ color: 0xe8c04a, roughness: 1 });
  M.leafGreen = mat({ color: 0x5f7a3a, roughness: 1 }); M.leafOlive = mat({ color: 0x8a8a3a, roughness: 1 });
  M.rocket = mat({ color: 0xc8402e, roughness: 0.6 }); M.rocketTop = mat({ color: 0x3a6a9a, roughness: 0.6 });
  M.car1 = mat({ color: 0xd8c8a0, roughness: 0.35, metalness: 0.3 }); M.car2 = mat({ color: 0x6a8aa0, roughness: 0.35, metalness: 0.3 }); M.car3 = mat({ color: 0x9a3a2e, roughness: 0.35, metalness: 0.3 });
  M.garage = mat({ color: 0x7a8a7a, roughness: 0.8 }); M.garage2 = mat({ color: 0x8a6a4a, roughness: 0.8 });
  M.paint = new THREE.MeshStandardMaterial({ color: 0xf7f5ef, roughness: 0.25, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  M.paintCoat = new THREE.MeshStandardMaterial({ color: 0xf7f5ef, roughness: 0.3, transparent: true, opacity: 0 });
  M.redCircle = new THREE.MeshBasicMaterial({ map: T.redCircle, transparent: true, depthTest: false, depthWrite: false });
  M.patch = mat({ color: 0xcfc9ba, roughness: 1 });
  M.calendar = mat({ map: T.calendar, roughness: 0.8, side: THREE.DoubleSide });
  M.puddle = new THREE.MeshStandardMaterial({ color: 0x8aa0a8, roughness: 0.02, metalness: 0.2, transparent: true, opacity: 0.55, envMapIntensity: 2, polygonOffset: true, polygonOffsetFactor: -1 });
  M.sky = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: new THREE.Color(0x6f9fd8) }, hor: { value: new THREE.Color(0xe8e0d0) }, sunDir: { value: new THREE.Vector3(0, 0.3, -1) }, sunCol: { value: new THREE.Color(0xfff0d0) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 hor; uniform vec3 sunDir; uniform vec3 sunCol; varying vec3 vP; void main(){ float h = clamp(vP.y*1.6+0.05,0.0,1.0); vec3 c = mix(hor, top, pow(h,0.7)); float s = max(dot(normalize(vP), normalize(sunDir)),0.0); c += sunCol * (pow(s,600.0)*2.0 + pow(s,12.0)*0.25); gl_FragColor = vec4(c,1.0); }',
  });
  M.sky.toneMapped = false;
}

/* ---------- свет и время суток ---------- */
function buildLights() {
  const L = W.lights, S = W.scene;
  L.hemi = new THREE.HemisphereLight(0xdfe8f0, 0xc8b49a, 0.9); S.add(L.hemi);   // «земля» светлая: отражённый от пола свет подсвечивает потолок
  L.sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
  L.sun.castShadow = true; L.sun.shadow.mapSize.set(SHOT ? 1024 : 2048, SHOT ? 1024 : 2048); L.sun.shadow.radius = 2.5;
  const c = L.sun.shadow.camera; c.left = -7; c.right = 7; c.top = 7; c.bottom = -7; c.near = 1; c.far = 60;
  L.sun.shadow.bias = -0.0004; L.sun.shadow.normalBias = 0.03;
  L.sun.shadow.autoUpdate = false; W.shadowDirty = true;   // тени пересчитываем, только когда двинулось солнце или что-то большое
  L.sun.target.position.set(3.8, 0, 2.6); S.add(L.sun); S.add(L.sun.target);
  // тёплая подсветка комнат (без теней): имитирует отражённый свет
  const fill = (x, y, z, col, i, d) => { const p = new THREE.PointLight(col, i, d, 1.6); p.position.set(x, y, z); S.add(p); return p; };
  // зал: люстра (светит слабо днём и ярко, если включить), кухня, прихожая+ванная
  L.fZal = fill(2.5, 2.05, 1.9, 0xffe2bc, 2.4, 8);
  L.fKit = fill(6.36, 2.1, 1.9, 0xffe8c8, 1.8, 6);
  L.fHall = fill(3.4, 2.2, 4.7, 0xffe0b8, 2.2, 7);
}
// время суток: h — часы (9…18.5)
function setDaylight(h) {
  const L = W.lights, M = W.mats;
  const k = THREE.MathUtils.clamp((h - 9) / 9, 0, 1);            // 0 утро → 1 вечер
  const phi = 0.15 * Math.PI + k * 0.85 * Math.PI;
  const el = THREE.MathUtils.degToRad(Math.max(5, 34 * Math.sin(Math.PI * (h - 6.5) / 12.5)));
  const dir = new THREE.Vector3(Math.sin(phi) * Math.cos(el), Math.sin(el), Math.cos(phi) * Math.cos(el));
  L.sun.position.copy(L.sun.target.position).addScaledVector(dir, 30); W.shadowDirty = true;
  const warm = THREE.MathUtils.smoothstep(k, 0.55, 1);
  L.sun.color.setRGB(1, 0.94 - 0.28 * warm, 0.84 - 0.5 * warm);
  L.sun.intensity = 2.7 + 0.8 * warm;
  L.hemi.color.setRGB(0.86 + 0.1 * warm, 0.9 - 0.08 * warm, 0.96 - 0.25 * warm);
  L.hemi.intensity = 0.95 - 0.25 * warm;
  const u = M.sky.uniforms;
  u.top.value.setRGB(0.42 - 0.08 * warm, 0.62 - 0.12 * warm, 0.86 - 0.2 * warm);
  u.hor.value.setRGB(0.9 + 0.08 * warm, 0.88 - 0.1 * warm, 0.82 - 0.32 * warm);
  u.sunDir.value.copy(dir); u.sunCol.value.setRGB(1, 0.9 - 0.3 * warm, 0.7 - 0.4 * warm);
  if (W.scene.fog) W.scene.fog.color.copy(u.hor.value);
  return dir;
}

function buildWorld(scene) {
  W.scene = scene;
  buildMaterials();
  buildZal(); buildKitchen(); buildBath(); buildHall(); buildBalcony(); buildOutside();
  buildLights();
  // стены между зоной зала и кухни снаружи (торцы проёмов) + общий потолок над балконным порогом
  bx(3.1, 2.2, -0.3, 3.85, H, 0, W.mats.reveal);
  return W;
}
