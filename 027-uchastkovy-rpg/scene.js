/* ================================================================
   Участковый · сцена
   Изометрическая ортокамера, свет по времени суток, анимация жителей,
   выбор мышью, подписи мест, эффекты и настоящий трёхмерный d20.
   three.js приходит из модуля в index.html событием 'three-ready'.
   ================================================================ */
window.U = window.U || {};

U.Scene = (function () {
  'use strict';
  let T, renderer, scene, camera, town, canvas, sky, labelsEl, diceCap;
  const api = { ok: false, onPick: null, free: { x: 0, y: 0, w: 1, h: 1 } };
  const ISO = { x: 1, y: 0.9, z: 1 };
  const view = { x: -1, z: -1, zoom: 1 }, want = { x: -1, z: -1, zoom: 1 };
  let W = 1, H = 1, dpr = 1, clockT = 0, last = 0, running = true;
  let dayMin = 17 * 60 + 30, dayWant = dayMin;
  let shake = 0, drunk = 0, speakingId = null, speakingHead = null;
  const thinking = new Set();
  const particles = [];
  const tweens = [];
  let sun, hemi, amb, MOON_C, glowMat, poolMat;
  const billboards = [];
  let lastShadowMin = -999, shadowT = 0;
  const tags = {};
  let diceScene, diceCam, die, dieState = null;
  let mystery = null, mysteryKind = null, flying = false, mortarHome = null;
  const FACE_UP = [];

  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  // ---------- палитра суток ----------
  const KEYS = [
    // минуты, солнце(цвет, сила), небо полусферы, земля полусферы, сила полусферы, фон сверху, фон снизу, ночь 0..1
    [0, '#9DB4FF', 0.0, '#2B3B6E', '#14131C', 0.75, '#0C1020', '#1C2440', 1],
    [5 * 60, '#9DB4FF', 0.0, '#2B3B6E', '#14131C', 0.75, '#0E1226', '#262B4A', 1],
    [6 * 60 + 30, '#FFB08A', 1.3, '#9FAECF', '#4A3B35', 0.9, '#6E7FA6', '#E8B48E', 0.35],
    [8 * 60, '#FFE2B8', 2.4, '#CFDDEB', '#6B5B45', 1.05, '#9DB7C6', '#EBDDBE', 0],
    [13 * 60, '#FFF1DA', 2.7, '#DCE7EE', '#6B5B45', 1.1, '#A9C2CC', '#EFE3C6', 0],
    [17 * 60, '#FFD7A0', 2.5, '#E6D9C4', '#6B5140', 1.0, '#C8B79A', '#F2D3A0', 0],
    [18 * 60 + 40, '#FF9A5C', 1.8, '#D7A98A', '#553C33', 0.85, '#9C7E8C', '#F0A56A', 0.15],
    [20 * 60, '#FF7A4A', 0.35, '#5B5A86', '#2A2230', 0.7, '#3A3A62', '#8A5E6E', 0.7],
    [21 * 60 + 30, '#9DB4FF', 0.0, '#2E3F72', '#15141D', 0.75, '#11152A', '#2A2F52', 1],
    [24 * 60, '#9DB4FF', 0.0, '#2B3B6E', '#14131C', 0.75, '#0C1020', '#1C2440', 1],
  ];
  function palette(m) {
    m = ((m % 1440) + 1440) % 1440;
    let i = 0;
    while (i < KEYS.length - 2 && KEYS[i + 1][0] <= m) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    const t = (m - a[0]) / Math.max(1, b[0] - a[0]);
    const c = (x, y) => new T.Color(x).lerp(new T.Color(y), t);
    return { sun: c(a[1], b[1]), sunI: lerp(a[2], b[2], t), sky: c(a[3], b[3]), ground: c(a[4], b[4]), hemiI: lerp(a[5], b[5], t), top: c(a[6], b[6]), bot: c(a[7], b[7]), night: lerp(a[8], b[8], t) };
  }

  // ---------- фон: градиент и звёзды на 2D-холсте ----------
  const stars = Array.from({ length: 140 }, (_, i) => [((i * 7919) % 1000) / 1000, ((i * 104729) % 1000) / 1000, 0.3 + ((i * 31) % 10) / 14]);
  function paintSky(p) {
    const g = sky.getContext('2d');
    const w = sky.width, h = sky.height;
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#' + p.top.getHexString());
    gr.addColorStop(1, '#' + p.bot.getHexString());
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    if (p.night > 0.05) {
      g.fillStyle = '#FFF6E0';
      for (const [x, y, s] of stars) { g.globalAlpha = p.night * s * 0.9; g.fillRect(x * w, y * h * 0.8, 1.6 * dpr, 1.6 * dpr); }
      g.globalAlpha = p.night;
      const mx = w * 0.12, my = h * 0.16, r = 26 * dpr;
      const mg = g.createRadialGradient(mx, my, r * 0.6, mx, my, r * 3);
      mg.addColorStop(0, 'rgba(255,240,200,.25)'); mg.addColorStop(1, 'rgba(255,240,200,0)');
      g.fillStyle = mg; g.fillRect(mx - r * 3, my - r * 3, r * 6, r * 6);
      g.fillStyle = '#F4EBD0'; g.beginPath(); g.arc(mx, my, r, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(0,0,0,.08)'; g.beginPath(); g.arc(mx - r * 0.3, my - r * 0.2, r * 0.25, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;
    }
    // виньетка
    const vg = g.createRadialGradient(w * 0.42, h * 0.5, Math.min(w, h) * 0.3, w * 0.42, h * 0.5, Math.max(w, h) * 0.8);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(10,8,14,.35)');
    g.fillStyle = vg; g.fillRect(0, 0, w, h);
  }

  // ---------- освещение ----------
  function applyTime(m, force) {
    const p = palette(m);
    const hour = (((m % 1440) + 1440) % 1440) / 60;
    // солнце ходит с востока (+x) на запад (−z), ночью светит луна
    const s = clamp((hour - 6) / 13, 0, 1);
    const az = lerp(-0.2, 3.3, s), el = Math.max(0.12, Math.sin(Math.PI * s)) * 0.9 + 0.25;
    // один направленный свет: днём солнце, ночью луна (голубая, слабая, с тенями)
    sun.position.set(lerp(Math.cos(az) * 40, -30, p.night), lerp(20 + el * 40, 50, p.night), lerp(Math.sin(az) * 40 + 12, 20, p.night));
    sun.color.copy(p.sun).lerp(MOON_C, p.night); sun.intensity = Math.max(p.sunI, p.night * 0.75);
    hemi.color.copy(p.sky); hemi.groundColor.copy(p.ground); hemi.intensity = p.hemiI;
    amb.intensity = 0.15 + p.night * 0.1;
    // окна, лампы, вывески
    town.windowMat.emissiveIntensity = p.night * 1.4;
    if (town.glass) town.glass.emissiveIntensity = p.night * 0.8;
    if (town.cross) town.cross.emissiveIntensity = 0.05 + p.night * 1.6;
    glowMat.opacity = p.night * 0.85; poolMat.opacity = p.night * 0.55;
    if (town.bulbMat) town.bulbMat.emissiveIntensity = p.night * 1.3;
    town.water.material.emissiveIntensity = 0.25 + p.night * 0.5;
    api.night = p.night;
    if (force || Math.abs(m - lastShadowMin) > 6) {
      lastShadowMin = m;
      renderer.shadowMap.needsUpdate = true;
      paintSky(p);
    }
  }

  // ---------- размеры и камера ----------
  function resize() {
    if (!renderer) return;
    W = window.innerWidth; H = window.innerHeight;
    dpr = window.__SHOT__ ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(W, H, false);
    sky.width = Math.round(W * dpr); sky.height = Math.round(H * dpr);
    lastShadowMin = -999;
    applyTime(dayMin, true);
  }
  function unitsPerPx() {
    const f = api.free;
    const k = Math.max(74 / Math.max(200, f.w), 50 / Math.max(160, f.h));
    return k / view.zoom;
  }
  function updateCamera() {
    const k = unitsPerPx();
    const f = api.free;
    const fx = f.x + f.w / 2, fy = f.y + f.h / 2;
    camera.left = -fx * k; camera.right = (W - fx) * k;
    camera.top = fy * k; camera.bottom = -(H - fy) * k;
    const len = 120;
    const n = Math.hypot(ISO.x, ISO.y, ISO.z);
    let tx = view.x, tz = view.z;
    if (drunk > 0) { tx += Math.sin(clockT * 0.9) * drunk * 1.2; tz += Math.cos(clockT * 0.7) * drunk * 0.9; }
    if (shake > 0) { tx += (Math.random() - 0.5) * shake; tz += (Math.random() - 0.5) * shake; }
    camera.position.set(tx + ISO.x / n * len, ISO.y / n * len, tz + ISO.z / n * len);
    camera.lookAt(tx, 0, tz);
    if (drunk > 0) camera.rotateZ(Math.sin(clockT * 1.3) * drunk * 0.05);
    camera.near = 1; camera.far = 400;
    camera.updateProjectionMatrix();
  }
  function project(x, y, z) {
    const v = new T.Vector3(x, y, z).project(camera);
    return { x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H, vis: v.z < 1 };
  }

  // ---------- объединение статичной геометрии: меньше вызовов отрисовки ----------
  function mergeStatic(root) {
    const U2 = window.THREE_UTILS;
    if (!U2 || !U2.mergeGeometries) return;
    const buckets = new Map();
    const kill = [];
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (o.userData.dynamic) return;
      let p = o.parent, dyn = false;
      while (p) { if (p.userData.dynamic) { dyn = true; break; } p = p.parent; }
      if (dyn || !o.isMesh || Array.isArray(o.material) || !o.material.visible || o.material.map) return;
      const key = o.material.uuid + (o.castShadow ? 'c' : 'n');
      if (!buckets.has(key)) buckets.set(key, { mat: o.material, cast: o.castShadow, geos: [] });
      let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      const n = g.attributes.position.count;
      if (!g.attributes.uv) g.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(n * 2), 2));
      if (!g.attributes.color) g.setAttribute('color', new T.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
      if (!g.attributes.normal) g.computeVertexNormals();
      g.applyMatrix4(o.matrixWorld);
      buckets.get(key).geos.push(g);
      kill.push(o);
    });
    for (const o of kill) o.parent.remove(o);
    for (const b of buckets.values()) {
      const merged = U2.mergeGeometries(b.geos, false);
      if (!merged) continue;
      const m = new T.Mesh(merged, b.mat);
      m.castShadow = b.cast; m.receiveShadow = true;
      root.add(m);
    }
  }

  // ---------- кубик d20 ----------
  function buildDice() {
    diceScene = new T.Scene();
    diceCam = new T.OrthographicCamera(-1.6, 1.6, 1.6, -1.6, 0.1, 20);
    diceCam.position.set(0, 0, 8);
    diceScene.add(new T.HemisphereLight('#FFF6E4', '#5B4A3A', 1.6));
    const dl = new T.DirectionalLight('#FFFFFF', 2.2); dl.position.set(-2, 3, 5); diceScene.add(dl);
    const geo = new T.IcosahedronGeometry(1.15, 0);
    // атлас с числами 1–20: 5 × 4 ячеек
    const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 1024;
    const g = cv.getContext('2d');
    const uv = geo.attributes.uv, pos = geo.attributes.position;
    const drawAtlas = () => {
      g.fillStyle = '#EDE3CB'; g.fillRect(0, 0, 1280, 1024);
      for (let i = 0; i < 20; i++) {
        const cx = (i % 5) * 256, cy = Math.floor(i / 5) * 256;
        g.fillStyle = i === 19 ? '#B4372B' : i === 0 ? '#3C3833' : '#EDE3CB';
        g.beginPath(); g.moveTo(cx + 128, cy + 20); g.lineTo(cx + 12, cy + 222); g.lineTo(cx + 244, cy + 222); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(60,45,30,.35)'; g.lineWidth = 6; g.stroke();
        g.fillStyle = i === 19 || i === 0 ? '#F4ECD8' : '#1D1A16';
        g.font = '700 ' + (i >= 9 ? 84 : 96) + 'px "Golos Text", system-ui, sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(String(i + 1), cx + 128, cy + 150);
        if (i === 5 || i === 8) { g.fillRect(cx + 100, cy + 196, 56, 7); }
      }
      if (die) die.material.map.needsUpdate = true;
    };
    for (let f = 0; f < 20; f++) {
      const cx = (f % 5) / 5, cyTop = 1 - Math.floor(f / 5) / 4;
      const cw = 1 / 5, ch = 1 / 4;
      uv.setXY(f * 3 + 0, cx + cw * 0.5, cyTop - ch * (20 / 256));
      uv.setXY(f * 3 + 1, cx + cw * (12 / 256), cyTop - ch * (222 / 256));
      uv.setXY(f * 3 + 2, cx + cw * (244 / 256), cyTop - ch * (222 / 256));
      // ориентация грани: нормаль и направление «вверх» (к вершине 0)
      const a = new T.Vector3().fromBufferAttribute(pos, f * 3), b = new T.Vector3().fromBufferAttribute(pos, f * 3 + 1), c = new T.Vector3().fromBufferAttribute(pos, f * 3 + 2);
      const cen = a.clone().add(b).add(c).divideScalar(3);
      const n = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
      const up = a.clone().sub(cen).normalize();
      const right = up.clone().cross(n).normalize();
      const mtx = new T.Matrix4().makeBasis(right, up, n);
      FACE_UP[f] = new T.Quaternion().setFromRotationMatrix(mtx).invert();
    }
    uv.needsUpdate = true;
    const tex = new T.CanvasTexture(cv); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 4;
    die = new T.Mesh(geo, new T.MeshLambertMaterial({ map: tex, flatShading: true }));
    die.visible = false;
    diceScene.add(die);
    drawAtlas();
    api._redrawDice = drawAtlas;
  }
  // квадрат кубика внизу свободной области; под ним остаётся место для подписи (~36 px)
  function dieRect() {
    const f = api.free;
    const s = Math.round(clamp(Math.min(f.w, f.h) * 0.3, 110, 210));
    return { x: Math.round(f.x + f.w / 2 - s / 2), y: Math.round(f.y + f.h - s - 40 - clamp(f.h * 0.05, 4, 40)), s };
  }
  api.hideDice = function () {
    if (!api.ok) return;
    if (dieState && dieState.resolve && !dieState.done) dieState.resolve();
    dieState = null; die.visible = false; diceCap.className = 'dice-cap';
  };
  // Бросок: кубик кувыркается и ложится гранью с результатом к камере
  api.roll = function (r) {
    return new Promise((resolve) => {
      if (!api.ok) { resolve(); return; }
      const axis = new T.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      dieState = { t0: clockT - (r.hold ? 1.2 : 0), axis, spin: 22 + Math.random() * 8, target: FACE_UP[r.d - 1], from: new T.Quaternion().setFromEuler(new T.Euler(Math.random() * 6, Math.random() * 6, 0)), done: false, resolve, r };
      die.visible = true;
      diceCap.className = 'dice-cap on';
      diceCap.innerHTML = `<b>${r.sk}</b><span>сложность ${r.dc}</span>`;
    });
  };
  function stepDice() {
    if (!dieState) return;
    const st = dieState, t = clockT - st.t0;
    const T1 = 1.15, T2 = 3.6;
    if (t < T1) {
      const k = 1 - t / T1;
      const q = new T.Quaternion().setFromAxisAngle(st.axis, st.spin * (1 - k * k) * 0.35 + t * st.spin * k * 0.2);
      const q2 = st.from.clone().multiply(q);
      const blend = clamp((t - 0.7) / 0.45, 0, 1);
      die.quaternion.copy(q2).slerp(st.target, ease(blend));
      const hop = Math.abs(Math.sin(t * 9)) * (1 - t / T1) * 0.5;
      die.position.set(0, hop - 0.1, 0);
      die.scale.setScalar(0.7 + 0.3 * Math.min(1, t * 3));
    } else {
      die.quaternion.copy(st.target);
      const land = t - T1;
      die.position.set(0, 0, 0);
      die.scale.setScalar(1 + Math.max(0, 0.12 - land * 0.4) * Math.sin(land * 30));
      if (!st.done) {
        st.done = true;
        const r = st.r;
        const mods = r.mods.map((m) => `${m.v >= 0 ? '+' : '−'}${Math.abs(m.v)}`).join(' ');
        diceCap.innerHTML = `<b>${r.d}</b> <span>${mods} = ${r.total}</span> <em class="${r.ok ? 'ok' : 'no'}">${r.ok ? (r.d === 20 ? 'крит!' : 'успех') : (r.d === 1 ? 'провал!' : 'неудача')}</em>`;
        st.resolve();
      }
      if (t > T2 && !st.r.hold) {
        const k = clamp((t - T2) / 0.35, 0, 1);
        die.scale.setScalar(1 - ease(k));
        if (k >= 1) { die.visible = false; dieState = null; diceCap.className = 'dice-cap'; }
      }
    }
  }

  // ---------- жители и игрок ----------
  const charPos = {};
  function placeChar(id, loc, instant) {
    const c = town.chars[id];
    if (!c) return;
    const spot = loc && U.Town.SPOTS[id] && U.Town.SPOTS[id][loc];
    const key = spot ? loc : null;
    if (charPos[id] === key && !instant) return;
    const prev = charPos[id];
    charPos[id] = key;
    if (!spot) { c.g.visible = false; return; }
    if (id === 'emelya' && prev && !instant && prev !== key) { drive(c, spot); return; }
    const put = () => { c.g.position.set(spot[0], id === 'vodyanoy' ? -0.35 : 0, spot[1]); c.g.visible = true; };
    if (instant || !c.g.visible) { put(); c.g.scale.setScalar(1); if (!instant) popIn(c.g); return; }
    tweens.push({ t0: clockT, d: 0.35, f: (k) => c.g.scale.setScalar(1 - k), end: () => { put(); popIn(c.g); } });
  }
  function popIn(g) { tweens.push({ t0: clockT, d: 0.4, f: (k) => g.scale.setScalar(ease(k)) }); }
  function pathVia(from, to) {
    const pts = [[from[0], from[1]]];
    if (Math.hypot(from[0], from[1]) > 4 && Math.hypot(to[0], to[1]) > 4) pts.push([0.6, 1.2]);
    pts.push([to[0], to[1]]);
    return pts;
  }
  function walkAlong(obj, pts, speed, onStep) {
    return new Promise((resolve) => {
      let len = 0; const segs = [];
      for (let i = 0; i < pts.length - 1; i++) { const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); segs.push(l); len += l; }
      const dur = Math.max(0.4, len / speed);
      tweens.push({
        t0: clockT, d: dur, walk: true,
        f: (k) => {
          let d = ease(k) * len, i = 0;
          while (i < segs.length - 1 && d > segs[i]) { d -= segs[i]; i++; }
          const a = pts[i], b = pts[i + 1], t = segs[i] ? d / segs[i] : 1;
          obj.position.x = lerp(a[0], b[0], t); obj.position.z = lerp(a[1], b[1], t);
          obj.rotation.y = Math.atan2(b[0] - a[0], b[1] - a[1]);
          if (onStep) onStep(k);
        },
        end: resolve,
      });
    });
  }
  function drive(c, spot) {
    const from = [c.g.position.x, c.g.position.z];
    c.g.visible = true;
    walkAlong(c.g, pathVia(from, spot), 4.5).then(() => { c.g.rotation.y = Math.PI / 4; });
  }
  api.placeAll = function (where, instant) {
    if (!api.ok) return;
    for (const id in town.chars) placeChar(id, where[id], instant);
  };
  api.setPlayer = function (loc, instant) {
    const p = U.Town.P[loc];
    if (!p || !api.ok) return Promise.resolve();
    const g = town.player.g;
    api.playerLoc = loc;
    if (instant) { g.position.set(p.stand[0], 0, p.stand[1]); g.rotation.y = Math.PI / 4; return Promise.resolve(); }
    return walkAlong(g, pathVia([g.position.x, g.position.z], p.stand), 7.5).then(() => { g.rotation.y = Math.PI / 4; });
  };

  // ---------- камера: обзор, место, собеседник ----------
  api.focus = function (what, instant) {
    if (!api.ok) return;
    const mobile = api.free.w < 700;
    if (what === 'overview') { want.x = -1; want.z = -1; want.zoom = mobile ? 1.15 : 1; }
    else if (what.loc) { const p = U.Town.P[what.loc]; want.x = p.x * 0.55 + p.stand[0] * 0.45; want.z = p.z * 0.55 + p.stand[1] * 0.45; want.zoom = mobile ? 2.2 : 1.9; }
    else if (what.char) {
      const c = what.char === 'player' ? town.player : town.chars[what.char];
      if (!c) return;
      const pl = town.player.g.position;
      want.x = c.g.position.x * 0.62 + pl.x * 0.38; want.z = c.g.position.z * 0.62 + pl.z * 0.38; want.zoom = what.zoom || (mobile ? 3.2 : 2.9);
    }
    if (instant) Object.assign(view, want);
  };

  // ---------- говорит / думает ----------
  api.speaking = function (id, head) { speakingId = id; speakingHead = head || null; };
  api.thinking = function (id, on) { if (on) thinking.add(id); else thinking.delete(id); };
  api.setDrunk = function (v) { drunk = clamp(v, 0, 1); };
  // ночные тайны: огонёк там, где виновный тайком занят своим делом
  api.setNight = function (kind, fly) {
    if (!api.ok) return;
    mysteryKind = kind || null;
    mystery.visible = !!kind;
    const col = { yaga: '#8CFFB0', leshy: '#FFD27A', vodyanoy: '#7CFFC8', emelya: '#FF9A4A' }[kind] || '#FFFFFF';
    mystery.material.color.set(col);
    flying = !!fly;
    town.mortar.userData.rider.visible = flying;
    if (!flying && mortarHome) { town.mortar.position.copy(mortarHome); town.mortar.rotation.set(0, 0, 0); }
  };
  function mysteryPos() {
    const v = new T.Vector3();
    if (mysteryKind === 'yaga') return town.hut.house.localToWorld(v.set(-0.7, 1.35, 1.8));
    if (mysteryKind === 'leshy') return v.set(-0.7, 2.1, -19.4);
    if (mysteryKind === 'vodyanoy') return v.set(-14.8, 0.35, 10.9);
    if (mysteryKind === 'emelya') { const e = town.chars.emelya.g.position; return v.set(e.x, 0.6, e.z + 1.3); }
    return v;
  }
  api.setTime = function (minutes, instant) {
    dayWant = minutes;
    if (instant || !api.ok) { dayMin = minutes; if (api.ok) applyTime(dayMin, true); }
  };

  // ---------- эффекты ----------
  // дым и брызги: непрозрачные клубки, которые растут и тают масштабом (без прозрачности —
  // та же шейдерная программа, что у всего посёлка)
  const puffGeo = {};
  let fireMat = null;
  function puff(x, y, z, o = {}) {
    let p = particles.find((q) => !q.alive);
    if (!p) {
      if (particles.length > 90) return;
      const m = U.Town.mesh(new T.IcosahedronGeometry(0.3, 0), '#E4DED4');
      m.castShadow = false;
      scene.add(m); p = { m }; particles.push(p);
    }
    p.alive = true; p.t = 0; p.life = o.life || 3.2;
    p.vx = o.vx ?? (Math.random() - 0.5) * 0.15; p.vy = o.vy ?? 0.55; p.vz = o.vz ?? (Math.random() - 0.5) * 0.15;
    p.g = o.g || 0; p.grow = o.grow ?? 1.6; p.s0 = o.s || 0.5;
    const col = o.color || '#E4DED4';
    if (!puffGeo[col]) puffGeo[col] = U.Town.mesh(new T.IcosahedronGeometry(0.3, 0), col).geometry;
    p.m.geometry = puffGeo[col];
    if (o.emissive && !fireMat) fireMat = U.Town.special('#FF8A3C', { emissive: '#FF6A1A', emissiveIntensity: 1 });
    p.m.material = o.emissive ? fireMat : U.Town.vc();
    p.m.position.set(x, y, z); p.m.visible = true;
  }
  function stepParticles(dt) {
    for (const p of particles) {
      if (!p.alive) continue;
      p.t += dt;
      const k = p.t / p.life;
      if (k >= 1) { p.alive = false; p.m.visible = false; continue; }
      p.vy -= p.g * dt;
      p.m.position.x += p.vx * dt + Math.sin(clockT + p.m.id) * 0.004;
      p.m.position.y += p.vy * dt; p.m.position.z += p.vz * dt;
      const fade = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      p.m.scale.setScalar(p.s0 * (0.4 + Math.min(1, k * 5) * 0.6) * (1 + k * p.grow) * fade);
    }
  }
  api.fx = function (name) {
    if (!api.ok) return;
    const ch = town.chars;
    if (name === 'hut_turn') {
      const h = town.hut.g, r0 = h.rotation.y;
      tweens.push({ t0: clockT, d: 2.2, f: (k) => { h.rotation.y = r0 + ease(k) * Math.PI * 2; h.userData.fast = k < 1; }, end: () => { h.userData.fast = false; } });
    } else if (name === 'fire') {
      const hd = ch.gorynych.heads[1].head;
      const wp = new T.Vector3(); hd.getWorldPosition(wp);
      for (let i = 0; i < 26; i++) setTimeout(() => puff(wp.x + 0.4, wp.y - 0.1, wp.z + 0.4, { vx: 2.2 + Math.random(), vz: 2.2 + Math.random(), vy: 0.3 + Math.random() * 0.4, color: i % 3 ? '#FF8A3C' : '#FFD25A', emissive: '#FF6A1A', life: 0.9, s: 0.35, grow: 2.2 }), i * 22);
      shake = 0.35;
    } else if (name === 'splash') {
      const v = ch.vodyanoy.g.position;
      for (let i = 0; i < 30; i++) puff(v.x + (Math.random() - 0.5), 0.3, v.z + (Math.random() - 0.5), { vx: (Math.random() - 0.5) * 3, vz: (Math.random() - 0.5) * 3, vy: 3 + Math.random() * 2, g: 9, color: '#9FD3D6', life: 1.1, s: 0.22, grow: 0.3 });
    } else if (name === 'smoke') {
      const p = U.Town.P[api.playerLoc || 'square'];
      for (let i = 0; i < 14; i++) puff(p.x + (Math.random() - 0.5) * 3, 1 + Math.random(), p.z + (Math.random() - 0.5) * 3, { vy: 0.8, life: 3, s: 0.8, grow: 2 });
    } else if (name === 'horn') {
      const tr = town.truck;
      tweens.push({ t0: clockT, d: 0.9, f: (k) => { tr.position.y = Math.abs(Math.sin(k * Math.PI * 4)) * 0.25 * (1 - k); } });
    } else if (name === 'crows') {
      crows.forEach((c, i) => { c.fly = clockT + i * 0.12; });
    } else if (name === 'shake') {
      shake = 0.6;
    } else if (name === 'stove') {
      const g = ch.emelya.body;
      tweens.push({ t0: clockT, d: 0.8, f: (k) => { g.position.y = Math.abs(Math.sin(k * Math.PI * 3)) * 0.5 * (1 - k); } });
      const e = ch.emelya.g.position;
      for (let i = 0; i < 8; i++) puff(e.x - 0.5, 2.4, e.z - 0.7, { vy: 1.4, life: 2, s: 0.5 });
    }
  };

  // вороны на проводах
  const crows = [];
  function buildCrows() {
    const per = town.wirePerch;
    for (let i = 0; i < 4; i++) {
      const g = new T.Group();
      const b = U.Town.mesh(new T.IcosahedronGeometry(0.16, 0), '#1E1C1F');
      b.scale.set(1, 0.9, 1.5); g.add(b);
      const h = U.Town.mesh(new T.IcosahedronGeometry(0.1, 0), '#1E1C1F'); h.position.set(0, 0.12, 0.16); g.add(h);
      const bk = U.Town.mesh(new T.ConeGeometry(0.03, 0.1, 4), '#3A3530'); bk.rotation.x = Math.PI / 2; bk.position.set(0, 0.12, 0.28); g.add(bk);
      g.position.set(per.x + i * 0.9 - 1.4, per.y - Math.sin(Math.PI * (0.35 + i * 0.1)) * 0.55 + 0.12, per.z + (i % 2 ? 0.6 : -0.6));
      g.userData.home = g.position.clone();
      g.rotation.y = Math.PI / 4 + (i - 1.5) * 0.3;
      scene.add(g); crows.push({ g, fly: 0 });
    }
  }
  function stepCrows() {
    for (const c of crows) {
      if (!c.fly) continue;
      const t = clockT - c.fly;
      if (t < 0) continue;
      const home = c.g.userData.home;
      if (t < 6) {
        const a = t * 1.3;
        c.g.position.set(home.x + Math.sin(a) * 6 * Math.min(1, t), home.y + Math.min(t, 1.5) * 3 + Math.sin(a * 2) * 0.5, home.z + (1 - Math.cos(a)) * 5 * Math.min(1, t));
        c.g.rotation.y = a + Math.PI / 2;
      } else if (t < 7.5) {
        const k = (t - 6) / 1.5;
        c.g.position.lerp(home, k);
      } else { c.g.position.copy(home); c.fly = 0; }
    }
  }

  // ---------- подписи мест и жителей ----------
  function buildLabels() {
    for (const id in U.Town.P) {
      const b = document.createElement('button');
      b.className = 'loc-tag'; b.type = 'button'; b.dataset.loc = id;
      b.innerHTML = `<span>${U.DATA.LOCS[id].short}</span>`;
      b.addEventListener('click', (e) => { e.stopPropagation(); api.onPick && api.onPick({ type: 'loc', id }); });
      labelsEl.appendChild(b);
      tags['loc:' + id] = b;
    }
    for (const id in town.chars) {
      const d = document.createElement('div');
      d.className = 'char-tag';
      d.innerHTML = `<span class="nm">${U.DATA.CHARS[id].name}</span><span class="dots"><i></i><i></i><i></i></span>`;
      labelsEl.appendChild(d);
      tags['char:' + id] = d;
    }
  }
  api.avoid = [];
  function hidden(x, y, hw, h) {
    if (x < -20 || y < 0 || x > W + 20 || y > H) return true;
    for (const r of api.avoid) if (x + hw > r.left && x - hw < r.right && y > r.top && y - h < r.bottom) return true;
    return false;
  }
  function stepLabels() {
    const cur = api.playerLoc;
    const zoomed = view.zoom > 1.6;
    for (const id in U.Town.P) {
      const el = tags['loc:' + id];
      const lp = U.Town.P[id].label;
      const s = project(lp[0], lp[1], lp[2]);
      const hw = (el.offsetWidth || 90) / 2;
      const lx = clamp(s.x, hw + 6, W - hw - 6);
      el.style.transform = `translate(${lx.toFixed(1)}px, ${s.y.toFixed(1)}px) translate(-50%, -100%)`;
      el.classList.toggle('here', id === cur);
      el.classList.toggle('dim', zoomed && id !== cur);
      el.classList.toggle('gone', hidden(s.x, s.y, 70, 34));
    }
    for (const id in town.chars) {
      const el = tags['char:' + id];
      const c = town.chars[id];
      const show = c.g.visible && (charPos[id] === cur || thinking.has(id));
      if (!show) { el.classList.remove('on'); continue; }
      const top = id === 'gorynych' ? 4.4 : id === 'vodyanoy' ? 1.8 : id === 'koschei' || id === 'leshy' ? 2.8 : id === 'emelya' ? 2.6 : 2.1;
      const s = project(c.g.position.x, top, c.g.position.z);
      el.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) translate(-50%, -100%)`;
      el.classList.toggle('on', !hidden(s.x, s.y, 50, 26));
      el.classList.toggle('think', thinking.has(id));
      el.classList.toggle('talk', speakingId === id);
    }
  }

  // ---------- выбор мышью и управление камерой ----------
  function setupInput() {
    const ray = new T.Raycaster();
    const hits = [];
    for (const id in town.chars) hits.push(town.chars[id].g.userData.hit);
    hits.push(town.cat.g.userData.hit);
    const locBoxes = [];
    for (const id in U.Town.P) {
      const p = U.Town.P[id];
      const m = new T.Mesh(new T.BoxGeometry(id === 'square' ? 8 : 8.5, 7, id === 'square' ? 8 : 8.5), new T.MeshBasicMaterial({ visible: false }));
      m.position.set(p.x, 3.5, p.z); m.userData.loc = id; scene.add(m); locBoxes.push(m);
    }
    let down = null, pinch = null;
    const pts = new Map();
    canvas.addEventListener('pointerdown', (e) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: want.zoom }; down = null; return; }
      down = { x: e.clientX, y: e.clientY, vx: want.x, vz: want.z, moved: false };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pts.size === 2) { const [a, b] = [...pts.values()]; want.zoom = clamp(pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d, 0.8, 4); return; }
      if (!down) { hover(e); return; }
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (Math.hypot(dx, dy) > 6) down.moved = true;
      if (down.moved) {
        const k = unitsPerPx();
        // экран → плоскость земли в изометрии
        const rx = dx * k, ry = dy * k / Math.sin(Math.atan2(ISO.y, Math.hypot(ISO.x, ISO.z)));
        want.x = clamp(down.vx - (rx + ry) / Math.SQRT2, -22, 22);
        want.z = clamp(down.vz - (ry - rx) / Math.SQRT2, -22, 22);
        Object.assign(view, { x: want.x, z: want.z });
        canvas.style.cursor = 'grabbing';
      }
    });
    const up = (e) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (!down) return;
      const wasMoved = down.moved;
      down = null; canvas.style.cursor = '';
      if (wasMoved) return;
      const r = canvas.getBoundingClientRect();
      ray.setFromCamera(new T.Vector2((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      const hc = ray.intersectObjects(hits, false)[0];
      if (hc) {
        let o = hc.object; while (o && !o.userData.char) o = o.parent;
        if (o && o.visible !== false) { api.onPick && api.onPick({ type: 'char', id: o.userData.char }); return; }
      }
      const hl = ray.intersectObjects(locBoxes, false)[0];
      if (hl) api.onPick && api.onPick({ type: 'loc', id: hl.object.userData.loc });
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', (e) => { pts.delete(e.pointerId); down = null; pinch = null; });
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); want.zoom = clamp(want.zoom * Math.exp(-e.deltaY * 0.0012), 0.8, 4); }, { passive: false });
    function hover(e) {
      const r = canvas.getBoundingClientRect();
      ray.setFromCamera(new T.Vector2((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      const any = ray.intersectObjects(hits, false).length || ray.intersectObjects(locBoxes, false).length;
      canvas.style.cursor = any ? 'pointer' : 'grab';
    }
  }

  // ---------- анимация ----------
  function animateChars(dt) {
    const t = clockT;
    const ch = town.chars;
    let i = 0;
    for (const id in ch) {
      const c = ch[id]; i++;
      if (!c.g.visible) continue;
      const talking = speakingId === id;
      const think = thinking.has(id);
      const ph = i * 1.7;
      if (c.body) c.body.position.y = (id === 'emelya' ? 0 : Math.sin(t * 2 + ph) * 0.025) + (c.body.userData.hop || 0);
      if (id === 'gorynych') {
        c.heads.forEach((h, k) => {
          const me = talking && (!speakingHead || speakingHead === h.name);
          h.neck.rotation.z = h.base + Math.sin(t * 1.3 + k * 2.1) * 0.12 + (me ? Math.sin(t * 13) * 0.05 : 0);
          h.head.rotation.x = me ? Math.sin(t * 15) * 0.18 : Math.sin(t * 0.9 + k) * 0.1 + (k === 2 && !me ? 0.35 : 0);
          h.head.rotation.y = Math.sin(t * 0.7 + k * 1.3) * 0.4;
        });
        if (Math.random() < dt * 0.25) { const hd = c.heads[Math.floor(Math.random() * 3)].head; const wp = new T.Vector3(); hd.getWorldPosition(wp); puff(wp.x + 0.2, wp.y, wp.z + 0.2, { vy: 0.6, s: 0.18, life: 1.6, color: '#BDB6AC' }); }
        continue;
      }
      if (c.head) {
        c.head.rotation.y = think ? Math.sin(t * 0.8) * 0.25 + 0.3 : Math.sin(t * 0.6 + ph) * 0.3;
        c.head.rotation.x = talking ? Math.sin(t * 14) * 0.1 : think ? -0.2 : Math.sin(t * 0.8 + ph) * 0.05;
        c.head.rotation.z = think ? 0.18 : 0;
      }
      if (c.armL) c.armL.rotation.x = talking ? Math.sin(t * 5 + ph) * 0.5 : Math.sin(t * 1.2 + ph) * 0.06;
      if (c.armR) c.armR.rotation.x = talking ? -Math.sin(t * 4 + ph) * 0.4 : think ? -1.2 : -Math.sin(t * 1.2 + ph) * 0.06;
      // смотрят на участкового, если он рядом
      const pl = town.player.g.position;
      const d = Math.hypot(pl.x - c.g.position.x, pl.z - c.g.position.z);
      if (id !== 'emelya' || !tweens.some((tw) => tw.walk)) {
        const face = d < 7 ? Math.atan2(pl.x - c.g.position.x, pl.z - c.g.position.z) : Math.PI / 4;
        c.g.rotation.y += (face - c.g.rotation.y) * Math.min(1, dt * 3);
      }
    }
    // печь Емели дымит, огонь мерцает
    const em = ch.emelya;
    if (em.g.visible) {
      em.fire.material.emissiveIntensity = 0.8 + Math.sin(t * 9) * 0.2 + Math.sin(t * 13.7) * 0.12;
      if (Math.random() < dt * 1.6) { const wp = new T.Vector3(); em.stove.localToWorld(wp.set(em.chimney.x, em.chimney.y, em.chimney.z)); puff(wp.x, wp.y, wp.z, { s: 0.28, life: 2.6 }); }
    }
    // банная труба
    if (Math.random() < dt * 2.2) { const b = town.banyaChimney; puff(b.x, b.y, b.z, { s: 0.35, life: 3.4, color: '#EAE4DA' }); }
    // избушка переминается с лапы на лапу
    const hut = town.hut;
    const sp = hut.g.userData.fast ? 9 : 1.6;
    hut.legs.forEach((l, k) => {
      const s = Math.sin(t * sp + k * Math.PI);
      l.leg.position.y = 2.2 + Math.max(0, s) * 0.25;
      l.leg.rotation.x = Math.max(0, s) * 0.3;
    });
    hut.house.position.y = 2.2 + Math.abs(Math.sin(t * sp)) * 0.1;
    hut.house.rotation.z = Math.sin(t * sp) * 0.03;
    // флажки
    town.flags.forEach((f, k) => { f.rotation.y = Math.sin(t * 2.2 + k) * 0.25; });
    // кот
    town.cat.tail.rotation.z = Math.sin(t * 1.4) * 0.4;
    // игрок идёт — ноги
    const walking = tweens.some((tw) => tw.walk);
    town.player.body.position.y = walking ? Math.abs(Math.sin(t * 12)) * 0.06 : Math.sin(t * 2) * 0.02;
    town.player.armL.rotation.x = walking ? Math.sin(t * 12) * 0.6 : 0;
    town.player.armR.rotation.x = walking ? -Math.sin(t * 12) * 0.6 : 0;
  }

  // Режим съёмки: программный рендер сервера медленный, поэтому после первых кадров
  // рисуем редко, а анимации идут по реальному времени, а не по числу кадров.
  const SHOT = !!window.__SHOT__;
  let framesDone = 0, lastDraw = 0;
  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    if (SHOT && framesDone > 2 && now - lastDraw < 1200) return;
    lastDraw = now;
    const dt = SHOT ? Math.min(1.5, (now - last) / 1000 || 0.016) : Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now; clockT += dt;
    // время суток плавно догоняет игровое
    if (dayWant !== dayMin) {
      const diff = dayWant - dayMin;
      dayMin = Math.abs(diff) < 1 ? dayWant : dayMin + diff * Math.min(1, dt * 2.2);
      applyTime(dayMin, false);
    }
    // твины
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      const k = clamp((clockT - tw.t0) / tw.d, 0, 1);
      tw.f(k);
      if (k >= 1) { tweens.splice(i, 1); tw.end && tw.end(); }
    }
    view.x += (want.x - view.x) * Math.min(1, dt * 3.2);
    view.z += (want.z - view.z) * Math.min(1, dt * 3.2);
    view.zoom += (want.zoom - view.zoom) * Math.min(1, dt * 3.2);
    shake = Math.max(0, shake - dt * 1.2);
    if (tweens.length && clockT - shadowT > 0.3) { shadowT = clockT; renderer.shadowMap.needsUpdate = true; }
    animateChars(dt);
    stepParticles(dt);
    stepCrows();
    if (mystery.visible) {
      mystery.position.copy(mysteryPos());
      const f = 0.55 + Math.sin(clockT * 7) * 0.2 + Math.sin(clockT * 17.3) * 0.15;
      mystery.material.opacity = clamp(f, 0.2, 1) * clamp(api.night * 1.4, 0, 1);
      mystery.scale.setScalar(mysteryKind === 'emelya' ? 3.2 : 2.4);
    }
    if (flying) {
      const a = clockT * 0.35;
      town.mortar.position.set(-6 + Math.cos(a) * 11, 9 + Math.sin(a * 2.3) * 0.8, -6 + Math.sin(a) * 11);
      town.mortar.rotation.set(Math.sin(a * 2) * 0.15, -a, 0.25);
      if (town.chars.yaga.g.visible) town.chars.yaga.g.visible = false;
      if (Math.random() < dt * 5) puff(town.mortar.position.x, town.mortar.position.y - 0.2, town.mortar.position.z, { vy: -0.2, s: 0.25, life: 1.8, color: '#C9C2B8' });
    } else if (!town.chars.yaga.g.visible && charPos.yaga) town.chars.yaga.g.visible = true;
    // лампы мерцают чуть-чуть
    for (const l of town.lamps) l.glow.scale.setScalar(2.6 + Math.sin(clockT * 3 + l.x) * 0.05);
    updateCamera();
    for (const b of billboards) b.quaternion.copy(camera.quaternion);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, W, H);
    renderer.render(scene, camera);
    if (dieState) {
      stepDice();
      if (die.visible) {
        const r = dieRect();
        renderer.autoClear = false;
        renderer.clearDepth();
        renderer.setScissorTest(true);
        renderer.setScissor(r.x, H - r.y - r.s, r.s, r.s);
        renderer.setViewport(r.x, H - r.y - r.s, r.s, r.s);
        renderer.render(diceScene, diceCam);
        renderer.setScissorTest(false);
        renderer.autoClear = true;
        diceCap.style.transform = `translate(${r.x + r.s / 2}px, ${r.y + r.s + 4}px) translate(-50%, 0)`;
      }
    }
    stepLabels();
    framesDone++;
    const info = window.__uchInit;
    if (info) {
      if (!info.firstFrame) { info.firstFrame = Math.round(performance.now() - (window.__uchT0 || 0)); info.programs = renderer.info.programs ? renderer.info.programs.length : -1; info.calls = renderer.info.render.calls; }
      info.frames = (info.frames || []).slice(-5).concat(Math.round(performance.now() - now));
    }
  }

  // ---------- сборка ----------
  api.init = function (opts) {
    window.__uchT0 = performance.now();
    T = window.THREE;
    canvas = opts.canvas; sky = opts.sky; labelsEl = opts.labels; diceCap = opts.diceCap;
    renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.autoClear = true;
    scene = new T.Scene();
    camera = new T.OrthographicCamera(-10, 10, 10, -10, 1, 400);
    hemi = new T.HemisphereLight('#DCE7EE', '#6B5B45', 1.1); scene.add(hemi);
    amb = new T.AmbientLight('#FFFFFF', 0.15); scene.add(amb);
    sun = new T.DirectionalLight('#FFF1DA', 2.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 1, far: 160 });
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
    scene.add(sun); scene.add(sun.target);
    MOON_C = new T.Color('#8FA6E8');

    town = U.Town.build(T, scene);
    // динамические объекты не сливаем
    for (const id in town.chars) town.chars[id].g.userData.dynamic = true;
    town.player.g.userData.dynamic = true; town.cat.g.userData.dynamic = true;
    town.hut.g.userData.dynamic = true; town.truck.userData.dynamic = true; town.mortar.userData.dynamic = true;
    town.flags.forEach((f) => { f.userData.dynamic = true; });
    mergeStatic(scene.children.find((c) => c.isGroup));
    // жители не отбрасывают резких теней — у них мягкие пятна
    for (const id in town.chars) town.chars[id].g.traverse((o) => { o.castShadow = false; });
    town.player.g.traverse((o) => { o.castShadow = false; });
    // свет фонарей: ореол и пятно на земле
    const glowTex = (() => {
      const cv = document.createElement('canvas'); cv.width = cv.height = 128;
      const g = cv.getContext('2d');
      const gr = g.createRadialGradient(64, 64, 2, 64, 64, 62);
      gr.addColorStop(0, 'rgba(255,226,160,1)'); gr.addColorStop(0.35, 'rgba(255,196,110,.45)'); gr.addColorStop(1, 'rgba(255,180,90,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      const t = new T.CanvasTexture(cv); t.colorSpace = T.SRGBColorSpace; return t;
    })();
    // ореолы — плоскости, развёрнутые к камере: та же шейдерная программа, что у вывесок
    glowMat = new T.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0 });
    poolMat = new T.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0 });
    const quad = new T.PlaneGeometry(1, 1);
    for (const l of town.lamps) {
      l.glow = new T.Mesh(quad, glowMat);
      l.glow.position.set(l.x, l.y, l.z); l.glow.scale.setScalar(2.6); scene.add(l.glow); billboards.push(l.glow);
      l.pool = new T.Mesh(new T.CircleGeometry(3, 16), poolMat);
      l.pool.rotation.x = -Math.PI / 2; l.pool.position.set(l.x, 0.12, l.z); scene.add(l.pool);
    }
    mystery = new T.Mesh(quad, new T.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0.9 }));
    mystery.visible = false; scene.add(mystery); billboards.push(mystery);
    mortarHome = town.mortar.position.clone();
    {
      const rider = new T.Group();
      const m1 = U.Town.mesh(new T.ConeGeometry(0.34, 0.8, 7), '#EDEAE0'); m1.position.y = 1.2; rider.add(m1);
      const m2 = U.Town.mesh(new T.IcosahedronGeometry(0.26, 1), '#B23A2C'); m2.position.y = 1.72; rider.add(m2);
      const m3 = U.Town.mesh(new T.ConeGeometry(0.07, 0.24, 5), '#C49B78'); m3.rotation.x = Math.PI / 2; m3.position.set(0, 1.68, 0.3); rider.add(m3);
      rider.visible = false; town.mortar.add(rider); town.mortar.userData.rider = rider;
    }
    buildCrows();
    buildDice();
    buildLabels();
    setupInput();
    api.ok = true;
    resize();
    applyTime(dayMin, true);
    window.addEventListener('resize', () => { resize(); api.onResize && api.onResize(); });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) running = false;
      else if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); }
    });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { town.redrawSigns(); api._redrawDice && api._redrawDice(); });
    last = performance.now();
    requestAnimationFrame(frame);
  };
  api.setFree = function (rect) { api.free = rect; };
  api.resize = resize;
  api.snapView = function () { Object.assign(view, want); };
  return api;
})();
