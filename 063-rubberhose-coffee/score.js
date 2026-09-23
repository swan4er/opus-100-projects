'use strict';
/* =====================================================================
   Кофейник Жорж · партитура и синтез (Web Audio, без единого сэмпла)
   Регтайм 120 ударов в минуту: такт 2/4 = 1 с, шестнадцатая = 0,125 с.
   Фортепиано — два чуть расстроенных голоса (тапёрский «хонки-тонк»), туба, барабаны,
   свист, музыкальная шкатулка, «бойнги» и шумы. Каждое событие привязано ко времени фильма,
   поэтому перемотка просто перезапускает планировщик с нужного места.
   ===================================================================== */
const Score = (() => {
  const S16 = 0.125;
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  /** Частота не выше 0,45 от частоты дискретизации: без предупреждений на любых устройствах. */
  const nyq = (ac, f) => Math.min(f, ac.sampleRate * 0.45);
  const EV = [];                      // [{t, fn(o, when)}], отсортировано по t
  const at = (t, fn) => EV.push({ t, fn });

  /* ---------- общие ресурсы контекста ---------- */
  function resources(ac) {
    const n = ac.sampleRate * 2;
    const buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
    let s = 12345;
    for (let i = 0; i < n; i++) { s = (Math.imul(s, 1103515245) + 12345) >>> 0; d[i] = (s / 4294967296) * 2 - 1; }
    const imag = new Float32Array([0, 1, 0.52, 0.34, 0.23, 0.16, 0.11, 0.075, 0.05, 0.034, 0.022, 0.014]);
    const wave = ac.createPeriodicWave(new Float32Array(imag.length), imag);
    // треск оптической фонограммы: редкие щелчки
    const cn = ac.sampleRate * 3, cb = ac.createBuffer(1, cn, ac.sampleRate), cd = cb.getChannelData(0);
    for (let i = 0; i < cn; i++) { s = (Math.imul(s, 1103515245) + 12345) >>> 0; const r = s / 4294967296; cd[i] = r < 0.0009 ? (r * 2000 - 0.9) : ((s >>> 8) / 16777216 * 2 - 1) * 0.02; }
    return { noise: buf, wave, crackle: cb };
  }

  /** Цепочка «кинозала»: приглушение (для сцены на полке), полоса оптической фонограммы, компрессор. */
  function chain(ac, dest) {
    const bus = ac.createGain();
    const muffle = ac.createBiquadFilter(); muffle.type = 'lowpass'; muffle.frequency.value = nyq(ac, 18000); muffle.Q.value = 0.7;
    const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 65;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 8200; lp.Q.value = 0.5;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 3.5; comp.attack.value = 0.004; comp.release.value = 0.2;
    const out = ac.createGain(); out.gain.value = 0.9;
    bus.connect(muffle); muffle.connect(hp); hp.connect(lp); lp.connect(comp); comp.connect(out); out.connect(dest);
    return { bus, muffle, out };
  }

  /* ---------- инструменты: o = { ac, out, R } ---------- */
  function gainEnv(o, when, peak, a, d) {
    const g = o.ac.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(peak, when + a);
    g.gain.exponentialRampToValueAtTime(0.0008, when + a + d);
    g.gain.linearRampToValueAtTime(0, when + a + d + 0.02);
    return g;
  }
  function osc(o, type, f, when, stop) {
    const x = o.ac.createOscillator();
    if (type === 'piano') x.setPeriodicWave(o.R.wave); else x.type = type;
    x.frequency.setValueAtTime(nyq(o.ac, f), when);
    x.start(when); x.stop(stop);
    return x;
  }
  function noiseSrc(o, when, dur) {
    const x = o.ac.createBufferSource(); x.buffer = o.R.noise; x.loop = true;
    x.start(when, Math.random() * 1.5); x.stop(when + dur + 0.05);
    return x;
  }
  function filt(o, type, f, q = 1) { const b = o.ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }

  function piano(o, when, midi, vel = 0.5, dur = 0.3, bright = 1) {
    const ac = o.ac, f = mtof(midi);
    const lp = filt(o, 'lowpass', 1000, 0.6);
    const fc = Math.min(9000, 800 + f * 5 * bright);
    lp.frequency.setValueAtTime(fc, when);
    lp.frequency.exponentialRampToValueAtTime(Math.max(260, fc * 0.28), when + 0.9);
    const g = ac.createGain();
    const v = vel * 0.2, dec = clamp(3.1 - (midi - 36) * 0.045, 0.45, 3.1);
    const off = when + Math.max(dur, 0.14);
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(v, when + 0.004);
    g.gain.setTargetAtTime(v * 0.38, when + 0.005, 0.07);
    g.gain.setTargetAtTime(0, when + 0.13, dec / 3);
    g.gain.setTargetAtTime(0, off, 0.07);
    for (const det of [-6, 7]) { const x = osc(o, 'piano', f, when, off + 0.6); x.detune.value = det; x.connect(lp); }
    lp.connect(g); g.connect(o.out);
    if (vel > 0.35) {   // стук молоточка
      const n = noiseSrc(o, when, 0.03), bp = filt(o, 'bandpass', Math.min(6000, f * 3), 1.2), ng = gainEnv(o, when, vel * 0.05, 0.001, 0.02);
      n.connect(bp); bp.connect(ng); ng.connect(o.out);
    }
  }
  function chord(o, when, notes, vel, dur) { for (const m of notes) piano(o, when, m, vel, dur); }

  function tuba(o, when, midi, dur = 0.28, vel = 0.5, glideTo = null) {
    const ac = o.ac, f = mtof(midi);
    const end = when + dur;
    const a = osc(o, 'sawtooth', f * 0.94, when, end + 0.3), b = osc(o, 'sine', f, when, end + 0.3);
    a.frequency.exponentialRampToValueAtTime(f, when + 0.05);
    if (glideTo != null) { a.frequency.exponentialRampToValueAtTime(mtof(glideTo), end); b.frequency.exponentialRampToValueAtTime(mtof(glideTo), end); }
    const lp = filt(o, 'lowpass', f * 1.5, 1.6);
    lp.frequency.setValueAtTime(f * 1.4, when);
    lp.frequency.linearRampToValueAtTime(f * 5.5 + 200, when + 0.035);
    lp.frequency.setTargetAtTime(f * 2.6 + 140, when + 0.05, 0.09);
    const g = ac.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(vel * 0.3, when + 0.03);
    g.gain.setTargetAtTime(vel * 0.22, when + 0.04, 0.08);
    g.gain.setTargetAtTime(0, end, 0.05);
    const bg = ac.createGain(); bg.gain.value = 0.6;
    a.connect(lp); b.connect(bg); bg.connect(g); lp.connect(g); g.connect(o.out);
  }

  /** Свист Жоржа: одна «струя» на такт, ноты перетекают друг в друга с лёгким вибрато. */
  function whistleBar(o, when, notes, vel = 0.3) {
    const ac = o.ac;
    const last = notes[notes.length - 1];
    const end = when + last[0] + last[2];
    const x = osc(o, 'sine', mtof(notes[0][1]), when, end + 0.2);
    const vib = osc(o, 'sine', 5.6, when, end + 0.2), vg = ac.createGain();
    vg.gain.value = mtof(notes[0][1]) * 0.011; vib.connect(vg); vg.connect(x.frequency);
    const g = ac.createGain(); g.gain.setValueAtTime(0, when);
    for (let i = 0; i < notes.length; i++) {
      const [off, m, d] = notes[i];
      const t0 = when + off;
      x.frequency.setTargetAtTime(mtof(m), t0 - 0.012, 0.012);
      g.gain.setTargetAtTime(vel * 0.2, t0, 0.012);
      const next = notes[i + 1];
      if (!next || next[0] > off + d + 0.01) g.gain.setTargetAtTime(0, t0 + d - 0.03, 0.02);
      else g.gain.setTargetAtTime(vel * 0.13, t0 + d - 0.035, 0.012);
    }
    g.gain.setTargetAtTime(0, end, 0.03);
    // дыхание
    const n = noiseSrc(o, when, end - when + 0.1), bp = filt(o, 'bandpass', mtof(notes[0][1]), 6), ng = ac.createGain();
    ng.gain.value = 0.12;
    n.connect(bp); bp.connect(ng); ng.connect(g);
    x.connect(g); g.connect(o.out);
  }

  function musicBox(o, when, midi, vel = 0.4) {
    const f = mtof(midi);
    for (const [k, a, d] of [[1, 1, 1.5], [3, 0.14, 0.5], [5.4, 0.05, 0.25]]) {
      const x = osc(o, 'sine', f * k, when, when + d + 0.1), g = gainEnv(o, when, vel * 0.16 * a, 0.002, d);
      x.connect(g); g.connect(o.out);
    }
  }
  function ding(o, when, midi, vel = 0.4, d = 1.1) {
    const f = mtof(midi);
    for (const [k, a, dd] of [[1, 1, d], [2, 0.12, d * 0.5], [4, 0.2, d * 0.35]]) {
      const x = osc(o, 'sine', f * k, when, when + dd + 0.1), g = gainEnv(o, when, vel * 0.17 * a, 0.002, dd);
      x.connect(g); g.connect(o.out);
    }
  }
  function metal(o, when, parts, vel = 0.4) {
    for (const [f, a, d] of parts) {
      const x = osc(o, 'sine', f, when, when + d + 0.1), g = gainEnv(o, when, vel * 0.15 * a, 0.001, d);
      x.connect(g); g.connect(o.out);
    }
  }
  function noiseHit(o, when, dur, type, f, q, vel, f1 = null, a = 0.002) {
    const n = noiseSrc(o, when, dur), b = filt(o, type, f, q), g = gainEnv(o, when, vel, a, dur);
    if (f1) b.frequency.exponentialRampToValueAtTime(f1, when + dur);
    n.connect(b); b.connect(g); g.connect(o.out);
    return g;
  }
  function boing(o, when, f0 = 190, vel = 0.4) {
    const ac = o.ac;
    const x = osc(o, 'triangle', f0, when, when + 0.6);
    x.frequency.exponentialRampToValueAtTime(f0 * 1.9, when + 0.42);
    const l = osc(o, 'sine', 17, when, when + 0.6), lg = ac.createGain();
    lg.gain.setValueAtTime(f0 * 0.5, when); lg.gain.exponentialRampToValueAtTime(1, when + 0.45);
    l.connect(lg); lg.connect(x.frequency);
    const g = gainEnv(o, when, vel * 0.42, 0.004, 0.5);
    const tw = osc(o, 'square', f0 * 2, when, when + 0.3), tl = filt(o, 'lowpass', 1400), tg = gainEnv(o, when, vel * 0.05, 0.002, 0.2);
    x.connect(g); g.connect(o.out); tw.connect(tl); tl.connect(tg); tg.connect(o.out);
  }
  function slideW(o, when, f0, f1, dur, vel = 0.25) {
    const ac = o.ac;
    const x = osc(o, 'sine', f0, when, when + dur + 0.1);
    x.frequency.exponentialRampToValueAtTime(f1, when + dur);
    const v = osc(o, 'sine', 6.5, when, when + dur + 0.1), vg = ac.createGain(); vg.gain.value = Math.min(f0, f1) * 0.015; v.connect(vg); vg.connect(x.frequency);
    const g = ac.createGain();
    g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(vel * 0.2, when + 0.03);
    g.gain.setValueAtTime(vel * 0.2, when + dur - 0.05); g.gain.linearRampToValueAtTime(0, when + dur);
    x.connect(g); g.connect(o.out);
  }
  function snare(o, when, vel = 0.3) {
    noiseHit(o, when, 0.16, 'bandpass', 1900, 0.8, vel * 0.5);
    const x = osc(o, 'triangle', 190, when, when + 0.12); x.frequency.exponentialRampToValueAtTime(140, when + 0.08);
    const g = gainEnv(o, when, vel * 0.25, 0.001, 0.08); x.connect(g); g.connect(o.out);
  }
  function brush(o, when, vel = 0.2) { noiseHit(o, when, 0.12, 'bandpass', 3600, 0.6, vel * 0.3, null, 0.012); }
  function kick(o, when, vel = 0.4) {
    const x = osc(o, 'sine', 95, when, when + 0.35); x.frequency.exponentialRampToValueAtTime(44, when + 0.14);
    const g = gainEnv(o, when, vel * 0.55, 0.002, 0.3); x.connect(g); g.connect(o.out);
  }
  function wood(o, when, f = 1150, vel = 0.3) { metal(o, when, [[f, 1, 0.05], [f * 2.57, 0.35, 0.03]], vel * 1.6); }
  function tap(o, when, vel = 0.3) { noiseHit(o, when, 0.04, 'highpass', 3000, 0.7, vel * 0.4); wood(o, when, 1650, vel * 0.5); }
  function cymbal(o, when, vel = 0.3, dur = 1.4) {
    noiseHit(o, when, dur, 'highpass', 6500, 0.6, vel * 0.32);
    noiseHit(o, when, dur * 0.6, 'bandpass', 9500, 1.5, vel * 0.18);
  }
  function swell(o, when, dur, vel = 0.25) {
    const n = noiseSrc(o, when, dur), b = filt(o, 'highpass', 5000, 0.6), g = o.ac.createGain();
    g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(vel * 0.3, when + dur); g.gain.linearRampToValueAtTime(0, when + dur + 0.02);
    n.connect(b); b.connect(g); g.connect(o.out);
  }
  function clap(o, when, vel = 0.4) {
    for (let i = 0; i < 3; i++) noiseHit(o, when + i * 0.009, 0.02, 'bandpass', 1200, 1, vel * 0.4);
    noiseHit(o, when + 0.027, 0.1, 'bandpass', 1100, 0.9, vel * 0.3);
  }
  function tick(o, when, hi, vel = 0.25) {
    metal(o, when, [[hi ? 2350 : 1900, 1, 0.03], [hi ? 5200 : 4300, 0.3, 0.015]], vel * 1.4);
    noiseHit(o, when, 0.012, 'highpass', 4000, 0.7, vel * 0.3);
  }
  function ring(o, when, dur, vel = 0.4) {
    const ac = o.ac;
    const sum = ac.createGain(); sum.gain.value = 0;
    const lfo = osc(o, 'square', 23, when, when + dur + 0.1), lg = ac.createGain(); lg.gain.value = 0.5;
    const off = ac.createConstantSource ? ac.createConstantSource() : null;
    lfo.connect(lg); lg.connect(sum.gain);
    if (off) { off.offset.value = 0.5; off.connect(sum.gain); off.start(when); off.stop(when + dur + 0.1); }
    for (const [f, a] of [[1760, 1], [2650, 0.6], [3950, 0.35], [5230, 0.2]]) {
      const x = osc(o, 'sine', f, when, when + dur + 0.1), g = ac.createGain(); g.gain.value = a * 0.12 * vel; x.connect(g); g.connect(sum);
    }
    const g = ac.createGain();
    g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(1, when + 0.01);
    g.gain.setValueAtTime(1, when + dur); g.gain.linearRampToValueAtTime(0, when + dur + 0.04);
    sum.connect(g); g.connect(o.out);
  }
  function snoreIn(o, when, dur, vel = 0.3) {
    const ac = o.ac;
    const x = osc(o, 'sawtooth', 70, when, when + dur + 0.1);
    x.frequency.linearRampToValueAtTime(82, when + dur);
    const bp = filt(o, 'bandpass', 430, 1.3);
    const am = ac.createGain(); am.gain.value = 0.5;
    const l = osc(o, 'square', 27, when, when + dur + 0.1), lg = ac.createGain(); lg.gain.value = 0.45; l.connect(lg); lg.connect(am.gain);
    const g = ac.createGain();
    g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(vel * 0.5, when + dur * 0.85); g.gain.linearRampToValueAtTime(0, when + dur);
    x.connect(bp); bp.connect(am); am.connect(g); g.connect(o.out);
    noiseHit(o, when + dur * 0.3, dur * 0.6, 'bandpass', 900, 0.8, vel * 0.12, null, dur * 0.4);
  }
  function snoreOut(o, when, vel = 0.3) {
    slideW(o, when, 1450, 620, 0.62, vel * 0.9);
    noiseHit(o, when, 0.6, 'bandpass', 1100, 0.7, vel * 0.18, 500, 0.05);
  }
  function lidChatter(o, when, n = 4, vel = 0.25) { for (let i = 0; i < n; i++) metal(o, when + i * 0.055, [[1150, 1, 0.05], [2730, 0.5, 0.03]], vel * (0.6 + 0.4 * (i % 2))); }
  function blub(o, when, hi, vel = 0.25) {
    const x = osc(o, 'sine', hi ? 330 : 250, when, when + 0.14); x.frequency.exponentialRampToValueAtTime(hi ? 960 : 760, when + 0.07);
    const g = gainEnv(o, when, vel * 0.35, 0.004, 0.1); x.connect(g); g.connect(o.out);
  }
  function fwoomp(o, when, vel = 0.4) { noiseHit(o, when, 0.4, 'lowpass', 260, 0.9, vel * 0.7, 1800, 0.03); }
  function zip(o, when, f0, f1, dur, vel = 0.3) {
    const ac = o.ac;
    const x = osc(o, 'sawtooth', f0, when, when + dur + 0.05); x.frequency.exponentialRampToValueAtTime(f1, when + dur);
    const bp = filt(o, 'bandpass', f0 * 2, 2.5); bp.frequency.exponentialRampToValueAtTime(f1 * 2, when + dur);
    const am = ac.createGain(); am.gain.value = 0.5;
    const l = osc(o, 'square', 34, when, when + dur + 0.05), lg = ac.createGain(); lg.gain.value = 0.45; l.connect(lg); lg.connect(am.gain);
    const g = ac.createGain(); g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(vel * 0.3, when + 0.02);
    g.gain.setValueAtTime(vel * 0.3, when + dur - 0.03); g.gain.linearRampToValueAtTime(0, when + dur);
    x.connect(bp); bp.connect(am); am.connect(g); g.connect(o.out);
  }
  function thwup(o, when, vel = 0.5) {
    const x = osc(o, 'sine', 170, when, when + 0.25); x.frequency.exponentialRampToValueAtTime(52, when + 0.13);
    const g = gainEnv(o, when, vel * 0.6, 0.003, 0.2); x.connect(g); g.connect(o.out);
    noiseHit(o, when, 0.08, 'lowpass', 600, 0.7, vel * 0.25);
  }
  function clank(o, when, vel = 0.5) { metal(o, when, [[523, 1, 0.9], [1392, 0.7, 0.6], [2270, 0.5, 0.4], [3180, 0.3, 0.3]], vel); noiseHit(o, when, 0.02, 'highpass', 2500, 0.7, vel * 0.4); }
  function clonk(o, when, vel = 0.5) { metal(o, when, [[310, 1, 0.35], [832, 0.7, 0.25], [1468, 0.4, 0.18]], vel); thwup(o, when, vel * 0.4); }
  function pour(o, when, dur, vel = 0.35) {
    const ac = o.ac;
    const n = noiseSrc(o, when, dur), bp = filt(o, 'bandpass', 450, 7);
    bp.frequency.setValueAtTime(420, when); bp.frequency.exponentialRampToValueAtTime(1500, when + dur);
    const l = osc(o, 'sine', 9, when, when + dur), lg = ac.createGain(); lg.gain.value = 160; l.connect(lg); lg.connect(bp.frequency);
    const g = ac.createGain(); g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(vel * 0.9, when + 0.1);
    g.gain.setValueAtTime(vel * 0.9, when + dur - 0.15); g.gain.linearRampToValueAtTime(0, when + dur);
    n.connect(bp); bp.connect(g); g.connect(o.out);
  }
  function smack(o, when, vel = 0.4) {
    noiseHit(o, when, 0.012, 'bandpass', 1600, 1.2, vel * 0.6);
    const x = osc(o, 'sine', 1150, when, when + 0.08); x.frequency.exponentialRampToValueAtTime(320, when + 0.05);
    const g = gainEnv(o, when, vel * 0.3, 0.001, 0.05); x.connect(g); g.connect(o.out);
  }
  function tweet(o, when, vel = 0.35) {
    for (const f of [2150, 2290]) {
      const x = osc(o, 'sine', f * 0.82, when, when + 0.5); x.frequency.exponentialRampToValueAtTime(f, when + 0.08);
      const g = o.ac.createGain(); g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(vel * 0.12, when + 0.03);
      g.gain.setValueAtTime(vel * 0.12, when + 0.36); g.gain.linearRampToValueAtTime(0, when + 0.45);
      x.connect(g); g.connect(o.out);
    }
    noiseHit(o, when, 0.42, 'bandpass', 2200, 5, vel * 0.4, null, 0.03);
  }
  function whoosh(o, when, dur = 0.3, vel = 0.3) {
    const n = noiseSrc(o, when, dur), b = filt(o, 'bandpass', 500, 1.4);
    b.frequency.setValueAtTime(500, when); b.frequency.exponentialRampToValueAtTime(2300, when + dur * 0.5); b.frequency.exponentialRampToValueAtTime(600, when + dur);
    const g = o.ac.createGain(); g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(vel * 0.5, when + dur * 0.5); g.gain.linearRampToValueAtTime(0, when + dur);
    n.connect(b); b.connect(g); g.connect(o.out);
  }
  function squeak(o, when, vel = 0.25) {
    const ac = o.ac;
    const x = osc(o, 'sine', 1700, when, when + 0.15);
    const l = osc(o, 'sine', 45, when, when + 0.15), lg = ac.createGain(); lg.gain.value = 360; l.connect(lg); lg.connect(x.frequency);
    const g = gainEnv(o, when, vel * 0.18, 0.01, 0.11); x.connect(g); g.connect(o.out);
  }
  function brrr(o, when, dur = 0.35, vel = 0.3) {
    const ac = o.ac;
    const x = osc(o, 'sawtooth', 92, when, when + dur + 0.05), lp = filt(o, 'lowpass', 900, 1);
    const am = ac.createGain(); am.gain.value = 0.5;
    const l = osc(o, 'square', 29, when, when + dur + 0.05), lg = ac.createGain(); lg.gain.value = 0.5; l.connect(lg); lg.connect(am.gain);
    const g = gainEnv(o, when, vel * 0.35, 0.02, dur);
    x.connect(lp); lp.connect(am); am.connect(g); g.connect(o.out);
  }
  function ratchet(o, when, dur, vel = 0.25) { for (let t = 0; t < dur; t += 0.04) tap(o, when + t, vel * (0.6 + 0.4 * Math.sin(t * 20))); }
  function gulp(o, when, vel = 0.35) {
    const x = osc(o, 'sine', 520, when, when + 0.16); x.frequency.exponentialRampToValueAtTime(150, when + 0.1);
    const g = gainEnv(o, when, vel * 0.4, 0.004, 0.12); x.connect(g); g.connect(o.out);
    blub(o, when + 0.1, 0, vel * 0.6);
  }
  function honk(o, when, vel = 0.5) { tuba(o, when, 50, 0.22, vel, 43); boing(o, when + 0.04, 260, vel * 0.7); }
  function chirps(o, when, vel = 0.2) { for (let i = 0; i < 3; i++) slideW(o, when + i * 0.2, 2600, 3500, 0.08, vel); }
  function gasp(o, when, vel = 0.3) { noiseHit(o, when, 0.28, 'bandpass', 700, 1.2, vel * 0.5, 2600, 0.08); }
  function sigh(o, when, vel = 0.35) { tuba(o, when, 55, 0.7, vel, 47); noiseHit(o, when, 0.7, 'bandpass', 800, 0.8, vel * 0.18, 380, 0.1); }

  /* ---------- гармония и мелодия ---------- */
  const CH = {
    C: { b: [48, 43], c: [60, 64, 67] }, C7: { b: [48, 43], c: [58, 64, 67] }, E7: { b: [40, 47], c: [62, 64, 68] },
    A7: { b: [45, 40], c: [61, 64, 67] }, D7: { b: [50, 45], c: [60, 62, 66] }, G7: { b: [43, 50], c: [59, 65, 67] },
    F: { b: [41, 48], c: [60, 65, 69] }, Fd: { b: [42, 48], c: [60, 63, 69] }, CG: { b: [43, 48], c: [60, 64, 67] },
    Am: { b: [45, 40], c: [60, 64, 69] }, Dm: { b: [50, 45], c: [62, 65, 69] }, Fm: { b: [41, 48], c: [60, 65, 68] },
    Bb: { b: [46, 41], c: [62, 65, 70] }, G: { b: [43, 50], c: [59, 62, 67] },
  };
  // Мелодия главной темы (16 тактов 2/4): [позиция в шестнадцатых, длина, нота]
  const A_CH = ['C', 'C', 'E7', 'E7', 'A7', 'A7', 'D7', 'G7', 'C', 'C7', 'F', 'Fd', 'CG', 'A7', ['D7', 'G7'], 'C'];
  const A_MEL = [
    [[0, 1, 76], [1, 2, 79], [3, 1, 84], [4, 2, 88], [6, 1, 86], [7, 1, 84]],
    [[0, 1, 81], [1, 2, 79], [3, 1, 76], [4, 4, 79]],
    [[0, 1, 80], [1, 2, 83], [3, 1, 86], [4, 2, 88], [6, 1, 86], [7, 1, 83]],
    [[0, 1, 86], [1, 2, 83], [3, 1, 80], [4, 4, 76]],
    [[0, 1, 76], [1, 2, 81], [3, 1, 85], [4, 2, 88], [6, 1, 86], [7, 1, 85]],
    [[0, 1, 86], [1, 2, 85], [3, 1, 81], [4, 4, 79]],
    [[0, 1, 78], [1, 2, 81], [3, 1, 84], [4, 2, 86], [6, 1, 84], [7, 1, 81]],
    [[0, 2, 83], [2, 1, 79], [3, 2, 77], [5, 1, 74], [6, 2, 79]],
    [[0, 1, 76], [1, 2, 79], [3, 1, 84], [4, 2, 88], [6, 1, 86], [7, 1, 84]],
    [[0, 1, 82], [1, 2, 81], [3, 1, 79], [4, 2, 76], [6, 1, 79], [7, 1, 82]],
    [[0, 1, 81], [1, 2, 84], [3, 1, 89], [4, 2, 93], [6, 1, 91], [7, 1, 89]],
    [[0, 1, 87], [1, 2, 84], [3, 1, 81], [4, 2, 78], [6, 1, 81], [7, 1, 84]],
    [[0, 2, 88], [2, 1, 86], [3, 2, 84], [5, 1, 79], [6, 2, 76]],
    [[0, 1, 85], [1, 2, 88], [3, 1, 91], [4, 2, 88], [6, 1, 85], [7, 1, 81]],
    [[0, 1, 78], [1, 1, 81], [2, 2, 84], [4, 1, 83], [5, 1, 86], [6, 2, 89]],
    [[0, 3, 88], [3, 1, 84], [4, 1, 79], [5, 1, 76], [6, 1, 74], [7, 1, 75]],
  ];
  const END16 = [[0, 4, 84]];

  /** Такт регтайма: страйд левой руки + туба «умпа» + (по желанию) барабаны и мелодия. */
  function rag(t, bar, o = {}) {
    const ch = A_CH[bar];
    const halves = Array.isArray(ch) ? ch : [ch, ch];
    const vel = o.vel ?? 1;
    for (let h = 0; h < 2; h++) {
      const c = CH[halves[h]], tb = t + h * 0.5;
      const bass = Array.isArray(ch) ? c.b[0] : c.b[h];
      if (!o.stop || h === 0) {
        if (o.tuba !== false) at(tb, (x, w) => tuba(x, w, bass, 0.26, 0.55 * vel));
        at(tb, (x, w) => piano(x, w, bass - 12, 0.3 * vel, 0.25));
        if (!o.stop) at(tb + 0.25, (x, w) => chord(x, w, c.c, 0.24 * vel, 0.18));
        else at(tb, (x, w) => chord(x, w, c.c.concat([c.c[0] + 12]), 0.4 * vel, 0.14));
      }
      if (o.drums) {
        if (!o.stop) {
          at(tb, (x, w) => kick(x, w, 0.35 * vel));
          at(tb + 0.25, (x, w) => (o.drums === 'brush' ? brush(x, w, 0.5 * vel) : snare(x, w, 0.28 * vel)));
        } else if (h === 0) { at(tb, (x, w) => { kick(x, w, 0.5); cymbal(x, w, 0.25, 0.18); }); }
      }
    }
    if (o.melody !== false) {
      const mel = o.end && bar === 15 ? END16 : A_MEL[bar];
      for (const [p, l, m] of mel) at(t + p * S16, (x, w) => piano(x, w, m + (o.oct || 0), (o.mv ?? 0.55) * vel, l * S16 * 0.9, 1.1));
    }
    if (o.stop) for (const p of [3, 5, 6, 7]) at(t + p * S16, (x, w) => tap(x, w, 0.45));
  }

  /* ---------- партитура по сценам ---------- */
  function build() {
    // титры: удар тарелки, глиссандо, тема в полный голос, каданс
    at(0.5, (x, w) => swell(x, w, 0.5, 0.35));
    for (let i = 0; i < 15; i++) { const m = [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83, 84][i]; at(0.6 + i * 0.027, (x, w) => piano(x, w, m, 0.35, 0.1)); }
    at(1.0, (x, w) => { cymbal(x, w, 0.4); chord(x, w, [60, 64, 67, 72], 0.4, 0.3); });
    for (let b = 0; b < 4; b++) rag(1 + b, b, { drums: 'snare', mv: 0.6 });
    at(5.0, (x, w) => { chord(x, w, [60, 65, 69], 0.3, 0.4); tuba(x, w, 41, 0.4, 0.55); piano(x, w, 81, 0.55, 0.22); });
    at(5.25, (x, w) => piano(x, w, 84, 0.55, 0.22));
    at(5.5, (x, w) => { chord(x, w, [59, 65, 67], 0.3, 0.4); tuba(x, w, 43, 0.4, 0.55); piano(x, w, 83, 0.55, 0.22); snare(x, w, 0.3); });
    at(5.75, (x, w) => { piano(x, w, 86, 0.55, 0.22); snare(x, w, 0.35); });
    at(6.0, (x, w) => { cymbal(x, w, 0.45, 1.6); chord(x, w, [60, 64, 67, 72, 76], 0.5, 0.8); tuba(x, w, 36, 0.8, 0.6); kick(x, w, 0.5); });
    at(3.42, (x, w) => boing(x, w, 150, 0.35));
    at(4.32, (x, w) => ding(x, w, 100, 0.35, 0.6));

    // кухня спит: ходики, колыбельная на музыкальной шкатулке, храп
    for (let t = 7.0; t < 21.0; t += 0.5) { const k = Math.round(t * 2); at(t, (x, w) => tick(x, w, k % 2 === 0, t >= 20 ? 0.34 : 0.2)); }
    const LUL = [[8, 88, 0.5], [8.5, 91, 0.5], [9, 93, 1], [10, 89, 0.5], [10.5, 93, 0.5], [11, 91, 1], [12, 88, 0.5], [12.5, 91, 0.5], [13, 96, 1],
      [14, 95, 0.5], [14.5, 93, 0.25], [14.75, 91, 0.25], [15, 91, 1], [16, 93, 0.5], [16.5, 89, 0.5], [17, 92, 0.5], [17.5, 89, 0.5], [18, 88, 0.5], [18.5, 86, 0.25], [18.75, 84, 0.25], [19, 86, 1]];
    for (const [t, m] of LUL) at(t, (x, w) => musicBox(x, w, m, 0.42));
    const LCH = ['C', 'F', 'Dm', 'G', 'C', 'Am', 'G7', 'C', 'F', 'Fm', 'C', 'G7'];
    LCH.forEach((c, i) => at(8 + i, (x, w) => chord(x, w, CH[c].c, 0.11, 0.9)));
    for (let t = 7.0; t < 20.5; t += 2) {
      const near = clamp((t - 11) / 7) * 0.6 + 0.4;
      at(t + 0.05, (x, w) => snoreIn(x, w, 0.9, 0.3 * near));
      at(t + 0.78, (x, w) => lidChatter(x, w, 4, 0.2 * near));
      at(t + 1.0, (x, w) => snoreOut(x, w, 0.3 * near));
    }
    at(20.0, (x, w) => wood(x, w, 900, 0.25)); at(20.5, (x, w) => wood(x, w, 900, 0.25));

    // будильник и пробуждение
    at(21.0, (x, w) => ring(x, w, 3.36, 0.55));
    at(21.72, (x, w) => { honk(x, w, 0.5); slideW(x, w, 500, 2000, 0.18, 0.3); cymbal(x, w, 0.2, 0.6); });
    at(21.78, (x, w) => whoosh(x, w, 0.5, 0.3));
    at(22.5, (x, w) => clonk(x, w, 0.55));
    at(22.58, (x, w) => chirps(x, w, 0.22));
    at(22.88, (x, w) => brrr(x, w, 0.4, 0.3));
    at(23.45, (x, w) => zip(x, w, 160, 1300, 0.85, 0.3));
    at(24.36, (x, w) => { clank(x, w, 0.6); thwup(x, w, 0.3); });
    at(24.42, (x, w) => zip(x, w, 1200, 180, 0.3, 0.25));
    at(24.8, (x, w) => boing(x, w, 240, 0.25));
    at(25.02, (x, w) => clap(x, w, 0.2)); at(25.2, (x, w) => clap(x, w, 0.2));
    at(25.4, (x, w) => tuba(x, w, 55, 1.05, 0.5, 46));
    at(25.9, (x, w) => squeak(x, w, 0.18));
    for (const t of [27.08, 27.41, 27.74]) at(t, (x, w) => squeak(x, w, 0.14));
    at(28.12, (x, w) => ding(x, w, 96, 0.3, 0.7));
    at(28.32, (x, w) => ding(x, w, 103, 0.22, 0.3));
    // лёгкий «вамп» под кофе: туба на доли, аккорды на слабые
    const VAMP = [[29, 'G7'], [30, 'C'], [31, 'C'], [32, 'G7']];
    for (const [t, c] of VAMP) for (let h = 0; h < 2; h++) {
      at(t + h * 0.5, (x, w) => tuba(x, w, CH[c].b[h], 0.24, 0.4));
      at(t + h * 0.5 + 0.25, (x, w) => chord(x, w, CH[c].c, 0.15, 0.15));
    }

    // кофе: ручка, огонь, «горячо!», перколятор, свист
    at(30.36, (x, w) => tick(x, w, true, 0.3));
    at(30.47, (x, w) => fwoomp(x, w, 0.5));
    at(31.0, (x, w) => { slideW(x, w, 700, 2200, 0.2, 0.3); boing(x, w, 220, 0.35); });
    at(31.55, (x, w) => thwup(x, w, 0.25));
    at(31.7, (x, w) => sigh(x, w, 0.25));
    for (let t = 31.5; t < 43.26; t += 0.5) { const k = Math.round(t * 2); at(t, (x, w) => blub(x, w, k % 2 === 0, 0.22)); }
    for (let b = 0; b < 6; b++) {
      rag(33 + b, b, { melody: false, vel: 0.55 });
      const notes = A_MEL[b].map(([p, l, m]) => [p * S16, m + 12, l * S16 * 0.92]);
      at(33 + b, (x, w) => whistleBar(x, w, notes, 0.34));
      for (const [p] of A_MEL[b]) WHISTLE.push(33 + b + p * S16);
    }
    at(34.0, (x, w) => { for (let i = 0; i < 6; i++) piano(x, w + i * 0.07, [96, 100, 103, 105, 108, 112][i] - 12, 0.12, 0.2); });
    for (const [t, c] of [[39, 'D7'], [40, 'G7'], [41, 'C'], [42, 'C'], [43, 'G7'], [44, 'G7']]) for (let h = 0; h < 2; h++) {
      at(t + h * 0.5, (x, w) => tuba(x, w, CH[c].b[h], 0.24, 0.38));
      at(t + h * 0.5 + 0.25, (x, w) => chord(x, w, CH[c].c, 0.13, 0.15));
    }
    [[39.0, 86], [39.5, 90], [40.0, 95], [40.5, 98]].forEach(([t, m]) => at(t, (x, w) => ding(x, w, m, 0.45)));
    at(40.55, (x, w) => chord(x, w, [67, 71, 74, 77], 0.12, 0.8));
    at(41.02, (x, w) => ding(x, w, 100, 0.22, 0.8));
    [41.5, 41.75, 42.0, 42.25].forEach((t, i) => at(t, (x, w) => boing(x, w, [150, 175, 200, 225][i], 0.32)));
    [42.35, 42.6, 42.85, 43.1].forEach((t, i) => at(t, (x, w) => boing(x, w, [160, 190, 215, 250][i], 0.32)));
    at(42.3, (x, w) => gulp(x, w, 0.22));
    at(42.72, (x, w) => { piano(x, w, 88, 0.2, 0.3); piano(x, w + 0.18, 84, 0.18, 0.4); });
    at(43.05, (x, w) => slideW(x, w, 300, 900, 0.25, 0.2));
    at(43.3, (x, w) => boing(x, w, 110, 0.5));
    at(44.25, (x, w) => { thwup(x, w, 0.45); cymbal(x, w, 0.2, 0.2); });
    for (let i = 0; i < 15; i++) { const m = [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83, 84][i]; at(44.4 + i * 0.07, (x, w) => piano(x, w, m, 0.3, 0.1)); }
    at(45.5, (x, w) => { chord(x, w, [60, 64, 67, 72, 76], 0.5, 0.3); tuba(x, w, 48, 0.25, 0.6); cymbal(x, w, 0.35, 1); });
    for (let i = 0; i < 4; i++) at(45.625 + i * S16 * 0.75, (x, w) => snare(x, w, 0.2 + i * 0.06));

    // пляс: главная тема целиком; последние четыре такта — брейк «стоп-тайм»
    for (let b = 0; b < 16; b++) rag(46 + b, b, { drums: b % 8 < 7 ? 'snare' : 'brush', stop: b >= 12 });
    at(46.0, (x, w) => cymbal(x, w, 0.3)); at(54.0, (x, w) => cymbal(x, w, 0.25));
    at(54.45, (x, w) => slideW(x, w, 400, 1800, 0.5, 0.25));
    at(54.6, (x, w) => whoosh(x, w, 0.45, 0.25)); at(55.1, (x, w) => whoosh(x, w, 0.45, 0.25));
    at(56.0, (x, w) => { clonk(x, w, 0.45); ding(x, w, 96, 0.25, 0.5); });
    at(56.5, (x, w) => ratchet(x, w, 0.5, 0.25));
    at(57.0, (x, w) => zip(x, w, 900, 250, 0.45, 0.2));
    at(57.5, (x, w) => boing(x, w, 200, 0.3));
    // Кроха одна наверху: та же тема, но глухо, издалека
    at(62.0, (x, w) => x.muffleTo && x.muffleTo(w, 650));
    for (let b = 0; b < 8; b++) rag(62 + b, b, { drums: 'brush', vel: 0.8 });
    for (let t = 63.0; t < 64.3; t += 0.25) at(t, (x, w) => wood(x, w, 2100, 0.08));
    at(64.55, (x, w) => tap(x, w, 0.2));
    at(67.0, (x, w) => gulp(x, w, 0.3));
    at(68.6, (x, w) => thwup(x, w, 0.12));
    at(69.3, (x, w) => slideW(x, w, 900, 600, 0.6, 0.12));

    // музыка стихла: Жорж видит Кроху
    at(70.0, (x, w) => { x.muffleTo && x.muffleTo(w, 18000); tuba(x, w, 43, 0.5, 0.5, 31); });
    const KT = [[70.5, 72, 0.25], [70.75, 77, 0.25], [71.0, 81, 0.5], [71.5, 79, 0.25], [71.75, 77, 0.25], [72.0, 76, 0.5], [73.0, 77, 0.5], [73.5, 86, 0.5], [74.0, 84, 1.0]];
    for (const [t, m, d] of KT) at(t, (x, w) => piano(x, w, m, 0.4, d, 0.8));
    for (const [t, c] of [[71, 'F'], [72, 'Am'], [73, 'Bb']]) at(t, (x, w) => { for (let i = 0; i < 3; i++) piano(x, w + i * 0.12, CH[c].c[i], 0.16, 0.8); tuba(x, w, CH[c].b[0], 0.8, 0.25); });
    at(72.5, (x, w) => ding(x, w, 88, 0.25, 0.4)); at(72.75, (x, w) => ding(x, w, 93, 0.25, 0.5));
    at(73.55, (x, w) => boing(x, w, 300, 0.15));
    // решимость: дробь малого барабана, тремоло, дрожащие коленки
    for (let t = 74.0, i = 0; t < 78.0; t += 0.0625, i++) { const v = 0.04 + 0.34 * ((t - 74) / 4) ** 1.6; at(t, (x, w) => snare(x, w, v)); }
    const TREM = [[74, [58, 64]], [75, [69, 72]], [76, [66, 72]], [77, [71, 77]]];
    for (const [t0, [a, b]] of TREM) for (let i = 0; i < 8; i++) { const v = 0.1 + 0.25 * ((t0 - 74) / 4 + i / 32); at(t0 + i * S16, (x, w) => piano(x, w, i % 2 ? b : a, v, 0.12)); }
    at(74.5, (x, w) => tuba(x, w, 36, 1.0, 0.3));
    at(75.0, (x, w) => gulp(x, w, 0.25));
    at(75.5, (x, w) => brrr(x, w, 0.35, 0.2));
    at(75.95, (x, w) => squeak(x, w, 0.15)); at(76.28, (x, w) => squeak(x, w, 0.15));
    // прыжок, зависание, падение, рука-шланг, поймал
    at(78.0, (x, w) => { cymbal(x, w, 0.4, 1.2); slideW(x, w, 500, 1900, 0.5, 0.3); boing(x, w, 300, 0.25); });
    at(79.0, (x, w) => tuba(x, w, 43, 0.14, 0.35)); at(79.18, (x, w) => tuba(x, w, 40, 0.2, 0.35));
    at(79.35, (x, w) => slideW(x, w, 1700, 260, 1.2, 0.34));
    at(79.45, (x, w) => gasp(x, w, 0.35));
    at(79.6, (x, w) => honk(x, w, 0.45));
    at(79.92, (x, w) => zip(x, w, 140, 1800, 0.6, 0.35));
    at(80.55, (x, w) => thwup(x, w, 0.6));
    for (const t of [81.0, 81.5, 82.0, 82.5]) at(t, (x, w) => tick(x, w, Math.round(t * 2) % 2 === 0, 0.17));
    at(82.1, (x, w) => ding(x, w, 93, 0.3, 0.6)); at(82.5, (x, w) => ding(x, w, 100, 0.3, 0.7));
    at(83.0, (x, w) => sigh(x, w, 0.35));
    [60, 64, 67, 71, 74, 76, 79, 83, 86, 88].forEach((m, i) => at(83.45 + i * 0.2, (x, w) => piano(x, w, m, 0.24, 0.9, 0.8)));
    at(83.45, (x, w) => tuba(x, w, 48, 2.0, 0.22));
    at(85.45, (x, w) => ding(x, w, 96, 0.25, 0.5));

    // первая чашка: нежная тема, струя кофе, сердечко из пара
    const TND = [[86, 76, 0.5], [86.5, 79, 0.5], [87, 81, 1], [88, 77, 0.5], [88.5, 81, 0.5], [89, 79, 1], [90, 76, 0.5], [90.5, 79, 0.5], [91, 84, 1]];
    for (const [t, m, d] of TND) at(t, (x, w) => piano(x, w, m, 0.4, d, 0.8));
    for (const [t, c] of [[86, 'C'], [87, 'F'], [88, 'Dm'], [89, 'G'], [90, 'C'], [91, 'F']]) at(t, (x, w) => { for (let i = 0; i < 3; i++) piano(x, w + i * 0.1, CH[c].c[i] - 12, 0.16, 0.8); tuba(x, w, CH[c].b[0], 0.9, 0.22); });
    at(86.45, (x, w) => ding(x, w, 96, 0.22, 0.5));
    at(87.45, (x, w) => pour(x, w, 2.15, 0.35));
    at(89.95, (x, w) => { for (let i = 0; i < 5; i++) ding(x, w + i * 0.06, [84, 88, 91, 96, 100][i], 0.22, 0.6); });
    at(91.15, (x, w) => ding(x, w, 91, 0.18, 0.4));
    at(92.0, (x, w) => clap(x, w, 0.5)); at(92.5, (x, w) => clap(x, w, 0.5));
    at(92.9, (x, w) => { chord(x, w, [60, 64, 67, 72], 0.45, 0.2); cymbal(x, w, 0.25, 0.6); tuba(x, w, 48, 0.2, 0.55); });
    [43, 45, 47].forEach((m, i) => at(93.25 + i * 0.25, (x, w) => tuba(x, w, m, 0.2, 0.5)));
    for (let i = 0; i < 8; i++) at(93.0 + i * S16, (x, w) => snare(x, w, 0.12 + i * 0.03));

    // финал: тема целиком, кружение, «та-да!»
    for (let b = 0; b < 8; b++) rag(94 + b, b, { drums: 'snare' });
    for (let b = 12; b < 16; b++) rag(102 + (b - 12), b, { drums: 'snare', end: true });
    at(94.0, (x, w) => cymbal(x, w, 0.35));
    for (const t of [99.0, 99.5, 100.0, 100.5]) at(t, (x, w) => whoosh(x, w, 0.45, 0.22));
    at(104.0, (x, w) => slideW(x, w, 500, 1500, 0.8, 0.2));
    at(105.0, (x, w) => { cymbal(x, w, 0.5, 1.6); chord(x, w, [60, 64, 67, 72, 76, 79], 0.5, 1.0); tuba(x, w, 36, 1.0, 0.6); kick(x, w, 0.6); });
    // диафрагма: «Бритьё-стрижка — два бита» и поцелуй
    for (let t = 106.0; t < 109.0; t += 0.5) { at(t, (x, w) => tuba(x, w, t % 1 === 0 ? 48 : 43, 0.22, 0.25)); at(t + 0.25, (x, w) => chord(x, w, [64, 67, 69], 0.1, 0.15)); }
    [[106.5, 84, 0.45], [107.0, 79, 0.2], [107.25, 79, 0.2], [107.5, 81, 0.45], [108.0, 79, 0.45], [109.0, 83, 0.4], [109.5, 84, 0.6]]
      .forEach(([t, m, d]) => at(t, (x, w) => { piano(x, w, m, 0.55, d); piano(x, w, m - 12, 0.3, d); }));
    at(109.0, (x, w) => smack(x, w, 0.5));
    at(109.45, (x, w) => { tweet(x, w, 0.45); chord(x, w, [60, 64, 67], 0.35, 0.4); tuba(x, w, 36, 0.4, 0.5); });
    // «Конец»
    for (let i = 0; i < 18; i++) { const m = [48, 52, 55, 60, 64, 67, 72, 76, 79, 84, 88, 91, 96][i % 13] + (i >= 13 ? 0 : 0); if (i < 13) at(110.0 + i * 0.055, (x, w) => piano(x, w, m, 0.32, 0.4)); }
    at(110.0, (x, w) => { cymbal(x, w, 0.35, 2.2); tuba(x, w, 36, 1.4, 0.5); });
    at(110.8, (x, w) => { chord(x, w, [48, 55, 64, 72, 76, 79, 84], 0.42, 3.4); tuba(x, w, 36, 3.0, 0.4); });
    EV.sort((a, b) => a.t - b.t);
  }
  build();

  /* ---------- проигрывание ---------- */
  let ac = null, R = null, CH_ = null, sess = null, cursor = 0, startCtx = 0, startFilm = 0, muted = false, running = false;
  let sent = 0;                       // сколько событий партитуры уже отдано в расписание аудиоконтекста
  const VOL = 0.8;
  function lowerBound(t) { let lo = 0, hi = EV.length; while (lo < hi) { const m = (lo + hi) >> 1; if (EV[m].t < t) lo = m + 1; else hi = m; } return lo; }
  function muffleAt(t) { return t >= 62 && t < 70 ? 650 : 18000; }

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return true; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try { ac = new AC(); } catch (e) { return false; }
    R = resources(ac);
    CH_ = chain(ac, ac.destination);
    CH_.out.gain.value = muted ? 0 : VOL;
    return true;
  }
  function makeSession(ctxA, chainA, res, filmT, ctxT) {
    const g = ctxA.createGain(); g.connect(chainA.bus);
    const o = {
      ac: ctxA, out: g, R: res,
      muffleTo: (w, f) => { const p = chainA.muffle.frequency; p.cancelScheduledValues(w); p.setValueAtTime(p.value, w); p.exponentialRampToValueAtTime(nyq(ctxA, f), w + 0.35); },
    };
    // шорох и треск оптической фонограммы — пока идёт фильм
    const cr = ctxA.createBufferSource(); cr.buffer = res.crackle; cr.loop = true;
    const cg = ctxA.createGain(); cg.gain.value = 0.35; const cf = ctxA.createBiquadFilter(); cf.type = 'highpass'; cf.frequency.value = 900;
    cr.connect(cf); cf.connect(cg); cg.connect(g); cr.start(ctxT);
    chainA.muffle.frequency.setValueAtTime(nyq(ctxA, muffleAt(filmT)), ctxT);
    return { o, g, cr };
  }
  function start(t) {
    if (!init()) return;
    stop();
    if (ac.state === 'suspended') ac.resume();
    startFilm = t; startCtx = ac.currentTime + 0.06;
    sess = makeSession(ac, CH_, R, t, startCtx);
    cursor = lowerBound(t - 0.001);
    running = true;
    pump();
  }
  function stop() {
    running = false;
    if (!sess || !ac) return;
    const s = sess; sess = null;
    const n = ac.currentTime;
    s.g.gain.cancelScheduledValues(n); s.g.gain.setValueAtTime(s.g.gain.value, n); s.g.gain.linearRampToValueAtTime(0, n + 0.06);
    try { s.cr.stop(n + 0.1); } catch (e) { /* уже остановлен */ }
    setTimeout(() => { try { s.g.disconnect(); } catch (e) { /* уже отключён */ } }, 300);
  }
  /** Путь от планировщика до динамика (в Bluetooth-наушниках — до 0,2 с): картинка ждёт звук. */
  function latency() { return ac ? Math.min(0.3, (ac.outputLatency || 0) + (ac.baseLatency || 0)) : 0; }
  /** Какой момент фильма сейчас слышен в динамике. */
  function heard() { return ac ? startFilm + ac.currentTime - latency() - startCtx : startFilm; }
  /** Насколько звук ушёл вперёд картинки, с (меньше нуля — отстал). */
  function drift(filmT) { return heard() - filmT; }
  /** Сколько картинке подождать после старта, чтобы первая нота совпала с кадром. */
  function lead() { return 0.06 + latency(); }
  /** Планирует события на 0,3 с вперёд от того места, до которого дошёл планировщик. */
  function pump(filmT) {
    if (!running || !sess) return;
    const horizon = Math.max(filmT == null ? -1 : filmT, heard()) + latency() + 0.3;
    while (cursor < EV.length && EV[cursor].t < horizon) {
      const e = EV[cursor++];
      const w = startCtx + (e.t - startFilm);
      if (w < ac.currentTime - 0.05) continue;
      e.fn(sess.o, Math.max(w, ac.currentTime + 0.005));
      sent++;
    }
  }
  function setMuted(m) {
    muted = m;
    if (!ac) return;
    const g = CH_.out.gain, n = ac.currentTime;
    g.cancelScheduledValues(n); g.setValueAtTime(g.value, n); g.linearRampToValueAtTime(m ? 0 : VOL, n + 0.08);
  }

  /** Проверка громкости без колонок: офлайн-рендер отрезка и пики/RMS по секундам. */
  async function analyze(t0, t1) {
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const sr = 22050, oac = new OAC(1, Math.ceil((t1 - t0 + 0.5) * sr), sr);
    const res = resources(oac), ch = chain(oac, oac.destination);
    const s = makeSession(oac, ch, res, t0, 0);
    for (const e of EV) if (e.t >= t0 && e.t < t1) e.fn(s.o, e.t - t0);
    const buf = await oac.startRendering();
    const d = buf.getChannelData(0), out = [];
    for (let k = 0; k < t1 - t0; k++) {
      let pk = 0, sum = 0; const a = k * sr, b = Math.min(d.length, a + sr);
      for (let i = a; i < b; i++) { const v = Math.abs(d[i]); if (v > pk) pk = v; sum += d[i] * d[i]; }
      out.push(`${(t0 + k).toFixed(0)}:${pk.toFixed(2)}/${Math.sqrt(sum / (b - a)).toFixed(3)}`);
    }
    return out.join(' ');
  }

  /** Состояние звука для проверки: контекст, его часы, сколько событий уже в расписании. */
  function info() {
    return { ctx: ac ? ac.state : 'нет', rate: ac ? ac.sampleRate : 0, time: ac ? +ac.currentTime.toFixed(2) : 0, sent, total: EV.length, muted };
  }
  return { init, start, stop, pump, setMuted, drift, lead, analyze, info, running: () => running, events: EV.length };
})();
