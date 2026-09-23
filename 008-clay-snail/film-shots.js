/* Улитка идёт на концерт — режиссура: сцены, планы, камера и игра персонажей.
   Каждый план — функция локального времени lt (секунды от начала плана), которая заполняет состояние кадра. */
'use strict';

// Точки мира, к которым привязаны планы
const P_POSTER = [7.6, 5.4, 4.6];
const P_CAN = [143, 2, -15];
const P_BERRY = [44.6, 0, 1.0];
const P_STAGE = [128, -16, -3];
const SHELL_STOP = [118.5, 0, 0.6];

// ---------------------------------------------------------------- помощники режиссуры
function camSet(st, pos, tgt, fov, focus, ap) {
  st.cam.pos = pos; st.cam.tgt = tgt; st.cam.fov = fov; st.cam.focus = focus; st.cam.ap = ap;
}
function card(st, a, b, color, lt, dur, hw) {
  st.set = 2;
  st.light = light('studio');
  st.title = { a, b, pop: seg(lt, 0.15, 1.5, E.lin), color, h: hw };
  const drift = lt / dur;
  camSet(st, [lerp(-1.2, 0.6, drift), -7.5, lerp(31, 29, drift)], [0, -0.3, 0], 42, [0, 0, 0.4], 0.016);
  st.grain = 0.03; st.vig = 0.5;
  st.fade = Math.min(seg(lt, 0, 0.35, E.lin), 1 - seg(lt, dur - 0.3, dur, E.lin));
}
// ползание: d — пройденный путь, возвращает поправки к позе
function crawl(s, d, amp = 1) {
  const ph = d / 1.15 * Math.PI * 2;
  s.len += 0.08 * amp * Math.sin(ph);
  s.lift += 0.07 * amp * Math.sin(ph + 1.2);
  s.shellBob += 0.05 * amp * Math.sin(ph + 2.2);
  s.shellRoll += 0.03 * amp * Math.sin(ph * 0.5);
  return s;
}
// взгляд, который «перескакивает» между точками (саккады)
function lookSeq(t, seq) {
  let cur = seq[0][1];
  for (const [tt, p] of seq) if (t >= tt) cur = p;
  return cur;
}
// путь раковины по склону: качение по земле и прыжки после ударов
const ROLL = (() => {
  const R = 1.95;
  // опорные точки: время от начала качения, x, z, высота прыжка до следующей точки
  const pts = [
    [0.0, 46.0, 0.0, 0], [1.1, 50.0, 0.1, 0], [2.0, 58.0, 0.25, 0], [2.7, 69.4, 0.4, 2.2],
    [3.35, 79.5, 0.2, 0.3], [3.55, 82.2, -0.3, 6.5], [4.55, 95.0, 0.2, 1.2], [5.0, 101.5, 0.4, 0],
    [5.9, 110.0, 0.55, 0], [6.9, 116.5, 0.6, 0], [7.8, 118.5, 0.6, 0],
  ];
  function at(tr) {
    tr = clamp(tr, 0, pts[pts.length - 1][0]);
    let i = 1; while (i < pts.length - 1 && tr > pts[i][0]) i++;
    const a = pts[i - 1], b = pts[i];
    let u = (tr - a[0]) / (b[0] - a[0]);
    if (i === 1) u = u * u;                          // разгон
    if (i >= pts.length - 2) u = 1 - Math.pow(1 - u, 2); // торможение
    const x = lerp(a[1], b[1], u), z = lerp(a[2], b[2], u);
    const hop = a[3] * 4 * u * (1 - u);
    const y = groundH(x, z) + R + hop;
    return [x, y, z];
  }
  // суммарный угол качения ≈ путь / радиус
  function spin(tr) {
    let d = 0, prev = at(0);
    const n = Math.ceil(clamp(tr, 0, 7.8) * 12);
    for (let k = 1; k <= n; k++) { const p = at(k / 12); d += Math.hypot(p[0] - prev[0], p[2] - prev[2]); prev = p; }
    return -d / R;
  }
  const impacts = [2.7, 3.35, 3.55, 4.55, 5.0];
  return { at, spin, impacts, end: 7.8 };
})();
function shellAxesSpin(a, rollSide = 0) {
  const F = [1, 0, 0], U = [0, 1, 0], Rz = [0, 0, 1];
  let x = V.rot(F, Rz, a), y = V.rot(U, Rz, a);
  if (rollSide) { x = V.rot(x, [1, 0, 0], rollSide); y = V.rot(y, [1, 0, 0], rollSide); }
  return [x, y, V.norm(V.cross(x, y))];
}
// светлячки у сцены: позиции парят, яркость задаётся планом
function fireflies(t, n, on) {
  const out = [];
  const base = [[124.5, -11.8, 1.5], [131.5, -11.2, 0.5], [126, -9.8, -7.5], [133, -10.5, -5], [121, -10.5, -4.5], [129, -8.8, 3.2], [117, -11.5, 3.5], [135.5, -12, 2]];
  for (let i = 0; i < n; i++) {
    const b = base[i];
    out.push([b[0] + 0.6 * Math.sin(t * 0.9 + i * 1.7), b[1] + 0.4 * Math.sin(t * 1.3 + i), b[2] + 0.5 * Math.cos(t * 0.7 + i * 2.3), typeof on === 'function' ? on(i) : on]);
  }
  return out;
}

