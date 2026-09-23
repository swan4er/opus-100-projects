'use strict';
/* ==========================================================================
   Палехский набор: палитра, горки-лещадки, деревья, терем, небо, вода,
   камень на распутье, орнаментальная рамка. Всё строится в Pic один раз.
   ========================================================================== */

/* Палитра: чёрный лак, золото, киноварь, изумруд; охра, лазурь и белила — редкие акценты */
const C = {
  lac: '#0a0706', lac2: '#130d0a',
  gold: '#d9a947', goldHi: '#f7e0a0', goldLo: '#8f6424',
  cin: '#c8321b', cinHi: '#e8603a', cinLo: '#7a1b0f',
  em: '#1c744c', emHi: '#46a672', emLo: '#0e3a27', emDeep: '#0a2a1c',
  och: '#c1843a', ochHi: '#e8bb72', ochLo: '#6e4520',
  lap: '#284b94', lapHi: '#5b83c9', lapLo: '#142650',
  wht: '#f0e4c8', whtLo: '#cbb893',
  umb: '#4a2d1b', umbLo: '#26170d',
  skin: '#dfae7f', skinHi: '#f6d8ae', skinLo: '#9b6a45',
  wolf: '#6b7988', wolfHi: '#c9d2da', wolfLo: '#323c48',
  rose: '#d9837a',
};

const TONES = {
  ochre: ['#2e1b0e', '#4f3219', '#76501f', '#a0722f', '#cc9b50'],
  olive: ['#161d0e', '#253214', '#3d5220', '#5f762e', '#8c9c46'],
  green: ['#08201a', '#0f3527', '#1a5238', '#2b744d', '#4a9866'],
  far: ['#0e1017', '#161c28', '#222c3d', '#334158', '#4c5f7a'],
  dusk: ['#1f1112', '#3a1d1b', '#5a2d25', '#824634', '#ae6a48'],
  stone: ['#1d1a18', '#34302b', '#4f4940', '#716756', '#9b8d72'],
};

/* ---------- горка-лещадка ---------- */
/* Вертикальный градиент в мировых координатах (создаётся один раз при первой отрисовке) */
function vgrad(y0, y1, stops) {
  let g = null;
  return (P) => {
    if (!g) { g = P.ctx.createLinearGradient(0, y0, 0, y1); for (const [o, c] of stops) g.addColorStop(o, c); }
    return g;
  };
}
/* Холм: плавь темперы от светлой вершины к тёмному низу, лещадка-подсветка,
   белильная кромка и частая золотая штриховка по освещённому склону */
function hill(pic, x0, x1, base, h, o = {}) {
  const tones = o.tones || TONES.ochre;
  const peak = o.peak ?? 0.45, flat = o.flat ?? 0.62, seed = o.seed ?? 1;
  const N = 40;
  const warp = (u) => (u < peak ? 0.5 * u / peak : 0.5 + 0.5 * (u - peak) / (1 - peak));
  const f = (u) => Math.pow(Math.sin(PI * warp(clamp(u))), flat) * (1 + 0.05 * vnoise(u * 4 + seed * 3.1));
  const top = (u) => [lerp(x0, x1, u), base - h * f(u)];
  const body = [];
  for (let i = 0; i <= N; i++) body.push(top(i / N));
  const bot = base + (o.below ?? 260);
  const pts = [...body, [x1, bot], [x0, bot]];
  const pl = new Float32Array(pts.length * 2);
  pts.forEach((p, i) => { pl[2 * i] = p[0]; pl[2 * i + 1] = p[1]; });
  const ty = base - h;
  pic.fill(polyPath(pl), vgrad(ty - 4, base + 30, [[0, tones[4]], [0.22, tones[3]], [0.55, tones[2]], [0.85, tones[1]], [1, tones[0]]]),
    { cx: (x0 + x1) / 2, cy: base - h * 0.5 });
  // лещадка: светлый язык по левому склону
  const lower = [];
  const a = 0.06, dep = h * (o.leq ?? 0.42);
  for (let i = N; i >= 0; i--) {
    const u = i / N, p = top(u);
    const e = Math.pow(Math.sin(PI * clamp((u - a) / (0.82 - a))), 0.7);
    lower.push([p[0] + e * h * 0.05, p[1] + dep * e]);
  }
  const lp = [...body, ...lower];
  pic.shape(lp, tones[4], { a: 0.32, seg: 2 });
  // терраски-лещадки: тонкие светлые контуры на освещённом склоне
  const terr = o.terr ?? 3;
  for (let j = 1; j <= terr; j++) {
    const d = h * (0.1 + 0.12 * j);
    const u0 = 0.06 + 0.05 * j, u1 = 0.5 + 0.06 * j;
    const pts2 = [];
    for (let i = 0; i <= 18; i++) {
      const u = lerp(u0, u1, i / 18), p = top(u);
      const e = Math.sin(PI * (i / 18));
      pts2.push([p[0] + h * 0.03 * j, p[1] + d * (0.55 + 0.45 * e)]);
    }
    pic.line(pts2, 1.2, o.terrCol || 'rgba(255,236,200,0.26)', { prof: Prof.hair, seg: 2 });
  }
  // штриховка «гребёнкой»: короткие дуги вдоль склона
  const Rh = rng(seed * 977 + 13);
  const nComb = o.comb ?? Math.round(((x1 - x0) * h) / 900);
  for (let i = 0; i < nComb; i++) {
    const u = 0.04 + 0.92 * Rh();
    const p = top(u), q = top(u + 0.01);
    const depth = Math.pow(Rh(), 0.9) * Math.min(h * 1.05, base + 20 - p[1]);
    const y = p[1] + 7 + depth;
    let tx = q[0] - p[0], ty = q[1] - p[1];
    const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    const k = clamp(depth / (h * 0.9));
    tx = lerp(tx, 1, k * 0.8); ty = lerp(ty, 0, k * 0.8);
    const l2 = Math.hypot(tx, ty) || 1; tx /= l2; ty /= l2;
    const len = 10 + 20 * Rh();
    const lit = u < 0.62 && depth < h * 0.35;
    pic.line([[p[0] - tx * len / 2, y - ty * len / 2], [p[0], y + 1.2], [p[0] + tx * len / 2, y + ty * len / 2]], lit ? 1 : 1.1,
      lit ? 'gold' : (o.combCol || 'rgba(255,230,190,0.16)'), { prof: Prof.hair, seg: 3 });
  }
  // белильная кромка по верху
  const edge = [];
  for (let i = 1; i <= Math.floor(N * 0.72); i++) edge.push(top(i / N));
  pic.line(edge, o.edgeW ?? 1.8, o.edge || 'rgba(255,238,200,0.5)', { prof: Prof.hair, seg: 2 });
  // золотая штриховка параллельно кромке
  const gl = o.gold ?? 8;
  for (let g = 0; g < gl; g++) {
    const off = 3.5 + g * (o.gap ?? 3.6);
    const u0 = 0.03 + g * 0.03, u1 = 0.7 - g * 0.05;
    if (u1 <= u0 + 0.04) break;
    const line = [];
    for (let i = 0; i <= 18; i++) {
      const u = lerp(u0, u1, i / 18), p = top(u), q = top(u + 0.004);
      let nx = -(q[1] - p[1]), ny = q[0] - p[0];
      const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
      if (ny < 0) { nx = -nx; ny = -ny; }
      line.push([p[0] + nx * off, p[1] + ny * off]);
    }
    pic.line(line, Math.max(0.75, 1.4 - g * 0.08), 'gold', { prof: Prof.hair, seg: 2 });
  }
  return { top, x0, x1, base, h };
}

