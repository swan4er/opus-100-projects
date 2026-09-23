/* ================================================================
   music.js — звук фильма на Web Audio.
   При загрузке фильма строится «партитура»: музыка по настроению
   каждой сцены (гармония, бас, мелодия, ударные), голоса-бормоталки
   персонажей под реплики и шумы действий. Всё привязано ко времени
   фильма t, поэтому перемотка и пауза работают точно.
   ================================================================ */
(function () {
  'use strict';
  const MAJOR = [0, 2, 4, 5, 7, 9, 11], MINOR = [0, 2, 3, 5, 7, 8, 10], DORIAN = [0, 2, 3, 5, 7, 9, 10];
  // prog — ступени лада для аккордов по тактам; lead/bass/drums — тембры и рисунки
  const MOODS = {
    happy:    { bpm: 116, root: 60, scale: MAJOR, prog: [0, 4, 5, 3], lead: 'pluck', bass: 'bounce', drums: 'pop', dens: 0.62 },
    romantic: { bpm: 70, root: 65, scale: MAJOR, prog: [0, 5, 3, 4], lead: 'bell', bass: 'soft', drums: 'none', pad: true, dens: 0.4 },
    sad:      { bpm: 62, root: 57, scale: MINOR, prog: [0, 5, 2, 6], lead: 'soft', bass: 'soft', drums: 'none', pad: true, dens: 0.34 },
    tense:    { bpm: 104, root: 50, scale: MINOR, prog: [0, 0, 5, 4], lead: 'pizz', bass: 'pulse', drums: 'tick', dens: 0.5 },
    chase:    { bpm: 152, root: 52, scale: MINOR, prog: [0, 6, 5, 6], lead: 'square', bass: 'gallop', drums: 'drive', dens: 0.78 },
    mystery:  { bpm: 78, root: 59, scale: DORIAN, prog: [0, 3, 0, 4], lead: 'glass', bass: 'soft', drums: 'brush', pad: true, dens: 0.38 },
    epic:     { bpm: 92, root: 48, scale: MINOR, prog: [0, 5, 2, 6], lead: 'brass', bass: 'big', drums: 'timp', pad: true, dens: 0.5 },
    silly:    { bpm: 132, root: 55, scale: MAJOR, prog: [0, 4, 0, 4], lead: 'bassoon', bass: 'oompah', drums: 'pop', dens: 0.6 },
    calm:     { bpm: 74, root: 62, scale: MAJOR, prog: [0, 3, 0, 4], lead: 'soft', bass: 'soft', drums: 'none', pad: true, dens: 0.36 },
  };
  const VOICE = { cat: 'triangle', dog: 'square', robot: 'square', girl: 'triangle', boy: 'triangle', oldman: 'sawtooth', grandma: 'triangle', bird: 'sine', moon: 'sine', sun: 'triangle', mouse: 'triangle', bear: 'sawtooth', ghost: 'sine', alien: 'square' };
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  function rng(seed) { let s = (seed >>> 0) || 7; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; }

  // ---------- партитура ----------
  function buildScore(film) {
    const ev = [];
    const push = (e) => ev.push(e);
    film.scenes.forEach((S, si) => {
      const m = MOODS[S.mood] || MOODS.happy;
      const r = rng(film.seed + si * 977);
      const step = 60 / m.bpm / 2;                 // восьмая
      const t0 = S.t0 + 0.15, t1 = S.t1 - 0.12;
      const deg = (d, oct) => { const n = m.scale.length; const o = Math.floor(d / n); return m.root + m.scale[((d % n) + n) % n] + 12 * (o + (oct || 0)); };
      // мелодия: мотив из 8 восьмых, повторяется с вариацией
      const motif = [];
      let cur = 4;
      for (let k = 0; k < 8; k++) { cur = Math.max(0, Math.min(9, cur + Math.round((r() - 0.5) * 4))); motif.push(r() < m.dens ? cur : null); }
      motif[0] = motif[0] == null ? 4 : motif[0];
      const last = si === film.scenes.length - 1;
      for (let k = 0; ; k++) {
        const t = t0 + k * step;
        if (t >= t1) break;
        const bar = Math.floor(k / 8), b = k % 8;
        const chord = m.prog[bar % m.prog.length];
        const triad = [deg(chord, -1), deg(chord + 2, -1), deg(chord + 4, -1)];
        // гармония
        if (b === 0) {
          if (m.pad) push({ t, type: 'pad', notes: triad, dur: step * 8 });
          else push({ t, type: 'chord', notes: triad, dur: step * 1.5 });
        } else if (!m.pad && (b === 4 || (m.bass === 'oompah' && b % 2 === 1))) push({ t, type: 'chord', notes: triad, dur: step * 0.9, vel: 0.7 });
        // бас
        const bassN = deg(chord, -2);
        if (m.bass === 'soft' && (b === 0 || b === 4)) push({ t, type: 'bass', n: bassN, dur: step * 3.5 });
        else if (m.bass === 'bounce' && b % 2 === 0) push({ t, type: 'bass', n: b === 4 ? bassN + 7 : bassN, dur: step * 0.9 });
        else if (m.bass === 'oompah' && b % 2 === 0) push({ t, type: 'bass', n: b % 4 === 0 ? bassN : bassN + 7, dur: step * 0.8 });
        else if (m.bass === 'pulse') push({ t, type: 'bass', n: bassN, dur: step * 0.6, vel: b % 2 ? 0.5 : 0.85 });
        else if (m.bass === 'gallop') push({ t, type: 'bass', n: b % 4 === 3 ? bassN + 12 : bassN, dur: step * 0.5 });
        else if (m.bass === 'big' && b === 0) push({ t, type: 'bass', n: bassN, dur: step * 7 });
        // мелодия (со второго такта, чтобы сцена «вдохнула»)
        if (bar >= 1) {
          const mv = motif[b];
          if (mv != null && !(bar % 4 === 3 && b > 4)) {
            const shift = bar % 2 === 1 && b >= 4 ? 1 : 0;
            push({ t, type: 'lead', inst: m.lead, n: deg(mv + chord % 3 + shift, 0), dur: step * (m.lead === 'bell' || m.lead === 'glass' || m.lead === 'soft' ? 2.2 : 0.9) });
          }
        }
        // ударные
        if (m.drums === 'pop') { if (b % 4 === 0) push({ t, type: 'kick' }); if (b % 4 === 2) push({ t, type: 'snare', vel: 0.6 }); if (b % 2 === 1) push({ t, type: 'hat', vel: 0.5 }); }
        else if (m.drums === 'drive') { if (b % 2 === 0) push({ t, type: 'kick' }); if (b % 4 === 2) push({ t, type: 'snare' }); push({ t, type: 'hat', vel: 0.45 }); }
        else if (m.drums === 'tick') { push({ t, type: 'tick', vel: b % 2 ? 0.4 : 0.8 }); if (b === 0) push({ t, type: 'kick', vel: 0.6 }); }
        else if (m.drums === 'brush' && b % 2 === 1) push({ t, type: 'hat', vel: 0.25 });
        else if (m.drums === 'timp' && (b === 0 || b === 6)) push({ t, type: 'timp' });
      }
      if (last) push({ t: film.duration - 1.9, type: 'tada', root: m.root, minor: m.scale === MINOR });
      // переход между сценами — лёгкий «вжух»
      if (si > 0) push({ t: S.t0, type: 'whoosh' });
    });
    // голоса и шумы действий
    for (const e of film.events) {
      const c = film.cast[e.who];
      const kind = c ? c.kind : 'boy', base = c ? c.def.voice : 400;
      const r = rng((film.seed ^ Math.round(e.t * 1000)) >>> 0);
      if (e.type === 'say' || e.type === 'sing' || e.type === 'laugh' || e.type === 'cry') {
        const sing = e.type === 'sing';
        const dur = e.type === 'say' || sing ? (e.dur || 2) * 0.72 : e.dur || 1.8;
        const gap = e.type === 'laugh' ? 0.13 : sing ? 0.22 : 0.095;
        const text = e.text || '';
        const q = /\?\s*$/.test(text), ex = /!\s*$/.test(text);
        const n = Math.max(3, Math.floor(dur / gap));
        const scaleSteps = [0, 2, 4, 7, 9, 12];
        for (let k = 0; k < n; k++) {
          if (!sing && r() < 0.12 && e.type === 'say') continue;
          let f = base * (0.88 + r() * 0.3);
          if (sing) f = base * Math.pow(2, scaleSteps[Math.floor(r() * scaleSteps.length)] / 12);
          if (e.type === 'laugh') f = base * (e.evil ? 0.7 : 1.1) * (1 - (k % 2) * 0.1);
          if (e.type === 'cry') f = base * (1.15 - k / n * 0.3);
          if (k === n - 1 && q) f *= 1.3;
          if (k === n - 1 && ex) f *= 1.15;
          push({ t: e.t + k * gap + r() * 0.02, type: 'syl', f, wave: VOICE[kind] || 'triangle', robot: kind === 'robot', dur: sing ? 0.2 : e.type === 'cry' ? 0.14 : 0.075, bird: kind === 'bird' });
        }
      } else push({ t: e.t, type: 'sfx', name: e.type, e: e.e, f: base });
    }
    ev.sort((a, b) => a.t - b.t);
    return ev;
  }

  // ---------- синтез ----------
  let ac = null, master = null, bus = null, noiseBuf = null;
  function ensure() {
    if (ac) return ac;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4;
    master = ac.createGain(); master.gain.value = 0.55;
    master.connect(comp); comp.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    newBus();
    return ac;
  }
  function newBus() {
    if (bus) { const old = bus; try { old.gain.setTargetAtTime(0, ac.currentTime, 0.02); } catch (e) { /* узел уже отключён */ } setTimeout(() => { try { old.disconnect(); } catch (e) { /* уже отключён */ } }, 300); }
    bus = ac.createGain(); bus.gain.value = 1; bus.connect(master);
  }
  function env(g, when, a, peak, dur) {
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(peak, when + a);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  }
  function osc(type, f, when, dur, peak, opt) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, when);
    if (opt && opt.to) o.frequency.exponentialRampToValueAtTime(opt.to, when + (opt.glide || dur));
    if (opt && opt.detune) o.detune.value = opt.detune;
    let node = o;
    if (opt && opt.lp) { const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = opt.lp; fl.Q.value = opt.q || 0.7; o.connect(fl); node = fl; }
    if (opt && opt.bp) { const fl = ac.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = opt.bp; fl.Q.value = opt.q || 2; node.connect(fl); node = fl; }
    node.connect(g); g.connect(bus);
    env(g, when, (opt && opt.a) || 0.008, peak, dur);
    o.start(when); o.stop(when + dur + 0.05);
    return o;
  }
  function noise(when, dur, peak, type, freq, q) {
    const s = ac.createBufferSource(); s.buffer = noiseBuf;
    const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q || 1;
    const g = ac.createGain();
    s.connect(f); f.connect(g); g.connect(bus);
    env(g, when, 0.004, peak, dur);
    s.start(when, Math.random() * 0.5); s.stop(when + dur + 0.05);
  }
  function play(e, when) {
    const v = e.vel == null ? 1 : e.vel;
    switch (e.type) {
      case 'pad':
        for (const n of e.notes) { osc('sawtooth', mtof(n), when, e.dur, 0.028, { a: 0.35, lp: 900, detune: -7 }); osc('sawtooth', mtof(n), when, e.dur, 0.028, { a: 0.35, lp: 900, detune: 7 }); }
        break;
      case 'chord':
        for (const n of e.notes) osc('triangle', mtof(n + 12), when, e.dur, 0.045 * v, { lp: 1800 });
        break;
      case 'bass':
        osc('triangle', mtof(e.n), when, e.dur, 0.16 * v, { lp: 600 });
        break;
      case 'lead': {
        const f = mtof(e.n + 12);
        if (e.inst === 'bell' || e.inst === 'glass') { osc('sine', f, when, e.dur * 1.6, 0.07); osc('sine', f * 2.76, when, e.dur * 0.6, e.inst === 'glass' ? 0.03 : 0.018); }
        else if (e.inst === 'pluck') osc('triangle', f, when, 0.35, 0.09, { lp: 2600 });
        else if (e.inst === 'pizz') osc('triangle', f * 0.5, when, 0.18, 0.12, { lp: 1400 });
        else if (e.inst === 'square') osc('square', f * 0.5, when, e.dur, 0.035, { lp: 1900 });
        else if (e.inst === 'bassoon') osc('sawtooth', f * 0.5, when, 0.22, 0.07, { lp: 750, q: 3 });
        else if (e.inst === 'brass') osc('sawtooth', f * 0.5, when, e.dur, 0.05, { lp: 1200, a: 0.06 });
        else osc('sine', f, when, e.dur, 0.07, { a: 0.05 });
        break;
      }
      case 'kick': osc('sine', 140, when, 0.2, 0.32 * v, { to: 45, glide: 0.15 }); break;
      case 'snare': noise(when, 0.14, 0.12 * v, 'bandpass', 1800, 0.8); osc('triangle', 190, when, 0.08, 0.05 * v); break;
      case 'hat': noise(when, 0.04, 0.05 * v, 'highpass', 7000); break;
      case 'tick': noise(when, 0.02, 0.06 * v, 'highpass', 4000); break;
      case 'timp': osc('sine', 98, when, 0.7, 0.22, { to: 82, glide: 0.5 }); noise(when, 0.1, 0.05, 'lowpass', 400); break;
      case 'tada': {
        const r = e.root, third = e.minor ? 3 : 4;
        [0, third, 7, 12].forEach((iv, k) => { osc('triangle', mtof(r + iv), when + k * 0.09, 1.4 - k * 0.1, 0.08, { lp: 2400 }); osc('sine', mtof(r + iv + 12), when + k * 0.09, 1.2, 0.04); });
        break;
      }
      case 'whoosh': noise(when, 0.35, 0.05, 'bandpass', 900, 0.6); break;
      case 'syl': {
        if (e.bird) { osc('sine', e.f * 1.4, when, 0.06, 0.05, { to: e.f * 2.1, glide: 0.05 }); break; }
        const o = osc(e.wave, e.f, when, e.dur, e.robot ? 0.035 : 0.06, { to: e.f * (0.86 + Math.random() * 0.3), glide: e.dur, lp: e.wave === 'sine' ? 0 : 2200, bp: e.f * 2.2, q: 1.2 });
        if (e.robot) { const m = ac.createOscillator(), mg = ac.createGain(); m.frequency.value = 55; mg.gain.value = e.f * 0.3; m.connect(mg); mg.connect(o.frequency); m.start(when); m.stop(when + e.dur + 0.05); }
        break;
      }
      case 'sfx': sfx(e, when); break;
    }
  }
  function sfx(e, when) {
    switch (e.name) {
      case 'step': noise(when, 0.05, 0.035, 'lowpass', 700); break;
      case 'jump': osc('triangle', 260, when, 0.22, 0.09, { to: 780, glide: 0.18 }); break;
      case 'land': osc('sine', 120, when, 0.16, 0.2, { to: 50, glide: 0.12 }); noise(when, 0.08, 0.05, 'lowpass', 500); break;
      case 'slip': osc('sine', 1300, when, 0.4, 0.07, { to: 260, glide: 0.38 }); break;
      case 'bonk': osc('square', 220, when, 0.12, 0.08, { to: 90, glide: 0.1, lp: 1200 }); noise(when, 0.06, 0.08, 'bandpass', 2400, 3); break;
      case 'whack': noise(when, 0.12, 0.16, 'bandpass', 1100, 0.9); osc('sine', 160, when, 0.14, 0.18, { to: 60, glide: 0.1 }); break;
      case 'hug': [0, 4, 7].forEach((iv, k) => osc('sine', mtof(76 + iv), when + k * 0.08, 0.7, 0.05)); break;
      case 'take': osc('sine', 880, when, 0.12, 0.07, { to: 1320, glide: 0.08 }); break;
      case 'give': osc('sine', 1320, when, 0.5, 0.06); osc('sine', 1760, when + 0.08, 0.5, 0.04); break;
      case 'pop': osc('sine', 400, when, 0.16, 0.08, { to: 1600, glide: 0.12 }); noise(when, 0.12, 0.05, 'highpass', 2500); break;
      case 'flap': for (let k = 0; k < 3; k++) noise(when + k * 0.09, 0.05, 0.03, 'bandpass', 1400, 1.5); break;
      case 'snore': osc('sawtooth', 90, when, 0.9, 0.03, { a: 0.3, lp: 300 }); break;
      case 'shiver': for (let k = 0; k < 8; k++) osc('triangle', 700 + (k % 2) * 90, when + k * 0.06, 0.05, 0.025); break;
      case 'emo':
        if (e.e === 'love') { osc('sine', 880, when, 0.3, 0.05); osc('sine', 1318, when + 0.12, 0.45, 0.05); }
        else if (e.e === 'surprised') osc('triangle', 330, when, 0.25, 0.07, { to: 990, glide: 0.2 });
        else if (e.e === 'angry') osc('sawtooth', 95, when, 0.35, 0.05, { lp: 500 });
        else if (e.e === 'sad') { osc('sine', 660, when, 0.3, 0.04); osc('sine', 555, when + 0.2, 0.5, 0.04); }
        else if (e.e === 'scared') for (let k = 0; k < 5; k++) osc('sine', 1200 + k * 80, when + k * 0.04, 0.05, 0.02);
        else if (e.e === 'happy') [0, 4, 7, 12].forEach((iv, k) => osc('sine', mtof(79 + iv), when + k * 0.05, 0.2, 0.03));
        break;
    }
  }

  // ---------- планировщик ----------
  let score = [], idx = 0, scheduled = 0, running = false, anchor = 0, filmAt = 0;
  const LOOK = 0.25;
  function load(film) { score = buildScore(film); idx = 0; if (running) stop(); }
  function locate(t) { idx = 0; while (idx < score.length && score[idx].t < t) idx++; scheduled = t; }
  function play_(t) {
    if (!ensure() || !score.length) return;
    if (ac.state === 'suspended') ac.resume();
    newBus();
    running = true; locate(t);
    anchor = ac.currentTime + 0.05; filmAt = t;
    tick(t);
  }
  function tick(t) {
    if (!running || !ac) return;
    // привязка: сколько секунд фильма прошло ↔ время звуковой карты
    const now = ac.currentTime;
    const expected = anchor + (t - filmAt);
    if (Math.abs(expected - now) > 0.12) { anchor = now; filmAt = t; }
    const until = t + LOOK;
    while (idx < score.length && score[idx].t < until) {
      const e = score[idx++];
      const when = anchor + (e.t - filmAt);
      if (when >= now - 0.02) { try { play(e, Math.max(now, when)); } catch (err) { /* пропускаем ноту */ } }
    }
    scheduled = until;
  }
  function stop() { running = false; if (ac && bus) newBus(); }
  window.Music = {
    load,
    async unlock() { if (!ensure()) return; try { await ac.resume(); } catch (e) { /* браузер не дал звук */ } },
    play: play_,
    stop,
    seek(t, keep) { if (keep) play_(t); else { stop(); locate(t); } },
    tick,
    get enabled() { return !!ac; },
  };
})();
