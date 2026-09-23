/* Улитка идёт на концерт — ядро фильма: математика, земля, риги персонажей, свет.
   Кадр — чистая функция времени: evaluate(t) → состояние сцены. Персонажи живут на 12 кадрах в секунду. */
'use strict';

const FPS = 12;

// ---------------------------------------------------------------- числа и векторы
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  madd: (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
  // поворот вектора v вокруг единичной оси k на угол a (формула Родрига)
  rot: (v, k, a) => {
    const c = Math.cos(a), s = Math.sin(a), d = V.dot(k, v), x = V.cross(k, v);
    return [v[0] * c + x[0] * s + k[0] * d * (1 - c), v[1] * c + x[1] * s + k[1] * d * (1 - c), v[2] * c + x[2] * s + k[2] * d * (1 - c)];
  },
};

// ---------------------------------------------------------------- плавность движения
const E = {
  lin: (t) => t,
  in: (t) => t * t * t,
  out: (t) => 1 - Math.pow(1 - t, 3),
  io: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  sine: (t) => 0.5 - 0.5 * Math.cos(Math.PI * t),
  outBack: (t) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  inBack: (t) => { const c1 = 1.7, c3 = c1 + 1; return c3 * t * t * t - c1 * t * t; },
  outElastic: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -9 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 3) + 1),
  hold: (t) => (t < 1 ? 0 : 1),
};
// доля пути по отрезку времени
const seg = (t, t0, t1, ease = E.io) => ease(clamp((t - t0) / (t1 - t0), 0, 1));
// ключевые кадры: [[время, значение, easing?], ...]; значение — число или массив
function keys(t, ks) {
  if (t <= ks[0][0]) return ks[0][1];
  for (let i = 1; i < ks.length; i++) {
    if (t <= ks[i][0]) {
      const [t0, v0] = ks[i - 1];
      const [t1, v1, ez] = ks[i];
      const u = (ez || E.io)((t - t0) / (t1 - t0));
      if (Array.isArray(v0)) return v0.map((a, j) => a + (v1[j] - a) * u);
      return v0 + (v1 - v0) * u;
    }
  }
  return ks[ks.length - 1][1];
}
// затухающая пружина после события в момент t0 — захлёст и вторичное движение
const spring = (t, t0, amp, freq = 2.2, damp = 5) => (t < t0 ? 0 : amp * Math.exp(-damp * (t - t0)) * Math.sin((t - t0) * freq * 2 * Math.PI));
// детерминированный шум для «жизни» в паузах
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const wob = (t, seed, f = 1) => {
  const i = Math.floor(t * f), u = t * f - i, a = hash(i + seed * 17.3), b = hash(i + 1 + seed * 17.3);
  return lerp(a, b, u * u * (3 - 2 * u)) * 2 - 1;
};
// моргание: 1 — глаз закрыт
function blinkAt(t, times, dur = 0.25) {
  let v = 0;
  for (const b of times) { const u = (t - b) / dur; if (u > 0 && u < 1) v = Math.max(v, Math.sin(u * Math.PI)); }
  return v;
}

// ---------------------------------------------------------------- земля (копия groundH из шейдера)
function groundH(x, z) {
  let h = -16 * sstep(50, 104, x);
  h += 0.45 * Math.sin(0.13 * x + 1.3) * Math.sin(0.17 * z + 0.4)
    + 0.30 * Math.sin(0.29 * x + 0.8 * Math.sin(0.11 * z) - 0.9) * Math.cos(0.23 * z + 2.1)
    + 0.16 * Math.sin(0.61 * x + 0.37 * z + 1.7) * Math.sin(0.53 * z - 0.41 * x);
  h -= 0.3 * sstep(18, 21, x) * (1 - sstep(37, 40, x));
  return h;
}
function groundN(x, z) {
  const e = 0.25;
  const dx = (groundH(x + e, z) - groundH(x - e, z)) / (2 * e);
  const dz = (groundH(x, z + e) - groundH(x, z - e)) / (2 * e);
  return V.norm([-dx, 1, -dz]);
}

