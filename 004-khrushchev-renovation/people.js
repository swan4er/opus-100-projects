/* ================================================================
   people.js — персонажи из простых форм: бабушка-хозяйка,
   сосед по балкону, сосед снизу, кот. Анимации — процедурные:
   ходьба, разговор, указать тростью, возмущаться, считать деньги.
   ================================================================ */
'use strict';
const PEOPLE = { baba: null, mih: null, gena: null, cat: null };
function pm(c, r = 0.85, extra) { return new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: r }, extra || {})); }
function pp(geo, m, x, y, z, parent) { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); parent.add(me); me.castShadow = true; me.receiveShadow = true; return me; }
function pivot(x, y, z, parent) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }

// платок «в цветочек»
function texScarf() {
  const S = 256, c = cnv(S, S), g = c.getContext('2d'), r = rnd(333);
  g.fillStyle = '#b8322a'; g.fillRect(0, 0, S, S);
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
    const x = i * 64 + 32 + (j % 2) * 16, y = j * 64 + 32;
    flower5(g, x, y, 14, '#f0c24a', '#2f5a3a', r());
    leaf(g, x + 10, y + 10, 16, 5, 0.8, '#3f7a4a'); leaf(g, x - 10, y + 8, 14, 5, 2.4, '#3f7a4a');
  }
  g.strokeStyle = '#f3e3b0'; g.lineWidth = 6; g.strokeRect(3, 3, S - 6, S - 6);
  return c;
}
function texTabby() {
  const S = 128, c = cnv(S, S), g = c.getContext('2d');
  g.fillStyle = '#8f8a82'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 9; i++) { g.fillStyle = 'rgba(60,55,50,0.55)'; g.fillRect(0, i * 14 + 3, S, 5); }
  return c;
}

/* ---------- общая «кукла»: ноги, туловище, руки, голова с лицом ---------- */
function makeFace(head, R, o) {
  const skin = o.skin;
  const face = new THREE.Group(); head.add(face);
  const eyeM = pm(0x1b1512, 0.4), whiteM = pm(0xf4efe6, 0.5);
  const eyes = [];
  for (const s of [-1, 1]) {
    const w = pp(new THREE.SphereGeometry(R * 0.2, 12, 8), whiteM, s * R * 0.36, R * 0.12, R * 0.84, face); w.scale.z = 0.5;
    const e = pp(new THREE.SphereGeometry(R * 0.11, 10, 8), eyeM, s * R * 0.36, R * 0.12, R * 0.93, face); e.scale.z = 0.5;
    eyes.push(w, e);
  }
  const brows = [];
  for (const s of [-1, 1]) { const b = pp(new THREE.BoxGeometry(R * 0.36, R * 0.07, R * 0.08), pm(o.brow, 0.9), s * R * 0.37, R * 0.38, R * 0.9, face); b.rotation.z = s * 0.1; brows.push(b); }
  const nose = pp(new THREE.SphereGeometry(R * (o.bigNose ? 0.2 : 0.15), 10, 8), pm(o.nose || skin, 0.6), 0, -R * 0.05, R * 1.0, face);
  const mouth = pp(new THREE.SphereGeometry(R * 0.16, 12, 8), pm(0x5a1f1f, 0.6), 0, -R * 0.38, R * 0.86, face); mouth.scale.set(1.3, 0.25, 0.4);
  for (const s of [-1, 1]) { const ch = pp(new THREE.SphereGeometry(R * 0.16, 10, 8), pm(0xe89a8a, 0.7), s * R * 0.58, -R * 0.2, R * 0.72, face); ch.scale.z = 0.4; }
  for (const s of [-1, 1]) { const ear = pp(new THREE.SphereGeometry(R * 0.2, 10, 8), pm(skin, 0.7), s * R * 0.98, 0, 0, head); ear.scale.set(0.45, 1, 0.7); }
  return { face, eyes, brows, mouth, nose };
}
function makeArm(side, sh, o, parent) {
  const arm = pivot(side * sh.x, sh.y, 0, parent);
  pp(new THREE.CapsuleGeometry(o.armR, o.upper, 4, 10), o.sleeve, 0, -o.upper / 2 - 0.02, 0, arm);
  const fore = pivot(0, -o.upper - 0.03, 0, arm);
  pp(new THREE.CapsuleGeometry(o.armR * 0.9, o.lower, 4, 10), o.fore || o.sleeve, 0, -o.lower / 2 - 0.02, 0, fore);
  const hand = pp(new THREE.SphereGeometry(o.armR * 1.15, 10, 8), o.skinM, 0, -o.lower - 0.06, 0, fore);
  return { arm, fore, hand };
}
function makeLeg(side, o, parent) {
  const leg = pivot(side * o.hipX, o.hip, 0, parent);
  pp(new THREE.CylinderGeometry(o.legR, o.legR * 0.85, o.hip - 0.06, 10), o.legM, 0, -(o.hip - 0.06) / 2, 0, leg);
  const shoe = pp(new LIB.RoundedBoxGeometry(o.legR * 2.4, 0.07, o.legR * 4, 2, 0.03), o.shoeM, 0, -o.hip + 0.035, o.legR * 0.9, leg);
  return { leg, shoe };
}
function makeBase(o) {
  const root = new THREE.Group(), body = pivot(0, 0, 0, root);
  const legs = [makeLeg(-1, o, body), makeLeg(1, o, body)];
  const torso = pivot(0, o.hip, 0, body);
  const arms = [makeArm(-1, o.shoulder, o, torso), makeArm(1, o.shoulder, o, torso)];
  const neck = pivot(0, o.neck, 0, torso);
  const head = pivot(0, o.R * 1.05, 0, neck);
  pp(new THREE.SphereGeometry(o.R, 20, 16), o.skinM, 0, 0, 0, head);
  const face = makeFace(head, o.R, o);
  W.scene.add(root);
  return { root, body, legs, torso, arms, neck, head, face, R: o.R,
    state: 'idle', talking: 0, phase: Math.random() * 6, path: null, speed: o.speed || 0.9, blink: 2 + Math.random() * 3, mood: 0, pointAt: null, onArrive: null, anim: {} };
}

