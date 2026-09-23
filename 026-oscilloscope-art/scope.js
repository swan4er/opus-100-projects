/* ОЛ-86 — осциллограф-синтезатор.
   Одна и та же последовательность точек идёт в стереовыход (L = X, R = Y) и рисуется лучом на экране. */
'use strict';
(() => {
const $ = id => document.getElementById(id);
function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) { if (v == null) continue; if (k === 'class') e.className = v; else if (k === 'html') e.innerHTML = v; else e.setAttribute(k, v); }
  for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TAU = Math.PI * 2;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ============ молотковая эмаль корпуса ============ */
(function hammertone() {
  const S = 192, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d'), img = x.createImageData(S, S), d = img.data;
  const g = new Float32Array(26 * 26); for (let i = 0; i < g.length; i++) g[i] = Math.random() * 2 - 1;
  const at = (u, v) => g[((v % 24 + 24) % 24) * 26 + ((u % 24 + 24) % 24)];
  const smooth = (px, py, sc) => { const fx = px / sc, fy = py / sc, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = at(ix, iy), b = at(ix + 1, iy), cc = at(ix, iy + 1), dd = at(ix + 1, iy + 1); return (a + (b - a) * sx) * (1 - sy) + (cc + (dd - cc) * sx) * sy; };
  for (let y = 0; y < S; y++) for (let xx = 0; xx < S; xx++) {
    const n = smooth(xx, y, 8) * 0.7 + smooth(xx * 2.3, y * 2.3, 8) * 0.3 + (Math.random() - 0.5) * 0.35, i = (y * S + xx) * 4;
    if (n > 0) { d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = n * 16; } else { d[i + 3] = -n * 34; }
  }
  x.putImageData(img, 0, 0); document.documentElement.style.setProperty('--hammer', `url(${c.toDataURL()})`);
})();

/* ============ однолинейный векторный шрифт ============ */
// Сетка 4×6 (y вниз), штрихи через «|», эллипс — «@cx,cy,rx,ry».
const GLYPH_SRC = {
  'А': '0,6 2,0 4,6|1,4 3,4', 'Б': '4,0 0,0 0,6 3,6 4,5 4,4 3,3 0,3', 'В': '0,3 3,3 4,4 4,5 3,6 0,6 0,0 3,0 4,1 4,2 3,3', 'Г': '4,0 0,0 0,6',
  'Д': '0,7 0,6 4,6 4,7|0.8,6 1.6,0 3.4,0 3.4,6', 'Е': '4,0 0,0 0,6 4,6|0,3 3,3', 'Ё': '4,0 0,0 0,6 4,6|0,3 3,3|1,-1.2 1.4,-1.2|2.6,-1.2 3,-1.2',
  'Ж': '2,0 2,6|0,0 2,3 4,0|0,6 2,3 4,6', 'З': '0,1 1,0 3,0 4,1 4,2 3,3 1.5,3|3,3 4,4 4,5 3,6 1,6 0,5', 'И': '0,0 0,6 4,0 4,6',
  'Й': '0,0 0,6 4,0 4,6|1,-1.3 2,-0.6 3,-1.3', 'К': '0,0 0,6|4,0 0,3.3 4,6', 'Л': '0,6 0.6,6 1.6,0 4,0 4,6', 'М': '0,6 0,0 2,3.5 4,0 4,6',
  'Н': '0,0 0,6|4,0 4,6|0,3 4,3', 'О': '@2,3,2,3', 'П': '0,6 0,0 4,0 4,6', 'Р': '0,6 0,0 3,0 4,1 4,2 3,3 0,3', 'С': '4,1 3,0 1,0 0,1 0,5 1,6 3,6 4,5',
  'Т': '0,0 4,0|2,0 2,6', 'У': '0,0 2,3.6|4,0 1.6,6 0.6,6', 'Ф': '2,0 2,6|2,1 0.6,1.3 0,2.5 0.6,3.7 2,4 3.4,3.7 4,2.5 3.4,1.3 2,1', 'Х': '0,0 4,6|4,0 0,6',
  'Ц': '0,0 0,6 3.4,6 3.4,0|3.4,6 4,6 4,7', 'Ч': '0,0 0,2 1,3 4,3|4,0 4,6', 'Ш': '0,0 0,6 4,6 4,0|2,0 2,6', 'Щ': '0,0 0,6 3.4,6 3.4,0|1.7,0 1.7,6|3.4,6 4,6 4,7',
  'Ъ': '0,0 1,0 1,6 3,6 4,5 4,4 3,3 1,3', 'Ы': '0,0 0,6 2,6 3,5 3,4 2,3 0,3|4,0 4,6', 'Ь': '0,0 0,6 3,6 4,5 4,4 3,3 0,3',
  'Э': '0,1 1,0 3,0 4,1 4,5 3,6 1,6 0,5|1.5,3 4,3', 'Ю': '0,0 0,6|0,3 1.6,3|@3,3,1.3,3', 'Я': '4,6 4,0 1,0 0,1 0,2 1,3 4,3|2.2,3 0,6',
  'D': '0,0 0,6 2.5,6 4,4.5 4,1.5 2.5,0 0,0', 'F': '4,0 0,0 0,6|0,3 3,3', 'G': '4,1 3,0 1,0 0,1 0,5 1,6 3,6 4,5 4,3.5 2.5,3.5', 'I': '1,0 3,0|2,0 2,6|1,6 3,6',
  'J': '4,0 4,5 3,6 1,6 0,5', 'L': '0,0 0,6 4,6', 'N': '0,6 0,0 4,6 4,0', 'Q': '@2,3,2,3|2.6,4.6 4,6.6', 'R': '0,6 0,0 3,0 4,1 4,2 3,3 0,3|1.6,3 4,6',
  'S': '4,1 3,0 1,0 0,1 0,2 1,3 3,3 4,4 4,5 3,6 1,6 0,5', 'U': '0,0 0,5 1,6 3,6 4,5 4,0', 'V': '0,0 2,6 4,0', 'W': '0,0 1,6 2,3 3,6 4,0', 'Y': '0,0 2,3 4,0|2,3 2,6', 'Z': '0,0 4,0 0,6 4,6',
  '0': '@2,3,1.7,3', '1': '0.8,1.2 2,0 2,6|0.8,6 3.2,6', '2': '0,1 1,0 3,0 4,1 4,2 0,6 4,6', '3': '0,1 1,0 3,0 4,1 4,2 3,3 1.5,3|3,3 4,4 4,5 3,6 1,6 0,5',
  '4': '3,6 3,0 0,4 4,4', '5': '4,0 0,0 0,3 3,3 4,4 4,5 3,6 0,6', '6': '3.5,0 1,0 0,1 0,5 1,6 3,6 4,5 4,4 3,3 0,3', '7': '0,0 4,0 1.4,6',
  '8': '1,3 0,2 0,1 1,0 3,0 4,1 4,2 3,3 1,3 0,4 0,5 1,6 3,6 4,5 4,4 3,3', '9': '4,3 1,3 0,2 0,1 1,0 3,0 4,1 4,5 3,6 0.5,6',
  '.': '2,5.7 2,6', ',': '2,5.4 1.4,7', '!': '2,0 2,4.2|2,5.7 2,6', '?': '0,1 1,0 3,0 4,1 4,2 2,3.5 2,4.3|2,5.7 2,6', '-': '1,3 3,3', '—': '0,3 4,3', '–': '0.5,3 3.5,3',
  ':': '2,1.7 2,2|2,5.7 2,6', '+': '2,1.5 2,4.5|0.5,3 3.5,3', '=': '0.5,2 3.5,2|0.5,4 3.5,4', '«': '2,1.5 0.5,3 2,4.5|3.5,1.5 2,3 3.5,4.5',
  '»': '0.5,1.5 2,3 0.5,4.5|2,1.5 3.5,3 2,4.5', '"': '1.3,0 1.3,1.5|2.7,0 2.7,1.5', "'": '2,0 2,1.5', '/': '4,0 0,6', '(': '3,0 1.6,1.6 1.6,4.4 3,6',
  ')': '1,0 2.4,1.6 2.4,4.4 1,6', '*': '2,1 2,5|0.3,2 3.7,4|3.7,2 0.3,4', '%': '0,6 4,0|@0.8,1,0.7,0.9|@3.2,5,0.7,0.9', '♥': '2,6 0,3 0,1 1,0 2,1 3,0 4,1 4,3 2,6',
  '№': '0,6 0,0 2.4,6 2.4,0|@3.4,1.6,0.6,0.9|2.9,3.3 3.9,3.3', ' ': '',
};
const ALIAS = { A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х', '<': '«', '>': '»' };
const GLYPHS = {};
for (const [k, src] of Object.entries(GLYPH_SRC)) {
  GLYPHS[k] = !src ? [] : src.split('|').map(s => {
    if (s[0] === '@') { const [cx, cy, rx, ry] = s.slice(1).split(',').map(Number), pts = []; for (let i = 0; i <= 20; i++) { const a = i / 20 * TAU - Math.PI / 2; pts.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry); } return pts; }
    return s.trim().split(/\s+/).flatMap(p => p.split(',').map(Number));
  });
}
const glyph = ch => { const u = ch.toUpperCase(); return GLYPHS[u] || GLYPHS[ALIAS[u]] || GLYPHS[ALIAS[ch]] || null; };
function wrapLines(text, maxChars) {
  const out = []; for (const para of String(text).toUpperCase().split(/\n/)) { let cur = ''; for (const w of para.split(/\s+/).filter(Boolean)) { if ((cur + ' ' + w).trim().length > maxChars && cur) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); } out.push(cur); }
  return out.filter((l, i, a) => l || a.length === 1);
}
// строки текста → штрихи в координатах экрана (x ∈ −1…1, y ∈ −0.8…0.8, y вверх)
function textStrokes(text, box = { x: 0, y: 0, w: 1.8, h: 1.3 }, maxChars = 12) {
  const lines = wrapLines(text, maxChars), ADV = 5.6, LH = 9.6, strokes = [];
  const widest = Math.max(1, ...lines.map(l => l.length * ADV - 1.6)), tall = lines.length * LH - 3.6;
  const sc = Math.min(box.w / widest, box.h / tall);
  lines.forEach((ln, li) => {
    const lw = ln.length * ADV - 1.6, ox = box.x - lw * sc / 2, oy = box.y + tall * sc / 2 - li * LH * sc;
    [...ln].forEach((ch, ci) => { const g = glyph(ch); if (!g) return; for (const s of g) { const o = new Float32Array(s.length); for (let i = 0; i < s.length; i += 2) { o[i] = ox + (ci * ADV + s[i]) * sc; o[i + 1] = oy - s[i + 1] * sc; } strokes.push(o); } });
  });
  return strokes;
}