// ---------------------------------------------------------------- улитка
const SNAIL0 = {
  on: 1, x: 0, z: 0, yaw: 0, bodyY: 0,
  len: 1, squash: 1, puff: 0, retract: 0,
  lean: 0, lift: 0, hPitch: 0, hYaw: 0, hRoll: 0,
  eyeL: { len: 1, pitch: 0.15, splay: 0, lid: 0, tilt: 0 },
  eyeR: { len: 1, pitch: 0.15, splay: 0, lid: 0, tilt: 0 },
  look: null, pupil: 0.8,
  mouthOpen: 0, smile: 0.9, mouthW: 0.2,
  shellSpin: 0, shellBob: 0, shellRoll: 0, shellSquash: 0,
  shellPos: null, shellAxes: null, glow: 0,
};
function snail(over) {
  const s = Object.assign({}, SNAIL0, over || {});
  s.eyeL = Object.assign({}, SNAIL0.eyeL, over && over.eyeL);
  s.eyeR = Object.assign({}, SNAIL0.eyeR, over && over.eyeR);
  return s;
}

// Раскладывает позу улитки в 26 векторов для шейдера (точки тела, глаза, веки, рот, раковина).
function rigSnail(P, out) {
  out.fill(0);
  if (!P || !P.on) return out;
  const gy = groundH(P.x, P.z);
  const U = V.norm(V.lerp([0, 1, 0], groundN(P.x, P.z), 0.75));
  const F0 = [Math.cos(P.yaw), 0, Math.sin(P.yaw)];
  const F = V.norm(V.madd(F0, U, -V.dot(F0, U)));
  const R = V.cross(F, U);
  const base = [P.x, gy + P.bodyY, P.z];
  const W = (lx, ly, lz) => [base[0] + F[0] * lx + U[0] * ly + R[0] * lz, base[1] + F[1] * lx + U[1] * ly + R[1] * lz, base[2] + F[2] * lx + U[2] * ly + R[2] * lz];
  const L = P.len, S = P.squash, rt = clamp(P.retract, 0, 1);
  const rE = sstep(0, 1, rt);

  // раковина
  const shellC = P.shellPos ? P.shellPos : W(-0.6 * L, lerp(2.2 * S, 1.95, rE) + P.shellBob, 0);
  let ax;
  if (P.shellAxes) ax = P.shellAxes;
  else {
    const a = P.shellSpin;
    let x = V.rot(F, R, a), y = V.rot(U, R, a);
    const z = R;
    if (P.shellRoll) { x = V.rot(x, F, P.shellRoll); y = V.rot(y, F, P.shellRoll); }
    ax = [x, y, V.norm(V.cross(x, y))];
  }
  const sq = P.shellSquash || 0;
  const sc = [1 + 0.25 * sq, 1 - 0.3 * sq, 1 + 0.2 * sq];
  const minS = Math.min(sc[0], sc[1], sc[2]);

  // тело в локальных координатах
  const pts = [
    [-2.3 * L, 0.27, 0, 0.25],
    [-0.55 * L, 0.52 * S, 0, 0.6 * (1 + 0.45 * P.puff)],
    [1.05 * L, 0.52 * S, 0, 0.5 + 0.1 * P.puff],
    [1.78 * L + P.lean * 0.6, 1.02 * S + P.lift * 0.5, 0, 0.46],
    [2.08 * L + P.lean, 1.68 * S + P.lift, 0, 0.6],
  ];
  const wp = pts.map((q) => {
    let w = W(q[0], q[1], q[2]);
    w = V.lerp(w, shellC, rE * 0.97);
    return [w[0], w[1], w[2], q[3] * (1 - 0.72 * rE)];
  });
  for (let i = 0; i < 5; i++) out.set(wp[i], i * 4);

  // голова: поворот вокруг вертикали, наклон, крен
  let hF = V.rot(F, U, -P.hYaw), hU = U, hR = V.cross(hF, hU);
  hF = V.rot(hF, hR, -P.hPitch); hU = V.rot(hU, hR, -P.hPitch);
  if (P.hRoll) { hU = V.rot(hU, hF, P.hRoll); }
  hR = V.cross(hF, hU);
  const H = wp[4], hr = wp[4][3];

  // стебельки и глаза
  const eyeR0 = 0.29 * (1 - 0.55 * rE);
  const eyes = [];
  [[P.eyeL, -1], [P.eyeR, 1]].forEach(([e, side], i) => {
    const bs = V.add(H, V.add(V.mul(hU, hr * 0.62), V.add(V.mul(hR, side * hr * 0.42), V.mul(hF, hr * 0.02))));
    let dir = V.norm(V.add(V.add(V.mul(hU, Math.cos(e.pitch)), V.mul(hF, Math.sin(e.pitch))), V.mul(hR, side * (0.3 + e.splay))));
    if (P.look) {
      const toT = V.norm(V.sub(P.look, bs));
      dir = V.norm(V.lerp(dir, toT, 0.22));
    }
    const len = (0.1 + 1.25 * clamp(e.len, 0, 1.6)) * (1 - rE);
    const c = V.madd(bs, dir, len + eyeR0 * 0.6);
    const mid = V.madd(V.madd(bs, dir, len * 0.5), hF, -0.1 * len);
    let pd = P.look ? V.norm(V.sub(P.look, c)) : V.norm(V.madd(V.mul(hF, 0.85), dir, 0.2));
    const lidN = V.norm(V.add(V.add(dir, V.mul(hR, side * e.tilt * 0.9)), V.mul(hF, -0.2)));
    const lid = clamp(e.lid + rE * 0.8, 0, 1);
    eyes.push({ bs, c, mid, pd, lidN, off: lerp(0.74, -1.2, lid) });
  });
  out.set([...eyes[0].c, eyeR0], 5 * 4);
  out.set([...eyes[1].c, 0], 6 * 4);
  out.set([...eyes[0].mid, 0.12 * (1 - 0.5 * rE)], 7 * 4);
  out.set([...eyes[1].mid, 0], 8 * 4);
  out.set([...eyes[0].bs, 0], 9 * 4);
  out.set([...eyes[1].bs, 0], 10 * 4);
  out.set([...eyes[0].pd, 1 - (1 - P.pupil) * 1.0], 11 * 4);
  out.set([...eyes[1].pd, 0], 12 * 4);
  out.set([...eyes[0].lidN, eyes[0].off], 13 * 4);
  out.set([...eyes[1].lidN, eyes[1].off], 14 * 4);
  // рот
  const mc = V.add(H, V.add(V.mul(hF, hr * 0.93), V.mul(hU, -hr * 0.22)));
  out.set([...mc, P.mouthOpen], 15 * 4);
  out.set([...hF, P.smile], 16 * 4);
  out.set([...hU, P.mouthW * (1 - rE)], 17 * 4);
  // раковина: оси, делённые на масштаб
  out.set([...V.mul(ax[0], 1 / sc[0]), minS], 18 * 4);
  out.set([...V.mul(ax[1], 1 / sc[1]), 0], 19 * 4);
  out.set([...V.mul(ax[2], 1 / sc[2]), 0], 20 * 4);
  out.set([...shellC, P.glow], 21 * 4);
  // подошва
  out.set([...U, V.dot(U, base) + 0.12 + (P.bodyY > 0 ? -0.2 : 0)], 22 * 4);
  // ограничивающая сфера
  const bc = V.lerp(shellC, H, 0.45);
  let br = 0;
  for (const p of [...wp]) br = Math.max(br, V.len(V.sub(p, bc)) + p[3]);
  for (const e of eyes) br = Math.max(br, V.len(V.sub(e.c, bc)) + 0.4);
  br = Math.max(br, V.len(V.sub(shellC, bc)) + 2.1 * Math.max(sc[0], sc[1], sc[2]));
  out.set([...bc, br + 0.3], 23 * 4);
  // нижние рожки
  const tb = V.madd(V.madd(H, hF, hr * 1.05), hU, -hr * 0.28);
  out.set([...V.madd(tb, hR, -hr * 0.3), 0], 24 * 4);
  out.set([...V.madd(tb, hR, hr * 0.3), 0], 25 * 4);
  return out;
}

