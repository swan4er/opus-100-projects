/* ================================================================
   Движок сцены: сверяет новый граф с тем, что стоит на острове,
   и анимирует разницу. Новое вырастает (природа) или падает с неба
   (постройки, вещи, живность), убранное съёживается, изменённое
   пересобирается с «хлопком». Плюс анимации объектов по полю anim.
   ================================================================ */
(function () {
  'use strict';
  if (!window.THREE || !S3.world) return;
  const T = THREE, L = S3.lang, W = S3.world, RC = S3.recipes, PI = Math.PI;
  const E = { items: new Map(), scene: L.emptyScene(), onLand: null, onGone: null };
  const root = new T.Group(); W.scene.add(root);

  const NATURE = new Set(['tree', 'bush', 'flowers', 'grass', 'mushroom', 'mountain', 'cliff', 'rock', 'pond', 'stump']);
  const FRONT_X = new Set(['car', 'boat']);
  const AIR_Y = { cloud: 8.8, bird: 6.5, balloon: 4.6, ufo: 6.8, rainbow: 0 };
  const SIB = [[0, 0], [0.52, 0.18], [-0.5, -0.12], [0.12, -0.4], [-0.22, 0.38], [0.4, -0.3]];
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const easeOutBack = (p) => { const c = 1.9; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); };
  const easeOutElastic = (p) => (p <= 0 ? 0 : p >= 1 ? 1 : Math.pow(2, -9 * p) * Math.sin((p * 10 - 0.75) * (2 * PI / 3.2)) + 1);
  const easeInBack = (p) => 2.4 * p * p * p - 1.4 * p * p;

  // материал «целиком» (золотая статуя, стеклянный дом): меняем общий материал слитых мешей
  const glowVC = new T.MeshBasicMaterial({ vertexColors: true, color: new T.Color(1.7, 1.6, 1.4) });
  glowVC.userData.shared = true;
  function applyMat(g, mat) {
    g.traverse((m) => {
      if (!m.isMesh || !m.material || !m.material.vertexColors) return;
      if (mat === 'glow') m.material = glowVC;
      else m.material = RC.sharedMat(mat, m.material.flatShading);
    });
  }

  function visualKey(o) {
    return JSON.stringify([o.type, o.kind, o.color, o.color2, o.mat, o.n, o.text, o.parts, o.s, o.type === 'rocket' || o.type === 'ufo' ? o.anim : 0]);
  }

  function build(o) {
    const b = new RC.Builder(o);
    try { (RC.R[o.type] || RC.R.custom)(b, o); }
    catch (e) { b.buckets.clear(); b.p('box', '#c9bfae', [0, 0.5, 0], [1, 1, 1]); }
    const g = b.done();
    g.scale.setScalar(o.s || 1);
    if (o.mat && o.type !== 'custom') applyMat(g, o.mat);
    if (b.rig.noShadow) g.traverse((m) => { if (m.isMesh) m.castShadow = false; });
    return { g, rig: b.rig };
  }

  function create(o) {
    const { g, rig } = build(o);
    const holder = new T.Group(), anim = new T.Group(), app = new T.Group();
    holder.add(anim); anim.add(app); app.add(g);
    root.add(holder);
    const it = {
      o, g, rig, holder, anim, app, key: visualKey(o),
      phase: RC.rng(RC.hash(o.id))() * 6.283,
      t: 99, pop: 1, dying: -1, landed: true,
      pos: new T.Vector3(), cur: new T.Vector3(), glide: 1,
      nature: NATURE.has(o.type), air: L.TYPES[o.type].hab === 'air',
    };
    E.items.set(o.id, it);
    return it;
  }

  function kill(it) {
    it.dying = 0;
    E.items.delete(it.o.id);
    dying.push(it);
  }
  const dying = [];

  /* Поставить новый граф. opts.animate — анимировать появление; вернёт длительность стройки, с */
  E.setScene = function (next, opts) {
    opts = opts || {};
    const animate = opts.animate !== false;
    const prev = E.scene;
    E.scene = L.clone(next);
    W.setEnv(E.scene.env, !animate || opts.instantEnv);
    const ids = new Set(E.scene.objects.map((o) => o.id));
    for (const it of [...E.items.values()]) {
      if (ids.has(it.o.id)) continue;
      if (animate) kill(it);
      else { E.items.delete(it.o.id); root.remove(it.holder); W.disposeTree(it.holder); }
    }
    const fresh = [];
    for (const o of E.scene.objects) {
      let it = E.items.get(o.id);
      if (!it) { it = create(o); fresh.push(it); continue; }
      const key = visualKey(o);
      if (key !== it.key) {
        // пересборка на месте с хлопком
        it.app.remove(it.g); W.disposeTree(it.g);
        const { g, rig } = build(o);
        it.g = g; it.rig = rig; it.app.add(g); it.key = key;
        if (animate) it.pop = 0;
      }
      it.o = o;
    }
    layout(!animate);
    const n = fresh.length, stagger = n ? Math.min(0.11, 3.2 / n) : 0;
    fresh.forEach((it, i) => {
      it.cur.copy(it.pos);
      if (animate) { it.t = -i * stagger - (opts.delay || 0); it.landed = false; it.app.scale.setScalar(0.0001); }
    });
    void prev;
    return animate ? n * stagger + 1.1 : 0;
  };

  // ---------- раскладка: где стоит каждый объект ----------
  function layout(instant) {
    const env = E.scene.env, landR = L.landRadius(env.sea), sea = env.sea > 0.05;
    const done = new Set(), sib = new Map();
    const v = new T.Vector3();
    const place = (it, depth) => {
      if (done.has(it.o.id)) return;
      done.add(it.o.id);
      const o = it.o, hab = L.TYPES[o.type].hab;
      let x = isFinite(o.x) ? o.x : 0, z = isFinite(o.z) ? o.z : 0, y = 0;
      const sup = o.on ? E.items.get(o.on) : null;
      it.onWater = false;
      if (sup && depth < 6) {
        place(sup, depth + 1);
        const so = sup.o, ss = so.s || 1, rig = sup.rig;
        const k = sib.get(so.id) || 0; sib.set(so.id, k + 1);
        const off = SIB[k % SIB.length], small = L.footprint(o) < 0.9;
        if (rig.waterTop) { v.set(off[0] * 1.3 + (k ? 0 : 0.3), rig.top, off[1] * 1.1 + 0.2); it.onWater = true; }
        else if (rig.porch && small) v.set(rig.porch[0] + off[0] * 0.5, rig.porch[1], rig.porch[2] + off[1] * 0.4);
        else if (rig.seat && small) v.set(rig.seat[0] + off[0] * 0.6, rig.seat[1], rig.seat[2]);
        else v.set(off[0] * 0.8, rig.top || 1, off[1] * 0.8);
        const a = ((so.rot || 0) * PI) / 180, lx = v.x * ss, lz = v.z * ss;
        x = sup.pos.x + lx * Math.cos(a) + lz * Math.sin(a);
        z = sup.pos.z - lx * Math.sin(a) + lz * Math.cos(a);
        y = sup.pos.y + v.y * ss;
        it.supported = true;
      } else {
        it.supported = false;
        const r = Math.hypot(x, z), inSea = sea && r > landR - 0.1;
        if (hab === 'air') y = isFinite(o.y) ? o.y : AIR_Y[o.type] ?? 6;
        else if (inSea && (hab === 'water' || o.type === 'barrel' || o.anim === 'swim' || o.type === 'animal' && o.kind === 'duck')) { y = W.waterY; it.onWater = true; }
        else if (inSea && hab === 'any') y = o.type === 'rock' ? -0.5 : o.type === 'bridge' ? -0.15 : W.waterY;
        else if (inSea) y = -0.05;
        else if (isFinite(o.y) && o.y > 0 && (o.type === 'custom' || o.type === 'rocket')) y = Math.min(8, o.y);
      }
      it.pos.set(x, y, z);
      if (instant) it.cur.copy(it.pos);
    };
    for (const o of E.scene.objects) { const it = E.items.get(o.id); if (it) place(it, 0); }
  }

  // ---------- анимации ----------
  const tmp = new T.Vector3();
  function waveFlag(flag, t) {
    const pos = flag.geometry.attributes.position, base = flag.userData.base;
    const w = 0.4 + W.wind;
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3];
      pos.setZ(i, Math.sin(x * 4 - t * (4 + w * 3)) * 0.1 * x * w);
    }
    pos.needsUpdate = true;
    flag.geometry.computeVertexNormals();
  }

  function animateItem(it, t, dt) {
    const o = it.o, rig = it.rig, sp = o.speed || 1, ph = it.phase;
    let a = o.anim || 'none';
    if (o.type === 'bird' && a === 'none') a = 'fly';
    const A = it.anim, H = it.holder, s = o.s || 1;
    A.position.set(0, 0, 0); A.rotation.set(0, 0, 0); A.scale.set(1, 1, 1);
    let x = it.cur.x, y = it.cur.y, z = it.cur.z, yaw = ((o.rot || 0) * PI) / 180;
    const moving = !it.supported || it.onWater;

    // постоянная жизнь: ветер, флаги, огонь, лучи
    if (rig.sway) { const amp = a === 'sway' ? 0.11 : 0.008 + W.wind * 0.035; rig.sway.rotation.z = Math.sin(t * 1.4 * sp + ph) * amp; rig.sway.rotation.x = Math.sin(t * 1.1 * sp + ph * 1.3) * amp * 0.5; }
    if (rig.flag) waveFlag(rig.flag, t + ph);
    if (rig.flame && rig.flame.visible !== false) { const f = 1 + Math.sin(t * 17 + ph) * 0.08; rig.flame.scale.set(f, 1 + Math.sin(t * 13 + ph) * 0.16, f); }
    if (rig.beam) rig.beam.opacity = Math.max(0, W.nightF - 0.25) * 0.7;
    if (rig.rotor) rig.rotor.rotation[rig.rotorAxis] += dt * (a === 'spin' ? 1.5 * sp : o.type === 'lighthouse' ? 0.7 * W.nightF : 0.05 + W.wind * 0.12);
    if (rig.spinBody) rig.spinBody.rotation.y += dt * (a === 'spin' ? 3 * sp : 0.5);
    if (rig.ufoBeam) { const h = Math.max(0.5, y); rig.ufoBeam.scale.set(1, h, 1); rig.ufoBeam.position.y = -h / 2 - 0.2; }
    if (rig.glow.length) {
      const blink = a === 'blink' ? 0.08 + 0.92 * (0.5 + 0.5 * Math.tanh(Math.sin(t * 5 * sp + ph) * 5)) : 1;
      for (const m of rig.glow) m.emissiveIntensity = m.userData.base * (m.userData.night ? 0.05 + 0.95 * W.nightF : 1) * blink;
    }

    switch (a) {
      case 'spin': if (!rig.rotor && !rig.spinBody) A.rotation.y = t * 1.6 * sp; break;
      case 'sway': if (!rig.sway) { A.rotation.z = Math.sin(t * 1.6 * sp + ph) * 0.12; } break;
      case 'bob': {
        const amp = o.type === 'balloon' || it.air ? 0.35 : 0.1;
        A.position.y = Math.sin(t * 1.7 * sp + ph) * amp; A.rotation.z = Math.sin(t * 1.3 * sp + ph) * 0.06; A.rotation.x = Math.sin(t * 1.1 * sp) * 0.04;
        break;
      }
      case 'fly': {
        if (o.type === 'rocket') { A.position.y = 1.2 + Math.sin(t * 0.9 * sp + ph) * 1.1; break; }
        const R0 = Math.max(3.5, Math.hypot(it.pos.x, it.pos.z));
        const ang = Math.atan2(it.pos.z, it.pos.x) + t * sp * (2.2 / R0);
        x = Math.cos(ang) * R0; z = Math.sin(ang) * R0;
        y = it.pos.y + Math.sin(t * 0.9 + ph) * 0.4;
        yaw = Math.atan2(-Math.sin(ang), Math.cos(ang)) - (FRONT_X.has(o.type) ? PI / 2 : 0);
        A.rotation.z = o.type === 'bird' ? -0.18 : 0;
        break;
      }
      case 'walk': case 'swim': {
        if (!moving) { legs(rig, t, sp, 0.3); break; }
        const car = FRONT_X.has(o.type), r = (car ? 2.0 : it.onWater && it.supported ? 0.7 : 1.0) * Math.max(0.6, s);
        const w = ((car ? 1.3 : 0.55) * sp) / r;
        const ang = t * w + ph;
        x = it.pos.x + Math.cos(ang) * r - r * Math.cos(ph); z = it.pos.z + Math.sin(ang) * r - r * Math.sin(ph);
        yaw = Math.atan2(-Math.sin(ang), Math.cos(ang)) - (car ? PI / 2 : 0);
        if (a === 'swim' || it.onWater) { A.position.y = Math.sin(t * 2 + ph) * 0.04; A.rotation.z = Math.sin(t * 1.6 + ph) * 0.05; }
        else legs(rig, t, sp, 1);
        if (rig.wheels) for (const wh of rig.wheels) wh.rotation.z -= dt * w * r / 0.24;
        break;
      }
      case 'hop': { const p = Math.abs(Math.sin(t * 4 * sp + ph)); A.position.y = p * 0.5 * s; A.scale.y = 0.92 + p * 0.14; break; }
      case 'wave': if (rig.arms[1]) rig.arms[1].rotation.z = 2.5 + Math.sin(t * 10 * sp) * 0.4; else A.rotation.z = Math.sin(t * 5) * 0.1; break;
      case 'dance': {
        A.rotation.y = Math.sin(t * 2.2 * sp + ph) * 0.9; A.position.y = Math.abs(Math.sin(t * 5 * sp)) * 0.18 * s;
        if (rig.arms.length === 2) { rig.arms[0].rotation.z = -2.3 - Math.sin(t * 5 * sp) * 0.5; rig.arms[1].rotation.z = 2.3 + Math.sin(t * 5 * sp) * 0.5; }
        break;
      }
      case 'pulse': A.scale.setScalar(1 + Math.sin(t * 4 * sp + ph) * 0.08); break;
      case 'blink': if (!rig.glow.length) A.scale.setScalar(1 + Math.max(0, Math.sin(t * 5 * sp + ph)) * 0.06); break;
      case 'sleep':
        if (o.type === 'person') { A.rotation.x = -PI / 2; A.position.y = 0.16 * s; }
        else { A.scale.y = 0.8 + Math.sin(t * 1.5 + ph) * 0.03; if (rig.head) rig.head.rotation.x = 0.35; }
        break;
      default: break;
    }
    // дыхание и повороты головы у живности
    if (rig.being && a !== 'sleep') {
      if (rig.body) rig.body.scale.y = 1 + Math.sin(t * 2.2 + ph) * 0.012;
      if (rig.head && a !== 'dance') rig.head.rotation.y = Math.sin(t * 0.45 + ph) * 0.4;
      if (rig.tail) rig.tail.rotation.y = Math.sin(t * 3 + ph) * 0.35;
    }
    if (a !== 'wave' && a !== 'dance' && rig.arms.length === 2 && o.type === 'person' && a !== 'walk') { rig.arms[0].rotation.z = -0.08; rig.arms[1].rotation.z = 0.08; }
    // стайка машет крыльями
    if (rig.flock) for (const f of rig.flock) { const k = Math.sin(t * 13 * sp + f.ph); f.wings[0].rotation.z = -k * 0.75; f.wings[1].rotation.z = k * 0.75; f.bird.position.y += (Math.sin(t * 2 + f.ph) * 0.1 - f.bird.position.y) * 0.1; }
    else if (rig.wings.length && (a === 'fly' || a === 'hop')) for (let i = 0; i < rig.wings.length; i++) rig.wings[i].rotation.z = (i ? 1 : -1) * Math.abs(Math.sin(t * 16)) * 0.9;
    // рыбы выпрыгивают по дуге
    if (rig.fish) {
      const q = (t * sp / 3.4 + ph) % 1;
      if (q < 0.34) { const u = q / 0.34; A.position.y = Math.sin(u * PI) * 1.35 - 0.3; A.position.z = (u - 0.5) * 2.4; A.rotation.x = (u - 0.5) * 2.2; it.jumped = true; }
      else { A.position.y = -1.1; if (it.jumped && q > 0.34 && q < 0.4) { it.jumped = false; W.dust(x, W.waterY, z, 0.5, '#e6f2fa'); } }
    }
    H.position.set(x, y, z);
    H.rotation.y = yaw;
  }
  function legs(rig, t, sp, k) {
    for (let i = 0; i < rig.legs.length; i++) rig.legs[i].rotation.x = Math.sin(t * 9 * sp + (i % 2 ? PI : 0) + (i > 1 ? PI : 0)) * 0.55 * k;
    if (rig.arms.length === 2) { rig.arms[0].rotation.x = Math.sin(t * 9 * sp) * 0.5 * k; rig.arms[1].rotation.x = -Math.sin(t * 9 * sp) * 0.5 * k; }
  }

  // ---------- появление, хлопок, исчезновение ----------
  function appear(it, dt) {
    if (it.t >= 2) return;
    it.t += dt;
    const t = it.t, app = it.app;
    if (t < 0) { app.scale.setScalar(0.0001); return; }
    if (it.air) {
      const p = clamp01(t / 1.0);
      app.scale.setScalar(Math.max(0.0001, easeOutBack(p))); app.position.y = (1 - p) * 1.4;
      if (!it.landed && p > 0.3) { it.landed = true; E.onLand && E.onLand(it); }
      if (p >= 1) it.t = 2;
      return;
    }
    if (it.nature) {
      const p = clamp01(t / 0.95);
      const e = easeOutElastic(p), b = easeOutBack(Math.min(1, p * 1.25));
      app.scale.set(Math.max(0.0001, b), Math.max(0.0001, e), Math.max(0.0001, b));
      app.position.y = 0;
      if (!it.landed && p > 0.12) { it.landed = true; E.onLand && E.onLand(it); }
      if (p >= 1) { app.scale.setScalar(1); it.t = 2; }
      return;
    }
    const FALL = 0.5, Hdrop = 5.5;
    if (t < FALL) {
      const p = t / FALL;
      app.position.y = Hdrop * (1 - p * p);
      const g = 0.35 + 0.65 * (1 - Math.pow(1 - p, 3));
      app.scale.set(g * 0.92, g * 1.12, g * 0.92);
    } else {
      if (!it.landed) {
        it.landed = true;
        const fp = Math.max(0.3, L.footprint(it.o));
        if (!it.onWater) W.dust(it.cur.x, it.cur.y, it.cur.z, fp, W.env.ground === 'snow' || W.env.weather === 'snow' ? '#ffffff' : W.env.ground === 'mars' ? '#e0a07a' : '#efe6d6');
        else W.dust(it.cur.x, it.cur.y, it.cur.z, fp * 0.8, '#e2f0f8');
        E.onLand && E.onLand(it);
      }
      const q = clamp01((t - FALL) / 0.5);
      const sq = Math.sin(q * PI * 2.2) * Math.exp(-q * 4.2) * 0.24;
      app.position.y = 0;
      app.scale.set(1 + sq * 0.6, 1 - sq, 1 + sq * 0.6);
      if (q >= 1) { app.scale.setScalar(1); it.t = 2; }
    }
  }

  function frame(t, dt) {
    for (const it of E.items.values()) {
      appear(it, dt);
      if (it.pop < 1) {
        it.pop = Math.min(1, it.pop + dt / 0.45);
        const s = 0.7 + 0.3 * easeOutBack(it.pop);
        it.app.scale.setScalar(s);
      }
      // плавный переезд к новому месту
      it.cur.lerp(it.pos, 1 - Math.exp(-dt * 5));
      animateItem(it, t, dt);
    }
    for (let i = dying.length - 1; i >= 0; i--) {
      const it = dying[i];
      it.dying += dt / 0.45;
      const p = clamp01(it.dying);
      it.app.scale.setScalar(Math.max(0.0001, 1 - easeInBack(p) * 1.0));
      it.app.position.y = p * 0.8;
      if (p >= 1) { root.remove(it.holder); W.disposeTree(it.holder); dying.splice(i, 1); }
    }
    updateLights(t);
  }
  W.frameFns.push(frame);

  // ---------- огни: лучшие шесть получают настоящий точечный свет ----------
  const reqs = [];
  const cloudMat = RC.sharedMat('cloud', false);
  function updateLights(t) {
    reqs.length = 0;
    for (const it of E.items.values()) {
      if (!it.rig.lights.length || it.t < 0) continue;
      const vis = it.app.scale.y;
      for (const l of it.rig.lights) {
        const p = l.power * (l.night ? W.nightF : 0.45 + 0.55 * W.nightF) * Math.min(1, vis);
        if (p > 0.03) reqs.push({ it, l, p });
      }
    }
    reqs.sort((a, b) => b.p - a.p);
    const pool = W.lightPool;
    for (let i = 0; i < pool.length; i++) {
      const L0 = pool[i], r = reqs[i];
      if (!r) { L0.intensity = 0; continue; }
      tmp.copy(r.l.pos); r.it.g.localToWorld(tmp);
      L0.position.copy(tmp);
      L0.color.copy(r.l.color);
      const fl = r.l.flicker ? 0.82 + Math.sin(t * 13 + i) * 0.1 + Math.sin(t * 29 + i * 2) * 0.08 : 1;
      L0.intensity = r.p * 7 * fl;
      L0.distance = 5 + r.l.power * 3;
    }
    // окна светятся в сумерках и ночью, облака ночью не подсвечены
    RC.SHARED.window.emissiveIntensity = Math.max(0, W.nightF - 0.15) * 1.9;
    cloudMat.emissiveIntensity = 0.4 * (1 - 0.8 * W.nightF);
  }

  // ---------- дым и пар ----------
  E.refreshEmitters = function () {
    const list = [];
    for (const it of E.items.values()) {
      const rig = it.rig;
      if (!rig.smoke) continue;
      const pt = new T.Vector3(rig.smoke[0], rig.smoke[1], rig.smoke[2]);
      list.push({
        rate: rig.smokeBig ? 3 : rig.steam ? 1.5 : it.o.type === 'campfire' ? 2.2 : 0.9, big: !!rig.smokeBig, steam: !!rig.steam,
        get: (v) => (E.items.get(it.o.id) === it && it.t >= 2 ? it.g.localToWorld(v.copy(pt)) : null),
      });
    }
    W.setEmitters(list);
  };

  E.count = () => E.items.size;
  S3.engine = E;
})();
