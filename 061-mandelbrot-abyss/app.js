(() => {
'use strict';

/* ================================================================
   Бездна Мандельброта — глубокий зум с теорией возмущений.
   Центр кадра хранится в фиксированной точке на BigInt (256 бит),
   эталонная орбита считается в воркере с нужной точностью,
   а каждый пиксель в шейдере считает только малое отклонение δ
   от эталона в обычном float32 — с перебазированием (rebasing),
   которое убирает «глитчи» без вторичных эталонов.
   ================================================================ */

const $ = (s) => document.querySelector(s);
const SHOT = !!window.__SHOT__;
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const PBn = 256, PB = 256n;
const MAX_ZOOM_EXP = 31;          // предел диапазона float32 в шейдере
const BASE_SCALE = 1.25;          // половина высоты кадра при увеличении ×1

/* ---------- Фиксированная точка ---------- */
function parseDec(str) {
  let s = String(str).trim().replace(',', '.');
  let neg = false;
  if (s[0] === '-' || s[0] === '−') { neg = true; s = s.slice(1); }
  const [ip, fp = ''] = s.split('.');
  const v = (BigInt((ip || '0') + fp) << PB) / 10n ** BigInt(fp.length);
  return neg ? -v : v;
}
function toFixed(x) {
  if (!x || !isFinite(x)) return 0n;
  const e = Math.floor(Math.log2(Math.abs(x)));
  const sh = 52 - e;
  if (sh > 1000) return 0n;
  const m = BigInt(Math.round(x * 2 ** sh));
  const d = PBn - sh;
  return d >= 0 ? m << BigInt(d) : m >> BigInt(-d);
}
const toFloat = (v) => Number(v) / 2 ** PBn;
function fmtFixed(v, digits) {
  const neg = v < 0n;
  if (neg) v = -v;
  const ip = v >> PB;
  const frac = ((v & ((1n << PB) - 1n)) * 10n ** BigInt(digits)) >> PB;
  return (neg ? '−' : ' ') + ip.toString() + ',' + frac.toString().padStart(digits, '0');
}

/* ---------- Места для экскурсии ---------- */
const PLACES = [
  { name: 'Долина морских коньков', re: '-0.743643887037158704752191506114774', im: '0.131825904205311970493132056385139', scale: 0.011, steer: true },
  { name: 'Дендрит в точке c = i', re: '0', im: '1', scale: 0.32, steer: false },
  { name: 'Долина слонов', re: '0.2821', im: '0.0100', scale: 0.02, steer: true },
  { name: 'Тройная спираль', re: '-0.0880', im: '0.6545', scale: 0.016, steer: true },
  { name: 'Минибрат на игле', re: '-1.7548776662466927', im: '0', scale: 0.03, steer: true },
];

/* ---------- Палитры ---------- */
const PALETTES = [
  { name: 'Ультра', inside: '#02030a', stops: [[0, '#000764'], [0.16, '#206bcb'], [0.42, '#edffff'], [0.6425, '#ffaa00'], [0.8575, '#000200'], [1, '#000764']] },
  { name: 'Пламя', inside: '#060102', stops: [[0, '#0b0203'], [0.2, '#5c0b0a'], [0.42, '#c42b0c'], [0.6, '#f47b20'], [0.78, '#ffd86a'], [0.9, '#fff6dc'], [1, '#0b0203']] },
  { name: 'Лёд', inside: '#01040a', stops: [[0, '#020714'], [0.25, '#0b3a5e'], [0.5, '#3fa7c4'], [0.7, '#c8f1ff'], [0.85, '#ffffff'], [1, '#020714']] },
  { name: 'Малахит', inside: '#010403', stops: [[0, '#010806'], [0.25, '#0d4a33'], [0.5, '#2f9c67'], [0.72, '#d9c46a'], [0.86, '#fff3c4'], [1, '#010806']] },
  { name: 'Перламутр', inside: '#08050c', stops: [[0, '#140c1c'], [0.2, '#6b3f7a'], [0.4, '#e3a2b8'], [0.6, '#f7e9d7'], [0.8, '#86c5c9'], [1, '#140c1c']] },
];

/* ---------- Масштабы для сравнения (экран шириной 30 см) ---------- */
const SIZES = [
  [105, 'футбольное поле'], [4e4, 'Москва'], [9e6, 'Россия от края до края'], [1.27e7, 'Земля'],
  [7.7e8, 'орбита Луны'], [3e11, 'орбита Земли'], [9e12, 'Солнечная система'], [4e16, 'путь до Проксимы Центавра'],
  [9.5e20, 'Млечный Путь'], [9.5e22, 'Местная группа галактик'], [8.8e26, 'наблюдаемая Вселенная'],
];

/* ================================================================
   WebGL
   ================================================================ */
const canvas = $('#gl');
const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
if (!gl) { fail('Этому браузеру не хватает WebGL2 — без него глубокий зум не посчитать.'); return; }
const HAS_FLOAT = !!gl.getExtension('EXT_color_buffer_float');
if (!HAS_FLOAT) { fail('Видеокарта не умеет рендерить во float-текстуры (EXT_color_buffer_float), а без них бездна не считается.'); return; }

const VS = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

// Отклонение δ от эталонной орбиты Z. δ' = 2Zδ + δ² + δc. Перебазирование: если |Z+δ| < |δ|
// или эталон кончился — продолжаем от Z₀ = 0 с δ = z (Zhuoran, 2021).
const FS_DATA = `#version 300 es
precision highp float;
precision highp int;
uniform highp sampler2D uRef;
uniform int uRefLen;
uniform int uMaxIter;
uniform vec2 uOff;
uniform float uScale;
uniform vec2 uRes;
uniform float uUvMul;
out vec4 outData;
vec2 cmul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
vec2 refZ(int m) { return texelFetch(uRef, ivec2(m & 2047, m >> 11), 0).xy; }
void main() {
  vec2 uv = (gl_FragCoord.xy / uRes * 2.0 - 1.0) * vec2(uRes.x / uRes.y, 1.0) * uUvMul;
  vec2 dc = (uv + uOff) * uScale;
  vec2 dz = vec2(0.0), der = vec2(0.0), Z = vec2(0.0);
  int m = 0;
  for (int n = 0; n < 250000; n++) {
    if (n >= uMaxIter) break;
    vec2 z = Z + dz;
    der = 2.0 * cmul(z, der) + vec2(uScale, 0.0);
    dz = 2.0 * cmul(Z, dz) + cmul(dz, dz) + dc;
    m++;
    Z = refZ(m);
    z = Z + dz;
    float r2 = dot(z, z);
    if (r2 > 1.0e4) {
      float lz = 0.5 * log(r2);
      float nu = float(n) + 2.0 - log2(lz);
      float de = sqrt(r2) * lz / max(length(der), 1.0e-30);
      vec2 u = cmul(z, vec2(der.x, -der.y));
      float lu = length(u);
      outData = vec4(max(nu, 0.0), de, lu > 0.0 ? u / lu : vec2(0.0));
      return;
    }
    if (r2 < dot(dz, dz) || m >= uRefLen - 1) { dz = z; m = 0; Z = vec2(0.0); }
  }
  outData = vec4(-1.0, 0.0, 0.0, 0.0);
}`;

const FS_COLOR = `#version 300 es
precision highp float;
precision highp int;
uniform highp sampler2D uLow;
uniform highp sampler2D uHi;
uniform ivec2 uLowSize;
uniform ivec2 uHiSize;
uniform float uSplit;
uniform sampler2D uPal;
uniform float uPalOff;
uniform float uDensity;
uniform float uMinIt;
uniform float uPpu;
uniform vec3 uInside;
in vec2 vUv;
out vec4 o;
vec3 colorOf(vec4 d) {
  if (d.x < 0.0) return uInside;
  float t = log2(max(d.x - uMinIt, 0.0) + 6.0) * uDensity + uPalOff;
  vec3 c = texture(uPal, vec2(fract(t), 0.5)).rgb;
  vec2 L = vec2(-0.62, 0.78);
  float h2 = 1.7;
  float lam = clamp((dot(d.zw, L) + h2) / (1.0 + h2), 0.0, 1.0);
  c *= 0.42 + 0.78 * lam;
  float dpx = d.y * uPpu;
  c *= mix(0.3, 1.0, smoothstep(0.05, 1.6, dpx));
  return c;
}
vec3 sampleTex(highp sampler2D tex, ivec2 size, vec2 uv) {
  vec2 p = uv * vec2(size) - 0.5;
  ivec2 i0 = ivec2(floor(p));
  vec2 f = fract(p);
  ivec2 mx = size - 1;
  vec3 c00 = colorOf(texelFetch(tex, clamp(i0, ivec2(0), mx), 0));
  vec3 c10 = colorOf(texelFetch(tex, clamp(i0 + ivec2(1, 0), ivec2(0), mx), 0));
  vec3 c01 = colorOf(texelFetch(tex, clamp(i0 + ivec2(0, 1), ivec2(0), mx), 0));
  vec3 c11 = colorOf(texelFetch(tex, clamp(i0 + ivec2(1, 1), ivec2(0), mx), 0));
  return mix(mix(c00, c10, f.x), mix(c01, c11, f.x), f.y);
}
void main() {
  vec3 c = vUv.y < uSplit ? sampleTex(uHi, uHiSize, vUv) : sampleTex(uLow, uLowSize, vUv);
  vec2 q = vUv - 0.5;
  c *= 1.0 - 0.32 * dot(q, q) * 1.6;
  o = vec4(c, 1.0);
}`;

function compile(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}
function program(fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, VS));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, 'aPos');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
  return { p, u };
}
let progData, progColor;
try { progData = program(FS_DATA); progColor = program(FS_COLOR); } catch (e) { fail('Шейдер не собрался: ' + e.message); return; }

