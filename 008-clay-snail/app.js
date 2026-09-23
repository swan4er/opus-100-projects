/* Улитка идёт на концерт — рендер и плеер.
   Персонажи и камера живут на 12 кадрах в секунду: сцена перерисовывается только при смене кадра,
   а интерфейс плеера остаётся плавным. */
(() => {
  'use strict';
  const SHOT = !!window.__SHOT__;
  const $ = (s) => document.querySelector(s);
  const canvas = $('#gl');
  const filmEl = $('#film');
  const stageEl = $('#stage');

  const fmt = (t) => { t = Math.max(0, Math.floor(t)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };

  // ---------------------------------------------------------------- WebGL2
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, preserveDrawingBuffer: SHOT, powerPreference: 'high-performance' });
  if (!gl) { document.body.classList.add('no-gl'); return; }
  const extCBF = gl.getExtension('EXT_color_buffer_float');
  const extPar = gl.getExtension('KHR_parallel_shader_compile');
  const ENC = extCBF ? 0 : 1;

  function shader(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; }
  function program(vsSrc, fsSrc) {
    const p = gl.createProgram();
    const vs = shader(gl.VERTEX_SHADER, vsSrc), fs = shader(gl.FRAGMENT_SHADER, fsSrc);
    gl.attachShader(p, vs); gl.attachShader(p, fs);
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    return { p, vs, fs, u: {} };
  }
  function ready(pr) { return !extPar || gl.getProgramParameter(pr.p, extPar.COMPLETION_STATUS_KHR); }
  function check(pr, name) {
    if (!gl.getProgramParameter(pr.p, gl.LINK_STATUS)) {
      const log = (gl.getShaderInfoLog(pr.fs) || '') + (gl.getProgramInfoLog(pr.p) || '');
      console.error('Шейдер «' + name + '» не собрался: ' + log.slice(0, 600));
      return false;
    }
    return true;
  }
  const U = (pr, n) => (n in pr.u ? pr.u[n] : (pr.u[n] = gl.getUniformLocation(pr.p, n)));

  const DIAG = !!window.__DIAG__;
  const T_START = performance.now();
  const diag = (m) => { if (DIAG) console.log('[diag ' + Math.round(performance.now() - T_START) + 'ms] ' + m); };
  const progScene = program(POST_VS, SCENE_SDF + SCENE_MAIN);
  const progDof = program(POST_VS, DOF_FS);
  const progComp = program(POST_VS, COMP_FS);

  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  // ---------------------------------------------------------------- атлас текста (поле расстояний)
  // Буквы титров лепятся из этого поля в шейдере; им же написана афиша.
  const ATLAS = 1024, LINE_H = 84, SPREAD = 12;
  const LINES = [
    ['Улитка идёт', 'c'], ['на концерт', 'c'], ['До старой лейки —', 'c'], ['двенадцать шагов.', 'c'],
    ['Шагов садовника.', 'c'], ['Опоздала.', 'c'], ['Но не совсем.', 'c'], ['Конец', 'c'],
    ['Концерт', 'h'], ['сверчков', 'h'], ['сегодня на закате', 'h'], ['у старой лейки', 'h'],
  ];
  const txtRects = new Float32Array(12 * 4);
  const texText = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texText);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array([255]));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  let textSize = [1, 1];

  function edt1d(g, off, stride, n, f, v, z) {
    v[0] = 0; z[0] = -1e20; z[1] = 1e20; f[0] = g[off];
    for (let q = 1, k = 0, s = 0; q < n; q++) {
      f[q] = g[off + q * stride];
      const q2 = q * q;
      do { const r = v[k]; s = (f[q] - f[r] + q2 - r * r) / (q - r) / 2; } while (s <= z[k] && --k > -1);
      k++; v[k] = q; z[k] = s; z[k + 1] = 1e20;
    }
    for (let q = 0, k = 0; q < n; q++) {
      while (z[k + 1] < q) k++;
      const r = v[k], qr = q - r;
      g[off + q * stride] = f[r] + qr * qr;
    }
  }
  function edt(g, w, h) {
    const n = Math.max(w, h), f = new Float64Array(n), v = new Uint16Array(n), z = new Float64Array(n + 1);
    for (let x = 0; x < w; x++) edt1d(g, x, w, h, f, v, z);
    for (let y = 0; y < h; y++) edt1d(g, y * w, 1, w, f, v, z);
  }
  function buildAtlas() {
    const c = document.createElement('canvas');
    c.width = ATLAS; c.height = ATLAS;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.fillStyle = '#000'; x.fillRect(0, 0, ATLAS, ATLAS);
    x.fillStyle = '#fff'; x.textBaseline = 'middle';
    LINES.forEach(([txt, kind], i) => {
      let size = kind === 'c' ? 60 : 66;
      const font = (s) => (kind === 'c' ? `900 ${s}px Nunito, "Arial Rounded MT Bold", "Trebuchet MS", sans-serif` : `${s}px Neucha, "Comic Sans MS", "Segoe Print", cursive`);
      x.font = font(size);
      let w = x.measureText(txt).width;
      const maxW = ATLAS - SPREAD * 2 - 8;
      if (w > maxW) { size = Math.floor(size * maxW / w); x.font = font(size); w = x.measureText(txt).width; }
      const y0 = i * LINE_H;
      x.fillText(txt, SPREAD + 4, y0 + LINE_H / 2 + 2);
      txtRects.set([0, y0, Math.ceil(w + SPREAD * 2 + 8), LINE_H], i * 4);
    });
    const img = x.getImageData(0, 0, ATLAS, ATLAS).data;
    const N = ATLAS * ATLAS, outer = new Float64Array(N), inner = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const a = img[i * 4] / 255;
      outer[i] = a === 1 ? 0 : a === 0 ? 1e20 : Math.pow(Math.max(0, 0.5 - a), 2);
      inner[i] = a === 1 ? 1e20 : a === 0 ? 0 : Math.pow(Math.max(0, a - 0.5), 2);
    }
    edt(outer, ATLAS, ATLAS); edt(inner, ATLAS, ATLAS);
    const out = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      const d = Math.sqrt(outer[i]) - Math.sqrt(inner[i]);
      out[i] = Math.round(255 * Math.min(1, Math.max(0, 0.5 + d / (2 * SPREAD))));
    }
    gl.bindTexture(gl.TEXTURE_2D, texText);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, ATLAS, ATLAS, 0, gl.RED, gl.UNSIGNED_BYTE, out);
    textSize = [ATLAS, ATLAS];
    dirty = true;
    atlasReady = true;
  }
  let atlasReady = false;
  const fontsLoaded = document.fonts
    ? Promise.race([Promise.all([document.fonts.load('900 60px Nunito'), document.fonts.load('66px Neucha')]).catch(() => {}), new Promise((r) => setTimeout(r, 2000))])
    : Promise.resolve();
  fontsLoaded.then(buildAtlas);

  // ---------------------------------------------------------------- буферы кадра
  function makeTarget(w, h) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (ENC === 0) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fb, w, h };
  }
  function freeTarget(t) { if (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); } }
  let tScene = null, tDof = null;
  let cssW = 16, cssH = 9;
  let heat = false;                                  // тепловая карта шагов луча (только для замеров)
  let scale = SHOT ? 0.75 : 0.8;         // доля CSS-пикселей для сцены (подстраивается по времени кадра)
  const SCALE_MIN = 0.45, SCALE_MAX = 1;
  function sizeTargets() {
    const rw = Math.max(64, Math.round(cssW * scale)), rh = Math.max(36, Math.round(cssH * scale));
    if (tScene && tScene.w === rw && tScene.h === rh) return;
    freeTarget(tScene); freeTarget(tDof);
    tScene = makeTarget(rw, rh);
    tDof = makeTarget(Math.max(32, rw >> 1), Math.max(18, rh >> 1));
  }
  function resize() {
    const r = filmEl.getBoundingClientRect();
    cssW = Math.max(160, Math.round(r.width)); cssH = Math.max(90, Math.round(r.height));
    const dpr = SHOT ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(cssW * dpr), h = Math.round(cssH * dpr);
    // размер не изменился — холст не трогаем (присваивание width стирает кадр)
    if (canvas.width === w && canvas.height === h && tScene) return;
    canvas.width = w; canvas.height = h;
    sizeTargets();
    dirty = true;
    if (SHOT) shotRequest();
  }

  // ---------------------------------------------------------------- состояние → униформы
  const snBuf = new Float32Array(26 * 4);
  const ckBuf = new Float32Array(120 * 4);
  const flyBuf = new Float32Array(8 * 4);
  const bugBuf = new Float32Array(6 * 4);
  const miscBuf = new Float32Array(8 * 4);

  function camBasis(c) {
    const f = V.norm(V.sub(c.tgt, c.pos));
    let r = V.norm(V.cross(f, [0, 1, 0]));
    let u = V.cross(r, f);
    if (c.roll) { r = V.rot(r, f, c.roll); u = V.rot(u, f, c.roll); }
    return { f, r, u };
  }

  function setupScene(st, frame) {
    const pr = progScene;
    gl.useProgram(pr.p);
    const c = st.cam, B = camBasis(c);
    const focus = Array.isArray(c.focus) ? Math.max(0.3, V.dot(V.sub(c.focus, c.pos), B.f)) : (c.focus || 20);
    gl.uniform2f(U(pr, 'uRes'), tScene.w, tScene.h);
    gl.uniform1f(U(pr, 'uFrame'), frame);
    gl.uniform1i(U(pr, 'uZero'), 0);
    gl.uniform3fv(U(pr, 'uCamPos'), c.pos);
    gl.uniformMatrix3fv(U(pr, 'uCamRot'), false, [...B.r, ...B.u, ...B.f]);
    gl.uniform4f(U(pr, 'uLens'), Math.tan(c.fov * Math.PI / 360), focus, c.ap, MAX_COC);
    gl.uniform1i(U(pr, 'uSet'), st.set);
    gl.uniform1i(U(pr, 'uEnc'), ENC);
    gl.uniform1i(U(pr, 'uDebug'), heat ? 1 : 0);
    const L = st.light;
    gl.uniform3fv(U(pr, 'uKeyDir'), L.key); gl.uniform3fv(U(pr, 'uKeyCol'), L.keyCol);
    gl.uniform3fv(U(pr, 'uSkyAmb'), L.sky); gl.uniform3fv(U(pr, 'uGndAmb'), L.gnd);
    gl.uniform3fv(U(pr, 'uRimDir'), L.rim); gl.uniform3fv(U(pr, 'uRimCol'), L.rimCol);
    gl.uniform3fv(U(pr, 'uSkyTop'), L.skyTop); gl.uniform3fv(U(pr, 'uSkyHor'), L.skyHor); gl.uniform3fv(U(pr, 'uSkyLow'), L.skyLow);
    gl.uniform4f(U(pr, 'uSun'), L.sun[0], L.sun[1], L.sun[2], L.sunSize);
    gl.uniform4f(U(pr, 'uSunCol'), L.sunCol[0], L.sunCol[1], L.sunCol[2], L.moon);
    gl.uniform4f(U(pr, 'uAtmo'), L.haze, L.stars, L.bokeh, L.night);
    rigSnail(st.snail, snBuf);
    gl.uniform4fv(U(pr, 'uSn'), snBuf);
    const cks = st.crickets.filter((k) => k && k.on !== 0).slice(0, 4);
    ckBuf.fill(0);
    cks.forEach((k, i) => rigCricket(k, ckBuf, i * 120));
    gl.uniform4fv(U(pr, 'uCk'), ckBuf);
    gl.uniform1i(U(pr, 'uNCk'), cks.length);
    flyBuf.fill(0);
    const flies = st.flies.filter((f) => f[3] > 0.01).slice(0, 8);
    flies.forEach((f, i) => flyBuf.set(f, i * 4));
    gl.uniform4fv(U(pr, 'uFly'), flyBuf);
    gl.uniform1i(U(pr, 'uNFly'), flies.length);
    bugBuf.fill(0);
    const bugs = st.bugs.slice(0, 3);
    bugs.forEach((b, i) => {
      bugBuf.set([b[0], groundH(b[0], b[2]), b[2], b[3]], i * 8);
      bugBuf.set([b[4], b[5], b[6] || 0, 0], i * 8 + 4);
    });
    gl.uniform4fv(U(pr, 'uBug'), bugBuf);
    gl.uniform1i(U(pr, 'uNBug'), bugs.length);
    miscBuf.fill(0);
    if (st.berry) {
      const b = st.berry;
      miscBuf.set([b.p[0], b.p[1] + groundH(b.p[0], b.p[2]) * 0 + 0, b.p[2], b.eaten], 0);
      miscBuf.set([...b.axis, 1], 4);
      miscBuf.set([-0.85, 0.25, 0.35, 0], 16);
    }
    if (st.title) miscBuf.set([st.title.a, st.title.b, st.title.pop, st.title.color], 8);
    else miscBuf.set([-1, -1, 0, 0], 8);
    miscBuf.set([st.mush || 0, 0, 0, 0], 12);
    miscBuf.set([st.title ? st.title.h : 3, 0, 0, 0], 20);
    gl.uniform4fv(U(pr, 'uMisc'), miscBuf);
    gl.uniform4fv(U(pr, 'uTxt'), txtRects);
    gl.uniform2f(U(pr, 'uTextSize'), textSize[0], textSize[1]);
    gl.uniform1i(U(pr, 'uText'), 0);
  }
  const MAX_COC = 0.045;
  function drawTo(target) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
    gl.viewport(0, 0, target.w, target.h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function setupDof() {
    gl.useProgram(progDof.p);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tScene.tex);
    gl.uniform1i(U(progDof, 'uScene'), 0);
    gl.uniform2f(U(progDof, 'uHalfRes'), tDof.w, tDof.h);
    gl.uniform1f(U(progDof, 'uMaxCoc'), MAX_COC);
    gl.uniform1i(U(progDof, 'uEnc'), ENC);
  }
  function drawComp(st, frame) {
    gl.useProgram(progComp.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tScene.tex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tDof.tex);
    gl.uniform1i(U(progComp, 'uScene'), 0);
    gl.uniform1i(U(progComp, 'uDof'), 1);
    gl.uniform1i(U(progComp, 'uEnc'), ENC);
    gl.uniform1f(U(progComp, 'uFrame'), frame);
    gl.uniform1f(U(progComp, 'uExposure'), st.exposure);
    gl.uniform1f(U(progComp, 'uFade'), clamp(st.fade, 0, 1));
    gl.uniform1f(U(progComp, 'uGrain'), st.grain);
    gl.uniform1f(U(progComp, 'uVig'), st.vig);
    gl.uniform1f(U(progComp, 'uFlicker'), st.flicker);
    gl.uniform1f(U(progComp, 'uSat'), st.sat);
    gl.uniform3fv(U(progComp, 'uTint'), st.tint);
    gl.uniform1i(U(progComp, 'uDebug'), heat ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  const perf = { renders: 0, lastMs: 0, readyMs: 0, log: [] };
  // Кадр целиком: сцена → глубина резкости (половинное разрешение) → сборка на экран.
  function renderFrame(frame) {
    const t0 = performance.now();
    const st = evaluate(frame / FPS);
    curShot = st.shot;
    setupScene(st, frame);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texText);
    drawTo(tScene);
    setupDof();
    drawTo(tDof);
    drawComp(st, frame);
    if (DIAG) { gl.finish(); diag('frame ' + Math.round(performance.now() - t0) + 'ms, target ' + tScene.w + 'x' + tScene.h); }
    perf.lastMs = Math.round(performance.now() - t0);
    perf.renders++;
    shownFrame = frame;
  }
  let shownFrame = -1;

  // ---------------------------------------------------------------- плеер
  const ui = {
    play: $('#play'), sound: $('#sound'), soundStart: $('#soundStart'), replay: $('#replay'), fs: $('#fs'),
    cur: $('#cur'), dur: $('#dur'), track: $('#track'), fill: $('#fill'), knob: $('#knob'), tip: $('#tip'),
    marks: $('#marks'), chapters: $('#chapters'), scene: $('#sceneName'), loading: $('#loading'),
  };
  // при съёмке обложки фильм сразу стоит на самом выразительном кадре
  let t = SHOT ? COVER_T : 0, playing = !SHOT, ended = false, dirty = true, lastFrame = -1, curShot = -1;
  let soundOn = false, started = false;
  let lastNow = performance.now();

  function sceneAt(tt) { let s = SCENES[0]; for (const sc of SCENES) if (tt >= sc.t) s = sc; return s; }
  ui.dur.textContent = fmt(DURATION);
  SCENES.forEach((sc, i) => {
    const m = document.createElement('button');
    m.className = 'mark'; m.type = 'button';
    m.style.left = (sc.t / DURATION * 100) + '%';
    m.innerHTML = '<span>' + sc.name + '</span>';
    m.setAttribute('aria-label', 'Сцена ' + (i + 1) + ': ' + sc.name);
    m.addEventListener('click', (e) => { e.stopPropagation(); seek(sc.t + 0.01); });
    ui.marks.appendChild(m);
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = '<span class="n">' + (i + 1) + '</span><span class="nm">' + sc.name + '</span><span class="tm">' + fmt(sc.t) + '</span>';
    b.addEventListener('click', () => seek(sc.t + 0.01));
    li.appendChild(b);
    ui.chapters.appendChild(li);
  });

  function setPlaying(p) {
    playing = p;
    if (p && ended) { ended = false; if (t >= DURATION - 0.05) t = 0; }
    document.body.classList.toggle('is-playing', playing);
    ui.play.setAttribute('aria-label', playing ? 'Пауза' : 'Смотреть');
    if (window.AUDIO) { if (playing && soundOn) AUDIO.play(t); else AUDIO.pause(); }
    audioStall = 0;
    if (playing) runLoop();
  }
  function seek(tt) {
    t = clamp(tt, 0, DURATION - 0.001);
    ended = false;
    dirty = true;
    if (window.AUDIO && soundOn && playing) { AUDIO.play(t); audioStall = 0; }
    if (SHOT) shotRequest();
    updateUI();
  }
  // «Смотреть со звуком»: звук разрешён жестом, фильм начинается с первого кадра
  function startWithSound() {
    soundOn = true;
    document.body.classList.add('sound-on');
    if (window.AUDIO) AUDIO.enable();
    t = 0; ended = false; dirty = true;
    setPlaying(true);
    updateUI();
  }
  function toggleSound() {
    if (!soundOn || !window.AUDIO || !AUDIO.enabled()) { startWithSound(); return; }
    const m = !AUDIO.muted();
    AUDIO.setMuted(m);
    document.body.classList.toggle('muted', m);
    ui.sound.setAttribute('aria-label', m ? 'Включить звук' : 'Выключить звук');
  }
  ui.play.addEventListener('click', () => setPlaying(!playing));
  ui.soundStart.addEventListener('click', startWithSound);
  ui.sound.addEventListener('click', toggleSound);
  ui.replay.addEventListener('click', () => { seek(0); setPlaying(true); });
  ui.fs.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (stageEl.requestFullscreen) stageEl.requestFullscreen().catch(() => {});
  });
  document.addEventListener('fullscreenchange', () => { document.body.classList.toggle('fs', !!document.fullscreenElement); setTimeout(resize, 50); });
  filmEl.addEventListener('click', () => setPlaying(!playing));

  // шкала времени: перетаскивание
  let dragging = false;
  function trackT(e) { const r = ui.track.getBoundingClientRect(); return clamp((e.clientX - r.left) / r.width, 0, 1) * DURATION; }
  ui.track.addEventListener('pointerdown', (e) => { dragging = true; ui.track.setPointerCapture(e.pointerId); seek(trackT(e)); });
  ui.track.addEventListener('pointermove', (e) => {
    const tt = trackT(e);
    ui.tip.textContent = fmt(tt) + ' · ' + sceneAt(tt).name;
    ui.tip.style.left = (tt / DURATION * 100) + '%';
    if (dragging) seek(tt);
  });
  ui.track.addEventListener('pointerup', () => { dragging = false; });
  ui.track.addEventListener('pointercancel', () => { dragging = false; });
  ui.track.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { seek(t - 5); e.preventDefault(); }
    if (e.key === 'ArrowRight') { seek(t + 5); e.preventDefault(); }
  });

  document.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (e.code === 'Space') { e.preventDefault(); setPlaying(!playing); }
    else if (e.key === 'ArrowLeft' && e.target !== ui.track) { e.preventDefault(); seek(t - 5); }
    else if (e.key === 'ArrowRight' && e.target !== ui.track) { e.preventDefault(); seek(t + 5); }
    else if (e.key === 'f' || e.key === 'F' || e.key === 'а' || e.key === 'А') ui.fs.click();
    else if (e.key === 'm' || e.key === 'M' || e.key === 'ь' || e.key === 'Ь') toggleSound();
  });

  // панель в полноэкранном режиме прячется, когда мышь не двигается
  let idleTimer = 0;
  function wake() { document.body.classList.remove('idle'); clearTimeout(idleTimer); idleTimer = setTimeout(() => { if (playing) document.body.classList.add('idle'); }, 2600); }
  stageEl.addEventListener('pointermove', wake);

  let wasPlaying = false;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { wasPlaying = playing; if (playing) setPlaying(false); }
    else if (wasPlaying) { lastNow = performance.now(); setPlaying(true); }
  });

  function updateUI() {
    const k = t / DURATION;
    ui.fill.style.transform = 'scaleX(' + k.toFixed(4) + ')';
    ui.knob.style.left = (k * 100) + '%';
    ui.cur.textContent = fmt(t);
    ui.track.setAttribute('aria-valuenow', String(Math.round(t)));
    ui.track.setAttribute('aria-valuetext', fmt(t) + ', ' + sceneAt(t).name);
    const sc = sceneAt(t);
    if (ui.scene.textContent !== sc.name) ui.scene.textContent = sc.name;
    document.body.classList.toggle('ended', ended);
  }

  // ---------------------------------------------------------------- цикл
  // Программы собираются параллельно (KHR_parallel_shader_compile), страница их не ждёт.
  let failed = false;
  function canRender() {
    if (failed) return false;
    if (started) return true;
    if (!ready(progScene) || !ready(progDof) || !ready(progComp) || (SHOT && !atlasReady)) return false;
    started = true;
    perf.readyMs = Math.round(performance.now() - T_START);
    diag('programs ready');
    if (!check(progScene, 'сцена') || !check(progDof, 'резкость') || !check(progComp, 'сборка')) {
      failed = true;
      $('.nogl-t').textContent = 'Сцена не слепилась';
      $('.nogl-msg p:last-child').textContent = 'Видеокарта не смогла собрать шейдер сцены. Попробуйте свежий Chrome, Safari или Firefox.';
      document.body.classList.add('no-gl');
      return false;
    }
    return true;
  }

  let slowFrames = 0, fastFrames = 0, lastRendered = false, looping = false, audioStall = 0, lastNt = 0;
  function loop(now) {
    const dt = Math.min(0.1, (now - lastNow) / 1000);
    // подстройка разрешения по фактической длительности кадра (при съёмке выключена)
    if (!SHOT && lastRendered && playing) {
      if (dt > 0.05) { slowFrames++; fastFrames = 0; } else if (dt < 0.024) { fastFrames++; slowFrames = 0; }
      if (slowFrames >= 3 && scale > SCALE_MIN) { scale = Math.max(SCALE_MIN, scale * 0.85); slowFrames = 0; sizeTargets(); dirty = true; }
      if (fastFrames >= 24 && scale < SCALE_MAX) { scale = Math.min(SCALE_MAX, scale * 1.08); fastFrames = 0; sizeTargets(); dirty = true; }
    }
    lastRendered = false;
    lastNow = now;
    if (window.AUDIO && soundOn) AUDIO.tick();
    if (playing && !dragging) {
      // со звуком время фильма идёт по часам звуковой карты — картинка не уплывает от музыки;
      // если часы стоят дольше 1,5 с (устройство вывода не проснулось), фильм идёт сам,
      // а когда часы пойдут — звук заново сводится с картинкой
      if (window.AUDIO && soundOn && AUDIO.running()) {
        const nt = AUDIO.filmTime(t + dt);
        if (audioStall < 1.5) { audioStall = nt > t ? 0 : audioStall + dt; t = nt; }
        else { t += dt; if (nt > lastNt) { AUDIO.play(t); audioStall = 0; } }
        lastNt = nt;
      } else t += dt;
      if (t >= DURATION) { t = DURATION - 0.001; playing = false; ended = true; document.body.classList.remove('is-playing'); if (window.AUDIO) AUDIO.pause(); }
    }
    if (canRender()) {
      const want = Math.floor(t * FPS);
      if (want !== lastFrame || dirty) {
        renderFrame(want);
        lastFrame = want; dirty = false; lastRendered = true;
        ui.loading.classList.add('gone');
      }
    }
    updateUI();
    if (failed) { looping = false; return; }
    requestAnimationFrame(loop);
  }
  function runLoop() {
    if (looping) return;
    looping = true;
    lastNow = performance.now();
    requestAnimationFrame(loop);
  }

  // ---------------------------------------------------------------- режим съёмки
  // Программный рендер сервера медленный: кадр рисуется целиком один раз, заново — только после перемотки
  // или смены размера. Постоянного цикла нет, пока фильм не запустят вручную. Конец работы видеокарты
  // отмечает GPU-барьер (fence), страница при этом не блокируется.
  let shotQueued = false, shotGen = 0, shotDoneGen = 0;
  function shotRequest() {
    if (shotQueued || looping) return;
    shotQueued = true;
    requestAnimationFrame(shotRender);
  }
  function shotRender() {
    shotQueued = false;
    if (looping) return;
    if (!canRender()) { if (!failed) setTimeout(shotRequest, 50); return; }
    const frame = Math.floor(t * FPS), gen = ++shotGen;
    renderFrame(frame);
    lastFrame = frame; dirty = false;
    updateUI();
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const rec = { frame, w: tScene.w, h: tScene.h, sent: Math.round(performance.now() - T_START), done: 0 };
    perf.log.push(rec);
    const poll = () => {
      if (gl.getSyncParameter(sync, gl.SYNC_STATUS) !== gl.SIGNALED) { setTimeout(poll, 60); return; }
      gl.deleteSync(sync);
      rec.done = Math.round(performance.now() - T_START);
      shotDoneGen = Math.max(shotDoneGen, gen);
      ui.loading.classList.add('gone');
    };
    setTimeout(poll, 60);
  }

  // ---------------------------------------------------------------- для проверки
  window.__film = {
    seek: (tt) => { seek(tt); setPlaying(false); return tt; },
    state: () => ({ t, playing, ended, sound: soundOn, audio: !!(window.AUDIO && AUDIO.running()), scale, shot: curShot, shown: shownFrame, perf }),
    // тепловая карта шагов луча: красный — основной луч, зелёный — тень
    heat: (on) => { heat = !!on; dirty = true; if (SHOT) shotRequest(); return heat; },
    // доля CSS-пикселей для сцены: на медленном программном рендере проверочные кадры можно снимать дешевле
    quality: (s) => { const v = clamp(s, 0.1, 1); if (v !== scale) { scale = v; sizeTargets(); dirty = true; if (SHOT) shotRequest(); } return scale; },
    // выполнится, когда текущий кадр полностью отрисован
    ready: () => new Promise((res) => {
      const f = () => (!dirty && !shotQueued && (SHOT ? shotDoneGen === shotGen : lastFrame >= 0) ? res(perf) : setTimeout(f, 100));
      f();
    }),
  };

  window.addEventListener('resize', resize);
  if (SHOT) ui.loading.style.transition = 'none';
  resize();
  document.body.classList.toggle('is-playing', playing);
  if (SHOT) shotRequest(); else runLoop();
})();
