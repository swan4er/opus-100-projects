/* ================================================================
   sound.js — все звуки синтезируются на Web Audio.
   Включаются только после жеста пользователя (кнопка «Взять ключи»).
   ================================================================ */
'use strict';
const SFX = (() => {
  let ctx = null, master = null, noiseBuf = null, muted = false;
  const loops = {};
  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; return; }
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4;
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.42;
    master.connect(comp); comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    ambience();
  }
  const now = () => ctx.currentTime;
  function env(g, t, a, peak, rel) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + rel); }
  function tone(type, f0, f1, t, a, peak, rel, dest) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type;
    o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + a + rel);
    env(g, t, a, peak, rel); o.connect(g); g.connect(dest || master); o.start(t); o.stop(t + a + rel + 0.05); return o;
  }
  function noise(t, dur, type, freq, q, peak, a = 0.005, dest) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); env(g, t, a, peak, dur);
    s.connect(f); f.connect(g); g.connect(dest || master); s.start(t, Math.random()); s.stop(t + a + dur + 0.05); return { s, f, g };
  }
  // голоса-бормотание: у каждого персонажа своя высота и тембр
  const VOICES = { baba: ['triangle', 540, 0.05], mih: ['sawtooth', 150, 0.035], gena: ['square', 230, 0.03], phone: ['triangle', 600, 0.035], me: ['triangle', 330, 0.03] };
  const S = {
    click(t) { tone('sine', 1300, 900, t, 0.002, 0.2, 0.05); },
    tool(t) { tone('triangle', 320, 160, t, 0.004, 0.18, 0.08); noise(t, 0.05, 'bandpass', 2400, 2, 0.05); },
    step(t, o = {}) {
      const r = o.room;
      if (r === 'bath') { noise(t, 0.05, 'bandpass', 2600, 3, 0.07); return; }
      noise(t, 0.09, 'lowpass', r === 'zal' ? 500 : 380, 1, 0.1);
      if (r === 'zal' && Math.random() < 0.18) { const o2 = tone('sawtooth', 190 + Math.random() * 80, 150, t + 0.02, 0.05, 0.02, 0.25); void o2; } // скрип паркета
    },
    slap(t) { noise(t, 0.18, 'lowpass', 900, 1, 0.35); tone('sine', 110, 60, t, 0.003, 0.3, 0.15); },
    unroll(t) { const n = noise(t, 0.5, 'bandpass', 1200, 1.2, 0.12, 0.2); n.f.frequency.linearRampToValueAtTime(3000, t + 0.6); },
    tile(t) { noise(t, 0.04, 'bandpass', 2800, 4, 0.25); tone('sine', 1700 + Math.random() * 300, 1500, t, 0.001, 0.12, 0.08); tone('sine', 140, 80, t, 0.002, 0.2, 0.08); },
    brush(t) { noise(t, 0.16, 'bandpass', 3200 + Math.random() * 800, 1.5, 0.06, 0.03); },
    splat(t) { tone('sine', 700, 140, t, 0.002, 0.14, 0.07); noise(t, 0.06, 'lowpass', 1500, 1, 0.08); },
    scrape(t) { const n = noise(t, 0.3, 'bandpass', 1500, 3, 0.12, 0.02); n.f.frequency.linearRampToValueAtTime(900, t + 0.3); },
    ratchet(t) { for (let i = 0; i < 4; i++) { noise(t + i * 0.06, 0.02, 'highpass', 3000, 1, 0.14); tone('square', 2200, 2000, t + i * 0.06, 0.001, 0.03, 0.02); } },
    drip(t) { tone('sine', 1400, 380, t, 0.001, 0.12, 0.06); },
    open(t) { noise(t, 0.45, 'highpass', 2500, 0.7, 0.3, 0.004); tone('sine', 3100, 2900, t, 0.001, 0.1, 0.12); },
    gulp(t) { for (let i = 0; i < 3; i++) tone('sine', 190, 110, t + 0.25 + i * 0.36, 0.01, 0.35, 0.12); },
    hic(t) { tone('sine', 380, 760, t, 0.005, 0.25, 0.09); },
    lighter(t) { noise(t, 0.03, 'highpass', 4000, 1, 0.3); noise(t + 0.06, 0.35, 'lowpass', 700, 1, 0.12, 0.05); },
    inhale(t) { for (let i = 0; i < 14; i++) noise(t + i * 0.06 + Math.random() * 0.03, 0.01, 'highpass', 5000, 1, 0.05 + Math.random() * 0.05); noise(t, 0.9, 'bandpass', 900, 0.8, 0.04, 0.3); },
    cough(t) { for (let i = 0; i < 2; i++) { noise(t + i * 0.28, 0.14, 'bandpass', 700, 1.5, 0.3, 0.01); tone('sawtooth', 160, 110, t + i * 0.28, 0.01, 0.06, 0.12); } },
    ring(t) { // механический звонок телефона: два колокольчика, молоточек 20 Гц
      for (let k = 0; k < 24; k++) { const tt = t + k * 0.05; const f = k % 2 ? 1310 : 1580; tone('sine', f, f, tt, 0.001, 0.16, 0.09); tone('sine', f * 2.76, f * 2.76, tt, 0.001, 0.05, 0.05); }
    },
    doorbell(t) { const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter(); o.type = 'square'; o.frequency.value = 470; f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 1.5; env(g, t, 0.01, 0.22, 1.1); const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 42; lg.gain.value = 0.12; lfo.connect(lg); lg.connect(g.gain); o.connect(f); f.connect(g); g.connect(master); o.start(t); lfo.start(t); o.stop(t + 1.2); lfo.stop(t + 1.2); },
    creak(t) { const o = tone('sawtooth', 240, 170, t, 0.08, 0.05, 0.5); void o; noise(t, 0.5, 'bandpass', 600, 6, 0.05, 0.1); },
    boom(t) { tone('sine', 70, 40, t, 0.005, 0.8, 0.5); noise(t, 0.6, 'lowpass', 500, 1, 0.5, 0.005); },
    meow(t) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(620, t); o.frequency.linearRampToValueAtTime(980, t + 0.18); o.frequency.linearRampToValueAtTime(520, t + 0.55); env(g, t, 0.05, 0.16, 0.5); const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2200; o.connect(f); f.connect(g); g.connect(master); o.start(t); o.stop(t + 0.7); },
    bad(t) { tone('triangle', 330, 300, t, 0.005, 0.18, 0.14); tone('triangle', 247, 220, t + 0.13, 0.005, 0.18, 0.22); },
    good(t) { tone('triangle', 660, 660, t, 0.005, 0.14, 0.12); tone('triangle', 880, 880, t + 0.1, 0.005, 0.12, 0.2); },
    coin(t) { tone('sine', 2100, 2100, t, 0.002, 0.12, 0.25); tone('sine', 3150, 3150, t, 0.002, 0.05, 0.2); },
    thud(t) { tone('sine', 120, 60, t, 0.003, 0.35, 0.18); noise(t, 0.1, 'lowpass', 400, 1, 0.2); },
    whoosh(t) { const n = noise(t, 0.6, 'bandpass', 400, 0.8, 0.12, 0.2); n.f.frequency.linearRampToValueAtTime(1600, t + 0.6); },
    pen(t) { for (let i = 0; i < 5; i++) noise(t + i * 0.05, 0.03, 'bandpass', 5000, 3, 0.05); },
  };
  function play(name, o) { if (!ctx || muted || !S[name]) return; try { S[name](now() + 0.01, o); } catch (e) { /* звук не должен ронять игру */ } }
  function voice(who) {
    if (!ctx || muted) return; const v = VOICES[who] || VOICES.phone; const t = now() + 0.005;
    const f = v[1] * (0.85 + Math.random() * 0.35);
    const o = ctx.createOscillator(), g = ctx.createGain(), fl = ctx.createBiquadFilter();
    o.type = v[0]; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * (Math.random() < 0.5 ? 0.9 : 1.12), t + 0.07);
    fl.type = 'lowpass'; fl.frequency.value = who === 'phone' ? 1400 : 2200;
    env(g, t, 0.008, v[2], 0.07); o.connect(fl); fl.connect(g); g.connect(master); o.start(t); o.stop(t + 0.1);
  }
  // зацикленные: вода, пламя колонки
  function loop(name, on, vol = 1) {
    if (!ctx) return;
    if (on && !loops[name]) {
      const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
      const f = ctx.createBiquadFilter(), g = ctx.createGain();
      if (name === 'water') { f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.6; }
      else { f.type = 'lowpass'; f.frequency.value = 420; f.Q.value = 0.8; }
      g.gain.setValueAtTime(0.0001, now()); g.gain.exponentialRampToValueAtTime(0.2 * vol, now() + 0.3);
      const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = name === 'water' ? 5 : 11; lg.gain.value = 250; lfo.connect(lg); lg.connect(f.frequency); lfo.start();
      s.connect(f); f.connect(g); g.connect(master); s.start();
      loops[name] = { s, g, lfo };
    } else if (!on && loops[name]) {
      const L = loops[name]; delete loops[name];
      L.g.gain.cancelScheduledValues(now()); L.g.gain.setValueAtTime(L.g.gain.value, now()); L.g.gain.exponentialRampToValueAtTime(0.0001, now() + 0.4);
      L.s.stop(now() + 0.5); L.lfo.stop(now() + 0.5);
    } else if (on && loops[name]) loops[name].g.gain.setTargetAtTime(0.2 * vol, now(), 0.2);
  }
  // тихий фон: гул комнаты и редкие птицы во дворе
  function ambience() {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 220;
    const g = ctx.createGain(); g.gain.value = 0.05; s.connect(f); f.connect(g); g.connect(master); s.start();
    setInterval(() => {
      if (!ctx || muted || document.hidden) return;
      if (Math.random() < 0.35) { const t = now(); const b = 2600 + Math.random() * 1600; for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) tone('sine', b, b * 1.25, t + i * 0.14, 0.01, 0.018, 0.08); }
    }, 2400);
  }
  function mute(m) { muted = m; if (master) master.gain.setTargetAtTime(m ? 0 : 0.42, ctx.currentTime, 0.05); }
  return { init, play, voice, loop, mute, get on() { return !!ctx && !muted; } };
})();
