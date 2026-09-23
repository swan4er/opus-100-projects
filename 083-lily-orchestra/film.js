'use strict';
/* =========================================================================
   Оркестр на кувшинке — РЕЖИССУРА
   Планы и движение камеры, цветовой сценарий заката, игра актёров,
   вставка с листком-партией, титры. Кадр — чистая функция времени t.
   ========================================================================= */

const T = SCORE.T, SG = SCORE.SEG;
const bA = (bar, beat = 1) => SG.A.at(bar, beat);
const bC = (bar, beat = 1) => SG.C.at(bar, beat);
const bP = (bar, beat = 1) => SG.P.at(bar, beat);
const bD = (bar, beat = 1) => SG.D.at(bar, beat);
const DG = T.ding, D2 = T.ding2;

/* ---------- Цветовой сценарий: золото → закат → сумерки → ночь -------- */
const PAL = {
  gold: {
    sky: ['#EBA286', '#F7C38C', '#FFDC9C', '#FFF1C4'], sunH: 200, sunA: 1, sunGlow: [255, 214, 150], sunDisc: [255, 236, 186], stars: 0, moon: 0,
    cloud: ['#EEB09E', '#FBD0A8', '#FFE9C2'], far: '#98A17F', bank: '#6A7D58', farRefl: '#C9A980', bankRefl: '#58715A',
    water: ['#FFE5B2', '#EFC9A0', '#7FA793', '#2E5D56'], glint: 0.9, glintC: [255, 228, 165], ripL: [255, 242, 212, 0.34], ripD: [26, 66, 66, 0.2],
    reedFar: '#72835E', reedMid: '#4D6944', reedRefl: '#2E4A40', cattail: '#6B4630', tint: [1, 1, 1], lift: [0, 0, 0], rim: [255, 214, 140], rimA: 1,
  },
  late: {
    sky: ['#DA8F8A', '#F4AC80', '#FFC98A', '#FFE3AE'], sunH: 120, sunA: 1, sunGlow: [255, 196, 130], sunDisc: [255, 222, 160], stars: 0, moon: 0,
    cloud: ['#D9969A', '#F4B596', '#FFD9AE'], far: '#8C8C7C', bank: '#5E6C54', farRefl: '#C4957A', bankRefl: '#4E6252',
    water: ['#FFD49E', '#EBB28E', '#7E9A90', '#2B5354'], glint: 0.95, glintC: [255, 210, 150], ripL: [255, 232, 205, 0.32], ripD: [26, 56, 62, 0.2],
    reedFar: '#6A7658', reedMid: '#48603F', reedRefl: '#2A443E', cattail: '#663F2E', tint: [0.98, 0.94, 0.93], lift: [4, 0, 2], rim: [255, 196, 128], rimA: 1,
  },
  sunset: {
    sky: ['#B8708E', '#EC8A7C', '#FFAE78', '#FFD39E'], sunH: 26, sunA: 1, sunGlow: [255, 168, 112], sunDisc: [255, 196, 132], stars: 0, moon: 0,
    cloud: ['#A86A8E', '#E48A8A', '#FFBE8E'], far: '#6E6878', bank: '#4B5058', farRefl: '#B87C7E', bankRefl: '#44485A',
    water: ['#FFC48C', '#E6947E', '#6B6E88', '#2A3E50'], glint: 1, glintC: [255, 186, 130], ripL: [255, 214, 190, 0.3], ripD: [30, 40, 62, 0.22],
    reedFar: '#5A5A60', reedMid: '#3E4A46', reedRefl: '#27313E', cattail: '#553528', tint: [0.9, 0.8, 0.84], lift: [10, 2, 8], rim: [255, 168, 118], rimA: 0.95,
  },
  dusk: {
    sky: ['#2E3A5E', '#6C5478', '#D0787A', '#F2A882'], sunH: -80, sunA: 0, sunGlow: [236, 128, 110], sunDisc: [255, 180, 130], stars: 0.45, moon: 0.75,
    cloud: ['#3E3E62', '#7E5676', '#C9747A'], far: '#3E4258', bank: '#2A3242', farRefl: '#7E5C6E', bankRefl: '#232C3C',
    water: ['#E29A7C', '#8E6278', '#33455E', '#142434'], glint: 0.35, glintC: [240, 150, 124], ripL: [240, 190, 180, 0.22], ripD: [8, 16, 30, 0.3],
    reedFar: '#343A4A', reedMid: '#242C38', reedRefl: '#161E2A', cattail: '#3A2A26', tint: [0.64, 0.62, 0.78], lift: [8, 8, 18], rim: [240, 150, 132], rimA: 0.75,
  },
  night: {
    sky: ['#14223A', '#2E3558', '#6E5672', '#B06E6E'], sunH: -150, sunA: 0, sunGlow: [180, 100, 110], sunDisc: [255, 180, 130], stars: 1, moon: 1,
    cloud: ['#1E2A44', '#3E3E5E', '#6E5670'], far: '#262C40', bank: '#1A2130', farRefl: '#4A3E52', bankRefl: '#141A26',
    water: ['#9A6674', '#4C4660', '#1E2C44', '#0C1826'], glint: 0.15, glintC: [220, 160, 150], ripL: [220, 200, 220, 0.16], ripD: [4, 10, 20, 0.3],
    reedFar: '#222838', reedMid: '#181E2A', reedRefl: '#0E141E', cattail: '#2A2024', tint: [0.5, 0.52, 0.72], lift: [6, 8, 18], rim: [170, 176, 232], rimA: 0.55,
  },
};
const PAL_KEYS = [[0, 'gold'], [T.hit, 'late'], [T.C_, 'late'], [T.P + 2, 'sunset'], [T.P + 9, 'sunset'], [T.D + 3, 'dusk'], [T.fin, 'dusk'], [T.L + 2, 'night']];
const SUN_KEYS = [[0, 205], [T.hit, 150], [T.C_, 120], [T.P, 52], [T.P + 8, 8], [T.D + 2, -70], [T.end, -170]];
function lerpVal(a, b, u) {
  if (typeof a === 'number') return lerp(a, b, u);
  if (typeof a === 'string') return mix(a, b, u);
  if (typeof a[0] === 'number') return a.map((v, i) => lerp(v, b[i], u));
  return a.map((v, i) => mix(v, b[i], u));
}
function paletteAt(t) {
  let i = 0;
  while (i < PAL_KEYS.length - 1 && t >= PAL_KEYS[i + 1][0]) i++;
  const [t0, n0] = PAL_KEYS[i], [t1, n1] = PAL_KEYS[Math.min(i + 1, PAL_KEYS.length - 1)];
  const u = t1 > t0 ? EASE.io(clamp((t - t0) / (t1 - t0), 0, 1)) : 0;
  const A = PAL[n0], B = PAL[n1], P = {};
  for (const k in A) P[k] = lerpVal(A[k], B[k], u);
  P.sunH = K(t, SUN_KEYS.map(([tt, v]) => [tt, v, 'io']));
  P.sunA = clamp((P.sunH + 60) / 50, 0, 1);
  P.rippleLight = css(...P.ripL); P.rippleDark = css(...P.ripD);
  return P;
}

