/* Ночной музей — рендерер.
   CPU: классический DDA-рейкастинг по столбцам экрана (как в Wolfenstein 3D) плюс проекция спрайтов
   и плоских предметов. Результат — «столбцовая» текстура: расстояние до стены, грань, картины на ней,
   слои предметов перед стеной. GPU: фрагментный шейдер по этим данным освещает каждый пиксель —
   фонарь с рисунком пятна, лунные пятна от окон, лампы над картинами, отражения в паркете, пыль в луче. */
(function (root) {
'use strict';
const NM = root.NM = root.NM || {};
const W = NM.World;

const ROWS = 21;           // строк в столбцовой текстуре
const MAXL = 8;            // слоёв предметов на столбец
const KIND = { SPRITE: 1, SEG: 2, SLAB: 3 };

// ---------- шейдеры ----------
const VS = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
precision mediump sampler2DArray;

uniform sampler2D uCols;
uniform sampler2D uCells;
uniform sampler2D uMoon;
uniform sampler2D uTrail;
uniform sampler2DArray uPaint;
uniform sampler2DArray uSpr;
uniform sampler2DArray uPaintHi;

uniform vec2 uRes;
uniform vec2 uPos;
uniform vec2 uDir;
uniform vec2 uRight;
uniform vec2 uMap;
uniform float uFocal;
uniform float uHor;
uniform float uEye;
uniform float uWallH;
uniform float uDoorH;
uniform float uTime;
uniform float uDawn;
uniform float uUV;
uniform float uFlashI;
uniform float uVol;
uniform float uGrain;
uniform float uExpo;
uniform vec3 uFlashPos;
uniform vec3 uFlashDir;
uniform vec3 uMoonL;
uniform vec3 uSkyL;
uniform vec4 uSky;
uniform vec4 uGlint;
uniform int uNL;
uniform vec4 uLP[10];
uniform vec4 uLC[10];
uniform vec4 uLD[10];
uniform int uNAO;
uniform vec4 uAO[12];
uniform int uMaxL;
uniform int uTwo;
uniform int uPasses;
uniform int uVolN;

out vec4 oCol;

const float PI = 3.14159265;
int CX;

// ---------- шум ----------
float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float h13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h12(i), h12(i + vec2(1, 0)), f.x), mix(h12(i + vec2(0, 1)), h12(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * vn(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
float vn3(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(h13(i), h13(i + vec3(1, 0, 0)), f.x), mix(h13(i + vec3(0, 1, 0)), h13(i + vec3(1, 1, 0)), f.x), f.y);
  float b = mix(mix(h13(i + vec3(0, 0, 1)), h13(i + vec3(1, 0, 1)), f.x), mix(h13(i + vec3(0, 1, 1)), h13(i + vec3(1, 1, 1)), f.x), f.y);
  return mix(a, b, f.z);
}
vec3 srgb(vec3 c) { return c * c * (c * 0.305306011 + 0.682171111) + 0.012522878 * c; }
float bump(float t, float c, float w) { float x = (t - c) / w; return x * x < 1.0 ? (1.0 - x * x) : 0.0; }

vec4 C(int r) { return texelFetch(uCols, ivec2(CX, r), 0); }
// картина: слои от 1000 — семь похищенных в высоком разрешении
vec3 paintTex(int layer, vec2 uv, float lod) {
  if (layer >= 1000) return textureLod(uPaintHi, vec3(uv, float(layer - 1000)), lod + 1.0).rgb;
  return textureLod(uPaint, vec3(uv, float(layer)), lod).rgb;
}

struct Mat { vec3 a; float sp; float gl; float mt; vec3 e; vec3 f; };
Mat mk(vec3 a) { Mat m; m.a = a; m.sp = 0.03; m.gl = 16.0; m.mt = 0.0; m.e = vec3(0.0); m.f = vec3(0.0); return m; }

// ---------- свет ----------
vec3 moonCol() { return mix(vec3(0.3, 0.46, 1.0), vec3(1.0, 0.64, 0.5), uDawn); }
vec2 moonAt(vec3 P) {
  vec2 q1 = P.xy - uMoonL.xy * (P.z / uMoonL.z);
  vec2 q2 = P.xy - uSkyL.xy * (P.z / uSkyL.z);
  return vec2(textureLod(uMoon, q1 / uMap, 0.0).r, textureLod(uMoon, q2 / uMap, 0.0).g);
}
vec3 flashCol() { return mix(vec3(1.0, 0.87, 0.7), vec3(0.4, 0.16, 1.0), uUV); }
float spot(float c) {
  // угол через хорду: sqrt(2 − 2cos) ≈ угол до ~50°, без дорогого acos
  float a = sqrt(max(2.0 - 2.0 * c, 0.0));
  // пятно фонаря: мягкий центр, чёткая кромка с ярким ободком отражателя, слабый ореол
  float r = a / mix(0.22, 0.19, uUV);
  float core = exp(-r * r * 3.0) * 0.5;
  float body = (1.0 - smoothstep(0.68, 1.0, r)) * 0.62;
  float ring = exp(-(r - 0.9) * (r - 0.9) * 180.0) * 0.16;
  float spill = (1.0 - smoothstep(1.0, 3.6, r)) * 0.08;
  return core + body + ring + spill;
}

vec3 shade(vec3 P, vec3 N, vec3 V, Mat m, float ao) {
  ivec2 ci = ivec2(clamp(floor(P.xy + N.xy * 0.35), vec2(0.0), uMap - 1.0));
  float cellAmb = texelFetch(uCells, ci, 0).a;
  vec3 mc = moonCol();
  float amb = (0.003 + cellAmb * 0.028) * ao + uDawn * (0.06 + cellAmb * 0.25) * ao;
  vec3 c = m.a * mc * amb * (0.8 + 0.2 * N.z);
  vec2 mo = moonAt(P);
  // под луной цвет почти не различим: альбедо обесцвечивается (ночное зрение)
  vec3 ma = mix(m.a, vec3(dot(m.a, vec3(0.3, 0.59, 0.11))), 0.65 * (1.0 - uDawn));
  c += ma * mc * (mo.x * max(dot(N, uMoonL), 0.0) * 0.95 + mo.y * max(dot(N, uSkyL), 0.0) * 0.2) * (1.0 + uDawn * 4.0);
  vec3 spc = mix(vec3(1.0), m.a, m.mt);
  if (uFlashI > 0.0) {
    vec3 Lv = uFlashPos - P;
    float d2 = dot(Lv, Lv);
    vec3 L = Lv * inversesqrt(d2);
    float sp = spot(dot(-L, uFlashDir));
    float att = uFlashI * sp / (1.6 + d2 * 0.16 + sqrt(d2) * 0.1);
    float ndl = max(dot(N, L), 0.0);
    vec3 H = normalize(L + V);
    float s = pow(max(dot(N, H), 0.0), m.gl) * m.sp * (m.gl + 8.0) * 0.06;
    c += (m.a * (1.0 - m.mt) * ndl + spc * s * ndl) * flashCol() * att * (1.0 - uUV * 0.72);
    c += m.f * att * uUV * (0.45 + 0.55 * ndl);
  }
  for (int i = 0; i < uNL; i++) {
    vec3 lv = uLP[i].xyz - P;
    float ld2 = dot(lv, lv);
    float r2 = uLP[i].w * uLP[i].w;
    if (ld2 > r2) continue;
    vec3 l = lv * inversesqrt(ld2);
    float cone = smoothstep(uLD[i].w, uLD[i].w + 0.22, dot(-l, uLD[i].xyz));
    float fall = 1.0 - ld2 / r2; fall *= fall;
    float nd = max(dot(N, l), 0.0);
    vec3 hh = normalize(l + V);
    float ss = pow(max(dot(N, hh), 0.0), m.gl) * m.sp * (m.gl + 8.0) * 0.06;
    c += (m.a * (1.0 - m.mt) * nd + spc * ss * nd) * uLC[i].rgb * cone * fall;
  }
  return c + m.e;
}

// ---------- небо за окнами и в фонаре ----------
vec3 sky(vec3 d) {
  float el = d.z;
  vec3 zen = mix(vec3(0.004, 0.009, 0.028), vec3(0.2, 0.24, 0.4), uDawn);
  vec3 hor = mix(vec3(0.028, 0.045, 0.09), vec3(1.1, 0.58, 0.4), uDawn);
  vec3 c = mix(hor, zen, smoothstep(-0.02, 0.5, el));
  float md = max(dot(d, uMoonL), 0.0);
  c += vec3(0.3, 0.42, 0.7) * (pow(md, 24.0) * 0.28 + pow(md, 400.0) * 0.9) * (1.0 - uDawn);
  vec2 cp = d.xy / max(el + 0.2, 0.05) * 1.2 + vec2(uTime * 0.005, 0.0);
  float cl = smoothstep(0.52, 0.86, fbm(cp * 1.5));
  vec3 cc = mix(vec3(0.03, 0.045, 0.08), vec3(0.55, 0.62, 0.8), pow(md, 5.0) * 0.8);
  cc = mix(cc, vec3(1.0, 0.6, 0.55), uDawn);
  c = mix(c, cc, cl * smoothstep(0.0, 0.1, el) * 0.85);
  float disc = smoothstep(0.99962, 0.99972, md);
  c = mix(c, vec3(2.2, 2.2, 2.0) * (0.82 + 0.18 * vn(d.xy * 800.0)), disc * (1.0 - uDawn * 0.7));
  vec2 sp = vec2(atan(d.y, d.x) * 110.0, el * 200.0);
  float st = h12(floor(sp));
  float star = step(0.982, st) * (1.0 - smoothstep(0.0, 0.4, length(fract(sp) - 0.5))) * (1.0 - cl) * (1.0 - uDawn);
  c += vec3(0.8, 0.88, 1.0) * star * (0.4 + 0.6 * h12(floor(sp) + 3.1)) * smoothstep(0.03, 0.2, el);
  // крыши спящего города
  float az = atan(d.y, d.x);
  float roof = 0.02 + 0.035 * step(0.45, fract(az * 5.0 + 0.3)) * vn(vec2(az * 22.0, 0.0)) + 0.028 * vn(vec2(az * 5.0, 3.0));
  roof += 0.05 * (1.0 - smoothstep(0.0, 0.02, abs(fract(az * 1.3) - 0.5)));
  if (el < roof) {
    c = mix(vec3(0.006, 0.008, 0.016), vec3(0.2, 0.13, 0.15), uDawn);
    vec2 wp = vec2(az * 300.0, el * 300.0);
    float lit = step(0.95, h12(floor(wp))) * step(0.35, fract(wp.x)) * step(0.3, fract(wp.y));
    c += vec3(1.0, 0.6, 0.25) * lit * 0.45 * (1.0 - uDawn);
  }
  return c;
}

// ---------- окно ----------
float windowGlass(float s, float z) {
  if (s < 0.235 || s > 0.765 || z < 0.34 || z > 1.6) return 0.0;
  if (abs(s - 0.5) < 0.017) return 0.0;
  if (abs(z - 1.2) < 0.017) return 0.0;
  if (abs(z - 0.76) < 0.013) return 0.0;
  if (z > 1.2 && abs(s - 0.36) < 0.011) return 0.0;
  return 1.0;
}
Mat windowMat(float sf, float z, vec3 P, vec3 eye, inout vec3 N, vec3 T, float fw) {
  Mat m = mk(srgb(vec3(0.62, 0.58, 0.52)));
  vec3 Z = vec3(0.0, 0.0, 1.0);
  // откос проёма чуть темнее
  bool inOpen = sf > 0.2 && sf < 0.8 && z > 0.3 && z < 1.64;
  if (inOpen) {
    m.a = srgb(vec3(0.5, 0.46, 0.4)) * 0.7;
    float g = windowGlass(sf, z);
    if (g > 0.5) {
      vec3 d = normalize(P - eye);
      m.a = vec3(0.0);
      m.e = sky(d) * 0.9;
      m.sp = 0.6; m.gl = 90.0;
    } else if (sf > 0.225 && sf < 0.775 && z > 0.33 && z < 1.61) {
      m.a = srgb(vec3(0.84, 0.82, 0.76)); m.sp = 0.15; m.gl = 30.0;
    }
    if (z < 0.34) { m.a = srgb(vec3(0.78, 0.74, 0.66)); N = normalize(N + Z * 0.6); }
  }
  // портьеры
  float cu = min(abs(sf - 0.2), abs(sf - 0.8));
  float tie = 1.0 - 0.45 * exp(-pow((z - 0.82) / 0.07, 2.0));
  if (cu < 0.075 * tie && z > 0.05 && z < 1.8) {
    float fold = sin(sf * 160.0 + z * 2.0);
    m.a = srgb(vec3(0.34, 0.07, 0.08)) * (0.75 + 0.25 * fold);
    m.e = vec3(0.0);
    m.sp = 0.04; m.gl = 8.0;
    N = normalize(N + T * fold * 0.45);
  }
  if (z > 1.74 && z < 1.8 && sf > 0.1 && sf < 0.9) { m.a = srgb(vec3(0.7, 0.55, 0.25)); m.mt = 1.0; m.sp = 0.6; m.gl = 40.0; m.e = vec3(0.0); }
  return m;
}

// ---------- стены ----------
float damask(vec2 p) {
  vec2 g = p / vec2(0.3, 0.42);
  g.x += 0.5 * mod(floor(g.y), 2.0);
  vec2 q = fract(g) - 0.5;
  q.x = abs(q.x);
  float d1 = q.x * 1.25 + abs(q.y) - 0.36;
  float petal = length((q - vec2(0.11, 0.06)) * vec2(1.0, 0.7)) - 0.075;
  float stem = length((q - vec2(0.0, -0.17)) * vec2(1.4, 1.0)) - 0.05;
  float ring = abs(length(q * vec2(1.0, 0.8)) - 0.2) - 0.016;
  float bud = length(q - vec2(0.0, 0.22)) - 0.045;
  float d = min(min(petal, stem), min(ring, bud));
  return max(1.0 - smoothstep(-0.02, 0.02, d), (1.0 - smoothstep(-0.015, 0.015, abs(d1) - 0.01)) * 0.7);
}

Mat wallMat(int st, float s, float z, float sf, int fl, float cid, inout vec3 N, vec3 T, float fw) {
  vec3 Z = vec3(0.0, 0.0, 1.0);
  Mat m = mk(vec3(0.5));
  float H = uWallH;
  float pf = 1.0 - smoothstep(0.004, 0.02, fw);   // мелкий рисунок гаснет вдали
  if (st == 11) {
    // мраморный пилон с каннелюрами
    float vein = 1.0 - smoothstep(0.0, 0.05, abs(sin(s * 4.0 + z * 2.0 + fbm(vec2(s, z) * 2.2) * 5.0)));
    m.a = srgb(vec3(0.86, 0.84, 0.8)) * (1.0 - 0.18 * vein * pf);
    m.sp = 0.3; m.gl = 40.0;
    float fl2 = cos(sf * PI * 14.0);
    if (z > 0.22 && z < H - 0.3) N = normalize(N + T * sin(sf * PI * 14.0) * 0.22 * pf);
    m.a *= 0.95 + 0.05 * fl2 * pf;
    if (z < 0.22) { m.a = srgb(vec3(0.2, 0.2, 0.19)); if (z > 0.18) N = normalize(N + Z * 0.7); }
    if (z > H - 0.3) { float k = fract((z - (H - 0.3)) / 0.075); N = normalize(N + Z * (k - 0.5) * 1.4); m.a = srgb(vec3(0.88, 0.85, 0.8)); }
    return m;
  }
  if (st == 12) {
    // стеллаж запасника
    float lv = z / 0.46;
    float fz = fract(lv);
    float lvl = floor(lv);
    m.a = srgb(vec3(0.06, 0.055, 0.05));
    if (sf < 0.035 || sf > 0.965) { m.a = srgb(vec3(0.32, 0.3, 0.28)); m.sp = 0.2; m.gl = 30.0; return m; }
    if (fz < 0.07) { m.a = srgb(vec3(0.42, 0.3, 0.2)); if (fz > 0.05) N = normalize(N + Z * 0.8); return m; }
    float slot = floor(sf * 3.0);
    float hs = h12(vec2(cid * 7.13 + slot, lvl * 3.7));
    float ls = fract(sf * 3.0);
    float top = 0.07 + 0.55 + hs * 0.33;
    if (fz < top) {
      if (hs < 0.4 && ls > 0.06 && ls < 0.94) {
        m.a = srgb(vec3(0.55, 0.42, 0.28)) * (0.85 + 0.2 * h12(vec2(cid, slot + lvl)));
        if (abs(fz - top * 0.6) < 0.06 && abs(ls - 0.5) < 0.2) m.a = srgb(vec3(0.85, 0.83, 0.78));
      } else if (hs < 0.72 && ls > 0.1 && ls < 0.9) {
        m.a = srgb(vec3(0.68, 0.66, 0.6)) * (0.8 + 0.2 * sin(ls * 40.0));
      } else if (hs < 0.88) {
        vec2 q = fract(vec2(ls * 4.0, fz * 6.0)) - 0.5;
        float r = length(q);
        m.a = r < 0.42 ? srgb(vec3(0.72, 0.66, 0.54)) * (0.7 + 0.3 * (1.0 - smoothstep(0.1, 0.42, r))) : srgb(vec3(0.05));
      }
    }
    return m;
  }
  if (st == 13) return m;
  if (st == 9) {
    // кирпич
    vec2 b = vec2(s / 0.25, z / 0.068);
    b.x += 0.5 * mod(floor(b.y), 2.0);
    vec2 f = fract(b);
    float mort = min(min(f.x, 1.0 - f.x) * 0.25, min(f.y, 1.0 - f.y) * 0.068);
    float mm = smoothstep(0.004, 0.009 + fw * 0.5, mort);
    vec3 br = srgb(vec3(0.43, 0.22, 0.15)) * (0.75 + 0.45 * h12(floor(b)));
    m.a = mix(srgb(vec3(0.45, 0.43, 0.4)), br, mm) * (0.9 + 0.2 * vn(vec2(s, z) * 20.0));
    N = normalize(N + T * (f.x < 0.04 ? 0.5 : f.x > 0.96 ? -0.5 : 0.0) * pf);
    return m;
  }
  if (st == 10) {
    // мастерская: краска, панель, брызги
    m.a = z < 0.7 ? srgb(vec3(0.33, 0.35, 0.33)) : srgb(vec3(0.55, 0.56, 0.52));
    m.a *= 0.92 + 0.12 * fbm(vec2(s, z) * 3.0);
    vec2 q = vec2(s, z) * 9.0;
    float spl = h12(floor(q));
    if (spl > 0.965 && length(fract(q) - 0.5) < 0.18 && z < 1.3) m.a = srgb(vec3(h12(floor(q) + 1.0), h12(floor(q) + 2.0), h12(floor(q) + 3.0))) * 0.8;
    if (abs(z - 0.7) < 0.012) m.a = srgb(vec3(0.2));
    return m;
  }
  if (st == 0 || st == 14 || st == 15) {
    // известняковые блоки вестибюля (и откосы проёмов)
    vec3 stone = srgb(vec3(0.72, 0.67, 0.58));
    if (st == 15) { m.a = srgb(vec3(0.44, 0.4, 0.35)) * (0.92 + 0.1 * fbm(vec2(s, z) * 5.0)); m.sp = 0.04; return m; }
    float rowH = 0.3;
    float row = floor(z / rowH);
    float bx = s / 0.62 + 0.5 * mod(row, 2.0);
    vec2 f = vec2(fract(bx), fract(z / rowH));
    float jx = min(f.x, 1.0 - f.x) * 0.62, jz = min(f.y, 1.0 - f.y) * rowH;
    float joint = min(jx, jz);
    m.a = stone * (0.88 + 0.16 * h12(vec2(floor(bx), row))) * (0.93 + 0.1 * fbm(vec2(s, z) * 6.0));
    float jm = smoothstep(0.003, 0.012 + fw, joint);
    m.a *= mix(0.45, 1.0, jm);
    if (jz < 0.02) N = normalize(N + Z * (f.y < 0.5 ? -0.6 : 0.6) * (1.0 - jm) * pf);
    if (jx < 0.02) N = normalize(N + T * (f.x < 0.5 ? -0.6 : 0.6) * (1.0 - jm) * pf);
    m.sp = 0.05; m.gl = 12.0;
    if (z < 0.25) m.a *= 0.62;
    if (z > H - 0.24) { float k = fract((z - (H - 0.24)) / 0.06); N = normalize(N + Z * (k - 0.5) * 1.3); m.a = stone * 1.05; }
  } else if (st == 7) {
    m.a = srgb(vec3(0.84, 0.83, 0.8)) * (0.97 + 0.04 * vn(vec2(s, z) * 12.0));
    m.sp = 0.03;
    if (z < 0.05) m.a = srgb(vec3(0.08));
  } else {
    // классический зал: плинтус, панель, поручень, обивка, карниз
    vec3 field, wood = srgb(vec3(0.24, 0.15, 0.1));
    if (st == 1) field = srgb(vec3(0.44, 0.07, 0.09));
    else if (st == 2) field = srgb(vec3(0.16, 0.28, 0.2));
    else if (st == 3) field = srgb(vec3(0.2, 0.27, 0.35));
    else if (st == 4) field = srgb(vec3(0.05, 0.045, 0.06));
    else if (st == 5) field = srgb(vec3(0.3, 0.08, 0.15));
    else if (st == 6) field = srgb(vec3(0.38, 0.35, 0.19));
    else field = srgb(vec3(0.55, 0.53, 0.6));
    if (st == 8) wood = srgb(vec3(0.74, 0.72, 0.68));
    if (st == 4) wood = srgb(vec3(0.035, 0.03, 0.035));
    float rail0 = 0.36, rail1 = 0.405, cor = H - 0.2;
    if (z < 0.075) {
      m.a = wood * 0.6; m.sp = 0.1; m.gl = 30.0;
      if (z > 0.058) N = normalize(N + Z * 0.8);
    } else if (z < rail0) {
      float pu = fract(s / 0.95);
      float pz = (z - 0.075) / (rail0 - 0.075);
      float e = min(min(pu, 1.0 - pu) * 0.95, min(pz, 1.0 - pz) * 0.285);
      m.a = wood * (0.9 + 0.2 * vn(vec2(s * 3.0, z * 40.0)));
      m.sp = 0.12; m.gl = 26.0;
      if (e < 0.035) { float k = e / 0.035; N = normalize(N + (pu < 0.5 && e == pu * 0.95 ? -T : pu >= 0.5 && e == (1.0 - pu) * 0.95 ? T : pz < 0.5 ? -Z : Z) * (1.0 - k) * 0.7 * pf); m.a *= 0.85; }
    } else if (z < rail1) {
      float t = (z - rail0) / (rail1 - rail0);
      N = normalize(N + Z * cos(t * PI) * 0.9);
      m.a = wood * 1.15; m.sp = 0.2; m.gl = 30.0;
    } else if (z < cor) {
      m.a = field;
      if (st == 1 || st == 5) {
        float dm = damask(vec2(s, z)) * pf;
        m.a = field * (1.0 + 0.16 * dm) * (0.94 + 0.08 * vn(vec2(s, z) * 30.0));
        m.sp = 0.05 + 0.25 * dm; m.gl = 12.0 + 18.0 * dm;
      } else if (st == 4) {
        m.a = field * (0.9 + 0.2 * vn(vec2(s, z) * 60.0));
        m.sp = 0.0;
      } else {
        m.a = field * (0.9 + 0.16 * fbm(vec2(s, z) * 3.5)) * (0.97 + 0.05 * sin(s * 70.0 + vn(vec2(s, z) * 8.0) * 4.0) * pf);
        m.sp = 0.025;
      }
    } else {
      float t = (z - cor) / 0.2;
      vec3 pl = st == 4 ? srgb(vec3(0.06)) : srgb(vec3(0.8, 0.76, 0.66));
      m.a = pl;
      float k = fract(t * 4.0);
      N = normalize(N + Z * (k - 0.5) * 1.2);
      if (abs(t - 0.5) < 0.06) { m.a = srgb(vec3(0.75, 0.56, 0.24)); m.mt = 1.0; m.sp = 0.5; m.gl = 40.0; }
      m.sp = max(m.sp, 0.06);
    }
  }
  // наличники у дверных проёмов
  bool lo = (fl & 1) != 0 && sf < 0.11, hi = (fl & 2) != 0 && sf > 0.89;
  if ((lo || hi) && z < uDoorH + 0.11 && st != 11) {
    float t = lo ? sf / 0.11 : (1.0 - sf) / 0.11;
    m.a = st == 4 ? srgb(vec3(0.05)) : st == 7 ? srgb(vec3(0.86, 0.85, 0.82)) : srgb(vec3(0.62, 0.58, 0.5));
    m.sp = 0.1; m.gl = 25.0; m.mt = 0.0;
    float prof = fract(t * 3.0);
    N = normalize(N + T * (lo ? 1.0 : -1.0) * (prof - 0.5) * 1.1);
  }
  // красный огонёк датчика движения
  if (h12(vec2(cid, 5.0)) < 0.07 && st != 7) {
    float d = length(vec2((sf - 0.5) * 1.0, z - (H - 0.3)));
    if (d < 0.03) { m.a = srgb(vec3(0.15)); if (d < 0.009) m.e = vec3(1.2, 0.05, 0.03) * (0.4 + 0.6 * step(0.5, fract(uTime * 0.5 + cid * 0.37))); }
  }
  return m;
}

// ---------- рамы и картины ----------
float frameProf(float t, int st) {
  if (st == 0) return 0.55 * bump(t, 0.07, 0.07) + 0.3 + 0.28 * bump(t, 0.38, 0.2) - 0.22 * bump(t, 0.64, 0.07) + 0.75 * bump(t, 0.8, 0.1) + 0.25 * bump(t, 0.95, 0.05);
  if (st == 1) return 0.45 * bump(t, 0.12, 0.12) + 0.25 + 0.6 * bump(t, 0.62, 0.3);
  if (st == 4) return 0.4 * bump(t, 0.18, 0.18) + 0.55 * bump(t, 0.66, 0.34);
  if (st == 5) return 0.5 * bump(t, 0.3, 0.3) + 0.35 * bump(t, 0.82, 0.18);
  return 0.5 + 0.3 * bump(t, 0.5, 0.5);
}
float frameW(int st) { return st == 0 ? 0.085 : st == 1 ? 0.056 : st == 2 ? 0.024 : st == 3 ? 0.0 : st == 4 ? 0.05 : 0.045; }

// Возвращает true, если точка стены (s, z) попала в картину, раму, этикетку или лампу.
bool decal(vec4 g, vec4 p, float s, float z, bool flip, float dist, float cosv, inout Mat m, inout vec3 N, vec3 T, float fw, bool cheap, inout float shadow) {
  if (g.y <= g.x) return false;
  int fst = int(p.y + 0.5);
  int state = int(p.z + 0.5);
  int flags = int(p.w + 0.5);
  float fwid = frameW(fst);
  if (state == 3) fwid = 0.0;
  vec3 Z = vec3(0.0, 0.0, 1.0);
  float cw = g.y - g.x, ch = g.w - g.z;
  // этикетка справа от зрителя
  if ((flags & 1) != 0 && state != 3 && state != 4) {
    float l0 = flip ? g.x - fwid - 0.2 : g.y + fwid + 0.07;
    float l1 = l0 + 0.13;
    float lz0 = 0.5, lz1 = 0.575;
    if (s > l0 && s < l1 && z > lz0 && z < lz1) {
      float u = (s - l0) / 0.13, v = (z - lz0) / 0.075;
      if (flip) u = 1.0 - u;
      m = mk(srgb(vec3(0.8, 0.77, 0.7)));
      m.sp = 0.05;
      float line = 0.0;
      for (int k = 0; k < 4; k++) {
        float yy = 0.78 - float(k) * 0.18;
        float len = 0.5 + 0.4 * h12(vec2(g.x * 13.0, float(k)));
        if (k == 1) len = 0.8;
        line = max(line, step(abs(v - yy), k == 1 ? 0.045 : 0.03) * step(0.1, u) * step(u, 0.1 + len * 0.8));
      }
      m.a *= 1.0 - line * 0.75 * (1.0 - smoothstep(0.004, 0.015, fw));
      if (state == 1 && v > 0.84) m.a = srgb(vec3(0.62, 0.1, 0.07));
      m.f = vec3(0.45, 0.55, 1.0) * 0.9;
      return true;
    }
  }
  // лампа над картиной
  if (state == 2) {
    float c = (g.x + g.y) * 0.5, lw = cw * 0.28;
    float lz = g.w + fwid + 0.075;
    if (abs(s - c) < lw && abs(z - lz) < 0.018) {
      m = mk(srgb(vec3(0.72, 0.55, 0.26)));
      m.mt = 1.0; m.sp = 0.8; m.gl = 50.0;
      N = normalize(N + Z * (z - lz) / 0.018 * 1.2);
      if (z < lz - 0.004) m.e = vec3(1.6, 1.15, 0.7) * 0.8;
      return true;
    }
    if (abs(s - c) < 0.008 && z > lz && z < lz + 0.07) { m = mk(srgb(vec3(0.6, 0.45, 0.2))); m.mt = 1.0; m.sp = 0.6; m.gl = 40.0; return true; }
  }
  float ox0 = g.x - fwid, ox1 = g.y + fwid, oz0 = g.z - fwid, oz1 = g.w + fwid;
  // тень рамы на стене
  float dout = max(max(ox0 - s, s - ox1), max(oz0 - z, z - oz1));
  if (dout > 0.0) {
    if (state != 4) shadow = min(shadow, mix(0.55, 1.0, smoothstep(0.0, 0.07, dout + (z < oz0 ? 0.0 : 0.02))));
    return false;
  }
  if (state == 4) {
    // пустое место: только гвоздь
    float c = (g.x + g.y) * 0.5;
    if (length(vec2(s - c, z - (g.w - 0.03))) < 0.008) { m = mk(srgb(vec3(0.3))); m.mt = 1.0; m.sp = 0.5; return true; }
    return false;
  }
  bool inCanvas = s > g.x && s < g.y && z > g.z && z < g.w;
  if (!inCanvas) {
    // рама: профиль по сечению и резьба вдоль
    float dl = s - ox0, dr = ox1 - s, db = z - oz0, dt = oz1 - z;
    float dmin = min(min(dl, dr), min(db, dt));
    float t = dmin / fwid;
    vec3 inward = dmin == dl ? T : dmin == dr ? -T : dmin == db ? Z : -Z;
    float along = (dmin == dl || dmin == dr) ? z : s;
    float h = frameProf(t, fst);
    float h2 = frameProf(t + 0.03, fst);
    float orn = 0.0;
    if (fst == 0 && t > 0.2 && t < 0.58 && !cheap) orn = (sin(along * 95.0) * 0.5 + 0.5) * sin((t - 0.2) / 0.38 * PI) * 0.35;
    float dh = (h2 - h) / 0.03 + (fst == 0 ? cos(along * 95.0) * orn * 2.0 : 0.0);
    N = normalize(N - inward * dh * 0.22);
    if (fst == 0 && !cheap) N = normalize(N + (inward.z != 0.0 ? T : Z) * cos(along * 95.0) * orn * 0.8);
    vec3 gold = srgb(vec3(0.86, 0.66, 0.34));
    if (fst == 2) { m = mk(srgb(vec3(0.03))); m.sp = 0.25; m.gl = 30.0; }
    else if (fst == 4) { m = mk(srgb(vec3(0.28, 0.16, 0.09)) * (0.8 + 0.3 * h)); m.sp = 0.25; m.gl = 30.0; }
    else if (fst == 5) { m = mk(srgb(vec3(0.72, 0.72, 0.7)) * (0.7 + 0.35 * h)); m.mt = 1.0; m.sp = 0.7; m.gl = 45.0; }
    else {
      float patina = 0.8 + 0.25 * vn(vec2(along, t) * vec2(30.0, 3.0));
      m = mk(gold * (0.45 + 0.6 * (h + orn)) * patina);
      m.mt = 1.0; m.sp = 0.9; m.gl = 38.0;
    }
    return true;
  }
  float u = (s - g.x) / cw, v = 1.0 - (z - g.z) / ch;
  if (flip) u = 1.0 - u;
  int layer = int(floor(p.x + 0.5));
  if (state == 1) {
    // вырезанный холст: пустая рама, светлый прямоугольник невыцветшей обивки и лохмотья по краю
    float edge = min(min(u, 1.0 - u) * cw, min(v, 1.0 - v) * ch);
    float rag = 0.01 + 0.012 * vn(vec2((u + v) * 60.0, u * 7.0 - v * 5.0));
    if (edge < rag && layer >= 0) {
      vec3 pc = paintTex(layer, vec2(clamp(u, 0.01, 0.99), clamp(v, 0.01, 0.99)), 3.0);
      m = mk(pc * 0.8);
      m.sp = 0.1; m.gl = 30.0;
      N = normalize(N + (u < 0.5 ? T : -T) * 0.4);
      return true;
    }
    shadow = min(shadow, 0.75 + 0.25 * smoothstep(0.0, 0.05, edge));
    m.a *= 1.18;
    return false;
  }
  if (state == 3) {
    float edge = min(min(u, 1.0 - u) * cw, min(v, 1.0 - v) * ch);
    if (edge < 0.004 + 0.006 * vn(vec2((u + v) * 70.0, 3.0))) return false;
  }
  if (layer < 0) {
    m = mk(srgb(vec3(0.16, 0.14, 0.12)));
    return true;
  }
  // живопись: мип-уровень по размеру пикселя, рельеф мазков из яркости, плетение холста, лак
  float px = dist / uFocal;
  float tpu = 256.0 / min(cw, ch);
  float lod = log2(max(px * tpu * mix(1.0, 1.0 / max(cosv, 0.2), 0.5), 1e-4)) + (cheap ? 1.5 : 0.0);
  vec2 uv = vec2(u, v);
  vec3 pc = paintTex(layer, uv, lod);
  m = mk(pc);
  m.sp = 0.02; m.gl = 900.0;
  m.f = vec3(0.3, 0.42, 0.12) * 0.35 + pc * 0.1;
  if (!cheap) {
    float e = (layer >= 1000 ? 1.25 / 512.0 : 1.25 / 256.0);
    float l0 = dot(pc, vec3(0.3, 0.59, 0.11));
    float lu = dot(paintTex(layer, uv + vec2(e, 0.0), lod), vec3(0.3, 0.59, 0.11));
    float lv = dot(paintTex(layer, uv + vec2(0.0, e), lod), vec3(0.3, 0.59, 0.11));
    float k = 2.2 * (1.0 - smoothstep(-1.0, 1.5, lod));
    vec3 tu = flip ? -T : T;
    N = normalize(N - tu * (lu - l0) * k * 6.0 + Z * (lv - l0) * k * 6.0);
    float wv = (1.0 - smoothstep(0.0008, 0.0025, fw));
    if (wv > 0.0) {
      vec2 th = vec2(s, z) * 1400.0;
      float weave = sin(th.x) * sin(th.y);
      N = normalize(N + (T * cos(th.x) + Z * cos(th.y)) * 0.06 * wv);
      m.a *= 1.0 + weave * 0.05 * wv;
    }
  }
  return true;
}

// ---------- пол ----------
vec4 herring(vec2 p, float n) {
  vec2 c = floor(p);
  float d = c.x - c.y;
  float dd = d - 2.0 * n * floor((d + n) / (2.0 * n));
  vec2 o; float al, ac, orr;
  if (dd >= 0.0) { o = c - vec2(dd, 0.0); al = (p.x - o.x) / n; ac = fract(p.y); orr = 0.0; }
  else { float k = -dd; o = c - vec2(0.0, k - 1.0); al = (p.y - o.y) / n; ac = fract(p.x); orr = 1.0; }
  return vec4(al, ac, h12(o * 0.7310 + orr * 17.0), orr);
}
Mat floorMat(vec3 P, float fw, int fm, int hall, inout vec3 N, out float refl, bool cheap) {
  Mat m = mk(vec3(0.4));
  refl = 0.0;
  vec2 p = P.xy;
  if (fm == 0 || fm == 4 || fm == 6) {
    vec2 r = mat2(0.7071, 0.7071, -0.7071, 0.7071) * p / 0.074;
    vec4 hb = herring(r, 4.0);
    float ea = min(hb.x, 1.0 - hb.x) * 4.0 * 0.074;
    float eb = min(hb.y, 1.0 - hb.y) * 0.074;
    float edge = min(ea, eb);
    float gw = 0.0022 + fw * 0.6;
    float groove = smoothstep(gw * 0.5, gw * 1.5, edge);
    vec3 wa, wb;
    if (fm == 0) { wa = srgb(vec3(0.5, 0.32, 0.17)); wb = srgb(vec3(0.66, 0.45, 0.25)); }
    else if (fm == 4) { wa = srgb(vec3(0.2, 0.12, 0.07)); wb = srgb(vec3(0.3, 0.19, 0.11)); }
    else { wa = srgb(vec3(0.66, 0.52, 0.34)); wb = srgb(vec3(0.78, 0.64, 0.44)); }
    vec3 w = mix(wa, wb, hb.z);
    float gr = cheap ? 0.5 : vn(vec2(hb.x * 9.0 + hb.z * 30.0, hb.y * 3.0 + hb.z * 7.0)) * 0.6 + vn(vec2(hb.x * 40.0, hb.y * 14.0 + hb.z * 11.0)) * 0.4;
    float pf = 1.0 - smoothstep(0.004, 0.03, fw);
    w *= mix(1.0, 0.8 + 0.4 * gr, pf);
    m.a = w * mix(0.3, 1.0, mix(1.0, groove, pf));
    m.sp = 0.22; m.gl = 60.0;
    refl = (fm == 4 ? 0.4 : 0.48) * mix(0.35, 1.0, groove);
  } else if (fm == 1) {
    vec2 q = mat2(0.7071, 0.7071, -0.7071, 0.7071) * p / 0.42;
    vec2 f = fract(q);
    float chk = mod(floor(q.x) + floor(q.y), 2.0);
    float vein = 1.0 - smoothstep(0.0, 0.07, abs(sin(p.x * 2.6 + p.y * 1.3 + fbm(p * 2.4) * 6.0)));
    vec3 wm = srgb(vec3(0.82, 0.8, 0.76)) * (1.0 - 0.22 * vein);
    vec3 bm = srgb(vec3(0.05, 0.05, 0.055)) + vec3(0.02) * vein;
    m.a = mix(wm, bm, chk);
    float j = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)) * 0.42;
    m.a *= mix(0.5, 1.0, smoothstep(0.001, 0.004 + fw, j));
    m.sp = 0.5; m.gl = 90.0;
    refl = 0.85;
  } else if (fm == 2) {
    m.a = srgb(vec3(0.34, 0.33, 0.31)) * (0.8 + 0.3 * fbm(p * 1.7)) * (0.95 + 0.1 * vn(p * 40.0));
    m.sp = 0.04;
    refl = 0.08;
  } else if (fm == 3) {
    m.a = srgb(vec3(0.5, 0.49, 0.47)) * (0.88 + 0.18 * fbm(p * 1.2));
    m.sp = 0.3; m.gl = 70.0;
    refl = 0.5;
  } else {
    // мраморный порог проёма
    m.a = srgb(vec3(0.72, 0.7, 0.66)) * (0.9 + 0.15 * fbm(p * 5.0));
    m.sp = 0.4; m.gl = 80.0;
    refl = 0.6;
  }
  // ковровые дорожки: южная анфилада и ось вестибюля
  bool enf = abs(p.y - 21.5) < 0.34 && (hall == 1 || hall == 4 || hall == 5 || hall == 7 || hall == 8);
  bool ves = hall == 1 && abs(p.x - 18.5) < 0.34 && p.y > 18.0;
  if (enf || ves) {
    float across = enf ? abs(p.y - 21.5) : abs(p.x - 18.5);
    float along = enf ? p.x : p.y;
    vec3 red = srgb(vec3(0.36, 0.05, 0.06));
    m.a = red * (0.85 + 0.2 * vn(vec2(along * 60.0, across * 60.0)));
    if (abs(across - 0.28) < 0.02) m.a = srgb(vec3(0.6, 0.45, 0.18));
    if (across > 0.31) m.a = srgb(vec3(0.2, 0.03, 0.04));
    m.sp = 0.02; m.gl = 6.0;
    refl = 0.0;
  }
  // УФ-следы вора: светятся только в ультрафиолете
  float tr = textureLod(uTrail, p / uMap, log2(max(fw * 32.0, 1e-3))).r;
  m.f = vec3(0.25, 1.0, 0.72) * tr * 2.4;
  // осколки стекла под фонарём
  vec2 gd = p - uGlint.xy;
  if (dot(gd, gd) < uGlint.z * uGlint.z && !cheap) {
    vec2 q = p * 34.0;
    float hs = h12(floor(q));
    if (hs > 0.93) {
      vec2 lp = fract(q) - vec2(h12(floor(q) + 1.3), h12(floor(q) + 2.7));
      if (length(lp) < 0.14) {
        m.a = vec3(0.6); m.sp = 3.0; m.gl = 300.0;
        N = normalize(vec3((h12(floor(q) + 4.0) - 0.5) * 0.9, (h12(floor(q) + 5.0) - 0.5) * 0.9, 1.0));
        refl = 0.0;
      }
    }
  }
  return m;
}

// ---------- потолок ----------
Mat ceilMat(vec3 P, vec3 eye, int hall, inout vec3 N, float fw) {
  vec2 p = P.xy;
  Mat m = mk(srgb(vec3(0.62, 0.58, 0.5)));
  float skyE = min(min(p.x - uSky.x, uSky.z - p.x), min(p.y - uSky.y, uSky.w - p.y));
  if (skyE > -0.16 && skyE <= 0.0) {
    // карниз вокруг фонаря
    m = mk(srgb(vec3(0.7, 0.66, 0.58)));
    m.sp = 0.08;
    return m;
  }
  if (skyE > 0.0) {
    vec2 f = fract(p * 2.0);
    float bar = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
    vec2 cell = floor(p * 2.0);
    bool broken = cell == floor(vec2(18.25, 13.75) * 2.0);
    if (bar < 0.03 || skyE < 0.04) { m = mk(srgb(vec3(0.07))); m.sp = 0.3; m.gl = 30.0; return m; }
    if (broken) {
      vec2 q = f - 0.5;
      float sh = vn(vec2(atan(q.y, q.x) * 3.0, 1.0));
      if (length(q) > 0.3 + 0.18 * sh) { m = mk(vec3(0.0)); m.e = sky(normalize(P - eye)) * 0.55 + vec3(0.02, 0.03, 0.04); m.sp = 1.0; m.gl = 80.0; return m; }
      m = mk(vec3(0.0)); m.e = sky(normalize(P - eye)); return m;
    }
    // матовое стекло: ровное лунное свечение, по стёклам — пятна пыли
    m = mk(vec3(0.0));
    float pane = h12(cell);
    vec3 glow = mix(vec3(0.022, 0.032, 0.056), vec3(0.5, 0.36, 0.34), uDawn);
    m.e = glow * (0.75 + 0.35 * pane) * (0.85 + 0.3 * fbm(p * 3.0)) + sky(normalize(P - eye)) * 0.08;
    m.sp = 0.8; m.gl = 60.0;
    return m;
  }
  if (hall == 10 || hall == 11) {
    m.a = srgb(vec3(0.4, 0.4, 0.38)) * (0.9 + 0.2 * fbm(p));
    vec2 f = fract(p * vec2(0.5, 1.0));
    if (abs(f.x - 0.5) < 0.22 && abs(f.y - 0.5) < 0.05) { m.a = srgb(vec3(0.7, 0.72, 0.72)); m.sp = 0.3; }
    return m;
  }
  vec2 q = fract(p / 0.62);
  float e = min(min(q.x, 1.0 - q.x), min(q.y, 1.0 - q.y));
  float pf = 1.0 - smoothstep(0.01, 0.04, fw);
  m.a *= 0.55;
  if (e < 0.12) {
    float k = e / 0.12;
    vec3 dir = q.x < 0.12 ? vec3(1, 0, 0) : q.x > 0.88 ? vec3(-1, 0, 0) : q.y < 0.12 ? vec3(0, 1, 0) : vec3(0, -1, 0);
    N = normalize(N + dir * (k - 0.5) * 0.5 * pf);
  } else {
    m.a *= 0.82;
    float r = length(q - 0.5);
    if (r < 0.1) { m.a = srgb(vec3(0.75, 0.58, 0.28)) * (0.6 + 0.4 * sin(atan(q.y - 0.5, q.x - 0.5) * 8.0)); m.mt = 1.0; m.sp = 0.5; m.gl = 30.0; }
  }
  if (hall == 5) m.a *= 0.15;
  return m;
}

// ---------- слои предметов ----------
// Смешивает слои поверх текущего цвета. a, b задают высоту луча z(d) = a + b·d.
// Цикл с uniform-границей: компилятор не разворачивает его, шейдер собирается быстро.
void layers(float a, float b, vec2 rd, vec3 eye, bool cheap, inout vec3 col, inout float tHit, inout int surf) {
  for (int i = 0; i < uMaxL; i++) {
    vec4 L0 = C(5 + i * 2);
    if (L0.z < 0.5) break;
    vec4 L1 = C(6 + i * 2);
    int kind = int(L0.z + 0.5);
    float d = L0.x;
    vec3 P = vec3(0.0), N = vec3(0.0, 0.0, 1.0);
    Mat m = mk(vec3(0.0));
    float alpha = 1.0, ao = 1.0, td = d;
    bool ok = false;
    if (kind == 3) {
      // перемычка над проёмом: лицевая грань и нижняя плоскость
      float zf = a + b * d;
      int code = int(L1.z + 0.5) / 16;
      int wst = int(L1.z + 0.5) - code * 16;
      N = code == 0 ? vec3(-1, 0, 0) : code == 1 ? vec3(1, 0, 0) : code == 2 ? vec3(0, -1, 0) : vec3(0, 1, 0);
      vec3 T = code < 2 ? vec3(0, 1, 0) : vec3(1, 0, 0);
      if (zf >= uDoorH && zf <= uWallH) {
        vec2 hp = uPos + rd * d;
        P = vec3(hp, zf);
        float s = code < 2 ? hp.y : hp.x;
        float sf = fract(s);
        m = wallMat(wst, s, zf, sf, 0, 0.0, N, T, d / uFocal);
        if (zf < uDoorH + 0.11) {
          float t = (zf - uDoorH) / 0.11;
          m.a = wst == 4 ? srgb(vec3(0.05)) : srgb(vec3(0.62, 0.58, 0.5));
          m.mt = 0.0; m.sp = 0.1; m.gl = 25.0;
          N = normalize(N + vec3(0, 0, 1) * (fract(t * 3.0) - 0.5) * 1.1);
        }
        if (L1.w > 0.5 && abs(sf - 0.5) < 0.2 && zf > uDoorH + 0.14 && zf < uDoorH + 0.28) {
          vec2 uv = vec2((sf - 0.3) / 0.4, (uDoorH + 0.28 - zf) / 0.14 * 0.25);
          if (code == 2 || code == 1) uv.x = 1.0 - uv.x;
          vec3 sg = textureLod(uSpr, vec3(uv, 10.0), 0.0).rgb;
          m = mk(sg * 0.2); m.e = sg * 0.9;
        }
        ok = true;
      } else if (b > 0.0) {
        float ds = (uDoorH - a) / b;
        if (ds >= d && ds <= L0.y) {
          P = vec3(uPos + rd * ds, uDoorH);
          N = vec3(0.0, 0.0, -1.0);
          m = mk(srgb(vec3(0.6, 0.57, 0.5)) * 0.8);
          ao = 0.7; td = ds; ok = true;
        }
      }
    } else {
      float z = a + b * d;
      if (z < L1.x || z > L1.y) continue;
      float v = 1.0 - (z - L1.x) / (L1.y - L1.x);
      float u = L0.y;
      int tex = int(L0.w + 0.5);
      int fl = tex / 256;
      tex -= fl * 256;
      P = vec3(uPos + rd * d, z);
      if (kind == 1) {
        vec4 tx = textureLod(uSpr, vec3(u, v, float(tex)), log2(max(d / uFocal * 256.0 / max(L1.y - L1.x, 0.3), 1e-3)));
        alpha = smoothstep(0.35, 0.6, tx.a);
        if (alpha < 0.01) continue;
        vec3 fwd = vec3(-uDir, 0.0);
        vec3 rt = vec3(uRight, 0.0);
        float bx = (u - 0.5) * 1.7;
        N = normalize(fwd * sqrt(max(1.0 - bx * bx * 0.6, 0.05)) + rt * bx * 0.8 + vec3(0.0, 0.0, 0.15));
        m = mk(tx.rgb);
        int mt = int(L1.z + 0.5);
        if (mt == 1) { m.sp = 0.2; m.gl = 30.0; m.f = vec3(0.35, 0.4, 0.6) * 0.5; }
        else if (mt == 2) { m.mt = 1.0; m.sp = 0.8; m.gl = 40.0; }
        else if (mt == 3) { m.sp = 0.15; m.gl = 30.0; }
        else if (mt == 4) { m.sp = 0.35; m.gl = 30.0; }
      } else {
        float nang = L1.w;
        N = vec3(cos(nang), sin(nang), 0.0);
        bool back = (fl & 1) != 0;
        if (back) N = -N;
        if ((fl & 16) != 0) {
          // бархатный шнур на столбиках
          float zc = L1.y - 0.03 - 0.1 * 4.0 * u * (1.0 - u);
          float dz = abs(z - zc);
          if (dz > 0.013) continue;
          m = mk(srgb(vec3(0.42, 0.04, 0.06)));
          m.sp = 0.1; m.gl = 10.0;
          N = normalize(N + vec3(0, 0, 1) * (zc - z) / 0.013 * 0.9);
        } else if ((fl & 2) != 0) {
          // холст: лицо с живописью или изнанка с подрамником
          if ((fl & 4) != 0) {
            float edge = min(min(u, 1.0 - u), min(v, 1.0 - v));
            if (edge < 0.012 + 0.014 * vn(vec2((u + v) * 50.0, 2.0))) continue;
          }
          if (back) {
            m = mk(srgb(vec3(0.6, 0.52, 0.4)) * (0.9 + 0.1 * sin(u * 900.0) * sin(v * 900.0)));
            float bar = min(min(u, 1.0 - u), min(v, 1.0 - v));
            if (bar < 0.07 || abs(u - 0.5) < 0.03) m.a = srgb(vec3(0.46, 0.33, 0.2));
          } else {
            float lod = log2(max(d / uFocal * 256.0 / max(L1.y - L1.x, 0.2), 1e-4)) + (cheap ? 1.5 : 0.0);
            int pl = tex >= 250 ? 1000 + tex - 250 : tex;
            vec3 pc = (fl & 32) != 0 ? srgb(vec3(0.5, 0.45, 0.38)) : paintTex(pl, vec2(u, v), lod);
            m = mk(pc);
            m.sp = 0.02; m.gl = 900.0;
            m.f = vec3(0.3, 0.42, 0.12) * 0.3;
            if ((fl & 8) != 0) {
              // следы растворителя с перчаток вора
              float hp2 = smoothstep(0.62, 0.8, fbm(vec2(u, v) * vec2(7.0, 5.0) + float(tex))) * (1.0 - smoothstep(0.05, 0.35, min(u, 1.0 - u)));
              m.f += vec3(0.2, 1.0, 0.8) * hp2 * 2.0;
            }
          }
        } else {
          vec4 tx = textureLod(uSpr, vec3(back ? 1.0 - u : u, v, float(tex)), log2(max(d / uFocal * 256.0 / max(L1.y - L1.x, 0.3), 1e-3)));
          alpha = smoothstep(0.35, 0.6, tx.a);
          if (alpha < 0.01) continue;
          m = mk(tx.rgb); m.sp = 0.15; m.gl = 30.0;
        }
      }
      ok = true;
    }
    if (!ok) continue;
    vec3 lc = shade(P, N, normalize(eye - P), m, ao);
    col = mix(col, lc, alpha);
    tHit = td; surf = 3;
  }
}

// ---------- трассировка столбца ----------
// Высота луча на перпендикулярном расстоянии d: z = a + b·d (для отражения a, b зеркальны).
vec3 trace(float a, float b, vec2 rd, bool cheap, out float tHit, out int surf, out float refl) {
  vec3 eye = vec3(uPos, a);
  vec4 c0 = C(0);
  float dW = c0.x;
  float zW = a + b * dW;
  refl = 0.0;
  surf = 0;
  vec3 P = vec3(0.0), N = vec3(0.0, 0.0, 1.0);
  Mat m = mk(vec3(0.0));
  float ao = 1.0, post = 1.0;
  if (zW >= 0.0 && zW <= uWallH) {
    vec2 hp = uPos + rd * dW;
    P = vec3(hp, zW);
    int st = int(c0.y + 0.5);
    int cf = int(c0.z + 0.5);
    int code = cf - (cf / 4) * 4;
    int fl = cf / 4;
    N = code == 0 ? vec3(-1, 0, 0) : code == 1 ? vec3(1, 0, 0) : code == 2 ? vec3(0, -1, 0) : vec3(0, 1, 0);
    vec3 T = code < 2 ? vec3(0, 1, 0) : vec3(1, 0, 0);
    float s = code < 2 ? hp.y : hp.x;
    float sf = fract(s);
    bool flip = code == 2 || code == 1;
    float cosv = abs(dot(normalize(eye - P), N));
    float fw = dW / uFocal * (cheap ? 3.0 : 1.0);
    if (st == 13) m = windowMat(sf, zW, P, eye, N, T, fw);
    else m = wallMat(st, s, zW, sf, fl, c0.w, N, T, fw);
    if (st == 14) {
      // парадная дверь и табличка «ВЫХОД»
      if (sf > 0.12 && sf < 0.88 && zW < 1.22) {
        m = mk(srgb(vec3(0.3, 0.17, 0.09)));
        m.sp = 0.15; m.gl = 30.0;
        float pu = fract((sf - 0.12) / 0.38), pz = fract(zW / 0.4);
        float e = min(min(pu, 1.0 - pu), min(pz, 1.0 - pz));
        if (e < 0.08) { N = normalize(N + T * 0.3 * (pu < 0.5 ? -1.0 : 1.0)); m.a *= 0.8; }
        if (abs(sf - 0.5) < 0.006) m.a = vec3(0.01);
        if (abs(sf - 0.5) < 0.04 && abs(zW - 0.55) < 0.03 && abs(sf - 0.5) > 0.012) { m.a = srgb(vec3(0.8, 0.62, 0.3)); m.mt = 1.0; m.sp = 0.8; }
      }
      if (sf > 0.3 && sf < 0.7 && zW > 1.34 && zW < 1.48) {
        vec2 uv = vec2((sf - 0.3) / 0.4, (1.48 - zW) / 0.14 * 0.25);
        if (flip) uv.x = 1.0 - uv.x;
        vec3 sg = textureLod(uSpr, vec3(uv, 10.0), 0.0).rgb;
        m = mk(sg * 0.2); m.e = sg * 0.9;
      }
    }
    float shadow = 1.0;
    if (st != 13) {
      Mat dm = m;
      vec3 dn = N;
      bool hit = false;
      for (int k = 0; k < uTwo; k++) {
        hit = decal(C(1 + k * 2), C(2 + k * 2), s, zW, flip, dW, cosv, dm, dn, T, fw, cheap, shadow);
        if (hit) break;
      }
      if (hit) { m = dm; N = dn; shadow = 1.0; }
      else m.a = dm.a;
    }
    ao = shadow * mix(0.55, 1.0, smoothstep(0.0, 0.25, zW)) * mix(0.7, 1.0, smoothstep(0.0, 0.12, uWallH - zW));
    post = mix(1.0, shadow, 0.6);
    tHit = dW;
  } else if (zW < 0.0) {
    float dF = -a / b;
    vec2 hp = uPos + rd * dF;
    P = vec3(hp, 0.0);
    ivec2 ci = ivec2(clamp(floor(hp), vec2(0.0), uMap - 1.0));
    vec4 cell = texelFetch(uCells, ci, 0);
    int fm = int(cell.b * 255.0 + 0.5);
    int hall = int(cell.g * 255.0 + 0.5);
    float fw = dF / uFocal * max(1.0, dF / max(a, 0.2)) * 0.5;
    m = floorMat(P, fw, fm, hall, N, refl, cheap);
    if (!cheap) {
      vec2 f = fract(hp);
      float dx0 = texelFetch(uCells, ci + ivec2(-1, 0), 0).r * 255.0 > 1.5 ? f.x : 1.0;
      float dx1 = texelFetch(uCells, ci + ivec2(1, 0), 0).r * 255.0 > 1.5 ? 1.0 - f.x : 1.0;
      float dy0 = texelFetch(uCells, ci + ivec2(0, -1), 0).r * 255.0 > 1.5 ? f.y : 1.0;
      float dy1 = texelFetch(uCells, ci + ivec2(0, 1), 0).r * 255.0 > 1.5 ? 1.0 - f.y : 1.0;
      float dw = min(min(dx0, dx1), min(dy0, dy1));
      ao = mix(0.45, 1.0, smoothstep(0.0, 0.3, dw));
      for (int i = 0; i < uNAO; i++) {
        float dd = length(hp - uAO[i].xy) / uAO[i].z;
        ao *= 1.0 - uAO[i].w * (1.0 - smoothstep(0.35, 1.0, dd));
      }
    }
    tHit = dF; surf = 1;
  } else {
    float dC = (uWallH - a) / b;
    vec2 hp = uPos + rd * dC;
    P = vec3(hp, uWallH);
    ivec2 ci = ivec2(clamp(floor(hp), vec2(0.0), uMap - 1.0));
    int hall = int(texelFetch(uCells, ci, 0).g * 255.0 + 0.5);
    N = vec3(0.0, 0.0, -1.0);
    m = ceilMat(P, eye, hall, N, dC / uFocal * max(1.0, dC / 1.2));
    ao = 0.45;
    tHit = dC; surf = 2;
  }
  vec3 col = shade(P, N, normalize(eye - P), m, ao) * post;
  layers(a, b, rd, eye, cheap, col, tHit, surf);
  return col;
}

// ---------- объёмный свет: пыль в луче фонаря и в лунных столбах ----------
vec3 volume(vec3 ro, vec3 rd, float tMax, float jit) {
  float tm = min(tMax, 7.5);
  float dt = tm / float(uVolN);
  vec3 acc = vec3(0.0);
  vec3 fc = flashCol() * uFlashI * (1.0 - uUV * 0.5);
  vec3 mc = moonCol() * (1.0 + uDawn);
  for (int i = 0; i < uVolN; i++) {
    float t = (float(i) + jit) * dt;
    vec3 p = ro + rd * t;
    float dens = 0.45 + 1.1 * vn(p.xy * 2.4 + vec2(p.z * 1.7 + uTime * 0.03, p.z * 1.3 - uTime * 0.02));
    vec3 lv = p - uFlashPos;
    float d2 = dot(lv, lv);
    // у самого фонаря луч тонкий — не заливаем им весь экран
    float s = spot(dot(lv * inversesqrt(d2), uFlashDir)) / (0.6 + d2 * 0.45) * smoothstep(0.3, 1.4, sqrt(d2));
    vec2 mo = moonAt(p);
    acc += (fc * s * 0.016 + mc * (mo.x * 0.05 + mo.y * 0.03)) * dens;
  }
  return acc * dt * uVol;
}

vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }

