'use strict';
/* ==========================================================================
   «Девочка и ветер» · girl.js
   Кукла-силуэт на шарнирах, как у перекладки театра теней: таз, корпус,
   шея, голова в профиль, по две руки и ноги. Лица не видно — играют поза,
   наклон головы, кисти, а ещё прорези: глаз со зрачком, бровь, рот.
   Волосы, подол, пояс-бант и ленты банта считаются от ветра и от движения
   самой куклы («пружина» из lib.js), поэтому всё остаётся функцией времени.

   Углы — в градусах. Ноги и руки: 0 — вниз, плюс — вперёд (по взгляду).
   Колено сгибается назад (плюс), локоть — вперёд (плюс).
   Локальные координаты: смотрит вправо, ось y вниз, начало — тазобедренный сустав.
   ========================================================================== */

const GIRL = {
  thigh: 50, shin: 47, foot: 15,
  torso: 68, neck: -3,
  upper: 36, fore: 32, hand: 12,
};

const POSE0 = {
  x: 0, y: 0, f: 1, s: 1, rot: 0, lean: 0, neck: 0, head: 0,
  sN: 6, eN: 14, wN: 6, gN: 0.2,
  sF: -8, eF: 12, wF: 4, gF: 0.2,
  hN: 3, kN: 4, aN: 0,
  hF: -3, kF: 5, aF: 0,
  eye: 1, smile: 0, brow: 0, sad: 0, mouth: 0, look: 0,
  sq: 1, lift: 0, plant: 1, hairUp: 0,
};

/** Поза: база + правки. */
function P_(over, base) { return Object.assign({}, base || POSE0, over); }

const POSES = {
  stand: P_({}),
  sitHug: P_({ lean: 20, neck: 10, head: 8, hN: 112, kN: 152, aN: 18, hF: 104, kF: 148, aF: 16, sN: 64, eN: 64, wN: 10, gN: 0.8, sF: 58, eF: 70, wF: 10, gF: 0.8, eye: 1 }),
  sitUp: P_({ lean: 4, neck: -4, head: -6, hN: 104, kN: 138, aN: 14, hF: 96, kF: 132, aF: 12, sN: 36, eN: 38, sF: 32, eF: 40, gN: 0.6, gF: 0.6 }),
  crouch: P_({ lean: 32, neck: -8, head: -10, hN: 74, kN: 118, aN: 22, hF: 64, kF: 108, aF: 20, sN: -34, eN: 26, sF: -40, eF: 24 }),
  jumpUp: P_({ lean: -6, neck: -10, head: -16, hN: 24, kN: 34, aN: 30, hF: -14, kF: 60, aF: 30, sN: 160, eN: 12, wN: 10, gN: 0, sF: 150, eF: 18, gF: 0, eye: 0, smile: 1, mouth: 0.8, sq: 1.06 }),
  land: P_({ lean: 16, neck: 4, head: 0, hN: 42, kN: 70, aN: 10, hF: 30, kF: 64, aF: 8, sN: 70, eN: 30, sF: 60, eF: 30, sq: 0.92 }),
  reach: P_({ lean: 22, neck: -6, head: -8, sN: 96, eN: 6, wN: 8, gN: 0, sF: -26, eF: 18, hN: 30, kN: 8, hF: -24, kF: 22, aF: 18 }),
  armsUp: P_({ lean: -4, neck: -8, head: -18, sN: 150, eN: 18, wN: 10, gN: 0.9, sF: 142, eF: 22, gF: 0.9 }),
  hugJar: P_({ lean: 6, neck: 8, head: 10, sN: 38, eN: 104, wN: 20, gN: 0.8, sF: 30, eF: 108, wF: 20, gF: 0.8 }),
  liftJar: P_({ lean: -8, neck: -12, head: -22, sN: 172, eN: 6, wN: 0, gN: 0.8, sF: 166, eF: 10, wF: 0, gF: 0.8, hN: 4, hF: -8, kF: 6, aF: 12 }),
  armsOpen: P_({ lean: -6, neck: -10, head: -24, sN: 112, eN: 8, wN: -10, gN: 0, sF: -96, eF: 10, wF: 10, gF: 0, eye: 0, smile: 1 }),
};

/* ---------- Циклы походки ---------- */