const vao = gl.createVertexArray();
gl.bindVertexArray(vao);
const vbo = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

function makeTarget(w, h) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, w, h);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { tex, fbo, w, h };
}
function freeTarget(t) { if (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); } }

/* ---------- Палитра в текстуре ---------- */
const palTex = gl.createTexture();
function hex(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function uploadPalette(p) {
  const N = 512, data = new Uint8Array(N * 4);
  for (let i = 0; i < N; i++) {
    const t = i / N;
    let k = 0;
    while (k < p.stops.length - 2 && t > p.stops[k + 1][0]) k++;
    const [t0, c0] = p.stops[k], [t1, c1] = p.stops[k + 1];
    let f = (t - t0) / (t1 - t0);
    f = f * f * (3 - 2 * f);
    const a = hex(c0), b = hex(c1);
    for (let j = 0; j < 3; j++) data[i * 4 + j] = Math.round(a[j] + (b[j] - a[j]) * f);
    data[i * 4 + 3] = 255;
  }
  gl.bindTexture(gl.TEXTURE_2D, palTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, N, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

/* ================================================================
   Эталонная орбита: воркер с BigInt
   ================================================================ */
const WORKER_SRC = `
self.onmessage = (e) => {
  const { id, re, im, P, n } = e.data;
  const Pn = BigInt(P), cx = BigInt(re), cy = BigInt(im), four = 4n << Pn;
  const out = new Float32Array(2 * n), inv = Math.pow(2, -P);
  let x = 0n, y = 0n, len = n, escaped = false;
  for (let i = 0; i < n; i++) {
    out[2 * i] = Number(x) * inv; out[2 * i + 1] = Number(y) * inv;
    const x2 = (x * x) >> Pn, y2 = (y * y) >> Pn;
    if (x2 + y2 > four) { len = i + 1; escaped = true; break; }
    const xy = (x * y) >> Pn;
    x = x2 - y2 + cx;
    y = (xy << 1n) + cy;
  }
  const data = out.slice(0, 2 * len);
  self.postMessage({ id, len, escaped, data }, [data.buffer]);
};`;
const worker = new Worker(URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' })));
const refTex = gl.createTexture();
const ref = { re: 0n, im: 0n, len: 0, escaped: false, bits: 0, pending: 0, reqId: 0, ready: false };
worker.onmessage = (e) => {
  const d = e.data;
  if (d.id !== ref.reqId) return;
  const W2 = 2048, rows = Math.max(1, Math.ceil(d.len / W2));
  const buf = new Float32Array(W2 * rows * 2);
  buf.set(d.data);
  gl.bindTexture(gl.TEXTURE_2D, refTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, W2, rows, 0, gl.RG, gl.FLOAT, buf);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  ref.re = ref.pRe; ref.im = ref.pIm; ref.bits = ref.pBits;
  ref.len = d.len; ref.escaped = d.escaped; ref.pending = 0; ref.ready = true;
  markDirty();
};
function requestRef(re, im, n) {
  const bits = Math.min(256, Math.max(64, Math.ceil((-Math.log2(view.scale) + 60) / 32) * 32));
  const sh = BigInt(PBn - bits);
  ref.reqId++;
  ref.pending = performance.now();
  ref.pRe = re; ref.pIm = im; ref.pBits = bits;
  worker.postMessage({ id: ref.reqId, re: (re >> sh).toString(), im: (im >> sh).toString(), P: bits, n: Math.min(250000, Math.max(2000, Math.round(n))) });
}

/* ================================================================
   Состояние кадра
   ================================================================ */
const view = { re: 0n, im: 0n, scale: 1 };
const S = {
  place: 0, pal: 0, maxIter: 1200, minIt: 0, minItTarget: 0, palOff: 0, cycle: !REDUCED && !SHOT,
  diving: true, steer: true, target: null, manualUntil: 0, bottom: false, bottomAt: 0,
  speed: REDUCED ? 0.28 : 0.62, lowScale: SHOT ? 0.8 : 0.7, dirty: true, lastChange: 0,
};
let low = null, hi = null, hiRows = 0, hiDone = false, rowsPerFrame = 48;
let cw = 0, ch = 0;

function markDirty() { S.dirty = true; }
function zoomExp() { return Math.log10(BASE_SCALE / view.scale); }

function goPlace(i, { instant = false } = {}) {
  const p = PLACES[i];
  S.place = i;
  view.re = parseDec(p.re);
  view.im = parseDec(p.im);
  view.scale = p.scale;
  S.steer = p.steer;
  S.target = null;
  S.bottom = false;
  S.maxIter = p.steer ? 1400 : 900;
  S.minIt = S.minItTarget = 0;
  ref.ready = false;
  requestRef(view.re, view.im, S.maxIter * 1.5 + 2000);
  ui.place.textContent = p.name;
  document.querySelectorAll('.place-list button').forEach((b, k) => b.setAttribute('aria-current', String(k === i)));
  hideBottom();
  markDirty();
  if (!instant) flash();
}

/* ---------- Размеры ---------- */
function resize() {
  const dpr = SHOT ? 1 : Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(2, Math.round(canvas.clientWidth * dpr)), h = Math.max(2, Math.round(canvas.clientHeight * dpr));
  if (w === cw && h === ch) return;
  cw = w; ch = h;
  canvas.width = w; canvas.height = h;
  freeTarget(hi);
  hi = makeTarget(w, h);
  freeTarget(low);
  low = null;
  hiRows = 0; hiDone = false;
  markDirty();
}
function ensureLow() {
  const w = Math.max(2, Math.round(cw * S.lowScale)), h = Math.max(2, Math.round(ch * S.lowScale));
  if (!low || low.w !== w || low.h !== h) { freeTarget(low); low = makeTarget(w, h); }
}

/* ---------- Проходы ---------- */
function setDataUniforms(w, h, uvMul) {
  const u = progData.u;
  gl.useProgram(progData.p);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, refTex);
  gl.uniform1i(u.uRef, 0);
  gl.uniform1i(u.uRefLen, ref.len);
  gl.uniform1i(u.uMaxIter, Math.round(S.maxIter));
  gl.uniform2f(u.uOff, toFloat(view.re - ref.re) / view.scale, toFloat(view.im - ref.im) / view.scale);
  gl.uniform1f(u.uScale, view.scale);
  gl.uniform2f(u.uRes, w, h);
  gl.uniform1f(u.uUvMul, uvMul);
}
function renderLow() {
  ensureLow();
  gl.bindFramebuffer(gl.FRAMEBUFFER, low.fbo);
  gl.viewport(0, 0, low.w, low.h);
  setDataUniforms(low.w, low.h, 1);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
function renderHiStrip(rows) {
  const y0 = hiRows, y1 = Math.min(ch, hiRows + rows);
  gl.bindFramebuffer(gl.FRAMEBUFFER, hi.fbo);
  gl.viewport(0, 0, cw, ch);
  gl.enable(gl.SCISSOR_TEST);
  gl.scissor(0, y0, cw, y1 - y0);
  setDataUniforms(cw, ch, 1);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.disable(gl.SCISSOR_TEST);
  hiRows = y1;
  if (hiRows >= ch) hiDone = true;
}
function colorPass() {
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, cw, ch);
  const u = progColor.u;
  gl.useProgram(progColor.p);
  const lowT = low || hi;
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, lowT.tex); gl.uniform1i(u.uLow, 0);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, hi.tex); gl.uniform1i(u.uHi, 1);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, palTex); gl.uniform1i(u.uPal, 2);
  gl.uniform2i(u.uLowSize, lowT.w, lowT.h);
  gl.uniform2i(u.uHiSize, hi.w, hi.h);
  gl.uniform1f(u.uSplit, hiDone ? 1 : low ? hiRows / ch : 1);
  gl.uniform1f(u.uPalOff, S.palOff);
  gl.uniform1f(u.uDensity, 0.52);
  gl.uniform1f(u.uMinIt, S.minIt);
  gl.uniform1f(u.uPpu, ch / 2);
  const ins = hex(PALETTES[S.pal].inside);
  gl.uniform3f(u.uInside, ins[0] / 255, ins[1] / 255, ins[2] / 255);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

/* ---------- Проба для автопилота (асинхронное чтение с GPU) ---------- */
const PW = 72, PH = 44, PROBE_MUL = 0.9;
const probe = makeTarget(PW, PH);
const pbo = gl.createBuffer();
gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
gl.bufferData(gl.PIXEL_PACK_BUFFER, PW * PH * 16, gl.STREAM_READ);
gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
const probeBuf = new Float32Array(PW * PH * 4);
let probeSync = null, probeAt = 0, probeView = null;
function startProbe(now) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, probe.fbo);
  gl.viewport(0, 0, PW, PH);
  setDataUniforms(PW, PH, PROBE_MUL);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
  gl.readPixels(0, 0, PW, PH, gl.RGBA, gl.FLOAT, 0);
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
  probeSync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  gl.flush();
  probeAt = now;
  probeView = { re: view.re, im: view.im, scale: view.scale, aspect: cw / ch };
}
function pollProbe() {
  if (!probeSync) return;
  const st = gl.clientWaitSync(probeSync, 0, 0);
  if (st !== gl.ALREADY_SIGNALED && st !== gl.CONDITION_SATISFIED) return;
  gl.deleteSync(probeSync);
  probeSync = null;
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
  gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, probeBuf);
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
  analyzeProbe(probeView);
}
function analyzeProbe(pv) {
  let best = null, bestScore = -1, minIt = Infinity, maxIt = 0, inside = 0, near = null, nearD = Infinity;
  const sig = 0.42;
  for (let k = 0; k < PW * PH; k++) { const it = probeBuf[k * 4]; if (it >= 0) { if (it < minIt) minIt = it; if (it > maxIt) maxIt = it; } }
  // «Детальность»: насколько логарифм итераций скачет у соседей — нити и спирали интереснее гладкой кромки
  const L = new Float32Array(PW * PH);
  const inf = Math.log2(Math.max(2, maxIt - (isFinite(minIt) ? minIt : 0) + 2)) + 1;
  for (let k = 0; k < PW * PH; k++) { const it = probeBuf[k * 4]; L[k] = it < 0 ? inf : Math.log2(it - minIt + 2); }
  for (let j = 0; j < PH; j++) {
    for (let i = 0; i < PW; i++) {
      const k = j * PW + i, it = probeBuf[k * 4];
      const ux = (((i + 0.5) / PW) * 2 - 1) * pv.aspect * PROBE_MUL, uy = (((j + 0.5) / PH) * 2 - 1) * PROBE_MUL;
      const d2 = ux * ux + uy * uy;
      if (it < 0) { inside++; if (d2 < nearD) { nearD = d2; near = [ux, uy]; } continue; }
      let det = 0, cnt = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= PW || jj >= PH) continue;
        det += Math.abs(L[jj * PW + ii] - L[k]); cnt++;
      }
      det /= Math.max(1, cnt);
      const score = (L[k] + 2.2 * det) * Math.exp(-d2 / (2 * sig * sig));
      if (score > bestScore) { bestScore = score; best = [ux, uy, it]; }
    }
  }
  if (isFinite(minIt)) S.minItTarget = minIt;
  // Лимит итераций: с запасом над самым «долгим» сбежавшим пикселем
  if (maxIt > 0) {
    const want = Math.min(200000, Math.max(800, maxIt * 1.4 + 500));
    if (want > S.maxIter) S.maxIter = want;
    else S.maxIter += (want - S.maxIter) * 0.15;
  }
  // Цель автопилота — самый «глубокий» сбежавший пиксель у центра
  if (S.diving && S.steer && best && performance.now() > S.manualUntil) {
    S.target = { re: pv.re + toFixed(best[0] * pv.scale), im: pv.im + toFixed(best[1] * pv.scale) };
  }
  // Нужен ли новый эталон?
  if (!ref.pending && ref.ready) {
    const far = Math.hypot(toFloat(view.re - ref.re), toFloat(view.im - ref.im)) / view.scale;
    const short = ref.escaped ? ref.len < maxIt * 1.02 + 50 : ref.len < S.maxIter;
    if (far > 40 || short) {
      const pick = near || (best && [best[0], best[1]]) || [0, 0];
      requestRef(pv.re + toFixed(pick[0] * pv.scale), pv.im + toFixed(pick[1] * pv.scale), S.maxIter * 1.5 + 2000);
    }
  }
  S.insideFrac = inside / (PW * PH);
}

