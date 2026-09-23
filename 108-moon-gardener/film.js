'use strict';
/* ==========================================================================
   Садовник на Луне · время фильма
   Треки ключевых кадров, сцены, метеорный поток, частицы. Всё — функции
   от t: кадр однозначно определяется временем, поэтому работает перемотка.
   ========================================================================== */

const DURATION = 108;
const SCENES = [
  { t: 0, name: 'Земля' },
  { t: 12, name: 'Садовник' },
  { t: 38, name: 'Звездопад' },
  { t: 54, name: 'Щит' },
  { t: 70, name: 'Тишина' },
  { t: 88, name: 'Рассвет' },
];
const G_MOON = 1.62; // ускорение свободного падения на Луне, м/с²

/* ---------- Easing ---------- */
const EASE = {
  l: (t) => t,
  io: (t) => 0.5 - 0.5 * Math.cos(Math.PI * t),
  i: (t) => t * t * t,
  o: (t) => 1 - (1 - t) * (1 - t) * (1 - t),
  i2: (t) => t * t,
  o2: (t) => 1 - (1 - t) * (1 - t),
  b: (t) => { const c1 = 2.2, c3 = c1 + 1, u = t - 1; return 1 + c3 * u * u * u + c1 * u * u; },       // захлёст
  bi: (t) => { const c1 = 1.8, c3 = c1 + 1; return c3 * t * t * t - c1 * t * t; },                      // упреждение внутри
  e: (t) => (t === 0 || t === 1 ? t : Math.pow(2, -9 * t) * Math.sin((t * 8 - 0.75) * (TAU / 3)) + 1), // упругость
  s: (t) => (t < 1 ? 0 : 1),
};

/* ---------- Трек: список ключей [t, v, ease] ---------- */
class Track {
  constructor(v0) { this.k = [[-1e9, v0, 'l']]; this.dirty = false; }
  add(t, v, e) { this.k.push([t, v, e || 'io']); this.dirty = true; return this; }
  sort() { if (this.dirty) { this.k.sort((a, b) => a[0] - b[0]); this.dirty = false; } }
  at(t) {
    const k = this.k;
    if (this.dirty) this.sort();
    let lo = 0, hi = k.length - 1;
    if (t >= k[hi][0]) return k[hi][1];
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (k[m][0] <= t) lo = m; else hi = m; }
    const a = k[lo], b = k[hi];
    const u = (t - a[0]) / (b[0] - a[0] || 1e-9);
    return a[1] + (b[1] - a[1]) * EASE[b[2]](clamp(u, 0, 1));
  }
}
function tracks(defaults) {
  const o = {};
  for (const n in defaults) o[n] = new Track(defaults[n]);
  return o;
}

/* ---------- Окружение: шторм, рассвет, вспышки ---------- */
const ENV = tracks({ storm: 0, dawn: 0, sunEl: -0.07, term: 60, zodi: 0, flash: 0, fade: 0, ringing: 0 });

/* ---------- Метеорный поток ----------
   Все метеоры потока летят параллельно, поэтому в перспективе их следы
   расходятся из одной точки неба — радианта. Каждый метеор задан точкой
   удара E, скоростью v и временем удара: P(t) = E + R̂·v·(tHit − t). */
const RADIANT = (() => { const az = -0.75, el = 0.62; return [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)]; })();
const METEORS = [];
const IMPACTS = [];     // {x, y, z, t, size, near}
const PARTICLES = [];   // {x, y, z, vx, vy, vz, t0, life, hot, size}
function addMeteor(tHit, x, z, v, fly, size, opts) {
  opts = opts || {};
  const y = opts.y || 0;
  const m = { tHit, x, y, z, v, fly, size, big: !!opts.big, silent: !!opts.silent, tag: opts.tag || '' };
  METEORS.push(m);
  if (opts.noImpact) return m;
  const near = hyp(x, z) < 40;
  IMPACTS.push({ x, y, z, t: tHit, size, near, big: m.big, tag: m.tag });
  // выбросы: баллистика при лунной тяжести, без облаков — в вакууме пыль летит чистыми дугами
  const R = mulberry(Math.floor(tHit * 1000) + Math.floor(x * 37 + z * 11));
  const n = m.big ? 160 : near ? Math.round(24 + size * 40) : Math.round(10 + size * 12);
  const sp = near ? (m.big ? 5.5 : 1.6 + size * 2.2) : 6 + hyp(x, z) * 0.012;
  for (let k = 0; k < n; k++) {
    const a = R() * TAU, up = 0.35 + R() * 0.9;
    const s = sp * (0.35 + R() * 0.8);
    PARTICLES.push({
      x, y: y + 0.02, z, vx: Math.cos(a) * s * Math.cos(up) + RADIANT[0] * -s * 0.3, vy: Math.sin(up) * s, vz: Math.sin(a) * s * Math.cos(up),
      t0: tHit, life: 2 * Math.sin(up) * s / G_MOON, hot: R() < (m.big ? 0.4 : 0.25) ? 1 : 0, size: near ? (R() < 0.25 ? 2 : 1) : 1, rock: R() < 0.3,
    });
  }
  if (near && size > 0.2) FLOOR.fresh.push({ x, z, r: m.big ? 0.75 : 0.12 + size * 0.28, t: tHit, hot: m.big ? 1.6 : 0.8 + size });
  return m;
}
function meteorPos(m, t, out) {
  const d = m.v * (m.tHit - t);
  out[0] = m.x + RADIANT[0] * d; out[1] = m.y + RADIANT[1] * d; out[2] = m.z + RADIANT[2] * d;
  return out;
}

