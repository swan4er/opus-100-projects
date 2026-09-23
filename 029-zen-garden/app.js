/* Карэсансуй — карта высот песка на CPU, свет и тени в шейдере WebGL2, листья на Canvas 2D. */
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const SHOT = !!window.__SHOT__;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const glc = $('#gl'), fx = $('#fx'), fctx = fx.getContext('2d');
  const gl = glc.getContext('webgl2', { antialias: false, alpha: false, depth: false, premultipliedAlpha: false });
  if (!gl) { $('#fail').hidden = false; return; }

  /* ---------- Константы сада ---------- */
  const CELL = 2;           // CSS-пикселей на клетку песка
  const SP = 8;             // шаг борозд, клеток
  const RAKE_W = 40;        // ширина граблей: пять зубьев
  const RING_R = 30;        // ширина кругов вокруг камней
  const SAND_Z = 0.9;       // высота гребня борозды, клеток

  let W = 0, H = 0, cssW = 0, cssH = 0, DPR = 1;
  let sand, stoneH, mat, stones = [];

  /* ---------- Шум ---------- */
  function hash2(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
  function vnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  let seed = 1;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

  /* ---------- Камни ---------- */
  // Пять групп: 5-2-3-2-3, как в Рёандзи (координаты — доли ширины и высоты)
  const LAYOUT = [
    [[0.17, 0.43, 1.0], [0.215, 0.5, 0.45], [0.125, 0.5, 0.36], [0.2, 0.36, 0.3], [0.14, 0.36, 0.26]],
    [[0.37, 0.64, 0.62], [0.405, 0.6, 0.34]],
    [[0.53, 0.39, 0.82], [0.57, 0.44, 0.4], [0.5, 0.45, 0.3]],
    [[0.69, 0.65, 0.58], [0.72, 0.6, 0.3]],
    [[0.845, 0.42, 0.9], [0.885, 0.48, 0.42], [0.81, 0.47, 0.3]],
  ];
  function makeStone(x, y, size, group) {
    const big = 17 * size + 3;
    return { x, y, rx: big * (1.05 + rnd() * 0.35), ry: big * (0.72 + rnd() * 0.22), rot: rnd() * Math.PI, h: 6 + 16 * size, s: [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28], tint: 60 + rnd() * 140, flat: rnd() < 0.35, group };
  }
  function layoutStones() {
    seed = 7;
    stones = [];
    const portrait = H > W * 1.2;
    const k = portrait ? Math.min(H, 1.6 * W) / 720 : Math.min(W, 1.6 * H) / 720;
    LAYOUT.forEach((grp, gi) => {
      const cx = grp.reduce((a, g) => a + g[0], 0) / grp.length, cy = grp.reduce((a, g) => a + g[1], 0) / grp.length;
      grp.forEach(([fx0, fy0, sz]) => {
        // внутри группы камни чуть раздвигаем, чтобы между ними оставался песок
        const gx = cx + (fx0 - cx) * 1.25, gy = cy + (fy0 - cy) * 1.25;
        const [px, py] = portrait ? [gy * W, (0.06 + gx * 0.9) * H] : [gx * W, gy * H];
        stones.push(makeStone(px, py, sz * k, gi));
      });
    });
  }
  function stoneShape(st, x, y) {
    const c = Math.cos(-st.rot), s = Math.sin(-st.rot);
    const dx = x - st.x, dy = y - st.y;
    const px = (dx * c - dy * s) / st.rx, py = (dx * s + dy * c) / st.ry;
    const phi = Math.atan2(py, px);
    const r = 1 + 0.12 * Math.sin(3 * phi + st.s[0]) + 0.07 * Math.sin(5 * phi + st.s[1]) + 0.04 * Math.sin(8 * phi + st.s[2]);
    return Math.hypot(px, py) / r;       // < 1 — внутри камня
  }
  // Расстояние (в клетках) от точки до края камня, приближённо
  const stoneDist = (st, x, y) => (stoneShape(st, x, y) - 1) * Math.min(st.rx, st.ry);
  function paintStones(x0 = 0, y0 = 0, x1 = W - 1, y1 = H - 1) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * W + x;
      stoneH[i] = 0; mat[i * 4 + 1] = 128;
    }
    for (const st of stones) {
      const R = Math.max(st.rx, st.ry) * 1.3 + 2;
      const ax = Math.max(x0, Math.floor(st.x - R)), bx = Math.min(x1, Math.ceil(st.x + R));
      const ay = Math.max(y0, Math.floor(st.y - R)), by = Math.min(y1, Math.ceil(st.y + R));
      for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) {
        const q = stoneShape(st, x + 0.5, y + 0.5);
        if (q >= 1) continue;
        const i = y * W + x;
        let h = st.h * Math.pow(1 - q * q, st.flat ? 0.28 : 0.6);
        h *= 0.93 + 0.14 * vnoise(x * 0.22 + st.s[0] * 9, y * 0.22);
        if (h > stoneH[i]) { stoneH[i] = h; mat[i * 4 + 1] = st.tint; }
      }
    }
  }
  function mossAround(st, amount = 1) {
    const R = Math.max(st.rx, st.ry) * 1.25 + 14;
    for (let y = Math.max(0, Math.floor(st.y - R)); y <= Math.min(H - 1, Math.ceil(st.y + R)); y++)
      for (let x = Math.max(0, Math.floor(st.x - R)); x <= Math.min(W - 1, Math.ceil(st.x + R)); x++) {
        const d = stoneDist(st, x + 0.5, y + 0.5);
        const n = vnoise(x * 0.16, y * 0.16) * 7 + vnoise(x * 0.5, y * 0.5) * 2.5;
        const v = Math.max(0, Math.min(1, (st.h * 0.35 + 3 - d - n) / 3)) * amount;
        const i = (y * W + x) * 4;
        mat[i] = Math.max(mat[i], Math.round(v * 255));
      }
  }

  /* ---------- Песок: прямые борозды и круги у камней ---------- */
  function smin(a, b, k) { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }
  // Для кругов — сглаженный контур: камень как круг чуть больше его самого
  const ringDist = (st, x, y) => Math.hypot(x - st.x, y - st.y) - Math.max(st.rx, st.ry) * 1.12 - 3;
  function composeGarden() {
    sand.fill(0); mat.fill(0);
    for (let i = 0; i < W * H; i++) mat[i * 4 + 3] = 255;
    paintStones();
    const ringOuter = Math.round(RING_R / SP) * SP;
    // сначала везде прямые борозды
    for (let y = 0; y < H; y++) {
      const lines = SAND_Z * Math.cos((2 * Math.PI * (y + 0.5)) / SP);
      sand.fill(lines, y * W, (y + 1) * W);
    }
    // потом круги — только в рамке каждой группы камней
    const dist = new Float32Array(W * H).fill(1e9);
    for (let g = 0; g < LAYOUT.length; g++) {
      const grp = stones.filter((st) => st.group === g);
      if (!grp.length) continue;
      const pad = ringOuter + 6;
      const x0 = Math.max(0, Math.floor(Math.min(...grp.map((st) => st.x - Math.max(st.rx, st.ry) * 1.3)) - pad));
      const x1 = Math.min(W - 1, Math.ceil(Math.max(...grp.map((st) => st.x + Math.max(st.rx, st.ry) * 1.3)) + pad));
      const y0 = Math.max(0, Math.floor(Math.min(...grp.map((st) => st.y - Math.max(st.rx, st.ry) * 1.3)) - pad));
      const y1 = Math.min(H - 1, Math.ceil(Math.max(...grp.map((st) => st.y + Math.max(st.rx, st.ry) * 1.3)) + pad));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        let d = Infinity;
        for (const st of grp) d = d === Infinity ? ringDist(st, x + 0.5, y + 0.5) : smin(d, ringDist(st, x + 0.5, y + 0.5), 26);
        const i = y * W + x;
        if (d < dist[i]) dist[i] = d;
      }
    }
    for (let i = 0; i < W * H; i++) {
      const d = dist[i];
      if (d >= ringOuter) continue;
      const ring = SAND_Z * Math.cos((2 * Math.PI * Math.max(0, d)) / SP);
      const w = Math.min(1, Math.max(0, (ringOuter - d) / 3));
      sand[i] = ring * w + sand[i] * (1 - w);
    }
    stones.forEach((st, k) => mossAround(st, st.h > 16 ? 1 : 0.8));
    dirtyAll();
  }

  /* ---------- WebGL ---------- */
  const VS = `#version 300 es
layout(location=0) in vec2 aPos; out vec2 vUV;
void main(){ vUV = aPos*0.5+0.5; gl_Position = vec4(aPos,0.,1.); }`;
  const FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uSand, uStone, uMat;
