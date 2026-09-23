'use strict';
/* Шань-шуй — бесконечный свиток тушью.
   Мир рисуется фрагментами (чанками) по мере прокрутки. Каждый фрагмент детерминирован:
   одни и те же координаты и номер свитка всегда дают один и тот же рисунок. */
(() => {
  const $ = (s) => document.querySelector(s);
  const canvas = $('#scene');
  const ctx = canvas.getContext('2d');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SHOT = !!window.__SHOT__; // headless-съёмка: без вступительной анимации

  /* ================= 1. Случайность и шум ================= */
  const TAU = Math.PI * 2;
  const U32 = 4294967296;
  function mix(h) {
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return h >>> 0;
  }
  function hash(a, b = 0, c = 0, d = 0) {
    let h = mix((a | 0) + 0x9e3779b9);
    h = mix(h ^ ((b | 0) + 0x7f4a7c15));
    h = mix(h ^ ((c | 0) + 0x1b873593));
    return mix(h ^ ((d | 0) + 0x6b43a9b5));
  }
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / U32;
    };
  }
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const smooth = (t) => t * t * (3 - 2 * t);
  const h01 = (a, b, c, d) => hash(a, b, c, d) / U32;
  function noise1(x, s) {
    const i = Math.floor(x);
    return lerp(h01(i, s), h01(i + 1, s), smooth(x - i));
  }
  function noise2(x, y, s) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const u = smooth(x - ix), v = smooth(y - iy);
    return lerp(
      lerp(h01(ix, iy, s), h01(ix + 1, iy, s), u),
      lerp(h01(ix, iy + 1, s), h01(ix + 1, iy + 1, s), u), v);
  }
  function pnoise(x, y, P, s) { // периодический шум для бесшовной текстуры
    const m = (a) => ((a % P) + P) % P;
    const ix = Math.floor(x), iy = Math.floor(y);
    const u = smooth(x - ix), v = smooth(y - iy);
    return lerp(
      lerp(h01(m(ix), m(iy), s), h01(m(ix + 1), m(iy), s), u),
      lerp(h01(m(ix), m(iy + 1), s), h01(m(ix + 1), m(iy + 1), s), u), v);
  }
  function fbm1(x, s, oct = 4) {
    let v = 0, amp = 0.5, f = 1, n = 0;
    for (let i = 0; i < oct; i++) { v += amp * noise1(x * f, s + i * 131); n += amp; amp *= 0.5; f *= 2.07; }
    return v / n;
  }

  /* ================= 2. Палитра ================= */
  const PAPER_CSS = 'rgb(237,228,207)';
  const paper = (a) => `rgba(237,228,207,${a})`;
  const INKC = [30, 26, 22];
  const ink = (a) => `rgba(30,26,22,${a})`;
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

  const SEASONS = {
    spring: {
      far: [84, 104, 112],
      wash: [[124, 166, 120, 0.17], [150, 178, 126, 0.10], [196, 164, 118, 0.07]],
      leaves: [[204, 120, 126, 0.8], [226, 160, 164, 0.74], [128, 160, 104, 0.64], [44, 44, 34, 0.72]],
      pine: [52, 70, 58], willow: [110, 146, 92], bare: 0.05, snow: false, blossom: true, reed: [118, 140, 96],
    },
    summer: {
      far: [62, 94, 108],
      wash: [[52, 104, 116, 0.32], [82, 134, 102, 0.22], [178, 138, 86, 0.16]],
      leaves: [[32, 44, 34, 0.84], [56, 86, 62, 0.74], [40, 38, 30, 0.86], [66, 110, 92, 0.62]],
      pine: [34, 48, 40], willow: [78, 116, 84], bare: 0, snow: false, reed: [92, 118, 82],
    },
    autumn: {
      far: [98, 90, 86],
      wash: [[188, 136, 80, 0.24], [174, 98, 64, 0.14], [182, 148, 98, 0.10]],
      leaves: [[168, 58, 38, 0.82], [194, 122, 54, 0.78], [120, 72, 44, 0.74], [36, 30, 26, 0.84]],
      pine: [40, 44, 38], willow: [168, 146, 84], bare: 0.25, snow: false, reed: [166, 140, 90],
    },
    winter: {
      far: [86, 96, 112],
      wash: null,
      leaves: [[36, 32, 30, 0.8]],
      pine: [30, 36, 40], willow: [90, 90, 88], bare: 1, snow: true, reed: [112, 108, 100],
    },
  };

  // Время суток — это «небесная» заливка под фрагментами, солнце или луна и общий тон
  const TIMES = {
    dawn: { sky: [[214, 146, 128, 0.22], [238, 200, 172, 0.08]], tint: [255, 239, 230, 0.35], sun: { r: 30, x: 0.24, y: 0.5, col: [214, 96, 76], a: 0.55 } },
    day: { sky: null, tint: null, sun: null },
    dusk: { sky: [[188, 112, 68, 0.3], [216, 150, 96, 0.14]], tint: [250, 224, 196, 0.45], sun: { r: 44, x: 0.3, y: 0.55, col: [182, 48, 34], a: 0.8 } },
    night: { sky: [[40, 46, 66, 0.5], [60, 66, 86, 0.26]], tint: [170, 174, 196, 0.6], moon: { r: 28, x: 0.25, y: 0.21 } },
  };

  /* ================= 3. Стихи эпохи Тан (переводы — Opus 5.5) ================= */
  const POEMS = [
    { zh: ['千山鸟飞绝', '万径人踪灭', '孤舟蓑笠翁', '独钓寒江雪'], author: 'Лю Цзунъюань', title: 'Снег на реке',
      ru: ['Над тысячей гор не летают птицы,', 'на тысячах троп не осталось следов.', 'В лодке старик в соломенном плаще', 'один удит в снегу на студёной реке.'] },
    { zh: ['空山不见人', '但闻人语响', '返景入深林', '复照青苔上'], author: 'Ван Вэй', title: 'Оленья изгородь',
      ru: ['В пустых горах никого не видно,', 'лишь где-то слышатся голоса.', 'Закатный луч проникает в чащу', 'и снова ложится на зелёный мох.'] },
    { zh: ['众鸟高飞尽', '孤云独去闲', '相看两不厌', '只有敬亭山'], author: 'Ли Бо', title: 'Один сижу у горы Цзинтин',
      ru: ['Птицы ушли в вышину,', 'одинокое облако уплыло не спеша.', 'Смотрим друг на друга и не устаём —', 'только я и гора Цзинтин.'] },
    { zh: ['白日依山尽', '黄河入海流', '欲穷千里目', '更上一层楼'], author: 'Ван Чжихуань', title: 'На башне Аистов',
      ru: ['Белое солнце за горы уходит,', 'Жёлтая река течёт в море.', 'Чтобы взглядом объять тысячу ли,', 'поднимись ещё на один ярус.'] },
    { zh: ['春眠不觉晓', '处处闻啼鸟', '夜来风雨声', '花落知多少'], author: 'Мэн Хаожань', title: 'Весеннее утро',
      ru: ['Весной так спится — не заметил рассвета,', 'всюду слышно пение птиц.', 'Ночью шумели ветер и дождь —', 'сколько же цветов облетело?'] },
    { zh: ['远上寒山石径斜', '白云生处有人家', '停车坐爱枫林晚', '霜叶红于二月花'], author: 'Ду Му', title: 'Иду в горах',
      ru: ['Каменная тропа вьётся в холодные горы,', 'там, где рождаются облака, — чей-то дом.', 'Останавливаю повозку: мил мне вечерний клёновый лес —', 'листья в инее алее весенних цветов.'] },
    { zh: ['床前明月光', '疑是地上霜', '举头望明月', '低头思故乡'], author: 'Ли Бо', title: 'Думы тихой ночью',
      ru: ['У постели — лунный свет,', 'будто иней лёг на землю.', 'Подниму глаза — луна,', 'опущу — и думаю о доме.'] },
  ];
  const POOLS = { spring: [4, 1, 3], summer: [1, 3, 2], autumn: [5, 2, 6], winter: [0, 6] };

  const SHORT = /(^|[\s«(—])(в|к|с|и|а|о|у|я|но|на|по|за|от|до|из|не|ни|же|ли|во|ко|со|об)\s/giu;
  const typo = (s) => s.replace(SHORT, '$1$2 ').replace(SHORT, '$1$2 ');

  /* ================= 4. Мир ================= */
  const WH = 1000;          // высота живописи в единицах мира
  const CW = 480;           // ширина фрагмента
  const PAD = 170;          // запас по краям фрагмента против швов
  const TITLE_W = 600;      // заглавный лист
  const SEP_W = 36;         // шёлковая вставка между заглавием и живописью
  const HEAD_W = 118;       // шёлковая обёртка у начала свитка
  const PAINT_END = -(TITLE_W + SEP_W);
  const SCENE_W = 1500;
  const SCROLL_CM = 32;     // физическая высота свитка — для счётчика «развёрнуто»

  const state = {
    seed: 0,
    season: 'summer',
    time: 'day',
    auto: !reduceMotion,
    viewRight: 0,
    vel: 0,
    lastInput: -1e9,
    stamping: false,
    seals: [],
    intro: reduceMotion ? 1 : 0,
    introFrom: 0,
    introStart: 0,
    ready: false,
    fade: null,
    fadeT: 0,
    pointer: null,
  };

  /* ---------- Сцены: крупный ритм свитка ---------- */
  const TYPES = ['massif', 'karst', 'lake', 'village', 'gorge'];
  let typeMemo = [];
  const sceneMemo = new Map();

  function sceneType(i) {
    while (typeMemo.length <= i) {
      const k = typeMemo.length;
      if (k === 0) { typeMemo.push('massif'); continue; }
      const prev = typeMemo[k - 1];
      let t = TYPES[hash(state.seed, k, 3) % TYPES.length];
      if (t === prev) t = TYPES[(TYPES.indexOf(t) + 1 + (hash(state.seed, k, 4) % (TYPES.length - 1))) % TYPES.length];
      typeMemo.push(t);
    }
    return typeMemo[i];
  }

  // Высота гребня горы (внешнее «кольцо») в точке x — та же формула, что и в drawMount
  function ridgeY(f, x) {
    const t = (x - f.x) / f.w;
    if (t < -0.5 || t > 0.5) return null;
    const r = rng(f.seed);
    const ns = r() * 900;
    const hoff = r() * f.h * 0.016;
    const a = t * Math.PI;
    const c = Math.pow(Math.max(0, Math.cos(a)), f.sharp);
    const nz = 0.3 + 0.9 * noise2(a * f.rough + ns, ns * 0.37, 3);
    return f.base - c * nz * f.h + hoff;
  }
  // Водопад ставим только туда, где за ним есть склон, и начинаем чуть ниже гребня
  function placeFall(out, x0, spread, z, o) {
    let best = null;
    for (let k = 0; k <= 8; k++) {
      const x = x0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (spread / 4);
      let top = Infinity;
      for (const f of out) {
        if (f.kind !== 'mount' || f.far || f.z > z) continue;
        const y = ridgeY(f, x);
        if (y != null && y < top) top = y;
      }
      if (top < 560) { best = { x, top }; break; }
    }
    if (!best) return;
    out.push(Object.assign({ kind: 'fall', z, x: best.x, d: 0, top: best.top + 34, bottom: 728, half: 110 }, o));
  }

  function buildScene(i) {
    const R = PAINT_END - i * SCENE_W;
    const r = rng(hash(state.seed, i, 99));
    const type = sceneType(i);
    const out = [];
    const at = (u) => R - u * SCENE_W;
    const add = (kind, z, x, o) => out.push(Object.assign({ kind, z, x, d: 0, seed: hash(state.seed, i, out.length + 11), half: 80 }, o));
    const mount = (z, u, h, o = {}) => {
      const w = h * (o.wr != null ? o.wr : 0.9 + r() * 0.5);
      const base = o.base != null ? o.base : 660 + r() * 40;
      add('mount', z, at(u), Object.assign({
        base, h, w, d: base, sharp: 1 + r() * 0.6, rough: 1.3 + r() * 1.3, tone: 1, half: w * 0.55 + 40,
      }, o, { w, base }));
    };

    // Дальние вершины во всех сценах
    const nf = 3 + ((r() * 3) | 0);
    for (let k = 0; k < nf; k++) {
      const h = 170 + r() * 230;
      mount(2, (k + r()) / nf, h, { base: 600 + r() * 40, far: true, tone: 0.6, wr: 1.1 + r() * 0.9 });
    }

    switch (type) {
      case 'massif': {
        const n = 2 + (r() < 0.55 ? 1 : 0);
        const peaks = [];
        for (let k = 0; k < n; k++) {
          const u = (k + 0.5) / n + (r() - 0.5) * 0.1;
          peaks.push(u);
          mount(3, u, 440 + r() * 190, { base: 670 + r() * 30, sharp: 1.05 + r() * 0.5, pines: r() < 0.6 ? 2 : 0 });
        }
        const ns = 2 + ((r() * 2) | 0);
        for (let k = 0; k < ns; k++) mount(3.2, r(), 200 + r() * 150, { base: 705 + r() * 25, wr: 1.1 + r() * 0.6 });
        if (r() < 0.8) {
          const u = n > 1 ? (peaks[0] + peaks[1]) / 2 : peaks[0] + 0.14;
          placeFall(out, at(u), 160, 3.05, { w: 9 + r() * 6, seed: hash(state.seed, i, 501) });
        }
        if (r() < 0.5) { const y = 820 + r() * 90; add('boat', 6, at(r()), { y, d: y, s: 0.8 + r() * 0.4, half: 90 }); }
        const ng = 2 + ((r() * 2) | 0);
        for (let k = 0; k < ng; k++) {
          add('grove', 5, at((k + 0.2 + r() * 0.6) / ng), {
            y: 780 + r() * 70, w: 150 + r() * 130, rock: true, trees: 2 + ((r() * 3) | 0),
            kinds: ['pine', 'pine', 'leaf'], struct: r() < 0.35 ? 'pavilion' : null, fig: r() < 0.4, half: 260,
          });
        }
        if (r() < 0.6) add('rock', 7, at(r() < 0.5 ? 0.12 + r() * 0.2 : 0.7 + r() * 0.2), { h: 170 + r() * 150, w: 190 + r() * 140, half: 330 });
        break;
      }
      case 'karst': {
        const n = 6 + ((r() * 4) | 0);
        for (let k = 0; k < n; k++) {
          const h = 250 + r() * 300;
          mount(h > 400 ? 3 : 3.15, (k + 0.15 + r() * 0.7) / n, h, {
            base: 690 + r() * 40, wr: 0.34 + r() * 0.22, sharp: 1.9 + r() * 1.3, rough: 1.8 + r() * 1.6,
          });
        }
        const nb = 2 + ((r() * 2) | 0);
        for (let k = 0; k < nb; k++) { const y = 790 + r() * 110; add('boat', 6, at((k + r()) / nb), { y, d: y, s: 0.8 + r() * 0.5, half: 90 }); }
        if (r() < 0.5) add('birds', 8, at(r()), { y: 120 + r() * 150, n: 5 + ((r() * 6) | 0), half: 150 });
        if (r() < 0.6) {
          add('grove', 5, at(r()), {
            y: 800 + r() * 50, w: 160 + r() * 120, rock: false, trees: 2 + ((r() * 3) | 0),
            kinds: ['leaf', 'willow'], huts: r() < 0.5 ? 1 : 0, half: 260,
          });
        }
        break;
      }
      case 'lake': {
        const nh = 2 + ((r() * 2) | 0);
        for (let k = 0; k < nh; k++) mount(3, (k + r()) / nh, 90 + r() * 90, { base: 690 + r() * 20, wr: 2.4 + r() * 1.6, sharp: 0.8, rough: 1.2 });
        if (r() < 0.75) {
          add('grove', 4.5, at(0.2 + r() * 0.6), {
            y: 748 + r() * 25, w: 170 + r() * 110, rock: true, small: true, trees: 2 + ((r() * 2) | 0),
            kinds: ['pine', 'leaf'], struct: r() < 0.5 ? 'pavilion' : 'pagoda', half: 250,
          });
        }
        const nb = 2 + ((r() * 3) | 0);
        for (let k = 0; k < nb; k++) { const y = 770 + r() * 150; add('boat', 6, at((k + r()) / nb), { y, d: y, s: 0.55 + ((y - 770) / 150) * 0.7, half: 90 }); }
        if (r() < 0.75) add('poem', 9, at(0.35 + r() * 0.3), { y: 90 + r() * 50, half: 140 });
        if (r() < 0.7) add('birds', 8, at(r()), { y: 110 + r() * 170, n: 6 + ((r() * 8) | 0), half: 190 });
        if (r() < 0.65) add('reeds', 7, at(r()), { y: 990, n: 14 + ((r() * 14) | 0), half: 150 });
        for (let k = 0; k < 2; k++) if (r() < 0.6) add('sandbar', 4.2, at(r()), { y: 770 + r() * 90, w: 90 + r() * 160, half: 150 });
        break;
      }
      case 'village': {
        for (let k = 0; k < 2; k++) mount(3, (k + 0.2 + r() * 0.6) / 2, 170 + r() * 120, { base: 700 + r() * 20, wr: 2 + r() * 1.2, sharp: 0.9 + r() * 0.3, rough: 1.3 });
        const u0 = 0.12 + r() * 0.12;
        add('grove', 5, at(u0 + 0.12), {
          y: 778 + r() * 20, w: 330 + r() * 150, rock: false, trees: 4 + ((r() * 3) | 0),
          kinds: ['leaf', 'willow', 'leaf', 'pine'], huts: 2 + ((r() * 2) | 0), fig: true, half: 340,
        });
        add('grove', 5, at(u0 + 0.52 + r() * 0.15), {
          y: 796 + r() * 30, w: 260 + r() * 150, rock: false, trees: 3 + ((r() * 3) | 0),
          kinds: ['leaf', 'willow'], huts: (r() * 3) | 0, fig: r() < 0.5, half: 320,
        });
        if (r() < 0.65) add('bridge', 5.5, at(u0 + 0.33), { y: 812 + r() * 14, w: 70 + r() * 40, half: 110 });
        if (r() < 0.5) add('boat', 6, at(r()), { y: 880 + r() * 60, d: 900, s: 1, half: 90 });
        if (r() < 0.4) add('pagoda', 3.5, at(0.1 + r() * 0.8), { y: 600 + r() * 40, s: 0.55 + r() * 0.25, half: 40 });
        if (r() < 0.3) add('poem', 9, at(0.55 + r() * 0.3), { y: 80 + r() * 40, half: 140 });
        if (r() < 0.4) add('birds', 8, at(r()), { y: 140 + r() * 150, n: 4 + ((r() * 5) | 0), half: 130 });
        break;
      }
      case 'gorge': {
        const hL = 520 + r() * 130, hR = 480 + r() * 150;
        mount(2.9, 0.47, 400 + r() * 90, { base: 690, wr: 0.95 + r() * 0.3, sharp: 1.1, rough: 1.6 + r() });
        placeFall(out, at(0.47), 120, 2.95, { w: 12 + r() * 7, seed: hash(state.seed, i, 502) });
        mount(3, 0.2 + r() * 0.05, hL, { base: 700, wr: 0.72 + r() * 0.2, sharp: 0.85, rough: 2.2 + r(), pines: 2 });
        mount(3, 0.74 + r() * 0.05, hR, { base: 700, wr: 0.72 + r() * 0.25, sharp: 0.85, rough: 2.2 + r(), pines: 2 });
        if (r() < 0.4) { const y = 840 + r() * 60; add('boat', 6, at(0.45 + r() * 0.2), { y, d: y, s: 0.9, half: 90 }); }
        add('grove', 5, at(0.3), { y: 800 + r() * 30, w: 200, rock: true, trees: 2, kinds: ['pine'], half: 280 });
        if (r() < 0.85) add('bridge', 5.5, at(0.47), { y: 792, w: 100 + r() * 30, plank: true, fig: true, half: 120 });
        if (r() < 0.6) add('rock', 7, at(r() < 0.5 ? 0.08 : 0.92), { h: 200 + r() * 120, w: 220 + r() * 120, half: 340 });
        break;
      }
    }

    // Солнце или луна — написаны в небе каждой сцены (видны на рассвете, закате и ночью)
    add('sun', 0.5, at(0.25 + r() * 0.5), { y: 170 + r() * 90, half: 260 });

    // Клочья облаков между горами
    const np = 2 + ((r() * 4) | 0);
    for (let k = 0; k < np; k++) {
      const rx = 140 + r() * 220;
      add('puff', 3.9, at(r()), { y: 380 + r() * 230, rx, ry: 24 + r() * 30, a: 0.55 + r() * 0.35, half: rx + 30 });
    }
    return out;
  }

  function sceneAt(i) {
    let sc = sceneMemo.get(i);
    if (!sc) { sc = buildScene(i); sceneMemo.set(i, sc); }
    return sc;
  }

  function gather(xa, xb) {
    if (xa >= PAINT_END) return [];
    const i0 = Math.max(0, Math.floor((PAINT_END - xb) / SCENE_W) - 1);
    const i1 = Math.floor((PAINT_END - xa) / SCENE_W) + 1;
    const list = [];
    for (let i = i0; i <= i1; i++) {
      for (const f of sceneAt(i)) if (f.x + f.half > xa && f.x - f.half < xb) list.push(f);
    }
    list.sort((a, b) => a.z - b.z || a.d - b.d || b.x - a.x);
    return list;
  }

  /* ================= 5. Кисть ================= */
  function brush(g, pts, wid, col, r, o) {
    const n = pts.length;
    if (n < 2) return;
    const jit = o && o.jit != null ? o.jit : 0.35;
    const shape = o && o.shape;
    const ph = r() * 50;
    const lx = new Float32Array(n), ly = new Float32Array(n), rx = new Float32Array(n), ry = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = pts[i > 0 ? i - 1 : 0], b = pts[i < n - 1 ? i + 1 : n - 1];
      let dx = b[0] - a[0], dy = b[1] - a[1];
      const d = Math.hypot(dx, dy) || 1;
      dx /= d; dy /= d;
      const t = i / (n - 1);
      const s = shape ? shape(t) : Math.pow(Math.sin(Math.PI * t), 0.45);
      const w = wid * (0.12 + 0.88 * s) * (1 + jit * (noise1(i * 0.6 + ph, 7) - 0.5) * 2);
      lx[i] = pts[i][0] - dy * w; ly[i] = pts[i][1] + dx * w;
      rx[i] = pts[i][0] + dy * w; ry[i] = pts[i][1] - dx * w;
    }
    g.beginPath();
    g.moveTo(lx[0], ly[0]);
    for (let i = 1; i < n; i++) g.lineTo(lx[i], ly[i]);
    for (let i = n - 1; i >= 0; i--) g.lineTo(rx[i], ry[i]);
    g.closePath();
    g.fillStyle = col;
    g.fill();
  }
  const flat = () => 1;

  function dab(g, x, y, rad, col, r, sq = 0.8) {
    const k = 6, ph = r() * TAU;
    g.beginPath();
    for (let i = 0; i < k; i++) {
      const a = ph + (i / k) * TAU, rr = rad * (0.7 + 0.55 * r());
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * sq;
      if (i) g.lineTo(px, py); else g.moveTo(px, py);
    }
    g.closePath();
    g.fillStyle = col;
    g.fill();
  }

  function puff(g, x, y, rx, ry, a) {
    g.save();
    g.translate(x, y);
    g.scale(rx / ry, 1);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, ry);
    gr.addColorStop(0, paper(a));
    gr.addColorStop(0.55, paper(a * 0.72));
    gr.addColorStop(1, paper(0));
    g.fillStyle = gr;
    g.beginPath();
    g.arc(0, 0, ry, 0, TAU);
    g.fill();
    g.restore();
  }

  function surfaceOf(sil) {
    return (x) => {
      if (x <= sil[0][0]) return sil[0][1];
      for (let i = 1; i < sil.length; i++) {
        if (x <= sil[i][0]) {
          const t = (x - sil[i - 1][0]) / (sil[i][0] - sil[i - 1][0] || 1);
          return lerp(sil[i - 1][1], sil[i][1], t);
        }
      }
      return sil[sil.length - 1][1];
    };
  }

  /* ================= 6. Горы ================= */
  function drawMount(g, f, S) {
    const r = rng(f.seed);
    const { x, base, h, w } = f;
    const far = !!f.far;
    const RN = far ? 6 : 10, N = far ? 34 : 58;
    const ns = r() * 900;
    const rings = [];
    let hoff = 0;
    for (let j = 0; j < RN; j++) {
      hoff += r() * h * 0.016;
      const p = 1 - j / RN;
      const ring = new Array(N);
      for (let i = 0; i < N; i++) {
        const a = (i / (N - 1) - 0.5) * Math.PI;
        const c = Math.pow(Math.max(0, Math.cos(a)), f.sharp);
        const nz = 0.3 + 0.9 * noise2(a * f.rough + ns, j * 0.13 + ns * 0.37, 3);
        ring[i] = [x + (a / Math.PI) * w * p, base - c * nz * h * p + hoff];
      }
      rings.push(ring);
    }
    const sil = rings[0];
    const path = new Path2D();
    path.moveTo(sil[0][0], WH + 20);
    for (const p of sil) path.lineTo(p[0], p[1]);
    path.lineTo(sil[N - 1][0], WH + 20);
    path.closePath();
    g.fillStyle = PAPER_CSS;
    g.fill(path);

    let top = base;
    for (const p of sil) if (p[1] < top) top = p[1];
    const tone = f.tone;
    const fc = far ? S.far : INKC;
    const snowy = S.snow;

    // Тональные заливки внутри силуэта
    g.save();
    g.clip(path);
    let gr = g.createLinearGradient(0, top, 0, base + 10);
    if (snowy) {
      gr.addColorStop(0, rgba(fc, 0));
      gr.addColorStop(0.45, rgba(fc, 0.05 * tone));
      gr.addColorStop(1, rgba(fc, 0.15 * tone));
    } else {
      gr.addColorStop(0, rgba(fc, 0.16 * tone));
      gr.addColorStop(0.55, rgba(fc, 0.05 * tone));
      gr.addColorStop(1, rgba(fc, 0));
    }
    g.fillStyle = gr;
    g.fillRect(x - w, top - 5, 2 * w, base - top + 60);
    gr = g.createLinearGradient(x - w * 0.5, 0, x + w * 0.5, 0);
    gr.addColorStop(0, rgba(fc, 0));
    gr.addColorStop(0.55, rgba(fc, 0.02 * tone));
    gr.addColorStop(1, rgba(fc, 0.1 * tone));
    g.fillStyle = gr;
    g.fillRect(x - w, top - 5, 2 * w, base - top + 60);
    if (S.wash && !far) {
      g.globalCompositeOperation = 'multiply';
      gr = g.createLinearGradient(0, top, 0, base);
      const [c0, c1, c2] = S.wash;
      gr.addColorStop(0, rgba(c0, c0[3]));
      gr.addColorStop(0.5, rgba(c1, c1[3]));
      gr.addColorStop(0.88, rgba(c2, c2[3]));
      gr.addColorStop(1, rgba(c2, 0));
      g.fillStyle = gr;
      g.fillRect(x - w, top - 5, 2 * w, base - top + 60);
      g.globalCompositeOperation = 'source-over';
    }
    g.restore();

    // Штрихи-морщины (цунь) вдоль «колец» горы, гуще по бокам
    const texN = far ? 26 : Math.round(90 + h * 0.3);
    for (let t = 0; t < texN; t++) {
      const layer = (t / texN) * (RN - 1.001);
      const L0 = Math.floor(layer), L1 = L0 + 1, fr = layer - L0;
      const side = r() < 0.5 ? r() * 0.34 : 0.66 + r() * 0.34;
      const mid = Math.floor(side * (N - 1));
      const half = 2 + Math.floor(r() * N * 0.13);
      const s0 = Math.max(0, mid - half), s1 = Math.min(N - 1, mid + half);
      if (s1 - s0 < 2) continue;
      const pts = [];
      for (let i = s0; i <= s1; i++) {
        const p0 = rings[L0][i], p1 = rings[L1][i];
        pts.push([
          lerp(p0[0], p1[0], fr) + (noise1(i * 0.7 + t, 21) - 0.5) * 5,
          lerp(p0[1], p1[1], fr) + (noise1(i * 0.7 + t, 22) - 0.5) * 5,
        ]);
      }
      let a = (0.05 + r() * 0.26) * tone;
      if (snowy) a *= 0.3 + 0.9 * (layer / RN);
      brush(g, pts, (far ? 0.55 : 0.7) + r() * 0.8, rgba(fc, a), r, { jit: 0.5 });
    }
    // Длинные штрихи вниз по склону
    if (!far) {
      const vN = Math.round(h * 0.09);
      for (let t = 0; t < vN; t++) {
        const i = Math.floor((r() < 0.5 ? r() * 0.36 : 0.64 + r() * 0.36) * (N - 1));
        const j0 = Math.floor(r() * (RN - 4));
        const pts = [];
        const j1 = Math.min(RN, j0 + 3 + ((r() * 3) | 0));
        for (let j = j0; j < j1; j++) pts.push([rings[j][i][0] + (r() - 0.5) * 3, rings[j][i][1]]);
        let a = (0.08 + r() * 0.18) * tone;
        if (snowy) a *= 0.6;
        if (pts.length > 2) brush(g, pts, 0.55 + r() * 0.6, rgba(fc, a), r, { jit: 0.4 });
      }
    }
    // Контур
    brush(g, sil, (far ? 0.9 : 1.5) + h * 0.0018, rgba(fc, (far ? 0.34 : 0.64) * tone), r, {
      jit: 0.7, shape: (t) => 0.5 + 0.5 * Math.sin(Math.PI * t),
    });
    if (!far) {
      for (let j = 2; j < RN - 1; j += 2) {
        const s0 = Math.floor(r() * N * 0.5);
        const s1 = Math.min(N - 1, s0 + 6 + Math.floor(r() * N * 0.4));
        brush(g, rings[j].slice(s0, s1), 0.75 + r() * 0.5, rgba(fc, (0.12 + r() * 0.16) * tone), r, { jit: 0.6 });
      }
      // Мшистые точки (тайдянь) по хребту
      for (let i = 1; i < N - 1; i++) {
        if (noise1(i * 0.35 + ns, 31) < 0.52) continue;
        const p = sil[i];
        if (p[1] > base - h * 0.15) continue;
        const k = 1 + ((r() * 3) | 0);
        for (let q = 0; q < k; q++) dab(g, p[0] + (r() - 0.5) * 8, p[1] + r() * 5, 1.1 + r() * 1.7, ink((0.55 + r() * 0.35) * tone), r);
      }
    }
    // Деревца на гребне
    const density = far ? 0.07 : 0.16;
    for (let i = 2; i < N - 2; i++) {
      const p = sil[i];
      if (p[1] > base - h * 0.22 || r() > density) continue;
      tinyTree(g, p[0], p[1] + 2, (far ? 6 : 9) + r() * (far ? 6 : 10), r, S, far);
    }
    if (f.pines) {
      for (let k = 0; k < f.pines; k++) {
        const i = Math.floor(N * (0.22 + r() * 0.56));
        const p = sil[i];
        drawPine(g, p[0], p[1] + 4, 42 + r() * 42, r, S, (p[0] < x ? -1 : 1) * (0.3 + r() * 0.4));
      }
    }
  }

  // Две гряды дальних гор — непрерывные функции координаты
  function farRange(g, xa, xb, layer, S) {
    const base = layer === 0 ? 590 : 632;
    const amp = layer === 0 ? 220 : 140;
    const sid = hash(state.seed, 50 + layer);
    const step = 6;
    const pts = [];
    for (let x = Math.floor(xa / step) * step - step; x <= xb + step; x += step) {
      const n1 = fbm1(x * 0.0021, sid, 4);
      const n2 = noise1(x * 0.0065, sid + 9);
      const ridge = 1 - Math.abs(2 * n2 - 1);
      pts.push([x, base - amp * (0.2 + 0.6 * n1 * n1 + 0.4 * ridge * ridge * n1)]);
    }
    const path = new Path2D();
    path.moveTo(pts[0][0], WH);
    for (const p of pts) path.lineTo(p[0], p[1]);
    path.lineTo(pts[pts.length - 1][0], WH);
    path.closePath();
    g.fillStyle = PAPER_CSS;
    g.fill(path);
    const fc = S.far;
    g.save();
    g.clip(path);
    const gr = g.createLinearGradient(0, base - amp, 0, base + 30);
    const k = layer === 0 ? 0.6 : 1;
    gr.addColorStop(0, rgba(fc, (S.snow ? 0.03 : 0.16) * k));
    gr.addColorStop(0.6, rgba(fc, (S.snow ? 0.07 : 0.06) * k));
    gr.addColorStop(1, rgba(fc, 0));
    g.fillStyle = gr;
    g.fillRect(xa - 10, base - amp - 10, xb - xa + 20, amp + 60);
    g.restore();
    const r = rng(hash(state.seed, 70 + layer, Math.floor(xa / CW)));
    g.save();
    g.filter = `blur(${(1.1 * scDev).toFixed(2)}px)`;
    brush(g, pts, 1.7, rgba(fc, 0.24 * k), r, { jit: 0.5, shape: flat });
    g.restore();
  }

  function mistBand(g, xa, xb, yTop, yFull) {
    const gr = g.createLinearGradient(0, yTop, 0, yFull);
    gr.addColorStop(0, paper(0));
    gr.addColorStop(0.5, paper(0.55));
    gr.addColorStop(1, paper(1));
    g.fillStyle = gr;
    g.fillRect(xa - 10, yTop, xb - xa + 20, WH - yTop + 10);
    // пушистые края тумана
    const cell = 90;
    for (let c = Math.floor((xa - 200) / cell); c * cell < xb + 200; c++) {
      if (h01(state.seed, c, yTop | 0) > 0.55) continue;
      const rr = rng(hash(state.seed, c, yTop | 0, 5));
      puff(g, c * cell + rr() * cell, yTop + 10 + rr() * (yFull - yTop) * 0.6, 120 + rr() * 160, 18 + rr() * 22, 0.5 + rr() * 0.4);
    }
  }

  // Отражения гор в воде: сжатый перевёрнутый силуэт, разбитый полосками ряби
  function reflections(g, feats) {
    const Y0 = 766;
    for (const f of feats) {
      if (f.kind !== 'mount' || f.far || f.z < 2.9 || f.z > 3.2) continue;
      const pts = [];
      const step = Math.max(4, f.w / 60);
      for (let x = f.x - f.w / 2; x <= f.x + f.w / 2; x += step) {
        const y = ridgeY(f, x);
        if (y == null) continue;
        pts.push([x, Y0 + Math.max(0, f.base - y) * 0.32]);
      }
      if (pts.length < 3) continue;
      const r = rng(hash(f.seed, 77));
      g.save();
      g.beginPath();
      for (let y = Y0; y < Y0 + f.h * 0.34; y += 4 + ((r() * 4) | 0)) {
        const x0 = f.x - f.w / 2 + (r() - 0.5) * 30;
        g.rect(x0, y, f.w + r() * 30, 2 + r() * 2.5);
      }
      g.clip();
      g.beginPath();
      g.moveTo(pts[0][0], Y0);
      for (const p of pts) g.lineTo(p[0], p[1]);
      g.lineTo(pts[pts.length - 1][0], Y0);
      g.closePath();
      const gr = g.createLinearGradient(0, Y0, 0, Y0 + f.h * 0.34);
      gr.addColorStop(0, ink(0.1));
      gr.addColorStop(1, ink(0));
      g.fillStyle = gr;
      g.fill();
      g.restore();
    }
  }

  function water(g, xa, xb) {
    // дальний берег — длинные бледные штрихи у кромки тумана
    const sc = 260;
    for (let c = Math.floor(xa / sc) - 1; c * sc < xb + sc; c++) {
      const r = rng(hash(state.seed, c, 808));
      const n = 1 + ((r() * 3) | 0);
      for (let k = 0; k < n; k++) {
        const x = c * sc + r() * sc, y = 736 + r() * 26, len = 60 + r() * 150;
        brush(g, [[x, y], [x + len * 0.5, y + (r() - 0.5) * 2], [x + len, y + (r() - 0.5) * 1.5]], 0.7, ink(0.08 + r() * 0.07), r, { jit: 0.5 });
      }
    }
    const cell = 70;
    for (let cx = Math.floor(xa / cell); cx * cell < xb; cx++) {
      for (let row = 0; row < 9; row++) {
        if (h01(state.seed, cx, row, 6) > 0.1 + row * 0.028) continue;
        const r = rng(hash(state.seed, cx, row, 7));
        const y = 748 + row * 27 + r() * 10;
        const x = cx * cell + r() * cell;
        const len = (14 + r() * 32) * (0.6 + row * 0.08);
        brush(g, [[x, y], [x + len * 0.33, y + (r() - 0.5) * 1.2], [x + len * 0.66, y + (r() - 0.5) * 1.2], [x + len, y]],
          0.45 + row * 0.05, ink(0.05 + r() * 0.08), r, { jit: 0.4 });
      }
    }
  }

  /* ================= 7. Деревья ================= */
  function tinyTree(g, x, y, s, r, S, far) {
    const col = far ? S.far : INKC;
    const a = far ? 0.36 : 0.62;
    brush(g, [[x, y], [x + (r() - 0.5) * s * 0.15, y - s * 0.5], [x + (r() - 0.5) * s * 0.2, y - s]], 0.35 + s * 0.02, rgba(col, a), r, {
      jit: 0.2, shape: (t) => 1 - 0.6 * t,
    });
    if (S.bare > 0.9 || (S.bare > 0 && r() < S.bare * 0.4)) {
      for (let k = 0; k < 3; k++) {
        const yy = y - s * (0.45 + k * 0.2), dir = k % 2 ? 1 : -1;
        brush(g, [[x, yy], [x + dir * s * 0.25, yy - s * 0.2]], 0.3, rgba(col, a * 0.8), r, { jit: 0.2 });
      }
      return;
    }
    const n = 4 + ((r() * 5) | 0);
    const autumnish = !far && S.leaves.length > 1 && r() < 0.35;
    for (let i = 0; i < n; i++) {
      const c = autumnish ? S.leaves[(r() * 2) | 0] : null;
      dab(g, x + (r() - 0.5) * s * 0.55, y - s * (0.5 + r() * 0.55), s * (0.07 + r() * 0.08),
        c ? rgba(c, c[3]) : rgba(col, a * (0.7 + r() * 0.4)), r);
    }
  }

  function needleFan(g, x, y, rad, r, S) {
    g.fillStyle = rgba(S.pine, 0.13);
    g.beginPath();
    g.ellipse(x, y - rad * 0.15, rad * 1.15, rad * 0.5, 0, 0, TAU);
    g.fill();
    const k = 9 + ((r() * 7) | 0);
    const lw = 0.3 + rad * 0.02;
    for (let i = 0; i < k; i++) {
      const a = Math.PI * (1.08 + (i / (k - 1)) * 0.84) + (r() - 0.5) * 0.12;
      const len = rad * (0.7 + r() * 0.4);
      const ca = Math.cos(a), sa = Math.sin(a);
      brush(g, [[x, y], [x + ca * len * 0.5, y + sa * len * 0.5], [x + ca * len, y + sa * len]], lw, ink(0.78), r, {
        jit: 0.15, shape: (t) => 1 - 0.8 * t,
      });
    }
    if (S.snow) {
      g.fillStyle = PAPER_CSS;
      g.beginPath();
      g.ellipse(x, y - rad * 0.62, rad * 0.95, rad * 0.24, 0, 0, TAU);
      g.fill();
    }
  }

  function drawPine(g, x, y, h, r, S, lean = 0) {
    const n = 16;
    const trunk = [];
    const wob = r() * 10;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      trunk.push([x + lean * h * t * t * 0.8 + (noise1(t * 3 + wob, 71) - 0.5) * h * 0.12, y - h * t]);
    }
    const bw = 1 + h * 0.03;
    brush(g, trunk, bw, ink(0.15), r, { jit: 0.2, shape: (t) => 1 - 0.65 * t });
    const edge = (sgn) => trunk.slice(0, n - 1).map((p, i) => [p[0] + sgn * bw * (1 - (0.65 * i) / n) * 0.9, p[1]]);
    brush(g, edge(-1), 0.5 + h * 0.004, ink(0.72), r, { jit: 0.6 });
    brush(g, edge(1), 0.5 + h * 0.004, ink(0.72), r, { jit: 0.6 });
    // Чешуйки коры
    const nb = Math.round(h * 0.18);
    g.strokeStyle = ink(0.35);
    g.lineWidth = 0.45;
    for (let k = 0; k < nb; k++) {
      const p = trunk[Math.floor(r() * (n - 3))];
      g.beginPath();
      g.ellipse(p[0] + (r() - 0.5) * bw * 1.1, p[1] - r() * 3, bw * 0.3, bw * 0.17, 0, 0, TAU);
      g.stroke();
    }
    // Ветви и хвоя веерами
    const branches = 4 + ((r() * 4) | 0);
    for (let b = 0; b < branches; b++) {
      const t = 0.38 + (b / branches) * 0.55 + r() * 0.04;
      const p = trunk[Math.min(n, Math.round(t * n))];
      let dir = b % 2 ? 1 : -1;
      if (Math.abs(lean) > 0.35 && r() < 0.65) dir = Math.sign(lean);
      const len = h * (0.2 + r() * 0.22) * (1.15 - t * 0.55);
      const droop = (r() - 0.3) * 0.35;
      const bp = [];
      for (let k = 0; k <= 5; k++) {
        const u = k / 5;
        bp.push([p[0] + dir * len * u, p[1] - len * 0.18 * Math.sin(u * Math.PI) + len * droop * u * u]);
      }
      brush(g, bp, bw * 0.38 * (1.2 - t * 0.6), ink(0.7), r, { jit: 0.3, shape: (u) => 1 - 0.75 * u });
      const nc = 2 + ((r() * 2) | 0);
      for (let c = 0; c < nc; c++) {
        const q = bp[Math.min(5, 2 + c + ((r() * 2) | 0))];
        needleFan(g, q[0], q[1] - 1, h * (0.07 + r() * 0.05), r, S);
      }
    }
    needleFan(g, trunk[n][0], trunk[n][1] + 2, h * 0.09, r, S);
  }

  function growBranch(g, x, y, ang, len, wid, depth, tips, r, maxD) {
    const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
    const mx = (x + x2) / 2 + (r() - 0.5) * len * 0.25, my = (y + y2) / 2 + (r() - 0.5) * len * 0.1;
    brush(g, [[x, y], [mx, my], [x2, y2]], wid, ink(0.72), r, { jit: 0.25, shape: (t) => 1 - 0.45 * t });
    if (depth >= maxD || len < 4) { tips.push([x2, y2]); return; }
    const k = depth === 0 ? 2 + ((r() * 2) | 0) : 2;
    for (let i = 0; i < k; i++) {
      const na = ang + (i - (k - 1) / 2) * (0.5 + r() * 0.35) + (r() - 0.5) * 0.3;
      growBranch(g, x2, y2, na, len * (0.58 + r() * 0.18), wid * 0.62, depth + 1, tips, r, maxD);
    }
    if (depth > 0) tips.push([x2, y2]);
  }

  function drawLeafTree(g, x, y, h, r, S) {
    const tips = [];
    const bare = S.bare > 0.9 || r() < S.bare * 0.3;
    growBranch(g, x, y, -Math.PI / 2 + (r() - 0.5) * 0.25, h * 0.42, 0.8 + h * 0.028, 0, tips, r, bare ? 4 : 3);
    if (bare) {
      if (S.snow) {
        for (const tp of tips) if (r() < 0.4) dab(g, tp[0], tp[1] - 1, 1.6 + r() * 1.4, PAPER_CSS, r, 0.5);
      }
      return;
    }
    const cols = S.leaves;
    const style = r();
    for (const tp of tips) {
      g.fillStyle = rgba(cols[0], 0.06);
      g.beginPath();
      g.ellipse(tp[0], tp[1] - h * 0.02, h * 0.12, h * 0.08, 0, 0, TAU);
      g.fill();
      const k = 8 + ((r() * 10) | 0);
      for (let q = 0; q < k; q++) {
        const ang = r() * TAU, dist = r() * h * 0.13;
        const px = tp[0] + Math.cos(ang) * dist, py = tp[1] + Math.sin(ang) * dist * 0.7 - h * 0.02;
        const c = cols[(r() * cols.length) | 0];
        if (style < 0.55 || S.blossom) {
          dab(g, px, py, h * (0.012 + r() * 0.014), rgba(c, c[3]), r);
        } else {
          const s = h * 0.03, lw = 0.5 + h * 0.005;
          brush(g, [[px, py], [px - s * 0.5, py + s * 0.6]], lw, rgba(c, c[3]), r, { jit: 0.2 });
          brush(g, [[px, py], [px + s * 0.5, py + s * 0.6]], lw, rgba(c, c[3]), r, { jit: 0.2 });
        }
      }
    }
  }

  function drawWillow(g, x, y, h, r, S) {
    const tr = [[x, y], [x + (r() - 0.5) * h * 0.1, y - h * 0.3], [x + (r() - 0.5) * h * 0.15, y - h * 0.55]];
    brush(g, tr, 1 + h * 0.035, ink(0.7), r, { jit: 0.3, shape: (t) => 1 - 0.5 * t });
    const top = tr[2];
    const arms = 3 + ((r() * 3) | 0);
    const tips = [];
    for (let a = 0; a < arms; a++) {
      const ang = -Math.PI / 2 + (a / (arms - 1) - 0.5) * 1.8 + (r() - 0.5) * 0.3;
      const len = h * (0.2 + r() * 0.15);
      const ex = top[0] + Math.cos(ang) * len, ey = top[1] + Math.sin(ang) * len;
      brush(g, [top, [(top[0] + ex) / 2, (top[1] + ey) / 2 - 3], [ex, ey]], 0.6 + h * 0.012, ink(0.7), r, { jit: 0.3, shape: (t) => 1 - 0.6 * t });
      tips.push([ex, ey]);
    }
    const bare = S.bare > 0.9;
    const col = bare ? INKC : S.willow;
    const nStr = bare ? 18 : 42;
    for (let k = 0; k < nStr; k++) {
      const tp = tips[(r() * tips.length) | 0];
      const sx = tp[0] + (r() - 0.5) * h * 0.25, sy = tp[1] + (r() - 0.5) * h * 0.06;
      const len = h * (0.3 + r() * 0.4), sw = (r() - 0.5) * h * 0.08;
      const pts = [];
      for (let i = 0; i <= 6; i++) {
        const u = i / 6;
        pts.push([sx + sw * u * u + Math.sin(u * 3 + k) * 1.2, sy + len * u]);
      }
      brush(g, pts, 0.3 + h * 0.003, rgba(col, bare ? 0.32 : 0.5 + r() * 0.3), r, { jit: 0.2, shape: (t) => 1 - 0.7 * t });
    }
  }

  function drawTree(g, x, y, kind, h, r, S) {
    if (kind === 'pine') drawPine(g, x, y, h * 1.1, r, S, (r() - 0.5) * 0.5);
    else if (kind === 'willow') drawWillow(g, x, y, h * 0.85, r, S);
    else drawLeafTree(g, x, y, h, r, S);
  }

  /* ================= 8. Земля, камни, постройки ================= */
  function drawRockMass(g, x, y, w, h, r, S, fore) {
    const N = 32;
    const sil = [];
    const ns = r() * 500;
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1), a = (t - 0.5) * Math.PI;
      const c = Math.pow(Math.max(0, Math.cos(a)), fore ? 0.8 : 0.55);
      const nz = 0.55 + 0.6 * noise1(t * 4 + ns, 51);
      sil.push([x + (t - 0.5) * w, y - c * nz * h]);
    }
    const path = new Path2D();
    path.moveTo(sil[0][0], y + 6);
    for (const p of sil) path.lineTo(p[0], p[1]);
    path.lineTo(sil[N - 1][0], y + 6);
    path.closePath();
    g.fillStyle = PAPER_CSS;
    g.fill(path);
    let top = y;
    for (const p of sil) top = Math.min(top, p[1]);
    g.save();
    g.clip(path);
    const gr = g.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
    gr.addColorStop(0, ink(fore ? 0.12 : 0.06));
    gr.addColorStop(0.45, ink(0.01));
    gr.addColorStop(1, ink(fore ? 0.3 : 0.18));
    g.fillStyle = gr;
    g.fillRect(x - w, top - 5, 2 * w, y - top + 20);
    if (S.wash) {
      g.globalCompositeOperation = 'multiply';
      const c = S.wash[fore ? 2 : 1];
      const g2 = g.createLinearGradient(0, top, 0, y);
      g2.addColorStop(0, rgba(c, c[3] * 0.9));
      g2.addColorStop(1, rgba(c, 0));
      g.fillStyle = g2;
      g.fillRect(x - w, top - 5, 2 * w, y - top + 20);
      g.globalCompositeOperation = 'source-over';
    }
    // «Рубленые» штрихи топором
    const cuts = Math.round(w * (fore ? 0.16 : 0.12));
    for (let k = 0; k < cuts; k++) {
      const i = 1 + Math.floor(r() * (N - 2));
      const p = sil[i];
      const len = (fore ? 18 : 10) + r() * (fore ? 40 : 24);
      const ang = Math.PI * (0.55 + r() * 0.25) * (p[0] > x ? 1 : 1);
      const sx0 = p[0] + (r() - 0.5) * 6, sy0 = p[1] + 3 + r() * (y - p[1]) * 0.55;
      const ex = sx0 + Math.cos(ang) * len * (p[0] > x ? -1 : 1) * -1, ey = sy0 + Math.sin(ang) * len;
      brush(g, [[sx0, sy0], [(sx0 + ex) / 2 + (r() - 0.5) * 3, (sy0 + ey) / 2], [ex, ey]], (fore ? 1.6 : 1) + r() * (fore ? 2.4 : 1.4),
        ink((S.snow ? 0.08 : 0.12) + r() * 0.24), r, { jit: 0.5 });
    }
    g.restore();
    brush(g, sil, fore ? 2.2 : 1.4, ink(fore ? 0.8 : 0.7), r, { jit: 0.7, shape: (t) => 0.35 + 0.65 * Math.sin(Math.PI * t) });
    for (let i = 2; i < N - 2; i++) {
      if (r() > 0.28) continue;
      const p = sil[i];
      dab(g, p[0] + (r() - 0.5) * 6, p[1] + r() * 4, 1.2 + r() * (fore ? 2.4 : 1.6), ink(0.6 + r() * 0.3), r);
    }
    return surfaceOf(sil);
  }

  function drawBank(g, x, y, w, r, S, low) {
    const N = 26, hb = low ? 4 + r() * 5 : 10 + r() * 14, ns = r() * 500;
    const sil = [];
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const e = Math.pow(Math.sin(Math.PI * t), 0.6);
      sil.push([x + (t - 0.5) * w, y - e * hb * (0.7 + 0.5 * noise1(t * 5 + ns, 61))]);
    }
    g.beginPath();
    g.moveTo(sil[0][0], y + 2);
    for (const p of sil) g.lineTo(p[0], p[1]);
    g.lineTo(sil[N - 1][0], y + 2);
    g.lineTo(x + w * 0.35, y + 8);
    g.lineTo(x - w * 0.35, y + 8);
    g.closePath();
    g.fillStyle = PAPER_CSS;
    g.fill();
    if (S.wash) {
      const c = S.wash[2];
      g.fillStyle = rgba(c, c[3] * 0.9);
      g.fill();
    }
    brush(g, sil, 1.1, ink(0.6), r, { jit: 0.6 });
    brush(g, [[x - w * 0.42, y + 5], [x, y + 7], [x + w * 0.42, y + 5]], 0.6, ink(0.22), r, { jit: 0.5 });
    const k = Math.round(w * 0.05);
    for (let i = 0; i < k; i++) {
      const tx = x + (r() - 0.5) * w * 0.9;
      const ty = lerp(y, surfaceOf(sil)(tx), 0.5) + r() * 3;
      brush(g, [[tx, ty], [tx + 6 + r() * 12, ty + (r() - 0.5)]], 0.5, ink(0.12 + r() * 0.1), r, { jit: 0.4 });
    }
    for (let i = 1; i < N - 1; i++) {
      if (r() > 0.35) continue;
      const p = sil[i];
      dab(g, p[0], p[1] + 1, 0.9 + r() * 1.1, ink(0.55 + r() * 0.3), r);
    }
    return surfaceOf(sil);
  }

  function drawHut(g, x, y, s, r, S) {
    const w = 30 * s, wh = 11 * s, rh = 11 * s, ov = 5 * s;
    g.fillStyle = PAPER_CSS;
    g.fillRect(x - w / 2, y - wh, w, wh);
    brush(g, [[x - w / 2, y], [x - w / 2, y - wh]], 0.5, ink(0.62), r, { jit: 0.2, shape: flat });
    brush(g, [[x + w / 2, y], [x + w / 2, y - wh]], 0.5, ink(0.62), r, { jit: 0.2, shape: flat });
    g.fillStyle = ink(0.55);
    g.fillRect(x - w * 0.1 + (r() - 0.5) * w * 0.3, y - wh * 0.72, w * 0.16, wh * 0.72);
    const x0 = x - w / 2 - ov, x1 = x + w / 2 + ov, yt = y - wh - rh;
    g.beginPath();
    g.moveTo(x0, y - wh + 1);
    g.quadraticCurveTo(x, y - wh - 2 * s, x1, y - wh + 1);
    g.lineTo(x + w / 2 - 3 * s, yt);
    g.lineTo(x - w / 2 + 3 * s, yt);
    g.closePath();
    g.fillStyle = PAPER_CSS;
    g.fill();
    g.fillStyle = ink(S.snow ? 0.04 : 0.22);
    g.fill();
    for (let k = 0; k < 14; k++) {
      const u = k / 13;
      brush(g, [[lerp(x - w / 2 + 3 * s, x + w / 2 - 3 * s, u), yt + 1], [lerp(x0 + 2, x1 - 2, u), y - wh]], 0.35, ink(S.snow ? 0.18 : 0.35), r, { jit: 0.3 });
    }
    brush(g, [[x - w / 2 + 3 * s, yt], [x + w / 2 - 3 * s, yt]], 1.1, ink(0.8), r, { jit: 0.3 });
    brush(g, [[x0, y - wh + 1], [x, y - wh - 1], [x1, y - wh + 1]], 0.7, ink(0.7), r, { jit: 0.3 });
  }

  function roofShape(g, x, ry, w, s, rise) {
    g.beginPath();
    g.moveTo(x - w * 0.8, ry - 6 * s);
    g.quadraticCurveTo(x - w * 0.45, ry + 1 * s, x, ry);
    g.quadraticCurveTo(x + w * 0.45, ry + 1 * s, x + w * 0.8, ry - 6 * s);
    g.quadraticCurveTo(x + w * 0.3, ry - 5 * s, x + w * 0.06, ry - rise * s);
    g.lineTo(x - w * 0.06, ry - rise * s);
    g.quadraticCurveTo(x - w * 0.3, ry - 5 * s, x - w * 0.8, ry - 6 * s);
    g.closePath();
  }

  function drawPavilion(g, x, y, s, r, S) {
    const w = 30 * s, ph = 17 * s;
    g.fillStyle = PAPER_CSS;
    g.fillRect(x - w * 0.62, y - 4 * s, w * 1.24, 4 * s);
    brush(g, [[x - w * 0.62, y - 4 * s], [x + w * 0.62, y - 4 * s]], 0.6, ink(0.7), r, { shape: flat });
    brush(g, [[x - w * 0.62, y], [x + w * 0.62, y]], 0.5, ink(0.5), r, { shape: flat });
    for (const px of [-0.45, 0, 0.45]) brush(g, [[x + px * w, y - 4 * s], [x + px * w, y - 4 * s - ph]], 0.55, ink(0.75), r, { shape: flat, jit: 0.1 });
    brush(g, [[x - w * 0.5, y - 4 * s - ph * 0.35], [x + w * 0.5, y - 4 * s - ph * 0.35]], 0.45, ink(0.6), r, { shape: flat });
    const ry = y - 4 * s - ph;
    roofShape(g, x, ry, w, s, 16);
    g.fillStyle = S.snow ? PAPER_CSS : ink(0.8);
    g.fill();
    if (S.snow) { g.strokeStyle = ink(0.7); g.lineWidth = 0.7; g.stroke(); }
    brush(g, [[x, ry - 16 * s], [x, ry - 22 * s]], 0.6, ink(0.8), r, { shape: flat });
  }

  function drawPagoda(g, x, y, s, r, S) {
    const tiers = 5 + ((r() * 3) | 0);
    let yy = y, w = 20 * s;
    for (let k = 0; k < tiers; k++) {
      const bh = (k === 0 ? 10 : 7) * s * (1 - k * 0.05);
      g.fillStyle = PAPER_CSS;
      g.fillRect(x - w * 0.32, yy - bh, w * 0.64, bh);
      brush(g, [[x - w * 0.32, yy], [x - w * 0.32, yy - bh]], 0.4, ink(0.6), r, { shape: flat, jit: 0.1 });
      brush(g, [[x + w * 0.32, yy], [x + w * 0.32, yy - bh]], 0.4, ink(0.6), r, { shape: flat, jit: 0.1 });
      g.fillStyle = ink(0.6);
      g.fillRect(x - w * 0.06, yy - bh * 0.75, w * 0.12, bh * 0.5);
      const ry = yy - bh;
      roofShape(g, x, ry, w * 0.78, s * 0.7, 6);
      g.fillStyle = S.snow ? PAPER_CSS : ink(0.78);
      g.fill();
      if (S.snow) { g.strokeStyle = ink(0.6); g.lineWidth = 0.5; g.stroke(); }
      yy = ry - 4 * s;
      w *= 0.86;
    }
    brush(g, [[x, yy + 2], [x, yy - 14 * s]], 0.5 + s * 0.4, ink(0.8), r, { shape: (t) => 1 - 0.7 * t });
  }

  function drawFigure(g, x, y, s, r, kind = 'scholar', dir = 1) {
    if (kind === 'fisher') {
      g.beginPath();
      g.moveTo(x - 3 * s, y); g.lineTo(x + 3 * s, y); g.lineTo(x + 1 * s, y - 8 * s); g.lineTo(x - 1.5 * s, y - 8 * s);
      g.closePath();
      g.fillStyle = ink(0.55); g.fill();
      g.beginPath();
      g.moveTo(x - 5 * s, y - 8 * s); g.lineTo(x + 5 * s, y - 8 * s); g.lineTo(x, y - 12.5 * s);
      g.closePath();
      g.fillStyle = ink(0.78); g.fill();
      const rx = x + dir * 26 * s, ry = y - 22 * s;
      brush(g, [[x + dir * 2 * s, y - 6 * s], [x + dir * 14 * s, y - 16 * s], [rx, ry]], 0.35, ink(0.7), r, { shape: (t) => 1 - 0.8 * t, jit: 0.1 });
      g.strokeStyle = ink(0.32);
      g.lineWidth = 0.3;
      g.beginPath();
      g.moveTo(rx, ry);
      g.quadraticCurveTo(rx + dir * 4 * s, ry + 14 * s, rx + dir * 5 * s, y + 6 * s);
      g.stroke();
      return;
    }
    // Путник в халате с посохом
    g.beginPath();
    g.moveTo(x - 4 * s, y);
    g.quadraticCurveTo(x - 2 * s, y - 6 * s, x - 1.7 * s, y - 11 * s);
    g.lineTo(x + 1.7 * s, y - 11 * s);
    g.quadraticCurveTo(x + 3 * s, y - 6 * s, x + 4.6 * s, y);
    g.closePath();
    g.fillStyle = PAPER_CSS; g.fill();
    g.fillStyle = ink(0.12); g.fill();
    g.strokeStyle = ink(0.72); g.lineWidth = 0.5; g.stroke();
    dab(g, x, y - 13 * s, 1.9 * s, ink(0.86), r);
    brush(g, [[x + 5.5 * s, y + 1], [x + 3.8 * s, y - 15 * s]], 0.3, ink(0.72), r, { shape: flat });
    if (r() < 0.5) { // спутник с цитрой за спиной
      const bx = x - 9 * s;
      g.beginPath();
      g.moveTo(bx - 3 * s, y); g.lineTo(bx + 3 * s, y); g.lineTo(bx + 1.3 * s, y - 8 * s); g.lineTo(bx - 1.3 * s, y - 8 * s);
      g.closePath();
      g.fillStyle = PAPER_CSS; g.fill();
      g.strokeStyle = ink(0.65); g.lineWidth = 0.45; g.stroke();
      dab(g, bx, y - 9.5 * s, 1.5 * s, ink(0.85), r);
      brush(g, [[bx - 4 * s, y - 13 * s], [bx + 3 * s, y - 3 * s]], 0.9 * s, ink(0.6), r, { shape: flat, jit: 0.1 });
    }
  }

  /* ================= 9. Отрисовка объектов ================= */
  const DRAW = {
    mount: drawMount,
    fall(g, f) {
      const r = rng(f.seed);
      const { x, top, bottom, w } = f;
      const N = 24, left = [], right = [];
      const ph = (f.seed % 97) * 0.37;
      for (let i = 0; i <= N; i++) {
        const t = i / N, y = lerp(top, bottom, t);
        const ww = w * (0.55 + t * 0.9);
        const xc = x + (noise1(t * 3 + ph, 41) - 0.5) * 14;
        left.push([xc - ww, y]);
        right.push([xc + ww, y]);
      }
      g.beginPath();
      g.moveTo(left[0][0], left[0][1]);
      for (const p of left) g.lineTo(p[0], p[1]);
      for (let i = right.length - 1; i >= 0; i--) g.lineTo(right[i][0], right[i][1]);
      g.closePath();
      g.fillStyle = PAPER_CSS;
      g.fill();
      brush(g, left, 1.3, ink(0.55), r, { jit: 0.7 });
      brush(g, right, 1.3, ink(0.55), r, { jit: 0.7 });
      for (let k = 0; k < 7; k++) {
        const u = (k + 0.5) / 7;
        const pts = left.map((p, i) => [lerp(p[0], right[i][0], u) + (r() - 0.5) * 1.5, p[1]]);
        const a = pts.slice(Math.floor(r() * 6), pts.length - Math.floor(r() * 5));
        brush(g, a, 0.35, ink(0.09 + r() * 0.08), r, { jit: 0.3 });
      }
      for (let k = 0; k < 6; k++) {
        const t = r();
        const p = r() < 0.5 ? left[Math.floor(t * N)] : right[Math.floor(t * N)];
        dab(g, p[0], p[1], 1.4 + r() * 2.2, ink(0.5 + r() * 0.3), r);
      }
      puff(g, x, bottom - 12, w * 7, 22, 0.95);
    },
    grove(g, f, S) {
      const r = rng(f.seed);
      const { x, y, w } = f;
      const surf = f.rock
        ? drawRockMass(g, x, y, w, f.small ? 36 + r() * 30 : 55 + r() * 70, r, S, false)
        : drawBank(g, x, y, w, r, S, false);
      const items = [];
      for (let k = 0; k < (f.trees || 0); k++) items.push({ t: 'tree', x: x + (r() - 0.5) * w * 0.8, kind: f.kinds[(r() * f.kinds.length) | 0], back: r() < 0.5 });
      if (f.struct) items.push({ t: f.struct, x: x + (r() - 0.5) * w * 0.3 });
      for (let k = 0; k < (f.huts || 0); k++) items.push({ t: 'hut', x: x + (r() - 0.5) * w * 0.6 });
      if (f.fig) items.push({ t: 'figure', x: x + (r() - 0.5) * w * 0.7 });
      const rank = (it) => (it.t === 'tree' ? (it.back ? 0 : 2) : it.t === 'figure' ? 3 : 1);
      items.sort((a, b) => rank(a) - rank(b));
      for (const it of items) {
        const gy = surf(it.x);
        if (it.t === 'tree') drawTree(g, it.x, gy + 2, it.kind, (f.rock ? 72 : 62) + r() * 60, r, S);
        else if (it.t === 'hut') drawHut(g, it.x, gy + 1, 0.9 + r() * 0.3, r, S);
        else if (it.t === 'pavilion') drawPavilion(g, it.x, gy + 1, 1 + r() * 0.3, r, S);
        else if (it.t === 'pagoda') drawPagoda(g, it.x, gy + 1, 0.9 + r() * 0.3, r, S);
        else if (it.t === 'figure') drawFigure(g, it.x, gy + 1, 1, r);
      }
    },
    rock(g, f, S) {
      const r = rng(f.seed);
      const surf = drawRockMass(g, f.x, WH + 30, f.w, f.h + 30, r, S, true);
      const tx = f.x + (r() - 0.5) * f.w * 0.3;
      drawPine(g, tx, surf(tx) + 6, 130 + r() * 90, r, S, (r() < 0.5 ? -1 : 1) * (0.6 + r() * 0.5));
    },
    bridge(g, f) {
      const r = rng(f.seed);
      const { x, y, w } = f;
      if (f.plank) {
        g.fillStyle = PAPER_CSS;
        g.fillRect(x - w / 2, y - 3, w, 3);
        brush(g, [[x - w / 2, y - 3], [x + w / 2, y - 3]], 0.8, ink(0.75), r, { shape: flat, jit: 0.3 });
        brush(g, [[x - w / 2, y], [x + w / 2, y]], 0.6, ink(0.55), r, { shape: flat, jit: 0.3 });
        for (const u of [-0.3, 0.05, 0.35]) brush(g, [[x + u * w, y], [x + u * w + (r() - 0.5) * 4, y + 28]], 0.6, ink(0.5), r, { shape: flat });
        brush(g, [[x - w / 2, y - 12], [x + w / 2, y - 12]], 0.4, ink(0.5), r, { shape: flat, jit: 0.2 });
        for (let k = 0; k <= 6; k++) brush(g, [[x - w / 2 + (k * w) / 6, y - 3], [x - w / 2 + (k * w) / 6, y - 12]], 0.35, ink(0.55), r, { shape: flat });
        if (f.fig) drawFigure(g, x + (r() - 0.5) * w * 0.3, y - 3, 1, r);
        return;
      }
      const hA = w * 0.3;
      g.beginPath();
      g.moveTo(x - w / 2 - 10, y);
      g.quadraticCurveTo(x, y - hA * 1.3, x + w / 2 + 10, y);
      g.lineTo(x + w / 2 + 10, y + 3);
      g.lineTo(x + w * 0.36, y + 3);
      g.quadraticCurveTo(x, y - hA * 1.05, x - w * 0.36, y + 3);
      g.lineTo(x - w / 2 - 10, y + 3);
      g.closePath();
      g.fillStyle = PAPER_CSS;
      g.fill();
      const curve = (dy, n = 10) => {
        const pts = [];
        for (let i = 0; i <= n; i++) {
          const t = i / n;
          const px = lerp(x - w / 2 - 10, x + w / 2 + 10, t);
          pts.push([px, lerp(y, y, t) - 4 * t * (1 - t) * hA * 0.65 + dy]);
        }
        return pts;
      };
      brush(g, curve(0), 0.9, ink(0.78), r, { jit: 0.3, shape: flat });
      brush(g, curve(-7), 0.4, ink(0.55), r, { jit: 0.2, shape: flat });
      const rail = curve(-7, 8);
      for (let k = 1; k < rail.length - 1; k++) brush(g, [[rail[k][0], rail[k][1]], [rail[k][0], rail[k][1] + 7]], 0.35, ink(0.5), r, { shape: flat });
      const arch = [];
      for (let i = 0; i <= 12; i++) {
        const a = Math.PI + (i / 12) * Math.PI;
        arch.push([x + Math.cos(a) * w * 0.36, y + 3 + Math.sin(a) * hA * 0.75]);
      }
      brush(g, arch, 0.7, ink(0.7), r, { jit: 0.3 });
      const refl = arch.map((p) => [p[0], y + 3 + (y + 3 - p[1]) * 0.8]);
      brush(g, refl, 0.5, ink(0.12), r, { jit: 0.5 });
      if (r() < 0.6) drawFigure(g, x + (r() - 0.5) * w * 0.2, y - hA * 0.6, 0.9, r);
    },
    boat(g, f, S) {
      const r = rng(f.seed);
      const { x, y, s } = f;
      const L = 58 * s;
      for (let k = 0; k < 4; k++) {
        const yy = y + (3 + k * 3.2) * s;
        const x0 = x - L * (0.6 - k * 0.08) + (r() - 0.5) * 6;
        brush(g, [[x0, yy], [x0 + L * (0.4 + r() * 0.5), yy + (r() - 0.5)]], 0.4 + s * 0.2, ink(0.13 - k * 0.02), r, { jit: 0.4 });
      }
      const dir = r() < 0.5 ? 1 : -1;
      g.beginPath();
      g.moveTo(x - L / 2, y - 5 * s * (dir > 0 ? 0.8 : 1.2));
      g.quadraticCurveTo(x - L * 0.3, y + 3 * s, x, y + 3 * s);
      g.quadraticCurveTo(x + L * 0.3, y + 3 * s, x + L / 2, y - 5 * s * (dir > 0 ? 1.2 : 0.8));
      g.quadraticCurveTo(x, y - 1 * s, x - L / 2, y - 5 * s * (dir > 0 ? 0.8 : 1.2));
      g.closePath();
      g.fillStyle = ink(0.62);
      g.fill();
      if (r() < 0.7) {
        const cx = x + (r() - 0.5) * L * 0.2, cw = L * 0.34;
        g.beginPath();
        g.moveTo(cx - cw / 2, y - 1.5 * s);
        g.quadraticCurveTo(cx - cw / 2, y - 12 * s, cx, y - 12.5 * s);
        g.quadraticCurveTo(cx + cw / 2, y - 12 * s, cx + cw / 2, y - 1.5 * s);
        g.closePath();
        g.fillStyle = PAPER_CSS; g.fill();
        g.fillStyle = ink(S.snow ? 0.06 : 0.28); g.fill();
        g.strokeStyle = ink(0.6); g.lineWidth = 0.5; g.stroke();
        for (let k = 0; k < 5; k++) {
          const u = (k + 0.5) / 5;
          const px = cx - cw / 2 + cw * u;
          brush(g, [[px, y - 1.5 * s], [px, y - 11 * s * Math.sin(u * Math.PI) - 1 * s]], 0.3, ink(0.45), r, { jit: 0.2 });
        }
      }
      drawFigure(g, x - dir * L * 0.33, y - 2 * s, s * 0.9, r, 'fisher', dir);
    },
    reeds(g, f, S) {
      const r = rng(f.seed);
      for (let k = 0; k < f.n; k++) {
        const x = f.x + (r() - 0.5) * 220, y = f.y + r() * 10;
        const h = 40 + r() * 75, bend = (r() - 0.3) * 22;
        brush(g, [[x, y], [x + bend * 0.3, y - h * 0.5], [x + bend, y - h]], 0.55, rgba(S.reed, 0.6 + r() * 0.3), r, { jit: 0.2, shape: (t) => 1 - 0.8 * t });
        if (r() < 0.5) {
          const my = y - h * (0.3 + r() * 0.3), d = r() < 0.5 ? -1 : 1;
          brush(g, [[x + bend * 0.2, my], [x + bend * 0.2 + d * 14, my - 16], [x + bend * 0.2 + d * 22, my - 14]], 0.9, rgba(S.reed, 0.55), r, { jit: 0.2 });
        }
        if (r() < 0.3) for (let q = 0; q < 5; q++) dab(g, x + bend + (r() - 0.5) * 5, y - h - r() * 8, 1.1, rgba(S.reed, 0.6), r);
      }
    },
    birds(g, f) {
      const r = rng(f.seed);
      for (let k = 0; k < f.n; k++) {
        const bx = f.x + (k - f.n / 2) * 18 + (r() - 0.5) * 12;
        const by = f.y + Math.abs(k - f.n / 2) * 6 + (r() - 0.5) * 8;
        const s = 3 + r() * 2.5;
        brush(g, [[bx - s, by - s * 0.3], [bx - s * 0.4, by - s * 0.45], [bx, by]], 0.45, ink(0.7), r, { jit: 0.2 });
        brush(g, [[bx, by], [bx + s * 0.4, by - s * 0.5], [bx + s, by - s * 0.35]], 0.45, ink(0.7), r, { jit: 0.2 });
      }
    },
    sandbar(g, f, S) { drawBank(g, f.x, f.y, f.w, rng(f.seed), S, true); },
    sun(g, f) {
      const T = TIMES[state.time];
      if (T.sun) {
        const y = f.y + (state.time === 'dusk' ? 330 : 280), rr = T.sun.r * 1.5;
        const gr = g.createRadialGradient(f.x, y, rr * 0.9, f.x, y, rr * 3.4);
        gr.addColorStop(0, rgba(T.sun.col, T.sun.a * 0.32));
        gr.addColorStop(1, rgba(T.sun.col, 0));
        g.fillStyle = gr;
        g.fillRect(f.x - rr * 3.5, y - rr * 3.5, rr * 7, rr * 7);
        g.fillStyle = rgba(T.sun.col, T.sun.a);
        g.beginPath();
        g.arc(f.x, y, rr, 0, TAU);
        g.fill();
      } else if (T.moon) {
        const rr = 36, y = f.y;
        const gr = g.createRadialGradient(f.x, y, rr, f.x, y, rr * 4.2);
        gr.addColorStop(0, 'rgba(255,250,232,0.5)');
        gr.addColorStop(1, 'rgba(255,250,232,0)');
        g.fillStyle = gr;
        g.fillRect(f.x - rr * 4.2, y - rr * 4.2, rr * 8.4, rr * 8.4);
        g.fillStyle = 'rgb(252,248,234)';
        g.beginPath();
        g.arc(f.x, y, rr, 0, TAU);
        g.fill();
        g.strokeStyle = ink(0.22);
        g.lineWidth = 1;
        g.stroke();
      }
    },
    puff(g, f) { puff(g, f.x, f.y, f.rx, f.ry, f.a); },
    pagoda(g, f, S) { drawPagoda(g, f.x, f.y, f.s, rng(f.seed), S); },
    poem(g, f) {
      const L = poemLayout(f);
      const r = rng(f.seed);
      g.font = `${L.fs}px "Ma Shan Zheng", "Kaiti SC", "STKaiti", "KaiTi", serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      L.P.zh.forEach((line, c) => {
        const chars = [...line];
        const cx = L.xRight - c * L.colGap;
        chars.forEach((ch, k) => {
          g.fillStyle = ink(0.76 + r() * 0.14);
          g.fillText(ch, cx + (r() - 0.5) * 1.2, f.y + k * L.charGap);
        });
      });
      const lastLen = [...L.P.zh[L.P.zh.length - 1]].length;
      stampWorld(g, 'opus', L.xRight - (L.cols - 1) * L.colGap - L.colGap * 1.05, f.y + (lastLen - 1) * L.charGap + 4, 34, r);
    },
  };

  function poemLayout(f) {
    const pool = POOLS[state.season];
    const P = POEMS[pool[hash(f.seed, 5) % pool.length]];
    const cols = P.zh.length;
    const maxLen = Math.max(...P.zh.map((s) => [...s].length));
    const fs = 30, colGap = 42, charGap = 35;
    const xRight = f.x + ((cols - 1) * colGap) / 2;
    return {
      P, fs, colGap, charGap, xRight, cols,
      rect: [xRight - (cols - 1) * colGap - colGap * 1.7, f.y - 24, xRight + colGap * 0.6, f.y + (maxLen - 1) * charGap + 26],
    };
  }

  /* ================= 10. Печати ================= */
  const SEAL = new Map();
  function makeSeal(kind, lines) {
    const px = 256;
    const c = document.createElement('canvas');
    c.width = c.height = px;
    const g = c.getContext('2d');
    const r = rng(hash(lines.join('').length * 31 + kind.length, 77));
    const red = 'rgb(174,38,30)';
    const edge = (inset) => {
      g.beginPath();
      const n = 44;
      for (let i = 0; i < n; i++) {
        const t = i / n;
        let x, y;
        const e = px - inset * 2;
        if (t < 0.25) { x = inset + e * (t / 0.25); y = inset; }
        else if (t < 0.5) { x = px - inset; y = inset + e * ((t - 0.25) / 0.25); }
        else if (t < 0.75) { x = px - inset - e * ((t - 0.5) / 0.25); y = px - inset; }
        else { x = inset; y = px - inset - e * ((t - 0.75) / 0.25); }
        x += (r() - 0.5) * 5; y += (r() - 0.5) * 5;
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.closePath();
    };
    g.fillStyle = red;
    g.strokeStyle = red;
    const fontFam = kind === 'zh' ? '"Ma Shan Zheng", "Kaiti SC", serif' : '"Rubik Mono One", "Arial Black", sans-serif';
    const fitFont = (maxW, maxH) => {
      let fs = 120;
      g.font = `${fs}px ${fontFam}`;
      const widest = Math.max(...lines.map((l) => g.measureText(l).width));
      fs = Math.min(fs * (maxW / widest), maxH / lines.length / 0.95);
      g.font = `${fs}px ${fontFam}`;
      return fs;
    };
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (kind === 'white' || kind === 'zh') {
      edge(10);
      g.fill();
      g.globalCompositeOperation = 'destination-out';
      const fs = fitFont(px - 70, px - 64);
      lines.forEach((l, i) => g.fillText(l, px / 2, px / 2 + (i - (lines.length - 1) / 2) * fs * 1.0 + fs * 0.04));
      g.globalCompositeOperation = 'source-over';
    } else {
      g.lineWidth = 15;
      edge(16);
      g.stroke();
      const fs = fitFont(px - 84, px - 80);
      lines.forEach((l, i) => g.fillText(l, px / 2, px / 2 + (i - (lines.length - 1) / 2) * fs * 1.02 + fs * 0.04));
    }
    // Износ камня и неровный оттиск
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 300; i++) {
      g.globalAlpha = 0.25 + r() * 0.75;
      g.beginPath();
      g.arc(r() * px, r() * px, r() * r() * 5 + 0.4, 0, TAU);
      g.fill();
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    return c;
  }
  function sealImg(id) {
    if (!SEAL.has(id)) {
      if (id === 'opus') SEAL.set(id, makeSeal('white', ['ОП', 'УС']));
      else if (id === 'shan') SEAL.set(id, makeSeal('zh', ['山', '水']));
      else SEAL.set(id, makeSeal('red', id.split('|')));
    }
    return SEAL.get(id);
  }
  function stampWorld(g, id, x, y, size, r) {
    g.save();
    g.globalCompositeOperation = 'multiply';
    g.globalAlpha = 0.9;
    g.translate(x, y);
    g.rotate((r() - 0.5) * 0.05);
    g.drawImage(sealImg(id), -size / 2, -size / 2, size, size);
    g.restore();
  }

  /* ================= 11. Заглавный лист ================= */
  function drawTitle(g) {
    const r = rng(hash(state.seed, 1234));
    // Шёлковая вставка между заглавием и живописью
    g.fillStyle = '#c3bea6';
    g.fillRect(PAINT_END, 0, SEP_W, WH);
    for (let i = 0; i < 26; i++) {
      g.fillStyle = `rgba(80,70,50,${0.03 + r() * 0.05})`;
      g.fillRect(PAINT_END + r() * SEP_W, 0, 0.6, WH);
    }
    g.fillStyle = 'rgba(60,50,35,0.35)';
    g.fillRect(PAINT_END, 0, 1.2, WH);
    g.fillRect(PAINT_END + SEP_W - 1.2, 0, 1.2, WH);
    // Бумага заглавия с золотой крошкой
    g.fillStyle = '#e8d8b3';
    g.fillRect(-TITLE_W, 0, TITLE_W, WH);
    const gr = g.createRadialGradient(-TITLE_W / 2, WH / 2, 50, -TITLE_W / 2, WH / 2, 620);
    gr.addColorStop(0, 'rgba(255,248,226,0.35)');
    gr.addColorStop(1, 'rgba(180,150,100,0.18)');
    g.fillStyle = gr;
    g.fillRect(-TITLE_W, 0, TITLE_W, WH);
    for (let i = 0; i < 420; i++) {
      const x = -TITLE_W + r() * TITLE_W, y = r() * WH, s = 0.6 + r() * r() * 4;
      g.fillStyle = `rgba(${178 + r() * 30},${140 + r() * 25},${62 + r() * 20},${0.35 + r() * 0.5})`;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + s, y + (r() - 0.5) * s);
      g.lineTo(x + s * 0.6, y + s);
      g.lineTo(x - s * 0.3, y + s * 0.6);
      g.closePath();
      g.fill();
    }
    // Каллиграфия: 溪山无尽 — «Реки и горы без конца»
    const cx = -TITLE_W / 2 + 40;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '124px "Ma Shan Zheng", "Kaiti SC", "STKaiti", "KaiTi", serif';
    ['溪', '山', '无', '尽'].forEach((ch, i) => {
      g.fillStyle = ink(0.9);
      g.fillText(ch, cx + (r() - 0.5) * 4, 175 + i * 152);
    });
    g.font = '34px "Ma Shan Zheng", "Kaiti SC", "STKaiti", "KaiTi", serif';
    ['丙', '午', '秋', '日'].forEach((ch, i) => {
      g.fillStyle = ink(0.82);
      g.fillText(ch, cx - 132, 520 + i * 40);
    });
    stampWorld(g, 'opus', cx - 132, 710, 50, r);
    stampWorld(g, 'shan', -62, 92, 46, r);
    // Подпись по-русски
    g.fillStyle = 'rgba(60,46,32,0.9)';
    g.font = 'italic 500 29px "Cormorant Garamond", Georgia, serif';
    g.fillText('Реки и горы без конца', cx - 40, 880);
    g.fillStyle = 'rgba(92,74,52,0.9)';
    g.font = '600 17px "Cormorant Garamond", Georgia, serif';
    g.fillText(`СВИТОК № ${state.seed}`.split('').join(' '), cx - 40, 918);
  }

  /* ================= 12. Фрагменты ================= */
  function paintWorld(g, xa, xb) {
    const S = SEASONS[state.season];
    if (xb > PAINT_END) drawTitle(g);
    if (xa >= PAINT_END) return;
    const xe = Math.min(xb, PAINT_END);
    g.save();
    g.beginPath();
    g.rect(xa - 10, -10, xe - xa + 10, WH + 20);
    g.clip();
    // Бумага и небо запекаются во фрагмент
    g.fillStyle = PAPER_CSS;
    g.fillRect(xa - 10, -10, xe - xa + 20, WH + 20);
    skyWash(g, xa, xe, S);
    const feats = gather(xa, xe);
    const layers = [
      [1.0, () => farRange(g, xa, xe, 0, S)],
      [1.2, () => mistBand(g, xa, xe, 560, 660)],
      [1.4, () => farRange(g, xa, xe, 1, S)],
      [1.6, () => mistBand(g, xa, xe, 600, 700)],
      [2.6, () => mistBand(g, xa, xe, 640, 730)],
      [3.8, () => mistBand(g, xa, xe, 680, 760)],
      [3.82, () => reflections(g, feats)],
      [3.85, () => water(g, xa, xe)],
    ];
    let li = 0;
    for (const f of feats) {
      while (li < layers.length && layers[li][0] <= f.z) layers[li++][1]();
      DRAW[f.kind](g, f, S);
    }
    while (li < layers.length) layers[li++][1]();
    g.restore();
  }

  function skyWash(g, xa, xe, S) {
    const T = TIMES[state.time];
    if (S.snow) {
      const gr = g.createLinearGradient(0, 0, 0, 660);
      gr.addColorStop(0, ink(0.15));
      gr.addColorStop(1, ink(0.04));
      g.fillStyle = gr;
      g.fillRect(xa - 10, 0, xe - xa + 20, 660);
    }
    if (T.sky) {
      const gr = g.createLinearGradient(0, 0, 0, 700);
      gr.addColorStop(0, rgba(T.sky[0], T.sky[0][3]));
      gr.addColorStop(0.7, rgba(T.sky[1], T.sky[1][3]));
      gr.addColorStop(1, rgba(T.sky[1], 0));
      g.fillStyle = gr;
      g.fillRect(xa - 10, 0, xe - xa + 20, 700);
    }
  }

  const cache = new Map();
  function renderChunk(k) {
    const c = document.createElement('canvas');
    c.width = chunkPx + 2 * padPx;
    c.height = HpDev;
    const g = c.getContext('2d');
    g.setTransform(scDev, 0, 0, scDev, padPx - k * chunkPx, 0);
    const xa = k * CW - padPx / scDev, xb = (k + 1) * CW + padPx / scDev;
    paintWorld(g, xa, xb);
    // Зерно бумаги, тон часа и старение кромок — один раз, в пикселях фрагмента
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'multiply';
    const off = (((k * chunkPx - padPx) % 512) + 512) % 512;
    grainPat.setTransform(new DOMMatrix().translateSelf(-off, 0));
    g.fillStyle = grainPat;
    g.fillRect(0, 0, c.width, c.height);
    const T = TIMES[state.time];
    if (T.tint) {
      g.fillStyle = rgba(T.tint, T.tint[3]);
      g.fillRect(0, 0, c.width, c.height);
    }
    const gr = g.createLinearGradient(0, 0, 0, c.height);
    gr.addColorStop(0, 'rgba(196,160,112,0.34)');
    gr.addColorStop(0.05, 'rgba(196,160,112,0)');
    gr.addColorStop(0.95, 'rgba(196,160,112,0)');
    gr.addColorStop(1, 'rgba(196,160,112,0.34)');
    g.fillStyle = gr;
    g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'source-over';
    return c;
  }

  /* ================= 13. Раскладка экрана и текстуры ================= */
  let W = 0, H = 0, dpr = 1, mobile = false;
  let scDev = 1, scc = 1, chunkPx = 1, padPx = 0, HpDev = 1, paintTopDev = 0;
  let mountH = 12, paintH = 600, paintTop = 100, scrollTop = 90, scrollH = 620, RWL = 30;
  let grainPat = null, silkPat = null, brocadePat = null;

  function layout() {
    W = innerWidth;
    H = innerHeight;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    mobile = W < 720;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const topH = mobile ? 62 : 78;
    const botH = mobile ? 168 : 86;
    const avail = H - topH - botH;
    mountH = Math.round(clamp(avail * 0.024, 8, 18));
    let ph = Math.min(avail - 2 * mountH - (mobile ? 14 : 26), W * 1.45);
    ph = Math.max(200, ph);
    chunkPx = Math.max(64, Math.round(CW * (ph / WH) * dpr));
    scDev = chunkPx / CW;
    scc = scDev / dpr;
    padPx = Math.round(PAD * scDev);
    HpDev = Math.round(WH * scDev);
    paintH = HpDev / dpr;
    scrollH = paintH + 2 * mountH;
    scrollTop = Math.round(topH + (avail - scrollH) / 2);
    paintTop = scrollTop + mountH;
    paintTopDev = Math.round(paintTop * dpr);
    RWL = mobile ? 20 : 30;
    cache.clear();
    makePatterns();
    state.viewRight = Math.min(state.viewRight, maxViewRight());
  }

  function maxViewRight() { return HEAD_W + (mobile ? 36 : 190) / scc; }
  function startViewRight() { return mobile ? PAINT_END + 60 : maxViewRight(); }

  function makePatterns() {
    // Бумажное зерно: мягкие пятна, волокна, крапинки. Тайл бесшовный.
    const size = 512;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const img = g.createImageData(size, size);
    const d = img.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const lf = pnoise(x / 64, y / 64, 8, 913) * 0.6 + pnoise(x / 16, y / 16, 32, 914) * 0.4;
        const fine = h01(x, y, 915);
        const v = 255 - (lf * 20 + fine * 13);
        const i = (y * size + x) * 4;
        d[i] = v; d[i + 1] = v - 2; d[i + 2] = v - 7; d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    const r = rng(4242);
    g.lineCap = 'round';
    for (let k = 0; k < 460; k++) {
      const x = r() * size, y = r() * size, len = 6 + r() * 28, ang = r() * TAU;
      const cxp = Math.cos(ang) * len * 0.5 + (r() - 0.5) * 5, cyp = Math.sin(ang) * len * 0.5 + (r() - 0.5) * 5;
      const ex = Math.cos(ang) * len, ey = Math.sin(ang) * len;
      g.strokeStyle = `rgba(${140 + r() * 40},${122 + r() * 30},${96 + r() * 24},${0.07 + r() * 0.14})`;
      g.lineWidth = 0.4 + r() * 0.8;
      for (const ox of [-size, 0, size]) {
        for (const oy of [-size, 0, size]) {
          g.beginPath();
          g.moveTo(x + ox, y + oy);
          g.quadraticCurveTo(x + ox + cxp, y + oy + cyp, x + ox + ex, y + oy + ey);
          g.stroke();
        }
      }
    }
    for (let k = 0; k < 90; k++) {
      g.fillStyle = `rgba(120,96,64,${0.08 + r() * 0.15})`;
      g.beginPath();
      g.arc(r() * size, r() * size, 0.4 + r() * 1.3, 0, TAU);
      g.fill();
    }
    grainPat = ctx.createPattern(c, 'repeat');

    // Шёлк паспарту: мелкий ромбический узор
    const s2 = Math.max(8, Math.round(14 * dpr));
    const c2 = document.createElement('canvas');
    c2.width = c2.height = s2;
    const g2 = c2.getContext('2d');
    g2.fillStyle = '#c2bea7';
    g2.fillRect(0, 0, s2, s2);
    g2.strokeStyle = 'rgba(120,112,86,0.28)';
    g2.lineWidth = Math.max(1, dpr * 0.6);
    g2.beginPath();
    g2.moveTo(s2 / 2, 0); g2.lineTo(s2, s2 / 2); g2.lineTo(s2 / 2, s2); g2.lineTo(0, s2 / 2); g2.closePath();
    g2.stroke();
    g2.fillStyle = 'rgba(255,252,236,0.25)';
    g2.fillRect(s2 / 2 - dpr * 0.5, s2 / 2 - dpr * 0.5, dpr, dpr);
    silkPat = ctx.createPattern(c2, 'repeat');

    // Парча обёртки: синий шёлк с золотыми «облачками»
    const s3 = Math.round(34 * dpr);
    const c3 = document.createElement('canvas');
    c3.width = c3.height = s3;
    const g3 = c3.getContext('2d');
    g3.fillStyle = '#2f4254';
    g3.fillRect(0, 0, s3, s3);
    g3.strokeStyle = 'rgba(206,172,104,0.55)';
    g3.lineWidth = dpr * 0.9;
    const cloud = (cx, cy, k) => {
      g3.beginPath();
      g3.arc(cx - 3 * k, cy, 3 * k, Math.PI, TAU);
      g3.arc(cx + 3 * k, cy, 3 * k, Math.PI, TAU);
      g3.moveTo(cx - 6 * k, cy);
      g3.lineTo(cx + 6 * k, cy);
      g3.stroke();
    };
    cloud(s3 * 0.25, s3 * 0.3, dpr);
    cloud(s3 * 0.75, s3 * 0.8, dpr);
    brocadePat = ctx.createPattern(c3, 'repeat');
  }

  function anchored(pat, ox, oy, scale) {
    pat.setTransform(new DOMMatrix().translateSelf(ox, oy).scaleSelf(scale, scale));
    return pat;
  }

  // Мировая координата ↔ экран (CSS-пиксели)
  const baseDev = () => Math.round(state.viewRight * scDev);
  const sx = (x) => (canvas.width - baseDev() + x * scDev) / dpr;
  const wxOf = (px) => (px * dpr - canvas.width + baseDev()) / scDev;
  const wyOf = (py) => (py - paintTop) / scc;

  /* ================= 14. Кадр ================= */
  let lastT = performance.now();
  let revealX = 0, rightRollW = 0, paintRight = 0;

  function frame(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    update(dt, now);
    draw(now);
    requestAnimationFrame(frame);
  }

  const AUTO = 30; // единиц мира в секунду
  function update(dt, now) {
    if (!state.ready) return;
    const idle = now - state.lastInput > 2600;
    if (!dragging) {
      if (state.auto && idle && state.intro >= 1) state.vel = lerp(state.vel, -AUTO, 1 - Math.exp(-dt * 1.6));
      else if (!idle || !state.auto) state.vel *= Math.exp(-dt * 3.2);
      state.viewRight += state.vel * dt;
    }
    const mx = maxViewRight();
    if (state.viewRight > mx) { state.viewRight = mx; if (state.vel > 0) state.vel = 0; }
    if (state.intro < 1) state.intro = SHOT ? 1 : clamp((now - state.introStart) / 1700, 0, 1);
    if (state.fadeT > 0) state.fadeT = Math.max(0, state.fadeT - dt / 0.9);
  }

  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  function draw() {
    const Wd = canvas.width;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, Wd, canvas.height);
    if (!state.ready) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const x0s = sx(0); // начало обёртки
    const over = x0s - (W - 10);
    rightRollW = over > 0 ? Math.round(clamp(12 + 7 * Math.log2(1 + over / scc / 400), 12, mobile ? 26 : 36)) : 0;
    const rightLimit = W - rightRollW;
    const e = easeOut(state.intro);
    revealX = lerp(clamp(state.introFrom, RWL, W - 60), RWL, e);
    paintRight = Math.min(rightLimit, x0s);
    const bodyRight = Math.min(rightLimit, x0s + HEAD_W * scc);

    // Тень свитка на столе — градиентами, без дорогого размытия
    softShadow(revealX - 2, scrollTop, bodyRight + (x0s < rightLimit ? 10 : 0), scrollTop + scrollH);

    // Шёлковые поля сверху и снизу
    if (paintRight > revealX) {
      ctx.fillStyle = anchored(silkPat, sx(0), 0, 1 / dpr);
      ctx.fillRect(revealX, scrollTop, paintRight - revealX, mountH);
      ctx.fillRect(revealX, paintTop + paintH, paintRight - revealX, mountH);
      ctx.fillStyle = 'rgba(70,60,44,0.35)';
      ctx.fillRect(revealX, paintTop - 1, paintRight - revealX, 1);
      ctx.fillRect(revealX, paintTop + paintH, paintRight - revealX, 1);
      ctx.fillStyle = 'rgba(255,250,235,0.18)';
      ctx.fillRect(revealX, scrollTop, paintRight - revealX, 1);
    }

    // Живопись
    if (paintRight > revealX) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(revealX, paintTop, paintRight - revealX, paintH);
      ctx.clip();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      blitChunks(wxOf(revealX - 4), Math.min(0, wxOf(paintRight + 4)));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawUserSeals();
      // тень от рулонов на бумаге
      let gr = ctx.createLinearGradient(revealX, 0, revealX + 34, 0);
      gr.addColorStop(0, 'rgba(40,28,18,0.32)');
      gr.addColorStop(1, 'rgba(40,28,18,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(revealX, scrollTop, 34, scrollH);
      if (rightRollW) {
        gr = ctx.createLinearGradient(rightLimit - 30, 0, rightLimit, 0);
        gr.addColorStop(0, 'rgba(40,28,18,0)');
        gr.addColorStop(1, 'rgba(40,28,18,0.3)');
        ctx.fillStyle = gr;
        ctx.fillRect(rightLimit - 30, scrollTop, 30, scrollH);
      }
      if (state.fade && state.fadeT > 0) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = easeOut(state.fadeT);
        ctx.drawImage(state.fade, 0, 0);
        ctx.globalAlpha = 1;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      ctx.restore();
    }

    // Обёртка, палочка и завязка
    if (x0s < rightLimit) drawHead(x0s, rightLimit);

    // Рулоны
    drawRoll(revealX - RWL, RWL, true);
    if (rightRollW) drawRoll(W - rightRollW, rightRollW, false);

    // Призрак печати под курсором
    if (state.stamping && state.pointer && inPainting(state.pointer.x, state.pointer.y)) {
      const s = 54 * scc;
      ctx.globalAlpha = 0.55;
      ctx.drawImage(sealImg(dateSealId()), state.pointer.x - s / 2, state.pointer.y - s / 2, s, s);
      ctx.globalAlpha = 1;
    }
  }

  function blitChunks(xa, xb) {
    if (xb <= xa) return;
    const k0 = Math.floor(xa / CW), k1 = Math.floor((xb - 1e-6) / CW);
    const Wd = canvas.width, bd = baseDev();
    let fresh = 0;
    for (let k = k0; k <= k1; k++) {
      let c = cache.get(k);
      if (!c) { c = renderChunk(k); cache.set(k, c); fresh++; }
      ctx.drawImage(c, padPx, 0, chunkPx, HpDev, Wd - bd + k * chunkPx, paintTopDev, chunkPx, HpDev);
    }
    // Упреждающая отрисовка одного фрагмента по ходу движения
    if (!fresh) {
      const ahead = state.vel > 40 ? k1 + 1 : k0 - 1;
      if (ahead * CW < 0 && !cache.has(ahead)) cache.set(ahead, renderChunk(ahead));
    }
    if (cache.size > 18) {
      for (const key of [...cache.keys()]) if (key < k0 - 3 || key > k1 + 3) cache.delete(key);
    }
  }

  function drawHead(x0s, rightLimit) {
    const x1s = x0s + HEAD_W * scc;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, rightLimit, H);
    ctx.clip();
    ctx.fillStyle = anchored(brocadePat, x0s, scrollTop, 1 / dpr);
    ctx.fillRect(x0s, scrollTop, x1s - x0s, scrollH);
    let gr = ctx.createLinearGradient(x0s, 0, x1s, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0.25)');
    gr.addColorStop(0.2, 'rgba(0,0,0,0)');
    gr.addColorStop(1, 'rgba(0,0,0,0.18)');
    ctx.fillStyle = gr;
    ctx.fillRect(x0s, scrollTop, x1s - x0s, scrollH);
    ctx.fillStyle = 'rgba(214,182,112,0.6)';
    ctx.fillRect(x0s, scrollTop, 1.2, scrollH);
    // Палочка тяньгань
    const sw = mobile ? 6 : 8;
    gr = ctx.createLinearGradient(x1s, 0, x1s + sw, 0);
    gr.addColorStop(0, '#2a1a10');
    gr.addColorStop(0.45, '#7a5436');
    gr.addColorStop(1, '#23150c');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.roundRect(x1s, scrollTop - 4, sw, scrollH + 8, 2);
    ctx.fill();
    // Завязка с нефритовой застёжкой
    const ry = scrollTop + scrollH * 0.5;
    const L = mobile ? 90 : 150;
    const p0 = [x1s + sw, ry], c1 = [x1s + L * 0.35, ry - 34], c2 = [x1s + L * 0.62, ry + 34], p3 = [x1s + L, ry + 10];
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.moveTo(p0[0], p0[1] + 5);
    ctx.bezierCurveTo(c1[0], c1[1] + 5, c2[0], c2[1] + 5, p3[0], p3[1] + 5);
    ctx.stroke();
    ctx.strokeStyle = '#27384c';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(p0[0], p0[1]);
    ctx.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], p3[0], p3[1]);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(214,182,112,0.55)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.save();
    ctx.translate(p3[0] + 8, p3[1] + 1);
    ctx.rotate(0.35);
    gr = ctx.createLinearGradient(-10, -6, 10, 6);
    gr.addColorStop(0, '#cfe2c6');
    gr.addColorStop(0.5, '#8fb49a');
    gr.addColorStop(1, '#5d8470');
    ctx.fillStyle = gr;
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 3;
    ctx.beginPath();
    ctx.ellipse(0, 0, 12, 6.5, 0, 0, TAU);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    ctx.ellipse(-3, -2.5, 5, 1.6, -0.2, 0, TAU);
    ctx.fill();
    ctx.restore();
    ctx.restore();
  }

  function softShadow(x0, y0, x1, y1) {
    if (x1 <= x0) return;
    let gr = ctx.createLinearGradient(0, y1, 0, y1 + 34);
    gr.addColorStop(0, 'rgba(0,0,0,0.5)');
    gr.addColorStop(0.35, 'rgba(0,0,0,0.22)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(x0 + 6, y1, x1 - x0 - 6, 34);
    gr = ctx.createLinearGradient(0, y0 - 12, 0, y0);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(1, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = gr;
    ctx.fillRect(x0 + 6, y0 - 12, x1 - x0 - 6, 12);
    gr = ctx.createLinearGradient(x1, 0, x1 + 22, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0.4)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(x1, y0 + 8, 22, y1 - y0 + 14);
  }

  function drawRoll(x, w, left) {
    const top = scrollTop - 3, h = scrollH + 6;
    softShadow(x - 2, top, x + w + (left ? 8 : 0), top + h);
    ctx.fillStyle = '#b5ae96';
    ctx.beginPath();
    ctx.roundRect(x, top, w, h, 3);
    ctx.fill();
    const gr = ctx.createLinearGradient(x, 0, x + w, 0);
    gr.addColorStop(0, 'rgba(50,38,26,0.62)');
    gr.addColorStop(0.32, 'rgba(255,250,232,0.28)');
    gr.addColorStop(0.5, 'rgba(255,250,232,0.08)');
    gr.addColorStop(1, 'rgba(40,30,20,0.6)');
    ctx.fillStyle = gr;
    ctx.fillRect(x, top, w, h);
    ctx.fillStyle = 'rgba(60,48,34,0.35)';
    ctx.fillRect(x, top + mountH + 3, w, 1);
    ctx.fillRect(x, top + h - mountH - 4, w, 1);
    for (let i = 1; i < 4; i++) {
      ctx.fillStyle = 'rgba(40,30,20,0.12)';
      ctx.fillRect(left ? x + w - i * 3 : x + i * 3, top, 1, h);
    }
  }

  /* ================= 15. Печати пользователя ================= */
  function dateSealId() {
    const d = new Date();
    const rom = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'][d.getMonth()];
    return `${d.getDate()} ${rom}|${d.getFullYear()}`;
  }
  function drawUserSeals() {
    const now = performance.now();
    for (const s of state.seals) {
      const px = sx(s.x), py = paintTop + s.y * scc;
      const size = 54 * scc;
      if (px < revealX - size || px > paintRight + size) continue;
      const age = Math.min(1, (now - (s.t || 0)) / 420);
      const e = easeOut(age);
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = 0.9 * e;
      ctx.translate(px, py);
      ctx.rotate(s.rot);
      const k = 1 + (1 - e) * 0.25;
      ctx.drawImage(sealImg(s.id), (-size / 2) * k, (-size / 2) * k, size * k, size * k);
      ctx.restore();
    }
  }
  function saveSeals() {
    try { localStorage.setItem(`shanshui-seals-${state.seed}`, JSON.stringify(state.seals.map(({ x, y, id, rot }) => ({ x, y, id, rot })))); } catch (e) { /* хранилище недоступно */ }
  }
  function loadSeals() {
    try {
      const v = JSON.parse(localStorage.getItem(`shanshui-seals-${state.seed}`) || '[]');
      state.seals = Array.isArray(v) ? v.map((s) => ({ ...s, t: 0 })) : [];
    } catch (e) { state.seals = []; }
  }

  /* ================= 16. Ввод ================= */
  let dragging = false, lastPX = 0, lastPT = 0, downX = 0, downY = 0, moved = false;
  const inPainting = (x, y) => x > revealX && x < paintRight && y > paintTop && y < paintTop + paintH;

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    dragging = true;
    moved = false;
    downX = lastPX = e.clientX;
    downY = e.clientY;
    lastPT = performance.now();
    state.vel = 0;
    state.lastInput = lastPT;
    canvas.classList.add('dragging');
    hideTip();
  });
  canvas.addEventListener('pointermove', (e) => {
    state.pointer = { x: e.clientX, y: e.clientY };
    if (dragging) {
      const now = performance.now();
      const dx = e.clientX - lastPX;
      if (Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) > 6) moved = true;
      state.viewRight -= dx / scc;
      const dtp = Math.max(1, now - lastPT);
      state.vel = lerp(state.vel, (-dx / scc / dtp) * 1000, 0.5);
      lastPX = e.clientX;
      lastPT = now;
      state.lastInput = now;
      if (state.viewRight > maxViewRight()) state.viewRight = maxViewRight();
      return;
    }
    hoverPoem(e.clientX, e.clientY);
  });
  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    canvas.classList.remove('dragging');
    if (!moved) {
      state.vel = 0;
      onTap(e.clientX, e.clientY);
    } else if (performance.now() - lastPT > 90) state.vel = 0;
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', () => { state.pointer = null; hideTip(); });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const k = e.deltaMode === 1 ? 18 : 1;
    const dy = e.deltaY * k, dxw = e.deltaX * k;
    state.viewRight += (dxw - dy) / scc;
    state.vel = 0;
    state.lastInput = performance.now();
    hideTip();
  }, { passive: false });

  addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input, textarea')) return;
    if (e.key === 'ArrowLeft') { state.vel = -900; state.lastInput = performance.now(); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { state.vel = 900; state.lastInput = performance.now(); e.preventDefault(); }
    else if (e.code === 'Space') { e.preventDefault(); setAuto(!state.auto); }
    else if (e.key === 's' || e.key === 'S' || e.key === 'ы' || e.key === 'Ы') setStamping(!state.stamping);
    else if (e.key === 'Escape') { setStamping(false); toggleInfo(false); }
  });

  function onTap(x, y) {
    if (state.stamping) {
      if (!inPainting(x, y)) return;
      state.seals.push({ x: wxOf(x), y: wyOf(y), id: dateSealId(), rot: (Math.random() - 0.5) * 0.08, t: performance.now() });
      saveSeals();
      setStamping(false);
      toast('Печать поставлена');
      return;
    }
    hoverPoem(x, y, true);
  }

  // Подсказка с переводом стихов
  const tip = $('#tip');
  let tipKey = null;
  function hoverPoem(x, y, force) {
    if (!state.ready || !inPainting(x, y)) { hideTip(); return; }
    const wx = wxOf(x), wy = wyOf(y);
    const feats = gather(wx - 200, wx + 200);
    let hit = null;
    for (const f of feats) {
      if (f.kind !== 'poem') continue;
      const L = poemLayout(f);
      const [a, b, c, d] = L.rect;
      if (wx >= a && wx <= c && wy >= b && wy <= d) { hit = { f, L }; break; }
    }
    if (!hit) { if (!force) hideTip(); return; }
    const key = hit.f.seed + state.season;
    if (key !== tipKey) {
      tipKey = key;
      const P = hit.L.P;
      tip.innerHTML = `<div class="zh">${P.zh.join('，')}。</div><div class="ru">${P.ru.map(typo).join('<br>')}</div><div class="src">${P.author} · «${P.title}» · эпоха Тан</div>`;
    }
    const tw = 320, th = tip.offsetHeight || 190;
    let tx = x + 22, ty = y - th / 2;
    if (tx + tw > W - 12) tx = x - tw - 22;
    ty = clamp(ty, 70, H - th - 12);
    tip.style.left = `${Math.max(12, tx)}px`;
    tip.style.top = `${ty}px`;
    tip.classList.add('show');
  }
  function hideTip() { tip.classList.remove('show'); }

  /* ================= 17. Интерфейс ================= */
  const toastEl = $('#toast');
  let toastTimer = 0;
  function toast(msg) {
    toastEl.textContent = typo(msg);
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
  }

  function setAuto(on) {
    state.auto = on;
    const b = $('#autoBtn');
    b.setAttribute('aria-pressed', String(on));
    b.querySelector('.i-pause').style.display = on ? '' : 'none';
    b.querySelector('.i-play').style.display = on ? 'none' : '';
    if (on) state.lastInput = -1e9;
  }
  function setStamping(on) {
    state.stamping = on;
    $('#sealBtn').setAttribute('aria-pressed', String(on));
    canvas.classList.toggle('stamping', on);
    if (on) toast('Кликните по свитку, чтобы поставить печать с сегодняшней датой');
  }
  function snapshotForFade() {
    const c = document.createElement('canvas');
    c.width = canvas.width;
    c.height = canvas.height;
    c.getContext('2d').drawImage(canvas, 0, 0);
    state.fade = c;
    state.fadeT = 1;
  }
  function setSeason(s, silent) {
    if (!silent && state.ready && s !== state.season) snapshotForFade();
    state.season = s;
    document.querySelectorAll('[data-season]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.season === s)));
    cache.clear();
    tipKey = null;
  }
  function setTime(t, silent) {
    if (!silent && state.ready && t !== state.time) snapshotForFade();
    if (t !== state.time) cache.clear();
    state.time = t;
    document.body.dataset.time = t;
    document.querySelectorAll('[data-time]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.time === t)));
  }
  function setSeed(seed) {
    state.seed = seed;
    typeMemo = [];
    sceneMemo.clear();
    cache.clear();
    $('#scrollNo').textContent = String(seed);
    try { history.replaceState(null, '', `#${seed}`); } catch (e) { /* file:// может запретить */ }
    loadSeals();
  }
  function toggleInfo(force) {
    const el = $('#info');
    const open = force != null ? force : !el.classList.contains('open');
    el.classList.toggle('open', open);
    $('#infoBtn').setAttribute('aria-expanded', String(open));
  }

  document.querySelectorAll('[data-season]').forEach((b) => b.addEventListener('click', () => setSeason(b.dataset.season)));
  document.querySelectorAll('[data-time]').forEach((b) => b.addEventListener('click', () => setTime(b.dataset.time)));
  $('#autoBtn').addEventListener('click', () => setAuto(!state.auto));
  $('#sealBtn').addEventListener('click', () => setStamping(!state.stamping));
  $('#infoBtn').addEventListener('click', () => toggleInfo());
  $('#saveBtn').addEventListener('click', () => {
    const x0 = Math.max(0, Math.round(revealX * dpr)), x1 = Math.round(paintRight * dpr);
    if (x1 - x0 < 10) return;
    const c = document.createElement('canvas');
    c.width = x1 - x0;
    c.height = HpDev;
    c.getContext('2d').drawImage(canvas, x0, paintTopDev, c.width, c.height, 0, 0, c.width, c.height);
    c.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `шань-шуй-свиток-${state.seed}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }, 'image/png');
    toast('Фрагмент свитка сохранён в PNG');
  });
  $('#newBtn').addEventListener('click', () => {
    snapshotForFade();
    setSeed(1000 + Math.floor(Math.random() * 9000));
    state.viewRight = startViewRight();
    state.vel = 0;
    beginIntro();
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#info') && !e.target.closest('#infoBtn')) toggleInfo(false);
  });

  let unrolledShown = '';
  setInterval(() => {
    if (!state.ready) return;
    const leftWorld = wxOf(RWL);
    const units = Math.max(0, PAINT_END - leftWorld);
    const m = (units / WH) * SCROLL_CM / 100;
    const txt = `${m.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} м`;
    if (txt !== unrolledShown) { unrolledShown = txt; $('#unrolled').textContent = txt; }
    if (units > 900) $('#hint').classList.add('gone');
  }, 250);

  function beginIntro() {
    state.introFrom = sx(PAINT_END);
    state.introStart = performance.now();
    state.intro = reduceMotion || SHOT ? 1 : 0;
    state.lastInput = performance.now() - 1200;
  }

  addEventListener('resize', () => {
    const keep = state.viewRight;
    layout();
    state.viewRight = Math.min(keep, maxViewRight());
  });
  document.addEventListener('visibilitychange', () => { lastT = performance.now(); });

  /* ================= 18. Старт ================= */
  async function start() {
    const fromHash = parseInt((location.hash || '').replace('#', ''), 10);
    setSeed(Number.isFinite(fromHash) && fromHash > 0 ? fromHash : 1000 + Math.floor(Math.random() * 9000));
    setSeason('summer', true);
    setTime('day', true);
    setAuto(state.auto);
    layout();
    state.viewRight = startViewRight();
    requestAnimationFrame(frame);
    const zh = '溪山无尽丙午秋日山水' + POEMS.map((p) => p.zh.join('')).join('');
    const loads = [
      document.fonts.load('40px "Ma Shan Zheng"', zh),
      document.fonts.load('40px "Rubik Mono One"', 'ОПУС0123456789IVX'),
      document.fonts.load('italic 500 30px "Cormorant Garamond"', 'Реки и горы'),
      document.fonts.load('600 17px "Cormorant Garamond"', 'СВИТОК №'),
    ];
    const allFonts = Promise.allSettled(loads).then(() => 'fonts');
    const first = await Promise.race([allFonts, new Promise((res) => setTimeout(() => res('late'), 3500))]);
    if (first === 'late') {
      // Шрифты пришли позже — перерисовываем свиток уже с ними
      allFonts.then(() => { SEAL.clear(); snapshotForFade(); cache.clear(); });
    }
    SEAL.clear();
    state.ready = true;
    beginIntro();
    $('#loader').classList.add('gone');
  }
  start();
})();