/* ============ штрихи → точки луча (равномерно по длине, быстрые перелёты) ============ */
function strokesToPoints(strokes, N) {
  if (!strokes.length) return new Float32Array([0, 0]);
  const lens = strokes.map(s => { let l = 0; for (let i = 2; i < s.length; i += 2) l += Math.hypot(s[i] - s[i - 2], s[i + 1] - s[i - 1]); return l; });
  const total = lens.reduce((a, b) => a + b, 0) || 1, J = 3, avail = Math.max(strokes.length * 2, N - strokes.length * J), out = [];
  let px = null, py = null;
  strokes.forEach((s, si) => {
    if (px !== null) for (let k = 1; k <= J; k++) { const t = k / (J + 1); out.push(px + (s[0] - px) * t, py + (s[1] - py) * t); }
    const n = Math.max(2, Math.round(avail * lens[si] / total));
    if (s.length === 2 || lens[si] === 0) { for (let k = 0; k < n; k++) out.push(s[0], s[1]); }
    else {
      const step = lens[si] / (n - 1); let seg = 2, acc = 0, segLen = Math.hypot(s[2] - s[0], s[3] - s[1]);
      for (let k = 0; k < n; k++) {
        const target = k * step;
        while (acc + segLen < target && seg < s.length - 2) { acc += segLen; seg += 2; segLen = Math.hypot(s[seg] - s[seg - 2], s[seg + 1] - s[seg - 1]); }
        const t = segLen ? clamp((target - acc) / segLen, 0, 1) : 0;
        out.push(s[seg - 2] + (s[seg] - s[seg - 2]) * t, s[seg - 1] + (s[seg + 1] - s[seg - 1]) * t);
      }
    }
    px = s[s.length - 2]; py = s[s.length - 1];
  });
  return Float32Array.from(out);
}