/* ---------- Игра актёров (ключевые кадры) ------------------------------- */
const cueDur = 1.0;
const ACTING = {
  hero: {
    gx: [[0, -0.2], [5.4, -0.8], [6.8, -0.5], [7.4, 0.1], [8.3, 0.7], [9.1, -0.9], [10.5, -0.9], [10.9, 0.9], [12.9, 0.9],
      [bA(1, 1.4), 0.7], [bA(2), 0.7], [bA(2, 3), -0.9], [bA(3), 0.7], [bA(4, 3), 0.8], [bA(5), 0.7], [bA(6, 3), -0.9], [bA(7), 0.6], [bA(9), 0.1], [bA(12, 4), 0.1],
      [bA(13), -0.9], [bA(13, 2), 0.9], [bA(13, 3), -0.6], [bA(13, 4), 0.9], [T.hit, 0.9], [T.cut + 0.2, -0.9], [DG - 0.1, -0.2], [DG + 0.5, 0.5], [DG + 0.8, -0.6], [DG + 1.1, 0.6],
      [DG + 2.6, 0.1], [DG + 7.1, 0.1], [DG + 7.35, 0.9], [T.C_, 0.6], [bC(2), -0.4], [bC(3), 0.5], [bC(4), 0.6], [bC(5), 0.5], [bC(6), -0.9], [bC(7), 0.5], [bC(8), 0.9], [bC(9), 0.8],
      [T.P + 4, 0.6], [T.P + 6, -0.4], [T.P + 8, 0.8], [T.D, 0.7], [T.cut2 + 0.3, 0.9], [D2 + 1.4, 0.5], [D2 + 4.2, 0.8]],
    gy: [[0, 0.1], [9.1, 0.4], [10.5, 0.4], [10.9, -0.3], [12.9, -0.2], [bA(1, 1.4), 0.1], [bA(2, 3), 0.5], [bA(3), 0.1], [bA(9), 0.9], [bA(12, 4), 0.9], [bA(13), 0.2],
      [T.hit, -0.4], [T.cut + 0.2, 0.3], [DG, 0.1], [DG + 2.6, 0.2], [DG + 3.2, 0.85], [DG + 7.1, 0.85], [DG + 7.35, -0.3], [T.C_, -0.2], [bC(2), -0.9], [bC(3), -0.2], [bC(4), -0.6],
      [bC(5), -0.2], [bC(6), -0.3], [bC(8), -0.5], [bC(9), -0.2], [T.D, -0.3], [D2 + 1.4, 0.2], [D2 + 4.2, -0.4]],
    pupil: [[0, 1.1], [10.5, 1.1], [10.8, 1.35], [11.4, 1.1], [bA(13), 1.1], [bA(13, 1.3), 0.8], [T.hit, 0.72], [T.hit + 0.6, 0.9], [DG, 1.1], [DG + 0.6, 0.75], [DG + 2.6, 0.8],
      [DG + 7.2, 0.8], [DG + 7.45, 1.4], [T.C_, 1.2], [bC(2, 1.2), 1.4], [bC(3), 1.15], [T.P, 1.15]],
    lid: [[0, 0.06], [bA(13), 0.02], [T.hit, 0], [DG, 0], [DG + 2.6, 0.05], [DG + 3.4, 0.36], [DG + 7.2, 0.36], [DG + 7.45, 0], [T.C_, 0.05], [T.D, 0.12],
      [D2 - 0.1, 0.12], [D2 + 0.05, 0.75], [D2 + 1.0, 0.75], [D2 + 1.3, 0.1], [T.L, 0.2], [T.L + 3, 0.45]],
    tilt: [[0, 0], [bA(5), 0], [bA(6), 0.35], [bA(9), 0.4], [bA(13), 0.7], [T.hit, 0.3], [DG, 0], [DG + 0.8, 0.45], [DG + 3.4, 0.95], [DG + 7.3, 0.95], [DG + 8.3, 0.5], [T.C_, 0.3], [bC(4), 0], [T.end, 0]],
    squint: [[0, 0], [bC(5), 0], [bC(6), 0.45], [bC(9), 0.5], [T.P, 0.35], [T.fin, 0.3], [D2, 0.2], [D2 + 0.3, 0.6], [D2 + 1.2, 0.45], [T.L, 0.2]],
    smile: [[0, 0.25], [9.1, 0.15], [10.5, 0], [12, 0.1], [bA(9), 0], [bA(13), -0.5], [T.cut, -0.2], [DG + 0.05, 0.6], [DG + 0.6, 0.1], [DG + 1.2, -0.5], [DG + 7.2, -0.6],
      [DG + 8.6, 0.1], [T.C_, 0], [bC(2), 0.3], [bC(4), 0.5], [bC(6), 0.8], [bC(9), 0.95], [T.P, 0.9], [T.cut2, 0.6], [D2 + 0.3, 0.9], [T.L, 0.6]],
    open: [[0, 0], [bA(13, 1.5), 0], [T.hit, 0.35], [T.hit + 0.5, 0], [DG + 0.9, 0], [DG + 1.3, 0.35], [DG + 2.2, 0.1], [DG + 2.7, 0], [bC(8), 0], [bC(8, 1.3), 0.45], [bC(9), 0.2], [T.P, 0],
      [D2 + 2.4, 0], [D2 + 2.8, 0.5], [D2 + 3.8, 0.2], [T.L, 0]],
    shrink: [[0, 0], [T.hit, 0], [T.hit + 0.1, 0.4], [T.hit + 0.5, 0], [DG + 2.6, 0], [DG + 3.4, 1, 'out3'], [DG + 8.1, 1], [DG + 9, 0.3], [T.C_, 0.35], [bC(3), 0.15], [bC(5), 0], [T.end, 0]],
    hide: [[0, 0], [DG + 3.0, 0], [DG + 3.3, 1, 'out3'], [DG + 8.3, 1], [DG + 8.6, 0, 'back'], [T.end, 0]],
    wet: [[0, 0], [DG + 3.2, 0], [DG + 4.2, 1], [DG + 7.2, 1], [DG + 8.4, 0], [T.end, 0]],
    tear: [[0, -1], [DG + 3.9, -1, 'step'], [DG + 3.95, 0], [DG + 5.2, 1, 'in'], [DG + 5.25, 2, 'step'], [T.end, 2]],
    raise: [[0, 0], [11.2, 0], [11.8, 0.5], [12.9, 0.3], [bA(1, 2), 0], [T.cut + 0.3, 0], [DG - 0.35, 0.8], [DG + 0.4, 0.8], [DG + 1.2, 0], [DG + 8.5, 0], [DG + 9.2, 0.6], [bC(1, 2), 0.2],
      [T.cut2 + 0.4, 0], [T.cut2 + 0.8, 0.9], [D2 + 0.6, 0.9], [D2 + 1.2, 0]],
    lean: [[0, 0], [T.hit, 0], [T.hit + 0.08, -0.5, 'out'], [T.hit + 0.8, 0], [bC(7), 0], [bC(7, 1.5), -0.3], [bC(8), 0], [D2, 0], [D2 + 0.05, -0.25], [D2 + 0.7, 0]],
    bow: [[0, 0], [D2 + 1.5, 0], [D2 + 2.0, 1, 'io'], [D2 + 2.3, 1.3], [D2 + 2.5, 0], [T.end, 0]],
    fall: [[0, 0], [D2 + 2.25, 0], [D2 + 2.5, 1, 'in'], [D2 + 3.6, 1], [D2 + 4.1, 0, 'back'], [T.end, 0]],
    count: [[0, 0], [T.A - 0.1, 0, 'step'], [T.A, 1], [T.hit, 1], [T.hit + 0.1, 0, 'step']],
    groove: [[0, 0.6], [T.C_, 0.6], [bC(9), 1.2], [T.P, 1.4], [T.D, 1.1], [T.end, 1.1]],
  },
  cond: {
    free: [[0, 1], [12.32, 1, 'step'], [12.36, 0], [T.hit - 0.06, 0], [T.hit - 0.02, 1], [T.C_ - 0.66, 1], [T.C_ - 0.6, 0], [T.fin - 0.05, 0], [T.fin, 1], [T.L - 0.8, 1], [T.L - 0.72, 0], [T.end, 0]],
    rhx: [[0, -28], [10.9, -28], [11.1, -46], [11.2, -48], [11.35, -46], [11.5, -48], [11.65, -46], [11.8, -48], [12.0, -46], [12.3, -46], [T.hit - 0.04, -46], [T.hit + 0.05, -48, 'out'],
      [T.cut - 0.4, -46], [T.cut - 0.2, -58], [T.cut, -40, 'in'], [DG + 1.8, -40], [DG + 3, -32], [DG + 6.9, -32], [DG + 7.1, -46], [DG + 7.2, -48], [DG + 7.33, -46], [DG + 7.45, -48],
      [DG + 7.7, -64, 'out3'], [DG + 8.4, -64], [DG + 8.8, -44], [T.fin, -46], [T.fin + 0.05, -46], [T.cut2 - 0.4, -46], [T.cut2 - 0.2, -58], [T.cut2, -40, 'in'],
      [T.cut2 + 0.5, -40], [D2 + 1.4, -34], [D2 + 2.2, -30], [T.L - 0.8, -40]],
    rhy: [[0, -58], [10.9, -58], [11.1, -74], [11.2, -68], [11.35, -74], [11.5, -68], [11.65, -74], [11.8, -68], [12.0, -84], [12.3, -108], [T.hit - 0.04, -62], [T.hit + 0.1, -116, 'out'],
      [T.cut - 0.4, -114], [T.cut - 0.2, -100], [T.cut, -84, 'in'], [DG + 1.8, -84], [DG + 3, -60], [DG + 6.9, -60], [DG + 7.1, -74], [DG + 7.2, -68], [DG + 7.33, -74], [DG + 7.45, -68],
      [DG + 7.7, -70, 'out3'], [DG + 8.4, -70], [DG + 8.8, -96], [T.fin, -62], [T.fin + 0.1, -118, 'out'], [T.cut2 - 0.4, -116], [T.cut2 - 0.2, -100], [T.cut2, -84, 'in'],
      [T.cut2 + 0.5, -80], [D2 + 1.4, -66], [D2 + 2.2, -58], [T.L - 0.8, -76]],
    bat: [[0, 2.5], [10.9, 2.5], [11.1, 2.62], [12.0, 2.5], [12.3, -2.0], [T.hit, -1.95], [T.cut, -2.2], [DG + 1.8, -2.2], [DG + 3, 2.2], [DG + 6.9, 2.2], [DG + 7.1, 2.62], [DG + 7.5, 2.62],
      [DG + 7.7, 2.35], [DG + 8.4, 2.35], [DG + 8.8, -2.0], [T.fin, -1.95], [T.cut2, -2.2], [T.cut2 + 0.5, 2.3], [D2 + 1.4, 2.4], [T.L - 0.8, -2.0]],
    lhx: [[0, -30], [11.9, -30], [12.3, -24], [12.9, -30], [bA(1) - 0.3, -30], [bA(1), -70, 'out'], [bA(1) + cueDur, -30], [bA(3) - 0.2, -30], [bA(3), -76, 'out'], [bA(3) + cueDur, -30],
      [bA(5) - 0.2, -30], [bA(5), -66, 'out'], [bA(5) + cueDur, -30], [bA(6, 2.7), -30], [bA(6, 3), -60, 'out'], [bA(6, 4.6), -30], [bA(13) - 0.1, -34], [bA(13, 4), -20], [T.hit, -14, 'out'],
      [T.cut - 0.3, -14], [T.cut, -30, 'in'], [DG + 5.9, -30], [DG + 6.05, -16], [DG + 6.45, -16], [DG + 6.7, -30], [bC(2) - 0.15, -30], [bC(2), -54, 'out'], [bC(2) + 0.7, -30],
      [bC(4) - 0.15, -30], [bC(4), -68, 'out'], [bC(4) + 0.7, -30], [bC(6) - 0.15, -30], [bC(6), -74, 'out'], [bC(6) + 0.7, -30], [bC(8) - 0.15, -30], [bC(8), -62, 'out'], [bC(8) + 0.7, -30],
      [T.fin - 0.1, -30], [T.fin, -14, 'out'], [T.cut2 - 0.3, -14], [T.cut2, -30, 'in'], [T.cut2 + 0.45, -30], [T.cut2 + 0.75, -66, 'out'], [D2 + 0.4, -66], [D2 + 0.9, -30],
      [D2 + 3.8, -30], [D2 + 4.3, -62, 'out'], [T.L - 0.5, -30]],
    lhy: [[0, -60], [11.9, -60], [12.3, -104], [12.9, -64], [bA(1) - 0.3, -64], [bA(1), -96, 'out'], [bA(1) + cueDur, -64], [bA(3) - 0.2, -64], [bA(3), -70, 'out'], [bA(3) + cueDur, -64],
      [bA(5) - 0.2, -64], [bA(5), -100, 'out'], [bA(5) + cueDur, -64], [bA(6, 2.7), -64], [bA(6, 3), -118, 'out'], [bA(6, 4.6), -64], [bA(13) - 0.1, -70], [bA(13, 4), -110], [T.hit, -114, 'out'],
      [T.cut - 0.3, -112], [T.cut, -80, 'in'], [DG + 5.9, -64], [DG + 6.05, -114], [DG + 6.45, -114], [DG + 6.7, -64], [bC(2) - 0.15, -64], [bC(2), -116, 'out'], [bC(2) + 0.7, -64],
      [bC(4) - 0.15, -64], [bC(4), -92, 'out'], [bC(4) + 0.7, -64], [bC(6) - 0.15, -64], [bC(6), -70, 'out'], [bC(6) + 0.7, -64], [bC(8) - 0.15, -64], [bC(8), -98, 'out'], [bC(8) + 0.7, -64],
      [T.fin - 0.1, -64], [T.fin, -114, 'out'], [T.cut2 - 0.3, -112], [T.cut2, -80, 'in'], [T.cut2 + 0.45, -70], [T.cut2 + 0.75, -58, 'out'], [D2 + 0.4, -58], [D2 + 0.9, -64],
      [D2 + 3.8, -64], [D2 + 4.3, -70, 'out'], [T.L - 0.5, -64]],
    trem: [[0, 0], [T.hit + 0.2, 0], [T.hit + 0.5, 0.8], [T.cut - 0.4, 0.9], [T.cut - 0.39, 0, 'step'], [T.fin + 0.3, 0], [T.fin + 0.8, 0.5], [T.cut2 - 0.4, 0.6], [T.cut2 - 0.39, 0, 'step']],
    turn: [[0, -0.55], [DG + 0.28, -0.55], [DG + 0.45, -0.15, 'out'], [DG + 8.8, -0.15], [T.C_, -0.55], [T.cut2 + 0.25, -0.55], [T.cut2 + 0.45, -0.1, 'out'], [D2 + 1.2, -0.1], [D2 + 1.6, -0.55]],
    gx: [[0, -0.7], [9.2, -0.7], [DG + 0.28, -0.7], [DG + 0.42, -0.5, 'out'], [DG + 8.8, -0.5], [T.C_, -0.7], [T.cut2 + 0.25, -0.7], [T.cut2 + 0.45, -0.5], [D2 + 1.6, -0.7]],
    gy: [[0, 0.1], [DG + 0.28, 0.1], [DG + 0.42, 0.8, 'out'], [DG + 5.4, 0.8], [DG + 5.8, 0.95], [DG + 8.8, 0.7], [T.C_, 0.2], [T.cut2 + 0.25, 0.2], [T.cut2 + 0.45, 0.8], [D2 + 1.6, 0.2]],
    lid: [[0, 0.3], [DG + 0.3, 0.3], [DG + 0.4, 0, 'out'], [DG + 5.3, 0], [DG + 5.6, 0.3], [DG + 6.6, 0.3], [DG + 7.0, 0.45], [T.C_, 0.3], [T.fin, 0.2], [D2 + 0.1, 0.5], [D2 + 1.2, 0.35]],
    brow: [[0, 0], [11.0, 0.3], [12.3, 0.8], [12.9, 0.2], [bA(13), 0.6], [T.hit, 1], [T.cut, 0.4], [DG + 0.3, 0.4], [DG + 0.45, 1.2, 'out'], [DG + 1.8, 1.2], [DG + 5.3, -0.5], [DG + 6.4, -0.5],
      [DG + 7.0, 0.7], [T.C_, 0.4], [T.P, 0.3], [T.fin, 1], [T.cut2, 0.5], [D2, 0.9], [D2 + 1.2, 0.3]],
    smile: [[0, 0.15], [DG + 0.3, 0.15], [DG + 0.5, -0.4], [DG + 6.5, -0.4], [DG + 7.2, 0.85], [T.C_, 0.7], [T.P, 0.8], [T.cut2, 0.5], [D2 + 0.2, 1], [T.L, 0.8]],
    open: [[0, 0], [DG + 0.45, 0], [DG + 0.6, 0.3], [DG + 1.8, 0.1], [DG + 2.5, 0], [D2 + 2.4, 0], [D2 + 2.7, 0.55], [D2 + 3.8, 0.3], [T.L, 0]],
    specs: [[0, 0], [DG + 0.9, 0], [DG + 1.2, 1, 'out3'], [DG + 6.1, 1], [DG + 6.35, 0, 'io'], [T.end, 0]],
    nod: [[0, 0], [DG + 7.6, 0], [DG + 7.8, 0.7, 'out'], [DG + 8.1, 0], [T.cut2 + 0.55, 0], [T.cut2 + 0.75, 0.7, 'out'], [T.cut2 + 1.0, 0], [D2 + 1.5, 0], [D2 + 1.9, 1.6], [D2 + 2.4, 0]],
    lean: [[0, 0], [T.hit, 0], [T.hit + 0.1, -0.06, 'out'], [T.cut, 0], [D2 + 1.5, 0], [D2 + 1.9, 0.3], [D2 + 2.4, 0]],
  },
  bass: {
    gx: [[0, 0.5], [DG + 0.3, 0.5], [DG + 0.5, -0.8, 'out'], [DG + 8, -0.8], [T.C_, 0.5], [bC(4), -0.6], [bC(5), 0.5], [D2, -0.6], [D2 + 4, 0.5]],
    gy: [[0, 0.15], [DG + 0.3, 0.15], [DG + 0.5, 0.8, 'out'], [DG + 8, 0.8], [T.C_, 0.15], [bC(4), 0.7], [bC(5), 0.15], [D2, 0.7], [D2 + 4, 0.15]],
    lid: [[0, 0.1], [T.A, 0.1], [T.A + 0.5, 0.42], [T.hit, 0.42], [T.hit + 0.2, 0], [DG + 3, 0], [DG + 5, 0.2], [T.C_, 0.1], [bC(9), 0.4], [T.fin, 0.4], [T.fin + 0.3, 0.1]],
    smile: [[0, 0.5], [DG + 0.3, 0.5], [DG + 0.6, -0.2], [DG + 8, -0.2], [bC(4), 0.8], [T.end, 0.8]],
    open: [[0, 0], [DG + 0.5, 0], [DG + 0.7, 0.3], [DG + 2.4, 0], [D2 + 2.4, 0], [D2 + 2.7, 0.5], [D2 + 3.8, 0]],
    pupil: [[0, 1], [DG + 0.4, 1], [DG + 0.6, 0.72], [DG + 3, 0.9], [T.C_, 1]],
  },
  bsn: {
    gx: [[0, 0.5], [DG + 0.35, 0.5], [DG + 0.55, -0.8, 'out'], [DG + 8, -0.8], [T.C_, 0.5], [bC(8), -0.8], [bC(9), 0.5], [D2, -0.8], [D2 + 4, 0.5]],
    gy: [[0, 0.1], [DG + 0.35, 0.1], [DG + 0.55, 0.8, 'out'], [DG + 8, 0.8], [T.C_, 0.1], [bC(8), 0.6], [bC(9), 0.1], [D2, 0.7], [D2 + 4, 0.1]],
    pupil: [[0, 1], [DG + 0.4, 1], [DG + 0.6, 0.7], [DG + 3, 0.9], [T.C_, 1]],
    puff: [[0, 0], [T.cut, 0], [T.cut + 0.05, 1], [DG + 1.8, 1], [DG + 2.0, 0, 'out']],
    smile: [[0, 0.45], [DG + 0.4, 0.45], [DG + 0.7, -0.3], [DG + 8, -0.3], [bC(8), 0.8], [T.end, 0.8]],
    lid: [[0, 0.15], [DG + 0.4, 0.15], [DG + 0.5, 0], [DG + 3, 0], [T.C_, 0.15]],
  },
  rhino: { gx: [[0, 0.4], [DG + 0.3, 0.4], [DG + 0.5, 0.9, 'out'], [DG + 8, 0.9], [T.C_, 0.4], [bC(6), 0.9], [bC(7), 0.4]], gy: [[0, 0.3], [DG + 0.3, 0.3], [DG + 0.5, 0.7], [DG + 8, 0.7], [T.C_, 0.3]], lid: [[0, 0.25], [DG + 0.3, 0.25], [DG + 0.5, 0], [DG + 5, 0], [T.C_, 0.25]], open: [[0, 0], [DG + 0.5, 0], [DG + 0.7, 0.4], [DG + 2.4, 0]] },
  lb1: { gx: [[0, 0.3], [DG + 0.32, 0.3], [DG + 0.5, 0.9, 'out'], [DG + 8, 0.9], [T.C_, 0.3]], gy: [[0, 0.5], [DG + 0.32, 0.5], [DG + 0.5, 0.6], [T.C_, 0.5]], lid: [[0, 0.1], [DG + 0.3, 0.1], [DG + 0.5, 0], [T.C_, 0.1]] },
  lb2: { gx: [[0, 0.3], [DG + 0.36, 0.3], [DG + 0.55, 0.9, 'out'], [DG + 8, 0.9], [T.C_, 0.3]], gy: [[0, 0.5], [DG + 0.36, 0.5], [DG + 0.55, 0.6], [T.C_, 0.5]], lid: [[0, 0.1], [DG + 0.3, 0.1], [DG + 0.5, 0], [T.C_, 0.1]] },
  chafer: { gx: [[0, 0.35], [DG + 0.3, 0.35], [DG + 0.48, 0.9, 'out'], [DG + 8, 0.9], [T.C_, 0.35]], gy: [[0, 0.2], [DG + 0.3, 0.2], [DG + 0.48, 0.6], [T.C_, 0.2]], open: [[0, 0], [DG + 0.5, 0], [DG + 0.7, 0.5], [DG + 2, 0]] },
  df1: { gy: [[0, 0.3], [DG + 0.3, 0.3], [DG + 0.5, 0.95], [DG + 8, 0.95], [T.C_, 0.3]], gx: [[0, 0], [DG + 0.3, 0], [DG + 0.5, 0.5], [T.C_, 0]] },
  df2: { gy: [[0, 0.3], [DG + 0.3, 0.3], [DG + 0.5, 0.95], [DG + 8, 0.95], [T.C_, 0.3]], gx: [[0, 0], [DG + 0.3, 0], [DG + 0.5, -0.9], [T.C_, 0]] },
};

