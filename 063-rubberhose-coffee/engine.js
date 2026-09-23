'use strict';
/* =====================================================================
   Кофейник Жорж · движок фильма
   ---------------------------------------------------------------------
   · время: доли регтайма, ключевые кадры с easing, прыжки по дуге;
   · «резиновые» кисти: руки-шланги, перчатки, башмаки, глаза-«пироги»;
   · плёнка: зерно, царапины, пыль, мерцание, дрожание кадра, виньетка.
   Всё, что видно в кадре, — функция от времени t (секунды фильма).
   ===================================================================== */

const TAU = Math.PI * 2;
const BPM = 120;
const BEAT = 60 / BPM;          // 0,5 с — одна доля регтайма, такт 2/4 = 1 с
const FPS = 24;                 // плёночная частота кадров
/** В режиме съёмки (_tools/shot) рисуем на процессоре: программный GPU сервера во много раз медленнее. */
const CPU_CANVAS = typeof window !== 'undefined' && !!window.__SHOT__;
function makeCanvas(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: CPU_CANVAS })];
}

/* ---------- числа ---------- */
function clamp(x, a = 0, b = 1) { return x < a ? a : x > b ? b : x; }
function lerp(a, b, u) { return a + (b - a) * u; }
function seg(t, a, b) { return clamp((t - a) / (b - a)); }
function frac(x) { return x - Math.floor(x); }

const Ease = {
  lin: (u) => u,
  in: (u) => u * u,
  out: (u) => 1 - (1 - u) * (1 - u),
  io: (u) => (u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u)),
  in3: (u) => u * u * u,
  out3: (u) => 1 - (1 - u) ** 3,
  io3: (u) => (u < 0.5 ? 4 * u * u * u : 1 - ((-2 * u + 2) ** 3) / 2),
  back: (u) => 1 + 2.7 * (u - 1) ** 3 + 1.7 * (u - 1) ** 2,          // перелёт в конце (захлёст)
  antic: (u) => 2.7 * u * u * u - 1.7 * u * u,                       // замах перед движением
  elastic: (u) => (u <= 0 ? 0 : u >= 1 ? 1 : 2 ** (-9 * u) * Math.sin((u * 7 - 0.75) * TAU / 3) + 1),
  hold: () => 0,
};

/** Ключевые кадры: keys = [[t, v, ease], …]; ease — у отрезка, который кончается этим ключом. */
function K(t, keys) {
  const n = keys.length;
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < n; i++) {
    const k = keys[i];
    if (t < k[0]) {
      const p = keys[i - 1];
      const f = Ease[k[2] || 'io'];
      return p[1] + (k[1] - p[1]) * f((t - p[0]) / (k[0] - p[0]));
    }
  }
  return keys[n - 1][1];
}

/* ---------- случайность без состояния: кадр однозначно задан t ---------- */
function hash(n) {
  let x = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}
function hash2(a, b) { return hash(Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663)); }
function noise1(x, seed = 0) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return lerp(hash2(i, seed), hash2(i + 1, seed), u) * 2 - 1;
}
/** Затухающее колебание после события t0 — захлёст и «доигрывание». */
function wob(t, t0, amp, hz = 3, damp = 6) {
  if (t < t0) return 0;
  const d = t - t0;
  return amp * Math.exp(-damp * d) * Math.sin(TAU * hz * d);
}

/* ---------- ритм ---------- */
function beatU(t, t0 = 0) { return frac((t - t0) / BEAT); }
function beatN(t, t0 = 0) { return Math.floor((t - t0) / BEAT); }

/** Прыжок: замах (присед), растяжение в полёте, сжатие при приземлении. */
function hop(t, t0, dur, x0, y0, x1, y1, h, pre = 0.14) {
  const r = { x: x0, y: y0, sq: 0, air: 0, u: 0 };
  if (t < t0 - pre) return r;
  if (t < t0) { r.sq = -0.26 * Ease.out(seg(t, t0 - pre, t0)); return r; }
  if (t < t0 + dur) {
    const u = (t - t0) / dur;
    r.u = u; r.air = 1;
    r.x = lerp(x0, x1, u);
    r.y = lerp(y0, y1, u) - 4 * h * u * (1 - u);
    r.sq = u < 0.5 ? 0.3 * (1 - u / 0.5) ** 2 : 0.2 * ((u - 0.5) / 0.5) ** 2;
    return r;
  }
  const d = t - t0 - dur;
  r.x = x1; r.y = y1; r.u = 1;
  r.sq = -0.3 * Math.exp(-d * 8) * Math.cos(d * 19);
  return r;
}