/** Шаг: phase — доля цикла (0..1 — два шага). */
function walkCycle(ph) {
  const a = ph * TAU, b = a + PI;
  const knee = (x) => 6 + 40 * Math.max(0, -Math.sin(x)) ** 1.3;
  const ank = (x) => -8 * Math.max(0, -Math.sin(x)) + 14 * Math.max(0, Math.sin(x - 2.2));
  return {
    hN: 24 * Math.cos(a), kN: knee(a), aN: ank(a),
    hF: 24 * Math.cos(b), kF: knee(b), aF: ank(b),
    sN: -16 * Math.cos(a) + 4, eN: 16 + 8 * Math.max(0, Math.cos(a)),
    sF: -16 * Math.cos(b) + 4, eF: 16 + 8 * Math.max(0, Math.cos(b)),
    lean: 4, lift: 1.5 * Math.cos(2 * a),
  };
}
/** Бег: больше размах, наклон, согнутые руки, фаза полёта. */
function runCycle(ph) {
  const a = ph * TAU, b = a + PI;
  const knee = (x) => 22 + 92 * Math.max(0, -Math.sin(x + 0.3)) ** 1.1;
  const ank = (x) => -12 * Math.max(0, -Math.sin(x)) + 26 * Math.max(0, Math.sin(x - 2)) ** 2;
  return {
    hN: 14 + 44 * Math.cos(a), kN: knee(a), aN: ank(a),
    hF: 14 + 44 * Math.cos(b), kF: knee(b), aF: ank(b),
    sN: -46 * Math.cos(a) + 10, eN: 78, wN: 10,
    sF: -46 * Math.cos(b) + 10, eF: 78, wF: 10,
    lean: 15, lift: 9 * Math.abs(Math.sin(2 * a + 0.9)),
  };
}

/* ---------- Кинематика ---------- */
const dd = (a) => [Math.sin(a * DEG), Math.cos(a * DEG)]; // «вниз» при 0, «вперёд» при 90

function girlJoints(P) {
  const G = GIRL;
  const th = (P.rot + P.lean) * DEG;
  const cs = Math.cos(th), sn = Math.sin(th);
  const tl = (x, y) => [x * cs - y * sn, x * sn + y * cs]; // корпус → тело
  const hip = [0, 0];
  const legs = {};
  for (const side of ['N', 'F']) {
    const hA = P.rot + P['h' + side];
    const kA = hA - P['k' + side];
    const fA = kA + 90 - P['a' + side];
    const H = side === 'N' ? [1.5, 1] : [-1.5, 0];
    const t1 = dd(hA), t2 = dd(kA), t3 = dd(fA);
    const K = [H[0] + t1[0] * G.thigh, H[1] + t1[1] * G.thigh];
    const A = [K[0] + t2[0] * G.shin, K[1] + t2[1] * G.shin];
    const T = [A[0] + t3[0] * G.foot, A[1] + t3[1] * G.foot];
    legs[side] = { H, K, A, T, fA, kA };
  }
  const S = tl(0, -G.torso);
  const shoulder = tl(-1.5, -G.torso + 5);
  const na = th + P.neck * 0.6 * DEG;
  const N = [S[0] + Math.sin(na) * G.neck, S[1] - Math.cos(na) * G.neck];
  const headA = th + (P.neck + P.head) * DEG;
  const arms = {};
  for (const side of ['N', 'F']) {
    const a1 = P.rot + P['s' + side];
    const a2 = a1 + P['e' + side];
    const a3 = a2 + P['w' + side];
    const R = side === 'N' ? [shoulder[0] + 1, shoulder[1]] : [shoulder[0] - 1, shoulder[1] + 1];
    const u = dd(a1), v = dd(a2);
    const E = [R[0] + u[0] * G.upper, R[1] + u[1] * G.upper];
    const W = [E[0] + v[0] * G.fore, E[1] + v[1] * G.fore];
    arms[side] = { R, E, W, a1, a2, a3 };
  }
  return { th, tl, legs, S, N, headA, arms, hip };
}