/* ---------- бабушка: платок, очки, кофта, трость ---------- */
function makeBaba() {
  const skinM = pm(0xe9b898, 0.7);
  const o = { R: 0.135, skin: 0xe9b898, skinM, brow: 0xb8b0a6, hip: 0.46, hipX: 0.075, legR: 0.045, legM: pm(0x6a5048, 0.8), shoeM: pm(0x1f1814, 0.6),
    shoulder: { x: 0.2, y: 0.44 }, neck: 0.5, armR: 0.042, upper: 0.2, lower: 0.2, sleeve: pm(0x2f5a55, 0.95), speed: 0.85 };
  const b = makeBase(o);
  // юбка и кофта
  pp(new THREE.CylinderGeometry(0.19, 0.27, 0.46, 18), pm(0x4b3226, 0.9), 0, 0.27, 0, b.body);
  const cardigan = pp(new LIB.RoundedBoxGeometry(0.4, 0.5, 0.28, 3, 0.1), pm(0x2f5a55, 0.95), 0, 0.22, 0, b.torso);
  for (let i = 0; i < 4; i++) pp(new THREE.SphereGeometry(0.012, 8, 6), pm(0xd9c9a0, 0.4), 0, 0.38 - i * 0.09, 0.14, b.torso);
  pp(new THREE.CylinderGeometry(0.13, 0.15, 0.05, 16), pm(0xe8dcc4, 0.9), 0, 0.47, 0, b.torso); // воротничок
  void cardigan;
  // платок: шапочка + узел под подбородком + треугольник сзади
  const scarfM = new THREE.MeshStandardMaterial({ map: toTex(texScarf(), 2, 2), roughness: 0.9 });
  const cap = pp(new THREE.SphereGeometry(o.R * 1.1, 22, 16, 0, Math.PI * 2, 0, Math.PI * 0.56), scarfM, 0, 0.012, -0.012, b.head); cap.rotation.x = -0.42;
  const back = pp(new THREE.ConeGeometry(o.R * 0.95, o.R * 1.4, 16, 1, true), scarfM, 0, -o.R * 0.42, -o.R * 0.55, b.head); back.rotation.x = 0.35;
  pp(new THREE.SphereGeometry(o.R * 0.2, 10, 8), scarfM, 0, -o.R * 0.98, o.R * 0.42, b.head);
  for (const s of [-1, 1]) { const tl = pp(new THREE.ConeGeometry(o.R * 0.14, o.R * 0.6, 8), scarfM, s * o.R * 0.14, -o.R * 1.25, o.R * 0.45, b.head); tl.rotation.z = s * 0.4; }
  // очки
  const gold = pm(0x8a6a3a, 0.35, { metalness: 0.7 });
  for (const s of [-1, 1]) { const rim = pp(new THREE.TorusGeometry(o.R * 0.26, o.R * 0.035, 6, 18), gold, s * o.R * 0.36, o.R * 0.12, o.R * 1.0, b.head); rim.castShadow = false; }
  pp(new THREE.BoxGeometry(o.R * 0.2, o.R * 0.04, o.R * 0.04), gold, 0, o.R * 0.16, o.R * 1.02, b.head);
  const lensM = new THREE.MeshStandardMaterial({ color: 0xdfeaf0, roughness: 0.05, transparent: true, opacity: 0.25, depthWrite: false });
  for (const s of [-1, 1]) pp(new THREE.CircleGeometry(o.R * 0.25, 16), lensM, s * o.R * 0.36, o.R * 0.12, o.R * 1.01, b.head).castShadow = false;
  // трость в правой руке
  const cane = pivot(0, -o.lower - 0.06, 0.0, b.arms[1].fore);
  const caneM = pm(0x3a2418, 0.5);
  pp(new THREE.CylinderGeometry(0.011, 0.011, 0.86, 8), caneM, 0, -0.4, 0.02, cane);
  const hook = pp(new THREE.TorusGeometry(0.04, 0.011, 6, 12, Math.PI), caneM, 0, 0.02, -0.02, cane); hook.rotation.y = Math.PI / 2;
  pp(new THREE.CylinderGeometry(0.014, 0.014, 0.03, 8), pm(0x1a1a1a, 0.8), 0, -0.84, 0.02, cane);
  b.cane = cane;
  // авоська с пирожками в левой руке
  const bag = pivot(0, -o.lower - 0.1, 0, b.arms[0].fore);
  pp(new LIB.RoundedBoxGeometry(0.2, 0.2, 0.1, 2, 0.04), pm(0x6a4a2a, 0.9), 0, -0.1, 0, bag);
  pp(new THREE.TorusGeometry(0.05, 0.008, 6, 12, Math.PI), pm(0x3a2a1a, 0.8), 0, 0.0, 0, bag);
  b.bag = bag;
  b.kind = 'baba'; b.voice = 'baba';
  b.root.traverse((q) => { if (q.isMesh) { q.userData.tag = 'baba'; } });
  return b;
}