/* ---------- палитра: тёплая серебристая плёнка ---------- */
const INK = '#17140f';
const PAPER = '#f3efe4';
const BODY = '#221e1a';     // чёрная эмаль Жоржа
const T = ['#f3efe4', '#e2dccf', '#cdc6b7', '#b3ac9e', '#989184', '#7c766b', '#615c54', '#47433d', '#2e2b27', '#17140f'];
let LWF = 1;                // множитель толщины контура для текущего плана

/* ---------- примитивы ---------- */
function ell(ctx, x, y, rx, ry, rot = 0) {
  ctx.ellipse(x, y, Math.max(0.01, Math.abs(rx)), Math.max(0.01, Math.abs(ry)), rot, 0, TAU);
}
function circ(ctx, x, y, r) { ctx.arc(x, y, Math.max(0.01, Math.abs(r)), 0, TAU); }
function paint(ctx, fill, lw, stroke) {
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (lw > 0) { ctx.lineWidth = lw; ctx.strokeStyle = stroke || INK; ctx.lineJoin = 'round'; ctx.stroke(); }
}
function line(ctx, x1, y1, x2, y2, w, c) {
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
  ctx.lineWidth = w; ctx.strokeStyle = c || INK; ctx.lineCap = 'round'; ctx.stroke();
}
function rrect(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}

/** Кривая Катмулла — Рома через точки. */
function catmull(pts, sub = 6) {
  if (pts.length < 3) return pts.slice();
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let j = 0; j < sub; j++) {
      const u = j / sub, u2 = u * u, u3 = u2 * u;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * u + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * u2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * u3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * u + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * u2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * u3),
      ]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** Сужающийся мазок кисти: усы, ресницы, завитки пара. */
function taper(ctx, pts, w0, w1, fill = INK) {
  const P = catmull(pts, 6);
  const n = P.length;
  if (n < 2) return;
  const L = [], R = [];
  for (let i = 0; i < n; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    const w = lerp(w0, w1, i / (n - 1)) / 2;
    L.push([P[i][0] - dy * w, P[i][1] + dx * w]);
    R.push([P[i][0] + dy * w, P[i][1] - dx * w]);
  }
  ctx.beginPath(); ctx.moveTo(L[0][0], L[0][1]);
  for (let i = 1; i < n; i++) ctx.lineTo(L[i][0], L[i][1]);
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(R[i][0], R[i][1]);
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  ctx.beginPath(); circ(ctx, P[0][0], P[0][1], w0 / 2); ctx.fill();
  if (w1 > 0.6) { ctx.beginPath(); circ(ctx, P[n - 1][0], P[n - 1][1], w1 / 2); ctx.fill(); }
}

/** Путь из команд M/L/Q/C/Z, пропущенный через деформацию map(x, y) → [X, Y]. */
function tracePath(ctx, cmds, map) {
  for (let i = 0; i < cmds.length; i++) {
    const c = cmds[i];
    switch (c[0]) {
      case 'M': { const p = map(c[1], c[2]); ctx.moveTo(p[0], p[1]); break; }
      case 'L': { const p = map(c[1], c[2]); ctx.lineTo(p[0], p[1]); break; }
      case 'Q': { const a = map(c[1], c[2]), p = map(c[3], c[4]); ctx.quadraticCurveTo(a[0], a[1], p[0], p[1]); break; }
      case 'C': {
        const a = map(c[1], c[2]), b = map(c[3], c[4]), p = map(c[5], c[6]);
        ctx.bezierCurveTo(a[0], a[1], b[0], b[1], p[0], p[1]); break;
      }
      case 'Z': ctx.closePath(); break;
    }
  }
}

/** Локальная система координат вокруг точки (lx, ly) деформированного тела: лицо сжимается вместе с телом. */
function withFrame(ctx, map, lx, ly, fn) {
  const p = map(lx, ly), a = map(lx + 1, ly), b = map(lx, ly + 1);
  ctx.save();
  ctx.transform(a[0] - p[0], a[1] - p[1], b[0] - p[0], b[1] - p[1], p[0], p[1]);
  fn();
  ctx.restore();
}