// ---------------------------------------------------------------- сцена 1. Утро
function shotOpening(lt, st) {
  st.light = light('dawn');
  const u = lt / 5.5;
  camSet(st, [lerp(-3.5, -1.0, u), lerp(5.4, 4.3, u), lerp(31, 22, E.sine(u))], [lerp(0.6, 1.2, u), lerp(3.2, 2.8, u), 0], 34, [-0.4, 2.2, 0], 0.024);
  const s = snail({ retract: 1, x: 0, z: 0 });
  s.shellRoll = spring(lt, 4.3, 0.06, 2.5, 4);
  st.snail = s;
  st.fade = seg(lt, 0, 1.2, E.sine);
}

function shotTitle(lt, st) { card(st, 0, 1, 0, lt, 4.5, 6.0); }

function shotWake(lt, st) {
  st.light = light('dawn');
  camSet(st, [lerp(4.6, 4.2, lt / 7), 3.3, lerp(12.2, 11.2, lt / 7)], [0.7, 2.3, 0], 30, [0.6, 2.4, 0], 0.03);
  const s = snail({ x: 0, z: 0 });
  // раковина покачивается — внутри просыпаются
  s.shellRoll = spring(lt, 0.3, 0.07, 2.2, 3) + spring(lt, 0.8, 0.05, 2.6, 4);
  // хлоп! голова наружу
  const out = seg(lt, 1.15, 1.45, E.outBack);
  s.retract = 1 - out;
  s.len = 1 + spring(lt, 1.45, 0.14, 2.4, 5);
  s.squash = 1 - spring(lt, 1.45, 0.1, 2.4, 5);
  // стебельки глаз выкатываются по очереди
  s.eyeL.len = seg(lt, 1.55, 1.95, E.outBack) + spring(lt, 1.95, 0.12, 3, 5);
  s.eyeR.len = seg(lt, 1.9, 2.3, E.outBack) + spring(lt, 2.3, 0.12, 3, 5);
  // сонная, потом зевок и потягивание
  const yawn = seg(lt, 2.5, 3.2, E.io) * (1 - seg(lt, 3.5, 4.0, E.io));
  s.mouthOpen = yawn;
  s.mouthW = 0.2 + 0.08 * yawn;
  s.hPitch = -0.45 * yawn;
  s.len += 0.12 * yawn;
  s.lift = 0.3 * yawn;
  s.eyeL.pitch = s.eyeR.pitch = 0.15 - 0.5 * yawn;
  const sleepy = 1 - seg(lt, 3.9, 4.4);
  s.eyeL.lid = s.eyeR.lid = Math.max(0.55 * sleepy + 0.45 * yawn, blinkAt(lt, [4.6, 5.9]));
  // встряхнулась
  s.hRoll = spring(lt, 4.1, 0.12, 3.2, 4);
  s.shellRoll += spring(lt, 4.15, 0.04, 3.2, 4);
  // оглядывается и замечает афишу
  s.look = lookSeq(lt, [[0, null], [4.5, [-6, 2.5, 8]], [5.1, [2, 2, 12]], [5.55, P_POSTER]]);
  const notice = seg(lt, 5.55, 6.1, E.outBack);
  s.hYaw = 0.45 * notice;
  s.lean = 0.25 * notice;
  s.eyeL.len += 0.15 * notice; s.eyeR.len += 0.15 * notice;
  s.pupil = 0.8 - 0.06 * notice;
  s.smile = 0.6 + 0.3 * notice;
  st.snail = s;
}

function shotPoster(lt, st) {
  st.light = light('dawn');
  const eye = [2.35, 3.65, 0.75];
  const f = seg(lt, 0.5, 1.4, E.io);
  camSet(st, [2.2, 3.95, 1.9], [lerp(6.0, 7.5, f), lerp(4.9, 5.3, f), lerp(3.6, 4.5, f)], 34, V.lerp(eye, [7.5, 5.3, 4.5], f), 0.032);
  const s = snail({ x: 0, z: 0, hYaw: 0.45, lean: 0.25 });
  s.eyeL.len = s.eyeR.len = 1.15;
  // «читает» строчки афиши
  const lines = [[7.9, 6.9, 4.5], [7.5, 5.9, 4.6], [7.5, 5.0, 4.6], [7.5, 4.4, 4.6]];
  const k = Math.min(3, Math.floor(clamp((lt - 1.2) / 0.62, 0, 3.99)));
  const u = ((lt - 1.2) / 0.62) % 1;
  const ln = lines[k];
  s.look = lt < 1.2 ? P_POSTER : [ln[0] - 0.02, ln[1], ln[2] + lerp(1.1, -1.1, clamp(u, 0, 1))];
  s.eyeL.lid = s.eyeR.lid = blinkAt(lt, [3.6]);
  st.snail = s;
}

