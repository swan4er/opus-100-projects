/* «На орбиту» — отрисовка трансляции и интерфейс. Физика — в sim.js (window.GT). */
(function () {
  'use strict';
  const GT = window.GT;
  const { RE, DEG, clamp } = GT;
  const $ = (id) => document.getElementById(id);
  const reduceMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  // ---------- Утилиты ----------
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
  const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a === undefined ? 1 : Math.max(0, Math.min(1, a)).toFixed(3)})`;
  function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
  const NB = ' ';
  const fmtInt = (n) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, NB);
  const fmt1 = (n) => (Math.round(n * 10) / 10).toFixed(1).replace('.', ',').replace('-', '−');
  const fmt2 = (n) => (Math.round(n * 100) / 100).toFixed(2).replace('.', ',');
  const pad2 = (n) => String(Math.floor(n)).padStart(2, '0');
  const clockStr = (t) => { const a = t < 0 ? Math.ceil(-t) : Math.floor(t); return `${pad2(a / 3600)}:${pad2((a % 3600) / 60)}:${pad2(a % 60)}`; };
  const shortT = (t) => { const a = t < 0 ? Math.ceil(-t) : Math.floor(t); return (t < 0 ? 'T−' : 'T+') + `${pad2(a / 60)}:${pad2(a % 60)}`; };

  // ---------- Настройки ----------
  const SKY_DEP = { dusk: 6, night: 24, day: -35 };
  const MISSION = { dusk: 'Миссия «Сумерки»', night: 'Миссия «Полночь»', day: 'Миссия «Полдень»' };
  const defaults = { mode: 'auto', site: 'vostochny', sky: 'dusk', payload: 15, target: 220, kick: 6, q: 32 };
  const settings = Object.assign({}, defaults);
  try { Object.assign(settings, JSON.parse(localStorage.getItem('gravity-turn') || '{}')); } catch (e) { /* нет хранилища */ }
  const saveSettings = () => { try { localStorage.setItem('gravity-turn', JSON.stringify(settings)); } catch (e) { /* ничего */ } };
  const optsFrom = (s) => ({ mode: s.mode, site: s.site, sunDep: SKY_DEP[s.sky], payload: s.payload * 1000, targetAlt: s.target * 1000, kickDeg: s.kick, qLimit: s.q * 1000 });

  // ---------- Холсты ----------
  const view = $('view'), ctx = view.getContext('2d');
  const stageEl = $('stage');
  let W = 0, H = 0, DPR = 1;
  const glowCv = document.createElement('canvas'), gctx = glowCv.getContext('2d');
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    const r = stageEl.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    view.width = Math.round(W * DPR); view.height = Math.round(H * DPR);
    glowCv.width = Math.round(W * DPR); glowCv.height = Math.round(H * DPR);
    for (const c of document.querySelectorAll('.side canvas, #timeline')) {
      const b = c.getBoundingClientRect();
      c.width = Math.max(1, Math.round(b.width * DPR)); c.height = Math.max(1, Math.round(b.height * DPR));
    }
    dirty.charts = dirty.orbit = true;
  }

  // Мягкие спрайты для дыма и свечения
  function sprite(color, size) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d'); const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gr.addColorStop(0, rgba(color, 1)); gr.addColorStop(0.45, rgba(color, 0.55)); gr.addColorStop(1, rgba(color, 0));
    g.fillStyle = gr; g.fillRect(0, 0, size, size); return c;
  }
  const SPR_SMOKE = sprite([235, 232, 236], 64);
  const SPR_FIRE = sprite([255, 150, 70], 64);
  const SPR_WHITE = sprite([255, 255, 255], 64);

  // ---------- Небо: цвета по глубине Солнца под горизонтом ----------
  const SKY_KEYS = [ // dep, зенит, середина, горизонт, свечение, сила свечения
    [-35, [42, 94, 166], [104, 154, 208], [196, 219, 236], [255, 250, 232], 0.22],
    [-2, [36, 56, 112], [128, 116, 158], [250, 172, 112], [255, 196, 130], 0.7],
    [6, [11, 17, 42], [40, 44, 88], [186, 98, 96], [248, 140, 84], 0.62],
    [12, [6, 9, 22], [15, 19, 40], [58, 42, 60], [170, 84, 64], 0.26],
    [18, [4, 6, 13], [7, 9, 20], [18, 22, 38], [0, 0, 0], 0],
  ];
  function skyAt(dep) {
    let i = 0;
    while (i < SKY_KEYS.length - 2 && dep > SKY_KEYS[i + 1][0]) i++;
    const a = SKY_KEYS[i], b = SKY_KEYS[i + 1];
    const t = clamp((dep - a[0]) / (b[0] - a[0]), 0, 1);
    return { zen: mix(a[1], b[1], t), mid: mix(a[2], b[2], t), hor: mix(a[3], b[3], t), glow: mix(a[4], b[4], t), glowA: lerp(a[5], b[5], t) };
  }

  const STARS = (() => { const r = rng(42); const a = []; for (let i = 0; i < 520; i++) a.push({ x: r(), y: r(), b: Math.pow(r(), 2.2), tw: r() * 6.28, c: r() }); return a; })();
  const LIGHTS = (() => {
    const r = rng(1234); const a = [];
    for (let i = 0; i < 90; i++) {
      const ca = (r() * 3400 - 400) * 1000, cD = Math.exp(lerp(Math.log(3500), Math.log(900000), r()));
      const n = 2 + Math.floor(r() * r() * 14), spread = 0.004 + r() * 0.01;
      for (let j = 0; j < n; j++) a.push({ a: ca + (r() - 0.5) * cD * spread * 3, D: cD * (1 + (r() - 0.5) * spread), b: 0.35 + r() * 0.65 });
    }
    return a;
  })();

  // ---------- Состояние ----------
  let flight = null, nominal = null, nominalOpts = null;
  let warp = 1, paused = false, camMode = 'auto';
  let simAcc = 0, lastNow = performance.now(), animT = 0;
  let evIdx = 0, logEls = [];
  let trail = [], smoke = [];
  const debrisVis = new Map();
  const CAM = { s: 0, cx: 0, cy: 0, fx: 0, fy: 0, shx: 0, shy: 0, cOff: 36, anchorX: 0.46, anchorY: 0.46 };
  const V = { d: 0, hb: 0, pitch: 90 };
  const dirty = { charts: true, orbit: true };
  let resultShown = false, lastUi = 0, lastChart = 0;
  const PAD = 8; // высота стола пускового устройства, м

  function newFlight(fromSettings) {
    const o = optsFrom(settings);
    flight = new GT.Flight(o);
    if (fromSettings) { flight.t = -4.5; flight.countIdx = GT.COUNTDOWN.findIndex((c) => c[0] > -4.5); }
    evIdx = 0; trail = []; smoke = []; debrisVis.clear(); resultShown = false;
    $('log').innerHTML = ''; logEls = [];
    $('result').hidden = true; $('result').className = 'result';
    $('manual').hidden = settings.mode !== 'manual';
    $('missionName').textContent = MISSION[settings.sky];
    $('missionSub').textContent = `РН «${GT.ROCKET.name}» · космодром ${GT.SITES[settings.site].name}`;
    CAM.s = 0;
    const key = JSON.stringify(o);
    if (!nominal || nominalOpts !== key) {
      nominal = null; nominalOpts = key;
      setTimeout(() => { nominal = GT.simulate(Object.assign({}, o, { mode: 'auto' })); nominal.key = key; dirty.charts = true; }, 30);
    }
    dirty.charts = dirty.orbit = true;
    showCaption('', '');
  }

  // ---------- Геометрия: земная система у площадки ----------
  // d — дальность вдоль поверхности (м), hh — высота (м). Возвращает метры относительно основания аппарата.
  function toLocal(d, hh) {
    const phi = (d - V.d) / RE;
    const R1 = RE + hh, R0 = RE + V.hb;
    return [R1 * Math.sin(phi), R1 * Math.cos(phi) - R0];
  }
  function toScreen(d, hh) {
    const p = toLocal(d, hh);
    return [CAM.cx + (p[0] - CAM.fx) * CAM.s + CAM.shx, CAM.cy - (p[1] - CAM.fy) * CAM.s + CAM.shy];
  }
  function inertialToGround(x, y) {
    const siteAng = Math.PI / 2 - flight.wEff * Math.max(0, flight.t);
    return [RE * (siteAng - Math.atan2(y, x)), Math.hypot(x, y) - RE];
  }
  const sunlitAt = (d, hh) => {
    const dep = flight.o.sunDep + d / RE / DEG;
    const dip = Math.acos(RE / (RE + Math.max(0, hh))) / DEG;
    return smooth(-0.3, 1.4, dip - dep);
  };

  // ---------- Камера-режиссёр ----------
  function autoCam() {
    const f = flight, t = f.t;
    if (t < 17) return 'close';
    if (f.hasS1 && f.prop1 < GT.ROCKET.s1.prop * 0.012) return 'close';
    if (f.mecoT !== null && t < f.mecoT + 15) return 'close';
    if (f.hasFairing && f.stage === 2 && f.alt() > 106000) return 'close';
    const fe = f.events.find((e) => e.key === 'fairing');
    if (fe && t < fe.t + 9) return 'close';
    if (f.secoT !== null && t > f.secoT + 19) return 'close';
    if (f.phase === 'failed') return 'close';
    return 'wide';
  }
  function updateCamera(dt, h) {
    const sClose = 0.56 * H / 72;
    const mode = camMode === 'auto' ? autoCam() : camMode;
    const target = mode === 'close' ? sClose : sClose * 0.85 / (1 + Math.max(0, h) / 130);
    if (!CAM.s) CAM.s = target;
    const k = 1 - Math.exp(-dt * 1.6);
    CAM.s = Math.exp(lerp(Math.log(CAM.s), Math.log(target), k));
    const closeness = clamp(Math.log(CAM.s / (sClose * 0.02)) / Math.log(50), 0, 1);
    CAM.closeness = closeness;
    const cOffT = flight.hasS1 ? 36 : (flight.hasFairing || flight.hasPayload ? 15 : 8);
    CAM.cOff = lerp(CAM.cOff, cOffT * closeness, 1 - Math.exp(-dt * 2.2));
    const narrow = W < 600;
    CAM.anchorX = lerp(CAM.anchorX, lerp(narrow ? 0.62 : 0.6, narrow ? 0.5 : 0.46, closeness), k);
    CAM.anchorY = lerp(narrow ? 0.44 : 0.42, narrow ? 0.5 : 0.47, closeness);
    CAM.cx = W * CAM.anchorX; CAM.cy = H * CAM.anchorY;
    const ax = Math.cos(V.pitch * DEG), ay = Math.sin(V.pitch * DEG);
    CAM.fx = ax * CAM.cOff; CAM.fy = ay * CAM.cOff;
    // Дрожание камеры у земли при работающих двигателях
    const shake = reduceMotion ? 0 : (flight.engineOn ? flight.throttle : 0) * 5 * Math.exp(-h / 350) * closeness;
    CAM.shx = (Math.random() - 0.5) * shake; CAM.shy = (Math.random() - 0.5) * shake;
    return closeness;
  }

  // ---------- Отрисовка: небо, звёзды, Земля ----------
  function drawSky(st) {
    const k = st.sky;
    const zen = mix(k.zen, [1, 1, 4], st.space);
    const mid = mix(k.mid, [3, 4, 10], st.space * 0.97);
    const hor = mix(k.hor, mix(k.hor, [12, 14, 32], 0.7), st.space);
    const g = ctx.createLinearGradient(0, 0, 0, st.yh);
    g.addColorStop(0, rgba(zen)); g.addColorStop(0.6, rgba(mid)); g.addColorStop(1, rgba(hor));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, Math.ceil(st.yh) + 2);
    const ga = k.glowA * (1 - 0.6 * st.space);
    if (ga > 0.01) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.translate(W * 0.04, st.yh); ctx.scale(1.9, 1);
      const R = Math.max(W, H) * 0.62;
      const gg = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
      gg.addColorStop(0, rgba(k.glow, ga)); gg.addColorStop(0.3, rgba(k.glow, ga * 0.38)); gg.addColorStop(1, rgba(k.glow, 0));
      ctx.fillStyle = gg; ctx.fillRect(-W, -H * 2, W * 2, H * 2);
      ctx.restore();
    }
  }

  function drawStars(st) {
    const vis = Math.max(smooth(4, 15, st.dep), st.space * 1.0);
    if (vis < 0.02) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const s of STARS) {
      const y = s.y * st.yh * 1.02;
      if (y > st.yh - 2) continue;
      const thr = 1 - vis;
      if (s.b < thr * 0.92) continue;
      const tw = reduceMotion ? 1 : 0.75 + 0.25 * Math.sin(animT * 2.2 + s.tw);
      const a = clamp((s.b - thr * 0.92) * 2.2, 0, 1) * tw * (1 - 0.7 * smooth(0.8, 1, y / st.yh));
      const col = s.c < 0.15 ? [255, 214, 180] : s.c > 0.85 ? [190, 210, 255] : [240, 240, 255];
      ctx.fillStyle = rgba(col, a);
      const sz = s.b > 0.8 ? 1.8 : s.b > 0.5 ? 1.3 : 0.9;
      ctx.fillRect(s.x * W, y, sz, sz);
    }
    ctx.restore();
  }

  function earthPath(st) {
    ctx.beginPath();
    if (st.Rs) ctx.arc(W / 2, st.yh + st.Rs, st.Rs, 0, Math.PI * 2);
    else ctx.rect(-10, st.yh, W + 20, H - st.yh + 10);
  }

  function drawEarth(st) {
    const k = st.sky;
    const haze = mix(k.hor, [26, 30, 46], 0.35 + 0.4 * st.space);
    const midG = mix(k.mid, [14, 16, 26], 0.55 + 0.3 * st.space);
    const deep = st.dep < 0 ? mix([46, 66, 72], [8, 10, 16], st.space * 0.8) : [8, 10, 17];
    earthPath(st);
    if (st.Rs) {
      const g = ctx.createRadialGradient(W / 2, st.yh + st.Rs, st.Rs * 0.92, W / 2, st.yh + st.Rs, st.Rs);
      g.addColorStop(0, rgba(deep)); g.addColorStop(0.88, rgba(midG)); g.addColorStop(1, rgba(haze));
      ctx.fillStyle = g;
    } else {
      const g = ctx.createLinearGradient(0, st.yh, 0, H);
      g.addColorStop(0, rgba(haze)); g.addColorStop(0.05, rgba(midG)); g.addColorStop(0.5, rgba(deep)); g.addColorStop(1, rgba(mix(deep, [0, 0, 0], 0.4)));
      ctx.fillStyle = g;
    }
    ctx.fill();

    // Дальние холмы и лес на горизонте у Земли
    const landK = 1 - smooth(1500, 9000, V.hb);
    if (landK > 0.01 && !st.Rs) {
      const col = mix(mix(k.mid, [16, 16, 24], 0.55), haze, 0.18);
      ctx.save(); ctx.globalAlpha = landK;
      ctx.fillStyle = rgba(col);
      ctx.beginPath(); ctx.moveTo(0, st.yh + 1);
      const amp = H * 0.022, shift = V.d * 0.004;
      for (let x = 0; x <= W + 8; x += 8) {
        const u = (x + shift) / W;
        const hill = Math.sin(u * 5.1 + 1.3) * 0.55 + Math.sin(u * 13.7) * 0.25 + Math.sin(u * 31) * 0.12;
        const tree = (Math.sin(x * 1.7) * 0.5 + 0.5) * Math.max(0, Math.sin(u * 3.3 + 0.4)) * 0.35;
        ctx.lineTo(x, st.yh - amp * (0.55 + 0.45 * hill + tree));
      }
      ctx.lineTo(W + 8, st.yh + 1); ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    // Огни городов в сумерках и ночью
    const lightsOn = smooth(3, 10, st.dep);
    if (lightsOn > 0.01) {
      ctx.save(); earthPath(st); ctx.clip(); ctx.globalCompositeOperation = 'lighter';
      const f = H * 1.05, hEff = Math.max(30, V.hb);
      for (const L of LIGHTS) {
        const y = st.yh + f * (hEff / L.D);
        if (y > H || y < st.yh + 0.5) continue;
        const x = W / 2 + f * (L.a - V.d) / L.D;
        if (x < -2 || x > W + 2) continue;
        const near = clamp((y - st.yh) / 14, 0.15, 1);
        ctx.fillStyle = rgba([255, 196, 122], L.b * lightsOn * near * 0.9);
        const sz = L.b > 0.85 ? 1.7 : 1.1;
        ctx.fillRect(x, y, sz, sz);
      }
      ctx.restore();
    }

    // Свечение атмосферы на лимбе
    const limbK = smooth(9000, 40000, V.hb);
    if (limbK > 0.01) {
      gctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      gctx.clearRect(0, 0, W, H);
      gctx.globalCompositeOperation = 'source-over';
      const band = lerp(46, 18, st.space);
      if (st.Rs) {
        const cx = W / 2, cy = st.yh + st.Rs;
        const rg = gctx.createRadialGradient(cx, cy, st.Rs - 3, cx, cy, st.Rs + band);
        rg.addColorStop(0, 'rgba(255,255,255,0)'); rg.addColorStop(0.05, 'rgba(255,255,255,0.72)');
        rg.addColorStop(0.22, 'rgba(255,255,255,0.32)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
        gctx.fillStyle = rg; gctx.beginPath(); gctx.arc(cx, cy, st.Rs + band, 0, Math.PI * 2); gctx.fill();
      } else {
        const lg = gctx.createLinearGradient(0, st.yh + 2, 0, st.yh - band);
        lg.addColorStop(0, 'rgba(255,255,255,0.9)'); lg.addColorStop(0.25, 'rgba(255,255,255,0.4)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
        gctx.fillStyle = lg; gctx.fillRect(0, st.yh - band, W, band + 2);
      }
      gctx.globalCompositeOperation = 'source-in';
      const hg = gctx.createLinearGradient(0, 0, W, 0);
      const warm = st.dep < -5 ? [150, 200, 255] : [255, 150, 92];
      hg.addColorStop(0, rgba(warm, 1)); hg.addColorStop(0.35, rgba(mix(warm, [120, 150, 255], 0.55), 0.85)); hg.addColorStop(1, rgba([80, 130, 255], 0.75));
      gctx.fillStyle = hg; gctx.fillRect(0, 0, W, H);
      ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = limbK * (st.dep > 16 ? 0.45 : 1);
      ctx.drawImage(glowCv, 0, 0, W, H);
      ctx.restore();
    }
  }

  function drawSun(st) {
    if (V.hb < 12000 && st.dep > -3) return;
    const vis = st.sunlitV * smooth(12000, 30000, V.hb);
    if (vis < 0.01 || st.dep < -20) return;
    const pxDeg = H * 1.05 * DEG;
    const x = W * 0.07, y = st.yh - clamp(st.dip - st.dep, -1, 8) * pxDeg * 1.3 - 6;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const R = Math.max(W, H) * 0.45;
    const g = ctx.createRadialGradient(x, y, 0, x, y, R);
    g.addColorStop(0, rgba([255, 244, 222], 0.75 * vis)); g.addColorStop(0.04, rgba([255, 200, 150], 0.3 * vis));
    g.addColorStop(0.2, rgba([255, 150, 100], 0.12 * vis)); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(x - R, y - R, R * 2, R * 2);
    ctx.fillStyle = rgba([255, 250, 240], vis);
    ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
    const sg = ctx.createLinearGradient(x - W * 0.3, 0, x + W * 0.5, 0);
    sg.addColorStop(0, 'rgba(255,220,190,0)'); sg.addColorStop(0.4, rgba([255, 220, 190], 0.1 * vis)); sg.addColorStop(1, 'rgba(255,220,190,0)');
    ctx.fillStyle = sg; ctx.fillRect(x - W * 0.2, y - 0.5, W * 0.5, 1);
    ctx.restore();
  }

  // ---------- Стартовый комплекс ----------
  function drawPad(st) {
    const base = toScreen(0, 0);
    if (base[1] > H + 400 || CAM.s < 0.25) return;
    const s = CAM.s;
    const floodOn = st.dep > -2 ? 1 : 0.25;
    const amb = mix(st.sky.mid, [20, 22, 30], 0.5);
    const P = (d, hh) => toScreen(d, hh);
    ctx.save();
    // Передний план: земля у площадки
    const gy = base[1];
    const gg = ctx.createLinearGradient(0, gy, 0, H);
    gg.addColorStop(0, rgba(mix(amb, [10, 11, 16], 0.55))); gg.addColorStop(1, rgba([6, 7, 10]));
    ctx.fillStyle = gg; ctx.fillRect(0, gy, W, H - gy + 2);
    if (floodOn > 0.2) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(base[0], gy + 4); ctx.scale(1, 0.16);
      const pr = 130 * s;
      const pg = ctx.createRadialGradient(0, 0, 0, 0, 0, pr);
      pg.addColorStop(0, `rgba(255,214,170,${0.16 * floodOn})`); pg.addColorStop(1, 'rgba(255,214,170,0)');
      ctx.fillStyle = pg; ctx.fillRect(-pr, -pr, pr * 2, pr * 2); ctx.restore();
    }

    // Лучи прожекторов
    if (floodOn > 0.2) {
      ctx.globalCompositeOperation = 'lighter';
      for (const m of [[-78, 42], [70, 40]]) {
        const top = P(m[0], m[1]);
        const tgt1 = P(-4, 70), tgt2 = P(4, 6);
        const lg = ctx.createLinearGradient(top[0], top[1], (tgt1[0] + tgt2[0]) / 2, (tgt1[1] + tgt2[1]) / 2);
        lg.addColorStop(0, `rgba(255,236,200,${0.22 * floodOn})`); lg.addColorStop(1, 'rgba(255,236,200,0)');
        ctx.fillStyle = lg;
        ctx.beginPath(); ctx.moveTo(top[0], top[1]); ctx.lineTo(tgt1[0], tgt1[1]); ctx.lineTo(tgt2[0], tgt2[1]); ctx.closePath(); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    const dark = rgba([10, 11, 15]);
    const rim = rgba([255, 214, 160], 0.55 * floodOn);
    // Молниеотводы и тросы
    ctx.strokeStyle = rgba([24, 26, 34]); ctx.lineWidth = Math.max(1, 0.9 * s);
    const mastA = P(-104, 0), mastAt = P(-104, 132), mastB = P(96, 0), mastBt = P(96, 128);
    ctx.beginPath(); ctx.moveTo(mastA[0], mastA[1]); ctx.lineTo(mastAt[0], mastAt[1]); ctx.moveTo(mastB[0], mastB[1]); ctx.lineTo(mastBt[0], mastBt[1]); ctx.stroke();
    ctx.lineWidth = Math.max(0.6, 0.15 * s); ctx.strokeStyle = rgba([60, 64, 80], 0.6);
    const sag = P(-4, 112);
    ctx.beginPath(); ctx.moveTo(mastAt[0], mastAt[1]); ctx.quadraticCurveTo(sag[0], sag[1], mastBt[0], mastBt[1]); ctx.stroke();

    // Опоры прожекторов
    for (const m of [[-78, 42], [70, 40]]) {
      const b0 = P(m[0], 0), t0 = P(m[0], m[1]);
      ctx.strokeStyle = dark; ctx.lineWidth = Math.max(1.2, 0.8 * s);
      ctx.beginPath(); ctx.moveTo(b0[0], b0[1]); ctx.lineTo(t0[0], t0[1]); ctx.stroke();
      const hw = 3.5 * s;
      ctx.fillStyle = rgba([255, 244, 220], floodOn);
      ctx.fillRect(t0[0] - hw, t0[1] - 1.2 * s, hw * 2, 1.4 * s);
      if (floodOn > 0.2) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.55; ctx.drawImage(SPR_WHITE, t0[0] - hw * 2.2, t0[1] - hw * 2.2, hw * 4.4, hw * 4.4); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
    }

    // Башня обслуживания — решётчатая ферма
    const tx0 = -17, tx1 = -7, th = 86;
    const a0 = P(tx0, 0), a1 = P(tx1, 0), b0 = P(tx0, th), b1 = P(tx1, th);
    ctx.fillStyle = rgba([13, 14, 20], 0.94);
    ctx.beginPath(); ctx.moveTo(a0[0], a0[1]); ctx.lineTo(a1[0], a1[1]); ctx.lineTo(b1[0], b1[1]); ctx.lineTo(b0[0], b0[1]); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = rgba([70, 66, 70], 0.9); ctx.lineWidth = Math.max(0.7, 0.28 * s);
    ctx.beginPath();
    for (let y = 0; y < th; y += 6) {
      const p0 = P(tx0, y), p1 = P(tx1, y + 6), p2 = P(tx1, y), p3 = P(tx0, y + 6);
      ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.moveTo(p2[0], p2[1]); ctx.lineTo(p3[0], p3[1]);
      const q0 = P(tx0, y), q1 = P(tx1, y); ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q1[0], q1[1]);
    }
    ctx.stroke();
    ctx.strokeStyle = rim; ctx.lineWidth = Math.max(0.8, 0.35 * s);
    ctx.beginPath(); ctx.moveTo(a1[0], a1[1]); ctx.lineTo(b1[0], b1[1]); ctx.stroke();
    // Кабель-мачты: отводятся перед подъёмом
    const retract = smooth(-6, -1, flight.t);
    for (const [y, len] of [[44, 6.2], [64, 6.2]]) {
      const ang = -retract * 1.1;
      const p0 = P(tx1, y);
      const endD = tx1 + Math.cos(ang) * len, endH = y + Math.sin(-ang) * len;
      const p1 = P(endD, endH);
      ctx.strokeStyle = rgba([34, 36, 46]); ctx.lineWidth = Math.max(1.5, 1.4 * s);
      ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke();
    }
    // Заградительные огни мигают
    const blink = (Math.sin(animT * 3.1) > 0.2) ? 1 : 0.15;
    ctx.globalCompositeOperation = 'lighter';
    for (const p of [P(-12, th + 1), P(-104, 132), P(96, 128)]) {
      ctx.drawImage(SPR_FIRE, p[0] - 7, p[1] - 7, 14, 14);
      ctx.fillStyle = `rgba(255,70,50,${blink})`; ctx.beginPath(); ctx.arc(p[0], p[1], 1.6, 0, 6.29); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    // Стартовый стол с газоотводом
    const d0 = P(-34, PAD), d1 = P(34, PAD), g0 = P(-34, 0), g1 = P(34, 0);
    const deckG = ctx.createLinearGradient(0, d0[1], 0, g0[1]);
    deckG.addColorStop(0, rgba(mix([118, 110, 104], amb, 0.25))); deckG.addColorStop(0.18, rgba([54, 52, 56])); deckG.addColorStop(1, rgba([20, 20, 25]));
    ctx.fillStyle = deckG;
    ctx.beginPath(); ctx.moveTo(d0[0] + 3 * s, d0[1]); ctx.lineTo(d1[0] - 3 * s, d1[1]); ctx.lineTo(g1[0], g1[1]); ctx.lineTo(g0[0], g0[1]); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = rgba([255, 226, 186], 0.5 * floodOn); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(d0[0] + 3 * s, d0[1] + 0.5); ctx.lineTo(d1[0] - 3 * s, d1[1] + 0.5); ctx.stroke();
    // Перила
    ctx.strokeStyle = rgba([30, 30, 36], 0.9); ctx.lineWidth = 1;
    const rl = P(-31, PAD + 1.2), rr = P(31, PAD + 1.2);
    ctx.beginPath(); ctx.moveTo(rl[0], rl[1]); ctx.lineTo(rr[0], rr[1]);
    for (let x = -31; x <= 31; x += 4) { const a = P(x, PAD), b = P(x, PAD + 1.2); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
    ctx.stroke();
    // Газоотводный канал: светится, когда двигатели работают
    const tr0 = P(-3.2, PAD - 0.6), tr1 = P(3.2, 0.5);
    ctx.fillStyle = rgba([6, 6, 8]); ctx.fillRect(tr0[0], tr0[1], tr1[0] - tr0[0], tr1[1] - tr0[1]);
    const fireNow = flight.engineOn && flight.hasS1 ? flight.throttle * Math.exp(-V.hb / 200) : 0;
    if (fireNow > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      const cxT = (tr0[0] + tr1[0]) / 2, cyT = (tr0[1] + tr1[1]) / 2, R = 60 * s * fireNow + 20;
      ctx.globalAlpha = fireNow; ctx.drawImage(SPR_FIRE, cxT - R, cyT - R * 0.7, R * 2, R * 1.4);
      for (const sd of [-1, 1]) { const e = P(sd * 30, 3); ctx.drawImage(SPR_FIRE, e[0] - R * 0.8, e[1] - R * 0.5, R * 1.6, R); }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    // Держатели
    ctx.strokeStyle = rgba([30, 30, 36]); ctx.lineWidth = Math.max(1.5, 1.1 * s);
    const hold = 1 - smooth(-0.2, 0.6, flight.t);
    for (const sd of [-1, 1]) {
      const p0 = P(sd * 6.5, PAD), p1 = P(sd * (2.3 + (1 - hold) * 2.5), PAD + 3 + hold * 1.5);
      ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke();
    }
    ctx.restore();
  }

  // ---------- Дым у земли и пар ----------
  function emitSmoke(simDt) {
    const f = flight;
    const firing = f.engineOn && f.hasS1;
    if (firing && V.hb < 900 && simDt > 0) {
      const r = Math.min(40, Math.ceil(simDt * 90 * f.throttle));
      for (let i = 0; i < r; i++) {
        const side = Math.random() < 0.5 ? -1 : 1;
        if (V.hb < 60) {
          smoke.push({ d: side * (18 + Math.random() * 8), hh: 2 + Math.random() * 6, vd: side * (18 + Math.random() * 32), vh: 1 + Math.random() * 6, r: 5 + Math.random() * 6, age: 0, life: 10 + Math.random() * 8, heat: 1 });
        } else {
          const back = 18 + Math.random() * 40;
          const ax = Math.cos(V.pitch * DEG), ay = Math.sin(V.pitch * DEG);
          smoke.push({ d: V.d - ax * back + (Math.random() - 0.5) * 8, hh: V.hb - ay * back, vd: (Math.random() - 0.5) * 6, vh: (Math.random() - 0.5) * 4, r: 5 + Math.random() * 7, age: 0, life: 8 + Math.random() * 6, heat: 0.8 });
        }
      }
    }
    // Пар из дренажа во время отсчёта
    if (f.phase === 'countdown' && simDt > 0 && Math.random() < simDt * 14) {
      const y = Math.random() < 0.5 ? 47 : 26;
      smoke.push({ d: (Math.random() < 0.5 ? -1 : 1) * 2.1, hh: PAD + y, vd: (Math.random() - 0.5) * 1.6, vh: -0.8 - Math.random(), r: 1.2 + Math.random() * 1.2, age: 0, life: 4 + Math.random() * 3, heat: 0, vapor: 1 });
    }
    while (smoke.length > 420) smoke.shift();
  }
  function stepSmoke(simDt) {
    if (simDt <= 0) return;
    const drag = Math.exp(-0.45 * simDt);
    for (const p of smoke) {
      p.d += p.vd * simDt; p.hh += p.vh * simDt;
      p.vd *= drag; p.vh = p.vh * drag + (p.vapor ? -0.1 : 1.1) * simDt;
      p.r += (p.vapor ? 0.8 : 2.4 + 5 * p.heat) * simDt;
      p.heat = Math.max(0, p.heat - 0.7 * simDt);
      if (p.hh < 1) { p.hh = 1; p.vh = Math.abs(p.vh) * 0.3; }
      p.age += simDt;
    }
    smoke = smoke.filter((p) => p.age < p.life);
  }
  function drawSmoke(st) {
    if (!smoke.length || CAM.s < 0.02) return;
    const fireOn = flight.engineOn && flight.hasS1 ? flight.throttle : 0;
    const base = mix(st.sky.hor, [196, 192, 200], 0.55);
    const bright = clamp(0.35 + 0.65 * (1 - smooth(6, 16, st.dep)), 0.3, 1);
    ctx.save();
    for (const p of smoke) {
      const sp = toScreen(p.d, p.hh);
      const rr = p.r * CAM.s * 1.6;
      if (sp[0] + rr < 0 || sp[0] - rr > W || sp[1] + rr < 0 || sp[1] - rr > H) continue;
      const life = 1 - p.age / p.life;
      const a = (p.vapor ? 0.22 : 0.55) * life * Math.min(1, p.age * 3 + 0.3);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = a * bright;
      ctx.drawImage(SPR_SMOKE, sp[0] - rr, sp[1] - rr, rr * 2, rr * 2);
      const dist = Math.hypot(p.d - V.d, p.hh - V.hb);
      const lit = fireOn * Math.exp(-dist / 70) + p.heat * 0.6 * fireOn;
      if (lit > 0.02 && !p.vapor) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = clamp(lit, 0, 1) * life * 0.8;
        ctx.drawImage(SPR_FIRE, sp[0] - rr, sp[1] - rr, rr * 2, rr * 2);
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    void base;
  }

  // ---------- След за ракетой ----------
  function sampleTrail() {
    const f = flight;
    if (f.t < 0) return;
    const last = trail[trail.length - 1];
    const every = f.t < 30 ? 0.12 : f.t < 200 ? 0.4 : 1;
    if (last && f.t - last.t < every) return;
    trail.push({ d: V.d, hh: V.hb, t: f.t, on: f.engineOn ? f.throttle : 0, stage: f.stage });
    if (trail.length > 2400) trail.splice(0, trail.length - 2400);
  }
  function drawTrail(st) {
    if (trail.length < 2) return;
    const t = flight.t;
    const pts = [];
    for (const p of trail) {
      if (p.on <= 0 && pts.length === 0) continue;
      const sp = toScreen(p.d, p.hh);
      pts.push({ x: sp[0], y: sp[1], age: t - p.t, hh: p.hh, d: p.d, on: p.on });
    }
    if (flight.engineOn) { const b = toScreen(V.d, V.hb); pts.push({ x: b[0], y: b[1], age: 0, hh: V.hb, d: V.d, on: 1 }); }
    if (pts.length < 2) return;
    // Нормали в вершинах (усреднённые), чтобы соседние четырёхугольники делили рёбра без щелей и наложений
    const nx = new Float32Array(pts.length), ny = new Float32Array(pts.length);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let dx = b.x - a.x, dy = b.y - a.y; const L = Math.hypot(dx, dy) || 1;
      nx[i] = -dy / L; ny[i] = dx / L;
    }
    const smokeCol = st.dep > 14 ? [64, 64, 78] : mix([156, 150, 168], st.sky.hor, 0.3);
    const strip = (widthPx, style) => {
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        if ((a.x < -400 && b.x < -400) || (a.x > W + 400 && b.x > W + 400) || (a.y < -400 && b.y < -400) || (a.y > H + 400 && b.y > H + 400)) continue;
        const st1 = style(a, b); if (!st1) continue;
        const wa = widthPx(a) / 2, wb = widthPx(b) / 2;
        ctx.fillStyle = st1;
        ctx.beginPath();
        ctx.moveTo(a.x + nx[i - 1] * wa, a.y + ny[i - 1] * wa); ctx.lineTo(b.x + nx[i] * wb, b.y + ny[i] * wb);
        ctx.lineTo(b.x - nx[i] * wb, b.y - ny[i] * wb); ctx.lineTo(a.x - nx[i - 1] * wa, a.y - ny[i - 1] * wa);
        ctx.closePath(); ctx.fill();
      }
    };
    ctx.save();
    // Дымный след в плотной атмосфере: у ракеты подсвечен пламенем, дальше серый, расплывается
    ctx.globalCompositeOperation = 'source-over';
    strip((p) => Math.max(1, (6 + p.age * 2.1 + p.hh * 0.0015) * CAM.s), (a, b) => {
      const smokeK = 1 - smooth(14000, 30000, b.hh);
      const alpha = 0.46 * smokeK * Math.exp(-b.age / 95) * smooth(0, 0.6, b.age + 0.2);
      if (alpha < 0.004 || !(a.on > 0 || b.on > 0)) return null;
      const warm = Math.exp(-b.age / 1.4) * (flight.engineOn ? 1 : 0);
      return rgba(mix(smokeCol, [255, 170, 100], warm * 0.8), alpha);
    });
    // Высотный шлейф, освещённый Солнцем, — «медуза»: несколько мягких слоёв вместо жёсткой ленты
    ctx.globalCompositeOperation = 'lighter';
    const layers = [[1.0, 0.035, [196, 150, 240]], [0.62, 0.05, [170, 170, 255]], [0.34, 0.07, [170, 205, 255]], [0.14, 0.1, [225, 238, 255]]];
    for (const [kw, ka, col] of layers) {
      strip((p) => Math.max(0.8, plumeScale(p.hh) * (0.22 + p.age * 0.016) * kw * CAM.s), (a, b) => {
        const lit = sunlitAt(b.d, b.hh) * smooth(22000, 50000, b.hh);
        const alpha = ka * lit * Math.exp(-b.age / 150) * smooth(0, 3, b.age + 0.5) * 5.5 * Math.pow(1 - (CAM.closeness || 0), 2);
        return alpha < 0.003 ? null : rgba(col, alpha);
      });
    }
    ctx.restore();
  }
  // Характерный размер выхлопа на высоте (м): в вакууме шлейф раздувается на километры
  const plumeScale = (hh) => 40 + 9000 * smooth(25000, 110000, hh);

  // ---------- Факел ----------
  function drawFlame(st, bx, by, rot) {
    const f = flight;
    const on = f.engineOn || (f.phase === 'countdown' && f.t >= -3);
    if (!on) return;
    const thr = Math.max(0.05, f.throttle);
    const atm = GT.atmosphere(Math.max(0, V.hb));
    const pr = atm.p / 101325, vac = 1 - pr;
    const s2 = !f.hasS1;
    const flick = reduceMotion ? 1 : 1 + 0.05 * Math.sin(animT * 43) + 0.04 * Math.sin(animT * 71 + 1.3);
    let len = s2 ? 46 : lerp(36, 95, Math.sqrt(vac));
    let endW = s2 ? 64 : 4 + 86 * Math.pow(vac, 2.4);
    len *= (0.5 + 0.5 * thr) * flick; endW *= (0.6 + 0.4 * thr);
    const nozzle = s2 ? 3.2 : 3.6;
    const s = CAM.s;
    ctx.save();
    ctx.translate(bx, by); ctx.rotate(rot);
    // Не рисуем ниже стола, пока ракета на старте: пламя уходит в газоотвод
    if (V.hb < 40) {
      const g = toScreen(V.d, PAD);
      ctx.restore(); ctx.save();
      ctx.beginPath(); ctx.rect(-W, -H, W * 3, g[1] + H); ctx.clip();
      ctx.translate(bx, by); ctx.rotate(rot);
    }
    ctx.globalCompositeOperation = 'lighter';
    const L = len * s, W0 = nozzle * s, W1 = endW * s;
    const colCore = s2 ? [255, 236, 214] : [255, 246, 214];
    const colBody = s2 ? [255, 150, 110] : [255, 164, 64];
    const colEdge = s2 ? [120, 140, 255] : [255, 96, 36];
    const thin = s2 ? 0.55 : 1 - 0.62 * vac;          // в разреженном воздухе факел становится прозрачным «колоколом»
    const bodyCol = mix(colBody, [255, 214, 190], s2 ? 0.2 : vac * 0.55);
    for (let k = 3; k >= 0; k--) {
      const grow = 1 + k * 0.28;
      const lg = ctx.createLinearGradient(0, 0, 0, L * grow);
      const a = [0.5, 0.26, 0.14, 0.08][k] * (k === 0 ? (s2 ? 0.55 : 1) : thin) * (0.55 + 0.45 * thr);
      lg.addColorStop(0, rgba(k === 0 ? colCore : bodyCol, a)); lg.addColorStop(0.35, rgba(bodyCol, a * 0.8)); lg.addColorStop(1, rgba(colEdge, 0));
      ctx.fillStyle = lg;
      bell(W0 * (1 + k * 0.15), W1 * grow, L * grow);
      ctx.fill();
    }
    // Ядро
    const cg = ctx.createLinearGradient(0, 0, 0, L * 0.45);
    cg.addColorStop(0, rgba([255, 255, 245], 0.95)); cg.addColorStop(1, rgba(colBody, 0));
    ctx.fillStyle = cg;
    bell(W0 * 0.8, Math.max(W0 * 0.5, W1 * 0.18), L * 0.45); ctx.fill();
    // Скачки уплотнения (ромбы Маха) в плотном воздухе
    if (!s2 && pr > 0.2) {
      const k = smooth(0.2, 0.7, pr);
      for (let i = 1; i <= 5; i++) {
        const y = L * 0.1 * i * (0.9 + 0.1 * flick), r = W0 * (0.55 - i * 0.06);
        ctx.globalAlpha = k * (0.75 - i * 0.12);
        ctx.drawImage(SPR_WHITE, -r * 1.6, y - r * 1.2, r * 3.2, r * 2.4);
      }
      ctx.globalAlpha = 1;
    }
    // Подсветка вокруг сопел
    const gl = Math.max(W0 * 6, 30);
    ctx.globalAlpha = 0.5 * thr * (0.3 + 0.7 * pr);
    ctx.drawImage(SPR_FIRE, -gl, -gl * 0.6, gl * 2, gl * 2);
    ctx.globalAlpha = 1;
    ctx.restore();

    // Гигантский освещённый выхлоп — «медуза» в сумерках: мягкое свечение вокруг и позади ракеты
    const lit = st.sunlitV * smooth(24000, 52000, V.hb);
    if (lit > 0.01 && (f.engineOn)) {
      const Lm = plumeScale(V.hb) * 1.6;
      const Lp = Lm * s;
      const a = 0.95 * lit * (0.35 + 0.65 * thr) * (CAM.s > 0.3 ? 0.25 : 1);
      ctx.save(); ctx.translate(bx, by); ctx.rotate(rot); ctx.globalCompositeOperation = 'lighter';
      const blob = (cy, rx, ry, col, al) => {
        ctx.save(); ctx.translate(0, cy); ctx.scale(rx, ry);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
        g.addColorStop(0, rgba(col, al)); g.addColorStop(0.45, rgba(col, al * 0.4)); g.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      };
      blob(Lp * 0.45, Lp * 0.55, Lp * 0.6, [190, 160, 250], a * 0.35);
      blob(Lp * 0.28, Lp * 0.32, Lp * 0.4, [160, 200, 255], a * 0.5);
      blob(Lp * 0.1, Lp * 0.12, Lp * 0.18, [236, 244, 255], a * 0.8);
      ctx.restore();
    }
  }
  function bell(w0, w1, len) {
    ctx.beginPath();
    ctx.moveTo(-w0 / 2, 0);
    ctx.bezierCurveTo(-w0 / 2 - w1 * 0.05, len * 0.22, -w1 / 2, len * 0.5, -w1 * 0.22, len * 0.97);
    ctx.quadraticCurveTo(0, len * 1.05, w1 * 0.22, len * 0.97);
    ctx.bezierCurveTo(w1 / 2, len * 0.5, w0 / 2 + w1 * 0.05, len * 0.22, w0 / 2, 0);
    ctx.closePath();
  }

  // ---------- Ракета ----------
  function lightModel(st) {
    const f = flight;
    const flood = (st.dep > -2 ? 1 : 0.35) * Math.exp(-Math.max(0, V.hb - 70) / 110);
    const sun = st.dep < -3 ? 1 : st.sunlitV;
    const sunCol = st.dep < -3 ? [255, 250, 240] : mix([255, 168, 118], [255, 236, 214], smooth(40000, 120000, V.hb));
    const ambBase = st.dep < -3 ? [150, 170, 200] : mix(mix(st.sky.mid, st.sky.hor, 0.35), [60, 64, 84], 0.2);
    const amb = mix(ambBase.map((v) => v * 1.25), [14, 15, 20], st.space * 0.75);
    return { flood, sun, sunCol, amb, fire: f.engineOn && V.hb < 30000 ? f.throttle * (0.4 + 0.6 * clamp(GT.atmosphere(V.hb).p / 20000, 0, 1)) : 0 };
  }
  function shade(paint, lm, t) {
    // t: 0 — левый край цилиндра, 1 — правый. Солнце слева; прожекторы с двух сторон.
    const n = Math.sin(Math.PI * clamp(t, 0.02, 0.98));
    const sunK = lm.sun * clamp(1.15 - t * 1.4, 0, 1) * (0.35 + 0.65 * n);
    const floodK = lm.flood * (0.5 + 0.5 * n) * (0.85 + 0.3 * clamp(t, 0, 1));
    const amb = 0.35 + 0.4 * n;
    const c = [0, 1, 2].map((i) => paint[i] / 255 * (lm.amb[i] * amb + lm.sunCol[i] * sunK + [255, 230, 200][i] * floodK * 1.05));
    return c.map((v) => Math.min(255, v));
  }
  function cylGrad(x0, x1, paint, lm) {
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    for (const t of [0, 0.06, 0.12, 0.3, 0.55, 0.78, 0.92, 1]) {
      const c = shade(paint, lm, t);
      // Блик по краю, обращённому к Солнцу
      const rim = lm.sun * Math.pow(Math.max(0, 1 - Math.abs(t - (lm.sunX < 0 ? 0.07 : 0.93)) * 9), 2) * Math.min(1, Math.abs(lm.sunX) * 1.4 + 0.35);
      g.addColorStop(t, rgba(c.map((v, i) => Math.min(255, v + lm.sunCol[i] * rim * 0.75))));
    }
    return g;
  }
  const WHITE = [238, 235, 228], CARBON = [34, 34, 38], GREY = [120, 122, 128];

  // Корпус в локальных метрах: ось вверх (y отрицательный на холсте), основание — y = 0
  function drawStack(lm, opt) {
    const r = 1.85;
    if (opt.s1) {
      ctx.fillStyle = rgba(shade(GREY, lm, 0.4)); // двигатели
      for (const x of [-1.25, 0, 1.25]) { ctx.beginPath(); ctx.moveTo(x - 0.45, 0); ctx.lineTo(x - 0.62, 1.4); ctx.lineTo(x + 0.62, 1.4); ctx.lineTo(x + 0.45, 0); ctx.fill(); }
      ctx.save(); ctx.translate(0, 0);
      ctx.fillStyle = rgba(shade([60, 60, 66], lm, 0.4)); ctx.fillRect(-r, -1.8, 2 * r, 1.8);
      ctx.fillStyle = cylGrad(-r, r, WHITE, lm); ctx.fillRect(-r, -41, 2 * r, 39.2);
      ctx.fillStyle = cylGrad(-r, r, CARBON, lm); ctx.fillRect(-r, -47, 2 * r, 6);
      ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 0.12;
      ctx.beginPath(); for (const y of [-12, -24, -30.5]) { ctx.moveTo(-r, y); ctx.lineTo(r, y); } ctx.stroke();
      // Надпись вдоль ступени
      ctx.save(); ctx.translate(0.3, -9); ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = 'rgba(20,22,30,0.55)'; ctx.font = '600 2.2px "Sofia Sans Extra Condensed", sans-serif';
      ctx.fillText('СТРИЖ-2', 0, 0.7); ctx.restore();
      ctx.restore();
      if (opt.stubOnly) return;
    }
    const y2 = opt.s1 ? -47 : 0;
    ctx.save(); ctx.translate(0, y2);
    if (!opt.s1) {
      // Сопло второй ступени
      const ng = ctx.createLinearGradient(-1.7, 0, 1.7, 0);
      ng.addColorStop(0, rgba(shade([70, 60, 55], lm, 0.1))); ng.addColorStop(0.35, rgba(shade([160, 120, 90], lm, 0.35))); ng.addColorStop(1, rgba(shade([50, 44, 42], lm, 0.9)));
      ctx.fillStyle = ng;
      ctx.beginPath(); ctx.moveTo(-1.65, 0); ctx.quadraticCurveTo(-0.8, -3.2, -0.55, -5.4); ctx.lineTo(0.55, -5.4); ctx.quadraticCurveTo(0.8, -3.2, 1.65, 0); ctx.closePath(); ctx.fill();
      ctx.translate(0, -5.4);
    }
    ctx.fillStyle = cylGrad(-r, r, WHITE, lm); ctx.fillRect(-r, -11.5, 2 * r, 11.5);
    ctx.strokeStyle = 'rgba(0,0,0,0.16)'; ctx.lineWidth = 0.1; ctx.beginPath(); ctx.moveTo(-r, -5); ctx.lineTo(r, -5); ctx.stroke();
    ctx.translate(0, -11.5);
    if (opt.fairing) {
      const R = 2.6;
      ctx.fillStyle = cylGrad(-R, R, WHITE, lm);
      ctx.beginPath();
      ctx.moveTo(-r, 0); ctx.lineTo(-R, -1.2); ctx.lineTo(-R, -6.2);
      ctx.bezierCurveTo(-R, -10.5, -1.1, -12.6, 0, -13.2);
      ctx.bezierCurveTo(1.1, -12.6, R, -10.5, R, -6.2);
      ctx.lineTo(R, -1.2); ctx.lineTo(r, 0); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 0.08; ctx.beginPath(); ctx.moveTo(0, -0.5); ctx.lineTo(0, -13); ctx.stroke();
    } else if (opt.payload) {
      drawPayload(lm, 0);
    } else {
      ctx.fillStyle = rgba(shade([90, 92, 98], lm, 0.4)); ctx.fillRect(-1.2, -1, 2.4, 1);
    }
    ctx.restore();
  }
  function drawPayload(lm, deploy) {
    // Адаптер и спутник в золотистой теплоизоляции
    ctx.fillStyle = rgba(shade([70, 72, 78], lm, 0.4));
    ctx.beginPath(); ctx.moveTo(-1.6, 0); ctx.lineTo(-1.0, -1.1); ctx.lineTo(1.0, -1.1); ctx.lineTo(1.6, 0); ctx.fill();
    ctx.fillStyle = cylGrad(-1.5, 1.5, [210, 168, 84], lm); ctx.fillRect(-1.5, -5.4, 3, 4.3);
    ctx.strokeStyle = 'rgba(80,50,10,0.35)'; ctx.lineWidth = 0.06; ctx.beginPath();
    for (let i = 1; i < 4; i++) { ctx.moveTo(-1.5, -1.1 - i * 1.07); ctx.lineTo(1.5, -1.1 - i * 1.07); } ctx.stroke();
    ctx.fillStyle = rgba(shade([230, 230, 228], lm, 0.3));
    ctx.beginPath(); ctx.ellipse(0, -6.1, 1.1, 0.45, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(-0.08, -6.1, 0.16, 0.8);
    // Солнечные батареи
    const span = 0.4 + 7.2 * deploy;
    for (const sd of [-1, 1]) {
      ctx.fillStyle = rgba(shade([40, 58, 120], lm, sd < 0 ? 0.2 : 0.7));
      const x0 = sd * 1.5, x1 = sd * (1.5 + span);
      ctx.fillRect(Math.min(x0, x1), -4.4, Math.abs(x1 - x0), 2.2);
      ctx.strokeStyle = 'rgba(160,190,255,0.35)'; ctx.lineWidth = 0.05; ctx.beginPath();
      const n = Math.max(1, Math.round(span / 1.2));
      for (let i = 1; i < n; i++) { const x = x0 + (x1 - x0) * i / n; ctx.moveTo(x, -4.4); ctx.lineTo(x, -2.2); }
      ctx.stroke();
    }
  }
  function drawFairingHalf(lm, side) {
    const R = 2.6;
    ctx.save(); ctx.scale(side, 1);
    ctx.fillStyle = cylGrad(0, R, WHITE, lm);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(R, -1.2); ctx.lineTo(R, -6.2); ctx.bezierCurveTo(R, -10.5, 1.1, -12.6, 0, -13.2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = rgba(shade([150, 150, 150], lm, 0.2), 0.8);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0.25, -0.3); ctx.lineTo(0.25, -12.8); ctx.lineTo(0, -13.2); ctx.fill();
    ctx.restore();
  }

  function drawVehicle(st, lm) {
    const f = flight;
    const b = toScreen(V.d, V.hb);
    const rot = (90 - V.pitch) * DEG;
    const lenM = f.hasS1 ? 72 : 31;
    const lenPx = lenM * CAM.s;
    lm.sunX = -Math.cos(rot) - 0.05 * Math.sin(rot);
    drawFlame(st, b[0], b[1], rot);
    if (lenPx < 5) {
      // Слишком далеко: светящаяся точка с подписью
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g = f.engineOn ? 26 : 12;
      ctx.drawImage(f.engineOn ? SPR_FIRE : SPR_WHITE, b[0] - g / 2, b[1] - g / 2, g, g);
      ctx.fillStyle = 'rgba(255,248,236,0.95)'; ctx.beginPath(); ctx.arc(b[0], b[1], 1.8, 0, 6.29); ctx.fill();
      ctx.restore();
      marker(b[0], b[1], f.hasS1 ? 'РАКЕТА' : 'СТУПЕНЬ 2', [255, 200, 160]);
    } else {
      ctx.save(); ctx.translate(b[0], b[1]); ctx.rotate(rot); ctx.scale(CAM.s, CAM.s);
      drawStack(lm, { s1: f.hasS1, fairing: f.hasFairing, payload: f.hasPayload });
      // Отсвет пламени снизу корпуса
      if (lm.fire > 0.02) {
        ctx.globalCompositeOperation = 'lighter';
        const fg = ctx.createLinearGradient(0, 0, 0, -26);
        fg.addColorStop(0, `rgba(255,140,60,${0.55 * lm.fire})`); fg.addColorStop(1, 'rgba(255,140,60,0)');
        ctx.fillStyle = fg; ctx.fillRect(-1.9, -26, 3.8, 26);
      }
      ctx.restore();
    }
  }
  function marker(x, y, text, col) {
    if (x < -20 || x > W + 20 || y < -20 || y > H + 20) return;
    ctx.save();
    ctx.strokeStyle = rgba(col, 0.55); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + 6, y - 6); ctx.lineTo(x + 26, y - 26); ctx.lineTo(x + 34, y - 26); ctx.stroke();
    ctx.font = '600 12px "Sofia Sans Condensed", sans-serif'; ctx.fillStyle = rgba(col, 0.9);
    ctx.letterSpacing = '2px';
    ctx.fillText(text, x + 38, y - 22);
    ctx.restore();
  }

  function drawDebris(st, lm) {
    for (const d of flight.debris) {
      let vis = debrisVis.get(d);
      if (!vis) {
        vis = { off: d.kind === 'stage1' ? 0 : 41 + 5.4 + 11.5, ang0: d.ang };
        debrisVis.set(d, vis);
      }
      const g = inertialToGround(d.x, d.y);
      if (g[1] < -10) continue;
      const a0 = vis.ang0 * DEG;
      const dd = g[0] + Math.cos(a0) * vis.off, hh = g[1] + PAD + Math.sin(a0) * vis.off;
      const sp = toScreen(dd, hh);
      const len = (d.kind === 'stage1' ? 47 : 13) * CAM.s;
      if (sp[0] < -len * 2 || sp[0] > W + len * 2 || sp[1] < -len * 2 || sp[1] > H + len * 2) continue;
      if (len < 3) { if (d.kind === 'stage1') marker(sp[0], sp[1], 'СТУПЕНЬ 1', [200, 210, 230]); continue; }
      const drot = (90 - d.ang) * DEG;
      lm.sunX = -Math.cos(drot) - 0.05 * Math.sin(drot);
      ctx.save(); ctx.translate(sp[0], sp[1]); ctx.rotate(drot); ctx.scale(CAM.s, CAM.s);
      if (d.kind === 'stage1') drawStack(lm, { s1: true, fairing: false, payload: false, stubOnly: true });
      else if (d.kind === 'fairing') drawFairingHalf(lm, d.side);
      else drawPayload(lm, smooth(4, 12, flight.t - d.t0));
      ctx.restore();
    }
  }

  // ---------- Главный кадр ----------
  function render(realDt) {
    const f = flight;
    // Положение основания аппарата в земной системе у площадки
    const gpos = f.t >= 0 ? inertialToGround(f.x, f.y) : [0, 0];
    const off = f.hasS1 ? 0 : 41;
    V.pitch = f.pitch;
    V.d = gpos[0] + Math.cos(f.pitch * DEG) * off;
    V.hb = gpos[1] + PAD + Math.sin(f.pitch * DEG) * off;
    const h = Math.max(0, V.hb);
    const closeness = updateCamera(realDt, h);
    void closeness;

    const depG = f.o.sunDep + V.d / RE / DEG;
    const dip = Math.acos(RE / (RE + h)) / DEG;
    const st = {
      dep: depG, sky: skyAt(depG), space: smooth(7000, 55000, h), dip,
      sunlitV: smooth(-0.3, 1.4, dip - depG),
      yh: H * 0.5 + H * 0.33 * Math.exp(-h / 260) + H * 1.05 * Math.tan(dip * DEG) * 0.95,
      Rs: 0,
    };
    // Горизонт чуть выше при общем плане, чтобы было видно Землю
    if (dip > 0.45) st.Rs = H * 1.05 / Math.tan(dip * DEG);
    st.yh = Math.min(st.yh, H * 0.93);

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawSky(st);
    drawStars(st);
    drawSun(st);
    drawEarth(st);
    drawPad(st);
    drawTrail(st);
    drawSmoke(st);
    const lm = lightModel(st);
    drawDebris(st, lm);
    drawVehicle(st, lm);

    // Виньетка
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.42)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  }

  // ---------- Подписи, журнал, события ----------
  let capTimer = 0;
  function showCaption(who, text) {
    const el = $('caption');
    if (!text) { el.innerHTML = ''; return; }
    el.className = 'caption';
    el.innerHTML = `<span class="who">${who}</span><span class="line">${text}</span>`;
    void el.offsetWidth; el.className = 'caption show';
    clearTimeout(capTimer);
    capTimer = setTimeout(() => { el.className = 'caption hide'; }, 3600);
  }
  function processEvents() {
    const evs = flight.events;
    while (evIdx < evs.length) {
      const e = evs[evIdx++];
      const li = document.createElement('li');
      li.className = e.key === 'cmd' ? 'cmd' : e.key === 'fail' ? 'fail' : e.key === 'orbit' ? 'orbit' : '';
      li.innerHTML = `<time>${shortT(e.t)}</time><span>${e.text}</span>`;
      $('log').appendChild(li);
      logEls.push(li);
      if (logEls.length > 12) logEls.shift().remove();
      if (e.key === 'cmd') { showCaption('Командный пункт', '— ' + e.text); sfx('blip'); }
      else if (e.key === 'kick' || e.key === 'throttle' || e.key === 'contact') { showCaption('Телеметрия', e.text); }
      else if (e.key === 'fail') { showCaption('Нештатная ситуация', e.text); sfx('thump'); }
      else { showCaption('Событие', e.text); if (e.key === 'sep' || e.key === 'fairing' || e.key === 'payload') sfx('thump'); if (e.key === 'liftoff') sfx('blip'); }
    }
  }

  // ---------- Карточка итога ----------
  function maybeResult() {
    const f = flight;
    if (resultShown) return;
    const el = $('result');
    const payloadEv = f.events.find((e) => e.key === 'payload');
    if (f.phase === 'orbit' && payloadEv && f.t > payloadEv.t + 9) {
      resultShown = true;
      const o = f.orbit();
      const pe = (o.rp - RE) / 1000, ap = (o.ra - RE) / 1000;
      const vf = f.samplesSeco || Math.hypot(f.vx, f.vy);
      const burn = f.loss.burn, steer = f.loss.steer, drag = f.loss.drag;
      const gain = vf - f.vRot;
      const grav = Math.max(0, burn - gain - steer - drag);
      const parts = [['Орбитальная скорость', gain, '#7fd0ff'], ['Гравитационные потери', grav, '#ff8a3d'], ['Потери на управление', steer, '#e58bd6'], ['Сопротивление воздуха', drag, '#a0a3ad']];
      const bar = parts.map((p) => `<i style="width:${(p[1] / burn * 100).toFixed(2)}%;background:${p[2]}"></i>`).join('');
      const legend = parts.map((p) => `<span><i style="background:${p[2]}"></i>${p[0]}</span><b>${fmt2(p[1] / 1000)} км/с</b>`).join('');
      const left = f.prop2;
      el.innerHTML = `
        <div class="kicker">Орбита достигнута</div>
        <h2>${fmtInt(pe)} × ${fmtInt(ap)} км</h2>
        <div class="sub">Наклонение ${fmt1(f.lat)}°, период ${fmt1(o.period / 60)} мин. Полезная нагрузка ${fmt1(f.o.payload / 1000)} т отделена.</div>
        <div class="budget"><div class="title">Куда ушли ${fmt2(burn / 1000)} км/с характеристической скорости</div>
          <div class="bar">${bar}</div><div class="legend">${legend}</div>
          <div class="legend" style="margin-top:6px"><span style="color:var(--good)">Вращение Земли добавило даром</span><b>+${fmt2(f.vRot / 1000)} км/с</b></div>
        </div>
        <div class="facts">
          <div>Макс. напор<b>${fmt1(f.maxQ / 1000)} кПа</b>на ${shortT(f.maxQt)}</div>
          <div>Макс. перегрузка<b>${fmt1(f.maxG)} g</b>ограничение ${fmt1(f.o.gLimit)} g</div>
          <div>Остаток топлива<b>${fmt1(left / 1000)} т</b>во второй ступени</div>
        </div>
        <div class="actions"><button class="btn primary" data-act="again">Новый пуск</button><button class="btn" data-act="tune">Изменить параметры</button><button class="btn" data-act="close">Смотреть орбиту</button></div>`;
      el.hidden = false; el.className = 'result show';
    } else if (f.phase === 'failed' || (f.phase === 'coast' && f.failure)) {
      if (f.phase === 'coast' && f.t < f.secoT + 4) return;
      resultShown = true;
      const o = f.orbit();
      const reason = {
        breakup: ['Ракета разрушилась', `Угол атаки ${fmt1(f.alpha)}° при напоре ${fmt1(f.q / 1000)} кПа. В плотной атмосфере ракету ведут строго по вектору скорости.`],
        crash: ['Ракета упала', 'Траектория оказалась слишком пологой: ракета вернулась в плотные слои раньше, чем набрала скорость.'],
        fuel: ['Не хватило топлива', `Перицентр ${fmt1((o.rp - RE) / 1000)} км: аппарат вернётся в атмосферу. Уменьшите нагрузку или высоту орбиты.`],
        suborbital: ['Суборбитальный полёт', `Двигатель выключен рано: перицентр ${fmt1((o.rp - RE) / 1000)} км. Добавьте горизонтальной скорости.`],
      }[f.failure] || ['Нештатная ситуация', ''];
      el.innerHTML = `<div class="kicker">Нештатная ситуация</div><h2>${reason[0]}</h2><div class="sub">${reason[1]}</div>
        <div class="actions"><button class="btn primary" data-act="again">Новый пуск</button><button class="btn" data-act="tune">Изменить параметры</button><button class="btn" data-act="close">Закрыть</button></div>`;
      el.hidden = false; el.className = 'result fail show';
    }
  }
  $('result').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act;
    if (act === 'again') newFlight(true);
    else if (act === 'tune') openSettings();
    else $('result').hidden = true;
  });

  // ---------- Телеметрия в DOM ----------
  function updateUi() {
    const f = flight;
    const t = f.t;
    $('tsign').textContent = t < 0 ? 'T−' : 'T+';
    $('tclock').textContent = clockStr(t);
    const L = f.local();
    const vrel = Math.hypot(L.relR, L.relH);
    const alt = Math.max(0, f.alt());
    const speedKmh = f.t < 0 ? 0 : vrel * 3.6;
    const t1 = $('tele1'), t2 = $('tele2');
    if (f.hasS1) {
      $('tele1Name').textContent = 'Ракета'; $('tele1Tag').textContent = 'ступени 1 + 2';
      $('s1v').textContent = fmtInt(speedKmh); $('s1h').textContent = fmt1(alt / 1000);
      $('s1f').style.transform = `scaleX(${(f.prop1 / GT.ROCKET.s1.prop).toFixed(4)})`;
      $('s2v').textContent = fmtInt(speedKmh); $('s2h').textContent = fmt1(alt / 1000);
      t2.classList.add('dimmed'); $('tele2Tag').textContent = 'в составе ракеты';
    } else {
      const d1 = f.debris.find((d) => d.kind === 'stage1');
      $('tele1Name').textContent = 'Ступень 1'; $('tele1Tag').textContent = 'баллистический полёт';
      if (d1) {
        const r = Math.hypot(d1.x, d1.y), rvx = d1.vx - f.wEff * d1.y, rvy = d1.vy + f.wEff * d1.x;
        $('s1v').textContent = fmtInt(Math.hypot(rvx, rvy) * 3.6); $('s1h').textContent = fmt1(Math.max(0, r - RE) / 1000);
        if (r - RE < 0) $('tele1Tag').textContent = 'упала в заданный район';
      }
      $('s1f').style.transform = 'scaleX(0)';
      t2.classList.remove('dimmed');
      $('tele2Tag').textContent = f.engineOn ? 'двигатель работает' : f.phase === 'orbit' ? 'на орбите' : 'двигатель выключен';
      $('s2v').textContent = fmtInt(speedKmh); $('s2h').textContent = fmt1(alt / 1000);
    }
    $('s2f').style.transform = `scaleX(${(f.prop2 / GT.ROCKET.s2.prop).toFixed(4)})`;
    t1.classList.toggle('dimmed', false);

    const o = f.orbit();
    const ap = (o.ra - RE) / 1000, pe = (o.rp - RE) / 1000;
    $('rAp').innerHTML = f.t > 0 && isFinite(ap) && ap > 0 ? `${fmtInt(ap)}<small>км</small>` : '—';
    $('rPe').innerHTML = f.t > 0 && pe > -RE / 1000 + 50 ? `${pe > -1000 ? fmtInt(pe) : '−' + NB + '…'}<small>км</small>` : '—';
    $('rPer').innerHTML = pe > 0 && isFinite(o.period) ? `${fmt1(o.period / 60)}<small>мин</small>` : '—';
    $('rPitch').innerHTML = `${fmt1(f.pitch)}<small>°</small>`;
    $('rQ').innerHTML = `${fmt1(f.q / 1000)}<small>кПа</small>`;
    $('rMach').textContent = fmt1(f.mach);

    const hintEl = $('hint');
    hintEl.style.opacity = f.t > 40 || warp > 1 ? 0 : 1;
  }

  // ---------- Графики ----------
  const CH = {
    h: { max: () => (flight.o.targetAlt + 60000), val: (s) => s.h, col: '#7fd0ff', fmt: (v) => `${fmt1(v / 1000)} км` },
    v: { max: () => 30000, val: (s) => s.v * 3.6, col: '#ff8a3d', fmt: (v) => `${fmtInt(v)} км/ч` },
    q: { max: () => 40000, val: (s) => s.q, col: '#ffcf6b', fmt: (v) => `${fmt1(v / 1000)} кПа` },
    g: { max: () => 5.5, val: (s) => s.g, col: '#c9a2ff', fmt: (v) => `${fmt1(v)} g` },
  };
  function tEnd() {
    const n = nominal && nominal.key === nominalOpts ? nominal : null;
    const p = n && n.events.find((e) => e.key === 'payload');
    return p ? p.t + 30 : 520;
  }
  function drawCharts() {
    const te = tEnd();
    for (const c of document.querySelectorAll('#charts canvas')) {
      const key = c.dataset.key, cfg = CH[key];
      const g = c.getContext('2d');
      const w = c.width / DPR, h = c.height / DPR;
      g.setTransform(DPR, 0, 0, DPR, 0, 0); g.clearRect(0, 0, w, h);
      const top = 16, bot = h - 3;
      const X = (t) => (t / te) * w, Y = (v) => bot - (v / cfg.max()) * (bot - top);
      g.strokeStyle = 'rgba(236,232,223,0.07)'; g.lineWidth = 1;
      g.beginPath(); for (const k of [0, 0.5, 1]) { const y = Math.round(lerp(bot, top, k)) + 0.5; g.moveTo(0, y); g.lineTo(w, y); } g.stroke();
      if (nominal && nominal.key === nominalOpts) {
        g.setLineDash([3, 4]); g.strokeStyle = 'rgba(236,232,223,0.32)'; g.lineWidth = 1.2;
        g.beginPath(); nominal.samples.forEach((s, i) => { const x = X(s.t), y = Y(cfg.val(s)); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
        g.setLineDash([]);
      }
      const ss = flight.samples;
      if (ss.length > 1) {
        g.strokeStyle = cfg.col; g.lineWidth = 1.8; g.lineJoin = 'round';
        g.beginPath(); ss.forEach((s, i) => { const x = X(s.t), y = Y(cfg.val(s)); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
        const s = ss[ss.length - 1];
        g.fillStyle = cfg.col; g.beginPath(); g.arc(X(s.t), Y(cfg.val(s)), 3, 0, 6.29); g.fill();
        $('cv-' + key).textContent = cfg.fmt(cfg.val(s));
      } else $('cv-' + key).textContent = '';
      if (key === 'q' && flight.fired.maxq) {
        const x = X(flight.maxQt), y = Y(flight.maxQ);
        g.fillStyle = 'rgba(255,207,107,0.95)'; g.font = '600 11px "Sofia Sans Condensed", sans-serif';
        g.fillText('MAX Q', Math.min(w - 36, x + 6), Math.max(top + 8, y + 3));
      }
    }
  }

  // ---------- Шкала событий ----------
  const TL_KEYS = [['liftoff', 'ПОДЪЁМ'], ['maxq', 'МАКС. НАПОР'], ['sep', 'РАЗДЕЛЕНИЕ'], ['fairing', 'ОБТЕКАТЕЛЬ'], ['seco', 'ОРБИТА'], ['payload', 'СПУТНИК']];
  function drawTimeline() {
    const c = $('timeline'), g = c.getContext('2d');
    const w = c.width / DPR, h = c.height / DPR;
    g.setTransform(DPR, 0, 0, DPR, 0, 0); g.clearRect(0, 0, w, h);
    const t0 = -12, te = tEnd(), padX = 28;
    const X = (t) => padX + ((t - t0) / (te - t0)) * (w - padX * 2);
    const y = Math.round(h * 0.52) + 0.5;
    const now = clamp(flight.t, t0, te);
    g.lineWidth = 2; g.strokeStyle = 'rgba(236,232,223,0.14)';
    g.beginPath(); g.moveTo(X(t0), y); g.lineTo(X(te), y); g.stroke();
    g.strokeStyle = 'rgba(255,138,61,0.9)';
    g.beginPath(); g.moveTo(X(t0), y); g.lineTo(X(now), y); g.stroke();
    const nom = nominal && nominal.key === nominalOpts ? nominal : null;
    g.font = '600 12px "Sofia Sans Condensed", sans-serif'; g.textAlign = 'center';
    TL_KEYS.forEach(([key, label], i) => {
      const actual = flight.events.find((e) => e.key === key);
      const planned = key === 'liftoff' ? { t: 0 } : nom && nom.events.find((e) => e.key === key);
      const te2 = actual ? actual.t : planned ? planned.t : null;
      if (te2 === null) return;
      const x = X(te2);
      const done = !!actual;
      g.beginPath(); g.arc(x, y, done ? 5 : 4.5, 0, 6.29);
      g.fillStyle = done ? '#ff8a3d' : '#0b0d13'; g.fill();
      g.lineWidth = 1.5; g.strokeStyle = done ? '#ff8a3d' : 'rgba(236,232,223,0.45)'; g.stroke();
      const up = i % 2 === 0;
      g.fillStyle = done ? 'rgba(236,232,223,0.95)' : 'rgba(236,232,223,0.62)';
      g.fillText(label, clamp(x, 34, w - 34), up ? y - 14 : y + 23);
      g.fillStyle = 'rgba(236,232,223,0.55)'; g.font = '400 11px "JetBrains Mono", monospace';
      g.fillText(shortT(te2).slice(1), clamp(x, 34, w - 34), up ? y - 27 : y + 36);
      g.font = '600 12px "Sofia Sans Condensed", sans-serif';
    });
    // Бегунок
    const xn = X(now);
    g.fillStyle = '#ece8df';
    g.beginPath(); g.moveTo(xn, y - 7); g.lineTo(xn + 5, y); g.lineTo(xn, y + 7); g.lineTo(xn - 5, y); g.closePath(); g.fill();
  }

  // ---------- Схема орбиты ----------
  function drawOrbit() {
    const c = $('orbit'), g = c.getContext('2d');
    const w = c.width / DPR, h = c.height / DPR;
    g.setTransform(DPR, 0, 0, DPR, 0, 0); g.clearRect(0, 0, w, h);
    const Rp = Math.min(w, h) * 0.36, cx = w / 2, cy = h / 2 + 4;
    const EX = 8;
    const P = (x, y) => { const r = Math.hypot(x, y), a = Math.atan2(y, x); const rr = Rp * (1 + EX * (r - RE) / RE); return [cx + Math.cos(a) * rr, cy - Math.sin(a) * rr]; };
    // Земля
    const eg = g.createRadialGradient(cx - Rp * 0.35, cy - Rp * 0.4, Rp * 0.1, cx, cy, Rp);
    eg.addColorStop(0, '#1d2940'); eg.addColorStop(1, '#0c1220');
    g.fillStyle = eg; g.beginPath(); g.arc(cx, cy, Rp, 0, 6.29); g.fill();
    g.strokeStyle = 'rgba(127,208,255,0.35)'; g.lineWidth = 1; g.stroke();
    g.strokeStyle = 'rgba(127,208,255,0.1)'; g.lineWidth = 6; g.beginPath(); g.arc(cx, cy, Rp + 4, 0, 6.29); g.stroke();
    // Целевая орбита
    g.setLineDash([2, 5]); g.strokeStyle = 'rgba(236,232,223,0.22)'; g.lineWidth = 1;
    g.beginPath(); g.arc(cx, cy, Rp * (1 + EX * flight.o.targetAlt / RE), 0, 6.29); g.stroke(); g.setLineDash([]);
    // Площадка
    const sa = Math.PI / 2 - flight.wEff * Math.max(0, flight.t);
    g.fillStyle = '#ff8a3d'; g.beginPath(); g.arc(cx + Math.cos(sa) * Rp, cy - Math.sin(sa) * Rp, 2.6, 0, 6.29); g.fill();
    // Оскулирующая орбита
    const f = flight;
    if (f.t > 20) {
      const o = f.orbit();
      if (isFinite(o.a) && o.ra > RE) {
        const r = Math.hypot(f.x, f.y), v2 = f.vx * f.vx + f.vy * f.vy, rv = f.x * f.vx + f.y * f.vy;
        const ex = ((v2 - GT.MU / r) * f.x - rv * f.vx) / GT.MU, ey = ((v2 - GT.MU / r) * f.y - rv * f.vy) / GT.MU;
        const w0 = Math.atan2(ey, ex);
        const p = o.a * (1 - o.e * o.e);
        g.lineWidth = 1.4;
        let pen = false;
        g.beginPath();
        for (let i = 0; i <= 240; i++) {
          const nu = i / 240 * Math.PI * 2;
          const rr = p / (1 + o.e * Math.cos(nu));
          const x = rr * Math.cos(nu + w0), y = rr * Math.sin(nu + w0);
          const above = rr > RE;
          const q = P(x, y);
          if (above && !pen) { g.moveTo(q[0], q[1]); pen = true; } else if (above) g.lineTo(q[0], q[1]); else pen = false;
        }
        g.strokeStyle = f.phase === 'orbit' ? 'rgba(169,230,160,0.85)' : 'rgba(127,208,255,0.7)'; g.stroke();
        // Апоцентр
        const ra = P(o.ra * Math.cos(w0 + Math.PI), o.ra * Math.sin(w0 + Math.PI));
        g.fillStyle = 'rgba(236,232,223,0.85)'; g.font = '600 11px "Sofia Sans Condensed", sans-serif';
        g.fillText('Ап', ra[0] + 5, ra[1] - 4); g.beginPath(); g.arc(ra[0], ra[1], 2, 0, 6.29); g.fill();
      }
    }
    // Пройденный путь
    if (f.samples.length > 1) {
      g.strokeStyle = '#ff8a3d'; g.lineWidth = 1.6; g.beginPath();
      let first = true;
      for (const tp of trail) {
        const siteAng = Math.PI / 2 - f.wEff * tp.t;
        const ang = siteAng - tp.d / RE;
        const r = RE + tp.hh;
        const q = P(r * Math.cos(ang), r * Math.sin(ang));
        first ? g.moveTo(q[0], q[1]) : g.lineTo(q[0], q[1]); first = false;
      }
      g.stroke();
    }
    const q = P(f.x, f.y);
    g.fillStyle = '#fff'; g.beginPath(); g.arc(q[0], q[1], 3, 0, 6.29); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.arc(q[0], q[1], 7, 0, 6.29); g.stroke();
    for (const d of f.debris) { const dq = P(d.x, d.y); if (Math.hypot(d.x, d.y) < RE) continue; g.fillStyle = 'rgba(236,232,223,0.45)'; g.beginPath(); g.arc(dq[0], dq[1], 1.8, 0, 6.29); g.fill(); }
  }

  // ---------- Ручной режим: шкала тангажа ----------
  function drawDial() {
    const c = $('pitchDial'); if ($('manual').hidden) return;
    const g = c.getContext('2d'); const w = c.width, h = c.height;
    g.clearRect(0, 0, w, h);
    const cx = 24, cy = h - 18, R = h - 40;
    g.lineWidth = 2; g.strokeStyle = 'rgba(236,232,223,0.18)'; g.beginPath(); g.arc(cx, cy, R, -Math.PI / 2, 0); g.stroke();
    g.fillStyle = 'rgba(236,232,223,0.5)'; g.font = '600 20px "Sofia Sans Condensed", sans-serif';
    for (const a of [0, 30, 60, 90]) {
      const r = a * DEG; g.fillRect(cx + Math.cos(r) * (R - 8), cy - Math.sin(r) * (R - 8), 3, 3);
      g.fillText(a + '°', cx + Math.cos(r) * (R + 8) - (a === 0 ? 10 : 0), cy - Math.sin(r) * (R + 8) + (a === 90 ? -2 : 6));
    }
    const L = flight.local();
    const pro = Math.atan2(L.relR, L.relH) / DEG;
    const needle = (ang, col, len, wdt) => { const r = ang * DEG; g.strokeStyle = col; g.lineWidth = wdt; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(r) * len, cy - Math.sin(r) * len); g.stroke(); };
    if (flight.t > 1) needle(clamp(pro, -10, 95), 'rgba(127,208,255,0.9)', R, 3);
    needle(flight.userPitch, '#ff8a3d', R * 0.92, 4);
    needle(flight.pitch, '#ece8df', R * 0.75, 2);
    g.fillStyle = '#ece8df'; g.font = '700 30px "Sofia Sans Extra Condensed", sans-serif';
    g.fillText(`${fmt1(flight.userPitch)}°`, w - 150, 40);
    g.font = '600 18px "Sofia Sans Condensed", sans-serif'; g.fillStyle = 'rgba(127,208,255,0.9)';
    g.fillText(`вектор скорости ${fmt1(pro)}°`, w - 220, 70);
    g.fillStyle = 'rgba(236,232,223,0.6)';
    g.fillText(`тяга ${Math.round(flight.userThrottle * 100)}${NB}%`, w - 150, 98);
  }

  // ---------- Звук ----------
  let AC = null, snd = null, soundOn = false;
  function initAudio() {
    if (AC) return;
    const Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) return;
    AC = new Ctx();
    const n = AC.sampleRate * 2, buf = AC.createBuffer(1, n, AC.sampleRate), d = buf.getChannelData(0);
    let last = 0; for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    const src = AC.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300;
    const gain = AC.createGain(); gain.gain.value = 0;
    const nb = AC.createBuffer(1, n, AC.sampleRate), nd = nb.getChannelData(0); for (let i = 0; i < n; i++) nd[i] = Math.random() * 2 - 1;
    const cs = AC.createBufferSource(); cs.buffer = nb; cs.loop = true;
    const hp = AC.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 900; hp.Q.value = 0.7;
    const cg = AC.createGain(); cg.gain.value = 0;
    const master = AC.createGain(); master.gain.value = 0.55;
    src.connect(lp).connect(gain).connect(master); cs.connect(hp).connect(cg).connect(master); master.connect(AC.destination);
    src.start(); cs.start();
    snd = { lp, gain, cg, master };
  }
  function updateAudio() {
    if (!AC || !snd) return;
    const f = flight;
    const on = soundOn && !paused && (f.engineOn || (f.phase === 'countdown' && f.t > -3));
    const pr = GT.atmosphere(Math.max(0, f.alt())).p / 101325;
    const near = CAM.s > 0.5 ? 1 : 0.55;
    const vol = on ? f.throttle * (0.08 + 0.92 * Math.pow(pr, 0.35)) * near : 0;
    const tt = AC.currentTime;
    snd.gain.gain.setTargetAtTime(vol * 0.9, tt, 0.25);
    snd.lp.frequency.setTargetAtTime(160 + 520 * f.throttle * Math.pow(pr, 0.3), tt, 0.3);
    const crackle = on ? vol * (0.25 + 0.35 * Math.random()) * (f.mach < 1.2 ? 1 : 0.4) : 0;
    snd.cg.gain.setTargetAtTime(crackle * 0.35, tt, 0.05);
  }
  function sfx(kind) {
    if (!AC || !soundOn) return;
    const tt = AC.currentTime;
    const o = AC.createOscillator(), g = AC.createGain();
    if (kind === 'blip') { o.type = 'sine'; o.frequency.value = 1320; g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.07, tt + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.14); }
    else { o.type = 'sine'; o.frequency.setValueAtTime(90, tt); o.frequency.exponentialRampToValueAtTime(38, tt + 0.5); g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.35, tt + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.7); }
    o.connect(g).connect(snd.master); o.start(tt); o.stop(tt + 0.8);
  }
  $('btnSound').addEventListener('click', () => {
    initAudio(); soundOn = !soundOn;
    if (AC && AC.state === 'suspended') AC.resume();
    $('btnSound').classList.toggle('on', soundOn); $('btnSound').setAttribute('aria-pressed', String(soundOn));
    $('sndWave').setAttribute('opacity', soundOn ? '1' : '0.35');
  });

  // ---------- Управление ----------
  function setWarp(v) { warp = v; for (const b of document.querySelectorAll('.warp')) b.classList.toggle('on', +b.dataset.warp === v); }
  for (const b of document.querySelectorAll('.warp')) b.addEventListener('click', () => setWarp(+b.dataset.warp));
  function setCam(v) { camMode = v; for (const b of document.querySelectorAll('.cam')) b.classList.toggle('on', b.dataset.cam === v); }
  for (const b of document.querySelectorAll('.cam')) b.addEventListener('click', () => setCam(b.dataset.cam));
  function setPaused(p) {
    paused = p;
    $('btnPause').innerHTML = p
      ? '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M4 2.5v11l9-5.5z"/></svg>'
      : '<svg viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="2" width="3.5" height="12" rx="1"/><rect x="9.5" y="2" width="3.5" height="12" rx="1"/></svg>';
    $('btnPause').setAttribute('aria-label', p ? 'Продолжить' : 'Пауза');
  }
  $('btnPause').addEventListener('click', () => setPaused(!paused));
  $('btnRestart').addEventListener('click', () => newFlight(true));

  const held = {};
  function manualInput(dt) {
    if (settings.mode !== 'manual' || !flight) return;
    const f = flight;
    if (held.left) f.userPitch = clamp(f.userPitch - 12 * dt, -10, 90);
    if (held.right) f.userPitch = clamp(f.userPitch + 12 * dt, -10, 90);
    if (held.up) f.userThrottle = clamp(f.userThrottle + 0.6 * dt, 0.4, 1);
    if (held.down) f.userThrottle = clamp(f.userThrottle - 0.6 * dt, 0.4, 1);
  }
  const keyMap = { ArrowLeft: 'left', a: 'left', ф: 'left', ArrowRight: 'right', d: 'right', в: 'right', ArrowUp: 'up', w: 'up', ц: 'up', ArrowDown: 'down', s: 'down', ы: 'down' };
  window.addEventListener('keydown', (e) => {
    if (!$('settings').hidden) { if (e.key === 'Escape') closeSettings(); return; }
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (settings.mode === 'manual' && keyMap[k]) { held[keyMap[k]] = true; e.preventDefault(); return; }
    if (k === 'p' || k === 'з' || k === ' ') { setPaused(!paused); e.preventDefault(); }
    else if (k === 'r' || k === 'к') newFlight(true);
    else if (k === 'x' || k === 'ч') { if (flight.stage === 2) flight.userCut = true; }
    else if (k === '1' || k === '2' || k === '3' || k === '4') setWarp([1, 4, 16, 64][+k - 1]);
    else if (k === 'c' || k === 'с') setCam(camMode === 'auto' ? 'close' : camMode === 'close' ? 'wide' : 'auto');
    else if ((k === 's' || k === 'ы') && settings.mode !== 'manual') openSettings();
  });
  window.addEventListener('keyup', (e) => { const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; if (keyMap[k]) held[keyMap[k]] = false; });
  const hold = (id, key) => {
    const el = $(id);
    el.addEventListener('pointerdown', (e) => { held[key] = true; el.setPointerCapture(e.pointerId); });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ev, () => { held[key] = false; });
  };
  hold('pDown', 'left'); hold('pUp', 'right');
  $('cutBtn').addEventListener('click', () => { if (flight.stage === 2) flight.userCut = true; });

  // ---------- Настройки ----------
  let draft = null;
  function syncSheet() {
    for (const grp of document.querySelectorAll('[data-set]')) {
      const key = grp.dataset.set;
      for (const b of grp.querySelectorAll('.chip')) b.classList.toggle('on', b.dataset.v === draft[key]);
    }
    const setR = (id, val, min, max) => { const el = $(id); el.value = val; el.style.setProperty('--p', `${((val - min) / (max - min) * 100).toFixed(1)}%`); };
    setR('inPayload', draft.payload, 1, 22); $('vPayload').textContent = `${fmt1(draft.payload)} т`;
    setR('inTarget', draft.target, 160, 600); $('vTarget').textContent = `${fmtInt(draft.target)} км`;
    setR('inKick', draft.kick, 3, 8); $('vKick').textContent = `${fmt1(draft.kick)}°`;
    setR('inQ', draft.q, 20, 45); $('vQ').textContent = `${fmtInt(draft.q)} кПа`;
  }
  function openSettings() { draft = Object.assign({}, settings); syncSheet(); $('settings').hidden = false; setTimeout(() => $('setGo').focus(), 50); }
  function closeSettings() { $('settings').hidden = true; }
  $('btnSettings').addEventListener('click', openSettings);
  $('setCancel').addEventListener('click', closeSettings);
  $('settings').addEventListener('click', (e) => { if (e.target === $('settings')) closeSettings(); });
  for (const grp of document.querySelectorAll('[data-set]')) grp.addEventListener('click', (e) => { const b = e.target.closest('.chip'); if (!b) return; draft[grp.dataset.set] = b.dataset.v; syncSheet(); });
  for (const [id, key] of [['inPayload', 'payload'], ['inTarget', 'target'], ['inKick', 'kick'], ['inQ', 'q']]) $(id).addEventListener('input', (e) => { draft[key] = +e.target.value; syncSheet(); });
  $('setGo').addEventListener('click', () => { Object.assign(settings, draft); saveSettings(); closeSettings(); newFlight(true); });

  // ---------- Главный цикл ----------
  const DT = 0.05;
  function frame(now) {
    const realDt = Math.min(0.1, Math.max(0, (now - lastNow) / 1000)); lastNow = now;
    if (!document.hidden) {
      manualInput(realDt);
      let simDt = 0;
      if (!paused) {
        simAcc += realDt * warp;
        let n = 0;
        while (simAcc >= DT && n < 160) { flight.update(DT); simAcc -= DT; n++; simDt += DT; processEvents(); if (flight.t >= 0) { sampleTrailFromSim(); } }
        if (n >= 160) simAcc = 0;
      }
      emitSmoke(simDt); stepSmoke(simDt);
      animT += realDt;
      render(realDt);
      if (now - lastUi > 90) { lastUi = now; updateUi(); drawTimeline(); drawOrbit(); drawDial(); maybeResult(); updateAudio(); }
      if (now - lastChart > 400 || dirty.charts) { lastChart = now; dirty.charts = false; drawCharts(); }
    }
    requestAnimationFrame(frame);
  }
  function sampleTrailFromSim() {
    const f = flight;
    const g = inertialToGround(f.x, f.y);
    const off = f.hasS1 ? 0 : 41;
    V.d = g[0] + Math.cos(f.pitch * DEG) * off;
    V.hb = g[1] + PAD + Math.sin(f.pitch * DEG) * off;
    sampleTrail();
  }

  // Отладочный хук для проверки: быстро прокрутить полёт вперёд
  window.__gravityTurn = {
    advance(sec) { const n = Math.round(sec / DT); for (let i = 0; i < n; i++) { flight.update(DT); processEvents(); if (flight.t >= 0) sampleTrailFromSim(); } CAM.s = 0; CAM.cOff = flight.hasS1 ? 36 : 15; return flight.t; },
    state() { return { t: flight.t, h: flight.alt(), phase: flight.phase, stage: flight.stage }; },
  };

  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => { lastNow = performance.now(); if (AC) (document.hidden ? AC.suspend() : soundOn && AC.resume()); });
  resize();
  newFlight(false);
  requestAnimationFrame((t) => { lastNow = t; frame(t); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { dirty.charts = true; });
})();
