'use strict';
/* ==========================================================================
   Садовник на Луне · мир: небо, Земля, Солнце, рельеф, реголит
   ========================================================================== */

/* ---------- Небо: звёзды и Млечный Путь ----------
   Звёзды привязаны к угловой сетке неба, поэтому при панораме они
   движутся вместе с небом. На Луне нет воздуха — звёзды не мерцают. */
const SKY = { mw: 1, starBoost: 1, glow: null };
function milky(az, el) {
  const c = 0.42 + 0.62 * az;              // ось полосы
  const d = (el - c) / 0.2;
  const band = Math.exp(-d * d);
  if (band < 0.02) return 0;
  const n = fbm(az * 7 + 3, el * 7, 3, 11);
  const lane = sstep(0.55, 0.75, fbm(az * 13, el * 13 + 5, 2, 23)) * Math.exp(-d * d * 4);
  return band * (0.35 + 0.9 * n) * (1 - 0.8 * lane);
}
/* Млечный Путь считаем один раз в текстуру по азимуту/высоте */
const MW_AZ0 = -2.2, MW_EL0 = -0.5, MW_RES = 0.01, MW_W = 440, MW_H = 220;
const MW_TEX = new Float32Array(MW_W * MW_H);
function buildMilky() {
  for (let y = 0; y < MW_H; y++) for (let x = 0; x < MW_W; x++) MW_TEX[y * MW_W + x] = milky(MW_AZ0 + x * MW_RES, MW_EL0 + y * MW_RES);
}
function mwAt(az, el) {
  const fx = (az - MW_AZ0) / MW_RES, fy = (el - MW_EL0) / MW_RES;
  if (fx < 0 || fy < 0 || fx >= MW_W - 1 || fy >= MW_H - 1) return 0;
  const x = fx | 0, y = fy | 0, u = fx - x, v = fy - y, i = y * MW_W + x;
  return (MW_TEX[i] * (1 - u) + MW_TEX[i + 1] * u) * (1 - v) + (MW_TEX[i + MW_W] * (1 - u) + MW_TEX[i + MW_W + 1] * u) * v;
}
function drawSky() {
  const f = CAM.f, yaw = CAM.yaw, pitch = CAM.pitch;
  const cell = 1 / f;
  const gl = SKY.glow; // зодиакальный свет и корона перед восходом
  // 1. фон неба
  for (let py = 0; py < H; py++) {
    const el = pitch + (H / 2 - py - 0.5) / f;
    for (let px = 0; px < W; px++) {
      const i = py * W + px;
      if (GB_D[i] !== Infinity) continue;
      const az = yaw + (px + 0.5 - W / 2) / f;
      const j = i * 3;
      const m = SKY.mw ? mwAt(az, el) : 0;
      let r = 0.012 + m * 0.075, g = 0.011 + m * 0.07, b = 0.024 + m * 0.13;
      if (gl) {
        // свечение у горизонта над точкой восхода и тонкие лучи короны
        const dxa = az - gl.az, up = el - gl.el;
        const band = Math.exp(-(dxa * dxa) / (gl.rx * gl.rx)) * Math.exp(-Math.max(0, up) / gl.ry) * gl.k;
        let rays = 0;
        if (gl.rays > 0 && up > -0.01) {
          const ang = Math.atan2(up, dxa), rr = Math.sqrt(dxa * dxa + up * up);
          const spokes = Math.pow(Math.max(0, Math.cos(ang * 7 + 0.4)), 40) + 0.6 * Math.pow(Math.max(0, Math.cos(ang * 11 - 1.1)), 60);
          rays = spokes * Math.exp(-rr / 0.09) * gl.rays;
        }
        const q = band + rays;
        r += q * gl.r; g += q * gl.g; b += q * gl.b;
      }
      GB_A[j] = r; GB_A[j + 1] = g; GB_A[j + 2] = b;
      GB_F[i] = F_SKY; GB_D[i] = 1e9; GB_O[i] = m > 0 ? Math.min(200, (m * 100) | 0) : 0;
    }
  }
  // 2. звёзды: сетка неба, одна проверка хеша на пиксель
  for (let py = 0; py < H; py++) {
    const el = pitch + (H / 2 - py - 0.5) / f;
    const cyI = Math.floor(el / cell);
    for (let px = 0; px < W; px++) {
      const i = py * W + px;
      if (GB_D[i] !== 1e9) continue;
      const az = yaw + (px + 0.5 - W / 2) / f;
      const cxI = Math.floor(az / cell);
      const m = GB_O[i] / 100;
      const h = ihash(cxI, cyI, 7);
      if (h >= (0.0045 + m * 0.03) * SKY.starBoost) continue;
      const hb = ihash(cxI, cyI, 9);
      const br = 0.25 + 0.95 * hb * hb * hb;
      const tint = h * 1e3 % 1;
      const j = i * 3;
      GB_A[j] += br * (tint < 0.2 ? 1.0 : tint > 0.85 ? 0.75 : 0.9);
      GB_A[j + 1] += br * (tint < 0.2 ? 0.88 : 0.92);
      GB_A[j + 2] += br * (tint < 0.2 ? 0.7 : tint > 0.85 ? 1.1 : 1.0);
      if (hb > 0.93) { // лучи
        const nb = [i - 1, i + 1, i - W, i + W];
        for (const q of nb) if (q >= 0 && q < NPX && GB_D[q] === 1e9) { const k = q * 3; GB_A[k] += 0.3; GB_A[k + 1] += 0.31; GB_A[k + 2] += 0.36; }
      }
    }
  }
  for (let i = 0; i < NPX; i++) if (GB_D[i] === 1e9) GB_O[i] = 0;
}

/* ---------- Земля ----------
   Материки — упрощённые контуры по долготе и широте, растеризованные в
   равнопромежуточную карту; облака — фрактальный шум. Фаза: освещена
   сторона, обращённая к Солнцу (слева), на ночной стороне горят города. */
