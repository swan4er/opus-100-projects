(() => {
'use strict';

/* ================================================================
   Конструктивизм — генератор плакатов в духе авангарда 1920-х.
   Плакат живёт в системе координат 600×900. Каждый лист — список
   примитивов (многоугольники, круги, текст, растровые точки),
   который рисуется на Canvas с анимацией сборки и выгружается в SVG.
   ================================================================ */

const W = 600, H = 900, M = 34, TAU = Math.PI * 2;
const $ = (s) => document.querySelector(s);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* ---------- Палитры и шрифты ---------- */
const PALETTES = {
  classic: { name: 'Классика', paper: '#EBE1C9', R: '#D2291D', K: '#17120E', T: '#8E857A' },
  ochre:   { name: 'Охра',     paper: '#EEE2C4', R: '#CE2A1C', K: '#1A140F', T: '#D8981C' },
  steel:   { name: 'Сталь',    paper: '#E7E1D1', R: '#C92A1E', K: '#14161B', T: '#3B5B7B' },
};
const F = {
  mono:  { fam: '"Rubik Mono One", "Arial Black", sans-serif', w: 400 },
  dela:  { fam: '"Dela Gothic One", "Arial Black", sans-serif', w: 400 },
  russo: { fam: '"Russo One", "Arial Black", sans-serif', w: 400 },
  osw:   { fam: '"Oswald", "Arial Narrow", sans-serif', w: 700 },
  oswM:  { fam: '"Oswald", "Arial Narrow", sans-serif', w: 500 },
};
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Dela+Gothic+One&family=Oswald:wght@300;500;700&family=Rubik+Mono+One&family=Russo+One&display=swap';

const SLOGANS = [
  'Красным клином — по скуке!',
  'Искусство — в жизнь!',
  'Книги по всем отраслям знания',
  'Кино — глаз эпохи',
  'Свет! Сталь! Скорость!',
  'Геометрия — язык будущего',
  'Машина пишет плакаты',
  'Код — новая поэзия',
  'Радио слышно везде',
  'Читай! Думай! Строй!',
  'Все на выставку новых форм!',
  'Новый быт — новая форма',
  'Театр! Музыка! Танец!',
  'Выше! Быстрее! Дальше!',
  'Каждая линия — движение',
  'Форма следует за идеей',
  'Тишина отменяется!',
  'Завтра начинается сегодня',
  'Глаз, ухо, мозг — всё в дело!',
  'Поэзия — тоже инженерия',
];
const SUBLINES = ['Вход свободный', 'Только три дня', 'Смотрите все!', 'Выпуск № 3', 'Открыто ежедневно',
  'Начало в 19 часов', 'Цена 5 коп.', 'Спрашивайте в киосках', 'Лекция и диспут', 'Издание мастерской'];

/* ---------- Случайность с зерном (mulberry32) ---------- */
function RNG(seed) {
  let a = (seed >>> 0) || 1;
  const f = () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    f,
    range: (x, y) => x + (y - x) * f(),
    int: (x, y) => Math.floor(x + (y - x + 1) * f()),
    pick: (arr) => arr[Math.floor(f() * arr.length)],
    chance: (p) => f() < p,
    shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(f() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; },
  };
}

const ease = {
  outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t) => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
};

/* ---------- Измерение текста ---------- */
const mctx = document.createElement('canvas').getContext('2d');
let mcache = new Map();
const fstr = (f, size) => `${f.w} ${size}px ${f.fam}`;
function meas(str, f) {
  const key = f.fam + f.w + '\u0001' + str;
  let m = mcache.get(key);
  if (!m) {
    mctx.font = fstr(f, 100);
    const t = mctx.measureText(str);
    m = { adv: t.width, l: t.actualBoundingBoxLeft, r: t.actualBoundingBoxRight, a: t.actualBoundingBoxAscent, d: t.actualBoundingBoxDescent };
    mcache.set(key, m);
  }
  return m;
}
const capOf = (f) => meas('Н', f).a / 100;

/* ---------- Раскладка текста ---------- */
// Короткие слова, которые не должны оставаться в конце строки.
const GLUE = new Set(['В', 'ВО', 'К', 'КО', 'С', 'СО', 'О', 'ОБ', 'А', 'И', 'НО', 'НА', 'ПО', 'ЗА', 'ОТ', 'ДО', 'ИЗ', 'НЕ', 'НИ', 'У', 'ДЛЯ', 'БЕЗ', 'ПРИ', 'ПРО', 'НАД', 'ПОД']);
function tokenize(s) {
  const words = s.toUpperCase().replace(/[«»"„“]/g, '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const merged = [];
  for (const w of words) {
    if (/^[—–-]+$/.test(w) && merged.length) { merged[merged.length - 1] += ' —'; continue; }
    merged.push(w);
  }
  const out = [];
  let carry = '';
  merged.forEach((t, i) => {
    const bare = t.replace(/[^А-ЯЁA-Z]/g, '');
    if (GLUE.has(bare) && i < merged.length - 1 && !/[—!?.,:;]$/.test(t)) { carry += t + ' '; return; }
    out.push(carry + t);
    carry = '';
  });
  if (carry.trim()) out.push(carry.trim());
  return out.length ? out : ['ПЛАКАТ'];
}
// Перебор всех разбиений на k строк: ровные длины, без огрызков.
function breakLines(toks, k, rng) {
  const n = toks.length;
  k = clamp(k, 1, n);
  if (k === 1) return [toks.join(' ')];
  if (k === n) return toks.slice();
  let best = null, bestCost = Infinity;
  const cut = [];
  (function rec(start, left) {
    if (left === 1) {
      const lines = [];
      let s = 0;
      for (const c of [...cut, n]) { lines.push(toks.slice(s, c).join(' ')); s = c; }
      const lens = lines.map((l) => l.length);
      const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
      let cost = lens.reduce((a, l) => a + (l - mean) ** 2, 0) / lens.length;
      for (const l of lens) if (l <= 2) cost += 40;
      cost += rng.f() * 3;
      if (cost < bestCost) { bestCost = cost; best = lines; }
      return;
    }
    for (let i = start + 1; i <= n - (left - 1); i++) { cut.push(i); rec(i, left - 1); cut.pop(); }
  })(0, k);
  return best;
}
function linesFor(toks, rng, lo, hi) {
  const chars = toks.join(' ').length;
  const k = Math.round(chars / rng.range(6.5, 9.5));
  return clamp(clamp(k, lo, hi), 1, toks.length);
}
// Одна строка — акцентный цвет (строка с «!» или случайная).
function paint(lines, rng, base = 'K', accent = 'R') {
  let a = lines.findIndex((l) => l.includes('!'));
  if (a < 0) a = rng.int(0, lines.length - 1);
  return lines.map((str, i) => ({ str, fill: i === a ? accent : base }));
}
function fitLine(str, f, width, maxCap) {
  const m = meas(str, f), ink = m.l + m.r;
  let size = (width / ink) * 100;
  if (maxCap && (m.a * size) / 100 > maxCap) size = (maxCap / m.a) * 100;
  const k = size / 100;
  return { str, f, size, inkW: ink * k, asc: m.a * k, desc: m.d * k, left: m.l * k };
}
// Стопка строк, каждая растянута на одну ширину — главный приём наборных плакатов.
function makeBlock(lines, width, gap, align) {
  let y = 0;
  const items = [];
  lines.forEach((L, i) => {
    const t = fitLine(L.str, L.f, width, L.maxCap);
    const x0 = (width - t.inkW) * (align === 'center' ? 0.5 : align === 'right' ? 1 : 0);
    const base = y + t.asc;
    items.push({ ...t, fill: L.fill, stroke: L.stroke, lw: L.lw, x0, lx: x0 + t.left, ly: base });
    y = base + t.desc + (i < lines.length - 1 ? gap : 0);
  });
  return { items, h: y, w: width };
}
function fitBlock(lines, width, maxH, gap, align) {
  let b = makeBlock(lines, width, gap, align);
  if (b.h > maxH && maxH > 10) { const k = maxH / b.h; b = makeBlock(lines, width * k, gap * k, align); }
  return b;
}
function place(fr, lx, ly) {
  const c = Math.cos(fr.rot || 0), s = Math.sin(fr.rot || 0);
  return [fr.x + lx * c - ly * s, fr.y + lx * s + ly * c];
}
function itemBox(fr, it, pad = 0) {
  return [[it.x0 - pad, it.ly - it.asc - pad], [it.x0 + it.inkW + pad, it.ly - it.asc - pad],
    [it.x0 + it.inkW + pad, it.ly + it.desc + pad], [it.x0 - pad, it.ly + it.desc + pad]].map(([a, c]) => place(fr, a, c));
}
function emitBlock(E, b, fr, animFn) {
  b.items.forEach((it, i) => {
    const [x, y] = place(fr, it.lx, it.ly);
    const e = { k: 'text', str: it.str, f: it.f, size: it.size, x, y, rot: fr.rot || 0, fill: it.fill, stroke: it.stroke, lw: it.lw, box: itemBox(fr, it) };
    if (animFn) e.anim = animFn(i, e);
    E.push(e);
  });
}
function T(str, f, size, x, y, rot = 0, fill = 'K') {
  const m = meas(str, f), k = size / 100, fr = { x, y, rot };
  const box = [[-m.l * k, -m.a * k], [m.r * k, -m.a * k], [m.r * k, m.d * k], [-m.l * k, m.d * k]].map(([a, c]) => place(fr, a, c));
  return { k: 'text', str, f, size, x, y, rot, fill, box };
}
// Мелкий текст с разрядкой (рисуется посимвольно).
function smallText(str, f, size, tr, x, y, rot, fill, align = 'left') {
  const chars = [...str];
  const advs = chars.map((ch) => (meas(ch, f).adv * size) / 100);
  const w = advs.reduce((a, b) => a + b, 0) + tr * size * (chars.length - 1);
  const ox = align === 'center' ? -w / 2 : align === 'right' ? -w : 0;
  const fr = { x, y, rot };
  const [px, py] = place(fr, ox, 0);
  const cap = capOf(f) * size;
  const box = [[ox, -cap], [ox + w, -cap], [ox + w, 2], [ox, 2]].map(([a, c]) => place(fr, a, c));
  return { k: 'text', str, f, size, x: px, y: py, rot, fill, tr, advs, box, w };
}

/* ---------- Примитивы ---------- */
const A = (type, t0, dur, o = {}) => ({ type, t0, dur, ...o });
const withAnim = (e, a) => ((e.anim = a), e);
function bboxOf(flat) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (let i = 0; i < flat.length; i += 2) { a = Math.min(a, flat[i]); c = Math.max(c, flat[i]); b = Math.min(b, flat[i + 1]); d = Math.max(d, flat[i + 1]); }
  return [a, b, c, d];
}
const P = {
  poly: (pts, fill, anim) => ({ k: 'poly', pts, fill, anim }),
  rect: (x, y, w, h, fill, anim) => P.poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], fill, anim),
  obox(cx, cy, w, h, rot, fill, anim) {
    const c = Math.cos(rot), s = Math.sin(rot), hw = w / 2, hh = h / 2;
    return P.poly([[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]), fill, anim);
  },
  circ: (cx, cy, r, fill, anim) => ({ k: 'circ', cx, cy, r, fill, anim }),
  ring: (cx, cy, r, lw, stroke, anim) => ({ k: 'ring', cx, cy, r, lw, stroke, anim }),
  arc: (cx, cy, r, a0, a1, lw, stroke, anim) => ({ k: 'arc', cx, cy, r, a0, a1, lw, stroke, anim }),
  line: (x1, y1, x2, y2, lw, stroke, anim) => ({ k: 'line', x1, y1, x2, y2, lw, stroke, anim }),
  mline: (segs, lw, stroke, anim) => ({ k: 'mline', segs, lw, stroke, anim, bbox: bboxOf(segs) }),
  mpoly: (polys, fill, anim) => ({ k: 'mpoly', polys, fill, anim, bbox: bboxOf(polys.flat(2)) }),
  ering: (cx, cy, rx, ry, lw, stroke, anim) => ({ k: 'ering', cx, cy, rx, ry, lw, stroke, anim }),
  hatch: (pts, ang, gap, lw, stroke, anim) => ({ k: 'hatch', pts, ang, gap, lw, stroke, anim }),
};
function tri(cx, cy, len, w, rot, fill) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const f = [cx + (c * len) / 2, cy + (s * len) / 2], b = [cx - (c * len) / 2, cy - (s * len) / 2];
  return P.poly([f, [b[0] - (s * w) / 2, b[1] + (c * w) / 2], [b[0] + (s * w) / 2, b[1] - (c * w) / 2]], fill);
}
function circlePts(cx, cy, r, n = 72) {
  const pts = [];
  for (let i = 0; i < n; i++) pts.push([cx + Math.cos((i / n) * TAU) * r, cy + Math.sin((i / n) * TAU) * r]);
  return pts;
}
function lineThrough(p, d, lw, stroke, anim) {
  return P.line(p[0] - d[0] * 1600, p[1] - d[1] * 1600, p[0] + d[0] * 1600, p[1] + d[1] * 1600, lw, stroke, anim);
}
function rayExit(p, u) {
  const tx = u[0] > 0 ? (W - p[0]) / u[0] : u[0] < 0 ? -p[0] / u[0] : Infinity;
  const ty = u[1] > 0 ? (H - p[1]) / u[1] : u[1] < 0 ? -p[1] / u[1] : Infinity;
  return Math.min(tx, ty);
}