/** Высота таза, при которой самая низкая точка (носок, пятка или сиденье) стоит на земле. */
function plantPelvis(P, J, groundFn) {
  const s = P.s, f = P.f;
  const cand = [];
  for (const side of ['N', 'F']) {
    const L = J.legs[side];
    cand.push(L.A, L.T, [L.A[0] - Math.sin(L.fA * DEG) * 4 + 0, L.A[1] + 5]);
  }
  const seatA = (P.rot) * DEG;
  cand.push([Math.sin(seatA) * -12 - Math.cos(seatA) * 6, Math.cos(seatA) * 12 - Math.sin(seatA) * 6 + 4]);
  let best = Infinity;
  for (const c of cand) {
    const wx = P.x + f * s * c[0];
    const y = groundFn(wx) - s * (c[1] + 3.5);
    if (y < best) best = y;
  }
  return best;
}

/** Готовая поза в мире: учитывает посадку на землю и подъём. */
function placeGirl(P, groundFn) {
  const J = girlJoints(P);
  const yPlant = plantPelvis(P, J, groundFn);
  P.y = lerp(P.y, yPlant, P.plant) - P.lift * P.s;
  return J;
}

/* ---------- Отрисовка ---------- */
const angDiff = (b, a) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

/** Прядь (или лента): цепочка, которая тянется к направлению среды env, с бегущей волной. */
function strand(x, y, a, len, M, env, t, ph, curl, stiff) {
  const pts = [[x, y]];
  const envA = Math.atan2(env[1], env[0]);
  const envM = Math.hypot(env[0], env[1]);
  const ds = len / M;
  for (let i = 1; i <= M; i++) {
    const u = i / M;
    const k = clamp((0.13 + 0.34 * u) * clamp(envM, 0.35, 1.3) * (stiff || 1), 0, 0.95);
    a += angDiff(envA, a) * k;
    a += Math.sin(t * (2.6 + envM * 3.2) - u * 5.2 + ph) * (0.04 + 0.11 * Math.min(envM, 2.2)) * u;
    a += Math.sin(u * 7.5 + ph * 2.3) * 0.075 * (0.4 + u);
    if (u > 0.7) a += curl * 0.3 * ((u - 0.7) / 0.3);
    x += Math.cos(a) * ds;
    y += Math.sin(a) * ds;
    pts.push([x, y]);
  }
  return pts;
}

/** Кисть руки: ладонь, пальцы и большой палец; grip 0 — раскрыта, 1 — сжата. */
function hand(ctx, W, a3, grip) {
  const u = dd(a3);
  const n = [u[1], -u[0]]; // «передняя» сторона кисти
  const pc = [W[0] + u[0] * 5.5, W[1] + u[1] * 5.5];
  capsule(ctx, W[0], W[1], 3.1, pc[0], pc[1], 4.1);
  const fl = 8.5 * (1 - grip * 0.55);
  for (let i = -1; i <= 1; i++) {
    const fa = a3 + i * 11 + grip * 70;
    const v = dd(fa);
    const b0 = [pc[0] + u[0] * 2 + n[0] * i * 1.2, pc[1] + u[1] * 2 + n[1] * i * 1.2];
    capsule(ctx, b0[0], b0[1], 1.75, b0[0] + v[0] * fl * 0.85, b0[1] + v[1] * fl * 0.85, 1.35);
  }
  const ta = a3 + 55 - grip * 30;
  const tv = dd(ta);
  const tb = [W[0] + u[0] * 3 + n[0] * 2.4, W[1] + u[1] * 3 + n[1] * 2.4];
  capsule(ctx, tb[0], tb[1], 1.7, tb[0] + tv[0] * 6.5, tb[1] + tv[1] * 6.5, 1.25);
}

function arm(ctx, A, grip) {
  capsule(ctx, A.R[0], A.R[1], 4.9, A.E[0], A.E[1], 3.7);
  capsule(ctx, A.E[0], A.E[1], 3.7, A.W[0], A.W[1], 2.9);
  hand(ctx, A.W, A.a3, grip);
}