/* ================================================================
   Интерфейс
   ================================================================ */
const ui = {
  exp: $('#zExp'), mant: $('#zMant'), re: $('#cRe'), im: $('#cIm'), iter: $('#iter'), bits: $('#bits'), fact: $('#fact'),
  place: $('#placeName'), dive: $('#dive'), cycle: $('#cycle'), pals: $('#pals'), places: $('#places'), placeBtn: $('#placeBtn'),
  gaugeMark: $('#gaugeMark'), gaugeVal: $('#gaugeVal'), bottom: $('#bottom'), bottomNext: $('#bottomNext'), snap: $('#snap'),
  flash: $('#flash'), reset: $('#reset'), sheetBtn: $('#sheetBtn'), panel: $('#panel'),
};
function fail(msg) {
  const el = document.getElementById('fail');
  if (el) { el.hidden = false; el.querySelector('p').textContent = msg; }
}
function flash() { ui.flash.classList.remove('on'); void ui.flash.offsetWidth; ui.flash.classList.add('on'); }
function buildUI() {
  ui.places.innerHTML = PLACES.map((p, i) => `<button type="button" data-i="${i}" aria-current="${i === S.place}"><b>${String(i + 1).padStart(2, '0')}</b>${p.name}</button>`).join('');
  ui.pals.innerHTML = PALETTES.map((p, i) => {
    const g = p.stops.map(([t, c]) => `${c} ${Math.round(t * 100)}%`).join(', ');
    return `<button type="button" class="pal" data-i="${i}" aria-pressed="${i === S.pal}" title="${p.name}" aria-label="Палитра «${p.name}»"><i style="background:linear-gradient(90deg, ${g})"></i><span>${p.name}</span></button>`;
  }).join('');
}
function setDiving(on) {
  S.diving = on;
  ui.dive.setAttribute('aria-pressed', String(on));
  ui.dive.querySelector('span').textContent = on ? 'Пауза' : 'Нырять';
  if (on && S.bottom) hideBottom();
}
function showBottom() {
  S.bottom = true;
  S.bottomAt = performance.now();
  ui.bottom.hidden = false;
  requestAnimationFrame(() => ui.bottom.classList.add('on'));
}
function hideBottom() { S.bottom = false; ui.bottom.classList.remove('on'); ui.bottom.hidden = true; }