/* ---------- Кривые ---------- */
function smoothClosed(pts) {
  const n = pts.length, segs = [['M', pts[0][0], pts[0][1]]];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    segs.push(['C', p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]]);
  }
  segs.push(['Z']);
  return segs;
}
function segsToPath2D(segs) {
  const p = new Path2D();
  for (const s of segs) {
    if (s[0] === 'M') p.moveTo(s[1], s[2]);
    else if (s[0] === 'L') p.lineTo(s[1], s[2]);
    else if (s[0] === 'Q') p.quadraticCurveTo(s[1], s[2], s[3], s[4]);
    else if (s[0] === 'C') p.bezierCurveTo(s[1], s[2], s[3], s[4], s[5], s[6]);
    else if (s[0] === 'Z') p.closePath();
  }
  return p;
}
const fx = (v) => Math.round(v * 100) / 100;
function segsToD(segs) { return segs.map((s) => s[0] + s.slice(1).map(fx).join(' ')).join(''); }
function segBBox(segs) { const flat = []; for (const s of segs) for (let i = 1; i < s.length; i += 2) flat.push(s[i], s[i + 1]); return bboxOf(flat); }

/* ---------- Растр: точки полутона ---------- */
const hctx = document.createElement('canvas').getContext('2d');
function halftone(path, bb, dark, step = 5.4, angle = Math.PI / 4) {
  const rmax = step * 0.64;
  const [x0, y0, x1, y1] = bb;
  const c = Math.cos(angle), s = Math.sin(angle);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, R = Math.hypot(x1 - x0, y1 - y0) / 2 + step;
  const out = [];
  for (let v = -R; v <= R; v += step) {
    for (let u = -R; u <= R; u += step) {
      const x = cx + u * c - v * s, y = cy + u * s + v * c;
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      if (!hctx.isPointInPath(path, x, y)) continue;
      const r = rmax * Math.sqrt(clamp(dark(x, y), 0, 1));
      if (r > 0.3) out.push(x, y, r);
    }
  }
  return new Float32Array(out);
}
const g2 = (dx, dy, sx, sy) => Math.exp(-(dx * dx) / (2 * sx * sx) - (dy * dy) / (2 * sy * sy));

