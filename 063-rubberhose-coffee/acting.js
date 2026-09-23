'use strict';
/* =====================================================================
   Кофейник Жорж · игра персонажей
   Каждая функция — поза персонажа в момент t. Никакого состояния между кадрами:
   перемотка в любую точку даёт тот же кадр.
   Сетка: 120 ударов в минуту, доля = 0,5 с, такт 2/4 = 1 с.
   ===================================================================== */

const POS = {
  stove: 408, alarm: 712,
  cupHome: [1546, 1630, 1714, 1798],
  kroHide: 1745, kroEdge: 1552,
  jDance: 900,
  line: [1070, 1160, 1250, 1340],
  lineF: [1000, 1090, 1270, 1360], kroF: 1180,
  swingSide: [826, 906, 1316, 1374],
  gather: [792, 864, 1236, 1318],
  catchP: [1450, 772],
  jCatch: 960,
  kroTable: 1104,
};
const CUP_S = 0.9, KRO_S = 0.62;

/** Естественное моргание: 0 — открыт, 1 — закрыт. */
function blink(t, seed) {
  const per = 2.4 + hash(seed) * 1.9;
  const ph = (t + hash(seed + 7) * per) % per;
  return ph < 0.13 ? 1 - Math.abs(ph - 0.065) / 0.065 : 0;
}
/** Сонное дыхание кухни: 0…1, цикл 2 с (вдох 1 с, выдох 0,7 с). */
function breathIn(t, off = 0) {
  const ph = frac((t - 7 - off) / 2);
  return ph < 0.5 ? Ease.io(ph / 0.5) : 1 - Ease.out(clamp((ph - 0.5) / 0.36));
}
function setArm(a, x, y, pose, extra) { a.x = x; a.y = y; if (pose) a.pose = pose; if (extra) Object.assign(a, extra); return a; }
function lerpArm(a, p, q, u) { a.x = lerp(p[0], q[0], u); a.y = lerp(p[1], q[1], u); a.pose = u < 0.5 ? p[2] : q[2]; }

/* ---------- танцевальные шаги ---------- */

/** «Резиновый» шаг Жоржа: подскок на каждую долю, нога-колено вверх, противоположная рука вверх. */
function jStrut(P, t, t0, amp = 1) {
  const u = beatU(t, t0), n = beatN(t, t0);
  const side = n % 2 ? 1 : -1;
  const up = Math.sin(Math.PI * u);
  P.y -= 15 * amp * up * up;
  P.sq += amp * (-0.13 * Math.exp(-u * 11) + 0.06 * up);
  P.bend += 11 * amp * Math.sin(TAU * (t - t0) / (2 * BEAT));
  const li = side < 0 ? 0 : 1, lo = 1 - li;
  P.legs[li].y = -30 * amp * up; P.legs[li].x = (li ? 1 : -1) * (27 + 10 * up); P.legs[li].ang = 0.45 * up;
  P.legs[lo].x = (lo ? 1 : -1) * 22;
  setArm(P.arms[lo], (lo ? 1 : -1) * 36, -44 - 18 * up, 'jazz');
  setArm(P.arms[li], (li ? 1 : -1) * 26, 44, 'open');
  P.mouth = { type: 'grin', open: 0.45 + 0.25 * up };
  P.lid.dy = -6 * up * amp;
  P.eye.ly = -0.15;
}

/** Канкан чашек: удар ногой на каждую долю, по очереди. */
function cupKick(C, t, t0, amp = 1) {
  const u = beatU(t, t0), n = beatN(t, t0), side = n % 2 ? 1 : -1;
  const k = Math.sin(Math.PI * clamp(u / 0.85));
  const li = side < 0 ? 0 : 1, lo = 1 - li;
  C.legs[li].x = side * (14 + 26 * k * amp); C.legs[li].y = -46 * k * amp; C.legs[li].ang = 0.9 * k;
  C.legs[lo].x = -side * 9;
  C.y -= 5 * Math.sin(Math.PI * u) * amp * C.s;
  C.rot += -side * 0.07 * k * amp;
  C.sq += -0.08 * Math.exp(-u * 10) * amp;
  C.mouth = { type: 'grin', open: 0.35 };
  C.eye.open = 0; C.eye.shut = 'happy';
}

/** Шаг на месте с «джазовыми» ладонями. */
function cupStep(C, t, t0, amp = 1, ph = 0) {
  const u = beatU(t, t0 + ph), n = beatN(t, t0 + ph), side = n % 2 ? 1 : -1;
  const up = Math.sin(Math.PI * u);
  C.y -= 7 * up * up * C.s * amp;
  C.sq += (-0.08 * Math.exp(-u * 10) + 0.04 * up) * amp;
  C.rot += side * 0.06 * amp;
  const li = side < 0 ? 0 : 1;
  C.legs[li].y = -14 * up * amp;
  setArm(C.arms[0], -30, -30 - 10 * up, 'jazz');
  setArm(C.arms[1], 30, -30 - 10 * (1 - up), 'jazz');
  C.mouth = { type: 'grin', open: 0.3 };
}

/* =====================================================================
   ЖОРЖ
   ===================================================================== */
function jorzh(t) {
  if (t < 21.0) return jSleep(t);
  if (t < 30.0) return jWake(t);
  if (t < 43.1) return jCoffee(t);
  if (t < 46.0) return jLeap(t);
  if (t < 70.0) return jDance(t);
  if (t < 86.0) return jRescue(t);
  if (t < 94.0) return jPour(t);
  return jFinale(t);
}

function jSleep(t) {
  const P = makeJ(POS.stove, SET.stoveTop);
  const b = breathIn(t);
  P.breath = b; P.sq = 0.04 * b; P.bend = -5 + 2 * b; P.rot = -0.02;
  P.eye.open = 0; P.eye.shut = 'sleep';
  P.mouth = { type: 'O', open: 0.08 + 0.3 * b };
  P.lid.dy = -9 * b + (b > 0.85 ? Math.sin(t * TAU * 15) * 1.8 : 0);
  P.lid.rot = 0.06 * b - 0.03;
  P.stache = frac((t - 7) / 2) > 0.5 ? Math.sin(t * TAU * 8) * 0.8 * (1 - b) : 0;
  setArm(P.arms[0], 20, -60, 'fist', { back: true });
  setArm(P.arms[1], -20, -60, 'fist', { back: true });
  P.legs[0].x = -33; P.legs[1].x = 33; P.legs[0].ang = 0.3; P.legs[1].ang = 0.3;
  return P;
}