/* ============ каркасы ============ */
const PHI = (1 + Math.sqrt(5)) / 2;
function chains(nv, edges) {
  const adj = Array.from({ length: nv }, () => []); edges.forEach(([a, b], k) => { adj[a].push([b, k]); adj[b].push([a, k]); });
  const used = new Uint8Array(edges.length), out = [];
  const free = i => adj[i].some(([, k]) => !used[k]);
  for (;;) {
    let start = -1; for (let i = 0; i < nv; i++) if (free(i) && adj[i].filter(([, k]) => !used[k]).length % 2) { start = i; break; }
    if (start < 0) for (let i = 0; i < nv; i++) if (free(i)) { start = i; break; }
    if (start < 0) break;
    const ch = [start]; let cur = start;
    for (;;) { const nx = adj[cur].find(([, k]) => !used[k]); if (!nx) break; used[nx[1]] = 1; cur = nx[0]; ch.push(cur); }
    out.push(ch);
  }
  return out;
}
function edgesByLength(v, len) { const e = []; for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) { const d = Math.hypot(...v[i].map((c, k) => c - v[j][k])); if (Math.abs(d - len) < 1e-3) e.push([i, j]); } return e; }
const SHAPES = (() => {
  const cube = []; for (let i = 0; i < 8; i++) cube.push([i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1]);
  const octa = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map(p => p.map(c => c * 1.45));
  const ico = []; for (const a of [-1, 1]) for (const b of [-1, 1]) { ico.push([0, a, b * PHI], [a, b * PHI, 0], [b * PHI, 0, a]); }
  const tess = []; for (let i = 0; i < 16; i++) tess.push([i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1, i & 8 ? 1 : -1]);
  const mk = (v, e, s) => ({ v, e, s, ch: chains(v.length, e) });
  return {
    cube: mk(cube, edgesByLength(cube, 2), 0.42), octa: mk(octa, edgesByLength(octa, 1.45 * Math.SQRT2), 0.46),
    ico: mk(ico, edgesByLength(ico, 2), 0.36), tess: mk(tess, edgesByLength(tess, 2), 0.36),
  };
})();
function rot3(p, ax, ay, az) {
  let [x, y, z] = p; let c = Math.cos(ax), s = Math.sin(ax); [y, z] = [y * c - z * s, y * s + z * c];
  c = Math.cos(ay); s = Math.sin(ay); [x, z] = [x * c + z * s, -x * s + z * c]; c = Math.cos(az); s = Math.sin(az); [x, y] = [x * c - y * s, x * s + y * c]; return [x, y, z];
}
const proj = (p, sc, d = 4.2) => { const k = d / (d - p[2]); return [p[0] * k * sc, p[1] * k * sc]; };
function wireStrokes(kind, t) {
  const ax = t * 0.43, ay = t * 0.61, az = t * 0.17;
  if (kind === 'torus' || kind === 'globe') {
    const strokes = [], ring = (fn, n) => { const o = new Float32Array((n + 1) * 2); for (let i = 0; i <= n; i++) { const p = proj(rot3(fn(i / n * TAU), ax, ay, az), kind === 'torus' ? 0.38 : 0.62); o[2 * i] = p[0]; o[2 * i + 1] = p[1]; } return o; };
    if (kind === 'torus') {
      const R = 1.25, r = 0.5;
      for (let i = 0; i < 10; i++) { const u = i / 10 * TAU; strokes.push(ring(v => [(R + r * Math.cos(v)) * Math.cos(u), (R + r * Math.cos(v)) * Math.sin(u), r * Math.sin(v)], 18)); }
      for (let j = 0; j < 4; j++) { const v = j / 4 * TAU; strokes.push(ring(u => [(R + r * Math.cos(v)) * Math.cos(u), (R + r * Math.cos(v)) * Math.sin(u), r * Math.sin(v)], 30)); }
    } else {
      for (let i = 0; i < 6; i++) { const u = i / 6 * Math.PI; strokes.push(ring(v => [Math.cos(v) * Math.cos(u), Math.sin(v), Math.cos(v) * Math.sin(u)], 26)); }
      for (let j = 1; j < 5; j++) { const v = -Math.PI / 2 + j / 5 * Math.PI; strokes.push(ring(u => [Math.cos(v) * Math.cos(u), Math.sin(v), Math.cos(v) * Math.sin(u)], 26)); }
    }
    return strokes;
  }
  const S = SHAPES[kind]; let pts;
  if (kind === 'tess') {
    const a = t * 0.5, b = t * 0.33;
    pts = S.v.map(([x, y, z, w]) => { let c = Math.cos(a), s = Math.sin(a); [x, w] = [x * c - w * s, x * s + w * c]; c = Math.cos(b); s = Math.sin(b); [y, z] = [y * c - z * s, y * s + z * c]; const k = 2.6 / (2.6 - w); return proj(rot3([x * k, y * k, z * k], ax * 0.5, ay * 0.5, 0), S.s, 6); });
  } else pts = S.v.map(p => proj(rot3(p, ax, ay, az), S.s));
  return S.ch.map(ch => { const o = new Float32Array(ch.length * 2); ch.forEach((vi, i) => { o[2 * i] = pts[vi][0]; o[2 * i + 1] = pts[vi][1]; }); return o; });
}

