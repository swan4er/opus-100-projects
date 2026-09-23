/* Фрактальный полёт — рендер, управление, интерфейс. */
(function () {
  'use strict';

  const { V, WORLDS, makeDE, Autopilot, clamp, fmt } = window.FFCore;
  const $ = (s) => document.querySelector(s);
  const body = document.body;
  const canvas = $('#gl');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Режим съёмки обложки (ставит инструмент проверки): один чёткий кадр вместо живого полёта.
  const SHOT = !!window.__SHOT__;

  const gl = canvas.getContext('webgl2', {
    antialias: false, alpha: false, depth: false, stencil: false,
    preserveDrawingBuffer: true, powerPreference: 'high-performance',
  });
  if (!gl) { body.classList.add('no-gl'); return; }

  // ---------------------------------------------------------------- шейдер
  const VS = `#version 300 es
  in vec2 aPos;
  void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

  const FS = `#version 300 es
  precision highp float;
  uniform vec2 uRes;
  uniform vec3 uPos;
  uniform mat3 uRot;
  uniform float uTanFov;
  uniform int uWorld;
  uniform float uParam;
  uniform int uIter;
  uniform vec3 uSun;
  uniform float uScaleRef;
  uniform float uFogK;
  uniform int uSteps;
  uniform vec2 uJitter;
  uniform float uFade;
  uniform float uTime;
  uniform float uShadows;
  uniform float uGrain;
  uniform vec3 uHaze;
  uniform vec3 uPalA, uPalB, uPalC, uPalD;
  uniform vec3 uTrapK;
  uniform float uExposure;
  out vec4 fragColor;

  vec4 gTrap;

  float sdBox(vec3 p, float b){ vec3 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0); }

  float deBox(vec3 p){
    float s = uParam; vec3 z = p; float dr = 1.0; vec4 tr = vec4(1e5);
    for (int i = 0; i < 20; i++){
      if (i >= uIter) break;
      z = clamp(z, -1.0, 1.0) * 2.0 - z;
      float r2 = dot(z, z);
      if (r2 < 0.25){ z *= 4.0; dr *= 4.0; }
      else if (r2 < 1.0){ float t = 1.0 / r2; z *= t; dr *= t; }
      z = s * z + p; dr = dr * abs(s) + 1.0;
      tr = min(tr, vec4(abs(z), r2));
    }
    gTrap = tr;
    return length(z) / abs(dr);
  }

  float deBulb(vec3 q){
    vec3 p = q.xzy; vec3 z = p; float dr = 1.0; float r = 0.0; vec4 tr = vec4(1e5);
    float pw = uParam;
    for (int i = 0; i < 16; i++){
      if (i >= uIter) break;
      r = length(z); if (r > 2.0) break;
      float th = acos(clamp(z.z / max(r, 1e-9), -1.0, 1.0)); float ph = atan(z.y, z.x);
      dr = pow(r, pw - 1.0) * pw * dr + 1.0;
      float zr = pow(r, pw); th *= pw; ph *= pw;
      z = zr * vec3(sin(th) * cos(ph), sin(ph) * sin(th), cos(th)) + p;
      tr = min(tr, vec4(abs(z), dot(z, z)));
    }
    gTrap = tr;
    return 0.5 * log(max(r, 1e-9)) * r / dr;
  }

  float deMenger(vec3 p){
    vec3 q = mod(p + 1.0, 2.0) - 1.0;
    float d = sdBox(q, 1.0); float s = 1.0; vec4 tr = vec4(1.0, 1.0, 1.0, 0.0);
    for (int m = 0; m < 7; m++){
      if (m >= uIter) break;
      vec3 a = mod(q * s, 2.0) - 1.0; s *= 3.0;
      vec3 r = abs(1.0 - 3.0 * abs(a));
      float c = (min(max(r.x, r.y), min(max(r.y, r.z), max(r.z, r.x))) - uParam) / s;
      if (c > d){ d = c; tr = vec4(r * 0.5, float(m) / 5.0); }
    }
    gTrap = tr;
    return d;
  }

  float deKlein(vec3 p){
    vec3 cs = vec3(0.92436, 0.90756, 0.92436) * (uParam / 0.92);
    float f = 1.0; vec4 tr = vec4(1e5);
    for (int i = 0; i < 16; i++){
      if (i >= uIter) break;
      p = 2.0 * clamp(p, -cs, cs) - p;
      float r2 = dot(p, p);
      float k = max(1.0 / max(r2, 1e-12), 1.0);
      p *= k; f *= k;
      tr = min(tr, vec4(abs(p), r2));
    }
    gTrap = tr;
    float rxy = length(p.xy);
    return max(rxy - 0.92784, abs(rxy * p.z) / max(length(p), 1e-9)) / f;
  }

  float map(vec3 p){
    if (uWorld == 0) return deBox(p);
    if (uWorld == 1) return deBulb(p);
    if (uWorld == 2) return deMenger(p);
    return deKlein(p);
  }

  vec3 calcNormal(vec3 p, float e){
    vec2 k = vec2(1.0, -1.0) * 0.5773 * e;
    return normalize(k.xyy * map(p + k.xyy) + k.yyx * map(p + k.yyx) + k.yxy * map(p + k.yxy) + k.xxx * map(p + k.xxx));
  }

  float calcAO(vec3 p, vec3 n, float sc){
    float occ = 0.0, w = 1.0;
    for (int i = 1; i <= 5; i++){
      float h = sc * float(i) / 5.0;
      float dd = map(p + n * h);
      occ += w * max(h - dd, 0.0) / h;
      w *= 0.72;
    }
    return clamp(1.0 - occ * 0.62, 0.0, 1.0);
  }

  float softShadow(vec3 ro, vec3 rd, float tmin, float tmax){
    float res = 1.0, t = tmin;
    for (int i = 0; i < 56; i++){
      float h = map(ro + rd * t);
      res = min(res, 9.0 * h / t);
      if (res < 0.002) break;
      t += clamp(h, tmin * 0.6, tmax * 0.08);
      if (t > tmax) break;
    }
    return smoothstep(0.0, 1.0, clamp(res, 0.0, 1.0));
  }

  vec3 skyColor(vec3 rd){
    float sd = max(dot(rd, uSun), 0.0);
    float h = clamp(rd.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 zen = vec3(0.34, 0.45, 0.62);
    vec3 c = mix(uHaze, zen, pow(h, 2.2) * 0.85);
    c += vec3(1.0, 0.70, 0.42) * pow(sd, 4.0) * 0.55;
    c += vec3(1.0, 0.88, 0.70) * pow(sd, 48.0) * 0.9;
    c += vec3(1.0, 0.95, 0.86) * smoothstep(0.9994, 0.99975, sd) * 8.0;
    return c;
  }

  vec3 albedo(vec4 tr){
    float a = clamp(sqrt(tr.w) * uTrapK.x, 0.0, 1.0);
    float b = clamp(tr.x * uTrapK.y, 0.0, 1.0);
    float c = clamp(tr.y * uTrapK.z, 0.0, 1.0);
    vec3 col = uPalA;
    col = mix(col, uPalB, smoothstep(0.1, 0.9, 1.0 - a) * 0.85);
    col = mix(col, uPalC, smoothstep(0.45, 1.0, b) * 0.7);
    col = mix(col, uPalD, smoothstep(0.6, 1.0, c) * 0.65);
    return col;
  }

  vec3 aces(vec3 x){
    const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
  }

  float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }

  void main(){
    vec2 fc = gl_FragCoord.xy + uJitter;
    vec2 uv = (2.0 * fc - uRes) / uRes.y;
    vec3 rd = normalize(uRot * vec3(uv * uTanFov, 1.0));
    vec3 ro = uPos;
    float pix = 2.0 * uTanFov / uRes.y;

    float t = 0.0, d = 0.0; bool hit = false; float steps = 0.0;
    float tmax = uScaleRef * 70.0;
    for (int i = 0; i < 480; i++){
      if (i >= uSteps) break;
      d = map(ro + rd * t);
      float eps = max(t * pix * 0.6, uScaleRef * 2e-6);
      if (d < eps){ hit = true; break; }
      t += d * 0.92;
      steps += 1.0;
      if (t > tmax) break;
    }
    vec4 trap = gTrap;

    vec3 sky = skyColor(rd);
    float fogD = uScaleRef * uFogK;
    vec3 col;
    if (hit){
      vec3 p = ro + rd * t;
      float eps = max(t * pix * 0.6, uScaleRef * 2e-6);
      vec3 n = calcNormal(p, eps);
      vec3 pp = p + n * eps * 2.5;
      float ao = calcAO(pp, n, clamp(t * 0.07, eps * 6.0, uScaleRef * 0.6));
      float sh = uShadows > 0.5 ? softShadow(pp, uSun, eps * 5.0, uScaleRef * 8.0) : 1.0;
      sh = 0.12 + 0.88 * sh;
      vec3 alb = albedo(trap);

      float dif = max(dot(n, uSun), 0.0);
      float skyL = 0.55 + 0.45 * n.y;
      float bou = clamp(0.5 - 0.5 * n.y, 0.0, 1.0);
      float fre = pow(clamp(1.0 + dot(n, rd), 0.0, 1.0), 3.0);
      vec3 hal = normalize(uSun - rd);
      float spe = pow(max(dot(n, hal), 0.0), 40.0) * dif * sh;

      vec3 lin = vec3(0.0);
      lin += vec3(2.1, 1.62, 1.12) * dif * sh;
      lin += vec3(0.30, 0.36, 0.48) * skyL * ao * ao;
      lin += vec3(0.30, 0.20, 0.13) * bou * ao;
      lin += uHaze * fre * 0.25 * ao;
      col = alb * lin + vec3(1.0, 0.9, 0.75) * spe * 0.35;

      float fogAmt = 1.0 - exp(-t / fogD);
      vec3 fogCol = mix(uHaze, sky, 0.35) + vec3(1.0, 0.75, 0.5) * pow(max(dot(rd, uSun), 0.0), 8.0) * 0.35;
      col = mix(col, fogCol, fogAmt);
    } else {
      col = sky;
    }
    // мягкое свечение у кромок фрактала (ближние промахи луча)
    float glow = clamp(steps / float(uSteps), 0.0, 1.0);
    col += vec3(1.0, 0.82, 0.62) * pow(glow, 2.2) * 0.22 * (hit ? 0.3 : 1.0);

    col = aces(col * 0.92 * uExposure);
    col = pow(col, vec3(1.0 / 2.2));
    // тёплая цветокоррекция, виньетка, зерно
    col = col * vec3(1.02, 1.0, 0.965) + vec3(0.012, 0.007, 0.0);
    vec2 q = gl_FragCoord.xy / uRes;
    col *= 0.5 + 0.5 * pow(16.0 * q.x * q.y * (1.0 - q.x) * (1.0 - q.y), 0.22);
    col += (hash12(gl_FragCoord.xy + fract(uTime) * 311.0) - 0.5) * uGrain;
    col = mix(col, vec3(0.80, 0.70, 0.58), uFade);
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
  }`;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error(log);
    }
    return s;
  }
  let prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
    gl.bindAttribLocation(prog, 0, 'aPos');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (e) {
    body.classList.add('no-gl');
    return;
  }
  gl.useProgram(prog);
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const U = {};
  ['uRes', 'uPos', 'uRot', 'uTanFov', 'uWorld', 'uParam', 'uIter', 'uSun', 'uScaleRef', 'uFogK', 'uSteps', 'uJitter',
    'uFade', 'uTime', 'uShadows', 'uGrain', 'uHaze', 'uPalA', 'uPalB', 'uPalC', 'uPalD', 'uTrapK', 'uExposure']
    .forEach((n) => { U[n] = gl.getUniformLocation(prog, n); });

  // ---------------------------------------------------------------- состояние
  const state = {
    world: 0,
    settings: WORLDS.map((w) => ({ param: w.param.def, iter: w.iter.def })),
    fog: 1.0,          // множитель дальности тумана
    sunH: 0.5,         // высота солнца 0..1
    sunA: 0.0,         // смещение азимута, радианы
    shadows: true,
    mode: 'tour',      // tour | auto | manual | photo
    speedMul: 1,
    uiHidden: false,
  };

  let de = null;
  let pilot = null;
  let pos = [0, 0, 0];
  let camF = [0, 0, -1], camR = [1, 0, 0], camU = [0, 1, 0];
  let yaw = 0, pitch = 0;
  let scaleRef = 1;
  let lastDE = 1;

  function sunDir() {
    const w = WORLDS[state.world];
    const base = V.norm(w.sun);
    const az = Math.atan2(base[2], base[0]) + state.sunA;
    const el = 0.08 + state.sunH * 1.25;
    return [Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)];
  }

  function rebuildDE() {
    const s = state.settings[state.world];
    de = makeDE(state.world, s.param, s.iter);
  }

  function spawn() {
    const w = WORLDS[state.world];
    rebuildDE();
    pos = w.spawn.slice();
    // для обложки — зерно маршрута, подобранное перебором: крупная арка на переднем плане и проём в глубине
    pilot = new Autopilot(de, w, pos, w.dir, SHOT ? 85.32 : Math.random() * 100);
    camF = V.norm(w.dir.slice());
    yawPitchFromF();
    scaleRef = w.scaleRef;
  }

  function yawPitchFromF() {
    yaw = Math.atan2(camF[0], -camF[2]);
    pitch = Math.asin(clamp(camF[1], -1, 1));
  }

  // ---------------------------------------------------------------- разрешение
  const DPR = SHOT ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
  // программный рендер (нет видеокарты) — стартуем очень бережно, иначе кадр считается секундами
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const rendererName = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
  const softGPU = /swiftshader|llvmpipe|software|softpipe/i.test(rendererName);
  let resScale = SHOT ? 0.75 : softGPU ? 0.2 : 0.4;
  const RES_MIN = softGPU ? 0.16 : 0.3, RES_MAX = 1.0;
  const STEPS = softGPU && !SHOT ? 90 : 150;
  function resize() {
    const s = state.mode === 'photo' ? 1.0 : resScale;
    const w = Math.max(64, Math.round(innerWidth * DPR * s));
    const h = Math.max(64, Math.round(innerHeight * DPR * s));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      photoN = 0;
    }
  }
  window.addEventListener('resize', resize);

  // ---------------------------------------------------------------- переходы между мирами
  let fade = 1.0, fadeTarget = 0.0, pendingWorld = -1;
  let tourClock = 0;
  const TOUR_SECONDS = reduceMotion ? 45 : 30;

  function goWorld(i, fromUser) {
    if (fromUser && state.mode === 'tour') setMode('auto');
    if (i === state.world && fade < 0.01) { spawn(); showChapter(); return; }
    pendingWorld = i;
    fadeTarget = 1.0;
  }

  // ---------------------------------------------------------------- интерфейс
  const worldsNav = $('#worlds');
  WORLDS.forEach((w, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.w = i;
    b.innerHTML = `<span class="rn">${w.roman}</span><span class="wn">${w.name}</span>`;
    b.addEventListener('click', () => goWorld(i, true));
    worldsNav.appendChild(b);
  });

  const chapter = $('#chapter');
  let chapterTimer = 0;
  function showChapter() {
    const w = WORLDS[state.world];
    const s = state.settings[state.world];
    $('#chRoman').textContent = w.roman;
    $('#chName').textContent = w.name;
    $('#chSub').textContent = w.sub(s.param, s.iter);
    $('#chLine').textContent = w.line;
    chapter.classList.remove('show');
    void chapter.offsetWidth;
    chapter.classList.add('show');
    clearTimeout(chapterTimer);
    chapterTimer = setTimeout(() => chapter.classList.remove('show'), 5200);
    worldsNav.querySelectorAll('button').forEach((b) => b.classList.toggle('on', +b.dataset.w === state.world));
    syncPanel();
  }

  // параметры
  const pParam = $('#pParam'), pIter = $('#pIter'), pFog = $('#pFog'), pSun = $('#pSun'), pAz = $('#pAz'), pShadows = $('#pShadows');
  function syncPanel() {
    const w = WORLDS[state.world];
    const s = state.settings[state.world];
    $('#lParam').textContent = w.param.label;
    Object.assign(pParam, { min: w.param.min, max: w.param.max, step: w.param.step });
    pParam.value = s.param;
    Object.assign(pIter, { min: w.iter.min, max: w.iter.max, step: 1 });
    pIter.value = s.iter;
    $('#lIter').textContent = w.iter.label;
    pFog.value = state.fog;
    pSun.value = state.sunH;
    pAz.value = state.sunA;
    pShadows.checked = state.shadows;
    updateReadouts();
  }
  function updateReadouts() {
    const w = WORLDS[state.world];
    const s = state.settings[state.world];
    const digits = w.param.step < 0.01 ? 3 : w.param.step < 0.1 ? 2 : 1;
    $('#vParam').textContent = fmt(s.param, digits);
    $('#vIter').textContent = s.iter;
    $('#vFog').textContent = fmt(state.fog, 1) + '×';
    $('#vSun').textContent = Math.round((0.08 + state.sunH * 1.25) * 57.2958) + '°';
    $('#vAz').textContent = (state.sunA >= 0 ? '+' : '−') + Math.abs(Math.round(state.sunA * 57.2958)) + '°';
    document.querySelectorAll('.panel input[type=range]').forEach(paintRange);
  }
  function paintRange(r) {
    const p = (r.value - r.min) / (r.max - r.min) * 100;
    r.style.setProperty('--p', p + '%');
  }
  function onParamChange() {
    const s = state.settings[state.world];
    s.param = parseFloat(pParam.value);
    s.iter = parseInt(pIter.value, 10);
    const keepPos = pos.slice(), keepF = camF.slice();
    rebuildDE();
    // не даём камере оказаться внутри поверхности после смены параметров
    if (!(de(keepPos[0], keepPos[1], keepPos[2]) > 1e-5)) spawn();
    else {
      pilot = new Autopilot(de, WORLDS[state.world], keepPos, keepF, Math.random() * 100);
      pos = keepPos;
    }
    if (state.mode === 'tour') setMode('auto');
    photoN = 0;
    updateReadouts();
  }
  pParam.addEventListener('input', onParamChange);
  pIter.addEventListener('input', onParamChange);
  pFog.addEventListener('input', () => { state.fog = parseFloat(pFog.value); photoN = 0; updateReadouts(); });
  pSun.addEventListener('input', () => { state.sunH = parseFloat(pSun.value); photoN = 0; updateReadouts(); });
  pAz.addEventListener('input', () => { state.sunA = parseFloat(pAz.value); photoN = 0; updateReadouts(); });
  pShadows.addEventListener('change', () => { state.shadows = pShadows.checked; photoN = 0; });
  $('#pReset').addEventListener('click', () => {
    const w = WORLDS[state.world];
    state.settings[state.world] = { param: w.param.def, iter: w.iter.def };
    state.fog = 1; state.sunH = 0.5; state.sunA = 0;
    spawn(); syncPanel();
  });

  const panel = $('#panel');
  $('#btnParams').addEventListener('click', (e) => {
    e.stopPropagation();
    const open = !panel.classList.contains('open');
    panel.classList.toggle('open', open);
    $('#btnParams').setAttribute('aria-expanded', open);
  });
  document.addEventListener('click', (e) => {
    if (panel.classList.contains('open') && !panel.contains(e.target) && e.target.id !== 'btnParams') {
      panel.classList.remove('open');
      $('#btnParams').setAttribute('aria-expanded', false);
    }
  });

  // режимы
  const btnAuto = $('#btnAuto');
  function setMode(m) {
    const prev = state.mode;
    state.mode = m;
    body.dataset.mode = m;
    if ((m === 'auto' || m === 'tour') && prev === 'manual') {
      pilot = new Autopilot(de, WORLDS[state.world], pos, camF, Math.random() * 100);
    }
    if (m === 'manual') yawPitchFromF();
    btnAuto.classList.toggle('on', m === 'auto' || m === 'tour');
    btnAuto.querySelector('span').textContent = (m === 'auto' || m === 'tour') ? 'Автопилот' : 'Автопилот';
    updateHint();
  }
  btnAuto.addEventListener('click', () => {
    if (state.mode === 'manual') setMode('auto');
    else setMode('manual');
  });

  const hint = $('#hint');
  const isTouch = matchMedia('(pointer: coarse)').matches;
  function updateHint() {
    let txt;
    if (state.mode === 'photo') txt = '';
    else if (state.mode === 'manual' && document.pointerLockElement === canvas) {
      txt = 'WASD — полёт · мышь — взгляд · Shift — быстрее · Q / E — вниз и вверх · колесо — скорость · Esc — отпустить';
    } else if (state.mode === 'manual') {
      txt = isTouch ? 'Ведите пальцем — осмотреться · держите «Вперёд», чтобы лететь' : 'Щёлкните по сцене, чтобы продолжить полёт · A — автопилот';
    } else {
      txt = isTouch ? 'Коснитесь и ведите — взять управление' : 'Щёлкните по сцене — управление ваше · 1–4 — миры · P — фото · H — спрятать интерфейс';
    }
    hint.textContent = txt;
    hint.classList.toggle('empty', !txt);
  }

  // ---------------------------------------------------------------- фоторежим
  let photoN = 0;
  const PHOTO_N = 48;
  let prevResScale = resScale;
  const photoBar = $('#photoBar');
  function enterPhoto() {
    if (state.mode === 'photo') return;
    state.prevMode = state.mode;
    if (document.pointerLockElement) document.exitPointerLock();
    prevResScale = resScale;
    state.mode = 'photo';
    body.dataset.mode = 'photo';
    photoN = 0;
    resize();
    updateHint();
  }
  function exitPhoto() {
    if (state.mode !== 'photo') return;
    resScale = prevResScale;
    setMode(state.prevMode === 'tour' ? 'auto' : state.prevMode || 'auto');
    resize();
  }
  $('#btnPhoto').addEventListener('click', enterPhoto);
  $('#photoExit').addEventListener('click', exitPhoto);
  $('#photoSave').addEventListener('click', () => {
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      const w = WORLDS[state.world];
      a.href = URL.createObjectURL(blob);
      a.download = `фрактальный-полёт-${w.id}-${Date.now().toString(36)}.png`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }, 'image/png');
  });

  // ---------------------------------------------------------------- ввод
  const keys = new Set();
  window.addEventListener('keydown', (e) => {
    if (e.target && e.target.tagName === 'INPUT' && e.target.type !== 'range' && e.target.type !== 'checkbox') return;
    const k = e.code;
    keys.add(k);
    if (/^Digit[1-4]$/.test(k)) goWorld(+k.slice(5) - 1, true);
    else if (k === 'KeyP') state.mode === 'photo' ? exitPhoto() : enterPhoto();
    else if (k === 'KeyH') { state.uiHidden = !state.uiHidden; body.classList.toggle('ui-hidden', state.uiHidden); }
    else if (k === 'KeyR') { spawn(); }
    else if (k === 'Escape' && state.mode === 'photo') exitPhoto();
    else if (k === 'KeyA' && state.mode === 'manual' && document.pointerLockElement !== canvas) setMode('auto');
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('click', () => {
    if (state.mode === 'photo' || isTouch) return;
    if (state.mode !== 'manual') setMode('manual');
    if (canvas.requestPointerLock) {
      try {
        const r = canvas.requestPointerLock();
        if (r && r.catch) r.catch(() => {});
      } catch (e) { /* без захвата курсора — просто обзор перетаскиванием */ }
    }
  });
  document.addEventListener('pointerlockchange', updateHint);
  window.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement !== canvas || state.mode !== 'manual') return;
    yaw += e.movementX * 0.0022;
    pitch = clamp(pitch - e.movementY * 0.0022, -1.5, 1.5);
  });
  canvas.addEventListener('wheel', (e) => {
    if (state.mode === 'photo') return;
    e.preventDefault();
    state.speedMul = clamp(state.speedMul * (e.deltaY > 0 ? 0.8 : 1.25), 0.2, 6);
  }, { passive: false });

  // касания: ведёшь пальцем — осматриваешься, кнопка «Вперёд» — летишь
  let touchId = null, tx = 0, ty = 0, fwdHeld = false;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || state.mode === 'photo') return;
    if (state.mode !== 'manual') setMode('manual');
    touchId = e.pointerId; tx = e.clientX; ty = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== touchId) return;
    yaw += (e.clientX - tx) * 0.005;
    pitch = clamp(pitch - (e.clientY - ty) * 0.005, -1.5, 1.5);
    tx = e.clientX; ty = e.clientY;
  });
  const endTouch = (e) => { if (e.pointerId === touchId) touchId = null; };
  canvas.addEventListener('pointerup', endTouch);
  canvas.addEventListener('pointercancel', endTouch);
  const btnFwd = $('#btnFwd');
  const holdOn = (e) => { e.preventDefault(); fwdHeld = true; btnFwd.classList.add('on'); if (state.mode !== 'manual') setMode('manual'); };
  const holdOff = () => { fwdHeld = false; btnFwd.classList.remove('on'); };
  btnFwd.addEventListener('pointerdown', holdOn);
  btnFwd.addEventListener('pointerup', holdOff);
  btnFwd.addEventListener('pointerleave', holdOff);
  btnFwd.addEventListener('pointercancel', holdOff);

  // ---------------------------------------------------------------- движение
  function manualStep(dt) {
    camF = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
    const R = V.norm(V.cross(camF, [0, 1, 0]));
    const Up = V.cross(R, camF);
    let mv = [0, 0, 0];
    const k = (c) => keys.has(c);
    if (k('KeyW') || k('ArrowUp') || fwdHeld) mv = V.add(mv, camF);
    if (k('KeyS') || k('ArrowDown')) mv = V.sub(mv, camF);
    if (k('KeyD') || k('ArrowRight')) mv = V.add(mv, R);
    if ((k('KeyA') && document.pointerLockElement === canvas) || k('ArrowLeft')) mv = V.sub(mv, R);
    if (k('KeyE') || k('Space')) mv = V.add(mv, Up);
    if (k('KeyQ') || k('KeyC')) mv = V.sub(mv, Up);
    const d = de(pos[0], pos[1], pos[2]);
    lastDE = d;
    if (V.len(mv) > 0) {
      const w = WORLDS[state.world];
      const boost = (k('ShiftLeft') || k('ShiftRight')) ? 4 : 1;
      const v = clamp(d * 1.1, w.vMin * 0.04, w.vMax * 2) * state.speedMul * boost;
      const np = V.add(pos, V.mul(V.norm(mv), v * dt));
      const nd = de(np[0], np[1], np[2]);
      if (nd > Math.max(d * 0.18, 1e-6)) pos = np;
    }
    camR = R; camU = Up;
  }

  function pilotStep(dt) {
    const d = pilot.step(dt, state.speedMul * (reduceMotion ? 0.5 : 1));
    lastDE = d;
    if (!(d > 1e-6)) { spawn(); return; }
    pos = pilot.pos;
    camF = pilot.look;
    let R = V.cross(camF, [0, 1, 0]);
    if (V.len(R) < 1e-3) R = [1, 0, 0];
    R = V.norm(R);
    let Up = V.cross(R, camF);
    const roll = reduceMotion ? 0 : pilot.roll;
    const cr = Math.cos(roll), sr = Math.sin(roll);
    camR = V.add(V.mul(R, cr), V.mul(Up, sr));
    camU = V.sub(V.mul(Up, cr), V.mul(R, sr));
  }

  // ---------------------------------------------------------------- HUD
  const hudDist = $('#hudDist'), hudDepth = $('#hudDepth'), hudRes = $('#hudRes'), hudSpeed = $('#hudSpeed');
  let hudClock = 0;
  function updateHud() {
    const w = WORLDS[state.world];
    hudDist.textContent = lastDE < 0.01 ? lastDE.toExponential(1).replace('.', ',').replace('e', '·10^').replace('^-', '⁻').replace(/\^(\d)/, (m, g) => g) : fmt(lastDE, 3);
    const depth = Math.log10(w.scaleRef / Math.max(scaleRef, 1e-9));
    hudDepth.textContent = '×' + (Math.pow(10, Math.max(0, depth))).toFixed(depth > 2 ? 0 : 1).replace('.', ',');
    hudRes.textContent = Math.round((state.mode === 'photo' ? 1 : resScale) * 100) + ' %';
    hudSpeed.textContent = '×' + fmt(state.speedMul, 1);
  }

  // ---------------------------------------------------------------- цикл
  let last = performance.now();
  let frameEMA = 16;
  let adaptClock = 0;
  let time = 0;
  let running = true;

  function frame(now) {
    if (!running) return;
    const rawDt = (now - last) / 1000;
    last = now;
    const dt = Math.min(rawDt, 0.1);
    time += dt;

    // переход между мирами
    const fadeSpeed = 1.6;
    if (fade < fadeTarget) fade = Math.min(fadeTarget, fade + dt * fadeSpeed);
    else if (fade > fadeTarget) fade = Math.max(fadeTarget, fade - dt * fadeSpeed * 0.8);
    if (pendingWorld >= 0 && fade >= 0.999) {
      state.world = pendingWorld;
      pendingWorld = -1;
      spawn();
      showChapter();
      fadeTarget = 0;
      tourClock = 0;
    }

    if (state.mode === 'tour') {
      tourClock += dt;
      if (tourClock > TOUR_SECONDS && pendingWorld < 0) goWorld((state.world + 1) % WORLDS.length, false);
    }

    if (state.mode === 'manual') manualStep(dt);
    else if (state.mode === 'auto' || state.mode === 'tour') pilotStep(dt);

    // масштаб окружения следует за расстоянием до стен — туман и тени одинаково красивы на любой глубине
    const w = WORLDS[state.world];
    const target = clamp(lastDE * (w.scaleRef / ((w.band[0] + w.band[1]) * 0.5)), w.scaleRef * 1e-4, w.scaleRef * 1.6);
    scaleRef += (target - scaleRef) * (1 - Math.exp(-dt * 0.8));

    // адаптивное разрешение
    if (state.mode !== 'photo' && !SHOT) {
      frameEMA += (rawDt * 1000 - frameEMA) * 0.1;
      adaptClock += dt;
      if (adaptClock > 0.6) {
        adaptClock = 0;
        if (frameEMA > 26 && resScale > RES_MIN) resScale = Math.max(RES_MIN, resScale * 0.86);
        else if (frameEMA < 10 && resScale < RES_MAX) resScale = Math.min(RES_MAX, resScale * 1.18);
        else if (frameEMA < 15 && resScale < RES_MAX) resScale = Math.min(RES_MAX, resScale * 1.07);
        resize();
      }
    }

    draw();

    hudClock += dt;
    if (hudClock > 0.25 || SHOT) { hudClock = 0; updateHud(); }
    if (SHOT) return; // обложка: один кадр, дальше не нагружаем программный рендер
    requestAnimationFrame(frame);
  }

  function draw() {
    const w = WORLDS[state.world];
    const s = state.settings[state.world];
    const photo = state.mode === 'photo';
    if (photo && photoN >= PHOTO_N) return;

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(U.uRes, canvas.width, canvas.height);
    gl.uniform3fv(U.uPos, pos);
    gl.uniformMatrix3fv(U.uRot, false, [...camR, ...camU, ...camF]);
    gl.uniform1f(U.uTanFov, Math.tan((isTouch ? 62 : 54) * Math.PI / 360));
    gl.uniform1i(U.uWorld, WORLDS[state.world].kind);
    gl.uniform1f(U.uParam, s.param);
    gl.uniform1i(U.uIter, s.iter);
    gl.uniform3fv(U.uSun, sunDir());
    gl.uniform1f(U.uScaleRef, scaleRef);
    gl.uniform1f(U.uFogK, w.fog * state.fog);
    gl.uniform1i(U.uSteps, photo ? 300 : STEPS);
    gl.uniform1f(U.uFade, fade);
    gl.uniform1f(U.uTime, time);
    gl.uniform1f(U.uShadows, state.shadows ? 1 : 0);
    gl.uniform1f(U.uGrain, photo ? 0.012 : 0.028);
    gl.uniform3fv(U.uHaze, w.haze);
    gl.uniform3fv(U.uPalA, w.palette[0]);
    gl.uniform3fv(U.uPalB, w.palette[1]);
    gl.uniform3fv(U.uPalC, w.palette[2]);
    gl.uniform3fv(U.uPalD, w.palette[3]);
    gl.uniform3fv(U.uTrapK, w.trapK);
    gl.uniform1f(U.uExposure, w.exposure || 1);

    if (photo) {
      const j = photoN === 0 ? [0, 0] : [Math.random() - 0.5, Math.random() - 0.5];
      gl.uniform2f(U.uJitter, j[0], j[1]);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.CONSTANT_ALPHA, gl.ONE_MINUS_CONSTANT_ALPHA);
      gl.blendColor(0, 0, 0, 1 / (photoN + 1));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disable(gl.BLEND);
      photoN++;
      $('#photoCount').textContent = `${photoN} / ${PHOTO_N}`;
      $('#photoProgress').style.transform = `scaleX(${photoN / PHOTO_N})`;
      photoBar.classList.toggle('done', photoN >= PHOTO_N);
    } else {
      gl.uniform2f(U.uJitter, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) running = false;
    else if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); }
  });

  // отладочный доступ для проверки кадров
  window.__ff = {
    set(world, param, iter, p, f) {
      state.world = world;
      if (param != null) state.settings[world].param = param;
      if (iter != null) state.settings[world].iter = iter;
      spawn();
      if (p) { pos = p.slice(); pilot = new Autopilot(de, WORLDS[world], pos, f || camF, 1); }
      if (f) { camF = V.norm(f); }
      fade = 0; fadeTarget = 0; pendingWorld = -1;
      setMode('auto');
      showChapter();
      return de(pos[0], pos[1], pos[2]);
    },
    freeze() { setMode('manual'); yawPitchFromF(); return [pos, camF]; },
    info() { return { pos, camF, lastDE, scaleRef, resScale, world: state.world }; },
    shot(world) {
      state.world = world; spawn();
      for (let i = 0; i < 150; i++) pilotStep(1 / 30);
      const w = WORLDS[world];
      scaleRef = clamp(lastDE * (w.scaleRef / ((w.band[0] + w.band[1]) * 0.5)), w.scaleRef * 1e-4, w.scaleRef * 1.6);
      fade = 0; fadeTarget = 0; pendingWorld = -1;
      worldsNav.querySelectorAll('button').forEach((b) => b.classList.toggle('on', +b.dataset.w === state.world));
      draw(); updateHud();
      return lastDE;
    },
  };

  // ---------------------------------------------------------------- старт
  body.dataset.mode = 'tour';
  spawn();
  if (SHOT) {
    // пролетаем несколько секунд маршрута заранее, чтобы кадр был с середины полёта
    for (let i = 0; i < 150; i++) pilotStep(1 / 30);
    const w0 = WORLDS[state.world];
    scaleRef = clamp(lastDE * (w0.scaleRef / ((w0.band[0] + w0.band[1]) * 0.5)), w0.scaleRef * 1e-4, w0.scaleRef * 1.6);
    fade = 0; fadeTarget = 0;
    worldsNav.querySelectorAll('button').forEach((b) => b.classList.toggle('on', +b.dataset.w === state.world));
    syncPanel();
  } else {
    showChapter();
  }
  updateHint();
  resize();
  requestAnimationFrame((t) => { last = t; frame(t); });
  setTimeout(() => body.classList.add('ready'), 60);
})();