function jWake(t) {
  const P = makeJ(POS.stove, SET.stoveTop);
  const E = P.eye, A = P.arms, L = P.legs;
  P.sq = K(t, [[21.0, 0.02], [21.45, -0.04], [21.7, -0.3, 'out'], [21.86, 0.62, 'out3'], [22.1, -0.14], [22.28, 0.08], [22.44, 0],
    [22.5, -0.24, 'out'], [22.72, 0.05], [22.9, 0], [25.3, 0], [25.55, -0.1], [26.05, 0.34, 'out'], [26.45, 0.3], [26.62, -0.12, 'in'], [26.86, 0.04], [27.05, 0]]);
  P.y -= K(t, [[21.72, 0], [21.93, 36, 'out'], [22.2, 0, 'in']]);
  if (t < 21.7) P.x += Math.sin(t * TAU * 17) * 1.8 * seg(t, 21.0, 21.08);
  if (t > 22.86 && t < 23.3) P.rot = Math.sin((t - 22.86) * TAU * 7) * 0.09 * (1 - seg(t, 22.86, 23.3));
  // глаза
  if (t < 21.72) { E.open = 0; E.shut = 'tight'; }
  else if (t < 22.5) { E.size = K(t, [[21.72, 1], [21.84, 1.42, 'out'], [22.4, 1.22]]); E.pupil = 0.55; E.ly = K(t, [[21.72, 0], [21.9, -1], [22.3, -1], [22.48, 0.3]]); }
  else if (t < 22.86) { E.size = 1.08; E.pupil = 0.7; E.cross = 0.85; }
  else if (t < 23.3) { E.open = 0.9; E.lx = Math.sin((t - 22.86) * TAU * 7) * 0.9; }
  else if (t < 24.9) { E.lx = 1; E.ly = 0.2; E.open = 0.55; E.mad = 0.8; }
  else if (t < 25.35) { E.open = 0; E.shut = 'happy'; }
  else if (t < 26.5) { E.open = 0; E.shut = 'tight'; }
  else if (t < 27.0) { E.open = K(t, [[26.5, 0], [26.8, 1]]); }
  else if (t < 28.1) { E.lx = -0.1; E.ly = -0.1; E.open = 1 - blink(t, 3); }
  else { E.wL = t > 28.3 && t < 28.75 ? 1 : 0; E.open = 1; }
  // рот
  if (t < 21.72) P.mouth = { type: 'wavy' };
  else if (t < 22.5) P.mouth = { type: 'O', open: 1 };
  else if (t < 22.86) P.mouth = { type: 'wavy' };
  else if (t < 24.4) P.mouth = { type: 'frown' };
  else if (t < 25.35) P.mouth = { type: 'smile', open: 0.5 };
  else if (t < 26.5) P.mouth = { type: 'O', open: K(t, [[25.35, 0.3], [25.75, 1.25], [26.3, 1.1], [26.5, 0.2]]) };
  else if (t < 28.1) P.mouth = { type: 'smile', open: 0.7 };
  else P.mouth = { type: 'grin', open: 0.5 };
  P.stache = t > 27.0 && t < 28.0 ? Math.sin((t - 27) * TAU * 3) * 0.9 : 0;
  // крышка: улетает с кувырками и падает набекрень; в 28,1 Жорж приподнимает её, как котелок
  if (t >= 21.76 && t < 22.5) {
    const u = seg(t, 21.76, 22.5);
    P.lid.free = 1; P.lid.dy = -4 * 175 * u * (1 - u); P.lid.dx = 8 * u; P.lid.rot = u * TAU * 2 + 0.22 * u;
  } else if (t >= 22.5) {
    if (t < 28.1) { P.lid.rot = 0.22 + wob(t, 22.5, 0.2, 5, 7); P.lid.dx = 8; P.lid.dy = -2; }
    else {
      P.lid.pivot = -44;
      P.lid.rot = K(t, [[28.1, 0.22], [28.35, -0.42, 'out'], [28.75, -0.42], [29.0, 0, 'back']]);
      P.lid.dx = K(t, [[28.1, 8], [28.35, 0]]);
      P.lid.dy = K(t, [[28.1, -2], [28.35, -24, 'out'], [28.75, -24], [29.0, 0, 'in']]);
    }
  }
  // руки
  if (t < 21.72) { setArm(A[0], 20, -60, 'fist', { back: true }); setArm(A[1], -20, -60, 'fist', { back: true }); }
  else if (t < 22.5) {
    const u = Ease.back(seg(t, 21.72, 21.9));
    setArm(A[0], lerp(-10, -44, u), lerp(-40, -96, u), 'jazz'); setArm(A[1], lerp(10, 44, u), lerp(-40, -96, u), 'jazz');
  } else if (t < 23.3) { setArm(A[0], 34, -48, 'open'); setArm(A[1], -34, -48, 'open'); }
  else if (t < 24.95) {
    setArm(A[0], -4, 42, 'fist');
    const sh = jPoint(P, J.shoulder, J.shoulderY);
    const rest = [sh[0] + 30, sh[1] + 20], tgt = [POS.alarm + 24, SET.sill - 94];
    let u, arc;
    if (t < 23.45) { u = 0; arc = 0; }
    else if (t < 24.3) { u = Ease.io3(seg(t, 23.45, 24.3)); arc = Math.sin(Math.PI * u) * 70; }
    else if (t < 24.42) { u = 1; arc = 0; }
    else { u = 1 - Ease.elastic(seg(t, 24.42, 24.95)); arc = 0; }
    const hx = lerp(rest[0], tgt[0], u), hy = lerp(rest[1], tgt[1], u) - arc;
    setArm(A[1], hx, hy, u > 0.5 ? 'flat' : 'fist', { world: true, ang: u > 0.3 ? lerp(0, 1.3, seg(u, 0.6, 1)) : null });
  } else if (t < 25.3) {
    const c = Math.abs(Math.sin((t - 24.95) * TAU * 2.9)) * 14;
    setArm(A[0], 34 + c, 40, 'flat'); setArm(A[1], -34 - c, 40, 'flat');
  } else if (t < 26.55) {
    const u = Ease.back(seg(t, 25.35, 25.9));
    setArm(A[0], lerp(-20, -26, u), lerp(60, -132, u), 'fist'); setArm(A[1], lerp(20, 26, u), lerp(60, -132, u), 'fist');
    L[0].ang = L[1].ang = -0.35 * seg(t, 25.6, 26.0);
  } else if (t < 27.0) {
    const u = Ease.out(seg(t, 26.55, 26.95));
    setArm(A[0], lerp(-26, -8, u), lerp(-132, 42, u), 'fist'); setArm(A[1], lerp(26, 8, u), lerp(-132, 42, u), 'fist');
  } else if (t < 28.05) {
    const tip = jPoint(P, -30, -76);
    const r = Math.sin((t - 27) * TAU * 3);
    setArm(A[0], tip[0] - 6 + r * 3, tip[1] - 2 + Math.cos((t - 27) * TAU * 3) * 3, 'pinch', { world: true, ang: 0.4 });
    setArm(A[1], 8, 42, 'fist');
  } else if (t < 29.05) {
    setArm(A[0], -8, 42, 'fist');
    const u = seg(t, 28.05, 28.2);
    setArm(A[1], lerp(8, 12, u), lerp(42, -76 + P.lid.dy * 0.9, u), u > 0.5 ? 'pinch' : 'fist');
  } else {
    const r = Math.sin((t - 29) * TAU * 5) * 6;
    setArm(A[0], 40, 70 + r, 'open'); setArm(A[1], -40, 70 - r, 'open');
    P.y -= 5 * Math.sin(Math.PI * beatU(t)) ** 2;
    E.ly = 0.6; E.lx = 0.3;
  }
  return P;
}

function jCoffee(t) {
  const P = makeJ(POS.stove, SET.stoveTop);
  const E = P.eye, A = P.arms, L = P.legs;
  if (t < 30.62) {
    // нога тянется к ручке плиты и поворачивает её
    const u = K(t, [[30.0, 0], [30.3, 1, 'back'], [30.44, 1], [30.62, 0, 'io']]);
    L[1].world = true; L[1].x = lerp(P.x + 27, 452, u); L[1].y = lerp(P.y, 530, u); L[1].ang = -0.3 * u;
    P.bend = -9 * u; E.lx = 0.6 * u; E.ly = 0.8 * u;
    P.mouth = { type: 'smile', open: 0.4 };
    setArm(A[0], -44, 10, 'open'); setArm(A[1], 30, 30, 'open');
  } else if (t < 31.0) {
    // посмотрел вниз — огонь! — глаза лезут на лоб
    E.ly = 1; E.lx = 0.1; E.size = K(t, [[30.72, 1], [30.9, 1.3, 'out']]); E.pupil = 0.65;
    P.sq = K(t, [[30.8, 0], [31.0, -0.24, 'out']]);
    P.mouth = { type: 'wavy' };
    setArm(A[0], -22, 44, 'open'); setArm(A[1], 22, 44, 'open');
  } else if (t < 31.55) {
    // «горячо!» — подпрыгивает, поджав ноги
    const u = seg(t, 31.0, 31.55);
    P.y -= Math.sin(Math.PI * u) * 76;
    P.sq = u < 0.5 ? 0.3 * (1 - u * 2) : 0.12;
    L[0].y = L[1].y = -24 * Math.sin(Math.PI * u); L[0].x = -18; L[1].x = 18;
    E.size = 1.35; E.pupil = 0.5; E.ly = -0.4;
    P.mouth = { type: 'O', open: 1 };
    const fl = Math.sin(t * TAU * 6) * 20;
    setArm(A[0], -40, -90 + fl, 'jazz'); setArm(A[1], 40, -90 - fl, 'jazz');
    P.lid.dy = -12 * Math.sin(Math.PI * u);
  } else {
    // сел — и понял, что он же кофейник: тепло, хорошо
    P.sq = t < 32.2 ? -0.22 * Math.exp(-(t - 31.55) * 8) * Math.cos((t - 31.55) * 18) : 0;
    const bu = beatU(t);
    P.perc = 0.25 + 0.55 * Math.exp(-bu * 4.5);
    P.sq += 0.025 * Math.exp(-bu * 8);
    P.breath = 0.3 * Math.exp(-bu * 5);
    P.blush = t < 33 ? 0.35 : 0.2;
    if (t < 33.0) {
      E.open = 0; E.shut = 'happy'; P.mouth = { type: 'smile', open: 0.6 };
      setArm(A[0], -6, 40, 'fist'); setArm(A[1], 6, 40, 'fist');
      P.bend = 5 * Math.sin(TAU * t / 2);
    } else if (t < 39.0) {
      // свистит мелодию и дирижирует пальцем
      P.mouth = { type: 'o' };
      E.open = 0.55; E.ly = -0.5; E.lx = 0.2;
      P.bend = 9 * Math.sin(TAU * (t - 33) / 2);
      P.rot = 0.02 * Math.sin(TAU * (t - 33) / 2);
      setArm(A[0], -6, 40, 'fist');
      const cu = beatU(t);
      setArm(A[1], 44 + Math.cos(cu * TAU) * 8, -30 + Math.sin(cu * TAU) * 12, 'point', { ang: -0.6 + Math.sin(cu * TAU) * 0.3 });
      P.stache = Math.sin(t * TAU * 2) * 0.4;
    } else if (t < 42.55) {
      E.lx = 1; E.ly = -0.6; E.open = 1 - blink(t, 5);
      P.mouth = { type: 'grin', open: 0.4 };
      setArm(A[0], -6, 40, 'fist');
      if (t > 40.8 && t < 42.2) setArm(A[1], 40 + Math.sin(t * TAU * 3) * 10, -100, 'wave');
      else setArm(A[1], 6, 40, 'fist');
      P.bend = 4 * Math.sin(TAU * t / 1);
    } else {
      // замах перед прыжком на стол
      const u = Ease.out(seg(t, 42.55, 43.1));
      P.sq += -0.26 * u; P.bend = -8 * u;
      E.lx = 1; E.ly = 0.2; E.mad = 0.35 * u;
      P.mouth = { type: 'grin', open: 0.3 };
      setArm(A[0], lerp(-6, -60, u), lerp(40, 10, u), 'fist'); setArm(A[1], lerp(6, -30, u), lerp(40, 30, u), 'fist');
    }
  }
  return P;
}