/** Деформация персонажа: сжатие-растяжение с сохранением объёма, «резиновый» изгиб, дыхание, поворот. */
function rigMap(P, H) {
  const sy = Math.max(0.3, 1 + P.sq), sx = 1 / sy;
  const c = Math.cos(P.rot), sn = Math.sin(P.rot);
  const fl = P.flip || 1, turn = P.turn == null ? 1 : P.turn;
  const bx = P.x, by = P.y - P.s * P.hip;
  return (lx, ly) => {
    const v = clamp(-ly / H, -0.3, 1.5);
    const bul = 1 + (P.breath || 0) * 0.07 * Math.sin(Math.PI * clamp(v));
    const x1 = lx * fl * turn * sx * bul + (P.bend || 0) * v * v;
    const y1 = ly * sy;
    return [bx + P.s * (x1 * c - y1 * sn), by + P.s * (x1 * sn + y1 * c)];
  };
}

/* ---------- «резиновые» конечности ---------- */

/** В какую сторону выгибать шланг, чтобы «локоть» смотрел наружу и чуть вниз. */
function outBend(side, dx, dy, droop = 0.35) {
  const d = Math.hypot(dx, dy) || 1;
  const nx = -dy / d, ny = dx / d;
  return nx * side + ny * droop >= 0 ? 1 : -1;
}

/**
 * Рука или нога-шланг без локтя. Длина сохраняется: если конец ближе длины — шланг выгибается дугой,
 * если дальше — тянется и худеет. Возвращает угол касательной в конце (для перчатки или башмака).
 */
function hose(ctx, x0, y0, x1, y1, len, bend, w, ctrl) {
  const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy) || 1e-3;
  let h = 0, width = w;
  if (d < len) h = Math.sqrt((len * len - d * d) * 3 / 16);
  else { width = w * clamp(Math.pow(len / d, 0.35), 0.62, 1); h = Math.min(60, d * 0.07); }
  const k = h * 4 / 3, nx = (-dy / d) * bend, ny = (dx / d) * bend;
  let c1x = x0 + dx / 3 + nx * k, c1y = y0 + dy / 3 + ny * k;
  let c2x = x0 + dx * 2 / 3 + nx * k, c2y = y0 + dy * 2 / 3 + ny * k;
  if (ctrl) { c1x = ctrl[0]; c1y = ctrl[1]; c2x = ctrl[2]; c2y = ctrl[3]; }
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.bezierCurveTo(c1x, c1y, c2x, c2y, x1, y1);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = width; ctx.stroke();
  return Math.atan2(y1 - c2y, x1 - c2x);
}