const EARTH_POLYS = [
  // Африка
  [-17.5,14.7,-16.7,12.4,-15,11,-13.3,9.5,-11.5,6.9,-7.5,4.4,-4,5.2,1,5.9,4.5,6.3,6.5,4.3,8.5,4.6,9.8,2.5,9.4,0.5,8.8,-1,11.8,-3.5,12.4,-6,13.3,-8.8,13.6,-12,11.8,-16,11.8,-18,14.4,-22.9,15.2,-27,16.5,-28.6,18.4,-32.2,18.5,-34.2,20,-34.8,22.5,-34,25.6,-33.9,27.9,-33,30.9,-29.9,32.4,-28.6,32.9,-26,35.5,-24,35.3,-22,34.8,-19.8,36.8,-17.9,40.5,-15.5,40.5,-10.5,39.3,-7.5,39.2,-4.7,40.8,-2.2,43.5,1,46,3.2,48.5,5.8,50.8,10.5,51.3,11.8,49,11.3,45,10.5,43.2,11.5,42.5,14.8,40,16.2,38.5,18.2,37.2,21,36.8,23.5,35.5,24,33.7,27.3,32.6,29.9,31.2,31.4,29.9,31.2,25,31.6,20.1,32.2,19.6,30.5,15.3,31.8,11.1,33.3,10.2,36.7,9.3,37.2,3.2,36.8,-1.2,35.4,-5.9,35.8,-6.9,34.3,-8.6,33.3,-9.8,30.3,-11.6,28,-13.2,27.5,-14.8,26.3,-16,23.8,-17.1,21,-16.1,18.6,-16.5,16.3],
  // Мадагаскар
  [49.3,-12,50.2,-15.5,49.6,-17,48.9,-20,47.3,-24.9,45.2,-25.5,43.7,-23.7,43.3,-21.6,44.4,-19.8,44,-17.2,46.2,-15.8,48,-13.5],
  // Евразия (контур грубый: важны Европа, Аравия, Индия)
  [-9,43.2,-9.3,39.5,-8.9,37,-6.3,36.8,-5.6,36,-4.4,36.7,-2.2,36.7,-0.5,38.3,0.2,39.6,0.9,41,3.2,41.9,3.1,43.1,4.8,43.4,6.6,43.1,7.5,43.8,8.8,44.4,10.2,43.9,10.5,42.9,12.2,41.7,14.1,40.8,15.6,40,16.1,38.9,15.7,38,16.2,38,17.1,39,18.4,40.1,17.2,40.5,16,41.4,14,42.6,13.6,43.6,12.3,44.5,12.4,45.4,13.7,45.6,15.2,44.2,17.5,43,19.4,41.9,19.4,40.3,21.1,38.3,21.7,36.8,22.8,36.4,23.2,37.8,24,38.2,22.9,39.5,23.9,40.8,26.2,40.9,26.3,40.1,26.8,38.8,27.4,37.3,28.3,36.7,30.6,36.8,32.8,36.1,34.6,36.8,36.2,36.6,35.8,35.2,35.1,33.1,34.2,31.3,32.6,31,32.5,29.9,34.1,28,34.6,28.4,35.2,28.1,36.7,26,38.1,24,39.1,21.9,40.7,19.3,42.6,16.4,43.4,13,45,12.8,48.7,14,52.2,15.6,55.2,17.3,57.8,19,58.9,21.3,59.8,22.5,58.5,23.7,56.4,24.9,56.3,26.2,54.6,24.3,51.6,24.3,51.1,26.1,50.2,26.4,48.4,28.5,47.9,30,50.3,30.2,51.3,28.2,54,26.7,56.8,27.1,57.4,25.7,61.6,25.2,66.5,25.4,67.4,24,68.7,23,70.3,22.3,72.6,21.4,72.8,19,73.4,16,74.6,13.2,76.1,10,77.5,8.1,78.2,8.9,79.8,10.3,80.2,13.3,80.3,15.8,82.3,16.6,84.8,19.3,86.9,21.1,88.9,21.6,90.6,22.4,91.8,22.4,92.5,20.7,94.3,18.2,94.4,16,97.6,16.5,98.2,13,98.6,8.3,100.3,6,101.4,2.8,103.4,1.3,104.2,1.5,103.4,4.3,102.2,6.2,100.6,7.2,100,9.3,99.9,12.7,102.1,12.3,104.8,10.5,106.8,10.4,109.3,11.9,109.2,13.8,108.3,15.5,106.7,17.3,105.7,18.9,106.7,20.7,108.5,21.7,110.4,20.7,111.8,21.6,113.6,22.3,114.9,22.9,117.4,23.7,119.6,25.8,120.6,27.9,122,30,121.8,31.6,120.2,34,119.2,35.1,122.4,37,121,37.8,118.9,38.1,117.7,39,119.3,39.8,121.4,40.9,122,40.4,124.3,39.9,126.4,37.8,126.7,35,129.3,35.2,129.4,36.8,128.4,38.6,127.5,39.8,129.7,40.9,130.8,42.6,133.2,42.8,135.1,43.8,138.2,46.9,140.5,50.5,141.4,53,137.6,54.2,135.1,54.7,137.4,57.1,140.3,58.2,143.2,59.4,148.4,59.3,152.3,59.1,155.3,59.2,154.2,59.9,156.6,61.3,160.4,61.8,164.2,62.3,163.5,60,162,57.8,156.8,57,156.1,51.2,158.8,52.9,162.2,56.2,163.3,58,166.9,59.9,172.1,60.9,177.3,62.4,179.5,62.3,179.9,65.2,180,68.9,175,69.7,170.3,70.1,160,69.6,151.6,70.7,146.3,72.2,139.8,72.4,129.6,71.2,126.5,72.9,118.8,73.6,112.9,73.8,110.2,76.8,104.1,77.7,98.2,76.2,90.4,75.8,87.2,73.8,80.8,73.3,80.6,72.3,77.5,72.3,74,68.5,72.5,68.8,69,68.2,66.1,69.2,60.9,69.9,55.4,68.5,53.2,68.6,48.8,67.9,44.2,68.4,43.9,66.1,41.2,66.8,38.8,64.4,36.3,64.8,34.5,66.1,33.2,66.6,34.7,65.3,34.9,64.2,37.2,63.8,37.3,62.9,39.5,64.5,41.1,66.8,41.1,67.8,43.8,68.5,46.3,69.9,40.3,71.2,31.2,70.5,28.7,70.9,25.5,71.2,21.4,70.3,18.2,69.8,15,68.6,13.8,67.4,14.5,66,12.5,65.1,11.2,64.1,9.4,63.1,6.2,62.3,5,61.1,5,59.4,5.8,58.3,7,58.1,8.2,58.5,9.6,59.2,10.6,59.4,11.3,58.9,11.8,58,12.5,56.8,12.9,55.4,14.2,55.4,14.6,56.3,16.4,56.8,16.6,58.4,17.8,59.7,18.9,60.2,17.7,60.9,17.3,62.3,19,63.4,21,64,21.4,65,22.2,65.8,25.2,65.2,24.6,64.2,22,62.8,21.4,61.3,21.8,60.4,23.2,59.9,26,60.4,28.8,60.6,30,59.9,28,59.5,23.9,59.3,23.4,58.4,24.3,57.2,21.4,57.3,21.1,56,21.2,55.2,19.9,54.9,18.6,54.6,16.4,54.5,14.2,53.9,12.4,54.3,11,54,9.9,54.8,8.6,54.9,8.1,53.5,6.9,53.4,5.4,53.2,4.4,51.9,3.3,51.3,1.9,51,1.6,50.1,0.2,49.7,-1.2,49.4,-1.9,48.7,-4.6,48.6,-4.5,47.8,-2.2,47,-1.4,46,-1.3,44.5,-1.8,43.4,-4.2,43.4,-7,43.6],
  // Великобритания
  [-5.7,50.1,-3.5,50.3,1.3,51.1,1.7,52.7,0.3,53.4,-0.4,54.6,-1.6,55.6,-2.1,57,-1.8,57.6,-3.1,58.6,-5,58.6,-5.7,57.5,-5.6,56.3,-6.2,55.4,-4.9,54.8,-3.4,54.9,-3.2,54.2,-3,53.4,-4.6,53.3,-4.2,52.3,-5.3,51.8,-3.4,51.4,-4.9,50.9],
  // Ирландия
  [-6.2,53.9,-6,52.2,-7.6,51.8,-9.9,51.6,-10.2,52.3,-9.5,53.4,-10.2,54,-8.3,55.2,-6.3,55.2],
  // Исландия
  [-22,63.9,-18,63.4,-14.5,64.3,-13.6,65.1,-14.9,66.3,-16.9,66.5,-20.4,66,-22.6,66.4,-24.3,65.5,-22.1,64.9,-24,64.8],
  // Шри-Ланка
  [79.9,6.8,80.2,9.5,81.2,8.6,81.8,7.3,81.1,6.1,80.1,5.9],
  // Япония (Хонсю грубо)
  [130.9,33.9,132.6,34.3,135.1,34.6,136.9,34.3,139.1,35.1,140.9,35.7,140.7,38.3,141.5,40.5,141.4,41.4,140,40.7,139.8,39.1,137.3,36.9,136.1,35.7,133.1,35.5],
  // Суматра, Борнео, Ява (грубо)
  [95.3,5.5,97.5,5.2,100.4,2.2,103.8,-1,106,-3.1,105.8,-5.8,104.5,-5.9,102.3,-4,100.9,-2,99.5,0.2,98.6,1.8],
  [109.6,1.9,111.2,2.7,113,3.2,115.5,5.4,117.9,6.3,119.2,5.4,117.3,3.2,118,0.8,116.6,-1.5,116,-3.6,114.6,-4.2,111.8,-3.5,110.2,-2.9,109,-0.4],
  [105.2,-6.8,108.6,-6.8,110.4,-6.9,112.6,-6.9,114.5,-7.8,114.4,-8.7,111.5,-8.3,108.3,-7.8,106.5,-7.4],
  // Гренландия
  [-45,60,-43,60.5,-40,64,-35,66,-24,70,-22,73,-18,76,-20,80,-30,83,-50,82.5,-62,81,-68,77,-73,76,-66,74,-58,72,-54,70,-53,67,-50,64,-48,61],
  // Южная Америка (восток)
  [-35,-5.5,-37,-11,-39,-15,-39.5,-19,-41,-22,-44,-23,-48,-26,-48.5,-28.5,-50.5,-31,-53,-34,-57,-35,-58.5,-38.5,-62,-39,-65,-42,-65.5,-45,-67.5,-47,-69,-51,-68.5,-55,-72,-54,-75,-50,-74,-45,-73.5,-40,-72,-35,-71.5,-30,-70.5,-23,-70,-18,-72,-17,-76,-14,-78,-10,-80,-6,-81,-4,-80,-1,-80,1,-78,3,-77,8,-75,11,-71,12,-68,10.5,-64,10.6,-61,10.5,-58,7,-54,5.8,-51,4,-50,1.5,-48.5,-1,-44,-2.5,-40,-3],
];
const EM_W = 360, EM_H = 180;
const EARTH_LAND = new Uint8Array(EM_W * EM_H);
const EARTH_CLOUD = new Float32Array(256 * 128);
let EARTH_READY = false;
function buildEarth() {
  // сканлайн-заливка многоугольников
  for (const poly of EARTH_POLYS) {
    const n = poly.length / 2;
    for (let row = 0; row < EM_H; row++) {
      const lat = 90 - (row + 0.5);
      const xs = [];
      for (let i = 0, j = n - 1; i < n; j = i, i++) {
        const xi = poly[i * 2], yi = poly[i * 2 + 1], xj = poly[j * 2], yj = poly[j * 2 + 1];
        if ((yi > lat) !== (yj > lat)) xs.push(xi + (lat - yi) / (yj - yi) * (xj - xi));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const c0 = Math.ceil(xs[k] + 180 - 0.5), c1 = Math.floor(xs[k + 1] + 180 - 0.5);
        for (let c = c0; c <= c1; c++) EARTH_LAND[row * EM_W + ((c % EM_W) + EM_W) % EM_W] = 1;
      }
    }
  }
  // Антарктида и полярные льды
  for (let row = 0; row < EM_H; row++) {
    const lat = 90 - (row + 0.5);
    if (lat < -69 + 2 * Math.sin(row)) for (let c = 0; c < EM_W; c++) EARTH_LAND[row * EM_W + c] = 2;
  }
  for (let y = 0; y < 128; y++) for (let x = 0; x < 256; x++) {
    const lon = x / 256 * 360, lat = 90 - y / 128 * 180;
    const w = fbm(x / 256 * 14 + 0.3 * Math.sin(lat * 0.2), y / 128 * 8, 5, 31);
    const band = 0.55 + 0.25 * Math.cos(lat * Math.PI / 180 * 3.2); // пояса облаков
    EARTH_CLOUD[y * 256 + x] = sstep(0.5, 0.72, w * band + 0.18 * vnoise(lon * 0.08, lat * 0.08, 5));
  }
  EARTH_READY = true;
}
const CITIES = [[28.6,77.2],[19,72.8],[22.6,88.4],[13,80.3],[12.9,77.6],[17.4,78.5],[23,72.6],[26.9,80.9],[25.4,68.4],[24.9,67],[31.5,74.3],[33.7,73],[25.2,55.3],[24.7,46.7],[35.7,51.4],[33.3,44.4],[41,29],[39.9,32.8],[30,31.2],[31.9,35.9],[55.7,37.6],[59.9,30.3],[50.4,30.5],[40.4,49.9],[41.3,69.2],[43.2,76.9],[39.9,116.4],[31.2,121.5],[23.1,113.3],[30.6,104.1],[30.6,114.3],[22.3,114.2],[34.3,108.9],[36.1,120.4],[23.8,90.4],[21,105.8],[13.8,100.5],[16.8,96.2],[6.9,79.9],[1.35,103.8],[3.1,101.7],[-6.2,106.8],[37.6,127],[35.7,139.7],[34.7,135.5],[56.8,60.6],[55,82.9],[53.2,50.1],[47.2,39.7],[45,41.9]];
/* Земля: центр по азимуту/высоте, угловой радиус; sunV — направление на Солнце (вид) */
const EARTH = { az: 0.3, el: 0.14, rad: 0.03, lat0: 14, lon0: -28, sun: [0.89, 0.1, -0.44] };
function drawEarth() {
  if (!EARTH_READY) buildEarth();
  const f = CAM.f;
  const ex = skyX(EARTH.az), ey = skyY(EARTH.el), R = EARTH.rad * f;
  if (ex + R + 3 < 0 || ex - R - 3 > W || ey + R + 3 < 0 || ey - R - 3 > H) return;
  // базис Земли (широта/долгота подсмотренной точки)
  const la = EARTH.lat0 * Math.PI / 180, lo = EARTH.lon0 * Math.PI / 180;
  const oz = [Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)];
  let oy = [-Math.sin(la) * Math.sin(lo), Math.cos(la), -Math.sin(la) * Math.cos(lo)];
  const ox = [oy[1] * oz[2] - oy[2] * oz[1], oy[2] * oz[0] - oy[0] * oz[2], oy[0] * oz[1] - oy[1] * oz[0]];
  const S = EARTH.sun, sl = hyp3(S[0], S[1], S[2]);
  const sx = S[0] / sl, sy = S[1] / sl, sz = S[2] / sl;
  const x0 = Math.max(0, Math.floor(ex - R - 3)), x1 = Math.min(W - 1, Math.ceil(ex + R + 3));
  const y0 = Math.max(0, Math.floor(ey - R - 3)), y1 = Math.min(H - 1, Math.ceil(ey + R + 3));
  for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
    const i = py * W + px;
    if (GB_D[i] <= 1e8) continue;
    const u = (px + 0.5 - ex) / R, v = (ey - py - 0.5) / R;
    const rr = u * u + v * v;
    const j = i * 3;
    if (rr > 1) {
      // тонкий ореол атмосферы на дневной стороне
      const rd = Math.sqrt(rr);
      if (rd < 1 + 1.6 / R + 0.02) {
        const ndl = (u * sx + v * sy) / rd;
        if (ndl > -0.1) {
          const k = (1 - (rd - 1) / (1.6 / R + 0.02)) * clamp(ndl + 0.3, 0, 1) * 0.55;
          GB_A[j] = 0.12 * k; GB_A[j + 1] = 0.35 * k; GB_A[j + 2] = 0.8 * k;
          GB_E[j] = 0; GB_E[j + 1] = 0; GB_E[j + 2] = 0;
          GB_F[i] = F_SKY; GB_D[i] = 1e8;
        }
      }
      continue;
    }
    const w = Math.sqrt(1 - rr);
    const nx = u, ny = v, nz = w;
    // точка на Земле
    const px3 = ox[0] * nx + oy[0] * ny + oz[0] * nz;
    const py3 = ox[1] * nx + oy[1] * ny + oz[1] * nz;
    const pz3 = ox[2] * nx + oy[2] * ny + oz[2] * nz;
    const lat = Math.asin(clamp(py3, -1, 1)) * 180 / Math.PI;
    const lon = Math.atan2(px3, pz3) * 180 / Math.PI;
    const mc = clamp(Math.floor(lon + 180), 0, EM_W - 1), mr = clamp(Math.floor(90 - lat), 0, EM_H - 1);
    const land = EARTH_LAND[mr * EM_W + mc];
    const cu = ((lon + 180) / 360 * 256) | 0, cv = clamp(((90 - lat) / 180 * 128) | 0, 0, 127);
    const cloud = EARTH_CLOUD[cv * 256 + (cu & 255)];
    let r, g, b;
    if (land === 2) { r = 0.92; g = 0.95; b = 1.0; }
    else if (land === 1) {
      const al = Math.abs(lat);
      const dry = sstep(10, 18, al) * (1 - sstep(33, 40, al)); // пустынный пояс
      const cold = sstep(55, 68, al);
      r = lerp(lerp(0.22, 0.78, dry), 0.85, cold); g = lerp(lerp(0.42, 0.62, dry), 0.88, cold); b = lerp(lerp(0.16, 0.38, dry), 0.92, cold);
    } else { r = 0.03; g = 0.16; b = 0.42; }
    const cl = cloud * (land === 2 ? 0.3 : 1);
    r = lerp(r, 0.96, cl); g = lerp(g, 0.97, cl); b = lerp(b, 1.0, cl);
    const ndl = nx * sx + ny * sy + nz * sz;
    const lit = sstep(-0.04, 0.12, ndl);
    const limb = Math.pow(1 - w, 3);
    let cr = r * (0.18 + 1.05 * clamp(ndl, 0, 1)) * lit, cg = g * (0.18 + 1.05 * clamp(ndl, 0, 1)) * lit, cb = b * (0.18 + 1.05 * clamp(ndl, 0, 1)) * lit;
    cr += limb * 0.15 * lit; cg += limb * 0.4 * lit; cb += limb * 0.9 * lit; // синева атмосферы на краю
    // солнечный блик на океане
    if (!land && ndl > 0) {
      const hx = sx, hy = sy, hz = sz + 1, hl = hyp3(hx, hy, hz);
      const nh = (nx * hx + ny * hy + nz * hz) / hl;
      const gl = Math.pow(Math.max(0, nh), 60) * 0.9 * (1 - cl);
      cr += gl; cg += gl * 0.95; cb += gl * 0.85;
    }
    // ночная сторона: огни городов
    if (lit < 0.5 && land === 1 && R > 12) {
      for (let k = 0; k < CITIES.length; k++) {
        const c = CITIES[k];
        const dl = Math.abs(c[0] - lat), dn = Math.abs(c[1] - lon);
        if (dl < 1.4 && dn < 1.4) { const q = (1 - lit * 2) * 0.55; cr += q; cg += q * 0.72; cb += q * 0.3; break; }
      }
      const hh = ihash(mc, mr, 3);
      if (hh > 0.93) { const q = (1 - lit * 2) * 0.12; cr += q; cg += q * 0.7; cb += q * 0.3; }
    }
    // пепельный свет на ночной стороне
    cr += 0.012 * (1 - lit); cg += 0.018 * (1 - lit); cb += 0.04 * (1 - lit);
    GB_A[j] = cr; GB_A[j + 1] = cg; GB_A[j + 2] = cb;
    GB_E[j] = 0; GB_E[j + 1] = 0; GB_E[j + 2] = 0;
    GB_F[i] = F_SKY; GB_D[i] = 1e8;
  }
}

