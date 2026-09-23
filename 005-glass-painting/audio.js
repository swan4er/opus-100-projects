'use strict';
/* ==========================================================================
   audio.js — музыка и шумы на Web Audio, синхронно с фильмом.
   Партитура записана во времени фильма (секунды). Планировщик ставит ноты
   на ~0,25 с вперёд от текущего t, поэтому перемотка и пауза точны.
   Тема — колыбельная в 3/4: ре минор зимой, фа мажор весной (флейта),
   ре мажор летом (струнные и арфа), си минор осенью (виолончель),
   ре мажор на рассвете (скрипка). Шаги, копыта, птицы и капля стоят
   точно на кадрах анимации.
   ========================================================================== */

const Sound = (() => {
  let ctx = null, master, music, sfx, revIn;
  let noiseBuf = null, pinkBuf = null;
  let on = false, muted = false, running = false;
  const voices = [];
  let EV = [], evIdx = 0, layers = null;
  const VOLUME = 0.62;

  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function nm(s) {
    const m = /^([A-G])([#b]?)(-?\d)$/.exec(s);
    return NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (parseInt(m[3], 10) + 1) * 12;
  }

  /* ---------------- партитура ---------------- */
  function buildScore() {
    const E = [];
    const ev = (t, k, m, d, v, o) => E.push({ t, k, m, d, v, o: o || {} });
    // мелодия строкой: «D5 1, A4 1, F4 1 | …», длительности в долях
    function mel(t0, beat, str, k, v, o) {
      let t = t0;
      for (const tok of str.replace(/\|/g, ',').split(',')) {
        const p = tok.trim().split(/\s+/); if (!p[0]) continue;
        const d = parseFloat(p[1]) * beat;
        if (p[0] !== 'r') ev(t, k, nm(p[0]), d, v, o);
        t += d;
      }
      return t;
    }
    const chord = (t, notes, d, k, v, o) => notes.forEach((m) => ev(t, k, m, d, v, o));
    const arp = (t, notes, step, k, v, o) => notes.forEach((m, i) => ev(t + i * step, k, m, 0, v, o));
    const Dm = [50, 57, 62, 65], Gm = [43, 55, 58, 62], A = [45, 57, 61, 64], F = [41, 53, 57, 60], A7 = [45, 55, 61, 64];
    const D = [50, 57, 62, 66], G = [43, 55, 59, 62], Bm = [47, 54, 59, 62], Em = [40, 52, 55, 59], Fs = [42, 54, 58, 61], Fsm = [42, 54, 57, 61];

    // ===== ЗИМА: 60 ударов, доля = 1 с =====
    ev(0, 'drone', 38, 27, 0.5);
    ev(3, 'drone', 45, 21, 0.3);
    [Dm, Gm, Dm, A, F, Gm, A7].forEach((c, i) => chord(3 + i * 3, c, 3.1, 'pad', 0.5));
    chord(24, [50, 57, 62, 65, 69], 3.6, 'pad', 0.45, { rel: 3 });
    mel(3, 1, 'D5 1, A4 1, F4 1 | G4 1.5, A4 .5, Bb4 1 | A4 2, G4 .5, F4 .5 | E4 3 | C5 1, Bb4 1, A4 1 | Bb4 1.5, C5 .5, D5 1 | E5 1.5, D5 .5, C#5 1 | D5 3.4', 'violin', 0.55);
    [[0.8, 86], [2.3, 81], [4.1, 84], [5.7, 89], [7.9, 77], [9.4, 86], [11.2, 81], [13.8, 88], [16.3, 84], [18.9, 79]].forEach(([t, m]) => ev(t, 'celesta', m, 0, 0.22));
    [[22.6, 93], [23.1, 89], [23.6, 86], [24.2, 81], [24.8, 77]].forEach(([t, m]) => ev(t, 'celesta', m, 0, 0.32));
    [7.2, 7.55, 9.9, 12.05].forEach((t) => ev(t, 'bullfinch', 0, 0, 0.6));
    ev(12.45, 'flutter', 0, 0.5, 0.5);
    ev(12.55, 'whump', 0, 0, 0.7);
    ev(13.65, 'flutter', 0, 0.3, 0.35);
    ev(15.9, 'crunch', 0, 0, 0.9); ev(16.8, 'crunch', 0, 0, 1.0);
    ev(20.0, 'whoosh', 0, 1.8, 0.4);
    ev(24.4, 'whoosh', 0, 2.6, 0.5);
    arp(24.7, [62, 65, 69, 72, 74, 77, 81, 84, 86, 89], 0.16, 'harp', 0.45);

    // ===== ВЕСНА: 72 удара, доля = 0,833 с, такт 2,5 с =====
    const sb = 60 / 72;
    chord(27, [53, 57, 60, 65], 2.6, 'pad', 0.45, { att: 1.6 });
    arp(27.2, [53, 57, 60, 65, 69, 72], 0.28, 'harp', 0.4);
    mel(29.5, sb, 'F5 1, C5 1, A4 1 | Bb4 1.5, C5 .5, D5 1 | C5 2, Bb4 .5, A4 .5 | G4 3 | E5 1, D5 1, C5 1 | D5 1.5, E5 .5, F5 1 | G5 1.5, F5 .5, E5 1 | F5 3', 'flute', 0.55);
    const sBass = [41, 46, 41, 48, 45, 46, 48, 41];
    const sCh = [[60, 65, 69], [62, 65, 70], [60, 65, 69], [60, 64, 67], [60, 64, 69], [62, 65, 70], [58, 64, 67], [60, 65, 69]];
    for (let i = 0; i < 8; i++) {
      const t = 29.5 + i * 2.5;
      ev(t, 'pizz', sBass[i], 0, 0.7);
      chord(t + sb, sCh[i], 0, 'pizz', 0.32);
      chord(t + 2 * sb, sCh[i], 0, 'pizz', 0.28);
      chord(t, sCh[i].map((m) => m - 12), 2.6, 'pad', 0.28, { cut: 1300 });
    }
    [[29.8, 84], [30.4, 89], [31.0, 93], [31.5, 96], [32.1, 93], [32.6, 89]].forEach(([t, m]) => ev(t, 'celesta', m, 0, 0.26));
    ev(34.6, 'flock', 0, 3.2, 0.5);
    ev(38.3, 'robin', 0, 0.3, 0.4);
    [39.6, 40.9, 42.3].forEach((t) => ev(t, 'robin', 0, 0.7, 0.6));
    ev(46.3, 'whoosh', 0, 2.6, 0.5);
    arp(46.9, [65, 69, 72, 76, 77, 81, 84, 85, 88], 0.17, 'harp', 0.42);

    // ===== ЛЕТО: 90 ударов, доля = 0,667 с, такт 2 с =====
    const mb = 60 / 90;
    chord(49.5, D, 2.2, 'pad', 0.5, { att: 1.2 });
    arp(49.5, [50, 57, 62, 66, 69, 74], 0.22, 'harp', 0.45);
    mel(51.5, mb, 'D5 1, A4 1, F#4 1 | G4 1.5, A4 .5, B4 1 | A4 2, G4 .5, F#4 .5 | E4 3 | C#5 1, B4 1, A4 1 | B4 1.5, C#5 .5, D5 1 | E5 1.5, D5 .5, C#5 1 | D5 3', 'violin', 0.62, { pan: -0.2, bright: 1 });
    mel(51.5, mb, 'D4 1, A3 1, F#3 1 | G3 1.5, A3 .5, B3 1 | A3 2, G3 .5, F#3 .5 | E3 3 | C#4 1, B3 1, A3 1 | B3 1.5, C#4 .5, D4 1 | E4 1.5, D4 .5, C#4 1 | D4 3', 'cello', 0.3, { pan: 0.25 });
    const mCh = [D, G, D, A, Fsm, G, A7, D];
    const mArp = [[50, 57, 62, 66, 69, 66], [43, 50, 55, 59, 62, 59], [50, 57, 62, 66, 69, 66], [45, 52, 57, 61, 64, 61],
      [42, 49, 54, 57, 61, 57], [43, 50, 55, 59, 62, 59], [45, 52, 55, 61, 64, 61], [50, 57, 62, 66, 69, 74]];
    const mBass = [38, 43, 38, 45, 42, 43, 45, 38];
    for (let i = 0; i < 8; i++) {
      const t = 51.5 + i * 2;
      arp(t, mArp[i], mb / 2, 'harp', 0.3);
      ev(t, 'pizz', mBass[i], 0, 0.75); ev(t + 2 * mb, 'pizz', mBass[i] + 7, 0, 0.45);
      chord(t, mCh[i], 2.05, 'pad', 0.3);
    }
    [50.5, 52.8, 54.9, 57.1, 59.6].forEach((t) => ev(t, 'swallows', 0, 0, 0.5));
    // закат
    chord(67.5, D, 1.6, 'pad', 0.4, { att: 0.8 }); chord(69, Bm, 1.6, 'pad', 0.4); chord(70.5, G, 3.2, 'pad', 0.4);
    ev(67.5, 'violin', 78, 2.6, 0.4, { att: 0.6 }); ev(70.1, 'violin', 74, 2.6, 0.38, { att: 0.5 });
    [[65.5, 93], [66.3, 90], [67.2, 98], [68.4, 95], [69.1, 93], [70.3, 88]].forEach(([t, m]) => ev(t, 'celesta', m, 0, 0.18));
    for (let t = 64.6; t < 72; t += 0.55) ev(t, 'cricket', 0, 0, 0.5);

    // ===== ОСЕНЬ: 60 ударов =====
    [Bm, Em, Bm, Fs].forEach((c, i) => chord(72 + i * 3, c, 3.1, 'pad', 0.45));
    mel(72, 1, 'B3 1, F#3 1, D3 1 | E3 1.5, F#3 .5, G3 1 | F#3 2, E3 .5, D3 .5 | C#3 3', 'cello', 0.62);
    ev(78, 'violin', 74, 3, 0.3, { att: 0.8 }); ev(81, 'violin', 73, 3.2, 0.3, { att: 0.6 });
    [[75.2, 1], [75.9, 1.06], [76.5, 0.96], [77.4, 1.1], [78.1, 1], [78.9, 1.05], [79.8, 0.95], [80.6, 1.08], [81.5, 1]].forEach(([t, p]) => ev(t, 'crane', 0, 0, 0.55, { p }));
    [[78.2, 83], [79.0, 81], [79.7, 78], [80.6, 76], [81.4, 74], [82.3, 71], [83.1, 69]].forEach(([t, m]) => ev(t, 'harp', m, 0, 0.3));
    // иней: стеклянный кластер, потрескивание, тёплая волна
    [83, 85, 90].forEach((m) => ev(84.5, 'glass', m, 4.2, 0.4));
    ev(84.8, 'crackle', 0, 3.6, 0.5);
    chord(88.0, [50, 57, 62, 66, 69], 3.2, 'pad', 0.5, { att: 2.0 });
    [[88.6, 86], [89.0, 90], [89.4, 93], [89.8, 98]].forEach(([t, m]) => ev(t, 'celesta', m, 0, 0.3));
    ev(88.4, 'whoosh', 0, 1.4, 0.3);

    // ===== РАССВЕТ: 60 ударов =====
    arp(90, [50, 57, 62, 66, 69, 74, 78], 0.26, 'harp', 0.42);
    [[90, D], [93, D], [96, A], [99, G], [102, A7], [105, D]].forEach(([t, c]) => chord(t, c, 3.1, 'pad', 0.42));
    chord(108, [50, 57, 64, 66, 69], 6, 'pad', 0.5, { rel: 3.5 });
    mel(93, 1, 'D5 1, A4 1, F#4 1', 'violin', 0.5);
    mel(96, 1, 'C#5 1, B4 1, A4 1 | B4 1.5, C#5 .5, D5 1 | E5 1.5, D5 .5, C#5 1 | D5 3.6', 'violin', 0.55);
    ev(93, 'drone', 38, 20, 0.35);
    ev(94.2, 'crunch', 0, 0, 0.8); ev(95.1, 'crunch', 0, 0, 0.9);
    ev(96.2, 'shake', 0, 1.3, 0.6);
    ev(96.35, 'flutter', 0, 0.9, 0.4);
    [98.1, 98.4, 99.1, 99.4, 100.2, 100.5].forEach((t) => ev(t, 'bullfinch', 0, 0, 0.7));
    const hit = Story.dropHitT() || 102.05;
    ev(hit, 'drip', 0, 0, 0.8); ev(hit, 'celesta', 93, 0, 0.3);
    chord(hit + 0.55, [74, 78, 81], 0, 'harp', 0.3);
    ev(hit + 1.4, 'celesta', 98, 0, 0.22);
    ev(104.8, 'flutter', 0, 0.8, 0.3);
    [[110.8, 86], [111.6, 81]].forEach(([t, m]) => ev(t, 'celesta', m, 0, 0.25));

    // ===== шаги и копыта — по фазам анимации =====
    const steps = (from, to, fn, per, k, v) => {
      let prev = null;
      for (let t = from; t <= to; t += 0.01) {
        const p = fn(t); if (p == null) { prev = null; continue; }
        if (prev != null) for (const o of per) if (Math.floor(prev - o) !== Math.floor(p - o)) ev(t, k, 0, 0, v * (0.8 + 0.2 * Math.sin(t * 7)));
        prev = p;
      }
    };
    steps(2, 11.7, Story.phases.winter, [0, 0.25, 0.5, 0.75], 'crunch', 0.55);
    steps(104.3, 114, Story.phases.wake, [0, 0.25, 0.5, 0.75], 'crunch', 0.45);
    steps(50.1, 59.3, Story.phases.gallop, [0.42, 0.47, 0.62, 0.67], 'thump', 0.7);

    E.sort((a, b) => a.t - b.t);
    return E;
  }

  /* ---------------- инструменты ---------------- */
  function osc(type, f, at, end) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.start(at); o.stop(end); return o; }
  function gainNode(v) { const g = ctx.createGain(); g.gain.value = v; return g; }
  function biquad(type, f, q, gdb) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q != null) b.Q.value = q; if (gdb != null) b.gain.value = gdb; return b; }
  function noise(at, end, pink) { const s = ctx.createBufferSource(); s.buffer = pink ? pinkBuf : noiseBuf; s.loop = true; s.start(at, Math.random() * 1.5); s.stop(end); return s; }
  function out(node, pan, wet, bus) {
    const p = ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1);
    node.connect(p); p.connect(bus || music);
    if (wet > 0) { const s = gainNode(wet); p.connect(s); s.connect(revIn); }
  }
  function keep(g, srcs, end) { voices.push({ g, srcs, end }); }
  function env(g, at, a, peak, dur, rel) {
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(peak, at + a);
    const hold = at + Math.max(a, dur);
    g.gain.setValueAtTime(peak, hold);
    g.gain.setTargetAtTime(0, hold, rel / 4);
  }

  function bowed(at, m, dur, vel, o, low) {
    const f = mtof(m), rel = o.rel || 0.8, end = at + dur + rel * 1.6;
    const g = gainNode(0);
    const hp = biquad('highpass', low ? 60 : 200, 0.7);
    const pk = biquad('peaking', low ? 1100 : 2500, 1.3, low ? 4 : 5 + (o.bright || 0) * 2);
    const lp = biquad('lowpass', low ? 2200 : 3400 + (o.bright || 0) * 600, 0.5);
    const o1 = osc('sawtooth', f, at, end), o2 = osc('sawtooth', f, at, end);
    o2.detune.value = 6;
    const vib = osc('sine', low ? 5.0 : 5.5, at, end), vg = gainNode(0);
    vg.gain.setValueAtTime(0, at);
    vg.gain.linearRampToValueAtTime(f * 0.0055, at + Math.min(0.55, dur * 0.7 + 0.1));
    vib.connect(vg); vg.connect(o1.frequency); vg.connect(o2.frequency);
    o1.connect(hp); o2.connect(hp); hp.connect(pk); pk.connect(lp); lp.connect(g);
    env(g, at, o.att || (low ? 0.2 : 0.15), vel * (low ? 0.25 : 0.19), dur, rel);
    out(g, o.pan != null ? o.pan : (low ? 0.2 : -0.18), 0.5);
    keep(g, [o1, o2, vib], end);
  }
  function flute(at, m, dur, vel, o) {
    const f = mtof(m), end = at + dur + 0.9;
    const g = gainNode(0);
    const o1 = osc('sine', f, at, end), o2 = osc('triangle', f * 2, at, end), g2 = gainNode(0.1);
    o2.connect(g2); g2.connect(g); o1.connect(g);
    const n = noise(at, end), bp = biquad('bandpass', f * 1.5, 3), ng = gainNode(0.05);
    n.connect(bp); bp.connect(ng); ng.connect(g);
    const vib = osc('sine', 5.2, at, end), vg = gainNode(0);
    vg.gain.setValueAtTime(0, at); vg.gain.linearRampToValueAtTime(f * 0.004, at + 0.4);
    vib.connect(vg); vg.connect(o1.frequency); vg.connect(o2.frequency);
    env(g, at, 0.06, vel * 0.2, dur * 0.95, 0.3);
    out(g, 0.12, 0.45);
    keep(g, [o1, o2, n, vib], end);
  }
  function pad(at, m, dur, vel, o) {
    const f = mtof(m), rel = o.rel || 2.2, end = at + dur + rel * 1.5;
    const g = gainNode(0), lp = biquad('lowpass', o.cut || 1500, 0.3);
    const srcs = [-9, 0, 9].map((dc) => { const x = osc('sawtooth', f, at, end); x.detune.value = dc + (Math.random() - 0.5) * 5; x.connect(lp); return x; });
    lp.connect(g);
    env(g, at, o.att || 1.1, vel * 0.036, dur, rel);
    out(g, (Math.random() - 0.5) * 0.7, 0.6);
    keep(g, srcs, end);
  }
  function drone(at, m, dur, vel) {
    const f = mtof(m), end = at + dur + 4;
    const g = gainNode(0);
    const o1 = osc('sine', f, at, end), o2 = osc('triangle', f * 2, at, end), g2 = gainNode(0.25);
    o2.connect(g2); g2.connect(g); o1.connect(g);
    env(g, at, 2.5, vel * 0.16, dur, 3);
    out(g, 0, 0.3);
    keep(g, [o1, o2], end);
  }
  function pluck(at, m, vel, parts, dec, pan, wet) {
    const f = mtof(m), end = at + dec * 1.3 + 0.1;
    const g = gainNode(0);
    const srcs = parts.map(([h, a]) => { const x = osc('sine', f * h, at, end), xg = gainNode(a); x.connect(xg); xg.connect(g); return x; });
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vel, at + 0.004);
    g.gain.setTargetAtTime(0, at + 0.006, dec / 4);
    out(g, pan, wet);
    keep(g, srcs, end);
  }
  const harp = (at, m, vel) => pluck(at, m, vel * 0.2, [[1, 1], [2, 0.32], [3, 0.1], [4.01, 0.05]], 2.3, 0.25 - (m - 60) / 80, 0.5);
  const celesta = (at, m, vel) => pluck(at, m, vel * 0.24, [[1, 1], [2, 0.25], [4.02, 0.18]], 1.5, 0.3, 0.6);
  function pizz(at, m, vel) {
    const f = mtof(m), end = at + 0.9;
    const x = osc('sawtooth', f, at, end), lp = biquad('lowpass', 2000, 1.2), g = gainNode(0);
    lp.frequency.setValueAtTime(2200, at); lp.frequency.exponentialRampToValueAtTime(260, at + 0.35);
    x.connect(lp); lp.connect(g);
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(vel * 0.16, at + 0.004); g.gain.setTargetAtTime(0, at + 0.01, 0.12);
    out(g, (m - 55) / 50, 0.3);
    keep(g, [x], end);
  }
  function glass(at, m, dur, vel) {
    const f = mtof(m), end = at + dur + 2;
    const g = gainNode(0), trem = gainNode(0.5);
    const o1 = osc('sine', f, at, end), o2 = osc('sine', f * 2.01, at, end), g2 = gainNode(0.25);
    o2.connect(g2); g2.connect(trem); o1.connect(trem); trem.connect(g);
    const l = osc('sine', 6.5 + Math.random(), at, end), lg = gainNode(0.4); l.connect(lg); lg.connect(trem.gain);
    env(g, at, 1.4, vel * 0.05, dur, 1.4);
    out(g, (Math.random() - 0.5), 0.7);
    keep(g, [o1, o2, l], end);
  }

  /* ---------------- шумы и голоса ---------------- */
  function crunch(at, vel) {
    const end = at + 0.3;
    const s = noise(at, end), hp = biquad('highpass', 500), bp = biquad('bandpass', 1300 + Math.random() * 900, 0.8), g = gainNode(0);
    let t = at;
    g.gain.setValueAtTime(0, at);
    for (let i = 0; i < 8; i++) {
      t += 0.01 + Math.random() * 0.018;
      g.gain.setValueAtTime(vel * (0.25 + Math.random() * 0.75) * 0.5, t);
      g.gain.setValueAtTime(vel * 0.04, t + 0.005);
    }
    g.gain.setTargetAtTime(0, t, 0.02);
    s.connect(hp); hp.connect(bp); bp.connect(g);
    out(g, (Math.random() - 0.5) * 0.3, 0.2, sfx);
    keep(g, [s], end);
  }
  function thump(at, vel) {
    const end = at + 0.4;
    const o = osc('sine', 90, at, end), g = gainNode(0);
    o.frequency.setValueAtTime(95, at); o.frequency.exponentialRampToValueAtTime(42, at + 0.15);
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(vel * 0.3, at + 0.005); g.gain.setTargetAtTime(0, at + 0.01, 0.05);
    o.connect(g);
    const n = noise(at, end), lp = biquad('lowpass', 700), ng = gainNode(0);
    ng.gain.setValueAtTime(0, at); ng.gain.linearRampToValueAtTime(vel * 0.12, at + 0.003); ng.gain.setTargetAtTime(0, at + 0.005, 0.025);
    n.connect(lp); lp.connect(ng); ng.connect(g);
    out(g, 0, 0.15, sfx);
    keep(g, [o, n], end);
  }
  function chirp(at, f0, f1, dur, vel, pan, wet = 0.35) {
    const end = at + dur + 0.05;
    const o = osc('sine', f0, at, end), g = gainNode(0);
    o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(f1, at + dur);
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(vel * 0.1, at + dur * 0.25); g.gain.linearRampToValueAtTime(0, at + dur);
    o.connect(g);
    out(g, pan, wet, sfx);
    keep(g, [o], end);
  }
  const bullfinch = (at, vel) => { chirp(at, 2150, 1720, 0.2, vel, 0.25); chirp(at + 0.01, 4300, 3440, 0.18, vel * 0.12, 0.25); };
  function robin(at, dur, vel) {
    const n = Math.max(3, Math.round(dur / 0.07));
    for (let i = 0; i < n; i++) {
      const f = 3300 + Math.sin(i * 1.9) * 800 + (i % 3) * 250;
      chirp(at + i * 0.07, f, f * (i % 2 ? 1.3 : 0.78), 0.05, vel * (0.6 + 0.4 * Math.abs(Math.sin(i))), -0.3);
    }
  }
  const swallows = (at, vel) => { for (let i = 0; i < 7; i++) chirp(at + i * 0.055 + Math.random() * 0.02, 4200 + Math.random() * 1500, 5400 + Math.random() * 1400, 0.03, vel * 0.8, (Math.random() - 0.5) * 1.2, 0.25); };
  function crane(at, vel, p) {
    const end = at + 0.7, f = 470 * p;
    const g = gainNode(0), bp = biquad('bandpass', 1150 * p, 1.7), lp = biquad('lowpass', 2600);
    const o = osc('sawtooth', f, at, end), o2 = osc('square', f * 1.5, at, end), g2 = gainNode(0.12);
    o.frequency.setValueAtTime(f * 0.88, at); o.frequency.linearRampToValueAtTime(f * 1.18, at + 0.07); o.frequency.linearRampToValueAtTime(f, at + 0.4);
    o2.frequency.setValueAtTime(f * 1.3, at); o2.frequency.linearRampToValueAtTime(f * 1.75, at + 0.07); o2.frequency.linearRampToValueAtTime(f * 1.5, at + 0.4);
    o.connect(bp); o2.connect(g2); g2.connect(bp); bp.connect(lp);
    const trem = gainNode(0.6); lp.connect(trem); trem.connect(g);
    const am = osc('sine', 31, at, end), ag = gainNode(0.4); am.connect(ag); ag.connect(trem.gain);
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(vel * 0.2, at + 0.03); g.gain.setValueAtTime(vel * 0.2, at + 0.32); g.gain.linearRampToValueAtTime(0, at + 0.5);
    out(g, -0.3 + (p - 1) * 4, 0.75, sfx);
    keep(g, [o, o2, am], end);
  }
  function drip(at, vel) {
    const end = at + 0.9;
    const o = osc('sine', 1700, at, end), g = gainNode(0);
    o.frequency.setValueAtTime(1750, at); o.frequency.exponentialRampToValueAtTime(1180, at + 0.07);
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(vel * 0.2, at + 0.003); g.gain.setTargetAtTime(0, at + 0.005, 0.09);
    o.connect(g);
    out(g, 0.15, 0.8, sfx);
    keep(g, [o], end);
    crunch(at + 0.01, vel * 0.25);
  }
  function whoosh(at, dur, vel) {
    const end = at + dur + 0.3;
    const s = noise(at, end, true), bp = biquad('bandpass', 300, 0.9), g = gainNode(0);
    bp.frequency.setValueAtTime(260, at); bp.frequency.exponentialRampToValueAtTime(1500, at + dur * 0.55); bp.frequency.exponentialRampToValueAtTime(420, at + dur);
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(vel * 0.25, at + dur * 0.5); g.gain.linearRampToValueAtTime(0, at + dur);
    s.connect(bp); bp.connect(g);
    out(g, 0, 0.5, sfx);
    keep(g, [s], end);
  }
  function flutter(at, dur, vel) {
    const end = at + dur + 0.1;
    const s = noise(at, end), bp = biquad('bandpass', 900, 0.8), g = gainNode(0), trem = gainNode(0.5);
    const l = osc('square', 17, at, end), lg = gainNode(0.5); l.connect(lg); lg.connect(trem.gain);
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(vel * 0.2, at + 0.05); g.gain.linearRampToValueAtTime(0, at + dur);
    s.connect(bp); bp.connect(trem); trem.connect(g);
    out(g, 0.2, 0.3, sfx);
    keep(g, [s, l], end);
  }
  function flock(at, dur, vel) {
    flutter(at, dur, vel * 0.6);
    for (let i = 0; i < 10; i++) chirp(at + 0.3 + i * 0.27 + Math.random() * 0.1, 3800 + Math.random() * 1400, 3000 + Math.random() * 900, 0.06, vel * 0.5, 0.8 - i * 0.16, 0.4);
  }
  function whump(at, vel) {
    const end = at + 0.8;
    const s = noise(at, end, true), lp = biquad('lowpass', 520), g = gainNode(0);
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(vel * 0.35, at + 0.02); g.gain.setTargetAtTime(0, at + 0.05, 0.12);
    s.connect(lp); lp.connect(g);
    out(g, 0.25, 0.3, sfx);
    keep(g, [s], end);
  }
  function shake(at, dur, vel) {
    const end = at + dur + 0.2;
    const s = noise(at, end), bp = biquad('bandpass', 2600, 0.7), g = gainNode(0), trem = gainNode(0.5);
    const l = osc('sine', 13, at, end), lg = gainNode(0.5); l.connect(lg); lg.connect(trem.gain);
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(vel * 0.22, at + 0.08); g.gain.linearRampToValueAtTime(0, at + dur);
    s.connect(bp); bp.connect(trem); trem.connect(g);
    out(g, 0, 0.3, sfx);
    keep(g, [s, l], end);
  }
  function crackle(at, dur, vel) {
    const n = Math.round(dur * 14);
    for (let i = 0; i < n; i++) {
      const t = at + Math.random() * dur, end = t + 0.03;
      const s = noise(t, end), hp = biquad('highpass', 4500), g = gainNode(0);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel * (0.04 + Math.random() * 0.08), t + 0.001); g.gain.setTargetAtTime(0, t + 0.002, 0.004);
      s.connect(hp); hp.connect(g);
      out(g, (Math.random() - 0.5) * 1.6, 0.5, sfx);
      keep(g, [s], end);
    }
  }
  function cricket(at, vel) {
    for (let i = 0; i < 3; i++) {
      const t = at + i * 0.045, end = t + 0.04;
      const o = osc('sine', 4450, t, end), g = gainNode(0);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel * 0.035, t + 0.006); g.gain.linearRampToValueAtTime(0, t + 0.028);
      o.connect(g);
      out(g, 0.5, 0.3, sfx);
      keep(g, [o], end);
    }
  }

  function fire(e, at) {
    const o = e.o || {};
    switch (e.k) {
      case 'violin': bowed(at, e.m, e.d, e.v, o, false); break;
      case 'cello': bowed(at, e.m, e.d, e.v, o, true); break;
      case 'flute': flute(at, e.m, e.d, e.v, o); break;
      case 'pad': pad(at, e.m, e.d, e.v, o); break;
      case 'drone': drone(at, e.m, e.d, e.v); break;
      case 'harp': harp(at, e.m, e.v); break;
      case 'celesta': celesta(at, e.m, e.v); break;
      case 'pizz': pizz(at, e.m, e.v); break;
      case 'glass': glass(at, e.m, e.d, e.v); break;
      case 'crunch': crunch(at, e.v); break;
      case 'thump': thump(at, e.v); break;
      case 'bullfinch': bullfinch(at, e.v); break;
      case 'robin': robin(at, e.d, e.v); break;
      case 'swallows': swallows(at, e.v); break;
      case 'crane': crane(at, e.v, o.p || 1); break;
      case 'drip': drip(at, e.v); break;
      case 'whoosh': whoosh(at, e.d, e.v); break;
      case 'flutter': flutter(at, e.d, e.v); break;
      case 'flock': flock(at, e.d, e.v); break;
      case 'whump': whump(at, e.v); break;
      case 'shake': shake(at, e.d, e.v); break;
      case 'crackle': crackle(at, e.d, e.v); break;
      case 'cricket': cricket(at, e.v); break;
    }
  }
  const SUSTAINED = new Set(['pad', 'drone', 'violin', 'cello', 'flute', 'glass']);

  /* ---------------- непрерывные слои: ветер, вой метели, ручей, листва ---------------- */
  function makeLayers() {
    const mk = (src, filters, pan) => {
      let n = src;
      for (const f of filters) { n.connect(f); n = f; }
      const g = gainNode(0); n.connect(g); out(g, pan, 0.35, sfx);
      return g;
    };
    const t0 = ctx.currentTime;
    const loopSrc = (pink) => { const s = ctx.createBufferSource(); s.buffer = pink ? pinkBuf : noiseBuf; s.loop = true; s.start(t0); return s; };
    const windBp = biquad('bandpass', 420, 0.6);
    const howlBp = biquad('bandpass', 760, 9);
    const brookBp = biquad('bandpass', 1100, 0.9), brookHp = biquad('highpass', 400);
    const rustleHp = biquad('highpass', 2600);
    const L = {
      wind: mk(loopSrc(true), [windBp], -0.1), windBp,
      howl: mk(loopSrc(false), [howlBp], 0.2), howlBp,
      brook: mk(loopSrc(false), [brookHp, brookBp], -0.35), brookBp,
      rustle: mk(loopSrc(false), [rustleHp], 0.3),
    };
    // журчание: быстрая модуляция громкости ручья
    const lfo1 = osc('sine', 5.3, t0, t0 + 1e5), lfo2 = osc('sine', 8.9, t0, t0 + 1e5), lg = gainNode(0.35);
    lfo1.connect(lg); lfo2.connect(lg);
    const bm = gainNode(1);
    L.brook.disconnect(); L.brook.connect(bm); lg.connect(bm.gain);
    out(bm, -0.35, 0.4, sfx);
    return L;
  }
  function layerLevels(t) {
    const w = WIND(t);
    const dream = win(t, 24.5, 26.5, 88.5, 90.5);
    return {
      wind: (0.05 + w * 0.42) * (1 - dream * 0.45),
      windF: 280 + w * 650 + 120 * Math.sin(t * 0.7),
      howl: (win(t, 12.3, 13.6, 18.4, 20.6) + win(t, 84.2, 85.5, 87.8, 89.5) * 0.7) * 0.45,
      howlF: 700 + 160 * Math.sin(t * 0.9) + 90 * Math.sin(t * 2.3),
      brook: win(t, 26.8, 29.5, 45.8, 48.4) * 0.3,
      rustle: win(t, 70.5, 72.5, 86.5, 89) * (0.05 + w * 0.12),
    };
  }
  function setLayers(t, now, playing) {
    if (!layers) return;
    const L = layerLevels(t), k = playing ? 1 : 0;
    layers.wind.gain.setTargetAtTime(L.wind * k, now, 0.12);
    layers.windBp.frequency.setTargetAtTime(L.windF, now, 0.2);
    layers.howl.gain.setTargetAtTime(L.howl * k, now, 0.15);
    layers.howlBp.frequency.setTargetAtTime(L.howlF, now, 0.15);
    layers.brook.gain.setTargetAtTime(L.brook * k, now, 0.2);
    layers.rustle.gain.setTargetAtTime(L.rustle * k, now, 0.2);
  }

  /* ---------------- управление ---------------- */
  function makeBuffers() {
    const sr = ctx.sampleRate;
    noiseBuf = ctx.createBuffer(1, sr * 2, sr);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    pinkBuf = ctx.createBuffer(1, sr * 4, sr);
    const p = pinkBuf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < p.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0527;
      p[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    }
  }
  function makeReverb() {
    const sr = ctx.sampleRate, len = Math.floor(sr * 3.4);
    const ir = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const x = Math.random() * 2 - 1, k = i / len;
        lp += (x - lp) * (0.5 - 0.35 * k);
        d[i] = lp * Math.pow(1 - k, 2.4) * (i < sr * 0.012 ? i / (sr * 0.012) : 1);
      }
    }
    const conv = ctx.createConvolver();
    conv.buffer = ir;
    return conv;
  }
  async function enable() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      makeBuffers();
      master = gainNode(muted ? 0 : VOLUME);
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.3;
      const tone = biquad('lowpass', 9000, 0.5);
      master.connect(tone); tone.connect(comp); comp.connect(ctx.destination);
      music = gainNode(0.85); music.connect(master);
      sfx = gainNode(0.9); sfx.connect(master);
      revIn = gainNode(1);
      const conv = makeReverb(), revOut = gainNode(0.45);
      revIn.connect(conv); conv.connect(revOut); revOut.connect(master);
      EV = buildScore();
      layers = makeLayers();
    }
    if (ctx.state === 'suspended') { try { await ctx.resume(); } catch (e) { /* без звука */ } }
    on = true;
    return true;
  }
  function stopAll() {
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const v of voices) {
      try {
        v.g.gain.cancelScheduledValues(now);
        v.g.gain.setTargetAtTime(0, now, 0.025);
        for (const s of v.srcs) s.stop(now + 0.15);
      } catch (e) { /* голос уже закончился */ }
    }
    voices.length = 0;
    running = false;
    setLayers(0, now, false);
  }
  function lowerBound(t) { let i = 0; while (i < EV.length && EV[i].t < t) i++; return i; }
  function startAt(t, now) {
    evIdx = lowerBound(t);
    for (let i = 0; i < evIdx; i++) {
      const e = EV[i];
      if (SUSTAINED.has(e.k) && e.t + e.d > t + 0.5) fire(Object.assign({}, e, { d: e.t + e.d - t, o: Object.assign({}, e.o, { att: 0.35 }) }), now + 0.03);
    }
  }
  function update(t, playing) {
    if (!ctx || !on) return;
    const now = ctx.currentTime;
    if (!playing) { if (running) stopAll(); return; }
    if (!running) { running = true; startAt(t, now); }
    const horizon = t + 0.25;
    while (evIdx < EV.length && EV[evIdx].t < horizon) {
      const e = EV[evIdx++];
      if (e.t < t - 0.06) continue;
      fire(e, now + Math.max(0.005, e.t - t));
    }
    setLayers(t, now, true);
    for (let i = voices.length - 1; i >= 0; i--) if (voices[i].end < now) voices.splice(i, 1);
  }
  function seek() { if (running) stopAll(); }
  function setMuted(m) {
    muted = m;
    if (ctx) master.gain.setTargetAtTime(m ? 0 : VOLUME, ctx.currentTime, 0.08);
  }

  return {
    enable, update, seek, setMuted,
    pauseAll: stopAll,
    resume: () => { if (ctx && on && ctx.state === 'suspended') ctx.resume().catch(() => {}); },
    suspend: () => { if (ctx && ctx.state === 'running') { stopAll(); ctx.suspend().catch(() => {}); } },
    isOn: () => on,
    get muted() { return muted; },
  };
})();