function shotJoy(lt, st) {
  st.light = light('dawn');
  camSet(st, [6.4, 3.0, 5.6], [2.0, 2.55, 0.25], 30, [2.1, 2.6, 0.3], 0.03);
  const s = snail({ x: 0, z: 0, hYaw: lerp(0.45, 0.2, seg(lt, 0.4, 0.8)) });
  const take = seg(lt, 0.35, 0.55, E.outBack);
  s.eyeL.lid = s.eyeR.lid = -0.35 * take;
  s.pupil = 0.74;
  s.eyeL.len = s.eyeR.len = 1 + 0.25 * take + spring(lt, 0.55, 0.15, 3.5, 5);
  s.smile = lerp(0.9, 2.2, take);
  s.mouthOpen = 0.45 * take * (1 - seg(lt, 2.4, 2.8));
  s.mouthW = 0.22 + 0.05 * take;
  // два радостных подскока
  const hop = (t0) => { const u = (lt - t0) / 0.42; return u > 0 && u < 1 ? Math.sin(u * Math.PI) : 0; };
  const h = hop(0.75) + hop(1.3) * 0.8;
  s.bodyY = 0.75 * h;
  const land = spring(lt, 1.17, 0.18, 3, 7) + spring(lt, 1.72, 0.15, 3, 7);
  s.squash = 1 - land + 0.1 * h;
  s.len = 1 + land * 0.8 - 0.06 * h;
  s.shellBob = -spring(lt, 1.2, 0.25, 2.6, 6) - spring(lt, 1.75, 0.2, 2.6, 6);
  s.eyeL.pitch = 0.15 + spring(lt, 1.2, 0.35, 2.4, 4);
  s.eyeR.pitch = 0.15 + spring(lt, 1.25, 0.35, 2.4, 4);
  // смотрит вдаль: где же лейка?
  const far = seg(lt, 2.6, 3.2, E.io);
  s.look = lt < 2.6 ? [8, 4.5, 6] : P_CAN;
  s.hYaw += -0.35 * far;
  s.eyeL.lid = s.eyeR.lid = lerp(s.eyeL.lid, 0.35, far);
  s.eyeL.tilt = s.eyeR.tilt = -0.2 * far;
  s.eyeL.len += 0.35 * seg(lt, 3.2, 3.9, E.outBack); s.eyeR.len += 0.35 * seg(lt, 3.3, 4.0, E.outBack);
  s.smile = lerp(s.smile, 0.5, far);
  st.snail = s;
}

function shotFar(lt, st) {
  st.light = light('dawn');
  const u = lt / 3;
  // взгляд поверх травы из-за кончика лопуха: лейка — крошечная, далеко внизу
  camSet(st, [lerp(10.4, 10.0, u), 8.4, 0.9], [P_CAN[0], lerp(-2, -1, u), P_CAN[2]], 20, [P_CAN[0] - 8, 0, P_CAN[2]], 0.018);
  const s = snail({ x: 0, z: 0, hYaw: -0.15, lift: 0.1 });
  s.eyeL.len = s.eyeR.len = 1.55;
  s.eyeL.pitch = s.eyeR.pitch = 0.35;
  s.look = P_CAN;
  s.eyeL.lid = s.eyeR.lid = 0.35;
  st.snail = s;
}

function shotCard1(lt, st) { card(st, 2, 3, 2, lt, 3.0, 4.4); }
function shotCard2(lt, st) { card(st, 4, -1, 1, lt, 2.2, 5.0); }

function shotSetOff(lt, st) {
  st.light = mixLight(LIGHT.dawn, LIGHT.noon, seg(lt, 0, 4.3, E.lin) * 0.3);
  const d = seg(lt, 1.3, 4.3, E.lin) * 3.2;
  camSet(st, [lerp(5.5, 7.5, lt / 4.3), 4.6, 20], [lerp(2.5, 4.0, lt / 4.3), 2.3, 0], 34, [d + 0.5, 2.2, 0], 0.024);
  const s = snail({ x: d, z: 0 });
  // решимость: брови-веки домиком внутрь, кивок
  s.eyeL.lid = s.eyeR.lid = 0.3;
  s.eyeL.tilt = s.eyeR.tilt = -0.45;
  s.smile = 0.2;
  s.hPitch = spring(lt, 0.5, 0.25, 2.2, 5);
  s.look = [30, 2, 0];
  crawl(s, d, 1);
  st.snail = s;
}

// ---------------------------------------------------------------- сцена 2. Малина
function shotTimelapse(lt, st) {
  const k = seg(lt, 0, 4.5, E.lin);
  st.light = mixLight(mixLight(LIGHT.dawn, LIGHT.noon, 0.3), LIGHT.noon, k);
  // солнце пробегает по небу — тени метут по кадру
  const a = lerp(-0.9, 0.5, k);
  st.light.key = V.norm([Math.sin(a) * 0.9, 0.55 + 0.35 * Math.cos(a), -0.35]);
  st.flicker = 0.12;
  camSet(st, [29, 13, 36], [29, 0.5, 0], 38, [29, 0, 0], 0.02);
  // таймлапс: улитка ползёт скачками
  const d = lerp(10, 38.5, Math.floor(k * 27) / 27);
  const s = snail({ x: d, z: 0.2 * Math.sin(d * 0.3) });
  s.look = [60, 1, 0];
  crawl(s, d * 3, 1);
  st.snail = s;
}

function shotBerry(lt, st) {
  st.light = light('noon');
  camSet(st, [43.4, 3.4, 12.5], [43.4, 1.7, 0.4], 30, [42.6, 1.8, 0.4], 0.028);
  const d = lerp(38.5, 41.2, seg(lt, 0, 1.3, E.out));
  const s = snail({ x: d, z: 0 });
  crawl(s, d, 1 - seg(lt, 0.9, 1.3));
  const berry = [44.6, 1.1, 1.0];
  s.look = lookSeq(lt, [[0, [60, 2, 0]], [1.7, berry], [2.9, P_CAN], [3.5, berry], [3.9, P_CAN], [4.2, berry]]);
  const take = seg(lt, 1.7, 1.85, E.outBack);
  s.eyeL.len = s.eyeR.len = 1 + 0.3 * take + spring(lt, 1.85, 0.12, 3, 5);
  s.eyeL.lid = s.eyeR.lid = -0.3 * take;
  s.hYaw = 0.15 * take;
  s.mouthOpen = 0.25 * take * (1 - seg(lt, 2.3, 2.6));
  // решилась: хитрая улыбка, наклон к ягоде
  const sly = seg(lt, 4.5, 5.0, E.io);
  s.smile = lerp(0.8, 1.9, sly);
  s.eyeL.lid = s.eyeR.lid = lerp(s.eyeL.lid, 0.4, sly);
  s.eyeL.tilt = s.eyeR.tilt = 0.25 * sly;
  s.lean = 0.35 * seg(lt, 5.2, 5.9, E.io);
  s.hPitch = 0.25 * seg(lt, 5.2, 5.9, E.io);
  st.snail = s;
  st.berry = { p: berry, axis: [0.25, 0.3, 1.0], eaten: 0 };
}