/** Нога в чулке и туфелька с ремешком-прорезью. */
function leg(ctx, L) {
  capsule(ctx, L.H[0], L.H[1], 7.4, L.K[0], L.K[1], 4.6);
  capsule(ctx, L.K[0], L.K[1], 4.6, L.A[0], L.A[1], 3.1);
}
function shoe(ctx, L) {
  const u = dd(L.fA);
  const up = [-u[1], u[0]]; // «над стопой»
  const { A, T } = L;
  const heel = [A[0] - u[0] * 2.5 - up[0] * 1.8, A[1] - u[1] * 2.5 - up[1] * 1.8];
  const toe = [T[0] - up[0] * 1.2, T[1] - up[1] * 1.2];
  capsule(ctx, heel[0], heel[1], 4.3, toe[0], toe[1], 4.6);
  circle(ctx, A[0] - up[0] * 0.5, A[1] - up[1] * 0.5, 4.2);
  // ремешок: прорезь поперёк подъёма
  const m = [A[0] + u[0] * 5.5 + up[0] * 1.6, A[1] + u[1] * 5.5 + up[1] * 1.6];
  lens(ctx, m[0] - u[0] * 2.8 + up[0] * 2.2, m[1] - u[1] * 2.8 + up[1] * 2.2, m[0] + u[0] * 2.8 - up[0] * 0.6, m[1] + u[1] * 2.8 - up[1] * 0.6, 0.85, true);
}

/** Голова в профиль: выпуклый лоб, курносый нос, губы, маленький подбородок; прорези глаза и брови, зрачок. */
function headPath(ctx, P) {
  const m = P.mouth;
  ctx.moveTo(-7, 4);
  ctx.quadraticCurveTo(-10, -3, -16, -9);
  ctx.bezierCurveTo(-29, -22, -26, -52, -2, -56.5);
  ctx.bezierCurveTo(12, -57.5, 21.8, -47, 22.6, -36);
  ctx.quadraticCurveTo(23.3, -30.8, 22.6, -28.6); // переносица
  ctx.quadraticCurveTo(25.2, -25.4, 27.3, -22.6); // спинка носа
  ctx.quadraticCurveTo(27.4, -20.8, 24.3, -20.7); // кончик и ноздря
  ctx.quadraticCurveTo(25.3, -19.5, 24.8, -18.2 + m * 0.3); // верхняя губа
  ctx.lineTo(23.4 - m * 2.2, -17.4 + m * 0.8); // уголок рта
  ctx.quadraticCurveTo(24.7 - m * 0.5, -16.6 + m * 2, 24 - m * 0.3, -15.4 + m * 2.5); // нижняя губа
  ctx.quadraticCurveTo(22.3, -14.6 + m * 2.7, 22.2 - m * 0.2, -13.2 + m * 2.9); // ямочка
  ctx.quadraticCurveTo(22.8, -9.6 + m * 3.1, 18.2, -8.6 + m * 2.8); // подбородок
  ctx.quadraticCurveTo(12, -7 + m * 1.2, 8, 1);
  ctx.closePath();
  // бровь — тонкая прорезь; sad поднимает её внутренний (передний) конец
  const by = -34.6 - P.brow * 2.2;
  const bF = by - P.sad * 2.2 + P.brow * 0.4;
  const bB = by + P.sad * 1.1;
  ctx.moveTo(18.8, bF);
  ctx.quadraticCurveTo(15.4, (bF + bB) / 2 - 1.6, 11.8, bB + 0.3);
  ctx.quadraticCurveTo(15.4, (bF + bB) / 2 - 0.35, 18.8, bF);
  ctx.closePath();
  // глаз: веки — две кривые; eye — раскрытие, smile — дуга закрытого глаза
  const o = clamp(P.eye), s = P.smile, ey = -27.4;
  const bx = 12.2, fx = 18.6;
  const up = ey - 3.2 * o - 1.9 * s * (1 - o) + P.sad * 0.8 * o;
  const lo = up + 1.25 + 5.6 * o;
  ctx.moveTo(fx, ey - 0.4);
  ctx.quadraticCurveTo((bx + fx) / 2, up, bx, ey);
  ctx.quadraticCurveTo((bx + fx) / 2 + 0.4, lo, fx, ey - 0.4);
  ctx.closePath();
  if (o > 0.35) {
    const pr = 1.5 * clamp((o - 0.35) / 0.4);
    circle(ctx, 16.3 + P.look * 0.6, ey - 0.4 - P.look * 0.9 + (1 - o) * 0.7, pr);
  }
}