function jLeap(t) {
  const h = hop(t, 43.3, 0.95, POS.stove, SET.stoveTop, POS.jDance, SET.table, 200, 0.2);
  const P = makeJ(h.x, h.y);
  const E = P.eye, A = P.arms, L = P.legs;
  P.shadow = !h.air;
  P.ground = t < 43.3 ? SET.stoveTop : SET.table;
  P.sq = t < 43.3 ? -0.26 : h.sq;
  if (t < 43.3) {
    P.bend = -8; E.lx = 1; E.ly = 0.2; E.mad = 0.35; P.mouth = { type: 'grin', open: 0.3 };
    setArm(A[0], -60, 10, 'fist'); setArm(A[1], -30, 30, 'fist');
  } else if (h.air) {
    P.rot = Math.sin(Math.PI * h.u) * 0.3;
    E.size = 1.15; E.ly = h.u < 0.5 ? -0.5 : 0.8; E.lx = 0.4;
    P.mouth = { type: 'grin', open: 0.8 };
    L[0].y = L[1].y = -22 * Math.sin(Math.PI * h.u); L[0].x = -20; L[1].x = 20;
    setArm(A[0], -46, -96, 'jazz'); setArm(A[1], 46, -96, 'jazz');
    P.lid.dy = -10 * Math.sin(Math.PI * h.u);
  } else if (t < 45.5) {
    // приземлился, поправил крышку, развернулся к зрителю
    E.open = 1 - blink(t, 9); E.lx = 0.2;
    P.mouth = { type: 'grin', open: 0.35 };
    const fix = seg(t, 44.6, 45.05);
    setArm(A[0], -8, 42, 'fist');
    if (fix > 0 && fix < 1) setArm(A[1], 20, -64, 'pinch');
    else setArm(A[1], 20, 50, 'open');
    P.lid.rot = fix < 1 ? 0.12 * (1 - fix) : 0;
    P.sq += 0.04 * Math.sin(TAU * (t - 44.25) * 2);
  } else {
    // «Та-да!»
    const u = seg(t, 45.5, 45.62);
    P.sq = 0.12 * Ease.back(u) - 0.1 * Math.max(0, seg(t, 45.62, 46) - 0.5) + wob(t, 45.62, 0.05, 4, 6);
    setArm(A[0], -44, -96, 'jazz'); setArm(A[1], 44, -96, 'jazz');
    P.mouth = { type: 'grin', open: 0.9 }; E.size = 1.08;
    L[0].x = -36; L[1].x = 36;
  }
  return P;
}

function jDance(t) {
  const P = makeJ(POS.jDance + 40 * Math.sin(TAU * (t - 46) / 8), SET.table);
  if (t < 54 || t >= 62) { jStrut(P, t, 46, 1); P.eye.open = 1 - blink(t, 13); }
  else if (t < 58) jSolo(P, t);
  else jStopTime(P, t);
  return P;
}

function jSolo(P, t) {
  const E = P.eye, A = P.arms, L = P.legs;
  P.x = POS.jDance + 20;
  // крышка: подброшена в 54,45 и приземляется на голову в 56,0
  if (t < 54.45) {
    const u = Ease.out(seg(t, 54.0, 54.4));
    P.sq = -0.2 * u; setArm(A[1], 14, -70, 'pinch'); setArm(A[0], -30, 30, 'open');
    E.ly = -0.6; P.mouth = { type: 'grin', open: 0.5 };
    P.lid.dy = -4 * u;
  } else if (t < 56.0) {
    const u = seg(t, 54.45, 56.0);
    P.lid.free = 1; P.lid.dy = -4 * 290 * u * (1 - u); P.lid.rot = u * TAU * 3;
    // два оборота вокруг себя: видна чёрная спина
    const sp = Ease.io(seg(t, 54.5, 55.6));
    const th = sp * TAU * 2;
    const c = Math.cos(th);
    P.flip = c >= 0 ? 1 : -1; P.turn = Math.max(0.16, Math.abs(c)); P.back = c < 0;
    P.sq = 0.1 * Math.sin(Math.PI * sp);
    setArm(A[0], -70, -20, 'jazz'); setArm(A[1], 70, -20, 'jazz');
    E.ly = t > 55.5 ? -1 : -0.3; E.size = t > 55.6 ? 1.1 : 1;
    P.mouth = t > 55.6 ? { type: 'O', open: 0.5 } : { type: 'grin', open: 0.6 };
    P.y -= 10 * Math.sin(Math.PI * sp);
  } else if (t < 56.5) {
    P.sq = -0.16 * Math.exp(-(t - 56) * 9) * Math.cos((t - 56) * 20);
    E.open = 0; E.shut = 'happy'; P.mouth = { type: 'grin', open: 0.8 };
    setArm(A[0], -60, -30, 'jazz'); setArm(A[1], 60, -30, 'jazz');
  } else if (t < 57.5) {
    // ноги-шланги заплетаются в косичку и расплетаются
    const u = seg(t, 56.5, 57.0), v = seg(t, 57.0, 57.5);
    const tw = Ease.io(u) * (1 - Ease.io(v));
    P.y -= 26 * tw;
    L[0].x = lerp(-27, 10, tw); L[1].x = lerp(27, -10, tw);
    L[0].bend = tw > 0.3 ? 1 : 0; L[1].bend = tw > 0.3 ? 1 : 0;
    L[0].len = L[1].len = 48 + 26 * tw;
    if (v > 0) { const th = Ease.io(v) * TAU; const c = Math.cos(th); P.flip = c >= 0 ? 1 : -1; P.turn = Math.max(0.16, Math.abs(c)); P.back = c < 0; }
    setArm(A[0], -30, -60 + 20 * tw, 'open'); setArm(A[1], 30, -60 + 20 * tw, 'open');
    E.ly = 0.8 * tw; P.mouth = { type: 'O', open: 0.4 };
  } else {
    const u = Ease.back(seg(t, 57.5, 57.7));
    P.sq = 0.06 * u;
    setArm(A[0], -80, -40, 'jazz'); setArm(A[1], 80, -40, 'jazz');
    L[0].x = -40; L[1].x = 40; P.mouth = { type: 'grin', open: 0.8 };
  }
}

/** Брейк «стоп-тайм»: на сильную долю каждого такта — новая поза, между ними — чечётка. */
function stopPose(t, i) {
  const bars = [58, 59, 60, 61];
  let k = 0;
  for (let j = 0; j < 4; j++) if (t >= bars[j]) k = j;
  const u = Ease.back(seg(t, bars[k], bars[k] + 0.12));
  return { k, u, tap: tapAt(t) };
}
function tapAt(t) {
  const pos = frac(t) * 8;
  for (const p of [3, 5, 6, 7]) if (pos >= p && pos < p + 0.5) return 1 - (pos - p) / 0.5;
  return 0;
}
function jStopTime(P, t) {
  const E = P.eye, A = P.arms, L = P.legs;
  const { k, u, tap } = stopPose(t);
  P.x = POS.jDance;
  if (k === 0) { setArm(A[0], -44, -96, 'jazz'); setArm(A[1], 44, -96, 'jazz'); L[0].x = -40; L[1].x = 40; P.sq = 0.08 * u; E.ly = -0.3; }
  else if (k === 1) { P.bend = -22 * u; setArm(A[0], -96, -10, 'point'); setArm(A[1], -20, -40, 'jazz'); E.lx = -1; }
  else if (k === 2) { P.bend = 22 * u; setArm(A[1], 96, -10, 'point'); setArm(A[0], 20, -40, 'jazz'); E.lx = 1; }
  else {
    const j = seg(t, 61.5, 61.62);
    if (t < 61.5) { P.sq = -0.22 * u; setArm(A[0], -30, 50, 'fist'); setArm(A[1], 30, 50, 'fist'); }
    else { P.sq = 0.18 * Ease.back(j); P.y -= 26 * Ease.out(j) * (1 - seg(t, 61.8, 62)); setArm(A[0], -50, -100, 'jazz'); setArm(A[1], 50, -100, 'jazz'); }
  }
  P.mouth = { type: 'grin', open: 0.7 };
  L[(Math.floor(frac(t) * 8) % 2)].y = -9 * tap;
}