function shotEat(lt, st) {
  st.light = light('noon');
  // камера с другой стороны тропы: ягода за головой, лицо и щёки видны целиком
  camSet(st, [45.6, 2.6, -6.0], [44.4, 2.3, 0.2], 30, [44.6, 2.6, -0.2], 0.03);
  const berry = [44.6, 1.1, 1.0];
  // десять укусов, каждый — на своём кадре
  const bites = Math.floor(clamp((lt - 0.3) / 0.36, 0, 10));
  const inBite = ((lt - 0.3) / 0.36) % 1;
  const chomp = lt > 0.3 && bites < 10 ? Math.sin(inBite * Math.PI) : 0;
  const s = snail({ x: 41.4, z: 0, lean: 0.35 + 0.2 * chomp, hPitch: 0.25 + 0.15 * chomp });
  s.mouthOpen = 0.6 * chomp;
  s.smile = 1.2;
  s.puff = bites / 10;
  s.look = berry;
  s.eyeL.lid = s.eyeR.lid = 0.25 + 0.3 * chomp;
  s.eyeL.pitch = 0.15 + 0.2 * chomp; s.eyeR.pitch = 0.15 + 0.22 * chomp;
  if (lt > 4.1) {
    // ик!
    const hic = seg(lt, 4.3, 4.45, E.outBack) * (1 - seg(lt, 4.5, 4.8));
    s.bodyY = 0.25 * hic; s.eyeL.lid = s.eyeR.lid = -0.3 * hic;
    s.mouthOpen = 0.3 * hic; s.lean = 0.1; s.hPitch = -0.1 * hic;
  }
  st.snail = s;
  st.berry = { p: berry, axis: [0.25, 0.3, 1.0], eaten: bites / 10 };
}

function shotSleep(lt, st) {
  st.light = mixLight(LIGHT.noon, LIGHT.sunset, seg(lt, 1.5, 4.0, E.lin) * 0.25);
  camSet(st, [lerp(45.4, 44.8, lt / 4), lerp(3.6, 3.2, lt / 4), lerp(11.5, 10.2, lt / 4)], [42.3, 1.8, 0.4], 30, [42.4, 1.8, 0.4], 0.028);
  const s = snail({ x: 41.4, z: 0, puff: 1 });
  const yawn = seg(lt, 0.3, 0.9) * (1 - seg(lt, 1.3, 1.8));
  s.mouthOpen = yawn; s.mouthW = 0.28; s.hPitch = -0.4 * yawn; s.lift = 0.2 * yawn;
  const drowse = seg(lt, 1.6, 3.2, E.io);
  s.eyeL.lid = s.eyeR.lid = Math.max(yawn, lerp(0.3, 1.0, drowse));
  s.eyeL.len = lerp(1, 0.35, seg(lt, 2.0, 3.4)); s.eyeR.len = lerp(1, 0.3, seg(lt, 2.3, 3.6));
  s.eyeL.pitch = s.eyeR.pitch = lerp(0.15, 1.1, drowse);
  s.lift = lerp(s.lift, -0.35, drowse);
  s.hPitch = lerp(s.hPitch, 0.35, drowse);
  const br = Math.sin(lt * 2.2) * drowse;
  s.puff = 1 + 0.12 * br;
  s.smile = 1.1;
  st.snail = s;
  st.berry = { p: [44.6, 1.1, 1.0], axis: [0.25, 0.3, 1.0], eaten: 1 };
}

// ---------------------------------------------------------------- сцена 3. Закат
function shotSunsetWake(lt, st) {
  st.light = light('sunset');
  // на испуге камера резко отскакивает назад, чтобы глаза-«антенны» остались в кадре
  const jolt = seg(lt, 2.8, 3.0, E.out);
  camSet(st, V.lerp([44.8, 3.2, 10.2], [45.5, 4.3, 13.4], jolt), V.lerp([42.3, 1.8, 0.4], [42.4, 2.7, 0.4], jolt), 30, [42.4, 2.0, 0.4], 0.028);
  const s = snail({ x: 41.4, z: 0, puff: 0.6 + 0.08 * Math.sin(lt * 2.2) });
  s.eyeL.len = 0.35; s.eyeR.len = 0.3;
  s.eyeL.pitch = s.eyeR.pitch = 1.1;
  s.lift = -0.35; s.hPitch = 0.35;
  s.eyeL.lid = 1; s.eyeR.lid = 1;
  s.smile = 1.1;
  // далёкий сверчок — один глаз приоткрывается
  const one = seg(lt, 1.4, 1.8, E.io);
  s.eyeR.lid = lerp(1, 0.45, one);
  s.eyeR.len = lerp(0.3, 0.8, seg(lt, 1.9, 2.5, E.out));
  s.eyeR.pitch = lerp(1.1, 0.2, seg(lt, 1.9, 2.5, E.out));
  s.look = lt > 2.2 ? [90, 3, -10] : null;
  // ПАНИКА
  const pan = seg(lt, 2.8, 2.98, E.outBack);
  if (lt > 2.8) {
    s.eyeL.len = s.eyeR.len = 1.5 + spring(lt, 2.98, 0.2, 3.5, 5);
    s.eyeL.pitch = s.eyeR.pitch = -0.1 + spring(lt, 2.98, 0.3, 3, 5);
    s.eyeL.lid = s.eyeR.lid = -0.45;
    s.pupil = 0.9;
    s.mouthOpen = 1.0 * pan; s.mouthW = 0.14; s.smile = -0.3;
    s.lift = lerp(-0.35, 0.45, pan); s.hPitch = lerp(0.35, -0.15, pan);
    s.len = 1 + 0.15 * pan;
    s.bodyY = 0.5 * Math.sin(clamp((lt - 2.8) / 0.35, 0, 1) * Math.PI);
    s.shellBob = 0.6 * Math.sin(clamp((lt - 2.85) / 0.4, 0, 1) * Math.PI) + spring(lt, 3.25, 0.2, 3, 6);
    s.puff = 0.3;
    s.look = [80, 2, -8];
  }
  st.snail = s;
  st.berry = { p: [44.6, 1.1, 1.0], axis: [0.25, 0.3, 1.0], eaten: 1 };
}

