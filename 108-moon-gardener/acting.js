'use strict';
/* ==========================================================================
   Садовник на Луне · игра актёра
   Ключевые кадры робота, цветка, лейки и льда. Шаги ложатся на
   шестнадцатые доли (120 ударов в минуту → 8 шагов в секунду), поэтому
   походка и музыка совпадают без подгонки.
   ========================================================================== */

/* ---------- Места действия (мир, метры) ---------- */
const POS = {
  lander: [-3.0, 2.4], dock: [-3.1, 1.95], canHome: [-2.9, 1.92],
  flower: [0, 0], stick: [0.075, 0.13], kneel: [-0.17, -0.05], canPark: [-0.44, -0.13],
  crater: [1.6, 1.5],
};

const RB = tracks(Object.assign(robotPose(), {
  x: POS.dock[0], z: POS.dock[1], yaw: 0.25, headYaw: 0.25, crouch: 0.78, headTilt: 0.22, neck: -0.03,
  lidT: 1, lidB: 0, eyeOn: 0.06, iris: 0.8, lookY: -0.4, cable: 1,
  hAx: -0.01, hAy: -0.11, hBx: 0.01, hBy: -0.11,
  hwA: 0, hwB: 0, wAx: 0, wAy: 0, wBx: 0, wBy: 0, sit: 0, tremble: 0, sleep: 1, dead: 0,
}));
const FL = tracks({ g: 1, b: 0, lean: 0, perk: 0.45, glow: 0, shake: 0 });
const CAN = tracks({ held: 0, x: POS.canHome[0], z: POS.canHome[1] });
const ICE = tracks({ state: 0, glow: 1 });
const STICK_TICKS = [0.1, 0.132, 0.158];
const STICK_NEW = { t: 24.35, h: 0.168 };
const BLINKS = [];
let PHASE = 0;

function K(t, props, e) { for (const n in props) RB[n].add(t, props[n], e); }
function blink(t, dur) { BLINKS.push([t, dur || 0.16]); }

/* Шаги: равномерные, фаза непрерывна между проходами; следы остаются на реголите */
function walkSeg(t0, t1, x0, z0, x1, z1, steps, o) {
  o = o || {};
  const P0 = PHASE, P1 = PHASE + steps;
  K(t0, { x: x0, z: z0, walk: P0 }, 'l');
  K(t1, { x: x1, z: z1, walk: P1 }, o.ease || 'l');
  K(t0, { walkAmt: 0 }, 'l'); K(t0 + 0.1, { walkAmt: 1 }, 'o');
  K(t1 - 0.08, { walkAmt: 1 }, 'l'); K(t1 + 0.06, { walkAmt: 0 }, 'o');
  const dist = hyp(x1 - x0, z1 - z0);
  K(t0, { stride: dist / steps }, 's');
  if (o.run !== undefined) { K(t0, { run: o.run }, 's'); K(t1 + 0.1, { run: 0 }, 's'); }
  if (o.limp !== undefined) { K(t0, { limp: o.limp }, 's'); K(t1 + 0.1, { limp: 0 }, 's'); }
  // следы: по одному на каждый шаг
  const dx = (x1 - x0) / dist, dz = (z1 - z0) / dist;
  for (let n = 1; n <= steps; n++) {
    const u = n / steps;
    const side = (P0 + n) % 2 === 0 ? 1 : -1;
    FLOOR.prints.push({ x: x0 + (x1 - x0) * u - dz * side * 0.045, z: z0 + (z1 - z0) * u + dx * side * 0.045, c: dx, s: dz, t: t0 + (t1 - t0) * u, k: 1 });
  }
  PHASE = P1;
}

/* ================= СЦЕНА 1 · Земля (0–12): робот спит в доке ================= */
K(0, { sleep: 1 });

