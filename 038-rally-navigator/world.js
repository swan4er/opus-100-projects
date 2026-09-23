/* ================================================================
   Штурман · мир
   Небо на закате, лес (ели, сосны, берёзы) инстансами по кускам трассы,
   рельеф вдоль коридора дороги, гравийная лента, ворота, зрители у трамплинов,
   раллийная машина из примитивов и пыль из-под колёс.
   Использует глобальный THREE (его выставляет модуль в index.html).
   ================================================================ */
(function (R) {
  'use strict';
  const { clamp, lerp, smooth, rng, makeNoise } = R.util;

  // Палитра сцены
  const PAL = {
    skyTop: 0x6f93b8, skyHorizon: 0xf2c99a, sun: 0xffd9a8,
    fog: 0xb09a7c,
    gravel: '#b59a74', gravelDark: '#7d6749', gravelLight: '#d3bd97',
    moss: [0x5a6e34, 0x6b7a3a, 0x4b5c2d, 0x7d7440, 0x8c7a48],
    spruce: 0x2c5a3a, pine: 0x3d6636, birchLeaf: 0x9ab552,
    body: 0xe8532f, bodyDark: 0x1b2233, white: 0xf3eee3, glass: 0x2b3a4a,
  };

  // --- объединение простых геометрий с цветом вершин ---
  function tint(geo, color) {
    const THREE = window.THREE;
    const g = geo.index ? geo.toNonIndexed() : geo;
    const n = g.attributes.position.count, col = new Float32Array(n * 3);
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }
  function merge(list) {
    const THREE = window.THREE;
    let n = 0; for (const g of list) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
    let o = 0;
    for (const g of list) {
      g.computeVertexNormals && !g.attributes.normal && g.computeVertexNormals();
      pos.set(g.attributes.position.array, o * 3);
      nor.set(g.attributes.normal.array, o * 3);
      col.set(g.attributes.color.array, o * 3);
      o += g.attributes.position.count;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.computeBoundingSphere();
    return out;
  }
  // лёгкое «дрожание» вершин кроны, чтобы конусы не выглядели идеальными
  function jitter(geo, amt, seed) {
    const r = rng(seed), p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      p.setX(i, p.getX(i) + (r() - 0.5) * amt);
      p.setZ(i, p.getZ(i) + (r() - 0.5) * amt);
      p.setY(i, p.getY(i) + (r() - 0.5) * amt * 0.5);
    }
    geo.computeVertexNormals();
    return geo;
  }

  // ---------- процедурные текстуры ----------
  function canvasTex(w, h, draw, repeat) {
    const THREE = window.THREE;
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const g = cv.getContext('2d'); draw(g, w, h);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
    return t;
  }
  function gravelTexture() {
    return canvasTex(256, 1024, (g, w, h) => {
      const r = rng(5);
      g.fillStyle = PAL.gravel; g.fillRect(0, 0, w, h);
      // обочины темнее, к краю — земля с травой
      const edge = g.createLinearGradient(0, 0, w, 0);
      edge.addColorStop(0, 'rgba(70,62,35,0.95)'); edge.addColorStop(0.09, 'rgba(96,80,52,0.8)');
      edge.addColorStop(0.16, 'rgba(0,0,0,0)'); edge.addColorStop(0.84, 'rgba(0,0,0,0)');
      edge.addColorStop(0.91, 'rgba(96,80,52,0.8)'); edge.addColorStop(1, 'rgba(70,62,35,0.95)');
      // накатанные колеи
      for (const cx of [0.33, 0.67]) {
        const gr = g.createLinearGradient(w * (cx - 0.1), 0, w * (cx + 0.1), 0);
        gr.addColorStop(0, 'rgba(90,72,48,0)'); gr.addColorStop(0.5, 'rgba(90,72,48,0.42)'); gr.addColorStop(1, 'rgba(90,72,48,0)');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
      }
      // светлый вал рыхлого гравия по центру и у краёв
      for (const cx of [0.5, 0.18, 0.82]) {
        const gr = g.createLinearGradient(w * (cx - 0.06), 0, w * (cx + 0.06), 0);
        gr.addColorStop(0, 'rgba(225,205,165,0)'); gr.addColorStop(0.5, 'rgba(225,205,165,0.35)'); gr.addColorStop(1, 'rgba(225,205,165,0)');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
      }
      // камешки
      for (let i = 0; i < 9000; i++) {
        const x = r() * w, y = r() * h, s = 0.6 + r() * 1.8;
        const l = r();
        g.fillStyle = l < 0.45 ? `rgba(70,58,42,${0.35 + r() * 0.4})` : l < 0.8 ? `rgba(230,214,180,${0.3 + r() * 0.4})` : `rgba(140,120,95,0.6)`;
        g.fillRect(x, y, s, s * (0.6 + r() * 0.8));
      }
      g.fillStyle = edge; g.fillRect(0, 0, w, h);
      // пучки травы на кромке
      for (let i = 0; i < 700; i++) {
        const side = r() < 0.5 ? r() * w * 0.08 : w - r() * w * 0.08;
        const y = r() * h;
        g.strokeStyle = `rgba(${90 + r() * 40},${105 + r() * 40},${45 + r() * 20},0.8)`;
        g.lineWidth = 1; g.beginPath(); g.moveTo(side, y); g.lineTo(side + (r() - 0.5) * 6, y - 3 - r() * 6); g.stroke();
      }
    }, true);
  }
  function groundDetailTexture() {
    return canvasTex(256, 256, (g, w, h) => {
      const r = rng(11);
      g.fillStyle = '#b8b8b8'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 5000; i++) {
        const v = 120 + r() * 135 | 0;
        g.fillStyle = `rgba(${v},${v},${v},0.55)`;
        const s = 1 + r() * 3; g.fillRect(r() * w, r() * h, s, s);
      }
      for (let i = 0; i < 300; i++) {  // хвоя и веточки
        const v = 70 + r() * 60 | 0; g.strokeStyle = `rgba(${v},${v},${v},0.5)`;
        const x = r() * w, y = r() * h, a = r() * 6.28, l = 3 + r() * 7;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
      }
    }, true);
  }
  function bannerTexture(text, bg, fg, sub) {
    return canvasTex(1024, 256, (g, w, h) => {
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      g.fillStyle = fg; g.fillRect(0, 18, w, 10); g.fillRect(0, h - 28, w, 10);
      g.font = '700 128px Oswald, "Arial Narrow", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, w / 2, h / 2 + (sub ? -14 : 6));
      if (sub) { g.font = '500 40px Oswald, sans-serif'; g.fillText(sub, w / 2, h / 2 + 76); }
    });
  }

  // ================================================================
  function buildWorld(T, renderer, quality) {
    const THREE = window.THREE;
    const scene = new THREE.Scene();
    const toV = (x, y, h) => new THREE.Vector3(x, h, -y);
    const hq = quality !== 'low';

    // ---------- небо ----------
    const sunDir = new THREE.Vector3(-0.62, 0.2, -0.76).normalize();
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color(PAL.skyTop) }, hor: { value: new THREE.Color(PAL.skyHorizon) },
        sunC: { value: new THREE.Color(PAL.sun) }, sunDir: { value: sunDir },
      },
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.); gl_Position = p.xyww; }',
      fragmentShader: `uniform vec3 top, hor, sunC, sunDir; varying vec3 vD;
        void main(){
          float e = clamp(vD.y, -0.2, 1.0);
          vec3 c = mix(hor, top, pow(smoothstep(-0.02, 0.62, e), 0.8));
          c = mix(c, hor * vec3(0.75, 0.62, 0.52), smoothstep(0.02, -0.18, e));
          float s = max(dot(normalize(vD), sunDir), 0.0);
          c += sunC * (pow(s, 900.0) * 3.0 + pow(s, 24.0) * 0.45 + pow(s, 4.0) * 0.16);
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(1800, 32, 16), skyMat);
    sky.frustumCulled = false; sky.renderOrder = -1;
    scene.add(sky);
    scene.fog = new THREE.Fog(PAL.fog, 70, 460);

    // ---------- свет ----------
    const hemi = new THREE.HemisphereLight(0xd8e4f0, 0x5a5238, 1.4);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffd2a0, 3.1);
    sun.position.copy(sunDir).multiplyScalar(80);
    sun.castShadow = true;
    sun.shadow.mapSize.set(hq ? 2048 : 1024, hq ? 2048 : 1024);
    const sc = sun.shadow.camera; sc.left = -38; sc.right = 38; sc.top = 38; sc.bottom = -38; sc.near = 1; sc.far = 220;
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
    scene.add(sun); scene.add(sun.target);

    // ---------- рельеф вдоль коридора ----------
    const detailTex = groundDetailTexture();
    detailTex.repeat.set(1, 1);
    {
      const G = 4, B = T.bounds, pad = 150;
      const x0 = Math.floor((B.minX - pad) / G), x1 = Math.ceil((B.maxX + pad) / G);
      const y0 = Math.floor((B.minY - pad) / G), y1 = Math.ceil((B.maxY + pad) / G);
      const W = x1 - x0 + 1, Hh = y1 - y0 + 1;
      // какие квадраты нужны: в пределах ~150 м от оси
      const need = new Uint8Array(W * Hh);
      const rad = Math.ceil(150 / G);
      for (let i = 0; i < T.N; i += 10) {
        const cx = Math.round(T.X[i] / G) - x0, cy = Math.round(T.Y[i] / G) - y0;
        for (let oy = -rad; oy <= rad; oy += 1) {
          const yy = cy + oy; if (yy < 0 || yy >= Hh) continue;
          const span = Math.floor(Math.sqrt(rad * rad - oy * oy));
          need.fill(1, Math.max(0, yy * W + cx - span), Math.min(W * Hh, yy * W + cx + span + 1));
        }
      }
      const map = new Int32Array(W * Hh).fill(-1);
      const pos = [], col = [], uv = [];
      const noise = makeNoise(31);
      const cMoss = PAL.moss.map((c) => new THREE.Color(c));
      const cDirt = new THREE.Color(0x6e5a3c), cDry = new THREE.Color(0x8a7a4a), cDark = new THREE.Color(0x2c3620);
      const tmp = new THREE.Color();
      const vert = (gx, gy) => {
        const k = gy * W + gx;
        if (map[k] >= 0) return map[k];
        const px = (gx + x0) * G, py = (gy + y0) * G;
        const pr = T.nearest(px, py);
        const h = T.groundAt(px, py, pr, true);
        const d = pr ? pr.dist : 999;
        // цвет: земля у дороги → сухая трава → мох и хвоя в лесу
        const n1 = noise.fbm(px / 30, py / 30, 3) * 0.5 + 0.5, n2 = noise.n2(px / 7, py / 7) * 0.5 + 0.5;
        const mi = Math.floor(n1 * 4.99);
        tmp.copy(cMoss[mi]).lerp(cMoss[(mi + 1) % 5], n2);
        if (d < 60) tmp.lerp(cDark, smooth(30, 8, d) * 0.0 + (n2 > 0.72 ? 0.25 : 0));
        tmp.lerp(cDry, smooth(T.HALF_W + 9, T.HALF_W + 2.5, d) * 0.6);
        tmp.lerp(cDirt, smooth(T.HALF_W + 3.4, T.HALF_W + 0.8, d));
        if (d > 70) tmp.lerp(cDark, smooth(70, 150, d) * 0.55);
        pos.push(px, h, -py); col.push(tmp.r, tmp.g, tmp.b); uv.push(px / 7, py / 7);
        return (map[k] = pos.length / 3 - 1);
      };
      const idx = [];
      for (let gy = 0; gy < Hh - 1; gy++) for (let gx = 0; gx < W - 1; gx++) {
        if (!need[gy * W + gx]) continue;
        const a = vert(gx, gy), b = vert(gx + 1, gy), c = vert(gx, gy + 1), d = vert(gx + 1, gy + 1);
        idx.push(a, c, b, b, c, d);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: detailTex });
      const terrain = new THREE.Mesh(geo, mat);
      terrain.receiveShadow = true;
      scene.add(terrain);
      // подложка далеко за коридором
      const under = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.MeshBasicMaterial({ color: 0x2a3322 }));
      under.rotation.x = -Math.PI / 2; under.position.set((B.minX + B.maxX) / 2, -14, -(B.minY + B.maxY) / 2);
      scene.add(under);
    }

    // ---------- гравийная лента ----------
    const gravel = gravelTexture();
    gravel.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    {
      const offs = [-(T.HALF_W + T.SHOULDER), -T.HALF_W, -T.HALF_W * 0.5, 0, T.HALF_W * 0.5, T.HALF_W, T.HALF_W + T.SHOULDER];
      const us = [0, 0.14, 0.32, 0.5, 0.68, 0.86, 1];
      const lift = [-0.16, 0.035, 0.05, 0.06, 0.05, 0.035, -0.16];
      const pos = [], uv = [], idx = [];
      const step = 2, rows = Math.floor((T.N - 1) / step) + 1;
      for (let r = 0; r < rows; r++) {
        const i = Math.min(T.N - 1, r * step);
        const [lx, ly] = T.leftOf(i);
        for (let k = 0; k < offs.length; k++) {
          const o = -offs[k];   // «лево» — положительное смещение; u идёт слева направо
          pos.push(T.X[i] + lx * o, T.H[i] + lift[k], -(T.Y[i] + ly * o));
          uv.push(us[k], i / 11);
        }
      }
      const C = offs.length;
      for (let r = 0; r < rows - 1; r++) for (let k = 0; k < C - 1; k++) {
        const a = r * C + k, b = a + 1, c = a + C, d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx); geo.computeVertexNormals();
      const road = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: gravel }));
      road.receiveShadow = true;
      scene.add(road);
    }

    // ---------- лес ----------
    const treeMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const spruceGeo = (() => {
      const parts = [tint(new THREE.CylinderGeometry(0.16, 0.3, 3.2, 6).translate(0, 1.6, 0), 0x4a3526)];
      const tiers = [[2.3, 4.6, 1.6], [1.85, 4.0, 3.9], [1.4, 3.4, 6.0], [0.95, 2.9, 7.9], [0.55, 2.2, 9.6]];
      tiers.forEach(([r, h, y], i) => {
        const c = new THREE.Color(PAL.spruce).offsetHSL(0, 0, 0.02 * i - 0.01);
        parts.push(tint(jitter(new THREE.ConeGeometry(r, h, 9, 1, true).translate(0, y + h / 2, 0), 0.25, 3 + i), c));
      });
      return merge(parts);
    })();
    const pineGeo = (() => {
      const parts = [tint(new THREE.CylinderGeometry(0.14, 0.26, 10.5, 6).translate(0, 5.25, 0), 0x9a5a36)];
      const blobs = [[0, 10.6, 0, 2.3], [0.9, 9.6, 0.5, 1.7], [-0.8, 9.9, -0.6, 1.8], [0.2, 11.8, -0.3, 1.5]];
      blobs.forEach(([x, y, z, r], i) => parts.push(tint(jitter(new THREE.IcosahedronGeometry(r, 0).scale(1, 0.62, 1).translate(x, y, z), 0.35, 9 + i), new THREE.Color(PAL.pine).offsetHSL(0, 0, 0.015 * i))));
      return merge(parts);
    })();
    const birchGeo = (() => {
      const trunk = new THREE.CylinderGeometry(0.1, 0.16, 7.5, 6, 6).translate(0, 3.75, 0).toNonIndexed();
      const n = trunk.attributes.position.count, col = new Float32Array(n * 3), r = rng(4);
      const stripe = [];
      for (let k = 0; k < 7; k++) stripe.push(r() < 0.45);
      for (let i = 0; i < n; i++) {
        const y = trunk.attributes.position.getY(i), band = Math.floor(y / 1.25);
        const dark = stripe[band % 7] && r() < 0.8;
        const v = dark ? 0.16 : 0.86;
        col[i * 3] = v; col[i * 3 + 1] = v * 0.98; col[i * 3 + 2] = v * 0.92;
      }
      trunk.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const parts = [trunk];
      const blobs = [[0, 6.6, 0, 1.7], [0.7, 5.6, 0.4, 1.3], [-0.6, 5.9, -0.5, 1.35], [0.1, 7.6, 0.2, 1.15]];
      blobs.forEach(([x, y, z, rr], i) => parts.push(tint(jitter(new THREE.IcosahedronGeometry(rr, 0).scale(1, 1.15, 1).translate(x, y, z), 0.3, 21 + i), new THREE.Color(PAL.birchLeaf).offsetHSL(0.01 * i, 0, -0.02 * i))));
      return merge(parts);
    })();
    const farGeo = merge([tint(new THREE.CylinderGeometry(0.2, 0.3, 3, 5).translate(0, 1.5, 0), 0x3a2b20), tint(new THREE.ConeGeometry(2.4, 12, 7).translate(0, 8.5, 0), 0x1f3a28)]);

    // по кускам трассы, чтобы работало отсечение по пирамиде видимости
    const CH = 260;
    const chunks = [];
    const geoOf = { spruce: spruceGeo, pine: pineGeo, birch: birchGeo };
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const cvar = new THREE.Color();
    const r2 = rng(77);
    const buckets = new Map();
    for (const t of T.trees) {
      const ci = Math.max(0, Math.floor(t.s / CH));
      const kind = t.d > 62 ? 'far' : t.kind;
      const k = ci + ':' + kind;
      let arr = buckets.get(k); if (!arr) buckets.set(k, arr = []); arr.push(t);
    }
    for (const [k, arr] of buckets) {
      const [ci, kind] = k.split(':');
      const geo = kind === 'far' ? farGeo : geoOf[kind];
      const mesh = new THREE.InstancedMesh(geo, treeMat, arr.length);
      arr.forEach((t, i) => {
        const pr = T.nearest(t.x, t.y);
        const h = T.groundAt(t.x, t.y, pr, true) - 0.2;
        q.setFromAxisAngle(up, t.rot);
        const sc = t.sc * (kind === 'birch' ? 0.95 : 1);
        sv.set(sc, sc * (0.85 + r2() * 0.35), sc);
        pv.set(t.x, h, -t.y);
        m4.compose(pv, q, sv);
        mesh.setMatrixAt(i, m4);
        cvar.setHSL(0, 0, 0.85 + r2() * 0.3);
        if (kind !== 'birch') cvar.offsetHSL((r2() - 0.5) * 0.03, 0, 0);
        mesh.setColorAt(i, cvar);
      });
      mesh.computeBoundingSphere();
      mesh.castShadow = false; mesh.receiveShadow = false;
      const cs = Math.min(T.N - 1, (+ci + 0.5) * CH | 0);
      chunks.push({ mesh, cx: T.X[cs], cy: T.Y[cs], kind });
      scene.add(mesh);
    }

    // ---------- кусты, папоротники, пни, валуны ----------
    {
      const bushGeo = merge([tint(jitter(new THREE.IcosahedronGeometry(0.9, 0).scale(1, 0.7, 1).translate(0, 0.45, 0), 0.3, 41), 0x3f5a2a), tint(jitter(new THREE.IcosahedronGeometry(0.6, 0).translate(0.6, 0.35, 0.2), 0.2, 42), 0x56702f)]);
      const fernGeo = merge([0, 1, 2, 3, 4].map((i) => tint(new THREE.ConeGeometry(0.18, 1.3, 3).rotateZ(1.05).rotateY(i * 1.26).translate(Math.cos(i * 1.26) * 0.45, 0.3, -Math.sin(i * 1.26) * 0.45), i % 2 ? 0x6f8a36 : 0x5b7a2e)));
      const stumpGeo = merge([tint(new THREE.CylinderGeometry(0.28, 0.36, 0.55, 7).translate(0, 0.27, 0), 0x5a4330), tint(new THREE.CylinderGeometry(0.27, 0.27, 0.02, 7).translate(0, 0.55, 0), 0xb79a6c)]);
      const boulderGeo = tint(jitter(new THREE.DodecahedronGeometry(0.7, 0).scale(1.2, 0.75, 1).translate(0, 0.25, 0), 0.25, 44), 0x8a8578);
      const kinds = { bush: bushGeo, fern: fernGeo, stump: stumpGeo, boulder: boulderGeo };
      const byKind = { bush: [], fern: [], stump: [], boulder: [] };
      for (const p of T.props) byKind[p.kind].push(p);
      // камни у апексов «не резать»
      for (const o of T.obstacles) if (o.kind === 'rock' && o.r > 0.7) byKind.boulder.push({ x: o.x, y: o.y, sc: o.r / 0.62, rot: o.x });
      for (const kind in byKind) {
        const arr = byKind[kind]; if (!arr.length) continue;
        const mesh = new THREE.InstancedMesh(kinds[kind], treeMat, arr.length);
        arr.forEach((p, i) => {
          const pr = T.nearest(p.x, p.y);
          const h = T.groundAt(p.x, p.y, pr, true);
          q.setFromAxisAngle(up, p.rot); sv.setScalar(p.sc); pv.set(p.x, h - 0.05, -p.y);
          mesh.setMatrixAt(i, m4.compose(pv, q, sv));
        });
        mesh.computeBoundingSphere();
        if (kind === 'boulder') mesh.castShadow = true;
        scene.add(mesh);
      }
    }

    // ---------- пучки сухой травы вдоль кромки ----------
    {
      const blade = (a, lean, h, col) => tint(new THREE.ConeGeometry(0.05, h, 3).translate(0, h / 2, 0).rotateZ(lean).rotateY(a), col);
      const tuftGeo = merge([blade(0, 0.25, 0.7, 0xa39a52), blade(2.1, 0.3, 0.55, 0x8d9a48), blade(4.2, 0.2, 0.62, 0xb8a860), blade(1.0, -0.15, 0.5, 0x7f8f42), blade(3.2, -0.3, 0.45, 0xa8a055)]);
      const r = rng(303), list = [];
      for (let i = 10; i < T.N - 10; i += 2.2) {
        const ii = Math.floor(i), [lx, ly] = T.leftOf(ii);
        for (const side of [-1, 1]) {
          if (r() > 0.62) continue;
          const off = side * (T.HALF_W + 0.5 + r() * r() * 5);
          const px = T.X[ii] + lx * off, py = T.Y[ii] + ly * off;
          const pr = T.nearest(px, py);
          if (!pr || pr.dist < T.HALF_W + 0.35) continue;
          list.push({ x: px, y: py, h: T.groundAt(px, py, pr, true), sc: 0.6 + r() * 0.9, rot: r() * 6.28 });
        }
      }
      const mesh = new THREE.InstancedMesh(tuftGeo, treeMat, list.length);
      list.forEach((p, i) => { q.setFromAxisAngle(up, p.rot); sv.set(p.sc, p.sc * (0.8 + r() * 0.5), p.sc); pv.set(p.x, p.h - 0.03, -p.y); mesh.setMatrixAt(i, m4.compose(pv, q, sv)); });
      mesh.computeBoundingSphere();
      scene.add(mesh);
    }

    // ---------- ворота: старт, КП, финиш ----------
    const gates = [];
    function gate(s, text, bg, fg, sub) {
      const i = Math.round(s), [lx, ly] = T.leftOf(i), w = T.HALF_W + 1.6;
      const g = new THREE.Group();
      const postMat = new THREE.MeshLambertMaterial({ color: 0x2b2b2e });
      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 5.2, 0.35), postMat);
        post.position.set(T.X[i] + lx * w * side, T.H[i] + 2.6, -(T.Y[i] + ly * w * side));
        post.castShadow = true; g.add(post);
      }
      const tex = bannerTexture(text, bg, fg, sub);
      for (const back of [0, 1]) {
        const banner = new THREE.Mesh(new THREE.PlaneGeometry(w * 2 + 0.4, 1.3), new THREE.MeshLambertMaterial({ map: tex }));
        banner.position.set(T.X[i], T.H[i] + 4.7, -T.Y[i]);
        banner.rotation.y = T.PH[i] - Math.PI / 2 + back * Math.PI;
        banner.castShadow = !back;
        g.add(banner);
      }
      scene.add(g); gates.push(g);
      return g;
    }
    gate(T.startS + 2, 'СТАРТ', '#1b2233', '#f3eee3', 'СУ «ТЁМНЫЙ БОР» · 4,1 КМ');
    T.cps.forEach((s, k) => gate(s, 'КП ' + (k + 1), '#f3eee3', '#1b2233'));
    gate(T.finishS, 'ФИНИШ', '#d9442a', '#f3eee3');

    // ---------- зрители и лента у трамплинов и шпильки ----------
    {
      const spots = T.notes.filter((n) => n.kind === 'jump' || (n.kind === 'corner' && n.sev <= 1));
      const bodyGeo = new THREE.CapsuleGeometry(0.26, 0.8, 3, 8);
      const headGeo = new THREE.SphereGeometry(0.17, 8, 6);
      const jackets = [0xd9442a, 0x2f5d8a, 0xe8b33a, 0x3b6b3a, 0xf3eee3, 0x6a3d7a, 0x1b2233];
      const r = rng(99);
      const people = [], tapePts = [];
      for (const n of spots) {
        const side = n.kind === 'corner' ? n.dir : (r() < 0.5 ? 1 : -1);
        for (let k = 0; k < 9; k++) {
          const i = clamp(Math.round(n.apex - 10 + k * 2.6 + r() * 2), 0, T.N - 1);
          const [lx, ly] = T.leftOf(i);
          const off = side * (T.HALF_W + 7.5 + r() * 3.5);
          people.push({ x: T.X[i] + lx * off, y: T.Y[i] + ly * off, c: jackets[(r() * jackets.length) | 0], h: 0.9 + r() * 0.2, face: T.PH[i] - side * Math.PI / 2 });
        }
        for (let k = 0; k <= 8; k++) {
          const i = clamp(Math.round(n.apex - 14 + k * 3.5), 0, T.N - 1);
          const [lx, ly] = T.leftOf(i);
          const off = side * (T.HALF_W + 5.2);
          tapePts.push([T.X[i] + lx * off, T.Y[i] + ly * off, k === 0]);
        }
      }
      const bodyMesh = new THREE.InstancedMesh(bodyGeo, new THREE.MeshLambertMaterial(), people.length);
      const headMesh = new THREE.InstancedMesh(headGeo, new THREE.MeshLambertMaterial({ color: 0xe0b394 }), people.length);
      people.forEach((p, i) => {
        const pr = T.nearest(p.x, p.y), h = T.groundAt(p.x, p.y, pr, true);
        pv.set(p.x, h + 0.7 * p.h, -p.y); sv.set(1, p.h, 1); q.setFromAxisAngle(up, p.face);
        bodyMesh.setMatrixAt(i, m4.compose(pv, q, sv)); bodyMesh.setColorAt(i, new THREE.Color(p.c));
        pv.y += 0.72 * p.h; sv.setScalar(1);
        headMesh.setMatrixAt(i, m4.compose(pv, q, sv));
      });
      bodyMesh.castShadow = true;
      scene.add(bodyMesh, headMesh);
      // бело-красная лента на столбиках
      const tapeMat = new THREE.MeshBasicMaterial({ color: 0xe8e2d6, side: THREE.DoubleSide, fog: true });
      const tapeRed = new THREE.MeshBasicMaterial({ color: 0xc8392a, side: THREE.DoubleSide });
      const postGeo = new THREE.CylinderGeometry(0.03, 0.03, 1.1, 4);
      for (let k = 1; k < tapePts.length; k++) {
        if (tapePts[k][2]) continue;
        const [ax, ay] = tapePts[k - 1], [bx, by] = tapePts[k];
        const ha = T.groundAt(ax, ay, T.nearest(ax, ay), true) + 0.95, hb = T.groundAt(bx, by, T.nearest(bx, by), true) + 0.95;
        const len = Math.hypot(bx - ax, by - ay);
        const tape = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.07), k % 2 ? tapeMat : tapeRed);
        tape.position.set((ax + bx) / 2, (ha + hb) / 2, -(ay + by) / 2);
        tape.rotation.y = Math.atan2(by - ay, bx - ax);
        tape.rotation.z = Math.atan2(hb - ha, len);
        scene.add(tape);
        const post = new THREE.Mesh(postGeo, tapeMat); post.position.set(bx, hb - 0.5, -by); scene.add(post);
      }
    }

    // ---------- машина ----------
    const car = buildCar(THREE);
    scene.add(car.root);

    // ---------- пыль ----------
    const dust = makeDust(THREE, scene);

    return { scene, sun, sunDir, chunks, car, dust, sky, hemi };
  }

  // ================================================================
  //  Раллийный хэтчбек из примитивов. Вперёд — ось +x.
  // ================================================================
  function buildCar(THREE) {
    const root = new THREE.Group();          // позиция и курс
    const body = new THREE.Group();          // крен/тангаж/подвеска
    root.add(body);
    const paint = new THREE.MeshStandardMaterial({ color: PAL.body, roughness: 0.38, metalness: 0.25 });
    const dark = new THREE.MeshStandardMaterial({ color: PAL.bodyDark, roughness: 0.5, metalness: 0.3 });
    const white = new THREE.MeshStandardMaterial({ color: PAL.white, roughness: 0.42, metalness: 0.1 });
    const glass = new THREE.MeshStandardMaterial({ color: PAL.glass, roughness: 0.12, metalness: 0.2, emissive: 0x3a4658, emissiveIntensity: 0.35 });
    const black = new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.8 });
    const lamp = new THREE.MeshStandardMaterial({ color: 0xfff3d6, emissive: 0xffe2a8, emissiveIntensity: 1.2, roughness: 0.2 });
    const tail = new THREE.MeshStandardMaterial({ color: 0x8a1410, emissive: 0x7a0e08, emissiveIntensity: 0.9 });
    const W = 1.76;
    // боковой профиль нижней части кузова
    const prof = new THREE.Shape();
    prof.moveTo(-2.02, 0.34); prof.lineTo(2.0, 0.34); prof.lineTo(2.08, 0.62); prof.quadraticCurveTo(2.04, 0.84, 1.7, 0.9);
    prof.lineTo(0.72, 1.0); prof.lineTo(-1.95, 1.02); prof.quadraticCurveTo(-2.08, 0.98, -2.06, 0.7); prof.lineTo(-2.02, 0.34);
    const lower = new THREE.ExtrudeGeometry(prof, { depth: W - 0.12, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2, curveSegments: 6 });
    lower.translate(0, 0, -(W - 0.12) / 2);
    const lowerM = new THREE.Mesh(lower, paint); lowerM.castShadow = true; body.add(lowerM);
    // стеклянная «теплица»
    const gh = new THREE.Shape();
    gh.moveTo(0.78, 0.98); gh.lineTo(-0.02, 1.43); gh.lineTo(-1.42, 1.44); gh.lineTo(-1.9, 1.02); gh.lineTo(0.78, 0.98);
    const green = new THREE.ExtrudeGeometry(gh, { depth: W - 0.42, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 1 });
    green.translate(0, 0, -(W - 0.42) / 2);
    const greenM = new THREE.Mesh(green, glass); greenM.castShadow = true; body.add(greenM);
    // крыша и стойки цветом кузова
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.06, W - 0.36), paint); roof.position.set(-0.71, 1.47, 0); body.add(roof);
    for (const z of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.06), paint);
      pillar.position.set(-1.62, 1.22, z * (W / 2 - 0.2)); pillar.rotation.z = -0.75; body.add(pillar);
    }
    // ливрея: белые полосы по капоту и крыше, тёмный низ
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.02, 0.34), white); stripe.position.set(1.3, 0.97, 0); stripe.rotation.z = -0.1; body.add(stripe);
    const stripe2 = stripe.clone(); stripe2.scale.set(1.12, 1, 1); stripe2.position.set(-0.7, 1.51, 0); stripe2.rotation.z = 0; body.add(stripe2);
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(4.1, 0.2, W + 0.06), dark); skirt.position.set(0, 0.42, 0); body.add(skirt);
    // номер на дверях
    const numTex = (() => {
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
      const g = cv.getContext('2d'); g.fillStyle = '#f3eee3'; g.fillRect(0, 0, 256, 128);
      g.fillStyle = '#1b2233'; g.font = '700 96px Oswald, "Arial Narrow", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('038', 128, 70);
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    for (const z of [-1, 1]) {
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.36), new THREE.MeshStandardMaterial({ map: numTex, roughness: 0.5 }));
      plate.position.set(-0.25, 0.72, z * (W / 2 + 0.005)); if (z < 0) plate.rotation.y = Math.PI; body.add(plate);
    }
    // люстра из четырёх фар на капоте
    const pod = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 1.3), black); pod.position.set(2.06, 0.74, 0); body.add(pod);
    for (let k = 0; k < 4; k++) {
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.08, 12), lamp);
      l.rotation.z = Math.PI / 2; l.position.set(2.15, 0.76, -0.48 + k * 0.32); body.add(l);
    }
    for (const z of [-1, 1]) {
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.17, 0.4), tail); tl.position.set(-2.1, 0.84, z * 0.6); body.add(tl);
    }
    // задний бампер, выхлоп, номер сзади; передний бампер с решёткой
    const rb = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.2, W - 0.02), dark); rb.position.set(-2.08, 0.46, 0); body.add(rb);
    const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.2, 10), new THREE.MeshStandardMaterial({ color: 0x9a948a, metalness: 0.8, roughness: 0.3 }));
    ex.rotation.z = Math.PI / 2; ex.position.set(-2.16, 0.4, 0.55); body.add(ex);
    const rp = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.14), new THREE.MeshStandardMaterial({ color: 0xf3eee3, roughness: 0.6 }));
    rp.position.set(-2.125, 0.66, 0); rp.rotation.y = -Math.PI / 2; body.add(rp);
    const fb = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.22, W - 0.02), dark); fb.position.set(2.1, 0.46, 0); body.add(fb);
    const gr = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.9), black); gr.position.set(2.1, 0.64, 0); body.add(gr);
    // антикрыло, воздухозаборник, брызговики
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, W - 0.1), dark); wing.position.set(-1.9, 1.52, 0); wing.rotation.z = 0.12; body.add(wing);
    for (const z of [-1, 1]) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.05), dark); st.position.set(-1.86, 1.4, z * 0.55); body.add(st); }
    const scoop = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.36), dark); scoop.position.set(-0.3, 1.52, 0); body.add(scoop);
    for (const x of [1.25, -1.25]) for (const z of [-1, 1]) {
      const flap = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.3, 0.3), black); flap.position.set(x - 0.46, 0.28, z * 0.8); body.add(flap);
    }
    // расширители арок
    const flareG = new THREE.CylinderGeometry(0.5, 0.5, 0.2, 16, 1, true, -Math.PI / 2, Math.PI);
    flareG.rotateX(Math.PI / 2);
    for (const [x, z] of [[1.25, 0.86], [1.25, -0.86], [-1.3, 0.86], [-1.3, -0.86]]) {
      const fl = new THREE.Mesh(flareG, dark); fl.position.set(x, 0.38, z); body.add(fl);
    }
    // колёса
    const tireG = new THREE.CylinderGeometry(0.35, 0.35, 0.27, 18); tireG.rotateX(Math.PI / 2);
    const rimG = new THREE.CylinderGeometry(0.22, 0.22, 0.28, 10); rimG.rotateX(Math.PI / 2);
    const rimM = new THREE.MeshStandardMaterial({ color: 0xe9e4d8, roughness: 0.35, metalness: 0.6 });
    const wheels = [];
    for (const [x, z, front] of [[1.25, 0.8, 1], [1.25, -0.8, 1], [-1.3, 0.8, 0], [-1.3, -0.8, 0]]) {
      const steerG = new THREE.Group(); steerG.position.set(x, 0.35, z);
      const spin = new THREE.Group(); steerG.add(spin);
      const tire = new THREE.Mesh(tireG, black); tire.castShadow = true; spin.add(tire);
      const rim = new THREE.Mesh(rimG, rimM); spin.add(rim);
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.29), rimM); spin.add(spoke);
      root.add(steerG);
      wheels.push({ steerG, spin, front, x, z });
    }
    body.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return { root, body, wheels, paint };
  }

  // ================================================================
  //  Пыль: точки с мягким спрайтом, живут на CPU
  // ================================================================
  function makeDust(THREE, scene) {
    const MAX = 2400;
    const pos = new Float32Array(MAX * 3), size = new Float32Array(MAX), alpha = new Float32Array(MAX), shade = new Float32Array(MAX);
    const vel = new Float32Array(MAX * 3), age = new Float32Array(MAX), life = new Float32Array(MAX), s0 = new Float32Array(MAX), s1 = new Float32Array(MAX), a0 = new Float32Array(MAX);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aShade', new THREE.BufferAttribute(shade, 1).setUsage(THREE.DynamicDrawUsage));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: {
        uScale: { value: 400 }, uLit: { value: new THREE.Color(0xf7dcae) }, uShadow: { value: new THREE.Color(0xa88c69) },
        uFog: { value: new THREE.Color(PAL.fog) }, uFogNear: { value: 70 }, uFogFar: { value: 460 },
      },
      vertexShader: `attribute float aSize; attribute float aAlpha; attribute float aShade; uniform float uScale;
        varying float vA; varying float vS; varying float vDepth;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = min(aSize * uScale / max(-mv.z, 0.5), 900.0); vA = aAlpha; vS = aShade; vDepth = -mv.z; }`,
      fragmentShader: `uniform vec3 uLit, uShadow, uFog; uniform float uFogNear, uFogFar; varying float vA; varying float vS; varying float vDepth;
        void main(){ vec2 p = gl_PointCoord * 2.0 - 1.0; float r = dot(p, p); if (r > 1.0) discard;
          float a = (1.0 - r); a = a * a * vA;
          vec3 c = mix(uShadow, uLit, clamp(vS - p.y * 0.25, 0.0, 1.0));
          float f = smoothstep(uFogNear, uFogFar, vDepth);
          gl_FragColor = vec4(mix(c, uFog, f), a); }`,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false; points.renderOrder = 5;
    scene.add(points);
    let head = 0, alive = 0;
    function emit(x, y, z, vx, vy, vz, sz0, sz1, lf, al) {
      const i = head; head = (head + 1) % MAX;
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
      age[i] = 0; life[i] = lf; s0[i] = sz0; s1[i] = sz1; a0[i] = al; shade[i] = 0.55 + Math.random() * 0.45;
      alive = Math.min(MAX, alive + 1);
    }
    function update(dt) {
      for (let i = 0; i < MAX; i++) {
        if (life[i] <= 0) { alpha[i] = 0; continue; }
        age[i] += dt;
        const t = age[i] / life[i];
        if (t >= 1) { life[i] = 0; alpha[i] = 0; continue; }
        const drag = Math.exp(-1.6 * dt);
        vel[i * 3] *= drag; vel[i * 3 + 1] = vel[i * 3 + 1] * drag + 0.35 * dt; vel[i * 3 + 2] *= drag;
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        size[i] = s0[i] + (s1[i] - s0[i]) * Math.sqrt(t);
        alpha[i] = a0[i] * Math.min(1, age[i] / 0.12) * (1 - t) * (1 - t);
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.aSize.needsUpdate = true;
      geo.attributes.aAlpha.needsUpdate = true; geo.attributes.aShade.needsUpdate = true;
    }
    function stats() {
      let n = 0, amax = 0, smax = 0, sample = null;
      for (let i = 0; i < MAX; i++) if (life[i] > 0) { n++; if (alpha[i] > amax) { amax = alpha[i]; sample = [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]].map((v) => +v.toFixed(1)); } smax = Math.max(smax, size[i]); }
      return { n, amax: +amax.toFixed(2), smax: +smax.toFixed(1), sample };
    }
    return { emit, update, mat, points, stats };
  }

  R.buildWorld = buildWorld;
  R.PAL = PAL;
})(window.R);
