// ───────────────────────────────────────────────────────────────────────────
//  «Лисий дом» — лиса: воксельная кукла на суставах, позы, дорожки ключей.
//  Единица модели — «лисий воксель» (0,25 кубика мира). Лиса смотрит в +z.
// ───────────────────────────────────────────────────────────────────────────
window.FoxRig = function (THREE, W) {
  'use strict';
  const S = window.STORY;
  const { clamp, lerp, E } = S;
  const FV = 0.25;

  const C = {
    or: '#E0702A', or2: '#EC8637', or3: '#C95B22', cr: '#F5E8D3', cr2: '#E9D8BE',
    dk: '#2B211E', nose: '#16110F', eye: '#140F0D', white: '#FFFFFF', tongue: '#D4524C',
    iron: '#5B5F66', handle: '#9A6A3E',
  };
  const h2 = (a, b) => { const s = Math.sin(a * 91.7 + b * 47.3) * 43758.5; return s - Math.floor(s); };

  // Часть тела: группа-сустав и её воксели (InstancedMesh)
  function part(parent, name, pivot, build, mat) {
    const g = new THREE.Group(); g.name = name;
    g.position.set(pivot[0], pivot[1], pivot[2]);
    const vb = new W.VoxBatch(name, mat || W.MAT.fox);
    build((x, y, z, c, sx, sy, sz) => vb.add(x, y, z, new THREE.Color(c).multiplyScalar(1 + (h2(x + y, z) - 0.5) * 0.08), [0, 0, 0], sx || 1, sy || 1, sz || 1));
    if (vb.count) g.add(vb.build());
    parent.add(g);
    return g;
  }
  const box = (add, xs, ys, zs, colorFn, skip) => {
    for (const x of xs) for (const y of ys) for (const z of zs) {
      if (skip && skip(x, y, z)) continue;
      add(x, y, z, colorFn(x, y, z));
    }
  };
  const R = (a, b) => { const r = []; for (let v = a; v <= b + 1e-6; v++) r.push(v); return r; };

  // ── Сборка куклы ─────────────────────────────────────────────────────────
  function build() {
    const J = {};
    J.root = new THREE.Group(); J.root.name = 'fox';
    J.body = new THREE.Group(); J.body.scale.setScalar(FV); J.root.add(J.body);
    J.hips = part(J.body, 'hips', [0, 5, -2], (add) => box(add, R(-2, 2), [-1.5, -0.5, 0.5, 1.5], [-1.5, -0.5, 0.5, 1.5],
      (x, y, z) => (y < -1 && Math.abs(x) <= 1 ? C.cr : y > 1 ? C.or2 : Math.abs(x) === 2 ? C.or3 : C.or),
      (x, y, z) => Math.abs(x) === 2 && Math.abs(y) === 1.5 && z === -1.5));
    J.chest = part(J.hips, 'chest', [0, 0, 2], (add) => {
      box(add, R(-2, 2), [-1.5, -0.5, 0.5, 1.5], [0.5, 1.5, 2.5, 3.5],
        (x, y, z) => ((z > 3 && y < 1 && Math.abs(x) <= 1) || (y < -1 && Math.abs(x) <= 1) ? C.cr : y > 1 ? C.or2 : Math.abs(x) === 2 ? C.or3 : C.or),
        (x, y, z) => Math.abs(x) === 2 && y === 1.5 && z === 3.5);
      box(add, [-1, 0, 1], [-1, 0], [4.3], () => C.cr);
    });
    J.head = part(J.chest, 'head', [0, 1.0, 3.5], (add) => {
      // череп сужается кверху: широкие щёки, узкий лоб — треугольная лисья морда
      const half = (y) => (y < 3 ? 3 : y < 4 ? 2 : 1);
      box(add, R(-3, 3), [0.5, 1.5, 2.5, 3.5, 4.5], [-1.5, -0.5, 0.5, 1.5, 2.5],
        (x, y, z) => {
          if (y < 2 && (Math.abs(x) >= 2 || z > 2)) return C.cr;
          if (y < 2 && z > 1) return C.cr2;
          return y > 4 ? C.or3 : C.or;
        },
        (x, y, z) => Math.abs(x) > half(y) || (Math.abs(x) === 3 && (z === -1.5 || (z === 2.5 && y > 1))) || (y === 4.5 && (z === -1.5 || z === 2.5)) || (y === 0.5 && Math.abs(x) === 3 && z === 2.5));
      // морда
      box(add, [-1, 0, 1], [1.5], [3.5, 4.5], () => C.or);
      box(add, [-1, 0, 1], [0.5], [3.5, 4.5], () => C.cr);
      add(0, 1.5, 5.4, C.nose, 1.1, 1, 0.9);
      add(0, 0.6, 5.2, C.cr, 1, 0.8, 0.6);
      // бакенбарды
      for (const s of [-1, 1]) { add(4 * s, 0.5, 0.5, C.cr); add(4 * s, 1.5, 0.5, C.cr); add(4 * s, 0.5, 1.5, C.cr); add(4.8 * s, 0.4, 0.8, C.cr2, 0.7, 0.7, 0.9); }
    });
    J.jaw = part(J.head, 'jaw', [0, 0.1, 3.0], (add) => {
      box(add, [-1, 0, 1], [-0.45], [0.5, 1.5], () => C.cr2);
      add(0, -0.1, 1.2, C.tongue, 1.2, 0.35, 1.6);
    });
    const eye = (s) => part(J.head, 'eye' + s, [1.55 * s, 3.0, 3.06], (add) => {
      add(0, 0, 0, C.eye, 1.0, 1.75, 0.3);
      add(0.22, 0.45, 0.12, C.white, 0.38, 0.38, 0.2);
    });
    J.eyeL = eye(1); J.eyeR = eye(-1);
    const happy = (s) => part(J.head, 'happy' + s, [1.55 * s, 3.0, 3.1], (add) => {
      add(-0.42, -0.15, 0, C.eye, 0.45, 0.45, 0.25); add(0, 0.25, 0, C.eye, 0.5, 0.45, 0.25); add(0.42, -0.15, 0, C.eye, 0.45, 0.45, 0.25);
    });
    J.hapL = happy(1); J.hapR = happy(-1);
    const ear = (s) => part(J.head, 'ear' + s, [1.75 * s, 3.9, -0.2], (add) => {
      const rows = [[0.5, [-1, 0, 1]], [1.5, [-1, 0, 1]], [2.5, [-0.5, 0.5]], [3.5, [-0.5, 0.5]], [4.5, [0]]];
      for (const [y, xs] of rows) for (const x of xs) for (const z of [-0.5, 0.5]) {
        const tip = y > 4 || (y > 3 && z < 0);
        const inner = z > 0 && Math.abs(x) < 0.6 && y < 3;
        add(x, y, z, tip ? C.dk : inner ? C.cr : (y > 3 ? C.or3 : C.or));
      }
    });
    J.earL = ear(1); J.earR = ear(-1);
    // передние лапы
    const fleg = (s) => {
      const up = part(J.chest, 'fu' + s, [1.5 * s, -1.0, 2.5], (add) => box(add, [-0.5, 0.5], [-0.5, -1.5], [-0.5, 0.5], (x, y) => (y > -1 ? C.or : C.or3)));
      const lo = part(up, 'fl' + s, [0, -2, 0], (add) => { box(add, [-0.5, 0.5], [-0.5, -1.5], [-0.5, 0.5], () => C.dk); add(0, -1.75, 0.95, C.dk, 2, 0.5, 0.9); });
      return [up, lo];
    };
    [J.flU, J.flL] = fleg(1); [J.frU, J.frL] = fleg(-1);
    // задние лапы
    const hleg = (s) => {
      const up = part(J.hips, 'hu' + s, [1.8 * s, -0.5, -0.5], (add) => box(add, [-0.5, 0.5], [0.5, -0.5, -1.5], [-0.5, 0.5, 1.5], (x, y, z) => (y < -1 && z > 1 ? C.or3 : C.or), (x, y, z) => y === 0.5 && z === 1.5));
      const lo = part(up, 'hl' + s, [0, -2.0, 0.3], (add) => box(add, [-0.5, 0.5], [-0.5, -1.5], [-0.5, 0.5], () => C.dk));
      const paw = part(lo, 'hp' + s, [0, -2.0, 0], (add) => box(add, [-0.5, 0.5], [-0.25], [0, 1], () => C.dk));
      paw.children[0] && paw.children[0].scale.set(1, 1, 1);
      return [up, lo, paw];
    };
    [J.hlU, J.hlL, J.hlP] = hleg(1); [J.hrU, J.hrL, J.hrP] = hleg(-1);
    // хвост — пять звеньев, каждое тянется за предыдущим
    J.tail = [];
    let prev = J.hips;
    const segs = [
      { piv: [0, 1.0, -2.0], xs: [-0.5, 0.5], ys: [-0.5, 0.5], zs: [-0.5, -1.5], c: () => C.or },
      { piv: [0, 0, -2], xs: [-1, 0, 1], ys: [-1, 0, 1], zs: [-0.5, -1.5], c: () => C.or },
      { piv: [0, 0, -2], xs: [-1, 0, 1], ys: [-1, 0, 1], zs: [-0.5, -1.5], c: (x, y) => (y > 0.5 ? C.or2 : C.or) },
      { piv: [0, 0, -2], xs: [-1, 0, 1], ys: [-1, 0, 1], zs: [-0.5, -1.5], c: (x, y, z) => (z < -1 ? C.cr : C.or) },
      { piv: [0, 0, -2], xs: [-0.5, 0.5], ys: [-0.5, 0.5], zs: [-0.5, -1.3], c: () => C.cr },
    ];
    segs.forEach((sg, i) => {
      const g = part(prev, 't' + i, sg.piv, (add) => box(add, sg.xs, sg.ys, sg.zs, sg.c, (x, y, z) => i > 0 && i < 4 && Math.abs(x) === 1 && Math.abs(y) === 1));
      J.tail.push(g); prev = g;
    });
    // молоток (в правой передней лапе)
    J.hammer = part(J.frL, 'hammer', [0, -1.6, 0.9], (add) => {
      for (let k = 0; k < 6; k++) add(0, 0, k * 0.8 - 0.8, C.handle, 0.6, 0.6, 0.8);
      add(0, 0, 3.6, C.iron, 1.6, 1.4, 2.2);
    });
    // точка «в зубах» для бревна и досок
    J.mouth = new THREE.Object3D(); J.mouth.position.set(0, 0.3, 4.6); J.head.add(J.mouth);
    J.nose = new THREE.Object3D(); J.nose.position.set(0, 1.6, 5.9); J.head.add(J.nose);
    J.headTop = new THREE.Object3D(); J.headTop.position.set(0, 3, 1); J.head.add(J.headTop);
    J.root.traverse((o) => { if (o.isInstancedMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return J;
  }

  // ── Позы ─────────────────────────────────────────────────────────────────
  // Углы в радианах. pitch>0 — нос вниз; для лап >0 — назад; хвост tailP>0 — вверх.
  const BASE = {
    lift: 0, pitch: 0, roll: 0, twist: 0, rootP: 0, rootR: 0,
    chestP: 0, chestY: 0, chestR: 0,
    headP: 0.05, headY: 0, headR: 0,
    earL: 0, earR: 0, flop: 0.08,
    fl1: 0, fl2: 0, fr1: 0, fr2: 0, flS: 0, frS: 0,
    hl1: 0, hl2: 0, hl3: 0, hr1: 0, hr2: 0, hr3: 0,
    tailP: -0.35, tailY: 0, curl: 0.13, curlY: 0,
    sq: 0, eyes: 1, happy: 0, cross: 0, jaw: 0,
    breath: 0.35, shiver: 0, shake: 0, wag: 0.1, wagF: 1.1, gait: 1,
  };
  const POSES = {
    stand: {},
    alert: { headP: -0.12, earL: 0.18, earR: 0.18, tailP: -0.15, wag: 0.05 },
    sleep: { lift: -2.75, roll: 0.12, chestY: 0.45, chestP: 0.12, headP: 0.55, headY: 1.0, headR: -0.3,
      hl1: -1.35, hl2: 2.3, hl3: -1.0, hr1: -1.25, hr2: 2.2, hr3: -1.0, fl1: -1.45, fl2: 0.25, fr1: -1.3, fr2: 0.35,
      tailP: -0.25, tailY: 1.0, curl: 0.05, curlY: 0.42, eyes: 0, earL: -0.45, earR: -0.35, breath: 1, wag: 0 },
    lie: { lift: -2.75, headP: -0.05, headY: 0.2, hl1: -1.35, hl2: 2.3, hl3: -1.0, hr1: -1.35, hr2: 2.3, hr3: -1.0,
      fl1: -1.45, fl2: 0.2, fr1: -1.45, fr2: 0.2, tailP: -0.3, tailY: 0.7, curlY: 0.25, curl: 0.02, wag: 0.02, breath: 0.6 },
    sit: { lift: -1.2, pitch: -0.62, headP: 0.5, fl1: 0.62, fr1: 0.62, fl2: 0, fr2: 0,
      hl1: -1.25, hl2: 2.25, hl3: -1.15, hr1: -1.25, hr2: 2.25, hr3: -1.15, tailP: -0.1, tailY: 0.5, curlY: 0.18, wag: 0.12 },
    crouch: { lift: -1.0, pitch: 0.12, headP: 0.35, fl1: -0.25, fr1: -0.25, fl2: 0.7, fr2: 0.7, hl1: -0.55, hr1: -0.55, hl2: 1.1, hr2: 1.1, hl3: -0.6, hr3: -0.6,
      earL: -0.35, earR: -0.35, tailP: -0.05, sq: 0.1, wag: 0 },
    leap: { lift: 0.6, pitch: -0.4, fl1: -1.0, fr1: -0.9, fl2: 0.2, fr2: 0.3, hl1: 0.9, hr1: 0.95, hl2: 0.2, hr2: 0.2, headP: -0.25, sq: -0.14, tailP: 0.2, earL: -0.5, earR: -0.5, wag: 0 },
    land: { lift: -1.1, pitch: 0.15, fl1: -0.4, fr1: -0.4, fl2: 0.8, fr2: 0.8, hl1: -0.6, hr1: -0.6, hl2: 1.2, hr2: 1.2, hl3: -0.6, hr3: -0.6, headP: 0.4, sq: 0.22, tailP: 0.35, wag: 0 },
    bow: { lift: -0.7, pitch: 0.42, fl1: -1.25, fr1: -1.25, fl2: 0.35, fr2: 0.35, hl1: -0.4, hr1: -0.4, hl2: 0.25, hr2: 0.25,
      headP: -0.5, tailP: 0.85, eyes: 0.05, jaw: 0.85, earL: -0.5, earR: -0.5, sq: -0.06, wag: 0.2 },
    shake: { shake: 1, eyes: 0.2, earL: -0.2, earR: -0.2, wag: 0 },
    sniff: { lift: -0.35, pitch: 0.18, headP: 0.75, earL: 0.25, earR: 0.25, fl1: -0.2, fr1: -0.1, tailP: -0.05, wag: 0.15 },
    carry: { headP: -0.08, jaw: 0.35, tailP: -0.1, earL: 0.05, earR: 0.05, wag: 0.06 },
    strain: { lift: -0.55, headP: 0.3, jaw: 0.35, sq: 0.13, flS: 0.25, frS: -0.25, fl1: -0.35, fr1: -0.35, hl1: 0.25, hr1: 0.25,
      eyes: 0.25, earL: -0.55, earR: -0.55, tailP: 0.45, wag: 0 },
    tossDown: { lift: -0.9, pitch: 0.28, headP: 1.05, jaw: 0.35, sq: 0.14, fl1: -0.3, fr1: -0.3, fl2: 0.6, fr2: 0.6, hl1: -0.5, hr1: -0.5, hl2: 1.0, hr2: 1.0, hl3: -0.5, hr3: -0.5,
      earL: -0.4, earR: -0.4, tailP: -0.1, eyes: 0.4, wag: 0 },
    tossUp: { lift: 0.5, pitch: -0.42, headP: -1.0, jaw: 0.9, sq: -0.14, fl1: -0.5, fr1: -0.4, hl1: 0.35, hr1: 0.35, tailP: 0.6, earL: -0.1, earR: -0.1, wag: 0 },
    lookUp: { headP: -0.7, earL: 0.2, earR: 0.2, wag: 0.04 },
    sad: { headP: 0.4, earL: -0.95, earR: -0.95, flop: 0.45, tailP: -0.6, eyes: 0.55, wag: 0 },
    proud: { pitch: -0.05, chestP: -0.12, headP: -0.2, happy: 1, tailP: 0.1, wag: 0.25, wagF: 2.2 },
    rear: { lift: 0.3, pitch: -1.3, headP: 1.15, chestP: -0.1, fl1: -0.25, fr1: -0.25, fl2: -0.7, fr2: -0.7,
      hl1: 1.2, hr1: 1.2, hl2: 0.25, hr2: 0.25, hl3: -0.15, hr3: -0.15, tailP: 0.85, curl: 0.05, wag: 0.05 },
    hamUp: { lift: 0.35, pitch: -1.36, headP: 1.05, fr1: -2.9, fr2: -0.5, frS: -0.25, fl1: -0.6, fl2: -0.9,
      hl1: 1.25, hr1: 1.25, hl2: 0.25, hr2: 0.25, hl3: -0.15, hr3: -0.15, tailP: 0.9, curl: 0.05, eyes: 0.6, wag: 0 },
    hamDown: { lift: 0.2, pitch: -1.12, headP: 1.25, fr1: -0.75, fr2: 0.1, frS: -0.1, fl1: -0.8, fl2: -0.6,
      hl1: 1.05, hr1: 1.05, hl2: 0.35, hr2: 0.35, hl3: -0.25, hr3: -0.25, tailP: 0.75, curl: 0.05, eyes: 0.35, sq: 0.05, wag: 0 },
    cling: { lift: 0.5, pitch: 0.2, headP: 0.1, fl1: -1.6, fr1: -1.6, fl2: -0.2, fr2: -0.2, hl1: 1.5, hr1: 1.4, hl2: 0.1, hr2: 0.1, hl3: 0.4, hr3: 0.4,
      tailP: 0.25, curl: 0, earL: -1.25, earR: -1.25, flop: 0.1, eyes: 0.15, jaw: 0.3, wag: 0 },
    flop: { lift: -3.15, sq: 0.28, headP: 0.12, fl1: -1.45, fr1: -1.45, fl2: 0, fr2: 0, flS: 0.5, frS: -0.5, hl1: 1.45, hr1: 1.45, hl2: 0, hr2: 0, hl3: 0.3, hr3: 0.3,
      tailP: -0.1, eyes: 0.15, earL: -0.9, earR: -0.9, flop: 0.5, wag: 0 },
    slide: { lift: -2.9, sq: 0.1, headP: -0.25, fl1: -1.75, fr1: -1.75, fl2: -0.1, fr2: -0.1, hl1: 1.5, hr1: 1.5, hl2: 0, hr2: 0, hl3: 0.4, hr3: 0.4,
      tailP: 0.5, happy: 1, earL: -0.9, earR: -0.9, jaw: 0.6, wag: 0 },
    air: { lift: 0.2, pitch: -0.2, fl1: -1.2, fr1: -1.1, hl1: 1.1, hr1: 1.1, headP: -0.2, tailP: 0.5, sq: -0.12, happy: 1, jaw: 0.5, earL: -0.7, earR: -0.7, wag: 0 },
    wipe: { lift: -1.2, pitch: -0.72, headP: 0.72, fl1: 0.7, fl2: 0, fr1: -2.45, fr2: -1.35, frS: 0.35,
      hl1: -1.25, hl2: 2.25, hl3: -1.15, hr1: -1.25, hr2: 2.25, hr3: -1.15, tailP: -0.1, tailY: 0.5, curlY: 0.18, eyes: 0.15, jaw: 0.45, wag: 0.1 },
    curl: {},
  };
  POSES.curl = Object.assign({}, POSES.sleep, { happy: 0, eyes: 0, breath: 0.8 });
  const KEYS = Object.keys(BASE);
  function mkPose(name, over) { return Object.assign({}, BASE, POSES[name] || {}, over || {}); }

  // ── Дорожка поз: ключи с полными позами, между ними — плавность ─────────
  class PoseTrack {
    constructor() { this.k = []; }
    key(t, name, ease = 'io', over) { this.k.push({ t, p: mkPose(name, over), e: E[ease] || E.io }); this.k.sort((a, b) => a.t - b.t); return this; }
    eval(t, out) {
      const k = this.k, n = k.length;
      let a, b, u = 0;
      if (t <= k[0].t) a = b = k[0];
      else if (t >= k[n - 1].t) a = b = k[n - 1];
      else {
        let lo = 0, hi = n - 1;
        while (hi - lo > 1) { const m = (lo + hi) >> 1; if (k[m].t <= t) lo = m; else hi = m; }
        a = k[lo]; b = k[hi]; u = b.e((t - a.t) / (b.t - a.t));
      }
      for (const key of KEYS) out[key] = lerp(a.p[key], b.p[key], u);
      return out;
    }
  }

  // ── Дорожка корня: где лиса стоит и куда смотрит ─────────────────────────
  const angLerp = (a, b, k) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * k; };
  class RootTrack {
    constructor(x, y, z, yaw) { this.segs = []; this.cur = { x, y, z, yaw }; this.t = 0; this.first = { x, y, z, yaw }; }
    _seg(t0, t1, fn) { this.segs.push({ t0, t1, fn }); this.t = t1; }
    hold(t1) { if (t1 <= this.t) return this; const s = Object.assign({}, this.cur); this._seg(this.t, t1, () => s); return this; }
    set(t, x, y, z, yaw) { this.hold(t); this.cur = { x, y, z, yaw: yaw ?? this.cur.yaw }; const s = Object.assign({}, this.cur); this._seg(t, t + 1e-4, () => s); return this; }
    turn(t0, t1, yaw, ease = 'io') {
      this.hold(t0); const a = Object.assign({}, this.cur), e = E[ease];
      this._seg(t0, t1, (t) => ({ x: a.x, y: a.y, z: a.z, yaw: angLerp(a.yaw, yaw, e((t - t0) / (t1 - t0))) }));
      this.cur = Object.assign({}, a, { yaw }); return this;
    }
    // Путь через точки [x,y,z]; лиса разворачивается по касательной
    go(t0, t1, pts, ease = 'io', opt = {}) {
      this.hold(t0);
      const a = Object.assign({}, this.cur), e = E[ease];
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(a.x, a.y, a.z), ...pts.map((p) => new THREE.Vector3(p[0], p[1], p[2]))], false, 'centripetal');
      const len = curve.getLength();
      const tan = new THREE.Vector3(), p = new THREE.Vector3();
      const turnIn = opt.turnIn ?? 0.28;
      const back = !!opt.back;
      this._seg(t0, t1, (t) => {
        const u = clamp(e((t - t0) / (t1 - t0)));
        curve.getPointAt(u, p); curve.getTangentAt(Math.min(0.999, Math.max(0.001, u)), tan);
        let yaw = Math.atan2(tan.x, tan.z) + (back ? Math.PI : 0);
        const k = clamp((t - t0) / turnIn);
        yaw = angLerp(a.yaw, yaw, k * k * (3 - 2 * k));
        return { x: p.x, y: p.y, z: p.z, yaw };
      });
      const endT = new THREE.Vector3(); curve.getTangentAt(0.999, endT);
      const last = pts[pts.length - 1];
      this.cur = { x: last[0], y: last[1], z: last[2], yaw: Math.atan2(endT.x, endT.z) + (back ? Math.PI : 0) };
      this.len = len;
      return this;
    }
    hop(t0, t1, x, y, z, h, yaw) {
      this.hold(t0); const a = Object.assign({}, this.cur);
      const yw = yaw ?? a.yaw;
      this._seg(t0, t1, (t) => {
        const u = clamp((t - t0) / (t1 - t0));
        return { x: lerp(a.x, x, u), y: lerp(a.y, y, u) + 4 * h * u * (1 - u), z: lerp(a.z, z, u), yaw: angLerp(a.yaw, yw, Math.min(1, u * 2)) };
      });
      this.cur = { x, y, z, yaw: yw }; return this;
    }
    eval(t) {
      const s = this.segs;
      if (!s.length || t < s[0].t0) return this.first;
      let lo = 0, hi = s.length - 1;
      if (t >= s[hi].t0) return s[hi].fn(Math.min(t, s[hi].t1));
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (s[m].t0 <= t) lo = m; else hi = m; }
      const g = s[lo];
      return g.fn(Math.min(t, g.t1));
    }
  }

  // ── Применение позы к кукле ──────────────────────────────────────────────
  const tmpV = new THREE.Vector3(), tmpM = new THREE.Matrix4();
  function apply(J, P, root, extra) {
    const t = extra.t;
    J.root.position.set(root.x, root.y, root.z);
    J.root.rotation.set(P.rootP, root.yaw, P.rootR, 'YXZ');
    // походка поверх позы
    const g = extra.gaitW || 0, ph = extra.phase || 0;
    const TAU = Math.PI * 2;
    let lift = P.lift, pitch = P.pitch, headP = P.headP, roll = P.roll;
    const legs = { fl1: P.fl1, fl2: P.fl2, fr1: P.fr1, fr2: P.fr2, hl1: P.hl1, hl2: P.hl2, hl3: P.hl3, hr1: P.hr1, hr2: P.hr2, hr3: P.hr3 };
    if (g > 0.001) {
      const amp = g * P.gait;
      const leg = (o) => Math.sin(TAU * (ph + o));
      const bend = (o) => Math.max(0, Math.cos(TAU * (ph + o)));
      legs.fl1 += -0.55 * amp * leg(0); legs.fl2 += 0.9 * amp * bend(0);
      legs.hr1 += -0.5 * amp * leg(0); legs.hr2 += 0.8 * amp * bend(0); legs.hr3 += -0.3 * amp * bend(0);
      legs.fr1 += -0.55 * amp * leg(0.5); legs.fr2 += 0.9 * amp * bend(0.5);
      legs.hl1 += -0.5 * amp * leg(0.5); legs.hl2 += 0.8 * amp * bend(0.5); legs.hl3 += -0.3 * amp * bend(0.5);
      lift += amp * (0.35 * Math.pow(Math.sin(TAU * ph * 2), 2) - 0.2);
      pitch += amp * 0.04 * Math.sin(TAU * ph * 2 + 0.6);
      headP += -amp * 0.07 * Math.sin(TAU * ph * 2 + 1.2);
      roll += amp * 0.03 * Math.sin(TAU * ph);
    }
    // дрожь и встряска
    let twist = P.twist, headY = P.headY, headR = P.headR, earL = P.earL, earR = P.earR, flop = P.flop;
    if (P.shiver > 0.001) { const s = P.shiver; lift += s * 0.12 * Math.sin(t * 91); roll += s * 0.05 * Math.sin(t * 77 + 1); headR += s * 0.08 * Math.sin(t * 63); }
    if (P.shake > 0.001) {
      const s = P.shake, w = Math.sin(t * TAU * 6.5);
      roll += s * 0.35 * w; headR += -s * 0.55 * Math.sin(t * TAU * 6.5 - 0.7); headY += s * 0.25 * Math.sin(t * TAU * 6.5 - 1.2);
      earL += -s * 0.5 * Math.abs(w); earR += -s * 0.5 * Math.abs(w); flop += s * 0.6 * Math.sin(t * TAU * 6.5 - 1.6);
    }
    const sq = P.sq;
    const sy = 1 - sq, sxz = 1 / Math.sqrt(Math.max(0.2, sy));
    J.hips.position.set(0, (5 + lift) * sy, -2);
    J.hips.rotation.set(pitch, twist, roll, 'YXZ');
    J.hips.scale.set(sxz, sy, sxz);
    const br = 1 + P.breath * 0.035 * Math.sin(t * TAU / 3.1);
    J.chest.rotation.set(P.chestP, P.chestY, P.chestR, 'YXZ');
    J.chest.scale.set(br, br, 1);
    // взгляд на цель
    if (extra.look && extra.look.w > 0.001) {
      J.root.updateMatrixWorld(true);
      tmpM.copy(J.chest.matrixWorld).invert();
      tmpV.copy(extra.look.p).applyMatrix4(tmpM).sub(J.head.position);
      const yawL = clamp(Math.atan2(tmpV.x, tmpV.z), -1.35, 1.35);
      const pitchL = clamp(-Math.atan2(tmpV.y, Math.hypot(tmpV.x, tmpV.z)), -1.0, 0.9);
      headY = lerp(headY, yawL, extra.look.w); headP = lerp(headP, pitchL, extra.look.w);
    }
    // уши отстают от головы (захлёст)
    earL += extra.earLag || 0; earR += extra.earLag || 0;
    J.head.rotation.set(headP, headY, headR, 'YXZ');
    J.jaw.rotation.set(P.jaw * 0.55, 0, 0);
    J.earL.rotation.set(-earL * 0.9 - 0.05, 0, -flop - 0.08, 'XZY');
    J.earR.rotation.set(-earR * 0.9 - 0.05, 0, flop + 0.08, 'XZY');
    // глаза: моргание, «счастливые» дуги, косоглазие
    const eo = clamp(P.eyes * (extra.blink ?? 1));
    const hp = P.happy;
    const es = Math.max(0.08, eo) * (1 - hp);
    J.eyeL.scale.set(1, es, 1); J.eyeR.scale.set(1, es, 1);
    J.eyeL.visible = J.eyeR.visible = hp < 0.5;
    J.hapL.visible = J.hapR.visible = hp >= 0.5;
    J.eyeL.position.x = 1.55 - P.cross * 0.55; J.eyeR.position.x = -1.55 + P.cross * 0.55;
    J.eyeL.position.y = J.eyeR.position.y = 3.0 - P.cross * 0.25;
    // лапы
    J.flU.rotation.set(legs.fl1, 0, P.flS); J.flL.rotation.set(legs.fl2, 0, 0);
    J.frU.rotation.set(legs.fr1, 0, P.frS); J.frL.rotation.set(legs.fr2, 0, 0);
    J.hlU.rotation.set(legs.hl1, 0, 0); J.hlL.rotation.set(legs.hl2, 0, 0); J.hlP.rotation.set(legs.hl3, 0, 0);
    J.hrU.rotation.set(legs.hr1, 0, 0); J.hrL.rotation.set(legs.hr2, 0, 0); J.hrP.rotation.set(legs.hr3, 0, 0);
    // хвост: волна с запаздыванием по звеньям + отклик на поворот корпуса
    const wagW = P.wag, wf = P.wagF;
    const yr = clamp(extra.yawRate || 0, -6, 6);
    for (let i = 0; i < J.tail.length; i++) {
      const lag = i * 0.62;
      const wave = wagW * Math.sin(t * TAU * wf * 0.5 - lag) * (0.6 + i * 0.25);
      const gaitSw = g * 0.16 * Math.sin(TAU * (ph + 0.25) - lag);
      const turn = -yr * 0.05 * (i + 1) * 0.5;
      const flut = (extra.flutter || 0) * (0.1 + i * 0.12) * Math.sin(t * 31 - i * 1.3);
      const flutP = (extra.flutter || 0) * (0.08 + i * 0.08) * Math.sin(t * 23 - i * 1.1 + 2);
      // захлёст: отклик пружины (сценарий), к кончику сильнее
      const whip = 0.22 + i * 0.07;              // звенья — цепочка: повороты складываются
      const kickP = extra.tailP ? extra.tailP[i] * whip : 0, kickY = extra.tailY ? extra.tailY[i] * whip : 0;
      const yaw = (i === 0 ? P.tailY : P.curlY) + wave + gaitSw + turn + flut + kickY;
      const pit = (i === 0 ? P.tailP : P.curl) + g * 0.07 * Math.sin(TAU * ph * 2 - lag) + flutP + kickP;
      J.tail[i].rotation.set(pit, yaw, 0, 'YXZ');
    }
    J.hammer.visible = !!extra.hammer;
  }

  return { build, apply, PoseTrack, RootTrack, mkPose, POSES, BASE, FV, angLerp };
};