/* Перчатки: ладонь, три пальца и большой, манжета-раструб, три строчки на тыльной стороне. */
const GLOVE = {
  open: { palm: [1.25, 0, 0.84, 0.8], f: [[-0.55, 1.5], [-0.03, 1.64], [0.5, 1.5]], th: [-1.4, 1.22] },
  wave: { palm: [1.25, 0, 0.84, 0.8], f: [[-0.8, 1.45], [-0.25, 1.62], [0.3, 1.52]], th: [-1.65, 1.2] },
  jazz: { palm: [1.2, 0, 0.84, 0.84], f: [[-0.85, 1.55], [0, 1.72], [0.85, 1.55]], th: [-1.8, 1.3] },
  fist: { fist: 1 },
  point: { fist: 1, idx: 1 },
  thumb: { fist: 1, up: 1 },
  pinch: { fist: 1, pinch: 1 },
  flat: { flat: 1 },
  cup: { cup: 1 },
};
function glove(ctx, x, y, ang, pose, s, side, lw) {
  const g = GLOVE[pose] || GLOVE.open;
  ctx.save();
  ctx.translate(x, y); ctx.rotate(ang); ctx.scale(s, s * side);
  const w = lw / s;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // манжета-раструб
  ctx.beginPath(); ctx.moveTo(-0.2, -0.4); ctx.lineTo(0.6, -0.72); ctx.lineTo(0.6, 0.72); ctx.lineTo(-0.2, 0.4); ctx.closePath();
  paint(ctx, PAPER, w);
  ctx.beginPath(); ell(ctx, 0.6, 0, 0.2, 0.75); paint(ctx, PAPER, w);
  // кисть: сначала общий контур всех частей, потом заливка — получается единый силуэт
  const caps = [], ells = [];
  if (g.fist) {
    ells.push([1.3, 0, 0.9, 0.86]);
    caps.push([1.95, -0.5, 1.95, -0.5, 0.34], [2.05, 0, 2.05, 0, 0.36], [1.95, 0.5, 1.95, 0.5, 0.34]);
    if (g.idx) caps.push([1.8, -0.45, 3.15, -0.5, 0.29]);
    if (g.up) caps.push([1.2, -0.7, 1.25, -1.9, 0.32]);
    else if (g.pinch) caps.push([1.45, -0.72, 2.25, -0.88, 0.27]);
    else caps.push([0.95, -0.72, 1.75, -0.86, 0.3]);
  } else if (g.flat) {
    ells.push([1.35, 0, 0.95, 0.72]);
    caps.push([1.5, 0, 2.55, 0, 0.62], [1.0, -0.45, 1.55, -1.25, 0.3]);
  } else if (g.cup) {
    ells.push([1.35, 0.05, 1.0, 0.58]);
    caps.push([2.1, 0.1, 2.6, -0.62, 0.36], [0.95, -0.35, 1.25, -1.0, 0.3]);
  } else {
    ells.push(g.palm);
    for (const f of g.f) caps.push([g.palm[0], g.palm[1], g.palm[0] + Math.cos(f[0]) * f[1], Math.sin(f[0]) * f[1], 0.31]);
    caps.push([g.palm[0] - 0.2, -0.2, g.palm[0] - 0.2 + Math.cos(g.th[0]) * g.th[1], -0.2 + Math.sin(g.th[0]) * g.th[1], 0.3]);
  }
  ctx.strokeStyle = INK; ctx.fillStyle = INK;
  for (const c of caps) { ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.lineTo(c[2] + 1e-3, c[3]); ctx.lineWidth = c[4] * 2 + w * 2; ctx.stroke(); }
  for (const e of ells) { ctx.beginPath(); ell(ctx, e[0], e[1], e[2], e[3]); ctx.lineWidth = w * 2; ctx.stroke(); }
  ctx.strokeStyle = PAPER; ctx.fillStyle = PAPER;
  for (const c of caps) { ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.lineTo(c[2] + 1e-3, c[3]); ctx.lineWidth = c[4] * 2; ctx.stroke(); }
  for (const e of ells) { ctx.beginPath(); ell(ctx, e[0], e[1], e[2], e[3]); ctx.fill(); }
  ctx.strokeStyle = INK; ctx.lineWidth = w * 0.8;
  if (g.fist) {
    for (const yy of [-0.25, 0.25]) { ctx.beginPath(); ctx.moveTo(1.8, yy); ctx.lineTo(2.25, yy); ctx.stroke(); }
  } else if (!g.flat && !g.cup) {
    for (const yy of [-0.3, 0, 0.3]) { ctx.beginPath(); ctx.moveTo(0.95, yy * 0.8); ctx.lineTo(1.5, yy); ctx.stroke(); }
  } else if (g.flat) {
    for (const yy of [-0.2, 0.2]) { ctx.beginPath(); ctx.moveTo(2.0, yy); ctx.lineTo(2.9, yy); ctx.stroke(); }
  }
  ctx.restore();
}

/** Башмак-«картошка»: щиколотка в (x, y), носок смотрит в сторону dir. */
function shoe(ctx, x, y, ang, s, dir, lw) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(ang); ctx.scale(s * dir, s);
  const w = lw / s;
  ctx.beginPath();
  ctx.moveTo(-0.55, -0.1);
  ctx.bezierCurveTo(-0.62, 0.35, -0.5, 0.62, -0.1, 0.62);
  ctx.lineTo(1.2, 0.62);
  ctx.bezierCurveTo(2.25, 0.62, 2.3, -0.4, 1.3, -0.44);
  ctx.bezierCurveTo(0.8, -0.47, 0.45, -0.3, 0.2, -0.32);
  ctx.bezierCurveTo(-0.1, -0.36, -0.5, -0.4, -0.55, -0.1);
  ctx.closePath();
  paint(ctx, INK, w, INK);
  ctx.beginPath(); ctx.moveTo(1.0, -0.24); ctx.quadraticCurveTo(1.65, -0.3, 1.9, 0.02);
  ctx.lineWidth = 0.14; ctx.strokeStyle = PAPER; ctx.lineCap = 'round'; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-0.05, 0.52); ctx.lineTo(1.35, 0.52); ctx.lineWidth = 0.08; ctx.strokeStyle = T[5]; ctx.stroke();
  ctx.restore();
}

/**
 * Глаз-«пирог»: белый овал, чёрный зрачок с вырезанным клином-бликом, веко.
 * o: open (0…1), lx/ly — взгляд, pupil — размер зрачка, mad/sad — наклон века,
 *    shut — как рисовать закрытый глаз: 'sleep' | 'happy' | 'tight'.
 */