/* ---------- травка: пучок тонких стебельков с цветком ---------- */
function grass(pic, x, y, s, o = {}) {
  const R = o.R || rng(Math.floor(x * 13 + y * 7));
  const n = o.n ?? 5;
  for (let i = 0; i < n; i++) {
    const a = lerp(-0.9, 0.9, n === 1 ? 0.5 : i / (n - 1)) + (R() - 0.5) * 0.3;
    const len = s * (0.6 + 0.5 * R()) * (1 - Math.abs(a) * 0.3);
    const ex = x + Math.sin(a) * len, ey = y - Math.cos(a) * len;
    const mx = x + Math.sin(a * 0.4) * len * 0.5, my = y - Math.cos(a * 0.4) * len * 0.55;
    pic.line([[x, y], [mx, my], [ex, ey]], 1.4, o.col || 'gold', { prof: Prof.hair });
    if (o.flowers !== false && R() < 0.45) pic.dot(ex, ey, 1.6 + R() * 1.2, R() < 0.5 ? C.cinHi : C.wht);
  }
}

/* ---------- деревце с кудрявой кроной ---------- */
function treeRound(pic, x, base, h, o = {}) {
  const R = o.R || rng(Math.floor(x * 31 + h));
  const lean = (o.lean ?? (R() - 0.5) * 0.2) * h;
  const tx = x + lean, ty = base - h * 0.52;
  const trunk = o.trunk || C.umb;
  // ствол — тонкий, с изгибом
  pic.line([[x, base], [x + lean * 0.2 + h * 0.012, base - h * 0.2], [x + lean * 0.7 - h * 0.01, base - h * 0.4], [tx, ty]], h * 0.036, trunk, { prof: (u) => 1 - 0.5 * u });
  pic.line([[x - h * 0.006, base - 4], [x + lean * 0.2 + h * 0.004, base - h * 0.2], [x + lean * 0.7 - h * 0.018, base - h * 0.4], [tx - 3, ty + 4]], 1.1, 'gold', { prof: Prof.hair });
  const cx = tx, cy = base - h * 0.74, rx = h * (o.rx ?? 0.3), ry = h * (o.ry ?? 0.26);
  // тёмная масса кроны
  const mass = [];
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * TAU, wob = 1 + 0.1 * Math.sin(a * 5 + x) + 0.06 * Math.sin(a * 9);
    mass.push([cx + Math.cos(a) * rx * wob * 0.86, cy + Math.sin(a) * ry * wob * 0.86]);
  }
  const tones = o.leaf || [C.emDeep, C.emLo, C.em, C.emHi];
  pic.shape(mass, tones[0]);
  // ветви
  const n = o.n ?? 16;
  const cl = [];
  for (let i = 0; i < n; i++) {
    const a = i * 2.39996 + R() * 0.4, r = Math.sqrt((i + 0.6) / n);
    cl.push([cx + Math.cos(a) * rx * r * 0.82, cy + Math.sin(a) * ry * r * 0.8]);
  }
  cl.sort((p, q) => p[1] - q[1]);
  for (const [px, py] of cl.filter((_, i) => i % 3 === 0)) pic.line([[tx, ty], [lerp(tx, px, 0.45), lerp(ty, py, 0.65)], [px, py]], h * 0.009, trunk, { prof: Prof.tail });
  // гроздья: дальние темнее, ближние светлее
  cl.forEach(([px, py], i) => {
    const k = i / n;
    const ang = Math.atan2(py - cy, (px - cx) * 0.8) + PI / 2 + (R() - 0.5) * 0.5;
    const tn = k < 0.35 ? [tones[0], tones[1], tones[1], tones[2]] : [tones[0], tones[1], tones[2], tones[3]];
    leafFan(pic, px, py, h * (o.leafR ?? 0.085) * (0.85 + 0.35 * R()), ang, tn, R);
  });
  return { cx, cy, rx, ry, top: base - h };
}
/* веер листвы: гребешок, светлая сердцевина, золотые прожилки и кромка */
function leafFan(pic, x, y, r, ang, tones, R) {
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const P = (u, v) => [x + ca * u - sa * v, y + sa * u + ca * v];
  const outline = [];
  const lobes = 4;
  for (let i = 0; i <= 32; i++) {
    const a = PI + (i / 32) * PI;
    const lobe = 1 + 0.12 * Math.abs(Math.sin((i / 32) * PI * lobes));
    outline.push(P(Math.cos(a) * r * lobe, Math.sin(a) * r * 0.95 * lobe));
  }
  outline.push(P(r * 0.25, r * 0.2), P(-r * 0.25, r * 0.2));
  pic.shape(outline, tones[1]);
  const in1 = [];
  for (let i = 0; i <= 20; i++) { const a = PI * 1.08 + (i / 20) * PI * 0.84; in1.push(P(Math.cos(a) * r * 0.66, Math.sin(a) * r * 0.62)); }
  in1.push(P(0, r * 0.06));
  pic.shape(in1, tones[2], { a: 0.95 });
  const nv = 4;
  for (let i = 0; i < nv; i++) {
    const a = PI + ((i + 0.5) / nv) * PI;
    pic.line([P(0, r * 0.1), P(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5), P(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.88)], 0.9, 'gold', { prof: Prof.hair });
  }
  const edge = [];
  for (let i = 0; i <= 32; i++) {
    const a = PI + (i / 32) * PI;
    const lobe = 1 + 0.12 * Math.abs(Math.sin((i / 32) * PI * lobes));
    edge.push(P(Math.cos(a) * r * lobe * 0.97, Math.sin(a) * r * 0.92 * lobe));
  }
  pic.line(edge, 1, 'gold', { prof: Prof.hair, seg: 2 });
  void tones[3];
}

