'use strict';
/* Кузница планет.
   Рельеф, влажность, кратеры и облака один раз «запекаются» в кубические карты (сначала грубо,
   потом в высоком разрешении по одной грани за кадр). Каждый кадр шейдер только читает карты
   и считает свет: биомы, океаны с бликом, облака с тенями, рассеяние Рэлея и Ми в атмосфере,
   кольца с тенью планеты, спутники с затмениями и «ковку» — остывание расплава при рождении. */
(function () {
  const $ = (s) => document.querySelector(s);
  const canvas = $('#gl');
  const boot = $('#boot');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SHOT = !!window.__SHOT__; // съёмка обложки: без понижения разрешения

  const gl = canvas.getContext('webgl2', {
    antialias: false, alpha: false, depth: false, stencil: false,
    premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance',
  });
  if (!gl) {
    boot.textContent = 'Горн не разгорелся: этому браузеру не хватает WebGL2. Откройте страницу в свежем Chrome, Safari или Firefox.';
    boot.classList.add('fatal');
    return;
  }

  /* ============================== утилиты ============================== */
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const NB = ' ';
  const MINUS = '−';

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const nf = (d) => new Intl.NumberFormat('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d });
  const F0 = nf(0), F1 = nf(1), F2 = nf(2);
  const num = (x, d = 0) => (d === 0 ? F0 : d === 1 ? F1 : F2).format(x).replace('-', MINUS);
  const signed = (x, d = 0) => (x > 0.5 ? '+' : '') + num(x, d);
  function plural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  /* 3×3 матрицы, по столбцам */
  const m3 = {
    rotX(a) { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, s, 0, -s, c]; },
    rotY(a) { const c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 1, 0, s, 0, c]; },
    rotZ(a) { const c = Math.cos(a), s = Math.sin(a); return [c, s, 0, -s, c, 0, 0, 0, 1]; },
    mul(A, B) {
      const r = new Array(9);
      for (let c = 0; c < 3; c++) for (let rr = 0; rr < 3; rr++) {
        r[c * 3 + rr] = A[rr] * B[c * 3] + A[3 + rr] * B[c * 3 + 1] + A[6 + rr] * B[c * 3 + 2];
      }
      return r;
    },
    t(A) { return [A[0], A[3], A[6], A[1], A[4], A[7], A[2], A[5], A[8]]; },
    vec(A, v) { return [A[0] * v[0] + A[3] * v[1] + A[6] * v[2], A[1] * v[0] + A[4] * v[1] + A[7] * v[2], A[2] * v[0] + A[5] * v[1] + A[8] * v[2]]; },
  };
  const norm3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

  /* ============================== GLSL ============================== */
  const COMMON = `
float hash13(vec3 p3){ p3 = fract(p3*0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y)*p3.z); }
vec3 hash33(vec3 p3){ p3 = fract(p3*vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yxx)*p3.zyx); }
vec4 mod289(vec4 x){ return x - floor(x*(1.0/289.0))*289.0; }
vec3 mod289(vec3 x){ return x - floor(x*(1.0/289.0))*289.0; }
vec4 permute(vec4 x){ return mod289(((x*34.0) + 1.0)*x); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314*r; }
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_*D.wyz - D.xzx;
  vec4 j = p - 49.0*floor(p*ns.z*ns.z);
  vec4 x_ = floor(j*ns.z);
  vec4 y_ = floor(j - 7.0*x_);
  vec4 x = x_*ns.x + ns.yyyy;
  vec4 y = y_*ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m*m;
  return 42.0*dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
float fbm(vec3 p, int oct){
  float a = 0.5, s = 0.0, n = 0.0;
  for (int i = 0; i < 12; i++){
    if (i >= oct) break;
    s += a*snoise(p); n += a;
    p = p*2.02 + vec3(1.7, 9.2, 3.1);
    a *= 0.5;
  }
  return s/n;
}
vec3 rotAround(vec3 v, vec3 k, float a){ float c = cos(a), s = sin(a); return v*c + cross(k, v)*s + k*dot(k, v)*(1.0 - c); }
float craterLayer(vec3 p, float sc, vec3 sd){
  vec3 g = p*sc + sd;
  vec3 i = floor(g), f = fract(g);
  float h = 0.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++){
    vec3 o = vec3(float(x), float(y), float(z));
    vec3 r = hash33(i + o);
    if (r.z > 0.5) continue;
    vec3 c = o + 0.2 + 0.6*r;
    float rad = 0.16 + 0.3*hash13(i + o + 7.1);
    float d = length(f - c)/rad;
    float prof = (d < 1.0 ? (d*d - 1.0)*0.7 : 0.0) + exp(-pow((d - 1.0)/0.2, 2.0))*0.35;
    h += prof*smoothstep(1.7, 1.0, d);
  }
  return h;
}
`;

  const VS = `#version 300 es
void main(){
  vec2 p = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  gl_Position = vec4(p, 0.0, 1.0);
}`;

  /* --- запекание: грань кубической карты → рельеф (RGBA) и облака (RG) --- */
  const BAKE_FS = `#version 300 es
precision highp float;
uniform int uFace;
uniform float uSize;
uniform vec3 uSeed;
uniform float uGas;
uniform vec4 uStorms[4];
uniform int uStormN;
uniform float uEncode;
layout(location = 0) out vec4 oT;
layout(location = 1) out vec4 oC;
${COMMON}
vec3 faceDir(int f, vec2 st){
  if (f == 0) return vec3(1.0, -st.y, -st.x);
  if (f == 1) return vec3(-1.0, -st.y, st.x);
  if (f == 2) return vec3(st.x, 1.0, st.y);
  if (f == 3) return vec3(st.x, -1.0, -st.y);
  if (f == 4) return vec3(st.x, -st.y, 1.0);
  return vec3(-st.x, -st.y, -1.0);
}
float ridged(vec3 p){
  float s = 0.0, a = 0.5, w = 1.0, n = 0.0;
  for (int i = 0; i < 7; i++){
    float r = 1.0 - abs(snoise(p));
    r = r*r*w;
    w = clamp(r*1.7, 0.0, 1.0);
    s += r*a; n += a;
    p = p*2.1 + vec3(3.3, 1.1, 7.7);
    a *= 0.5;
  }
  return s/n;
}
vec4 enc(vec4 v){ return uEncode > 0.5 ? clamp(v*0.5 + 0.5, 0.0, 1.0) : v; }
void main(){
  vec2 st = gl_FragCoord.xy/uSize*2.0 - 1.0;
  vec3 p = normalize(faceDir(uFace, st));
  if (uGas > 0.5){
    vec3 q = p; float storm = 0.0;
    for (int i = 0; i < 4; i++){
      if (i >= uStormN) break;
      vec3 c = normalize(uStorms[i].xyz); float r = uStorms[i].w;
      float d = acos(clamp(dot(q, c), -1.0, 1.0));
      float k = exp(-(d*d)/(r*r));
      q = normalize(rotAround(q, c, k*(3.4 + float(i))*(i == 1 ? -1.0 : 1.0)));
      storm = max(storm, smoothstep(0.3, 0.92, k));
    }
    vec3 a = vec3(q.x*1.6, q.y*7.5, q.z*1.6) + uSeed;
    float warp = fbm(a, 5);
    float lat = q.y + 0.075*warp + 0.028*fbm(vec3(q.x*5.0, q.y*22.0, q.z*5.0) + uSeed.zxy, 4);
    float turb = fbm(vec3(q.x*4.0, q.y*18.0, q.z*4.0) + uSeed.yzx*1.3 + warp*0.9, 5);
    oT = enc(vec4(lat, storm, turb, 0.0));
    oC = enc(vec4(0.0));
    return;
  }
  vec3 q = p + uSeed;
  vec3 w = vec3(fbm(q*1.5 + 3.1, 4), fbm(q*1.5 + 17.7, 4), fbm(q*1.5 + 41.3, 4));
  float cont = fbm(q*1.1 + w*0.9, 8);
  float ridge = ridged(p*2.2 + uSeed*1.7 + w*0.35);
  float moist = fbm(p*2.0 + uSeed.zxy + 9.0 + w*0.5, 5)*0.5 + 0.5;
  float crat = craterLayer(p, 4.0, uSeed)*0.6 + craterLayer(p, 9.0, uSeed + 11.0)*0.3 + craterLayer(p, 19.0, uSeed + 23.0)*0.15;
  oT = enc(vec4(cont, ridge, moist, crat));
  // облака: вихри-циклоны закручивают поле перед шумом
  vec3 cp = p;
  for (int i = 0; i < 2; i++){
    vec3 c = normalize(hash33(uSeed + float(i)*7.31) - 0.5);
    float d = acos(clamp(dot(cp, c), -1.0, 1.0));
    float k = exp(-(d*d)/0.018);
    cp = normalize(rotAround(cp, c, k*3.0*(c.y > 0.0 ? 1.0 : -1.0)));
  }
  vec3 cq = cp*2.3 + uSeed.yzx*1.3;
  vec3 cw = vec3(fbm(cq*0.8 + 1.0, 4), fbm(cq*0.8 + 7.0, 4), fbm(cq*0.8 + 13.0, 4));
  float bands = 0.10*cos(p.y*7.0) + 0.05*cos(p.y*15.0);
  float c1 = fbm(cq + cw*1.6, 6) + bands;
  float c2 = fbm(cq*1.07 + cw*1.6 + 5.3, 6) + bands;
  oC = enc(vec4(c1, c2, 0.0, 0.0));
}`;

  /* --- кадр --- */
  const MAIN_FS = `#version 300 es
precision highp float;
precision highp samplerCube;
out vec4 fragColor;
#define PI 3.14159265
uniform vec2 uRes;
uniform vec2 uCenter;
uniform float uFocal;
uniform vec3 uCamPos;
uniform mat3 uCamMat;
uniform mat3 uRotT;
uniform mat3 uCloudRotT;
uniform vec3 uAxis;
uniform vec3 uLight;
uniform vec3 uSunCol;
uniform float uSunI;
uniform float uTime;
uniform float uEncode;
uniform samplerCube uTerrain;
uniform samplerCube uClouds;
uniform float uTexel;

uniform float uGas;
uniform float uSea, uHMin, uHMax, uTect, uCrater, uBump;
uniform float uTemp, uIce, uDry, uLava, uVolc, uLife, uCities, uMoistShift;
uniform vec3 uVeg, uVegDry, uSand, uRock, uRock2, uSnow, uOceanDeep, uOceanShallow, uSalt;
uniform float uCloudThr, uCloudVis, uCloudMix;
uniform vec3 uCloudCol;
uniform float uAtmH, uBetaM;
uniform vec3 uBetaR, uMieCol, uMieAbs;
uniform float uAmb;

uniform float uRingOn, uRingIn, uRingOut, uRingSeed, uRingVis;
uniform vec3 uRingCol, uRingCol2;
uniform vec4 uMoon[3];
uniform vec3 uMoonCol[3];
uniform int uMoonN;

uniform vec3 uGasA, uGasB, uGasC, uGasD, uStormCol;
uniform float uBandFreq, uGasTurb, uGasGlow, uStormVis, uGasSeed;

uniform float uForge, uShock, uPlanetR, uStarSeed, uDbg;
${COMMON}
vec2 sph(vec3 ro, vec3 rd, float r){
  float b = dot(ro, rd); float c = dot(ro, ro) - r*r; float h = b*b - c;
  if (h < 0.0) return vec2(-1.0);
  h = sqrt(h); return vec2(-b - h, -b + h);
}
vec4 dec(vec4 v){ return uEncode > 0.5 ? v*2.0 - 1.0 : v; }
float hgt(vec4 d){ return d.r + uTect*0.8*(d.g - 0.35)*smoothstep(-0.2, 0.3, d.r) + uCrater*d.a*0.12; }
float hgtAt(vec3 p){ return hgt(dec(texture(uTerrain, p))); }
vec3 heat(float s){
  s = clamp(s, 0.0, 1.0);
  return mix(mix(vec3(0.22, 0.01, 0.0), vec3(1.0, 0.26, 0.03), smoothstep(0.0, 0.5, s)), vec3(1.0, 0.8, 0.45), smoothstep(0.5, 1.0, s));
}

float ringDens(float r){
  float x = (r - uRingIn)/(uRingOut - uRingIn);
  if (x < 0.0 || x > 1.0) return 0.0;
  float s = uRingSeed;
  float d = 0.55 + 0.22*sin(x*83.0 + s) + 0.16*sin(x*211.0 + s*2.1) + 0.14*sin(x*37.0 + s*3.7) + 0.09*sin(x*530.0 + s*1.3);
  d *= smoothstep(0.0, 0.07, x)*smoothstep(1.0, 0.86, x);
  float g1 = 0.42 + 0.2*fract(s*0.618);
  d *= smoothstep(0.012, 0.03, abs(x - g1));
  d *= mix(1.0, 0.45, smoothstep(0.65, 1.0, x));
  return clamp(d, 0.0, 1.0);
}
vec3 ringColor(float r){
  float x = (r - uRingIn)/(uRingOut - uRingIn);
  return mix(uRingCol, uRingCol2, 0.5 + 0.5*sin(x*23.0 + uRingSeed*1.7));
}

vec3 sunTrans(vec3 p){
  if (uAtmH < 0.0005) return vec3(1.0);
  vec2 t = sph(p, uLight, 1.0 + uAtmH);
  float len = max(t.y, 0.0);
  float dl = len/4.0;
  float HR = uAtmH*0.28, HM = uAtmH*0.12;
  float oR = 0.0, oM = 0.0;
  for (int j = 0; j < 4; j++){
    vec3 q = p + uLight*(float(j) + 0.5)*dl;
    float h = max(length(q) - 1.0, 0.0);
    oR += exp(-h/HR)*dl; oM += exp(-h/HM)*dl;
  }
  return exp(-(uBetaR*oR + uBetaM*oM*(1.1 + uMieAbs)));
}

void atmosphere(vec3 ro, vec3 rd, float t0, float t1, out vec3 ins, out vec3 tr){
  float HR = uAtmH*0.28, HM = uAtmH*0.12;
  float Ra = 1.0 + uAtmH;
  float ds = (t1 - t0)/10.0;
  vec3 sR = vec3(0.0), sM = vec3(0.0);
  float oR = 0.0, oM = 0.0;
  for (int i = 0; i < 10; i++){
    vec3 p = ro + rd*(t0 + (float(i) + 0.5)*ds);
    float h = max(length(p) - 1.0, 0.0);
    float hr = exp(-h/HR)*ds, hm = exp(-h/HM)*ds;
    oR += hr; oM += hm;
    if (sph(p, uLight, 1.0).x > 0.0) continue;
    vec2 tl = sph(p, uLight, Ra);
    float dl = max(tl.y, 0.0)/4.0;
    float lR = 0.0, lM = 0.0;
    for (int j = 0; j < 4; j++){
      vec3 q = p + uLight*(float(j) + 0.5)*dl;
      float hq = max(length(q) - 1.0, 0.0);
      lR += exp(-hq/HR)*dl; lM += exp(-hq/HM)*dl;
    }
    vec3 att = exp(-(uBetaR*(oR + lR) + uBetaM*(oM + lM)*(1.1 + uMieAbs)));
    sR += att*hr; sM += att*hm;
  }
  float mu = dot(rd, uLight);
  float pR = 3.0/(16.0*PI)*(1.0 + mu*mu);
  float g = 0.76;
  float pM = 3.0/(8.0*PI)*((1.0 - g*g)*(1.0 + mu*mu))/((2.0 + g*g)*pow(1.0 + g*g - 2.0*g*mu, 1.5));
  ins = uSunI*uSunCol*(sR*uBetaR*pR + sM*uBetaM*uMieCol*pM)*3.2;
  tr = exp(-(uBetaR*oR + uBetaM*oM*(1.1 + uMieAbs)));
}

vec3 starLayer(vec3 rd, float sc, float prob, float amp, float rad){
  vec3 g = rd*sc; vec3 id = floor(g); vec3 f = fract(g) - 0.5;
  vec3 h = hash33(id + 17.0 + uStarSeed);
  if (h.x > prob) return vec3(0.0);
  vec3 off = (hash33(id + 3.7) - 0.5)*0.55;
  float d = length(f - off);
  float b = amp*pow(h.y, 2.2)*exp(-d*d/(rad*rad));
  return b*mix(vec3(0.7, 0.8, 1.0), vec3(1.0, 0.84, 0.66), h.z);
}
vec3 background(vec3 rd){
  float n1 = snoise(rd*1.4 + uStarSeed)*0.5 + 0.5;
  float n2 = snoise(rd*3.1 + uStarSeed*1.7)*0.5 + 0.5;
  float neb = pow(n1*0.72 + n2*0.28, 3.2);
  vec3 c = mix(vec3(0.012, 0.016, 0.04), vec3(0.045, 0.02, 0.028), n2)*neb*1.4;
  c += starLayer(rd, 60.0, 0.22, 1.6, 0.07) + starLayer(rd, 130.0, 0.16, 0.7, 0.1) + starLayer(rd, 280.0, 0.12, 0.35, 0.16);
  float sd = max(dot(rd, uLight), 0.0);
  c += uSunCol*(pow(sd, 5.0)*0.035 + pow(sd, 48.0)*0.12 + pow(sd, 700.0)*2.5);
  return c;
}

vec3 shadeMoon(int i, vec3 p, vec3 rd){
  vec3 c = uMoon[i].xyz; float r = uMoon[i].w;
  vec3 n = normalize(p - c);
  float fi = float(i);
  float nz = snoise(n*2.2 + fi*7.0)*0.6 + snoise(n*6.0 + fi*3.0)*0.25;
  // кратеры: две шкалы ячеистых «чаш с валом», нормаль — по конечным разностям
  vec3 sd = vec3(fi*13.1, fi*5.7, 2.0);
  vec3 ta = normalize(cross(abs(n.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0), n));
  vec3 tb = cross(n, ta);
  float e = 0.012;
  float h0 = craterLayer(n, 3.5, sd) + 0.5*craterLayer(n, 8.0, sd + 9.0);
  float h1 = craterLayer(normalize(n + ta*e), 3.5, sd) + 0.5*craterLayer(normalize(n + ta*e), 8.0, sd + 9.0);
  float h2 = craterLayer(normalize(n + tb*e), 3.5, sd) + 0.5*craterLayer(normalize(n + tb*e), 8.0, sd + 9.0);
  vec3 gr = (ta*(h1 - h0) + tb*(h2 - h0))/e;
  n = normalize(n - gr*0.028);
  vec3 base = uMoonCol[i]*(0.7 + 0.32*nz)*(1.0 + 0.18*clamp(h0, -1.0, 1.0));
  float dif = max(dot(n, uLight), 0.0);
  float sh = sph(p, uLight, 1.0).x > 0.0 ? 0.03 : 1.0;
  return base*dif*sh*uSunCol*uSunI*0.85 + base*0.006;
}

vec3 shadePlanet(vec3 pw, vec3 rd){
  vec3 nS = normalize(pw);
  vec3 V = -rd;
  float ndlS = dot(nS, uLight);
  vec3 sunC = uSunCol*uSunI*sunTrans(nS*1.0005);
  float shadow = 1.0;
  if (uRingOn > 0.5){
    float dn = dot(uLight, uAxis);
    if (abs(dn) > 1e-4){
      float t = -dot(pw, uAxis)/dn;
      if (t > 0.0) shadow *= 1.0 - 0.85*ringDens(length(pw + uLight*t))*uRingVis;
    }
  }
  for (int i = 0; i < 3; i++){
    if (i >= uMoonN) break;
    vec3 c = uMoon[i].xyz - pw;
    float along = dot(c, uLight);
    if (along > 0.0){
      float dist = length(c - uLight*along);
      float r = uMoon[i].w;
      shadow *= mix(0.06, 1.0, smoothstep(r*0.8, r*1.3, dist));
    }
  }
  float molten = 1.0 - smoothstep(0.0, 0.55, uForge);
  float night = 1.0 - smoothstep(-0.06, 0.1, ndlS);
  vec3 col;
  vec3 emis = vec3(0.0);

  if (uGas > 0.5){
    vec3 pl = uRotT*nS;
    float ang = uTime*0.0018*sin(pl.y*7.0 + uGasSeed);
    float ca = cos(ang), sa = sin(ang);
    vec3 pd = vec3(ca*pl.x + sa*pl.z, pl.y, -sa*pl.x + ca*pl.z);
    vec4 g = dec(texture(uTerrain, pd));
    float x = g.r*uBandFreq + g.b*0.35*uGasTurb;
    float s1 = 0.5 + 0.5*sin(x*6.28318);
    float s2 = 0.5 + 0.5*sin(x*2.9 + 1.3);
    vec3 c = mix(uGasA, uGasB, smoothstep(0.15, 0.85, s1));
    c = mix(c, uGasC, smoothstep(0.55, 0.95, s2)*0.75);
    c = mix(c, uGasD, smoothstep(0.1, 0.7, g.b*0.5 + 0.5)*0.4*uGasTurb);
    c = mix(c, uStormCol, smoothstep(0.25, 0.8, g.g)*uStormVis);
    c = mix(c, uGasA*0.62, smoothstep(0.72, 0.96, abs(pl.y))*0.55);
    float term = smoothstep(-0.08, 0.22, ndlS);
    col = c*sunC*(max(ndlS, 0.0)*0.9 + 0.1)*term*shadow;
    col *= 0.78 + 0.22*pow(max(dot(nS, V), 0.0), 0.6);
    emis += heat(0.28 + 0.25*s1)*uGasGlow*night*(0.55 + 0.45*(g.b*0.5 + 0.5));
    if (molten > 0.001) col = mix(col, heat(0.3 + 0.55*s1)*(0.8 + 2.4*molten), molten);
    return col + emis;
  }

  vec3 pl = uRotT*nS;
  vec4 d = dec(texture(uTerrain, pl));
  float h = hgt(d);
  float sea = mix(uHMin - 0.03, uSea, smoothstep(0.28, 0.85, uForge));
  float alt = clamp((h - sea)/max(uHMax - sea, 0.05), 0.0, 1.0);
  float coast = smoothstep(-0.0035, 0.0035, h - sea);

  vec3 ta = normalize(cross(abs(pl.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0), pl));
  vec3 tb = cross(pl, ta);
  float e = uTexel*2.0;
  float ha = hgtAt(normalize(pl + ta*e));
  float hb = hgtAt(normalize(pl + tb*e));
  vec3 grad = (ta*(ha - h) + tb*(hb - h))/e;
  float slope = length(grad)*uBump;
  vec3 nl = normalize(pl - grad*uBump*mix(0.2, 1.0, coast));
  vec3 nW = nl*uRotT;

  float term = smoothstep(-0.07, 0.16, ndlS);
  float dif = max(dot(nW, uLight), 0.0)*term;

  float T = uTemp + 14.0 - 55.0*pl.y*pl.y - 42.0*alt;
  float moist = clamp(d.b + uMoistShift + 0.22*(1.0 - smoothstep(0.0, 0.12, alt)), 0.0, 1.0);

  // суша
  float vari = d.g*0.6 + d.b*0.4;
  vec3 ground = mix(uSand, uRock, smoothstep(0.12, 0.62, alt + 0.35*(d.g - 0.45)));
  ground = mix(ground, uRock2, smoothstep(0.45, 0.85, vari)*0.55);
  ground *= mix(vec3(1.0), vec3(1.07, 0.88, 0.76), smoothstep(30.0, 70.0, T));
  float veg = uLife*smoothstep(0.28, 0.58, moist)*smoothstep(-6.0, 7.0, T)*(1.0 - smoothstep(38.0, 58.0, T))
            *(1.0 - smoothstep(0.48, 0.78, alt))*smoothstep(0.7, 1.0, uForge);
  vec3 vcol = mix(uVegDry, uVeg, smoothstep(0.42, 0.85, moist));
  vcol *= 1.0 - 0.35*smoothstep(20.0, 30.0, T)*smoothstep(0.7, 0.9, moist);
  vec3 land = mix(ground, vcol, veg);
  float beach = (1.0 - smoothstep(0.0, 0.02, alt))*step(0.0, T)*(1.0 - uIce)*(1.0 - uDry);
  land = mix(land, uSand*1.12, beach*0.7);
  float snow = smoothstep(-1.0, -8.0, T)*(1.0 - smoothstep(0.35, 0.9, slope));
  land = mix(land, uSnow, snow*smoothstep(0.6, 1.0, uForge));

  // вода, лёд, соль
  float depth = sea - h;
  float Tsea = uTemp + 14.0 - 55.0*pl.y*pl.y;
  float ice = max(uIce, smoothstep(-6.0, -14.0, Tsea));
  vec3 ocean = mix(uOceanShallow, uOceanDeep, smoothstep(0.0, 0.1, depth));
  vec3 iceCol = mix(vec3(0.8, 0.88, 0.95), vec3(0.6, 0.72, 0.84), smoothstep(0.55, 0.9, d.g));
  vec3 water = mix(ocean, iceCol, ice);
  if (uDry > 0.5) water = mix(uSalt, uSalt*0.72, smoothstep(0.7, 0.9, d.g)*0.7 + smoothstep(0.0, 0.2, depth)*0.3);
  vec3 albedo = mix(water, land, coast);

  // облака и их тени
  vec3 plc = uCloudRotT*nS;
  vec4 cd = dec(texture(uClouds, plc));
  float cdet = snoise(plc*24.0 + uTime*0.01)*0.05 + snoise(plc*61.0)*0.025;
  float cval = mix(cd.r, cd.g, uCloudMix) + cdet;
  float cloud = smoothstep(uCloudThr - 0.1, uCloudThr + 0.17, cval);
  cloud = pow(cloud, 1.35)*0.95*uCloudVis;
  vec3 Lc = uCloudRotT*uLight;
  vec4 cs = dec(texture(uClouds, normalize(plc + Lc*0.014)));
  float cshadow = smoothstep(uCloudThr - 0.05, uCloudThr + 0.13, mix(cs.r, cs.g, uCloudMix))*uCloudVis;

  // свет
  vec3 H = normalize(uLight + V);
  float nh = max(dot(nS, H), 0.0);
  float fres = 0.02 + 0.98*pow(1.0 - max(dot(nS, V), 0.0), 5.0);
  float specMask = (1.0 - coast)*(1.0 - ice)*(1.0 - uDry)*(1.0 - uLava);
  float spec = (pow(nh, 260.0)*2.6 + pow(nh, 28.0)*0.09)*term*mix(0.35, 1.0, fres);
  col = albedo*sunC*dif*(1.0 - 0.55*cshadow)*shadow;
  col += sunC*spec*specMask*shadow*(1.0 - cloud);
  col += albedo*uAmb*(0.4 + 0.6*term);
  vec3 sunW = mix(vec3(dot(sunC, vec3(0.3, 0.5, 0.2))), sunC, 0.3);
  float thick = smoothstep(uCloudThr, uCloudThr + 0.32, cval);
  vec3 cloudLit = uCloudCol*sunW*(max(ndlS, 0.0)*0.95 + 0.05*term)*shadow*(0.72 + 0.4*thick) + uCloudCol*uAmb*0.6;
  col = mix(col, cloudLit, cloud);

  // огни городов, разломы, лавовые озёра
  float cn1 = snoise(pl*55.0 + 11.0)*0.5 + 0.5;
  float cn2 = snoise(pl*170.0 + 5.0)*0.5 + 0.5;
  float cityMask = smoothstep(0.5, 0.8, cn1)*(0.25 + 0.75*smoothstep(0.38, 0.8, cn2));
  float cities = uCities*night*coast*cityMask*(1.0 - smoothstep(0.02, 0.3, alt))*(1.0 - snow)*smoothstep(0.9, 1.0, uForge);
  emis += vec3(1.0, 0.62, 0.3)*cities*2.4*(1.0 - cloud*0.8);
  float rift = smoothstep(0.9, 0.985, d.g)*uVolc*coast;
  emis += heat(0.55)*rift*(0.2 + 0.9*night)*(1.0 - cloud*0.6);
  float lake = (1.0 - coast)*uLava;
  emis += heat(0.55 + 0.3*d.b)*lake*(0.35 + 0.8*night)*1.6*(1.0 - cloud*0.5);

  // «ковка»: расплав остывает, по трещинам ещё течёт лава
  if (molten > 0.001){
    float crack = smoothstep(0.7, 0.93, d.g);
    float glow = mix(crack, 1.0, molten*molten);
    vec3 crust = mix(vec3(0.05, 0.03, 0.025), vec3(0.13, 0.055, 0.03), d.b);
    vec3 lava = heat(0.3 + 0.7*molten)*(1.1 + 3.2*molten);
    vec3 mc = crust*(sunC*dif*0.9 + 0.02) + lava*glow;
    col = mix(col, mc, molten);
    emis *= 1.0 - molten;
  }
  if (uDbg > 0.5 && uDbg < 1.5) return vec3(term);
  if (uDbg > 1.5 && uDbg < 2.5) return vec3(dif);
  if (uDbg > 2.5 && uDbg < 3.5) return sunC*0.5;
  if (uDbg > 3.5 && uDbg < 4.5) return vec3(cloud);
  if (uDbg > 4.5 && uDbg < 5.5) return col;
  return col + emis;
}

vec3 aces(vec3 x){ return clamp((x*(2.51*x + 0.03))/(x*(2.43*x + 0.59) + 0.14), 0.0, 1.0); }

void main(){
  vec2 uv = (gl_FragCoord.xy - uCenter)/uRes.y;
  vec3 rd = normalize(uCamMat*vec3(uv, uFocal));
  vec3 ro = uCamPos;
  vec3 col = vec3(0.0);

  float Ra = 1.0 + uAtmH;
  vec2 tP = sph(ro, rd, 1.0);
  vec2 tA = sph(ro, rd, Ra);

  float tM = 1e9; int mi = -1;
  for (int i = 0; i < 3; i++){
    if (i >= uMoonN) break;
    vec2 t = sph(ro - uMoon[i].xyz, rd, uMoon[i].w);
    if (t.x > 0.0 && t.x < tM){ tM = t.x; mi = i; }
  }
  float tR = -1.0, rR = 0.0;
  if (uRingOn > 0.5){
    float dn = dot(rd, uAxis);
    if (abs(dn) > 1e-5){
      float t = -dot(ro, uAxis)/dn;
      if (t > 0.0){
        float r = length(ro + rd*t);
        if (r > uRingIn && r < uRingOut){ tR = t; rR = r; }
      }
    }
  }
  vec4 ring = vec4(0.0);
  if (tR > 0.0){
    vec3 pr = ro + rd*tR;
    float dens = ringDens(rR);
    float sh = sph(pr, uLight, 1.0).x > 0.0 ? 0.035 : 1.0;
    float mu = dot(rd, uLight);
    float fwd = 1.0 + 1.8*pow(max(mu, 0.0), 6.0);
    float lit = (0.22 + 0.78*abs(dot(uAxis, uLight)))*sh*fwd;
    vec3 rc = ringColor(rR);
    ring = vec4(rc*uSunCol*uSunI*0.8*lit + rc*0.008, dens*0.88*uRingVis);
  }

  float tHit = 1e9; int hit = 0;
  if (tP.x > 0.0){ tHit = tP.x; hit = 1; }
  if (mi >= 0 && tM < tHit){ tHit = tM; hit = 2; }
  bool atm = uAtmH > 0.0005 && tA.x > 0.0;
  vec3 ins, tr;
  if (hit == 0){
    col = background(rd);
    if (tR > 0.0 && (!atm || tR > tA.y)) col = mix(col, ring.rgb, ring.a);
    if (atm){ atmosphere(ro, rd, tA.x, tA.y, ins, tr); col = col*tr + ins; }
    if (tR > 0.0 && atm && tR < tA.x) col = mix(col, ring.rgb, ring.a);
  } else {
    col = hit == 1 ? shadePlanet(ro + rd*tP.x, rd) : shadeMoon(mi, ro + rd*tM, rd);
    if (atm){
      float t1 = hit == 1 ? tP.x : min(tA.y, tM);
      if (t1 > tA.x){ atmosphere(ro, rd, tA.x, t1, ins, tr); col = col*tr + ins; }
    }
    if (tR > 0.0 && tR < tHit) col = mix(col, ring.rgb, ring.a);
    if (uDbg > 5.5 && atm){ atmosphere(ro, rd, tA.x, hit == 1 ? tP.x : tA.y, ins, tr); col = ins; }
  }

  // ударная волна «молота»
  if (uShock > 0.0 && uShock < 1.0){
    float rr = length(uv);
    float R = uPlanetR*(1.0 + uShock*1.9);
    float w = 0.003 + uShock*0.035;
    col += vec3(1.0, 0.52, 0.2)*exp(-pow((rr - R)/w, 2.0))*pow(1.0 - uShock, 1.6)*1.3;
    col += vec3(1.0, 0.6, 0.3)*exp(-rr*rr/(uPlanetR*uPlanetR*1.6))*pow(1.0 - uShock, 3.0)*0.25;
  }

  col = aces(col*1.05);
  vec2 q = gl_FragCoord.xy/uRes;
  col *= 1.0 - 0.28*pow(length((q - 0.5)*vec2(1.1, 1.0)), 2.2);
  col = pow(col, vec3(1.0/2.2));
  col += (hash13(vec3(gl_FragCoord.xy, uTime)) - 0.5)/255.0;
  fragColor = vec4(col, 1.0);
}`;

  /* ============================== WebGL-обвязка ============================== */
  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      throw new Error('Шейдер не собрался: ' + log);
    }
    return s;
  }
  function program(vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      u[info.name.replace(/\[0\]$/, '')] = { loc: gl.getUniformLocation(p, info.name), type: info.type, size: info.size };
    }
    return { p, u };
  }
  function setU(prog, name, v) {
    const u = prog.u[name];
    if (!u) return;
    switch (u.type) {
      case gl.FLOAT: u.size > 1 ? gl.uniform1fv(u.loc, v) : gl.uniform1f(u.loc, v); break;
      case gl.FLOAT_VEC2: gl.uniform2fv(u.loc, v); break;
      case gl.FLOAT_VEC3: gl.uniform3fv(u.loc, v); break;
      case gl.FLOAT_VEC4: gl.uniform4fv(u.loc, v); break;
      case gl.FLOAT_MAT3: gl.uniformMatrix3fv(u.loc, false, v); break;
      default: gl.uniform1i(u.loc, v);
    }
  }

  let bakeP, mainP;
  try {
    bakeP = program(VS, BAKE_FS);
    mainP = program(VS, MAIN_FS);
  } catch (err) {
    boot.textContent = 'Горн не разгорелся: видеокарта не собрала шейдер. ' + String(err.message).slice(0, 160);
    boot.classList.add('fatal');
    return;
  }
  const vao = gl.createVertexArray();
  const bakeFB = gl.createFramebuffer();
  const readFB = gl.createFramebuffer();

  let FLOAT = !!gl.getExtension('EXT_color_buffer_float');
  function makeCube(size) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, t);
    for (let f = 0; f < 6; f++) {
      gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + f, 0, FLOAT ? gl.RGBA16F : gl.RGBA8, size, size, 0, gl.RGBA,
        FLOAT ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
    }
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  const LOW = 128;
  let lo = { size: LOW, T: makeCube(LOW), C: makeCube(LOW) };
  // проверяем, можно ли рисовать во float-текстуры; если нет — кодируем в RGBA8
  if (FLOAT) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, bakeFB);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X, lo.T, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_CUBE_MAP_POSITIVE_X, lo.C, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      FLOAT = false;
      lo = { size: LOW, T: makeCube(LOW), C: makeCube(LOW) };
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  const ENC = FLOAT ? 0 : 1;
  let hi = null;           // {size, T, C}
  let hiQueue = [];        // грани, которые осталось запечь
  let hiReady = false;
  let hiSize = 768;

  function bakeFaces(target, faces, P) {
    gl.useProgram(bakeP.p);
    gl.bindVertexArray(vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, bakeFB);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    gl.viewport(0, 0, target.size, target.size);
    setU(bakeP, 'uSize', target.size);
    setU(bakeP, 'uSeed', P.seedVec);
    setU(bakeP, 'uGas', P.gas ? 1 : 0);
    setU(bakeP, 'uStorms', P.stormsFlat);
    setU(bakeP, 'uStormN', P.storms.length);
    setU(bakeP, 'uEncode', ENC);
    for (const f of faces) {
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X + f, target.T, 0);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_CUBE_MAP_POSITIVE_X + f, target.C, 0);
      setU(bakeP, 'uFace', f);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /* Считываем грубую карту обратно: из неё берутся уровень моря под нужный процент воды,
     порог облаков под нужную облачность и высоты для нормировки. */
  function readStats(target) {
    const size = target.size, step = 2;
    const n = 6 * (size / step) * (size / step);
    const S = { n, a: new Float32Array(n), b: new Float32Array(n), c: new Float32Array(n), w: new Float32Array(n), cl: new Float32Array(n) };
    const buf = FLOAT ? new Float32Array(size * size * 4) : new Uint8Array(size * size * 4);
    const cbuf = FLOAT ? new Float32Array(size * size * 4) : new Uint8Array(size * size * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, readFB);
    let k = 0;
    const d = (v) => (FLOAT ? v : (v / 255) * 2 - 1);
    for (let f = 0; f < 6; f++) {
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X + f, target.T, 0);
      gl.readPixels(0, 0, size, size, gl.RGBA, FLOAT ? gl.FLOAT : gl.UNSIGNED_BYTE, buf);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X + f, target.C, 0);
      gl.readPixels(0, 0, size, size, gl.RGBA, FLOAT ? gl.FLOAT : gl.UNSIGNED_BYTE, cbuf);
      for (let y = 0; y < size; y += step) {
        const t = ((y + 0.5) / size) * 2 - 1;
        for (let x = 0; x < size; x += step) {
          const s = ((x + 0.5) / size) * 2 - 1;
          const i = (y * size + x) * 4;
          S.a[k] = d(buf[i]); S.b[k] = d(buf[i + 1]); S.c[k] = d(buf[i + 3]);
          S.cl[k] = (d(cbuf[i]) + d(cbuf[i + 1])) * 0.5;
          S.w[k] = 1 / Math.pow(1 + s * s + t * t, 1.5);
          k++;
        }
      }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    let tw = 0;
    for (let i = 0; i < n; i++) tw += S.w[i];
    S.tw = tw;
    S.idx = new Uint32Array(n);
    S.h = new Float32Array(n);
    // порядок облаков считаем один раз
    const ci = Array.from({ length: n }, (_, i) => i).sort((p, q) => S.cl[p] - S.cl[q]);
    S.cloudSorted = ci;
    return S;
  }
  function quantile(S, order, values, frac) {
    const target = clamp(frac, 0, 1) * S.tw;
    let acc = 0;
    for (let j = 0; j < order.length; j++) {
      acc += S.w[order[j]];
      if (acc >= target) return values[order[j]];
    }
    return values[order[order.length - 1]];
  }
  function heightStats(S, tect, crater) {
    const n = S.n, h = S.h;
    for (let i = 0; i < n; i++) {
      const a = S.a[i];
      h[i] = a + tect * 0.8 * (S.b[i] - 0.35) * smooth(-0.2, 0.3, a) + crater * S.c[i] * 0.12;
    }
    const order = Array.from({ length: n }, (_, i) => i).sort((p, q) => h[p] - h[q]);
    return {
      order,
      at: (f) => quantile(S, order, h, f),
    };
  }

  /* ============================== генерация планеты ============================== */
  const STARS = {
    M: { col: [1.0, 0.55, 0.3], I: 0.9, nom: 'красный карлик', gen: 'красного карлика', veg: [0.075, 0.03, 0.065], vegDry: [0.26, 0.15, 0.14], year: [6, 70], hab: 0.78 },
    K: { col: [1.0, 0.77, 0.56], I: 0.97, nom: 'оранжевый карлик', gen: 'оранжевого карлика', veg: [0.15, 0.2, 0.045], vegDry: [0.44, 0.38, 0.17], year: [90, 420], hab: 1.0 },
    G: { col: [1.0, 0.93, 0.85], I: 1.0, nom: 'жёлтый карлик', gen: 'жёлтого карлика', veg: [0.055, 0.16, 0.05], vegDry: [0.4, 0.38, 0.19], year: [220, 900], hab: 1.0 },
    F: { col: [0.93, 0.95, 1.0], I: 1.04, nom: 'белая звезда', gen: 'белой звезды', veg: [0.035, 0.15, 0.13], vegDry: [0.33, 0.38, 0.29], year: [380, 1500], hab: 0.9 },
    A: { col: [0.78, 0.86, 1.0], I: 1.1, nom: 'бело-голубая звезда', gen: 'бело-голубой звезды', veg: [0.05, 0.1, 0.18], vegDry: [0.3, 0.33, 0.37], year: [600, 3200], hab: 0.55 },
  };
  const ROCKS = [
    { rock: [0.34, 0.3, 0.27], rock2: [0.23, 0.21, 0.2], sand: [0.74, 0.66, 0.48] },
    { rock: [0.44, 0.26, 0.17], rock2: [0.29, 0.17, 0.12], sand: [0.78, 0.52, 0.33] },
    { rock: [0.27, 0.26, 0.27], rock2: [0.17, 0.17, 0.18], sand: [0.62, 0.58, 0.52] },
    { rock: [0.47, 0.39, 0.29], rock2: [0.35, 0.29, 0.21], sand: [0.82, 0.74, 0.56] },
    { rock: [0.38, 0.33, 0.36], rock2: [0.25, 0.21, 0.24], sand: [0.78, 0.72, 0.66] },
  ];
  const OCEANS = [
    { sh: [0.045, 0.28, 0.34], dp: [0.008, 0.04, 0.11] },
    { sh: [0.06, 0.31, 0.27], dp: [0.008, 0.055, 0.075] },
    { sh: [0.08, 0.24, 0.4], dp: [0.012, 0.03, 0.13] },
  ];
  const GAS = {
    jovian: { A: [0.85, 0.77, 0.64], B: [0.6, 0.43, 0.3], C: [0.92, 0.88, 0.8], D: [0.5, 0.34, 0.27], S: [0.78, 0.36, 0.22], name: 'юпитерианская' },
    saturn: { A: [0.88, 0.8, 0.6], B: [0.74, 0.61, 0.41], C: [0.93, 0.87, 0.71], D: [0.6, 0.5, 0.35], S: [0.96, 0.94, 0.86], name: 'сатурнианская' },
    ice: { A: [0.55, 0.78, 0.85], B: [0.34, 0.6, 0.78], C: [0.72, 0.88, 0.92], D: [0.24, 0.44, 0.7], S: [0.1, 0.18, 0.42], name: 'ледяная' },
    hot: { A: [0.26, 0.17, 0.19], B: [0.42, 0.22, 0.17], C: [0.58, 0.36, 0.24], D: [0.14, 0.09, 0.11], S: [0.75, 0.32, 0.15], name: 'раскалённая' },
    exotic: { A: [0.72, 0.62, 0.78], B: [0.48, 0.37, 0.6], C: [0.86, 0.79, 0.86], D: [0.38, 0.29, 0.45], S: [0.93, 0.82, 0.6], name: 'лиловая' },
  };
  const SYL1 = ['Ве', 'Ка', 'Ли', 'Мо', 'Та', 'Ор', 'Эл', 'Ис', 'Ни', 'Се', 'Да', 'Ра', 'Ул', 'Фа', 'Зе', 'Ки', 'Лу', 'Ми', 'Но', 'Ар', 'Са', 'То', 'Аль', 'Кси', 'Гел', 'Бо', 'Иль', 'Ом', 'Эр', 'Тэ'];
  const SYL2 = ['ла', 'ри', 'то', 've', 'на', 'ма', 'ли', 'ра', 'ни', 'за', 'де', 'ко', 'мир', 'тан', 'вер', 'лен', 'сат', 'рис', 'дор', 'кас', 'нел', 'ром', 'тир', 'ве'];
  const END = ['ия', 'а', 'ос', 'ис', 'ея', 'он', 'ара', 'ель', 'ум', 'ада', 'ира', 'ион', 'ета', 'ор', 'ана', 'ин', 'ея'];
  const VOW = 'аеёиоуыэюя';
  function genName(R) {
    const pick = (a) => a[Math.floor(R() * a.length)];
    let s = pick(SYL1);
    if (R() < 0.72) { const m = pick(SYL2); s += m === 've' ? 'ве' : m; }
    let e = pick(END);
    const last = s[s.length - 1].toLowerCase();
    if (VOW.includes(last) && VOW.includes(e[0])) e = pick(['н', 'р', 'л', 'т', 'в']) + e;
    if (!VOW.includes(last) && !VOW.includes(e[0]) && last !== 'ь') e = pick(['а', 'и', 'о']) + e;
    return s + e;
  }

  function genPlanet(seed, curated) {
    const R = mulberry32(seed >>> 0);
    const pick = (a) => a[Math.floor(R() * a.length)];
    const rng = (a, b) => a + (b - a) * R();
    const P = { seed };
    P.gas = R() < 0.24;
    const sr = R();
    P.starKey = sr < 0.26 ? 'M' : sr < 0.56 ? 'K' : sr < 0.84 ? 'G' : sr < 0.95 ? 'F' : 'A';
    P.starSub = Math.floor(R() * 10);
    P.seedVec = [rng(-60, 60), rng(-60, 60), rng(-60, 60)];
    P.tilt = rng(0.08, 0.46) * (R() < 0.5 ? -1 : 1);
    P.tilt2 = rng(-0.22, 0.22);
    P.spin0 = rng(0, Math.PI * 2);
    P.dayHours = P.gas ? rng(9, 17) : rng(14, 58);
    P.yearDays = rng(STARS[P.starKey].year[0], STARS[P.starKey].year[1]);
    P.radius = P.gas ? rng(3.6, 12.5) : rng(0.55, 1.8);
    P.gravity = P.gas ? 0.85 + ((P.radius - 3.6) / 9) * 1.7 + rng(-0.15, 0.15) : P.radius * rng(0.82, 1.12);
    if (P.gas) {
      const tr = R();
      P.temp = tr < 0.3 ? rng(-215, -165) : tr < 0.8 ? rng(-150, -70) : rng(760, 1150);
      P.water = 0.5; P.tect = rng(0.4, 0.85); P.clouds = rng(0.45, 0.85); P.atm = rng(0.35, 0.7);
    } else {
      const tr = R();
      P.temp = tr < 0.55 ? rng(-4, 26) : tr < 0.72 ? rng(-70, -22) : tr < 0.86 ? rng(34, 90) : rng(160, 460);
      P.water = R() < 0.15 ? rng(0.03, 0.12) : rng(0.38, 0.9);
      P.tect = rng(0.25, 0.8);
      P.clouds = rng(0.28, 0.68);
      P.atm = R() < 0.12 ? 0 : rng(0.44, 0.66);
    }
    P.rings = P.gas ? R() < 0.55 : R() < 0.1;
    P.moons = P.gas ? 1 + Math.floor(R() * 3) : R() < 0.5 ? 0 : 1 + (R() < 0.3 ? 1 : 0);
    P.civ = R() < 0.62;
    P.rock = pick(ROCKS);
    P.ocean = pick(OCEANS);
    P.gasPal = P.gas ? pick(['jovian', 'saturn', 'saturn', 'exotic', 'jovian']) : null;
    P.bandFreq = rng(5.5, 11);
    P.gasSeed = rng(0, 6.28);
    P.storms = [];
    if (P.gas) {
      const n = 1 + Math.floor(R() * 3);
      for (let i = 0; i < n; i++) {
        const lat = rng(-0.55, 0.55), lon = rng(0, Math.PI * 2);
        const c = [Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)];
        P.storms.push([c[0], c[1], c[2], i === 0 ? rng(0.14, 0.22) : rng(0.05, 0.1)]);
      }
    }
    P.stormsFlat = new Float32Array(16);
    P.storms.forEach((s, i) => P.stormsFlat.set(s, i * 4));
    P.ringIn = rng(1.32, 1.55);
    P.ringOut = P.ringIn + rng(0.65, 1.0);
    P.ringSeed = rng(0, 100);
    P.ringIcy = R() < 0.6;
    P.moonData = [0, 1, 2].map(() => ({
      r: P.gas ? rng(0.055, 0.11) : rng(0.12, 0.24),
      d: rng(0, 1),
      ph: rng(0, Math.PI * 2),
      inc: rng(-0.18, 0.18),
      col: pick([[0.55, 0.53, 0.5], [0.5, 0.42, 0.35], [0.8, 0.82, 0.85], [0.78, 0.68, 0.36], [0.42, 0.4, 0.42]]),
    }));
    P.name = genName(R);
    P.desig = 'КП-' + String(1000 + Math.floor(R() * 9000)) + ' ' + 'bcdefg'[Math.floor(R() * 6)];
    P.o2 = Math.round(rng(15, 29));
    P.starSeed = rng(0, 50);
    if (curated) {
      Object.assign(P, {
        gas: false, starKey: 'G', starSub: 4, temp: 14, water: 0.63, tect: 0.62, clouds: 0.38, atm: 0.53,
        rings: false, moons: 1, civ: true, rock: ROCKS[0], ocean: OCEANS[0], tilt: -0.36, tilt2: 0.18, spin0: 2.2,
        radius: 1.08, gravity: 1.04, dayHours: 26.4, yearDays: 311,
      });
    }
    return P;
  }

  /* ============================== производные: класс, состав, тексты ============================== */
  const pressureOf = (s) => (s <= 0.001 ? 0 : 0.006 * Math.exp(9.6 * s));
  function tempOf(P, s) { return P.gas ? lerp(-220, 1200, s) : lerp(-120, 480, s); }
  function tempToSlider(P, t) { return P.gas ? (t + 220) / 1420 : (t + 120) / 600; }

  function derive(P, S) {
    const star = STARS[P.starKey];
    const T = tempOf(P, S.temp);
    const W = S.water * 100;
    const pres = P.gas ? 0 : pressureOf(S.atm);
    const D = { T, W, pres };
    if (P.gas) {
      D.cls = T < -150 ? 'Ледяной гигант' : T > 650 ? 'Горячий юпитер' : 'Газовый гигант';
      D.comp = T < -150 ? 'H₂, He, CH₄' : T > 650 ? 'H₂, He, Na, TiO' : 'H₂, He, NH₃, CH₄';
      D.hab = 0;
    } else {
      const airless = pres < 0.02;
      if (airless) D.cls = 'Безвоздушный мир';
      else if (T > 330 && pres > 8) D.cls = 'Парниковый мир';
      else if (T > 330) D.cls = 'Вулканический мир';
      else if (T > 100) D.cls = 'Выжженный мир';
      else if (T < -45) D.cls = 'Ледяной мир';
      else if (W > 88) D.cls = 'Океанический мир';
      else if (W < 12) D.cls = 'Пустынный мир';
      else if (T < -8) D.cls = 'Тундровый мир';
      else D.cls = 'Умеренный мир';
      const tS = Math.exp(-Math.pow((T - 16) / 24, 2));
      const wS = W < 4 ? 0 : W < 20 ? (W - 4) / 16 : W > 96 ? 0.55 : 1;
      const pS = pres < 0.25 ? pres / 0.25 : pres > 6 ? Math.max(0, 1 - (pres - 6) / 6) : 1;
      D.hab = clamp(tS * wS * pS * star.hab * (1 - 0.35 * smooth(0.85, 1, S.tect)), 0, 1);
      if (D.cls === 'Умеренный мир' && D.hab > 0.62) D.cls = 'Земноподобный мир';
      if (airless) D.comp = 'почти вакуум';
      else if (T > 330 && pres > 8) D.comp = 'CO₂, N₂, облака H₂SO₄';
      else if (T < -110 && pres > 0.4) D.comp = 'N₂, CH₄, дымка толинов';
      else if (D.hab > 0.5 && P.civ !== undefined) D.comp = `N₂, O₂${NB}${P.o2}${NB}%, Ar`;
      else if (T > 150) D.comp = 'CO₂, SO₂, N₂';
      else D.comp = 'N₂, CO₂, Ar';
    }
    D.cities = !P.gas && D.hab > 0.74 && P.civ;
    return D;
  }

  function describe(P, S, D) {
    const star = STARS[P.starKey];
    const W = Math.round(D.W);
    const C = Math.round(S.clouds * 100);
    const out = [];
    const cls = D.cls;
    if (P.gas) {
      if (cls === 'Ледяной гигант') out.push('Метан в верхних слоях окрашивает планету в сине-зелёный, полосы едва различимы.');
      else if (cls === 'Горячий юпитер') out.push('Орбита так близко к звезде, что ночная сторона светится собственным жаром.');
      else out.push(`Облачные пояса несутся со скоростью сотен метров в${NB}секунду.`);
      if (P.storms.length && S.clouds > 0.25) out.push(`В${NB}${P.storms[0][1] > 0 ? 'северном' : 'южном'} полушарии кружит вихрь больше Земли.`);
      if (P.rings) out.push(P.ringIcy ? `Кольца изо льда и${NB}камня отбрасывают тень на облака.` : 'Кольца тёмные, из пыли и обломков.');
    } else {
      const pr = D.pres;
      switch (cls) {
        case 'Безвоздушный мир': out.push(`Атмосферы почти нет: поверхность изрыта кратерами, небо чёрное даже днём.`); break;
        case 'Парниковый мир': out.push(`Сплошные облака держат жар: у${NB}поверхности ${signed(D.T)}${NB}°C и${NB}${num(pr, pr < 10 ? 1 : 0)}${NB}атм.`); break;
        case 'Вулканический мир': out.push(`Кора расколота, в${NB}низинах стоят лавовые озёра — ночная сторона светится.`); break;
        case 'Выжженный мир': out.push(`Океаны выкипели — на${NB}их месте белеют соляные равнины.`); break;
        case 'Ледяной мир': out.push(`Поверхность скована льдом; под ним, возможно, скрыт жидкий океан.`); break;
        case 'Океанический мир': out.push(`Океан покрывает ${W}${NB}% поверхности, суша — редкие вулканические архипелаги.`); break;
        case 'Пустынный мир': out.push(`Дюнные моря и${NB}солёные котловины; открытая вода — лишь ${W}${NB}% поверхности.`); break;
        case 'Тундровый мир': out.push(`Холодные равнины под тонким снегом; моря у${NB}экватора свободны ото льда.`); break;
        case 'Земноподобный мир': out.push(`Материки с${NB}горными хребтами разделены океанами — вода занимает ${W}${NB}% поверхности.`); break;
        default: out.push(`Вода занимает ${W}${NB}% поверхности, остальное — равнины и${NB}нагорья.`);
      }
      if (pr >= 0.02 && cls !== 'Парниковый мир') {
        if (C > 75) out.push('Облака почти целиком закрывают небо.');
        else if (C > 35) out.push(`Облака закрывают около ${C}${NB}% неба.`);
        else out.push('Небо почти всегда ясное.');
      }
      if (D.cities) out.push('На ночной стороне горят огни городов — здесь живут.');
      else if (D.hab > 0.55) {
        if (P.starKey === 'M') out.push(`Растительность почти чёрная: под красным карликом выгодно поглощать весь свет.`);
        else if (P.starKey === 'F') out.push(`Листва отливает сине-зелёным — свет звезды жёстче солнечного.`);
        else out.push('Материки зелены, но признаков цивилизации нет.');
      } else if (D.hab > 0.28) out.push(`Возможна микробная жизнь — ${W > 40 ? 'в' + NB + 'тёплых морях' : 'у' + NB + 'горячих источников'}.`);
      else if (cls !== 'Безвоздушный мир') out.push('Признаков жизни не обнаружено.');
    }
    return typo(out.join(' '));
  }

  const typo = (t) => t.replace(/ — /g, NB + '— ');
  function advice(P, D) { return typo(adviceRaw(P, D)); }
  function adviceRaw(P, D) {
    if (P.gas) return D.cls === 'Горячий юпитер' ? 'только дистанционное наблюдение' : 'исследовать спутники; зонд в атмосферу — в один конец';
    switch (D.cls) {
      case 'Безвоздушный мир': return 'высадка в скафандрах, базу строить в кратере';
      case 'Парниковый мир': case 'Вулканический мир': return 'посадка невозможна — наблюдение с орбиты';
      case 'Выжженный мир': return 'посадка ночью, на полярных плато';
      case 'Ледяной мир': return 'бурить лёд к подлёдному океану';
      case 'Пустынный мир': return 'садиться у полярных шапок — там вода';
      default: return D.hab > 0.6 ? 'посадка в умеренных широтах, карантин обязателен' : 'посадка на побережье, пробы воды и грунта';
    }
  }

  /* ============================== состояние ============================== */
  const state = {
    P: null, S: null, D: null, stats: null, hs: null,
    sea: 0, hMin: -1, hMax: 1, cloudThr: 0,
    yaw: 0.22, pitch: 0.1, vyaw: 0, vpitch: 0, zoom: 1, zoomT: 1,
    spin: 0, spinOn: true, moons: 0, rings: false,
    forge: 0, forgeFrom: 0, forgeT0: 0, phase: 'boot', shock: 1, shockT0: 0, next: null,
    forged: 1, soundOn: false,
  };
  try { state.forged = Math.max(1, parseInt(localStorage.getItem('pf-forged') || '1', 10) || 1); } catch (e) { /* приватный режим */ }

  const sliders = {};
  document.querySelectorAll('.sl input').forEach((el) => { sliders[el.dataset.k] = el; });

  function sliderVal(k) { const el = sliders[k]; return (el.value - el.min) / (el.max - el.min); }
  function setSlider(k, v) { const el = sliders[k]; el.value = String(Math.round(lerp(+el.min, +el.max, clamp(v, 0, 1)))); paintSlider(el); }
  function paintSlider(el) { el.style.setProperty('--p', ((el.value - el.min) / (el.max - el.min)) * 100 + '%'); }

  function readSliders() {
    return { water: sliderVal('water'), temp: sliderVal('temp'), tect: sliderVal('tect'), clouds: sliderVal('clouds'), atm: sliderVal('atm') };
  }

  function recomputeTerrain() {
    const P = state.P, S = state.S, st = state.stats;
    if (!st || P.gas) return;
    const pres = pressureOf(S.atm);
    const crater = 0.25 + 1.6 * (1 - smooth(0.0, 0.6, pres));
    state.crater = crater;
    const hs = heightStats(st, S.tect, crater);
    state.sea = hs.at(S.water);
    state.hMin = hs.at(0.004);
    state.hMax = hs.at(0.997);
  }
  function recomputeClouds() {
    const st = state.stats;
    if (!st) return;
    const S = state.S;
    state.cloudThr = S.clouds <= 0.005 ? 9 : quantile(st, st.cloudSorted, st.cl, 1 - S.clouds);
  }

  /* ============================== интерфейс ============================== */
  const el = {
    name: $('#pName'), desig: $('#pDesig'), cls: $('#pClass'), star: $('#pStar'), sw: $('#starSw'),
    radius: $('#pRadius'), grav: $('#pGrav'), temp: $('#pTemp'), day: $('#pDay'), year: $('#pYear'),
    water: $('#pWater'), dtWater: $('#dtWater'), atm: $('#pAtm'), comp: $('#pComp'), moons: $('#pMoons'),
    desc: $('#pDesc'), advice: $('#pAdvice'), habBar: $('#habBar'), habVal: $('#habVal'), num: $('#ppNum'),
    passport: $('#passport'), forged: $('#forged'), seed: $('#seed'), mCount: $('#mCount'),
    tRings: $('#tRings'), tSpin: $('#tSpin'), rowWater: $('#rowWater'),
  };
  const rgbCss = (c) => `rgb(${c.map((v) => Math.round(clamp(v, 0, 1) * 255)).join(',')})`;

  function scramble(node, text, dur) {
    if (reduceMotion) { node.textContent = text; return; }
    const pool = 'абвгдежзиклмнопрстуфхцэюя';
    const t0 = performance.now();
    const tick = (now) => {
      const p = clamp((now - t0) / dur, 0, 1);
      const n = Math.floor(easeOut(p) * text.length);
      let s = text.slice(0, n);
      for (let i = n; i < text.length; i++) {
        const ch = text[i];
        if (ch === ' ' || ch === NB) { s += ch; continue; }
        const r = pool[Math.floor(Math.random() * pool.length)];
        s += ch === ch.toUpperCase() ? r.toUpperCase() : r;
      }
      node.textContent = s;
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function labelsForType() {
    const g = state.P.gas;
    $('#slWater').classList.toggle('hidden', g);
    el.dtWater.textContent = g ? 'Ветер' : 'Вода';
    $('#slTect .lbl').textContent = g ? 'Турбулентность' : 'Тектоника';
    $('#slClouds .lbl').textContent = g ? 'Штормы' : 'Облака';
    $('#slAtm .lbl').textContent = g ? 'Дымка' : 'Атмосфера';
  }

  function sliderOutputs() {
    const P = state.P, S = state.S, D = state.D;
    const out = (id, t) => { $(id + ' output').textContent = t; };
    out('#slWater', `${Math.round(S.water * 100)}${NB}%`);
    out('#slTemp', `${signed(D.T)}${NB}°C`);
    out('#slTect', num(S.tect, 2));
    out('#slClouds', `${Math.round(S.clouds * 100)}${NB}%`);
    out('#slAtm', P.gas ? `${Math.round(S.atm * 100)}${NB}%` : `${num(D.pres, D.pres < 10 ? 2 : 0)}${NB}атм`);
    Object.values(sliders).forEach(paintSlider);
  }

  function updatePassport(fresh) {
    const P = state.P, S = state.S, D = state.D;
    const star = STARS[P.starKey];
    if (fresh) {
      scramble(el.name, P.name, 750);
      scramble(el.desig, P.desig, 600);
      el.num.textContent = '№' + NB + String(state.forged).padStart(4, '0');
      el.passport.classList.remove('swap');
      void el.passport.offsetWidth;
      el.passport.classList.add('swap');
    }
    el.cls.textContent = D.cls;
    el.star.textContent = `${star.nom} ${P.starKey}${P.starSub}`;
    el.sw.style.background = rgbCss(star.col);
    el.sw.style.color = rgbCss(star.col);
    el.radius.textContent = `${num(P.radius, 2)}${NB}R⊕`;
    el.grav.textContent = `${num(P.gravity, 2)}${NB}g`;
    el.temp.textContent = `${signed(D.T)}${NB}°C`;
    el.day.textContent = `${num(P.dayHours, 1)}${NB}ч`;
    const y = Math.round(P.yearDays);
    el.year.textContent = `${num(y)}${NB}${plural(y, 'сутки', 'суток', 'суток')}`;
    el.water.textContent = P.gas ? `до${NB}${num(Math.round((180 + S.tect * 520) / 10) * 10)}${NB}м/с` : `${Math.round(D.W)}${NB}%`;
    el.atm.textContent = P.gas ? 'водородная' : D.pres < 0.02 ? 'нет' : `${num(D.pres, D.pres < 10 ? 2 : 0)}${NB}атм`;
    el.comp.textContent = D.comp;
    el.moons.textContent = state.moons ? String(state.moons) : 'нет';
    el.desc.textContent = describe(P, S, D);
    el.advice.textContent = advice(P, D);
    el.habBar.style.transform = `scaleX(${D.hab.toFixed(3)})`;
    el.habVal.textContent = num(D.hab, 2);
    el.mCount.textContent = String(state.moons);
    el.tRings.setAttribute('aria-pressed', String(state.rings));
    sliderOutputs();
  }

  /* ============================== смена планеты ============================== */
  let lowBakeMs = 0;
  function applyPlanet(P) {
    state.P = P;
    state.moons = P.moons;
    state.rings = P.rings;
    setSlider('water', P.water);
    setSlider('temp', tempToSlider(P, P.temp));
    setSlider('tect', P.tect);
    setSlider('clouds', P.clouds);
    setSlider('atm', P.atm);
    state.S = readSliders();
    labelsForType();
    // грубая выпечка сразу — по ней считаем статистику
    const t0 = performance.now();
    bakeFaces(lo, [0, 1, 2, 3, 4, 5], P);
    state.stats = readStats(lo);
    lowBakeMs = performance.now() - t0;
    recomputeTerrain();
    recomputeClouds();
    state.D = derive(P, state.S);
    // точная выпечка — по грани за кадр, размер подбираем по скорости видеокарты
    hiSize = SHOT ? 448 : lowBakeMs < 25 ? 1024 : lowBakeMs < 90 ? 768 : lowBakeMs < 300 ? 512 : 384;
    if (!hi || hi.size !== hiSize) hi = { size: hiSize, T: makeCube(hiSize), C: makeCube(hiSize) };
    hiQueue = [0, 1, 2, 3, 4, 5];
    hiReady = false;
    if (SHOT) { bakeFaces(hi, hiQueue, P); hiQueue = []; hiReady = true; }
    el.seed.value = String(P.seed);
    try { history.replaceState(null, '', '#seed=' + P.seed); } catch (e) { /* file:// в некоторых браузерах */ }
    updatePassport(true);
    layoutDirty = true;
  }

  function onSliders() {
    const prev = state.S;
    state.S = readSliders();
    if (!state.P) return;
    if (prev.water !== state.S.water || prev.tect !== state.S.tect || prev.atm !== state.S.atm) recomputeTerrain();
    if (prev.clouds !== state.S.clouds) recomputeClouds();
    state.D = derive(state.P, state.S);
    updatePassport(false);
  }
  Object.values(sliders).forEach((s) => s.addEventListener('input', onSliders));

  function randomSeed() { return (Math.random() * 1e9) >>> 0; }

  function requestPlanet(seed) {
    if (state.phase === 'melt') return;
    state.next = genPlanet(seed, false);
    state.forged += 1;
    try { localStorage.setItem('pf-forged', String(state.forged)); } catch (e) { /* ничего */ }
    el.forged.textContent = String(state.forged);
    state.phase = 'melt';
    state.forgeFrom = state.forge;
    state.forgeT0 = performance.now();
    const btn = $('#forge');
    btn.classList.remove('strike'); void btn.offsetWidth; btn.classList.add('strike');
    rumble();
    hideHint();
  }

  /* ============================== звук ============================== */
  let AC = null;
  function audio() {
    if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === 'suspended') AC.resume();
    return AC;
  }
  function clang() {
    if (!state.soundOn) return;
    const a = audio(), t = a.currentTime + 0.01;
    const master = a.createGain(); master.gain.value = 0.2; master.connect(a.destination);
    const len = Math.floor(a.sampleRate * 0.09);
    const nb = a.createBuffer(1, len, a.sampleRate);
    const ch = nb.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const ns = a.createBufferSource(); ns.buffer = nb;
    const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3000; bp.Q.value = 0.8;
    ns.connect(bp); bp.connect(master); ns.start(t);
    const base = 190 * (0.95 + Math.random() * 0.1);
    [[1, 0.42, 2.8], [2.76, 0.24, 1.7], [5.4, 0.13, 1.1], [8.93, 0.07, 0.6], [13.34, 0.04, 0.35]].forEach(([r, amp, dec]) => {
      const o = a.createOscillator(); o.frequency.value = base * r;
      const g = a.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(amp, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + dec + 0.05);
    });
    const o = a.createOscillator(); o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.32);
    const g = a.createGain(); g.gain.setValueAtTime(0.55, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.45);
  }
  function rumble() {
    if (!state.soundOn) return;
    const a = audio(), t = a.currentTime;
    const len = Math.floor(a.sampleRate * 1.2);
    const nb = a.createBuffer(1, len, a.sampleRate);
    const ch = nb.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = last * 0.985 + (Math.random() * 2 - 1) * 0.015; ch[i] = last * 6; }
    const ns = a.createBufferSource(); ns.buffer = nb;
    const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(200, t); lp.frequency.linearRampToValueAtTime(900, t + 0.45);
    const g = a.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    ns.connect(lp); lp.connect(g); g.connect(a.destination); ns.start(t);
  }

  /* ============================== раскладка и камера ============================== */
  const FOCAL = 1.9;
  let layoutDirty = true;
  let view = { cx: 0, cy: 0, r: 100, mobile: false };
  function computeLayout() {
    const W = innerWidth, H = innerHeight;
    const mobile = W <= 860;
    const ringK = state.rings ? (mobile ? 1.9 : 1.72) : 1;
    let cx, cy, r;
    if (mobile) { cx = W * 0.5; cy = H * 0.27; r = Math.min(W * 0.4, H * 0.205) / ringK; }
    else { cx = W * (state.rings ? 0.585 : 0.6); cy = H * 0.49; r = Math.min(H * 0.35, W * 0.25) / ringK; }
    view = { cx, cy, r, mobile };
    layoutDirty = false;
  }

  let scale = SHOT ? 1 : Math.min(window.devicePixelRatio || 1, 1.25);
  const maxScale = Math.min(window.devicePixelRatio || 1, 2);
  function resize() {
    const w = Math.max(1, Math.round(innerWidth * scale));
    const h = Math.max(1, Math.round(innerHeight * scale));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    layoutDirty = true;
  }
  window.addEventListener('resize', resize);
  resize();

  /* перетаскивание и масштаб */
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, t: performance.now() };
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('drag');
    hideHint();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.x = e.clientX; drag.y = e.clientY;
    const k = 0.0052 / state.zoom;
    state.yaw -= dx * k; state.pitch = clamp(state.pitch + dy * k, -1.2, 1.2);
    state.vyaw = -dx * k * 0.9; state.vpitch = dy * k * 0.9;
  });
  const endDrag = () => { drag = null; canvas.classList.remove('drag'); };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    state.zoomT = clamp(state.zoomT * Math.exp(-e.deltaY * 0.0012), 0.72, 1.7);
  }, { passive: false });

  /* ============================== кнопки ============================== */
  $('#forge').addEventListener('click', () => requestPlanet(randomSeed()));
  $('#dice').addEventListener('click', () => requestPlanet(randomSeed()));
  el.seed.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const v = parseInt(el.seed.value.replace(/\D/g, ''), 10);
      if (Number.isFinite(v)) requestPlanet(v >>> 0);
      el.seed.blur();
    }
  });
  el.tRings.addEventListener('click', () => { state.rings = !state.rings; updatePassport(false); layoutDirty = true; });
  el.tSpin.addEventListener('click', () => { state.spinOn = !state.spinOn; el.tSpin.setAttribute('aria-pressed', String(state.spinOn)); });
  $('#mMinus').addEventListener('click', () => { state.moons = Math.max(0, state.moons - 1); updatePassport(false); });
  $('#mPlus').addEventListener('click', () => { state.moons = Math.min(3, state.moons + 1); updatePassport(false); });
  $('#hide').addEventListener('click', () => document.body.classList.toggle('bare'));
  $('#paramsBtn').addEventListener('click', () => $('#params').classList.toggle('open'));
  $('#paramsClose').addEventListener('click', () => $('#params').classList.remove('open'));
  const soundBtn = $('#sound');
  soundBtn.addEventListener('click', () => {
    state.soundOn = !state.soundOn;
    soundBtn.setAttribute('aria-pressed', String(state.soundOn));
    if (state.soundOn) { audio(); clang(); }
  });
  let snapRequested = false;
  $('#snap').addEventListener('click', () => { snapRequested = true; });
  window.addEventListener('keydown', (e) => {
    if (e.target && e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
    if (e.code === 'KeyN' || e.code === 'Space') { e.preventDefault(); requestPlanet(randomSeed()); }
    else if (e.code === 'KeyH') document.body.classList.toggle('bare');
    else if (e.code === 'KeyS') snapRequested = true;
    else if (e.code === 'KeyR') el.tRings.click();
  });
  const hint = $('#hint');
  let hintTimer = setTimeout(hideHint, 9000);
  function hideHint() { hint.classList.add('gone'); clearTimeout(hintTimer); }

  /* ============================== снимок ============================== */
  function saveSnapshot() {
    const c2 = document.createElement('canvas');
    c2.width = canvas.width; c2.height = canvas.height;
    const x = c2.getContext('2d');
    x.drawImage(canvas, 0, 0);
    const k = c2.height / 900;
    x.fillStyle = 'rgba(236,230,218,0.92)';
    x.font = `200 ${Math.round(54 * k)}px Geologica, sans-serif`;
    x.fillText(state.P.name, 44 * k, c2.height - 78 * k);
    x.fillStyle = 'rgba(255,196,107,0.95)';
    x.font = `400 ${Math.round(15 * k)}px Geologica, sans-serif`;
    x.fillText(`${state.D.cls} · ${state.P.desig} · seed ${state.P.seed}`, 46 * k, c2.height - 46 * k);
    c2.toBlob((b) => {
      if (!b) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = `planeta-${state.P.seed}.png`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }, 'image/png');
  }

  /* ============================== кадр ============================== */
  const LIGHT = norm3([-0.86, 0.26, 0.44]);
  let last = performance.now(), ftAvg = 16, lastAdapt = 0, goodStreak = 0, bootHidden = false;
  const t0 = performance.now();

  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden) { last = now; return; }
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const P = state.P;
    if (!P) return;

    // стадии «ковки»
    if (state.phase === 'melt') {
      const p = clamp((now - state.forgeT0) / 480, 0, 1);
      state.forge = state.forgeFrom * (1 - p * p);
      if (p >= 1) {
        applyPlanet(state.next);
        state.phase = 'forge'; state.forgeT0 = now; state.shockT0 = now; state.shock = 0;
        clang();
      }
    } else if (state.phase === 'forge' || state.phase === 'boot') {
      const dur = reduceMotion ? 700 : 1900;
      const p = clamp((now - state.forgeT0) / dur, 0, 1);
      state.forge = easeInOut(p);
      if (p >= 1) state.phase = 'idle';
    }
    state.shock = clamp((now - state.shockT0) / 1300, 0, 1);

    // точная выпечка: одна грань за кадр
    if (hiQueue.length) {
      bakeFaces(hi, [hiQueue.shift()], P);
      if (!hiQueue.length) hiReady = true;
    }

    // камера
    if (!drag) {
      state.yaw += state.vyaw; state.pitch = clamp(state.pitch + state.vpitch, -1.2, 1.2);
      state.vyaw *= 0.92; state.vpitch *= 0.92;
    }
    state.zoom += (state.zoomT - state.zoom) * (1 - Math.exp(-dt * 8));
    if (state.spinOn) state.spin += dt * (reduceMotion ? 0.02 : 0.055) * (P.gas ? 1.5 : 1);
    if (layoutDirty) computeLayout();

    const H = innerHeight;
    const rUv = (view.r / H) * state.zoom;
    const alpha = Math.atan(rUv / FOCAL);
    const dist = 1 / Math.sin(alpha);
    const cp = Math.cos(state.pitch);
    const camPos = [dist * cp * Math.sin(state.yaw), dist * Math.sin(state.pitch), dist * cp * Math.cos(state.yaw)];
    const fwd = norm3([-camPos[0], -camPos[1], -camPos[2]]);
    const right = norm3(cross(fwd, [0, 1, 0]));
    const up = cross(right, fwd);
    const camMat = [right[0], right[1], right[2], up[0], up[1], up[2], fwd[0], fwd[1], fwd[2]];

    const tilt = m3.mul(m3.rotZ(P.tilt), m3.rotX(P.tilt2));
    const rot = m3.mul(tilt, m3.rotY(P.spin0 + state.spin));
    const cloudRot = m3.mul(tilt, m3.rotY(P.spin0 + state.spin * 1.06 + (now - t0) * 0.000004));
    const axis = m3.vec(tilt, [0, 1, 0]);

    // спутники
    const moonArr = new Float32Array(12), moonCol = new Float32Array(9);
    const tt = (now - t0) / 1000;
    const ringOut = state.rings ? P.ringOut : 1;
    for (let i = 0; i < state.moons; i++) {
      const m = P.moonData[i];
      const d = (state.rings ? ringOut + 0.45 : 1.9) + i * (P.gas ? 0.75 : 0.95) + m.d * 0.4;
      const w = 0.12 / Math.pow(d, 1.5);
      const a = m.ph + tt * w * (reduceMotion ? 0.3 : 1);
      const local = m3.vec(m3.rotX(m.inc), [Math.cos(a) * d, 0, Math.sin(a) * d]);
      const pw = m3.vec(tilt, local);
      moonArr.set([pw[0], pw[1], pw[2], m.r], i * 4);
      moonCol.set(m.col, i * 3);
    }

    // адаптивное разрешение
    ftAvg = ftAvg * 0.9 + dt * 1000 * 0.1;
    if (!SHOT && now - lastAdapt > 1200 && now - t0 > 2500) {
      lastAdapt = now;
      if (ftAvg > 30 && scale > 0.4) { scale = Math.max(0.4, scale * 0.8); goodStreak = 0; resize(); }
      else if (ftAvg < 19) { goodStreak++; if (goodStreak >= 3 && scale < maxScale) { scale = Math.min(maxScale, scale * 1.15); goodStreak = 0; resize(); } }
      else goodStreak = 0;
    }
    let snapNow = false;
    if (snapRequested) {
      snapRequested = false; snapNow = true;
      const keep = scale; scale = maxScale; resize(); scale = keep;
    }

    const S = state.S, D = state.D, star = STARS[P.starKey];
    const pres = D.pres;
    const f = state.forge;
    const u = mainP;
    gl.useProgram(u.p);
    gl.bindVertexArray(vao);
    gl.viewport(0, 0, canvas.width, canvas.height);
    const tex = hiReady ? hi : lo;
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_CUBE_MAP, tex.T);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_CUBE_MAP, tex.C);
    setU(u, 'uTerrain', 0); setU(u, 'uClouds', 1);
    setU(u, 'uTexel', 1 / tex.size);
    setU(u, 'uEncode', ENC);
    const sx = canvas.width / innerWidth;
    setU(u, 'uRes', [canvas.width, canvas.height]);
    setU(u, 'uCenter', [view.cx * sx, (innerHeight - view.cy) * sx]);
    setU(u, 'uFocal', FOCAL);
    setU(u, 'uCamPos', camPos);
    setU(u, 'uCamMat', camMat);
    setU(u, 'uRotT', m3.t(rot));
    setU(u, 'uCloudRotT', m3.t(cloudRot));
    setU(u, 'uAxis', axis);
    setU(u, 'uLight', LIGHT);
    setU(u, 'uSunCol', star.col);
    setU(u, 'uSunI', 1.25 * star.I);
    setU(u, 'uTime', tt);
    setU(u, 'uStarSeed', P.starSeed);
    setU(u, 'uForge', f);
    setU(u, 'uDbg', window.__DBG || 0);
    setU(u, 'uShock', state.shock);
    setU(u, 'uPlanetR', rUv);

    // атмосфера
    const T = D.T;
    // оптика атмосферы задаётся вертикальной оптической толщиной (как у Земли при 1 атм),
    // а коэффициенты рассеяния выводятся из неё и высоты однородной атмосферы
    let atmH = 0, betaR = [0, 0, 0], betaM = 0, mieCol = [1, 1, 1], mieAbs = [0, 0, 0];
    const TAU_R = [0.058, 0.135, 0.33];
    if (P.gas) {
      atmH = 0.032;
      const pal = GAS[T < -150 ? 'ice' : T > 650 ? 'hot' : P.gasPal];
      const k = 0.3 + S.atm * 0.8;
      betaR = TAU_R.map((t) => (t * k * 0.6) / (atmH * 0.28));
      betaM = (0.02 + S.atm * 0.09) / (atmH * 0.12);
      mieCol = pal.C;
    } else if (pres >= 0.02) {
      const vd = Math.min(2.4, Math.log(1 + pres * 3) / Math.log(4));
      atmH = 0.022 + 0.016 * Math.min(1.6, vd);
      betaR = TAU_R.map((t) => (t * vd) / (atmH * 0.28));
      betaM = (0.035 * vd) / (atmH * 0.12);
      if (T > 330 && pres > 8) { mieCol = [1.0, 0.86, 0.58]; mieAbs = [0.0, 0.35, 1.2]; betaM *= 2.2; betaR = betaR.map((b) => b * 0.5); }
      else if (T < -110 && pres > 0.4) { mieCol = [1.0, 0.62, 0.3]; mieAbs = [0.0, 0.8, 2.2]; betaM *= 2.6; betaR = betaR.map((b) => b * 0.3); }
      else if (pres < 0.25) { mieCol = [1.0, 0.72, 0.52]; mieAbs = [0.0, 0.3, 0.8]; betaM *= 2.0; }
    }
    const atmVis = smooth(0.35, 1.0, f);
    setU(u, 'uAtmH', atmH * (0.55 + 0.45 * atmVis));
    setU(u, 'uBetaR', betaR.map((b) => b * atmVis));
    setU(u, 'uBetaM', betaM * atmVis);
    setU(u, 'uMieCol', mieCol);
    setU(u, 'uMieAbs', mieAbs);
    setU(u, 'uAmb', 0.012 + 0.01 * Math.min(1, pres));

    setU(u, 'uGas', P.gas ? 1 : 0);
    if (P.gas) {
      const pal = GAS[T < -150 ? 'ice' : T > 650 ? 'hot' : P.gasPal];
      setU(u, 'uGasA', pal.A); setU(u, 'uGasB', pal.B); setU(u, 'uGasC', pal.C); setU(u, 'uGasD', pal.D); setU(u, 'uStormCol', pal.S);
      setU(u, 'uBandFreq', P.bandFreq * (T < -150 ? 0.6 : 1));
      setU(u, 'uGasTurb', 0.3 + S.tect * 1.4);
      setU(u, 'uGasGlow', smooth(500, 1150, T) * 1.3);
      setU(u, 'uStormVis', S.clouds);
      setU(u, 'uGasSeed', P.gasSeed);
    } else {
      setU(u, 'uSea', state.sea); setU(u, 'uHMin', state.hMin); setU(u, 'uHMax', state.hMax);
      setU(u, 'uTect', S.tect); setU(u, 'uCrater', state.crater || 0.3);
      setU(u, 'uBump', 0.022);
      setU(u, 'uTemp', T);
      const airless = pres < 0.02;
      setU(u, 'uIce', airless || T < -35 ? 1 : 0);
      setU(u, 'uDry', T > 100 && !airless ? 1 : 0);
      setU(u, 'uLava', T > 330 ? clamp(0.35 + (T - 330) / 200, 0, 1) : 0);
      setU(u, 'uVolc', clamp(smooth(0.62, 1, S.tect) * 0.9 + (T > 250 ? 0.5 : 0), 0, 1));
      setU(u, 'uLife', smooth(0.35, 0.68, D.hab));
      setU(u, 'uCities', D.cities ? 1 : 0);
      setU(u, 'uMoistShift', (S.water - 0.55) * 0.35);
      setU(u, 'uVeg', star.veg); setU(u, 'uVegDry', star.vegDry);
      const hot = T > 250;
      setU(u, 'uSand', hot ? [0.36, 0.3, 0.27] : P.rock.sand);
      setU(u, 'uRock', hot ? [0.12, 0.1, 0.1] : P.rock.rock);
      setU(u, 'uRock2', hot ? [0.2, 0.14, 0.12] : P.rock.rock2);
      setU(u, 'uSnow', [0.9, 0.93, 0.97]);
      setU(u, 'uOceanDeep', P.ocean.dp); setU(u, 'uOceanShallow', P.ocean.sh);
      setU(u, 'uSalt', [0.84, 0.81, 0.74]);
      setU(u, 'uCloudThr', state.cloudThr);
      setU(u, 'uCloudVis', (airless ? 0 : 1) * smooth(0.55, 1.0, f));
      setU(u, 'uCloudMix', 0.5 + 0.5 * Math.sin(tt * 0.035));
      setU(u, 'uCloudCol', T > 330 && pres > 8 ? [1.0, 0.9, 0.7] : T < -110 && pres > 0.4 ? [0.95, 0.75, 0.48] : [1, 1, 1]);
    }
    setU(u, 'uRingOn', state.rings ? 1 : 0);
    setU(u, 'uRingIn', P.ringIn); setU(u, 'uRingOut', P.ringOut); setU(u, 'uRingSeed', P.ringSeed);
    setU(u, 'uRingVis', smooth(0.4, 1.0, f));
    setU(u, 'uRingCol', P.ringIcy ? [0.86, 0.82, 0.75] : [0.6, 0.48, 0.38]);
    setU(u, 'uRingCol2', P.ringIcy ? [0.62, 0.57, 0.5] : [0.34, 0.27, 0.22]);
    setU(u, 'uMoon', moonArr);
    setU(u, 'uMoonCol', moonCol);
    setU(u, 'uMoonN', state.moons);

    gl.drawArrays(gl.TRIANGLES, 0, 3);

    if (snapNow) { saveSnapshot(); resize(); }
    if (!bootHidden) { bootHidden = true; boot.classList.add('gone'); }
  }

  /* ============================== старт ============================== */
  function start() {
    const m = /seed=(\d+)/.exec(location.hash);
    const seed = m ? parseInt(m[1], 10) >>> 0 : 20260922;
    const P = genPlanet(seed, !m);
    el.forged.textContent = String(state.forged);
    applyPlanet(P);
    state.phase = 'boot';
    state.forgeT0 = performance.now() + 150;
    state.shockT0 = state.forgeT0;
    requestAnimationFrame(frame);
  }
  try {
    start();
  } catch (err) {
    boot.textContent = 'Горн не разгорелся: ' + String(err && err.message || err).slice(0, 180);
    boot.classList.add('fatal');
  }
})();
