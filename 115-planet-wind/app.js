'use strict';
/* 115 · Ветер планеты — живой ветер Земли по данным Open-Meteo.

   Как устроено:
   1. Один POST-запрос к Open-Meteo: 514 точек почти равномерной «редуцированной» сетки (≈1000 км),
      ветер на четырёх высотах, температура и давление у земли, 49 часов прогноза.
   2. Ветер переводится в трёхмерные векторы и интерполируется бикубически (Катмулл — Ром)
      на сетку 1° × 1°. Через полюс — отражением рядов, поэтому у полюсов нет разрыва.
   3. Около 21 тысячи частиц живут на видеокарте (WebGL2): шаг по сфере, хвост — кольцевая
      история положений в географических координатах, поэтому след не рвётся при повороте,
      масштабе и смене проекции.
   4. Изобары — «марширующие квадраты» по полю давления, центры циклонов — локальные минимумы.
   5. Без сети — иллюстративная модель общей циркуляции с циклонами, антициклонами и струйными
      течениями; она подписана как иллюстративная. */

(() => {

// ───────────────────────── 1. Константы и состояние ─────────────────────────

const SHOT = !!window.__SHOT__;
if (SHOT) document.documentElement.classList.add('shot');   // без CSS-переходов: кадры программного рендера редки
const DEMO = location.hash === '#demo';                    // иллюстративная модель без запросов к сети
const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
const R_EARTH = 6371000;
const GW = 360, GH = 181;          // сетка поля: 1° по долготе и широте
const HOURS = 49;                  // текущий час + 48 часов прогноза
const API = 'https://api.open-meteo.com/v1/forecast';
const PLAY_RATE = 3;               // часов прогноза в секунду при воспроизведении

const LEVELS = [
  { glow: 1.0, km: '10 м', note: 'у земли, 10 м над поверхностью', sv: 'wind_speed_10m', dv: 'wind_direction_10m', tv: 'temperature_2m', vmax: 24, dt: 1.0 },
  { glow: 0.72, km: '1,5 км', note: '850 гПа · над пограничным слоем', sv: 'wind_speed_850hPa', dv: 'wind_direction_850hPa', tv: 'temperature_850hPa', vmax: 40, dt: 0.74 },
  { glow: 0.58, km: '5,6 км', note: '500 гПа · середина тропосферы', sv: 'wind_speed_500hPa', dv: 'wind_direction_500hPa', tv: 'temperature_500hPa', vmax: 60, dt: 0.55 },
  { glow: 0.48, km: '10,4 км', note: '250 гПа · струйные течения', sv: 'wind_speed_250hPa', dv: 'wind_direction_250hPa', tv: 'temperature_250hPa', vmax: 80, dt: 0.42 },
];
const GRID_VARS = [...LEVELS.flatMap((l) => [l.sv, l.dv]), 'temperature_2m', 'pressure_msl'];
const POINT_VARS = ['temperature_2m', 'weather_code', 'pressure_msl', 'wind_gusts_10m',
  ...LEVELS.flatMap((l) => [l.sv, l.dv]), 'temperature_850hPa', 'temperature_500hPa', 'temperature_250hPa'];

// Цвет нитей по скорости: от сумеречной бирюзы через лёд к песку, кораллу и малиновому ядру струи
const SPEED_RAMP = [
  [0.00, '#1f4a63'], [0.10, '#2d7494'], [0.24, '#54aecb'], [0.40, '#a4e0ea'],
  [0.56, '#f3d596'], [0.70, '#f3a765'], [0.85, '#ea6962'], [1.00, '#d4479b'],
];
// Температура у земли: −40…+40 °C
const TEMP_RAMP = [
  [0.00, '#27457e'], [0.22, '#3874b6'], [0.40, '#77b7cf'], [0.50, '#cfe0d8'],
  [0.60, '#eed28c'], [0.72, '#ec9b5a'], [0.86, '#d45146'], [1.00, '#8c2748'],
];

const state = {
  level: 0,
  hour: 0, hourNow: 0, follow: true,
  playing: false,
  isobars: true, temp: false, night: true,
  source: 'none',          // 'live' | 'synth'
  status: 'loading',
  fetchedAt: 0,
};

// ───────────────────────── 2. Утилиты ─────────────────────────

const $ = (id) => document.getElementById(id);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const wrapPi = (a) => a - TAU * Math.floor((a + Math.PI) / TAU);
const wrap180 = (x) => ((((x + 180) % 360) + 360) % 360) - 180;
const mod = (a, n) => ((a % n) + n) % n;
const NB = ' ';

// Кубический сплайн Катмулла — Рома
function cr(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (3 * (p1 - p2) + p3 - p0) * t3);
}

function hexRgb(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
function rampAt(stops, t) {
  t = clamp(t, 0, 1);
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const a = stops[i - 1], b = stops[i], k = (t - a[0]) / (b[0] - a[0] || 1);
      const ca = hexRgb(a[1]), cb = hexRgb(b[1]);
      return [lerp(ca[0], cb[0], k), lerp(ca[1], cb[1], k), lerp(ca[2], cb[2], k)];
    }
  }
  return hexRgb(stops[stops.length - 1][1]);
}
function rampBytes(stops, n = 256) {
  const out = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const c = rampAt(stops, i / (n - 1));
    out[i * 4] = c[0]; out[i * 4 + 1] = c[1]; out[i * 4 + 2] = c[2]; out[i * 4 + 3] = 255;
  }
  return out;
}
const rampCss = (stops) => `linear-gradient(90deg, ${stops.map(([t, c]) => `${c} ${(t * 100).toFixed(1)}%`).join(', ')})`;

// Числа по-русски: десятичная запятая, настоящий минус
function num(x, d = 1) {
  const s = Math.abs(x).toFixed(d).replace('.', ',');
  const zero = Number(Math.abs(x).toFixed(d)) === 0;
  return (x < 0 && !zero ? '−' : '') + s;
}
function signed(x, d = 1) {
  const zero = Number(Math.abs(x).toFixed(d)) === 0;
  return (zero ? '' : x > 0 ? '+' : '−') + Math.abs(x).toFixed(d).replace('.', ',');
}
function coordText(lam, phi) {
  const la = `${num(Math.abs(phi), 2)}°${NB}${phi >= 0 ? 'с.' : 'ю.'}${NB}ш.`;
  const lo = `${num(Math.abs(lam), 2)}°${NB}${lam >= 0 ? 'в.' : 'з.'}${NB}д.`;
  return `${la} · ${lo}`;
}
const FROM = ['с севера', 'с северо-востока', 'с востока', 'с юго-востока', 'с юга', 'с юго-запада', 'с запада', 'с северо-запада'];
const WMO = {
  0: 'ясно', 1: 'почти ясно', 2: 'переменная облачность', 3: 'пасмурно', 45: 'туман', 48: 'туман с изморозью',
  51: 'слабая морось', 53: 'морось', 55: 'сильная морось', 56: 'переохлаждённая морось', 57: 'переохлаждённая морось',
  61: 'слабый дождь', 63: 'дождь', 65: 'сильный дождь', 66: 'ледяной дождь', 67: 'ледяной дождь',
  71: 'слабый снег', 73: 'снег', 75: 'сильный снег', 77: 'снежные зёрна',
  80: 'слабый ливень', 81: 'ливень', 82: 'сильный ливень', 85: 'ливневый снег', 86: 'сильный ливневый снег',
  95: 'гроза', 96: 'гроза с градом', 99: 'гроза с градом',
};

const fmtClock = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });
const fmtFull = new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const fmtDay = new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric' });
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
function plural(n, forms) {
  const a = n % 100, b = n % 10;
  return forms[a > 10 && a < 20 ? 2 : b === 1 ? 0 : b >= 2 && b <= 4 ? 1 : 2];
}

// ───────────────────────── 3. Суша ─────────────────────────

// Разбор упакованных колец из land.js → [{hole, pts: Float32Array [lon, lat, …]}] в градусах
function decodeLand(str) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const map = new Int8Array(128).fill(-1);
  for (let i = 0; i < 64; i++) map[A.charCodeAt(i)] = i;
  const rings = [];
  let pos = 0;
  const n = str.length;
  const readV = () => {
    let v = 0, mul = 1, d;
    do { d = map[str.charCodeAt(pos++)]; v += (d & 31) * mul; mul *= 32; } while (d & 32);
    return v & 1 ? -(v + 1) / 2 : v / 2;
  };
  while (pos < n) {
    let hole = false;
    if (str[pos] === '~') { hole = true; pos++; }
    const pts = [];
    let x = 0, y = 0;
    while (pos < n && str[pos] !== '.') { x += readV(); y += readV(); pts.push(x / 50, y / 50); }
    pos++;
    if (pts.length >= 6) rings.push({ hole, pts: new Float32Array(pts) });
  }
  return rings;
}

// Растровая маска суши в равнопромежуточной проекции (для заливки и иллюстративной модели)
const MASK_W = 2048, MASK_H = 1024;
function buildLandMask(rings) {
  const cv = document.createElement('canvas');
  cv.width = MASK_W; cv.height = MASK_H;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.fillStyle = '#fff';
  cx.beginPath();
  for (const r of rings) {
    const p = r.pts, n = p.length / 2;
    const xs = new Float64Array(n), ys = new Float64Array(n);
    let u = p[0], prev = p[0], latSum = 0;
    xs[0] = u; ys[0] = p[1];
    for (let i = 1; i < n; i++) {
      let d = p[2 * i] - prev;
      if (d > 180) d -= 360; else if (d < -180) d += 360;
      u += d; prev = p[2 * i];
      xs[i] = u; ys[i] = p[2 * i + 1]; latSum += ys[i];
    }
    // кольцо, обходящее полюс (Антарктида), замыкаем через полюс
    const encircles = Math.abs(xs[n - 1] - xs[0]) > 180;
    const poleY = latSum / n < 0 ? MASK_H : 0;
    for (const off of [-360, 0, 360]) {
      const X = (lon) => ((lon + off + 180) / 360) * MASK_W;
      const Y = (lat) => ((90 - lat) / 180) * MASK_H;
      cx.moveTo(X(xs[0]), Y(ys[0]));
      for (let i = 1; i < n; i++) cx.lineTo(X(xs[i]), Y(ys[i]));
      if (encircles) { cx.lineTo(X(xs[n - 1]), poleY); cx.lineTo(X(xs[0]), poleY); }
      cx.closePath();
    }
  }
  cx.fill('evenodd');
  const img = cx.getImageData(0, 0, MASK_W, MASK_H).data;
  const mask = new Uint8Array(MASK_W * MASK_H);
  for (let i = 0; i < mask.length; i++) mask[i] = img[i * 4 + 3];
  return mask;
}
function landAt(mask, lamDeg, phiDeg) {
  const x = Math.floor(((wrap180(lamDeg) + 180) / 360) * MASK_W) % MASK_W;
  const y = clamp(Math.floor(((90 - phiDeg) / 180) * MASK_H), 0, MASK_H - 1);
  return mask[y * MASK_W + x] / 255;
}
// Береговая линия как набор отрезков [λ0, φ0, λ1, φ1] в радианах
function coastSegments(rings) {
  let count = 0;
  for (const r of rings) count += r.pts.length / 2 - 1;
  const out = new Float32Array(count * 4);
  let o = 0;
  for (const r of rings) {
    const p = r.pts;
    for (let i = 0; i + 3 < p.length; i += 2) {
      out[o++] = p[i] * DEG; out[o++] = p[i + 1] * DEG; out[o++] = p[i + 2] * DEG; out[o++] = p[i + 3] * DEG;
    }
  }
  return out;
}

// ───────────────────────── 4. Проекции ─────────────────────────
// Три проекции: 0 — Equal Earth (равновеликая), 1 — ортографическая (глобус),
// 2 — полярная стереографическая (северное или южное полушарие до экватора).

const EA1 = 1.340264, EA2 = -0.081106, EA3 = 0.000893, EA4 = 0.003796, EM = Math.sqrt(3) / 2;
const EE_XMAX = Math.PI / (EM * EA1);
const EE_YMAX = 1.3173627;
const POLAR_MIN = 0;                            // край полярной карты — экватор
const POLAR_RHO = 2 * Math.tan(Math.PI / 4 - POLAR_MIN / 2);

function fwd(p, lam, phi, v) {
  if (p === 0) {
    const l = wrapPi(lam - v.lam0);
    const t = Math.asin(EM * Math.sin(phi)), t2 = t * t, t6 = t2 * t2 * t2;
    const d = EA1 + 3 * EA2 * t2 + t6 * (7 * EA3 + 9 * EA4 * t2);
    return [(l * Math.cos(t)) / (EM * d), t * (EA1 + EA2 * t2 + t6 * (EA3 + EA4 * t2)), 1];
  }
  if (p === 1) {
    const dl = lam - v.lam0, cp = Math.cos(phi), sp = Math.sin(phi), c0 = Math.cos(v.phi0), s0 = Math.sin(v.phi0), cd = Math.cos(dl);
    return [cp * Math.sin(dl), c0 * sp - s0 * cp * cd, s0 * sp + c0 * cp * cd];
  }
  const h = v.hemi, ph = Math.max(h * phi, -1.2), rho = 2 * Math.tan(Math.PI / 4 - ph / 2), dl = lam - v.lam0;
  return [rho * Math.sin(dl), -h * rho * Math.cos(dl), ph - POLAR_MIN];
}
function inv(p, x, y, v) {
  if (p === 0) {
    if (Math.abs(y) > EE_YMAX) return null;
    let t = y / EA1;
    for (let i = 0; i < 6; i++) {
      const t2 = t * t, t6 = t2 * t2 * t2;
      const f = t * (EA1 + EA2 * t2 + t6 * (EA3 + EA4 * t2)) - y;
      const d = EA1 + 3 * EA2 * t2 + t6 * (7 * EA3 + 9 * EA4 * t2);
      t -= f / d;
    }
    const t2 = t * t, t6 = t2 * t2 * t2;
    const d = EA1 + 3 * EA2 * t2 + t6 * (7 * EA3 + 9 * EA4 * t2);
    const l = (EM * x * d) / Math.cos(t);
    if (Math.abs(l) > Math.PI) return null;
    return [wrapPi(l + v.lam0), Math.asin(clamp(Math.sin(t) / EM, -1, 1))];
  }
  if (p === 1) {
    const rho = Math.hypot(x, y);
    if (rho >= 1) return null;
    if (rho < 1e-9) return [v.lam0, v.phi0];
    const c = Math.asin(rho), sc = Math.sin(c), cc = Math.cos(c), s0 = Math.sin(v.phi0), c0 = Math.cos(v.phi0);
    const phi = Math.asin(clamp(cc * s0 + (y * sc * c0) / rho, -1, 1));
    return [wrapPi(v.lam0 + Math.atan2(x * sc, rho * cc * c0 - y * sc * s0)), phi];
  }
  const rho = Math.hypot(x, y);
  if (rho >= POLAR_RHO) return null;
  const ph = Math.PI / 2 - 2 * Math.atan(rho / 2);
  const lam = rho < 1e-9 ? v.lam0 : v.lam0 + Math.atan2(x, -v.hemi * y);
  return [wrapPi(lam), v.hemi * ph];
}