uniform vec2 uGrid, uRes;
uniform vec3 uSun, uSunCol, uSky, uSandCol, uMossCol;
uniform float uSnow, uDpr;
out vec4 o;
float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y); }
float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<4;i++){ s+=a*noise(p); p*=2.03; a*=.5; } return s; }
vec2 flipUV(vec2 uv){ return vec2(uv.x, 1.0-uv.y); }
float Hs(vec2 uv){ return texture(uSand, flipUV(uv)).r; }
float Hst(vec2 uv){ return texture(uStone, flipUV(uv)).r; }
float Ht(vec2 uv){ return Hs(uv) + Hst(uv); }
void main(){
  vec2 uv = vUV;
  vec2 tx = 1.0/uGrid;
  vec2 cell = uv*uGrid;
  float hs = Hs(uv), hst = Hst(uv), h = hs + hst;
  float hx = Ht(uv+vec2(tx.x,0.)) - Ht(uv-vec2(tx.x,0.));
  float hy = Ht(uv+vec2(0.,tx.y)) - Ht(uv-vec2(0.,tx.y));
  vec3 n = normalize(vec3(-hx*0.5, -hy*0.5, 1.0));
  // тень: идём к солнцу по карте высот
  vec2 dir = normalize(uSun.xy);
  float tanE = uSun.z/max(length(uSun.xy), 1e-3);
  float sh = 1.0;
  for (int i = 1; i <= 48; i++) {
    float t = float(i)*1.7;
    vec2 p = uv + dir*tx*t;
    if (p.x < 0. || p.y < 0. || p.x > 1. || p.y > 1.) break;
    float d = Ht(p) - (h + tanE*t);
    sh = min(sh, clamp(1.0 - d*0.55, 0.0, 1.0));
    if (sh < 0.02) break;
  }
  float diff = max(dot(n, normalize(uSun)), 0.0);
  vec4 m = texture(uMat, flipUV(uv));
  vec3 base;
  float isStone = smoothstep(0.35, 0.9, hst);
  // песок
  float ao = 0.8 + 0.2*smoothstep(-1.0, 1.0, hs);
  vec3 sandC = uSandCol*ao*(0.955 + 0.045*hash(floor(gl_FragCoord.xy/uDpr)));
  sandC *= 0.97 + 0.06*fbm(cell*0.05);
  float moss = m.r*(0.7 + 0.6*fbm(cell*0.45));
  vec3 mossC = uMossCol*(0.72 + 0.5*fbm(cell*1.7));
  sandC = mix(sandC, mossC, smoothstep(0.42, 0.62, moss));
  // камень
  float v = fbm(cell*0.33 + m.g*0.31);
  vec3 stoneC = mix(vec3(0.20,0.205,0.215), vec3(0.47,0.46,0.43), v) + (m.g-0.5)*0.12;
  float lichen = smoothstep(0.63, 0.72, fbm(cell*0.8 + 7.0));
  stoneC = mix(stoneC, vec3(0.62,0.62,0.44), lichen*0.35);
  stoneC = mix(stoneC, mossC*0.9, smoothstep(0.55, 0.8, m.r)*smoothstep(3.0, 0.5, hst)*0.8);
  base = mix(sandC, stoneC, isStone);
  vec3 col = base*(uSky*0.62 + uSunCol*diff*sh*0.95);
  // искры кварца на гребнях
  float glint = step(0.996, hash(floor(gl_FragCoord.xy/uDpr)+0.5))*pow(max(dot(reflect(-normalize(uSun), n), vec3(0,0,1)),0.), 16.)*sh*(1.-isStone);
  col += glint*uSunCol*0.5;
  // снег
  if (uSnow > 0.0) {
    float s = uSnow*smoothstep(0.35, 0.75, n.z*0.55 + 0.25 + fbm(cell*0.12)*0.35);
    col = mix(col, vec3(0.9,0.93,0.98)*(uSky*0.7 + uSunCol*diff*sh*0.55), s*0.85);
  }
  // галечная кайма по краю сада
  vec2 px = gl_FragCoord.xy/uDpr;
  float e = min(min(px.x, px.y), min(uRes.x-px.x, uRes.y-px.y));
  float B = 20.0;
  if (e < B + 2.0) {
    vec2 q = px/8.5; vec2 ip = floor(q), fp = fract(q);
    float md = 9.0; vec2 mc = vec2(0);
    for (int j=-1;j<=1;j++) for (int i=-1;i<=1;i++) {
      vec2 g = vec2(i,j); vec2 o2 = vec2(hash(ip+g), hash(ip+g+13.1))*0.8+0.1;
      vec2 r = g + o2 - fp; float d = dot(r,r);
      if (d < md) { md = d; mc = ip+g; }
    }
    float peb = smoothstep(0.62, 0.3, sqrt(md));
    float tone = hash(mc);
    vec3 pc = mix(vec3(0.24,0.23,0.22), vec3(0.56,0.54,0.5), tone);
    vec3 pcol = mix(vec3(0.1,0.09,0.08), pc*(0.75+0.35*(1.0-sqrt(md))), peb);
    float k = smoothstep(B+1.5, B-1.5, e);
    col = mix(col*(1.0 - 0.35*smoothstep(B+8.0, B, e)), pcol*(uSky*0.7+uSunCol*0.55), k);
  }
  vec2 c = vUV-0.5;
  col *= mix(0.86, 1.0, smoothstep(0.85, 0.3, length(c*vec2(1.0, 1.25))));
  o = vec4(col, 1.0);
}`;
  function compile(t, src) { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
  const prog = gl.createProgram();
  try {
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (e) { $('#fail').hidden = false; return; }
  const U = {};
  for (let i = 0; i < gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS); i++) { const n = gl.getActiveUniform(prog, i).name; U[n] = gl.getUniformLocation(prog, n); }
  gl.bindVertexArray(gl.createVertexArray());
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  let tSand, tStone, tMat;
  function tex(internal, format, type) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, W, H, 0, format, type, null);
    return t;
  }
  const dirty = { x0: 0, y0: 0, x1: -1, y1: -1, all: false, stone: false };
  function dirtyAll() { dirty.all = true; dirty.stone = true; }
  function markDirty(x0, y0, x1, y1) {
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(W - 1, x1); y1 = Math.min(H - 1, y1);
    if (dirty.x1 < dirty.x0) Object.assign(dirty, { x0, y0, x1, y1 });
    else { dirty.x0 = Math.min(dirty.x0, x0); dirty.y0 = Math.min(dirty.y0, y0); dirty.x1 = Math.max(dirty.x1, x1); dirty.y1 = Math.max(dirty.y1, y1); }
  }
  function upload() {
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    if (dirty.all) {
      gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0); gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0); gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
      gl.bindTexture(gl.TEXTURE_2D, tSand); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, H, gl.RED, gl.FLOAT, sand);
      gl.bindTexture(gl.TEXTURE_2D, tStone); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, H, gl.RED, gl.FLOAT, stoneH);
      gl.bindTexture(gl.TEXTURE_2D, tMat); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, mat);
    } else if (dirty.x1 >= dirty.x0) {
      const { x0, y0, x1, y1 } = dirty, w = x1 - x0 + 1, h = y1 - y0 + 1;
      gl.pixelStorei(gl.UNPACK_ROW_LENGTH, W); gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, x0); gl.pixelStorei(gl.UNPACK_SKIP_ROWS, y0);
      gl.bindTexture(gl.TEXTURE_2D, tSand); gl.texSubImage2D(gl.TEXTURE_2D, 0, x0, y0, w, h, gl.RED, gl.FLOAT, sand);
      gl.bindTexture(gl.TEXTURE_2D, tMat); gl.texSubImage2D(gl.TEXTURE_2D, 0, x0, y0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, mat);
      if (dirty.stone) { gl.bindTexture(gl.TEXTURE_2D, tStone); gl.texSubImage2D(gl.TEXTURE_2D, 0, x0, y0, w, h, gl.RED, gl.FLOAT, stoneH); }
      gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0); gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0); gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
    }
    dirty.all = false; dirty.stone = false; dirty.x0 = 0; dirty.y0 = 0; dirty.x1 = -1; dirty.y1 = -1;
    needDraw = true;
  }

  /* ---------- Сезоны и солнце ---------- */
  const SEASONS = {
    spring: { sand: [0.87, 0.84, 0.77], moss: [0.36, 0.52, 0.22], sky: [0.8, 0.84, 0.92], snow: 0, fall: 'petal' },
    summer: { sand: [0.88, 0.85, 0.76], moss: [0.24, 0.45, 0.16], sky: [0.78, 0.84, 0.95], snow: 0, fall: null },
    autumn: { sand: [0.86, 0.81, 0.72], moss: [0.4, 0.44, 0.2], sky: [0.83, 0.8, 0.8], snow: 0, fall: 'leaf' },
    winter: { sand: [0.83, 0.84, 0.86], moss: [0.3, 0.38, 0.28], sky: [0.74, 0.8, 0.95], snow: 1, fall: 'snow' },
  };
  const S = { season: 'autumn', sun: 0.2, tool: 'rake' };
  function sunUniforms() {
    const t = S.sun;
    const phi = Math.PI + t * Math.PI;                     // восток слева → юг внизу → запад справа
    const elev = (7 + 50 * Math.sin(Math.PI * t)) * Math.PI / 180;
    const d = [Math.cos(phi) * Math.cos(elev), Math.sin(phi) * Math.cos(elev), Math.sin(elev)];
    const warm = 1 - Math.min(1, Math.sin(Math.PI * t) * 1.4);
    const col = [1.0, 0.93 - 0.2 * warm, 0.82 - 0.38 * warm];
    return { d, col };
  }
  function draw() {
    if (!needDraw) return;
    needDraw = false;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, glc.width, glc.height);
    gl.useProgram(prog);
    const bind = (u, t, unit) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(U[u], unit); };
    bind('uSand', tSand, 0); bind('uStone', tStone, 1); bind('uMat', tMat, 2);
    const se = SEASONS[S.season], sun = sunUniforms();
    gl.uniform2f(U.uGrid, W, H); gl.uniform2f(U.uRes, cssW, cssH); gl.uniform1f(U.uDpr, DPR);
    gl.uniform3fv(U.uSun, sun.d); gl.uniform3fv(U.uSunCol, sun.col); gl.uniform3fv(U.uSky, se.sky);
    gl.uniform3fv(U.uSandCol, se.sand); gl.uniform3fv(U.uMossCol, se.moss); gl.uniform1f(U.uSnow, se.snow);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  let needDraw = true;

  /* ---------- Раскладка ---------- */
  function resize() {
    cssW = innerWidth; cssH = innerHeight;
    DPR = SHOT ? 1 : Math.min(devicePixelRatio || 1, 2);
    glc.width = Math.round(cssW * DPR); glc.height = Math.round(cssH * DPR);
    fx.width = Math.round(cssW * DPR); fx.height = Math.round(cssH * DPR);
    fctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    W = Math.ceil(cssW / CELL); H = Math.ceil(cssH / CELL);
    sand = new Float32Array(W * H); stoneH = new Float32Array(W * H); mat = new Uint8Array(W * H * 4);
    [tSand, tStone, tMat].forEach((t) => t && gl.deleteTexture(t));
    tSand = tex(gl.R16F, gl.RED, gl.FLOAT); tStone = tex(gl.R16F, gl.RED, gl.FLOAT); tMat = tex(gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
    layoutStones(); composeGarden(); upload();
    leaves.length = 0; seedLeaves();
  }
  let rT = 0;
  window.addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(resize, 200); });

  /* ---------- Инструменты ---------- */
  const inStone = (i) => stoneH[i] > 0.3;
  function rakeSeg(x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
    if (len < 0.2) return;
    const ux = dx / len, uy = dy / len, nx = -uy, ny = ux, half = RAKE_W / 2;
    const ax = Math.floor(Math.min(x0, x1) - half - 2), bx = Math.ceil(Math.max(x0, x1) + half + 2);
    const ay = Math.floor(Math.min(y0, y1) - half - 2), by = Math.ceil(Math.max(y0, y1) + half + 2);
    for (let y = Math.max(0, ay); y <= Math.min(H - 1, by); y++) for (let x = Math.max(0, ax); x <= Math.min(W - 1, bx); x++) {
      const px = x + 0.5 - x0, py = y + 0.5 - y0;
      const t = px * ux + py * uy;
      if (t < -1.5 || t > len + 1.5) continue;
      const s = px * nx + py * ny, as = Math.abs(s);
      if (as > half) continue;
      const i = y * W + x;
      if (inStone(i) || mat[i * 4] > 150) continue;
      const w = Math.min(1, (half - as) / 3);
      const target = SAND_Z * Math.cos((2 * Math.PI * (s + half)) / SP);
      sand[i] += (target - sand[i]) * w;
    }
    markDirty(ax, ay, bx, by);
  }
  function brush(x0, y0, R, fn) {
    for (let y = Math.max(0, Math.floor(y0 - R)); y <= Math.min(H - 1, Math.ceil(y0 + R)); y++)
      for (let x = Math.max(0, Math.floor(x0 - R)); x <= Math.min(W - 1, Math.ceil(x0 + R)); x++) {
        const d = Math.hypot(x + 0.5 - x0, y + 0.5 - y0);
        if (d <= R) fn(y * W + x, 1 - d / R, x, y);
      }
    markDirty(Math.floor(x0 - R), Math.floor(y0 - R), Math.ceil(x0 + R), Math.ceil(y0 + R));
  }
  // Круги: вокруг ближайшего камня (если кликнули рядом) или вокруг точки
  let ringAnim = null;
  function startRings(x, y) {
    let near = null, best = 26;
    for (const st of stones) { const d = stoneDist(st, x, y); if (d < best) { best = d; near = st; } }
    ringAnim = { x, y, st: near, r: 0, max: near ? RING_R + Math.round(12 / SP) * SP : 56 };
  }
  function stepRings() {
    if (!ringAnim) return;
    const a = ringAnim;
    a.r = Math.min(a.max, a.r + (reduceMotion || SHOT ? a.max : 4));
    const cx = a.st ? a.st.x : a.x, cy = a.st ? a.st.y : a.y;
    const R = (a.st ? Math.max(a.st.rx, a.st.ry) : 0) + a.r + 2;
    brush(cx, cy, R, (i, f, x, y) => {
      if (inStone(i) || mat[i * 4] > 150) return;
      const d = a.st ? ringDist(a.st, x + 0.5, y + 0.5) : Math.hypot(x + 0.5 - a.x, y + 0.5 - a.y);
      if (d < 0 || d > a.r) return;
      const w = Math.min(1, (a.max - d) / 3);
      sand[i] += (SAND_Z * Math.cos((2 * Math.PI * d) / SP) - sand[i]) * w;
    });
    if (a.r >= a.max) ringAnim = null;
  }
  function addOrRemoveStone(x, y) {
    const hit = stones.findIndex((st) => stoneShape(st, x, y) < 1);
    let st;
    if (hit >= 0) { st = stones[hit]; stones.splice(hit, 1); }
    else { st = makeStone(x, y, 0.35 + rnd() * 0.45, -1); stones.push(st); }
    const R = Math.max(st.rx, st.ry) * 1.4 + 16;
    const x0 = Math.max(0, Math.floor(st.x - R)), x1 = Math.min(W - 1, Math.ceil(st.x + R));
    const y0 = Math.max(0, Math.floor(st.y - R)), y1 = Math.min(H - 1, Math.ceil(st.y + R));
    paintStones(x0, y0, x1, y1);
    if (hit < 0) mossAround(st, 0.7);
    else for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) { const i = (yy * W + xx) * 4; if (stoneDist(st, xx + 0.5, yy + 0.5) < 14) mat[i] = Math.max(0, mat[i] - 200); }
    markDirty(x0, y0, x1, y1); dirty.stone = true;
  }

  /* ---------- Листья, лепестки, снег ---------- */
  const leaves = [];
  const LEAF_COLORS = ['#b8321f', '#cf4f25', '#df7f2c', '#c9a227', '#a3261a'];
  function spawn(kind, rest = false) {
    const p = { kind, x: Math.random() * cssW, y: rest ? Math.random() * cssH : -30 - Math.random() * 60, z: rest ? 0 : 1, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 2.4, size: kind === 'leaf' ? 11 + Math.random() * 7 : kind === 'petal' ? 5 + Math.random() * 3 : 1.4 + Math.random() * 1.8, color: kind === 'leaf' ? LEAF_COLORS[(Math.random() * LEAF_COLORS.length) | 0] : kind === 'petal' ? (Math.random() < 0.5 ? '#f3c2cc' : '#f8dbe1') : '#fff', ph: Math.random() * 6.28, fall: 0.35 + Math.random() * 0.35, land: 0.25 + Math.random() * 0.7 };
    if (rest) { p.z = 0; p.resting = true; }
    leaves.push(p);
  }
  function seedLeaves() {
    const f = SEASONS[S.season].fall;
    if (f === 'leaf') for (let i = 0; i < 14; i++) spawn('leaf', true);
    if (f === 'petal') for (let i = 0; i < 30; i++) spawn('petal', true);
  }
  function leafPath(c, s) {
    c.beginPath();
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + (k / 5) * Math.PI * 2, a2 = a + Math.PI / 5;
      const r1 = k === 0 ? s : k === 1 || k === 4 ? s * 0.92 : s * 0.72;
      c.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
      c.lineTo(Math.cos(a - 0.22) * r1 * 0.55, Math.sin(a - 0.22) * r1 * 0.55);
      c.lineTo(Math.cos(a2) * s * 0.34, Math.sin(a2) * s * 0.34);
    }
    c.closePath();
  }
  let lastT = performance.now(), spawnAcc = 0;
  const pointer = { x: -999, y: -999, down: false, sx: 0, sy: 0, dir: [1, 0], speed: 0, inside: false };
  function drawFx(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
    fctx.clearRect(0, 0, cssW, cssH);
    const f = SEASONS[S.season].fall;
    const rate = f === 'leaf' ? 0.9 : f === 'petal' ? 3 : f === 'snow' ? 60 : 0;
    const cap = f === 'leaf' ? 40 : f === 'petal' ? 90 : 400;
    if (!reduceMotion) spawnAcc += rate * dt;
    while (spawnAcc > 1) { spawnAcc--; if (leaves.length < cap) spawn(f); }
    for (let i = leaves.length - 1; i >= 0; i--) {
      const p = leaves[i];
      if (!p.resting) {
        const sway = Math.sin(now * 0.0012 * (p.kind === 'snow' ? 2 : 1) + p.ph);
        p.x += (sway * (p.kind === 'snow' ? 14 : 34) + 10) * dt;
        p.y += (p.kind === 'snow' ? 38 : p.kind === 'petal' ? 30 : 46) * p.fall * dt * 1.6;
        p.rot += p.vr * dt;
        if (p.y > cssH * p.land) {
          p.z = Math.max(0, p.z - dt * 0.9);
          if (p.z <= 0) { if (p.kind === 'snow') { leaves.splice(i, 1); continue; } p.resting = true; }
        }
      }
      if (p.y > cssH + 40 || p.x > cssW + 40) { leaves.splice(i, 1); continue; }
      fctx.save();
      fctx.translate(p.x, p.y);
      if (p.kind === 'snow') {
        fctx.globalAlpha = 0.85; fctx.fillStyle = '#fff';
        fctx.beginPath(); fctx.arc(0, 0, p.size, 0, 6.28); fctx.fill();
      } else {
        const off = 2 + p.z * 26;
        fctx.save(); fctx.translate(off * 0.6, off); fctx.rotate(p.rot); fctx.globalAlpha = 0.18 * (1 - p.z * 0.6); fctx.fillStyle = '#2a1d10';
        if (p.kind === 'leaf') leafPath(fctx, p.size); else { fctx.beginPath(); fctx.ellipse(0, 0, p.size, p.size * 0.62, 0, 0, 6.28); }
        fctx.fill(); fctx.restore();
        fctx.rotate(p.rot); fctx.fillStyle = p.color; fctx.globalAlpha = 0.96;
        if (p.kind === 'leaf') { leafPath(fctx, p.size); fctx.fill(); fctx.strokeStyle = 'rgba(80,20,10,.45)'; fctx.lineWidth = 0.8; fctx.beginPath(); fctx.moveTo(0, p.size * 0.9); fctx.lineTo(0, -p.size * 0.6); fctx.stroke(); }
        else { fctx.beginPath(); fctx.ellipse(0, 0, p.size, p.size * 0.62, 0, 0, 6.28); fctx.fill(); }
      }
      fctx.restore();
    }
    // курсор: грабли, круг, камень, кисть
    if (pointer.inside && !matchMedia('(pointer: coarse)').matches) {
      fctx.save(); fctx.translate(pointer.x, pointer.y);
      fctx.strokeStyle = 'rgba(40,32,24,.75)'; fctx.fillStyle = 'rgba(40,32,24,.75)'; fctx.lineWidth = 1.5; fctx.lineCap = 'round';
      if (S.tool === 'rake') {
        const [dx, dy] = pointer.dir; const nx = -dy, ny = dx, half = (RAKE_W * CELL) / 2;
        fctx.beginPath(); fctx.moveTo(nx * half, ny * half); fctx.lineTo(-nx * half, -ny * half); fctx.stroke();
        for (let k = 0; k < 5; k++) { const s = -half + (k + 0.5) * (RAKE_W * CELL / 5); fctx.beginPath(); fctx.moveTo(nx * s, ny * s); fctx.lineTo(nx * s + dx * 6, ny * s + dy * 6); fctx.stroke(); }
        fctx.beginPath(); fctx.moveTo(0, 0); fctx.lineTo(-dx * 34, -dy * 34); fctx.stroke();
      } else if (S.tool === 'rings') {
        [6, 16, 26].forEach((r) => { fctx.beginPath(); fctx.arc(0, 0, r, 0, 6.28); fctx.stroke(); });
      } else if (S.tool === 'stone') {
        fctx.setLineDash([4, 4]); fctx.beginPath(); fctx.ellipse(0, 0, 26, 17, -0.3, 0, 6.28); fctx.stroke();
      } else {
        const R = (S.tool === 'moss' ? 10 : 18) * CELL;
        fctx.beginPath(); fctx.arc(0, 0, R, 0, 6.28); fctx.stroke();
      }
      fctx.restore();
    }
  }

  const hint = $('#hint');
  fx.addEventListener('pointerdown', (e) => {
    fx.setPointerCapture(e.pointerId);
    pointer.down = true; pointer.x = e.clientX; pointer.y = e.clientY; pointer.sx = e.clientX; pointer.sy = e.clientY;
    hint.classList.add('is-gone');
    const cx = e.clientX / CELL, cy = e.clientY / CELL;
    if (S.tool === 'rings') startRings(cx, cy);
    else if (S.tool === 'stone') addOrRemoveStone(cx, cy);
    else if (S.tool === 'moss' || S.tool === 'smooth') applyBrush(cx, cy);
    audioTouch();
  });
  fx.addEventListener('pointermove', (e) => {
    pointer.inside = true;
    const px = pointer.x, py = pointer.y;
    pointer.x = e.clientX; pointer.y = e.clientY;
    if (!pointer.down) { const d = Math.hypot(pointer.x - px, pointer.y - py); if (d > 2) pointer.dir = [(pointer.x - px) / d, (pointer.y - py) / d]; return; }
    if (S.tool === 'rake') {
      // «ленивые» грабли: следуют за курсором с запаздыванием — борозды получаются плавными
      const tx = e.clientX, ty = e.clientY;
      const ox = pointer.sx, oy = pointer.sy;
      const d = Math.hypot(tx - ox, ty - oy);
      if (d < 2) return;
      const k = Math.min(1, 0.55);
      const nx = ox + (tx - ox) * k, ny = oy + (ty - oy) * k;
      const L = Math.hypot(nx - ox, ny - oy);
      pointer.dir = [(nx - ox) / L, (ny - oy) / L];
      const steps = Math.ceil(L / 3);
      for (let s = 0; s < steps; s++) rakeSeg((ox + (nx - ox) * s / steps) / CELL, (oy + (ny - oy) * s / steps) / CELL, (ox + (nx - ox) * (s + 1) / steps) / CELL, (oy + (ny - oy) * (s + 1) / steps) / CELL);
      // сгребаем листья
      for (const p of leaves) if (p.resting && Math.hypot(p.x - nx, p.y - ny) < RAKE_W * CELL * 0.6) { p.x += (nx - ox) * 0.9; p.y += (ny - oy) * 0.9; p.rot += 0.05; }
      pointer.sx = nx; pointer.sy = ny;
      pointer.speed = Math.min(1, L / 18);
    } else if (S.tool === 'moss' || S.tool === 'smooth') applyBrush(e.clientX / CELL, e.clientY / CELL);
  });
  const up = () => { pointer.down = false; pointer.speed = 0; };
  fx.addEventListener('pointerup', up); fx.addEventListener('pointercancel', up);
  fx.addEventListener('pointerleave', () => { pointer.inside = false; });
  function applyBrush(x, y) {
    if (S.tool === 'moss') brush(x, y, 10, (i, f, xx, yy) => { if (!inStone(i)) mat[i * 4] = Math.min(255, mat[i * 4] + Math.round(60 * f * (0.5 + vnoise(xx * 0.3, yy * 0.3)))); });
    else brush(x, y, 18, (i, f) => { sand[i] *= 1 - 0.35 * f; });
  }

  document.querySelectorAll('[data-tool]').forEach((b) => b.addEventListener('click', () => {
    S.tool = b.dataset.tool;
    document.querySelectorAll('[data-tool]').forEach((x) => x.classList.toggle('is-on', x === b));
  }));
  $('#reset').addEventListener('click', () => { layoutStones(); composeGarden(); leaves.length = 0; seedLeaves(); });
  document.querySelectorAll('[data-season]').forEach((b) => b.addEventListener('click', () => {
    S.season = b.dataset.season;
    document.querySelectorAll('[data-season]').forEach((x) => { const on = x === b; x.classList.toggle('is-on', on); x.setAttribute('aria-checked', on); });
    leaves.length = 0; seedLeaves(); needDraw = true; updateAmbience();
  }));
  $('#sun').addEventListener('input', (e) => { S.sun = +e.target.value; needDraw = true; });

  /* ---------- Звук ---------- */
  let ac = null, rakeGain = null, windGain = null, soundOn = false, knockT = 0;
  function noiseBuf(sec, brown) {
    const n = Math.floor(ac.sampleRate * sec), b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w; }
    return b;
  }
  function initAudio() {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    const master = ac.createGain(); master.gain.value = 0.7; master.connect(ac.destination);
    const wind = ac.createBufferSource(); wind.buffer = noiseBuf(6, true); wind.loop = true;
    const wf = ac.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 420;
    windGain = ac.createGain(); windGain.gain.value = 0.0;
    wind.connect(wf).connect(windGain).connect(master); wind.start();
    const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 0.06; lg.gain.value = 180; lfo.connect(lg).connect(wf.frequency); lfo.start();
    const rk = ac.createBufferSource(); rk.buffer = noiseBuf(3, false); rk.loop = true;
    const rf = ac.createBiquadFilter(); rf.type = 'bandpass'; rf.frequency.value = 2400; rf.Q.value = 0.7;
    rakeGain = ac.createGain(); rakeGain.gain.value = 0;
    rk.connect(rf).connect(rakeGain).connect(master); rk.start();
    ac.master = master;
    updateAmbience();
  }
  function updateAmbience() { if (windGain && ac) windGain.gain.setTargetAtTime(soundOn ? (S.season === 'winter' ? 0.16 : 0.1) : 0, ac.currentTime, 0.8); }
  function knock() {
    const t = ac.currentTime + 0.05, m = ac.master;
    const pour = ac.createBufferSource(); pour.buffer = noiseBuf(1.2, false);
    const pf = ac.createBiquadFilter(); pf.type = 'bandpass'; pf.frequency.setValueAtTime(900, t); pf.frequency.linearRampToValueAtTime(1600, t + 1.1); pf.Q.value = 3;
    const pg = ac.createGain(); pg.gain.setValueAtTime(0.0001, t); pg.gain.exponentialRampToValueAtTime(0.05, t + 0.5); pg.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    pour.connect(pf).connect(pg).connect(m); pour.start(t);
    [0, 0.28].forEach((dl, k) => {
      const tt = t + 1.25 + dl, g0 = k ? 0.12 : 0.34;
      [[430, 1], [1180, 0.45], [2250, 0.18]].forEach(([f, a]) => {
        const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(g0 * a, tt + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.16);
        o.connect(g).connect(m); o.start(tt); o.stop(tt + 0.2);
      });
    });
  }
  function audioTouch() { if (ac && ac.state === 'suspended') ac.resume(); }
  const soundBtn = $('#sound');
  soundBtn.addEventListener('click', () => {
    if (!ac) initAudio();
    soundOn = !soundOn;
    soundBtn.setAttribute('aria-pressed', soundOn);
    if (soundOn) { ac.resume(); knockT = performance.now() + 2500; }
    updateAmbience();
  });

  /* ---------- Цикл ---------- */
  function loop(now) {
    requestAnimationFrame(loop);
    stepRings();
    if (dirty.all || dirty.x1 >= dirty.x0) upload();
    draw();
    drawFx(now);
    if (rakeGain && ac) rakeGain.gain.setTargetAtTime(soundOn && pointer.down && S.tool === 'rake' ? 0.05 + pointer.speed * 0.12 : 0, ac.currentTime, 0.05);
    if (soundOn && now > knockT) { knock(); knockT = now + 11000 + Math.random() * 6000; }
  }

  resize();
  requestAnimationFrame(loop);
  if (SHOT) pointer.inside = false;
})();
