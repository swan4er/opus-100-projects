/* ================================================================
   Тихоречинск — ядро: пространство имён LC, случайность, время, утилиты.
   Всё, что не зависит от three.js. Порядок подключения:
   data.js → core.js → citygen.js → people.js → life.js → days.js → traffic.js
   → sky.js → render.js → actors.js → brain.js → paper.js → ui.js → main.js
   (+ встроенный модуль, который грузит three.js с CDN и вызывает LC.boot)
   ================================================================ */
window.LC = window.LC || {};
(function (LC) {
  'use strict';

  // ---------- параметры мира ----------
  LC.CFG = {
    seed: 12117,
    people: 10000,
    cars: 1000,
    daySeconds: 1440,       // при ×1 сутки идут 24 минуты: игровая минута — секунда
    startMinute: 19 * 60 + 0,  // первый кадр — синий час: фонари и окна загораются
    shotMinute: 19 * 60 + 12,  // обложка — синие сумерки, огни уже горят
    warmMinutes: 50,           // сколько минут мир «прогревается» до первого кадра
    startDay: 4,            // пятница (0 — понедельник)
  };
  // часы: минут игрового времени за секунду реального при скорости ×1
  LC.CLOCK_RATE = 1440 / LC.CFG.daySeconds;

  // ---------- случайность ----------
  LC.mulberry32 = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  // детерминированный хеш двух целых → [0, 1)
  LC.hash2 = function (a, b) {
    let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul((b | 0) + 0x165667b1, 0x85ebca6b);
    h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  };
  LC.makeRng = function (seed) {
    const r = LC.mulberry32(seed);
    r.int = (a, b) => a + Math.floor(r() * (b - a + 1));
    r.pick = (arr) => arr[Math.floor(r() * arr.length)];
    r.chance = (p) => r() < p;
    r.range = (a, b) => a + r() * (b - a);
    r.gauss = () => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    r.weighted = (arr, wf) => {
      let sum = 0; for (const x of arr) sum += wf(x);
      let t = r() * sum;
      for (const x of arr) { t -= wf(x); if (t <= 0) return x; }
      return arr[arr.length - 1];
    };
    r.shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; } return arr; };
    return r;
  };

  // ---------- математика ----------
  LC.clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  LC.lerp = (a, b, t) => a + (b - a) * t;
  LC.smooth = (a, b, x) => { const t = LC.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  LC.dist = (ax, az, bx, bz) => Math.hypot(bx - ax, bz - az);

  // ---------- время ----------
  LC.DAYS = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
  LC.DAYS_SHORT = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
  LC.fmt = function (min) {
    min = ((Math.floor(min) % 1440) + 1440) % 1440;
    const h = Math.floor(min / 60), m = min % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  };
  // «через 12 мин», «1 ч 5 мин»
  LC.fmtDur = function (min) {
    min = Math.max(0, Math.round(min));
    if (min < 60) return min + ' мин';
    const h = Math.floor(min / 60), m = min % 60;
    return h + ' ч' + (m ? ' ' + m + ' мин' : '');
  };
  // склонение числительных: plural(5, 'минута','минуты','минут')
  LC.plural = function (n, one, few, many) {
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    if (b === 1) return one;
    return many;
  };
  LC.ageWord = (n) => n + ' ' + LC.plural(n, 'год', 'года', 'лет');

  // ---------- русские строки с родом: «приш{ёл|ла}», «{м|ж}» ----------
  LC.g = function (str, female) {
    return String(str).replace(/\{([^{}|]*)\|([^{}]*)\}/g, (_, m, f) => (female ? f : m));
  };
  LC.fill = function (str, vars, female) {
    const s = LC.g(str, female);
    return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : ''));
  };
  // неразрывные пробелы после коротких слов (для интерфейса)
  LC.nbsp = function (s) {
    return String(s).replace(/(^|[\s(«])(в|к|с|и|а|но|на|по|за|от|до|из|не|у|о|об|во|со|ко|же|ли|бы)\s/gi, '$1$2 ');
  };
  LC.cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
  LC.esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- двоичная куча для Дейкстры ----------
  LC.Heap = class {
    constructor(cap) { this.k = new Float64Array(cap); this.v = new Int32Array(cap); this.n = 0; }
    clear() { this.n = 0; }
    push(key, val) {
      if (this.n >= this.k.length) {
        const k2 = new Float64Array(this.k.length * 2); k2.set(this.k); this.k = k2;
        const v2 = new Int32Array(this.v.length * 2); v2.set(this.v); this.v = v2;
      }
      let i = this.n++;
      const K = this.k, V = this.v;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (K[p] <= key) break;
        K[i] = K[p]; V[i] = V[p]; i = p;
      }
      K[i] = key; V[i] = val;
    }
    pop() { // возвращает значение, ключ — в this.lastKey
      const K = this.k, V = this.v;
      const top = V[0]; this.lastKey = K[0];
      const key = K[--this.n], val = V[this.n];
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= this.n) break;
        if (c + 1 < this.n && K[c + 1] < K[c]) c++;
        if (K[c] >= key) break;
        K[i] = K[c]; V[i] = V[c]; i = c;
      }
      K[i] = key; V[i] = val;
      return top;
    }
  };

  // ---------- шина событий ----------
  const handlers = {};
  LC.on = (name, fn) => { (handlers[name] = handlers[name] || []).push(fn); };
  LC.emit = (name, data) => { const list = handlers[name]; if (list) for (const fn of list) { try { fn(data); } catch (e) { console.warn(e); } } };

  // ---------- часы мира ----------
  LC.clock = {
    day: LC.CFG.startDay,       // номер дня с начала (0 — понедельник первой недели)
    min: LC.CFG.startMinute,    // минута суток, дробная
    speed: 1,                   // множитель к базовой скорости (сутки за 9 минут)
    paused: false,
    get weekday() { return ((this.day % 7) + 7) % 7; },
    get weekend() { return this.weekday >= 5; },
    get abs() { return this.day * 1440 + this.min; }, // абсолютное время в минутах
  };
})(window.LC);