/* ============ часы ============ */
const WDU = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ'], MONU = ['ЯНВ', 'ФЕВ', 'МАР', 'АПР', 'МАЙ', 'ИЮН', 'ИЮЛ', 'АВГ', 'СЕН', 'ОКТ', 'НОЯ', 'ДЕК'];
function clockStrokes() {
  const d = new Date(), S = [], R = 0.74;
  const circ = new Float32Array(97 * 2); for (let i = 0; i <= 96; i++) { const a = i / 96 * TAU; circ[2 * i] = Math.cos(a) * R; circ[2 * i + 1] = Math.sin(a) * R; } S.push(circ);
  for (let k = 0; k < 12; k++) { const a = Math.PI / 2 - k / 12 * TAU, r0 = k % 3 ? 0.66 : 0.6; S.push(Float32Array.of(Math.cos(a) * r0, Math.sin(a) * r0, Math.cos(a) * 0.71, Math.sin(a) * 0.71)); }
  for (const [txt, k] of [['12', 0], ['3', 3], ['6', 6], ['9', 9]]) { const a = Math.PI / 2 - k / 12 * TAU; S.push(...textStrokes(txt, { x: Math.cos(a) * 0.47, y: Math.sin(a) * 0.47, w: 0.2, h: 0.11 }, 4)); }
  S.push(...textStrokes(`${WDU[d.getDay()]} ${d.getDate()} ${MONU[d.getMonth()]}`, { x: 0, y: -0.26, w: 0.44, h: 0.06 }, 14));
  const sec = d.getSeconds() + d.getMilliseconds() / 1000, min = d.getMinutes() + sec / 60, hr = (d.getHours() % 12) + min / 60;
  const hand = (frac, len, tail) => { const a = Math.PI / 2 - frac * TAU; return Float32Array.of(-Math.cos(a) * tail, -Math.sin(a) * tail, Math.cos(a) * len, Math.sin(a) * len); };
  S.push(hand(hr / 12, 0.36, 0.05), hand(min / 60, 0.56, 0.06), hand(sec / 60, 0.64, 0.12));
  return S;
}

/* ============ состояние и программы ============ */
const RATIOS = [{ r: [1, 1], n: 'унисон' }, { r: [2, 1], n: 'октава' }, { r: [3, 2], n: 'квинта' }, { r: [4, 3], n: 'кварта' }, { r: [5, 4], n: 'большая терция' },
  { r: [6, 5], n: 'малая терция' }, { r: [5, 3], n: 'большая секста' }, { r: [8, 5], n: 'малая секста' }];
const WIRES = [['cube', 'куб'], ['octa', 'октаэдр'], ['ico', 'икосаэдр'], ['tess', 'тессеракт'], ['torus', 'тор'], ['globe', 'глобус']];
const FLOWERS = [[5, 3], [7, 4], [8, 3], [9, 5], [11, 6], [7, 2]];
const PHOS = { g: { name: 'З', title: 'Зелёный P31', core: '#dcffe8', glow: '#29ff78', lcd: '#9ff5c2' }, a: { name: 'Я', title: 'Янтарный', core: '#fff1cf', glow: '#ffab24', lcd: '#ffd28a' }, b: { name: 'Г', title: 'Голубой', core: '#ecf7ff', glow: '#4fb2ff', lcd: '#a8d8ff' } };
const st = {
  scene: 'lissajous', demo: true, ratio: 2, wire: 'ico', flower: 0, text: 'ОПУС 5.5\nРИСУЕТ ЗВУКОМ',
  freq: 80, bright: 0.85, focus: 1, persist: 0.55, speed: 0.5, vol: 0.45, sound: true, xy: true, phos: 'g',
};
const drawn = []; // штрихи пользователя
let textCache = null, textCacheKey = '';
function scenePoints(t, N) {
  switch (st.scene) {
    case 'lissajous': {
      const [a, b] = RATIOS[st.ratio].r, ph = t * (0.12 + st.speed * 0.9), out = new Float32Array(N * 2);
      for (let i = 0; i < N; i++) { const u = i / N * TAU; out[2 * i] = 0.9 * Math.sin(a * u + ph); out[2 * i + 1] = 0.72 * Math.sin(b * u); }
      return out;
    }
    case 'text': {
      const key = st.text; if (key !== textCacheKey) { textCache = textStrokes(st.text || ' ', { x: 0, y: 0, w: 1.8, h: 1.25 }, 12); textCacheKey = key; }
      return strokesToPoints(textCache, N);
    }
    case 'clock': return strokesToPoints(clockStrokes(), N);
    case 'wire': return strokesToPoints(wireStrokes(st.wire, t * (0.3 + st.speed * 1.6)), N);
    case 'flower': {
      const [R, r] = FLOWERS[st.flower], g = gcd(R, r), turns = r / g, dd = r * (0.55 + 0.4 * Math.sin(t * (0.15 + st.speed * 0.8))), k = (R - r) / r, norm = 0.74 / (R - r + dd), out = new Float32Array(N * 2);
      for (let i = 0; i < N; i++) { const u = i / N * TAU * turns; out[2 * i] = ((R - r) * Math.cos(u) + dd * Math.cos(k * u)) * norm; out[2 * i + 1] = ((R - r) * Math.sin(u) - dd * Math.sin(k * u)) * norm; }
      return out;
    }
    case 'draw': {
      if (!drawn.length) return strokesToPoints(textStrokes('РИСУЙТЕ\nНА ЭКРАНЕ', { x: 0, y: 0, w: 1.4, h: 0.7 }, 10), N);
      return strokesToPoints(drawn.map(s => Float32Array.from(s)), N);
    }
  }
  return new Float32Array(2);
}
const gcd = (a, b) => (b ? gcd(b, a % b) : a);