/* Расписание потока: редкие одиночки, потом ливень, потом стихает */
function buildMeteors() {
  const R = mulberry(4242);
  // первый робкий метеор над Землёй
  addMeteor(37.4, 900, 2600, 900, 1.2, 0.4, { silent: false, tag: 'first' });
  addMeteor(39.3, 700, 1800, 800, 1.0, 0.35);
  addMeteor(40.1, -300, 2200, 900, 0.9, 0.35);
  addMeteor(40.6, 500, 1500, 700, 1.0, 0.4);
  // основной ливень
  let t = 41;
  while (t < 69.2) {
    const k = ENV.storm.at(t);
    const gap = 0.42 / (0.3 + 3 * k);
    t += gap * (0.4 + R() * 1.2);
    if (t > 69.2) break;
    const far = R();
    let z, x, size;
    if (far < 0.55) { z = 300 + R() * 2600; x = (R() - 0.35) * z * 1.2; size = 0.3 + R() * 0.5; }
    else if (far < 0.85) { z = 25 + R() * 250; x = (R() - 0.4) * z * 1.3; size = 0.25 + R() * 0.6; }
    else { z = 3 + R() * 22; x = (R() - 0.45) * 26; size = 0.2 + R() * 0.5; }
    // не бить прямо в грядку и робота (для этого есть поставленные удары)
    if (hyp(x, z) < 2.5) continue;
    addMeteor(Math.round(t * 8) / 8, x, z, z > 200 ? 60 + z * 0.9 : 30 + z * 0.5, 0.5 + R() * 0.8, size);
  }
  // поставленные удары рядом с героем
  addMeteor(47.6, -1.2, 3.2, 26, 0.7, 0.55, { tag: 'behind-run' });
  addMeteor(48.5, -3.6, 5.5, 26, 0.7, 0.5);
  addMeteor(58.2, -2.4, 1.6, 26, 0.6, 0.6, { tag: 'behind-back' });
  addMeteor(60.4, 1.3, 2.2, 26, 0.6, 0.5);
  addMeteor(62.3, -1.0, -0.4, 26, 0.6, 0.45);
  addMeteor(63.25, -0.25, 0.0, 22, 0.55, 0.12, { tag: 'hit1', y: 0.25 });
  addMeteor(64.625, -0.1, 0.0, 22, 0.55, 0.1, { tag: 'hit2', y: 0.31 });
  addMeteor(65.4, 2.2, 3.5, 26, 0.6, 0.5);
  addMeteor(67.0, -2.0, 2.4, 26, 0.6, 0.5);
  // большой — осколок кометы: ложится в двух метрах от грядки
  addMeteor(70.0, 1.6, 1.5, 40, 1.6, 1.0, { big: true, tag: 'big' });
  // последний тихий метеор в финале
  addMeteor(104.2, 1400, 3000, 1000, 1.4, 0.35, { noImpact: true, tag: 'last' });
}

/* ---------- Частицы, пыль, искры, капли ---------- */
const DROPS = [];   // капли воды {t0, x, y, z, vx, vy}
const SPARKS = [];  // искры от удара о робота
function particleAt(p, t, out) {
  const dt = t - p.t0;
  if (dt < 0 || dt > p.life) return false;
  out[0] = p.x + p.vx * dt; out[1] = p.y + p.vy * dt - 0.5 * G_MOON * dt * dt; out[2] = p.z + p.vz * dt;
  return out[1] >= -0.01;
}
