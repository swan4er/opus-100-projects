'use strict';
/* ==========================================================================
   «Девочка и ветер» · film.js
   Движок фильма: весь кадр — функция времени t.
   Здесь хронометраж сцен, хореография девочки, змей и банка, путь духа
   ветра, камеры планов, вставки, титры, переходы и «плёнка».
   ========================================================================== */

const DURATION = 112;
const G_S = 0.85;             // масштаб девочки в мире
const TREE_X = 1500;
const KITE_REST = [1296, 0];  // где лежит змей
const JAR_REST = 1418;        // где стоит банка утром
const JAR_PUT = 1178;         // куда девочка ставит банку в финале

const SCENES = [
  { t: 0, name: 'Заря' },
  { t: 22, name: 'Игра' },
  { t: 46, name: 'Банка' },
  { t: 64, name: 'Тишина' },
  { t: 84, name: 'Отпустить' },
];

/* ---------- Небо во времени ---------- */
const SKY_KEYS = [
  [0, PAL.dawn], [15, PAL.dawn], [24, PAL.morning], [30, PAL.day], [38, PAL.day], [43, PAL.golden],
  [47.5, PAL.sunset], [58, PAL.sunset], [63, PAL.ember], [69, PAL.ash], [80, PAL.ash], [86.5, PAL.dull],
  [BURST_T + 0.2, PAL.dull], [BURST_T + 2.6, PAL.night], [DURATION, PAL.night],
];
function skyAt(t) { return keyObj(SKY_KEYS, t, mixPal); }
const SUN_KEYS = [
  [0, { x: 1580, y: 640, r: 50, a: 1, halo: 9, bands: 0 }],
  [18, { x: 1510, y: 430, r: 52, a: 1, halo: 9, bands: 0 }],
  [29, { x: 1180, y: -140, r: 56, a: 1, halo: 10, bands: 0 }],
  [40, { x: 720, y: 110, r: 60, a: 1, halo: 9, bands: 0 }],
  [46, { x: 430, y: 380, r: 72, a: 1, halo: 8, bands: 0.4 }],
  [52, { x: 330, y: 540, r: 86, a: 1, halo: 8, bands: 1 }],
  [58, { x: 300, y: 640, r: 90, a: 1, halo: 7, bands: 1 }],
  [63, { x: 290, y: 760, r: 90, a: 0.6, halo: 6, bands: 1 }],
  [66, { x: 290, y: 800, r: 90, a: 0, halo: 6, bands: 1 }],
];
function sunAt(t) { return t > 66 ? null : keyObj(SUN_KEYS, t, mixNum); }
const MOON_KEYS = [
  [78, { x: 1590, y: 470, r: 44, a: 0 }],
  [86, { x: 1560, y: 330, r: 46, a: 0.3 }],
  [BURST_T + 0.4, { x: 1530, y: 270, r: 48, a: 0.35 }],
  [BURST_T + 2.4, { x: 1520, y: 250, r: 50, a: 1 }],
  [DURATION, { x: 1480, y: 190, r: 52, a: 1 }],
];
function moonAt(t) { return t < 78 ? null : keyObj(MOON_KEYS, t, mixNum); }
function starsAt(t) { return key([[82, 0], [88, 0.22], [BURST_T + 0.3, 0.22], [BURST_T + 2.6, 1]], t); }

/* ---------- Девочка: хореография ---------- */
function PS(base, over) { return P_(over || {}, POSES[base] || POSE0); }
function PT(keys) { return (t) => keyObj(keys, t, mixNum); }
const sy = (x) => groundY(x) - 89; // таз стоящей девочки

// позы-ключи
const A_SIT = PS('sitHug', { neck: 14, head: 10 });
const A_SIT2 = PS('sitHug', { neck: 17, head: 17, lean: 22 });
const A_IN = PS('sitHug', { lean: 9, neck: -1, head: -3, sN: 56, sF: 50 });
const A_OUT = PS('sitHug', { lean: 27, neck: 19, head: 17, eye: 0.5, sN: 67, sF: 61 });
const A_NOTE = PS('sitHug', { lean: 15, neck: 6, head: 2, brow: 0.6 });
const A_DIP = PS('sitHug', { lean: 19, neck: 11, head: 14, brow: 0.6 });
const A_LOOK = PS('sitUp', { neck: -10, head: -17, look: 1, brow: 1 });
const A_BACK = PS('sitUp', { lean: -8, neck: -12, head: -18, sN: -26, eN: 6, sF: -32, eF: 6, wN: -40, wF: -40, gN: 0, gF: 0, look: 1, brow: 0.8 });

const B_F1 = P_({ neck: -18, head: -24, smile: 0.5, look: 1 }, A_BACK);
const B_F2 = P_({ neck: -2, head: 6, smile: 0.9, mouth: 0.3, look: 0 }, A_BACK);
const B_CROUCH = PS('crouch', { smile: 1, eye: 0.9, brow: 0.3 });
const B_JUMP = PS('jumpUp', {});
const B_LAND = PS('land', { smile: 1, eye: 0, sN: 120, eN: 30, sF: 110, eF: 30 });
const B_STAND = PS('stand', { smile: 1, eye: 0, head: -6, sN: 30, eN: 30, sF: 24, eF: 34 });
const B_BEND = PS('stand', { lean: 44, hN: 46, kN: 58, hF: 32, kF: 42, sN: 46, eN: 18, sF: 40, eF: 22, neck: 10, head: 12, gN: 0.3, gF: 0.3, smile: 0.8 });
const B_GRAB = P_({ gN: 1, gF: 1 }, B_BEND);
const B_UP = PS('armsUp', { head: -22, smile: 1, eye: 1, gN: 1, gF: 1 });
const B_LET = PS('armsUp', { sN: 164, eN: 6, sF: 152, eF: 10, gN: 0, gF: 0, head: -28, neck: -10, eye: 1, mouth: 0.6, smile: 0.6 });
const B_HOLD = PS('stand', { sN: 130, eN: 24, gN: 1, sF: 16, eF: 40, head: -26, neck: -10, lean: -6, smile: 1, eye: 1 });
const B_HOLD2 = P_({ lean: -10, hN: -10, kN: 6, hF: 14, kF: 10, mouth: 0.4 }, B_HOLD);

const C_RUN = PS('stand', { sN: -138, eN: 12, wN: 10, gN: 1, head: -6, neck: -4, smile: 0.8, mouth: 0.4 });
const C_STR = PS('stand', { sN: 72, eN: 58, sF: 66, eF: 62, gN: 1, gF: 1, head: -24, neck: -9, smile: 0.8 });