/* ============ отрисовка луча ============ */
const crt = $('crt'), grat = $('grat'), screen = $('screen');
const cctx = crt.getContext('2d'), gctx = grat.getContext('2d');
const phos = document.createElement('canvas'), pctx = phos.getContext('2d');
const bl1 = document.createElement('canvas'), b1x = bl1.getContext('2d'), bl2 = document.createElement('canvas'), b2x = bl2.getContext('2d');
let CW = 0, CH = 0, dpr = 1, quality = 1;
const SHOT = !!window.__SHOT__;
function resize() {
  const r = screen.getBoundingClientRect(); dpr = Math.min(2, window.devicePixelRatio || 1) * quality;
  CW = Math.max(2, Math.round(r.width * dpr)); CH = Math.max(2, Math.round(r.height * dpr));
  for (const c of [crt, grat, phos]) { c.width = CW; c.height = CH; }
  bl1.width = Math.ceil(CW / 4); bl1.height = Math.ceil(CH / 4); bl2.width = Math.ceil(CW / 12); bl2.height = Math.ceil(CH / 12);
  drawGraticule();
}
const toX = x => (x + 1) / 2 * CW, toY = y => (0.8 - y) / 1.6 * CH;
function drawGraticule() {
  const g = gctx; g.clearRect(0, 0, CW, CH); const lw = Math.max(1, dpr);
  g.strokeStyle = 'rgba(170,205,180,.16)'; g.lineWidth = lw; g.beginPath();
  for (let i = 1; i < 10; i++) { const x = Math.round(i / 10 * CW) + 0.5; g.moveTo(x, 0); g.lineTo(x, CH); }
  for (let j = 1; j < 8; j++) { const y = Math.round(j / 8 * CH) + 0.5; g.moveTo(0, y); g.lineTo(CW, y); }
  g.stroke();
  g.strokeStyle = 'rgba(190,225,200,.3)'; g.beginPath(); const cx = Math.round(CW / 2) + 0.5, cy = Math.round(CH / 2) + 0.5, tk = 5 * dpr;
  for (let i = 1; i < 50; i++) { const x = Math.round(i / 50 * CW) + 0.5; g.moveTo(x, cy - tk); g.lineTo(x, cy + tk); }
  for (let j = 1; j < 40; j++) { const y = Math.round(j / 40 * CH) + 0.5; g.moveTo(cx - tk, y); g.lineTo(cx + tk, y); }
  g.stroke();
  g.fillStyle = 'rgba(190,225,200,.42)'; g.font = `${11 * dpr}px "IBM Plex Mono", monospace`; g.fillText('100%', 8 * dpr, CH / 8 - 6 * dpr); g.fillText('0%', 8 * dpr, CH * 7 / 8 - 6 * dpr);
}
const BUCKETS = 8;
function beam(points, closed) {
  const decay = 0.62 - st.persist * 0.57;
  pctx.globalCompositeOperation = 'destination-out'; pctx.fillStyle = `rgba(0,0,0,${decay})`; pctx.fillRect(0, 0, CW, CH);
  pctx.globalCompositeOperation = 'lighter'; pctx.lineCap = 'round'; pctx.lineJoin = 'round';
  const P = PHOS[st.phos], n = points.length / 2; if (n < 2) return;
  const paths = Array.from({ length: BUCKETS }, () => new Path2D());
  let total = 0; for (let i = 1; i < n; i++) total += Math.hypot(points[2 * i] - points[2 * i - 2], points[2 * i + 1] - points[2 * i - 1]);
  const typical = total / n, dim = clamp(14 / (total + 4), 0.6, 1);
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % n, x0 = points[2 * i], y0 = points[2 * i + 1], x1 = points[2 * j], y1 = points[2 * j + 1], len = Math.hypot(x1 - x0, y1 - y0);
    const I = clamp((typical * 1.15) / (len + typical * 0.08), 0, 1) * dim; if (I < 0.03) continue;
    const b = Math.min(BUCKETS - 1, Math.floor(I * BUCKETS)); paths[b].moveTo(toX(x0), toY(y0)); paths[b].lineTo(toX(x1), toY(y1));
  }
  const br = st.bright, f = st.focus * dpr;
  pctx.strokeStyle = P.glow;
  for (let b = 0; b < BUCKETS; b++) { pctx.globalAlpha = Math.min(1, ((b + 1) / BUCKETS) * 0.8 * br); pctx.lineWidth = 2.8 * f; pctx.stroke(paths[b]); }
  pctx.strokeStyle = P.core;
  for (let b = 2; b < BUCKETS; b++) { pctx.globalAlpha = Math.min(1, ((b + 1) / BUCKETS) * 0.85 * br); pctx.lineWidth = 1.1 * f; pctx.stroke(paths[b]); }
  pctx.globalAlpha = 1;
}
function compose() {
  cctx.globalCompositeOperation = 'source-over'; cctx.clearRect(0, 0, CW, CH);
  b1x.clearRect(0, 0, bl1.width, bl1.height); b1x.drawImage(phos, 0, 0, bl1.width, bl1.height);
  b2x.clearRect(0, 0, bl2.width, bl2.height); b2x.drawImage(bl1, 0, 0, bl2.width, bl2.height);
  cctx.globalCompositeOperation = 'lighter';
  cctx.globalAlpha = 0.9; cctx.drawImage(bl2, 0, 0, CW, CH); cctx.globalAlpha = 0.75; cctx.drawImage(bl1, 0, 0, CW, CH);
  cctx.globalAlpha = 1; cctx.drawImage(phos, 0, 0); cctx.globalCompositeOperation = 'source-over';
}
function timeTrace(points) {
  const n = points.length / 2, show = Math.min(n * 2, 4000), out = [[], []];
  for (let k = 0; k <= show; k++) { const i = k % n, x = -1 + 2 * k / show; out[0].push(x, 0.38 + points[2 * i] * 0.3); out[1].push(x, -0.38 + points[2 * i + 1] * 0.3); }
  const a = Float32Array.from(out[0]), b = Float32Array.from(out[1]), both = new Float32Array(a.length + b.length);
  both.set(a); both.set(b, a.length); return { pts: both, split: a.length / 2 };
}