function pieEye(ctx, x, y, rx, ry, o, lw, side, lidFill) {
  const open = o.open == null ? 1 : o.open;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (open < 0.12) {
    ctx.beginPath();
    if (o.shut === 'happy') { ctx.moveTo(x - rx * 0.85, y + ry * 0.15); ctx.quadraticCurveTo(x, y - ry * 0.55, x + rx * 0.85, y + ry * 0.15); }
    else if (o.shut === 'tight') {
      // зажмурился: «> <» — острия смотрят к переносице
      ctx.moveTo(x + rx * 0.8 * side, y - ry * 0.35); ctx.lineTo(x - rx * 0.55 * side, y + ry * 0.05); ctx.lineTo(x + rx * 0.8 * side, y + ry * 0.4);
    } else { ctx.moveTo(x - rx * 0.85, y + ry * 0.1); ctx.quadraticCurveTo(x, y + ry * 0.62, x + rx * 0.85, y + ry * 0.1); }
    ctx.lineWidth = lw * 1.15; ctx.strokeStyle = INK; ctx.stroke();
    return;
  }
  ctx.save();
  ctx.beginPath(); ell(ctx, x, y, rx, ry); ctx.fillStyle = PAPER; ctx.fill();
  ctx.clip();
  const pu = o.pupil == null ? 1 : o.pupil;
  const pw = rx * 0.5 * pu, ph = ry * 0.56 * pu;
  const px = x + (o.lx || 0) * (rx - pw) * 0.92, py = y + ry * 0.16 + (o.ly || 0) * (ry - ph) * 0.8;
  ctx.beginPath(); ell(ctx, px, py, pw, ph); ctx.fillStyle = INK; ctx.fill();
  ctx.beginPath();
  ctx.moveTo(px + pw * 0.12, py - ph * 0.1);
  ctx.lineTo(px + Math.cos(-1.25) * pw * 2.2, py + Math.sin(-1.25) * ph * 2.2);
  ctx.lineTo(px + Math.cos(-0.55) * pw * 2.2, py + Math.sin(-0.55) * ph * 2.2);
  ctx.closePath(); ctx.fillStyle = PAPER; ctx.fill();
  const mad = o.mad || 0, sad = o.sad || 0;
  if (open < 0.98 || mad > 0 || sad > 0) {
    const top = y - ry - 2;
    const lidY = y - ry + (1 - open) * ry * 2;
    const tilt = (mad - sad) * ry * 0.55 * side;
    ctx.beginPath();
    ctx.moveTo(x - rx - 2, top); ctx.lineTo(x + rx + 2, top);
    ctx.lineTo(x + rx + 2, lidY - tilt); ctx.lineTo(x - rx - 2, lidY + tilt); ctx.closePath();
    ctx.fillStyle = lidFill || T[1]; ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - rx - 2, lidY + tilt); ctx.lineTo(x + rx + 2, lidY - tilt);
    ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.stroke();
  }
  ctx.restore();
  ctx.beginPath(); ell(ctx, x, y, rx, ry); ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.stroke();
}