function jRescue(t) {
  let x = POS.jDance;
  if (t > 72.2) x = K(t, [[72.2, POS.jDance], [73.8, POS.jCatch]]);
  const P = makeJ(x, SET.table);
  const E = P.eye, A = P.arms, L = P.legs;
  P.armsLate = t > 79.8 && t < 85.8;
  if (t < 72.2) {
    // музыка стихла: Жорж замер и увидел Кроху наверху
    P.sq = wob(t, 70.0, 0.08, 3, 6);
    E.lx = 0.9; E.ly = -0.9;
    if (t > 70.45) { E.sad = 0.35; E.open = 0.9; }
    P.mouth = t < 70.45 ? { type: 'O', open: 0.2 } : { type: 'smile', open: 0.4 };
    setArm(A[0], -8, 42, 'fist');
    if (t > 71.0) setArm(A[1], 44 + Math.sin(t * TAU * 3) * 10, -104, 'wave');
    else setArm(A[1], 20, 50, 'open');
    P.bend = 6;
  } else if (t < 73.8) {
    const u = beatU(t);
    P.y -= 8 * Math.sin(Math.PI * u) ** 2;
    const n = beatN(t) % 2;
    L[n].y = -16 * Math.sin(Math.PI * u);
    E.lx = 0.9; E.ly = -0.8; P.mouth = { type: 'smile', open: 0.5 };
    setArm(A[0], -30, 40, 'open'); setArm(A[1], 50, -60, 'wave');
  } else if (t < 78.0) {
    // «Давай, прыгай, я здесь!»
    const u = beatU(t);
    P.sq = 0.03 * Math.sin(Math.PI * u);
    E.lx = 0.95; E.ly = -0.85; E.open = 1 - blink(t, 21) * 0.9;
    P.mouth = { type: 'grin', open: 0.35 };
    const bk = Math.sin(t * TAU * 2) * 0.3;
    setArm(A[0], -70, -40, 'open', { ang: -2.2 + bk }); setArm(A[1], 70, -40, 'open', { ang: -0.9 - bk });
    P.bend = 7;
  } else if (t < 79.35) {
    E.lx = 1; E.ly = t < 78.6 ? -0.9 : -0.6;
    if (t > 78.6) { E.size = 1.2; E.pupil = 0.7; P.mouth = { type: 'O', open: 0.3 }; }
    else P.mouth = { type: 'grin', open: 0.5 };
    P.bend = 14;
    setArm(A[0], -40, -10, 'open'); setArm(A[1], 50, -10, 'open');
  } else if (t < 79.92) {
    // «Ой!» — ужас на лице
    const u = seg(t, 79.35, 79.5);
    P.sq = 0.32 * Ease.back(u) - 0.1 * seg(t, 79.6, 79.9);
    P.lid.dy = -30 * Ease.out(u) + 10 * seg(t, 79.6, 79.9);
    E.size = 1.45; E.pupil = 0.45; E.lx = 1; E.ly = 0.6;
    P.mouth = { type: 'O', open: 1 };
    setArm(A[0], -50, -80, 'jazz'); setArm(A[1], 50, -80, 'jazz');
  } else {
    // рука-шланг летит через всю кухню и ловит Кроху у самого пола
    const sh = jPoint(P, J.shoulder, J.shoulderY);
    const shootU = Ease.out3(seg(t, 79.92, 80.5));
    let hx, hy, pose = 'cup', ang = 0;
    if (t < 83.45) {
      hx = lerp(sh[0] + 40, POS.catchP[0], shootU);
      hy = lerp(sh[1] - 40, POS.catchP[1], shootU) - Math.sin(Math.PI * shootU) * 120 + wob(t, 80.55, 16, 2.4, 4.5);
    } else if (t < 85.5) {
      const u = Ease.io(seg(t, 83.45, 85.4));
      const a = POS.catchP, c = [1350, 540], b = [POS.kroTable + 4, SET.table - 6];
      hx = (1 - u) * (1 - u) * a[0] + 2 * (1 - u) * u * c[0] + u * u * b[0];
      hy = (1 - u) * (1 - u) * a[1] + 2 * (1 - u) * u * c[1] + u * u * b[1];
    } else {
      const u = Ease.io(seg(t, 85.5, 85.95));
      hx = lerp(POS.kroTable + 4, sh[0] + 20, u); hy = lerp(SET.table - 6, sh[1] + 60, u); pose = u > 0.5 ? 'open' : 'cup';
    }
    const reach = seg(t, 79.92, 80.3) * (1 - seg(t, 83.6, 85.2));
    const ctrl = reach > 0.02 ? [sh[0] + 150 * reach, sh[1] - 110 * reach, hx - 30 * reach, hy - 250 * reach] : null;
    setArm(A[1], hx, hy, pose, { world: true, ang, ctrl });
    setArm(A[0], -60, -10, 'open');
    P.bend = 18 * reach; P.rot = 0.08 * reach;
    L[0].x = -27 - 14 * reach; L[1].x = 27 + 8 * reach;
    if (t < 80.55) { E.size = 1.2; E.lx = 1; E.ly = 0.8; E.mad = 0.5; P.mouth = { type: 'grin', open: 0.2 }; }
    else if (t < 82.1) { E.open = 0; E.shut = 'tight'; P.mouth = { type: 'wavy' }; }
    else if (t < 82.5) { E.wL = 1; E.lx = 1; E.ly = 0.8; P.mouth = { type: 'wavy' }; }
    else if (t < 83.0) { E.lx = 1; E.ly = 0.8; E.size = 1.1; P.mouth = { type: 'O', open: 0.2 }; }
    else { E.lx = lerp(1, 0.6, seg(t, 83, 85)); E.ly = 0.5; E.sad = 0.2; P.mouth = { type: 'smile', open: 0.6 }; P.blush = 0.25; P.sq = -0.1 * Math.exp(-(t - 83) * 3); }
  }
  return P;
}

function jPour(t) {
  const P = makeJ(POS.jCatch, SET.table);
  const E = P.eye, A = P.arms;
  if (t < 86.9) {
    // галантный поклон
    const u = Ease.io(seg(t, 86.0, 86.45)) * (1 - Ease.io(seg(t, 86.55, 86.9)));
    P.bend = 18 * u; P.sq = -0.08 * u;
    P.lid.pivot = -44; P.lid.rot = -0.35 * u; P.lid.dy = -12 * u;
    setArm(A[1], 12, -76 - 10 * u, 'pinch'); setArm(A[0], lerp(-20, 30, u), lerp(50, 60, u), 'open');
    E.open = 0; E.shut = 'happy'; P.mouth = { type: 'smile', open: 0.6 };
  } else if (t < 90.1) {
    // наклоняется и наливает первую чашку — ей
    const tilt = Ease.io(seg(t, 86.9, 87.45)) * (1 - Ease.back(seg(t, 89.6, 90.1)));
    P.rot = 0.6 * tilt; P.bend = -6 * tilt;
    const top = jPoint(P, -6, -178);
    setArm(A[0], top[0], top[1], 'flat', { world: true, ang: 0.6 * tilt + 0.3 });
    setArm(A[1], 10, 40, 'fist');
    E.lx = 0.9; E.ly = 0.7; P.mouth = { type: 'smile', open: 0.5 };
  } else if (t < 91.9) {
    E.lx = 0.8; E.ly = -0.5 + 0.4 * seg(t, 91, 91.9); P.blush = 0.35;
    P.mouth = { type: 'smile', open: 0.8 };
    P.bend = 4 * Math.sin(TAU * (t - 90) / 2);
    setArm(A[0], -8, 42, 'fist'); setArm(A[1], 8, 42, 'fist');
  } else if (t < 92.9) {
    // два хлопка: «Музыка!»
    const c = Math.min(Math.abs(t - 92.0), Math.abs(t - 92.5));
    const g = clamp(c / 0.2);
    setArm(A[0], 36 - 30 * (1 - g) + 20 * g, -30, 'flat'); setArm(A[1], -36 + 30 * (1 - g) - 20 * g, -30, 'flat');
    E.open = 1; P.mouth = { type: 'grin', open: 0.8 }; P.sq = 0.05 * (1 - g);
  } else {
    const u = seg(t, 93.2, 94.0);
    P.x = lerp(POS.jCatch, 880, Ease.io(u));
    P.y -= 18 * Math.abs(Math.sin(Math.PI * u * 2));
    setArm(A[0], -44, -96, 'jazz'); setArm(A[1], 44, -96, 'jazz');
    P.mouth = { type: 'grin', open: 0.9 };
  }
  return P;
}