/* ---------- Михалыч: майка, пузо, треники, усы, сигарета ---------- */
function makeMih() {
  const skinM = pm(0xdca084, 0.7);
  const o = { R: 0.13, skin: 0xdca084, skinM, brow: 0x5a5048, nose: 0xd07a6a, bigNose: true, hip: 0.5, hipX: 0.09, legR: 0.06, legM: pm(0x2e3e6a, 0.9), shoeM: pm(0x3a2a22, 0.8),
    shoulder: { x: 0.23, y: 0.52 }, neck: 0.58, armR: 0.05, upper: 0.23, lower: 0.22, sleeve: skinM };
  const b = makeBase(o);
  pp(new THREE.CylinderGeometry(0.2, 0.17, 0.3, 14), pm(0x2e3e6a, 0.9), 0, 0.5, 0, b.body);
  const belly = pp(new THREE.SphereGeometry(0.24, 18, 14), pm(0xe6e1d6, 0.95), 0, 0.26, 0.05, b.torso); belly.scale.set(1.0, 1.05, 1.1);
  pp(new THREE.CylinderGeometry(0.19, 0.23, 0.3, 14), pm(0xe6e1d6, 0.95), 0, 0.42, 0, b.torso);
  // лысина, венчик волос, усы
  const hair = pp(new THREE.TorusGeometry(o.R * 0.92, o.R * 0.22, 8, 20), pm(0x9a948a, 1), 0, -o.R * 0.05, -o.R * 0.1, b.head); hair.rotation.x = Math.PI / 2 + 0.3;
  const mus = pp(new THREE.CapsuleGeometry(o.R * 0.14, o.R * 0.7, 4, 8), pm(0x6a625a, 1), 0, -o.R * 0.25, o.R * 0.95, b.head); mus.rotation.z = Math.PI / 2;
  // сигарета в правой руке
  const cig = pivot(0, -o.lower - 0.08, 0.04, b.arms[1].fore);
  pp(new THREE.CylinderGeometry(0.005, 0.005, 0.08, 6), pm(0xf2eee4, 0.8), 0, 0, 0.03, cig).rotation.x = Math.PI / 2;
  const ember = pp(new THREE.SphereGeometry(0.007, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff6a2a }), 0, 0, 0.07, cig);
  b.ember = ember; b.cig = cig;
  b.kind = 'mih'; b.voice = 'mih';
  return b;
}

