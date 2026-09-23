/* Ночной музей — звук. Всё синтезируется в Web Audio: гул пустого здания, шаги по паркету и мрамору,
   ход и бой напольных часов, шорох холста, аккорд лампы, УФ-лампа, птицы на рассвете.
   Контекст создаётся только после жеста пользователя. */
(function (root) {
'use strict';
const NM = root.NM = root.NM || {};
let ctx = null, master = null, bus = null, verb = null, verbIn = null, noiseBuf = null, room = null, roomGain = null;
let uvHum = null, muted = false, vol = 0.6;
let nextCreak = 0, nextCar = 0, tickSide = 0;

function makeNoise(sec, brown) {
  const n = Math.floor(ctx.sampleRate * sec);
  const b = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2; } else d[i] = w;
  }
  return b;
}
function makeIR(sec) {
  const n = Math.floor(ctx.sampleRate * sec);
  const b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      lp = lp * 0.55 + (Math.random() * 2 - 1) * 0.45;
      d[i] = lp * Math.pow(1 - t, 3.2) * (i < 80 ? i / 80 : 1);
    }
  }
  return b;
}

function init() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = root.AudioContext || root.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.3;
  master.connect(comp).connect(ctx.destination);
  bus = ctx.createGain(); bus.gain.value = 1; bus.connect(master);
  verb = ctx.createConvolver(); verb.buffer = makeIR(2.8);
  verbIn = ctx.createGain(); verbIn.gain.value = 0.9;
  const vOut = ctx.createGain(); vOut.gain.value = 0.55;
  verbIn.connect(verb).connect(vOut).connect(master);
  noiseBuf = makeNoise(1.5, false);
  // гул пустого здания
  room = ctx.createBufferSource(); room.buffer = makeNoise(6, true); room.loop = true;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240;
  roomGain = ctx.createGain(); roomGain.gain.value = 0.16;
  room.connect(lp).connect(roomGain).connect(bus);
  room.start();
  master.gain.setTargetAtTime(muted ? 0 : vol, ctx.currentTime, 0.8);
  nextCreak = ctx.currentTime + 14; nextCar = ctx.currentTime + 24;
}

function env(g, t, a, peak, d) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}
function burst(t, f, q, peak, dur, send, type) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const bp = ctx.createBiquadFilter(); bp.type = type || 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
  const g = ctx.createGain();
  env(g, t, 0.003, peak, dur);
  s.connect(bp).connect(g);
  g.connect(bus);
  if (send) { const sg = ctx.createGain(); sg.gain.value = send; g.connect(sg).connect(verbIn); }
  s.start(t, Math.random() * 1.2, dur + 0.05);
}
function tone(t, f, type, peak, a, d, send, f2) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + a + d);
  const g = ctx.createGain();
  env(g, t, a, peak, d);
  o.connect(g).connect(bus);
  if (send) { const sg = ctx.createGain(); sg.gain.value = send; g.connect(sg).connect(verbIn); }
  o.start(t); o.stop(t + a + d + 0.05);
}