// Вид: проекция, поворот, масштаб, сдвиг (CSS-пиксели)
const view = { p: 0, lam0: 11 * DEG, phi0: 24 * DEG, hemi: 1, k: 1, tx: 0, ty: 0, s: 1, cx: 0, cy: 0 };
let viewFrom = null;                        // вид, из которого идёт перетекание проекций
const morph = { t0: 0, dur: 1400, m: 0 };
let viewVersion = 0;

function isMobile() { return innerWidth <= 720; }
function frameBox() {
  const W = innerWidth, H = innerHeight;
  const ins = isMobile() ? { l: 6, r: 6, t: 92, b: 254 } : W <= 1180 ? { l: 24, r: 24, t: 170, b: 180 } : { l: 26, r: 26, t: 120, b: 100 };
  const w = Math.max(120, W - ins.l - ins.r), h = Math.max(120, H - ins.t - ins.b);
  return { w, h, cx: ins.l + w / 2, cy: ins.t + h / 2 };
}
function baseScale(p, b) {
  if (p === 0) return Math.min(b.w / (2 * EE_XMAX), b.h / (2 * EE_YMAX));
  if (p === 1) return (Math.min(b.w, b.h) / 2) * (isMobile() ? 0.985 : 0.95);
  return (Math.min(b.w, b.h) / 2 / POLAR_RHO) * 0.97;
}
function derive(v) {
  const b = frameBox();
  v.s = baseScale(v.p, b) * v.k;
  v.cx = b.cx + v.tx;
  v.cy = b.cy + v.ty;
  return v;
}
function screenOf(lam, phi, v) {
  const q = fwd(v.p, lam, phi, v);
  return [v.cx + q[0] * v.s, v.cy - q[1] * v.s, q[2]];
}
// Положение на экране с учётом перетекания проекций
function screenNow(lam, phi) {
  const b = screenOf(lam, phi, view);
  if (!viewFrom) return b;
  const a = screenOf(lam, phi, viewFrom), m = morph.m;
  return [lerp(a[0], b[0], m), lerp(a[1], b[1], m), lerp(a[2], b[2], m)];
}
function geoOf(x, y) {
  const v = viewFrom && morph.m < 0.5 ? viewFrom : view;
  return inv(v.p, (x - v.cx) / v.s, -(y - v.cy) / v.s, v);
}
function visibleOk(p, vis) { return p === 0 ? true : vis > 0.02; }

// ───────────────────────── 5. Сетка Open-Meteo и загрузка ─────────────────────────
// Редуцированная сетка: 20 рядов через 9°, в ряду ≈ 40·cos φ точек, соседние ряды сдвинуты
// на полшага. Всего 514 точек — меньше минутного лимита бесплатного API (600 вызовов).

const RG = (() => {
  const rows = [], lat = [], lon = [];
  for (let k = 0; k < 20; k++) {
    const phi = -85.5 + 9 * k;
    const n = Math.max(6, Math.round(40 * Math.cos(phi * DEG)));
    const off = k % 2 ? 0.5 : 0;
    rows.push({ phi, n, off, start: lat.length });
    for (let j = 0; j < n; j++) {
      lat.push(phi);
      lon.push(Math.round((-180 + (360 * (j + off)) / n) * 100) / 100);
    }
  }
  return { rows, lat, lon, count: lat.length, NR: rows.length };
})();

let live = null;   // { times, H, data: { переменная: Float32Array(точки × часы) } }

async function requestGrid(signal) {
  const body = new URLSearchParams({
    latitude: RG.lat.join(','),
    longitude: RG.lon.join(','),
    hourly: GRID_VARS.join(','),
    wind_speed_unit: 'ms',
    forecast_hours: String(HOURS),
    cell_selection: 'nearest',
    timeformat: 'unixtime',
  });
  const res = await fetch(API, { method: 'POST', body, signal });
  if (!res.ok) { const e = new Error('HTTP ' + res.status); e.status = res.status; throw e; }
  return res.json();
}

// Кеш последнего ответа в IndexedDB на 30 минут: перезагрузка страницы не тратит лимит API.
// Хранилище необязательно — любые ошибки просто означают «кеша нет».
const CACHE_MS = 30 * 60 * 1000;
function openCache() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('planet-wind-082', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('grid');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function cacheGet() {
  try {
    const db = await openCache();
    const val = await new Promise((resolve) => {
      const r = db.transaction('grid', 'readonly').objectStore('grid').get('last');
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => resolve(null);
    });
    db.close();
    return val;
  } catch (e) { return null; }
}
async function cachePut(val) {
  try {
    const db = await openCache();
    const tx = db.transaction('grid', 'readwrite');
    tx.objectStore('grid').put(val, 'last');
    tx.oncomplete = () => db.close();
  } catch (e) { /* без кеша */ }
}
const withTimeout = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), ms))]);

function parseGrid(json) {
  const arr = Array.isArray(json) ? json : [json];
  if (arr.length !== RG.count || !arr[0].hourly) throw new Error('Неожиданный ответ');
  const times = arr[0].hourly.time.slice(0, HOURS);
  const H = times.length;
  const data = {};
  for (const name of GRID_VARS) {
    const a = new Float32Array(RG.count * H);
    for (let p = 0; p < RG.count; p++) {
      const src = arr[p].hourly[name] || [];
      for (let h = 0; h < H; h++) { const x = src[h]; a[p * H + h] = x == null ? NaN : x; }
    }
    data[name] = a;
  }
  // пропуски: ветер считаем штилем, давление и температуру берём у соседней точки
  for (const name of GRID_VARS) {
    const a = data[name], wind = name.startsWith('wind');
    for (let i = 0; i < a.length; i++) {
      if (!Number.isNaN(a[i])) continue;
      const near = [a[i - H], a[i + H]].find(Number.isFinite);
      a[i] = wind ? 0 : near ?? (name === 'pressure_msl' ? 1013 : 10);
    }
  }
  return { times, H, data };
}

// ───────────────────────── 6. Кадры поля ─────────────────────────
// Кадр = { wind: Float32Array(GW·GH·4) — (Wx, Wy, Wz, |W|) в м/с, scal: (T °C, P гПа) | null }

// Вектор ветра точки сетки p в час h: метеорологическое направление (откуда дует) → 3D
function pointVec(level, h, p, out) {
  const L = LEVELS[level], H = live.H, i = p * H + h;
  const s = live.data[L.sv][i], d = live.data[L.dv][i] * DEG;
  const u = -s * Math.sin(d), v = -s * Math.cos(d);
  const lam = RG.lon[p] * DEG, phi = RG.lat[p] * DEG;
  const sl = Math.sin(lam), cl = Math.cos(lam), sp = Math.sin(phi), cp = Math.cos(phi);
  out[0] = -sl * u - sp * cl * v;
  out[1] = cl * u - sp * sl * v;
  out[2] = cp * v;
  out[3] = live.data.temperature_2m[i];
  out[4] = live.data.pressure_msl[i];
  return out;
}

