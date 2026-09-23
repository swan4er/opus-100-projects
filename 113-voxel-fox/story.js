// ───────────────────────────────────────────────────────────────────────────
//  «Лисий дом» — сценарий: темп, сцены, титры, кривые окружения и утилиты
//  анимации. Всё в фильме — функция от времени t (секунды), поэтому любой
//  кадр можно получить перемоткой.
// ───────────────────────────────────────────────────────────────────────────
(function () {
  'use strict';

  const BPM = 96;
  const BEAT = 60 / BPM;          // 0,625 с
  const BAR = BEAT * 4;           // 2,5 с

  // ── Плавности ────────────────────────────────────────────────────────────
  const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, k) => a + (b - a) * k;
  const smooth = (a, b, x) => { const k = clamp((x - a) / (b - a)); return k * k * (3 - 2 * k); };
  const E = {
    lin: (x) => x,
    in: (x) => x * x * x,
    out: (x) => 1 - Math.pow(1 - x, 3),
    io: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
    sin: (x) => 0.5 - 0.5 * Math.cos(Math.PI * x),
    in2: (x) => x * x,
    out2: (x) => 1 - (1 - x) * (1 - x),
    back: (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
    backIn: (x) => { const c1 = 1.70158, c3 = c1 + 1; return c3 * x * x * x - c1 * x * x; },
    elastic: (x) => (x <= 0 ? 0 : x >= 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * (2 * Math.PI / 3)) + 1),
    step: (x) => (x < 1 ? 0 : 1),
    hold: () => 0,
  };

  // ── Ключевые кадры для одного числа: [[t, v, плавность], ...] ─────────────
  // Плавность у ключа описывает переход от предыдущего ключа к этому.
  function track(keys) {
    const ks = keys.slice().sort((a, b) => a[0] - b[0]);
    return function (t) {
      if (t <= ks[0][0]) return ks[0][1];
      const n = ks.length;
      if (t >= ks[n - 1][0]) return ks[n - 1][1];
      let lo = 0, hi = n - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ks[m][0] <= t) lo = m; else hi = m; }
      const a = ks[lo], b = ks[hi];
      const e = E[b[2] || 'io'] || E.io;
      return lerp(a[1], b[1], e((t - a[0]) / (b[0] - a[0])));
    };
  }
  // То же для векторов/цветов: значения — массивы.
  function vtrack(keys) {
    const ks = keys.slice().sort((a, b) => a[0] - b[0]);
    const dim = ks[0][1].length;
    const out = new Array(dim);
    return function (t) {
      const n = ks.length;
      let a, b, k = 0;
      if (t <= ks[0][0]) { a = b = ks[0]; }
      else if (t >= ks[n - 1][0]) { a = b = ks[n - 1]; }
      else {
        let lo = 0, hi = n - 1;
        while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ks[m][0] <= t) lo = m; else hi = m; }
        a = ks[lo]; b = ks[hi];
        k = (E[b[2] || 'io'] || E.io)((t - a[0]) / (b[0] - a[0]));
      }
      for (let i = 0; i < dim; i++) out[i] = lerp(a[1][i], b[1][i], k);
      return out;
    };
  }

  // Детерминированный шум
  function hash1(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123; return s - Math.floor(s); }
  function noise1(x) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(hash1(i), hash1(i + 1), u) * 2 - 1; }

  // ── Сцены и титры ────────────────────────────────────────────────────────
  const DURATION = 104;
  const SCENES = [
    { t: 0, name: 'Осень' },
    { t: 20, name: 'Брёвна' },
    { t: 45, name: 'Ветер' },
    { t: 65, name: 'Первый снег' },
    { t: 80, name: 'Свет в окне' },
  ];
  const CAPTIONS = [
    { t0: 1.3, t1: 5.4, text: 'Лисий дом', kind: 'title' },
    { t0: 13.4, t1: 17.2, text: 'Скоро снег. А дома у лисы нет.', kind: 'sub' },
    { t0: 95.8, t1: 100.4, text: 'Лисий дом', kind: 'title' },
    { t0: 100.7, t1: 104, text: 'Конец', kind: 'end' },
  ];

  // ── Кривые окружения (общие для картинки и звука) ────────────────────────
  // Ветер: 0 — штиль, 1 — буря.
  const windBase = track([
    [0, 0.18], [6.9, 0.2], [7.3, 0.85, 'out'], [8.6, 0.25], [20, 0.22], [40, 0.25],
    [42.3, 0.45], [45, 0.4], [50, 0.5], [53.4, 0.75], [54.4, 1.0, 'in'], [58.3, 1.0], [59.2, 0.35, 'out'],
    [61, 0.35], [64.5, 0.25], [66, 0.06], [80, 0.04], [104, 0.03],
  ]);
  const wind = (t) => clamp(windBase(t) * (1 + 0.28 * noise1(t * 0.9) + 0.12 * noise1(t * 3.1 + 7)), 0, 1.3);
  // Интеграл ветра — смещение листьев и снега (табличка, чтобы оставаться функцией t)
  const WSTEP = 0.05, WN = Math.ceil(DURATION / WSTEP) + 2, WINT = new Float32Array(WN);
  for (let i = 1; i < WN; i++) WINT[i] = WINT[i - 1] + wind((i - 0.5) * WSTEP) * WSTEP;
  function windDrift(t) { const x = clamp(t, 0, DURATION) / WSTEP, i = Math.floor(x), f = x - i; return lerp(WINT[Math.min(i, WN - 1)], WINT[Math.min(i + 1, WN - 1)], f); }

  // Снегопад (сколько снежинок в воздухе) и снежный покров на земле
  const snowfall = track([[0, 0], [68.5, 0], [70.3, 0.25, 'in'], [74, 0.55], [80, 0.75], [92, 1], [104, 1]]);
  const snowCover = track([[0, 0], [70.5, 0], [76, 0.3], [80, 0.62], [86, 0.8], [104, 0.92]]);
  // Огонь в очаге и свет в окне
  const fire = track([[0, 0], [80.9, 0], [81.25, 1, 'out'], [104, 1]]);

  window.STORY = {
    BPM, BEAT, BAR, DURATION, SCENES, CAPTIONS,
    COVER: 82.6,
    E, clamp, lerp, smooth, track, vtrack, hash1, noise1,
    wind, windDrift, snowfall, snowCover, fire,
    bar: (n) => n * BAR, beat: (n) => n * BEAT,
  };
})();