/* ---------- Солнце ----------
   Крошечный диск (0,27°) и свечение; до восхода — корона над горизонтом. */
const SUN = { az: 0.72, el: -0.06, on: false };
function drawSun() {
  if (!SUN.on) return;
  const f = CAM.f;
  const sx = skyX(SUN.az), sy = skyY(SUN.el);
  const R = Math.max(1.6, 0.0047 * f * 1.6);
  const x0 = Math.max(0, Math.floor(sx - R - 2)), x1 = Math.min(W - 1, Math.ceil(sx + R + 2));
  const y0 = Math.max(0, Math.floor(sy - R - 2)), y1 = Math.min(H - 1, Math.ceil(sy + R + 2));
  for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
    const i = py * W + px;
    if (GB_D[i] <= 1e8) continue;
    const d = hyp(px + 0.5 - sx, py + 0.5 - sy);
    if (d > R) continue;
    const j = i * 3;
    GB_A[j] = 0; GB_A[j + 1] = 0; GB_A[j + 2] = 0;
    GB_E[j] = 7; GB_E[j + 1] = 6.2; GB_E[j + 2] = 4.8;
    GB_F[i] = F_SKY; GB_D[i] = 1e8 - 1;
  }
}
/* Анаморфный блик: горизонтальная полоса через кадр от видимого края диска.
   Рисуется поверх готового кадра, яркость — сколько диска выглянуло. */