/* ---------- Планы и камера ---------------------------------------------- */
// Каждый план: время начала и ключи камеры [t, x, y, z, ty, ease]. На границе — монтажная склейка.
const F = {
  orch: [0, -150, 1.32], bass: [40, -196, 2.35], perc: [-372, -116, 2.45], bsn: [262, -156, 2.6], bells: [-190, -318, 2.25],
  hero: [-100, 12, 7.0], cond: [440, -104, 3.5], two: [170, -46, 2.0],   // лягушонок — средний план: он маленький, камера ближе
};
const sh = (t, keys) => ({ t, keys });
const k = (t, f, dx = 0, dy = 0, dz = 0, ty = 0, e = 'io') => [t, f[0] + dx, f[1] + dy, f[2] + dz, ty, e];
const SHOTS = [
  // 1. Настройка
  sh(0, [k(0, [60, -390, 0.62], 0, 0, 0, 430), k(5.0, [0, -205, 0.74])]),
  sh(5.0, [k(5.0, [-390, -152, 1.95]), k(9.2, [300, -168, 1.95])]),
  sh(9.2, [k(9.2, F.hero, 0, 0, -0.2), k(9.6, F.hero, 0, 0, 0)]),
  sh(9.6, [k(9.6, F.hero), k(10.6, F.hero)]),                       // вставка: листок-партия (рисуется отдельно)
  sh(10.6, [k(10.6, F.hero, 0, 2, 0.3), k(11.0, F.hero, 0, 2, 0.45)]),
  sh(11.0, [k(11.0, F.cond, 0, -6, -0.3), k(12.9, F.cond, -10, -10, 0.05)]),
  // 2. Серенада
  sh(bA(1), [k(bA(1), F.bass, 0, 0, -0.1), k(bA(3), F.bass, 0, -6, 0.25)]),
  sh(bA(3), [k(bA(3), F.perc), k(bA(4), F.perc, 26, -4, 0.1)]),
  sh(bA(4), [k(bA(4), F.hero, 0, -4, -0.3), k(bA(5), F.hero, 0, -4, 0.1)]),
  sh(bA(5), [k(bA(5), F.bsn, 0, 0, -0.15), k(bA(6, 2.6), F.bsn, 0, -6, 0.1)]),
  sh(bA(6, 2.6), [k(bA(6, 2.6), F.bsn, 0, -6, 0.1), k(bA(6, 2.98), F.bells, 0, 0, 0, 0, 'io3'), k(bA(7), F.bells, -20, 0, 0.1)]),
  sh(bA(7), [k(bA(7), F.orch, 0, -10, 0), k(bA(9), F.orch, 0, 0, 0.18)]),
  sh(bA(9), [k(bA(9), F.hero, 0, 16, -0.4), k(bA(11), F.hero, 0, 14, -0.1)]),
  sh(bA(11), [k(bA(11), [250, -150, 1.75]), k(bA(13), [226, -150, 1.92])]),
  sh(bA(13), [k(bA(13), F.hero, 0, 0, -0.2), k(bA(13, 3), F.hero, 0, 0, 0.2)]),
  sh(bA(13, 3), [k(bA(13, 3), [-100, -196, 1.6]), k(T.hit, [-60, -180, 1.95], 0, 0, 0, 0, 'in')]),
  sh(T.hit, [k(T.hit, F.orch, 0, -10, 0.12), k(T.cut, F.orch, 0, -10, 0.06), k(DG + 0.95, F.orch, 0, -10, 0.1)]),
  // 3. «Дзынь!»
  sh(DG + 0.95, [k(DG + 0.95, F.cond, 0, -8, 0.2), k(DG + 1.75, F.cond, 0, -8, 0.3)]),
  sh(DG + 1.75, [k(DG + 1.75, [150, -196, 2.1]), k(DG + 2.5, [150, -196, 2.2])]),
  sh(DG + 2.5, [k(DG + 2.5, F.hero, 0, 4, -0.4), k(DG + 5.3, F.hero, 2, -2, 2.2)]),     // медленный наезд: стыдно
  sh(DG + 5.3, [k(DG + 5.3, F.cond, 4, 2, -0.1), k(DG + 8.0, F.cond, 4, 0, 0.35)]),
  sh(DG + 8.0, [k(DG + 8.0, F.two), k(T.C_, F.two, -16, 0, 0.1)]),
  // 4. Перекличка — склейка на каждый ответ
  sh(bC(1), [k(bC(1), F.hero, 0, -6, -1.1), k(bC(2), F.hero, 0, -6, -1.0)]),
  sh(bC(2), [k(bC(2), F.bells, 60, 0, 0.1), k(bC(3), F.bells, 60, 0, 0.2)]),
  sh(bC(3), [k(bC(3), F.hero, 0, -8, -1.2), k(bC(4), F.hero, 0, -8, -1.1)]),
  sh(bC(4), [k(bC(4), F.bass, 0, 10, 0.1), k(bC(5), F.bass, 0, 10, 0.2)]),
  sh(bC(5), [k(bC(5), F.hero, 0, -12, -1.4), k(bC(6), F.hero, 0, -12, -1.3)]),
  sh(bC(6), [k(bC(6), F.perc, 0, 4, 0), k(bC(7), F.perc, 0, 4, 0.12)]),
  sh(bC(7), [k(bC(7), F.hero, 0, -16, -1.6), k(bC(8), F.hero, 0, -16, -1.5)]),
  sh(bC(8), [k(bC(8), F.bsn), k(bC(9), F.bsn, 0, 0, 0.15)]),
  sh(bC(9), [k(bC(9), F.orch, 0, -6, 0.02), k(T.P, F.orch, 0, -6, 0.16)]),
  // полька
  sh(T.P, [k(T.P, F.orch, -70, -8, 0.1), k(bP(5), F.orch, 70, -8, 0.14)]),
  sh(bP(5), [k(bP(5), [-96, -40, 2.7]), k(bP(7), [-110, -52, 2.5])]),
  sh(bP(7), [k(bP(7), [-150, -300, 2.05]), k(bP(9), [-120, -290, 2.15])]),
  sh(bP(9), [k(bP(9), F.orch, 0, -10, 0.05), k(T.D, [0, -300, 0.92], 0, 0, 0, 0, 'io3')]),
  // 5. Светлячки
  sh(T.D, [k(T.D, [0, -250, 0.95]), k(bD(3), [0, -190, 1.12])]),
  sh(bD(3), [k(bD(3), [0, -190, 1.8]), k(bD(4), [-4, -192, 1.88])]),          // весь оркестр под закатным небом (обложка)
  sh(bD(4), [k(bD(4), [-96, -30, 2.9]), k(bD(5), [-96, -34, 3.1])]),
  sh(bD(5), [k(bD(5), [-370, -150, 2.1]), k(bD(6), [-330, -150, 2.2])]),
  sh(bD(6), [k(bD(6), [-120, -120, 2.5]), k(bD(7), [-110, -124, 2.7])]),
  sh(bD(7), [k(bD(7), F.orch, 0, -20, -0.1), k(T.K, F.orch, 0, -16, 0.1)]),
  sh(T.K, [k(T.K, F.orch, 0, -20, 0.02), k(T.cut2, F.orch, 0, -20, 0.14)]),
  sh(T.cut2, [k(T.cut2, F.cond, -6, -6, -0.2), k(T.cut2 + 0.62, F.cond, -6, -6, 0)]),
  sh(T.cut2 + 0.62, [k(T.cut2 + 0.62, F.hero, 0, -10, -0.8), k(D2 + 1.3, F.hero, 0, -10, -0.5)]),
  // 6. Поклон и кода
  sh(D2 + 1.3, [k(D2 + 1.3, F.orch, 0, -10, 0.02), k(T.L, F.orch, 0, -14, 0.08)]),
  sh(T.L, [k(T.L, F.orch, 0, -14, 0.08), k(T.end - 1.5, [0, -330, 0.78], 0, 0, 0, 360, 'io3'), k(T.end, [0, -340, 0.77], 0, 0, 0, 370)]),
];
function camAt(t) {
  let i = 0;
  while (i < SHOTS.length - 1 && t >= SHOTS[i + 1].t) i++;
  const keys = SHOTS[i].keys;
  let a = keys[0], b = keys[0];
  for (let j = 0; j < keys.length; j++) { if (keys[j][0] <= t) a = keys[j]; if (keys[j][0] > t) { b = keys[j]; break; } b = keys[j]; }
  const u = b[0] > a[0] ? EASE[b[5] || 'io'](clamp((t - a[0]) / (b[0] - a[0]), 0, 1)) : 0;
  return { x: lerp(a[1], b[1], u), y: lerp(a[2], b[2], u), z: lerp(a[3], b[3], u), tx: 0, ty: lerp(a[4], b[4], u), shot: i };
}
function cameraAt(t) {
  const cam = camAt(t);
  // удар с ферматой — толчок камеры
  for (const [th, amp] of [[T.hit, 7], [T.fin, 5]]) {
    const tp = t - th;
    if (tp >= 0 && tp < 0.6) { const e = Math.exp(-tp / 0.12); cam.tx += Math.sin(tp * 70) * amp * e; cam.ty += Math.cos(tp * 55) * amp * e * 0.7; cam.z *= 1 + 0.02 * e; }
  }
  return cam;
}

