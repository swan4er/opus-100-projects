/* Кириллица-конструктор: буква = скелет штрихов + перо.
   Контур — сумма Минковского скелета и пера (эллипс или прямоугольник), объединение — по правилу nonzero. */
'use strict';
(() => {
const $ = id => document.getElementById(id);
const TAU = Math.PI * 2, CAP = 700, DESC = -140;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ================= скелеты ================= */
function arc(cx, cy, rx, ry, a0, a1) { const n = Math.max(10, Math.ceil(Math.abs(a1 - a0) / 5)), p = []; for (let i = 0; i <= n; i++) { const a = (a0 + (a1 - a0) * i / n) * Math.PI / 180; p.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); } return p; }
function bez(p0, p1, p2, p3, n = 20) { const p = []; for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; p.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]); } return p; }
function chain(...parts) { const out = []; for (const part of parts) for (const q of part) { const l = out[out.length - 1]; if (!l || Math.hypot(l[0] - q[0], l[1] - q[1]) > 0.5) out.push(q); } return out; }
const bowlR = (x0, xs, yT, yB, rx) => chain([[x0, yT], [xs, yT]], arc(xs, (yT + yB) / 2, rx, (yT - yB) / 2, 90, -90), [[xs, yB], [x0, yB]]);
const bowlL = (x0, xs, yT, yB, rx) => chain([[x0, yT], [xs, yT]], arc(xs, (yT + yB) / 2, rx, (yT - yB) / 2, 90, 270), [[xs, yB], [x0, yB]]);
const dot = (x, y) => [[x, y], [x + 0.6, y]];
const mirror = (g) => ({ w: g.w, s: g.s.map(s => s.map(([x, y]) => [g.w - x, y])) });
const ZE = { w: 500, s: [chain(arc(250, 535, 225, 165, 155, -90), arc(250, 190, 245, 190, 90, -158))] };
const GL = {
  'А': { w: 620, s: [[[0, 0], [310, 700]], [[310, 700], [620, 0]], [[112, 230], [508, 230]]] },
  'Б': { w: 540, s: [[[0, 0], [0, 700]], [[0, 700], [500, 700]], bowlR(0, 300, 410, 0, 220)] },
  'В': { w: 560, s: [[[0, 0], [0, 700]], bowlR(0, 300, 700, 380, 190), bowlR(0, 320, 380, 0, 220)] },
  'Г': { w: 460, s: [[[0, 0], [0, 700]], [[0, 700], [460, 700]]] },
  'Д': { w: 620, s: [[[80, 0], [170, 700]], [[170, 700], [540, 700]], [[540, 700], [540, 0]], [[-10, 0], [630, 0]], [[-10, 0], [-10, DESC]], [[630, 0], [630, DESC]]] },
  'Е': { w: 480, s: [[[0, 0], [0, 700]], [[0, 700], [470, 700]], [[0, 360], [420, 360]], [[0, 0], [480, 0]]] },
  'Ё': { w: 480, s: [[[0, 0], [0, 700]], [[0, 700], [470, 700]], [[0, 360], [420, 360]], [[0, 0], [480, 0]], dot(140, 850), dot(340, 850)] },
  'Ж': { w: 780, s: [[[390, 0], [390, 700]], [[390, 355], [30, 700]], [[390, 355], [750, 700]], [[390, 355], [0, 0]], [[390, 355], [780, 0]]] },
  'З': ZE,
  'И': { w: 580, s: [[[0, 0], [0, 700]], [[580, 0], [580, 700]], [[0, 0], [580, 700]]] },
  'Й': { w: 580, s: [[[0, 0], [0, 700]], [[580, 0], [580, 700]], [[0, 0], [580, 700]], arc(290, 870, 125, 80, 200, 340)] },
  'К': { w: 540, s: [[[0, 0], [0, 700]], [[0, 330], [500, 700]], [[170, 456], [540, 0]]] },
  'Л': { w: 580, s: [[[580, 0], [580, 700]], [[170, 700], [580, 700]], bez([170, 700], [160, 300], [110, 40], [-10, 0])] },
  'М': { w: 740, s: [[[0, 0], [0, 700]], [[0, 700], [370, 150]], [[370, 150], [740, 700]], [[740, 700], [740, 0]]] },
  'Н': { w: 580, s: [[[0, 0], [0, 700]], [[580, 0], [580, 700]], [[0, 360], [580, 360]]] },
  'О': { w: 660, s: [arc(330, 350, 330, 355, 90, 450)] },
  'П': { w: 580, s: [[[0, 0], [0, 700]], [[0, 700], [580, 700]], [[580, 700], [580, 0]]] },
  'Р': { w: 520, s: [[[0, 0], [0, 700]], bowlR(0, 300, 700, 330, 210)] },
  'С': { w: 600, s: [arc(330, 350, 320, 355, 42, 318)] },
  'Т': { w: 580, s: [[[0, 700], [580, 700]], [[290, 700], [290, 0]]] },
  'У': { w: 580, s: [[[0, 700], [344, 250]], chain([[580, 700], [250, 70]], bez([250, 70], [228, 22], [180, 0], [70, 0], 10))] },
  'Ф': { w: 700, s: [[[350, 0], [350, 700]], arc(350, 370, 340, 230, 90, 450)] },
  'Х': { w: 600, s: [[[0, 0], [600, 700]], [[0, 700], [600, 0]]] },
  'Ц': { w: 600, s: [[[0, 0], [0, 700]], [[540, 700], [540, 0]], [[0, 0], [600, 0]], [[600, 0], [600, DESC]]] },
  'Ч': { w: 520, s: [[[520, 0], [520, 700]], chain([[0, 700], [0, 470]], arc(220, 470, 220, 150, 180, 270), [[220, 320], [520, 330]])] },
  'Ш': { w: 800, s: [[[0, 0], [0, 700]], [[400, 0], [400, 700]], [[800, 0], [800, 700]], [[0, 0], [800, 0]]] },
  'Щ': { w: 830, s: [[[0, 0], [0, 700]], [[390, 0], [390, 700]], [[780, 0], [780, 700]], [[0, 0], [830, 0]], [[830, 0], [830, DESC]]] },
  'Ъ': { w: 640, s: [[[0, 700], [140, 700]], [[140, 700], [140, 0]], bowlR(140, 400, 410, 0, 220)] },
  'Ы': { w: 740, s: [[[0, 0], [0, 700]], bowlR(0, 250, 410, 0, 210), [[740, 0], [740, 700]]] },
  'Ь': { w: 500, s: [[[0, 0], [0, 700]], bowlR(0, 260, 410, 0, 220)] },
  'Э': { w: 600, s: [arc(270, 350, 320, 355, 138, -138), [[180, 360], [590, 360]]] },
  'Ю': { w: 860, s: [[[0, 0], [0, 700]], [[0, 360], [260, 360]], arc(560, 350, 290, 355, 90, 450)] },
  'Я': { w: 540, s: [[[540, 0], [540, 700]], bowlL(540, 250, 700, 330, 220), [[300, 330], [0, 0]]] },
  '0': { w: 520, s: [arc(260, 350, 250, 355, 90, 450)] },
  '1': { w: 420, s: [[[250, 0], [250, 700]], [[250, 700], [40, 560]]] },
  '2': { w: 520, s: [chain(arc(255, 500, 240, 200, 165, -20), [[10, 0], [520, 0]])] },
  '3': ZE,
  '4': { w: 540, s: [[[400, 0], [400, 700]], [[400, 700], [0, 220]], [[0, 220], [540, 220]]] },
  '5': { w: 520, s: [chain([[470, 700], [70, 700], [40, 400]], arc(260, 230, 250, 235, 132, -160))] },
  '6': { w: 520, s: [arc(260, 230, 250, 235, 0, 360), bez([10, 240], [10, 560], [180, 700], [420, 690])] },
  '7': { w: 500, s: [[[0, 700], [500, 700]], [[500, 700], [160, 0]]] },
  '8': { w: 520, s: [arc(260, 530, 210, 170, -90, 270), arc(260, 185, 250, 190, 90, 450)] },
  '9': { w: 520, s: [arc(260, 470, 250, 235, 0, 360), bez([510, 460], [510, 140], [340, 0], [100, 10])] },
  '.': { w: 200, s: [dot(100, 40)] }, ',': { w: 200, s: [[[120, 40], [70, -110]]] }, '!': { w: 220, s: [[[110, 700], [110, 230]], dot(110, 40)] },
  '?': { w: 460, s: [chain(arc(230, 545, 200, 155, 160, -32), bez([400, 463], [330, 410], [230, 390], [230, 230], 10)), dot(230, 40)] },
  '-': { w: 360, s: [[[40, 300], [320, 300]]] }, '—': { w: 760, s: [[[0, 300], [760, 300]]] }, '–': { w: 520, s: [[[20, 300], [500, 300]]] },
  ':': { w: 200, s: [dot(100, 40), dot(100, 440)] }, ';': { w: 200, s: [[[120, 40], [70, -110]], dot(100, 440)] },
  '«': { w: 460, s: [[[220, 560], [40, 350], [220, 140]], [[440, 560], [260, 350], [440, 140]]] },
  '(': { w: 280, s: [arc(330, 300, 260, 480, 115, 245)] }, '"': { w: 300, s: [[[90, 700], [90, 520]], [[210, 700], [210, 520]]] },
  ' ': { w: 280, s: [] },
};
GL['»'] = mirror(GL['«']); GL[')'] = mirror(GL['(']);
const ALIAS = { A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х', Y: 'У', "'": '"', '„': '«', '“': '»' };
const LETTERS = 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ'.split(''), DIGITS = '0123456789«»!?()'.split('');
const glyphKey = ch => { const u = ch.toUpperCase(); return GL[u] ? u : ALIAS[u] && GL[ALIAS[u]] ? ALIAS[u] : ALIAS[ch] && GL[ALIAS[ch]] ? ALIAS[ch] : null; };

/* ================= перо ================= */
function makeNib(P) {
  const A = P.weight, B = Math.max(2.5, A * (1 - P.contrast * 0.93)), phi = P.angle * Math.PI / 180;
  const ux = Math.cos(phi), uy = Math.sin(phi), vx = -uy, vy = ux;
  const support = P.nib === 'rect'
    ? (nx, ny) => { const su = (nx * ux + ny * uy) >= 0 ? A : -A, sv = (nx * vx + ny * vy) >= 0 ? B : -B; return [su * ux + sv * vx, su * uy + sv * vy]; }
    : (nx, ny) => { const du = nx * ux + ny * uy, dv = nx * vx + ny * vy, k = Math.sqrt(A * A * du * du + B * B * dv * dv) || 1; return [(A * A * du * ux + B * B * dv * vx) / k, (A * A * du * uy + B * B * dv * vy) / k]; };
  const shape = P.nib === 'rect'
    ? [[A, B], [-A, B], [-A, -B], [A, -B]].map(([a, b]) => [a * ux + b * vx, a * uy + b * vy])
    : Array.from({ length: 32 }, (_, i) => { const t = i / 32 * TAU; return [A * Math.cos(t) * ux + B * Math.sin(t) * vx, A * Math.cos(t) * uy + B * Math.sin(t) * vy]; });
  return { A, B, support, shape, extY: Math.abs(support(0, 1)[1]), extX: Math.abs(support(1, 0)[0]), ux, uy };
}

/* ================= построение буквы ================= */
function resample(pts, step) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], d = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(d / step));
    for (let k = 1; k <= n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
  }
  return out;
}
function splitCorners(pts) {
  const parts = []; let cur = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    cur.push(pts[i]);
    if (i < pts.length - 1) {
      const a = pts[i - 1], b = pts[i], c = pts[i + 1], t1 = Math.atan2(b[1] - a[1], b[0] - a[0]), t2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
      let d = Math.abs(t2 - t1); if (d > Math.PI) d = TAU - d;
      if (d > 0.5) { parts.push(cur); cur = [pts[i]]; }
    }
  }
  parts.push(cur); return parts;
}
function ccw(poly) { let a = 0; for (let i = 0, n = poly.length / 2; i < n; i++) { const j = (i + 1) % n; a += poly[2 * i] * poly[2 * j + 1] - poly[2 * j] * poly[2 * i + 1]; } if (a < 0) { const r = new Float32Array(poly.length); for (let i = 0, n = poly.length / 2; i < n; i++) { r[2 * i] = poly[2 * (n - 1 - i)]; r[2 * i + 1] = poly[2 * (n - 1 - i) + 1]; } return r; } return poly; }
function stamp(nib, x, y) { const s = nib.shape, o = new Float32Array(s.length * 2); s.forEach(([a, b], i) => { o[2 * i] = x + a; o[2 * i + 1] = y + b; }); return ccw(o); }
function sweep(pts, nib) {
  const n = pts.length; if (n < 2) return null;
  const L = [], R = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)]; let tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    const s1 = nib.support(-ty, tx), s2 = nib.support(ty, -tx); L.push(pts[i][0] + s1[0], pts[i][1] + s1[1]); R.push(pts[i][0] + s2[0], pts[i][1] + s2[1]);
  }
  const poly = new Float32Array(n * 4); poly.set(L, 0); for (let i = 0; i < n; i++) { poly[2 * n + 2 * i] = R[2 * (n - 1 - i)]; poly[2 * n + 2 * i + 1] = R[2 * (n - 1 - i) + 1]; }
  return ccw(poly);
}
const cache = new Map();
function buildGlyph(ch, P, nib) {
  const key = glyphKey(ch); if (!key) return null;
  const ck = key + '|' + P.key; if (cache.has(ck)) return cache.get(ck);
  const def = GL[key], k = (CAP - 2 * nib.extY) / CAP, tanS = Math.tan(P.slant * Math.PI / 180), ox = nib.extX + 34;
  const xf = ([x, y]) => { const Y = nib.extY + y * k; return [ox + x * P.width + Y * tanS, Y]; };
  const polys = [], skel = [], serifs = [];
  const base = nib.extY, capY = nib.extY + CAP * k, descY = nib.extY + DESC * k, serifLen = P.serif * (nib.A * 1.1 + 58);
  for (const stroke of def.s) {
    const pts = stroke.map(xf); skel.push(pts);
    const isDot = pts.length === 2 && Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]) < 2;
    if (isDot) { polys.push(stamp(nib, pts[0][0], pts[0][1])); continue; }
    if (serifLen > 1) for (const [e, q] of [[pts[0], pts[1]], [pts[pts.length - 1], pts[pts.length - 2]]]) {
      const dx = e[0] - q[0], dy = e[1] - q[1];
      if (Math.abs(dy) > 0.35 * Math.abs(dx) && (Math.abs(e[1] - base) < 2 || Math.abs(e[1] - capY) < 2 || Math.abs(e[1] - descY) < 2)) serifs.push([[e[0] - serifLen, e[1]], [e[0] + serifLen, e[1]]]);
    }
    const parts = splitCorners(pts);
    parts.forEach((part, pi) => {
      const rs = resample(part, 6), sw = sweep(rs, nib); if (sw) polys.push(sw);
      polys.push(stamp(nib, part[0][0], part[0][1]));
      if (pi === parts.length - 1) polys.push(stamp(nib, part[part.length - 1][0], part[part.length - 1][1]));
      // тесные изгибы: подстраховываем штампами пера
      for (let i = 2; i < rs.length - 2; i += 3) {
        const a = rs[i - 2], b = rs[i], c = rs[i + 2], t1 = Math.atan2(b[1] - a[1], b[0] - a[0]), t2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
        let d = Math.abs(t2 - t1); if (d > Math.PI) d = TAU - d; const r = Math.hypot(c[0] - a[0], c[1] - a[1]) / Math.max(1e-3, d);
        if (r < nib.A * 1.15) polys.push(stamp(nib, b[0], b[1]));
      }
    });
  }
  for (const s of serifs) { const rs = resample(s, 6); polys.push(sweep(rs, nib), stamp(nib, s[0][0], s[0][1]), stamp(nib, s[1][0], s[1][1])); skel.push(s); }
  const adv = ox * 2 + def.w * P.width + P.tracking;
  const g = { polys, skel, adv, w: def.w, key };
  cache.set(ck, g); if (cache.size > 900) cache.delete(cache.keys().next().value);
  return g;
}
function fillGlyph(ctx, g) {
  ctx.beginPath();
  for (const p of g.polys) { ctx.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]); ctx.closePath(); }
  ctx.fill('nonzero');
}