/* ---------- Геннадий снизу: халат, полотенце на голове, ведро ---------- */
function makeGena() {
  const skinM = pm(0xe0a88a, 0.7);
  const robe = pm(0x6a4a3a, 0.95);
  const o = { R: 0.13, skin: 0xe0a88a, skinM, brow: 0x2a2018, hip: 0.5, hipX: 0.08, legR: 0.05, legM: skinM, shoeM: pm(0x2a4a7a, 0.8),
    shoulder: { x: 0.22, y: 0.5 }, neck: 0.57, armR: 0.05, upper: 0.23, lower: 0.22, sleeve: robe, fore: robe };
  const b = makeBase(o);
  pp(new THREE.CylinderGeometry(0.21, 0.26, 0.62, 16), robe, 0, 0.4, 0, b.body);
  pp(new LIB.RoundedBoxGeometry(0.44, 0.56, 0.3, 3, 0.1), robe, 0, 0.26, 0, b.torso);
  pp(new THREE.TorusGeometry(0.22, 0.02, 6, 20), pm(0xd8c8a0, 0.9), 0, 0.05, 0, b.torso).rotation.x = Math.PI / 2;
  // полотенце-тюрбан
  const tw = pm(0x7aa0c8, 1);
  pp(new THREE.SphereGeometry(o.R * 1.12, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), tw, 0, o.R * 0.15, -o.R * 0.05, b.head);
  pp(new THREE.TorusGeometry(o.R * 0.95, o.R * 0.25, 8, 18), tw, 0, o.R * 0.35, 0, b.head).rotation.x = Math.PI / 2;
  // ведро в левой руке
  const bucket = pivot(0, -o.lower - 0.1, 0, b.arms[0].fore);
  pp(new THREE.CylinderGeometry(0.13, 0.1, 0.24, 16), pm(0x9aa3a6, 0.4, { metalness: 0.6 }), 0, -0.15, 0, bucket);
  pp(new THREE.CylinderGeometry(0.12, 0.12, 0.01, 16), pm(0x8aa8b8, 0.1), 0, -0.07, 0, bucket);
  b.kind = 'gena'; b.voice = 'gena';
  // брови сразу сердитые
  b.mood = -1;
  return b;
}

/* ---------- кот Барсик ---------- */
function makeCat() {
  const m = new THREE.MeshStandardMaterial({ map: toTex(texTabby(), 2, 2), roughness: 1 });
  const root = new THREE.Group(); W.scene.add(root);
  const body = pp(new THREE.SphereGeometry(0.16, 16, 12), m, 0, 0.09, 0, root); body.scale.set(1.25, 0.72, 1);
  const head = pivot(0.15, 0.1, 0.07, root);
  pp(new THREE.SphereGeometry(0.075, 14, 10), m, 0, 0, 0, head);
  for (const s of [-1, 1]) { const e = pp(new THREE.ConeGeometry(0.028, 0.05, 6), m, 0.01, 0.065, s * 0.04, head); e.rotation.z = -0.3; }
  const eyeM = pm(0x1b1512, 0.4);
  const eyes = [];
  for (const s of [-1, 1]) { const e = pp(new THREE.SphereGeometry(0.012, 8, 6), eyeM, 0.065, 0.015, s * 0.028, head); e.scale.y = 0.15; eyes.push(e); }
  const tail = new THREE.Group(); root.add(tail);
  for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 1.1; pp(new THREE.SphereGeometry(0.03 - i * 0.002, 8, 6), m, -0.18 + Math.sin(a) * 0.05, 0.05, -0.02 + Math.cos(a) * 0.13 - 0.1, tail); }
  root.traverse((q) => { if (q.isMesh) { q.userData.tag = 'cat'; W.paintables.push(q); } });
  return { root, body, head, eyes, tail, state: 'sleep', t: 0, meow: 20 };
}