function shotRace(lt, st) {
  st.light = light('sunset');
  const x = lerp(41.4, 42.3, lt / 3);
  camSet(st, [x + 1.6, 1.7, 6.4], [x + 1.8, 1.6, 0], 30, [x + 1.4, 1.6, 0], 0.035);
  const s = snail({ x, z: 0, len: 1.28, squash: 0.82 });
  s.eyeL.pitch = -0.95 + 0.1 * Math.sin(lt * 21); s.eyeR.pitch = -1.0 + 0.1 * Math.sin(lt * 23 + 1);
  s.eyeL.len = s.eyeR.len = 1.1;
  s.eyeL.lid = s.eyeR.lid = 0.25; s.eyeL.tilt = s.eyeR.tilt = -0.55;
  s.smile = -0.6; s.mouthOpen = 0.15; s.mouthW = 0.24;
  s.lean = 0.35; s.hPitch = 0.15;
  s.look = [60, 1.5, 0];
  crawl(s, lt * 7, 1.6);
  st.snail = s;
  st.berry = { p: [44.6, 1.1, 1.0], axis: [0.25, 0.3, 1.0], eaten: 1 };
}

function shotReveal(lt, st) {
  st.light = light('sunset');
  camSet(st, [44, 15, 31], [44, 0.5, 0], 36, [43, 1, 0], 0.016);
  const s = snail({ x: 42.3 + 0.2 * seg(lt, 0, 0.8, E.lin), z: 0, len: 1.28, squash: 0.82 });
  const stop = seg(lt, 0.9, 1.3, E.io);
  s.len = lerp(1.28, 1.0, stop); s.squash = lerp(0.82, 1.0, stop);
  s.eyeL.pitch = lerp(-0.95, 0.15, stop); s.eyeR.pitch = lerp(-1.0, 0.15, stop);
  crawl(s, lt * 7 * (1 - stop), 1.6);
  // смотрит в камеру: «ну вот»
  s.look = lt > 1.4 && lt < 2.3 ? V.add(st.cam.pos, [0, -3, 0]) : [70, -2, -2];
  s.eyeL.lid = s.eyeR.lid = lerp(0.25, 0.45, stop);
  s.eyeL.tilt = s.eyeR.tilt = lerp(-0.55, 0.3, stop);
  s.smile = lerp(-0.6, -0.4, stop);
  st.snail = s;
  st.berry = { p: [44.6, 1.1, 1.0], axis: [0.25, 0.3, 1.0], eaten: 1 };
}

function shotIdea(lt, st) {
  st.light = mixLight(LIGHT.sunset, LIGHT.dusk, seg(lt, 0, 3, E.lin) * 0.3);
  const x = lerp(42.5, 45.8, seg(lt, 0, 1.5, E.io));
  // три четверти спереди, от края тропы: видно, как загорается идея
  camSet(st, [x + 4.6, 3.3, 4.2], [x + 0.9, 2.75, -0.3], 32, [x + 2.1, 2.6, 0], 0.026);
  const s = snail({ x, z: 0 });
  crawl(s, x * 2, 1 - seg(lt, 1.2, 1.5));
  s.look = [110, -12, 0];
  const idea = seg(lt, 1.4, 1.6, E.outBack);
  s.eyeL.len = s.eyeR.len = 1 + 0.3 * idea;
  s.eyeL.lid = s.eyeR.lid = lerp(0.2, 0.45, seg(lt, 1.7, 1.9));
  s.eyeL.tilt = s.eyeR.tilt = -0.4 * seg(lt, 1.7, 1.9);
  s.smile = lerp(0.3, 1.7, seg(lt, 1.7, 1.9));
  s.hPitch = spring(lt, 1.9, 0.3, 2.5, 5);
  // прячется в раковину и раскачивается
  s.retract = seg(lt, 2.2, 2.4, E.in);
  s.shellRoll = 0;
  s.shellSpin = 0.12 * Math.sin((lt - 2.4) * 9) * seg(lt, 2.4, 2.6) - seg(lt, 2.75, 3.0, E.in) * 0.6;
  st.snail = s;
  st.berry = { p: [44.6, 1.1, 1.0], axis: [0.25, 0.3, 1.0], eaten: 1 };
}