/** Рот: улыбка, открытая улыбка с языком, «О» (зевок, крик), трубочка (свист), грусть, волна (испуг). */
function mouthShape(ctx, m, w, lw) {
  const o = m.open || 0;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = INK;
  switch (m.type) {
    case 'smile': {
      const c = w * (0.28 + 0.14 * o);
      ctx.beginPath(); ctx.moveTo(-w / 2, -w * 0.06); ctx.quadraticCurveTo(0, c, w / 2, -w * 0.06);
      ctx.lineWidth = lw * 1.1; ctx.stroke();
      line(ctx, -w / 2 - w * 0.07, -w * 0.15, -w / 2 + w * 0.03, w * 0.02, lw * 0.8);
      line(ctx, w / 2 + w * 0.07, -w * 0.15, w / 2 - w * 0.03, w * 0.02, lw * 0.8);
      break;
    }
    case 'grin': {
      const d = w * (0.3 + 0.42 * o);
      ctx.beginPath(); ctx.moveTo(-w / 2, -w * 0.07); ctx.quadraticCurveTo(0, w * 0.12, w / 2, -w * 0.07);
      ctx.quadraticCurveTo(w * 0.42, d, 0, d); ctx.quadraticCurveTo(-w * 0.42, d, -w / 2, -w * 0.07); ctx.closePath();
      paint(ctx, INK, lw);
      ctx.save(); ctx.clip();
      ctx.beginPath(); ell(ctx, 0, d * 0.98, w * 0.24, d * 0.42); ctx.fillStyle = T[4]; ctx.fill();
      ctx.restore();
      break;
    }
    case 'O': {
      const rx = w * (0.18 + 0.12 * o), ry = w * (0.16 + 0.36 * o);
      // белая «губа»: широко открытый рот выходит за маску на чёрную эмаль и не должен с ней сливаться
      ctx.beginPath(); ell(ctx, 0, ry * 0.55, rx, ry);
      ctx.lineWidth = lw * 3.4; ctx.strokeStyle = PAPER; ctx.stroke();
      paint(ctx, INK, lw);
      ctx.save(); ctx.beginPath(); ell(ctx, 0, ry * 0.55, rx, ry); ctx.clip();
      ctx.beginPath(); ell(ctx, 0, ry * 1.35, rx * 0.72, ry * 0.52); ctx.fillStyle = T[4]; ctx.fill();
      ctx.restore();
      break;
    }
    case 'o': {
      ctx.beginPath(); ell(ctx, 0, w * 0.06, w * 0.16, w * 0.17); paint(ctx, PAPER, lw * 1.1);
      ctx.beginPath(); ell(ctx, 0, w * 0.07, w * 0.07, w * 0.08); ctx.fillStyle = INK; ctx.fill();
      break;
    }
    case 'frown': {
      ctx.beginPath(); ctx.moveTo(-w * 0.34, w * 0.16); ctx.quadraticCurveTo(0, -w * 0.16, w * 0.34, w * 0.16);
      ctx.lineWidth = lw * 1.1; ctx.stroke();
      break;
    }
    case 'wavy': {
      ctx.beginPath(); ctx.moveTo(-w * 0.38, 0);
      for (let i = 1; i <= 6; i++) ctx.lineTo(-w * 0.38 + i * w * 0.127, (i % 2 ? -1 : 1) * w * 0.07);
      ctx.lineWidth = lw; ctx.stroke();
      break;
    }
    default: {
      line(ctx, -w * 0.3, 0, w * 0.3, 0, lw);
    }
  }
}

/** Тень под персонажем: чем выше прыжок, тем меньше и бледнее. */
function shadowAt(ctx, x, gy, rx, yNow) {
  const h = Math.max(0, gy - yNow);
  const k = 1 / (1 + h / 140);
  ctx.beginPath(); ell(ctx, x, gy + 2, rx * k, rx * 0.15 * k);
  ctx.fillStyle = `rgba(23,20,15,${0.3 * k})`; ctx.fill();
}

/* ---------- мелкие мультипликационные эффекты ---------- */

/** Облачко пара: белые кружки с серым контуром, растут и тают. */
function puff(ctx, x, y, r, a, seed) {
  if (a <= 0.01 || r <= 0.5) return;
  ctx.save(); ctx.globalAlpha = clamp(a);
  const n = 4;
  ctx.fillStyle = PAPER; ctx.strokeStyle = T[5]; ctx.lineWidth = 2 * LWF;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const an = (i / n) * TAU + hash2(seed, i) * 0.8;
    pts.push([x + Math.cos(an) * r * 0.55, y + Math.sin(an) * r * 0.4, r * (0.5 + hash2(seed, i + 9) * 0.25)]);
  }
  for (const p of pts) { ctx.beginPath(); circ(ctx, p[0], p[1], p[2]); ctx.stroke(); }
  for (const p of pts) { ctx.beginPath(); circ(ctx, p[0], p[1], p[2]); ctx.fill(); }
  ctx.restore();
}

/** Нотка, вылетающая при свисте. */
function noteGlyph(ctx, x, y, s, a, rot) {
  ctx.save(); ctx.globalAlpha = clamp(a); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
  ctx.fillStyle = INK; ctx.strokeStyle = INK; ctx.lineWidth = 1.6;
  ctx.beginPath(); ell(ctx, 0, 0, 5, 3.6, -0.4); ctx.fill();
  ctx.beginPath(); ctx.moveTo(4.4, -1.5); ctx.lineTo(4.4, -18); ctx.quadraticCurveTo(9, -14, 10, -9); ctx.stroke();
  ctx.restore();
}

/** Звёздочка (кружится над головой после удара). */
function starGlyph(ctx, x, y, r, rot, a) {
  ctx.save(); ctx.globalAlpha = clamp(a); ctx.translate(x, y); ctx.rotate(rot);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const rr = i % 2 ? r * 0.42 : r; const an = (i / 10) * TAU - Math.PI / 2; ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr); }
  ctx.closePath(); paint(ctx, PAPER, 1.8 * LWF);
  ctx.restore();
}

