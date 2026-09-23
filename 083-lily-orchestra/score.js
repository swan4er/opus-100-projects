'use strict';
/* =========================================================================
   Оркестр на кувшинке — ПАРТИТУРА
   Единственный источник правды. Из этих данных одновременно строятся
   звук (audio.js) и движение каждого музыканта (cast.js, film.js):
   удар колотушки, щипок струны, взмах палочки дирижёра приходятся
   ровно на время ноты. Время — секунды от начала фильма.
   ========================================================================= */

const SCORE = (() => {
  const NI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function midi(s) {
    const m = /^([A-G])(#|b)?(-?\d)$/.exec(s);
    if (!m) throw new Error('Нота? ' + s);
    return 12 * (+m[3] + 1) + NI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  }

  /* ---------- Отрезки темпа ------------------------------------------- */
  // Отрезок: метр, темп, число тактов. beatDurs — длительности долей
  // (для замедления в каденции); без него темп ровный.
  function seg(id, t0, bpm, meter, bars, beatDurs) {
    const n = meter * bars;
    const bt = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) bt[i + 1] = bt[i] + (beatDurs ? beatDurs[i] : 60 / bpm);
    const s = { id, t0, bpm, meter, bars, n, bt, t1: t0 + bt[n] };
    // время доли: такт с 1, доля с 1, дробные значения допустимы
    s.at = (bar, beat = 1) => {
      const b = (bar - 1) * meter + (beat - 1);
      if (b <= 0) return t0 + b * (bt[1] - bt[0]);
      const i = Math.min(Math.floor(b), n - 1);
      return t0 + bt[i] + (b - i) * (bt[i + 1] - bt[i]);
    };
    // позиция в долях (дробная) для момента t — нужна дирижёру
    s.pos = (t) => {
      const x = t - t0;
      if (x <= 0) return x / (bt[1] - bt[0]);
      if (x >= bt[n]) return n + (x - bt[n]) / (bt[n] - bt[n - 1]);
      let lo = 0, hi = n;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (bt[mid] <= x) lo = mid; else hi = mid; }
      return lo + (x - bt[lo]) / (bt[lo + 1] - bt[lo]);
    };
    s.beatLen = (i) => bt[Math.max(0, Math.min(n - 1, i)) + 1] - bt[Math.max(0, Math.min(n - 1, i))];
    return s;
  }

  /* ---------- События ----------------------------------------------------- */
  const EV = [];
  // кто играет: инструмент → персонаж
  function whoOf(inst, m) {
    switch (inst) {
      case 'pizz': return 'bass';
      case 'bsn': return 'bsn';
      case 'hero': return 'hero';
      case 'kick': return 'rhino';
      case 'shk': return 'chafer';
      case 'choir': return 'choir';
      case 'tap': return 'cond';
      case 'bell': return m <= 82 ? 'df1' : 'df2'; // синяя стрекоза — до си-бемоль, красная — выше
      case 'wood': return m === 1 ? 'lb1' : 'lb2';
      default: return 'sfx';
    }
  }
  function add(e) {
    if (e.v === undefined) e.v = 0.8;
    if (e.dur === undefined) e.dur = 0.3;
    e.who = e.who || whoOf(e.inst, e.m);
    EV.push(e);
    return e;
  }

  // Строка нот: такты через «|», ноты через запятую: «F4 1.5 .7» —
  // высота, длительность в долях, громкость. «-» — пауза, «A5+C6» — аккорд.
  function line(sg, inst, str, o = {}) {
    let bar = o.bar || 1;
    for (const barStr of str.split('|')) {
      let beat = 0;
      for (const tok of barStr.split(',').map((x) => x.trim()).filter(Boolean)) {
        const [p, d, v] = tok.split(/\s+/);
        const dur = +d;
        if (p !== '-') {
          const t = sg.at(bar, 1 + beat), t2 = sg.at(bar, 1 + beat + dur);
          const ps = p.split('+');
          ps.forEach((pn, k) => add({
            t: t + (o.roll ? k * o.roll : 0), inst, m: midi(pn),
            dur: (t2 - t) * (o.leg || 0.92), v: v ? +v : (o.v || 0.8), bar, beat: 1 + beat, seg: sg.id,
          }));
        }
        beat += dur;
      }
      bar++;
    }
  }
  // Ударные по сетке: один символ — одна клетка (по умолчанию восьмая).
  // x — удар, X — акцент, h/l — высокий/низкий жёлудь, H/L — с акцентом.
  function pat(sg, inst, from, to, str, o = {}) {
    const grid = o.grid || 0.5;
    for (let b = from; b <= to; b++) {
      for (let i = 0; i < str.length; i++) {
        const c = str[i];
        if (c === '.' || c === ' ') continue;
        const acc = c === 'X' || c === 'H' || c === 'L';
        const m = (c === 'h' || c === 'H') ? 1 : 0;
        const cres = o.cres ? (0.55 + 0.45 * i / str.length) : 1;
        add({ t: sg.at(b, 1 + i * grid), inst, m, dur: 0.2, v: (acc ? (o.va || 0.95) : (o.v || 0.7)) * cres, bar: b, seg: sg.id });
      }
    }
  }
  // аккорды хора
  const CH = { F: 'C4+F4+A4', C7: 'Bb3+E4+G4', Bb: 'Bb3+D4+F4' };
  function choir(sg, str, o = {}) {
    line(sg, 'choir', str.split('|').map((b) => b.split(',').map((tok) => {
      const [c, d, v] = tok.trim().split(/\s+/);
      return (c === '-' ? '-' : CH[c]) + ' ' + d + (v ? ' ' + v : '');
    }).join(',')).join('|'), Object.assign({ leg: 0.98, v: 0.55 }, o));
  }

  /* ---------- Форма фильма ----------------------------------------------- */
  const T = {};
  T.A = 12.9;                                   // начало серенады
  const A = seg('A', T.A, 112, 4, 13);          // такты 1–13
  T.hit = A.t1;                                 // такт 14: общий аккорд с ферматой
  T.cut = T.hit + 1.5;                          // дирижёр снимает звук
  T.ding = T.cut + 0.9;                         // «Дзынь!» — не вовремя
  T.C = T.ding + 9.4;                           // перекличка
  const C = seg('C', T.C, 100, 2, 10);
  const P = seg('P', C.t1, 120, 2, 12);         // полька лягушонка
  const D = seg('D', P.t1, 112, 4, 8);          // финал: тема + мотив лягушонка
  const K = seg('K', D.t1, 0, 4, 1, [0.6, 0.63, 0.67, 0.72]); // каденция с замедлением
  T.fin = K.t1;                                 // последний аккорд
  T.cut2 = T.fin + 2.6;
  T.ding2 = T.cut2 + 0.95;                      // «Дзынь!» — на своём месте
  T.L = T.ding2 + 4.3;                          // колыбельная кода
  const L = seg('L', T.L, 84, 4, 2);
  T.end = L.t1 + 3.0;
  T.C_ = C.t0; T.P = P.t0; T.D = D.t0; T.K = K.t0;

  /* ---------- 1. Настройка (свободное время) ----------------------------- */
  add({ t: 1.6, inst: 'croak', m: 0, v: 0.35, who: 'sfx' });
  add({ t: 3.4, inst: 'croak', m: 1, v: 0.28, who: 'sfx' });
  add({ t: 5.55, inst: 'kick', m: 0, v: 0.32 });
  add({ t: 5.8, inst: 'kick', m: 0, v: 0.26 });
  add({ t: 6.05, inst: 'wood', m: 1, v: 0.4 });
  add({ t: 6.22, inst: 'wood', m: 0, v: 0.36 });
  add({ t: 6.5, inst: 'shk', m: 0, v: 0.35 });
  add({ t: 6.62, inst: 'shk', m: 0, v: 0.3 });
  add({ t: 6.95, inst: 'bell', m: midi('A5'), v: 0.42, dur: 1 });
  add({ t: 7.2, inst: 'bell', m: midi('C6'), v: 0.34, dur: 1 });
  add({ t: 7.45, inst: 'pizz', m: midi('A2'), v: 0.62, dur: 1.2 });
  add({ t: 7.9, inst: 'pizz', m: midi('A2'), v: 0.55, dur: 1.2, bend: -0.45 }); // подкручивает колок
  add({ t: 8.45, inst: 'bsn', m: midi('A3'), v: 0.55, dur: 1.25 });               // «ля» для настройки
  add({ t: 10.75, inst: 'gulp', v: 0.5, who: 'hero' });                          // лягушонок сглатывает
  add({ t: 11.2, inst: 'tap', v: 0.7 });
  add({ t: 11.5, inst: 'tap', v: 0.7 });
  add({ t: 11.8, inst: 'tap', v: 0.75 });

  /* ---------- 2. Серенада (4/4, 112) ------------------------------------- */
  line(A, 'pizz',
    'F2 1, C3 1, A2 1, C3 1 | F2 1, C3 1, A2 1, G2 1 | F2 1, C3 1, A2 1, C3 1 | C3 1, G2 1, E2 1, G2 1 |' +
    'F2 1, C3 1, A2 1, C3 1 | F2 1, A2 1, C3 1, A2 1 | C3 1, G2 1, Bb2 1, G2 1 | F2 1, C3 1, F2 1, A2 1 |' +
    'Bb2 1, F2 1, D3 1, F2 1 | C3 1, A2 1, F2 1, A2 1 | C3 1, G2 1, E2 1, G2 1 | F2 1, G2 1, A2 1, B2 1 |' +
    'C3 .5, C3 .5, C3 .5, C3 .5, Bb2 .5, Bb2 .5, G2 .5, E2 .5', { v: 0.78 });
  // тема фагота
  line(A, 'bsn',
    'A3 1, C4 1, F4 1.5, E4 .5 | D4 .5, C4 .5, A3 1, C4 2 | Bb3 1, G3 1, E3 1, G3 1 | A3 1.5, G3 .5, F3 2 |' +
    'D4 1, F4 1, D4 1, Bb3 1 | C4 1.5, A3 .5, F3 2 | G3 .5, A3 .5, Bb3 .5, C4 .5, D4 1, E4 1 | F4 3, - 1 |' +
    'G3 .5, A3 .5, Bb3 .5, C4 .5, D4 .5, E4 .5, F4 .5, F#4 .5', { bar: 5, v: 0.72, leg: 0.96 });
  // колокольчики отвечают в концах фраз
  line(A, 'bell', '- 2, A5 .5, C6 .5, F6 1', { bar: 6, v: 0.6 });
  line(A, 'bell', '- 2, C6 .5, A5 .5, F5 1', { bar: 8, v: 0.6 });
  line(A, 'bell', '- 2, D6 .5, C6 .5, A5 1', { bar: 10, v: 0.6 });
  line(A, 'bell', '- 1.5, F5 .5, A5 .5, C6 .5, F6 1', { bar: 12, v: 0.62 });
  line(A, 'bell', 'G5 .5 .5, C6 .5 .55, Bb5 .5 .6, E6 .5 .65, G5 .5 .7, C6 .5 .75, Bb5 .5 .8, E6 .5 .85', { bar: 13 });
  // жуки
  pat(A, 'kick', 3, 12, 'X...x...', { v: 0.62, va: 0.85 });
  pat(A, 'kick', 13, 13, 'x.x.x.xX', { v: 0.7, va: 0.95, cres: true });
  pat(A, 'wood', 3, 3, '..h...l.', { v: 0.6 });
  pat(A, 'wood', 4, 4, '..h...lh', { v: 0.6 });
  pat(A, 'wood', 5, 7, '..h...l.', { v: 0.6 });
  pat(A, 'wood', 8, 8, '..h.h.ll', { v: 0.6 });
  pat(A, 'wood', 9, 11, '..h...l.', { v: 0.6 });
  pat(A, 'wood', 12, 12, '..h.hhll', { v: 0.62 });
  pat(A, 'wood', 13, 13, 'hlhlhlhL', { v: 0.7, va: 0.95, cres: true });
  pat(A, 'shk', 5, 12, 'xXxXxXxX', { v: 0.3, va: 0.48 });
  pat(A, 'shk', 13, 13, 'xXxXxXxX', { v: 0.45, va: 0.65, cres: true });

  // такт 14: общий аккорд C7 с ферматой, снимается жестом дирижёра
  const holdH = T.cut - T.hit;
  add({ t: T.hit, inst: 'pizz', m: midi('C2'), v: 1, dur: holdH });
  add({ t: T.hit + 0.012, inst: 'pizz', m: midi('C3'), v: 0.75, dur: holdH });
  add({ t: T.hit, inst: 'kick', m: 0, v: 1 });
  add({ t: T.hit, inst: 'wood', m: 1, v: 0.9 });
  add({ t: T.hit + 0.01, inst: 'wood', m: 0, v: 0.9 });
  add({ t: T.hit, inst: 'shk', m: 0, v: 0.75 });
  add({ t: T.hit, inst: 'bell', m: midi('Bb5'), v: 0.85, dur: holdH });
  add({ t: T.hit + 0.015, inst: 'bell', m: midi('E6'), v: 0.85, dur: holdH });
  add({ t: T.hit, inst: 'bsn', m: midi('G4'), v: 0.9, dur: holdH });

  /* ---------- 3. «Дзынь!» — тишина и ошибка ---------------------------- */
  add({ t: T.ding, inst: 'hero', m: midi('F6'), v: 0.9, dur: 2.6 });
  add({ t: T.ding + 3.0, inst: 'gulp', v: 0.55, who: 'hero' });
  add({ t: T.ding + 4.45, inst: 'drop', v: 0.55, who: 'sfx' });
  add({ t: T.ding + 7.2, inst: 'tap', v: 0.55 });
  add({ t: T.ding + 7.45, inst: 'tap', v: 0.6 });

  /* ---------- 4. Перекличка (2/4, 100) ----------------------------------- */
  line(C, 'hero', 'F6 1 .45, - 1 | - 2 | F6 .5 .55, F6 .5 .55, - 1 | - 2 | F6 .5 .65, F6 .5 .65, F6 1 .7 | - 2 |' +
    'F6 .5 .75, G6 .5 .75, F6 .5 .75, D6 .5 .75 | - 2 | F6 .5 .85, G6 .5 .85, F6 .5 .85, D6 .5 .85 | C6 .5 .85, - .5, F6 1 .9');
  line(C, 'bell', 'F6 1 .55, - 1', { bar: 2 });
  line(C, 'pizz', 'F2 .5 .8, F2 .5 .8, - 1', { bar: 4 });
  add({ t: C.at(6, 1), inst: 'wood', m: 1, v: 0.75, bar: 6, seg: 'C' });
  add({ t: C.at(6, 1.5), inst: 'wood', m: 0, v: 0.75, bar: 6, seg: 'C' });
  add({ t: C.at(6, 2), inst: 'kick', m: 0, v: 0.95, bar: 6, seg: 'C' });
  line(C, 'bsn', 'F4 .5 .75, G4 .5 .75, F4 .5 .75, D4 .5 .8', { bar: 8, leg: 0.55 });
  // все вместе: мотив лягушонка — теперь общий
  line(C, 'bsn', 'F4 .5, G4 .5, F4 .5, D4 .5 | C4 .5, A3 .5, F3 1', { bar: 9, v: 0.8, leg: 0.85 });
  line(C, 'bell', 'D6 .5, E6 .5, D6 .5, Bb5 .5 | A5 .5, C6 .5, F6 1', { bar: 9, v: 0.62 });
  line(C, 'pizz', 'F2 .5, C3 .5, F2 .5, Bb2 .5 | C3 .5, C3 .5, F2 1', { bar: 9, v: 0.85 });
  pat(C, 'kick', 9, 10, 'X...', { va: 0.85 });
  pat(C, 'wood', 9, 10, '.h.l', { v: 0.62 });
  pat(C, 'shk', 9, 10, 'xXxX', { v: 0.35, va: 0.5 });

  /* ---------- Полька лягушонка (2/4, 120) -------------------------------- */
  line(P, 'bsn',
    'F4 .5, G4 .5, F4 .5, D4 .5 | C4 1, - 1 | E4 .5, F4 .5, E4 .5, C4 .5 | A3 1, - 1 |' +
    'D4 .5, F4 .5, D4 .5, Bb3 .5 | A3 .5, C4 .5, F4 1 | G4 .5, F4 .5, E4 .5, D4 .5 | C4 1, - 1 |' +
    'F4 .5, G4 .5, F4 .5, D4 .5 | D4 .5, F4 .5, Bb4 1 | G4 .5, E4 .5, C4 .5, E4 .5 | F4 1, - 1', { v: 0.72, leg: 0.8 });
  line(P, 'hero', '- 1, F6 1 .8', { bar: 2 });
  line(P, 'hero', '- 1, F6 .5 .8, F6 .5 .85', { bar: 4 });
  line(P, 'hero', '- 1, F6 1 .85', { bar: 6 });
  line(P, 'hero', '- 1, G6 .5 .85, F6 .5 .85', { bar: 8 });
  line(P, 'hero', '- 1, D6 .5 .85, F6 .5 .9', { bar: 10 });
  line(P, 'hero', '- .5, E6 .5 .8, - .5, G6 .5 .85 | - 1, F6 1 .95', { bar: 11 });
  const oomPah = { F: 'F2 1, C3 1', C7: 'C3 1, G2 1', Bb: 'Bb2 1, F2 1' };
  line(P, 'pizz', ['F', 'F', 'C7', 'F', 'Bb', 'F', 'C7', 'F', 'F', 'Bb', 'C7', 'F'].map((c) => oomPah[c]).join('|'), { v: 0.75 });
  pat(P, 'kick', 1, 12, 'X...', { va: 0.8 });
  pat(P, 'wood', 1, 12, '.h.l', { v: 0.55 });
  pat(P, 'shk', 1, 12, 'xXxX', { v: 0.3, va: 0.46 });
  line(P, 'bell', '- 1, G5 .5, C6 .5', { bar: 3, v: 0.55 });
  line(P, 'bell', '- 1, Bb5 .5, E6 .5', { bar: 7, v: 0.55 });
  line(P, 'bell', 'G5 .5, Bb5 .5, C6 .5, E6 .5 | - 1, A5 .5, C6 .5', { bar: 11, v: 0.6 });

  /* ---------- 5. Финал: тема + мотив лягушонка (4/4, 112) --------------- */
  line(D, 'bsn',
    'A3 1, C4 1, F4 1.5, E4 .5 | D4 .5, C4 .5, A3 1, C4 2 | Bb3 1, G3 1, E3 1, G3 1 | A3 1.5, G3 .5, F3 2 |' +
    'D4 1, F4 1, D4 1, Bb3 1 | C4 1.5, A3 .5, F3 2 | G3 .5, A3 .5, Bb3 .5, C4 .5, D4 1, E4 1 | F4 3, - 1', { v: 0.8, leg: 0.96 });
  line(D, 'pizz',
    'F2 1, C3 1, A2 1, C3 1 | F2 1, A2 1, C3 1, A2 1 | C3 1, G2 1, Bb2 1, G2 1 | F2 1, C3 1, F2 1, A2 1 |' +
    'Bb2 1, F2 1, D3 1, F2 1 | C3 1, A2 1, F2 1, A2 1 | C3 1, G2 1, E2 1, G2 1 | F2 1, C3 1, F2 1, A2 1', { v: 0.8 });
  line(D, 'hero', '- 2, F6 .5, G6 .5, F6 .5, D6 .5', { bar: 2, v: 0.85 });
  line(D, 'hero', '- 2, C6 .5, D6 .5, F6 1', { bar: 4, v: 0.85 });
  line(D, 'hero', '- 2, F6 .5, G6 .5, F6 .5, D6 .5', { bar: 6, v: 0.88 });
  line(D, 'hero', '- 1, C6 .5, D6 .5, F6 .5, G6 .5, F6 1', { bar: 8, v: 0.9 });
  line(D, 'bell', '- 2, D6 .5, E6 .5, D6 .5, Bb5 .5', { bar: 2, v: 0.55 });
  line(D, 'bell', '- 2, A5 .5, Bb5 .5, C6 1', { bar: 4, v: 0.55 });
  line(D, 'bell', '- 2, D6 .5, E6 .5, D6 .5, Bb5 .5', { bar: 6, v: 0.58 });
  line(D, 'bell', '- 1, A5 .5, Bb5 .5, D6 .5, E6 .5, D6 1', { bar: 8, v: 0.6 });
  choir(D, 'F 4 | F 4 | C7 4 | F 4 | Bb 4 | F 4 | C7 4 | F 4');
  pat(D, 'kick', 1, 8, 'X...x...', { v: 0.66, va: 0.88 });
  pat(D, 'wood', 1, 3, '..h...l.', { v: 0.6 });
  pat(D, 'wood', 4, 4, '..h.h.ll', { v: 0.6 });
  pat(D, 'wood', 5, 7, '..h...l.', { v: 0.6 });
  pat(D, 'wood', 8, 8, '..hlhlhL', { v: 0.65, va: 0.9 });
  pat(D, 'shk', 1, 8, 'xXxXxXxX', { v: 0.32, va: 0.5 });

  // каденция: си-бемоль → до-септаккорд, замедление
  line(K, 'bsn', 'D4 1, F4 1, E4 1, G4 1', { v: 0.85, leg: 0.97 });
  line(K, 'pizz', 'Bb2 1, D3 1, C3 1, C2 1', { v: 0.9 });
  line(K, 'bell', 'Bb5+D6 2 .6, C6+E6 2 .65', { roll: 0.035 });
  choir(K, 'Bb 2, C7 2', { v: 0.6 });
  pat(K, 'kick', 1, 1, 'X...x...', { v: 0.75, va: 0.9 });
  add({ t: K.at(1, 4), inst: 'wood', m: 1, v: 0.6 });
  add({ t: K.at(1, 4.25), inst: 'wood', m: 0, v: 0.65 });
  add({ t: K.at(1, 4.5), inst: 'wood', m: 1, v: 0.72 });
  add({ t: K.at(1, 4.75), inst: 'wood', m: 0, v: 0.8 });
  pat(K, 'shk', 1, 1, 'xXxXxXxX', { v: 0.35, va: 0.52 });

  // последний аккорд фа мажор — фермата
  const holdF = T.cut2 - T.fin;
  add({ t: T.fin, inst: 'pizz', m: midi('F2'), v: 1, dur: holdF });
  add({ t: T.fin + 0.012, inst: 'pizz', m: midi('C3'), v: 0.7, dur: holdF });
  add({ t: T.fin, inst: 'bsn', m: midi('A3'), v: 0.85, dur: holdF });
  add({ t: T.fin, inst: 'bell', m: midi('F5'), v: 0.8, dur: holdF });
  add({ t: T.fin + 0.04, inst: 'bell', m: midi('A5'), v: 0.78, dur: holdF });
  add({ t: T.fin + 0.08, inst: 'bell', m: midi('C6'), v: 0.8, dur: holdF });
  add({ t: T.fin, inst: 'kick', m: 0, v: 1 });
  add({ t: T.fin, inst: 'shk', m: 0, v: 0.6 });
  CH.F.split('+').forEach((p) => add({ t: T.fin, inst: 'choir', m: midi(p), v: 0.62, dur: holdF }));

  /* ---------- 6. Та самая нота — на своём месте ------------------------- */
  add({ t: T.ding2, inst: 'hero', m: midi('F6'), v: 0.95, dur: 3.2 });
  // аплодисменты: лягушки в камышах
  [0.85, 1.05, 1.3, 1.45, 1.7, 1.95, 2.2, 2.35, 2.7, 3.05, 3.4].forEach((d, i) =>
    add({ t: T.ding2 + d, inst: 'croak', m: i % 3, v: 0.32 + 0.1 * ((i * 7) % 3), who: 'sfx' }));

  // колыбельная кода
  line(L, 'hero', 'F6 1 .45, G6 1 .42, F6 1 .4, D6 1 .38 | C6 2 .36, F6 2 .45');
  line(L, 'bell', 'A5+C6 2 .28, Bb5+D6 2 .28 | G5+Bb5 2 .26, A5+C6+F6 2 .3', { roll: 0.05 });
  line(L, 'pizz', 'F2 2 .45, Bb2 2 .42 | C3 2 .42, F2 2 .5');
  choir(L, 'F 2 .4, Bb 2 .38 | C7 2 .36, F 2 .45');

  /* ---------- Сборка ------------------------------------------------------ */
  EV.sort((a, b) => a.t - b.t);
  const byWho = {};
  for (const e of EV) (byWho[e.who] = byWho[e.who] || []).push(e);
  for (const k in byWho) byWho[k].times = Float64Array.from(byWho[k], (e) => e.t);

  // Громкость фона пруда: слышнее в тишине, тише под музыку
  const AMB = [[0, 0], [2.2, 0.9], [8, 0.8], [T.A, 0.35], [T.hit, 0.25], [T.cut + 0.3, 0.95], [T.C, 0.9], [T.C + 1.5, 0.4],
    [T.D, 0.35], [T.cut2 + 0.3, 0.85], [T.L, 0.7], [T.end, 0.6]];

  const SEG = { A, C, P, D, K, L };

  // Бинарный поиск: индекс последнего события с t ≤ time (или −1)
  function lastIdx(times, time) {
    let lo = -1, hi = times.length;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (times[mid] <= time) lo = mid; else hi = mid; }
    return lo;
  }

  // Метрический отрезок, в котором находится t (для дирижёра)
  function segAt(t) {
    for (const k of ['A', 'C', 'P', 'D', 'K', 'L']) { const s = SEG[k]; if (t >= s.t0 - s.beatLen(0) && t < s.t1) return s; }
    return null;
  }

  const SCENES = [
    { name: 'Настройка', t: 0 },
    { name: 'Серенада', t: T.A },
    { name: 'Дзынь!', t: T.cut },
    { name: 'Перекличка', t: T.C },
    { name: 'Светлячки', t: T.P + 8 },
    { name: 'Поклон', t: T.ding2 + 0.6 },
  ];

  return { midi, EV, byWho, T, SEG, AMB, SCENES, lastIdx, segAt, duration: T.end };
})();
