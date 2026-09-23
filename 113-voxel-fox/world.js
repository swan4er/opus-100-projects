// ───────────────────────────────────────────────────────────────────────────
//  «Лисий дом» — мир: воксельный материал и процедурная диорама
//  (рельеф, ручей, деревья, руины дома, брёвна, доски крыши, реквизит).
//  Всё строится из кубиков InstancedMesh; «игрушечная» фаска и шов между
//  кубиками рисуются в шейдере, снег и листва ложатся на верхние грани.
// ───────────────────────────────────────────────────────────────────────────
window.FoxWorld = function (THREE) {
  'use strict';
  const S = window.STORY;
  const { clamp, lerp, smooth } = S;

  // ── Случайность и шум ─────────────────────────────────────────────────────
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const R = rng(20260923);
  function h2(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
  function vnoise(x, z) {
    const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
    return lerp(lerp(h2(xi, zi), h2(xi + 1, zi), u), lerp(h2(xi, zi + 1), h2(xi + 1, zi + 1), u), v);
  }
  function fbm(x, z) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < 4; i++) { s += a * vnoise(x * f, z * f); f *= 2.03; a *= 0.5; } return s / 0.9375; }

  const col = (hex) => new THREE.Color(hex);
  const CC = new Map();
  const TMPC = new THREE.Color();
  function vary(hex, amt, r) {
    let c = CC.get(hex); if (!c) { c = new THREE.Color(hex); CC.set(hex, c); }
    const k = 1 + (r - 0.5) * amt; return TMPC.copy(c).multiplyScalar(k);
  }
  const pick = (arr, r) => arr[Math.min(arr.length - 1, Math.floor(r * arr.length))];

  // ── Общие юниформы воксельного материала ─────────────────────────────────
  const U = {
    uSnow: { value: 0 }, uLitter: { value: 0 }, uTime: { value: 0 }, uWind: { value: 0 },
    uBevel: { value: 0.085 }, uHouse: { value: new THREE.Vector4(-5.6, -3.6, 5.6, 3.6) },
  };

  // «Игрушечный» воксель: фаска по краям (наклон нормали), тёмный шов,
  // снег и листва на верхних гранях, покачивание кроны на ветру.
  function voxelMaterial(opts) {
    opts = opts || {};
    const m = new THREE.MeshStandardMaterial({
      roughness: opts.roughness ?? 0.82, metalness: 0,
      transparent: !!opts.transparent, opacity: opts.opacity ?? 1,
      emissive: opts.emissive ? new THREE.Color(opts.emissive) : new THREE.Color(0),
    });
    m.defines = m.defines || {};
    if (opts.noSnow) m.defines.NO_SNOW = '';
    if (opts.sway) m.defines.SWAY = '';
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
          attribute vec3 aSurf;
          uniform float uBevel; uniform float uTime; uniform float uWind;
          varying vec3 vLocal; varying vec3 vLocalN; varying vec3 vBev; varying vec3 vWorld; varying vec3 vWN;
          varying vec3 vAx; varying vec3 vAy; varying vec3 vAz; varying vec3 vSurf; varying float vRand;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vLocal = position; vLocalN = normal; vSurf = aSurf;
          #ifdef USE_INSTANCING
            mat4 iM = instanceMatrix;
          #else
            mat4 iM = mat4(1.0);
          #endif
          vec3 sc = vec3(length(iM[0].xyz), length(iM[1].xyz), length(iM[2].xyz)) *
                    vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz));
          float mnS = min(sc.x, min(sc.y, sc.z));
          vBev = uBevel * mnS / max(sc, vec3(1e-4));
          vec3 cW = (modelMatrix * iM * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          vRand = fract(sin(dot(floor(cW * 2.0 + 0.013), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
          #ifdef SWAY
            if (aSurf.z > 0.0) {
              float ph = uTime * 1.9 + cW.x * 0.31 + cW.z * 0.23;
              vec2 d = vec2(sin(ph) + 0.6 * sin(ph * 2.3 + 1.7), 0.8 + 0.5 * cos(ph * 1.3)) * uWind * aSurf.z * 0.22;
              transformed.xz += d / max(sc.xz, vec2(1e-3));
            }
          #endif
          vWorld = (modelMatrix * iM * vec4(transformed, 1.0)).xyz;
          mat3 m3 = mat3(modelMatrix) * mat3(iM);
          vWN = normalize(m3 * normal);
          vAx = normalize(normalMatrix * (mat3(iM) * vec3(1.0, 0.0, 0.0)));
          vAy = normalize(normalMatrix * (mat3(iM) * vec3(0.0, 1.0, 0.0)));
          vAz = normalize(normalMatrix * (mat3(iM) * vec3(0.0, 0.0, 1.0)));`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform float uSnow; uniform float uLitter; uniform vec4 uHouse;
          varying vec3 vLocal; varying vec3 vLocalN; varying vec3 vBev; varying vec3 vWorld; varying vec3 vWN;
          varying vec3 vAx; varying vec3 vAy; varying vec3 vAz; varying vec3 vSurf; varying float vRand;`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec3 eD = (0.5 - abs(vLocal)) / max(vBev, vec3(1e-4));
          vec3 aN = abs(vLocalN);
          if (aN.x > 0.5) eD.x = 9.0; else if (aN.y > 0.5) eD.y = 9.0; else eD.z = 9.0;
          float edgeK = min(eD.x, min(eD.y, eD.z));
          float seam = mix(0.66, 1.0, smoothstep(0.0, 1.15, edgeK));
          diffuseColor.rgb *= seam;
          #ifndef NO_SNOW
            float upK = vWN.y;
            if (vSurf.y > 0.0) {
              float lt = fract(vRand * 7.31);
              float lm = step(lt, uLitter * vSurf.y) * smoothstep(0.55, 0.8, upK);
              vec3 leafC = mix(vec3(0.55, 0.12, 0.04), vec3(0.8, 0.36, 0.07), fract(vRand * 13.7));
              diffuseColor.rgb = mix(diffuseColor.rgb, leafC * seam, lm);
            }
            if (vSurf.x > 0.0) {
              float th = vRand * 0.8 + 0.1;
              float sA = uSnow * vSurf.x;
              float topC = smoothstep(th - 0.07, th + 0.07, sA) * smoothstep(0.5, 0.8, upK);
              float band = 0.0;
              if (vSurf.x > 0.75 && abs(upK) < 0.5) band = step(0.5 - (0.1 + 0.22 * sA), vLocal.y) * smoothstep(th - 0.05, th + 0.2, sA);
              float cover = max(topC, band);
              vec2 hq = step(uHouse.xy, vWorld.xz) * step(vWorld.xz, uHouse.zw);
              cover *= 1.0 - hq.x * hq.y * step(vWorld.y, 8.3);
              vec3 snowC = vec3(0.93, 0.96, 1.0) * mix(0.9, 1.02, fract(vRand * 3.1)) * seam;
              diffuseColor.rgb = mix(diffuseColor.rgb, snowC, cover);
            }
          #endif`)
        .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
          {
            vec3 kB = 1.0 - clamp((0.5 - abs(vLocal)) / max(vBev, vec3(1e-4)), 0.0, 1.0);
            vec3 aN2 = abs(vLocalN);
            if (aN2.x > 0.5) kB.x = 0.0; else if (aN2.y > 0.5) kB.y = 0.0; else kB.z = 0.0;
            vec3 tilt = kB.x * sign(vLocal.x) * vAx + kB.y * sign(vLocal.y) * vAy + kB.z * sign(vLocal.z) * vAz;
            normal = normalize(normal + tilt * 0.9);
          }`);
    };
    m.customProgramCacheKey = () => 'vox' + (opts.noSnow ? 'N' : '') + (opts.sway ? 'S' : '') + (opts.transparent ? 'T' : '');
    return m;
  }

  // Один воксельный материал на всё: снег, листва и покачивание включаются
  // атрибутом aSurf у каждого кубика (меньше шейдерных программ — быстрее старт).
  const VOX = voxelMaterial({ sway: true });
  const MAT = {
    vox: VOX, sway: VOX, fox: VOX, cloud: VOX, smoke: VOX, water: VOX,
    glow: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  };

  // ── Пачка вокселей → InstancedMesh ───────────────────────────────────────
  const BOX = new THREE.BoxGeometry(1, 1, 1);
  const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
  class VoxBatch {
    constructor(name, mat, opt = {}) {
      this.name = name; this.mat = mat; this.opt = opt;
      this.p = []; this.s = []; this.c = []; this.f = [];
      this.groups = [];
    }
    get count() { return this.p.length / 3; }
    add(x, y, z, color, surf, sx = 1, sy = 1, sz = 1) {
      this.p.push(x, y, z); this.s.push(sx, sy, sz);
      if (color && color.isColor) this.c.push(color.r, color.g, color.b);
      else { let c = CC.get(color); if (!c) { c = new THREE.Color(color); CC.set(color, c); } this.c.push(c.r, c.g, c.b); }
      const sf = surf || [0, 0, 0]; this.f.push(sf[0], sf[1], sf[2]);
      return this.count - 1;
    }
    group(fn, info = {}) {
      const g = Object.assign({ start: this.count, count: 0, batch: this, key: '' }, info);
      fn();
      g.count = this.count - g.start;
      this.groups.push(g);
      return g;
    }
    build() {
      const n = Math.max(1, this.count);
      const geo = BOX.clone();
      const surf = new Float32Array(n * 3); surf.set(this.f);
      geo.setAttribute('aSurf', new THREE.InstancedBufferAttribute(surf, 3));
      const mesh = new THREE.InstancedMesh(geo, this.mat, n);
      mesh.name = this.name;
      mesh.castShadow = this.opt.cast !== false;
      mesh.receiveShadow = this.opt.receive !== false;
      mesh.frustumCulled = false;
      for (let i = 0; i < this.count; i++) {
        _m.makeScale(this.s[i * 3], this.s[i * 3 + 1], this.s[i * 3 + 2]);
        _m.setPosition(this.p[i * 3], this.p[i * 3 + 1], this.p[i * 3 + 2]);
        mesh.setMatrixAt(i, _m);
        mesh.setColorAt(i, TMPC.setRGB(this.c[i * 3], this.c[i * 3 + 1], this.c[i * 3 + 2]));
      }
      if (!this.count) { mesh.setMatrixAt(0, _m.makeScale(0, 0, 0)); mesh.setColorAt(0, new THREE.Color(0)); }
      mesh.instanceMatrix.setUsage(this.opt.dynamic ? THREE.DynamicDrawUsage : THREE.StaticDrawUsage);
      this.mesh = mesh;
      return mesh;
    }
    // Поставить группу (бревно, доску) в мир матрицей M
    placeGroup(g, M) {
      const arr = this.mesh.instanceMatrix.array;
      for (let i = g.start; i < g.start + g.count; i++) {
        _m2.makeScale(this.s[i * 3], this.s[i * 3 + 1], this.s[i * 3 + 2]);
        _m2.setPosition(this.p[i * 3], this.p[i * 3 + 1], this.p[i * 3 + 2]);
        _m.multiplyMatrices(M, _m2);
        _m.toArray(arr, i * 16);
      }
      this.mesh.instanceMatrix.needsUpdate = true;
    }
    hideGroup(g) {
      const arr = this.mesh.instanceMatrix.array;
      for (let i = g.start; i < g.start + g.count; i++) { arr.fill(0, i * 16, i * 16 + 16); }
      this.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  const root = new THREE.Group();
  const B = {
    terrain: new VoxBatch('terrain', MAT.vox, { cast: false }),
    soil: new VoxBatch('soil', MAT.vox, { cast: false }),
    stone: new VoxBatch('stone', MAT.vox),
    wood: new VoxBatch('wood', MAT.sway),
    leaves: new VoxBatch('leaves', MAT.sway, { dynamic: true }),
    logs: new VoxBatch('logs', MAT.vox, { dynamic: true }),
    planks: new VoxBatch('planks', MAT.vox, { dynamic: true }),
    props: new VoxBatch('props', MAT.vox),
    pile: new VoxBatch('pile', MAT.vox, { dynamic: true }),
    water: new VoxBatch('water', MAT.water, { cast: false }),
  };

  // ── Рельеф ───────────────────────────────────────────────────────────────
  const HALF = 36, BASE = -7;
  const CREEK = [[38, -13], [27, -17], [15, -21], [3, -20], [-8, -16.5], [-18, -19], [-27, -15.5], [-38, -12]];
  function segDist(px, pz, ax, az, bx, bz) {
    const vx = bx - ax, vz = bz - az, wx = px - ax, wz = pz - az;
    const k = clamp((wx * vx + wz * vz) / (vx * vx + vz * vz));
    const dx = wx - vx * k, dz = wz - vz * k; return Math.sqrt(dx * dx + dz * dz);
  }
  const CDC = new Map();
  function creekDist(x, z) { const key = x * 1000 + z; const c = CDC.get(key); if (c !== undefined) return c; const d0 = creekDist0(x, z); CDC.set(key, d0); return d0; }
  function creekDist0(x, z) { let d = 1e9; for (let i = 0; i < CREEK.length - 1; i++) d = Math.min(d, segDist(x, z, ...CREEK[i], ...CREEK[i + 1])); return d; }
  const hmap = new Int8Array((HALF * 2) * (HALF * 2));
  const idx = (x, z) => (x + HALF) * (HALF * 2) + (z + HALF);
  function rawH(x, z) {
    const n = fbm(x * 0.055 + 11.3, z * 0.055 - 4.1);
    const r = Math.hypot((x - 1) / 27, (z - 1) / 20);
    let h = (n - 0.42) * 6.5 + Math.max(0, r - 0.95) * 7.5;
    h *= 1 - smooth(1.2, 0.86, r);
    const d = creekDist(x, z);
    if (d < 2.7) h = Math.min(h, 0);
    if (d < 1.35) h = -1;
    return Math.round(clamp(h, -1, 6));
  }
  for (let x = -HALF; x < HALF; x++) for (let z = -HALF; z < HALF; z++) hmap[idx(x, z)] = rawH(x, z);
  function Hat(x, z) { const xi = Math.floor(x + 0.5), zi = Math.floor(z + 0.5); if (xi < -HALF || xi >= HALF || zi < -HALF || zi >= HALF) return BASE; return hmap[idx(xi, zi)]; }

  const GRASS = ['#8C9947', '#98A34F', '#A5A655', '#83903F', '#AFA45A', '#9C9A4A'];
  const DRY = ['#B39855', '#A88C4B', '#BCA160'];
  const DIRT = ['#8A6A48', '#7D5F41', '#94734F'];
  const SAND = ['#B7A079', '#AA9370', '#C0AC86'];
  const SOIL = ['#6F4A31', '#7A5236', '#65432C'];
  const ROCK = ['#6F6A64', '#7C7771', '#625D58'];
  const inHouseRect = (x, z) => x >= -8 && x <= 10 && z >= -6 && z <= 7;
  const TOPS = [];
  for (let x = -HALF; x < HALF; x++) {
    for (let z = -HALF; z < HALF; z++) {
      const h = hmap[idx(x, z)];
      const r = h2(x * 0.7 + 3, z * 1.3 - 5), r2 = h2(x + 17, z - 9);
      const cd = creekDist(x, z);
      let c;
      const zone = fbm(x * 0.07 + 2.3, z * 0.07 - 7.1);
      if (cd < 2.2) c = vary(pick(SAND, r), 0.08, r2);
      else if (inHouseRect(x, z) && fbm(x * 0.22 + 9, z * 0.22) > 0.5) c = vary(pick(DIRT, r), 0.07, r2);
      else if (zone > 0.6) c = vary(pick(DRY, r), 0.06, r2);
      else c = vary(zone < 0.42 ? GRASS[0] : zone < 0.5 ? GRASS[1] : GRASS[2], 0.07, r2);
      const edge = x === -HALF || x === HALF - 1 || z === -HALF || z === HALF - 1;
      const ti = B.terrain.add(x, h - 0.5, z, c, [1, 0, 0]);
      TOPS.push(ti, x, z);
      let mn = h;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        const nh = (nx < -HALF || nx >= HALF || nz < -HALF || nz >= HALF) ? BASE : hmap[idx(nx, nz)];
        mn = Math.min(mn, nh);
      }
      for (let y = mn; y < h - 1; y++) {
        const depth = h - 1 - y;
        const rr = h2(x * 3.1 + y, z * 2.7 - y);
        const cc = depth <= 3 ? vary(pick(SOIL, rr), 0.14, h2(y, x)) : vary(pick(ROCK, rr), 0.12, h2(z, y));
        (edge ? B.soil : B.terrain).add(x, y + 0.5, z, cc, [0, 0, 0]);
      }
      if (cd < 1.35) B.water.add(x, -0.62, z, vary('#3E8C98', 0.1, r), [0, 0, 0], 1, 0.76, 1);
    }
  }

  // ── Деревья ──────────────────────────────────────────────────────────────
  // Крона — объединение эллипсоидов, от которого остаётся только оболочка.
  const LEAF = {
    maple: ['#C23A22', '#D8512A', '#EA742E', '#B02E20', '#F08F38'],
    birch: ['#F0BE4B', '#E6AC3B', '#F5D067', '#D6982A'],
    oak: ['#B4652B', '#C77833', '#9D5425', '#D1893D'],
    aspen: ['#E39A34', '#EDB248', '#D4832C', '#F2C45A'],
    spruce: ['#2D5844', '#346249', '#264C3A', '#3B6D51'],
  };
  const leafList = []; // {i, x,y,z, fall, seed, ever}
  const ck = (x, y, z) => ((x + 200) * 512 + (y + 200)) * 512 + (z + 200);
  function crown(blobs, palette, evergreen, fallBias) {
    const cells = new Map();
    for (const b of blobs) {
      const [cx, cy, cz, rx, ry, rz] = b;
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
        for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
          for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++) {
            const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2 + (h2(x * 1.7 + y, z * 1.3 - y) - 0.5) * 0.35;
            if (d < 1) cells.set(ck(x, y, z), [x, y, z]);
          }
    }
    for (const [k, v] of cells) {
      const [x, y, z] = v;
      let shell = false;
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]])
        if (!cells.has(ck(x + dx, y + dy, z + dz))) { shell = true; break; }
      if (!shell) continue;
      const r = h2(x * 0.9 + y * 3.1, z * 1.7 - y);
      const c = vary(pick(palette, r), 0.16, h2(z, x + y));
      const i = B.leaves.add(x, y + 0.5, z, c, [evergreen ? 1 : 0.55, 0, 0.55 + y * 0.02]);
      const u = h2(x * 2.3 - z, y * 1.9 + z);
      leafList.push({ i, x, y: y + 0.5, z, u: clamp(u * (1 - fallBias) + fallBias * 0.5), seed: h2(x + 0.3, z + y), ever: evergreen });
    }
  }
  function trunk(x, z, h, w, cTr, cDark, birch) {
    const g = Hat(x, z);
    for (let y = 0; y < h; y++)
      for (let ix = 0; ix < w; ix++) for (let iz = 0; iz < w; iz++) {
        let c = vary(cTr, 0.12, h2(x + ix + y, z + iz));
        if (birch && h2(y * 1.3, x + ix * 7 + iz) > 0.72) c = col(cDark);
        B.wood.add(x + ix, g + y + 0.5, z + iz, c, [0.3, 0, y / h * 0.35]);
      }
    return g;
  }
  function branch(x0, y0, z0, dx, dy, dz, len, cTr) {
    for (let k = 1; k <= len; k++) B.wood.add(Math.round(x0 + dx * k), Math.round(y0 + dy * k) + 0.5, Math.round(z0 + dz * k), vary(cTr, 0.14, h2(x0 + k, z0 - k)), [0.8, 0, 0.5]);
  }
  const trees = [];
  function tree(type, x, z, s = 1) {
    trees.push({ type, x, z });
    if (type === 'spruce') {
      const h = Math.round(12 * s + 2);
      const g = trunk(x, z, h, 1, '#4A3526', '', false);
      const blobs = [];
      for (let k = 0; k < 5; k++) {
        const y = g + 2.5 + k * (h - 3) / 5, rad = (3.3 - k * 0.6) * s;
        blobs.push([x, y, z, rad, 1.4 * s, rad]);
      }
      blobs.push([x, g + h + 0.2, z, 0.9, 1.4, 0.9]);
      crown(blobs, LEAF.spruce, true, 0);
      return;
    }
    const birch = type === 'birch';
    const h = Math.round((birch ? 9 : 7) * s + 1);
    const w = type === 'maple' && s > 1.05 ? 2 : 1;
    const cTr = birch ? '#ECE4D6' : '#5C4130';
    const g = trunk(x, z, h, w, cTr, '#2E2824', birch);
    const cx = x + (w - 1) / 2, cz = z + (w - 1) / 2, top = g + h;
    const nb = birch ? 2 : 3;
    const blobs = birch ? [[cx, top + 1.6 * s, cz, 2.1 * s, 3.3 * s, 2.1 * s]] : [[cx, top + 1.3 * s, cz, 2.9 * s, 2.5 * s, 2.9 * s]];
    for (let b = 0; b < nb; b++) {
      const a = b / nb * Math.PI * 2 + h2(x, z) * 3;
      const len = Math.round((birch ? 1.6 : 2.2) * s);
      const dx = Math.cos(a) * 0.85, dz = Math.sin(a) * 0.85;
      const by = top - 1 - (b % 2);
      branch(cx, by, cz, dx, 0.6, dz, len, birch ? '#5B4E45' : cTr);
      blobs.push([cx + dx * len, by + len * 0.6 + 1.0, cz + dz * len, (birch ? 1.5 : 1.9) * s, (birch ? 1.9 : 1.6) * s, (birch ? 1.5 : 1.9) * s]);
    }
    crown(blobs, LEAF[type], false, 0);
  }
  // Ключевые деревья (кадры строятся вокруг них)
  tree('maple', -16, 11, 1.08);    // клён, под которым спит лиса
  tree('birch', -22, -6, 1.0);
  tree('birch', -25, 2, 0.9);
  tree('aspen', -9, -26, 1.0);
  tree('oak', 25, -15, 1.1);
  tree('spruce', 6, -29, 1.2);
  tree('spruce', -2, -27, 0.9);
  tree('spruce', 18, -28, 1.05);
  tree('spruce', 30, 4, 1.0);
  tree('spruce', -30, -22, 1.1);
  tree('birch', 27, 12, 1.0);
  tree('maple', 22, 22, 1.0);
  tree('aspen', -26, 20, 0.95);
  tree('oak', -12, 28, 1.0);
  tree('spruce', 8, 30, 0.95);
  // Остальные — по кольцу вокруг поляны
  {
    const types = ['maple', 'birch', 'aspen', 'oak', 'spruce', 'spruce', 'birch', 'maple'];
    let tries = 0, placed = 0;
    while (placed < 15 && tries < 900) {
      tries++;
      const x = Math.round((R() * 2 - 1) * (HALF - 3)), z = Math.round((R() * 2 - 1) * (HALF - 3));
      const r = Math.hypot((x - 1) / 27, (z - 1) / 20);
      if (r < 1.06) continue;
      if (z > 10 && R() < 0.65) continue;
      if (creekDist(x, z) < 3.2) continue;
      if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 7.5)) continue;
      tree(types[placed % types.length], x, z, 0.75 + R() * 0.4);
      placed++;
    }
  }

  // Опавшая листва ложится пятнами под лиственными деревьями
  for (let k = 0; k < TOPS.length; k += 3) {
    const i = TOPS[k], x = TOPS[k + 1], z = TOPS[k + 2];
    let d = 99;
    for (const t of trees) if (t.type !== 'spruce') d = Math.min(d, Math.hypot(t.x - x, t.z - z));
    const n = fbm(x * 0.21 + 4, z * 0.21 - 2);
    B.terrain.f[i * 3 + 1] = clamp(1.25 - d / 7 + (n - 0.5) * 0.9, 0, 1);
  }

  // ── Камни, кусты, грибы ──────────────────────────────────────────────────
  function rock(x, z, n) {
    const g = Hat(x, z);
    for (let k = 0; k < n; k++) {
      const dx = Math.round((h2(x + k, z) - 0.5) * 2.2), dz = Math.round((h2(z + k, x) - 0.5) * 2.2);
      const up = k < 2 ? 0 : (h2(k, x) > 0.5 ? 1 : 0);
      B.stone.add(x + dx, g + up + 0.5, z + dz, vary(pick(ROCK, h2(k, z)), 0.2, h2(x, k)), [1, 0, 0]);
    }
  }
  [[-6, 14, 4], [12, 13, 3], [-20, -13, 5], [20, -22, 4], [4, -16, 3], [-30, 10, 4], [31, -6, 3], [-4, 22, 3]].forEach((r) => rock(...r));
  function bush(x, z, berries) {
    const g = Hat(x, z);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let y = 0; y < 2; y++) {
      if (Math.abs(dx) + Math.abs(dz) + y > 2) continue;
      const c = vary(pick(['#7A6A2E', '#8A5A26', '#6B5E28'], h2(dx + x, dz + y)), 0.15, h2(z, dx));
      B.props.add(x + dx, g + y + 0.5, z + dz, c, [1, 0, 0]);
    }
    if (berries) for (let k = 0; k < 5; k++) B.props.add(x + (h2(k, x) - 0.5) * 2.4, g + 1.6 + h2(x, k) * 0.6, z + (h2(z, k) - 0.5) * 2.4, col('#D02A1E'), [0, 0, 0], 0.4, 0.4, 0.4);
  }
  [[-19, 17, true], [14, 9, false], [-18, 3, true], [10, -13, true], [24, 6, false]].forEach((b) => bush(...b));
  function mushroom(x, z, red) {
    const g = Hat(x, z);
    B.props.add(x, g + 0.25, z, col('#EDE3CF'), [0, 0, 0], 0.25, 0.5, 0.25);
    B.props.add(x, g + 0.6, z, col(red ? '#C8321F' : '#8A5A33'), [0.6, 0, 0], 0.6, 0.25, 0.6);
  }
  [[-12.6, 13.2, true], [-13.3, 14.1, false], [11.3, -12.2, true], [-7.2, -12.6, false], [15.6, 7.4, true]].forEach((m) => mushroom(...m));

  // ── Руины: фундамент, печная труба, пол, очаг ────────────────────────────
  const STONE = ['#8B867F', '#7A756F', '#9D988F', '#6C6761', '#83807A'];
  for (let x = -7; x <= 7; x++) for (let z = -5; z <= 5; z++) {
    const onRing = (Math.abs(x) >= 6 && Math.abs(x) <= 7 && Math.abs(z) <= 5) || (Math.abs(z) >= 4 && Math.abs(z) <= 5 && Math.abs(x) <= 7);
    if (!onRing) continue;
    if (Math.abs(x) === 7 && Math.abs(z) === 5) continue;
    B.stone.add(x, 0.5, z, vary(pick(STONE, h2(x * 3, z)), 0.18, h2(z, x)), [1, 0.4, 0]);
  }
  for (let x = -5; x <= 5; x++) for (let z = -3; z <= 3; z++)
    B.props.add(x, 0.5, z, vary(x % 2 === 0 ? '#9E7449' : '#A67C50', 0.1, h2(x, z)), [0, 0, 0]);
  // половик у очага
  for (let x = 0; x <= 4; x++) for (let z = -2; z <= 2; z++) {
    const edge = x === 0 || x === 4 || Math.abs(z) === 2;
    B.props.add(x, 1.06, z, col(edge ? '#D9A441' : ((x + z) % 2 === 0 ? '#A3302A' : '#8E2622')), [0, 0, 0], 1, 0.12, 1);
  }
  // лежанка под окном: на ней лиса спит в финале (её видно снаружи сквозь стекло)
  for (let x = 1; x <= 4; x++) {
    for (const y of [1.5, 2.5]) B.props.add(x, y, 2.9, vary(y > 2 ? '#8E5E36' : '#7A4E2C', 0.1, h2(x, y)), [0, 0, 0]);
    B.props.add(x, 3.06, 2.9, col(x === 1 || x === 4 ? '#C99A3E' : (x % 2 ? '#B3402D' : '#A33A29')), [0, 0, 0], 1, 0.12, 1);
  }
  // печная труба снаружи восточной стены
  for (let y = 0; y < 15; y++) for (let x = 8; x <= 9; x++) for (let z = -1; z <= 0; z++) {
    if (y > 12 && h2(x + y, z) > 0.8) continue;
    B.stone.add(x, y + 0.5, z, vary(pick(STONE, h2(x + y * 3, z - y)), 0.2, h2(y, x + z)), [y === 14 ? 1 : 0.8, 0, 0]);
  }
  // очаг внутри
  for (let z = -2; z <= 1; z++) for (let y = 1; y <= 3; y++) {
    if (y < 3 && z > -2 && z < 1) continue;
    B.stone.add(5, y + 0.5, z, vary(pick(STONE, h2(z, y)), 0.2, h2(y, z)), [0, 0, 0]);
  }
  // пенёк и поленница-ориентир у дома
  for (let y = 0; y < 2; y++) for (let dx = 0; dx < 2; dx++) for (let dz = 0; dz < 2; dz++)
    B.wood.add(-10 + dx, y + 0.5, 6 + dz, vary(y === 1 ? '#C9A26B' : '#5C4130', 0.1, h2(dx, dz + y)), [1, 0.2, 0]);

  // ── Брёвна стен (динамические группы) ────────────────────────────────────
  const BARK = ['#B07B47', '#A06A3B', '#BC8852', '#A87442'];
  const logs = [];
  function logGroup(batch, axis, len, info) {
    return batch.group(() => {
      for (let k = 0; k < len; k++) {
        const u = k - (len - 1) / 2;
        const skip = info.skip && info.skip(u);
        if (skip) continue;
        const end = k === 0 || k === len - 1;
        const r = h2(k * 1.7 + (info.seed || 0), len);
        const c = end ? vary('#E8C68E', 0.08, r) : vary(pick(BARK, r), 0.14, h2(k, info.seed || 1));
        if (axis === 'x') batch.add(u, 0, 0, c, [0.8, 0, 0]); else batch.add(0, 0, u, c, [0.8, 0, 0]);
      }
    }, info);
  }
  const door = { x0: -3.5, x1: -0.5, top: 6 };   // проём двери (по x), до высоты 6
  const win = { x0: 1.5, x1: 4.5, y0: 3, y1: 6 };
  for (let c = 0; c < 7; c++) {
    const y = 1.5 + c;
    const even = c % 2 === 0;
    const fx = even ? 15 : 11, sz = even ? 7 : 11;
    for (const zs of [4, -4]) {
      const front = zs === 4;
      const skip = front ? (u) => ((u >= -3 && u <= -1) && y < door.top) || ((u >= 2 && u <= 4) && y > win.y0 && y < win.y1) : null;
      logs.push(logGroup(B.logs, 'x', fx, { pos: [0, y, zs], axis: 'x', skip, seed: c * 10 + zs, course: c }));
    }
    for (const xs of [-6, 6]) logs.push(logGroup(B.logs, 'z', sz, { pos: [xs, y, 0], axis: 'z', seed: c * 20 + xs, course: c }));
  }
  // фронтоны
  for (let g = 0; g < 5; g++) {
    const len = 2 * (4 - g) + 1;
    for (const xs of [-6, 6]) logs.push(logGroup(B.logs, 'z', len, { pos: [xs, 8.5 + g, 0], axis: 'z', seed: 70 + g * 3 + xs, course: 7 + g }));
  }
  logs.push(logGroup(B.logs, 'x', 15, { pos: [0, 12.5, 0], axis: 'x', seed: 99, course: 12 }));   // конёк

  // ── Доски крыши ──────────────────────────────────────────────────────────
  const planks = [];
  const PLANK = ['#8E4630', '#9C5036', '#833F2B', '#A2573A'];
  for (let k = 0; k < 5; k++) for (const side of [1, -1]) {
    const g = B.planks.group(() => {
      for (let i = -7; i <= 7; i++) {
        const r = h2(i * 1.3 + k, side);
        const c = (i === -7 || i === 7) ? vary('#9C5E3E', 0.08, r) : vary(pick(PLANK, r), 0.12, h2(i, k * side));
        B.planks.add(i, 0, 0, c, [1, 0, 0]);
      }
    }, { pos: [0, 8.5 + k, side * (5 - k)], k, side });
    planks.push(g);
  }

  // ── Поленница (брёвна «из леса») ─────────────────────────────────────────
  const pileLogs = [];
  const PILE = [[15, 0.5], [16, 0.5], [17, 0.5], [18, 0.5], [19, 0.5], [15.5, 1.5], [16.5, 1.5], [17.5, 1.5], [18.5, 1.5]];
  PILE.forEach(([x, y], i) => pileLogs.push(logGroup(B.pile, 'z', 13, { pos: [x, y, -8], axis: 'z', seed: 200 + i })));
  // бревно в зубах у лисы
  const carryLog = logGroup(B.pile, 'x', 11, { pos: [0, -50, 0], axis: 'x', seed: 300 });

  // ── Дверь и окно ─────────────────────────────────────────────────────────
  const doorB = new VoxBatch('door', MAT.vox);
  for (let x = 0; x < 3; x++) for (let y = 0; y < 5; y++) {
    const brace = (y === 1 || y === 3);
    doorB.add(x + 0.5, y + 0.5, 0, vary(brace ? '#7E5230' : '#A2703F', 0.1, h2(x, y)), [0, 0, 0], 1, 1, 0.45);
  }
  doorB.add(2.35, 2.5, 0.3, col('#2F2A27'), [0, 0, 0], 0.3, 0.3, 0.3);
  const doorMesh = doorB.build();
  const doorPivot = new THREE.Group();
  doorPivot.position.set(-3.5, 1, 4);
  doorPivot.add(doorMesh);

  const winB = new VoxBatch('window', MAT.vox);
  for (let i = 0; i < 4; i++) {
    winB.add(1.5 + i, 3.1, 4.15, col('#5A3A28'), [1, 0, 0], 1, 0.22, 0.5);     // подоконник
    winB.add(1.5 + i, 5.9, 4.15, col('#5A3A28'), [1, 0, 0], 1, 0.22, 0.5);
  }
  winB.add(3, 4.5, 4.12, col('#5A3A28'), [0, 0, 0], 0.18, 3, 0.3);
  winB.add(3, 4.5, 4.12, col('#5A3A28'), [0, 0, 0], 3, 0.18, 0.3);
  const winMesh = winB.build();
  const glassGeo = new THREE.BoxGeometry(3, 3, 0.1);
  const glassMat = new THREE.MeshBasicMaterial({ color: 0x223040, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const glass = new THREE.Mesh(glassGeo, glassMat);
  glass.position.set(3, 4.5, 4.02);

  // огонь в очаге — светящиеся кубики
  const fireB = new VoxBatch('fire', MAT.glow, { cast: false, receive: false, dynamic: true });
  const fireVox = [];
  for (let k = 0; k < 9; k++) fireVox.push(fireB.add(4.7, 1.3 + (k % 3) * 0.3, -0.5 + ((k * 0.37) % 1 - 0.5), col('#FF9A3A'), [0, 0, 0], 0.4, 0.4, 0.4));
  const fireMesh = fireB.build();

  // ── Облака ───────────────────────────────────────────────────────────────
  const cloudB = new VoxBatch('clouds', MAT.cloud, { dynamic: true, receive: false });
  const clouds = [];
  const CL = [
    [-58, 44, -30, 1.0, 0], [-12, 50, -62, 1.3, 0], [44, 46, -40, 1.1, 0], [66, 42, 18, 0.9, 0], [30, 52, 64, 1.2, 0],
    [-20, 56, 90, 1.0, 0], [-5, 28, -95, 1.6, 1], [25, 30, -110, 1.8, 1], [-35, 29, -120, 1.7, 1], [5, 27, -140, 2.0, 1], [45, 31, -150, 1.6, 1],
  ];
  CL.forEach(([x, y, z, s, storm], ci) => {
    const g = cloudB.group(() => {
      const blobs = [[0, 0, 0, 5 * s, 1.8 * s, 3.5 * s], [3.5 * s, 1.2 * s, 0.5, 3.5 * s, 1.8 * s, 3 * s], [-3.8 * s, 0.4, -0.6, 3.2 * s, 1.4 * s, 2.6 * s]];
      const seen = new Set();
      for (const [cx, cy, cz, rx, ry, rz] of blobs)
        for (let ix = -Math.ceil(rx / 2); ix <= Math.ceil(rx / 2); ix++)
          for (let iy = -Math.ceil(ry / 2); iy <= Math.ceil(ry / 2); iy++)
            for (let iz = -Math.ceil(rz / 2); iz <= Math.ceil(rz / 2); iz++) {
              const px = cx + ix * 2, py = cy + iy * 2, pz = cz + iz * 2;
              const d = ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 + ((pz - cz) / rz) ** 2;
              const key = Math.round(px / 2) + ',' + Math.round(py / 2) + ',' + Math.round(pz / 2);
              if (d > 1 || seen.has(key)) continue;
              seen.add(key);
              const c = storm ? vary('#5F6772', 0.12, h2(ix + ci, iz)) : vary(py > cy ? '#FFFFFF' : '#E8EDF2', 0.05, h2(ix, iz + ci));
              cloudB.add(Math.round(px / 2) * 2, Math.round(py / 2) * 2, Math.round(pz / 2) * 2, c, [0, 0, 0], 2, 2, 2);
            }
    }, { pos: [x, y, z], storm, s });
    clouds.push(g);
  });

  // ── Сборка сцены ─────────────────────────────────────────────────────────
  for (const k in B) root.add(B[k].build());
  B.soil.mesh.castShadow = false;
  root.add(doorPivot, winMesh, glass, fireMesh, cloudB.build());

  // Исходная расстановка динамических групп
  const _M = new THREE.Matrix4();
  for (const g of logs) B.logs.hideGroup(g);
  for (const g of planks) B.planks.hideGroup(g);
  for (const g of pileLogs) B.pile.placeGroup(g, _M.makeTranslation(...g.pos));
  B.pile.hideGroup(carryLog);
  for (const g of clouds) cloudB.placeGroup(g, _M.makeTranslation(...g.pos));

  return {
    root, MAT, U, B, H: Hat, HALF, BASE, voxelMaterial, VoxBatch,
    logs, planks, pileLogs, carryLog, leafList, clouds, cloudB,
    doorPivot, glass, glassMat, fireMesh, fireB, fireVox, trees, CREEK,
    chimneyTop: new THREE.Vector3(8.5, 15.2, -0.5),
  };
};