/** Сердечко. */
function heartPath(ctx, x, y, s) {
  ctx.moveTo(x, y + s * 0.9);
  ctx.bezierCurveTo(x - s * 1.4, y + s * 0.05, x - s * 0.9, y - s * 1.0, x, y - s * 0.35);
  ctx.bezierCurveTo(x + s * 0.9, y - s * 1.0, x + s * 1.4, y + s * 0.05, x, y + s * 0.9);
  ctx.closePath();
}

/** Линии «испуга» вокруг головы. */
function takeLines(ctx, x, y, r0, r1, a, n = 10, seed = 1) {
  ctx.save(); ctx.globalAlpha = clamp(a);
  for (let i = 0; i < n; i++) {
    const an = (i / n) * TAU + hash2(seed, i) * 0.3;
    const q = 0.85 + hash2(seed, i + 20) * 0.3;
    line(ctx, x + Math.cos(an) * r0, y + Math.sin(an) * r0, x + Math.cos(an) * r1 * q, y + Math.sin(an) * r1 * q, 2.6 * LWF);
  }
  ctx.restore();
}

/** Линии скорости за движущимся телом. */
function speedLines(ctx, x, y, dx, dy, len, spread, a, n = 4, seed = 3) {
  const d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, nx = -uy, ny = ux;
  ctx.save(); ctx.globalAlpha = clamp(a);
  for (let i = 0; i < n; i++) {
    const o = (i / (n - 1) - 0.5) * spread + (hash2(seed, i) - 0.5) * spread * 0.2;
    const l = len * (0.6 + hash2(seed, i + 7) * 0.5);
    const sx = x + nx * o - ux * len * 0.15, sy = y + ny * o - uy * len * 0.15;
    line(ctx, sx, sy, sx - ux * l, sy - uy * l, 2.2 * LWF, T[6]);
  }
  ctx.restore();
}

/* =====================================================================
   Плёнка: зерно, царапины, пыль, волоски, мерцание, дрожание, виньетка
   ===================================================================== */