/* ---------- Составные элементы ---------- */
function imprint(E, S, x, y, fill, t0, align = 'left') {
  [`ЛИСТ № ${S.no}`, 'МАСТЕРСКАЯ НОВЫХ ФОРМ', `МОСКВА · ${S.year}`].forEach((s, i) =>
    E.push(withAnim(smallText(s, F.oswM, 11.5, 0.2, x, y + i * 16, 0, fill, align), A('fade', t0 + i * 0.06, 0.4))));
}
function imprintLine(E, S, x, y, fill, t0, align = 'left', rot = 0) {
  E.push(withAnim(smallText(`ЛИСТ № ${S.no}  ·  МАСТЕРСКАЯ НОВЫХ ФОРМ  ·  МОСКВА  ·  ${S.year}`, F.oswM, 11, 0.2, x, y, rot, fill, align), A('fade', t0, 0.5)));
}
function sphere(E, cx, cy, r, t0) {
  const L = [-0.55, -0.6, 0.58], ln = Math.hypot(...L);
  E.push(withAnim(P.circ(cx, cy, r, 'P'), A('scale', t0, 0.5, { ax: cx, ay: cy })));
  const p = new Path2D();
  p.arc(cx, cy, r, 0, TAU);
  const d = halftone(p, [cx - r, cy - r, cx + r, cy + r], (x, y) => {
    const nx = (x - cx) / r, ny = (y - cy) / r, nz2 = 1 - nx * nx - ny * ny;
    if (nz2 <= 0) return 1;
    const nz = Math.sqrt(nz2);
    const lam = Math.max(0, (nx * L[0] + ny * L[1] + nz * L[2]) / ln);
    return 1 - lam * 0.95 + (1 - nz) * 0.12;
  }, 4.6);
  E.push({ k: 'dots', d, fill: 'K', bbox: [cx - r, cy - r, cx + r, cy + r], anim: A('fade', t0 + 0.12, 0.5) });
}
function eye(E, cx, cy, w, t0) {
  const h = w * 0.44;
  const segs = [['M', cx - w, cy], ['Q', cx, cy - h * 1.9, cx + w, cy], ['Q', cx, cy + h * 1.9, cx - w, cy], ['Z']];
  const bb = [cx - w, cy - h, cx + w, cy + h];
  E.push({ k: 'path', segs, fill: 'P', bbox: bb, anim: A('scale', t0, 0.5, { ax: cx, ay: cy }) });
  const d = halftone(segsToPath2D(segs), bb, (x, y) => clamp((cy - y) / (h * 0.95), 0, 1) * 0.6 + Math.pow(Math.abs(x - cx) / w, 3) * 0.45, 4.2);
  E.push({ k: 'dots', d, fill: 'K', bbox: bb, anim: A('fade', t0 + 0.1, 0.5) });
  const ir = h * 0.8;
  E.push(withAnim(P.circ(cx, cy + h * 0.05, ir, 'R'), A('scale', t0 + 0.2, 0.45, { ax: cx, ay: cy })));
  E.push(withAnim(P.circ(cx, cy + h * 0.05, ir * 0.46, 'K'), A('scale', t0 + 0.3, 0.4, { ax: cx, ay: cy })));
  E.push(withAnim(P.circ(cx + ir * 0.3, cy - ir * 0.25, ir * 0.17, 'P'), A('fade', t0 + 0.45, 0.3)));
  E.push({ k: 'path', segs, stroke: 'K', lw: 5, bbox: bb, anim: A('fade', t0 + 0.15, 0.4) });
  const lash = [];
  for (let i = 1; i < 9; i++) {
    const t = i / 9;
    const x = (1 - t) * (1 - t) * (cx - w) + 2 * (1 - t) * t * cx + t * t * (cx + w);
    const y = (1 - t) * (1 - t) * cy + 2 * (1 - t) * t * (cy - h * 1.9) + t * t * cy;
    const dx = (t - 0.5) * 16;
    lash.push(x, y, x + dx, y - 15 - (1 - Math.abs(t - 0.5) * 2) * 6);
  }
  E.push(P.mline(lash, 3.2, 'K', A('fade', t0 + 0.3, 0.4)));
}
function filmStrip(E, cx, cy, ang, len, h, t0) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const at = (a, b) => [cx + a * c - b * s, cy + a * s + b * c];
  const box = (a, b, w, hh) => [[-w / 2, -hh / 2], [w / 2, -hh / 2], [w / 2, hh / 2], [-w / 2, hh / 2]].map(([x, y]) => at(a + x, b + y));
  const u = { u: [c, s] };
  E.push(withAnim(P.obox(cx, cy, len, h, ang, 'K'), A('wipe', t0, 0.6, u)));
  const holes = [], frames = [], red = [];
  for (let a = -len / 2 + 12; a < len / 2 - 8; a += 19) for (const b of [-h / 2 + 7, h / 2 - 7]) holes.push(box(a, b, 9, 6.5));
  let i = 0;
  for (let a = -len / 2 + 40; a < len / 2 - 30; a += 66, i++) (i % 3 === 1 ? red : frames).push(box(a, 0, 54, h - 30));
  E.push(withAnim(P.mpoly(holes, 'P'), A('wipe', t0 + 0.12, 0.6, u)));
  E.push(withAnim(P.mpoly(frames, 'P'), A('wipe', t0 + 0.18, 0.6, u)));
  if (red.length) E.push(withAnim(P.mpoly(red, 'R'), A('wipe', t0 + 0.24, 0.6, u)));
}
// Башня Шухова: стопка гиперболоидов из прямых стержней.
function shukhov(E, cx, y0, y1, rng, t0) {
  const weights = [1.28, 1.14, 1.02, 0.92, 0.82, 0.72], sw = weights.reduce((a, b) => a + b, 0);
  const N = 18, tilt = 0.13, tw = 0.95;
  let y = y0, rb = rng.range(112, 128);
  weights.forEach((wgt, sIdx) => {
    const h = ((y0 - y1) * wgt) / sw, yt = y - h, rt = rb * 0.8;
    const segs = [];
    for (let i = 0; i < N; i++) {
      const phi = (i / N) * TAU;
      for (const dir of [1, -1]) {
        segs.push(cx + Math.cos(phi) * rb, y + Math.sin(phi) * rb * tilt,
          cx + Math.cos(phi + dir * tw) * rt, yt + Math.sin(phi + dir * tw) * rt * tilt);
      }
    }
    E.push(P.mline(segs, 1.05, 'K', A('wipe', t0 + sIdx * 0.1, 0.4, { u: [0, -1] })));
    E.push(P.ering(cx, y, rb, rb * tilt, sIdx === 0 ? 3.4 : 2.4, 'K', A('fade', t0 + sIdx * 0.1, 0.3)));
    y = yt;
    rb = rt;
  });
  E.push(P.ering(cx, y, rb, rb * tilt, 2.4, 'K', A('fade', t0 + 0.6, 0.3)));
  E.push(P.line(cx, y, cx, y - 34, 3, 'K', A('wipe', t0 + 0.65, 0.3, { u: [0, -1] })));
  return [cx, y - 34];
}
function axoBox(E, x, y, w, d, h, rot, t0) {
  const e1 = [Math.cos(rot) * w, Math.sin(rot) * w], e2 = [Math.cos(rot + 2.25) * d, Math.sin(rot + 2.25) * d];
  const add = (p, v, k = 1) => [p[0] + v[0] * k, p[1] + v[1] * k];
  const p0 = [x, y], p1 = add(p0, e1), p3 = add(p0, e2), p2 = add(p1, e2);
  const up = (p) => [p[0], p[1] - h];
  E.push(withAnim(P.poly([p3, p2, up(p2), up(p3)], 'K'), A('scale', t0, 0.5, { ax: x, ay: y })));
  E.push(withAnim(P.hatch([p1, p2, up(p2), up(p1)], rot + 1.2, 4.2, 1.3, 'K'), A('scale', t0 + 0.05, 0.5, { ax: x, ay: y })));
  E.push(withAnim(P.poly([up(p0), up(p1), up(p2), up(p3)], 'R'), A('scale', t0 + 0.1, 0.5, { ax: x, ay: y })));
}
function ruler(E, x0, x1, y, fill, t0) {
  const segs = [x0, y, x1, y];
  for (let x = x0, i = 0; x <= x1 + 0.1; x += 8, i++) segs.push(x, y, x, y - (i % 5 === 0 ? 10 : 5));
  E.push(P.mline(segs, 1.2, fill, A('wipe', t0, 0.5, { u: [1, 0] })));
}
// Осколки вокруг точки удара клина.
function shards(E, rng, tip, ang, o) {
  const n = rng.int(7, 11);
  for (let i = 0, tries = 0; i < n && tries < 90; tries++) {
    const th = ang + rng.range(-1.25, 1.25);
    const d = o.r * rng.range(0.7, 1.75);
    const px = tip[0] + Math.cos(th) * d, py = tip[1] + Math.sin(th) * d;
    if (px < 18 || px > W - 18 || py < 18 || py > H - 18) continue;
    if (o.reserved.some(([a, b, c, dd]) => px > a - 22 && px < c + 22 && py > b - 22 && py < dd + 22)) continue;
    const inC = Math.hypot(px - o.cx, py - o.cy) < o.r - 4;
    const onBlack = !inC && px > o.split;
    const fill = rng.chance(0.3) ? 'R' : onBlack ? 'P' : 'K';
    const sz = rng.range(28, 70) * (1.3 - d / (o.r * 2.6));
    const rot = th + rng.range(-0.5, 0.5);
    const shp = rng.chance(0.55) ? tri(px, py, sz, sz * rng.range(0.32, 0.55), rot, fill) : P.obox(px, py, sz, sz * rng.range(0.16, 0.3), rot, fill);
    shp.anim = A('slide', o.t0 + i * 0.03, 0.55, { dx: tip[0] - px, dy: tip[1] - py });
    E.push(shp);
    i++;
  }
}
// Буквы, растущие в раструбе мегафона.
function coneText(E, str, apex, ang, half, d0, d1, f, fill, t0) {
  const ux = Math.cos(ang), uy = Math.sin(ang), nx = -uy, ny = ux;
  d0 = Math.max(d0, d1 / 4.2);
  const chars = [...str];
  const adv = chars.map((ch) => meas(ch, f).adv / 100);
  const cap = capOf(f);
  const maxSig = (2 * Math.tan(half) * 0.74) / cap;
  const endFor = (sig) => chars.reduce((d, _, i) => d * (1 + sig * adv[i] * 1.05), d0);
  let sig = maxSig;
  if (endFor(maxSig) > d1) {
    let lo = 0, hi = maxSig;
    for (let it = 0; it < 40; it++) { const mid = (lo + hi) / 2; if (endFor(mid) > d1) hi = mid; else lo = mid; }
    sig = lo;
  }
  let d = d0;
  chars.forEach((ch, i) => {
    const size = sig * d, c = cap * size;
    const x = apex[0] + ux * d + nx * (c / 2), y = apex[1] + uy * d + ny * (c / 2);
    const e = T(ch, f, size, x, y, ang, fill);
    const mx = apex[0] + ux * (d + adv[i] * size * 0.5), my = apex[1] + uy * (d + adv[i] * size * 0.5);
    e.anim = A('stamp', t0 + i * 0.06, 0.38, { ax: mx, ay: my });
    if (ch !== ' ') E.push(e);
    d += adv[i] * size * 1.05;
  });
}
// Голова в профиль с открытым ртом (фотомонтаж растровыми точками).
const HEAD = {
  face: [[-20, -132], [-8, -116], [-2, -100], [2, -88], [-1, -78], [1, -70], [10, -58], [21, -44], [15, -36], [5, -33], [8, -24], [7, -13],
    [-5, -5], [-7, 3], [6, 9], [8, 16], [3, 24], [6, 36], [1, 50], [-14, 60], [-38, 62], [-50, 70], [-52, 100], [-50, 140], [-56, 196],
    [-150, 196], [-148, 120], [-140, 86], [-172, 30], [-184, -40], [-170, -104], [-128, -146], [-70, -156]],
  scarf: [[-18, -138], [-44, -164], [-104, -180], [-164, -152], [-198, -82], [-200, 0], [-186, 72], [-162, 134], [-122, 154], [-86, 132],
    [-68, 90], [-64, 36], [-60, -20], [-48, -80], [-32, -118]],
  coat: [[-64, 150], [-24, 166], [36, 194], [96, 268], [-290, 268], [-252, 182], [-170, 150]],
};
function faceDark(x, y) {
  let d = 0.12 + 0.62 * Math.pow(clamp((-x - 6) / 58, 0, 1), 1.3);
  d += 0.32 * clamp((y - 40) / 40, 0, 1) * clamp((10 - x) / 50, 0, 1);
  d += 0.85 * g2(x + 11, y + 73, 6, 3.2) + 0.45 * g2(x + 13, y + 86, 11, 2.6);
  d += 0.5 * g2(x - 8, y + 35, 4, 2.4) + 1.0 * g2(x + 1, y + 0.5, 6, 5.5);
  d += 0.28 * g2(x - 2, y - 13, 8, 3) + 0.22 * g2(x + 30, y + 30, 16, 22);
  return d;
}
function scarfLight(x, y) {
  const fold = 0.5 + 0.5 * Math.sin(x * 0.07 + y * 0.045 + Math.sin(y * 0.03) * 1.5);
  return clamp(0.06 + 0.3 * fold * clamp((x + 210) / 170, 0, 1) + 0.32 * g2(x + 40, y + 80, 30, 60), 0, 1);
}
const coatLight = (x, y) => clamp(0.08 + 0.42 * g2(x - 10, y - 200, 70, 44), 0, 0.6);
function head(E, mouth, s, tilt, t0) {
  const c = Math.cos(tilt), sn = Math.sin(tilt);
  const tf = ([x, y]) => [mouth[0] + (x * c - y * sn) * s, mouth[1] + (x * sn + y * c) * s];
  const inv = (X, Y) => { const dx = (X - mouth[0]) / s, dy = (Y - mouth[1]) / s; return [dx * c + dy * sn, -dx * sn + dy * c]; };
  [
    { pts: HEAD.coat, base: 'K', dots: 'P', light: coatLight, t: t0 },
    { pts: HEAD.face, base: 'P', dots: 'K', light: faceDark, t: t0 + 0.08 },
    { pts: HEAD.scarf, base: 'K', dots: 'P', light: scarfLight, t: t0 + 0.16 },
  ].forEach((pc) => {
    const segs = smoothClosed(pc.pts.map(tf));
    const bb = segBBox(segs);
    E.push({ k: 'path', segs, fill: pc.base, bbox: bb, anim: A('fade', pc.t, 0.45) });
    const d = halftone(segsToPath2D(segs), bb, (X, Y) => pc.light(...inv(X, Y)), 5.2);
    E.push({ k: 'dots', d, fill: pc.dots, bbox: bb, anim: A('fade', pc.t + 0.12, 0.6) });
  });
}

/* ================================================================
   Приёмы (архетипы композиций)
   ================================================================ */

// «Клин» — по мотивам Эль Лисицкого.
function genWedge(rng, S) {
  const E = [];
  const split = Math.round(rng.range(0.44, 0.5) * W);
  E.push(P.rect(split, -30, W - split + 30, H + 60, 'K', A('slide', 0, 0.8, { dx: 460 })));
  const r = Math.min(rng.range(0.235, 0.265) * W, (W - split - 6) / 1.9);
  const cx = split + r * rng.range(0.82, 0.92), cy = rng.range(0.33, 0.4) * H;
  E.push(P.circ(cx, cy, r, 'P', A('scale', 0.22, 0.75, { ax: cx, ay: cy })));
  const ang = -rng.range(0.16, 0.28);
  const ux = Math.cos(ang), uy = Math.sin(ang), nx = -uy, ny = ux;
  const tip = [cx - r * rng.range(0.05, 0.25), cy + r * rng.range(0.02, 0.16)];
  const len = (tip[0] + 90) / ux, half = rng.range(80, 98);
  const base = [tip[0] - ux * len, tip[1] - uy * len];
  const up = [base[0] - nx * half, base[1] - ny * half], lo = [base[0] + nx * half, base[1] + ny * half];
  E.push(P.poly([tip, lo, up], 'R', A('slide', 0.55, 0.6, { dx: -ux * 620, dy: -uy * 620 })));
  const edgeY = (a, b, x) => a[1] + ((x - a[0]) * (b[1] - a[1])) / (b[0] - a[0]);

  // Лозунг — над клином
  const toks = S.toks.slice();
  let circleWord = null;
  if (toks.length >= 3 && rng.chance(0.6)) circleWord = toks.pop();
  const fam = rng.pick([F.mono, F.dela, F.russo]);
  const lines = paint(breakLines(toks, linesFor(toks, rng, 2, 4), rng), rng).map((l) => ({ ...l, f: fam }));
  const x0 = M, x1 = split - 26, top = M + 16;
  const maxB = Math.min(edgeY(up, tip, x1) - 34, H * 0.46);
  const blk = fitBlock(lines, x1 - x0, maxB - top, 9);
  emitBlock(E, blk, { x: x0, y: top, rot: 0 }, (i) => A('wipe', 0.95 + i * 0.12, 0.45, { u: [1, 0] }));
  const reserved = [[x0, top, x0 + blk.w, top + blk.h]];

  if (circleWord) {
    const t = fitLine(circleWord, fam, r * 1.25, r * 0.28);
    const by = cy - r * 0.3;
    const e = T(circleWord, fam, t.size, cx - t.inkW / 2 + t.left, by, 0, 'K');
    e.anim = A('stamp', 1.35, 0.4);
    E.push(e);
    reserved.push([cx - t.inkW / 2, by - t.asc, cx + t.inkW / 2, by + t.desc]);
  }

  // Под клином — крупная вторая строка (подзаголовок)
  const subT = tokenize(S.sub);
  const subL = paint(breakLines(subT, Math.min(2, subT.length), rng), rng, 'K', 'R').map((l) => ({ ...l, f: rng.pick([F.osw, fam]) }));
  const sTop = edgeY(lo, tip, M) + 36, sBottom = H - M - 6;
  const sb = fitBlock(subL, x1 - x0, sBottom - sTop, 8);
  emitBlock(E, sb, { x: x0, y: sBottom - sb.h, rot: 0 }, (i) => A('wipe', 1.25 + i * 0.12, 0.45, { u: [1, 0] }));
  reserved.push([x0, sBottom - sb.h, x0 + sb.w, sBottom]);

  // Линии скорости над клином
  const sl = [];
  [[0.18, 0.5, 22], [0.3, 0.62, 40], [0.12, 0.36, 58]].forEach(([a, b, off]) => {
    const pa = [up[0] + (tip[0] - up[0]) * a - nx * off, up[1] + (tip[1] - up[1]) * a - ny * off];
    const pb = [up[0] + (tip[0] - up[0]) * b - nx * off, up[1] + (tip[1] - up[1]) * b - ny * off];
    sl.push(pa[0], pa[1], pb[0], pb[1]);
  });
  E.push(P.mline(sl, 3, 'K', A('wipe', 1.0, 0.4, { u: [ux, uy] })));

  shards(E, rng, tip, ang, { split, cx, cy, r, reserved, t0: 1.05 });

  const ix = split + 26, iy = H - M - 40;
  E.push(P.rect(ix, iy - 40, W - M - ix, 12, 'R', A('wipe', 1.2, 0.5, { u: [1, 0] })));
  imprint(E, S, ix, iy, 'P', 1.35);
  return E;
}

