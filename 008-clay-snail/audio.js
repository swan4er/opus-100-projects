/* Улитка идёт на концерт — звук. Всё синтезируется Web Audio: вальс, трели сверчков, шорохи.
   Партитура — список событий со временем фильма; планировщик ставит их в очередь с упреждением,
   поэтому звук точно совпадает с кадрами и переживает перемотку. */
window.AUDIO = (() => {
  'use strict';
  let ctx = null, master = null, comp = null, dryIn = null, gardenRev = null, shellRev = null;
  let session = null, noiseBuf = null;
  let muted = false, run = false, t0Film = 0, t0Ctx = 0, cursor = 0, scheduled = 0;
  const LOOK = 0.35;
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const rnd = (() => { let s = 12345; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();

  // ---------------------------------------------------------------- нотная запись
  // 'F4:1 A4:1 C5:1 | ...' → [[доля, midi, длительность], ...]
  const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function parse(str) {
    const out = []; let beat = 0;
    for (const tok of str.replace(/\|/g, ' ').split(/\s+/).filter(Boolean)) {
      const [n, d] = tok.split(':'); const dur = parseFloat(d || '1');
      if (n !== 'r') {
        const m = /^([A-G])(b|#)?(\d)$/.exec(n);
        const midi = 12 * (parseInt(m[3], 10) + 1) + NOTE[m[1]] + (m[2] === 'b' ? -1 : m[2] === '#' ? 1 : 0);
        out.push([beat, midi, dur]);
      }
      beat += dur;
    }
    return out;
  }
  const THEME = 'F4:1 A4:1 C5:1 | F5:2 E5:1 | D5:1 C5:1 A4:1 | C5:3 | Bb4:1 G4:1 Bb4:1 | D5:2 C5:1 | Bb4:1 A4:1 G4:1 | F4:3';
  const THEME_MIN = 'F4:1 Ab4:1 C5:1 | F5:2 Eb5:1 | Db5:1 C5:1 Ab4:1 | C5:3';
  const CHORDS = [[53, 57, 60], [53, 57, 60], [46, 53, 58], [48, 53, 57], [43, 50, 55], [46, 50, 53], [48, 52, 58], [41, 48, 57]];

  // ---------------------------------------------------------------- партитура
  const EV = [];
  const at = (t, fn, ...a) => EV.push([t, fn, a]);
  function melody(t0, bpm, str, fn, vel = 0.5, transpose = 0, maxBeats = 1e9) {
    const b = 60 / bpm;
    for (const [beat, m, d] of parse(str)) if (beat < maxBeats) at(t0 + beat * b, fn, mtof(m + transpose), d * b, vel);
  }
  function waltz(t0, bpm, bars, vel = 0.4, from = 0) {
    const b = 60 / bpm;
    for (let i = 0; i < bars; i++) {
      const c = CHORDS[(i + from) % 8];
      const tb = t0 + i * 3 * b;
      at(tb, 'bass', mtof(c[0] - 12), b * 1.6, vel);
      at(tb + b, 'pluck', mtof(c[1]), b, vel * 0.55); at(tb + b, 'pluck', mtof(c[2]), b, vel * 0.5);
      at(tb + 2 * b, 'pluck', mtof(c[1]), b, vel * 0.5); at(tb + 2 * b, 'pluck', mtof(c[2]), b, vel * 0.45);
    }
  }
  function birds(t0, t1, dens) { for (let t = t0; t < t1; t += 0.5 + rnd() * dens) at(t, 'bird', 2400 + rnd() * 1800, 0.12 + rnd() * 0.1); }
  function crickets(t0, t1, dens, vol) { for (let t = t0; t < t1; t += 0.35 + rnd() * dens) at(t, 'chirp', 4200 + rnd() * 600, vol * (0.5 + rnd() * 0.5)); }

  // Сцена 1. Утро
  at(0, 'pad', [53, 60, 65, 69], 5.4, 0.16);
  birds(0.4, 10, 1.2);
  melody(1.0, 150, 'F5:1 A5:1 C6:1 F6:2', 'bell', 0.28);
  // титр: буквы выдавливаются волной — ксилофон
  for (let i = 0; i < 9; i++) at(5.72 + i * 0.14, 'xylo', mtof(65 + [0, 4, 7, 12, 16, 19, 24, 19, 24][i]), 0.3);
  melody(7.2, 108, 'F4:1 A4:1 C5:1 | F5:2 E5:1', 'bell', 0.3);
  waltz(7.2, 108, 2, 0.3);
  at(9.55, 'bell', mtof(77), 1.2, 0.25);
  // пробуждение
  at(10.3, 'creak', 0.4); at(10.8, 'creak', 0.3);
  at(11.15, 'pop', 0.7);
  at(11.55, 'boing', 520, 0.35); at(11.9, 'boing', 640, 0.35);
  at(12.45, 'yawn', 1.3, 0.35);
  at(14.1, 'rattle', 0.3);
  melody(10.4, 60, 'F3:2 C3:2', 'bassoon', 0.3);
  at(15.55, 'gliss', 72, 12, 0.3);
  at(15.6, 'pad', [58, 62, 65, 69], 1.6, 0.1);
  birds(10.2, 17, 1.6);
  // афиша: по звоночку на строку
  [18.2, 18.82, 19.44, 20.06].forEach((t, i) => at(t, 'bell', mtof([77, 76, 74, 72][i]), 0.9, 0.2));
  melody(17.3, 108, 'F5:1 A5:1 C6:1 | F6:2', 'trill', 0.06);
  // радость
  at(21.35, 'gliss', 65, 17, 0.35);
  at(21.75, 'hop', 0.4); at(22.17, 'squish', 0.35); at(22.3, 'hop', 0.35); at(22.72, 'squish', 0.3);
  melody(21.4, 180, 'C5:1 F5:1 A5:1 C6:2 A5:1 C6:3', 'pluck', 0.4);
  at(23.6, 'pad', [53, 60, 62, 67], 4.3, 0.12);
  at(24.2, 'slide', 500, 900, 0.7, 0.18);
  // вдаль
  at(25.0, 'wind', 3.0, 0.18);
  melody(25.4, 108, 'F5:1 A5:1 C6:1', 'trill', 0.035);
  // титры-шутка
  for (let i = 0; i < 9; i++) at(28.17 + i * 0.12, 'xylo', mtof(72 + [0, 2, 4, 5, 7, 9, 11, 12, 16][i]), 0.22);
  at(28.2, 'pad', [53, 57, 60, 65], 2.6, 0.1);
  at(31.45, 'tuba', mtof(48), 0.45, 0.55); at(31.95, 'tuba', mtof(41), 0.9, 0.55);
  // в путь: тема маршем
  melody(33.6, 108, THEME, 'bassoon', 0.32, -12, 12);
  waltz(33.6, 108, 2, 0.32);
  for (let t = 34.6; t < 37.4; t += 0.52) at(t, 'rustle', 0.28, 0.16);
  birds(33.2, 37.5, 1.8);

  // Сцена 2. Малина
  melody(37.5, 216, THEME, 'xylo', 0.3, 12);
  for (let t = 37.5; t < 42; t += 0.139) at(t, 'tick', 0.12);
  for (let t = 42.0; t < 43.2; t += 0.3) at(t, 'rustle', 0.25, 0.18);
  at(43.7, 'gliss', 70, 14, 0.3); at(43.75, 'pad', [58, 62, 65, 69, 74], 2.2, 0.14);
  [44.9, 45.5, 45.9, 46.2].forEach((t) => at(t, 'tick', 0.45));
  melody(46.5, 90, 'Bb2:1 F2:1', 'bassoon', 0.4);
  at(47.2, 'squish', 0.25);
  for (let k = 0; k < 10; k++) at(48.3 + k * 0.36 + 0.1, 'munch', 0.45 + k * 0.02);
  melody(48.3, 166, 'F2:1 C3:1 F2:1 C3:1 F2:1 C3:1 Bb1:1 F2:1 C2:1 G2:1 C2:1 F2:2', 'tuba', 0.3);
  at(52.35, 'hic', 0.5);
  at(53.3, 'yawn', 1.4, 0.32);
  melody(54.2, 70, THEME, 'musicbox', 0.22, 12, 10);
  at(55.6, 'snore', 2.4, 0.3); at(57.0, 'snore', 1.7, 0.3);

  // Сцена 3. Закат
  at(58.2, 'violinTune', 3.0, 0.1);
  crickets(57.2, 61, 1.2, 0.08);
  at(58.4, 'tick', 0.3);
  at(59.8, 'stab', 0.7);
  // галоп
  const gal = 'F4:0.5 A4:0.5 C5:0.5 A4:0.5 F4:0.5 A4:0.5 C5:0.5 A4:0.5 G4:0.5 Bb4:0.5 D5:0.5 Bb4:0.5 G4:0.5 Bb4:0.5 C5:0.5 E5:0.5 F5:0.5 C5:0.5 A4:0.5 C5:0.5 F5:1';
  melody(61.5, 170, gal, 'pluck', 0.45, 12);
  melody(61.5, 170, 'F2:1 C3:1 F2:1 C3:1 G2:1 D3:1 C3:1 G2:1 F2:1 C3:1', 'tuba', 0.35);
  for (let t = 61.6; t < 64.6; t += 0.18) at(t, 'rustle', 0.1, 0.12);
  at(61.55, 'whoosh', 2.8, 0.18, 1);
  at(64.95, 'slide', 1400, 300, 0.8, 0.22);
  at(66.2, 'sigh', 0.25);
  // далеко начинается концерт
  melody(65.8, 108, THEME, 'trill', 0.05, 0, 21);
  waltz(65.8, 108, 3, 0.07);
  at(68.4, 'ding', 0.35);
  at(69.2, 'pop', 0.5);
  [69.45, 69.75, 70.05].forEach((t) => at(t, 'creak', 0.28));
  // качение
  at(70.3, 'rumble', 6.2, 0.35);
  at(70.3, 'whoosh', 5.8, 0.2, 1);
  [72.4, 73.05, 74.25, 74.7].forEach((t) => at(t, 'thud', 0.6));
  at(73.25, 'boing', 180, 0.6);
  melody(71.2, 300, 'C4:1 D4:1 E4:1 F4:1 G4:1 A4:1 Bb4:1 C5:1 D5:1 E5:1 F5:2', 'xylo', 0.3);
  melody(71.8, 108, 'Bb4:1 G4:1 Bb4:1 | D5:2 C5:1 | Bb4:1 A4:1 G4:1 | F4:3', 'trill', 0.08);
  waltz(71.8, 108, 4, 0.09, 4);
  at(76.3, 'pad', [53, 60, 65, 69], 2.0, 0.08);
  at(76.45, 'applause', 2.6, 0.22);

  // Сцена 4. Опоздала
  at(77.0, 'rumble', 1.4, 0.2);
  at(78.4, 'clonk', 0.4);
  for (let t = 77.2; t < 82; t += 0.23) at(t, 'step', 0.07);
  [78.4, 79.2, 79.9, 80.5, 81.0, 81.4].forEach((t, i) => at(t, 'tink', mtof(88 - i * 2), 0.18));
  at(77.0, 'wind', 14, 0.1);
  crickets(79, 91, 2.5, 0.04);
  at(83.0, 'warble', 1.6, 0.2);
  at(84.8, 'bell', mtof(81), 0.8, 0.18);
  melody(85.3, 72, THEME_MIN, 'reed', 0.3);
  at(85.3, 'pad', [41, 48, 53, 56], 9.0, 0.08);
  at(86.8, 'sigh', 0.3);
  at(87.5, 'fwump', 0.3);

  // Сцена 5. Раковина
  [91.0, 91.73, 92.47].forEach((t) => at(t, 'hop', 0.25));
  at(93.2, 'knock', 0.35);
  at(93.0, 'shellMix', 0.85);
  melody(94.0, 150, 'F5:0.75 A5:0.75 C6:0.75 F6:0.75', 'violin', 0.3);
  at(95.35, 'chirp', 5200, 0.25);
  melody(96.0, 150, 'F6:0.5 E6:0.5 D6:0.5 C6:1', 'violin', 0.34);
  at(97.2, 'knock', 0.5); at(97.5, 'knock', 0.5);
  at(97.45, 'squeak', 0.2);
  at(98.6, 'whistle', 0.3);
  [98.8, 99.3, 99.8, 100.3, 100.8, 101.2].forEach((t) => at(t, 'hop', 0.18));
  [99.1, 99.5, 99.8, 100.1, 100.4, 100.7, 101.0, 101.3].forEach((t, i) => at(t, 'tink', mtof(76 + [0, 2, 4, 5, 7, 9, 11, 12][i]), 0.16));
  at(100.1, 'pop', 0.35);
  at(101.45, 'tap', 0.4); at(101.75, 'tap', 0.4);
  // концерт на раковине: тема вальсом — трели сверчков, скрипки, пиццикато
  melody(102.0, 108, THEME, 'trill', 0.3, 12);
  melody(102.0, 108, THEME, 'violin', 0.16);
  waltz(102.0, 108, 8, 0.34);
  for (let i = 0; i < 8; i++) at(102.0 + i * 1.667, 'pad', CHORDS[i].map((m) => m + 12), 1.7, 0.06);
  [104.5, 107.8, 111.1].forEach((t) => at(t, 'gliss', 77, 10, 0.12));
  at(115.3, 'bell', mtof(89), 2.0, 0.2);
  melody(115.6, 90, 'Bb5:1 A5:1 G5:1 | F5:3', 'bell', 0.24);
  at(118.0, 'chirp', 4800, 0.3); at(118.2, 'pluck', mtof(53), 1.5, 0.45); at(118.2, 'pad', [53, 60, 65, 69], 1.8, 0.1);
  EV.sort((a, b) => a[0] - b[0]);

  // ---------------------------------------------------------------- инструменты
  function env(g, t, a, peak, d, sus, r, end) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setTargetAtTime(peak * sus, t + a, d);
    g.gain.setTargetAtTime(0.0001, end, r);
  }
  function mk(type, f) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; return o; }
  function gainNode(v = 0) { const g = ctx.createGain(); g.gain.value = v; return g; }
  function filt(type, f, q = 0.7) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }
  function noiseSrc() { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; return s; }
  function stopAll(nodes, t) { for (const n of nodes) { try { n.start(n.__t || 0); } catch (e) { /* уже запущен */ } try { n.stop(t); } catch (e) { /* уже остановлен */ } } }

  const I = {
    pluck(t, out, f, dur, vel) {
      const o = mk('triangle', f), o2 = mk('sine', f * 2), g = gainNode(), lp = filt('lowpass', Math.min(9000, f * 6), 1.2);
      o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(out);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel * 0.5, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25 + dur * 0.4);
      lp.frequency.setValueAtTime(Math.min(9000, f * 8), t); lp.frequency.exponentialRampToValueAtTime(Math.max(200, f * 1.5), t + 0.2);
      o.__t = t; o2.__t = t; stopAll([o, o2], t + 0.4 + dur * 0.5);
    },
    bass(t, out, f, dur, vel) { I.pluck(t, out, f, dur * 1.4, vel * 1.3); },
    bell(t, out, f, dur, vel) {
      const o = mk('sine', f), m = mk('sine', f * 3.5), mg = gainNode(f * 1.2), g = gainNode();
      m.connect(mg); mg.connect(o.frequency); o.connect(g); g.connect(out);
      mg.gain.setValueAtTime(f * 1.4, t); mg.gain.exponentialRampToValueAtTime(1, t + 0.8);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel * 0.4, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2 + dur);
      o.__t = t; m.__t = t; stopAll([o, m], t + 1.4 + dur);
    },
    xylo(t, out, f, a, b) {
      const vel = b === undefined ? a : b;
      const o = mk('sine', f), o2 = mk('sine', f * 3.9), g = gainNode(), g2 = gainNode();
      o.connect(g); o2.connect(g2); g2.connect(g); g.connect(out);
      g2.gain.setValueAtTime(0.4, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel * 0.5, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.__t = t; o2.__t = t; stopAll([o, o2], t + 0.4);
    },
    musicbox(t, out, f, dur, vel) {
      const o = mk('sine', f), o2 = mk('sine', f * 2.01), g = gainNode(), g2 = gainNode(0.3);
      o.connect(g); o2.connect(g2); g2.connect(g); g.connect(out);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel * 0.45, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
      o.__t = t; o2.__t = t; stopAll([o, o2], t + 1.4);
    },
    reed(t, out, f, dur, vel) {
      const o = mk('square', f), lp = filt('lowpass', f * 3.2, 0.8), g = gainNode(), vib = mk('sine', 5), vg = gainNode(f * 0.006);
      vib.connect(vg); vg.connect(o.frequency); o.connect(lp); lp.connect(g); g.connect(out);
      env(g, t, 0.07, vel * 0.22, 0.3, 0.8, 0.12, t + dur * 0.95);
      o.__t = t; vib.__t = t; stopAll([o, vib], t + dur + 0.8);
    },
    bassoon(t, out, f, dur, vel) {
      const o = mk('sawtooth', f), lp = filt('lowpass', 900, 2), bp = filt('bandpass', 500, 1.2), g = gainNode();
      o.connect(lp); lp.connect(bp); bp.connect(g); g.connect(out);
      env(g, t, 0.05, vel * 0.5, 0.2, 0.75, 0.08, t + dur * 0.9);
      o.__t = t; stopAll([o], t + dur + 0.6);
    },
    tuba(t, out, f, dur, vel) {
      const o = mk('sawtooth', f), lp = filt('lowpass', 420, 1.5), g = gainNode();
      o.connect(lp); lp.connect(g); g.connect(out);
      env(g, t, 0.03, vel * 0.55, 0.15, 0.6, 0.06, t + dur * 0.8);
      o.frequency.setValueAtTime(f * 0.97, t); o.frequency.linearRampToValueAtTime(f, t + 0.06);
      o.__t = t; stopAll([o], t + dur + 0.5);
    },
    violin(t, out, f, dur, vel) {
      const a = mk('sawtooth', f), b = mk('sawtooth', f * 1.004), lp = filt('lowpass', 2800, 1), g = gainNode(), vib = mk('sine', 5.6), vg = gainNode(0);
      vib.connect(vg); vg.connect(a.frequency); vg.connect(b.frequency);
      vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * 0.008, t + 0.25);
      a.connect(lp); b.connect(lp); lp.connect(g); g.connect(out);
      env(g, t, 0.09, vel * 0.16, 0.3, 0.85, 0.1, t + dur);
      a.__t = t; b.__t = t; vib.__t = t; stopAll([a, b, vib], t + dur + 0.7);
    },
    // трель сверчка, собранная в ноту: тон с частой амплитудной модуляцией
    trill(t, out, f, dur, vel) {
      const o = mk('sine', f), o2 = mk('triangle', f * 2), am = mk('square', 27), amg = gainNode(0.5), g = gainNode(), car = gainNode(0.5);
      am.connect(amg); amg.connect(car.gain);
      o.connect(car); o2.connect(car); car.connect(g); g.connect(out);
      o.frequency.setValueAtTime(f * 1.03, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
      env(g, t, 0.02, vel * 0.35, 0.4, 0.7, 0.05, t + dur * 0.9);
      o.__t = t; o2.__t = t; am.__t = t; stopAll([o, o2, am], t + dur + 0.4);
    },
    pad(t, out, notes, dur, vel) {
      const g = gainNode(), lp = filt('lowpass', 1400, 0.5);
      lp.connect(g); g.connect(out);
      env(g, t, Math.min(0.8, dur * 0.3), vel * 0.3, 0.5, 0.9, 0.5, t + dur);
      const os = notes.map((m, i) => { const o = mk(i % 2 ? 'triangle' : 'sawtooth', mtof(m)); o.detune.value = (i - 1.5) * 4; o.connect(lp); o.__t = t; return o; });
      stopAll(os, t + dur + 2.5);
    },
    gliss(t, out, m0, n, vel) { for (let i = 0; i < n; i++) I.xylo(t + i * 0.035, out, mtof(m0 + [0, 2, 4, 5, 7, 9, 11][i % 7] + 12 * Math.floor(i / 7)), vel * 0.7); },
    // шумы
    noise(t, out, dur, type, f0, f1, q, vel) {
      const s = noiseSrc(), fl = filt(type, f0, q), g = gainNode();
      s.connect(fl); fl.connect(g); g.connect(out);
      fl.frequency.setValueAtTime(f0, t); fl.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel, t + Math.min(0.02, dur * 0.2)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.__t = t; stopAll([s], t + dur + 0.05);
    },
    rustle(t, out, dur, vel) { I.noise(t, out, dur, 'bandpass', 4200 + rnd() * 1500, 2600, 1.4, vel * 0.5); },
    pop(t, out, vel) {
      const o = mk('sine', 420), g = gainNode();
      o.connect(g); g.connect(out);
      o.frequency.setValueAtTime(520, t); o.frequency.exponentialRampToValueAtTime(110, t + 0.09);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel * 0.7, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      o.__t = t; stopAll([o], t + 0.2);
      I.noise(t, out, 0.05, 'highpass', 2000, 1500, 0.7, vel * 0.3);
    },
    boing(t, out, f, vel) {
      const o = mk('sine', f), lfo = mk('sine', 14), lg = gainNode(f * 0.12), g = gainNode();
      lfo.connect(lg); lg.connect(o.frequency); o.connect(g); g.connect(out);
      lg.gain.setValueAtTime(f * 0.18, t); lg.gain.exponentialRampToValueAtTime(1, t + 0.6);
      o.frequency.setValueAtTime(f * 0.7, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel * 0.5, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      o.__t = t; lfo.__t = t; stopAll([o, lfo], t + 0.65);
    },
    hop(t, out, vel) {
      const o = mk('sine', 300), g = gainNode();
      o.connect(g); g.connect(out);
      o.frequency.setValueAtTime(260, t); o.frequency.exponentialRampToValueAtTime(700, t + 0.12);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel * 0.35, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.__t = t; stopAll([o], t + 0.2);
    },
    squish(t, out, vel) {
      I.noise(t, out, 0.16, 'lowpass', 900, 180, 2, vel * 0.5);
      const o = mk('sine', 150), g = gainNode(); o.connect(g); g.connect(out);
      o.frequency.setValueAtTime(170, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.12);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel * 0.4, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
      o.__t = t; stopAll([o], t + 0.2);
    },
    creak(t, out, vel) {
      const o = mk('sawtooth', 90), bp = filt('bandpass', 700, 6), g = gainNode();
      o.connect(bp); bp.connect(g); g.connect(out);
      o.frequency.setValueAtTime(80, t); o.frequency.linearRampToValueAtTime(130, t + 0.25);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel * 0.25, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.__t = t; stopAll([o], t + 0.35);
    },
    yawn(t, out, dur, vel) {
      const o = mk('sawtooth', 230), bp = filt('bandpass', 900, 3), g = gainNode();
      o.connect(bp); bp.connect(g); g.connect(out);
      o.frequency.setValueAtTime(240, t); o.frequency.linearRampToValueAtTime(300, t + dur * 0.3); o.frequency.linearRampToValueAtTime(150, t + dur);
      bp.frequency.setValueAtTime(700, t); bp.frequency.linearRampToValueAtTime(1100, t + dur * 0.35); bp.frequency.linearRampToValueAtTime(450, t + dur);
      env(g, t, 0.25, vel * 0.3, 0.3, 0.8, 0.15, t + dur * 0.85);
      o.__t = t; stopAll([o], t + dur + 0.6);
    },
    rattle(t, out, vel) { for (let i = 0; i < 5; i++) I.noise(t + i * 0.045, out, 0.04, 'bandpass', 2500, 2000, 3, vel * 0.4); },
    slide(t, out, f0, f1, dur, vel) {
      const o = mk('sine', f0), lfo = mk('sine', 6), lg = gainNode(f0 * 0.01), g = gainNode();
      lfo.connect(lg); lg.connect(o.frequency); o.connect(g); g.connect(out);
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      env(g, t, 0.04, vel * 0.5, 0.3, 0.9, 0.05, t + dur);
      o.__t = t; lfo.__t = t; stopAll([o, lfo], t + dur + 0.4);
    },
    wind(t, out, dur, vel) {
      const s = noiseSrc(), bp = filt('bandpass', 500, 0.8), g = gainNode();
      s.connect(bp); bp.connect(g); g.connect(out);
      env(g, t, dur * 0.3, vel * 0.25, 1, 0.9, 0.6, t + dur * 0.8);
      bp.frequency.setValueAtTime(400, t); bp.frequency.linearRampToValueAtTime(700, t + dur * 0.5); bp.frequency.linearRampToValueAtTime(350, t + dur);
      s.__t = t; stopAll([s], t + dur + 2);
    },
    tick(t, out, vel) { I.noise(t, out, 0.03, 'bandpass', 3200, 3000, 5, vel * 0.8); },
    munch(t, out, vel) { I.noise(t, out, 0.07, 'bandpass', 1800, 900, 2, vel * 0.6); I.noise(t + 0.08, out, 0.06, 'bandpass', 1400, 700, 2, vel * 0.45); },
    hic(t, out, vel) {
      const o = mk('sine', 600), g = gainNode(); o.connect(g); g.connect(out);
      o.frequency.setValueAtTime(500, t); o.frequency.exponentialRampToValueAtTime(1100, t + 0.07);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel * 0.4, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      o.__t = t; stopAll([o], t + 0.15);
    },
    snore(t, out, dur, vel) {
      I.noise(t, out, dur * 0.45, 'lowpass', 380, 260, 4, vel * 0.5);
      I.noise(t + dur * 0.5, out, dur * 0.4, 'bandpass', 1200, 600, 1, vel * 0.18);
    },
    violinTune(t, out, dur, vel) { I.violin(t, out, mtof(81), dur, vel); I.violin(t + 0.7, out, mtof(76), dur - 0.7, vel * 0.7); },
    chirp(t, out, f, vel) {
      for (let i = 0; i < 3; i++) {
        const o = mk('sine', f), g = gainNode(); o.connect(g); g.connect(out);
        const s = t + i * 0.045;
        g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(vel * 0.2, s + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.03);
        o.__t = s; stopAll([o], s + 0.04);
      }
    },
    bird(t, out, f, vel) {
      const n = 2 + Math.floor(rnd() * 3);
      for (let i = 0; i < n; i++) {
        const o = mk('sine', f), g = gainNode(); o.connect(g); g.connect(out);
        const s = t + i * 0.11, up = rnd() > 0.5;
        o.frequency.setValueAtTime(f * (up ? 0.8 : 1.2), s); o.frequency.exponentialRampToValueAtTime(f * (up ? 1.25 : 0.85), s + 0.08);
        g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(vel * 0.25, s + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.09);
        o.__t = s; stopAll([o], s + 0.1);
      }
    },
    stab(t, out, vel) {
      [53, 60, 65, 68, 72].forEach((m) => { const o = mk('sawtooth', mtof(m)), g = gainNode(), lp = filt('lowpass', 3000, 1); o.connect(lp); lp.connect(g); g.connect(out); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel * 0.12, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7); o.__t = t; stopAll([o], t + 0.75); });
      I.noise(t, out, 0.9, 'highpass', 6000, 3000, 0.5, vel * 0.3);
      const o = mk('sine', 90), g = gainNode(); o.connect(g); g.connect(out); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel * 0.6, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4); o.__t = t; stopAll([o], t + 0.45);
    },
    whoosh(t, out, dur, vel, up) { I.noise(t, out, dur, 'bandpass', up ? 400 : 2000, up ? 2200 : 300, 1.5, vel); },
    sigh(t, out, vel) { I.noise(t, out, 0.9, 'bandpass', 900, 350, 1.2, vel * 0.5); },
    ding(t, out, vel) { I.bell(t, out, mtof(96), 0.5, vel); I.bell(t + 0.08, out, mtof(91), 0.5, vel * 0.6); },
    rumble(t, out, dur, vel) {
      const s = noiseSrc(), lp = filt('lowpass', 160, 1), g = gainNode(), lfo = mk('sine', 9), lg = gainNode(0.3);
      lfo.connect(lg); lg.connect(g.gain); s.connect(lp); lp.connect(g); g.connect(out);
      env(g, t, 0.4, vel, 1, 1, 0.3, t + dur);
      s.__t = t; lfo.__t = t; stopAll([s, lfo], t + dur + 1.5);
    },
    thud(t, out, vel) {
      const o = mk('sine', 140), g = gainNode(); o.connect(g); g.connect(out);
      o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.2);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel * 0.8, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.__t = t; stopAll([o], t + 0.35);
      I.noise(t, out, 0.12, 'lowpass', 1200, 200, 1, vel * 0.4);
    },
    applause(t, out, dur, vel) { for (let i = 0; i < 70; i++) { const s = t + Math.pow(rnd(), 1.4) * dur; I.noise(s, out, 0.018, 'bandpass', 2500 + rnd() * 2500, 2000, 2, vel * (1 - (s - t) / dur) * 0.8); } },
    clonk(t, out, vel) { I.knock(t, out, vel); I.thud(t, out, vel * 0.5); },
    step(t, out, vel) { I.noise(t, out, 0.02, 'bandpass', 5000, 4000, 4, vel); },
    tink(t, out, f, vel) { I.bell(t, out, f, 0.1, vel); },
    warble(t, out, dur, vel) {
      const o = mk('sine', 500), lfo = mk('sine', 7), lg = gainNode(120), g = gainNode();
      lfo.connect(lg); lg.connect(o.frequency); o.connect(g); g.connect(out);
      o.frequency.setValueAtTime(700, t); o.frequency.linearRampToValueAtTime(350, t + dur);
      env(g, t, 0.05, vel * 0.3, 0.4, 0.8, 0.1, t + dur);
      o.__t = t; lfo.__t = t; stopAll([o, lfo], t + dur + 0.5);
    },
    fwump(t, out, vel) { I.noise(t, out, 0.3, 'lowpass', 600, 120, 1, vel * 0.6); },
    knock(t, out, vel) {
      const o = mk('sine', 720), g = gainNode(); o.connect(g); g.connect(out);
      o.frequency.setValueAtTime(760, t); o.frequency.exponentialRampToValueAtTime(520, t + 0.08);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel * 0.5, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      o.__t = t; stopAll([o], t + 0.15);
      I.noise(t, out, 0.05, 'bandpass', 1100, 900, 8, vel * 0.6);
    },
    squeak(t, out, vel) { I.slide(t, out, 1200, 1700, 0.12, vel); },
    whistle(t, out, vel) { I.slide(t, out, 1500, 2100, 0.18, vel); I.slide(t + 0.26, out, 1500, 1350, 0.25, vel); },
    tap(t, out, vel) { I.noise(t, out, 0.025, 'bandpass', 2600, 2400, 6, vel); },
  };

  // ---------------------------------------------------------------- реверберация
  function impulse(sec, decay, tone, resonances) {
    const n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const k = i / n;
        lp += tone * ((Math.random() * 2 - 1) - lp);
        let v = lp * Math.pow(1 - k, decay);
        if (resonances) for (const [f, a] of resonances) v += a * Math.sin(2 * Math.PI * f * i / ctx.sampleRate + c) * Math.pow(1 - k, decay * 1.4) * (Math.random() * 0.5 + 0.5);
        d[i] = v;
      }
    }
    return b;
  }

  // ---------------------------------------------------------------- сеанс воспроизведения
  function newSession(when) {
    if (session) {
      const old = session;
      old.bus.gain.cancelScheduledValues(ctx.currentTime);
      old.bus.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
      setTimeout(() => { try { old.bus.disconnect(); } catch (e) { /* уже отключён */ } }, 400);
    }
    const bus = gainNode(1);
    const shellSend = gainNode(0), gardenSend = gainNode(0.22);
    bus.connect(dryIn); bus.connect(gardenSend); gardenSend.connect(gardenRev); bus.connect(shellSend); shellSend.connect(shellRev);
    session = { bus, shellSend, gardenSend };
    return session;
  }
  const FX = {
    shellMix(t, s, v) { s.shellSend.gain.setTargetAtTime(v, t, 0.3); s.gardenSend.gain.setTargetAtTime(0.1, t, 0.3); },
  };
  function schedule(ev, when) {
    const [, fn, a] = ev;
    if (FX[fn]) { FX[fn](when, session, ...a); return; }
    const f = I[fn];
    if (f) { f(when, session.bus, ...a); scheduled++; }
  }
  // уровень ревербераций на момент времени (для перемотки внутрь сцен)
  function applyMix(t) {
    const shell = t >= 93.0 && t < 121 ? 0.85 : 0;
    session.shellSend.gain.setValueAtTime(shell, ctx.currentTime);
    session.gardenSend.gain.setValueAtTime(shell ? 0.1 : 0.22, ctx.currentTime);
  }

  function tick() {
    if (!run || !ctx) return;
    const now = t0Film + (ctx.currentTime - t0Ctx);
    const until = now + LOOK;
    while (cursor < EV.length && EV[cursor][0] < until) {
      const ev = EV[cursor];
      const when = t0Ctx + (ev[0] - t0Film);
      if (when >= ctx.currentTime - 0.02) schedule(ev, Math.max(when, ctx.currentTime));
      cursor++;
    }
  }

  return {
    enable() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
        master = gainNode(0.7);
        comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -16; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.2;
        dryIn = gainNode(1);
        dryIn.connect(comp); comp.connect(master); master.connect(ctx.destination);
        gardenRev = ctx.createConvolver(); gardenRev.buffer = impulse(1.4, 3.2, 0.5, null);
        shellRev = ctx.createConvolver(); shellRev.buffer = impulse(3.6, 2.2, 0.25, [[220, 0.12], [330, 0.08], [440, 0.06], [660, 0.03]]);
        const gw = gainNode(0.5), sw = gainNode(0.7);
        gardenRev.connect(gw); gw.connect(comp); shellRev.connect(sw); sw.connect(comp);
        const n = ctx.sampleRate * 2; noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      }
      if (ctx.state === 'suspended') ctx.resume();
    },
    enabled: () => !!ctx,
    play(t) {
      if (!ctx) return;
      newSession();
      t0Film = t; t0Ctx = ctx.currentTime + 0.06;
      cursor = 0; while (cursor < EV.length && EV[cursor][0] < t - 0.01) cursor++;
      applyMix(t);
      run = true;
      tick();
    },
    pause() {
      run = false;
      if (session && ctx) { session.bus.gain.setTargetAtTime(0, ctx.currentTime, 0.03); }
    },
    tick,
    running: () => run && !!ctx && ctx.state === 'running',
    filmTime(fb) { return run && ctx ? t0Film + Math.max(0, ctx.currentTime - (ctx.outputLatency || 0) - t0Ctx) : fb; },
    muted: () => muted,
    // для проверки: состояние звуковой карты и сколько нот уже поставлено в расписание
    stats: () => ({ state: ctx ? ctx.state : 'нет', time: ctx ? +ctx.currentTime.toFixed(3) : 0, latency: ctx ? (ctx.outputLatency || 0) : 0, scheduled, cursor }),
    setMuted(m) { muted = m; if (master) master.gain.setTargetAtTime(m ? 0 : 0.7, ctx.currentTime, 0.05); },
  };
})();
