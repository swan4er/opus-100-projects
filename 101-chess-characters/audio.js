/* ================================================================
   audio.js — звук на Web Audio: деревянный стук, «боинг» коня, «пуф»
   павшего, фырканье отказа и «бормотание» персонажей при печати реплик.
   Включается только после жеста пользователя.
   ================================================================ */
window.Sound = (function () {
  'use strict';
  let ctx = null, master = null, on = false, noiseBuf = null;

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.32;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp); comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  function env(g, t, a, d, peak) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  function tone(f0, f1, dur, type, peak, delay = 0) {
    if (!on || !ctx) return;
    const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    env(g, t, 0.008, dur, peak);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, freq, q, peak, delay = 0) {
    if (!on || !ctx) return;
    const t = ctx.currentTime + delay, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    env(g, t, 0.005, dur, peak);
    s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.05);
  }

  const SFX = {
    lift: () => noise(0.05, 1800, 2, 0.08),
    land: () => { noise(0.06, 900, 3, 0.35); tone(220, 140, 0.08, 'sine', 0.2); },
    thud: () => { noise(0.12, 300, 1.5, 0.6); tone(90, 50, 0.25, 'sine', 0.5); },
    boing: () => { tone(180, 720, 0.35, 'triangle', 0.18); tone(360, 1100, 0.3, 'sine', 0.06, 0.04); },
    poof: () => { noise(0.3, 1200, 0.8, 0.35); tone(700, 180, 0.45, 'triangle', 0.14, 0.05); },
    huff: () => { noise(0.18, 500, 1.2, 0.25); tone(160, 110, 0.2, 'sawtooth', 0.05); },
    ok: () => { tone(520, 520, 0.09, 'triangle', 0.12); tone(780, 780, 0.12, 'triangle', 0.12, 0.08); },
    no: () => { tone(300, 200, 0.14, 'square', 0.05); tone(240, 150, 0.18, 'square', 0.05, 0.12); },
    check: () => { tone(880, 880, 0.08, 'square', 0.06); tone(660, 660, 0.12, 'square', 0.06, 0.1); },
  };

  // бормотание: короткий слог с «формантой», высота — голос персонажа
  let lastBlip = 0;
  function blip(pitch) {
    if (!on || !ctx) return;
    const t = ctx.currentTime;
    if (t - lastBlip < 0.055) return;
    lastBlip = t;
    const base = 170 * (pitch || 1) * (0.9 + Math.random() * 0.25);
    const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(base, t); o.frequency.linearRampToValueAtTime(base * (0.85 + Math.random() * 0.3), t + 0.06);
    f.type = 'bandpass'; f.frequency.value = 600 + Math.random() * 1400; f.Q.value = 4;
    env(g, t, 0.006, 0.06, 0.09);
    o.connect(f); f.connect(g); g.connect(master); o.start(t); o.stop(t + 0.1);
  }

  return {
    get on() { return on; },
    set(v) { if (v) init(); on = !!v && !!ctx; if (ctx && ctx.state === 'suspended') ctx.resume(); return on; },
    sfx(name) { try { SFX[name] && SFX[name](); } catch (e) { /* звук не критичен */ } },
    blip,
  };
})();