function sunStreak(buf, vis) {
  if (!SUN.on || vis <= 0) return;
  const sx = skyX(SUN.az), sy = Math.round(skyY(SUN.el));
  for (let dy = -1; dy <= 1; dy++) {
    const y = sy + dy;
    if (y < 0 || y >= H) continue;
    const k0 = dy === 0 ? 1 : 0.3;
    for (let x = 0; x < W; x++) {
      const d = Math.abs(x + 0.5 - sx);
      const k = vis * k0 * (Math.exp(-d / 22) * 0.9 + Math.exp(-d / 110) * 0.25);
      if (k < 0.02) continue;
      const j = (y * W + x) * 3;
      buf[j] += k * 1.2; buf[j + 1] += k * 0.95; buf[j + 2] += k * 0.62;
    }
  }
}

/* ---------- Горы: слои-кулисы на разной глубине ----------
   Лунные горы сглажены микрометеоритами — мягкие купола, а не пики. */
const RIDGES = [
  { Z: 7000, base: 90, amp: 700, sc: 2600, seed: 3, alb: 0.46, rough: 0.6, pass: 300, passW: 420 },
  { Z: 1900, base: 10, amp: 150, sc: 820, seed: 5, alb: 0.42, rough: 0.8, pass: 75, passW: 110 },
  { Z: 380, base: 1.5, amp: 19, sc: 150, seed: 9, alb: 0.38, rough: 1, pass: 14, passW: 26 },
];
function ridgeH(L, X) {
  const x = X / L.sc;
  let h = fbm(x, L.seed * 7.1, 4, L.seed);
  h = sstep(0.28, 0.9, h);
  // широкий кратерный вал на дальнем слое
  const bump = Math.exp(-Math.pow((X / L.sc - 0.35) * 1.6, 2)) * 0.25;
  // седловина-перевал в сторону Земли: в неё смотрит телевик
  const v = (X - L.pass) / L.passW;
  const valley = 1 - 0.8 * Math.exp(-v * v);
  return (L.base + L.amp * (h + (L.seed === 3 ? bump : 0))) * valley;
}
const RIDGE_TOP = new Float32Array(W + 2);
const RIDGE_SH = new Float32Array(W + 2);
const ridgeMat = mat(0.5, 0.5, 0.52, { flags: F_LIT | F_REGO });
/* shadeAll — весь хребет в тени от Солнца. Нужен телевику: тень считается
   в экранном пространстве от правого края кадра, и при семикратном
   увеличении гребень превращается в тонкую яркую нить через весь кадр. */
