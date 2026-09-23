/* ================================================================
   Штурман · трасса
   Спецучасток «Тёмный бор»: геометрия, рельеф, препятствия и стенограмма.
   Чистый JS без three.js — модуль можно гонять и в Node.
   Система координат физики: плоскость (X, Y), «математическая» ориентация:
   курс φ, вперёд = (cos φ, sin φ), φ растёт при повороте налево.
   В мире three.js: x = X, z = −Y, высота — y.
   ================================================================ */
(function (R) {
  'use strict';

  // ---------- мелкие утилиты ----------
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // значение-шум на решётке с гладкой интерполяцией
  function makeNoise(seed) {
    const r = rng(seed), p = new Uint8Array(512), g = new Float32Array(256);
    for (let i = 0; i < 256; i++) { p[i] = i; g[i] = r() * 2 - 1; }
    for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; const t = p[i]; p[i] = p[j]; p[j] = t; }
    for (let i = 0; i < 256; i++) p[i + 256] = p[i];
    const h = (x, y) => g[p[p[x & 255] + (y & 255)]];
    function n2(x, y) {
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
      const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
      return lerp(lerp(a, b, u), lerp(c, d, u), v);
    }
    function fbm(x, y, oct) {
      let s = 0, amp = 0.5, f = 1, norm = 0;
      for (let i = 0; i < oct; i++) { s += amp * n2(x * f + i * 17.3, y * f - i * 9.1); norm += amp; amp *= 0.5; f *= 2.03; }
      return s / norm;
    }
    return { n2, fbm };
  }
  R.util = { clamp, lerp, smooth, rng, makeNoise };

  // ---------- сценарий спецучастка ----------
  // ['S', длина] — прямая; ['C', 1 лево / −1 право, радиус, угол°, радиус на выходе?, 'rock' — камень внутри]
  // ['J', 'jump'|'crest', доля прямой] — трамплин или гребень на предыдущей прямой; ['K'] — контрольная точка на прямой
  const SCRIPT = [
    ['S', 150],
    ['C', 1, 115, 38],
    ['S', 95],
    ['C', -1, 68, 58],
    ['S', 45],
    ['C', 1, 62, 52],
    ['S', 170], ['J', 'crest', 0.55],
    ['C', -1, 40, 72, 40, 'rock'],
    ['S', 34],
    ['C', 1, 42, 70],
    ['S', 150], ['J', 'jump', 0.5],
    ['C', -1, 27, 88],
    ['S', 18],
    ['C', 1, 70, 44],
    ['S', 230], ['K'],
    ['C', 1, 190, 28],
    ['S', 85],
    ['C', -1, 95, 108],
    ['S', 70],
    ['C', 1, 12, 168],
    ['S', 110], ['J', 'crest', 0.5],
    ['C', -1, 44, 62],
    ['S', 30],
    ['C', 1, 46, 78, 27],
    ['S', 170], ['J', 'jump', 0.45],
    ['C', -1, 64, 72],
    ['S', 120], ['K'],
    ['C', 1, 105, 48],
    ['S', 48],
    ['C', -1, 112, 46],
    ['S', 130],
    ['C', -1, 24, 92, 24, 'rock'],
    ['S', 80],
    ['C', 1, 55, 70, 95],
    ['S', 210], ['J', 'jump', 0.55],
    ['C', 1, 38, 68],
    ['S', 40],
    ['C', -1, 40, 82],
    ['S', 140], ['K'],
    ['C', -1, 72, 118],
    ['S', 65],
    ['C', 1, 170, 34],
    ['S', 160],
  ];

  const HALF_W = 4.1;          // полуширина гравийной дороги, м
  const SHOULDER = 1.4;        // обочина
  const DS = 1;                // шаг сэмплов по оси трассы, м

  function build() {
    const noise = makeNoise(1190);
    const detailNoise = makeNoise(7);
    const rand = rng(119);

    // 1) кривизна по сценарию
    const kappa = [];
    const marks = [];  // особые места на прямых
    let straightStart = 0;
    for (const item of SCRIPT) {
      if (item[0] === 'S') {
        straightStart = kappa.length;
        for (let i = 0; i < item[1]; i++) kappa.push(0);
      } else if (item[0] === 'J') {
        const len = kappa.length - straightStart;
        marks.push({ type: item[1], s: straightStart + Math.round(len * item[2]) });
      } else if (item[0] === 'K') {
        const len = kappa.length - straightStart;
        marks.push({ type: 'cp', s: straightStart + Math.round(len * 0.5) });
      } else if (item[0] === 'C') {
        const [, dir, r1, ang, r2raw, extra] = item;
        const r2 = r2raw || r1;
        const A = ang * Math.PI / 180;
        const rm = (r1 + r2) / 2;
        const arc = A * rm;
        const lt = Math.min(22, arc * 0.28);           // переходные кривые
        const core = Math.max(4, arc - lt);
        const k1 = 1 / r1, k2 = 1 / r2;
        const s0 = kappa.length;
        for (let i = 0; i < lt; i++) kappa.push(dir * k1 * (i + 0.5) / lt);
        for (let i = 0; i < core; i++) kappa.push(dir * lerp(k1, k2, (i + 0.5) / core));
        for (let i = 0; i < lt; i++) kappa.push(dir * k2 * (1 - (i + 0.5) / lt));
        if (extra === 'rock') marks.push({ type: 'rock', s: Math.round((s0 + kappa.length) / 2), dir });
      }
    }
    // поправка: суммарный угол каждого поворота — точно по сценарию не важен, важна гладкость
    const N = kappa.length;
    const X = new Float32Array(N), Y = new Float32Array(N), PH = new Float32Array(N), K = new Float32Array(N);
    let x = 0, y = 0, ph = Math.PI * 0.08;
    for (let i = 0; i < N; i++) {
      K[i] = kappa[i];
      X[i] = x; Y[i] = y; PH[i] = ph;
      const phMid = ph + kappa[i] * DS * 0.5;
      x += Math.cos(phMid) * DS; y += Math.sin(phMid) * DS;
      ph += kappa[i] * DS;
    }

    // 2) высоты: плавные холмы + трамплины и гребни
    const base = (px, py) => 16 * noise.fbm(px / 520 + 3.1, py / 520 - 1.7, 3) + 5 * noise.fbm(px / 160, py / 160, 2);
    const raw = new Float32Array(N);
    for (let i = 0; i < N; i++) raw[i] = base(X[i], Y[i]);
    const H = new Float32Array(N);
    const win = 45;
    for (let i = 0; i < N; i++) {
      let s = 0, c = 0;
      for (let j = Math.max(0, i - win); j <= Math.min(N - 1, i + win); j += 3) { s += raw[j]; c++; }
      H[i] = s / c;
    }
    // ограничим уклон дороги
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 1; i < N; i++) H[i] = clamp(H[i], H[i - 1] - 0.09, H[i - 1] + 0.09);
      for (let i = N - 2; i >= 0; i--) H[i] = clamp(H[i], H[i + 1] - 0.09, H[i + 1] + 0.09);
    }
    const feature = new Float32Array(N);
    for (const m of marks) {
      if (m.type === 'jump') {
        // разгонный подъём → кромка → провал и длинная посадочная горка
        for (let d = -26; d <= 60; d++) {
          const i = m.s + d; if (i < 0 || i >= N) continue;
          let f;
          if (d <= 0) f = 1.45 * (0.5 - 0.5 * Math.cos(Math.PI * (d + 26) / 26));
          else if (d <= 12) f = 1.45 - 3.35 * (0.5 - 0.5 * Math.cos(Math.PI * d / 12));
          else f = -1.9 * (0.5 + 0.5 * Math.cos(Math.PI * (d - 12) / 48));
          feature[i] += f;
        }
      } else if (m.type === 'crest') {
        for (let d = -30; d <= 30; d++) {
          const i = m.s + d; if (i < 0 || i >= N) continue;
          feature[i] += 1.9 * (0.5 + 0.5 * Math.cos(Math.PI * d / 30));
        }
      }
    }
    for (let i = 0; i < N; i++) H[i] += feature[i];

    // 3) пространственный хеш сэмплов оси (для поиска ближайшей точки дороги)
    const CELL = 24;
    const hash = new Map();
    const key = (cx, cy) => cx * 73856093 ^ cy * 19349663;
    for (let i = 0; i < N; i += 3) {
      const k = key(Math.floor(X[i] / CELL), Math.floor(Y[i] / CELL));
      let arr = hash.get(k); if (!arr) hash.set(k, arr = []); arr.push(i);
    }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < N; i++) { minX = Math.min(minX, X[i]); maxX = Math.max(maxX, X[i]); minY = Math.min(minY, Y[i]); maxY = Math.max(maxY, Y[i]); }

    // проекция точки на ось вблизи индекса i: {idx, t, lat, s}
    function projectNear(px, py, i0, span) {
      let best = -1, bd = Infinity;
      const a = Math.max(0, i0 - span), b = Math.min(N - 1, i0 + span);
      for (let i = a; i <= b; i++) {
        const dx = px - X[i], dy = py - Y[i], d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = i; }
      }
      return refine(px, py, best);
    }
    function refine(px, py, i) {
      const j = i < N - 1 ? i : i - 1;
      const ax = X[j], ay = Y[j], bx = X[j + 1], by = Y[j + 1];
      const vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy;
      let t = ((px - ax) * vx + (py - ay) * vy) / L2;
      t = clamp(t, -0.5, 1.5);
      const cx = ax + vx * t, cy = ay + vy * t;
      const L = Math.sqrt(L2), lx = -vy / L, ly = vx / L;   // единичный вектор «влево»
      const lat = (px - cx) * lx + (py - cy) * ly;
      const s = clamp(j + t, 0, N - 1);
      return { idx: Math.round(s), s, lat, dist: Math.abs(lat) };
    }
    // глобальный поиск ближайшей точки оси (радиус ≈ CELL)
    function nearest(px, py) {
      const cx = Math.floor(px / CELL), cy = Math.floor(py / CELL);
      let best = -1, bd = Infinity;
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
        const arr = hash.get(key(cx + ox, cy + oy)); if (!arr) continue;
        for (const i of arr) { const dx = px - X[i], dy = py - Y[i], d = dx * dx + dy * dy; if (d < bd) { bd = d; best = i; } }
      }
      if (best < 0) return null;
      return projectNear(px, py, best, 3);
    }
    const roadH = (s) => {
      const i = clamp(Math.floor(s), 0, N - 2), t = clamp(s - i, 0, 1);
      return H[i] + (H[i + 1] - H[i]) * t;
    };
    // высота естественного рельефа (без дороги)
    const natural = (px, py) => base(px, py) + 1.6 * detailNoise.fbm(px / 38, py / 38, 3);
    // итоговая высота земли; proj — результат проекции на ось (может быть null — далеко от дороги)
    function groundAt(px, py, proj, forMesh) {
      const nat = natural(px, py);
      if (!proj) return nat;
      const d = proj.dist;
      if (d > HALF_W + 26) return nat;
      const rh = roadH(proj.s);
      let road = rh;
      if (d > HALF_W) {
        // кювет за обочиной
        const e = d - HALF_W;
        road = rh - 0.12 * smooth(0, SHOULDER, e) - 0.35 * Math.sin(Math.PI * clamp((e - SHOULDER * 0.6) / 3.2, 0, 1));
      } else if (forMesh) road = rh - 0.28;
      const w = smooth(HALF_W + 3.2, HALF_W + 24, d);
      return lerp(road, nat, w);
    }
    // высота для физики: подсказка idx ускоряет поиск
    function heightAt(px, py, hintIdx) {
      const proj = hintIdx != null ? projectNear(px, py, hintIdx, 30) : nearest(px, py);
      if (proj && proj.dist > HALF_W + 40) return { h: natural(px, py), proj: null };
      return { h: groundAt(px, py, proj, false), proj };
    }

    // 4) контрольные точки, старт, финиш
    const startS = 40;
    const finishS = N - 120;
    const cps = marks.filter((m) => m.type === 'cp').map((m) => m.s);

    // 5) препятствия: камни у апексов «не резать», деревья, пни
    const obstacles = [];   // коллайдеры {x, y, r, kind}
    const trees = [];       // визуальные деревья {x, y, h, kind, s, lat, rot}
    const props = [];       // мелочь без столкновений
    const leftOf = (i) => [-Math.sin(PH[i]), Math.cos(PH[i])];
    for (const m of marks) {
      if (m.type !== 'rock') continue;
      const [lx, ly] = leftOf(m.s);
      for (let k = -1; k <= 1; k++) {
        const i = clamp(m.s + k * 5, 0, N - 1);
        const [llx, lly] = leftOf(i);
        const off = (HALF_W + 1.25 + rand() * 0.5) * m.dir;   // внутренняя сторона поворота
        const r = 0.75 + rand() * 0.35;
        obstacles.push({ x: X[i] + llx * off, y: Y[i] + lly * off, r, kind: 'rock', s: i });
      }
      void lx; void ly;
    }
    // грубый хеш для «дальнего» поиска ближайшей точки оси (радиус ≥ 64 м)
    const C2 = 64, hash2 = new Map();
    for (let i = 0; i < N; i += 4) {
      const k = key(Math.floor(X[i] / C2), Math.floor(Y[i] / C2));
      let arr = hash2.get(k); if (!arr) hash2.set(k, arr = []); arr.push(i);
    }
    function nearestFar(px, py) {
      const cx = Math.floor(px / C2), cy = Math.floor(py / C2);
      let best = -1, bd = Infinity;
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
        const arr = hash2.get(key(cx + ox, cy + oy)); if (!arr) continue;
        for (const i of arr) { const dx = px - X[i], dy = py - Y[i], d = dx * dx + dy * dy; if (d < bd) { bd = d; best = i; } }
      }
      return best < 0 ? null : { idx: best, d: Math.sqrt(bd) };
    }
    const rocks = obstacles.slice();
    // деревья: идём вдоль трассы, по бокам — джиттер; каждую точку «владеет» ближайший участок оси
    const place = (px, py, kind, i0) => {
      const far = nearestFar(px, py);
      if (far && Math.abs(far.idx - i0) > 14 && far.d < 110) return;       // точка ближе к другому участку
      const pr = far && far.d < 30 ? nearest(px, py) : null;
      const d = pr ? pr.dist : far ? far.d : 999;
      if (d < HALF_W + SHOULDER + 2.2) return;
      for (const o of rocks) { const dx = o.x - px, dy = o.y - py; if (dx * dx + dy * dy < 9) return; }
      const tr = { x: px, y: py, kind, rot: rand() * 6.283, sc: 0.75 + rand() * 0.6, s: pr ? pr.s : far ? far.idx : -1, d };
      trees.push(tr);
      if (d < HALF_W + 30) obstacles.push({ x: px, y: py, r: kind === 'birch' ? 0.28 : 0.42, kind: 'tree', s: tr.s });
    };
    const step = 4.6;
    for (let i = 0; i < N; i += step) {
      const ii = Math.floor(i), [lx, ly] = leftOf(ii);
      for (let off = HALF_W + SHOULDER + 1.5; off < 132; off += step) {
        for (const side of [-1, 1]) {
          const o = side * (off + (rand() - 0.5) * step * 0.9);
          const along = (rand() - 0.5) * step * 0.9;
          const px = X[ii] + lx * o + Math.cos(PH[ii]) * along, py = Y[ii] + ly * o + Math.sin(PH[ii]) * along;
          const d = Math.abs(o);
          const p = d < 30 ? 0.62 : d < 60 ? 0.36 : d < 96 ? 0.22 : 0.16;
          if (rand() > p) continue;
          const kr = rand();
          place(px, py, kr < 0.58 ? 'spruce' : kr < 0.84 ? 'pine' : 'birch', ii);
        }
      }
    }
    // кусты, пни, валуны у дороги (декор; валуны покрупнее — коллайдеры)
    for (let i = 20; i < N - 20; i += 6) {
      for (const side of [-1, 1]) {
        if (rand() > 0.55) continue;
        const [lx, ly] = leftOf(i);
        const off = side * (HALF_W + SHOULDER + 1.4 + rand() * 7);
        const px = X[i] + lx * off, py = Y[i] + ly * off;
        const pr = nearest(px, py);
        if (!pr || pr.dist < HALF_W + SHOULDER + 0.9) continue;
        const kr = rand();
        const kind = kr < 0.55 ? 'bush' : kr < 0.75 ? 'fern' : kr < 0.9 ? 'stump' : 'boulder';
        const sc = 0.6 + rand() * 0.8;
        props.push({ x: px, y: py, kind, sc, rot: rand() * 6.283 });
        if (kind === 'boulder' && sc > 0.9) obstacles.push({ x: px, y: py, r: 0.55 * sc, kind: 'rock', s: i });
        if (kind === 'stump') obstacles.push({ x: px, y: py, r: 0.3, kind: 'stump', s: i });
      }
    }
    // хеш коллайдеров
    const OC = 8, ohash = new Map();
    for (const o of obstacles) {
      const k = key(Math.floor(o.x / OC), Math.floor(o.y / OC));
      let arr = ohash.get(k); if (!arr) ohash.set(k, arr = []); arr.push(o);
    }
    function obstaclesNear(px, py, out) {
      out.length = 0;
      const cx = Math.floor(px / OC), cy = Math.floor(py / OC);
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
        const arr = ohash.get(key(cx + ox, cy + oy)); if (arr) for (const o of arr) out.push(o);
      }
      return out;
    }

    const T = {
      N, DS, X, Y, H, PH, K, HALF_W, SHOULDER, marks, startS, finishS, cps,
      obstacles, trees, props, bounds: { minX, maxX, minY, maxY },
      nearest, projectNear, heightAt, groundAt, natural, roadH, obstaclesNear,
      leftOf,
    };
    T.notes = paceNotes(T);
    return T;
  }

  // ================================================================
  //  Стенограмма: движок читает геометрию оси, а не сценарий
  // ================================================================
  const SEV_WORD = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть'];
  const DIST_STEPS = [30, 40, 50, 70, 100, 120, 150, 200, 250, 300, 400, 500];
  const DIST_WORD = { 30: 'тридцать', 40: 'сорок', 50: 'пятьдесят', 70: 'семьдесят', 100: 'сто', 120: 'сто двадцать', 150: 'сто пятьдесят', 200: 'двести', 250: 'двести пятьдесят', 300: 'триста', 400: 'четыреста', 500: 'пятьсот' };

  function paceNotes(T) {
    const { N, K, H, HALF_W: HW } = T;
    // сглаженная кривизна
    const ks = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      let s = 0, c = 0;
      for (let j = Math.max(0, i - 5); j <= Math.min(N - 1, i + 5); j++) { s += K[j]; c++; }
      ks[i] = s / c;
    }
    // участки поворотов
    const ON = 1 / 320;
    const regions = [];
    let cur = null;
    for (let i = 0; i < N; i++) {
      const k = ks[i], dir = Math.sign(k);
      if (Math.abs(k) > ON) {
        if (cur && cur.dir === dir && i - cur.e < 14) cur.e = i;
        else { if (cur) regions.push(cur); cur = { b: i, e: i, dir }; }
      }
    }
    if (cur) regions.push(cur);
    const notes = [];
    for (const r of regions) {
      let ang = 0, kmax = 0, k1 = 0, k2 = 0;
      const len = r.e - r.b + 1;
      for (let i = r.b; i <= r.e; i++) {
        ang += ks[i];
        kmax = Math.max(kmax, Math.abs(ks[i]));
      }
      ang = Math.abs(ang) * 180 / Math.PI;
      if (ang < 14) continue;
      // затягивается / открывается: сравниваем кривизну второй и первой трети
      const third = Math.max(1, Math.floor(len / 3));
      for (let i = r.b; i < r.b + third; i++) k1 += Math.abs(ks[i]);
      for (let i = r.e - third + 1; i <= r.e; i++) k2 += Math.abs(ks[i]);
      const Rmin = 1 / kmax;
      let sev;
      if (Rmin <= 15 && ang > 120) sev = 0;           // шпилька
      else if (Rmin <= 21) sev = 1;
      else if (Rmin <= 31) sev = 2;
      else if (Rmin <= 49) sev = 3;
      else if (Rmin <= 78) sev = 4;
      else if (Rmin <= 125) sev = 5;
      else if (Rmin <= 260) sev = 6;
      else continue;
      const mods = [];
      if (ang > 100 && sev !== 0) mods.push('длинный');
      if (k2 > k1 * 1.35 && len > 30) mods.push('затяг');
      else if (k1 > k2 * 1.35 && len > 30) mods.push('открывается');
      // «не резать» — если на внутренней стороне у апекса есть препятствие
      const apex = Math.round((r.b + r.e) / 2);
      let danger = false;
      for (const o of T.obstacles) {
        if (o.kind !== 'rock' || o.s < r.b - 6 || o.s > r.e + 6) continue;
        const pr = T.projectNear(o.x, o.y, o.s, 12);
        if (Math.sign(pr.lat) === r.dir && pr.dist < HW + 2.6) { danger = true; break; }
      }
      if (danger) mods.push('не резать');
      // безопасная скорость (для автопилота и событий «перелетел поворот»)
      const vsafe = Math.sqrt(9.81 * 0.95 * Rmin) * 1.08;
      notes.push({ kind: 'corner', s0: r.b, s1: r.e, apex, dir: r.dir, sev, ang, Rmin, mods, vsafe });
    }
    // прыжки и гребни — по второй разности высоты: резкий перелом профиля вниз
    const D2 = new Float32Array(N);
    for (let i = 10; i < N - 10; i++) D2[i] = 2 * H[i] - H[i - 10] - H[i + 10];
    for (let i = 12; i < N - 12; i++) {
      if (D2[i] < 0.7 || D2[i] < D2[i - 1] || D2[i] < D2[i + 1]) continue;
      const drop = H[i + 10] - H[i];
      if (D2[i] > 1.6 && drop < -1.1) notes.push({ kind: 'jump', s0: i - 6, s1: i + 6, apex: i, big: drop < -2.2 });
      else notes.push({ kind: 'crest', s0: i - 6, s1: i + 6, apex: i });
      i += 30;
    }
    notes.push({ kind: 'finish', s0: T.finishS, s1: T.finishS, apex: T.finishS });
    notes.sort((a, b) => a.s0 - b.s0);
    // «осторожно» перед крутым поворотом после длинной прямой; дистанции и связки
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i], prev = notes[i - 1], next = notes[i + 1];
      const gapPrev = prev ? n.s0 - prev.s1 : 999;
      if (n.kind === 'corner' && n.sev <= 2 && gapPrev > 120) n.caution = true;
      n.gap = next ? Math.max(0, next.s0 - n.s1) : 0;
      n.linkedNext = !!next && n.gap < 26;
      n.idx = i;
    }
    for (const n of notes) n.words = noteWords(n);
    return notes;
  }

  function distWord(m) {
    let best = DIST_STEPS[0];
    for (const d of DIST_STEPS) if (Math.abs(d - m) < Math.abs(best - m)) best = d;
    return { m: best, w: DIST_WORD[best] };
  }
  // слова для голоса и короткая запись для блокнота
  function noteWords(n) {
    let say = '', short = '';
    if (n.kind === 'corner') {
      const dirW = n.dir > 0 ? 'лево' : 'право';
      const dirS = n.dir > 0 ? 'Л' : 'П';
      if (n.sev === 0) { say = dirW + ' шпилька'; short = dirS + ' шп'; }
      else { say = dirW + ' ' + SEV_WORD[n.sev]; short = dirS + n.sev; }
      if (n.caution) say = 'осторожно, ' + say;
      if (n.mods.length) { say += ' ' + n.mods.join(' '); short += ' ' + n.mods.map((m) => m === 'не резать' ? 'не резать' : m === 'длинный' ? 'длин.' : m).join(' '); }
    } else if (n.kind === 'jump') { say = n.big ? 'большой трамплин' : 'трамплин'; short = n.big ? 'трамплин!' : 'трамплин'; }
    else if (n.kind === 'crest') { say = 'гребень'; short = 'гребень'; }
    else if (n.kind === 'finish') { say = 'финиш'; short = 'финиш'; }
    // связанная форма: «в правый три», «в левую шпильку»
    let linked = say;
    if (n.kind === 'corner') {
      const adj = n.dir > 0 ? 'левый' : 'правый';
      linked = n.sev === 0 ? 'в ' + (n.dir > 0 ? 'левую' : 'правую') + ' шпильку' : 'в ' + adj + ' ' + SEV_WORD[n.sev];
      if (n.mods.length) linked += ' ' + n.mods.join(' ');
    }
    const dist = n.gap >= 26 ? distWord(n.gap) : null;
    return { say, linked, short, dist };
  }

  // Сборка «порции» стенограммы начиная с заметки i: близкие заметки читаются вместе
  // → { text, items:[idx…], next }  пример: «лево четыре, сто, в правый три не резать»
  function chunkFrom(T, i) {
    const notes = T.notes, items = [i];
    let text = notes[i].words.say;
    let j = i;
    while (items.length < 3 && j + 1 < notes.length) {
      const a = notes[j], b = notes[j + 1];
      if (b.kind === 'finish' && a.gap > 60) break;
      if (a.gap > 105 || (b.s0 - notes[i].s0) > 230) break;
      text += a.linkedNext ? ' ' + b.words.linked : ', ' + a.words.dist.w + ', ' + b.words.linked;
      items.push(j + 1); j++;
    }
    const last = notes[j];
    if (last.words.dist && j + 1 < notes.length && notes[j + 1].kind !== 'finish') text += ', ' + last.words.dist.w;
    return { text, items, next: j + 1 };
  }

  R.buildTrack = build;
  R.chunkFrom = chunkFrom;
})(typeof window !== 'undefined' ? (window.R = window.R || {}) : (globalThis.R = globalThis.R || {}));