/* ================= параметры и пресеты ================= */
const P = { weight: 58, contrast: 0.78, angle: 22, width: 0.98, slant: 0, serif: 0.5, tracking: 30, nib: 'ellipse', skel: true, key: '' };
const PRESETS = [
  ['Гротеск', { weight: 62, contrast: 0.12, angle: 0, width: 1, slant: 0, serif: 0, tracking: 40, nib: 'ellipse' }],
  ['Антиква', { weight: 58, contrast: 0.8, angle: 20, width: 0.96, slant: 0, serif: 0.5, tracking: 30, nib: 'ellipse' }],
  ['Устав', { weight: 74, contrast: 0.8, angle: 38, width: 0.9, slant: 0, serif: 0.18, tracking: 20, nib: 'rect' }],
  ['Плакат', { weight: 96, contrast: 0.35, angle: 90, width: 1.28, slant: 0, serif: 0, tracking: 10, nib: 'rect' }],
  ['Курсив', { weight: 44, contrast: 0.72, angle: 34, width: 0.84, slant: 13, serif: 0, tracking: 30, nib: 'ellipse' }],
  ['Техно', { weight: 24, contrast: 0, angle: 0, width: 1.38, slant: 0, serif: 0, tracking: 90, nib: 'rect' }],
  ['Трафарет', { weight: 84, contrast: 0.92, angle: 90, width: 1.1, slant: 0, serif: 0.3, tracking: 50, nib: 'rect' }],
];
const SLIDERS = [
  ['weight', 'Насыщенность', 12, 104, 1, v => `${Math.round(v)} ед.`],
  ['contrast', 'Контраст', 0, 0.95, 0.01, v => `${Math.round(v * 100)} %`],
  ['angle', 'Угол пера', -60, 90, 1, v => `${Math.round(v)}°`],
  ['width', 'Ширина', 0.7, 1.45, 0.01, v => `${Math.round(v * 100)} %`],
  ['slant', 'Наклон', -8, 18, 0.5, v => `${v.toFixed(1).replace('.', ',')}°`],
  ['serif', 'Засечки', 0, 1, 0.01, v => (v < 0.02 ? 'нет' : `${Math.round(v * 100)} %`)],
  ['tracking', 'Разрядка', -40, 180, 1, v => `${Math.round(v)} ед.`],
];
const ui = {};
function paramKey() { P.key = [P.weight, P.contrast, P.angle, P.width, P.slant, P.serif, P.tracking, P.nib].map(v => (typeof v === 'number' ? v.toFixed(3) : v)).join(','); }
function buildControls() {
  const box = $('ctrl');
  for (const [k, label, min, max, step, fmt] of SLIDERS) {
    const inp = document.createElement('input'); Object.assign(inp, { type: 'range', min, max, step, value: P[k] }); inp.setAttribute('aria-label', label);
    const out = document.createElement('output'); out.textContent = fmt(P[k]);
    const w = document.createElement('div'); w.className = 'sl';
    const top = document.createElement('div'); top.className = 'top'; top.append(label, out); w.append(top, inp); box.append(w);
    inp.addEventListener('input', () => { stopAnim(); P[k] = +inp.value; out.textContent = fmt(P[k]); clearPreset(); changed(); });
    ui[k] = { inp, out, fmt };
  }
  const seg = document.createElement('div'); seg.className = 'seg'; seg.setAttribute('role', 'radiogroup'); seg.setAttribute('aria-label', 'Форма пера');
  for (const [id, name] of [['ellipse', 'Круглое перо'], ['rect', 'Плоское перо']]) {
    const b = document.createElement('button'); b.textContent = name; b.setAttribute('role', 'radio'); b.dataset.nib = id;
    b.addEventListener('click', () => { stopAnim(); P.nib = id; syncNib(); clearPreset(); changed(); }); seg.append(b);
  }
  box.append(seg); ui.seg = seg;
  const row = document.createElement('div'); row.className = 'row';
  const chk = document.createElement('button'); chk.className = 'chk on'; chk.innerHTML = '<svg viewBox="0 0 14 14"><path d="M2 7.5 5.5 11 12 3.5"/></svg>'; chk.setAttribute('aria-label', 'Показывать скелет');
  chk.addEventListener('click', () => { P.skel = !P.skel; chk.classList.toggle('on', P.skel); drawGiant(); });
  row.append(chk, 'Показывать скелет и перо'); box.append(row);
  const note = document.createElement('p'); note.className = 'note';
  note.textContent = 'Перо — это эллипс или плоский «ножик». Штрих, идущий вдоль его кромки, выходит тонким, поперёк — толстым: так контраст рождается сам, как у каллиграфа с ширококонечным пером.';
  box.append(note);
  syncNib();
}
function syncNib() { [...ui.seg.children].forEach(b => { const on = b.dataset.nib === P.nib; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); }); }
function syncSliders() { for (const [k] of SLIDERS) { ui[k].inp.value = P[k]; ui[k].out.textContent = ui[k].fmt(P[k]); } syncNib(); }
const presetBtns = [];
function buildPresets() {
  const box = $('presets');
  PRESETS.forEach(([name, vals], i) => {
    const b = document.createElement('button'); b.className = 'preset'; b.textContent = name;
    b.addEventListener('click', () => { stopAnim(); applyPreset(i, true); }); presetBtns.push(b); box.append(b);
  });
}
function clearPreset() { presetBtns.forEach(b => b.classList.remove('on')); }
let tween = null;
function applyPreset(i, animate) {
  const target = PRESETS[i][1]; presetBtns.forEach((b, j) => b.classList.toggle('on', j === i));
  P.nib = target.nib; syncNib();
  if (!animate || matchMedia('(prefers-reduced-motion: reduce)').matches) { Object.assign(P, target); syncSliders(); changed(); return; }
  const from = { ...P }, t0 = performance.now();
  tween = () => { const t = Math.min(1, (performance.now() - t0) / 520), e = 1 - Math.pow(1 - t, 3); for (const [k] of SLIDERS) P[k] = from[k] + (target[k] - from[k]) * e; syncSliders(); changed(); if (t >= 1) tween = null; };
}