function liveFrame(level, h) {
  const n = RG.count, NR = RG.NR;
  const ch = [new Float32Array(n), new Float32Array(n), new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  const tmp = new Float32Array(5);
  for (let p = 0; p < n; p++) {
    pointVec(level, h, p, tmp);
    for (let c = 0; c < 5; c++) ch[c][p] = tmp[c];
  }
  const withScal = level === 0;
  const NC = withScal ? 5 : 3;
  // проход по рядам: периодический сплайн вдоль долготы
  const rows = [];
  for (let c = 0; c < NC; c++) rows.push(new Float32Array(NR * GW));
  for (let k = 0; k < NR; k++) {
    const { n: rn, off, start } = RG.rows[k];
    for (let i = 0; i < GW; i++) {
      const x = (i * rn) / GW - off;
      const j0 = Math.floor(x), t = x - j0;
      const a = start + mod(j0 - 1, rn), b = start + mod(j0, rn), c2 = start + mod(j0 + 1, rn), d = start + mod(j0 + 2, rn);
      for (let c = 0; c < NC; c++) { const A = ch[c]; rows[c][k * GW + i] = cr(A[a], A[b], A[c2], A[d], t); }
    }
  }
  // проход по широте; за полюсом ряд продолжается на противоположном меридиане
  const wind = new Float32Array(GW * GH * 4);
  const scal = withScal ? new Float32Array(GW * GH * 2) : null;
  const idx = new Int32Array(4), sh = new Int32Array(4);
  for (let j = 0; j < GH; j++) {
    const phi = (j - 90) * DEG, sp = Math.sin(phi), cp = Math.cos(phi);
    const y = (j - 90 + 85.5) / 9, k0 = Math.floor(y), t = y - k0;
    for (let q = 0; q < 4; q++) {
      let k = k0 - 1 + q, s = 0;
      if (k < 0) { k = -1 - k; s = 180; } else if (k >= NR) { k = 2 * NR - 1 - k; s = 180; }
      idx[q] = k * GW; sh[q] = s;
    }
    for (let i = 0; i < GW; i++) {
      const i0 = (i + sh[0]) % GW, i1 = (i + sh[1]) % GW, i2 = (i + sh[2]) % GW, i3 = (i + sh[3]) % GW;
      const R0 = rows[0], R1 = rows[1], R2 = rows[2];
      let wx = cr(R0[idx[0] + i0], R0[idx[1] + i1], R0[idx[2] + i2], R0[idx[3] + i3], t);
      let wy = cr(R1[idx[0] + i0], R1[idx[1] + i1], R1[idx[2] + i2], R1[idx[3] + i3], t);
      let wz = cr(R2[idx[0] + i0], R2[idx[1] + i1], R2[idx[2] + i2], R2[idx[3] + i3], t);
      // убираем радиальную составляющую: ветер касается сферы
      const lam = (i - 180) * DEG, px = cp * Math.cos(lam), py = cp * Math.sin(lam), pz = sp;
      const rad = wx * px + wy * py + wz * pz;
      wx -= rad * px; wy -= rad * py; wz -= rad * pz;
      const o = (j * GW + i) * 4;
      wind[o] = wx; wind[o + 1] = wy; wind[o + 2] = wz; wind[o + 3] = Math.hypot(wx, wy, wz);
      if (scal) {
        const R3 = rows[3], R4 = rows[4], so = (j * GW + i) * 2;
        scal[so] = cr(R3[idx[0] + i0], R3[idx[1] + i1], R3[idx[2] + i2], R3[idx[3] + i3], t);
        scal[so + 1] = cr(R4[idx[0] + i0], R4[idx[1] + i1], R4[idx[2] + i2], R4[idx[3] + i3], t);
      }
    }
  }
  return { wind, scal };
}

// Значение в произвольной точке прямо по сетке 514 точек (для карточки и графика)
function livePointAt(level, h, lamDeg, phiDeg) {
  const NR = RG.NR, y = (phiDeg + 85.5) / 9, k0 = Math.floor(y), ty = y - k0;
  const acc = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  const tmp = [new Float32Array(5), new Float32Array(5), new Float32Array(5), new Float32Array(5)];
  for (let q = 0; q < 4; q++) {
    let k = k0 - 1 + q, L = lamDeg;
    if (k < 0) { k = -1 - k; L += 180; } else if (k >= NR) { k = 2 * NR - 1 - k; L += 180; }
    const row = RG.rows[k];
    const x = ((wrap180(L) + 180) * row.n) / 360 - row.off, j0 = Math.floor(x), tx = x - j0;
    for (let z = 0; z < 4; z++) pointVec(level, h, row.start + mod(j0 - 1 + z, row.n), tmp[z]);
    for (let c = 0; c < 5; c++) acc[c][q] = cr(tmp[0][c], tmp[1][c], tmp[2][c], tmp[3][c], tx);
  }
  const out = acc.map((a) => cr(a[0], a[1], a[2], a[3], ty));
  return vecToWind(out[0], out[1], out[2], lamDeg, phiDeg, out[3], out[4]);
}

// 3D-вектор → восточная и северная составляющие, скорость, направление «откуда»
function vecToWind(wx, wy, wz, lamDeg, phiDeg, T, P) {
  const lam = lamDeg * DEG, phi = phiDeg * DEG;
  const sl = Math.sin(lam), cl = Math.cos(lam), sp = Math.sin(phi), cp = Math.cos(phi);
  const u = -sl * wx + cl * wy;
  const v = -sp * cl * wx - sp * sl * wy + cp * wz;
  const speed = Math.hypot(u, v);
  const from = mod(Math.atan2(-u, -v) / DEG, 360);
  return { u, v, speed, from, T, P };
}

// ─── Иллюстративная модель общей циркуляции ───
// Зональные пояса (пассаты, западный перенос, полярные восточные ветры), струйные течения
// с волнами Россби, циклоны и антициклоны (вращение по полушарию, приток к центру у земли)
// и мелкий бездивергентный «шум». Не прогноз — пример того, как устроен ветер.

const SYN = (() => {
  let seed = 20260923;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const V = [];
  // kind: 'etc' — внетропический циклон, 'tc' — тропический, 'hi' — антициклон
  const add = (kind, lon, lat, R, Vm, vlon, vlat) => V.push({ kind, lon, lat, R, Vm, vlon, vlat, ph: rnd() * TAU });
  for (const [lon, lat] of [[-38, 57], [-4, 63], [34, 56], [92, 51], [148, 47], [-168, 52], [-96, 61], [60, 66]]) {
    add('etc', lon + (rnd() - 0.5) * 12, lat + (rnd() - 0.5) * 5, 6 + rnd() * 2.5, 7 + rnd() * 4.5, 10 + rnd() * 5, 0.8);
  }
  for (let i = 0; i < 8; i++) add('etc', -180 + i * 45 + rnd() * 24, -50 - rnd() * 12, 6.5 + rnd() * 3, 9 + rnd() * 5.5, 13 + rnd() * 5, -0.6);
  for (const [lon, lat] of [[-36, 34], [-146, 33], [58, 31], [118, 40]]) add('hi', lon, lat, 15 + rnd() * 4, 3.5 + rnd() * 1.5, 2, 0);
  for (const [lon, lat] of [[-12, -29], [78, -32], [-104, -31], [170, -35]]) add('hi', lon, lat, 16 + rnd() * 4, 4 + rnd() * 1.5, 3, 0);
  add('tc', 131, 19, 3.2, 38, -4.5, 1.3);
  add('tc', -57, 21, 3.0, 33, -5.5, 1.1);
  add('tc', -118, 16, 2.6, 27, -5, 0.8);
  const noise = [];
  for (let i = 0; i < 7; i++) {
    const a = rnd() * TAU, b = Math.acos(2 * rnd() - 1), k = 3 + rnd() * 3.5;
    noise.push({ kx: k * Math.sin(b) * Math.cos(a), ky: k * Math.sin(b) * Math.sin(a), kz: k * Math.cos(b), amp: 0.55 / k * (0.7 + rnd() * 0.6), w: (rnd() - 0.5) * 0.08, ph: rnd() * TAU });
  }
  return { V, noise };
})();

// параметры уровней: множители вихрей, наклон к западу с высотой, струйные течения
const SYN_LEVELS = [
  { etc: 0.8, tc: 1.0, hi: 0.9, R: 1.0, inflow: 1.0, tilt: 0, noise: 0.9,
    zon: (a, s) => [-6 * bump(a, 14, 9) + (s > 0 ? 5 : 7.5) * bump(a, s > 0 ? 48 : 50, 11) - 3 * bump(a, 73, 8), -s * 2.6 * bump(a, 14, 8) + s * 1.2 * bump(a, 45, 10)],
    jets: [] },
  { etc: 1.15, tc: 1.05, hi: 0.9, R: 1.1, inflow: 0.35, tilt: -2.5, noise: 1.1,
    zon: (a, s) => [-5.5 * bump(a, 12, 10) + (s > 0 ? 8 : 12) * bump(a, s > 0 ? 47 : 49, 12) - 2 * bump(a, 75, 8), -s * 1.2 * bump(a, 14, 8)],
    jets: [{ lat: 50, amp: 7, m: 5, U: 5 }, { lat: -52, amp: 6, m: 4, U: 7 }] },
  { etc: 0.8, tc: 0.55, hi: 0.55, R: 1.35, inflow: 0, tilt: -6, noise: 1.5,
    zon: (a, s) => [-3 * bump(a, 8, 10) + (s > 0 ? 10 : 13) * bump(a, 42, 14), 0],
    jets: [{ lat: 48, amp: 10, m: 5, U: 22 }, { lat: -50, amp: 8, m: 4, U: 26 }] },
  { etc: 0.6, tc: 0.15, hi: 0.4, R: 1.5, inflow: -0.2, tilt: -9, noise: 1.8,
    zon: (a, s) => [-5 * bump(a, 6, 10) + (s > 0 ? 11 : 14) * bump(a, 40, 16), 0],
    jets: [{ lat: 49, amp: 11, m: 5, U: 46 }, { lat: -51, amp: 9, m: 4, U: 52 }, { lat: 30, amp: 3, m: 3, U: 30 }, { lat: -29, amp: 3, m: 3, U: 38 }] },
];
function bump(x, c, w) { const d = (x - c) / w; return Math.exp(-d * d); }

function synthVortices(level, hour) {
  const L = SYN_LEVELS[level];
  return SYN.V.map((v) => {
    const f = v.kind === 'etc' ? L.etc : v.kind === 'tc' ? L.tc : L.hi;
    const lat = clamp(v.lat + (v.vlat * hour) / 24, -80, 80);
    const lon = v.lon + (v.vlon * hour) / 24 / Math.cos(lat * DEG) * (v.kind === 'etc' ? 0.75 : 1) + (v.kind === 'tc' ? 0 : L.tilt);
    const la = lat * DEG, lo = lon * DEG;
    const R = v.R * (v.kind === 'tc' ? 1 : L.R) * DEG;
    const hemi = lat >= 0 ? 1 : -1;
    const type = v.kind === 'hi' ? -1 : 1;
    const pulse = 0.82 + 0.18 * Math.sin(v.ph + hour * 0.05);
    const Vm = v.Vm * f * pulse;
    return {
      x: Math.cos(la) * Math.cos(lo), y: Math.cos(la) * Math.sin(lo), z: Math.sin(la),
      R, cut: Math.cos(Math.min(Math.PI, R * 2.6)),
      rot: type * hemi * Vm,
      inflow: (type > 0 ? 0.36 : -0.22) * L.inflow * Vm,
      dP: level === 0 ? (type > 0 ? -(v.kind === 'tc' ? 1.5 : 1.25) : 2.4) * v.Vm * pulse : 0,
    };
  });
}

// Иллюстративный ветер в точке (градусы) — общая функция для кадра и карточки
function synthPoint(level, hour, lamDeg, phiDeg, vorts, out) {
  const L = SYN_LEVELS[level];
  const lam = lamDeg * DEG, phi = phiDeg * DEG;
  const sl = Math.sin(lam), cl = Math.cos(lam), sp = Math.sin(phi), cp = Math.cos(phi);
  const px = cp * cl, py = cp * sl, pz = sp;
  const a = Math.abs(phiDeg), s = phiDeg >= 0 ? 1 : -1;
  let [u, v] = L.zon(a, s);
  for (const J of L.jets) {
    const js = J.lat >= 0 ? 1 : -1;
    const arg = J.m * (lam - 0.0045 * hour * js) + J.lat * 0.37;
    const axis = J.lat + J.amp * Math.sin(arg);
    const d = (phiDeg - axis) / 7.5;
    if (Math.abs(d) > 3.5) continue;
    const slope = (J.amp * DEG * J.m * Math.cos(arg)) / Math.max(0.25, cp);
    const streak = 0.72 + 0.28 * Math.cos(2 * J.m * lam - 0.02 * hour + J.lat);
    const U = J.U * Math.exp(-d * d) * streak, nrm = 1 / Math.sqrt(1 + slope * slope);
    u += U * nrm; v += U * slope * nrm;
  }
  // локальный базис: восток e = (−sinλ, cosλ, 0), север n = (−sinφ cosλ, −sinφ sinλ, cosφ)
  let wx = -sl * u - sp * cl * v, wy = cl * u - sp * sl * v, wz = cp * v;
  let P = 1012 + 7 * bump(a, 32, 10) - 3 * bump(a, 0, 7) - (s > 0 ? 6 : 13) * bump(a, 62, 8);
  for (const c of vorts) {
    const d = c.x * px + c.y * py + c.z * pz;
    if (d < c.cut) continue;
    const r = Math.acos(Math.min(1, d)), q = r / c.R;
    const Vr = q * Math.exp(0.5 * (1 - q * q));
    let tx = c.y * pz - c.z * py, ty = c.z * px - c.x * pz, tz = c.x * py - c.y * px;
    let ix = c.x - d * px, iy = c.y - d * py, iz = c.z - d * pz;
    const tl = Math.hypot(tx, ty, tz) || 1, il = Math.hypot(ix, iy, iz) || 1;
    const kr = (c.rot * Vr) / tl, ki = (c.inflow * Vr) / il;
    wx += kr * tx + ki * ix; wy += kr * ty + ki * iy; wz += kr * tz + ki * iz;
    P += c.dP * Math.exp(-0.5 * q * q);
  }
  // бездивергентная добавка: v = p × ∇ψ
  let gx = 0, gy = 0, gz = 0;
  for (const nz of SYN.noise) {
    const c = nz.amp * Math.cos(nz.kx * px + nz.ky * py + nz.kz * pz + nz.w * hour + nz.ph) * 4.2 * L.noise;
    gx += c * nz.kx; gy += c * nz.ky; gz += c * nz.kz;
  }
  wx += py * gz - pz * gy; wy += pz * gx - px * gz; wz += px * gy - py * gx;
  out[0] = wx; out[1] = wy; out[2] = wz;
  if (level === 0) {
    const vn = -sp * cl * wx - sp * sl * wy + cp * wz;
    let T = -22 + 50 * Math.pow(Math.max(0, Math.cos((phiDeg - 5) * DEG)), 1.35);
    const land = landMask ? landAt(landMask, lamDeg, phiDeg) : 0;
    if (phiDeg < -62) T -= 22 * land; else if (phiDeg > 25) T += 2 * land; else T += 1.5 * land;
    out[3] = T + 0.3 * vn * s;
    out[4] = P;
  } else { out[3] = 0; out[4] = 1013; }
  return out;
}

function synthFrame(level, hour) {
  const vorts = synthVortices(level, hour);
  const wind = new Float32Array(GW * GH * 4);
  const scal = level === 0 ? new Float32Array(GW * GH * 2) : null;
  const tmp = new Float32Array(5);
  for (let j = 0; j < GH; j++) {
    const phiDeg = j - 90;
    for (let i = 0; i < GW; i++) {
      synthPoint(level, hour, i - 180, phiDeg, vorts, tmp);
      const o = (j * GW + i) * 4;
      wind[o] = tmp[0]; wind[o + 1] = tmp[1]; wind[o + 2] = tmp[2]; wind[o + 3] = Math.hypot(tmp[0], tmp[1], tmp[2]);
      if (scal) { scal[(j * GW + i) * 2] = tmp[3]; scal[(j * GW + i) * 2 + 1] = tmp[4]; }
    }
  }
  return { wind, scal };
}
function synthPointAt(level, hour, lamDeg, phiDeg) {
  const tmp = synthPoint(level, hour, lamDeg, phiDeg, synthVortices(level, hour), new Float32Array(5));
  return vecToWind(tmp[0], tmp[1], tmp[2], lamDeg, phiDeg, tmp[3], tmp[4]);
}

// Кэш кадров по (источник, высота, час)
const frames = new Map();
function getFrame(src, level, h) {
  const key = src + level + ':' + h;
  let f = frames.get(key);
  if (!f) {
    f = src === 'live' ? liveFrame(level, h) : synthFrame(level, h);
    frames.set(key, f);
    if (frames.size > 28) frames.delete(frames.keys().next().value);
  } else { frames.delete(key); frames.set(key, f); }
  return f;
}

// ───────────────────────── 7. Поле на экране: время, высота, переходы ─────────────────────────

const field = {
  wind: new Float32Array(GW * GH * 4),
  scal: new Float32Array(GW * GH * 2),
  scalOk: false,
  from: null,            // снимок поля, из которого идёт плавный переход
  t0: 0, dur: 900,
  vmax: LEVELS[0].vmax, vmaxFrom: LEVELS[0].vmax,
  dtScale: 1, dtFrom: 1,
  glow: 1, glowFrom: 1,
  key: '',
  ready: false,
  gpuDirty: false,
  scalVersion: 0,
};

function maxHour() { return state.source === 'live' && live ? live.H - 1 : HOURS - 1; }

// Смена источника или высоты: запоминаем текущее поле и плавно перетекаем в новое
function beginFieldTransition(dur = 900) {
  if (!field.ready || SHOT) return;
  field.from = { wind: field.wind.slice(), scal: field.scalOk ? field.scal.slice() : null };
  field.t0 = performance.now();
  field.dur = dur;
  field.vmaxFrom = field.vmax;
  field.dtFrom = field.dtScale;
  field.glowFrom = field.glow;
}

function updateField(now) {
  if (state.source === 'none') return;
  const src = state.source, level = state.level;
  const hMax = maxHour();
  const hf = clamp(state.hour, 0, hMax);
  const h0 = Math.floor(hf), h1 = Math.min(hMax, h0 + 1), t = hf - h0;
  const p = field.from ? clamp((now - field.t0) / field.dur, 0, 1) : 1;
  const key = `${src}|${level}|${hf.toFixed(3)}|${p.toFixed(3)}`;
  if (key === field.key) return;
  field.key = key;
  const A = getFrame(src, level, h0), B = getFrame(src, level, h1);
  const e = easeInOut(p);
  const W = field.wind, aw = A.wind, bw = B.wind;
  const fw = field.from ? field.from.wind : null;
  for (let i = 0; i < W.length; i++) {
    let x = aw[i] + (bw[i] - aw[i]) * t;
    if (fw) x = fw[i] + (x - fw[i]) * e;
    W[i] = x;
  }
  if (A.scal) {
    const S = field.scal, as = A.scal, bs = B.scal;
    for (let i = 0; i < S.length; i++) S[i] = as[i] + (bs[i] - as[i]) * t;
    field.scalOk = true;
    field.scalVersion++;
  } else field.scalOk = false;
  const L = LEVELS[level];
  field.vmax = lerp(field.vmaxFrom, L.vmax, e);
  field.dtScale = lerp(field.dtFrom, L.dt, e);
  field.glow = lerp(field.glowFrom, L.glow, e);
  if (field.from && p >= 1) field.from = null;
  field.gpuDirty = true;
}

// ───────────────────────── 8. WebGL: шейдеры и ресурсы ─────────────────────────

const canvas = $('scene');
const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: 'high-performance' });
const glOk = !!gl && !!gl.getExtension('EXT_color_buffer_float');

const GLSL_COMMON = `
#define PI 3.141592653589793
#define TAU 6.283185307179586
precision highp float;
precision highp int;
precision highp sampler2D;
uniform int uProjA;
uniform int uProjB;
uniform float uMorph;
uniform vec4 uViewA;
uniform vec4 uViewB;
uniform vec2 uCenterA;
uniform vec2 uCenterB;
uniform int uProjI;
uniform vec4 uViewI;
uniform vec2 uCenterI;
uniform vec2 uRes;
uniform float uPolarMin;
const float EA1 = 1.340264;
const float EA2 = -0.081106;
const float EA3 = 0.000893;
const float EA4 = 0.003796;
const float EM = 0.8660254037844386;
const float EE_YMAX = 1.3173627;

float wrapPi(float a) { return a - TAU * floor((a + PI) / TAU); }
vec3 unitVec(vec2 ll) { float c = cos(ll.y); return vec3(c * cos(ll.x), c * sin(ll.x), sin(ll.y)); }

vec3 fwdEE(vec2 ll, vec4 v) {
  float l = wrapPi(ll.x - v.x);
  float t = asin(EM * sin(ll.y));
  float t2 = t * t;
  float t6 = t2 * t2 * t2;
  float d = EA1 + 3.0 * EA2 * t2 + t6 * (7.0 * EA3 + 9.0 * EA4 * t2);
  return vec3(l * cos(t) / (EM * d), t * (EA1 + EA2 * t2 + t6 * (EA3 + EA4 * t2)), 1.0);
}
vec3 fwdOrtho(vec2 ll, vec4 v) {
  float dl = ll.x - v.x;
  float cp = cos(ll.y), sp = sin(ll.y), c0 = cos(v.y), s0 = sin(v.y), cd = cos(dl);
  return vec3(cp * sin(dl), c0 * sp - s0 * cp * cd, s0 * sp + c0 * cp * cd);
}
vec3 fwdPolar(vec2 ll, vec4 v) {
  float h = v.w;
  float ph = max(h * ll.y, -1.2);
  float rho = 2.0 * tan(PI * 0.25 - ph * 0.5);
  float dl = ll.x - v.x;
  return vec3(rho * sin(dl), -h * rho * cos(dl), ph - uPolarMin);
}
vec3 fwdAny(int p, vec2 ll, vec4 v) {
  if (p == 0) return fwdEE(ll, v);
  if (p == 1) return fwdOrtho(ll, v);
  return fwdPolar(ll, v);
}
// отрезок пересекает шов карты Equal Earth (в исходной или целевой проекции)
bool eeWrap(vec2 a, vec2 b, float lam0) { return abs(wrapPi(a.x - lam0) - wrapPi(b.x - lam0)) > PI; }
bool segWraps(vec2 a, vec2 b) {
  return (uProjA == 0 && eeWrap(a, b, uViewA.x)) || (uMorph > 0.0 && uProjB == 0 && eeWrap(a, b, uViewB.x));
}
// экранные пиксели устройства (y вниз) и видимость (> 0 — видно)
vec3 project(vec2 ll) {
  vec3 a = fwdAny(uProjA, ll, uViewA);
  vec3 sa = vec3(uCenterA.x + a.x * uViewA.z, uCenterA.y - a.y * uViewA.z, a.z);
  if (uMorph <= 0.0) return sa;
  vec3 b = fwdAny(uProjB, ll, uViewB);
  vec3 sb = vec3(uCenterB.x + b.x * uViewB.z, uCenterB.y - b.y * uViewB.z, b.z);
  return mix(sa, sb, uMorph);
}
// обратная проекция для текущего вида I; edge — расстояние до края карты в единицах проекции
bool unprojectI(vec2 q, out vec2 ll, out float edge) {
  if (uProjI == 0) {
    float y = clamp(q.y, -EE_YMAX, EE_YMAX);
    float t = y / EA1;
    for (int i = 0; i < 5; i++) {
      float t2 = t * t;
      float t6 = t2 * t2 * t2;
      float f = t * (EA1 + EA2 * t2 + t6 * (EA3 + EA4 * t2)) - y;
      float d = EA1 + 3.0 * EA2 * t2 + t6 * (7.0 * EA3 + 9.0 * EA4 * t2);
      t -= f / d;
    }
    float t2 = t * t;
    float t6 = t2 * t2 * t2;
    float d = EA1 + 3.0 * EA2 * t2 + t6 * (7.0 * EA3 + 9.0 * EA4 * t2);
    float ct = max(cos(t), 1e-4);
    float l = EM * q.x * d / ct;
    ll = vec2(wrapPi(l + uViewI.x), asin(clamp(sin(t) / EM, -1.0, 1.0)));
    edge = min((PI - abs(l)) * ct / (EM * d), EE_YMAX - abs(q.y));
    return edge > 0.0;
  }
  if (uProjI == 1) {
    float rho = length(q);
    edge = 1.0 - rho;
    if (rho >= 1.0) { ll = vec2(0.0); return false; }
    if (rho < 1e-6) { ll = uViewI.xy; return true; }
    float c = asin(rho);
    float sc = sin(c), cc = cos(c), s0 = sin(uViewI.y), c0 = cos(uViewI.y);
    float phi = asin(clamp(cc * s0 + q.y * sc * c0 / rho, -1.0, 1.0));
    ll = vec2(wrapPi(uViewI.x + atan(q.x * sc, rho * cc * c0 - q.y * sc * s0)), phi);
    return true;
  }
  float h = uViewI.w;
  float rho = length(q);
  edge = 2.0 * tan(PI * 0.25 - uPolarMin * 0.5) - rho;
  float ph = PI * 0.5 - 2.0 * atan(rho * 0.5);
  float lam = rho < 1e-6 ? uViewI.x : uViewI.x + atan(q.x, -h * q.y);
  ll = vec2(wrapPi(lam), h * ph);
  return edge > 0.0;
}
`;

