'use strict';
/* =========================================================================
   Оркестр на кувшинке — ЗВУК
   Всё синтезируется: пиццикато — алгоритм Карплуса — Стронга, фагот —
   своя спектральная форма волны с формантами и вибрато, колокольчики —
   аддитивный синтез, жуки — шумы и тоны с огибающими. Планировщик читает
   ту же партитуру, по которой движутся персонажи.
   ========================================================================= */

const AUDIO = (() => {
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  function rng(seed) { // mulberry32
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  /* ---------- Движок: работает и с живым, и с офлайн-контекстом ---------- */
  function Engine(ac) {
    const E = { ac, voices: new Set() };
    const sr = ac.sampleRate;

    // Общая цепь: сухой сигнал + реверберация → компрессор → громкость
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 3.2; comp.attack.value = 0.005; comp.release.value = 0.22;
    const master = ac.createGain(); master.gain.value = 0.78;
    comp.connect(master).connect(ac.destination);
    E.master = master;
    const dry = ac.createGain(); dry.connect(comp);
    const rev = ac.createConvolver(); rev.buffer = impulse(2.8);
    const revOut = ac.createGain(); revOut.gain.value = 0.85; rev.connect(revOut).connect(comp);
    function bus(sendAmt, chain) { // вход инструмента: цепь фильтров → сухой + посыл в реверб
      const input = ac.createGain();
      let last = input;
      for (const n of chain || []) { last.connect(n); last = n; }
      last.connect(dry);
      const send = ac.createGain(); send.gain.value = sendAmt; last.connect(send).connect(rev);
      return input;
    }
    const bq = (type, f, q, g) => { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q !== undefined) b.Q.value = q; if (g !== undefined) b.gain.value = g; return b; };

    // Инструментальные шины
    const B = {
      pizz: bus(0.22, [bq('lowshelf', 140, undefined, 4), bq('peaking', 750, 1, -3), bq('lowpass', 2600, 0.6)]),
      bsn: bus(0.2, [bq('highpass', 70, 0.7), bq('peaking', 480, 1.3, 6), bq('peaking', 1150, 2, 4), bq('lowpass', 3300, 0.7)]),
      bell: bus(0.42, [bq('lowpass', 9000, 0.5)]),
      hero: bus(0.5, [bq('lowpass', 10500, 0.5)]),
      drum: bus(0.14, []),
      choir: bus(0.45, [bq('lowpass', 2600, 0.6)]),
      sfx: bus(0.18, []),
      amb: bus(0.05, []),
    };
    // хор: две форманты «у-о» параллельно
    (() => {
      const f1 = bq('bandpass', 420, 3.2), f2 = bq('bandpass', 880, 4.5), g2 = ac.createGain(); g2.gain.value = 0.55;
      const inCh = ac.createGain(); inCh.connect(f1); inCh.connect(f2); f2.connect(g2);
      const mix = ac.createGain(); mix.gain.value = 2.2; f1.connect(mix); g2.connect(mix); mix.connect(B.choir);
      B.choirIn = inCh;
    })();

    // Шум — общий буфер
    const noise = ac.createBuffer(1, sr * 2, sr);
    { const d = noise.getChannelData(0), r = rng(7); for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1; }

    // Спектр фагота: слабая основная, сильные 2–4 гармоники
    const bsnWave = (() => {
      const h = [0, 0.42, 0.95, 0.88, 0.7, 0.52, 0.42, 0.33, 0.25, 0.2, 0.16, 0.12, 0.1, 0.08, 0.06, 0.05, 0.04, 0.03, 0.025, 0.02, 0.015];
      const re = new Float32Array(h.length), im = Float32Array.from(h);
      return ac.createPeriodicWave(re, im);
    })();

    /* --- Импульс зала: шум с экспоненциальным затуханием, хвост темнеет --- */
    function impulse(sec) {
      const n = Math.floor(sr * sec), b = ac.createBuffer(2, n, sr);
      for (let ch = 0; ch < 2; ch++) {
        const d = b.getChannelData(ch), r = rng(11 + ch * 97);
        let lp = 0;
        for (let i = 0; i < n; i++) {
          const t = i / sr, x = i / n;
          const k = 0.62 - 0.5 * x;
          lp += k * ((r() * 2 - 1) - lp);
          d[i] = lp * Math.exp(-t * 2.2) * Math.pow(1 - x, 1.5) * (t < 0.01 ? t / 0.01 : 1) * 0.9;
        }
      }
      return b;
    }

    /* --- Пиццикато: Карплус — Стронг, буфер на каждую высоту --- */
    const ksCache = new Map();
    function ks(m) {
      if (ksCache.has(m)) return ksCache.get(m);
      const f = mtof(m), P = sr / f, L = Math.max(2, Math.round(P + 0.5));
      const dur = m < 45 ? 2.0 : 1.5, N = Math.floor(sr * dur);
      const buf = ac.createBuffer(1, N, sr), d = buf.getChannelData(0);
      const line = new Float32Array(L), r = rng(m * 131 + 3);
      // возбуждение: мягкий палец — сглаженный шум, «полуволна» щипка
      let lp = 0;
      for (let i = 0; i < L; i++) { lp += 0.38 * ((r() * 2 - 1) - lp); line[i] = lp + 0.9 * Math.sin(Math.PI * i / L) * 0.6; }
      let mean = 0; for (let i = 0; i < L; i++) mean += line[i]; mean /= L;
      let mx = 0; for (let i = 0; i < L; i++) { line[i] -= mean; mx = Math.max(mx, Math.abs(line[i])); }
      for (let i = 0; i < L; i++) line[i] /= mx || 1;
      const decay = m < 45 ? 0.9968 : 0.9955;
      let i = 0;
      for (let n = 0; n < N; n++) {
        const cur = line[i], nxt = line[(i + 1) % L];
        d[n] = cur;
        line[i] = decay * 0.5 * (cur + nxt);
        i = (i + 1) % L;
      }
      // мягкий спад в конце буфера
      const fade = Math.floor(sr * 0.05);
      for (let n = N - fade; n < N; n++) d[n] *= (N - n) / fade;
      ksCache.set(m, buf);
      return buf;
    }
    E.warm = (list) => list.forEach(ks); // заранее посчитать нужные высоты

    function track(nodes, g, end) { const v = { nodes, g, end }; E.voices.add(v); return v; }
    function envAD(g, t, peak, a, d) { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.setTargetAtTime(0, t + a, d / 4.6); }

    /* --- Инструменты --- */
    const I = {};
    I.pizz = (t, e) => {
      const buf = ks(e.m), src = ac.createBufferSource(); src.buffer = buf;
      if (e.bend) { src.playbackRate.setValueAtTime(Math.pow(2, e.bend / 12), t); src.playbackRate.linearRampToValueAtTime(1, t + 0.5); }
      const g = ac.createGain(), peak = 0.62 * e.v;
      const rel = t + Math.max(e.dur, 0.45);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + 0.003);
      g.gain.setValueAtTime(peak, rel); g.gain.linearRampToValueAtTime(0, rel + 0.12);
      src.connect(g).connect(B.pizz);
      src.start(t); src.stop(Math.min(rel + 0.15, t + buf.duration));
      // стук пальца
      const n = ac.createBufferSource(); n.buffer = noise; const nf = bq('bandpass', 1100, 1.2), ng = ac.createGain();
      envAD(ng, t, 0.05 * e.v, 0.001, 0.02);
      n.connect(nf).connect(ng).connect(B.pizz); n.start(t, Math.random()); n.stop(t + 0.05);
      track([src, n], g, rel + 0.15);
    };
    I.bsn = (t, e) => {
      const f = mtof(e.m), o = ac.createOscillator();
      o.setPeriodicWave(bsnWave);
      o.frequency.setValueAtTime(f * 0.985, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
      const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 5.2;
      lg.gain.setValueAtTime(0, t); lg.gain.setValueAtTime(0, t + 0.22); lg.gain.linearRampToValueAtTime(f * 0.0048, t + 0.6);
      lfo.connect(lg).connect(o.frequency);
      const g = ac.createGain(), A = 0.13 * e.v, rel = t + Math.max(e.dur, 0.07);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(A * 1.15, t + 0.04); g.gain.linearRampToValueAtTime(A, t + 0.14);
      g.gain.setValueAtTime(A, rel); g.gain.linearRampToValueAtTime(0, rel + 0.075);
      o.connect(g).connect(B.bsn);
      // дыхание
      const n = ac.createBufferSource(); n.buffer = noise; n.loop = true;
      const nf = bq('bandpass', 1500, 0.9), ng = ac.createGain();
      ng.gain.setValueAtTime(0, t); ng.gain.linearRampToValueAtTime(0.02 * e.v, t + 0.03); ng.gain.linearRampToValueAtTime(0.006 * e.v, t + 0.16);
      ng.gain.setValueAtTime(0.006 * e.v, rel); ng.gain.linearRampToValueAtTime(0, rel + 0.06);
      n.connect(nf).connect(ng).connect(B.bsn);
      const end = rel + 0.1;
      o.start(t); lfo.start(t); n.start(t, Math.random()); o.stop(end); lfo.stop(end); n.stop(end);
      track([o, lfo, n], g, end);
    };
    function partials(t, e, bus, list, base, detune) {
      const f = mtof(e.m), out = ac.createGain(); out.gain.value = 1; out.connect(bus);
      const hiShort = Math.max(0.55, 1 - (e.m - 77) * 0.025); // выше — короче
      let end = t;
      const oscs = [];
      for (const [ratio, amp, dec] of list) {
        const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = f * ratio + (detune || 0) * (ratio === 1 ? 1 : 0);
        const g = ac.createGain(), d = dec * hiShort;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(base * amp * e.v, t + 0.002);
        g.gain.setTargetAtTime(0, t + 0.002, d / 4);
        o.connect(g).connect(out);
        const stop = t + d * 1.25 + 0.05;
        o.start(t); o.stop(stop); oscs.push(o); end = Math.max(end, stop);
      }
      // глушение (фермата снимается рукой)
      if (e.dur > 1.2) { out.gain.setValueAtTime(1, t + e.dur); out.gain.linearRampToValueAtTime(0, t + e.dur + 0.1); end = Math.min(end, t + e.dur + 0.12); }
      const n = ac.createBufferSource(); n.buffer = noise; const nf = bq('highpass', 4200, 0.7), ng = ac.createGain();
      envAD(ng, t, 0.018 * e.v, 0.001, 0.012);
      n.connect(nf).connect(ng).connect(out); n.start(t, Math.random()); n.stop(t + 0.03);
      track(oscs.concat([n]), out, end);
    }
    I.bell = (t, e) => partials(t, e, B.bell, [[1, 1, 1.5], [2, 0.3, 0.55], [3, 0.09, 0.28], [4.16, 0.05, 0.14]], 0.095);
    I.hero = (t, e) => {
      partials(t, e, B.hero, [[1, 0.62, 2.0], [2, 0.2, 0.7], [2.76, 0.16, 0.38], [5.4, 0.06, 0.14]], 0.1, 1.4);
      partials(t, e, B.hero, [[1, 0.42, 1.7]], 0.1, -1.3); // вторая основная — мерцание биений
    };
    I.kick = (t, e) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(52, t + 0.12);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.75 * e.v, t + 0.002); g.gain.setTargetAtTime(0, t + 0.01, 0.09);
      o.connect(g).connect(B.drum); o.start(t); o.stop(t + 0.55);
      const n = ac.createBufferSource(); n.buffer = noise; const nf = bq('bandpass', 380, 2.5), ng = ac.createGain();
      envAD(ng, t, 0.2 * e.v, 0.001, 0.07);
      n.connect(nf).connect(ng).connect(B.drum); n.start(t, Math.random()); n.stop(t + 0.12);
      track([o, n], g, t + 0.55);
    };
    I.wood = (t, e) => {
      const f = e.m === 1 ? 1240 : 860;
      const o = ac.createOscillator(), g = ac.createGain(); o.type = 'triangle';
      o.frequency.setValueAtTime(f * 1.07, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.012);
      envAD(g, t, 0.26 * e.v, 0.001, 0.075);
      o.connect(g).connect(B.drum); o.start(t); o.stop(t + 0.12);
      const n = ac.createBufferSource(); n.buffer = noise; const nf = bq('bandpass', f * 2.2, 5), ng = ac.createGain();
      envAD(ng, t, 0.09 * e.v, 0.001, 0.02);
      n.connect(nf).connect(ng).connect(B.drum); n.start(t, Math.random()); n.stop(t + 0.05);
      track([o, n], g, t + 0.12);
    };
    I.shk = (t, e) => {
      const n = ac.createBufferSource(); n.buffer = noise; const h = bq('highpass', 4800, 0.7), bp = bq('bandpass', 7600, 0.8), g = ac.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.2 * e.v, t + 0.007); g.gain.setTargetAtTime(0, t + 0.012, 0.022);
      n.connect(h).connect(bp).connect(g).connect(B.drum); n.start(t, Math.random()); n.stop(t + 0.14);
      track([n], g, t + 0.14);
    };
    I.tap = (t, e) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.setValueAtTime(1900, t); o.frequency.exponentialRampToValueAtTime(1450, t + 0.02);
      envAD(g, t, 0.16 * e.v, 0.001, 0.04);
      o.connect(g).connect(B.sfx); o.start(t); o.stop(t + 0.08);
      const n = ac.createBufferSource(); n.buffer = noise; const nf = bq('bandpass', 3200, 2), ng = ac.createGain();
      envAD(ng, t, 0.1 * e.v, 0.001, 0.02);
      n.connect(nf).connect(ng).connect(B.sfx); n.start(t, Math.random()); n.stop(t + 0.05);
      track([o, n], g, t + 0.08);
    };
    I.drop = (t, e) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.setValueAtTime(480, t); o.frequency.exponentialRampToValueAtTime(1500, t + 0.075);
      envAD(g, t, 0.26 * e.v, 0.004, 0.12);
      o.connect(g).connect(B.sfx); o.start(t); o.stop(t + 0.2);
      const o2 = ac.createOscillator(), g2 = ac.createGain();
      o2.frequency.setValueAtTime(900, t + 0.1); o2.frequency.exponentialRampToValueAtTime(1350, t + 0.15);
      envAD(g2, t + 0.1, 0.07 * e.v, 0.003, 0.06);
      o2.connect(g2).connect(B.sfx); o2.start(t + 0.1); o2.stop(t + 0.22);
      track([o, o2], g, t + 0.22);
    };
    I.gulp = (t, e) => {
      const o = ac.createOscillator(), g = ac.createGain(), lp = bq('lowpass', 900, 0.8);
      o.frequency.setValueAtTime(430, t); o.frequency.exponentialRampToValueAtTime(200, t + 0.1);
      envAD(g, t, 0.24 * e.v, 0.006, 0.11);
      o.connect(lp).connect(g).connect(B.sfx); o.start(t); o.stop(t + 0.2);
      track([o], g, t + 0.2);
    };
    I.croak = (t, e) => {
      const f = [92, 116, 138][e.m % 3], dur = 0.3 + 0.08 * (e.m % 2);
      const o = ac.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(f * 1.06, t); o.frequency.linearRampToValueAtTime(f * 0.94, t + dur);
      const am = ac.createGain(); am.gain.value = 0.5;
      const lfo = ac.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 27 + e.m * 5;
      const lg = ac.createGain(); lg.gain.value = 0.5; lfo.connect(lg).connect(am.gain);
      const bp = bq('bandpass', 620 + 140 * (e.m % 3), 2.6), g = ac.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.3 * e.v, t + 0.025);
      g.gain.setValueAtTime(0.3 * e.v, t + dur - 0.06); g.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(am).connect(bp).connect(g).connect(B.sfx);
      o.start(t); lfo.start(t); o.stop(t + dur + 0.02); lfo.stop(t + dur + 0.02);
      track([o, lfo], g, t + dur + 0.02);
    };
    I.choir = (t, e) => {
      const f = mtof(e.m), g = ac.createGain(), A = 0.05 * e.v, rel = t + e.dur;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(A, t + 0.2);
      g.gain.setValueAtTime(A, rel); g.gain.linearRampToValueAtTime(0, rel + 0.35);
      const oscs = [];
      for (const dc of [-5, 5]) {
        const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = dc;
        o.connect(g); oscs.push(o);
      }
      const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 5.4;
      lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.004, t + 0.7);
      lfo.connect(lg); oscs.forEach((o) => lg.connect(o.frequency));
      g.connect(B.choirIn);
      const end = rel + 0.4;
      oscs.forEach((o) => { o.start(t); o.stop(end); }); lfo.start(t); lfo.stop(end);
      track(oscs.concat([lfo]), g, end);
    };

    E.play = (e, t) => { const f = I[e.inst]; if (f) f(t, e); };

    /* --- Фон пруда: сверчки и вода — зацикленные буферы --- */
    function crickets() {
      const len = 6, n = sr * len, b = ac.createBuffer(2, n, sr);
      const bugs = [[4650, 0.62, 0.0, 0.8], [5100, 0.9, 0.33, 0.55], [4300, 0.75, 0.6, 0.45]];
      for (let ch = 0; ch < 2; ch++) {
        const d = b.getChannelData(ch);
        for (const [f, per, ph, amp] of bugs) {
          const pan = ch === 0 ? (f > 4600 ? 0.5 : 1) : (f > 4600 ? 1 : 0.55);
          for (let i = 0; i < n; i++) {
            const t = i / sr, c = ((t / per + ph) % 1) * per;       // время внутри одной трели
            if (c > 0.16) continue;
            const pulse = (c * 32) % 1;                             // три-четыре импульса
            if (pulse > 0.55) continue;
            const env = Math.sin(Math.PI * pulse / 0.55) * Math.sin(Math.PI * Math.min(1, c / 0.16));
            d[i] += Math.sin(2 * Math.PI * f * t) * env * amp * pan * 0.05;
          }
        }
      }
      return b;
    }
    function water() {
      const len = 7, n = sr * len, b = ac.createBuffer(2, n, sr);
      for (let ch = 0; ch < 2; ch++) {
        const d = b.getChannelData(ch), r = rng(51 + ch);
        let br = 0, lp = 0;
        for (let i = 0; i < n; i++) {
          const t = i / sr;
          br = br * 0.995 + (r() * 2 - 1) * 0.06;
          lp += 0.08 * (br - lp);
          const lap = 0.55 + 0.45 * Math.sin(2 * Math.PI * t / len * 3 + ch) * Math.sin(2 * Math.PI * t / len * 2 + 1.3);
          d[i] = lp * lap * 0.9;
        }
        // редкие «плип»
        for (let k = 0; k < 5; k++) {
          const t0 = (k * 1.37 + ch * 0.6) % len, f0 = 700 + 500 * r();
          for (let j = 0; j < sr * 0.08; j++) {
            const t = j / sr, i = Math.floor((t0 + t) * sr) % n;
            d[i] += Math.sin(2 * Math.PI * (f0 + 4000 * t) * t) * Math.exp(-t * 55) * 0.05;
          }
        }
      }
      return b;
    }
    const ambG = ac.createGain(); ambG.gain.value = 0; ambG.connect(B.amb);
    let ambSrc = null;
    E.ambStart = (t) => {
      if (ambSrc) return;
      const cr = ac.createBufferSource(); cr.buffer = crickets(); cr.loop = true;
      const crg = ac.createGain(); crg.gain.value = 0.55;
      const wa = ac.createBufferSource(); wa.buffer = water(); wa.loop = true;
      const wag = ac.createGain(); wag.gain.value = 0.9;
      cr.connect(crg).connect(ambG); wa.connect(wag).connect(ambG);
      cr.start(t); wa.start(t);
      ambSrc = [cr, wa];
    };
    E.setAmb = (level, t) => { ambG.gain.setTargetAtTime(level, t, 0.25); };
    E.ambNow = (level) => { ambG.gain.cancelScheduledValues(0); ambG.gain.value = level; };

    /* --- Остановка всех голосов (пауза, перемотка) --- */
    E.killAll = () => {
      const now = ac.currentTime;
      for (const v of E.voices) {
        try {
          v.g.gain.cancelScheduledValues(now);
          v.g.gain.setValueAtTime(v.g.gain.value, now);
          v.g.gain.linearRampToValueAtTime(0, now + 0.04);
          for (const n of v.nodes) n.stop(now + 0.06);
        } catch (err) { /* узел мог уже остановиться */ }
      }
      E.voices.clear();
      ambG.gain.cancelScheduledValues(now);
      ambG.gain.setValueAtTime(ambG.gain.value, now);
      ambG.gain.linearRampToValueAtTime(0, now + 0.08);
    };
    E.gc = (now) => { for (const v of E.voices) if (v.end < now - 0.3) E.voices.delete(v); };
    return E;
  }

  /* ---------- Живое воспроизведение ------------------------------------ */
  const EV = SCORE.EV, TIMES = Float64Array.from(EV, (e) => e.t);
  let ac = null, E = null, playing = false, anchorCtx = 0, anchorFilm = 0, idx = 0, timer = 0, vol = 1;
  const pizzNotes = [...new Set(EV.filter((e) => e.inst === 'pizz').map((e) => e.m))];

  function ambLevel(t) {
    const A = SCORE.AMB;
    if (t <= A[0][0]) return A[0][1];
    for (let i = 1; i < A.length; i++) if (t < A[i][0]) { const u = (t - A[i - 1][0]) / (A[i][0] - A[i - 1][0]); return A[i - 1][1] + (A[i][1] - A[i - 1][1]) * u; }
    return A[A.length - 1][1];
  }

  function ensure() {
    if (ac) return true;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return false;
    ac = new Ctx({ latencyHint: 'interactive' });
    E = Engine(ac);
    E.warm(pizzNotes);
    E.master.gain.value = 0.78 * vol;
    return true;
  }

  function tick() {
    if (!playing) return;
    const now = ac.currentTime, horizon = now + 0.22;
    const filmH = anchorFilm + (horizon - anchorCtx);
    while (idx < EV.length && EV[idx].t < filmH) {
      const e = EV[idx++], when = anchorCtx + (e.t - anchorFilm);
      if (when >= now - 0.005) E.play(e, Math.max(when, now + 0.005));
    }
    E.setAmb(ambLevel(anchorFilm + (now - anchorCtx)), now);
    E.gc(now);
  }

  function start(filmT) {
    if (!ensure()) return false;
    if (ac.state !== 'running') ac.resume();
    E.killAll();
    anchorCtx = ac.currentTime + 0.08;
    anchorFilm = filmT;
    idx = SCORE.lastIdx(TIMES, filmT - 1e-6) + 1;
    // тянущиеся ноты, которые уже звучат в точке перемотки
    for (const e of EV) {
      if ((e.inst === 'bsn' || e.inst === 'choir') && e.t < filmT && e.t + e.dur > filmT + 0.12) {
        E.play(Object.assign({}, e, { dur: e.t + e.dur - filmT }), anchorCtx);
      }
    }
    E.ambStart(anchorCtx);
    E.ambNow(0);
    E.setAmb(ambLevel(filmT), anchorCtx);
    playing = true;
    clearInterval(timer);
    timer = setInterval(tick, 25);
    tick();
    return true;
  }
  function stop() {
    playing = false;
    clearInterval(timer);
    if (E) E.killAll();
  }
  // Время фильма по звуковым часам с поправкой на задержку вывода —
  // картинка совпадает с тем, что слышно, даже в беспроводных наушниках.
  function filmTime() {
    let ctxNow = ac.currentTime;
    if (ac.getOutputTimestamp) {
      const ts = ac.getOutputTimestamp();
      if (ts && ts.contextTime > 0 && ts.performanceTime > 0) ctxNow = ts.contextTime + (performance.now() - ts.performanceTime) / 1000;
      else ctxNow -= (ac.outputLatency || ac.baseLatency || 0);
    } else ctxNow -= (ac.outputLatency || ac.baseLatency || 0);
    return anchorFilm + (ctxNow - anchorCtx);
  }
  function setVolume(v) { vol = v; if (E) E.master.gain.setTargetAtTime(0.78 * v, ac.currentTime, 0.05); }

  /* ---------- Офлайн-рендер для проверки уровней ------------------------ */
  async function analyze(t0, t1) {
    const sr = 22050, OC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const oc = new OC(2, Math.ceil((t1 - t0 + 1) * sr), sr);
    const e = Engine(oc);
    e.warm(pizzNotes);
    for (const ev of EV) if (ev.t >= t0 - 0.5 && ev.t < t1) { const w = ev.t - t0; if (w >= 0) e.play(ev, w); }
    e.ambStart(0); e.setAmb(0.5, 0);
    const buf = await oc.startRendering();
    const d0 = buf.getChannelData(0), d1 = buf.getChannelData(1);
    let peak = 0; const rms = [];
    for (let s = 0; s < d0.length; s += sr) {
      let acc = 0, n = 0;
      for (let i = s; i < Math.min(s + sr, d0.length); i++) { const x = (d0[i] + d1[i]) * 0.5; acc += x * x; n++; peak = Math.max(peak, Math.abs(d0[i]), Math.abs(d1[i])); }
      rms.push(+(20 * Math.log10(Math.sqrt(acc / n) + 1e-9)).toFixed(1));
    }
    return { peak: +peak.toFixed(3), rmsDb: rms };
  }

  // состояние для проверки: часы контекста, сколько нот уже ушло в расписание, сколько голосов звучит
  function stat() {
    return { state: ac ? ac.state : 'none', ctxTime: ac ? +ac.currentTime.toFixed(2) : 0, scheduled: idx, total: EV.length, voices: E ? E.voices.size : 0, film: ac && playing ? +filmTime().toFixed(2) : null };
  }

  return {
    start, stop, filmTime, setVolume, analyze, stat,
    get on() { return playing; },
    get ready() { return !!ac; },
    get running() { return !!ac && ac.state === 'running'; },
  };
})();
