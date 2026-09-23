/* 067 · Черновик — движок фильма.
   Всё, что видно в кадре, — функция от времени t (в долях такта, 112 ударов в минуту).
   Здесь: математика и easing, детерминированный шум, треки актёров, камера, куча букв. */
'use strict';

const BPM = 112;
const BEAT = 60 / BPM;            // секунд в одной доле
const FILM_BEATS = 196;
const FILM_SEC = FILM_BEATS * BEAT;
const TAU = Math.PI * 2;

// ——— Математика
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, u) => a + (b - a) * u;
const invlerp = (a, b, x) => clamp((x - a) / (b - a));
const smooth = (u) => u * u * (3 - 2 * u);

const Ease = {
  lin: (u) => u,
  in2: (u) => u * u,
  out2: (u) => 1 - (1 - u) * (1 - u),
  io2: (u) => (u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u)),
  in3: (u) => u * u * u,
  out3: (u) => 1 - Math.pow(1 - u, 3),
  io3: (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2),
  out5: (u) => 1 - Math.pow(1 - u, 5),
  io5: (u) => (u < 0.5 ? 16 * Math.pow(u, 5) : 1 - Math.pow(-2 * u + 2, 5) / 2),
  sine: (u) => 0.5 - 0.5 * Math.cos(Math.PI * u),
  outBack: (u) => { const s = 1.9; const v = u - 1; return 1 + (s + 1) * v * v * v + s * v * v; },
  inBack: (u) => { const s = 1.7; return (s + 1) * u * u * u - s * u * u; },
  outElastic: (u) => (u <= 0 ? 0 : u >= 1 ? 1 : Math.pow(2, -9 * u) * Math.sin((u * 9 - 0.75) * (TAU / 3)) + 1),
};

// ——— Детерминированный случай
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(n) {
  let x = (n | 0) ^ 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}
// Гладкий одномерный шум в [-1, 1]
function vnoise(x, seed = 0) {
  const i = Math.floor(x), f = x - i;
  const a = hash(i * 7919 + seed * 104729), b = hash((i + 1) * 7919 + seed * 104729);
  return lerp(a, b, smooth(f)) * 2 - 1;
}

// ——— Трек актёра: последовательность сегментов, каждый — функция прогресса u ∈ [0, 1].
// Состояние — плоский объект с числовыми полями. Новый сегмент, начатый раньше конца
// предыдущего, перебивает его: стартует из фактического состояния в момент t0.
function copyInto(o, s) { for (const k in s) o[k] = s[k]; return o; }
function mixInto(o, a, b, u) { for (const k in b) o[k] = a[k] + (b[k] - a[k]) * u; return o; }

class Track {
  constructor(init) {
    this.segs = [];
    this.cur = Object.assign({}, init);
    this.tEnd = -Infinity;
    this.fx = [];
  }
  _evalSeg(s, t, out) {
    if (!s.fn || t >= s.t1) return copyInto(out, s.to);
    return s.fn(clamp((t - s.t0) / (s.t1 - s.t0)), s.from, s.to, out, t);
  }
  stateAt(t) {
    const o = {};
    if (!this.segs.length) return copyInto(o, this.cur);
    const s = this._find(t);
    return s ? this._evalSeg(s, t, copyInto(o, s.from)) : copyInto(o, this.segs[0].from);
  }
  _find(t) {
    const segs = this.segs;
    if (!segs.length || t < segs[0].t0) return null;
    let lo = 0, hi = segs.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (segs[mid].t0 <= t) lo = mid; else hi = mid - 1;
    }
    return segs[lo];
  }
  _push(t0, t1, patch, fn, extra) {
    let from;
    if (this.segs.length && t0 < this.tEnd) from = this.stateAt(t0);
    else from = Object.assign({}, this.cur);
    const to = Object.assign({}, from, patch);
    const seg = { t0, t1: Math.max(t1, t0), from, to, fn };
    if (extra) Object.assign(seg, extra);
    // Сценарий пишет трек по порядку времени. Вставка «в прошлое» — ошибка сценария, но массив
    // остаётся отсортированным (на нём держится двоичный поиск), и «текущее» состояние не сбивается.
    const last = this.segs[this.segs.length - 1];
    if (last && t0 < last.t0) {
      let i = this.segs.length;
      while (i > 0 && this.segs[i - 1].t0 > t0) i--;
      this.segs.splice(i, 0, seg);
      return this;
    }
    this.segs.push(seg);
    this.cur = to;
    this.tEnd = seg.t1;
    return this;
  }
  set(t, patch) { return this._push(t, t, patch, null); }
  to(t0, t1, patch, ease = Ease.io2) {
    return this._push(t0, t1, patch, (u, a, b, o) => mixInto(o, a, b, ease(u)));
  }
  fn(t0, t1, patch, f) { return this._push(t0, t1, patch, f); }
  // Наложение поверх трека (дрожь, смех, тряска): не влияет на расчёт следующих сегментов.
  add(t0, t1, f) { this.fx.push({ t0, t1, f }); return this; }
  sample(t, out) {
    const s = this._find(t);
    if (!s) return null;
    copyInto(out, s.from);
    this._evalSeg(s, t, out);
    for (let i = 0; i < this.fx.length; i++) {
      const f = this.fx[i];
      if (t >= f.t0 && t <= f.t1) f.f(t, out, (t - f.t0) / (f.t1 - f.t0 || 1));
    }
    return out;
  }
}

