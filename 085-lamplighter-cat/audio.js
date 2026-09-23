'use strict';
/* ==========================================================================
   Кот-фонарщик · audio.js
   Звук целиком синтезируется Web Audio. Партитура — список событий в секундах
   фильма: вальс на челесте, контрабас пиццикато (Карплус — Стронг), арфа,
   «хор» Луны, стеклянные ноты лунной дорожки, шаги, хлопки пламени, ветер, море.
   Планировщик ставит события с упреждением ~0,3 с от текущего времени фильма,
   поэтому звук точно следует за перемоткой и паузой.
   ========================================================================== */

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

const AudioEng = {
  ctx: null, muted: true, master: null, comp: null, rev: null, revIn: null,
  bus: null, nodes: new Set(), events: [], cursor: 0, anchorT: 0, anchorCtx: 0,
  noiseBuf: null, brownBuf: null, ks: new Map(), beds: null, lastBed: 0,
  VOL: 0.44,      // около −16 dBFS RMS в громких местах: умеренно, с запасом до пика

  enable() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC({ latencyHint: 'playback' }); } catch (e) { try { this.ctx = new AC(); } catch (e2) { this.ctx = null; return; } }
    const c = this.ctx;
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -16; this.comp.knee.value = 12; this.comp.ratio.value = 3; this.comp.attack.value = 0.01; this.comp.release.value = 0.25;
    this.master = c.createGain(); this.master.gain.value = 0;
    this.master.connect(this.comp); this.comp.connect(c.destination);
    // реверберация: синтезированный отклик комнаты-«павильона»
    this.rev = c.createConvolver();
    const len = Math.floor(c.sampleRate * 2.6), ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) { const t = i / c.sampleRate; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2) * Math.exp(-t * 1.6) * (t < 0.012 ? t / 0.012 : 1); }
    }
    this.rev.buffer = ir;
    this.revIn = c.createGain(); this.revIn.gain.value = 0.9;
    this.revIn.connect(this.rev); this.rev.connect(this.master);
    // шумы
    const nlen = c.sampleRate * 2;
    this.noiseBuf = c.createBuffer(1, nlen, c.sampleRate);
    const nd = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < nlen; i++) nd[i] = Math.random() * 2 - 1;
    this.brownBuf = c.createBuffer(1, nlen, c.sampleRate);
    const bd = this.brownBuf.getChannelData(0); let last = 0;
    for (let i = 0; i < nlen; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; bd[i] = last * 3.2; }
    this.events = buildScore();
  },
  latency() { return this.ctx ? (this.ctx.outputLatency || this.ctx.baseLatency || 0) : 0; },
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : this.VOL, this.ctx.currentTime, 0.06);
  },

  /* ---------- сеанс воспроизведения ---------- */
  start(T) {
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.stop();
    const c = this.ctx;
    this.bus = c.createGain(); this.bus.gain.value = 1;
    this.bus.connect(this.master);
    this.send = c.createGain(); this.send.gain.value = 1; this.send.connect(this.revIn);
    this.anchorT = T; this.anchorCtx = c.currentTime + 0.03;
    let i = 0; while (i < this.events.length && this.events[i].t < T - 0.02) i++;
    this.cursor = i;
    this.startBeds(T);
    this.update(T);
  },
  /* tc — постоянная затухания: 0,03 с при паузе и перемотке, дольше — когда фильм доиграл до конца */
  stop(tc = 0.03) {
    if (!this.bus) return;
    const c = this.ctx, bus = this.bus, send = this.send, nodes = this.nodes;
    bus.gain.setTargetAtTime(0, c.currentTime, tc);
    send.gain.setTargetAtTime(0, c.currentTime, tc);
    const list = [...nodes];
    setTimeout(() => { for (const n of list) { try { n.stop(); } catch (e) { /* уже остановлен */ } } try { bus.disconnect(); send.disconnect(); } catch (e) { /* ок */ } }, Math.max(160, tc * 7000));
    this.nodes = new Set();
    this.bus = null; this.send = null; this.beds = null;
  },
  when(t) { return this.anchorCtx + (t - this.anchorT); },
  update(T) {
    if (!this.bus) return;
    const c = this.ctx, E = this.events, horizon = T + 0.32;
    while (this.cursor < E.length && E[this.cursor].t < horizon) {
      const ev = E[this.cursor++], w = this.when(ev.t);
      if (w < c.currentTime - 0.03) continue;
      try { PLAY[ev.k](this, Math.max(w, c.currentTime), ev); } catch (e) { /* нота пропущена */ }
    }
    if (this.beds && c.currentTime - this.lastBed > 0.1) {
      this.lastBed = c.currentTime;
      const g = BEDS(T + 0.15), now = c.currentTime;
      this.beds.wind.gain.setTargetAtTime(g.wind, now, 0.35);
      this.beds.sea.gain.setTargetAtTime(g.sea, now, 0.4);
      this.beds.windF.frequency.setTargetAtTime(g.windF, now, 0.5);
    }
  },
  startBeds(T) {
    const c = this.ctx, g0 = BEDS(T);
    const mk = (buf, filterType, f, q, gain, off) => {
      const s = c.createBufferSource(); s.buffer = buf; s.loop = true;
      const fl = c.createBiquadFilter(); fl.type = filterType; fl.frequency.value = f; fl.Q.value = q;
      const g = c.createGain(); g.gain.value = gain;
      s.connect(fl); fl.connect(g); g.connect(this.bus);
      s.start(c.currentTime, off);
      this.nodes.add(s);
      return { s, fl, g };
    };
    const w = mk(this.brownBuf, 'bandpass', g0.windF, 0.7, g0.wind, 0.3);
    const s = mk(this.brownBuf, 'lowpass', 520, 0.5, g0.sea, 1.1);
    this.beds = { wind: w.g, windF: w.fl, sea: s.g };
  },

  /* ---------- кирпичики ---------- */
  track(n) { this.nodes.add(n); n.onended = () => this.nodes.delete(n); return n; },
  out(when, dry = 1, wet = 0.25) {
    const c = this.ctx, g = c.createGain();
    g.gain.value = dry; g.connect(this.bus);
    if (wet > 0) { const s = c.createGain(); s.gain.value = wet; g.connect(s); s.connect(this.send); }
    return g;
  },
  osc(type, f, when, stop, dest) {
    // верхние обертоны челесты на низкой частоте дискретизации (гарнитуры 16–22 кГц) — ниже Найквиста
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(Math.min(f, this.ctx.sampleRate * 0.45), when);
    o.connect(dest); o.start(when); o.stop(stop); return this.track(o);
  },
  env(when, peak, a, tau, stopAt) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(peak, when + a);
    g.gain.setTargetAtTime(0, when + a, tau);
    return g;
  },
  noise(when, dur, dest, brown) {
    const s = this.ctx.createBufferSource(); s.buffer = brown ? this.brownBuf : this.noiseBuf;
    s.connect(dest); s.start(when, Math.random() * 1.5, dur + 0.05); s.stop(when + dur + 0.05);
    return this.track(s);
  },
  /* струна Карплуса — Стронга, кэш по высоте и яркости */
  ksBuf(midi, bright, decay, secs) {
    const key = midi + ':' + bright + ':' + decay;
    let b = this.ks.get(key);
    if (b) return b;
    const c = this.ctx, sr = c.sampleRate, f = mtof(midi), N = Math.max(2, Math.round(sr / f)), len = Math.floor(sr * secs);
    b = c.createBuffer(1, len, sr);
    const d = b.getChannelData(0), buf = new Float32Array(N);
    let prev = 0;
    for (let i = 0; i < N; i++) { const r = Math.random() * 2 - 1; prev = prev + bright * (r - prev); buf[i] = prev; }
    let idx = 0, lastv = 0;
    for (let i = 0; i < len; i++) {
      const v = buf[idx], nx = buf[(idx + 1) % N];
      d[i] = v;
      buf[idx] = decay * 0.5 * (v + nx) * 0.999 + 0.001 * lastv;
      lastv = v;
      idx = (idx + 1) % N;
    }
    // мягкая атака без щелчка
    for (let i = 0; i < 64 && i < len; i++) d[i] *= i / 64;
    this.ks.set(key, b);
    return b;
  },
};

