/* Генератор кандидатов в уровни «Призмы» обратным построением.
   1) доска: излучатели на краю, стены, иногда закреплённые детали;
   2) детали игрока ставятся по одной на освещённые клетки (так строится «задуманное» решение);
   3) там, где лучи упираются в стену или край, ставятся мишени того цвета, что туда пришёл;
   4) детали убираются, и уровень отдаётся решателю. Кандидат проходит, если:
      без деталей не решается; решений от одного до трёх и все используют все детали;
      без любой одной детали решений нет; решение занимает всё поле, а не угол.
   Отобранные кандидаты затем смотрятся глазами, получают имена и попадают в levels.js.
   Запуск: node tools/generate.js <уровень сложности A–E> <сколько> <начальное зерно> [сколько зёрен перебрать] */
'use strict';
const E = require('../engine.js');

function rngOf(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// w × h, стены, излучатели, наборы деталей, число мишеней, цвета излучателей, закреплённые детали
const TIERS = {
  A: { w: 7, h: 6, walls: [2, 5], emit: [1, 1], targets: [2, 3], colors: [7, 7, 7, 1, 4], fixed: [],
       invs: [['mirror', 'prism'], ['mirror', 'mirror'], ['prism', 'filter-r'], ['mirror', 'splitter'], ['prism', 'prism']] },
  B: { w: 8, h: 7, walls: [3, 7], emit: [1, 2], targets: [2, 3], colors: [7, 7, 7, 1, 2, 4], fixed: ['P', 'y', 'c', '/'],
       invs: [['mirror', 'mirror', 'prism'], ['mirror', 'splitter', 'prism'], ['prism', 'mirror', 'filter-y'], ['splitter', 'mirror', 'mirror'], ['prism', 'prism', 'mirror']] },
  C: { w: 9, h: 7, walls: [4, 9], emit: [1, 2], targets: [3, 3], colors: [7, 7, 7, 3, 5, 6], fixed: ['P', 'S', 'Z', 'm', 'c', '\\'],
       invs: [['mirror', 'mirror', 'prism', 'splitter'], ['prism', 'prism', 'mirror', 'mirror'], ['mirror', 'splitter', 'prism', 'filter-m'], ['mirror', 'mirror', 'mirror', 'prism'], ['splitter', 'splitter', 'prism', 'mirror']] },
  D: { w: 8, h: 7, walls: [2, 6], emit: [2, 3], targets: [3, 4], colors: [7, 7, 7, 1, 2, 4, 3, 5, 6], fixed: ['P', 'S', 'Z', '/', '\\', 'y', 'c', 'm'],
       invs: [['prism', 'prism', 'mirror', 'splitter'], ['prism', 'mirror', 'mirror', 'splitter'], ['prism', 'splitter', 'splitter', 'mirror'],
              ['prism', 'mirror', 'mirror', 'filter-y'], ['prism', 'prism', 'mirror', 'mirror'], ['prism', 'splitter', 'mirror', 'filter-c']] },
  E: { w: 9, h: 7, walls: [2, 7], emit: [2, 3], targets: [3, 5], colors: [7, 7, 7, 1, 2, 4, 3, 5, 6], fixed: ['P', 'S', 'Z', '/', '\\', 'y', 'c', 'm'],
       invs: [['prism', 'prism', 'mirror', 'mirror', 'splitter'], ['prism', 'mirror', 'mirror', 'splitter', 'splitter'], ['prism', 'prism', 'prism', 'mirror', 'mirror'],
              ['prism', 'mirror', 'mirror', 'mirror', 'splitter'], ['prism', 'prism', 'mirror', 'splitter', 'filter-m']] },
};
const TARGET_CH = 'AEFHJKLNQTUVX';            // без P, S, Z — это закреплённые детали
const FILTER_OF = Object.fromEntries(Object.entries(E.FILTERS).map(([k, v]) => [v, k]));
const typeOf = (p) => (p.k === 'filter' ? 'filter-' + FILTER_OF[p.m] : p.k);

function candidate(r, T, forceInv) {
  const int = (n) => Math.floor(r() * n);
  const pick = (a) => a[int(a.length)];
  const range = ([a, b]) => a + int(b - a + 1);
  const { w, h } = T;
  const grid = Array.from({ length: h }, () => Array(w).fill('.'));
  const defs = {};
  const nE = range(T.emit);
  for (let k = 0; k < nE; k++) {
    let x, y, d;
    for (let tries = 0; tries < 30; tries++) {
      const side = int(4);
      if (side === 0) { x = 0; y = 1 + int(h - 2); d = 0; }
      else if (side === 1) { x = w - 1; y = 1 + int(h - 2); d = 2; }
      else if (side === 2) { x = 1 + int(w - 2); y = 0; d = 1; }
      else { x = 1 + int(w - 2); y = h - 1; d = 3; }
      if (grid[y][x] === '.') break;
    }
    if (grid[y][x] !== '.') return null;
    grid[y][x] = String(k + 1);
    defs[String(k + 1)] = { k: 'e', d, m: pick(T.colors) };
  }
  const nW = range(T.walls);
  for (let k = 0; k < nW; k++) {
    const x = 1 + int(w - 2), y = 1 + int(h - 2);
    if (grid[y][x] === '.') grid[y][x] = '#';
  }
  const nF = T.fixed.length ? int(3) : 0;         // 0–2 закреплённые детали
  for (let k = 0; k < nF; k++) {
    const x = 1 + int(w - 2), y = 1 + int(h - 2);
    if (grid[y][x] === '.') grid[y][x] = pick(T.fixed);
  }
  const inv = forceInv || pick(T.invs);
  const base = { w, h, grid: grid.map((row) => row.join('')), defs, inv: {} };
  const board = E.parse(base);
  const placed = new Map();
  for (const t of inv) {
    const res = E.trace(board, placed);
    const lit = [...E.litCells(board, res.segs)].filter((ci) => board.cells[ci].k === 'empty' && !placed.has(ci));
    if (!lit.length) return null;
    placed.set(pick(lit), pick(E.variants(t)));
  }
  // концы лучей → места для мишеней
  const res = E.trace(board, placed);
  const ends = new Set();
  for (const s of res.segs) {
    if (s[5] !== 'wall' && s[5] !== 'edge') continue;
    const dx = Math.sign(s[2] - s[0]), dy = Math.sign(s[3] - s[1]);
    const x = s[2] - dx * 0.5, y = s[3] - dy * 0.5;
    if (x === s[0] && y === s[1]) continue;
    const ci = y * w + x;
    if (board.cells[ci].k === 'empty' && !placed.has(ci)) ends.add(ci);
  }
  const endList = [...ends];
  if (!endList.length) return null;
  const nT = Math.min(endList.length, range(T.targets));
  for (let k = endList.length - 1; k > 0; k--) { const j = int(k + 1); [endList[k], endList[j]] = [endList[j], endList[k]]; }
  const g2 = base.grid.map((row) => row.split(''));
  endList.slice(0, nT).forEach((ci, i) => { g2[(ci / w) | 0][ci % w] = TARGET_CH[i]; });
  const lvl = { w, h, grid: g2.map((row) => row.join('')), defs: Object.assign({}, defs), inv: {} };
  for (let i = 0; i < nT; i++) lvl.defs[TARGET_CH[i]] = { k: 't', m: 7 };
  // цвет мишени — то, что приходит в неё при задуманном решении
  const b2 = E.parse(lvl);
  const res2 = E.trace(b2, placed);
  for (let j = 0; j < b2.targets.length; j++) {
    if (!res2.hits[j]) return null;
    lvl.defs[lvl.grid[(b2.targets[j] / w) | 0][b2.targets[j] % w]] = { k: 't', m: res2.hits[j] };
  }
  for (const t of inv) lvl.inv[t] = (lvl.inv[t] || 0) + 1;
  return lvl;
}

// Насколько решение «занимает» поле: доля ширины и высоты под рамкой всех значимых клеток и доля освещённых клеток
function spread(lvl, sol) {
  const pts = [];
  lvl.grid.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.' && ch !== '#') pts.push([x, y]); }));
  for (const p of sol) pts.push([p.x, p.y]);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const board = E.parse(lvl);
  const placed = new Map(sol.map((p) => [p.y * lvl.w + p.x, Object.assign({}, E.variants(p.type)[0], p.o != null ? { o: p.o } : {})]));
  const lit = E.litCells(board, E.trace(board, placed).segs).size;
  return { fx: (Math.max(...xs) - Math.min(...xs) + 1) / lvl.w, fy: (Math.max(...ys) - Math.min(...ys) + 1) / lvl.h, lit: lit / (lvl.w * lvl.h) };
}

function evaluate(lvl, nodes = 60000) {
  const board = E.parse(lvl);
  if (E.trace(board, new Map()).ok) return null;                     // решён без деталей
  const all = E.solve(lvl, { max: 12, maxNodes: nodes });
  if (!all.solutions.length || all.solutions.length > 3 || !all.exhausted) return null;
  const n = E.invList(lvl.inv).length;
  if (all.solutions.some((s) => s.length !== n)) return null;        // решение не должно оставлять детали без дела
  for (const t of Object.keys(lvl.inv)) {                            // каждая деталь нужна
    const inv = Object.assign({}, lvl.inv);
    inv[t]--;
    const s = E.solve(lvl, { inv, max: 1, maxNodes: nodes });
    if (s.solutions.length || !s.exhausted) return null;
  }
  const colors = new Set(Object.values(lvl.defs).filter((d) => d.k === 't').map((d) => d.m));
  return { nsol: all.solutions.length, nodes: all.nodes, colors: colors.size, sol: all.solutions[0] };
}

// убираем стены, без которых уровень не становится проще
function pruneWalls(lvl, nsol) {
  let cur = lvl;
  for (let y = 0; y < cur.h; y++) {
    for (let x = 0; x < cur.w; x++) {
      if (cur.grid[y][x] !== '#') continue;
      const g = cur.grid.slice();
      g[y] = g[y].slice(0, x) + '.' + g[y].slice(x + 1);
      const test = Object.assign({}, cur, { grid: g });
      const ev = evaluate(test);
      if (ev && ev.nsol <= nsol) { cur = test; nsol = ev.nsol; }
    }
  }
  return cur;
}

if (require.main === module) {
  const tier = process.argv[2] || 'A';
  const want = +(process.argv[3] || 8);
  const seed0 = +(process.argv[4] || 1);
  const seeds = +(process.argv[5] || 3000);
  const forceInv = process.argv[6] ? process.argv[6].split(',') : null;
  const T = TIERS[tier];
  const found = [];
  for (let s = seed0; found.length < want * 6 && s < seed0 + seeds; s++) {
    if ((s - seed0) % 250 === 0) process.stderr.write(`зерно ${s}, найдено ${found.length}\n`);
    const r = rngOf(s * 7919 + tier.charCodeAt(0));
    let lvl = candidate(r, T, forceInv);
    if (!lvl) continue;
    let ev = evaluate(lvl);
    if (!ev) continue;
    lvl = pruneWalls(lvl, ev.nsol);
    ev = evaluate(lvl);
    if (!ev) continue;
    const sol = ev.sol.map((p) => ({ x: p.x, y: p.y, type: typeOf(p), o: p.o }));
    const sp = spread(lvl, sol);
    if (sp.fx < 0.7 || sp.fy < 0.7) continue;                        // всё в углу — не годится
    const tcount = Object.values(lvl.defs).filter((d) => d.k === 't').length;
    const fixedN = (lvl.grid.join('').match(/[PSZcmy\\/]/g) || []).length;
    const walls = (lvl.grid.join('').match(/#/g) || []).length;
    const score = Math.min(ev.nodes, 20000) * 0.01 + ev.colors * 5 + tcount * 4 + sp.lit * 40 - (ev.nsol - 1) * 6 + fixedN * 3 - walls;
    found.push({ seed: s, score: +score.toFixed(1), nsol: ev.nsol, nodes: ev.nodes, colors: ev.colors, lit: +sp.lit.toFixed(2), lvl, sol });
  }
  found.sort((a, b) => b.score - a.score);
  console.log(JSON.stringify(found.slice(0, want)));
}
module.exports = { candidate, evaluate, spread, TIERS, rngOf, typeOf };