// «Мегафон» — по мотивам Александра Родченко.
function genMegaphone(rng, S) {
  const E = [];
  const yL = rng.range(0.42, 0.5) * H, yR = rng.range(0.14, 0.22) * H;
  E.push(P.poly([[-30, -30], [W + 30, -30], [W + 30, yR], [-30, yL]], 'K', A('slide', 0, 0.75, { dy: -560 })));
  const bandY = rng.range(0.8, 0.85) * H;
  E.push(P.rect(-30, bandY, W + 60, H - bandY + 40, 'R', A('slide', 0.08, 0.75, { dx: -680 })));
  const s = rng.range(1.12, 1.24), tilt = -rng.range(0.06, 0.16);
  const mouth = [rng.range(0.31, 0.36) * W, rng.range(0.66, 0.7) * H];

  const ang = -rng.range(0.62, 0.76), half = rng.range(0.2, 0.24);
  const ux = Math.cos(ang), uy = Math.sin(ang);
  const apex = [mouth[0] + 7 * s, mouth[1] + 1 * s];
  const a1 = ang - half, a2 = ang + half;
  E.push(P.poly([apex, [apex[0] + Math.cos(a1) * 1700, apex[1] + Math.sin(a1) * 1700], [apex[0] + Math.cos(a2) * 1700, apex[1] + Math.sin(a2) * 1700]],
    'R', A('wipe', 0.5, 0.6, { u: [ux, uy] })));

  const toks = S.toks.slice();
  let coneStr = toks.shift();
  while (toks.length && (coneStr + ' ' + toks[0]).length <= 11) coneStr += ' ' + toks.shift();
  coneStr = coneStr.replace(/\s*—$/, '');
  const cf = rng.pick([F.dela, F.mono, F.russo]);
  coneText(E, coneStr, apex, ang, half, 70 * s, rayExit(apex, [ux, uy]) - 26, cf, 'P', 0.95);

  head(E, mouth, s, tilt, 0.3);

  const rest = toks.length ? toks : tokenize(S.sub);
  const f2 = rng.pick([F.mono, F.russo, F.osw]);
  const top = M + 12;
  const diag = (x) => yL + ((yR - yL) * x) / W;
  let best = null;
  for (let k = 1; k <= Math.min(3, rest.length); k++) {
    const lines = paint(breakLines(rest, k, rng), rng, 'P', 'R').map((l) => ({ ...l, f: f2 }));
    for (let wf = 0.26; wf <= 0.66; wf += 0.04) {
      const width = W * wf, maxH = diag(M + width) - 30 - top;
      if (maxH < 30) continue;
      const b = fitBlock(lines, width, maxH, 8);
      const bottom = top + b.h, right = M + b.w;
      if (right > apex[0] + (bottom - apex[1]) / Math.tan(a1) - 26) continue;
      const score = Math.min(...b.items.map((it) => it.asc)) * (k === 2 ? 1.12 : 1);
      if (!best || score > best.score) best = { b, score };
    }
  }
  if (best) emitBlock(E, best.b, { x: M, y: top, rot: 0 }, (i) => A('wipe', 1.2 + i * 0.12, 0.45, { u: [1, 0] }));

  const dl = [[W + 30, yR + 16], [-30, yL + 16]];
  E.push(P.line(dl[0][0], dl[0][1], dl[1][0], dl[1][1], 3, 'K', A('wipe', 0.7, 0.5, { u: [-1, 0] })));
  imprint(E, S, W - M, H - M - 34, 'P', 1.55, 'right');
  return E;
}

// «Лучи» — по мотивам Густава Клуциса и радиобашни Шухова.
function genRays(rng, S) {
  const E = [];
  const band = Math.round(rng.range(0.3, 0.35) * W);
  const tx = band + (W - band) * rng.range(0.46, 0.56), ty = rng.range(0.2, 0.26) * H;
  const R = rng.range(200, 240);
  const lineSegs = [];
  const nL = 14, offL = rng.f() * TAU;
  for (let i = 0; i < nL; i++) {
    const a = offL + (i / nL) * TAU;
    lineSegs.push(tx + Math.cos(a) * (R + 16), ty + Math.sin(a) * (R + 16), tx + Math.cos(a) * 1500, ty + Math.sin(a) * 1500);
  }
  E.push(P.mline(lineSegs, 1.3, 'K', A('fade', 0.2, 0.6)));
  E.push(P.circ(tx, ty, R, 'R', A('scale', 0, 0.8, { ax: tx, ay: ty })));
  const n = rng.pick([20, 24, 28]), off = rng.f() * TAU, cuts = [];
  for (let i = 0; i < n; i += 2) {
    const b0 = off + (i * TAU) / n, b1 = off + ((i + 1) * TAU) / n, rr = R + 1;
    cuts.push([[tx, ty], [tx + Math.cos(b0) * rr, ty + Math.sin(b0) * rr], [tx + Math.cos((b0 + b1) / 2) * rr, ty + Math.sin((b0 + b1) / 2) * rr], [tx + Math.cos(b1) * rr, ty + Math.sin(b1) * rr]]);
  }
  E.push(P.mpoly(cuts, 'P', A('fade', 0.4, 0.5)));
  E.push(P.circ(tx, ty, R * 0.2, 'P', A('scale', 0.5, 0.4, { ax: tx, ay: ty })));

  const tip = shukhov(E, tx, H + 30, ty + R * 0.32, rng, 0.45);
  [[R + 26, 3], [R + 58, 2], [R + 96, 1.3]].forEach(([rr, lw], i) => {
    E.push(P.ring(tx, ty, rr, lw, 'K', A('scale', 1.1 + i * 0.12, 0.6, { ax: tx, ay: ty })));
  });

  E.push(P.rect(-20, -20, band + 20, H + 40, 'K', A('slide', 0.1, 0.7, { dy: 960 })));
  const fam = rng.pick([F.mono, F.dela, F.russo]);
  const lines = paint(breakLines(S.toks, linesFor(S.toks, rng, 1, 2), rng), rng, 'P', 'R').map((l) => ({ ...l, f: fam }));
  const len = H - 2 * M - 96;
  const blk = fitBlock(lines, len, band - 44, 8);
  const fr = { x: (band - blk.h) / 2, y: H - M - 4, rot: -Math.PI / 2 };
  emitBlock(E, blk, fr, (i) => A('wipe', 0.95 + i * 0.12, 0.5, { u: [0, -1] }));
  imprint(E, S, 20, M + 10, 'P', 1.5);
  return E;
}

// «Спираль» — по мотивам киноплакатов братьев Стенберг.
function genSpiral(rng, S) {
  const E = [];
  const c0 = [rng.range(0.44, 0.56) * W, rng.range(0.29, 0.34) * H];
  const q = rng.range(1.15, 1.19), dr = [rng.range(-4, 4), rng.range(3, 7)];
  const radii = [];
  const band0 = rng.range(172, 196), bandW = rng.range(42, 50);
  for (let r = 70; r < band0; r *= q) radii.push(r);
  const tIdx = radii.length;
  radii.push(band0 + bandW);
  for (let r = band0 + bandW; r < 1500;) { r *= q; radii.push(r); }
  const textBand = rng.chance(0.5) ? 'R' : 'K';
  const colorAt = (i) => (i === 0 ? 'P' : i === tIdx ? textBand : (i - tIdx) % 2 === 0 ? (textBand === 'K' ? 'P' : 'K') : (textBand === 'K' ? 'K' : 'P'));
  const cOf = (i) => [c0[0] + dr[0] * i, c0[1] + dr[1] * i];
  for (let i = radii.length - 1; i >= 0; i--) {
    const [x, y] = cOf(i);
    let fill = colorAt(i);
    if (i < tIdx && i > 0) fill = (tIdx - i) % 2 === 1 ? 'P' : 'K';
    E.push(P.circ(x, y, radii[i], fill, A('scale', (radii.length - 1 - i) * 0.035, 0.55, { ax: x, ay: y })));
  }
  // Круговая надпись на широком кольце
  const [tcx, tcy] = cOf(tIdx);
  const rIn = radii[tIdx - 1], rOut = radii[tIdx];
  const f = F.oswM, cap = capOf(f);
  const capH = (rOut - rIn) * 0.52, size = capH / cap;
  const rb = (rIn + rOut) / 2 - capH / 2;
  const unit = `${S.sub.toUpperCase()}  ·  ЛИСТ № ${S.no}  ·  `;
  const tr = 0.14;
  const unitLen = [...unit].reduce((a, ch) => a + (meas(ch, f).adv * size) / 100 + tr * size, 0);
  const reps = Math.max(1, Math.floor((TAU * rb) / unitLen));
  const text = unit.repeat(reps);
  const k = (TAU * rb) / (unitLen * reps);
  let th = -Math.PI / 2 - 0.4;
  [...text].forEach((ch, i) => {
    const a = ((meas(ch, f).adv * size) / 100 + tr * size) * k;
    if (ch !== ' ') {
      const e = T(ch, f, size, tcx + Math.cos(th) * rb, tcy + Math.sin(th) * rb, th + Math.PI / 2, textBand === 'R' ? 'K' : 'P');
      e.anim = A('fade', 0.9 + (i / text.length) * 0.7, 0.2);
      E.push(e);
    }
    th += a / rb;
  });
  eye(E, c0[0], c0[1], 56, 0.55);

  const py = Math.round(rng.range(0.66, 0.7) * H);
  filmStrip(E, W * 0.5, py - rng.range(62, 86), -rng.range(0.08, 0.16), 860, 58, 0.75);
  E.push(P.rect(-20, py, W + 40, H - py + 20, 'P', A('slide', 0.15, 0.7, { dy: 420 })));
  E.push(P.rect(-20, py, W + 40, 8, 'K', A('wipe', 0.55, 0.5, { u: [1, 0] })));
  const lines = paint(breakLines(S.toks, linesFor(S.toks, rng, 1, 3), rng), rng, 'K', 'R').map((l) => ({ ...l, f: F.osw }));
  const blk = fitBlock(lines, W - 2 * M, H - M - py - 64, 8);
  emitBlock(E, blk, { x: M + (W - 2 * M - blk.w) / 2, y: py + 26, rot: 0 }, (i) => A('wipe', 1.0 + i * 0.13, 0.5, { u: [1, 0] }));
  imprintLine(E, S, W / 2, H - M + 6, 'K', 1.5, 'center');
  return E;
}