/* ================= СЦЕНА 2 · Садовник (12–38) ================= */
// пробуждение
K(12.95, { eyeOn: 0.06 }); K(13.2, { eyeOn: 1, sleep: 0 }, 'o');
K(13.15, { lidT: 1, iris: 0.8 }); K(13.4, { lidT: 0.55, iris: 1 }, 'o');
blink(13.62); blink(13.98);
K(13.95, { lidT: 0.55 }); K(14.08, { lidT: 0.12 }, 'o');
K(13.95, { headTilt: 0.22, neck: -0.03, lookY: -0.4 }); K(14.3, { headTilt: 0, neck: 0, lookY: 0 }, 'b');
// оглядывается
K(14.25, { lookX: 0, headYaw: 0.25 });
K(14.4, { lookX: -0.75, headYaw: -0.35 }, 'o'); K(14.72, { lookX: -0.75, headYaw: -0.35 });
K(14.88, { lookX: 0.75, headYaw: 0.65 }, 'o'); K(15.05, { lookX: 0.75, headYaw: 0.65 });
K(15.2, { lookX: 0, headYaw: 0.25 }, 'o');
// потягивается: упреждение → растяжение → отпускание с упругостью
K(15.0, { sq: 1, crouch: 0.78 }); K(15.25, { sq: 0.86, crouch: 0.84 }, 'io');
K(15.6, { sq: 1.17, crouch: 0.3, neck: 0.035 }, 'o'); K(15.85, { sq: 1.17, crouch: 0.3 });
K(16.15, { sq: 1, crouch: 0.42, neck: 0 }, 'e');
K(15.25, { hAx: -0.01, hAy: -0.11, hBx: 0.01, hBy: -0.11 });
K(15.6, { hAx: -0.075, hAy: 0.15, hBx: 0.075, hBy: 0.15 }, 'o'); K(15.85, { hAx: -0.075, hAy: 0.15, hBx: 0.075, hBy: 0.15 });
K(16.15, { hAx: -0.015, hAy: -0.15, hBx: 0.015, hBy: -0.15 }, 'io');
K(15.3, { lidT: 0.12, lidB: 0.05 }); K(15.55, { lidT: 0.6, lidB: 0.42 }); K(15.85, { lidT: 0.6, lidB: 0.42 }); K(16.02, { lidT: 0.12, lidB: 0.05 });
// кабель выскакивает — робот вздрагивает
K(16.12, { cable: 1 }); K(16.14, { cable: 0 }, 's');
K(16.14, { y: 0, lidT: 0.12 }); K(16.26, { y: 0.035, lidT: 0 }, 'o'); K(16.4, { y: 0 }, 'i'); K(16.55, { lidT: 0.12 });
K(16.3, { crouch: 0.42 }); K(16.55, { crouch: 0 }, 'o');
// поворачивается к лейке, наклоняется и берёт её
K(16.4, { yaw: 0.25, headYaw: 0.25 }); K(16.65, { yaw: 0.85, headYaw: 0.9 }, 'o');
K(16.62, { lean: 0, crouch: 0, hwB: 0, lookY: 0 }); K(16.85, { lean: 0.55, crouch: 0.3, hwB: 1, lookY: -0.6 }, 'io');
K(16.62, { wBx: 0.21, wBy: 0.16 });
K(17.02, { lean: 0.55, crouch: 0.3, hwB: 1 }); K(17.2, { lean: 0, crouch: 0, hwB: 0, lookY: 0 }, 'o');
K(17.02, { hBx: 0.05, hBy: -0.1 });
CAN.held.add(16.95, 1, 's');
// идёт к цветку: 30 шагов, по шестнадцатым
walkSeg(17.25, 21.0, POS.dock[0], POS.dock[1], -0.33, -0.06, 30);
K(17.25, { lean: 0 }); K(17.5, { lean: 0.08 }); K(20.8, { lean: 0.08 }); K(21.05, { lean: -0.06 }, 'o'); K(21.3, { lean: 0 }, 'e');
K(21.0, { sq: 1 }); K(21.08, { sq: 0.92 }, 'o'); K(21.35, { sq: 1 }, 'e');
walkSeg(21.5, 21.75, -0.33, -0.06, POS.kneel[0], POS.kneel[1], 2);
// опускается на колено, разглядывает бутон
K(21.9, { lookY: 0, lookX: 0, headYaw: 0.9 }); K(22.2, { lookY: -0.55, lookX: 0.45 }, 'o');
K(22.0, { crouch: 0, lean: 0 }); K(22.4, { crouch: 0.6, lean: 0.3 }, 'io');
K(22.5, { headTilt: 0 }); K(22.8, { headTilt: -0.22 }, 'o'); K(23.15, { headTilt: -0.22 }); K(23.4, { headTilt: 0 }, 'io');
// замер роста: ладонь над бутоном → к мерной палочке → новая зарубка
K(22.9, { hwA: 0, wAx: 0.17, wAy: 0.215 }); K(23.3, { hwA: 1 }, 'io');
K(23.6, { wAx: 0.17, wAy: 0.215 }); K(23.95, { wAx: 0.24, wAy: 0.215 }, 'io');
K(23.85, { lookX: 0.45, lookY: -0.55 }); K(24.0, { lookX: 0.7, lookY: -0.1 }, 'o');
K(24.0, { lidT: 0.12 }); K(24.12, { lidT: 0 }, 'o');
K(24.3, { wAy: 0.215 }); K(24.36, { wAy: 0.205 }, 'l'); K(24.42, { wAy: 0.215 }, 'l'); K(24.48, { wAy: 0.205 }, 'l'); K(24.55, { wAy: 0.215 }, 'l');
K(24.55, { hwA: 1 }); K(24.7, { hwA: 0 }, 'io');
// прыжок радости: упреждение, растяжение, приземление с захлёстом
K(24.55, { crouch: 0.6, sq: 1, y: 0, lean: 0.3 });
K(24.7, { crouch: 0.78, sq: 0.83, lean: 0.12 }, 'io');
K(24.95, { crouch: 0.05, sq: 1.2, y: 0.1, lean: 0 }, 'o');
K(25.13, { y: 0.0, sq: 1.08 }, 'i');
K(25.24, { sq: 0.8, crouch: 0.55 }, 'o');
K(25.55, { sq: 1, lean: 0.25 }, 'e');
K(24.7, { hAx: -0.015, hAy: -0.15 }); K(24.95, { hAx: -0.08, hAy: 0.14 }, 'o'); K(25.3, { hAx: -0.08, hAy: 0.1 }); K(25.6, { hAx: -0.015, hAy: -0.14 }, 'io');
K(24.7, { lidB: 0.05, lookY: -0.1 }); K(24.85, { lidB: 0.45, lookY: 0.2 }, 'o'); K(25.7, { lidB: 0.45 }); K(25.95, { lidB: 0.05, lookY: -0.4 }, 'io');
// полив: три капли, потом лейка пустеет
K(25.6, { hBx: 0.05, hBy: -0.1 }); K(26.0, { hBx: 0.15, hBy: 0.0 }, 'io');
K(26.0, { canTilt: 0 }); K(26.3, { canTilt: 0.65 }, 'io'); K(27.6, { canTilt: 0.65 }); K(27.9, { canTilt: 0.95 }, 'io');
K(26.1, { lookX: 0.5, lookY: -0.5 });
K(28.2, { canTilt: 0.95, lookX: 0.5, lookY: -0.5 }); K(28.35, { lookX: 0.75, lookY: 0.15 }, 'o');
const SHAKE = [0.62, 1.12, 0.62, 1.12, 0.62, 1.05, 0.75];
SHAKE.forEach((v, n) => K(28.45 + n * 0.1, { canTilt: v }, 'io'));
K(28.45, { sq: 1 }); for (let n = 0; n < 7; n++) K(28.5 + n * 0.1, { sq: n % 2 ? 1.02 : 0.97 }, 'io'); K(29.3, { sq: 1 });
K(29.3, { canTilt: 0.75 }); K(29.9, { canTilt: 0.1 }, 'io');
K(29.3, { lidT: 0.05, brow: 0 }); K(29.7, { lidT: 0.36, brow: -0.7, headTilt: 0.12 }, 'io');

