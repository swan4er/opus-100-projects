/* ================================================================
   Штурман · звук
   Мотор (две пилы через мягкое ограничение и фильтр, частота от оборотов),
   хруст гравия (полосовой шум от скорости и заноса), ветер, удары, посадки,
   сигналы старта. Включается только после жеста пользователя.
   ================================================================ */
(function (R) {
  'use strict';
  const A = {
    ctx: null, on: false, master: null, nodes: null,
    unlock() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      try { this.ctx = new AC(); } catch { return; }
      this.build();
      this.on = true;
      this.master.gain.setTargetAtTime(0.42, this.ctx.currentTime, 0.4);
      const b = document.getElementById('btnSound'); b && b.classList.remove('is-off');
    },
    toggle() {
      if (!this.ctx) { this.unlock(); return this.on; }
      this.on = !this.on;
      this.master.gain.setTargetAtTime(this.on ? 0.42 : 0, this.ctx.currentTime, 0.15);
      return this.on;
    },
    build() {
      const c = this.ctx;
      const master = c.createGain(); master.gain.value = 0;
      const comp = c.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4;
      master.connect(comp).connect(c.destination);
      this.master = master;
      // шумовой буфер
      const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = last * 0.6 + w * 0.4; d[i] = last; }
      this.noiseBuf = buf;
      const noise = () => { const s = c.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; };
      // мотор
      const o1 = c.createOscillator(); o1.type = 'sawtooth';
      const o2 = c.createOscillator(); o2.type = 'square';
      const o3 = c.createOscillator(); o3.type = 'sawtooth';
      const mix = c.createGain(); mix.gain.value = 0.3;
      const g2 = c.createGain(); g2.gain.value = 0.5; const g3 = c.createGain(); g3.gain.value = 0.25;
      o1.connect(mix); o2.connect(g2).connect(mix); o3.connect(g3).connect(mix);
      const shaper = c.createWaveShaper();
      const curve = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 2.2); }
      shaper.curve = curve;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600; lp.Q.value = 2.5;
      const eg = c.createGain(); eg.gain.value = 0.0;
      mix.connect(shaper).connect(lp).connect(eg).connect(master);
      o1.start(); o2.start(); o3.start();
      // гравий
      const gn = noise(); const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.7;
      const gg = c.createGain(); gg.gain.value = 0; gn.connect(bp).connect(gg).connect(master);
      // ветер
      const wn = noise(); const wl = c.createBiquadFilter(); wl.type = 'lowpass'; wl.frequency.value = 380;
      const wg = c.createGain(); wg.gain.value = 0; wn.connect(wl).connect(wg).connect(master);
      this.nodes = { o1, o2, o3, lp, eg, bp, gg, wg };
    },
    update(car, dt, state) {
      if (!this.ctx || !this.nodes) return;
      const n = this.nodes, t = this.ctx.currentTime;
      const running = state === 'run' || state === 'countdown' || state === 'finish';
      const rpm = car.rpm, f = 22 + rpm / 60 * 1.02;
      n.o1.frequency.setTargetAtTime(f, t, 0.03);
      n.o2.frequency.setTargetAtTime(f * 0.5, t, 0.03);
      n.o3.frequency.setTargetAtTime(f * 1.005 * 2, t, 0.03);
      const thr = R.G && R.G.state === 'run' ? (car._thr || 0) : 0.2;
      n.lp.frequency.setTargetAtTime(380 + rpm * 0.28 + thr * 900, t, 0.05);
      n.eg.gain.setTargetAtTime(running ? 0.22 + thr * 0.12 : 0.05, t, 0.08);
      const sp = car.speed, slide = Math.min(1, Math.abs(car.beta) * 2);
      const surf = car.surface === 'grass' ? 0.6 : 1;
      n.gg.gain.setTargetAtTime(car.air ? 0 : Math.min(0.5, sp / 45) * surf * 0.5 + slide * 0.35 * Math.min(1, sp / 10), t, 0.06);
      n.bp.frequency.setTargetAtTime(car.surface === 'grass' ? 700 : 1200 + slide * 900, t, 0.1);
      n.wg.gain.setTargetAtTime(Math.min(0.25, (sp / 45) ** 2 * 0.25), t, 0.2);
    },
    env(node, peak, a, d) {
      const t = this.ctx.currentTime;
      node.gain.setValueAtTime(0.0001, t);
      node.gain.exponentialRampToValueAtTime(peak, t + a);
      node.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    },
    beep(freq, dur) {
      if (!this.ctx || !this.on) return;
      const c = this.ctx, o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.value = freq; o.connect(g).connect(this.master);
      this.env(g, 0.5, 0.01, dur); o.start(); o.stop(c.currentTime + dur + 0.05);
    },
    hit(imp) {
      if (!this.ctx || !this.on) return;
      const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noiseBuf;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900 + imp * 60;
      const g = c.createGain(); s.connect(lp).connect(g).connect(this.master);
      this.env(g, Math.min(0.9, 0.2 + imp * 0.05), 0.005, 0.35); s.start(); s.stop(c.currentTime + 0.5);
      this.thump(Math.min(1, imp / 12));
    },
    land(imp) { if (this.ctx && this.on) this.thump(Math.min(1, imp / 9)); },
    thump(k) {
      const c = this.ctx, o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(90, c.currentTime); o.frequency.exponentialRampToValueAtTime(38, c.currentTime + 0.25);
      o.connect(g).connect(this.master); this.env(g, 0.2 + k * 0.6, 0.005, 0.3); o.start(); o.stop(c.currentTime + 0.4);
    },
  };
  R.Audio = A;
})(window.R);
