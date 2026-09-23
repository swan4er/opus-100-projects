/* ================================================================
   Участковый · модель посёлка
   Всё собрано из примитивов three.js: плита-диорама, дороги, пруд,
   лес, шесть мест, жители. Ничего не грузится из файлов.
   Вызывается из scene.js: U.Town.build(THREE, scene) → ссылки для анимации.
   ================================================================ */
window.U = window.U || {};

U.Town = (function () {
  'use strict';

  // места на плите (x, z); камера смотрит из +x +z, поэтому фасады повёрнуты к ней
  const P = {
    square: { x: 0, z: 0, stand: [1.2, 3.2], label: [1.6, 3.4, -0.4] },
    dealership: { x: 15, z: -4, stand: [11.5, 1.2], label: [15.5, 7.5, -5] },
    pharmacy: { x: -12, z: -12, stand: [-9.2, -7.6], label: [-11.4, 7.4, -11.2] },
    sawmill: { x: 4, z: -16, stand: [3.2, -10.6], label: [4, 7, -17] },
    banya: { x: -15, z: 6, stand: [-10.6, 7.4], label: [-15, 7.5, 5] },
    shop: { x: 6, z: 13, stand: [2.6, 10.4], label: [6, 6.5, 12.5] },
  };
  // где стоят жители (по местам)
  const SPOTS = {
    koschei: { dealership: [14.2, 0.4] },
    gorynych: { dealership: [9.8, -2.6] },
    yaga: { pharmacy: [-10.9, -9.4], banya: [-12.2, 3.6] },
    vodyanoy: { banya: [-13.2, 10.6] },
    leshy: { sawmill: [6.2, -12.2], banya: [-9.4, 9.8] },
    kikimora: { shop: [4.6, 15.4] },
    emelya: { square: [4.6, -2.4], shop: [1.2, 13.8], banya: [-9.2, 3.2], dealership: [8.6, 3.2] },
  };

  let T, root;
  const shared = {};

  // Один материал на весь посёлок: цвет запечён в вершины. Тогда всё неподвижное сливается
  // в несколько мешей, а шейдерная программа одна — на программном рендере это десятки секунд.
  let VC = null;
  function vcMat() { if (!VC) VC = new T.MeshLambertMaterial({ vertexColors: true, flatShading: true }); return VC; }
  function special(base, extra) {
    const m = new T.MeshLambertMaterial(Object.assign({ vertexColors: true, flatShading: true }, extra || {}));
    m.userData.base = base;
    return m;
  }
  function paint(geo, hex) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    const c = new T.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new T.BufferAttribute(a, 3));
    return g;
  }
  function mesh(geo, c) {
    if (typeof c === 'string') return new T.Mesh(paint(geo, c), vcMat());
    if (c.vertexColors) return new T.Mesh(paint(geo, c.userData.base || '#ffffff'), c);
    return new T.Mesh(geo, c);
  }
  // Слить неподвижные части внутри одного узла анимации (голова, рука, туловище)
  function compact(node) {
    for (const ch of node.children.slice()) if (ch.children.length) compact(ch);
    const buckets = new Map();
    for (const ch of node.children) {
      if (!ch.isMesh || ch.children.length || ch.userData.keep || Array.isArray(ch.material) || !ch.material.vertexColors) continue;
      const k = ch.material.uuid + (ch.castShadow ? 'c' : 'n');
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(ch);
    }
    const U2 = window.THREE_UTILS;
    if (!U2 || !U2.mergeGeometries) return;
    for (const list of buckets.values()) {
      if (list.length < 2) continue;
      const geos = list.map((m) => { m.updateMatrix(); const g = m.geometry.clone(); g.applyMatrix4(m.matrix); return g; });
      const merged = U2.mergeGeometries(geos, false);
      if (!merged) continue;
      const out = new T.Mesh(merged, list[0].material);
      out.castShadow = list[0].castShadow; out.receiveShadow = true;
      list.forEach((m) => node.remove(m));
      node.add(out);
    }
  }
  function add(mesh, parent, x = 0, y = 0, z = 0, cast = true) {
    mesh.position.set(x, y, z);
    mesh.castShadow = cast; mesh.receiveShadow = true;
    (parent || root).add(mesh);
    return mesh;
  }
  const box = (w, h, d, c, p, x, y, z, cast) => add(mesh(new T.BoxGeometry(w, h, d), c), p, x, y, z, cast);
  const cyl = (rt, rb, h, c, seg, p, x, y, z, cast) => add(mesh(new T.CylinderGeometry(rt, rb, h, seg || 8), c), p, x, y, z, cast);
  const cone = (r, h, c, seg, p, x, y, z, cast) => add(mesh(new T.ConeGeometry(r, h, seg || 7), c), p, x, y, z, cast);
  const ball = (r, c, p, x, y, z, det = 1, cast) => add(mesh(new T.IcosahedronGeometry(r, det), c), p, x, y, z, cast);
  function grp(p, x = 0, y = 0, z = 0, ry = 0) { const g = new T.Group(); g.position.set(x, y, z); g.rotation.y = ry; (p || root).add(g); return g; }

  // двускатная крыша: треугольная призма вдоль оси x
  function roof(w, h, d, c, p, x, y, z) {
    const s = new T.Shape();
    s.moveTo(-d / 2, 0); s.lineTo(d / 2, 0); s.lineTo(0, h); s.lineTo(-d / 2, 0);
    const g = new T.ExtrudeGeometry(s, { depth: w, bevelEnabled: false });
    g.translate(0, 0, -w / 2); g.rotateY(Math.PI / 2);
    return add(mesh(g, c), p, x, y, z);
  }

  // вывеска: текст на холсте → текстура
  const signs = [];
  function signTex(lines, o) {
    const cv = document.createElement('canvas');
    cv.width = o.w || 512; cv.height = o.h || 128;
    const tex = new T.CanvasTexture(cv);
    tex.colorSpace = T.SRGBColorSpace;
    tex.anisotropy = 4;
    const draw = () => {
      const g = cv.getContext('2d');
      g.fillStyle = o.bg; g.fillRect(0, 0, cv.width, cv.height);
      if (o.border) { g.strokeStyle = o.border; g.lineWidth = 8; g.strokeRect(8, 8, cv.width - 16, cv.height - 16); }
      g.fillStyle = o.fg; g.textAlign = 'center'; g.textBaseline = 'middle';
      const n = lines.length;
      lines.forEach((ln, i) => {
        const size = (o.size || 64) * (i === 0 ? 1 : o.sub || 0.55);
        g.font = `${i === 0 ? o.weight || 700 : 500} ${size}px ${o.font || '"Golos Text", system-ui, sans-serif'}`;
        const y = cv.height / 2 + (i - (n - 1) / 2) * size * 1.1 + (n > 1 && i > 0 ? 6 : 0);
        g.fillText(ln, cv.width / 2, y, cv.width - 36);
      });
      tex.needsUpdate = true;
    };
    draw();
    signs.push(draw);
    return tex;
  }
  function sign(lines, w, h, o, p, x, y, z, ry = 0) {
    const tex = signTex(lines, o);
    const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ map: tex, transparent: true }));
    m.rotation.y = ry;
    return add(m, p, x, y, z, false);
  }

  // окна: общий материал, ночью светится
  function windowMat() {
    if (!shared.win) shared.win = special('#2E3A44', { emissive: '#FFB85C', emissiveIntensity: 0 });
    return shared.win;
  }
  function win(p, x, y, z, ry = 0, w = 0.8, h = 0.9, frame = '#EDE6D6') {
    const g = grp(p, x, y, z, ry);
    box(w + 0.22, h + 0.22, 0.08, frame, g, 0, 0, 0, false);
    box(w, h, 0.1, windowMat(), g, 0, 0, 0.02, false);
    box(0.08, h, 0.12, frame, g, 0, 0, 0.03, false);
    // резной наличник сверху
    const t = cone(w * 0.72, 0.34, frame, 3, g, 0, h / 2 + 0.26, 0.02, false); t.rotation.z = Math.PI; t.rotation.x = Math.PI; t.scale.z = 0.1;
    return g;
  }

  // ---------- плита-диорама ----------
  function plate() {
    const R = 24, r = 5;
    const s = new T.Shape();
    s.moveTo(-R + r, -R); s.lineTo(R - r, -R); s.quadraticCurveTo(R, -R, R, -R + r);
    s.lineTo(R, R - r); s.quadraticCurveTo(R, R, R - r, R); s.lineTo(-R + r, R);
    s.quadraticCurveTo(-R, R, -R, R - r); s.lineTo(-R, -R + r); s.quadraticCurveTo(-R, -R, -R + r, -R);
    const soil = new T.ExtrudeGeometry(s, { depth: 4, bevelEnabled: true, bevelThickness: 0.4, bevelSize: 0.4, bevelSegments: 1, curveSegments: 6 });
    soil.rotateX(Math.PI / 2);
    // крышка — трава, бока — почва: красим по группам и сводим к одному материалу
    {
      const n = soil.attributes.position.count, a = new Float32Array(n * 3);
      const top = new T.Color('#6E8A4B'), side = new T.Color('#5A4230');
      for (const gr of soil.groups) { const c = gr.materialIndex === 0 ? top : side; for (let i = gr.start; i < gr.start + gr.count; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } }
      soil.setAttribute('color', new T.BufferAttribute(a, 3));
      soil.clearGroups();
    }
    const m = new T.Mesh(soil, vcMat());
    m.position.y = 0; m.receiveShadow = true;
    root.add(m);
    // слои почвы на срезе
    const band = mesh(new T.ExtrudeGeometry(s, { depth: 1.1, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.52, bevelSegments: 1, curveSegments: 6 }), '#3F2E22');
    band.geometry.rotateX(Math.PI / 2); band.position.y = -3.1; root.add(band);
    const grass = mesh(new T.ShapeGeometry(s, 6), '#7C9451');
    grass.geometry.rotateX(-Math.PI / 2); grass.position.y = 0.02; grass.receiveShadow = true; root.add(grass);
    shared.ground = grass;
  }

  // плоская лента дороги по точкам
  function road(pts, w, c, y = 0.05) {
    const shape = [];
    const L = [], Rr = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let dx = b[0] - a[0], dz = b[1] - a[1];
      const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      L.push([pts[i][0] - dz * w / 2, pts[i][1] + dx * w / 2]);
      Rr.push([pts[i][0] + dz * w / 2, pts[i][1] - dx * w / 2]);
    }
    const pos = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = L[i], b = Rr[i], c2 = L[i + 1], d = Rr[i + 1];
      pos.push(a[0], y, a[1], b[0], y, b[1], c2[0], y, c2[1], b[0], y, b[1], d[0], y, d[1], c2[0], y, c2[1]);
    }
    // треугольники смотрят вверх: если нормаль вниз — разворачиваем обход
    for (let i = 0; i < pos.length; i += 9) {
      const ux = pos[i + 3] - pos[i], uz = pos[i + 5] - pos[i + 2], vx = pos[i + 6] - pos[i], vz = pos[i + 8] - pos[i + 2];
      if (uz * vx - ux * vz < 0) for (let k = 0; k < 3; k++) { const t = pos[i + 3 + k]; pos[i + 3 + k] = pos[i + 6 + k]; pos[i + 6 + k] = t; }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    const m = mesh(g, c);
    m.receiveShadow = true;
    root.add(m);
    shape.push(...pts);
    return m;
  }
  function curve(a, b, bend = 0.18, n = 8) {
    const mx = (a[0] + b[0]) / 2 - (b[1] - a[1]) * bend, mz = (a[1] + b[1]) / 2 + (b[0] - a[0]) * bend;
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      out.push([u * u * a[0] + 2 * u * t * mx + t * t * b[0], u * u * a[1] + 2 * u * t * mz + t * t * b[1]]);
    }
    return out;
  }

  // ---------- деревья ----------
  function pine(x, z, s = 1, p) {
    const g = grp(p, x, 0, z);
    cyl(0.14 * s, 0.2 * s, 1 * s, '#5B3F2B', 5, g, 0, 0.5 * s, 0);
    const greens = ['#2F4F3A', '#355A40', '#2A4735'];
    for (let i = 0; i < 3; i++) cone((1.25 - i * 0.3) * s, 1.5 * s, greens[i % 3], 7, g, 0, (1.3 + i * 0.85) * s, 0);
    return g;
  }
  function birch(x, z, s = 1, p, autumn = 0) {
    const g = grp(p, x, 0, z);
    cyl(0.1 * s, 0.14 * s, 2.6 * s, '#E9E4D8', 5, g, 0, 1.3 * s, 0);
    for (let i = 0; i < 3; i++) box(0.2 * s, 0.05 * s, 0.05 * s, '#2B2A28', g, 0.02, (0.6 + i * 0.7) * s, 0.11 * s, false);
    const cols = autumn ? ['#D9A13B', '#C9812E', '#E3B64F'] : ['#8FA84E', '#7D9A45', '#A2B557'];
    ball(0.8 * s, cols[0], g, 0.1 * s, 2.9 * s, 0, 0);
    ball(0.6 * s, cols[1], g, -0.45 * s, 2.5 * s, 0.2 * s, 0);
    ball(0.55 * s, cols[2], g, 0.4 * s, 2.4 * s, -0.25 * s, 0);
    return g;
  }
  function appleTree(x, z, p) {
    const g = grp(p, x, 0, z);
    cyl(0.14, 0.2, 1.2, '#5B3F2B', 5, g, 0, 0.6, 0);
    ball(0.95, '#6E8A3E', g, 0, 1.8, 0, 0);
    for (let i = 0; i < 5; i++) ball(0.1, '#C0392B', g, Math.cos(i * 1.3) * 0.8, 1.5 + (i % 3) * 0.3, Math.sin(i * 1.3) * 0.8, 0, false);
    return g;
  }

  // ---------- постройки ----------
  function izba(x, z, ry, o = {}) {
    const g = grp(null, x, 0, z, ry);
    const W = o.w || 4, D = o.d || 3.4, H = o.h || 2.4;
    box(W, 0.4, D, '#6B5C4C', g, 0, 0.2, 0);
    box(W, H, D, o.wall || '#8B5E3C', g, 0, 0.4 + H / 2, 0);
    // бревенчатые полосы
    for (let i = 0; i < 5; i++) box(W + 0.06, 0.06, D + 0.06, '#6E4A30', g, 0, 0.6 + i * (H / 5), 0, false);
    roof(W + 0.7, 1.7, D + 0.8, o.roof || '#9C4A32', g, 0, 0.4 + H, 0);
    win(g, -W / 4, 1.7, D / 2 + 0.05, 0);
    win(g, W / 4, 1.7, D / 2 + 0.05, 0);
    win(g, W / 2 + 0.05, 1.7, 0, Math.PI / 2);
    cyl(0.22, 0.22, 1.3, '#7A6A5E', 6, g, W / 4, 0.4 + H + 1.1, -D / 5);
    return g;
  }
  function fence(x1, z1, x2, z2, c = '#B5A27E') {
    const n = Math.max(2, Math.round(Math.hypot(x2 - x1, z2 - z1) / 0.45));
    const g = grp();
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      box(0.12, 0.8, 0.06, c, g, x1 + (x2 - x1) * t, 0.4, z1 + (z2 - z1) * t, false).rotation.y = -Math.atan2(z2 - z1, x2 - x1);
    }
    const len = Math.hypot(x2 - x1, z2 - z1);
    const rail = box(len, 0.08, 0.05, c, g, (x1 + x2) / 2, 0.55, (z1 + z2) / 2, false);
    rail.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
    return g;
  }
  function garden(x, z, w, d) {
    box(w, 0.1, d, '#5E4632', null, x, 0.05, z, false);
    for (let i = 0; i < Math.floor(w / 0.7); i++) {
      box(0.3, 0.16, d - 0.4, '#4A3726', null, x - w / 2 + 0.4 + i * 0.7, 0.12, z, false);
      for (let j = 0; j < Math.floor(d / 0.8); j++) ball(0.16, '#7FA048', null, x - w / 2 + 0.4 + i * 0.7, 0.26, z - d / 2 + 0.5 + j * 0.8, 0, false);
    }
  }
  function car(x, z, ry, color) {
    const g = grp(null, x, 0, z, ry);
    box(2.6, 0.55, 1.2, color, g, 0, 0.5, 0);
    box(1.4, 0.5, 1.1, color, g, -0.1, 1.0, 0);
    box(1.3, 0.38, 1.12, '#324350', g, -0.1, 1.02, 0, false);
    for (const [wx, wz] of [[-0.8, 0.6], [0.8, 0.6], [-0.8, -0.6], [0.8, -0.6]]) {
      const w = cyl(0.26, 0.26, 0.2, '#1E1E1E', 10, g, wx, 0.27, wz); w.rotation.x = Math.PI / 2;
    }
    box(0.06, 0.18, 0.9, '#F2E6B8', g, 1.31, 0.62, 0, false);
    return g;
  }
  function lampPost(x, z) {
    const g = grp(null, x, 0, z);
    cyl(0.07, 0.1, 3.4, '#3B3A38', 6, g, 0, 1.7, 0);
    box(0.7, 0.07, 0.07, '#3B3A38', g, 0.3, 3.35, 0, false);
    if (!shared.bulb) shared.bulb = special('#FFE3A8', { emissive: '#FFD27A', emissiveIntensity: 0 });
    const bulb = box(0.3, 0.12, 0.2, shared.bulb, g, 0.6, 3.27, 0, false);
    shared.lamps.push({ x: x + 0.6, y: 3.2, z, bulb });
    return g;
  }
  function pole(x, z) {
    const g = grp(null, x, 0, z);
    cyl(0.1, 0.13, 5, '#5D4636', 6, g, 0, 2.5, 0);
    box(1.4, 0.1, 0.1, '#5D4636', g, 0, 4.7, 0, false);
    return { x, z, top: 4.8 };
  }
  function wire(a, b) {
    const pts = [];
    for (const off of [-0.6, 0.6]) {
      const seg = [];
      for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        seg.push(new T.Vector3(a.x + (b.x - a.x) * t + off, a.top - Math.sin(Math.PI * t) * 0.6, a.z + (b.z - a.z) * t));
      }
      pts.push(seg);
    }
    pts.forEach((seg) => {
      const w = mesh(new T.TubeGeometry(new T.CatmullRomCurve3(seg), 12, 0.03, 3, false), '#2A2724');
      root.add(w);
    });
  }

  // ---------- персонажи ----------
  function blob(p, r = 0.6) {
    if (!shared.blobMat) {
      const cv = document.createElement('canvas'); cv.width = cv.height = 64;
      const g = cv.getContext('2d');
      const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
      gr.addColorStop(0, 'rgba(20,16,12,.55)'); gr.addColorStop(1, 'rgba(20,16,12,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      shared.blobMat = new T.MeshBasicMaterial({ map: new T.CanvasTexture(cv), transparent: true, depthWrite: false });
    }
    const m = new T.Mesh(new T.PlaneGeometry(r * 2, r * 2), shared.blobMat);
    m.rotation.x = -Math.PI / 2; m.position.y = 0.07; m.renderOrder = 1;
    p.add(m);
    return m;
  }
  function eyes(head, r, c = '#1A1714', spread = 0.35, y = 0.1) {
    ball(r * 0.13, c, head, -r * spread, r * y, r * 0.88, 0, false);
    ball(r * 0.13, c, head, r * spread, r * y, r * 0.88, 0, false);
  }
  function hitbox(g, w, h) {
    const m = new T.Mesh(new T.BoxGeometry(w, h, w), new T.MeshBasicMaterial({ visible: false }));
    m.position.y = h / 2; g.add(m); g.userData.hit = m;
    return m;
  }
  // базовая фигурка: ноги, туловище, голова, руки
  function figure(o) {
    const g = grp();
    const body = grp(g);
    const legH = o.legH ?? 0.55;
    if (legH > 0) {
      box(0.18, legH, 0.2, o.legs, body, -0.13, legH / 2, 0);
      box(0.18, legH, 0.2, o.legs, body, 0.13, legH / 2, 0);
    }
    const torso = o.torsoCone
      ? cone(o.torsoW, o.torsoH, o.torso, 8, body, 0, legH + o.torsoH / 2, 0)
      : box(o.torsoW, o.torsoH, o.torsoD || 0.36, o.torso, body, 0, legH + o.torsoH / 2, 0);
    const headG = grp(body, 0, legH + o.torsoH + o.headR * 0.85, 0);
    const head = ball(o.headR, o.skin, headG, 0, 0, 0, 1);
    eyes(head, o.headR);
    const armL = grp(body, -(o.torsoW / 2 + 0.07), legH + o.torsoH - 0.08, 0);
    const armR = grp(body, o.torsoW / 2 + 0.07, legH + o.torsoH - 0.08, 0);
    box(0.13, o.armL || 0.6, 0.14, o.arms || o.torso, armL, 0, -(o.armL || 0.6) / 2, 0);
    box(0.13, o.armL || 0.6, 0.14, o.arms || o.torso, armR, 0, -(o.armL || 0.6) / 2, 0);
    ball(0.08, o.skin, armL, 0, -(o.armL || 0.6) - 0.02, 0, 0, false);
    ball(0.08, o.skin, armR, 0, -(o.armL || 0.6) - 0.02, 0, 0, false);
    blob(g, 0.55);
    return { g, body, head: headG, headMesh: head, armL, armR, torso };
  }

  function makePolice() {
    const f = figure({ legs: '#1F2A44', torso: '#3A5A8C', torsoW: 0.5, torsoH: 0.62, skin: '#E8C39E', headR: 0.25 });
    cyl(0.27, 0.27, 0.12, '#24365A', 10, f.head, 0, 0.18, 0);
    cyl(0.28, 0.28, 0.05, '#B4372B', 10, f.head, 0, 0.13, 0, false);
    cyl(0.3, 0.33, 0.05, '#1B2640', 10, f.head, 0, 0.25, 0.02);
    box(0.36, 0.03, 0.16, '#141B2E', f.head, 0, 0.12, 0.28, false);
    box(0.1, 0.08, 0.02, '#D9A13B', f.body, 0.12, 1.02, 0.19, false);
    hitbox(f.g, 0.8, 1.8);
    return f;
  }
  function makeKoschei() {
    const f = figure({ legs: '#18161E', torso: '#1E1C24', torsoW: 0.42, torsoH: 0.95, skin: '#DCD6C4', headR: 0.24, legH: 0.8, armL: 0.8 });
    f.headMesh.scale.set(0.9, 1.15, 0.95);
    cyl(0.16, 0.2, 0.18, '#D9A13B', 6, f.head, 0, 0.3, 0);
    for (let i = 0; i < 6; i++) cone(0.04, 0.12, '#D9A13B', 4, f.head, Math.cos(i) * 0.16, 0.43, Math.sin(i) * 0.16, false);
    const chain = mesh(new T.TorusGeometry(0.17, 0.025, 4, 12), '#E0B24A');
    chain.rotation.x = Math.PI / 2 - 0.5; chain.position.set(0, 1.55, 0.1); f.body.add(chain);
    // плед на плечах
    const cape = cone(0.42, 0.9, '#8C2F2A', 8, f.body, 0, 1.22, -0.02); cape.scale.z = 0.7;
    box(0.44, 0.06, 0.02, '#D9A13B', f.body, 0, 1.25, 0.23, false);
    hitbox(f.g, 0.9, 2.4);
    return f;
  }
  function makeYaga() {
    const f = figure({ legs: '#3B2E26', torso: '#EDEAE0', torsoCone: true, torsoW: 0.42, torsoH: 0.9, skin: '#CFAE8A', headR: 0.24, legH: 0.25 });
    f.body.rotation.x = 0.18;
    // платок
    const scarf = ball(0.28, '#B23A2C', f.head, 0, 0.06, -0.04, 1); scarf.scale.set(1, 1.02, 1.05);
    f.headMesh.position.z = 0.06;
    cone(0.07, 0.24, '#C49B78', 5, f.head, 0, -0.02, 0.34).rotation.x = Math.PI / 2;
    for (let i = 0; i < 6; i++) ball(0.035, '#F2D16B', f.head, Math.cos(i * 1.05) * 0.2, 0.12 + Math.sin(i * 2) * 0.05, -0.1 + Math.sin(i * 1.05) * 0.2, 0, false);
    box(0.06, 0.25, 0.06, '#EFEBDD', f.body, 0.12, 0.12, 0.05, false);
    // клюка
    const stick = cyl(0.03, 0.03, 1.2, '#6B4A2E', 5, f.armR, 0.05, -0.3, 0.1); stick.rotation.x = 0.2;
    hitbox(f.g, 0.9, 1.6);
    return f;
  }
  function makeVodyanoy() {
    const g = grp();
    const body = grp(g);
    const belly = ball(0.75, '#4F7D6B', body, 0, 0.35, 0, 1); belly.scale.set(1, 0.9, 0.9);
    const headG = grp(body, 0, 1.15, 0.05);
    const head = ball(0.36, '#5C8E79', headG, 0, 0, 0, 1);
    eyes(head, 0.36, '#F2E7B0', 0.4, 0.2);
    ball(0.05, '#1A1714', head, -0.14, 0.08, 0.35, 0, false); ball(0.05, '#1A1714', head, 0.14, 0.08, 0.35, 0, false);
    const beard = cone(0.35, 0.7, '#2F5A3A', 7, headG, 0, -0.38, 0.12); beard.rotation.x = Math.PI + 0.2;
    cone(0.36, 0.5, '#CDBB93', 8, headG, 0, 0.42, -0.02);
    const armL = grp(body, -0.72, 0.7, 0), armR = grp(body, 0.72, 0.7, 0);
    box(0.2, 0.7, 0.2, '#5C8E79', armL, 0, -0.3, 0.1).rotation.z = 0.5;
    box(0.2, 0.7, 0.2, '#5C8E79', armR, 0, -0.3, 0.1).rotation.z = -0.5;
    hitbox(g, 1.6, 1.8);
    return { g, body, head: headG, headMesh: head, armL, armR };
  }
  function makeLeshy() {
    const f = figure({ legs: '#3E3325', torso: '#6B5236', torsoW: 0.62, torsoH: 0.85, skin: '#8C7350', headR: 0.3, legH: 0.75, armL: 0.95, arms: '#6B5236' });
    box(0.66, 0.6, 0.4, '#4A5B2E', f.body, 0, 1.22, 0.02, false);
    const beard = cone(0.3, 0.6, '#5E7A3A', 6, f.head, 0, -0.3, 0.12); beard.rotation.x = Math.PI + 0.25;
    cyl(0.33, 0.33, 0.14, '#3E4A2C', 8, f.head, 0, 0.24, 0);
    box(0.4, 0.04, 0.2, '#3E4A2C', f.head, 0, 0.2, 0.3, false);
    for (let i = 0; i < 5; i++) { const t = cyl(0.025, 0.04, 0.4, '#5B3F2B', 4, f.head, -0.25 + i * 0.12, 0.42, -0.05); t.rotation.z = (i - 2) * 0.35; }
    hitbox(f.g, 1, 2.6);
    return f;
  }
  function makeKikimora() {
    const f = figure({ legs: '#2E2A26', torso: '#7B5A7E', torsoW: 0.4, torsoH: 0.5, skin: '#A9B78A', headR: 0.24, legH: 0.38, armL: 0.45 });
    const bun = ball(0.16, '#56703F', f.head, 0, 0.26, -0.05, 1);
    ball(0.26, '#56703F', f.head, 0, 0.04, -0.06, 1).scale.set(1.02, 1, 1.02);
    f.headMesh.position.z = 0.03;
    const pencil = cyl(0.02, 0.02, 0.4, '#E3B64F', 5, bun, 0.05, 0.05, 0); pencil.rotation.z = 0.8;
    const gl = mesh(new T.TorusGeometry(0.075, 0.015, 4, 10), '#1C1A18');
    gl.position.set(-0.09, 0.03, 0.25); f.head.add(gl);
    const gr = gl.clone(); gr.position.x = 0.09; f.head.add(gr);
    hitbox(f.g, 0.8, 1.4);
    return f;
  }
  function makeGorynych() {
    const g = grp();
    const body = grp(g);
    const trunk = ball(1.05, '#4A8042', body, 0, 1.0, 0, 1); trunk.scale.set(1, 0.85, 1.25);
    ball(0.8, '#D8CD92', body, 0, 0.9, 0.55, 1).scale.set(0.85, 0.8, 0.5);
    // лапы, хвост, крылья
    for (const sx of [-0.55, 0.55]) box(0.34, 0.5, 0.4, '#3E6B39', body, sx, 0.25, 0.3);
    const tail = cone(0.35, 1.8, '#4A8042', 6, body, 0, 0.6, -1.5); tail.rotation.x = -1.2;
    for (const sx of [-1, 1]) {
      const w = mesh(new T.ConeGeometry(0.7, 1.4, 3), '#5E8A4F');
      w.scale.z = 0.15; w.position.set(sx * 0.9, 1.7, -0.3); w.rotation.z = sx * -0.9; w.castShadow = true; body.add(w);
    }
    const heads = [];
    const names = ['Го', 'Ры', 'Ныч'];
    [-1, 0, 1].forEach((k, i) => {
      const neck = grp(body, k * 0.42, 1.55, 0.35);
      neck.rotation.z = -k * 0.45; neck.rotation.x = 0.15;
      cyl(0.16, 0.22, 1.1, '#4A8042', 6, neck, 0, 0.5, 0);
      const hg = grp(neck, 0, 1.15, 0.05);
      const hd = ball(0.36, '#6CAE58', hg, 0, 0, 0, 1); hd.scale.set(0.95, 0.85, 1.1);
      box(0.34, 0.22, 0.4, '#82C26A', hg, 0, -0.06, 0.32);
      eyes(hd, 0.3, '#F2E7B0', 0.45, 0.35);
      // фуражка охранника
      cyl(0.24, 0.24, 0.1, '#23304F', 8, hg, 0, 0.26, -0.02);
      cyl(0.27, 0.27, 0.03, '#1B2640', 8, hg, 0, 0.31, -0.02);
      box(0.26, 0.025, 0.14, '#141B2E', hg, 0, 0.21, 0.2, false);
      if (i === 2) { hd.scale.y = 0.75; }
      heads.push({ neck, head: hg, name: names[i], base: neck.rotation.z });
    });
    body.scale.setScalar(1.38);
    hitbox(g, 3.4, 4.6);
    return { g, body, head: heads[1].head, heads };
  }
  function makeEmelya() {
    // печь на ходу, Емеля лежит сверху
    const g = grp();
    const body = grp(g);
    const stove = grp(body);
    box(1.7, 1.25, 2.3, '#EDE6D6', stove, 0, 0.72, 0);
    box(1.76, 0.12, 2.36, '#D9D0BD', stove, 0, 1.36, 0, false);
    box(0.7, 0.55, 0.06, '#2A2522', stove, 0, 0.7, 1.16, false);
    box(0.74, 0.08, 0.1, '#8C8378', stove, 0, 1.0, 1.16, false);
    const fire = box(0.5, 0.25, 0.04, special('#FF8A3C', { emissive: '#FF6A1A', emissiveIntensity: 0.9 }), stove, 0, 0.55, 1.17, false);
    cyl(0.2, 0.24, 0.9, '#D9D0BD', 6, stove, -0.5, 1.8, -0.75);
    box(1.9, 0.12, 2.5, '#6B4A30', stove, 0, 0.06, 0);
    // узор
    for (let i = 0; i < 4; i++) ball(0.07, '#3E6FB0', stove, -0.6 + i * 0.4, 1.12, 1.17, 0, false);
    // Емеля
    const man = grp(body, 0.1, 1.45, 0.1);
    const torso = box(0.44, 0.3, 0.75, '#B8412E', man, 0, 0.15, 0);
    box(0.4, 0.25, 0.7, '#3B4A6B', man, 0, 0.14, -0.7);
    const headG = grp(man, 0, 0.3, 0.55);
    const head = ball(0.24, '#E8C39E', headG, 0, 0, 0, 1);
    eyes(head, 0.24);
    const hat = cone(0.26, 0.34, '#6E4A30', 7, headG, 0, 0.18, -0.02); hat.rotation.x = -0.4;
    ball(0.25, '#D9A13B', headG, 0, 0.06, -0.08, 1).scale.set(1, 0.6, 1);
    const armR = grp(man, 0.3, 0.2, 0.2); box(0.12, 0.12, 0.5, '#B8412E', armR, 0, 0, 0.2);
    const armL = grp(man, -0.3, 0.2, 0.2); box(0.12, 0.12, 0.5, '#B8412E', armL, 0, 0, 0.2);
    // ведро со щукой
    const bucket = cyl(0.22, 0.18, 0.36, '#8E959B', 8, body, 0.62, 1.58, -0.6);
    const pike = cone(0.07, 0.4, '#6A8A5A', 5, bucket, 0, 0.3, 0); pike.rotation.z = 0.2;
    blob(g, 1.4);
    hitbox(g, 2.2, 2.4);
    return { g, body, head: headG, headMesh: head, armL, armR, fire, chimney: { x: -0.5, y: 2.3, z: -0.75 }, stove };
  }
  function makeCat() {
    const g = grp();
    const b = ball(0.22, '#1E1C1F', g, 0, 0.2, 0, 0); b.scale.set(1, 0.8, 1.4);
    const h = ball(0.16, '#1E1C1F', g, 0, 0.42, 0.22, 0);
    cone(0.06, 0.12, '#1E1C1F', 3, h, -0.08, 0.16, 0);
    cone(0.06, 0.12, '#1E1C1F', 3, h, 0.08, 0.16, 0);
    ball(0.03, '#E3C04A', h, -0.06, 0.03, 0.14, 0, false); ball(0.03, '#E3C04A', h, 0.06, 0.03, 0.14, 0, false);
    const tail = cyl(0.03, 0.04, 0.5, '#1E1C1F', 4, g, 0, 0.3, -0.35); tail.rotation.x = -0.9; tail.userData.keep = true;
    hitbox(g, 0.7, 0.8);
    return { g, head: h, tail };
  }

  // ---------- места ----------
  function buildSquare(o) {
    // площадка
    const pav = mesh(new T.CircleGeometry(5.2, 10), '#9C958A');
    pav.rotation.x = -Math.PI / 2; pav.position.set(0, 0.06, 0); pav.receiveShadow = true; root.add(pav);
    // опорный пункт
    const op = grp(null, -4.6, 0, -4.2, 0.12);
    box(5, 0.3, 3.6, '#6B6258', op, 0, 0.15, 0);
    box(4.8, 2.6, 3.4, '#B26A4E', op, 0, 1.6, 0);
    box(5, 0.35, 3.6, '#E7DCC6', op, 0, 3.05, 0);
    box(4.9, 0.5, 3.5, '#5F6B72', op, 0, 3.4, 0);
    box(1, 1.9, 0.12, '#2B3F66', op, 1.2, 1.25, 1.72, false);
    win(op, -0.9, 1.9, 1.72, 0, 1.1, 0.9);
    win(op, 2.42, 1.9, 0, Math.PI / 2, 1.1, 0.9);
    sign(['ПОЛИЦИЯ', 'опорный пункт'], 2.6, 0.62, { bg: '#1F3E73', fg: '#F1ECE0', w: 512, h: 124, size: 56, sub: 0.5 }, op, -0.2, 2.75, 1.78);
    o.signs.push(op);
    // бобик
    const bob = grp(null, -0.6, 0, -6.6, 0.1);
    box(2.4, 0.9, 1.3, '#E9E6DF', bob, 0, 0.75, 0);
    box(1.4, 0.7, 1.24, '#E9E6DF', bob, -0.4, 1.5, 0);
    box(1.3, 0.5, 1.26, '#33424F', bob, -0.4, 1.52, 0, false);
    box(2.42, 0.18, 1.32, '#2A4B82', bob, 0, 0.82, 0, false);
    box(0.3, 0.14, 0.5, '#2E5FB8', bob, -0.4, 1.92, 0, false);
    for (const [wx, wz] of [[-0.8, 0.66], [0.8, 0.66], [-0.8, -0.66], [0.8, -0.66]]) { const w = cyl(0.3, 0.3, 0.22, '#1E1E1E', 10, bob, wx, 0.3, wz); w.rotation.x = Math.PI / 2; }
    // памятник Колобку
    const mon = grp(null, 1.6, 0, -0.4);
    box(1.2, 1.1, 1.2, '#B9B2A5', mon, 0, 0.55, 0);
    box(1.4, 0.15, 1.4, '#A39C90', mon, 0, 1.15, 0);
    const kolob = ball(0.55, '#D9A13B', mon, 0, 1.75, 0, 1);
    eyes(kolob, 0.55, '#2A2320', 0.3, 0.2);
    const smile = mesh(new T.TorusGeometry(0.2, 0.03, 4, 10, Math.PI), '#2A2320');
    smile.rotation.z = Math.PI; smile.position.set(0, -0.08, 0.5); kolob.add(smile);
    o.kolobok = kolob;
    // скамейка и кот
    const bench = grp(null, -2.4, 0, 1.9, 0.3);
    box(1.8, 0.1, 0.5, '#8B5E3C', bench, 0, 0.5, 0);
    box(1.8, 0.4, 0.08, '#8B5E3C', bench, 0, 0.8, -0.22);
    box(0.1, 0.5, 0.4, '#3B3A38', bench, -0.8, 0.25, 0); box(0.1, 0.5, 0.4, '#3B3A38', bench, 0.8, 0.25, 0);
    // остановка
    const st = grp(null, 4.4, 0, 3.6, -0.2);
    box(2.8, 0.1, 1.2, '#A8A196', st, 0, 0.05, 0);
    box(0.12, 2.1, 1.1, '#C9C2B4', st, -1.35, 1.05, 0); box(0.12, 2.1, 1.1, '#C9C2B4', st, 1.35, 1.05, 0);
    box(2.8, 2.1, 0.12, '#D2A64E', st, 0, 1.05, -0.55);
    for (let i = 0; i < 5; i++) box(0.4, 0.4, 0.02, i % 2 ? '#3E6FB0' : '#B4372B', st, -1 + i * 0.5, 1.4, -0.48, false);
    const rf = box(3.2, 0.14, 1.6, '#8A8378', st, 0, 2.2, 0.1); rf.rotation.x = -0.1;
    box(2.2, 0.1, 0.4, '#8B5E3C', st, 0, 0.5, -0.25);
    // доска объявлений
    const nb = grp(null, -1.4, 0, 4.4, 0.2);
    cyl(0.06, 0.06, 1.6, '#5D4636', 5, nb, -0.6, 0.8, 0); cyl(0.06, 0.06, 1.6, '#5D4636', 5, nb, 0.6, 0.8, 0);
    box(1.5, 0.9, 0.08, '#8B6A48', nb, 0, 1.3, 0);
    for (let i = 0; i < 4; i++) box(0.36, 0.44, 0.02, '#EFE7D4', nb, -0.5 + i * 0.33, 1.3 + (i % 2) * 0.08, 0.05, false).rotation.z = (i - 1.5) * 0.08;
    lampPost(-2.8, -1.4); lampPost(3.2, 1.6);
    return { cat: [-2.3, 0.62, 1.95] };
  }

  function buildDealership(o) {
    const d = grp(null, 16, 0, -5.4);
    box(9.4, 0.3, 6.6, '#7C7A76', d, 0, 0.15, 0);
    // стеклянный фасад
    const glass = special('#6F93A3', { emissive: '#FFD9A0', emissiveIntensity: 0 });
    shared.glass = glass;
    box(9, 3.4, 6, '#D8D2C6', d, 0, 2, 0);
    box(8.2, 2.7, 0.1, glass, d, -0.1, 1.75, 3.02, false);
    box(0.1, 2.7, 5.2, glass, d, 4.52, 1.75, 0, false);
    for (let i = 0; i < 6; i++) box(0.1, 2.8, 0.14, '#2E2D2B', d, -4 + i * 1.6, 1.75, 3.06, false);
    box(9.2, 0.6, 6.2, '#3A3940', d, 0, 3.95, 0);
    sign(['БЕССМЕРТНЫЙ', 'автосалон · кредит на 300 лет'], 6.4, 1.1, { bg: '#1C1A1F', fg: '#E0B24A', w: 1024, h: 176, size: 96, sub: 0.36, weight: 400, font: '"Ruslan Display", "Golos Text", serif' }, d, 0, 3.95, 3.13);
    // световой люк
    box(1.4, 0.2, 1.4, '#9FB8C4', d, 2.2, 4.3, -1.2, false);
    // флажки — справа от салона, чтобы не заслонять охрану и участкового
    for (let i = 0; i < 3; i++) {
      const fx = 21.7 + i * 0.35, fz = -1.4 - i * 3;
      cyl(0.05, 0.05, 5.2, '#8E8A84', 5, null, fx, 2.6, fz);
      const flag = box(1.1, 0.7, 0.04, ['#B4372B', '#D9A13B', '#2A4B82'][i], null, fx + 0.55, 4.8, fz, false);
      o.flags.push(flag);
    }
    // машины на площадке
    car(14, 1.9, 0.3, '#9E2B2B');
    car(17.2, 1.4, 0.3, '#E6E1D6');
    car(20.2, 0.9, 0.3, '#1F2530');
    // будка охраны
    const b = grp(null, 9.8, 0, -4.6, 0.2);
    box(1.6, 2.2, 1.6, '#C9C2B4', b, 0, 1.1, 0);
    box(1.8, 0.14, 1.8, '#5F6B72', b, 0, 2.27, 0);
    box(1.2, 0.7, 0.08, windowMat(), b, 0, 1.4, 0.81, false);
    sign(['ОХРАНА'], 1.2, 0.3, { bg: '#EFE7D4', fg: '#1D1A16', w: 256, h: 64, size: 44 }, b, 0, 2.0, 0.82);
    lampPost(12, 3.6);
  }

  function buildPharmacy(o) {
    const hut = grp(null, -12.2, 0, -12.4, 0.5);
    const house = grp(hut, 0, 2.2, 0);
    box(3.2, 2.4, 2.8, '#8B5E3C', house, 0, 1.2, 0);
    for (let i = 0; i < 6; i++) { const lg = cyl(0.2, 0.2, 3.5, '#7A5234', 6, house, 0, 0.2 + i * 0.4, 1.42, false); lg.rotation.z = Math.PI / 2; }
    roof(3.9, 1.8, 3.6, '#4F5E3A', house, 0, 2.4, 0);
    win(house, -0.7, 1.35, 1.62, 0, 0.8, 0.8);
    box(0.8, 1.6, 0.1, '#5A3A26', house, 0.8, 0.8, 1.62, false);
    // зелёный крест
    const crossMat = special('#2F9E5B', { emissive: '#3BFF8A', emissiveIntensity: 0.05 });
    shared.cross = crossMat;
    const cr = grp(house, 0, 3.2, 1.25);
    box(0.7, 0.22, 0.1, crossMat, cr, 0, 0, 0, false); box(0.22, 0.7, 0.1, crossMat, cr, 0, 0, 0, false);
    sign(['АПТЕКА'], 1.6, 0.36, { bg: '#EFE7D4', fg: '#2F6E45', w: 384, h: 88, size: 60 }, house, -0.6, 2.2, 1.65);
    cyl(0.18, 0.2, 1.1, '#7A6A5E', 6, house, 1, 3.7, -0.6);
    // курьи ножки
    const legs = [];
    for (const sx of [-0.8, 0.8]) {
      const leg = grp(hut, sx, 2.2, 0);
      const thigh = cyl(0.26, 0.18, 1.1, '#D9A13B', 6, leg, 0, -0.45, 0);
      const shin = cyl(0.1, 0.08, 1.2, '#E3B64F', 5, leg, 0, -1.4, 0.1);
      for (let k = -1; k <= 1; k++) { const toe = box(0.08, 0.06, 0.5, '#E3B64F', leg, k * 0.12, -2.14, 0.32); toe.rotation.y = k * 0.5; }
      box(0.08, 0.06, 0.3, '#E3B64F', leg, 0, -2.14, -0.18);
      legs.push({ leg, thigh, shin, sx });
    }
    blob(hut, 2.2);
    o.hut = { g: hut, house, legs };
    // ступа с метлой
    const st = grp(null, -9.2, 0, -12.8);
    cyl(0.55, 0.4, 1, '#6B4A30', 8, st, 0, 0.5, 0);
    cyl(0.56, 0.56, 0.08, '#4E3524', 8, st, 0, 1.0, 0, false);
    const broom = grp(st, 0.35, 0, 0.3); broom.rotation.z = -0.35;
    cyl(0.03, 0.03, 1.8, '#8B6A48', 5, broom, 0, 1.1, 0);
    cone(0.18, 0.6, '#C9A45A', 6, broom, 0, 0.2, 0).rotation.x = Math.PI;
    o.mortar = st;
    lampPost(-8.4, -9.4);
  }

  function buildBanya(o) {
    // пруд
    const shore = mesh(new T.CircleGeometry(6.4, 12), '#6B5B3E');
    shore.rotation.x = -Math.PI / 2; shore.scale.set(1, 0.82, 1); shore.position.set(-17.5, 0.05, 12.8); shore.receiveShadow = true; root.add(shore);
    const water = mesh(new T.CircleGeometry(5.8, 14), special('#3E7C83', { emissive: '#0E2A38', emissiveIntensity: 0.4 }));
    water.rotation.x = -Math.PI / 2; water.scale.set(1, 0.8, 1); water.position.set(-17.5, 0.09, 12.8); water.receiveShadow = true; root.add(water);
    shared.water = water;
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9 + 0.4, r = 3 + (i % 3);
      const lp = mesh(new T.CircleGeometry(0.4, 7), '#5E8A45');
      lp.rotation.x = -Math.PI / 2; lp.position.set(-17.5 + Math.cos(a) * r, 0.12, 12.8 + Math.sin(a) * r * 0.75); root.add(lp);
    }
    for (let i = 0; i < 16; i++) {
      const a = 2.2 + i * 0.16;
      const reed = cyl(0.03, 0.04, 1.2 + (i % 3) * 0.3, '#7A8A3E', 4, null, -17.5 + Math.cos(a) * 6.1, 0.6, 12.8 + Math.sin(a) * 5);
      reed.rotation.z = (i % 2 ? 0.1 : -0.1);
      if (i % 3 === 0) cyl(0.06, 0.06, 0.3, '#5B3F2B', 5, null, reed.position.x, 1.3 + (i % 3) * 0.3, reed.position.z);
    }
    o.pond = { x: -17.5, z: 12.8 };
    // баня
    const b = grp(null, -15.4, 0, 5.2, 0.15);
    box(4.6, 0.4, 3.8, '#6B5C4C', b, 0, 0.2, 0);
    box(4.4, 2.3, 3.6, '#7A5234', b, 0, 1.55, 0);
    for (let i = 0; i < 5; i++) box(4.46, 0.07, 3.66, '#5E3F29', b, 0, 0.6 + i * 0.46, 0, false);
    roof(5.1, 1.5, 4.4, '#5F6B72', b, 0, 2.7, 0);
    win(b, -1, 1.7, 1.85, 0, 0.7, 0.55);
    box(0.9, 1.7, 0.1, '#4A3020', b, 0.9, 1.25, 1.85, false);
    cyl(0.3, 0.34, 1.6, '#6B625A', 6, b, 1.4, 4.1, -0.6);
    sign(['ПАР И ТИНА', 'баня'], 2.2, 0.55, { bg: '#2F5E5B', fg: '#EFE7D4', w: 512, h: 128, size: 58, sub: 0.45 }, b, -0.5, 2.55, 1.9);
    o.banyaChimney = { x: -15.4 + 1.4, y: 5.0, z: 5.2 - 0.6 };
    // мостки
    const pier = grp(null, -13.8, 0, 9.2, -0.5);
    for (let i = 0; i < 7; i++) box(1.4, 0.1, 0.36, '#9C7A52', pier, 0, 0.42, i * 0.42);
    for (const [px, pz] of [[-0.6, 0], [0.6, 0], [-0.6, 2.5], [0.6, 2.5]]) cyl(0.07, 0.07, 0.8, '#5E3F29', 5, pier, px, 0.2, pz);
    // тазики и веники
    cyl(0.3, 0.22, 0.18, '#B9BEC2', 8, null, -12.8, 0.14, 7.6);
    cyl(0.3, 0.22, 0.18, '#B9BEC2', 8, null, -12.4, 0.32, 7.7);
    lampPost(-10.2, 4.4);
  }

  function buildSawmill(o) {
    // штабеля брёвен
    const stack = (x, z, n, ry) => {
      const g = grp(null, x, 0, z, ry);
      let k = 0;
      for (let row = 0; row < 3; row++) {
        for (let i = 0; i < n - row; i++) {
          const lg = cyl(0.32, 0.32, 3.6, k++ % 2 ? '#8B5E3C' : '#7A5234', 7, g, (i - (n - row - 1) / 2) * 0.66, 0.34 + row * 0.56, 0);
          lg.rotation.x = Math.PI / 2;
          const end = mesh(new T.CircleGeometry(0.3, 7), '#D9B98A');
          end.position.set(0, 1.81, 0); end.rotation.x = -Math.PI / 2; lg.add(end);
        }
      }
    };
    stack(0.4, -15.5, 5, 0.1);
    stack(4.6, -19.2, 4, 0.25);
    // опилки
    cone(1.2, 0.6, '#D6B98A', 7, null, 8.4, 0.3, -16.8);
    cone(0.8, 0.4, '#CDAE7C', 7, null, 9.4, 0.2, -15.4);
    // лесовоз
    const tr = grp(null, 7.6, 0, -13.2, -0.35);
    box(1.7, 1.5, 1.9, '#B55A2F', tr, 2.6, 1.3, 0);
    box(1.6, 0.6, 1.92, '#33424F', tr, 2.75, 1.6, 0, false);
    box(5.6, 0.3, 1.5, '#2B2A28', tr, 0, 0.6, 0);
    for (const wx of [-1.9, -0.9, 2.7]) for (const wz of [-0.78, 0.78]) { const w = cyl(0.42, 0.42, 0.3, '#1E1E1E', 10, tr, wx, 0.42, wz); w.rotation.x = Math.PI / 2; }
    for (let i = 0; i < 4; i++) { const lg = cyl(0.28, 0.28, 3.6, '#8B5E3C', 7, tr, -0.3, 1.0 + (i > 1 ? 0.5 : 0), -0.3 + (i % 2) * 0.6); lg.rotation.z = Math.PI / 2; }
    for (const sx of [-1.8, 1.1]) { box(0.1, 1.3, 0.1, '#2B2A28', tr, sx, 1.2, 0.8, false); box(0.1, 1.3, 0.1, '#2B2A28', tr, sx, 1.2, -0.8, false); }
    o.truck = tr;
    // старый дуб с дуплом
    const oak = grp(null, -1.2, 0, -20.2);
    cyl(0.7, 1.0, 3.4, '#5B4330', 7, oak, 0, 1.7, 0);
    const hollow = mesh(new T.CircleGeometry(0.32, 8), '#1A120C');
    hollow.position.set(0.45, 2.1, 0.72); hollow.rotation.y = 0.55; oak.add(hollow);
    for (const [bx, by, bz, r] of [[0, 4.6, 0, 2.2], [-1.6, 4, 0.4, 1.4], [1.6, 4.1, -0.3, 1.5], [0.4, 5.6, -0.4, 1.4]]) ball(r, '#6E7F3A', oak, bx, by, bz, 0);
    for (let i = 0; i < 4; i++) { const br = cyl(0.14, 0.24, 1.8, '#5B4330', 5, oak, Math.cos(i * 1.6) * 0.8, 3.4, Math.sin(i * 1.6) * 0.8); br.rotation.z = Math.cos(i * 1.6) * 0.7; br.rotation.x = -Math.sin(i * 1.6) * 0.7; }
    o.oak = oak;
    // сарайчик
    const sh = grp(null, 10.2, 0, -19.4, -0.2);
    box(2.6, 1.9, 2.2, '#7A6A5E', sh, 0, 0.95, 0);
    roof(3, 1, 2.6, '#6F7F86', sh, 0, 1.9, 0);
  }

  function buildShop(o) {
    const s = grp(null, 6.4, 0, 14.6, -0.08);
    box(5.4, 0.4, 3.8, '#6B5C4C', s, 0, 0.2, 0);
    box(5.2, 2.6, 3.6, '#6D8FB0', s, 0, 1.7, 0);
    for (let i = 0; i < 9; i++) box(0.06, 2.6, 3.64, '#5E7E9E', s, -2.4 + i * 0.6, 1.7, 0, false);
    roof(5.9, 1.6, 4.4, '#9C4A32', s, 0, 3.0, 0);
    win(s, -1.4, 1.9, 1.85, 0, 1.1, 0.9);
    win(s, 2.65, 1.9, 0, Math.PI / 2, 1, 0.9);
    box(1, 1.9, 0.1, '#4A3020', s, 0.6, 1.35, 1.85, false);
    sign(['ПРОДУКТЫ · ПОЧТА'], 3.6, 0.55, { bg: '#EFE7D4', fg: '#9C2F25', w: 768, h: 118, size: 64 }, s, -0.3, 2.78, 1.86);
    // крыльцо
    box(2.6, 0.3, 1.2, '#9C7A52', s, 0.4, 0.3, 2.4);
    cyl(0.06, 0.06, 2.2, '#8B6A48', 5, s, -0.8, 1.4, 2.9); cyl(0.06, 0.06, 2.2, '#8B6A48', 5, s, 1.6, 1.4, 2.9);
    const canopy = box(2.8, 0.1, 1.4, '#9C4A32', s, 0.4, 2.5, 2.5); canopy.rotation.x = 0.12;
    // почтовый ящик
    const mb = grp(null, 3.4, 0, 16.4);
    cyl(0.05, 0.05, 1, '#3B3A38', 5, mb, 0, 0.5, 0);
    box(0.5, 0.6, 0.4, '#2E5FB8', mb, 0, 1.2, 0);
    // ящики
    box(0.7, 0.5, 0.5, '#A9865A', null, 9.6, 0.25, 16.2); box(0.6, 0.45, 0.5, '#9C7A52', null, 9.8, 0.72, 16.1);
    lampPost(3.4, 12.2);
  }

  // ---------- сборка ----------
  function build(THREE, scene) {
    T = THREE;
    root = new T.Group();
    scene.add(root);
    shared.lamps = [];
    const o = { signs: [], flags: [], chars: {} };
    plate();
    // дороги: асфальт через площадь к автосалону, грунтовки к остальным
    road([[-24.2, 1.6], [-10, 1.2], [0, 1.0], [10, 1.4], [24.2, 2.2]], 3, '#55524E', 0.07);
    for (let i = 0; i < 12; i++) box(0.8, 0.02, 0.12, '#D8D0BE', null, -22 + i * 4, 0.1, 1.2 + i * 0.05, false);
    road(curve([0, 0], P.pharmacy.stand, 0.12), 1.7, '#B59A6E', 0.06);
    road(curve([0, 0], P.sawmill.stand, -0.1), 1.7, '#B59A6E', 0.06);
    road(curve([0, 0], P.banya.stand, -0.12), 1.7, '#B59A6E', 0.06);
    road(curve([0, 0], P.shop.stand, 0.15), 1.7, '#B59A6E', 0.06);
    road([[P.sawmill.stand[0], P.sawmill.stand[1]], [5, -13.5], [7, -14.5]], 2.4, '#A98E62', 0.065);

    const sq = buildSquare(o);
    buildDealership(o);
    buildPharmacy(o);
    buildBanya(o);
    buildSawmill(o);
    buildShop(o);

    // жилые избы, огороды, заборы
    izba(-6.6, 11.4, 0.1, { roof: '#6F7F86' }); fence(-9.4, 13.8, -3.6, 13.8); garden(-6.4, 15.6, 3.6, 2.4); appleTree(-3.2, 15.8);
    izba(10.6, 7.6, -0.2, { wall: '#9C6B45' }); fence(8, 10.2, 13.6, 9.6); appleTree(13.4, 11.2);
    izba(-5, -10.8, 0.3, { roof: '#4F6B4A', w: 3.6 }); garden(-1.8, -8.6, 2.4, 2);
    izba(20, 9.8, -0.4, { roof: '#9C4A32', w: 3.4, d: 3 });
    // водонапорная башня
    const wt = grp(null, -19.2, 0, -18.4);
    cyl(0.9, 1.2, 6, '#A8553C', 8, wt, 0, 3, 0);
    cyl(1.8, 1.1, 1.8, '#6F7F86', 8, wt, 0, 6.9, 0);
    cone(1.9, 1, '#5F6B72', 8, wt, 0, 8.3, 0);
    // линия электропередачи вдоль асфальта
    const poles = [-20, -12, -4, 8, 16, 22].map((x) => pole(x, -0.9));
    for (let i = 0; i < poles.length - 1; i++) wire(poles[i], poles[i + 1]);
    o.wirePerch = { x: 8 + 3.5, y: 4.3, z: -0.9 };

    // лес: плотнее по дальним краям, не заходит на места и дороги
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const busy = [[0, 0, 7], [15, -3, 7.5], [-12, -12, 4.6], [3.5, -16, 6.5], [-15.5, 8.5, 7.5], [6, 13.5, 5.5], [-6.6, 12.5, 4.5], [10.6, 8, 3.8], [-4.4, -9.8, 4], [-19.2, -18.4, 2.6], [20, 9.8, 3], [-1.2, -20.2, 3.2], [22.2, -4.4, 3.4]];
    const nearRoad = (x, z) => Math.abs(z - 1.4) < 2.6 && Math.abs(x) < 24;
    const trees = [];
    for (let i = 0; i < 420 && trees.length < 96; i++) {
      const x = -23 + rnd() * 46, z = -23 + rnd() * 46;
      const edge = Math.min(x + 24, z + 24, 24 - x, 24 - z);
      const far = (x < -15 || z < -15);
      if (!far && edge > 3.5 && rnd() > 0.2) continue;
      if (busy.some(([bx, bz, r]) => Math.hypot(x - bx, z - bz) < r)) continue;
      if (nearRoad(x, z)) continue;
      if (Math.hypot(x + 17.5, (z - 12.8) / 0.82) < 7) continue;
      if (trees.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 1.7)) continue;
      trees.push([x, z]);
      const s = 0.75 + rnd() * 0.5;
      if (far && rnd() < 0.7) pine(x, z, s * 1.1);
      else birch(x, z, s, null, rnd() < 0.55);
    }
    // трава-кочки
    for (let i = 0; i < 40; i++) {
      const x = -22 + rnd() * 44, z = -22 + rnd() * 44;
      if (busy.some(([bx, bz, r]) => Math.hypot(x - bx, z - bz) < r - 1) || nearRoad(x, z)) continue;
      const tuft = cone(0.25, 0.35, rnd() < 0.5 ? '#8FA35A' : '#A89B5B', 4, null, x, 0.17, z, false);
      tuft.rotation.y = rnd() * 3;
    }

    // жители
    const mk = { koschei: makeKoschei, gorynych: makeGorynych, yaga: makeYaga, vodyanoy: makeVodyanoy, leshy: makeLeshy, kikimora: makeKikimora, emelya: makeEmelya };
    for (const id in mk) {
      const c = mk[id](); c.id = id; c.g.userData.char = id; o.chars[id] = c;
      if (c.body && id !== 'gorynych' && id !== 'emelya') c.body.scale.setScalar(1.3);
    }
    o.player = makePolice();
    o.player.body.scale.setScalar(1.3);
    o.player.g.userData.char = 'player';
    o.cat = makeCat();
    for (const id in o.chars) compact(o.chars[id].g);
    compact(o.player.g); compact(o.cat.g);
    compact(o.hut.g); compact(o.truck); compact(o.mortar);
    o.cat.g.position.set(sq.cat[0], sq.cat[1], sq.cat[2]);
    o.cat.g.rotation.y = 0.6;
    o.cat.g.userData.char = 'kot';

    o.lamps = shared.lamps;
    o.windowMat = windowMat();
    o.bulbMat = shared.bulb;
    o.glass = shared.glass;
    o.cross = shared.cross;
    o.water = shared.water;
    o.redrawSigns = () => signs.forEach((f) => f());
    return o;
  }

  return { build, P, SPOTS, mesh: (g, c) => mesh(g, c), special: (b, e) => special(b, e), vc: () => vcMat() };
})();
