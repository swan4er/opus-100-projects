/* ==========================================================================
   Анатомия JPEG — интерфейс.
   Связывает кодек (codec.js), встроенные картинки (images.js),
   главный холст, разбор блока и восемь глав.
   ========================================================================== */
(() => {
  'use strict';

  const J = window.JPEG, IM = window.IMAGES;
  const SHOT = !!window.__SHOT__;
  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const dpr = () => Math.min(3, window.devicePixelRatio || 1);

  /* ---------- Форматирование по-русски ---------- */

  const NB = ' ';
  const fmtInt = (n) => (n < 0 ? '−' : '') + String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, NB);
  const fmtNum = (x, d = 1) => (x < 0 ? '−' : '') + Math.abs(x).toFixed(d).replace('.', ',');
  const signed = (n) => (n > 0 ? '+' + n : n < 0 ? '−' + -n : '0');
  function plural(n, one, few, many) {
    n = Math.abs(Math.round(n)) % 100;
    const n1 = n % 10;
    if (n > 10 && n < 20) return many;
    if (n1 > 1 && n1 < 5) return few;
    if (n1 === 1) return one;
    return many;
  }
  const bytesW = (n) => plural(n, 'байт', 'байта', 'байт');
  const bitsW = (n) => plural(n, 'бит', 'бита', 'бит');
  const bin = (v, n) => (n ? (v >>> 0).toString(2).padStart(n, '0').slice(-n) : '');
  const hex2 = (v) => v.toString(16).toUpperCase().padStart(2, '0');

  /* ---------- Палитры ---------- */

  const C = {
    paper: [239, 238, 232], paper2: [229, 227, 218], ink: [17, 17, 20], ink2: [62, 62, 69],
    blue: [42, 60, 219], red: [232, 67, 42], yellow: [255, 221, 60],
  };
  const css = (c, a) => (a === undefined ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${a})`);
  const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  function ramp(stops) {
    const lut = new Uint8ClampedArray(256 * 3);
    for (let i = 0; i < 256; i++) {
      const t = i / 255;
      let k = 0;
      while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
      const [t0, c0] = stops[k], [t1, c1] = stops[k + 1];
      const c = mixc(c0, c1, clamp((t - t0) / (t1 - t0), 0, 1));
      lut[i * 3] = c[0]; lut[i * 3 + 1] = c[1]; lut[i * 3 + 2] = c[2];
    }
    return lut;
  }
  // Цветовые каналы при постоянной яркости
  const CB_LUT = new Uint8ClampedArray(768), CR_LUT = new Uint8ClampedArray(768);
  const CHROMA_GAIN = 1.6; // цветовые каналы у фотографий слабые: для показа усиливаем
  for (let v = 0; v < 256; v++) {
    const g = 128 + (v - 128) * CHROMA_GAIN;
    const a = J.yccToRgb(140, g, 128), b = J.yccToRgb(140, 128, g);
    CB_LUT.set([a[0], a[1], a[2]], v * 3);
    CR_LUT.set([b[0], b[1], b[2]], v * 3);
  }
  const ERR_LUT = ramp([[0, C.paper], [0.12, [246, 214, 180]], [0.4, C.red], [0.75, [120, 24, 30]], [1, C.ink]]);
  const BITS_LUT = ramp([[0, C.paper], [0.3, C.yellow], [0.62, C.red], [0.85, [92, 30, 120]], [1, C.ink]]);
  // Расходящаяся шкала для коэффициентов: синий — минус, бумага — ноль, красный — плюс
  const DIV_NEG = ramp([[0, C.paper], [1, C.blue]]), DIV_POS = ramp([[0, C.paper], [1, C.red]]);
  function divColor(v, max, out, o) {
    if (!v || !max) { out[o] = C.paper[0]; out[o + 1] = C.paper[1]; out[o + 2] = C.paper[2]; return; }
    const t = Math.round(255 * Math.min(1, Math.log1p(Math.abs(v)) / Math.log1p(max)) ** 0.85);
    const lut = v < 0 ? DIV_NEG : DIV_POS;
    out[o] = lut[t * 3]; out[o + 1] = lut[t * 3 + 1]; out[o + 2] = lut[t * 3 + 2];
  }
  const divCss = (v, max) => { const o = [0, 0, 0]; divColor(v, max, o, 0); return css(o); };

  /* ---------- Состояние ---------- */

  const S = {
    imgId: 'lighthouse', img: null, A: null, Pc: {}, P: null,
    quality: 12, sub: '420', opt: false,
    view: 'result', comp: 0,
    sel: { x: 88, y: 100 }, pinned: false, hover: false, grid: false,
    enc: null, dec: null, psnr: 0,
    scale: 2, version: 0, imgVersion: 0,
    tour: [], tourI: 0, resumeAt: 0,
    reveal: 1, intro: null, own: null, wave: -1,
  };

  function getP(sub) {
    if (!S.Pc[sub]) S.Pc[sub] = J.prepare(S.img, sub, S.A);
    return S.Pc[sub];
  }
  function selBlock(ci) {
    if (ci === undefined) ci = S.comp;
    const P = S.P, c = P.comps[ci];
    const fx = ci === 0 ? 1 : P.S.h, fy = ci === 0 ? 1 : P.S.v;
    const bx = clamp(Math.floor(S.sel.x / (8 * fx)), 0, c.bw - 1);
    const by = clamp(Math.floor(S.sel.y / (8 * fy)), 0, c.bh - 1);
    return { ci, c, bx, by, b: by * c.bw + bx, fx, fy };
  }
  // Предыдущий блок того же канала в потоке — от него считается разность DC
  function prevMap(P) {
    if (P.prev) return P.prev;
    const prev = P.comps.map((c) => new Int32Array(c.nb).fill(-1)), last = [-1, -1, -1];
    for (let t = 0; t < P.order.n; t++) { const ci = P.order.ci[t], b = P.order.bi[t]; prev[ci][b] = last[ci]; last[ci] = b; }
    return (P.prev = prev);
  }
  // Символы блока: DC, пары (нули, размер), ZRL, EOB — с кодами текущих таблиц
  function blockTokens(ci, b) {
    const enc = S.enc, q = enc.quant[ci], o = b * 64;
    const T = enc.T, dcT = ci ? T.dcC : T.dcY, acT = ci ? T.acC : T.acY;
    const pb = prevMap(S.P)[ci][b];
    const pred = pb < 0 ? 0 : q[pb * 64];
    const diff = q[o] - pred, cat = J.bitLen(diff);
    const out = [{ k: 'dc', diff, pred, dc: q[o], cat, sym: cat, code: dcT.code[cat], len: dcT.size[cat], vlen: cat, vbits: cat ? (diff < 0 ? diff - 1 : diff) & ((1 << cat) - 1) : 0 }];
    let run = 0;
    for (let k = 1; k < 64; k++) {
      const v = q[o + J.ZZ[k]];
      if (!v) { run++; continue; }
      while (run > 15) { out.push({ k: 'zrl', sym: 0xf0, code: acT.code[0xf0], len: acT.size[0xf0], vlen: 0, vbits: 0, pos: k }); run -= 16; }
      const s = J.bitLen(v), sym = (run << 4) | s;
      out.push({ k: 'ac', run, size: s, v, pos: k, sym, code: acT.code[sym], len: acT.size[sym], vlen: s, vbits: (v < 0 ? v - 1 : v) & ((1 << s) - 1) });
      run = 0;
    }
    if (run > 0) out.push({ k: 'eob', sym: 0, code: acT.code[0], len: acT.size[0], vlen: 0, vbits: 0 });
    return out;
  }

  /* ---------- Конвейер ---------- */

  function setImage(img, id, own) {
    S.img = img; S.imgId = id; S.own = own || null;
    S.A = J.analyze(img);
    S.Pc = {};
    S.P = getP(S.sub);
    S.imgVersion++;
    S.sizeCurve = null;
    S.tour = makeTour(img);
    S.tourI = 0;
    S.sel = { x: Math.round(S.tour[0][0]), y: Math.round(S.tour[0][1]) };
    S.pinned = false;
    S.probe = img.probe ? { x: clamp(Math.round(img.probe[0]), 0, img.w - 1), y: clamp(Math.round(img.probe[1]), 0, img.h - 1) } : { x: img.w >> 1, y: img.h >> 1 };
    updateDims();
    layoutStage();
    encodeNow();
    invalidate('stage', 'inspect', 'figs');
  }
  function encodeNow() {
    const enc = J.encode(S.P, { quality: S.quality, optimize: S.opt, measureAlt: CH[6] && CH[6].visible });
    S.enc = enc;
    S.dec = J.decode(enc.bytes);
    S.psnr = J.psnr(S.img.data, S.dec.rgba);
    S.version++;
    updateReadout();
  }
  function setQuality(q, src) {
    q = clamp(Math.round(q), 1, 100);
    if (q === S.quality && S.enc) return;
    S.quality = q;
    if (src !== 'intro') stopIntro();
    qRulers.forEach((r) => r !== src && r.set(q));
    invalidate('encode');
  }
  function setSub(sub) {
    if (sub === S.sub) return;
    S.sub = sub;
    S.P = getP(sub);
    S.sizeCurve = null;
    syncSeg($('#subSeg'), 'sub', sub);
    syncSeg($('#dockSub'), 'sub', sub);
    syncSeg($('#subPick'), 'sub', sub);
    updateGrid();
    invalidate('encode', 'figs');
  }
  function setOpt(opt) {
    if (opt === S.opt) return;
    S.opt = opt;
    S.sizeCurve = null;
    syncSeg($('#optSeg'), 'opt', opt ? '1' : '0');
    invalidate('encode');
  }
  function syncSeg(root, key, val) {
    if (!root) return;
    $$('button', root).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset[key] === String(val))));
  }

  /* ---------- Планировщик кадров ---------- */

  const dirty = { encode: false, stage: false, inspect: false, figs: false };
  let raf = 0;
  const anims = new Set(); // функции (t) → true, пока анимация идёт
  function invalidate(...what) { for (const w of what) dirty[w] = true; kick(); }
  function kick() { if (!raf && !document.hidden) raf = requestAnimationFrame(frame); }
  function frame(t) {
    raf = 0;
    for (const a of Array.from(anims)) if (!a(t)) anims.delete(a);
    if (dirty.encode) { dirty.encode = false; encodeNow(); dirty.stage = dirty.inspect = dirty.figs = true; }
    if (dirty.stage) { dirty.stage = false; drawStage(); }
    if (dirty.inspect) { dirty.inspect = false; drawInspector(); placeCursor(); }
    if (dirty.figs) { dirty.figs = false; for (const ch of Object.values(CH)) ch.dirty = true; }
    for (const ch of Object.values(CH)) if (ch.visible && ch.dirty) { ch.dirty = false; ch.update(); }
    if (anims.size) kick();
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });

  /* ---------- Линейка-ползунок ---------- */

  class Ruler {
    constructor(el, o) {
      this.el = el; this.o = o; this.v = o.value;
      el.innerHTML = `
        <div class="r-head"><span class="lbl">${o.label}</span><span class="r-hint"></span></div>
        <div class="r-track"><canvas class="r-ticks"></canvas>
          <input type="range" min="${o.min}" max="${o.max}" step="1" value="${o.value}" aria-label="${o.aria || o.label}">
          <div class="r-thumb"><span></span></div>
        </div>`;
      this.input = $('input', el); this.thumb = $('.r-thumb', el); this.num = $('.r-thumb span', el);
      this.hint = $('.r-hint', el); this.ticks = $('.r-ticks', el); this.track = $('.r-track', el);
      this.input.addEventListener('input', () => { this.v = +this.input.value; this.place(); o.onInput(this.v, this); });
      this.input.addEventListener('pointerdown', () => el.classList.add('drag'));
      window.addEventListener('pointerup', () => el.classList.remove('drag'));
      this.resize();
    }
    set(v) { this.v = v; this.input.value = v; this.place(); }
    place() {
      const w = this.track.clientWidth, tw = this.thumb.offsetWidth || 40;
      const x = tw / 2 + ((this.v - this.o.min) / (this.o.max - this.o.min)) * (w - tw);
      this.thumb.style.transform = `translateX(${x.toFixed(1)}px)`;
      this.num.textContent = this.v;
      if (this.o.hint) this.hint.textContent = this.o.hint(this.v);
      this.input.setAttribute('aria-valuetext', this.o.valueText ? this.o.valueText(this.v) : String(this.v));
    }
    resize() {
      const w = this.track.clientWidth, h = this.track.clientHeight;
      if (!w) return;
      const k = dpr(), cv = this.ticks;
      cv.width = Math.round(w * k); cv.height = Math.round(h * k);
      const ctx = cv.getContext('2d');
      ctx.setTransform(k, 0, 0, k, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const tw = this.thumb.offsetWidth || 40, { min, max } = this.o;
      const small = this.el.dataset.size === 'small';
      const base = small ? h - 1 : h - 16;
      ctx.fillStyle = css(C.ink);
      ctx.fillRect(0, base, w, 1);
      for (let v = min; v <= max; v++) {
        const x = Math.round(tw / 2 + ((v - min) / (max - min)) * (w - tw)) + 0.5;
        const major = this.o.major(v);
        const len = major ? (small ? 9 : 12) : (small ? 4 : 5);
        ctx.fillStyle = major ? css(C.ink) : css(C.ink, 0.45);
        ctx.fillRect(x - 0.5, base - len, 1, len);
        if (major && !small) {
          ctx.font = '500 11px "Geist Mono", ui-monospace, monospace';
          ctx.fillStyle = css(C.ink2);
          ctx.textAlign = 'center';
          ctx.fillText(String(v), x, h - 2);
        }
      }
      this.place();
    }
  }

  /* ---------- Главный холст ---------- */

  const stageBox = $('#stageBox'), view = $('#view'), vctx = view.getContext('2d');
  const cursor = $('#cursor'), cursorTag = $('#cursorTag'), grid8 = $('#grid8');
  let viewImg = null;

  function layoutStage() {
    const img = S.img;
    if (view.width !== img.w || view.height !== img.h) { view.width = img.w; view.height = img.h; }
    viewImg = vctx.createImageData(img.w, img.h);
    const vw = document.documentElement.clientWidth, vh = window.innerHeight;
    const cover = $('.cover'), pad = parseFloat(getComputedStyle(cover).paddingLeft) || 16;
    const wide = vw > 1100;
    let availW = vw - 2 * pad;
    let availH = Infinity;
    if (wide) {
      availW -= 44 + clamp(vw * 0.29, 380, 470);
      const top = stageBox.getBoundingClientRect().top + window.scrollY;
      const cap = $('#cap1'), con = $('.console'), cs = (el, k) => parseFloat(getComputedStyle(el)[k]) || 0;
      const below = cap.offsetHeight + cs(cap, 'marginTop') + con.offsetHeight + cs(con, 'marginTop') + cs(cover, 'paddingBottom');
      availH = Math.max(240, vh - top - below);
    }
    const k = dpr();
    let s = Math.min(availW / img.w, availH / img.h);
    if (s >= 1) s = Math.max(1, Math.floor(s * k) / k);
    s = Math.min(s, 4);
    S.scale = s;
    stageBox.style.width = Math.round(img.w * s) + 'px';
    stageBox.style.height = Math.round(img.h * s) + 'px';
    stageBox.classList.toggle('smooth', s < 1);
    updateGrid();
    placeCursor(true);
  }
  function updateGrid() {
    grid8.hidden = !S.grid;
    if (!S.P) return;
    const fx = S.comp ? S.P.S.h : 1, fy = S.comp ? S.P.S.v : 1;
    grid8.style.backgroundSize = `${8 * fx * S.scale}px ${8 * fy * S.scale}px`;
  }

  function drawStage() {
    if (!S.dec) return;
    const img = S.img, W = img.w, H = img.h, out = viewImg.data;
    const dec = S.dec, PW = dec.frame.comps[0].pw;
    const tag = $('#stageTag'), legend = $('#legend');
    let tagText = '', legendHtml = '';
    switch (S.view) {
      case 'original':
        out.set(img.data);
        tagText = 'Оригинал, без сжатия';
        break;
      case 'y': {
        const Yp = dec.planes[0];
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = Yp[y * PW + x], i = (y * W + x) * 4; out[i] = out[i + 1] = out[i + 2] = v; out[i + 3] = 255; }
        tagText = 'Канал Y после декодера';
        break;
      }
      case 'cb': case 'cr': {
        const P = S.view === 'cb' ? dec.planes[1] : dec.planes[2], L = S.view === 'cb' ? CB_LUT : CR_LUT;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = P[y * PW + x] * 3, i = (y * W + x) * 4; out[i] = L[v]; out[i + 1] = L[v + 1]; out[i + 2] = L[v + 2]; out[i + 3] = 255; }
        tagText = `Канал ${S.view === 'cb' ? 'Cb' : 'Cr'} после декодера · ${J.SUBSAMPLING[S.sub].label}`;
        break;
      }
      case 'error': {
        const a = img.data, b = dec.rgba, gain = 6;
        for (let i = 0; i < a.length; i += 4) {
          const e = (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) / 3;
          const t = Math.min(255, Math.round(e * gain)) * 3;
          out[i] = ERR_LUT[t]; out[i + 1] = ERR_LUT[t + 1]; out[i + 2] = ERR_LUT[t + 2]; out[i + 3] = 255;
        }
        tagText = `Ошибка, усилена в${NB}6${NB}раз`;
        legendHtml = legendBar(ERR_LUT, '0', '42+ уровня');
        break;
      }
      case 'bits': {
        const cost = bitsPerYBlock();
        let max = 1;
        for (let i = 0; i < cost.length; i++) if (cost[i] > max) max = cost[i];
        const P = S.P, bw = P.comps[0].bw, src = dec.rgba;
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const i = (y * W + x) * 4;
            const c = cost[(y >> 3) * bw + (x >> 3)];
            const t = Math.round(255 * Math.sqrt(c / max)) * 3;
            const l = (src[i] * 0.3 + src[i + 1] * 0.59 + src[i + 2] * 0.11) / 255;
            const edge = (x & 7) === 0 || (y & 7) === 0 ? 0.9 : 1;
            out[i] = (BITS_LUT[t] * (0.72 + 0.28 * l)) * edge;
            out[i + 1] = (BITS_LUT[t + 1] * (0.72 + 0.28 * l)) * edge;
            out[i + 2] = (BITS_LUT[t + 2] * (0.72 + 0.28 * l)) * edge;
            out[i + 3] = 255;
          }
        }
        tagText = 'Сколько бит стоит каждый блок 8×8';
        legendHtml = legendBar(BITS_LUT, '0', fmtInt(max) + ' бит');
        break;
      }
      default:
        out.set(dec.rgba);
    }
    // Наведение на волну: гасим блоки, где она обнулена квантованием
    if (S.wave >= 0 && S.enc) {
      const { ci, fx, fy } = selBlock(), c = S.P.comps[ci], q = S.enc.quant[ci], i = S.wave;
      let alive = 0;
      for (let by = 0; by < c.bh; by++) {
        for (let bx = 0; bx < c.bw; bx++) {
          const b = by * c.bw + bx;
          if (q[b * 64 + i] !== 0) { alive++; continue; }
          const x0 = bx * 8 * fx, y0 = by * 8 * fy;
          for (let y = y0; y < Math.min(H, y0 + 8 * fy); y++) {
            for (let x = x0; x < Math.min(W, x0 + 8 * fx); x++) {
              const o = (y * W + x) * 4;
              out[o] = out[o] * 0.22 + C.paper[0] * 0.78; out[o + 1] = out[o + 1] * 0.22 + C.paper[1] * 0.78; out[o + 2] = out[o + 2] * 0.22 + C.paper[2] * 0.78;
            }
          }
        }
      }
      tagText = `Волна ${i % 8}:${(i / 8) | 0} уцелела в${NB}${fmtInt(alive)} ${plural(alive, 'блоке', 'блоках', 'блоках')} из ${fmtInt(c.nb)}`;
      legendHtml = '';
    }
    // Проявление при загрузке: декодер заполняет картинку полосами MCU сверху вниз
    if (S.reveal < 1) {
      const mcuH = 8 * S.P.S.v, rows = Math.ceil(H / mcuH);
      const done = S.reveal * rows, full = Math.floor(done);
      const y0 = Math.min(H, full * mcuH);
      const partW = Math.floor((done - full) * W / (8 * S.P.S.h)) * 8 * S.P.S.h;
      for (let y = y0; y < H; y++) {
        const inPart = y < y0 + mcuH;
        for (let x = inPart ? partW : 0; x < W; x++) { const i = (y * W + x) * 4; out[i] = C.paper2[0]; out[i + 1] = C.paper2[1]; out[i + 2] = C.paper2[2]; }
      }
    }
    vctx.putImageData(viewImg, 0, 0);
    tag.hidden = !tagText; tag.textContent = tagText;
    legend.hidden = !legendHtml; if (legendHtml) legend.innerHTML = legendHtml;
  }
  function legendBar(lut, a, b) {
    const stops = [];
    for (let i = 0; i <= 8; i++) { const k = Math.round((i / 8) * 255) * 3; stops.push(`rgb(${lut[k]},${lut[k + 1]},${lut[k + 2]}) ${(i / 8) * 100}%`); }
    return `<div class="lg-bar" style="background:linear-gradient(to right,${stops.join(',')})"></div><div class="lg-ends"><span>${a}</span><span>${b}</span></div>`;
  }
  // Биты на каждый блок яркости + его доля цветовых блоков
  function bitsPerYBlock() {
    const P = S.P, e = S.enc, cy = P.comps[0], cc = P.comps[1];
    const out = new Float32Array(cy.nb);
    const share = P.S.h * P.S.v;
    for (let by = 0; by < cy.bh; by++) {
      for (let bx = 0; bx < cy.bw; bx++) {
        const cb = Math.floor(by / P.S.v) * cc.bw + Math.floor(bx / P.S.h);
        out[by * cy.bw + bx] = e.blockBits[0][by * cy.bw + bx] + (e.blockBits[1][cb] + e.blockBits[2][cb]) / share;
      }
    }
    return out;
  }

  function placeCursor(instant) {
    if (!S.P) return;
    const { bx, by, fx, fy, ci } = selBlock();
    const s = S.scale;
    const x = bx * 8 * fx * s, y = by * 8 * fy * s, w = 8 * fx * s, h = 8 * fy * s;
    if (instant) cursor.style.transition = 'none';
    cursor.style.width = w + 'px';
    cursor.style.height = h + 'px';
    cursor.style.transform = `translate(${x}px, ${y}px)`;
    if (instant) { void cursor.offsetWidth; cursor.style.transition = ''; }
    const name = ['Y', 'Cb', 'Cr'][ci];
    cursorTag.textContent = `${name} · блок ${bx}:${by}${S.pinned ? ' · закреплён' : ''}`;
    cursor.classList.toggle('pinned', S.pinned);
    cursor.classList.toggle('flip', y < 40);
    cursor.classList.toggle('right', x > S.img.w * s - 190);
    $('#lbId').textContent = `${name} ${bx}:${by}`;
  }

  // Точки обхода: у встроенных картинок заданы, у своей — самые «насыщенные» блоки
  function makeTour(img) {
    if (img.tour) return img.tour;
    const P = J.prepare(img, '444', J.analyze(img));
    const c = P.comps[0], energy = [];
    for (let b = 0; b < c.nb; b++) {
      let e = 0;
      for (let i = 1; i < 64; i++) e += Math.abs(c.dct[b * 64 + i]);
      energy.push([e, b]);
    }
    energy.sort((a, b) => b[0] - a[0]);
    const pts = [];
    for (const [, b] of energy) {
      const x = (b % c.bw) * 8 + 4, y = Math.floor(b / c.bw) * 8 + 4;
      if (x >= img.w || y >= img.h) continue;
      if (pts.every(([px, py]) => Math.hypot(px - x, py - y) > Math.min(img.w, img.h) / 4)) pts.push([x, y]);
      if (pts.length >= 8) break;
    }
    if (!pts.length) pts.push([img.w >> 1, img.h >> 1]);
    return pts;
  }
  // Обход «интересных» блоков, пока пользователь не взялся за мышь: таймер, а не кадры
  function needTour() { return !REDUCED && !SHOT && !S.hover && !S.pinned && !S.intro; }
  let tourTimer = 0;
  function scheduleTour(delay) { clearTimeout(tourTimer); tourTimer = setTimeout(tourTick, delay); }
  function tourTick() {
    if (!needTour() || document.hidden || performance.now() < S.resumeAt) { scheduleTour(900); return; }
    S.tourI = (S.tourI + 1) % S.tour.length;
    S.sel = { x: Math.round(S.tour[S.tourI][0]), y: Math.round(S.tour[S.tourI][1]) };
    invalidate('inspect');
    markFigsSel();
    scheduleTour(1700);
  }
  function markFigsSel() { for (const k of [3, 4, 5, 6]) if (CH[k]) CH[k].dirty = true; kick(); }

  function stagePoint(e) {
    const r = stageBox.getBoundingClientRect();
    return { x: clamp((e.clientX - r.left) / S.scale, 0, S.img.w - 1), y: clamp((e.clientY - r.top) / S.scale, 0, S.img.h - 1) };
  }
  function selectAt(p) {
    const before = selBlock();
    S.sel = p;
    const after = selBlock();
    if (before.b !== after.b) { invalidate('inspect'); markFigsSel(); }
  }
  stageBox.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    S.hover = true;
    if (!S.pinned) selectAt(stagePoint(e));
  });
  stageBox.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'touch') return;
    S.hover = false;
    S.resumeAt = performance.now() + 2600;
    scheduleTour(2700);
  });
  stageBox.addEventListener('click', (e) => {
    const p = stagePoint(e);
    const inSame = selBlock().b === (S.sel = p, selBlock()).b;
    if (e.pointerType === 'touch' || !S.pinned || !inSame) S.pinned = true;
    else S.pinned = false;
    invalidate('inspect');
    markFigsSel();
  });
  stageBox.addEventListener('keydown', (e) => {
    const { fx, fy } = selBlock();
    const step = { ArrowLeft: [-8 * fx, 0], ArrowRight: [8 * fx, 0], ArrowUp: [0, -8 * fy], ArrowDown: [0, 8 * fy] }[e.key];
    if (step) {
      e.preventDefault();
      S.pinned = true;
      S.sel = { x: clamp(S.sel.x + step[0], 0, S.img.w - 1), y: clamp(S.sel.y + step[1], 0, S.img.h - 1) };
      invalidate('inspect'); markFigsSel();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault(); S.pinned = !S.pinned; invalidate('inspect');
    } else if (e.key === 'Escape') {
      S.pinned = false; invalidate('inspect');
    }
  });

  /* ---------- Разбор блока: световой короб, полоса, биты ---------- */

  const lbGrid = $('#lbGrid'), lbTip = $('#lbTip');
  const tiles = [];
  const BASIS = [];
  for (let v = 0; v < 8; v++) for (let u = 0; u < 8; u++) BASIS[v * 8 + u] = J.basis(u, v);
  function paintBasis(cv, idx, sign, dcTone) {
    const ctx = cv.getContext('2d'), im = ctx.createImageData(8, 8), b = BASIS[idx];
    for (let i = 0; i < 64; i++) {
      const v = idx === 0 ? dcTone : 128 + 127 * b[i] * sign;
      im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(im, 0, 0);
  }
  for (let i = 0; i < 64; i++) {
    const t = document.createElement('div');
    t.className = 'tile';
    const cv = document.createElement('canvas'); cv.width = 8; cv.height = 8;
    t.appendChild(cv);
    lbGrid.appendChild(t);
    paintBasis(cv, i, 1, 200);
    tiles.push({ el: t, cv, sign: 1, tone: -1 });
    // мышь: подсветка, пока курсор над волной; палец: касание включает, повторное — выключает
    t.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'mouse') return; showTileTip(i); S.wave = i; invalidate('stage'); });
    t.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'mouse') return; lbTip.hidden = true; S.wave = -1; invalidate('stage'); });
    t.addEventListener('click', (e) => {
      // в Safari click — не PointerEvent: тогда решаем по тому, умеет ли устройство наводить
      const isMouse = e.pointerType ? e.pointerType === 'mouse' : window.matchMedia('(hover: hover)').matches;
      if (isMouse) return;
      if (S.wave === i) { S.wave = -1; lbTip.hidden = true; } else { S.wave = i; showTileTip(i); }
      invalidate('stage');
    });
  }
  function showTileTip(i) {
    if (!S.enc) return;
    const { ci, b } = selBlock();
    const u = i % 8, v = (i / 8) | 0, k = J.UNZZ[i];
    const d = S.P.comps[ci].dct[b * 64 + i], qt = S.enc.qt[ci ? 1 : 0][i], q = S.enc.quant[ci][b * 64 + i];
    lbTip.innerHTML = `Волна ${u}:${v} · №${k + 1} по${NB}зигзагу<br>ДКП ${fmtNum(d, 1)} ÷ шаг ${qt} → <b>${signed(q)}</b>${q ? '' : ' (обнулена)'}`;
    lbTip.hidden = false;
    const r = tiles[i].el.getBoundingClientRect(), R = $('#lightbox').getBoundingClientRect();
    let x = r.left - R.left + r.width / 2 - lbTip.offsetWidth / 2;
    x = clamp(x, 0, R.width - lbTip.offsetWidth);
    lbTip.style.transform = `translate(${x}px, ${r.top - R.top - lbTip.offsetHeight - 8}px)`;
  }

  const stripCv = {};
  $$('#strip canvas[data-k]').forEach((c) => { stripCv[c.dataset.k] = c; });
  const bitsCv = $('#bitsCanvas');

  function blockPixels(plane, pw, bx, by, out) {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) out[y * 8 + x] = plane[(by * 8 + y) * pw + bx * 8 + x];
    return out;
  }
  function paintBlock(cv, vals, ci, kind, max) {
    const ctx = cv.getContext('2d'), im = ctx.createImageData(8, 8), d = im.data;
    for (let i = 0; i < 64; i++) {
      const o = i * 4;
      if (kind === 'px') {
        const v = clamp(Math.round(vals[i]), 0, 255);
        if (ci === 0) { d[o] = d[o + 1] = d[o + 2] = v; }
        else { const L = ci === 1 ? CB_LUT : CR_LUT; d[o] = L[v * 3]; d[o + 1] = L[v * 3 + 1]; d[o + 2] = L[v * 3 + 2]; }
      } else if (kind === 'div') divColor(vals[i], max, d, o);
      else if (kind === 'err') { const t = Math.min(255, Math.round(vals[i] * 4)) * 3; d[o] = ERR_LUT[t]; d[o + 1] = ERR_LUT[t + 1]; d[o + 2] = ERR_LUT[t + 2]; }
      d[o + 3] = 255;
    }
    ctx.putImageData(im, 0, 0);
  }

  const tmpA = new Float64Array(64), tmpB = new Float64Array(64), tmpC = new Float64Array(64);
  function drawInspector() {
    if (!S.enc) return;
    const { ci, c, bx, by, b } = selBlock();
    const enc = S.enc, qt = enc.qt[ci ? 1 : 0];
    const dct = c.dct.subarray(b * 64, b * 64 + 64), q = enc.quant[ci].subarray(b * 64, b * 64 + 64);
    // световой короб
    let maxAbs = 1, lit = 0;
    for (let i = 0; i < 64; i++) { const a = Math.abs(q[i] * qt[i]); if (i && a > maxAbs) maxAbs = a; }
    const dcTone = clamp(Math.round(q[0] * qt[0] / 8 + 128), 0, 255);
    for (let i = 0; i < 64; i++) {
      const t = tiles[i], val = q[i] * qt[i];
      const sign = val < 0 ? -1 : 1;
      if (i === 0 ? t.tone !== dcTone : t.sign !== sign) { paintBasis(t.cv, i, sign, dcTone); t.sign = sign; t.tone = dcTone; }
      if (q[i]) {
        lit++;
        const g = i === 0 ? 0.75 : clamp(Math.log1p(Math.abs(val)) / Math.log1p(maxAbs), 0.25, 1);
        t.el.style.setProperty('--o', '1');
        t.el.style.setProperty('--s', (0.9 + 0.1 * g).toFixed(3));
        t.el.style.setProperty('--g', (0.35 + 0.65 * g).toFixed(3));
        t.el.classList.add('hot');
      } else {
        const orig = Math.min(1, Math.abs(dct[i]) / qt[i]);
        t.el.style.setProperty('--o', (0.06 + 0.14 * orig).toFixed(3));
        t.el.style.setProperty('--s', '0.8');
        t.el.style.setProperty('--g', '0');
        t.el.classList.remove('hot');
      }
    }
    const touch = window.matchMedia('(hover: none)').matches;
    const hint = touch ? 'Коснитесь волны&nbsp;— на&nbsp;рис.&nbsp;1 выше останутся только блоки, где она уцелела.' : 'Наведите на&nbsp;волну&nbsp;— на&nbsp;рис.&nbsp;1 останутся только блоки, где она уцелела.';
    $('#lbNote').innerHTML = `${plural(lit, 'Светится', 'Светятся', 'Светится')} ${lit} ${plural(lit, 'волна', 'волны', 'волн')} из&nbsp;64, остальные обнулены квантованием.<span>${hint}</span>`;

    // полоса: пиксели → ДКП → квант → декодер → ошибка
    const src = blockPixels(c.plane, c.pw, bx, by, tmpA);
    const dc = S.dec.frame.comps[ci];
    const out = blockPixels(dc.plane, dc.pw, bx, by, tmpB);
    paintBlock(stripCv.src, src, ci, 'px');
    let dmax = 1;
    for (let i = 0; i < 64; i++) if (Math.abs(dct[i]) > dmax) dmax = Math.abs(dct[i]);
    paintBlock(stripCv.dct, dct, ci, 'div', dmax);
    for (let i = 0; i < 64; i++) tmpC[i] = q[i] * qt[i];
    paintBlock(stripCv.q, tmpC, ci, 'div', dmax);
    paintBlock(stripCv.dec, out, ci, 'px');
    for (let i = 0; i < 64; i++) tmpC[i] = Math.abs(out[i] - src[i]);
    paintBlock(stripCv.err, tmpC, ci, 'err');

    // биты блока
    const toks = blockTokens(ci, b);
    const w = bitsCv.clientWidth;
    if (w) {
      const k = dpr();
      const cellW = 4, gap = 1, pitch = cellW + gap, perRow = Math.floor((w + gap) / pitch);
      let total = 0;
      for (const t of toks) total += t.len + t.vlen;
      const rows = Math.max(1, Math.ceil(total / perRow)), rowH = 9, rowGap = 3;
      const hCss = rows * rowH + (rows - 1) * rowGap;
      bitsCv.style.height = hCss + 'px';
      bitsCv.width = Math.round(w * k); bitsCv.height = Math.round(hCss * k);
      const ctx = bitsCv.getContext('2d');
      ctx.setTransform(k, 0, 0, k, 0, 0);
      ctx.clearRect(0, 0, w, hCss);
      let n = 0;
      const put = (bits, col, colDim) => {
        for (const ch of bits) {
          const x = (n % perRow) * pitch, y = Math.floor(n / perRow) * (rowH + rowGap);
          if (ch === '1') { ctx.fillStyle = col; ctx.fillRect(x, y, cellW, rowH); }
          else { ctx.fillStyle = colDim; ctx.fillRect(x, y, cellW, rowH); }
          n++;
        }
      };
      for (const t of toks) {
        const col = t.k === 'dc' ? css(C.blue) : t.k === 'eob' ? css(C.red) : t.k === 'zrl' ? '#b89a00' : css(C.ink);
        const dim = t.k === 'dc' ? css(C.blue, 0.22) : t.k === 'eob' ? css(C.red, 0.25) : t.k === 'zrl' ? css(C.yellow, 0.5) : css(C.ink, 0.14);
        put(bin(t.code, t.len), col, dim);
        put(bin(t.vbits, t.vlen), css(C.ink2, 0.7), css(C.ink2, 0.1));
      }
      const raw = 64 * 8;
      $('#bitsText').innerHTML = `Блок в&nbsp;файле: <b>${total} ${bitsW(total)}</b> вместо ${raw}${total ? ` · в&nbsp;${fmtNum(raw / total, 1)} раза меньше` : ''} · <span style="color:var(--blue)">■</span>&nbsp;DC <span>■</span>&nbsp;AC <span style="color:var(--red)">■</span>&nbsp;EOB`;
    }
  }

  /* ---------- Показания ---------- */

  function updateDims() {
    const { w, h } = S.img;
    $$('[data-dim]').forEach((e) => { e.textContent = `${w}${NB}×${NB}${h}`; });
    $$('[data-raw]').forEach((e) => { e.textContent = fmtInt(w * h * 3); });
    $$('[data-raw-w]').forEach((e) => { e.textContent = bytesW(w * h * 3); });
  }
  function updateReadout() {
    const e = S.enc, n = e.bytes.length, raw = S.img.w * S.img.h * 3;
    $('#roSize').textContent = fmtInt(n);
    $('#roSizeUnit').textContent = bytesW(n);
    $('#roRaw').textContent = `было ${fmtInt(raw)}`;
    $('#roRatio').textContent = '×' + (raw / n >= 100 ? fmtInt(raw / n) : fmtNum(raw / n, raw / n >= 10 ? 0 : 1));
    $('#roBpp').textContent = `${fmtNum((n * 8) / (S.img.w * S.img.h), 2)} бита на${NB}пиксель`;
    $('#roPsnr').textContent = fmtNum(S.psnr, 1);
    $('#roPsnrNote').textContent = S.psnr >= 40 ? 'почти без потерь' : S.psnr >= 34 ? 'потери едва видны' : S.psnr >= 28 ? 'артефакты видны' : 'сильные артефакты';
    $('#dockSize').textContent = `${fmtInt(n)} ${bytesW(n)}`;
    const note = S.own ? ` Ваш файл: ${S.own}.` : '';
    const touch = window.matchMedia('(hover: none)').matches, narrow = window.innerWidth <= 1100;
    const how = touch ? `Коснитесь картинки&nbsp;— ${narrow ? 'ниже' : 'справа'} разберём блок под пальцем.` : `Наведите курсор&nbsp;— ${narrow ? 'ниже' : 'справа'} разберём блок под ним, щелчок закрепит выбор.`;
    $('#cap1').innerHTML = `<b>Рис. 1.</b> Картинка, декодированная из&nbsp;только что собранного файла: качество ${S.quality}, цвет ${J.SUBSAMPLING[S.sub].label}. ${how}${note}`;
    $('#dlName').textContent = `${fileName()} · ${fmtInt(S.enc.bytes.length)} ${bytesW(S.enc.bytes.length)}`;
  }
  const fileName = () => `anatomy-${S.imgId}-q${S.quality}-${S.sub}.jpg`;

  /* ======================================================================
     Главы
     ====================================================================== */

  const CH = {};
  function chapter(n, def) {
    const el = $('#ch' + n);
    CH[n] = Object.assign({ n, el, visible: false, dirty: true, update() {} }, def);
    return CH[n];
  }
  // Холст под CSS-размер с учётом devicePixelRatio; буфер пересоздаётся, только если размер изменился
  function fit(cv, cssW, cssH) {
    const k = dpr(), W = Math.round(cssW * k), H = Math.round(cssH * k);
    if (cv.width !== W || cv.height !== H) {
      cv.width = W; cv.height = H;
      cv.style.width = cssW + 'px'; cv.style.height = cssH + 'px';
    }
    const ctx = cv.getContext('2d');
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    return ctx;
  }
  function putRGBA(cv, rgba, w, h) {
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    cv.getContext('2d').putImageData(new ImageData(rgba, w, h), 0, 0);
  }

  /* ---------- 01. YCbCr ---------- */
  chapter(1, {
    ver: -1,
    init() {
      $$('.plate', this.el).forEach((pl) => {
        pl.addEventListener('pointermove', (e) => {
          const r = pl.getBoundingClientRect();
          S.probe = { x: clamp(Math.floor(((e.clientX - r.left) / r.width) * S.img.w), 0, S.img.w - 1), y: clamp(Math.floor(((e.clientY - r.top) / r.height) * S.img.h), 0, S.img.h - 1) };
          this.probe();
        });
      });
    },
    update() {
      if (this.ver !== S.imgVersion) {
        this.ver = S.imgVersion;
        const { w, h } = S.img, A = S.A, n = w * h;
        const planes = { y: new Uint8ClampedArray(n * 4), cb: new Uint8ClampedArray(n * 4), cr: new Uint8ClampedArray(n * 4) };
        for (let i = 0; i < n; i++) {
          const o = i * 4, yv = A.Y[i], cb = clamp(Math.round(A.Cb[i]), 0, 255) * 3, cr = clamp(Math.round(A.Cr[i]), 0, 255) * 3;
          planes.y[o] = planes.y[o + 1] = planes.y[o + 2] = yv; planes.y[o + 3] = 255;
          planes.cb[o] = CB_LUT[cb]; planes.cb[o + 1] = CB_LUT[cb + 1]; planes.cb[o + 2] = CB_LUT[cb + 2]; planes.cb[o + 3] = 255;
          planes.cr[o] = CR_LUT[cr]; planes.cr[o + 1] = CR_LUT[cr + 1]; planes.cr[o + 2] = CR_LUT[cr + 2]; planes.cr[o + 3] = 255;
        }
        $$('.plate', this.el).forEach((pl) => putRGBA($('canvas', pl), planes[pl.dataset.p], w, h));
      }
      this.probe();
    },
    probe() {
      const { x, y } = S.probe, i = (y * S.img.w + x) * 4, d = S.img.data;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const [Y, Cb, Cr] = J.rgbToYcc(r, g, b);
      $('#fR').textContent = r; $('#fG').textContent = g; $('#fB').textContent = b;
      $('#fY').textContent = Math.round(Y); $('#fCb').textContent = Math.round(Cb); $('#fCr').textContent = Math.round(Cr);
      $('#fSw').style.background = `rgb(${r},${g},${b})`;
      const px = ((x + 0.5) / S.img.w) * 100 + '%', py = ((y + 0.5) / S.img.h) * 100 + '%';
      $$('.plate .xh', this.el).forEach((xh) => { xh.style.setProperty('--px', px); xh.style.setProperty('--py', py); });
    },
  });

  /* ---------- 02. Прореживание ---------- */
  chapter(2, {
    f: 8, key: '',
    init() {
      $('#blurSeg').addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        this.f = +b.dataset.f; syncSeg($('#blurSeg'), 'f', this.f);
        $$('[data-f]', this.el).forEach((x) => { if (x.tagName === 'B') x.textContent = this.f; });
        this.dirty = true; kick();
      });
      // схемы J:a:b — какие пиксели получают свой цветовой отсчёт
      $$('#subPick button').forEach((btn) => {
        const cv = $('canvas', btn), ctx = cv.getContext('2d'), sub = btn.dataset.sub, S2 = J.SUBSAMPLING[sub];
        const cols = [[42, 60, 219], [232, 67, 42], [255, 221, 60], [17, 17, 20], [120, 190, 120], [230, 120, 200], [90, 200, 230], [160, 110, 60]];
        const im = ctx.createImageData(4, 2);
        for (let y = 0; y < 2; y++) for (let x = 0; x < 4; x++) {
          const k = Math.floor(y / S2.v) * 4 + Math.floor(x / S2.h), c = cols[k % cols.length], o = (y * 4 + x) * 4;
          im.data[o] = c[0]; im.data[o + 1] = c[1]; im.data[o + 2] = c[2]; im.data[o + 3] = 255;
        }
        ctx.putImageData(im, 0, 0);
        btn.addEventListener('click', () => setSub(sub));
      });
    },
    // Крупно: красный канал до и после прореживания и цвет, собранный по полной яркости
    zoom() {
      const key = S.imgVersion + ':' + S.sub;
      if (key === this.zkey) return;
      this.zkey = key;
      const img = S.img, A = S.A, P = S.P, cr = P.comps[2], cb = P.comps[1], SZ = 40;
      const [cx, cy] = (img.crops && img.crops.bleed) || CH[8].crops().bleed;
      const x0 = clamp(Math.round((cx - SZ / 2) / 2) * 2, 0, img.w - SZ), y0 = clamp(Math.round((cy - SZ / 2) / 2) * 2, 0, img.h - SZ);
      const cvs = $$('#zoom3 canvas');
      const paint = (cv, fn) => {
        const ctx = cv.getContext('2d'), im = ctx.createImageData(SZ, SZ);
        for (let y = 0; y < SZ; y++) for (let x = 0; x < SZ; x++) { const c = fn(x0 + x, y0 + y), o = (y * SZ + x) * 4; im.data[o] = c[0]; im.data[o + 1] = c[1]; im.data[o + 2] = c[2]; im.data[o + 3] = 255; }
        ctx.putImageData(im, 0, 0);
      };
      const lutC = (v) => { const k = clamp(Math.round(v), 0, 255) * 3; return [CR_LUT[k], CR_LUT[k + 1], CR_LUT[k + 2]]; };
      const hS = P.S.h, vS = P.S.v;
      // билинейно растянутый прореженный канал — как «треугольный» фильтр декодера
      const smp = (c, x, y) => {
        const fx = clamp((x + 0.5) / hS - 0.5, 0, c.pw - 1), fy = clamp((y + 0.5) / vS - 0.5, 0, c.ph - 1);
        const ax = Math.floor(fx), ay = Math.floor(fy), bx2 = Math.min(c.pw - 1, ax + 1), by2 = Math.min(c.ph - 1, ay + 1), tx = fx - ax, ty = fy - ay;
        const p = c.plane;
        return lerp(lerp(p[ay * c.pw + ax], p[ay * c.pw + bx2], tx), lerp(p[by2 * c.pw + ax], p[by2 * c.pw + bx2], tx), ty);
      };
      paint(cvs[0], (x, y) => lutC(A.Cr[y * img.w + x]));
      paint(cvs[1], (x, y) => lutC(cr.plane[Math.floor(y / vS) * cr.pw + Math.floor(x / hS)]));
      paint(cvs[2], (x, y) => J.yccToRgb(A.Y[y * img.w + x], smp(cb, x, y), smp(cr, x, y)));
      $('#z3sub').textContent = S.sub === '444' ? 'Cr без прореживания' : `Cr после ${J.SUBSAMPLING[S.sub].label}`;
    },
    update() {
      this.zoom();
      const key = S.imgVersion + ':' + this.f;
      if (key === this.key) return;
      this.key = key;
      const { w, h } = S.img, A = S.A, f = this.f;
      const blur = (P) => {
        // среднее по клеткам f×f и билинейное растяжение назад
        const cw = Math.ceil(w / f), chh = Math.ceil(h / f), small = new Float32Array(cw * chh), cnt = new Float32Array(cw * chh);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const k = ((y / f) | 0) * cw + ((x / f) | 0); small[k] += P[y * w + x]; cnt[k]++; }
        for (let k = 0; k < small.length; k++) small[k] /= cnt[k];
        const out = new Float32Array(w * h);
        for (let y = 0; y < h; y++) {
          const fy = clamp((y + 0.5) / f - 0.5, 0, chh - 1), y0 = Math.floor(fy), y1 = Math.min(chh - 1, y0 + 1), ty = fy - y0;
          for (let x = 0; x < w; x++) {
            const fx = clamp((x + 0.5) / f - 0.5, 0, cw - 1), x0 = Math.floor(fx), x1 = Math.min(cw - 1, x0 + 1), tx = fx - x0;
            const a = lerp(small[y0 * cw + x0], small[y0 * cw + x1], tx), b = lerp(small[y1 * cw + x0], small[y1 * cw + x1], tx);
            out[y * w + x] = lerp(a, b, ty);
          }
        }
        return out;
      };
      const toRGB = (Y, Cb, Cr) => {
        const o = new Uint8ClampedArray(w * h * 4);
        for (let i = 0; i < w * h; i++) { const c = J.yccToRgb(Y[i], Cb[i], Cr[i]); o[i * 4] = c[0]; o[i * 4 + 1] = c[1]; o[i * 4 + 2] = c[2]; o[i * 4 + 3] = 255; }
        return o;
      };
      putRGBA($('#blurC'), toRGB(A.Y, blur(A.Cb), blur(A.Cr)), w, h);
      putRGBA($('#blurY'), toRGB(blur(A.Y), A.Cb, A.Cr), w, h);
    },
  });

  /* ---------- 03. ДКП: сборка блока из волн ---------- */
  chapter(3, {
    k: 64, playing: false, bt: [],
    init() {
      const host = $('#basis');
      for (let z = 0; z < 64; z++) {
        const i = J.ZZ[z];
        const d = document.createElement('div');
        d.className = 'bt';
        const cv = document.createElement('canvas'); cv.width = 8; cv.height = 8;
        paintBasis(cv, i, 1, 235);
        const sp = document.createElement('span');
        d.append(cv, sp);
        d.style.gridColumn = (i % 8) + 1; d.style.gridRow = ((i / 8) | 0) + 1;
        host.appendChild(d);
        this.bt[i] = { el: d, sp };
      }
      this.ruler = new Ruler($('#kRuler'), {
        label: 'Волн в сумме', min: 1, max: 64, value: 64, aria: 'Сколько волн сложить',
        major: (v) => v === 1 || v % 8 === 0, hint: (v) => `первые ${v} из${NB}64 по${NB}зигзагу`,
        onInput: (v) => { this.playing = false; this.k = v; this.dirty = true; kick(); },
      });
      allRulers.push(this.ruler);
      $('#bPlay').addEventListener('click', () => this.play());
    },
    play() {
      if (REDUCED) { this.k = 64; this.ruler.set(64); this.dirty = true; kick(); return; }
      this.playing = true;
      const t0 = performance.now(), dur = 5200;
      anims.add((t) => {
        if (!this.playing) return false;
        const p = clamp((t - t0) / dur, 0, 1);
        const k = Math.max(1, Math.round(1 + 63 * (p ** 1.6)));
        if (k !== this.k) { this.k = k; this.ruler.set(k); this.dirty = true; }
        if (p >= 1) { this.playing = false; return false; }
        return true;
      });
      kick();
    },
    onShow() { if (!this.played && !SHOT) { this.played = true; this.play(); } },
    update() {
      if (!S.enc) return;
      const { ci, c, bx, by, b } = selBlock();
      const dct = c.dct.subarray(b * 64, b * 64 + 64);
      const src = blockPixels(c.plane, c.pw, bx, by, tmpA);
      paintBlock($('#bSrc'), src, ci, 'px');
      const part = new Float64Array(64), out = new Float64Array(64);
      for (let z = 0; z < this.k; z++) part[J.ZZ[z]] = dct[J.ZZ[z]];
      J.idct8x8(part, out);
      for (let i = 0; i < 64; i++) out[i] += 128;
      paintBlock($('#bSum'), out, ci, 'px');
      let err = 0, energy = 0, e1 = 0;
      for (let i = 0; i < 64; i++) { err += (out[i] - src[i]) ** 2; energy += dct[i] ** 2; }
      for (let z = 0; z < this.k; z++) e1 += dct[J.ZZ[z]] ** 2;
      $('#bSumL').textContent = `сумма ${this.k} ${plural(this.k, 'волны', 'волн', 'волн')}`;
      $('#bStat').innerHTML = `${this.k === 1 ? 'Первая волна несёт' : plural(this.k, `Первая ${this.k} волна несёт`, `Первые ${this.k} волны несут`, `Первые ${this.k} волн несут`)} <b>${fmtNum(energy ? (100 * e1) / energy : 100, 1)}&nbsp;%</b> энергии блока; средняя ошибка&nbsp;— <b>${fmtNum(Math.sqrt(err / 64), 1)}</b> уровня из&nbsp;255.`;
      // яркость плитки — вклад волны: видно, что энергия собрана в левом верхнем углу
      let maxAbs = 1;
      for (let i = 1; i < 64; i++) maxAbs = Math.max(maxAbs, Math.abs(dct[i]));
      const labelMin = Math.max(6, maxAbs * 0.12);
      for (let i = 0; i < 64; i++) {
        const z = J.UNZZ[i], t = this.bt[i], inK = z < this.k, mag = Math.abs(dct[i]);
        const w = i === 0 ? 1 : Math.sqrt(Math.min(1, mag / maxAbs));
        t.el.style.setProperty('--w', inK ? (0.1 + 0.9 * w).toFixed(3) : '0.05');
        t.el.classList.toggle('now', z === this.k - 1 && this.k < 64);
        const v = Math.round(dct[i]);
        t.sp.textContent = v > 0 ? String(v) : v < 0 ? '−' + -v : '';
        t.sp.classList.toggle('nz', inK && (i === 0 || mag >= labelMin));
      }
    },
  });

  /* ---------- 04. Квантование ---------- */
  function fillMatrix(host, vals, fmt, bg) {
    let cells = host.children;
    if (cells.length !== 64) { host.innerHTML = '<span></span>'.repeat(64); cells = host.children; }
    for (let i = 0; i < 64; i++) {
      const s = cells[i], v = vals[i];
      s.textContent = fmt(v, i);
      s.style.background = bg ? bg(v, i) : '';
      s.classList.toggle('z', Math.round(v) === 0);
    }
  }
  chapter(4, {
    curveKey: '', curve: null, curveJob: null,
    update() {
      if (!S.enc) return;
      const { ci, c, b } = selBlock();
      const qt = S.enc.qt[ci ? 1 : 0], dct = c.dct.subarray(b * 64, b * 64 + 64), q = S.enc.quant[ci].subarray(b * 64, b * 64 + 64);
      let dmax = 1;
      for (let i = 1; i < 64; i++) dmax = Math.max(dmax, Math.abs(dct[i]));
      const fmtV = (v) => { const r = Math.round(v); return r < 0 ? '−' + -r : String(r); };
      fillMatrix($('#mxDct .mx-g'), dct, fmtV, (v, i) => (i ? divCss(v, dmax) : divCss(v, Math.abs(v) || 1)));
      fillMatrix($('#mxQ .mx-g'), qt, (v) => String(v), (v) => { const t = clamp(Math.log(v) / Math.log(255), 0, 1); return css(t <= 0.5 ? mixc(C.paper, C.yellow, t * 2) : mixc(C.yellow, C.red, (t - 0.5) * 2)); });
      $$('#mxQ .mx-g span').forEach((s) => s.classList.remove('z'));
      fillMatrix($('#mxR .mx-g'), q, fmtV, (v) => (v ? divCss(v * 8, 64) : ''));
      $('#mxQL').textContent = `шаги ${ci ? 'цвета' : 'яркости'}, качество ${S.quality}`;
      let zb = 0;
      for (let i = 0; i < 64; i++) if (!q[i]) zb++;
      const st = S.enc.stats, zall = st.zeros / st.coefs;
      $('#zStat').innerHTML = `В&nbsp;этом блоке нулей: <b>${zb} из&nbsp;64</b>. По&nbsp;всей картинке обнулено <b>${fmtNum(zall * 100, 1)}&nbsp;%</b> коэффициентов AC.`;
      this.zeroChart();
      this.sizeChart();
    },
    zeroChart() {
      const cv = $('#zChart'), w = cv.parentElement.clientWidth, h = 150, ctx = fit(cv, w, h);
      const zc = new Float64Array(64);
      let n = 0;
      for (let ci = 0; ci < 3; ci++) {
        const q = S.enc.quant[ci], nb = q.length / 64;
        for (let bb = 0; bb < nb; bb++) for (let z = 0; z < 64; z++) if (!q[bb * 64 + J.ZZ[z]]) zc[z]++;
        n += nb;
      }
      const padL = 30, padB = 20, gw = w - padL, gh = h - padB - 6, bw = gw / 64;
      ctx.clearRect(0, 0, w, h);
      ctx.font = '400 11px "Geist Mono", monospace';
      ctx.fillStyle = css(C.ink2); ctx.textAlign = 'right';
      [0, 50, 100].forEach((p) => { const y = 6 + gh * (1 - p / 100); ctx.fillText(p + '%', padL - 6, y + 4); ctx.fillStyle = css(C.ink, 0.1); ctx.fillRect(padL, Math.round(y), gw, 1); ctx.fillStyle = css(C.ink2); });
      for (let z = 0; z < 64; z++) {
        const f = zc[z] / n, bh = gh * f;
        ctx.fillStyle = z === 0 ? css(C.blue) : css(mixc(C.yellow, C.red, clamp((f - 0.5) * 2, 0, 1)));
        ctx.fillRect(padL + z * bw + 0.5, 6 + gh - bh, Math.max(1, bw - 1), bh);
      }
      ctx.fillStyle = css(C.ink2); ctx.textAlign = 'left';
      ctx.fillText('DC', padL, h - 4);
      ctx.textAlign = 'right'; ctx.fillText('63 →', w, h - 4);
      ctx.textAlign = 'center'; ctx.fillText('номер в зигзаге', padL + gw / 2, h - 4);
    },
    sizeChart() {
      const key = S.imgVersion + ':' + S.sub + ':' + S.opt;
      if (key !== this.curveKey) {
        this.curveKey = key; this.curve = new Float64Array(101); this.curveN = 0;
        const P = S.P;
        let q = 1;
        const job = () => {
          if (this.curveKey !== key) return false;
          const t0 = performance.now();
          while (q <= 100 && performance.now() - t0 < 8) { this.curve[q] = J.encode(P, { quality: q, optimize: S.opt }).bytes.length; q++; }
          this.curveN = q - 1;
          this.drawCurve();
          return q <= 100;
        };
        anims.add(job); kick();
      }
      this.drawCurve();
    },
    drawCurve() {
      const cv = $('#sChart'), w = cv.parentElement.clientWidth, h = 150, ctx = fit(cv, w, h);
      const padL = 56, padB = 20, gw = w - padL - 6, gh = h - padB - 8;
      ctx.clearRect(0, 0, w, h);
      const n = this.curveN || 0;
      let max = 1;
      for (let q = 1; q <= n; q++) max = Math.max(max, this.curve[q]);
      if (S.enc) max = Math.max(max, S.enc.bytes.length);
      const nice = Math.pow(10, Math.floor(Math.log10(max))), top = Math.ceil(max / nice) * nice;
      ctx.font = '400 11px "Geist Mono", monospace';
      for (let k = 0; k <= 2; k++) {
        const v = (top * k) / 2, y = 8 + gh * (1 - v / top);
        ctx.fillStyle = css(C.ink, 0.1); ctx.fillRect(padL, Math.round(y), gw, 1);
        ctx.fillStyle = css(C.ink2); ctx.textAlign = 'right';
        ctx.fillText(fmtInt(v), padL - 6, y + 4);
      }
      const X = (q) => padL + ((q - 1) / 99) * gw, Y = (v) => 8 + gh * (1 - v / top);
      if (n > 1) {
        ctx.beginPath();
        for (let q = 1; q <= n; q++) q === 1 ? ctx.moveTo(X(q), Y(this.curve[q])) : ctx.lineTo(X(q), Y(this.curve[q]));
        ctx.strokeStyle = css(C.ink); ctx.lineWidth = 1.5; ctx.stroke();
      }
      if (S.enc) {
        const x = X(S.quality), y = Y(S.enc.bytes.length);
        ctx.fillStyle = css(C.red); ctx.fillRect(Math.round(x) - 4, Math.round(y) - 4, 8, 8);
        ctx.strokeStyle = css(C.red, 0.5); ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, 8 + gh); ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.fillStyle = css(C.ink2); ctx.textAlign = 'left';
      ctx.fillText('1', padL, h - 4); ctx.textAlign = 'right'; ctx.fillText('100', padL + gw, h - 4);
      ctx.textAlign = 'center'; ctx.fillText('качество → байты', padL + gw / 2, h - 4);
    },
  });

  /* ---------- 05. Зигзаг ---------- */
  chapter(5, {
    t0: 0,
    onShow() {
      if (this.running || SHOT || REDUCED) return;
      this.running = true;
      this.t0 = performance.now();
      anims.add((t) => { if (!this.visible) { this.running = false; return false; } this.phase = ((t - this.t0) % 7000) / 7000; this.draw(); return true; });
      kick();
    },
    update() { this.draw(); this.tokens(); },
    draw() {
      if (!S.enc) return;
      const { ci, b } = selBlock();
      const q = S.enc.quant[ci].subarray(b * 64, b * 64 + 64);
      const cv = $('#zzCanvas'), size = Math.min(320, cv.parentElement.clientWidth || 304), ctx = fit(cv, size, size);
      const cell = size / 8;
      const prog = this.running ? clamp(this.phase / 0.72, 0, 1) : 1;
      const upto = prog * 63;
      let eob = 0;
      for (let z = 63; z > 0; z--) if (q[J.ZZ[z]]) { eob = z; break; }
      ctx.fillStyle = css(C.paper); ctx.fillRect(0, 0, size, size);
      for (let i = 0; i < 64; i++) {
        const x = (i % 8) * cell, y = ((i / 8) | 0) * cell, z = J.UNZZ[i];
        if (q[i]) { ctx.fillStyle = divCss(q[i] * 8, 64); ctx.fillRect(x, y, cell, cell); }
        else if (z > eob) { ctx.fillStyle = css(C.ink, 0.045); ctx.fillRect(x, y, cell, cell); }
      }
      ctx.strokeStyle = css(C.ink, 0.15); ctx.lineWidth = 1;
      for (let k = 1; k < 8; k++) { ctx.beginPath(); ctx.moveTo(Math.round(k * cell) + 0.5, 0); ctx.lineTo(Math.round(k * cell) + 0.5, size); ctx.moveTo(0, Math.round(k * cell) + 0.5); ctx.lineTo(size, Math.round(k * cell) + 0.5); ctx.stroke(); }
      // путь зигзага
      const P = (z) => { const i = J.ZZ[z]; return [(i % 8 + 0.5) * cell, (((i / 8) | 0) + 0.5) * cell]; };
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let z = 0; z <= 63; z++) { const [x, y] = P(z); z ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.strokeStyle = css(C.ink, 0.16); ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath();
      const full = Math.floor(upto);
      for (let z = 0; z <= full; z++) { const [x, y] = P(z); z ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      let hx, hy;
      if (full < 63) { const [x0, y0] = P(full), [x1, y1] = P(full + 1), f = upto - full; hx = lerp(x0, x1, f); hy = lerp(y0, y1, f); ctx.lineTo(hx, hy); }
      else [hx, hy] = P(63);
      ctx.strokeStyle = css(C.ink); ctx.lineWidth = 2; ctx.stroke();
      // числа
      ctx.font = `500 ${Math.max(11, Math.round(cell * 0.3))}px "Geist Mono", monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let i = 0; i < 64; i++) {
        const v = q[i];
        if (!v) continue;
        const x = (i % 8 + 0.5) * cell, y = (((i / 8) | 0) + 0.5) * cell;
        ctx.fillStyle = css(C.paper); ctx.fillRect(x - cell * 0.3, y - cell * 0.2, cell * 0.6, cell * 0.4);
        ctx.fillStyle = css(C.ink); ctx.fillText(v > 0 ? String(v) : '−' + -v, x, y + 1);
      }
      // бегунок
      if (this.running) { ctx.fillStyle = css(C.yellow); ctx.strokeStyle = css(C.ink); ctx.lineWidth = 1.5; ctx.fillRect(hx - 6, hy - 6, 12, 12); ctx.strokeRect(hx - 6, hy - 6, 12, 12); }
      // EOB-граница
      if (eob < 63) { const [x, y] = P(eob); ctx.strokeStyle = css(C.red); ctx.lineWidth = 2; ctx.strokeRect(x - cell / 2 + 1, y - cell / 2 + 1, cell - 2, cell - 2); }
      this.strip(q, upto, eob);
    },
    strip(q, upto, eob) {
      const cv = $('#zzStrip'), w = cv.parentElement.clientWidth || 400, perRow = 16, cw = w / perRow, chh = 24, gap = 2, h = 4 * chh + 3 * gap;
      const ctx = fit(cv, w, h);
      ctx.font = '500 11px "Geist Mono", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let z = 0; z < 64; z++) {
        const x = (z % perRow) * cw, y = Math.floor(z / perRow) * (chh + gap), v = q[J.ZZ[z]];
        const seen = z <= upto;
        if (z > eob) ctx.fillStyle = css(C.red, seen ? 0.16 : 0.06);
        else if (v) ctx.fillStyle = seen ? divCss(v * 8, 64) : css(C.paper2);
        else ctx.fillStyle = css(C.paper2);
        ctx.fillRect(x + 1, y, cw - 2, chh);
        if (seen) { ctx.fillStyle = v ? css(C.ink) : css(C.ink, 0.35); ctx.fillText(v ? (v > 0 ? String(v) : '−' + -v) : '0', x + cw / 2, y + chh / 2 + 1); }
      }
    },
    tokens() {
      if (!S.enc) return;
      const { ci, b } = selBlock();
      const toks = blockTokens(ci, b);
      $('#tokens').innerHTML = toks.map((t) => {
        if (t.k === 'dc') return `<span class="tok dc">DC <b>${signed(t.dc)}</b> (разность ${signed(t.diff)})</span>`;
        if (t.k === 'eob') return '<span class="tok eob"><b>EOB</b> · конец блока</span>';
        if (t.k === 'zrl') return '<span class="tok zrl"><b>ZRL</b> · 16 нулей</span>';
        return `<span class="tok"><b>${t.run}/${t.size}</b> ${signed(t.v)}</span>`;
      }).join('');
    },
  });

  /* ---------- 06. Хаффман ---------- */
  chapter(6, {
    init() {
      $('#optSeg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setOpt(b.dataset.opt === '1'); });
    },
    onShow() { if (S.enc && S.enc.sizeOpt === null) invalidate('encode'); },
    update() {
      if (!S.enc) return;
      const { ci, b } = selBlock();
      const toks = blockTokens(ci, b);
      let total = 0;
      const rows = toks.map((t) => {
        total += t.len + t.vlen;
        const sym = t.k === 'dc' ? `<span class="k-dc">DC</span> кат.&nbsp;${t.cat}` : t.k === 'eob' ? '<span class="k-eob">EOB</span>' : t.k === 'zrl' ? 'ZRL' : `${t.run}/${t.size}`;
        const val = t.k === 'dc' ? signed(t.diff) : t.k === 'ac' ? signed(t.v) : '—';
        return `<tr><td>${sym}</td><td>${val}</td><td class="code">${bin(t.code, t.len)}</td><td class="code"><i>${bin(t.vbits, t.vlen) || '—'}</i></td></tr>`;
      });
      $('#hBlock tbody').innerHTML = rows.slice(0, 24).join('') + (rows.length > 24 ? `<tr><td colspan="4">… ещё ${rows.length - 24}</td></tr>` : '');
      let tf = $('#hBlock tfoot');
      if (!tf) { tf = document.createElement('tfoot'); $('#hBlock').appendChild(tf); }
      tf.innerHTML = `<tr><td colspan="2">итого</td><td colspan="2">${total} ${bitsW(total)} вместо 512</td></tr>`;

      // частые символы яркости по всей картинке
      const fr = S.enc.stats.freq.acY, codes = S.enc.T.acY;
      const list = [];
      for (let s = 0; s < 256; s++) if (fr[s]) list.push([fr[s], s]);
      list.sort((a, b2) => b2[0] - a[0]);
      const top = list.slice(0, 11), maxF = top.length ? top[0][0] : 1;
      $('#hFreq tbody').innerHTML = top.map(([f, s]) => {
        const r = s >> 4, sz = s & 15;
        const name = s === 0 ? '<span class="k-eob">EOB</span>' : s === 0xf0 ? 'ZRL' : `${r}/${sz}`;
        const mean = s === 0 ? 'конец блока' : s === 0xf0 ? '16 нулей' : `${r ? r + ' ' + plural(r, 'ноль', 'нуля', 'нулей') + ', ' : ''}${sz} ${bitsW(sz)}`;
        return `<tr><td>${name}</td><td>${mean}</td><td><span class="bar-cell"><i style="width:${Math.max(1, (f / maxF) * 70).toFixed(1)}px"></i>${fmtInt(f)}</span></td><td class="code">${bin(codes.code[s], codes.size[s])}</td></tr>`;
      }).join('');
      const e = S.enc;
      if (e.sizeOpt !== null) {
        const d = ((e.sizeStd - e.sizeOpt) / e.sizeStd) * 100;
        $('#hStat').innerHTML = `Типовые таблицы: <b>${fmtInt(e.sizeStd)} ${bytesW(e.sizeStd)}</b><br>Свои: <b>${fmtInt(e.sizeOpt)} ${bytesW(e.sizeOpt)}</b>, на&nbsp;${fmtNum(d, 1)}&nbsp;% меньше`;
      }
    },
  });

  /* ---------- 07. Файл ---------- */
  const SEG_COL = { soi: C.ink, eoi: C.ink, app: [150, 150, 158], com: [190, 186, 174], dqt: C.yellow, sof: C.blue, dht: [140, 151, 238], sos: C.ink2 };
  const SEG_NAME = { soi: 'SOI', app: 'APP0', com: 'COM', dqt: 'DQT', sof: 'SOF0', dht: 'DHT', sos: 'SOS', scan: 'скан', eoi: 'EOI' };
  chapter(7, {
    ver: -1, checkTimer: 0,
    init() {
      const cv = $('#mosaic'), tip = $('#mosaicTip');
      const at = (e) => {
        if (!this.geo || !S.enc) return -1;
        const r = cv.getBoundingClientRect(), g = this.geo;
        const cx = Math.floor(((e.clientX - r.left) * g.k) / g.cell), cy = Math.floor(((e.clientY - r.top) * g.k) / g.cell);
        if (cx < 0 || cx >= g.cols) return -1;
        const i = cy * g.cols + cx;
        return i >= 0 && i < S.enc.bytes.length ? i : -1;
      };
      cv.addEventListener('pointermove', (e) => {
        const i = at(e);
        if (i < 0) { tip.hidden = true; return; }
        const enc = S.enc, seg = enc.segs.find((s) => i >= s.start && i < s.end);
        let where = seg ? SEG_NAME[seg.kind] + ' · ' + seg.label.split('·')[1].trim() : '';
        const blk = seg && seg.kind === 'scan' ? this.blockAt(i) : null;
        if (blk) where = `скан · блок ${blk.name} ${blk.bx}:${blk.by}`;
        tip.innerHTML = `байт ${fmtInt(i)} · <b>${hex2(enc.bytes[i])}</b><br>${where}`;
        tip.hidden = false;
        const R = $('#mosaicW').getBoundingClientRect();
        const x = clamp(e.clientX - R.left + 12, 0, R.width - tip.offsetWidth), y = e.clientY - R.top - tip.offsetHeight - 10;
        tip.style.transform = `translate(${x}px, ${y}px)`;
      });
      cv.addEventListener('pointerleave', () => { tip.hidden = true; });
      cv.addEventListener('click', (e) => {
        const i = at(e); if (i < 0) return;
        const blk = this.blockAt(i); if (!blk) return;
        S.comp = blk.ci; syncSeg($('#compSeg'), 'comp', blk.ci);
        const P = S.P, fx = blk.ci ? P.S.h : 1, fy = blk.ci ? P.S.v : 1;
        S.sel = { x: Math.min(S.img.w - 1, blk.bx * 8 * fx + 4 * fx), y: Math.min(S.img.h - 1, blk.by * 8 * fy + 4 * fy) };
        S.pinned = true;
        invalidate('inspect'); markFigsSel(); updateGrid();
        toast(`Выбран блок ${blk.name} ${blk.bx}:${blk.by}${NB}— он закреплён на${NB}рис.${NB}1`);
      });
      $('#dlBtn').addEventListener('click', () => {
        if (!S.enc) return;
        const url = URL.createObjectURL(new Blob([S.enc.bytes], { type: 'image/jpeg' }));
        const a = document.createElement('a');
        a.href = url; a.download = fileName();
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      });
    },
    // по смещению байта находим блок, чей код начался не позже
    blockAt(i) {
      const e = S.enc;
      if (i < e.scanStart || i >= e.scanEnd) return null;
      let best = null;
      for (let ci = 0; ci < 3; ci++) {
        const at = e.blockAt[ci], c = S.P.comps[ci];
        for (let b = 0; b < at.length; b++) if (at[b] <= i && (!best || at[b] > best.at)) best = { at: at[b], ci, b, bx: b % c.bw, by: (b / c.bw) | 0, name: c.name };
      }
      return best;
    },
    update() {
      if (!S.enc || this.ver === S.version) return;
      this.ver = S.version;
      const e = S.enc, bytes = e.bytes, n = bytes.length;
      // мозаика
      const cv = $('#mosaic'), cssW = cv.clientWidth, cssH = cv.clientHeight, k = dpr();
      const Wd = Math.round(cssW * k), Hd = Math.round(cssH * k);
      let cell = Math.max(1, Math.floor(Math.sqrt((Wd * Hd) / n)));
      while (cell > 1 && Math.ceil(n / Math.floor(Wd / cell)) * cell > Hd) cell--;
      const cols = Math.floor(Wd / cell);
      this.geo = { cell, cols, k };
      cv.width = Wd; cv.height = Hd;
      const ctx = cv.getContext('2d'), im = ctx.createImageData(Wd, Hd), d = im.data;
      for (let i = 0; i < d.length; i += 4) { d[i] = C.paper2[0]; d[i + 1] = C.paper2[1]; d[i + 2] = C.paper2[2]; d[i + 3] = 255; }
      let si = 0;
      for (let i = 0; i < n; i++) {
        while (si < e.segs.length - 1 && i >= e.segs[si].end) si++;
        const seg = e.segs[si];
        let col;
        if (seg.kind === 'scan') {
          if (bytes[i] === 0 && i > 0 && bytes[i - 1] === 0xff) col = C.red;
          else { const v = bytes[i] / 255; col = [lerp(214, 70, v), lerp(211, 70, v), lerp(202, 76, v)]; }
        } else col = SEG_COL[seg.kind];
        const x0 = (i % cols) * cell, y0 = Math.floor(i / cols) * cell;
        if (y0 >= Hd) break;
        for (let yy = 0; yy < cell; yy++) for (let xx = 0; xx < cell; xx++) {
          const o = ((y0 + yy) * Wd + x0 + xx) * 4;
          d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2];
        }
      }
      ctx.putImageData(im, 0, 0);
      // легенда
      const sums = {};
      for (const s of e.segs) sums[s.kind] = (sums[s.kind] || 0) + (s.end - s.start);
      const order = ['soi', 'app', 'com', 'dqt', 'sof', 'dht', 'sos', 'scan', 'eoi'];
      $('#segLegend').innerHTML = order.map((kk) => {
        const col = kk === 'scan' ? 'linear-gradient(90deg,#d6d3ca,#46464c)' : css(SEG_COL[kk]);
        return `<li><i style="background:${col}"></i>${SEG_NAME[kk]} <b>${fmtInt(sums[kk] || 0)}</b></li>`;
      }).join('') + `<li><i style="background:${css(C.red)}"></i>вставленные 00 <b>${fmtInt(e.stuffed)}</b></li>`;
      // шестнадцатеричный дамп заголовка и начала скана
      const end = Math.min(n, e.scanStart + 128);
      let html = '';
      for (let row = 0; row < end; row += 16) {
        let hx = '', asc = '';
        for (let j = row; j < row + 16; j++) {
          if (j >= end) { hx += '   '; continue; }
          const seg = e.segs.find((s) => j >= s.start && j < s.end), b = bytes[j];
          const col = seg.kind === 'scan' ? '' : seg.kind === 'dqt' ? 'background:#ffdd3c' : seg.kind === 'sof' ? 'color:#2a3cdb' : seg.kind === 'dht' ? 'color:#4b58c4' : 'color:#5f5f67';
          // сам маркер — два первых байта сегмента — выделяем чернилами
          const mark = seg.kind !== 'scan' && j - seg.start < 2 ? ';background:#111114;color:#efeee8' : '';
          hx += `<i style="${col}${mark}">${hex2(b)}</i> `;
          asc += b >= 32 && b < 127 ? String.fromCharCode(b).replace('&', '&amp;').replace('<', '&lt;') : '·';
        }
        html += `<span class="o">${row.toString(16).toUpperCase().padStart(4, '0')}</span>  ${hx} <span class="a">${asc}</span>\n`;
      }
      html += `<span class="o">…</span>   ещё ${fmtInt(n - end)} ${bytesW(n - end)} сжатых данных, в${NB}конце FF${NB}D9`;
      $('#hex').innerHTML = html;
      // проверка браузерным декодером
      clearTimeout(this.checkTimer);
      $('#check').innerHTML = 'Проверяю файл декодером браузера…';
      this.checkTimer = setTimeout(() => this.check(S.version), 220);
    },
    async check(ver) {
      try {
        if (typeof createImageBitmap !== 'function') throw new Error('нет createImageBitmap');
        const bmp = await createImageBitmap(new Blob([S.enc.bytes], { type: 'image/jpeg' }));
        if (ver !== S.version) { bmp.close && bmp.close(); return; }
        const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(bmp, 0, 0);
        bmp.close && bmp.close();
        const their = ctx.getImageData(0, 0, c.width, c.height).data;
        const md = J.maxDiff(their, S.dec.rgba), p = J.psnr(their, S.dec.rgba);
        $('#check').innerHTML = `<span class="ok">Файл настоящий</span> браузер открыл его своим декодером. Расхождение с&nbsp;нашим&nbsp;— не&nbsp;больше <b>${md}</b> ${plural(md, 'уровня', 'уровней', 'уровней')} из&nbsp;255${isFinite(p) ? `, PSNR ${fmtNum(p, 1)}&nbsp;дБ` : ', совпадение полное'}.`;
      } catch (err) {
        $('#check').textContent = `Браузер не${NB}дал проверить файл своим декодером, но${NB}скачанный файл открывается как обычный JPEG.`;
      }
    },
  });

  /* ---------- 08. Артефакты ---------- */
  chapter(8, {
    key: '', ladderKey: '',
    crops() {
      const img = S.img;
      if (img.crops) return img.crops;
      if (this.auto && this.auto.v === S.imgVersion) return this.auto.c;
      // своя картинка: ищем окна по статистике блоков
      const P = getP('444'), cy = P.comps[0], cb = P.comps[1], cr = P.comps[2];
      const ac = (c, b) => { let e = 0; for (let i = 1; i < 64; i++) e += Math.abs(c.dct[b * 64 + i]); return e; };
      const best = { blocks: [-Infinity], ringing: [-Infinity], bleed: [-Infinity], texture: [-Infinity] };
      for (let by = 1; by < cy.bh - 3; by += 1) {
        for (let bx = 1; bx < cy.bw - 3; bx += 1) {
          let eY = 0, eC = 0, minE = Infinity, dcMin = Infinity, dcMax = -Infinity;
          for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
            const b = (by + y) * cy.bw + bx + x, e = ac(cy, b);
            eY += e; minE = Math.min(minE, e); eC += ac(cb, b) + ac(cr, b);
            dcMin = Math.min(dcMin, cy.dct[b * 64]); dcMax = Math.max(dcMax, cy.dct[b * 64]);
          }
          const cx = bx * 8 + 12, cyy = by * 8 + 12;
          const cand = { blocks: (dcMax - dcMin) / (1 + eY * 0.05) - eY * 0.02, ringing: eY - minE * 6, bleed: eC, texture: minE };
          for (const k in cand) if (cand[k] > best[k][0]) best[k] = [cand[k], cx, cyy];
        }
      }
      const c = {};
      for (const k in best) c[k] = best[k][0] === -Infinity ? [img.w >> 1, img.h >> 1] : [best[k][1], best[k][2]];
      this.auto = { v: S.imgVersion, c };
      return c;
    },
    update() {
      if (!S.enc) return;
      const cr = this.crops(), SZ = 40;
      $$('.art', this.el).forEach((art) => {
        const [cx, cy] = cr[art.dataset.a];
        const x0 = clamp(Math.round(cx - SZ / 2), 0, S.img.w - SZ), y0 = clamp(Math.round(cy - SZ / 2), 0, S.img.h - SZ);
        const cv = $('canvas', art), gap = 1, w = SZ * 2 + gap, h = SZ;
        if (cv.width !== w) { cv.width = w; cv.height = h; }
        const ctx = cv.getContext('2d'), im = ctx.createImageData(w, h);
        const copy = (src, ox) => {
          for (let y = 0; y < SZ; y++) for (let x = 0; x < SZ; x++) {
            const s = ((y0 + y) * S.img.w + x0 + x) * 4, o = (y * w + ox + x) * 4;
            im.data[o] = src[s]; im.data[o + 1] = src[s + 1]; im.data[o + 2] = src[s + 2]; im.data[o + 3] = 255;
          }
        };
        copy(S.img.data, 0); copy(S.dec.rgba, SZ + gap);
        for (let y = 0; y < SZ; y++) { const o = (y * w + SZ) * 4; im.data[o] = 239; im.data[o + 1] = 238; im.data[o + 2] = 232; im.data[o + 3] = 255; }
        ctx.putImageData(im, 0, 0);
        const avail = art.clientWidth, k = Math.max(1, Math.floor(avail / w));
        cv.style.width = w * k + 'px'; cv.style.height = h * k + 'px';
      });
      this.ladder();
    },
    ladder() {
      const key = S.imgVersion + ':' + S.sub;
      if (key === this.ladderKey) return;
      this.ladderKey = key;
      const [cx, cy] = this.crops().ringing, SZ = 48;
      const x0 = clamp(Math.round((cx - SZ / 2) / 16) * 16, 0, S.img.w - SZ), y0 = clamp(Math.round((cy - SZ / 2) / 16) * 16, 0, S.img.h - SZ);
      const data = new Uint8ClampedArray(SZ * SZ * 4);
      for (let y = 0; y < SZ; y++) data.set(S.img.data.subarray(((y0 + y) * S.img.w + x0) * 4, ((y0 + y) * S.img.w + x0 + SZ) * 4), y * SZ * 4);
      const crop = { w: SZ, h: SZ, data };
      const P = J.prepare(crop, S.sub);
      const host = $('#ladder');
      host.innerHTML = '';
      for (const q of [90, 50, 25, 10, 5, 1]) {
        const e = J.encode(P, { quality: q }), d = J.decode(e.bytes);
        const fig = document.createElement('figure'), cv = document.createElement('canvas');
        putRGBA(cv, d.rgba, SZ, SZ);
        const cap = document.createElement('figcaption');
        cap.innerHTML = `качество <b>${q}</b>`;
        fig.append(cv, cap);
        host.appendChild(fig);
      }
      requestAnimationFrame(() => {
        $$('#ladder canvas').forEach((cv) => { const k = Math.max(1, Math.floor(cv.parentElement.clientWidth / SZ)); cv.style.width = SZ * k + 'px'; cv.style.height = SZ * k + 'px'; });
      });
    },
  });

  /* ---------- Видимость глав ---------- */
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      const ch = CH[en.target.dataset.ch];
      if (!ch) continue;
      const was = ch.visible;
      ch.visible = en.isIntersecting;
      if (ch.visible && !was) { if (ch.onShow) ch.onShow(); kick(); }
    }
  }, { rootMargin: '240px 0px' });

  /* ---------- Выбор картинки: встроенные, файл, перетаскивание, вставка ---------- */

  const toastEl = $('#toast');
  let toastTimer = 0;
  function toast(msg) {
    toastEl.textContent = msg; toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 3800);
  }
  const cache = {};
  function pickBuiltin(id) {
    const it = IM.list.find((x) => x.id === id);
    if (!it) return;
    if (!cache[id]) cache[id] = it.make();
    syncSeg($('#imgSeg'), 'img', id);
    setImage(cache[id], id);
  }
  async function loadFile(file) {
    if (!file || !/^image\//.test(file.type || 'image/')) { toast(`Это не${NB}похоже на${NB}картинку. Подойдут JPEG, PNG, WebP, GIF.`); return; }
    try {
      const bmp = await createImageBitmap(file);
      const bw = bmp.width, bh = bmp.height;
      const img = IM.fromBitmap(bmp, IM.W, IM.H);
      if (bmp.close) bmp.close();
      let own = `${bw}${NB}×${NB}${bh}`;
      if (/jpe?g/i.test(file.type) || /\.jpe?g$/i.test(file.name || '')) {
        const head = new Uint8Array(await file.slice(0, 262144).arrayBuffer());
        const info = J.inspect(head);
        if (info && info.sof) {
          const q = J.estimateQuality(info.qts[0]);
          const c0 = info.sof.comps[0], sub = info.sof.comps.length === 1 ? 'оттенки серого' : c0.h === 2 && c0.v === 2 ? '4:2:0' : c0.h === 2 ? '4:2:2' : c0.h === 1 && c0.v === 1 ? '4:4:4' : `${c0.h}×${c0.v}`;
          own += `, ${sub}${info.progressive ? ', прогрессивный' : ''}${q ? `, качество ≈${NB}${q.quality}${q.exact ? ' (таблица IJG)' : ` по${NB}шкале IJG`}` : ''}`;
        }
      }
      syncSeg($('#imgSeg'), 'img', 'own');
      setImage(img, 'own', own);
      toast(`Картинка уменьшена до${NB}${img.w}${NB}×${NB}${img.h} и${NB}разобрана. Файл никуда не${NB}отправлялся.`);
    } catch (err) {
      toast(`Не${NB}получилось открыть файл: браузер не${NB}смог его декодировать.`);
    }
  }
  $('#imgSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.img === 'own') $('#fileInput').click();
    else pickBuiltin(b.dataset.img);
  });
  $('#fileInput').addEventListener('change', (e) => { const f = e.target.files && e.target.files[0]; if (f) loadFile(f); e.target.value = ''; });
  const veil = $('#veil');
  let dragDepth = 0;
  window.addEventListener('dragenter', (e) => { if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) { dragDepth++; veil.hidden = false; } });
  window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) veil.hidden = true; });
  window.addEventListener('dragover', (e) => { e.preventDefault(); });
  window.addEventListener('drop', (e) => {
    e.preventDefault(); dragDepth = 0; veil.hidden = true;
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) loadFile(f);
  });
  window.addEventListener('paste', (e) => {
    const it = Array.from((e.clipboardData && e.clipboardData.items) || []).find((x) => x.type.startsWith('image/'));
    if (it) loadFile(it.getAsFile());
  });

  /* ---------- Переключатели обложки ---------- */

  $('#viewSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    S.view = b.dataset.view; syncSeg($('#viewSeg'), 'view', S.view);
    invalidate('stage');
  });
  const subClick = (e) => { const b = e.target.closest('button'); if (b) setSub(b.dataset.sub); };
  $('#subSeg').addEventListener('click', subClick);
  $('#dockSub').addEventListener('click', subClick);
  $('#compSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    S.comp = +b.dataset.comp; syncSeg($('#compSeg'), 'comp', S.comp);
    updateGrid();
    invalidate('inspect'); markFigsSel();
  });
  $('#gridBtn').addEventListener('click', () => {
    S.grid = !S.grid; $('#gridBtn').setAttribute('aria-pressed', String(S.grid)); updateGrid();
  });

  /* ---------- Плавающий пульт ---------- */

  const dock = $('#dock');
  new IntersectionObserver(([en]) => {
    const on = !en.isIntersecting && en.boundingClientRect.top < 0;
    dock.classList.toggle('on', on);
    dock.setAttribute('aria-hidden', String(!on));
    $$('button, input', dock).forEach((x) => { x.tabIndex = on ? 0 : -1; });
    if (on) dockRuler.resize();
  }).observe($('.console'));

  /* ---------- Вступление: картинка проявляется, качество падает ---------- */

  function startIntro() {
    const target = S.quality;
    if (REDUCED) { S.reveal = 1; scheduleTour(2000); return; }
    S.intro = { t0: performance.now(), from: 92, to: target };
    S.quality = 92; mainRuler.set(92); dockRuler.set(92);
    S.reveal = 0;
    invalidate('encode');
    const revealDur = 650, hold = 250, sweep = 1250;
    anims.add((t) => {
      const I = S.intro;
      if (!I) return false;
      const dt = t - I.t0;
      S.reveal = clamp(dt / revealDur, 0, 1);
      dirty.stage = true;
      const p = clamp((dt - revealDur - hold) / sweep, 0, 1);
      const q = Math.round(lerp(I.from, I.to, easeInOut(p)));
      if (q !== S.quality) { S.quality = q; mainRuler.set(q); dockRuler.set(q); dirty.encode = true; }
      if (p >= 1) { S.intro = null; S.reveal = 1; scheduleTour(1500); return false; }
      return true;
    });
    kick();
  }
  function stopIntro() {
    if (!S.intro) return;
    S.intro = null; S.reveal = 1;
    invalidate('stage');
    scheduleTour(3000);
  }

  /* ---------- Запуск ---------- */

  const qRulers = [], allRulers = [];
  const qOpts = (label) => ({
    label, min: 1, max: 100, value: S.quality, aria: 'Качество JPEG',
    major: (v) => v === 1 || v % 10 === 0,
    hint: (v) => `шаги таблиц ×${fmtNum(J.qualityScale(v) / 100, 2)}`,
    valueText: (v) => `качество ${v}`,
    onInput: (v, r) => setQuality(v, r),
  });
  const mainRuler = new Ruler($('#ruler'), qOpts('Качество'));
  const dockRuler = new Ruler($('#dockRuler'), qOpts('Качество'));
  qRulers.push(mainRuler, dockRuler);
  allRulers.push(mainRuler, dockRuler);

  for (const ch of Object.values(CH)) { if (ch.init) ch.init(); io.observe(ch.el); }

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      layoutStage();
      allRulers.forEach((r) => r.resize());
      for (const ch of Object.values(CH)) { ch.dirty = true; if (ch.n === 7) ch.ver = -1; if (ch.n === 8) ch.ladderKey = ''; }
      invalidate('inspect');
    }, 120);
  });

  pickBuiltin('lighthouse');
  startIntro();
  // шрифты могли догрузиться позже: перерисуем то, что рисует текст на холсте
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      allRulers.forEach((r) => r.resize());
      layoutStage();
      for (const id of ['chart', 'page']) delete cache[id];
      invalidate('inspect');
    });
  }
})();
