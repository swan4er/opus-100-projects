/* 067 · Черновик — актёры: буквы, курсор, приёмы движения (прыжок, падение, полёт, набор, удаление). */
'use strict';

const FONT_SERIF = '"Noto Serif Display", "Georgia", "Times New Roman", serif';
const FONT_BANG = '"Dela Gothic One", "Arial Black", "Helvetica Neue", sans-serif';
const FONT_MONO = '"Anonymous Pro", "Courier New", monospace';

// Голоса: у каждого персонажа своя гарнитура.
const STYLE = {
  doc: { font: `400 54px ${FONT_SERIF}`, size: 54 },           // текст писателя
  grand: { font: `800 60px ${FONT_SERIF}`, size: 60 },         // «В начале было Слово» — с пафосом
  bang: { font: `400 176px ${FONT_BANG}`, size: 176 },         // «БАХ!»
  ask: { font: `italic 300 62px ${FONT_SERIF}`, size: 62 },    // «А что, если?»
  fog: { font: `italic 200 128px ${FONT_SERIF}`, size: 128 },  // «Туман и тишина…»
  end: { font: `700 64px ${FONT_MONO}`, size: 64 },            // «Конец.»
  mark: { font: `500 132px ${FONT_SERIF}`, size: 132 },        // «!» и «?» — персонажи
  dots: { font: `400 96px ${FONT_SERIF}`, size: 96 },          // точки многоточия
  point: { font: `400 78px ${FONT_SERIF}`, size: 78 },         // Точка — чуть крупнее обычной
  ui: { font: `400 26px ${FONT_MONO}`, size: 26 },
  uiB: { font: `700 26px ${FONT_MONO}`, size: 26 },
  title: { font: `400 150px ${FONT_SERIF}`, size: 150 },
  credit: { font: `italic 300 34px ${FONT_SERIF}`, size: 34 },
};

// Геометрия мира (единицы ≈ пиксели кадра 1920×1080 при z = 1)
const W = {
  pageL: -460, pageR: 460, pageT: -620, pageB: 620,
  colL: -360, colR: 360,
  base1: -470, lh: 84,
  floor: 752,
  caretDown: 15, caretH: 70, caretW: 5.5,
};
const baseline = (line) => W.base1 + (line - 1) * W.lh;

const G = 1150; // «гравитация», единиц на долю²

// ——— Буква-актёр
class Glyph {
  constructor(film, ch, style, opt = {}) {
    this.id = film.glyphs.length;
    film.glyphs.push(this);
    this.ch = ch;
    this.style = style;
    this.m = Metrics.glyph(ch, style);
    this.tr = new Track({ x: 0, y: 0, r: 0, sx: 1, sy: 1, a: 1, k: 0, sel: 0 });
    this.z = opt.z || 0;
    this.tDie = Infinity;
    this.morphs = [];
    this.tag = opt.tag || '';
    this.src = opt.src || '';
    this.heapRest = null;
  }
  get hh() { return this.m.hh; }
  // смена буквы/гарнитуры в момент t (кроссфейд с «хлопком»)
  morph(t, ch, style) {
    this.morphs.push({ t, ch, style, m: Metrics.glyph(ch, style) });
    this.morphs.sort((a, b) => a.t - b.t);
    return this;
  }
  // текущий облик в момент t: [основной, предыдущий|null, доля перехода]
  look(t) {
    let cur = this, prev = null, u = 1;
    for (const mo of this.morphs) {
      if (t >= mo.t - 0.12) { prev = cur; cur = mo; u = clamp((t - (mo.t - 0.12)) / 0.24); }
    }
    if (u >= 1) prev = null;
    return [cur, prev, u];
  }
  // положение центра буквы, стоящей на базовой линии
  static cy(m, base) { return base - m.cy; }
}

// ——— Приёмы движения (функции сегментов)