// «Проун» — по мотивам Лисицкого и Малевича.
function genProun(rng, S) {
  const E = [];
  const ang = -rng.range(0.42, 0.62);
  const ux = Math.cos(ang), uy = Math.sin(ang), nx = -uy, ny = ux;
  const C = [W * rng.range(0.47, 0.56), H * rng.range(0.36, 0.42)];
  const at = (a, b) => [C[0] + ux * a + nx * b, C[1] + uy * a + ny * b];

  const ch = S.toks[0][0];
  const big = T(ch, F.dela, 620, -30, H * 0.93, 0, 'T');
  big.anim = A('fade', 0, 0.9);
  E.push(big);
  const cc = at(rng.range(-50, 30), rng.range(-30, 50)), cr = rng.range(170, 215);
  E.push(P.hatch(circlePts(cc[0], cc[1], cr), ang + Math.PI / 2, 6.5, 1.25, 'K', A('scale', 0.08, 0.7, { ax: cc[0], ay: cc[1] })));
  E.push(lineThrough(at(0, -rng.range(95, 140)), [ux, uy], 1.6, 'K', A('wipe', 0.2, 0.6, { u: [ux, uy] })));
  E.push(lineThrough(at(rng.range(60, 140), 0), [nx, ny], 1.2, 'K', A('wipe', 0.25, 0.6, { u: [nx, ny] })));
  const bar = at(-10, 0);
  E.push(P.obox(bar[0], bar[1], rng.range(430, 510), rng.range(26, 34), ang, 'K', A('slide', 0.3, 0.6, { dx: -ux * 520, dy: -uy * 520 })));
  const rs = rng.range(96, 124), rp = at(rng.range(40, 110), -rng.range(64, 92));
  E.push(P.obox(rp[0], rp[1], rs, rs, ang, 'R', A('scale', 0.55, 0.6, { ax: rp[0], ay: rp[1] })));
  const bp = at(-rng.range(120, 170), rng.range(46, 70));
  E.push(P.obox(bp[0], bp[1], 52, 52, ang, 'K', A('scale', 0.65, 0.5, { ax: bp[0], ay: bp[1] })));
  for (let i = 0; i < 4; i++) {
    const p = at(rng.range(-220, 220), rng.range(80, 150) * (i % 2 ? 1 : -1));
    E.push(P.obox(p[0], p[1], rng.range(40, 110), rng.range(5, 9), ang, i === 2 ? 'R' : 'K', A('slide', 0.7 + i * 0.05, 0.5, { dx: -ux * 300, dy: -uy * 300 })));
  }
  const ax = at(rng.range(-80, -20), rng.range(100, 140));
  axoBox(E, ax[0], ax[1], 92, 58, 40, ang, 0.85);
  const rc = at(rng.range(150, 200), rng.range(60, 110));
  E.push(P.circ(rc[0], rc[1], rng.range(20, 30), 'R', A('scale', 0.95, 0.4, { ax: rc[0], ay: rc[1] })));
  const sp = at(-rng.range(170, 210), -rng.range(110, 140));
  sphere(E, clamp(sp[0], 90, W - 90), clamp(sp[1], 90, H * 0.55), rng.range(50, 62), 0.9);

  const fam = rng.pick([F.osw, F.mono, F.russo]);
  const lines = paint(breakLines(S.toks, linesFor(S.toks, rng, 2, 4), rng), rng).map((l) => ({ ...l, f: fam }));
  const bw = rng.range(240, 280);
  const blk = fitBlock(lines, bw, 170, 7);
  const bx = W - M - blk.w, by = H - M - 40 - blk.h;
  emitBlock(E, blk, { x: bx, y: by, rot: 0 }, (i) => A('wipe', 1.1 + i * 0.12, 0.45, { u: [1, 0] }));
  E.push(P.rect(bx, by - 22, blk.w, 6, 'R', A('wipe', 1.0, 0.45, { u: [1, 0] })));
  ruler(E, M, W - M, H - M - 18, 'K', 1.3);
  imprintLine(E, S, W - M, H - M + 2, 'K', 1.5, 'right');
  return E;
}

// «Шрифт» — наборный плакат в духе рекламных листов Родченко.
function genType(rng, S) {
  const E = [];
  const rot = rng.chance(0.45) ? -rng.range(0.06, 0.11) : 0;
  E.push(P.rect(M, M, W - 2 * M, 16, 'K', A('wipe', 0, 0.5, { u: [1, 0] })));
  E.push(P.rect(M, M, 6, H - 2 * M, 'K', A('wipe', 0.05, 0.5, { u: [0, 1] })));
  E.push(withAnim(smallText(S.sub.toUpperCase(), F.oswM, 13, 0.3, W - M, M + 38, 0, 'K', 'right'), A('fade', 0.4, 0.4)));
  const excl = rng.chance(0.6);
  const tw = W - 2 * M - 30 - 120;
  const fams = rng.shuffle([F.mono, F.dela, F.osw, F.russo]).slice(0, 2);
  const L = breakLines(S.toks, linesFor(S.toks, rng, 3, 5), rng);
  const inv = rng.int(0, L.length - 1);
  let red = rng.int(0, L.length - 1);
  if (red === inv && L.length > 1) red = (red + 1) % L.length;
  const lines = L.map((str, i) => ({ str, f: fams[i % 2], fill: i === inv ? 'P' : i === red ? 'R' : 'K' }));
  const top = M + 62 + (rot ? 34 : 0);
  const blk = fitBlock(lines, tw, H * 0.64 - top, 14);
  const fr = { x: M + 22, y: top, rot };
  E.push(withAnim(P.poly(itemBox(fr, blk.items[inv], 9), 'K'), A('wipe', 0.6, 0.45, { u: [Math.cos(rot), Math.sin(rot)] })));
  emitBlock(E, blk, fr, (i) => A('wipe', 0.8 + i * 0.11, 0.42, { u: [Math.cos(rot), Math.sin(rot)] }));
  const blockBottom = Math.max(...blk.items.map((it) => place(fr, it.x0, it.ly + it.desc)[1]), ...blk.items.map((it) => place(fr, it.x0 + it.inkW, it.ly + it.desc)[1]));
  if (excl && blockBottom - top > 210) {
    const size = Math.min(430, (blockBottom - top) * 1.02);
    const e = T('!', F.dela, size, W - M - 108, top + size * 0.74, 0.06, 'R');
    e.anim = A('stamp', 1.35, 0.45, { ax: W - M - 60, ay: top + size * 0.4 });
    E.push(e);
  } else {
    const yA = top + 40;
    E.push(withAnim(P.poly([[W - M, yA - 30], [W - M - 90, yA + 40], [W - M, yA + 110]], 'R'), A('slide', 1.35, 0.5, { dx: 200 })));
  }
  const y2 = blockBottom + 34;
  E.push(P.rect(M + 22, y2, W - 2 * M - 22, 18, 'R', A('wipe', 1.3, 0.5, { u: [1, 0] })));
  const zTop = y2 + 18 + 30, zBot = H - M - 34, zw = W - 2 * M - 22;
  const n1 = `№ ${S.no.replace(/^0+/, '') || '1'}`, n2 = `${S.year}`;
  const t1 = fitLine(n1, F.russo, zw, (zBot - zTop) * 0.44), t2 = fitLine(n2, F.russo, zw, (zBot - zTop) * 0.44);
  const gap = Math.max(14, (zBot - zTop - t1.asc - t2.asc) / 3);
  E.push(withAnim(T(n1, F.russo, t1.size, M + 22 + t1.left, zTop + gap * 0.5 + t1.asc, 0, 'K'), A('stamp', 1.5, 0.4)));
  const yre = T(n2, F.russo, t2.size, W - M - t2.inkW + t2.left, zBot - gap * 0.5, 0, null);
  yre.stroke = 'K'; yre.lw = Math.max(1.6, t2.size * 0.012);
  yre.anim = A('fade', 1.6, 0.4);
  E.push(yre);
  imprintLine(E, S, M + 22, H - M - 6, 'K', 1.6);
  return E;
}

const STYLES = {
  wedge:     { name: 'Клин',    note: 'по мотивам Эль Лисицкого', gen: genWedge },
  megaphone: { name: 'Мегафон', note: 'по мотивам Александра Родченко', gen: genMegaphone },
  rays:      { name: 'Лучи',    note: 'по мотивам Густава Клуциса и башни Шухова', gen: genRays },
  spiral:    { name: 'Спираль', note: 'по мотивам киноплакатов братьев Стенберг', gen: genSpiral },
  proun:     { name: 'Проун',   note: 'по мотивам Лисицкого и Малевича', gen: genProun },
  type:      { name: 'Шрифт',   note: 'по мотивам наборных листов Родченко', gen: genType },
};
const STYLE_KEYS = Object.keys(STYLES);

function build(params) {
  const rng = RNG(params.seed);
  const pal = PALETTES[params.palette];
  const slogan = params.slogan || SLOGANS[params.seed % SLOGANS.length];
  const S = {
    slogan, toks: tokenize(slogan), sub: SUBLINES[(params.seed >>> 5) % SUBLINES.length],
    no: String(params.seed % 10000).padStart(4, '0'), year: 1923 + (params.seed % 8),
  };
  const els = STYLES[params.style].gen(rng, S);
  let total = 0;
  for (const e of els) if (e.anim) total = Math.max(total, e.anim.t0 + e.anim.dur);
  return {
    params, pal, els, total, S,
    col: { R: pal.R, K: pal.K, T: pal.T, P: '#FFFFFF' },
    paperSeed: (params.seed * 7 + 13) >>> 0,
    folds: rng.chance(0.55),
    mis: [rng.range(-1.2, 1.2), rng.range(-1, 1)],
  };
}

/* ================================================================
   Отрисовка на Canvas
   ================================================================ */