const D_SW1 = P_({ lean: -6, rot: -3, aN: 18, aF: 18, head: -28 }, C_STR);
const D_SW2 = P_({ lean: 4, rot: 3, head: -20 }, C_STR);
const D_PULL = PS('stand', { lean: -16, hN: 26, kN: 8, hF: -10, kF: 18, sN: 150, eN: 8, sF: 146, eF: 10, gN: 1, gF: 1, head: -26, neck: -10, brow: 0.5, mouth: 0.3, smile: 0.4 });
const D_TIP = P_({ lean: -4, aN: 32, aF: 32, hN: 4, hF: -4, kN: 2, kF: 4 }, D_PULL);
const D_LIFT = PS('stand', { sN: 176, eN: 4, sF: 171, eF: 6, gN: 1, gF: 1, hN: 8, kN: 26, aN: 30, hF: -6, kF: 40, aF: 34, head: -20, neck: -6, eye: 0, smile: 1, mouth: 0.7 });
const D_DG1 = P_({ hN: 26, kN: 52, hF: -14, kF: 20, rot: -4 }, D_LIFT);
const D_DG2 = P_({ hN: -6, kN: 18, hF: 24, kF: 58, rot: 5 }, D_LIFT);

const E_DESC = P_({ hN: 20, kN: 14, hF: 10, kF: 22, aN: 10, aF: 12, hairUp: 0.9, eye: 1 }, D_LIFT);
const E_LAND = PS('land', { sN: 150, eN: 10, sF: 140, eF: 12, gN: 1, gF: 1, eye: 0, smile: 1 });
const E_STAND = PS('stand', { sN: 140, eN: 16, gN: 1, sF: 30, eF: 70, head: -12, eye: 0, smile: 1, mouth: 0.4 });
const E_LAUGH = PS('stand', { sN: 134, eN: 18, gN: 1, sF: 40, eF: 112, wF: 20, neck: -12, head: -22, eye: 0, smile: 1, mouth: 0.9, lean: -4 });
const E_WALK = PS('stand', { sN: 128, eN: 24, gN: 1, head: -14, smile: 0.9, eye: 1 });
const E_CROUCH = PS('crouch', { sN: 126, eN: 28, gN: 1, head: -10, smile: 0.8, sF: -10, eF: 20 });
const E_SIT = PS('sitUp', { lean: -8, sN: 128, eN: 28, gN: 1, sF: -30, eF: 6, wF: -40, gF: 0, head: -14, neck: -6, smile: 0.8 });

const F_UP = P_({ neck: -16, head: -20, smile: 1 }, E_SIT);
const F_BRUSH = P_({ neck: 4, head: 8, eye: 0, smile: 1 }, E_SIT);
const F_WATCH = P_({ neck: -2, head: -6, smile: 0.1, eye: 1, brow: 0.4 }, E_SIT);
const F_RISE = PS('crouch', { sN: 128, eN: 30, gN: 1, head: -4, brow: 0.5 });
const F_STAND = PS('stand', { sN: 150, eN: 22, gN: 1, head: -20, neck: -6, brow: 0.5, sad: 0.2 });
const F_CATCH = PS('stand', { sN: 60, eN: 96, sF: 54, eF: 102, gN: 1, gF: 1, head: 4, sad: 0.3 });
const F_REACH = PS('reach', { sF: 58, eF: 100, gF: 1, sad: 0.7, brow: 0.4, head: -10, neck: -6 });
const F_REACH2 = P_({ lean: 26, sN: 102, sad: 0.9 }, F_REACH);

const G_DECIDE = PS('stand', { head: -4, brow: -0.6, eye: 1, sN: 20, eN: 20, sF: 24, eF: 30, gF: 0 });
const G_GRAB = PS('stand', { lean: 46, hN: 58, kN: 72, hF: 38, kF: 52, sN: 62, eN: 10, sF: 56, eF: 16, neck: 10, head: 12, gN: 1, gF: 1, brow: -0.5 });
const G_RUN = PS('stand', { sN: 78, eN: 26, gN: 1, gF: 1, head: -2, brow: -0.7, mouth: 0.15 });
const G_PRE = PS('crouch', { sN: 60, eN: 40, sF: -40, eF: 40, gN: 1, gF: 1, brow: -0.8, lean: 36, head: -12 });
const G_LEAP = PS('stand', { rot: 16, lean: 10, hN: 42, kN: 22, hF: -42, kF: 64, sN: 98, eN: 6, sF: 62, eF: 62, gN: 1, gF: 1, head: -8, brow: -0.8, mouth: 0.4, sq: 1.06 });
const G_SLAM = PS('stand', { rot: 10, lean: 12, hN: 30, kN: 40, hF: -20, kF: 70, sN: 88, eN: 30, sF: 90, eF: 34, gN: 1, gF: 1, head: 0, brow: 0.3, mouth: 0.2 });
const G_LAND = PS('land', { sN: 80, eN: 40, sF: 84, eF: 44, gN: 1, gF: 1, sq: 0.88, head: 8 });
const G_STUM = PS('stand', { lean: 18, hN: 34, kN: 10, hF: -24, kF: 30, sN: 80, eN: 40, sF: 84, eF: 44, gN: 1, gF: 1 });
const G_LOOK = PS('stand', { sN: 94, eN: 58, sF: 98, eF: 56, gN: 1, gF: 1, head: -8, brow: 0.6 });

const H_FACE = PS('stand', { sN: 113, eN: 50, sF: 115, eF: 48, gN: 1, gF: 1, neck: -2, head: 4, brow: 1, look: 0.3 });
const H_CLOSE = P_({ sN: 106, eN: 64, sF: 108, eF: 62, head: 8, lean: 4 }, H_FACE);
const H_SMILE = P_({ eye: 0, smile: 1, brow: 0.2 }, H_CLOSE);
const H_HUG = PS('hugJar', { head: 18, neck: 10, eye: 0, smile: 1, sN: 36, eN: 112, sF: 32, eF: 116 });
const H_HUGR = P_({ rot: 4, head: 22 }, H_HUG);
const H_HUGL = P_({ rot: -3, head: 15 }, H_HUG);
const H_OUT = PS('stand', { sN: 100, eN: 44, sF: 102, eF: 42, gN: 1, gF: 1, head: -4, smile: 0.3, brow: 0.2 });
const H_DOUBT = P_({ head: -10, smile: 0, brow: 0.4, sad: 0.35 }, H_OUT);

const I_STILL = PS('hugJar', { head: -4, neck: -6, brow: 0.5, sad: 0.3 });
const I_UP = P_({ neck: -14, head: -17, look: 1 }, I_STILL);
const I_BACK = P_({ head: 6, neck: 4, sad: 0.6 }, I_STILL);