// прыжок: упреждение (присед) → дуга с растяжением → приземление со сжатием и захлёстом
function hopFn(hh, o) {
  const ant = o.ant ?? 0.2, land = o.land ?? 0.24, h = o.h ?? 60, spin = o.spin ?? 0, sq = o.sq ?? 0.3;
  return (u, a, b, out) => {
    copyInto(out, b);
    if (u < ant) {                      // присед
      const v = Ease.out2(u / ant);
      out.x = a.x; out.r = a.r;
      out.sy = 1 - sq * 0.8 * v; out.sx = 1 + sq * 0.6 * v;
      out.y = a.y + hh * (1 - out.sy);
      out.a = a.a; out.k = lerp(a.k, b.k, u);
      return out;
    }
    if (u < 1 - land) {                 // полёт
      const v = (u - ant) / (1 - ant - land);
      const ex = Ease.sine(v);
      out.x = lerp(a.x, b.x, o.xEase ? o.xEase(v) : lerp(v, ex, 0.35));
      out.y = lerp(a.y, b.y, v) - 4 * h * v * (1 - v);
      const st = 0.22 * Math.abs(2 * v - 1);
      out.sy = 1 + st; out.sx = 1 - st * 0.55;
      out.r = lerp(a.r, b.r, ex) + spin * TAU * ex;
      out.a = lerp(a.a, b.a, Math.min(1, v * 3)); out.k = lerp(a.k, b.k, v);
      return out;
    }
    const v = (u - (1 - land)) / land;  // приземление
    const s = sq * Math.exp(-v * 4.2) * Math.cos(v * 9.5);
    out.sy = 1 - s; out.sx = 1 + s * 0.7;
    out.y = b.y + hh * (1 - out.sy);
    return out;
  };
}

// баллистика: из текущей позы с начальной скоростью (vx, vy) в позу покоя; отскок в конце
function fallFn(hh, T, vy, bounce, g) {
  return (u, a, b, out, t) => {
    copyInto(out, b);
    const tot = T + bounce;
    const tau = u * tot;
    if (tau <= T) {
      const w = tau / T;
      out.x = lerp(a.x, b.x, w);
      out.y = a.y + vy * tau + 0.5 * g * tau * tau;
      // поправка, чтобы точно попасть в позу покоя
      out.y += (b.y - (a.y + vy * T + 0.5 * g * T * T)) * w;
      out.r = lerp(a.r, b.r, w);
      out.sx = lerp(a.sx, 1, Math.min(1, w * 3)); out.sy = lerp(a.sy, 1, Math.min(1, w * 3));
      out.a = b.a; out.k = lerp(a.k, b.k, w); out.sel = lerp(a.sel, b.sel, w);
      return out;
    }
    const v = (tau - T) / bounce;
    out.y = b.y - Math.sin(Math.PI * Math.min(1, v * 1.6)) * Math.min(26, hh * 0.9) * (v < 0.625 ? 1 : 0);
    const s = 0.22 * Math.exp(-v * 5) * Math.cos(v * 12);
    out.sy = 1 - s; out.sx = 1 + s * 0.6;
    return out;
  };
}

// полёт по кубической кривой Безье с вращением
function pathFn(c1, c2, o = {}) {
  const e = o.ease || Ease.io2, spin = o.spin || 0;
  return (u, a, b, out) => {
    copyInto(out, b);
    const v = e(u), w = 1 - v;
    out.x = w * w * w * a.x + 3 * w * w * v * c1.x + 3 * w * v * v * c2.x + v * v * v * b.x;
    out.y = w * w * w * a.y + 3 * w * w * v * c1.y + 3 * w * v * v * c2.y + v * v * v * b.y;
    out.r = lerp(a.r, b.r, v) + spin * TAU * v;
    out.sx = lerp(a.sx, b.sx, v); out.sy = lerp(a.sy, b.sy, v);
    out.a = lerp(a.a, b.a, Math.min(1, u * 4)); out.k = lerp(a.k, b.k, Math.min(1, u * 2));
    if (o.swirl) {                        // спираль вокруг траектории
      const R = o.swirl * (1 - v) * Math.sin(Math.PI * Math.min(1, u * 1.2));
      out.x += Math.cos(u * o.turns * TAU + (o.phase || 0)) * R;
      out.y += Math.sin(u * o.turns * TAU + (o.phase || 0)) * R * 0.6;
    }
    if (o.wave) out.y += Math.sin(u * TAU * 1.5 + (o.phase || 0)) * o.wave * (1 - v);
    return out;
  };
}