const GLSL_FIELD = `
uniform highp sampler2D uWind;
// поле 360×181: столбец i — долгота −180° + i, строка j — широта −90° + j; билинейно вручную
vec4 fieldAt(highp sampler2D tex, vec2 ll) {
  float x = (ll.x + PI) * (180.0 / PI);
  float y = clamp((ll.y + 0.5 * PI) * (180.0 / PI), 0.0, 180.0);
  float fx = floor(x), fy = floor(y);
  float tx = x - fx, ty = y - fy;
  int i0 = int(fx);
  if (i0 < 0) i0 += 360;
  if (i0 >= 360) i0 -= 360;
  int i1 = i0 + 1;
  if (i1 >= 360) i1 -= 360;
  int j0 = clamp(int(fy), 0, 180);
  int j1 = min(j0 + 1, 180);
  vec4 a = texelFetch(tex, ivec2(i0, j0), 0);
  vec4 b = texelFetch(tex, ivec2(i1, j0), 0);
  vec4 c = texelFetch(tex, ivec2(i0, j1), 0);
  vec4 d = texelFetch(tex, ivec2(i1, j1), 0);
  return mix(mix(a, b, tx), mix(c, d, tx), ty);
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
`;

const VS_FULL = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

// Подложка карты: обратная проекция каждого пикселя → океан, суша, сетка, ночь, край карты
const FS_BASE = `#version 300 es
${GLSL_COMMON}
${GLSL_FIELD}
uniform sampler2D uLand;
uniform highp sampler2D uScal;
uniform sampler2D uRampSpeed;
uniform sampler2D uRampTemp;
uniform float uTempA;
uniform float uBaseA;
uniform vec3 uSun;
uniform float uNightA;
uniform float uGrat;
uniform float uDpr;
out vec4 o;
const vec3 BG = vec3(0.020, 0.031, 0.047);
const vec3 OCEAN = vec3(0.036, 0.062, 0.090);
const vec3 LAND = vec3(0.084, 0.108, 0.136);
float gline(float v, float stepDeg, float fw) {
  float d = abs(fract(v / stepDeg + 0.5) - 0.5) * stepDeg;
  return 1.0 - smoothstep(0.35 * fw, 1.2 * fw, d);
}
void main() {
  vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 uv = px / uRes;
  vec3 col = BG * (1.0 - 0.35 * dot(uv - 0.5, uv - 0.5));
  vec2 q = (px - uCenterI) / uViewI.z;
  q.y = -q.y;
  vec2 ll;
  float edge;
  bool ok = unprojectI(q, ll, edge);
  float edgePx = edge * uViewI.z;
  if (uProjI == 1 && !ok) {
    // тонкая атмосфера у края глобуса
    float r = length(q);
    float g = exp(-(r - 1.0) * 26.0) * smoothstep(1.0, 1.004, r);
    col += vec3(0.09, 0.16, 0.22) * g * 0.55 * uBaseA;
  }
  if (ok) {
    float m = texture(uLand, vec2(ll.x / TAU + 0.5, 0.5 - ll.y / PI)).r;
    float land = smoothstep(0.28, 0.72, m);
    vec3 c = mix(OCEAN, LAND, land);
    float latN = ll.y / (0.5 * PI);
    c *= 1.0 + 0.10 * latN * latN;
    // температура у земли
    if (uTempA > 0.001) {
      float T = fieldAt(uScal, ll).x;
      vec3 tc = texture(uRampTemp, vec2(clamp((T + 40.0) / 80.0, 0.0, 1.0), 0.5)).rgb;
      c = mix(c, tc * mix(0.62, 0.52, land), uTempA);
    }
    // сетка через uGrat градусов; меридианы гаснут к полюсам
    float lon = degrees(ll.x), lat = degrees(ll.y);
    float lon2 = mod(lon + 360.0, 360.0);
    float fwLon = max(min(fwidth(lon), fwidth(lon2)), 1e-4);
    float fwLat = max(fwidth(lat), 1e-4);
    float g = max(gline(lon, uGrat, fwLon) * (1.0 - smoothstep(66.0, 84.0, abs(lat))), gline(lat, uGrat, fwLat));
    c += vec3(0.62, 0.74, 0.84) * g * 0.05;
    // ночная сторона
    float e = dot(unitVec(ll), uSun);
    float night = 1.0 - smoothstep(-0.10, 0.03, e);
    c *= 1.0 - 0.42 * night * uNightA;
    // глобус: мягкое затемнение к лимбу
    if (uProjI == 1) {
      float cz = sqrt(max(0.0, 1.0 - dot(q, q)));
      c *= mix(0.5, 1.0, pow(cz, 0.55));
    }
    float inside = smoothstep(0.0, 1.2, edgePx);
    col = mix(col, c, inside * uBaseA);
    // контур карты
    float rim = 1.0 - smoothstep(0.0, 1.1 * uDpr, abs(edgePx - 0.6 * uDpr));
    col += vec3(0.42, 0.52, 0.60) * rim * 0.32 * uBaseA;
  }
  o = vec4(col, 1.0);
}`;

// Шаг частиц: адвекция по сфере, возрождение в случайной точке экрана
const FS_UPDATE = `#version 300 es
${GLSL_COMMON}
${GLSL_FIELD}
uniform highp sampler2D uState;
uniform float uDt;
uniform float uSeed;
uniform float uLifeMin;
uniform float uLifeMax;
uniform float uReset;
layout(location = 0) out vec4 oState;
layout(location = 1) out vec4 oHist;
vec2 spawn(vec2 id) {
  for (int k = 0; k < 4; k++) {
    float fk = float(k);
    vec2 r = vec2(hash12(id * 1.13 + vec2(uSeed, fk * 7.1)), hash12(id.yx * 0.97 + vec2(fk * 3.3, uSeed * 1.7)));
    vec2 q = (r * uRes - uCenterI) / uViewI.z;
    q.y = -q.y;
    vec2 ll;
    float edge;
    if (unprojectI(q, ll, edge)) return ll;
  }
  vec2 r = vec2(hash12(id + uSeed * 0.31), hash12(id.yx + uSeed * 0.77));
  return vec2(r.x * TAU - PI, asin(2.0 * r.y - 1.0));
}
void main() {
  vec2 id = gl_FragCoord.xy;
  vec4 s = texelFetch(uState, ivec2(id), 0);
  vec2 ll = s.xy;
  float age = s.z + 1.0;
  float life = s.w;
  bool re = uReset > 0.5 || age > life;
  float spd = 0.0;
  if (!re) {
    vec3 p = unitVec(ll);
    vec4 w4 = fieldAt(uWind, ll);
    vec3 w = w4.xyz;
    spd = w4.w;
    p = normalize(p + w * (uDt / 6371000.0));
    ll = vec2(atan(p.y, p.x), asin(clamp(p.z, -1.0, 1.0)));
    vec3 sc = project(ll);
    if (sc.z < -0.02 || sc.x < -40.0 || sc.y < -40.0 || sc.x > uRes.x + 40.0 || sc.y > uRes.y + 40.0) re = true;
  }
  if (re) {
    ll = spawn(id);
    life = mix(uLifeMin, uLifeMax, hash12(id * 0.71 + vec2(uSeed * 2.3, 1.7)));
    age = 0.0;
  }
  oState = vec4(ll, age, life);
  oHist = vec4(ll, spd, 1.0);
}`;

// Нити: каждая частица — полилиния из её истории, отрезки гаснут к хвосту
const VS_TRAIL = `#version 300 es
${GLSL_COMMON}
precision highp sampler2DArray;
${GLSL_FIELD}
uniform highp sampler2D uState;
uniform highp sampler2DArray uHist;
uniform sampler2D uRamp;
uniform int uHead;
uniform int uNH;
uniform int uPW;
uniform float uPhase;
uniform float uStride;
uniform float uVmax;
uniform float uAlpha;
uniform float uMono;
out vec4 vCol;
void main() {
  // одна частица = 2·uNH вершин подряд; номер частицы и отрезка — из gl_VertexID
  int per = 2 * uNH;
  int id = gl_VertexID / per;
  int v = gl_VertexID - id * per;
  ivec2 tc = ivec2(id % uPW, id / uPW);
  int seg = v >> 1;
  int end = v & 1;
  vec4 st = texelFetch(uState, tc, 0);
  float age = st.z, life = st.w;
  vec4 hNew = texelFetch(uHist, ivec3(tc, seg == 0 ? uHead : (uHead - seg + 1 + uNH) % uNH), 0);
  vec4 hOld = texelFetch(uHist, ivec3(tc, (uHead - seg + uNH) % uNH), 0);
  vec2 pNew = seg == 0 ? st.xy : hNew.xy;
  float agoOld = uPhase + float(seg) * uStride;
  float agoNew = seg == 0 ? 0.0 : uPhase + float(seg - 1) * uStride;
  bool ok = agoOld <= age && agoOld > agoNew && !segWraps(pNew, hOld.xy);
  vec3 me = project(end == 0 ? pNew : hOld.xy);
  float ago = end == 0 ? agoNew : agoOld;
  float f = clamp(1.0 - ago / (float(uNH) * uStride + 1.0), 0.0, 1.0);
  f *= f;
  float lifeA = smoothstep(0.0, 14.0, age) * (1.0 - smoothstep(life - 34.0, life, age));
  float sn = clamp((end == 0 ? hNew.z : hOld.z) / uVmax, 0.0, 1.0);
  vec3 col = mix(texture(uRamp, vec2(sn, 0.5)).rgb, vec3(0.93, 0.96, 0.98), uMono);
  float inten = 0.15 + 0.85 * pow(smoothstep(0.02, 0.62, sn), 1.1);
  float vis = uProjB == 1 ? smoothstep(0.0, 0.45, me.z) * (0.55 + 0.45 * me.z) : smoothstep(0.0, 0.07, me.z);
  float own = 0.55 + 0.45 * fract(sin(float(id) * 12.9898) * 43758.5453);
  float alpha = ok ? f * lifeA * inten * vis * own * uAlpha : 0.0;
  vCol = vec4(col * alpha, alpha);
  gl_Position = ok ? vec4(me.x / uRes.x * 2.0 - 1.0, 1.0 - me.y / uRes.y * 2.0, 0.0, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
}`;
const FS_COLOR = `#version 300 es
precision highp float;
in vec4 vCol;
out vec4 o;
void main() { o = vCol; }`;

// Линии (берега, изобары): каждый отрезок — прямоугольник со сглаженными краями
const VS_LINE = `#version 300 es
${GLSL_COMMON}
uniform highp sampler2D uSegs;
uniform float uWidth;
out float vAcross;
out float vVis;
out float vHalf;
void main() {
  int sid = gl_VertexID / 6;
  int vid = gl_VertexID - sid * 6;
  vec4 aSeg = texelFetch(uSegs, ivec2(sid & 1023, sid >> 10), 0);
  vec3 a = project(aSeg.xy);
  vec3 b = project(aSeg.zw);
  vec2 d = b.xy - a.xy;
  float len = length(d);
  float t = (vid == 1 || vid == 2 || vid == 4) ? 1.0 : 0.0;
  float sd = (vid == 2 || vid == 4 || vid == 5) ? 1.0 : -1.0;
  vec2 dir = len > 1e-3 ? d / len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  float hw = uWidth * 0.5 + 1.0;
  vec2 p = mix(a.xy, b.xy, t) + nrm * sd * hw;
  vAcross = sd * hw;
  vHalf = uWidth * 0.5;
  vVis = mix(a.z, b.z, t);
  bool bad = segWraps(aSeg.xy, aSeg.zw) || (a.z < 0.0 && b.z < 0.0);
  gl_Position = bad ? vec4(2.0, 2.0, 2.0, 1.0) : vec4(p.x / uRes.x * 2.0 - 1.0, 1.0 - p.y / uRes.y * 2.0, 0.0, 1.0);
}`;
const FS_LINE = `#version 300 es
precision highp float;
in float vAcross;
in float vVis;
in float vHalf;
uniform vec4 uColor;
out vec4 o;
void main() {
  float cov = clamp(vHalf + 0.5 - abs(vAcross), 0.0, 1.0);
  float a = cov * smoothstep(0.0, 0.06, vVis) * uColor.a;
  o = vec4(uColor.rgb * a, a);
}`;

