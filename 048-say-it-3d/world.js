/* ================================================================
   Мир: рендерер, камера, постамент-диорама, задник, вода, погода,
   свет по времени суток, дым и пыль, постобработка (bloom + tilt-shift).
   Всё окружение плавно перетекает к целевым значениям env.
   ================================================================ */
(function () {
  'use strict';
  if (!window.THREE) return;
  const T = THREE, A = THREE_ADDONS, L = S3.lang, PI = Math.PI;
  const SHOT = !!window.__SHOT__;
  const W = { frameFns: [] };
  const stage = document.getElementById('stage');

  // ---------- рендерер и камера ----------
  const renderer = new T.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  const PR = () => (SHOT ? 1 : Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setPixelRatio(PR());
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.toneMapping = T.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  stage.appendChild(renderer.domElement);

  const scene = new T.Scene();
  scene.fog = new T.Fog(0xe9dccb, 200, 400);
  const camera = new T.PerspectiveCamera(30, innerWidth / innerHeight, 1, 600);
  const controls = new A.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.07;
  controls.enablePan = false;
  controls.minPolarAngle = 0.25; controls.maxPolarAngle = 1.36;
  controls.autoRotate = true; controls.autoRotateSpeed = 0.32;
  controls.rotateSpeed = 0.6; controls.zoomSpeed = 0.8;
  controls.target.set(0, 1.2, 0);
  let fit = 40, idleAt = 0;
  controls.addEventListener('start', () => { controls.autoRotate = false; idleAt = Infinity; });
  controls.addEventListener('end', () => { idleAt = performance.now() + 7000; });

  function viewShift() { return innerWidth < 720 ? 0.075 : 0.115; }
  function fitCamera(keepDir) {
    const w = innerWidth, h = innerHeight, portrait = w / h < 0.9;
    camera.fov = portrait ? 38 : 30;
    camera.aspect = w / h;
    const v = Math.tan((camera.fov * PI) / 360), hh = v * camera.aspect;
    fit = Math.max((portrait ? 10.5 : 15) / hh, (portrait ? 11.5 : 14) / v);
    camera.setViewOffset(w, h, 0, h * viewShift(), w, h);
    camera.updateProjectionMatrix();
    controls.minDistance = fit * 0.42; controls.maxDistance = fit * 1.5;
    const dir = keepDir ? camera.position.clone().sub(controls.target).normalize() : new T.Vector3(Math.sin(0.5) * Math.sin(0.98), Math.cos(0.98), Math.cos(0.5) * Math.sin(0.98));
    camera.position.copy(controls.target).addScaledVector(dir, fit);
    controls.update();
  }

  // ---------- постобработка ----------
  const rt = new T.WebGLRenderTarget(innerWidth * PR(), innerHeight * PR(), { type: T.HalfFloatType, samples: 4 });
  const composer = new A.EffectComposer(renderer, rt);
  composer.addPass(new A.RenderPass(scene, camera));
  const bloom = new A.UnrealBloomPass(new T.Vector2(innerWidth, innerHeight), 0.2, 0.55, 0.86);
  composer.addPass(bloom);
  // tilt-shift: размываем верх и низ кадра — глаз читает сцену как миниатюру
  const tilt = new A.ShaderPass({
    uniforms: { tDiffuse: { value: null }, res: { value: new T.Vector2(1, 1) }, focus: { value: 0.5 }, amount: { value: 3 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 res; uniform float focus; uniform float amount; varying vec2 vUv;
      void main(){
        float d = abs(vUv.y - focus);
        float r = smoothstep(0.16, 0.62, d) * amount;
        vec4 acc = texture2D(tDiffuse, vUv); float w = 1.0;
        if (r > 0.35) {
          for (int i = 0; i < 12; i++) {
            float a = float(i) * 2.39996; float rr = sqrt((float(i) + 0.5) / 12.0) * r;
            acc += texture2D(tDiffuse, vUv + vec2(cos(a), sin(a)) * rr / res); w += 1.0;
          }
        }
        gl_FragColor = acc / w;
      }`,
  });
  composer.addPass(tilt);
  composer.addPass(new A.OutputPass());

  // ---------- задник: студийный градиент, пятно света, звёзды ----------
  const back = new T.Mesh(new T.PlaneGeometry(2, 2), new T.ShaderMaterial({
    uniforms: { top: { value: new T.Color() }, bottom: { value: new T.Color() }, glow: { value: new T.Color() }, stars: { value: 0 }, time: { value: 0 }, aspect: { value: 1 }, flash: { value: 0 }, moon: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.99999, 1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform vec3 glow; uniform float stars; uniform float time; uniform float aspect; uniform float flash; uniform float moon; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main(){
        vec2 uv = vUv;
        vec3 c = mix(bottom, top, smoothstep(0.02, 1.0, uv.y));
        vec2 d = (uv - vec2(0.5, 0.56)) * vec2(aspect, 1.0);
        c += glow * exp(-dot(d, d) * 2.4) * 0.5;
        if (stars > 0.01) {
          vec2 g = uv * vec2(aspect, 1.0) * 170.0; vec2 id = floor(g); vec2 f = fract(g) - 0.5;
          float r = h(id);
          if (r > 0.985) {
            float tw = 0.55 + 0.45 * sin(time * (1.0 + r * 3.0) + r * 60.0);
            c += vec3(0.9, 0.93, 1.0) * smoothstep(0.2, 0.0, length(f)) * tw * stars * smoothstep(0.25, 0.7, uv.y) * 1.2;
          }
          float mr = 0.05 * min(1.0, aspect * 1.4);
          vec2 m = (uv - vec2(0.82, aspect < 1.0 ? 0.87 : 0.8)) * vec2(aspect, 1.0);
          float md = length(m);
          c += vec3(1.0, 0.96, 0.86) * (smoothstep(mr, mr * 0.88, md) * 0.72 + exp(-md / mr * 0.9) * 0.1) * moon;
        }
        c += vec3(0.75, 0.8, 1.0) * flash * 0.5;
        c *= 1.0 - 0.28 * dot(d * 0.75, d * 0.75);
        gl_FragColor = vec4(c, 1.0);
      }`,
    depthWrite: false, depthTest: false,
  }));
  back.frustumCulled = false; back.renderOrder = -10;
  scene.add(back);

  // ---------- постамент: суша, срез почвы, деревянное основание ----------
  function noise2(x, y) { return Math.sin(x * 1.7 + Math.sin(y * 1.3) * 1.5) * 0.5 + Math.sin(y * 2.3 + Math.cos(x * 0.9) * 1.2) * 0.5; }
  function vcolors(g, fn) {
    const p = g.attributes.position, arr = new Float32Array(p.count * 3), c = new T.Color();
    for (let i = 0; i < p.count; i++) { fn(p.getX(i), p.getY(i), p.getZ(i), c); arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new T.BufferAttribute(arr, 3));
    return g;
  }
  const island = new T.Group(); scene.add(island);
  const land = new T.Group(); island.add(land);
  const topGeo = new T.RingGeometry(0.0001, 1, 96, 14); topGeo.rotateX(-PI / 2);
  vcolors(topGeo, (x, y, z, c) => {
    const n = noise2(x * 5, z * 5) * 0.5 + noise2(x * 13 + 4, z * 11 - 2) * 0.25;
    const r = Math.hypot(x, z);
    const v = 0.96 + n * 0.07 - Math.max(0, r - 0.93) * 0.9;
    c.setRGB(v, v, v * 0.98);
  });
  const topMat = new T.MeshStandardMaterial({ color: 0x7cb35b, vertexColors: true, roughness: 0.96 });
  const landTop = new T.Mesh(topGeo, topMat); landTop.receiveShadow = true; land.add(landTop);
  const lipMat = new T.MeshStandardMaterial({ color: 0x5f8f45, roughness: 1 });
  const lip = new T.Mesh(new T.CylinderGeometry(1, 1.004, 0.18, 96, 1, true), lipMat);
  lip.position.y = -0.09; lip.receiveShadow = true; land.add(lip);
  const SOIL = ['#7a553c', '#6a4631', '#8a6446', '#5d3e2c', '#6f5a4c', '#5a524c'];
  const soilGeo = vcolors(new T.CylinderGeometry(1, 1.008, 0.44, 96, 4, true), (x, y, z) => { void x; void y; void z; });
  const soilMat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  function strata(g, y0, y1) {
    const p = g.attributes.position, col = g.attributes.color, c = new T.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i) + y0, z = p.getZ(i), a = Math.atan2(z, x);
      const t = (y1 - y) + Math.sin(a * 5) * 0.08 + Math.sin(a * 13 + 1) * 0.05;
      const band = Math.floor(t / 0.42);
      c.set(SOIL[Math.min(SOIL.length - 1, Math.max(0, band))]);
      c.multiplyScalar(0.94 + ((band * 7919) % 5) * 0.025);
      col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
  }
  strata(soilGeo, -0.4, -0.18);
  const soil = new T.Mesh(soilGeo, soilMat); soil.position.y = -0.4; land.add(soil);

  const wallGeo = vcolors(new T.CylinderGeometry(L.R, L.R * 0.985, 1.95, 160, 10, true), () => {});
  strata(wallGeo, -1.6, -0.62);
  const wall = new T.Mesh(wallGeo, soilMat); wall.position.y = -1.6; island.add(wall);
  const seabed = new T.Mesh(new T.CircleGeometry(L.R, 96).rotateX(-PI / 2), new T.MeshStandardMaterial({ color: 0xd2bb8b, roughness: 1 }));
  seabed.position.y = -0.6; seabed.receiveShadow = true; island.add(seabed);
  const under = new T.Mesh(new T.CircleGeometry(L.R, 64).rotateX(PI / 2), new T.MeshStandardMaterial({ color: 0x3a2a22, roughness: 1 }));
  under.position.y = -2.57; island.add(under);
  // деревянный пьедестал с латунным кантом
  const woodMat = new T.MeshStandardMaterial({ color: 0x4a3226, roughness: 0.55, metalness: 0.05 });
  const base = new T.Mesh(new T.CylinderGeometry(L.R + 0.5, L.R + 0.75, 0.7, 128), woodMat);
  base.position.y = -2.95; base.receiveShadow = true; island.add(base);
  const brass = new T.Mesh(new T.TorusGeometry(L.R + 0.5, 0.05, 6, 160).rotateX(PI / 2), new T.MeshStandardMaterial({ color: 0xc9a25a, metalness: 0.9, roughness: 0.3 }));
  brass.position.y = -2.6; island.add(brass);
  // мягкая тень пьедестала на «полу»
  const shCv = document.createElement('canvas'); shCv.width = shCv.height = 128;
  { const g = shCv.getContext('2d'); const gr = g.createRadialGradient(64, 64, 10, 64, 64, 64); gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.22)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }
  const floorShadow = new T.Mesh(new T.PlaneGeometry(34, 34).rotateX(-PI / 2), new T.MeshBasicMaterial({ map: new T.CanvasTexture(shCv), transparent: true, depthWrite: false, opacity: 0.5, fog: false }));
  floorShadow.position.y = -5.2; island.add(floorShadow);

  // вода вокруг острова и пена у берега
  const waterMat = new T.MeshStandardMaterial({ color: 0x3a9ec2, emissive: 0x0d4a66, emissiveIntensity: 0.42, roughness: 0.12, metalness: 0, transparent: true, opacity: 0.84 });
  const water = new T.Mesh(new T.CylinderGeometry(L.R - 0.02, L.R - 0.02, 0.5, 128), waterMat);
  water.position.y = -0.35; water.visible = false; water.renderOrder = 2; island.add(water);
  const foam = new T.Mesh(new T.RingGeometry(0.985, 1.045, 128, 1).rotateX(-PI / 2), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false }));
  foam.position.y = -0.093; foam.visible = false; island.add(foam);
  W.waterY = -0.1;

  // ---------- свет ----------
  const hemi = new T.HemisphereLight(0xdbe9f7, 0xa39170, 1.2); scene.add(hemi);
  const sun = new T.DirectionalLight(0xfff4e0, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 5, far: 80 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  // пул точечных источников постоянного размера: число огней не меняется — шейдеры не пересобираются
  const pool = [];
  for (let i = 0; i < 6; i++) { const p = new T.PointLight(0xffc070, 0, 8, 2); scene.add(p); pool.push(p); }
  W.lightPool = pool;

  // ---------- время суток и погода: цели ----------
  const TIMES = {
    morning: { top: '#8fb2d6', bottom: '#f3d3bf', glow: '#ffe9d2', hs: '#e2ebf5', hg: '#b9a27e', hi: 1.55, sun: '#ffdcb4', si: 2.2, az: 1.25, el: 0.5, night: 0 },
    day:     { top: '#7fb0de', bottom: '#efe7d8', glow: '#fffaf0', hs: '#e6f0fa', hg: '#bba77f', hi: 1.7, sun: '#fff3de', si: 2.4, az: -0.45, el: 0.98, night: 0 },
    sunset:  { top: '#4d5b96', bottom: '#f1a47a', glow: '#ffc58f', hs: '#d9bcc8', hg: '#a17c62', hi: 1.4, sun: '#ffb070', si: 2.3, az: -1.05, el: 0.36, night: 0.3 },
    night:   { top: '#0b1230', bottom: '#27365f', glow: '#41558f', hs: '#5569a8', hg: '#26263a', hi: 0.75, sun: '#a9bcff', si: 0.55, az: 0.9, el: 0.85, night: 1 },
  };
  const GROUND = { grass: '#7cb35b', meadow: '#98c35e', autumn: '#c99f4c', snow: '#eef3f6', sand: '#e6cf98', desert: '#dcb07a', rock: '#8e8a83', moon: '#bdbbb5', mars: '#c56b40' };
  const WCOL = { cloudy: '#ffffff', rain: '#a3a9b2', storm: '#6f747e', snow: '#eef1f5' };
  const WCOUNT = { cloudy: 5, rain: 4, storm: 5, snow: 3 };

  const cur = {}, tgt = {};
  const COLS = ['top', 'bottom', 'glow', 'hs', 'hg', 'sun', 'ground', 'lip'];
  const NUMS = ['hi', 'si', 'night', 'fog', 'rain', 'snow', 'storm', 'landR', 'wind', 'sea'];
  for (const k of COLS) { cur[k] = new T.Color(); tgt[k] = new T.Color(); }
  const sunDir = new T.Vector3(), sunTgt = new T.Vector3();
  W.env = L.defaultEnv();
  const grayOf = (c) => { const l = c.r * 0.3 + c.g * 0.59 + c.b * 0.11; return new T.Color(l, l, l); };

  function computeTargets(env) {
    const P = TIMES[env.time] || TIMES.day, w = env.weather;
    tgt.top.set(P.top); tgt.bottom.set(P.bottom); tgt.glow.set(P.glow);
    tgt.hs.set(P.hs); tgt.hg.set(P.hg); tgt.sun.set(P.sun);
    let si = P.si, hi = P.hi, gray = 0, dark = 0;
    tgt.fog = 0; tgt.rain = 0; tgt.snow = 0; tgt.storm = 0;
    if (w === 'cloudy') { si *= 0.5; gray = 0.35; }
    if (w === 'rain') { si *= 0.32; hi *= 0.9; gray = 0.55; dark = 0.12; tgt.rain = 1; }
    if (w === 'storm') { si *= 0.22; hi *= 0.72; gray = 0.6; dark = 0.35; tgt.rain = 1.4; tgt.storm = 1; }
    if (w === 'snow') { si *= 0.62; gray = 0.3; tgt.snow = 1; }
    if (w === 'fog') { si *= 0.55; gray = 0.45; tgt.fog = 1; }
    if (env.sky) { tgt.top.set(env.sky[0]); tgt.bottom.set(env.sky[1]); tgt.glow.copy(tgt.bottom).lerp(new T.Color('#ffffff'), 0.25); }
    for (const k of ['top', 'bottom', 'glow']) { tgt[k].lerp(grayOf(tgt[k]), gray); tgt[k].multiplyScalar(1 - dark); }
    if (w === 'snow') { tgt.bottom.lerp(new T.Color('#e4e9ef'), 0.35 * (1 - P.night)); }
    tgt.si = si; tgt.hi = hi; tgt.night = P.night;
    const el = P.el, az = P.az;
    sunTgt.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    const g = new T.Color(GROUND[env.ground] || GROUND.grass);
    if (w === 'snow' && env.ground !== 'snow') g.lerp(new T.Color('#f1f4f7'), 0.72);
    if (env.ground === 'autumn' || env.ground === 'desert' || env.ground === 'mars') g.offsetHSL(0, 0, 0);
    tgt.ground.copy(g); tgt.lip.copy(g).multiplyScalar(0.72);
    tgt.landR = L.landRadius(env.sea);
    tgt.sea = env.sea > 0.02 ? 1 : 0;
    tgt.wind = Math.min(1, env.wind + (w === 'storm' ? 0.5 : w === 'rain' ? 0.15 : 0));
  }

  W.setEnv = function (env, instant) {
    const prevW = W.env.weather;
    W.env = { ...env };
    computeTargets(env);
    if (instant) { for (const k of COLS) cur[k].copy(tgt[k]); for (const k of NUMS) cur[k] = tgt[k]; sunDir.copy(sunTgt); }
    if (instant || prevW !== env.weather || !wClouds.length !== !WCOUNT[env.weather]) setWeatherClouds(env.weather, instant);
  };

  // ---------- облака погоды: свои, не из графа сцены ----------
  let wClouds = [];
  function setWeatherClouds(w, instant) {
    for (const c of wClouds) c.dying = true;
    const n = WCOUNT[w] || 0;
    for (let i = 0; i < n; i++) {
      const b = new S3.recipes.Builder({ id: 'w' + w + i, type: 'cloud', kind: w === 'storm' ? 'storm' : 'puffy' });
      S3.recipes.R.cloud(b, { id: 'w' + i, type: 'cloud', kind: 'puffy', color: WCOL[w] });
      const g = b.done();
      const a = (i / n) * PI * 2 + 0.4, r = 2.4 + (i % 2) * 3;
      const holder = new T.Group(); holder.add(g);
      holder.position.set(Math.cos(a) * r, 7.9 + (i % 3) * 0.5, Math.sin(a) * r);
      g.scale.setScalar(instant ? 1.1 : 0.001);
      g.traverse((m) => { if (m.isMesh) { m.castShadow = w !== 'snow'; } });
      scene.add(holder);
      wClouds.push({ holder, g, a, r, sp: 0.03 + (i % 3) * 0.012, life: instant ? 1 : 0, dying: false, s: 1.1 - (i % 2) * 0.25 });
    }
  }
  function disposeTree(o) {
    o.traverse((m) => {
      if (m.geometry && !m.geometry.userData.shared) m.geometry.dispose();
      if (m.material) for (const mt of [].concat(m.material)) if (!mt.userData.shared) { if (mt.map) mt.map.dispose(); mt.dispose(); }
    });
  }
  W.disposeTree = disposeTree;

  // ---------- дождь и снег: частицы в колонне над островом ----------
  const RAIN_N = 1100, rainPos = new Float32Array(RAIN_N * 6), rainSeed = new Float32Array(RAIN_N * 3);
  for (let i = 0; i < RAIN_N; i++) {
    const a = Math.random() * PI * 2, r = Math.sqrt(Math.random()) * (L.R + 0.3);
    rainSeed[i * 3] = Math.cos(a) * r; rainSeed[i * 3 + 1] = Math.random() * 16; rainSeed[i * 3 + 2] = Math.sin(a) * r;
  }
  const rainGeo = new T.BufferGeometry(); rainGeo.setAttribute('position', new T.BufferAttribute(rainPos, 3));
  const rainMat = new T.LineBasicMaterial({ color: 0xbfd3e6, transparent: true, opacity: 0, depthWrite: false });
  const rain = new T.LineSegments(rainGeo, rainMat); rain.frustumCulled = false; rain.visible = false; scene.add(rain);

  const flakeCv = document.createElement('canvas'); flakeCv.width = flakeCv.height = 32;
  { const g = flakeCv.getContext('2d'); const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); }
  const flakeTex = new T.CanvasTexture(flakeCv);
  const SNOW_N = 900, snowPos = new Float32Array(SNOW_N * 3), snowSeed = new Float32Array(SNOW_N * 4);
  for (let i = 0; i < SNOW_N; i++) {
    const a = Math.random() * PI * 2, r = Math.sqrt(Math.random()) * (L.R + 0.3);
    snowSeed[i * 4] = Math.cos(a) * r; snowSeed[i * 4 + 1] = Math.random() * 14; snowSeed[i * 4 + 2] = Math.sin(a) * r; snowSeed[i * 4 + 3] = Math.random() * 6;
  }
  const snowGeo = new T.BufferGeometry(); snowGeo.setAttribute('position', new T.BufferAttribute(snowPos, 3));
  const snowMat = new T.PointsMaterial({ size: 0.2, map: flakeTex, transparent: true, opacity: 0, depthWrite: false, color: 0xffffff });
  const snow = new T.Points(snowGeo, snowMat); snow.frustumCulled = false; snow.visible = false; scene.add(snow);

  // молния: зигзаг от облака к земле
  const boltGeo = new T.BufferGeometry(); boltGeo.setAttribute('position', new T.BufferAttribute(new Float32Array(10 * 3), 3));
  const bolt = new T.Line(boltGeo, new T.LineBasicMaterial({ color: 0xf2f4ff, transparent: true, opacity: 0.95, fog: false }));
  bolt.visible = false; bolt.frustumCulled = false; scene.add(bolt);
  let flash = 0, nextBolt = 3;
  function strike() {
    flash = 1;
    const a = Math.random() * PI * 2, r = 2 + Math.random() * 6, p = bolt.geometry.attributes.position;
    let x = Math.cos(a) * r, z = Math.sin(a) * r;
    for (let i = 0; i < 10; i++) { const y = 9.5 - i * 1.05; p.setXYZ(i, x, y, z); x += (Math.random() - 0.5) * 0.9; z += (Math.random() - 0.5) * 0.9; }
    p.needsUpdate = true; bolt.visible = true;
    if (W.onThunder) W.onThunder();
  }

  // ---------- дым из труб, пар, пыль при приземлении ----------
  const PUFF_N = 160;
  const puffMat = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true, transparent: true, opacity: 0.72, depthWrite: false });
  const puffs = new T.InstancedMesh(new T.IcosahedronGeometry(0.5, 0), puffMat, PUFF_N);
  puffs.instanceMatrix.setUsage(T.DynamicDrawUsage);
  puffs.frustumCulled = false; puffs.renderOrder = 3;
  scene.add(puffs);
  const P = [];
  for (let i = 0; i < PUFF_N; i++) P.push({ age: 1, life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 0 });
  const _m = new T.Matrix4(), _q = new T.Quaternion(), _s = new T.Vector3(), _p = new T.Vector3(), _c = new T.Color();
  let puffI = 0;
  function spawn(x, y, z, vx, vy, vz, s, life, color) {
    const idx = puffI, p = P[idx]; puffI = (puffI + 1) % PUFF_N;
    Object.assign(p, { age: 0, life, x, y, z, vx, vy, vz, s });
    puffs.setColorAt(idx, _c.set(color));
    if (puffs.instanceColor) puffs.instanceColor.needsUpdate = true;
  }
  W.dust = function (x, y, z, radius, color) {
    const n = Math.min(10, 4 + Math.round(radius * 3));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * PI * 2 + Math.random() * 0.4;
      spawn(x + Math.cos(a) * radius * 0.6, y + 0.1, z + Math.sin(a) * radius * 0.6, Math.cos(a) * 1.6, 0.5 + Math.random() * 0.4, Math.sin(a) * 1.6, 0.35 + radius * 0.25, 0.7, color || '#e8dccb');
    }
  };
  let emitters = [];
  W.setEmitters = (list) => { emitters = list; };
  function updatePuffs(dt) {
    for (const e of emitters) {
      e.acc = Math.min(2, (e.acc || 0) + dt * (e.rate || 1.2));
      while (e.acc > 1) {
        e.acc -= 1;
        const p = e.get(_p);
        if (!p) break;
        const big = e.big ? 1.8 : e.steam ? 0.45 : 1;
        spawn(p.x, p.y, p.z, (Math.random() - 0.5) * 0.15 + W.wind * 0.5, (e.steam ? 0.5 : 0.75) * big, (Math.random() - 0.5) * 0.15, 0.32 * big, e.steam ? 1.6 : 3.2, e.color || (W.nightF > 0.6 ? '#9aa0b0' : '#e9e4dc'));
      }
    }
    for (let i = 0; i < PUFF_N; i++) {
      const p = P[i];
      if (p.age >= 1) { _m.makeScale(0, 0, 0); puffs.setMatrixAt(i, _m); continue; }
      p.age += dt / p.life;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.vx *= 1 - dt * 1.5; p.vz *= 1 - dt * 1.5; p.vy *= 1 - dt * 0.4;
      const k = Math.sin(Math.min(1, p.age) * PI) ** 0.7 * (0.6 + p.age * 1.2);
      _s.setScalar(p.s * k); _p.set(p.x, p.y, p.z);
      _m.compose(_p, _q, _s); puffs.setMatrixAt(i, _m);
    }
    puffs.instanceMatrix.needsUpdate = true;
  }

  // ---------- искры «думаю»: вихрь над островом, пока нейросеть собирает граф ----------
  const MOTE_N = 150, motePos = new Float32Array(MOTE_N * 3), moteSeed = [];
  for (let i = 0; i < MOTE_N; i++) moteSeed.push({ a: Math.random() * PI * 2, r: 1 + Math.random() * 7.5, h: Math.random() * 5, ph: Math.random() * 6, sp: 0.4 + Math.random() * 0.6 });
  const moteGeo = new T.BufferGeometry(); moteGeo.setAttribute('position', new T.BufferAttribute(motePos, 3));
  const moteMat = new T.PointsMaterial({ size: 0.28, map: flakeTex, color: 0xffd08a, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending });
  const motes = new T.Points(moteGeo, moteMat); motes.frustumCulled = false; motes.visible = false; scene.add(motes);
  let think = 0, thinkTgt = 0;
  W.setThinking = (on) => { thinkTgt = on ? 1 : 0; };

  // ---------- кадр ----------
  const clock = new T.Clock();
  let time = 0, running = false;
  W.nightF = 0; W.wind = 0.3; W.time = 0;
  function lerpEnv(dt) {
    const k = 1 - Math.exp(-dt * 2.2);
    for (const c of COLS) cur[c].lerp(tgt[c], k);
    for (const n of NUMS) cur[n] += (tgt[n] - cur[n]) * k;
    sunDir.lerp(sunTgt, k).normalize();
    back.material.uniforms.top.value.copy(cur.top);
    back.material.uniforms.bottom.value.copy(cur.bottom);
    back.material.uniforms.glow.value.copy(cur.glow).multiplyScalar(1 - cur.night * 0.4);
    back.material.uniforms.stars.value = Math.max(0, cur.night - 0.3) / 0.7 * (1 - Math.min(1, cur.rain + cur.fog * 0.8));
    back.material.uniforms.moon.value = Math.max(0, cur.night - 0.5) * 2 * (1 - Math.min(1, cur.rain + cur.snow * 0.5));
    hemi.color.copy(cur.hs); hemi.groundColor.copy(cur.hg);
    hemi.intensity = cur.hi + flash * 2.5;
    sun.color.copy(cur.sun); sun.intensity = cur.si;
    sun.position.copy(sunDir).multiplyScalar(40); sun.target.position.set(0, 0, 0);
    topMat.color.copy(cur.ground); lipMat.color.copy(cur.lip);
    land.scale.set(cur.landR, 1, cur.landR);
    const seaOn = cur.sea > 0.01 && cur.landR < L.R - 0.05;
    water.visible = seaOn; foam.visible = seaOn;
    waterMat.opacity = 0.84 * Math.min(1, cur.sea * 1.3);
    waterMat.emissiveIntensity = 0.42 * (1 - cur.night * 0.8);
    foam.scale.set(cur.landR, 1, cur.landR);
    foam.material.opacity = (0.35 + Math.sin(time * 1.6) * 0.15) * cur.sea;
    // туман
    const d = camera.position.distanceTo(controls.target);
    scene.fog.color.copy(cur.bottom).lerp(cur.top, 0.25);
    scene.fog.near = d + 30 - cur.fog * 34;
    scene.fog.far = d + 120 - cur.fog * 100;
    W.nightF = cur.night; W.wind = cur.wind;
    bloom.strength = 0.16 + cur.night * 0.5 + cur.storm * 0.1;
    bloom.threshold = 0.9 - cur.night * 0.25;
    renderer.toneMappingExposure = 1.02 + cur.night * 0.12;
  }

  function updateWeather(dt) {
    // дождь
    const ro = Math.min(1, cur.rain);
    rain.visible = ro > 0.02; rainMat.opacity = ro * 0.55;
    if (rain.visible) {
      const sp = 15 + cur.storm * 6, len = 0.5, slant = W.wind * 0.35;
      for (let i = 0; i < RAIN_N; i++) {
        let y = rainSeed[i * 3 + 1] - dt * sp; if (y < 0) y += 16; rainSeed[i * 3 + 1] = y;
        if (i > RAIN_N * Math.min(1, cur.rain / 1.2 + 0.25)) { rainPos.fill(0, i * 6, i * 6 + 6); continue; }
        const x = rainSeed[i * 3], z = rainSeed[i * 3 + 2];
        rainPos[i * 6] = x + slant * (y / 16); rainPos[i * 6 + 1] = y; rainPos[i * 6 + 2] = z;
        rainPos[i * 6 + 3] = x + slant * (y / 16) - slant * 0.1; rainPos[i * 6 + 4] = y + len; rainPos[i * 6 + 5] = z;
      }
      rainGeo.attributes.position.needsUpdate = true;
    }
    // снег
    snow.visible = cur.snow > 0.02; snowMat.opacity = Math.min(1, cur.snow) * 0.95;
    if (snow.visible) {
      for (let i = 0; i < SNOW_N; i++) {
        let y = snowSeed[i * 4 + 1] - dt * (0.9 + (i % 5) * 0.12); if (y < 0) y += 14; snowSeed[i * 4 + 1] = y;
        const ph = snowSeed[i * 4 + 3];
        snowPos[i * 3] = snowSeed[i * 4] + Math.sin(time * 0.7 + ph) * 0.35 + W.wind * (y / 14) * 0.8;
        snowPos[i * 3 + 1] = y;
        snowPos[i * 3 + 2] = snowSeed[i * 4 + 2] + Math.cos(time * 0.6 + ph) * 0.35;
      }
      snowGeo.attributes.position.needsUpdate = true;
    }
    // гроза
    if (cur.storm > 0.5) { nextBolt -= dt; if (nextBolt < 0) { strike(); nextBolt = 3.5 + Math.random() * 5; } }
    flash = Math.max(0, flash - dt * 3.2);
    const fl = flash > 0.05 ? flash * (0.6 + 0.4 * Math.sin(time * 60)) : 0;
    back.material.uniforms.flash.value = fl;
    bolt.visible = flash > 0.35;
    // облака погоды
    wClouds = wClouds.filter((c) => {
      c.life = Math.max(0, Math.min(1, c.life + (c.dying ? -dt * 1.2 : dt * 0.8)));
      const e = c.life < 1 ? 1 - Math.pow(1 - c.life, 3) : 1;
      c.g.scale.setScalar(Math.max(0.001, e * c.s));
      c.a += dt * c.sp;
      c.holder.position.x = Math.cos(c.a) * c.r; c.holder.position.z = Math.sin(c.a) * c.r;
      if (c.dying && c.life <= 0) { scene.remove(c.holder); disposeTree(c.holder); return false; }
      return true;
    });
  }

  function updateMotes(dt) {
    think += (thinkTgt - think) * (1 - Math.exp(-dt * 2.5));
    motes.visible = think > 0.02;
    if (!motes.visible) return;
    moteMat.opacity = think * 0.9;
    for (let i = 0; i < MOTE_N; i++) {
      const m = moteSeed[i];
      m.a += dt * m.sp * (0.5 + 2.2 / m.r);
      const r = m.r * (0.55 + 0.45 * think);
      motePos[i * 3] = Math.cos(m.a) * r;
      motePos[i * 3 + 1] = 1.2 + m.h * think + Math.sin(time * 1.3 + m.ph) * 0.4;
      motePos[i * 3 + 2] = Math.sin(m.a) * r;
    }
    moteGeo.attributes.position.needsUpdate = true;
  }

  function frame() {
    if (document.hidden) { running = false; return; }
    requestAnimationFrame(frame);
    // на медленном программном рендере (съёмка) анимации идут по реальному времени
    const dt = Math.min(SHOT ? 0.5 : 0.1, clock.getDelta());
    time += dt; W.time = time;
    if (!controls.autoRotate && performance.now() > idleAt) controls.autoRotate = true;
    controls.update();
    lerpEnv(dt);
    updateWeather(dt);
    updateMotes(dt);
    for (const fn of W.frameFns) fn(time, dt);
    updatePuffs(dt);
    back.material.uniforms.time.value = time;
    back.material.uniforms.aspect.value = innerWidth / innerHeight;
    // фокус tilt-shift — на центре острова
    _p.set(0, 1, 0).project(camera);
    tilt.uniforms.focus.value = _p.y * 0.5 + 0.5;
    composer.render(dt);
  }
  W.start = function () { if (running) return; running = true; clock.getDelta(); requestAnimationFrame(frame); };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) W.start(); });

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setPixelRatio(PR());
    renderer.setSize(w, h);
    composer.setPixelRatio(PR());
    composer.setSize(w, h);
    tilt.uniforms.res.value.set(w * PR(), h * PR());
    tilt.uniforms.amount.value = (w < 720 ? 2.4 : 3.4) * PR();
    fitCamera(true);
  }
  addEventListener('resize', resize);
  fitCamera(false);
  resize();

  // снимок для галереи: маленькая картинка сразу после кадра
  W.snapshot = function () {
    try {
      composer.render(0);
      const src = renderer.domElement, cv = document.createElement('canvas');
      const tw = 320, th = Math.round((tw * src.height) / src.width);
      cv.width = tw; cv.height = th;
      cv.getContext('2d').drawImage(src, 0, 0, tw, th);
      return cv.toDataURL('image/jpeg', 0.72);
    } catch (e) { return ''; }
  };
  W.nudgeCamera = function () { controls.autoRotate = true; idleAt = 0; };

  Object.assign(W, { renderer, scene, camera, controls, composer, cur, island, T });
  S3.world = W;
})();