/* ---------- куст с цветами ---------- */
function bush(pic, x, base, s, o = {}) {
  const R = o.R || rng(Math.floor(x * 7 + s));
  const tones = o.leaf || [C.emDeep, C.emLo, C.em, C.emHi];
  const n = o.n ?? 7;
  const mass = [];
  for (let i = 0; i <= 20; i++) { const a = PI + (i / 20) * PI; mass.push([x + Math.cos(a) * s, base + Math.sin(a) * s * 0.62]); }
  pic.shape(mass, tones[0]);
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n, a = PI + u * PI;
    const px = x + Math.cos(a) * s * 0.62, py = base + Math.sin(a) * s * 0.42;
    leafFan(pic, px, py, s * (0.3 + 0.12 * R()), a + PI / 2 + (R() - 0.5) * 0.3, tones, R);
  }
  if (o.flowers !== false) for (let i = 0; i < 5; i++) {
    const a = PI + (0.15 + 0.7 * R()) * PI, r = s * (0.55 + 0.35 * R());
    flower(pic, x + Math.cos(a) * r * 0.9, base + Math.sin(a) * r * 0.6, s * 0.16, R() < 0.6 ? C.cinHi : C.wht);
  }
}
/* палехский цветок: пять лепестков-капель, золотой ободок, точка в серёдке */
function flower(pic, x, y, r, col) {
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU - PI / 2;
    pic.line([[x + Math.cos(a) * r * 0.15, y + Math.sin(a) * r * 0.15], [x + Math.cos(a) * r, y + Math.sin(a) * r]], r * 0.75, col, { prof: Prof.drop, seg: 3 });
  }
  pic.dot(x, y, r * 0.28, 'gold');
}
/* тюльпан на тонком стебле с двумя листьями */
function tulip(pic, x, base, h, col, R) {
  const bend = (R() - 0.5) * h * 0.25;
  const tx = x + bend, ty = base - h;
  pic.line([[x, base], [x + bend * 0.3, base - h * 0.5], [tx, ty]], 1.6, C.emHi, { prof: Prof.even });
  pic.line([[x, base - 2], [x - h * 0.22, base - h * 0.3], [x - h * 0.3, base - h * 0.55]], h * 0.1, C.em, { prof: Prof.leaf });
  pic.line([[x, base - 2], [x + h * 0.2, base - h * 0.22], [x + h * 0.26, base - h * 0.44]], h * 0.09, C.emLo, { prof: Prof.leaf });
  const r = h * 0.16;
  pic.shape([[tx - r, ty - r * 0.2], [tx - r * 0.9, ty - r * 1.3], [tx - r * 0.35, ty - r * 0.8], [tx, ty - r * 1.6], [tx + r * 0.35, ty - r * 0.8], [tx + r * 0.9, ty - r * 1.3], [tx + r, ty - r * 0.2], [tx, ty + r * 0.35]], col, { seg: 4 });
  pic.line([[tx - r * 0.9, ty - r * 1.2], [tx - r * 0.8, ty - r * 0.1], [tx, ty + r * 0.3], [tx + r * 0.8, ty - r * 0.1], [tx + r * 0.9, ty - r * 1.2]], 0.9, 'gold', { prof: Prof.hair });
  pic.line([[tx, ty + r * 0.2], [tx, ty - r * 1.4]], 0.9, 'gold', { prof: Prof.hair });
}

