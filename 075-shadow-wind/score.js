'use strict';
/* ==========================================================================
   «Девочка и ветер» · score.js
   Музыка и шумы на Web Audio, синхронные с кадром.
   · Арфа — Карплус — Стронг: щипок струны считается в буфер один раз.
   · Флейта — осциллятор с вибрато, дыханием и легато внутри фразы.
   · Ветер — шум, который каждый кадр следует силе ветра в фильме.
   · Стекло, хлопок крышки, шаги по траве, скрип мельницы, порывы.
   Размер 6/8, восьмая = 1/3 с, такт = 2 с: сцены смонтированы по тактам.
   ========================================================================== */
const Score = (() => {
  const E8 = 1 / 3; // восьмая, с
  let ac = null, master, bus, harpBus, fluteBus, sfxBus, revIn, noiseBuf = null, fluteWave = null;
  const harpBufs = new Map();
  let ready = false, muted = false;
  let t0Film = 0, t0Ctx = 0, idx = 0, running = false;
  /* Сеанс — всё, что прозвучало с последнего старта: свои регуляторы громкости перед
     шинами и список живых узлов. Пауза или перемотка гасят сеанс за ~40 мс — без щелчка. */
  let sess = null;
  let windSrc = null, windBP, windLP, windGain, windPan, whistle = null;

  /* ---------- Партитура ---------- */
  const EV = [];
  const hum = (t, i) => t + (hash(i * 97 + Math.floor(t * 31)) - 0.5) * 0.014;
  function harp(t, m, v = 0.55, pan) { EV.push({ t: hum(t, m), k: 'harp', m, v, pan }); }
  function roll(t, ms, v = 0.5, gap = 0.04) { ms.forEach((m, i) => harp(t + i * gap, m, v * (1 - i * 0.03))); }
  function gliss(t0, from, to, dur, v = 0.42) {
    const scale = [0, 2, 4, 6, 7, 9, 11]; // ре мажор от ре
    const notes = [];
    for (let m = from; m <= to; m++) if (scale.includes((m - 62 + 120) % 12)) notes.push(m);
    notes.forEach((m, i) => harp(t0 + (dur * i) / notes.length * (1 - 0.25 * (i / notes.length)), m, v * (0.7 + 0.3 * (i / notes.length))));
  }
  /** Флейта: фраза [[midi | 0 для паузы, восьмых], …]. */
  function flute(t, notes, v = 0.6, o = {}) { EV.push({ t, k: 'flute', notes: notes.map(([m, d]) => [m, d * (o.e8 || E8)]), v, vib: o.vib ?? 1 }); }
  function sfx(t, k, p = {}) { EV.push(Object.assign({ t, k }, p)); }

  /** Диатоническая терция вниз в ре мажоре — для второго голоса флейты. */
  const DMAJ = [2, 4, 6, 7, 9, 11, 1];
  function third(m) {
    const pc = ((m % 12) + 12) % 12, i = DMAJ.indexOf(pc);
    if (i < 0) return m - 3;
    const tp = DMAJ[(i + 5) % 7];
    return m - ((pc - tp + 12) % 12);
  }
  // аккорды: бас и три ноты для перебора
  const CH = {
    D: [50, [57, 62, 66]], G: [43, [55, 59, 62]], Bm: [47, [54, 59, 62]], A: [45, [57, 61, 64]], A7: [45, [55, 61, 64]],
    Em7: [40, [55, 59, 62]], Gm: [43, [55, 58, 62]], Asus: [45, [57, 62, 64]], Fs: [42, [54, 58, 61]], AC: [49, [57, 61, 64]],
    Gmaj7: [43, [54, 59, 62]], Em: [40, [55, 59, 64]],
  };
  /** Перебор 6/8 на такт: бас на первую долю, дальше волна вверх и вниз. hi — октавой выше, dense — шестнадцатыми. */
  function bar(t, name, v = 0.4, o = {}) {
    const [b, a] = CH[name];
    const up = o.hi ? 12 : 0;
    harp(t, b, v * 1.15);
    if (o.bassOnly) return;
    const pat = o.dense ? [0, 1, 2, 1, 2, 0, 1, 2, 1, 2, 1, 0] : [0, 1, 2, 1, 2, 1];
    const step = o.dense ? E8 / 2 : E8;
    pat.forEach((j, i) => { if (i === 0 && !o.dense) return; harp(t + i * step, a[j] + up + (o.dense && i > 5 ? 12 : 0), v * (0.8 + 0.2 * Math.sin(i))); });
  }

  // ——— I. Заря (0–16): тишина рассвета, зов флейты, вздох ———
  roll(0.6, [38, 45, 50, 57, 62, 66], 0.34, 0.09);
  flute(2.0, [[81, 5], [78, 2], [79, 1], [81, 4]], 0.34);
  roll(4.6, [43, 50, 55, 59, 62], 0.28, 0.1);
  roll(8.6, [47, 54, 59, 62, 66], 0.28, 0.1);
  flute(7.4, [[86, 3], [83, 2], [81, 4]], 0.28);
  flute(11.25, [[78, 1.2], [76, 1.2], [74, 3]], 0.36); // вздох
  roll(12.0, [45, 52, 57, 61], 0.3, 0.12);
  // ветер близко: тихое тремоло арфы на ля
  for (let i = 0; i < 12; i++) harp(13.0 + i * 0.25, i % 2 ? 69 : 76, 0.12 + i * 0.022);
  harp(15.0, 45, 0.4);
  // ——— ветер прилетел: глиссандо ———
  gliss(16.0, 50, 86, 1.0, 0.48);
  roll(17.0, [45, 57, 61, 64, 67, 73], 0.4, 0.05);

  // ——— II. Игра: тема А (18–34), тема Б — полёт (34–42), кода (42–46) ———
  const themeA = [
    [[74, 1], [76, 1], [78, 1], [81, 3]],
    [[79, 1], [78, 1], [76, 1], [78, 2], [74, 1]],
    [[71, 1], [74, 1], [76, 1], [78, 3]],
    [[76, 3], [69, 3]],
    [[74, 1], [76, 1], [78, 1], [81, 2], [83, 1]],
    [[86, 3], [83, 2], [81, 1]],
    [[79, 2], [78, 1], [76, 2], [73, 1]],
    [[74, 6]],
  ];
  const harmA = [['D'], ['G', 'D'], ['Bm'], ['A'], ['D'], ['G'], ['Em7', 'A7'], ['D']];
  function themeAt(t0, v, o = {}) {
    themeA.forEach((ph, i) => flute(t0 + i * 2, ph, v));
    if (o.second) themeA.forEach((ph, i) => { if (i === 1 || i === 5 || i === 6) flute(t0 + i * 2, ph.map(([m, d]) => [third(m), d]), v * 0.45); });
    harmA.forEach((hs, i) => {
      if (hs.length === 1) bar(t0 + i * 2, hs[0], o.hv || 0.36, { hi: o.hi });
      else { const [b1, b2] = hs; const h1 = CH[b1], h2 = CH[b2];
        harp(t0 + i * 2, h1[0], (o.hv || 0.36) * 1.1); [1, 2].forEach((j, q) => harp(t0 + i * 2 + (q + 1) * E8, h1[1][j], o.hv || 0.36));
        harp(t0 + i * 2 + 1, h2[0], (o.hv || 0.36) * 1.05); [1, 2].forEach((j, q) => harp(t0 + i * 2 + 1 + (q + 1) * E8, h2[1][j], o.hv || 0.36)); }
    });
  }
  themeAt(18, 0.62);
  const themeB = [[[81, 3], [86, 3]], [[85, 2], [83, 1], [81, 3]], [[83, 3], [88, 3]], [[86, 2], [85, 1], [81, 3]]];
  themeB.forEach((ph, i) => flute(34 + i * 2, ph, 0.58));
  ['D', 'AC', 'G', 'A'].forEach((c, i) => bar(34 + i * 2, c, 0.3, { dense: true }));
  // смех: игривая нисходящая фигура
  [88, 86, 85, 83, 81, 79, 78, 76].forEach((m, i) => harp(40.4 + i * 0.16, m, 0.3));
  flute(42, [[78, 2], [76, 1], [74, 2], [71, 1]], 0.46);
  flute(44, [[73, 3], [76, 3]], 0.42);
  bar(42, 'G', 0.32); bar(44, 'A7', 0.32);

  // ——— III. Банка: ветер уходит (46–52), погоня (52–56), крышка (56) ———
  flute(46, [[81, 3], [79, 2], [78, 1]], 0.5);
  flute(48, [[78, 3], [76, 2], [74, 1]], 0.46);
  flute(50, [[76, 6]], 0.44);
  bar(46, 'Gmaj7', 0.32); bar(48, 'Em7', 0.3); bar(50, 'Asus', 0.28); harp(51, 61, 0.26);
  // погоня: бег арфы, флейта рвётся вверх
  [59, 62, 66, 71, 74, 78].forEach((m, i) => harp(52.4 + i * E8, m, 0.34));
  [47, 54, 59, 62, 66, 71].forEach((m, i) => harp(54 + i * E8, m, 0.36));
  flute(53.4, [[78, 1], [79, 1], [81, 1], [83, 1], [85, 1], [86, 2]], 0.52);
  gliss(55.55, 62, 90, 0.42, 0.34);
  // ——— IV. Музыкальная шкатулка в банке (58–64): тема флажолетами, поворот в соль минор ———
  [[86, 0], [88, 1], [90, 2], [93, 3], [91, 6], [90, 7], [88, 8], [90, 9], [86, 11]].forEach(([m, e]) => harp(58.2 + e * E8 * 1.1, m, 0.2));
  roll(60.4, [50, 57, 62, 66], 0.18, 0.12);
  roll(62.0, [43, 50, 55, 58, 62, 67], 0.24, 0.16); // соль минор: тень

  // ——— V. Тишина (64–84): редкие низкие струны, флейта в си миноре, надежда ———
  harp(64.2, 38, 0.3);
  harp(68.2, 33, 0.26);
  harp(70.4, 45, 0.16);
  const minor = [[[71, 1], [73, 1], [74, 1], [78, 3]], [[76, 1], [74, 1], [73, 1], [74, 2], [71, 1]], [[67, 1], [71, 1], [73, 1], [74, 3]]];
  minor.forEach((ph, i) => flute(72 + i * 4, ph, 0.4, { e8: 2 / 3 }));
  roll(72, [35, 47, 54, 59, 62], 0.2, 0.2); roll(76, [40, 52, 55, 59, 64], 0.18, 0.2); roll(78, [43, 50, 55, 59], 0.18, 0.2); roll(80, [42, 49, 54, 58, 61], 0.18, 0.2);
  roll(82.4, [50, 57, 62, 66, 69, 74], 0.3, 0.08); // она подняла голову
  roll(83.8, [45, 52, 57, 61, 64], 0.28, 0.1);

  // ——— VI. Отпустить: подъём (84–90), банка над головой (90–92), тишина, взрыв (93) ———
  [50, 45, 47, 42, 43, 38].forEach((m, i) => harp(84.2 + i, m, 0.3));
  flute(84.4, [[69, 6], [71, 6], [74, 6]], 0.4);
  for (let i = 0; i < 12; i++) harp(90 + i * 0.16, [45, 52, 57, 61, 64, 69][i % 6] + (i >= 6 ? 12 : 0), 0.18 + i * 0.02);
  flute(90.2, [[76, 5.2]], 0.44);
  gliss(BURST_T, 50, 98, 0.9, 0.5);
  roll(BURST_T + 0.95, [38, 50, 57, 62, 66, 69, 74, 78], 0.5, 0.05);
  themeAt(94, 0.66, { second: true, hv: 0.38 });
  roll(108.0, [38, 50, 57, 64, 66, 69, 74, 76], 0.36, 0.14); // ре с ноной — светлый конец
  harp(110.6, 86, 0.22);
  harp(111.0, 81, 0.16);

  // ——— Шумы ———
  sfx(16.1, 'whoosh', { d: 1.3, g: 0.5, f0: 300, f1: 1300, p0: -0.8, p1: 0.2 });
  sfx(17.3, 'whoosh', { d: 1.0, g: 0.36, f0: 600, f1: 1600, p0: 0.1, p1: 0.7 });
  sfx(16.75, 'flutter', { d: 1.1, g: 0.2, p: 0.5 });
  sfx(18.02, 'thud', { g: 0.18 });
  sfx(18.6, 'thud', { g: 0.3 });
  sfx(20.3, 'flap', { g: 0.3 });
  sfx(33.9, 'whoosh', { d: 1.6, g: 0.5, f0: 250, f1: 1100, p0: -0.3, p1: 0.4 });
  sfx(39.6, 'thud', { g: 0.24 });
  sfx(47.0, 'whoosh', { d: 1.1, g: 0.34, f0: 500, f1: 1500, p0: 0.5, p1: -0.3 });
  sfx(49.5, 'flap', { g: 0.2 });
  sfx(52.3, 'flap', { g: 0.18 });
  sfx(52.95, 'tink', { g: 0.1 });
  sfx(53.55, 'tink', { g: 0.12 });
  sfx(55.7, 'whoosh', { d: 0.5, g: 0.34, f0: 700, f1: 2200, p0: 0, p1: -0.4 });
  sfx(CATCH_T, 'clink', { g: 0.62 });
  sfx(CATCH_T + 0.02, 'thud', { g: 0.2 });
  sfx(56.45, 'thud', { g: 0.3 });
  [75.3, 75.95, 76.6, 77.25].forEach((t) => sfx(t, 'tink', { g: 0.06 }));
  sfx(64.4, 'creak', { d: 3.6, g: 0.16 });
  [91.66, 91.82, 91.97].forEach((t) => sfx(t, 'tink', { g: 0.07 }));
  sfx(OPEN_T + 0.03, 'pop', { g: 0.5 });
  sfx(92.95, 'thud', { g: 0.08 });
  sfx(BURST_T, 'burst', { g: 0.9 });
  sfx(99.4, 'tink', { g: 0.1 });
  sfx(101.9, 'whoosh', { d: 1.2, g: 0.3, f0: 400, f1: 1400, p0: 0.4, p1: 0.8 });
  sfx(101.95, 'flap', { g: 0.22 });
  sfx(102.8, 'tink', { g: 0.05 });
  // шаги — по фазе цикла бега и шага девочки
  (function steps() {
    let prev = null;
    for (let t = 22.4; t < 90; t += 1 / 60) {
      const cw = key(CYCLE_TRACK, t);
      if (cw < 0.5 || (t > 42 && t < 43.3) || (t > 49 && t < 53.2)) { prev = null; continue; }
      const k = cycleKind(t);
      const ph = Math.floor((Math.abs(key(X_TRACK, t)) / k.stride) * 2);
      if (prev !== null && ph !== prev) sfx(t, 'step', { g: k.fn === runCycle ? 0.16 : 0.1 });
      prev = ph;
    }
  })();
  EV.sort((a, b) => a.t - b.t);

  /* ---------- Инструменты ---------- */
  function makeNoise() {
    const n = ac.sampleRate * 4, b = ac.createBuffer(2, n, ac.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      let b0 = 0, b1 = 0, b2 = 0;
      const R = rng(9 + c);
      for (let i = 0; i < n; i++) { // розовый шум (фильтр Келлета, упрощённый)
        const w = R() * 2 - 1;
        b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0527;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.16;
      }
    }
    return b;
  }
  function makeReverb() {
    const sr = ac.sampleRate, n = Math.floor(sr * 3.2), b = ac.createBuffer(2, n, sr);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c), R = rng(31 + c);
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const early = t < 0.09 && R() < 0.004 ? (R() * 2 - 1) * 0.8 : 0;
        d[i] = ((R() * 2 - 1) * Math.exp(-t * 2.1) * (t < 0.012 ? t / 0.012 : 1) + early) * 0.5;
      }
    }
    const cv = ac.createConvolver();
    cv.buffer = b;
    return cv;
  }
  /** Щипок арфы: Карплус — Стронг с мягким возбуждением; частота подгоняется playbackRate. */
  function makeHarp(m) {
    const sr = ac.sampleRate, f = 440 * 2 ** ((m - 69) / 12);
    const dur = clamp(4.6 - (m - 40) * 0.055, 1.4, 4.6);
    const n = Math.floor(sr * dur);
    const N = Math.max(4, Math.floor(sr / f - 0.5));
    const line = new Float32Array(N);
    const R = rng(m * 7 + 1);
    let lp = 0;
    for (let i = 0; i < N; i++) { lp = lp * 0.5 + (R() * 2 - 1) * 0.5; line[i] = lp; }
    let mean = 0;
    for (let i = 0; i < N; i++) mean += line[i];
    mean /= N;
    const P = Math.max(1, Math.floor(N * 0.18)); // точка щипка ближе к краю — теплее
    const ex = line.map((v, i) => v - mean - (i >= P ? line[i - P] - mean : 0) * 0.6);
    line.set(ex);
    const g = Math.pow(0.001, 1 / (dur * f * 1.1));
    const buf = ac.createBuffer(1, n, sr);
    const out = buf.getChannelData(0);
    let p = 0;
    for (let i = 0; i < n; i++) {
      const a = line[p], b = line[p + 1 === N ? 0 : p + 1];
      out[i] = a;
      line[p] = g * (0.5 * a + 0.5 * b);
      p = p + 1 === N ? 0 : p + 1;
    }
    for (let i = 0; i < 64 && i < n; i++) out[i] *= i / 64;
    for (let i = 0; i < 512; i++) out[n - 1 - i] *= i / 512;
    return { buf, rate: f / (sr / (N + 0.5)) };
  }

  const at = (T) => t0Ctx + (T - t0Film); // время кадра → время звука
  function track(node, stopAt) {
    const set = sess.nodes;
    set.add(node);
    node.onended = () => set.delete(node);
    if (stopAt) node.stop(stopAt);
  }

  function playHarp(when, m, v, pan) {
    let h = harpBufs.get(m);
    if (!h) { h = makeHarp(m); harpBufs.set(m, h); }
    const s = ac.createBufferSource();
    s.buffer = h.buf;
    s.playbackRate.value = h.rate;
    const g = ac.createGain();
    g.gain.value = v * 0.55;
    const p = ac.createStereoPanner();
    p.pan.value = pan ?? clamp((m - 66) / 30, -0.6, 0.6);
    s.connect(g).connect(p).connect(sess.harp);
    s.start(when);
    track(s);
  }

  function playFlute(when, ev) {
    const o = ac.createOscillator();
    o.setPeriodicWave(fluteWave);
    const amp = ac.createGain();
    amp.gain.value = 0;
    const vib = ac.createOscillator();
    vib.frequency.value = 5.1;
    const vg = ac.createGain();
    vg.gain.value = 0;
    vib.connect(vg).connect(o.detune);
    // дыхание: шум через полосовой фильтр возле основного тона
    const br = ac.createBufferSource();
    br.buffer = noiseBuf;
    br.loop = true;
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 3;
    const bg = ac.createGain();
    bg.gain.value = 0;
    br.connect(bp).connect(bg).connect(sess.flute);
    o.connect(amp).connect(sess.flute);
    let t = when, prevM = 0;
    const lvl = ev.v * 0.24;
    for (const [m, d] of ev.notes) {
      if (m > 0) {
        const f = 440 * 2 ** ((m - 69) / 12);
        if (prevM === 0) { o.frequency.setValueAtTime(f, t); amp.gain.setTargetAtTime(lvl, t, 0.045); bg.gain.setTargetAtTime(lvl * 0.2, t, 0.02); bg.gain.setTargetAtTime(lvl * 0.07, t + 0.08, 0.1); }
        else {
          o.frequency.setTargetAtTime(f, t, 0.014);
          // лёгкая атака языком: провал и подъём
          amp.gain.setTargetAtTime(lvl * 0.72, t - 0.03, 0.012);
          amp.gain.setTargetAtTime(lvl, t + 0.01, 0.035);
        }
        bp.frequency.setTargetAtTime(f * 1.5, t, 0.02);
        // вибрато вступает на длинных нотах
        vg.gain.setTargetAtTime(0, t, 0.02);
        if (d > 0.5 && ev.vib) vg.gain.setTargetAtTime(11, t + 0.25, 0.2);
        if (d > 0.9) amp.gain.setTargetAtTime(lvl * 1.08, t + 0.3, 0.4);
      } else if (prevM !== 0) {
        amp.gain.setTargetAtTime(0, t, 0.05);
        bg.gain.setTargetAtTime(0, t, 0.05);
      }
      prevM = m;
      t += d;
    }
    amp.gain.setTargetAtTime(0, t - 0.06, 0.07);
    bg.gain.setTargetAtTime(0, t - 0.06, 0.07);
    const end = t + 0.6;
    o.start(when); vib.start(when); br.start(when, hash(Math.floor(when * 50)) * 3);
    track(o, end); track(vib, end); track(br, end);
  }

  function noiseSrc(when, dur, off) {
    const s = ac.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    s.start(when, off || 0);
    track(s, when + dur + 0.05);
    return s;
  }
  function env(g, when, a, peak, d) {
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(peak, when + a);
    g.gain.exponentialRampToValueAtTime(0.0001, when + a + d);
  }

  function playSfx(when, e) {
    const out = sess.sfx;
    if (e.k === 'whoosh' || e.k === 'burst') {
      const d = e.k === 'burst' ? 4.2 : e.d;
      const s = noiseSrc(when, d, 0.5);
      const f = ac.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 0.9;
      f.frequency.setValueAtTime(e.f0 || 200, when);
      f.frequency.exponentialRampToValueAtTime(e.f1 || 1800, when + d * (e.k === 'burst' ? 0.25 : 0.55));
      if (e.k === 'burst') f.frequency.exponentialRampToValueAtTime(500, when + d);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(e.g, when + d * (e.k === 'burst' ? 0.08 : 0.45));
      g.gain.exponentialRampToValueAtTime(0.0001, when + d);
      const p = ac.createStereoPanner();
      p.pan.setValueAtTime(e.p0 || 0, when);
      p.pan.linearRampToValueAtTime(e.p1 || 0, when + d);
      s.connect(f).connect(g).connect(p).connect(out);
      if (e.k === 'burst') { // низкий удар воздуха
        const o = ac.createOscillator();
        o.frequency.setValueAtTime(70, when);
        o.frequency.exponentialRampToValueAtTime(34, when + 0.6);
        const og = ac.createGain();
        env(og, when, 0.02, 0.5, 0.9);
        o.connect(og).connect(out);
        o.start(when); track(o, when + 1.2);
      }
    } else if (e.k === 'clink' || e.k === 'tink') {
      const parts = e.k === 'clink' ? [[2280, 1.3, 1], [3420, 0.9, 0.6], [5010, 0.6, 0.45], [6830, 0.4, 0.3], [8920, 0.28, 0.2]] : [[3150, 0.35, 1], [4710, 0.22, 0.5], [6900, 0.15, 0.3]];
      for (const [f, d, a] of parts) {
        const o = ac.createOscillator();
        o.frequency.value = f * (1 + (hash(Math.floor(when * 100)) - 0.5) * 0.02);
        const g = ac.createGain();
        env(g, when, 0.002, e.g * a * 0.3, d);
        o.connect(g).connect(out);
        o.start(when); track(o, when + d + 0.1);
      }
    } else if (e.k === 'thud' || e.k === 'step') {
      const s = noiseSrc(when, 0.2, hash(Math.floor(when * 60)) * 3);
      const f = ac.createBiquadFilter();
      f.type = e.k === 'step' ? 'bandpass' : 'lowpass';
      f.frequency.value = e.k === 'step' ? 2600 + hash(Math.floor(when * 90)) * 1400 : 420;
      f.Q.value = 0.7;
      const g = ac.createGain();
      env(g, when, 0.006, e.g, e.k === 'step' ? 0.1 : 0.18);
      s.connect(f).connect(g).connect(out);
      if (e.k === 'thud') {
        const o = ac.createOscillator();
        o.frequency.setValueAtTime(110, when);
        o.frequency.exponentialRampToValueAtTime(48, when + 0.14);
        const og = ac.createGain();
        env(og, when, 0.004, e.g * 0.8, 0.2);
        o.connect(og).connect(out);
        o.start(when); track(o, when + 0.3);
      }
    } else if (e.k === 'flap' || e.k === 'flutter') {
      const d = e.k === 'flutter' ? e.d : 0.32;
      const rate = e.k === 'flutter' ? 17 : 11;
      const s = noiseSrc(when, d);
      const f = ac.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = e.k === 'flutter' ? 1800 : 900;
      f.Q.value = 1.2;
      const g = ac.createGain();
      g.gain.setValueAtTime(0, when);
      for (let i = 0; i < d * rate; i++) {
        const tt = when + i / rate;
        const a = e.g * (1 - i / (d * rate)) * (0.6 + 0.4 * hash(i + 3));
        g.gain.setTargetAtTime(a, tt, 0.004);
        g.gain.setTargetAtTime(0, tt + 0.025, 0.012);
      }
      const p = ac.createStereoPanner();
      p.pan.value = e.p || 0;
      s.connect(f).connect(g).connect(p).connect(out);
    } else if (e.k === 'pop') {
      const s = noiseSrc(when, 0.12);
      const f = ac.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1300;
      f.Q.value = 2;
      const g = ac.createGain();
      env(g, when, 0.002, e.g, 0.08);
      s.connect(f).connect(g).connect(out);
      const o = ac.createOscillator();
      o.frequency.setValueAtTime(760, when);
      o.frequency.exponentialRampToValueAtTime(260, when + 0.07);
      const og = ac.createGain();
      env(og, when, 0.002, e.g * 0.5, 0.09);
      o.connect(og).connect(out);
      o.start(when); track(o, when + 0.2);
    } else if (e.k === 'creak') {
      const o = ac.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(64, when);
      o.frequency.linearRampToValueAtTime(41, when + e.d);
      const f = ac.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1100;
      f.Q.value = 5;
      const g = ac.createGain();
      g.gain.setValueAtTime(0, when);
      const n = Math.floor(e.d * 7);
      for (let i = 0; i < n; i++) {
        const tt = when + (i / n) * e.d + hash(i * 5) * 0.08;
        g.gain.setTargetAtTime(e.g * (1 - i / n) * (0.4 + 0.6 * hash(i * 11)), tt, 0.03);
        g.gain.setTargetAtTime(e.g * 0.1 * (1 - i / n), tt + 0.12, 0.05);
      }
      g.gain.setTargetAtTime(0, when + e.d, 0.1);
      o.connect(f).connect(g).connect(out);
      o.start(when); track(o, when + e.d + 0.5);
    }
  }

  /* ---------- Непрерывные звуки: ветер и свист в банке ---------- */
  function startContinuous() {
    windSrc = ac.createBufferSource();
    windSrc.buffer = noiseBuf;
    windSrc.loop = true;
    windBP = ac.createBiquadFilter();
    windBP.type = 'bandpass';
    windBP.Q.value = 0.6;
    windBP.frequency.value = 500;
    windLP = ac.createBiquadFilter();
    windLP.type = 'lowpass';
    windLP.frequency.value = 2200;
    windGain = ac.createGain();
    windGain.gain.value = 0;
    windPan = ac.createStereoPanner();
    windSrc.connect(windBP).connect(windLP).connect(windGain).connect(windPan).connect(bus);
    windSrc.start();
    const o = ac.createOscillator();
    o.frequency.value = 1760;
    const vib = ac.createOscillator();
    vib.frequency.value = 0.7;
    const vg = ac.createGain();
    vg.gain.value = 18;
    vib.connect(vg).connect(o.frequency);
    const g = ac.createGain();
    g.gain.value = 0;
    o.connect(g).connect(bus);
    o.start(); vib.start();
    whistle = { o, vib, g };
  }
  function updateContinuous(t) {
    const now = ac.currentTime;
    // ветер: сила поля у девочки и вихрь духа рядом
    let w = t < CATCH_T || t > BURST_T - 0.2 ? Math.abs(windAt(girlCenter(t)[0], t)) : 0;
    const S = spiritQ(t);
    let pan = 0;
    if (S && S.a > 0) {
      const c = girlCenter(t);
      const d = Math.hypot(S[0] - c[0], S[1] - c[1]);
      w += 0.5 * Math.exp(-((d / 400) ** 2)) * S.a;
      pan = clamp((S[0] - c[0]) / 600, -0.8, 0.8);
    }
    if (t > BURST_T && t < BURST_T + 6) w += 0.8 * Math.exp(-(t - BURST_T) * 0.6);
    const g = running ? clamp(w * 0.2, 0, 0.42) : 0;
    windGain.gain.setTargetAtTime(g, now, 0.08);
    windBP.frequency.setTargetAtTime(300 + w * 520, now, 0.12);
    windPan.pan.setTargetAtTime(pan, now, 0.2);
    // свист пойманного ветра угасает вместе со светом банки
    const wg = running && t > CATCH_T + 0.3 && t < OPEN_T ? clamp(jarGlow(t) - 0.08, 0, 1) * 0.022 : 0;
    whistle.g.gain.setTargetAtTime(wg, now, 0.15);
    whistle.o.frequency.setTargetAtTime(1500 + jarGlow(t) * 300, now, 0.3);
  }

  /* ---------- Управление ---------- */
  async function init() {
    if (ac) { if (ac.state === 'suspended') await ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC({ latencyHint: 'interactive' });
    master = ac.createGain();
    master.gain.value = 0.8;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.25;
    master.connect(comp).connect(ac.destination);
    bus = ac.createGain();
    bus.connect(master);
    revIn = makeReverb();
    const revG = ac.createGain();
    revG.gain.value = 0.34;
    revIn.connect(revG).connect(master);
    harpBus = ac.createGain();
    harpBus.gain.value = 0.9;
    const harpTone = ac.createBiquadFilter();
    harpTone.type = 'lowpass';
    harpTone.frequency.value = 3800;
    harpBus.connect(harpTone);
    harpTone.connect(bus);
    harpTone.connect(revIn);
    fluteBus = ac.createGain();
    fluteBus.gain.value = 0.9;
    fluteBus.connect(bus);
    const fs = ac.createGain();
    fs.gain.value = 0.7;
    fluteBus.connect(fs).connect(revIn);
    sfxBus = ac.createGain();
    sfxBus.connect(bus);
    const sr = ac.createGain();
    sr.gain.value = 0.25;
    sfxBus.connect(sr).connect(revIn);
    noiseBuf = makeNoise();
    const real = new Float32Array([0, 0, 0, 0, 0, 0, 0]);
    const imag = new Float32Array([0, 1, 0.38, 0.16, 0.07, 0.03, 0.015]);
    fluteWave = ac.createPeriodicWave(real, imag);
    // струны арфы — заранее, чтобы первые ноты не ждали
    const need = new Set(EV.filter((e) => e.k === 'harp').map((e) => e.m));
    for (const m of need) harpBufs.set(m, makeHarp(m));
    startContinuous();
    if (ac.state === 'suspended') await ac.resume();
    ready = true;
  }
  const lat = () => clamp((ac.outputLatency || 0) + (ac.baseLatency || 0), 0, 0.25);
  function start(t) {
    if (!ready) return;
    stop();
    sess = { nodes: new Set() };
    for (const [k, b] of [['harp', harpBus], ['flute', fluteBus], ['sfx', sfxBus]]) { sess[k] = ac.createGain(); sess[k].connect(b); }
    running = true;
    t0Film = t;
    t0Ctx = ac.currentTime - lat();
    idx = 0;
    while (idx < EV.length && EV[idx].t < t - 0.02) idx++;
  }
  /** Остановка. soft — конец фильма: новых нот нет, а хвосты струн и эхо дозвучивают сами. */
  function stop(soft) {
    running = false;
    if (!ac) return;
    const now = ac.currentTime;
    if (windGain) { windGain.gain.setTargetAtTime(0, now, soft ? 0.5 : 0.04); whistle.g.gain.setTargetAtTime(0, now, 0.04); }
    if (soft || !sess) return;
    const s = sess;
    sess = null;
    for (const k of ['harp', 'flute', 'sfx']) s[k].gain.setTargetAtTime(0, now, 0.012);
    for (const n of s.nodes) { try { n.stop(now + 0.1); } catch (e) { /* уже остановлен */ } }
    s.nodes.clear();
    setTimeout(() => { for (const k of ['harp', 'flute', 'sfx']) s[k].disconnect(); }, 400);
  }
  function tick(t) {
    if (!ready || !running || !sess) return;
    const horizon = t + 0.4;
    const now = ac.currentTime;
    while (idx < EV.length && EV[idx].t <= horizon) {
      const e = EV[idx++];
      const when = Math.max(now + 0.005, at(e.t));
      if (e.k === 'harp') playHarp(when, e.m, e.v, e.pan);
      else if (e.k === 'flute') playFlute(when, e);
      else playSfx(when, e);
    }
    updateContinuous(t);
  }
  function setMuted(m) {
    muted = m;
    if (master) master.gain.setTargetAtTime(m ? 0 : 0.8, ac.currentTime, 0.06);
  }
  return {
    init, start, stop, tick, setMuted,
    ready: () => ready,
    now: () => (ac ? ac.currentTime - lat() : 0),
    /** Для проверки: сколько событий уже расписано и сколько узлов звучит. */
    stats: () => ({ idx, total: EV.length, live: sess ? sess.nodes.size : 0, running, state: ac ? ac.state : 'none' }),
    get muted() { return muted; },
    events: EV,
  };
})();
