/* Волновая ванна — двумерное волновое уравнение на WebGL2.
   Состояние воды: RGBA32F (r — высота сейчас, g — высота шагом раньше, b — средняя энергия).
   Среда: RGBA8 (r — стена, g — скорость волны, b — поглощающий «пляж» у краёв). */
(() => {
  'use strict';

  /* ---------- Константы ---------- */
  const CELL_MM = 0.5;        // клетка сетки = 0,5 мм (условный масштаб)
  const WAVE_MM_S = 240;      // скорость волны 24 см/с
  const C = 0.5;              // число Куранта: клеток за шаг
  const SPONGE = 30;          // ширина поглощающего края, клеток
  const MAX_SRC = 16;
  const AVG = 0.012;          // скорость усреднения энергии
  const TARGET_SPS = 430;     // шагов симуляции в секунду

  const $ = (s) => document.querySelector(s);
  const tank = $('#tank');
  const glCanvas = $('#gl');
  const ovl = $('#ovl');
  const octx = ovl.getContext('2d');
  const chart = $('#chart');
  const cctx = chart.getContext('2d');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SHOT = !!window.__SHOT__; // съёмка обложки: полное качество, без понижения сетки
  const num = (v, d = 1) => v.toFixed(d).replace('.', ',').replace('-', '−');

  const failBox = $('#fail');
  function fail(msg) {
    failBox.hidden = false;
    document.querySelector('.toolbar').hidden = true;
    document.querySelector('.modes').hidden = true;
    if (msg) failBox.dataset.err = msg;
  }

  /* ---------- WebGL ---------- */
  const gl = glCanvas.getContext('webgl2', {
    antialias: false, alpha: false, depth: false, stencil: false,
    premultipliedAlpha: false, powerPreference: 'high-performance',
  });
  if (!gl || !gl.getExtension('EXT_color_buffer_float')) { fail(); return; }

  const VS = `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUV;
void main(){ vUV = aPos*0.5+0.5; gl_Position = vec4(aPos,0.0,1.0); }`;

  const SIM = `#version 300 es
precision highp float; precision highp int;
uniform highp sampler2D uState;
uniform highp sampler2D uMedium;
uniform ivec2 uSize;
uniform float uC2, uPhase, uDrivePt, uDriveLn, uDamp;
uniform int uNumSrc, uNumLine;
uniform vec4 uSrc[${MAX_SRC}];
uniform vec4 uLine[2];
uniform vec4 uImp;
out vec4 o;
float segD2(vec2 p, vec2 a, vec2 b){
  vec2 pa = p-a, ba = b-a;
  float h = clamp(dot(pa,ba)/max(dot(ba,ba),1e-6), 0.0, 1.0);
  vec2 d = pa - ba*h; return dot(d,d);
}
void main(){
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 m = texelFetch(uMedium, p, 0);
  vec4 s = texelFetch(uState, p, 0);
  if (m.r > 0.5) { o = vec4(0.0, 0.0, s.b*(1.0-${AVG.toFixed(4)}), 0.0); return; }
  ivec2 hi = uSize - 1;
  float l = texelFetch(uState, ivec2(max(p.x-1,0), p.y), 0).r;
  float r = texelFetch(uState, ivec2(min(p.x+1,hi.x), p.y), 0).r;
  float d = texelFetch(uState, ivec2(p.x, max(p.y-1,0)), 0).r;
  float u = texelFetch(uState, ivec2(p.x, min(p.y+1,hi.y)), 0).r;
  float lap = l + r + d + u - 4.0*s.r;
  float c = m.g;
  float g = m.b*0.42 + uDamp;
  float un = (2.0*s.r - (1.0-g)*s.g + uC2*c*c*lap) / (1.0+g);
  vec2 x = vec2(p) + 0.5;
  float drive = 0.0;
  for (int i = 0; i < ${MAX_SRC}; i++) {
    if (i >= uNumSrc) break;
    vec4 q = uSrc[i];
    vec2 dx = x - q.xy;
    float d2 = dot(dx,dx);
    if (d2 < 36.0) drive += uDrivePt * q.w * exp(-d2*0.5) * sin(uPhase + q.z);
  }
  for (int j = 0; j < 2; j++) {
    if (j >= uNumLine) break;
    float d2 = segD2(x, uLine[j].xy, uLine[j].zw);
    if (d2 < 16.0) drive += uDriveLn * exp(-d2) * sin(uPhase);
  }
  un += drive;
  if (uImp.z != 0.0) { vec2 dx = x - uImp.xy; un += uImp.z * exp(-dot(dx,dx)/(uImp.w*uImp.w)); }
  float I = s.b + ${AVG.toFixed(4)}*(un*un - s.b);
  o = vec4(un, s.r, I, 0.0);
}`;

  const SHADE = `#version 300 es
precision highp float; precision highp int;
uniform highp sampler2D uState;
uniform ivec2 uSize;
uniform float uFocus;
out vec4 o;
void main(){
  ivec2 p = ivec2(gl_FragCoord.xy); ivec2 hi = uSize-1;
  vec4 s = texelFetch(uState, p, 0);
  float l = texelFetch(uState, ivec2(max(p.x-1,0), p.y), 0).r;
  float r = texelFetch(uState, ivec2(min(p.x+1,hi.x), p.y), 0).r;
  float d = texelFetch(uState, ivec2(p.x, max(p.y-1,0)), 0).r;
  float u = texelFetch(uState, ivec2(p.x, min(p.y+1,hi.y)), 0).r;
  float lap = l + r + d + u - 4.0*s.r;
  // Мягкое ограничение кривизны: слабые волны остаются заметными, сильные не выжигают кадр
  float x = uFocus*lap;
  x = x / (1.0 + 0.85*abs(x));
  float B = 1.0 / max(0.2, 1.0 + x);
  o = vec4(B, s.r, sqrt(max(2.0*s.b, 0.0)), 1.0);
}`;

  const DISP = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uShade;
uniform sampler2D uMedium;
uniform vec2 uTexel;
uniform int uMode;
uniform float uAmpRef, uTime;
out vec4 o;
float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
vec3 energyMap(float t){
  t = clamp(t, 0.0, 1.0);
  vec3 a = vec3(0.025,0.04,0.055), b = vec3(0.05,0.24,0.30), c = vec3(0.33,0.71,0.64), d = vec3(0.99,0.94,0.80);
  if (t < 0.36) return mix(a, b, t/0.36);
  if (t < 0.72) return mix(b, c, (t-0.36)/0.36);
  return mix(c, d, (t-0.72)/0.28);
}
void main(){
  vec4 sh = texture(uShade, vUV);
  vec4 m = texture(uMedium, vUV);
  vec3 col;
  if (uMode == 0) {
    float B = sh.r;
    float v = 1.0 - exp(-max(B-0.96, 0.0)*1.25);
    float trough = smoothstep(0.99, 0.55, B);
    vec3 base = vec3(0.034, 0.064, 0.080);
    vec3 lite = vec3(0.74, 0.92, 0.90);
    col = mix(base, lite, v);
    col = mix(col, base*0.45, trough*0.6);
    col += vec3(0.13, 0.08, 0.01) * v*v*v;
  } else if (uMode == 1) {
    float h = sh.g / uAmpRef;
    vec3 zero = vec3(0.03, 0.045, 0.06);
    vec3 pos = vec3(0.97, 0.70, 0.37);
    vec3 neg = vec3(0.32, 0.63, 0.90);
    float a = 1.0 - exp(-abs(h)*1.15);
    col = mix(zero, h > 0.0 ? pos : neg, a);
  } else {
    float e = sh.b / uAmpRef;
    col = energyMap(1.0 - exp(-e*0.85));
  }
  float slow = 1.0 - m.g;
  if (slow > 0.004) {
    col = mix(col, col*vec3(0.9,1.03,1.1) + vec3(0.015,0.045,0.055), clamp(slow*1.7, 0.0, 0.55));
    float edge = clamp(fwidth(m.g)*10.0, 0.0, 1.0);
    col += vec3(0.30,0.56,0.55) * edge * 0.45;
  }
  float w = smoothstep(0.32, 0.68, m.r);
  if (w > 0.0) {
    float wl = texture(uMedium, vUV + vec2(-uTexel.x, uTexel.y)*1.3).r;
    float hl = clamp((m.r - wl)*2.2, -1.0, 1.0);
    float grain = hash(floor(vUV/uTexel)*0.37);
    vec3 wc = vec3(0.74, 0.55, 0.31)*(0.84 + 0.16*grain) + hl*vec3(0.22, 0.17, 0.09);
    col = mix(col, wc, w);
  }
  vec2 q = vUV - 0.5;
  col *= mix(0.72, 1.0, smoothstep(0.86, 0.18, length(q*vec2(1.12, 1.0))));
  col += (hash(gl_FragCoord.xy + fract(uTime*0.37)*211.0) - 0.5) * 0.02;
  o = vec4(col, 1.0);
}`;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function program(fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name);
    }
    return { p, u };
  }
  let pSim, pShade, pDisp;
  try { pSim = program(SIM); pShade = program(SHADE); pDisp = program(DISP); }
  catch (e) { fail(String(e.message || e)); return; }

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  function texture(w, h, internal, format, type, filter) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
    return t;
  }
  function framebuffer(tex) {
    const f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('framebuffer');
    return f;
  }

  /* ---------- Состояние ---------- */
  const S = {
    W: 0, H: 0, portrait: false, quality: 1,
    t: 0, steps: 0, warm: true, warmTarget: 0, warmCap: SHOT ? 40 : 30,
    freq: 22, lambda: 21.8, k: 0, omega: 0,
    amp: 1, paused: false, mode: 0, tool: 'drop',
    preset: 0, params: [],
    pts: [], lines: [], user: [],
    detA: null, extraDamp: 0,
    planeA: null, prefillTo: null,
    mover: null, array: null, burst: null, foci: null, lens: null,
    imp: null,
  };
  let stTex = [], stFB = [], cur = 0, shadeTex = null, shadeFB = null, medTex = null;
  let med = null, medDirty = false;
  const srcBuf = new Float32Array(MAX_SRC * 4);
  const lineBuf = new Float32Array(8);
  let detData = null, detShow = null;

  function freeSim() {
    for (const t of stTex) gl.deleteTexture(t);
    for (const f of stFB) gl.deleteFramebuffer(f);
    if (shadeTex) { gl.deleteTexture(shadeTex); gl.deleteFramebuffer(shadeFB); gl.deleteTexture(medTex); }
  }
  function allocSim(W, H) {
    freeSim();
    stTex = [0, 1].map(() => texture(W, H, gl.RGBA32F, gl.RGBA, gl.FLOAT, gl.NEAREST));
    stFB = stTex.map(framebuffer);
    shadeTex = texture(W, H, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR);
    shadeFB = framebuffer(shadeTex);
    medTex = texture(W, H, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR);
    med = new Uint8Array(W * H * 4);
    cur = 0;
  }

  /* ---------- Волна: частота, длина, сила вибраторов ---------- */
  function setFreq(f) {
    S.freq = f;
    S.lambda = (WAVE_MM_S / f) / CELL_MM;        // длина волны в клетках
    S.k = 2 * Math.PI / S.lambda;
    S.omega = 2 * Math.asin(C * Math.sin(S.k / 2)); // дисперсия разностной схемы
    $('#hudL').textContent = num(S.lambda * CELL_MM) + ' мм';
    $('#hudF').textContent = num(f) + ' Гц';
    $('#freqOut').textContent = num(f) + ' Гц';
  }
  // Амплитуда излучения мягкого линейного источника: A = D·√π / (2·C·ω)
  const driveLine = () => S.amp * 2 * C * S.omega / Math.sqrt(Math.PI);
  // Точечный источник: амплитуда A на расстоянии 60 клеток (функция Грина 2D)
  const drivePoint = () => S.amp * 4 * C * C / (2 * Math.PI * Math.sqrt(2 / (Math.PI * S.k * 60)));

  /* ---------- Геометрия опытов ---------- */
  function spongeAt(x, y) {
    const d = Math.min(x, y, S.W - 1 - x, S.H - 1 - y);
    if (d >= SPONGE) return 0;
    const q = (SPONGE - d) / SPONGE;
    return Math.round(q * q * 255);
  }
  function clearMedium() {
    const { W, H } = S;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      med[i] = 0; med[i + 1] = 255; med[i + 2] = spongeAt(x, y); med[i + 3] = 255;
    }
  }
  const inside = (x, y) => x >= 0 && y >= 0 && x < S.W && y < S.H;
  function setWall(x, y, on) {
    x = Math.round(x); y = Math.round(y);
    if (!inside(x, y)) return;
    med[(y * S.W + x) * 4] = on ? 255 : 0;
  }
  function stampWall(x, y, r, on = true) {
    const r2 = r * r;
    for (let j = Math.floor(y - r); j <= Math.ceil(y + r); j++)
      for (let i = Math.floor(x - r); i <= Math.ceil(x + r); i++) {
        const dx = i - x, dy = j - y;
        if (dx * dx + dy * dy <= r2 && inside(i, j)) med[(j * S.W + i) * 4] = on ? 255 : 0;
      }
  }
  function setSpeed(x, y, s) {
    x = Math.round(x); y = Math.round(y);
    if (!inside(x, y)) return;
    const i = (y * S.W + x) * 4 + 1;
    med[i] = Math.min(med[i], Math.round(s * 255));
  }

  function geom() {
    const L = S.portrait ? S.H : S.W;
    const Wd = S.portrait ? S.W : S.H;
    const xy = (a, b) => (S.portrait ? [b, a] : [a, b]);
    return {
      L, Wd, xy,
      plane(a) {
        const [x1, y1] = xy(a, -6), [x2, y2] = xy(a, Wd + 6);
        S.lines.push({ x1, y1, x2, y2 });
        S.planeA = a;
      },
      barrier(a, th, gaps) {
        const a0 = Math.round(a - th / 2);
        for (let b = 0; b < Wd; b++) {
          const bc = b + 0.5;
          if (gaps.some(([c, w]) => Math.abs(bc - c) < w / 2)) continue;
          for (let t = 0; t < th; t++) { const [x, y] = xy(a0 + t, b); setWall(x, y, true); }
        }
      },
      point(a, b, phase = 0, amp = 1) {
        const [x, y] = xy(a, b);
        const p = { x, y, phase, amp };
        S.pts.push(p); return p;
      },
      ellipse(ca, cb, ra, rb, th) {
        const n = Math.ceil(2 * Math.PI * Math.max(ra, rb) * 3);
        for (let i = 0; i < n; i++) {
          const t = (i / n) * 2 * Math.PI;
          const [x, y] = xy(ca + ra * Math.cos(t), cb + rb * Math.sin(t));
          stampWall(x, y, th / 2);
        }
      },
      lens(ca, halfH, T0, speed) {
        const b0 = Math.floor(Wd / 2 - halfH), b1 = Math.ceil(Wd / 2 + halfH);
        for (let b = b0; b <= b1; b++) {
          const yy = (b + 0.5 - Wd / 2) / halfH;
          if (Math.abs(yy) >= 1) continue;
          const t = T0 * (1 - yy * yy);
          for (let a = Math.floor(ca - t / 2 - 2); a <= Math.ceil(ca + t / 2 + 2); a++) {
            const e = Math.min(a + 0.5 - (ca - t / 2), (ca + t / 2) - (a + 0.5));
            const f = Math.max(0, Math.min(1, e / 1.6 + 0.5));
            if (f <= 0) continue;
            const s = 1 - (1 - speed) * f * f * (3 - 2 * f);
            const [x, y] = xy(a, b); setSpeed(x, y, s);
          }
        }
      },
    };
  }

  const mm = (v) => num(v * CELL_MM, 0) + ' мм';
  const PRESETS = [
    {
      chip: 'Две щели', title: 'Две щели',
      text: 'Плоская волна упирается в преграду с двумя щелями. Каждая щель становится новым источником — это принцип Гюйгенса. За преградой волны складываются: гребень с гребнем дают яркие лучи, гребень со впадиной гасят друг друга. Яркие направления подчиняются простому условию.',
      formula: 'd · sin θ = m · λ', detector: true,
      param: { label: 'Расстояние между щелями, d', min: 24, max: 150, step: 2, value: 66, fmt: mm },
      build(g, v) {
        const bar = Math.round(0.3 * g.L);
        g.plane(Math.round(0.05 * g.L));
        g.barrier(bar, 4, [[g.Wd / 2 - v / 2, 12], [g.Wd / 2 + v / 2, 12]]);
        S.detA = Math.round((S.portrait ? 0.87 : 0.93) * g.L); S.prefillTo = bar - 3;
      },
    },
    {
      chip: 'Одна щель', title: 'Одна щель',
      text: 'Щель намного шире волны пропускает почти прямой пучок. Щель уже волны превращается в точечный источник, и волна расходится полукругом. Сужайте щель ползунком и смотрите, как пучок раскрывается веером; первые тёмные направления лежат там, где выполняется условие.',
      formula: 'a · sin θ = ±λ', detector: true,
      param: { label: 'Ширина щели, a', min: 8, max: 120, step: 2, value: 34, fmt: mm },
      build(g, v) {
        const bar = Math.round(0.3 * g.L);
        g.plane(Math.round(0.05 * g.L));
        g.barrier(bar, 4, [[g.Wd / 2, v]]);
        S.detA = Math.round((S.portrait ? 0.87 : 0.93) * g.L); S.prefillTo = bar - 3;
      },
    },
    {
      chip: 'Решётка', title: 'Дифракционная решётка',
      text: 'Много щелей на равном расстоянии. Условие ярких направлений то же, что у двух щелей, но лучи становятся узкими и резкими, а между ними почти темно. Чем больше щелей, тем тоньше лучи — так спектрометр раскладывает свет по длинам волн.',
      formula: 'd · sin θ = m · λ', detector: true,
      param: { label: 'Число щелей, N', min: 2, max: 9, step: 1, value: 6, fmt: (v) => v + ' ' + plural(v, 'щель', 'щели', 'щелей') },
      build(g, v) {
        const bar = Math.round(0.3 * g.L);
        const d = Math.min(34, (g.Wd - 2 * SPONGE - 20) / v);
        g.plane(Math.round(0.05 * g.L));
        const gaps = [];
        for (let i = 0; i < v; i++) gaps.push([g.Wd / 2 + (i - (v - 1) / 2) * d, 8]);
        g.barrier(bar, 4, gaps);
        S.detA = Math.round((S.portrait ? 0.87 : 0.93) * g.L); S.prefillTo = bar - 3;
      },
    },
    {
      chip: 'Две точки', title: 'Два источника',
      text: 'Два вибратора колеблются в такт. Линии тишины, где волны всегда гасят друг друга, — гиперболы: на каждой разность расстояний до источников постоянна и равна полуцелому числу длин волн. Раздвиньте источники — линий станет больше.',
      formula: '|r₁ − r₂| = (m + ½) · λ', detector: true,
      param: { label: 'Расстояние между источниками', min: 12, max: 170, step: 2, value: 80, fmt: mm },
      build(g, v) {
        const a = Math.round(0.3 * g.L);
        g.point(a, g.Wd / 2 - v / 2); g.point(a, g.Wd / 2 + v / 2);
        S.detA = Math.round((S.portrait ? 0.87 : 0.93) * g.L);
      },
    },
    {
      chip: 'Линза', title: 'Линза из мелководья',
      text: 'Над мелководьем волны идут медленнее — так же, как свет в стекле. Выпуклая отмель задерживает середину фронта сильнее краёв, фронт прогибается и сходится в фокус. Сделайте отмель мельче — волна там замедлится сильнее, и фокус придвинется.',
      formula: 'n = v₁ / v₂', detector: false,
      param: { label: 'Скорость над отмелью', min: 40, max: 85, step: 1, value: 56, fmt: (v) => v + ' %' },
      build(g, v) {
        const ca = Math.round(0.33 * g.L);
        const halfH = Math.min(0.34 * g.Wd, 0.36 * g.L);
        const T0 = Math.min(0.13 * g.L, halfH * 0.52);
        g.plane(Math.round(0.05 * g.L));
        g.lens(ca, halfH, T0, v / 100);
        S.lens = { ca, halfH, T0 };
        S.prefillTo = Math.round(ca - T0 / 2 - 4);
      },
    },
    {
      chip: 'Эллипс', title: 'Эллиптическое зеркало',
      text: 'Всплеск в одном фокусе эллипса после отражения собирается во втором: сумма расстояний до фокусов одинакова для любой точки стенки, значит, все пути равны и приходят одновременно. На этом держатся «шепчущие галереи».',
      formula: 'r₁ + r₂ = 2a', detector: false,
      param: { label: 'Эксцентриситет, e', min: 0.3, max: 0.85, step: 0.01, value: 0.68, fmt: (v) => num(v, 2) },
      build(g, v) {
        let ra = 0.44 * g.L, rb = ra * Math.sqrt(1 - v * v);
        const maxB = 0.42 * g.Wd;
        if (rb > maxB) { const s = maxB / rb; ra *= s; rb *= s; }
        const ca = g.L / 2, cb = g.Wd / 2, fc = ra * v;
        g.ellipse(ca, cb, ra, rb, 3.2);
        const p = g.point(ca - fc, cb, 0, 0);
        S.burst = { p, period: 0 };
        const [f1x, f1y] = g.xy(ca - fc, cb), [f2x, f2y] = g.xy(ca + fc, cb);
        S.foci = [[f1x, f1y], [f2x, f2y]];
        S.extraDamp = 0.0011;
        S.burst.period = Math.round((2 * ra) / C * 1.45);
      },
    },
    {
      chip: 'Антенна', title: 'Фазированная антенная решётка',
      text: 'Восемь излучателей стоят в ряд через половину длины волны. Когда каждый следующий чуть запаздывает по фазе, общий фронт наклоняется, и луч поворачивается — без единой движущейся детали. Так управляют лучом радары и антенны сотовых станций.',
      formula: 'Δφ = k · s · sin θ', detector: false,
      param: { label: 'Угол луча, θ', min: -60, max: 60, step: 1, value: 0, fmt: (v) => num(v, 0) + '°', auto: true },
      build(g) {
        const n = 8, s = S.lambda / 2, a = Math.round(0.16 * g.L);
        const list = [];
        for (let i = 0; i < n; i++) list.push(g.point(a, g.Wd / 2 + (i - (n - 1) / 2) * s));
        S.array = { list, s, a, auto: S.array ? S.array.auto : true, theta: 0 };
      },
    },
    {
      chip: 'Доплер', title: 'Эффект Доплера',
      text: 'Источник плывёт вправо: впереди гребни теснятся, и частота там выше, позади растягиваются. Разгоните его быстрее собственных волн — фронты сложатся в конус Маха, как ударная волна у сверхзвукового самолёта. Угол конуса: sin α = 1 / M.',
      formula: 'f′ = f / (1 − v/c)', detector: false,
      param: { label: 'Скорость источника, v/c', min: 0.2, max: 1.6, step: 0.02, value: 0.62, fmt: (v) => num(v, 2) + ' c' },
      build(g, v) {
        const p = g.point(0.08 * g.L, g.Wd / 2);
        S.mover = { p, a0: 0.08 * g.L, a1: 0.9 * g.L, b: g.Wd / 2, beta: v, t0: S.t, g };
      },
    },
    {
      chip: 'Свободно', title: 'Свободная ванна',
      text: 'Пустая ванна для своих опытов. Рисуйте стены и отмели, ставьте вибраторы, роняйте капли. Попробуйте собрать волновод, уголковый отражатель или резонатор с узким горлом.',
      formula: '', detector: false, param: null,
      build(g) {
        const [x, y] = g.xy(g.L * 0.5, g.Wd * 0.5);
        S.imp = { x, y, amp: 3.2, r: 3.2 };
      },
    },
  ];
  PRESETS.forEach((p, i) => { S.params[i] = p.param ? p.param.value : 0; });

  function plural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  function buildPreset(i) {
    const P = PRESETS[i];
    S.preset = i;
    S.pts = []; S.lines = []; S.user = [];
    S.detA = null; S.extraDamp = 0; S.planeA = null; S.prefillTo = null;
    S.mover = null; S.burst = null; S.foci = null; S.lens = null; S.imp = null;
    if (i !== 6) S.array = null;
    clearMedium();
    P.build(geom(), S.params[i]);
    uploadMedium();
    resetWaves(true);
    const L = S.portrait ? S.H : S.W;
    S.warm = true;
    S.warmTarget = Math.round((S.prefillTo ? (L - S.prefillTo) : L * 0.85) / C);
    const len = S.detA != null ? (S.portrait ? S.W : S.H) : 0;
    detData = len ? new Float32Array(len * 4) : null;
    detShow = len ? new Float32Array(len) : null;
  }

  function uploadMedium() {
    gl.bindTexture(gl.TEXTURE_2D, medTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, S.W, S.H, gl.RGBA, gl.UNSIGNED_BYTE, med);
    medDirty = false;
  }

  // Сброс воды. Для плоской волны заранее «наливаем» уже пришедший фронт, чтобы опыт был виден сразу.
  function resetWaves(prefill) {
    const { W, H } = S;
    const data = new Float32Array(W * H * 4);
    S.t = 0; S.steps = 0;
    if (prefill && S.planeA != null && S.prefillTo != null) {
      const A = S.amp, k = S.k, w = S.omega;
      const a0 = S.planeA + 1, a1 = S.prefillTo;
      const taper = S.lambda * 1.2;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const a = S.portrait ? y : x;
        if (a < a0 || a > a1) continue;
        const i = (y * W + x) * 4;
        if (med[i] > 127) continue;
        const r = a - S.planeA;
        let env = Math.min(1, (a1 - a) / taper);
        env = env * env * (3 - 2 * env);
        env *= Math.min(1, Math.max(0, 1 - med[i + 2] / 255 * 1.5));
        data[i] = A * env * Math.sin(-k * r - Math.PI / 2);
        data[i + 1] = A * env * Math.sin(-w - k * r - Math.PI / 2);
        data[i + 2] = 0.5 * A * A * env * env;
      }
    }
    for (const t of stTex) {
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, H, gl.RGBA, gl.FLOAT, data);
    }
    if (detShow) detShow.fill(0);
  }

  /* ---------- Движущиеся и мигающие источники ---------- */
  function updateDynamics() {
    const m = S.mover;
    if (m) {
      let a = m.a0 + m.beta * C * (S.t - m.t0);
      if (a > m.a1) { m.t0 = S.t; a = m.a0; }
      const [x, y] = m.g.xy(a, m.b);
      m.p.x = x; m.p.y = y;
      const fade = Math.min(1, (a - m.a0) / 18, (m.a1 - a) / 18);
      m.p.amp = Math.max(0, fade);
    }
    const arr = S.array;
    if (arr) {
      if (arr.auto) arr.theta = 52 * Math.sin(S.t * 0.0013) * Math.PI / 180;
      const dphi = S.k * arr.s * Math.sin(arr.theta);
      arr.list.forEach((p, i) => { p.phase = -i * dphi; });
    }
    const b = S.burst;
    if (b) {
      const T = 2 * Math.PI / S.omega;
      const local = S.t % b.period;
      const z = (local - 2.2 * T) / (0.75 * T);
      b.p.amp = Math.exp(-z * z) * 3.2;
    }
  }

  function packSources() {
    const all = S.pts.concat(S.user).slice(0, MAX_SRC);
    srcBuf.fill(0);
    all.forEach((p, i) => { srcBuf.set([p.x + 0.5, p.y + 0.5, p.phase || 0, p.amp == null ? 1 : p.amp], i * 4); });
    lineBuf.fill(0);
    S.lines.slice(0, 2).forEach((l, i) => lineBuf.set([l.x1, l.y1, l.x2, l.y2], i * 4));
    return all.length;
  }

  /* ---------- Шаг симуляции и отрисовка ---------- */
  function step() {
    S.t += 1; S.steps += 1;
    updateDynamics();
    const n = packSources();
    const src = cur, dst = 1 - cur;
    gl.bindFramebuffer(gl.FRAMEBUFFER, stFB[dst]);
    gl.viewport(0, 0, S.W, S.H);
    gl.useProgram(pSim.p);
    const u = pSim.u;
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, stTex[src]); gl.uniform1i(u.uState, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, medTex); gl.uniform1i(u.uMedium, 1);
    gl.uniform2i(u.uSize, S.W, S.H);
    gl.uniform1f(u.uC2, C * C);
    gl.uniform1f(u.uPhase, S.omega * S.t);
    gl.uniform1f(u.uDrivePt, drivePoint());
    gl.uniform1f(u.uDriveLn, driveLine());
    gl.uniform1f(u.uDamp, 0.00025 + S.extraDamp);
    gl.uniform1i(u.uNumSrc, n);
    gl.uniform4fv(u.uSrc, srcBuf);
    gl.uniform1i(u.uNumLine, Math.min(2, S.lines.length));
    gl.uniform4fv(u.uLine, lineBuf);
    if (S.imp) { gl.uniform4f(u.uImp, S.imp.x + 0.5, S.imp.y + 0.5, S.imp.amp, S.imp.r); S.imp = null; }
    else gl.uniform4f(u.uImp, 0, 0, 0, 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    cur = dst;
  }

  function render(now) {
    // Проход «каустик»: освещённость дна по кривизне поверхности
    gl.bindFramebuffer(gl.FRAMEBUFFER, shadeFB);
    gl.viewport(0, 0, S.W, S.H);
    gl.useProgram(pShade.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, stTex[cur]);
    gl.uniform1i(pShade.u.uState, 0);
    gl.uniform2i(pShade.u.uSize, S.W, S.H);
    gl.uniform1f(pShade.u.uFocus, 1.05 / (S.amp * S.k * S.k));
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, glCanvas.width, glCanvas.height);
    gl.useProgram(pDisp.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, shadeTex); gl.uniform1i(pDisp.u.uShade, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, medTex); gl.uniform1i(pDisp.u.uMedium, 1);
    gl.uniform2f(pDisp.u.uTexel, 1 / S.W, 1 / S.H);
    gl.uniform1i(pDisp.u.uMode, S.mode);
    gl.uniform1f(pDisp.u.uAmpRef, S.amp);
    gl.uniform1f(pDisp.u.uTime, now * 0.001);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // Экран: читаем среднюю энергию вдоль линии у дальней стенки
  function readDetector() {
    if (S.detA == null || !detData) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, stFB[cur]);
    const len = detShow.length;
    if (S.portrait) gl.readPixels(0, S.detA, len, 1, gl.RGBA, gl.FLOAT, detData);
    else gl.readPixels(S.detA, 0, 1, len, gl.RGBA, gl.FLOAT, detData);
    for (let i = 0; i < len; i++) detShow[i] += (Math.sqrt(Math.max(0, 2 * detData[i * 4 + 2])) - detShow[i]) * 0.35;
  }

  /* ---------- Оверлей: источники, экран, фокусы, курсор ---------- */
  let cssW = 0, cssH = 0;
  const pointer = { x: 0, y: 0, in: false, down: false, last: null };
  const toCss = (x, y) => [(x / S.W) * cssW, (1 - y / S.H) * cssH];

  function drawOverlay() {
    octx.clearRect(0, 0, cssW, cssH);
    const cell = cssW / S.W;
    const ph = S.omega * S.t;
    // Линейный вибратор
    for (const l of S.lines) {
      let [x1, y1] = toCss(l.x1, l.y1), [x2, y2] = toCss(l.x2, l.y2);
      const osc = Math.sin(ph) * 1.4;
      octx.save();
      octx.strokeStyle = 'rgba(240,179,94,.9)'; octx.lineWidth = 2;
      const nx = S.portrait ? 0 : 1, ny = S.portrait ? -1 : 0;
      octx.beginPath(); octx.moveTo(x1 + nx * osc, y1 + ny * osc); octx.lineTo(x2 + nx * osc, y2 + ny * osc); octx.stroke();
      octx.strokeStyle = 'rgba(240,179,94,.4)'; octx.lineWidth = 1;
      const len = Math.hypot(x2 - x1, y2 - y1), n = Math.floor(len / 12);
      for (let i = 0; i <= n; i++) {
        const t = i / n, x = x1 + (x2 - x1) * t + nx * osc, y = y1 + (y2 - y1) * t + ny * osc;
        octx.beginPath(); octx.moveTo(x - nx * 5, y - ny * 5); octx.lineTo(x, y); octx.stroke();
      }
      octx.restore();
    }
    // Точечные источники
    const all = S.pts.concat(S.user);
    for (const p of all) {
      const a = p.amp == null ? 1 : Math.min(1, p.amp);
      const [x, y] = toCss(p.x + 0.5, p.y + 0.5);
      const g = octx.createRadialGradient(x, y, 0, x, y, 16);
      g.addColorStop(0, `rgba(240,179,94,${0.45 * a + 0.1})`); g.addColorStop(1, 'rgba(240,179,94,0)');
      octx.fillStyle = g; octx.beginPath(); octx.arc(x, y, 16, 0, Math.PI * 2); octx.fill();
      octx.fillStyle = '#f6c47e'; octx.beginPath(); octx.arc(x, y, 3, 0, Math.PI * 2); octx.fill();
      const rr = 6.5 + 1.6 * Math.sin(ph + (p.phase || 0));
      octx.strokeStyle = `rgba(246,196,126,${0.25 + 0.5 * a})`; octx.lineWidth = 1.2;
      octx.beginPath(); octx.arc(x, y, rr, 0, Math.PI * 2); octx.stroke();
    }
    octx.font = '500 11px "JetBrains Mono", monospace';
    octx.textBaseline = 'middle';
    // Экран
    if (S.detA != null) {
      octx.save();
      octx.setLineDash([3, 5]); octx.strokeStyle = 'rgba(200,225,220,.32)'; octx.lineWidth = 1;
      octx.beginPath();
      if (S.portrait) { const [, y] = toCss(0, S.detA); octx.moveTo(0, y); octx.lineTo(cssW, y); }
      else { const [x] = toCss(S.detA, 0); octx.moveTo(x, 0); octx.lineTo(x, cssH); }
      octx.stroke(); octx.restore();
      octx.fillStyle = 'rgba(200,225,220,.55)';
      if (S.portrait) { const [, y] = toCss(0, S.detA); octx.textAlign = 'right'; octx.fillText('ЭКРАН', cssW - 14, y + 14); }
      else { const [x] = toCss(S.detA, 0); octx.textAlign = 'right'; octx.fillText('ЭКРАН', x - 8, cssH - 60); }
    }
    // Фокусы эллипса
    if (S.foci) {
      S.foci.forEach(([fx, fy], i) => {
        const [x, y] = toCss(fx + 0.5, fy + 0.5);
        octx.strokeStyle = i ? 'rgba(143,220,207,.85)' : 'rgba(240,179,94,.85)'; octx.lineWidth = 1.2;
        octx.beginPath(); octx.moveTo(x - 7, y); octx.lineTo(x + 7, y); octx.moveTo(x, y - 7); octx.lineTo(x, y + 7); octx.stroke();
        octx.fillStyle = octx.strokeStyle; octx.textAlign = 'left';
        octx.fillText(i ? 'F₂' : 'F₁', x + 9, y - 10);
      });
    }
    // Луч фазированной решётки
    if (S.array) {
      const arr = S.array;
      const mid = arr.list[(arr.list.length / 2) | 0];
      const [x0, y0] = toCss(mid.x + 0.5, mid.y + 0.5 - (S.portrait ? 0 : arr.s / 2));
      const th = arr.theta;
      const dirA = Math.cos(th), dirB = Math.sin(th);
      const dx = S.portrait ? dirB : dirA, dy = S.portrait ? -dirA : -dirB;
      const len = Math.min(cssW, cssH) * 0.36;
      octx.save(); octx.setLineDash([2, 6]); octx.strokeStyle = 'rgba(240,179,94,.55)'; octx.lineWidth = 1.2;
      octx.beginPath(); octx.moveTo(x0 + dx * 26, y0 + dy * 26); octx.lineTo(x0 + dx * len, y0 + dy * len); octx.stroke(); octx.restore();
      octx.fillStyle = 'rgba(240,179,94,.9)'; octx.textAlign = 'left';
      octx.fillText('θ = ' + num(th * 180 / Math.PI, 0) + '°', x0 + dx * (len + 10) - 4, y0 + dy * (len + 10));
    }
    // Скорость Доплера
    if (S.mover && S.mover.p.amp > 0.05) {
      const p = S.mover.p; const [x, y] = toCss(p.x + 0.5, p.y + 0.5);
      const dx = S.portrait ? 0 : 1, dy = S.portrait ? -1 : 0;
      octx.strokeStyle = 'rgba(246,196,126,.8)'; octx.lineWidth = 1.4;
      octx.beginPath(); octx.moveTo(x + dx * 20, y + dy * 20); octx.lineTo(x + dx * 44, y + dy * 44);
      octx.lineTo(x + dx * 38 - dy * 4, y + dy * 38 + dx * 4); octx.moveTo(x + dx * 44, y + dy * 44); octx.lineTo(x + dx * 38 + dy * 4, y + dy * 38 - dx * 4); octx.stroke();
      octx.fillStyle = 'rgba(246,196,126,.9)'; octx.textAlign = 'left';
      const M = S.mover.beta;
      octx.fillText(M >= 1 ? 'M = ' + num(M, 2) : 'v = ' + num(M, 2) + ' c', x + dx * 50 + (S.portrait ? 10 : 0), y + dy * 50 - (S.portrait ? 0 : 12));
    }
    // Курсор инструмента
    if (pointer.in && (S.tool === 'wall' || S.tool === 'shallow' || S.tool === 'erase')) {
      const r = (S.tool === 'wall' ? 2.2 : S.tool === 'shallow' ? 11 : 9) * cell;
      octx.strokeStyle = S.tool === 'shallow' ? 'rgba(143,220,207,.9)' : 'rgba(240,179,94,.9)';
      octx.lineWidth = 1.2;
      octx.beginPath(); octx.arc(pointer.x, pointer.y, Math.max(r, 4), 0, Math.PI * 2); octx.stroke();
      if (S.tool === 'erase') {
        octx.beginPath(); octx.moveTo(pointer.x - 4, pointer.y - 4); octx.lineTo(pointer.x + 4, pointer.y + 4);
        octx.moveTo(pointer.x + 4, pointer.y - 4); octx.lineTo(pointer.x - 4, pointer.y + 4); octx.stroke();
      }
    }
  }

  /* ---------- График экрана ---------- */
  let chartW = 0, chartH = 0;
  function drawChart() {
    if (!detShow || $('#screen').hidden) return;
    const w = chartW, h = chartH;
    cctx.clearRect(0, 0, w, h);
    const n = detShow.length;
    let max = 1e-6;
    for (let i = SPONGE; i < n - SPONGE; i++) max = Math.max(max, detShow[i]);
    const x = (i) => ((i - SPONGE) / (n - 2 * SPONGE - 1)) * w;
    const y = (v) => h - 4 - (v / max) * (h - 12);
    // шкала
    cctx.strokeStyle = '#1a2228'; cctx.lineWidth = 1;
    for (let k = 0; k <= 4; k++) { const xx = Math.round((k / 4) * w) + 0.5; cctx.beginPath(); cctx.moveTo(xx, 0); cctx.lineTo(xx, h); cctx.stroke(); }
    cctx.beginPath(); cctx.moveTo(0, h - 3.5); cctx.lineTo(w, h - 3.5); cctx.stroke();
    // площадь
    const grad = cctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(240,179,94,.42)'); grad.addColorStop(1, 'rgba(240,179,94,0)');
    cctx.beginPath(); cctx.moveTo(0, h - 4);
    const idx = (k) => (S.portrait ? k : n - 1 - k); // сверху вниз на экране — слева направо на графике
    for (let i = SPONGE; i < n - SPONGE; i++) cctx.lineTo(x(i), y(detShow[idx(i)]));
    cctx.lineTo(w, h - 4); cctx.closePath(); cctx.fillStyle = grad; cctx.fill();
    cctx.beginPath();
    for (let i = SPONGE; i < n - SPONGE; i++) { const X = x(i), Y = y(detShow[idx(i)]); i === SPONGE ? cctx.moveTo(X, Y) : cctx.lineTo(X, Y); }
    cctx.strokeStyle = '#f6c47e'; cctx.lineWidth = 1.4; cctx.stroke();
    // центр
    cctx.setLineDash([2, 3]); cctx.strokeStyle = 'rgba(200,225,220,.35)';
    cctx.beginPath(); cctx.moveTo(w / 2 + 0.5, 0); cctx.lineTo(w / 2 + 0.5, h); cctx.stroke(); cctx.setLineDash([]);
  }

  /* ---------- Раскладка ---------- */
  function layout() {
    const r = tank.getBoundingClientRect();
    const dpr = SHOT ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    cssW = r.width; cssH = r.height;
    glCanvas.width = Math.round(r.width * dpr); glCanvas.height = Math.round(r.height * dpr);
    ovl.width = Math.round(r.width * dpr); ovl.height = Math.round(r.height * dpr);
    octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cr = chart.getBoundingClientRect();
    chartW = cr.width; chartH = cr.height;
    chart.width = Math.round(cr.width * dpr); chart.height = Math.round(cr.height * dpr);
    cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const target = (r.width < 700 ? 125000 : 255000) * S.quality;
    const cell = Math.sqrt((r.width * r.height) / target);
    const W = Math.max(96, Math.round(r.width / cell));
    const H = Math.max(96, Math.round(r.height / cell));
    if (W !== S.W || H !== S.H) {
      S.W = W; S.H = H; S.portrait = r.height > r.width * 1.05;
      allocSim(W, H);
      buildPreset(S.preset);
    }
  }
  let resizeT = 0;
  window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(layout, 120); });

  /* ---------- Интерфейс ---------- */
  const expsEl = $('#exps');
  PRESETS.forEach((p, i) => {
    const b = document.createElement('button');
    b.className = 'exp'; b.dataset.i = i;
    b.innerHTML = `<span class="n">${String(i + 1).padStart(2, '0')}</span><span class="t">${p.chip}</span>`;
    b.addEventListener('click', () => selectPreset(i));
    expsEl.appendChild(b);
  });
  const paramRange = $('#paramRange'), paramOut = $('#paramOut'), autoBtn = $('#autoBtn');

  function paintRange(el) {
    const p = ((el.value - el.min) / (el.max - el.min)) * 100;
    el.style.setProperty('--p', p + '%');
  }

  function selectPreset(i) {
    const P = PRESETS[i];
    [...expsEl.children].forEach((b, j) => b.classList.toggle('is-on', j === i));
    const chip = expsEl.children[i];
    if (chip && expsEl.scrollWidth > expsEl.clientWidth) expsEl.scrollTo({ left: chip.offsetLeft - 14, behavior: 'smooth' });
    $('#expNum').textContent = `Опыт ${String(i + 1).padStart(2, '0')} из ${String(PRESETS.length).padStart(2, '0')}`;
    $('#expTitle').textContent = P.title;
    $('#hudExp').textContent = P.title;
    $('#expText').textContent = typo(P.text);
    $('#expFormula').textContent = P.formula;
    $('#screen').hidden = !P.detector;
    const pb = $('#param');
    if (P.param) {
      pb.hidden = false;
      $('#paramLabel').textContent = P.param.label;
      Object.assign(paramRange, { min: P.param.min, max: P.param.max, step: P.param.step });
      paramRange.value = S.params[i];
      paintRange(paramRange);
      paramOut.textContent = P.param.fmt(+S.params[i]);
      autoBtn.hidden = !P.param.auto;
    } else pb.hidden = true;
    buildPreset(i);
    if (P.param && P.param.auto) syncAuto();
    requestAnimationFrame(() => { const cr = chart.getBoundingClientRect(); if (cr.width && cr.width !== chartW) layout(); });
  }

  function syncAuto() {
    const on = !!(S.array && S.array.auto);
    autoBtn.classList.toggle('is-on', on);
  }
  autoBtn.addEventListener('click', () => {
    if (!S.array) return;
    S.array.auto = !S.array.auto;
    syncAuto();
  });

  // Неразрывные пробелы после коротких слов
  function typo(s) {
    return s.replace(/(^|[\s(«])([вкснуоаиВКСНУОАИ]|за|на|по|от|до|из|не|но|же|ли|со|во|то|её|их|он|ко|об|при|без|для|под|над|как|так|там|где|чем|это)\s/g, '$1$2 ')
      .replace(/(\d)\s(мм|см|Гц|%)/g, '$1 $2')
      .replace(/\s—/g, ' —');
  }

  let rebuildQueued = false;
  paramRange.addEventListener('input', () => {
    const i = S.preset, P = PRESETS[i];
    const v = +paramRange.value;
    S.params[i] = v;
    paramOut.textContent = P.param.fmt(v);
    paintRange(paramRange);
    if (i === 6 && S.array) { S.array.auto = false; S.array.theta = v * Math.PI / 180; syncAuto(); return; }
    if (i === 7 && S.mover) { S.mover.beta = v; return; }
    if (!rebuildQueued) { rebuildQueued = true; requestAnimationFrame(() => { rebuildQueued = false; buildPreset(S.preset); }); }
  });

  const freqEl = $('#freq'), ampEl = $('#amp');
  freqEl.addEventListener('input', () => { setFreq(+freqEl.value); paintRange(freqEl); });
  ampEl.addEventListener('input', () => { S.amp = +ampEl.value; $('#ampOut').textContent = num(S.amp); paintRange(ampEl); });

  document.querySelectorAll('.mode').forEach((b) => b.addEventListener('click', () => setMode(+b.dataset.mode)));
  function setMode(m) {
    S.mode = m;
    document.querySelectorAll('.mode').forEach((b) => {
      const on = +b.dataset.mode === m;
      b.classList.toggle('is-on', on); b.setAttribute('aria-checked', on);
    });
  }
  document.querySelectorAll('[data-tool]').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));
  function setTool(t) {
    S.tool = t;
    document.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('is-on', b.dataset.tool === t));
    ovl.className = 't-' + t;
  }
  const pauseBtn = $('#pauseBtn');
  function togglePause() {
    S.paused = !S.paused;
    pauseBtn.classList.toggle('is-paused', S.paused);
    pauseBtn.setAttribute('aria-label', S.paused ? 'Продолжить' : 'Пауза');
  }
  pauseBtn.addEventListener('click', togglePause);
  $('#resetBtn').addEventListener('click', () => resetWaves(false));

  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
    if (e.key >= '1' && e.key <= '9') { selectPreset(+e.key - 1); e.preventDefault(); }
    else if (e.code === 'Space') { togglePause(); e.preventDefault(); }
    else if (e.key === 'r' || e.key === 'R' || e.key === 'к' || e.key === 'К') resetWaves(false);
    else if (e.key === 'm' || e.key === 'M' || e.key === 'ь' || e.key === 'Ь') setMode((S.mode + 1) % 3);
  });

  /* ---------- Указатель: капли, источники, стены, отмели ---------- */
  const hint = $('#hint');
  function toSim(ev) {
    const r = ovl.getBoundingClientRect();
    const px = ev.clientX - r.left, py = ev.clientY - r.top;
    pointer.x = px; pointer.y = py;
    return [(px / r.width) * S.W, (1 - py / r.height) * S.H];
  }
  function paintAt(x, y) {
    if (S.tool === 'wall') stampWall(x, y, 2.2, true);
    else if (S.tool === 'shallow') {
      const R = 11;
      for (let j = Math.floor(y - R); j <= Math.ceil(y + R); j++)
        for (let i = Math.floor(x - R); i <= Math.ceil(x + R); i++) {
          const d = Math.hypot(i - x, j - y);
          if (d > R) continue;
          const f = Math.min(1, (R - d) / 3);
          setSpeed(i, j, 1 - 0.45 * f);
        }
    } else if (S.tool === 'erase') {
      const R = 9;
      for (let j = Math.floor(y - R); j <= Math.ceil(y + R); j++)
        for (let i = Math.floor(x - R); i <= Math.ceil(x + R); i++) {
          if (Math.hypot(i - x, j - y) > R || !inside(i, j)) continue;
          const k = (j * S.W + i) * 4;
          med[k] = 0; med[k + 1] = 255;
        }
      S.user = S.user.filter((p) => Math.hypot(p.x - x, p.y - y) > R);
      S.pts = S.pts.filter((p) => S.mover && p === S.mover.p || S.burst && p === S.burst.p || S.array ? true : Math.hypot(p.x - x, p.y - y) > R);
    }
    medDirty = true;
  }
  function stroke(x0, y0, x1, y1) {
    const d = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(d / 1.2));
    for (let i = 1; i <= n; i++) paintAt(x0 + (x1 - x0) * (i / n), y0 + (y1 - y0) * (i / n));
  }
  ovl.addEventListener('pointerdown', (ev) => {
    ovl.setPointerCapture(ev.pointerId);
    hint.classList.add('is-gone');
    const [x, y] = toSim(ev);
    pointer.down = true; pointer.last = [x, y];
    if (S.tool === 'drop') S.imp = { x, y, amp: 3.4, r: 3.2 };
    else if (S.tool === 'source') {
      const hit = S.user.findIndex((p) => Math.hypot(p.x - x, p.y - y) < 6);
      if (hit >= 0) S.user.splice(hit, 1);
      else if (S.pts.length + S.user.length < MAX_SRC) S.user.push({ x: Math.round(x), y: Math.round(y), phase: 0, amp: 1 });
    } else paintAt(x, y);
  });
  ovl.addEventListener('pointermove', (ev) => {
    const [x, y] = toSim(ev);
    pointer.in = true;
    if (!pointer.down) return;
    if (S.tool === 'wall' || S.tool === 'shallow' || S.tool === 'erase') { stroke(pointer.last[0], pointer.last[1], x, y); }
    else if (S.tool === 'drop' && Math.hypot(x - pointer.last[0], y - pointer.last[1]) > 7) S.imp = { x, y, amp: 1.6, r: 2.6 };
    else return;
    pointer.last = [x, y];
  });
  const up = () => { pointer.down = false; pointer.last = null; };
  ovl.addEventListener('pointerup', up);
  ovl.addEventListener('pointercancel', up);
  ovl.addEventListener('pointerleave', () => { pointer.in = false; });

  glCanvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); fail('context lost'); });

  /* ---------- Цикл ---------- */
  let last = performance.now(), ema = 16.7, cap = 10, acc = 0, frameN = 0, slow = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const rawDt = now - last;
    const dt = Math.min(250, rawDt); last = now;
    // Слабая видеокарта: если первые кадры идут дольше 180 мс, уменьшаем сетку вчетверо
    if (!SHOT && frameN > 3 && frameN < 90 && S.quality > 0.25 && !document.hidden) {
      slow = rawDt > 180 ? slow + 1 : Math.max(0, slow - 1);
      if (slow >= 3) { slow = 0; S.quality *= 0.5; S.W = 0; layout(); ema = 16.7; }
    }
    ema += (dt - ema) * 0.1;
    if (medDirty) uploadMedium();
    if (!S.paused) {
      let n;
      if (S.warm) {
        n = S.warmCap;
        if (S.steps + n >= S.warmTarget) S.warm = false;
      } else {
        acc += TARGET_SPS * (dt / 1000) * (reduceMotion ? 0.5 : 1);
        n = Math.floor(acc); acc -= n;
        if (n > cap) { n = cap; acc = 0; }
      }
      for (let i = 0; i < n; i++) step();
    }
    render(now);
    drawOverlay();
    if (++frameN % 5 === 0) { readDetector(); drawChart(); }
    if (frameN % 15 === 0) {
      if (S.warm) { if (ema > 110 && S.warmCap > 6) S.warmCap = Math.max(6, Math.round(S.warmCap * 0.7)); }
      else if (ema > 22 && cap > 2) cap--;
      else if (ema < 18 && cap < 14) cap++;
    }
  }

  setFreq(22); paintRange(freqEl); paintRange(ampEl);
  setTool('drop');
  layout();
  selectPreset(0);
  requestAnimationFrame((t) => { last = t; frame(t); });

  // Для отладки из консоли
  window.__ripple = { S,
    run(n) { for (let i = 0; i < n; i++) step(); return S.steps; },
    col(frac) {
      const a = Math.round(frac * (S.portrait ? S.H : S.W));
      gl.bindFramebuffer(gl.FRAMEBUFFER, stFB[cur]);
      const len = S.portrait ? S.W : S.H, buf = new Float32Array(len * 4);
      if (S.portrait) gl.readPixels(0, a, len, 1, gl.RGBA, gl.FLOAT, buf); else gl.readPixels(a, 0, 1, len, gl.RGBA, gl.FLOAT, buf);
      const v = []; for (let i = SPONGE; i < len - SPONGE; i++) v.push(buf[i * 4]);
      const mean = v.reduce((x, y) => x + y, 0) / v.length;
      const sd = Math.sqrt(v.reduce((x, y) => x + (y - mean) ** 2, 0) / v.length);
      return { a, mean: +mean.toFixed(3), sd: +sd.toFixed(3), sample: v.filter((_, i) => i % 6 === 0).map((x) => +x.toFixed(2)).slice(0, 24) };
    },
    stats() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, stFB[cur]);
    const buf = new Float32Array(S.W * S.H * 4);
    gl.readPixels(0, 0, S.W, S.H, gl.RGBA, gl.FLOAT, buf);
    let mx = 0, sum = 0;
    for (let i = 0; i < buf.length; i += 4) { mx = Math.max(mx, Math.abs(buf[i])); sum += buf[i] * buf[i]; }
    return { W: S.W, H: S.H, steps: S.steps, max: +mx.toFixed(3), rms: +Math.sqrt(sum / (S.W * S.H)).toFixed(3), ema: +ema.toFixed(1), cap, warm: S.warm };
  } };
})();