/* ---------- дым сигарет ---------- */
const SMOKE = { list: [], tex: null };
function smokePuff(pos, k = 1) {
  if (!SMOKE.tex) {
    const c = cnv(64, 64), g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    gr.addColorStop(0, 'rgba(235,232,225,0.9)'); gr.addColorStop(1, 'rgba(235,232,225,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    SMOKE.tex = new THREE.CanvasTexture(c);
  }
  if (SMOKE.list.length > 60) return;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: SMOKE.tex, transparent: true, opacity: 0.5 * k, depthWrite: false }));
  s.position.copy(pos); s.scale.setScalar(0.05); W.scene.add(s);
  SMOKE.list.push({ s, t: 0, life: 2.4 + Math.random(), v: new THREE.Vector3((Math.random() - 0.5) * 0.06, 0.16 + Math.random() * 0.1, (Math.random() - 0.5) * 0.06), k });
}
function updateSmoke(dt) {
  for (let i = SMOKE.list.length - 1; i >= 0; i--) {
    const p = SMOKE.list[i]; p.t += dt;
    p.s.position.addScaledVector(p.v, dt); p.v.x += Math.sin(p.t * 2 + i) * dt * 0.03;
    p.s.scale.setScalar(0.05 + p.t * 0.16);
    p.s.material.opacity = 0.45 * p.k * (1 - p.t / p.life);
    if (p.t > p.life) { W.scene.remove(p.s); p.s.material.dispose(); SMOKE.list.splice(i, 1); }
  }
}