// Свечение: яркие места → размытие на ¼ и ⅛ разрешения
const FS_BRIGHT = `#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform float uThr;
in vec2 vUv;
out vec4 o;
void main() {
  vec2 px = 1.0 / vec2(textureSize(uSrc, 0));
  vec3 c = texture(uSrc, vUv + px * vec2(-0.5, -0.5)).rgb + texture(uSrc, vUv + px * vec2(0.5, -0.5)).rgb
         + texture(uSrc, vUv + px * vec2(-0.5, 0.5)).rgb + texture(uSrc, vUv + px * vec2(0.5, 0.5)).rgb;
  c *= 0.25;
  float l = max(c.r, max(c.g, c.b));
  o = vec4(c * smoothstep(uThr, uThr + 0.45, l), 1.0);
}`;
const FS_BLUR = `#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uDir;
in vec2 vUv;
out vec4 o;
void main() {
  vec3 c = texture(uSrc, vUv).rgb * 0.2270270270;
  c += (texture(uSrc, vUv + uDir * 1.3846153846).rgb + texture(uSrc, vUv - uDir * 1.3846153846).rgb) * 0.3162162162;
  c += (texture(uSrc, vUv + uDir * 3.2307692308).rgb + texture(uSrc, vUv - uDir * 3.2307692308).rgb) * 0.0702702703;
  o = vec4(c, 1.0);
}`;
const FS_COMPOSITE = `#version 300 es
precision highp float;
uniform sampler2D uBase;
uniform sampler2D uScene;
uniform sampler2D uB1;
uniform sampler2D uB2;
uniform float uBloom;
in vec2 vUv;
out vec4 o;
float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec3 shoulder(vec3 x) { return mix(x, 0.62 + 0.38 * (1.0 - exp(-(x - 0.62) / 0.38)), step(0.62, x)); }
// сжатие яркости по самому яркому каналу: плотные потоки сохраняют цвет, а не уходят в белое
vec3 toneHue(vec3 x) {
  float m = max(x.r, max(x.g, x.b));
  if (m <= 0.55) return x;
  float t = 0.55 + 0.45 * (1.0 - exp(-(m - 0.55) / 0.45));
  return x * (t / m);
}
void main() {
  vec4 l = texture(uScene, vUv);
  vec3 c = texture(uBase, vUv).rgb * (1.0 - clamp(l.a, 0.0, 1.0)) + toneHue(l.rgb);
  c += (texture(uB1, vUv).rgb * 0.85 + texture(uB2, vUv).rgb * 0.7) * uBloom;
  c = shoulder(c);
  c += (h12(gl_FragCoord.xy) - 0.5) / 255.0;
  o = vec4(c, 1.0);
}`;

function compile(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
  return s;
}
function program(vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link');
  const cache = new Map();
  p.u = (name) => { if (!cache.has(name)) cache.set(name, gl.getUniformLocation(p, name)); return cache.get(name); };
  return p;
}
function tex2d(w, h, internal, format, type, data, filter = gl.NEAREST, wrapS = gl.CLAMP_TO_EDGE) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data || null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter === gl.LINEAR_MIPMAP_LINEAR ? gl.LINEAR : filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapS);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

const G = {};             // все ресурсы WebGL
const P = {               // частицы
  PW: 192, PH: 112, NH: 24, STRIDE: 2,
  cur: 0, step: 0, head: 0,
  alpha: 0, alphaTarget: 0,
  lifeMin: 70, lifeMax: 210,
};

function initGL() {
  if (isMobile()) { P.PW = 128; P.PH = 80; P.NH = 20; }
  // режим съёмки: тот же хвост (48 шагов), но реже точки полилинии — меньше работы программному рендеру
  if (SHOT) { P.STRIDE = 3; P.NH = isMobile() ? 14 : 16; }
  G.base = program(VS_FULL, FS_BASE);
  G.update = program(VS_FULL, FS_UPDATE);
  G.trail = program(VS_TRAIL, FS_COLOR);
  G.line = program(VS_LINE, FS_LINE);
  G.bright = program(VS_FULL, FS_BRIGHT);
  G.blur = program(VS_FULL, FS_BLUR);
  G.comp = program(VS_FULL, FS_COMPOSITE);
  G.vaoEmpty = gl.createVertexArray();

  G.wind = tex2d(GW, GH, gl.RGBA32F, gl.RGBA, gl.FLOAT, null);
  G.scal = tex2d(GW, GH, gl.RG32F, gl.RG, gl.FLOAT, null);
  G.rampSpeed = tex2d(256, 1, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, rampBytes(SPEED_RAMP), gl.LINEAR);
  G.rampTemp = tex2d(256, 1, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, rampBytes(TEMP_RAMP), gl.LINEAR);

  // состояние частиц: два буфера по очереди + кольцевая история положений
  G.state = [0, 1].map(() => tex2d(P.PW, P.PH, gl.RGBA32F, gl.RGBA, gl.FLOAT, null));
  G.hist = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, G.hist);
  gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA32F, P.PW, P.PH, P.NH);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  G.fbUpdate = gl.createFramebuffer();

  G.coast = { tex: null, count: 0 };
  G.iso = [{ tex: null, count: 0 }, { tex: null, count: 0 }];
  const ss = gl.getInternalformatParameter(gl.RENDERBUFFER, gl.RGBA16F, gl.SAMPLES);
  G.maxSamples = ss && ss.length ? ss[0] : 0;
}

function setLand(mask, segs) {
  G.land = tex2d(MASK_W, MASK_H, gl.R8, gl.RED, gl.UNSIGNED_BYTE, mask, gl.LINEAR_MIPMAP_LINEAR, gl.REPEAT);
  gl.generateMipmap(gl.TEXTURE_2D);
  setSegments(G.coast, segs);
}
// Отрезки [λ0, φ0, λ1, φ1] → текстура 1024 × N (вершинный шейдер берёт отрезок по номеру)
function setSegments(slot, segs) {
  const n = segs.length / 4;
  const rows = Math.max(1, Math.ceil(n / 1024));
  const data = new Float32Array(rows * 1024 * 4);
  data.set(segs);
  if (slot.tex) gl.deleteTexture(slot.tex);
  slot.tex = tex2d(1024, rows, gl.RGBA32F, gl.RGBA, gl.FLOAT, data);
  slot.count = n;
}

// Буферы экрана: сцена со сглаживанием (MSAA), её копия и три уровня свечения
let dpr = 1, W = 1, H = 1;
function resizeTargets() {
  const maxDpr = SHOT ? 1 : Math.min(2, quality.dprCap);
  dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
  W = Math.max(2, Math.round(innerWidth * dpr));
  H = Math.max(2, Math.round(innerHeight * dpr));
  canvas.width = W; canvas.height = H;
  for (const k of ['msaaFb', 'resolveFb', 'b1Fb', 'b2Fb', 'b3Fb', 'b4Fb', 'b5Fb']) if (G[k]) gl.deleteFramebuffer(G[k]);
  for (const k of ['resolveTex', 'baseTex', 'b1', 'b2', 'b3', 'b4', 'b5']) if (G[k]) gl.deleteTexture(G[k]);
  if (G.baseFb) gl.deleteFramebuffer(G.baseFb);
  G.baseKey = '';
  if (G.msaaRb) gl.deleteRenderbuffer(G.msaaRb);
  // на экранах с высокой плотностью пикселей хватает 2× сглаживания
  // в режиме съёмки без MSAA: программному рендеру это самая дорогая часть кадра
  G.samples = SHOT ? 0 : Math.min(G.maxSamples, dpr > 1.6 ? 2 : 4);
  G.msaaRb = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, G.msaaRb);
  gl.renderbufferStorageMultisample(gl.RENDERBUFFER, G.samples, gl.RGBA16F, W, H);
  G.msaaFb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, G.msaaFb);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, G.msaaRb);
  const mk = (w, h, hdr = false) => {
    const t = hdr ? tex2d(w, h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, null, gl.LINEAR) : tex2d(w, h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, null, gl.LINEAR);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    return [t, fb, w, h];
  };
  [G.resolveTex, G.resolveFb] = mk(W, H, true);   // нити копят яркость выше единицы
  [G.baseTex, G.baseFb] = mk(W, H);
  const w2 = Math.max(1, W >> 1), h2 = Math.max(1, H >> 1), w4 = Math.max(1, W >> 2), h4 = Math.max(1, H >> 2), w8 = Math.max(1, W >> 3), h8 = Math.max(1, H >> 3);
  [G.b1, G.b1Fb] = mk(w2, h2);
  [G.b2, G.b2Fb] = mk(w4, h4);
  [G.b3, G.b3Fb] = mk(w4, h4);
  [G.b4, G.b4Fb] = mk(w8, h8);
  [G.b5, G.b5Fb] = mk(w8, h8);
  G.sizes = { w2, h2, w4, h4, w8, h8 };
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

function uploadField() {
  gl.bindTexture(gl.TEXTURE_2D, G.wind);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, GW, GH, gl.RGBA, gl.FLOAT, field.wind);
  if (field.scalOk) {
    gl.bindTexture(gl.TEXTURE_2D, G.scal);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, GW, GH, gl.RG, gl.FLOAT, field.scal);
  }
  field.gpuDirty = false;
}

// ───────────────────────── 9. Кадр: отрисовка ─────────────────────────

const quality = { dprCap: 2, frames: 0, lastCheck: 0 };
const fx = { tempA: 0, isoA: 0, nightA: 1 };
let isoData = null;          // { minor, major } — отрезки изобар

function viewUniformsFor(v) { return [v.lam0, v.phi0, v.s * dpr, v.hemi]; }
function setProjUniforms(pg) {
  const A = viewFrom || view, B = view;
  const m = viewFrom ? morph.m : 0;
  const I = viewFrom && morph.m < 0.5 ? viewFrom : view;
  gl.uniform1i(pg.u('uProjA'), A.p);
  gl.uniform1i(pg.u('uProjB'), B.p);
  gl.uniform1f(pg.u('uMorph'), m);
  gl.uniform4fv(pg.u('uViewA'), viewUniformsFor(A));
  gl.uniform4fv(pg.u('uViewB'), viewUniformsFor(B));
  gl.uniform2f(pg.u('uCenterA'), A.cx * dpr, A.cy * dpr);
  gl.uniform2f(pg.u('uCenterB'), B.cx * dpr, B.cy * dpr);
  gl.uniform1i(pg.u('uProjI'), I.p);
  gl.uniform4fv(pg.u('uViewI'), viewUniformsFor(I));
  gl.uniform2f(pg.u('uCenterI'), I.cx * dpr, I.cy * dpr);
  gl.uniform2f(pg.u('uRes'), W, H);
  gl.uniform1f(pg.u('uPolarMin'), POLAR_MIN);
}
function bindTex(pg, name, unit, tex, target = gl.TEXTURE_2D) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(target, tex);
  gl.uniform1i(pg.u(name), unit);
}

// Шаг времени модели: при ветре 10 м/с частица проходит ≈ 1,2 CSS-пикселя за шаг
function simDt() {
  const v = view;
  const perRad = v.p === 0 ? 1 / (EM * EA1) : v.p === 1 ? 1 : 1.15;
  return (0.12 * R_EARTH) / (v.s * perRad) * field.dtScale;
}

function stepParticles(n, reset = false) {
  const pg = G.update;
  gl.useProgram(pg);
  gl.bindVertexArray(G.vaoEmpty);
  gl.disable(gl.BLEND);
  gl.viewport(0, 0, P.PW, P.PH);
  gl.bindFramebuffer(gl.FRAMEBUFFER, G.fbUpdate);
  setProjUniforms(pg);
  bindTex(pg, 'uWind', 1, G.wind);
  gl.uniform1f(pg.u('uDt'), simDt());
  gl.uniform1f(pg.u('uLifeMin'), P.lifeMin);
  gl.uniform1f(pg.u('uLifeMax'), P.lifeMax);
  for (let s = 0; s < n; s++) {
    const src = P.cur, dst = 1 - P.cur;
    const next = P.step + 1;
    const writeHist = next % P.STRIDE === 0;
    const layer = writeHist ? (next / P.STRIDE) % P.NH : 0;
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, G.state[dst], 0);
    if (writeHist) gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, G.hist, 0, layer);
    else gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, null, 0, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, writeHist ? gl.COLOR_ATTACHMENT1 : gl.NONE]);
    bindTex(pg, 'uState', 0, G.state[src]);
    gl.uniform1f(pg.u('uSeed'), (next % 4093) * 0.6180339 + 0.5);
    gl.uniform1f(pg.u('uReset'), reset && s === 0 ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    P.cur = dst;
    P.step = next;
    if (writeHist) P.head = layer;
  }
  gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
  gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, null, 0, 0);
}

// Полный прогрев: частицы рождаются заново и сразу проживают длину хвоста
function prewarm() {
  stepParticles(1, true);
  stepParticles(P.NH * P.STRIDE + 2);
}

function drawLines(slot, width, rgba) {
  if (!slot.count || rgba[3] <= 0.001) return;
  const pg = G.line;
  gl.useProgram(pg);
  setProjUniforms(pg);
  bindTex(pg, 'uSegs', 0, slot.tex);
  gl.uniform1f(pg.u('uWidth'), width * dpr);
  gl.uniform4fv(pg.u('uColor'), rgba);
  gl.bindVertexArray(G.vaoEmpty);
  gl.drawArrays(gl.TRIANGLES, 0, slot.count * 6);
}

function sunVector(date) {
  // подсолнечная точка: склонение и уравнение времени по простым формулам (точность ~1°)
  const d = date.getTime() / 86400000 - 10957.5;       // сутки от J2000
  const g = (357.529 + 0.98560028 * d) * DEG;
  const q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * DEG;
  const e = (23.439 - 0.00000036 * d) * DEG;
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const gmst = mod(280.46061837 + 360.98564736629 * d, 360) * DEG;
  const lon = wrapPi(ra - gmst);
  return [Math.cos(dec) * Math.cos(lon), Math.cos(dec) * Math.sin(lon), Math.sin(dec)];
}
function hourDate(h) {
  const t0 = state.source === 'live' && live ? live.times[0] * 1000 : synthT0;
  return new Date(t0 + h * 3600000);
}

function render() {
  // 1. подложка — только если что-то изменилось (вид, время, слои)
  gl.bindVertexArray(G.vaoEmpty);
  gl.disable(gl.BLEND);
  const baseA = viewFrom ? smooth(Math.abs(1 - 2 * morph.m)) : 1;
  const baseKey = `${viewVersion}|${baseA.toFixed(3)}|${fx.tempA.toFixed(3)}|${fx.nightA.toFixed(3)}|${state.hour.toFixed(3)}|${fx.tempA > 0.001 ? field.scalVersion : 0}|${W}x${H}`;
  if (baseKey !== G.baseKey) {
    G.baseKey = baseKey;
    drawBase(baseA);
  }
  // 2. линии и нити — в буфер со сглаживанием (MSAA) на прозрачном фоне
  gl.bindFramebuffer(gl.FRAMEBUFFER, G.msaaFb);
  gl.viewport(0, 0, W, H);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  drawOverlay();
  finishFrame();
}