/** Шапка волос, чёлка — завитки над лбом. */
function hairCap(ctx, t, env) {
  ctx.moveTo(16.5, -44);
  ctx.bezierCurveTo(16, -58, 6, -62.5, -3, -62);
  ctx.bezierCurveTo(-22, -61.5, -32, -50, -31.5, -34);
  ctx.quadraticCurveTo(-31.5, -16, -22, -4);
  ctx.lineTo(-9, -8);
  ctx.quadraticCurveTo(-4, -34, 16.5, -44);
  ctx.closePath();
  const w = env[0] * 0.08;
  const bangs = [[2, -60, 0.05], [8, -58, 0.2], [13, -54.5, 0.35], [17, -49, 0.5]];
  for (const [x, y, s] of bangs) {
    const pts = curlPts(x, y, (-8 + s * 46) * DEG - w, 13 + s * 6, 0.6, 1, 9);
    ribbon(ctx, pts, taper(pts.length, 3.6, 0.45));
  }
}

/** Бант на затылке: две петли-кольца, узелок; хвосты-ленты отдельно. */
function bowPath(ctx, t, env) {
  const kx = -18, ky = -49;
  const fl = Math.sin(t * 5.3) * 0.06 * Math.min(1.5, Math.hypot(env[0], env[1]));
  const loop = (a, L, w) => {
    const ex = kx + Math.cos(a) * L, ey = ky + Math.sin(a) * L;
    lens(ctx, kx, ky, ex, ey, w);
    const ix = kx + Math.cos(a) * L * 0.3, iy = ky + Math.sin(a) * L * 0.3;
    const jx = kx + Math.cos(a) * L * 0.84, jy = ky + Math.sin(a) * L * 0.84;
    lens(ctx, ix, iy, jx, jy, w * 0.42, true);
  };
  loop(-2.05 + fl, 25, 9.2);
  loop(2.7 - fl, 22, 8.4);
  circle(ctx, kx, ky, 5.2);
}

/** Воротничок «питер пэн»: два мягких лепестка с дырочками на груди и на спине. */
function collarPath(ctx, J) {
  const tl = J.tl;
  const pet = (cx, cy, rx, ry, rot, dir) => {
    const c = tl(cx, cy);
    const a = J.th + rot;
    oval(ctx, c[0], c[1], rx, ry, a);
    for (let i = 0; i < 3; i++) {
      const u = (i - 1) * 0.55;
      const hx = c[0] + Math.cos(a) * rx * u * 0.9 + Math.sin(a) * -ry * 0.1;
      const hy = c[1] + Math.sin(a) * rx * u * 0.9 + Math.cos(a) * ry * 0.1;
      circle(ctx, hx, hy, 1.15, true);
    }
  };
  pet(5.5, -64.2, 7.2, 3.8, -0.38, 1);
  pet(-6.5, -64.6, 6.8, 3.6, 0.42, -1);
}

/** Лиф: спина, грудка, плечи; талия — пояс. */
function torsoPath(ctx, J) {
  const tl = J.tl;
  const pts = [[-10.5, -12], [-12, -32], [-11.6, -52], [-9.5, -64], [-4.5, -69.5], [4.5, -69.5], [9, -63.5], [11, -50], [11, -32], [9.5, -12]].map(([x, y]) => tl(x, y));
  curveThrough(ctx, pts, true);
  ctx.closePath();
}