/* ---------- Вставка: листок-партия крупно ------------------------------- */
const INSERT = [9.6, 10.6];
function drawInsert(c, t, P) {
  const { W, H, K: s } = VIEW;
  const u = (t - INSERT[0]) / (INSERT[1] - INSERT[0]);
  c.setTransform(1, 0, 0, 1, 0, 0);
  // размытый пруд позади: мягкие пятна света
  const g = c.createRadialGradient(W * 0.62, H * 0.3, 10, W * 0.5, H * 0.5, W * 0.8);
  g.addColorStop(0, '#FFE6A8'); g.addColorStop(0.35, '#C9C07A'); g.addColorStop(0.7, '#5E8A4A'); g.addColorStop(1, '#2F5A3E');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 16; i++) {
    const bx = (hash(i * 3.3) * 1.2 - 0.1) * W + u * 30 * s, by = hash(i * 7.1) * H * 0.8, br = (40 + hash(i) * 120) * s;
    c.globalAlpha = 0.12 + hash(i * 2.2) * 0.12; c.drawImage(WARM, bx - br, by - br, br * 2, br * 2);
  }
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  // листок
  c.save();
  c.translate(W * 0.5, H * 0.52); c.rotate(-0.06 + u * 0.02); c.scale(s * (1.02 + u * 0.05), s * (1.02 + u * 0.05));
  c.fillStyle = 'rgba(30,50,20,0.28)'; c.beginPath(); c.ellipse(16, 22, 690, 330, 0, 0, TAU); c.fill();
  const lg = c.createLinearGradient(0, -320, 0, 320);
  lg.addColorStop(0, '#DDEDB2'); lg.addColorStop(1, '#B9D48A');
  c.fillStyle = lg; c.strokeStyle = '#6E8F3A'; c.lineWidth = 5;
  c.beginPath(); c.moveTo(-690, 20); c.bezierCurveTo(-660, -300, 500, -350, 700, -10); c.bezierCurveTo(520, 330, -600, 330, -690, 20); c.fill(); c.stroke();
  c.strokeStyle = 'rgba(110,143,58,0.45)'; c.lineWidth = 4; c.beginPath(); c.moveTo(-690, 20); c.quadraticCurveTo(0, 0, 700, -10); c.stroke();
  // нотный стан
  const x0 = -560, x1 = 560, y0 = -70, gap = 26;
  c.strokeStyle = '#3B4A2A'; c.lineWidth = 3;
  for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(x0, y0 + i * gap); c.lineTo(x1, y0 + i * gap); c.stroke(); }
  c.lineWidth = 5; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x0, y0 + 4 * gap); c.stroke();
  // такты с паузами и один-единственный звук в самом конце
  const bars = 7, bw = (x1 - x0) / bars;
  for (let b = 1; b <= bars; b++) {
    const bx = x0 + b * bw;
    c.lineWidth = b === bars ? 7 : 3; c.beginPath(); c.moveTo(bx, y0); c.lineTo(bx, y0 + 4 * gap); c.stroke();
    if (b === bars) { c.lineWidth = 3; c.beginPath(); c.moveTo(bx - 12, y0); c.lineTo(bx - 12, y0 + 4 * gap); c.stroke(); }
  }
  c.fillStyle = '#2E3A22';
  for (let b = 0; b < bars - 1; b++) { const cx = x0 + (b + 0.5) * bw; c.fillRect(cx - 22, y0 + gap, 44, gap * 0.5); }
  c.font = `600 ${gap * 1.3}px "Alegreya", Georgia, serif`; c.textAlign = 'center';
  c.fillText('12', x0 + 2.5 * bw, y0 - 18);
  // нота
  const nx = x0 + (bars - 0.5) * bw - 8, ny = y0 + 2 * gap;
  c.save(); c.translate(nx, ny); c.rotate(-0.35); c.beginPath(); c.ellipse(0, 0, 17, 12, 0, 0, TAU); c.fill(); c.restore();
  c.lineWidth = 4; c.beginPath(); c.moveTo(nx + 15, ny - 4); c.lineTo(nx + 15, ny - 92); c.stroke();
  // красный кружок дирижёрским карандашом
  const drawU = clamp((u - 0.25) / 0.4, 0, 1);
  if (drawU > 0) {
    c.strokeStyle = '#D23A2E'; c.lineWidth = 6; c.lineCap = 'round';
    c.beginPath();
    for (let i = 0; i <= 40 * drawU; i++) { const a = -2.2 + (i / 40) * (TAU + 0.5), rr = 58 + Math.sin(i * 0.7) * 3; c.lineTo(nx + 8 + Math.cos(a) * rr, ny - 30 + Math.sin(a) * rr * 1.15); }
    c.stroke();
  }
  // пометка
  const noteA = clamp((u - 0.35) / 0.3, 0, 1);
  c.globalAlpha = noteA;
  c.fillStyle = '#B8322A'; c.font = `${76}px "Marck Script", "Bad Script", cursive`; c.textAlign = 'right';
  c.fillText('в самом конце!', nx - 70, y0 - 64);
  c.strokeStyle = '#B8322A'; c.lineWidth = 4;
  c.beginPath(); c.moveTo(nx - 60, y0 - 84); c.quadraticCurveTo(nx - 20, y0 - 110, nx - 2, y0 - 88); c.stroke();
  c.beginPath(); c.moveTo(nx - 2, y0 - 88); c.lineTo(nx - 20, y0 - 92); c.moveTo(nx - 2, y0 - 88); c.lineTo(nx - 8, y0 - 104); c.stroke();
  c.globalAlpha = 1;
  // лапка лягушонка из-за края кадра: указательный палец с круглой подушечкой ведёт по паузам к своей ноте
  const fu = EASE.io(clamp(u / 0.85, 0, 1));
  const fx = lerp(x0 + 40, nx - 40, fu), fy = y0 + 4 * gap + 40 + Math.abs(Math.sin(fu * 18)) * -10;
  const skin = '#A6D24C', ink = '#4D6E1E';
  const tube = (pts, w) => {
    c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
    if (pts.length === 3) c.quadraticCurveTo(pts[1][0], pts[1][1], pts[2][0], pts[2][1]); else c.lineTo(pts[1][0], pts[1][1]);
    c.strokeStyle = ink; c.lineWidth = w + 10; c.stroke(); c.strokeStyle = skin; c.lineWidth = w; c.stroke();
  };
  const pad = (x, y, r) => { c.fillStyle = skin; c.strokeStyle = ink; c.lineWidth = 5; circ(c, x, y, r); c.fill(); c.stroke(); };
  c.lineCap = 'round'; c.lineJoin = 'round';
  tube([[fx - 170, fy + 720], [fx - 80, fy + 320], [fx - 14, fy + 124]], 58);   // рука
  tube([[fx - 12, fy + 104], [fx - 46, fy + 84]], 14);                              // поджатые пальцы
  tube([[fx - 4, fy + 108], [fx + 34, fy + 94]], 14);
  tube([[fx - 6, fy + 96], [fx + 4, fy + 24]], 17);                                // указательный
  c.fillStyle = skin; c.strokeStyle = ink; c.lineWidth = 5;
  ell(c, fx - 8, fy + 110, 38, 30, -0.35); c.fill(); c.stroke();                   // ладонь
  c.strokeStyle = skin; c.lineWidth = 50; c.beginPath(); c.moveTo(fx - 40, fy + 230); c.lineTo(fx - 16, fy + 128); c.stroke();
  pad(fx - 48, fy + 83, 11); pad(fx + 36, fy + 93, 11); pad(fx + 5, fy + 16, 16);
  c.fillStyle = 'rgba(255,255,230,0.5)'; circ(c, fx, fy + 11, 5); c.fill();
  c.restore();
  void P;
}