// ——— Фильм: всё, что знает кадр
class Film {
  constructor() {
    this.glyphs = [];
    this.cursor = new Track({ x: W.colL, y: W.base1 + W.caretDown, h: W.caretH, w: W.caretW, lean: 0, bend: 0, a: 1, glow: 1, sx: 0 });
    this.blink = new Steps({ mode: 'blink', t0: 0 });
    this.cam = new Camera({ x: 0, y: 0, z: 1, r: 0 });
    this.env = {
      screen: new Keys(0),   // яркость страницы (экран просыпается)
      dawn: new Keys(0),     // 0 — ночь, 1 — утро
      fade: new Keys(0),     // затемнение кадра
      title: new Keys(0),    // финальный титр
      sel: new Keys(0),      // выделение всего
      freeze: new Keys(0),
    };
    this.clock = new Steps('03:00');
    this.words = new Steps(0);
    this.cues = [];
    this.heap = new Heap(W.floor, -940, 940, 108);
    this.scenes = [];
    this.lines = [];         // подсветка выделений: {t0, t1, glyphs}
    this.cover = 0;
  }
  cue(b, type, p = {}) { this.cues.push(Object.assign({ b, type }, p)); return this; }
  blinkMode(t, mode) { this.blink.key(t, { mode, t0: t }); return this; }
  scene(b, name) { this.scenes.push({ b, name }); return this; }
  glyph(ch, style, opt) { return new Glyph(this, ch, style, opt); }
}

// ——— Буква появляется при наборе: падает сверху в строку, приседает, выпрямляется
function appear(g, t, x, y, o = {}) {
  const dy = o.dy ?? 38;
  g.tr.set(t, { x, y: y - dy, a: 0, sx: 0.86, sy: 1.22, r: o.r0 || 0, k: o.k || 0 });
  g.tr.to(t, t + 0.14, { y, a: 1, sx: 1.16, sy: 0.8, r: 0 }, Ease.in2);
  g.tr.fn(t + 0.14, t + 0.55, { sx: 1, sy: 1 }, (u, a, b, out) => {
    copyInto(out, b);
    const s = 0.2 * Math.exp(-u * 4) * Math.cos(u * 10);
    out.sy = 1 - s; out.sx = 1 + s * 0.7;
    out.y = b.y + g.hh * (1 - out.sy);
    return out;
  });
  return g;
}

function hop(g, t0, t1, x, y, o = {}) {
  g.tr.fn(t0, t1, Object.assign({ x, y, sx: 1, sy: 1 }, o.patch || {}), hopFn(g.hh, o));
  return g;
}

function flyPath(g, t0, t1, x, y, c1, c2, o = {}) {
  g.tr.fn(t0, t1, Object.assign({ x, y }, o.patch || {}), pathFn(c1, c2, o));
  return g;
}

// падение в кучу; возвращает момент касания
function fallToHeap(film, g, t, o = {}) {
  const s = g.tr.stateAt(t);
  const rnd = film.heap.rnd;
  const g2 = o.g ?? G;
  const vy = o.vy ?? -(90 + rnd() * 120);
  const vx = o.vx ?? (rnd() - 0.5) * 160;
  const w = Math.max(g.m.w, g.hh), hh = g.hh;
  // оценка точки падения → место в куче → точное время
  const est = (yEnd) => (-vy + Math.sqrt(vy * vy + 2 * g2 * Math.max(1, yEnd - s.y))) / g2;
  const T0 = est(W.floor - 60);
  const rest = film.heap.place(s.x + vx * T0 + (o.dx || 0), w, hh, o.rest);
  const T = est(rest.y);
  // выбираем угол с разумным числом оборотов
  const turns = o.turns ?? (0.3 + rnd() * 1.2);
  let r1 = rest.r;
  const want = s.r + (vx >= 0 ? 1 : -1) * turns * TAU;
  r1 += Math.round((want - r1) / TAU) * TAU;
  const bounce = o.bounce ?? 0.42;
  g.tr.fn(t, t + T + bounce, { x: rest.x, y: rest.y, r: r1, sx: 1, sy: 1, a: 1, k: o.k ?? 0, sel: 0 },
    fallFn(hh, T, vy, bounce, g2));
  g.heapRest = { x: rest.x, y: rest.y, r: r1, t: t + T + bounce };
  (film.pool || (film.pool = new Set())).add(g);
  if (o.clink !== false) film.cue(t + T, 'clink', { v: o.vol ?? 0.5, p: rnd(), pan: clamp(rest.x / 900, -1, 1) });
  return t + T;
}