const nf = new Intl.NumberFormat('ru-RU');
function sizeFact() {
  const meters = (1.5 / (view.scale * (cw / ch))) * 0.3 * 1.0;
  const setW = meters;
  if (setW < SIZES[0][0]) return `Будь экран шириной 30 см, всё множество сейчас было бы шириной ${nf.format(Math.round(setW))} м`;
  const last = SIZES[SIZES.length - 1];
  if (setW > last[0] * 10) {
    const r = setW / last[0];
    const e = Math.floor(Math.log10(r));
    return `Будь экран шириной 30 см, всё множество было бы в&nbsp;10<sup>${e}</sup> раз больше наблюдаемой Вселенной`;
  }
  let item = SIZES[0];
  for (const s of SIZES) if (s[0] <= setW) item = s;
  return `Будь экран шириной 30 см, всё множество сейчас было бы больше, чем ${item[1]}`;
}
let hudAt = 0;
function updateHUD(now) {
  if (now - hudAt < 110) return;
  hudAt = now;
  const ze = zoomExp();
  const e = Math.floor(ze);
  if (ze < 3) { ui.mant.textContent = '×' + nf.format(Math.round(10 ** ze)); ui.exp.textContent = ''; }
  else { ui.mant.textContent = `×${(10 ** (ze - e)).toFixed(1).replace('.', ',')}·10`; ui.exp.textContent = String(e); }
  const digits = Math.min(40, Math.max(8, Math.ceil(ze) + 4));
  const cut = window.innerWidth < 700 ? 18 : 44;
  const clip = (s) => (s.length > cut + 3 ? s.slice(0, cut + 3) + '…' : s);
  ui.re.textContent = clip(fmtFixed(view.re, digits));
  ui.im.textContent = clip(fmtFixed(view.im, digits));
  ui.iter.textContent = nf.format(Math.round(S.maxIter));
  ui.bits.textContent = ref.bits ? `${ref.bits} бит` : '…';
  ui.fact.innerHTML = sizeFact();
  const f = Math.min(1, Math.max(0, ze / MAX_ZOOM_EXP));
  ui.gaugeMark.style.transform = `translateY(${(f * 100).toFixed(2)}%)`;
  ui.gaugeVal.textContent = `10${toSup(Math.max(0, e))}`;
}
const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const toSup = (n) => String(n).split('').map((d) => SUP[d]).join('');