/* крупно: заглядывает в лейку */
K(30.05, { hBx: 0.15, hBy: 0.0, canTilt: 0.1, lookY: -0.4 }); K(30.6, { hBx: 0.12, hBy: 0.19, canTilt: -0.55, lookY: -0.2 }, 'io');
K(30.6, { lidT: 0.36, brow: -0.7, iris: 1 }); K(30.85, { lidT: 0.02, brow: 0, iris: 1.35, lookX: 0.8 }, 'o');
K(31.45, { canTilt: -0.55 }); K(31.8, { canTilt: 2.5 }, 'io');
[2.25, 2.7, 2.25, 2.7, 2.45].forEach((v, n) => K(31.9 + n * 0.09, { canTilt: v }, 'io'));
K(32.3, { canTilt: 2.45, hBx: 0.12, hBy: 0.19 }); K(32.9, { canTilt: 0.15, hBx: 0.06, hBy: -0.1 }, 'io');
K(32.3, { lidT: 0.02, iris: 1.35, brow: 0 }); K(32.8, { lidT: 0.45, iris: 1, brow: -0.85, headTilt: 0.16, neck: -0.02, lookY: -0.5, lookX: 0.3 }, 'io');

/* с Землёй: ставит лейку, садится рядом с бутоном, гладит его */
K(33.1, { hwB: 0, wBx: -0.27, wBy: 0.13 }); K(33.5, { hwB: 1 }, 'io'); K(33.75, { hwB: 1 }); K(34.05, { hwB: 0 }, 'io');
K(33.1, { yaw: 0.9 }); K(33.4, { yaw: 0.5 }, 'io'); K(34.0, { yaw: 0.5 }); K(34.3, { yaw: 0.9 }, 'io');
CAN.held.add(33.72, 0, 's'); CAN.x.add(33.72, POS.canPark[0], 's'); CAN.z.add(33.72, POS.canPark[1], 's');
K(33.7, { crouch: 0.6, sit: 0, lean: 0.3 }); K(34.3, { crouch: 1, sit: 1, lean: 0.02 }, 'io');
K(34.05, { hBx: 0.03, hBy: -0.13 });
K(34.3, { lookY: -0.5, headTilt: 0.16 }); K(34.9, { lookY: 0.6, lookX: 0.35, headTilt: -0.04, lidT: 0.25, brow: -0.2 }, 'io');
K(35.05, { hwB: 0, wBx: 0.175, wBy: 0.19 }); K(35.45, { hwB: 1 }, 'io');
K(35.5, { wBy: 0.19 }); K(35.6, { wBy: 0.176 }, 'io'); K(35.72, { wBy: 0.19 }, 'io'); K(35.84, { wBy: 0.176 }, 'io'); K(35.96, { wBy: 0.19 }, 'io');
K(36.05, { hwB: 1 }); K(36.4, { hwB: 0 }, 'io');
K(35.1, { lookY: 0.6 }); K(35.4, { lookY: -0.55, lookX: 0.4 }, 'io');
K(36.0, { headTilt: -0.04, lidT: 0.25 }); K(36.7, { headTilt: 0.2, lidT: 0.45, brow: -0.45, lookY: -0.45, neck: -0.02 }, 'io');
FL.lean.add(35.5, 0); FL.lean.add(35.75, 0.12, 'o'); FL.lean.add(36.4, 0, 'e');
// первый метеор: голова поднимается и провожает его
K(36.95, { lookY: -0.45, lookX: 0.4, headTilt: 0.2, neck: -0.02 }); K(37.2, { lookY: 0.7, lookX: 0.1, headTilt: 0, neck: 0.02 }, 'b');
K(37.3, { lookX: 0.1 }); K(37.7, { lookX: 0.75 }, 'io');
K(37.2, { lidT: 0.45, brow: -0.45 }); K(37.45, { lidT: 0.02, brow: 0, iris: 0.85 }, 'o');