/* ---------- ель: ярусы поникших лап ---------- */
function treeFir(pic, x, base, h, o = {}) {
  const R = o.R || rng(Math.floor(x * 17 + h * 3));
  const N = o.layers ?? 9;
  const tones = o.tones || [C.emDeep, C.emLo, C.em];
  pic.line([[x, base], [x, base - h]], Math.max(2, h * 0.018), C.umb, { prof: (u) => 1 - 0.7 * u });
  for (let i = 0; i < N; i++) {
    const v = i / N;
    const y = base - h * (0.1 + 0.86 * v);
    const w = h * 0.2 * Math.pow(1 - v, 0.85) + h * 0.03;
    const d = w * (0.42 + 0.1 * R());
    const lean = (R() - 0.5) * w * 0.12;
    const L = [[x, y - h * 0.05], [x - w * 0.55 + lean, y + d * 0.35], [x - w + lean, y + d], [x - w * 0.5, y + d * 0.72], [x, y + d * 0.55]];
    const Rr = [[x, y + d * 0.55], [x + w * 0.5, y + d * 0.72], [x + w + lean, y + d], [x + w * 0.55 + lean, y + d * 0.35], [x, y - h * 0.05]];
    pic.shape([...L, ...Rr.slice(1, -1)], tones[i % 2 ? 0 : 1]);
    pic.line([[x - 1, y - h * 0.04], [x - w * 0.55 + lean, y + d * 0.38], [x - w + lean, y + d]], 1.2, o.edge || C.emHi, { prof: Prof.hair });
    pic.line([[x + 1, y - h * 0.04], [x + w * 0.55 + lean, y + d * 0.38], [x + w + lean, y + d]], 1.2, 'gold', { prof: Prof.hair });
  }
}

