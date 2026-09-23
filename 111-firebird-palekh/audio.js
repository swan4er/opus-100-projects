'use strict';
/* ==========================================================================
   Звук «Пера Жар-птицы». Всё синтезируется на Web Audio, без аудиофайлов.
   Гусли — струна Карплуса — Стронга, свирель — осциллятор с дыханием,
   форшлагами и вибрато, колокольчики — негармонические парциалы.
   Партитура — список событий по времени фильма (такт 2/4 = 1,25 с, 96 ударов
   в минуту — тот же темп, что у монтажа). Планировщик ставит события
   с упреждением от часов AudioContext; часы звука ведут картинку, поэтому
   после паузы и перемотки музыка и шумы снова совпадают с действием.
   ========================================================================== */
const Sound = (() => {
  const BEAT = 0.625, E8 = BEAT / 2, S16 = BEAT / 4, BAR = 1.25;
  const LOOK = 0.4;          // упреждение планировщика, с
  const VOL = 0.85;          // общая громкость: умеренная
  let ac = null, master = null, verb = null, noiseBuf = null, flutePW = null;
  let run = null, muted = false, timer = 0, runs = 0, probe = null;
  const KS = new Map();       // буферы струн по высоте
  const EV = [];              // партитура: { t, d, late, f(out, when), m — высота струны }
  const WARM = [];            // струны, которые ещё надо рассчитать

  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const G = (v = 0) => { const g = ac.createGain(); g.gain.value = v; return g; };
  const bq = (type, f, q = 0.7) => { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  function pan(node, p) {
    if (!ac.createStereoPanner) return node;
    const s = ac.createStereoPanner(); s.pan.value = clamp(p, -1, 1);
    node.connect(s); return s;
  }
  /* выход голоса: сухой сигнал и посыл в реверберацию */
  function route(node, o, wet = 0.3) {
    node.connect(o.bus);
    if (wet > 0) { const s = G(wet); node.connect(s); s.connect(o.wet); }
  }
  function noise(when, dur) {
    const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    s.start(Math.max(when, 0), hash1(Math.floor(when * 997)) * 1.9);
    s.stop(Math.max(when, 0) + dur + 0.05);
    return s;
  }

  /* ---------- общий граф: мастер, компрессор, зал ---------- */
  function buildGraph() {
    const sr = ac.sampleRate;
    master = G(muted ? 0 : VOL);
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 3; comp.attack.value = 0.006; comp.release.value = 0.25;
    master.connect(comp); comp.connect(ac.destination);
    probe = ac.createAnalyser(); probe.fftSize = 2048; comp.connect(probe); // уровень для самопроверки
    // зал: затухающий шум, который со временем темнеет, и пара ранних отражений
    const len = Math.floor(sr * 2.1), ir = ac.createBuffer(2, len, sr), R = rng(107);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr, k = 0.9 - 0.75 * Math.min(1, t / 1.9);
        lp += k * ((R() * 2 - 1) - lp);
        d[i] = lp * Math.exp(-t / 0.55) * (t < 0.012 ? t / 0.012 : 1);
      }
      for (const [dt, a] of [[0.019 + ch * 0.004, 0.5], [0.041 - ch * 0.006, 0.32], [0.067, 0.2]]) d[Math.floor(dt * sr)] += a;
    }
    verb = ac.createConvolver(); verb.buffer = ir;
    const vg = G(0.55); verb.connect(vg); vg.connect(master);
    // шум
    noiseBuf = ac.createBuffer(1, sr * 2, sr);
    const nd = noiseBuf.getChannelData(0), Rn = rng(5);
    for (let i = 0; i < nd.length; i++) nd[i] = Rn() * 2 - 1;
    // тембр свирели: основной тон, мягкие чётные и нечётные гармоники
    const im = new Float32Array([0, 1, 0.38, 0.16, 0.07, 0.035, 0.015]);
    flutePW = ac.createPeriodicWave(new Float32Array(im.length), im);
  }

  /* ---------- гусли: Карплус — Стронг ---------- */
  function ksBuf(m) {
    const key = m + ':' + ac.sampleRate;
    if (KS.has(key)) return KS.get(key);
    const sr = ac.sampleRate, f = mtof(m);
    const S = 0.36;                                     // «растяжка»: чем меньше, тем звонче струна
    const N = Math.max(8, Math.floor(sr / f - S));
    const f0 = sr / (N + S);
    const T60 = clamp(4.4 - (m - 38) * 0.07, 1.2, 4.4); // низкие струны тянутся дольше
    const dur = Math.min(T60 * 0.75, 2.8) + 0.08;
    const len = Math.floor(sr * dur);
    const buf = ac.createBuffer(1, len, sr), d = buf.getChannelData(0);
    const line = new Float32Array(N), R = rng(m * 7919 + 3);
    const bright = clamp(0.32 + (m - 40) * 0.012, 0.32, 0.78);
    let lp = 0;
    for (let i = 0; i < N; i++) { lp += bright * ((R() * 2 - 1) - lp); line[i] = lp; }
    // щипок у подставки: гребёнка даёт звенящий «металлический» тембр
    const pk = Math.max(1, Math.round(N * 0.12)), tmp = Float32Array.from(line);
    let mean = 0;
    for (let i = 0; i < N; i++) { line[i] = tmp[i] - 0.8 * tmp[(i + N - pk) % N]; mean += line[i]; }
    mean /= N;
    let peak = 1e-6;
    for (let i = 0; i < N; i++) { line[i] -= mean; peak = Math.max(peak, Math.abs(line[i])); }
    const k = Math.pow(0.001, 1 / (T60 * f0));
    let idx = 0, hp = 0, prev = 0;
    for (let i = 0; i < len; i++) {
      const a = line[idx], nx = idx + 1 === N ? 0 : idx + 1;
      line[idx] = k * ((1 - S) * a + S * line[nx]);
      idx = nx;
      hp = 0.995 * (hp + a - prev); prev = a;       // срез постоянной составляющей
      d[i] = (hp / peak) * (i > len - 2200 ? (len - i) / 2200 : 1);
    }
    const v = { buf, rate: f / f0 };
    KS.set(key, v);
    return v;
  }
  function gus(o, when, m, vel = 0.4, opt = {}) {
    if (when < ac.currentTime - 0.03) return;
    const k = ksBuf(m);
    const s = ac.createBufferSource(); s.buffer = k.buf; s.playbackRate.value = k.rate;
    const g = G(vel * 0.5);
    let end = when + k.buf.duration / k.rate;
    if (opt.mute) { g.gain.setValueAtTime(vel * 0.5, when + opt.mute); g.gain.setTargetAtTime(0, when + opt.mute, 0.03); end = Math.min(end, when + opt.mute + 0.25); }
    s.connect(g);
    route(pan(g, opt.pan ?? (m - 60) / 30), o, opt.wet ?? 0.32);
    s.start(when); s.stop(end);
  }

  /* ---------- свирель: одна фраза — один голос с легато ---------- */
  function flute(o, when, notes, opt = {}) {
    const from = ac.currentTime + 0.02;
    const list = notes.filter((n) => when + n[0] >= from); // поздний старт: с первой не сыгранной ноты
    if (!list.length) return;
    const vol = opt.vol ?? 0.14, tr = opt.tr ?? 0;
    const first = when + list[0][0];
    const last = list[list.length - 1], end = when + last[0] + last[2];
    const osc = ac.createOscillator(); osc.setPeriodicWave(flutePW);
    const vib = ac.createOscillator(); vib.frequency.value = opt.vibHz ?? 5.3;
    const vd = G(0); vib.connect(vd); vd.connect(osc.detune);
    const amp = G(0), lp = bq('lowpass', opt.lp ?? 3000, 0.5);
    osc.connect(amp); amp.connect(lp);
    const ns = noise(first - 0.1, end - first + 0.5), bp = bq('bandpass', 1500, 1.4), na = G(0);
    ns.connect(bp); bp.connect(na); na.connect(lp);
    route(pan(lp, opt.pan ?? -0.18), o, opt.wet ?? 0.42);
    osc.frequency.setValueAtTime(mtof(list[0][1] + tr + (list[0][3].includes('^') ? 2 : 0)), first - 0.1);
    for (const [dt, m, dur, fl] of list) {
      const t = when + dt, f = mtof(m + tr), slur = fl.includes('~'), grace = fl.includes('^');
      if (grace) { osc.frequency.setValueAtTime(mtof(m + tr + 2), t - 0.075); osc.frequency.setTargetAtTime(f, t - 0.012, 0.006); }
      else osc.frequency.setTargetAtTime(f, t - 0.004, slur ? 0.035 : 0.005);
      bp.frequency.setTargetAtTime(f * 2.1, t, 0.01);
      const pk = vol * (fl.includes('>') ? 1.3 : 1);
      if (!slur) amp.gain.setTargetAtTime(pk * 0.22, t - (grace ? 0.1 : 0.035), 0.01);
      amp.gain.setTargetAtTime(pk, t - (grace ? 0.075 : 0), 0.022);
      na.gain.setTargetAtTime(pk * 0.5, t - 0.01, 0.008);      // «чуфф» — атака дыхания
      na.gain.setTargetAtTime(pk * 0.13, t + 0.05, 0.05);
      vd.gain.setTargetAtTime(0, t, 0.02);
      if (dur > 0.45) vd.gain.setTargetAtTime(opt.vib ?? 15, t + 0.2, 0.18);
    }
    amp.gain.setTargetAtTime(0, end - 0.05, 0.05);
    na.gain.setTargetAtTime(0, end - 0.05, 0.04);
    osc.start(first - 0.12); vib.start(first - 0.12);
    osc.stop(end + 0.5); vib.stop(end + 0.5);
  }

  /* ---------- колокольчики ---------- */
  const BELL = [[1, 1, 1], [2.0, 0.28, 0.62], [2.76, 0.42, 0.46], [5.4, 0.2, 0.24], [8.93, 0.09, 0.13]];
  function bell(o, when, m, vel = 0.1, opt = {}) {
    if (when < ac.currentTime - 0.03) return;
    const f = mtof(m), len = opt.len ?? 2.2;
    const g = G(vel);
    route(pan(g, opt.pan ?? 0.22), o, opt.wet ?? 0.55);
    for (const [r, a, d] of BELL) {
      const fr = f * r;
      if (fr > 15000) continue;
      const os = ac.createOscillator(); os.frequency.value = fr;
      const e = G(0), T = len * d;
      e.gain.setValueAtTime(0, when); e.gain.linearRampToValueAtTime(a, when + 0.002);
      e.gain.exponentialRampToValueAtTime(0.0001, when + T);
      os.connect(e); e.connect(g);
      os.start(when); os.stop(when + T + 0.05);
    }
  }
  /* бубенец: дешёвый ЧМ-звон для перезвона многих колокольцев */
  function jingle(o, when, m, vel = 0.06, p = 0.3) {
    if (when < ac.currentTime - 0.03) return;
    const f = mtof(m);
    const c = ac.createOscillator(), md = ac.createOscillator(), mi = G(0), e = G(0);
    c.frequency.value = f; md.frequency.value = f * 1.414;
    mi.gain.setValueAtTime(f * 2.2, when); mi.gain.exponentialRampToValueAtTime(f * 0.08, when + 0.35);
    md.connect(mi); mi.connect(c.frequency);
    e.gain.setValueAtTime(0, when); e.gain.linearRampToValueAtTime(vel, when + 0.003);
    e.gain.exponentialRampToValueAtTime(0.0001, when + 0.7);
    c.connect(e); route(pan(e, p), o, 0.5);
    c.start(when); md.start(when); c.stop(when + 0.75); md.stop(when + 0.75);
  }
  /* большой колокол вдалеке: «бом» */
  function bigBell(o, when, m, vel = 0.12) {
    if (when < ac.currentTime - 0.03) return;
    const f = mtof(m), g = G(vel);
    route(g, o, 0.8);
    for (const [r, a, T] of [[0.5, 0.55, 6], [1, 1, 4.5], [1.19, 0.45, 3.2], [1.5, 0.3, 2.6], [2, 0.42, 2.2], [2.52, 0.2, 1.6], [3.01, 0.14, 1.2]]) {
      const os = ac.createOscillator(); os.frequency.value = f * r;
      const e = G(0);
      e.gain.setValueAtTime(0, when); e.gain.linearRampToValueAtTime(a, when + 0.004);
      e.gain.exponentialRampToValueAtTime(0.0001, when + T);
      os.connect(e); e.connect(g); os.start(when); os.stop(when + T + 0.05);
    }
  }

  /* ---------- шумы ---------- */
  function whoosh(o, when, dur, f0, f1, vol, opt = {}) {
    if (when + dur < ac.currentTime) return;
    const s = noise(when, dur), b = bq('bandpass', f0, opt.q ?? 1.1), g = G(0);
    b.frequency.setValueAtTime(f0, when); b.frequency.exponentialRampToValueAtTime(f1, when + dur);
    g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(vol, when + dur * (opt.peak ?? 0.45));
    g.gain.linearRampToValueAtTime(0, when + dur);
    s.connect(b); b.connect(g); route(pan(g, opt.pan ?? 0), o, opt.wet ?? 0.3);
  }
  function thump(o, when, f, vol, dur = 0.12, nz = 0.35, nf = 900, p = 0) {
    if (when < ac.currentTime - 0.03) return;
    const os = ac.createOscillator(), g = G(0);
    os.frequency.setValueAtTime(f * 1.7, when); os.frequency.exponentialRampToValueAtTime(f, when + 0.035);
    g.gain.setValueAtTime(vol, when); g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    os.connect(g); const out = pan(g, p); route(out, o, 0.12);
    os.start(when); os.stop(when + dur + 0.02);
    if (nz > 0) {
      const s = noise(when, 0.06), b = bq('lowpass', nf, 0.7), ng = G(0);
      ng.gain.setValueAtTime(vol * nz, when); ng.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
      s.connect(b); b.connect(ng); ng.connect(out);
    }
  }
  function click(o, when, f, vol, dur = 0.03, q = 3, p = 0) {
    if (when < ac.currentTime - 0.03) return;
    const s = noise(when, dur + 0.02), b = bq('bandpass', f, q), g = G(0);
    g.gain.setValueAtTime(vol, when); g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    s.connect(b); b.connect(g); route(pan(g, p), o, 0.15);
  }
  const hoof = (o, w, v, p = 0) => { click(o, w, 1500 + hash1(Math.floor(w * 100)) * 500, v * 0.9, 0.028, 2.5, p); thump(o, w, 150, v * 0.8, 0.07, 0.2, 700, p); };
  const paw = (o, w, v, p = 0) => thump(o, w, 85, v, 0.1, 0.6, 450, p);
  const step = (o, w, v, p = 0) => thump(o, w, 110, v * 0.7, 0.07, 0.8, 650, p);
  const drum = (o, w, v) => thump(o, w, 62, v, 0.32, 0.5, 500);
  const tok = (o, w, v) => { if (w < ac.currentTime - 0.03) return; const os = ac.createOscillator(), g = G(0); os.frequency.value = 1250; g.gain.setValueAtTime(v, w); g.gain.exponentialRampToValueAtTime(0.0001, w + 0.05); os.connect(g); route(pan(g, 0.3), o, 0.2); os.start(w); os.stop(w + 0.06); click(o, w, 3200, v * 0.6, 0.012, 2, 0.3); };
  const clap = (o, w, v) => { for (let i = 0; i < 3; i++) click(o, w + i * 0.011, 1300, v * (1 - i * 0.2), 0.02, 0.9, 0.35); };
  function boom(o, when, vol) {
    if (when < ac.currentTime - 0.03) return;
    const os = ac.createOscillator(), g = G(0);
    os.frequency.setValueAtTime(95, when); os.frequency.exponentialRampToValueAtTime(34, when + 0.9);
    g.gain.setValueAtTime(vol, when); g.gain.exponentialRampToValueAtTime(0.0001, when + 1.1);
    os.connect(g); route(g, o, 0.3); os.start(when); os.stop(when + 1.15);
    whoosh(o, when, 0.5, 1800, 300, vol * 0.6, { peak: 0.05, q: 0.5 });
  }
  /* фоновые слои: ветер, гул огня, бурдон, мерцание. Умеют начинаться с середины */
  function bed(o, when, dur, kind, vol) {
    const now = ac.currentTime, end = when + dur;
    if (end < now + 0.1) return;
    const t0 = Math.max(when, now), fin = Math.min(1.2, dur * 0.3), fout = Math.min(1.4, dur * 0.35);
    const g = G(0);
    const atk = when >= now ? t0 + fin : t0 + 0.2;
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, atk);
    g.gain.setValueAtTime(vol, Math.max(atk, end - fout)); g.gain.linearRampToValueAtTime(0, end);
    const srcs = [];
    if (kind === 'wind' || kind === 'roar' || kind === 'shimmer' || kind === 'brush') {
      const s = noise(t0, end - t0 + 0.1);
      const f = kind === 'wind' ? bq('bandpass', 380, 0.6) : kind === 'roar' ? bq('lowpass', 300, 0.8) : kind === 'brush' ? bq('bandpass', 3400, 0.9) : bq('highpass', 6500, 0.7);
      s.connect(f); f.connect(g);
      const l = ac.createOscillator(); l.frequency.value = kind === 'wind' ? 0.13 : kind === 'brush' ? 3.1 : 0.7;
      const lg = G(kind === 'wind' ? 180 : kind === 'brush' ? 900 : 60); l.connect(lg); lg.connect(f.frequency);
      srcs.push(l);
    } else if (kind === 'drone') {
      const lp = bq('lowpass', 420, 0.8); lp.connect(g);
      for (const [m, dt] of [[38, -4], [45, 3], [50, 1]]) {
        const os = ac.createOscillator(); os.type = 'sawtooth'; os.frequency.value = mtof(m); os.detune.value = dt;
        const og = G(m === 50 ? 0.4 : 1); os.connect(og); og.connect(lp); srcs.push(os);
      }
    }
    route(g, o, kind === 'shimmer' ? 0.7 : 0.35);
    for (const s of srcs) { s.start(t0); s.stop(end + 0.1); }
  }

  /* ---------- голоса ---------- */
  function howl(o, when, dur, vol) {
    if (when + dur < ac.currentTime) return;
    const os = ac.createOscillator(), o2 = ac.createOscillator(); o2.type = 'sawtooth';
    const vib = ac.createOscillator(), vg = G(0); vib.frequency.value = 5.2; vib.connect(vg); vg.connect(os.frequency); vg.connect(o2.frequency);
    const g = G(0), m2 = G(0.12), lp = bq('lowpass', 1500, 0.6);
    for (const x of [os, o2]) {
      x.frequency.setValueAtTime(260, when); x.frequency.exponentialRampToValueAtTime(520, when + dur * 0.45);
      x.frequency.setValueAtTime(520, when + dur * 0.62); x.frequency.exponentialRampToValueAtTime(360, when + dur);
    }
    vg.gain.setValueAtTime(0, when); vg.gain.linearRampToValueAtTime(9, when + dur * 0.5);
    g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(vol, when + dur * 0.3);
    g.gain.setValueAtTime(vol, when + dur * 0.7); g.gain.linearRampToValueAtTime(0, when + dur);
    os.connect(g); o2.connect(m2); m2.connect(g); g.connect(lp);
    route(pan(lp, 0.45), o, 0.8);
    for (const x of [os, o2, vib]) { x.start(when); x.stop(when + dur + 0.05); }
  }
  function whinny(o, when, vol, p = 0) {
    if (when < ac.currentTime - 0.03) return;
    const os = ac.createOscillator(); os.type = 'sawtooth';
    const vib = ac.createOscillator(), vg = G(40); vib.frequency.value = 17; vib.connect(vg); vg.connect(os.frequency);
    os.frequency.setValueAtTime(620, when); os.frequency.linearRampToValueAtTime(940, when + 0.14);
    os.frequency.linearRampToValueAtTime(760, when + 0.4); os.frequency.linearRampToValueAtTime(430, when + 0.95);
    const f1 = bq('bandpass', 1100, 2.5), f2 = bq('bandpass', 2300, 3), g = G(0);
    g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(vol, when + 0.06);
    g.gain.setValueAtTime(vol, when + 0.5); g.gain.linearRampToValueAtTime(0, when + 1.0);
    os.connect(f1); os.connect(f2); f1.connect(g); f2.connect(g);
    route(pan(g, p), o, 0.4);
    os.start(when); vib.start(when); os.stop(when + 1.05); vib.stop(when + 1.05);
  }
  function growl(o, when, dur, vol) {
    if (when + dur < ac.currentTime) return;
    const os = ac.createOscillator(); os.type = 'sawtooth'; os.frequency.value = 72;
    const am = ac.createOscillator(), ag = G(0.5), g = G(0), lp = bq('lowpass', 380, 1.2);
    am.frequency.value = 26; am.connect(ag); ag.connect(g.gain);
    g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(vol, when + 0.1); g.gain.linearRampToValueAtTime(0, when + dur);
    os.connect(lp); lp.connect(g); route(g, o, 0.3);
    os.start(when); am.start(when); os.stop(when + dur + 0.05); am.stop(when + dur + 0.05);
  }
  /* голос волка — невнятное «бормотание» слогами, по движению челюсти */
  function mumble(o, when, vol, m = 45) {
    if (when < ac.currentTime - 0.03) return;
    const os = ac.createOscillator(); os.type = 'sawtooth';
    os.frequency.setValueAtTime(mtof(m + 2), when); os.frequency.linearRampToValueAtTime(mtof(m - 1), when + 0.22);
    const f = bq('bandpass', 620, 3), g = G(0);
    f.frequency.setValueAtTime(520, when); f.frequency.linearRampToValueAtTime(820, when + 0.12);
    g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(vol, when + 0.04); g.gain.linearRampToValueAtTime(0, when + 0.24);
    os.connect(f); f.connect(g); route(pan(g, -0.35), o, 0.2);
    os.start(when); os.stop(when + 0.26);
  }
  function squawk(o, when, vol) {
    if (when < ac.currentTime - 0.03) return;
    const os = ac.createOscillator(); os.type = 'sawtooth';
    const f = bq('bandpass', 2400, 2), g = G(0);
    const pts = [[0, 1500], [0.05, 2900], [0.11, 2100], [0.16, 3100], [0.26, 1700]];
    os.frequency.setValueAtTime(pts[0][1], when);
    for (const [dt, fr] of pts.slice(1)) os.frequency.linearRampToValueAtTime(fr, when + dt);
    g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(vol, when + 0.02); g.gain.linearRampToValueAtTime(0, when + 0.3);
    os.connect(f); f.connect(g); route(pan(g, 0.3), o, 0.5);
    os.start(when); os.stop(when + 0.32);
  }
  /* трель птицы: два тона вперемежку */
  function trill(o, when, m1, m2, dur, vol) {
    if (when < ac.currentTime - 0.03) return;
    const os = ac.createOscillator(); os.type = 'triangle';
    const g = G(0), step = 0.045;
    for (let i = 0, t = when; t < when + dur; i++, t += step) os.frequency.setValueAtTime(mtof(i % 2 ? m2 : m1), t);
    g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(vol, when + 0.03);
    g.gain.setValueAtTime(vol, when + dur - 0.06); g.gain.linearRampToValueAtTime(0, when + dur);
    os.connect(g); route(pan(g, 0.25), o, 0.6);
    os.start(when); os.stop(when + dur + 0.02);
  }
  function snore(o, when, dur, vol, p) {
    if (when + dur < ac.currentTime) return;
    const s = noise(when, dur), f = bq('bandpass', 260, 3), g = G(0), am = ac.createOscillator(), ag = G(0.5);
    am.frequency.value = 34; am.connect(ag); ag.connect(g.gain);
    g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(vol, when + dur * 0.7); g.gain.linearRampToValueAtTime(0, when + dur);
    s.connect(f); f.connect(g); route(pan(g, p), o, 0.2);
    am.start(when); am.stop(when + dur + 0.05);
  }
  function chirp(o, when, vol, f0 = 3400) {
    if (when < ac.currentTime - 0.03) return;
    const os = ac.createOscillator(), g = G(0);
    os.frequency.setValueAtTime(f0, when); os.frequency.exponentialRampToValueAtTime(f0 * 1.35, when + 0.06);
    g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(vol, when + 0.01); g.gain.linearRampToValueAtTime(0, when + 0.07);
    os.connect(g); route(pan(g, 0.5), o, 0.5); os.start(when); os.stop(when + 0.08);
  }
  /* сверчок: три коротких импульса */
  function cricket(o, when, vol, f = 4400, p = 0) {
    if (when < ac.currentTime - 0.03) return;
    const os = ac.createOscillator(), g = G(0); os.frequency.value = f;
    for (let i = 0; i < 3; i++) { const t = when + i * 0.045; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.006); g.gain.linearRampToValueAtTime(0, t + 0.028); }
    os.connect(g); route(pan(g, p), o, 0.35); os.start(when); os.stop(when + 0.16);
  }

  /* ==========================================================================
     ПАРТИТУРА
     ========================================================================== */
  const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const nn = (s) => { const m = /^([A-G])([b#]?)(\d)$/.exec(s); return 12 * (+m[3] + 1) + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0); };
  /* «D5:2 E5 ~F5 | ^G5:4 r:2» → [[dt, midi, dur, флаги]]; длительность — в долях unit.
     ~ — легато, ^ — форшлаг сверху, > — акцент, r — пауза */
  function parse(str, unit) {
    const notes = []; let t = 0;
    for (const tok of str.split(/\s+/)) {
      if (!tok || tok === '|') continue;
      const [n0, d0] = tok.split(':');
      const d = d0 ? parseFloat(d0) : 1;
      const fl = n0.replace(/[A-Gr#b\d]/g, ''), n = n0.replace(/[~^>]/g, '');
      if (n !== 'r') notes.push([t, nn(n), d * unit, fl]);
      t += d * unit;
    }
    return { notes, len: t };
  }
  // аккорды гуслей: бас, квинта, основной тон, терция, квинта
  const CH = {
    Dm: [50, 57, 62, 65, 69], C: [48, 55, 60, 64, 67], Am: [45, 52, 57, 60, 64], F: [41, 48, 53, 57, 60],
    G: [43, 50, 55, 59, 62], Gm: [43, 50, 55, 58, 62], Bb: [46, 53, 58, 62, 65], A: [45, 52, 57, 61, 64], D: [50, 57, 62, 66, 69],
  };
  const ROLL = [0, 2, 3, 4, 3, 2, 3, 1];     // переборы шестнадцатыми
  const DRIVE = [0, 2, 1, 2, 0, 3, 1, 2];    // скачка
  const SOFT = [0, 2, 3, 4];                 // восьмыми
  /* моменты касания земли: фаза ph(lt) пересекает целое со сдвигами off */
  function contacts(t0, lt0, lt1, ph, off, fn, stepLen = 1) {
    let prev = null;
    for (let lt = lt0; lt <= lt1 + 1e-9; lt += 0.004) {
      const p = ph(lt);
      if (prev !== null) off.forEach((o, i) => { if (Math.floor((p + o) / stepLen) > Math.floor((prev + o) / stepLen)) fn(t0 + lt, i, lt); });
      prev = p;
    }
  }

  function compose() {
    EV.length = 0;
    const ev = (t, f, d = 0, late = false) => EV.push({ t, f, d, late });
    const pluck = (t, m, v = 0.4, o) => { ev(t, (x, w) => gus(x, w, m, v, o)); EV[EV.length - 1].m = m; };
    const strum = (t, ch, v = 0.4, gap = 0.028, o) => ch.forEach((m, i) => pluck(t + i * gap, m, v * (1 - i * 0.06), o));
    const arp = (t, ch, pat, unit, v) => pat.forEach((ix, i) => pluck(t + i * unit, ch[ix], v * (i === 0 ? 1.3 : 1) * (0.88 + 0.24 * hash1(Math.round(t * 64) + i))));
    const arps = (t, names, pat = ROLL, unit = S16, v = 0.24) => names.forEach((c, i) => arp(t + i * BAR, CH[c], pat, unit, v));
    const mel = (t, str, o = {}) => { const p = parse(str, o.unit || E8); ev(t, (x, w) => flute(x, w, p.notes, o), p.len, true); };
    const pizz = (t, str, v = 0.28, mute = 0.14) => parse(str, E8).notes.forEach(([dt, m]) => pluck(t + dt, m, v, { mute, wet: 0.2 }));
    const bells = (t, str, v = 0.08, o = {}) => parse(str, o.unit || S16).notes.forEach(([dt, m]) => ev(t + dt, (x, w) => bell(x, w, m, v, o)));
    const B = (t, m, v = 0.1, o) => ev(t, (x, w) => bell(x, w, m, v, o));
    const fx = (t, f) => ev(t, f);
    const layer = (t, dur, kind, vol) => ev(t, (x, w) => bed(x, w, dur, kind, vol), dur, true);
    const brush = (t, dur, vol = 0.03) => layer(t, dur, 'brush', vol);
    const crickets = (t0, t1, vol = 0.014) => { const R = rng(Math.floor(t0 * 10)); for (let t = t0 + 0.3; t < t1; t += 0.35 + R() * 0.9) { const w = t, f = 4200 + R() * 700, p = R() * 1.4 - 0.7, v = vol * (0.5 + R() * 0.6); fx(w, (x, when) => cricket(x, when, v, f, p)); } };
    const crackle = (t0, t1, rate, vol) => { const R = rng(Math.floor(t0 * 7)); for (let t = t0; t < t1; t += (0.3 + R() * 1.4) / rate) { const f = 2200 + R() * 3800, v = vol * (0.3 + 0.7 * R() * R()), d = 0.004 + R() * 0.012, p = R() * 0.8 - 0.4; fx(t, (x, w) => click(x, w, f, v, d, 0.8, p)); } };
    const flaps = (t0, lt0, lt1, rate, volFn, p = 0.3) => { for (let k = Math.ceil(lt0 * rate - 0.3); (k + 0.3) / rate <= lt1; k++) { const lt = (k + 0.3) / rate; if (lt < lt0) continue; const v = volFn(lt); if (v > 0.004) fx(t0 + lt, (x, w) => whoosh(x, w, Math.min(0.2, 0.7 / rate), 900, 260, v, { q: 0.8, peak: 0.35, pan: p, wet: 0.2 })); } };
    const gallop = (t0, lt0, lt1, ph, vol, kind, skip) => contacts(t0, lt0, lt1, ph, [0, 0.08, 0.52, 0.6], (t, i, lt) => { if (skip && skip(lt)) return; const v = (typeof vol === 'function' ? vol(lt) : vol) * (i < 2 ? 1 : 0.75); fx(t, (x, w) => (kind === 'paw' ? paw : hoof)(x, w, v)); });
    const walk4 = (t0, lt0, lt1, ph, vol, kind) => contacts(t0, lt0, lt1, ph, [0, 0.25, 0.5, 0.75], (t, i, lt) => { const v = (typeof vol === 'function' ? vol(lt) : vol) * (i % 2 ? 0.8 : 1); fx(t, (x, w) => (kind === 'paw' ? paw : hoof)(x, w, v)); });
    const steps = (t0, lt0, lt1, ph, vol) => contacts(t0, lt0, lt1, ph, [0], (t) => fx(t, (x, w) => step(x, w, vol)), 0.5);

    /* ---- 1. Титр: золотые штрихи рамки ведёт кисть, гусли — снизу вверх ---- */
    B(0.2, 86, 0.07, { len: 3 }); B(0.36, 93, 0.04, { len: 3 });
    brush(0.15, 3.4, 0.028);
    [50, 57, 62, 64, 65, 69, 72, 74, 76, 77, 81, 86].forEach((m, i) => pluck(0.3 + i * 0.25, m, 0.16 + i * 0.012));
    strum(2.5, CH.Dm, 0.22, 0.04);
    mel(2.5, 'A4:2 D5:2 | ^E5 F5 E5 D5 | D5:4', { vol: 0.11 });
    strum(5.0, CH.Dm, 0.18, 0.05); B(5.0, 81, 0.05);

    /* ---- 2. Сад проступает из лака ---- */
    brush(6.25, 3.4, 0.022);
    arps(6.25, ['Dm', 'C', 'Dm', 'Am', 'Dm'], ROLL, S16, 0.22);
    mel(7.5, 'D5:2 E5 F5 | G5:2 F5 E5 | F5 E5 D5 C5 | D5:4', { vol: 0.13 });
    crickets(6.25, 21.0);

    /* ---- 3. Братья спят, Иван клюёт носом ---- */
    arps(12.5, ['Dm', 'C'], ROLL, S16, 0.21);
    for (const [t, p] of [[12.5, -0.6], [13.9, -0.3], [15.0, -0.6], [16.4, -0.3]]) fx(t, (x, w) => snore(x, w, 1.1, 0.05, p));
    pluck(15.1, 69, 0.16); pluck(15.45, 65, 0.14); pluck(15.8, 62, 0.12);
    for (let i = 0; i < 5; i++) pluck(16.12 + i * 0.05, 74, 0.13, { mute: 0.1 });
    for (let i = 0; i < 4; i++) fx(16.14 + i * 0.06, (x, w) => jingle(x, w, 93 + (i % 2) * 2, 0.03));
    arps(16.25, ['Am'], ROLL, S16, 0.21);

    /* ---- 4. Крупно: Иван видит свет ---- */
    layer(18.2, 2.9, 'shimmer', 0.04);
    { const R = rng(181); for (let i = 0; i < 18; i++) { const u = i / 17; B(18.3 + Math.pow(u, 0.75) * 2.1, [86, 88, 91, 93, 96][Math.floor(R() * 5)], 0.03 + 0.06 * u, { len: 1.6, pan: R() - 0.5 }); } }
    mel(18.4, 'A4:3 ~D5:5', { vol: 0.09 });
    B(20.3, 93, 0.12, { len: 2.5 });
    bells(20.625, 'A5 C6 D6 E6', 0.1);

    /* ---- 5. Полночь: прилетает Жар-птица ---- */
    B(21.3, 86, 0.08, { len: 3 }); B(21.3, 93, 0.05, { len: 3 });
    fx(21.5, (x, w) => whoosh(x, w, 3.3, 240, 950, 0.06, { peak: 0.6, q: 0.7, pan: 0.4 }));
    flaps(21.25, 0.5, 4.3, 2.6, (lt) => (1 - 0.9 * sstep(3.5, 4.3, lt)) * lerp(0.3, 1, Math.pow(Ease.outS(inv(0.3, 3.5, lt)), 1.4)) * 0.075, 0.35);
    crackle(21.6, 24.8, 14, 0.03);
    fx(24.4, (x, w) => thump(x, w, 120, 0.06, 0.12, 0.4, 600, 0.3));
    bells(24.45, 'D6 F6 A6', 0.07, { unit: 0.05 });
    arps(22.5, ['F', 'C', 'Am'], ROLL, S16, 0.23);
    mel(22.5, '^A5:2 G5 F5 | G5 F5 E5 D5 | C5:2 E5 D5 | D5:2', { vol: 0.14 });
    crickets(21.25, 30.0, 0.01);

    /* ---- 6. Иван подкрадывается, птица клюёт ---- */
    pizz(26.25, 'D3 F3 A3 F3 | E3 G3 A3 G3', 0.3);
    steps(26.25, 0, 2.9, (lt) => key(lt, [[0, 0], [2.9, 1.6, 'ioS']]), 0.035);
    for (const t of [27.125, 27.75, 28.375]) fx(t, (x, w) => tok(x, w, 0.07));
    for (let i = 0; i < 4; i++) fx(28.1 + i * 0.035, (x, w) => click(x, w, 2600 + i * 400, 0.06, 0.02, 1.5, 0.3));
    B(28.2, 100, 0.03);
    B(28.8, 88, 0.1, { len: 1.4 }); B(28.8, 89, 0.08, { len: 1.4 });
    for (let t = 29.0, i = 0; t < 30.0; t += 0.075, i++) pluck(t, 38, 0.07 + 0.08 * (t - 29), { mute: 0.07, wet: 0.1 });
    fx(29.3, (x, w) => whoosh(x, w, 0.7, 400, 1300, 0.025));

    /* ---- 7. Прыжок: хватает за хвост, перо вырвано ---- */
    fx(30.0, (x, w) => whoosh(x, w, 0.5, 300, 1600, 0.08));
    fx(30.5, (x, w) => squawk(x, w, 0.1));
    strum(30.5, CH.Dm, 0.42, 0.018);
    { const R = rng(305); for (let i = 0; i < 8; i++) { const t = 30.52 + R() * 0.35, m = [84, 86, 88, 91, 93][Math.floor(R() * 5)]; fx(t, (x, w) => jingle(x, w, m, 0.04, 0.3)); } }
    for (let t = 30.6, i = 0; t < 31.8; t += 0.07, i++) pluck(t, [62, 65, 69, 74][i % 4], 0.14, { mute: 0.12 });
    flaps(30, 0.5, 2.5, 5.2, () => 0.07, 0.3);
    fx(31.8, (x, w) => whoosh(x, w, 0.7, 200, 2600, 0.12, { peak: 0.18 }));
    fx(31.85, (x, w) => boom(x, w, 0.22));
    for (const m of [81, 82, 86, 88]) B(31.86, m, 0.07, { len: 1.8 });
    fx(31.9, (x, w) => squawk(x, w, 0.07));
    crackle(31.85, 32.4, 40, 0.05);
    bells(31.95, 'D6 E6 F6 A6 D7', 0.06);

    /* ---- 8. Птица улетает, перо падает ---- */
    flaps(32.5, 0, 1.9, 4, (lt) => lerp(0.07, 0.01, lt / 1.9), 0.5);
    B(34.35, 105, 0.08, { len: 3 });
    ['A6', 'G6', 'F6', 'E6', 'D6'].forEach((n, i) => B(32.7 + i * 0.42, nn(n), 0.05, { len: 2 }));
    [74, 69, 65, 62].forEach((m, i) => pluck(32.5 + i * 0.6, m, 0.14));

    /* ---- 9. Крупно: перо в ладонях ---- */
    fx(35.85, (x, w) => whoosh(x, w, 0.5, 180, 600, 0.07));
    B(35.95, 86, 0.07); B(35.95, 93, 0.04);
    layer(35.0, 5.0, 'roar', 0.03); crackle(35.0, 40.0, 7, 0.03);
    layer(35.85, 1.1, 'shimmer', 0.03);
    arps(35.0, ['Dm', 'C', 'Am', 'Dm'], ROLL, S16, 0.22);
    mel(35.0, 'D5:2 E5 F5 | G5:2 F5 E5 | F5 E5 D5 C5 | D5:4', { vol: 0.14 });

    /* ---- 10. Царь велит добыть птицу ---- */
    fx(40.2, (x, w) => whoosh(x, w, 0.8, 300, 1400, 0.045));
    [[40.0, CH.Dm, 0.4], [40.625, [57, 62, 65], 0.2], [41.25, CH.Bb, 0.38], [41.875, [58, 62, 65], 0.2], [42.5, CH.A, 0.52], [43.125, [57, 61, 64], 0.22], [43.75, CH.Dm, 0.4], [44.375, [57, 62, 65], 0.2]]
      .forEach(([t, ch, v]) => strum(t, ch, v, 0.03));
    for (const [t, v] of [[40.0, 0.18], [41.25, 0.16], [42.5, 0.28], [43.75, 0.18]]) fx(t, (x, w) => drum(x, w, v));
    [40.8, 40.88, 40.96, 41.04, 41.12, 41.2, 41.28, 41.3].forEach((t, i) => B(t, [74, 76, 79, 81, 84, 86, 88, 91][i], 0.06, { len: 1.8, pan: -0.5 + i * 0.05 }));
    crackle(40.0, 45.0, 4, 0.02);

    /* ---- 11. Иван скачет в ночь ---- */
    gallop(45, 0, 5, (lt) => lt * 2.1, 0.085, 'hoof');
    arps(45, ['Dm', 'Dm', 'C', 'Dm'], DRIVE, S16, 0.2);
    mel(45, '^D5:2 E5 F5 | G5:2 F5 E5 | F5 E5 D5 C5 | D5:3 A4', { vol: 0.15 });
    layer(45, 5, 'wind', 0.035);

    /* ---- 12. Камень на распутье ---- */
    walk4(50, 0, 3.75, (lt) => key(lt, [[0, 0], [1.1, 1.3, 'outQ'], [2.7, 1.3], [3.75, 3.2, 'inQ']]), 0.07, 'hoof');
    layer(50, 5.2, 'drone', 0.045);
    mel(50.625, 'A4 B4 C5:2 | B4 A4 G4 A4 | A4:2', { vol: 0.1 });
    brush(51.3, 1.25, 0.03);
    B(51.3, 57, 0.07, { len: 3 }); B(51.7, 55, 0.07, { len: 3 }); B(52.1, 53, 0.07, { len: 3 });
    fx(51.2, (x, w) => whoosh(x, w, 0.25, 500, 250, 0.05, { q: 0.6 }));
    fx(52.6, (x, w) => whinny(x, w, 0.07, -0.2));

    /* ---- 13. Из тьмы — волк ---- */
    pluck(53.83, 38, 0.3, { mute: 0.6 }); pluck(53.83, 44, 0.26, { mute: 0.6 });
    fx(53.9, (x, w) => growl(x, w, 0.5, 0.06));
    fx(54.17, (x, w) => growl(x, w, 0.6, 0.1));
    fx(54.17, (x, w) => whoosh(x, w, 0.62, 250, 1400, 0.09));
    fx(54.8, (x, w) => boom(x, w, 0.2));
    for (const m of [74, 75, 80, 81]) B(54.8, m, 0.07, { len: 2 });

    /* ---- 14. Горе Ивана; волк приходит с повинной ---- */
    layer(55.0, 7.5, 'wind', 0.04);
    mel(55.625, 'A4:2 Bb4 A4 | G4 F4 E4 F4 | D4:4', { vol: 0.12, vib: 22 });
    strum(55.625, CH.Dm, 0.2, 0.07); strum(56.875, CH.Gm, 0.18, 0.07); strum(58.125, CH.A, 0.2, 0.07); pluck(59.375, 50, 0.18);
    walk4(55, 1.1, 3.4, (lt) => key(lt, [[0, 0], [1.1, 0], [3.4, 2.4, 'outQ']]), 0.04, 'paw');
    pluck(58.7, 38, 0.16);
    fx(59.9, (x, w) => whoosh(x, w, 0.9, 200, 900, 0.07));
    layer(60.0, 1.2, 'shimmer', 0.03);
    bells(60.0, 'D6 F6 A6 D7', 0.06);
    layer(60.0, 2.5, 'roar', 0.025);
    arps(60.0, ['F', 'C'], ROLL, S16, 0.21);
    mel(60.625, 'A4 C5 D5 E5 | F5:2', { vol: 0.13 });

    /* ---- 15. Полёт на сером волке ---- */
    gallop(62.5, 0, 6.25, (lt) => lt * 2.3, 0.075, 'paw', (lt) => lt > 3.7 && lt < 4.8);
    arps(62.5, ['Dm', 'C', 'F', 'C', 'Dm'], DRIVE, S16, 0.21);
    mel(62.5, '^A5:2 G5 F5 | G5 F5 E5 D5 | C5:2 E5 D5 | D5 F5 A5 C6 | >D6:4', { vol: 0.14 });
    fx(66.2, (x, w) => whoosh(x, w, 1.1, 300, 2000, 0.09, { peak: 0.5 }));
    bells(66.2, 'D6 E6 F6 A6 C7 D7', 0.06, { unit: 0.11 });
    fx(67.3, (x, w) => thump(x, w, 80, 0.16, 0.2, 0.6, 500));
    layer(62.5, 6.25, 'wind', 0.045);

    /* ---- 16. Чужой сад: волк учит, Иван идёт к клетке ---- */
    gallop(68.75, 0, 1.05, (lt) => lt * 2.2, (lt) => 0.07 * (1 - sstep(0.7, 1.05, lt)), 'paw');
    fx(70.55, (x, w) => step(x, w, 0.12));
    steps(68.75, 2.1, 4.6, (lt) => inv(2.1, 4.6, lt) * 3.2, 0.045);
    layer(68.75, 6.25, 'drone', 0.04);
    pizz(68.75, 'r:2 A3:2 | C4:2 B3:2 | A3:2 E3:2 | A3:2 C4:2 | B3:4', 0.27, 0.3);
    for (let k = 0; k < 14; k++) { const lt = (PI / 2 + TAU * k) / 13; if (bump(1.1, 1.3, 5.5, 5.8, lt) > 0.4) fx(68.75 + lt, (x, w) => mumble(x, w, 0.045, 45 + (k % 3))); }
    layer(73.6, 1.4, 'shimmer', 0.03);
    mel(73.75, 'E5:4', { vol: 0.07, vib: 20 });
    crickets(68.75, 75.0, 0.009);

    /* ---- 17. Клетка поднята — звенят колокольцы, бежит стража ---- */
    fx(75.25, (x, w) => whoosh(x, w, 0.5, 400, 1200, 0.05));
    [81, 84, 86, 88, 91].forEach((m, i) => {
      for (let k = 330; k < 350; k++) {
        const t = (PI / 2 + PI * k - i * 1.3) / 14; // крайние точки качания: 14t + 1,3i = π/2 + πk
        if (t < 75.5 || t > 77.6) continue;
        const v = 0.05 * sstep(75.5, 75.7, t) * (0.7 + 0.3 * hash1(k * 5 + i));
        fx(t, (x, w) => jingle(x, w, m, v, -0.1 + i * 0.12));
      }
    });
    for (let g = 0; g < 2; g++) steps(75, 1.0, 2.6, (lt) => lt * 2.6 + g * 0.5, 0.05);
    for (const t of [76.25, 76.5625, 76.875, 77.1875, 77.5]) fx(t, (x, w) => drum(x, w, 0.14));
    mel(76.15, '~E6 ~A5', { vol: 0.07, unit: 0.12 });
    B(77.6, 86, 0.11, { len: 3.5 }); B(77.6, 93, 0.05, { len: 3 });
    brush(77.9, 0.85, 0.03);
    [50, 55, 57, 62, 65, 69, 72, 74].forEach((m, i) => pluck(77.95 + i * 0.1, m, 0.14));

    /* ---- 18. Долго ли, коротко ли — клейма ---- */
    arps(78.75, ['Dm', 'C', 'Am', 'Dm', 'F', 'C', 'Am', 'Dm', 'F', 'C', 'Dm'], ROLL, S16, 0.2);
    mel(78.75, 'D5:2 E5 F5 | G5:2 F5 E5 | F5 E5 D5 C5 | D5:4 | ^A5:2 G5 F5 | G5 F5 E5 D5 | C5:2 E5 D5 | D5:4 | ^F5:2 G5 A5 | G5 F5 E5 C5 | D5:4', { vol: 0.13 });
    fx(80.35, (x, w) => whinny(x, w, 0.04, 0.4));
    fx(81.3, (x, w) => drum(x, w, 0.16)); pluck(81.3, 38, 0.26);
    fx(82.4, (x, w) => whoosh(x, w, 0.7, 300, 800, 0.03));
    fx(84.0, (x, w) => whoosh(x, w, 0.6, 300, 1500, 0.06)); B(84.3, 88, 0.07); fx(84.3, (x, w) => drum(x, w, 0.12));
    gallop(82.5, 2.1, 3.6, (lk) => lk * 2.3, 0.03, 'paw');
    fx(86.1, (x, w) => whoosh(x, w, 0.7, 300, 800, 0.03));
    layer(86.6, 1.6, 'shimmer', 0.035);
    bells(86.6, 'D6 E6 F6 A6 C7 D7 C7 A6 F6 E6 D6', 0.05, { unit: 0.09 });
    B(87.4, 86, 0.08, { len: 3 }); B(87.4, 90, 0.07, { len: 3 }); B(87.4, 93, 0.06, { len: 3 });
    strum(87.4, CH.D, 0.26, 0.04);
    for (let k = 0; k < 40; k++) { const t = (PI / 2 + TAU * k + TAU * 125) / 9; if (t > 87.5 && t < 89.9) fx(t, (x, w) => clap(x, w, 0.05)); }
    fx(88.3, (x, w) => whoosh(x, w, 1.7, 800, 300, 0.03));
    bells(90.35, 'D6 A6 D7', 0.07, { unit: 0.04 });

    /* ---- 19. Рассвет у камня ---- */
    mel(92.5, 'D5:2 E5:2 | F5:3 E5 | D5:2 C5:2 | D5:4', { vol: 0.12 });
    arps(92.5, ['Dm', 'Bb', 'C', 'Dm'], SOFT, E8, 0.19);
    walk4(92.5, 0, 2.6, (lt) => key(lt, [[0, 0], [2.6, 2.4, 'outQ']]), 0.045, 'hoof');
    walk4(92.5, 0, 2.6, (lt) => key(lt, [[0, 0], [2.6, 2.4, 'outQ']]) * 1.1 + 0.3, 0.03, 'paw');
    { const R = rng(925); for (let i = 0; i < 7; i++) { const t = 92.9 + R() * 4.2, f = 3000 + R() * 1400; fx(t, (x, w) => { chirp(x, w, 0.018, f); chirp(x, w + 0.09, 0.014, f * 1.1); }); } }

    /* ---- 20. Поклон ---- */
    [[97.5, 'Dm'], [98.75, 'Bb'], [100.0, 'F'], [101.25, 'A'], [102.5, 'Dm']].forEach(([t, c]) => strum(t, CH[c], 0.28, 0.055));
    fx(100.05, (x, w) => bigBell(x, w, 38, 0.13));
    fx(97.7, (x, w) => whoosh(x, w, 0.6, 1500, 3000, 0.015));
    mel(98.75, 'A4:4 | F4:2 G4:2 | A4:4', { vol: 0.08 });

    /* ---- 21. Волк уходит, воет с холма ---- */
    walk4(102.5, 0.2, 2.6, (lt) => lt * 1.6, (lt) => lerp(0.045, 0.02, inv(0.2, 2.6, lt)), 'paw');
    walk4(102.5, 4.1, 5.0, (lt) => lt * 1.6, 0.015, 'paw');
    arps(102.5, ['Dm', 'C', 'Am', 'Dm'], SOFT, E8, 0.21);
    fx(105.5, (x, w) => howl(x, w, 1.0, 0.1));
    mel(106.6, 'A5:2 G5 F5 | D5:4', { vol: 0.09 });

    /* ---- 22. Дома: в саду светло и ночью. Конец ---- */
    crickets(107.5, 118.5, 0.01);
    arps(107.5, ['Dm', 'G', 'C', 'Dm', 'F', 'C', 'Am', 'Dm'], ROLL, S16, 0.21);
    mel(108.75, 'D5:2 E5 F5 | G5:2 F5 E5 | F5 E5 D5 C5 | D5:4 | ^A5:2 G5 F5 | G5 F5 E5 D5 | C5:2 E5 D5 | D5:4', { vol: 0.14 });
    [[108.75, 86], [110, 91], [111.25, 89], [112.5, 86], [113.75, 93], [115, 91], [116.25, 84], [117.5, 86]].forEach(([t, m]) => B(t, m, 0.045));
    for (let k = 0; k < 20; k++) { const t = (PI / 2 + TAU * k + TAU * 86) / 5; if (t > 107.7 && t < 117.4) fx(t - 0.05, (x, w) => trill(x, w, k % 2 ? 93 : 91, k % 2 ? 96 : 93, 0.32, 0.025)); }
    crackle(107.5, 118, 3, 0.015);
    bells(114.4, 'D6 A6 D7', 0.07, { unit: 0.03, len: 3.5 });
    bells(114.8, 'D6 E6 F6 A6 C7 D7 E7 F7 A7', 0.035, { unit: 0.3 });
    strum(117.5, [38, 45, 50, 57, 62, 69, 74], 0.3, 0.05);
    fx(117.5, (x, w) => bigBell(x, w, 50, 0.06));

    EV.sort((a, b) => a.t - b.t);
  }

  /* ==========================================================================
     ПЛАНИРОВЩИК
     ========================================================================== */
  function pump() {
    if (!run) return;
    const now = ac.currentTime, horizon = run.f0 + (now - run.c0) + LOOK;
    while (run.i < EV.length && EV[run.i].t < horizon) {
      const e = EV[run.i++];
      if (e.t < run.f0) continue;
      e.f(run.out, run.c0 + (e.t - run.f0));
      run.n++;
    }
    // одна струна за тик — заранее, пока есть время
    while (WARM.length && KS.has(WARM[WARM.length - 1] + ':' + ac.sampleRate)) WARM.pop();
    if (WARM.length) ksBuf(WARM.pop());
  }
  function start(t0) {
    if (!ac) return;
    stop();
    if (ac.state !== 'running') ac.resume().catch(() => {});
    const bus = G(1), wet = G(1);
    bus.connect(master); wet.connect(verb);
    run = { f0: t0, c0: ac.currentTime + 0.06, i: 0, n: 0, out: { bus, wet } };
    runs++;
    // дорогие события, которые начались до t0 и ещё звучат: слои и фразы
    for (const e of EV) {
      if (e.t >= t0) break;
      if (e.late && e.t + e.d > t0 + 0.1) { e.f(run.out, run.c0 + (e.t - t0)); run.n++; }
    }
    while (run.i < EV.length && EV[run.i].t < t0) run.i++;
    pump();
    clearInterval(timer);
    timer = setInterval(pump, 40);
  }
  function stop(soft) {
    clearInterval(timer); timer = 0;
    if (!run || !ac) { run = null; return; }
    const { bus, wet } = run.out, now = ac.currentTime, tau = soft ? 0.5 : 0.02;
    bus.gain.setTargetAtTime(0, now, tau); wet.gain.setTargetAtTime(0, now, tau);
    setTimeout(() => { try { bus.disconnect(); wet.disconnect(); } catch (e) { /* уже отключено */ } }, soft ? 4000 : 400);
    run = null;
  }
  async function init() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error('Web Audio недоступен');
      ac = new AC();
      buildGraph();
      compose();
      // струны считаются по мере надобности и понемногу в фоне (см. pump), а не все сразу по клику
      WARM.push(...new Set(EV.filter((e) => e.m).map((e) => e.m)));
    }
    if (ac.state !== 'running') await ac.resume();
  }
  function setMuted(m) {
    muted = m;
    if (master) master.gain.setTargetAtTime(m ? 0 : VOL, ac.currentTime, 0.05);
  }
  /* время фильма по часам звука (null — звук не ведёт) */
  function filmTime() {
    if (!run || !ac || ac.state !== 'running') return null;
    // слышим то, что было посчитано outputLatency назад
    return Math.max(run.f0, run.f0 + (ac.currentTime - (ac.outputLatency || 0) - run.c0));
  }
  /* состояние для проверки: контекст, запланированные события, уровень на выходе */
  function stats() {
    let rms = 0;
    if (probe) { const b = new Float32Array(probe.fftSize); probe.getFloatTimeDomainData(b); for (const v of b) rms += v * v; rms = Math.sqrt(rms / b.length); }
    return { state: ac ? ac.state : 'none', running: !!run, events: EV.length, scheduled: run ? run.n : 0, runs, film: filmTime(), rms: +rms.toFixed(4), muted };
  }
  /* отладка: офлайн-рендер куска партитуры → [RMS, пик] по секундам */
  async function render(t0, t1) {
    const keep = [ac, master, verb, noiseBuf, flutePW, probe], sr = 44100;
    if (!EV.length) compose();
    ac = new OfflineAudioContext(2, Math.ceil((t1 - t0 + 1) * sr), sr);
    buildGraph();
    const bus = G(1), wet = G(1); bus.connect(master); wet.connect(verb);
    for (const e of EV) if (e.t >= t0 && e.t < t1) e.f({ bus, wet }, e.t - t0 + 0.05);
    const buf = await ac.startRendering();
    [ac, master, verb, noiseBuf, flutePW, probe] = keep;
    const L = buf.getChannelData(0), Rc = buf.getChannelData(1), res = [];
    for (let s = 0; s + 1 <= t1 - t0; s++) {
      let sum = 0, pk = 0;
      for (let i = s * sr; i < (s + 1) * sr; i++) { const v = (L[i] + Rc[i]) / 2; sum += v * v; pk = Math.max(pk, Math.abs(L[i]), Math.abs(Rc[i])); }
      res.push([+Math.sqrt(sum / sr).toFixed(3), +pk.toFixed(2)]);
    }
    return res;
  }
  return { init, start, stop, setMuted, filmTime, stats, render };
})();
