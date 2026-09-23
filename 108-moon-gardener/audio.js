'use strict';
/* ==========================================================================
   Садовник на Луне · звук
   Чиптюн на Web Audio: два канала прямоугольной волны (скважность 12,5 /
   25 / 50 %), треугольная волна для баса, шум для ударных и эффектов.
   Партитура — список событий на шкале фильма, поэтому музыка и действие
   совпадают при любой перемотке: планировщик ставит события на 0,3 с вперёд.
   ========================================================================== */
const AUDIO = (() => {
  let ctx = null, master = null, comp = null, music = null, sfx = null, sfxLP = null, voice = null, echoIn = null;
  let waves = {}, noiseBuf = null, metalBuf = null;
  let running = false, t0Ctx = 0, t0Film = 0, planned = 0, timer = 0;
  const live = new Set();
  const EV = [];

  /* ---------- Ноты ---------- */
  const NAMES = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
  const midi = (n) => { const m = /^([A-G][#b]?)(-?\d)$/.exec(n); return 12 * (Number(m[2]) + 1) + NAMES[m[1]]; };
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const BEAT = 0.5, E8 = 0.25, S16 = 0.125; // 120 ударов в минуту

  /* ---------- События ---------- */
  function note(t, ch, n, dur, vol, o) { EV.push(Object.assign({ t, type: 'note', ch, m: typeof n === 'number' ? n : midi(n), dur, vol }, o || {})); }
  function fx(t, kind, o) { EV.push(Object.assign({ t, type: 'fx', kind }, o || {})); }
  /* Мелодия строкой: «E5/2 G5/2 r/1 …», длительность в восьмых */
  function line(t, ch, str, vol, o) {
    let x = t;
    for (const tok of str.trim().split(/\s+/)) {
      if (tok === '|') continue;
      const [n, d] = tok.split('/');
      const dur = Number(d || 1) * E8;
      if (n !== 'r') note(x, ch, n, dur * (o && o.legato ? 1 : 0.9), vol, o);
      x += dur;
    }
    return x;
  }
  function chordArp(t, bars, chords, vol, o) { // арпеджио шестнадцатыми
    o = o || {};
    const step = o.step || S16;
    chords.forEach((c, bi) => {
      const ns = c.split('-').map(midi);
      const n = Math.round(2 / step * (o.barLen || 1));
      for (let k = 0; k < n; k++) note(t + bi * 2 * (o.barLen || 1) + k * step, 'arp', ns[(o.pat ? o.pat[k % o.pat.length] : k) % ns.length], step * 0.8, vol * (k % 4 === 0 ? 1 : 0.75), { duty: 0.125 });
    });
    void bars;
  }
  function bass(t, str, vol) { return line(t, 'bass', str, vol || 0.5); }
  function drums(t, bars, pat, vol) { // pat: строка из 16 символов на такт: k — бочка, s — малый, h — хэт, . — пауза
    vol = vol || 1;
    for (let b = 0; b < bars; b++) for (let k = 0; k < 16; k++) {
      const c = pat[k % pat.length];
      const tt = t + b * 2 + k * S16;
      if (c === 'k') fx(tt, 'kick', { vol: 0.55 * vol });
      else if (c === 's') fx(tt, 'snare', { vol: 0.35 * vol });
      else if (c === 'h') fx(tt, 'hat', { vol: 0.12 * vol });
      else if (c === 'H') fx(tt, 'hat', { vol: 0.2 * vol, open: true });
      else if (c === 'x') { fx(tt, 'kick', { vol: 0.5 * vol }); fx(tt, 'hat', { vol: 0.12 * vol }); }
    }
  }
  /* «Голос» робота: цепочка скольжений частоты */
  function beep(t, path, vol, o) { fx(t, 'beep', Object.assign({ path, vol: vol || 0.16 }, o || {})); }

  /* ---------- Партитура ---------- */
  function buildScore() {
    EV.length = 0;
    const THEME1 = 'E5/2 G5/2 A5/2 G5/1 E5/1 | D5/2 C5/2 D5/2 E5/2 | G5/2 C6/2 B5/2 A5/1 G5/1 | A5/6 r/2';
    const THEME2 = 'F5/2 A5/2 C6/2 A5/1 G5/1 | E5/2 G5/2 E5/2 D5/2 | C5/2 D5/2 E5/2 G5/1 D5/1 | C5/6 r/2';

    /* 1 · Земля (0–12): простор, медленные арпеджио, тема входит с титром */
    const padCh = ['C4-E4-G4-B4', 'A3-C4-E4-B4', 'F3-A3-C4-E4', 'G3-B3-D4-E4'];
    padCh.forEach((c, i) => {
      const ns = c.split('-');
      for (let k = 0; k < 8; k++) note(0.4 + i * 3 + k * 0.375, 'arp', ns[k % 4].replace(/\d/, (d) => String(Number(d) + 1)), 0.34, 0.07 + 0.03 * Math.min(1, i), { duty: 0.125, echo: 1 });
    });
    ['C3', 'A2', 'F2', 'G2'].forEach((n, i) => note(0.4 + i * 3, 'bass', n, 2.9, 0.34, { soft: 1 }));
    line(6.4, 'lead', 'E5/4 G5/4 A5/4 G5/2 E5/2 D5/4 C5/5', 0.13, { duty: 0.5, vib: 1, echo: 1, soft: 1 });

    /* 2 · Садовник (12–38) */
    note(12.8, 'lead', 'C6', 0.1, 0.08, { duty: 0.25 }); note(12.9, 'lead', 'G6', 0.18, 0.08, { duty: 0.25 });          // док зарядился
    beep(13.2, [[500, 0], [780, 0.12], [620, 0.2]], 0.14);                                                                // проснулся
    beep(14.4, [[900, 0], [900, 0.05]], 0.1); beep(14.88, [[1000, 0], [1000, 0.05]], 0.1);                                  // оглядывается
    beep(15.3, [[600, 0], [420, 0.25], [520, 0.45], [380, 0.7]], 0.13);                                                   // зевок-потягушки
    fx(16.14, 'pop'); beep(16.2, [[1200, 0], [1500, 0.06]], 0.12);                                                        // кабель
    fx(16.95, 'clank');
    for (let k = 0; k < 8; k++) note(12 + k * 0.5, 'bass', k % 2 ? 'G2' : 'C3', 0.2, 0.3);
    // проход к цветку: хэт на каждый шаг, бас стаккато, тема
    for (let k = 0; k < 30; k++) fx(17.25 + k * S16 + 0.06, 'step', { vol: 0.09 });
    drums(18, 4, 'k.h.s.h.k.hks.h.', 0.55);
    bass(18, 'C3/1 r/1 C3/1 G2/1 C3/1 r/1 E3/1 G2/1 | G2/1 r/1 G2/1 D3/1 G2/1 r/1 B2/1 D3/1 | C3/1 r/1 C3/1 G2/1 E3/1 r/1 E3/1 B2/1 | F2/1 r/1 F2/1 C3/1 F2/1 r/1 A2/1 C3/1', 0.42);
    line(18, 'lead', THEME1, 0.12, { duty: 0.25 });
    chordArp(18, 4, ['C4-E4-G4', 'G3-B3-D4', 'C4-E4-G4', 'F3-A3-C4'], 0.05);
    fx(21.0, 'step', { vol: 0.08 }); fx(21.55, 'step', { vol: 0.07 }); fx(21.68, 'step', { vol: 0.07 });
    fx(24.35, 'scratch'); note(24.36, 'lead', 'E6', 0.1, 0.09, { duty: 0.125 });                                          // зарубка
    beep(24.72, [[700, 0], [1400, 0.08]], 0.12); note(24.9, 'lead', 'C6', 0.1, 0.12, { duty: 0.25 }); note(25.0, 'lead', 'E6', 0.1, 0.12, { duty: 0.25 }); note(25.1, 'lead', 'G6', 0.1, 0.12, { duty: 0.25 }); note(25.2, 'lead', 'C7', 0.2, 0.1, { duty: 0.25 });
    fx(25.24, 'land');
    // полив: музыка редеет, капли звучат нотами
    bass(26, 'F2/2 r/2 F2/2 r/2', 0.3);
    drums(26, 1, 'k...h...k...h...', 0.35);
    line(26, 'lead', 'F5/2 A5/2 C6/4', 0.08, { duty: 0.25 });
    // 28.0 — пусто: тишина ради шутки, потом тряска и грустное «уа-уа»
    for (let k = 0; k < 7; k++) fx(28.45 + k * 0.1, 'rattle', { vol: 0.1 });
    beep(29.35, [[520, 0], [500, 0.2], [330, 0.7]], 0.14, { duty: 0.5 });
    beep(29.95, [[400, 0], [360, 0.2], [250, 0.6]], 0.11, { duty: 0.5 });
    // крупно: заглядывает в лейку (ля минор), грустный спуск
    note(30, 'bass', 'A2', 1.9, 0.3, { soft: 1 }); note(32, 'bass', 'F2', 1.9, 0.3, { soft: 1 });
    chordArp(30, 2, ['A3-C4-E4', 'F3-A3-C4'], 0.035, { step: E8 });
    beep(30.9, [[800, 0], [860, 0.08]], 0.08);
    fx(31.9, 'rattle', { vol: 0.08 }); fx(32.08, 'rattle', { vol: 0.08 });
    line(32.1, 'lead', 'E5/2 D5/2 C5/2 B4/2', 0.07, { duty: 0.5, vib: 1 });
    // колыбельная с Землёй (фа мажор, вдвое медленнее)
    note(34, 'bass', 'F2', 1.9, 0.3, { soft: 1 }); note(36, 'bass', 'C3', 1.9, 0.3, { soft: 1 });
    line(34, 'lead', 'A5/4 C6/4 D6/4 C6/2 A5/2', 0.09, { duty: 0.5, vib: 1, echo: 1, soft: 1 });
    chordArp(34, 2, ['F4-A4-C5-E5', 'C4-E4-G4-A4'], 0.035, { step: E8 });
    beep(35.5, [[700, 0], [760, 0.05]], 0.06); beep(35.72, [[700, 0], [760, 0.05]], 0.06);
    fx(36.2, 'whoosh', { dur: 1.2, vol: 0.05, hi: 1 });
    for (let k = 0; k < 6; k++) note(36.3 + k * 0.12, 'arp', 96 - k * 3, 0.1, 0.05, { duty: 0.125 });

    /* 3 · Звездопад (38–54) */
    note(38, 'bass', 'A1', 3.4, 0.4, { soft: 1 });
    for (let k = 0; k < 12; k++) note(38 + k * 0.25, 'harm', k % 2 ? 'E6' : 'A5', 0.1, 0.03 + k * 0.004, { duty: 0.125 });
    [39.3, 40.1, 40.6].forEach((t) => { fx(t - 0.9, 'whoosh', { dur: 0.95, vol: 0.06, hi: 1 }); });
    fx(41.0, 'swell', { dur: 0.6 });
    beep(41.45, [[600, 0], [1600, 0.12]], 0.15);                                                                           // вскакивает
    beep(42.15, [[1300, 0], [1100, 0.06]], 0.1); beep(42.55, [[1300, 0], [1100, 0.06]], 0.1); beep(42.95, [[1300, 0], [1100, 0.06]], 0.1); beep(43.3, [[1300, 0], [1100, 0.06]], 0.1);
    const STORM_B = 'A2/1 A2/1 A3/1 A2/1 A2/1 A2/1 E3/1 A2/1 | G2/1 G2/1 G3/1 G2/1 G2/1 G2/1 D3/1 G2/1 | F2/1 F2/1 F3/1 F2/1 F2/1 F2/1 C3/1 F2/1 | E2/1 E2/1 E3/1 E2/1 E2/1 E2/1 B2/1 G#2/1';
    const STORM_L = 'E5/2 F5/1 E5/1 D5/2 C5/2 | D5/2 E5/1 D5/1 C5/2 B4/2 | C5/2 D5/1 C5/1 B4/2 A4/2 | G#4/2 A4/1 B4/1 G#4/2 E4/2';
    bass(42, STORM_B, 0.42); bass(50, STORM_B, 0.0);
    drums(42, 4, 'k.h.s.hkk.h.s.hh', 0.7);
    line(42, 'lead', STORM_L, 0.1, { duty: 0.25 });
    chordArp(42, 4, ['A4-C5-E5', 'G4-B4-D5', 'F4-A4-C5', 'E4-G#4-B4'], 0.04);
    for (let k = 0; k < 24; k++) fx(45.7 + k * S16 + 0.05, 'step', { vol: 0.07 });
    fx(48.8, 'skid');
    beep(49.25, [[900, 0], [700, 0.1]], 0.1);
    // тишина и сердце
    [50.2, 50.45, 51.2, 51.45, 52.2, 52.45, 53.2, 53.45].forEach((t, i) => note(t, 'bass', i % 2 ? 'A1' : 'E2', 0.14, 0.45, {}));
    note(50.0, 'harm', 'E6', 3.8, 0.025, { duty: 0.5, vib: 1 });
    beep(50.6, [[500, 0], [700, 0.15]], 0.1);
    line(52, 'lead', 'E6/2 G6/2 A6/2 G6/2', 0.06, { duty: 0.125, echo: 1 });

    /* 4 · Щит (54–70) */
    beep(54.5, [[400, 0], [600, 0.05], [600, 0.2]], 0.14, { duty: 0.25 });                                               // решимость
    for (let k = 0; k < 16; k++) fx(54 + k * S16 * 0.9 + 0.2, 'snare', { vol: 0.05 + k * 0.012 });
    line(55.5, 'lead', 'A4/1 C5/1 E5/1 A5/1', 0.12, { duty: 0.25 });
    const HERO_B = 'F2/1 F2/1 F3/1 F2/1 F2/1 F2/1 C3/1 F2/1 | G2/1 G2/1 G3/1 G2/1 G2/1 G2/1 D3/1 G2/1 | A2/1 A2/1 A3/1 A2/1 A2/1 A2/1 E3/1 A2/1 | A2/1 A2/1 A3/1 A2/1 C3/1 C3/1 E3/1 G3/1';
    const HERO_L = 'C6/3 A5/1 G5/2 F5/2 | D6/3 B5/1 A5/2 G5/2 | E6/3 C6/1 B5/2 A5/2 | A5/6 E5/1 G5/1';
    bass(56, HERO_B, 0.42); bass(64, 'F2/1 F2/1 F3/1 F2/1 F2/1 F2/1 C3/1 F2/1', 0.42);
    drums(56, 5, 'k.hks.h.k.hks.hh', 0.75);
    line(56, 'lead', HERO_L, 0.11, { duty: 0.25 });
    chordArp(56, 5, ['F4-A4-C5', 'G4-B4-D5', 'A4-C5-E5', 'A4-C5-E5', 'F4-A4-C5'], 0.04);
    for (let k = 0; k < 19; k++) fx(56.0 + k * S16 + 0.05, 'step', { vol: 0.07 });
    fx(58.55, 'slide');
    // удары по спине
    [63.25, 64.625].forEach((t) => { fx(t, 'zap'); beep(t + 0.08, [[1400, 0], [500, 0.18]], 0.13, { duty: 0.125 }); });
    // внутри укрытия: всё снаружи глохнет, остаётся колыбельная
    fx(66.0, 'muffle', { on: 1 }); fx(69.0, 'muffle', { on: 0 });
    note(66, 'bass', 'F2', 1.9, 0.28, { soft: 1 }); note(68, 'bass', 'C3', 0.95, 0.28, { soft: 1 });
    line(66.05, 'lead', 'A5/2 C6/2 D6/2 C6/1 A5/1 | G5/4', 0.1, { duty: 0.5, vib: 1, echo: 1, soft: 1 });
    beep(67.55, [[700, 0], [820, 0.1]], 0.07);
    // большой метеор: рёв, удар, звон в ушах
    fx(69.0, 'roar', { dur: 1.0 });
    fx(70.0, 'bigboom');
    fx(70.35, 'ring', { dur: 4.5 });

    /* 5 · Тишина (70–88) */
    fx(77.42, 'click'); fx(78.22, 'click'); fx(79.02, 'click'); fx(79.2, 'click');
    ['C5', 'E5', 'G5', 'C6', 'E6'].forEach((n, i) => note(79.42 + i * 0.07, 'lead', n, 0.12, 0.1, { duty: 0.25 }));
    note(79.8, 'harm', 'G5', 1.5, 0.04, { duty: 0.5, vib: 1, soft: 1 });
    fx(80.15, 'creak', { dur: 0.55 }); fx(80.95, 'creak', { dur: 0.7 });
    fx(80.3, 'hiss', { dur: 1.3 });
    beep(82.0, [[600, 0], [900, 0.1], [800, 0.18]], 0.1);
    for (let k = 0; k < 10; k++) note(82.5 + k * 0.08, 'arp', ['E6', 'G#6', 'B6', 'E7'][k % 4], 0.07, 0.04, { duty: 0.125 });
    beep(83.75, [[500, 0], [1200, 0.15]], 0.13);
    note(82, 'bass', 'E2', 1.9, 0.26, { soft: 1 }); note(84, 'bass', 'A2', 1.9, 0.26, { soft: 1 }); note(86, 'bass', 'E2', 1.9, 0.26, { soft: 1 });
    chordArp(84, 2, ['A4-C#5-E5', 'E4-G#4-B4'], 0.03, { step: E8 });
    for (let k = 0; k < 12; k++) fx(84.45 + k * (1.45 / 12) + 0.05 + (k % 2) * 0.03, 'step', { vol: 0.06 });
    fx(86.35, 'crystal');
    beep(86.95, [[700, 0], [1100, 0.1]], 0.1);
    for (let k = 0; k < 11; k++) fx(87.6 + k * (1.3 / 11) + 0.05, 'step', { vol: 0.06 });

    /* 6 · Рассвет (88–108) */
    fx(89.3, 'plop'); fx(89.4, 'slosh');
    fx(89.65, 'clank');
    note(88, 'bass', 'C3', 1.9, 0.28, { soft: 1 }); note(90, 'bass', 'A2', 1.9, 0.28, { soft: 1 }); note(92, 'bass', 'F2', 1.9, 0.3, { soft: 1 });
    line(90, 'lead', 'E5/2 G5/2 A5/2 G5/1 E5/1 | D5/2 C5/2 D5/4', 0.08, { duty: 0.25, echo: 1 });
    fx(90.5, 'swell', { dur: 3.0, vol: 0.05 });
    // рассвет: тема целиком, ре мажор
    const up = 2;
    const tr = (s) => s.replace(/([A-G][#b]?)(\d)/g, (m0) => { const n = midi(m0) + up; const nm = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][n % 12]; return nm + (Math.floor(n / 12) - 1); });
    bass(94, tr('C3/2 G2/2 C3/2 E3/2 | G2/2 D3/2 G2/2 B2/2 | C3/2 G2/2 E3/2 C3/2 | F2/2 C3/2 F2/2 A2/2 | F2/2 C3/2 F2/2 A2/2 | C3/2 G2/2 A2/2 E3/2 | D3/2 A2/2 G2/2 D3/2 | C3/8'), 0.4);
    line(94, 'lead', tr(THEME1 + ' | ' + THEME2), 0.12, { duty: 0.25, vib: 1, echo: 1 });
    line(94, 'harm', tr('C5/4 B4/4 | B4/4 D5/4 | C5/4 E5/4 | C5/8 | A4/4 C5/4 | G4/4 A4/4 | F4/4 B4/4 | E4/8'), 0.05, { duty: 0.5, soft: 1 });
    chordArp(94, 8, ['C4-E4-G4', 'G3-B3-D4', 'C4-E4-G4', 'F3-A3-C4', 'F3-A3-C4', 'C4-E4-A4', 'D4-F4-G4', 'C4-E4-G4'].map((c) => tr(c.replace(/-/g, ' ')).replace(/ /g, '-')), 0.04);
    drums(96, 5, 'k...h.h.k...h.hh', 0.4);
    fx(95.4, 'sunrise');
    // раскрытие: каждый лепесток — нота арфы
    for (let k = 0; k < 7; k++) note(98.9 + k * 0.33, 'arp', tr(['C6', 'E6', 'G6', 'A6', 'C7', 'E7', 'G7'][k]), 0.4, 0.06, { duty: 0.125, echo: 1 });
    beep(101.85, [[700, 0], [1100, 0.08], [1500, 0.18]], 0.12);
    note(102.0, 'lead', tr('C6'), 0.1, 0.1, { duty: 0.25 }); note(102.1, 'lead', tr('E6'), 0.1, 0.1, { duty: 0.25 }); note(102.2, 'lead', tr('G6'), 0.3, 0.1, { duty: 0.25 });
    // финал
    line(104, 'lead', tr('E5/2 G5/2 A5/2 G5/2 | C6/8'), 0.09, { duty: 0.5, vib: 1, echo: 1, soft: 1 });
    note(104, 'bass', tr('F2'), 1.9, 0.3, { soft: 1 }); note(106, 'bass', tr('C2'), 2.0, 0.34, { soft: 1 });
    ['C4', 'E4', 'G4', 'B4', 'E5'].forEach((n, i) => note(106 + i * 0.06, 'harm', tr(n), 1.9 - i * 0.06, 0.035, { duty: 0.5, soft: 1 }));
    fx(103.6, 'whoosh', { dur: 1.2, vol: 0.03, hi: 1 });

    /* ---------- Метеоры: свист и удары, привязанные к событиям фильма ---------- */
    for (const m of METEORS) {
      const t0 = m.tHit - m.fly;
      const d = hyp(m.x, m.z);
      if (t0 < 38 || t0 > 71) continue;
      if (d < 60 || m.big) fx(t0, 'whoosh', { dur: m.fly, vol: m.big ? 0.12 : clamp(0.9 / (d + 3), 0.015, 0.07) });
    }
    for (const im of IMPACTS) {
      if (im.big || im.tag.startsWith('hit')) continue;
      const d = hyp(im.x, im.z);
      fx(im.t, 'boom', { vol: clamp(1.5 / (d + 2), 0.03, 0.4), low: d < 40 ? 1 : 0.5 });
    }
    // капли — ноты: пентатоника вверх
    const penta = ['C6', 'D6', 'E6', 'G6', 'A6', 'C7', 'D7', 'E7'];
    DROPS.forEach((d, i) => {
      const tf = (d.vy + Math.sqrt(d.vy * d.vy + 2 * G_MOON * Math.max(0.01, d.y))) / G_MOON;
      fx(d.t0 + tf, 'drip', { m: midi(d.t0 > 90 ? penta[i % penta.length] : ['G6', 'E6', 'C6', 'A5'][i % 4]), vol: 0.07 });
    });
    EV.sort((a, b) => a.t - b.t);
  }

  /* ---------- Инструменты ---------- */
  function pulseWave(d) {
    const n = 48, re = new Float32Array(n), im = new Float32Array(n);
    for (let k = 1; k < n; k++) { re[k] = Math.sin(2 * Math.PI * k * d) / (Math.PI * k); im[k] = (1 - Math.cos(2 * Math.PI * k * d)) / (Math.PI * k); }
    return ctx.createPeriodicWave(re, im);
  }
  function makeNoise() {
    const len = ctx.sampleRate;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let r = 0x1234;
    for (let i = 0; i < len; i++) { r ^= r << 13; r ^= r >>> 17; r ^= r << 5; d[i] = ((r >>> 0) / 4294967296) * 2 - 1; }
    // «металлический» шум: короткий повторяющийся отрезок, как у восьмибитных приставок
    metalBuf = ctx.createBuffer(1, 93 * 64, ctx.sampleRate);
    const m = metalBuf.getChannelData(0);
    for (let i = 0; i < m.length; i++) m[i] = d[i % 93];
  }
  function env(g, t, a, peak, dur, rel, soft) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    if (soft) g.gain.setTargetAtTime(peak * 0.7, t + a, dur * 0.5);
    else g.gain.setTargetAtTime(peak * 0.55, t + a, 0.08);
    g.gain.setValueAtTime(soft ? peak * 0.7 * Math.exp(-(dur - a) / (dur * 0.5)) : peak * 0.55, t + Math.max(a, dur));
    g.gain.linearRampToValueAtTime(0.0001, t + dur + rel);
  }
  function track(node, end) { live.add(node); node.onended = () => live.delete(node); node.stop(end); }

  function playNote(e, at) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    if (e.ch === 'bass') o.type = 'triangle';
    else o.setPeriodicWave(waves[e.duty || 0.25] || waves[0.25]);
    o.frequency.setValueAtTime(hz(e.m), at);
    if (e.vib) {
      const l = ctx.createOscillator(), lg = ctx.createGain();
      l.frequency.value = 5.2; lg.gain.setValueAtTime(0, at); lg.gain.linearRampToValueAtTime(14, at + Math.min(0.3, e.dur));
      l.connect(lg); lg.connect(o.detune); l.start(at); track(l, at + e.dur + 0.2);
    }
    const vol = e.vol * (e.ch === 'bass' ? 1.1 : 1);
    env(g, at, e.soft ? 0.03 : 0.006, vol, e.dur, e.soft ? 0.12 : 0.03, e.soft);
    o.connect(g);
    g.connect(e.ch === 'bass' ? music : music);
    if (e.echo) g.connect(echoIn);
    o.start(at); track(o, at + e.dur + 0.25);
  }
  function noiseSrc(at, dur, buf) {
    const s = ctx.createBufferSource();
    s.buffer = buf || noiseBuf; s.loop = true;
    s.start(at, Math.random() * 0.5); track(s, at + dur);
    return s;
  }
  function playFx(e, at) {
    const k = e.kind;
    if (k === 'muffle') { sfxLP.frequency.setTargetAtTime(e.on ? 420 : 18000, at, e.on ? 0.08 : 0.25); return; }
    if (k === 'beep') {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.setPeriodicWave(waves[e.duty || 0.25]);
      const p = e.path;
      o.frequency.setValueAtTime(p[0][0], at);
      for (let i = 1; i < p.length; i++) o.frequency.linearRampToValueAtTime(p[i][0], at + p[i][1]);
      const dur = p[p.length - 1][1] + 0.04;
      g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(e.vol, at + 0.01);
      g.gain.setValueAtTime(e.vol, at + dur - 0.03); g.gain.linearRampToValueAtTime(0.0001, at + dur);
      o.connect(g); g.connect(voice); o.start(at); track(o, at + dur + 0.05);
      return;
    }
    if (k === 'kick' || k === 'land') {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(k === 'land' ? 180 : 150, at); o.frequency.exponentialRampToValueAtTime(40, at + 0.12);
      const v = e.vol || 0.3;
      g.gain.setValueAtTime(v, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.18);
      o.connect(g); g.connect(k === 'land' ? sfx : music); o.start(at); track(o, at + 0.2);
      return;
    }
    // всё остальное — шум через фильтр
    const cfg = {
      snare: { f: 1800, q: 0.8, type: 'bandpass', a: 0.002, d: 0.12, v: e.vol || 0.3, bus: music },
      hat: { f: 8000, q: 0.6, type: 'highpass', a: 0.001, d: e.open ? 0.12 : 0.035, v: e.vol || 0.1, bus: music, metal: true },
      step: { f: 2600, q: 1.2, type: 'bandpass', a: 0.001, d: 0.03, v: e.vol || 0.08, bus: sfx },
      tick: { f: 5000, q: 1, type: 'bandpass', a: 0.001, d: 0.02, v: 0.06, bus: sfx },
      click: { f: 3000, q: 2, type: 'bandpass', a: 0.001, d: 0.025, v: 0.12, bus: sfx },
      rattle: { f: 3500, q: 3, type: 'bandpass', a: 0.001, d: 0.05, v: e.vol || 0.1, bus: sfx, metal: true },
      scratch: { f: 4200, q: 2, type: 'bandpass', a: 0.01, d: 0.18, v: 0.05, bus: sfx },
      pop: { f: 1200, q: 1, type: 'bandpass', a: 0.001, d: 0.06, v: 0.2, bus: sfx },
      clank: { f: 2200, q: 6, type: 'bandpass', a: 0.001, d: 0.14, v: 0.12, bus: sfx, metal: true },
      skid: { f: 1500, q: 0.7, type: 'bandpass', a: 0.02, d: 0.45, v: 0.12, bus: sfx, sweep: 500 },
      slide: { f: 1200, q: 0.7, type: 'bandpass', a: 0.02, d: 0.5, v: 0.14, bus: sfx, sweep: 400 },
      hiss: { f: 5000, q: 0.5, type: 'highpass', a: 0.2, d: e.dur || 1, v: 0.03, bus: sfx },
      slosh: { f: 700, q: 2, type: 'bandpass', a: 0.05, d: 0.35, v: 0.1, bus: sfx, sweep: 1400 },
      whoosh: { f: e.hi ? 3500 : 1600, q: 1.4, type: 'bandpass', a: (e.dur || 1) * 0.7, d: (e.dur || 1) * 0.3, v: e.vol || 0.05, bus: sfx, sweep: e.hi ? 900 : 300 },
      swell: { f: 900, q: 0.8, type: 'bandpass', a: (e.dur || 1) * 0.8, d: (e.dur || 1) * 0.2, v: e.vol || 0.1, bus: sfx, sweep: 4000 },
      roar: { f: 400, q: 0.6, type: 'lowpass', a: (e.dur || 1) * 0.95, d: 0.05, v: 0.35, bus: sfx, sweep: 3000 },
      boom: { f: 300 * (e.low || 1), q: 0.7, type: 'lowpass', a: 0.004, d: 0.5, v: e.vol || 0.2, bus: sfx },
      bigboom: { f: 900, q: 0.5, type: 'lowpass', a: 0.003, d: 2.2, v: 0.8, bus: master, sweep: 80 },
      zap: { f: 2500, q: 3, type: 'bandpass', a: 0.001, d: 0.25, v: 0.22, bus: sfx, metal: true },
      creak: { f: 600, q: 8, type: 'bandpass', a: 0.05, d: e.dur || 0.5, v: 0.1, bus: sfx, sweep: 900, metal: true },
      sunrise: { f: 6000, q: 0.5, type: 'highpass', a: 1.2, d: 2, v: 0.03, bus: sfx },
    }[k];
    if (k === 'drip' || k === 'plop' || k === 'crystal' || k === 'ring') {
      const o = ctx.createOscillator(), g = ctx.createGain();
      if (k === 'ring') { o.type = 'sine'; o.frequency.value = 3600; g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(0.025, at + 0.05); g.gain.exponentialRampToValueAtTime(0.0005, at + (e.dur || 4)); o.connect(g); g.connect(master); o.start(at); track(o, at + (e.dur || 4) + 0.1); return; }
      if (k === 'crystal') {
        [0, 4, 7, 11, 14].forEach((iv, i) => { const oo = ctx.createOscillator(), gg = ctx.createGain(); oo.type = 'triangle'; oo.frequency.value = hz(88 + iv); const tt = at + i * 0.05; gg.gain.setValueAtTime(0.0001, tt); gg.gain.linearRampToValueAtTime(0.06, tt + 0.005); gg.gain.exponentialRampToValueAtTime(0.0005, tt + 0.8); oo.connect(gg); gg.connect(sfx); gg.connect(echoIn); oo.start(tt); track(oo, tt + 0.85); });
        return;
      }
      o.type = k === 'plop' ? 'sine' : 'triangle';
      const f0 = k === 'plop' ? 520 : hz(e.m || 84);
      o.frequency.setValueAtTime(f0 * (k === 'plop' ? 1 : 1.5), at);
      o.frequency.exponentialRampToValueAtTime(k === 'plop' ? 140 : f0, at + (k === 'plop' ? 0.22 : 0.03));
      const v = k === 'plop' ? 0.25 : e.vol || 0.07;
      g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(v, at + 0.004); g.gain.exponentialRampToValueAtTime(0.0005, at + (k === 'plop' ? 0.3 : 0.35));
      o.connect(g); g.connect(sfx); if (k === 'drip') g.connect(echoIn);
      o.start(at); track(o, at + 0.4);
      return;
    }
    if (!cfg) return;
    const s = noiseSrc(at, cfg.a + cfg.d + 0.05, cfg.metal ? metalBuf : noiseBuf);
    const f = ctx.createBiquadFilter();
    f.type = cfg.type; f.Q.value = cfg.q;
    f.frequency.setValueAtTime(cfg.f, at);
    if (cfg.sweep) f.frequency.exponentialRampToValueAtTime(cfg.sweep, at + cfg.a + cfg.d);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(cfg.v, at + cfg.a);
    g.gain.exponentialRampToValueAtTime(0.0005, at + cfg.a + cfg.d);
    s.connect(f); f.connect(g); g.connect(cfg.bus);
    if (k === 'boom' || k === 'bigboom') { // подложка: треугольник с падением высоты
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = 'triangle'; o.frequency.setValueAtTime(k === 'bigboom' ? 90 : 120, at); o.frequency.exponentialRampToValueAtTime(30, at + cfg.d);
      og.gain.setValueAtTime(cfg.v * 0.8, at); og.gain.exponentialRampToValueAtTime(0.0005, at + cfg.d);
      o.connect(og); og.connect(cfg.bus); o.start(at); track(o, at + cfg.d + 0.05);
    }
  }

  /* ---------- Планировщик ---------- */
  function pump() {
    if (!running) return;
    const now = filmTime();
    const until = now + 0.35;
    for (const e of EV) {
      if (e.t < planned) continue;
      if (e.t >= until) break;
      const at = t0Ctx + (e.t - t0Film);
      if (at < ctx.currentTime - 0.02) continue;
      if (e.type === 'note') playNote(e, Math.max(at, ctx.currentTime));
      else playFx(e, Math.max(at, ctx.currentTime));
    }
    planned = until;
  }
  function filmTime() { return ctx ? t0Film + (ctx.currentTime - t0Ctx) : 0; }
  function silenceAll() {
    const now = ctx.currentTime;
    for (const n of live) { try { n.stop(now + 0.03); } catch (e) { /* уже остановлен */ } }
    live.clear();
  }

  return {
    ready: false,
    init() {
      if (this.ready) { if (ctx.state === 'suspended') ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 3; comp.attack.value = 0.005; comp.release.value = 0.2;
      master = ctx.createGain(); master.gain.value = 0.55;
      master.connect(comp); comp.connect(ctx.destination);
      music = ctx.createGain(); music.gain.value = 0.9; music.connect(master);
      voice = ctx.createGain(); voice.gain.value = 0.9; voice.connect(master);
      sfxLP = ctx.createBiquadFilter(); sfxLP.type = 'lowpass'; sfxLP.frequency.value = 18000; sfxLP.Q.value = 0.7;
      sfx = ctx.createGain(); sfx.gain.value = 1; sfx.connect(sfxLP); sfxLP.connect(master);
      // космическое эхо: задержка с затухающей петлёй
      echoIn = ctx.createGain(); echoIn.gain.value = 0.28;
      const dl = ctx.createDelay(1.0); dl.delayTime.value = 0.375;
      const fb = ctx.createGain(); fb.gain.value = 0.32;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2800;
      echoIn.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(master);
      waves = { 0.125: pulseWave(0.125), 0.25: pulseWave(0.25), 0.5: pulseWave(0.5) };
      makeNoise();
      buildScore();
      this.ready = true;
    },
    start(t) {
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume();
      silenceAll();
      running = true;
      t0Ctx = ctx.currentTime + 0.05; t0Film = t; planned = t;
      // «заглушение» снаружи укрытия — по текущему моменту
      sfxLP.frequency.cancelScheduledValues(ctx.currentTime);
      sfxLP.frequency.setValueAtTime(t >= 66 && t < 69 ? 420 : 18000, ctx.currentTime);
      pump();
      clearInterval(timer);
      timer = setInterval(pump, 60);
    },
    stop() {
      running = false;
      clearInterval(timer); timer = 0;
      if (ctx) silenceAll();
    },
    release() { // без обрыва: новые события не ставятся, звучащее доигрывает
      running = false;
      clearInterval(timer); timer = 0;
    },
    running() { return running && !!ctx && ctx.state === 'running'; },
    filmTime,
  };
})();