/* ---------- Титры ------------------------------------------------------- */
function drawTitle(c, t) {
  const { W, H, K: s } = VIEW;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  if (t < 5.2) {
    const a = clamp((t - 0.5) / 0.9, 0, 1) * clamp((4.9 - t) / 0.7, 0, 1);
    if (a > 0) {
      const rise = (1 - EASE.out3(clamp((t - 0.5) / 1.4, 0, 1))) * 18 * s;
      c.globalAlpha = a;
      c.fillStyle = 'rgba(255,246,226,0.55)';
      c.font = `italic 800 ${Math.round(118 * s)}px "Alegreya", Georgia, serif`;
      c.fillStyle = '#3A2430';
      c.fillText('Оркестр на кувшинке', W / 2, H * 0.4 + rise);
      c.font = `500 ${Math.round(30 * s)}px "Alegreya Sans", "Trebuchet MS", sans-serif`;
      c.fillStyle = '#5A3A3C';
      c.letterSpacing = `${Math.round(6 * s)}px`;
      c.fillText('МУЗЫКАЛЬНЫЙ МУЛЬТФИЛЬМ', W / 2, H * 0.4 + 62 * s + rise);
      c.letterSpacing = '0px';
      c.globalAlpha = 1;
    }
  }
  if (t > T.L + 2.2) {
    const a = clamp((t - T.L - 2.2) / 1.4, 0, 1);
    c.globalAlpha = a;
    c.font = `italic 800 ${Math.round(128 * s)}px "Alegreya", Georgia, serif`;
    c.fillStyle = '#FFF3DC';
    c.fillText('Конец', W / 2, H * 0.42);
    c.globalAlpha = a * clamp((t - T.L - 3.2) / 1.2, 0, 1);
    c.font = `500 ${Math.round(28 * s)}px "Alegreya Sans", "Trebuchet MS", sans-serif`;
    c.fillStyle = 'rgba(255,243,220,0.86)';
    c.fillText('Сочинено, нарисовано и сыграно кодом', W / 2, H * 0.42 + 64 * s);
    c.globalAlpha = 1;
  }
}