// ——— Скалярные ключи (свет, бумага, затемнение)
class Keys {
  constructor(v0) { this.k = [{ t: -1e9, v: v0, e: Ease.lin }]; }
  key(t, v, e = Ease.io2) { this.k.push({ t, v, e }); this.k.sort((a, b) => a.t - b.t); return this; }
  hold(t) { return this.key(t, this.at(t), Ease.lin); }
  at(t) {
    const k = this.k;
    if (t >= k[k.length - 1].t) return k[k.length - 1].v;
    let i = 0;
    while (i < k.length - 1 && k[i + 1].t <= t) i++;
    const a = k[i], b = k[i + 1];
    return lerp(a.v, b.v, b.e(invlerp(a.t, b.t, t)));
  }
}
// Ступеньки (часы, счётчик слов, подписи)
class Steps {
  constructor(v0) { this.k = [{ t: -1e9, v: v0 }]; }
  key(t, v) { this.k.push({ t, v }); this.k.sort((a, b) => a.t - b.t); return this; }
  at(t) { let v = this.k[0].v; for (const s of this.k) { if (s.t <= t) v = s.v; else break; } return v; }
}

// ——— Камера: ключи (x, y — центр кадра в мире, z — масштаб, r — крен), монтажные склейки.
class Camera {
  constructor(pose) {
    this.k = [Object.assign({ t: -1e9, cut: false, e: Ease.lin }, pose)];
    this.shakes = [];
  }
  _last() { return this.k[this.k.length - 1]; }
  hold(t) { const p = this._last(); this.k.push({ t, x: p.x, y: p.y, z: p.z, r: p.r, e: Ease.lin, cut: false }); return this; }
  move(t, pose, e = Ease.io3) {
    const p = this._last();
    this.k.push({ t, x: pose.x ?? p.x, y: pose.y ?? p.y, z: pose.z ?? p.z, r: pose.r ?? p.r, e, cut: false });
    return this;
  }
  cut(t, pose) {
    const p = this._last();
    this.hold(t - 1e-4);
    this.k.push({ t, x: pose.x ?? p.x, y: pose.y ?? p.y, z: pose.z ?? p.z, r: pose.r ?? 0, e: Ease.lin, cut: true });
    return this;
  }
  shake(t, amp, decay = 5, freq = 9) { this.shakes.push({ t, amp, decay, freq }); return this; }
  at(t, out) {
    const k = this.k;
    let i = 0;
    let lo = 0, hi = k.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (k[mid].t <= t) lo = mid; else hi = mid - 1; }
    i = lo;
    const a = k[i], b = k[i + 1];
    if (!b || b.cut) { out.x = a.x; out.y = a.y; out.z = a.z; out.r = a.r; }
    else {
      const u = b.e(invlerp(a.t, b.t, t));
      out.x = lerp(a.x, b.x, u);
      out.y = lerp(a.y, b.y, u);
      out.z = Math.exp(lerp(Math.log(a.z), Math.log(b.z), u));
      out.r = lerp(a.r, b.r, u);
    }
    // лёгкая «ручная» камера: дрейф постоянный в экранных пикселях
    const drift = 3.2 / out.z;
    out.x += vnoise(t * 0.35, 11) * drift;
    out.y += vnoise(t * 0.31, 12) * drift;
    out.r += vnoise(t * 0.22, 13) * 0.0025;
    // толчки
    for (let j = 0; j < this.shakes.length; j++) {
      const s = this.shakes[j];
      const dt = t - s.t;
      if (dt < 0 || dt > 2.5) continue;
      const env = Math.exp(-dt * s.decay);
      out.x += vnoise(t * s.freq, 21 + j) * s.amp * env / out.z;
      out.y += vnoise(t * s.freq, 41 + j) * s.amp * env / out.z;
      out.r += vnoise(t * s.freq, 61 + j) * s.amp * env * 0.0009;
    }
    return out;
  }
}

