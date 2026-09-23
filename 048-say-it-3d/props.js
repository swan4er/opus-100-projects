/* ================================================================
   Рецепты, часть 2: маяк, мельница, мебель, транспорт, небо, «своё».
   ================================================================ */
(function () {
  'use strict';
  if (!window.THREE) return;
  const T = THREE, PI = Math.PI;
  const { R, GEO, shade, col, col2, windowAt, gableRoof } = S3.recipes;

  // клинья конуса для полосатых куполов и зонтов
  const WEDGE = new Map();
  function wedge(i, n, kind) {
    const key = kind + i + ':' + n;
    let g = WEDGE.get(key);
    if (!g) {
      g = kind === 'gore'
        ? new T.SphereGeometry(0.5, 3, 14, (i / n) * PI * 2, (PI * 2) / n)
        : new T.ConeGeometry(0.5, 1, 3, 1, false, (i / n) * PI * 2, (PI * 2) / n);
      g.userData.shared = true;
      WEDGE.set(key, g);
    }
    return g;
  }
  const beamMat = () => new T.MeshBasicMaterial({ color: 0xfff1c2, vertexColors: true, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false });
  // луч гаснет к концу: цвет вершин от яркого у лампы к чёрному (при сложении чёрное невидимо)
  function beamGeo() {
    const g = new T.ConeGeometry(0.9, 7, 20, 6, true);
    const p = g.attributes.position, c = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) { const t = (3.5 - p.getY(i)) / 7; const k = Math.pow(1 - t, 2.2) * 0.35; c[i * 3] = k; c[i * 3 + 1] = k; c[i * 3 + 2] = k; }
    g.setAttribute('color', new T.BufferAttribute(c, 3));
    return g;
  }

  R.lighthouse = function (b, o) {
    const c1 = col(o, '#f4f1ea'), c2 = col2(o, '#c9443a');
    b.p('cyl:10', '#8b8378', [0, 0.25, 0], [2.6, 0.5, 2.6], null, { jitter: 0.03 });
    const H = 5.4, seg = 5;
    for (let i = 0; i < seg; i++) {
      const d0 = 1.9 - (i / seg) * 0.62, d1 = 1.9 - ((i + 1) / seg) * 0.62;
      b.p('cylT:' + (d1 / d0).toFixed(3) + ':18', i % 2 ? c2 : c1, [0, 0.5 + (H / seg) * (i + 0.5), 0], [d0, H / seg, d0], null, { flat: false });
    }
    const top = 0.5 + H;
    b.solo('box', '#4a3426', [0, 0.95, 0.93], [0.5, 0.9, 0.1]);
    b.solo('box', '#ffcf7a', [0, 2.6, 0.83], [0.26, 0.4, 0.06], null, { mat: 'window' });
    b.solo('box', '#ffcf7a', [0, 4.1, 0.73], [0.24, 0.36, 0.06], null, { mat: 'window' });
    b.p('cyl:18', '#34373d', [0, top + 0.08, 0], [1.9, 0.16, 1.9], null, { flat: false });
    b.p('torus:0.05', '#34373d', [0, top + 0.5, 0], [1.8, 1.8, 1.8], [PI / 2, 0, 0], { flat: false });
    for (let i = 0; i < 10; i++) { const a = (i / 10) * PI * 2; b.p('cyl:5', '#34373d', [Math.cos(a) * 0.9, top + 0.3, Math.sin(a) * 0.9], [0.05, 0.42, 0.05]); }
    b.p('cyl:10', '#dfe8ea', [0, top + 0.7, 0], [1.0, 0.95, 1.0], null, { mat: 'glass', flat: false });
    b.solo('sph', '#fff0b8', [0, top + 0.7, 0], 0.46, null, { mat: 'glow', intensity: 2.6, night: true });
    b.p('cone:18', c2, [0, top + 1.5, 0], [1.4, 0.72, 1.4], null, { flat: false });
    b.p('sph', '#34373d', [0, top + 1.9, 0], 0.18, null, { flat: false });
    // вращающийся луч
    const rotor = b.pivot([0, top + 0.7, 0]);
    const m = beamMat();
    for (const s of [-1, 1]) {
      const beam = new T.Mesh(beamGeo(), m);
      beam.rotation.z = s * PI / 2; beam.position.x = s * 3.5;
      rotor.add(beam);
    }
    b.rig.rotor = rotor; b.rig.rotorAxis = 'y'; b.rig.beam = m;
    b.light([0, top + 0.7, 0], '#ffe3a0', 2.2, { night: true });
    b.rig.top = top + 2.0; b.rig.porch = [0.9, 0, 1.3];
  };

  R.windmill = function (b, o) {
    const c = col(o, '#ede3cc'), roof = col2(o, '#8c4a32');
    b.p('cyl:8', '#9a9186', [0, 0.25, 0], [3.0, 0.5, 3.0], null, { jitter: 0.03 });
    b.p('cylT:0.62:8', c, [0, 2.35, 0], [2.7, 3.9, 2.7]);
    b.p('cone:8', roof, [0, 4.85, 0], [2.1, 1.3, 2.1]);
    b.solo('box', '#4a3426', [0, 1.1, 1.24], [0.62, 1.2, 0.1]);
    windowAt(b, 0, 2.9, 1.0, 0, '#ffffff', 0.4, 0.5);
    windowAt(b, 0.98, 2.2, 0.2, PI / 2 - 0.2, '#ffffff', 0.34, 0.44);
    const rotor = b.pivot([0, 4.3, 1.05]);
    b.p('cyl:10', '#5a4232', [0, 0, 0.12], [0.42, 0.4, 0.42], [PI / 2, 0, 0], { parent: rotor });
    for (let i = 0; i < 4; i++) {
      const bl = b.pivot([0, 0, 0.3], rotor); bl.rotation.z = i * PI / 2 + 0.3;
      b.p('box', '#6e5240', [0, 1.55, 0], [0.12, 3.1, 0.08], null, { parent: bl });
      b.p('box', '#f6f0e2', [0.33, 1.85, -0.02], [0.52, 2.3, 0.03], null, { parent: bl, jitter: 0.03 });
      for (let j = 0; j < 4; j++) b.p('box', '#6e5240', [0.33, 0.9 + j * 0.62, 0.01], [0.56, 0.04, 0.04], null, { parent: bl });
    }
    b.rig.rotor = rotor; b.rig.rotorAxis = 'z';
    b.rig.top = 5.5; b.rig.porch = [0.9, 0, 1.7];
  };

  R.well = function (b, o) {
    const stone = col(o, '#9a958c');
    for (let i = 0; i < 12; i++) { const a = (i / 12) * PI * 2; b.p('box', shade(stone, (i % 3 - 1) * 0.04), [Math.cos(a) * 0.62, 0.4, Math.sin(a) * 0.62], [0.36, 0.8, 0.22], [0, -a + PI / 2, 0]); }
    b.p('cyl:12', '#223040', [0, 0.72, 0], [1.1, 0.04, 1.1]);
    for (const s of [-1, 1]) b.p('box', '#7a5238', [s * 0.72, 1.25, 0], [0.12, 1.7, 0.12]);
    b.p('prism', col2(o, '#8c4a32'), [0, 2.05, 0], [1.9, 0.7, 1.5], [0, PI / 2, 0]);
    b.p('cyl:8', '#6e4c34', [0, 1.6, 0], [0.14, 1.4, 0.14], [0, 0, PI / 2]);
    b.p('cylT:1.2:8', '#8a6446', [0, 1.2, 0], [0.3, 0.3, 0.3]);
    b.rig.top = 2.4;
  };

  R.fence = function (b, o) {
    const n = o.n || 5, k = o.kind, c = col(o, k === 'picket' ? '#f4efe4' : k === 'stone' ? '#9a958c' : '#8a6446');
    if (k === 'stone') {
      for (let i = 0; i < n * 3; i++) b.p(S3.recipes.jagged(b, b.rnd, 0), shade(c, (b.rnd() - 0.5) * 0.1), [-n / 2 + (i + 0.5) / 3, 0.22 + (i % 2) * 0.12, 0], [0.45, 0.4, 0.45], [b.rnd(), b.rnd(), 0]);
      b.rig.top = 0.5; return;
    }
    for (let i = 0; i <= n; i++) b.p('box', shade(c, -0.08), [-n / 2 + i, 0.45, 0], [0.12, 0.9, 0.12]);
    for (const y of [0.3, 0.65]) b.p('box', c, [0, y, 0], [n, 0.08, 0.06]);
    if (k === 'picket') for (let i = 0; i < n * 4; i++) {
      const x = -n / 2 + 0.125 + i * 0.25;
      b.p('box', c, [x, 0.42, 0.05], [0.14, 0.72, 0.04]);
      b.p('pyr', c, [x, 0.84, 0.05], [0.14, 0.12, 0.04]);
    }
    b.rig.top = 0.9;
  };

  R.bridge = function (b, o) {
    const stone = o.kind === 'stone', c = col(o, stone ? '#a39d93' : '#8a6446');
    const N = 13;
    for (let i = 0; i < N; i++) {
      const x = -2 + (i / (N - 1)) * 4, y = 0.15 + 0.7 * (1 - (x / 2) * (x / 2)), slope = -0.7 * 2 * x / 4;
      b.p('box', shade(c, (i % 2 ? -0.04 : 0.02)), [x, y, 0], [0.32, 0.12, 1.3], [0, 0, Math.atan(slope)]);
      if (i % 3 === 0) for (const s of [-1, 1]) b.p('box', shade(c, -0.1), [x, y + 0.35, s * 0.6], [0.08, 0.6, 0.08]);
    }
    for (const s of [-1, 1]) for (let i = 0; i < 6; i++) {
      const x0 = -2 + i * 0.8, x1 = x0 + 0.8, y0 = 0.15 + 0.7 * (1 - (x0 / 2) ** 2) + 0.6, y1 = 0.15 + 0.7 * (1 - (x1 / 2) ** 2) + 0.6;
      b.p('box', shade(c, -0.06), [(x0 + x1) / 2, (y0 + y1) / 2, s * 0.6], [Math.hypot(0.8, y1 - y0), 0.07, 0.07], [0, 0, Math.atan2(y1 - y0, 0.8)]);
    }
    b.rig.top = 0.95;
  };

  R.tent = function (b, o) {
    if (o.kind === 'circus') {
      const c = col(o, '#e04b4b'), c2 = col2(o, '#f4efe4');
      for (let i = 0; i < 12; i++) b.p(wedge(i, 12, 'cone'), i % 2 ? c : c2, [0, 2.4, 0], [3.4, 1.6, 3.4]);
      b.p('cyl:12', c2, [0, 0.85, 0], [3.0, 1.7, 3.0]);
      for (let i = 0; i < 12; i += 2) { const a = (i / 12) * PI * 2 + 0.26; b.p('box', c, [Math.sin(a) * 1.51, 0.85, Math.cos(a) * 1.51], [0.5, 1.7, 0.04], [0, a, 0]); }
      b.p('box', '#3a2e27', [0, 0.65, 1.5], [0.8, 1.3, 0.06]);
      b.p('cyl:6', '#6d5e52', [0, 3.6, 0], [0.05, 1.0, 0.05]);
      b.p('box', col2(o, '#f2c94c'), [0.25, 3.9, 0], [0.45, 0.28, 0.03]);
      b.rig.top = 3.2; return;
    }
    const c = col(o, '#e2893a');
    b.p('prism', c, [0, 0, 0], [2.3, 1.55, 2.4], null, { jitter: 0.03 });
    b.p('prism', '#3b2d24', [0, 0.02, 1.21], [0.9, 0.95, 0.02]);
    b.p('cyl:6', '#6e4c34', [0, 0.85, 1.25], [0.06, 1.7, 0.06]);
    b.rig.top = 1.55;
  };

  R.campfire = function (b, o) {
    for (let i = 0; i < 9; i++) { const a = (i / 9) * PI * 2; b.p('dod', shade('#8f8a82', (i % 3 - 1) * 0.05), [Math.cos(a) * 0.62, 0.1, Math.sin(a) * 0.62], 0.3, [i, i * 2, 0]); }
    for (let i = 0; i < 3; i++) b.p('cyl:7', '#6e4c34', [0, 0.18, 0], [0.16, 1.0, 0.16], [PI / 2 - 0.25, (i / 3) * PI, 0]);
    const fl = b.pivot([0, 0.2, 0]);
    b.solo('cone:7', col(o, '#ff8a2b'), [0, 0.35, 0], [0.55, 0.8, 0.55], null, { mat: 'glow', intensity: 2.8, parent: fl });
    b.solo('cone:7', '#ffd25a', [0.05, 0.28, 0.05], [0.32, 0.55, 0.32], null, { mat: 'glow', intensity: 3.2, parent: fl });
    b.rig.flame = fl;
    b.light([0, 0.8, 0], '#ff9a4a', 1.6, { flicker: true });
    b.rig.smoke = [0, 1.0, 0];
    b.rig.top = 0.3;
  };

  R.lamp = function (b, o) {
    const metal = col2(o, '#2f3136'), glow = col(o, '#ffd98a'), k = o.kind;
    if (k === 'paper') {
      b.p('cyl:6', '#6e4c34', [0, 1.1, 0], [0.08, 2.2, 0.08]);
      b.p('box', '#6e4c34', [0.3, 2.15, 0], [0.7, 0.06, 0.06]);
      b.solo('sph', col(o, '#e2503a'), [0.55, 1.8, 0], [0.42, 0.52, 0.42], null, { mat: 'glow', intensity: 1.8 });
      b.light([0.55, 1.8, 0], col(o, '#ff7a4a'), 1.0);
      b.rig.top = 2.2; return;
    }
    const H = k === 'lantern' ? 1.25 : 2.6;
    b.p('cylT:0.7:8', metal, [0, 0.12, 0], [0.34, 0.24, 0.34], null, { mat: 'metal' });
    b.p('cyl:8', metal, [0, H / 2, 0], [0.11, H, 0.11], null, { mat: 'metal' });
    b.solo('box', glow, [0, H + 0.22, 0], [0.3, 0.4, 0.3], null, { mat: 'glow', intensity: 2.4, night: true });
    b.p('pyr', metal, [0, H + 0.52, 0], [0.46, 0.22, 0.46], null, { mat: 'metal' });
    b.p('box', metal, [0, H + 0.02, 0], [0.36, 0.05, 0.36], null, { mat: 'metal' });
    b.light([0, H + 0.22, 0], glow, 1.3, { night: true });
    b.rig.top = H + 0.65;
  };

  R.bench = function (b, o) {
    const w = col(o, '#b07a4a'), m = col2(o, '#34373d');
    for (let i = 0; i < 3; i++) b.p('box', shade(w, (i - 1) * 0.03), [0, 0.46, -0.16 + i * 0.16], [1.7, 0.06, 0.13]);
    for (let i = 0; i < 2; i++) b.p('box', w, [0, 0.72 + i * 0.2, -0.3], [1.7, 0.12, 0.05], [-0.15, 0, 0]);
    for (const s of [-1, 1]) { b.p('box', m, [s * 0.7, 0.22, 0], [0.08, 0.44, 0.44], null, { mat: 'metal' }); b.p('box', m, [s * 0.7, 0.72, -0.32], [0.08, 0.6, 0.06], [-0.15, 0, 0], { mat: 'metal' }); }
    b.rig.top = 0.5; b.rig.seat = [0, 0.49, 0];
  };

  R.table = function (b, o) {
    const w = col(o, '#a8764a'), k = o.kind;
    if (k === 'round') { b.p('cyl:20', w, [0, 0.74, 0], [1.3, 0.07, 1.3], null, { flat: false }); b.p('cyl:8', shade(w, -0.1), [0, 0.37, 0], [0.12, 0.74, 0.12]); b.p('cyl:12', shade(w, -0.1), [0, 0.03, 0], [0.6, 0.06, 0.6]); }
    else {
      b.p('box', w, [0, 0.74, 0], [1.6, 0.08, 1.0]);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.p('box', shade(w, -0.1), [sx * 0.7, 0.37, sz * 0.4], [0.08, 0.74, 0.08]);
      if (k === 'picnic') for (const s of [-1, 1]) { b.p('box', w, [0, 0.42, s * 0.85], [1.6, 0.06, 0.3]); for (const sx of [-1, 1]) b.p('box', shade(w, -0.1), [sx * 0.65, 0.21, s * 0.85], [0.07, 0.42, 0.07]); }
    }
    if (o.color2) {
      if (k === 'round') b.p('cyl:20', o.color2, [0, 0.72, 0], [1.42, 0.1, 1.42], null, { flat: false });
      else b.p('box', o.color2, [0, 0.72, 0], [1.72, 0.12, 1.12]);
    }
    b.rig.top = 0.79;
  };

  R.chair = function (b, o) {
    const w = col(o, '#a8764a');
    b.p('box', w, [0, 0.46, 0], [0.5, 0.06, 0.5]);
    b.p('box', w, [0, 0.8, -0.23], [0.5, 0.62, 0.05]);
    if (o.kind === 'rocking') for (const s of [-1, 1]) b.p('arc:0.04', shade(w, -0.1), [s * 0.22, 0.42, 0], [1.1, 0.5, 1], [PI, PI / 2, 0]);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.p('box', shade(w, -0.1), [sx * 0.21, 0.23, sz * 0.21], [0.05, 0.46, 0.05]);
    b.rig.top = 0.5; b.rig.seat = [0, 0.49, 0];
  };

  R.samovar = function (b, o) {
    const brass = col(o, '#cf9a3e'), dark = '#3a2e27';
    b.p('cylT:0.6:12', brass, [0, 0.05, 0], [0.34, 0.1, 0.34], null, { mat: 'metal', flat: false });
    b.p('cyl:12', brass, [0, 0.14, 0], [0.12, 0.1, 0.12], null, { mat: 'metal', flat: false });
    b.p('sph', brass, [0, 0.36, 0], [0.46, 0.5, 0.46], null, { mat: 'metal', flat: false });
    b.p('cyl:14', brass, [0, 0.58, 0], [0.3, 0.1, 0.3], null, { mat: 'metal', flat: false });
    for (const s of [-1, 1]) b.p('arc:0.08', dark, [s * 0.25, 0.46, 0], [0.18, 0.2, 0.2], [0, 0, s * -PI / 2]);
    b.p('cyl:8', brass, [0, 0.3, 0.24], [0.05, 0.14, 0.05], [PI / 2, 0, 0], { mat: 'metal' });
    b.p('box', dark, [0, 0.33, 0.32], [0.06, 0.04, 0.04]);
    b.p('cyl:10', brass, [0, 0.67, 0], [0.1, 0.1, 0.1], null, { mat: 'metal' });
    b.p('sph', col2(o, '#f4efe4'), [0, 0.78, 0], [0.22, 0.17, 0.22], null, { flat: false, mat: 'glossy' });
    b.p('cone:8', col2(o, '#f4efe4'), [0.13, 0.8, 0], [0.05, 0.14, 0.05], [0, 0, -1.0], { mat: 'glossy' });
    for (let i = 0; i < 5; i++) { const a = i * 1.26; b.p('sph', '#d8392f', [Math.cos(a) * 0.11, 0.79, Math.sin(a) * 0.11], 0.03, null, { flat: false }); }
    b.rig.smoke = [0, 0.9, 0]; b.rig.steam = true;
    b.rig.top = 0.88;
  };

  R.barrel = function (b, o) {
    const w = col(o, '#9c6a3f');
    b.p('cylT:1.14:12', w, [0, 0.25, 0], [0.62, 0.5, 0.62]);
    b.p('cylT:0.877:12', w, [0, 0.72, 0], [0.71, 0.44, 0.71]);
    for (const y of [0.12, 0.5, 0.86]) b.p('torus:0.04', '#3a3a3e', [0, y, 0], [y === 0.5 ? 0.72 : 0.64, y === 0.5 ? 0.72 : 0.64, 1], [PI / 2, 0, 0], { mat: 'metal', flat: false });
    b.rig.top = 0.95;
  };

  R.crate = function (b, o) {
    if (o.kind === 'hay') {
      b.p('box', col(o, '#d9b75a'), [0, 0.35, 0], [1.1, 0.7, 0.7], null, { jitter: 0.04 });
      for (const x of [-0.3, 0.3]) b.p('box', '#8a6446', [x, 0.35, 0], [0.04, 0.72, 0.72]);
      b.rig.top = 0.7; return;
    }
    const w = col(o, '#b58a5a'), s = 0.8;
    b.p('box', w, [0, s / 2, 0], [s, s, s]);
    for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) b.p('box', shade(w, -0.12), [x * s / 2, s / 2, z * s / 2], [0.1, s + 0.02, 0.1]);
    b.p('box', shade(w, -0.12), [0, s / 2, s / 2 + 0.01], [s * 1.2, 0.08, 0.03], [0, 0, 0.785]);
    b.rig.top = s;
  };

  function wheels(b, xs, zs, r, parent) {
    const list = [];
    for (const x of xs) for (const z of zs) {
      const w = b.pivot([x, r, z], parent);
      b.p('cyl:14', '#26262a', [0, 0, 0], [r * 2, 0.22, r * 2], [PI / 2, 0, 0], { parent: w, flat: false });
      b.p('cyl:10', '#c9ccd2', [0, 0, Math.sign(z) * 0.06], [r * 0.9, 0.14, r * 0.9], [PI / 2, 0, 0], { parent: w, mat: 'metal' });
      b.p('box', '#8a8d93', [0, 0, Math.sign(z) * 0.13], [r * 1.3, 0.06, 0.02], null, { parent: w });
      list.push(w);
    }
    return list;
  }
  R.car = function (b, o) {
    const k = o.kind, c = col(o, { sedan: '#d9443a', truck: '#3f7fd0', retro: '#8ec3b0', bus: '#f2c230' }[k]);
    const glass = '#2c3a4a';
    if (k === 'bus') {
      b.p('box', c, [0, 0.95, 0], [3.4, 1.3, 1.25]);
      b.p('box', shade(c, -0.1), [0, 0.35, 0], [3.42, 0.18, 1.27]);
      for (let i = 0; i < 5; i++) b.solo('box', '#ffcf7a', [-1.3 + i * 0.62, 1.2, 0.63], [0.48, 0.42, 0.03], null, { mat: 'window' });
      b.p('box', glass, [1.71, 1.15, 0], [0.03, 0.55, 1.0], null, { mat: 'glossy' });
      b.rig.wheels = wheels(b, [-1.1, 1.1], [-0.58, 0.58], 0.3);
      b.solo('box', '#fff4c8', [1.72, 0.55, 0.42], [0.04, 0.14, 0.2], null, { mat: 'glow', night: true });
      b.solo('box', '#fff4c8', [1.72, 0.55, -0.42], [0.04, 0.14, 0.2], null, { mat: 'glow', night: true });
      b.rig.top = 1.62; return;
    }
    if (k === 'truck') {
      b.p('box', c, [0.85, 0.75, 0], [1.0, 0.9, 1.05]);
      b.p('box', glass, [1.36, 0.95, 0], [0.03, 0.38, 0.85], null, { mat: 'glossy' });
      b.p('box', '#8a6446', [-0.45, 0.62, 0], [1.7, 0.5, 1.1]);
      b.p('box', shade(c, -0.15), [0.2, 0.34, 0], [2.7, 0.16, 1.0]);
    } else if (k === 'retro') {
      b.p('cap', c, [0, 0.52, 0], [0.9, 0.62, 0.95], [0, 0, PI / 2], { flat: false, mat: 'glossy' });
      b.p('sph', c, [-0.15, 0.82, 0], [1.0, 0.62, 0.84], null, { flat: false, mat: 'glossy' });
      b.p('sph', glass, [-0.15, 0.86, 0], [0.94, 0.52, 0.86], null, { flat: false, mat: 'glossy' });
    } else {
      b.p('box', c, [0, 0.5, 0], [2.0, 0.44, 1.02], null, { mat: 'glossy' });
      b.p('box', c, [-0.12, 0.88, 0], [1.1, 0.36, 0.92], null, { mat: 'glossy' });
      b.p('box', glass, [-0.12, 0.88, 0], [1.02, 0.3, 0.94], null, { mat: 'glossy' });
      b.p('box', '#c9ccd2', [1.01, 0.4, 0], [0.04, 0.12, 0.9], null, { mat: 'metal' });
    }
    b.rig.wheels = wheels(b, [-0.62, 0.66], [-0.5, 0.5], 0.24);
    for (const z of [-0.33, 0.33]) b.solo('box', '#fff4c8', [k === 'truck' ? 1.36 : 1.01, 0.56, z], [0.04, 0.1, 0.16], null, { mat: 'glow', night: true });
    b.rig.top = 1.1;
  };

  function hull(b, L, W, Hh, c, parent) {
    const g = new T.CylinderGeometry(0.5, 0.5, 1, 16, 1, false, PI, PI);
    g.rotateZ(PI / 2);
    b.p(g, c, [0, 0, 0], [L, W, Hh * 2], null, { parent, flat: false });
    const bow = new T.ConeGeometry(0.5, 1, 16, 1, false, PI, PI);
    bow.rotateZ(-PI / 2);
    b.p(bow, c, [L / 2 + 0.4, 0, 0], [0.8, W, Hh * 2], null, { parent, flat: false });
    b.p('box', '#b08a5e', [0.1, -0.08, 0], [L, 0.04, Hh * 1.7], null, { parent });
  }
  R.boat = function (b, o) {
    const k = o.kind, c = col(o, k === 'ship' ? '#6b4632' : '#c7543a');
    const body = b.pivot([0, 0.3, 0]); b.rig.hull = body;
    if (k === 'ship') {
      hull(b, 3.6, 1.2, 0.8, c, body);
      b.p('box', shade(c, 0.12), [-0.3, 0.2, 0], [3.4, 0.12, 1.5], null, { parent: body });
      b.p('box', '#e7dcc4', [-1.2, 0.55, 0], [0.9, 0.6, 1.1], null, { parent: body });
      for (const [x, h] of [[0.2, 3.2], [-0.8, 2.6]]) {
        b.p('cyl:6', '#4a3426', [x, h / 2, 0], [0.12, h, 0.12], null, { parent: body });
        for (let i = 0; i < 2; i++) b.p('box', col2(o, '#f4efe4'), [x + 0.05, 0.9 + i * 0.95, 0], [0.06, 0.8, 1.4 - i * 0.3], null, { parent: body, jitter: 0.03 });
      }
      b.p('box', '#26242a', [0.25, 3.35, 0.25], [0.02, 0.28, 0.5], null, { parent: body });
      b.solo('sph', '#ffd98a', [-1.2, 0.95, 0.56], 0.12, null, { mat: 'glow', parent: body, night: true });
      b.rig.top = 1.0; return;
    }
    hull(b, 1.8, 0.7, 0.34, c, body);
    b.p('box', '#b08a5e', [0.1, 0.02, 0], [0.12, 0.05, 0.7], null, { parent: body });
    b.p('box', shade(c, -0.15), [0.2, 0.0, 0], [2.0, 0.05, 0.02], null, { parent: body });
    if (k === 'sail') {
      b.p('cyl:6', '#4a3426', [0.3, 1.1, 0], [0.08, 2.2, 0.08], null, { parent: body });
      b.p('prism', col2(o, '#f4efe4'), [-0.05, 0.3, 0], [1.3, 2.0, 0.04], null, { parent: body });
    } else for (const s of [-1, 1]) b.p('box', '#8a6446', [-0.2, 0.05, s * 0.5], [1.4, 0.05, 0.08], [0, s * 0.35, 0], { parent: body });
    b.rig.top = 0.45;
  };

  R.balloon = function (b, o) {
    const c = col(o, '#e2503a'), c2 = col2(o, '#f2c94c');
    if (o.kind === 'party') {
      const cs = [c, c2, '#3f7fd0', '#5c9e48', '#ef8fb1'];
      for (let i = 0; i < 5; i++) {
        const a = i * 1.26;
        b.p('sph', cs[i], [Math.cos(a) * 0.35, 2.2 + (i % 2) * 0.35, Math.sin(a) * 0.35], [0.55, 0.66, 0.55], null, { flat: false, mat: 'glossy' });
        b.p('cyl:4', '#f4efe4', [Math.cos(a) * 0.17, 1.1, Math.sin(a) * 0.17], [0.015, 2.1, 0.015], [Math.sin(a) * 0.15, 0, -Math.cos(a) * 0.15]);
      }
      b.rig.top = 2.6; return;
    }
    for (let i = 0; i < 10; i++) b.p(wedge(i, 10, 'gore'), i % 2 ? c : c2, [0, 3.4, 0], [2.6, 3.0, 2.6], null, { flat: false });
    b.p('cylT:1.8:10', i2(c), [0, 1.85, 0], [0.9, 0.5, 0.9]);
    b.p('box', '#8a6446', [0, 0.32, 0], [0.7, 0.55, 0.7], null, { jitter: 0.04 });
    for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) b.p('cyl:4', '#5a4232', [x * 0.3, 1.1, z * 0.3], [0.03, 1.2, 0.03], [z * 0.12, 0, -x * 0.12]);
    b.solo('cone:6', '#ffb347', [0, 0.9, 0], [0.18, 0.35, 0.18], null, { mat: 'glow', intensity: 2.5 });
    b.rig.top = 4.9;
    function i2(x) { return shade(x, -0.1); }
  };

  R.rocket = function (b, o) {
    const c = col(o, '#f1ede4'), c2 = col2(o, '#d9443a');
    b.p('cyl:16', c, [0, 2.2, 0], [1.0, 3.0, 1.0], null, { flat: false, mat: 'glossy' });
    b.p('cone:16', c2, [0, 4.35, 0], [1.0, 1.3, 1.0], null, { flat: false, mat: 'glossy' });
    b.p('cylT:0.72:16', c2, [0, 0.52, 0], [0.95, 0.4, 0.95], null, { flat: false });
    for (let i = 0; i < 3; i++) { const a = (i / 3) * PI * 2; b.p('box', c2, [Math.sin(a) * 0.62, 1.0, Math.cos(a) * 0.62], [0.08, 1.3, 0.7], [0, a, 0]); }
    b.p('torus:0.12', '#9aa3ad', [0, 3.0, 0.5], [0.46, 0.46, 0.6], null, { mat: 'metal', flat: false });
    b.solo('sph', '#9fd9ff', [0, 3.0, 0.47], [0.34, 0.34, 0.12], null, { mat: 'glow', intensity: 0.9 });
    const fl = b.pivot([0, 0.2, 0]);
    b.solo('cone:10', '#ffb347', [0, -0.35, 0], [0.55, 0.9, 0.55], [PI, 0, 0], { mat: 'glow', intensity: 3, parent: fl });
    fl.visible = o.anim === 'fly' || o.anim === 'pulse' || o.anim === 'blink';
    b.rig.flame = fl;
    b.rig.top = 5.0;
  };

  R.ufo = function (b, o) {
    const c = col(o, '#b8c0c8'), light = col2(o, '#7cf2d0');
    const body = b.pivot([0, 0, 0]); b.rig.spinBody = body;
    b.p('sph', c, [0, 0, 0], [3.2, 0.62, 3.2], null, { mat: 'metal', flat: false, parent: body });
    b.p('torus:0.08', shade(c, -0.15), [0, -0.02, 0], [2.9, 2.9, 2.2], [PI / 2, 0, 0], { mat: 'metal', flat: false, parent: body });
    b.p('half', '#a8e6ff', [0, 0.2, 0], [1.5, 1.2, 1.5], null, { mat: 'glass', flat: false, parent: body });
    for (let i = 0; i < 10; i++) { const a = (i / 10) * PI * 2; b.solo('sph', light, [Math.cos(a) * 1.4, -0.08, Math.sin(a) * 1.4], 0.16, null, { mat: 'glow', intensity: 2.4, parent: body }); }
    const bm = new T.MeshBasicMaterial({ color: new T.Color(light), transparent: true, opacity: 0.16, blending: T.AdditiveBlending, depthWrite: false, fog: false });
    const beam = new T.Mesh(new T.CylinderGeometry(0.4, 1.5, 1, 20, 1, true), bm);
    beam.visible = o.anim !== 'fly';
    b.root.add(beam); b.rig.ufoBeam = beam;
    b.light([0, -0.4, 0], light, 1.2);
    b.rig.top = 0.8;
  };

  R.snowman = function (b, o) {
    const w = col(o, '#f7f8fa');
    b.p('sph', w, [0, 0.55, 0], 1.15, null, { flat: false });
    b.p('sph', w, [0, 1.35, 0], 0.85, null, { flat: false });
    b.p('sph', w, [0, 1.98, 0], 0.62, null, { flat: false });
    for (const s of [-1, 1]) b.p('sph', '#26242a', [s * 0.12, 2.06, 0.27], 0.07, null, { flat: false });
    b.p('cone:8', '#ec8a2f', [0, 1.98, 0.42], [0.12, 0.4, 0.12], [PI / 2, 0, 0]);
    for (let i = 0; i < 3; i++) b.p('sph', '#26242a', [0, 1.2 + i * 0.2, 0.41 - Math.abs(i - 1) * 0.02], 0.07, null, { flat: false });
    b.p('torus:0.14', '#d9443a', [0, 1.7, 0], [0.6, 0.6, 0.6], [PI / 2, 0, 0], { flat: false });
    b.p('box', '#d9443a', [0.2, 1.5, 0.25], [0.14, 0.4, 0.06], [0, 0, 0.2]);
    for (const s of [-1, 1]) b.p('cyl:5', '#6e4c34', [s * 0.62, 1.52, 0], [0.05, 0.8, 0.05], [0, 0, s * 1.0]);
    b.p('cyl:14', col2(o, '#26242a'), [0, 2.4, 0], [0.5, 0.4, 0.5], null, { flat: false });
    b.p('cyl:14', col2(o, '#26242a'), [0, 2.22, 0], [0.72, 0.04, 0.72], null, { flat: false });
    b.rig.top = 2.6;
  };

  // надпись рисуем на холсте: шрифт уже загружен страницей
  function textTexture(text, bg, fg) {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 200;
    const g = cv.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, 512, 200);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    let size = 92; g.font = `${size}px Prata, Georgia, serif`;
    while (g.measureText(text).width > 470 && size > 30) { size -= 4; g.font = `${size}px Prata, Georgia, serif`; }
    g.fillText(text, 256, 106);
    const tex = new T.CanvasTexture(cv); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 4;
    return tex;
  }
  R.sign = function (b, o) {
    const wood = col(o, '#b58a5a');
    b.p('box', shade(wood, -0.12), [0, 0.7, 0], [0.12, 1.4, 0.12]);
    const W = o.kind === 'arrow' ? 1.3 : 1.5;
    b.p('box', wood, [0, 1.3, 0], [W, 0.56, 0.08]);
    if (o.kind === 'arrow') b.p('pyr', wood, [W / 2 + 0.2, 1.3, 0], [0.4, 0.56, 0.08], [0, 0, -PI / 2]);
    if (o.text) {
      const mat = new T.MeshStandardMaterial({ map: textTexture(o.text, col2(o, '#f3ead5'), '#3a2e27'), roughness: 0.8 });
      b.solo(new T.PlaneGeometry(W - 0.12, 0.44), null, [0, 1.3, 0.045], [1, 1, 1], null, { material: mat, shadow: false });
      b.rig.ownMaps = [mat];
    }
    b.rig.top = 1.6;
  };

  R.flag = function (b, o) {
    b.p('cyl:8', '#c9ccd2', [0, 1.6, 0], [0.08, 3.2, 0.08], null, { mat: 'metal' });
    b.p('sph', '#d8a93a', [0, 3.22, 0], 0.12, null, { mat: 'metal', flat: false });
    const g = new T.PlaneGeometry(1.3, 0.85, 10, 4); g.translate(0.65, 0, 0);
    const m = new T.MeshStandardMaterial({ color: new T.Color(col(o, '#d9443a')), side: T.DoubleSide, roughness: 0.8 });
    const flag = b.solo(g, null, [0.04, 2.7, 0], [1, 1, 1], null, { material: m });
    flag.userData.base = Float32Array.from(g.attributes.position.array);
    b.rig.flag = flag;
    b.rig.top = 3.3;
  };

  R.umbrella = function (b, o) {
    const c = col(o, '#e2503a'), c2 = col2(o, '#f4efe4');
    b.p('cyl:6', '#f4efe4', [0, 1.1, 0], [0.07, 2.2, 0.07]);
    for (let i = 0; i < 8; i++) b.p(wedge(i, 8, 'cone'), i % 2 ? c : c2, [0, 2.15, 0], [2.6, 0.55, 2.6]);
    b.rig.top = 2.45;
  };

  R.gift = function (b, o) {
    const c = col(o, '#d9443a'), r = col2(o, '#f2c94c');
    b.p('box', c, [0, 0.28, 0], [0.62, 0.56, 0.62], null, { mat: 'glossy' });
    b.p('box', r, [0, 0.28, 0], [0.64, 0.58, 0.12]);
    b.p('box', r, [0, 0.28, 0], [0.12, 0.58, 0.64]);
    for (const s of [-1, 1]) b.p('torus:0.25', r, [s * 0.1, 0.62, 0], [0.22, 0.2, 0.2], [0, PI / 2, s * 0.6], { flat: false });
    b.rig.top = 0.7;
  };

  R.cloud = function (b, o) {
    const r = b.rnd, storm = o.kind === 'storm', c = col(o, storm ? '#7b808a' : '#ffffff');
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * PI * 2, d = i === 0 ? 0 : 0.9 + r() * 0.5;
      const s = i === 0 ? 1.9 : 1.1 + r() * 0.6;
      b.p('ico', shade(c, (r() - 0.5) * 0.05), [Math.cos(a) * d * 1.4, (i === 0 ? 0.35 : r() * 0.3), Math.sin(a) * d * 0.8], [s, s * 0.78, s], [r(), r(), 0], { mat: 'cloud', flat: false });
    }
    b.rig.top = 1.2;
  };

  R.rainbow = function (b, o) {
    const cols = ['#e8453c', '#f08a2c', '#f5d33b', '#5cb85c', '#3f8fd8', '#5a4fcf', '#8e4fc0'];
    const m = new T.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.62, depthWrite: false, fog: false });
    const geos = cols.map((c, i) => {
      const g = new T.TorusGeometry(5.2 - i * 0.24, 0.13, 6, 64, PI);
      const n = g.attributes.position.count, cc = new T.Color(c), arr = new Float32Array(n * 3);
      for (let j = 0; j < n; j++) { arr[j * 3] = cc.r; arr[j * 3 + 1] = cc.g; arr[j * 3 + 2] = cc.b; }
      g.setAttribute('color', new T.BufferAttribute(arr, 3));
      g.deleteAttribute('uv');
      return g;
    });
    const merged = THREE_ADDONS.mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    const mesh = new T.Mesh(merged, m); mesh.userData.own = true;
    b.root.add(mesh);
    b.rig.top = 5.4; b.rig.noShadow = true;
  };

  const SHAPE_GEO = { box: 'box', sphere: 'sph', cylinder: 'cyl:16', cone: 'cone:16', torus: 'torus:0.18', capsule: 'cap', pyramid: 'pyr', ring: 'torus:0.06' };
  R.custom = function (b, o) {
    let top = 0.5;
    for (const p of o.parts) {
      const size = p.shape === 'capsule' ? [p.s[0], p.s[1] / 2, p.s[2]] : p.s;
      const rot = p.r.map((d) => d * PI / 180);
      const smooth = p.shape === 'sphere' || p.shape === 'capsule' || p.shape === 'cylinder' || p.shape === 'torus' || p.shape === 'ring';
      if (p.mat === 'glow') b.solo(SHAPE_GEO[p.shape], p.color, p.p, size, rot, { mat: 'glow', intensity: 2 });
      else b.p(SHAPE_GEO[p.shape], p.color, p.p, size, rot, { mat: p.mat, flat: !smooth });
      top = Math.max(top, p.p[1] + p.s[1] / 2);
    }
    if (o.parts.some((p) => p.mat === 'glow')) b.light([0, top * 0.6, 0], o.parts.find((p) => p.mat === 'glow').color, 0.8);
    b.rig.top = top;
  };

  S3.recipes.wedge = wedge;
})();