const A = {
  init,
  get ready() { return !!ctx; },
  setMuted(m) {
    muted = m;
    if (ctx) master.gain.setTargetAtTime(m ? 0 : vol, ctx.currentTime, 0.15);
  },
  get muted() { return muted; },
  suspend(s) { if (!ctx) return; if (s) ctx.suspend(); else ctx.resume(); },
  // шаг: пол определяет тембр, большой зал — эхо
  step(mat, k, big) {
    if (!ctx) return;
    const t = ctx.currentTime + 0.005;
    const v = 0.35 + 0.25 * k;
    const r = 0.9 + Math.random() * 0.2;
    if (mat === 1 || mat === 5) { burst(t, 2600 * r, 1.1, 0.16 * v, 0.07, big ? 0.9 : 0.6); tone(t, 180 * r, 'sine', 0.09 * v, 0.002, 0.05, 0.3, 90); }
    else if (mat === 2 || mat === 3) { burst(t, 1500 * r, 0.9, 0.14 * v, 0.08, 0.4); tone(t, 120 * r, 'sine', 0.1 * v, 0.002, 0.06, 0.2, 70); }
    else if (mat === 9) { burst(t, 500 * r, 0.8, 0.06 * v, 0.07, 0.1); }
    else { burst(t, 850 * r, 1.4, 0.12 * v, 0.09, big ? 0.7 : 0.45); tone(t, 105 * r, 'sine', 0.16 * v, 0.003, 0.08, 0.3, 62); if (Math.random() < 0.12) burst(t + 0.06, 420, 14, 0.05, 0.16, 0.4); }
  },
  // ход маятника: громкость зависит от расстояния до часов
  tick(near) {
    if (!ctx || near < 0.01) return;
    const t = ctx.currentTime + 0.01;
    tickSide ^= 1;
    burst(t, tickSide ? 3400 : 2900, 6, 0.12 * near, 0.025, 0.5);
  },
  chime(n, near) {
    if (!ctx) return;
    const t0 = ctx.currentTime + 0.1;
    const v = 0.1 * (0.35 + 0.65 * near);
    for (let i = 0; i < n; i++) {
      const t = t0 + i * 1.6;
      [[1, 1], [2.01, 0.5], [2.76, 0.35], [5.4, 0.18], [8.93, 0.08]].forEach(([m, a]) => tone(t, 146.8 * m, 'sine', v * a, 0.004, 3.6 / Math.sqrt(m), 0.9));
    }
  },
  click() { if (!ctx) return; const t = ctx.currentTime + 0.005; burst(t, 3800, 2, 0.12, 0.018, 0.2); burst(t + 0.03, 2200, 3, 0.06, 0.015, 0.1); },
  uv(on) {
    if (!ctx) return;
    A.click();
    const t = ctx.currentTime;
    if (on && !uvHum) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 120;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 360;
      const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 2150;
      const g2 = ctx.createGain(); g2.gain.value = 0.004;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.02, t + 0.3);
      o.connect(lp).connect(g); o2.connect(g2).connect(g); g.connect(bus);
      o.start(); o2.start();
      uvHum = { o, o2, g };
    } else if (!on && uvHum) {
      const h = uvHum; uvHum = null;
      h.g.gain.setTargetAtTime(0.0001, t, 0.08);
      h.o.stop(t + 0.5); h.o2.stop(t + 0.5);
    }
  },
  pickup() {
    if (!ctx) return;
    const t = ctx.currentTime + 0.01;
    for (let i = 0; i < 5; i++) burst(t + i * 0.035, 1400 + Math.random() * 1600, 1.2, 0.05, 0.08, 0.3);
    tone(t + 0.12, 659.3, 'triangle', 0.05, 0.01, 1.2, 0.6);
    tone(t + 0.24, 987.8, 'sine', 0.04, 0.01, 1.4, 0.7);
  },
  rehang() {
    if (!ctx) return;
    const t = ctx.currentTime + 0.01;
    tone(t, 90, 'sine', 0.18, 0.004, 0.18, 0.4, 55);
    burst(t, 700, 1.5, 0.08, 0.1, 0.5);
    [293.7, 440, 554.4, 740, 1318.5].forEach((f, i) => tone(t + 0.35 + i * 0.09, f, i % 2 ? 'sine' : 'triangle', 0.045, 0.02, 2.6, 0.8));
    burst(t + 0.3, 4200, 3, 0.07, 0.02, 0.1);
  },
  denied() { if (!ctx) return; const t = ctx.currentTime + 0.01; tone(t, 220, 'triangle', 0.05, 0.01, 0.25, 0.3); tone(t + 0.12, 196, 'triangle', 0.05, 0.01, 0.3, 0.3); },
  finale() {
    if (!ctx) return;
    const t0 = ctx.currentTime + 0.2;
    const notes = [659.3, 784, 880, 987.8, 880, 784, 659.3, 587.3, 659.3, 784, 587.3, 523.3];
    notes.forEach((f, i) => { tone(t0 + i * 0.32, f, 'triangle', 0.05, 0.005, 1.1, 0.7); tone(t0 + i * 0.32, f * 2, 'sine', 0.012, 0.005, 0.5, 0.5); });
    // первые птицы
    for (let i = 0; i < 16; i++) {
      const t = t0 + 3 + Math.random() * 9;
      const f = 3000 + Math.random() * 2200;
      for (let k = 0; k < 2 + Math.floor(Math.random() * 3); k++) tone(t + k * 0.11, f * (1 + k * 0.05), 'sine', 0.012, 0.01, 0.06, 0.4, f * 1.35);
    }
    if (roomGain) roomGain.gain.setTargetAtTime(0.09, t0, 3);
  },
  // случайные звуки здания: скрип половицы, машина за окном
  ambient() {
    if (!ctx) return;
    const t = ctx.currentTime;
    if (t > nextCreak) {
      nextCreak = t + 22 + Math.random() * 30;
      const s = ctx.createBufferSource(); s.buffer = noiseBuf;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 16;
      bp.frequency.setValueAtTime(300 + Math.random() * 200, t); bp.frequency.linearRampToValueAtTime(520 + Math.random() * 200, t + 0.6);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.15); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      if (pan) { pan.pan.value = Math.random() * 2 - 1; s.connect(bp).connect(g).connect(pan).connect(verbIn); } else s.connect(bp).connect(g).connect(verbIn);
      s.start(t, 0, 0.8);
    }
    if (t > nextCar) {
      nextCar = t + 45 + Math.random() * 40;
      const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 2.2); g.gain.exponentialRampToValueAtTime(0.0001, t + 5);
      const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      if (pan) { pan.pan.setValueAtTime(-0.8, t); pan.pan.linearRampToValueAtTime(0.8, t + 5); s.connect(lp).connect(g).connect(pan).connect(bus); } else s.connect(lp).connect(g).connect(bus);
      s.start(t); s.stop(t + 5.2);
    }
  },
};
NM.Audio = A;
})(typeof window !== 'undefined' ? window : globalThis);