/* ================= отрисовка ================= */
const INK = '#141311', ACC = '#c3321c', GRID = '#cfc7b6';
let dpr = Math.min(2, window.devicePixelRatio || 1), nib = null, selected = 'Ж', dirty = true;
function changed() { paramKey(); nib = makeNib(P); dirty = true; }
function sizeCanvas(cv, cssH) { const w = cv.clientWidth || cv.parentElement.clientWidth; if (cssH != null) cv.style.height = cssH + 'px'; const h = cssH != null ? cssH : cv.clientHeight; if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); } return [w, h]; }
function layoutLine(text, sc) { let x = 0; const items = []; for (const ch of text) { const g = buildGlyph(ch, P, nib); if (!g) continue; items.push([g, x]); x += g.adv * sc; } return { items, w: x }; }
function drawText(ctx, text, x, baseline, sc, color) { ctx.fillStyle = color; for (const ch of text) { const g = buildGlyph(ch, P, nib); if (!g) continue; ctx.save(); ctx.translate(x, baseline); ctx.scale(sc, -sc); fillGlyph(ctx, g); ctx.restore(); x += g.adv * sc; } return x; }
function drawTitle() {
  const cv = $('titleCv'), [w, h] = sizeCanvas(cv), ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
  const text = 'КИРИЛЛИЦА-КОНСТРУКТОР', l = layoutLine(text, 1), sc = Math.min((h * 0.78) / 860, (w - 4) / l.w);
  drawText(ctx, text, 0, h * 0.86, sc, INK);
}
function drawGiant() {
  const cv = $('giantCv'), [w, h] = sizeCanvas(cv), ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
  const g = buildGlyph(selected, P, nib); if (!g) return;
  const sc = Math.min((h * 0.62) / CAP, (w * 0.78) / g.adv), baseline = h * 0.76, x0 = (w - g.adv * sc) / 2;
  // метрики
  ctx.strokeStyle = GRID; ctx.lineWidth = 1; ctx.setLineDash([]);
  const METRICS = [[0, 'базовая линия'], [CAP, 'высота прописных'], [DESC, 'нижний выносной']];
  for (const [y] of METRICS) { const Y = Math.round(baseline - y * sc) + 0.5; ctx.beginPath(); ctx.moveTo(0, Y); ctx.lineTo(w, Y); ctx.stroke(); }
  ctx.setLineDash([4, 5]); ctx.beginPath(); ctx.moveTo(x0 + 0.5, baseline + DESC * sc - 30); ctx.lineTo(x0 + 0.5, baseline - CAP * sc - 40); ctx.moveTo(x0 + g.adv * sc + 0.5, baseline + DESC * sc - 30); ctx.lineTo(x0 + g.adv * sc + 0.5, baseline - CAP * sc - 40); ctx.stroke(); ctx.setLineDash([]);
  ctx.save(); ctx.translate(x0, baseline); ctx.scale(sc, -sc); ctx.fillStyle = INK; fillGlyph(ctx, g); ctx.restore();
  if (P.skel) {
    ctx.save(); ctx.translate(x0, baseline); ctx.scale(sc, -sc);
    ctx.strokeStyle = ACC; ctx.lineWidth = 1.6 / sc; ctx.lineJoin = 'round';
    for (const s of g.skel) { ctx.beginPath(); s.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); }
    ctx.fillStyle = ACC; for (const s of g.skel) for (const [x, y] of [s[0], s[s.length - 1]]) { ctx.beginPath(); ctx.arc(x, y, 3.2 / sc, 0, TAU); ctx.fill(); }
    // перо в начале первого штриха
    const s0 = g.skel[0]; if (s0) { ctx.beginPath(); nib.shape.forEach(([a, b], i) => (i ? ctx.lineTo(s0[0][0] + a, s0[0][1] + b) : ctx.moveTo(s0[0][0] + a, s0[0][1] + b))); ctx.closePath(); ctx.fillStyle = 'rgba(195,50,28,.18)'; ctx.fill(); ctx.lineWidth = 1.4 / sc; ctx.stroke(); }
    ctx.restore();
  }
  ctx.font = '12px "Martian Mono", monospace'; ctx.textAlign = 'right';
  for (const [y, lbl] of METRICS) { const Y = Math.round(baseline - y * sc), tw = ctx.measureText(lbl).width; ctx.fillStyle = 'rgba(251,249,243,.92)'; ctx.fillRect(w - tw - 22, Y - 19, tw + 12, 16); ctx.fillStyle = '#6e685c'; ctx.fillText(lbl, w - 16, Y - 6); }
  ctx.textAlign = 'left';
  $('giantCap').innerHTML = `<b>${selected}</b> · ширина ${Math.round(g.adv)} ед.<br>перо ${Math.round(nib.A * 2)}×${Math.round(nib.B * 2)} ед., угол ${Math.round(P.angle)}°`;
}
let gridCells = [];
function drawGrid() {
  const cv = $('gridCv'), cw = cv.clientWidth || 400, cols = cw < 420 ? 6 : 7, cell = cw / cols, chars = LETTERS.concat(DIGITS), rows = Math.ceil(chars.length / cols);
  const [w, h] = sizeCanvas(cv, Math.round(cell * rows)), ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
  gridCells = [];
  chars.forEach((ch, i) => {
    const cx = (i % cols) * cell, cy = Math.floor(i / cols) * cell; gridCells.push([ch, cx, cy, cell]);
    if (ch === selected) { ctx.fillStyle = '#e8e2d4'; ctx.fillRect(cx, cy, cell, cell); }
    ctx.strokeStyle = GRID; ctx.lineWidth = 1; ctx.strokeRect(Math.round(cx) + 0.5, Math.round(cy) + 0.5, cell, cell);
    const g = buildGlyph(ch, P, nib); if (!g) return;
    const sc = Math.min((cell * 0.5) / CAP, (cell * 0.8) / g.adv);
    ctx.save(); ctx.translate(cx + (cell - g.adv * sc) / 2, cy + cell * 0.74); ctx.scale(sc, -sc); ctx.fillStyle = ch === selected ? ACC : INK; fillGlyph(ctx, g); ctx.restore();
  });
}
function drawTextBlock() {
  const cv = $('textCv'), cw = cv.clientWidth || 600, text = ($('textIn').value || ' ').toUpperCase();
  const sizePx = cw < 500 ? 34 : 58, sc = sizePx / CAP, lineH = sizePx * 1.55;
  const words = text.split(/\s+/).filter(Boolean), lines = []; let cur = '';
  for (const wd of words) { const t = cur ? cur + ' ' + wd : wd; if (layoutLine(t, sc).w > cw - 4 && cur) { lines.push(cur); cur = wd; } else cur = t; }
  if (cur) lines.push(cur);
  const [w, h] = sizeCanvas(cv, Math.max(lineH, Math.ceil(lines.length * lineH + sizePx * 0.4))), ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
  lines.forEach((ln, i) => drawText(ctx, ln, 0, sizePx * 1.12 + i * lineH, sc, INK));
  const n = [...text].filter(c => LETTERS.includes(c)).length, uniq = new Set([...text].filter(c => LETTERS.includes(c))).size;
  $('textInfo').textContent = `${n} ${plural(n, 'буква', 'буквы', 'букв')} · ${uniq} из 33 разных`;
}
function plural(n, a, b, c) { n = Math.abs(n) % 100; const d = n % 10; if (n > 10 && n < 20) return c; if (d > 1 && d < 5) return b; if (d === 1) return a; return c; }
function render() { drawTitle(); drawGiant(); drawGrid(); drawTextBlock(); dirty = false; }

