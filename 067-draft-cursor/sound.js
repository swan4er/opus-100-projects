/* 067 · Черновик — звук и музыка на Web Audio. Всё синтезируется: мягкое пианино с войлочными
   молоточками, механические клавиши, тиканье курсора, звон литер в куче, храп, шорохи.
   Реплики берутся из сценария (film.cues) и планируются вперёд по часам AudioContext. */
'use strict';

class Sound {
  constructor() {
    this.ctx = null;
    this.muted = true;
    this.playing = false;
    this.a0 = 0; this.b0 = 0;
    this.next = 0;
    this.voices = new Set();
    this.vol = 0.8;
  }

  async enable() {
    if (this.ctx) { if (this.ctx.state !== 'running') await this.ctx.resume().catch(() => {}); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 3; comp.attack.value = 0.008; comp.release.value = 0.25; comp.knee.value = 8;
    this.out.connect(comp).connect(ctx.destination);
    this.dry = ctx.createGain(); this.dry.gain.value = 1; this.dry.connect(this.out);
    this.rev = ctx.createConvolver();
    this.rev.buffer = this._impulse(2.8);
    this.revIn = ctx.createGain(); this.revIn.gain.value = 1;
    const wet = ctx.createGain(); wet.gain.value = 0.42;
    this.revIn.connect(this.rev).connect(wet).connect(this.out);
    this.noise = this._noiseBuf(2);
    // тишина комнаты в три часа ночи — не цифровой ноль
    const room = ctx.createBufferSource();
    room.buffer = this._brownBuf(4);
    room.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
    const rg = this.roomG = ctx.createGain(); rg.gain.value = 0;     // звучит, только пока идёт фильм
    room.connect(lp).connect(rg).connect(this.out);
    room.start();
    const waveP = [0, 1, 0.46, 0.2, 0.12, 0.06, 0.035, 0.02, 0.012];   // гармоники струны
    this.pianoWave = ctx.createPeriodicWave(new Float32Array(waveP.length), Float32Array.from(waveP));
    if (ctx.state !== 'running') await ctx.resume().catch(() => {});
  }

  _impulse(sec) {
    const ctx = this.ctx, n = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(2, n, ctx.sampleRate);
    const rnd = mulberry32(1234);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < n; i++) {
        const t = i / ctx.sampleRate;
        const early = t < 0.08 && rnd() < 0.004 ? (rnd() - 0.5) * 1.6 : 0;
        d[i] = ((rnd() * 2 - 1) * Math.exp(-t / 0.62) + early) * (t < 0.01 ? t / 0.01 : 1);
      }
    }
    return b;
  }
  _noiseBuf(sec) {
    const ctx = this.ctx, n = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = b.getChannelData(0), rnd = mulberry32(99);
    for (let i = 0; i < n; i++) d[i] = rnd() * 2 - 1;
    return b;
  }
  _brownBuf(sec) {
    const ctx = this.ctx, n = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = b.getChannelData(0), rnd = mulberry32(7);
    let v = 0;
    for (let i = 0; i < n; i++) { v = (v + (rnd() * 2 - 1) * 0.02) * 0.998; d[i] = v * 3; }
    return b;
  }

  // ——— управление
  setMuted(m) {
    this.muted = m;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setTargetAtTime(m ? 0 : this.vol, now, 0.05);
    if (m) this.stopAll();
  }
  // часы фильма по AudioContext; если аудиочасы стоят (нет устройства вывода) — null,
  // и плеер идёт по своим часам, а при оживлении звука заново привязывается к ним
  clock(tbWall) {
    if (!this.ctx || this.muted || !this.playing || this.ctx.state !== 'running') return null;
    const ct = this.ctx.currentTime, now = performance.now();
    if (ct !== this._lastCT) {
      this._lastCT = ct; this._lastWall = now;
      if (this._stalled) { this._stalled = false; this.seek(tbWall, true); return null; }
    } else if (now - this._lastWall > 250) { this._stalled = true; return null; }
    if (this._stalled) return null;
    return this.b0 + Math.max(0, ct - this.a0) / BEAT;
  }
  seek(tb, playing) {
    this.stopAll();
    this.playing = !!(playing && this.ctx && !this.muted);
    if (!this.ctx) return;
    this._room(this.playing);
    this.a0 = this.ctx.currentTime + 0.04;
    this.b0 = tb;
    this.next = -1;
    this._lastCT = -1; this._lastWall = performance.now(); this._stalled = false;
  }
  pause() { this.stopAll(); this.playing = false; this._room(false); }
  _room(on) {
    if (!this.roomG) return;
    const now = this.ctx.currentTime;
    this.roomG.gain.cancelScheduledValues(now);
    this.roomG.gain.setTargetAtTime(on ? 0.022 : 0, now, 0.2);
  }
  suspend() { if (this.ctx) { this.stopAll(); this.ctx.suspend().catch(() => {}); } }
  resume(tb, playing) {
    if (!this.ctx) return;
    this.ctx.resume().then(() => this.seek(tb, playing)).catch(() => {});
  }
  pump(F, tb) {
    if (!this.playing || !this.ctx) return;
    const cues = F.cues;
    if (this.next < 0) {
      let i = 0;
      while (i < cues.length && cues[i].b < this.b0 - 1e-6) i++;
      this.next = i;
    }
    const horizon = tb + 0.45 / BEAT;
    const now = this.ctx.currentTime;
    while (this.next < cues.length && cues[this.next].b <= horizon) {
      const c = cues[this.next++];
      let when = this.a0 + (c.b - this.b0) * BEAT;
      if (when < now - 0.08) continue;
      when = Math.max(when, now + 0.005);
      try { this.play(c, when); } catch (e) { /* звук не должен ронять фильм */ }
    }
  }
  stopAll() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const v of this.voices) {
      try {
        v.g.gain.cancelScheduledValues(now);
        v.g.gain.setTargetAtTime(0, now, 0.015);
        for (const s of v.src) s.stop(now + 0.08);
      } catch (e) { /* уже остановлен */ }
    }
    this.voices.clear();
  }

  // ——— голос: общий узел громкости + источники (чтобы можно было оборвать при перемотке)
  _voice(when, dur, pan = 0, send = 0.25) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    let node = g;
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); g.connect(p); node = p; }
    node.connect(this.dry);
    if (send > 0) { const s = ctx.createGain(); s.gain.value = send; node.connect(s).connect(this.revIn); }
    const v = { g, src: [], end: when + dur };
    this.voices.add(v);
    const self = this;
    setTimeout(() => self.voices.delete(v), (when + dur - ctx.currentTime + 0.5) * 1000);
    return v;
  }
  _osc(v, type, f, when, stop) {
    const o = this.ctx.createOscillator();
    if (type === 'piano') o.setPeriodicWave(this.pianoWave); else o.type = type;
    o.frequency.value = f;
    o.start(when); o.stop(stop);
    v.src.push(o);
    return o;
  }
  _noise(v, when, stop) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    s.loopStart = 0; s.loopEnd = this.noise.duration;
    const off = hash(Math.floor(when * 1000)) * (this.noise.duration - 0.5);
    s.start(when, off); s.stop(stop);
    v.src.push(s);
    return s;
  }
  _filter(type, f, q = 0.7) { const b = this.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }
  _env(when, peak, a, d) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(peak, when + a);
    g.gain.setTargetAtTime(0, when + a, d);
    return g;
  }

  // ——— инструменты
  piano(when, midi, vel, durB) {
    const ctx = this.ctx;
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    const dur = Math.max(0.12, durB * BEAT);
    const tail = 1.6;
    const v = this._voice(when, dur + tail, clamp((midi - 62) / 36, -0.6, 0.6), 0.34);
    const amp = vel * 0.34 * Math.pow(261 / f, 0.12);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(amp, when + 0.006);
    env.gain.setTargetAtTime(amp * 0.42, when + 0.006, 0.09);
    const tau = clamp(1.5 * Math.pow(196 / f, 0.45), 0.35, 2.6);
    env.gain.setTargetAtTime(0.0001, when + 0.12, tau);
    env.gain.setTargetAtTime(0, when + dur, 0.16);
    const lp = this._filter('lowpass', Math.min(9000, f * 6 + 2600 * vel), 0.6);
    lp.frequency.setTargetAtTime(Math.min(4000, f * 2.2 + 500), when + 0.01, 0.35);
    env.connect(lp).connect(v.g);
    [-2.5, 2.5].forEach((ct) => {
      const o = this._osc(v, 'piano', f, when, when + dur + tail);
      o.detune.value = ct;
      o.connect(env);
    });
    // войлочный удар молоточка
    const n = this._noise(v, when, when + 0.06);
    const bp = this._filter('bandpass', clamp(f * 3, 400, 4200), 1.2);
    const ng = this._env(when, vel * 0.05, 0.002, 0.012);
    n.connect(bp).connect(ng).connect(v.g);
  }

  key(when, kind, vel, p = 0.5) {
    const K = {
      key: [2300 + p * 1600, 0.13, 0.016, 175, 88, 0.035, 0.1],
      snore: [1500 + p * 900, 0.08, 0.012, 160, 90, 0.02, 0.05],
      domino: [2800 + p * 1200, 0.07, 0.01, 220, 120, 0.02, 0.05],
      back: [3000 + p * 800, 0.13, 0.014, 190, 100, 0.03, 0.1],
      space: [950, 0.14, 0.03, 118, 58, 0.06, 0.18],
      enter: [1300, 0.2, 0.034, 110, 52, 0.08, 0.25],
      heavy: [1100 + p * 400, 0.18, 0.03, 96, 44, 0.1, 0.3],
      stamp: [700, 0.2, 0.03, 74, 38, 0.13, 0.36],
    }[kind] || [2400, 0.12, 0.016, 170, 85, 0.03, 0.1];
    const [bf, ng, nd, f0, f1, td, tg] = K;
    const v = this._voice(when, 0.4, (p - 0.5) * 0.5, kind === 'heavy' || kind === 'stamp' ? 0.18 : 0.06);
    const n = this._noise(v, when, when + 0.12);
    const bp = this._filter('bandpass', bf, 1.4);
    const e = this._env(when, ng * vel, 0.001, nd);
    n.connect(bp).connect(e).connect(v.g);
    const o = this._osc(v, 'sine', f0, when, when + td * 5);
    o.frequency.setValueAtTime(f0, when);
    o.frequency.exponentialRampToValueAtTime(f1, when + td);
    const oe = this._env(when, tg * vel, 0.002, td * 0.7);
    o.connect(oe).connect(v.g);
  }

  tick(when, vel) {
    const v = this._voice(when, 0.2, 0.15, 0.12);
    const o = this._osc(v, 'sine', 2900, when, when + 0.08);
    const e = this._env(when, 0.05 * vel, 0.001, 0.008);
    o.connect(e).connect(v.g);
    const n = this._noise(v, when, when + 0.04);
    const hp = this._filter('highpass', 5000, 0.7);
    const ne = this._env(when, 0.035 * vel, 0.0005, 0.004);
    n.connect(hp).connect(ne).connect(v.g);
  }

  clink(when, vel, p = 0.5, pan = 0) {
    const f0 = 1700 + p * 1600;
    const v = this._voice(when, 0.5, pan * 0.8, 0.3);
    [[1, 1, 0.12], [2.76, 0.5, 0.07], [5.4, 0.28, 0.04]].forEach(([r, a, d]) => {
      const o = this._osc(v, 'sine', f0 * r, when, when + 0.45);
      const e = this._env(when, 0.05 * vel * a, 0.001, d);
      o.connect(e).connect(v.g);
    });
  }

  thud(when, vel) {
    const v = this._voice(when, 0.9, 0, 0.2);
    const o = this._osc(v, 'sine', 95, when, when + 0.8);
    o.frequency.setValueAtTime(95, when);
    o.frequency.exponentialRampToValueAtTime(36, when + 0.22);
    const e = this._env(when, 0.55 * vel, 0.003, 0.16);
    o.connect(e).connect(v.g);
    const n = this._noise(v, when, when + 0.2);
    const lp = this._filter('lowpass', 420, 0.8);
    const ne = this._env(when, 0.28 * vel, 0.002, 0.04);
    n.connect(lp).connect(ne).connect(v.g);
  }

  sweep(when, dur, f0, f1, peak, q = 1.2, send = 0.4, type = 'bandpass') {
    const v = this._voice(when, dur + 0.6, 0, send);
    const n = this._noise(v, when, when + dur + 0.3);
    const bp = this._filter(type, f0, q);
    bp.frequency.setValueAtTime(f0, when);
    bp.frequency.exponentialRampToValueAtTime(f1, when + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(peak, when + dur * 0.45);
    g.gain.linearRampToValueAtTime(0, when + dur);
    n.connect(bp).connect(g).connect(v.g);
    return v;
  }

  play(c, when) {
    const v = c.v ?? 0.5;
    switch (c.type) {
      case 'note': this.piano(when, c.n, v, c.d ?? 1); break;
      case 'chord': c.n.forEach((n, i) => this.piano(when + i * 0.006, n, v * (i === 0 ? 1 : 0.8), c.d ?? 1)); break;
      case 'roll': c.n.forEach((n, i) => this.piano(when + i * (c.s ?? 0.1) * BEAT, n, v, (c.d ?? 1) - i * (c.s ?? 0.1))); break;
      case 'key': this.key(when, c.kind || 'key', v, c.p ?? 0.5); break;
      case 'tick': this.tick(when, v); break;
      case 'clink': this.clink(when, v, c.p ?? 0.5, c.pan ?? 0); break;
      case 'thud': this.thud(when, v); break;
      case 'drop': this.key(when, 'domino', v * 1.4, 0.3); this.clink(when + 0.01, v * 0.6, 0.2); break;
      case 'hop': this.sweep(when, 0.12, 600, 1800, 0.03 * v, 1.5, 0.1); break;
      case 'plink': {
        const vv = this._voice(when, 0.6, 0.4, 0.3);
        const o = this._osc(vv, 'sine', 900, when, when + 0.5);
        o.frequency.setValueAtTime(900, when);
        o.frequency.exponentialRampToValueAtTime(2300, when + 0.12);
        const e = this._env(when, 0.12 * v, 0.002, 0.07);
        o.connect(e).connect(vv.g);
        this.sweep(when, 0.25, 900, 4000, 0.05 * v, 1, 0.2);
        break;
      }
      case 'murmur': for (let i = 0; i < 9; i++) this.key(when + i * 0.045 + hash(i) * 0.02, 'domino', v * 0.4, hash(i + 3)); break;
      case 'pff': {
        this.sweep(when, 0.7, 2400, 180, 0.12 * v, 0.8, 0.2, 'lowpass');
        const vv = this._voice(when, 0.9, 0, 0.2);
        const o = this._osc(vv, 'triangle', 320, when, when + 0.8);
        o.frequency.setValueAtTime(320, when);
        o.frequency.exponentialRampToValueAtTime(70, when + 0.6);
        const e = this._env(when, 0.06 * v, 0.02, 0.2);
        o.connect(e).connect(vv.g);
        break;
      }
      case 'swipe': this.sweep(when, 0.3, 700, 3600, 0.05 * v, 1, 0.2); break;
      case 'whoosh': this.sweep(when, 1.4, 260, 2800, 0.14 * v, 0.9, 0.7); break;
      case 'wake': {
        const vv = this._voice(when, 4, 0, 0.5);
        [55, 110.3, 165.2].forEach((f, i) => {
          const o = this._osc(vv, 'sine', f, when, when + 3.8);
          const g = this.ctx.createGain();
          g.gain.setValueAtTime(0, when);
          g.gain.linearRampToValueAtTime(0.05 * v / (i + 1), when + 1.2);
          g.gain.setTargetAtTime(0, when + 1.4, 0.6);
          o.connect(g).connect(vv.g);
        });
        break;
      }
      case 'fog': {
        const dur = (c.d ?? 4) * BEAT;
        this.sweep(when, dur, c.rise ? 400 : 900, c.rise ? 3200 : 600, 0.07 * v, 0.6, 0.8);
        break;
      }
      case 'gliss': {
        const d = (c.d ?? 1.5) * BEAT;
        const white = [0, 2, 4, 5, 7, 9, 11];
        const notes = [];
        const lo = Math.min(c.from, c.to), hi = Math.max(c.from, c.to);
        for (let m = lo; m <= hi; m++) if (white.includes(((m % 12) + 12) % 12)) notes.push(m);
        if (c.from > c.to) notes.reverse();
        notes.forEach((m, i) => this.piano(when + (i / notes.length) * d, m, v * (0.7 + 0.3 * Math.sin(Math.PI * i / notes.length)), 0.5));
        break;
      }
      case 'snore': {
        const dur = (c.d ?? 1) * BEAT;
        const vv = this._voice(when, dur + 0.4, -0.1, 0.15);
        const n = this._noise(vv, when, when + dur + 0.2);
        const lp = this._filter('lowpass', 520, 2);
        const am = this.ctx.createGain();
        am.gain.value = 0.5;
        const lfo = this._osc(vv, 'square', 27, when, when + dur + 0.2);
        const lg = this.ctx.createGain(); lg.gain.value = 0.5;
        lfo.connect(lg).connect(am.gain);
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0, when);
        g.gain.linearRampToValueAtTime(0.3 * v, when + dur * 0.6);
        g.gain.linearRampToValueAtTime(0, when + dur);
        n.connect(lp).connect(am).connect(g).connect(vv.g);
        const o = this._osc(vv, 'sawtooth', 68, when, when + dur + 0.2);
        const olp = this._filter('lowpass', 300, 1);
        const og = this.ctx.createGain();
        og.gain.setValueAtTime(0, when);
        og.gain.linearRampToValueAtTime(0.05 * v, when + dur * 0.6);
        og.gain.linearRampToValueAtTime(0, when + dur);
        o.connect(olp).connect(og).connect(am);
        break;
      }
      case 'boing': {
        const vv = this._voice(when, 1, 0, 0.3);
        const o = this._osc(vv, 'sine', 300, when, when + 0.9);
        const lfo = this._osc(vv, 'sine', 13, when, when + 0.9);
        const lg = this.ctx.createGain();
        lg.gain.setValueAtTime(140, when);
        lg.gain.setTargetAtTime(0, when, 0.2);
        lfo.connect(lg).connect(o.frequency);
        const e = this._env(when, 0.1 * v, 0.004, 0.22);
        o.connect(e).connect(vv.g);
        break;
      }
      case 'ding': {
        const f = 440 * Math.pow(2, ((c.n ?? 81) - 69) / 12);
        const vv = this._voice(when, 4.5, 0.2, 0.6);
        [[1, 1, 1.6], [2.0, 0.35, 0.8], [3.01, 0.16, 0.4], [4.2, 0.06, 0.25]].forEach(([r, a, d]) => {
          const o = this._osc(vv, 'sine', f * r, when, when + 4.2);
          const e = this._env(when, 0.12 * v * a, 0.004, d);
          o.connect(e).connect(vv.g);
        });
        break;
      }
      default: break;
    }
  }
}
