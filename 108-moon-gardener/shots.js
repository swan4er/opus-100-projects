'use strict';
/* ==========================================================================
   Садовник на Луне · раскадровка и сборка кадра
   24 плана: у каждого своя камера (кран, панорама, телевик, крупный план)
   и свои поправки к свету. Кадр собирается слоями в G-буфер, потом свет,
   тени, свечение, титры, дизеринг.
   ========================================================================== */

/* ---------- Камеры: ключи по времени плана ---------- */
function camKeys(keys) { // keys: [[lt, {x,y,z,f,yaw,pitch}, ease], ...]
  const names = ['x', 'y', 'z', 'f', 'yaw', 'pitch'];
  const tr = {};
  for (const n of names) {
    tr[n] = new Track(keys[0][1][n] === undefined ? 0 : keys[0][1][n]);
    for (const k of keys) if (k[1][n] !== undefined) tr[n].add(k[0], k[1][n], k[2] || 'io');
    tr[n].sort();
  }
  return (lt) => ({ x: tr.x.at(lt), y: tr.y.at(lt), z: tr.z.at(lt), f: tr.f.at(lt), yaw: tr.yaw.at(lt), pitch: tr.pitch.at(lt) });
}
/* Камера, которая держит робота в кадре (с запаздыванием) */
function follow(base, lag, fx, fz) {
  return (lt, t) => {
    const c = base(lt);
    const tl = t - (lag || 0);
    return Object.assign(c, { x: c.x + RB.x.at(tl) * (fx === undefined ? 1 : fx), z: c.z + RB.z.at(tl) * (fz === undefined ? 1 : fz) });
  };
}