function extent(e) {
  if (e._ext) return e._ext;
  let pts;
  switch (e.k) {
    case 'poly': case 'hatch': pts = e.pts; break;
    case 'circ': case 'ring': case 'arc': { const r = e.r + (e.lw || 0); pts = [[e.cx - r, e.cy - r], [e.cx + r, e.cy - r], [e.cx + r, e.cy + r], [e.cx - r, e.cy + r]]; break; }
    case 'ering': pts = [[e.cx - e.rx, e.cy - e.ry], [e.cx + e.rx, e.cy - e.ry], [e.cx + e.rx, e.cy + e.ry], [e.cx - e.rx, e.cy + e.ry]]; break;
    case 'line': pts = [[e.x1, e.y1], [e.x2, e.y2]]; break;
    case 'text': pts = e.box; break;
    default: { const [a, b, c, d] = e.bbox; pts = [[a, b], [c, b], [c, d], [a, d]]; }
  }
  return (e._ext = pts);
}
function centerOf(e) {
  const pts = extent(e);
  let x = 0, y = 0;
  for (const p of pts) { x += p[0]; y += p[1]; }
  return [x / pts.length, y / pts.length];
}
function applyAnim(g, e, a, p) {
  switch (a.type) {
    case 'slide': { const q = 1 - ease.outExpo(p); g.translate((a.dx || 0) * q, (a.dy || 0) * q); break; }
    case 'scale':
    case 'stamp': {
      let ax = a.ax, ay = a.ay;
      if (ax === undefined) [ax, ay] = centerOf(e);
      let s;
      if (a.type === 'scale') s = Math.max(0, ease.outBack(p));
      else { s = 1 + 0.6 * (1 - ease.outCubic(p)); g.globalAlpha = Math.min(1, p * 2.5); }
      g.translate(ax, ay); g.scale(s, s); g.translate(-ax, -ay);
      break;
    }
    case 'fade': g.globalAlpha = ease.outCubic(p); break;
    case 'wipe': {
      const [ux, uy] = a.u, pts = extent(e);
      let lo = Infinity, hi = -Infinity;
      for (const [x, y] of pts) { const d = x * ux + y * uy; if (d < lo) lo = d; if (d > hi) hi = d; }
      const s = lo + (hi - lo) * ease.inOutCubic(p), vx = -uy, vy = ux, B = 4000;
      g.beginPath();
      g.moveTo(ux * s + vx * B, uy * s + vy * B);
      g.lineTo(ux * s - vx * B, uy * s - vy * B);
      g.lineTo(ux * (s - B) - vx * B, uy * (s - B) - vy * B);
      g.lineTo(ux * (s - B) + vx * B, uy * (s - B) + vy * B);
      g.closePath();
      g.clip();
      break;
    }
  }
}
function drawEl(g, e, t, col, mis) {
  const a = e.anim;
  let p = 1;
  if (a && t < a.t0 + a.dur) { p = (t - a.t0) / a.dur; if (p <= 0) return; }
  g.save();
  if (a && p < 1) applyAnim(g, e, a, p);
  if ((e.fill || e.stroke) === 'R') g.translate(mis[0], mis[1]);
  switch (e.k) {
    case 'poly':
      g.beginPath();
      e.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
      g.fillStyle = col[e.fill];
      g.fill();
      break;
    case 'mpoly':
      g.beginPath();
      for (const pts of e.polys) { pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); }
      g.fillStyle = col[e.fill];
      g.fill();
      break;
    case 'circ': g.beginPath(); g.arc(e.cx, e.cy, e.r, 0, TAU); g.fillStyle = col[e.fill]; g.fill(); break;
    case 'ring': g.beginPath(); g.arc(e.cx, e.cy, e.r, 0, TAU); g.lineWidth = e.lw; g.strokeStyle = col[e.stroke]; g.stroke(); break;
    case 'ering': g.beginPath(); g.ellipse(e.cx, e.cy, e.rx, e.ry, 0, 0, TAU); g.lineWidth = e.lw; g.strokeStyle = col[e.stroke]; g.stroke(); break;
    case 'arc': g.beginPath(); g.arc(e.cx, e.cy, e.r, e.a0, e.a1); g.lineWidth = e.lw; g.lineCap = 'butt'; g.strokeStyle = col[e.stroke]; g.stroke(); break;
    case 'line': g.beginPath(); g.moveTo(e.x1, e.y1); g.lineTo(e.x2, e.y2); g.lineWidth = e.lw; g.strokeStyle = col[e.stroke]; g.stroke(); break;
    case 'mline': {
      g.beginPath();
      const s = e.segs;
      for (let i = 0; i < s.length; i += 4) { g.moveTo(s[i], s[i + 1]); g.lineTo(s[i + 2], s[i + 3]); }
      g.lineWidth = e.lw; g.lineCap = 'round'; g.strokeStyle = col[e.stroke]; g.stroke();
      break;
    }
    case 'path': {
      const p2 = e._p || (e._p = segsToPath2D(e.segs));
      if (e.fill) { g.fillStyle = col[e.fill]; g.fill(p2); }
      if (e.stroke) { g.lineWidth = e.lw; g.lineJoin = 'round'; g.strokeStyle = col[e.stroke]; g.stroke(p2); }
      break;
    }
    case 'dots': {
      if (!e._p) {
        const p2 = new Path2D(), d = e.d;
        for (let i = 0; i < d.length; i += 3) { p2.moveTo(d[i] + d[i + 2], d[i + 1]); p2.arc(d[i], d[i + 1], d[i + 2], 0, TAU); }
        e._p = p2;
      }
      g.fillStyle = col[e.fill];
      g.fill(e._p);
      break;
    }
    case 'hatch': {
      g.beginPath();
      e.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
      g.clip();
      const [a0, b0, c0, d0] = bboxOf(e.pts.flat());
      const cx = (a0 + c0) / 2, cy = (b0 + d0) / 2, R = Math.hypot(c0 - a0, d0 - b0) / 2 + 4;
      const ux = Math.cos(e.ang), uy = Math.sin(e.ang);
      g.beginPath();
      for (let v = -R; v <= R; v += e.gap) {
        g.moveTo(cx - ux * R - uy * v, cy - uy * R + ux * v);
        g.lineTo(cx + ux * R - uy * v, cy + uy * R + ux * v);
      }
      g.lineWidth = e.lw; g.strokeStyle = col[e.stroke]; g.stroke();
      break;
    }
    case 'text': {
      g.font = fstr(e.f, e.size);
      g.textBaseline = 'alphabetic';
      g.textAlign = 'left';
      g.translate(e.x, e.y);
      if (e.rot) g.rotate(e.rot);
      const stroke = !!e.stroke;
      if (stroke) { g.lineWidth = e.lw || 2; g.lineJoin = 'miter'; g.strokeStyle = col[e.stroke]; } else g.fillStyle = col[e.fill];
      if (e.tr) {
        let x = 0;
        const sp = e.tr * e.size;
        [...e.str].forEach((ch, i) => { if (stroke) g.strokeText(ch, x, 0); else g.fillText(ch, x, 0); x += e.advs[i] + sp; });
      } else if (stroke) g.strokeText(e.str, 0, 0);
      else g.fillText(e.str, 0, 0);
      break;
    }
  }
  g.restore();
}

/* ---------- Бумага и износ краски ---------- */
let noiseCv = null, wearCv = null;
function noiseTile() {
  if (noiseCv) return noiseCv;
  noiseCv = document.createElement('canvas');
  noiseCv.width = noiseCv.height = 256;
  const g = noiseCv.getContext('2d'), img = g.createImageData(256, 256), r = RNG(99);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 255 - Math.pow(r.f(), 3.2) * 80;
    img.data[i] = v; img.data[i + 1] = v * 0.985; img.data[i + 2] = v * 0.95; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return noiseCv;
}
function wearTile() {
  if (wearCv) return wearCv;
  wearCv = document.createElement('canvas');
  wearCv.width = wearCv.height = 220;
  const g = wearCv.getContext('2d'), r = RNG(7);
  for (let i = 0; i < 650; i++) {
    g.fillStyle = `rgba(0,0,0,${0.08 + r.f() * 0.32})`;
    const rad = r.f() < 0.94 ? 0.3 + r.f() * 0.55 : 0.8 + r.f() * 1.2;
    g.beginPath(); g.arc(r.f() * 220, r.f() * 220, rad, 0, TAU); g.fill();
  }
  g.strokeStyle = 'rgba(0,0,0,.22)';
  for (let i = 0; i < 6; i++) { g.lineWidth = 0.4 + r.f() * 0.6; g.beginPath(); const x = r.f() * 220, y = r.f() * 220; g.moveTo(x, y); g.lineTo(x + (r.f() - 0.5) * 40, y + (r.f() - 0.5) * 10); g.stroke(); }
  return wearCv;
}
function makePaper(w, h, pal, rng, opts) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d'), k = w / W;
  g.fillStyle = pal.paper;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 26; i++) {
    const x = rng.f() * w, y = rng.f() * h, r = (60 + rng.f() * 260) * k;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const dark = rng.chance(0.62);
    gr.addColorStop(0, dark ? 'rgba(125,86,38,0.07)' : 'rgba(255,251,238,0.1)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  g.lineCap = 'round';
  for (let i = 0; i < 900; i++) {
    const x = rng.f() * w, y = rng.f() * h, l = (4 + rng.f() * 14) * k, a = rng.f() * TAU;
    g.strokeStyle = rng.chance(0.5) ? 'rgba(96,64,30,0.08)' : 'rgba(255,255,246,0.14)';
    g.lineWidth = (0.35 + rng.f() * 0.6) * k;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a + 0.6) * l * 0.5, y + Math.sin(a + 0.6) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = g.createPattern(noiseTile(), 'repeat');
  g.globalAlpha = 0.55;
  g.fillRect(0, 0, w, h);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  if (opts.folds) {
    const crease = (x1, y1, x2, y2, nx, ny) => {
      const lg = g.createLinearGradient(x1 - nx * 10 * k, y1 - ny * 10 * k, x1 + nx * 10 * k, y1 + ny * 10 * k);
      lg.addColorStop(0, 'rgba(90,60,30,0)'); lg.addColorStop(0.48, 'rgba(90,60,30,0.1)');
      lg.addColorStop(0.5, 'rgba(255,252,240,0.35)'); lg.addColorStop(0.56, 'rgba(90,60,30,0.05)'); lg.addColorStop(1, 'rgba(90,60,30,0)');
      g.fillStyle = lg;
      g.fillRect(Math.min(x1, x2) - Math.abs(nx) * 10 * k, Math.min(y1, y2) - Math.abs(ny) * 10 * k, Math.abs(x2 - x1) + Math.abs(nx) * 20 * k, Math.abs(y2 - y1) + Math.abs(ny) * 20 * k);
    };
    crease(w / 2, 0, w / 2, h, 1, 0);
    crease(0, h / 2, w, h / 2, 0, 1);
  }
  const vg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.34, w / 2, h / 2, Math.hypot(w, h) * 0.62);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(96,60,24,0.24)');
  g.fillStyle = vg;
  g.fillRect(0, 0, w, h);
  return c;
}
// Готовый лист целиком в произвольном масштабе (экспорт, миниатюры).
function renderStatic(poster, scale) {
  const w = Math.round(W * scale), h = Math.round(H * scale);
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const g = out.getContext('2d');
  const paper = makePaper(w, h, poster.pal, RNG(poster.paperSeed), poster);
  const inkc = document.createElement('canvas');
  inkc.width = w; inkc.height = h;
  const ig = inkc.getContext('2d');
  ig.setTransform(scale, 0, 0, scale, 0, 0);
  for (const e of poster.els) drawEl(ig, e, Infinity, poster.col, poster.mis);
  ig.setTransform(1, 0, 0, 1, 0, 0);
  ig.globalCompositeOperation = 'destination-out';
  ig.fillStyle = ig.createPattern(wearTile(), 'repeat');
  ig.fillRect(0, 0, w, h);
  g.drawImage(paper, 0, 0);
  g.globalCompositeOperation = 'multiply';
  g.drawImage(inkc, 0, 0);
  return out;
}