/* ================= СЦЕНА 3 · Звездопад (38–54) ================= */
K(38.2, { lookX: 0.75 }); K(39.0, { lookX: -0.2 }, 'io');
K(39.25, { lookX: -0.2, iris: 0.85 }); K(39.55, { lookX: 0.55, iris: 0.7 }, 'o');
K(40.0, { lookX: 0.55 }); K(40.25, { lookX: -0.4 }, 'o'); K(40.5, { lookX: -0.4 }); K(40.75, { lookX: 0.35 }, 'o');
K(38.0, { tremble: 0 }); K(39.6, { tremble: 0.6 }); K(41.2, { tremble: 0.6 }); K(41.5, { tremble: 0 });
// вскакивает
K(41.2, { crouch: 1, sit: 1, sq: 1, y: 0, lean: 0.02 });
K(41.4, { sq: 0.84 }, 'io');
K(41.62, { crouch: 0, sit: 0, sq: 1.22, y: 0.1, neck: 0.04 }, 'o');
K(41.85, { y: 0, sq: 1.1 }, 'i'); K(41.95, { sq: 0.85 }, 'o'); K(42.2, { sq: 1 }, 'e');
K(41.4, { hAx: -0.015, hAy: -0.14, hBx: 0.03, hBy: -0.13 }); K(41.62, { hAx: -0.07, hAy: 0.12, hBx: 0.07, hBy: 0.12 }, 'o');
K(41.4, { lidT: 0.02, lidB: 0 }); K(41.55, { lidT: 0, iris: 0.65 });
// мечется: влево-вправо
const PAN = [[42.15, -0.85], [42.55, 0.85], [42.95, -0.85], [43.3, 0.85]];
PAN.forEach(([t, v]) => { K(t - 0.14, { yaw: -v * 0.6, headYaw: -v * 0.6, y: 0 }); K(t, { yaw: v, headYaw: v, y: 0.02 }, 'o'); K(t + 0.1, { y: 0 }, 'i'); });
K(43.35, { lookX: 0 }); K(43.4, { lookY: 0.4 });
// удар рядом: съёживается, закрывает голову руками
K(43.75, { crouch: 0, sq: 1, hAx: -0.07, hAy: 0.12, hBx: 0.07, hBy: 0.12 });
K(43.9, { crouch: 0.45, sq: 0.85, hAx: -0.04, hAy: 0.24, hBx: 0.04, hBy: 0.24, lidT: 0.55, lidB: 0.3 }, 'o');
K(44.3, { tremble: 0 }); K(44.4, { tremble: 1 }); K(45.2, { tremble: 1 }); K(45.35, { tremble: 0 });
K(44.4, { yaw: 0.85, headYaw: 0.85 }); K(44.7, { yaw: -0.85, headYaw: -0.95, crouch: 0.3, sq: 0.95 }, 'io');
K(44.7, { lidT: 0.55, lidB: 0.3 }); K(44.9, { lidT: 0.02, lidB: 0, lookX: -0.7, lookY: 0.1 }, 'o');
// упреждение и бегство к модулю
K(45.2, { lean: 0, crouch: 0.3 }); K(45.55, { lean: 0.2, crouch: 0.45 }, 'io');
walkSeg(45.7, 48.75, POS.kneel[0], POS.kneel[1], -1.95, 1.25, 24, { run: 1 });
K(45.7, { lean: -0.12, crouch: 0.45 }); K(45.95, { lean: -0.35, crouch: 0 }, 'o');
K(45.7, { hAx: -0.04, hAy: 0.24, hBx: 0.04, hBy: 0.24 });
// занос и остановка на полпути
K(48.75, { lean: -0.35, x: -1.95, z: 1.25 }); K(49.2, { lean: 0.25, x: -2.05, z: 1.3 }, 'o'); K(49.5, { lean: 0 }, 'e');
K(48.75, { crouch: 0 }); K(49.0, { crouch: 0.35 }, 'o'); K(49.5, { crouch: 0.1 }, 'io');
K(49.1, { hAx: -0.04, hAy: 0.24, hBx: 0.04, hBy: 0.24 }); K(49.6, { hAx: -0.02, hAy: -0.14, hBx: 0.02, hBy: -0.14 }, 'io');
// оглядывается через плечо на бутон
K(50.1, { headYaw: -0.95, lookX: -0.7 }); K(50.28, { headYaw: -1, lookX: -0.8 }, 'io'); K(50.75, { headYaw: 0.95, lookX: 0.7 }, 'o');
K(50.75, { lidT: 0.02, iris: 0.65 }); K(51.1, { iris: 1.25 }, 'o');
blink(51.3, 0.2);
K(51.6, { iris: 1.25, brow: 0 }); K(52.0, { iris: 0.85, brow: -0.55, lidT: 0.22 }, 'io');
K(52.0, { tremble: 0 }); K(52.2, { tremble: 0.4 }); K(53.8, { tremble: 0.4 }); K(54.0, { tremble: 0 });