/* ---------- Сборка кадра ------------------------------------------------ */
let blurBuf = null;
const FILM = {
  duration: SCORE.duration,
  scenes: SCORE.SCENES,
  render(t) {
    const c = VIEW.c, { W, H } = VIEW;
    t = clamp(t, 0, SCORE.duration);
    const P = paletteAt(t);
    LIGHT.tint = P.tint; LIGHT.lift = P.lift; LIGHT.rim = P.rim; LIGHT.rimA = P.rimA;
    SHADE.clear();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    if (t >= INSERT[0] && t < INSERT[1]) {
      drawInsert(c, t, P);
      drawVignette(c, 0.35);
      drawPaper(c, 0.32);
      return;
    }
    const cam = cameraAt(t);
    Object.assign(VIEW.cam, cam);
    // небо, солнце, облака
    drawSky(c, P, t);
    drawSun(c, P);
    drawClouds(c, P, t);
    // вода, берега, отражения
    drawWaterBase(c, P);
    drawShore(c, P);
    const sunX = screenX(0.02, 360);
    drawWaterDetail(c, P, t, sunX);
    drawReeds(c, P, t, 0.3, 0.7, true);
    drawReeds(c, P, t, 0.3, 0.5);
    drawPads(c, P, t, 0.2, 0.9);
    drawChoir(c, t);
    drawReeds(c, P, t, 0.5, 0.7);
    drawFireflies(c, t, 0.6, 2.5, true);
    drawFireflies(c, t, 0.6, 0.93);
    // сцена
    drawStage(c, t);
    drawFireflies(c, t, 0.93, 2.5);
    drawPads(c, P, t, 1.1, 2.5);
    // смазанная панорама
    if (cam.shot >= 0) {
      const c0 = camAt(t - 1 / 60);
      const vx = (cam.x - c0.x) * VIEW.K * cam.z, vy = (cam.y - c0.y) * VIEW.K * cam.z;
      const sp = Math.hypot(vx, vy);
      if (sp > 10 * VIEW.K && c0.shot === cam.shot) {
        if (!blurBuf || blurBuf.width !== W || blurBuf.height !== H) { blurBuf = document.createElement('canvas'); blurBuf.width = W; blurBuf.height = H; }
        const b = blurBuf.getContext('2d', { willReadFrequently: !!window.__SHOT__ });
        b.setTransform(1, 0, 0, 1, 0, 0); b.drawImage(c.canvas, 0, 0);
        c.setTransform(1, 0, 0, 1, 0, 0);
        const n = 4, ux = vx / sp, uy = vy / sp, len = Math.min(sp * 1.6, 120 * VIEW.K);
        for (let i = 1; i <= n; i++) { c.globalAlpha = 0.28; c.drawImage(blurBuf, -ux * len * i / n, -uy * len * i / n); }
        c.globalAlpha = 1;
      }
    }
    // «Дзынь!» на своём месте: нота лягушонка зажигает тёплый свет вокруг него
    const ring2 = t >= D2 ? decay(t - D2, 1.6) * clamp((t - D2) / 0.06, 0, 1) : 0;
    if (ring2 > 0.01) {
      const L = layerT(1), r = L.s * 300;
      const gx = L.ox + L.s * (HERO.x - 30), gy = L.oy + L.s * (footY(HERO.d) - 88);
      c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.42 * ring2;
      c.drawImage(WARM, gx - r, gy - r, r * 2, r * 2);
      c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    }
    // настроение: стыд — сумрак сжимается вокруг лягушонка; улыбка дирижёра — тепло возвращается
    const shame = clamp((t - DG - 2.4) / 1.0, 0, 1) * clamp((DG + 8.2 - t) / 0.8, 0, 1);
    drawVignette(c, 0.3 + 0.35 * shame, shame > 0.01 ? '24,26,48' : '44,22,20');
    const warm = clamp((t - DG - 6.7) / 0.6, 0, 1) * clamp((DG + 8.3 - t) / 0.8, 0, 1);
    if (warm > 0.01) {
      c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.18 * warm;
      c.drawImage(WARM, -W * 0.2, -H * 0.4, W * 1.4, H * 1.6); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    }
    drawPaper(c, 0.3);
    drawTitle(c, t);
  },
};
