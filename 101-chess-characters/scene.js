/* ================================================================
   scene.js — 3D-сцена: стол, доска, свет, персонажи и их жизнь.
   Всё, что двигается, — функции от времени с easing; ходы возвращают Promise.
   ================================================================ */
window.makeScene = function (THREE, OrbitControls, canvas, hooks) {
  'use strict';
  const SHOT = !!window.__SHOT__;
  const rig = window.makeRig(THREE);
  const { EXPR } = rig;
  hooks = hooks || {};

  // ---------- рендерер ----------
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, SHOT ? 1 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const BG = new THREE.Color('#1a1310');
  scene.background = BG;
  scene.fog = new THREE.Fog(BG, 22, 42);

  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 120);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.rotateSpeed = 0.6;
  controls.zoomSpeed = 0.7;

  // ---------- свет: тёплая лампа над столом, холодный контровой ----------
  scene.add(new THREE.HemisphereLight('#ffe6c4', '#26170f', 0.95));
  const key = new THREE.DirectionalLight('#ffd6a0', 2.5);
  key.position.set(-4.5, 13, 6.5);
  key.castShadow = true;
  key.shadow.mapSize.set(SHOT ? 1024 : 2048, SHOT ? 1024 : 2048);
  Object.assign(key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 2, far: 30 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 4;
  scene.add(key);
  const rim = new THREE.DirectionalLight('#9db8ff', 1.1);
  rim.position.set(2, 6, -11);
  scene.add(rim);
  const fill = new THREE.DirectionalLight('#ffb38a', 0.35);
  fill.position.set(8, 4, 8);
  scene.add(fill);

  // ---------- текстуры, нарисованные кодом ----------
  function canvasTex(w, h, draw) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    draw(cv.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }
  // прожилки дерева
  function grain(g, x, y, w, h, color, n, alpha) {
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.strokeStyle = color;
    for (let i = 0; i < n; i++) {
      g.globalAlpha = alpha * (0.4 + Math.random() * 0.6);
      g.lineWidth = 0.6 + Math.random() * 1.6;
      const yy = y + Math.random() * h, amp = 1 + Math.random() * 4, ph = Math.random() * 6;
      g.beginPath();
      for (let xx = x; xx <= x + w; xx += 6) { const v = yy + Math.sin(xx * 0.012 + ph) * amp + Math.sin(xx * 0.05 + ph * 2) * amp * 0.3; xx === x ? g.moveTo(xx, v) : g.lineTo(xx, v); }
      g.stroke();
    }
    g.restore(); g.globalAlpha = 1;
  }

  const BOARD = 9.4, INNER = 8;
  const boardTex = canvasTex(2048, 2048, (g, S) => {
    const px = S / BOARD, border = (BOARD - INNER) / 2 * px, cell = px;
    g.fillStyle = '#4a2c1c'; g.fillRect(0, 0, S, S);
    grain(g, 0, 0, S, S, '#2a170d', 260, 0.35);
    // внутренняя кромка рамки
    g.fillStyle = '#2b180e'; g.fillRect(border - 10, border - 10, INNER * cell + 20, INNER * cell + 20);
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
      const dark = (r + f) % 2 === 0, x = border + f * cell, y = border + (7 - r) * cell;
      g.fillStyle = dark ? '#8e5b3b' : '#ecd8b2';
      g.fillRect(x, y, cell, cell);
      grain(g, x, y, cell, cell, dark ? '#5e3620' : '#b99a6c', 14, dark ? 0.35 : 0.22);
    }
    // подписи полей
    g.fillStyle = '#e9cf9f'; g.font = `600 ${Math.round(border * 0.42)}px "Balsamiq Sans", "Onest", sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0; i < 8; i++) {
      const c = border + (i + 0.5) * cell;
      g.fillText('abcdefgh'[i], c, S - border / 2);
      g.fillText('abcdefgh'[i], c, border / 2);
      g.fillText(String(8 - i), border / 2, c);
      g.fillText(String(8 - i), S - border / 2, c);
    }
  });
  const tableTex = canvasTex(1024, 1024, (g, S) => {
    const grd = g.createRadialGradient(S / 2, S / 2, S * 0.05, S / 2, S / 2, S * 0.5);
    grd.addColorStop(0, '#5a3521'); grd.addColorStop(0.45, '#3a2216'); grd.addColorStop(1, '#150d09');
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
    grain(g, 0, 0, S, S, '#1a0e08', 220, 0.25);
  });

  // стол
  const table = new THREE.Mesh(new THREE.CircleGeometry(30, 64), new THREE.MeshStandardMaterial({ map: tableTex, roughness: 0.85 }));
  table.rotation.x = -Math.PI / 2; table.position.y = -0.36; table.receiveShadow = true;
  scene.add(table);
  // доска: рамка и верх
  const frame = new THREE.Mesh(new THREE.BoxGeometry(BOARD, 0.36, BOARD), new THREE.MeshStandardMaterial({ color: '#3b2216', roughness: 0.55 }));
  frame.position.y = -0.18; frame.castShadow = true; frame.receiveShadow = true;
  scene.add(frame);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(BOARD, BOARD), new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.5, metalness: 0.02 }));
  top.rotation.x = -Math.PI / 2; top.position.y = 0.001; top.receiveShadow = true;
  scene.add(top);

  const sqPos = (sq) => new THREE.Vector3((sq & 7) - 3.5, 0, 3.5 - (sq >> 3));

  // ---------- подсветка полей ----------
  const COL = { sel: '#f4b63f', ok: '#fff2d6', risky: '#ff5a36', last: '#f4b63f', check: '#ff3b2f', hover: '#fff2d6' };
  const flatMat = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false });
  const markGroup = new THREE.Group(); scene.add(markGroup);
  const squareGeo = new THREE.PlaneGeometry(1, 1);
  const lastA = new THREE.Mesh(squareGeo, flatMat(COL.last, 0.28)), lastB = new THREE.Mesh(squareGeo, flatMat(COL.last, 0.34));
  const hover = new THREE.Mesh(squareGeo, flatMat(COL.hover, 0.16));
  const selRing = new THREE.Mesh(new THREE.RingGeometry(0.37, 0.47, 40), flatMat(COL.sel, 0.95));
  const checkGlow = new THREE.Mesh(new THREE.CircleGeometry(0.62, 40), new THREE.MeshBasicMaterial({
    map: canvasTex(128, 128, (g, S) => { const r = g.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, S / 2); r.addColorStop(0, 'rgba(255,70,50,1)'); r.addColorStop(1, 'rgba(255,70,50,0)'); g.fillStyle = r; g.fillRect(0, 0, S, S); }),
    transparent: true, depthWrite: false }));
  for (const m of [lastA, lastB, hover, selRing, checkGlow]) { m.rotation.x = -Math.PI / 2; m.visible = false; markGroup.add(m); }
  lastA.position.y = lastB.position.y = 0.004; hover.position.y = 0.006; selRing.position.y = 0.012; checkGlow.position.y = 0.01;
  const dotGeo = new THREE.CircleGeometry(0.14, 28), capGeo = new THREE.RingGeometry(0.4, 0.47, 36);
  const dotOk = flatMat(COL.ok, 0.75), dotRisk = flatMat(COL.risky, 0.9);
  const dots = [];
  for (let i = 0; i < 32; i++) {
    const d = new THREE.Mesh(dotGeo, dotOk); d.rotation.x = -Math.PI / 2; d.position.y = 0.014; d.visible = false; markGroup.add(d);
    const r = new THREE.Mesh(capGeo, dotOk); r.rotation.x = -Math.PI / 2; r.position.y = 0.014; r.visible = false; markGroup.add(r);
    dots.push({ d, r });
  }
  // «!» над опасными полями
  const warnTex = canvasTex(128, 128, (g, S) => {
    g.fillStyle = '#ff5a36'; g.beginPath(); g.arc(S / 2, S / 2, S * 0.42, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff6e6'; g.font = `800 ${S * 0.62}px "Onest", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('!', S / 2, S * 0.54);
  });
  const warns = [];
  for (let i = 0; i < 16; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: warnTex, depthTest: false, transparent: true })); s.scale.setScalar(0.26); s.visible = false; s.renderOrder = 5; scene.add(s); warns.push(s); }

  let marks = { sel: -1, targets: [], last: null, check: -1, hover: -1 };
  function setMarks(m) {
    dirty = true;
    marks = Object.assign({ sel: -1, targets: [], last: null, check: -1, hover: -1 }, m);
    const place = (mesh, sq) => { if (sq == null || sq < 0) { mesh.visible = false; return; } const p = sqPos(sq); mesh.position.x = p.x; mesh.position.z = p.z; mesh.visible = true; };
    place(selRing, marks.sel);
    place(checkGlow, marks.check);
    place(hover, marks.hover);
    place(lastA, marks.last ? marks.last[0] : -1);
    place(lastB, marks.last ? marks.last[1] : -1);
    let wi = 0;
    dots.forEach((o, i) => {
      const t = marks.targets[i];
      o.d.visible = o.r.visible = false;
      if (!t) return;
      const mesh = t.cap ? o.r : o.d, p = sqPos(t.sq);
      mesh.material = t.risky ? dotRisk : dotOk;
      mesh.position.x = p.x; mesh.position.z = p.z; mesh.visible = true;
      mesh.scale.setScalar(t.risky && !t.cap ? 1.25 : 1);
      if (t.risky && wi < warns.length) { const w = warns[wi++]; w.position.set(p.x + 0.3, 0.42, p.z - 0.3); w.visible = true; }
    });
    for (; wi < warns.length; wi++) warns[wi].visible = false;
  }

  // ---------- частицы: пыль и звёздочки ----------
  const starTex = canvasTex(64, 64, (g, S) => {
    g.fillStyle = '#ffd35a'; g.beginPath();
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 - Math.PI / 2, r = i % 2 ? S * 0.2 : S * 0.46; g.lineTo(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r); }
    g.closePath(); g.fill();
  });
  const dustTex = canvasTex(64, 64, (g, S) => { const r = g.createRadialGradient(S / 2, S / 2, 1, S / 2, S / 2, S / 2); r.addColorStop(0, 'rgba(240,222,190,0.9)'); r.addColorStop(1, 'rgba(240,222,190,0)'); g.fillStyle = r; g.fillRect(0, 0, S, S); });
  const parts = [];
  for (let i = 0; i < 60; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dustTex, transparent: true, depthWrite: false })); s.visible = false; scene.add(s); parts.push({ s, life: 0 }); }
  function burst(pos, kind, n) {
    for (let i = 0; i < n; i++) {
      const p = parts.find((q) => q.life <= 0);
      if (!p) return;
      const a = Math.random() * Math.PI * 2, sp = kind === 'star' ? 1.4 + Math.random() : 0.6 + Math.random() * 0.8;
      p.s.material.map = kind === 'star' ? starTex : dustTex;
      p.s.position.copy(pos).add(new THREE.Vector3(0, kind === 'star' ? 0.3 : 0.05, 0));
      p.v = new THREE.Vector3(Math.cos(a) * sp, kind === 'star' ? 1.5 + Math.random() * 1.5 : 0.25 + Math.random() * 0.3, Math.sin(a) * sp);
      p.life = p.max = kind === 'star' ? 0.9 : 0.7;
      p.kind = kind; p.s.visible = true;
      p.size = kind === 'star' ? 0.16 + Math.random() * 0.08 : 0.3 + Math.random() * 0.2;
    }
  }
  function updateParts(dt) {
    let any = false;
    for (const p of parts) {
      if (p.life <= 0) continue;
      any = true;
      p.life -= dt;
      if (p.life <= 0) { p.s.visible = false; continue; }
      p.v.y -= (p.kind === 'star' ? 5 : 0.4) * dt;
      p.s.position.addScaledVector(p.v, dt);
      const k = p.life / p.max;
      p.s.material.opacity = Math.min(1, k * 1.6);
      p.s.scale.setScalar(p.size * (p.kind === 'star' ? 1 : 1.8 - k));
      p.s.material.rotation += dt * 4;
    }
    return any;
  }

  // ---------- персонажи ----------
  const pieces = new Map();
  const ease = {
    io: (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
    out: (t) => 1 - Math.pow(1 - t, 3),
    in: (t) => t * t * t,
    back: (t) => { const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
  };
  const DEFAULT_EXPR = { wK: 'think', wQ: 'smug', wRa: 'bored', wRh: 'neutral', wNb: 'goofy', wNg: 'happy', wBc: 'sad', wBf: 'joy', wPa: 'bored', wPb: 'sad', wPc: 'happy', wPd: 'fear', wPe: 'fear', wPf: 'happy', wPg: 'bored', wPh: 'happy',
    bK: 'smug', bQ: 'smug', bRa: 'anger', bRh: 'anger', bNb: 'joy', bNg: 'goofy', bBc: 'smug', bBf: 'think' };

  function addPiece(id, kind, team, sq) {
    const P = rig.buildPiece(kind, team, id);
    const pos = sqPos(sq);
    P.root.position.copy(pos);
    scene.add(P.root);
    P.st = {
      sq, alive: true, busy: false, phase: Math.random() * 10,
      base: DEFAULT_EXPR[id] || (team === 'b' ? 'smug' : 'neutral'), expr: null, exprUntil: 0,
      lid: -0.9, browT: 0, browY: 0, pupilS: 1, mouthBase: 0,
      talking: false, talkNext: 0, talkFrame: 0,
      blinkAt: 1 + Math.random() * 4, blink: 0,
      yaw: 0, pitch: 0, rollT: -1, nextRoll: 5 + Math.random() * 6,
      faceYaw: 0, turnTo: null, tremble: kind === 'P' && team === 'w' ? 0.35 : 0,
      nextHop: 3 + Math.random() * 5, hopT: -1, grave: null, lookAt: null,
    };
    P.st.faceYaw = faceYawFor(P);
    P.root.rotation.y = P.st.faceYaw;
    pieces.set(id, P);
    dirty = true;
    return P;
  }

  function removeAll() { for (const P of pieces.values()) scene.remove(P.root); pieces.clear(); dirty = true; }

  function rebuild(id, kind) { // превращение пешки
    const old = pieces.get(id);
    if (!old) return;
    const P = rig.buildPiece(kind, old.team, id);
    P.root.position.copy(old.root.position);
    P.root.rotation.y = old.root.rotation.y;
    P.st = old.st; P.st.base = kind === 'Q' ? 'joy' : P.st.base; P.st.tremble = 0;
    scene.remove(old.root); scene.add(P.root);
    pieces.set(id, P);
    P.bob.scale.setScalar(0.01);
    tween(0.7, (k) => P.bob.scale.setScalar(ease.back(k)));
    burst(P.root.position, 'star', 14);
  }

  const camFlat = new THREE.Vector3();
  function faceYawFor(P) {
    camFlat.copy(camera.position);
    return Math.atan2(camFlat.x - P.root.position.x, camFlat.z - P.root.position.z);
  }

  // выражение лица на время (мс); 0 — до следующей смены
  function setExpr(id, expr, ms = 2600) {
    const P = pieces.get(id);
    if (!P || !P.st.alive && expr !== 'dead') return;
    P.st.expr = EXPR[expr] ? expr : 'neutral';
    dirty = true;
    P.st.exprUntil = ms ? now + ms / 1000 : Infinity;
    if (expr === 'fear' || expr === 'shock') P.sweat.visible = true;
  }
  function talk(id, on) { const P = pieces.get(id); if (P && P.st.talking !== !!on) { P.st.talking = !!on; dirty = true; } }
  function lookAt(id, target) { const P = pieces.get(id); if (P) { P.st.lookAt = target; dirty = true; } }
  function turnTo(id, otherId) { const P = pieces.get(id); if (P) { P.st.turnTo = otherId; dirty = true; } }
  function eyeRoll(id) { const P = pieces.get(id); if (P && P.st.alive) { P.st.rollT = 0; dirty = true; } }

  // ---------- твины ----------
  const tweens = [];
  let now = 0;
  function tween(dur, fn, done) {
    return new Promise((res) => tweens.push({ t0: now, dur, fn, done: () => { done && done(); res(); } }));
  }
  function updateTweens() {
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i], k = Math.min(1, (now - tw.t0) / tw.dur);
      tw.fn(k);
      if (k >= 1) { tweens.splice(i, 1); tw.done(); }
    }
  }

  // ---------- ход фигуры: у каждого типа своя походка ----------
  function movePiece(id, toSq, opt = {}) {
    const P = pieces.get(id);
    if (!P) return Promise.resolve();
    const from = P.root.position.clone(), to = sqPos(toSq);
    const dist = from.distanceTo(to);
    const dirYaw = Math.atan2(to.x - from.x, to.z - from.z);
    P.st.busy = true; P.st.sq = toSq; P.st.hopT = -1;
    const kind = P.kind, bob = P.bob;
    const startYaw = P.root.rotation.y;
    let dur, arc, spin = 0, hops = 1;
    if (kind === 'N') { dur = 0.95; arc = 1.5; spin = Math.PI * 2 * (Math.random() < 0.3 ? 2 : 1); }
    else if (kind === 'P') { dur = 0.45 + dist * 0.18; arc = 0.2; hops = Math.max(2, Math.round(dist * 2)); }
    else if (kind === 'K') { dur = 0.8 + dist * 0.12; arc = 0.1; hops = 4; }
    else if (kind === 'Q') { dur = 0.55 + dist * 0.07; arc = 0.35; spin = Math.PI * 2; }
    else if (kind === 'R') { dur = 0.45 + dist * 0.09; arc = 0.05; }
    else { dur = 0.45 + dist * 0.08; arc = 0.16; }
    if (opt.slow) dur *= 1.4;
    hooks.sfx && hooks.sfx(kind === 'N' ? 'boing' : 'lift', P);
    // упреждение: присесть
    return tween(0.16, (k) => { bob.scale.set(1 + 0.08 * k, 1 - 0.14 * k, 1 + 0.08 * k); P.root.rotation.y = lerpAngle(startYaw, dirYaw, ease.out(k) * (kind === 'N' || kind === 'P' ? 0 : 0.6)); })
      .then(() => tween(dur, (k) => {
        const e = kind === 'R' ? ease.in(k) * 0.6 + ease.io(k) * 0.4 : ease.io(k);
        P.root.position.lerpVectors(from, to, e);
        let y;
        if (hops > 1) { const h = (k * hops) % 1; y = Math.sin(h * Math.PI) * arc; bob.scale.set(1 - Math.sin(h * Math.PI) * 0.05, 1 + Math.sin(h * Math.PI) * 0.1, 1 - Math.sin(h * Math.PI) * 0.05); }
        else { y = Math.sin(k * Math.PI) * arc; const st = Math.sin(k * Math.PI); bob.scale.set(1 - st * 0.08, 1 + st * 0.18, 1 - st * 0.08); }
        P.root.position.y = y;
        if (spin) P.root.rotation.y = startYaw + spin * ease.io(k);
        if (kind === 'B') bob.rotation.z = Math.sin(k * Math.PI * 3) * 0.12 * (1 - k);
        if (kind === 'R') bob.rotation.x = -Math.sin(k * Math.PI) * 0.12;
      }))
      .then(() => {
        P.root.position.copy(to);
        bob.rotation.set(0, 0, 0);
        if (kind === 'R' || kind === 'K' || kind === 'Q') shake(kind === 'R' ? 0.09 : 0.04);
        burst(to, 'dust', kind === 'R' ? 12 : 6);
        hooks.sfx && hooks.sfx(kind === 'R' ? 'thud' : 'land', P);
        opt.onLand && opt.onLand();
        // приземление: сплющиться и отпружинить
        return tween(0.35, (k) => { const s = Math.sin(k * Math.PI) * (1 - k) * (kind === 'N' ? 0.32 : 0.18); bob.scale.set(1 + s * 0.6, 1 - s, 1 + s * 0.6); });
      })
      .then(() => { bob.scale.set(1, 1, 1); P.st.busy = false; });
  }

  function lerpAngle(a, b, t) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * t; }

  // ---------- павшие: вылет с доски на «кладбище» ----------
  let portrait = false;
  const grave = { w: 0, b: 0 };
  function graveSlot(team, i) {
    const col = Math.floor(i / 8), row = i % 8;
    // на телефоне оба кладбища — за дальним краем доски: там свободно, а ближний край закрывает нижняя панель
    if (portrait) { const c = Math.floor(i / 5), r = i % 5; return new THREE.Vector3((team === 'w' ? -1 : 1) * (3.9 - r * 0.85), -0.36, -5.6 - c * 0.85); }
    return team === 'w' ? new THREE.Vector3(-5.55 - col * 0.85, -0.36, 3.15 - row * 0.9) : new THREE.Vector3(5.55 + col * 0.85, -0.36, -3.15 + row * 0.9);
  }
  function placePiece(id, sq) {
    const P = pieces.get(id);
    if (!P) return;
    P.root.position.copy(sqPos(sq));
    P.st.sq = sq;
    dirty = true;
  }
  function capturePiece(id, opt = {}) {
    const P = pieces.get(id);
    if (!P) return Promise.resolve();
    P.st.alive = false; P.st.busy = true; P.st.tremble = 0;
    const idx = grave[P.team]++;
    P.st.grave = idx;
    const from = P.root.position.clone(), to = graveSlot(P.team, idx);
    setExpr(id, 'shock', 0);
    // финальный вид павшего: лёг набок, глаза-крестики, нимб
    const settle = () => {
      P.root.position.copy(to);
      P.bob.rotation.z = 0.28 * (P.team === 'w' ? 1 : -1);
      for (const e of P.eyes) { e.x.visible = true; e.pupil.visible = false; e.lid.visible = false; }
      P.lashes.forEach((l) => (l.visible = false));
      P.halo.visible = true;
      P.sweat.visible = false;
      setExpr(id, 'dead', 0);
      P.st.busy = false;
      dirty = true;
    };
    if (opt.instant) { settle(); return Promise.resolve(); } // сразу, без анимации (расстановка, обложка)
    burst(from, 'star', 10); hooks.sfx && hooks.sfx('poof', P);
    const spin = (Math.random() < 0.5 ? -1 : 1) * Math.PI * 4;
    return tween(1.0, (k) => {
      P.root.position.lerpVectors(from, to, ease.out(k));
      P.root.position.y = from.y + Math.sin(k * Math.PI) * 2.6 + (to.y - from.y) * k;
      P.bob.rotation.z = spin * ease.out(k);
    }).then(() => { settle(); burst(to, 'dust', 8); });
  }
  function relayoutGraves() {
    for (const P of pieces.values()) if (!P.st.alive && P.st.grave != null && !P.st.busy) P.root.position.copy(graveSlot(P.team, P.st.grave));
  }

  // кивок «да» и мотание «нет»
  function nod(id) { const P = pieces.get(id); if (!P) return Promise.resolve(); return tween(0.6, (k) => { P.bob.rotation.x = Math.sin(k * Math.PI * 2) * 0.22 * (1 - k); }); }
  function refuse(id) {
    const P = pieces.get(id);
    if (!P) return Promise.resolve();
    hooks.sfx && hooks.sfx('huff', P);
    return tween(0.8, (k) => { P.bob.rotation.y = Math.sin(k * Math.PI * 5) * 0.45 * (1 - k); P.bob.rotation.z = Math.sin(k * Math.PI * 5) * 0.05 * (1 - k); }).then(() => { P.bob.rotation.set(0, 0, 0); });
  }
  function hop(id, h = 0.35) { const P = pieces.get(id); if (!P || P.st.busy) return Promise.resolve(); return tween(0.45, (k) => { P.root.position.y = Math.sin(k * Math.PI) * h; const s = Math.sin(k * Math.PI); P.bob.scale.set(1 - s * 0.06, 1 + s * 0.12, 1 - s * 0.06); }).then(() => { P.root.position.y = 0; P.bob.scale.set(1, 1, 1); }); }
  function flinch(id) { const P = pieces.get(id); if (!P) return Promise.resolve(); return tween(0.5, (k) => { const s = Math.sin(k * Math.PI) * (1 - k); P.bob.scale.set(1 + s * 0.1, 1 - s * 0.2, 1 + s * 0.1); }); }

  // ---------- камера ----------
  const view = { target: new THREE.Vector3(0, 0, 1.1), dist: 16, polar: 0.72, fov: 34, az: 0 };
  let focusId = null, camTween = null;
  function layout() {
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const wasPortrait = portrait;
    portrait = camera.aspect < 0.85;
    if (portrait) {
      // доска во всю ширину экрана: подбираем расстояние, при котором углы доски едва помещаются
      Object.assign(view, { fov: 46, polar: 0.62 });
      view.target.set(0, 0, -0.45);
      camera.fov = view.fov; camera.updateProjectionMatrix();
      const corners = [[-4.75, 0, 4.75], [4.75, 0, 4.75], [-4.75, 0, -4.75], [4.75, 0, -4.75]].map(([x, y, z]) => new THREE.Vector3(x, y, z));
      const fits = (d) => { placeCamera(view.target, d, view.polar, 0); camera.updateMatrixWorld(); return corners.every((p) => Math.abs(p.clone().project(camera).x) < 0.975); };
      const saveP = camera.position.clone(), saveT = controls.target.clone();
      let d = 12;
      while (d < 60 && !fits(d)) d += 0.25;
      view.dist = d;
      camera.position.copy(saveP); controls.target.copy(saveT); camera.lookAt(saveT); // крупный план переговоров не сбиваем
    } else {
      const narrow = camera.aspect < 1.25;
      Object.assign(view, { fov: narrow ? 42 : 33, polar: 0.74, dist: narrow ? 17.5 : 16.2 });
      view.target.set(0, 0, 1.25);
    }
    camera.fov = view.fov;
    camera.updateProjectionMatrix();
    if (!focusId) placeCamera(view.target, view.dist, view.polar, view.az);
    controls.minDistance = Math.min(view.dist * 0.45, 6); controls.maxDistance = view.dist * 1.35;
    controls.minPolarAngle = 0.12; controls.maxPolarAngle = 1.2;
    controls.minAzimuthAngle = -1.0; controls.maxAzimuthAngle = 1.0;
    if (wasPortrait !== portrait) relayoutGraves();
    dirty = true;
  }
  function placeCamera(target, dist, polar, az) {
    controls.target.copy(target);
    camera.position.set(target.x + Math.sin(az) * Math.sin(polar) * dist, target.y + Math.cos(polar) * dist, target.z + Math.cos(az) * Math.sin(polar) * dist);
    camera.lookAt(target);
  }
  // крупный план фигуры (переговоры)
  // opt: { dist, polar, az, shift: [x, y, z] — сдвиг точки взгляда, instant — без облёта }
  function focus(id, opt = {}) {
    const P = pieces.get(id);
    if (!P) return;
    focusId = id;
    const t = P.root.position.clone(); t.y = P.headY * 0.55;
    if (opt.shift) t.add(new THREE.Vector3(opt.shift[0], opt.shift[1], opt.shift[2]));
    const dist = opt.dist || (portrait ? 7.2 : 6.2), polar = opt.polar || (portrait ? 0.95 : 1.02);
    const az = opt.az != null ? opt.az : Math.max(-0.5, Math.min(0.5, P.root.position.x * 0.06));
    if (opt.instant) { camTween = null; placeCamera(t, dist, polar, az); dirty = true; }
    else moveCam(t, dist, polar, az);
  }
  function unfocus() { focusId = null; moveCam(view.target, view.dist, view.polar, view.az); }
  function moveCam(target, dist, polar, az) {
    const t0 = controls.target.clone(), p0 = camera.position.clone();
    const sph = new THREE.Spherical().setFromVector3(p0.clone().sub(t0));
    const s1 = { r: dist, phi: polar, theta: az };
    const s0 = { r: sph.radius, phi: sph.phi, theta: sph.theta };
    camTween = { t0: now, dur: 1.1, from: { t0, s0 }, to: { t: target.clone(), s1 } };
  }
  function updateCam() {
    if (!camTween) return;
    const k = Math.min(1, (now - camTween.t0) / camTween.dur), e = ease.io(k);
    const { from, to } = camTween;
    controls.target.lerpVectors(from.t0, to.t, e);
    const r = from.s0.r + (to.s1.r - from.s0.r) * e, phi = from.s0.phi + (to.s1.phi - from.s0.phi) * e, th = from.s0.theta + (to.s1.theta - from.s0.theta) * e;
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSphericalCoords(r, phi, th));
    if (k >= 1) camTween = null;
  }
  let shakeAmt = 0;
  function shake(a) { shakeAmt = Math.max(shakeAmt, a); }

  // ---------- выбор мышью ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitP = new THREE.Vector3();
  function pick(cx, cy) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects([...pieces.values()].filter((P) => P.st.alive).map((P) => P.hit), false);
    if (hits.length) { const P = [...pieces.values()].find((q) => q.hit === hits[0].object); return { sq: P.st.sq, id: P.id }; }
    if (ray.ray.intersectPlane(plane, hitP)) {
      const f = Math.floor(hitP.x + 4), rr = Math.floor(4 - hitP.z);
      if (f >= 0 && f < 8 && rr >= 0 && rr < 8) return { sq: rr * 8 + f, id: null };
    }
    return null;
  }
  let pointerWorld = null;
  function setPointer(cx, cy) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    pointerWorld = ray.ray.intersectPlane(plane, new THREE.Vector3()) || null;
    if (pointerWorld) pointerWorld.y = 0.8;
  }

  // экранные координаты макушки (для облачков реплик)
  const tmpV = new THREE.Vector3();
  function screenOf(id) {
    const P = pieces.get(id);
    if (!P) return null;
    tmpV.copy(P.root.position); tmpV.y += P.headY * P.bob.scale.y + 0.12;
    tmpV.project(camera);
    const r = canvas.getBoundingClientRect();
    return { x: r.left + (tmpV.x * 0.5 + 0.5) * r.width, y: r.top + (-tmpV.y * 0.5 + 0.5) * r.height, behind: tmpV.z > 1 };
  }

  // ---------- жизнь лица ----------
  const wp = new THREE.Vector3(), lp = new THREE.Vector3();
  let globalFocus = null; // на кого смотрят все
  function setGlobalFocus(id) { globalFocus = id; dirty = true; }

  function updateFace(P, dt, t) {
    const st = P.st;
    if (st.expr && t > st.exprUntil) st.expr = null;
    const name = st.alive ? (st.expr || st.base) : 'dead';
    const E = EXPR[name] || EXPR.neutral;
    // моргание
    if (!SHOT) st.blinkAt -= dt;
    if (st.blinkAt <= 0) { st.blink = 0.14; st.blinkAt = 1.8 + Math.random() * 4.5; }
    if (st.blink > 0) st.blink -= dt;
    let lidT = E.lid;
    if (st.rollT >= 0) lidT = -0.25;
    if (st.blink > 0) lidT = 1.45;
    const kf = SHOT ? 1 : 1 - Math.exp(-dt * 16);
    st.lid += (lidT - st.lid) * (st.blink > 0 ? 0.7 : kf);
    st.browT += (E.brow[0] - st.browT) * kf;
    st.browY += (E.brow[1] - st.browY) * kf;
    st.pupilS += ((E.pupil || 1) - st.pupilS) * kf;
    // взгляд
    let yawT = 0, pitchT = 0;
    if (st.rollT >= 0) {
      st.rollT += dt / 1.1;
      const k = st.rollT;
      yawT = Math.sin(k * Math.PI * 1.6 - 0.8) * 0.55; pitchT = 0.4 + Math.sin(k * Math.PI) * 0.1;
      if (k >= 1) st.rollT = -1;
    } else if (st.alive) {
      let target = null;
      if (st.lookAt === 'camera') target = camera.position;
      else if (st.lookAt && pieces.get(st.lookAt)) { const o = pieces.get(st.lookAt).root.position; target = wp.set(o.x, 0.7, o.z); }
      else if (globalFocus && globalFocus !== P.id && pieces.get(globalFocus)) { const o = pieces.get(globalFocus).root.position; target = wp.set(o.x, 0.7, o.z); }
      else if (globalFocus === P.id) target = camera.position;
      else if (pointerWorld && (Math.sin(t * 0.3 + st.phase) > -0.3)) target = pointerWorld;
      else target = camera.position;
      if (name === 'think') { yawT = 0.35; pitchT = 0.3; }
      else {
        const e = P.eyes[0].g;
        lp.copy(target); e.worldToLocal(lp);
        yawT = Math.max(-0.6, Math.min(0.6, Math.atan2(lp.x, lp.z)));
        pitchT = Math.max(-0.45, Math.min(0.45, Math.atan2(lp.y, Math.hypot(lp.x, lp.z))));
      }
      // случайный быстрый взгляд в сторону
      if (!SHOT && Math.sin(t * 0.7 + st.phase * 3) > 0.96) yawT += 0.4;
    }
    const kg = SHOT ? 1 : 1 - Math.exp(-dt * 10);
    st.yaw += (yawT - st.yaw) * kg;
    st.pitch += (pitchT - st.pitch) * kg;
    const bt = st.browT, by = st.browY;
    P.eyes.forEach((e, i) => {
      e.pivot.rotation.set(-st.pitch, st.yaw, 0);
      e.pupil.scale.set(e.er * 0.5 * st.pupilS, e.er * 0.5 * st.pupilS, e.er * 0.22);
      e.lid.rotation.x = st.lid;
      const s = e.side; // −1 слева, 1 справа
      let tilt = bt;
      if (E.asym && s > 0) tilt = -bt * 1.6;
      e.browPivot.rotation.z = s < 0 ? -tilt : tilt;
      e.browPivot.position.y = e.er * 1.42 + by + (E.asym && s > 0 ? 0.02 : 0);
    });
    // рот и болтовня
    let frame = E.mouth;
    if (st.talking && st.alive) {
      if (t > st.talkNext) { st.talkFrame = [9, 10, E.mouth, 10, 9][Math.floor(Math.random() * 5)]; st.talkNext = t + 0.07 + Math.random() * 0.08; }
      frame = st.talkFrame;
    }
    rig.setMouthFrame(P.mouth, frame);
    if (P.sweat.visible && !(name === 'fear' || name === 'shock')) P.sweat.visible = false;
    if (P.sweat.visible) { P.sweat.position.y += Math.sin(t * 3) * 0.0006; }
  }

  function updatePiece(P, dt, t) {
    const st = P.st;
    // поворот к камере (или к собеседнику)
    if (!st.busy) {
      let yawT;
      const other = st.turnTo && pieces.get(st.turnTo);
      if (other) yawT = Math.atan2(other.root.position.x - P.root.position.x, other.root.position.z - P.root.position.z) * 0.5 + faceYawFor(P) * 0.5;
      else yawT = faceYawFor(P);
      P.root.rotation.y = lerpAngle(P.root.rotation.y, yawT, SHOT ? 1 : 1 - Math.exp(-dt * 5));
    }
    if (st.alive && !st.busy) {
      // дыхание
      const br = Math.sin(t * 2.1 + st.phase);
      if (st.hopT < 0) P.bob.scale.set(1 - br * 0.006, 1 + br * 0.014, 1 - br * 0.006);
      // дрожь: пешки всегда немного, от страха — сильно
      const fear = (st.expr === 'fear' || st.expr === 'shock') ? 1 : 0;
      const tr = SHOT ? 0 : st.tremble * 0.006 + fear * 0.014;
      if (tr > 0) { P.bob.position.x = (Math.random() - 0.5) * tr; P.bob.position.z = (Math.random() - 0.5) * tr; P.bob.rotation.z = (Math.random() - 0.5) * tr * 2; }
      else { P.bob.position.x = P.bob.position.z = 0; }
      // конь скачет на месте с придурью
      if (P.kind === 'N' && P.team === 'w' || P.id === 'bNg') {
        st.nextHop -= dt;
        if (st.nextHop <= 0 && st.hopT < 0 && !SHOT) { st.hopT = 0; st.nextHop = 4 + Math.random() * 6; }
      }
      if (st.hopT >= 0) {
        st.hopT += dt / 0.55;
        const k = Math.min(1, st.hopT), s = Math.sin(k * Math.PI);
        P.root.position.y = s * 0.28;
        P.bob.rotation.z = Math.sin(k * Math.PI * 2) * 0.25;
        P.bob.scale.set(1 - s * 0.05, 1 + s * 0.1, 1 - s * 0.05);
        if (k >= 1) { st.hopT = -1; P.root.position.y = 0; P.bob.rotation.z = 0; }
      }
      // ферзь закатывает глаза
      if (P.kind === 'Q' && !SHOT) { st.nextRoll -= dt; if (st.nextRoll <= 0) { st.rollT = 0; st.nextRoll = 7 + Math.random() * 8; } }
      // крылья Пегасика
      if (P.extras['wing1']) { const f = Math.sin(t * 9) * 0.25; P.extras['wing1'].rotation.x = 0.5 + f; P.extras['wing-1'].rotation.x = -0.5 - f; }
    }
    updateFace(P, dt, t);
  }

  // ---------- цикл ----------
  // Логика (твины, лица, облачка) идёт каждый кадр. В режиме съёмки (__SHOT__) WebGL
  // считается программно и один кадр стоит секунды, поэтому картинка перерисовывается
  // только когда что-то изменилось и не чаще раза в SHOT_FRAME мс.
  let last = performance.now();
  let dirty = true, lastDraw = -1e9;
  const SHOT_FRAME = 1500;
  // При съёмке ничего не рисуем, пока сцена не собрана: первый кадр SwiftShader собирает шейдеры
  // десятки секунд. renderNow(true) рисует один раз и ждёт GPU (readPixels одного пикселя),
  // чтобы к моменту скриншота кадр был готов, а не собирался под таймаутом.
  let shotHold = SHOT, syncOnce = false;
  const frameHooks = [];
  function onFrame(fn) { frameHooks.push(fn); }
  function requestRender() { dirty = true; }
  function renderNow(sync) { shotHold = false; dirty = true; lastDraw = -1e9; if (sync) syncOnce = true; }
  controls.addEventListener('change', requestRender);
  const basePos = new THREE.Vector3();
  function loop() {
    requestAnimationFrame(loop);
    if (document.hidden) { last = performance.now(); return; }
    const tNow = performance.now();
    // при съёмке кадры редкие (секунды), поэтому логика идёт по настоящему времени, иначе ход анимировался бы минутами
    const dt = Math.min(SHOT ? 1 : 0.05, (tNow - last) / 1000);
    last = tNow;
    now += dt;
    if (tweens.length || camTween || shakeAmt > 0.001) dirty = true;
    updateTweens();
    updateCam();
    controls.update();
    for (const P of pieces.values()) updatePiece(P, dt, now);
    if (updateParts(dt)) dirty = true;
    selRing.scale.setScalar(1 + Math.sin(now * 5) * 0.04);
    checkGlow.material.opacity = 0.65 + Math.sin(now * 7) * 0.3;
    for (const w of warns) if (w.visible) w.position.y = 0.42 + Math.sin(now * 4 + w.position.x) * 0.04;
    if (!SHOT || (!shotHold && dirty && tNow - lastDraw >= SHOT_FRAME)) {
      basePos.copy(camera.position);
      if (shakeAmt > 0.001) { camera.position.x += (Math.random() - 0.5) * shakeAmt; camera.position.y += (Math.random() - 0.5) * shakeAmt; shakeAmt *= 0.86; }
      renderer.render(scene, camera);
      camera.position.copy(basePos);
      dirty = false; lastDraw = tNow;
      if (syncOnce) { syncOnce = false; const gl = renderer.getContext(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); }
    }
    for (const fn of frameHooks) fn(dt, now);
  }

  window.addEventListener('resize', layout);
  layout();
  loop();

  return {
    THREE, camera, controls, renderer,
    addPiece, removeAll, rebuild, movePiece, capturePiece, placePiece, setExpr, talk, lookAt, turnTo, eyeRoll,
    nod, refuse, hop, flinch, focus, unfocus, shake, setMarks, pick, setPointer, screenOf, setGlobalFocus, burst, onFrame, requestRender, renderNow,
    get pieces() { return pieces; }, get portrait() { return portrait; }, sqPos, layout,
    resetGraves() { grave.w = 0; grave.b = 0; },
  };
};