/* ================= взаимодействие ================= */
$('gridCv').addEventListener('click', e => {
  const r = e.currentTarget.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  const c = gridCells.find(([, cx, cy, s]) => x >= cx && x < cx + s && y >= cy && y < cy + s); if (c) { selected = c[0]; dirty = true; }
});
$('gridCv').addEventListener('mousemove', e => { const r = e.currentTarget.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, c = gridCells.find(([, cx, cy, s]) => x >= cx && x < cx + s && y >= cy && y < cy + s); $('gridHint').textContent = c ? `буква «${c[0]}»` : 'щёлкните букву'; });
$('textIn').addEventListener('input', () => { dirty = true; });
$('bRand').addEventListener('click', () => {
  stopAnim(); clearPreset();
  const r = (a, b) => a + Math.random() * (b - a);
  Object.assign(P, { weight: r(20, 96), contrast: r(0, 0.92), angle: r(-40, 80), width: r(0.78, 1.35), slant: Math.random() < 0.3 ? r(6, 14) : 0, serif: Math.random() < 0.45 ? r(0.2, 0.8) : 0, tracking: r(10, 90), nib: Math.random() < 0.5 ? 'rect' : 'ellipse' });
  syncSliders(); changed();
});
$('bSvg').addEventListener('click', () => {
  const text = ($('textIn').value || 'КИРИЛЛИЦА').toUpperCase(), l = layoutLine(text, 1), H = CAP + 420;
  let d = '';
  for (const [g, x] of l.items) for (const p of g.polys) { d += `M${(x + p[0]).toFixed(1)} ${(CAP + 200 - p[1]).toFixed(1)}`; for (let i = 2; i < p.length; i += 2) d += `L${(x + p[i]).toFixed(1)} ${(CAP + 200 - p[i + 1]).toFixed(1)}`; d += 'Z'; }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.ceil(l.w)} ${H}"><path fill="#141311" fill-rule="nonzero" d="${d}"/></svg>`;
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })); a.download = 'кириллица.svg'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});
// «дыхание» шрифта, пока его никто не трогает
let anim = !matchMedia('(prefers-reduced-motion: reduce)').matches, t = 0, last = performance.now();
function stopAnim() { if (!anim) return; anim = false; $('bPlay').classList.remove('on'); $('bPlay').setAttribute('aria-pressed', 'false'); }
$('bPlay').addEventListener('click', () => { anim = !anim; $('bPlay').classList.toggle('on', anim); $('bPlay').setAttribute('aria-pressed', anim ? 'true' : 'false'); if (anim) clearPreset(); });
const ORDER = ['Ж', 'Ф', 'Я', 'Щ', 'Ю', 'Д', 'Б', 'З', 'Ы', 'Й'];
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now; if (document.hidden) return;
  if (tween) tween();
  if (anim) {
    t += dt;
    P.weight = 56 + 34 * Math.sin(t * 0.55); P.contrast = 0.5 + 0.42 * Math.sin(t * 0.37 + 1.1); P.angle = 26 + 38 * Math.sin(t * 0.23);
    P.width = 1.02 + 0.18 * Math.sin(t * 0.31 + 2); P.serif = Math.max(0, 0.55 * Math.sin(t * 0.19 + 0.4)); P.slant = 0;
    if (Math.floor(t / 6) !== Math.floor((t - dt) / 6)) selected = ORDER[Math.floor(t / 6) % ORDER.length];
    syncSliders(); changed();
  }
  if (dirty) render();
}
let rz = 0; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { dpr = Math.min(2, window.devicePixelRatio || 1); dirty = true; }, 100); });
buildPresets(); buildControls(); changed();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { dirty = true; });
// стартовый кадр: полпериода «дыхания», чтобы первая картинка была выразительной
t = 2.2; P.weight = 56 + 34 * Math.sin(t * 0.55); P.contrast = 0.5 + 0.42 * Math.sin(t * 0.37 + 1.1); P.angle = 26 + 38 * Math.sin(t * 0.23); P.width = 1.02 + 0.18 * Math.sin(t * 0.31 + 2); P.serif = Math.max(0, 0.55 * Math.sin(t * 0.19 + 0.4));
syncSliders(); changed(); render();
requestAnimationFrame(frame);
})();