/* ================= СЦЕНА 4 · Щит (54–70) ================= */
// решимость: веки щурятся, «брови» внутрь, кивок
K(54.2, { lidT: 0.22, brow: -0.55, lidB: 0 }); K(54.6, { lidT: 0.36, lidB: 0.16, brow: 0.8, iris: 0.8 }, 'io');
K(54.7, { headTilt: 0 }); K(54.85, { headTilt: 0.12 }, 'o'); K(55.05, { headTilt: 0 }, 'e');
K(55.2, { yaw: -0.85 }); K(55.55, { yaw: 0.9, headYaw: 0.95 }, 'o');
K(55.55, { lean: 0, crouch: 0.1 }); K(55.9, { lean: -0.25, crouch: 0.4, sq: 0.9 }, 'io');
walkSeg(56.0, 58.3, -2.05, 1.3, -0.62, 0.02, 19, { run: 1 });
K(56.0, { lean: -0.25, crouch: 0.4, sq: 0.9 }); K(56.2, { lean: 0.38, crouch: 0, sq: 1 }, 'o');
K(56.0, { hAx: -0.02, hAy: -0.14, hBx: 0.02, hBy: -0.14 });
// толчок взрывной волны позади и нырок к цветку
K(58.3, { y: 0 }); K(58.5, { y: 0.07 }, 'o'); K(58.75, { y: 0 }, 'i');
K(58.3, { lean: 0.38, x: -0.62, z: 0.02 }); K(58.6, { lean: 0.95, x: -0.46 }, 'o'); K(59.05, { x: -0.3, z: 0.05, lean: 1.0 }, 'o');
K(58.4, { crouch: 0 }); K(58.85, { crouch: 1 }, 'io');
K(58.5, { hAx: -0.02, hAy: -0.14, hBx: 0.02, hBy: -0.14, hwA: 0, hwB: 0 });
K(58.5, { wAx: -0.07, wAy: 0.025, wBx: -0.13, wBy: 0.02 });
K(59.0, { hwA: 1, hwB: 1 }, 'io');
K(58.6, { headTilt: 0 }); K(59.2, { headTilt: -0.1, lookY: -0.8, lookX: 0.2, lidT: 0.3, lidB: 0.1, brow: 0.3 }, 'io');
K(59.3, { tremble: 0 }); K(59.6, { tremble: 0.8 }); K(69.0, { tremble: 0.8 }); K(69.3, { tremble: 0.2 });
// удары по спине: вмятина, погнутая антенна, мигание глаза
K(63.23, { dent: 0 }); K(63.27, { dent: 1 }, 's');
K(63.23, { antBend: 0 }); K(63.35, { antBend: 1.05 }, 'o');
K(63.25, { eyeOn: 1 }); K(63.3, { eyeOn: 0.25 }, 's'); K(63.4, { eyeOn: 1 }, 's'); K(63.5, { eyeOn: 0.35 }, 's'); K(63.67, { eyeOn: 1 }, 's');
K(64.62, { eyeOn: 1 }); K(64.67, { eyeOn: 0.4 }, 's'); K(64.82, { eyeOn: 1 }, 's');
K(63.25, { lidT: 0.3, lidB: 0.1 }); K(63.35, { lidT: 0.75, lidB: 0.35 }, 'o'); K(63.95, { lidT: 0.35, lidB: 0.15 }, 'io');
K(64.62, { lidT: 0.35 }); K(64.72, { lidT: 0.7 }, 'o'); K(65.22, { lidT: 0.3 }, 'io');
// внутри укрытия: нежность — касается бутона
K(66.0, { lidT: 0.3, lidB: 0.15, brow: 0.3 }); K(66.6, { lidT: 0.22, lidB: 0.3, brow: -0.2, lookY: -0.85, lookX: 0.25 }, 'io');
K(66.9, { hwB: 1, wBx: -0.13, wBy: 0.02 }); K(67.5, { wBx: 0.255, wBy: 0.125 }, 'io'); K(68.4, { wBx: 0.255, wBy: 0.125 }); K(68.9, { wBx: -0.13, wBy: 0.02 }, 'io');
FL.lean.add(67.2, 0); FL.lean.add(67.7, -0.14, 'io'); FL.lean.add(68.6, -0.14); FL.lean.add(69.0, 0, 'io');
blink(68.0, 0.3);
K(68.5, { lookY: -0.85, lidT: 0.22, lidB: 0.3 }); K(68.8, { lookY: 0.4, lidT: 0.02, lidB: 0, iris: 0.7 }, 'o');
// большой метеор: сжимается сильнее, удар — глаз гаснет
K(69.5, { lean: 1.0, sq: 1 }); K(69.8, { lean: 1.08, sq: 0.9, lookY: -0.8, lidT: 0.6 }, 'io');
K(70.0, { y: 0 }); K(70.06, { y: 0.035 }, 'o'); K(70.2, { y: 0 }, 'i');
K(70.02, { sq: 0.9 }); K(70.1, { sq: 0.78 }, 'o'); K(70.5, { sq: 0.92 }, 'e');
K(70.05, { eyeOn: 1 }); K(70.12, { eyeOn: 0.3 }, 's'); K(70.2, { eyeOn: 0.8 }, 's'); K(70.3, { eyeOn: 0.15 }, 's'); K(70.42, { eyeOn: 0 }, 's');
K(70.3, { lidT: 0.6 }); K(71.2, { lidT: 0.8, lookY: -0.8 }, 'io');
K(70.1, { dead: 0 }); K(70.42, { dead: 1 }, 's');
K(70.2, { dust: 0 }); K(71.6, { dust: 0.62 }, 'o');
K(70.3, { tremble: 0 });