/* ---------- инструменты и шумы ---------- */
const PLAY = {
  cel(A, w, e) {   // челеста: почти чистый тон, звонкая атака
    const f = mtof(e.m), v = e.v ?? 0.3, low = clamp((84 - e.m) / 24, 0, 1);
    const out = A.out(w, 1, 0.34);
    for (const [r, a, tau] of [[1, 1, 0.75 + low * 0.9], [2, 0.2, 0.3], [4.01, 0.06, 0.1], [5.43, 0.03, 0.05]]) {
      const g = A.env(w, v * a, 0.003, tau); g.connect(out);
      A.osc('sine', f * r, w, w + tau * 6 + 0.1, g);
    }
  },
  bass(A, w, e) {  // контрабас пиццикато
    const c = A.ctx, s = c.createBufferSource(); s.buffer = A.ksBuf(e.m, 0.35, 0.996, 1.8);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    const g = c.createGain(); g.gain.value = (e.v ?? 0.5) * 1.3;
    s.connect(lp); lp.connect(g); g.connect(A.out(w, 1, 0.12));
    s.start(w); A.track(s);
  },
  harp(A, w, e) {  // арфа: аккорд «па-па» на 2 и 3 доли
    const c = A.ctx;
    (e.ch || [e.m]).forEach((m, i) => {
      const s = c.createBufferSource(); s.buffer = A.ksBuf(m, 0.55, 0.994, 1.4);
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 140;
      const g = c.createGain(); g.gain.value = (e.v ?? 0.16);
      s.connect(hp); hp.connect(g); g.connect(A.out(w, 1, 0.3));
      s.start(w + i * 0.012); A.track(s);
    });
  },
  pad(A, w, e) {   // струнная подушка
    const c = A.ctx, dur = e.d, v = (e.v ?? 0.05);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = e.f || 1300; lp.Q.value = 0.6;
    const g = c.createGain();
    g.gain.setValueAtTime(0, w); g.gain.linearRampToValueAtTime(v, w + (e.a ?? 0.6)); g.gain.setValueAtTime(v, w + dur); g.gain.linearRampToValueAtTime(0, w + dur + (e.r ?? 1));
    lp.connect(g); g.connect(A.out(w, 1, 0.5));
    for (const m of e.ch) for (const dt of [-7, 6]) {
      const o = A.osc('sawtooth', mtof(m), w, w + dur + (e.r ?? 1) + 0.05, lp); o.detune.value = dt;
    }
  },
  choir(A, w, e) { // «хор» Луны: пила через форманты «у-о»
    const c = A.ctx, dur = e.d, v = e.v ?? 0.05;
    const g = c.createGain();
    g.gain.setValueAtTime(0, w); g.gain.linearRampToValueAtTime(v, w + (e.a ?? 0.9)); g.gain.setValueAtTime(v, w + dur); g.gain.linearRampToValueAtTime(0, w + dur + 1.2);
    const f1 = c.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 420; f1.Q.value = 3;
    const f2 = c.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 880; f2.Q.value = 5;
    const m2 = c.createGain(); m2.gain.value = 0.5;
    f1.connect(g); f2.connect(m2); m2.connect(g); g.connect(A.out(w, 1, 0.6));
    const lfo = c.createOscillator(); lfo.frequency.value = 5.1; const ld = c.createGain(); ld.gain.value = 9; lfo.connect(ld);
    lfo.start(w); lfo.stop(w + dur + 1.3); A.track(lfo);
    for (const m of e.ch) for (const dt of [-5, 5]) {
      const o = A.osc('sawtooth', mtof(m), w, w + dur + 1.3, f1); o.detune.value = dt; ld.connect(o.detune); o.connect(f2);
    }
  },
  glass(A, w, e) { // стеклянная нота лунной дорожки
    const f = mtof(e.m), v = e.v ?? 0.12, out = A.out(w, 1, 0.55);
    const g = A.env(w, v, 0.008, e.tau ?? 0.9); g.connect(out);
    A.osc('sine', f, w, w + (e.tau ?? 0.9) * 6, g);
    const g2 = A.env(w, v * 0.14, 0.004, 0.18); g2.connect(out);
    A.osc('sine', f * 2.76, w, w + 1.2, g2);
  },
  bell(A, w, e) {  // колокольчик-акцент на зажжённый фонарь
    const f = mtof(e.m), v = e.v ?? 0.12, out = A.out(w, 1, 0.45);
    for (const [r, a, tau] of [[0.5, 0.35, 1.6], [1, 1, 1.3], [1.19, 0.4, 0.8], [1.5, 0.28, 0.7], [2, 0.22, 0.5], [2.52, 0.1, 0.35], [3.01, 0.07, 0.25]]) {
      const g = A.env(w, v * a, 0.002, tau); g.connect(out);
      A.osc('sine', f * r, w, w + tau * 6, g);
    }
  },
  /* --- шумы --- */
  step(A, w, e) {  // шаг: черепица, доски, мягкий
    const c = A.ctx, v = e.v ?? 0.12, wood = e.s === 'wood';
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = wood ? 800 : 2300 + Math.random() * 500; bp.Q.value = wood ? 1.4 : 0.9;
    const g = A.env(w, v, 0.001, wood ? 0.03 : 0.016); bp.connect(g); g.connect(A.out(w, 1, 0.12));
    A.noise(w, 0.12, bp);
    const g2 = A.env(w, v * 0.9, 0.002, 0.03); g2.connect(A.out(w, 1, 0.05));
    const o = A.osc('sine', wood ? 150 : 120, w, w + 0.2, g2); o.frequency.exponentialRampToValueAtTime(70, w + 0.08);
  },
  pop(A, w, e) {   // хлопок загорающегося фитиля
    const c = A.ctx, v = e.v ?? 0.3;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.2;
    lp.frequency.setValueAtTime(260, w); lp.frequency.exponentialRampToValueAtTime(3800, w + 0.06); lp.frequency.exponentialRampToValueAtTime(700, w + 0.3);
    const g = A.env(w, v, 0.004, 0.11); lp.connect(g); g.connect(A.out(w, 1, 0.3));
    A.noise(w, 0.5, lp);
    const g2 = A.env(w, v * 0.8, 0.003, 0.07); g2.connect(A.out(w, 1, 0.1));
    const o = A.osc('sine', 70, w, w + 0.3, g2); o.frequency.exponentialRampToValueAtTime(160, w + 0.05);
  },
  puff(A, w, e) {  // пламя задуло: «ф-ф»
    const c = A.ctx, v = e.v ?? 0.2;
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1300;
    const g = c.createGain(); g.gain.setValueAtTime(0, w); g.gain.linearRampToValueAtTime(v, w + 0.04); g.gain.setTargetAtTime(0, w + 0.06, 0.12);
    hp.connect(g); g.connect(A.out(w, 1, 0.35));
    A.noise(w, 0.6, hp);
  },
  gust(A, w, e) {  // порыв ветра
    const c = A.ctx, d = e.d ?? 1.2, v = e.v ?? 0.2;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.8;
    bp.frequency.setValueAtTime(320, w); bp.frequency.exponentialRampToValueAtTime(1150, w + d * 0.45); bp.frequency.exponentialRampToValueAtTime(380, w + d);
    const g = c.createGain(); g.gain.setValueAtTime(0, w); g.gain.linearRampToValueAtTime(v, w + d * 0.4); g.gain.linearRampToValueAtTime(0, w + d);
    bp.connect(g); g.connect(A.out(w, 1, 0.3));
    A.noise(w, d, bp, false);
  },
  whoosh(A, w, e) { // прыжок, полёт ломтика
    const c = A.ctx, d = e.d ?? 0.6, v = e.v ?? 0.12;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(e.f0 ?? 500, w); bp.frequency.exponentialRampToValueAtTime(e.f1 ?? 2200, w + d);
    const g = c.createGain(); g.gain.setValueAtTime(0, w); g.gain.linearRampToValueAtTime(v, w + d * 0.5); g.gain.linearRampToValueAtTime(0, w + d);
    bp.connect(g); g.connect(A.out(w, 1, 0.3));
    A.noise(w, d, bp);
  },
  thud(A, w, e) {
    const v = e.v ?? 0.3, g = A.env(w, v, 0.003, 0.09); g.connect(A.out(w, 1, 0.1));
    const o = A.osc('sine', 110, w, w + 0.4, g); o.frequency.exponentialRampToValueAtTime(48, w + 0.15);
    const c = A.ctx, lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
    const g2 = A.env(w, v * 0.6, 0.002, 0.05); lp.connect(g2); g2.connect(A.out(w, 1, 0.1)); A.noise(w, 0.2, lp);
  },
  knock(A, w, e) { // лодка ткнулась в сваю
    const c = A.ctx, v = e.v ?? 0.25;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 230; bp.Q.value = 7;
    const g = A.env(w, v * 2.4, 0.002, 0.09); bp.connect(g); g.connect(A.out(w, 1, 0.2)); A.noise(w, 0.3, bp);
    const g2 = A.env(w, v * 0.5, 0.002, 0.1); g2.connect(A.out(w, 1, 0.1)); A.osc('sine', 175, w, w + 0.5, g2);
  },
  creak(A, w, e) { // скрип ставен
    const c = A.ctx, v = e.v ?? 0.035, d = e.d ?? 0.4;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 950; bp.Q.value = 2.5;
    const g = c.createGain(); g.gain.setValueAtTime(0, w); g.gain.linearRampToValueAtTime(v, w + 0.05); g.gain.setValueAtTime(v, w + d - 0.08); g.gain.linearRampToValueAtTime(0, w + d);
    bp.connect(g); g.connect(A.out(w, 1, 0.2));
    const o = A.osc('sawtooth', 560, w, w + d + 0.05, bp); o.frequency.linearRampToValueAtTime(880, w + d);
    const lfo = c.createOscillator(); lfo.frequency.value = 26; const ld = c.createGain(); ld.gain.value = 40; lfo.connect(ld); ld.connect(o.frequency); lfo.start(w); lfo.stop(w + d + 0.05); A.track(lfo);
  },
  mew(A, w, e) {   // «мяу»: пила через подвижные форманты
    const c = A.ctx, P = MEWS[e.s || 'ahem'], d = P.d, v = e.v ?? 0.1;
    const g = c.createGain(); g.gain.setValueAtTime(0, w); g.gain.linearRampToValueAtTime(v, w + 0.05); g.gain.setValueAtTime(v * 0.9, w + d - 0.12); g.gain.linearRampToValueAtTime(0, w + d);
    const f1 = c.createBiquadFilter(); f1.type = 'bandpass'; f1.Q.value = 4;
    const f2 = c.createBiquadFilter(); f2.type = 'bandpass'; f2.Q.value = 6;
    const m2 = c.createGain(); m2.gain.value = 0.6;
    f1.connect(g); f2.connect(m2); m2.connect(g); g.connect(A.out(w, 1, 0.3));
    const o = A.osc('sawtooth', P.f[0], w, w + d + 0.05, f1); o.connect(f2);
    P.f.forEach((f, i) => o.frequency.linearRampToValueAtTime(f, w + (d * i) / (P.f.length - 1)));
    P.f1.forEach((f, i) => f1.frequency.linearRampToValueAtTime(f, w + (d * i) / (P.f1.length - 1)));
    P.f2.forEach((f, i) => f2.frequency.linearRampToValueAtTime(f, w + (d * i) / (P.f2.length - 1)));
    f1.frequency.setValueAtTime(P.f1[0], w); f2.frequency.setValueAtTime(P.f2[0], w);
  },
  purr(A, w, e) {  // мурлыканье
    const c = A.ctx, d = e.d ?? 3, v = e.v ?? 0.16;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300;
    const am = c.createGain(); am.gain.value = 0;
    const g = c.createGain(); g.gain.setValueAtTime(0, w); g.gain.linearRampToValueAtTime(v, w + 0.4); g.gain.setValueAtTime(v, w + d - 0.5); g.gain.linearRampToValueAtTime(0, w + d);
    lp.connect(am); am.connect(g); g.connect(A.out(w, 1, 0.1));
    A.noise(w, d, lp, true);
    const lfo = c.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 24;
    const lg = c.createGain(); lg.gain.value = 0.5; lfo.connect(lg); lg.connect(am.gain);
    const cst = c.createConstantSource ? c.createConstantSource() : null;
    if (cst) { cst.offset.value = 0.55; cst.connect(am.gain); cst.start(w); cst.stop(w + d + 0.1); A.track(cst); }
    lfo.start(w); lfo.stop(w + d + 0.1); A.track(lfo);
  },
  boing(A, w, e) {
    const v = e.v ?? 0.1, g = A.env(w, v, 0.004, 0.22); g.connect(A.out(w, 1, 0.2));
    const o = A.osc('sine', 330, w, w + 1, g); o.frequency.setValueAtTime(330, w); o.frequency.exponentialRampToValueAtTime(520, w + 0.12);
    const c = A.ctx, lfo = c.createOscillator(); lfo.frequency.value = 17; const ld = c.createGain(); ld.gain.value = 30; lfo.connect(ld); ld.connect(o.frequency); lfo.start(w); lfo.stop(w + 1); A.track(lfo);
  },
  squeak(A, w, e) { // писк мышонка
    const v = e.v ?? 0.05, g = A.env(w, v, 0.01, 0.09); g.connect(A.out(w, 1, 0.2));
    const o = A.osc('sine', 1900, w, w + 0.4, g); o.frequency.linearRampToValueAtTime(2500, w + 0.08); o.frequency.linearRampToValueAtTime(2100, w + 0.18);
  },
};
const MEWS = {
  yawn: { d: 0.95, f: [300, 380, 460, 420, 300], f1: [500, 750, 900, 700, 450], f2: [1500, 1300, 1150, 1000, 900] },
  ahem: { d: 0.32, f: [430, 520, 610], f1: [500, 650, 800], f2: [1700, 1600, 1500] },
  sad: { d: 0.6, f: [600, 560, 470, 380], f1: [700, 800, 650, 450], f2: [1900, 1600, 1200, 1000] },
  happy: { d: 0.5, f: [460, 640, 760, 700], f1: [500, 800, 900, 800], f2: [1800, 1700, 1500, 1400] },
};