const J_MID = PS('crouch', { sN: 60, eN: 80, sF: 55, eF: 85, gN: 1, gF: 1, head: 10, sad: 0.4 });
const J_SIT = PS('sitHug', { hN: 90, kN: 122, hF: 84, kF: 118, sN: 50, eN: 60, sF: 46, eF: 64, lean: 14, neck: 14, head: 16, sad: 0.4, gN: 1, gF: 1 });
const J_EYE = P_({ sN: 96, eN: 62, sF: 98, eF: 60, neck: 2, head: 0, lean: 10, sad: 0.6 }, J_SIT);
const J_BROW = P_({ sN: 88, eN: 80, sF: 90, eF: 78, lean: 22, neck: 14, head: 22, eye: 0, sad: 1 }, J_SIT);
const J_SLUMP = P_({ lean: 30, neck: 22, head: 20, eye: 0.35, sad: 1, sN: 44, eN: 66, sF: 40, eF: 70 }, J_SIT);
const J_SLUMP2 = P_({ neck: 27, head: 23 }, J_SLUMP);
const J_UP = P_({ lean: 6, neck: -10, head: -16, eye: 1, sad: 0.2, brow: 0.7, look: 1 }, J_SIT);
const J_RISE = PS('crouch', { sN: 44, eN: 100, sF: 40, eF: 104, gN: 1, gF: 1, head: -6, brow: 0.3 });
const J_RES = PS('hugJar', { head: 0, neck: -2, brow: 0.2 });

const K_WALK = PS('hugJar', { head: 6, neck: 2, lean: 6, brow: 0.1 });

const L_LAST = PS('hugJar', { head: 14, neck: 8, sad: 0.3 });
const L_DIP = PS('hugJar', { lean: 10, hN: 18, kN: 30, hF: 12, kF: 28, head: 10, sN: 28, eN: 90, sF: 24, eF: 94 });
const L_RAISE = PS('liftJar', { aN: 18, aF: 18 });
const L_TW1 = P_({ wF: 28, eF: 16 }, L_RAISE);
const L_TW2 = P_({ wF: -16, eF: 4 }, L_RAISE);
const L_FLICK = P_({ sF: 128, eF: -12, wF: -24, gF: 0 }, L_RAISE);
const L_OPEN = PS('liftJar', { sF: 168, eF: 8, gF: 1, head: -24, brow: 0.8 });

const M_BLAST = PS('liftJar', { lean: -16, sN: 182, eN: 2, sF: 178, eF: 4, head: -30, neck: -14, eye: 0, smile: 0, mouth: 0.6, aN: 26, aF: 26, hairUp: 0.45 });
const M_BLAST2 = P_({ lean: -10, smile: 1, mouth: 0.5, hairUp: 0.3 }, M_BLAST);
const M_OPEN = PS('armsOpen', { sN: 118, eN: 44, gN: 1, head: -26, neck: -12, hairUp: 0.5 });
const M_LOOK1 = P_({ head: -10, neck: -4, eye: 1, smile: 1, sN: 70, eN: 60, sF: -40, eF: 30 }, M_OPEN);
const M_LOOK2 = P_({ head: -18, look: 1 }, M_LOOK1);
const M_PUT = PS('stand', { lean: 44, hN: 56, kN: 76, hF: 36, kF: 56, sN: 50, eN: 10, gN: 1, sF: 30, eF: 20, head: 10, smile: 0.8 });
const M_PUT2 = P_({ gN: 0 }, M_PUT);
const M_FREE = PS('stand', { head: -8, smile: 0.8 });

const N_CAR = PS('stand', { sN: 36, eN: 116, sF: 32, eF: 120, gN: 0.6, gF: 0.6, head: 14, neck: 6, eye: 0, smile: 1, lean: 2 });
const N_CAR2 = P_({ head: 20, rot: 3 }, N_CAR);
const N_SEE = PS('stand', { sN: 30, eN: 80, sF: 28, eF: 84, head: -14, neck: -6, smile: 0.6, brow: 0.6, look: 1 });
const N_REACH = PS('stand', { lean: 8, sN: 118, eN: 8, gN: 0, sF: 20, eF: 30, head: -20, smile: 0.8 });
const N_CATCH = P_({ gN: 1 }, N_REACH);
const N_HOLD = PS('stand', { lean: -4, sN: 138, eN: 28, gN: 1, sF: 150, eF: 20, head: -28, neck: -10, smile: 1, mouth: 0.35 });
const N_W1 = P_({ sF: 160, wF: 32 }, N_HOLD);
const N_W2 = P_({ sF: 150, wF: -22 }, N_HOLD);
const O_CALM = PS('stand', { lean: -3, sN: 136, eN: 30, gN: 1, sF: 12, eF: 30, head: -24, neck: -8, smile: 1 });

const POSE_TRACK = PT([
  [0, A_SIT], [5.5, A_SIT], [6.8, A_SIT2], [10.6, A_SIT2], [11.3, A_IN], [12.2, A_OUT], [12.9, A_SIT],
  [13.35, A_SIT], [13.6, A_NOTE], [13.95, A_DIP], [14.5, A_LOOK, 'outBack'], [15.3, A_BACK], [16, A_BACK],
  [16.5, B_F1], [17.0, B_F2], [17.65, B_CROUCH, 'io'], [18.0, B_JUMP, 'out'], [18.5, B_JUMP], [18.62, B_LAND, 'in'],
  [18.95, B_STAND, 'softBack'], [19.25, B_BEND], [19.45, B_GRAB], [19.95, B_UP, 'io'], [20.3, B_LET, 'out'],
  [20.9, B_HOLD], [21.6, B_HOLD2], [22.0, C_RUN],
  [29.3, C_RUN], [29.9, C_STR], [30.8, D_SW1], [31.6, D_SW2], [32.4, D_SW1], [33.0, D_PULL], [33.7, D_TIP],
  [34.1, D_LIFT, 'out'], [35.0, D_DG1], [35.8, D_DG2], [36.6, D_DG1], [37.4, D_DG2], [38.2, D_DG1],
  [39.1, E_DESC], [39.6, E_LAND, 'in'], [39.95, E_STAND, 'softBack'], [40.4, E_LAUGH], [41.9, E_LAUGH],
  [42.2, E_WALK], [43.2, E_WALK], [43.55, E_WALK], [44.1, E_CROUCH], [44.8, E_SIT, 'out'], [46, E_SIT],
  [46.6, F_UP], [47.15, F_BRUSH], [47.7, F_WATCH], [48.3, F_WATCH], [48.8, F_RISE], [49.25, F_STAND, 'out'],
  [49.6, F_CATCH, 'out'], [50.3, F_REACH], [51.4, F_REACH2], [52.0, F_REACH2],
  [52.25, G_DECIDE, 'out'], [52.6, G_DECIDE], [52.85, G_GRAB], [53.15, G_GRAB], [53.4, G_RUN], [55.45, G_RUN],
  [55.62, G_PRE], [55.85, G_LEAP, 'out'], [56.0, G_SLAM, 'out'], [56.3, G_SLAM], [56.45, G_LAND, 'in'],
  [56.75, G_STUM], [57.2, G_LOOK], [58.0, H_FACE],
  [59.3, H_CLOSE], [59.9, H_SMILE], [60.6, H_HUG], [61.3, H_HUGR], [62.0, H_HUGL], [62.6, H_OUT], [63.4, H_DOUBT],
  [64.0, I_STILL], [64.5, I_STILL], [65.2, I_UP], [66.4, I_STILL], [67.1, I_STILL], [67.7, I_BACK], [73.0, I_BACK],
  [73.8, J_MID], [74.7, J_SIT, 'out'], [77.3, J_SIT], [78.2, J_EYE], [79.0, J_BROW], [80.4, J_BROW],
  [81.1, J_SLUMP], [81.8, J_SLUMP2], [82.5, J_UP, 'outBack'], [83.1, J_RISE], [83.8, J_RES, 'out'], [84.3, J_RES],
  [84.6, K_WALK], [89.8, K_WALK], [90.2, L_LAST], [90.7, L_DIP], [91.4, L_RAISE, 'out'], [91.65, L_TW1],
  [91.8, L_TW2], [91.95, L_TW1], [92.1, L_FLICK, 'out'], [92.55, L_OPEN], [BURST_T, L_OPEN],
  [BURST_T + 0.25, M_BLAST, 'out'], [95.0, M_BLAST2], [95.9, M_OPEN], [97.2, M_LOOK1], [98.2, M_LOOK2],
  [99.0, M_PUT], [99.45, M_PUT2], [100.0, M_FREE],
  [100.5, N_CAR], [101.4, N_CAR2], [101.9, N_SEE, 'out'], [102.5, N_REACH], [102.8, N_CATCH], [103.4, N_HOLD],
  [104.2, N_W1], [104.6, N_W2], [105.0, N_W1], [105.8, O_CALM], [DURATION, O_CALM],
]);