/* ============ звук ============ */
const WORKLET = `class ScopeProc extends AudioWorkletProcessor{constructor(){super();this.buf=new Float32Array(2);this.next=null;this.i=0;this.port.onmessage=e=>{this.next=e.data;};}
process(inp,out){const L=out[0][0],R=out[0][1]||L;for(let s=0;s<L.length;s++){if(this.i>=this.buf.length){this.i=0;if(this.next){this.buf=this.next;this.next=null;}}L[s]=this.buf[this.i];R[s]=this.buf[this.i+1];this.i+=2;}return true;}}
registerProcessor('scope-proc',ScopeProc);`;
let actx = null, gain = null, post = null, sr = 48000, starting = false;
async function startAudio() {
  if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
  if (starting) return; starting = true;
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)(); sr = actx.sampleRate;
    gain = actx.createGain(); gain.gain.value = st.sound ? st.vol * 0.5 : 0;
    const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 9000; gain.connect(lp).connect(actx.destination);
    try {
      const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
      await actx.audioWorklet.addModule(url);
      const node = new AudioWorkletNode(actx, 'scope-proc', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] }); node.connect(gain);
      post = buf => node.port.postMessage(buf, [buf.buffer]);
    } catch (e) {
      const sp = actx.createScriptProcessor(2048, 0, 2); let cur = new Float32Array(2), nxt = null, i = 0;
      sp.onaudioprocess = ev => { const L = ev.outputBuffer.getChannelData(0), R = ev.outputBuffer.getChannelData(1); for (let s = 0; s < L.length; s++) { if (i >= cur.length) { i = 0; if (nxt) { cur = nxt; nxt = null; } } L[s] = cur[i]; R[s] = cur[i + 1]; i += 2; } };
      sp.connect(gain); post = buf => { nxt = buf; };
    }
    $('hint').style.opacity = 0;
  } catch (e) { actx = null; }
  starting = false;
}
function setVolume() { if (gain) gain.gain.setTargetAtTime(st.sound ? st.vol * 0.5 : 0, actx.currentTime, 0.03); }
addEventListener('pointerdown', () => { if (st.sound) startAudio(); }, { capture: true });
addEventListener('keydown', () => { if (st.sound) startAudio(); }, { capture: true });