const E_WIDE = { az: 0.3, el: 0.14, rad: 0.026 };
const SHOTS = [
  // 1 · Земля над горизонтом: кран поднимается из-за вала кратера
  { t0: 0, t1: 12, cam: camKeys([[0, { x: -1.2, y: 0.32, z: -9.5, f: 380, yaw: 0.045, pitch: 0.3 }], [1.2, { y: 0.32, pitch: 0.295 }], [9.2, { y: 2.05, pitch: 0.0 }], [12, { y: 2.2, pitch: -0.025 }, 'l']]), rim: true, title: true, earth: { az: 0.3, el: 0.14, rad: 0.03 } },
  // 2 · Док: робот спит и просыпается
  { t0: 12, t1: 17.1, cam: camKeys([[0, { x: -2.75, y: 0.28, z: 0.55, f: 300, yaw: -0.16, pitch: 0.02 }], [5.1, { x: -2.78, z: 0.62 }, 'l']]) },
  // 3 · Дорога к цветку: общий план с проводкой
  { t0: 17.1, t1: 22, cam: follow(camKeys([[0, { x: 0.35, y: 0.95, z: -4.9, f: 300, yaw: 0.02, pitch: -0.12 }], [4.9, { x: 0.25, y: 0.9, z: -4.7 }]]), 0.25, 0.7, 0.3) },
  // 4 · Двое: замер, прыжок радости, полив, пустая лейка
  { t0: 22, t1: 23.35, cam: camKeys([[0, { x: -0.06, y: 0.27, z: -1.3, f: 300, yaw: -0.02, pitch: -0.04 }], [1.35, { x: -0.05, z: -1.24 }]]) },
  // 4б · вставка: бутон перерос старую зарубку — ладонь, палочка, новая метка
  { t0: 23.35, t1: 24.55, cam: camKeys([[0, { x: 0.045, y: 0.18, z: -0.32, f: 300, yaw: 0.0, pitch: 0.0 }], [1.2, { x: 0.05, y: 0.18, z: -0.29 }]]) },
  { t0: 24.55, t1: 30, cam: camKeys([[0, { x: -0.06, y: 0.28, z: -1.35, f: 300, yaw: -0.02, pitch: -0.03 }], [0.15, { pitch: -0.03 }], [0.4, { pitch: 0.07 }, 'o'], [0.75, { pitch: 0.07 }], [1.25, { pitch: -0.03 }], [5.45, { x: -0.04, y: 0.27, z: -1.22 }]]) },
  // 5 · Крупно: заглядывает в лейку
  { t0: 30, t1: 33, cam: camKeys([[0, { x: -0.08, y: 0.36, z: -0.62, f: 300, yaw: 0.0, pitch: 0.02 }], [3, { x: -0.09, y: 0.35, z: -0.58 }]]) },
  // 6 · Земля над горизонтом, телевик: робот садится рядом с бутоном
  { t0: 33, t1: 38, cam: camKeys([[0, { x: -0.6, y: 0.2, z: -24, f: 2100, yaw: 0.037, pitch: 0.0155 }], [5, { x: -0.62, y: 0.2, z: -23.6 }]]), earth: { az: 0.058, el: 0.037, rad: 0.0166 } },
  // 7 · Крупно глаз: в линзе отражаются первые метеоры
  { t0: 38, t1: 41, cam: 'eye', eyeDist: 0.32, lensRefl: true },
  // 8 · Общий: ливень над горами, робот вскакивает и мечется
  { t0: 41, t1: 43.1, cam: camKeys([[0, { x: -0.9, y: 1.05, z: -7.8, f: 300, yaw: 0.1, pitch: -0.055 }], [2.1, { x: -0.95, y: 1.08, z: -7.6 }]]) },
  // 8б · средний: мечется, вздрагивает, решает бежать
  { t0: 43.1, t1: 46, cam: camKeys([[0, { x: 0.05, y: 0.36, z: -1.75, f: 300, yaw: -0.01, pitch: 0.02 }], [2.9, { x: -0.02, y: 0.36, z: -1.6 }]]) },
  // 9 · Бегство к модулю: проводка
  { t0: 46, t1: 50, cam: follow(camKeys([[0, { x: 0.55, y: 0.42, z: -2.7, f: 300, yaw: 0.0, pitch: -0.04 }], [4, { x: 0.45, y: 0.42, z: -2.6 }]]), 0.18, 1, 1) },
  // 10 · Крупно: оглядывается на бутон
  { t0: 50, t1: 52, cam: 'head', headDist: 0.62, headOff: [0.12, 0.0] },
  // 11 · Бутон один под ливнем (взгляд робота)
  { t0: 52, t1: 54, cam: camKeys([[0, { x: -0.55, y: 0.2, z: -1.6, f: 420, yaw: 0.33, pitch: -0.035 }], [2, { f: 470, yaw: 0.335 }, 'l']]) },
  // 12 · Крупно: решимость
  { t0: 54, t1: 56.9, cam: 'head', headDist: 0.52, headOff: [0.02, -0.01] },
  // 13 · Обратно к цветку: нырок
  { t0: 56.9, t1: 61, cam: camKeys([[0, { x: -1.3, y: 0.55, z: -3.4, f: 300, yaw: 0.02, pitch: -0.07 }], [2.2, { x: -0.55, y: 0.5, z: -3.0 }], [4.1, { x: -0.35, y: 0.45, z: -2.6 }]]) },
  // 14 · ГЕРОЙ: щит под звездопадом, низкий ракурс, Земля в небе
  { t0: 61, t1: 66, cam: camKeys([[0, { x: 0.12, y: 0.08, z: -1.85, f: 470, yaw: 0.06, pitch: 0.12 }], [5, { x: 0.1, y: 0.08, z: -1.7 }]]), earth: { az: 0.215, el: 0.235, rad: 0.024 } },
  // 15 · Внутри укрытия: бутон в свете глаза
  { t0: 66, t1: 69, cam: camKeys([[0, { x: 0.02, y: 0.09, z: -0.5, f: 300, yaw: 0.0, pitch: 0.13 }], [3, { x: 0.02, y: 0.09, z: -0.45 }]]) },
  // 16 · Большой метеор
  { t0: 69, t1: 70.45, cam: camKeys([[0, { x: -0.3, y: 0.95, z: -7.2, f: 280, yaw: 0.06, pitch: -0.02 }], [1.45, { x: -0.3, y: 0.95, z: -7.0 }]]) },
  // 17 · Тишина после
  { t0: 70.45, t1: 76, cam: camKeys([[0, { x: 0.55, y: 0.36, z: -2.3, f: 300, yaw: 0.0, pitch: -0.035 }], [5.55, { x: 0.45, y: 0.33, z: -1.85 }]]) },
  // 18 · Крупно: тёмный глаз оживает
  { t0: 76, t1: 80, cam: 'eye', eyeDist: 0.3, lensRefl: true, dis: 0.9 },
  // 19 · Распрямляется, бутон цел, голубое сияние
  { t0: 80, t1: 84, cam: camKeys([[0, { x: 0.25, y: 0.33, z: -1.75, f: 300, yaw: 0.0, pitch: -0.03 }], [4, { x: 0.35, y: 0.33, z: -1.7 }]]) },
  // 20 · Лёд из кометы
  { t0: 84, t1: 88.95, cam: follow(camKeys([[0, { x: 0.3, y: 0.42, z: -2.3, f: 300, yaw: 0.0, pitch: -0.05 }], [5, { x: 0.25, y: 0.42, z: -2.2 }]]), 0.3, 0.8, 0.5) },
  // 21 · Полив; на левом горизонте разгорается корона
  { t0: 88.95, t1: 93, cam: camKeys([[0, { x: -0.1, y: 0.3, z: -1.4, f: 300, yaw: -0.03, pitch: -0.035 }], [4.05, { x: -0.14, y: 0.3, z: -1.3 }]]) },
  // 22 · Восход
  { t0: 93, t1: 98, cam: camKeys([[0, { x: -1.05, y: 0.38, z: -3.1, f: 300, yaw: 0.43, pitch: -0.02 }], [5, { x: -1.0, y: 0.42, z: -2.9 }]]), dis: 0.7 },
  // 23 · Цветок раскрывается
  { t0: 98, t1: 100.9, cam: camKeys([[0, { x: 0.045, y: 0.16, z: -0.5, f: 300, yaw: 0.0, pitch: 0.0 }], [2.9, { x: 0.04, y: 0.165, z: -0.43 }]]) },
  // 23б · реакция: радостный прищур над раскрытым цветком
  { t0: 100.9, t1: 103, cam: camKeys([[0, { x: -0.03, y: 0.28, z: -1.2, f: 380, yaw: 0.0, pitch: 0.025 }], [2.1, { x: -0.03, y: 0.28, z: -1.12 }]]) },
  // 24 · Финал: Земля над горизонтом
  { t0: 103, t1: DURATION, dis: 0.9, cam: camKeys([[0, { x: -0.6, y: 0.2, z: -24, f: 2100, yaw: 0.037, pitch: 0.0155 }], [5, { y: 0.3, pitch: 0.019 }]]), earth: { az: 0.058, el: 0.04, rad: 0.0166 }, end: true, ridgeShade: true },
];
function shotAt(t) {
  for (let i = SHOTS.length - 1; i >= 0; i--) if (t >= SHOTS[i].t0) return i;
  return 0;
}