const X_TRACK = [
  [0, 1360], [17.2, 1360], [18.9, 1340], [21.2, 1332], [22.0, 1300, 'in'], [28.4, 640, 'lin'], [29.4, 575, 'out'],
  [39.6, 1255], [42.1, 1255], [43.2, 1330], [49.6, 1330], [50.6, 1292], [52.3, 1292], [52.8, 1352], [53.2, 1352],
  [53.7, 1305, 'in'], [55.45, 1000, 'lin'], [55.95, 905, 'lin'], [56.45, 872, 'out'], [57.0, 848, 'out'],
  [84.3, 848], [84.9, 872, 'in'], [89.2, 1112, 'lin'], [89.8, 1135, 'out'], [DURATION, 1135],
];
const F_TRACK = [
  [0, -1], [29.55, -1], [29.8, 1, 'lin'], [43.2, 1], [43.45, -1, 'lin'], [52.25, -1], [52.45, 1, 'lin'],
  [53.0, 1], [53.2, -1, 'lin'], [67.2, -1], [67.45, 1, 'lin'], [DURATION, 1],
];
const LIFT_TRACK = [
  [0, 0], [17.95, 0], [18.25, 40, 'out'], [18.55, 0, 'in'], [55.62, 0], [55.86, 28, 'out'], [56.0, 31], [56.42, 0, 'in'], [DURATION, 0],
];
const CYCLE_TRACK = [ // 0 — нет, иначе вес цикла
  [0, 0], [22.0, 0], [22.6, 1], [28.7, 1], [29.4, 0],
  [42.1, 0], [42.3, 1], [43.0, 1], [43.25, 0],
  [49.7, 0], [49.9, 0.8], [50.5, 0.8], [50.65, 0],
  [52.3, 0], [52.4, 0.8], [52.7, 0.8], [52.8, 0],
  [53.2, 0], [53.5, 1], [55.4, 1], [55.56, 0],
  [56.45, 0], [56.55, 0.8], [56.95, 0.8], [57.05, 0],
  [84.3, 0], [84.8, 1], [89.4, 1], [89.8, 0], [DURATION, 0],
];
const FLY = pathCR([
  [33.95, 575, sy(575)], [34.9, 628, 560], [36.2, 760, 395], [37.4, 930, 405], [38.6, 1110, 520], [39.6, 1255, sy(1255)],
]);
const BLINKS = [7.1, 9.8, 13.36, 21.3, 26.4, 31.2, 45.3, 51.1, 57.6, 63.6, 65.6, 76.4, 83.3, 86.4, 90.2, 98.6, 106.4, 109.4];

/** Какой цикл походки в момент t: бег или шаг, длина шага. */
function cycleKind(t) {
  if (t < 30 || (t > 53 && t < 55.7)) return { fn: runCycle, stride: t < 30 ? 100 : 104 };
  return { fn: walkCycle, stride: 52 };
}

const _girlCache = new Map();
/** Поза девочки в мире в момент t (с посадкой на землю). */
function girlAt(t) {
  const kq = Math.round(t * 2000);
  const hit = _girlCache.get(kq);
  if (hit) return hit;
  const P = POSE_TRACK(t);
  P.s = G_S;
  P.x = key(X_TRACK, t);
  P.f = key(F_TRACK, t);
  if (Math.abs(P.f) < 0.18) P.f = P.f < 0 ? -0.18 : 0.18;
  // цикл шага/бега поверх ключевой позы (ноги, наклон, «подскок»)
  const cw = key(CYCLE_TRACK, t);
  let cycLift = 0;
  if (cw > 0) {
    const ck = cycleKind(t);
    const ph = Math.abs(P.x) / ck.stride;
    const C = ck.fn(ph);
    for (const f of ['hN', 'kN', 'aN', 'hF', 'kF', 'aF']) P[f] = lerp(P[f], C[f], cw);
    P.lean = lerp(P.lean, P.lean + C.lean, cw);
    const armsFree = t > 42 && t < 43.3;
    // свободная рука качается в такт; рука со змеем или банкой держит своё
    if (t < 30 || (t > 53 && t < 55.7)) { P.sF = lerp(P.sF, C.sF, cw); P.eF = lerp(P.eF, C.eF, cw); }
    if (armsFree) { P.sF = lerp(P.sF, C.sF, cw * 0.6); }
    cycLift = C.lift * cw;
  }
  // смех: плечи вздрагивают
  const laugh = win(40.3, 40.6, 41.7, 42.0, t);
  if (laugh > 0) {
    P.lean += Math.sin(t * TAU * 3.3) * 2.6 * laugh;
    P.head += Math.sin(t * TAU * 3.3 + 1) * 3 * laugh;
    P.sF += Math.sin(t * TAU * 3.3) * 4 * laugh;
  }
  // танец на ветру и лёгкое покачивание в финале
  P.rot += Math.sin(t * 1.3) * 1.6 * win(104.5, 106, 111, 112, t);
  // моргание
  for (const b of BLINKS) { const d = Math.abs(t - b); if (d < 0.09) P.eye *= d / 0.09; }
  P.lift = key(LIFT_TRACK, t) + cycLift;
  if (t > 33.95 && t < 39.6) {
    P.plant = 0;
    const p = FLY(t);
    P.x = p[0];
    P.y = p[1];
    P.lift = 0;
    // подвешенная к змею: лёгкий маятник
    P.rot += Math.sin(t * 2.4) * 5 * win(34.2, 34.8, 38.8, 39.4, t);
  }
  const J = placeGirl(P, groundY);
  const out = { P, J };
  if (_girlCache.size > 6000) {
    let n = 0;
    for (const kk of _girlCache.keys()) { _girlCache.delete(kk); if (++n > 1500) break; }
  }
  _girlCache.set(kq, out);
  return out;
}
/** Центр туловища и голова — для камеры, духа и захлёста (кеш на сетке 1/60 с). */
const girlCenter = gridCache((t) => { const { P } = girlAt(t); return girlToWorld(P, [0, -45]); }, 1 / 60);
const girlHead = gridCache((t) => { const { P, J } = girlAt(t); return girlToWorld(P, [J.N[0], J.N[1] - 28]); }, 1 / 60);
/** Точка в руке: 'N' — ближняя, 'F' — дальняя, 'B' — между ладонями. */
function handAt(t, which) {
  const { P, J } = girlAt(t);
  const pt = (A) => { const u = dd(A.a3); return [A.W[0] + u[0] * 7, A.W[1] + u[1] * 7]; };
  let p;
  if (which === 'B') { const a = pt(J.arms.N), b = pt(J.arms.F); p = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }
  else p = pt(J.arms[which]);
  return girlToWorld(P, p);
}

