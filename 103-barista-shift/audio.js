/* ================================================================
   Смена — звук на Web Audio: гул района, кофемолка, пар, пролив,
   пшик бутылки, зажигалка, звонок шефа, «бубнёж» персонажей.
   Включается только после жеста игрока.
   ================================================================ */
(function () {
  'use strict';
  const S = { ctx: null, master: null, on: true, loops: {} };
  window.Sound = S;
  let noiseBuf = null;

  S.start = function () {
    if (S.ctx) { if (S.ctx.state === 'suspended') S.ctx.resume(); return; }
    try {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return;
      S.ctx = new C();
      S.master = S.ctx.createGain(); S.master.gain.value = S.on ? .5 : 0; S.master.connect(S.ctx.destination);
      const len = S.ctx.sampleRate * 2;
      noiseBuf = S.ctx.createBuffer(1, len, S.ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      ambience();
    } catch (e) { S.ctx = null; }
  };
  S.toggle = function () {
    S.on = !S.on;
    if (S.master) S.master.gain.setTargetAtTime(S.on ? .5 : 0, S.ctx.currentTime, .1);
    return S.on;
  };
  const now = () => S.ctx.currentTime;

  function noiseSrc() { const s = S.ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; return s; }
  function env(g, a, peak, hold, rel, t0 = now()) {
    g.gain.cancelScheduledValues(t0); g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + a);
    g.gain.setValueAtTime(peak, t0 + a + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + hold + rel);
  }

  // ---------- фон: гул города и ветер ----------
  function ambience() {
    const n = noiseSrc(), f = S.ctx.createBiquadFilter(), g = S.ctx.createGain();
    f.type = 'lowpass'; f.frequency.value = 320; g.gain.value = .07;
    n.connect(f).connect(g).connect(S.master); n.start();
    const w = noiseSrc(), wf = S.ctx.createBiquadFilter(), wg = S.ctx.createGain(), lfo = S.ctx.createOscillator(), lg = S.ctx.createGain();
    wf.type = 'bandpass'; wf.frequency.value = 700; wf.Q.value = .7; wg.gain.value = .02;
    lfo.frequency.value = .09; lg.gain.value = .018; lfo.connect(lg).connect(wg.gain); lfo.start();
    w.connect(wf).connect(wg).connect(S.master); w.start();
    const hum = S.ctx.createOscillator(), hg = S.ctx.createGain();
    hum.type = 'sine'; hum.frequency.value = 100; hg.gain.value = .008; hum.connect(hg).connect(S.master); hum.start();
  }

  // ---------- непрерывные звуки (вкл/выкл) ----------
  function loop(name, build) {
    return function (on) {
      if (!S.ctx) return;
      const L = S.loops[name];
      if (on && !L) { S.loops[name] = build(); }
      else if (!on && L) {
        L.g.gain.setTargetAtTime(0.0001, now(), .06);
        setTimeout(() => { try { L.stop(); } catch (e) {} }, 400);
        delete S.loops[name];
      }
    };
  }
  S.grind = loop('grind', () => {
    const n = noiseSrc(), f = S.ctx.createBiquadFilter(), g = S.ctx.createGain(), o = S.ctx.createOscillator(), og = S.ctx.createGain();
    f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 1.2;
    o.type = 'sawtooth'; o.frequency.value = 118; og.gain.value = .05;
    const lfo = S.ctx.createOscillator(), lg = S.ctx.createGain(); lfo.frequency.value = 23; lg.gain.value = .05; lfo.connect(lg).connect(g.gain); lfo.start();
    g.gain.value = 0.0001; g.gain.setTargetAtTime(.12, now(), .03);
    n.connect(f).connect(g); o.connect(og).connect(g); g.connect(S.master); n.start(); o.start();
    return { g, stop() { n.stop(); o.stop(); lfo.stop(); } };
  });
  S.steam = loop('steam', () => {
    const n = noiseSrc(), f = S.ctx.createBiquadFilter(), g = S.ctx.createGain();
    f.type = 'highpass'; f.frequency.value = 2600;
    g.gain.value = 0.0001; g.gain.setTargetAtTime(.09, now(), .05);
    n.connect(f).connect(g).connect(S.master); n.start();
    return { g, f, stop() { n.stop(); } };
  });
  S.steamPitch = (k) => { const L = S.loops.steam; if (L) L.f.frequency.setTargetAtTime(2600 + k * 3000, now(), .1); };
  S.pull = loop('pull', () => {
    const o = S.ctx.createOscillator(), og = S.ctx.createGain(), n = noiseSrc(), f = S.ctx.createBiquadFilter(), g = S.ctx.createGain();
    o.type = 'square'; o.frequency.value = 50; og.gain.value = .02;
    f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 4;
    const lfo = S.ctx.createOscillator(), lg = S.ctx.createGain(); lfo.frequency.value = 7; lg.gain.value = 300; lfo.connect(lg).connect(f.frequency); lfo.start();
    g.gain.value = 0.0001; g.gain.setTargetAtTime(.1, now(), .05);
    o.connect(og).connect(g); n.connect(f).connect(g); g.connect(S.master); o.start(); n.start();
    return { g, stop() { o.stop(); n.stop(); lfo.stop(); } };
  });
  S.pour = loop('pour', () => {
    const n = noiseSrc(), f = S.ctx.createBiquadFilter(), g = S.ctx.createGain();
    f.type = 'bandpass'; f.frequency.value = 1200; f.Q.value = 2.5;
    const lfo = S.ctx.createOscillator(), lg = S.ctx.createGain(); lfo.frequency.value = 11; lg.gain.value = 500; lfo.connect(lg).connect(f.frequency); lfo.start();
    g.gain.value = 0.0001; g.gain.setTargetAtTime(.08, now(), .05);
    n.connect(f).connect(g).connect(S.master); n.start();
    return { g, stop() { n.stop(); lfo.stop(); } };
  });

  // ---------- короткие звуки ----------
  function tone(freq, type, a, hold, rel, vol, t0) {
    const o = S.ctx.createOscillator(), g = S.ctx.createGain();
    o.type = type; o.frequency.value = freq; o.connect(g).connect(S.master);
    env(g, a, vol, hold, rel, t0); o.start(t0 || now()); o.stop((t0 || now()) + a + hold + rel + .05);
    return o;
  }
  function burst(freq, q, type, a, rel, vol, t0) {
    const n = noiseSrc(), f = S.ctx.createBiquadFilter(), g = S.ctx.createGain();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    n.connect(f).connect(g).connect(S.master); env(g, a, vol, 0, rel, t0);
    const t = t0 || now(); n.start(t, Math.random()); n.stop(t + a + rel + .05);
  }
  S.click = () => { if (S.ctx) tone(900, 'triangle', .002, 0, .05, .05); };
  S.tamp = () => { if (!S.ctx) return; tone(90, 'sine', .005, .02, .18, .25); burst(2000, 1, 'bandpass', .002, .05, .08); };
  S.cash = () => { if (!S.ctx) return; const t = now(); tone(1318, 'sine', .005, .05, .6, .12, t); tone(1976, 'sine', .005, .05, .5, .08, t + .08); burst(5000, 1, 'highpass', .002, .08, .05, t); };
  S.bottle = () => { if (!S.ctx) return; burst(3500, .8, 'highpass', .005, .35, .25); tone(300, 'sine', .002, .01, .08, .08); };
  S.glug = () => {
    if (!S.ctx) return; const t = now();
    for (let i = 0; i < 6; i++) { const o = tone(160 + i * 12, 'sine', .01, .03, .12, .14, t + i * .28); o.frequency.exponentialRampToValueAtTime(420, t + i * .28 + .12); }
  };
  S.lighter = () => { if (!S.ctx) return; const t = now(); burst(4000, 2, 'bandpass', .001, .03, .3, t); burst(4200, 2, 'bandpass', .001, .03, .25, t + .12); burst(800, .5, 'lowpass', .05, .5, .12, t + .15); };
  S.inhale = () => { if (!S.ctx) return; burst(1500, .7, 'bandpass', .5, .6, .06); for (let i = 0; i < 6; i++) burst(6000, 3, 'bandpass', .001, .02, .05, now() + .2 + Math.random() * .8); };
  S.drop = () => { if (!S.ctx) return; tone(140, 'sine', .002, .01, .15, .2); burst(1200, 1, 'bandpass', .001, .1, .15); };
  S.thud = () => { if (!S.ctx) return; tone(70, 'sine', .005, .02, .25, .3); };
  S.bus = () => { if (!S.ctx) return; const t = now(); burst(3000, .5, 'highpass', .05, .9, .08, t + 1.2); const o = tone(55, 'sawtooth', .5, 1.5, 1.5, .04, t); o.frequency.linearRampToValueAtTime(40, t + 3); };
  S.bad = () => { if (!S.ctx) return; tone(220, 'triangle', .005, .05, .25, .08); tone(160, 'triangle', .005, .05, .3, .08, now() + .12); };
  S.good = () => { if (!S.ctx) return; tone(660, 'triangle', .005, .04, .25, .07); tone(990, 'triangle', .005, .04, .3, .06, now() + .1); };
  S.paper = () => { if (!S.ctx) return; for (let i = 0; i < 8; i++) burst(3000 + Math.random() * 3000, 2, 'bandpass', .001, .02, .06, now() + i * .05); };
  S.marker = () => { if (!S.ctx) return; for (let i = 0; i < 5; i++) burst(5000, 4, 'bandpass', .02, .08, .05, now() + i * .1); };
  // звонок: ретро-мелодия
  let ringT = null;
  S.ring = function (on) {
    if (!S.ctx) return;
    clearInterval(ringT); ringT = null;
    if (!on) return;
    const play = () => { const t = now(); [784, 988, 1175, 988, 784, 988].forEach((f, i) => tone(f, 'square', .005, .06, .05, .035, t + i * .12)); };
    play(); ringT = setInterval(play, 1600);
  };
  // «бубнёж»: короткие слоги под потоковый текст
  let lastBlip = 0;
  S.blip = function (pitch = 1) {
    if (!S.ctx) return;
    const t = now(); if (t - lastBlip < .07) return; lastBlip = t;
    const o = S.ctx.createOscillator(), f = S.ctx.createBiquadFilter(), g = S.ctx.createGain();
    o.type = 'sawtooth'; o.frequency.value = (150 + Math.random() * 60) * pitch;
    f.type = 'bandpass'; f.frequency.value = (700 + Math.random() * 900) * Math.sqrt(pitch); f.Q.value = 3;
    o.connect(f).connect(g).connect(S.master); env(g, .01, .06, .02, .06, t); o.start(t); o.stop(t + .12);
  };
})();
