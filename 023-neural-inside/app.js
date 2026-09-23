'use strict';
/* Нейросеть изнутри.
   Многослойный перцептрон с ручным обратным распространением и оптимизатором Adam — без библиотек.
   Слева — решение сети на входной плоскости, справа — та же плоскость «глазами» последнего
   скрытого слоя: видно, как сеть растягивает и сгибает пространство, пока классы не разделит прямая. */
(function () {
  const $ = (s) => document.querySelector(s);
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const DOMAIN = 6;
  const NB = ' ';
  const MINUS = '−';
  const fmt = (x, d = 2) => (x < 0 ? MINUS : '') + Math.abs(x).toFixed(d).replace('.', ',');

  /* ============================ случайность и данные ============================ */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  let rng = mulberry32(20260922);
  const randn = () => { let u = 0; while (!u) u = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng()); };

  const DATASETS = [
    { id: 'spiral', name: 'Спираль' },
    { id: 'circles', name: 'Круги' },
    { id: 'xor', name: 'XOR' },
    { id: 'moons', name: 'Луны' },
    { id: 'blobs', name: 'Облака' },
    { id: 'custom', name: 'Свои точки' },
  ];
  function gen(id, n, noise) {
    const pts = [];
    const nz = () => randn() * noise * 1.4;
    const push = (x, y, c) => pts.push({ x: clamp(x, -DOMAIN + 0.1, DOMAIN - 0.1), y: clamp(y, -DOMAIN + 0.1, DOMAIN - 0.1), c });
    if (id === 'spiral') {
      const half = n / 2;
      for (let c = 0; c < 2; c++) for (let i = 0; i < half; i++) {
        const r = (i / half) * 5.2, t = (1.75 * i / half) * 2 * Math.PI + c * Math.PI;
        push(r * Math.sin(t) + nz(), r * Math.cos(t) + nz(), c);
      }
    } else if (id === 'circles') {
      for (let i = 0; i < n; i++) {
        const c = i % 2, a = rng() * 2 * Math.PI;
        const r = c === 0 ? rng() * 2.2 : 3.5 + rng() * 1.6;
        push(r * Math.cos(a) + nz(), r * Math.sin(a) + nz(), c);
      }
    } else if (id === 'xor') {
      for (let i = 0; i < n; i++) {
        let x = (rng() * 2 - 1) * 5.2, y = (rng() * 2 - 1) * 5.2;
        x += x > 0 ? 0.4 : -0.4; y += y > 0 ? 0.4 : -0.4;
        push(x + nz(), y + nz(), x * y > 0 ? 0 : 1);
      }
    } else if (id === 'moons') {
      for (let i = 0; i < n; i++) {
        const c = i % 2, t = rng() * Math.PI;
        const x = c === 0 ? Math.cos(t) : 1 - Math.cos(t);
        const y = c === 0 ? Math.sin(t) : 0.5 - Math.sin(t);
        push((x - 0.5) * 3.6 + nz(), (y - 0.25) * 3.6 + nz(), c);
      }
    } else if (id === 'blobs') {
      for (let i = 0; i < n; i++) {
        const c = i % 2, s = c ? -1 : 1;
        push(s * 2.2 + randn() * (1 + noise * 2), s * 2.2 + randn() * (1 + noise * 2), c);
      }
    }
    return pts;
  }
  function customSeed() {
    const pts = [];
    for (let i = 0; i < 16; i++) { const a = (i / 16) * 2 * Math.PI; pts.push({ x: Math.cos(a) * 4.2, y: Math.sin(a) * 4.2, c: 1 }); }
    for (let i = 0; i < 8; i++) { const a = (i / 8) * 2 * Math.PI + 0.3; pts.push({ x: Math.cos(a) * 1.2, y: Math.sin(a) * 1.2, c: 0 }); }
    return pts;
  }

  /* ============================ сеть ============================ */
  const ACTS = {
    tanh: { f: (z) => Math.tanh(z), d: (z, a) => 1 - a * a, lo: -1, hi: 1 },
    relu: { f: (z) => (z > 0 ? z : 0), d: (z) => (z > 0 ? 1 : 0), lo: 0, hi: null },
    sigmoid: { f: (z) => 1 / (1 + Math.exp(-z)), d: (z, a) => a * (1 - a), lo: 0, hi: 1 },
    sin: { f: (z) => Math.sin(z), d: (z) => Math.cos(z), lo: -1, hi: 1 },
  };
  class Net {
    constructor(hidden, act, seed) {
      this.sizes = [2, ...hidden, 1];
      this.act = act;
      this.L = this.sizes.length - 1;
      const r = mulberry32(seed);
      const g = () => { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };
      this.W = []; this.B = []; this.mW = []; this.vW = []; this.mB = []; this.vB = []; this.gW = []; this.gB = [];
      for (let l = 0; l < this.L; l++) {
        const nin = this.sizes[l], nout = this.sizes[l + 1];
        const sc = act === 'relu' && l < this.L - 1 ? Math.sqrt(2 / nin) : Math.sqrt(1 / nin);
        this.W.push(Float32Array.from({ length: nin * nout }, () => g() * sc));
        this.B.push(new Float32Array(nout).fill(act === 'relu' ? 0.05 : 0));
        for (const k of ['mW', 'vW', 'gW']) this[k].push(new Float32Array(nin * nout));
        for (const k of ['mB', 'vB', 'gB']) this[k].push(new Float32Array(nout));
      }
      this.a = this.sizes.map((n) => new Float32Array(n));
      this.z = this.sizes.map((n) => new Float32Array(n));
      this.d = this.sizes.map((n) => new Float32Array(n));
      this.t = 0;
    }
    forward(x1, x2) {
      const A = ACTS[this.act];
      this.a[0][0] = x1 / DOMAIN; this.a[0][1] = x2 / DOMAIN;
      for (let l = 0; l < this.L; l++) {
        const nin = this.sizes[l], nout = this.sizes[l + 1], W = this.W[l], B = this.B[l], ai = this.a[l], zo = this.z[l + 1], ao = this.a[l + 1];
        const last = l === this.L - 1;
        for (let j = 0; j < nout; j++) {
          let s = B[j];
          for (let i = 0; i < nin; i++) s += W[j * nin + i] * ai[i];
          zo[j] = s;
          ao[j] = last ? 1 / (1 + Math.exp(-s)) : A.f(s);
        }
      }
      return this.a[this.L][0];
    }
    train(data, lr, l2, steps) {
      const A = ACTS[this.act];
      let loss = 0;
      for (let s = 0; s < steps; s++) {
        for (let l = 0; l < this.L; l++) { this.gW[l].fill(0); this.gB[l].fill(0); }
        loss = 0;
        for (const p of data) {
          const out = this.forward(p.x, p.y);
          const y = p.c;
          loss -= y * Math.log(out + 1e-7) + (1 - y) * Math.log(1 - out + 1e-7);
          this.d[this.L][0] = out - y;
          for (let l = this.L - 1; l >= 0; l--) {
            const nin = this.sizes[l], nout = this.sizes[l + 1], W = this.W[l], gW = this.gW[l], gB = this.gB[l];
            const dOut = this.d[l + 1], ai = this.a[l];
            for (let j = 0; j < nout; j++) {
              const dj = dOut[j];
              gB[j] += dj;
              for (let i = 0; i < nin; i++) gW[j * nin + i] += dj * ai[i];
            }
            if (l > 0) {
              const dIn = this.d[l], zi = this.z[l];
              for (let i = 0; i < nin; i++) {
                let s2 = 0;
                for (let j = 0; j < nout; j++) s2 += W[j * nin + i] * dOut[j];
                dIn[i] = s2 * A.d(zi[i], ai[i]);
              }
            }
          }
        }
        const n = Math.max(1, data.length);
        loss /= n;
        this.t++;
        const b1 = 0.9, b2 = 0.999, eps = 1e-8;
        const c1 = 1 - Math.pow(b1, this.t), c2 = 1 - Math.pow(b2, this.t);
        for (let l = 0; l < this.L; l++) {
          const upd = (P, G, M, V, reg) => {
            for (let k = 0; k < P.length; k++) {
              const g = G[k] / n + reg * P[k];
              M[k] = b1 * M[k] + (1 - b1) * g;
              V[k] = b2 * V[k] + (1 - b2) * g * g;
              P[k] -= (lr * (M[k] / c1)) / (Math.sqrt(V[k] / c2) + eps);
            }
          };
          upd(this.W[l], this.gW[l], this.mW[l], this.vW[l], l2);
          upd(this.B[l], this.gB[l], this.mB[l], this.vB[l], 0);
        }
      }
      return loss;
    }
    evaluate(data) {
      let loss = 0, ok = 0;
      for (const p of data) {
        const out = this.forward(p.x, p.y);
        loss -= p.c * Math.log(out + 1e-7) + (1 - p.c) * Math.log(1 - out + 1e-7);
        if ((out > 0.5 ? 1 : 0) === p.c) ok++;
      }
      const n = Math.max(1, data.length);
      return { loss: loss / n, acc: ok / n };
    }
  }

  /* ============================ цвета ============================ */
  const COOL = [78, 166, 255], WARM = [255, 139, 79], MID = [18, 28, 48], INK = [231, 237, 246];
  function div(t, strength) { // t ∈ [−1, 1]: холодный ← → тёплый
    const k = Math.pow(Math.min(1, Math.abs(t)), 0.85) * strength;
    const c = t < 0 ? COOL : WARM;
    return [MID[0] + (c[0] - MID[0]) * k, MID[1] + (c[1] - MID[1]) * k, MID[2] + (c[2] - MID[2]) * k];
  }
  const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

  /* ============================ состояние ============================ */
  const st = {
    ds: 'spiral', noise: 0.1, lr: 0.035, l2: 0, act: 'tanh', hidden: [8, 8, 2],
    train: [], test: [], net: null, running: true, spf: 5, step: 0,
    hist: [], last: { loss: NaN, acc: NaN, tl: NaN }, // hist: [шаг, потери обучения, потери проверки]
    hover: null, hoverTile: null, seed: 11, pca: null, hidView: null, paint: 0,
  };
  function makeData() {
    rng = mulberry32(st.ds.length * 977 + Math.round(st.noise * 1000));
    if (st.ds === 'custom') { st.train = customSeed(); st.test = []; }
    else { st.train = gen(st.ds, 300, st.noise); st.test = gen(st.ds, 120, st.noise); }
  }
  function makeNet() {
    st.seed = (st.seed * 48271) % 2147483647;
    st.net = new Net(st.hidden, st.act, st.seed);
    st.step = 0; st.pca = null; st.hidView = null;
    const e0 = st.net.evaluate(st.train), t0 = st.test.length ? st.net.evaluate(st.test) : e0;
    st.hist = [[0, e0.loss, t0.loss]];
  }

  /* ============================ холсты ============================ */
  // в режиме съёмки холсты растеризуются на CPU: те же пиксели, но без очереди к программному GPU сервера
  const CTX = window.__SHOT__ ? { willReadFrequently: true } : undefined;
  const inCv = $('#inCv'), hidCv = $('#hidCv'), netCv = $('#netCv'), lossCv = $('#lossCv');
  const ictx = inCv.getContext('2d', CTX), hctx = hidCv.getContext('2d', CTX), nctx = netCv.getContext('2d', CTX), lctx = lossCv.getContext('2d', CTX);
  let DPR = 1;
  function fit(cv) {
    const r = cv.getBoundingClientRect();
    const w = Math.max(10, Math.round(r.width * DPR)), h = Math.max(10, Math.round(r.height * DPR));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    return { w: r.width, h: r.height };
  }
  const HEAT = 120;
  const heat = document.createElement('canvas'); heat.width = heat.height = HEAT;
  const heatCtx = heat.getContext('2d', CTX);
  const heatImg = heatCtx.createImageData(HEAT, HEAT);
  const heatVal = new Float32Array(HEAT * HEAT);

  // все точки одного класса — одним путём: две заливки и две обводки вместо сотен вызовов
  function dotsPath(pts, r) {
    const p = new Path2D();
    for (const [x, y] of pts) { p.moveTo(x + r, y); p.arc(x, y, r, 0, Math.PI * 2); }
    return p;
  }
  function drawDots(c, byClass, r, hollow) {
    for (const k of [0, 1]) {
      if (!byClass[k].length) continue;
      const path = dotsPath(byClass[k], r);
      if (hollow) { c.strokeStyle = rgb(k ? WARM : COOL); c.lineWidth = 1.4; c.stroke(path); continue; }
      // тёмная подложка на 1 px шире, сверху цветной диск: соседние точки не перечёркивают друг друга
      c.fillStyle = 'rgba(8, 14, 26, 0.85)'; c.fill(dotsPath(byClass[k], r + 1));
      c.fillStyle = rgb(k ? WARM : COOL); c.fill(path);
    }
  }
  function plotRect(w, h, pad) {
    const s = Math.min(w, h) - pad * 2;
    return { x: (w - s) / 2, y: (h - s) / 2, s };
  }

  /* ---------- входная плоскость ---------- */
  function drawInput() {
    const { w, h } = fit(inCv);
    const c = ictx;
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    c.clearRect(0, 0, w, h);
    const R = plotRect(w, h, 8);
    const net = st.net;
    const d = heatImg.data;
    for (let j = 0; j < HEAT; j++) {
      const y = DOMAIN - ((j + 0.5) / HEAT) * 2 * DOMAIN;
      for (let i = 0; i < HEAT; i++) {
        const x = -DOMAIN + ((i + 0.5) / HEAT) * 2 * DOMAIN;
        const p = net.forward(x, y);
        heatVal[j * HEAT + i] = p;
        const col = div(p * 2 - 1, 0.62);
        const k = (j * HEAT + i) * 4;
        d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = 255;
      }
    }
    heatCtx.putImageData(heatImg, 0, 0);
    c.save();
    c.beginPath();
    if (c.roundRect) c.roundRect(R.x, R.y, R.s, R.s, 8); else c.rect(R.x, R.y, R.s, R.s);
    c.clip();
    c.imageSmoothingEnabled = true;
    c.drawImage(heat, R.x, R.y, R.s, R.s);
    // линия решения p = 0,5 — «марширующие квадраты»
    c.strokeStyle = 'rgba(231, 237, 246, 0.85)';
    c.lineWidth = 1.6;
    c.beginPath();
    const cell = R.s / HEAT;
    for (let j = 0; j < HEAT - 1; j++) for (let i = 0; i < HEAT - 1; i++) {
      const a = heatVal[j * HEAT + i] - 0.5, b = heatVal[j * HEAT + i + 1] - 0.5;
      const cc = heatVal[(j + 1) * HEAT + i + 1] - 0.5, dd = heatVal[(j + 1) * HEAT + i] - 0.5;
      const pts = [];
      const X = (ii) => R.x + (ii + 0.5) * cell, Y = (jj) => R.y + (jj + 0.5) * cell;
      if ((a > 0) !== (b > 0)) pts.push([X(i + a / (a - b)), Y(j)]);
      if ((b > 0) !== (cc > 0)) pts.push([X(i + 1), Y(j + b / (b - cc))]);
      if ((dd > 0) !== (cc > 0)) pts.push([X(i + dd / (dd - cc)), Y(j + 1)]);
      if ((a > 0) !== (dd > 0)) pts.push([X(i), Y(j + a / (a - dd))]);
      if (pts.length >= 2) { c.moveTo(pts[0][0], pts[0][1]); c.lineTo(pts[1][0], pts[1][1]); }
      if (pts.length === 4) { c.moveTo(pts[2][0], pts[2][1]); c.lineTo(pts[3][0], pts[3][1]); }
    }
    c.stroke();
    // оси
    c.strokeStyle = 'rgba(231, 237, 246, 0.14)';
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(R.x + R.s / 2, R.y); c.lineTo(R.x + R.s / 2, R.y + R.s); c.moveTo(R.x, R.y + R.s / 2); c.lineTo(R.x + R.s, R.y + R.s / 2); c.stroke();
    // точки
    const toPx = (x, y) => [R.x + ((x + DOMAIN) / (2 * DOMAIN)) * R.s, R.y + ((DOMAIN - y) / (2 * DOMAIN)) * R.s];
    const te = [[], []], tr = [[], []];
    for (const p of st.test) te[p.c].push(toPx(p.x, p.y));
    for (const p of st.train) tr[p.c].push(toPx(p.x, p.y));
    drawDots(c, te, 3.4, true);
    drawDots(c, tr, 3.6, false);
    if (st.hover) {
      const [x, y] = toPx(st.hover.x, st.hover.y);
      c.strokeStyle = 'rgba(231, 237, 246, 0.5)';
      c.setLineDash([3, 4]);
      c.beginPath(); c.moveTo(x, R.y); c.lineTo(x, R.y + R.s); c.moveTo(R.x, y); c.lineTo(R.x + R.s, y); c.stroke();
      c.setLineDash([]);
      c.beginPath(); c.arc(x, y, 7, 0, Math.PI * 2); c.strokeStyle = '#fff'; c.lineWidth = 2; c.stroke();
    }
    c.restore();
    c.strokeStyle = 'rgba(160, 190, 230, 0.22)';
    c.lineWidth = 1;
    c.beginPath();
    if (c.roundRect) c.roundRect(R.x + 0.5, R.y + 0.5, R.s - 1, R.s - 1, 8); else c.rect(R.x, R.y, R.s, R.s);
    c.stroke();
    c.fillStyle = 'rgba(231, 237, 246, 0.6)';
    c.font = 'italic 14px "IBM Plex Serif", Georgia, serif';
    c.fillText('x₁', R.x + R.s - 22, R.y + R.s / 2 - 8);
    c.fillText('x₂', R.x + R.s / 2 + 8, R.y + 18);
    st.inRect = R;
  }

  /* ---------- пространство последнего скрытого слоя ---------- */
  function lastHidden(net, x, y) {
    net.forward(x, y);
    return net.a[net.L - 1];
  }
  function updatePca() {
    const net = st.net, k = net.sizes[net.L - 1];
    if (k <= 2) { st.pca = null; return; }
    const pts = st.train.length ? st.train : [{ x: 0, y: 0 }];
    const mean = new Float64Array(k), cov = new Float64Array(k * k);
    const H = pts.map((p) => Float64Array.from(lastHidden(net, p.x, p.y)));
    for (const h of H) for (let i = 0; i < k; i++) mean[i] += h[i] / H.length;
    for (const h of H) for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) cov[i * k + j] += ((h[i] - mean[i]) * (h[j] - mean[j])) / H.length;
    const vecs = [];
    for (let e = 0; e < 2; e++) {
      let v = new Float64Array(k).map((_, i) => (st.pca ? st.pca.vecs[e][i] : Math.sin(i * 1.7 + e * 2.1 + 0.3)));
      for (let it = 0; it < 40; it++) {
        const nv = new Float64Array(k);
        for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) nv[i] += cov[i * k + j] * v[j];
        for (const u of vecs) { let d = 0; for (let i = 0; i < k; i++) d += nv[i] * u[i]; for (let i = 0; i < k; i++) nv[i] -= d * u[i]; }
        let n = 0; for (let i = 0; i < k; i++) n += nv[i] * nv[i];
        n = Math.sqrt(n) || 1;
        for (let i = 0; i < k; i++) nv[i] /= n;
        v = nv;
      }
      if (st.pca) { let d = 0; for (let i = 0; i < k; i++) d += v[i] * st.pca.vecs[e][i]; if (d < 0) for (let i = 0; i < k; i++) v[i] = -v[i]; }
      vecs.push(v);
    }
    st.pca = { mean, vecs };
  }
  function project(h) {
    const k = h.length;
    if (k === 1) return [h[0], st.net.a[st.net.L][0] * 2 - 1];
    if (k === 2) return [h[0], h[1]];
    const P = st.pca;
    let a = 0, b = 0;
    for (let i = 0; i < k; i++) { a += (h[i] - P.mean[i]) * P.vecs[0][i]; b += (h[i] - P.mean[i]) * P.vecs[1][i]; }
    return [a, b];
  }
  const HID = 72;
  const hidBg = document.createElement('canvas'); hidBg.width = hidBg.height = HID;
  const hidBgCtx = hidBg.getContext('2d', CTX);
  const hidImg = hidBgCtx.createImageData(HID, HID);
  function drawHidden() {
    const { w, h } = fit(hidCv);
    const c = hctx;
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    c.clearRect(0, 0, w, h);
    const R = plotRect(w, h, 8);
    const net = st.net, k = net.sizes[net.L - 1];
    updatePca();
    // сетка входной плоскости, прогнанная через сеть
    const N = 21, M = 70;
    const lines = [];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let dir = 0; dir < 2; dir++) for (let li = 0; li < N; li++) {
      const u = -DOMAIN + (li / (N - 1)) * 2 * DOMAIN;
      const line = [];
      for (let s = 0; s < M; s++) {
        const v = -DOMAIN + (s / (M - 1)) * 2 * DOMAIN;
        const x = dir ? u : v, y = dir ? v : u;
        const hv = lastHidden(net, x, y);
        const pp = project(hv);
        const out = net.a[net.L][0];
        line.push([pp[0], pp[1], out]);
        if (pp[0] < minX) minX = pp[0]; if (pp[0] > maxX) maxX = pp[0];
        if (pp[1] < minY) minY = pp[1]; if (pp[1] > maxY) maxY = pp[1];
      }
      lines.push(line);
    }
    const dots = st.train.map((p) => { const pp = project(lastHidden(net, p.x, p.y)); return [pp[0], pp[1], p.c]; });
    // окно просмотра: для ограниченных активаций — фиксированное, иначе по данным, со сглаживанием
    const A = ACTS[st.act];
    let view;
    if (k <= 2 && A.hi !== null && k === 2) view = { x0: A.lo - 0.08, x1: A.hi + 0.08, y0: A.lo - 0.08, y1: A.hi + 0.08 };
    else {
      const cx0 = (minX + maxX) / 2, cy0 = (minY + maxY) / 2;
      const half = Math.max(maxX - minX, maxY - minY, 1e-3) * 0.56;
      view = { x0: cx0 - half, x1: cx0 + half, y0: cy0 - half, y1: cy0 + half };
    }
    if (st.hidView) { const s = 0.15; for (const key of ['x0', 'x1', 'y0', 'y1']) view[key] = st.hidView[key] + (view[key] - st.hidView[key]) * s; }
    st.hidView = view;
    const toPx = (a, b) => [R.x + ((a - view.x0) / (view.x1 - view.x0)) * R.s, R.y + ((view.y1 - b) / (view.y1 - view.y0)) * R.s];
    c.save();
    c.beginPath();
    if (c.roundRect) c.roundRect(R.x, R.y, R.s, R.s, 8); else c.rect(R.x, R.y, R.s, R.s);
    c.fillStyle = 'rgba(15, 26, 45, 0.9)'; c.fill();
    c.clip();
    // решение выходного нейрона в координатах слоя: p = σ(w₁h₁ + w₂h₂ + b)
    if (k === 2) {
      const Wl = net.W[net.L - 1], bo = net.B[net.L - 1][0], d = hidImg.data;
      for (let j = 0; j < HID; j++) {
        const hb = view.y1 - ((j + 0.5) / HID) * (view.y1 - view.y0);
        for (let i = 0; i < HID; i++) {
          const ha = view.x0 + ((i + 0.5) / HID) * (view.x1 - view.x0);
          const p = 1 / (1 + Math.exp(-(Wl[0] * ha + Wl[1] * hb + bo)));
          const col = div(p * 2 - 1, 0.34), q = (j * HID + i) * 4;
          d[q] = col[0]; d[q + 1] = col[1]; d[q + 2] = col[2]; d[q + 3] = 255;
        }
      }
      hidBgCtx.putImageData(hidImg, 0, 0);
      c.imageSmoothingEnabled = true;
      c.drawImage(hidBg, R.x, R.y, R.s, R.s);
    }
    // фоновая сетка осей
    c.strokeStyle = 'rgba(160, 190, 230, 0.07)'; c.lineWidth = 1;
    c.beginPath();
    for (let i = 1; i < 8; i++) { const x = R.x + (i / 8) * R.s, y = R.y + (i / 8) * R.s; c.moveTo(x, R.y); c.lineTo(x, R.y + R.s); c.moveTo(R.x, y); c.lineTo(R.x + R.s, y); }
    c.stroke();
    // изогнутая сетка входной плоскости: отрезки собраны в 16 пачек по цвету — 16 обводок вместо тысяч
    c.lineWidth = 1;
    c.lineCap = 'round';
    const NBK = 16, buckets = Array.from({ length: NBK }, () => new Path2D());
    for (const line of lines) {
      for (let s = 1; s < line.length; s++) {
        const [a0, b0, o0] = line[s - 1], [a1, b1] = line[s];
        const [x0, y0] = toPx(a0, b0), [x1, y1] = toPx(a1, b1);
        const path = buckets[Math.min(NBK - 1, Math.floor(o0 * NBK))];
        path.moveTo(x0, y0); path.lineTo(x1, y1);
      }
    }
    buckets.forEach((path, i) => { c.strokeStyle = rgb(div(((i + 0.5) / NBK) * 2 - 1, 1), 0.5); c.stroke(path); });
    // разделяющая прямая выходного нейрона (только когда слой двумерный)
    if (k === 2) {
      const Wl = net.W[net.L - 1], b = net.B[net.L - 1][0];
      const w1 = Wl[0], w2 = Wl[1];
      const pts = [];
      if (Math.abs(w2) > 1e-6) { for (const a of [view.x0, view.x1]) pts.push([a, -(w1 * a + b) / w2]); }
      else if (Math.abs(w1) > 1e-6) { for (const bb of [view.y0, view.y1]) pts.push([-(w2 * bb + b) / w1, bb]); }
      if (pts.length === 2) {
        const [x0, y0] = toPx(pts[0][0], pts[0][1]), [x1, y1] = toPx(pts[1][0], pts[1][1]);
        c.strokeStyle = 'rgba(8, 14, 26, 0.9)'; c.lineWidth = 5;
        c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
        c.strokeStyle = 'rgba(231, 237, 246, 0.95)'; c.lineWidth = 2; c.stroke();
      }
    }
    const hd = [[], []];
    for (const [a, b, cl] of dots) hd[cl].push(toPx(a, b));
    drawDots(c, hd, 3.2, false);
    if (st.hover) {
      const pp = project(lastHidden(net, st.hover.x, st.hover.y));
      const [x, y] = toPx(pp[0], pp[1]);
      c.beginPath(); c.arc(x, y, 7, 0, Math.PI * 2); c.strokeStyle = '#fff'; c.lineWidth = 2; c.stroke();
      c.beginPath(); c.arc(x, y, 11, 0, Math.PI * 2); c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 1; c.stroke();
    }
    c.restore();
    c.strokeStyle = 'rgba(160, 190, 230, 0.22)'; c.lineWidth = 1;
    c.beginPath();
    if (c.roundRect) c.roundRect(R.x + 0.5, R.y + 0.5, R.s - 1, R.s - 1, 8); else c.rect(R.x, R.y, R.s, R.s);
    c.stroke();
    c.fillStyle = 'rgba(231, 237, 246, 0.6)';
    c.font = 'italic 14px "IBM Plex Serif", Georgia, serif';
    const lab = k === 2 ? ['h₁', 'h₂'] : k === 1 ? ['h₁', 'p'] : ['ГК₁', 'ГК₂'];
    c.fillText(lab[0], R.x + R.s - 30, R.y + R.s - 12);
    c.fillText(lab[1], R.x + 10, R.y + 20);
  }

  /* ---------- схема сети ---------- */
  const TILE = 28;
  let atlas = document.createElement('canvas');
  let tiles = []; // {l, j, x, y, s}
  function drawNet() {
    const { w, h } = fit(netCv);
    const c = nctx;
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    c.clearRect(0, 0, w, h);
    const net = st.net, sizes = net.sizes;
    const top = 34, bottom = 8, GAP = 6;
    const avail = h - top - bottom;
    const maxN = Math.max(...sizes);
    // крупные карты нейронов: если в столбик не влезают, раскладываем «ёлочкой» в две подколонки
    let size = Math.floor((avail - (maxN - 1) * GAP) / maxN), zig = false;
    if (size < 30 && maxN > 2) { size = Math.floor((2 * avail - (maxN - 1) * GAP) / (maxN + 1)); zig = true; }
    size = clamp(size, 16, 46);
    const cols = sizes.length;
    const needZig = (n) => zig && n * size + (n - 1) * GAP > avail;
    const blockW = sizes.map((n) => (needZig(n) ? size * 2 + 4 : size));
    const cL = 40 + blockW[0] / 2, cR = w - 40 - blockW[cols - 1] / 2;
    const colC = sizes.map((_, l) => cL + (cols === 1 ? 0 : (l / (cols - 1)) * (cR - cL)));
    const colX = colC.map((cc, l) => cc - blockW[l] / 2);
    tiles = [];
    sizes.forEach((n, l) => {
      const z = needZig(n);
      const step = z ? (size + GAP) / 2 : size + GAP;
      const colH = (n - 1) * step + size;
      const y0 = top + (avail - colH) / 2;
      for (let j = 0; j < n; j++) tiles.push({ l, j, x: colX[l] + (z && j % 2 ? size + 4 : 0), y: y0 + j * step, s: size });
    });
    // карты активаций всех нейронов на сетке TILE×TILE
    const total = sizes.reduce((a, b) => a + b, 0);
    if (atlas.width !== TILE * total) { atlas.width = TILE * total; atlas.height = TILE; }
    const actx = atlas.getContext('2d', CTX);
    const img = actx.createImageData(TILE * total, TILE);
    const A = ACTS[st.act];
    const offs = []; { let o = 0; for (const n of sizes) { offs.push(o); o += n; } }
    // нормировка для ReLU — по максимуму своего слоя
    const reluMax = sizes.map(() => 1e-3);
    const vals = new Float32Array(total * TILE * TILE);
    for (let j = 0; j < TILE; j++) {
      const y = DOMAIN - ((j + 0.5) / TILE) * 2 * DOMAIN;
      for (let i = 0; i < TILE; i++) {
        const x = -DOMAIN + ((i + 0.5) / TILE) * 2 * DOMAIN;
        net.forward(x, y);
        for (let l = 0; l < sizes.length; l++) for (let q = 0; q < sizes[l]; q++) {
          const v = net.a[l][q];
          vals[(offs[l] + q) * TILE * TILE + j * TILE + i] = v;
          if (l > 0 && l < sizes.length - 1 && st.act === 'relu' && v > reluMax[l]) reluMax[l] = v;
        }
      }
    }
    for (let l = 0; l < sizes.length; l++) for (let q = 0; q < sizes[l]; q++) {
      const base = (offs[l] + q) * TILE * TILE;
      for (let p = 0; p < TILE * TILE; p++) {
        let v = vals[base + p];
        let t;
        if (l === 0) t = v;
        else if (l === sizes.length - 1) t = v * 2 - 1;
        else if (st.act === 'relu') t = v / reluMax[l]; // ноль — «выключен» (тёмный), больше — теплее
        else if (st.act === 'sigmoid') t = v * 2 - 1;
        else t = v;
        const col = div(clamp(t, -1, 1), 0.9);
        const k = ((p / TILE | 0) * TILE * total + (offs[l] + q) * TILE + (p % TILE)) * 4;
        img.data[k] = col[0]; img.data[k + 1] = col[1]; img.data[k + 2] = col[2]; img.data[k + 3] = 255;
      }
    }
    actx.putImageData(img, 0, 0);
    void A;
    // веса
    const hl = st.hoverTile;
    for (let l = 0; l < net.L; l++) {
      const nin = sizes[l], nout = sizes[l + 1], W = net.W[l];
      for (let j = 0; j < nout; j++) for (let i = 0; i < nin; i++) {
        const wv = W[j * nin + i];
        const a = tiles.find((t) => t.l === l && t.j === i), b = tiles.find((t) => t.l === l + 1 && t.j === j);
        const xa = a.x + a.s, ya = a.y + a.s / 2, xb = b.x, yb = b.y + b.s / 2;
        const mag = Math.min(1, Math.abs(wv) / 1.6);
        const related = hl && ((hl.l === l && hl.j === i) || (hl.l === l + 1 && hl.j === j));
        const alpha = hl ? (related ? 0.95 : 0.05) : 0.12 + 0.5 * mag;
        c.strokeStyle = rgb(wv > 0 ? WARM : COOL, alpha);
        c.lineWidth = 0.5 + 2.6 * mag;
        const mx = (xa + xb) / 2;
        c.beginPath(); c.moveTo(xa, ya); c.bezierCurveTo(mx, ya, mx, yb, xb, yb); c.stroke();
      }
    }
    // плитки
    c.imageSmoothingEnabled = true;
    for (const t of tiles) {
      const idx = offs[t.l] + t.j;
      c.fillStyle = '#0b1322';
      c.fillRect(t.x - 2, t.y - 2, t.s + 4, t.s + 4);
      c.drawImage(atlas, idx * TILE, 0, TILE, TILE, t.x, t.y, t.s, t.s);
      const on = hl && hl.l === t.l && hl.j === t.j;
      c.strokeStyle = on ? '#ffffff' : 'rgba(160, 190, 230, 0.35)';
      c.lineWidth = on ? 2 : 1;
      c.strokeRect(t.x + 0.5, t.y + 0.5, t.s - 1, t.s - 1);
    }
    // подписи столбцов
    c.fillStyle = 'rgba(151, 168, 192, 1)';
    c.font = '500 12.5px "IBM Plex Mono", monospace';
    c.textAlign = 'center';
    c.fillText('вход', colC[0], 14);
    c.fillText('выход', colC[cols - 1], 14);
    c.textAlign = 'left';
    st.netGeom = { colX, colC, size, top };
  }

  /* ---------- потери ---------- */
  function drawLoss() {
    const { w, h } = fit(lossCv);
    const c = lctx;
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    c.clearRect(0, 0, w, h);
    const gx = 38, gr = 8; // поле подписей слева
    const lo = Math.log10(0.004), hi = Math.log10(1.2);
    const Y = (v) => 8 + (1 - (Math.log10(clamp(v, 0.004, 1.2)) - lo) / (hi - lo)) * (h - 16);
    c.strokeStyle = 'rgba(160, 190, 230, 0.1)'; c.lineWidth = 1;
    c.beginPath();
    for (const v of [1, 0.1, 0.01]) { const y = Math.round(Y(v)) + 0.5; c.moveTo(gx, y); c.lineTo(w - gr, y); }
    c.stroke();
    c.fillStyle = 'rgba(151, 168, 192, 0.95)'; c.font = '400 11.5px "IBM Plex Mono", monospace';
    c.textAlign = 'right'; c.textBaseline = 'middle';
    c.fillText('1', gx - 7, Y(1)); c.fillText('0,1', gx - 7, Y(0.1)); c.fillText('0,01', gx - 7, Y(0.01));
    // легенда — в левом нижнем углу: там всегда ранние шаги с высокими потерями, кривая туда не заходит
    c.textAlign = 'left';
    const ly = h - 10;
    let lx = gx + 8;
    c.strokeStyle = '#e7edf6'; c.lineWidth = 1.7;
    c.beginPath(); c.moveTo(lx, ly); c.lineTo(lx + 16, ly); c.stroke();
    c.fillText('обучение', lx + 22, ly);
    lx += 22 + c.measureText('обучение').width + 14;
    c.strokeStyle = 'rgba(151, 168, 192, 0.9)'; c.setLineDash([4, 3]);
    c.beginPath(); c.moveTo(lx, ly); c.lineTo(lx + 16, ly); c.stroke(); c.setLineDash([]);
    c.fillText('проверка', lx + 22, ly);
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    const H = st.hist;
    if (H.length < 2) return;
    const s0 = H[0][0], s1 = Math.max(H[H.length - 1][0], s0 + 1);
    const X = (step) => gx + ((step - s0) / (s1 - s0)) * (w - gx - gr);
    const draw = (k, dash, col) => {
      c.strokeStyle = col; c.lineWidth = 1.7; c.setLineDash(dash); c.lineJoin = 'round';
      c.beginPath();
      H.forEach((e, i) => { const x = X(e[0]), y = Y(e[k]); i ? c.lineTo(x, y) : c.moveTo(x, y); });
      c.stroke(); c.setLineDash([]);
    };
    draw(2, [4, 4], 'rgba(151, 168, 192, 0.9)');
    draw(1, [], '#e7edf6');
    const e = H[H.length - 1];
    c.beginPath(); c.arc(X(e[0]), Y(e[1]), 3, 0, Math.PI * 2); c.fillStyle = '#e7edf6'; c.fill();
  }
  const MAXH = 400;

  /* ============================ цикл ============================ */
  function stepTrain(n) {
    const loss = st.net.train(st.train, st.lr, st.l2, n);
    st.step += n;
    const te = st.test.length ? st.net.evaluate(st.test) : st.net.evaluate(st.train);
    st.last = { loss, acc: te.acc, tl: te.loss };
    st.hist.push([st.step, loss, te.loss]);
    // вся история обучения остаётся на графике: при переполнении прореживаем через одну
    if (st.hist.length > MAXH) st.hist = st.hist.filter((_, i) => i % 2 === 0 || i === st.hist.length - 1);
  }
  function updateStats() {
    $('#sStep').textContent = st.step.toLocaleString('ru-RU');
    $('#sLoss').textContent = Number.isFinite(st.last.loss) ? st.last.loss.toFixed(3).replace('.', ',') : '—';
    $('#sAcc').textContent = Number.isFinite(st.last.acc) ? `${Math.round(st.last.acc * 100)}${NB}%` : '—';
  }
  // в режиме съёмки (_tools/shot, программный рендер) частота кадров неважна: 4 кадра в секунду
  const SHOT_GAP = window.__SHOT__ ? 250 : 0;
  let dirty = true, nextAt = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden || now < nextAt) return;
    const t0 = performance.now();
    if (st.running && st.train.length) { stepTrain(st.spf); dirty = true; }
    if (!dirty) return;
    dirty = false;
    drawInput(); drawHidden(); drawNet(); drawLoss(); updateStats();
    if (st.hover) readout();
    // слабое устройство: если кадр тяжёлый, пропускаем столько же времени — браузер остаётся отзывчивым
    const spent = performance.now() - t0;
    nextAt = now + Math.max(SHOT_GAP, spent > 24 ? spent : 0);
  }

  /* ============================ интерфейс ============================ */
  function buildDatasets() {
    const box = $('#datasets');
    for (const d of DATASETS) {
      const b = document.createElement('button');
      b.className = 'ds';
      b.setAttribute('role', 'radio');
      b.dataset.id = d.id;
      const cv = document.createElement('canvas');
      cv.width = cv.height = 52;
      const c = cv.getContext('2d');
      c.fillStyle = '#16243d'; c.beginPath(); c.arc(26, 26, 26, 0, Math.PI * 2); c.fill();
      const keep = rng;
      rng = mulberry32(3);
      const pts = d.id === 'custom' ? customSeed() : gen(d.id, 90, 0.05);
      rng = keep;
      for (const p of pts) {
        c.fillStyle = rgb(p.c ? WARM : COOL);
        c.beginPath(); c.arc(26 + (p.x / DOMAIN) * 22, 26 - (p.y / DOMAIN) * 22, 1.8, 0, Math.PI * 2); c.fill();
      }
      const s = document.createElement('span'); s.textContent = d.name;
      b.append(cv, s);
      b.addEventListener('click', () => { st.ds = d.id; syncDs(); makeData(); makeNet(); dirty = true; });
      box.appendChild(b);
    }
    syncDs();
  }
  function syncDs() { document.querySelectorAll('.ds').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.id === st.ds))); }
  function buildActs() {
    const box = $('#acts');
    for (const [k, label] of [['tanh', 'tanh'], ['relu', 'ReLU'], ['sigmoid', 'σ'], ['sin', 'sin']]) {
      const b = document.createElement('button');
      b.textContent = label;
      b.dataset.k = k;
      b.setAttribute('role', 'radio');
      b.addEventListener('click', () => { st.act = k; syncActs(); makeNet(); dirty = true; });
      box.appendChild(b);
    }
    syncActs();
  }
  function syncActs() { document.querySelectorAll('#acts button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.k === st.act))); }
  function sci(v) {
    const e = Math.floor(Math.log10(v)), m = v / Math.pow(10, e);
    const sup = String(e).replace('-', '⁻').replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+d]);
    return `${m.toFixed(1).replace('.', ',')}·10${sup}`;
  }
  function paint(el) { el.style.setProperty('--p', ((el.value - el.min) / (el.max - el.min)) * 100 + '%'); }
  function bindSliders() {
    const lr = $('#lr'), noise = $('#noise'), l2 = $('#l2');
    const upd = () => {
      st.lr = Math.pow(10, -3 + (2.5 * lr.value) / 100);
      st.noise = noise.value / 100;
      st.l2 = +l2.value === 0 ? 0 : Math.pow(10, -5 + (3 * l2.value) / 100);
      $('#oLr').textContent = st.lr.toPrecision(2).replace('.', ',');
      $('#oNoise').textContent = `${noise.value}${NB}%`;
      $('#oL2').textContent = st.l2 === 0 ? '0' : sci(st.l2);
      [lr, noise, l2].forEach(paint);
    };
    lr.addEventListener('input', upd);
    l2.addEventListener('input', upd);
    noise.addEventListener('input', upd);
    noise.addEventListener('change', () => { if (st.ds !== 'custom') { makeData(); dirty = true; } });
    upd();
  }
  function buildArch() {
    const box = $('#netControls');
    box.innerHTML = '';
    requestAnimationFrame(() => {
      const g = st.netGeom;
      if (!g) return;
      st.hidden.forEach((n, i) => {
        const d = document.createElement('div');
        d.className = 'lc';
        d.style.left = `${g.colC[i + 1]}px`;
        d.style.top = '0px';
        d.innerHTML = `<button aria-label="Меньше нейронов в слое ${i + 1}">−</button><b>${n}</b><button aria-label="Больше нейронов в слое ${i + 1}">+</button>`;
        const [minus, , plus] = d.children;
        minus.addEventListener('click', () => { if (st.hidden[i] > 1) { st.hidden[i]--; rebuild(); } });
        plus.addEventListener('click', () => { if (st.hidden[i] < 8) { st.hidden[i]++; rebuild(); } });
        box.appendChild(d);
      });
    });
    $('#archText').textContent = [2, ...st.hidden, 1].join(' → ');
    $('#addLayer').disabled = st.hidden.length >= 4;
    $('#delLayer').disabled = st.hidden.length <= 1;
    const k = st.hidden[st.hidden.length - 1];
    $('#hiddenNote').textContent = k === 2 ? 'сеть гнёт плоскость, пока классы не разделит прямая' : k === 1 ? 'одномерный слой: по горизонтали — нейрон, по вертикали — ответ' : 'проекция на две главные компоненты слоя';
  }
  function rebuild() { makeNet(); dirty = true; drawNet(); buildArch(); }
  $('#addLayer').addEventListener('click', () => { if (st.hidden.length < 4) { st.hidden.splice(st.hidden.length - 1, 0, 4); rebuild(); } });
  $('#delLayer').addEventListener('click', () => { if (st.hidden.length > 1) { st.hidden.splice(Math.max(0, st.hidden.length - 2), 1); rebuild(); } });

  function setRunning(v) { st.running = v; const b = $('#bPlay'); b.classList.toggle('on', v); b.setAttribute('aria-label', v ? 'Пауза' : 'Пуск'); }
  $('#bPlay').addEventListener('click', () => setRunning(!st.running));
  $('#bStep').addEventListener('click', () => { setRunning(false); stepTrain(1); dirty = true; });
  $('#bReset').addEventListener('click', () => { makeNet(); dirty = true; });
  document.querySelectorAll('.speed button').forEach((b) => b.addEventListener('click', () => {
    st.spf = +b.dataset.k;
    document.querySelectorAll('.speed button').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
  }));
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
    if (e.code === 'Space') { e.preventDefault(); setRunning(!st.running); }
    else if (e.code === 'KeyS') { setRunning(false); stepTrain(1); dirty = true; }
    else if (e.code === 'KeyR') { makeNet(); dirty = true; }
  });

  // наведение и добавление точек
  function toWorld(e) {
    const r = inCv.getBoundingClientRect();
    const R = st.inRect;
    if (!R) return null;
    const x = ((e.clientX - r.left - R.x) / R.s) * 2 * DOMAIN - DOMAIN;
    const y = DOMAIN - ((e.clientY - r.top - R.y) / R.s) * 2 * DOMAIN;
    if (Math.abs(x) > DOMAIN || Math.abs(y) > DOMAIN) return null;
    return { x, y };
  }
  function readout() {
    const p = st.net.forward(st.hover.x, st.hover.y);
    const el = $('#readout');
    el.innerHTML = `x₁ = ${fmt(st.hover.x, 1)}, x₂ = ${fmt(st.hover.y, 1)}<br>p(оранжевый) = ${p.toFixed(2).replace('.', ',')}`;
    el.classList.add('on');
  }
  inCv.addEventListener('pointermove', (e) => { st.hover = toWorld(e); if (!st.hover) $('#readout').classList.remove('on'); dirty = true; });
  inCv.addEventListener('pointerleave', () => { st.hover = null; $('#readout').classList.remove('on'); dirty = true; });
  inCv.addEventListener('click', (e) => {
    const w = toWorld(e);
    if (!w) return;
    st.train.push({ x: w.x, y: w.y, c: e.shiftKey || e.altKey ? 1 - st.paint : st.paint });
    dirty = true;
  });
  inCv.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const w = toWorld(e);
    if (!w) return;
    st.train.push({ x: w.x, y: w.y, c: 1 - st.paint });
    dirty = true;
  });
  document.querySelectorAll('#paint button').forEach((b) => b.addEventListener('click', () => {
    st.paint = +b.dataset.c;
    document.querySelectorAll('#paint button').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
  }));
  // подсказка по нейрону
  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.hidden = true;
  $('#netBody').appendChild(tip);
  netCv.addEventListener('pointermove', (e) => {
    const r = netCv.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const t = tiles.find((q) => x >= q.x && x <= q.x + q.s && y >= q.y && y <= q.y + q.s);
    st.hoverTile = t ? { l: t.l, j: t.j } : null;
    if (t) {
      const net = st.net;
      const name = t.l === 0 ? `вход x${t.j === 0 ? '₁' : '₂'}` : t.l === net.L ? 'выход: вероятность оранжевого' : `слой ${t.l}, нейрон ${t.j + 1} · смещение ${fmt(net.B[t.l - 1][t.j])}`;
      tip.textContent = name;
      tip.style.left = `${t.x + t.s / 2}px`;
      tip.style.top = `${t.y}px`;
      tip.hidden = false;
    } else tip.hidden = true;
    dirty = true;
  });
  netCv.addEventListener('pointerleave', () => { st.hoverTile = null; tip.hidden = true; dirty = true; });

  function onResize() { DPR = Math.min(window.devicePixelRatio || 1, 2); dirty = true; drawNet(); buildArch(); }
  window.addEventListener('resize', onResize);

  /* ============================ старт ============================ */
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  buildDatasets();
  buildActs();
  bindSliders();
  makeData();
  makeNet();
  // немного обучения заранее, чтобы первый кадр уже показывал структуру; «Новые веса» начнут с нуля
  for (let i = 0; i < 12; i++) stepTrain(30);
  drawNet();
  buildArch();
  requestAnimationFrame(frame);
})();