function drawRidge(L, sunTan, shadeAll) {
  const D = L.Z - CAM.z;
  if (D <= 1) return;
  const f = CAM.f, yaw = CAM.yaw;
  const dX = D / f;
  for (let px = -1; px <= W; px++) {
    const X = CAM.x + ((px + 0.5 - W / 2) / f + yaw) * D;
    RIDGE_TOP[px + 1] = ridgeH(L, X);
  }
  // высота тени от восходящего Солнца (справа): бежим справа налево
  if (sunTan !== null) {
    let s = -1e9;
    for (let px = W; px >= -1; px--) {
      s = Math.max(RIDGE_TOP[px + 1], s - dX * sunTan);
      RIDGE_SH[px + 1] = s;
    }
  }
  const baseY = syOf(0, D);
  for (let px = 0; px < W; px++) {
    const h = RIDGE_TOP[px + 1];
    const slope = (RIDGE_TOP[px + 2] - RIDGE_TOP[px]) / (2 * dX);
    const top = syOf(h, D);
    const yA = Math.max(0, Math.floor(top)), yB = Math.min(H - 1, Math.ceil(baseY));
    const X = CAM.x + ((px + 0.5 - W / 2) / f + yaw) * D;
    for (let py = yA; py <= yB; py++) {
      const i = py * W + px;
      if (D > GB_D[i]) continue;
      const Y = CAM.y + ((H / 2 - py - 0.5) / f + CAM.pitch) * D;
      if (Y > h) continue;
      const depth = (h - Y) / (L.amp * 0.35 + 1);          // 0 у гребня
      const bump = vnoise(X / (L.sc * 0.08), Y / (L.amp * 0.12 + 1), L.seed + 40) * 0.7 + vnoise(X / (L.sc * 0.03), Y / (L.amp * 0.05 + 1), L.seed + 41) * 0.3 - 0.5;
      const k = Math.exp(-depth * 3);
      const crest = Math.exp(-(h - Y) / (dX * 1.5 + 1e-6));  // пара пикселей у самого гребня
      let nx = -slope * k * 1.6 + bump * 1.1, ny = k * 1.0 + 0.35 + bump * 0.35, nz = 0.5 + (1 - k) * 0.6 - crest * 1.2;
      const nl = hyp3(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
      const alb = L.alb * (0.86 + 0.28 * vnoise(X / (L.sc * 0.2), Y / (L.amp * 0.3 + 1), L.seed + 70));
      writePx(i, D, ridgeMat, nx, ny, nz);
      const j = i * 3;
      GB_A[j] = alb; GB_A[j + 1] = alb * 0.99; GB_A[j + 2] = alb * 1.04;
      // тень рассвета: солнечный свет выключаем через маску в спец-канале
      if (sunTan !== null && (shadeAll || Y < RIDGE_SH[px + 1] - 0.02 * L.amp)) GB_O[i] = 250;
    }
  }
}

/* ---------- Реголит: пол до горизонта ----------
   Для каждой строки ниже горизонта знаем глубину плоскости, для каждого
   пикселя — мировые X, Z. Кратеры, тропинка, грядка, следы — в мировых
   координатах, поэтому держатся на месте при движении камеры. */
const CRATERS = [];      // {x, z, r, d, fresh}
const CR_GRID = new Map();
const CR_CELL = 4;
function crKey(ix, iz) { return ix * 73856093 ^ iz * 19349663; }
function addCrater(c) {
  CRATERS.push(c);
  const x0 = Math.floor((c.x - c.r * 1.5) / CR_CELL), x1 = Math.floor((c.x + c.r * 1.5) / CR_CELL);
  const z0 = Math.floor((c.z - c.r * 1.5) / CR_CELL), z1 = Math.floor((c.z + c.r * 1.5) / CR_CELL);
  for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
    const k = crKey(ix, iz);
    if (!CR_GRID.has(k)) CR_GRID.set(k, []);
    CR_GRID.get(k).push(c);
  }
}
function buildCraters() {
  const R = mulberry(77);
  const put = (x, z, r) => addCrater({ x, z, r, d: 0.22, t: -1 });
  put(-16, 34, 7); put(13, 24, 4.5); put(38, 70, 14); put(-7, 13, 2.2); put(5.5, 8.5, 1.3); put(-30, 60, 9);
  put(24, 42, 6); put(-2.6, 5.2, 0.7); put(3.2, 3.8, 0.45); put(-9, 6.5, 1.1); put(9, 14, 1.6);
  for (let n = 0; n < 150; n++) {
    const z = 1.2 + Math.pow(R(), 1.6) * 90, x = (R() - 0.5) * (30 + z * 1.6);
    const r = 0.12 + Math.pow(R(), 3) * (0.8 + z * 0.05);
    if (hyp(x, z) < 1.2) continue;
    put(x, z, r);
  }
}
/* Высота кратера в точке (для нормали) */
function craterH(c, x, z) {
  const q = hyp(x - c.x, z - c.z) / c.r;
  if (q < 1) return c.r * c.d * (q * q - 1) + c.r * 0.06;                // чаша
  if (q < 1.6) { const k = (q - 1) / 0.6; return c.r * 0.06 * (1 - k) * (1 - k); } // вал
  return 0;
}