function shotRoll(lt, st) {
  st.light = mixLight(mixLight(LIGHT.sunset, LIGHT.dusk, 0.3), LIGHT.dusk, seg(lt, 0, 7, E.lin));
  const tr = lt + 0.3;
  const c = ROLL.at(tr);
  const cl = ROLL.at(Math.max(0, tr - 0.45));
  const cp = V.lerp(c, cl, 0.5);
  camSet(st, [cp[0] - 3, cp[1] + 5.5, cp[2] + 21], [cp[0] + 3, cp[1] - 1, cp[2]], 34, c, 0.02);
  // сжатие при каждом ударе
  let sq = 0;
  for (const ti of ROLL.impacts) sq += spring(tr, ti, 0.45, 3.5, 8) * (tr > ti ? 1 : 0);
  const s = snail({ retract: 1, x: c[0], z: c[2], shellPos: c, shellAxes: shellAxesSpin(ROLL.spin(tr), 0.05 * Math.sin(tr * 5)), shellSquash: Math.max(0, sq) });
  st.snail = s;
  st.mush = Math.max(0, spring(tr, 3.55, 0.6, 3.2, 5)) + (tr > 3.5 && tr < 3.6 ? 0.5 : 0);
}

// ---------------------------------------------------------------- сцена 4. Опоздала
function venueSnail(over) {
  const s = snail(Object.assign({ x: SHELL_STOP[0], z: SHELL_STOP[2], yaw: 0.12 }, over));
  return s;
}
function shotVenue(lt, st) {
  st.light = light('night');
  st.exposure = 1.15;
  camSet(st, [111, -10.2, 25], [125, -13.5, -3], 38, [121, -14, 0], 0.02);
  // раковина докатывается
  const tr = ROLL.end - 1.4 + Math.min(lt, 1.4);
  const c = ROLL.at(tr);
  const s = snail({ retract: 1, x: c[0], z: c[2], shellPos: c, shellAxes: shellAxesSpin(ROLL.spin(tr) + spring(lt, 1.4, 0.15, 1.6, 3)) });
  st.snail = s;
  // зрители расходятся
  st.bugs = [0, 1, 2].map((i) => {
    const w = lt * 1.6 + i * 0.3;
    return [lerp(124 + i * 1.5, 133 + i * 2, lt / 5.5), -16, lerp(3 + i * 2.2, 11 + i * 2.5, lt / 5.5), 0.9, 0.95 + 0.1 * i, w, 0];
  });
  // сверчки уходят к лейке со скрипками под мышкой
  st.crickets = [0, 1, 2].map((i) => {
    const x = lerp(129 + i * 2.2, 139 + i * 1.5, lt / 5.5), z = lerp(-7 - i, -12 - i, lt / 5.5);
    return cricket({ x, z, yaw: -0.5, scale: 0.95 - i * 0.08, walk: lt * 1.4 + i * 0.4, bob: 0.08 * Math.abs(Math.sin(lt * 4.4 + i)), antPhase: lt * 3, violin: true, mode: 'stand' });
  });
  // гаснут фонарики-светлячки
  const offs = [1.4, 2.2, 2.9, 3.5, 4.0, 4.4];
  st.flies = fireflies(lt, 6, (i) => 1 - seg(lt, offs[i], offs[i] + 0.25, E.lin));
}

function shotSad(lt, st) {
  st.light = light('night');
  st.exposure = 1.25;
  camSet(st, [123.2, -13.1, 6.8], [119.4, -14.0, 0.5], 28, [119.9, -13.8, 0.6], 0.03);
  const s = venueSnail({});
  s.retract = 1 - seg(lt, 0.3, 0.8, E.out);
  // головокружение: зрачки ходят по кругу, стебельки качаются
  const dz = 1 - seg(lt, 1.6, 2.2);
  const a = lt * 11;
  const hc = [120.3, -13.6, 0.8];
  s.look = dz > 0.05 ? V.add(hc, [Math.cos(a) * 1.5, Math.sin(a) * 1.5, 2]) : [128, -15.5, -3];
  s.eyeL.pitch = 0.15 + 0.35 * Math.sin(lt * 7) * dz; s.eyeR.pitch = 0.15 + 0.35 * Math.sin(lt * 7 + 2) * dz;
  s.hRoll = 0.15 * Math.sin(lt * 5) * dz;
  s.eyeL.len = seg(lt, 0.6, 1.0, E.outBack); s.eyeR.len = seg(lt, 0.7, 1.1, E.outBack);
  s.smile = lerp(0.3, 0.8, seg(lt, 2.2, 2.5));
  s.eyeL.lid = s.eyeR.lid = lerp(0.3, -0.2, seg(lt, 2.2, 2.4));
  // понимание: сцена пуста
  const sad = seg(lt, 2.9, 3.6, E.io);
  s.eyeL.lid = lerp(s.eyeL.lid, 0.5, sad); s.eyeR.lid = lerp(s.eyeR.lid, 0.5, seg(lt, 3.1, 3.8));
  s.eyeL.tilt = s.eyeR.tilt = 0.55 * sad;
  s.eyeL.pitch = lerp(s.eyeL.pitch, 1.05, seg(lt, 3.3, 4.0, E.io));
  s.eyeR.pitch = lerp(s.eyeR.pitch, 1.1, seg(lt, 3.7, 4.4, E.io));
  s.eyeL.len = lerp(s.eyeL.len, 0.75, seg(lt, 3.3, 4.0)); s.eyeR.len = lerp(s.eyeR.len, 0.72, seg(lt, 3.7, 4.4));
  s.smile = lerp(s.smile, -1.3, sad);
  s.lift = -0.2 * sad; s.hPitch = 0.2 * sad;
  // вздох и медленно — в раковину
  s.puff = 0.25 * Math.sin(clamp((lt - 4.3) / 0.8, 0, 1) * Math.PI);
  s.retract = Math.max(s.retract, seg(lt, 5.0, 6.0, E.io));
  st.snail = s;
  st.flies = [[137, -11, -12, 0.35]];
}

