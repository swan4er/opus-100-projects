/* ================================================================
   Звук: мягкие деревянные «ток» при приземлении, шелест дождя,
   ветер и далёкий гром. Всё синтезируется на Web Audio и включается
   только после первого жеста пользователя.
   ================================================================ */
(function () {
  'use strict';
  const S = { on: true };
  let ctx = null, master = null, noiseBuf = null, rainGain = null, windGain = null, lastPop = 0;
  try { S.on = localStorage.getItem('s3-sound') !== 'off'; } catch (e) { S.on = true; }

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = S.on ? 0.5 : 0; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // дождь: розоватый шум через полосовой фильтр; ветер: низкий шум с медленной волной
    const loop = (freq, q, type) => {
      const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(f); f.connect(g); g.connect(master); src.start();
      return { g, f };
    };
    rainGain = loop(2400, 0.6, 'bandpass').g;
    const w = loop(380, 0.9, 'lowpass');
    windGain = w.g;
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 0.13; lg.gain.value = 160; lfo.connect(lg); lg.connect(w.f.frequency); lfo.start();
  }
  const unlock = () => { init(); if (ctx && ctx.state === 'suspended') ctx.resume(); };
  addEventListener('pointerdown', unlock, { passive: true });
  addEventListener('keydown', unlock);

  S.setOn = function (v) {
    S.on = v;
    try { localStorage.setItem('s3-sound', v ? 'on' : 'off'); } catch (e) { /* хранилище недоступно */ }
    if (master) master.gain.setTargetAtTime(v ? 0.5 : 0, ctx.currentTime, 0.08);
  };

  // «ток»: короткий синус с падением высоты + щелчок шума; крупнее — ниже
  S.pop = function (size, soft) {
    if (!ctx || !S.on || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (now - lastPop < 0.035) return;
    lastPop = now;
    const f0 = Math.max(110, 520 / Math.sqrt(Math.max(0.3, size))) * (0.92 + Math.random() * 0.16);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(f0 * 1.6, now); o.frequency.exponentialRampToValueAtTime(f0, now + 0.08);
    g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(soft ? 0.12 : 0.26, now + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    o.connect(g); g.connect(master); o.start(now); o.stop(now + 0.3);
    const n = ctx.createBufferSource(), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
    n.buffer = noiseBuf; nf.type = 'bandpass'; nf.frequency.value = f0 * 4; nf.Q.value = 1.2;
    ng.gain.setValueAtTime(0.0001, now); ng.gain.exponentialRampToValueAtTime(0.06, now + 0.004); ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
    n.connect(nf); nf.connect(ng); ng.connect(master); n.start(now, Math.random()); n.stop(now + 0.08);
  };

  S.thunder = function () {
    if (!ctx || !S.on || ctx.state !== 'running') return;
    const now = ctx.currentTime + 0.3 + Math.random() * 0.5;
    const n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    n.buffer = noiseBuf; f.type = 'lowpass'; f.frequency.value = 160;
    g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.7, now + 0.12); g.gain.exponentialRampToValueAtTime(0.0001, now + 2.4);
    n.connect(f); f.connect(g); g.connect(master); n.start(now); n.stop(now + 2.5);
  };

  // погодный фон: вызывается раз в кадр с текущими долями дождя и ветра
  S.ambience = function (rain, wind) {
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    rainGain.gain.setTargetAtTime(Math.min(1, rain) * 0.16, t, 0.4);
    windGain.gain.setTargetAtTime(0.02 + wind * 0.1, t, 0.6);
  };

  S3.sound = S;
})();