// ---------------------------------------------------------------- сверчок
const CRICKET0 = {
  on: 1, x: 0, z: 0, y: null, yaw: 0, scale: 1, lean: 0, bob: 0, sway: 0, hop: 0,
  headTilt: 0, headTurn: 0, look: null, lid: 0, pupil: 0.72,
  antDroop: 0, antPhase: 0, antAmp: 0.15,
  mode: 'stand', bow: 0.5, beat: 0, walk: 0,
  violin: true, baton: false, tie: true, armWave: 0,
};
function cricket(over) { return Object.assign({}, CRICKET0, over || {}); }

function rigCricket(C, out, o) {
  for (let i = 0; i < 30 * 4; i++) out[o + i] = 0;
  if (!C || !C.on) return;
  const s = C.scale;
  const gy = C.y != null ? C.y : groundH(C.x, C.z);
  let F = [Math.cos(C.yaw), 0, Math.sin(C.yaw)];
  let U = [0, 1, 0];
  let R = V.cross(F, U);
  // наклон корпуса вперёд и вбок
  F = V.rot(F, R, -C.lean); U = V.rot(U, R, -C.lean);
  if (C.sway) { U = V.rot(U, F, C.sway); R = V.cross(F, U); }
  const base = [C.x, gy + C.bob, C.z];
  const W = (lx, ly, lz) => V.add(base, V.add(V.mul(F, lx * s), V.add(V.mul(U, ly * s), V.mul(R, lz * s))));
  const put = (i, p, w) => { out[o + i * 4] = p[0]; out[o + i * 4 + 1] = p[1]; out[o + i * 4 + 2] = p[2]; out[o + i * 4 + 3] = w; };
  const sit = C.mode === 'sit';
  const hop = C.hop;
  const pelvis = sit ? W(-0.1, 0.62, 0) : W(-0.05, 1.35 + hop * 0.3, 0);
  const chest = sit ? W(0.0, 1.5, 0) : W(0.05, 2.25 + hop * 0.3, 0);
  // голова
  let hF = V.rot(F, U, -C.headTurn), hU = U;
  let hR = V.cross(hF, hU);
  hF = V.rot(hF, hR, -C.headTilt); hU = V.rot(hU, hR, -C.headTilt);
  hR = V.cross(hF, hU);
  const head = V.add(chest, V.add(V.mul(U, 0.8 * s), V.mul(F, 0.08 * s)));
  const hr = 0.56 * s;
  put(0, pelvis, 0.62 * s);
  put(1, chest, 0.5 * s);
  put(2, head, hr);
  const eL = V.add(head, V.add(V.mul(hF, hr * 0.62), V.add(V.mul(hU, hr * 0.22), V.mul(hR, -hr * 0.42))));
  const eR = V.add(head, V.add(V.mul(hF, hr * 0.62), V.add(V.mul(hU, hr * 0.22), V.mul(hR, hr * 0.42))));
  put(3, eL, 0.21 * s);
  put(4, eR, C.lid);
  const look = C.look ? V.norm(V.sub(C.look, V.lerp(eL, eR, 0.5))) : hF;
  put(5, look, C.pupil);
  // усики: два сегмента, качаются
  const aw = Math.sin(C.antPhase) * C.antAmp, aw2 = Math.sin(C.antPhase * 1.3 + 1) * C.antAmp;
  [[-1, aw, 6], [1, aw2, 8]].forEach(([side, w, idx]) => {
    const b = V.add(head, V.add(V.mul(hU, hr * 0.8), V.add(V.mul(hR, side * hr * 0.25), V.mul(hF, hr * 0.35))));
    const up = 1 - C.antDroop;
    const d1 = V.norm(V.add(V.add(V.mul(hU, 0.8 * up + 0.1), V.mul(hF, 0.45 + 0.4 * C.antDroop)), V.mul(hR, side * (0.35 + w))));
    const m = V.madd(b, d1, 1.0 * s);
    const d2 = V.norm(V.add(V.add(V.mul(hF, 0.9), V.mul(hU, 0.35 * up - 0.7 * C.antDroop)), V.mul(hR, side * (0.45 + w * 1.5))));
    put(idx, m, 0.045 * s);
    put(idx + 1, V.madd(m, d2, 1.05 * s), 0);
  });
  // руки
  const shL = V.add(chest, V.add(V.mul(U, 0.2 * s), V.mul(R, -0.44 * s)));
  const shR = V.add(chest, V.add(V.mul(U, 0.2 * s), V.mul(R, 0.44 * s)));
  let hL, hRt, elL, elR;
  let vio = null, bowA = null, bowB = null, bowKind = 0;
  if (C.mode === 'violin' && C.violin) {
    const nd = V.norm(V.add(V.add(V.mul(F, 0.78), V.mul(R, -0.5)), V.mul(U, 0.12)));
    const fn = V.norm(V.madd(U, nd, -V.dot(U, nd)));
    const vc = V.add(chest, V.add(V.add(V.mul(U, 0.42 * s), V.mul(F, 0.38 * s)), V.mul(R, -0.3 * s)));
    const vs = 0.78 * s;
    vio = { c: vc, nd, fn, vs };
    hL = V.madd(vc, nd, vs * 0.95);
    const bd = V.norm(V.cross(nd, fn));
    const contact = V.madd(V.madd(vc, nd, -0.02 * vs), fn, 0.2 * vs);
    const b = clamp(C.bow, 0, 1);
    const blen = 1.75 * s;
    bowA = V.madd(contact, bd, blen * (0.12 + 0.76 * b));
    bowB = V.madd(bowA, bd, -blen);
    bowKind = 1;
    hRt = bowA;
    elL = V.add(V.lerp(shL, hL, 0.5), V.add(V.mul(U, -0.35 * s), V.mul(R, -0.22 * s)));
    elR = V.add(V.lerp(shR, hRt, 0.5), V.add(V.mul(U, -0.4 * s), V.mul(R, 0.3 * s)));
  } else if (C.mode === 'conduct') {
    const bt = C.beat;
    // схема дирижирования на три доли
    const ph = (bt % 1 + 1) % 1, k = Math.floor(((bt % 3) + 3) % 3);
    const pts = [[0.55, 0.55, 0.25], [0.55, 0.15, -0.2], [0.6, 0.25, 0.55]];
    const a = pts[k], b2 = pts[(k + 1) % 3];
    const u = E.io(ph);
    const loc = [lerp(a[0], b2[0], u), lerp(a[1], b2[1], u) + 0.25 * Math.sin(u * Math.PI), lerp(a[2], b2[2], u)];
    hRt = V.add(shR, V.add(V.mul(F, loc[0] * s * (1 + C.armWave)), V.add(V.mul(U, loc[1] * s), V.mul(R, loc[2] * s))));
    hL = V.add(shL, V.add(V.mul(F, 0.5 * s), V.add(V.mul(U, (0.1 + 0.35 * Math.sin(bt * Math.PI * 2 / 3)) * s), V.mul(R, -0.35 * s))));
    elL = V.add(V.lerp(shL, hL, 0.5), V.add(V.mul(U, -0.3 * s), V.mul(R, -0.25 * s)));
    elR = V.add(V.lerp(shR, hRt, 0.5), V.add(V.mul(U, -0.3 * s), V.mul(R, 0.25 * s)));
    if (C.baton) { bowA = hRt; bowB = V.add(hRt, V.mul(V.norm(V.add(V.add(V.mul(F, 0.7), V.mul(U, 0.55)), V.mul(R, -0.2))), 1.3 * s)); bowKind = 2; }
  } else {
    const wv = C.armWave;
    hL = V.add(shL, V.add(V.mul(U, (-0.85 + wv * 1.7) * s), V.add(V.mul(F, (0.25 + wv * 0.3) * s), V.mul(R, (-0.25 - wv * 0.35) * s))));
    hRt = V.add(shR, V.add(V.mul(U, -0.85 * s), V.add(V.mul(F, 0.25 * s), V.mul(R, 0.25 * s))));
    if (sit) { hL = V.add(shL, V.add(V.mul(U, -0.6 * s), V.mul(F, 0.55 * s))); hRt = V.add(shR, V.add(V.mul(U, -0.6 * s), V.mul(F, 0.55 * s))); }
    elL = V.add(V.lerp(shL, hL, 0.5), V.add(V.mul(R, -0.25 * s), V.mul(F, -0.1 * s)));
    elR = V.add(V.lerp(shR, hRt, 0.5), V.add(V.mul(R, 0.25 * s), V.mul(F, -0.1 * s)));
    if (C.violin && C.mode !== 'violin') {
      // скрипка под мышкой
      const nd = V.norm(V.add(V.mul(U, -0.3), V.mul(F, 1.0)));
      vio = { c: V.add(chest, V.add(V.mul(R, -0.62 * s), V.mul(F, 0.05 * s))), nd, fn: V.norm(V.cross(nd, U)), vs: 0.7 * s };
      hL = V.add(vio.c, V.mul(nd, 0.6 * s));
      elL = V.add(V.lerp(shL, hL, 0.5), V.mul(R, -0.35 * s));
    }
  }
  const ar = 0.1 * s;
  put(10, shL, ar); put(11, elL, 0); put(12, hL, 0);
  put(13, shR, 0); put(14, elR, 0); put(15, hRt, 0);
  // ноги: высокое колено кузнечика
  const lr = 0.1 * s;
  [[-1, 16], [1, 19]].forEach(([side, idx]) => {
    let hip, knee, foot;
    if (sit) {
      hip = W(-0.05, 0.55, side * 0.34);
      knee = W(0.75, 1.05, side * 0.52);
      foot = W(1.25, 0.1, side * 0.5);
    } else {
      const lift = hop * 0.9;
      const st = Math.sin(C.walk * Math.PI * 2 + (side > 0 ? Math.PI : 0)) * 0.25;
      hip = W(-0.12, 1.22 + hop * 0.3, side * 0.34);
      knee = W(-0.8 + st * 0.3, 2.0 + hop * 0.2, side * 0.46);
      foot = W(0.15 + st, 0.07 + Math.max(0, st) * 0.4 + lift, side * 0.5);
    }
    put(idx, hip, lr); put(idx + 1, knee, 0); put(idx + 2, foot, 0);
  });
  if (vio) { put(22, vio.c, vio.vs); put(23, vio.nd, 0); put(24, vio.fn, 0); }
  if (bowA) { put(25, bowA, bowKind); put(26, bowB, 0); }
  const bc = V.add(chest, V.mul(U, 0.3 * s));
  put(27, bc, 3.3 * s);
  put(28, F, 1 * s);
  put(29, U, C.tie ? 1 : 0);
}

