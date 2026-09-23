/* Карта хаоса: время до первого переворота двойного маятника.
   Каждый пиксель карты — отдельный маятник. На видеокарте состояние (θ₁, θ₂, ω₁, ω₂) живёт во float-текстуре
   и интегрируется методом Рунге — Кутты 4-го порядка; время переворота пишется во вторую текстуру. */
(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const SHOT = !!window.__SHOT__;
  const PI = Math.PI;
  const TMAX = 100;                       // модельное время, единицы √(l/g)
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------------------------------------------------------- физика (m₁ = m₂ = l₁ = l₂ = g = 1)
  function deriv(t1, t2, w1, w2, out) {
    const d = t1 - t2;
    const sd = Math.sin(d), cd = Math.cos(d);
    const den = 3 - Math.cos(2 * d);
    out[0] = w1;
    out[1] = w2;
    out[2] = (-3 * Math.sin(t1) - Math.sin(t1 - 2 * t2) - 2 * sd * (w2 * w2 + w1 * w1 * cd)) / den;
    out[3] = (2 * sd * (2 * w1 * w1 + 2 * Math.cos(t1) + w2 * w2 * cd)) / den;
  }
  const k1 = new Float64Array(4), k2 = new Float64Array(4), k3 = new Float64Array(4), k4 = new Float64Array(4);
  function rk4(s, o, h) { // s — Float64Array, o — смещение состояния
    const a = s[o], b = s[o + 1], c = s[o + 2], d = s[o + 3];
    deriv(a, b, c, d, k1);
    deriv(a + 0.5 * h * k1[0], b + 0.5 * h * k1[1], c + 0.5 * h * k1[2], d + 0.5 * h * k1[3], k2);
    deriv(a + 0.5 * h * k2[0], b + 0.5 * h * k2[1], c + 0.5 * h * k2[2], d + 0.5 * h * k2[3], k3);
    deriv(a + h * k3[0], b + h * k3[1], c + h * k3[2], d + h * k3[3], k4);
    s[o] = a + h / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
    s[o + 1] = b + h / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
    s[o + 2] = c + h / 6 * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
    s[o + 3] = d + h / 6 * (k1[3] + 2 * k2[3] + 2 * k3[3] + k4[3]);
  }
  const forbidden = (t1, t2) => 2 * Math.cos(t1) + Math.cos(t2) > 1;

  // ---------------------------------------------------------------- форматирование
  const nf = (v, d) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(d).replace('.', ',');
  const deg = (r) => nf(r * 180 / PI, 1) + '°';
  const groupInt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

  // ---------------------------------------------------------------- инферно (полиномиальное приближение matplotlib)
  const INF = [
    [0.0002189403691192265, 0.001651004631001012, -0.01948089843709184],
    [0.1065134194856116, 0.5639564367884091, 3.932712388889277],
    [11.60249308247187, -3.972853965665698, -15.9423941062914],
    [-41.70399613139459, 17.43639888205313, 44.35414519872813],
    [77.162935699427, -33.40235894210092, -81.80730925738993],
    [-71.31942824499214, 32.62606426397723, 73.20951985803202],
    [25.13112622477341, -12.24266895238567, -23.07032500287172],
  ];
  function inferno(t) {
    const c = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      let v = INF[6][k];
      for (let i = 5; i >= 0; i--) v = v * t + INF[i][k];
      c[k] = Math.max(0, Math.min(1, v));
    }
    return c;
  }
  const flipToU = (f) => Math.min(1, Math.max(0, Math.log(Math.max(f, 0.5) / 0.5) / Math.log(TMAX / 0.5)));
  const flipColor = (f) => inferno(1 - flipToU(f) * 0.96);

  // ---------------------------------------------------------------- вид (квадрат в пространстве углов)
  const FULL = { cx: 0, cy: 0, half: PI };
  let view = { ...FULL };
  function clampView(v) {
    const half = Math.min(PI, Math.max(2e-4, v.half));
    const cx = Math.min(PI - half, Math.max(-PI + half, v.cx));
    const cy = Math.min(PI - half, Math.max(-PI + half, v.cy));
    return { cx, cy, half };
  }

  // ---------------------------------------------------------------- выбор бэкенда
  const mapCanvas = $('#map');
  const probe = document.createElement('canvas').getContext('webgl2');
  const hasFloat = !!(probe && probe.getExtension('EXT_color_buffer_float'));
  let rendererName = '';
  if (probe) {
    const dbg = probe.getExtension('WEBGL_debug_renderer_info');
    rendererName = dbg ? String(probe.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
  }
  const softGPU = /swiftshader|llvmpipe|software/i.test(rendererName);
  const gpu = hasFloat;
  if (!gpu) document.body.classList.add('no-float');

  const N = gpu ? (SHOT ? 512 : softGPU ? 384 : 1024) : 200;
  const DT = SHOT ? 0.02 : 0.01;
  let simT = 0;               // смоделированное время карты
  let stepsPerFrame = SHOT ? 60 : softGPU ? 4 : 10;

  // ================================================================ GPU
  let gl, P = {}, tex = {}, fbos = [], cur = 0, quad;
  if (gpu) {
    gl = mapCanvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, preserveDrawingBuffer: false });
    gl.getExtension('EXT_color_buffer_float');
    mapCanvas.width = N; mapCanvas.height = N;

    const VS = `#version 300 es
    in vec2 aPos; void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;
    const COMMON = `#version 300 es
    precision highp float;
    const float PI = 3.141592653589793;
    `;
    const FS_INIT = COMMON + `
    uniform vec4 uView; // cx, cy, half, N
    layout(location = 0) out vec4 oState;
    layout(location = 1) out vec4 oFlip;
    void main(){
      vec2 uv = gl_FragCoord.xy / uView.w;
      float t1 = uView.x + (uv.x * 2.0 - 1.0) * uView.z;
      float t2 = uView.y + (uv.y * 2.0 - 1.0) * uView.z;
      oState = vec4(t1, t2, 0.0, 0.0);
      oFlip = vec4(2.0 * cos(t1) + cos(t2) > 1.0 ? -1.0 : 0.0, 0.0, 0.0, 1.0);
    }`;
    const FS_STEP = COMMON + `
    uniform sampler2D uState;
    uniform sampler2D uFlip;
    uniform float uT0;
    uniform float uDt;
    uniform int uK;
    layout(location = 0) out vec4 oState;
    layout(location = 1) out vec4 oFlip;
    vec4 deriv(vec4 s){
      float d = s.x - s.y;
      float sd = sin(d), cd = cos(d);
      float den = 3.0 - cos(2.0 * d);
      float a1 = (-3.0 * sin(s.x) - sin(s.x - 2.0 * s.y) - 2.0 * sd * (s.w * s.w + s.z * s.z * cd)) / den;
      float a2 = (2.0 * sd * (2.0 * s.z * s.z + 2.0 * cos(s.x) + s.w * s.w * cd)) / den;
      return vec4(s.z, s.w, a1, a2);
    }
    void main(){
      ivec2 ij = ivec2(gl_FragCoord.xy);
      vec4 s = texelFetch(uState, ij, 0);
      float f = texelFetch(uFlip, ij, 0).r;
      if (f != 0.0){ oState = s; oFlip = vec4(f, 0.0, 0.0, 1.0); return; }
      float t = uT0;
      for (int i = 0; i < 400; i++){
        if (i >= uK) break;
        vec4 a = deriv(s);
        vec4 b = deriv(s + 0.5 * uDt * a);
        vec4 c = deriv(s + 0.5 * uDt * b);
        vec4 e = deriv(s + uDt * c);
        s += uDt / 6.0 * (a + 2.0 * b + 2.0 * c + e);
        t += uDt;
        if (abs(s.x) > PI || abs(s.y) > PI){ f = t; break; }
      }
      oState = s;
      oFlip = vec4(f, 0.0, 0.0, 1.0);
    }`;
    const FS_SHOW = COMMON + `
    uniform sampler2D uFlip;
    uniform float uTmax;
    uniform float uHatch;
    out vec4 o;
    vec3 inferno(float t){
      const vec3 c0 = vec3(0.0002189403691192265, 0.001651004631001012, -0.01948089843709184);
      const vec3 c1 = vec3(0.1065134194856116, 0.5639564367884091, 3.932712388889277);
      const vec3 c2 = vec3(11.60249308247187, -3.972853965665698, -15.9423941062914);
      const vec3 c3 = vec3(-41.70399613139459, 17.43639888205313, 44.35414519872813);
      const vec3 c4 = vec3(77.162935699427, -33.40235894210092, -81.80730925738993);
      const vec3 c5 = vec3(-71.31942824499214, 32.62606426397723, 73.20951985803202);
      const vec3 c6 = vec3(25.13112622477341, -12.24266895238567, -23.07032500287172);
      return clamp(c0 + t * (c1 + t * (c2 + t * (c3 + t * (c4 + t * (c5 + t * c6))))), 0.0, 1.0);
    }
    void main(){
      ivec2 ij = ivec2(gl_FragCoord.xy);
      float f = texelFetch(uFlip, ij, 0).r;
      vec3 c;
      if (f < 0.0){
        float s = step(0.62, fract((gl_FragCoord.x + gl_FragCoord.y) / uHatch));
        c = mix(vec3(0.078, 0.060, 0.068), vec3(0.17, 0.135, 0.148), s);
      } else if (f == 0.0){
        c = vec3(0.028, 0.020, 0.036);
      } else {
        float u = clamp(log(max(f, 0.5) / 0.5) / log(uTmax / 0.5), 0.0, 1.0);
        c = inferno(1.0 - u * 0.96);
      }
      o = vec4(c, 1.0);
    }`;

    const compile = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
      return sh;
    };
    const program = (fs, names) => {
      const p = gl.createProgram();
      gl.attachShader(p, compile(gl.VERTEX_SHADER, VS));
      gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
      gl.bindAttribLocation(p, 0, 'aPos');
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      const u = {};
      names.forEach((n) => { u[n] = gl.getUniformLocation(p, n); });
      return { p, u };
    };
    P.init = program(FS_INIT, ['uView']);
    P.step = program(FS_STEP, ['uState', 'uFlip', 'uT0', 'uDt', 'uK']);
    P.show = program(FS_SHOW, ['uFlip', 'uTmax', 'uHatch']);

    quad = gl.createVertexArray();
    gl.bindVertexArray(quad);
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const mk = (internal, format) => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, internal, N, N, 0, format, gl.FLOAT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    tex.state = [mk(gl.RGBA32F, gl.RGBA), mk(gl.RGBA32F, gl.RGBA)];
    tex.flip = [mk(gl.RGBA32F, gl.RGBA), mk(gl.RGBA32F, gl.RGBA)];
    for (let i = 0; i < 2; i++) {
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex.state[i], 0);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, tex.flip[i], 0);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
      fbos.push(fb);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  function gpuInit() {
    gl.bindVertexArray(quad);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbos[0]);
    gl.viewport(0, 0, N, N);
    gl.useProgram(P.init.p);
    gl.uniform4f(P.init.u.uView, view.cx, view.cy, view.half, N);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    cur = 0;
  }
  function gpuStep(k) {
    const src = cur, dst = 1 - cur;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbos[dst]);
    gl.viewport(0, 0, N, N);
    gl.useProgram(P.step.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex.state[src]);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tex.flip[src]);
    gl.uniform1i(P.step.u.uState, 0);
    gl.uniform1i(P.step.u.uFlip, 1);
    gl.uniform1f(P.step.u.uT0, simT);
    gl.uniform1f(P.step.u.uDt, DT);
    gl.uniform1i(P.step.u.uK, k);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    cur = dst;
  }
  function gpuShow() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, N, N);
    gl.useProgram(P.show.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex.flip[cur]);
    gl.uniform1i(P.show.u.uFlip, 0);
    gl.uniform1f(P.show.u.uTmax, TMAX);
    gl.uniform1f(P.show.u.uHatch, Math.max(6, N / 110));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  const readBuf = new Float32Array(4);
  function gpuRead(ix, iy) {
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fbos[cur]);
    gl.readBuffer(gl.COLOR_ATTACHMENT1);
    gl.readPixels(ix, iy, 1, 1, gl.RGBA, gl.FLOAT, readBuf);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    return readBuf[0];
  }

  // ================================================================ CPU (запасной путь)
  let cpu = null;
  if (!gpu) {
    const ctx = mapCanvas.getContext('2d');
    mapCanvas.width = N; mapCanvas.height = N;
    cpu = { ctx, img: ctx.createImageData(N, N), st: new Float64Array(N * N * 4), flip: new Float32Array(N * N) };
  }
  function cpuInit() {
    const { st, flip, img } = cpu;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const i = y * N + x;
        const t1 = view.cx + (((x + 0.5) / N) * 2 - 1) * view.half;
        const t2 = view.cy + (((y + 0.5) / N) * 2 - 1) * view.half;
        st[i * 4] = t1; st[i * 4 + 1] = t2; st[i * 4 + 2] = 0; st[i * 4 + 3] = 0;
        flip[i] = forbidden(t1, t2) ? -1 : 0;
        const o = ((N - 1 - y) * N + x) * 4;
        if (flip[i] < 0) {
          const s = ((x + y) % 7) < 2 ? 1 : 0;
          img.data[o] = s ? 43 : 20; img.data[o + 1] = s ? 34 : 15; img.data[o + 2] = s ? 38 : 17;
        } else { img.data[o] = 7; img.data[o + 1] = 5; img.data[o + 2] = 9; }
        img.data[o + 3] = 255;
      }
    }
  }
  function cpuStep(k) {
    const { st, flip, img } = cpu;
    for (let i = 0; i < N * N; i++) {
      if (flip[i] !== 0) continue;
      let t = simT;
      for (let j = 0; j < k; j++) {
        rk4(st, i * 4, DT);
        t += DT;
        if (Math.abs(st[i * 4]) > PI || Math.abs(st[i * 4 + 1]) > PI) {
          flip[i] = t;
          const c = flipColor(t);
          const x = i % N, y = (i / N) | 0;
          const o = ((N - 1 - y) * N + x) * 4;
          img.data[o] = c[0] * 255; img.data[o + 1] = c[1] * 255; img.data[o + 2] = c[2] * 255;
          break;
        }
      }
    }
  }
  function cpuShow() { cpu.ctx.putImageData(cpu.img, 0, 0); }

  // ================================================================ общий цикл карты
  function resetSim() {
    simT = 0;
    if (gpu) gpuInit(); else cpuInit();
    drawAxes();
    updateZoomLabel();
  }

  let frameEMA = 16;
  function stepMap(dtReal) {
    if (simT >= TMAX) return;
    const k = Math.max(1, Math.min(stepsPerFrame, Math.ceil((TMAX - simT) / DT)));
    if (gpu) gpuStep(k); else cpuStep(Math.min(k, 3));
    simT += (gpu ? k : Math.min(k, 3)) * DT;
    if (!SHOT && gpu) {
      // подстраиваем скорость проявления под видеокарту
      frameEMA += (dtReal * 1000 - frameEMA) * 0.08;
      if (frameEMA < 18 && stepsPerFrame < 160) stepsPerFrame = Math.ceil(stepsPerFrame * 1.12);
      else if (frameEMA > 30 && stepsPerFrame > 2) stepsPerFrame = Math.floor(stepsPerFrame * 0.8);
    }
  }

  // ---------------------------------------------------------------- счётчик и оси
  const counter = $('#counter'), progress = $('#progress');
  const plural = (n, one, few, many) => {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  };
  function updateCounter() {
    const total = groupInt(N * N);
    const word = plural(N * N, 'маятник', 'маятника', 'маятников');
    const done = simT >= TMAX;
    counter.innerHTML = done
      ? `<b>${total}</b> ${word} · готово: смоделировано до <b>t = 100</b>`
      : `<b>${total}</b> ${word} · <b>t = ${nf(simT, 1)}</b> из 100`;
    progress.style.transform = `scaleX(${Math.min(1, simT / TMAX)})`;
  }
  const zoomlabel = $('#zoomlevel');
  function updateZoomLabel() {
    const z = PI / view.half;
    zoomlabel.textContent = z < 1.01 ? 'весь квадрат' : `×${z < 100 ? nf(z, 1) : groupInt(Math.round(z))} · центр ${nf(view.cx, 3)}; ${nf(view.cy, 3)}`;
  }

  function niceStep(span) {
    const raw = span / 5;
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const m = raw / p;
    return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
  }
  function drawAxes() {
    const ax = $('#axisX'), ay = $('#axisY');
    ax.innerHTML = ''; ay.innerHTML = '';
    const lo = (c) => c - view.half, hi = (c) => c + view.half;
    const put = (el, isX, v, label, c) => {
      const f = (v - lo(c)) / (2 * view.half);
      if (f < -0.001 || f > 1.001) return;
      const s = document.createElement('span');
      s.textContent = label;
      if (isX) s.style.left = (f * 100) + '%'; else s.style.top = ((1 - f) * 100) + '%';
      el.appendChild(s);
    };
    if (view.half >= PI * 0.999) {
      const L = [[-PI, '−π'], [-PI / 2, '−π/2'], [0, '0'], [PI / 2, 'π/2'], [PI, 'π']];
      L.forEach(([v, l]) => { put(ax, true, v, l, view.cx); put(ay, false, v, l, view.cy); });
    } else {
      const st = niceStep(2 * view.half);
      const dig = Math.max(0, -Math.floor(Math.log10(st)));
      for (const [el, isX, c] of [[ax, true, view.cx], [ay, false, view.cy]]) {
        for (let v = Math.ceil(lo(c) / st) * st; v <= hi(c) + 1e-12; v += st) put(el, isX, v, nf(v, dig), c);
      }
    }
  }

  // ================================================================ маятник справа
  const pend = $('#pend');
  const pctx = pend.getContext('2d');
  let pw = 0, ph = 0, pdpr = 1;
  function sizePend() {
    const r = pend.getBoundingClientRect();
    pdpr = SHOT ? 1 : Math.min(2, window.devicePixelRatio || 1);
    pw = Math.max(10, Math.round(r.width * pdpr));
    ph = Math.max(10, Math.round(r.height * pdpr));
    pend.width = pw; pend.height = ph;
  }

  const ENS = 1000;
  const pstate = { mode: 'one', t: 0, t0: [1.75, 2.2], one: new Float64Array(4), ens: new Float64Array(ENS * 4), flipped: false, flipT: 0, mapFlip: null, trail: [], flash: 0 };
  function startPendulum(t1, t2, mapFlip) {
    pstate.t0 = [t1, t2];
    pstate.t = 0;
    pstate.one.set([t1, t2, 0, 0]);
    for (let i = 0; i < ENS; i++) {
      const e = (i / (ENS - 1) - 0.5) * 1e-4;
      pstate.ens.set([t1 + e, t2, 0, 0], i * 4);
    }
    pstate.flipped = false;
    pstate.flipT = 0;
    pstate.mapFlip = mapFlip;
    pstate.trail.length = 0;
    pstate.flash = 0;
    $('#r1').textContent = deg(t1);
    $('#r2').textContent = deg(t2);
    const note = $('#flipnote');
    note.classList.remove('hot');
    if (forbidden(t1, t2)) note.textContent = 'Эта точка в штриховке: энергии не хватит, маятник будет качаться без переворотов.';
    else if (mapFlip > 0) note.textContent = `Карта обещает переворот на t ≈ ${nf(mapFlip, 2)}. Проверим.`;
    else note.textContent = 'Карта ещё считает эту точку — смотрите, когда маятник перевернётся.';
    selectMarker = [t1, t2];
    drawOverlay();
  }

  const PEND_SPEED = reduceMotion ? 1.2 : 2.2; // единиц модельного времени в секунду
  const PDT = 0.004;
  function advancePendulum(dtReal) {
    let remain = dtReal * PEND_SPEED;
    const ensDt = 0.01;
    while (remain > 1e-9) {
      const h = Math.min(PDT, remain);
      if (pstate.mode === 'one') {
        rk4(pstate.one, 0, h);
        if (!pstate.flipped && (Math.abs(pstate.one[0]) > PI || Math.abs(pstate.one[1]) > PI)) onFlip(pstate.t + h);
      }
      pstate.t += h;
      remain -= h;
      if (pstate.mode === 'one') recordTrail();
    }
    if (pstate.mode === 'many') {
      // ансамбль шагает крупнее: 1000 маятников × несколько шагов за кадр
      const steps = Math.max(1, Math.round(dtReal * PEND_SPEED / ensDt));
      for (let s = 0; s < steps; s++) for (let i = 0; i < ENS; i++) rk4(pstate.ens, i * 4, ensDt);
    }
  }
  let trailClock = 0;
  function recordTrail() {
    trailClock += PDT;
    if (trailClock < 0.02) return;
    trailClock = 0;
    const [x, y] = bob2(pstate.one[0], pstate.one[1]);
    pstate.trail.push(x, y);
    if (pstate.trail.length > 1400) pstate.trail.splice(0, 2);
  }
  function onFlip(t) {
    pstate.flipped = true;
    pstate.flipT = t;
    pstate.flash = 1;
    const note = $('#flipnote');
    note.classList.add('hot');
    const m = pstate.mapFlip;
    if (m > 0) {
      const same = Math.abs(m - t) < 0.05;
      note.textContent = same
        ? `Переворот на t = ${nf(t, 2)} — как на карте.`
        : `Переворот на t = ${nf(t, 2)}, на карте — ${nf(m, 2)}. Разница — от точности: карта считает в 32 битах, маятник — в 64. Для хаоса это заметно.`;
    } else {
      note.textContent = `Переворот на t = ${nf(t, 2)}.`;
    }
  }

  function pendGeom() {
    const L = Math.min(pw, ph) * 0.2;
    return { cx: pw / 2, cy: ph * 0.46, L };
  }
  function bob1(t1) { const g = pendGeom(); return [g.cx + g.L * Math.sin(t1), g.cy + g.L * Math.cos(t1)]; }
  function bob2(t1, t2) { const g = pendGeom(); const b = bob1(t1); return [b[0] + g.L * Math.sin(t2), b[1] + g.L * Math.cos(t2)]; }

  function drawPendulum() {
    const c = pctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, pw, ph);
    const g = pendGeom();
    // окружность досягаемости
    c.strokeStyle = 'rgba(239,229,216,0.07)';
    c.lineWidth = 1 * pdpr;
    c.beginPath(); c.arc(g.cx, g.cy, g.L * 2, 0, PI * 2); c.stroke();
    c.beginPath(); c.moveTo(g.cx - g.L * 2.3, g.cy); c.lineTo(g.cx + g.L * 2.3, g.cy); c.stroke();

    if (pstate.mode === 'one') {
      // след нижнего груза
      const tr = pstate.trail;
      const n = tr.length / 2;
      c.lineCap = 'round';
      c.globalCompositeOperation = 'lighter';
      for (let i = 1; i < n; i++) {
        const a = i / n;
        const col = inferno(0.25 + 0.72 * a);
        c.strokeStyle = `rgba(${col[0] * 255 | 0},${col[1] * 255 | 0},${col[2] * 255 | 0},${(a * a * 0.9).toFixed(3)})`;
        c.lineWidth = (0.6 + 1.8 * a) * pdpr;
        c.beginPath(); c.moveTo(tr[i * 2 - 2], tr[i * 2 - 1]); c.lineTo(tr[i * 2], tr[i * 2 + 1]); c.stroke();
      }
      c.globalCompositeOperation = 'source-over';
      const [t1, t2] = pstate.one;
      drawRods(t1, t2, 'rgba(239,229,216,0.95)', 2.2 * pdpr, true);
      if (pstate.flash > 0) {
        const [x, y] = bob2(t1, t2);
        c.strokeStyle = `rgba(252,213,91,${pstate.flash.toFixed(3)})`;
        c.lineWidth = 2 * pdpr;
        c.beginPath(); c.arc(x, y, (1 - pstate.flash) * 60 * pdpr + 10 * pdpr, 0, PI * 2); c.stroke();
      }
    } else {
      c.globalCompositeOperation = 'lighter';
      c.lineCap = 'round';
      for (let i = 0; i < ENS; i++) {
        const col = inferno(0.18 + 0.8 * (i / (ENS - 1)));
        c.strokeStyle = `rgba(${col[0] * 255 | 0},${col[1] * 255 | 0},${col[2] * 255 | 0},0.09)`;
        c.lineWidth = 1.4 * pdpr;
        const t1 = pstate.ens[i * 4], t2 = pstate.ens[i * 4 + 1];
        const b1 = bob1(t1), b2 = bob2(t1, t2);
        c.beginPath(); c.moveTo(g.cx, g.cy); c.lineTo(b1[0], b1[1]); c.lineTo(b2[0], b2[1]); c.stroke();
      }
      c.globalCompositeOperation = 'source-over';
    }
    // шарнир
    c.fillStyle = '#efe5d8';
    c.beginPath(); c.arc(g.cx, g.cy, 3.2 * pdpr, 0, PI * 2); c.fill();
    $('#rt').textContent = nf(pstate.t, 2);
  }
  function drawRods(t1, t2, color, width, bobs) {
    const c = pctx, g = pendGeom();
    const b1 = bob1(t1), b2 = bob2(t1, t2);
    c.strokeStyle = color;
    c.lineWidth = width;
    c.lineCap = 'round';
    c.beginPath(); c.moveTo(g.cx, g.cy); c.lineTo(b1[0], b1[1]); c.lineTo(b2[0], b2[1]); c.stroke();
    if (bobs) {
      c.fillStyle = '#efe5d8';
      c.beginPath(); c.arc(b1[0], b1[1], 6.5 * pdpr, 0, PI * 2); c.fill();
      c.fillStyle = '#fcd55b';
      c.beginPath(); c.arc(b2[0], b2[1], 7.5 * pdpr, 0, PI * 2); c.fill();
    }
  }

  document.querySelectorAll('.seg button').forEach((b) => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.seg button').forEach((x) => x.classList.toggle('on', x === b));
      pstate.mode = b.dataset.mode;
      startPendulum(pstate.t0[0], pstate.t0[1], pstate.mapFlip);
      if (pstate.mode === 'many') {
        const note = $('#flipnote');
        note.classList.remove('hot');
        note.textContent = 'Тысяча маятников, стартовые углы различаются на стотысячные доли радиана. Через несколько секунд их пути разойдутся веером.';
      }
    });
  });

  // ================================================================ оверлей карты: курсор, выбор, панорама, зум
  const overlay = $('#overlay');
  const octx = overlay.getContext('2d');
  let ow = 0, oh = 0, odpr = 1;
  let hover = null;        // [x, y] в CSS-пикселях
  let selectMarker = null; // [θ1, θ2]
  function sizeOverlay() {
    const r = overlay.getBoundingClientRect();
    odpr = Math.min(2, window.devicePixelRatio || 1);
    ow = Math.round(r.width * odpr); oh = Math.round(r.height * odpr);
    overlay.width = ow; overlay.height = oh;
  }
  const toTheta = (x, y, w, h) => [view.cx + (x / w * 2 - 1) * view.half, view.cy + ((1 - y / h) * 2 - 1) * view.half];
  const fromTheta = (t1, t2) => [((t1 - view.cx) / view.half + 1) / 2 * ow, (1 - ((t2 - view.cy) / view.half + 1) / 2) * oh];

  function drawOverlay() {
    const c = octx;
    c.clearRect(0, 0, ow, oh);
    // тонкая сетка по нулям
    c.strokeStyle = 'rgba(239,229,216,0.07)';
    c.lineWidth = 1;
    const [zx, zy] = fromTheta(0, 0);
    if (zx > 0 && zx < ow) { c.beginPath(); c.moveTo(zx, 0); c.lineTo(zx, oh); c.stroke(); }
    if (zy > 0 && zy < oh) { c.beginPath(); c.moveTo(0, zy); c.lineTo(ow, zy); c.stroke(); }

    if (selectMarker) {
      const [x, y] = fromTheta(selectMarker[0], selectMarker[1]);
      if (x > -20 && x < ow + 20 && y > -20 && y < oh + 20) {
        c.strokeStyle = 'rgba(13,10,12,0.8)';
        c.lineWidth = 4 * odpr;
        c.beginPath(); c.arc(x, y, 9 * odpr, 0, PI * 2); c.stroke();
        c.strokeStyle = '#efe5d8';
        c.lineWidth = 1.6 * odpr;
        c.beginPath(); c.arc(x, y, 9 * odpr, 0, PI * 2); c.stroke();
        c.fillStyle = '#efe5d8';
        c.beginPath(); c.arc(x, y, 2 * odpr, 0, PI * 2); c.fill();
      }
    }
    if (hover && !drag) {
      const x = hover[0] * odpr, y = hover[1] * odpr;
      c.strokeStyle = 'rgba(239,229,216,0.35)';
      c.lineWidth = 1;
      c.setLineDash([3 * odpr, 4 * odpr]);
      c.beginPath(); c.moveTo(x, 0); c.lineTo(x, oh); c.moveTo(0, y); c.lineTo(ow, y); c.stroke();
      c.setLineDash([]);
      // подпись у курсора
      const [t1, t2] = toTheta(hover[0], hover[1], ow / odpr, oh / odpr);
      const f = sampleFlip(hover[0], hover[1]);
      const lines = [`θ₁ ${deg(t1)}   θ₂ ${deg(t2)}`, f < 0 ? 'переворот невозможен' : f === 0 ? 'пока не перевернулся' : `переворот на t = ${nf(f, 2)}`];
      c.font = `${12 * odpr}px 'IBM Plex Mono', monospace`;
      const wBox = Math.max(...lines.map((l) => c.measureText(l).width)) + 20 * odpr;
      const hBox = 44 * odpr;
      let bx = x + 14 * odpr, by = y + 14 * odpr;
      if (bx + wBox > ow) bx = x - wBox - 14 * odpr;
      if (by + hBox > oh) by = y - hBox - 14 * odpr;
      c.fillStyle = 'rgba(13,10,12,0.88)';
      c.fillRect(bx, by, wBox, hBox);
      c.strokeStyle = 'rgba(239,229,216,0.18)';
      c.strokeRect(bx + 0.5, by + 0.5, wBox - 1, hBox - 1);
      c.fillStyle = '#efe5d8';
      c.fillText(lines[0], bx + 10 * odpr, by + 18 * odpr);
      c.fillStyle = f > 0 ? '#fcd55b' : 'rgba(239,229,216,0.7)';
      c.fillText(lines[1], bx + 10 * odpr, by + 35 * odpr);
    }
  }

  function sampleFlip(x, y) {
    const r = overlay.getBoundingClientRect();
    const ix = Math.max(0, Math.min(N - 1, Math.floor(x / r.width * N)));
    const iy = Math.max(0, Math.min(N - 1, Math.floor((1 - y / r.height) * N)));
    if (gpu) return gpuRead(ix, iy);
    return cpu.flip[iy * N + ix];
  }

  let drag = null;
  overlay.addEventListener('pointerdown', (e) => {
    overlay.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId };
  });
  overlay.addEventListener('pointermove', (e) => {
    const r = overlay.getBoundingClientRect();
    hover = [e.clientX - r.left, e.clientY - r.top];
    if (drag && e.pointerId === drag.id) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) > 5) drag.moved = true;
      if (drag.moved) mapCanvas.style.transform = `translate(${dx}px, ${dy}px)`;
    }
    needOverlay = true;
  });
  overlay.addEventListener('pointerleave', () => { hover = null; needOverlay = true; });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const r = overlay.getBoundingClientRect();
    if (drag.moved) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      view = clampView({ cx: view.cx - dx / r.width * 2 * view.half, cy: view.cy + dy / r.height * 2 * view.half, half: view.half });
      mapCanvas.style.transform = '';
      resetSim();
    } else {
      const x = e.clientX - r.left, y = e.clientY - r.top;
      const [t1, t2] = toTheta(x, y, r.width, r.height);
      startPendulum(t1, t2, sampleFlip(x, y));
    }
    drag = null;
    needOverlay = true;
  };
  overlay.addEventListener('pointerup', endDrag);
  overlay.addEventListener('pointercancel', (e) => { mapCanvas.style.transform = ''; drag = null; });

  overlay.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = overlay.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const k = e.deltaY < 0 ? 1 / 1.35 : 1.35;
    zoomAt(x / r.width, y / r.height, k);
  }, { passive: false });
  function zoomAt(fx, fy, k) {
    const [t1, t2] = [view.cx + (fx * 2 - 1) * view.half, view.cy + ((1 - fy) * 2 - 1) * view.half];
    const half = Math.min(PI, Math.max(2e-4, view.half * k));
    // точка под курсором остаётся на месте
    view = clampView({ cx: t1 - (fx * 2 - 1) * half, cy: t2 - ((1 - fy) * 2 - 1) * half, half });
    resetSim();
    needOverlay = true;
  }
  $('#zin').addEventListener('click', () => {
    if (selectMarker) {
      const half = Math.max(2e-4, view.half / 2);
      view = clampView({ cx: selectMarker[0], cy: selectMarker[1], half });
      resetSim(); needOverlay = true;
    } else zoomAt(0.5, 0.5, 0.5);
  });
  $('#zout').addEventListener('click', () => zoomAt(0.5, 0.5, 2));
  $('#zreset').addEventListener('click', () => { view = { ...FULL }; resetSim(); needOverlay = true; });

  // ================================================================ цикл
  let needOverlay = true;
  let last = performance.now();
  let running = true;
  let counterClock = 0;
  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    stepMap(dt);
    if (gpu) gpuShow(); else cpuShow();
    advancePendulum(dt);
    if (pstate.flash > 0) pstate.flash = Math.max(0, pstate.flash - dt * 0.9);
    drawPendulum();
    if (needOverlay) { drawOverlay(); needOverlay = !!hover && !drag; }
    counterClock += dt;
    if (counterClock > 0.1) { counterClock = 0; updateCounter(); }
    if (SHOT && simT >= shotTarget) { updateCounter(); return; }
    requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) running = false;
    else if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); }
  });

  function onResize() { sizePend(); sizeOverlay(); drawAxes(); needOverlay = true; }
  window.addEventListener('resize', onResize);

  // ---------------------------------------------------------------- старт
  const shotTarget = 26; // для обложки: карта проявлена до t ≈ 26
  onResize();
  resetSim();
  startPendulum(1.75, 2.2, 9.68);
  if (SHOT) {
    // обложка: маятник уже в пути, со следом
    advancePendulum(3.4);
  }
  updateCounter();
  requestAnimationFrame((t) => { last = t; frame(t); });
})();