/** Где Кроха во время кружения (общая функция для обоих партнёров). */
function swingState(t) {
  const u = Ease.io(seg(t, 98.8, 101.0));
  const th = u * TAU * 2;
  return { th, u, on: t >= 98.8 && t < 101.0 };
}

function jFinale(t) {
  const P = makeJ(880, SET.table);
  const E = P.eye, A = P.arms;
  if (t < 98.0) { jStrut(P, t, 94, 1); P.eye.open = 1 - blink(t, 31); return P; }
  if (t < 101.9) {
    const cx = 1110;
    P.x = t < 98.8 ? lerp(880, cx, Ease.io(seg(t, 98.0, 98.8))) : cx;
    const S = swingState(t);
    P.mouth = { type: 'grin', open: 0.7 };
    if (S.on) {
      const c = Math.cos(S.th);
      P.flip = c >= 0 ? 1 : -1; P.turn = Math.max(0.2, Math.abs(c)); P.back = c < 0;
      P.sq = 0.06;
    }
    const kp = kroha(t);
    const kl = cupShoulder(kp, 0), kr = cupShoulder(kp, 1);
    if (t < 101.0 && t > 98.5) {
      setArm(A[0], kl[0] - 6, kl[1] + 4, 'fist', { world: true });
      setArm(A[1], kr[0] + 6, kr[1] + 4, 'fist', { world: true });
      P.armsLate = !kp.behind;
    } else { setArm(A[0], -30, 30, 'open'); setArm(A[1], 30, 30, 'open'); }
    E.lx = 0.6; E.ly = 0.3;
    if (t > 101.2) { const b = Ease.io(seg(t, 101.2, 101.5)) * (1 - Ease.io(seg(t, 101.6, 101.9))); P.bend = 14 * b; E.open = b > 0.5 ? 0 : 1; }
    return P;
  }
  // финальная поза: Кроха на ладони, вторая рука — вверх
  P.x = K(t, [[101.9, 1110], [102.8, 1100]]);
  if (t < 103.8) jStrut(P, t, 102, 0.7);
  else {
    const lift = Ease.io(seg(t, 104.0, 104.8));
    const k = kroha(t);
    setArm(A[1], k.x + 4, k.y + 4, 'flat', { world: true, ang: -0.1 });
    setArm(A[0], t < 104.9 ? -30 : -44, t < 104.9 ? 30 : -100, t < 104.9 ? 'open' : 'jazz');
    P.armsLate = false;
    P.sq = t < 105 ? -0.1 * lift : 0.12 * Ease.back(seg(t, 105, 105.14)) + wob(t, 105.14, 0.05, 3, 5);
    P.mouth = { type: 'grin', open: 0.8 };
    E.lx = 0.5; E.ly = -0.3;
    if (t >= 105 && t < 106) P.lid.dy = -14 * Math.exp(-(t - 105) * 6);
    if (t >= 106) {
      // диафрагма: покачивается на каждую ноту, потом — поцелуй
      const bob = [106.5, 107.0, 107.25, 107.5, 108.0].reduce((s, x) => s + (t >= x ? Math.exp(-(t - x) * 10) : 0), 0);
      P.sq = 0.05 * bob; E.lx = 0.2; E.ly = -0.2;
      if (t >= 109.0) {
        E.size = 1.3 + wob(t, 109, 0.1, 5, 5); E.pupil = 0.8; E.lx = 0.7; E.ly = -0.3;
        P.blush = Math.min(1, (t - 109) * 5);
        P.mouth = { type: 'O', open: 0.4 };
        P.stache = Math.min(1, (t - 109) * 3);
      }
      if (t >= 109.4) {
        const u = seg(t, 109.4, 109.7);
        P.lid.dy = -60 * Ease.out(u); P.lid.rot = 0.4 * u; P.lid.free = u;
        P.sq = 0.2 * Ease.back(u);
      }
    }
  }
  return P;
}

/* =====================================================================
   ЧАШКИ-ХОРИСТКИ (0…3)
   ===================================================================== */