// ---------------------------------------------------------------- свет: время суток
const LIGHT = {
  dawn: {
    key: [0.78, 0.3, -0.45], keyCol: [2.5, 1.6, 1.05], sky: [0.36, 0.42, 0.62], gnd: [0.16, 0.2, 0.08],
    rim: [0.75, 0.35, -0.55], rimCol: [1.1, 0.72, 0.45],
    skyTop: [0.3, 0.46, 0.78], skyHor: [1.05, 0.76, 0.58], skyLow: [0.36, 0.42, 0.3],
    sun: [0.8, 0.1, -0.6], sunSize: 0.99955, sunCol: [3.2, 2.2, 1.3], moon: 0,
    haze: 0.004, stars: 0, bokeh: 0.8, night: 0,
  },
  noon: {
    key: [0.25, 0.92, 0.3], keyCol: [2.7, 2.5, 2.2], sky: [0.42, 0.56, 0.8], gnd: [0.2, 0.26, 0.1],
    rim: [-0.3, 0.6, -0.7], rimCol: [0.35, 0.4, 0.45],
    skyTop: [0.22, 0.46, 0.92], skyHor: [0.75, 0.88, 0.96], skyLow: [0.3, 0.42, 0.25],
    sun: [0.2, 0.95, 0.2], sunSize: 0.9996, sunCol: [2.0, 1.9, 1.7], moon: 0,
    haze: 0.0025, stars: 0, bokeh: 0.35, night: 0,
  },
  sunset: {
    key: [0.85, 0.14, -0.5], keyCol: [2.8, 1.15, 0.45], sky: [0.3, 0.24, 0.42], gnd: [0.14, 0.1, 0.06],
    rim: [0.85, 0.2, -0.5], rimCol: [2.0, 0.75, 0.3],
    skyTop: [0.22, 0.2, 0.48], skyHor: [1.35, 0.55, 0.28], skyLow: [0.3, 0.2, 0.2],
    sun: [0.86, 0.04, -0.5], sunSize: 0.99935, sunCol: [4.0, 1.6, 0.6], moon: 0,
    haze: 0.005, stars: 0, bokeh: 0.9, night: 0,
  },
  dusk: {
    key: [0.8, 0.22, -0.55], keyCol: [1.0, 0.55, 0.45], sky: [0.16, 0.16, 0.3], gnd: [0.06, 0.05, 0.05],
    rim: [0.8, 0.2, -0.55], rimCol: [0.9, 0.4, 0.3],
    skyTop: [0.08, 0.1, 0.26], skyHor: [0.55, 0.28, 0.26], skyLow: [0.14, 0.12, 0.14],
    sun: [0.86, -0.02, -0.5], sunSize: 0.99935, sunCol: [1.2, 0.4, 0.2], moon: 0,
    haze: 0.005, stars: 0.3, bokeh: 0.6, night: 0.5,
  },
  night: {
    key: [-0.45, 0.72, -0.52], keyCol: [0.42, 0.55, 0.9], sky: [0.07, 0.1, 0.19], gnd: [0.02, 0.03, 0.035],
    rim: [-0.4, 0.5, -0.75], rimCol: [0.35, 0.5, 0.85],
    skyTop: [0.012, 0.025, 0.07], skyHor: [0.06, 0.1, 0.16], skyLow: [0.03, 0.045, 0.05],
    sun: [-0.36, 0.42, -0.83], sunSize: 0.99925, sunCol: [1.4, 1.5, 1.7], moon: 1,
    haze: 0.004, stars: 1, bokeh: 0.8, night: 1,
  },
  studio: {
    key: [-0.5, 0.62, 0.6], keyCol: [2.4, 2.15, 1.85], sky: [0.34, 0.32, 0.3], gnd: [0.12, 0.1, 0.08],
    rim: [0.6, 0.4, -0.7], rimCol: [0.5, 0.45, 0.4],
    skyTop: [0.1, 0.1, 0.1], skyHor: [0.1, 0.1, 0.1], skyLow: [0.1, 0.1, 0.1],
    sun: [0, 1, 0], sunSize: 0.9999, sunCol: [0, 0, 0], moon: 0,
    haze: 0, stars: 0, bokeh: 0, night: 0,
  },
};
function mixLight(a, b, t) {
  const o = {};
  for (const k in a) o[k] = Array.isArray(a[k]) ? a[k].map((v, i) => lerp(v, b[k][i], t)) : lerp(a[k], b[k], t);
  o.key = V.norm(o.key); o.rim = V.norm(o.rim); o.sun = V.norm(o.sun);
  return o;
}
function light(name) { return mixLight(LIGHT[name], LIGHT[name], 0); }

// ---------------------------------------------------------------- состояние кадра
function blankState() {
  return {
    set: 1,
    cam: { pos: [0, 4, 20], tgt: [0, 2, 0], fov: 32, focus: null, ap: 0.02, roll: 0 },
    light: light('dawn'),
    exposure: 1, fade: 1, sat: 1.12, tint: [1, 1, 1], grain: 0.035, vig: 0.55, flicker: 0.03,
    snail: null, crickets: [], bugs: [], flies: [],
    berry: null, mush: 0,
    title: null,
  };
}
