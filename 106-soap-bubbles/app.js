/* Мыльные пузыри.
   Цвет плёнки считается честно: формула Эйри для тонкого слоя (n = 1,335) с учётом s- и p-поляризации,
   спектр 380–780 нм, функции цветового соответствия CIE 1931 (аналитическая аппроксимация
   Уаймана — Слоана — Ширли, 2013). Результат — таблица «толщина × угол падения → цвет отражения»,
   которую шейдер читает для каждой точки плёнки. Толщина плёнки меняется во времени: стекание
   под тяжестью, вихри, чёрная плёнка у макушки перед тем, как пузырь лопнет. */
(() => {
  'use strict';

  // ---------- Константы ----------
  const N_FILM = 1.335;          // показатель преломления мыльного раствора
  const D_MAX = 1400;            // нм: верхняя граница таблицы толщин
  const LUT_W = 512, LUT_H = 32; // толщина × косинус угла падения
  const MAX_BUBBLES = 44;
  const MAX_DROPS = 1400;
  const RING_R = 22;             // радиус плёнки в рамке, px
  const PX_TO_CM = 0.04;         // 1 px ≈ 0,4 мм
  const ORDER_STEP = 550 / (2 * N_FILM); // нм: граница порядков цветов Ньютона (для λ ≈ 550 нм)
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const $ = (s) => document.querySelector(s);
  const canvas = $('#gl');
  const el = {
    wand: $('#wand'), ghost: $('#ghost'), tag: $('#tag'), probe: $('#probe'),
    legend: $('#legend'), ticks: $('#ticks'), orders: $('#orders'),
    marker: $('#marker'), markerLabel: $('#marker-label'), hint: $('#hint'),
    sound: $('#sound'), wind: $('#wind'), drain: $('#drain'), redip: $('#redip'),
    fallback: $('#fallback'),
  };
  const segButtons = Array.from(document.querySelectorAll('.seg button'));

  const gl = canvas.getContext('webgl2', {
    antialias: false, alpha: false, depth: false, stencil: false,
    premultipliedAlpha: false, powerPreference: 'high-performance',
  });
  if (!gl) { el.fallback.hidden = false; return; }

  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const rendererName = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
  const softwareGL = /swiftshader|llvmpipe|software/i.test(rendererName);
  const floatRT = !!gl.getExtension('EXT_color_buffer_float');
  const OUT_SCALE = floatRT ? 1 : 0.25; // без float-буферов храним HDR, делённый на 4

  // ---------- Физика цвета: таблица «толщина × угол → цвет» ----------
  function lobe(l, mu, s1, s2) {
    const t = (l - mu) / (l < mu ? s1 : s2);
    return Math.exp(-0.5 * t * t);
  }
  function cmf(l) {
    return [
      1.056 * lobe(l, 599.8, 37.9, 31.0) + 0.362 * lobe(l, 442.0, 16.0, 26.7) - 0.065 * lobe(l, 501.1, 20.4, 26.2),
      0.821 * lobe(l, 568.8, 46.9, 40.5) + 0.286 * lobe(l, 530.9, 16.3, 31.1),
      1.217 * lobe(l, 437.0, 11.8, 36.0) + 0.681 * lobe(l, 459.0, 26.0, 13.8),
    ];
  }
  const xyzToRgb = (x, y, z) => [
    3.2406 * x - 1.5372 * y - 0.4986 * z,
    -0.9689 * x + 1.8758 * y + 0.0415 * z,
    0.0557 * x - 0.2040 * y + 1.0570 * z,
  ];
  // Коэффициент отражения плёнки в воздухе: r23 = −r12, поэтому R = 2r²(1 − cos δ) / (1 + r⁴ − 2r² cos δ)
  function airy(r, cosDelta) {
    const r2 = r * r;
    const den = 1 + r2 * r2 - 2 * r2 * cosDelta;
    return den < 1e-12 ? 0 : (2 * r2 * (1 - cosDelta)) / den;
  }
  function buildLUT() {
    const lams = [];
    for (let l = 380; l <= 780; l += 4) lams.push(l);
    const C = lams.map(cmf);
    const white = [0, 0, 0];
    for (const c of C) { white[0] += c[0]; white[1] += c[1]; white[2] += c[2]; }
    const wRGB = xyzToRgb(white[0], white[1], white[2]);
    const data = new Float32Array(LUT_W * LUT_H * 4);
    for (let j = 0; j < LUT_H; j++) {
      const ci = Math.max(1e-4, j / (LUT_H - 1));
      const si = Math.sqrt(1 - ci * ci);
      const st = si / N_FILM;
      const ct = Math.sqrt(1 - st * st);
      const rs = (ci - N_FILM * ct) / (ci + N_FILM * ct);
      const rp = (N_FILM * ci - ct) / (N_FILM * ci + ct);
      for (let i = 0; i < LUT_W; i++) {
        const d = (i / (LUT_W - 1)) * D_MAX;
        let X = 0, Y = 0, Z = 0;
        for (let k = 0; k < lams.length; k++) {
          const cd = Math.cos((4 * Math.PI * N_FILM * d * ct) / lams[k]);
          const R = 0.5 * (airy(rs, cd) + airy(rp, cd));
          X += R * C[k][0]; Y += R * C[k][1]; Z += R * C[k][2];
        }
        const rgb = xyzToRgb(X, Y, Z);
        const o = (j * LUT_W + i) * 4;
        data[o] = Math.max(0, rgb[0] / wRGB[0]);
        data[o + 1] = Math.max(0, rgb[1] / wRGB[1]);
        data[o + 2] = Math.max(0, rgb[2] / wRGB[2]);
        data[o + 3] = Y / white[1];
      }
    }
    return data;
  }
  const lutData = buildLUT();

  // ---------- Шейдеры ----------
  const VS_FULL = `#version 300 es
  out vec2 v_uv;
  void main() {
    vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
    v_uv = p;
    gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
  }`;

  const NOISE = `
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
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
    vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }`;

  // Окружение в пространстве камеры: y вверх, z — к зрителю.
  // Позади зрителя — большой мягкий свет и окно с переплётом, внизу — тёплые огни сада.
  const ENV = `
  vec3 envLight(vec3 d) {
    float front = smoothstep(-0.2, 0.95, d.z);
    vec3 c = vec3(0.96, 0.93, 0.88) * (0.22 + 2.5 * front * front);
    c += vec3(0.50, 0.58, 0.72) * 0.85 * smoothstep(0.15, 0.95, d.y);
    if (d.z > 0.06) {
      vec2 p = d.xy / d.z;
      vec2 q = (p - vec2(-0.62, 0.46)) / vec2(0.46, 0.38);
      float box = 1.0 - smoothstep(0.84, 1.0, max(abs(q.x), abs(q.y)));
      float bars = smoothstep(0.03, 0.065, abs(q.x)) * smoothstep(0.03, 0.065, abs(q.y));
      c += vec3(1.0, 0.97, 0.92) * 12.0 * box * bars;
    }
    c *= mix(1.0, 0.28, smoothstep(0.15, -0.7, d.z));
    // несколько тёплых фонарей сада — маленькими бликами, а не полосами
    c += vec3(1.0, 0.62, 0.30) * 7.0 * pow(max(dot(d, normalize(vec3(-0.62, -0.28, -0.73))), 0.0), 900.0);
    c += vec3(1.0, 0.74, 0.40) * 5.0 * pow(max(dot(d, normalize(vec3(0.34, -0.22, -0.91))), 0.0), 1400.0);
    c += vec3(1.0, 0.58, 0.26) * 6.0 * pow(max(dot(d, normalize(vec3(0.82, -0.36, -0.44))), 0.0), 700.0);
    c += vec3(0.55, 0.90, 0.60) * 2.5 * pow(max(dot(d, normalize(vec3(-0.25, -0.55, 0.80))), 0.0), 300.0);
    return c;
  }`;

  // Толщина плёнки в нанометрах для точки p на единичной сфере (система пузыря, y вверх).
  const FILM = `
  uniform float u_time;
  float filmThickness(vec3 p, float age, float seed, float detail) {
    float s = 0.5 - 0.5 * p.y;                    // 0 — макушка, 1 — низ
    float a = clamp(age, 0.0, 1.0);
    float dTop = 620.0 * pow(1.0 - a, 1.5);       // к концу жизни макушка истончается до чёрной плёнки
    float dBot = 1050.0 - 380.0 * a;
    float d = mix(dTop, dBot, pow(s, 1.25));
    // дифференциальное вращение: полосы закручиваются, как облака на планете
    float ang = u_time * (0.16 + 0.22 * sin(p.y * 2.7 + seed * 6.2831)) + seed * 9.0;
    float ca = cos(ang), sa = sin(ang);
    vec3 q = vec3(ca * p.x - sa * p.z, p.y, sa * p.x + ca * p.z);
    vec3 w = q * 1.55 + vec3(seed * 17.0, -u_time * 0.045, seed * 5.0);
    vec3 warp = vec3(snoise(w * 0.9 + 3.1), snoise(w * 0.9 + 7.7), snoise(w * 0.9 + 1.3));
    float n1 = snoise(w + 0.75 * warp);
    float n2 = detail > 0.5 ? snoise(w * 3.3 + 1.7 * n1) : 0.0;
    float eq = 1.0 - abs(p.y);
    d *= 1.0 + (0.26 * n1 + 0.09 * n2) * (0.55 + 0.6 * eq);
    d += 14.0 * sin(p.y * 38.0 + n1 * 5.0) * (1.0 - s);   // стратификация у макушки
    return max(d, 0.0);
  }`;

  const FS_BG = `#version 300 es
  precision highp float;
  in vec2 v_uv;
  out vec4 o;
  uniform vec2 u_res;
  uniform float u_time;
  uniform float u_os;
  ${NOISE}
  float h1(float n) { return fract(sin(n * 127.1 + 311.7) * 43758.5453); }
  void main() {
    vec2 px = v_uv * u_res;
    float asp = u_res.x / u_res.y;
    vec3 col = mix(vec3(0.012, 0.014, 0.011), vec3(0.022, 0.016, 0.028), smoothstep(0.0, 1.0, v_uv.y));
    // тёмная листва
    vec2 fp = vec2(v_uv.x * asp, v_uv.y) * 1.4;
    float f = snoise(vec3(fp, u_time * 0.008)) * 0.6 + snoise(vec3(fp * 2.3, 4.0 + u_time * 0.01)) * 0.4;
    col += vec3(0.010, 0.032, 0.018) * smoothstep(-0.1, 0.7, f) * (1.0 - 0.6 * v_uv.y);
    // огни сада не в фокусе
    float sc = u_res.y / 900.0;
    for (int i = 0; i < 20; i++) {
      float fi = float(i);
      vec2 c = vec2(h1(fi + 1.3), h1(fi + 7.7));
      c.y = mix(0.02, 0.62, c.y * c.y);
      c.x += 0.015 * sin(u_time * 0.05 + fi * 1.7);
      float far = h1(fi + 3.1);
      float rad = mix(10.0, 64.0, far * far) * sc;
      float d = length(px - c * u_res) / rad;
      if (d > 1.05) continue;
      float disc = 1.0 - smoothstep(0.72, 1.0, d);
      float ring = smoothstep(0.55, 0.95, d) * disc;
      float k = h1(fi + 11.0);
      vec3 bc = k < 0.55 ? vec3(1.0, 0.58, 0.24) : (k < 0.8 ? vec3(1.0, 0.80, 0.46) : (k < 0.92 ? vec3(0.40, 0.85, 0.52) : vec3(0.95, 0.44, 0.50)));
      float inten = mix(0.03, 0.14, h1(fi + 5.5)) * (0.88 + 0.12 * sin(u_time * 0.6 + fi * 2.1));
      col += bc * inten * (disc * 0.55 + ring * 0.45);
    }
    o = vec4(col * u_os, 1.0);
  }`;

  const VS_BUBBLE = `#version 300 es
  layout(location = 0) in vec2 a_corner;
  layout(location = 1) in vec4 a_i0;   // x, y, радиус (px), глубина
  layout(location = 2) in vec4 a_i1;   // возраст 0..1, seed, лопание 0..1 (−1 — нет), поворот
  layout(location = 3) in vec4 a_i2;   // масштаб x, масштаб y, отверстие x, отверстие z
  layout(location = 4) in vec4 a_i3;   // прозрачность, размытие, плоская плёнка, —
  uniform vec2 u_res;
  out vec2 v_uv;
  flat out vec4 v_i1;
  flat out vec4 v_i2;
  flat out vec4 v_i3;
  flat out float v_rpx;
  void main() {
    float pad = 1.0 + 3.0 / max(a_i0.z, 3.0) + a_i3.y;
    vec2 q = a_corner * pad;
    vec2 pos = a_i0.xy + q * a_i0.z * a_i2.xy;
    v_uv = vec2(q.x, -q.y);
    v_i1 = a_i1; v_i2 = a_i2; v_i3 = a_i3; v_rpx = a_i0.z;
    vec2 clip = pos / u_res * 2.0 - 1.0;
    gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  }`;

  const FS_BUBBLE = `#version 300 es
  precision highp float;
  in vec2 v_uv;
  flat in vec4 v_i1;
  flat in vec4 v_i2;
  flat in vec4 v_i3;
  flat in float v_rpx;
  out vec4 o;
  uniform sampler2D u_lut;
  uniform float u_os;
  const float D_MAX = ${D_MAX.toFixed(1)};
  ${NOISE}
  ${ENV}
  ${FILM}
  void main() {
    float r = length(v_uv);
    float soft = 1.6 / v_rpx + v_i3.y;
    float edge = 1.0 - smoothstep(1.0 - soft, 1.0 + soft * 0.25, r);
    if (edge <= 0.001) discard;
    vec2 uv = r > 0.999 ? v_uv / r * 0.999 : v_uv;
    float z = sqrt(max(1.0 - dot(uv, uv), 0.0));
    bool isFlat = v_i3.z > 0.5;
    vec3 n = isFlat ? normalize(vec3(uv * 0.5, 1.0)) : vec3(uv, z);
    float cosi = n.z;
    float age = v_i1.x, seed = v_i1.y, pop = v_i1.z, spin = v_i1.w;
    float cs = cos(spin), sn = sin(spin);
    mat3 Ry = mat3(cs, 0.0, -sn, 0.0, 1.0, 0.0, sn, 0.0, cs);
    vec3 pf = Ry * (isFlat ? normalize(vec3(uv, 0.9)) : vec3(uv, z));
    vec3 pb = Ry * vec3(uv, -z);

    float dF = filmThickness(pf, age, seed, 1.0);
    vec4 fF = texture(u_lut, vec2(dF / D_MAX, cosi));
    vec3 Rf = vec3(2.0 * cosi * n.xy, 2.0 * cosi * cosi - 1.0);

    float front = 1.0;
    float back = isFlat ? 0.0 : 1.0;
    float rim = 0.0;
    if (pop >= 0.0) {
      vec3 hd = normalize(vec3(v_i2.z, 0.92, v_i2.w));
      float lim = pop * 3.3;
      float af = acos(clamp(dot(pf, hd), -1.0, 1.0));
      float ab = acos(clamp(dot(pb, hd), -1.0, 1.0));
      front = smoothstep(lim, lim + 0.06, af);
      back *= smoothstep(lim, lim + 0.06, ab);
      rim = (1.0 - smoothstep(0.0, 0.1, abs(af - lim - 0.03))) * step(0.001, pop) * (1.0 - pop);
    }

    vec3 col = fF.rgb * envLight(Rf) * front;
    float a = fF.a * front;
    if (back > 0.0) {
      // внутреннее отражение от дальней стенки: маленькое перевёрнутое окно
      float dB = filmThickness(pb, age, seed, 0.0);
      vec4 fB = texture(u_lut, vec2(dB / D_MAX, cosi));
      vec3 Rb = vec3(-2.0 * z * uv, 2.0 * z * z - 1.0);
      col += fB.rgb * envLight(Rb) * back * 0.75;
      a += fB.a * back * 0.8;
    }
    col += vec3(1.0, 0.98, 0.95) * rim * 1.6;
    a = clamp(a, 0.0, 0.9);
    float k = edge * v_i3.x;
    o = vec4(col * k * u_os, a * k);
  }`;

  const VS_DROP = `#version 300 es
  layout(location = 0) in vec4 a_p;   // x, y, размер, яркость
  uniform vec2 u_res;
  uniform float u_dpr;
  out float v_a;
  void main() {
    vec2 clip = a_p.xy / u_res * 2.0 - 1.0;
    gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
    gl_PointSize = a_p.z * u_dpr;
    v_a = a_p.w;
  }`;
  const FS_DROP = `#version 300 es
  precision highp float;
  in float v_a;
  out vec4 o;
  uniform float u_os;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float m = smoothstep(0.5, 0.05, length(d));
    o = vec4(vec3(0.95, 0.96, 1.0) * m * v_a * 1.8 * u_os, 0.0);
  }`;

  const FS_MACRO = `#version 300 es
  precision highp float;
  in vec2 v_uv;
  out vec4 o;
  uniform sampler2D u_lut;
  uniform vec2 u_res;
  uniform float u_t;
  uniform float u_time;
  uniform vec4 u_vort[10];
  uniform int u_encode;
  uniform vec2 u_probe;
  uniform float u_os;
  const float D_MAX = ${D_MAX.toFixed(1)};
  ${NOISE}
  float macroThickness(vec2 p) {
    for (int i = 0; i < 10; i++) {
      vec4 v = u_vort[i];
      if (v.w <= 0.0) continue;
      vec2 d = p - v.xy;
      float a = v.z * exp(-dot(d, d) / (v.w * v.w));
      float ca = cos(a), sa = sin(a);
      p = v.xy + vec2(ca * d.x - sa * d.y, sa * d.x + ca * d.y);
    }
    float y = clamp(p.y, -0.2, 1.2);
    float dTop = max(0.0, 430.0 - u_t * 6.5);    // сверху плёнка тоньше и со временем чернеет
    float d = mix(dTop, 980.0, pow(clamp(y, 0.0, 1.0), 0.8));
    d -= max(0.0, u_t - 55.0) * 2.2 * (1.0 - clamp(y, 0.0, 1.0));   // чёрная плёнка расползается вниз
    vec3 w = vec3(p * vec2(2.1, 2.6), u_time * 0.035);
    w.y -= u_time * 0.018;
    vec3 warp = vec3(snoise(w * 0.8 + 2.3), snoise(w * 0.8 + 5.1), 0.0);
    float n1 = snoise(w + 0.8 * warp);
    float n2 = snoise(w * 2.6 + 0.9 * n1);
    d *= 1.0 + 0.30 * n1 + 0.10 * n2;
    d += 22.0 * sin(y * 150.0 + n1 * 7.0) * (1.0 - clamp(y, 0.0, 1.0));
    return max(d, 0.0);
  }
  void main() {
    vec2 uv = u_encode == 1 ? u_probe : v_uv;
    float asp = u_res.x / u_res.y;
    vec2 p = vec2((uv.x - 0.5) * asp, 1.0 - uv.y);
    float d = macroThickness(p);
    if (u_encode == 1) {
      float v = clamp(d / 1500.0, 0.0, 0.99998);
      o = vec4(floor(v * 255.0) / 255.0, fract(v * 255.0), 0.0, 1.0);
      return;
    }
    vec2 c = uv - 0.5;
    float cosi = clamp(1.0 - 0.35 * dot(c, c), 0.0, 1.0);
    vec3 film = texture(u_lut, vec2(d / D_MAX, cosi)).rgb;
    // плёнку освещает большой софтбокс: к краям кадра свет мягко гаснет
    vec2 q = (uv - vec2(0.42, 0.58)) * vec2(asp * 0.8, 1.0);
    float light = 3.9 * (0.5 + 0.5 * exp(-dot(q, q) * 1.4));
    o = vec4(film * light * u_os, 1.0);
  }`;

  const FS_BRIGHT = `#version 300 es
  precision highp float;
  in vec2 v_uv;
  out vec4 o;
  uniform sampler2D u_src;
  uniform vec2 u_texel;
  uniform float u_in;
  void main() {
    vec3 c = texture(u_src, v_uv + u_texel * vec2(-1.0, -1.0)).rgb
           + texture(u_src, v_uv + u_texel * vec2( 1.0, -1.0)).rgb
           + texture(u_src, v_uv + u_texel * vec2(-1.0,  1.0)).rgb
           + texture(u_src, v_uv + u_texel * vec2( 1.0,  1.0)).rgb;
    c *= 0.25 * u_in;
    float l = max(c.r, max(c.g, c.b));
    c *= smoothstep(0.8, 2.2, l);
    o = vec4(c / u_in, 1.0);
  }`;
  const FS_BLUR = `#version 300 es
  precision highp float;
  in vec2 v_uv;
  out vec4 o;
  uniform sampler2D u_src;
  uniform vec2 u_dir;
  void main() {
    vec3 c = texture(u_src, v_uv).rgb * 0.2270270270;
    c += (texture(u_src, v_uv + u_dir * 1.3846153846).rgb + texture(u_src, v_uv - u_dir * 1.3846153846).rgb) * 0.3162162162;
    c += (texture(u_src, v_uv + u_dir * 3.2307692308).rgb + texture(u_src, v_uv - u_dir * 3.2307692308).rgb) * 0.0702702703;
    o = vec4(c, 1.0);
  }`;
  const FS_COMPOSITE = `#version 300 es
  precision highp float;
  in vec2 v_uv;
  out vec4 o;
  uniform sampler2D u_hdr;
  uniform sampler2D u_bloom;
  uniform float u_in;
  uniform float u_fade;
  uniform float u_time;
  vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
  void main() {
    vec3 c = texture(u_hdr, v_uv).rgb * u_in;
    c += texture(u_bloom, v_uv).rgb * u_in * 0.6;
    c = aces(c);
    vec2 q = v_uv - 0.5;
    c *= 1.0 - 0.9 * dot(q, q);
    c = pow(c, vec3(1.0 / 2.2));
    float n = fract(sin(dot(gl_FragCoord.xy + fract(u_time * 7.13) * 91.0, vec2(12.9898, 78.233))) * 43758.5453);
    c += (n - 0.5) * (2.4 / 255.0);
    o = vec4(c * u_fade, 1.0);
  }`;

  // ---------- Сборка программ ----------
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
  function makeProgram(vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const count = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(p, i);
      u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name);
    }
    return { p, u };
  }

  let P;
  try {
    P = {
      bg: makeProgram(VS_FULL, FS_BG),
      bubble: makeProgram(VS_BUBBLE, FS_BUBBLE),
      drop: makeProgram(VS_DROP, FS_DROP),
      macro: makeProgram(VS_FULL, FS_MACRO),
      bright: makeProgram(VS_FULL, FS_BRIGHT),
      blur: makeProgram(VS_FULL, FS_BLUR),
      comp: makeProgram(VS_FULL, FS_COMPOSITE),
    };
  } catch (err) {
    console.error('Шейдер не собрался:', err.message);
    el.fallback.hidden = false;
    return;
  }

  // ---------- Буферы и текстуры ----------
  const lutTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, lutTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, LUT_W, LUT_H, 0, gl.RGBA, gl.FLOAT, lutData);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const emptyVAO = gl.createVertexArray();

  const bubbleVAO = gl.createVertexArray();
  gl.bindVertexArray(bubbleVAO);
  const quadVBO = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadVBO);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const INST_CAP = MAX_BUBBLES + 4;
  const instData = new Float32Array(INST_CAP * 16);
  const instVBO = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, instVBO);
  gl.bufferData(gl.ARRAY_BUFFER, instData.byteLength, gl.DYNAMIC_DRAW);
  for (let k = 0; k < 4; k++) {
    gl.enableVertexAttribArray(1 + k);
    gl.vertexAttribPointer(1 + k, 4, gl.FLOAT, false, 64, k * 16);
    gl.vertexAttribDivisor(1 + k, 1);
  }
  gl.bindVertexArray(null);

  const dropVAO = gl.createVertexArray();
  gl.bindVertexArray(dropVAO);
  const dropData = new Float32Array(MAX_DROPS * 4);
  const dropVBO = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, dropVBO);
  gl.bufferData(gl.ARRAY_BUFFER, dropData.byteLength, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  function makeRT(w, h, useFloat) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (useFloat) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
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
  function freeRT(rt) {
    if (!rt) return;
    gl.deleteTexture(rt.tex);
    gl.deleteFramebuffer(rt.fb);
  }

  // ---------- Размеры ----------
  let cssW = 1, cssH = 1, W = 1, H = 1, pixelRatio = 1, renderScale = 1;
  let hdr = null, bloomA = null, bloomB = null;
  const probeRT = makeRT(1, 1, false);

  function resize() {
    cssW = Math.max(1, window.innerWidth);
    cssH = Math.max(1, window.innerHeight);
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2) * renderScale;
    W = Math.max(1, Math.round(cssW * pixelRatio));
    H = Math.max(1, Math.round(cssH * pixelRatio));
    canvas.width = W;
    canvas.height = H;
    freeRT(hdr); freeRT(bloomA); freeRT(bloomB);
    hdr = makeRT(W, H, floatRT);
    const bw = Math.max(1, W >> 2), bh = Math.max(1, H >> 2);
    bloomA = makeRT(bw, bh, floatRT);
    bloomB = makeRT(bw, bh, floatRT);
  }
  const unit = () => Math.min(cssH, cssW * 1.25) / 900;

  // ---------- Случайность ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rnd = mulberry32(20260923);

  // ---------- Пузыри ----------
  const bubbles = [];
  const drops = [];

  function makeBubble(x, y, r, o = {}) {
    return {
      x, y, r,
      vx: o.vx || 0, vy: o.vy || 0,
      depth: o.depth ?? 1,
      age: o.age ?? 0,
      life: o.life ?? (15 + rnd() * 17),
      alive: o.alive ?? 5,
      seed: rnd(),
      spin: rnd() * Math.PI * 2,
      spinV: (rnd() - 0.5) * 0.3,
      wob: o.wob ?? 0.07,
      wobT: 0,
      pop: -1,
      hole: [rnd() * 0.6 - 0.3, rnd() * 0.6 - 0.3],
      alpha: o.alpha ?? 1,
      attached: false,
      isFlat: false,
    };
  }

  function seedScene() {
    bubbles.length = 0;
    drops.length = 0;
    const u = unit();
    const add = (fx, fy, r, depth, ageFrac, life) => {
      const b = makeBubble(fx * cssW, fy * cssH, r * u, { depth, life, age: ageFrac * life, wob: 0 });
      b.vx = (rnd() - 0.35) * 9 * u;
      b.vy = (rnd() - 0.55) * 7 * u;
      bubbles.push(b);
    };
    const narrow = cssW < 720;
    add(narrow ? 0.56 : 0.60, narrow ? 0.50 : 0.47, 175, 1.0, 0.36, 44);
    add(narrow ? 0.30 : 0.37, narrow ? 0.34 : 0.30, 92, 0.97, 0.56, 36);
    add(0.83, 0.70, 78, 1.02, 0.22, 38);
    add(0.49, 0.80, 44, 0.98, 0.3, 30);
    add(0.75, 0.19, 36, 0.93, 0.5, 30);
    add(0.27, 0.60, 30, 1.0, 0.12, 28);
    add(0.91, 0.42, 22, 0.9, 0.42, 26);
    add(0.55, 0.14, 16, 0.86, 0.62, 26);
    add(0.18, 0.40, 26, 0.72, 0.4, 32);
    add(0.44, 0.55, 18, 0.7, 0.2, 32);
    add(0.68, 0.88, 22, 0.74, 0.35, 32);
    add(0.97, 0.05, 230, 1.32, 0.3, 60);
  }

  // Рамки: пользовательская и «призрак», который выдувает пузыри, пока никто не трогает сцену
  function makeBlower() {
    return {
      x: 0, y: 0, vx: 0, vy: 0, dirx: 0.6, diry: -0.8,
      holding: false, area: Math.PI * RING_R * RING_R, target: 120,
      bubble: null, regrow: 1, vis: 0, cool: 0,
    };
  }
  const user = makeBlower();
  const ghost = makeBlower();
  ghost.vis = 1;
  let ghostT = 0;
  let lastUserInput = -1e9;
  let userPresent = false;

  function newTarget(bl, isGhost) {
    const u = unit();
    bl.target = (isGhost ? 42 + rnd() * 90 : 70 + rnd() * 105) * u;
  }
  newTarget(ghost, true);
  newTarget(user, false);

  function detach(bl, speed) {
    const b = bl.bubble;
    if (!b) return;
    const u = unit();
    b.attached = false;
    b.isFlat = false;
    b.alive = 0;
    b.wob = 0.09;
    b.wobT = 0;
    const push = 16 * u + Math.min(speed, 1200) * 0.05;
    b.vx = bl.vx * 0.32 + bl.dirx * push;
    b.vy = bl.vy * 0.32 + bl.diry * push;
    bl.bubble = null;
    bl.area = Math.PI * RING_R * RING_R;
    bl.regrow = 0;
    bl.cool = bl === ghost ? 1.0 + rnd() * 1.4 : 0.15;
    newTarget(bl, bl === ghost);
    stats.blown++;
    if (stats.blown === 4) el.hint.classList.add('faded');
  }

  function stepBlower(bl, dt, isGhost) {
    const u = unit();
    bl.regrow = Math.min(1, bl.regrow + dt / 0.3);
    if (bl.cool > 0) { bl.cool -= dt; }
    const speed = Math.hypot(bl.vx, bl.vy);
    if (!bl.holding || bl.cool > 0) {
      if (bl.bubble && !bl.holding) {
        // отпустили: крупный пузырь улетает, крошечный втягивается обратно в плёнку
        if (bl.bubble.r > RING_R + 6) detach(bl, speed);
        else { removeBubble(bl.bubble); bl.bubble = null; bl.area = Math.PI * RING_R * RING_R; }
      }
      return;
    }
    if (!bl.bubble) {
      if (bubbles.length >= MAX_BUBBLES) popOldest();
      const b = makeBubble(bl.x, bl.y, RING_R, { depth: 1, wob: 0, age: 0 });
      b.attached = true;
      b.life = 15 + rnd() * 16;
      bl.bubble = b;
      bubbles.push(b);
    }
    // пузырь растёт с противоположной движению стороны; если рамка стоит — вверх и вправо
    let dx = -bl.vx, dy = -bl.vy;
    const sp = Math.hypot(dx, dy);
    if (sp > 45) { dx /= sp; dy /= sp; } else { dx = 0.55; dy = -0.83; }
    const k = Math.min(1, dt * 5);
    bl.dirx += (dx - bl.dirx) * k;
    bl.diry += (dy - bl.diry) * k;
    const dl = Math.hypot(bl.dirx, bl.diry) || 1;
    bl.dirx /= dl; bl.diry /= dl;
    const holdRate = (isGhost ? 7000 : 11000) * u * u;
    bl.area += (holdRate + Math.min(speed, 1600) * 34 * u) * dt;
    const b = bl.bubble;
    b.r = Math.max(RING_R, Math.sqrt(bl.area / Math.PI));
    const off = Math.max(0, b.r - RING_R * 0.45);
    b.x = bl.x + bl.dirx * off;
    b.y = bl.y + bl.diry * off;
    b.isFlat = b.r <= RING_R + 0.5;
    b.alpha = isGhost ? ghost.vis : 1;
    if (b.r >= bl.target || (speed > 1100 && b.r > 30 * u)) detach(bl, speed);
  }

  function removeBubble(b) {
    const i = bubbles.indexOf(b);
    if (i >= 0) bubbles.splice(i, 1);
  }
  function popOldest() {
    let best = null;
    for (const b of bubbles) if (!b.attached && b.pop < 0 && (!best || b.age / b.life > best.age / best.life)) best = b;
    if (best) startPop(best, false);
  }

  function startPop(b, byUser) {
    if (b.pop >= 0) return;
    b.pop = 0;
    // капли разлетаются с краёв отступающей плёнки
    const n = Math.round(Math.min(90, Math.max(12, b.r * 0.42)));
    const u = unit();
    for (let i = 0; i < n && drops.length < MAX_DROPS; i++) {
      const a = rnd() * Math.PI * 2;
      const rr = b.r * (0.75 + rnd() * 0.25);
      const out = (70 + rnd() * 240) * (0.6 + b.r / (220 * u));
      drops.push({
        x: b.x + Math.cos(a) * rr, y: b.y + Math.sin(a) * rr,
        vx: Math.cos(a) * out + (rnd() - 0.5) * 60, vy: Math.sin(a) * out - rnd() * 80,
        life: 0.35 + rnd() * 0.6, t: 0, size: (1.1 + rnd() * 1.8) * Math.min(1.4, b.depth),
      });
    }
    playPop(b.r / u, byUser);
  }

  function windField(x, y, t) {
    const sx = x / cssW, sy = y / cssH;
    return [
      Math.sin(sy * 3.1 + t * 0.11) * 0.6 + Math.sin(sy * 7.3 - t * 0.17 + sx * 2.0) * 0.3 + 0.16,
      Math.cos(sx * 2.7 - t * 0.09) * 0.45 + Math.sin(sx * 6.1 + sy * 3.3 + t * 0.13) * 0.25 - 0.1,
    ];
  }

  const pointer = { x: -999, y: -999, vx: 0, vy: 0, down: false, inside: false, lastMove: 0, downX: 0, downY: 0, downT: 0, moved: 0, type: 'mouse' };
  const stats = { blown: 0 };

  function updateBubbles(dt) {
    const u = unit();
    const windK = +el.wind.value;
    const drainK = +el.drain.value;
    const motion = reduceMotion ? 0.5 : 1;
    const pointerFresh = time - pointer.lastMove < 0.08;

    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      if (b.attached) { b.age += dt * drainK * 0.3; b.spin += b.spinV * dt; continue; }
      if (b.pop >= 0) {
        b.pop += dt / 0.11;
        if (b.pop >= 1) bubbles.splice(i, 1);
        continue;
      }
      b.age += dt * drainK;
      b.alive += dt;
      b.wobT += dt;
      b.spin += b.spinV * dt;
      const par = 0.45 + 0.55 * b.depth;
      const [wx, wy] = windField(b.x, b.y, time);
      const sink = 11 * u * Math.pow(b.r / (80 * u), 0.25);
      const lift = 34 * u * Math.exp(-b.alive / 1.4);   // тёплое дыхание сначала поднимает пузырь
      const tx = wx * windK * 46 * u * motion;
      const ty = wy * windK * 30 * u * motion + sink - lift;
      const k = 1 - Math.exp(-dt * 0.8);
      b.vx += (tx - b.vx) * k;
      b.vy += (ty - b.vy) * k;
      if (pointerFresh) {
        const dx = b.x - pointer.x, dy = b.y - pointer.y;
        const R = b.r + 90;
        const d2 = dx * dx + dy * dy;
        if (d2 < R * R) {
          const f = 1 - Math.sqrt(d2) / R;
          b.vx += pointer.vx * f * 2.2 * dt;
          b.vy += pointer.vy * f * 2.2 * dt;
        }
      }
      b.x += b.vx * dt * par;
      b.y += b.vy * dt * par;
      if (b.age >= b.life || (b.age / b.life > 0.92 && rnd() < dt * 0.6)) startPop(b, false);
      const m = b.r * 1.6 + 40;
      if (b.x < -m || b.x > cssW + m || b.y < -m || b.y > cssH + m) bubbles.splice(i, 1);
    }

    // мягкие столкновения в одном слое глубины
    for (let i = 0; i < bubbles.length; i++) {
      const a = bubbles[i];
      if (a.pop >= 0) continue;
      for (let j = i + 1; j < bubbles.length; j++) {
        const b = bubbles[j];
        if (b.pop >= 0 || Math.abs(a.depth - b.depth) > 0.12) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const rr = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d, ny = dy / d;
        const overlap = rr - d;
        const ma = a.attached ? 0 : 1 / (a.r * a.r), mb = b.attached ? 0 : 1 / (b.r * b.r);
        const ms = ma + mb;
        if (ms === 0) continue;
        const push = overlap * 0.5;
        a.x -= nx * push * ma / ms * 2; a.y -= ny * push * ma / ms * 2;
        b.x += nx * push * mb / ms * 2; b.y += ny * push * mb / ms * 2;
        const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rv < 0) {
          const imp = -rv * 1.3 / ms;
          a.vx -= imp * ma * nx; a.vy -= imp * ma * ny;
          b.vx += imp * mb * nx; b.vy += imp * mb * ny;
          if (!a.attached && -rv > 20) { a.wob = Math.min(0.06, -rv / 900); a.wobT = 0; }
          if (!b.attached && -rv > 20) { b.wob = Math.min(0.06, -rv / 900); b.wobT = 0; }
        }
      }
    }

    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.t += dt;
      if (d.t >= d.life) { drops.splice(i, 1); continue; }
      d.vy += 760 * dt;
      d.vx *= 1 - dt * 1.2;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
    }
  }

  function updateBlowers(dt) {
    const u = unit();
    // призрак ходит по плавной фигуре Лиссажу в нижней левой части кадра
    const idle = time - lastUserInput > 7;
    const wantGhost = mode === 'bubbles' && (idle || !userPresent) && !pointer.down;
    ghost.vis += ((wantGhost ? 1 : 0) - ghost.vis) * Math.min(1, dt * (wantGhost ? 1.2 : 5));
    if (ghost.vis > 0.02) {
      ghostT += dt * (reduceMotion ? 0.5 : 1);
      const narrow = cssW < 720;
      const cx = cssW * (narrow ? 0.24 : 0.2), cy = cssH * (narrow ? 0.66 : 0.72);
      const nx = cx + Math.sin(ghostT * 0.37) * 70 * u + Math.sin(ghostT * 0.83) * 18 * u;
      const ny = cy + Math.sin(ghostT * 0.53 + 1.0) * 46 * u;
      if (dt > 0) { ghost.vx = (nx - ghost.x) / dt; ghost.vy = (ny - ghost.y) / dt; }
      ghost.x = nx; ghost.y = ny;
      ghost.holding = wantGhost;
    } else {
      ghost.holding = false;
    }
    stepBlower(ghost, dt, true);

    user.x = pointer.x; user.y = pointer.y;
    const fresh = time - pointer.lastMove < 0.06;
    user.vx = fresh ? pointer.vx : user.vx * Math.exp(-dt * 12);
    user.vy = fresh ? pointer.vy : user.vy * Math.exp(-dt * 12);
    user.holding = pointer.down && mode === 'bubbles';
    stepBlower(user, dt, false);
    user.vis = mode === 'bubbles' && userPresent && (pointer.inside || pointer.down) ? 1 : 0;
  }

  // ---------- Макрорежим ----------
  const vort = [];
  let vortSign = 1;
  let lastStir = 0;
  let macroT = 0;
  const vortData = new Float32Array(40);

  function stir(px, py, vx, vy) {
    const speed = Math.hypot(vx, vy);
    if (speed < 30 || time - lastStir < 0.07) return;
    lastStir = time;
    const asp = cssW / cssH;
    vortSign = -vortSign;
    const v = {
      x: (px / cssW - 0.5) * asp,
      y: py / cssH,
      w: vortSign * Math.min(3.2, 0.6 + speed / 700),
      phi: 0,
      R: 0.06 + Math.min(0.12, speed / 9000),
    };
    if (vort.length >= 10) vort.shift();
    vort.push(v);
  }
  function updateMacro(dt) {
    macroT += dt * +el.drain.value;
    for (const v of vort) {
      v.phi += v.w * dt;
      v.w *= Math.exp(-dt / 1.4);
      v.R *= 1 + dt * 0.02;
    }
    vortData.fill(0);
    vort.forEach((v, i) => { vortData.set([v.x, v.y, v.phi, v.R], i * 4); });
  }

  // ---------- Шкала толщин ----------
  const aces = (x) => Math.min(1, Math.max(0, (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14)));
  const LEGEND_MAX = 1000;
  function drawLegend() {
    const c = el.legend;
    const hCss = 320;
    c.width = 10 * 2;
    c.height = hCss * 2;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(c.width, c.height);
    const row = (LUT_H - 1) * LUT_W;
    for (let y = 0; y < c.height; y++) {
      const d = (y / (c.height - 1)) * LEGEND_MAX;
      const fi = (d / D_MAX) * (LUT_W - 1);
      const i0 = Math.floor(fi), f = fi - i0;
      const o0 = (row + i0) * 4, o1 = (row + Math.min(LUT_W - 1, i0 + 1)) * 4;
      const rgb = [0, 1, 2].map((k) => {
        const v = (lutData[o0 + k] * (1 - f) + lutData[o1 + k] * f) * 11;
        return Math.round(255 * Math.pow(aces(v), 1 / 2.2));
      });
      for (let x = 0; x < c.width; x++) {
        const o = (y * c.width + x) * 4;
        img.data[o] = rgb[0]; img.data[o + 1] = rgb[1]; img.data[o + 2] = rgb[2]; img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const nbsp = ' ';
    el.ticks.innerHTML = [0, 200, 400, 600, 800, 1000]
      .map((d) => `<span style="top:${(d / LEGEND_MAX) * hCss}px">${d}${d === 0 ? nbsp + 'нм' : ''}</span>`).join('');
    el.orders.innerHTML = ['I', 'II', 'III', 'IV']
      .map((r, i) => `<span style="top:${((i + 0.5) * ORDER_STEP / LEGEND_MAX) * hCss}px">${r}</span>`).join('');
  }
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
  function showMarker(d) {
    if (d == null) { el.marker.classList.remove('on'); return; }
    const top = Math.min(1, d / LEGEND_MAX) * 320;
    el.marker.style.transform = `translateY(${top}px)`;
    el.marker.classList.add('on');
    el.markerLabel.textContent = `${Math.round(d)} нм`;
  }

  // ---------- Звук ----------
  let actx = null, master = null, noiseBuf = null, blowGain = null;
  let soundOn = true;
  function initAudio() {
    if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    actx = new AC();
    master = actx.createGain();
    master.gain.value = soundOn ? 0.55 : 0;
    master.connect(actx.destination);
    noiseBuf = actx.createBuffer(1, Math.floor(actx.sampleRate * 1.5), actx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = actx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const bp = actx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 650;
    bp.Q.value = 0.6;
    blowGain = actx.createGain();
    blowGain.gain.value = 0;
    src.connect(bp).connect(blowGain).connect(master);
    src.start();
  }
  function playPop(size, loud) {
    if (!actx || !soundOn) return;
    const t = actx.currentTime;
    const vol = (loud ? 0.42 : 0.14) * (0.45 + Math.min(1, size / 150));
    const src = actx.createBufferSource();
    src.buffer = noiseBuf;
    const bp = actx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2400 + 2400 * (1 - Math.min(1, size / 180)) + Math.random() * 600;
    bp.Q.value = 1.1;
    const g = actx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.07);
    src.connect(bp).connect(g).connect(master);
    src.start(t, Math.random());
    src.stop(t + 0.1);
    const osc = actx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(Math.max(110, 260 - size), t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.06);
    const og = actx.createGain();
    og.gain.setValueAtTime(vol * 0.5, t);
    og.gain.exponentialRampToValueAtTime(0.0008, t + 0.07);
    osc.connect(og).connect(master);
    osc.start(t);
    osc.stop(t + 0.08);
  }
  function updateBlowSound() {
    if (!actx || !blowGain) return;
    const sp = Math.hypot(pointer.vx, pointer.vy);
    const active = pointer.down && (time - pointer.lastMove < 0.1 || mode === 'bubbles');
    const target = active ? Math.min(0.1, 0.018 + sp / 14000) : 0;
    blowGain.gain.setTargetAtTime(soundOn ? target : 0, actx.currentTime, 0.06);
  }

  // ---------- Режимы ----------
  let mode = 'bubbles';
  let fade = 1, fadeTarget = 1, pendingMode = null, pendingRedip = false;

  function setMode(m) {
    if (m === mode && !pendingMode) return;
    pendingMode = m;
    fadeTarget = 0;
    segButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
  }
  function applyMode(m) {
    mode = m;
    document.body.classList.toggle('mode-macro', m === 'macro');
    document.body.classList.toggle('mode-bubbles', m === 'bubbles');
    el.hint.classList.remove('faded');
    el.tag.classList.remove('on');
    el.probe.classList.remove('on');
    showMarker(null);
    if (m === 'macro' && macroT === 0) macroT = 48;
  }

  // ---------- Ввод ----------
  function markInput() { lastUserInput = time; }

  canvas.addEventListener('pointerdown', (e) => {
    initAudio();
    markInput();
    pointer.type = e.pointerType;
    document.body.classList.toggle('touch', e.pointerType !== 'mouse');
    userPresent = true;
    try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* не критично */ }
    pointer.down = true;
    pointer.inside = true;
    pointer.x = e.clientX; pointer.y = e.clientY;
    pointer.downX = e.clientX; pointer.downY = e.clientY;
    pointer.downT = performance.now();
    pointer.moved = 0;
    pointer.vx = 0; pointer.vy = 0;
    pointer.lastMove = time;
  });

  let lastMoveStamp = 0;
  canvas.addEventListener('pointermove', (e) => {
    const now = performance.now();
    const dtm = Math.max(1, now - (lastMoveStamp || now - 16)) / 1000;
    lastMoveStamp = now;
    const dx = e.clientX - pointer.x, dy = e.clientY - pointer.y;
    if (pointer.x > -900) {
      pointer.vx += (dx / dtm - pointer.vx) * 0.35;
      pointer.vy += (dy / dtm - pointer.vy) * 0.35;
      pointer.moved += Math.hypot(dx, dy);
    }
    pointer.x = e.clientX; pointer.y = e.clientY;
    pointer.inside = true;
    pointer.lastMove = time;
    if (e.pointerType === 'mouse') { userPresent = true; document.body.classList.remove('touch'); }
    markInput();
    if (mode === 'macro' && pointer.down) stir(pointer.x, pointer.y, pointer.vx, pointer.vy);
  });

  function endPointer(e) {
    if (!pointer.down) return;
    pointer.down = false;
    const quick = performance.now() - pointer.downT < 380 && pointer.moved < 8;
    if (quick && mode === 'bubbles') {
      // клик: лопаем пузырь под курсором (самый близкий к зрителю)
      const hit = pickBubble(e.clientX, e.clientY);
      if (user.bubble && user.bubble.r < RING_R + 30) { removeBubble(user.bubble); user.bubble = null; user.area = Math.PI * RING_R * RING_R; }
      if (hit) startPop(hit, true);
    }
    if (e.pointerType !== 'mouse') pointer.inside = false;
  }
  window.addEventListener('pointerup', endPointer);
  window.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('pointerleave', (e) => { if (!pointer.down && e.pointerType === 'mouse') pointer.inside = false; });

  function pickBubble(x, y) {
    let best = null;
    for (const b of bubbles) {
      if (b.attached || b.pop >= 0) continue;
      const dx = x - b.x, dy = y - b.y;
      if (dx * dx + dy * dy <= b.r * b.r && (!best || b.depth > best.depth)) best = b;
    }
    return best;
  }

  function blowRandom() {
    const u = unit();
    if (bubbles.length >= MAX_BUBBLES) popOldest();
    const b = makeBubble(cssW * (0.15 + rnd() * 0.3), cssH * (0.6 + rnd() * 0.25), (30 + rnd() * 90) * u, { alive: 0 });
    b.vx = (20 + rnd() * 40) * u;
    b.vy = -(10 + rnd() * 30) * u;
    b.wob = 0.08;
    bubbles.push(b);
  }

  window.addEventListener('keydown', (e) => {
    if (e.target && e.target.tagName === 'INPUT' && e.code !== 'KeyM') return;
    if (e.code === 'KeyM') { initAudio(); setMode(mode === 'macro' ? 'bubbles' : 'macro'); markInput(); }
    else if (e.code === 'Space' && mode === 'bubbles' && !(e.target && e.target.tagName === 'BUTTON')) { e.preventDefault(); initAudio(); blowRandom(); markInput(); }
    else if (e.code === 'KeyS') toggleSound();
  });

  segButtons.forEach((b) => b.addEventListener('click', () => { initAudio(); setMode(b.dataset.mode); markInput(); }));
  el.redip.addEventListener('click', () => { pendingRedip = true; fadeTarget = 0; markInput(); });

  function toggleSound() {
    soundOn = !soundOn;
    el.sound.setAttribute('aria-pressed', String(soundOn));
    el.sound.setAttribute('aria-label', soundOn ? 'Звук включён' : 'Звук выключен');
    if (master) master.gain.setTargetAtTime(soundOn ? 0.55 : 0, actx.currentTime, 0.05);
  }
  el.sound.addEventListener('click', () => { initAudio(); toggleSound(); });

  function syncFill(input) {
    const p = ((input.value - input.min) / (input.max - input.min)) * 100;
    input.style.setProperty('--fill', p + '%');
  }
  [el.wind, el.drain].forEach((inp) => { syncFill(inp); inp.addEventListener('input', () => syncFill(inp)); });

  // ---------- Отрисовка ----------
  function sortedInstances() {
    const list = bubbles.slice().sort((a, b) => a.depth - b.depth);
    let n = 0;
    const put = (b, rOverride, isFlat, alpha) => {
      if (n >= INST_CAP) return;
      const o = n * 16;
      const w = b.wob * Math.exp(-b.wobT / 0.7) * Math.sin(b.wobT * 13);
      instData[o] = b.x; instData[o + 1] = b.y; instData[o + 2] = rOverride; instData[o + 3] = b.depth;
      instData[o + 4] = Math.min(1, b.age / b.life); instData[o + 5] = b.seed; instData[o + 6] = b.pop; instData[o + 7] = b.spin;
      instData[o + 8] = 1 + w; instData[o + 9] = 1 - w; instData[o + 10] = b.hole[0]; instData[o + 11] = b.hole[1];
      const blur = Math.abs(b.depth - 1) * 0.35;
      instData[o + 12] = alpha * (1 - Math.min(0.3, blur)); instData[o + 13] = blur; instData[o + 14] = isFlat ? 1 : 0; instData[o + 15] = 0;
      n++;
    };
    for (const b of list) {
      if (b.attached && b.isFlat) continue;
      put(b, b.r, false, b.alpha);
    }
    // плёнка внутри рамок
    for (const bl of [ghost, user]) {
      if (bl.vis < 0.02 || mode !== 'bubbles') continue;
      const flatB = { x: bl.x, y: bl.y, depth: 1, age: 2, life: 18, seed: bl === ghost ? 0.31 : 0.77, pop: -1, spin: time * 0.2, hole: [0, 0], wob: 0, wobT: 0 };
      put(flatB, RING_R - 1, true, bl.vis * bl.regrow * 0.95);
    }
    return n;
  }

  function drawFull(prog) {
    gl.useProgram(prog.p);
    gl.bindVertexArray(emptyVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function render() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, hdr.fb);
    gl.viewport(0, 0, W, H);
    gl.disable(gl.BLEND);

    if (mode === 'macro') {
      const m = P.macro;
      gl.useProgram(m.p);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, lutTex);
      gl.uniform1i(m.u.u_lut, 0);
      gl.uniform2f(m.u.u_res, cssW, cssH);
      gl.uniform1f(m.u.u_t, macroT);
      gl.uniform1f(m.u.u_time, time);
      gl.uniform4fv(m.u.u_vort, vortData);
      gl.uniform1i(m.u.u_encode, 0);
      gl.uniform2f(m.u.u_probe, 0, 0);
      gl.uniform1f(m.u.u_os, OUT_SCALE);
      drawFull(m);
    } else {
      const bg = P.bg;
      gl.useProgram(bg.p);
      gl.uniform2f(bg.u.u_res, cssW, cssH);
      gl.uniform1f(bg.u.u_time, time);
      gl.uniform1f(bg.u.u_os, OUT_SCALE);
      drawFull(bg);

      const n = sortedInstances();
      if (n > 0) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        const b = P.bubble;
        gl.useProgram(b.p);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, lutTex);
        gl.uniform1i(b.u.u_lut, 0);
        gl.uniform2f(b.u.u_res, cssW, cssH);
        gl.uniform1f(b.u.u_time, time);
        gl.uniform1f(b.u.u_os, OUT_SCALE);
        gl.bindBuffer(gl.ARRAY_BUFFER, instVBO);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, instData, 0, n * 16);
        gl.bindVertexArray(bubbleVAO);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
      }
      if (drops.length) {
        let k = 0;
        for (const d of drops) {
          const f = 1 - d.t / d.life;
          dropData[k++] = d.x; dropData[k++] = d.y; dropData[k++] = d.size; dropData[k++] = f * f;
        }
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        const dp = P.drop;
        gl.useProgram(dp.p);
        gl.uniform2f(dp.u.u_res, cssW, cssH);
        gl.uniform1f(dp.u.u_dpr, pixelRatio);
        gl.uniform1f(dp.u.u_os, OUT_SCALE);
        gl.bindBuffer(gl.ARRAY_BUFFER, dropVBO);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, dropData, 0, drops.length * 4);
        gl.bindVertexArray(dropVAO);
        gl.drawArrays(gl.POINTS, 0, drops.length);
      }
      gl.disable(gl.BLEND);
    }
    gl.bindVertexArray(null);

    // свечение ярких бликов
    const inv = 1 / OUT_SCALE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, bloomA.fb);
    gl.viewport(0, 0, bloomA.w, bloomA.h);
    gl.useProgram(P.bright.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, hdr.tex);
    gl.uniform1i(P.bright.u.u_src, 0);
    gl.uniform2f(P.bright.u.u_texel, 1 / W, 1 / H);
    gl.uniform1f(P.bright.u.u_in, inv);
    drawFull(P.bright);
    for (let i = 0; i < 2; i++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, bloomB.fb);
      gl.useProgram(P.blur.p);
      gl.bindTexture(gl.TEXTURE_2D, bloomA.tex);
      gl.uniform1i(P.blur.u.u_src, 0);
      gl.uniform2f(P.blur.u.u_dir, (1 + i) / bloomA.w, 0);
      drawFull(P.blur);
      gl.bindFramebuffer(gl.FRAMEBUFFER, bloomA.fb);
      gl.bindTexture(gl.TEXTURE_2D, bloomB.tex);
      gl.uniform2f(P.blur.u.u_dir, 0, (1 + i) / bloomA.h);
      drawFull(P.blur);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    const c = P.comp;
    gl.useProgram(c.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, hdr.tex);
    gl.uniform1i(c.u.u_hdr, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, bloomA.tex);
    gl.uniform1i(c.u.u_bloom, 1);
    gl.uniform1f(c.u.u_in, inv);
    gl.uniform1f(c.u.u_fade, fade);
    gl.uniform1f(c.u.u_time, time);
    drawFull(c);
    gl.activeTexture(gl.TEXTURE0);
  }

  // Толщина плёнки в точке экрана (макрорежим): тот же шейдер рисует один пиксель в «кодированном» виде
  const probePx = new Uint8Array(4);
  function probeThickness(x, y) {
    const m = P.macro;
    gl.bindFramebuffer(gl.FRAMEBUFFER, probeRT.fb);
    gl.viewport(0, 0, 1, 1);
    gl.useProgram(m.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, lutTex);
    gl.uniform1i(m.u.u_lut, 0);
    gl.uniform2f(m.u.u_res, cssW, cssH);
    gl.uniform1f(m.u.u_t, macroT);
    gl.uniform1f(m.u.u_time, time);
    gl.uniform4fv(m.u.u_vort, vortData);
    gl.uniform1i(m.u.u_encode, 1);
    gl.uniform2f(m.u.u_probe, x / cssW, 1 - y / cssH);
    gl.uniform1f(m.u.u_os, 1);
    drawFull(m);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, probePx);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return (probePx[0] / 255 + probePx[1] / 255 / 255) * 1500;
  }

  // ---------- Подписи ----------
  const fmt1 = (v) => v.toFixed(1).replace('.', ',');
  let lastProbe = 0;
  function updateLabels() {
    const showPointer = pointer.inside && userPresent;
    if (mode === 'bubbles') {
      el.probe.classList.remove('on');
      const hover = showPointer && pointer.type === 'mouse' && !pointer.down ? pickBubble(pointer.x, pointer.y) : null;
      if (hover) {
        const a = Math.min(1, hover.age / hover.life);
        const dTop = 620 * Math.pow(1 - a, 1.5);
        const dia = hover.r * 2 * PX_TO_CM / unit();
        const left = hover.x + hover.r * 0.72 + 10;
        const top = hover.y - hover.r * 0.72;
        const flip = left > cssW - 250;
        const tx = flip ? hover.x - hover.r * 0.72 - 250 : left;
        el.tag.style.transform = `translate(${Math.round(tx)}px, ${Math.round(Math.max(12, top))}px)`;
        el.tag.innerHTML = `Ø ${fmt1(dia)}&nbsp;см · макушка <b>≈&nbsp;${Math.round(dTop)}&nbsp;нм</b>`;
        el.tag.classList.add('on');
        showMarker(dTop);
      } else {
        el.tag.classList.remove('on');
        showMarker(null);
      }
    } else {
      el.tag.classList.remove('on');
      if (showPointer && (pointer.type === 'mouse' || pointer.down)) {
        if (time - lastProbe > 0.08) {
          lastProbe = time;
          const d = probeThickness(pointer.x, pointer.y);
          const ord = d < 30 ? 'чёрная плёнка' : `${ROMAN[Math.min(6, Math.floor(d / ORDER_STEP))]} порядок`;
          el.probe.innerHTML = `<b>${Math.round(d)}&nbsp;нм</b> · ${ord}`;
          showMarker(d);
        }
        el.probe.style.transform = `translate(${Math.round(pointer.x + 16)}px, ${Math.round(pointer.y + 14)}px)`;
        el.probe.classList.add('on');
      } else {
        el.probe.classList.remove('on');
        showMarker(null);
      }
    }
  }

  function placeWands() {
    const show = (node, bl, on) => {
      node.style.transform = `translate(${Math.round(bl.x - 70)}px, ${Math.round(bl.y - 70)}px)`;
      node.classList.toggle('on', on);
    };
    show(el.ghost, ghost, mode === 'bubbles' && ghost.vis > 0.5);
    show(el.wand, user, mode === 'bubbles' && user.vis > 0.5);
  }

  // ---------- Главный цикл ----------
  let time = 0;
  let last = performance.now();
  let slowFrames = 0, fastFrames = 0;

  function step(dt, realDt = dt) {
    // переходы между режимами идут по реальному времени, даже если кадры редкие
    if (pendingMode || pendingRedip) {
      fade = Math.max(0, fade - realDt / 0.28);
      if (fade === 0) {
        if (pendingMode) { applyMode(pendingMode); pendingMode = null; }
        if (pendingRedip) { macroT = 1; vort.length = 0; pendingRedip = false; }
        fadeTarget = 1;
      }
    } else if (fade < fadeTarget) {
      fade = Math.min(1, fade + realDt / 0.45);
    }
    if (mode === 'bubbles') {
      updateBlowers(dt);
      updateBubbles(dt);
    } else {
      updateMacro(dt);
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const rawDt = (now - last) / 1000;
    last = now;
    if (document.hidden) return;
    const dt = Math.min(1 / 30, Math.max(0, rawDt));
    time += dt;
    step(dt, Math.min(0.25, Math.max(0, rawDt)));
    render();
    placeWands();
    updateLabels();
    updateBlowSound();

    // адаптивное разрешение для слабых видеокарт (программный рендер не трогаем — там важна чёткость)
    if (!softwareGL) {
      if (rawDt > 0.024) { slowFrames++; fastFrames = 0; } else if (rawDt < 0.012) { fastFrames++; slowFrames = 0; }
      if (slowFrames > 45 && renderScale > 0.6) { renderScale = Math.max(0.6, renderScale - 0.15); slowFrames = 0; resize(); }
      if (fastFrames > 240 && renderScale < 1) { renderScale = Math.min(1, renderScale + 0.1); fastFrames = 0; resize(); }
    }
  }

  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => {
    last = performance.now();
    if (document.hidden && blowGain && actx) blowGain.gain.setTargetAtTime(0, actx.currentTime, 0.02);
  });

  // ---------- Старт ----------
  resize();
  drawLegend();
  seedScene();
  ghost.x = cssW * 0.2; ghost.y = cssH * 0.72;
  ghost.area = Math.PI * Math.pow(RING_R + 18 * unit(), 2);
  // короткая предварительная симуляция: к первому кадру сцена уже живая
  for (let i = 0; i < 60; i++) { time += 1 / 60; step(1 / 60); }
  requestAnimationFrame((t) => { last = t; frame(t); });
})();