function cupPose(i, t) {
  const C = makeCup(POS.cupHome[i], SET.shelf1, CUP_S, i);
  const E = C.eye, A = C.arms, L = C.legs;
  C.ground = SET.shelf1;
  E.open = 1 - blink(t, 40 + i);
  if (t < 39 + i * 0.5) {
    // спят, прислонившись друг к другу
    const b = breathIn(t, i * 0.25);
    C.breath = b; C.sq = 0.04 * b; C.rot = (i % 2 ? -1 : 1) * 0.07;
    E.open = 0; E.shut = 'sleep'; C.mouth = { type: 'o' };
    setArm(A[0], -8, 34, 'open'); setArm(A[1], 8, 34, 'open');
    return C;
  }
  if (t < 41.5 + i * 0.25) {
    // аромат щекочет — просыпаются, вытягиваются и воспаряют
    const tw = 39 + i * 0.5;
    C.sq = K(t, [[tw, -0.12], [tw + 0.1, 0.25, 'out'], [tw + 0.35, 0]]) + (t > 40.5 ? 0.03 * Math.sin((t - 40.5) * 9) : 0);
    E.size = K(t, [[tw, 1], [tw + 0.1, 1.25], [tw + 0.5, 1]]);
    E.lx = -0.6; E.ly = -0.5;
    C.mouth = { type: t < tw + 0.3 ? 'O' : 'smile', open: 0.4 };
    if (t > 40.5) {
      C.y -= 16 * Ease.out(seg(t, 40.5, 41.0)) * (1 - seg(t, 41.2, 41.5 + i * 0.25));
      E.open = 0; E.shut = 'happy'; C.blush = 0.4;
      setArm(A[0], -26, -10, 'open'); setArm(A[1], 26, -10, 'open');
    }
    return C;
  }
  if (t < 44.6) {
    // спрыгивают: полка → буфет → стол
    const t1 = 41.5 + i * 0.25, t2 = 42.35 + i * 0.25;
    const cx = POS.cupHome[i] - 36;
    if (t < t2 - 0.14) {
      const h = hop(t, t1, 0.36, POS.cupHome[i], SET.shelf1, cx, SET.counter, 26, 0.1);
      Object.assign(C, { x: h.x, y: h.y, sq: h.sq }); C.ground = h.air ? SET.counter : SET.counter;
      if (t < t1) C.ground = SET.shelf1;
    } else {
      const h = hop(t, t2, 0.46, cx, SET.counter, POS.line[i], SET.table, 64, 0.14);
      Object.assign(C, { x: h.x, y: h.y, sq: h.sq }); C.ground = h.air ? SET.table : (t < t2 ? SET.counter : SET.table);
      C.shadow = !h.air;
    }
    C.mouth = { type: 'grin', open: 0.5 }; E.ly = 0.4;
    setArm(A[0], -30, -30, 'jazz'); setArm(A[1], 30, -30, 'jazz');
    L[0].y = L[1].y = C.y < C.ground - 2 ? -10 : 0;
    return C;
  }
  C.x = POS.line[i]; C.y = SET.table; C.ground = SET.table;
  if (t < 46) {
    if (t < 45.5) { cupStep(C, t, 44, 0.5, i * 0.1); E.lx = -0.3; }
    else { C.sq = 0.1 * Ease.back(seg(t, 45.5, 45.6)); setArm(A[0], -30, -40, 'jazz'); setArm(A[1], 30, -40, 'jazz'); C.mouth = { type: 'grin', open: 0.8 }; L[0].x = -22; L[1].x = 22; }
    return C;
  }
  if (t < 70) {
    if (t < 50 || (t >= 62 && t < 66)) { cupKick(C, t, 46); C.linked = true; }
    else if (t < 54 || t >= 66) cupStep(C, t, 46, 1, 0);
    else if (t < 58) { cupStep(C, t, 46, 0.6, 0); const c = Math.abs(Math.sin(TAU * (t - 54) * 1)); setArm(A[0], -6 - 20 * c, -10, 'flat'); setArm(A[1], 6 + 20 * c, -10, 'flat'); }
    else {
      const { k, u, tap } = stopPose(t);
      if (k === 0) { setArm(A[0], -30, -44, 'jazz'); setArm(A[1], 30, -44, 'jazz'); L[1].x = 30; L[1].y = -30 * u; C.rot = -0.1 * u; }
      else if (k === 1) { C.rot = -0.2 * u; setArm(A[0], -50, -20, 'point'); setArm(A[1], -10, -30, 'jazz'); E.lx = -1; }
      else if (k === 2) { C.rot = 0.2 * u; setArm(A[1], 50, -20, 'point'); setArm(A[0], 10, -30, 'jazz'); E.lx = 1; }
      else if (t < 61.5) { C.sq = -0.2 * u; setArm(A[0], -14, 30, 'fist'); setArm(A[1], 14, 30, 'fist'); }
      else { C.sq = 0.16; C.y -= 20 * Ease.out(seg(t, 61.5, 61.62)) * (1 - seg(t, 61.8, 62)); setArm(A[0], -30, -50, 'jazz'); setArm(A[1], 30, -50, 'jazz'); }
      C.mouth = { type: 'grin', open: 0.6 };
      L[(Math.floor(frac(t) * 8) + i) % 2].y = -8 * tap;
    }
    return C;
  }
  // сюжет: танец стих, все смотрят на Кроху
  const gx = POS.gather[i];
  if (t < 86) {
    C.x = K(t, [[70.6, POS.line[i]], [72.4, gx]]);
    const walk = t > 70.6 && t < 72.4;
    if (walk) { const u = beatU(t * 2); C.y -= 6 * Math.sin(Math.PI * u); L[Math.floor(t * 4) % 2].y = -8 * Math.sin(Math.PI * u); }
    E.lx = 0.7; E.ly = -1;
    if (t < 73.0) { C.mouth = { type: 'O', open: 0.2 }; setArm(A[0], -12, 30, 'open'); setArm(A[1], 12, 30, 'open'); }
    else if (t < 74.0) { setArm(A[1], 30 + Math.sin(t * TAU * 3 + i) * 8, -46, 'wave'); C.mouth = { type: 'grin', open: 0.4 }; }
    else if (t < 79.35) {
      // волнуются за неё
      setArm(A[0], 28, -8, 'open', { ang: -1.3 }); setArm(A[1], -28, -8, 'open', { ang: -1.9 });
      C.x += Math.sin(t * TAU * 9 + i) * 0.8 * seg(t, 76, 78);
      C.mouth = { type: 'wavy' }; E.size = 1.1;
      if (t > 78) { E.lx = K(t, [[78, 0.7], [79.3, -0.1]]); E.ly = -0.9; }
    } else if (t < 83.0) {
      // закрыли глаза ладонями и подглядывают
      E.open = 0; E.shut = 'tight';
      const peek = t > 82.0 + i * 0.1;
      setArm(A[0], 20, -14, 'flat', { ang: peek ? -0.4 : 0 }); setArm(A[1], -20, -14, 'flat', { ang: peek ? Math.PI + 0.4 : Math.PI });
      if (peek) { E.open = 1; E.lx = -0.3; E.ly = 0.9; E.wL = 1; }
      C.mouth = { type: 'O', open: 0.3 };
      C.sq = t < 80 ? 0.08 * seg(t, 79.35, 79.5) : 0;
    } else if (t < 83.5) {
      C.sq = -0.12 * Ease.out(seg(t, 83, 83.3)); E.open = 0; E.shut = 'happy'; C.mouth = { type: 'smile', open: 0.5 };
      setArm(A[0], -12, 30, 'open'); setArm(A[1], 12, 30, 'open');
    } else {
      // радуются
      const u = beatU(t, 0.1 * i);
      C.y -= 10 * Math.sin(Math.PI * u) ** 2;
      setArm(A[0], -30, -46, 'jazz'); setArm(A[1], 30, -46, 'jazz');
      C.mouth = { type: 'grin', open: 0.8 }; E.open = 0; E.shut = 'happy';
    }
    return C;
  }
  if (t < 92.9) {
    // умиляются
    C.x = gx; C.rot = 0.07 * Math.sin(TAU * (t - 86) / 2 + i);
    E.lx = -0.9; E.ly = 0.3; C.mouth = { type: 'smile', open: 0.7 };
    setArm(A[0], 16, -14, 'open', { ang: -1.1 }); setArm(A[1], 30, -8, 'open', { ang: -1.4 });
    if (t > 90) { E.open = 0; E.shut = 'happy'; C.blush = 0.4; }
    return C;
  }
  if (t < 94) {
    C.x = K(t, [[92.9, gx], [93.9, POS.lineF[i]]]);
    const u = seg(t, 92.9, 93.9);
    C.y -= 18 * Math.abs(Math.sin(Math.PI * u * 2));
    setArm(A[0], -30, -40, 'jazz'); setArm(A[1], 30, -40, 'jazz'); C.mouth = { type: 'grin', open: 0.8 };
    return C;
  }
  // финал
  C.x = POS.lineF[i];
  if (t < 98) { cupKick(C, t, 94); C.linked = true; }
  else if (t < 102) {
    // расступаются: в середине стола Жорж кружит Кроху
    C.x = K(t, [[98, POS.lineF[i]], [98.7, POS.swingSide[i]]]);
    cupStep(C, t, 94, 1, 0);
  } else if (t < 104.9) {
    const fx = [920, 1000, 1262, 1342][i];
    C.x = K(t, [[102, POS.swingSide[i]], [103, fx]]);
    cupStep(C, t, 94, 0.8, 0);
  } else {
    C.x = [920, 1000, 1262, 1342][i];
    const u = Ease.back(seg(t, 105, 105.12));
    const side = i < 2 ? -1 : 1;
    L[i < 2 ? 0 : 1].x = side * 36; L[i < 2 ? 0 : 1].y = -40 * u; L[i < 2 ? 0 : 1].ang = 0.8;
    setArm(A[0], -30, -46, 'jazz'); setArm(A[1], 30, -46, 'jazz');
    C.rot = -side * 0.12 * u; C.mouth = { type: 'grin', open: 0.9 }; E.open = 0; E.shut = 'happy';
  }
  return C;
}

/* =====================================================================
   КРОХА
   ===================================================================== */
