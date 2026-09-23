// ───────────────────────────────────────────────────────────────────────────
//  «Лисий дом» — движок фильма: рендер кадра по времени t.
//  Сцена рисуется в HDR-буфер (MSAA + глубина), затем: глубина резкости
//  («макросъёмка игрушки»), мягкое свечение, тонкомпрессия, грейдинг,
//  виньетка, зерно и затемнения. Кадр — чистая функция от t.
// ───────────────────────────────────────────────────────────────────────────
window.FoxFilm = function (THREE, canvas, opt) {
  'use strict';
  const S = window.STORY;
  const { clamp, lerp, smooth } = S;
  const SHOT = !!(opt && opt.shot);

  const W = window.FoxWorld(THREE);
  const F = window.FoxRig(THREE, W);

  // ── Рендерер ─────────────────────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = true;
  renderer.setClearColor(0x000000, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xd9b58c, 0.006);
  scene.add(W.root);

  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 700);

  // ── Свет ─────────────────────────────────────────────────────────────────
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(SHOT ? 2048 : 2048, SHOT ? 2048 : 2048);
  const sc = sun.shadow.camera; sc.left = -46; sc.right = 46; sc.top = 46; sc.bottom = -46; sc.near = 1; sc.far = 260;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.045;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x7a5236, 1);
  scene.add(hemi);
  const fireLight = new THREE.PointLight(0xff8a3a, 0, 16, 1.6);
  fireLight.position.set(3.6, 2.2, -0.4);
  scene.add(fireLight);
  // свет из окна ложится тёплым пятном на снег перед домом (конус вниз-наружу,
  // чтобы не подсвечивать комнату и лису сквозь стекло)
  const spill = new THREE.SpotLight(0xffa458, 0, 18, 0.8, 0.65, 1.4);
  spill.position.set(3, 5.4, 4.9);
  spill.target.position.set(3, 0, 10.5);
  scene.add(spill, spill.target);

  // ── Небо ─────────────────────────────────────────────────────────────────
  const skyU = {
    uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uBot: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color() }, uSunK: { value: 1 },
    uStars: { value: 0 }, uTime: { value: 0 }, uMoonDir: { value: new THREE.Vector3(-0.3, 0.27, -0.92).normalize() }, uMoon: { value: 0 },
  };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 48, 24), new THREE.ShaderMaterial({
    uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: `
      uniform vec3 uTop, uHor, uBot, uSunDir, uSunCol, uMoonDir; uniform float uSunK, uStars, uTime, uMoon;
      varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir); float y = d.y;
        vec3 c = y > 0.0 ? mix(uHor, uTop, pow(clamp(y, 0.0, 1.0), 0.6)) : mix(uHor, uBot, pow(clamp(-y * 2.5, 0.0, 1.0), 0.6));
        float s = max(dot(d, uSunDir), 0.0);
        c += uSunCol * uSunK * (pow(s, 1400.0) * 18.0 + pow(s, 14.0) * 0.28 + pow(s, 3.0) * 0.07);
        if (uStars > 0.001 && y > 0.0) {
          vec2 sp = vec2(atan(d.z, d.x) * 57.3, asin(clamp(y, -1.0, 1.0)) * 57.3) * 0.9;
          vec2 cell = floor(sp);
          float h = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
          vec2 f = fract(sp) - 0.5;
          float m = step(max(abs(f.x), abs(f.y)), 0.16 + 0.1 * step(0.997, h));
          float tw = 0.65 + 0.35 * sin(uTime * 2.3 + h * 91.0);
          c += vec3(0.85, 0.9, 1.0) * m * step(0.982, h) * tw * uStars * smoothstep(0.03, 0.3, y) * 1.6;
        }
        float mo = dot(d, uMoonDir);
        c += vec3(1.0, 0.97, 0.88) * uMoon * smoothstep(0.99955, 0.99972, mo) * 2.6;
        c += vec3(0.55, 0.65, 0.9) * uMoon * pow(max(mo, 0.0), 90.0) * 0.35;
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
  sky.frustumCulled = false; sky.renderOrder = -10;
  scene.add(sky);

  // ── Частицы на GPU: снег и листья ────────────────────────────────────────
  // Позиция снежинки — функция времени и её «семени»; облако частиц
  // заворачивается вокруг камеры, поэтому снег есть в любом плане.
  function particleSystem(n, isLeaf) {
    const geo = new THREE.InstancedBufferGeometry().copy(new THREE.BoxGeometry(1, 1, 1));
    geo.instanceCount = n;
    const seed = new Float32Array(n * 4), colA = new Float32Array(n * 3);
    const pal = isLeaf ? [[0.78, 0.22, 0.07], [0.9, 0.42, 0.1], [0.95, 0.7, 0.2], [0.65, 0.16, 0.06], [0.85, 0.3, 0.08]] : [[1, 1, 1]];
    for (let i = 0; i < n; i++) {
      const r = (k) => { const s = Math.sin((i + 1) * (12.9898 + k * 7.1) + k * 78.233) * 43758.5453; return s - Math.floor(s); };
      seed[i * 4] = r(1); seed[i * 4 + 1] = r(2); seed[i * 4 + 2] = r(3); seed[i * 4 + 3] = i / n;
      const c = pal[Math.floor(r(4) * pal.length)];
      colA[i * 3] = c[0]; colA[i * 3 + 1] = c[1]; colA[i * 3 + 2] = c[2];
    }
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
    geo.setAttribute('aCol', new THREE.InstancedBufferAttribute(colA, 3));
    const u = {
      uTime: { value: 0 }, uDrift: { value: 0 }, uCount: { value: 0 }, uBox: { value: new THREE.Vector3(40, 24, 40) },
      uCenter: { value: new THREE.Vector3() }, uFall: { value: isLeaf ? 1.1 : 1.6 }, uSize: { value: isLeaf ? 0.26 : 0.13 },
      uLight: { value: new THREE.Color(1, 1, 1) }, uAmb: { value: new THREE.Color(0.5, 0.5, 0.6) }, uGust: { value: 0 }, uLeaf: { value: isLeaf ? 1 : 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: u, fog: false,
      vertexShader: `
        attribute vec4 aSeed; attribute vec3 aCol;
        uniform float uTime, uDrift, uCount, uFall, uSize, uGust, uLeaf; uniform vec3 uBox, uCenter;
        varying vec3 vCol; varying float vShade;
        mat3 rotA(vec3 a, float t){ a = normalize(a); float s = sin(t), c = cos(t), oc = 1.0 - c;
          return mat3(oc*a.x*a.x+c, oc*a.x*a.y+a.z*s, oc*a.z*a.x-a.y*s, oc*a.x*a.y-a.z*s, oc*a.y*a.y+c, oc*a.y*a.z+a.x*s, oc*a.z*a.x+a.y*s, oc*a.y*a.z-a.x*s, oc*a.z*a.z+c); }
        void main(){
          if (aSeed.w >= uCount) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
          float sp = 0.65 + 0.7 * aSeed.x;
          vec3 p = aSeed.xyz * uBox;
          p.y -= uTime * uFall * sp;
          p.x += uDrift * (0.25 + 0.2 * aSeed.z) + sin(uTime * 0.8 + aSeed.w * 41.0) * 0.8;
          p.z += uDrift * (0.9 + 0.5 * aSeed.y) + cos(uTime * 0.6 + aSeed.y * 29.0) * 0.8;
          vec3 o = uCenter - uBox * 0.5;
          p = mod(p - o, uBox) + o;
          float ang = uTime * (1.2 + aSeed.x * 2.5) * (1.0 + uGust * 3.0) + aSeed.y * 6.28;
          mat3 R = rotA(vec3(aSeed.z - 0.5, 0.6, aSeed.x - 0.5), ang);
          // у самого объектива частицы гаснут: иначе одна снежинка закрывает полкадра
          float near = smoothstep(1.2, 4.5, -(modelViewMatrix * vec4(p, 1.0)).z);
          vec3 lp = (uLeaf > 0.5 ? R * (position * vec3(1.0, 0.22, 0.8)) * uSize : R * position * uSize * (0.7 + 0.6 * aSeed.z)) * near;
          vec4 mv = modelViewMatrix * vec4(p + lp, 1.0);
          gl_Position = projectionMatrix * mv;
          vCol = aCol;
          vShade = 0.55 + 0.45 * clamp((R * normal).y * 0.5 + 0.5, 0.0, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 uLight, uAmb; varying vec3 vCol; varying float vShade;
        void main(){ gl_FragColor = vec4(vCol * (uAmb + uLight * vShade), 1.0); }`,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    scene.add(mesh);
    return { mesh, u, n };
  }
  const snowNear = particleSystem(SHOT ? 2600 : 2600, false);
  const snowFar = particleSystem(2200, false);
  snowFar.u.uBox.value.set(84, 46, 84); snowFar.u.uSize.value = 0.2;
  const leafP = particleSystem(420, true);
  leafP.u.uBox.value.set(46, 22, 46);

  // ── Сценарий (игра лисы, события мира, камера) ───────────────────────────
  const fox = F.build();
  scene.add(fox.root);
  const SCR = window.FoxScript(THREE, { W, F, fox, scene, camera });

  // ── Постобработка ────────────────────────────────────────────────────────
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quadGeo = new THREE.PlaneGeometry(2, 2);
  const VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
  function pass(frag, uniforms, defines) {
    const m = new THREE.ShaderMaterial({ uniforms, vertexShader: VS, fragmentShader: frag, depthTest: false, depthWrite: false, defines: defines || {} });
    const mesh = new THREE.Mesh(quadGeo, m); mesh.frustumCulled = false;
    const sc = new THREE.Scene(); sc.add(mesh);
    return { m, u: uniforms, draw(target) { renderer.setRenderTarget(target); renderer.render(sc, quadCam); } };
  }
  const RT = {};
  const dofP = pass(`
    uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 uRes;
    uniform float uNear, uFar, uFocus, uAperture, uMaxR;
    varying vec2 vUv;
    float lin(float z){ float n = z * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - n * (uFar - uNear)); }
    float coc(float d){ return clamp(uAperture * abs(d - uFocus) / max(d, 0.001), 0.0, 1.0) * uMaxR; }
    void main(){
      float dC = lin(texture2D(tDepth, vUv).x);
      float cC = coc(dC);
      vec3 acc = texture2D(tColor, vUv).rgb; float ws = 1.0;
      float a0 = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831;
      for (int i = 0; i < TAPS; i++) {
        float fi = float(i);
        float r = sqrt((fi + 0.5) / float(TAPS)) * uMaxR;
        float a = fi * 2.39996 + a0;
        vec2 uv = vUv + vec2(cos(a), sin(a)) * r / uRes;
        float d = lin(texture2D(tDepth, uv).x);
        float c = coc(d);
        float cc = d < dC ? c : min(c, cC);
        float w = smoothstep(r - 1.2, r + 0.4, cc);
        acc += texture2D(tColor, uv).rgb * w; ws += w;
      }
      gl_FragColor = vec4(acc / ws, 1.0);
    }`, {
    tColor: { value: null }, tDepth: { value: null }, uRes: { value: new THREE.Vector2() },
    uNear: { value: 0.1 }, uFar: { value: 700 }, uFocus: { value: 20 }, uAperture: { value: 0.5 }, uMaxR: { value: 10 },
  }, { TAPS: SHOT ? 26 : 30 });
  const brightP = pass(`
    uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uTh; varying vec2 vUv;
    void main(){
      vec3 c = vec3(0.0);
      c += texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb; c += texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb;
      c += texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb; c += texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb;
      c *= 0.25;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      gl_FragColor = vec4(c * smoothstep(uTh, uTh + 0.8, l), 1.0);
    }`, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uTh: { value: 1.2 } });
  const blurP = pass(`
    uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
    void main(){
      vec3 c = texture2D(tSrc, vUv).rgb * 0.2270;
      c += (texture2D(tSrc, vUv + uDir * 1.3846).rgb + texture2D(tSrc, vUv - uDir * 1.3846).rgb) * 0.3162;
      c += (texture2D(tSrc, vUv + uDir * 3.2308).rgb + texture2D(tSrc, vUv - uDir * 3.2308).rgb) * 0.0703;
      gl_FragColor = vec4(c, 1.0);
    }`, { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } });
  const finalP = pass(`
    uniform sampler2D tSrc; uniform sampler2D tBloom; uniform vec2 uRes;
    uniform float uBloom, uExposure, uFade, uGrain, uTime, uVig, uSat, uContrast;
    uniform vec3 uLift, uGain;
    varying vec2 vUv;
    vec3 neutral(vec3 color){
      const float sc = 0.76; const float des = 0.15;
      float x = min(color.r, min(color.g, color.b));
      float off = x < 0.08 ? x - 6.25 * x * x : 0.04;
      color -= off;
      float peak = max(color.r, max(color.g, color.b));
      if (peak < sc) return color;
      float d = 1.0 - sc;
      float np = 1.0 - d * d / (peak + d - sc);
      color *= np / peak;
      float g = 1.0 - 1.0 / (des * (peak - np) + 1.0);
      return mix(color, vec3(np), g);
    }
    vec3 srcC(vec2 uv){
      #ifdef FXAA
        vec2 px = 1.0 / uRes;
        vec3 cM = texture2D(tSrc, uv).rgb;
        vec3 cN = texture2D(tSrc, uv + vec2(0.0, px.y)).rgb, cS = texture2D(tSrc, uv - vec2(0.0, px.y)).rgb;
        vec3 cE = texture2D(tSrc, uv + vec2(px.x, 0.0)).rgb, cW = texture2D(tSrc, uv - vec2(px.x, 0.0)).rgb;
        vec3 L = vec3(0.299, 0.587, 0.114);
        float lM = dot(cM / (1.0 + cM), L), lN = dot(cN / (1.0 + cN), L), lS = dot(cS / (1.0 + cS), L), lE = dot(cE / (1.0 + cE), L), lW = dot(cW / (1.0 + cW), L);
        float mn = min(lM, min(min(lN, lS), min(lE, lW))), mx = max(lM, max(max(lN, lS), max(lE, lW)));
        if (mx - mn < max(0.04, mx * 0.12)) return cM;
        vec2 dir = normalize(vec2(-(lN - lS), lE - lW) + 1e-5);
        vec3 a = 0.5 * (texture2D(tSrc, uv + dir * px * 0.5).rgb + texture2D(tSrc, uv - dir * px * 0.5).rgb);
        vec3 b = 0.5 * a + 0.25 * (texture2D(tSrc, uv + dir * px * 1.6).rgb + texture2D(tSrc, uv - dir * px * 1.6).rgb);
        return mix(a, b, 0.5);
      #else
        return texture2D(tSrc, uv).rgb;
      #endif
    }
    void main(){
      vec3 c = srcC(vUv) + texture2D(tBloom, vUv).rgb * uBloom;
      c = neutral(c * uExposure);
      c = clamp(c, 0.0, 1.0);
      c = mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSat);
      c = c * uGain + uLift * (1.0 - c);
      c = (c - 0.5) * uContrast + 0.5;
      vec2 q = (vUv - 0.5) * vec2(1.0, 0.75);
      c *= 1.0 - dot(q, q) * uVig;
      float g = fract(sin(dot(floor(vUv * uRes) + fract(uTime * 7.13) * 91.7, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
      c += g * uGrain;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0) * uFade, 1.0);
    }`, {
    tSrc: { value: null }, tBloom: { value: null }, uRes: { value: new THREE.Vector2() },
    uBloom: { value: 0.6 }, uExposure: { value: 1 }, uFade: { value: 1 }, uGrain: { value: 0.03 }, uTime: { value: 0 }, uVig: { value: 0.9 },
    uSat: { value: 1 }, uContrast: { value: 1 }, uLift: { value: new THREE.Vector3() }, uGain: { value: new THREE.Vector3(1, 1, 1) },
  }, SHOT ? { FXAA: '' } : {});

  let RW = 0, RH = 0;
  function makeTargets(w, h) {
    for (const k in RT) RT[k].dispose();
    const dt = new THREE.DepthTexture(w, h);
    RT.scene = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: SHOT ? 0 : 4, depthTexture: dt, depthBuffer: true });
    RT.dof = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false });
    const bw = Math.max(1, Math.round(w / 4)), bh = Math.max(1, Math.round(h / 4));
    RT.b1 = new THREE.WebGLRenderTarget(bw, bh, { type: THREE.HalfFloatType, depthBuffer: false });
    RT.b2 = new THREE.WebGLRenderTarget(bw, bh, { type: THREE.HalfFloatType, depthBuffer: false });
    RW = w; RH = h;
  }
  function resize(cssW, cssH, pr) {
    renderer.setPixelRatio(pr);
    renderer.setSize(cssW, cssH, false);
    const w = Math.max(2, Math.round(cssW * pr)), h = Math.max(2, Math.round(cssH * pr));
    if (w !== RW || h !== RH) makeTargets(w, h);
    camera.aspect = cssW / cssH; camera.updateProjectionMatrix();
  }

  // ── Кадр ─────────────────────────────────────────────────────────────────
  const tmpC = new THREE.Color();
  function setCol(c, a) { c.setRGB(a[0], a[1], a[2], THREE.SRGBColorSpace); return c; }
  let envCache = null;
  function frame(t) { const cam = frameAt(t); post(cam, t, envCache); }
  function frameAt(t) {
    const env = SCR.env(t); envCache = env;
    // свет и небо
    const sd = env.sunDir;
    sun.position.set(sd[0] * 120, sd[1] * 120, sd[2] * 120);
    sun.target.position.set(0, 0, 0);
    setCol(sun.color, env.sunCol); sun.intensity = env.sunI;
    setCol(hemi.color, env.hemiSky); setCol(hemi.groundColor, env.hemiGround); hemi.intensity = env.hemiI;
    setCol(skyU.uTop.value, env.skyTop); setCol(skyU.uHor.value, env.skyHor); setCol(skyU.uBot.value, env.skyBot);
    skyU.uSunDir.value.set(sd[0], sd[1], sd[2]).normalize(); setCol(skyU.uSunCol.value, env.sunCol); skyU.uSunK.value = env.sunGlow;
    skyU.uStars.value = env.stars; skyU.uTime.value = t; skyU.uMoon.value = env.moon;
    setCol(scene.fog.color, env.fog); scene.fog.density = env.fogD;
    W.U.uSnow.value = S.snowCover(t); W.U.uLitter.value = env.litter; W.U.uTime.value = t; W.U.uWind.value = S.wind(t);
    fireLight.intensity = env.fireI; spill.intensity = env.spillI * 1.6;
    // мир и лиса
    SCR.update(t, env);
    // камера
    const cam = SCR.camera(t);
    W.glassMat.color.multiplyScalar(cam.glassK ?? 1);
    camera.position.copy(cam.pos); camera.up.set(Math.sin(cam.roll || 0), Math.cos(cam.roll || 0), 0);
    camera.lookAt(cam.look); camera.fov = cam.fov; camera.near = cam.near || 0.1; camera.updateProjectionMatrix();
    sky.position.copy(camera.position);
    // частицы
    const drift = S.windDrift(t) * 3.2;
    const fall = S.snowfall(t);
    snowNear.u.uCount.value = fall * (cam.snowK ?? 1); snowFar.u.uCount.value = fall;
    for (const p of [snowNear, snowFar, leafP]) {
      p.u.uTime.value = t; p.u.uDrift.value = drift; p.u.uGust.value = S.wind(t);
      setCol(p.u.uLight.value, env.partLight); setCol(p.u.uAmb.value, env.partAmb);
    }
    snowNear.u.uCenter.value.copy(cam.pos).addScaledVector(cam.dir, 10);
    snowFar.u.uCenter.value.set(0, 14, 0);
    leafP.u.uCount.value = env.leafFall;
    leafP.u.uCenter.value.copy(cam.pos).addScaledVector(cam.dir, 14).setY(Math.max(8, cam.pos.y));
    leafP.u.uDrift.value = drift * 1.4;
    return cam;
  }
  function post(cam, t, env) {
    // проходы
    renderer.setRenderTarget(RT.scene);
    renderer.render(scene, camera);
    const dofOn = cam.aperture > 0.001;
    let src = RT.scene.texture;
    if (dofOn) {
      dofP.u.tColor.value = RT.scene.texture; dofP.u.tDepth.value = RT.scene.depthTexture;
      dofP.u.uRes.value.set(RW, RH); dofP.u.uNear.value = camera.near; dofP.u.uFar.value = camera.far;
      dofP.u.uFocus.value = cam.focus; dofP.u.uAperture.value = cam.aperture; dofP.u.uMaxR.value = Math.max(2, RH / 900 * 11 * (cam.maxBlur ?? 1));
      dofP.draw(RT.dof); src = RT.dof.texture;
    }
    brightP.u.tSrc.value = src; brightP.u.uTexel.value.set(1 / RW, 1 / RH); brightP.u.uTh.value = env.bloomTh;
    brightP.draw(RT.b1);
    const bw = RT.b1.width, bh = RT.b1.height;
    for (let i = 0; i < 2; i++) {
      blurP.u.tSrc.value = RT.b1.texture; blurP.u.uDir.value.set((1 + i) / bw, 0); blurP.draw(RT.b2);
      blurP.u.tSrc.value = RT.b2.texture; blurP.u.uDir.value.set(0, (1 + i) / bh); blurP.draw(RT.b1);
    }
    const fu = finalP.u;
    fu.tSrc.value = src; fu.tBloom.value = RT.b1.texture; fu.uRes.value.set(RW, RH);
    fu.uBloom.value = env.bloom; fu.uExposure.value = env.exposure; fu.uFade.value = SCR.fade(t);
    fu.uTime.value = t; fu.uSat.value = env.sat; fu.uContrast.value = env.contrast; fu.uVig.value = env.vig;
    fu.uLift.value.set(env.lift[0], env.lift[1], env.lift[2]); fu.uGain.value.set(env.gain[0], env.gain[1], env.gain[2]);
    fu.uGrain.value = 0.028;
    finalP.draw(null);
  }

  // отладка: несколько лис в разных позах рядом (проверка куклы)
  let cast = null;
  function lineup(names, t, camSpec) {
    if (!cast) cast = [];
    while (cast.length < names.length) { const J = F.build(); scene.add(J.root); cast.push(J); }
    cast.forEach((J) => { J.root.visible = false; });
    frameAt(t ?? 20);
    fox.root.visible = false;
    names.forEach((n, i) => {
      const J = cast[i]; J.root.visible = true;
      const [name, yaw, hammer] = Array.isArray(n) ? n : [n, 0.6, false];
      const col = i % 4, row = Math.floor(i / 4);
      F.apply(J, F.mkPose(name), { x: col * 4.6 - 2, y: 0, z: 12.5 - row * 6.5, yaw }, { t: 20 + i * 0.37, hammer });
    });
    const c = camSpec || { pos: [5, 7.5, 29], look: [5, 1.4, 9.5], fov: 33 };
    camera.position.set(...c.pos); camera.up.set(0, 1, 0); camera.lookAt(new THREE.Vector3(...c.look)); camera.fov = c.fov; camera.updateProjectionMatrix();
    post({ aperture: 0, focus: 20 }, t ?? 20, envCache);
    cast.forEach((J) => { J.root.visible = false; }); fox.root.visible = true;
  }

  // замер полного кадра (с ожиданием GPU) — для отладки на сервере
  function bench(t) {
    const gl = renderer.getContext(), px = new Uint8Array(4);
    const a = performance.now(); frame(t); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return Math.round(performance.now() - a);
  }
  return {
    renderer, scene, camera, resize, render: frame, bench, lineup, cues: SCR.cues, shots: SCR.shots, debug: SCR.debug,
    W, fox,
  };
};