const FLOOR = {
  paths: [],        // тропинки {x0,z0,x1,z1,w}
  beds: [],         // грядки {x, z, r}
  prints: [],       // следы {x, z, c, s, t, k}
  ao: [],           // контактные тени {x, z, rx, rz, k}
  fresh: [],        // свежие кратеры {x, z, r, t, hot}
  wet: [],          // мокрые пятна {x, z, r, t0, t1}
  time: 0,
  sunLow: null,     // {lx, lz, tan} — длинные тени на рассвете
  rocksShadow: [],  // {x, z, r}
};
const FX = new Float32Array(NPX), FZ = new Float32Array(NPX);
const FLOOR_ALB = 0.34;
/* Крупные пятна реголита — заранее посчитанная текстура 256×256 (повтор ~200 м) */
const REG = new Float32Array(256 * 256);
function buildRegolith() { for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) REG[y * 256 + x] = fbm(x / 16, y / 16, 3, 1); }
function regAt(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), u = x - xi, v = y - yi;
  const x0 = xi & 255, x1 = (xi + 1) & 255, y0 = (yi & 255) << 8, y1 = ((yi + 1) & 255) << 8;
  return (REG[y0 + x0] * (1 - u) + REG[y0 + x1] * u) * (1 - v) + (REG[y1 + x0] * (1 - u) + REG[y1 + x1] * u) * v;
}
const floorMat = mat(0.5, 0.5, 0.5, { flags: F_LIT | F_FLOOR });

/* Прямоугольник экрана, который накрывает участок пола [x0..x1]×[z0..z1] */
const FB = [0, 0, 0, 0];
function floorBox(x0, z0, x1, z1) {
  let mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity, ok = false;
  const zs = [z0, z1], xs = [x0, x1];
  for (const Z of zs) {
    let D = Z - CAM.z;
    if (D < 0.05) D = 0.05; else ok = true;
    for (const X of xs) {
      const sx = sxOf(X, D), sy = syOf(0, D);
      if (sx < mnx) mnx = sx; if (sx > mxx) mxx = sx; if (sy < mny) mny = sy; if (sy > mxy) mxy = sy;
    }
  }
  if (!ok) return null;
  FB[0] = Math.max(0, Math.floor(mnx)); FB[1] = Math.max(0, Math.floor(mny));
  FB[2] = Math.min(W - 1, Math.ceil(mxx)); FB[3] = Math.min(H - 1, Math.ceil(mxy));
  if (FB[0] > FB[2] || FB[1] > FB[3]) return null;
  return FB;
}
/* Размер метра в пикселях на глубине Z */
const pxPerM = (Z) => CAM.f / Math.max(0.05, Z - CAM.z);