/* Камеры крупных планов строятся от положения головы в момент t */
const PTMP = robotPose();
function headCam(sh, t, lt) {
  robotAt(t, PTMP);
  // прогон рига для координат головы
  TG = { w: 1, h: 1, data: new Uint8Array(1) };
  drawRobot([1, 0, 0, -1, 0, 0], 0, PTMP, 1);
  TG = null;
  const hx = PTMP.x + ROBOT_OUT.headLX, hy = ROBOT_OUT.headLY;
  const ex = PTMP.x + ROBOT_OUT.eyeLX, ey = ROBOT_OUT.eyeLY;
  if (sh.cam === 'eye') {
    const d = sh.eyeDist - lt * 0.012;
    return { x: ex + 0.005, y: ey, z: PTMP.z - d, f: 300, yaw: 0, pitch: 0 };
  }
  const o = sh.headOff || [0, 0];
  return { x: hx + o[0], y: hy + o[1], z: PTMP.z - sh.headDist + lt * 0.01, f: 300, yaw: 0, pitch: 0 };
}

/* ---------- Тряска от ударов ---------- */
function shakeAt(t) {
  let a = 0;
  for (let k = 0; k < IMPACTS.length; k++) {
    const im = IMPACTS[k];
    const dt = t - im.t;
    if (dt < 0 || dt > 1.5) continue;
    const d = hyp(im.x, im.z);
    const s = im.big ? 6 : im.near ? clamp(5 / (d + 1), 0, 2.5) * im.size : 0;
    a += s * Math.exp(-dt * 5);
  }
  return [a * (vnoise(t * 30, 1, 3) - 0.5), a * (vnoise(t * 30, 7, 4) - 0.5)];
}

/* ---------- Окклюдеры тени ---------- */
const OCC_ROBOT = makeOcc(112, 128), OCC_LANDER = makeOcc(192, 128), OCC_FLOWER = makeOcc(20, 24);

/* ---------- Сборка одного плана в COL ---------- */
const MT = mat(0, 0, 0, { flags: 0 });            // временный «светящийся» материал
const MP = mat(0.5, 0.5, 0.5, { flags: F_LIT });  // временный материал частиц
const M_RIM = mat(0.5, 0.5, 0.5, { flags: F_LIT | F_REGO });
const ROCKS = [];
function buildRocks() {
  const R = mulberry(99);
  const add = (x, z, r) => ROCKS.push({ x, z, r, seed: R() * 10, alb: 0.42 + R() * 0.16 });
  add(-1.3, 0.9, 0.12); add(0.85, 0.55, 0.07); add(1.9, -0.3, 0.16); add(-5.2, 5.5, 0.35); add(4.5, 6, 0.45); add(-8.5, 11, 0.6);
  add(2.8, 3.4, 0.2); add(-2.2, -0.9, 0.09); add(0.5, -0.8, 0.05); add(-0.6, 0.6, 0.05); add(6.5, 2.5, 0.25); add(-4.1, 0.2, 0.14);
  for (let n = 0; n < 40; n++) { const z = 2 + R() * 40, x = (R() - 0.5) * (12 + z * 1.4); if (hyp(x, z) > 3) add(x, z, 0.05 + R() * R() * (0.3 + z * 0.02)); }
}