function kroha(t) {
  const C = makeCup(POS.kroHide, SET.shelf2, KRO_S, 'kro');
  const E = C.eye, A = C.arms, L = C.legs;
  C.ground = SET.shelf2;
  E.open = 1 - blink(t, 77);
  setArm(A[0], -10, 34, 'open'); setArm(A[1], 10, 34, 'open');
  if (t < 41.0) {
    const b = breathIn(t, 0.6);
    C.breath = b; C.sq = 0.04 * b; C.rot = -0.08;
    E.open = 0; E.shut = 'sleep'; C.mouth = { type: 'o' };
    return C;
  }
  if (t < 43.0) {
    // проснулась, выглянула из-за сахарницы, хотела за всеми — посмотрела вниз и спряталась
    C.x = K(t, [[41.2, POS.kroHide], [41.6, POS.kroHide - 50, 'back'], [42.6, POS.kroHide - 50], [42.95, POS.kroHide, 'io']]);
    C.sq = K(t, [[41.0, -0.1], [41.12, 0.2, 'out'], [41.4, 0], [42.15, 0], [42.3, -0.18, 'out'], [42.45, 0.05], [42.62, -0.14], [42.8, 0]]);
    E.size = K(t, [[41.0, 1], [41.12, 1.25], [41.5, 1.05]]);
    if (t < 41.6) { E.lx = -0.8; E.ly = 0.6; C.mouth = { type: 'O', open: 0.3 }; }
    else if (t < 42.25) { E.lx = -1; E.ly = 0.9; C.mouth = { type: 'grin', open: 0.5 }; setArm(A[0], -30, -20, 'open'); C.rot = -0.1; }
    else if (t < 42.7) { E.lx = -0.6; E.ly = 1; E.pupil = 0.6; E.size = 1.2; C.mouth = { type: 'wavy' }; setArm(A[0], 20, -10, 'open', { ang: -1.2 }); setArm(A[1], -20, -10, 'open', { ang: -1.9 }); }
    else { E.lx = 0.4; E.ly = 0.3; C.mouth = { type: 'frown' }; E.sad = 0.5; }
    return C;
  }
  if (t < 62.0) {
    // прячется; иногда выглядывает одним глазом
    const peek = Math.max(0, Math.sin((t - 43) * 0.9)) ** 6;
    C.x = POS.kroHide - 44 * peek;
    E.lx = -1; E.ly = 0.7; E.sad = 0.4; C.mouth = { type: 'frown' };
    C.rot = -0.08 * peek + 0.02 * Math.sin(TAU * t / 1);
    return C;
  }
  if (t < 70.0) {
    // одна наверху: вышла на край полки, пританцовывает — и боится высоты
    C.x = K(t, [[62.9, POS.kroHide - 50], [64.3, POS.kroEdge, 'io']]);
    if (t > 62.9 && t < 64.3) { const u = frac(t * 4); C.y -= 4 * Math.sin(Math.PI * u); L[Math.floor(t * 4) % 2].y = -7 * Math.sin(Math.PI * u); E.lx = -0.8; E.ly = 0.5; C.mouth = { type: 'smile', open: 0.3 }; }
    else if (t < 62.9) { E.lx = -1; E.ly = 0.8; C.x = POS.kroHide - 50 * Ease.io(seg(t, 62.0, 62.6)); C.mouth = { type: 'smile', open: 0.2 }; }
    else if (t < 65.0) {
      cupStep(C, t, 46, 0.6, 0); E.open = 0; E.shut = 'happy';
      if (t > 64.5) { const k = Math.sin(Math.PI * seg(t, 64.5, 64.8)); L[0].x = -14 - 16 * k; L[0].y = -22 * k; }
    } else if (t < 67.0) { E.lx = -0.5; E.ly = 1; E.size = 1.15; C.mouth = { type: 'O', open: 0.2 }; setArm(A[0], -24, 10, 'open'); setArm(A[1], 20, 20, 'open'); }
    else if (t < 67.6) { C.sq = K(t, [[67.0, 0], [67.15, -0.2, 'out'], [67.3, 0.1], [67.5, 0]]); E.size = 1.2; E.pupil = 0.6; E.ly = 1; C.mouth = { type: 'wavy' }; }
    else if (t < 68.4) { C.x = POS.kroEdge + 10 * seg(t, 67.6, 68.2); E.ly = 0.8; E.sad = 0.6; C.mouth = { type: 'frown' }; }
    else {
      // села на край полки, ножки свесились
      const u = Ease.io(seg(t, 68.4, 69.0));
      C.x = POS.kroEdge + 10; C.hip = lerp(30, 6, u);
      L[0].world = L[1].world = false;
      L[0].x = -10; L[1].x = 10; L[0].y = L[1].y = lerp(0, 34, u);
      E.open = 0.7; E.sad = 0.8; E.ly = 0.8; C.mouth = { type: 'frown' };
      setArm(A[0], 20, 12, 'open', { ang: -1.4 }); setArm(A[1], -20, 12, 'open', { ang: -1.7 });
      const b = breathIn(t, 0.2); C.breath = 0.6 * b;
      C.tear = seg(t, 69.2, 70.0);
    }
    return C;
  }
  if (t < 78.0) {
    if (t < 73.5) {
      // её позвали!
      C.x = POS.kroEdge + 10; C.hip = 6; L[0].x = -10; L[1].x = 10; L[0].y = L[1].y = 34;
      E.ly = 0.9; E.lx = -0.7; E.sad = 0.6; C.mouth = { type: 'frown' };
      setArm(A[0], 20, 12, 'open', { ang: -1.4 }); setArm(A[1], -20, 12, 'open', { ang: -1.7 });
      if (t > 72.1) { E.sad = 0; E.size = K(t, [[72.1, 1], [72.25, 1.3, 'out'], [72.6, 1.1]]); C.sq = K(t, [[72.1, 0], [72.2, 0.15], [72.4, 0]]); C.mouth = { type: 'O', open: 0.3 }; }
      if (t > 72.5 && t < 73.1) { setArm(A[1], -24, -6, 'point', { ang: Math.PI - 0.6 }); E.lx = -0.2; E.ly = 0.2; }
      if (t > 73.1) { C.mouth = { type: 'smile', open: 0.8 }; C.blush = 0.3; E.ly = 0.8; E.lx = -0.8; }
    } else if (t < 74.0) {
      const u = Ease.back(seg(t, 73.5, 73.9));
      C.x = lerp(POS.kroEdge + 10, POS.kroEdge, u); C.hip = lerp(6, 30, u);
      L[0].y = L[1].y = lerp(34, 0, u);
      C.mouth = { type: 'smile', open: 0.8 }; E.ly = 0.8; E.lx = -0.8;
    } else {
      C.x = POS.kroEdge;
      if (t < 75.5) {
        // страшно: коленки дрожат
        E.ly = 1; E.lx = -0.5; E.size = 1.15; E.pupil = 0.7; C.mouth = { type: 'wavy' };
        const q = Math.sin(t * TAU * 11);
        L[0].x = -14 + q * 3; L[1].x = 14 - q * 3; L[0].bend = q > 0 ? 1 : -1; L[1].bend = q > 0 ? -1 : 1;
        C.sq = -0.03 + 0.02 * q;
        setArm(A[0], 20, 0, 'open', { ang: -1.3 }); setArm(A[1], -20, 0, 'open', { ang: -1.9 });
      } else if (t < 76.6) {
        // решилась: тряхнула головой, «закатала рукава»
        C.rot = t < 75.9 ? Math.sin((t - 75.5) * TAU * 5) * 0.12 : 0;
        E.mad = 0.6; E.ly = 0.3; E.lx = -0.6; C.mouth = { type: 'frown' };
        const tug = Math.sin((t - 75.9) * TAU * 3);
        setArm(A[0], -20 + tug * 4, 10, 'fist'); setArm(A[1], 20 - tug * 4, 10, 'fist');
      } else {
        // замах: присела, руки назад, барабанная дробь
        const u = Ease.out(seg(t, 76.6, 77.6));
        C.sq = -0.34 * u; C.rot = -0.12 * u;
        E.mad = 0.7; E.lx = -1; E.ly = 0.4; C.mouth = { type: 'grin', open: 0.2 };
        setArm(A[0], lerp(-10, 20, u), lerp(34, 10, u), 'fist'); setArm(A[1], lerp(10, 40, u), lerp(34, 6, u), 'fist');
        C.x += Math.sin(t * TAU * 13) * 0.8 * seg(t, 77.2, 78);
      }
    }
    return C;
  }
  if (t < 80.55) {
    // прыжок… зависла… и вниз
    const x0 = POS.kroEdge, y0 = SET.shelf2;
    const ax = 1454, ay = 226;
    let x, y;
    C.shadow = false;
    if (t < 78.6) {
      const u = seg(t, 78.0, 78.6);
      x = lerp(x0, ax, Ease.out(u)); y = lerp(y0, ay, u) - 70 * Math.sin(Math.PI * Math.min(1, u * 1.2)) * (1 - u * 0.4);
      C.sq = 0.4 * (1 - u); C.rot = -0.35 * Math.sin(Math.PI * u);
      E.open = 0; E.shut = 'tight'; C.mouth = { type: 'grin', open: 0.5 };
      setArm(A[0], -40, -34, 'jazz'); setArm(A[1], 40, -34, 'jazz');
      L[0].y = L[1].y = -12;
    } else if (t < 79.35) {
      x = ax; y = ay;
      E.open = t < 78.8 ? 0 : 1; E.shut = 'tight';
      E.ly = 1; E.size = t > 79.0 ? 1.35 : 1.1; E.pupil = 0.5;
      C.mouth = t > 79.0 ? { type: 'wavy' } : { type: 'smile', open: 0.4 };
      if (t > 79.1) { E.lx = 0; E.ly = 0; setArm(A[1], 30 + Math.sin(t * TAU * 5) * 6, -30, 'wave'); }
      else setArm(A[1], 40, -34, 'jazz');
      setArm(A[0], -40, -34, 'jazz');
    } else {
      const d = t - 79.35;
      x = ax; y = ay + 0.5 * 760 * d * d;
      C.sq = Math.min(0.45, d * 1.2);
      E.size = 1.4; E.pupil = 0.45; E.ly = -1;
      C.mouth = { type: 'O', open: 1 };
      setArm(A[0], -30, -56, 'jazz'); setArm(A[1], 30, -56, 'jazz');
      L[0].y = L[1].y = -6;
    }
    C.x = x; C.y = Math.min(y, POS.catchP[1]);
    C.ground = SET.floor;
    return C;
  }
  if (t < 85.45) {
    // поймана! сидит в перчатке — зажмурилась, потом открывает глаз
    const J0 = jorzh(t);
    const h = J0.arms[1];
    C.x = h.x + 18; C.y = h.y - 2; C.shadow = false; C.ground = SET.floor;
    C.sq = K(t, [[80.55, -0.35], [80.75, 0.1], [80.95, 0]]);
    C.hip = 14; L[0].x = -16; L[1].x = 16; L[0].y = L[1].y = -2;
    if (t < 82.0) { E.open = 0; E.shut = 'tight'; C.mouth = { type: 'wavy' }; setArm(A[0], 14, -20, 'flat', { ang: -1.2 }); setArm(A[1], -14, -20, 'flat', { ang: -2 }); }
    else if (t < 82.4) { E.wR = 1; E.ly = 0.6; C.mouth = { type: 'wavy' }; }
    else if (t < 83.1) { E.ly = 0.5; E.lx = -0.4; E.size = 1.1; C.mouth = { type: 'O', open: 0.2 }; }
    else { E.lx = -0.9; E.ly = -0.3; C.mouth = { type: 'smile', open: 0.6 }; C.blush = 0.3; }
    if (t > 83.45) { C.ground = SET.table; E.lx = -0.9; E.ly = -0.4; setArm(A[0], -20, -20, 'jazz'); setArm(A[1], 20, -20, 'jazz'); }
    return C;
  }
  if (t < 92.9) {
    C.x = POS.kroTable; C.y = SET.table; C.ground = SET.table;
    C.sq = t < 85.9 ? -0.2 * Math.exp(-(t - 85.45) * 8) * Math.cos((t - 85.45) * 18) : 0;
    C.fill = seg(t, 87.6, 89.6);
    E.lx = -0.8; E.ly = -0.6;
    if (t < 87.4) { C.mouth = { type: 'smile', open: 0.5 }; C.blush = 0.35; }
    else if (t < 89.7) { E.ly = -0.9; C.mouth = { type: 'O', open: 0.3 }; E.size = 1.1; setArm(A[0], -20, 16, 'open'); setArm(A[1], 20, 16, 'open'); }
    else if (t < 91.0) { E.open = 0; E.shut = 'happy'; C.blush = 0.7; C.mouth = { type: 'smile', open: 0.9 }; C.rot = 0.05 * Math.sin((t - 89.7) * TAU); setArm(A[0], 20, -10, 'open', { ang: -1.2 }); setArm(A[1], -20, -10, 'open', { ang: -1.9 }); }
    else {
      // реверанс
      const u = Math.sin(Math.PI * seg(t, 91.1, 91.8));
      C.sq = -0.15 * u; C.hip = 30 - 8 * u;
      setArm(A[0], -30, 20, 'open', { ang: 2.4 }); setArm(A[1], 30, 20, 'open', { ang: 0.7 });
      C.mouth = { type: 'smile', open: 0.8 }; E.open = u > 0.3 ? 0 : 1; E.shut = 'happy'; C.blush = 0.5;
    }
    C.fill = t > 89.6 ? 1 : C.fill;
    return C;
  }
  C.fill = 1;
  if (t < 94) {
    C.x = K(t, [[92.9, POS.kroTable], [93.9, POS.kroF]]); C.y = SET.table; C.ground = SET.table;
    C.y -= 18 * Math.abs(Math.sin(Math.PI * seg(t, 92.9, 93.9) * 2));
    setArm(A[0], -30, -40, 'jazz'); setArm(A[1], 30, -40, 'jazz'); C.mouth = { type: 'grin', open: 0.8 };
    return C;
  }
  C.x = POS.kroF; C.y = SET.table; C.ground = SET.table;
  if (t < 98) { cupKick(C, t, 94); C.linked = true; C.eye.open = 1; C.eye.shut = 'happy'; E.open = 0; return C; }
  if (t < 101.9) {
    const S = swingState(t);
    const cx = 1110, cy = SET.table - 96;
    if (t < 98.8) { C.x = lerp(POS.kroF, 1190, Ease.io(seg(t, 98.0, 98.8))); setArm(A[0], -30, -10, 'fist'); setArm(A[1], 30, -10, 'fist'); }
    else if (S.on) {
      // кружится вокруг Жоржа, держась за его руки
      const r = 130 * Math.sin(Math.PI * Math.min(1, S.u * 6)) ** 0.3;
      C.x = cx + Math.cos(S.th) * Math.max(80, r);
      C.y = cy + Math.sin(S.th) * 26 + 52 - 40 * Math.sin(Math.PI * S.u);
      C.behind = Math.sin(S.th) < -0.1;
      C.rot = -Math.cos(S.th) * 0.5 * Math.sin(Math.PI * S.u);
      C.shadow = false;
      L[0].y = L[1].y = -8;
      setArm(A[0], -24, -10, 'fist'); setArm(A[1], 24, -10, 'fist');
      E.open = 0; E.shut = 'happy'; C.mouth = { type: 'grin', open: 0.9 };
    } else {
      C.x = 1190;
      const u = Math.sin(Math.PI * seg(t, 101.1, 101.8));
      C.sq = -0.14 * u;
      setArm(A[0], -30, 16, 'open', { ang: 2.4 }); setArm(A[1], 30, 16, 'open', { ang: 0.7 });
      C.mouth = { type: 'smile', open: 0.9 }; C.blush = 0.5;
    }
    return C;
  }
  if (t < 104.0) { C.x = 1190; cupStep(C, t, 94, 0.8); return C; }
  // Жорж поднимает её на ладони
  const u = Ease.io(seg(t, 104.0, 104.8));
  const J0 = makeJ(1100, SET.table);
  const sh = jPoint(J0, J.shoulder, J.shoulderY);
  C.x = lerp(1190, sh[0] + 62, u); C.y = lerp(SET.table, sh[1] - 20, u) - Math.sin(Math.PI * u) * 40;
  C.shadow = u < 0.05;
  E.open = 0; E.shut = 'happy';
  C.mouth = { type: 'grin', open: 0.9 };
  if (t >= 105) {
    setArm(A[1], 30, -46, 'jazz'); setArm(A[0], -26, 10, 'open');
    C.sq = 0.1 * Ease.back(seg(t, 105, 105.12));
    if (t >= 106) {
      const bob = [106.5, 107.0, 107.25, 107.5, 108.0].reduce((s, x) => s + (t >= x ? Math.exp(-(t - x) * 10) : 0), 0);
      C.sq = 0.06 * bob;
      E.open = 1; E.lx = -0.8; E.ly = 0.3;
      if (t > 108.5) {
        // тянется к щеке Жоржа — поцелуй
        const k = Ease.io(seg(t, 108.5, 109.0)) * (1 - Ease.io(seg(t, 109.2, 109.6)));
        C.rot = -0.5 * k; C.x -= 26 * k; C.y += 8 * k;
        E.open = k > 0.7 ? 0 : 1; E.shut = 'happy';
        C.mouth = k > 0.7 ? { type: 'o' } : { type: 'smile', open: 0.8 };
        C.blush = 0.4 + 0.5 * k;
        setArm(A[0], -20, -10, 'open'); setArm(A[1], 26, -20, 'open');
      }
    }
  } else { setArm(A[0], -30, -20, 'open'); setArm(A[1], 30, -20, 'open'); }
  return C;
}