/* ---------- терем ---------- */
function archWin(pic, x, y, w, h, lit) { // окно с полукруглым верхом (x — центр, y — низ)
  const r = w / 2;
  const P = [[x - r, y], [x - r, y - h + r]];
  for (let i = 1; i < 10; i++) { const a = PI + (i / 10) * PI; P.push([x + Math.cos(a) * r, y - h + r + Math.sin(a) * r]); }
  P.push([x + r, y - h + r], [x + r, y]);
  const op = pic.shape(P, lit ? '#2a160b' : '#140c08', { seg: 3 });
  op.win = true;
  pic.line([...P, [x - r, y]], 1.2, 'gold', { prof: Prof.even, seg: 3 });
  return op;
}
function wall(pic, x, y, w, h, o = {}) { // x — левый край, y — низ
  const P = [[x, y], [x, y - h], [x + w, y - h], [x + w, y]];
  const p = new Path2D(); p.rect(x, y - h, w, h);
  pic.fill(p, o.col || vgrad(y - h, y, [[0, '#efdcb2'], [0.6, '#dcc190'], [1, '#b99a68']]), { cx: x + w / 2, cy: y - h / 2 });
  // тень справа — объём
  const s = new Path2D(); s.rect(x + w * 0.72, y - h, w * 0.28, h);
  pic.fill(s, 'rgba(120,80,40,0.28)', { cx: x + w / 2, cy: y - h / 2 });
  pic.line([[x, y], [x, y - h], [x + w, y - h], [x + w, y]], 1, 'rgba(60,35,20,0.7)', { prof: Prof.even, seg: 2 });
  // карниз
  const k = new Path2D(); k.rect(x - 3, y - h - 4, w + 6, 6);
  pic.fill(k, o.band || C.cin, { cx: x + w / 2, cy: y - h });
  pic.line([[x - 3, y - h + 2], [x + w + 3, y - h + 2]], 1, 'gold', { prof: Prof.even, seg: 2 });
  // поясок из золотых арочек под карнизом
  const na = Math.max(2, Math.round(w / 9));
  for (let i = 0; i < na; i++) {
    const ax = x + (i + 0.5) * (w / na), aw = w / na * 0.42;
    pic.line([[ax - aw, y - h + 10], [ax - aw * 0.7, y - h + 5], [ax, y - h + 3.5], [ax + aw * 0.7, y - h + 5], [ax + aw, y - h + 10]], 0.9, 'gold', { prof: Prof.hair, seg: 2 });
  }
  // цоколь
  const b2 = new Path2D(); b2.rect(x - 1, y - 7, w + 2, 7);
  pic.fill(b2, '#8e3a22', { cx: x + w / 2, cy: y });
  return P;
}
function tentRoof(pic, cx, y, w, h, col) { // шатёр
  const P = [[cx - w / 2 - 3, y], [cx - w * 0.3, y - h * 0.35], [cx - w * 0.08, y - h * 0.8], [cx, y - h], [cx + w * 0.08, y - h * 0.8], [cx + w * 0.3, y - h * 0.35], [cx + w / 2 + 3, y]];
  pic.shape(P, col || C.em, { seg: 5, rule: 'nonzero' });
  for (let i = 1; i < 6; i++) {
    const u = i / 6;
    pic.line([[lerp(cx - w / 2, cx + w / 2, u), y - 1], [lerp(cx - w * 0.2, cx + w * 0.2, u), y - h * 0.5], [cx, y - h + 2]], 1, 'gold', { prof: Prof.hair });
  }
  // чешуя
  for (let r = 1; r < 4; r++) {
    const yy = y - h * r * 0.2, ww = w * (1 - r * 0.2) * 0.5;
    pic.line([[cx - ww, yy], [cx, yy - 3], [cx + ww, yy]], 1, 'rgba(255,230,170,0.45)', { prof: Prof.hair });
  }
  return [cx, y - h];
}
function barrelRoof(pic, cx, y, w, h, col) { // бочка — килевидная кровля
  const P = [[cx - w / 2, y], [cx - w * 0.56, y - h * 0.45], [cx - w * 0.3, y - h * 0.82], [cx, y - h], [cx + w * 0.3, y - h * 0.82], [cx + w * 0.56, y - h * 0.45], [cx + w / 2, y]];
  pic.shape(P, col || C.cin, { seg: 6 });
  pic.line([[cx - w * 0.36, y - 2], [cx - w * 0.36, y - h * 0.5], [cx - w * 0.1, y - h * 0.9], [cx, y - h + 2]], 1, 'gold', { prof: Prof.hair });
  pic.line([[cx + w * 0.36, y - 2], [cx + w * 0.36, y - h * 0.5], [cx + w * 0.1, y - h * 0.9], [cx, y - h + 2]], 1, 'gold', { prof: Prof.hair });
  pic.line([[cx - w / 2 + 2, y - 1], [cx - w * 0.52, y - h * 0.45], [cx - w * 0.28, y - h * 0.8], [cx, y - h + 1]], 1.3, 'gold', { prof: Prof.hair });
  return [cx, y - h];
}
function onion(pic, cx, y, r, o = {}) { // луковица с барабаном и маковкой
  const drumH = r * 0.9;
  const d = new Path2D(); d.rect(cx - r * 0.45, y - drumH, r * 0.9, drumH);
  pic.fill(d, o.drum || C.wht, { cx, cy: y });
  pic.line([[cx - r * 0.45, y - drumH], [cx + r * 0.45, y - drumH]], 1, 'gold', { prof: Prof.even, seg: 2 });
  const by = y - drumH;
  const P = [[cx - r * 0.5, by], [cx - r * 1.02, by - r * 0.7], [cx - r * 0.6, by - r * 1.45], [cx, by - r * 2.1], [cx + r * 0.6, by - r * 1.45], [cx + r * 1.02, by - r * 0.7], [cx + r * 0.5, by]];
  pic.shape(P, o.col || 'gold', { seg: 6 });
  pic.line([[cx - r * 0.2, by - 1], [cx - r * 0.45, by - r * 0.8], [cx - r * 0.1, by - r * 1.8]], 1, o.col ? 'gold' : 'rgba(120,70,20,0.6)', { prof: Prof.hair });
  pic.line([[cx + r * 0.2, by - 1], [cx + r * 0.45, by - r * 0.8], [cx + r * 0.1, by - r * 1.8]], 1, o.col ? 'gold' : 'rgba(120,70,20,0.6)', { prof: Prof.hair });
  // маковка
  pic.line([[cx, by - r * 2.05], [cx, by - r * 3.1]], 1.4, 'gold', { prof: Prof.even });
  pic.dot(cx, by - r * 2.35, Math.max(1.6, r * 0.14), 'gold');
  pic.shape([[cx, by - r * 3.08], [cx + r * 0.75, by - r * 2.98], [cx + r * 0.62, by - r * 2.84], [cx, by - r * 2.8]], C.cin, { seg: 1 });
  return [cx, by - r * 2.9];
}
/* Терем целиком: высокая башня, палаты с бочками, крыльцо, малая башня */
function palace(pic, x, base, s, o = {}) {
  const win = [];
  const k = s / 100;
  // левая высокая башня
  wall(pic, x - 70 * k, base, 44 * k, 150 * k);
  win.push(archWin(pic, x - 48 * k, base - 105 * k, 12 * k, 22 * k, true));
  win.push(archWin(pic, x - 48 * k, base - 55 * k, 12 * k, 22 * k, true));
  tentRoof(pic, x - 48 * k, base - 154 * k, 50 * k, 88 * k, C.em);
  onion(pic, x - 48 * k, base - 240 * k, 8 * k);
  // палаты
  wall(pic, x - 26 * k, base, 110 * k, 92 * k);
  for (let i = 0; i < 4; i++) win.push(archWin(pic, x - 10 * k + i * 26 * k, base - 50 * k, 11 * k, 24 * k, true));
  barrelRoof(pic, x + 7 * k, base - 96 * k, 42 * k, 44 * k, C.cin);
  barrelRoof(pic, x + 55 * k, base - 96 * k, 42 * k, 44 * k, C.cin);
  // верхний ярус с главной луковицей
  wall(pic, x + 12 * k, base - 96 * k, 36 * k, 34 * k);
  win.push(archWin(pic, x + 30 * k, base - 106 * k, 10 * k, 16 * k, true));
  onion(pic, x + 30 * k, base - 134 * k, 17 * k);
  // крыльцо
  const st = new Path2D();
  st.moveTo(x + 84 * k, base); st.lineTo(x + 84 * k, base - 36 * k); st.lineTo(x + 100 * k, base - 36 * k); st.lineTo(x + 128 * k, base); st.closePath();
  pic.fill(st, C.cin, { cx: x + 100 * k, cy: base - 20 * k });
  for (let i = 1; i < 6; i++) pic.line([[x + 84 * k + i * 5 * k, base - 36 * k + i * 6 * k], [x + 100 * k + i * 5.4 * k, base - 36 * k + i * 6 * k]], 1, 'gold', { prof: Prof.even, seg: 2 });
  // правая малая башня
  wall(pic, x + 118 * k, base, 34 * k, 110 * k);
  win.push(archWin(pic, x + 135 * k, base - 70 * k, 10 * k, 20 * k, true));
  tentRoof(pic, x + 135 * k, base - 114 * k, 40 * k, 56 * k, C.cin);
  onion(pic, x + 135 * k, base - 170 * k, 7 * k);
  return { win, porch: [x + 92 * k, base - 36 * k] };
}