void main() {
  CX = int(gl_FragCoord.x);
  float cx = (gl_FragCoord.x - uRes.x * 0.5) / uFocal;
  vec2 rd = uDir + uRight * cx;
  float b = (gl_FragCoord.y - uHor) / uFocal;
  vec3 col = vec3(0.0);
  float tHit0 = 1.0, w = 0.0;
  // проход 0 — основной луч, проход 1 — отражение в полу: тот же столбец, зеркальная высота
  for (int pass = 0; pass < uPasses; pass++) {
    float tHit; int surf; float refl;
    vec3 c = trace(pass == 0 ? uEye : -uEye, pass == 0 ? b : -b, rd, pass > 0, tHit, surf, refl);
    if (pass == 0) {
      col = c; tHit0 = tHit;
      if (surf != 1 || refl <= 0.0) break;
      float cosT = uEye / length(vec3(rd * tHit, uEye));
      float F = 0.04 + 0.96 * pow(1.0 - cosT, 5.0);
      w = refl * mix(0.12, 0.85, F);
    } else col += c * w;
  }
  vec3 ray3 = vec3(rd, b);
  float rl = length(ray3);
  float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy + floor(fract(uTime * 3.1) * 64.0), vec2(0.06711056, 0.00583715))));
  col += volume(vec3(uPos, uEye), ray3 / rl, tHit0 * rl, ign);
  col = aces(col * uExpo);
  col = pow(col, vec3(1.0 / 2.2));
  vec2 q = gl_FragCoord.xy / uRes - 0.5;
  q.x *= uRes.x / uRes.y;
  col *= mix(0.62, 1.0, 1.0 - smoothstep(0.3, 1.05, length(q)));
  col += (h12(gl_FragCoord.xy + fract(uTime * 13.7) * 91.0) - 0.5) * uGrain;
  oCol = vec4(col, 1.0);
}`;

// Пылинки: точки с мягким краем, яркость считает CPU.
const PVS = `#version 300 es
layout(location = 0) in vec4 aP;
out float vB;
void main() { gl_Position = vec4(aP.xy, 0.0, 1.0); gl_PointSize = aP.z; vB = aP.w; }`;
const PFS = `#version 300 es
precision mediump float;
in float vB;
out vec4 o;
void main() { float r = length(gl_PointCoord - 0.5); float a = 1.0 - smoothstep(0.0, 0.5, r); o = vec4(vec3(1.0, 0.9, 0.75) * vB * a, 1.0); }`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error('shader: ' + log);
  }
  return s;
}
function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
  return p;
}

// ---------- рендерер ----------
function create(canvas, world) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: 'high-performance' });
  if (!gl) return null;
  // большой шейдер собирается асинхронно (KHR_parallel_shader_compile): страница не замирает
  const par = gl.getExtension('KHR_parallel_shader_compile');
  const vsh = gl.createShader(gl.VERTEX_SHADER); gl.shaderSource(vsh, VS); gl.compileShader(vsh);
  const fsh = gl.createShader(gl.FRAGMENT_SHADER); gl.shaderSource(fsh, FS); gl.compileShader(fsh);
  const prog = gl.createProgram();
  gl.attachShader(prog, vsh); gl.attachShader(prog, fsh); gl.linkProgram(prog);
  const pprog = program(gl, PVS, PFS);
  let U = null;
  function isReady() {
    if (U) return true;
    if (par && !gl.getProgramParameter(prog, par.COMPLETION_STATUS_KHR)) return false;
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('shader: ' + (gl.getShaderInfoLog(fsh) || '') + ' ' + (gl.getProgramInfoLog(prog) || ''));
    }
    U = {};
    const nU = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < nU; i++) {
      const info = gl.getActiveUniform(prog, i);
      U[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(prog, info.name);
    }
    return true;
  }
  const vao = gl.createVertexArray();
  const aniso = gl.getExtension('EXT_texture_filter_anisotropic');

  const { MW, MH, T } = W;
  // клетки
  const texCells = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texCells);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, MW, MH, 0, gl.RGBA, gl.UNSIGNED_BYTE, world.cells);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  // луна
  const texMoon = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texMoon);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, world.moon.w, world.moon.h, 0, gl.RG, gl.UNSIGNED_BYTE, world.moon.data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  // след вора
  const texTrail = gl.createTexture();
  {
    const res = 32;
    const c = NM.Paint.cpuCanvas(MW * res, MH * res);
    const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
    g.setTransform(res, 0, 0, res, 0, 0);
    for (const p of world.trail.prints) {
      g.save();
      g.translate(p.x, p.y); g.rotate(p.a);
      const k = 0.35 + 0.65 * p.k;
      g.fillStyle = 'rgba(255,255,255,' + k.toFixed(3) + ')';
      g.beginPath(); g.ellipse(0.03, 0, 0.055, 0.026, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(-0.06, 0, 0.026, 0.022, 0, 0, Math.PI * 2); g.fill();
      g.restore();
    }
    gl.bindTexture(gl.TEXTURE_2D, texTrail);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  // массивы текстур: картины и спрайты
  const PS = NM.Paint.SIZE;
  const LEVELS = 9;
  const texPaint = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, texPaint);
  gl.texStorage3D(gl.TEXTURE_2D_ARRAY, LEVELS, gl.SRGB8_ALPHA8, PS, PS, Math.max(1, world.paintings.length));
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  if (aniso) gl.texParameterf(gl.TEXTURE_2D_ARRAY, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 4);
  // семь похищенных — в отдельном массиве 512 × 512: их рассматривают вплотную
  const texHi = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, texHi);
  gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 10, gl.SRGB8_ALPHA8, 512, 512, 7);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  if (aniso) gl.texParameterf(gl.TEXTURE_2D_ARRAY, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 4);
  const sprCanvases = NM.Sprites.build();
  const texSpr = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, texSpr);
  gl.texStorage3D(gl.TEXTURE_2D_ARRAY, LEVELS, gl.SRGB8_ALPHA8, NM.Sprites.TW, NM.Sprites.TH, sprCanvases.length);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  // загрузка слоя со всей цепочкой мип-уровней (уменьшаем холстом, без generateMipmap на весь массив)
  const mipCanvas = NM.Paint.cpuCanvas(1, 1);
  function uploadLayer(target, tex, layer, src, w, h, levels) {
    const LV = levels || LEVELS;
    gl.bindTexture(target, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.texSubImage3D(target, 0, 0, 0, layer, w, h, 1, gl.RGBA, gl.UNSIGNED_BYTE, src);
    let cw = w, ch = h, prev = src;
    for (let lv = 1; lv < LV; lv++) {
      const nw = Math.max(1, cw >> 1), nh = Math.max(1, ch >> 1);
      const c = lv === 1 ? mipCanvas : NM.Paint.cpuCanvas(nw, nh);
      if (c.width !== nw) c.width = nw;
      if (c.height !== nh) c.height = nh;
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = 'high';
      g.clearRect(0, 0, nw, nh);
      g.drawImage(prev, 0, 0, nw, nh);
      gl.texSubImage3D(target, lv, 0, 0, layer, nw, nh, 1, gl.RGBA, gl.UNSIGNED_BYTE, c);
      prev = c; cw = nw; ch = nh;
      if (nw === 1 && nh === 1) {
        for (let k = lv + 1; k < LV; k++) gl.texSubImage3D(target, k, 0, 0, layer, 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, c);
        break;
      }
    }
  }
  sprCanvases.forEach((c, i) => uploadLayer(gl.TEXTURE_2D_ARRAY, texSpr, i, c, NM.Sprites.TW, NM.Sprites.TH));
  const ready = new Uint8Array(world.paintings.length);

  // столбцовая текстура
  const texCols = gl.createTexture();
  let colW = 0, cols = null;
  const wallDist = new Float32Array(8192);
  function ensureCols(w) {
    if (w <= colW) return;
    colW = Math.min(8192, Math.max(w, 256));
    cols = new Float32Array(colW * ROWS * 4);
    gl.bindTexture(gl.TEXTURE_2D, texCols);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, colW, ROWS, 0, gl.RGBA, gl.FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  // пылинки
  const NP = 220;
  const dust = new Float32Array(NP * 3);
  const dustBuf = gl.createBuffer();
  const dustData = new Float32Array(NP * 4);
  const dvao = gl.createVertexArray();
  gl.bindVertexArray(dvao);
  gl.bindBuffer(gl.ARRAY_BUFFER, dustBuf);
  gl.bufferData(gl.ARRAY_BUFFER, dustData.byteLength, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  const drng = W.mulberry32(77);
  for (let i = 0; i < NP; i++) { dust[i * 3] = drng() * 5; dust[i * 3 + 1] = drng() * 5; dust[i * 3 + 2] = drng() * W.WALL_H; }

  // ---------- кастер ----------
  const g = world.g;
  const HALLS = W.HALLS;
  const hallWall = new Uint8Array(HALLS.length);
  HALLS.forEach((h, i) => { hallWall[i] = h ? h.wall : W.WS.STONE; });
  const exitFace = new Int32Array(MW * MH).fill(-1);
  for (const e of W.EXIT_SIGNS) exitFace[e.y * MW + e.x] = (e.y + e.from[1]) * MW + (e.x + e.from[0]);
  const isOpen = (t) => t === T.FLOOR || t === T.DOOR;
  // флаги проёмов у граней: бит 0 — проём со стороны меньшего s, бит 1 — большего
  const faceFlags = new Uint8Array(MW * MH * 4);
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    for (let code = 0; code < 4; code++) {
      let f = 0;
      const at = (xx, yy) => (xx < 0 || yy < 0 || xx >= MW || yy >= MH ? T.WALL : g.type[yy * MW + xx]);
      if (code < 2) { if (at(x, y - 1) === T.DOOR) f |= 1; if (at(x, y + 1) === T.DOOR) f |= 2; }
      else { if (at(x - 1, y) === T.DOOR) f |= 1; if (at(x + 1, y) === T.DOOR) f |= 2; }
      faceFlags[(y * MW + x) * 4 + code] = f;
    }
  }
  const layerBuf = new Float32Array(32 * 8);
  const seen = new Uint8Array(MW * MH);
  const projS = [];

  const lastCast = { x: 0, y: 0, a: 0, n: 0, w: 0 };
  function cast(cam, Wpx, focal) {
    ensureCols(Wpx);
    lastCast.x = cam.x; lastCast.y = cam.y; lastCast.a = cam.a; lastCast.n++; lastCast.w = Wpx;
    const px = cam.x, py = cam.y;
    const dirX = Math.cos(cam.a), dirY = Math.sin(cam.a), rX = -dirY, rY = dirX;
    const decals = world.decals, fd = world.faceDecals;
    // проекция спрайтов
    projS.length = 0;
    for (const S of world.sprites) {
      const rx = S.x - px, ry = S.y - py;
      const depth = rx * dirX + ry * dirY;
      if (depth < 0.06) continue;
      const lat = rx * rX + ry * rY;
      const sx = Wpx / 2 + lat / depth * focal;
      const hw = S.w / 2 / depth * focal;
      if (sx + hw < 0 || sx - hw > Wpx) continue;
      projS.push({ depth, sx, hw, S });
    }
    const segs = world.segs;
    for (let x = 0; x < Wpx; x++) {
      const cx = (x + 0.5 - Wpx / 2) / focal;
      const rdx = dirX + rX * cx, rdy = dirY + rY * cx;
      let mx = Math.floor(px), my = Math.floor(py);
      const ddx = rdx === 0 ? 1e30 : Math.abs(1 / rdx), ddy = rdy === 0 ? 1e30 : Math.abs(1 / rdy);
      let stx, sty, sdx, sdy;
      if (rdx < 0) { stx = -1; sdx = (px - mx) * ddx; } else { stx = 1; sdx = (mx + 1 - px) * ddx; }
      if (rdy < 0) { sty = -1; sdy = (py - my) * ddy; } else { sty = 1; sdy = (my + 1 - py) * ddy; }
      let nl = 0;
      let prev = my * MW + mx;
      const mark = (x & 3) === 0;
      if (mark) seen[prev] = 1;
      // стоим в проёме — перемычка прямо над головой
      if (g.type[prev] === T.DOOR) {
        const o = nl * 8;
        layerBuf[o] = 0.0001; layerBuf[o + 1] = Math.min(sdx, sdy); layerBuf[o + 2] = KIND.SLAB; layerBuf[o + 3] = 0;
        layerBuf[o + 4] = W.DOOR_H; layerBuf[o + 5] = W.WALL_H; layerBuf[o + 6] = W.WS.JAMB + 16 * 3; layerBuf[o + 7] = 0;
        nl++;
      }
      let dist = 30, code = 0, hit = -1, side = 0;
      for (let it = 0; it < 90; it++) {
        let tE;
        if (sdx < sdy) { tE = sdx; sdx += ddx; mx += stx; side = 0; } else { tE = sdy; sdy += ddy; my += sty; side = 1; }
        if (mx < 0 || my < 0 || mx >= MW || my >= MH) { dist = tE; break; }
        const ci = my * MW + mx;
        const t = g.type[ci];
        if (t === T.DOOR) {
          if (nl < 32) {
            const o = nl * 8;
            const fc = side === 0 ? (stx > 0 ? 0 : 1) : (sty > 0 ? 2 : 3);
            layerBuf[o] = tE; layerBuf[o + 1] = Math.min(sdx, sdy); layerBuf[o + 2] = KIND.SLAB; layerBuf[o + 3] = 0;
            layerBuf[o + 4] = W.DOOR_H; layerBuf[o + 5] = W.WALL_H;
            layerBuf[o + 6] = hallWall[g.hall[prev]] + 16 * fc;
            layerBuf[o + 7] = exitFace[ci] === prev ? 1 : 0;
            nl++;
          }
        } else if (t >= T.WALL) {
          dist = tE; hit = ci;
          code = side === 0 ? (stx > 0 ? 0 : 1) : (sty > 0 ? 2 : 3);
          if (mark) seen[ci] = 1;
          break;
        }
        if (mark) seen[ci] = 1;
        prev = ci;
      }
      wallDist[x] = dist;
      const base = x * 4;
      const rowStride = colW * 4;
      // строка 0: стена
      let style = W.WS.STONE, flags = 0;
      if (hit >= 0) {
        const t = g.type[hit];
        if (t === T.WINDOW) style = W.WS.WINDOW;
        else if (t === T.PILLAR) style = W.WS.PILLAR;
        else if (t === T.SHELF) style = W.WS.SHELF;
        else if (t === T.EXIT) style = W.WS.EXIT;
        else style = g.type[prev] === T.DOOR ? W.WS.JAMB : hallWall[g.hall[prev]];
        flags = faceFlags[hit * 4 + code];
      }
      cols[base] = dist; cols[base + 1] = style; cols[base + 2] = code + 4 * flags; cols[base + 3] = hit;
      // строки 1–4: картины на грани
      for (let k = 0; k < 2; k++) {
        const r1 = base + rowStride * (1 + k * 2), r2 = base + rowStride * (2 + k * 2);
        const di = hit >= 0 ? fd[(hit * 4 + code) * 2 + k] : -1;
        if (di >= 0) {
          const d = decals[di];
          cols[r1] = d.s0; cols[r1 + 1] = d.s1; cols[r1 + 2] = d.z0; cols[r1 + 3] = d.z1;
          let layer = d.paint.layer;
          if (d.state === W.ST.INTRUDER) layer = world.stolen[d.intruder].paint.layer;
          cols[r2] = ready[layer] ? shaderLayer(layer) : -1; cols[r2 + 1] = d.frame; cols[r2 + 2] = d.state; cols[r2 + 3] = d.label ? 1 : 0;
        } else {
          cols[r1] = 0; cols[r1 + 1] = -1; cols[r1 + 2] = 0; cols[r1 + 3] = 0;
        }
      }
      // спрайты
      for (let i = 0; i < projS.length && nl < 32; i++) {
        const p = projS[i];
        if (p.depth >= dist) continue;
        const u = (x + 0.5 - (p.sx - p.hw)) / (2 * p.hw);
        if (u < 0 || u > 1) continue;
        const o = nl * 8;
        layerBuf[o] = p.depth; layerBuf[o + 1] = u; layerBuf[o + 2] = KIND.SPRITE; layerBuf[o + 3] = p.S.kind;
        layerBuf[o + 4] = p.S.z0; layerBuf[o + 5] = p.S.z0 + p.S.h; layerBuf[o + 6] = p.S.mat; layerBuf[o + 7] = 0;
        nl++;
      }
      // плоские предметы
      for (let i = 0; i < segs.length && nl < 32; i++) {
        const s = segs[i];
        if (s.hidden) continue;
        const ex = s.bx - s.ax, ey = s.by - s.ay;
        const den = rdx * ey - rdy * ex;
        if (Math.abs(den) < 1e-9) continue;
        const ax = s.ax - px, ay = s.ay - py;
        const t = (ax * ey - ay * ex) / den;
        if (t < 0.03 || t >= dist) continue;
        const sp = (ax * rdy - ay * rdx) / den;
        if (sp < 0 || sp > 1) continue;
        const back = rdx * s.nrm[0] + rdy * s.nrm[1] > 0;
        let u = s.flipU ? 1 - sp : sp;
        let fl = back ? 1 : 0;
        let tex;
        if (s.kind === 'canvas') {
          fl |= 2; if (s.ragged) fl |= 4; if (s.stolen >= 0) fl |= 8; if (!ready[s.paint]) fl |= 32;
          const sl = shaderLayer(s.paint);
          tex = sl >= 1000 ? 250 + sl - 1000 : s.paint;
        }
        else if (s.kind === 'rope') { fl |= 16; tex = 0; }
        else tex = s.tex;
        const o = nl * 8;
        layerBuf[o] = t; layerBuf[o + 1] = u; layerBuf[o + 2] = KIND.SEG; layerBuf[o + 3] = tex + fl * 256;
        layerBuf[o + 4] = s.z0; layerBuf[o + 5] = s.z1; layerBuf[o + 6] = 0; layerBuf[o + 7] = Math.atan2(s.nrm[1], s.nrm[0]);
        nl++;
      }
      // сортировка: дальние первыми, оставляем MAXL ближайших
      for (let i = 1; i < nl; i++) {
        for (let j = i; j > 0 && layerBuf[(j - 1) * 8] < layerBuf[j * 8]; j--) {
          for (let k = 0; k < 8; k++) { const tmp = layerBuf[(j - 1) * 8 + k]; layerBuf[(j - 1) * 8 + k] = layerBuf[j * 8 + k]; layerBuf[j * 8 + k] = tmp; }
        }
      }
      const start = Math.max(0, nl - MAXL);
      let li = 0;
      for (let i = start; i < nl; i++, li++) {
        const r1 = base + rowStride * (5 + li * 2), r2 = r1 + rowStride;
        const o = i * 8;
        cols[r1] = layerBuf[o]; cols[r1 + 1] = layerBuf[o + 1]; cols[r1 + 2] = layerBuf[o + 2]; cols[r1 + 3] = layerBuf[o + 3];
        cols[r2] = layerBuf[o + 4]; cols[r2 + 1] = layerBuf[o + 5]; cols[r2 + 2] = layerBuf[o + 6]; cols[r2 + 3] = layerBuf[o + 7];
      }
      if (li < MAXL) cols[base + rowStride * (5 + li * 2) + 2] = 0;
    }
    gl.bindTexture(gl.TEXTURE_2D, texCols);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, colW, ROWS, gl.RGBA, gl.FLOAT, cols);
  }
  // у плоских предметов лицо смотрит в сторону nrm; u идёт слева направо для зрителя
  for (const s of world.segs) {
    const ex = s.bx - s.ax, ey = s.by - s.ay;
    s.flipU = ex * s.nrm[1] - ey * s.nrm[0] < 0;
  }

  // ---------- кадр ----------
  const lp = new Float32Array(40), lc = new Float32Array(40), ld = new Float32Array(40), ao = new Float32Array(48);
  function frame(st) {
    if (!isReady()) return false;
    const Wpx = canvas.width, Hpx = canvas.height;
    const focal = st.focal;
    cast(st.cam, Wpx, focal);
    gl.viewport(0, 0, Wpx, Hpx);
    gl.useProgram(prog);
    gl.bindVertexArray(vao);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texCols); gl.uniform1i(U.uCols, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texCells); gl.uniform1i(U.uCells, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, texMoon); gl.uniform1i(U.uMoon, 2);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, texTrail); gl.uniform1i(U.uTrail, 3);
    gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D_ARRAY, texPaint); gl.uniform1i(U.uPaint, 4);
    gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D_ARRAY, texSpr); gl.uniform1i(U.uSpr, 5);
    gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D_ARRAY, texHi); gl.uniform1i(U.uPaintHi, 6);
    const c = st.cam;
    const dirX = Math.cos(c.a), dirY = Math.sin(c.a);
    gl.uniform2f(U.uRes, Wpx, Hpx);
    gl.uniform2f(U.uPos, c.x, c.y);
    gl.uniform2f(U.uDir, dirX, dirY);
    gl.uniform2f(U.uRight, -dirY, dirX);
    gl.uniform2f(U.uMap, MW, MH);
    gl.uniform1f(U.uFocal, focal);
    gl.uniform1f(U.uHor, Hpx / 2 - c.pitch * focal);
    gl.uniform1f(U.uEye, c.z);
    gl.uniform1f(U.uWallH, W.WALL_H);
    gl.uniform1f(U.uDoorH, W.DOOR_H);
    gl.uniform1f(U.uTime, st.time);
    gl.uniform1f(U.uDawn, st.dawn);
    gl.uniform1f(U.uUV, st.uv);
    gl.uniform1f(U.uFlashI, st.flashI);
    gl.uniform1f(U.uVol, st.vol);
    gl.uniform1f(U.uGrain, st.grain);
    gl.uniform1f(U.uExpo, st.expo);
    gl.uniform3fv(U.uFlashPos, st.flashPos);
    gl.uniform3fv(U.uFlashDir, st.flashDir);
    gl.uniform3fv(U.uMoonL, W.MOON);
    gl.uniform3fv(U.uSkyL, W.SKYL);
    gl.uniform4f(U.uSky, W.SKY.x0, W.SKY.y0, W.SKY.x1, W.SKY.y1);
    gl.uniform4f(U.uGlint, W.BROKEN.x, W.BROKEN.y, 0.95, 0);
    const nl = Math.min(10, st.lights.length);
    for (let i = 0; i < nl; i++) {
      const L = st.lights[i];
      lp.set([L.x, L.y, L.z, L.r], i * 4); lc.set([L.cr, L.cg, L.cb, 0], i * 4); ld.set([L.dx, L.dy, L.dz, L.cos], i * 4);
    }
    gl.uniform1i(U.uNL, nl);
    if (nl) { gl.uniform4fv(U.uLP, lp.subarray(0, nl * 4)); gl.uniform4fv(U.uLC, lc.subarray(0, nl * 4)); gl.uniform4fv(U.uLD, ld.subarray(0, nl * 4)); }
    const na = Math.min(12, st.ao.length);
    for (let i = 0; i < na; i++) ao.set(st.ao[i], i * 4);
    gl.uniform1i(U.uNAO, na);
    if (na) gl.uniform4fv(U.uAO, ao.subarray(0, na * 4));
    gl.uniform1i(U.uMaxL, MAXL);
    gl.uniform1i(U.uTwo, 2);
    gl.uniform1i(U.uPasses, st.reflections === false ? 1 : 2);
    gl.uniform1i(U.uVolN, st.volN || 10);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    drawDust(st, Wpx, Hpx, focal);
    return true;
  }

  function drawDust(st, Wpx, Hpx, focal) {
    if (st.flashI <= 0 && st.dawn <= 0) return;
    const c = st.cam;
    const dirX = Math.cos(c.a), dirY = Math.sin(c.a), rX = -dirY, rY = dirX;
    const hor = Hpx / 2 - c.pitch * focal;
    const fp = st.flashPos, fdv = st.flashDir;
    let n = 0;
    const t = st.time;
    for (let i = 0; i < NP; i++) {
      // пылинки живут в кубе 5×5 вокруг камеры и медленно дрейфуют
      let x = dust[i * 3] + Math.sin(t * 0.13 + i) * 0.08, y = dust[i * 3 + 1] + Math.cos(t * 0.11 + i * 1.7) * 0.08;
      let z = (dust[i * 3 + 2] + t * 0.012 * (0.5 + (i % 7) / 7)) % W.WALL_H;
      x = c.x - 2.5 + ((x - c.x + 2.5) % 5 + 5) % 5;
      y = c.y - 2.5 + ((y - c.y + 2.5) % 5 + 5) % 5;
      const rx = x - c.x, ry = y - c.y;
      const depth = rx * dirX + ry * dirY;
      if (depth < 0.12) continue;
      const lat = rx * rX + ry * rY;
      const sx = Wpx / 2 + lat / depth * focal;
      if (sx < 0 || sx >= Wpx) continue;
      if (depth > wallDist[sx | 0]) continue;
      const sy = hor + (z - c.z) * focal / depth;
      const lx = x - fp[0], ly = y - fp[1], lz = z - fp[2];
      const ll = Math.hypot(lx, ly, lz);
      const cosA = (lx * fdv[0] + ly * fdv[1] + lz * fdv[2]) / ll;
      const beam = Math.max(0, (cosA - 0.9) / 0.1);
      let b = beam * beam * st.flashI * 0.6 / (0.3 + ll * ll * 0.4) * (1 - st.uv * 0.6);
      const mi = Math.floor(y * world.moon.res) * world.moon.w + Math.floor(x * world.moon.res);
      if (mi >= 0 && mi < world.moon.w * world.moon.h) b += (world.moon.data[mi * 2] / 255) * 0.25;
      if (b < 0.02) continue;
      const tw = 0.6 + 0.4 * Math.sin(t * 3 + i * 7.1);
      dustData[n * 4] = sx / Wpx * 2 - 1;
      dustData[n * 4 + 1] = sy / Hpx * 2 - 1;
      dustData[n * 4 + 2] = Math.min(6, Math.max(1.3, 0.0045 * focal / depth));
      dustData[n * 4 + 3] = Math.min(1, b) * tw * 0.75;
      n++;
    }
    if (!n) return;
    gl.useProgram(pprog);
    gl.bindVertexArray(dvao);
    gl.bindBuffer(gl.ARRAY_BUFFER, dustBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, dustData.subarray(0, n * 4));
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.drawArrays(gl.POINTS, 0, n);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }

  // ---------- луч «куда смотрю»: для этикеток и взаимодействия ----------
  function probe(cam) {
    const px = cam.x, py = cam.y;
    const dx = Math.cos(cam.a), dy = Math.sin(cam.a);
    let mx = Math.floor(px), my = Math.floor(py);
    const ddx = Math.abs(1 / (dx || 1e-9)), ddy = Math.abs(1 / (dy || 1e-9));
    let stx, sty, sdx, sdy;
    if (dx < 0) { stx = -1; sdx = (px - mx) * ddx; } else { stx = 1; sdx = (mx + 1 - px) * ddx; }
    if (dy < 0) { sty = -1; sdy = (py - my) * ddy; } else { sty = 1; sdy = (my + 1 - py) * ddy; }
    let dist = 30, hit = -1, code = 0, side = 0;
    for (let it = 0; it < 90; it++) {
      let tE;
      if (sdx < sdy) { tE = sdx; sdx += ddx; mx += stx; side = 0; } else { tE = sdy; sdy += ddy; my += sty; side = 1; }
      if (mx < 0 || my < 0 || mx >= MW || my >= MH) { dist = tE; break; }
      const ci = my * MW + mx;
      if (g.type[ci] >= T.WALL) { dist = tE; hit = ci; code = side === 0 ? (stx > 0 ? 0 : 1) : (sty > 0 ? 2 : 3); break; }
    }
    const zAt = (d) => cam.z + cam.pitch * d;
    let best = null;
    // плоские предметы и спрайты ближе стены
    for (let i = 0; i < world.segs.length; i++) {
      const s = world.segs[i];
      if (s.hidden || s.kind !== 'canvas') continue;
      const ex = s.bx - s.ax, ey = s.by - s.ay;
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-9) continue;
      const ax = s.ax - px, ay = s.ay - py;
      const t = (ax * ey - ay * ex) / den;
      const sp = (ax * dy - ay * dx) / den;
      if (t < 0.03 || t >= dist || sp < -0.05 || sp > 1.05) continue;
      const z = zAt(t);
      if (z < s.z0 - 0.15 || z > s.z1 + 0.15) continue;
      if (!best || t < best.dist) best = { type: 'seg', seg: s, idx: i, dist: t };
    }
    for (const S of world.sprites) {
      if (!S.info) continue;
      const rx = S.x - px, ry = S.y - py;
      const depth = rx * dx + ry * dy;
      if (depth < 0.1 || depth >= dist) continue;
      const lat = rx * -dy + ry * dx;
      if (Math.abs(lat) > S.w * 0.55) continue;
      const z = zAt(depth);
      if (z < 0 || z > S.h) continue;
      if (!best || depth < best.dist) best = { type: 'sprite', sprite: S, dist: depth };
    }
    if (best) return best;
    if (hit < 0) return null;
    const hx = px + dx * dist, hy = py + dy * dist;
    const s = code < 2 ? hy : hx;
    const z = zAt(dist);
    for (let k = 0; k < 2; k++) {
      const di = world.faceDecals[(hit * 4 + code) * 2 + k];
      if (di < 0) continue;
      const d = world.decals[di];
      const fw = W.FRAME_W[d.frame] + 0.05;
      if (s > d.s0 - fw && s < d.s1 + fw && z > d.z0 - fw && z < d.z1 + fw) return { type: 'decal', decal: d, dist };
    }
    return { type: 'wall', dist, cell: hit };
  }

  function uploadPainting(spec, canvasSrc) {
    if (spec.master !== undefined) uploadLayer(gl.TEXTURE_2D_ARRAY, texHi, spec.master, canvasSrc, 512, 512, 10);
    else uploadLayer(gl.TEXTURE_2D_ARRAY, texPaint, spec.layer, canvasSrc, PS, PS);
    ready[spec.layer] = 1;
  }
  // номер слоя для шейдера: 1000 + k — картина k из массива высокого разрешения
  const specOfLayer = world.paintings;
  const shaderLayer = (layer) => { const sp = specOfLayer[layer]; return sp && sp.master !== undefined ? 1000 + sp.master : layer; };

  function debugCol(x) {
    const out = [];
    for (let r = 0; r < 7; r++) { const o = x * 4 + colW * 4 * r; out.push(Array.from(cols.subarray(o, o + 4)).map((v) => +v.toFixed(3))); }
    return out;
  }
  return { gl, frame, probe, uploadPainting, seen, wallDist, ready, isReady, debugCol, lastCast, lost: () => gl.isContextLost() };
}

NM.Render = { create };
})(typeof window !== 'undefined' ? window : globalThis);