function renderShot(t, idx, target) {
  const sh = SHOTS[idx];
  const lt = t - sh.t0;
  // камера
  let c = typeof sh.cam === 'string' ? headCam(sh, t, lt) : sh.cam(lt, t);
  const shk = shakeAt(t);
  c = Object.assign({}, c);
  c.yaw += shk[0] / c.f; c.pitch += shk[1] / c.f;
  camSet(c);
  gbClear();
  OCC.length = 0;
  FLOOR.time = t;

  // окружение
  const storm = ENV.storm.at(t), dawn = ENV.dawn.at(t);
  const e = sh.earth || E_WIDE;
  EARTH.az = e.az; EARTH.el = e.el; EARTH.rad = e.rad;
  SUN.on = dawn > 0 || ENV.zodi.at(t) > 0;
  SUN.el = ENV.sunEl.at(t);
  const zod = ENV.zodi.at(t);
  SKY.glow = zod > 0 ? { az: SUN.az, el: SUN_RIDGE_EL, rx: 0.32, ry: 0.07, k: zod * 0.22, rays: zod * 0.5 * clamp((94.6 - t) / 1.2, 0, 1), r: 1.0, g: 0.78, b: 0.52 } : null;

  // поза робота
  const P = robotAt(t);

  /* --- дальний план --- */
  drawEarth();
  drawSun();
  const sunTan = dawn > 0 ? Math.tan(Math.max(0.004, SUN.el + 0.03)) : null;
  for (const L of RIDGES) drawRidge(L, sunTan, !!sh.ridgeShade);

  /* --- пол --- */
  FLOOR.ao.length = 0;
  FLOOR.ao.push({ x: P.x, z: P.z, rx: 0.2, rz: 0.12, k: 0.55 });
  FLOOR.ao.push({ x: 0, z: 0, rx: 0.06, rz: 0.05, k: 0.5 });
  FLOOR.ao.push({ x: POS.lander[0], z: POS.lander[1], rx: 1.7, rz: 0.9, k: 0.35 });
  if (!CAN.held.at(t)) FLOOR.ao.push({ x: CAN.x.at(t), z: CAN.z.at(t), rx: 0.08, rz: 0.06, k: 0.5 });
  FLOOR.sunLow = dawn > 0.05 ? { lx: Math.sin(SUN.az), lz: Math.cos(SUN.az), tan: Math.tan(0.2) } : null;
  FLOOR.rocksShadow = FLOOR.sunLow ? ROCKS : [];
  drawFloor();

  /* --- вал кратера на переднем плане (только в первом плане) --- */
  if (sh.rim) drawRim();

  /* --- камни --- */
  for (const r of ROCKS) {
    const pl = placeAt(r.x, 0, r.z);
    if (!pl || pl.k * r.r < 0.6) continue;
    drawRock(pl.T, pl.D, r.r, r.seed, r.alb);
  }

  /* --- посадочный модуль --- */
  const plL = placeAt(POS.lander[0], 0, POS.lander[1]);
  const beacon = Math.pow(Math.max(0, Math.sin(t * 2.1)), 20);
  const dockOn = t < 12.8 ? 0.15 : t < 16.14 ? 1 : 0.3;
  if (plL) drawLander(plL.T, plL.D, { beacon, dock: dockOn, window: 0.8 });

  /* --- грядка: цветок и мерная палочка --- */
  const plF = placeAt(0, 0, 0);
  const fs = { g: FL.g.at(t), b: FL.b.at(t), lean: FL.lean.at(t), perk: FL.perk.at(t), glow: Math.max(FL.glow.at(t), 0.35 + 0.08 * Math.sin(t * 1.7)), shake: flowerShake(t) };
  if (plF) drawFlower(plF.T, plF.D, fs);
  const plS = placeAt(POS.stick[0], 0, POS.stick[1]);
  if (plS) drawStick(plS.T, plS.D, t >= STICK_NEW.t ? STICK_TICKS.concat([STICK_NEW.h]) : STICK_TICKS);

  /* --- лейка на земле --- */
  if (!CAN.held.at(t)) {
    const plC = placeAt(CAN.x.at(t), 0, CAN.z.at(t));
    if (plC) drawCan(tMul(plC.T, [1, 0, 0, 1, 0, 0]), plC.D, 1, false);
  }

  /* --- лёд --- */
  const iceState = ICE.state.at(t);
  if (t >= 70.0 && iceState < 0.5) {
    const plI = placeAt(POS.crater[0], -0.03, POS.crater[1]);
    if (plI) drawIce(plI.T, plI.D, 1, t);
  }

  /* --- робот --- */
  const plR = placeAt(P.x, 0, P.z);
  let eyeW = null;
  if (plR) {
    drawRobot(plR.T, plR.D, P, plR.k);
    if (ICE.state.at(t) > 0.5 && ICE.state.at(t) < 1.5) {
      const hx = (ROBOT_OUT.handAX + ROBOT_OUT.handBX) / 2, hy = (ROBOT_OUT.handAY + ROBOT_OUT.handBY) / 2;
      drawIce(tMul(plR.T, tTRS(hx, hy - 0.03, 0, 0.8, 0.8)), plR.D - 0.15, 1.3, t);
    }
    eyeW = [P.x + ROBOT_OUT.eyeLX, ROBOT_OUT.eyeLY, P.z - 0.1];
    // кабель зарядки из дока
    if (P.cable > 0.5) {
      const a = [POS.dock[0] + 0.12, 0.24, POS.dock[1] + 0.2];
      const pa = placeAt(a[0], a[1], a[2]);
      if (pa) {
        const b = tPt(plR.T, -0.1 * (P.yaw >= 0 ? 1 : -1), 0.2);
        const cm = mat(0.12, 0.12, 0.15, { spec: 0.4 });
        const A = tPt(pa.T, 0, 0);
        const midx = (A[0] + b[0]) / 2, midy = Math.max(A[1], b[1]) + 6 * pa.k / 60;
        let px = A[0], py = A[1];
        for (let n = 1; n <= 10; n++) { const u = n / 10; const x = (1 - u) * (1 - u) * A[0] + 2 * (1 - u) * u * midx + u * u * b[0], y = (1 - u) * (1 - u) * A[1] + 2 * (1 - u) * u * midy + u * u * b[1]; line1(px, py, x, y, plR.D + 0.05, cm); px = x; py = y; }
      }
    }
  }

  /* --- метеоры, вспышки, частицы, капли, искры --- */
  drawMeteors(t);
  drawParticles(t);
  drawDrops(t);
  drawSparks(t, P);
  if (sh.lensRefl && eyeW) drawLensReflections(t, P);

  /* --- небо заполняет всё, что осталось --- */
  drawSky();

  /* --- маски теней --- */
  if (plR) {
    const T = occBegin(OCC_ROBOT, P.x, 0, P.z, 0.45, 0.8, 0.14);
    drawRobot(T, 0, P, 1);
    occEnd(OCC_ROBOT);
  }
  if (plL && Math.abs(POS.lander[0] - CAM.x) < 30) {
    const T = occBegin(OCC_LANDER, POS.lander[0], 0, POS.lander[1], 2.3, 3.0, 1.0);
    drawLander(T, 0, { beacon: 0, dock: 0, window: 0 });
    occEnd(OCC_LANDER);
  }

  /* --- свет --- */
  setupLights(t, P, eyeW, storm, dawn, sh);
  shade();
  bloom(COL, 0.85, 0.9);
  if (dawn > 0) sunStreak(COL, clamp((SUN.el - SUN_RIDGE_EL + 0.004) / 0.012, 0, 1) * (sh.noStreak ? 0 : 1));
  if (target !== COL) target.set(COL);
}