function drawBase(baseA) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, G.baseFb);
  gl.viewport(0, 0, W, H);
  const pb = G.base;
  gl.useProgram(pb);
  setProjUniforms(pb);
  bindTex(pb, 'uLand', 0, G.land);
  bindTex(pb, 'uWind', 1, G.wind);
  bindTex(pb, 'uScal', 2, G.scal);
  bindTex(pb, 'uRampSpeed', 3, G.rampSpeed);
  bindTex(pb, 'uRampTemp', 4, G.rampTemp);
  gl.uniform1f(pb.u('uTempA'), fx.tempA);
  gl.uniform1f(pb.u('uBaseA'), baseA);
  gl.uniform3fv(pb.u('uSun'), sunVector(hourDate(state.hour)));
  gl.uniform1f(pb.u('uNightA'), fx.nightA);
  gl.uniform1f(pb.u('uGrat'), view.k > 2.6 ? 10 : 30);
  gl.uniform1f(pb.u('uDpr'), dpr);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function drawOverlay() {
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  drawLines(G.coast, 0.9, [0.60, 0.70, 0.78, 0.42]);
  if (fx.isoA > 0.01) {
    drawLines(G.iso[0], 1.0, [0.80, 0.86, 0.92, 0.16 * fx.isoA]);
    drawLines(G.iso[1], 1.35, [0.86, 0.90, 0.95, 0.30 * fx.isoA]);
  }

  // нити
  if (P.alpha > 0.002) {
    const pt = G.trail;
    gl.useProgram(pt);
    setProjUniforms(pt);
    bindTex(pt, 'uState', 0, G.state[P.cur]);
    bindTex(pt, 'uHist', 1, G.hist, gl.TEXTURE_2D_ARRAY);
    bindTex(pt, 'uWind', 2, G.wind);
    bindTex(pt, 'uRamp', 3, G.rampSpeed);
    gl.uniform1i(pt.u('uHead'), P.head);
    gl.uniform1i(pt.u('uNH'), P.NH);
    gl.uniform1i(pt.u('uPW'), P.PW);
    gl.uniform1f(pt.u('uPhase'), P.step % P.STRIDE);
    gl.uniform1f(pt.u('uStride'), P.STRIDE);
    gl.uniform1f(pt.u('uVmax'), field.vmax);
    // на плотных экранах линия в пиксель устройства вдвое тоньше — возвращаем ей яркость
    const dprBoost = 1 + 0.6 * clamp(dpr - 1, 0, 1);
    gl.uniform1f(pt.u('uAlpha'), P.alpha * field.glow * dprBoost * (1 - 0.15 * fx.tempA));
    gl.uniform1f(pt.u('uMono'), clamp(fx.tempA / 0.78, 0, 1));
    gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ZERO, gl.ONE);
    gl.bindVertexArray(G.vaoEmpty);
    gl.drawArrays(gl.LINES, 0, 2 * P.NH * P.PW * P.PH);
  }
  gl.disable(gl.BLEND);
}

function finishFrame() {
  // 3. сведение MSAA
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, G.msaaFb);
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, G.resolveFb);
  gl.blitFramebuffer(0, 0, W, H, 0, 0, W, H, gl.COLOR_BUFFER_BIT, gl.NEAREST);
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);

  // 4. свечение от нитей
  gl.bindVertexArray(G.vaoEmpty);
  const S = G.sizes;
  gl.useProgram(G.bright);
  gl.bindFramebuffer(gl.FRAMEBUFFER, G.b1Fb);
  gl.viewport(0, 0, S.w2, S.h2);
  bindTex(G.bright, 'uSrc', 0, G.resolveTex);
  gl.uniform1f(G.bright.u('uThr'), 0.42);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.useProgram(G.blur);
  const blur = (srcTex, fb, w, h, dx, dy) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.viewport(0, 0, w, h);
    bindTex(G.blur, 'uSrc', 0, srcTex);
    gl.uniform2f(G.blur.u('uDir'), (dx * dpr) / w, (dy * dpr) / h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  blur(G.b1, G.b2Fb, S.w4, S.h4, 1, 0);
  blur(G.b2, G.b3Fb, S.w4, S.h4, 0, 1);
  blur(G.b3, G.b4Fb, S.w8, S.h8, 1, 0);
  blur(G.b4, G.b5Fb, S.w8, S.h8, 0, 1);

  // 5. на экран: подложка, поверх — линии и нити, затем свечение
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, W, H);
  gl.useProgram(G.comp);
  bindTex(G.comp, 'uScene', 0, G.resolveTex);
  bindTex(G.comp, 'uB1', 1, G.b3);
  bindTex(G.comp, 'uB2', 2, G.b5);
  bindTex(G.comp, 'uBase', 3, G.baseTex);
  gl.uniform1f(G.comp.u('uBloom'), 0.6);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

// ───────────────────────── 10. Изобары и центры циклонов ─────────────────────────

function pAt(S, i, j) { return S[(j * GW + mod(i, GW)) * 2 + 1]; }

// «Марширующие квадраты» по полю давления на сетке 1°, шаг 4 гПа
function buildIsobars(S) {
  const minor = [], major = [];
  const EDGE = [
    null, [[3, 0]], [[0, 1]], [[3, 1]], [[1, 2]], null, [[0, 2]], [[3, 2]],
    [[2, 3]], [[0, 2]], null, [[1, 2]], [[1, 3]], [[0, 1]], [[3, 0]], null,
  ];
  const pt = (e, i, j, a, b, c, d, L, out) => {
    let x, y;
    if (e === 0) { x = i + (L - a) / (b - a); y = j; }
    else if (e === 1) { x = i + 1; y = j + (L - b) / (c - b); }
    else if (e === 2) { x = i + (L - d) / (c - d); y = j + 1; }
    else { x = i; y = j + (L - a) / (d - a); }
    out.push((x - 180) * DEG, (y - 90) * DEG);
  };
  for (let j = 6; j < 174; j++) {
    for (let i = 0; i < GW; i++) {
      const a = pAt(S, i, j), b = pAt(S, i + 1, j), c = pAt(S, i + 1, j + 1), d = pAt(S, i, j + 1);
      const lo = Math.min(a, b, c, d), hi = Math.max(a, b, c, d);
      for (let L = Math.ceil(lo / 4) * 4; L <= hi; L += 4) {
        const idx = (a > L ? 1 : 0) | (b > L ? 2 : 0) | (c > L ? 4 : 0) | (d > L ? 8 : 0);
        if (idx === 0 || idx === 15) continue;
        let segs = EDGE[idx];
        if (!segs) {
          const center = (a + b + c + d) / 4 > L;
          segs = idx === 5 ? (center ? [[0, 1], [2, 3]] : [[3, 0], [1, 2]]) : (center ? [[3, 0], [1, 2]] : [[0, 1], [2, 3]]);
        }
        const out = L % 20 === 0 ? major : minor;
        for (const [e1, e2] of segs) { pt(e1, i, j, a, b, c, d, L, out); pt(e2, i, j, a, b, c, d, L, out); }
      }
    }
  }
  return { minor: new Float32Array(minor), major: new Float32Array(major) };
}

// Центры: давление ниже (выше) всех соседей в радиусе ~10° и заметно отличается от окрестности
function findCenters(S) {
  const cand = [];
  for (let j = 14; j <= 166; j += 2) {
    const cp = Math.cos((j - 90) * DEG);
    const ri = Math.min(40, Math.round(10 / Math.max(cp, 0.25)));
    for (let i = 0; i < GW; i += 2) {
      const p = pAt(S, i, j);
      let isMin = true, isMax = true, sum = 0, n = 0;
      for (let dj = -10; dj <= 10 && (isMin || isMax); dj += 2) {
        const jj = j + dj;
        if (jj < 0 || jj > 180) continue;
        for (let di = -ri; di <= ri; di += 2) {
          if (!di && !dj) continue;
          const q = pAt(S, i + di, jj);
          if (q < p) isMin = false;
          if (q > p) isMax = false;
          sum += q; n++;
        }
      }
      if (!isMin && !isMax) continue;
      const mean = sum / n;
      if (isMin && mean - p > 3.5) cand.push({ low: true, i, j, p, prom: mean - p });
      if (isMax && p - mean > 3) cand.push({ low: false, i, j, p, prom: p - mean });
    }
  }
  cand.sort((a, b) => b.prom - a.prom);
  const out = [];
  let lows = 0, highs = 0;
  for (const c of cand) {
    const lam = (c.i - 180) * DEG, phi = (c.j - 90) * DEG;
    const near = out.some((o) => Math.acos(clamp(Math.sin(phi) * Math.sin(o.phi) + Math.cos(phi) * Math.cos(o.phi) * Math.cos(lam - o.lam), -1, 1)) < 20 * DEG);
    if (near || (c.low ? lows >= 8 : highs >= 6)) continue;
    out.push({ low: c.low, lam, phi, p: c.p });
    if (c.low) lows++; else highs++;
  }
  return out;
}

let centers = [];
let isoVersion = -1, isoTime = 0;
function refreshIsobars(now, force = false) {
  if (!field.scalOk) return;
  if (!force && (field.scalVersion === isoVersion || now - isoTime < 110)) return;
  isoVersion = field.scalVersion;
  isoTime = now;
  isoData = buildIsobars(field.scal);
  setSegments(G.iso[0], isoData.minor);
  setSegments(G.iso[1], isoData.major);
  centers = findCenters(field.scal);
  syncMarks();
}

// ───────────────────────── 11. Интерфейс ─────────────────────────

const ui = {
  status: $('status'), statusText: $('statusText'), retry: $('retry'),
  legRamp: $('legRamp'), legTicks: $('legTicks'), legNote: $('legNote'),
  tIsobars: $('tIsobars'), tTemp: $('tTemp'), tNight: $('tNight'),
  play: $('play'), range: $('timeRange'), timeLabel: $('timeLabel'), nowBtn: $('nowBtn'),
  ticks: $('ticks'), trackNow: $('trackNow'),
  marks: $('marks'), grat: $('grat'), probeMark: $('probeMark'), probe: $('probe'), about: $('about'),
  hint: $('hint'),
};

function setStatus(kind, text) {
  state.status = kind;
  ui.status.dataset.state = kind === 'live' ? 'live' : kind === 'loading' ? 'loading' : 'synth';
  ui.statusText.textContent = text;
  ui.retry.hidden = !(kind === 'offline' || kind === 'timeout');
}

