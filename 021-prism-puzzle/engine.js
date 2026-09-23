/* Призма — движок света и решатель.
   Работает и в браузере (window.PrismEngine), и в Node (require) — решатель проверяет уровни. */
(function (root) {
  'use strict';

  // Направления в экранных координатах: 0 — восток, 1 — юг, 2 — запад, 3 — север
  const DX = [1, 0, -1, 0];
  const DY = [0, 1, 0, -1];
  const R = 1, G = 2, B = 4, W = 7;
  // Зеркало «/» (o = 0) и «\» (o = 1): новое направление по старому
  const MIRROR = [[3, 2, 1, 0], [1, 0, 3, 2]];
  const FILTERS = { r: R, g: G, b: B, c: G | B, m: R | B, y: R | G };

  function parse(level) {
    const { w, h } = level;
    const cells = new Array(w * h);
    const emitters = [];
    const targets = [];
    for (let y = 0; y < h; y++) {
      const row = level.grid[y] || '';
      for (let x = 0; x < w; x++) {
        const ch = row[x] || '#';
        const i = y * w + x;
        let c;
        if (ch === '.') c = { k: 'empty' };
        else if (ch === '#') c = { k: 'wall' };
        else if (ch === '/') c = { k: 'mirror', o: 0, fixed: true };
        else if (ch === '\\') c = { k: 'mirror', o: 1, fixed: true };
        else if (ch === 'P') c = { k: 'prism', fixed: true };
        else if (ch === 'S') c = { k: 'splitter', o: 0, fixed: true };
        else if (ch === 'Z') c = { k: 'splitter', o: 1, fixed: true };
        else if (FILTERS[ch]) c = { k: 'filter', m: FILTERS[ch], fixed: true };
        else if (level.defs && level.defs[ch]) {
          const d = level.defs[ch];
          if (d.k === 'e') { c = { k: 'emitter', d: d.d, m: d.m }; emitters.push(i); }
          else { c = { k: 'target', m: d.m, ti: targets.length }; targets.push(i); }
        } else c = { k: 'wall' };
        cells[i] = c;
      }
    }
    return { w, h, cells, emitters, targets };
  }

  // placed: Map(индекс клетки → деталь игрока {k, o?, m?})
  function trace(board, placed) {
    const { w, h, cells } = board;
    const seen = new Set();
    const segs = [];
    const hits = new Array(board.targets.length).fill(0);
    const q = [];
    for (const i of board.emitters) q.push([i % w, (i / w) | 0, cells[i].d, cells[i].m]);
    let guard = 0;
    while (q.length && guard++ < 5000) {
      let [x, y, d, m] = q.pop();
      const sx = x, sy = y;
      for (;;) {
        const nx = x + DX[d], ny = y + DY[d];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) { segs.push([sx, sy, x + DX[d] * 0.5, y + DY[d] * 0.5, m, 'edge']); break; }
        const ni = ny * w + nx;
        const key = (ni * 4 + d) * 8 + m;
        if (seen.has(key)) { segs.push([sx, sy, nx, ny, m, 'loop']); break; }
        seen.add(key);
        const cell = placed.get(ni) || cells[ni];
        const k = cell.k;
        if (k === 'empty') { x = nx; y = ny; continue; }
        if (k === 'wall' || k === 'emitter') { segs.push([sx, sy, x + DX[d] * 0.5, y + DY[d] * 0.5, m, 'wall']); break; }
        segs.push([sx, sy, nx, ny, m, k]);
        if (k === 'target') { hits[cell.ti] |= m; break; }
        if (k === 'mirror') { q.push([nx, ny, MIRROR[cell.o][d], m]); break; }
        if (k === 'splitter') { q.push([nx, ny, d, m]); q.push([nx, ny, MIRROR[cell.o][d], m]); break; }
        if (k === 'prism') {
          // Дисперсия: красный уходит налево от луча, зелёный — прямо, синий — направо
          if (m & R) q.push([nx, ny, (d + 3) % 4, R]);
          if (m & G) q.push([nx, ny, d, G]);
          if (m & B) q.push([nx, ny, (d + 1) % 4, B]);
          break;
        }
        if (k === 'filter') { const mm = m & cell.m; if (mm) q.push([nx, ny, d, mm]); break; }
        break;
      }
    }
    let ok = board.targets.length > 0;
    for (let j = 0; j < board.targets.length; j++) if (hits[j] !== cells[board.targets[j]].m) ok = false;
    return { segs, hits, ok };
  }

  // Пустые клетки, по которым сейчас идёт свет
  function litCells(board, segs) {
    const out = new Set();
    for (const s of segs) {
      const dx = Math.sign(s[2] - s[0]), dy = Math.sign(s[3] - s[1]);
      const n = Math.max(Math.abs(s[2] - s[0]), Math.abs(s[3] - s[1]));
      for (let k = 1; k < n; k++) {
        const x = s[0] + dx * k, y = s[1] + dy * k;
        if (x < 0 || y < 0 || x >= board.w || y >= board.h) continue;
        out.add(y * board.w + x);
      }
    }
    return out;
  }

  function variants(t) {
    if (t === 'mirror') return [{ k: 'mirror', o: 0 }, { k: 'mirror', o: 1 }];
    if (t === 'splitter') return [{ k: 'splitter', o: 0 }, { k: 'splitter', o: 1 }];
    if (t === 'prism') return [{ k: 'prism' }];
    if (t.startsWith('filter-')) return [{ k: 'filter', m: FILTERS[t.slice(7)] }];
    return [];
  }

  function invList(inv) {
    const out = [];
    for (const [t, n] of Object.entries(inv || {})) for (let i = 0; i < n; i++) out.push(t);
    return out;
  }

  // Поиск решений: детали ставятся только на освещённые клетки — остальные ничего не меняют
  function solve(level, opts = {}) {
    const board = parse(level);
    const inv = opts.inv ? invList(opts.inv) : invList(level.inv);
    const solutions = [];
    const placed = new Map();
    const visited = new Set();
    const maxSol = opts.max || 1;
    const maxNodes = opts.maxNodes || 400000;
    let nodes = 0;
    const stateKey = () => [...placed.entries()].map(([i, p]) => `${i}:${p.k}${p.o != null ? p.o : ''}${p.m || ''}`).sort().join('|');
    function rec(rest) {
      if (solutions.length >= maxSol || nodes > maxNodes) return;
      nodes++;
      const res = trace(board, placed);
      if (res.ok) {
        solutions.push([...placed.entries()].map(([i, p]) => Object.assign({ x: i % board.w, y: (i / board.w) | 0 }, p)));
        return;
      }
      if (!rest.length) return;
      const lit = litCells(board, res.segs);
      const types = [...new Set(rest)];
      for (const t of types) {
        const next = rest.slice();
        next.splice(next.indexOf(t), 1);
        for (const ci of lit) {
          if (board.cells[ci].k !== 'empty' || placed.has(ci)) continue;
          for (const v of variants(t)) {
            placed.set(ci, v);
            const key = stateKey();
            if (!visited.has(key)) { visited.add(key); rec(next); }
            placed.delete(ci);
            if (solutions.length >= maxSol || nodes > maxNodes) return;
          }
        }
      }
    }
    rec(inv);
    return { solutions, nodes, exhausted: nodes <= maxNodes };
  }

  const api = { DX, DY, R, G, B, W, MIRROR, FILTERS, parse, trace, litCells, solve, variants, invList };
  root.PrismEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