/* Вал кратера перед камерой: из-за него «встаёт» Земля */
function drawRim() {
  const Zr = -5.6;
  const D = Zr - CAM.z;
  if (D < 0.2) return;
  const f = CAM.f;
  for (let px = 0; px < W; px++) {
    const X = CAM.x + ((px + 0.5 - W / 2) / f + CAM.yaw) * D;
    const h = 1.15 + 0.35 * Math.sin(X * 0.45 + 1) + 0.12 * fbm(X * 1.3, 2, 3, 12) - 0.02 * X * X;
    const top = syOf(h, D);
    const slope = 0.35 * 0.45 * Math.cos(X * 0.45 + 1) - 0.04 * X;
    for (let py = Math.max(0, Math.floor(top)); py < H; py++) {
      const i = py * W + px;
      if (D > GB_D[i]) continue;
      const Y = CAM.y + ((H / 2 - py - 0.5) / f + CAM.pitch) * D;
      const k = Math.exp(-(h - Y) * 3);
      let nx = -slope * k, ny = 0.3 + k, nz = 0.6 - 1.25 * k * k;
      const g = ihash(Math.floor(X * 40), Math.floor(Y * 40), 5);
      if (g < 0.05) { nx += 0.4; }
      const nl = hyp3(nx, ny, nz);
      writePx(i, D, M_RIM, nx / nl, ny / nl, nz / nl);
      const j = i * 3; const a = 0.3 + 0.05 * vnoise(X * 6, Y * 6, 3);
      GB_A[j] = a; GB_A[j + 1] = a; GB_A[j + 2] = a * 1.04;
    }
  }
}

/* Цветок вздрагивает от ударов рядом */
function flowerShake(t) {
  let s = 0;
  for (let k = 0; k < IMPACTS.length; k++) {
    const im = IMPACTS[k];
    const dt = t - im.t;
    if (dt < 0 || dt > 1.2 || !im.near) continue;
    const d = hyp(im.x, im.z);
    s += clamp(1.2 / (d + 0.5), 0, 1) * im.size * Math.exp(-dt * 4) * Math.sin(dt * 40) * 0.35;
  }
  return s;
}

/* ---------- Метеоры ---------- */
const MTMP = [0, 0, 0], MTMP2 = [0, 0, 0];
function drawMeteors(t) {
  for (let k = 0; k < METEORS.length; k++) {
    const m = METEORS[k];
    const t0 = m.tHit - m.fly;
    if (t < t0 || t > m.tHit + 0.02) continue;
    const age = t - t0;
    const tail = Math.min(age, m.big ? 0.5 : 0.16);
    meteorPos(m, Math.min(t, m.tHit), MTMP);
    meteorPos(m, Math.min(t, m.tHit) - tail, MTMP2);
    const D1 = MTMP[2] - CAM.z, D2 = MTMP2[2] - CAM.z;
    if (D1 < 0.3 || D2 < 0.3) continue;
    const x1 = sxOf(MTMP[0], D1), y1 = syOf(MTMP[1], D1), x2 = sxOf(MTMP2[0], D2), y2 = syOf(MTMP2[1], D2);
    const len = hyp(x1 - x2, y1 - y2);
    const n = Math.max(2, Math.ceil(len));
    const fadeIn = clamp(age / 0.15, 0, 1);
    const br = (m.big ? 4 : 2.2 + m.size * 2) * fadeIn;
    const thick = m.big ? 3 : D1 < 25 ? 2 : 1;
    MT.flags = 0; MT.r = MT.g = MT.b = 0;
    for (let s = 0; s <= n; s++) {
      const u = s / n; // 0 — голова, 1 — хвост
      const x = x1 + (x2 - x1) * u, y = y1 + (y2 - y1) * u;
      const D = D1 + (D2 - D1) * u;
      const k2 = Math.pow(1 - u, 1.6) * br;
      MT.er = k2 * lerp(1.2, 1.0, u); MT.eg = k2 * lerp(1.05, 0.35, u); MT.eb = k2 * lerp(0.85, 0.12, u);
      putPx(x, y, D, MT);
      if (thick > 1 && u < 0.6) { putPx(x + 1, y, D, MT); putPx(x, y + 1, D, MT); }
      if (thick > 2 && u < 0.4) { putPx(x - 1, y, D, MT); putPx(x, y - 1, D, MT); putPx(x + 1, y + 1, D, MT); }
    }
    // голова
    MT.er = br * 1.6; MT.eg = br * 1.5; MT.eb = br * 1.3;
    putPx(x1, y1, D1 - 0.01, MT);
  }
  // вспышки ударов: маленькое раскалённое ядро, ореол даёт свечение
  for (let k = 0; k < IMPACTS.length; k++) {
    const im = IMPACTS[k];
    const dt = t - im.t;
    if (dt < 0 || dt > 0.5) continue;
    const pl = placeAt(im.x, im.y + 0.02, im.z);
    if (!pl) continue;
    const s = Math.exp(-dt * (im.big ? 3.5 : 10));
    const Rm = im.big ? 0.18 : 0.012 + im.size * 0.03;
    const R = clamp(Rm * pl.k, 0.8, im.big ? 16 : 5) * (0.5 + 0.8 * s);
    MT.flags = 0; MT.r = MT.g = MT.b = 0; MT.er = 5 * s; MT.eg = 4 * s; MT.eb = 2.6 * s;
    fillSDF(pl.T, sdCircle(0, 0, R / pl.k), -R / pl.k, -R / pl.k, R / pl.k, R / pl.k, pl.D - 0.05, MT, 0);
  }
}