const Film = {
  tiles: [], pats: null, vig: null, vigKey: '',
  init() {
    for (let k = 0; k < 4; k++) {
      const [c, g] = makeCanvas(256, 256);
      const img = g.createImageData(256, 256), d = img.data;
      let s = (1234 + k * 999) >>> 0;
      const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
      // зерно с прозрачностью: светлые и тёмные крупинки поверх кадра обычным наложением (дёшево для любого GPU)
      for (let i = 0; i < d.length; i += 4) {
        const v = ((rnd() + rnd() + rnd()) / 3 - 0.5) * 2;
        const c = v > 0 ? 250 : 12;
        d[i] = d[i + 1] = d[i + 2] = c;
        d[i + 3] = clamp(Math.abs(v) * 255 * 1.25, 0, 255);
      }
      g.putImageData(img, 0, 0);
      this.tiles.push(c);
    }
  },
  /** Дрожание кадра в фильмовом окне: сдвиг в пикселях экрана. */
  weave(frame, H) {
    const u = H / 1080;
    let wx = noise1(frame * 0.21, 3) * 1.4 + (hash2(frame, 5) - 0.5) * 0.9;
    let wy = noise1(frame * 0.17, 4) * 1.8 + (hash2(frame, 6) - 0.5) * 1.1;
    if (hash2(Math.floor(frame / 3), 77) > 0.985) wy += 5;          // редкий «скачок» на склейке
    return [wx * u, wy * u];
  },
  vignette(W, H) {
    const key = W + 'x' + H;
    if (this.vig && this.vigKey === key) return this.vig;
    const [c, g] = makeCanvas(W, H);
    const r = Math.hypot(W, H) / 2;
    const gr = g.createRadialGradient(W / 2, H * 0.46, r * 0.3, W / 2, H / 2, r * 1.02);
    gr.addColorStop(0, 'rgba(14,12,10,0)');
    gr.addColorStop(0.55, 'rgba(14,12,10,0.12)');
    gr.addColorStop(0.85, 'rgba(14,12,10,0.42)');
    gr.addColorStop(1, 'rgba(14,12,10,0.8)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    // окно кадровой рамки: скруглённые углы и растушёванный край
    const m = Math.round(H * 0.006), rad = H * 0.055;
    g.save();
    g.beginPath(); g.rect(-W, -H, W * 3, H * 3);
    rrect(g, m, m, W - 2 * m, H - 2 * m, rad);
    g.shadowColor = '#0e0c0a'; g.shadowBlur = H * 0.025;
    g.fillStyle = '#0e0c0a'; g.fill('evenodd');
    g.restore();
    this.vig = c; this.vigKey = key;
    return c;
  },
  apply(ctx, W, H, frame, t) {
    const u = H / 1080;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // мерцание экспозиции: плотность копии «дышит» от кадра к кадру
    const fl = (hash2(frame, 1) - 0.5) * 0.07 + Math.sin(t * 1.7) * 0.012 + (hash2(frame, 2) > 0.975 ? 0.07 : 0);
    ctx.fillStyle = fl > 0 ? `rgba(14,12,10,${fl.toFixed(3)})` : `rgba(252,246,232,${(-fl * 0.8).toFixed(3)})`;
    ctx.fillRect(0, 0, W, H);
    // зерно
    if (!ctx.__grain) ctx.__grain = this.tiles.map((c) => ctx.createPattern(c, 'repeat'));
    const pat = ctx.__grain[frame % 4];
    const sc = 1.5 * u;
    if (pat.setTransform) pat.setTransform(new DOMMatrix([sc, 0, 0, sc, hash2(frame, 8) * 256 * sc, hash2(frame, 9) * 256 * sc]));
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = pat; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    // царапины: живут по нескольку кадров и медленно дрейфуют, как на настоящей копии
    ctx.lineCap = 'round';
    for (let k = 0; k < 4; k++) {
      const life = 16 + Math.floor(hash2(k, 11) * 44);
      const f = frame + k * 53;
      const ep = Math.floor(f / life), age = f % life;
      const sd = k * 7919 + ep * 31;
      if (hash(sd) < 0.5) continue;
      const x = (hash(sd + 1) * 0.9 + 0.05) * W + (hash(sd + 2) - 0.5) * age * 0.8 * u + (hash2(f, 3) - 0.5) * 1.5 * u;
      const bright = hash(sd + 3) < 0.7;
      const y0 = hash(sd + 4) < 0.5 ? 0 : hash(sd + 5) * H * 0.6;
      const y1 = y0 + H * (0.3 + hash(sd + 6) * 0.9);
      ctx.strokeStyle = bright ? `rgba(245,240,228,${(0.14 + hash(sd + 7) * 0.22).toFixed(3)})` : `rgba(15,12,9,${(0.18 + hash(sd + 7) * 0.25).toFixed(3)})`;
      ctx.lineWidth = (0.8 + hash(sd + 8) * 1.3) * u * 1.3;
      ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x + (hash(sd + 9) - 0.5) * 6 * u, y1); ctx.stroke();
    }
    // пыль: одна пылинка живёт один кадр
    const nd = Math.floor(hash2(frame, 13) * 5);
    for (let i = 0; i < nd; i++) {
      const sd = frame * 101 + i * 7;
      const x = hash(sd) * W, y = hash(sd + 1) * H, r = (0.8 + hash(sd + 2) ** 3 * 4) * u * 1.4;
      ctx.fillStyle = hash(sd + 3) < 0.75 ? `rgba(15,12,9,${(0.45 + hash(sd + 4) * 0.4).toFixed(3)})` : `rgba(245,240,228,${(0.35 + hash(sd + 4) * 0.4).toFixed(3)})`;
      ctx.beginPath(); ell(ctx, x, y, r, r * (0.6 + hash(sd + 5) * 0.8), hash(sd + 6) * 3); ctx.fill();
    }
    // волосок в кадровом окне — изредка
    if (hash2(frame, 17) > 0.955) {
      const sd = frame * 7 + 1;
      const x = hash(sd) * W, y = hash(sd + 1) * H, L = (30 + hash(sd + 2) * 60) * u;
      ctx.beginPath(); ctx.moveTo(x, y);
      ctx.bezierCurveTo(x + L * 0.6, y - L * 0.5, x + L * 0.2, y + L * 0.8, x + L, y + L * 0.3);
      ctx.strokeStyle = 'rgba(15,12,9,0.55)'; ctx.lineWidth = 1.2 * u; ctx.stroke();
    }
    ctx.drawImage(this.vignette(W, H), 0, 0);
    ctx.restore();
  },
};

/** Диафрагма: чёрное поле с круглым окном (экранные пиксели). */
function iris(ctx, W, H, cx, cy, r) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.beginPath(); ctx.rect(0, 0, W, H);
  if (r > 0.5) { ctx.moveTo(cx + r, cy); ctx.arc(cx, cy, r, 0, TAU); }
  ctx.fillStyle = '#0e0c0a';
  ctx.fill('evenodd');
  ctx.restore();
}
