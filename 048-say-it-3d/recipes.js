/* ================================================================
   Рецепты, часть 1: строитель из примитивов + природа и постройки.
   Каждый рецепт собирает объект из параметрических примитивов.
   Неподвижные детали сливаются в один меш на материал (мало draw calls),
   подвижные (крылья, ноги, луч маяка) висят на своих шарнирах.
   ================================================================ */
window.S3 = window.S3 || {};
(function () {
  'use strict';
  if (!window.THREE) return;
  const T = THREE;
  const { mergeGeometries } = THREE_ADDONS;
  const PI = Math.PI;

  // ---------- детерминированный случай: одинаковый id → одинаковое дерево ----------
  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- кэш геометрий единичного размера ----------
  const GEO_CACHE = new Map();
  function prismGeo() {
    const sh = new T.Shape();
    sh.moveTo(-0.5, 0); sh.lineTo(0.5, 0); sh.lineTo(0, 1); sh.lineTo(-0.5, 0);
    const g = new T.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false });
    g.translate(0, 0, -0.5);
    return g;
  }
  function GEO(key) {
    let g = GEO_CACHE.get(key);
    if (g) return g;
    const [name, a, b] = key.split(':');
    switch (name) {
      case 'box': g = new T.BoxGeometry(1, 1, 1); break;
      case 'sph': g = new T.SphereGeometry(0.5, 18, 12); break;
      case 'sphLo': g = new T.SphereGeometry(0.5, 10, 7); break;
      case 'ico': g = new T.IcosahedronGeometry(0.5, 1); break;
      case 'ico0': g = new T.IcosahedronGeometry(0.5, 0); break;
      case 'dod': g = new T.DodecahedronGeometry(0.5, 0); break;
      case 'oct': g = new T.OctahedronGeometry(0.5, 0); break;
      case 'cyl': g = new T.CylinderGeometry(0.5, 0.5, 1, +a || 16); break;
      case 'cylT': g = new T.CylinderGeometry(0.5 * (+a), 0.5, 1, +b || 14); break; // сужение вверх
      case 'cone': g = new T.ConeGeometry(0.5, 1, +a || 16); break;
      case 'pyr': g = new T.ConeGeometry(Math.SQRT1_2, 1, 4); g.rotateY(PI / 4); break;
      case 'torus': g = new T.TorusGeometry(0.5, +a || 0.12, 8, 28); break;
      case 'arc': g = new T.TorusGeometry(0.5, +a || 0.1, 6, 24, PI); break;
      case 'half': g = new T.SphereGeometry(0.5, 18, 8, 0, PI * 2, 0, PI / 2); break;
      case 'cap': g = new T.CapsuleGeometry(0.5, 1, 6, 12); break;
      case 'prism': g = prismGeo(); break;
      case 'disc': g = new T.CylinderGeometry(0.5, 0.5, 1, 28); break;
      case 'halfcyl': g = new T.CylinderGeometry(0.5, 0.5, 1, 14, 1, false, PI / 2, PI); break;
      default: g = new T.BoxGeometry(1, 1, 1);
    }
    g.userData.shared = true;
    GEO_CACHE.set(key, g);
    return g;
  }

  // ---------- общие материалы (вершинные цвета) ----------
  const MAT_CACHE = new Map();
  const SHARED = {
    // окна: светятся ночью, яркость задаёт мир
    window: new T.MeshStandardMaterial({ color: 0x3a3226, emissive: 0xffc46b, emissiveIntensity: 0, roughness: 0.4 }),
  };
  SHARED.window.userData.shared = true;
  function sharedMat(kind, flat) {
    const key = kind + (flat ? ':f' : ':s');
    let m = MAT_CACHE.get(key);
    if (m) return m;
    const base = { vertexColors: true, flatShading: !!flat };
    if (kind === 'glossy') m = new T.MeshStandardMaterial({ ...base, roughness: 0.32, metalness: 0.05 });
    else if (kind === 'metal') m = new T.MeshStandardMaterial({ ...base, roughness: 0.3, metalness: 0.85 });
    else if (kind === 'glass') m = new T.MeshStandardMaterial({ ...base, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.42, depthWrite: false });
    else if (kind === 'water') m = new T.MeshStandardMaterial({ ...base, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.82 });
    else if (kind === 'cloud') m = new T.MeshStandardMaterial({ ...base, roughness: 1, metalness: 0, emissive: 0xb4bcc8, emissiveIntensity: 0.4 });
    else m = new T.MeshStandardMaterial({ ...base, roughness: 0.86, metalness: 0 });
    m.userData.shared = true;
    MAT_CACHE.set(key, m);
    return m;
  }

  const _m = new T.Matrix4(), _q = new T.Quaternion(), _e = new T.Euler(), _v = new T.Vector3(), _s = new T.Vector3();

  /* Строитель: копит детали и сливает их. rig — ссылки для анимации. */
  class Builder {
    constructor(o) {
      this.o = o;
      this.root = new T.Group();           // всё, что масштабируется вместе с объектом
      this.rnd = rng(hash(o.id + ':' + o.type + ':' + o.kind));
      this.buckets = new Map();
      this.rig = { glow: [], lights: [], legs: [], arms: [], wings: [], parts: [], smoke: null, top: null, porch: null, beam: null };
    }
    // деталь: ключ геометрии, цвет, позиция, размер, поворот (радианы)
    p(geo, color, pos, size, rot, opt) {
      if (rot && !Array.isArray(rot)) { opt = rot; rot = null; } // защита от сдвинутых аргументов
      opt = opt || {};
      const parent = opt.parent || this.root;
      let mat = opt.mat || 'matte';
      if (mat === 'glow' || mat === 'window') return this.solo(geo, color, pos, size, rot, opt);
      const flat = opt.flat !== undefined ? opt.flat : true;
      const key = parent.uuid + '|' + mat + '|' + (flat ? 1 : 0);
      let b = this.buckets.get(key);
      if (!b) { b = { parent, mat, flat, list: [] }; this.buckets.set(key, b); }
      const c = new T.Color(color);
      if (opt.jitter) c.offsetHSL((this.rnd() - 0.5) * opt.jitter * 0.1, 0, (this.rnd() - 0.5) * opt.jitter);
      b.list.push({ geo: typeof geo === 'string' ? GEO(geo) : geo, pos, size, rot, c });
      return b;
    }
    // отдельный меш: светящиеся детали, окна и всё, чему нужен свой материал
    solo(geo, color, pos, size, rot, opt) {
      opt = opt || {};
      const parent = opt.parent || this.root;
      let mat;
      if (opt.mat === 'window') mat = SHARED.window;
      else if (opt.mat === 'glow') {
        mat = new T.MeshStandardMaterial({ color: 0x000000, emissive: new T.Color(color), emissiveIntensity: opt.intensity || 2.2, roughness: 0.5 });
        mat.userData.base = opt.intensity || 2.2;
        mat.userData.night = !!opt.night; // светится только в темноте (фонари, окна)
        this.rig.glow.push(mat);
      } else if (opt.material) mat = opt.material;
      else mat = new T.MeshStandardMaterial({ color: new T.Color(color), roughness: 0.8 });
      const mesh = new T.Mesh(typeof geo === 'string' ? GEO(geo) : geo, mat);
      place(mesh, pos, size, rot);
      mesh.castShadow = opt.shadow !== false && opt.mat !== 'glow';
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    }
    // шарнир для анимации
    pivot(pos, parent) {
      const g = new T.Group();
      if (pos) g.position.set(pos[0], pos[1], pos[2]);
      (parent || this.root).add(g);
      return g;
    }
    light(pos, color, power, opt) { this.rig.lights.push({ pos: new T.Vector3(pos[0], pos[1], pos[2]), color: new T.Color(color), power: power || 1, flicker: !!(opt && opt.flicker), night: !!(opt && opt.night), parent: (opt && opt.parent) || null }); }
    done() {
      for (const b of this.buckets.values()) {
        const geos = b.list.map(({ geo, pos, size, rot, c }) => {
          let g = geo.index ? geo.toNonIndexed() : geo.clone();
          _e.set(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0);
          _q.setFromEuler(_e);
          _v.set(pos[0], pos[1], pos[2]);
          if (typeof size === 'number') _s.set(size, size, size); else _s.set(size[0], size[1], size[2]);
          _m.compose(_v, _q, _s);
          g.applyMatrix4(_m);
          const n = g.attributes.position.count, col = new Float32Array(n * 3);
          for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
          g.setAttribute('color', new T.BufferAttribute(col, 3));
          for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k);
          g.morphAttributes = {};
          return g;
        });
        const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
        if (geos.length > 1) geos.forEach((g) => g.dispose());
        // исходники, созданные под этот объект (не из кэша), больше не нужны
        for (const it of b.list) if (!it.geo.userData.shared) it.geo.dispose();
        if (!merged) continue;
        const mesh = new T.Mesh(merged, sharedMat(b.mat, b.flat));
        mesh.castShadow = b.mat !== 'glass' && b.mat !== 'water';
        mesh.receiveShadow = true;
        mesh.userData.own = true; // геометрия своя — освободить при удалении
        b.parent.add(mesh);
      }
      this.buckets.clear();
      return this.root;
    }
  }
  function place(mesh, pos, size, rot) {
    mesh.position.set(pos[0], pos[1], pos[2]);
    if (typeof size === 'number') mesh.scale.setScalar(size); else mesh.scale.set(size[0], size[1], size[2]);
    if (rot) mesh.rotation.set(rot[0], rot[1], rot[2]);
  }

  const col = (o, d) => o.color || d;
  const col2 = (o, d) => o.color2 || d;
  const shade = (hex, l) => { const c = new T.Color(hex); c.offsetHSL(0, 0, l); return '#' + c.getHexString(); };
  const R = {}; // рецепты: R[type](b, o)

  // ============ ПРИРОДА ============
  const LEAF = { oak: '#5f9d43', apple: '#6aa84a', birch: '#8cc15a', pine: '#2f6d4a', fir: '#285f45', palm: '#4f9e4a', sakura: '#f2a9c4', autumn: '#e0913a', dead: '#6b5444' };
  R.tree = function (b, o) {
    const k = o.kind, r = b.rnd;
    const sw = b.pivot([0, 0, 0]); b.rig.sway = sw;
    const trunkC = k === 'birch' ? '#efeae0' : k === 'palm' ? '#a07a52' : k === 'dead' ? '#5d4a3c' : '#7a5238';
    const leaf = col(o, LEAF[k] || LEAF.oak);
    if (k === 'pine' || k === 'fir') {
      b.p('cylT:0.6:7', trunkC, [0, 0.55, 0], [0.34, 1.1, 0.34], null, { parent: sw });
      const layers = k === 'fir' ? 4 : 3;
      for (let i = 0; i < layers; i++) {
        const w = (k === 'fir' ? 2.5 : 2.2) - i * 0.5, y = 1.0 + i * (k === 'fir' ? 0.72 : 0.85);
        b.p('cone:8', leaf, [0, y + 0.7, 0], [w, 1.6, w], [0, r() * 3, 0], { parent: sw, jitter: 0.06 });
      }
      b.rig.top = 1.0 + layers * 0.8 + 0.8;
    } else if (k === 'palm') {
      let x = 0, y = 0; const lean = 0.18 + r() * 0.1;
      for (let i = 0; i < 6; i++) {
        b.p('cylT:0.85:7', i % 2 ? trunkC : shade(trunkC, -0.06), [x, y + 0.35, 0], [0.34 - i * 0.02, 0.72, 0.34 - i * 0.02], [0, 0, -lean * i * 0.35], { parent: sw });
        x += Math.sin(lean * i * 0.35) * 0.7; y += Math.cos(lean * i * 0.35) * 0.7;
      }
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * PI * 2 + r();
        const fr = b.pivot([x, y, 0], sw); fr.rotation.set(0, a, 0);
        b.p('box', shade(leaf, (r() - 0.5) * 0.08), [0.9, -0.2, 0], [1.9, 0.06, 0.42], [0, 0, -0.45], { parent: fr });
      }
      for (let i = 0; i < 3; i++) b.p('sph', '#6b4a2e', [x + Math.cos(i * 2.1) * 0.22, y - 0.18, Math.sin(i * 2.1) * 0.22], 0.26, null, { parent: sw, flat: false });
      b.rig.top = y + 0.3;
    } else if (k === 'dead') {
      b.p('cylT:0.55:7', trunkC, [0, 1.1, 0], [0.42, 2.2, 0.42], null, { parent: sw });
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * PI * 2 + r(), h = 1.2 + r() * 1.0;
        b.p('cylT:0.4:5', trunkC, [Math.cos(a) * 0.35, h + 0.3, Math.sin(a) * 0.35], [0.14, 1.1, 0.14], [Math.sin(a) * 0.8, 0, -Math.cos(a) * 0.8], { parent: sw });
      }
      b.rig.top = 2.6;
    } else {
      const tall = k === 'birch' ? 1.5 : 1;
      b.p('cylT:0.62:8', trunkC, [0, 0.8 * tall, 0], [0.36 * (k === 'birch' ? 0.8 : 1), 1.6 * tall, 0.36], null, { parent: sw });
      if (k === 'birch') for (let i = 0; i < 6; i++) b.p('box', '#2e2a28', [0, 0.35 + i * 0.38, 0.14], [0.14, 0.05, 0.05], [0, r() * PI, 0], { parent: sw });
      const blobs = k === 'birch' ? 5 : 6, cy = 2.3 * tall + (k === 'birch' ? 0.2 : 0);
      const rad = k === 'birch' ? 0.95 : 1.25;
      b.p('ico', leaf, [0, cy, 0], rad * 1.7, [r(), r(), 0], { parent: sw, jitter: 0.07 });
      for (let i = 0; i < blobs; i++) {
        const a = (i / blobs) * PI * 2 + r(), rr = rad * (0.62 + r() * 0.2);
        b.p('ico', leaf, [Math.cos(a) * rr, cy + (r() - 0.35) * 0.9, Math.sin(a) * rr], rad * (0.9 + r() * 0.35), [r(), r(), 0], { parent: sw, jitter: 0.09 });
      }
      if (k === 'apple') for (let i = 0; i < 10; i++) {
        const a = r() * PI * 2, e = (r() - 0.3) * 1.1, rr = rad * 1.18;
        b.p('sph', i % 4 ? '#d8392f' : '#e8b33c', [Math.cos(a) * Math.cos(e) * rr, cy + Math.sin(e) * rr * 0.8, Math.sin(a) * Math.cos(e) * rr], 0.2, null, { parent: sw, flat: false });
      }
      if (k === 'sakura') for (let i = 0; i < 7; i++) b.p('cyl:10', '#f6c5d6', [(r() - 0.5) * 2.4, 0.015, (r() - 0.5) * 2.4], [0.28, 0.02, 0.28]);
      b.rig.top = cy + rad;
    }
  };

  R.bush = function (b, o) {
    const r = b.rnd, c = col(o, o.kind === 'rose' ? '#4f8a3e' : '#5a9a45');
    const sw = b.pivot(); b.rig.sway = sw;
    for (let i = 0; i < 4; i++) {
      const a = i * 1.9 + r();
      b.p('ico', c, [Math.cos(a) * 0.32, 0.38 + r() * 0.15, Math.sin(a) * 0.32], 0.62 + r() * 0.25, [r(), r(), 0], { parent: sw, jitter: 0.08 });
    }
    if (o.kind !== 'round') {
      const berry = o.kind === 'rose' ? col2(o, '#e2476b') : col2(o, '#c7304a');
      for (let i = 0; i < 9; i++) { const a = r() * PI * 2; b.p('sph', berry, [Math.cos(a) * 0.55, 0.3 + r() * 0.45, Math.sin(a) * 0.55], o.kind === 'rose' ? 0.16 : 0.1, null, { parent: sw, flat: false }); }
    }
    b.rig.top = 0.9;
  };

  R.flowers = function (b, o) {
    const r = b.rnd, k = o.kind;
    const palette = o.color ? [o.color, shade(o.color, 0.12), shade(o.color, -0.08)] : k === 'tulips' ? ['#e04b4b', '#f2c94c', '#ef8fb1'] : k === 'sunflowers' ? ['#f2c230'] : ['#f4f1ea', '#f2c94c', '#ef8fb1', '#9a7fd6', '#e0643c'];
    const n = k === 'sunflowers' ? 5 : 14;
    for (let i = 0; i < n; i++) {
      const a = r() * PI * 2, d = Math.sqrt(r()) * (k === 'sunflowers' ? 0.7 : 0.95), x = Math.cos(a) * d, z = Math.sin(a) * d;
      const h = k === 'sunflowers' ? 1.3 + r() * 0.4 : 0.25 + r() * 0.2;
      b.p('cyl:5', '#4f8a3e', [x, h / 2, z], [0.04, h, 0.04]);
      const c = palette[i % palette.length];
      if (k === 'sunflowers') { b.p('cyl:12', c, [x, h, z + 0.05], [0.5, 0.06, 0.5], [PI / 2 - 0.3, 0, 0]); b.p('cyl:10', '#5b3a22', [x, h + 0.02, z + 0.09], [0.22, 0.06, 0.22], [PI / 2 - 0.3, 0, 0]); }
      else if (k === 'tulips') b.p('cone:6', c, [x, h + 0.08, z], [0.16, 0.22, 0.16], [PI, 0, 0]);
      else b.p('ico0', c, [x, h + 0.04, z], [0.17, 0.1, 0.17]);
    }
    b.rig.top = 0.3;
  };

  R.grass = function (b, o) {
    const r = b.rnd, reeds = o.kind === 'reeds';
    const c = col(o, reeds ? '#7a9a4a' : '#6fa84c');
    const sw = b.pivot(); b.rig.sway = sw;
    for (let i = 0; i < (reeds ? 9 : 12); i++) {
      const a = r() * PI * 2, d = r() * 0.6, h = reeds ? 0.9 + r() * 0.7 : 0.25 + r() * 0.25;
      b.p('cone:4', shade(c, (r() - 0.5) * 0.1), [Math.cos(a) * d, h / 2, Math.sin(a) * d], [0.07, h, 0.07], [(r() - 0.5) * 0.3, 0, (r() - 0.5) * 0.3], { parent: sw });
      if (reeds && i % 2 === 0) b.p('cap', '#6b4630', [Math.cos(a) * d, h + 0.05, Math.sin(a) * d], [0.06, 0.1, 0.06], null, { parent: sw, flat: false });
    }
    b.rig.top = 0.4;
  };

  function jagged(b, rnd, detail) {
    const g = new T.IcosahedronGeometry(0.5, detail || 0);
    const pos = g.attributes.position;
    const seen = new Map();
    for (let i = 0; i < pos.count; i++) {
      const key = pos.getX(i).toFixed(3) + pos.getY(i).toFixed(3) + pos.getZ(i).toFixed(3);
      let k = seen.get(key); if (k === undefined) { k = 0.8 + rnd() * 0.4; seen.set(key, k); }
      pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k, pos.getZ(i) * k);
    }
    g.computeVertexNormals();
    return g;
  }

  R.rock = function (b, o) {
    const r = b.rnd, k = o.kind;
    if (k === 'crystal') {
      const c = col(o, '#7fe3e8');
      for (let i = 0; i < 5; i++) {
        const a = i * 1.26 + r(), h = 0.7 + r() * 1.1;
        b.solo('oct', c, [Math.cos(a) * 0.3 * (i ? 1 : 0), h * 0.45, Math.sin(a) * 0.3 * (i ? 1 : 0)], [0.32, h, 0.32], [Math.cos(a) * 0.35 * (i ? 1 : 0), r(), Math.sin(a) * 0.35 * (i ? 1 : 0)], { mat: 'glow', intensity: 1.3 });
      }
      b.light([0, 0.8, 0], c, 0.7);
      b.rig.top = 1.4; return;
    }
    const c = col(o, '#8d8a84');
    const flat = k === 'flat';
    b.p(jagged(b, r, 0), c, [0, flat ? 0.2 : 0.42, 0], flat ? [1.6, 0.5, 1.3] : [1.3, 1.0, 1.15], [r(), r() * 3, r()], { jitter: 0.05 });
    b.p(jagged(b, r, 0), shade(c, -0.05), [0.55, 0.2, 0.25], [0.6, 0.45, 0.55], [r(), r(), r()]);
    b.rig.top = flat ? 0.42 : 0.88;
  };

  R.cliff = function (b, o) {
    const r = b.rnd, h = o.n || 3, c = col(o, o.kind === 'sand' ? '#c9a878' : '#8a847c');
    const layers = Math.max(2, Math.round(h / 0.9));
    for (let i = 0; i < layers; i++) {
      const y = (i + 0.5) * (h / layers), w = 3.2 - (i / layers) * 0.9;
      b.p(jagged(b, r, 1), shade(c, (r() - 0.5) * 0.08), [(r() - 0.5) * 0.3, y, (r() - 0.5) * 0.3], [w, h / layers * 1.35, w * 0.92], [0, r() * PI, 0]);
    }
    // плоская вершина с дёрном
    b.p('cyl:9', col2(o, '#6fa04c'), [0, h + 0.05, 0], [2.5, 0.22, 2.4], [0, r(), 0]);
    b.rig.top = h + 0.16;
  };

  R.mountain = function (b, o) {
    const r = b.rnd, k = o.kind;
    if (k === 'green') {
      b.p('ico', col(o, '#6da24f'), [0, 0.2, 0], [6, 3.4, 5.6], [0, r() * 3, 0], { jitter: 0.04 });
      b.rig.top = 1.9; return;
    }
    const c = col(o, k === 'volcano' ? '#5b4a44' : '#8b8680');
    b.p('cone:7', c, [0, 2.6, 0], [6.4, 5.2, 6.0], [0, r() * 3, 0]);
    b.p('cone:7', shade(c, -0.06), [1.8, 1.4, 0.8], [3.4, 2.8, 3.2], [0, r() * 3, 0]);
    if (k === 'volcano') {
      b.p('cylT:0.8:7', shade(c, -0.1), [0, 4.9, 0], [1.9, 0.8, 1.9]);
      b.solo('cyl:12', '#ff6a2b', [0, 5.3, 0], [1.3, 0.1, 1.3], null, { mat: 'glow', intensity: 3 });
      b.light([0, 5.6, 0], '#ff7a3a', 1.2, { flicker: true });
      b.rig.smoke = [0, 5.4, 0]; b.rig.smokeBig = true;
      b.rig.top = 5.3;
    } else {
      b.p('cone:7', col2(o, '#f5f6f8'), [0, 4.35, 0], [2.6, 1.75, 2.45], [0, 0.3, 0]);
      b.rig.top = 5.2;
    }
  };

  R.mushroom = function (b, o) {
    const am = o.kind === 'amanita';
    b.p('cylT:0.8:10', '#f1ead9', [0, 0.2, 0], [0.22, 0.4, 0.22], null, { flat: false });
    b.p('half', col(o, am ? '#d8392f' : '#8a5a36'), [0, 0.36, 0], [0.62, 0.42, 0.62], null, { flat: false });
    if (am) for (let i = 0; i < 6; i++) { const a = i * 1.05; b.p('sph', '#fbf7ee', [Math.cos(a) * 0.2, 0.5, Math.sin(a) * 0.2], 0.06, null, { flat: false }); }
    b.rig.top = 0.55;
  };

  R.stump = function (b, o) {
    const c = col(o, '#7a5238');
    if (o.kind === 'log') {
      b.p('cyl:9', c, [0, 0.3, 0], [0.6, 1.9, 0.6], [0, 0, PI / 2]);
      b.p('cyl:9', '#d9b98a', [0.96, 0.3, 0], [0.5, 0.02, 0.5], [0, 0, PI / 2]);
      b.p('cyl:9', '#d9b98a', [-0.96, 0.3, 0], [0.5, 0.02, 0.5], [0, 0, PI / 2]);
      b.rig.top = 0.6; return;
    }
    b.p('cylT:0.85:9', c, [0, 0.25, 0], [0.8, 0.5, 0.8]);
    b.p('cyl:12', '#d9b98a', [0, 0.51, 0], [0.64, 0.02, 0.64]);
    for (let i = 0; i < 4; i++) { const a = i * 1.57 + 0.4; b.p('cone:5', c, [Math.cos(a) * 0.4, 0.08, Math.sin(a) * 0.4], [0.18, 0.3, 0.18], [Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2]); }
    b.rig.top = 0.52;
  };

  R.pond = function (b, o) {
    const r = b.rnd;
    b.p('cyl:28', '#6a7f62', [0, 0.02, 0], [4.4, 0.04, 3.8]);
    b.solo('cyl:28', col(o, '#4d95b8'), [0, 0.06, 0], [4.1, 0.04, 3.5], null, { material: S3.recipes.waterMat });
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * PI * 2 + r() * 0.2;
      b.p('dod', shade('#9a958c', (r() - 0.5) * 0.12), [Math.cos(a) * 2.1, 0.08, Math.sin(a) * 1.82], 0.28 + r() * 0.16, [r(), r(), r()]);
    }
    if (o.kind === 'lilies') for (let i = 0; i < 5; i++) {
      const a = r() * PI * 2, d = 0.4 + r() * 1.1;
      b.p('cyl:10', '#5d9a4a', [Math.cos(a) * d, 0.09, Math.sin(a) * d * 0.85], [0.42, 0.02, 0.42]);
      if (i % 2 === 0) b.p('cone:6', '#f7d6e2', [Math.cos(a) * d, 0.16, Math.sin(a) * d * 0.85], [0.14, 0.12, 0.14], [PI, 0, 0]);
    }
    b.rig.top = 0.09; b.rig.waterTop = true;
  };

  // ============ ПОСТРОЙКИ ============
  function gableRoof(b, w, d, y, h, c, over, parent) {
    const slope = Math.hypot(w / 2 + over, h), ang = Math.atan2(h, w / 2);
    b.p('prism', shade(c.wall, -0.03), [0, y, 0], [w, h, d], null, { parent });
    for (const s of [-1, 1]) b.p('box', c.roof, [s * (w / 4 - over / 2 + 0.02), y + h / 2 + 0.06, 0], [slope + 0.02, 0.14, d + over * 2], [0, 0, -s * ang], { parent, jitter: 0.03 });
    b.p('box', shade(c.roof, -0.08), [0, y + h + 0.08, 0], [0.24, 0.16, d + over * 2 + 0.02], null, { parent });
  }
  function windowAt(b, x, y, z, rotY, frame, w, h) {
    w = w || 0.52; h = h || 0.62;
    b.solo('box', '#ffcf7a', [x, y, z], [w, h, 0.06], [0, rotY, 0], { mat: 'window' });
    const fx = Math.cos(rotY), fz = -Math.sin(rotY), nx = Math.sin(rotY) * 0.03, nz = Math.cos(rotY) * 0.03;
    b.p('box', frame, [x + nx, y, z + nz], [0.07, h + 0.1, 0.06], [0, rotY, 0]);
    b.p('box', frame, [x + nx, y, z + nz], [w + 0.1, 0.07, 0.06], [0, rotY, 0]);
    b.p('box', frame, [x + nx - fx * 0.0, y - h / 2 - 0.06, z + nz], [w + 0.22, 0.09, 0.14], [0, rotY, 0]);
    b.p('box', frame, [x + nx, y + h / 2 + 0.05, z + nz], [w + 0.16, 0.08, 0.1], [0, rotY, 0]);
    void fx; void fz;
  }

  R.house = function (b, o) {
    const k = o.kind, r = b.rnd, floors = o.n || 1;
    const DEF = {
      izba: { wall: '#9b6a3f', roof: '#5d6f45', trim: '#f3ecdc' }, cottage: { wall: '#efe2c6', roof: '#c4533a', trim: '#ffffff' },
      modern: { wall: '#f2efe8', roof: '#3d3f45', trim: '#3d3f45' }, castle: { wall: '#b9b2a6', roof: '#4b5f8f', trim: '#8f877b' },
      barn: { wall: '#b2452f', roof: '#51453f', trim: '#f4efe4' }, shop: { wall: '#f0d9a8', roof: '#3e7a6e', trim: '#ffffff' }, tower: { wall: '#d8cdb8', roof: '#8e3b35', trim: '#f4efe4' },
    }[k] || { wall: '#efe2c6', roof: '#c4533a', trim: '#fff' };
    const c = { wall: col(o, DEF.wall), roof: col2(o, DEF.roof), trim: DEF.trim };
    const fh = 1.7;
    if (k === 'tower') {
      const H = 2.8 + floors * 1.3;
      b.p('cylT:0.88:12', c.wall, [0, H / 2, 0], [2.4, H, 2.4]);
      b.p('cone:12', c.roof, [0, H + 1.1, 0], [2.9, 2.2, 2.9]);
      for (let i = 0; i < floors + 1; i++) { const a = i * 1.3 + 0.2; windowAt(b, Math.sin(a) * 1.13, 1.2 + i * 1.3, Math.cos(a) * 1.13, a, c.trim, 0.36, 0.56); }
      b.solo('box', '#4a3426', [0, 0.6, 1.2], [0.7, 1.2, 0.12]);
      b.rig.top = H + 2.2; b.rig.porch = [0.9, 0, 1.6]; return;
    }
    if (k === 'castle') {
      const H = 2.6 + floors * 0.8;
      b.p('box', c.wall, [0, H / 2, 0], [3.6, H, 3.0], null, { jitter: 0.03 });
      for (let i = -3; i <= 3; i++) for (const zz of [-1.45, 1.45]) if (i % 2 === 0) b.p('box', c.wall, [i * 0.5, H + 0.2, zz], [0.42, 0.4, 0.28]);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        b.p('cyl:10', shade(c.wall, 0.03), [sx * 1.9, (H + 1) / 2, sz * 1.5], [1.2, H + 1, 1.2]);
        b.p('cone:10', c.roof, [sx * 1.9, H + 1.9, sz * 1.5], [1.5, 1.8, 1.5]);
        b.solo('box', '#ffcf7a', [sx * 1.9, H - 0.2, sz * 1.5 + sz * 0.58], [0.2, 0.4, 0.06], null, { mat: 'window' });
      }
      b.p('box', '#3a2e27', [0, 0.75, 1.52], [1.0, 1.5, 0.08]);
      b.p('cyl:14', '#3a2e27', [0, 1.5, 1.52], [1.0, 0.08, 1.0], [PI / 2, 0, 0]);
      b.p('cyl:6', '#6d5e52', [0, H + 2.2, 0], [0.05, 1.2, 0.05]);
      b.p('box', col2(o, '#c7423a'), [0.28, H + 2.6, 0], [0.5, 0.32, 0.03]);
      for (let i = 0; i < floors; i++) windowAt(b, -1.0 + i * 0.9, 1.9 + i * 0.7, 1.51, 0, c.trim, 0.34, 0.5);
      b.rig.top = H + 2.8; b.rig.porch = [1.2, 0, 2.0]; return;
    }
    const W = k === 'barn' ? 3.4 : k === 'modern' ? 3.6 : 3.0, D = k === 'barn' ? 3.2 : 2.7, H = fh * floors + (k === 'izba' ? 0.1 : 0);
    // фундамент и стены
    b.p('box', '#8b8378', [0, 0.12, 0], [W + 0.2, 0.24, D + 0.2]);
    b.p('box', c.wall, [0, 0.24 + H / 2, 0], [W, H, D], null, { jitter: 0.02 });
    if (k === 'izba') for (let i = 0; i < 7 * floors; i++) {
      const y = 0.36 + i * (H / (7 * floors));
      b.p('cyl:7', shade(c.wall, (i % 2 ? -0.04 : 0.02)), [0, y, D / 2 + 0.02], [0.2, W + 0.22, 0.2], [0, 0, PI / 2]);
      b.p('cyl:7', shade(c.wall, (i % 2 ? -0.04 : 0.02)), [W / 2 + 0.02, y, 0], [0.2, D + 0.22, 0.2], [PI / 2, 0, 0]);
      b.p('cyl:7', shade(c.wall, (i % 2 ? -0.04 : 0.02)), [-W / 2 - 0.02, y, 0], [0.2, D + 0.22, 0.2], [PI / 2, 0, 0]);
    }
    const top = 0.24 + H;
    if (k === 'modern') {
      b.p('box', c.roof, [0, top + 0.1, 0], [W + 0.5, 0.2, D + 0.5]);
      b.p('box', '#b98a5e', [W / 2 - 0.6, 0.24 + H / 2, D / 2 + 0.02], [1.0, H, 0.06]);
      for (let f = 0; f < floors; f++) b.solo('box', '#ffcf7a', [-0.5, 0.24 + fh * f + fh * 0.5, D / 2 + 0.03], [1.8, fh * 0.62, 0.05], null, { mat: 'window' });
      b.rig.top = top + 0.2;
    } else {
      gableRoof(b, W, D, top, k === 'barn' ? 1.5 : 1.3, c, 0.3);
      b.rig.top = top + 1.45;
      // окна по фасаду и бокам
      for (let f = 0; f < floors; f++) {
        const y = 0.24 + fh * f + fh * 0.55;
        if (k === 'barn') { if (f === 0) continue; }
        const xs = f === 0 ? [-W / 2 + 0.62, W / 2 - 0.62] : [-W / 2 + 0.62, 0, W / 2 - 0.62];
        for (const x of xs) windowAt(b, x, y, D / 2 + 0.04, 0, c.trim);
        windowAt(b, W / 2 + 0.04, y, 0, PI / 2, c.trim);
        windowAt(b, -W / 2 - 0.04, y, 0, -PI / 2, c.trim);
      }
      windowAt(b, 0, top + 0.5, D / 2 + 0.04, 0, c.trim, 0.36, 0.4);
      // труба
      if (k !== 'barn') { b.p('box', '#8e5a45', [W / 4 + 0.2, top + 1.1, -0.4], [0.36, 1.0, 0.36]); b.rig.smoke = [W / 4 + 0.2, top + 1.7, -0.4]; }
    }
    // дверь, крыльцо
    if (k === 'barn') {
      b.p('box', shade(c.wall, -0.12), [0, 0.24 + 0.95, D / 2 + 0.03], [1.5, 1.9, 0.06]);
      b.p('box', c.trim, [0, 0.24 + 0.95, D / 2 + 0.07], [1.5, 0.1, 0.04], [0, 0, 0.9]);
      b.p('box', c.trim, [0, 0.24 + 0.95, D / 2 + 0.07], [1.5, 0.1, 0.04], [0, 0, -0.9]);
      b.rig.porch = [1.2, 0, D / 2 + 0.8];
    } else {
      const dx = k === 'modern' ? W / 2 - 0.6 : 0;
      b.solo('box', '#5a3b2a', [dx, 0.24 + 0.62, D / 2 + 0.04], [0.62, 1.2, 0.06]);
      b.p('sph', '#d8a93a', [dx + 0.2, 0.24 + 0.6, D / 2 + 0.09], 0.07, null, { flat: false });
      if (k === 'izba' || k === 'cottage') {
        b.p('box', '#8a6446', [dx, 0.2, D / 2 + 0.55], [1.5, 0.4, 0.9]);
        b.p('box', '#8a6446', [dx, 0.08, D / 2 + 1.1], [1.5, 0.16, 0.3]);
        for (const s of [-1, 1]) b.p('box', '#6e4c34', [dx + s * 0.68, 0.95, D / 2 + 0.92], [0.1, 1.5, 0.1]);
        b.p('prism', c.roof, [dx, 1.7, D / 2 + 0.55], [1.7, 0.45, 1.1]);
        b.rig.porch = [dx + 0.45, 0.4, D / 2 + 0.6];
      } else b.rig.porch = [dx + 0.8, 0, D / 2 + 0.7];
      if (k === 'shop') {
        for (let i = 0; i < 6; i++) b.p('box', i % 2 ? '#ffffff' : col2(o, '#3e7a6e'), [-W / 2 + 0.25 + i * (W / 6), 1.95, D / 2 + 0.45], [W / 6 + 0.01, 0.06, 0.9], [0.35, 0, 0]);
        b.solo('box', '#ffcf7a', [-0.6, 0.95, D / 2 + 0.04], [1.2, 0.8, 0.05], null, { mat: 'window' });
      }
    }
  };

  const waterMat = new T.MeshStandardMaterial({ color: 0x4d95b8, roughness: 0.1, metalness: 0.15, transparent: true, opacity: 0.85 });
  waterMat.userData.shared = true;
  S3.recipes = { R, Builder, GEO, rng, hash, shade, col, col2, sharedMat, SHARED, jagged, windowAt, gableRoof, waterMat };
})();