/* ---------- Воздух вокруг девочки: ветер минус скорость тела, плюс захлёст ---------- */
function airAt(t) {
  const c = girlCenter(t);
  const c2 = girlCenter(t - 0.06);
  const vx = (c[0] - c2[0]) / 0.06, vy = (c[1] - c2[1]) / 0.06;
  const w = windAt(c[0], t);
  let ax = w * 1.05 - vx * 0.006, ay = -Math.abs(w) * 0.08 - vy * 0.006;
  // дух рядом: вихрь вокруг головы
  const S = spiritQ(t);
  if (S && S.a > 0) {
    const dx = c[0] - S[0], dy = c[1] - S[1];
    const d = Math.hypot(dx, dy);
    const f = Math.exp(-((d / 220) ** 2)) * 1.3 * S.a;
    ax += (-dy / (d || 1)) * f + Math.sin(t * 5) * 0.2 * f;
    ay += (dx / (d || 1)) * f * 0.6;
  }
  // банка открыта: поток от банки — вверх и назад, волосы и платье летят по диагонали
  const blast = win(BURST_T, BURST_T + 0.3, BURST_T + 2.5, BURST_T + 5, t);
  const fcur = girlAt(t).P.f;
  ay -= blast * 1.05;
  ax -= blast * 1.35 * Math.sign(fcur || 1);
  const lag = springLag((tt) => girlCenter(tt), t, 1.6, 0.32, 1.1, 18);
  return { air: [ax, ay], lag: [lag[0] * 0.012, lag[1] * 0.012] };
}

/* ---------- Змей ---------- */
const KITE_L = [
  [20.3, 38], [21.0, 150, 'out'], [22.0, 250], [26.0, 420], [30.0, 470], [34.0, 470], [36, 330], [39.6, 420],
  [44, 480], [46.3, 470], [47.6, 330], [48.8, 160], [49.5, 30],
  [102.8, 120], [104.5, 360], [108, 780], [DURATION, 820],
];
const KITE_PHI = [
  [20.3, 0], [21.0, 22], [22.5, 36], [29.2, 40], [30.2, 22], [33.8, 18], [34.4, 10], [39.6, 12], [41, 24], [46.3, 26],
  [47.4, 34], [48.4, 12], [49.0, -18], [49.5, -6],
  [102.8, 30], [105, 38], [108, 45], [DURATION, 46],
];
function kiteAt(t) {
  const wob = Math.sin(t * 2.3) * 4 + Math.sin(t * 3.7 + 1) * 2.5;
  const grounded = (x) => ({ x, y: groundY(x) - 10, ang: -1.15, ground: true, s: 1.15 * G_S });
  if (t < 19.25) return grounded(KITE_REST[0]);
  if (t < 19.95) {
    const h = handAt(t, 'B');
    const u = sstep(19.25, 19.95, t);
    return { x: lerp(h[0], h[0], u), y: h[1] - 8 - 28 * u, ang: lerp(-1.15, 0, sstep(19.3, 19.8, t)), s: 1.15 * G_S };
  }
  if (t < 20.3) { const h = handAt(t, 'B'); return { x: h[0], y: h[1] - 36, ang: 0.05 * Math.sin(t * 9), s: 1.15 * G_S }; }
  if (t < 49.5) {
    const h = handAt(t, 'N');
    const L = key(KITE_L, t), phi = (key(KITE_PHI, t) + wob * sstep(20.6, 21.6, t)) * DEG;
    return { x: h[0] + Math.sin(phi) * L, y: h[1] - Math.cos(phi) * L, ang: phi * 0.45 + wob * 0.01, s: 1.15 * G_S, string: h };
  }
  if (t < 52.25) { const h = handAt(t, 'F'); return { x: h[0] + 4, y: h[1] - 12, ang: 0.35, s: 1.15 * G_S }; }
  if (t < 52.9) {
    const h = handAt(52.25, 'F');
    const u = sstep(52.25, 52.9, t);
    const gx = KITE_REST[0] + 10;
    return { x: lerp(h[0] + 4, gx, u), y: lerp(h[1] - 12, groundY(gx) - 10, u * u), ang: lerp(0.35, -1.15, u), s: 1.15 * G_S, ground: u > 0.95 };
  }
  if (t < 101.9) return grounded(KITE_REST[0] + 10);
  // ветер поднимает змея с травы и приносит к руке
  const gx = KITE_REST[0] + 10;
  const rise = [gx - 30 * sstep(101.9, 103, t), groundY(gx) - 10 - 300 * EASE.out(sstep(101.9, 103.2, t))];
  const h = handAt(t, 'N');
  const L = key(KITE_L, t), phi = (key(KITE_PHI, t) + wob) * DEG;
  const teth = [h[0] + Math.sin(phi) * L, h[1] - Math.cos(phi) * L];
  const u = sstep(102.5, 103.6, t);
  return {
    x: lerp(rise[0], teth[0], u), y: lerp(rise[1], teth[1], u),
    ang: lerp(-1.15, phi * 0.45, sstep(101.9, 102.6, t)) + wob * 0.01, s: 1.15 * G_S,
    string: t > 102.8 ? h : null, looseEnd: t <= 102.8 ? [lerp(gx - 40, h[0], sstep(102.2, 102.8, t)), lerp(groundY(gx - 40), h[1], sstep(102.2, 102.8, t))] : null,
  };
}
/** Хвост змея — цепочка, которая стелется по ветру (или лежит на траве). */
function kiteTail(K, t) {
  const bx = K.x - Math.sin(K.ang) * -40 * K.s, by = K.y + Math.cos(K.ang) * 40 * K.s;
  if (K.ground) {
    const pts = [[bx, by]];
    for (let i = 1; i < 12; i++) pts.push([bx - i * 8, groundY(bx - i * 8) - 3 + Math.sin(i * 1.3) * 2]);
    return pts;
  }
  const w = windAt(K.x, t);
  const env = [w * 1.4 + 0.2, 1];
  return strand(bx, by, Math.PI / 2 + K.ang, 120 * K.s, 12, env, t, 2.1, 0.4, 1.1);
}

