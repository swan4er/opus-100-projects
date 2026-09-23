/* ================================================================
   Тихоречинск — сцена three.js: небо и солнце по времени суток,
   земля и разметка, дома с окнами, которые зажигают жильцы,
   деревья (осень), фонари, река, метро, трубы и краны.
   Жители и машины — в actors.js.
   ================================================================ */
(function (LC) {
  'use strict';

  LC.createScene = function (THREE) {
    const city = LC.city;
    const SHOT = !!window.__SHOT__;
    const mobile = LC.isMobile;
    const R = {};

    // ---------------- рендерер ----------------
    const canvas = document.getElementById('scene');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
    const dpr = SHOT ? 1 : Math.min(window.devicePixelRatio || 1, mobile ? 1.6 : 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    // в съёмке сумерек теней нет — программному рендеру так легче
    const shotNight = SHOT && (LC.CFG.shotMinute > 18 * 60 + 50 || LC.CFG.shotMinute < 6 * 60);
    renderer.shadowMap.enabled = !shotNight;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;
    R.renderer = renderer;

    const scene = new THREE.Scene();
    R.scene = scene;
    const camera = new THREE.PerspectiveCamera(44, window.innerWidth / window.innerHeight, 3, 9000);
    R.camera = camera;
    scene.fog = new THREE.FogExp2(0x9fb0c2, 0.00032);

    // ---------------- общие униформы ----------------
    const U = R.U = {
      uTime: { value: 0 },
      uNight: { value: 0 },      // 0 — день, 1 — ночь
      uLamps: { value: 0 },      // фонари включены
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunCol: { value: new THREE.Color(1, 1, 1) },
      uSkyAmb: { value: new THREE.Color(0.5, 0.55, 0.65) },
      uGndAmb: { value: new THREE.Color(0.25, 0.22, 0.2) },
      uFogCol: { value: new THREE.Color(0.6, 0.65, 0.7) },
      uFogDen: { value: 0.00032 },
      uCam: { value: new THREE.Vector3() },
      uPx: { value: 1 },         // пикселей на радиан по вертикали (для размера точек)
    };

    // ---------------- свет ----------------
    const hemi = new THREE.HemisphereLight(0xbfd4ee, 0x5a5048, 1.0);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 2.0);
    sun.castShadow = true;
    const SM = mobile ? 2048 : 4096;
    sun.shadow.mapSize.set(SM, SM);
    const sc = sun.shadow.camera;
    sc.left = -760; sc.right = 760; sc.top = 760; sc.bottom = -760; sc.near = 50; sc.far = 3200;
    sun.shadow.bias = -0.00035; sun.shadow.normalBias = 0.8;
    scene.add(sun); scene.add(sun.target);
    R.sun = sun; R.hemi = hemi;

    // ---------------- помощники геометрии ----------------
    // накопитель треугольников с цветом
    function Builder() {
      this.p = []; this.n = []; this.c = []; this.i = []; this.extra = {};
    }
    Builder.prototype.quad = function (ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, nx, ny, nz, col, ex) {
      const k = this.p.length / 3;
      this.p.push(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz);
      for (let q = 0; q < 4; q++) { this.n.push(nx, ny, nz); this.c.push(col.r, col.g, col.b); }
      if (ex) for (const key in ex) { const arr = (this.extra[key] = this.extra[key] || { size: ex[key].length, data: [] }); for (let q = 0; q < 4; q++) arr.data.push(...ex[key]); }
      this.i.push(k, k + 1, k + 2, k, k + 2, k + 3);
    };
    // горизонтальный прямоугольник на высоте y
    Builder.prototype.rect = function (x0, z0, x1, z1, y, col, ex) {
      this.quad(x0, y, z0, x0, y, z1, x1, y, z1, x1, y, z0, 0, 1, 0, col, ex);
    };
    // коробка без дна
    Builder.prototype.box = function (x0, y0, z0, x1, y1, z1, col, ex, roofCol) {
      this.quad(x0, y1, z0, x0, y1, z1, x1, y1, z1, x1, y1, z0, 0, 1, 0, roofCol || col, ex); // крыша
      this.quad(x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1, 0, 0, 1, col, ex);            // юг
      this.quad(x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0, 0, 0, -1, col, ex);           // север
      this.quad(x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y1, z1, 1, 0, 0, col, ex);            // восток
      this.quad(x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0, -1, 0, 0, col, ex);           // запад
    };
    Builder.prototype.geometry = function () {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
      for (const key in this.extra) g.setAttribute(key, new THREE.Float32BufferAttribute(this.extra[key].data, this.extra[key].size));
      g.setIndex(this.p.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
      g.computeBoundingSphere();
      return g;
    };
    const col = (hex) => new THREE.Color(hex);
    R.Builder = Builder;

    // ================================================================
    // Земля: асфальт, тротуары, дворы, разметка, парк
    // ================================================================
    const X = city.X, Z = city.Z, NX = city.NX, NZ = city.NZ;
    const gb = new Builder();
    const ASPH = col(0x3c3f45), SIDE = col(0x9d988e), CURB = col(0xb9b4aa);
    const YARD = { R: col(0x6d7458), C: col(0x9b958a), I: col(0x77736b), E: col(0x9e9686), P: col(0x55703c) };
    const x0c = X[0] - city.hwX(0) - 6, x1c = X[NX] + city.hwX(NX) + 6, z0c = Z[0] - city.hwZ(0) - 6;
    // асфальт под городом
    gb.rect(x0c, z0c, x1c, city.riverZ0, 0, ASPH);
    // окрестности: поля и газоны
    const FIELD = col(0x4d5a39), FIELD2 = col(0x5b6641);
    gb.rect(-6000, -6000, 6000, z0c, -0.05, FIELD);
    gb.rect(-6000, z0c, x0c, city.riverZ0, -0.05, FIELD2);
    gb.rect(x1c, z0c, 6000, city.riverZ0, -0.05, FIELD2);
    gb.rect(-6000, city.riverZ1, 6000, 6000, -0.05, FIELD);
    // кварталы: тротуарная плита и двор
    for (const b of city.blocks) {
      const h = 0.16;
      const c0 = b.d === 'P' ? col(0x8d8a7c) : SIDE;
      gb.box(b.sx0, 0, b.sz0, b.sx1, h, b.sz1, CURB, null, c0);
      const yc = b.d === 'P' ? YARD.P : YARD[b.d];
      gb.rect(b.lx0 - 0.4, b.lz0 - 0.4, b.lx1 + 0.4, b.lz1 + 0.4, h + 0.01, yc);
      if (b.field) { // школьное поле
        gb.rect(b.field.x0, b.field.z0, b.field.x1, b.field.z1, h + 0.02, col(0x5f7f45));
        gb.rect(b.field.x0 + 3, b.field.z0 + 3, b.field.x1 - 3, b.field.z1 - 3, h + 0.03, col(0x6b8c4c));
      }
    }
    // парк: общая зелень, дорожки, пруд
    if (city.park) {
      const pk = city.park;
      gb.rect(pk.x0, pk.z0, pk.x1, pk.z1, 0.17, YARD.P);
      const PATH = col(0xb7a88a);
      const diag = (ax, az, bx, bz, w) => {
        const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz), nx = -dz / l * w / 2, nz = dx / l * w / 2;
        gb.quad(ax + nx, 0.185, az + nz, bx + nx, 0.185, bz + nz, bx - nx, 0.185, bz - nz, ax - nx, 0.185, az - nz, 0, 1, 0, PATH);
      };
      diag(pk.x0 + 2, pk.z0 + 2, pk.x1 - 2, pk.z1 - 2, 4);
      diag(pk.x1 - 2, pk.z0 + 2, pk.x0 + 2, pk.z1 - 2, 4);
      // дорожки по бывшим улицам
      const pb = city.blocks.filter((b) => b.d === 'P');
      for (const b of pb) {
        gb.rect(b.sx0, b.sz0, b.sx1, b.sz0 + 4, 0.18, PATH);
        gb.rect(b.sx0, b.sz1 - 4, b.sx1, b.sz1, 0.18, PATH);
        gb.rect(b.sx0, b.sz0, b.sx0 + 4, b.sz1, 0.18, PATH);
        gb.rect(b.sx1 - 4, b.sz0, b.sx1, b.sz1, 0.18, PATH);
      }
      // круглая площадь в центре
      const cx = pk.cx, cz = pk.cz;
      for (let k = 0; k < 24; k++) {
        const a0 = (k / 24) * Math.PI * 2, a1 = ((k + 1) / 24) * Math.PI * 2;
        gb.quad(cx, 0.19, cz, cx + Math.cos(a0) * 15, 0.19, cz + Math.sin(a0) * 15, cx + Math.cos(a1) * 15, 0.19, cz + Math.sin(a1) * 15, cx, 0.19, cz, 0, 1, 0, PATH);
      }
    }
    // набережная: гранит
    const PROM = col(0xa49c8c);
    gb.rect(x0c - 400, Z[NZ] + city.hwZ(NZ), x1c + 400, city.riverZ0, 0.2, PROM);
    for (let x = x0c - 400; x < x1c + 400; x += 12) gb.rect(x, Z[NZ] + city.hwZ(NZ) + 5.5, x + 6, Z[NZ] + city.hwZ(NZ) + 8.5, 0.21, col(0x8f8779));
    gb.box(x0c - 400, -4, city.riverZ0 - 0.9, x1c + 400, 1.0, city.riverZ0, col(0x7c7468), null, col(0x9a9284)); // парапет
    // дальний берег
    gb.box(-6000, -4, city.riverZ1, 6000, 0.4, city.riverZ1 + 16, col(0x6e6553), null, col(0x9c8f6c));

    // разметка
    const WHITE = col(0xd8d6cf), MED = col(0x8f8b83), YEL = col(0xd9b64c);
    const R0 = city.road;
    for (const q of R0.roads) {
      if (q.dir === 2 || q.dir === 3) continue; // одна разметка на пару
      const ax = q.dx !== 0;
      if (q.ave) {
        // разделительная полоса с бордюром
        const hw = city.MEDIAN / 2;
        if (ax) gb.box(q.x0, 0, q.z0 - hw, q.x0 + q.len, 0.18, q.z0 + hw, MED, null, col(0x6f7a58));
        else gb.box(q.x0 - hw, 0, q.z0, q.x0 + hw, 0.18, q.z0 + q.len, MED, null, col(0x6f7a58));
        // пунктир между рядами
        for (const sgn of [-1, 1]) {
          const off = hw + city.LANE;
          for (let s = 2; s < q.len - 2; s += 9) {
            const e = Math.min(s + 4.5, q.len - 2);
            if (ax) gb.rect(q.x0 + s, q.z0 + sgn * off - 0.07, q.x0 + e, q.z0 + sgn * off + 0.07, 0.03, WHITE);
            else gb.rect(q.x0 + sgn * off - 0.07, q.z0 + s, q.x0 + sgn * off + 0.07, q.z0 + e, 0.03, WHITE);
          }
        }
      } else {
        for (let s = 2; s < q.len - 2; s += 7) {
          const e = Math.min(s + 3, q.len - 2);
          if (ax) gb.rect(q.x0 + s, q.z0 - 0.07, q.x0 + e, q.z0 + 0.07, 0.03, WHITE);
          else gb.rect(q.x0 - 0.07, q.z0 + s, q.x0 + 0.07, q.z0 + e, 0.03, WHITE);
        }
      }
    }
    // зебры и стоп-линии на перекрёстках со светофором
    for (const n of R0.nodes) {
      if (!n.live) continue;
      let cnt = 0; for (let d = 0; d < 4; d++) if (n.out[d] >= 0) cnt++;
      if (cnt < 3) continue;
      // зебры и там, где нет светофора: пешеходы переходят по разметке
      const hx = n.hwx, hz = n.hwz;
      // переходы через дорогу вдоль z (по x-линии) — полосы поперёк
      for (const sz of [-1, 1]) {
        const zc = n.z + sz * (hz + city.S / 2);
        if ((sz < 0 && n.out[3] < 0) || (sz > 0 && n.out[1] < 0)) continue;
        for (let x = n.x - hx + 0.4; x < n.x + hx - 0.4; x += 1.1) gb.rect(x, zc - 1.6, x + 0.55, zc + 1.6, 0.03, WHITE);
      }
      for (const sx of [-1, 1]) {
        const xc = n.x + sx * (hx + city.S / 2);
        if ((sx < 0 && n.out[2] < 0) || (sx > 0 && n.out[0] < 0)) continue;
        for (let z = n.z - hz + 0.4; z < n.z + hz - 0.4; z += 1.1) gb.rect(xc - 1.6, z, xc + 1.6, z + 0.55, 0.03, WHITE);
      }
    }
    // автобусные остановки: жёлтая разметка
    if (LC.traffic && LC.traffic.G) {
      for (const r in LC.traffic.G.stopAt) {
        const q = R0.roads[r], s = LC.traffic.G.stopAt[r];
        const off = LC.traffic.laneOff(+r, 1) + 1.2;
        const x = q.x0 + q.dx * s + q.rx * off, z = q.z0 + q.dz * s + q.rz * off;
        if (q.dx !== 0) gb.rect(x - 7, z - 0.1, x + 7, z + 0.1, 0.035, YEL); else gb.rect(x - 0.1, z - 7, x + 0.1, z + 7, 0.035, YEL);
      }
    }
    const groundMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const ground = new THREE.Mesh(gb.geometry(), groundMat);
    ground.receiveShadow = true;
    scene.add(ground);

    // ================================================================
    // Дома: одна геометрия, окна рисует шейдер
    // ================================================================
    const nB = city.buildings.length;
    const litW = 512, litH = Math.ceil(nB / 512);
    const litData = new Uint8Array(litW * litH * 4);
    const litTex = new THREE.DataTexture(litData, litW, litH, THREE.RGBAFormat);
    litTex.needsUpdate = true;
    R.litData = litData; R.litTex = litTex;
    U.uLit = { value: litTex };
    U.uSel = { value: new THREE.Vector4(-1, 0, 0, 0) }; // здание, этаж, колонка, сторона
    U.uShop = { value: 0 };
    const bb = new Builder();
    // ширина «колонки» окна по стилю
    const COLW = [3.1, 2.4, 3.3, 6.5, 100, 3.6];
    R.COLW = COLW;
    for (const p of city.parts) {
      const B = city.buildings[p.b];
      const c = col(p.color);
      const roof = c.clone().multiplyScalar(0.62);
      if (B.kind === 'school' || B.kind === 'kindergarten') roof.setHex(0x8a4b3c);
      if (B.kind === 'factory' || B.kind === 'warehouse') roof.setHex(0x6d6a64);
      const shop = B.venues.some((v) => { const t = city.venues[v].type; return t === 'shop' || t === 'cafe' || t === 'bar' || t === 'restaurant'; }) ? 1 : 0;
      const style = p.style;
      const ex = { aB: [p.b], aW: [B.floorH, style, COLW[style], shop] };
      bb.box(p.x - p.w / 2, p.y0, p.z - p.d / 2, p.x + p.w / 2, p.y0 + p.h, p.z + p.d / 2, c, ex, roof);
      // парапет и «коробочки» на крышах высоток
      if (p.h > 25 && style !== 3) {
        const top = p.y0 + p.h;
        const e2 = { aB: [p.b], aW: [B.floorH, 4, 100, 0] };
        bb.box(p.x - p.w * 0.18, top, p.z - p.d * 0.15, p.x + p.w * 0.12, top + 2.6, p.z + p.d * 0.2, col(0x8c8a86), e2);
      }
    }
    // трубы
    for (const ch of city.chimneys) {
      const e2 = { aB: [ch.b], aW: [3, 4, 100, 0] };
      if (ch.crane) {
        bb.box(ch.x - 1, 0, ch.z - 1, ch.x + 1, ch.h, ch.z + 1, col(0xd9a23a), e2);
        bb.box(ch.x - 26, ch.h, ch.z - 0.8, ch.x + 8, ch.h + 1.6, ch.z + 0.8, col(0xd9a23a), e2);
        continue;
      }
      const seg = 6;
      for (let k = 0; k < seg; k++) {
        const y0 = (ch.h / seg) * k, y1 = (ch.h / seg) * (k + 1);
        const r0 = ch.r * (1 - k * 0.05), r1 = ch.r * (1 - (k + 1) * 0.05);
        const cc = k % 2 === 0 ? col(0xb54a3a) : col(0xe7e2d8);
        const rr = (r0 + r1) / 2;
        bb.box(ch.x - rr, y0, ch.z - rr, ch.x + rr, y1, ch.z + rr, cc, e2, col(0x3a3532));
      }
    }
    // павильоны метро
    for (const st of city.stations) {
      const e2 = { aB: [0], aW: [3, 4, 100, 0] };
      bb.box(st.px - 3.5, 0.16, st.pz - 2.2, st.px + 3.5, 3.2, st.pz + 2.2, col(0xc9c3b6), e2, col(0x7d2a25));
    }
    const bGeo = bb.geometry();
    const bMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    bMat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, { uLit: U.uLit, uNight: U.uNight, uSel: U.uSel, uTime: U.uTime, uShop: U.uShop, uSkyAmb: U.uSkyAmb });
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
          attribute float aB; attribute vec4 aW;
          varying vec3 vWP; varying vec3 vWN; flat varying float vB; flat varying vec4 vW;`)
        .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
          vWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal); vB = aB; vW = aW;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform sampler2D uLit; uniform float uNight; uniform vec4 uSel; uniform float uTime; uniform float uShop; uniform vec3 uSkyAmb;
          varying vec3 vWP; varying vec3 vWN; flat varying float vB; flat varying vec4 vW;
          float hh(vec3 p){ p = fract(p*vec3(0.1031,0.1030,0.0973)); p += dot(p, p.yxz+33.33); return fract((p.x+p.y)*p.z); }
          vec3 winLight; float winMask;`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          winLight = vec3(0.0); winMask = 0.0;
          {
            vec3 N = normalize(vWN);
            float style = vW.y;
            if (abs(N.y) < 0.5 && style < 3.5) {
              float side = abs(N.x) > 0.5 ? (N.x > 0.0 ? 1.0 : 3.0) : (N.z > 0.0 ? 2.0 : 0.0);
              float u = abs(N.x) > 0.5 ? vWP.z : vWP.x;
              float fh = vW.x, cw = vW.z;
              float fy = vWP.y / fh;
              float fl = floor(fy);
              float cu = u / cw;
              float colI = floor(cu);
              vec2 f = vec2(fract(cu), fract(fy));
              vec4 box = style < 0.5 ? vec4(0.2,0.8,0.3,0.84) : style < 1.5 ? vec4(0.06,0.94,0.26,0.93) : style < 2.5 ? vec4(0.3,0.7,0.24,0.86) : vec4(0.12,0.88,0.45,0.85);
              if (style > 4.5) box = vec4(0.26,0.74,0.28,0.86);
              float shopFl = (vW.w > 0.5 && fl < 0.5) ? 1.0 : 0.0;
              if (shopFl > 0.5) box = vec4(0.06,0.94,0.12,0.8);
              vec2 fw = fwidth(vec2(cu, fy)) * 1.2;
              float mx = smoothstep(box.x - fw.x, box.x + fw.x, f.x) * (1.0 - smoothstep(box.y - fw.x, box.y + fw.x, f.x));
              float my = smoothstep(box.z - fw.y, box.z + fw.y, f.y) * (1.0 - smoothstep(box.w - fw.y, box.w + fw.y, f.y));
              float m = mx * my;
              // далеко — усредняем, чтобы не рябило
              float far = smoothstep(0.35, 0.9, max(fw.x, fw.y));
              m = mix(m, (box.y - box.x) * (box.w - box.z), far);
              if (style > 2.5 && style < 3.5 && fl > 0.5) m *= step(fl, 1.5); // цеха: окна в один ряд
              winMask = m;
              float lf = texture2D(uLit, vec2((mod(vB, 512.0) + 0.5) / 512.0, (floor(vB / 512.0) + 0.5) / float(textureSize(uLit, 0).y))).r;
              float hsh = hh(vec3(vB, fl, colI + side * 57.0));
              float h2 = hh(vec3(colI, fl * 1.7, vB + side));
              float on = step(hsh, lf);
              if (shopFl > 0.5) on = step(h2, uShop);
              // цвет света: тёплый, холодный, «телевизор»
              vec3 lc = h2 < 0.12 ? vec3(0.35,0.55,1.0) * (0.7 + 0.3 * sin(uTime * 7.0 + hsh * 40.0)) : h2 < 0.3 ? vec3(1.0,0.86,0.62) : h2 < 0.75 ? vec3(1.0,0.62,0.26) : vec3(0.95,0.48,0.18);
              if (style > 0.5 && style < 1.5) lc = h2 < 0.5 ? vec3(0.95,0.92,0.82) * 0.8 : vec3(1.0,0.8,0.55) * 0.75;
              if (shopFl > 0.5) lc = vec3(1.0,0.7,0.36) * 1.25;
              // выбранное окно
              float sel = (abs(vB - uSel.x) < 0.5 && abs(fl - uSel.y) < 0.5 && abs(colI - uSel.z) < 0.5 && abs(side - uSel.w) < 0.5) ? 1.0 : 0.0;
              float lit = on * mix(1.0, 0.8 + 0.5 * hsh, far);
              float grad = mix(1.0, mix(0.72, 1.18, smoothstep(box.z, box.w, f.y)), 1.0 - far);
              winLight = lc * lit * m * grad * (0.12 + 0.95 * uNight) * (1.0 - far * 0.35);
              winLight += vec3(1.0, 0.75, 0.3) * sel * m * (2.5 + 1.5 * sin(uTime * 5.0));
              // стекло днём темнее стены и отражает небо
              vec3 glass = mix(vec3(0.12,0.14,0.17), uSkyAmb * 0.75, 0.55);
              if (style > 0.5 && style < 1.5) glass = mix(vec3(0.16,0.2,0.26), uSkyAmb * 0.9 + vec3(0.03,0.04,0.06), 0.6) * (0.85 + 0.3 * h2);
              diffuseColor.rgb = mix(diffuseColor.rgb, glass, m * 0.85);
            }
          }`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance += winLight;`);
    };
    const buildings = new THREE.Mesh(bGeo, bMat);
    buildings.castShadow = true; buildings.receiveShadow = true;
    scene.add(buildings);
    R.buildings = buildings;

    // ================================================================
    // Деревья: осень
    // ================================================================
    const treeCount = city.treeCount;
    const crownGeo = new THREE.IcosahedronGeometry(1, 0);
    crownGeo.scale(2.4, 2.9, 2.4); crownGeo.translate(0, 5.2, 0);
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.26, 3.2, 5); trunkGeo.translate(0, 1.6, 0);
    const spruceGeo = new THREE.ConeGeometry(2.2, 8.5, 7); spruceGeo.translate(0, 5.4, 0);
    const mergeT = (g1, g2, c1, c2) => {
      const b = new Builder();
      const add = (g, cc) => {
        const gg = g.index ? g.toNonIndexed() : g;
        const P = gg.attributes.position.array, Nn = gg.attributes.normal.array;
        const base = b.p.length / 3;
        for (let k = 0; k < P.length; k += 3) { b.p.push(P[k], P[k + 1], P[k + 2]); b.n.push(Nn[k], Nn[k + 1], Nn[k + 2]); b.c.push(cc.r, cc.g, cc.b); }
        for (let k = 0; k < P.length / 3; k++) b.i.push(base + k);
      };
      add(g1, c1); add(g2, c2);
      const g = b.geometry(); g.computeVertexNormals();
      return g;
    };
    const decid = mergeT(crownGeo, trunkGeo, col(0xffffff), col(0x4a3a2c));
    const spruce = mergeT(spruceGeo, trunkGeo, col(0xffffff), col(0x3b2e24));
    let nD = 0, nS = 0;
    for (let k = 0; k < treeCount; k++) if (city.trees[k * 4 + 3] === 2) nS++; else nD++;
    const treeMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const dMesh = new THREE.InstancedMesh(decid, treeMat, nD);
    const sMesh = new THREE.InstancedMesh(spruce, treeMat, nS);
    const AUT = [0x5d7a36, 0x6b8a3c, 0x4f6b2f, 0x8a9a3a, 0xc9a13a, 0xd98b2b, 0xb8552a, 0xa3772f, 0x7f8f35, 0xe0b44a];
    const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3(), yAx = new THREE.Vector3(0, 1, 0);
    const tc = new THREE.Color();
    let iD = 0, iS = 0;
    for (let k = 0; k < treeCount; k++) {
      const x = city.trees[k * 4], z = city.trees[k * 4 + 1], s = city.trees[k * 4 + 2], sp = city.trees[k * 4 + 3];
      q4.setFromAxisAngle(yAx, LC.hash2(k, 3) * 6.28);
      const y = (x > x0c && x < x1c && z > z0c && z < city.riverZ0) ? 0.17 : -0.05;
      p3.set(x, y, z); s3.set(s, s * (0.9 + LC.hash2(k, 4) * 0.25), s);
      m4.compose(p3, q4, s3);
      if (sp === 2) {
        sMesh.setMatrixAt(iS, m4); tc.setHex(0x2f4a33).multiplyScalar(0.85 + LC.hash2(k, 5) * 0.3); sMesh.setColorAt(iS, tc); iS++;
      } else {
        dMesh.setMatrixAt(iD, m4);
        const h = LC.hash2(k, 6);
        tc.setHex(sp === 1 ? (h < 0.6 ? 0xd6b545 : 0x9aa043) : AUT[Math.floor(h * AUT.length)]);
        tc.multiplyScalar(0.85 + LC.hash2(k, 7) * 0.3);
        dMesh.setColorAt(iD, tc); iD++;
      }
    }
    for (const m of [dMesh, sMesh]) { m.castShadow = true; m.receiveShadow = true; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; scene.add(m); }

    // ================================================================
    // Фонари: столбы, световые пятна, светящиеся плафоны
    // ================================================================
    const nL = city.lampCount;
    const lampPts = [];
    for (let k = 0; k < nL; k++) {
      const x = city.lamps[k * 5], z = city.lamps[k * 5 + 1], nx = city.lamps[k * 5 + 2], nz = city.lamps[k * 5 + 3], t = city.lamps[k * 5 + 4];
      // плафон нависает над дорогой
      lampPts.push(x + nx * 1.4, t === 1 ? 3.6 : 7.2, z + nz * 1.4, t);
    }
    // столбы
    const poleB = new Builder();
    const POLE = col(0x33363b);
    for (let k = 0; k < nL; k++) {
      const x = city.lamps[k * 5], z = city.lamps[k * 5 + 1], nx = city.lamps[k * 5 + 2], nz = city.lamps[k * 5 + 3], t = city.lamps[k * 5 + 4];
      const h = t === 1 ? 3.6 : 7.4;
      poleB.box(x - 0.09, 0.15, z - 0.09, x + 0.09, h, z + 0.09, POLE);
      const hx = lampPts[k * 4], hz = lampPts[k * 4 + 2];
      poleB.box(Math.min(x, hx) - 0.07, h - 0.1, Math.min(z, hz) - 0.07, Math.max(x, hx) + 0.07, h + 0.05, Math.max(z, hz) + 0.07, POLE);
    }
    // светофоры: столб у стоп-линии справа от каждого въезда на регулируемый перекрёсток
    R.signals = [];
    const Rd = city.road;
    for (const q of Rd.roads) {
      const nb = Rd.nodes[q.b];
      if (!nb.signal) continue;
      const hw = q.ave ? city.MEDIAN / 2 + 2 * city.LANE : city.LANE + city.PARKW;
      const x = q.x0 + q.dx * (q.len + 0.6) + q.rx * (hw + 0.9), z = q.z0 + q.dz * (q.len + 0.6) + q.rz * (hw + 0.9);
      poleB.box(x - 0.08, 0.15, z - 0.08, x + 0.08, 4.1, z + 0.08, POLE);
      poleB.box(x - 0.22, 3.3, z - 0.22, x + 0.22, 4.5, z + 0.22, col(0x1c1e22));
      R.signals.push({ x: x - q.dx * 0.3, z: z - q.dz * 0.3, node: q.b, dir: q.dir });
    }
    const poles = new THREE.Mesh(poleB.geometry(), new THREE.MeshLambertMaterial({ vertexColors: true }));
    scene.add(poles);
    // световые пятна на земле (аддитивные)
    const poolGeo = new THREE.PlaneGeometry(1, 1); poolGeo.rotateX(-Math.PI / 2);
    const poolMat = new THREE.ShaderMaterial({
      uniforms: { uLamps: U.uLamps, uFogCol: U.uFogCol, uFogDen: U.uFogDen },
      vertexShader: `
        attribute vec4 iP; varying vec2 vUv; varying float vFog;
        void main(){ vUv = uv * 2.0 - 1.0; vec3 p = vec3(position.x * iP.w + iP.x, iP.y, position.z * iP.w + iP.z);
          vec4 mv = modelViewMatrix * vec4(p, 1.0); vFog = -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `
        varying vec2 vUv; varying float vFog; uniform float uLamps; uniform float uFogDen;
        void main(){ float r = length(vUv); float a = pow(max(0.0, 1.0 - r), 2.2);
          float f = exp(-uFogDen * uFogDen * vFog * vFog * 0.6);
          gl_FragColor = vec4(vec3(1.0, 0.62, 0.28) * a * uLamps * 0.55 * f, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const poolIG = new THREE.InstancedBufferGeometry().copy(poolGeo);
    const poolData = new Float32Array(nL * 4);
    for (let k = 0; k < nL; k++) { poolData[k * 4] = lampPts[k * 4]; poolData[k * 4 + 1] = 0.25; poolData[k * 4 + 2] = lampPts[k * 4 + 2]; poolData[k * 4 + 3] = lampPts[k * 4 + 3] === 1 ? 13 : 24; }
    poolIG.setAttribute('iP', new THREE.InstancedBufferAttribute(poolData, 4));
    poolIG.instanceCount = nL;
    const pools = new THREE.Mesh(poolIG, poolMat); pools.frustumCulled = false; pools.renderOrder = 2;
    scene.add(pools);

    // светящиеся точки: плафоны фонарей, огни на трубах, знаки метро
    function glowPoints(data, sizeM, color, uniformOn, extra) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(data, 3));
      const m = new THREE.ShaderMaterial({
        uniforms: { uOn: uniformOn, uPx: U.uPx, uCol: { value: new THREE.Color(color) }, uSize: { value: sizeM }, uTime: U.uTime, uBlink: { value: extra && extra.blink ? 1 : 0 }, uFogDen: U.uFogDen },
        vertexShader: `
          uniform float uPx; uniform float uSize; varying float vFog; varying float vK;
          void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vFog = -mv.z;
            gl_PointSize = clamp(uSize * uPx / max(1.0, -mv.z), 2.0, 64.0); vK = position.x * 0.13 + position.z * 0.07;
            gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `
          uniform float uOn; uniform vec3 uCol; uniform float uTime; uniform float uBlink; uniform float uFogDen; varying float vFog; varying float vK;
          void main(){ vec2 d = gl_PointCoord * 2.0 - 1.0; float r = dot(d,d); if (r > 1.0) discard;
            float a = exp(-r * 5.0) + 0.6 * exp(-r * 40.0);
            float bl = uBlink > 0.5 ? step(0.5, fract(uTime * 0.7 + vK)) : 1.0;
            float f = exp(-uFogDen * uFogDen * vFog * vFog * 0.5);
            gl_FragColor = vec4(uCol * a * uOn * bl * f, 1.0); }`,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = 3;
      scene.add(pts);
      return pts;
    }
    const lampHeads = [];
    for (let k = 0; k < nL; k++) lampHeads.push(lampPts[k * 4], lampPts[k * 4 + 1] - 0.2, lampPts[k * 4 + 2]);
    glowPoints(lampHeads, 3.2, 0xffb45e, U.uLamps);
    const redLights = [];
    for (const ch of city.chimneys) redLights.push(ch.x, ch.h + 1.5, ch.z);
    for (const b of city.buildings) if (b.h > 70) redLights.push(b.cx, b.h + 3, b.cz);
    if (redLights.length) glowPoints(redLights, 6, 0xff3b2e, U.uNightGlow = { value: 0 }, { blink: true });

    // знаки «М» у метро
    const mCanvas = document.createElement('canvas'); mCanvas.width = 128; mCanvas.height = 128;
    const mc = mCanvas.getContext('2d');
    mc.fillStyle = '#d8322a'; mc.beginPath(); mc.arc(64, 64, 60, 0, Math.PI * 2); mc.fill();
    mc.fillStyle = '#fff'; mc.font = 'bold 86px Arial, sans-serif'; mc.textAlign = 'center'; mc.textBaseline = 'middle'; mc.fillText('М', 64, 70);
    const mTex = new THREE.CanvasTexture(mCanvas); mTex.colorSpace = THREE.SRGBColorSpace;
    const signMat = new THREE.SpriteMaterial({ map: mTex, sizeAttenuation: true, depthWrite: false });
    R.signMat = signMat;
    for (const st of city.stations) {
      const sp = new THREE.Sprite(signMat);
      sp.position.set(st.px + 4.4, 6.2, st.pz - 2.6); sp.scale.set(3.4, 3.4, 1);
      scene.add(sp);
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.16, 5, 0.16), new THREE.MeshLambertMaterial({ color: 0x3a3d42 }));
      pole.position.set(st.px + 4.4, 2.5, st.pz - 2.6); scene.add(pole);
    }

    LC.createSky(THREE, R);
    const skyMat = R.skyMat, waterMat = R.waterMat;

    // освещённость окон: доля жильцов, которые дома и не спят; офисы — доля сотрудников на месте
    R.updateWindows = function () {
      const L = LC.life, B = city.buildings;
      const min = LC.clock.min;
      const late = min > 23 * 60 || min < 6 * 60;
      for (let b = 0; b < B.length; b++) {
        const bd = B[b];
        let f = 0;
        if (bd.residents.length) {
          const aw = L.bAwake[b], home = L.bHome[b];
          f = (aw * 0.5 + (home - aw) * 0.03) / Math.max(1, bd.residents.length);
          f += 0.03;
        }
        let staff = 0, jobs = 0;
        for (const v of bd.venues) { const V = city.venues[v]; jobs += V.jobs; staff += L.vIn[v].size; }
        if (jobs) f = Math.max(f, Math.min(1, staff / jobs) * (bd.kind === 'office' ? 0.8 : 0.55) + (late ? 0.02 : 0.05));
        if (bd.kind === 'factory' || bd.kind === 'warehouse') f = Math.max(f, 0.25);
        litData[b * 4] = Math.min(255, Math.round(Math.min(1, f) * 255));
      }
      litTex.needsUpdate = true;
    };

    // размер окна
    R.resize = function () {
      const w = window.innerWidth, h = window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
      U.uPx.value = (h * renderer.getPixelRatio()) / (2 * Math.tan((camera.fov * Math.PI) / 360));
    };
    R.resize();
    return R;
  };
})(window.LC);
