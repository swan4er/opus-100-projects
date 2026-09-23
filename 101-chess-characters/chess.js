/* ================================================================
   chess.js — полные правила шахмат и простой движок.
   Всё завёрнуто в одну фабрику: тот же код без изменений запускается
   и на странице, и в Web Worker (через ChessFactory.toString()).

   Доска — Int8Array(64): a1 = 0, h1 = 7, a8 = 56, h8 = 63.
   Фигуры: 1 пешка, 2 конь, 3 слон, 4 ладья, 5 ферзь, 6 король; чёрные — со знаком минус.
   Ход: { from, to, p (кто ходит), cap (кого берёт), promo, flag }
     flag: 0 обычный, 1 пешка на два поля, 2 взятие на проходе, 3 рокировка короткая, 4 длинная.
   ================================================================ */
function ChessFactory(root) {
  'use strict';
  const P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6;
  const VAL = [0, 100, 320, 330, 500, 900, 0];
  const MATE = 100000;

  const sqName = (s) => 'abcdefgh'[s & 7] + ((s >> 3) + 1);
  const sqIdx = (n) => (n.charCodeAt(0) - 97) + (n.charCodeAt(1) - 49) * 8;

  // ---------- заранее посчитанные прыжки и лучи ----------
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]; // 0–3 прямые, 4–7 диагонали
  const KN = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
  const knightT = [], kingT = [], rays = [];
  for (let s = 0; s < 64; s++) {
    const f = s & 7, r = s >> 3;
    const jump = (list) => list.map(([df, dr]) => [f + df, r + dr]).filter(([a, b]) => a >= 0 && a < 8 && b >= 0 && b < 8).map(([a, b]) => b * 8 + a);
    knightT[s] = jump(KN);
    kingT[s] = jump(DIRS);
    rays[s] = DIRS.map(([df, dr]) => {
      const out = [];
      for (let a = f + df, b = r + dr; a >= 0 && a < 8 && b >= 0 && b < 8; a += df, b += dr) out.push(b * 8 + a);
      return out;
    });
  }
  // маска прав рокировки: ход с этих полей или на них гасит права
  const CR = new Uint8Array(64).fill(15);
  CR[0] = 15 & ~2; CR[7] = 15 & ~1; CR[4] = 15 & ~3;
  CR[56] = 15 & ~8; CR[63] = 15 & ~4; CR[60] = 15 & ~12;

  // ---------- позиция ----------
  function create() {
    const b = new Int8Array(64);
    const back = [R, N, B, Q, K, B, N, R];
    for (let f = 0; f < 8; f++) { b[f] = back[f]; b[8 + f] = P; b[48 + f] = -P; b[56 + f] = -back[f]; }
    const s = { b, turn: 1, castle: 15, ep: -1, half: 0, full: 1, k: [4, 60], hist: [], ids: null };
    s.hist.push(keyOf(s));
    return s;
  }

  function fromFEN(fen) {
    const [pos, turn, cas, ep, half, full] = fen.trim().split(/\s+/);
    const b = new Int8Array(64);
    const map = { p: P, n: N, b: B, r: R, q: Q, k: K };
    const k = [-1, -1];
    let r = 7, f = 0;
    for (const ch of pos) {
      if (ch === '/') { r--; f = 0; continue; }
      if (/\d/.test(ch)) { f += +ch; continue; }
      const t = map[ch.toLowerCase()], white = ch !== ch.toLowerCase();
      b[r * 8 + f] = white ? t : -t;
      if (t === K) k[white ? 0 : 1] = r * 8 + f;
      f++;
    }
    let c = 0;
    if (cas && cas !== '-') { if (cas.includes('K')) c |= 1; if (cas.includes('Q')) c |= 2; if (cas.includes('k')) c |= 4; if (cas.includes('q')) c |= 8; }
    const s = { b, turn: turn === 'b' ? -1 : 1, castle: c, ep: ep && ep !== '-' ? sqIdx(ep) : -1, half: +half || 0, full: +full || 1, k, hist: [], ids: null };
    s.hist.push(keyOf(s));
    return s;
  }

  function toFEN(s) {
    const L = ' pnbrqk';
    let out = '';
    for (let r = 7; r >= 0; r--) {
      let empty = 0;
      for (let f = 0; f < 8; f++) {
        const p = s.b[r * 8 + f];
        if (!p) { empty++; continue; }
        if (empty) { out += empty; empty = 0; }
        out += p > 0 ? L[p].toUpperCase() : L[-p];
      }
      if (empty) out += empty;
      if (r) out += '/';
    }
    let c = '';
    if (s.castle & 1) c += 'K'; if (s.castle & 2) c += 'Q'; if (s.castle & 4) c += 'k'; if (s.castle & 8) c += 'q';
    return `${out} ${s.turn > 0 ? 'w' : 'b'} ${c || '-'} ${s.ep >= 0 ? sqName(s.ep) : '-'} ${s.half} ${s.full}`;
  }

  function clone(s) {
    return { b: new Int8Array(s.b), turn: s.turn, castle: s.castle, ep: s.ep, half: s.half, full: s.full, k: s.k.slice(), hist: s.hist.slice(), ids: s.ids ? s.ids.slice() : null };
  }

  function keyOf(s) {
    let k = '';
    for (let i = 0; i < 64; i++) k += String.fromCharCode(72 + s.b[i]);
    return k + s.turn + '.' + s.castle + '.' + s.ep;
  }

  // ---------- атаки ----------
  function attacked(s, sq, by) {
    const b = s.b, f = sq & 7, r = sq >> 3;
    if (by > 0) { if (r > 0) { if (f > 0 && b[sq - 9] === P) return true; if (f < 7 && b[sq - 7] === P) return true; } }
    else if (r < 7) { if (f > 0 && b[sq + 7] === -P) return true; if (f < 7 && b[sq + 9] === -P) return true; }
    const n = N * by, k = K * by, bb = B * by, rr = R * by, q = Q * by;
    for (const t of knightT[sq]) if (b[t] === n) return true;
    for (const t of kingT[sq]) if (b[t] === k) return true;
    const ry = rays[sq];
    for (let d = 0; d < 8; d++) {
      const ray = ry[d], slider = d < 4 ? rr : bb;
      for (let i = 0; i < ray.length; i++) {
        const p = b[ray[i]];
        if (p) { if (p === slider || p === q) return true; break; }
      }
    }
    return false;
  }

  // список полей, с которых сторона by бьёт поле sq
  function attackers(s, sq, by) {
    const b = s.b, f = sq & 7, r = sq >> 3, out = [];
    if (by > 0) { if (r > 0) { if (f > 0 && b[sq - 9] === P) out.push(sq - 9); if (f < 7 && b[sq - 7] === P) out.push(sq - 7); } }
    else if (r < 7) { if (f > 0 && b[sq + 7] === -P) out.push(sq + 7); if (f < 7 && b[sq + 9] === -P) out.push(sq + 9); }
    for (const t of knightT[sq]) if (b[t] === N * by) out.push(t);
    for (const t of kingT[sq]) if (b[t] === K * by) out.push(t);
    for (let d = 0; d < 8; d++) {
      const ray = rays[sq][d], slider = (d < 4 ? R : B) * by;
      for (let i = 0; i < ray.length; i++) {
        const p = b[ray[i]];
        if (p) { if (p === slider || p === Q * by) out.push(ray[i]); break; }
      }
    }
    return out;
  }

  const inCheck = (s, c) => attacked(s, s.k[c > 0 ? 0 : 1], -c);

  // ---------- генерация ходов ----------
  const mv = (from, to, p, cap, promo, flag) => ({ from, to, p, cap, promo, flag });
  function addPromos(out, from, to, p, cap) { for (const t of [Q, N, R, B]) out.push(mv(from, to, p, cap, t, 0)); }

  function genMoves(s, capsOnly) {
    const b = s.b, c = s.turn, out = [];
    for (let sq = 0; sq < 64; sq++) {
      const p = b[sq];
      if (!p || (p > 0) !== (c > 0)) continue;
      const t = p * c;
      if (t === P) {
        const dir = c > 0 ? 8 : -8, r = sq >> 3, f = sq & 7;
        const startR = c > 0 ? 1 : 6, promoR = c > 0 ? 6 : 1;
        const one = sq + dir;
        if ((!capsOnly || r === promoR) && !b[one]) {
          if (r === promoR) addPromos(out, sq, one, p, 0);
          else {
            out.push(mv(sq, one, p, 0, 0, 0));
            if (r === startR && !b[one + dir]) out.push(mv(sq, one + dir, p, 0, 0, 1));
          }
        }
        for (let df = -1; df <= 1; df += 2) {
          const nf = f + df;
          if (nf < 0 || nf > 7) continue;
          const to = one + df, q = b[to];
          if (q && (q > 0) !== (c > 0)) { if (r === promoR) addPromos(out, sq, to, p, q); else out.push(mv(sq, to, p, q, 0, 0)); }
          else if (!q && to === s.ep) out.push(mv(sq, to, p, -p, 0, 2));
        }
      } else if (t === N || t === K) {
        const T = t === N ? knightT[sq] : kingT[sq];
        for (const to of T) {
          const q = b[to];
          if (q && (q > 0) === (c > 0)) continue;
          if (capsOnly && !q) continue;
          out.push(mv(sq, to, p, q, 0, 0));
        }
        if (t === K && !capsOnly) castles(s, sq, c, out);
      } else {
        const d0 = t === B ? 4 : 0, d1 = t === R ? 4 : 8;
        for (let d = d0; d < d1; d++) {
          const ray = rays[sq][d];
          for (let i = 0; i < ray.length; i++) {
            const to = ray[i], q = b[to];
            if (!q) { if (!capsOnly) out.push(mv(sq, to, p, 0, 0, 0)); continue; }
            if ((q > 0) !== (c > 0)) out.push(mv(sq, to, p, q, 0, 0));
            break;
          }
        }
      }
    }
    return out;
  }

  function castles(s, sq, c, out) {
    const b = s.b;
    if (c > 0 && sq === 4) {
      if ((s.castle & 1) && !b[5] && !b[6] && b[7] === R && !attacked(s, 4, -1) && !attacked(s, 5, -1) && !attacked(s, 6, -1)) out.push(mv(4, 6, K, 0, 0, 3));
      if ((s.castle & 2) && !b[3] && !b[2] && !b[1] && b[0] === R && !attacked(s, 4, -1) && !attacked(s, 3, -1) && !attacked(s, 2, -1)) out.push(mv(4, 2, K, 0, 0, 4));
    } else if (c < 0 && sq === 60) {
      if ((s.castle & 4) && !b[61] && !b[62] && b[63] === -R && !attacked(s, 60, 1) && !attacked(s, 61, 1) && !attacked(s, 62, 1)) out.push(mv(60, 62, -K, 0, 0, 3));
      if ((s.castle & 8) && !b[59] && !b[58] && !b[57] && b[56] === -R && !attacked(s, 60, 1) && !attacked(s, 59, 1) && !attacked(s, 58, 1)) out.push(mv(60, 58, -K, 0, 0, 4));
    }
  }

  // ---------- сделать и отменить ход (ids — имена персонажей едут вместе с фигурами) ----------
  function make(s, m) {
    const b = s.b, c = m.p > 0 ? 1 : -1;
    const u = { castle: s.castle, ep: s.ep, half: s.half, capSq: m.flag === 2 ? m.to - 8 * c : m.to, idCap: null };
    b[m.from] = 0;
    if (m.flag === 2) b[u.capSq] = 0;
    b[m.to] = m.promo ? m.promo * c : m.p;
    if (m.flag === 3) { b[m.to - 1] = b[m.to + 1]; b[m.to + 1] = 0; }
    else if (m.flag === 4) { b[m.to + 1] = b[m.to - 2]; b[m.to - 2] = 0; }
    if (m.p * c === K) s.k[c > 0 ? 0 : 1] = m.to;
    s.castle &= CR[m.from] & CR[m.to];
    s.ep = m.flag === 1 ? m.from + 8 * c : -1;
    s.half = (m.p * c === P || m.cap) ? 0 : s.half + 1;
    if (c < 0) s.full++;
    s.turn = -c;
    const ids = s.ids;
    if (ids) {
      u.idCap = ids[u.capSq];
      ids[u.capSq] = null;
      ids[m.to] = ids[m.from]; ids[m.from] = null;
      if (m.flag === 3) { ids[m.to - 1] = ids[m.to + 1]; ids[m.to + 1] = null; }
      else if (m.flag === 4) { ids[m.to + 1] = ids[m.to - 2]; ids[m.to - 2] = null; }
    }
    return u;
  }

  function unmake(s, m, u) {
    const b = s.b, c = m.p > 0 ? 1 : -1;
    s.turn = c;
    if (c < 0) s.full--;
    s.castle = u.castle; s.ep = u.ep; s.half = u.half;
    b[m.from] = m.p;
    b[m.to] = 0;
    b[u.capSq] = m.cap;
    if (m.flag === 3) { b[m.to + 1] = b[m.to - 1]; b[m.to - 1] = 0; }
    else if (m.flag === 4) { b[m.to - 2] = b[m.to + 1]; b[m.to + 1] = 0; }
    if (m.p * c === K) s.k[c > 0 ? 0 : 1] = m.from;
    const ids = s.ids;
    if (ids) {
      ids[m.from] = ids[m.to]; ids[m.to] = null;
      ids[u.capSq] = u.idCap;
      if (m.flag === 3) { ids[m.to + 1] = ids[m.to - 1]; ids[m.to - 1] = null; }
      else if (m.flag === 4) { ids[m.to - 2] = ids[m.to + 1]; ids[m.to + 1] = null; }
    }
  }

  function legal(s) {
    const out = [], c = s.turn;
    for (const m of genMoves(s, false)) {
      const u = make(s, m);
      if (!attacked(s, s.k[c > 0 ? 0 : 1], -c)) out.push(m);
      unmake(s, m, u);
    }
    return out;
  }

  // настоящий ход партии: с историей для троекратного повторения
  function play(s, m) {
    const u = make(s, m);
    s.hist.push(keyOf(s));
    return u;
  }

  function insufficient(s) {
    let minor = 0, other = 0;
    for (let i = 0; i < 64; i++) {
      const t = Math.abs(s.b[i]);
      if (!t || t === K) continue;
      if (t === N || t === B) minor++; else other++;
    }
    return other === 0 && minor <= 1;
  }

  function status(s) {
    const moves = legal(s), chk = inCheck(s, s.turn);
    if (!moves.length) return chk ? { over: true, reason: 'mate', winner: -s.turn, check: true, moves } : { over: true, reason: 'stalemate', winner: 0, check: false, moves };
    if (s.half >= 100) return { over: true, reason: 'fifty', winner: 0, check: chk, moves };
    if (insufficient(s)) return { over: true, reason: 'material', winner: 0, check: chk, moves };
    const key = s.hist[s.hist.length - 1];
    let n = 0;
    for (const k of s.hist) if (k === key) n++;
    if (n >= 3) return { over: true, reason: 'repetition', winner: 0, check: chk, moves };
    return { over: false, check: chk, moves };
  }

  // ---------- запись ходов по-русски: Кf3, Сb5+, e×d5, 0-0, e8Ф# ----------
  const RU = ['', '', 'К', 'С', 'Л', 'Ф', 'Кр'];
  function san(s, m, moves) {
    const c = m.p > 0 ? 1 : -1, t = m.p * c;
    let str;
    if (m.flag === 3) str = '0-0';
    else if (m.flag === 4) str = '0-0-0';
    else {
      str = RU[t];
      if (t === P) { if (m.cap) str += sqName(m.from)[0]; }
      else {
        const others = (moves || legal(s)).filter((o) => o.p === m.p && o.to === m.to && o.from !== m.from);
        if (others.length) {
          const sameFile = others.some((o) => (o.from & 7) === (m.from & 7));
          const sameRank = others.some((o) => (o.from >> 3) === (m.from >> 3));
          str += !sameFile ? sqName(m.from)[0] : !sameRank ? sqName(m.from)[1] : sqName(m.from);
        }
      }
      if (m.cap) str += '×';
      str += sqName(m.to);
      if (m.promo) str += RU[m.promo];
    }
    const u = make(s, m);
    const chk = inCheck(s, s.turn);
    const mate = chk && legal(s).length === 0;
    unmake(s, m, u);
    return str + (mate ? '#' : chk ? '+' : '');
  }

  // ---------- оценка: материал + таблицы полей (упрощённая оценочная функция) ----------
  // таблицы записаны «как видит белый»: первая строка — восьмая горизонталь
  const PST = {
    1: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
    2: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
    3: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
    4: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
    5: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
    6: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
    7: [-50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50],
  };

  function evaluate(s) {
    const b = s.b;
    let score = 0, heavy = 0;
    for (let i = 0; i < 64; i++) { const t = Math.abs(b[i]); if (t > 1 && t < 6) heavy += VAL[t]; }
    const endgame = heavy <= 1400;
    for (let i = 0; i < 64; i++) {
      const p = b[i];
      if (!p) continue;
      const t = p > 0 ? p : -p, f = i & 7, r = i >> 3;
      const tbl = PST[t === K && endgame ? 7 : t];
      const idx = p > 0 ? (7 - r) * 8 + f : r * 8 + f;
      score += (p > 0 ? 1 : -1) * (VAL[t] + tbl[idx]);
    }
    return score;
  }

  // ---------- поиск: альфа-бета с тихим поиском и сортировкой MVV-LVA ----------
  function orderMoves(moves) {
    for (const m of moves) m.o = (m.cap ? 10000 + 10 * VAL[Math.abs(m.cap)] - VAL[Math.abs(m.p)] : 0) + (m.promo ? 8000 + VAL[m.promo] : 0);
    moves.sort((a, b) => b.o - a.o);
  }

  function makeSearcher(s, deadline) {
    let nodes = 0, stop = false;
    function qs(alpha, beta, ply) {
      nodes++;
      const stand = evaluate(s) * s.turn;
      if (stand >= beta) return stand;
      if (stand > alpha) alpha = stand;
      if (ply > 10) return stand;
      const c = s.turn, moves = genMoves(s, true);
      orderMoves(moves);
      for (const m of moves) {
        const u = make(s, m);
        if (attacked(s, s.k[c > 0 ? 0 : 1], -c)) { unmake(s, m, u); continue; }
        const sc = -qs(-beta, -alpha, ply + 1);
        unmake(s, m, u);
        if (sc >= beta) return sc;
        if (sc > alpha) alpha = sc;
      }
      return alpha;
    }
    function ab(d, alpha, beta, ply) {
      if (d <= 0) return qs(alpha, beta, ply);
      nodes++;
      if ((nodes & 511) === 0 && Date.now() > deadline) stop = true;
      const c = s.turn, moves = genMoves(s, false);
      orderMoves(moves);
      let legalN = 0, best = -MATE * 2;
      for (const m of moves) {
        const u = make(s, m);
        if (attacked(s, s.k[c > 0 ? 0 : 1], -c)) { unmake(s, m, u); continue; }
        legalN++;
        const sc = -ab(d - 1, -beta, -alpha, ply + 1);
        unmake(s, m, u);
        if (sc > best) best = sc;
        if (sc > alpha) alpha = sc;
        if (alpha >= beta || stop) break;
      }
      if (!legalN) return inCheck(s, c) ? -MATE + ply : 0;
      return best;
    }
    return { ab, qs, get stop() { return stop; }, get nodes() { return nodes; } };
  }

  // Лучший ход для стороны, чья очередь. noise — случайный шум в сантипешках, чтобы движок не был одинаковым.
  function search(s0, opts = {}) {
    const s = clone(s0);
    s.ids = null;
    const maxDepth = opts.depth || 3, deadline = Date.now() + (opts.ms || 700), noise = opts.noise || 0;
    const root = legal(s);
    if (!root.length) return null;
    const jitter = root.map(() => (Math.random() * 2 - 1) * noise);
    let best = root[0], bestScore = -MATE * 2, scores = root.map(() => 0);
    const S = makeSearcher(s, deadline);
    for (let depth = 1; depth <= maxDepth; depth++) {
      const idx = root.map((_, i) => i).sort((a, b) => scores[b] - scores[a]);
      const cur = root.map(() => -MATE * 2);
      let alpha = -MATE * 2, done = 0;
      for (const i of idx) {
        const m = root[i], u = make(s, m);
        const sc = -S.ab(depth - 1, -MATE * 2, -alpha + 60, 1) + jitter[i];
        unmake(s, m, u);
        cur[i] = sc;
        if (sc > alpha) alpha = sc;
        done++;
        if (S.stop) break;
      }
      if (S.stop && depth > 1 && done < root.length) break; // недосчитанную глубину не используем
      scores = cur;
      let bi = 0;
      for (let i = 1; i < root.length; i++) if (scores[i] > scores[bi]) bi = i;
      best = root[bi]; bestScore = scores[bi];
      if (S.stop) break;
    }
    return { move: best, score: bestScore, nodes: S.nodes };
  }

  // Оценка каждого своего хода с глубиной depth: { scores: Map(move → балл), best }
  function scoreMoves(s0, depth = 2, ms = 600) {
    const s = clone(s0);
    s.ids = null;
    const root = legal(s), S = makeSearcher(s, Date.now() + ms), out = [];
    for (const m of root) {
      const u = make(s, m);
      const sc = -S.ab(depth - 1, -MATE * 2, MATE * 2, 1);
      unmake(s, m, u);
      out.push({ m, sc });
    }
    out.sort((a, b) => b.sc - a.sc);
    return out;
  }

  // ---------- размен на поле (SEE симуляцией): сколько выиграет сторона, чья очередь, начав брать на sq ----------
  function seeSquare(s, sq, depth = 0) {
    if (depth > 12) return 0;
    const c = s.turn, target = Math.abs(s.b[sq]);
    if (!target) return 0;
    let bestM = null, bestV = 1e9;
    for (const m of genMoves(s, true)) {
      if (m.to !== sq || m.flag === 2) continue;
      const v = Math.abs(m.p) === K ? 20000 : VAL[Math.abs(m.p)];
      if (v >= bestV) continue;
      const u = make(s, m);
      const ok = !attacked(s, s.k[c > 0 ? 0 : 1], -c);
      unmake(s, m, u);
      if (ok) { bestV = v; bestM = m; }
    }
    if (!bestM) return 0;
    const gain0 = target === K ? 20000 : VAL[target];
    const u = make(s, bestM);
    const gain = gain0 - seeSquare(s, sq, depth + 1);
    unmake(s, bestM, u);
    return Math.max(0, gain);
  }

  // Что грозит фигурам стороны side, если бы ходил противник: [{sq, loss}]
  function hanging(s0, side) {
    const s = clone(s0);
    s.ids = null;
    s.turn = -side; s.ep = -1;
    const out = [];
    if (inCheck(s, side)) return out; // «пустой ход» невозможен, пропускаем
    for (let i = 0; i < 64; i++) {
      const p = s.b[i];
      if (!p || (p > 0) !== (side > 0) || Math.abs(p) === K) continue;
      if (!attacked(s, i, -side)) continue;
      const loss = seeSquare(s, i);
      if (loss > 0) out.push({ sq: i, loss });
    }
    return out;
  }

  const api = {
    P, N, B, R, Q, K, VAL, MATE,
    create, fromFEN, toFEN, clone, keyOf, sqName, sqIdx,
    attacked, attackers, inCheck, genMoves, legal, make, unmake, play, status, san,
    evaluate, search, scoreMoves, seeSquare, hanging,
  };
  root.Chess = api;
  return api;
}
ChessFactory(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : globalThis));