/* ============ ручки и переключатели ============ */
function ticksSVG() {
  let s = '<svg viewBox="0 0 78 78" aria-hidden="true">';
  for (let i = 0; i <= 10; i++) { const a = (-135 + i * 27) * Math.PI / 180, r0 = i % 5 ? 33.5 : 32, x0 = 39 + Math.sin(a) * r0, y0 = 39 - Math.cos(a) * r0, x1 = 39 + Math.sin(a) * 37.5, y1 = 39 - Math.cos(a) * 37.5; s += `<line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" stroke="#ecebe1" stroke-opacity="${i % 5 ? 0.55 : 0.9}" stroke-width="${i % 5 ? 1.2 : 1.8}" stroke-linecap="round"/>`; }
  return s + '</svg>';
}
function knob(el, o) {
  el.className = 'knob'; const dial = h('div', { class: 'dial', role: 'slider', tabindex: '0', 'aria-label': o.label, html: ticksSVG() });
  const cap = h('div', { class: 'cap' }, h('i')), val = h('span', { class: 'val' }); dial.append(cap);
  el.append(h('span', { class: 'lb' }, o.label), dial, val);
  let v = o.value; const toT = x => (o.log ? Math.log(x / o.min) / Math.log(o.max / o.min) : (x - o.min) / (o.max - o.min)), fromT = t => (o.log ? o.min * Math.pow(o.max / o.min, t) : o.min + (o.max - o.min) * t);
  function set(nv, fire = true) { v = clamp(nv, o.min, o.max); if (o.step) v = Math.round(v / o.step) * o.step; cap.style.transform = `rotate(${-135 + 270 * toT(v)}deg)`; val.textContent = o.fmt(v); dial.setAttribute('aria-valuetext', o.fmt(v)); if (fire) o.on(v); }
  let id = null, sy = 0, st0 = 0;
  dial.addEventListener('pointerdown', e => { id = e.pointerId; dial.setPointerCapture(id); sy = e.clientY; st0 = toT(v); stopDemoIf(o.stopsDemo); });
  dial.addEventListener('pointermove', e => { if (e.pointerId !== id) return; set(fromT(clamp(st0 + (sy - e.clientY) / 180, 0, 1))); });
  dial.addEventListener('pointerup', () => { id = null; }); dial.addEventListener('pointercancel', () => { id = null; });
  dial.addEventListener('wheel', e => { e.preventDefault(); set(fromT(clamp(toT(v) - Math.sign(e.deltaY) * 0.03, 0, 1))); }, { passive: false });
  dial.addEventListener('keydown', e => { const d = { ArrowUp: 0.03, ArrowRight: 0.03, ArrowDown: -0.03, ArrowLeft: -0.03 }[e.key]; if (d) { e.preventDefault(); set(fromT(clamp(toT(v) + d, 0, 1))); } });
  dial.addEventListener('dblclick', () => set(o.value));
  set(v, false); return { set, get: () => v };
}
const fmtHz = v => `${Math.round(v)} Гц`, fmtPct = v => `${Math.round(v * 100)} %`;
knob($('kFreq'), { label: 'Частота', min: 20, max: 240, value: st.freq, log: true, fmt: fmtHz, on: v => { st.freq = v; } });
knob($('kBright'), { label: 'Яркость', min: 0.2, max: 1.6, value: st.bright, fmt: fmtPct, on: v => { st.bright = v; } });
knob($('kFocus'), { label: 'Фокус', min: 0.5, max: 2.6, value: st.focus, fmt: v => `${v.toFixed(1).replace('.', ',')}×`, on: v => { st.focus = v; } });
knob($('kPersist'), { label: 'Послесв.', min: 0, max: 1, value: st.persist, fmt: fmtPct, on: v => { st.persist = v; } });
knob($('kSpeed'), { label: 'Скорость', min: 0, max: 1, value: st.speed, fmt: fmtPct, on: v => { st.speed = v; } });
knob($('kVol'), { label: 'Громкость', min: 0, max: 1, value: st.vol, fmt: fmtPct, on: v => { st.vol = v; setVolume(); } });
function toggle(el, get, set) {
  const upd = () => { el.classList.toggle('on', get()); el.setAttribute('aria-checked', get() ? 'true' : 'false'); };
  const flip = () => { set(!get()); upd(); };
  el.addEventListener('click', flip); el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } }); upd();
}
toggle($('tSound'), () => st.sound, v => { st.sound = v; if (v) startAudio(); setVolume(); });
toggle($('tMode'), () => st.xy, v => { st.xy = v; });
const phosRow = $('phos');
for (const [k, P] of Object.entries(PHOS)) {
  const b = h('button', { title: P.title, 'aria-label': `Люминофор: ${P.title}` }, P.name); b.style.setProperty('--c', P.glow);
  b.addEventListener('click', () => { st.phos = k; [...phosRow.children].forEach(x => x.classList.toggle('on', x === b)); document.documentElement.style.setProperty('--lcd-ink', P.lcd); });
  if (k === st.phos) b.classList.add('on'); phosRow.append(b);
}

/* ============ клавиши программ ============ */
const SCENES = [['demo', 'Демо'], ['lissajous', 'Лиссажу'], ['text', 'Текст'], ['clock', 'Часы'], ['wire', 'Каркас'], ['flower', 'Цветок'], ['draw', 'Рисунок']];
const keysEl = $('keys'), optsEl = $('opts'), keyBtns = {};
SCENES.forEach(([id, name], i) => {
  const b = h('button', { class: 'key' + (id === 'demo' ? ' demo' : ''), 'aria-pressed': 'false', title: `${name} · клавиша ${i}` }, name);
  b.addEventListener('click', () => { if (id === 'demo') { st.demo = !st.demo; demoT = 0; if (st.demo) nextDemo(true); } else { st.demo = false; setScene(id); } syncKeys(); });
  keyBtns[id] = b; keysEl.append(b);
});
function syncKeys() { for (const [id, b] of Object.entries(keyBtns)) { const on = id === 'demo' ? st.demo : id === st.scene; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); } screen.classList.toggle('drawmode', st.scene === 'draw'); }
function chip(label, on, click, small) { const b = h('button', { class: 'chip' + (on ? ' on' : '') }, label, small ? h('small', null, small) : null); b.addEventListener('click', () => { stopDemoIf(true); click(); renderOpts(); }); return b; }
function stopDemoIf(yes) { if (yes && st.demo) { st.demo = false; syncKeys(); } }
function renderOpts() {
  optsEl.innerHTML = '';
  if (st.demo) { optsEl.append(h('span', { class: 'note' }, 'Демо: программы сменяются сами каждые 9 секунд. Нажмите любую клавишу программы, чтобы остаться.')); return; }
  switch (st.scene) {
    case 'lissajous': RATIOS.forEach((R, i) => optsEl.append(chip(R.r.join(':'), st.ratio === i, () => { st.ratio = i; }, R.n))); break;
    case 'text': {
      const f = h('input', { class: 'field', value: st.text.replace(/\n/g, ' '), maxlength: '48', 'aria-label': 'Надпись для луча', spellcheck: 'false' });
      f.addEventListener('input', () => { st.text = f.value; }); optsEl.append(f, h('span', { class: 'note' }, 'кириллица, латиница, цифры, знаки'));
      break;
    }
    case 'clock': optsEl.append(h('span', { class: 'note' }, 'Векторные часы: циферблат, стрелки и дата рисуются одним лучом.')); break;
    case 'wire': WIRES.forEach(([k, n]) => optsEl.append(chip(n, st.wire === k, () => { st.wire = k; }))); break;
    case 'flower': FLOWERS.forEach(([R, r], i) => optsEl.append(chip(`${R}:${r}`, st.flower === i, () => { st.flower = i; }))); optsEl.append(h('span', { class: 'note' }, 'гипотрохоида — узор спирографа')); break;
    case 'draw': optsEl.append(chip('Стереть', false, () => { drawn.length = 0; }), h('span', { class: 'note' }, 'рисуйте мышью или пальцем прямо на экране')); break;
  }
}
function setScene(id) { st.scene = id; renderOpts(); syncKeys(); }
const DEMO = [['lissajous', { ratio: 2 }], ['wire', { wire: 'ico' }], ['text', {}], ['flower', { flower: 1 }], ['clock', {}], ['wire', { wire: 'tess' }], ['lissajous', { ratio: 4 }], ['flower', { flower: 3 }], ['wire', { wire: 'torus' }]];
let demoIdx = -1, demoT = 0;
function nextDemo(first) { demoIdx = (demoIdx + 1) % DEMO.length; const [id, o] = DEMO[demoIdx]; Object.assign(st, o); st.scene = id; renderOpts(); syncKeys(); if (!first) pctx.clearRect(0, 0, CW, CH); }
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return; const n = +e.key;
  if (n >= 0 && n < SCENES.length && e.key !== ' ') keyBtns[SCENES[n][0]].click();
});