/* ---------- Ввод ---------- */
const pointers = new Map();
let dragMoved = 0, pinchD = 0, downAt = 0;
function uvAt(px, py) {
  const r = canvas.getBoundingClientRect();
  return [((px - r.left) / r.width * 2 - 1) * (r.width / r.height), -((py - r.top) / r.height * 2 - 1)];
}
function zoomAt(px, py, factor) {
  const [ux, uy] = uvAt(px, py);
  const ns = Math.min(BASE_SCALE * 1.6, Math.max(BASE_SCALE / 10 ** MAX_ZOOM_EXP, view.scale * factor));
  const k = 1 - ns / view.scale;
  view.re += toFixed(ux * view.scale * k);
  view.im += toFixed(uy * view.scale * k);
  view.scale = ns;
  markDirty();
}
function manualMode() { if (S.diving) setDiving(false); S.target = null; }
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, [e.clientX, e.clientY]);
  dragMoved = 0;
  downAt = performance.now();
  if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinchD = Math.hypot(a[0] - b[0], a[1] - b[1]); }
});
canvas.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  const prev = pointers.get(e.pointerId);
  pointers.set(e.pointerId, [e.clientX, e.clientY]);
  if (pointers.size === 1) {
    const dx = e.clientX - prev[0], dy = e.clientY - prev[1];
    dragMoved += Math.abs(dx) + Math.abs(dy);
    if (dragMoved > 6) {
      manualMode();
      const r = canvas.getBoundingClientRect();
      view.re -= toFixed((dx / r.height) * 2 * view.scale);
      view.im += toFixed((dy / r.height) * 2 * view.scale);
      markDirty();
    }
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (pinchD > 0) { manualMode(); zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, pinchD / d); }
    pinchD = d;
    dragMoved = 99;
  }
});
function endPointer(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinchD = 0;
  if (e.type === 'pointerup' && dragMoved < 6 && performance.now() - downAt < 450 && pointers.size === 0) {
    // Клик: нырнуть сюда
    const [ux, uy] = uvAt(e.clientX, e.clientY);
    S.target = { re: view.re + toFixed(ux * view.scale), im: view.im + toFixed(uy * view.scale) };
    S.manualUntil = performance.now() + 5000;
    S.steer = true;
    setDiving(true);
  }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  manualMode();
  zoomAt(e.clientX, e.clientY, Math.exp(e.deltaY * 0.0022));
}, { passive: false });
window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.code === 'Space') { e.preventDefault(); setDiving(!S.diving); }
  else if (e.key === '+' || e.key === '=') zoomAt(innerWidth / 2, innerHeight / 2, 0.7);
  else if (e.key === '-') zoomAt(innerWidth / 2, innerHeight / 2, 1.4);
  else if (e.key === 'r' || e.key === 'к') goPlace(S.place);
});
ui.dive.addEventListener('click', () => setDiving(!S.diving));
ui.cycle.addEventListener('click', () => { S.cycle = !S.cycle; ui.cycle.setAttribute('aria-pressed', String(S.cycle)); });
ui.reset.addEventListener('click', () => { goPlace(S.place); setDiving(true); });
ui.pals.addEventListener('click', (e) => {
  const b = e.target.closest('[data-i]');
  if (!b) return;
  S.pal = +b.dataset.i;
  uploadPalette(PALETTES[S.pal]);
  ui.pals.querySelectorAll('[data-i]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
});
ui.placeBtn.addEventListener('click', () => {
  const open = ui.placeBtn.getAttribute('aria-expanded') !== 'true';
  ui.placeBtn.setAttribute('aria-expanded', String(open));
  ui.places.hidden = !open;
});
ui.places.addEventListener('click', (e) => {
  const b = e.target.closest('[data-i]');
  if (!b) return;
  ui.placeBtn.setAttribute('aria-expanded', 'false');
  ui.places.hidden = true;
  goPlace(+b.dataset.i);
  setDiving(true);
});
ui.bottomNext.addEventListener('click', () => { goPlace((S.place + 1) % PLACES.length); setDiving(true); });
ui.snap.addEventListener('click', () => {
  colorPass();
  canvas.toBlob((b) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = `bezdna-10e${Math.floor(zoomExp())}.png`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  });
});
ui.sheetBtn.addEventListener('click', () => {
  const open = !ui.panel.classList.contains('open');
  ui.panel.classList.toggle('open', open);
  ui.sheetBtn.setAttribute('aria-expanded', String(open));
});
document.addEventListener('click', (e) => {
  if (!ui.places.hidden && !e.target.closest('.place-wrap')) { ui.places.hidden = true; ui.placeBtn.setAttribute('aria-expanded', 'false'); }
});