function shotLonely(lt, st) {
  st.light = light('night');
  st.exposure = 1.2;
  camSet(st, [118.5, -9.2, 21], [121.5, -12.5, -2], 34, [118.6, -14, 0.6], 0.02);
  const s = venueSnail({ retract: 1 });
  st.snail = s;
  st.flies = [[138, -9.5, -14, 0.5 + 0.3 * Math.sin(lt * 3)]];
}

// ---------------------------------------------------------------- сцена 5. Раковина
const SHELL_TOP = () => groundH(SHELL_STOP[0], SHELL_STOP[2]) + 1.95 + 1.75;
function littleCricket(lt, st, playFrom) {
  const topY = SHELL_TOP();
  return cricket({ x: 118.1, z: 0.9, y: topY - 0.05, yaw: 0.35, scale: 0.72, mode: 'sit', antPhase: lt * 2.5 });
}
function shotLittle(lt, st) {
  st.light = light('night');
  st.exposure = 1.25;
  camSet(st, [124.2, -11.8, 9.8], [118.9, -12.6, 0.3], 30, [118.4, -12.2, 0.6], 0.028);
  const s = venueSnail({ retract: 1 });
  // резонанс раковины после каждой фразы
  const glowA = seg(lt, 3.0, 3.4) * (1 - seg(lt, 4.3, 5.0) * 0.6);
  const glowB = seg(lt, 5.0, 5.4);
  s.glow = 0.45 * glowA + 0.8 * glowB;
  // подглядывает одним глазом
  if (lt > 6.4) {
    s.retract = lerp(1, 0.62, seg(lt, 6.4, 6.9, E.out));
    s.eyeR.len = 0.55; s.eyeL.len = 0.2; s.eyeR.lid = 0.3; s.look = [118.2, -10.5, 1];
  }
  st.snail = s;
  const topY = SHELL_TOP();
  let c;
  if (lt < 2.2) {
    // прыгает к раковине
    const k = lt / 2.2;
    const hopN = 3, hp = (k * hopN) % 1;
    c = cricket({ x: lerp(128, 118.4, k), z: lerp(2.5, 0.9, k), yaw: Math.PI * 0.95, scale: 0.72, bob: 1.4 * Math.sin(hp * Math.PI), hop: Math.sin(hp * Math.PI), antPhase: lt * 4, mode: 'stand' });
    if (k > 0.8) { c.y = lerp(groundH(c.x, c.z), topY - 0.05, seg(k, 0.8, 1)); }
  } else {
    c = littleCricket(lt, st);
    c.yaw = lerp(Math.PI * 0.95, 0.35, seg(lt, 2.2, 2.6));
    const playing = (lt > 3.0 && lt < 4.2) || (lt > 5.0 && lt < 5.9);
    if (playing || (lt > 2.7 && lt < 6.1)) c.mode = 'violin';
    c.bow = 0.5 + 0.45 * Math.sin((lt - 3.0) * Math.PI * 2.4);
    // замер: усики торчком, глаза круглые, смотрит вниз, на раковину
    const wow = seg(lt, 4.3, 4.5, E.outBack) * (1 - seg(lt, 6.0, 6.4) * 0.5);
    c.antDroop = -0.35 * wow;
    c.headTilt = 0.45 * wow;
    c.lid = 0;
    c.pupil = 0.72 - 0.05 * wow;
    c.look = lt > 4.3 ? [118.4, topY - 2, 0.6] : null;
    if (lt > 6.1) { c.mode = 'stand'; c.armWave = 0.4 + 0.25 * Math.sin(lt * 14); c.headTilt = 0.35; c.look = [119.4, -13.5, 1.5]; }
  }
  st.crickets = [c];
  st.flies = [[136, -11, -10, 0.3]];
}

function orchestra(lt, beatT0, playing) {
  const topY = SHELL_TOP();
  const beat = Math.max(0, (lt - beatT0) / 0.555);
  const bowPh = (i) => 0.5 + 0.45 * Math.sin(beat * Math.PI + i * 0.9);
  const little = cricket({ x: 118.1, z: 0.9, y: topY - 0.05, yaw: 0.35, scale: 0.72, mode: playing ? 'violin' : 'sit', antPhase: lt * 2.5, bow: bowPh(0), sway: 0.08 * Math.sin(beat * Math.PI / 1.5) });
  if (playing) little.mode = 'violin';
  const c1 = cricket({ x: 115.2, z: -1.6, yaw: 0.2, scale: 1.0, mode: playing ? 'violin' : 'stand', bow: bowPh(1), antPhase: lt * 2, sway: 0.06 * Math.sin(beat * Math.PI / 1.5 + 1) });
  const c2 = cricket({ x: 121.5, z: -2.2, yaw: -0.3 + Math.PI * 0.0, scale: 0.9, mode: playing ? 'violin' : 'stand', bow: bowPh(2), antPhase: lt * 2.2, sway: 0.06 * Math.sin(beat * Math.PI / 1.5 + 2) });
  const cond = cricket({ x: 123.5, z: 2.6, yaw: Math.PI + 0.35, scale: 1.05, mode: 'conduct', baton: true, violin: false, beat, antPhase: lt * 2 });
  return [little, c1, c2, cond];
}