/* ---------- фоновые шумы: ветер и море — функция от времени фильма ---------- */
function BEDS(T) {
  const at = (K) => key(T, K);
  return {
    wind: at([[0, 0.02], [28, 0.025], [31, 0.07], [40.5, 0.11], [42, 0.06], [46, 0.035], [66, 0.03], [80, 0.03], [89, 0.05], [92, 0.04], [112, 0.03], [117.5, 0]]),
    windF: at([[0, 420], [34, 700], [41, 900], [44, 500], [90, 750], [118, 450]]),
    sea: at([[0, 0.012], [24, 0.02], [30, 0.07], [43, 0.09], [50, 0.075], [64, 0.05], [68, 0.035], [81, 0.05], [89, 0.085], [110, 0.06], [117.5, 0]]),
  };
}

/* ---------- партитура ---------- */
function buildScore() {
  const E = [];
  const add = (t, k, o = {}) => E.push({ t, k, ...o });
  /* аккорды вальса: гармония, бас, «па-па» арфы */
  const CH = {
    F: { b: 41, h: [57, 60, 65] }, C7: { b: 36, h: [58, 60, 64] }, Bb: { b: 34, h: [58, 62, 65] }, G7: { b: 43, h: [59, 62, 65] },
    F7: { b: 41, h: [57, 63, 65] }, Gm: { b: 43, h: [58, 62, 67] }, FC: { b: 36, h: [57, 60, 65] }, Dm: { b: 38, h: [57, 62, 65] },
    A7: { b: 33, h: [57, 61, 64] }, Gm2: { b: 31, h: [58, 62, 67] }, Bb2: { b: 34, h: [58, 62, 65] },
  };
  const THEME = [
    [[72, 1], [77, 1], [81, 1]], [[84, 2], [81, 1]], [[82, 1], [79, 1], [76, 1]], [[77, 2], [72, 1]],
    [[74, 1], [77, 1], [82, 1]], [[81, 2], [77, 1]], [[79, 1], [81, 1], [83, 1]], [[84, 3]],
    [[72, 1], [77, 1], [81, 1]], [[84, 2], [87, 1]], [[86, 1], [84, 1], [82, 1]], [[81, 1], [79, 1], [82, 1]],
    [[81, 2], [77, 1]], [[76, 1], [79, 1], [82, 1]], [[81, 1], [79, 1], [76, 1]], [[77, 3]],
  ];
  const HARM = ['F', 'F', 'C7', 'F', 'Bb', 'F', 'G7', 'C7', 'F', 'F7', 'Bb', 'Gm', 'FC', 'C7', 'C7', 'F'];
  /* вальсовый аккомпанемент: бас на раз, арфа на два-три */
  const waltzBar = (t0, bar, ch, tr = 0, o = {}) => {
    const C = CH[ch];
    add(t0, 'bass', { m: C.b + tr, v: o.bv ?? 0.55 });
    if (!o.noHarp) { add(t0 + bar / 3, 'harp', { ch: C.h.map((m) => m + tr), v: o.hv ?? 0.12 }); add(t0 + (2 * bar) / 3, 'harp', { ch: C.h.map((m) => m + tr), v: (o.hv ?? 0.12) * 0.85 }); }
  };
  const melody = (t0, bar, bars, from, tr = 0, v = 0.3, oct = 0) => {
    for (let b = 0; b < bars; b++) {
      let t = t0 + b * bar;
      for (const [m, dur] of THEME[(from + b) % 16]) { add(t, 'cel', { m: m + tr + oct, v, d: dur * bar / 3 }); t += (dur * bar) / 3; }
    }
  };

  /* A · вступление: музыкальная шкатулка над сумеречным небом (0–7,5) */
  const B1 = 1.25;
  const introCh = ['F', 'F', 'Bb', 'C7', 'F', 'C7'];
  introCh.forEach((ch, i) => {
    const t0 = i * B1, C = CH[ch];
    add(t0 + 0.02, 'bass', { m: C.b, v: 0.42 });
    const arp = [C.h[0] + 12, C.h[1] + 12, C.h[2] + 12, C.h[0] + 24, C.h[2] + 12, C.h[1] + 12];
    arp.forEach((m, k) => add(t0 + k * (B1 / 6), 'cel', { m, v: 0.16 + (k === 3 ? 0.06 : 0) }));
  });
  add(0, 'pad', { ch: [53, 57, 60], d: 5, v: 0.035, a: 1.4 });
  add(5, 'pad', { ch: [52, 58, 60], d: 2.4, v: 0.03 });

  /* B · тема вальса (7,5–27,5): кот просыпается и зажигает фонари */
  const tB = 7.5;
  for (let b = 0; b < 16; b++) waltzBar(tB + b * B1, B1, HARM[b], 0, { hv: b < 4 ? 0.08 : 0.12, bv: b < 4 ? 0.4 : 0.55 });
  melody(tB + 4 * B1, B1, 12, 4, 0, 0.3);           // мелодия вступает, когда кот вылез
  add(tB, 'cel', { m: 84, v: 0.12 }); add(tB + 0.42, 'cel', { m: 81, v: 0.1 }); add(tB + 0.84, 'cel', { m: 77, v: 0.1 });
  add(tB + 2.5, 'cel', { m: 79, v: 0.12 }); add(tB + 2.92, 'cel', { m: 76, v: 0.1 });
  add(12.5, 'pad', { ch: [53, 57, 60], d: 7.5, v: 0.03 }); add(20, 'pad', { ch: [53, 58, 62], d: 7, v: 0.03 });
  // слуховое окно: огонёк внутри, скрип ставен, зевок, прыжок на конёк и приземление
  add(7.95, 'pop', { v: 0.07 });
  add(8.36, 'creak', { d: 0.45, v: 0.03 });
  add(9.12, 'mew', { s: 'yawn', v: 0.06 });
  add(10.62, 'whoosh', { d: 0.5, v: 0.05, f0: 500, f1: 1600 });
  add(11.16, 'step', { s: 'roof', v: 0.16 });
  // зажжённые фонари: хлопок + колокольчик на сильную долю
  for (const [t, m] of [[15.0, 89], [18.75, 93], [22.5, 96]]) { add(t, 'pop', { v: 0.28 }); add(t + 0.01, 'bell', { m, v: 0.1 }); }
  for (const [t, m] of [[26.0, 91], [27.3, 94]]) { add(t, 'pop', { v: 0.12 }); add(t, 'bell', { m, v: 0.05 }); }
  // каскад дальних фонарей на общем плане
  for (let i = 0; i < 7; i++) add(25.3 + i * 0.32, 'cel', { m: [96, 93, 89, 91, 96, 98, 101][i], v: 0.07 });
  // переход: доминанта и спуск к пристани (27,5–30)
  add(27.5, 'bass', { m: 36, v: 0.45 }); add(27.5, 'pad', { ch: [55, 58, 64], d: 2.4, v: 0.035 });
  [84, 82, 79, 76, 74, 72].forEach((m, k) => add(27.5 + k * 0.4, 'cel', { m, v: 0.16 - k * 0.012 }));
  add(28.75, 'bass', { m: 33, v: 0.4 });

  /* C · пристань, ре минор (30–41,3): ветер крепчает */
  const tC = 30, minor = [[[74, 2], [77, 1]], [[76, 3]], [[74, 1], [69, 1], [74, 1]], [[79, 2], [77, 1]], [[77, 2], [76, 1]], [[73, 3]], [[74, 2], [77, 1]], [[76, 3]], [[74, 3]]];
  const mh = ['Dm', 'A7', 'Dm', 'Gm', 'Dm', 'A7', 'Bb2', 'A7', 'Dm'];
  mh.forEach((ch, b) => {
    const t0 = tC + b * B1;
    if (t0 > 41.1) return;
    waltzBar(t0, B1, ch, 0, { hv: 0.07, bv: 0.4 });
    if (b >= 2) { let t = t0; for (const [m, dur] of minor[b]) { if (t < 41.1) add(t, 'cel', { m, v: 0.17 }); t += (dur * B1) / 3; } }
  });
  add(31.1, 'squeak', { v: 0.04 }); add(31.5, 'squeak', { v: 0.03 });
  add(34.3, 'gust', { d: 0.9, v: 0.16 }); add(34.62, 'puff', { v: 0.18 });
  [81, 79, 76].forEach((m, k) => add(34.9 + k * 0.21, 'cel', { m, v: 0.12 }));
  add(36.55, 'gust', { d: 1.0, v: 0.2 }); add(37.12, 'puff', { v: 0.2 });
  [79, 77, 74].forEach((m, k) => add(37.4 + k * 0.21, 'cel', { m, v: 0.12 }));
  add(40.6, 'gust', { d: 1.3, v: 0.3 }); add(41.3, 'puff', { v: 0.26 });
  add(41.35, 'bass', { m: 26, v: 0.35 });
  /* D · тишина: только ветер и волны; мотылёк зовёт вверх */
  [98, 101, 105].forEach((m, k) => add(44.1 + k * 0.14, 'glass', { m, v: 0.05, tau: 0.5 }));

  /* E · восход Луны (44,5–50): ля-бемоль мажор, дорожка раскатывается нотами */
  add(44.5, 'pad', { ch: [56, 60, 63, 68], d: 5.2, v: 0.045, a: 2.4, f: 1600 });
  add(45.5, 'choir', { ch: [56, 63], d: 4, v: 0.035, a: 2 });
  const pent = [68, 70, 72, 75, 77, 80, 82, 84, 87, 89];
  pent.forEach((m, k) => add(47.0 + k * 0.26, 'glass', { m: m + 12, v: 0.07, tau: 1.1 }));
  add(48.5, 'bass', { m: 32, v: 0.35 });
  add(49.4, 'mew', { s: 'ahem', v: 0.06 });

  /* F · лунная дорожка: медленный вальс в ля-бемоле, стеклянные шаги на каждую долю (50–68) */
  const tF = 50, B2 = 1.5;
  for (let b = 0; b < 12; b++) {
    const ch = HARM[b % 16], t0 = tF + b * B2;
    waltzBar(t0, B2, ch, 3, { hv: 0.09, bv: 0.38 });
  }
  melody(tF + 2 * B2, B2, 10, 0, 3, 0.2, 12);
  add(50, 'pad', { ch: [56, 60, 63], d: 8.5, v: 0.03 }); add(59, 'pad', { ch: [56, 61, 65], d: 8.5, v: 0.03 });
  add(51.0, 'glass', { m: 87, v: 0.11 }); add(51.85, 'glass', { m: 84, v: 0.1 });
  for (let t = 53; t < 67.9; t += 0.5) {
    const b = Math.floor((t - tF) / B2), C = CH[HARM[b % 16]], k = Math.round((t - tF) / 0.5) % 3;
    add(t, 'glass', { m: C.h[k] + 3 + 24, v: 0.055, tau: 0.5 });
  }

  /* G · Луна (68–81): хор, просьба, ломтик света */
  add(68, 'choir', { ch: [56, 60, 63], d: 4, v: 0.04 });
  add(72, 'choir', { ch: [56, 61, 65], d: 3.5, v: 0.045 });
  add(75.5, 'choir', { ch: [56, 60, 63, 68], d: 2.5, v: 0.05 });
  add(78, 'choir', { ch: [55, 58, 63, 67], d: 3, v: 0.045 });
  add(69.9, 'cel', { m: 80, v: 0.08 }); add(70.3, 'mew', { s: 'ahem', v: 0.09 });
  add(70.8, 'glass', { m: 68, v: 0.1, tau: 0.3 });
  add(71.2, 'pad', { ch: [44, 51], d: 1.8, v: 0.05, a: 0.6, f: 600 });
  add(72.0, 'glass', { m: 80, v: 0.06, tau: 0.8 });
  add(73.8, 'mew', { s: 'sad', v: 0.09 });
  [80, 84, 87].forEach((m, k) => add(75.7 + k * 0.18, 'cel', { m, v: 0.12 }));
  add(76.2, 'bell', { m: 92, v: 0.07 });
  [99, 96, 92, 91, 87, 84].forEach((m, k) => add(76.25 + k * 0.1, 'glass', { m, v: 0.05, tau: 0.6 }));
  add(76.3, 'whoosh', { d: 1.3, v: 0.05, f0: 1800, f1: 700 });
  add(77.7, 'pop', { v: 0.12 });
  add(77.72, 'bell', { m: 80, v: 0.09 });
  [80, 84, 87, 92, 96, 99].forEach((m, k) => add(77.75 + k * 0.07, 'glass', { m, v: 0.06, tau: 0.9 }));
  add(78.5, 'mew', { s: 'happy', v: 0.09 });
  add(80.0, 'glass', { m: 99, v: 0.08, tau: 0.6 });

  /* H · бегом домой (81–89): фа мажор, быстрый вальс, шаги по стеклу вниз */
  const tH = 81, B3 = 60 / 168 * 3;
  const runH = ['F', 'C7', 'F', 'Bb', 'F', 'C7', 'G7'];
  runH.forEach((ch, b) => {
    const t0 = tH + b * B3, C = CH[ch];
    waltzBar(t0, B3, ch, 0, { hv: 0.1, bv: 0.5 });
    const arp = [C.h[0] + 24, C.h[1] + 24, C.h[2] + 24, C.h[1] + 24, C.h[0] + 24, C.h[2] + 12];
    arp.forEach((m, k) => add(t0 + k * (B3 / 6), 'cel', { m, v: 0.12 }));
  });
  for (let k = 0, t = 81.4; t < 87.4; t += 60 / 168, k++) add(t, 'glass', { m: [96, 93, 89, 87, 84, 81, 77][k % 7], v: 0.045, tau: 0.3 });
  add(87.45, 'whoosh', { d: 1.0, v: 0.1, f0: 400, f1: 2400 });
  [72, 76, 79, 84, 88, 91].forEach((m, k) => add(87.5 + k * 0.12, 'cel', { m, v: 0.1 }));
  add(88.6, 'thud', { v: 0.32 });

  /* I · последний фонарь загорается (89–101): тема целиком, «тутти» */
  add(89.0, 'pad', { ch: [48, 55, 58, 64], d: 2.4, v: 0.05, a: 0.4 });
  add(89.0, 'bass', { m: 36, v: 0.45 }); add(90.25, 'bass', { m: 36, v: 0.45 });
  add(89.8, 'gust', { d: 1.5, v: 0.3 });
  for (let k = 0; k < 8; k++) add(89.1 + k * 0.3, 'cel', { m: 72 + (k % 2 ? 7 : 4), v: 0.07 });
  const tI = 91.5;
  add(tI, 'pop', { v: 0.32 }); add(tI + 0.01, 'bell', { m: 89, v: 0.14 }); add(tI + 0.01, 'bell', { m: 77, v: 0.1 });
  [89, 93, 96, 101, 105].forEach((m, k) => add(tI + 0.02 + k * 0.08, 'glass', { m, v: 0.06, tau: 1 }));
  for (let b = 0; b < 8; b++) waltzBar(tI + b * B1, B1, HARM[b], 0, { hv: 0.14, bv: 0.6 });
  melody(tI, B1, 8, 0, 0, 0.34);
  melody(tI, B1, 8, 0, 0, 0.12, 12);
  add(tI, 'pad', { ch: [53, 57, 60, 65], d: 4.6, v: 0.05 }); add(tI + 5, 'pad', { ch: [53, 58, 62, 65], d: 4.6, v: 0.05 });

  /* J · лодка и рыба (101,5–108): пиццикато и шутка */
  const tJ = 101.5;
  const jh = ['F', 'C7', 'F', 'C7', 'Bb'];
  jh.forEach((ch, b) => waltzBar(tJ + b * B1, B1, ch, 0, { hv: 0.08, bv: 0.4 }));
  add(101.8, 'knock', { v: 0.22 }); add(102.4, 'squeak', { v: 0.05 });
  [84, 88, 91].forEach((m, k) => add(102.5 + k * 0.1, 'cel', { m, v: 0.1 }));
  add(104.0, 'whoosh', { d: 0.7, v: 0.07, f0: 600, f1: 1900 });
  add(104.8, 'boing', { v: 0.08 }); add(104.85, 'cel', { m: 89, v: 0.14 }); add(104.95, 'cel', { m: 93, v: 0.12 });
  add(105.3, 'purr', { d: 3.4, v: 0.14 });
  add(106.2, 'mew', { s: 'happy', v: 0.06 });

  /* K · финал (108–118): последняя фраза темы, аккорд, «Конец» */
  const tK = 108;
  for (let b = 0; b < 6; b++) waltzBar(tK + b * B1, B1, HARM[8 + b], 0, { hv: 0.11, bv: 0.5 });
  melody(tK, B1, 6, 8, 0, 0.3);
  add(tK, 'pad', { ch: [53, 57, 60], d: 7.5, v: 0.04 });
  add(111.5, 'glass', { m: 101, v: 0.08, tau: 0.8 });
  const tEnd = tK + 6 * B1;
  add(tEnd, 'bass', { m: 29, v: 0.5 }); add(tEnd, 'harp', { ch: [53, 57, 60, 65, 69], v: 0.14 });
  add(tEnd, 'cel', { m: 77, v: 0.3 }); add(tEnd, 'pad', { ch: [41, 53, 57, 60, 65], d: 2.4, v: 0.05, r: 2 });
  [77, 81, 84, 89, 93, 96, 101].forEach((m, k) => add(tEnd + 0.2 + k * 0.16, 'cel', { m, v: 0.16 - k * 0.012 }));
  add(tEnd + 0.1, 'bell', { m: 89, v: 0.08 });

  /* шаги из плана движения кота (крыши) */
  for (const s of catSteps()) add(s.t, 'step', { s: s.s, v: s.v });
  E.sort((a, b) => a.t - b.t);
  return E;
}

/* моменты касания стопы: из фазы шага по плану кота и отдельных сцен */
function catSteps() {
  const out = [];
  let prev = null;
  for (let t = 12.5; t < 30; t += 1 / 120) {
    const s = planSeg(PLAN1, t);
    if (s.k !== 'walk') { prev = null; continue; }
    const P = catFromPlan(PLAN1, t);
    const ph = ((s.dist0 + Math.abs(P.x - s.x0)) / STRIDE) * 2;
    if (prev !== null && Math.floor(ph) !== Math.floor(prev)) out.push({ t, s: 'roof', v: t < 25 ? 0.1 : 0.04 });
    prev = ph;
  }
  // прыжки: приземления
  for (const s of PLAN1) if (s.k === 'jump') out.push({ t: s.t0 + (s.t1 - s.t0) * 0.75, s: 'roof', v: s.t0 < 25 ? 0.2 : 0.07 });
  if (typeof EXTRA_STEPS !== 'undefined') for (const e of EXTRA_STEPS()) out.push(e);
  return out;
}
