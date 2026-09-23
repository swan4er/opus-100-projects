/* Фигуры Хладни — вынужденные колебания пластины через разложение по собственным модам и песок. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const reduceMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const NB = ' ';
  const fmtHz = (f) => (f >= 1000 ? Math.round(f).toString().replace(/\B(?=(\d{3})+(?!\d))/g, NB) : f >= 100 ? Math.round(f).toString() : (Math.round(f * 10) / 10).toString().replace('.', ','));

  // ---------- Решатель мод: синхронно и в фоновом потоке ----------
  const API = SOLVER();
  let worker = null, reqId = 0;
  const pending = new Map();
  try {
    const src = `const API=(${SOLVER.toString()})();self.onmessage=(e)=>{const r=API.compute(e.data);self.postMessage({id:e.data.id,r},r.modes.map((m)=>m.vec.buffer));};`;
    worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    worker.onmessage = (e) => { const cb = pending.get(e.data.id); pending.delete(e.data.id); if (cb) cb(e.data.r); };
    worker.onerror = () => { worker = null; };
  } catch (e) { worker = null; }
  function computeModes(req, cb) {
    if (!worker || req.shape === 'square' || req.shape === 'rect') { cb(API.compute(req)); return; }
    const id = ++reqId; req.id = id; pending.set(id, cb); worker.postMessage(req);
  }

  // ---------- Состояние ----------
  const C_HZ = 9.2;           // частота = C·λ: пластина, а не мембрана (ω ∝ k²)
  const QF = 42;              // добротность
  const N = 72;
  const DRIVE = { square: [0.06, 0.06], rect: [0.17, 0.05], circle: [0.5, 0.045], guitar: [0.5, 0.77] };
  const st = {
    shape: 'square', drive: DRIVE.square.slice(), data: null,
    f: 400, fTarget: 400, fStart: 400, glideT: 1, glideDur: 1.2,
    ure: new Float32Array(N * N), uim: new Float32Array(N * N), amp: new Float32Array(N * N), gx: new Float32Array(N * N), gy: new Float32Array(N * N),
    activity: 0, energy: 0, dominant: -1,
    spectrum: null, res: [],
    tour: true, tourIdx: 0, tourNext: 0, wave: false, sound: false,
    dirtyField: true,
  };
  const P = window.innerWidth < 860 ? 9000 : 15000;
  const px = new Float32Array(P), py = new Float32Array(P);

  // ---------- Холсты ----------
  const cv = $('plate'), ctx = cv.getContext('2d');
  const sc = $('spec'), sctx = sc.getContext('2d');
  let W = 0, H = 0, SW = 0, SH = 0, DPR = 1;
  let D = 560;                                   // разрешение буфера песка
  const sandCv = document.createElement('canvas'), sandCtx = sandCv.getContext('2d');
  let sandImg = null, sandBuf = null, dens = null;
  const plateCv = document.createElement('canvas'), plateCtx = plateCv.getContext('2d');
  const waveCv = document.createElement('canvas'); waveCv.width = waveCv.height = N;
  const waveCtx = waveCv.getContext('2d'); const waveImg = waveCtx.createImageData(N, N);
  let plateRect = { x: 0, y: 0, s: 1 };

  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    const r = cv.getBoundingClientRect(); W = r.width; H = r.height;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    const r2 = sc.getBoundingClientRect(); SW = r2.width; SH = r2.height;
    sc.width = Math.round(SW * DPR); sc.height = Math.round(SH * DPR);
    const size = Math.min(W - 60, H - 60);
    plateRect = { x: (W - size) / 2, y: (H - size) / 2, s: size };
    const want = Math.round(clamp(size * Math.min(DPR, 1.5), 320, 900));
    if (want !== D || !sandImg) {
      D = want; sandCv.width = sandCv.height = D; sandImg = sandCtx.createImageData(D, D); sandBuf = new Uint32Array(sandImg.data.buffer); dens = new Float32Array(D * D);
    }
    buildPlateTexture();
    drawSpectrum();
  }

  // ---------- Текстура пластины: воронёная сталь с шлифовкой ----------
  function buildPlateTexture() {
    if (!st.data) return;
    const S = Math.max(256, Math.round(plateRect.s * DPR));
    plateCv.width = plateCv.height = S;
    const g = plateCtx;
    g.clearRect(0, 0, S, S);
    // Маска формы
    const path = new Path2D();
    const shapePath = (p, s) => {
      if (st.shape === 'square') p.rect(0, 0, s, s);
      else if (st.shape === 'rect') p.rect(0.14 * s, 0.02 * s, 0.72 * s, 0.96 * s);
      else if (st.shape === 'circle') p.arc(0.5 * s, 0.5 * s, 0.48 * s, 0, Math.PI * 2);
      else {
        // контур деки гитары: обходим маску по углу из центра каждой «деки»
        const pts = [];
        for (let a = 0; a < 360; a += 2) {
          const t = a * Math.PI / 180;
          let lo = 0, hi = 0.6;
          const cx = 0.5, cy = 0.5;
          for (let k = 0; k < 18; k++) { const m = (lo + hi) / 2; if (API.inside('guitar', cx + Math.cos(t) * m, cy + Math.sin(t) * m) || Math.hypot(Math.cos(t) * m, cy + Math.sin(t) * m - 0.395) < 0.09) lo = m; else hi = m; }
          pts.push([(cx + Math.cos(t) * lo) * s, (cy + Math.sin(t) * lo) * s]);
        }
        p.moveTo(pts[0][0], pts[0][1]); for (const q of pts) p.lineTo(q[0], q[1]); p.closePath();
      }
    };
    shapePath(path, S);
    g.save();
    g.clip(path);
    const base = g.createLinearGradient(0, 0, S, S);
    base.addColorStop(0, '#2a2d33'); base.addColorStop(0.45, '#17191d'); base.addColorStop(1, '#0f1013');
    g.fillStyle = base; g.fillRect(0, 0, S, S);
    // Шлифовка: тонкие горизонтальные штрихи
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < S * 1.6; i++) {
      const y = rnd() * S, x = rnd() * S * 1.2 - S * 0.1, len = S * (0.05 + rnd() * 0.3);
      g.strokeStyle = rnd() < 0.5 ? `rgba(255,255,255,${0.015 + rnd() * 0.03})` : `rgba(0,0,0,${0.03 + rnd() * 0.05})`;
      g.lineWidth = Math.max(0.5, S / 900); g.beginPath(); g.moveTo(x, y); g.lineTo(x + len, y + (rnd() - 0.5) * 2); g.stroke();
    }
    // Боковой свет сверху слева
    const hl = g.createRadialGradient(S * 0.18, S * 0.12, 0, S * 0.18, S * 0.12, S * 0.9);
    hl.addColorStop(0, 'rgba(255,240,215,0.14)'); hl.addColorStop(0.5, 'rgba(255,240,215,0.03)'); hl.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = hl; g.fillRect(0, 0, S, S);
    g.restore();
    // Фаска
    g.save();
    g.lineWidth = Math.max(1.5, S / 260);
    g.strokeStyle = 'rgba(255,236,210,0.28)'; g.translate(-0.6, -0.6); g.stroke(path);
    g.strokeStyle = 'rgba(0,0,0,0.7)'; g.translate(1.6, 1.6); g.stroke(path);
    g.restore();
    if (st.shape === 'guitar') {
      g.save();
      g.beginPath(); g.arc(0.5 * S, 0.395 * S, 0.085 * S, 0, Math.PI * 2); g.fillStyle = '#050506'; g.fill();
      g.strokeStyle = 'rgba(224,168,75,0.55)'; g.lineWidth = S / 280;
      for (const r of [0.097, 0.106, 0.112]) { g.beginPath(); g.arc(0.5 * S, 0.395 * S, r * S, 0, Math.PI * 2); g.stroke(); }
      g.restore();
    }
    st.platePath = path; st.plateS = S;
  }

  // ---------- Моды и отклик ----------
  function setShape(shape, keepDrive) {
    st.shape = shape;
    for (const b of document.querySelectorAll('#shapes .chip')) b.classList.toggle('on', b.dataset.shape === shape);
    if (!keepDrive) st.drive = DRIVE[shape].slice();
    loadModes(true);
  }
  function loadModes(reseed) {
    $('busy').hidden = st.shape === 'square' || st.shape === 'rect';
    const req = { shape: st.shape, N, maxModes: 40, drive: st.drive };
    const shape = st.shape;
    computeModes(req, (data) => {
      if (shape !== st.shape) return;
      $('busy').hidden = true;
      data.modes.forEach((m) => { m.f = C_HZ * m.lambda; });
      st.data = data;
      updateDriveCoupling();
      buildPlateTexture();
      pickTourList();
      if (reseed) {
        const f0 = st.res.length ? st.res[Math.min(st.res.length - 1, 5)].f : 300;
        setFreq(f0, true);
        computeField();
        seedSand(true);
        st.tourIdx = Math.min(st.res.length - 1, 5); st.tourNext = performance.now() + 6500;
      } else computeField();
      drawSpectrum();
    });
  }
  function sampleMode(vec, x, y) {
    const fx = clamp(x * N - 0.5, 0, N - 1.001), fy = clamp(y * N - 0.5, 0, N - 1.001);
    const i = fx | 0, j = fy | 0, u = fx - i, v = fy - j;
    const a = vec[j * N + i], b = vec[j * N + i + 1], c = vec[(j + 1) * N + i], d = vec[(j + 1) * N + i + 1];
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
  }
  function updateDriveCoupling() {
    const [x, y] = st.drive;
    for (const m of st.data.modes) {
      // Возбуждение — небольшое пятно вокруг смычка
      let s = 0, w = 0;
      for (let k = 0; k < 5; k++) { const ox = [0, 0.01, -0.01, 0, 0][k], oy = [0, 0, 0, 0.01, -0.01][k]; s += sampleMode(m.vec, x + ox, y + oy); w++; }
      m.phi0 = s / w;
    }
    // Список резонансов — моды, которые смычок реально раскачивает
    const maxC = Math.max(...st.data.modes.map((m) => m.phi0 * m.phi0 / (m.f * m.f)));
    const strong = st.data.modes.filter((m) => m.phi0 * m.phi0 / (m.f * m.f) > maxC * 0.0002).sort((a, b) => a.f - b.f);
    // Вырожденные пары звучат на одной частоте — оставляем одну метку
    st.res = strong.filter((m, i) => i === 0 || m.f > strong[i - 1].f * 1.006);
    computeSpectrum();
  }
  function coeff(m, f) {
    const r = f / m.f;
    const re = 1 - r * r, im = r / QF;
    const den = (re * re + im * im) * m.f * m.f;
    return [m.phi0 * re / den, -m.phi0 * im / den];
  }
  function energyAt(f) {
    let e = 0;
    for (const m of st.data.modes) { const [a, b] = coeff(m, f); e += a * a + b * b; }
    return e;
  }
  const F_MIN = 60;
  let F_MAX = 3000;
  function computeSpectrum() {
    const n = 700;
    const fmax = Math.min(4200, Math.max(1200, st.data.modes[st.data.modes.length - 1].f * 1.04));
    F_MAX = fmax;
    const arr = new Float32Array(n);
    for (let i = 0; i < n; i++) arr[i] = energyAt(F_MIN * Math.pow(F_MAX / F_MIN, i / (n - 1)));
    st.spectrum = arr;
  }
  function computeField() {
    const modes = st.data.modes, f = st.f;
    const ure = st.ure, uim = st.uim;
    ure.fill(0); uim.fill(0);
    let e = 0, best = -1, bestV = 0;
    modes.forEach((m, k) => {
      const [a, b] = coeff(m, f);
      const mag = a * a + b * b; e += mag;
      if (mag > bestV) { bestV = mag; best = k; }
      if (mag < 1e-18) return;
      const v = m.vec;
      for (let i = 0; i < v.length; i++) { const val = v[i]; if (val) { ure[i] += a * val; uim[i] += b * val; } }
    });
    st.energy = e; st.dominant = best;
    let mx = 1e-30;
    const amp = st.amp, mask = st.data.mask;
    for (let i = 0; i < amp.length; i++) { amp[i] = mask[i] ? Math.hypot(ure[i], uim[i]) : 0; if (amp[i] > mx) mx = amp[i]; }
    for (let i = 0; i < amp.length; i++) amp[i] /= mx;
    // У края продолжаем поле наружу, чтобы интерполяция не «замораживала» песок у границы
    for (let pass = 0; pass < 2; pass++) {
      const filled = new Uint8Array(amp.length);
      for (let i = 0; i < amp.length; i++) filled[i] = mask[i] || (pass > 0 && amp[i] > 0) ? 1 : 0;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const k = j * N + i; if (filled[k]) continue;
        let sum = 0, n = 0;
        if (i > 0 && filled[k - 1]) { sum += amp[k - 1]; n++; }
        if (i < N - 1 && filled[k + 1]) { sum += amp[k + 1]; n++; }
        if (j > 0 && filled[k - N]) { sum += amp[k - N]; n++; }
        if (j < N - 1 && filled[k + N]) { sum += amp[k + N]; n++; }
        if (n) amp[k] = sum / n;
      }
    }
    // Градиент квадрата амплитуды — песок сползает к узлам
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i;
      const l = amp[j * N + Math.max(0, i - 1)], r = amp[j * N + Math.min(N - 1, i + 1)], u = amp[Math.max(0, j - 1) * N + i], d = amp[Math.min(N - 1, j + 1) * N + i];
      st.gx[k] = (r * r - l * l) * 0.5; st.gy[k] = (d * d - u * u) * 0.5;
    }
    // Активность: насколько мы близко к резонансу доминирующей моды
    const dm = modes[best];
    const peak = dm ? energyAt(dm.f) : e;
    st.activity = clamp(Math.sqrt(e / peak), 0, 1);
    st.dirtyField = false;
    updateModeInfo();
  }
  function ampAt(x, y) { return sampleMode(st.amp, x, y); }

  // ---------- Песок ----------
  function insideMask(x, y) {
    if (x <= 0.004 || y <= 0.004 || x >= 0.996 || y >= 0.996) return false;
    return API.inside(st.shape, x, y);
  }
  function seedSand(formed) {
    let n = 0, guard = 0;
    while (n < P && guard < P * 60) {
      guard++;
      const x = Math.random(), y = Math.random();
      if (!insideMask(x, y)) continue;
      if (formed) { const a = ampAt(x, y); if (Math.random() > Math.exp(-(a / 0.1) * (a / 0.1))) continue; }
      px[n] = x; py[n] = y; n++;
    }
    for (; n < P; n++) { px[n] = px[n % Math.max(1, n)]; py[n] = py[n % Math.max(1, n)]; }
  }
  function gauss() { let u = 0, v = 0; while (u === 0) u = Math.random(); v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2832 * v); }
  function stepSand(dt) {
    const g = st.activity;
    if (g < 0.02) return;
    const k = Math.min(2, dt * 60);
    const jump = 0.0062 * g * k, drift = 0.0028 * g * k;
    for (let i = 0; i < P; i++) {
      const x = px[i], y = py[i];
      const fx = clamp(x * N - 0.5, 0, N - 1.001), fy = clamp(y * N - 0.5, 0, N - 1.001);
      const ci = (fy | 0) * N + (fx | 0);
      const a = ampAt(x, y);
      if (a < 0.025) continue;
      const s = jump * Math.pow(a, 1.35);
      let nx = x + gauss() * s - st.gx[ci] * drift * 8;
      let ny = y + gauss() * s - st.gy[ci] * drift * 8;
      if (!insideMask(nx, ny)) { nx = x + (Math.random() - 0.5) * s * 0.3; ny = y + (Math.random() - 0.5) * s * 0.3; if (!insideMask(nx, ny)) continue; }
      px[i] = nx; py[i] = ny;
    }
  }
  function renderSand() {
    dens.fill(0);
    for (let i = 0; i < P; i++) {
      const x = (px[i] * D) | 0, y = (py[i] * D) | 0;
      if (x > 0 && y > 0 && x < D - 1 && y < D - 1) { dens[y * D + x] += 1; dens[y * D + x + 1] += 0.35; dens[(y + 1) * D + x] += 0.35; }
    }
    // Песок: плотность → яркость, со сдвинутой тенью
    for (let y = 1; y < D; y++) {
      for (let x = 1; x < D; x++) {
        const k = y * D + x;
        const d = dens[k], sh = dens[k - D - 1] * 0.8 + dens[k - 1] * 0.2;
        const a = 1 - Math.exp(-d * 0.95), as = (1 - Math.exp(-sh * 0.8)) * 0.55;
        if (a < 0.01 && as < 0.01) { sandBuf[k] = 0; continue; }
        const lum = 0.72 + 0.28 * a;
        const r = 244 * lum, gch = 236 * lum, b = 219 * lum;
        const outA = a + as * (1 - a);
        const rr = (r * a) / outA, gg = (gch * a) / outA, bb = (b * a) / outA;
        sandBuf[k] = ((outA * 255) << 24) | ((bb & 255) << 16) | ((gg & 255) << 8) | (rr & 255);
      }
    }
    sandCtx.putImageData(sandImg, 0, 0);
  }

  // ---------- Кадр ----------
  let animT = 0;
  function drawPlate() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const { x, y, s } = plateRect;
    // Тень пластины и мягкий свет под ней
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.65)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 26;
    ctx.translate(x, y); ctx.scale(s / st.plateS, s / st.plateS);
    ctx.fillStyle = '#0b0c0e'; ctx.fill(st.platePath);
    ctx.restore();
    ctx.drawImage(plateCv, x, y, s, s);
    // Колебания в замедленной съёмке
    if (st.wave) {
      const ph = animT * Math.PI * 2 * 0.9;
      const c = Math.cos(ph), sn = Math.sin(ph);
      let mx = 1e-30; for (let i = 0; i < N * N; i++) { const v = Math.abs(st.ure[i] * c - st.uim[i] * sn); if (v > mx) mx = v; }
      const d = waveImg.data, mask = st.data.mask;
      for (let i = 0; i < N * N; i++) {
        if (!mask[i]) { d[i * 4 + 3] = 0; continue; }
        const v = (st.ure[i] * c - st.uim[i] * sn) / mx;
        const a = Math.min(1, Math.abs(v));
        if (v > 0) { d[i * 4] = 255; d[i * 4 + 1] = 170; d[i * 4 + 2] = 80; } else { d[i * 4] = 90; d[i * 4 + 1] = 190; d[i * 4 + 2] = 255; }
        d[i * 4 + 3] = Math.round(a * 150 * st.activity);
      }
      waveCtx.putImageData(waveImg, 0, 0);
      ctx.save(); ctx.imageSmoothingEnabled = true; ctx.globalCompositeOperation = 'screen';
      ctx.drawImage(waveCv, x, y, s, s); ctx.restore();
    }
    ctx.drawImage(sandCv, x, y, s, s);
    // Смычок
    const bx = x + st.drive[0] * s, by = y + st.drive[1] * s;
    const pulse = reduceMotion ? 0 : (Math.sin(animT * 6) * 0.5 + 0.5) * st.activity;
    ctx.save();
    ctx.strokeStyle = `rgba(224,168,75,${0.35 + 0.4 * pulse})`; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(bx, by, 9 + pulse * 5, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#e0a84b'; ctx.beginPath(); ctx.arc(bx, by, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.font = '600 12px Manrope, sans-serif'; ctx.fillStyle = 'rgba(236,230,218,0.8)';
    const lx = st.drive[0] > 0.7 ? bx - 70 : bx + 16;
    ctx.fillText('смычок', lx, by + 4);
    ctx.restore();
  }

  // ---------- Спектр ----------
  const fToX = (f) => 8 + (Math.log(f / F_MIN) / Math.log(F_MAX / F_MIN)) * (SW - 16);
  const xToF = (x) => F_MIN * Math.pow(F_MAX / F_MIN, clamp((x - 8) / (SW - 16), 0, 1));
  let specHover = null;
  function drawSpectrum() {
    if (!st.spectrum) return;
    const g = sctx;
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    g.clearRect(0, 0, SW, SH);
    const arr = st.spectrum, n = arr.length;
    let lo = Infinity, hi = -Infinity;
    for (const v of arr) { const l = Math.log10(v + 1e-30); if (l < lo) lo = l; if (l > hi) hi = l; }
    lo = Math.max(lo, hi - 5.5);
    const top = 8, bot = SH - 22;
    const Y = (v) => bot - (clamp(Math.log10(v + 1e-30), lo, hi) - lo) / (hi - lo) * (bot - top);
    // Сетка частот
    g.font = '400 11px "JetBrains Mono", monospace'; g.textAlign = 'center';
    for (const f of [100, 200, 500, 1000, 2000, 4000]) {
      if (f > F_MAX) continue;
      const x = fToX(f);
      g.strokeStyle = 'rgba(236,230,218,0.07)'; g.beginPath(); g.moveTo(x, top); g.lineTo(x, bot); g.stroke();
      g.fillStyle = 'rgba(236,230,218,0.5)'; g.fillText(f >= 1000 ? `${f / 1000} кГц` : `${f} Гц`, x, SH - 6);
    }
    // Кривая
    const path = new Path2D();
    for (let i = 0; i < n; i++) { const x = 8 + i / (n - 1) * (SW - 16), y = Y(arr[i]); i ? path.lineTo(x, y) : path.moveTo(x, y); }
    const fill = new Path2D(path); fill.lineTo(SW - 8, bot); fill.lineTo(8, bot); fill.closePath();
    const gr = g.createLinearGradient(0, top, 0, bot);
    gr.addColorStop(0, 'rgba(224,168,75,0.28)'); gr.addColorStop(1, 'rgba(224,168,75,0)');
    g.fillStyle = gr; g.fill(fill);
    g.strokeStyle = 'rgba(236,230,218,0.85)'; g.lineWidth = 1.3; g.stroke(path);
    // Метки резонансов
    for (const m of st.res) {
      const x = fToX(m.f); if (x < 8 || x > SW - 8) continue;
      g.fillStyle = 'rgba(236,230,218,0.55)'; g.fillRect(Math.round(x) - 0.5, bot + 2, 1, 5);
    }
    // Курсор
    const cx = fToX(st.f);
    g.strokeStyle = '#e0a84b'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(cx, top); g.lineTo(cx, bot); g.stroke();
    g.fillStyle = '#e0a84b'; g.beginPath(); g.arc(cx, Y(energyAt(st.f)), 4, 0, Math.PI * 2); g.fill();
    if (specHover !== null) {
      const f = xToF(specHover);
      g.fillStyle = 'rgba(236,230,218,0.9)'; g.textAlign = specHover > SW - 90 ? 'right' : 'left';
      g.fillText(`${fmtHz(f)} Гц`, specHover + (specHover > SW - 90 ? -8 : 8), top + 12);
      g.strokeStyle = 'rgba(236,230,218,0.3)'; g.beginPath(); g.moveTo(specHover, top); g.lineTo(specHover, bot); g.stroke();
    }
    g.textAlign = 'left';
  }

  // ---------- Частота ----------
  const slider = $('fSlider');
  const fToS = (f) => Math.round(Math.log(f / F_MIN) / Math.log(F_MAX / F_MIN) * 1000);
  const sToF = (v) => F_MIN * Math.pow(F_MAX / F_MIN, v / 1000);
  function setFreq(f, instant) {
    f = clamp(f, F_MIN, F_MAX);
    if (instant) { st.f = st.fTarget = f; st.glideT = 1; st.dirtyField = true; }
    else { st.fStart = st.f; st.fTarget = f; st.glideT = 0; }
    slider.value = fToS(f); slider.style.setProperty('--p', `${slider.value / 10}%`);
  }
  function updateModeInfo() {
    $('fVal').textContent = fmtHz(st.f);
    const m = st.data.modes[st.dominant];
    if (!m) return;
    const idx = st.res.indexOf(m);
    const near = Math.abs(st.f - m.f) / m.f < 0.02;
    const label = m.label ? ` ${m.label}` : '';
    $('modeInfo').innerHTML = near
      ? `<span class="res">Резонанс.</span> Мода <b>№${NB}${idx >= 0 ? idx + 1 : '—'}${label}</b> на ${fmtHz(m.f)}${NB}Гц — песок собирается на её узловых линиях.`
      : `Между резонансами пластина почти не отвечает. Ближайшая мода — <b>${fmtHz(m.f)}${NB}Гц</b>.`;
  }
  slider.addEventListener('input', () => { stopTour(); setFreq(sToF(+slider.value), true); });
  function jumpRes(dir) {
    stopTour();
    const list = st.res; if (!list.length) return;
    const f = st.fTarget;
    let target = null;
    if (dir > 0) target = list.find((m) => m.f > f * 1.004); else target = [...list].reverse().find((m) => m.f < f * 0.996);
    if (target) setFreq(target.f, false);
  }
  $('prevRes').addEventListener('click', () => jumpRes(-1));
  $('nextRes').addEventListener('click', () => jumpRes(1));
  sc.addEventListener('pointermove', (e) => { const r = sc.getBoundingClientRect(); specHover = e.clientX - r.left; drawSpectrum(); });
  sc.addEventListener('pointerleave', () => { specHover = null; drawSpectrum(); });
  sc.addEventListener('click', (e) => {
    stopTour();
    const r = sc.getBoundingClientRect(); const x = e.clientX - r.left;
    let f = xToF(x);
    // Прилипаем к ближайшему резонансу в пределах 7 px
    let best = null, bd = 7;
    for (const m of st.res) { const d = Math.abs(fToX(m.f) - x); if (d < bd) { bd = d; best = m; } }
    if (best) f = best.f;
    setFreq(f, false);
  });
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return;
    if (e.key === 'PageUp' || e.key === ']') { jumpRes(1); e.preventDefault(); }
    else if (e.key === 'PageDown' || e.key === '[') { jumpRes(-1); e.preventDefault(); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { stopTour(); setFreq(st.fTarget * (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 0.05 : 0.005) + st.fTarget, true); e.preventDefault(); }
  });

  // ---------- Смычок: клик по пластине ----------
  cv.addEventListener('click', (e) => {
    const r = cv.getBoundingClientRect();
    const x = (e.clientX - r.left - plateRect.x) / plateRect.s, y = (e.clientY - r.top - plateRect.y) / plateRect.s;
    if (!st.data || !insideMask(x, y)) return;
    stopTour();
    st.drive = [x, y];
    if (st.shape === 'square' || st.shape === 'rect') { updateDriveCoupling(); st.dirtyField = true; drawSpectrum(); }
    else loadModes(false);
  });

  // ---------- Переключатели ----------
  for (const b of document.querySelectorAll('#shapes .chip')) b.addEventListener('click', () => { stopTour(); setShape(b.dataset.shape); });
  const tog = (id, key, on) => { const b = $(id); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); st[key] = on; };
  $('tWave').addEventListener('click', () => tog('tWave', 'wave', !st.wave));
  $('tTour').addEventListener('click', () => { tog('tTour', 'tour', !st.tour); st.tourNext = performance.now() + 1500; });
  $('reseed').addEventListener('click', () => seedSand(false));
  function stopTour() { if (st.tour) tog('tTour', 'tour', false); }
  function pickTourList() {
    // Для экскурсии — резонансы с заметно разными узорами, не слишком высокие
    st.tourList = st.res.filter((m, i) => i >= 2 && m.f < F_MAX * 0.8).filter((m, i) => i % 2 === 0).slice(0, 10);
  }

  // ---------- Звук ----------
  let AC = null, osc = null, og = null, ng = null, nf = null;
  $('tSound').addEventListener('click', () => {
    if (!AC) {
      const Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) return;
      AC = new Ctx();
      osc = AC.createOscillator(); osc.type = 'sine'; og = AC.createGain(); og.gain.value = 0;
      const comp = AC.createDynamicsCompressor();
      osc.connect(og).connect(comp).connect(AC.destination); osc.start();
      const len = AC.sampleRate, buf = AC.createBuffer(1, len, AC.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (Math.random() < 0.02 ? 1 : 0.05);
      const src = AC.createBufferSource(); src.buffer = buf; src.loop = true;
      nf = AC.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 4200; nf.Q.value = 0.9;
      ng = AC.createGain(); ng.gain.value = 0;
      src.connect(nf).connect(ng).connect(comp); src.start();
    }
    if (AC.state === 'suspended') AC.resume();
    tog('tSound', 'sound', !st.sound);
  });
  function updateAudio() {
    if (!AC) return;
    const t = AC.currentTime;
    osc.frequency.setTargetAtTime(st.f, t, 0.03);
    og.gain.setTargetAtTime(st.sound ? 0.035 + 0.11 * st.activity : 0, t, 0.08);
    ng.gain.setTargetAtTime(st.sound ? 0.09 * Math.pow(st.activity, 2) : 0, t, 0.1);
  }

  // ---------- Цикл ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!document.hidden && st.data) {
      animT += dt;
      if (st.tour && now > st.tourNext && st.tourList && st.tourList.length) {
        st.tourIdx = (st.tourIdx + 1) % st.tourList.length;
        setFreq(st.tourList[st.tourIdx].f, false);
        st.tourNext = now + 7200;
      }
      if (st.glideT < 1) {
        st.glideT = Math.min(1, st.glideT + dt / st.glideDur);
        const e = st.glideT < 0.5 ? 2 * st.glideT * st.glideT : 1 - Math.pow(-2 * st.glideT + 2, 2) / 2;
        st.f = st.fStart * Math.pow(st.fTarget / st.fStart, e);
        st.dirtyField = true;
        // Проходя мимо резонансов, пластина встряхивает песок
        if (st.glideT > 0.2 && st.glideT < 0.8) for (let i = 0; i < P; i += 3) { px[i] += (Math.random() - 0.5) * 0.004; py[i] += (Math.random() - 0.5) * 0.004; if (!insideMask(px[i], py[i])) { px[i] = clamp(px[i], 0.01, 0.99); py[i] = clamp(py[i], 0.01, 0.99); } }
      }
      if (st.dirtyField) { computeField(); drawSpectrum(); }
      stepSand(dt);
      renderSand();
      drawPlate();
      updateAudio();
    }
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize);
  resize();
  setShape('square');
  resize();
  requestAnimationFrame(frame);
  // Отладочный хук для проверки
  window.__chladni = { st, setShape, setFreq: (f) => setFreq(f, true), jumpRes };
})();