/* ---------- Банка и крышка ---------- */
function jarAt(t) {
  if (t < 52.95) return { x: JAR_REST, y: groundY(JAR_REST) + 1, ang: 0, ground: true };
  if (t < 99.45) {
    const one = t > 53.3 && t < 55.62;
    const h = handAt(t, one ? 'N' : 'B');
    const { P } = girlAt(t);
    let ang = 0;
    if (t > 55.6 && t < 56.2) ang = -0.45 * P.f * win(55.6, 55.8, 56.0, 56.2, t);
    // над головой банка лежит на ладонях (держат за дно), перед собой — за бока
    const over = sstep(125, 165, (P.sN + P.sF) / 2);
    return { x: h[0], y: h[1] + lerp(26, -3, over) * G_S, ang };
  }
  return { x: JAR_PUT, y: groundY(JAR_PUT) + 1, ang: 0, ground: true };
}
function lidAt(t) {
  if (t < 53.5 || (t >= CATCH_T && t < 92.1)) return { on: true };
  if (t < CATCH_T) {
    const h = handAt(t, 'F');
    if (t < 53.75) { const J = jarAt(t); const u = sstep(53.5, 53.75, t); return { x: lerp(J.x, h[0], u), y: lerp(J.y - 62 * G_S, h[1] + 4, u), a: 0 }; }
    return { x: h[0], y: h[1] + 4, a: Math.sin(t * 9) * 0.3 };
  }
  // сорвана: летит по дуге и ложится в траву
  const h0 = handAt(92.1, 'F');
  const { P } = girlAt(92.1);
  const u = clamp((t - 92.1) / 0.85);
  const tx = h0[0] - 150 * P.f, ty = groundY(h0[0] - 150 * P.f) - 3;
  return { x: lerp(h0[0], tx, u), y: lerp(h0[1], ty, u) - Math.sin(u * PI) * 70, a: u * 5.5 * -P.f };
}
/** Сила свечения ветра в банке: гаснет, пока девочка его держит. */
function jarGlow(t) {
  return key([[CATCH_T, 1.25], [58, 1], [63, 0.92], [66, 0.75], [72, 0.55], [76, 0.4], [79, 0.28], [81.5, 0.12], [84, 0.1],
    [90.2, 0.1], [91.6, 0.2], [OPEN_T, 0.5], [OPEN_T + 0.8, 0.9], [BURST_T, 1.6]], t);
}

/* ---------- Дух ветра ---------- */
const SPIRIT_A = pathCR([
  [15.1, -520, 610], [15.7, 20, 575], [16.3, 540, 525], [16.9, 1000, 470], [17.45, 1360, 360],
  [17.95, 1640, 290], [18.45, 1720, 470], [18.95, 1540, 650], [19.45, 1260, 650], [19.95, 1170, 520],
  [20.35, 1300, 520], [20.9, 1430, 400], [21.5, 1560, 290], [22.1, 1650, 240],
]);
let SPIRIT_C = null, SPIRIT_G = null;
function initSpiritPaths() {
  const k46 = kiteAt(46.0);
  const catchP = jarAt(CATCH_T);
  SPIRIT_C = pathCR([
    [45.6, k46.x + 60, k46.y - 20], [46.0, k46.x, k46.y + 20], [46.6, 1460, 420], [47.1, 1400, 590], [47.5, 1290, 650],
    [47.9, 1240, 540], [48.3, 1330, 500], [48.8, 1250, 600], [49.5, 1170, 665], [50.5, 1110, 690], [52.0, 1050, 700],
    [54.0, 1000, 690], [55.3, 955, 680], [55.8, catchP.x - 30, catchP.y - 70], [CATCH_T, catchP.x, catchP.y - 45],
  ]);
  SPIRIT_G = pathCR([
    [96.6, 640, -160], [97.5, 820, 150], [98.4, 990, 380], [99.2, 1060, 560], [99.8, 1110, 640], [100.3, 1215, 620],
    [100.8, 1190, 510], [101.2, 1080, 555], [101.6, 1150, 660], [102.0, 1300, 700], [102.5, 1320, 600], [103.2, 1380, 420],
  ]);
}
/** Орбита вокруг точки: дух кружит. */
function orbit(c, t, rx, ry, w, ph) { return [c[0] + Math.cos(t * w + ph) * rx, c[1] + Math.sin(t * w + ph) * ry]; }
function withA(p, a) { p.a = a; return p; }

const kitePos = gridCache((t) => { const k = kiteAt(t); return [k.x, k.y]; }, 1 / 60);

/** Голова духа в момент t: [x, y] и плотность потока a. null — духа нет (или он в банке). */
function spiritAt(t) {
  if (t < 15.1) return null;
  if (t < 22) return withA(SPIRIT_A(t), 1);
  if (t < 45.6) {
    const kp = kitePos(t);
    const k = { x: kp[0], y: kp[1] };
    let p = orbit([k.x, k.y], t, 80, 50, 2.1, 0);
    // танец: кружит вокруг девочки
    const wD = win(30.1, 30.9, 33.3, 34.0, t);
    if (wD > 0) { const c = girlCenter(t); const q = orbit(c, t, 110, 70, 3.2, 1); p = [lerp(p[0], q[0], wD), lerp(p[1], q[1], wD)]; }
    // полёт: между змеем и девочкой
    const wF = win(34.0, 34.8, 39.0, 39.8, t);
    if (wF > 0) { const c = girlCenter(t); const q = orbit([(c[0] + k.x) / 2, (c[1] + k.y) / 2 + 40], t, 130, 90, 2.6, 2); p = [lerp(p[0], q[0], wF), lerp(p[1], q[1], wF)]; }
    // смех: петля вокруг головы
    const wL = win(40.2, 40.8, 41.5, 42.2, t);
    if (wL > 0) { const c = girlHead(t); const q = orbit(c, t, 90, 60, 3.6, 0.5); p = [lerp(p[0], q[0], wL), lerp(p[1], q[1], wL)]; }
    return withA(p, 1);
  }
  if (t < CATCH_T) return withA(SPIRIT_C(t), 1);
  if (t < 96.6) return null;
  if (t < 103.2) return withA(SPIRIT_G(t), sstep(96.6, 97.4, t));
  const kp = kitePos(t);
  return withA(orbit([kp[0], kp[1] + 20], t, 90, 55, 2.0, 0.7), 1);
}
/** Дух на сетке 1/60 с: [x, y, a] — для частиц, завитков и воздуха вокруг девочки. */
const spiritFast = gridCache((t) => { const p = spiritAt(t); return p ? [p[0], p[1], p.a] : null; }, 1 / 60);
function spiritQ(t) { const p = spiritFast(t); if (!p) return null; p.a = p[2]; return p; }