/* ---------- плетень ---------- */
function fence(pic, x0, x1, base, h) {
  const n = Math.floor((x1 - x0) / 14);
  for (let i = 0; i <= n; i++) {
    const x = lerp(x0, x1, i / n), hh = h * (0.9 + 0.1 * Math.sin(i * 1.7));
    const P = [[x - 3, base], [x - 3, base - hh], [x, base - hh - 7], [x + 3, base - hh], [x + 3, base]];
    pic.shape(P, i % 2 ? C.ochLo : '#5d3b1b', { seg: 2 });
    pic.line([[x - 2, base - 2], [x - 2, base - hh + 1]], 1, 'gold', { prof: Prof.hair, seg: 2 });
  }
  for (const yy of [base - h * 0.35, base - h * 0.72]) pic.line([[x0 - 4, yy], [x1 + 4, yy + 2]], 3, C.umb, { prof: Prof.even, seg: 2 });
}

/* ---------- вода: палехские волны-гребешки ---------- */
function waves(pic, x0, x1, y, rows, o = {}) {
  const R = o.R || rng(7);
  for (let r = 0; r < rows; r++) {
    const yy = y + r * (o.gap ?? 14), step = (o.step ?? 34) * (1 + r * 0.08);
    const off = (r % 2) * step * 0.5;
    for (let x = x0 - off; x < x1; x += step) {
      const P = [[x, yy], [x + step * 0.25, yy - 7], [x + step * 0.55, yy - 6], [x + step * 0.7, yy - 1], [x + step * 0.6, yy + 2], [x + step * 0.5, yy]];
      pic.line(P, 1.3, r % 2 ? 'gold' : 'rgba(230,240,255,0.55)', { prof: Prof.hair });
      if (R() < 0.3) pic.dot(x + step * 0.52, yy - 2, 1, 'gold');
    }
  }
}

/* ---------- камень на распутье ---------- */
function crossStone(pic, x, base, w, h) {
  const P = [[x - w / 2, base], [x - w * 0.52, base - h * 0.55], [x - w * 0.38, base - h * 0.92], [x - w * 0.05, base - h], [x + w * 0.35, base - h * 0.95], [x + w * 0.52, base - h * 0.6], [x + w / 2, base]];
  pic.shape(P, TONES.stone[1]);
  const P2 = [[x - w * 0.44, base - h * 0.1], [x - w * 0.46, base - h * 0.55], [x - w * 0.34, base - h * 0.86], [x - w * 0.05, base - h * 0.94], [x + w * 0.3, base - h * 0.88], [x + w * 0.42, base - h * 0.6], [x + w * 0.4, base - h * 0.1]];
  pic.shape(P2, TONES.stone[2]);
  const P3 = [[x - w * 0.4, base - h * 0.5], [x - w * 0.3, base - h * 0.82], [x - w * 0.05, base - h * 0.9], [x + w * 0.2, base - h * 0.84], [x - w * 0.02, base - h * 0.74]];
  pic.shape(P3, TONES.stone[3], { a: 0.8 });
  pic.line([[x - w * 0.44, base - h * 0.4], [x - w * 0.36, base - h * 0.84], [x - w * 0.05, base - h * 0.95], [x + w * 0.3, base - h * 0.9]], 1.6, 'rgba(255,240,210,0.45)', { prof: Prof.hair });
  pic.line([[x - w * 0.47, base - h * 0.3], [x - w * 0.4, base - h * 0.8], [x - w * 0.1, base - h * 0.97]], 1.3, 'gold', { prof: Prof.hair });
  return { x, y: base - h * 0.5, w, h };
}