/* ================= СЦЕНА 5 · Тишина (70–88) ================= */
// перезагрузка: два холостых мигания и запуск
K(77.4, { eyeOn: 0 }); K(77.45, { eyeOn: 0.35 }, 's'); K(77.58, { eyeOn: 0 }, 's');
K(78.2, { eyeOn: 0 }); K(78.25, { eyeOn: 0.55 }, 's'); K(78.4, { eyeOn: 0 }, 's');
K(79.0, { eyeOn: 0.3 }, 's'); K(79.1, { eyeOn: 0 }, 's'); K(79.2, { eyeOn: 0.7 }, 's'); K(79.3, { eyeOn: 0.4 }, 's'); K(79.42, { eyeOn: 1 }, 's');
K(79.42, { dead: 0 }, 's');
K(79.42, { lidT: 0.8, iris: 0.5 }); K(80.1, { lidT: 0.3, iris: 1 }, 'o');
// распрямляется — со скрипом, в два приёма
K(80.1, { lean: 1.08, crouch: 1, sq: 0.92, hwA: 1, hwB: 1 });
K(80.7, { lean: 0.62, sq: 1 }, 'io'); K(80.95, { lean: 0.62 });
K(81.7, { lean: 0.22, crouch: 0.7, hwA: 0, hwB: 0 }, 'io');
K(80.95, { hAx: -0.02, hAy: -0.12, hBx: 0.03, hBy: -0.12 });
K(80.2, { dust: 0.62 }); K(81.7, { dust: 0.22 }, 'io');
K(81.0, { headTilt: -0.1, lookY: -0.8 }); K(81.6, { headTilt: 0, lookY: -0.7, lookX: 0.45 }, 'io');
// бутон цел: облегчение
K(81.75, { lidB: 0.05, lidT: 0.3 }); K(82.0, { lidB: 0.42, lidT: 0.1 }, 'o');
K(81.8, { sq: 1 }); K(82.0, { sq: 1.06 }, 'o'); K(82.3, { sq: 1 }, 'e');
// замечает голубое сияние справа
K(82.45, { lidB: 0.42, lookX: 0.45, lookY: -0.7, headYaw: 0.9 }); K(82.8, { lidB: 0.05, lookX: 0.85, lookY: 0.15 }, 'o');
K(82.9, { headTilt: 0 }); K(83.2, { headTilt: -0.25 }, 'o'); K(83.55, { headTilt: -0.25 }); K(83.75, { headTilt: 0, lidT: 0, iris: 1.25, neck: 0.03 }, 'b');
// встаёт и, прихрамывая, идёт к свежему кратеру
K(84.0, { crouch: 0.7, lean: 0.22 }); K(84.4, { crouch: 0, lean: 0, neck: 0 }, 'o');
walkSeg(84.45, 85.9, -0.3, 0.05, 1.08, 1.02, 12, { limp: 1 });
K(84.45, { yaw: 0.9 }); K(84.6, { yaw: 0.75 });
// наклоняется, достаёт лёд
K(85.95, { lean: 0, crouch: 0, hwA: 0, hwB: 0, lookY: 0 }); K(86.35, { lean: 0.55, crouch: 0.45, hwA: 1, hwB: 1, lookY: -0.7 }, 'io');
K(85.95, { wAx: 0.36, wAy: 0.06, wBx: 0.42, wBy: 0.06 });
ICE.state.add(86.35, 1, 's');
K(86.4, { lean: 0.55, crouch: 0.45, hwA: 1, hwB: 1 }); K(86.9, { lean: -0.05, crouch: 0, hwA: 0, hwB: 0, lookY: -0.1, lookX: 0.4 }, 'io');
K(86.4, { hAx: 0.09, hAy: 0.1, hBx: 0.13, hBy: 0.1 });
K(86.9, { lidB: 0.05 }); K(87.1, { lidB: 0.4, iris: 1.2 }, 'o');
// несёт лёд к лейке
K(87.3, { yaw: 0.75, headYaw: 0.9 }); K(87.55, { yaw: -0.85, headYaw: -0.85 }, 'o');
walkSeg(87.6, 88.9, 1.08, 1.02, -0.2, -0.12, 11, { limp: 0.7 });

