/* Тушь в воде.
   Один холст WebGL2 и два движка:
   • «Вода» — сеточная жидкость по Стэму (адвекция, проекция давления, удержание завихрённости);
   • «Мрамор» — точное математическое марморирование: цепочка обратимых преобразований,
     которую каждый пиксель проходит назад до своей капли. */
(() => {
  'use strict';

  // ———————————————————— Утилиты ————————————————————
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  function makeRng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const toLin = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const hexToLin = hex => {
    const n = parseInt(hex.slice(1), 16);
    return [toLin(((n >> 16) & 255) / 255), toLin(((n >> 8) & 255) / 255), toLin((n & 255) / 255)];
  };

  // ———————————————————— Краски ————————————————————
  const PAPER_HEX = '#EEE5D3';
  const PAPER = hexToLin(PAPER_HEX);
  const WATER_INKS = [
    { name: 'Тушь', hex: '#1C1A19' },
    { name: 'Индиго', hex: '#233D72' },
    { name: 'Киноварь', hex: '#B5402B' },
    { name: 'Охра', hex: '#C4953B' },
    { name: 'Малахит', hex: '#2C7666' },
  ];
  // Тушь хранится как оптическая плотность: цвет на бумаге = бумага · e^(−плотность)
  WATER_INKS.forEach(ink => {
    const c = hexToLin(ink.hex);
    ink.abs = c.map((v, i) => Math.max(0, -Math.log(Math.max(v, 1e-4) / PAPER[i])));
  });

  const PALETTES = [
    { name: 'Османская', bath: '#E7DCC5', inks: ['#C9973E', '#2E4A7D', '#A8322D', '#231F1C', '#F1E8D4'] },
    { name: 'Суминагаси', bath: '#ECE4D3', inks: ['#1E1C1B', '#34507A', '#8C8781', '#B5402B', '#E6DDCC'] },
    { name: 'Флорентийская', bath: '#EFE4D0', inks: ['#C57B78', '#77773F', '#CFA24A', '#4A5566', '#F3EADB'] },
    { name: 'Кобальт', bath: '#E8E3D9', inks: ['#1F4FA3', '#162A45', '#F4F1EA', '#86A9D6', '#C9A24C'] },
  ];
  PALETTES.forEach(p => { p.bathLin = hexToLin(p.bath); p.lin = p.inks.map(hexToLin); });

  const S = {
    mode: 'water',
    tool: { water: 'drop', marble: 'drop' },
    ink: 1, inkM: 0, palette: 0,
    current: 1, vort: 24, drop: 0.05, comb: 0.07,
    sound: true, paused: false,
  };

  // ———————————————————— WebGL ————————————————————
  const canvas = $('#gl');
  const fallback = msg => { $('#fallback').hidden = false; $('#fallback-msg').textContent = msg; };
  const gl = canvas.getContext('webgl2', {
    alpha: false, antialias: false, depth: false, stencil: false,
    premultipliedAlpha: false, powerPreference: 'high-performance',
  });
  if (!gl) { fallback('Этому браузеру не хватает WebGL2. Откройте страницу в свежем Chrome, Safari или Firefox.'); return; }
  if (!gl.getExtension('EXT_color_buffer_float')) {
    fallback('Видеокарта не умеет рисовать в текстуры с плавающей точкой, а без них жидкость не посчитать.');
    return;
  }
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const RENDERER = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
  const SOFT = /swiftshader|llvmpipe|software|basic render/i.test(RENDERER); // программный рендер
  const SHOT = !!window.__SHOT__;          // съёмка обложки: качество не снижаем, скорость неважна
  const LOWQ = SOFT && !SHOT;              // снижать качество только для живого программного рендера
  const MAX_TEX = gl.getParameter(gl.MAX_TEXTURE_SIZE);

  const VS = `#version 300 es
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('Шейдер: ' + gl.getShaderInfoLog(s));
    return s;
  }
  function program(fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Программа: ' + gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name);
    }
    return { p, u };
  }
  const I = v => ({ i: v });
  function use(prog, uni) {
    gl.useProgram(prog.p);
    let unit = 0;
    for (const k in uni) {
      const loc = prog.u[k];
      if (loc === undefined || loc === null) continue;
      const v = uni[k];
      if (v && v.tex) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, v.tex);
        gl.uniform1i(loc, unit++);
      } else if (v && v.i !== undefined) gl.uniform1i(loc, v.i);
      else if (typeof v === 'number') gl.uniform1f(loc, v);
      else if (v.length === 2) gl.uniform2f(loc, v[0], v[1]);
      else if (v.length === 3) gl.uniform3f(loc, v[0], v[1], v[2]);
      else if (v.length === 4) gl.uniform4f(loc, v[0], v[1], v[2], v[3]);
    }
  }
  function target(w, h, o = {}) {
    const internal = o.internal || gl.RGBA16F, type = o.type || gl.HALF_FLOAT, filter = o.filter || gl.LINEAR;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, gl.RGBA, type, null);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return { tex, fb, w, h, dispose() { gl.deleteTexture(tex); gl.deleteFramebuffer(fb); } };
  }
  function pingpong(w, h, o) {
    return {
      w, h, read: target(w, h, o), write: target(w, h, o),
      swap() { const t = this.read; this.read = this.write; this.write = t; },
      dispose() { this.read.dispose(); this.write.dispose(); },
    };
  }
  function draw(t) {
    if (t) { gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb); gl.viewport(0, 0, t.w, t.h); }
    else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height); }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function clearTarget(t) { gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb); gl.viewport(0, 0, t.w, t.h); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); }

  // полноэкранный треугольник
  gl.bindVertexArray(gl.createVertexArray());
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const dummy = target(1, 1);

  // ———————————————————— Шейдеры ————————————————————
  const HEAD = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 o;
`;
  const NOISE = `
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
vec3 toSRGB(vec3 c) { c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
`;

  const FS = {
    copy: HEAD + `uniform sampler2D uSrc; uniform float uK;
void main() { o = texture(uSrc, vUv) * uK; }`,

    advect: HEAD + `uniform sampler2D uVel, uSrc; uniform vec2 uVelTexel; uniform float uDt, uDiss;
void main() { vec2 v = texture(uVel, vUv).xy; o = uDiss * texture(uSrc, vUv - uDt * v * uVelTexel); }`,

    // поправка МакКормака с ограничителем: кромки туши остаются чёткими
    macc: HEAD + `uniform sampler2D uVel, uSrc, uHat; uniform vec2 uVelTexel, uSrcTexel; uniform float uDt, uDiss;
void main() {
  vec2 v = texture(uVel, vUv).xy * uDt * uVelTexel;
  vec4 hat = texture(uHat, vUv);
  vec4 bar = texture(uHat, vUv + v);
  vec4 phi = texture(uSrc, vUv);
  vec4 r = hat + 0.5 * (phi - bar);
  vec2 st = (vUv - v) / uSrcTexel - 0.5;
  vec2 i = floor(st) + 0.5;
  vec4 a = texture(uSrc, i * uSrcTexel), b = texture(uSrc, (i + vec2(1.0, 0.0)) * uSrcTexel);
  vec4 c = texture(uSrc, (i + vec2(0.0, 1.0)) * uSrcTexel), d = texture(uSrc, (i + vec2(1.0, 1.0)) * uSrcTexel);
  o = uDiss * clamp(r, min(min(a, b), min(c, d)), max(max(a, b), max(c, d)));
}`,

    div: HEAD + `uniform sampler2D uVel; uniform vec2 uTexel;
void main() {
  vec2 C = texture(uVel, vUv).xy;
  float L = texture(uVel, vUv - vec2(uTexel.x, 0.0)).x, R = texture(uVel, vUv + vec2(uTexel.x, 0.0)).x;
  float B = texture(uVel, vUv - vec2(0.0, uTexel.y)).y, T = texture(uVel, vUv + vec2(0.0, uTexel.y)).y;
  if (vUv.x - uTexel.x < 0.0) L = -C.x;
  if (vUv.x + uTexel.x > 1.0) R = -C.x;
  if (vUv.y - uTexel.y < 0.0) B = -C.y;
  if (vUv.y + uTexel.y > 1.0) T = -C.y;
  o = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
}`,

    pressure: HEAD + `uniform sampler2D uP, uDiv; uniform vec2 uTexel;
void main() {
  float L = texture(uP, vUv - vec2(uTexel.x, 0.0)).x, R = texture(uP, vUv + vec2(uTexel.x, 0.0)).x;
  float B = texture(uP, vUv - vec2(0.0, uTexel.y)).x, T = texture(uP, vUv + vec2(0.0, uTexel.y)).x;
  o = vec4((L + R + B + T - texture(uDiv, vUv).x) * 0.25, 0.0, 0.0, 1.0);
}`,

    grad: HEAD + `uniform sampler2D uP, uVel; uniform vec2 uTexel;
void main() {
  float L = texture(uP, vUv - vec2(uTexel.x, 0.0)).x, R = texture(uP, vUv + vec2(uTexel.x, 0.0)).x;
  float B = texture(uP, vUv - vec2(0.0, uTexel.y)).x, T = texture(uP, vUv + vec2(0.0, uTexel.y)).x;
  o = vec4(texture(uVel, vUv).xy - 0.5 * vec2(R - L, T - B), 0.0, 1.0);
}`,

    curl: HEAD + `uniform sampler2D uVel; uniform vec2 uTexel;
void main() {
  float L = texture(uVel, vUv - vec2(uTexel.x, 0.0)).y, R = texture(uVel, vUv + vec2(uTexel.x, 0.0)).y;
  float B = texture(uVel, vUv - vec2(0.0, uTexel.y)).x, T = texture(uVel, vUv + vec2(0.0, uTexel.y)).x;
  o = vec4(0.5 * ((R - L) - (T - B)), 0.0, 0.0, 1.0);
}`,

    // удержание завихрённости + медленное «течение» из curl-шума + вязкое затухание
    forces: HEAD + NOISE + `uniform sampler2D uVel, uCurl; uniform vec2 uTexel;
uniform float uDt, uVort, uCurrent, uTime, uAspect, uDamp;
void main() {
  float L = texture(uCurl, vUv - vec2(uTexel.x, 0.0)).x, R = texture(uCurl, vUv + vec2(uTexel.x, 0.0)).x;
  float B = texture(uCurl, vUv - vec2(0.0, uTexel.y)).x, T = texture(uCurl, vUv + vec2(0.0, uTexel.y)).x;
  float C = texture(uCurl, vUv).x;
  vec2 f = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  f /= length(f) + 1e-4;
  f *= uVort * C;
  f.y = -f.y;
  vec2 q = vec2(vUv.x * uAspect, vUv.y) * 1.9 + vec2(uTime * 0.021, -uTime * 0.017);
  float e = 0.02;
  vec2 cn = vec2(fbm(q + vec2(0.0, e)) - fbm(q - vec2(0.0, e)), fbm(q - vec2(e, 0.0)) - fbm(q + vec2(e, 0.0))) / (2.0 * e);
  vec2 v = texture(uVel, vUv).xy;
  v += (f + uCurrent * cn) * uDt;
  o = vec4(v * uDamp, 0.0, 1.0);
}`,

    // 0 — гаусс, 1 — капля с кромкой, 2 — вихрь
    splat: HEAD + `uniform sampler2D uSrc; uniform vec2 uPoint; uniform vec3 uValue; uniform float uRadius, uAspect, uMode;
void main() {
  vec2 d = vUv - uPoint; d.x *= uAspect;
  float r = length(d);
  vec3 add;
  if (uMode < 0.5) add = exp(-r * r / (uRadius * uRadius)) * uValue;
  else if (uMode < 1.5) add = (1.0 - smoothstep(uRadius * 0.62, uRadius, r)) * uValue;
  else add = vec3(-d.y, d.x, 0.0) / uRadius * exp(-r * r / (uRadius * uRadius)) * uValue.x;
  vec4 s = texture(uSrc, vUv);
  o = vec4(s.rgb + add, 1.0);
}`,

    // волокна бумаги и зерно — один раз при изменении размера
    paper: HEAD + NOISE + `uniform float uAspect;
void main() {
  vec2 q = vec2(vUv.x * uAspect, vUv.y);
  float fiber = 0.5 * fbm(q * vec2(8.0, 30.0)) + 0.5 * fbm(q * vec2(36.0, 10.0) + 4.0);
  o = vec4(fiber, hash12(floor(gl_FragCoord.xy)), 0.0, 1.0);
}`,

    water: HEAD + NOISE + `uniform sampler2D uDye, uPaperTex; uniform vec2 uTexel; uniform vec3 uPaper; uniform float uAspect; uniform int uPost;
void main() {
  vec3 a = max(texture(uDye, vUv).rgb, 0.0);
  float l = dot(texture(uDye, vUv - vec2(uTexel.x, 0.0)).rgb, vec3(0.333)), r = dot(texture(uDye, vUv + vec2(uTexel.x, 0.0)).rgb, vec3(0.333));
  float b = dot(texture(uDye, vUv - vec2(0.0, uTexel.y)).rgb, vec3(0.333)), t = dot(texture(uDye, vUv + vec2(0.0, uTexel.y)).rgb, vec3(0.333));
  float g = length(vec2(r - l, t - b));
  a *= 1.0 + clamp(g * 2.2, 0.0, 0.9);                          // кромки разводов чуть плотнее
  vec2 pt = texture(uPaperTex, vUv).rg;
  vec3 paper = uPaper * (0.968 + 0.05 * pt.x);
  vec3 col = paper * exp(-a);
  if (uPost == 1) {
    vec2 v = (vUv - 0.5) * vec2(uAspect * 0.62, 1.0);
    col *= 1.0 - 0.2 * dot(v, v);
  }
  col += (pt.y - 0.5) * 0.012;
  o = vec4(toSRGB(col), 1.0);
}`,
  };

  const MARBLE_COMMON = `
uniform sampler2D uOps;
uniform int uStart, uCount;
uniform sampler2D uBase;
uniform vec4 uBaseRect;
uniform int uHasBase;
uniform vec3 uBath;
${NOISE}
// цвет краски: пигментное зерно берётся в «родных» координатах капли, поэтому гребень вытягивает его в прожилки
vec3 paintColor(vec3 col, vec2 q, float seed, float edge) {
  float n = fbm(q * 42.0 + seed * 13.7);
  float fine = vnoise(q * 170.0 + seed * 5.1);
  col *= 0.925 + 0.13 * n + 0.04 * fine;
  col *= mix(0.8, 1.0, smoothstep(0.0, 0.0035, edge));
  return col;
}
vec3 baseAt(vec2 p) {
  if (uHasBase == 1) {
    vec2 uv = (p - uBaseRect.xy) / uBaseRect.zw;
    if (uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) return texture(uBase, uv).rgb;
  }
  return uBath;
}
// обратное преобразование одной операции; true — пиксель попал в каплю
bool applyOp(int i, inout vec2 p, out vec3 hit) {
  hit = vec3(0.0);
  vec4 A = texelFetch(uOps, ivec2(i * 3, 0), 0);
  vec4 B = texelFetch(uOps, ivec2(i * 3 + 1, 0), 0);
  int t = int(A.x + 0.5);
  if (t == 1) {                                   // капля
    vec2 d = p - A.yz; float dd = dot(d, d); float r2 = A.w * A.w;
    if (dd < r2) {
      vec4 C = texelFetch(uOps, ivec2(i * 3 + 2, 0), 0);
      hit = paintColor(C.rgb, d, C.a, A.w - sqrt(dd));
      return true;
    }
    p = A.yz + d * sqrt(1.0 - r2 / dd);
  } else if (t == 2) {                            // шило или гребень
    vec2 M = vec2(cos(A.w), sin(A.w)), N = vec2(-M.y, M.x);
    float s = dot(p - A.yz, N);
    float d = B.z > 0.0 ? abs(mod(s + 0.5 * B.z, B.z) - 0.5 * B.z) : abs(s);
    p -= B.x * (B.y / (d + B.y)) * M;
  } else if (t == 3) {                            // вихрь
    vec2 d = p - A.yz; float r = length(d);
    float a = -A.w * B.x / (r + B.x);
    float c = cos(a), s = sin(a);
    p = A.yz + vec2(c * d.x - s * d.y, s * d.x + c * d.y);
  } else if (t == 4) {                            // волна
    vec2 M = vec2(cos(A.w), sin(A.w)), N = vec2(-M.y, M.x);
    float u = dot(p - A.yz, M);
    p -= B.x * sin(6.2831853 * u / B.y + B.z) * N;
  }
  return false;
}
vec3 evalChain(vec2 p) {
  vec3 hit;
  for (int i = uStart + uCount - 1; i >= uStart; --i) {
    if (applyOp(i, p, hit)) return hit;
  }
  return baseAt(p);
}
`;

  FS.bake = HEAD + MARBLE_COMMON + `uniform vec4 uView; uniform vec2 uPx; uniform int uSS;
void main() {
  vec2 p = uView.xy + vUv * uView.zw;
  if (uSS == 1) { o = vec4(evalChain(p), 1.0); return; }
  vec3 c = evalChain(p + vec2(0.125, 0.375) * uPx) + evalChain(p + vec2(-0.375, 0.125) * uPx)
         + evalChain(p + vec2(0.375, -0.125) * uPx) + evalChain(p + vec2(-0.125, -0.375) * uPx);
  o = vec4(c * 0.25, 1.0);
}`;

  FS.marble = HEAD + MARBLE_COMMON + `uniform vec4 uView, uCacheRect; uniform vec2 uPx; uniform sampler2D uCache, uPaperTex;
uniform int uLive, uPost; uniform float uWipe, uAspect;
vec3 cacheAt(vec2 p) { return texture(uCache, (p - uCacheRect.xy) / uCacheRect.zw).rgb; }
void main() {
  vec2 p = uView.xy + vUv * uView.zw;
  vec3 col;
  if (uLive >= 0) {
    vec4 A = texelFetch(uOps, ivec2(uLive * 3, 0), 0);
    if (int(A.x + 0.5) == 1) {
      vec2 d = p - A.yz; float dist = length(d); float r = A.w;
      float cov = 1.0 - smoothstep(r - uPx.y, r + uPx.y, dist);
      vec3 inside = vec3(0.0), outside = vec3(0.0);
      if (cov > 0.0) { vec4 C = texelFetch(uOps, ivec2(uLive * 3 + 2, 0), 0); inside = paintColor(C.rgb, d, C.a, r - dist); }
      if (cov < 1.0) { float e = max(dist, r + 1e-5); vec2 dir = d / max(dist, 1e-6); outside = cacheAt(A.yz + dir * sqrt(e * e - r * r)); }
      col = mix(outside, inside, cov);
    } else {
      vec2 q = p; vec3 hit;
      applyOp(uLive, q, hit);
      col = cacheAt(q);
    }
  } else {
    col = cacheAt(p);
  }
  if (uPost == 0) { o = vec4(col, 1.0); return; }
  // снятие плёнки полоской бумаги
  if (uWipe > -1.0) {
    float edge = uWipe * (uAspect + 0.2) - 0.1;
    col = mix(col, uBath, smoothstep(edge + 0.004, edge - 0.004, p.x));
    col *= 1.0 - 0.28 * exp(-pow((p.x - edge - 0.012) * 90.0, 2.0));
  }
  vec2 pt = texture(uPaperTex, vUv).rg;
  col *= (uPost == 2 ? 0.955 : 0.975) + (uPost == 2 ? 0.07 : 0.04) * pt.x;
  if (uPost == 1) {
    vec2 v = (vUv - 0.5) * vec2(uAspect * 0.62, 1.0);
    col *= 1.0 - 0.16 * dot(v, v);
  }
  col += (pt.y - 0.5) * 0.011;
  o = vec4(toSRGB(col), 1.0);
}`;

  let P;
  try {
    P = {};
    for (const k in FS) P[k] = program(FS[k]);
  } catch (err) {
    fallback('Не удалось собрать шейдеры: ' + err.message.slice(0, 180));
    return;
  }

  // ———————————————————— Размеры ————————————————————
  let W = 1, H = 1, DPR = 1, aspect = 1, paperTex = null;

  // ———————————————————— Вода: жидкость Стэма ————————————————————
  const Fluid = {
    vel: null, dye: null, hat: null, p: null, div: null, curl: null,
    fade: 0,
    resize() {
      const simShort = LOWQ ? 104 : 190;
      const dyeShort = LOWQ ? 420 : SOFT ? Math.round(Math.min(W, H) * 0.75) : Math.min(1100, Math.round(Math.min(W, H)));
      const dims = s => (aspect >= 1 ? [Math.round(s * aspect), s] : [s, Math.round(s / aspect)]);
      const [sw, sh] = dims(simShort), [dw, dh] = dims(dyeShort);
      const old = this.vel ? { vel: this.vel, dye: this.dye, sh: this.vel.h } : null;
      const vel = pingpong(sw, sh), dye = pingpong(dw, dh);
      if (old) {
        use(P.copy, { uSrc: old.vel.read, uK: sh / old.sh }); draw(vel.read);
        use(P.copy, { uSrc: old.dye.read, uK: 1 }); draw(dye.read);
        old.vel.dispose(); old.dye.dispose();
        this.hat.dispose(); this.p.dispose(); this.div.dispose(); this.curl.dispose();
      }
      this.vel = vel; this.dye = dye;
      this.hat = target(dw, dh);
      this.p = pingpong(sw, sh);
      this.div = target(sw, sh);
      this.curl = target(sw, sh);
    },
    texel() { return [1 / this.vel.w, 1 / this.vel.h]; },
    step(dt, time) {
      const vt = this.texel();
      use(P.curl, { uVel: this.vel.read, uTexel: vt }); draw(this.curl);
      use(P.forces, {
        uVel: this.vel.read, uCurl: this.curl, uTexel: vt, uDt: dt, uVort: S.vort,
        uCurrent: S.current * 26, uTime: time, uAspect: aspect, uDamp: Math.pow(0.992, dt * 60),
      });
      draw(this.vel.write); this.vel.swap();
      use(P.div, { uVel: this.vel.read, uTexel: vt }); draw(this.div);
      use(P.copy, { uSrc: this.p.read, uK: 0.8 }); draw(this.p.write); this.p.swap();
      const iters = LOWQ ? 12 : 24;
      for (let i = 0; i < iters; i++) {
        use(P.pressure, { uP: this.p.read, uDiv: this.div, uTexel: vt }); draw(this.p.write); this.p.swap();
      }
      use(P.grad, { uP: this.p.read, uVel: this.vel.read, uTexel: vt }); draw(this.vel.write); this.vel.swap();
      use(P.advect, { uVel: this.vel.read, uSrc: this.vel.read, uVelTexel: vt, uDt: dt, uDiss: 1 }); draw(this.vel.write); this.vel.swap();
      const diss = this.fade > 0 ? 0.86 : 1;
      if (this.fade > 0) this.fade--;
      use(P.advect, { uVel: this.vel.read, uSrc: this.dye.read, uVelTexel: vt, uDt: dt, uDiss: 1 }); draw(this.hat);
      use(P.macc, {
        uVel: this.vel.read, uSrc: this.dye.read, uHat: this.hat, uVelTexel: vt,
        uSrcTexel: [1 / this.dye.w, 1 / this.dye.h], uDt: dt, uDiss: diss,
      });
      draw(this.dye.write); this.dye.swap();
    },
    splat(field, x, y, r, value, mode) {
      use(P.splat, { uSrc: field.read, uPoint: [x, y], uValue: value, uRadius: r, uAspect: aspect, uMode: mode });
      draw(field.write); field.swap();
    },
    clear() { this.fade = 26; },
  };

  // капля туши падает в воду: пятно и кольцо вихрей вокруг — «цветок»
  function inkDrop(u, v, r, idx, strength = 1) {
    const ink = WATER_INKS[idx];
    Fluid.splat(Fluid.dye, u, v, r, ink.abs.map(a => a * 1.3 * strength), 1);
    const n = 6 + Math.floor(Math.random() * 3), R = r * 1.05, rot = Math.random() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const t = rot + (i / n) * Math.PI * 2;
      const s = (i % 2 ? 1 : -1) * (150 + Math.random() * 130) * (r / 0.06);
      Fluid.splat(Fluid.vel, u + (Math.cos(t) * R) / aspect, v + Math.sin(t) * R, r * 0.55, [s, 0, 0], 2);
    }
  }
  function stir(u, v, du, dv, r = 0.028) {
    const k = 60 * 0.95;
    Fluid.splat(Fluid.vel, u, v, r, [du * Fluid.vel.w * k, dv * Fluid.vel.h * k, 0], 0);
  }

  // ———————————————————— Мрамор: точная цепочка преобразований ————————————————————
  const MAX_OPS = 300;
  const Marble = {
    ops: [], data: new Float32Array(MAX_OPS * 12), tex: null,
    cache: null, bakeT: null, base: null, baseRect: [0, 0, 1, 1],
    rect: [0, 0, 1, 1], cw: 2, ch: 2,
    committed: 0, exact: true, live: null, queue: [], bake: null,
    wipe: -2, wipeT0: 0, started: false,
    init() {
      this.tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, MAX_OPS * 3, 1, 0, gl.RGBA, gl.FLOAT, this.data);
    },
    resize() {
      const m = 0.12;
      this.rect = [-m, -m, aspect + 2 * m, 1 + 2 * m];
      const ppu = H; // пикселей на единицу ванны (высота экрана = 1)
      let cw = Math.round(this.rect[2] * ppu), ch = Math.round(this.rect[3] * ppu);
      const k = Math.min(1, (MAX_TEX - 2) / Math.max(cw, ch), Math.sqrt((LOWQ ? 1.6e6 : 9e6) / (cw * ch)));
      cw = Math.max(2, Math.floor(cw * k)); ch = Math.max(2, Math.floor(ch * k));
      if (this.cache) { this.cache.dispose(); this.bakeT.dispose(); }
      this.cache = pingpong(cw, ch);
      this.bakeT = target(cw, ch);
      this.cw = cw; this.ch = ch;
      this.bakeNow();
    },
    px() { return [this.rect[2] / this.cw, this.rect[3] / this.ch]; },
    common(extra) {
      return Object.assign({
        uOps: { tex: this.tex }, uStart: I(0), uCount: I(this.committed),
        uBase: this.base || dummy, uBaseRect: this.baseRect, uHasBase: I(this.base ? 1 : 0), uPaperTex: paperTex || dummy,
        uBath: PALETTES[S.palette].bathLin,
      }, extra);
    },
    encode(i, op, k) {
      const d = this.data, o = i * 12;
      d.fill(0, o, o + 12);
      if (op.t === 1) {
        d[o] = 1; d[o + 1] = op.x; d[o + 2] = op.y; d[o + 3] = Math.max(1e-5, op.r * Math.sqrt(easeOut(k)));
        d[o + 8] = op.col[0]; d[o + 9] = op.col[1]; d[o + 10] = op.col[2]; d[o + 11] = op.seed;
      } else if (op.t === 2) {
        const e = easeInOut(k);
        d[o] = 2; d[o + 1] = op.x; d[o + 2] = op.y; d[o + 3] = op.ang; d[o + 4] = op.z * e; d[o + 5] = op.lam; d[o + 6] = op.sp;
      } else if (op.t === 3) {
        d[o] = 3; d[o + 1] = op.x; d[o + 2] = op.y; d[o + 3] = op.ang * easeInOut(k); d[o + 4] = op.lam;
      } else if (op.t === 4) {
        d[o] = 4; d[o + 1] = op.x; d[o + 2] = op.y; d[o + 3] = op.ang; d[o + 4] = op.amp * easeInOut(k); d[o + 5] = op.wl; d[o + 6] = op.ph;
      }
    },
    upload(i) {
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, i * 3, 0, 3, 1, gl.RGBA, gl.FLOAT, this.data, i * 12);
    },
    uploadAll() {
      this.ops.forEach((op, i) => this.encode(i, op, 1));
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, MAX_OPS * 3, 1, gl.RGBA, gl.FLOAT, this.data);
    },
    // точная пересборка всего кэша за один проход
    bakeNow() {
      this.bake = null;
      use(P.bake, this.common({ uView: this.rect, uPx: this.px(), uSS: I(SOFT ? 1 : 4) }));
      draw(this.cache.write); this.cache.swap();
      this.exact = true;
    },
    // та же пересборка, но полосами за несколько кадров — без рывков
    stepBake() {
      const b = this.bake;
      if (!b) return;
      if (b.count !== this.committed) { this.bake = null; return; }
      const ss = SOFT ? 1 : 4;
      const budget = SOFT ? 2.5e7 : 1.5e8;
      const rows = Math.max(24, Math.floor(budget / (this.cw * Math.max(1, b.count) * ss)));
      const y0 = b.row, y1 = Math.min(this.ch, y0 + rows);
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(0, y0, this.cw, y1 - y0);
      use(P.bake, this.common({ uView: this.rect, uPx: this.px(), uSS: I(ss) }));
      draw(this.bakeT);
      gl.disable(gl.SCISSOR_TEST);
      b.row = y1;
      if (y1 >= this.ch) {
        const old = this.cache.read;
        this.cache.read = this.bakeT;
        this.bakeT = old;
        this.exact = true;
        this.bake = null;
      }
    },
    commit() {
      const i = this.ops.length - 1;
      this.encode(i, this.live.op, 1); this.upload(i);
      use(P.marble, this.common({
        uView: this.rect, uCacheRect: this.rect, uPx: this.px(), uCache: this.cache.read,
        uLive: I(i), uPost: I(0), uWipe: -2, uAspect: aspect,
      }));
      draw(this.cache.write); this.cache.swap();
      this.committed = this.ops.length;
      this.exact = false;
      this.live = null;
    },
    flatten() {
      this.bakeNow();
      const nb = target(this.cw, this.ch);
      use(P.copy, { uSrc: this.cache.read, uK: 1 }); draw(nb);
      if (this.base) this.base.dispose();
      this.base = nb; this.baseRect = this.rect.slice();
      this.ops.length = 0; this.committed = 0;
    },
    push(op) { this.queue.push(op); },
    startNext(now) {
      const op = this.queue.shift();
      if (this.ops.length >= MAX_OPS - 1) this.flatten();
      this.ops.push(op);
      this.live = { op, t0: now, dur: op.dur || 0.6, k: 0 };
      this.encode(this.ops.length - 1, op, op.hold ? 1 : 0);
      this.upload(this.ops.length - 1);
      if (op.t === 1 && op.sound !== false) Sound.tap(op.r);
      if ((op.t === 2 || op.t === 3 || op.t === 4) && op.sound !== false) Sound.swoosh(op.dur || 1);
    },
    update(now) {
      if (this.wipe > -1) {
        this.wipe = Math.min(1, (now - this.wipeT0) / 0.85);
        if (this.wipe >= 1) { this.wipe = -2; this.reset(); }
        return;
      }
      if (!this.live && this.queue.length) this.startNext(now);
      const L = this.live;
      if (L) {
        const i = this.ops.length - 1;
        if (L.op.hold) {
          const held = now - L.t0;
          L.op.r = Math.min(L.op.rMax, L.op.r0 * Math.sqrt(easeOut(Math.min(1, held / 0.22)) * (1 + held * 2.4)));
          this.encode(i, L.op, 1); this.upload(i);
        } else {
          L.k = Math.min(1, (now - L.t0) / L.dur);
          this.encode(i, L.op, L.k); this.upload(i);
          if (L.k >= 1) this.commit();
        }
      }
      if (!this.live && !this.queue.length && !this.exact && !this.bake) this.bake = { count: this.committed, row: 0 };
      if (this.bake) this.stepBake();
    },
    release(now) {
      const L = this.live;
      if (L && L.op.hold) { L.op.hold = false; L.t0 = now - L.dur; L.k = 1; }
    },
    reset() {
      this.ops.length = 0; this.queue.length = 0; this.live = null; this.committed = 0;
      if (this.base) { this.base.dispose(); this.base = null; }
      this.bakeNow();
    },
    clear(now) {
      if (this.wipe > -1) return;
      this.queue.length = 0;
      if (this.live) { if (this.live.op.hold) this.live.op.hold = false; this.commit(); }
      this.wipe = 0; this.wipeT0 = now;
      Sound.swoosh(0.9);
    },
    undo() {
      if (this.live || this.queue.length || this.wipe > -1 || !this.ops.length) return false;
      this.ops.pop();
      this.committed = this.ops.length;
      this.uploadAll();
      this.bakeNow();
      return true;
    },
    // мгновенно разложить операции без анимации
    instant(ops) {
      this.reset();
      this.ops = ops.slice(0, MAX_OPS - 2);
      this.committed = this.ops.length;
      this.uploadAll();
      this.bakeNow();
    },
    render(post, targetFb, view) {
      use(P.marble, this.common({
        uView: view || [0, 0, aspect, 1], uCacheRect: this.rect, uPx: this.px(), uCache: this.cache.read,
        uLive: I(this.live ? this.ops.length - 1 : -1), uPost: I(post), uWipe: this.wipe, uAspect: aspect,
      }));
      draw(targetFb || null);
    },
  };

  // ———————————————————— Классические узоры ————————————————————
  let seedCounter = 1;
  const mk = {
    drop: (x, y, r, col, R, dur = 0.08) => ({ t: 1, x, y, r, col, seed: R() * 97, dur }),
    comb: (x, y, ang, z, sp, lam = 0.0055, dur = 1.15) => ({ t: 2, x, y, ang, z, sp, lam, dur }),
    vortex: (x, y, ang, lam, dur = 0.9) => ({ t: 3, x, y, ang, lam, dur }),
    wave: (x, y, ang, amp, wl, ph = 0, dur = 0.95) => ({ t: 4, x, y, ang, amp, wl, ph, dur }),
  };
  function stones(R, pal, counts, rmin, rmax) {
    const A = aspect, area = (A + 0.2) * 1.2, scale = area / 2.1;
    const ops = [];
    counts.forEach((n, k) => {
      const m = Math.max(2, Math.round(n * scale));
      for (let i = 0; i < m; i++) {
        const r = (rmin + R() * (rmax - rmin)) * (1 - k * 0.1);
        ops.push(mk.drop(-0.1 + R() * (A + 0.2), -0.1 + R() * 1.2, r, pal.lin[k % pal.lin.length], R));
      }
    });
    return ops;
  }
  const PRESETS = [
    {
      name: 'Турецкие камни', note: 'Пять красок толкают друг друга в прожилки', pal: 0,
      make: (R, pal) => stones(R, pal, [13, 12, 11, 9, 8], 0.05, 0.1),
    },
    {
      name: 'Гель-гель', note: 'Камни и гребень туда-обратно', pal: 3,
      make: (R, pal) => [
        ...stones(R, pal, [11, 10, 9, 8, 6], 0.05, 0.09),
        mk.comb(0, 0, 0, 0.2, 0.12),
        mk.comb(0, 0.06, Math.PI, 0.2, 0.12),
      ],
    },
    {
      name: 'Павлин', note: 'Гель-гель, волна и частый гребень', pal: 0,
      make: (R, pal) => [
        ...stones(R, pal, [10, 10, 9, 8, 7], 0.045, 0.08),
        mk.comb(0, 0, 0, 0.16, 0.09),
        mk.comb(0, 0.045, Math.PI, 0.16, 0.09),
        mk.wave(0, 0, 0, 0.018, 0.1),
        mk.comb(0, 0, Math.PI / 2, 0.06, 0.028, 0.004),
      ],
    },
    {
      name: 'Суминагаси', note: 'Кольца туши и чистой воды, лёгкий выдох', pal: 1,
      make: (R, pal) => {
        const A = aspect, ops = [];
        const centers = A >= 1
          ? [[A * 0.3, 0.6], [A * 0.66, 0.38], [A * 0.8, 0.8]]
          : [[A * 0.45, 0.72], [A * 0.55, 0.36]];
        const clear = hexToLin(pal.bath);
        centers.forEach(([cx, cy], ci) => {
          for (let k = 0; k < 16; k++) {
            const ink = k % 2 ? clear : (k % 4 === 0 ? pal.lin[0] : pal.lin[1]);
            ops.push(mk.drop(cx + (R() - 0.5) * 0.006, cy + (R() - 0.5) * 0.006, 0.021 + R() * 0.012, ink, R, 0.1));
          }
          if (ci === 0) ops.push(mk.drop(cx, cy, 0.012, pal.lin[3], R, 0.1));
        });
        ops.push(mk.vortex(centers[0][0] + 0.05, centers[0][1] - 0.04, 1.5, 0.22));
        ops.push(mk.vortex(centers[1][0] - 0.03, centers[1][1] + 0.05, -1.2, 0.18));
        ops.push(mk.wave(0, 0, 0.35, 0.03, 0.55, 0.4));
        ops.push(mk.vortex(A * 0.5, 0.52, 0.8, 0.35));
        return ops;
      },
    },
    {
      name: 'Завитки', note: 'Частый гребень и решётка вихрей', pal: 2,
      make: (R, pal) => {
        const A = aspect;
        const ops = [...stones(R, pal, [11, 11, 9, 8, 6], 0.05, 0.08), mk.comb(0, 0, Math.PI / 2, 0.08, 0.05)];
        const step = 0.2;
        for (let y = 0.1; y < 1.0; y += step) {
          for (let x = 0.1 + ((Math.round(y / step) % 2) * step) / 2; x < A; x += step) {
            ops.push(mk.vortex(x, y, 3.2, 0.03, 0.35));
          }
        }
        return ops;
      },
    },
    {
      name: 'Шеврон', note: 'Полосы и встречные проходы гребня', pal: 3,
      make: (R, pal) => [
        ...stones(R, pal, [12, 11, 10, 9, 7], 0.05, 0.09),
        mk.comb(0, 0, 0, 0.9, 0.035, 0.005, 1.6),
        mk.comb(0, 0, Math.PI / 2, 0.16, 0.14),
        mk.comb(0.07, 0, -Math.PI / 2, 0.16, 0.14),
      ],
    },
  ];
  function runPreset(i, animate = true) {
    const pr = PRESETS[i];
    setPalette(pr.pal, false);
    const R = makeRng(1000 + i * 77 + seedCounter++);
    const ops = pr.make(R, PALETTES[pr.pal]);
    if (!animate) { Marble.instant(ops); return; }
    Marble.reset();
    ops.forEach(op => Marble.push(op));
  }

  // ———————————————————— Звук ————————————————————
  const Sound = {
    ctx: null, out: null, rev: null,
    ensure() {
      if (!S.sound) return false;
      try {
        if (!this.ctx) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return false;
          const c = new AC();
          this.ctx = c;
          this.out = c.createGain(); this.out.gain.value = 0.55;
          const comp = c.createDynamicsCompressor();
          this.out.connect(comp); comp.connect(c.destination);
          this.rev = c.createConvolver();
          const len = Math.floor(c.sampleRate * 2.4), ir = c.createBuffer(2, len, c.sampleRate);
          for (let ch = 0; ch < 2; ch++) {
            const d = ir.getChannelData(ch);
            for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
          }
          this.rev.buffer = ir;
          const wet = c.createGain(); wet.gain.value = 0.32;
          this.rev.connect(wet); wet.connect(comp);
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return true;
      } catch (e) { return false; }
    },
    plink(size = 0.05) {
      if (!this.ctx || !S.sound || this.ctx.state !== 'running') return;
      const c = this.ctx, t = c.currentTime;
      const f0 = 1500 - clamp(size, 0.02, 0.12) * 7000 + Math.random() * 180;
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(f0 * 0.55, t);
      o.frequency.exponentialRampToValueAtTime(f0, t + 0.035);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.62, t + 0.22);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.22, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
      o.connect(g); g.connect(this.out); g.connect(this.rev);
      o.start(t); o.stop(t + 0.4);
    },
    tap(r = 0.05) {
      if (!this.ctx || !S.sound || this.ctx.state !== 'running') return;
      const c = this.ctx, t = c.currentTime;
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(420 - clamp(r, 0.01, 0.12) * 1600 + Math.random() * 40, t);
      o.frequency.exponentialRampToValueAtTime(140, t + 0.12);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.07, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      o.connect(g); g.connect(this.out); g.connect(this.rev);
      o.start(t); o.stop(t + 0.2);
    },
    swoosh(dur = 1) {
      if (!this.ctx || !S.sound || this.ctx.state !== 'running') return;
      const c = this.ctx, t = c.currentTime;
      const len = Math.floor(c.sampleRate * (dur + 0.3)), b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) { last = last * 0.96 + (Math.random() * 2 - 1) * 0.04; d[i] = last * 6; }
      const src = c.createBufferSource(); src.buffer = b;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.9;
      bp.frequency.setValueAtTime(260, t); bp.frequency.exponentialRampToValueAtTime(900, t + dur * 0.6); bp.frequency.exponentialRampToValueAtTime(380, t + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.16, t + dur * 0.35); g.gain.linearRampToValueAtTime(0, t + dur + 0.2);
      src.connect(bp); bp.connect(g); g.connect(this.out); g.connect(this.rev);
      src.start(t); src.stop(t + dur + 0.3);
    },
  };

  // ———————————————————— Размер окна ————————————————————
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, SOFT ? 1 : 2);
    W = Math.max(2, Math.round(innerWidth * DPR));
    H = Math.max(2, Math.round(innerHeight * DPR));
    canvas.width = W; canvas.height = H;
    aspect = W / H;
    if (paperTex) paperTex.dispose();
    paperTex = target(W, H, { internal: gl.RGBA8, type: gl.UNSIGNED_BYTE });
    use(P.paper, { uAspect: aspect }); draw(paperTex);
    Fluid.resize();
    if (Marble.started) Marble.resize();
  }
  let resizeTimer = 0;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 120); });

  // ———————————————————— Интерфейс ————————————————————
  const body = document.body;
  const hint = $('#hint');
  const HINTS = {
    water: {
      drop: 'Клик — капля туши. Удерживайте — тушь льётся. Клавиши 1–5 — цвет.',
      stir: 'Ведите палочкой — вода закручивается. Пробел — пауза.',
    },
    marble: {
      drop: 'Клик — капля краски. Удерживайте — капля растёт. Ведите — брызги.',
      needle: 'Проведите шилом через ванну — краска потянется следом.',
      comb: 'Проведите гребнем — зубья идут по всей ширине ванны.',
      swirl: 'Нажмите в центре вихря и ведите по кругу.',
    },
  };
  let hintTimer = 0;
  function updateHint() {
    hint.textContent = HINTS[S.mode][S.tool[S.mode]];
    hint.classList.remove('faded');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => hint.classList.add('faded'), 9000);
  }

  function renderSwatches() {
    const box = $('#swatches');
    box.innerHTML = '';
    const list = S.mode === 'water' ? WATER_INKS.map(k => ({ name: k.name, hex: k.hex })) : PALETTES[S.palette].inks.map((hex, i) => ({ name: `Краска ${i + 1}`, hex }));
    const current = S.mode === 'water' ? S.ink : S.inkM;
    list.forEach((it, i) => {
      const b = document.createElement('button');
      b.className = 'swatch';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(i === current));
      b.title = `${it.name} (${i + 1})`;
      b.setAttribute('aria-label', it.name);
      b.innerHTML = `<i style="--c:${it.hex}"></i>`;
      b.addEventListener('click', () => selectInk(i));
      box.appendChild(b);
    });
    $('#btn-palette').textContent = PALETTES[S.palette].name;
  }
  function selectInk(i) {
    if (S.mode === 'water') S.ink = i; else S.inkM = i;
    $$('#swatches .swatch').forEach((b, k) => b.setAttribute('aria-checked', String(k === i)));
  }
  function setPalette(i, rebake = true) {
    S.palette = i;
    renderSwatches();
    if (rebake && Marble.started) Marble.bakeNow();
  }
  function setTool(t) {
    S.tool[S.mode] = t;
    body.dataset.tool = t;
    $$(`.tools[data-for="${S.mode}"] .tool`).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === t)));
    updateHint();
  }
  function positionModeIndicator() {
    const box = $('.modes'), btn = $(`.modes button[data-mode="${S.mode}"]`);
    box.style.setProperty('--x', `${btn.offsetLeft - 3}px`);
  }
  function setMode(m) {
    if (S.mode === m) return;
    S.mode = m;
    body.dataset.mode = m;
    $$('.modes button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.mode === m)));
    positionModeIndicator();
    $('#subtitle').textContent = m === 'water' ? 'Стабильные жидкости Стэма' : 'Математическое марморирование';
    body.dataset.tool = S.tool[m];
    togglePresets(false);
    renderSwatches();
    updateHint();
    if (m === 'marble' && !Marble.started) {
      Marble.started = true;
      Marble.init();
      Marble.resize();
      runPreset(2, true);
    }
  }
  function togglePresets(show) {
    const el = $('#presets'), btn = $('#btn-presets');
    const on = show === undefined ? el.hidden : show;
    el.hidden = !on;
    btn.setAttribute('aria-expanded', String(on));
  }
  function renderPresets() {
    const list = $('#presets-list');
    PRESETS.forEach((p, i) => {
      const pal = PALETTES[p.pal].inks;
      const b = document.createElement('button');
      b.className = 'preset';
      b.innerHTML = `<span class="dots" style="--g: conic-gradient(${pal.map((c, k) => `${c} ${k * 20}% ${(k + 1) * 20}%`).join(',')})"></span><b>${p.name}</b><small>${p.note}</small>`;
      b.addEventListener('click', () => { togglePresets(false); Sound.ensure(); runPreset(i, true); });
      list.appendChild(b);
    });
  }
  function setRangeFill(input) {
    const p = ((input.value - input.min) / (input.max - input.min)) * 100;
    input.style.setProperty('--p', p + '%');
  }

  $$('.modes button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
  $$('.tool').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));
  $('#btn-palette').addEventListener('click', () => setPalette((S.palette + 1) % PALETTES.length));
  $('#btn-presets').addEventListener('click', () => togglePresets());
  $('#btn-undo').addEventListener('click', () => Marble.undo());
  $('#btn-clear').addEventListener('click', () => clearAll());
  $('#btn-print').addEventListener('click', () => openPrint());
  $('#btn-info').addEventListener('click', () => { $('#info').hidden = !$('#info').hidden; });
  $('#btn-info-close').addEventListener('click', () => { $('#info').hidden = true; });
  $('#btn-sound').addEventListener('click', e => {
    S.sound = !S.sound;
    e.currentTarget.setAttribute('aria-pressed', String(S.sound));
    if (S.sound) Sound.ensure();
    else if (Sound.ctx) Sound.ctx.suspend();
  });
  const bindRange = (id, key) => {
    const el = $(id);
    setRangeFill(el);
    el.addEventListener('input', () => { S[key] = parseFloat(el.value); setRangeFill(el); });
  };
  bindRange('#s-current', 'current');
  bindRange('#s-vort', 'vort');
  bindRange('#s-drop', 'drop');
  bindRange('#s-comb', 'comb');

  function clearAll() {
    const now = performance.now() / 1000;
    if (S.mode === 'water') { Fluid.clear(); Sound.swoosh(0.7); }
    else Marble.clear(now);
  }

  // ———————————————————— Ввод ————————————————————
  const guide = $('#guide');
  const ptr = { down: false, id: -1, x: 0, y: 0, lx: 0, ly: 0, sx: 0, sy: 0, mode: '', angle: 0, lastAng: 0, sprinkled: 0 };
  let lastInteract = -1e9;
  const toUV = (x, y) => [x / innerWidth, 1 - y / innerHeight];
  const toBath = (x, y) => [(x / innerWidth) * aspect, 1 - y / innerHeight];
  const pxToBath = d => d / innerHeight;

  function drawGuide() {
    if (!ptr.down || S.mode !== 'marble') { guide.innerHTML = ''; return; }
    const t = S.tool.marble;
    const dx = ptr.x - ptr.sx, dy = ptr.y - ptr.sy, len = Math.hypot(dx, dy);
    if ((t === 'needle' || t === 'comb') && len > 4) {
      const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
      let tines = '';
      if (t === 'comb') {
        const sp = S.comb * innerHeight;
        for (let k = -3; k <= 3; k++) {
          const ox = nx * sp * k, oy = ny * sp * k;
          tines += `<line x1="${ptr.sx + ox}" y1="${ptr.sy + oy}" x2="${ptr.x + ox}" y2="${ptr.y + oy}" stroke="#26211D" stroke-opacity="${0.5 - Math.abs(k) * 0.12}" stroke-width="1" stroke-dasharray="3 5"/>`;
        }
      }
      const ah = 12;
      guide.innerHTML = `${tines}<line x1="${ptr.sx}" y1="${ptr.sy}" x2="${ptr.x}" y2="${ptr.y}" stroke="#B5402B" stroke-width="1.6" stroke-dasharray="5 5"/>
        <path d="M${ptr.x} ${ptr.y} l${-ux * ah + nx * ah * 0.45} ${-uy * ah + ny * ah * 0.45} M${ptr.x} ${ptr.y} l${-ux * ah - nx * ah * 0.45} ${-uy * ah - ny * ah * 0.45}" stroke="#B5402B" stroke-width="1.8" fill="none" stroke-linecap="round"/>
        <circle cx="${ptr.sx}" cy="${ptr.sy}" r="3.5" fill="#B5402B"/>`;
    } else if (t === 'swirl') {
      const r = Math.max(10, len);
      const a0 = Math.atan2(dy, dx), a1 = a0 - ptr.angle;
      const large = Math.abs(ptr.angle) > Math.PI ? 1 : 0, sweep = ptr.angle < 0 ? 1 : 0;
      const x0 = ptr.sx + Math.cos(a1) * r, y0 = ptr.sy + Math.sin(a1) * r;
      const arc = Math.abs(ptr.angle) > 0.05 && Math.abs(ptr.angle) < Math.PI * 1.98
        ? `<path d="M${x0} ${y0} A${r} ${r} 0 ${large} ${sweep} ${ptr.x} ${ptr.y}" stroke="#B5402B" stroke-width="2" fill="none"/>` : '';
      guide.innerHTML = `<circle cx="${ptr.sx}" cy="${ptr.sy}" r="${r}" stroke="#26211D" stroke-opacity=".35" stroke-dasharray="3 6" fill="none"/>${arc}<circle cx="${ptr.sx}" cy="${ptr.sy}" r="3.5" fill="#B5402B"/>`;
    } else guide.innerHTML = '';
  }

  canvas.addEventListener('pointerdown', e => {
    if (ptr.down) return;
    Sound.ensure();
    togglePresets(false);
    canvas.setPointerCapture(e.pointerId);
    Object.assign(ptr, { down: true, id: e.pointerId, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, sx: e.clientX, sy: e.clientY, angle: 0, sprinkled: 0 });
    ptr.lastAng = 0;
    lastInteract = performance.now();
    const now = performance.now() / 1000;
    if (S.mode === 'water') {
      if (S.tool.water === 'drop') {
        const [u, v] = toUV(e.clientX, e.clientY);
        const r = 0.035 + Math.random() * 0.02;
        inkDrop(u, v, r, S.ink);
        Sound.plink(r);
      }
    } else if (S.tool.marble === 'drop') {
      if (Marble.wipe > -1) return;
      const [x, y] = toBath(e.clientX, e.clientY);
      const r0 = S.drop;
      Marble.queue.length = 0;
      if (Marble.live && !Marble.live.op.hold) Marble.commit();
      Marble.push({ t: 1, x, y, r: r0 * 0.2, r0, rMax: Math.min(0.42, r0 * 4), col: PALETTES[S.palette].lin[S.inkM], seed: Math.random() * 97, hold: true, dur: 0.1 });
      Marble.update(now);
    }
  });
  canvas.addEventListener('pointermove', e => {
    if (!ptr.down || e.pointerId !== ptr.id) return;
    ptr.x = e.clientX; ptr.y = e.clientY;
    lastInteract = performance.now();
    if (S.mode === 'marble') {
      const t = S.tool.marble;
      if (t === 'swirl') {
        const a = Math.atan2(ptr.y - ptr.sy, ptr.x - ptr.sx);
        if (Math.hypot(ptr.x - ptr.sx, ptr.y - ptr.sy) > 8) {
          if (ptr.lastAng !== 0 || ptr.angle !== 0) {
            let d = a - ptr.lastAng;
            while (d > Math.PI) d -= Math.PI * 2;
            while (d < -Math.PI) d += Math.PI * 2;
            ptr.angle += d;
          }
          ptr.lastAng = a;
          if (ptr.angle === 0) ptr.angle = 1e-6;
        }
      } else if (t === 'drop') {
        const moved = Math.hypot(ptr.x - ptr.sx, ptr.y - ptr.sy);
        if (moved > 12) {
          const now = performance.now() / 1000;
          if (Marble.live && Marble.live.op.hold) Marble.release(now);
          const step = Math.hypot(ptr.x - ptr.lx, ptr.y - ptr.ly);
          if (step > 16 && Marble.queue.length < 24) {
            const [x, y] = toBath(ptr.x, ptr.y);
            Marble.push({ t: 1, x: x + (Math.random() - 0.5) * 0.01, y: y + (Math.random() - 0.5) * 0.01, r: S.drop * (0.18 + Math.random() * 0.25), col: PALETTES[S.palette].lin[S.inkM], seed: Math.random() * 97, dur: 0.07 });
            ptr.lx = ptr.x; ptr.ly = ptr.y;
          }
          return;
        }
      }
      drawGuide();
    }
  });
  function endPointer(e) {
    if (!ptr.down || (e && e.pointerId !== ptr.id)) return;
    ptr.down = false;
    const now = performance.now() / 1000;
    if (S.mode === 'marble') {
      const t = S.tool.marble;
      const dx = ptr.x - ptr.sx, dy = ptr.y - ptr.sy, len = Math.hypot(dx, dy);
      const [x, y] = toBath(ptr.sx, ptr.sy);
      if (t === 'drop') Marble.release(now);
      else if ((t === 'needle' || t === 'comb') && len > 8 && Marble.wipe < -1) {
        const ang = Math.atan2(-dy, dx);
        const z = pxToBath(len);
        Marble.push(t === 'comb'
          ? mk.comb(x, y, ang, z, S.comb, 0.0055, clamp(0.5 + z * 1.4, 0.6, 1.6))
          : mk.comb(x, y, ang, z, 0, 0.012, clamp(0.5 + z * 1.4, 0.6, 1.4)));
      } else if (t === 'swirl' && Math.abs(ptr.angle) > 0.15 && Marble.wipe < -1) {
        Marble.push(mk.vortex(x, y, -ptr.angle, Math.max(0.02, pxToBath(len) * 0.6), clamp(Math.abs(ptr.angle) * 0.22, 0.6, 1.6)));
      }
    }
    drawGuide();
  }
  window.addEventListener('pointerup', endPointer);
  window.addEventListener('pointercancel', endPointer);

  // непрерывные действия в режиме «Вода» — каждый кадр
  function waterInput(dt) {
    if (!ptr.down) return;
    const [u, v] = toUV(ptr.x, ptr.y);
    const du = (ptr.x - ptr.lx) / innerWidth, dv = -(ptr.y - ptr.ly) / innerHeight;
    if (S.tool.water === 'drop') {
      const ink = WATER_INKS[S.ink];
      Fluid.splat(Fluid.dye, u, v, 0.02, ink.abs.map(a => a * 0.28 * dt * 60), 0);
      if (Math.abs(du) + Math.abs(dv) > 0) stir(u, v, du, dv, 0.02);
    } else if (Math.abs(du) + Math.abs(dv) > 0) {
      stir(u, v, du, dv);
    }
    ptr.lx = ptr.x; ptr.ly = ptr.y;
  }

  window.addEventListener('keydown', e => {
    if (e.target instanceof HTMLInputElement) return;
    const k = e.key.toLowerCase();
    if (k >= '1' && k <= '5') selectInk(Number(k) - 1);
    else if (k === 'm' || k === 'ь') setMode(S.mode === 'water' ? 'marble' : 'water');
    else if (k === 'c' || k === 'с') clearAll();
    else if (k === 'z' || k === 'я') Marble.undo();
    else if (k === 'p' || k === 'з') openPrint();
    else if (k === ' ') { S.paused = !S.paused; e.preventDefault(); }
    else if (k === 'escape') { closePrint(); togglePresets(false); $('#info').hidden = true; }
  });

  // ———————————————————— Оттиск ————————————————————
  let sheetURLName = 'tush-v-vode.png';
  function openPrint() {
    const long = LOWQ ? 1200 : 2400;
    let w, h;
    if (aspect >= 1) { w = long; h = Math.round(long / aspect); } else { h = long; w = Math.round(long * aspect); }
    w = Math.min(w, MAX_TEX); h = Math.min(h, MAX_TEX);
    const out = target(w, h, { internal: gl.RGBA8, type: gl.UNSIGNED_BYTE });
    if (S.mode === 'water') {
      use(P.water, { uDye: Fluid.dye.read, uPaperTex: paperTex, uTexel: [1 / Fluid.dye.w, 1 / Fluid.dye.h], uPaper: PAPER, uAspect: aspect, uPost: I(2) });
      draw(out);
      sheetURLName = 'tush-v-vode.png';
    } else {
      // оттиск считается заново и точно — в полном разрешении листа
      const hi = target(w, h);
      use(P.bake, Marble.common({ uView: [0, 0, aspect, 1], uPx: [aspect / w, 1 / h], uSS: I(SOFT ? 1 : 4) }));
      draw(hi);
      use(P.marble, Marble.common({ uView: [0, 0, aspect, 1], uCacheRect: [0, 0, aspect, 1], uPx: [aspect / w, 1 / h], uCache: hi, uLive: I(-1), uPost: I(2), uWipe: -2, uAspect: aspect }));
      draw(out);
      hi.dispose();
      sheetURLName = 'marmorirovanie.png';
    }
    const px = new Uint8Array(w * h * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, out.fb);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    out.dispose();
    const sheet = $('#sheet');
    sheet.width = w; sheet.height = h;
    const ctx = sheet.getContext('2d');
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    ctx.putImageData(img, 0, 0);
    // рваная кромка бумаги
    const R = makeRng(7 + seedCounter++);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.beginPath();
    const jag = Math.max(3, w / 320), stepPx = Math.max(6, w / 220);
    const pts = [];
    for (let x = 0; x <= w; x += stepPx) pts.push([x, jag * (0.4 + R())]);
    for (let y = 0; y <= h; y += stepPx) pts.push([w - jag * (0.4 + R()), y]);
    for (let x = w; x >= 0; x -= stepPx) pts.push([x, h - jag * (0.4 + R())]);
    for (let y = h; y >= 0; y -= stepPx) pts.push([jag * (0.4 + R()), y]);
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    $('#print').hidden = false;
    Sound.swoosh(0.6);
  }
  function closePrint() { $('#print').hidden = true; }
  $('#btn-close').addEventListener('click', closePrint);
  $('#btn-newsheet').addEventListener('click', () => { closePrint(); clearAll(); });
  $('#btn-download').addEventListener('click', () => {
    $('#sheet').toBlob(b => {
      if (!b) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = sheetURLName;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    }, 'image/png');
  });

  // ———————————————————— Увертюра и автоигра ————————————————————
  // разгон: капли падают по очереди, жидкость считается по нескольку шагов за кадр — на глазах распускается тушь
  const WARM_N = SOFT ? 40 : 72, WARM_DT = 1.2 / WARM_N;   // одно и то же время симуляции, на слабом рендере — крупнее шаг
  const warm = { left: WARM_N, s: 0, t: 0, comp: null };
  function overture() {
    const comp = [
      { u: 0.62, v: 0.55, r: 0.085, ink: 1 },
      { u: 0.41, v: 0.43, r: 0.07, ink: 0 },
      { u: 0.75, v: 0.33, r: 0.048, ink: 2 },
      { u: 0.29, v: 0.65, r: 0.05, ink: 3 },
      { u: 0.53, v: 0.73, r: 0.036, ink: 4 },
      { u: 0.46, v: 0.24, r: 0.04, ink: 1 },
    ];
    if (aspect < 0.8) comp.forEach(c => { c.u = 0.5 + (c.u - 0.5) * 1.35; c.r *= 0.9; });
    warm.comp = comp;
  }
  function warmStep(n) {
    for (let k = 0; k < n && warm.left > 0; k++) {
      const k60 = Math.round(warm.t * 60);  // расписание капель — в «кадрах по 1/60 с»
      warm.comp.forEach((c, i) => { if (!c.done && k60 >= i * 9) { c.done = true; inkDrop(c.u, c.v, c.r, c.ink); } });
      if (!warm.stirred && k60 >= 60) { warm.stirred = true; for (let j = 0; j < 8; j++) stir(0.3 + j * 0.05, 0.5 + Math.sin(j * 0.7) * 0.08, 0.012, 0.004, 0.03); }
      Fluid.step(WARM_DT, warm.t);
      warm.t += WARM_DT; warm.s++; warm.left--;
    }
  }
  let nextAuto = 0;
  function autoRain(nowMs, time) {
    if (ptr.down || nowMs - lastInteract < 9000 || S.paused) return;
    if (time < nextAuto) return;
    nextAuto = time + 4.5 + Math.random() * 4;
    const r = 0.03 + Math.random() * 0.04;
    inkDrop(0.15 + Math.random() * 0.7, 0.18 + Math.random() * 0.64, r, Math.floor(Math.random() * WATER_INKS.length));
    Sound.plink(r);
  }

  // ———————————————————— Главный цикл ————————————————————
  resize();
  renderSwatches();
  renderPresets();
  updateHint();
  requestAnimationFrame(positionModeIndicator);
  if (document.fonts) document.fonts.ready.then(positionModeIndicator);
  window.addEventListener('resize', positionModeIndicator);
  overture();
  let time = 0;
  let last = performance.now();
  function renderWater() {
    use(P.water, { uDye: Fluid.dye.read, uPaperTex: paperTex, uTexel: [1 / Fluid.dye.w, 1 / Fluid.dye.h], uPaper: PAPER, uAspect: aspect, uPost: I(1) });
    draw(null);
  }
  function frame(nowMs) {
    requestAnimationFrame(frame);
    if (document.hidden) { last = nowMs; return; }
    const dt = Math.min(1 / 30, Math.max(1 / 240, (nowMs - last) / 1000));
    last = nowMs;
    if (S.mode === 'water') {
      if (warm.left > 0) {
        warmStep(SOFT ? 2 : 12);
        time = warm.t; nextAuto = time + 3;
        renderWater();
        return;
      }
      waterInput(dt);
      if (!S.paused) { time += dt; Fluid.step(dt, time); }
      autoRain(nowMs, time);
      renderWater();
    } else {
      Marble.update(nowMs / 1000);
      Marble.render(1);
    }
  }
  requestAnimationFrame(frame);

  // для проверки: ?mode=marble открывает сразу мрамор
  if (/[?&]mode=marble/.test(location.search)) setMode('marble');
  window.__ink = { setMode, runPreset, openPrint, Marble, S };
})();