function updateLegend() {
  const L = LEVELS[state.level];
  const surface = state.level === 0;
  const tempOn = state.temp && surface;
  if (tempOn) {
    // подложка температуры: цвет отдан ей, нити становятся белыми
    ui.legRamp.style.background = rampCss(TEMP_RAMP);
    ui.legTicks.innerHTML = ['−40', '−20', '0', '+20', '+40'].map((t, k) => `<span style="left:${k * 25}%">${t}</span>`).join('');
    $('legTitle').textContent = 'Температура у земли, °C';
  } else {
    ui.legRamp.style.background = rampCss(SPEED_RAMP);
    const q = L.vmax / 4;
    ui.legTicks.innerHTML = [0, 1, 2, 3, 4].map((k) => `<span style="left:${k * 25}%">${Math.round(q * k)}${k === 4 ? '+' : ''}</span>`).join('');
    $('legTitle').textContent = 'Скорость ветра, м/с';
  }
  ui.tIsobars.disabled = !surface;
  ui.tTemp.disabled = !surface;
  ui.tIsobars.setAttribute('aria-pressed', String(state.isobars && surface));
  ui.tTemp.setAttribute('aria-pressed', String(tempOn));
  ui.tNight.setAttribute('aria-pressed', String(state.night));
  let note;
  if (!surface) note = 'Изобары и температура — только у земли';
  else if (tempOn) note = 'Нити белые: цвет отдан температуре, яркость — скорость';
  else if (state.isobars) note = 'Изобары через 4 гПа · Н — циклон, В — антициклон';
  else note = '';
  ui.legNote.textContent = note;
  document.querySelectorAll('.seg.alt button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.level) === state.level)));
  $('altNote').textContent = L.note;
}

function setLevel(level) {
  level = clamp(level, 0, 3);
  if (level === state.level) return;
  beginFieldTransition(950);
  state.level = level;
  field.key = '';
  updateLegend();
  if (probe.on) renderProbe();
}

// Шкала времени: деления каждые 6 часов, подписи дней в местную полночь
function buildTicks() {
  const hMax = maxHour();
  let html = '';
  for (let h = 0; h <= hMax; h++) {
    const d = hourDate(h);
    const x = (h / hMax) * 100;
    if (d.getHours() === 0) {
      html += `<i class="tick day" style="left:${x}%"></i>`;
      if (x > 4 && x < 96) html += `<span class="tick-label" style="left:${x}%">${fmtDay.format(d).replace(',', '')}</span>`;
    } else if (d.getHours() % 6 === 0) html += `<i class="tick" style="left:${x}%"></i>`;
  }
  ui.ticks.innerHTML = html;
  ui.range.max = String(hMax);
}
function updateTimeUI() {
  const hMax = maxHour();
  ui.range.value = String(state.hour);
  const d = hourDate(state.hour);
  const lead = state.hour - state.hourNow;
  let rel = '';
  if (Math.abs(lead) >= 0.5) rel = ` · ${lead > 0 ? '+' : '−'}${Math.round(Math.abs(lead))}${NB}ч`;
  ui.timeLabel.textContent = cap(fmtFull.format(d)) + rel;
  ui.trackNow.style.left = `${(state.hourNow / hMax) * 100}%`;
  ui.nowBtn.hidden = Math.abs(lead) < 0.5;
}
function setHour(h, fromUser = true) {
  state.hour = clamp(h, 0, maxHour());
  if (fromUser) state.follow = Math.abs(state.hour - state.hourNow) < 0.25;
  updateTimeUI();
  if (probe.on) renderProbeValues();
}
function setPlaying(on) {
  state.playing = on;
  ui.play.classList.toggle('on', on);
  ui.play.setAttribute('aria-label', on ? 'Остановить прогноз' : 'Проиграть прогноз на двое суток');
}

// Метки Н и В
const markPool = [];
function syncMarks() {
  const show = fx.isoA > 0.02 && state.level === 0 && state.isobars;
  while (markPool.length < centers.length) {
    const el = document.createElement('div');
    el.className = 'mark';
    ui.marks.appendChild(el);
    markPool.push(el);
  }
  markPool.forEach((el, k) => {
    const c = centers[k];
    if (!c) { el.style.opacity = '0'; return; }
    el.className = 'mark ' + (c.low ? 'low' : 'high');
    el.textContent = c.low ? 'Н' : 'В';
    if (!show) el.style.opacity = '0';
  });
  placeMarks();
}
function placeMarks() {
  const show = fx.isoA > 0.02 && state.level === 0 && state.isobars;
  markPool.forEach((el, k) => {
    const c = centers[k];
    if (!c || !show) { el.style.opacity = '0'; return; }
    const [x, y, vis] = screenNow(c.lam, c.phi);
    const ok = visibleOk(view.p, vis) && x > -20 && y > -20 && x < innerWidth + 20 && y < innerHeight + 20;
    el.style.transform = `translate3d(${(x - 8).toFixed(1)}px, ${(y - 11).toFixed(1)}px, 0)`;
    el.style.opacity = ok ? String(Math.min(1, fx.isoA * 1.2)) : '0';
  });
}

// Подписи градусной сетки: широты по краям карты, долготы по окружности полярной карты
const gratPool = [];
function placeGrat() {
  const items = [];
  if (!viewFrom && view.k < 1.5) {
    if (view.p === 0) {
      for (const phi of [60, -60]) {
        for (const side of [-1, 1]) {
          const [x, y] = screenOf(view.lam0 + side * (Math.PI - 1e-4), phi * DEG, view);
          items.push({ x: x + side * 7, y, text: `${Math.abs(phi)}° ${phi > 0 ? 'с.' : 'ю.'} ш.`, ax: side < 0 ? '-100%' : '0' });
        }
      }
    } else if (view.p === 2) {
      for (let d = -150; d <= 180; d += 30) {
        const [x, y] = screenOf(d * DEG, 0, view);
        const dx = x - view.cx, dy = y - view.cy, r = Math.hypot(dx, dy) || 1;
        const text = d === 0 ? '0°' : d === 180 ? '180°' : `${Math.abs(d)}° ${d > 0 ? 'в.' : 'з.'} д.`;
        items.push({ x: x + (dx / r) * 22, y: y + (dy / r) * 13, text, ax: '-50%' });
      }
    }
  }
  while (gratPool.length < items.length) {
    const el = document.createElement('div');
    el.className = 'glab';
    ui.grat.appendChild(el);
    gratPool.push(el);
  }
  gratPool.forEach((el, i) => {
    const it = items[i];
    if (!it) { el.style.opacity = '0'; return; }
    const inside = it.x > 2 && it.x < innerWidth - 2 && it.y > 2 && it.y < innerHeight - 2;
    el.textContent = it.text;
    el.style.transform = `translate3d(${it.x.toFixed(1)}px, ${it.y.toFixed(1)}px, 0) translate(${it.ax}, -50%)`;
    el.style.opacity = inside ? '1' : '0';
  });
}

// ───────────────────────── 12. Карточка точки ─────────────────────────

const probe = { on: false, lam: 0, phi: 0, exact: null, req: 0, loading: false };
const pointCache = new Map();

function pointValues(level, hf) {
  // точные данные точки → иначе живая сетка → иначе иллюстративная модель
  const L = LEVELS[level];
  const ex = probe.exact;
  if (ex) {
    const he = clamp(hf - ex.off, 0, ex.H - 1);
    const h0 = Math.floor(he), h1 = Math.min(ex.H - 1, h0 + 1), t = he - h0;
    const sp = (k) => ex.data[L.sv][k], dr = (k) => ex.data[L.dv][k] * DEG;
    const u = lerp(-sp(h0) * Math.sin(dr(h0)), -sp(h1) * Math.sin(dr(h1)), t);
    const v = lerp(-sp(h0) * Math.cos(dr(h0)), -sp(h1) * Math.cos(dr(h1)), t);
    const pick = (name) => lerp(ex.data[name][h0], ex.data[name][h1], t);
    return {
      speed: Math.hypot(u, v), from: mod(Math.atan2(-u, -v) / DEG, 360),
      T: pick(L.tv), Ts: pick('temperature_2m'), P: pick('pressure_msl'), gust: pick('wind_gusts_10m'),
      code: ex.data.weather_code[Math.round(he)],
    };
  }
  const h0 = Math.floor(hf), h1 = Math.min(maxHour(), h0 + 1), t = hf - h0;
  const at = (lv, h) => (state.source === 'live' ? livePointAt(lv, h, probe.lam, probe.phi) : synthPointAt(lv, h, probe.lam, probe.phi));
  const a = at(level, h0), b = h1 === h0 ? a : at(level, h1);
  const u = lerp(a.u, b.u, t), v = lerp(a.v, b.v, t);
  let Ts = NaN, Pp = NaN;
  if (level === 0) { Ts = lerp(a.T, b.T, t); Pp = lerp(a.P, b.P, t); }
  else { const s0 = at(0, Math.round(hf)); Ts = s0.T; Pp = s0.P; }
  return { speed: Math.hypot(u, v), from: mod(Math.atan2(-u, -v) / DEG, 360), T: NaN, Ts, P: Pp, gust: NaN, code: null };
}

function arrowSvg(from, cls = '') {
  return `<svg viewBox="0 0 16 16" aria-hidden="true" class="${cls}" style="transform:rotate(${(from + 180).toFixed(0)}deg)"><path d="M8 1.5l4.2 6.2H9.2v6.8H6.8V7.7H3.8z"/></svg>`;
}

function renderProbeValues() {
  if (!probe.on) return;
  const hf = state.hour;
  const cur = pointValues(state.level, hf);
  $('pSpeed').textContent = num(cur.speed, cur.speed < 10 ? 1 : 0);
  $('pDir').textContent = cur.speed < 0.5 ? 'Штиль' : `Дует ${FROM[Math.round(cur.from / 45) % 8]}`;
  $('pArrow').style.transform = `rotate(${(cur.from + 180).toFixed(1)}deg)`;
  const meta = [];
  if (Number.isFinite(cur.Ts)) meta.push(`у земли ${signed(cur.Ts)}${NB}°C`);
  if (state.level > 0 && Number.isFinite(cur.T)) meta.push(`на ${LEVELS[state.level].km} ${signed(cur.T, 0)}${NB}°C`);
  if (Number.isFinite(cur.P)) meta.push(`${Math.round(cur.P)}${NB}гПа`);
  if (cur.code != null && WMO[cur.code]) meta.push(WMO[cur.code]);
  if (Number.isFinite(cur.gust) && state.level === 0) meta.push(`порывы до ${num(cur.gust, 0)}${NB}м/с`);
  $('pMeta').textContent = meta.join(' · ');
  // ветер по высотам — сверху вниз, как в атмосфере
  let rows = '';
  for (let lv = 3; lv >= 0; lv--) {
    const v = lv === state.level ? cur : pointValues(lv, hf);
    const w = clamp(v.speed / LEVELS[lv].vmax, 0.02, 1);
    const c = rampAt(SPEED_RAMP, v.speed / LEVELS[lv].vmax);
    rows += `<div class="lvl${lv === state.level ? ' cur' : ''}"><b>${LEVELS[lv].km}</b>${arrowSvg(v.from)}<span class="bar"><i style="transform:scaleX(${w.toFixed(3)});background:rgb(${c.map(Math.round).join(',')})"></i></span><em>${num(v.speed, 0)}${NB}м/с</em></div>`;
  }
  $('pLevels').innerHTML = rows;
  renderSpark();
}

function renderSpark() {
  const svg = $('pSpark');
  const hMax = maxHour();
  const vals = [];
  const step = probe.exact ? 1 : 2;
  for (let h = 0; h <= hMax; h += step) vals.push([h, pointValues(state.level, h).speed]);
  if (vals[vals.length - 1][0] !== hMax) vals.push([hMax, pointValues(state.level, hMax).speed]);
  const vmax = Math.max(4, ...vals.map((v) => v[1])) * 1.1;
  const X = (h) => (h / hMax) * 260, Y = (s) => 51 - (s / vmax) * 45;
  let d = '';
  vals.forEach(([h, s], k) => { d += `${k ? 'L' : 'M'}${X(h).toFixed(1)} ${Y(s).toFixed(1)}`; });
  const area = `${d}L260 54L0 54Z`;
  const mx = vals.reduce((a, b) => (b[1] > a[1] ? b : a));
  const cx = X(state.hour), cy = Y(pointValues(state.level, state.hour).speed);
  svg.innerHTML = `<defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9edbe9" stop-opacity=".28"/><stop offset="1" stop-color="#9edbe9" stop-opacity="0"/></linearGradient></defs>
    <path d="${area}" fill="url(#sg)"/><path d="${d}" fill="none" stroke="#9edbe9" stroke-width="1.4" vector-effect="non-scaling-stroke"/>
    <line x1="${cx.toFixed(1)}" x2="${cx.toFixed(1)}" y1="2" y2="54" stroke="#e8edf0" stroke-opacity=".5" stroke-width="1" vector-effect="non-scaling-stroke"/>
    <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="2.6" fill="#e8edf0"/>`;
  $('pSparkTitle').innerHTML = `<span>${LEVELS[state.level].km} · 48 часов</span><b>макс. ${num(mx[1], 0)}${NB}м/с</b>`;
}

function renderProbe() {
  $('pWhere').textContent = coordText(probe.lam, probe.phi);
  renderProbeValues();
  const src = probe.exact ? 'Источник: Open-Meteo, прогноз для точки'
    : state.source === 'live' ? (probe.loading ? 'По сетке из 514 точек, уточняю…' : 'Источник: сетка из 514 точек')
      : 'Иллюстративная модель, не прогноз';
  $('pSrc').textContent = src;
}

function openProbe(lamDeg, phiDeg) {
  probe.on = true;
  probe.lam = wrap180(lamDeg);
  probe.phi = clamp(phiDeg, -89.9, 89.9);
  probe.exact = null;
  probe.loading = false;
  ui.probe.hidden = false;
  ui.probeMark.hidden = false;
  requestAnimationFrame(() => ui.probe.classList.add('show'));
  renderProbe();
  placeProbe();
  if (state.source === 'live') fetchPoint();
}
function closeProbe() {
  idleSince = performance.now();
  probe.on = false;
  probe.req++;
  ui.probe.classList.remove('show');
  ui.probeMark.hidden = true;
  setTimeout(() => { if (!probe.on) ui.probe.hidden = true; }, 260);
}

async function fetchPoint() {
  const id = ++probe.req;
  const key = `${probe.lam.toFixed(2)},${probe.phi.toFixed(2)}`;
  let data = pointCache.get(key);
  if (!data) {
    probe.loading = true;
    renderProbe();
    try {
      const url = API + '?' + new URLSearchParams({
        latitude: probe.phi.toFixed(3), longitude: probe.lam.toFixed(3),
        hourly: POINT_VARS.join(','), wind_speed_unit: 'ms', forecast_hours: String(HOURS), timeformat: 'unixtime',
      });
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json();
      const H = Math.min(HOURS, j.hourly.time.length);
      const d = {};
      for (const name of POINT_VARS) d[name] = (j.hourly[name] || []).slice(0, H).map((x) => (x == null ? NaN : x));
      // сдвиг часов относительно сетки (если запросы попали в разные часы)
      const off = live ? Math.round((j.hourly.time[0] - live.times[0]) / 3600) : 0;
      data = { H, off, data: d };
      pointCache.set(key, data);
    } catch (e) {
      data = null;
    }
  }
  if (id !== probe.req) return;
  probe.loading = false;
  probe.exact = data;
  renderProbe();
}

function placeProbe() {
  if (!probe.on) return;
  const [x, y, vis] = screenNow(probe.lam * DEG, probe.phi * DEG);
  const ok = visibleOk(view.p, vis);
  ui.probeMark.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
  ui.probeMark.style.opacity = ok ? '1' : '0';
  if (isMobile()) { ui.probe.classList.toggle('top', y > frameBox().cy); return; }
  const w = ui.probe.offsetWidth || 288, h = ui.probe.offsetHeight || 380;
  let px = x + 30, py = y - 70;
  if (px + w > innerWidth - 16) px = x - 30 - w;
  px = clamp(px, 16, innerWidth - w - 16);
  py = clamp(py, 16, innerHeight - h - 110);
  ui.probe.style.left = `${px.toFixed(0)}px`;
  ui.probe.style.top = `${py.toFixed(0)}px`;
}

// ───────────────────────── 13. Мышь, пальцы, клавиатура ─────────────────────────

const pointers = new Map();
const drag = { on: false, moved: false, x: 0, y: 0, x0: 0, y0: 0, t: 0, vx: 0, vy: 0, pinch: 0, k0: 1, ang: 0 };
const inertia = { vl: 0, vp: 0 };
let tween = null;           // плавный возврат масштаба

function bumpView() { derive(view); viewVersion++; }

function clampPan() {
  const b = frameBox();
  if (view.p === 1) { view.tx = 0; view.ty = 0; return; }
  const halfW = (view.p === 0 ? EE_XMAX : POLAR_RHO) * view.s, halfH = (view.p === 0 ? EE_YMAX : POLAR_RHO) * view.s;
  const mx = Math.max(0, halfW - b.w / 2 + 40), my = Math.max(0, halfH - b.h / 2 + 40);
  view.tx = clamp(view.tx, -mx, mx);
  view.ty = clamp(view.ty, -my, my);
}

function zoomAt(factor, x, y) {
  if (viewFrom) return;
  const k1 = clamp(view.k * factor, 1, 7);
  const f = k1 / view.k;
  if (f === 1) return;
  if (view.p === 1 || k1 === 1) { view.k = k1; view.tx = 0; view.ty = 0; bumpView(); return; }
  // точка под курсором остаётся на месте
  view.tx = (view.cx - x) * f + x - frameBox().cx;
  view.ty = (view.cy - y) * f + y - frameBox().cy;
  view.k = k1;
  derive(view);
  clampPan();
  bumpView();
}

function onDragMove(dx, dy, x, y) {
  if (view.p === 0) {
    view.lam0 = wrapPi(view.lam0 - dx / (view.s * (1 / (EM * EA1))));
    if (view.k > 1.01) { view.ty += dy; clampPan(); }
  } else if (view.p === 1) {
    view.lam0 = wrapPi(view.lam0 - dx / view.s);
    view.phi0 = clamp(view.phi0 + dy / view.s, -85 * DEG, 85 * DEG);
  } else {
    // полярная карта: поворот вокруг полюса, при увеличении — ещё и сдвиг
    if (view.k > 1.01) { view.tx += dx; view.ty += dy; clampPan(); }
    else {
      const a1 = Math.atan2(y - view.cy, x - view.cx), a0 = Math.atan2(y - dy - view.cy, x - dx - view.cx);
      view.lam0 = wrapPi(view.lam0 + view.hemi * (a1 - a0));
    }
  }
  bumpView();
}

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  inertia.vl = inertia.vp = 0;
  idleSince = performance.now();
  if (pointers.size === 1) {
    Object.assign(drag, { on: true, moved: false, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t: performance.now(), vx: 0, vy: 0 });
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    drag.pinch = Math.hypot(a.x - b.x, a.y - b.y);
    drag.k0 = view.k;
    drag.moved = true;
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (viewFrom) return;
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (drag.pinch > 0) zoomAt((drag.k0 * d) / drag.pinch / view.k, (a.x + b.x) / 2, (a.y + b.y) / 2);
    return;
  }
  if (!drag.on) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 5) return;
  drag.moved = true;
  canvas.classList.add('dragging');
  const now = performance.now(), dt = Math.max(1, now - drag.t);
  drag.vx = lerp(drag.vx, dx / dt, 0.5);
  drag.vy = lerp(drag.vy, dy / dt, 0.5);
  drag.t = now;
  onDragMove(dx, dy, e.clientX, e.clientY);
  drag.x = e.clientX; drag.y = e.clientY;
});
const endPointer = (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  if (pointers.size > 0) { drag.on = false; return; }
  canvas.classList.remove('dragging');
  if (drag.on && !drag.moved && e.type === 'pointerup') {
    const g = geoOf(e.clientX, e.clientY);
    if (g) openProbe(g[0] / DEG, g[1] / DEG);
    else if (probe.on) closeProbe();
  } else if (drag.on && drag.moved && view.p === 1 && performance.now() - drag.t < 80) {
    inertia.vl = -drag.vx / view.s;
    inertia.vp = drag.vy / view.s;
  }
  drag.on = false;
  drag.pinch = 0;
};
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  idleSince = performance.now();
  const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
  zoomAt(Math.exp(-dy * 0.0016), e.clientX, e.clientY);
}, { passive: false });
canvas.addEventListener('dblclick', (e) => { e.preventDefault(); zoomAt(1.8, e.clientX, e.clientY); });