/** Юбка: талия → подол, раскрытый ветром; фестоны и ряд дырочек-люверсов. */
function skirtPath(ctx, P, J, env, t) {
  const wa = (P.rot + P.lean * 0.35) * DEG;
  const R = (x, y) => [x * Math.cos(wa) - y * Math.sin(wa), x * Math.sin(wa) + y * Math.cos(wa)];
  const WB = R(-11.5, -30), WF = R(11, -30);
  const envM = Math.hypot(env[0], env[1]);
  // направление «висения»: гравитация + поток воздуха, частично следует за корпусом
  const bodyDown = [Math.sin(-P.rot * DEG), Math.cos(P.rot * DEG)];
  const hang = [env[0] * 0.55 + bodyDown[0] * 0.45, env[1] * 0.55 + bodyDown[1] * 0.45];
  // юбка может взлететь почти до горизонтали, но не вывернуться вверх
  const hm0 = Math.hypot(hang[0], hang[1]) || 1;
  if (hang[1] < 0.28 * hm0) hang[1] = 0.28 * hm0;
  const hm = Math.hypot(hang[0], hang[1]) || 1;
  const hd = [hang[0] / hm, hang[1] / hm];
  const hn = [hd[1], -hd[0]]; // поперёк: к «переду» при висении вниз
  const N = 9;
  const hem = [];
  const lift = clamp(-env[1] * 0.35, 0, 1); // восходящий поток раскрывает юбку колоколом
  const LN = J.legs;
  const kneeF = LN.N.K[0] > LN.F.K[0] ? LN.N.K : LN.F.K;
  const kneeB = LN.N.K[0] > LN.F.K[0] ? LN.F.K : LN.N.K;
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1);
    const A = [lerp(WB[0], WF[0], u), lerp(WB[1], WF[1], u)];
    const L = 72 + 4 * Math.sin(u * PI) - lift * 14;
    const spread = lerp(-0.42, 0.42, u) * (1 + lift * 1.4 + Math.min(envM, 2) * 0.18);
    const wave = Math.sin(t * (4 + envM * 3) + u * 7) * (0.03 + 0.07 * Math.min(envM, 2)) + Math.sin(t * 2.3 + u * 3) * 0.02;
    const dx = hd[0] + hn[0] * (spread + wave), dy = hd[1] + hn[1] * (spread + wave);
    const d = Math.hypot(dx, dy);
    let hx = A[0] + (dx / d) * L, hy = A[1] + (dy / d) * L;
    // колени выталкивают подол
    const wF = sstep(0.45, 1, u), wB = 1 - sstep(0, 0.55, u);
    if (kneeF[0] + 5 > hx && wF > 0) { hx = lerp(hx, kneeF[0] + 5, wF); hy = lerp(hy, Math.min(hy, kneeF[1] + 4), wF * 0.8); }
    if (kneeB[0] - 5 < hx && wB > 0 && kneeB[1] < hy + 10) { hx = lerp(hx, Math.min(hx, kneeB[0] - 5), wB * 0.7); }
    hem.push([hx, hy]);
  }
  // контур: талия спереди → перед → подол (фестоны) → зад → талия сзади
  const mid = [(WB[0] + WF[0]) / 2, (WB[1] + WF[1]) / 2];
  const out = (p, k) => [p[0] + (p[0] - mid[0]) * k, p[1] + (p[1] - mid[1]) * k];
  ctx.moveTo(WF[0], WF[1]);
  const cF = out([(WF[0] + hem[N - 1][0]) / 2, (WF[1] + hem[N - 1][1]) / 2], 0.12);
  ctx.quadraticCurveTo(cF[0], cF[1], hem[N - 1][0], hem[N - 1][1]);
  const holes = [];
  const SC = 13;
  for (let j = SC; j > 0; j--) {
    const u0 = j / SC, u1 = (j - 1) / SC;
    const p0 = samplePoly(hem, u0), p1 = samplePoly(hem, u1);
    const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2;
    let nx = mx - mid[0], ny = my - mid[1];
    const nd = Math.hypot(nx, ny) || 1;
    nx /= nd; ny /= nd;
    ctx.quadraticCurveTo(mx + nx * 4.4, my + ny * 4.4, p1[0], p1[1]);
    holes.push([mx - nx * 4.2, my - ny * 4.2, j]);
  }
  const cB = out([(WB[0] + hem[0][0]) / 2, (WB[1] + hem[0][1]) / 2], 0.12);
  ctx.quadraticCurveTo(cB[0], cB[1], WB[0], WB[1]);
  ctx.closePath();
  for (const [x, y, j] of holes) circle(ctx, x, y, j % 2 ? 1.45 : 1.05, true);
  // второй ряд — мелкие цветочки-прорези
  for (let j = 1; j < 6; j++) {
    const u = j / 6;
    const p = samplePoly(hem, u);
    let nx = p[0] - mid[0], ny = p[1] - mid[1];
    const nd = Math.hypot(nx, ny) || 1;
    const cx = p[0] - (nx / nd) * 12, cy = p[1] - (ny / nd) * 12;
    for (let q = 0; q < 5; q++) {
      const a = (q / 5) * TAU + j;
      lens(ctx, cx + Math.cos(a) * 0.6, cy + Math.sin(a) * 0.6, cx + Math.cos(a) * 3.1, cy + Math.sin(a) * 3.1, 0.75, true);
    }
  }
  return { hem, WB, WF };
}