/* ---------- Птицы ---------- */
const PERCH = [[-1, 3, 0.62], [3, 1, 0.8], [1, 0, 0.4]]; // [ветка, доля, …] — где сидят утром
function birdsAt(t) {
  const out = [];
  // утренние: сидят на дереве, при порыве взлетают
  const up = 16.7;
  const seeds = [[1392, 318], [1596, 262], [1668, 404]];
  seeds.forEach(([x, y], i) => {
    if (t < up + i * 0.12) { out.push({ x, y, s: 1.05, perch: true, dir: i % 2 ? 1 : -1, flap: 0 }); return; }
    const u = t - up - i * 0.12;
    if (u > 5) return;
    out.push({ x: x + u * (140 + i * 30) + Math.sin(u * 3 + i) * 10, y: y - u * (120 + i * 25) + u * u * 8, s: 1.05, dir: 1, flap: u * 16 + i });
  });
  // стайка днём
  if (t > 23 && t < 31) {
    for (let i = 0; i < 5; i++) {
      const u = t - 23 - i * 0.18;
      out.push({ x: 1900 - u * 190 + i * 38, y: 180 + i * 16 + Math.sin(u * 2 + i) * 8, s: 0.8, dir: -1, flap: u * 14 + i * 1.3 });
    }
  }
  // после освобождения птицы взмывают с дерева
  if (t > BURST_T + 0.3 && t < BURST_T + 7) {
    for (let i = 0; i < 6; i++) {
      const u = t - BURST_T - 0.3 - i * 0.1;
      if (u < 0) continue;
      out.push({ x: 1480 + i * 30 + u * (90 + i * 20), y: 330 + i * 12 - u * (150 + i * 10), s: 1, dir: 1, flap: u * 15 + i });
    }
  }
  return out;
}
function drawBirds(ctx, list) {
  ctx.beginPath();
  for (const b of list) {
    if (b.perch) {
      // сидящая птичка: тельце, головка, хвост
      oval(ctx, b.x, b.y - 5, 7 * b.s, 4.5 * b.s, -0.2 * b.dir);
      circle(ctx, b.x + 6 * b.dir * b.s, b.y - 9 * b.s, 3.2 * b.s);
      lens(ctx, b.x + 8 * b.dir * b.s, b.y - 9.5 * b.s, b.x + 12 * b.dir * b.s, b.y - 8.5 * b.s, 0.9 * b.s);
      lens(ctx, b.x - 5 * b.dir * b.s, b.y - 5 * b.s, b.x - 14 * b.dir * b.s, b.y - 1 * b.s, 1.6 * b.s);
    } else drawBird(ctx, b.x, b.y, b.s, b.flap, b.dir);
  }
  ctx.fill();
}

/* ---------- Семена с одуванчиков ---------- */
/** Сколько семян держится на головке: утренний ветер их срывает. */
function seedsLeft(d, t) {
  const w = Math.abs(windAt(d.x, Math.min(t, CATCH_T - 0.1)));
  const blow = clamp((Math.min(t, CATCH_T) - 16) / 30) * (0.3 + 0.7 * Math.min(1, w));
  const burst = t > BURST_T ? clamp((t - BURST_T - Math.abs(d.x - HILL_X) / 1100) / 1.5) : 0;
  const left = Math.round(d.seeds * (1 - clamp(blow * (0.4 + hash(d.id * 3) * 0.6)) * 0.7) * (1 - burst * 0.8));
  return Math.max(0, left);
}

/* ---------- Большой вихрь освобождения ---------- */
/**
 * Воронка: ось вихря поднимается из банки, семена и листья идут по спирали
 * вокруг неё, радиус растёт с высотой — как смерч, увиденный сбоку.
 * Тонкие завитки обвивают воронку и раскрываются орнаментальными спиралями.
 */
function drawBurst(ctx, t, jx, jy, S) {
  const u = t - BURST_T;
  if (u < 0 || u > 7.5) return;
  const fade = 1 - sstep(4.5, 7.5, u);
  ctx.beginPath();
  const N = 230;
  for (let i = 0; i < N; i++) {
    const h = hash(i * 17 + 5), h2 = hash(i * 29 + 11), h3 = hash(i * 43 + 7);
    const a = u - h * 1.6;
    if (a < 0) continue;
    const lift = 760 * (1 - Math.exp(-a * (0.55 + 0.5 * h2)));   // высота над банкой
    const R = (18 + lift * (0.42 + 0.35 * h3)) * (1 + 0.25 * a);   // воронка расширяется кверху
    const th = h3 * TAU + a * (5.2 - 2.6 * Math.min(1, lift / 700)) * (h > 0.15 ? 1 : -1);
    const depth = Math.sin(th);
    const x = jx + Math.cos(th) * R + a * a * 30 * (h2 - 0.3);
    const y = jy - lift - a * 40 + depth * R * 0.24;
    if (a > 4.6 + h * 1.5) continue;
    const type = h2 < 0.55 ? 0 : h2 < 0.8 ? 1 : 2;
    particleShape(ctx, { x, y, ang: th + a * 2.4, type, sc: (0.75 + h * 0.6) * (1 + 0.28 * depth) }, S);
  }
  ctx.fill();
  // завитки: винтовые ленты поднимаются из банки, отрываются от неё и уходят вверх;
  // верхний конец закручен орнаментальной спиралью и остаётся в кадре
  ctx.beginPath();
  const NR = 5;
  for (let j = 0; j < NR; j++) {
    const a = u - j * 0.16;
    if (a <= 0) continue;
    const f2 = fade * (1 - sstep(2.4, 4.2, a));
    if (f2 <= 0.02) continue;
    const head = 40 + 380 * (1 - Math.exp(-a * 1.25));
    const tail = 26 + Math.max(0, head - 250) + 110 * sstep(1.2, 3.6, a);
    if (head - tail < 24) continue;
    const pts = [];
    const n = 22;
    for (let i = 0; i < n; i++) {
      const s = i / (n - 1);
      const lift = tail + s * (head - tail);
      const R = 18 + lift * 0.42;
      const th = j * (TAU / NR) + a * 2.3 + lift * 0.011;
      pts.push([jx + Math.cos(th) * R, jy - lift + Math.sin(th) * R * 0.26]);
    }
    const ws = pts.map((_, i) => (0.5 + 2.5 * Math.sin((i / (n - 1)) * PI * 0.8) ** 0.8) * f2 * S);
    ribbon(ctx, pts, ws);
    const e = pts[n - 1], q = pts[n - 2];
    const cp = curlPts(e[0], e[1], Math.atan2(e[1] - q[1], e[0] - q[0]), 84 * (0.6 + 0.4 * f2), 1.25, j % 2 ? 1 : -1, 14);
    ribbon(ctx, cp, taper(cp.length, 2.0 * f2 * S, 0.35));
  }
  ctx.fill();
}

