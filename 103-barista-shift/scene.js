/* ================================================================
   Смена — 3D-сцена: спальный район на рассвете, киоск «Бодрячок».
   Классический скрипт: ждёт THREE от встроенного модуля (bootScene).
   Статика района сливается в один меш с цветами вершин — один вызов
   отрисовки на весь город, чтобы программный рендер не задыхался.
   ================================================================ */
(function () {
  'use strict';

  const View = {
    ready: false, mode: 'title', dayT: 0,
    listeners: [],
    on(fn) { this.listeners.push(fn); },
  };
  window.View = View;

  let THREE, renderer, scene, camera, clock;
  let K; // общие помощники для people.js и props.js

  // ---------- детерминированный случай ----------
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const ease = (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  window.bootScene = function (T) {
    try { init(T); }
    catch (e) {
      const b = document.getElementById('bootT');
      if (b) b.innerHTML = 'Киоск не открылся: трёхмерная сцена не запустилась.<small>' + String(e.message || e).slice(0, 140) + '</small>';
      throw e;
    }
  };

  // ================================================================
  // Слияние геометрии с цветами вершин
  // ================================================================
  function Batch() { this.parts = []; }
  const _m = () => new THREE.Matrix4();
  Batch.prototype.add = function (geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, jitter = .07) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.deleteAttribute('uv'); g.deleteAttribute('normal');
    const m = _m().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
    g.applyMatrix4(m);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i += 3) {
      const j = 1 + (rnd() - .5) * jitter;
      for (let k = 0; k < 3 && i + k < n; k++) { col[(i + k) * 3] = c.r * j; col[(i + k) * 3 + 1] = c.g * j; col[(i + k) * 3 + 2] = c.b * j; }
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.parts.push(g);
    return this;
  };
  Batch.prototype.addMatrix = function (geo, color, matrix, jitter = .07) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.deleteAttribute('uv'); g.deleteAttribute('normal');
    g.applyMatrix4(matrix);
    const n = g.attributes.position.count, col = new Float32Array(n * 3), c = new THREE.Color(color);
    for (let i = 0; i < n; i += 3) { const j = 1 + (rnd() - .5) * jitter; for (let k = 0; k < 3; k++) { col[(i + k) * 3] = c.r * j; col[(i + k) * 3 + 1] = c.g * j; col[(i + k) * 3 + 2] = c.b * j; } }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.parts.push(g);
    return this;
  };
  Batch.prototype.geometry = function () {
    let total = 0;
    for (const g of this.parts) total += g.attributes.position.count;
    const pos = new Float32Array(total * 3), col = new Float32Array(total * 3);
    let o = 0;
    for (const g of this.parts) { pos.set(g.attributes.position.array, o * 3); col.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; g.dispose(); }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.computeVertexNormals();
    this.parts = [];
    return out;
  };
  Batch.prototype.mesh = function (mat) { const m = new THREE.Mesh(this.geometry(), mat || K.matVC); return m; };

  // канвас-текстура. Текстуры с надписями запоминаются: когда догрузятся шрифты
  // (Rubik, Caveat, Dela Gothic One, PT Mono), их перерисует View.redrawText.
  const textTextures = [];
  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    let usedText = false;
    ctx.fillText = function () { usedText = true; return CanvasRenderingContext2D.prototype.fillText.apply(this, arguments); };
    draw(ctx, w, h);
    delete ctx.fillText;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    t.userData.canvas = c; t.userData.ctx = ctx;
    if (usedText) textTextures.push({ t, draw, w, h });
    return t;
  }
  View.redrawText = function () {
    for (const { t, draw, w, h } of textTextures) {
      const x = t.userData.ctx;
      x.save(); x.clearRect(0, 0, w, h); draw(x, w, h); x.restore();
      t.needsUpdate = true;
    }
  };
  function glowTex() {
    return canvasTex(64, 64, (x, w, h) => {
      const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.25, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
    });
  }

  // ================================================================
  // Инициализация
  // ================================================================
  function init(T) {
    THREE = T;
    const canvas = document.getElementById('cv');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    const shot = !!window.__SHOT__;
    baseRatio = shot ? 1 : Math.min(devicePixelRatio || 1, 2);
    ratio = baseRatio;
    renderer.setPixelRatio(ratio);
    renderer.setSize(innerWidth, innerHeight, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x1c2340, 0.018);
    camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.05, 900);
    clock = new THREE.Clock();
    tmpA = new THREE.Vector3(); ray = new THREE.Raycaster(); projV = new THREE.Vector3();
    makeCams();

    K = {
      THREE, scene, rnd, lerp, clamp, ease, Batch, canvasTex,
      matVC: new THREE.MeshLambertMaterial({ vertexColors: true }),
      matGlowVC: new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }),
      glow: glowTex(),
    };
    View.K = K;

    buildSky();
    buildLights();
    buildGround();
    buildBuildings();
    buildStreet();
    buildKioskShell();
    buildSnow();
    if (window.PropsKit) View.props = window.PropsKit(K, View);
    if (window.PeopleKit) View.people = window.PeopleKit(K, View);

    setDay(0);
    camState.pos.copy(CAMS.title.pos); camState.tgt.copy(CAMS.title.tgt);
    resize();
    addEventListener('resize', resize);
    canvas.addEventListener('pointermove', (e) => { pointer.x = e.clientX / innerWidth * 2 - 1; pointer.y = e.clientY / innerHeight * 2 - 1; pointer.cx = e.clientX; pointer.cy = e.clientY; hoverDirty = true; });
    canvas.addEventListener('pointerdown', onPick);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { clock.getDelta(); loop(); } });

    View.ready = true;
    for (const fn of View.listeners) { try { fn(); } catch (e) { console.error(e); } }
    // первый кадр компилирует шейдеры и надолго занимает поток — начинаем после load
    const go = () => setTimeout(loop, 30);
    if (document.readyState === 'complete') go(); else addEventListener('load', go, { once: true });
  }

  // ---------- качество: разрешение подстраивается под время кадра ----------
  // При съёмке (__SHOT__) разрешение не снижается: обложка должна быть чёткой.
  let baseRatio = 1, ratio = 1, perfT = 0, perfN = 0, perfSkip = 3;
  function adaptQuality(raw) {
    if (window.__SHOT__ || View.fixedRatio) return;
    if (perfSkip > 0) { perfSkip -= raw; return; }          // первые секунды — компиляция шейдеров
    perfT += raw; perfN++;
    if (perfT < 2) return;
    const avg = perfT / perfN; perfT = 0; perfN = 0;
    const minR = Math.min(baseRatio, .75);
    let r = ratio;
    if (avg > 1 / 32 && ratio > minR) r = Math.max(minR, ratio * .8);
    else if (avg < 1 / 58 && ratio < baseRatio) r = Math.min(baseRatio, ratio * 1.12);
    if (r !== ratio) { ratio = r; renderer.setPixelRatio(ratio); resize(); }
  }
  // для проверки на медленном сервере: временно рендерить в низком разрешении
  View.setRatio = function (r) {
    View.fixedRatio = r != null;
    ratio = r != null ? r : baseRatio;
    renderer.setPixelRatio(ratio); resize();
  };

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 0.8 ? 68 : 50;
    camera.updateProjectionMatrix();
    View.portrait = w / h < 0.8;
  }

  // ================================================================
  // Небо, звёзды, свет
  // ================================================================
  const SKY = [ // t, верх, середина, горизонт, свечение (sRGB 0..1)
    [0.00, [.035, .05, .12], [.07, .09, .2], [.16, .16, .3], [.05, .02, .06]],
    [0.35, [.07, .1, .23], [.16, .19, .37], [.4, .33, .5], [.35, .16, .2]],
    [0.62, [.2, .27, .47], [.5, .47, .62], [.98, .64, .47], [.9, .45, .22]],
    [1.00, [.4, .52, .72], [.66, .72, .84], [.95, .83, .7], [.55, .4, .25]],
  ];
  let skyMat, stars, hemi, sun, lampLights = [], lampGlows = [], kioskLight, signMat;
  function buildSky() {
    skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Vector3() }, mid: { value: new THREE.Vector3() }, hor: { value: new THREE.Vector3() }, glow: { value: new THREE.Vector3() }, sunDir: { value: new THREE.Vector3(.35, .08, 1).normalize() } },
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); vec4 p = modelViewMatrix*vec4(position,1.); gl_Position = projectionMatrix*p; }',
      fragmentShader: `uniform vec3 top, mid, hor, glow, sunDir; varying vec3 vD;
        void main(){ float y = vD.y; vec3 c = mix(hor, mid, smoothstep(-.02, .22, y)); c = mix(c, top, smoothstep(.22, .75, y));
          float g = pow(max(dot(normalize(vD), sunDir), 0.), 5.); c += glow * g * (1. - smoothstep(0., .5, y));
          c = mix(c, hor * .55, smoothstep(0., -.15, y)); gl_FragColor = vec4(c, 1.); }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 24, 16), skyMat);
    sky.renderOrder = -10;
    scene.add(sky);
    // звёзды
    const n = 420, p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, y = .12 + rnd() * .88, r = Math.sqrt(1 - y * y);
      p[i * 3] = Math.cos(a) * r * 450; p[i * 3 + 1] = y * 450; p[i * 3 + 2] = Math.sin(a) * r * 450;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xdfe6ff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: .8, fog: false, depthWrite: false }));
    scene.add(stars);
  }
  function buildLights() {
    hemi = new THREE.HemisphereLight(0x5a6aa0, 0x2a2430, 1.6); scene.add(hemi);
    sun = new THREE.DirectionalLight(0xffb27a, 0); sun.position.set(30, 12, 80); scene.add(sun);
    kioskLight = new THREE.PointLight(0xffd6a0, 9, 9, 1.6); kioskLight.position.set(0, 2.35, 0.2); scene.add(kioskLight);
    const outLight = new THREE.PointLight(0xffc98a, 9, 8, 1.6); outLight.position.set(.2, 2.3, 2.3); scene.add(outLight);
    View.outLight = outLight;
  }

  // ================================================================
  // Земля, дорога, тротуар, снег по краям
  // ================================================================
  function buildGround() {
    const B = new Batch();
    const plane = new THREE.PlaneGeometry(1, 1);
    const rot = -Math.PI / 2;
    B.add(plane, 0xb4bdd0, 0, 0, 0, rot, 0, 0, 400, 400, 1, .02);           // земля под первым снегом
    B.add(plane, 0x2a2d36, 0, .01, 11.5, rot, 0, 0, 400, 7, 1, .02);        // проезжая часть, мокрый асфальт
    B.add(plane, 0x8d95a6, 0, .012, 4.4, rot, 0, 0, 400, 7.4, 1, .03);       // натоптанный тротуар у киоска
    B.add(plane, 0x8d95a6, 0, .012, 16.6, rot, 0, 0, 400, 3.2, 1, .03);      // дальний тротуар
    B.add(plane, 0x9aa2b2, 0, .014, -3.5, rot, 0, 0, 30, 5, 1, .03);         // двор за киоском
    // разметка
    for (let x = -120; x < 120; x += 6) B.add(plane, 0xb9b39a, x, .02, 11.5, rot, 0, 0, 2.6, .14, 1, 0);
    // бордюры
    const curb = new THREE.BoxGeometry(1, .16, .22);
    B.add(curb, 0x8c8f96, 0, .08, 8.1, 0, 0, 0, 400, 1, 1, .04);
    B.add(curb, 0x8c8f96, 0, .08, 14.95, 0, 0, 0, 400, 1, 1, .04);
    // сугробы вдоль бордюров и у стен
    const drift = new THREE.IcosahedronGeometry(1, 0);
    for (let i = 0; i < 70; i++) {
      const x = -60 + i * 1.75 + rnd() * 1.2;
      if (Math.abs(x - 6) < 3.5 || (x > -5 && x < 9)) continue;
      B.add(drift, 0xe8eef8, x, 0.02, 7.7 - rnd() * .3, rnd(), rnd() * 3, 0, .6 + rnd() * .6, .12 + rnd() * .1, .35 + rnd() * .15, .05);
      B.add(drift, 0xdfe6f2, x + .7, 0.02, 15.5 + rnd() * .4, rnd(), rnd() * 3, 0, .7 + rnd() * .8, .16 + rnd() * .14, .4, .05);
    }
    for (let i = 0; i < 16; i++) B.add(drift, 0xe6ecf6, -1.5 + rnd() * 3, 0.02, -1.35 - rnd() * .3, rnd(), rnd(), 0, .5 + rnd() * .5, .2 + rnd() * .15, .35, .05);
    for (let i = 0; i < 26; i++) B.add(drift, 0xe0e7f2, -14 + rnd() * 28, 0.01, -2 - rnd() * 9, rnd(), rnd() * 3, 0, .6 + rnd() * 1.4, .12 + rnd() * .2, .6 + rnd() * .8, .05);
    const g = B.mesh(); scene.add(g);
    // лужи-отражения фонарей: вытянутые пятна на мокром асфальте
    View.puddles = [];
  }

  // ================================================================
  // Панельные дома с окнами, которые загораются
  // ================================================================
  const houses = [];
  function makeHouse(x, z, floors, cols, facing, tint) {
    const fh = 2.8, cw = 3.0;
    const H = floors * fh + 1.2, W = cols * cw + 1.2, D = 12;
    const winW = 64, winH = 32;
    const cw2 = cols * 16, ch2 = floors * 16;
    // базовая текстура фасада
    const base = canvasTex(cw2 * 2, ch2 * 2, (x2, w, h) => {
      x2.fillStyle = tint; x2.fillRect(0, 0, w, h);
      for (let f = 0; f < floors; f++) {
        for (let c = 0; c < cols; c++) {
          const px = c * 32, py = h - (f + 1) * 32;
          x2.fillStyle = 'rgba(0,0,0,.08)'; x2.fillRect(px, py, 32, 1); x2.fillRect(px, py, 1, 32);
          x2.fillStyle = (c * 7 + f * 3) % 5 === 0 ? '#4a5876' : '#34405a'; x2.fillRect(px + 8, py + 8, 16, 16);
          x2.fillStyle = 'rgba(255,255,255,.08)'; x2.fillRect(px + 8, py + 8, 16, 3);
          if ((c + f) % 3 === 0 && f > 0) { x2.fillStyle = 'rgba(90,86,84,.7)'; x2.fillRect(px + 4, py + 21, 24, 8); x2.fillStyle = 'rgba(255,255,255,.12)'; x2.fillRect(px + 4, py + 21, 24, 1); }
        }
      }
    });
    const lit = canvasTex(cw2 * 2, ch2 * 2, (x2, w, h) => { x2.fillStyle = '#000'; x2.fillRect(0, 0, w, h); });
    base.magFilter = THREE.NearestFilter; lit.magFilter = THREE.NearestFilter;
    const mat = new THREE.MeshLambertMaterial({ map: base, emissiveMap: lit, emissive: 0xffffff, emissiveIntensity: 1 });
    const side = new THREE.MeshLambertMaterial({ color: new THREE.Color(tint).multiplyScalar(.8) });
    const top = new THREE.MeshLambertMaterial({ color: 0xdfe5ee });
    // фасад смотрит на facing (+1 → на +z, -1 → на -z)
    const mats = facing > 0 ? [side, side, top, side, mat, side] : [side, side, top, side, side, mat];
    const m = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), mats);
    m.position.set(x, H / 2, z);
    scene.add(m);
    const state = [];
    for (let f = 0; f < floors; f++) for (let c = 0; c < cols; c++) state.push({ f, c, on: rnd() < .2, warm: rnd() < .8, p: rnd() });
    const hs = { lit, state, floors, cols, dirty: true };
    houses.push(hs);
    return hs;
  }
  function drawHouseLights(hs) {
    const x2 = hs.lit.userData.ctx, h = hs.floors * 32;
    x2.fillStyle = '#000'; x2.fillRect(0, 0, hs.cols * 32, h);
    for (const s of hs.state) {
      if (!s.on) continue;
      const px = s.c * 32, py = h - (s.f + 1) * 32;
      x2.fillStyle = s.warm ? (s.p < .5 ? '#ffc778' : '#ffb163') : '#9fc0ff';
      x2.fillRect(px + 8, py + 8, 16, 16);
    }
    hs.lit.needsUpdate = true; hs.dirty = false;
  }
  function buildBuildings() {
    // через дорогу (фасады к киоску)
    makeHouse(-34, 42, 9, 12, -1, '#b9b0a2');
    makeHouse(4, 48, 16, 8, -1, '#c9c3b8');
    makeHouse(40, 40, 12, 12, -1, '#a8b0b8');
    makeHouse(-70, 56, 16, 10, -1, '#b3aa9c');
    // за киоском, во дворе
    makeHouse(-8, -34, 9, 14, 1, '#b8ada0');
    makeHouse(34, -40, 12, 10, 1, '#aab2b9');
    makeHouse(-46, -30, 5, 10, 1, '#c2b7a6');
    for (const h of houses) drawHouseLights(h);
  }
  function updateHouses(t, dt) {
    // люди просыпаются: к 7:30 горит много окон, к 9:00 гаснут
    const target = t < .5 ? lerp(.2, .42, t / .5) : lerp(.42, .12, (t - .5) / .5);
    for (const h of houses) {
      if (rnd() < dt * .6) {
        const s = h.state[Math.floor(rnd() * h.state.length)];
        const want = rnd() < target;
        if (s.on !== want) {
          s.on = want;
          const x2 = h.lit.userData.ctx, px = s.c * 32, py = h.floors * 32 - (s.f + 1) * 32;
          x2.fillStyle = s.on ? (s.warm ? '#ffc778' : '#9fc0ff') : '#000'; x2.fillRect(px + 8, py + 8, 16, 16);
          h.lit.needsUpdate = true;
        }
      }
    }
  }

  // ================================================================
  // Улица: фонари, остановка, деревья, гаражи, контейнеры
  // ================================================================
  const glowMatCache = {};
  function glowSprite(color, size, opacity = 1) {
    const key = color + '_' + opacity;
    const mat = glowMatCache[key] || (glowMatCache[key] = new THREE.SpriteMaterial({ map: K.glow, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    const s = new THREE.Sprite(mat); s.scale.set(size, size, 1);
    return s;
  }
  function buildStreet() {
    const B = new Batch();
    const box = new THREE.BoxGeometry(1, 1, 1), cyl = new THREE.CylinderGeometry(1, 1, 1, 7), cone = new THREE.ConeGeometry(1, 1, 7);
    // фонари
    const lamps = [[-9, 7.7, 1], [7.5, 7.7, 1], [-1.5, 15.3, -1], [16, 15.3, -1], [-24, 7.7, 1], [30, 15.3, -1]];
    for (const [x, z, dir] of lamps) {
      B.add(cyl, 0x3a3f48, x, 3.6, z, 0, 0, 0, .07, 7.2, .07);
      B.add(box, 0x3a3f48, x, 7.1, z + dir * .6, 0, 0, 0, .08, .08, 1.2);
      B.add(box, 0x2c3038, x, 7.0, z + dir * 1.15, 0, 0, 0, .34, .1, .5);
      const lampGlow = new THREE.Mesh(new THREE.BoxGeometry(.28, .04, .42), new THREE.MeshBasicMaterial({ color: 0xffc27a, fog: false }));
      lampGlow.position.set(x, 6.93, z + dir * 1.15); scene.add(lampGlow);
      const s = glowSprite(0xffa850, 4.2, .85); s.position.set(x, 6.8, z + dir * 1.15); scene.add(s);
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshBasicMaterial({ map: K.glow, color: 0xff9a3c, transparent: true, opacity: .35, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      pool.rotation.x = -Math.PI / 2; pool.position.set(x, .03, z + dir * 1.15); scene.add(pool);
      lampGlows.push({ s, pool, lampGlow });
    }
    for (const i of [0, 1]) {
      const [x, z, dir] = lamps[i];
      const L = new THREE.PointLight(0xffa24f, 30, 16, 1.7); L.position.set(x, 6.7, z + dir * 1.15); scene.add(L); lampLights.push(L);
    }
    // остановка на дальней стороне
    const sx = 6, sz = 16.9;
    B.add(box, 0x2f3a46, sx, 2.5, sz, 0, 0, 0, 4.4, .1, 1.6);            // крыша
    B.add(box, 0x2f3a46, sx - 2.1, 1.25, sz + .6, 0, 0, 0, .08, 2.5, .08);
    B.add(box, 0x2f3a46, sx + 2.1, 1.25, sz + .6, 0, 0, 0, .08, 2.5, .08);
    B.add(box, 0x2f3a46, sx - 2.1, 1.25, sz - .6, 0, 0, 0, .08, 2.5, .08);
    B.add(box, 0x2f3a46, sx + 2.1, 1.25, sz - .6, 0, 0, 0, .08, 2.5, .08);
    B.add(box, 0x7a5a3a, sx, .5, sz + .35, 0, 0, 0, 3.2, .08, .4);          // скамейка
    B.add(box, 0xdfe6f0, sx, 2.58, sz, 0, 0, 0, 4.3, .08, 1.5, .03);        // снег на крыше
    const glassMat = new THREE.MeshLambertMaterial({ color: 0x9fb4c8, transparent: true, opacity: .22, depthWrite: false });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.2), glassMat); back.position.set(sx, 1.35, sz + .62); back.rotation.y = Math.PI; scene.add(back);
    // светящийся рекламный короб
    const adTex = canvasTex(256, 384, (x2, w, h) => {
      const g = x2.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#ffe7b0'); g.addColorStop(1, '#f5b36a');
      x2.fillStyle = g; x2.fillRect(0, 0, w, h);
      x2.fillStyle = '#2a1a10'; x2.font = 'bold 44px Rubik, sans-serif'; x2.textAlign = 'center';
      x2.fillText('ПЕЛЬМЕНИ', w / 2, 110); x2.fillText('«СИБИРЬ»', w / 2, 160);
      x2.font = '26px Rubik, sans-serif'; x2.fillText('как у бабушки,', w / 2, 230); x2.fillText('только быстрее', w / 2, 264);
      x2.fillStyle = '#c0392b'; x2.beginPath(); x2.arc(w / 2, 320, 26, 0, 7); x2.fill();
    });
    const ad = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.65), new THREE.MeshBasicMaterial({ map: adTex, fog: false }));
    ad.position.set(sx + 2.1, 1.3, sz - .66); ad.rotation.y = Math.PI; scene.add(ad);
    const adGlow = glowSprite(0xffc070, 3.2, .35); adGlow.position.set(sx + 2.1, 1.3, sz - 1.0); scene.add(adGlow);
    // табличка остановки
    B.add(cyl, 0x3a3f48, sx - 3, 1.4, sz - .8, 0, 0, 0, .04, 2.8, .04);
    const stopTex = canvasTex(128, 128, (x2, w, h) => { x2.fillStyle = '#f2f2f2'; x2.fillRect(0, 0, w, h); x2.fillStyle = '#2b62b5'; x2.fillRect(6, 6, w - 12, h - 12); x2.fillStyle = '#fff'; x2.font = 'bold 76px Rubik, sans-serif'; x2.textAlign = 'center'; x2.fillText('А', w / 2, 92); });
    const stop = new THREE.Mesh(new THREE.PlaneGeometry(.5, .5), new THREE.MeshLambertMaterial({ map: stopTex }));
    stop.position.set(sx - 3, 2.8, sz - .83); stop.rotation.y = Math.PI; scene.add(stop);

    // берёзы
    const birch = (x, z, h) => {
      B.add(cyl, 0xe8e4dc, x, h / 2, z, 0, 0, 0, .09, h, .09, .1);
      for (let i = 0; i < 5; i++) B.add(box, 0x2a2a2a, x, .6 + rnd() * (h - 1), z, 0, rnd() * 3, 0, .19, .05, .06, 0);
      for (let i = 0; i < 7; i++) {
        const y = h * (.45 + rnd() * .5), a = rnd() * 6.28, l = .8 + rnd() * 1.4;
        B.add(cyl, 0x6b5a4a, x + Math.cos(a) * l * .4, y + l * .3, z + Math.sin(a) * l * .4, Math.sin(a) * .9, 0, -Math.cos(a) * .9, .025, l, .025, .1);
      }
    };
    const spruce = (x, z, h) => {
      B.add(cyl, 0x4a3426, x, .4, z, 0, 0, 0, .12, .8, .12);
      for (let i = 0; i < 4; i++) {
        const r = (1 - i * .2) * h * .32, y = .6 + i * h * .2;
        B.add(cone, 0x1f3d34, x, y + h * .14, z, 0, i, 0, r, h * .3, r, .12);
        B.add(cone, 0xdfe7f0, x, y + h * .2, z, 0, i + .3, 0, r * .72, h * .1, r * .72, .05);
      }
    };
    birch(-5.8, 5.2, 7.5); birch(6.6, 2.4, 6.8); birch(-13, 4.2, 8); birch(12.5, 5, 7.2);
    birch(-8, 19.5, 8.5); birch(20, 19, 7.4); birch(-20, 20, 9);
    spruce(-4.5, -6.5, 5.5); spruce(5.5, -8, 6.5); spruce(-11, -5, 4.8); spruce(14, -6, 5.2);
    // гаражи во дворе
    for (let i = 0; i < 6; i++) {
      const gx = -9 + i * 3.1, gz = -12;
      const tint = [0x6a5a4a, 0x55606a, 0x6b4a3a, 0x5a6250, 0x70685a, 0x4f5a66][i];
      B.add(box, tint, gx, 1.15, gz, 0, 0, 0, 3, 2.3, 5.5);
      B.add(box, new THREE.Color(tint).multiplyScalar(.7).getHex(), gx, 1.0, gz + 2.77, 0, 0, 0, 2.5, 2.0, .05);
      B.add(box, 0xdfe6f0, gx, 2.35, gz, 0, 0, 0, 3.05, .12, 5.6, .03);
    }
    // мусорные контейнеры
    for (let i = 0; i < 3; i++) {
      const cx = -3.6 + i * 1.25;
      B.add(box, [0x2f6a4a, 0x2f6a4a, 0x39597a][i], cx, .6, -4.6, 0, 0, 0, 1.1, 1.1, 1.0);
      B.add(box, 0x24523a, cx, 1.18, -4.6, .12, 0, 0, 1.12, .06, 1.02);
    }
    B.add(box, 0x7a5a3a, 2.2, .1, -2.4, 0, .3, 0, 1.2, .14, .8);   // поддон у задней двери
    // лавочка и урна у киоска
    B.add(cyl, 0x3d5a4c, 1.95, .34, 1.75, 0, 0, 0, .16, .68, .16);
    B.add(cyl, 0x6f7a74, 1.95, .69, 1.75, 0, 0, 0, .17, .03, .17);
    // припаркованная машина через дорогу
    const car = (x, z, c, ry) => {
      B.add(box, c, x, .55, z, 0, ry, 0, 4.1, .6, 1.75);
      B.add(box, c, x - .2, 1.05, z, 0, ry, 0, 2.2, .5, 1.6);
      B.add(box, 0x1f2a36, x - .2, 1.06, z, 0, ry, 0, 2.25, .38, 1.62, 0);
      B.add(box, 0xe6ecf4, x - .2, 1.33, z, 0, ry, 0, 2.1, .06, 1.5, .03);
      for (const [dx, dz] of [[-1.3, .8], [1.3, .8], [-1.3, -.8], [1.3, -.8]]) B.add(cyl, 0x151515, x + dx, .33, z + dz, Math.PI / 2, 0, 0, .33, .22, .33);
    };
    car(-6, 17.8, 0x8a2a2a, 0); car(15, 18, 0xb5b9bf, 0); car(-16, 17.8, 0x3a5a7a, 0);
    scene.add(B.mesh());
    View.lamps = lamps;
  }

  // ================================================================
  // Киоск: корпус, стекло, вывеска, гирлянда
  // ================================================================
  let hatchBoard, signGlow;
  function buildKioskShell() {
    const B = new Batch();
    const box = new THREE.BoxGeometry(1, 1, 1);
    const TER = 0xc9543a, TER2 = 0xa84430, CRM = 0xf1e2c6, IN = 0xeadcc2;
    // основание
    B.add(box, 0x6f7078, 0, .12, 0, 0, 0, 0, 3.1, .24, 2.5, .03);
    // пол
    B.add(box, 0x6b4a36, 0, .255, 0, 0, 0, 0, 2.9, .03, 2.3, .03);
    // перед: низ под прилавком, стойки, верхняя полоса
    B.add(box, TER, 0, .72, 1.2, 0, 0, 0, 3.0, .95, .08);
    B.add(box, CRM, 0, 1.2, 1.24, 0, 0, 0, 3.02, .06, .12);
    for (const x of [-1.46, 1.46]) B.add(box, TER, x, 1.8, 1.2, 0, 0, 0, .08, 1.2, .1);
    for (const x of [-.5, .5]) B.add(box, CRM, x, 1.8, 1.2, 0, 0, 0, .06, 1.2, .08);
    B.add(box, CRM, 0, 1.87, 1.2, 0, 0, 0, 1.0, .05, .07);       // перекладина над окошком
    B.add(box, TER, 0, 2.45, 1.2, 0, 0, 0, 3.0, .22, .1);
    // бока и зад: снаружи терракота, внутри кремовые
    for (const s of [-1, 1]) {
      B.add(box, TER, s * 1.5, 1.4, 0, 0, 0, 0, .08, 2.3, 2.4);
      B.add(box, IN, s * 1.445, 1.4, 0, 0, 0, 0, .03, 2.28, 2.3);
    }
    B.add(box, TER, 0, 1.4, -1.2, 0, 0, 0, 3.0, 2.3, .08);
    B.add(box, IN, 0, 1.4, -1.155, 0, 0, 0, 2.9, 2.28, .03);
    // горизонтальная полоса-молдинг по бокам
    for (const s of [-1, 1]) B.add(box, CRM, s * 1.54, 1.2, 0, 0, 0, 0, .02, .06, 2.42);
    B.add(box, CRM, 0, 1.2, -1.24, 0, 0, 0, 3.02, .06, .02);
    // дверь сзади
    B.add(box, TER2, .8, 1.25, -1.245, 0, 0, 0, .8, 1.95, .03);
    B.add(box, 0xd8c8a8, .5, 1.2, -1.27, 0, 0, 0, .05, .16, .04);
    // крыша со свесом и снегом
    B.add(box, 0x5a3a2e, 0, 2.62, 0, 0, 0, 0, 3.3, .14, 2.7);
    B.add(box, 0xe8eef6, 0, 2.72, 0, 0, 0, 0, 3.22, .09, 2.62, .03);
    const drift = new THREE.IcosahedronGeometry(1, 0);
    for (let i = 0; i < 8; i++) B.add(drift, 0xe8eef6, -1.4 + i * .4, 2.76, -1 + rnd() * 2, rnd(), rnd(), 0, .3, .08, .3, .03);
    // потолок
    B.add(box, 0xf3e8d4, 0, 2.53, 0, 0, 0, 0, 2.9, .03, 2.3);
    // козырёк-маркиза над окошком (полосы)
    for (let i = 0; i < 8; i++) B.add(box, i % 2 ? 0xf1e2c6 : 0xc9543a, -.7 + i * .2, 2.3, 1.48, -.5, 0, 0, .2, .02, .6, .02);
    // полочка снаружи окошка
    B.add(box, 0xd9c7a4, 0, 1.2, 1.36, 0, 0, 0, 1.1, .05, .3);
    B.add(box, 0x8a6a4a, 0, 1.08, 1.47, .6, 0, 0, 1.0, .03, .2);
    scene.add(B.mesh());

    // стекло
    const glass = new THREE.MeshLambertMaterial({ color: 0xaac4dc, transparent: true, opacity: .12, depthWrite: false, side: THREE.DoubleSide });
    const addGlass = (w, h, x, y, z) => { const g = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glass); g.position.set(x, y, z); scene.add(g); return g; };
    addGlass(.92, 1.15, -.96, 1.8, 1.2); addGlass(.92, 1.15, .96, 1.8, 1.2); addGlass(.96, .46, 0, 2.12, 1.2);

    // вывеска
    const signTex = canvasTex(1024, 192, (x, w, h) => {
      x.fillStyle = '#2a1712'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#ffd9a0'; x.font = '112px "Dela Gothic One", Rubik, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText('БОДРЯЧОК', w / 2, h / 2 - 6);
      x.fillStyle = '#ff9d5c'; x.font = '30px Rubik, sans-serif'; x.fillText('кофе с собой  ·  с 6:00', w / 2, h - 22);
    });
    signMat = new THREE.MeshBasicMaterial({ map: signTex, fog: false });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(2.6, .5, .12), [K.matVC, K.matVC, K.matVC, K.matVC, signMat, K.matVC]);
    sign.position.set(0, 3.02, 1.12); scene.add(sign);
    // экранный прямоугольник вывески: облачка реплик на титуле её не заслоняют
    const signCorners = [[-1.3, 2.77], [1.3, 2.77], [-1.3, 3.27], [1.3, 3.27]].map(([x, y]) => new THREE.Vector3(x, y, 1.18));
    View.signRect = () => {
      let l = 1e9, t = 1e9, r = -1e9, b = -1e9;
      for (const v of signCorners) { const p = View.project(v); if (!p.vis) return null; l = Math.min(l, p.x); r = Math.max(r, p.x); t = Math.min(t, p.y); b = Math.max(b, p.y); }
      return { x: l, y: t, w: r - l, h: b - t, up: true };
    };
    signGlow = glowSprite(0xffb070, 5, .35); signGlow.position.set(0, 3.0, 1.5); scene.add(signGlow);
    // меню на боковом стекле снаружи
    const menuTex = canvasTex(256, 360, (x, w, h) => {
      x.fillStyle = '#f6efe2'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#231b16'; x.font = 'bold 30px Rubik, sans-serif'; x.fillText('МЕНЮ', 20, 44);
      x.font = '21px "PT Mono", monospace';
      const rows = [['Эспрессо', '150'], ['Американо', '190'], ['Капучино', '200'], ['Латте', '250'], ['Раф', '290'], ['Чай', '120'], ['Овсяное', '+40'], ['Сироп', '+30']];
      rows.forEach((r, i) => { x.fillText(r[0], 20, 90 + i * 32); x.textAlign = 'right'; x.fillText(r[1], w - 20, 90 + i * 32); x.textAlign = 'left'; });
    });
    const menu = new THREE.Mesh(new THREE.PlaneGeometry(.5, .7), new THREE.MeshLambertMaterial({ map: menuTex }));
    menu.position.set(1.05, 1.68, 1.215); scene.add(menu);
    // гирлянда по краю крыши
    const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(.035, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }), 30);
    const colors = [0xffcf7a, 0xff8a6a, 0x9ad0ff, 0xb8f09a];
    const mm = new THREE.Matrix4();
    for (let i = 0; i < 30; i++) {
      const x = -1.55 + i * (3.1 / 29), y = 2.52 - Math.sin((i % 6) / 5 * Math.PI) * .07;
      mm.makeTranslation(x, y, 1.36); bulbs.setMatrixAt(i, mm); bulbs.setColorAt(i, new THREE.Color(colors[i % 4]));
    }
    scene.add(bulbs); View.bulbs = bulbs;
    // табличка «перерыв» в окошке (видна при перекуре)
    const boardTex = canvasTex(256, 160, (x, w, h) => {
      x.fillStyle = '#f6efe2'; x.fillRect(0, 0, w, h); x.strokeStyle = '#231b16'; x.lineWidth = 6; x.strokeRect(6, 6, w - 12, h - 12);
      x.fillStyle = '#c0392b'; x.font = 'bold 38px Rubik, sans-serif'; x.textAlign = 'center'; x.fillText('ПЕРЕРЫВ', w / 2, 68);
      x.fillStyle = '#231b16'; x.font = '30px Caveat, cursive'; x.fillText('5 минут!!!', w / 2, 118);
    });
    hatchBoard = new THREE.Mesh(new THREE.PlaneGeometry(.6, .38), new THREE.MeshLambertMaterial({ map: boardTex, side: THREE.DoubleSide }));
    hatchBoard.position.set(0, 1.5, 1.25); hatchBoard.visible = false; scene.add(hatchBoard);
    View.setBreakBoard = (on) => { hatchBoard.visible = on; };
    // освещение у лампы над дверью сзади
    // свет чуть вынесен от стены: освещает лицо курящего бариста и дворника, а не только дверь
    const backLamp = new THREE.PointLight(0xffd9a8, 5, 7, 1.7); backLamp.position.set(.8, 2.25, -2.7); scene.add(backLamp);
    const bl = glowSprite(0xffd0a0, 1.2, .6); bl.position.set(.2, 2.3, -1.32); scene.add(bl);
    const blm = new THREE.Mesh(new THREE.BoxGeometry(.18, .1, .12), new THREE.MeshBasicMaterial({ color: 0xffe2b8 })); blm.position.set(.2, 2.32, -1.28); scene.add(blm);
  }

  // ================================================================
  // Снег
  // ================================================================
  let snow, snowVel;
  function buildSnow() {
    const n = window.__SHOT__ ? 900 : 1300, p = new Float32Array(n * 3);
    snowVel = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      p[i * 3] = -22 + rnd() * 44; p[i * 3 + 1] = rnd() * 12; p[i * 3 + 2] = -14 + rnd() * 40;
      snowVel[i] = .5 + rnd() * .6;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const tex = canvasTex(32, 32, (x) => { const gr = x.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.5, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 32, 32); });
    snow = new THREE.Points(g, new THREE.PointsMaterial({ map: tex, size: .09, transparent: true, opacity: .9, depthWrite: false, color: 0xeef2ff }));
    scene.add(snow);
  }
  function updateSnow(dt, time) {
    const a = snow.geometry.attributes.position.array;
    for (let i = 0; i < snowVel.length; i++) {
      a[i * 3 + 1] -= snowVel[i] * dt;
      a[i * 3] += Math.sin(time * .7 + i) * .12 * dt;
      // внутри киоска снега нет
      const x = a[i * 3], y = a[i * 3 + 1], z = a[i * 3 + 2];
      if (y < 0 || (Math.abs(x) < 1.6 && z > -1.3 && z < 1.3 && y < 2.9)) { a[i * 3 + 1] = 11 + rnd(); a[i * 3] = -22 + rnd() * 44; }
    }
    snow.geometry.attributes.position.needsUpdate = true;
  }

  // ================================================================
  // Время суток
  // ================================================================
  let tmpA;
  function lerp3(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
  function setDay(t) {
    View.dayT = t;
    let i = 0; while (i < SKY.length - 2 && t > SKY[i + 1][0]) i++;
    const a = SKY[i], b = SKY[i + 1], u = clamp((t - a[0]) / (b[0] - a[0]), 0, 1);
    const top = lerp3(a[1], b[1], u), mid = lerp3(a[2], b[2], u), hor = lerp3(a[3], b[3], u), gl = lerp3(a[4], b[4], u);
    // шейдер неба пишет прямо в sRGB-буфер
    skyMat.uniforms.top.value.set(...top); skyMat.uniforms.mid.value.set(...mid); skyMat.uniforms.hor.value.set(...hor); skyMat.uniforms.glow.value.set(...gl);
    const fogC = new THREE.Color().setRGB(lerp(hor[0], mid[0], .5) * .62, lerp(hor[1], mid[1], .5) * .62, lerp(hor[2], mid[2], .5) * .68, THREE.SRGBColorSpace);
    scene.fog.color.copy(fogC);
    scene.fog.density = lerp(.02, .012, t);
    stars.material.opacity = clamp(1 - t / .4, 0, 1) * .8;
    const HS = [[.3, .36, .62], [.42, .44, .66], [.78, .7, .76], [.86, .9, .96]], HG = [[.16, .13, .18], [.2, .16, .2], [.36, .3, .28], [.42, .4, .38]];
    const hk = t * 3, hi = Math.min(2, Math.floor(hk)), hu = hk - hi;
    const hs = lerp3(HS[hi], HS[hi + 1], hu), hg = lerp3(HG[hi], HG[hi + 1], hu);
    hemi.color.setRGB(hs[0], hs[1], hs[2], THREE.SRGBColorSpace);
    hemi.groundColor.setRGB(hg[0], hg[1], hg[2], THREE.SRGBColorSpace);
    hemi.intensity = lerp(1.7, 2.1, t);
    sun.intensity = t < .35 ? 0 : lerp(0, 1.5, (t - .35) / .65);
    // фонари гаснут в 8:20
    const lampOn = t < .78 ? 1 : 0;
    for (const L of lampLights) L.intensity = 30 * lampOn;
    for (const g of lampGlows) { g.s.visible = !!lampOn; g.pool.visible = !!lampOn; g.lampGlow.material.color.setHex(lampOn ? 0xffc27a : 0x8a8a84); }
    renderer.toneMappingExposure = lerp(1.1, .95, t);
  }
  View.setDay = setDay;

  // ================================================================
  // Камера: титул, от первого лица, перекур, финал
  // ================================================================
  let CAMS;
  function makeCams() {
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  CAMS = {
    title:  { pos: V3(5.9, 2.25, 7.4), tgt: V3(-2.6, 1.55, 3.0) },
    titleP: { pos: V3(1.4, 2.6, 11.0), tgt: V3(-.7, .45, 2.0) },
    fp:     { pos: V3(-.12, 1.9, -.84), tgt: V3(-.12, 1.38, 2.2) },
    fpP:    { pos: V3(-.2, 2.12, -1.0), tgt: V3(-.2, 1.3, 1.9) },
    machine: { pos: V3(-.5, 1.8, -.25), tgt: V3(-.74, 1.28, .72) },
    machineP: { pos: V3(-.62, 1.86, -.45), tgt: V3(-.76, 1.26, .7) },
    grinder: { pos: V3(-.85, 1.78, -.25), tgt: V3(-1.1, 1.25, .8) },
    grinderP: { pos: V3(-1.0, 1.85, -.4), tgt: V3(-1.18, 1.22, .75) },
    down:   { pos: V3(0, 1.75, -.6), tgt: V3(0, .4, .95) },
    fridge: { pos: V3(.35, 1.6, -.5), tgt: V3(.72, .5, .9) },
    smoke:  { pos: V3(3.6, 1.7, -5.4), tgt: V3(.2, 1.25, -1.35) },
    smokeP: { pos: V3(2.4, 1.85, -7.9), tgt: V3(-.4, 1.35, -2.0) },
    final:  { pos: V3(-5.6, 3.2, 10.2), tgt: V3(.2, 1.4, 1.2) },
  };
  View.CAMS = CAMS;
  camState.pos = V3(0, 0, 0); camState.tgt = V3(0, 0, 0);
  }

  const camState = { pos: null, tgt: null, from: null, to: null, t: 1, dur: 1, name: 'title' };
  View.cam = function (name, dur = 1.3) {
    const key = View.portrait && CAMS[name + 'P'] ? name + 'P' : name;
    const c = CAMS[key]; if (!c) return;
    camState.from = { pos: camState.pos.clone(), tgt: camState.tgt.clone() };
    camState.to = c; camState.t = 0; camState.dur = dur; camState.name = name;
  };
  View.camName = () => camState.name;
  const pointer = { x: 0, y: 0, cx: 0, cy: 0 };
  let sway = 0, tremor = 0, shake = 0;
  View.setDrunk = (p) => { sway = p; };
  View.setTremor = (t) => { tremor = t; };
  View.shake = (a = .5) => { shake = Math.max(shake, a); };

  function updateCamera(dt, time) {
    if (camState.t < 1 && camState.to) {
      camState.t = Math.min(1, camState.t + dt / camState.dur);
      const e = ease(camState.t);
      camState.pos.lerpVectors(camState.from.pos, camState.to.pos, e);
      camState.tgt.lerpVectors(camState.from.tgt, camState.to.tgt, e);
    } else if (camState.to) {
      camState.pos.copy(camState.to.pos); camState.tgt.copy(camState.to.tgt);
    }
    camera.position.copy(camState.pos);
    tmpA.copy(camState.tgt);
    const n = camState.name;
    if (n === 'title' || n === 'final') {
      // медленный облёт
      const a = Math.sin(time * .07) * (n === 'title' ? .07 : .2);
      const dx = camera.position.x - tmpA.x, dz = camera.position.z - tmpA.z;
      camera.position.x = tmpA.x + dx * Math.cos(a) - dz * Math.sin(a);
      camera.position.z = tmpA.z + dx * Math.sin(a) + dz * Math.cos(a);
      camera.position.y += Math.sin(time * .23) * .12;
    } else if (n === 'fp' || n === 'machine') {
      // взгляд чуть следует за мышью
      tmpA.x += pointer.x * .35; tmpA.y -= pointer.y * .18;
    }
    // пьяное покачивание и тремор
    const s = sway;
    if (s > 0.01) {
      tmpA.x += Math.sin(time * .61) * .35 * s + Math.sin(time * 1.37) * .08 * s;
      tmpA.y += Math.sin(time * .83 + 1) * .16 * s;
      camera.position.x += Math.sin(time * .47) * .06 * s;
      camera.position.y += Math.sin(time * .71) * .04 * s;
    }
    const tr = tremor * .004 + shake * .04;
    if (tr > 0.0005) { tmpA.x += (Math.random() - .5) * tr; tmpA.y += (Math.random() - .5) * tr; }
    shake = Math.max(0, shake - dt * 1.5);
    camera.lookAt(tmpA);
    if (s > 0.01) camera.rotateZ(Math.sin(time * .53) * .05 * s);
  }

  // ================================================================
  // Выбор предметов мышью
  // ================================================================
  let ray;
  let hoverDirty = false;
  View.pickables = [];
  function hitAt(cx, cy) {
    if (!View.pickables.length) return null;
    const v = new THREE.Vector2(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1);
    ray.setFromCamera(v, camera);
    const hits = ray.intersectObjects(View.pickables, true);
    for (const h of hits) { let o = h.object; while (o && !o.userData.station) o = o.parent; if (o && o.visible) return o.userData.station; }
    return null;
  }
  function onPick(e) {
    const st = hitAt(e.clientX, e.clientY);
    if (st && View.onPick) View.onPick(st);
  }
  function updateHover() {
    if (!hoverDirty) return; hoverDirty = false;
    const st = ['fp', 'machine', 'grinder'].includes(camState.name) ? hitAt(pointer.cx, pointer.cy) : null;
    renderer.domElement.classList.toggle('pick', !!st);
    if (View.onHover) View.onHover(st, pointer.cx, pointer.cy);
  }

  // экранные координаты точки
  let projV;
  View.project = function (v3) {
    projV.copy(v3).project(camera);
    return { x: (projV.x + 1) / 2 * innerWidth, y: (1 - projV.y) / 2 * innerHeight, vis: projV.z < 1 && projV.z > -1 };
  };

  // ================================================================
  // Цикл
  // ================================================================
  let last = 0, running = false;
  View.onFrame = null;
  function loop() {
    if (running) return; running = true;
    requestAnimationFrame(frame);
  }
  function frame() {
    running = false;
    if (document.hidden) return;
    const raw = clock.getDelta();
    adaptQuality(raw);
    const dt = Math.min(raw, window.__SHOT__ ? 1 : .25);
    const time = clock.elapsedTime;
    updateSnow(dt, time);
    updateHouses(View.dayT, dt);
    if (View.bulbs && Math.floor(time * 2) !== last) { last = Math.floor(time * 2); View.bulbs.material.color.setScalar(.9 + Math.random() * .1); }
    if (View.people) View.people.update(dt, time);
    if (View.props) View.props.update(dt, time);
    updateCamera(dt, time);
    updateHover();
    if (View.onFrame) View.onFrame(dt, time);
    renderer.render(scene, camera);
    if (!View.drawn) { View.drawn = true; if (View.onFirstFrame) setTimeout(View.onFirstFrame, 0); }
    loop();
  }
  let lastFilter = '';
  View.canvasFilter = (f) => { f = f || ''; if (f !== lastFilter) { lastFilter = f; renderer.domElement.style.filter = f; } };
})();