/** Точка на ломаной по доле длины. */
function samplePoly(pts, u) {
  const n = pts.length - 1;
  const f = clamp(u) * n;
  const i = Math.min(n - 1, Math.floor(f));
  const r = f - i;
  return [lerp(pts[i][0], pts[i + 1][0], r), lerp(pts[i][1], pts[i + 1][1], r)];
}

/**
 * Девочка целиком.
 * env.air — поток воздуха в МИРЕ (ветер минус скорость тела), env.lag — захлёст (мир), env.t — время.
 * extra(ctx, J, P) — вызывается между дальней и ближней рукой: сюда рисуется то, что она держит.
 */
function drawGirl(ctx, P, env, extra) {
  const J = girlJoints(P);
  const t = env.t;
  // поток в локальных координатах куклы (зеркало и поворот)
  const ra = -P.rot * DEG;
  const ax0 = (env.air[0] + env.lag[0]) * P.f, ay0 = env.air[1] + env.lag[1];
  const air = [ax0 * Math.cos(ra) - ay0 * Math.sin(ra), ax0 * Math.sin(ra) + ay0 * Math.cos(ra)];
  const envV = [air[0], 1 + air[1] - P.hairUp];

  ctx.save();
  ctx.translate(P.x, P.y);
  ctx.scale(P.f * P.s, P.s);
  if (P.sq !== 1) {
    const base = 104;
    ctx.translate(0, base);
    ctx.scale(1 / Math.sqrt(P.sq), P.sq);
    ctx.translate(0, -base);
  }
  ctx.fillStyle = INK_CSS;

  // 1. дальняя рука и нога
  ctx.beginPath();
  arm(ctx, J.arms.F, P.gF);
  leg(ctx, J.legs.F);
  ctx.fill();
  ctx.beginPath();
  shoe(ctx, J.legs.F);
  ctx.fill('evenodd');

  // 2. волосы, ленты банта и пояса — позади тела
  const ha = J.headA, hc = Math.cos(ha), hs = Math.sin(ha);
  const H = (x, y) => [J.N[0] + x * hc - y * hs, J.N[1] + x * hs + y * hc];
  ctx.beginPath();
  const LOCKS = 13;
  const eA = Math.atan2(envV[1], envV[0]), eM = Math.hypot(envV[0], envV[1]);
  for (let i = 0; i < LOCKS; i++) {
    const u = i / (LOCKS - 1);
    // корни — по затылку от макушки к шее; первое направление — вдоль черепа вниз
    const th = lerp(232, 150, u) * DEG;
    const r = 23.5;
    const root = H(-1 + Math.cos(th) * r, -31 + Math.sin(th) * r);
    const a0 = Math.max(th - PI / 2, 78 * DEG) + ha;
    // веер: пряди чуть расходятся вокруг направления потока
    const fan = (u - 0.5) * 0.55 + (hash(i * 5) - 0.5) * 0.2;
    const env = [Math.cos(eA + fan) * eM, Math.sin(eA + fan) * eM];
    const len = 100 + 18 * Math.sin(u * PI) + hash(i * 3) * 16 - u * 10;
    const pts = strand(root[0], root[1], a0, len, 11, env, t, i * 1.3, (i % 2 ? 1 : -1) * 0.8, 1);
    ribbon(ctx, pts, taper(pts.length, 6.6 - u * 1.4, 0.3, 0.85));
  }
  // хвосты банта
  const knot = H(-18, -49);
  for (let i = 0; i < 2; i++) {
    const pts = strand(knot[0], knot[1], ha + (i ? 1.9 : 2.5), i ? 38 : 32, 8, envV, t, 4 + i * 2.3, 0, 1.25);
    ribbon(ctx, pts, taper(pts.length, 3.6, 2.2));
    const e = pts[pts.length - 1], q = pts[pts.length - 2];
    const ea = Math.atan2(e[1] - q[1], e[0] - q[0]);
    lens(ctx, e[0], e[1], e[0] + Math.cos(ea + 0.5) * 5, e[1] + Math.sin(ea + 0.5) * 5, 1.4);
    lens(ctx, e[0], e[1], e[0] + Math.cos(ea - 0.5) * 5, e[1] + Math.sin(ea - 0.5) * 5, 1.4);
  }
  // пояс-бант сзади на талии: хвосты
  const sash = J.tl(-12, -31);
  for (let i = 0; i < 2; i++) {
    const pts = strand(sash[0], sash[1], PI * 0.62 + i * 0.35, i ? 44 : 38, 8, envV, t, 1.3 + i * 2.1, 0, 1.2);
    ribbon(ctx, pts, taper(pts.length, 3.2, 2.4));
  }
  ctx.fill();
  // петли пояса-банта
  ctx.beginPath();
  const sl = (a, L, w) => {
    const ex = sash[0] + Math.cos(a) * L, ey = sash[1] + Math.sin(a) * L;
    lens(ctx, sash[0], sash[1], ex, ey, w);
    lens(ctx, sash[0] + Math.cos(a) * L * 0.32, sash[1] + Math.sin(a) * L * 0.32, sash[0] + Math.cos(a) * L * 0.82, sash[1] + Math.sin(a) * L * 0.82, w * 0.4, true);
  };
  const sw = Math.sin(t * 4.1) * 0.05 * Math.min(1.5, Math.hypot(air[0], air[1]));
  sl(J.th + PI * 0.93 + sw, 15, 5.6);
  sl(J.th + PI * 1.22 - sw, 14, 5.2);
  ctx.fill('evenodd');

  // 3. ближняя нога
  ctx.beginPath();
  leg(ctx, J.legs.N);
  ctx.fill();
  ctx.beginPath();
  shoe(ctx, J.legs.N);
  ctx.fill('evenodd');

  // 4. юбка с кружевом
  ctx.beginPath();
  skirtPath(ctx, P, J, envV, t);
  ctx.fill('evenodd');

  // 5. лиф, пояс, воротничок, шея
  ctx.beginPath();
  torsoPath(ctx, J);
  const Sa = J.tl(0.5, -66), Nn = J.N;
  capsule(ctx, Sa[0], Sa[1], 4.8, Nn[0], Nn[1], 4.3);
  ctx.fill();
  ctx.beginPath();
  poly(ctx, [[-12, -28], [11.2, -28], [11.4, -35], [-12.2, -35]].map(([x, y]) => J.tl(x, y)));
  collarPath(ctx, J);
  ctx.fill('evenodd');

  // 6. голова
  ctx.save();
  ctx.translate(J.N[0], J.N[1]);
  ctx.rotate(ha);
  ctx.beginPath();
  headPath(ctx, P);
  ctx.fill('evenodd');
  ctx.beginPath();
  hairCap(ctx, t, air);
  ctx.fill();
  ctx.beginPath();
  bowPath(ctx, t, air);
  ctx.fill('evenodd');
  ctx.restore();

  // 7. то, что в руках (между рукой дальней и ближней)
  if (extra) extra(ctx, J, P);

  // 8. ближняя рука с рукавом-фонариком
  ctx.beginPath();
  const A = J.arms.N;
  const ua = dd(A.a1);
  oval(ctx, A.R[0] + ua[0] * 6, A.R[1] + ua[1] * 6, 10.5, 8, Math.atan2(ua[1], ua[0]));
  arm(ctx, A, P.gN);
  ctx.fill();
  ctx.beginPath();
  // кружевная кайма рукава
  const bx = A.R[0] + ua[0] * 13.5, by = A.R[1] + ua[1] * 13.5;
  const pn = [-ua[1], ua[0]];
  for (let i = -2; i <= 2; i++) circle(ctx, bx + pn[0] * i * 3.4 + ua[0] * 1.2, by + pn[1] * i * 3.4 + ua[1] * 1.2, 1.9);
  ctx.fill();
  ctx.restore();
  return J;
}

/** Мировые координаты точки куклы (для предметов в руках). */
function girlToWorld(P, p) {
  let x = p[0], y = p[1];
  if (P.sq !== 1) { const b = 104; x /= Math.sqrt(P.sq); y = (y - b) * P.sq + b; }
  return [P.x + P.f * P.s * x, P.y + P.s * y];
}
