'use strict';
/* ==========================================================================
   Кот-фонарщик · rigs.js
   Скелет перекладки: матрицы, прямая кинематика, обратная для лапы с шестом,
   прижим стоп к земле, циклы шага и бега, ключевые кадры и смягчения.
   ========================================================================== */

/* ---------- матрицы 2×3 (как у canvas: a b c d e f) ---------- */
function mMul(A, B) {
  return [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3], A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]];
}
function mTRS(x, y, r = 0, sx = 1, sy = 1) { const c = Math.cos(r), s = Math.sin(r); return [c * sx, s * sx, -s * sy, c * sy, x, y]; }
function mApply(M, x, y) { return [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]]; }
function mInv(M) {
  const det = M[0] * M[3] - M[1] * M[2] || 1e-9, a = M[3] / det, b = -M[1] / det, c = -M[2] / det, d = M[0] / det;
  return [a, b, c, d, -(a * M[4] + c * M[5]), -(b * M[4] + d * M[5])];
}
const M_ID = [1, 0, 0, 1, 0, 0];

/* ---------- смягчения и ключи ---------- */
const EASE = {
  lin: (t) => t,
  in: (t) => t * t,
  out: (t) => 1 - (1 - t) * (1 - t),
  io: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  io3: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out3: (t) => 1 - Math.pow(1 - t, 3),
  in3: (t) => t * t * t,
  back: (t) => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
  pop: (t) => { const c = 2.6; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
  hold: (t) => (t < 1 ? 0 : 1),
};
/* key(t, [[t0,v0],[t1,v1,'io'],…]) — значение ключевой дорожки; v — число или массив */
function key(t, K) {
  if (t <= K[0][0]) return K[0][1];
  const n = K.length;
  if (t >= K[n - 1][0]) return K[n - 1][1];
  let i = 1;
  while (i < n && K[i][0] < t) i++;
  const a = K[i - 1], b = K[i], e = EASE[b[2] || 'io'], u = e((t - a[0]) / (b[0] - a[0] || 1));
  if (typeof a[1] === 'number') return lerp(a[1], b[1], u);
  return a[1].map((v, j) => lerp(v, b[1][j], u));
}
/* сглаженная «ступенька» от 0 к 1 между t0 и t1 */
const ramp = (t, t0, t1, e = 'io') => EASE[e](sat((t - t0) / (t1 - t0)));
/* затухающее колебание — захлёст после резкой остановки */
const wobbleOut = (t, t0, amp, freq = 7, damp = 5) => (t < t0 ? 0 : amp * Math.sin((t - t0) * freq) * Math.exp(-(t - t0) * damp));

/* ---------- риг ---------- */
function rigOrder(rig) {
  const byName = new Map(rig.map((p) => [p[0], p])), done = new Set(), out = [];
  const visit = (p) => { if (done.has(p[0])) return; if (p[2]) visit(byName.get(p[2])); done.add(p[0]); out.push(p); };
  rig.forEach(visit);
  return out;
}
const CAT_ORDER = rigOrder(CAT_RIG);

/* Поза: углы по именам деталей (рад, «+» — по часовой), плюс
   x,y (мир, таз), d (глубина), face (1 вправо / -1 влево), rot, sx, sy, scale,
   spr {деталь: спрайт}, hide {деталь:1}, pupil [dx,dy], ground (y земли),
   reach [x,y] (куда тянуть лапу), tip [x,y] (куда упереть вершину шеста), poleW (угол шеста в теле) */
function catBase() {
  return {
    hips: 0, torso: 0.06, head: -0.04, earN: 0.04, earF: -0.12,
    armN1: -0.25, armN2: -0.9, armF1: 0.2, armF2: -0.35,
    legN1: -0.04, legN2: 0.08, footN: -0.04, legF1: 0.07, legF2: 0.06, footF: -0.13,
    tail0: 1.85, tail1: 0.3, tail2: 0.32, tail3: 0.3, tail4: 0.28,
    scarf: 0, scarfT1: 0.55, scarfT2: 0.2, cap: 0, pole: 0, eye: 0, pupil: 0, brow: 0.05, mouth: 0,
    x: 0, y: 0, d: 0, face: 1, rot: 0, sx: 1, sy: 1, scale: 1,
  };
}
function catPose(o) { return Object.assign(catBase(), o); }
/* смешивание поз: числа — линейно, остальное — от b при k ≥ 0.5 */
function mixPose(a, b, k) {
  const o = {};
  for (const n in a) o[n] = (typeof a[n] === 'number' && typeof b[n] === 'number') ? lerp(a[n], b[n], k) : (k < 0.5 ? a[n] : b[n] ?? a[n]);
  for (const n in b) if (!(n in o)) o[n] = b[n];
  return o;
}
function addPose(p, delta, k = 1) { for (const n in delta) if (typeof delta[n] === 'number') p[n] = (p[n] || 0) + delta[n] * k; return p; }

function rootMat(P) {
  return mTRS(P.x, P.y, P.rot, P.face * P.sx * P.scale, P.sy * P.scale);
}
/* FK в пространстве тела (без корня); IK лапы делается здесь же.
   reachL — цель кисти в координатах тела; tip — куда упереть вершину шеста (мир). */
function solveCat(P, noIK) {
  const L = {};
  const ik = !noIK && (P.reach || P.tip || P.reachL);
  const rootInv = ik && (P.reach || P.tip) ? mInv(rootMat(P)) : null;
  for (const [name, , parent, at] of CAT_ORDER) {
    if (name === 'armN1' && ik) {
      const S = mMul(L.torso, mTRS(at[0], at[1]));
      const sx = S[4], sy = S[5];
      const bodyA = Math.atan2(L.torso[1], L.torso[0]);
      let target, poleW = P.poleW;
      if (P.tip) {
        const t = mApply(rootInv, P.tip[0], P.tip[1]);
        if (poleW === undefined) poleW = clamp(Math.atan2(t[0] - sx, -(t[1] - sy)), -2.6, 2.6);
        const reachLen = CAT_L.pole + 2;
        target = [t[0] - reachLen * Math.sin(poleW), t[1] + reachLen * Math.cos(poleW)];
        if (P.tipK !== undefined && P.carry) {
          target = [lerp(P.carry[0], target[0], P.tipK), lerp(P.carry[1], target[1], P.tipK)];
          poleW = lerp(P.carryW ?? 0.12, poleW, P.tipK);
        }
      } else if (P.reachL) target = P.reachL;
      else target = mApply(rootInv, P.reach[0], P.reach[1]);
      const [up, lo] = ik2(sx, sy, target[0], target[1], CAT_L.uarm, CAT_L.farm, P.bend ?? -1);
      P.armN1 = up - bodyA; P.armN2 = lo;
      if (poleW !== undefined) P._poleW = poleW;
    }
    let ang = P[name] || 0;
    if (name === 'pole' && (P._poleW !== undefined || P.poleW !== undefined)) {
      const pw = P._poleW ?? P.poleW;
      const armA = Math.atan2(L.armN2[1], L.armN2[0]) - Math.atan2(0, 1);
      ang = pw - armA;
    }
    const loc = mTRS(at[0], at[1], ang);
    L[name] = parent ? mMul(L[parent], loc) : loc;
  }
  return L;
}
/* подошвы в пространстве тела → самая низкая точка */
function lowestFoot(L) {
  let m = -Infinity;
  for (const f of ['footN', 'footF']) for (const q of [[-3, 5.6], [8, 6.2], [15, 4]]) { const p = mApply(L[f], q[0], q[1]); if (p[1] > m) m = p[1]; }
  return m;
}
/* кот → элементы кадра */
function catItems(P, out, zBase = 100) {
  if (P.ground !== undefined) {
    const L0 = solveCat(P, true);
    const low = lowestFoot(L0);
    P.y = P.ground - low * P.sy * P.scale * Math.cos(P.rot);
  }
  P._poleW = undefined;
  const L = solveCat(P);
  const R = rootMat(P), spr = P.spr || {}, hide = P.hide || {};
  const W = {};
  for (const [name, sid, , , z, pin] of CAT_RIG) {
    if (hide[name]) continue;
    const s = spr[name] || sid;
    let M = mMul(R, L[name]);
    if (name === 'pupil') {
      if (spr.eye && !/open|wide|half|sad/.test(spr.eye)) continue;
      if (P.pupilXY) M = mMul(M, mTRS(P.pupilXY[0], P.pupilXY[1]));
    }
    W[name] = M;
    out.push({ s, m: M, d: P.d, z: zBase + z * 0.01, a: P.alpha ?? 1 });
    if (pin && (P.pins ?? 1)) out.push({ s: 'pin', m: M, d: P.d, z: zBase + z * 0.01 + 0.005, a: P.alpha ?? 1 });
  }
  if (!hide.pole && W.pole) P._tip = mApply(W.pole, 0.4, -128);
  P._W = W;
  return P;
}

/* ---------- циклы ---------- */
/* шаг: фаза в циклах; ноги в противофазе, колено сгибается в переносе, стопа держится ровно на опоре */
function catWalk(ph, o = {}) {
  const A = o.A ?? 0.48, K = o.K ?? 1.05, P = {};
  const leg = (f) => {
    f -= Math.floor(f);
    const th = -A * Math.cos(TAU * f);
    let kn, ft;
    if (f < 0.5) { kn = 0.14 * Math.sin((Math.PI * f) / 0.5); ft = -(th + kn); }
    else { const s = (f - 0.5) / 0.5; kn = K * Math.pow(Math.sin(Math.PI * s), 1.15); ft = -(th + kn) * 0.45 + 0.4 * Math.sin(Math.PI * s); }
    return [th, kn, ft];
  };
  const n = leg(ph), f = leg(ph + 0.5), c = Math.cos(TAU * ph), c2 = Math.cos(2 * TAU * ph);
  P.legN1 = n[0]; P.legN2 = n[1]; P.footN = n[2];
  P.legF1 = f[0]; P.legF2 = f[1]; P.footF = f[2];
  P.armF1 = -0.38 * c * (o.arms ?? 1) + 0.1; P.armF2 = -0.35 - 0.2 * Math.max(0, -c);
  P.armN1 = 0.38 * c * (o.arms ?? 1) + 0.05; P.armN2 = -0.35 - 0.2 * Math.max(0, c);
  P.torso = (o.lean ?? 0.1) + 0.025 * c2;
  P.head = -0.06 - 0.03 * Math.cos(2 * TAU * ph - 0.9);
  for (let i = 0; i < 5; i++) P['tail' + i] = [1.85, 0.3, 0.32, 0.3, 0.28][i] + 0.12 * Math.sin(TAU * ph - i * 0.7);
  P.scarfT1 = 0.7 + 0.12 * Math.sin(2 * TAU * ph - 0.6); P.scarfT2 = 0.25 + 0.2 * Math.sin(2 * TAU * ph - 1.4);
  P.earN = 0.04 + 0.04 * Math.sin(2 * TAU * ph - 1.2);
  return P;
}
/* бег: длиннее шаг, есть полётная фаза, сильный наклон */
function catRun(ph, o = {}) {
  const P = catWalk(ph, { A: 0.78, K: 1.6, lean: 0.34, arms: 1.5 });
  const c = Math.cos(TAU * ph);
  P.armF1 = -0.8 * c; P.armF2 = -1.2; P.armN1 = 0.8 * c; P.armN2 = -1.2;
  P.head = -0.28; P.tail0 = 1.45; P.tail1 = 0.12; P.tail2 = 0.12; P.tail3 = 0.1; P.tail4 = 0.08;
  P.scarfT1 = 1.35 + 0.12 * Math.sin(3 * TAU * ph); P.scarfT2 = 0.2 + 0.3 * Math.sin(3 * TAU * ph - 1);
  return P;
}
/* моргание: детерминированные моменты по номеру секунды */
function blinkAt(t, seed = 1) {
  const i = Math.floor(t / 2.7), local = t - i * 2.7, at = 0.4 + hash1(i, seed) * 1.8;
  return local > at && local < at + 0.14;
}