/* ================================================================
   Экспорт в SVG
   ================================================================ */
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function toSVG(poster) {
  const pal = poster.pal, col = { R: pal.R, K: pal.K, T: pal.T, P: pal.paper };
  const out = [];
  let clipId = 0;
  const defs = [];
  const pts = (arr) => arr.map(([x, y]) => `${fx(x)},${fx(y)}`).join(' ');
  for (const e of poster.els) {
    const role = e.fill || e.stroke;
    const tr = role === 'R' ? ` transform="translate(${fx(poster.mis[0])} ${fx(poster.mis[1])})"` : '';
    switch (e.k) {
      case 'poly': out.push(`<polygon points="${pts(e.pts)}" fill="${col[e.fill]}"${tr}/>`); break;
      case 'mpoly': out.push(`<path d="${e.polys.map((p) => 'M' + p.map(([x, y]) => `${fx(x)} ${fx(y)}`).join('L') + 'Z').join('')}" fill="${col[e.fill]}"${tr}/>`); break;
      case 'circ': out.push(`<circle cx="${fx(e.cx)}" cy="${fx(e.cy)}" r="${fx(e.r)}" fill="${col[e.fill]}"${tr}/>`); break;
      case 'ring': out.push(`<circle cx="${fx(e.cx)}" cy="${fx(e.cy)}" r="${fx(e.r)}" fill="none" stroke="${col[e.stroke]}" stroke-width="${fx(e.lw)}"${tr}/>`); break;
      case 'ering': out.push(`<ellipse cx="${fx(e.cx)}" cy="${fx(e.cy)}" rx="${fx(e.rx)}" ry="${fx(e.ry)}" fill="none" stroke="${col[e.stroke]}" stroke-width="${fx(e.lw)}"${tr}/>`); break;
      case 'arc': {
        const x0 = e.cx + Math.cos(e.a0) * e.r, y0 = e.cy + Math.sin(e.a0) * e.r, x1 = e.cx + Math.cos(e.a1) * e.r, y1 = e.cy + Math.sin(e.a1) * e.r;
        out.push(`<path d="M${fx(x0)} ${fx(y0)}A${fx(e.r)} ${fx(e.r)} 0 ${e.a1 - e.a0 > Math.PI ? 1 : 0} 1 ${fx(x1)} ${fx(y1)}" fill="none" stroke="${col[e.stroke]}" stroke-width="${fx(e.lw)}"${tr}/>`);
        break;
      }
      case 'line': out.push(`<line x1="${fx(e.x1)}" y1="${fx(e.y1)}" x2="${fx(e.x2)}" y2="${fx(e.y2)}" stroke="${col[e.stroke]}" stroke-width="${fx(e.lw)}"${tr}/>`); break;
      case 'mline': {
        let d = '';
        for (let i = 0; i < e.segs.length; i += 4) d += `M${fx(e.segs[i])} ${fx(e.segs[i + 1])}L${fx(e.segs[i + 2])} ${fx(e.segs[i + 3])}`;
        out.push(`<path d="${d}" stroke="${col[e.stroke]}" stroke-width="${fx(e.lw)}" stroke-linecap="round" fill="none"${tr}/>`);
        break;
      }
      case 'path': out.push(`<path d="${segsToD(e.segs)}" fill="${e.fill ? col[e.fill] : 'none'}"${e.stroke ? ` stroke="${col[e.stroke]}" stroke-width="${fx(e.lw)}" stroke-linejoin="round"` : ''}${tr}/>`); break;
      case 'dots': {
        let d = '';
        for (let i = 0; i < e.d.length; i += 3) { const x = e.d[i], y = e.d[i + 1], r = e.d[i + 2]; d += `M${fx(x - r)} ${fx(y)}a${fx(r)} ${fx(r)} 0 1 0 ${fx(2 * r)} 0a${fx(r)} ${fx(r)} 0 1 0 ${fx(-2 * r)} 0`; }
        out.push(`<path d="${d}" fill="${col[e.fill]}"${tr}/>`);
        break;
      }
      case 'hatch': {
        const id = `h${clipId++}`;
        defs.push(`<clipPath id="${id}"><polygon points="${pts(e.pts)}"/></clipPath>`);
        const [a0, b0, c0, d0] = bboxOf(e.pts.flat());
        const cx = (a0 + c0) / 2, cy = (b0 + d0) / 2, R = Math.hypot(c0 - a0, d0 - b0) / 2 + 4, ux = Math.cos(e.ang), uy = Math.sin(e.ang);
        let d = '';
        for (let v = -R; v <= R; v += e.gap) d += `M${fx(cx - ux * R - uy * v)} ${fx(cy - uy * R + ux * v)}L${fx(cx + ux * R - uy * v)} ${fx(cy + uy * R + ux * v)}`;
        out.push(`<g clip-path="url(#${id})"><path d="${d}" stroke="${col[e.stroke]}" stroke-width="${fx(e.lw)}" fill="none"/></g>`);
        break;
      }
      case 'text': {
        const paint = e.stroke ? `fill="none" stroke="${col[e.stroke]}" stroke-width="${fx(e.lw || 2)}"` : `fill="${col[e.fill]}"`;
        const ls = e.tr ? ` letter-spacing="${fx(e.tr * e.size)}"` : '';
        const rot = e.rot ? ` rotate(${fx((e.rot * 180) / Math.PI)})` : '';
        out.push(`<text transform="translate(${fx(e.x + (role === 'R' ? poster.mis[0] : 0))} ${fx(e.y + (role === 'R' ? poster.mis[1] : 0))})${rot}" font-family="${esc(e.f.fam)}" font-weight="${e.f.w}" font-size="${fx(e.size)}"${ls} ${paint}>${esc(e.str)}</text>`);
        break;
      }
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W * 2}" height="${H * 2}">
<defs><style>@import url('${FONT_CSS.replace(/&/g, '&amp;')}');</style>${defs.join('')}
<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="${poster.paperSeed % 97}"/><feColorMatrix values="0 0 0 0 .35  0 0 0 0 .25  0 0 0 0 .12  0 0 0 -1.1 .55"/></filter></defs>
<rect width="${W}" height="${H}" fill="${pal.paper}"/>
<g>${out.join('\n')}</g>
<rect width="${W}" height="${H}" filter="url(#grain)" opacity=".45"/>
</svg>`;
}

/* ================================================================
   Сцена: анимация, переходы, интерфейс
   ================================================================ */
const cv = $('#poster'), ctx = cv.getContext('2d');
const ink = document.createElement('canvas'), ictx = ink.getContext('2d');
let paperCv = null, wearPat = null, poster = null, prevSnap = null;
let tStart = 0, sheetT = 0, raf = 0, animating = false;

function sizeCanvas() {
  const r = cv.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(60, Math.round(r.width * dpr)), h = Math.max(90, Math.round(r.height * dpr));
  if (w === cv.width && h === cv.height) return false;
  cv.width = w; cv.height = h; ink.width = w; ink.height = h;
  wearPat = ictx.createPattern(wearTile(), 'repeat');
  if (poster) paperCv = makePaper(w, h, poster.pal, RNG(poster.paperSeed), poster);
  return true;
}
function drawSheet(g) {
  g.drawImage(paperCv, 0, 0);
  g.globalCompositeOperation = 'multiply';
  g.drawImage(ink, 0, 0);
  g.globalCompositeOperation = 'source-over';
}
function renderAt(t) {
  const k = cv.width / W;
  ictx.setTransform(1, 0, 0, 1, 0, 0);
  ictx.clearRect(0, 0, ink.width, ink.height);
  ictx.setTransform(k, 0, 0, k, 0, 0);
  const te = t - sheetT;
  for (const e of poster.els) drawEl(ictx, e, te, poster.col, poster.mis);
  ictx.setTransform(1, 0, 0, 1, 0, 0);
  ictx.globalCompositeOperation = 'destination-out';
  ictx.fillStyle = wearPat;
  ictx.fillRect(0, 0, ink.width, ink.height);
  ictx.globalCompositeOperation = 'source-over';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (t < sheetT && prevSnap) {
    const p = ease.outCubic(t / sheetT);
    ctx.drawImage(prevSnap, 0, 0, cv.width, cv.height);
    ctx.fillStyle = `rgba(20,14,10,${0.28 * p})`;
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.save();
    ctx.translate(cv.width / 2, -cv.height * (1 - p));
    ctx.rotate(-0.035 * (1 - p));
    ctx.translate(-cv.width / 2, 0);
    drawSheet(ctx);
    ctx.restore();
  } else drawSheet(ctx);
}
function frame(now) {
  raf = 0;
  const t = (now - tStart) / 1000;
  renderAt(t);
  if (t < sheetT + poster.total + 0.05) raf = requestAnimationFrame(frame);
  else { animating = false; onSheetDone(); }
}
function show(params, { transition = true, record = true } = {}) {
  if (poster && transition && paperCv) {
    prevSnap = document.createElement('canvas');
    prevSnap.width = cv.width; prevSnap.height = cv.height;
    prevSnap.getContext('2d').drawImage(cv, 0, 0);
    sheetT = 0.42;
  } else { prevSnap = null; sheetT = 0; }
  poster = build(params);
  paperCv = makePaper(cv.width, cv.height, poster.pal, RNG(poster.paperSeed), poster);
  if (record) pushHistory(params);
  updateCaption();
  if (raf) cancelAnimationFrame(raf);
  animating = true;
  tStart = performance.now();
  raf = requestAnimationFrame(frame);
  clearTimeout(autoTimer);
  resetAutoBar();
}

const ui = {
  slogan: $('#slogan'), apply: $('#sloganApply'), styles: $('#styles'), palettes: $('#palettes'),
  shuffle: $('#shuffle'), png: $('#png'), svg: $('#svg'), auto: $('#auto'), autoBar: $('#autoBar'),
  archive: $('#archive'), archCount: $('#archCount'), sheetNo: $('#sheetNo'), capStyle: $('#capStyle'), capNote: $('#capNote'),
  wrap: $('#posterWrap'), title: $('#title'), toast: $('#toast'),
};
const state = { style: 'any', palette: 'classic', slogan: '', auto: true, history: [], idx: -1, queue: [], last: null };

const ICONS = {
  any: '<svg viewBox="0 0 32 32"><rect x="4" y="4" width="11" height="11" fill="currentColor"/><rect x="17" y="17" width="11" height="11" fill="var(--red)"/><circle cx="22.5" cy="9.5" r="5.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 28 L15 17" stroke="currentColor" stroke-width="2"/></svg>',
  wedge: '<svg viewBox="0 0 32 32"><rect x="16" y="2" width="14" height="28" fill="currentColor"/><circle cx="20" cy="13" r="7" fill="var(--wall)"/><path d="M1 27 L19 14 L3 19 Z" fill="var(--red)"/></svg>',
  megaphone: '<svg viewBox="0 0 32 32"><path d="M9 21 L30 4 L30 17 Z" fill="var(--red)"/><path d="M3 30 C3 22 5 16 10 16 C12 16 12 20 10 22 C9 25 9 28 9 30 Z" fill="currentColor"/></svg>',
  rays: '<svg viewBox="0 0 32 32"><rect x="1" y="1" width="8" height="30" fill="currentColor"/><circle cx="21" cy="11" r="8" fill="var(--red)"/><path d="M17 31 L21 11 L25 31 M18.5 24 H23.5 M19.5 18 H22.5" stroke="currentColor" stroke-width="1.6" fill="none"/></svg>',
  spiral: '<svg viewBox="0 0 32 32"><circle cx="16" cy="14" r="13" fill="currentColor"/><circle cx="16" cy="13" r="9.5" fill="var(--wall)"/><circle cx="16" cy="12.5" r="6.5" fill="var(--red)"/><circle cx="16" cy="12.2" r="3" fill="currentColor"/><rect x="2" y="27" width="28" height="3" fill="currentColor"/></svg>',
  proun: '<svg viewBox="0 0 32 32"><rect x="3" y="14" width="26" height="4" transform="rotate(-30 16 16)" fill="currentColor"/><rect x="15" y="5" width="9" height="9" transform="rotate(-30 19.5 9.5)" fill="var(--red)"/><circle cx="9" cy="24" r="3.5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  type: '<svg viewBox="0 0 32 32"><path d="M3 29 L12 3 H17 L26 29 H20.5 L18.6 23 H10.4 L8.5 29 Z M12 18 H17 L14.5 10 Z" fill="currentColor"/><rect x="26" y="3" width="4" height="18" fill="var(--red)"/><rect x="26" y="24" width="4" height="5" fill="var(--red)"/></svg>',
};
function buildControls() {
  const opts = [['any', 'Любой'], ...STYLE_KEYS.map((k) => [k, STYLES[k].name])];
  ui.styles.innerHTML = opts.map(([k, n]) => `<button type="button" class="chip" data-style="${k}" aria-pressed="${k === state.style}">${ICONS[k]}<span>${n}</span></button>`).join('');
  ui.palettes.innerHTML = Object.entries(PALETTES).map(([k, p]) =>
    `<button type="button" class="swatch" data-pal="${k}" aria-pressed="${k === state.palette}"><b><i style="background:${p.paper}"></i><i style="background:${p.R}"></i><i style="background:${p.K}"></i><i style="background:${p.T}"></i></b><span>${p.name}</span></button>`).join('');
}
function nextStyle() {
  if (!state.queue.length) {
    const r = RNG((Math.random() * 1e9) >>> 0);
    state.queue = r.shuffle(STYLE_KEYS.slice());
    if (state.queue[0] === state.last) state.queue.push(state.queue.shift());
  }
  return state.queue.shift();
}
function nextParams() {
  const style = state.style === 'any' ? nextStyle() : state.style;
  state.last = style;
  return { seed: (Math.random() * 4294967295) >>> 0, style, palette: state.palette, slogan: state.slogan };
}
function updateCaption() {
  const p = poster.params;
  ui.sheetNo.textContent = poster.S.no;
  ui.capStyle.textContent = `Приём «${STYLES[p.style].name}»`;
  ui.capNote.textContent = STYLES[p.style].note;
}
function pushHistory(params) {
  state.history.push({ params, thumb: null });
  if (state.history.length > 12) state.history.shift();
  state.idx = state.history.length - 1;
  renderArchive();
}
function renderArchive() {
  ui.archive.innerHTML = state.history.map((h, i) =>
    `<button type="button" class="thumb" data-i="${i}" aria-current="${i === state.idx}" aria-label="Лист ${i + 1}">${h.thumb ? `<img src="${h.thumb}" alt="">` : ''}</button>`).join('');
  ui.archCount.textContent = state.history.length ? `· ${state.history.length}` : '';
}
function onSheetDone() {
  const item = state.history[state.idx];
  if (item && !item.thumb) {
    const t = document.createElement('canvas');
    t.width = 96; t.height = 144;
    t.getContext('2d').drawImage(cv, 0, 0, t.width, t.height);
    item.thumb = t.toDataURL('image/jpeg', 0.82);
    renderArchive();
  }
  scheduleAuto();
}

/* ---------- Автопоказ ---------- */
let autoTimer = 0;
const AUTO_MS = 5600;
function resetAutoBar() { ui.autoBar.style.transition = 'none'; ui.autoBar.style.transform = 'scaleX(0)'; }
function scheduleAuto() {
  clearTimeout(autoTimer);
  resetAutoBar();
  if (!state.auto || document.hidden) return;
  void ui.autoBar.offsetWidth;
  ui.autoBar.style.transition = `transform ${AUTO_MS}ms linear`;
  ui.autoBar.style.transform = 'scaleX(1)';
  autoTimer = setTimeout(() => show(nextParams()), AUTO_MS);
}
function setAuto(on) {
  state.auto = on;
  ui.auto.setAttribute('aria-pressed', String(on));
  if (on && !animating) scheduleAuto();
  if (!on) { clearTimeout(autoTimer); resetAutoBar(); }
}
document.addEventListener('visibilitychange', () => { if (document.hidden) { clearTimeout(autoTimer); resetAutoBar(); } else if (state.auto && !animating) scheduleAuto(); });

/* ---------- Действия ---------- */
function manual() { if (state.auto) setAuto(false); }
function newSheet() { manual(); show(nextParams()); }
function applySlogan() {
  manual();
  state.slogan = ui.slogan.value.trim().slice(0, 64);
  show({ ...poster.params, slogan: state.slogan });
}
function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
let toastTimer = 0;
function toast(msg) {
  ui.toast.textContent = msg;
  ui.toast.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.remove('on'), 2200);
}
function exportPNG() {
  manual();
  const c = renderStatic(poster, 3);
  c.toBlob((b) => { download(b, `konstruktivizm-${poster.S.no}.png`); toast('PNG 1800 × 2700 сохранён'); }, 'image/png');
}
function exportSVG() {
  manual();
  download(new Blob([toSVG(poster)], { type: 'image/svg+xml' }), `konstruktivizm-${poster.S.no}.svg`);
  toast('SVG сохранён — вектор со шрифтами Google');
}

ui.styles.addEventListener('click', (e) => {
  const b = e.target.closest('[data-style]');
  if (!b) return;
  state.style = b.dataset.style;
  state.queue = [];
  ui.styles.querySelectorAll('[data-style]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  newSheet();
});
ui.palettes.addEventListener('click', (e) => {
  const b = e.target.closest('[data-pal]');
  if (!b) return;
  state.palette = b.dataset.pal;
  ui.palettes.querySelectorAll('[data-pal]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  manual();
  show({ ...poster.params, palette: state.palette });
});
ui.archive.addEventListener('click', (e) => {
  const b = e.target.closest('[data-i]');
  if (!b) return;
  manual();
  state.idx = +b.dataset.i;
  show(state.history[state.idx].params, { record: false });
  renderArchive();
});
ui.shuffle.addEventListener('click', newSheet);
ui.wrap.addEventListener('click', newSheet);
ui.png.addEventListener('click', exportPNG);
ui.svg.addEventListener('click', exportSVG);
ui.auto.addEventListener('click', () => setAuto(!state.auto));
ui.apply.addEventListener('click', applySlogan);
ui.slogan.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); applySlogan(); ui.slogan.blur(); } });
document.addEventListener('keydown', (e) => {
  if (e.target === ui.slogan || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.code === 'Space' && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); newSheet(); }
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    const i = state.idx + (e.key === 'ArrowLeft' ? -1 : 1);
    if (i >= 0 && i < state.history.length) { manual(); state.idx = i; show(state.history[i].params, { record: false }); renderArchive(); }
  }
});

/* ---------- Заголовок: строки по ширине колонки ---------- */
function fitTitle() {
  const spans = ui.title.querySelectorAll('span');
  const w = ui.title.clientWidth;
  if (!w) return;
  spans.forEach((sp) => {
    mctx.font = `400 100px "Rubik Mono One", "Arial Black", sans-serif`;
    const m = mctx.measureText(sp.textContent);
    sp.style.fontSize = `${Math.floor(((w - 2) / (m.actualBoundingBoxLeft + m.actualBoundingBoxRight)) * 100 * 10) / 10}px`;
  });
}

/* ---------- Фон сцены: зерно ---------- */
function stageGrain() {
  const c = document.createElement('canvas');
  c.width = c.height = 180;
  const g = c.getContext('2d'), img = g.createImageData(180, 180), r = RNG(3);
  for (let i = 0; i < img.data.length; i += 4) { const v = r.f() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 22; }
  g.putImageData(img, 0, 0);
  document.documentElement.style.setProperty('--grain', `url(${c.toDataURL()})`);
}

/* ---------- Отладка: лист-контакт для проверки приёмов ---------- */
window.__sheet = (style, cols = 4, rows = 2, pal, base = 1000) => {
  const ov = document.createElement('canvas');
  const cw = 300, ch = 450;
  ov.width = cols * cw; ov.height = rows * ch;
  Object.assign(ov.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', objectFit: 'contain', background: '#111', zIndex: 99 });
  const g = ov.getContext('2d');
  const keys = Object.keys(PALETTES);
  for (let i = 0; i < cols * rows; i++) {
    const st = style === 'all' ? STYLE_KEYS[i % STYLE_KEYS.length] : style;
    const p = build({ seed: base + i * 7919, style: st, palette: pal || keys[i % 3], slogan: '' });
    g.drawImage(renderStatic(p, 0.5), (i % cols) * cw, Math.floor(i / cols) * ch);
  }
  document.body.appendChild(ov);
  return 'ok';
};

/* ---------- Старт ---------- */
async function start() {
  stageGrain();
  buildControls();
  const fams = ['400 60px "Rubik Mono One"', '400 60px "Dela Gothic One"', '400 60px "Russo One"', '700 60px "Oswald"', '500 60px "Oswald"'];
  const timeout = new Promise((res) => setTimeout(res, 2200));
  try { await Promise.race([Promise.all(fams.map((f) => document.fonts.load(f, 'АБВ'))), timeout]); } catch (err) { /* офлайн — системные шрифты */ }
  mcache = new Map();
  fitTitle();
  sizeCanvas();
  state.last = 'wedge';
  show({ seed: 1920, style: 'wedge', palette: 'classic', slogan: '' }, { transition: false });
  let rt = 0;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => { fitTitle(); if (sizeCanvas() && !animating) renderAt(1e9); }, 120);
  });
  document.fonts.addEventListener && document.fonts.addEventListener('loadingdone', () => {
    mcache = new Map();
    fitTitle();
    if (!animating && poster) { poster = build(poster.params); paperCv = makePaper(cv.width, cv.height, poster.pal, RNG(poster.paperSeed), poster); renderAt(1e9); }
  });
}
start();
})();