/* ---------- Частицы выбросов ---------- */
function drawParticles(t) {
  for (let k = 0; k < PARTICLES.length; k++) {
    const p = PARTICLES[k];
    if (t < p.t0 || t > p.t0 + p.life) continue;
    if (!particleAt(p, t, MTMP)) continue;
    const D = MTMP[2] - CAM.z;
    if (D < 0.2) continue;
    const x = sxOf(MTMP[0], D), y = syOf(MTMP[1], D);
    if (x < -2 || y < -2 || x > W + 1 || y > H + 1) continue;
    const age = t - p.t0;
    const heat = p.hot ? Math.exp(-age * 1.6) : 0;
    let m;
    if (heat > 0.08) { MT.flags = 0; MT.r = MT.g = MT.b = 0; MT.er = 2.4 * heat + 0.2; MT.eg = 1.0 * heat + 0.15; MT.eb = 0.3 * heat + 0.1; m = MT; }
    else { MP.r = MP.g = MP.b = p.rock ? 0.5 : 0.62; MP.er = MP.eg = MP.eb = 0; MP.flags = F_LIT; m = MP; }
    putPx(x, y, D, m, 0, 0.6, 0.8);
    if (p.size > 1 && 0.02 * CAM.f / D > 1.5) putPx(x, y + 1, D, m, 0, 0.6, 0.8);
  }
}

/* ---------- Капли из лейки ---------- */
function drawDrops(t) {
  for (const d of DROPS) {
    const dt = t - d.t0;
    if (dt < 0) continue;
    const y = d.y + d.vy * dt - 0.5 * G_MOON * dt * dt;
    if (y < 0) continue;
    const x = d.x + d.vx * dt;
    const pl = placeAt(x, y, d.z);
    if (!pl) continue;
    const r = Math.max(0.8 / pl.k, 0.008);
    const m = mat(0.5, 0.75, 0.95, { spec: 2.5, er: 0.25, eg: 0.55, eb: 0.75 });
    fillSDF(pl.T, sdEllipse(0, 0, r, r * 1.3), -r, -r * 1.3, r, r * 1.3, pl.D, m, r);
  }
}

/* ---------- Искры от ударов по роботу ---------- */
function drawSparks(t, P) {
  for (const im of IMPACTS) {
    if (!im.tag.startsWith('hit')) continue;
    const dt = t - im.t;
    if (dt < 0 || dt > 0.9) continue;
    const R = mulberry(Math.floor(im.t * 100));
    for (let n = 0; n < 26; n++) {
      const a = R() * Math.PI, s = 0.8 + R() * 1.8;
      const vx = Math.cos(a) * s, vy = Math.sin(a) * s * 0.9;
      const x = im.x + vx * dt, y = im.y + vy * dt - 0.5 * G_MOON * dt * dt * 3;
      const pl = placeAt(x, y, im.z - 0.12);
      if (!pl) continue;
      const P0 = tPt(pl.T, 0, 0);
      const heat = Math.exp(-dt * 4) * (0.6 + R() * 0.6);
      MT.flags = 0; MT.r = MT.g = MT.b = 0; MT.er = 3 * heat; MT.eg = 2 * heat; MT.eb = 0.6 * heat;
      putPx(P0[0], P0[1], pl.D, MT);
      if (pl.k > 150) { putPx(P0[0] + 1, P0[1], pl.D, MT); }
    }
  }
  void P;
}

/* ---------- Отражения в линзе глаза ----------
   Выпуклая линза отражает небо: метеоры, Землю, горизонт. */
function drawLensReflections(t, P) {
  const cx = ROBOT_OUT.eyeSX, cy = ROBOT_OUT.eyeSY, R = ROBOT_OUT.eyeR * 0.78;
  if (!(R > 6)) return;
  const x0 = Math.max(0, Math.floor(cx - R)), x1 = Math.min(W - 1, Math.ceil(cx + R));
  const y0 = Math.max(0, Math.floor(cy - R)), y1 = Math.min(H - 1, Math.ceil(cy + R));
  const on = P.eyeOn;
  for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
    const u = (px + 0.5 - cx) / R, v = (cy - py - 0.5) / R;
    const rr = u * u + v * v;
    if (rr > 1) continue;
    const i = py * W + px;
    if (GB_O[i] !== 1) continue;
    const j = i * 3;
    // веко закрывает линзу — не отражаем
    if (GB_A[j] > 0.3) continue;
    // направление отражения → небо (фишай)
    const k = 1.4;
    const az = -u * k, el = v * k * 0.8 + 0.25;
    let r = 0, g = 0, b = 0;
    if (el < 0.02) { r += 0.05; g += 0.05; b += 0.06; } // горизонт и реголит
    // Земля
    const de = hyp(az - 0.35, el - 0.3);
    if (de < 0.07) { r += 0.1; g += 0.25; b += 0.5; }
    // метеоры: следы как короткие штрихи
    for (const m of METEORS) {
      const t0 = m.tHit - m.fly;
      if (t < t0 || t > m.tHit) continue;
      const u2 = (t - t0) / m.fly;
      const ma = -0.6 + u2 * 1.2 + (m.x % 1.3) * 0.2, me = 0.95 - u2 * 0.8 + (m.z % 0.7) * 0.15;
      const dd = Math.abs((az - ma) * 0.6 + (el - me) * 0.8);
      const along = (az - ma) * 0.8 - (el - me) * 0.6;
      if (dd < 0.03 && along > -0.25 && along < 0.02) { const q = (1 + along / 0.25) * 1.3; r += q * 1.1; g += q * 0.7; b += q * 0.3; }
    }
    GB_E[j] += r * 0.9; GB_E[j + 1] += g * 0.9; GB_E[j + 2] += b * 0.9;
    void on;
  }
}

