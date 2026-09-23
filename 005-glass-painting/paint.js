'use strict';
/* ==========================================================================
   paint.js — «масло на стекле» на WebGL2.
   Конвейер кадра:
     1. morph     — две подмалёвки (сцены A и B) размазываются «пальцем» друг в друга;
     2. tensor    — структурный тензор картинки (куда идут края форм);
     3. blur ×2   — сглаживание тензора: получается плавное поле направлений;
     4. paint     — мазки: краска тянется вдоль поля (интеграл по линии тока),
                    из шума вдоль тех же линий получается рельеф щетины и пальца;
     5. bloom     — свечение на просвет (стекло подсвечено снизу);
     6. composite — рельеф краски, блик масла, иней, зерно, неровный край стекла.
   ========================================================================== */

const Painter = (() => {
  const VS = `#version 300 es
in vec2 aPos; out vec2 vUv;
void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

  const HEAD = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv; out vec4 o;
float hash21(vec2 p){ p = fract(p * vec2(233.34, 851.73)); p += dot(p, p + 23.45); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), u.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), u.x), u.y); }
float fbm(vec2 p){ float s = 0., a = .5; for (int i = 0; i < 4; i++){ s += a * vn(p); p = p * 2.03 + vec2(17.3, 9.1); a *= .5; } return s; }
float luma(vec3 c){ return dot(c, vec3(.299, .587, .114)); }
`;

  // 1. Переход «пальцем»: краска старой сцены утаскивается вдоль поля, новая проступает и оседает.
  const FS_MORPH = HEAD + `
uniform sampler2D uA, uB;
uniform float uP, uSeed, uAsp;
uniform int uMode;
uniform vec2 uC;
void main(){
  vec2 uv = vUv;
  vec2 q = vec2(uv.x * uAsp, uv.y), c = vec2(uC.x * uAsp, uC.y);
  float n = fbm(q * 2.4 + uSeed), n2 = fbm(q * 5.1 - uSeed * 1.7);
  vec2 d = q - c; float r = length(d);
  vec2 dir; float ord; float L = .17;
  if (uMode == 0) {            // вихрь от центра
    dir = normalize(vec2(-d.y, d.x) + 1e-4);
    ord = clamp(r / (.62 * uAsp), 0., 1.) * .85 + (n - .5) * .35;
  } else if (uMode == 1) {     // полосы пальцем слева направо
    float band = floor(uv.y * 6. + (n - .5) * 1.6);
    dir = normalize(vec2(1., (n2 - .5) * .9));
    ord = uv.x * .7 + hash21(vec2(band, uSeed)) * .26 + (n - .5) * .16;
  } else if (uMode == 2) {     // диагональ: сверху справа вниз влево
    dir = normalize(vec2(-1., -.5) + (vec2(n, n2) - .5) * .7);
    ord = (1. - uv.x) * .5 + (1. - uv.y) * .4 + (n - .5) * .32;
  } else if (uMode == 3) {     // «наезд»: новое проступает из центра, старое уходит к краям
    dir = normalize(d + 1e-4);
    ord = clamp(r / (.7 * uAsp), 0., 1.) + (n - .5) * .3;
  } else {                     // подъём: снизу вверх
    dir = normalize(vec2((n2 - .5) * .8, 1.));
    ord = uv.y * .78 + (n - .5) * .3;
  }
  float k = smoothstep(ord - .2, ord + .2, uP * 1.4 - .2);
  float sA = L * smoothstep(0., .75, k);
  float sB = L * (1. - smoothstep(.25, 1., k));
  vec3 ca = vec3(0.), cb = vec3(0.);
  float j = hash21(uv * vec2(1733., 977.) + uSeed);
  for (int i = 0; i < 8; i++) {
    float t = (float(i) + j) / 8.;
    vec2 oa, ob;
    if (uMode == 0) {          // поворот вокруг центра
      float aa = -sA * t / max(r, .08), ab = -sB * t / max(r, .08);
      vec2 da = mat2(cos(aa), sin(aa), -sin(aa), cos(aa)) * d - d;
      vec2 db = mat2(cos(ab), sin(ab), -sin(ab), cos(ab)) * d - d;
      oa = da; ob = db;
    } else { oa = -dir * sA * t; ob = -dir * sB * t; }
    ca += texture(uA, uv + vec2(oa.x / uAsp, oa.y)).rgb;
    cb += texture(uB, uv + vec2(ob.x / uAsp, ob.y)).rgb;
  }
  ca *= .125; cb *= .125;
  float m = smoothstep(.36, .64, k + (n2 - .5) * .16);
  vec3 col = mix(ca, cb, m);
  vec3 pig = sqrt(max(ca * cb, 0.));                 // смешение пигментов темнее, чем света
  col = mix(col, pig, 1.6 * m * (1. - m));
  o = vec4(col, 1.);
}`;

  // 2. Структурный тензор (градиенты по трём каналам)
  const FS_TENSOR = HEAD + `
uniform sampler2D uSrc; uniform vec2 uPx; uniform vec2 uEnc;
vec3 S(vec2 o2){ return texture(uSrc, vUv + o2 * uPx).rgb; }
void main(){
  vec3 tl = S(vec2(-1, 1)), t = S(vec2(0, 1)), tr = S(vec2(1, 1));
  vec3 l = S(vec2(-1, 0)), r = S(vec2(1, 0));
  vec3 bl = S(vec2(-1, -1)), b = S(vec2(0, -1)), br = S(vec2(1, -1));
  vec3 gx = (tr + 2. * r + br - tl - 2. * l - bl) * .25;
  vec3 gy = (tl + 2. * t + tr - bl - 2. * b - br) * .25;
  vec3 T = vec3(dot(gx, gx), dot(gx, gy), dot(gy, gy));
  o = vec4(T * uEnc.x + vec3(0., uEnc.y, 0.), 1.);
}`;

  // 3. Гаусс (9 отсчётов через 5 билинейных выборок)
  const FS_BLUR = HEAD + `
uniform sampler2D uSrc; uniform vec2 uDir;
void main(){
  vec4 s = texture(uSrc, vUv) * .2270270270;
  s += texture(uSrc, vUv + uDir * 1.3846153846) * .3162162162;
  s += texture(uSrc, vUv - uDir * 1.3846153846) * .3162162162;
  s += texture(uSrc, vUv + uDir * 3.2307692308) * .0702702703;
  s += texture(uSrc, vUv - uDir * 3.2307692308) * .0702702703;
  o = s;
}`;

  // 4. Мазки: интеграл вдоль линий тока поля направлений
  const FS_PAINT = HEAD + `
uniform sampler2D uSrc, uTen, uNoise;
uniform vec2 uRes, uEnc;
uniform float uLen, uSeed, uFree;
const int N = 12;
vec2 tangentAt(vec2 uv, vec2 fb){
  vec3 t = texture(uTen, uv).xyz;
  t = (t - vec3(0., uEnc.y, 0.)) / uEnc.x;
  float E = t.x, F = t.y, G = t.z;
  float D = sqrt(max((E - G) * (E - G) + 4. * F * F, 0.));
  float l1 = .5 * (E + G + D);
  vec2 v = vec2(l1 - E, -F);
  float len = length(v);
  v = len > 1e-7 ? v / len : vec2(0., 1.);
  float s = smoothstep(.0008, .012, l1) ;
  if (dot(v, fb) < 0.) v = -v;
  return normalize(mix(fb, v, max(s, 1. - uFree)) + 1e-5);
}
void main(){
  vec2 px = 1. / uRes;
  float asp = uRes.x / uRes.y;
  // «свободное» направление мазка там, где форм нет (небо, снег): плавные завитки
  vec4 lo = texture(uNoise, vUv * vec2(asp, 1.) * .55 + vec2(uSeed * .003, 0.));
  float ang = (lo.b - .5) * 2.6 + (lo.a - .5) * .3;
  vec2 fb = vec2(cos(ang), sin(ang) * .75);
  fb = normalize(fb);
  vec2 t0 = tangentAt(vUv, fb);
  vec2 nsF = uRes / 340., nsC = uRes / 1400.;
  vec2 sd = vec2(uSeed * .37, uSeed * .71);
  vec3 sum = texture(uSrc, vUv).rgb; float ws = 1.;
  float sF = texture(uNoise, vUv * nsF + sd).r, sC = texture(uNoise, vUv * nsC + sd * .5).g;
  for (int dir = -1; dir <= 1; dir += 2) {
    vec2 p = vUv; vec2 v = t0 * float(dir);
    for (int i = 1; i <= N; i++) {
      vec2 tt = tangentAt(p, fb);
      if (dot(tt, v) < 0.) tt = -tt;
      v = tt;
      p += v * px * uLen;
      float w = exp(-float(i * i) / 72.);
      sum += texture(uSrc, p).rgb * w; ws += w;
      sF += texture(uNoise, p * nsF + sd).r * w;
      sC += texture(uNoise, p * nsC + sd * .5).g * w;
    }
  }
  vec3 col = sum / ws;
  float f = sF / ws - .5, c = sC / ws - .5;
  vec3 T0 = (texture(uTen, vUv).xyz - vec3(0., uEnc.y, 0.)) / uEnc.x;
  float edge = smoothstep(.002, .03, T0.x + T0.z);
  float h = clamp(.5 + (f * 1.5 + c * 1.3) * mix(.6, 1., edge), 0., 1.);
  // пятнистость слоя краски
  float mott = texture(uNoise, vUv * vec2(asp, 1.) * 2.2 + sd * .1).a - .5;
  col *= 1. + mott * .07;
  o = vec4(col, h);
}`;

  // 5. Яркие места для свечения
  const FS_BRIGHT = HEAD + `
uniform sampler2D uSrc; uniform float uThr;
void main(){
  vec3 c = texture(uSrc, vUv).rgb;
  float l = max(c.r, max(c.g, c.b));
  o = vec4(c * smoothstep(uThr, 1., l), 1.);
}`;

  // 6. Итоговый кадр
  const FS_COMP = HEAD + `
uniform sampler2D uPaint, uBloom, uNoise;
uniform vec2 uRes, uPRes, uWeave;
uniform float uFrame, uBump, uBloomAmt, uGrain, uVig, uFrost, uMelt, uSat, uWarm, uFade, uExpo, uEdge;
uniform vec3 uFadeCol;
float crystals(vec2 q){
  float s = 0., a = .6; vec2 p = q;
  for (int i = 0; i < 4; i++){
    float v = texture(uNoise, p).b;
    s += a * pow(1. - abs(v * 2. - 1.), 7.);
    p = mat2(1.7, 1.1, -1.1, 1.7) * p + vec2(.31, .17); a *= .6;
  }
  return s;
}
void main(){
  vec2 uv = vUv + uWeave / uRes;
  float asp = uRes.x / uRes.y;
  vec2 d = 1. / uPRes;
  vec4 P = texture(uPaint, uv);
  float hl = texture(uPaint, uv - vec2(d.x, 0.)).a, hr = texture(uPaint, uv + vec2(d.x, 0.)).a;
  float hd = texture(uPaint, uv - vec2(0., d.y)).a, hu = texture(uPaint, uv + vec2(0., d.y)).a;
  vec3 n = normalize(vec3((hl - hr) * uBump, (hd - hu) * uBump, 1.));
  vec3 L = normalize(vec3(-.45, .55, .7));
  float diff = dot(n, L) / L.z;
  vec3 col = P.rgb * mix(1., diff, .5);
  vec3 Hh = normalize(L + vec3(0., 0., 1.));
  float spec = pow(max(dot(n, Hh), 0.), 70.);
  col += spec * .07 * (.35 + luma(P.rgb));
  col *= 1.035 - .07 * P.a;                                 // тонкий слой светится на просвет
  col += texture(uBloom, uv).rgb * uBloomAmt;
  col *= uExpo;
  // иней на стекле: растёт от краёв, тает от центра
  if (uFrost > .001) {
    vec2 q = vec2(vUv.x * asp, vUv.y);
    float e = min(min(vUv.x, 1. - vUv.x) * asp, min(vUv.y, 1. - vUv.y));
    float nf = texture(uNoise, q * .35).b;
    float front = e * 2.1 + (nf - .5) * .7;
    float m = smoothstep(uFrost * 1.35, uFrost * 1.35 - .22, front);
    float rr = length((vUv - .5) * vec2(asp, 1.));
    m *= smoothstep(uMelt - .12, uMelt + .06, rr + (nf - .5) * .25);
    float cr = crystals(q * .9 + .13);
    vec3 blurC = textureLod(uPaint, uv, 4.).rgb;
    vec3 frost = mix(blurC * .8 + vec3(.1, .13, .17), vec3(.86, .92, .98), clamp(.28 + cr * .75, 0., 1.));
    float sp = step(.985, texture(uNoise, q * 1.9 + uFrame * .0).r) * cr;
    frost += sp * .35;
    col = mix(col, frost, m * (.72 + .28 * clamp(cr, 0., 1.)));
  }
  float l = luma(col);
  col = mix(vec3(l), col, uSat);
  col *= vec3(1. + uWarm * .07, 1. + uWarm * .01, 1. - uWarm * .07);
  // неровный край живописи на стекле
  float ed = min(min(vUv.x, 1. - vUv.x) * asp, min(vUv.y, 1. - vUv.y));
  float en = texture(uNoise, vUv * vec2(asp, 1.) * 1.3).a;
  col *= mix(1. - uEdge, 1., smoothstep(.0, .035 + en * .05, ed));
  vec2 cc = vUv - .5;
  col *= 1. - uVig * dot(cc, cc) * 1.5;
  col = mix(col, uFadeCol, uFade);
  float g = texture(uNoise, vUv * uRes / 256. + vec2(fract(uFrame * .618), fract(uFrame * .382))).r - .5;
  col += g * uGrain;
  o = vec4(clamp(col, 0., 1.), 1.);
}`;

  let gl = null, canvas = null;
  let progs = {}, vao = null;
  let texA, texB, texNoise;
  let fbS, fbT1, fbT2, fbP, fbB1, fbB2;
  let pw = 0, ph = 0, ow = 0, oh = 0;
  let floatOK = false, enc = [1, 0];

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) {
      throw new Error('shader: ' + gl.getShaderInfoLog(s));
    }
    return s;
  }
  function program(fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error('link: ' + gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      u[info.name] = gl.getUniformLocation(p, info.name);
    }
    return { p, u };
  }

  function makeTex(w, h, fmt, data, wrap, mip) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    const f = fmt || { i: gl.RGBA8, f: gl.RGBA, t: gl.UNSIGNED_BYTE };
    gl.texImage2D(gl.TEXTURE_2D, 0, f.i, w, h, 0, f.f, f.t, data || null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap || gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap || gl.CLAMP_TO_EDGE);
    return t;
  }
  function makeFB(w, h, fmt, mip) {
    const tex = makeTex(w, h, fmt, null, null, mip);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { fb, tex, w, h };
  }
  function freeFB(x) { if (x) { gl.deleteFramebuffer(x.fb); gl.deleteTexture(x.tex); } }

  // Текстура шума 256² (бесшовная): R — белый шум, G — редкие «щетинки», B — плавный шум, A — средний
  function noiseTexture() {
    const N = 256, data = new Uint8Array(N * N * 4), r = rng(1109);
    const lattice = (period, seed) => {
      const g = new Float32Array(period * period), rr = rng(seed);
      for (let i = 0; i < g.length; i++) g[i] = rr();
      return (x, y) => {
        const fx = x / N * period, fy = y / N * period;
        const ix = Math.floor(fx), iy = Math.floor(fy), ux = smooth(fx - ix), uy = smooth(fy - iy);
        const at = (a, b) => g[((b % period + period) % period) * period + ((a % period + period) % period)];
        return lerp(lerp(at(ix, iy), at(ix + 1, iy), ux), lerp(at(ix, iy + 1), at(ix + 1, iy + 1), ux), uy);
      };
    };
    const b1 = lattice(4, 11), b2 = lattice(8, 12), b3 = lattice(16, 13);
    const a1 = lattice(16, 21), a2 = lattice(32, 22), a3 = lattice(64, 23);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = (y * N + x) * 4;
      data[i] = r() * 255;
      const s = r();
      data[i + 1] = (s > 0.82 ? 0.5 + r() * 0.5 : r() * 0.35) * 255;
      data[i + 2] = clamp(b1(x, y) * 0.55 + b2(x, y) * 0.3 + b3(x, y) * 0.15) * 255;
      data[i + 3] = clamp(a1(x, y) * 0.5 + a2(x, y) * 0.3 + a3(x, y) * 0.2) * 255;
    }
    const t = makeTex(N, N, null, data, gl.REPEAT, true);
    gl.generateMipmap(gl.TEXTURE_2D);
    return t;
  }

  function init(cv) {
    canvas = cv;
    try {
      gl = cv.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
    } catch (e) { gl = null; }
    if (!gl) return false;
    floatOK = !!gl.getExtension('EXT_color_buffer_float');
    enc = floatOK ? [1, 0] : [0.5, 0.5];
    try {
      progs.morph = program(FS_MORPH);
      progs.tensor = program(FS_TENSOR);
      progs.blur = program(FS_BLUR);
      progs.paint = program(FS_PAINT);
      progs.bright = program(FS_BRIGHT);
      progs.comp = program(FS_COMP);
    } catch (e) {
      gl = null;
      return false;
    }
    vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    texNoise = noiseTexture();
    texA = makeTex(4, 4);
    texB = makeTex(4, 4);
    return true;
  }

  function resize(paintW, paintH, outW, outH) {
    if (!gl) return;
    if (outW !== ow || outH !== oh) {
      ow = outW; oh = outH;
      canvas.width = ow; canvas.height = oh;
    }
    if (paintW === pw && paintH === ph) return;
    pw = paintW; ph = paintH;
    [fbS, fbT1, fbT2, fbP, fbB1, fbB2].forEach(freeFB);
    const tf = floatOK ? { i: gl.RGBA16F, f: gl.RGBA, t: gl.HALF_FLOAT } : null;
    const tw = Math.max(8, pw >> 1), th = Math.max(8, ph >> 1);
    fbS = makeFB(pw, ph);
    fbT1 = makeFB(tw, th, tf);
    fbT2 = makeFB(tw, th, tf);
    fbP = makeFB(pw, ph, null, true);
    const bw = Math.max(8, pw >> 2), bh = Math.max(8, ph >> 2);
    fbB1 = makeFB(bw, bh);
    fbB2 = makeFB(bw, bh);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  function upload(tex, cv) {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  }

  function bindTex(unit, tex) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); }
  function pass(prog, target, w, h, setup) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(prog.p);
    setup(prog.u);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // spec: { a: canvas, b: canvas|null, p, mode, cx, cy, seed, look: {...} }
  function render(spec) {
    if (!gl || gl.isContextLost()) return;
    const L = spec.look;
    upload(texA, spec.a);
    let src = texA;
    if (spec.b) {
      upload(texB, spec.b);
      pass(progs.morph, fbS, pw, ph, (u) => {
        bindTex(0, texA); bindTex(1, texB);
        gl.uniform1i(u.uA, 0); gl.uniform1i(u.uB, 1);
        gl.uniform1f(u.uP, spec.p); gl.uniform1f(u.uSeed, spec.seed || 0);
        gl.uniform1f(u.uAsp, pw / ph); gl.uniform1i(u.uMode, spec.mode | 0);
        gl.uniform2f(u.uC, spec.cx != null ? spec.cx : 0.5, spec.cy != null ? spec.cy : 0.5);
      });
      src = fbS.tex;
    }
    const tw = fbT1.w, th = fbT1.h;
    pass(progs.tensor, fbT1, tw, th, (u) => {
      bindTex(0, src); gl.uniform1i(u.uSrc, 0);
      gl.uniform2f(u.uPx, 1.5 / pw, 1.5 / ph);
      gl.uniform2f(u.uEnc, enc[0], enc[1]);
    });
    const bs = 1.6;
    pass(progs.blur, fbT2, tw, th, (u) => { bindTex(0, fbT1.tex); gl.uniform1i(u.uSrc, 0); gl.uniform2f(u.uDir, bs / tw, 0); });
    pass(progs.blur, fbT1, tw, th, (u) => { bindTex(0, fbT2.tex); gl.uniform1i(u.uSrc, 0); gl.uniform2f(u.uDir, 0, bs / th); });
    pass(progs.paint, fbP, pw, ph, (u) => {
      bindTex(0, src); bindTex(1, fbT1.tex); bindTex(2, texNoise);
      gl.uniform1i(u.uSrc, 0); gl.uniform1i(u.uTen, 1); gl.uniform1i(u.uNoise, 2);
      gl.uniform2f(u.uRes, pw, ph);
      gl.uniform2f(u.uEnc, enc[0], enc[1]);
      gl.uniform1f(u.uLen, L.len * pw / 1280);
      gl.uniform1f(u.uSeed, L.seed);
      gl.uniform1f(u.uFree, L.free);
    });
    // мип-уровни нужны всегда: без них текстура с мип-фильтром «неполная» и читается чёрной
    gl.bindTexture(gl.TEXTURE_2D, fbP.tex); gl.generateMipmap(gl.TEXTURE_2D);
    const bw = fbB1.w, bh = fbB1.h;
    pass(progs.bright, fbB1, bw, bh, (u) => { bindTex(0, fbP.tex); gl.uniform1i(u.uSrc, 0); gl.uniform1f(u.uThr, L.bloomThr); });
    pass(progs.blur, fbB2, bw, bh, (u) => { bindTex(0, fbB1.tex); gl.uniform1i(u.uSrc, 0); gl.uniform2f(u.uDir, 2.2 / bw, 0); });
    pass(progs.blur, fbB1, bw, bh, (u) => { bindTex(0, fbB2.tex); gl.uniform1i(u.uSrc, 0); gl.uniform2f(u.uDir, 0, 2.2 / bh); });
    pass(progs.comp, null, ow, oh, (u) => {
      bindTex(0, fbP.tex); bindTex(1, fbB1.tex); bindTex(2, texNoise);
      gl.uniform1i(u.uPaint, 0); gl.uniform1i(u.uBloom, 1); gl.uniform1i(u.uNoise, 2);
      gl.uniform2f(u.uRes, ow, oh); gl.uniform2f(u.uPRes, pw, ph);
      gl.uniform2f(u.uWeave, L.weave[0], L.weave[1]);
      gl.uniform1f(u.uFrame, L.frame);
      gl.uniform1f(u.uBump, L.bump);
      gl.uniform1f(u.uBloomAmt, L.bloom);
      gl.uniform1f(u.uGrain, L.grain);
      gl.uniform1f(u.uVig, L.vig);
      gl.uniform1f(u.uFrost, L.frost);
      gl.uniform1f(u.uMelt, L.melt);
      gl.uniform1f(u.uSat, L.sat);
      gl.uniform1f(u.uWarm, L.warm);
      gl.uniform1f(u.uFade, L.fade);
      gl.uniform1f(u.uExpo, L.expo);
      gl.uniform1f(u.uEdge, L.edge);
      gl.uniform3f(u.uFadeCol, L.fadeCol[0], L.fadeCol[1], L.fadeCol[2]);
    });
  }

  // дождаться, пока видеокарта дорисует кадр (нужно только для отладочных листов)
  function sync() { if (!gl) return; const px = new Uint8Array(4); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }

  return {
    init, resize, render, sync,
    get ok() { return !!gl; },
    get lost() { return !gl || gl.isContextLost(); },
  };
})();
