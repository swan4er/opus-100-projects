// ───────────────────────────────────────────────────────────────────────────
//  «Лисий дом» — звук: гитара (Карплус — Стронг), колокольчики, гул бури,
//  ветер, огонь и шумы по меткам сценария. Всё синтезируется на Web Audio.
//  Музыка и шумы — список событий во времени фильма, поэтому перемотка
//  просто перепланирует их с новой точки.
// ───────────────────────────────────────────────────────────────────────────
window.FoxAudio = (function () {
  'use strict';
  const S = window.STORY;
  const { BEAT, BAR, clamp } = S;
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const hash = (n) => { const s = Math.sin(n * 91.345 + 17.1) * 43758.5453; return s - Math.floor(s); };

  // ══════════════════════════════════════════════════════════════════════
  //  Партитура: гитара (перебор + мелодия), колокольчики, гул
  // ══════════════════════════════════════════════════════════════════════
  const CH = {
    G: { b: 43, a: 50, tr: [55, 59, 62, 67] }, Em: { b: 40, a: 47, tr: [55, 59, 64, 67] }, C: { b: 48, a: 43, tr: [55, 60, 64, 67] },
    D: { b: 50, a: 45, tr: [57, 62, 66, 69] }, Am: { b: 45, a: 52, tr: [57, 60, 64, 69] }, Am7: { b: 45, a: 52, tr: [55, 60, 64, 67] },
    B7: { b: 47, a: 54, tr: [57, 63, 66, 71] }, Cmaj7: { b: 48, a: 43, tr: [55, 59, 64, 67] }, GB: { b: 47, a: 50, tr: [55, 59, 62, 67] },
    Dsus: { b: 50, a: 45, tr: [57, 62, 67, 69] }, Gadd9: { b: 43, a: 50, tr: [57, 59, 62, 67] },
  };
  const notes = [];   // {t, m, v, d, pan, k}
  const N = (t, m, v, d, pan, k) => notes.push({ t, m, v, d: d || 3, pan: pan || 0, k: k || 'g' });
  const barT = (b) => b * BAR;
  // перебор на такт
  function pattern(bar, ch, kind, vel) {
    const c = CH[ch], t0 = barT(bar), e = BEAT / 2;
    const [t1, t2, t3, t4] = c.tr;
    const hum = (i) => (hash(bar * 8 + i) - 0.5) * 0.012;
    if (kind === 'arp') {
      const seq = [c.b, t1, t2, t3, t4, t3, c.a, t2];
      seq.forEach((m, i) => N(t0 + i * e + hum(i), m, vel * (i === 0 ? 1 : 0.62), 3, i === 0 ? -0.05 : -0.25 + (i % 3) * 0.12));
    } else if (kind === 'travis') {
      const seq = [[c.b, t4], [t2], [c.a], [t3], [c.b], [t2], [c.a], [t3]];
      seq.forEach((g, i) => g.forEach((m, j) => N(t0 + i * e + hum(i) + j * 0.004, m, vel * (m < 52 ? 0.95 : 0.6), 3, m < 52 ? -0.05 : -0.3 + (i % 2) * 0.2)));
    } else if (kind === 'strum') {
      N(t0 + hum(0), c.b, vel, 1.2); N(t0 + BEAT * 2 + hum(1), c.a, vel * 0.9, 1.2);
      for (const bt of [1, 3]) c.tr.forEach((m, j) => N(t0 + bt * BEAT + j * 0.012 + hum(bt + j), m, vel * 0.5, 0.22, -0.2 + j * 0.13));
      for (const bt of [1.5, 3.5]) c.tr.slice(1).forEach((m, j) => N(t0 + bt * BEAT + j * 0.01, m, vel * 0.3, 0.14, 0.1 + j * 0.1));
    } else if (kind === 'trem') {
      N(t0, c.b, vel, 2.2); N(t0 + BEAT * 2, c.a, vel * 0.85, 2.2);
      for (let i = 0; i < 16; i++) N(t0 + i * BEAT / 4 + hum(i) * 0.5, i % 4 === 0 ? t4 : t3, vel * (i % 4 === 0 ? 0.5 : 0.32), 0.3, 0.2);
    } else if (kind === 'roll') {
      [c.b, c.a, ...c.tr].sort((a, b) => a - b).forEach((m, i) => N(t0 + i * 0.07, m, vel * (0.9 - i * 0.05), 4, -0.3 + i * 0.12));
    }
  }
  function mel(bar, list, vel, oct) {
    let b = 0;
    for (const [m, d] of list) { if (m) N(barT(bar) + b * BEAT + (hash(bar * 13 + b) - 0.5) * 0.01, m + (oct || 0), vel, Math.max(1.2, d * BEAT * 2.2), 0.28, 'm'); b += d; }
  }
  // Тема «Лисий дом» (7 тактов после вступления)
  const THEME = [
    [[71, 1.5], [69, 0.5], [67, 1], [64, 1]],
    [[67, 1], [69, 0.5], [71, 0.5], [72, 1], [76, 1]],
    [[74, 2.5], [72, 0.5], [71, 0.5], [69, 0.5]],
    [[71, 1], [74, 1], [79, 1.5], [78, 0.5]],
    [[76, 1], [79, 0.5], [76, 0.5], [74, 1], [71, 1]],
    [[72, 1], [71, 0.5], [69, 0.5], [67, 1], [64, 1]],
    [[66, 1], [69, 1], [74, 2]],
  ];
  // ── Сцена 1: осень, мягкий перебор и тема ──
  ['G', 'Em', 'C', 'D', 'G', 'Em', 'Am', 'D'].forEach((c, i) => pattern(i, c, i < 3 ? 'arp' : 'travis', i === 0 ? 0.42 : 0.52));
  THEME.forEach((b, i) => mel(i + 1, b, 0.62));
  // ── Сцена 2: брёвна, дорожная песенка ──
  ['G', 'D', 'Em', 'C'].forEach((c, i) => pattern(8 + i, c, 'travis', 0.6));
  mel(8, [[67, 0.5], [71, 0.5], [74, 1], [71, 0.5], [74, 0.5], [79, 1]], 0.6);
  mel(9, [[78, 1], [76, 0.5], [74, 0.5], [69, 2]], 0.6);
  mel(10, [[79, 0.5], [78, 0.5], [76, 1], [71, 1], [76, 1]], 0.6);
  mel(11, [[74, 1], [72, 1], [71, 0.5], [69, 0.5], [67, 1]], 0.6);
  ['G', 'D', 'C', 'D'].forEach((c, i) => pattern(12 + i, c, 'strum', 0.7));
  THEME.slice(3).forEach((b, i) => mel(12 + i, b, 0.66));
  pattern(16, 'G', 'arp', 0.45); mel(16, [[74, 2], [71, 2]], 0.5);
  pattern(17, 'Em', 'arp', 0.4); mel(17, [[76, 1.5], [0, 0.5], [71, 2]], 0.42);
  // ── Сцена 3: ветер ──
  ['Em', 'C', 'Am'].forEach((c, i) => pattern(18 + i, c, 'trem', 0.55));
  mel(18, [[76, 1], [74, 0.5], [71, 0.5], [67, 2]], 0.52);
  mel(19, [[72, 1], [71, 0.5], [69, 0.5], [64, 2]], 0.5);
  mel(20, [[69, 1], [72, 1], [76, 2]], 0.55);
  N(barT(21), CH.B7.b, 0.6, 2.4); [63, 66, 71].forEach((m, i) => N(barT(21) + BEAT + i * 0.3, m, 0.45, 1.5, 0.2));
  // порыв: музыка обрывается, только гул и «рваные» ноты
  for (const [t, m] of [[55.3, 41], [55.65, 40], [56.0, 46], [56.45, 39]]) N(t, m, 0.55, 2, -0.2);
  // лиса шлёпнулась — тихий минор, потом решимость
  pattern(23.6, 'Em', 'roll', 0.42);
  [47, 51, 54, 57, 59, 63].forEach((m, i) => N(60.55 + i * 0.11, m, 0.5, 2.5, -0.2 + i * 0.08));
  // быстрый ремонт — тремоло по шестнадцатым, в конце разрешение в соль мажор
  [['Em', 61.25], ['C', 61.875], ['D', 62.5], ['B7', 63.125], ['Em', 63.75], ['C', 64.06], ['D', 64.37]].forEach(([c, t], k) => {
    const C_ = CH[c];
    N(t, C_.b, 0.7, 1); for (let i = 0; i < 5; i++) N(t + i * BEAT / 4, C_.tr[(i + k) % 4], 0.4 + k * 0.03, 0.2, 0.15);
  });
  [43, 50, 55, 59, 62, 67, 71].forEach((m, i) => N(64.6 + i * 0.035, m, 0.85 - i * 0.05, 4.5, -0.3 + i * 0.1));
  // ── Сцена 4: первый снег — колокольчики и редкие ноты ──
  [[65.8, 88], [66.45, 86], [67.1, 83], [67.75, 79], [68.4, 76]].forEach(([t, m]) => N(t, m, 0.32, 2.5, 0.2, 'b'));
  pattern(27.5, 'Cmaj7', 'roll', 0.36);
  pattern(28.5, 'GB', 'roll', 0.34);
  N(70.55, 83, 0.3, 2, 0.3, 'b'); N(70.8, 86, 0.26, 2, 0.35, 'b');
  [55, 59, 62, 67, 71, 74].forEach((m, i) => N(71.5 + i * 0.13, m, 0.35, 1.2, 0.1)); // скольжение
  N(73.1, 40, 0.6, 2.5); N(73.12, 52, 0.4, 2);
  pattern(29.6, 'Am7', 'roll', 0.34);
  pattern(30.5, 'Cmaj7', 'roll', 0.38); N(76.4, 83, 0.28, 2.5, 0.2, 'b'); N(77.0, 79, 0.26, 2.5, 0.2, 'b');
  N(77.9, CH.Dsus.b, 0.36, 2.5); [57, 62, 67].forEach((m, i) => N(77.95 + i * 0.09, m, 0.3, 2.5));
  // ── Сцена 5: свет в окне — тема целиком ──
  pattern(32.5, 'Gadd9', 'roll', 0.55); N(81.3, 86, 0.3, 3, 0.2, 'b'); N(81.6, 91, 0.2, 3, 0.25, 'b');
  ['Em', 'C', 'D', 'G', 'Em', 'Am', 'D'].forEach((c, i) => pattern(33 + i, c, i < 1 ? 'arp' : 'travis', 0.5));
  THEME.forEach((b, i) => mel(33 + i, b, 0.62));
  pattern(40, 'G', 'roll', 0.6); N(100.2, 79, 0.4, 4, 0.25, 'm'); N(100.9, 91, 0.2, 3.5, 0.3, 'b');
  notes.sort((a, b) => a.t - b.t);

  // ══════════════════════════════════════════════════════════════════════
  //  Движок
  // ══════════════════════════════════════════════════════════════════════
  function create(cues) {
    let ctx = null, master, comp, musicBus, sfxBus, ambBus, rev, revSend;
    let noiseBuf = null;
    const strings = new Map();
    let startCtx = null, startFilm = 0, schedT = 0, iN = 0, iC = 0;
    const active = new Set();
    const beds = {};
    const events = cues.slice().sort((a, b) => a.t - b.t);
    // добавочные события сюжета
    for (const e of [
      { t: 78.9, type: 'creak' }, { t: 79.1, type: 'door' }, { t: 81.0, type: 'ignite' },
      { t: 81.25, type: 'chime' },
    ]) events.push(e);
    // птицы осени и треск огня — детерминированные «случайности»
    for (let t = 1.5; t < 44; t += 1.6 + hash(t) * 2.8) events.push({ t, type: 'tit', vel: 0.25 + hash(t * 3) * 0.2 });
    for (let t = 81.3; t < 104; t += 0.06 + hash(t * 7) * 0.3) events.push({ t, type: 'crackle', vel: hash(t * 11) });
    events.sort((a, b) => a.t - b.t);

    const eng = {
      muted: false,
      async init() {
        if (ctx) return;
        ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'playback' });
        master = ctx.createGain(); master.gain.value = 0.0001;
        comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.25;
        master.connect(comp).connect(ctx.destination);
        rev = ctx.createConvolver(); rev.buffer = impulse(2.6, 2.4);
        revSend = ctx.createGain(); revSend.gain.value = 0.32; revSend.connect(rev).connect(master);
        // гитарная «дека»: пара резонансов и мягкий верх
        musicBus = ctx.createGain(); musicBus.gain.value = 0.62;
        const body1 = ctx.createBiquadFilter(); body1.type = 'peaking'; body1.frequency.value = 110; body1.Q.value = 1.2; body1.gain.value = 4;
        const body2 = ctx.createBiquadFilter(); body2.type = 'peaking'; body2.frequency.value = 240; body2.Q.value = 1.4; body2.gain.value = 2.5;
        const shelf = ctx.createBiquadFilter(); shelf.type = 'highshelf'; shelf.frequency.value = 4500; shelf.gain.value = -5;
        musicBus.connect(body1).connect(body2).connect(shelf);
        shelf.connect(master); shelf.connect(revSend);
        sfxBus = ctx.createGain(); sfxBus.gain.value = 0.75; sfxBus.connect(master);
        const sfxRev = ctx.createGain(); sfxRev.gain.value = 0.12; sfxBus.connect(sfxRev).connect(rev);
        ambBus = ctx.createGain(); ambBus.gain.value = 0.5; ambBus.connect(master);
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
        // струны заранее — те, что звучат в партитуре
        const need = new Set(notes.filter((n) => n.k !== 'b').map((n) => n.m));
        for (const m of need) strings.set(m, ksString(m));
        makeBeds();
        master.gain.setTargetAtTime(0.85, ctx.currentTime, 0.2);
      },
      play(t) {
        if (!ctx) return;
        if (ctx.state === 'suspended') ctx.resume();
        stopAll();
        startCtx = ctx.currentTime + 0.08; startFilm = t; schedT = t;
        iN = lower(notes, t); iC = lower(events, t);
        eng.pump(t);
      },
      pause() { if (!ctx) return; stopAll(); startCtx = null; bedsTo(0, 0.08); },
      seek(t, playing) { if (!ctx) return; stopAll(); if (playing) eng.play(t); },
      suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); },
      resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); },
      clockOk() { return !!(ctx && startCtx !== null && ctx.state === 'running'); },
      time() { return startFilm + Math.max(0, ctx.currentTime - startCtx); },
      setMuted(m) { eng.muted = m; if (ctx) master.gain.setTargetAtTime(m ? 0.0001 : 0.85, ctx.currentTime, 0.08); },
      // для проверки: состояние контекста и сколько нот и шумов уже поставлено в расписание
      stats() { return ctx ? { state: ctx.state, playing: startCtx !== null, film: +(startCtx === null ? 0 : eng.time()).toFixed(2), notes: iN, events: iC, voices: active.size, strings: strings.size } : { state: 'нет' }; },
      pump(t) {
        if (!ctx || startCtx === null) return;
        const horizon = t + 0.35;
        while (iN < notes.length && notes[iN].t < horizon) { const n = notes[iN++]; if (n.t >= schedT - 0.05) playNote(n, at(n.t)); }
        while (iC < events.length && events[iC].t < horizon) { const e = events[iC++]; if (e.t >= schedT - 0.05) sfx(e, at(e.t)); }
        schedT = horizon;
        beds.update(t);
      },
    };
    const at = (ft) => Math.max(ctx.currentTime + 0.005, startCtx + (ft - startFilm));
    const lower = (arr, t) => { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m].t < t) lo = m + 1; else hi = m; } return lo; };
    function track(node, stopAt) {
      active.add(node);
      node.onended = () => active.delete(node);
      node.start(node.__at || ctx.currentTime);
      if (stopAt) node.stop(stopAt);
    }
    function stopAll() {
      const now = ctx.currentTime;
      for (const n of active) { try { if (n.__g) { n.__g.gain.cancelScheduledValues(now); n.__g.gain.setTargetAtTime(0, now, 0.015); } n.stop(now + 0.08); } catch (e) { /* уже остановлен */ } }
      active.clear();
    }
    function impulse(sec, decay) {
      const len = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay) * (i < 90 ? i / 90 : 1); }
      return b;
    }

    // ── Гитарная струна: Карплус — Стронг с дробной задержкой ────────────
    function ksString(m) {
      const sr = ctx.sampleRate, f = mtof(m);
      const dur = m < 50 ? 3.4 : m < 64 ? 2.8 : 2.2;
      const n = Math.floor(sr * dur);
      const buf = ctx.createBuffer(1, n, sr), out = buf.getChannelData(0);
      const P = sr / f, L = Math.max(2, Math.floor(P - 0.5)), frac = P - 0.5 - L;
      const C = (1 - frac) / (1 + frac);
      const line = new Float32Array(L), ex = new Float32Array(L);
      const bright = 0.35 + clamp((m - 40) / 45) * 0.4;
      let lp = 0;
      for (let i = 0; i < L; i++) { lp += (Math.random() * 2 - 1 - lp) * bright; ex[i] = lp; }
      const pp = Math.max(1, Math.floor(L * 0.14));
      let mean = 0;
      for (let i = 0; i < L; i++) { line[i] = ex[i] - (i >= pp ? ex[i - pp] : 0) * 0.85; mean += line[i]; }
      mean /= L; for (let i = 0; i < L; i++) line[i] -= mean;
      const T60 = 4.2 - clamp((m - 40) / 40) * 2.2;
      const rho = Math.pow(0.001, 1 / (T60 * f));
      let idx = 0, prevX = line[L - 1], x1 = 0, y1 = 0, peak = 0;
      for (let i = 0; i < n; i++) {
        const x = line[idx];
        out[i] = x; const ax = Math.abs(x); if (ax > peak) peak = ax;
        const avg = 0.5 * (x + prevX); prevX = x;
        const y = C * avg + x1 - C * y1; x1 = avg; y1 = y;
        line[idx] = y * rho;
        if (++idx >= L) idx = 0;
      }
      const g = 0.5 / (peak || 1), fade = Math.floor(sr * 0.05);
      for (let i = 0; i < n; i++) out[i] *= g * (i > n - fade ? (n - i) / fade : 1);
      return buf;
    }
    function playNote(nt, when) {
      if (nt.k === 'b') return bell(nt, when);
      const buf = strings.get(nt.m); if (!buf) return;
      const src = ctx.createBufferSource(); src.buffer = buf;
      const lpf = ctx.createBiquadFilter(); lpf.type = 'lowpass'; lpf.frequency.value = 1800 + nt.v * 5200 + (nt.k === 'm' ? 1200 : 0); lpf.Q.value = 0.5;
      const g = ctx.createGain(); g.gain.value = 0;
      g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(nt.v * (nt.k === 'm' ? 0.95 : 0.7), when + 0.004);
      if (nt.d < 2) g.gain.setTargetAtTime(0, when + nt.d, 0.06);
      const p = ctx.createStereoPanner(); p.pan.value = nt.pan;
      src.connect(lpf).connect(g).connect(p).connect(musicBus);
      src.__g = g; src.__at = when;
      track(src, when + Math.min(buf.duration, nt.d + 0.6));
    }
    function bell(nt, when) {
      const f = mtof(nt.m);
      const g = ctx.createGain(); g.gain.value = 0;
      const p = ctx.createStereoPanner(); p.pan.value = nt.pan;
      g.connect(p); p.connect(musicBus); p.connect(revSend);
      const parts = [[1, 1, 2.4], [2.0, 0.28, 1.2], [2.76, 0.16, 0.8], [5.4, 0.06, 0.35]];
      for (const [r, a, dcy] of parts) {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * r;
        const og = ctx.createGain(); og.gain.setValueAtTime(0, when); og.gain.linearRampToValueAtTime(a * nt.v, when + 0.003); og.gain.exponentialRampToValueAtTime(0.0001, when + dcy);
        o.connect(og).connect(g); o.__at = when; o.__g = og; track(o, when + dcy + 0.05);
      }
      g.gain.setValueAtTime(0.8, when);
    }

    // ── Постоянные слои: ветер, гул бури, тишина снега, огонь ────────────
    function noiseSrc(loop) { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = loop !== false; s.loopStart = Math.random(); return s; }
    function makeBeds() {
      const w = noiseSrc(); const wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.Q.value = 0.7; wf.frequency.value = 500;
      const wg = ctx.createGain(); wg.gain.value = 0; const wp = ctx.createStereoPanner(); wp.pan.value = -0.2;
      w.connect(wf).connect(wg).connect(wp).connect(ambBus); w.start();
      const w2 = noiseSrc(); const wf2 = ctx.createBiquadFilter(); wf2.type = 'lowpass'; wf2.frequency.value = 260;
      const wg2 = ctx.createGain(); wg2.gain.value = 0; w2.connect(wf2).connect(wg2).connect(ambBus); w2.start();
      // гул бури: два пилообразных тона через фильтр, дрожание
      const dg = ctx.createGain(); dg.gain.value = 0; const df = ctx.createBiquadFilter(); df.type = 'lowpass'; df.frequency.value = 320;
      for (const [fr, det] of [[mtof(40), -6], [mtof(47), 5], [mtof(28), 0]]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr; o.detune.value = det; o.connect(df); o.start(); }
      const trem = ctx.createOscillator(); trem.frequency.value = 5.5; const tg = ctx.createGain(); tg.gain.value = 0.3; trem.connect(tg).connect(dg.gain); trem.start();
      df.connect(dg).connect(musicBus);
      // шорох снега
      const sn = noiseSrc(); const sf = ctx.createBiquadFilter(); sf.type = 'highpass'; sf.frequency.value = 5200; const sg = ctx.createGain(); sg.gain.value = 0;
      sn.connect(sf).connect(sg).connect(ambBus); sn.start();
      // очаг: низкий гул пламени
      const fr = noiseSrc(); const ff = ctx.createBiquadFilter(); ff.type = 'lowpass'; ff.frequency.value = 180; const fg = ctx.createGain(); fg.gain.value = 0;
      fr.connect(ff).connect(fg).connect(ambBus); fr.start();
      beds.list = [[wg, 0], [wg2, 0], [dg, 0], [sg, 0], [fg, 0]];
      beds.update = (t) => {
        const now = ctx.currentTime, wv = S.wind(t);
        wf.frequency.setTargetAtTime(380 + wv * 1500, now, 0.12);
        wg.gain.setTargetAtTime(0.03 + wv * wv * 0.5, now, 0.12);
        wg2.gain.setTargetAtTime(0.05 + wv * 0.35, now, 0.15);
        const storm = t > 45 && t < 65 ? S.smooth(45, 50, t) * (1 - S.smooth(62, 65, t)) * (t > 53.7 && t < 58.8 ? 1.6 : 1) : 0;
        dg.gain.setTargetAtTime(storm * 0.05, now, 0.3);
        sg.gain.setTargetAtTime(S.snowfall(t) * 0.035, now, 0.4);
        const inside = t > 86.2 && t < 92.6 ? 1 : 0.35;
        fg.gain.setTargetAtTime(S.fire(t) * 0.12 * inside, now, 0.3);
      };
    }
    function bedsTo(v, tc) { if (!beds.list) return; for (const [g] of beds.list) g.gain.setTargetAtTime(v, ctx.currentTime, tc); }

    // ── Шумы ─────────────────────────────────────────────────────────────
    function burst(when, dur, type, freq, q, gain, pan, fEnd) {
      const s = noiseSrc(false); s.loopStart = 0;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      if (fEnd) { f.frequency.setValueAtTime(freq, when); f.frequency.exponentialRampToValueAtTime(fEnd, when + dur); }
      const g = ctx.createGain(); g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(gain, when + Math.min(0.01, dur * 0.2)); g.gain.exponentialRampToValueAtTime(0.0005, when + dur);
      const p = ctx.createStereoPanner(); p.pan.value = pan || 0;
      s.connect(f).connect(g).connect(p).connect(sfxBus);
      s.__at = when; s.__g = g;
      const off = Math.random() * 1.5;
      active.add(s); s.onended = () => active.delete(s); s.start(when, off); s.stop(when + dur + 0.05);
    }
    function tone(when, f0, f1, dur, type, gain, pan, bus) {
      const o = ctx.createOscillator(); o.type = type || 'sine';
      o.frequency.setValueAtTime(f0, when); if (f1) o.frequency.exponentialRampToValueAtTime(f1, when + dur);
      const g = ctx.createGain(); g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(gain, when + 0.005); g.gain.exponentialRampToValueAtTime(0.0005, when + dur);
      const p = ctx.createStereoPanner(); p.pan.value = pan || 0;
      o.connect(g).connect(p).connect(bus || sfxBus);
      o.__at = when; o.__g = g; track(o, when + dur + 0.05);
    }
    function sfx(e, w) {
      const v = e.vel ?? 0.6;
      switch (e.type) {
        case 'step':
          if (e.surf === 'leaf') { for (let i = 0; i < 3; i++) burst(w + i * 0.012, 0.05, 'bandpass', 3500 + hash(e.t + i) * 2500, 1.2, 0.08 * v, (hash(e.t) - 0.5) * 0.4); }
          else if (e.surf === 'snow') { burst(w, 0.11, 'bandpass', 1500 + hash(e.t) * 600, 2.2, 0.16 * v, 0); tone(w + 0.01, 900 + hash(e.t * 3) * 300, 700, 0.06, 'triangle', 0.02 * v); }
          else { burst(w, 0.05, 'bandpass', 900, 2, 0.12 * v, 0); tone(w, 160, 110, 0.06, 'sine', 0.1 * v); }
          break;
        case 'thud': tone(w, 95 * (e.pitch || 1), 48, 0.35, 'sine', 0.55 * v); burst(w, 0.12, 'lowpass', 900, 0.7, 0.35 * v); burst(w, 0.09, 'bandpass', 420 * (e.pitch || 1), 5, 0.25 * v); if (e.big) burst(w + 0.02, 0.5, 'lowpass', 500, 0.7, 0.2); break;
        case 'knock': tone(w, 180 * (e.pitch || 1), 110, 0.16, 'triangle', 0.3 * v); burst(w, 0.06, 'bandpass', 700 * (e.pitch || 1), 6, 0.22 * v, (hash(e.t) - 0.5) * 0.5); break;
        case 'tock': burst(w, 0.035, 'bandpass', 2800, 3, 0.5 * v, 0.1); tone(w, 1500, 1150, 0.07, 'sine', 0.14 * v, 0.1); tone(w, 200, 120, 0.06, 'triangle', 0.28 * v); break;
        case 'ping': burst(w, 0.04, 'bandpass', 3000, 3, 0.55); tone(w, 2400, 2350, 0.9, 'sine', 0.12, 0.1); tone(w, 3620, 3600, 0.5, 'sine', 0.05, 0.1); break;
        case 'clack': burst(w, 0.06, 'bandpass', 1300, 4, 0.3 * v, 0.1); tone(w, 240, 150, 0.08, 'triangle', 0.18 * v); break;
        case 'whoosh': burst(w, e.dur || 0.5, 'bandpass', e.f0 || 400, 1.1, 0.25 * v, 0, e.f1 || 1400); break;
        case 'swish': burst(w, 0.3, 'bandpass', 2400, 1.2, 0.1 * v, 0.2, 3800); break;
        case 'gust': burst(w, e.dur || 1.5, 'bandpass', 300, 0.8, 0.42 * v, -0.3, 1500); burst(w + 0.2, (e.dur || 1.5) * 0.9, 'highpass', 1800, 0.7, 0.12 * v, 0.3, 4000); break;
        case 'tear': burst(w, 0.18, 'bandpass', 1800, 2, 0.35 * v, (hash(e.t) - 0.5) * 0.6); burst(w + 0.05, 0.9, 'bandpass', 600, 1, 0.22 * v, 0.2, 2200); tone(w, 300, 90, 0.2, 'sawtooth', 0.05); break;
        case 'grab': tone(w, 260, 190, 0.07, 'triangle', 0.16); burst(w, 0.05, 'bandpass', 1400, 3, 0.1); break;
        case 'lift': burst(w, 0.25, 'bandpass', 700, 1.4, 0.1, 0, 1500); break;
        case 'strain': tone(w, 150, 175, e.dur || 0.6, 'sawtooth', 0.018); break;
        case 'land': tone(w, 140, 80, 0.18, 'sine', 0.35 * v); burst(w, 0.08, 'bandpass', 800, 2, 0.15 * v); break;
        case 'poof': burst(w, 0.45, 'lowpass', 2600, 0.6, 0.4, 0, 500); tone(w, 110, 55, 0.3, 'sine', 0.35); break;
        case 'slide': burst(w, e.dur || 1, 'bandpass', 900, 1.5, 0.16, 0, 2200); break;
        case 'shake': for (let i = 0; i < 9; i++) burst(w + i * (e.dur || 0.8) / 9, 0.06, 'bandpass', 2500 + (i % 2) * 900, 1.5, 0.06, i % 2 ? 0.3 : -0.3); break;
        case 'shiver': for (let i = 0; i < 12; i++) tone(w + i * 0.07, 1300 + (i % 2) * 200, 1200, 0.025, 'square', 0.012, 0); break;
        case 'rustle': for (let i = 0; i < 6; i++) burst(w + i * 0.05, 0.08, 'bandpass', 3000 + hash(i + e.t) * 3000, 1, 0.07 * v, (hash(i) - 0.5)); break;
        case 'honk': { const pan = clamp((e.t - 12) / 4, -0.8, 0.8); for (let k = 0; k < 2; k++) { tone(w + k * 0.2, 430, 380, 0.16, 'sawtooth', 0.035 * v, pan, sfxBus); tone(w + k * 0.2, 860, 760, 0.16, 'square', 0.008 * v, pan); } } break;
        case 'chirp': tone(w, 1950, 1500, 0.2, 'sine', 0.07 * v, 0.35); tone(w + 0.26, 1850, 1450, 0.22, 'sine', 0.05 * v, 0.35); break;
        case 'tit': for (let k = 0; k < 2 + Math.floor(hash(e.t) * 2); k++) tone(w + k * 0.12, 5200 + hash(e.t + k) * 800, 4200, 0.06, 'sine', 0.018 * v * 2, (hash(e.t * 5) - 0.5) * 1.2); break;
        case 'ding': tone(w, 2637, 2630, 1.4, 'sine', 0.09, 0.1); tone(w, 5274, 5270, 0.6, 'sine', 0.025, 0.1); break;
        case 'inhale': burst(w, 0.45, 'bandpass', 1200, 1.5, 0.05, 0, 2600); break;
        case 'sneeze': burst(w, 0.16, 'bandpass', 3600, 1.4, 0.28, 0); burst(w + 0.03, 0.2, 'highpass', 5000, 0.7, 0.12, 0); tone(w, 520, 380, 0.08, 'triangle', 0.06); break;
        case 'creak': { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(190, w); o.frequency.linearRampToValueAtTime(260, w + 0.35);
          const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 6; const g = ctx.createGain(); g.gain.setValueAtTime(0, w); g.gain.linearRampToValueAtTime(0.05, w + 0.05); g.gain.linearRampToValueAtTime(0, w + 0.35);
          o.connect(f).connect(g).connect(sfxBus); o.__at = w; o.__g = g; track(o, w + 0.4); } break;
        case 'door': tone(w, 120, 70, 0.3, 'sine', 0.45); burst(w, 0.12, 'bandpass', 500, 3, 0.35); burst(w + 0.08, 0.06, 'bandpass', 1800, 4, 0.12); break;
        case 'ignite': burst(w, 0.8, 'lowpass', 200, 0.8, 0.3, 0, 1800); break;
        case 'chime': tone(w, 1568, 1566, 2.2, 'sine', 0.05, 0.2, musicBus); break;
        case 'crackle': { const inside = e.t > 86.2 && e.t < 92.6 ? 1 : 0.35; burst(w, 0.02 + v * 0.02, 'bandpass', 1800 + v * 2600, 2, (0.03 + v * 0.07) * inside, (v - 0.5) * 0.4); } break;
        default: break;
      }
    }
    return eng;
  }
  return { create };
})();