/* ---------- Ветер в банке ---------- */
function drawJarWind(ctx, t, J, S) {
  const g = jarGlow(t);
  if (t < CATCH_T || t > BURST_T + 0.5) return;
  const cx = J.x, cy = J.y - 28 * S;
  // семена кружат внутри, с угасанием оседают на дно
  ctx.save();
  ctx.translate(J.x, J.y);
  ctx.rotate(J.ang || 0);
  ctx.beginPath();
  jarOutline(ctx, S);
  ctx.closePath();
  ctx.clip();
  ctx.translate(-J.x, -J.y);
  ctx.beginPath();
  const energy = clamp(g);
  for (let i = 0; i < 14; i++) {
    const h = hash(i * 11 + 2), h2 = hash(i * 23 + 4);
    const spin = (1.5 + h * 2.5) * energy + 0.12;
    const th = h2 * TAU + t * spin * (i % 2 ? 1 : -1);
    const r = (6 + 11 * h) * S;
    const settle = 1 - energy;
    let x = cx + Math.cos(th) * r * (1 - settle * 0.3);
    let y = cy + Math.sin(th) * r * 0.55 * (1 - settle) + settle * 20 * S + (h - 0.5) * 4 * S;
    // бьётся о стекло, как мотылёк
    const bump = win(75, 75.6, 77.4, 78.2, t) * Math.max(0, Math.sin(t * 7 + i)) * 5 * S;
    x += bump * (i % 3 === 0 ? 1 : 0);
    particleShape(ctx, { x, y, ang: th * 1.3 + i, type: i % 3 === 0 ? 1 : 0, sc: 0.62 }, S);
  }
  // крошечный завиток-сердцевина
  const cp = curlPts(cx - 6 * S, cy + 4 * S * (1 - energy), t * 2 * energy, 22 * S * (0.5 + 0.5 * energy), 1.2, 1, 10);
  ribbon(ctx, cp, taper(cp.length, 1.5 * S * (0.4 + energy * 0.6), 0.3));
  ctx.fill();
  ctx.restore();
}

/** Свет пойманного ветра: цвет и сила (0..1) с дыханием и миганием; null — банка не светится. */
function jarLightAt(t, pal) {
  if (t < CATCH_T - 0.05 || t > BURST_T + 1) return null;
  const pulse = 1 + 0.08 * Math.sin(t * 3.1) + 0.05 * Math.sin(t * 7.3);
  const flick = t > 62.8 && t < 64 ? 0.75 + 0.25 * Math.abs(Math.sin(t * 23)) : 1;
  return { col: cmix(pal.glow, [255, 245, 220], 0.4), a: clamp(jarGlow(t) * pulse * flick, 0, 1) };
}

/**
 * Ореол банки-фонарика. Рисуется ДО силуэтов, как свет за экраном театра теней:
 * вокруг банки светлеют небо и дальние холмы, а бумажные фигуры остаются
 * чисто-чёрными. Само стекло светится изнутри — это делает drawJar.
 */
function drawJarLight(ctx, t, J, S, pal) {
  const L = jarLightAt(t, pal);
  if (!L || L.a <= 0.01) return;
  const x = J.x, y = J.y - 30 * S;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const r = 230 * S * (0.55 + 0.45 * L.a);
  const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, rgba(L.col, 0.62 * L.a));
  gr.addColorStop(0.2, rgba(L.col, 0.3 * L.a));
  gr.addColorStop(1, rgba(L.col, 0));
  ctx.fillStyle = gr;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
}

/* ---------- Камеры ---------- */
function camTrack(keys) {
  const ks = keys.map(([t, x, y, z, e]) => [t, { x, y, z }, e]);
  return (t) => keyObj(ks, t, mixNum);
}
const follow = (dx, y, z) => (t) => ({ x: girlAt(t).P.x + dx(t), y, z });

const SHOTS = [
  { t0: 0, t1: 10, cam: camTrack([[0, 700, 404, 0.78], [10, 1010, 436, 0.9]]), fg: 1110 },
  { t0: 10, t1: 16, cam: camTrack([[10, 1284, 596, 2.1], [16, 1296, 592, 2.24]]) },
  { t0: 16, t1: 22, cam: camTrack([[16, 1170, 520, 1.3], [19, 1200, 500, 1.3], [22, 1240, 430, 1.18]]), fg: 1110 },
  { t0: 22, t1: 30, cam: (t) => ({ x: key([[22, 1060], [29.4, 360], [30, 350]], t), y: 430, z: 1.0 }), fg: 1130 },
  { t0: 30, t1: 38, cam: camTrack([[30, 700, 470, 1.45], [33.5, 720, 455, 1.42], [36.3, 840, 330, 1.12], [38, 940, 350, 1.08]]) },
  { t0: 38, t1: 46, cam: camTrack([[38, 1080, 420, 0.96], [46, 1140, 452, 1.0]]), fg: 1120, dissolveOut: 1.2 },
  { t0: 46, t1: 52, cam: camTrack([[46, 1030, 470, 0.92], [52, 990, 478, 0.96]]), fg: 1120 },
  { t0: 52, t1: 58, cam: (t) => ({ x: key([[52, 1180], [53.2, 1160], [56.1, 740], [58, 720]], t), y: key([[52, 580], [56, 600], [58, 590]], t), z: key([[52, 1.5], [55.5, 1.55], [58, 1.7]], t) }) },
  { t0: 58, t1: 64, cam: camTrack([[58, 790, 604, 4.3], [64, 792, 600, 4.7]]) },
  { t0: 64, t1: 69, cam: camTrack([[64, 820, 440, 0.86], [69, 830, 440, 0.88]]), fg: 1115 },
  { t0: 69, t1: 70.4, cam: camTrack([[69, 1300, 726, 3.3], [70.4, 1302, 724, 3.45]]), fg: 1115 },
  { t0: 70.4, t1: 71.7, insert: 'mill' },
  { t0: 71.7, t1: 73, insert: 'dandelion' },
  { t0: 73, t1: 84, cam: camTrack([[73, 900, 640, 2.35], [84, 905, 630, 2.6]]), dissolveOut: 1.6 },
  { t0: 84, t1: 90, cam: camTrack([[84, 990, 460, 0.95], [90, 1070, 448, 1.0]]), fg: 1120 },
  { t0: 90, t1: 93, cam: camTrack([[90, 1172, 560, 2.0], [93, 1170, 520, 2.12]]) },
  { t0: 93, t1: 100, cam: camTrack([[93, 1150, 520, 1.72], [94.4, 1140, 470, 1.48, 'out'], [97.2, 1100, 420, 1.08], [100, 1080, 430, 1.02]]), fg: 1120, shake: true },
  { t0: 100, t1: 105, cam: camTrack([[100, 1200, 560, 1.9], [105, 1230, 500, 1.62]]) },
  { t0: 105, t1: DURATION, cam: camTrack([[105, 1170, 420, 0.95], [110, 1130, 380, 0.8]]), fg: 1120 },
];
function shotAt(t) {
  for (let i = SHOTS.length - 1; i >= 0; i--) if (t >= SHOTS[i].t0) return i;
  return 0;
}
function camAt(shot, t) {
  const c = Object.assign({}, shot.cam(t));
  if (shot.shake) {
    const s = win(BURST_T, BURST_T + 0.08, BURST_T + 0.6, BURST_T + 1.6, t) * 9;
    c.sx = noise(t * 23) * s; c.sy = noise(t * 19 + 5) * s;
  }
  return c;
}