/* ================================================================
   Главный цикл
   ================================================================ */
let last = performance.now(), frameMs = 16, firstFrame = true, shotHold = SHOT, shotDone = false;
function step(now) {
  if (shotDone) return;
  requestAnimationFrame(step);
  const dt = Math.min(0.1, (now - last) / 1000);
  frameMs = frameMs * 0.9 + (now - last) * 0.1;
  last = now;
  if (document.hidden) return;
  resize();
  pollProbe();

  if (S.diving && ref.ready && !shotHold) {
    const ze = zoomExp();
    if (ze >= MAX_ZOOM_EXP) {
      if (!S.bottom) { setDiving(false); showBottom(); }
    } else {
      // скорость падает, если кадры тяжелеют
      const load = Math.min(1, 34 / Math.max(frameMs, 1));
      const sp = S.speed * (0.35 + 0.65 * load) * (ref.pending ? 0.6 : 1);
      view.scale *= Math.exp(-sp * dt);
      if (S.target) {
        const k = 1 - Math.exp(-dt * 1.6);
        const dx = toFloat(S.target.re - view.re), dy = toFloat(S.target.im - view.im);
        view.re += toFixed(dx * k);
        view.im += toFixed(dy * k);
      }
      markDirty();
    }
  }
  if (S.bottom && S.bottomAt && now - S.bottomAt > 6000 && !SHOT) { goPlace((S.place + 1) % PLACES.length); setDiving(true); }

  S.minIt += (S.minItTarget - S.minIt) * Math.min(1, dt * 2.5);
  if (S.cycle) S.palOff = (S.palOff + dt * 0.025) % 1;

  if (!ref.ready) return;
  // подстройка разрешения под нагрузку
  if (!SHOT) {
    if (frameMs > 42 && S.lowScale > 0.3) S.lowScale = Math.max(0.3, S.lowScale * 0.94);
    else if (frameMs < 22 && S.lowScale < 1) S.lowScale = Math.min(1, S.lowScale * 1.03);
  }
  let drew = false;
  if (S.dirty) {
    renderLow();
    S.dirty = false;
    S.lastChange = now;
    hiRows = 0; hiDone = false;
    drew = true;
  } else if (!hiDone && now - S.lastChange > 180) {
    if (frameMs > 40) rowsPerFrame = Math.max(8, rowsPerFrame * 0.8);
    else if (frameMs < 24) rowsPerFrame = Math.min(ch, rowsPerFrame * 1.25);
    renderHiStrip(Math.round(rowsPerFrame));
    drew = true;
  }
  if (!SHOT && !probeSync && now - probeAt > (S.diving ? 260 : 700)) startProbe(now);
  if (drew || S.cycle || firstFrame) colorPass();
  updateHUD(now);
  if (firstFrame && drew) {
    firstFrame = false;
    // Съёмка обложки: один честный кадр — и никакой фоновой нагрузки на программный рендер
    if (SHOT) { hudAt = 0; updateHUD(now + 1000); shotDone = true; }
  }
}

/* ---------- Старт ---------- */
buildUI();
uploadPalette(PALETTES[S.pal]);
ui.cycle.setAttribute('aria-pressed', String(S.cycle));
resize();
goPlace(0, { instant: true });
setDiving(true);
requestAnimationFrame(step);
})();
