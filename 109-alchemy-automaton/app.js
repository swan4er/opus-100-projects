'use strict';
/* Алхимический автомат — отрисовка доски, редактор деталей и программ, анимация циклов.
   Вся логика шага — в sim.js; здесь только интерфейс и красивые интерполяции между циклами. */
(function () {
  const A = window.Alchemy;
  const $ = (s) => document.querySelector(s);
  // в режиме съёмки (_tools/shot) холсты растеризуются на CPU: те же пиксели без очереди к программному GPU сервера
  const CTX = window.__SHOT__ ? { willReadFrequently: true } : undefined;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const NB = ' ';
  const SQ3 = Math.sqrt(3);
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  function plural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }
  const NCELLS = 24;

  /* ============================ стихии и детали ============================ */
  const EL = {
    fire: { col: '#ff6a3d', light: '#ffd0b0', dark: '#8a1c08', ink: 'rgba(60, 10, 0, 0.85)' },
    water: { col: '#3d97ff', light: '#c4e2ff', dark: '#0a347a', ink: 'rgba(0, 20, 60, 0.85)' },
    air: { col: '#bfe3f0', light: '#ffffff', dark: '#5b8699', ink: 'rgba(20, 50, 65, 0.85)' },
    earth: { col: '#5dbd57', light: '#cdf2bd', dark: '#1c561b', ink: 'rgba(8, 40, 8, 0.85)' },
    salt: { col: '#ebe1ca', light: '#ffffff', dark: '#8c8069', ink: 'rgba(55, 45, 30, 0.9)' },
    mercury: { col: '#b8c1ce', light: '#ffffff', dark: '#4a5361', ink: 'rgba(25, 30, 40, 0.9)' },
    sulfur: { col: '#f0c238', light: '#fff2b3', dark: '#8a6406', ink: 'rgba(70, 45, 0, 0.9)' },
    gold: { col: '#ffcd4a', light: '#fff6cf', dark: '#976604', ink: 'rgba(90, 55, 0, 0.9)' },
  };
  const ARM_COL = ['#d6483a', '#3f82d4', '#3aa66b', '#a06ad6'];
  const INSTR = [
    { k: 'G', name: 'Взять', key: '1' },
    { k: 'D', name: 'Отпустить', key: '2' },
    { k: 'L', name: 'Против часовой', key: '3' },
    { k: 'R', name: 'По часовой', key: '4' },
    { k: 'P', name: 'Крутить ↺', key: '5' },
    { k: 'Q', name: 'Крутить ↻', key: '6' },
    { k: '.', name: 'Стереть', key: '7' },
  ];
  const ICON = {
    G: '<svg viewBox="0 0 24 24" class="ico"><path d="M6 5c3.2 2.4 3.2 11.6 0 14M18 5c-3.2 2.4-3.2 11.6 0 14"/><circle class="fill" cx="12" cy="12" r="3.2"/></svg>',
    D: '<svg viewBox="0 0 24 24" class="ico"><path d="M5 4c.6 3.6 1.6 6.2 4.4 8M19 4c-.6 3.6-1.6 6.2-4.4 8"/><circle class="fill" cx="12" cy="18.5" r="2.8"/></svg>',
    L: '<svg viewBox="0 0 24 24" class="ico"><path d="M4 4.5v5h5"/><path d="M5.2 14.5A7.5 7.5 0 1 0 6.9 7L4 9.5"/></svg>',
    R: '<svg viewBox="0 0 24 24" class="ico"><path d="M20 4.5v5h-5"/><path d="M18.8 14.5A7.5 7.5 0 1 1 17.1 7L20 9.5"/></svg>',
    P: '<svg viewBox="0 0 24 24" class="ico"><path d="M5 5.5v4h4"/><path d="M6.4 13.6A6 6 0 1 0 7.6 8L5 9.5"/><circle class="fill" cx="12" cy="12" r="2.2"/></svg>',
    Q: '<svg viewBox="0 0 24 24" class="ico"><path d="M19 5.5v4h-4"/><path d="M17.6 13.6A6 6 0 1 1 16.4 8L19 9.5"/><circle class="fill" cx="12" cy="12" r="2.2"/></svg>',
    '.': '<svg viewBox="0 0 24 24" class="ico" style="opacity:.55"><path d="M7 7l10 10M17 7L7 17"/></svg>',
  };

  /* ============================ состояние ============================ */
  const store = load();
  const st = {
    pi: 5, // стартовая демонстрация — «Соляной мост»
    sol: null, demo: true,
    sim: null, ev: null, running: false, speed: 1, cycleStart: 0, pendingWin: 0,
    tool: null, instr: 'G', sel: null, hover: null,
    flash: new Map(), // индекс глифа → время вспышки
    dirty: true, // доска перерисовывается только при изменениях и во время анимации
  };
  const invalidate = () => { st.dirty = true; };
  const refCache = {};

  function load() {
    try { return JSON.parse(localStorage.getItem('alchemy-v1')) || { sols: {}, hist: {} }; } catch (e) { return { sols: {}, hist: {} }; }
  }
  function save() { try { localStorage.setItem('alchemy-v1', JSON.stringify(store)); } catch (e) { /* приватный режим */ } }
  const puzzle = () => A.PUZZLES[st.pi];
  const arms = () => st.sol.parts.filter(A.isArm);
  const emptyProg = () => Array(NCELLS).fill('.');
  function refOf(p) {
    if (!refCache[p.id]) refCache[p.id] = A.run(p, p.ref);
    return refCache[p.id];
  }
  function refSolution(p) {
    let ai = 0;
    return {
      parts: p.ref.parts.map((x) => (A.isArm(x) ? { ...x, prog: padProg(p.ref.programs[ai++]) } : { ...x })),
    };
  }
  function padProg(prog) { const out = emptyProg(); prog.forEach((c, i) => { if (i < NCELLS) out[i] = c; }); return out; }
  function toSim(sol) { return { parts: sol.parts, programs: sol.parts.filter(A.isArm).map((a) => a.prog) }; }

  /* ============================ геометрия доски ============================ */
  const board = $('#board');
  const bx = board.getContext('2d', CTX);
  let W = 0, H = 0, DPR = 1, size = 40, cx = 0, cy = 0;
  const bg = document.createElement('canvas');
  const hexPx = (q, r) => [cx + size * SQ3 * (q + r / 2), cy + size * 1.5 * r];
  function pxHex(x, y) {
    const q = ((SQ3 / 3) * (x - cx) - (y - cy) / 3) / size, r = ((2 / 3) * (y - cy)) / size;
    let rx = Math.round(q), rz = Math.round(r), ry = Math.round(-q - r);
    const dx = Math.abs(rx - q), dz = Math.abs(rz - r), dy = Math.abs(ry + q + r);
    if (dx > dy && dx > dz) rx = -ry - rz; else if (dy <= dz) rz = -rx - ry;
    return [rx, rz];
  }
  function hexSub(c, x, y, s) {
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + (i * Math.PI) / 3;
      const px = x + Math.cos(a) * s, py = y + Math.sin(a) * s;
      i ? c.lineTo(px, py) : c.moveTo(px, py);
    }
    c.closePath();
  }
  function hexPath(c, x, y, s) { c.beginPath(); hexSub(c, x, y, s); }
  // все клетки доски одним путём — для тени, заливки и обрезки фактуры
  function boardPath(c, hexes, s) {
    c.beginPath();
    for (const [q, r] of hexes) { const [x, y] = hexPx(q, r); hexSub(c, x, y, s); }
  }

  function resize() {
    const r = board.parentElement.getBoundingClientRect();
    W = Math.max(200, r.width); H = Math.max(200, r.height);
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    board.width = Math.round(W * DPR); board.height = Math.round(H * DPR);
    const R = puzzle().R;
    size = Math.min(W / (SQ3 * (2 * R + 1) + 0.6), (H - 12) / (3 * R + 2.4));
    cx = W / 2; cy = H / 2 + 4;
    paintBg();
    invalidate();
  }

  /* пергаментная доска с гравировкой — рисуется один раз на размер */
  function paintBg() {
    bg.width = board.width; bg.height = board.height;
    const c = bg.getContext('2d', CTX);
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    const R = puzzle().R;
    const hexes = [];
    for (let q = -R; q <= R; q++) for (let r = -R; r <= R; r++) if (A.onBoard(q, r, R)) hexes.push([q, r]);
    // тень доски
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.7)'; c.shadowBlur = size * 1.2; c.shadowOffsetY = size * 0.25;
    c.fillStyle = '#d9c49a';
    boardPath(c, hexes, size * 1.02); c.fill();
    c.restore();
    // пергамент
    const g = c.createRadialGradient(cx, cy - size * 2, size, cx, cy, size * (R + 2) * 1.7);
    g.addColorStop(0, '#f1e3c0'); g.addColorStop(0.6, '#e2cc9c'); g.addColorStop(1, '#bf9f68');
    c.fillStyle = g;
    boardPath(c, hexes, size * 1.02); c.fill();
    // пятна, волокна и гравированный круг мастера — внутри доски
    c.save();
    boardPath(c, hexes, size * 1.02);
    c.clip();
    engraving(c, R);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 90; i++) {
      const x = cx + (rnd() - 0.5) * size * 18, y = cy + (rnd() - 0.5) * size * 16, rr = size * (0.3 + rnd() * 1.6);
      const sg = c.createRadialGradient(x, y, 0, x, y, rr);
      sg.addColorStop(0, `rgba(140, 95, 40, ${0.05 + rnd() * 0.07})`); sg.addColorStop(1, 'rgba(140, 95, 40, 0)');
      c.fillStyle = sg; c.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
    for (let i = 0; i < 900; i++) {
      c.fillStyle = `rgba(90, 60, 25, ${rnd() * 0.08})`;
      c.fillRect(cx + (rnd() - 0.5) * size * 18, cy + (rnd() - 0.5) * size * 16, rnd() * 2.2, rnd() * 2.2);
    }
    // выжженный край
    const eg = c.createRadialGradient(cx, cy, size * (R + 0.2) * 1.2, cx, cy, size * (R + 1.2) * 1.75);
    eg.addColorStop(0, 'rgba(90, 50, 15, 0)'); eg.addColorStop(1, 'rgba(70, 35, 8, 0.55)');
    c.fillStyle = eg; c.fillRect(0, 0, W, H);
    c.restore();
    // гравировка клеток
    for (const [q, r] of hexes) {
      const [x, y] = hexPx(q, r);
      hexPath(c, x + 0.6, y + 0.8, size * 0.94);
      c.strokeStyle = 'rgba(255, 245, 220, 0.55)'; c.lineWidth = 1; c.stroke();
      hexPath(c, x, y, size * 0.94);
      c.strokeStyle = 'rgba(105, 70, 30, 0.42)'; c.lineWidth = 1.1; c.stroke();
      c.fillStyle = 'rgba(105, 70, 30, 0.2)';
      c.beginPath(); c.arc(x, y, size * 0.05, 0, Math.PI * 2); c.fill();
    }
  }

  function engraving(c, R) {
    const rr = size * (R + 0.35) * SQ3;
    c.save();
    c.translate(cx, cy);
    c.strokeStyle = 'rgba(110, 72, 30, 0.2)';
    c.lineWidth = Math.max(1, size * 0.035);
    for (const k of [1, 0.965, 0.62, 0.595]) { c.beginPath(); c.arc(0, 0, rr * k, 0, Math.PI * 2); c.stroke(); }
    // треугольник и квадрат, вписанные в большой круг
    c.beginPath();
    for (let i = 0; i <= 3; i++) { const a = -Math.PI / 2 + (i * 2 * Math.PI) / 3; i ? c.lineTo(Math.cos(a) * rr * 0.965, Math.sin(a) * rr * 0.965) : c.moveTo(Math.cos(a) * rr * 0.965, Math.sin(a) * rr * 0.965); }
    c.stroke();
    c.beginPath();
    for (let i = 0; i <= 4; i++) { const a = Math.PI / 4 + (i * Math.PI) / 2; i ? c.lineTo(Math.cos(a) * rr * 0.595, Math.sin(a) * rr * 0.595) : c.moveTo(Math.cos(a) * rr * 0.595, Math.sin(a) * rr * 0.595); }
    c.stroke();
    // деления по кругу
    for (let i = 0; i < 72; i++) {
      const a = (i * Math.PI) / 36, l = i % 6 ? 0.018 : 0.045;
      c.beginPath(); c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); c.lineTo(Math.cos(a) * rr * (1 + l), Math.sin(a) * rr * (1 + l)); c.stroke();
    }
    c.restore();
  }

  /* ============================ рисование предметов ============================ */
  function symbol(c, x, y, s, el, ink) {
    c.save();
    c.translate(x, y); c.scale(s, s);
    c.strokeStyle = ink; c.fillStyle = ink;
    c.lineWidth = 0.13; c.lineJoin = 'round'; c.lineCap = 'round';
    const tri = (up) => { c.beginPath(); if (up) { c.moveTo(0, -0.62); c.lineTo(0.56, 0.36); c.lineTo(-0.56, 0.36); } else { c.moveTo(0, 0.62); c.lineTo(0.56, -0.36); c.lineTo(-0.56, -0.36); } c.closePath(); c.stroke(); };
    const line = (x1, y1, x2, y2) => { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); };
    switch (el) {
      case 'fire': tri(true); break;
      case 'water': tri(false); break;
      case 'air': tri(true); line(-0.62, 0.02, 0.62, 0.02); break;
      case 'earth': tri(false); line(-0.62, -0.02, 0.62, -0.02); break;
      case 'salt': c.beginPath(); c.arc(0, 0, 0.5, 0, Math.PI * 2); c.stroke(); line(-0.5, 0, 0.5, 0); break;
      case 'mercury':
        c.beginPath(); c.arc(0, -0.08, 0.24, 0, Math.PI * 2); c.stroke();
        c.beginPath(); c.arc(0, -0.5, 0.2, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
        line(0, 0.16, 0, 0.64); line(-0.18, 0.42, 0.18, 0.42); break;
      case 'sulfur':
        c.beginPath(); c.moveTo(0, -0.66); c.lineTo(0.36, -0.06); c.lineTo(-0.36, -0.06); c.closePath(); c.stroke();
        line(0, -0.06, 0, 0.66); line(-0.24, 0.32, 0.24, 0.32); break;
      case 'gold':
        c.beginPath(); c.arc(0, 0, 0.5, 0, Math.PI * 2); c.stroke();
        c.beginPath(); c.arc(0, 0, 0.11, 0, Math.PI * 2); c.fill(); break;
      default: break;
    }
    c.restore();
  }
  function atom(c, x, y, r, el, alpha = 1, glow = 1) {
    const E = EL[el];
    if (alpha <= 0.01 || r <= 0.5) return;
    c.save();
    c.globalAlpha = alpha;
    c.shadowColor = E.col; c.shadowBlur = r * 0.9 * glow;
    const g = c.createRadialGradient(x - r * 0.35, y - r * 0.42, r * 0.08, x, y, r);
    g.addColorStop(0, E.light); g.addColorStop(0.55, E.col); g.addColorStop(1, E.dark);
    c.fillStyle = g;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    c.shadowBlur = 0;
    c.strokeStyle = 'rgba(25, 14, 6, 0.55)'; c.lineWidth = Math.max(1, r * 0.07); c.stroke();
    symbol(c, x, y, r * 0.62, el, E.ink);
    c.restore();
  }
  function bond(c, x1, y1, x2, y2, alpha) {
    if (alpha <= 0.01) return;
    c.save();
    c.globalAlpha = alpha;
    c.lineCap = 'round';
    c.strokeStyle = '#5b4222'; c.lineWidth = size * 0.3;
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
    c.strokeStyle = '#c9a063'; c.lineWidth = size * 0.2; c.stroke();
    const nx = -(y2 - y1), ny = x2 - x1, l = Math.hypot(nx, ny) || 1;
    c.strokeStyle = 'rgba(255, 240, 200, 0.6)'; c.lineWidth = size * 0.05;
    c.beginPath(); c.moveTo(x1 + (nx / l) * size * 0.05, y1 + (ny / l) * size * 0.05); c.lineTo(x2 + (nx / l) * size * 0.05, y2 + (ny / l) * size * 0.05); c.stroke();
    c.restore();
  }
  function brassGrad(c, x, y, r) {
    const g = c.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
    g.addColorStop(0, '#fbe4a8'); g.addColorStop(0.5, '#c79a52'); g.addColorStop(1, '#6e4f22');
    return g;
  }
  function arm(c, x, y, ang, len, open, color, sel) {
    const L = size * SQ3 * len;
    const tx = x + Math.cos(ang) * L, ty = y + Math.sin(ang) * L;
    c.save();
    // шестерня основания
    const rb = size * 0.58;
    c.shadowColor = 'rgba(40, 20, 5, 0.55)'; c.shadowBlur = size * 0.35; c.shadowOffsetY = size * 0.08;
    c.beginPath();
    for (let i = 0; i < 24; i++) {
      const a = ang + (i * Math.PI) / 12;
      const rr = i % 2 ? rb : rb * 1.13;
      c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    c.closePath();
    c.fillStyle = brassGrad(c, x, y, rb * 1.1); c.fill();
    c.shadowBlur = 0; c.shadowOffsetY = 0;
    c.strokeStyle = 'rgba(60, 40, 12, 0.8)'; c.lineWidth = 1.2; c.stroke();
    // штанга
    const w = size * 0.26;
    const nx = -Math.sin(ang), ny = Math.cos(ang);
    const rodEnd = L - size * 0.28;
    c.beginPath();
    c.moveTo(x + nx * w / 2, y + ny * w / 2);
    c.lineTo(x + Math.cos(ang) * rodEnd + nx * w / 2, y + Math.sin(ang) * rodEnd + ny * w / 2);
    c.lineTo(x + Math.cos(ang) * rodEnd - nx * w / 2, y + Math.sin(ang) * rodEnd - ny * w / 2);
    c.lineTo(x - nx * w / 2, y - ny * w / 2);
    c.closePath();
    const lg = c.createLinearGradient(x + nx * w / 2, y + ny * w / 2, x - nx * w / 2, y - ny * w / 2);
    lg.addColorStop(0, '#f6dc9c'); lg.addColorStop(0.5, '#b48645'); lg.addColorStop(1, '#6a4b1f');
    c.fillStyle = lg; c.fill();
    c.strokeStyle = 'rgba(55, 35, 10, 0.75)'; c.lineWidth = 1; c.stroke();
    // заклёпки и шарнир длинной руки
    for (let k = 1; k <= len; k++) {
      const d = k === len ? L * 0.35 : (L * k) / len;
      const px = x + Math.cos(ang) * d, py = y + Math.sin(ang) * d;
      c.beginPath(); c.arc(px, py, k === len ? size * 0.07 : size * 0.16, 0, Math.PI * 2);
      c.fillStyle = k === len ? '#5a4019' : brassGrad(c, px, py, size * 0.16); c.fill();
      if (k !== len) { c.strokeStyle = 'rgba(55,35,10,0.8)'; c.stroke(); }
    }
    // захват: две дуги обнимают атом от штанги вперёд; раскрытые — короче
    c.lineCap = 'round';
    const clawR = size * 0.56;
    for (const [col, lw] of [['#3f2c10', size * 0.17], ['#e2bd73', size * 0.09]]) {
      c.strokeStyle = col; c.lineWidth = lw;
      for (const s of [-1, 1]) {
        c.beginPath();
        c.arc(tx, ty, clawR, ang + s * (Math.PI - 0.55), ang + s * (1.0 + open * 0.95), s > 0);
        c.stroke();
      }
    }
    // эмалевый значок руки
    c.beginPath(); c.arc(x, y, size * 0.22, 0, Math.PI * 2);
    c.fillStyle = color; c.fill();
    c.strokeStyle = 'rgba(255, 240, 210, 0.85)'; c.lineWidth = 1.5; c.stroke();
    if (sel) {
      c.strokeStyle = 'rgba(255, 236, 170, 0.95)'; c.lineWidth = 2; c.setLineDash([5, 4]);
      c.beginPath(); c.arc(x, y, rb * 1.35, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
    }
    c.restore();
  }
  function glyph(c, g, flash, ghost) {
    const hx = A.partHexes(g).map(([q, r]) => hexPx(q, r));
    c.save();
    if (ghost) c.globalAlpha = 0.55;
    const ring = (x, y, rr) => {
      c.beginPath(); c.arc(x, y, rr, 0, Math.PI * 2);
      c.fillStyle = 'rgba(70, 50, 25, 0.16)'; c.fill();
      c.lineWidth = size * 0.1; c.strokeStyle = '#7a5a2a'; c.stroke();
      c.lineWidth = size * 0.045; c.strokeStyle = g.type === 'opus' ? '#e8c46a' : '#d9dde3'; c.stroke();
    };
    if (flash > 0.01) {
      c.shadowColor = g.type === 'unbond' ? '#8fd0ff' : '#ffd36b';
      c.shadowBlur = size * 1.1 * flash;
    }
    if (g.type === 'bond' || g.type === 'unbond') {
      const [a, b] = hx;
      c.lineCap = 'round';
      c.strokeStyle = '#7a5a2a'; c.lineWidth = size * 0.34;
      if (g.type === 'bond') { c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); c.strokeStyle = '#d9dde3'; c.lineWidth = size * 0.16; c.stroke(); }
      else {
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        for (const [p, s] of [[a, 1], [b, 1]]) {
          const ex = p[0] + (mx - p[0]) * 0.72, ey = p[1] + (my - p[1]) * 0.72;
          c.beginPath(); c.moveTo(p[0], p[1]); c.lineTo(ex, ey); c.strokeStyle = '#7a5a2a'; c.lineWidth = size * 0.34; c.stroke();
          c.strokeStyle = '#9fc9e8'; c.lineWidth = size * 0.16; c.stroke();
          void s;
        }
      }
      ring(a[0], a[1], size * 0.7); ring(b[0], b[1], size * 0.7);
    } else if (g.type === 'calc') {
      const [a] = hx;
      ring(a[0], a[1], size * 0.74);
      c.save();
      c.strokeStyle = 'rgba(80, 55, 25, 0.8)'; c.lineWidth = size * 0.06;
      for (let i = 0; i < 4; i++) {
        const ang = Math.PI / 4 + (i * Math.PI) / 2;
        c.beginPath(); c.moveTo(a[0] + Math.cos(ang) * size * 0.5, a[1] + Math.sin(ang) * size * 0.5); c.lineTo(a[0] + Math.cos(ang) * size * 0.64, a[1] + Math.sin(ang) * size * 0.64); c.stroke();
      }
      c.restore();
      symbol(c, a[0], a[1], size * 0.3, 'salt', 'rgba(80, 55, 25, 0.7)');
    } else if (g.type === 'opus') {
      c.strokeStyle = '#7a5a2a'; c.lineWidth = size * 0.12; c.lineJoin = 'round';
      c.beginPath(); hx.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.stroke();
      c.strokeStyle = '#e8c46a'; c.lineWidth = size * 0.05; c.stroke();
      hx.forEach(([x, y]) => ring(x, y, size * 0.7));
      const mx = (hx[0][0] + hx[1][0] + hx[2][0]) / 3, my = (hx[0][1] + hx[1][1] + hx[2][1]) / 3;
      symbol(c, mx, my, size * 0.22, 'gold', 'rgba(120, 80, 10, 0.9)');
    }
    c.restore();
  }
  function ioMarker(c, tmpl, kind, count, need) {
    c.save();
    for (const a of tmpl.atoms) {
      const [x, y] = hexPx(a.q, a.r);
      c.beginPath(); c.arc(x, y, size * 0.8, 0, Math.PI * 2);
      c.lineWidth = size * 0.08;
      c.strokeStyle = kind === 'in' ? 'rgba(90, 65, 30, 0.55)' : 'rgba(150, 105, 20, 0.8)';
      c.setLineDash(kind === 'in' ? [size * 0.18, size * 0.14] : []);
      c.stroke();
      if (kind === 'out') { c.beginPath(); c.arc(x, y, size * 0.9, 0, Math.PI * 2); c.lineWidth = size * 0.03; c.stroke(); }
    }
    c.setLineDash([]);
    const P = tmpl.atoms.map((a) => hexPx(a.q, a.r));
    for (const [i, j] of tmpl.bonds || []) bond(c, P[i][0], P[i][1], P[j][0], P[j][1], 0.35);
    tmpl.atoms.forEach((a, i) => atom(c, P[i][0], P[i][1], size * 0.58, a.el, kind === 'in' ? 0.28 : 0.4, 0));
    if (kind === 'out') {
      const low = P.reduce((a, p) => (p[1] > a[1] ? p : a), P[0]);
      const label = `${count}/${need}`;
      c.font = `700 ${Math.round(size * 0.36)}px "Alegreya Sans", sans-serif`;
      const tw = c.measureText(label).width + size * 0.3;
      const lx = low[0] - tw / 2, ly = low[1] + size * 0.78;
      c.fillStyle = count >= need ? '#3d6b33' : '#4b3413';
      c.beginPath();
      if (c.roundRect) c.roundRect(lx, ly, tw, size * 0.52, size * 0.26); else c.rect(lx, ly, tw, size * 0.52);
      c.fill();
      c.fillStyle = '#fbeed0';
      c.textBaseline = 'middle';
      c.fillText(label, lx + size * 0.15, ly + size * 0.27);
    }
    c.restore();
  }

  /* ============================ кадр ============================ */
  function cycleDur() { return (reduceMotion ? 700 : 560) / st.speed; }

  function render(now) {
    const c = bx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, board.width, board.height);
    c.drawImage(bg, 0, 0);
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    const P = puzzle();
    const sim = st.sim, ev = st.ev;
    const f = sim && ev ? clamp((now - st.cycleStart) / cycleDur(), 0, 1) : 1;
    const e = ease(f);

    P.inputs.forEach((inp) => ioMarker(c, inp, 'in'));
    P.outputs.forEach((o, i) => ioMarker(c, o, 'out', sim ? sim.produced[i] : 0, o.need));

    // глифы
    st.sol.parts.forEach((p, i) => {
      if (A.isArm(p)) return;
      const ft = st.flash.get(i);
      const fl = ft ? Math.exp(-Math.max(0, now - ft) / 320) * (now >= ft ? 1 : 0) : 0;
      glyph(c, p, fl, false);
      if (st.sel === i) {
        c.save(); c.strokeStyle = 'rgba(255, 236, 170, 0.95)'; c.lineWidth = 2; c.setLineDash([5, 4]);
        for (const [q, r] of A.partHexes(p)) { const [x, y] = hexPx(q, r); hexPath(c, x, y, size * 0.9); c.stroke(); }
        c.restore();
      }
    });

    // атомы и связи
    if (sim) {
      const pos = new Map();
      const placeAtom = (id, q, r) => {
        const m = ev && ev.moves.get(id);
        if (m && f < 1) {
          const [fx, fy] = hexPx(m.from[0], m.from[1]);
          const [ccx, ccy] = hexPx(m.center[0], m.center[1]);
          const phi = (m.ccw ? -1 : 1) * (Math.PI / 3) * e;
          const dx = fx - ccx, dy = fy - ccy;
          return [ccx + dx * Math.cos(phi) - dy * Math.sin(phi), ccy + dx * Math.sin(phi) + dy * Math.cos(phi)];
        }
        return hexPx(q, r);
      };
      for (const at of sim.atoms.values()) pos.set(at.id, placeAtom(at.id, at.q, at.r));
      const gonePos = new Map();
      if (ev) {
        for (const cns of ev.consumed) for (const at of cns.atoms) gonePos.set(at.id, placeAtom(at.id, at.q, at.r));
        for (const fu of ev.fused) for (const at of fu.from) gonePos.set(at.id, placeAtom(at.id, at.q, at.r));
      }
      const bonded = new Set(ev ? ev.bonded.map(([a, b]) => a + '|' + b) : []);
      for (const bk of sim.bonds) {
        const [a, b] = bk.split('|').map(Number);
        const pa = pos.get(a), pb = pos.get(b);
        if (!pa || !pb) continue;
        const isNew = bonded.has(a + '|' + b) || bonded.has(b + '|' + a);
        bond(c, pa[0], pa[1], pb[0], pb[1], isNew ? smooth(0.72, 1, f) : 1);
      }
      if (ev) {
        for (const [a, b] of ev.unbonded) {
          const pa = pos.get(a), pb = pos.get(b);
          if (pa && pb) bond(c, pa[0], pa[1], pb[0], pb[1], 1 - smooth(0.72, 1, f));
        }
        for (const cns of ev.consumed) for (const [a, b] of cns.bonds) {
          const pa = gonePos.get(a), pb = gonePos.get(b);
          if (pa && pb) bond(c, pa[0], pa[1], pb[0], pb[1], 1 - smooth(0.8, 1, f));
        }
      }
      const spawned = new Set(ev ? ev.spawned : []);
      const trans = new Map(ev ? ev.transmuted.map((t) => [t.id, t.from]) : []);
      const fusedTo = new Set(ev ? ev.fused.map((x) => x.to) : []);
      const rA = size * 0.62;
      for (const at of sim.atoms.values()) {
        const [x, y] = pos.get(at.id);
        let sc = 1;
        if (spawned.has(at.id)) sc = ease(smooth(0, 0.35, f));
        if (fusedTo.has(at.id)) sc = ease(smooth(0.78, 1, f));
        if (trans.has(at.id) && f < 1) {
          const k = smooth(0.7, 0.95, f);
          atom(c, x, y, rA * sc, trans.get(at.id), 1 - k);
          atom(c, x, y, rA * sc, at.el, k, 1 + k * 1.5);
        } else atom(c, x, y, rA * sc, at.el, 1, fusedTo.has(at.id) ? 1 + (1 - f) * 3 : 1);
      }
      if (ev && f < 1) {
        for (const cns of ev.consumed) for (const at of cns.atoms) {
          const [x, y] = gonePos.get(at.id);
          const k = smooth(0.78, 1, f);
          atom(c, x, y, rA * (1 - k * 0.6), at.el, 1 - k, 1 + k * 3);
        }
        for (const fu of ev.fused) {
          const [ax, ay] = hexPx(fu.at[0], fu.at[1]);
          for (const at of fu.from) {
            const [x, y] = gonePos.get(at.id);
            const k = smooth(0.72, 0.95, f);
            atom(c, x + (ax - x) * k, y + (ay - y) * k, rA * (1 - k * 0.7), at.el, 1 - k * 0.9, 1 + k * 2);
          }
        }
      }
    }

    // руки
    const armParts = st.sol.parts.map((p, i) => [p, i]).filter(([p]) => A.isArm(p));
    armParts.forEach(([p, pi], ai) => {
      const [x, y] = hexPx(p.q, p.r);
      let dir = p.dir, open = 1;
      if (sim) {
        const a = sim.arms[ai];
        const ea = ev && ev.arms[ai];
        if (ea && f < 1) { dir = ea.from + (ea.to - ea.from) * e; open = ea.grab ? 1 - e : ea.drop ? e : a.hold !== null ? 0 : 1; }
        else { dir = a.dir; open = a.hold !== null ? 0 : 1; }
      }
      arm(c, x, y, (-Math.PI / 3) * dir, p.type === 'arm2' ? 2 : 1, open, ARM_COL[ai % ARM_COL.length], st.sel === pi);
    });

    // предпросмотр установки
    if (st.tool && st.hover && !sim) {
      const part = makePart(st.tool, st.hover[0], st.hover[1]);
      const ok = canPlace(part, -1);
      c.save();
      c.globalAlpha = 0.6;
      if (A.isArm(part)) {
        const [x, y] = hexPx(part.q, part.r);
        arm(c, x, y, (-Math.PI / 3) * part.dir, part.type === 'arm2' ? 2 : 1, 1, ok ? '#7a6a4a' : '#b0403a', false);
      } else glyph(c, part, 0, true);
      c.globalAlpha = 1;
      c.strokeStyle = ok ? 'rgba(80, 150, 70, 0.9)' : 'rgba(200, 60, 50, 0.9)';
      c.lineWidth = 2;
      for (const [q, r] of A.isArm(part) ? [[part.q, part.r]] : A.partHexes(part)) { const [x, y] = hexPx(q, r); hexPath(c, x, y, size * 0.9); c.stroke(); }
      c.restore();
    }

    // ошибка
    if (sim && sim.error && sim.errorAt) {
      const [x, y] = hexPx(sim.errorAt[0], sim.errorAt[1]);
      const pulse = 0.5 + 0.5 * Math.sin(now / 160);
      c.save();
      c.strokeStyle = `rgba(236, 70, 50, ${0.5 + 0.5 * pulse})`;
      c.lineWidth = 3;
      c.beginPath(); c.arc(x, y, size * (0.9 + pulse * 0.2), 0, Math.PI * 2); c.stroke();
      c.restore();
    }
  }

  /* ============================ симуляция ============================ */
  function startSim() {
    st.sim = A.create(puzzle(), toSim(st.sol));
    st.ev = null;
    st.flash.clear();
  }
  function advance(now) {
    const sim = st.sim;
    if (!sim || sim.won || sim.error) return;
    const ev = A.step(sim);
    st.ev = ev;
    st.cycleStart = now;
    // вспышки глифов в конце цикла
    const gl = st.sol.parts.map((p, i) => [p, i]).filter(([p]) => !A.isArm(p));
    const fired = new Set();
    const hexOf = (id) => { const a = sim.atoms.get(id); return a ? A.hk(a.q, a.r) : null; };
    for (const [a, b] of ev.bonded.concat(ev.unbonded)) { fired.add(hexOf(a)); fired.add(hexOf(b)); }
    for (const t of ev.transmuted) fired.add(hexOf(t.id));
    for (const fu of ev.fused) fired.add(A.hk(fu.at[0], fu.at[1]));
    for (const [g, i] of gl) if (A.partHexes(g).some(([q, r]) => fired.has(A.hk(q, r)))) st.flash.set(i, now + cycleDur() * 0.85);
    $('#cycleNo').textContent = String(sim.t);
    updateStats();
    highlightPlayhead();
    if (ev.error) { st.running = false; setPlay(); showBanner(`${ev.error} — цикл${NB}${sim.t}`, 'Сбросить', resetSim, true); }
    else if (sim.won) st.pendingWin = now + cycleDur() + 150;
  }
  function resetSim() {
    st.sim = null; st.ev = null; st.running = false; st.pendingWin = 0;
    invalidate();
    $('#cycleNo').textContent = '0';
    $('#result').hidden = true;
    setPlay();
    if (st.demo) showDemoBanner(); else { hideBanner(); $('#demo').hidden = true; }
    updateStats();
    highlightPlayhead();
  }
  function play() {
    if (st.sim && (st.sim.won || st.sim.error)) resetSim();
    if (!st.sim) startSim();
    st.running = !st.running;
    if (st.running && !st.ev) advance(performance.now());
    setPlay();
  }
  function stepOnce() {
    if (st.sim && (st.sim.won || st.sim.error)) return;
    if (!st.sim) startSim();
    st.running = false;
    advance(performance.now());
    setPlay();
  }
  function setPlay() { $('#bPlay').classList.toggle('on', st.running); $('#bPlay').setAttribute('aria-label', st.running ? 'Пауза' : 'Пуск'); }

  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden) return;
    if (st.running && st.sim && now - st.cycleStart >= cycleDur()) advance(now);
    if (st.pendingWin && now >= st.pendingWin) { st.pendingWin = 0; st.running = false; setPlay(); onWin(); }
    let flashing = false;
    for (const t of st.flash.values()) if (now - t < 2000) flashing = true;
    const moving = st.sim && st.ev && now - st.cycleStart < cycleDur() + 40;
    const pulsing = st.sim && st.sim.error;
    if (st.dirty || st.running || moving || flashing || pulsing) {
      st.dirty = false;
      render(now);
    }
  }

  /* ============================ победа ============================ */
  function onWin() {
    const sim = st.sim, P = puzzle();
    const res = { cycles: sim.t, cost: sim.cost, area: sim.area.size };
    const ref = refOf(P);
    if (st.demo) {
      // демонстрация крутится по кругу
      setTimeout(() => { if (st.demo) { resetSim(); play(); } }, 900);
      return;
    }
    const h = (store.hist[P.id] = store.hist[P.id] || []);
    h.push(res);
    if (h.length > 12) h.shift();
    save();
    buildPuzzleList();
    const m = $('#resMetrics');
    m.innerHTML = '';
    for (const [key, name] of [['cycles', 'Циклы'], ['cost', 'Стоимость'], ['area', 'Площадь']]) {
      const v = res[key], r = ref[key];
      const mx = Math.max(r, ...h.map((x) => x[key])) * 1.12;
      const verdict = v < r ? `лучше${NB}мастера` : v === r ? `как${NB}у${NB}мастера` : `+${v - r} к${NB}эталону`;
      const col = document.createElement('div');
      col.className = 'hcol' + (v <= r ? ' good' : '');
      let bars = '';
      for (let i = 0; i < 12; i++) {
        const x = h[i - (12 - h.length)];
        bars += x ? `<i class="${i === 11 ? 'cur' : ''}" style="transform:scaleY(${(x[key] / mx).toFixed(3)})" title="${x[key]}"></i>` : '<i class="empty"></i>';
      }
      col.innerHTML = `<span class="lbl">${name}</span><b class="big">${v}</b><div class="chart">${bars}<u style="bottom:${((r / mx) * 100).toFixed(1)}%"></u></div><span class="verdict">эталон${NB}${r} · ${verdict}</span>`;
      m.appendChild(col);
    }
    $('#result').hidden = false;
  }

  /* ============================ детали ============================ */
  function makePart(type, q, r) {
    const base = { type, q, r, dir: 0 };
    if (A.isArm(base)) base.prog = emptyProg();
    return base;
  }
  function occupied(exceptIdx) {
    const m = new Map();
    st.sol.parts.forEach((p, i) => {
      if (i === exceptIdx) return;
      const hx = A.isArm(p) ? [[p.q, p.r]] : A.partHexes(p);
      for (const [q, r] of hx) m.set(A.hk(q, r), p);
    });
    return m;
  }
  function canPlace(part, exceptIdx) {
    const P = puzzle();
    const occ = occupied(exceptIdx);
    const hx = A.isArm(part) ? [[part.q, part.r]] : A.partHexes(part);
    const io = new Set();
    for (const t of P.inputs.concat(P.outputs)) for (const a of t.atoms) io.add(A.hk(a.q, a.r));
    for (const [q, r] of hx) {
      if (!A.onBoard(q, r, P.R)) return false;
      if (occ.has(A.hk(q, r))) return false;
      if (A.isArm(part) && io.has(A.hk(q, r))) return false;
    }
    return true;
  }
  function editSolution() {
    if (st.demo) leaveDemo(false);
    if (st.sim) resetSim();
  }
  function persist() {
    store.sols[puzzle().id] = JSON.parse(JSON.stringify(st.sol));
    save();
  }

  board.addEventListener('pointermove', (e) => {
    const r = board.getBoundingClientRect();
    const h = pxHex(e.clientX - r.left, e.clientY - r.top);
    if (!st.hover || h[0] !== st.hover[0] || h[1] !== st.hover[1]) { st.hover = h; if (st.tool) invalidate(); }
  });
  board.addEventListener('pointerleave', () => { st.hover = null; invalidate(); });
  board.addEventListener('click', (e) => {
    const r = board.getBoundingClientRect();
    const [q, rr] = pxHex(e.clientX - r.left, e.clientY - r.top);
    if (!A.onBoard(q, rr, puzzle().R)) { st.sel = null; updateSel(); return; }
    if (st.tool) {
      const part = makePart(st.tool, q, rr);
      if (!canPlace(part, -1)) return;
      editSolution();
      st.sol.parts.push(part);
      st.sel = st.sol.parts.length - 1;
      persist(); buildTracks(); updateSel(); updateStats();
      return;
    }
    // выбор поставленной детали
    const idx = st.sol.parts.findIndex((p) => (A.isArm(p) ? [[p.q, p.r]] : A.partHexes(p)).some(([a, b]) => a === q && b === rr));
    st.sel = idx >= 0 ? idx : null;
    updateSel();
  });
  function rotateSel() {
    if (st.sel === null) return;
    const p = st.sol.parts[st.sel];
    editSolution();
    const trial = { ...p, dir: (p.dir + 1) % 6 };
    for (let k = 0; k < 6 && !canPlace(trial, st.sel); k++) trial.dir = (trial.dir + 1) % 6;
    if (canPlace(trial, st.sel)) p.dir = trial.dir;
    persist(); updateSel();
  }
  function deleteSel() {
    if (st.sel === null) return;
    editSolution();
    st.sol.parts.splice(st.sel, 1);
    st.sel = null;
    persist(); buildTracks(); updateSel(); updateStats();
  }
  function updateSel() {
    invalidate();
    const box = $('#selBox');
    if (st.sel === null || !st.sol.parts[st.sel]) { box.hidden = true; return; }
    const p = st.sol.parts[st.sel];
    const ai = arms().indexOf(p);
    $('#selName').textContent = A.PARTS[p.type].name + (ai >= 0 ? ` ${ai + 1}` : '');
    box.hidden = false;
  }
  $('#selRot').addEventListener('click', rotateSel);
  $('#selDel').addEventListener('click', deleteSel);

  /* ============================ дорожки программы ============================ */
  let painting = false;
  function buildTracks() {
    invalidate();
    const box = $('#tracks');
    box.innerHTML = '';
    const list = arms();
    if (!list.length) {
      const p = document.createElement('p');
      p.className = 'empty-tracks';
      p.textContent = 'Поставьте на доску руку — здесь появится её дорожка команд.';
      box.appendChild(p);
      return;
    }
    const ruler = document.createElement('div');
    ruler.className = 'ruler';
    const period = A.periodOf(list.map((a) => a.prog));
    ruler.innerHTML = `<span class="head">цикл</span>` + Array.from({ length: NCELLS }, (_, i) => `<span class="${i === period - 1 ? 'per' : ''}">${i + 1}</span>`).join('');
    box.appendChild(ruler);
    list.forEach((a, ai) => {
      const row = document.createElement('div');
      row.className = 'track';
      const lab = document.createElement('div');
      lab.className = 'tlabel';
      lab.innerHTML = `<i style="background:${ARM_COL[ai % ARM_COL.length]}"></i>Рука ${ai + 1}`;
      row.appendChild(lab);
      for (let i = 0; i < NCELLS; i++) {
        const b = document.createElement('button');
        b.className = 'cell' + (i >= period && a.prog[i] === '.' ? ' off' : '');
        b.dataset.arm = ai; b.dataset.i = i;
        b.setAttribute('aria-label', `Рука ${ai + 1}, цикл ${i + 1}: ${nameOf(a.prog[i])}`);
        if (a.prog[i] !== '.') b.innerHTML = ICON[a.prog[i]];
        row.appendChild(b);
      }
      box.appendChild(row);
    });
    highlightPlayhead();
  }
  const nameOf = (k) => (INSTR.find((x) => x.k === k) || INSTR[6]).name;
  function setCell(ai, i, k) {
    const a = arms()[ai];
    if (!a || a.prog[i] === k) return false;
    a.prog[i] = k;
    return true;
  }
  $('#tracks').addEventListener('pointerdown', (e) => {
    const cell = e.target.closest('.cell');
    if (!cell) return;
    e.preventDefault();
    editSolution();
    const ai = +cell.dataset.arm, i = +cell.dataset.i;
    const a = arms()[ai];
    const k = e.button === 2 ? '.' : a.prog[i] === st.instr ? '.' : st.instr;
    painting = k;
    if (setCell(ai, i, k)) { persist(); buildTracks(); }
  });
  $('#tracks').addEventListener('pointerover', (e) => {
    if (painting === false) return;
    const cell = e.target.closest('.cell');
    if (!cell) return;
    if (setCell(+cell.dataset.arm, +cell.dataset.i, painting)) { persist(); buildTracks(); }
  });
  window.addEventListener('pointerup', () => { painting = false; });
  $('#tracks').addEventListener('contextmenu', (e) => e.preventDefault());
  function highlightPlayhead() {
    const sim = st.sim;
    const idx = sim && st.ev ? st.ev.t % sim.period : -1;
    document.querySelectorAll('.cell').forEach((c) => c.classList.toggle('play', +c.dataset.i === idx));
  }

  /* ============================ панели ============================ */
  function buildInstr() {
    const box = $('#instr');
    INSTR.forEach((ins) => {
      const b = document.createElement('button');
      b.className = 'ibtn';
      b.setAttribute('role', 'radio');
      b.dataset.k = ins.k;
      b.title = `${ins.name} (${ins.key})`;
      b.innerHTML = `${ICON[ins.k]}<span>${ins.name}</span><kbd>${ins.key}</kbd>`;
      b.addEventListener('click', () => selectInstr(ins.k));
      box.appendChild(b);
    });
    selectInstr('G');
  }
  function selectInstr(k) {
    st.instr = k;
    document.querySelectorAll('.ibtn').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.k === k)));
  }
  function partIcon(type) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 68;
    const c = cv.getContext('2d', CTX);
    const keep = { size, cx, cy };
    size = 12; cx = 34; cy = 34;
    c.save();
    if (type === 'arm1' || type === 'arm2') { c.translate(type === 'arm2' ? -18 : -8, 0); arm(c, 34, 34, 0, type === 'arm2' ? 2 : 1, 1, '#a88a5a', false); }
    else if (type === 'calc') glyph(c, { type, q: 0, r: 0, dir: 0 }, 0, false);
    else if (type === 'opus') { c.translate(-8, -8); glyph(c, { type, q: 0, r: 0, dir: 0 }, 0, false); }
    else { c.translate(-10, 0); glyph(c, { type, q: 0, r: 0, dir: 0 }, 0, false); }
    c.restore();
    ({ size, cx, cy } = keep);
    return cv;
  }
  function buildParts() {
    invalidate();
    const box = $('#parts');
    box.innerHTML = '';
    const allowed = puzzle().allowed;
    for (const type of ['arm1', 'arm2', 'calc', 'bond', 'unbond', 'opus']) {
      if (!allowed.includes(type)) continue;
      const b = document.createElement('button');
      b.className = 'pbtn';
      b.dataset.type = type;
      b.setAttribute('aria-pressed', String(st.tool === type));
      b.append(partIcon(type));
      const nm = document.createElement('span'); nm.textContent = A.PARTS[type].name;
      const cost = document.createElement('span'); cost.className = 'cost'; cost.textContent = `${A.PARTS[type].cost}${NB}◈`;
      b.append(nm, cost);
      b.addEventListener('click', () => {
        st.tool = st.tool === type ? null : type;
        st.sel = null; updateSel();
        board.classList.toggle('placing', !!st.tool);
        document.querySelectorAll('.pbtn').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.type === st.tool)));
      });
      box.appendChild(b);
    }
  }
  function buildElements() {
    const box = $('#elements');
    const names = A.ELEMENTS;
    for (const el of Object.keys(EL)) {
      const s = document.createElement('span');
      const cv = document.createElement('canvas');
      cv.width = cv.height = 48;
      atom(cv.getContext('2d', CTX), 24, 24, 17, el, 1, 0.6);
      s.append(cv, document.createTextNode(names[el].name));
      box.appendChild(s);
    }
  }
  function drawTarget() {
    const cv = $('#targetCv');
    const c = cv.getContext('2d', CTX);
    const P = puzzle();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, cv.width, cv.height);
    const keep = { size, cx, cy };
    const atoms = P.outputs.flatMap((o) => o.atoms);
    const pts0 = atoms.map((a) => [SQ3 * (a.q + a.r / 2), 1.5 * a.r]);
    const minx = Math.min(...pts0.map((p) => p[0])), maxx = Math.max(...pts0.map((p) => p[0]));
    const miny = Math.min(...pts0.map((p) => p[1])), maxy = Math.max(...pts0.map((p) => p[1]));
    size = Math.min(26, 160 / (maxx - minx + 2.2), 100 / (maxy - miny + 2.2));
    cx = cv.width / 2 - ((minx + maxx) / 2) * size;
    cy = cv.height / 2 - ((miny + maxy) / 2) * size;
    for (const o of P.outputs) {
      const pts = o.atoms.map((a) => hexPx(a.q, a.r));
      for (const [i, j] of o.bonds || []) bond(c, pts[i][0], pts[i][1], pts[j][0], pts[j][1], 1);
      o.atoms.forEach((a, i) => atom(c, pts[i][0], pts[i][1], size * 0.62, a.el, 1, 0.7));
    }
    ({ size, cx, cy } = keep);
    $('#pNeed').textContent = P.outputs.map((o) => `${o.need}`).join(' + ') + (P.outputs.length > 1 ? ' шт.' : ` шт.`);
  }
  function buildPuzzleList() {
    const box = $('#puzzles');
    box.innerHTML = '';
    A.PUZZLES.forEach((p, i) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.setAttribute('aria-current', String(i === st.pi));
      const h = store.hist[p.id];
      const best = h && h.length ? Math.min(...h.map((x) => x.cycles)) : null;
      b.innerHTML = `<span class="num">${ROMAN[i]}</span><span class="nm">${p.name}</span><span class="st${best ? ' ok' : ''}">${best ? `${best}${NB}ц.` : ''}</span>`;
      b.addEventListener('click', () => openPuzzle(i, false));
      li.appendChild(b);
      box.appendChild(li);
    });
  }
  function updateStats() {
    const cost = st.sol.parts.reduce((s, p) => s + A.PARTS[p.type].cost, 0);
    $('#stCost').textContent = String(cost);
    $('#stCycles').textContent = st.sim ? String(st.sim.t) : '—';
    $('#stArea').textContent = st.sim ? String(st.sim.area.size) : '—';
  }

  /* ============================ баннеры ============================ */
  let bannerAction = null;
  function showBanner(text, btn, action, err) {
    const b = $('#banner');
    $('#bannerText').textContent = text;
    $('#bannerBtn').textContent = btn;
    bannerAction = action;
    b.classList.toggle('err', !!err);
    b.hidden = false;
  }
  function hideBanner() { $('#banner').hidden = true; }
  $('#bannerBtn').addEventListener('click', () => bannerAction && bannerAction());
  function showDemoBanner() { hideBanner(); $('#demo').hidden = false; }
  $('#demoBtn').addEventListener('click', () => leaveDemo(true));
  function leaveDemo(reset) {
    st.demo = false;
    $('#demo').hidden = true;
    const saved = store.sols[puzzle().id];
    st.sol = saved ? JSON.parse(JSON.stringify(saved)) : { parts: [] };
    st.sel = null;
    hideBanner();
    if (reset) resetSim();
    buildTracks(); updateSel(); updateStats();
  }

  /* ============================ загрузка задачи ============================ */
  function openPuzzle(i, demo) {
    st.pi = i;
    st.demo = demo;
    st.sol = demo ? refSolution(puzzle()) : (store.sols[puzzle().id] ? JSON.parse(JSON.stringify(store.sols[puzzle().id])) : { parts: [] });
    st.sel = null; st.tool = null;
    board.classList.remove('placing');
    const P = puzzle();
    $('#pName').textContent = P.name;
    $('#pText').textContent = P.text.replace(/ — /g, NB + '— ');
    const ref = refOf(P);
    $('#refLine').textContent = `${ref.cycles}${NB}${plural(ref.cycles, 'цикл', 'цикла', 'циклов')} · ${ref.cost}${NB}◈ · площадь${NB}${ref.area}`;
    buildPuzzleList(); buildParts(); buildTracks(); drawTarget(); updateSel();
    resize();
    resetSim();
    if (demo) play();
  }

  /* ============================ клавиатура и кнопки ============================ */
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'Space') { e.preventDefault(); play(); }
    else if (e.code === 'KeyS') stepOnce();
    else if (e.code === 'Escape') { if (st.tool) { st.tool = null; buildParts(); board.classList.remove('placing'); } else resetSim(); }
    else if (e.code === 'KeyR') rotateSel();
    else if (e.code === 'Delete' || e.code === 'Backspace') deleteSel();
    else if (/^Digit[1-7]$/.test(e.code)) selectInstr(INSTR[+e.code.slice(5) - 1].k);
  });
  $('#bPlay').addEventListener('click', play);
  $('#bStep').addEventListener('click', stepOnce);
  $('#bReset').addEventListener('click', resetSim);
  document.querySelectorAll('.speed button').forEach((b) => b.addEventListener('click', () => {
    st.speed = +b.dataset.s;
    document.querySelectorAll('.speed button').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
  }));
  $('#resImprove').addEventListener('click', () => { $('#result').hidden = true; resetSim(); });
  $('#resNext').addEventListener('click', () => { $('#result').hidden = true; openPuzzle((st.pi + 1) % A.PUZZLES.length, false); });
  new ResizeObserver(() => resize()).observe(board.parentElement);

  /* ============================ старт ============================ */
  if (document.fonts) document.fonts.ready.then(invalidate);
  buildInstr();
  buildElements();
  openPuzzle(st.pi, true);
  requestAnimationFrame(frame);
})();