// ——— Куча удалённых букв на «полу» под страницей: карта высот, детерминированная укладка.
class Heap {
  constructor(floorY, x0, x1, seed) {
    this.floor = floorY;
    this.x0 = x0; this.x1 = x1;
    this.bin = 6;
    this.h = new Float32Array(Math.ceil((x1 - x0) / this.bin) + 1);
    this.rnd = mulberry32(seed);
  }
  _range(x, half) {
    const a = Math.max(0, Math.floor((x - half - this.x0) / this.bin));
    const b = Math.min(this.h.length - 1, Math.ceil((x + half - this.x0) / this.bin));
    return [a, b];
  }
  topAt(x, half) {
    const [a, b] = this._range(x, half);
    let m = 0;
    for (let i = a; i <= b; i++) m = Math.max(m, this.h[i]);
    return m;
  }
  // w, hh — ширина и полувысота глифа; возвращает позу покоя {x, y, r}
  place(x, w, hh, rOpt) {
    const rnd = this.rnd;
    x = clamp(x, this.x0 + 30, this.x1 - 30);
    let r = rOpt;
    if (r === undefined) {
      const p = rnd();
      if (p < 0.42) r = (rnd() < 0.5 ? -1 : 1) * (Math.PI / 2 + (rnd() - 0.5) * 0.5);
      else if (p < 0.62) r = Math.PI + (rnd() - 0.5) * 0.6;
      else r = (rnd() - 0.5) * 0.9;
    }
    const h = hh * 2;
    const c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r));
    const fw = w * c + h * s, fh = w * s + h * c;
    const top = this.topAt(x, fw * 0.38) * 0.9;
    const y = this.floor - top - fh / 2 + 2;
    const [a, b] = this._range(x, fw * 0.36);
    for (let i = a; i <= b; i++) this.h[i] = Math.max(this.h[i], top + fh * 0.86);
    return { x, y, r };
  }
}

// ——— Метрики глифов (ширина, подъём, спуск) — меряем реальным шрифтом на скрытом холсте.
const Metrics = {
  ctx: null,
  cache: new Map(),
  init() { this.ctx = document.createElement('canvas').getContext('2d'); this.cache.clear(); },
  glyph(ch, style) {
    const key = style.font + '|' + ch;
    let m = this.cache.get(key);
    if (m) return m;
    const c = this.ctx;
    c.font = style.font;
    const tm = c.measureText(ch);
    let asc = tm.actualBoundingBoxAscent, desc = tm.actualBoundingBoxDescent;
    if (!(asc > 0) && !(desc > 0)) { asc = style.size * 0.5; desc = 0; }
    m = { w: tm.width, asc, desc, hh: Math.max(4, (asc + desc) / 2), cy: (asc - desc) / 2 };
    this.cache.set(key, m);
    return m;
  },
  // x-позиции центров символов строки с учётом кернинга (по ширине префикса)
  line(text, style) {
    const c = this.ctx;
    c.font = style.font;
    const res = [];
    for (let i = 0; i < text.length; i++) {
      const x0 = c.measureText(text.slice(0, i)).width;
      const x1 = c.measureText(text.slice(0, i + 1)).width;
      res.push({ ch: text[i], x0, x1, cx: (x0 + x1) / 2 });
    }
    return { chars: res, width: c.measureText(text).width };
  },
};