/* ================= СЦЕНА 6 · Рассвет (88–108) ================= */
// лёд в лейку — «плюх»
K(89.0, { crouch: 0, lean: 0, hwA: 0, hwB: 0 }); K(89.3, { crouch: 0.4, lean: 0.35, hwA: 1, hwB: 1 }, 'io');
K(89.0, { wAx: -0.26, wBx: -0.21, wAy: 0.17, wBy: 0.17 });
ICE.state.add(89.3, 2, 's');
K(89.35, { hwA: 1 }); K(89.6, { hwA: 0 }, 'io');
K(89.35, { lidB: 0.4 }); K(89.6, { lidB: 0.1 });
// берёт лейку и поворачивается к цветку
K(89.5, { wBx: -0.24, wBy: 0.16 }); K(89.62, { hwB: 1 });
CAN.held.add(89.65, 1, 's');
K(89.7, { hwB: 1, hBx: 0.05, hBy: -0.1 }); K(89.95, { hwB: 0 }, 'io');
K(89.75, { yaw: -0.85, headYaw: -0.85 }); K(90.05, { yaw: 0.85, headYaw: 0.9 }, 'o');
K(90.05, { crouch: 0.4, lean: 0.3 });
K(90.1, { hBx: 0.05, hBy: -0.1, canTilt: 0 }); K(90.45, { hBx: 0.15, hBy: 0.0, canTilt: 0.6 }, 'io');
K(90.45, { lookX: 0.5, lookY: -0.5, lidB: 0.3 });
K(92.3, { canTilt: 0.6, hBx: 0.15, hBy: 0.0 }); K(92.7, { canTilt: 0.1, hBx: 0.07, hBy: -0.1 }, 'io');
// замечает рассвет слева
K(92.35, { headYaw: 0.9, lookX: 0.5, lookY: -0.5 }); K(92.75, { headYaw: 0.95, lookX: 0.85, lookY: 0.25, lidB: 0.05 }, 'o');
K(92.8, { lidT: 0.12 }); K(93.0, { lidT: 0, iris: 0.85 });
// встаёт, ставит лейку, смотрит на солнце
K(93.3, { hwB: 0, wBx: -0.27, wBy: 0.13 }); K(93.6, { hwB: 1 }, 'io'); K(93.8, { hwB: 0 }, 'io');
K(93.2, { yaw: 0.85 }); K(93.45, { yaw: -0.5 }, 'io'); K(93.7, { yaw: -0.5 }); K(93.95, { yaw: 0.85 }, 'io');
CAN.held.add(93.62, 0, 's'); CAN.x.add(93.62, -0.47, 's'); CAN.z.add(93.62, -0.1, 's');
K(93.7, { crouch: 0.4, lean: 0.3 }); K(94.2, { crouch: 0, lean: 0 }, 'io');
K(94.0, { yaw: 0.85 }); K(94.4, { yaw: 0.55, headYaw: 0.6, lookX: 0.4, lookY: 0.2 }, 'io');
K(95.0, { lidB: 0.05, lidT: 0 }); K(95.6, { lidB: 0.35, lidT: 0.22, iris: 0.7 }, 'io');
// козырёк ладонью от солнца
K(96.0, { hAx: -0.015, hAy: -0.14 }); K(96.5, { hAx: -0.1, hAy: 0.2 }, 'io'); K(97.4, { hAx: -0.1, hAy: 0.2 }); K(97.9, { hAx: -0.015, hAy: -0.14 }, 'io');
// опускается к цветку — тот раскрывается
K(97.9, { yaw: 0.55, headYaw: 0.6 }); K(98.3, { yaw: 0.85, headYaw: 0.9, lookX: 0.45, lookY: -0.5 }, 'o');
K(98.2, { crouch: 0, lean: 0 }); K(98.7, { crouch: 0.6, lean: 0.28 }, 'io');
K(99.3, { lidB: 0.35, lidT: 0.22, iris: 0.7 }); K(99.7, { lidB: 0, lidT: 0, iris: 1.35 }, 'o');
K(101.7, { lidB: 0 }); K(102.0, { lidB: 0.48 }, 'o');
K(101.9, { sq: 1 }); K(102.05, { sq: 0.9 }, 'o'); K(102.25, { sq: 1.08, y: 0.03 }, 'o'); K(102.45, { sq: 1, y: 0 }, 'e');
FL.b.add(98.6, 0); FL.b.add(101.6, 1, 'o');
FL.glow.add(98.6, 0); FL.glow.add(101.0, 0.7, 'io'); FL.glow.add(108, 0.5);
FL.perk.add(90.4, 0.45); FL.perk.add(92.5, 1, 'e');
FL.g.add(90.4, 1); FL.g.add(93, 1.06, 'o');
// финал: садится рядом и смотрит на Землю
K(102.8, { crouch: 0.6, sit: 0, lean: 0.28 }); K(103.5, { crouch: 1, sit: 1, lean: 0.02 }, 'io');
K(103.6, { lookY: -0.5, headTilt: 0 }); K(104.1, { lookY: 0.55, lookX: 0.3, lidB: 0.3 }, 'io');
K(104.3, { lookX: 0.3 }); K(105.2, { lookX: 0.8 }, 'io');
K(105.3, { headTilt: 0, lookY: 0.55 }); K(105.9, { headTilt: -0.16, lookY: -0.2, lookX: 0.5, lidB: 0.45 }, 'io');
blink(105.2);

/* ---------- Автоматические моргания в спокойные моменты ---------- */
[18.4, 19.9, 27.0, 34.6, 36.1, 38.6, 46.5, 57.2, 83.9, 85.3, 91.1, 94.8, 100.2, 103.9, 107.1].forEach((t) => blink(t));
BLINKS.sort((a, b) => a[0] - b[0]);
for (const n in RB) RB[n].sort();

/* ---------- Реакции на удары рядом (вздрагивание) ---------- */
function flinchAt(t) {
  let f = 0;
  for (let k = 0; k < IMPACTS.length; k++) {
    const im = IMPACTS[k];
    const dt = t - im.t;
    if (dt < 0 || dt > 0.6) continue;
    const d = hyp(im.x - RB.x.at(im.t), im.z - RB.z.at(im.t));
    const s = im.big ? 1 : clamp(1.6 / (d + 0.6), 0, 1) * (im.near ? 1 : 0.15);
    f = Math.max(f, s * Math.exp(-dt * 7) * Math.sin(Math.min(1, dt * 14) * Math.PI * 0.5 + 0.2));
  }
  return f;
}