function drawFloor() {
  const f = CAM.f, yaw = CAM.yaw, pitch = CAM.pitch, cy = CAM.y;
  if (cy <= 0.01) return;
  const hy = horizonY();
  const yStart = Math.max(0, Math.floor(hy + 0.5));
  const t = FLOOR.time;
  /* 1. База: реголит — крупные пятна и зерно с уровнем детализации по глубине */
  for (let py = yStart; py < H; py++) {
    const q = (py + 0.5 - H / 2) / f - pitch;
    if (q <= 1e-5) continue;
    const D = cy / q;
    if (D > 6000) continue;
    const Z = CAM.z + D;
    const pxSize = D / f;
    const gf = Math.pow(2, Math.floor(Math.log2(clamp(0.6 / pxSize, 1, 256))));
    const grainK = sstep(0.4, 3, gf) * (0.4 + 0.6 * sstep(256, 24, gf));
    const fine = sstep(0.1, 0.02, pxSize);
    const patchK = sstep(1.6, 0.35, pxSize);
    const microK = sstep(0.05, 0.012, pxSize);
    for (let px = 0; px < W; px++) {
      const i = py * W + px;
      if (D > GB_D[i]) continue;
      const X = CAM.x + ((px + 0.5 - W / 2) / f + yaw) * D;
      let alb = FLOOR_ALB + 0.08 * (regAt(X * 1.28, Z * 1.28) - 0.5) * patchK + 0.045 * (vnoise(X * 0.9, Z * 0.9, 2) - 0.5) * fine;
      let nx = 0, nz = 0;
      if (grainK > 0) {
        const g = ihash(Math.floor(X * gf), Math.floor(Z * gf), 4);
        if (g < 0.03 * grainK) { alb += 0.08; nx = 0.45; }
        else if (g > 1 - 0.035 * grainK) { alb -= 0.07; nx = -0.3; }
      }
      // мелкие кратеры-оспины: по одному на ячейку 0,7 м, не у всех ячеек
      if (microK > 0) {
        const cxI = Math.floor(X / 0.7), czI = Math.floor(Z / 0.7);
        const hc = ihash(cxI, czI, 21);
        if (hc < 0.38) {
          const ccx = (cxI + 0.2 + 0.6 * ihash(cxI, czI, 22)) * 0.7, ccz = (czI + 0.2 + 0.6 * ihash(cxI, czI, 23)) * 0.7;
          const cr = 0.05 + 0.2 * hc * hc * 5;
          const ddx = X - ccx, ddz = Z - ccz, q = (ddx * ddx + ddz * ddz) / (cr * cr);
          if (q < 2.1) {
            const d = Math.sqrt(q) + 1e-4;
            if (q < 1) { const g = 0.9 * d * microK; nx -= ddx / (d * cr) * g; nz += ddz / (d * cr) * g; alb -= 0.03 * microK; }
            else { const g = 0.7 * (1.45 - d) * microK; nx += ddx / (d * cr) * g; nz -= ddz / (d * cr) * g; alb += 0.03 * microK; }
          }
        }
      }
      FX[i] = X; FZ[i] = Z;
      GB_D[i] = D;
      const j = i * 3;
      GB_A[j] = alb; GB_A[j + 1] = alb * 0.985; GB_A[j + 2] = alb * 1.02;
      GB_N[j] = nx; GB_N[j + 1] = 1; GB_N[j + 2] = nz;
      GB_E[j] = 0; GB_E[j + 1] = 0; GB_E[j + 2] = 0;
      GB_S[i] = 0; GB_F[i] = F_LIT | F_FLOOR | F_REGO; GB_O[i] = 0;
    }
  }
  const sl = FLOOR.sunLow;
  /* 2. Кратеры: чаша, вал, тень внутри при низком Солнце */
  for (let k = 0; k < CRATERS.length; k++) {
    const c = CRATERS[k];
    if (c.r * pxPerM(c.z) < 1.2) continue;
    const bb = floorBox(c.x - c.r * 1.6, c.z - c.r * 1.6, c.x + c.r * 1.6, c.z + c.r * 1.6);
    if (!bb) continue;
    const e = c.r * 0.02;
    for (let py = bb[1]; py <= bb[3]; py++) for (let px = bb[0]; px <= bb[2]; px++) {
      const i = py * W + px;
      if (!(GB_F[i] & F_FLOOR)) continue;
      const X = FX[i], Z = FZ[i];
      const dxc = X - c.x, dzc = Z - c.z;
      const rq = (dxc * dxc + dzc * dzc) / (c.r * c.r);
      if (rq > 2.56) continue;
      const gx = (craterH(c, X + e, Z) - craterH(c, X - e, Z)) / (2 * e);
      const gz = (craterH(c, X, Z + e) - craterH(c, X, Z - e)) / (2 * e);
      const j = i * 3;
      GB_N[j] -= gx; GB_N[j + 2] += gz;
      if (rq < 1) {
        GB_A[j] *= 0.94; GB_A[j + 1] *= 0.94; GB_A[j + 2] *= 0.94;
        if (sl) {
          const a = (dxc * sl.lx + dzc * sl.lz) / c.r, b = (dxc * -sl.lz + dzc * sl.lx) / c.r;
          const rim = Math.sqrt(Math.max(0, 1 - b * b));
          if ((rim - a) * sl.tan * c.r < c.r * c.d * (1 - rq) + c.r * 0.05) GB_O[i] = 251;
        }
      } else if (rq < 1.44) { GB_A[j] *= 1.07; GB_A[j + 1] *= 1.07; GB_A[j + 2] *= 1.07; }
    }
  }
  /* 3. Тропинка — утоптанный реголит */
  for (const p of FLOOR.paths) {
    const bb = floorBox(Math.min(p.x0, p.x1) - p.w, Math.min(p.z0, p.z1) - p.w, Math.max(p.x0, p.x1) + p.w, Math.max(p.z0, p.z1) + p.w);
    if (!bb) continue;
    const ex = p.x1 - p.x0, ez = p.z1 - p.z0, l2 = ex * ex + ez * ez;
    for (let py = bb[1]; py <= bb[3]; py++) for (let px = bb[0]; px <= bb[2]; px++) {
      const i = py * W + px;
      if (!(GB_F[i] & F_FLOOR)) continue;
      const X = FX[i], Z = FZ[i];
      const h = clamp(((X - p.x0) * ex + (Z - p.z0) * ez) / l2, 0, 1);
      const d = hyp(X - p.x0 - ex * h, Z - p.z0 - ez * h);
      if (d < p.w) { const k2 = sstep(0, 0.6, 1 - d / p.w) * 0.09; const j = i * 3; GB_A[j] *= 1 - k2; GB_A[j + 1] *= 1 - k2; GB_A[j + 2] *= 1 - k2 * 0.8; }
    }
  }
  /* 4. Грядка: тёмная рыхлая земля и кольцо камешков */
  for (const b of FLOOR.beds) {
    const R = b.r + 0.08;
    const bb = floorBox(b.x - R, b.z - R, b.x + R, b.z + R);
    if (!bb) continue;
    for (let py = bb[1]; py <= bb[3]; py++) for (let px = bb[0]; px <= bb[2]; px++) {
      const i = py * W + px;
      if (!(GB_F[i] & F_FLOOR)) continue;
      const X = FX[i], Z = FZ[i];
      const d = hyp(X - b.x, Z - b.z);
      const j = i * 3;
      if (d < b.r) {
        const a = 0.2 + 0.04 * vnoise(X * 40, Z * 40, 8);
        GB_A[j] = a * 1.14; GB_A[j + 1] = a * 0.93; GB_A[j + 2] = a * 0.9;
        const g = ihash(Math.floor(X * 70), Math.floor(Z * 70), 6);
        if (g < 0.25) { GB_A[j] *= 0.85; GB_A[j + 1] *= 0.85; GB_A[j + 2] *= 0.85; GB_N[j] += (g - 0.12) * 2; }
      } else if (d < b.r + 0.07) {
        const ang = Math.atan2(Z - b.z, X - b.x);
        const seg = (ang / TAU * 14 + 14) % 1;
        if (seg > 0.15 && seg < 0.85) {
          const sn = Math.sin(seg * Math.PI);
          const a = 0.38 + 0.06 * sn;
          GB_A[j] = a * 1.03; GB_A[j + 1] = a; GB_A[j + 2] = a * 0.98;
          const rd = (d - b.r) / 0.07 - 0.5;
          GB_N[j] += Math.cos(ang) * rd * 1.4 + Math.cos(seg * TAU) * 0.5; GB_N[j + 2] += Math.sin(ang) * rd * 1.4; GB_N[j + 1] = 0.7 + 0.3 * sn;
        }
      }
    }
  }
  /* 5. Мокрые пятна от полива */
  for (const w of FLOOR.wet) {
    if (t < w.t0) continue;
    const rr = w.r * clamp((t - w.t0) / 0.6, 0.3, 1) * (t > w.t1 ? clamp(1 - (t - w.t1) / 5, 0, 1) : 1);
    if (rr < 0.004) continue;
    const bb = floorBox(w.x - rr, w.z - rr, w.x + rr, w.z + rr);
    if (!bb) continue;
    for (let py = bb[1]; py <= bb[3]; py++) for (let px = bb[0]; px <= bb[2]; px++) {
      const i = py * W + px;
      if (!(GB_F[i] & F_FLOOR)) continue;
      if (GB_S[i] !== 0.375 && hyp(FX[i] - w.x, FZ[i] - w.z) < rr) { const j = i * 3; GB_A[j] *= 0.7; GB_A[j + 1] *= 0.68; GB_A[j + 2] *= 0.74; GB_S[i] = 0.375; }
    }
  }
  /* 6. Следы */
  for (const p of FLOOR.prints) {
    if (p.t > t) continue;
    if (0.045 * pxPerM(p.z) < 0.9) continue;
    const bb = floorBox(p.x - 0.05, p.z - 0.05, p.x + 0.05, p.z + 0.05);
    if (!bb) continue;
    for (let py = bb[1]; py <= bb[3]; py++) for (let px = bb[0]; px <= bb[2]; px++) {
      const i = py * W + px;
      if (!(GB_F[i] & F_FLOOR)) continue;
      const dx = FX[i] - p.x, dz = FZ[i] - p.z;
      const u = dx * p.c + dz * p.s, v = -dx * p.s + dz * p.c;
      if ((u / 0.042) ** 2 + (v / 0.024) ** 2 < 1) {
        const j = i * 3; const k2 = 0.16 * p.k;
        GB_A[j] *= 1 - k2; GB_A[j + 1] *= 1 - k2; GB_A[j + 2] *= 1 - k2;
        GB_N[j] -= u * 8 * p.k;
      }
    }
  }
  /* 7. Свежие кратеры метеоров: светлые выбросы и остывающий жар */
  for (const c of FLOOR.fresh) {
    if (t < c.t) continue;
    const R = c.r * 3.2;
    const bb = floorBox(c.x - R, c.z - R, c.x + R, c.z + R);
    if (!bb) continue;
    const age = t - c.t;
    const grow = clamp(age / 0.25, 0.2, 1);
    const cr = c.r * grow;
    for (let py = bb[1]; py <= bb[3]; py++) for (let px = bb[0]; px <= bb[2]; px++) {
      const i = py * W + px;
      if (!(GB_F[i] & F_FLOOR)) continue;
      const dx = FX[i] - c.x, dz = FZ[i] - c.z, dd = hyp(dx, dz), d = dd / cr;
      if (d > 3.2) continue;
      const j = i * 3;
      if (d < 1) {
        // чаша: нормаль к центру
        GB_N[j] += dx / (dd + 1e-4) * d * 0.9; GB_N[j + 2] -= dz / (dd + 1e-4) * d * 0.9;
        GB_A[j] *= 0.72; GB_A[j + 1] *= 0.72; GB_A[j + 2] *= 0.74;
        const heat = c.hot * Math.exp(-age / 2.2) * (1 - d * d);
        if (heat > 0.01) { GB_E[j] += heat * 2.2; GB_E[j + 1] += heat * 0.75; GB_E[j + 2] += heat * 0.2; }
      } else if (d < 1.6) {
        const q2 = (d - 1) / 0.6;
        GB_N[j] -= dx / dd * 0.5 * (1 - q2); GB_N[j + 2] += dz / dd * 0.5 * (1 - q2);
        GB_A[j] *= 1.2; GB_A[j + 1] *= 1.2; GB_A[j + 2] *= 1.2;
      } else {
        const ang = Math.atan2(dz, dx);
        const ray = Math.pow(Math.max(0, Math.sin(ang * 7 + c.x * 3) * Math.sin(ang * 3 + c.z)), 3);
        const k2 = 1 + 0.22 * ray * (1 - (d - 1.6) / 1.6);
        GB_A[j] *= k2; GB_A[j + 1] *= k2; GB_A[j + 2] *= k2;
      }
    }
  }
  /* 8. Контактные тени под предметами */
  for (const a of FLOOR.ao) {
    const bb = floorBox(a.x - a.rx, a.z - a.rz, a.x + a.rx, a.z + a.rz);
    if (!bb) continue;
    for (let py = bb[1]; py <= bb[3]; py++) for (let px = bb[0]; px <= bb[2]; px++) {
      const i = py * W + px;
      if (!(GB_F[i] & F_FLOOR)) continue;
      const dx = (FX[i] - a.x) / a.rx, dz = (FZ[i] - a.z) / a.rz, d2 = dx * dx + dz * dz;
      if (d2 < 1) { const k2 = 1 - a.k * (1 - d2) * (1 - d2); const j = i * 3; GB_A[j] *= k2; GB_A[j + 1] *= k2; GB_A[j + 2] *= k2; }
    }
  }
  /* 9. Длинные тени камней на рассвете */
  if (sl) {
    for (const r of FLOOR.rocksShadow) {
      const len = r.r * 1.2 / sl.tan;
      const ex = -sl.lx * len, ez = -sl.lz * len;
      const bb = floorBox(Math.min(r.x, r.x + ex) - r.r, Math.min(r.z, r.z + ez) - r.r, Math.max(r.x, r.x + ex) + r.r, Math.max(r.z, r.z + ez) + r.r);
      if (!bb) continue;
      for (let py = bb[1]; py <= bb[3]; py++) for (let px = bb[0]; px <= bb[2]; px++) {
        const i = py * W + px;
        if (!(GB_F[i] & F_FLOOR)) continue;
        const dx = FX[i] - r.x, dz = FZ[i] - r.z;
        const along = -(dx * sl.lx + dz * sl.lz), perp = dx * -sl.lz + dz * sl.lx;
        if (along > -r.r * 0.3 && along < len && Math.abs(perp) < r.r * 0.9 * (1 - along / len * 0.5)) GB_O[i] = 251;
      }
    }
  }
  /* 10. Нормализация нормалей пола */
  for (let i = yStart * W; i < NPX; i++) {
    if (!(GB_F[i] & F_FLOOR)) continue;
    const j = i * 3;
    const nx = GB_N[j], ny = GB_N[j + 1], nz = GB_N[j + 2];
    const L = hyp3(nx, ny, nz) || 1;
    GB_N[j] = nx / L; GB_N[j + 1] = ny / L; GB_N[j + 2] = nz / L;
    const a = GB_A[j];
    if (a > 1) { GB_A[j] = 1; }
  }
}
