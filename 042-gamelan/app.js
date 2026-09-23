/* Гамелан — синтез гонгов и металлофонов на Web Audio, колотомические «часы» на Canvas. */
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const SHOT = !!window.__SHOT__;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Строи и мелодия ---------- */
  const TUNINGS = {
    pelog: {
      cents: { 1: 0, 2: 120, 3: 258, 4: 540, 5: 675, 6: 785, 7: 950 },
      note: 'Семь неравных ступеней на октаву; мелодия берёт пять из них. Рядом стоят маленькие и большие шаги — звучит торжественно и чуть тревожно.',
    },
    slendro: {
      cents: { 1: 0, 2: 231, 3: 474, 5: 717, 6: 955 },
      note: 'Пять почти равных ступеней на октаву, в среднем по 240 центов — такого интервала нет в европейских строях. Звучит светло и открыто.',
    },
  };
  const F0 = 293.7;           // ступень 1 сарона
  const SCALE = [1, 2, 3, 5, 6];
  // Цифровая запись: ' — выше на октаву, , — ниже
  const parse = (s) => s.trim().split(/\s+/).map((t) => ({ d: +t[0], o: t.includes("'") ? 1 : t.includes(',') ? -1 : 0 }));
  const BALUNGAN = [
    parse("2 3 2 1  6, 1 2 3  5 6 5 3  2 1 2 6,"),
    parse("3 5 6 1'  6 5 3 2  5 3 2 1  3 2 1 2"),
  ];

  const S = { tuning: 'pelog', tempo: 72, dens: 4, ombak: false, on: { gong: true, kempul: true, kenong: true, kethuk: true, saron: true, peking: true, bonang: true } };

  const freq = (n, oct = 0) => F0 * Math.pow(2, (TUNINGS[S.tuning].cents[n.d] + 1200 * (n.o + oct)) / 1200);
  const pitchIndex = (n) => SCALE.indexOf(n.d) + 5 * n.o;
  function stepNote(n, k) {
    let i = SCALE.indexOf(n.d) + k, o = n.o;
    while (i < 0) { i += 5; o--; }
    while (i > 4) { i -= 5; o++; }
    return { d: SCALE[i], o };
  }
  const noteAt = (beat) => BALUNGAN[Math.floor(beat / 16) % BALUNGAN.length][((beat % 16) + 16) % 16];
  // Фигура переплетения на долю: движется к следующему тону балунгана
  function figure(cur, nxt) {
    const a = pitchIndex(cur), b = pitchIndex(nxt);
    if (b > a) return [stepNote(nxt, -2), stepNote(nxt, -1), nxt, stepNote(nxt, -1)];
    if (b < a) return [stepNote(nxt, 2), stepNote(nxt, 1), nxt, stepNote(nxt, 1)];
    return [nxt, stepNote(nxt, 1), nxt, stepNote(nxt, 1)];
  }

  /* ---------- Инструменты ---------- */
  const LAYERS = [
    { id: 'gong', name: 'Гонг агенг', role: 'один удар — конец цикла', ico: '<path class="m" d="M8 6h28" stroke-linecap="round"/><path class="m" d="M11 6v26M33 6v26" /><circle class="m" cx="22" cy="19" r="10"/><circle class="b" cx="22" cy="19" r="3.2"/>' },
    { id: 'kenong', name: 'Кенонг', role: 'делит цикл на четыре', ico: '<ellipse class="m" cx="22" cy="24" rx="15" ry="7"/><path class="m" d="M7 24v5c0 4 30 4 30 0v-5"/><ellipse class="m" cx="22" cy="21" rx="11" ry="4.5"/><circle class="b" cx="22" cy="18" r="3"/>' },
    { id: 'kempul', name: 'Кемпул', role: 'между ударами кенонга', ico: '<path class="m" d="M22 3v6" stroke-linecap="round"/><circle class="m" cx="22" cy="20" r="11"/><circle class="b" cx="22" cy="20" r="3.4"/>' },
    { id: 'kethuk', name: 'Кетук', role: 'слабые доли, глухой «тук»', ico: '<ellipse class="m" cx="22" cy="24" rx="10" ry="5"/><path class="m" d="M12 24v4c0 3 20 3 20 0v-4"/><circle class="b" cx="22" cy="21" r="2.6"/>' },
    { id: 'saron', name: 'Сароны', role: 'балунган — скелет мелодии', ico: '<path class="m" d="M5 30l4-12h26l4 12z"/><rect class="b" x="10" y="12" width="4" height="10" rx="1"/><rect class="b" x="16" y="11" width="4" height="11" rx="1"/><rect class="b" x="22" y="10" width="4" height="12" rx="1"/><rect class="b" x="28" y="11" width="4" height="11" rx="1"/>' },
    { id: 'peking', name: 'Пекинг', role: 'удваивает и забегает вперёд', ico: '<path class="m" d="M9 29l3-9h20l3 9z"/><rect class="b" x="13" y="14" width="3.4" height="8" rx="1"/><rect class="b" x="18.3" y="13" width="3.4" height="9" rx="1"/><rect class="b" x="23.6" y="14" width="3.4" height="8" rx="1"/><rect class="b" x="28.9" y="15" width="3.4" height="7" rx="1"/>' },
    { id: 'bonang', name: 'Бонанг', role: 'две партии, сплетённые в одну', ico: '<path class="m" d="M4 31h36M4 20h36"/><circle class="m" cx="11" cy="15" r="4.5"/><circle class="m" cx="22" cy="15" r="4.5"/><circle class="m" cx="33" cy="15" r="4.5"/><circle class="m" cx="11" cy="26" r="4.5"/><circle class="m" cx="22" cy="26" r="4.5"/><circle class="m" cx="33" cy="26" r="4.5"/><circle class="b" cx="11" cy="15" r="1.6"/><circle class="b" cx="22" cy="26" r="1.6"/><circle class="b" cx="33" cy="15" r="1.6"/>' },
  ];
  const layersEl = $('#layers');
  const layerBtn = {};
  LAYERS.forEach((L) => {
    const li = document.createElement('li');
    li.innerHTML = `<button class="layer" aria-pressed="true" data-id="${L.id}"><svg class="ico" viewBox="0 0 44 36" aria-hidden="true">${L.ico}</svg><span><span class="nm">${L.name}</span><span class="rl">${L.role}</span></span><span class="sw" aria-hidden="true"></span></button>`;
    const b = li.firstElementChild;
    b.addEventListener('click', () => {
      S.on[L.id] = !S.on[L.id];
      b.setAttribute('aria-pressed', S.on[L.id]);
    });
    layerBtn[L.id] = b;
    layersEl.appendChild(li);
  });
  const layerOf = { gong: 'gong', kempul: 'kempul', kenong: 'kenong', kethuk: 'kethuk', saron: 'saron', demung: 'saron', peking: 'peking', polos: 'bonang', sangsih: 'bonang' };

  /* ---------- Звук ---------- */
  let ctx = null, bus = null, noise = null;
  function impulse(sec, decay) {
    const len = Math.floor(sec * ctx.sampleRate);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const early = i < ctx.sampleRate * 0.08 && Math.random() < 0.004 ? 1.6 : 0;
        d[i] = ((Math.random() * 2 - 1) + early) * Math.pow(1 - t, decay) * (i < ctx.sampleRate * 0.012 ? i / (ctx.sampleRate * 0.012) : 1);
      }
    }
    return buf;
  }
  function initAudio() {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC({ latencyHint: 'interactive' });
    const master = ctx.createGain(); master.gain.value = 0.78;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 14; comp.ratio.value = 3; comp.attack.value = 0.006; comp.release.value = 0.3;
    master.connect(comp).connect(ctx.destination);
    const verb = ctx.createConvolver(); verb.buffer = impulse(3.6, 2.8);
    const wet = ctx.createGain(); wet.gain.value = 0.3;
    verb.connect(wet).connect(master);
    bus = ctx.createGain(); bus.gain.value = 1;
    bus.connect(master); bus.connect(verb);
    const nb = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    noise = nb;
  }
  // Сумма синусоид: [отношение частот, амплитуда, время затухания, расстройка в Гц]
  function voice(t, f, spec, gain, pan, attack = 0.004, click = 0) {
    const out = ctx.createGain(); out.gain.value = gain;
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    out.connect(p).connect(bus);
    let end = 0;
    for (const [r, a, d, det = 0] of spec) {
      const o = ctx.createOscillator();
      o.frequency.value = f * r + det;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(a, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(out);
      o.start(t); o.stop(t + d + 0.05);
      end = Math.max(end, d);
    }
    if (click) {
      const s = ctx.createBufferSource(); s.buffer = noise;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = Math.min(9000, f * 3.2); bp.Q.value = 1.4;
      const g = ctx.createGain();
      g.gain.setValueAtTime(click, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
      s.connect(bp).connect(g).connect(out);
      s.start(t); s.stop(t + 0.05);
    }
    setTimeout(() => { out.disconnect(); }, (t - ctx.currentTime + end + 0.4) * 1000);
  }
  const om = (spec, hz) => (S.ombak ? spec.concat([[1, spec[0][1] * 0.85, spec[0][2], hz]]) : spec);
  const SYN = {
    gong: (t) => voice(t, freq({ d: 6, o: -3 }), [[1, 1, 9], [1, 0.75, 8.5, 0.85], [2, 0.5, 6], [2.76, 0.24, 4], [3.92, 0.12, 2.2]], 0.62, 0, 0.03, 0.05),
    kempul: (t, n) => voice(t, freq(n, -1), [[1, 1, 3.8], [1, 0.6, 3.5, 1.6], [2, 0.38, 1.8], [2.9, 0.15, 0.8]], 0.34, -0.25, 0.012, 0.06),
    kenong: (t, n) => voice(t, freq(n), [[1, 1, 3.2], [1, 0.5, 3, 1.1], [2.01, 0.3, 1.6], [2.97, 0.12, 0.7]], 0.27, -0.12, 0.008, 0.08),
    kethuk: (t) => voice(t, freq({ d: 2, o: -1 }), [[1, 1, 0.16], [2.4, 0.4, 0.07]], 0.3, 0.12, 0.002, 0.25),
    saron: (t, n) => voice(t, freq(n), om([[1, 1, 1.6], [2.76, 0.3, 0.45], [5.4, 0.09, 0.18]], 6.2), 0.24, 0.2, 0.003, 0.35),
    demung: (t, n) => voice(t, freq(n, -1), om([[1, 1, 2.3], [2.76, 0.28, 0.7], [5.4, 0.07, 0.25]], 5.1), 0.28, -0.05, 0.004, 0.25),
    peking: (t, n) => voice(t, freq(n, 1), om([[1, 0.9, 0.9], [2.76, 0.24, 0.28]], 7.3), 0.12, 0.35, 0.002, 0.3),
    polos: (t, n) => voice(t, freq(n, 1), om([[1, 1, 0.8], [1.98, 0.42, 0.5], [3.02, 0.16, 0.24]], 6.8), 0.12, -0.45, 0.004, 0.22),
    sangsih: (t, n) => voice(t, freq(n, 1), om([[1, 1, 0.8], [1.98, 0.42, 0.5], [3.02, 0.16, 0.24]], 6.8), 0.12, 0.45, 0.004, 0.22),
  };

  /* ---------- Транспорт ---------- */
  const T = { audio: false, running: true, step: 0, next: 0 };
  const events = [];
  const now = () => (T.audio ? ctx.currentTime : performance.now() / 1000);
  const stepDur = () => 60 / S.tempo / 4;

  function eventsAt(k) {
    const beat = Math.floor(k / 4), sub = k % 4;
    const note = noteAt(beat), nxt = noteAt(beat + 1);
    const pos = (beat % 16) + 1;
    const ev = [];
    if (sub === 0) {
      ev.push(['saron', note], ['demung', note]);
      if (pos % 2 === 1) ev.push(['kethuk']);
      if (pos % 4 === 0) ev.push(['kenong', note]);
      if (pos === 6 || pos === 10 || pos === 14) ev.push(['kempul', note]);
      if (pos === 16) ev.push(['gong']);
    }
    if (sub === 0) ev.push(['peking', note]);
    if (sub === 2) ev.push(['peking', nxt]);
    if (S.dens === 4 || sub % 2 === 0) {
      const fig = figure(note, nxt);
      const part = S.dens === 4 ? (sub % 2 === 0 ? 'polos' : 'sangsih') : (sub === 0 ? 'polos' : 'sangsih');
      ev.push([part, fig[sub]]);
    }
    return ev.map(([i, n]) => ({ i, n, beat, sub, pos }));
  }
  function schedule() {
    if (!T.running) return;
    const horizon = now() + (T.audio ? 0.14 : 0.04);
    let guard = 0;
    while (T.next < horizon && guard++ < 64) {
      for (const e of eventsAt(T.step)) {
        e.t = T.next;
        if (!S.on[layerOf[e.i]]) continue;
        if (T.audio) SYN[e.i](Math.max(T.next, ctx.currentTime + 0.005), e.n);
        events.push(e);
      }
      T.next += stepDur();
      T.step++;
    }
  }
  setInterval(schedule, 25);

  /* ---------- Кнопка-гонг ---------- */
  const boss = $('#boss'), bossT = $('#bossT'), bossS = $('#bossS');
  function setBoss() {
    if (!T.audio) { bossT.textContent = 'Ударить'; bossS.textContent = 'включить звук'; boss.setAttribute('aria-label', 'Ударить в гонг и включить звук'); }
    else if (T.running) { bossT.textContent = 'Тише'; bossS.textContent = 'пауза'; boss.setAttribute('aria-label', 'Пауза'); }
    else { bossT.textContent = 'Играть'; bossS.textContent = 'продолжить'; boss.setAttribute('aria-label', 'Продолжить'); }
  }
  boss.addEventListener('click', async () => {
    if (!ctx) {
      initAudio();
      await ctx.resume();
      // Вступаем с удара гонга: следующая доля — шестнадцатая, последняя в гонгане
      const beat = Math.floor(T.step / 4);
      const g = Math.floor(beat / 16) * 16 + 15;
      T.step = g * 4;
      T.audio = true; T.running = true;
      T.next = ctx.currentTime + 0.06;
      events.length = 0;
      setBoss();
      return;
    }
    if (T.running) { T.running = false; await ctx.suspend(); }
    else { await ctx.resume(); T.running = true; T.next = ctx.currentTime + 0.05; }
    setBoss();
  });

  /* ---------- Управление ---------- */
  function paintRange(el) { el.style.setProperty('--p', ((el.value - el.min) / (el.max - el.min)) * 100 + '%'); }
  const tempoEl = $('#tempo');
  tempoEl.addEventListener('input', () => {
    // сохраняем текущую позицию в цикле
    const pos = stepFloat();
    S.tempo = +tempoEl.value;
    T.next = now() + (T.step - pos) * stepDur();
    $('#tempoOut').textContent = S.tempo + ' уд/мин';
    paintRange(tempoEl);
  });
  paintRange(tempoEl);
  document.querySelectorAll('[data-tuning]').forEach((b) => b.addEventListener('click', () => {
    S.tuning = b.dataset.tuning;
    document.querySelectorAll('[data-tuning]').forEach((x) => { const on = x === b; x.classList.toggle('is-on', on); x.setAttribute('aria-checked', on); });
    $('#tuningNote').textContent = TUNINGS[S.tuning].note;
  }));
  document.querySelectorAll('[data-dens]').forEach((b) => b.addEventListener('click', () => {
    S.dens = +b.dataset.dens;
    document.querySelectorAll('[data-dens]').forEach((x) => { const on = x === b; x.classList.toggle('is-on', on); x.setAttribute('aria-checked', on); });
  }));
  const ombakBtn = $('#ombak');
  ombakBtn.addEventListener('click', () => { S.ombak = !S.ombak; ombakBtn.setAttribute('aria-pressed', S.ombak); });
  $('#tuningNote').textContent = TUNINGS[S.tuning].note;
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && e.target === document.body) { e.preventDefault(); boss.click(); }
  });

  const digitsTxt = (g) => BALUNGAN[g].map((n, i) => (i % 4 === 0 && i ? ' ' : '') + n.d + (n.o > 0 ? '̇' : n.o < 0 ? '̣' : '')).join('');
  $('#notation').textContent = 'Балунган: ' + digitsTxt(0) + '  ·  ' + digitsTxt(1);

  /* ---------- Часы ---------- */
  const cv = $('#clock'), c2 = cv.getContext('2d');
  const stage = $('#stage');
  let W = 0, H = 0, R = 0, CX = 0, CY = 0, DPR = 1;
  let backCanvas = null, glow = null, glowCoral = null;
  const hits = new Map();            // ключ → время удара
  const ripples = [];
  const lamps = Array.from({ length: 14 }, (_, i) => ({ x: Math.random(), y: Math.random(), r: 30 + Math.random() * 90, s: 0.004 + Math.random() * 0.01, ph: Math.random() * 6.28, a: 0.03 + Math.random() * 0.05 }));

  function sprite(color, size) {
    const s = document.createElement('canvas'); s.width = s.height = size;
    const g = s.getContext('2d');
    const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gr.addColorStop(0, color); gr.addColorStop(0.25, color.replace(/[\d.]+\)$/, '0.55)')); gr.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
    g.fillStyle = gr; g.fillRect(0, 0, size, size);
    return s;
  }
  const ang = (b) => -Math.PI / 2 + ((b + 1) / 16) * Math.PI * 2; // b: 0 → первая доля, 15 → гонг наверху

  function resize() {
    const r = stage.getBoundingClientRect();
    DPR = SHOT ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    const narrow = W < 700;
    R = Math.min(W * (narrow ? 0.43 : 0.37), H * (narrow ? 0.43 : 0.365));
    CX = W / 2; CY = narrow ? H * 0.47 : H * 0.465;
    const bs = Math.round(R * (narrow ? 0.56 : 0.5));
    stage.style.setProperty('--bs', bs + 'px');
    boss.classList.toggle('compact', bs < 110);
    boss.style.top = CY + 'px';
    glow = sprite('rgba(255,226,160,1)', 128);
    glowCoral = sprite('rgba(255,150,110,1)', 128);
    drawBack();
  }
  window.addEventListener('resize', resize);

  function drawBack() {
    backCanvas = document.createElement('canvas');
    backCanvas.width = cv.width; backCanvas.height = cv.height;
    const g = backCanvas.getContext('2d');
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    // тёплое сияние за часами
    const halo = g.createRadialGradient(CX, CY, R * 0.2, CX, CY, R * 1.5);
    halo.addColorStop(0, 'rgba(120,30,20,.55)'); halo.addColorStop(0.6, 'rgba(70,14,12,.25)'); halo.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = halo; g.fillRect(0, 0, W, H);
    // резной пояс
    const r0 = R * 1.02, r1 = R * 1.13;
    g.beginPath(); g.arc(CX, CY, r1, 0, Math.PI * 2); g.arc(CX, CY, r0, 0, Math.PI * 2, true);
    const lac = g.createRadialGradient(CX, CY, r0, CX, CY, r1);
    lac.addColorStop(0, '#4a0f0e'); lac.addColorStop(0.5, '#6e1614'); lac.addColorStop(1, '#3d0c0b');
    g.fillStyle = lac; g.fill();
    g.strokeStyle = 'rgba(226,179,92,.75)'; g.lineWidth = 1.2;
    [r0, r1, R * 1.15].forEach((rr) => { g.beginPath(); g.arc(CX, CY, rr, 0, Math.PI * 2); g.stroke(); });
    // завитки
    const n = 48, rm = (r0 + r1) / 2, sz = (r1 - r0) * 0.36;
    g.strokeStyle = 'rgba(226,179,92,.55)'; g.lineWidth = 1.1;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      g.save(); g.translate(CX + Math.cos(a) * rm, CY + Math.sin(a) * rm); g.rotate(a + Math.PI / 2);
      g.beginPath();
      for (let k = 0; k <= 26; k++) {
        const t = k / 26, rr = sz * (1 - t * 0.85), th = t * Math.PI * 2.2;
        const x = -sz * 0.9 + t * sz * 0.9 + Math.cos(th) * rr * 0.5, y = Math.sin(th) * rr * 0.5;
        k ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.stroke();
      g.beginPath(); g.arc(sz * 0.55, 0, sz * 0.16, 0, Math.PI * 2); g.fillStyle = 'rgba(226,179,92,.5)'; g.fill();
      g.restore();
    }
    // риски шестнадцатых
    for (let i = 0; i < 64; i++) {
      const a = -Math.PI / 2 + (i / 64) * Math.PI * 2;
      const big = i % 4 === 0;
      g.strokeStyle = big ? 'rgba(226,179,92,.7)' : 'rgba(226,179,92,.28)';
      g.lineWidth = big ? 1.4 : 1;
      const a0 = R * (big ? 0.955 : 0.975), a1 = R * 0.995;
      g.beginPath(); g.moveTo(CX + Math.cos(a) * a0, CY + Math.sin(a) * a0); g.lineTo(CX + Math.cos(a) * a1, CY + Math.sin(a) * a1); g.stroke();
    }
    // внутренние орбиты
    g.strokeStyle = 'rgba(226,179,92,.16)'; g.lineWidth = 1;
    [0.72, 0.53, 0.3].forEach((k) => { g.beginPath(); g.arc(CX, CY, R * k, 0, Math.PI * 2); g.stroke(); });
  }

  function stepFloat() { return T.step - (T.next - now()) / stepDur(); }
  const decay = (key, t, tau) => {
    const h = hits.get(key);
    if (h == null || t < h) return 0;
    return Math.exp(-(t - h) / tau);
  };

  const RADII = { digits: 0.865, colo: 0.72, bars: 0.63, polos: 0.53, sangsih: 0.45 };
  function draw() {
    requestAnimationFrame(draw);
    const t = now();
    // события → вспышки
    while (events.length && events[0].t <= t) {
      const e = events.shift();
      const key = e.i + ':' + (e.i === 'polos' || e.i === 'sangsih' ? e.beat * 4 + e.sub : e.beat);
      hits.set(key, e.t);
      hits.set('L:' + layerOf[e.i], e.t);
      const b = e.beat % 16;
      if (e.i === 'gong') { ripples.push({ x: CX, y: CY, r0: R * 0.26, r1: R * 1.25, t0: e.t, dur: 2.6, w: 3, c: '247,218,152' }); boss.classList.remove('ring'); void boss.offsetWidth; boss.classList.add('ring'); }
      if (e.i === 'kenong' || e.i === 'kempul') {
        const a = ang(b), rr = R * RADII.colo;
        ripples.push({ x: CX + Math.cos(a) * rr, y: CY + Math.sin(a) * rr, r0: 8, r1: e.i === 'kenong' ? R * 0.2 : R * 0.15, t0: e.t, dur: 1.4, w: 1.6, c: e.i === 'kenong' ? '226,179,92' : '220,80,60' });
      }
    }
    for (const L of LAYERS) layerBtn[L.id].classList.toggle('hit', decay('L:' + L.id, t, 0.12) > 0.35);
    if (hits.size > 1500) for (const [k, v] of hits) if (t - v > 8) hits.delete(k);

    c2.setTransform(DPR, 0, 0, DPR, 0, 0);
    c2.clearRect(0, 0, W, H);
    // лампы
    c2.globalCompositeOperation = 'lighter';
    const tt = performance.now() / 1000;
    for (const l of lamps) {
      const x = (l.x + Math.sin(tt * l.s * 6 + l.ph) * 0.02) * W, y = ((l.y - tt * l.s * 0.3) % 1 + 1) % 1 * H;
      c2.globalAlpha = l.a * (0.7 + 0.3 * Math.sin(tt * 1.3 + l.ph));
      c2.drawImage(glow, x - l.r, y - l.r, l.r * 2, l.r * 2);
    }
    c2.globalAlpha = 1;
    c2.globalCompositeOperation = 'source-over';
    c2.setTransform(1, 0, 0, 1, 0, 0);
    c2.drawImage(backCanvas, 0, 0);
    c2.setTransform(DPR, 0, 0, DPR, 0, 0);

    const sf = stepFloat();
    const beatF = sf / 4;
    const curBeat = Math.floor(beatF);
    const gIdx = Math.floor(curBeat / 16) % BALUNGAN.length;
    const gStart = Math.floor(curBeat / 16) * 16;
    const posInG = beatF - gStart;             // 0..16

    // стрелка со шлейфом
    const aNow = -Math.PI / 2 + ((posInG + 1) / 16) * Math.PI * 2;
    c2.lineCap = 'round';
    for (let k = 26; k >= 0; k--) {
      const a = aNow - k * 0.012;
      c2.strokeStyle = `rgba(242,196,120,${(1 - k / 26) * 0.2})`;
      c2.lineWidth = k === 0 ? 2 : 3;
      c2.beginPath(); c2.moveTo(CX + Math.cos(a) * R * 0.3, CY + Math.sin(a) * R * 0.3); c2.lineTo(CX + Math.cos(a) * R * 1.0, CY + Math.sin(a) * R * 1.0); c2.stroke();
    }
    c2.strokeStyle = 'rgba(255,236,190,.95)'; c2.lineWidth = 1.6;
    c2.beginPath(); c2.moveTo(CX + Math.cos(aNow) * R * 0.3, CY + Math.sin(aNow) * R * 0.3); c2.lineTo(CX + Math.cos(aNow) * R * 1.0, CY + Math.sin(aNow) * R * 1.0); c2.stroke();

    // переплетение: две партии — две кольцевые «кардиограммы»
    const bars = [];
    const threads = { polos: [], sangsih: [] };
    for (let b = 0; b < 16; b++) {
      const beat = gStart + b;
      const note = noteAt(beat), nxt = noteAt(beat + 1);
      const fig = figure(note, nxt);
      for (let s = 0; s < 4; s++) {
        if (S.dens === 2 && s % 2) continue;
        const part = S.dens === 4 ? (s % 2 === 0 ? 'polos' : 'sangsih') : (s === 0 ? 'polos' : 'sangsih');
        const k = beat * 4 + s;
        const a = -Math.PI / 2 + ((b + s / 4 + 1) / 16) * Math.PI * 2;
        const pi = pitchIndex(fig[s]);
        const rr = R * (part === 'polos' ? RADII.polos : RADII.sangsih) + (pi - 4) * R * 0.012;
        const f = S.on.bonang ? decay(part + ':' + k, t, 0.32) : 0;
        const past = b + s / 4 < posInG - 0.01;
        const x = CX + Math.cos(a) * rr, y = CY + Math.sin(a) * rr;
        if (past) threads[part].push([x, y]);
        const base = S.on.bonang ? (past ? 0.8 : 0.34) : 0.12;
        c2.fillStyle = part === 'polos' ? `rgba(242,198,109,${Math.min(1, base + f * 0.3)})` : `rgba(255,138,107,${Math.min(1, base + f * 0.3)})`;
        c2.beginPath(); c2.arc(x, y, (past ? 3.4 : 2.6) * (R / 330) + f * 3.4, 0, Math.PI * 2); c2.fill();
        if (f > 0.05) {
          c2.globalCompositeOperation = 'lighter'; c2.globalAlpha = f * 0.9;
          const spr = part === 'polos' ? glow : glowCoral, sz = 26 + f * 20;
          c2.drawImage(spr, x - sz / 2, y - sz / 2, sz, sz);
          c2.globalAlpha = 1; c2.globalCompositeOperation = 'source-over';
        }
      }
      // балунган: радиальные планки по высоте тона
      const pi = pitchIndex(note);
      const a = ang(b);
      const f = S.on.saron ? decay('saron:' + beat, t, 0.45) : 0;
      const len = R * (0.035 + (pi + 2) * 0.011);
      const r0 = R * RADII.bars - len / 2;
      bars.push([a, r0, len, f, b < posInG - 0.01]);
    }
    if (S.on.bonang) for (const [part, pts] of Object.entries(threads)) {
      if (pts.length < 2) continue;
      c2.strokeStyle = part === 'polos' ? 'rgba(242,198,109,.38)' : 'rgba(255,138,107,.38)';
      c2.lineWidth = 1.2; c2.lineJoin = 'round';
      c2.beginPath(); pts.forEach(([x, y], i) => (i ? c2.lineTo(x, y) : c2.moveTo(x, y))); c2.stroke();
    }
    for (const [a, r0, len, f, past] of bars) {
      c2.strokeStyle = `rgba(226,179,92,${(S.on.saron ? (past ? 0.62 : 0.3) : 0.12) + f * 0.38})`;
      c2.lineWidth = 5 + f * 3;
      c2.beginPath(); c2.moveTo(CX + Math.cos(a) * r0, CY + Math.sin(a) * r0); c2.lineTo(CX + Math.cos(a) * (r0 + len), CY + Math.sin(a) * (r0 + len)); c2.stroke();
    }

    // колотомические отметки
    for (let b = 0; b < 16; b++) {
      const pos = b + 1, beat = gStart + b;
      const a = ang(b), rr = R * RADII.colo;
      const x = CX + Math.cos(a) * rr, y = CY + Math.sin(a) * rr;
      let kind = null;
      if (pos === 16) kind = 'gong'; else if (pos % 4 === 0) kind = 'kenong'; else if (pos === 6 || pos === 10 || pos === 14) kind = 'kempul'; else if (pos % 2 === 1) kind = 'kethuk';
      if (!kind) { c2.fillStyle = 'rgba(226,179,92,.25)'; c2.beginPath(); c2.arc(x, y, 1.8, 0, Math.PI * 2); c2.fill(); continue; }
      const f = S.on[kind] ? Math.max(decay(kind + ':' + beat, t, kind === 'gong' ? 1.2 : 0.5), 0) : 0;
      const dim = S.on[kind] ? 1 : 0.35;
      if (f > 0.02) {
        c2.globalCompositeOperation = 'lighter'; c2.globalAlpha = f;
        const sz = (kind === 'gong' ? 150 : kind === 'kethuk' ? 40 : 90) * (0.6 + f * 0.6) * (R / 330);
        c2.drawImage(kind === 'kempul' ? glowCoral : glow, x - sz / 2, y - sz / 2, sz, sz);
        c2.globalAlpha = 1; c2.globalCompositeOperation = 'source-over';
      }
      c2.globalAlpha = dim;
      if (kind === 'kethuk') {
        c2.strokeStyle = `rgba(226,179,92,${0.6 + f * 0.4})`; c2.lineWidth = 1.4;
        c2.beginPath(); c2.arc(x, y, R * 0.018 + f * 2, 0, Math.PI * 2); c2.stroke();
      } else {
        const rad = R * (kind === 'gong' ? 0.075 : kind === 'kenong' ? 0.045 : 0.037) * (1 + f * 0.12);
        const grd = c2.createRadialGradient(x - rad * 0.35, y - rad * 0.35, rad * 0.1, x, y, rad);
        if (kind === 'kempul') { grd.addColorStop(0, '#c9362c'); grd.addColorStop(1, '#5d0f0c'); }
        else { grd.addColorStop(0, f > 0.2 ? '#fff0c2' : '#f2cf85'); grd.addColorStop(0.55, '#c8903a'); grd.addColorStop(1, '#6b4513'); }
        c2.fillStyle = grd; c2.beginPath(); c2.arc(x, y, rad, 0, Math.PI * 2); c2.fill();
        c2.strokeStyle = 'rgba(247,218,152,.85)'; c2.lineWidth = 1.2; c2.stroke();
        // выпуклый «сосок» гонга
        c2.fillStyle = kind === 'kempul' ? 'rgba(247,218,152,.9)' : 'rgba(90,50,12,.55)';
        c2.beginPath(); c2.arc(x, y, rad * 0.32, 0, Math.PI * 2); c2.fill();
      }
      c2.globalAlpha = 1;
    }

    // цифры балунгана (запись кепатихан)
    const bal = BALUNGAN[gIdx];
    c2.textAlign = 'center'; c2.textBaseline = 'middle';
    const fs = Math.max(15, R * 0.075);
    c2.font = `400 ${fs}px Forum, Georgia, serif`;
    for (let b = 0; b < 16; b++) {
      const n = bal[b], a = ang(b), rr = R * RADII.digits;
      const x = CX + Math.cos(a) * rr, y = CY + Math.sin(a) * rr;
      const f = decay('saron:' + (gStart + b), t, 0.6);
      const past = b < posInG - 0.01;
      c2.fillStyle = f > 0.05 ? `rgba(255,240,205,${0.75 + f * 0.25})` : past ? 'rgba(226,179,92,.95)' : 'rgba(226,179,92,.5)';
      c2.fillText(String(n.d), x, y + 1);
      if (n.o) {
        const dr = rr + (n.o > 0 ? 1 : -1) * fs * 0.62;
        c2.beginPath(); c2.arc(CX + Math.cos(a) * dr, CY + Math.sin(a) * dr, 2.2, 0, Math.PI * 2); c2.fill();
      }
    }
    // номер гонгана под часами
    c2.font = `400 ${Math.max(13, R * 0.045)}px Commissioner, sans-serif`;
    c2.fillStyle = 'rgba(208,181,148,.9)';
    c2.fillText(`гонган ${gIdx + 1} из ${BALUNGAN.length} · удар ${Math.min(16, Math.floor(posInG) + 1)} из 16`, CX, CY + R * 1.24);

    // круги от ударов
    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i], k = (t - r.t0) / r.dur;
      if (k < 0) continue;
      if (k >= 1) { ripples.splice(i, 1); continue; }
      const e = 1 - Math.pow(1 - k, 3);
      c2.strokeStyle = `rgba(${r.c},${(1 - k) * 0.55})`;
      c2.lineWidth = r.w * (1 - k * 0.6);
      c2.beginPath(); c2.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * e, 0, Math.PI * 2); c2.stroke();
    }
  }

  /* ---------- Старт: беззвучная игра видна сразу ---------- */
  resize();
  T.next = now() + 0.2;
  if (SHOT) { T.step = 4 * 9; }
  setBoss();
  if (reduceMotion) S.tempo = Math.min(S.tempo, 60);
  requestAnimationFrame(draw);
  if (document.fonts) document.fonts.ready.then(() => { drawBack(); });
})();
