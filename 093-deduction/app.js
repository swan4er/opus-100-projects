(() => {
'use strict';

/* ================================================================
   Дедукция — генератор задач «Эйнштейна» с единственным решением.
   Состояние игрока = множество возможных домов для каждого значения
   (битовые маски). Решатель работает теми же правилами, что и человек,
   поэтому любая задача решается без перебора, а любой шаг можно
   объяснить обычными словами.
   ================================================================ */

const $ = (s) => document.querySelector(s);

/* ---------- Категории и значения ---------- */
const COLORS = [
  { label: 'красный', hex: '#E5484D', gen: 'красного цвета', loc: 'в красном доме', H: 'красный дом', Hg: 'красного дома' },
  { label: 'синий', hex: '#3E63DD', gen: 'синего цвета', loc: 'в синем доме', H: 'синий дом', Hg: 'синего дома' },
  { label: 'жёлтый', hex: '#F5C63C', gen: 'жёлтого цвета', loc: 'в жёлтом доме', H: 'жёлтый дом', Hg: 'жёлтого дома' },
  { label: 'зелёный', hex: '#30A46C', gen: 'зелёного цвета', loc: 'в зелёном доме', H: 'зелёный дом', Hg: 'зелёного дома' },
  { label: 'белый', hex: '#F4F1EA', gen: 'белого цвета', loc: 'в белом доме', H: 'белый дом', Hg: 'белого дома' },
  { label: 'фиолетовый', hex: '#8E4EC6', gen: 'фиолетового цвета', loc: 'в фиолетовом доме', H: 'фиолетовый дом', Hg: 'фиолетового дома' },
];
const NAMES = [
  { label: 'Аня', gen: 'Ани' }, { label: 'Борис', gen: 'Бориса' }, { label: 'Вера', gen: 'Веры' },
  { label: 'Глеб', gen: 'Глеба' }, { label: 'Даша', gen: 'Даши' }, { label: 'Егор', gen: 'Егора' },
];
const PETS = [
  { label: 'кот', gen: 'кота', ins: 'котом', icon: 'cat' }, { label: 'пёс', gen: 'пса', ins: 'псом', icon: 'dog' },
  { label: 'рыбка', gen: 'рыбки', ins: 'рыбкой', icon: 'fish' }, { label: 'попугай', gen: 'попугая', ins: 'попугаем', icon: 'bird' },
  { label: 'ёж', gen: 'ежа', ins: 'ежом', icon: 'hog' }, { label: 'кролик', gen: 'кролика', ins: 'кроликом', icon: 'rabbit' },
];
const DRINKS = [
  { label: 'чай', gen: 'чая', liquid: '#D08A2E', cup: true }, { label: 'кофе', gen: 'кофе', liquid: '#5B3A24', cup: true },
  { label: 'молоко', gen: 'молока', liquid: '#FFFFFF' }, { label: 'сок', gen: 'сока', liquid: '#F59F00' },
  { label: 'вода', acc: 'воду', gen: 'воды', liquid: '#8FD3F4' }, { label: 'морс', gen: 'морса', liquid: '#C2255C' },
];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const lc = (s) => s.charAt(0).toLowerCase() + s.slice(1);

// Для каждой категории: как назвать дом (им./род.), как сказать «здесь …» и «здесь нет …».
const CATS = [
  { key: 'color', name: 'Цвет', plural: 'цветов', color: '#E5484D', vals: COLORS,
    H: (v) => v.H, Hs: (v) => v.H, Hg: (v) => v.Hg, loc: (v) => v.loc,
    at: (v, p) => `дом ${p} — ${v.label}`, notAt: (v, p) => `дом ${p} — не ${v.label}` },
  { key: 'name', name: 'Жилец', plural: 'жильцов', color: '#7048E8', vals: NAMES,
    H: (v) => `дом ${v.gen}`, Hs: (v) => `дом ${v.gen}`, Hg: (v) => `дома ${v.gen}`, loc: (v) => `у ${v.gen}`,
    F: (v) => `живёт ${v.label}`, Fn: (v) => `не живёт ${v.label}`,
    at: (v, p) => `в доме ${p} живёт ${v.label}`, notAt: (v, p) => `${v.label} живёт не в доме ${p}` },
  { key: 'pet', name: 'Питомец', plural: 'питомцев', color: '#F76707', vals: PETS,
    H: (v) => `дом с ${v.ins}`, Hs: (v) => `дом с ${v.ins}`, Hg: (v) => `дома с ${v.ins}`, loc: (v) => `в доме с ${v.ins}`,
    F: (v) => `живёт ${v.label}`, Fn: (v) => `не живёт ${v.label}`,
    at: (v, p) => `в доме ${p} живёт ${v.label}`, notAt: (v, p) => `${v.label} живёт не в доме ${p}` },
  { key: 'drink', name: 'Напиток', plural: 'напитков', color: '#0CA678', vals: DRINKS,
    H: (v) => `дом, где пьют ${v.acc || v.label}`, Hs: (v) => `дом, где пьют ${v.acc || v.label},`, Hg: (v) => `дома, где пьют ${v.acc || v.label}`, loc: (v) => `там, где пьют ${v.acc || v.label},`,
    F: (v) => `пьют ${v.acc || v.label}`, Fn: (v) => `не пьют ${v.acc || v.label}`,
    at: (v, p) => `в доме ${p} пьют ${v.acc || v.label}`, notAt: (v, p) => `${v.acc || v.label} пьют не в доме ${p}` },
];

const LEVELS = {
  easy:   { name: 'Лёгкая',  N: 4, w: { same: 3, notSame: 0.8, pos: 2, notPos: 0.6, left: 1, next: 0.5, before: 0.3 } },
  medium: { name: 'Средняя', N: 5, w: { same: 2, notSame: 1.2, pos: 0.8, notPos: 0.6, left: 1.2, next: 1, before: 0.8 } },
  hard:   { name: 'Сложная', N: 6, w: { same: 1.4, notSame: 1.5, pos: 0.3, notPos: 0.6, left: 1.2, next: 1.4, before: 1.3 } },
};

/* ---------- Случайность ---------- */
function RNG(seed) {
  let a = seed >>> 0 || 1;
  const f = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { f, int: (n) => Math.floor(f() * n), shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(f() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; } };
}

/* ---------- Битовые помощники ---------- */
const bit = (p) => 1 << p;
const single = (x) => x !== 0 && (x & (x - 1)) === 0;
const lowBit = (x) => 31 - Math.clz32(x & -x);
const highBit = (x) => 31 - Math.clz32(x);
const popcount = (x) => { let n = 0; while (x) { x &= x - 1; n++; } return n; };

/* ================================================================
   Модель задачи
   ================================================================ */
let G = null;   // текущая игра
// Значение с индексом v = c*N + i
function V(c, i) { return c * G.N + i; }
function valOf(v) { const c = Math.floor(v / G.N); return { c, i: v % G.N, cat: CATS[c], d: CATS[c].vals[v % G.N] }; }

/* ---------- Распространение ограничений (до неподвижной точки) ---------- */
function applyAll(dom, clues, N, K) {
  const FULL = (1 << N) - 1;
  let changed = true;
  const set = (v, x) => { if (x !== dom[v]) { dom[v] = x; changed = true; } return x !== 0; };
  while (changed) {
    changed = false;
    for (let c = 0; c < K; c++) {
      for (let i = 0; i < N; i++) {
        const d = dom[c * N + i];
        if (!d) return false;
        if (single(d)) for (let j = 0; j < N; j++) if (j !== i && !set(c * N + j, dom[c * N + j] & ~d)) return false;
      }
      for (let p = 0; p < N; p++) {
        let cnt = 0, last = -1;
        for (let i = 0; i < N; i++) if (dom[c * N + i] & bit(p)) { cnt++; last = i; }
        if (cnt === 0) return false;
        if (cnt === 1) set(c * N + last, bit(p));
      }
    }
    for (const cl of clues) {
      const a = cl.a, b = cl.b;
      switch (cl.t) {
        case 'same': { const x = dom[a] & dom[b]; if (!set(a, x) || !set(b, x)) return false; break; }
        case 'notSame':
          if (single(dom[a]) && !set(b, dom[b] & ~dom[a])) return false;
          if (single(dom[b]) && !set(a, dom[a] & ~dom[b])) return false;
          break;
        case 'pos': if (!(dom[a] & bit(cl.p)) || !set(a, bit(cl.p))) return false; break;
        case 'notPos': if (!set(a, dom[a] & ~bit(cl.p))) return false; break;
        case 'left': if (!set(a, dom[a] & (dom[b] >> 1)) || !set(b, dom[b] & ((dom[a] << 1) & FULL))) return false; break;
        case 'next': {
          const na = dom[a] & (((dom[b] << 1) | (dom[b] >> 1)) & FULL);
          if (!set(a, na)) return false;
          if (!set(b, dom[b] & (((dom[a] << 1) | (dom[a] >> 1)) & FULL))) return false;
          break;
        }
        case 'before': {
          if (!set(a, dom[a] & ((1 << highBit(dom[b])) - 1))) return false;
          if (!set(b, dom[b] & ~((2 << lowBit(dom[a])) - 1) & FULL)) return false;
          break;
        }
      }
    }
  }
  return true;
}
const solved = (dom) => dom.every(single);

/* ---------- Генератор ---------- */
function generate(level, seed) {
  const L = LEVELS[level], N = L.N, K = CATS.length, rng = RNG(seed);
  const pos = [];
  for (let c = 0; c < K; c++) { const perm = rng.shuffle([...Array(N).keys()]); for (let i = 0; i < N; i++) pos[c * N + i] = perm[i]; }
  const pool = [];
  const nv = N * K;
  for (let a = 0; a < nv; a++) {
    const ca = Math.floor(a / N);
    pool.push({ t: 'pos', a, p: pos[a] });
    for (let p = 0; p < N; p++) if (p !== pos[a] && rng.f() < 0.35) pool.push({ t: 'notPos', a, p });
    for (let b = 0; b < nv; b++) {
      if (b === a || Math.floor(b / N) === ca) continue;
      if (a < b) {
        if (pos[a] === pos[b]) pool.push({ t: 'same', a, b });
        else if (rng.f() < 0.25) pool.push({ t: 'notSame', a, b });
        if (Math.abs(pos[a] - pos[b]) === 1) pool.push({ t: 'next', a, b });
      }
      if (pos[b] === pos[a] + 1) pool.push({ t: 'left', a, b });
      if (pos[a] < pos[b] && pos[b] - pos[a] > 1) pool.push({ t: 'before', a, b });
    }
  }
  // «Сразу слева» и «где-то левее» не дублируют друг друга: before берём только для разрыва > 1.
  const weighted = rng.shuffle(pool.map((cl) => ({ cl, k: Math.pow(rng.f(), 1 / (L.w[cl.t] || 0.1)) }))).sort((x, y) => y.k - x.k).map((x) => x.cl);
  const fresh = () => new Uint8Array(nv).fill((1 << N) - 1);
  const clues = [];
  let dom = fresh();
  for (const cl of weighted) {
    const test = dom.slice();
    if (!applyAll(test, [cl], N, K)) continue;
    const before = dom.join();
    applyAll(test, clues.concat([cl]), N, K);
    if (test.join() === before) continue;  // подсказка ничего не добавила бы
    clues.push(cl);
    dom = fresh();
    applyAll(dom, clues, N, K);
    if (solved(dom)) break;
  }
  // Минимизация: выкидываем лишние подсказки, пока задача решается логикой
  for (let i = clues.length - 1; i >= 0; i--) {
    const rest = clues.slice(0, i).concat(clues.slice(i + 1));
    const d = fresh();
    if (applyAll(d, rest, N, K) && solved(d)) clues.splice(i, 1);
  }
  rng.shuffle(clues);
  return { N, K, level, seed, pos, clues };
}

/* ---------- Тексты подсказок-условий ---------- */
const ORD = { 2: 'вторым', 3: 'третьим', 4: 'четвёртым', 5: 'пятым' };
function posPhrase(p, N) {
  if (p === 0) return 'крайним слева';
  if (p === N - 1) return 'крайним справа';
  if (N % 2 === 1 && p === (N - 1) / 2) return 'посередине';
  return `${ORD[p + 1]} слева`;
}
function clueText(cl) {
  let A = valOf(cl.a), B = cl.b !== undefined ? valOf(cl.b) : null;
  const N = G.N;
  switch (cl.t) {
    case 'same':
    case 'notSame': {
      if (B.cat.key === 'color') [A, B] = [B, A];
      const neg = cl.t === 'notSame';
      return cap(`${A.cat.loc(A.d)} ${neg ? B.cat.Fn(B.d) : B.cat.F(B.d)}.`);
    }
    case 'pos': return cap(`${A.cat.Hs(A.d)} стоит ${posPhrase(cl.p, N)}.`);
    case 'notPos': return cap(`${A.cat.Hs(A.d)} стоит не ${posPhrase(cl.p, N)}.`);
    case 'left': return cap(`${A.cat.Hs(A.d)} стоит сразу слева от ${B.cat.Hg(B.d)}.`);
    case 'next': return cap(`${A.cat.Hs(A.d)} и ${B.cat.Hs(B.d)} — соседи.`);
    case 'before': return cap(`${A.cat.Hs(A.d)} стоит где-то левее ${B.cat.Hg(B.d)}.`);
  }
  return '';
}
const CLUE_GLYPH = { same: '=', notSame: '≠', pos: '№', notPos: '≠', left: '→', next: '↔', before: '<' };

/* ================================================================
   Объяснимые шаги (подсказка)
   ================================================================ */
function nextStep(dom) {
  const { N, K, clues } = G;
  const FULL = (1 << N) - 1;
  const at = (v, p) => { const x = valOf(v); return x.cat.at(x.d, p + 1); };
  const notAt = (v, p) => { const x = valOf(v); return x.cat.notAt(x.d, p + 1); };
  const q = (i) => `Подсказка ${i + 1}: «${clueText(clues[i]).replace(/\.$/, '')}».`;
  const step = (text, removes, clue = -1) => ({ text, removes, clue });
  // 1. Прямые указания места
  for (let i = 0; i < clues.length; i++) {
    const cl = clues[i];
    if (cl.t === 'pos' && dom[cl.a] !== bit(cl.p)) {
      const rm = [];
      for (let p = 0; p < N; p++) if (p !== cl.p && dom[cl.a] & bit(p)) rm.push([cl.a, p]);
      if (rm.length) return step(`${q(i)} Значит, ${lc(at(cl.a, cl.p))}.`, rm, i);
    }
  }
  // 2. Единственные варианты
  for (let c = 0; c < K; c++) {
    for (let j = 0; j < N; j++) {
      const v = c * N + j;
      if (single(dom[v])) {
        const p = lowBit(dom[v]), rm = [];
        for (let k = 0; k < N; k++) if (k !== j && dom[c * N + k] & bit(p)) rm.push([c * N + k, p]);
        if (rm.length) return step(`Для ${valOf(v).d.gen} остался только дом ${p + 1}. Значит, ${lc(at(v, p))}, и других ${CATS[c].plural} там нет.`, rm);
      }
    }
    for (let p = 0; p < N; p++) {
      let cnt = 0, last = -1;
      for (let j = 0; j < N; j++) if (dom[c * N + j] & bit(p)) { cnt++; last = j; }
      const v = c * N + last;
      if (cnt === 1 && dom[v] !== bit(p)) {
        const rm = [];
        for (let k = 0; k < N; k++) if (k !== p && dom[v] & bit(k)) rm.push([v, k]);
        return step(`В доме ${p + 1} из всех ${CATS[c].plural} подходит только ${valOf(v).d.label}. Значит, в других домах ${valOf(v).d.gen} нет.`, rm);
      }
    }
  }
  // 3. Остальные условия — по одному исключению за шаг
  for (let i = 0; i < clues.length; i++) {
    const cl = clues[i], a = cl.a, b = cl.b;
    switch (cl.t) {
      case 'notPos':
        if (dom[a] & bit(cl.p)) return step(`${q(i)} Значит, ${notAt(a, cl.p)}.`, [[a, cl.p]], i);
        break;
      case 'same':
        for (let p = 0; p < N; p++) {
          if (dom[b] & bit(p) && !(dom[a] & bit(p))) return step(`${q(i)} Раз ${notAt(a, p)}, то и ${notAt(b, p)}.`, [[b, p]], i);
          if (dom[a] & bit(p) && !(dom[b] & bit(p))) return step(`${q(i)} Раз ${notAt(b, p)}, то и ${notAt(a, p)}.`, [[a, p]], i);
        }
        break;
      case 'notSame':
        if (single(dom[a]) && dom[b] & dom[a]) { const p = lowBit(dom[a]); return step(`${q(i)} ${cap(at(a, p))}, поэтому ${notAt(b, p)}.`, [[b, p]], i); }
        if (single(dom[b]) && dom[a] & dom[b]) { const p = lowBit(dom[b]); return step(`${q(i)} ${cap(at(b, p))}, поэтому ${notAt(a, p)}.`, [[a, p]], i); }
        break;
      case 'left':
        for (let p = 0; p < N; p++) {
          if (dom[a] & bit(p) && !(dom[b] & bit(p + 1))) {
            const why = p === N - 1 ? `Справа от дома ${N} домов нет` : cap(notAt(b, p + 1));
            return step(`${q(i)} ${why}, значит, ${notAt(a, p)}.`, [[a, p]], i);
          }
          if (dom[b] & bit(p) && (p === 0 || !(dom[a] & bit(p - 1)))) {
            const why = p === 0 ? 'Слева от дома 1 домов нет' : cap(notAt(a, p - 1));
            return step(`${q(i)} ${why}, значит, ${notAt(b, p)}.`, [[b, p]], i);
          }
        }
        break;
      case 'next': {
        const nb = (x) => ((x << 1) | (x >> 1)) & FULL;
        for (let p = 0; p < N; p++) {
          if (dom[a] & bit(p) && !(nb(bit(p)) & dom[b])) return step(`${q(i)} Ни в одном соседнем с домом ${p + 1} доме не может быть ${valOf(b).d.gen}, значит, ${notAt(a, p)}.`, [[a, p]], i);
          if (dom[b] & bit(p) && !(nb(bit(p)) & dom[a])) return step(`${q(i)} Ни в одном соседнем с домом ${p + 1} доме не может быть ${valOf(a).d.gen}, значит, ${notAt(b, p)}.`, [[b, p]], i);
        }
        break;
      }
      case 'before': {
        const maxB = highBit(dom[b]), minA = lowBit(dom[a]);
        for (let p = maxB; p < N; p++) if (dom[a] & bit(p)) return step(`${q(i)} Самое правое возможное место для ${valOf(b).d.gen} — дом ${maxB + 1}, значит, ${notAt(a, p)}.`, [[a, p]], i);
        for (let p = 0; p <= minA; p++) if (dom[b] & bit(p)) return step(`${q(i)} Самое левое возможное место для ${valOf(a).d.gen} — дом ${minA + 1}, значит, ${notAt(b, p)}.`, [[b, p]], i);
        break;
      }
    }
  }
  return null;
}

/* ================================================================
   Иконки
   ================================================================ */
const PET_SVG = {
  cat: '<path d="M4.6 3.8 8.4 7.6a8.3 8.3 0 0 1 7.2 0l3.8-3.8.6 7.8a8 8 0 1 1-16 0z"/><circle cx="9.3" cy="12.6" r="1.25" fill="#fff"/><circle cx="14.7" cy="12.6" r="1.25" fill="#fff"/><path d="M11 15.6h2l-1 1.1z" fill="#fff"/>',
  dog: '<path d="M6.6 5.2C8.2 3.9 10 3.4 12 3.4s3.8.5 5.4 1.8c1.9-.9 3.9.1 4.1 2 .3 2.5-.8 4.6-2.6 5.6.1.5.1.9.1 1.4 0 3.9-3.1 6.9-7 6.9s-7-3-7-6.9c0-.5 0-.9.1-1.4C3.3 11.8 2.2 9.7 2.5 7.2c.2-1.9 2.2-2.9 4.1-2z"/><circle cx="9.4" cy="11.8" r="1.2" fill="#fff"/><circle cx="14.6" cy="11.8" r="1.2" fill="#fff"/><ellipse cx="12" cy="15.4" rx="1.9" ry="1.3" fill="#fff"/>',
  fish: '<path d="M1.8 12c2.9-4.3 6.8-6.2 10.5-6.2 3.6 0 6.2 2.2 7.8 3.6L22.6 7v10l-2.5-2.4c-1.6 1.4-4.2 3.6-7.8 3.6C8.6 18.2 4.7 16.3 1.8 12z"/><circle cx="7.4" cy="11" r="1.3" fill="#fff"/><path d="M11 8.4c1.2 1 1.8 2.2 1.8 3.6s-.6 2.6-1.8 3.6" fill="none" stroke="#fff" stroke-width="1.2"/>',
  bird: '<path d="M15 2.8c-3.6 0-6.3 2.8-6.3 6.4v1.6L4.3 15.2c-1 1.1-1.1 2.7-.4 4l4.6-2.7 1.4 4.7h2.2l-.4-4.7c3.9-.5 6.5-3.6 6.5-7.3V8.3l2.9-1.4C20.4 4.4 18 2.8 15 2.8z"/><circle cx="15.4" cy="7.3" r="1.25" fill="#fff"/>',
  hog: '<path d="M2.6 17.8c.2-4.8 3.7-8.8 8.8-8.8.9 0 1.8.1 2.6.4l.9-2.9 1.5 2.8 1.9-2.1.2 3.1 2.6-.9-1 2.8c1.4 1.2 2.2 2.9 2.4 4.9.1.9-.6 1.7-1.5 1.7H4.1c-.8 0-1.5-.6-1.5-1z"/><circle cx="18.2" cy="14.4" r="1.1" fill="#fff"/><circle cx="21.2" cy="16.9" r="1" fill="#fff"/>',
  rabbit: '<path d="M8.4 1.8c1.3 0 2.1 1.9 2.1 4.6v2.4c.5-.1 1-.2 1.5-.2s1 .1 1.5.2V6.4c0-2.7.8-4.6 2.1-4.6s2.1 1.9 2.1 4.6c0 1.8-.4 3.3-1 4.3 1.2 1.2 2 2.9 2 4.8 0 3.8-3.1 6.9-6.7 6.9S5.3 19.3 5.3 15.5c0-1.9.8-3.6 2-4.8-.6-1-1-2.5-1-4.3 0-2.7.8-4.6 2.1-4.6z"/><circle cx="9.6" cy="14.6" r="1.15" fill="#fff"/><circle cx="14.4" cy="14.6" r="1.15" fill="#fff"/>',
};
function petIcon(k) { return `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${PET_SVG[k]}</svg>`; }
function drinkIcon(d) {
  if (d.cup) return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 2.8c-.8 1 .8 1.6 0 2.6M12 2.8c-.8 1 .8 1.6 0 2.6" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M3.5 8h14v5.2a6.3 6.3 0 0 1-6.3 6.3H9.8a6.3 6.3 0 0 1-6.3-6.3z" fill="${d.liquid}" stroke="currentColor" stroke-width="1.6"/><path d="M17.5 10h1.6a2.6 2.6 0 0 1 0 5.2h-1.9" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M5 21.2h11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.4 9.2h9.2l-1 10.4a1.3 1.3 0 0 1-1.3 1.2H9.7a1.3 1.3 0 0 1-1.3-1.2z" fill="${d.liquid}"/><path d="M5.6 3.4h12.8l-1.8 16.3a2 2 0 0 1-2 1.8H9.4a2 2 0 0 1-2-1.8z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
}
function chipFace(c, d) {
  switch (CATS[c].key) {
    case 'color': return `<i class="dot" style="--c:${d.hex}"></i>`;
    case 'name': return `<i class="ltr">${d.label[0]}</i>`;
    case 'pet': return `<i class="ico pet">${petIcon(d.icon)}</i>`;
    case 'drink': return `<i class="ico drink">${drinkIcon(d)}</i>`;
  }
  return '';
}

/* ================================================================
   Игра и интерфейс
   ================================================================ */
const ui = {
  board: $('#board'), street: $('#street'), clues: $('#clues'), hint: $('#hint'), hintText: $('#hintText'), hintApply: $('#hintApply'),
  hintClose: $('#hintClose'), timer: $('#timer'), num: $('#num'), levels: $('#levels'), newBtn: $('#newBtn'), hintBtn: $('#hintBtn'),
  undoBtn: $('#undoBtn'), checkBtn: $('#checkBtn'), auto: $('#auto'), win: $('#win'), winText: $('#winText'), winNext: $('#winNext'),
  sheet: $('#sheet'), sheetTitle: $('#sheetTitle'), sheetChips: $('#sheetChips'), sheetClose: $('#sheetClose'), toast: $('#toast'),
  legend: $('#legend'), progress: $('#progress'),
};
let level = 'medium', dom = null, undo = [], used = new Set(), hints = 0, startAt = 0, doneAt = 0, pendingStep = null, autoX = true;
let highlight = { cells: [], clue: -1 };

function save() {
  try { localStorage.setItem('deduction.v1', JSON.stringify({ level, seed: G.seed, dom: [...dom], used: [...used], hints, elapsed: (doneAt || performance.now()) - startAt, autoX })); } catch (e) { /* приватный режим */ }
}
function load() {
  try { return JSON.parse(localStorage.getItem('deduction.v1') || 'null'); } catch (e) { return null; }
}
function newGame(lv, seed, restore) {
  level = lv;
  G = generate(lv, seed ?? ((Math.random() * 1e9) >>> 0));
  dom = new Uint8Array(G.N * G.K).fill((1 << G.N) - 1);
  undo = []; used = new Set(); hints = 0; doneAt = 0; pendingStep = null;
  startAt = performance.now();
  if (restore && restore.dom && restore.dom.length === dom.length) {
    dom = Uint8Array.from(restore.dom); used = new Set(restore.used || []); hints = restore.hints || 0;
    startAt = performance.now() - (restore.elapsed || 0);
  }
  highlight = { cells: [], clue: -1 };
  ui.num.textContent = `№ ${String(G.seed % 100000).padStart(5, '0')}`;
  ui.levels.querySelectorAll('[data-lv]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lv === lv)));
  document.documentElement.style.setProperty('--n', G.N);
  hideHint(); ui.win.classList.remove('on'); ui.win.hidden = true;
  renderClues(); renderLegend(); render();
  save();
}

/* ---------- Действия игрока ---------- */
function pushUndo() { undo.push(dom.slice()); if (undo.length > 200) undo.shift(); }
function autoProp() {
  if (!autoX) return;
  const N = G.N;
  let changed = true;
  while (changed) {
    changed = false;
    for (let c = 0; c < G.K; c++) {
      for (let i = 0; i < N; i++) {
        const d = dom[c * N + i];
        if (single(d)) for (let j = 0; j < N; j++) if (j !== i && dom[c * N + j] & d && popcount(dom[c * N + j]) > 1) { dom[c * N + j] &= ~d; changed = true; }
      }
      for (let p = 0; p < N; p++) {
        const cand = [];
        for (let i = 0; i < N; i++) if (dom[c * N + i] & bit(p)) cand.push(i);
        if (cand.length === 1 && dom[c * N + cand[0]] !== bit(p)) { dom[c * N + cand[0]] = bit(p); changed = true; }
      }
    }
  }
}
function cellCands(c, p) { const r = []; for (let i = 0; i < G.N; i++) if (dom[c * G.N + i] & bit(p)) r.push(i); return r; }
function eliminate(c, i, p) {
  const v = c * G.N + i;
  if (!(dom[v] & bit(p))) { // вернуть вычеркнутое
    pushUndo(); dom[v] |= bit(p); after(); return;
  }
  if (cellCands(c, p).length <= 1 || popcount(dom[v]) <= 1) { shake(c, p); return; }
  pushUndo(); dom[v] &= ~bit(p); autoProp(); after();
}
function choose(c, i, p) {
  const v = c * G.N + i;
  if (!(dom[v] & bit(p))) { shake(c, p); return; }
  pushUndo();
  for (let j = 0; j < G.N; j++) if (j !== i) dom[c * G.N + j] &= ~bit(p);
  if (autoX) dom[v] = bit(p);
  autoProp(); after();
}
function after() {
  if (pendingStep) hideHint();
  render();
  if (!doneAt && dom.every((d, v) => d === bit(G.pos[v]))) win();
  save();
}
function shake(c, p) {
  const el = ui.board.querySelector(`.cell[data-c="${c}"][data-p="${p}"]`);
  if (el) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }
}
function mistakes() {
  const bad = [];
  for (let v = 0; v < dom.length; v++) if (!(dom[v] & bit(G.pos[v]))) bad.push([v, G.pos[v]]);
  return bad;
}

/* ---------- Подсказка ---------- */
function showHint() {
  const bad = mistakes();
  if (bad.length) {
    const [v, p] = bad[0], x = valOf(v);
    pendingStep = { fix: bad, text: `Где-то закралась ошибка: в доме ${p + 1} вычеркнут вариант «${x.d.label}», а он верный. Вернуть его?` };
    highlight = { cells: bad.map(([vv, pp]) => [vv, pp]), clue: -1 };
  } else {
    const st = nextStep(dom);
    if (!st) return;
    pendingStep = st;
    highlight = { cells: st.removes, clue: st.clue };
  }
  hints++;
  ui.hintText.textContent = pendingStep.text;
  ui.hint.hidden = false;
  requestAnimationFrame(() => ui.hint.classList.add('on'));
  render();
  renderClues();
  if (highlight.clue >= 0) ui.clues.querySelector(`[data-i="${highlight.clue}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
function hideHint() {
  pendingStep = null;
  highlight = { cells: [], clue: -1 };
  ui.hint.classList.remove('on');
  ui.hint.hidden = true;
  renderClues();
}
function applyHint() {
  if (!pendingStep) return;
  pushUndo();
  if (pendingStep.fix) for (const [v, p] of pendingStep.fix) dom[v] |= bit(p);
  else for (const [v, p] of pendingStep.removes) dom[v] &= ~bit(p);
  autoProp();
  hideHint();
  after();
}

/* ---------- Рендер ---------- */
function renderLegend() {
  ui.legend.innerHTML = CATS.map((cat, c) => `<div class="lg"><b style="--cc:${cat.color}">${cat.name}</b>${cat.vals.slice(0, G.N).map((d) => `<span class="lg-item">${chipFace(c, d)}${d.label}</span>`).join('')}</div>`).join('');
}
function renderClues() {
  ui.clues.innerHTML = G.clues.map((cl, i) => `<li><button type="button" class="clue${used.has(i) ? ' used' : ''}${highlight.clue === i ? ' hl' : ''}" data-i="${i}" aria-pressed="${used.has(i)}"><b>${i + 1}</b><span>${clueText(cl)}</span><em aria-hidden="true">${CLUE_GLYPH[cl.t]}</em></button></li>`).join('');
}
function houseSVG() {
  const N = G.N, W = 132, Hh = 150;
  const resolved = (c, p) => { const cc = cellCands(c, p); return cc.length === 1 ? CATS[c].vals[cc[0]] : null; };
  let s = `<svg viewBox="0 0 ${N * W} ${Hh}" preserveAspectRatio="xMidYMax meet" aria-hidden="true">`;
  s += `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${doneAt ? '#2B2A55' : '#D7E8FF'}"/><stop offset="1" stop-color="${doneAt ? '#6C5B9E' : '#FBF6EC'}"/></linearGradient></defs>`;
  s += `<rect x="0" y="0" width="${N * W}" height="${Hh - 7}" rx="16" fill="url(#sky)"/>`;
  s += doneAt ? `<circle cx="${N * W - 44}" cy="28" r="13" fill="#FFF3C4"/>` : `<circle cx="${N * W - 44}" cy="30" r="15" fill="#FFD66B"/>`;
  for (const [cx, cy, k] of [[W * 0.55, 22, 1], [W * (N - 1.6), 40, 0.8], [W * 2.2, 14, 0.7]]) {
    s += `<g fill="#fff" opacity="${doneAt ? 0.18 : 0.9}"><ellipse cx="${cx}" cy="${cy}" rx="${22 * k}" ry="${8 * k}"/><ellipse cx="${cx + 12 * k}" cy="${cy - 5 * k}" rx="${13 * k}" ry="${9 * k}"/></g>`;
  }
  for (let p = 0; p <= N; p++) {
    const bx = p * W;
    s += `<path d="M${bx - 16} ${Hh - 7}a16 14 0 0 1 32 0z" fill="#4CA36C" stroke="#1F1B2D" stroke-width="2"/>`;
  }
  s += `<path d="M0 ${Hh - 7}H${N * W}" stroke="#1F1B2D" stroke-width="3"/>`;
  for (let p = 0; p < N; p++) {
    const x = p * W + 12, w = W - 24, top = 58, bot = Hh - 8;
    const col = resolved(0, p), nm = resolved(1, p), pet = resolved(2, p), dr = resolved(3, p);
    const fill = col ? col.hex : '#FFFDF8';
    const dash = col ? '' : ' stroke-dasharray="5 4"';
    const lit = doneAt ? ' class="lit"' : '';
    s += `<g${lit} style="--d:${p * 90}ms">`;
    s += `<path d="M${x - 6} ${top}L${x + w / 2} ${top - 44}L${x + w + 6} ${top}z" fill="${col ? '#1F1B2D' : '#FFFDF8'}" stroke="#1F1B2D" stroke-width="2.5" stroke-linejoin="round"${dash}/>`;
    s += `<circle cx="${x + w / 2}" cy="${top - 18}" r="11" fill="#FFFDF8" stroke="#1F1B2D" stroke-width="2"/><text x="${x + w / 2}" y="${top - 13.5}" text-anchor="middle" class="hn">${p + 1}</text>`;
    s += `<rect x="${x}" y="${top}" width="${w}" height="${bot - top}" fill="${fill}" stroke="#1F1B2D" stroke-width="2.5"${dash}/>`;
    // окно с питомцем
    s += `<rect class="win" x="${x + 10}" y="${top + 12}" width="40" height="36" rx="3" fill="${pet ? '#FFF3C4' : '#E8E2D6'}" stroke="#1F1B2D" stroke-width="2"/>`;
    if (pet) s += `<g transform="translate(${x + 16} ${top + 17}) scale(1.15)" fill="#1F1B2D" style="color:#1F1B2D">${PET_SVG[pet.icon]}</g>`;
    else s += `<text x="${x + 30}" y="${top + 36}" text-anchor="middle" class="q">?</text>`;
    // дверь и табличка
    s += `<rect x="${x + w - 38}" y="${bot - 46}" width="26" height="46" rx="2" fill="#FFFDF8" stroke="#1F1B2D" stroke-width="2"/>`;
    s += `<rect x="${x + w - 46}" y="${top + 12}" width="42" height="18" rx="3" fill="#FFFDF8" stroke="#1F1B2D" stroke-width="1.6"/>`;
    s += `<text x="${x + w - 25}" y="${top + 25.5}" text-anchor="middle" class="nm">${nm ? nm.label : '…'}</text>`;
    // напиток на крыльце
    if (dr) s += `<g transform="translate(${x + 12} ${bot - 30}) scale(1.05)" style="color:#1F1B2D">${drinkIcon(dr).replace(/<\/?svg[^>]*>/g, '')}</g>`;
    s += `</g>`;
  }
  return s + '</svg>';
}
function render() {
  const N = G.N;
  ui.street.innerHTML = houseSVG();
  const hl = new Set(highlight.cells.map(([v, p]) => `${Math.floor(v / N)}:${p}:${v % N}`));
  const hlCell = new Set(highlight.cells.map(([v, p]) => `${Math.floor(v / N)}:${p}`));
  let html = '';
  for (let c = 0; c < G.K; c++) {
    const mini = CATS[c].vals.slice(0, N).map((d) => `<li>${chipFace(c, d)}<span>${d.label}</span></li>`).join('');
    html += `<div class="row"><div class="rh" style="--cc:${CATS[c].color}"><span class="rh-name">${CATS[c].name}</span><ul class="mini">${mini}</ul></div>`;
    for (let p = 0; p < N; p++) {
      const cands = cellCands(c, p);
      const one = cands.length === 1;
      html += `<div class="cell${one ? ' one' : ''}${hlCell.has(`${c}:${p}`) ? ' hl' : ''}" data-c="${c}" data-p="${p}" role="group" aria-label="Дом ${p + 1}, ${CATS[c].name.toLowerCase()}">`;
      for (let i = 0; i < N; i++) {
        const d = CATS[c].vals[i];
        const on = !!(dom[c * N + i] & bit(p));
        if (one && !on) continue;
        html += `<button type="button" class="chip${on ? '' : ' off'}${hl.has(`${c}:${p}:${i}`) ? ' mark' : ''}" data-c="${c}" data-i="${i}" data-p="${p}" title="${cap(d.label)}${one ? '' : on ? ' — клик вычеркнуть, двойной клик выбрать' : ' — вычеркнут, клик вернуть'}" aria-label="${cap(d.label)}${on ? '' : ', вычеркнут'}">${chipFace(c, d)}</button>`;
      }
      html += `</div>`;
    }
    html += `</div>`;
  }
  ui.board.innerHTML = html;
  const total = N * N * G.K, left = dom.reduce((a, d) => a + popcount(d), 0);
  const pct = Math.round(((total - left) / (total - N * G.K)) * 100);
  ui.progress.style.setProperty('--p', pct / 100);
  ui.progress.querySelector('span').textContent = `${pct}%`;
}

/* ---------- Победа ---------- */
function fmtTime(ms) { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
function win() {
  doneAt = performance.now();
  render();
  ui.winText.textContent = `${LEVELS[level].name} задача решена за ${fmtTime(doneAt - startAt)}. ${hints ? `Подсказок: ${hints}.` : 'Без единой подсказки!'}`;
  ui.win.hidden = false;
  requestAnimationFrame(() => ui.win.classList.add('on'));
  confetti();
}
function confetti() {
  const cv = $('#confetti'), g = cv.getContext('2d');
  const dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
  const cols = ['#E5484D', '#3E63DD', '#F5C63C', '#30A46C', '#8E4EC6', '#F76707'];
  const parts = Array.from({ length: 140 }, () => ({ x: Math.random() * cv.width, y: -Math.random() * cv.height * 0.5, vx: (Math.random() - 0.5) * 2 * dpr, vy: (2 + Math.random() * 3) * dpr, r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.2, s: (5 + Math.random() * 6) * dpr, c: cols[Math.floor(Math.random() * cols.length)], k: Math.random() < 0.5 }));
  const t0 = performance.now();
  (function tick(now) {
    g.clearRect(0, 0, cv.width, cv.height);
    for (const p of parts) {
      p.x += p.vx; p.y += p.vy; p.r += p.vr; p.vy += 0.03 * dpr;
      g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c;
      if (p.k) g.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); else { g.beginPath(); g.moveTo(0, -p.s / 2); g.lineTo(p.s / 2, p.s / 2); g.lineTo(-p.s / 2, p.s / 2); g.fill(); }
      g.restore();
    }
    if (now - t0 < 4200) requestAnimationFrame(tick); else g.clearRect(0, 0, cv.width, cv.height);
  })(t0);
}

/* ---------- Мобильный выбор: шторка ---------- */
const mobile = () => window.matchMedia('(max-width: 760px)').matches;
let sheetCell = null;
function openSheet(c, p) {
  sheetCell = [c, p];
  ui.sheetTitle.textContent = `Дом ${p + 1} · ${CATS[c].name}`;
  renderSheet();
  ui.sheet.hidden = false;
  requestAnimationFrame(() => ui.sheet.classList.add('on'));
}
function renderSheet() {
  if (!sheetCell) return;
  const [c, p] = sheetCell;
  ui.sheetChips.innerHTML = CATS[c].vals.slice(0, G.N).map((d, i) => {
    const on = !!(dom[c * G.N + i] & bit(p));
    return `<div class="sh-item${on ? '' : ' off'}"><button type="button" class="sh-main" data-i="${i}" data-act="toggle">${chipFace(c, d)}<span>${cap(d.label)}</span></button><button type="button" class="sh-pick" data-i="${i}" data-act="pick"${on ? '' : ' disabled'}>Здесь</button></div>`;
  }).join('');
}
function closeSheet() { ui.sheet.classList.remove('on'); ui.sheet.hidden = true; sheetCell = null; }

/* ---------- События ---------- */
let clickTimer = 0, lastChip = null;
ui.board.addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  const cell = e.target.closest('.cell');
  if (mobile()) { if (cell) openSheet(+cell.dataset.c, +cell.dataset.p); return; }
  if (!chip) return;
  const c = +chip.dataset.c, i = +chip.dataset.i, p = +chip.dataset.p;
  if (chip.closest('.cell').classList.contains('one')) return;
  // одинарный клик — вычеркнуть, двойной — выбрать
  if (lastChip === chip && clickTimer) { clearTimeout(clickTimer); clickTimer = 0; lastChip = null; choose(c, i, p); return; }
  lastChip = chip;
  clickTimer = setTimeout(() => { clickTimer = 0; lastChip = null; eliminate(c, i, p); }, 230);
});
ui.board.addEventListener('contextmenu', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  e.preventDefault();
  choose(+chip.dataset.c, +chip.dataset.i, +chip.dataset.p);
});
ui.sheetChips.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || !sheetCell) return;
  const [c, p] = sheetCell, i = +b.dataset.i;
  if (b.dataset.act === 'pick') { choose(c, i, p); closeSheet(); }
  else { eliminate(c, i, p); renderSheet(); }
});
ui.sheetClose.addEventListener('click', closeSheet);
ui.sheet.addEventListener('click', (e) => { if (e.target === ui.sheet) closeSheet(); });
ui.clues.addEventListener('click', (e) => {
  const b = e.target.closest('.clue');
  if (!b) return;
  const i = +b.dataset.i;
  if (used.has(i)) used.delete(i); else used.add(i);
  renderClues();
  save();
});
ui.levels.addEventListener('click', (e) => { const b = e.target.closest('[data-lv]'); if (b) newGame(b.dataset.lv); });
ui.newBtn.addEventListener('click', () => newGame(level));
ui.hintBtn.addEventListener('click', () => (pendingStep ? hideHint() : showHint()));
ui.hintApply.addEventListener('click', applyHint);
ui.hintClose.addEventListener('click', () => { hideHint(); render(); });
ui.undoBtn.addEventListener('click', () => { if (!undo.length) return; dom = undo.pop(); hideHint(); render(); save(); });
ui.checkBtn.addEventListener('click', () => {
  const bad = mistakes();
  if (!bad.length) { toast('Ошибок нет — всё вычеркнутое действительно лишнее'); return; }
  toast(`Ошибок: ${bad.length}. Они подсвечены`);
  highlight = { cells: bad, clue: -1 };
  render();
  setTimeout(() => { highlight = { cells: [], clue: -1 }; render(); }, 2600);
});
ui.auto.addEventListener('click', () => { autoX = !autoX; ui.auto.setAttribute('aria-pressed', String(autoX)); if (autoX) { autoProp(); render(); } save(); });
ui.winNext.addEventListener('click', () => newGame(level));
document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'h' || e.key === 'р') ui.hintBtn.click();
  else if (e.key === 'z' || e.key === 'я') ui.undoBtn.click();
  else if (e.key === 'Escape') { hideHint(); closeSheet(); render(); }
});
let toastT = 0;
function toast(msg) { ui.toast.textContent = msg; ui.toast.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => ui.toast.classList.remove('on'), 2400); }
setInterval(() => { if (G) ui.timer.textContent = fmtTime((doneAt || performance.now()) - startAt); }, 500);
document.addEventListener('visibilitychange', save);

/* ---------- Старт ---------- */
const saved = load();
if (saved && LEVELS[saved.level]) { autoX = saved.autoX !== false; newGame(saved.level, saved.seed, saved); }
else newGame('medium', 48217);
ui.auto.setAttribute('aria-pressed', String(autoX));
window.__deduction = { nextStep: () => nextStep(dom), G: () => G, solveAll() { let s; while ((s = nextStep(dom))) { for (const [v, p] of s.removes) dom[v] &= ~bit(p); } render(); return dom.every(single); } };
})();