/* =====================================================================
   БУДИЛЬНИК
   ===================================================================== */
function alarmPose(t, env) {
  const A = makeAlarm(POS.alarm, SET.sill);
  A.hour = 6; A.min = t < 20 ? 58 : t < 20.5 ? 59 : t < 21 ? 59.5 : 0;
  if (t >= 21) A.hour = 7;
  if (t < 21) {
    const b = breathIn(t, 0.4);
    A.sy = 1 + 0.02 * b;
    if (t > 20) { A.sy += 0.06 * Math.exp(-frac(t * 2) * 10); }
    return A;
  }
  if (t < 24.36) {
    // звенит: трясётся, подпрыгивает и ползёт по подоконнику
    const f = Math.floor(t * 24);
    A.ring = 1; A.awake = 1; A.open = 0.8 + 0.2 * Math.sin(t * 40);
    A.jx = (hash2(f, 1) - 0.5) * 7; A.jy = -Math.abs(Math.sin(t * TAU * 6)) * 12; A.rot = (hash2(f, 2) - 0.5) * 0.32;
    A.x += (t - 21.0) * 7;
    return A;
  }
  // прихлопнули: сплющился, в глазах спирали
  A.x = POS.alarm + 23.5;
  const d = t - 24.36;
  A.sy = 1 - 0.5 * Math.exp(-d * 3) * (d < 0.08 ? 1 : Math.cos((d - 0.08) * 14));
  A.sx = 1 / Math.max(0.4, A.sy);
  A.awake = 1 - seg(t, 26.2, 26.8);
  A.dizzy = 1;
  if (env.groove > 0.01) {
    const u = beatU(t, 0.25);
    A.jy = -env.groove * 10 * Math.sin(Math.PI * u) ** 2;
    A.sy *= 1 - env.groove * 0.06 * Math.cos(TAU * u);
    A.rot = env.groove * 0.08 * Math.sin(TAU * t);
  }
  return A;
}