/* ---------- анимация ---------- */
let _v = null;                 // создаётся в initPeople: THREE появляется только в KR_BOOT
function walkTo(p, pts, onArrive) { p.path = pts.map(([x, z]) => new THREE.Vector3(x, 0, z)); p.onArrive = onArrive || null; p.state = 'walk'; }
function faceTo(p, x, z) { p.targetYaw = Math.atan2(x - p.root.position.x, z - p.root.position.z); }
// маршрут по квартире через дверные проёмы
function routeTo(from, to) {
  const ra = roomAt(from.x, from.z), rb = roomAt(to[0], to[1]);
  const door = (r) => ({ zal: [4.3, 3.86], kit: [5.87, 3.86], bath: [1.96, 4.62], balc: [3.47, -0.15] })[r];
  const pts = [];
  if (ra !== rb) {
    if (ra === 'balc') pts.push([3.47, -0.15], [3.47, 0.5]);
    if (ra !== 'hall' && ra !== 'balc') { const d = door(ra); pts.push(ra === 'bath' ? [1.7, 4.62] : [d[0], d[1] - 0.35], d, ra === 'bath' ? [2.35, 4.62] : [d[0], d[1] + 0.45]); }
    if (rb !== 'hall' && rb !== 'balc') { const d = door(rb); pts.push(rb === 'bath' ? [2.35, 4.62] : [d[0], d[1] + 0.45], d, rb === 'bath' ? [1.6, 4.62] : [d[0], d[1] - 0.4]); }
  }
  pts.push(to);
  return pts;
}
function animPerson(p, dt, t) {
  p.phase += dt;
  const A = p.anim;
  // ходьба по маршруту
  let walking = false;
  if (p.state === 'walk' && p.path && p.path.length) {
    const tgt = p.path[0], pos = p.root.position;
    _v.set(tgt.x - pos.x, 0, tgt.z - pos.z);
    const d = _v.length();
    if (d < 0.06) { p.path.shift(); if (!p.path.length) { p.state = 'idle'; const cb = p.onArrive; p.onArrive = null; cb && cb(); } }
    else { _v.normalize(); const step = Math.min(d, p.speed * dt); pos.addScaledVector(_v, step); p.targetYaw = Math.atan2(_v.x, _v.z); walking = true; }
  }
  if (p.targetYaw != null) { let dy = p.targetYaw - p.root.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); p.root.rotation.y += dy * Math.min(1, dt * 6); }
  const w = walking ? 1 : 0;
  A.w = lerp(A.w || 0, w, Math.min(1, dt * 6));
  const ph = p.phase * 6.2;
  p.legs[0].leg.rotation.x = Math.sin(ph) * 0.42 * A.w; p.legs[1].leg.rotation.x = -Math.sin(ph) * 0.42 * A.w;
  p.body.position.y = Math.abs(Math.sin(ph)) * 0.022 * A.w;
  p.body.rotation.z = Math.sin(ph) * 0.03 * A.w;
  // руки: базовая поза + жесты
  const L = p.arms[0], R = p.arms[1];
  let lx = -Math.sin(ph) * 0.3 * A.w + 0.05, rx = Math.sin(ph) * 0.3 * A.w + 0.05, lz = 0.12, rz = -0.12, lfore = -0.15, rfore = -0.15;
  const talk = p.talking > 0; p.talking = Math.max(0, p.talking - dt);
  if (p.pose === 'point' && p.pointAt) {
    // указать тростью: рука вперёд и вверх на цель
    const hp = new THREE.Vector3(); p.torso.getWorldPosition(hp); hp.y += 0.4;
    const dy = p.pointAt.y - hp.y, dh = Math.hypot(p.pointAt.x - hp.x, p.pointAt.z - hp.z);
    rx = -Math.PI / 2 - Math.atan2(dy, dh) + Math.sin(t * 2.2) * 0.04; rfore = 0.05; rz = -0.05;
  } else if (p.pose === 'angry') { rx = -2.4 + Math.sin(t * 13) * 0.35; rfore = -0.6; rz = -0.3; }
  else if (p.pose === 'think') { lx = -1.9; lfore = -1.9; lz = 0.3; }
  else if (p.pose === 'count') { lx = -0.9; lfore = -1.1; rx = -0.9 + Math.sin(t * 7) * 0.12; rfore = -1.2; lz = 0.35; rz = -0.35; }
  else if (p.pose === 'lean') { lx = -1.35; lfore = -0.9; rx = -1.35; rfore = -0.9; lz = 0.25; rz = -0.25; }
  else if (p.pose === 'smoke') { lx = -1.35; lfore = -0.9; lz = 0.25; rx = -0.7 + Math.max(0, Math.sin(t * 0.9)) * -0.9; rfore = -1.6 - Math.max(0, Math.sin(t * 0.9)) * 0.7; rz = -0.3; }
  else if (talk && p.kind !== 'baba') { rx = -0.8 + Math.sin(t * 5) * 0.25; rfore = -0.9; }
  else if (talk) { lx = -0.5 + Math.sin(t * 4.3) * 0.2; lfore = -0.8; }
  const k = Math.min(1, dt * 7);
  L.arm.rotation.x = lerp(L.arm.rotation.x, lx, k); L.arm.rotation.z = lerp(L.arm.rotation.z, lz, k); L.fore.rotation.x = lerp(L.fore.rotation.x, lfore, k);
  R.arm.rotation.x = lerp(R.arm.rotation.x, rx, k); R.arm.rotation.z = lerp(R.arm.rotation.z, rz, k); R.fore.rotation.x = lerp(R.fore.rotation.x, rfore, k);
  if (p.cane) p.cane.rotation.x = p.pose === 'point' ? 0 : -R.arm.rotation.x - R.fore.rotation.x + (walking ? Math.sin(ph) * 0.15 : 0);
  // голова: кивки, разговор, моргание, брови
  p.neck.rotation.x = lerp(p.neck.rotation.x, (talk ? Math.sin(t * 3.1) * 0.08 : Math.sin(t * 0.7) * 0.03) + (p.pose === 'think' ? 0.15 : 0), k);
  p.neck.rotation.y = lerp(p.neck.rotation.y, p.lookYaw || 0, k);
  p.neck.rotation.z = p.pose === 'think' ? 0.18 : Math.sin(t * 0.5) * 0.03;
  const f = p.face;
  f.mouth.scale.y = talk ? 0.25 + Math.abs(Math.sin(t * 17)) * 0.9 : lerp(f.mouth.scale.y, p.mood < 0 ? 0.18 : 0.25, k);
  f.mouth.scale.x = p.mood > 0 ? 1.5 : 1.3;
  p.blink -= dt; const bl = p.blink < 0.12 ? 0.1 : 1; if (p.blink < 0) p.blink = 2.5 + Math.random() * 3;
  f.eyes.forEach((e) => { e.scale.y = bl; });
  const ang = p.mood < 0 ? 0.35 : p.mood > 0 ? -0.1 : 0.08;
  f.brows[0].rotation.z = lerp(f.brows[0].rotation.z, -ang, k); f.brows[1].rotation.z = lerp(f.brows[1].rotation.z, ang, k);
  f.brows.forEach((b) => { b.position.y = lerp(b.position.y, p.R * (p.pose === 'think' ? 0.46 : p.mood < 0 ? 0.33 : 0.4), k); });
  p.torso.scale.y = 1 + Math.sin(t * 1.8) * 0.01;
}
function updatePeople(dt, t) {
  for (const k of ['baba', 'mih', 'gena']) { const p = PEOPLE[k]; if (p && p.root.visible) animPerson(p, dt, t); }
  const c = PEOPLE.cat;
  if (c) {
    c.body.scale.y = 0.72 + Math.sin(t * 1.4) * 0.03;
    c.tail.rotation.y = Math.sin(t * 0.6) * 0.1;
    if (c.state === 'hungry') { c.head.rotation.z = 0.3 + Math.sin(t * 2) * 0.05; c.eyes.forEach((e) => { e.scale.y = 1; }); }
    c.meow -= dt;
    if (G.mode === 'play' && !JOB.cat.fed && G.t > 13 * 60 && c.meow < 0) { c.meow = 25 + Math.random() * 20; if (c.state !== 'hungry') catWake(); if (Math.hypot(P.x - c.root.position.x, P.z - c.root.position.z) < 5) SFX.play('meow'); }
  }
  const m = PEOPLE.mih;
  if (m && m.root.visible && m.ember) { m._puff = (m._puff || 0) - dt; if (m._puff < 0) { m._puff = 0.35; const e = new THREE.Vector3(); m.ember.getWorldPosition(e); smokePuff(e, 0.7); } }
  updateSmoke(dt);
}
function catWake() {
  const c = PEOPLE.cat; c.state = 'hungry';
  // голодный кот уходит на кухню к пустой миске
  c.root.position.set(6.45, 0, 3.4); c.root.rotation.y = 0.4; c.body.scale.set(1.1, 0.95, 0.85); c.head.position.set(0.14, 0.2, 0);
}
function catToBowl() { const c = PEOPLE.cat; if (!c) return; c.state = 'eat'; c.root.position.set(6.5, 0, 3.52); c.root.rotation.y = 0; c.head.position.set(0.16, 0.06, 0); c.body.scale.set(1.2, 0.8, 0.9); }
function initPeople() {
  _v = new THREE.Vector3();
  PEOPLE.baba = makeBaba(); PEOPLE.baba.root.visible = false;
  PEOPLE.mih = makeMih(); PEOPLE.mih.root.position.set(5.32, -0.02, -0.72); PEOPLE.mih.root.rotation.y = -Math.PI / 2 - 0.35; PEOPLE.mih.targetYaw = PEOPLE.mih.root.rotation.y; PEOPLE.mih.pose = 'smoke'; PEOPLE.mih.root.visible = false;
  PEOPLE.gena = makeGena(); PEOPLE.gena.root.position.set(6.92, 0, 6.25); PEOPLE.gena.root.rotation.y = Math.PI; PEOPLE.gena.targetYaw = Math.PI; PEOPLE.gena.root.visible = false;
  PEOPLE.cat = makeCat(); PEOPLE.cat.root.position.set(0.52, 0.53, 1.62); PEOPLE.cat.root.rotation.y = -0.3;
  // куклы собраны «в сантиметрах на глаз»: доводим до человеческого роста
  PEOPLE.baba.root.scale.setScalar(1.1); PEOPLE.mih.root.scale.setScalar(1.22); PEOPLE.gena.root.scale.setScalar(1.2);
}
// точка над головой персонажа (для пузыря реплики)
function headWorld(p) { const v = new THREE.Vector3(); p.head.getWorldPosition(v); v.y += p.R * 1.5 * p.root.scale.y; return v; }