/* ============ рисование пальцем ============ */
let drawing = null;
const toMath = e => { const r = crt.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * 2 - 1, 0.8 - ((e.clientY - r.top) / r.height) * 1.6]; };
crt.addEventListener('pointerdown', e => { if (st.scene !== 'draw') return; crt.setPointerCapture(e.pointerId); drawing = [...toMath(e)]; drawn.push(drawing); if (drawn.length > 24) drawn.shift(); });
crt.addEventListener('pointermove', e => { if (!drawing) return; const [x, y] = toMath(e), n = drawing.length; if (Math.hypot(x - drawing[n - 2], y - drawing[n - 1]) > 0.018 && drawing.length < 800) drawing.push(x, y); });
addEventListener('pointerup', () => { drawing = null; });

/* ============ цикл ============ */
const roL = $('roL'), roR = $('roR');
let last = performance.now(), t = 0, roT = 0, lastN = 0, ftAvg = 1 / 60, ftN = 0;
function readout(N) {
  const f = sr / N, scene = SCENES.find(s => s[0] === st.scene)[1];
  let left = `f = ${Math.round(st.freq)} Гц · ${st.xy ? 'X–Y' : 'Y(t)'} · ${scene.toUpperCase()}`, right = `луч: ${N} точек за цикл · ${f.toFixed(1).replace('.', ',')} цикл/с`;
  if (st.scene === 'lissajous') { const R = RATIOS[st.ratio]; left += ` ${R.r.join(':')} — ${R.n}`; right = `L ${Math.round(R.r[0] * f)} Гц · R ${Math.round(R.r[1] * f)} Гц`; }
  if (st.scene === 'wire') left += ` · ${WIRES.find(w => w[0] === st.wire)[1]}`;
  if (!actx && st.sound) right = 'звук — по первому щелчку';
  roL.textContent = left; roR.textContent = right;
}
function frame(now) {
  requestAnimationFrame(frame);
  if (document.hidden) { last = now; return; }
  const rawDt = (now - last) / 1000, dt = Math.min(1 / 30, rawDt); last = now; t += reduceMotion ? dt * 0.3 : dt;
  // адаптивное качество: если кадры тяжёлые, снижаем разрешение люминофора (кроме режима съёмки)
  if (!SHOT) { ftAvg = ftAvg * 0.95 + Math.min(0.2, rawDt) * 0.05; if (++ftN > 90 && ftAvg > 0.03 && quality > 0.55) { quality = Math.max(0.55, quality - 0.15); ftN = 0; ftAvg = 1 / 60; resize(); } }
  if (st.demo) { demoT += dt; if (demoT > 9) { demoT = 0; nextDemo(); } }
  const N = clamp(Math.round(sr / st.freq), 80, 4000); lastN = N;
  const pts = scenePoints(t, N);
  if (post && st.sound && actx && actx.state === 'running') post(pts.slice());
  if (st.xy) beam(pts, true);
  else { const tr = timeTrace(pts); beam(tr.pts.subarray(0, tr.split * 2), false); beam(tr.pts.subarray(tr.split * 2), false); }
  compose();
  roT -= dt; if (roT <= 0) { roT = 0.25; readout(N); }
}
new ResizeObserver(resize).observe(screen);
if (document.fonts) document.fonts.ready.then(drawGraticule);
resize(); renderOpts(); syncKeys(); nextDemo(true); demoIdx = 0; readout(clamp(Math.round(sr / st.freq), 80, 4000));
// на старте несколько кадров «прогрева», чтобы послесвечение успело набраться
for (let k = 0; k < 6; k++) { t += 1 / 60; beam(scenePoints(t, clamp(Math.round(sr / st.freq), 80, 4000)), true); }
compose();
requestAnimationFrame(frame);
})();