/* ---------- Свет плана ---------- */
function setupLights(t, P, eyeW, storm, dawn, sh) {
  const night = 1 - dawn;
  lightsReset(0.05 * night + 0.1 * dawn, 0.06 * night + 0.085 * dawn, 0.11 * night + 0.07 * dawn);
  LIGHT.ground[0] = 0.03 + 0.34 * dawn; LIGHT.ground[1] = 0.03 + 0.25 * dawn; LIGHT.ground[2] = 0.045 + 0.1 * dawn;
  // Земля: холодный ключевой свет спереди-справа
  addDir(E_WIDE.az, E_WIDE.el + 0.3, 0.46 * night + 0.1, 0.55 * night + 0.12, 0.78 * night + 0.18, { shadow: true, wrap: 0.25 });
  // заполняющий из-за камеры (отражённый свет Земли от реголита)
  addDir(2.5, 0.42, 0.13 * night + 0.05, 0.16 * night + 0.05, 0.26 * night + 0.05, { wrap: 0.4, spec: 0.3 });
  // Солнце на рассвете: линия света бежит по равнине
  if (dawn > 0) {
    const term = ENV.term.at(t);
    // эффективная высота для света выше видимого диска — иначе скользящий луч даёт лишь бурую муть
    addDir(SUN.az, 0.2, 3.1 * dawn, 2.35 * dawn, 1.45 * dawn, { shadow: true, sunMask: true, term: { x: term, soft: 0.35, lift: 6, dir: -1 } });
  }
  // глаз робота — фонарик
  if (eyeW && P.eyeOn > 0.02) {
    const on = P.eyeOn;
    addPoint(eyeW[0], eyeW[1], eyeW[2], 0.2 * on, 0.6 * on, 0.8 * on, 0.75, { wrap: 0.1, spec: 0.5 });
  }
  // лампочка антенны
  if (P.bulb > 0.3) addPoint(P.x, 0.72, P.z - 0.05, 0.25 * P.bulb, 0.06 * P.bulb, 0.03 * P.bulb, 0.35);
  // иллюминатор модуля
  addPoint(POS.lander[0] + 0.18, 1.9, POS.lander[1] - 0.25, 0.3, 0.18, 0.06, 1.6);
  // лёд светится
  const iceS = ICE.state.at(t);
  if (t >= 70 && iceS < 1.5) {
    let ix = POS.crater[0], iy = 0.05, iz = POS.crater[1];
    if (iceS > 0.5) { ix = P.x + (ROBOT_OUT.handAX + ROBOT_OUT.handBX) / 2; iy = (ROBOT_OUT.handAY + ROBOT_OUT.handBY) / 2; iz = P.z - 0.18; }
    const g = 0.8 + 0.2 * Math.sin(t * 5);
    addPoint(ix, iy + 0.05, iz, 0.2 * g, 0.65 * g, 0.9 * g, 1.3, { spec: 1 });
  }
  // цветок светится после раскрытия
  const fg = FL.glow.at(t);
  const fgl = Math.max(fg, 0.3);
  addPoint(0.01, 0.16, -0.04, 0.5 * fgl, 0.14 * fgl, 0.28 * fgl, 0.35 + 0.25 * fg);
  // метеоры: ближние — точечные, дальние — направленные вспышки
  const cand = [];
  for (const m of METEORS) {
    const t0 = m.tHit - m.fly;
    if (t < t0 || t > m.tHit) continue;
    meteorPos(m, t, MTMP);
    const d = hyp(MTMP[0] - CAM.x, MTMP[2] - CAM.z);
    cand.push({ x: MTMP[0], y: MTMP[1], z: MTMP[2], d, s: (m.big ? 3 : 1) * m.size * clamp((t - t0) / 0.15, 0, 1) });
  }
  for (const im of IMPACTS) {
    const dt = t - im.t;
    if (dt < 0 || dt > 0.7) continue;
    const s = Math.exp(-dt * (im.big ? 3 : 8)) * (im.big ? 5 : 2.2 * im.size);
    cand.push({ x: im.x, y: im.y + 0.4, z: im.z, d: hyp(im.x - CAM.x, im.z - CAM.z), s, impact: true });
  }
  cand.sort((a, b) => b.s / (1 + a.d * 0.02) - a.s / (1 + b.d * 0.02));
  let nPt = 0;
  for (const c of cand) {
    if (c.d < 70 && nPt < 4) {
      // широкий мягкий свет: метеор заливает равнину, а не рисует пятно
      const rad = c.impact ? 5 + c.s * 4 : 9 + c.s * 3;
      const k = c.impact ? 1 : 0.35;
      addPoint(c.x, c.y, c.z, 2.6 * c.s * k, 1.3 * c.s * k, 0.45 * c.s * k, rad, { shadow: nPt < 2, wrap: 0.35 });
      nPt++;
    } else if (c.d >= 70) {
      const az = Math.atan2(c.x - CAM.x, c.z - CAM.z), el = Math.atan2(c.y, c.d);
      const k = clamp(c.s * 0.16, 0, 0.22) * (c.impact ? 1.5 : 1);
      addDir(az, Math.max(0.05, el), 1.0 * k, 0.55 * k, 0.22 * k, { wrap: 0.3, spec: 0.6 });
    }
  }
  // свет шторма: тёплый контровой со стороны радианта, мерцает от числа огней в небе
  if (storm > 0.02) {
    let fl = 0;
    for (const c of cand) if (!c.impact) fl += c.s / (1 + c.d * 0.004);
    const k = storm * (0.18 + clamp(fl * 0.12, 0, 0.5));
    addDir(-0.75, 0.62, 1.5 * k, 0.78 * k, 0.32 * k, { wrap: 0.15, spec: 1, noRego: true });
  }
  // зарево шторма: небо полно огней — тёплая подсветка сверху
  LIGHT.amb[0] += storm * 0.025; LIGHT.amb[1] += storm * 0.01; LIGHT.amb[2] += storm * 0.002;
  void storm; void sh;
}