/* ---------- Поза в момент t ---------- */
const POSE = robotPose();
Object.assign(POSE, { hwA: 0, hwB: 0, wAx: 0, wAy: 0, wBx: 0, wBy: 0, sit: 0, tremble: 0, sleep: 0, dead: 0 });
function robotAt(t, out) {
  out = out || POSE;
  for (const n in RB) out[n] = RB[n].at(t);
  // моргание
  for (let k = 0; k < BLINKS.length; k++) {
    const b = BLINKS[k];
    const u = (t - b[0]) / b[1];
    if (u > 0 && u < 1) out.lidT = Math.max(out.lidT, Math.sin(u * Math.PI) * 1.02);
  }
  // дыхание сервоприводов и дрожь
  const alive = 1 - out.dead;
  out.sq += (0.006 * Math.sin(t * 2.2) * (1 - out.walkAmt) * alive) + out.tremble * 0.014 * Math.sin(t * 47);
  out.lookX += 0.04 * Math.sin(t * 1.3) * alive * (1 - out.sleep);
  const fl = flinchAt(t) * alive;
  out.sq -= fl * 0.12; out.crouch = Math.min(1, out.crouch + fl * 0.2);
  // размах свободной руки на ходу
  if (out.walkAmt > 0.01 && !out.run) {
    const sw = Math.sin(out.walk * Math.PI) * 0.035 * out.walkAmt;
    out.hAx += sw; out.hAy += Math.abs(sw) * 0.3;
    if (!CAN.held.at(t)) { out.hBx -= sw; out.hBy += Math.abs(sw) * 0.3; }
  }
  if (out.limp > 0 && out.walkAmt > 0) {
    const ph = ((out.walk % 2) + 2) % 2;
    out.crouch += out.limp * 0.18 * Math.max(0, Math.sin(ph * Math.PI)) * (ph < 1 ? 1 : 0.2);
    out.lean += out.limp * 0.06 * Math.sin(out.walk * Math.PI);
  }
  // лампочка на антенне: сердцебиение, во сне — медленно, после удара — погасла
  const beat = Math.pow(Math.max(0, Math.sin(t * Math.PI * 0.9)), 16);
  const slow = 0.25 + 0.35 * Math.pow(Math.max(0, Math.sin(t * 1.2)), 4);
  out.bulb = out.dead > 0.5 ? 0 : out.sleep > 0.5 ? slow : 0.25 + 0.9 * beat;
  // антенна: запечённая пружина
  out.antenna = antennaAt(t);
  out.can = CAN.held.at(t) > 0.5 ? 1 : 0;
  return out;
}

/* ---------- Запекание пружины антенны ----------
   Пружина — не функция от t, а интеграл движения. Интегрируем весь фильм
   один раз при загрузке (120 Гц) и дальше читаем таблицу: перемотка
   остаётся точной. */
const ANT_HZ = 120;
let ANT_TABLE = null;
function bakeAntenna() {
  const n = Math.ceil(DURATION * ANT_HZ) + 2;
  ANT_TABLE = new Float32Array(n);
  const p = robotPose();
  Object.assign(p, POSE);
  const dt = 1 / ANT_HZ;
  const hx = new Float32Array(n), hl = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i * dt;
    for (const k of ['x', 'y', 'crouch', 'lean', 'sq', 'neck', 'headTilt', 'yaw']) p[k] = RB[k].at(t);
    const dir = p.yaw >= 0 ? 1 : -1;
    const pel = 0.165 - p.crouch * 0.085 + p.y;
    const topY = pel + (0.235 + p.neck + 0.17) * p.sq;
    hx[i] = p.x + Math.sin(p.lean * dir) * topY;
    hl[i] = -p.lean * dir - p.headTilt * dir;
  }
  let th = 0, w = 0;
  const k = Math.pow(TAU * 3.2, 2), c = 2 * 0.14 * TAU * 3.2;
  for (let i = 1; i < n - 1; i++) {
    const ax = (hx[i + 1] - 2 * hx[i] + hx[i - 1]) / (dt * dt);
    const aa = (hl[i + 1] - 2 * hl[i] + hl[i - 1]) / (dt * dt);
    const acc = -k * th - c * w - ax / 0.09 * 0.35 - aa * 0.5;
    w += acc * dt; th += w * dt;
    th = clamp(th, -0.9, 0.9);
    ANT_TABLE[i] = th;
  }
}
function antennaAt(t) {
  if (!ANT_TABLE) return 0;
  const f = clamp(t * ANT_HZ, 0, ANT_TABLE.length - 2);
  const i = f | 0, u = f - i;
  return ANT_TABLE[i] * (1 - u) + ANT_TABLE[i + 1] * u;
}

/* ---------- Капли воды: время и место отрыва от носика ---------- */
function bakeDrops() {
  const times = [26.4, 26.9, 27.4, 28.98];
  for (let t = 90.5; t < 92.4; t += 0.19) times.push(t);
  const p = robotPose();
  Object.assign(p, POSE);
  for (const t of times) {
    robotAt(t, p);
    // прогон рига без отрисовки: цель — крошечная маска
    const dummy = { w: 1, h: 1, data: new Uint8Array(1) };
    TG = dummy;
    drawRobot([1, 0, 0, -1, 0, 0], 0, p, 1);
    TG = null;
    const x = RB.x.at(t) + ROBOT_OUT.canTipX, y = ROBOT_OUT.canTipY, z = RB.z.at(t) - 0.12;
    DROPS.push({ t0: t, x, y, z, vx: 0.25, vy: 0.05 });
    FLOOR.wet.push({ x: t > 90 ? 0.02 : x + 0.12, z: t > 90 ? -0.02 : 0.0, r: t > 90 ? 0.1 + 0.004 * (t - 90) * 10 : 0.07, t0: t + 0.5, t1: t > 90 ? 104 : 31 });
  }
}