function setProjection(p) {
  if (viewFrom) return;
  if (p === view.p && p === 2 && view.k < 1.05) {
    // повторный выбор полярной карты — другое полушарие
    viewFrom = { ...view };
    view.hemi = -view.hemi;
    view.tx = 0; view.ty = 0; view.k = 1;
  } else if (p === view.p) {
    // повторный выбор той же проекции — плавно вернуть исходный масштаб
    if (view.k !== 1 || view.tx || view.ty) tween = { t0: performance.now(), dur: SHOT ? 1 : 650, k: view.k, tx: view.tx, ty: view.ty };
    return;
  } else {
    viewFrom = { ...view };
    view.p = p;
    view.k = 1; view.tx = 0; view.ty = 0;
    if (p === 1) view.phi0 = 24 * DEG;
    if (p === 2) view.hemi = 1;
  }
  morph.t0 = performance.now();
  morph.dur = SHOT ? 1 : 1400;
  morph.m = 0;
  derive(view);
  derive(viewFrom);
  document.querySelectorAll('.proj button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.proj) === view.p)));
  ui.hint.textContent = view.p === 1 ? 'Тяните глобус · колесо — масштаб · щелчок — ветер в точке'
    : view.p === 2 ? `${view.hemi > 0 ? 'Северное' : 'Южное'} полушарие · «Полюс» ещё раз — ${view.hemi > 0 ? 'южное' : 'северное'} · тяните по кругу`
      : 'Тяните карту · колесо — масштаб · щелчок — ветер в точке';
  viewVersion++;
}

document.querySelectorAll('.proj button').forEach((b) => b.addEventListener('click', () => setProjection(Number(b.dataset.proj))));
document.querySelectorAll('.seg.alt button').forEach((b) => b.addEventListener('click', () => setLevel(Number(b.dataset.level))));
ui.tIsobars.addEventListener('click', () => { state.isobars = !state.isobars; updateLegend(); syncMarks(); });
ui.tTemp.addEventListener('click', () => { state.temp = !state.temp; updateLegend(); });
ui.tNight.addEventListener('click', () => { state.night = !state.night; updateLegend(); });
ui.play.addEventListener('click', () => {
  if (!state.playing && state.hour >= maxHour() - 0.05) setHour(0);
  setPlaying(!state.playing);
});
ui.range.addEventListener('input', () => { setPlaying(false); setHour(Number(ui.range.value)); });
ui.nowBtn.addEventListener('click', () => { setPlaying(false); setHour(state.hourNow); state.follow = true; });
$('probeClose').addEventListener('click', closeProbe);
function setAbout(open) {
  ui.about.hidden = !open;
  $('aboutBtn').setAttribute('aria-expanded', String(open));
  $('aboutQ').setAttribute('aria-expanded', String(open));
  if (open) $('aboutClose').focus({ preventScroll: true });
}
$('aboutBtn').addEventListener('click', () => setAbout(ui.about.hidden));
$('aboutQ').addEventListener('click', () => setAbout(ui.about.hidden));
$('aboutClose').addEventListener('click', () => setAbout(false));
ui.retry.addEventListener('click', () => loadLive(true));

// любое касание интерфейса откладывает автоповорот глобуса
document.addEventListener('pointerdown', () => { idleSince = performance.now(); }, true);
document.addEventListener('keydown', (e) => {
  idleSince = performance.now();
  const tag = (e.target && e.target.tagName) || '';
  if (tag === 'INPUT' || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'Escape' && !ui.about.hidden) { setAbout(false); return; }
  if (e.key === 'Escape' && probe.on) { closeProbe(); return; }
  if (tag === 'BUTTON' && (e.key === ' ' || e.key === 'Enter')) return;
  if (e.key === ' ') { e.preventDefault(); ui.play.click(); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); setPlaying(false); setHour(Math.floor(state.hour) + 1); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); setPlaying(false); setHour(Math.ceil(state.hour) - 1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); setLevel(state.level + 1); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); setLevel(state.level - 1); }
  else if (e.key === '+' || e.key === '=') zoomAt(1.4, view.cx, view.cy);
  else if (e.key === '-') zoomAt(1 / 1.4, view.cx, view.cy);
});

// ───────────────────────── 14. Данные: загрузка и запасной режим ─────────────────────────

let synthT0 = Math.floor(Date.now() / 3600000) * 3600000;
let loadSeq = 0, retryTimer = 0;

// fresh — пришли новые живые данные (обновление раз в час): применяем даже при том же источнике
// absHour — выбранный час в абсолютном времени, посчитанный до замены данных
function useSource(src, fresh = false, absHour = null) {
  const first = !field.ready;
  if (!first && src === state.source && !fresh) return;
  if (absHour == null) absHour = first ? 0 : hourDate(state.hour).getTime();
  if (!first) beginFieldTransition(1400);
  frames.clear();
  pointCache.clear();
  state.source = src;
  const t0 = src === 'live' ? live.times[0] * 1000 : synthT0;
  state.hourNow = clamp((Date.now() - t0) / 3600000, 0, maxHour());
  state.hour = state.follow || first ? state.hourNow : (absHour - t0) / 3600000;
  state.hour = clamp(state.hour, 0, maxHour());
  field.key = '';
  updateField(performance.now());
  uploadField();
  if (first) {
    field.ready = true;
    prewarm();
    P.alphaTarget = 1;
  }
  refreshIsobars(performance.now(), true);
  buildTicks();
  updateTimeUI();
  ui.range.disabled = false;
  if (probe.on) { probe.exact = null; renderProbe(); if (src === 'live') fetchPoint(); }
}

async function loadLive(force = false) {
  const seq = ++loadSeq;
  clearTimeout(retryTimer);
  if (DEMO) {
    setStatus('demo', 'Иллюстративная модель, без сети');
    useSource('synth');
    return;
  }
  // свежий кеш (моложе 30 минут) — сразу, без запроса
  if (!force && !SHOT) {
    const c = await withTimeout(cacheGet(), 700);
    if (seq !== loadSeq) return;
    if (c && c.count === RG.count && Date.now() - c.fetchedAt < CACHE_MS && c.live && c.live.H > 1) {
      const absHour = field.ready ? hourDate(state.hour).getTime() : null;
      live = c.live;
      state.fetchedAt = c.fetchedAt;
      setStatus('live', `Живые данные Open-Meteo · ${fmtClock.format(new Date(c.fetchedAt))}`);
      useSource('live', true, absHour);
      return;
    }
  }
  setStatus('loading', 'Загружаю ветер с Open-Meteo…');
  let soft = 0;
  const ctrl = new AbortController();
  const hard = setTimeout(() => ctrl.abort(), 30000);
  // если сервер молчит 8 секунд — показываем модель, но продолжаем ждать ответ
  soft = setTimeout(() => {
    if (seq !== loadSeq || state.source === 'live') return;
    setStatus('timeout', 'Open-Meteo молчит · иллюстративные данные');
    useSource('synth');
  }, 8000);
  try {
    const json = await requestGrid(ctrl.signal);
    if (seq !== loadSeq) return;
    const absHour = field.ready ? hourDate(state.hour).getTime() : null;
    live = parseGrid(json);
    state.fetchedAt = Date.now();
    if (!SHOT) cachePut({ count: RG.count, fetchedAt: state.fetchedAt, live });
    setStatus('live', `Живые данные Open-Meteo · ${fmtClock.format(new Date())}`);
    useSource('live', true, absHour);
  } catch (e) {
    if (seq !== loadSeq) return;
    if (e && e.status === 429) {
      setStatus('limit', 'Лимит Open-Meteo · иллюстративные данные');
      retryTimer = setTimeout(loadLive, 65000);
    } else {
      setStatus('offline', 'Нет связи · иллюстративные данные');
    }
    if (state.source !== 'live') useSource('synth');
  } finally {
    clearTimeout(soft);
    clearTimeout(hard);
  }
}

// ───────────────────────── 15. Главный цикл ─────────────────────────

let raf = 0, last = 0, acc = 0, idleSince = 0;

function tick(now) {
  raf = requestAnimationFrame(tick);
  const dt = Math.min(100, now - (last || now));
  last = now;

  // перетекание проекций
  if (viewFrom) {
    const t = clamp((now - morph.t0) / morph.dur, 0, 1);
    morph.m = easeInOut(t);
    viewVersion++;
    if (t >= 1) { viewFrom = null; morph.m = 0; }
  }
  // возврат масштаба
  if (tween) {
    const t = easeInOut(clamp((now - tween.t0) / tween.dur, 0, 1));
    view.k = lerp(tween.k, 1, t); view.tx = lerp(tween.tx, 0, t); view.ty = lerp(tween.ty, 0, t);
    if (t >= 1) tween = null;
    bumpView();
  }
  // глобус в покое медленно вращается, как Земля: поверхность уходит на восток
  if (!SHOT && view.p === 1 && !viewFrom && !drag.on && !probe.on && now - idleSince > 8000 && Math.abs(inertia.vl) < 1e-5) {
    view.lam0 = wrapPi(view.lam0 - 0.0045 * (dt / 1000) * Math.min(1, (now - idleSince - 8000) / 3000));
    bumpView();
  }
  // инерция глобуса
  if (!drag.on && (Math.abs(inertia.vl) > 1e-5 || Math.abs(inertia.vp) > 1e-5)) {
    view.lam0 = wrapPi(view.lam0 + inertia.vl * dt);
    view.phi0 = clamp(view.phi0 + inertia.vp * dt, -85 * DEG, 85 * DEG);
    const k = Math.pow(0.0025, dt / 1000);
    inertia.vl *= k; inertia.vp *= k;
    bumpView();
  }
  // воспроизведение прогноза
  if (state.playing && field.ready) {
    let h = state.hour + (dt / 1000) * PLAY_RATE;
    if (h > maxHour()) h = 0;
    setHour(h, false);
  }
  // эффекты слоёв (в режиме съёмки — сразу, без плавности)
  const k = SHOT ? 1 : 1 - Math.pow(0.02, dt / 1000);
  fx.tempA += ((state.temp && state.level === 0 && field.scalOk ? 0.78 : 0) - fx.tempA) * k;
  const isoPrev = fx.isoA;
  fx.isoA += ((state.isobars && state.level === 0 && field.scalOk && !field.from ? 1 : 0) - fx.isoA) * k;
  fx.nightA += ((state.night ? 1 : 0) - fx.nightA) * k;
  P.alpha += (P.alphaTarget - P.alpha) * (SHOT ? 1 : 1 - Math.pow(0.08, dt / 1000));

  if (field.ready) {
    updateField(now);
    if (field.gpuDirty) uploadField();
    if (state.level === 0 && state.isobars) refreshIsobars(now);
  }
  // В режиме съёмки программный рендер медленный: кадр рисуем только при изменениях сцены,
  // хвосты уже прогреты, поэтому неподвижный кадр выглядит так же, как живой.
  // в режиме съёмки не тратим программный рендер на кадр загрузки, пока данные в пути
  const draw = gpuIdle() && (!SHOT || ((field.ready || now > 9000) && shotWants()));
  if (field.ready) acc = Math.min(acc + dt, 50);
  if (draw) {
    if (field.ready) {
      // шаги частиц с фиксированной частотой 60 Гц
      let n = SHOT ? 1 : Math.floor(acc / 16.67);
      acc -= n * 16.67;
      n = Math.min(n, 3);
      if (SHOT && shotPrewarm) { if (shotPrewarm > 1) prewarm(); else stepParticles(P.NH * P.STRIDE + 2); shotPrewarm = 0; }
      else if (n > 0) stepParticles(n);
    }
    render();
    frameFence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
  }

  if ((isoPrev > 0.02) !== (fx.isoA > 0.02) || viewVersion !== placedVersion || Math.abs(isoPrev - fx.isoA) > 0.004) {
    placedVersion = viewVersion;
    placeMarks();
    placeProbe();
    placeGrat();
  }
  qualityCheck(now, draw);
}
let placedVersion = -1;
let frameFence = null;
let shotSig = '', shotView = '', shotField = '', shotFrames = 0, shotPrewarm = 0, shotChanged = 0;
function shotWants() {
  const vsig = `${viewVersion}|${W}x${H}`;
  const fsig = `${state.source}|${state.level}|${state.hour.toFixed(2)}`;
  const sig = `${vsig}|${fsig}|${field.key}|${state.isobars}|${state.temp}|${state.night}|${P.alphaTarget}|${isoVersion}`;
  const now = performance.now();
  if (sig !== shotSig) {
    // смена вида — частицы рождаются заново; смена поля — хвосты перестраиваются
    if (shotView && vsig !== shotView) shotPrewarm = 2;
    else if (shotField && fsig !== shotField && shotPrewarm < 1) shotPrewarm = 1;
    shotSig = sig; shotView = vsig; shotField = fsig; shotFrames = 1; shotChanged = now;
  }
  // пока пользователь тянет карту, промежуточные кадры не рисуем
  if (shotFrames > 0 && now - shotChanged > (drag.on ? 1e9 : 220)) { shotFrames--; return true; }
  return false;
}
function gpuIdle() {
  if (!frameFence) return true;
  const st = gl.getSyncParameter(frameFence, gl.SYNC_STATUS);
  if (st !== gl.SIGNALED) return false;
  gl.deleteSync(frameFence);
  frameFence = null;
  return true;
}

// Если кадры тяжёлые (слабая видеокарта), снижаем плотность пикселей
// Считаем кадры, которые видеокарта действительно успела нарисовать: если их меньше  32 в секунду,
// снижаем плотность пикселей (2 → 1,5 → 1)
function qualityCheck(now, drew) {
  if (SHOT || !field.ready || document.hidden) { quality.lastCheck = now; quality.frames = 0; return; }
  if (drew) quality.frames++;
  if (!quality.lastCheck) quality.lastCheck = now;
  const span = now - quality.lastCheck;
  if (span < 2500) return;
  const fps = (quality.frames * 1000) / span;
  quality.lastCheck = now;
  quality.frames = 0;
  if (fps < 32 && quality.dprCap > 1 && dpr > 1) {
    quality.dprCap = Math.max(1, Math.min(quality.dprCap, dpr) - 0.5);
    resizeTargets();
  }
}

function onResize() {
  resizeTargets();
  derive(view);
  if (viewFrom) derive(viewFrom);
  clampPan();
  derive(view);
  viewVersion++;
  updateTimeUI();
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
  else if (!raf) { last = 0; raf = requestAnimationFrame(tick); }
});

// ───────────────────────── 16. Запуск ─────────────────────────

let landMask = null;

function start() {
  if (!glOk) { $('fatal').hidden = false; return; }
  initGL();
  const pc = P.PW * P.PH;
  $('aboutCount').textContent = `${pc.toLocaleString('ru-RU')} ${plural(pc, ['частица', 'частицы', 'частиц'])}`;
  const rings = decodeLand(LAND_RINGS);
  landMask = buildLandMask(rings);
  setLand(landMask, coastSegments(rings));
  if (isMobile()) { view.p = 1; view.lam0 = (-new Date().getTimezoneOffset() / 60) * 15 * DEG || 30 * DEG; view.phi0 = 28 * DEG; }
  document.querySelectorAll('.proj button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.proj) === view.p)));
  if (isMobile()) ui.hint.textContent = 'Тяните глобус · щелчок — ветер в точке';
  resizeTargets();
  derive(view);
  updateLegend();
  buildTicks();
  updateTimeUI();
  ui.range.disabled = true;
  window.addEventListener('resize', onResize);
  raf = requestAnimationFrame(tick);
  loadLive();
  // данные устаревают — раз в час обновляем, если вкладка открыта
  setInterval(() => { if (!document.hidden && state.source === 'live' && Date.now() - state.fetchedAt > 3600000) loadLive(true); }, 300000);
}

try { start(); }
catch (err) {
  $('fatal').hidden = false;
  $('fatal').querySelector('p').textContent = 'Не удалось запустить отрисовку: ' + (err && err.message ? err.message.split('\n')[0] : 'ошибка WebGL');
}

})();