/* ---------- небо: золотые звёзды и месяц ---------- */
function makeStars(seed, n, x0, y0, x1, y1) {
  const R = rng(seed), st = [];
  for (let i = 0; i < n; i++) st.push({ x: lerp(x0, x1, R()), y: lerp(y0, y1, Math.pow(R(), 1.3)), s: 0.6 + R() * R() * 2.6, k: R() < 0.22 ? 1 : 0, ph: R() * TAU, w: 0.8 + R() * 2.2 });
  return st;
}
function drawStars(ctx, P, stars, t, a = 1, flare = 0) {
  if (a <= 0) return;
  ctx.fillStyle = P.gold;
  for (const s of stars) {
    const tw = 0.55 + 0.45 * Math.sin(t * s.w + s.ph);
    const al = a * (0.35 + 0.65 * tw) * (1 + flare * 0.8);
    ctx.globalAlpha = Math.min(1, al);
    if (s.k) { // четырёхлучевая звёздочка
      const r = s.s * (3.2 + flare * 2.5);
      ctx.beginPath();
      ctx.moveTo(s.x - r, s.y); ctx.quadraticCurveTo(s.x, s.y, s.x, s.y - r); ctx.quadraticCurveTo(s.x, s.y, s.x + r, s.y);
      ctx.quadraticCurveTo(s.x, s.y, s.x, s.y + r); ctx.quadraticCurveTo(s.x, s.y, s.x - r, s.y);
      ctx.fill();
    } else {
      ctx.beginPath(); ctx.arc(s.x, s.y, s.s * 0.7, 0, TAU); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}
function drawMoon(ctx, P, x, y, r, a = 1) {
  ctx.globalCompositeOperation = 'lighter';
  drawGlow(ctx, SPR.gold, x, y, r * 3.4, 0.14 * a);
  ctx.globalCompositeOperation = 'source-over';
  // серп: внешняя дуга минус внутренний круг, смещённый вправо-вверх
  const dx = r * 0.45, dy = -r * 0.2, r2 = r * 0.84;
  const d = Math.hypot(dx, dy), base = Math.atan2(dy, dx);
  const ca = (r * r + d * d - r2 * r2) / (2 * r * d);
  const al = Math.acos(clamp(ca, -1, 1));
  const cb = (r2 * r2 + d * d - r * r) / (2 * r2 * d);
  const be = Math.acos(clamp(cb, -1, 1));
  ctx.globalAlpha = a;
  ctx.beginPath();
  ctx.arc(x, y, r, base + al, base - al + TAU, false);
  ctx.arc(x + dx, y + dy, r2, base + PI + be, base + PI - be, true);
  ctx.closePath();
  ctx.fillStyle = P.gold;
  ctx.fill();
  ctx.globalAlpha = 1;
}
/* Заря: горизонтальные полосы у горизонта, как на палехских миниатюрах */
function drawDawn(ctx, y, a, cols) {
  if (a <= 0) return;
  const bands = cols || ['rgba(120,40,30,0.55)', 'rgba(190,90,45,0.5)', 'rgba(232,170,90,0.55)', 'rgba(250,220,150,0.5)'];
  ctx.globalAlpha = a;
  for (let i = 0; i < bands.length; i++) {
    const yy = y - 150 + i * 36;
    const g = ctx.createLinearGradient(0, yy - 20, 0, yy + 40);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, bands[i]); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-400, yy - 20, W + 800, 60);
  }
  ctx.globalAlpha = 1;
}

/* ---------- золотой завиток (спираль) ---------- */
function curlPts(x, y, r, a0, turns, dir) {
  const pts = [];
  const n = Math.ceil(turns * 16);
  for (let i = 0; i <= n; i++) {
    const u = i / n, a = a0 + dir * u * turns * TAU, rr = r * (1 - 0.82 * u);
    pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]);
  }
  return pts;
}

