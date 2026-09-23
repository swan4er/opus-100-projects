/* Проверка всех уровней «Призмы» решателем.
   Для каждого уровня: без деталей он не решён; записанное решение sol использует ровно выданные детали
   и зажигает все мишени; без любой одной детали решений нет (лишних деталей не выдаём);
   различных решений от одного до трёх — все на одной идее, а не россыпь случайных.
   Запуск: node tools/verify.js  (код выхода 1, если хоть один уровень не прошёл) */
'use strict';
const E = require('../engine.js');
const LEVELS = require('../levels.js');

const LIMIT = 800000;
let bad = 0;
const rows = [];

function toPlaced(level, sol) {
  const placed = new Map();
  for (const p of sol) {
    const v = E.variants(p.type)[0];
    const piece = Object.assign({}, v);
    if (piece.k === 'mirror' || piece.k === 'splitter') piece.o = p.o;
    placed.set(p.y * level.w + p.x, piece);
  }
  return placed;
}

LEVELS.forEach((L, i) => {
  const errs = [];
  if (L.grid.some((r) => r.length !== L.w)) errs.push('строки разной длины');
  for (const row of L.grid) for (const ch of row) if (/[0-9A-Z]/.test(ch) && !'PSZ'.includes(ch) && !L.defs[ch]) errs.push(`нет описания «${ch}»`);
  const board = E.parse(L);
  if (!board.emitters.length || !board.targets.length) errs.push('нет излучателя или мишени');
  if (E.trace(board, new Map()).ok) errs.push('решён без деталей');

  // записанное решение
  const count = {};
  for (const p of L.sol) count[p.type] = (count[p.type] || 0) + 1;
  for (const t of new Set([...Object.keys(count), ...Object.keys(L.inv)])) if ((count[t] || 0) !== (L.inv[t] || 0)) errs.push(`решение тратит ${t} ×${count[t] || 0}, а выдано ×${L.inv[t] || 0}`);
  for (const p of L.sol) if (board.cells[p.y * L.w + p.x].k !== 'empty') errs.push(`деталь решения на занятой клетке ${p.x},${p.y}`);
  if (!E.trace(board, toPlaced(L, L.sol)).ok) errs.push('записанное решение не работает');

  // каждая деталь нужна
  for (const t of Object.keys(L.inv)) {
    const inv = Object.assign({}, L.inv);
    inv[t]--;
    const s = E.solve(L, { inv, max: 1, maxNodes: LIMIT });
    if (s.solutions.length) errs.push(`решается без одной детали «${t}»`);
    else if (!s.exhausted) errs.push(`перебор без «${t}» не закончен`);
  }
  const all = E.solve(L, { max: 50, maxNodes: LIMIT });
  if (all.solutions.length > 3) errs.push(`решений больше трёх: ${all.solutions.length}`);
  if (!all.exhausted) errs.push('перебор всех решений не закончен');
  const nPieces = E.invList(L.inv).length;
  rows.push(`${String(i + 1).padStart(2)}  ${L.name.padEnd(22)} ${L.w}×${L.h}  деталей ${nPieces}  решений ${all.solutions.length}${all.solutions.length >= 50 ? '+' : ''}  узлов ${all.nodes}${errs.length ? '  ✗ ' + errs.join('; ') : '  ✓'}`);
  if (errs.length) bad++;
});

console.log(rows.join('\n'));
console.log(bad ? `\nНе прошли проверку: ${bad} из ${LEVELS.length}` : `\nПроверено уровней: ${LEVELS.length}. Все решаемы, лишних деталей нет.`);
process.exit(bad ? 1 : 0);