// ——— Курсор: приёмы
const Caret = {
  // пихнуть курсор вправо к позиции x (при наборе буквы)
  push(film, t, x, o = {}) {
    const c = film.cursor;
    c.to(t, t + (o.d ?? 0.14), { x }, Ease.out3);
    c.add(t, t + 0.34, (tt, out, u) => { out.lean += -(o.lean ?? 0.1) * Math.sin(u * Math.PI); });
  },
  hop(film, t0, t1, x, y, o = {}) {
    const c = film.cursor;
    const h0 = o.h0 ?? c.cur.h;
    const hgt = o.arc ?? 60;
    c.fn(t0, t1, { x, y, h: h0, lean: o.lean ?? 0, bend: 0 }, (u, a, b, out) => {
      copyInto(out, b);
      const ant = 0.22, land = 0.26;
      if (u < ant) { const v = Ease.out2(u / ant); out.x = a.x; out.y = a.y; out.h = lerp(a.h, h0 * 0.72, v); out.lean = a.lean * (1 - v); return out; }
      if (u < 1 - land) {
        const v = (u - ant) / (1 - ant - land);
        out.x = lerp(a.x, b.x, Ease.sine(v));
        out.y = lerp(a.y, b.y, v) - 4 * hgt * v * (1 - v);
        out.h = h0 * (1 + 0.28 * Math.abs(2 * v - 1));
        out.lean = (b.x - a.x > 0 ? 1 : -1) * 0.25 * Math.sin(Math.PI * v) + (o.spin || 0) * TAU * v;
        return out;
      }
      const v = (u - (1 - land)) / land;
      out.h = h0 * (1 - 0.3 * Math.exp(-v * 4) * Math.cos(v * 9));
      return out;
    });
  },
  wiggle(film, t0, t1, amp, freq, field = 'lean') {
    film.cursor.add(t0, t1, (t, out, u) => { out[field] += Math.sin((t - t0) * freq * TAU) * amp * Math.sin(Math.PI * u); });
  },
};

// ——— Набор строки: буквы по одной в заданные моменты, курсор идёт следом
function typeLine(film, text, style, x0, base, times, o = {}) {
  const L = Metrics.line(text, style);
  const out = [];
  L.chars.forEach((c, i) => {
    const t = times[i];
    const x = x0 + c.x1 + 5;
    if (c.ch === ' ') {
      out.push(null);
      if (!o.silent) film.cue(t, 'key', { kind: 'space', v: o.vol ?? 0.8 });
    } else {
      const g = film.glyph(c.ch, style, { tag: o.tag, src: o.src });
      appear(g, t, x0 + c.cx, Glyph.cy(g.m, base), { dy: o.dy, k: o.k });
      g.base = base; g.lineX = x0 + c.cx;
      out.push(g);
      if (!o.silent) film.cue(t, 'key', { kind: o.kind || 'key', v: o.vol ?? 0.8, p: hash(i * 31 + text.length) });
    }
    if (!o.noCaret) Caret.push(film, t, x, { lean: o.lean });
  });
  out.layout = L;
  out.x0 = x0; out.base = base;
  return out;
}

// ровный ритм набора: moments(beat0, [шаги в долях])
function rhythm(t0, steps) {
  const r = [];
  let t = t0;
  for (const s of steps) { r.push(t); t += s; }
  return r;
}