/* ---------- Кадр фильма ---------- */
let LUT_READY = false;
let SUN_RIDGE_EL = 0.05;
let WORLD_READY = false;
function initFilm() {
  if (WORLD_READY) return;
  if (!LUT_READY) { buildLUT(); LUT_READY = true; }
  buildEarth();
  buildMilky();
  buildRegolith();
  buildCraters();
  buildRocks();
  FLOOR.beds.push({ x: 0, z: 0, r: 0.2 });
  FLOOR.paths.push({ x0: POS.dock[0] + 0.2, z0: POS.dock[1] - 0.1, x1: -0.3, z1: -0.08, w: 0.16 });
  // старые следы на тропинке: здесь ходили тысячу раз
  const R = mulberry(5);
  for (let n = 0; n < 70; n++) {
    const u = R();
    const x = lerp(POS.dock[0] + 0.2, -0.3, u), z = lerp(POS.dock[1] - 0.1, -0.08, u);
    const dx = 2.8, dz = -2.0, L = hyp(dx, dz);
    const side = (R() - 0.5) * 0.18;
    FLOOR.prints.push({ x: x - dz / L * side, z: z + dx / L * side, c: dx / L, s: dz / L, t: -1, k: 0.55 });
  }
  // шторм и рассвет
  ENV.storm.add(38, 0).add(41, 0.35, 'io').add(46, 0.7, 'io').add(56, 0.8).add(62, 1, 'io').add(68.8, 1).add(69.4, 0.2, 'io').add(70, 0);
  ENV.zodi.add(90.3, 0).add(93.2, 1, 'io').add(96, 0.7).add(99, 0.3, 'io');
  // Солнце встаёт из-за гребня дальних гор в своём азимуте
  SUN_RIDGE_EL = 0;
  for (const L of RIDGES) { const X = L.Z * Math.tan(SUN.az); SUN_RIDGE_EL = Math.max(SUN_RIDGE_EL, Math.atan2(ridgeH(L, X), L.Z)); }
  ENV.sunEl.add(92.8, SUN_RIDGE_EL - 0.03).add(94.4, SUN_RIDGE_EL - 0.004, 'io').add(97.5, SUN_RIDGE_EL + 0.03, 'o').add(108, SUN_RIDGE_EL + 0.05);
  ENV.dawn.add(93.2, 0).add(95.5, 1, 'io');
  ENV.term.add(93.4, -40).add(96.8, 30, 'io');
  ENV.flash.add(69.98, 0).add(70.02, 1, 'l').add(70.25, 1).add(71.3, 0, 'o');
  buildMeteors();
  bakeAntenna();
  bakeDrops();
  WORLD_READY = true;
}

function renderFilm(t) {
  initFilm();
  t = clamp(t, 0, DURATION - 1e-3);
  const idx = shotAt(t);
  const shx = SHOTS[idx];
  // наплыв по матрице Байера: следующий план проступает попиксельно
  if (shx.dis && idx > 0 && t - shx.t0 < shx.dis) {
    renderShot(t, idx - 1, COL2);
    renderShot(t, idx, COL);
    const u = (t - shx.t0) / shx.dis * 16;
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
      if (BAYER[(py & 3) * 4 + (px & 3)] < u) continue;
      const j = (py * W + px) * 3;
      COL[j] = COL2[j]; COL[j + 1] = COL2[j + 1]; COL[j + 2] = COL2[j + 2];
    }
  } else renderShot(t, idx, COL);
  // пост: виньетка, вспышка, затемнения, титры
  const sh = SHOTS[idx];
  const fadeIn = clamp(t / 1.6, 0, 1);
  const fadeOut = t > 106 ? clamp(1 - (t - 106) / 0.8, 0, 1) : 1;
  const flash = ENV.flash.at(t);
  const k = fadeIn * fadeOut;
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const j = (py * W + px) * 3;
    const dx = (px - W / 2) / (W / 2), dy = (py - H / 2) / (H / 2);
    const vig = 1 - 0.22 * (dx * dx * 0.6 + dy * dy);
    for (let c = 0; c < 3; c++) {
      let v = COL[j + c] * vig * k;
      if (flash > 0) v = v + ((c === 0 ? 1.6 : c === 1 ? 1.35 : 0.95) - v) * flash;
      COL[j + c] = v;
    }
  }
  if (sh.title) {
    const a = clamp((t - 6.2) / 1.2, 0, 1) * clamp((11.6 - t) / 0.9, 0, 1);
    if (a > 0) {
      drawText(COL, 'САДОВНИК', W / 2, 28, 2, [1.0, 0.93, 0.78], [0.03, 0.03, 0.07], a);
      drawText(COL, 'НА ЛУНЕ', W / 2, 48, 2, [1.0, 0.93, 0.78], [0.03, 0.03, 0.07], a);
    }
  }
  if (t > 106.5) {
    const a = clamp((t - 106.6) / 0.6, 0, 1);
    drawText(COL, 'КОНЕЦ', W / 2, H / 2 - 7, 2, [1.0, 0.9, 0.75], null, a);
  }
  quantize(COL, 0, 0);
  return IMG32;
}