/* ---------- орнаментальная рамка кадра ---------- */
function* buildBorder() {
  const pic = new Pic();
  const o1 = 7, o2 = 28, mid = 17.5;
  // линии
  const rect = (d) => [[d, d], [W - d, d], [W - d, H - d], [d, H - d], [d, d]];
  const edge = (d, w) => {
    const R = rect(d);
    for (let i = 0; i < 4; i++) {
      const a = R[i], b = R[i + 1];
      const s = pic.line([a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], b], w, 'gold', { prof: Prof.even, seg: 2 });
      s.side = i; s.fromCorner = 0; s.len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
  };
  edge(o1, 1.6); edge(o2, 2.2); edge(o2 + 3.2, 0.9);
  yield;
  // стебель с завитками по каждой стороне — растёт от углов к середине
  const sides = [
    { a: [0, 0], d: [1, 0], n: [0, 1], L: W },
    { a: [W, 0], d: [0, 1], n: [-1, 0], L: H },
    { a: [W, H], d: [-1, 0], n: [0, -1], L: W },
    { a: [0, H], d: [0, -1], n: [1, 0], L: H },
  ];
  const cs = 44, amp = 4.6;
  for (let si = 0; si < sides.length; si++) {
    const sd = sides[si];
    const P = (s, v) => [sd.a[0] + sd.d[0] * s + sd.n[0] * (mid + v), sd.a[1] + sd.d[1] * s + sd.n[1] * (mid + v)];
    const len = sd.L - 2 * cs;
    const half = len / 2;
    const nWaves = Math.round(half / 52);
    const lam = half / nWaves;
    for (const side of [0, 1]) { // из обоих углов к середине
      const s0 = side === 0 ? cs : sd.L - cs, dir = side === 0 ? 1 : -1;
      const stem = [];
      for (let i = 0; i <= nWaves * 10; i++) {
        const s = (i / (nWaves * 10)) * half;
        stem.push(P(s0 + dir * s, amp * Math.sin((s / lam) * TAU)));
      }
      const st = pic.line(stem, 1.5, 'gold', { prof: Prof.even, seg: 2 });
      st.fromCorner = 0.02; st.stem = true;
      for (let k = 0; k < nWaves * 2; k++) {
        const sc = (k * 0.5 + 0.25) * lam; // гребень волны
        const v = amp * Math.sin((sc / lam) * TAU);
        const sg = v > 0 ? 1 : -1;
        const [cx, cy] = P(s0 + dir * (sc + lam * 0.12), v + sg * 5.2);
        const a0 = Math.atan2(-sg * sd.n[1], -sg * sd.n[0]);
        const cp = curlPts(cx, cy, 5.2, a0 - dir * 0.9, 1.15, dir * sg * (si % 2 ? -1 : 1));
        const c = pic.line([P(s0 + dir * (sc - lam * 0.05), v), ...cp], 1.25, 'gold', { prof: Prof.tail, seg: 3 });
        c.fromCorner = sc / half;
        // листок у перегиба
        const sl = (k * 0.5 + 0.5) * lam;
        const vl = amp * Math.sin((sl / lam) * TAU);
        const lf = pic.line([P(s0 + dir * sl, vl), P(s0 + dir * (sl + lam * 0.16), vl + (k % 2 ? 4 : -4))], 3.2, 'gold', { prof: Prof.leaf, seg: 4 });
        lf.fromCorner = sl / half;
        if (k % 2 === 0) { const [dx, dy] = P(s0 + dir * (sl + lam * 0.26), -sg * 7.5); const dd = pic.dot(dx, dy, 1.3, 'gold'); dd.fromCorner = sl / half; }
      }
    }
    yield;
    // середина стороны: ромбик с усиками
    const [mx, my] = P(sd.L / 2, 0);
    const k = 7;
    const diam = [[mx - sd.d[0] * k, my - sd.d[1] * k], [mx + sd.n[0] * k * 0.8, my + sd.n[1] * k * 0.8], [mx + sd.d[0] * k, my + sd.d[1] * k], [mx - sd.n[0] * k * 0.8, my - sd.n[1] * k * 0.8]];
    const dm = pic.shape(diam, 'gold', { seg: 1 }); dm.fromCorner = 1; dm.cx = mx; dm.cy = my;
    const dc = pic.dot(mx, my, 2.1, C.cin); dc.fromCorner = 1;
  }
  // угловые розетки
  for (const [cx, cy] of [[mid + 1, mid + 1], [W - mid - 1, mid + 1], [W - mid - 1, H - mid - 1], [mid + 1, H - mid - 1]]) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + PI / 8;
      const p = pic.line([[cx + Math.cos(a) * 2.5, cy + Math.sin(a) * 2.5], [cx + Math.cos(a) * 12, cy + Math.sin(a) * 12]], 5, 'gold', { prof: Prof.drop, seg: 3 });
      p.fromCorner = 0;
    }
    const d = pic.dot(cx, cy, 3.2, C.cin); d.fromCorner = 0;
  }
  // порядок: от углов к серединам сторон
  pic.order((op) => (op.fromCorner ?? 0.5) * 0.72 + (op.stem ? 0 : 0.08));
  return pic;
}

/* ---------- рамка клейма: картуш с килевидным верхом ---------- */
function klejmoPath(x, y, w, h, arch = 0.22) {
  const p = new Path2D();
  const ah = h * arch;
  p.moveTo(x, y + h);
  p.lineTo(x, y + ah);
  p.bezierCurveTo(x, y + ah * 0.3, x + w * 0.3, y + ah * 0.35, x + w / 2, y);
  p.bezierCurveTo(x + w * 0.7, y + ah * 0.35, x + w, y + ah * 0.3, x + w, y + ah);
  p.lineTo(x + w, y + h);
  p.closePath();
  return p;
}