function shotReturn(lt, st) {
  st.light = light('night');
  st.exposure = 1.2;
  camSet(st, [116.5, -9.8, 23], [121, -13.2, -1], 34, [119, -13.5, 0], 0.02);
  const s = venueSnail({});
  s.retract = lerp(0.62, 0, seg(lt, 1.6, 2.2, E.out));
  s.look = [118.2, -10, 0.9];
  s.eyeL.len = s.eyeR.len = seg(lt, 1.9, 2.4, E.outBack);
  s.eyeL.lid = s.eyeR.lid = -0.25;
  s.glow = 0.35;
  st.snail = s;
  const orch = orchestra(lt, 99, false);
  // остальные возвращаются прыжками
  const arrive = (c, i, t0) => {
    const k = seg(lt, t0, t0 + 1.4, E.lin);
    const hp = (k * 3) % 1;
    const from = [139 + i * 2, -12 - i];
    c.x = lerp(from[0], c.x, E.out(k)); c.z = lerp(from[1], c.z, E.out(k));
    if (k < 1) { c.bob = 1.2 * Math.sin(hp * Math.PI); c.hop = Math.sin(hp * Math.PI); c.yaw = Math.PI * 0.9; c.mode = 'stand'; }
    if (k <= 0) c.on = 0;
  };
  arrive(orch[1], 0, 0.3); arrive(orch[2], 1, 0.7); arrive(orch[3], 2, 1.1);
  orch[0].armWave = lt < 1.2 ? 0.5 + 0.3 * Math.sin(lt * 15) : 0;
  orch[0].mode = 'stand';
  st.crickets = orch;
  const ons = [0.6, 1.0, 1.3, 1.6, 1.9, 2.2, 2.5, 2.8];
  st.flies = fireflies(lt, 8, (i) => seg(lt, ons[i], ons[i] + 0.2, E.lin));
}

function concertCommon(lt, st, t0) {
  st.light = light('night');
  st.exposure = 1.2;
  const beat = (lt + t0) / 0.555;
  const s = venueSnail({});
  s.look = [118.2, -10, 0.9];
  s.glow = 0.75 + 0.2 * Math.max(0, Math.sin(beat * Math.PI * 2 / 3));
  s.eyeL.lid = s.eyeR.lid = 0.45;
  s.smile = 1.7;
  s.eyeL.pitch = 0.1 + 0.25 * Math.sin(beat * Math.PI * 2 / 3);
  s.eyeR.pitch = 0.1 + 0.25 * Math.sin(beat * Math.PI * 2 / 3 + 0.5);
  s.hRoll = 0.08 * Math.sin(beat * Math.PI * 2 / 3);
  st.snail = s;
  st.crickets = orchestra(lt + t0, 0, true);
  st.flies = fireflies(lt + t0, 8, 1);
  return s;
}
function shotConcert(lt, st) {
  concertCommon(lt, st, 0);
  camSet(st, [124.5, -11.4, 11.5], [118.6, -12.4, -0.3], 32, [118.5, -12, 0.4], 0.024);
}
function shotBliss(lt, st) {
  const s = concertCommon(lt, st, 4.5);
  camSet(st, [121.9, -12.7, 5.0], [119.5, -12.8, 0.5], 26, [119.7, -12.9, 0.7], 0.034);
  s.eyeL.lid = s.eyeR.lid = 0.62;
  s.smile = 2.0;
}
function shotCrane(lt, st) {
  concertCommon(lt, st, 8.5);
  const u = E.sine(clamp(lt / 4.5, 0, 1));
  camSet(st, V.lerp([121, -11, 12], [104, 4, 58], u), V.lerp([119, -13, 0], [124, -12, -6], u), lerp(32, 40, u), V.lerp([119, -13, 0.5], [121, -13, 0], u), lerp(0.024, 0.012, u));
  st.fade = 1 - seg(lt, 3.4, 4.5, E.sine);
}
function shotEnd(lt, st) {
  if (lt < 3.2) card(st, 5, 6, 3, lt, 3.2, 5.4);
  else card(st, 7, -1, 0, lt - 3.2, 1.8, 7.0);
}

// ---------------------------------------------------------------- монтажный лист
const SHOTS = [
  [0.0, 5.5, shotOpening], [5.5, 10.0, shotTitle], [10.0, 17.0, shotWake], [17.0, 21.0, shotPoster],
  [21.0, 25.0, shotJoy], [25.0, 28.0, shotFar], [28.0, 31.0, shotCard1], [31.0, 33.2, shotCard2],
  [33.2, 37.5, shotSetOff],
  [37.5, 42.0, shotTimelapse], [42.0, 48.0, shotBerry], [48.0, 53.0, shotEat], [53.0, 57.0, shotSleep],
  [57.0, 61.5, shotSunsetWake], [61.5, 64.5, shotRace], [64.5, 67.0, shotReveal], [67.0, 70.0, shotIdea], [70.0, 77.0, shotRoll],
  [77.0, 82.5, shotVenue], [82.5, 88.5, shotSad], [88.5, 91.0, shotLonely],
  [91.0, 98.5, shotLittle], [98.5, 102.0, shotReturn], [102.0, 106.5, shotConcert], [106.5, 110.5, shotBliss],
  [110.5, 115.0, shotCrane], [115.0, 120.0, shotEnd],
];
const DURATION = 120;
const SCENES = [
  { t: 0, name: 'Утро' }, { t: 37.5, name: 'Малина' }, { t: 57, name: 'Закат' }, { t: 77, name: 'Опоздала' }, { t: 91, name: 'Раковина' },
];
// кадр для обложки: концерт на раковине
const COVER_T = 104.2;

function shotIndex(t) {
  for (let i = SHOTS.length - 1; i >= 0; i--) if (t >= SHOTS[i][0]) return i;
  return 0;
}
function evaluate(t) {
  const st = blankState();
  const i = shotIndex(t);
  const [t0, t1, fn] = SHOTS[i];
  fn(Math.min(t, t1) - t0, st);
  st.shot = i;
  return st;
}
