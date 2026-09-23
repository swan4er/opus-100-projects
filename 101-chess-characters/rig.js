/* ================================================================
   rig.js — фигуры-персонажи.
   Тела — LatheGeometry по профилям Стаунтона (чуть мультяшнее: головы крупнее),
   конь — выдавленный силуэт. Лицо: глаза-шарики со зрачками, веки-полусферы
   (моргают и прищуриваются), брови-капсулы, рот — полоска на поверхности тела,
   кадры рта берутся из нарисованного на canvas атласа (улыбка, крик, дрожь…).
   ================================================================ */
window.makeRig = function (THREE) {
  'use strict';

  // ---------- профили тел (радиус, высота) ----------
  const BASE = [[0, 0], [0.36, 0], [0.372, 0.03], [0.362, 0.075], [0.31, 0.105], [0.272, 0.13]];
  const PROFILES = {
    P: [...BASE, [0.22, 0.18], [0.185, 0.26], [0.16, 0.34], [0.155, 0.4], [0.215, 0.43], [0.222, 0.455], [0.16, 0.485], [0, 0.49]],
    R: [[0, 0], [0.38, 0], [0.392, 0.03], [0.382, 0.08], [0.33, 0.11], [0.3, 0.14], [0.276, 0.2], [0.266, 0.4], [0.266, 0.58], [0.3, 0.62], [0.336, 0.645], [0.336, 0.8], [0.25, 0.8], [0.25, 0.75], [0, 0.75]],
    B: [...BASE, [0.21, 0.2], [0.165, 0.34], [0.145, 0.45], [0.205, 0.48], [0.215, 0.505], [0.155, 0.53], [0.178, 0.58], [0.205, 0.66], [0.205, 0.75], [0.18, 0.85], [0.12, 0.93], [0.05, 0.98], [0, 0.99]],
    Q: [[0, 0], [0.37, 0], [0.382, 0.03], [0.372, 0.08], [0.31, 0.11], [0.27, 0.14], [0.22, 0.22], [0.175, 0.4], [0.155, 0.56], [0.165, 0.64], [0.225, 0.67], [0.235, 0.7], [0.175, 0.73], [0.197, 0.8], [0.216, 0.9], [0.226, 0.98], [0.265, 1.08], [0.275, 1.12], [0.2, 1.1], [0.1, 1.12], [0, 1.13]],
    K: [[0, 0], [0.38, 0], [0.392, 0.03], [0.382, 0.08], [0.32, 0.11], [0.28, 0.14], [0.23, 0.22], [0.185, 0.4], [0.165, 0.58], [0.175, 0.66], [0.235, 0.69], [0.245, 0.72], [0.185, 0.75], [0.205, 0.82], [0.225, 0.92], [0.235, 1.02], [0.265, 1.1], [0.265, 1.14], [0.18, 1.16], [0, 1.17]],
    N: [[0, 0], [0.36, 0], [0.372, 0.03], [0.362, 0.075], [0.31, 0.105], [0.285, 0.13], [0.275, 0.2], [0.22, 0.225], [0, 0.225]],
  };
  const HEIGHT = { P: 0.9, N: 1.08, B: 1.07, R: 0.9, Q: 1.27, K: 1.45 };

  function radiusAt(profile, y) {
    for (let i = 1; i < profile.length; i++) {
      const [r0, y0] = profile[i - 1], [r1, y1] = profile[i];
      if (y >= Math.min(y0, y1) && y <= Math.max(y0, y1) && y1 !== y0) return r0 + (r1 - r0) * (y - y0) / (y1 - y0);
    }
    return 0.2;
  }

  // ---------- параметры лица ----------
  const FACE = {
    P: { y: 0.665, head: 0.218, er: 0.072, spread: 0.37, eyeY: 0.03, mouthY: -0.085, mw: 0.15, mh: 0.1 },
    R: { y: 0.43, er: 0.08, spread: 0.3, eyeY: 0.05, mouthY: -0.1, mw: 0.17, mh: 0.11 },
    B: { y: 0.69, er: 0.068, spread: 0.37, eyeY: 0.035, mouthY: -0.08, mw: 0.13, mh: 0.085 },
    Q: { y: 0.87, er: 0.072, spread: 0.36, eyeY: 0.045, mouthY: -0.085, mw: 0.14, mh: 0.09 },
    K: { y: 0.9, er: 0.076, spread: 0.35, eyeY: 0.045, mouthY: -0.095, mw: 0.15, mh: 0.095 },
    N: { flat: true, er: 0.068 },
  };

  // ---------- выражения лица ----------
  // lid: угол века (−1.4 — глаза навыкате, 0 — полуприкрыты, 1.5 — закрыты)
  // brow: [наклон (>0 — сердито, <0 — жалобно), подъём], mouth: кадр атласа, pupil: размер зрачка
  const EXPR = {
    neutral: { lid: -0.9, brow: [0, 0], mouth: 0 },
    happy: { lid: -0.85, brow: [-0.12, 0.012], mouth: 1 },
    joy: { lid: -1.15, brow: [-0.2, 0.03], mouth: 2 },
    fear: { lid: -1.35, brow: [-0.5, 0.025], mouth: 6, pupil: 0.62, tremble: 1 },
    shock: { lid: -1.5, brow: [-0.15, 0.05], mouth: 5, pupil: 0.5 },
    anger: { lid: -0.35, brow: [0.55, -0.012], mouth: 12 },
    smug: { lid: -0.1, brow: [0.12, 0.004], asym: true, mouth: 7 },
    bored: { lid: 0.15, brow: [0, -0.008], mouth: 8 },
    sad: { lid: -0.45, brow: [-0.45, 0.012], mouth: 3 },
    think: { lid: -0.7, brow: [0.15, 0.02], asym: true, mouth: 8 },
    goofy: { lid: -1.2, brow: [-0.25, 0.035], mouth: 11 },
    pout: { lid: -0.3, brow: [0.2, 0.01], mouth: 14 },
    dead: { lid: -1.0, brow: [-0.3, 0.0], mouth: 13 },
  };

  // ---------- атлас ртов: 4×4 кадра по 128 px ----------
  function mouthAtlas(ink) {
    const S = 128, cv = document.createElement('canvas');
    cv.width = cv.height = S * 4;
    const g = cv.getContext('2d');
    const IN = '#4b1712', TONGUE = '#e46a5c', TEETH = '#fffaf0';
    g.lineCap = 'round'; g.lineJoin = 'round';
    const cell = (i, fn) => { g.save(); g.translate((i % 4) * S, Math.floor(i / 4) * S); fn(); g.restore(); };
    const stroke = (w = 8) => { g.strokeStyle = ink; g.lineWidth = w; g.stroke(); };
    const curve = (x0, y0, cx, cy, x1, y1) => { g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(cx, cy, x1, y1); };
    const filled = (path, tongue) => {
      path(); g.fillStyle = IN; g.fill();
      if (tongue) { g.save(); path(); g.clip(); g.fillStyle = TONGUE; g.beginPath(); g.ellipse(tongue[0], tongue[1], tongue[2], tongue[3], 0, 0, Math.PI * 2); g.fill(); g.restore(); }
      path(); stroke(7);
    };
    cell(0, () => { curve(30, 60, 64, 72, 98, 60); stroke(); });                       // нейтрально
    cell(1, () => { curve(24, 52, 64, 96, 104, 52); stroke(); });                      // улыбка
    cell(2, () => {                                                                     // оскал радости
      const p = () => { g.beginPath(); g.moveTo(20, 46); g.quadraticCurveTo(64, 56, 108, 46); g.quadraticCurveTo(104, 116, 64, 118); g.quadraticCurveTo(24, 116, 20, 46); g.closePath(); };
      filled(p, [64, 108, 26, 16]);
      g.save(); p(); g.clip(); g.fillStyle = TEETH; g.fillRect(20, 40, 88, 20); g.restore(); p(); stroke(7);
    });
    cell(3, () => { curve(30, 80, 64, 46, 98, 80); stroke(); });                       // грусть
    cell(4, () => filled(() => { g.beginPath(); g.ellipse(64, 66, 15, 19, 0, 0, Math.PI * 2); }));   // «о»
    cell(5, () => filled(() => { g.beginPath(); g.ellipse(64, 66, 27, 40, 0, 0, Math.PI * 2); }, [64, 96, 20, 12]));  // крик
    cell(6, () => { g.beginPath(); for (let x = 22; x <= 106; x += 2) { const y = 64 + Math.sin((x - 22) / 84 * Math.PI * 4) * 7; x === 22 ? g.moveTo(x, y) : g.lineTo(x, y); } stroke(7); }); // дрожь
    cell(7, () => { curve(32, 70, 72, 76, 102, 46); stroke(); });                      // ухмылка
    cell(8, () => { g.beginPath(); g.moveTo(36, 64); g.lineTo(92, 64); stroke(); });  // скука
    cell(9, () => filled(() => { g.beginPath(); g.ellipse(64, 64, 20, 10, 0, 0, Math.PI * 2); }));   // говорит 1
    cell(10, () => filled(() => { g.beginPath(); g.ellipse(64, 66, 24, 22, 0, 0, Math.PI * 2); }, [64, 82, 16, 9])); // говорит 2
    cell(11, () => {                                                                    // язык набок
      g.fillStyle = TONGUE; g.beginPath(); g.ellipse(80, 80, 13, 22, -0.35, 0, Math.PI * 2); g.fill();
      g.strokeStyle = ink; g.lineWidth = 5; g.stroke();
      curve(22, 50, 64, 92, 106, 50); stroke();
    });
    cell(12, () => {                                                                    // стиснутые зубы
      const p = () => { g.beginPath(); g.roundRect(22, 46, 84, 38, 14); };
      p(); g.fillStyle = TEETH; g.fill();
      g.beginPath(); g.moveTo(24, 65); g.lineTo(104, 65); for (let x = 40; x < 104; x += 16) { g.moveTo(x, 48); g.lineTo(x, 82); }
      g.strokeStyle = '#8a6a60'; g.lineWidth = 3; g.stroke(); p(); stroke(7);
    });
    cell(13, () => {                                                                    // мёртвый
      g.fillStyle = TONGUE; g.beginPath(); g.ellipse(76, 78, 11, 17, 0.2, 0, Math.PI * 2); g.fill(); g.strokeStyle = ink; g.lineWidth = 5; g.stroke();
      g.beginPath(); for (let x = 26; x <= 102; x += 2) { const y = 62 + Math.sin((x - 26) / 76 * Math.PI * 3) * 5; x === 26 ? g.moveTo(x, y) : g.lineTo(x, y); } stroke(7);
    });
    cell(14, () => { g.beginPath(); g.ellipse(64, 64, 11, 9, 0, 0, Math.PI * 2); g.fillStyle = '#b8323a'; g.fill(); stroke(6); }); // надутые губы
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }

  // ---------- материалы ----------
  const std = (color, rough = 0.45, metal = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
  const MAT = {
    body: { w: std('#f1e4cb', 0.42), b: std('#3d2f48', 0.36) },
    brow: { w: std('#3b2418', 0.8), b: std('#ecd9b4', 0.7) },
    eye: std('#ffffff', 0.18, 0, { emissive: '#2a2622' }),
    pupil: std('#140f0d', 0.12),
    glint: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
    gold: std('#e0ac45', 0.3, 0.65),
    dark: std('#1b1512', 0.35, 0.3),
    olive: std('#6f7a3d', 0.7),
    red: std('#c8433a', 0.55),
    capB: std('#1f1a22', 0.6),
    glass: std('#161214', 0.1, 0.2, { transparent: true, opacity: 0.88 }),
    wing: std('#fffaf0', 0.5),
    sweat: std('#8fd0ff', 0.1, 0, { transparent: true, opacity: 0.85 }),
    mane: { w: std('#8a5a3a', 0.7), b: std('#c9a26a', 0.7) },
  };
  const ATLAS = { w: mouthAtlas('#2a1a14'), b: mouthAtlas('#f3e3c4') };
  const MOUTH = { w: new THREE.MeshBasicMaterial({ map: ATLAS.w, transparent: true, alphaTest: 0.25, depthWrite: false }),
                  b: new THREE.MeshBasicMaterial({ map: ATLAS.b, transparent: true, alphaTest: 0.25, depthWrite: false }) };

  // ---------- общие геометрии ----------
  const GEO = {};
  const latheCache = {};
  const lathe = (kind) => latheCache[kind] || (latheCache[kind] = new THREE.LatheGeometry(PROFILES[kind].map(([x, y]) => new THREE.Vector2(x, y)), 44));
  GEO.eye = new THREE.SphereGeometry(1, 24, 16);
  GEO.lid = new THREE.SphereGeometry(1, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  GEO.brow = new THREE.CapsuleGeometry(1, 1, 4, 8);
  GEO.box = new THREE.BoxGeometry(1, 1, 1);
  GEO.ball = new THREE.SphereGeometry(1, 16, 12);
  GEO.torus = new THREE.TorusGeometry(1, 0.14, 8, 28);
  GEO.halo = new THREE.TorusGeometry(1, 0.1, 8, 32);
  GEO.cone = new THREE.ConeGeometry(1, 1, 12);
  GEO.cyl = new THREE.CylinderGeometry(1, 1, 1, 24);

  // Силуэт головы коня (морда смотрит в −x)
  const knightShape = new THREE.Shape();
  const KP = [[0.2, 0.2], [0.235, 0.42], [0.215, 0.6], [0.15, 0.76], [0.13, 0.86], [0.09, 0.99], [0.035, 0.9], [-0.05, 0.89], [-0.17, 0.83], [-0.27, 0.72], [-0.345, 0.62], [-0.37, 0.55], [-0.345, 0.49], [-0.27, 0.465], [-0.17, 0.48], [-0.08, 0.45], [-0.1, 0.34], [-0.18, 0.2]];
  knightShape.moveTo(KP[0][0], KP[0][1]);
  for (let i = 1; i < KP.length; i++) {
    const [x0, y0] = KP[i - 1], [x1, y1] = KP[i];
    knightShape.quadraticCurveTo(x0 + (x1 - x0) * 0.5 + (y1 - y0) * 0.08, y0 + (y1 - y0) * 0.5 - (x1 - x0) * 0.08, x1, y1);
  }
  knightShape.quadraticCurveTo(0, 0.17, KP[0][0], KP[0][1]);
  const KD = 0.24;
  GEO.knightHead = new THREE.ExtrudeGeometry(knightShape, { depth: KD, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.035, bevelSegments: 4, curveSegments: 6 });
  GEO.knightHead.translate(0, 0, -KD / 2);
  GEO.knightHead.computeVertexNormals();

  const mesh = (geo, mat, shadow = false) => { const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; m.receiveShadow = false; return m; };

  // Полоска рта: кусок цилиндра, прилегающий к телу; кадр меняется переписыванием UV
  function mouthStrip(radius, w, h, mat) {
    const len = w / radius;
    const geo = new THREE.CylinderGeometry(radius, radius, h, 10, 1, true, -len / 2, len);
    const base = geo.attributes.uv.array.slice();
    const m = mesh(geo, mat);
    m.renderOrder = 2;
    m.userData.uvBase = base;
    return m;
  }
  function flatMouth(w, h, mat) {
    const geo = new THREE.PlaneGeometry(w, h);
    const m = mesh(geo, mat);
    m.renderOrder = 2;
    m.userData.uvBase = geo.attributes.uv.array.slice();
    return m;
  }
  function setMouthFrame(m, i) {
    if (m.userData.frame === i) return;
    m.userData.frame = i;
    const col = i % 4, row = Math.floor(i / 4), uv = m.geometry.attributes.uv, base = m.userData.uvBase;
    for (let k = 0; k < uv.count; k++) {
      uv.array[k * 2] = (col + base[k * 2]) / 4;
      uv.array[k * 2 + 1] = (3 - row + base[k * 2 + 1]) / 4;
    }
    uv.needsUpdate = true;
  }

  // Глаз: шар, зрачок на шарнире, веко, бровь, крестик «убит»
  function makeEye(er, team, side) {
    const g = new THREE.Group();
    const ball = mesh(GEO.eye, MAT.eye); ball.scale.setScalar(er); g.add(ball);
    const pivot = new THREE.Group(); g.add(pivot);
    const pupil = mesh(GEO.ball, MAT.pupil); pupil.scale.set(er * 0.5, er * 0.5, er * 0.22); pupil.position.z = er * 0.86; pivot.add(pupil);
    const glint = mesh(GEO.ball, MAT.glint); glint.scale.setScalar(er * 0.13); glint.position.set(-er * 0.17 * side, er * 0.2, er * 0.98); pivot.add(glint);
    const lid = new THREE.Group(); g.add(lid);
    const lidMesh = mesh(GEO.lid, MAT.body[team]); lidMesh.scale.setScalar(er * 1.1); lid.add(lidMesh);
    const brow = mesh(GEO.brow, MAT.brow[team]); brow.scale.set(er * 0.19, er * 0.62, er * 0.19); brow.rotation.z = Math.PI / 2;
    const browPivot = new THREE.Group(); browPivot.position.set(0, er * 1.42, er * 0.5); browPivot.add(brow); g.add(browPivot);
    const x = new THREE.Group(); x.visible = false; x.position.z = er * 0.98;
    for (const a of [Math.PI / 4, -Math.PI / 4]) { const bar = mesh(GEO.box, MAT.pupil); bar.scale.set(er * 1.3, er * 0.22, er * 0.12); bar.rotation.z = a; x.add(bar); }
    g.add(x);
    return { g, ball, pivot, pupil, lid, browPivot, brow, x, er, side };
  }

  // ---------- сборка персонажа ----------
  function buildPiece(kind, team, id) {
    const root = new THREE.Group();
    const bob = new THREE.Group(); root.add(bob);
    const body = new THREE.Group(); bob.add(body);
    const bodyMat = MAT.body[team];
    body.add(mesh(lathe(kind), bodyMat, true));
    const F = FACE[kind];
    const face = new THREE.Group(); bob.add(face);
    const eyes = [];
    let mouth, headY;

    if (kind === 'N') {
      const head = mesh(GEO.knightHead, bodyMat, true); body.add(head);
      // грива
      for (let i = 0; i < 7; i++) {
        const t = i / 6, m = mesh(GEO.box, MAT.mane[team], true);
        m.scale.set(0.07, 0.1, KD * 0.7);
        m.position.set(0.215 - t * 0.09 + Math.sin(t * 3) * 0.02, 0.36 + t * 0.5, 0);
        m.rotation.z = -0.35 - t * 0.4;
        body.add(m);
      }
      face.position.set(-0.13, 0.735, KD / 2 + 0.045);
      for (const s of [-1, 1]) {
        const e = makeEye(F.er, team, s);
        e.g.position.set(s * 0.066 + 0.02, s > 0 ? 0.012 : 0, 0.02);
        face.add(e.g); eyes.push(e);
      }
      mouth = flatMouth(0.15, 0.1, MOUTH[team]);
      mouth.position.set(-0.16, -0.19, 0.012);
      face.add(mouth);
      headY = 1.02;
    } else {
      const prof = PROFILES[kind];
      if (kind === 'P') { const head = mesh(GEO.ball, bodyMat, true); head.scale.setScalar(F.head); head.position.y = F.y; body.add(head); }
      const rAt = (y) => kind === 'P' ? Math.sqrt(Math.max(0.001, F.head * F.head - (y - F.y) * (y - F.y))) : radiusAt(prof, y);
      const eyeY = F.y + F.eyeY, rEye = rAt(eyeY);
      for (const s of [-1, 1]) {
        const e = makeEye(F.er, team, s), a = s * F.spread, d = rEye - F.er * 0.3;
        e.g.position.set(Math.sin(a) * d, eyeY, Math.cos(a) * d);
        e.g.rotation.y = a;
        bob.add(e.g); eyes.push(e);
      }
      const mY = F.y + F.mouthY;
      mouth = mouthStrip(rAt(mY) + 0.007, F.mw, F.mh, MOUTH[team]);
      mouth.position.y = mY;
      bob.add(mouth);
      headY = HEIGHT[kind];
      // детали короны и башни
      if (kind === 'R') {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + Math.PI / 6, m = mesh(GEO.box, bodyMat, true);
          m.scale.set(0.15, 0.13, 0.1); m.position.set(Math.sin(a) * 0.285, 0.855, Math.cos(a) * 0.285); m.rotation.y = a; body.add(m);
        }
      }
      if (kind === 'B') {
        const top = mesh(GEO.ball, bodyMat, true); top.scale.setScalar(0.055); top.position.y = 1.02; body.add(top);
        const slit = mesh(GEO.box, MAT.dark); slit.scale.set(0.02, 0.2, 0.2); slit.position.set(0.12, 0.84, -0.06); slit.rotation.set(0, 0.5, 0.55); body.add(slit);
      }
      if (kind === 'Q') {
        for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2, m = mesh(GEO.ball, MAT.gold, true); m.scale.setScalar(0.042); m.position.set(Math.sin(a) * 0.26, 1.15, Math.cos(a) * 0.26); body.add(m); }
        const top = mesh(GEO.ball, MAT.gold, true); top.scale.setScalar(0.07); top.position.y = 1.19; body.add(top);
      }
      if (kind === 'K') {
        const v = mesh(GEO.box, MAT.gold, true); v.scale.set(0.07, 0.26, 0.07); v.position.y = 1.3; body.add(v);
        const h = mesh(GEO.box, MAT.gold, true); h.scale.set(0.2, 0.065, 0.07); h.position.y = 1.33; body.add(h);
        const band = mesh(GEO.cyl, MAT.gold, true); band.scale.set(0.272, 0.05, 0.272); band.position.y = 1.1; body.add(band);
      }
    }

    // ресницы — на веках, моргают вместе с ними
    const lashes = [];
    function addLashes() {
      for (const e of eyes) for (let i = -1; i <= 1; i++) {
        const l = mesh(GEO.box, MAT.pupil); l.scale.set(e.er * 0.09, e.er * 0.55, e.er * 0.09);
        const a = i * 0.45 + e.side * 0.15;
        l.position.set(Math.sin(a) * e.er * 1.08, e.er * 0.2, Math.cos(a) * e.er * 1.08);
        l.rotation.set(0.9, 0, -a * 0.9);
        e.lid.add(l); lashes.push(l);
      }
    }

    // ---------- аксессуары по персонажам ----------
    const extras = {};
    const topY = kind === 'P' ? F.y + F.head : HEIGHT[kind];
    const eyeWorld = eyes.map((e) => e.g.position.clone());
    const acc = {
      glasses() {
        for (const e of eyes) { const r = mesh(GEO.torus, MAT.dark); r.scale.setScalar(e.er * 1.28); r.position.z = e.er * 0.62; e.g.add(r); }
        const bridge = mesh(GEO.box, MAT.dark); bridge.scale.set(Math.abs(eyeWorld[1].x - eyeWorld[0].x) * 0.45, 0.012, 0.012);
        bridge.position.copy(eyeWorld[0]).add(eyeWorld[1]).multiplyScalar(0.5); bridge.position.z += eyes[0].er * 0.75; bridge.position.y += eyes[0].er * 0.25;
        (kind === 'N' ? face : bob).add(bridge);
      },
      shades() {
        for (const e of eyes) { const d = mesh(GEO.cyl, MAT.glass); d.scale.set(e.er * 1.2, 0.01, e.er * 1.05); d.rotation.x = Math.PI / 2; d.position.z = e.er * 1.02; e.g.add(d); }
        const bridge = mesh(GEO.box, MAT.dark); bridge.scale.set(Math.abs(eyeWorld[1].x - eyeWorld[0].x) * 0.5, 0.014, 0.014);
        bridge.position.copy(eyeWorld[0]).add(eyeWorld[1]).multiplyScalar(0.5); bridge.position.z += eyes[0].er * 1.0;
        (kind === 'N' ? face : bob).add(bridge);
        extras.shades = true;
      },
      cap() { // кепка пешек с района (остаётся и после превращения — у ферзя нет F.head)
        const hr = F.head || 0.2;
        const c = mesh(GEO.cyl, MAT.capB, true); c.scale.set(hr * 0.95, 0.06, hr * 0.95); c.position.y = topY - 0.035; bob.add(c);
        const t = mesh(GEO.ball, MAT.capB, true); t.scale.set(hr * 0.92, hr * 0.42, hr * 0.92); t.position.y = topY - 0.02; bob.add(t);
        const v = mesh(GEO.cyl, MAT.capB, true); v.scale.set(hr * 0.62, 0.018, hr * 0.5); v.position.set(0, topY - 0.06, hr * 0.78); bob.add(v);
      },
      pilotka() {
        const c = mesh(GEO.box, MAT.olive, true); c.scale.set(0.3, 0.1, 0.16); c.position.set(0, topY - 0.02, 0); c.rotation.z = 0.18; bob.add(c);
        const star = mesh(GEO.ball, MAT.red); star.scale.setScalar(0.022); star.position.set(0, topY - 0.01, 0.085); bob.add(star);
      },
      paperCrown() {
        const band = mesh(new THREE.CylinderGeometry(1, 1, 1, 20, 1, true), MAT.gold); band.material = MAT.gold; band.scale.set(0.13, 0.05, 0.13); band.position.y = topY - 0.005; bob.add(band);
        for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2, s = mesh(GEO.cone, MAT.gold); s.scale.set(0.028, 0.07, 0.028); s.position.set(Math.sin(a) * 0.12, topY + 0.05, Math.cos(a) * 0.12); bob.add(s); }
      },
      mustache(curly) {
        const my = kind === 'N' ? null : F.y + (F.eyeY + F.mouthY) * 0.5 - 0.005;
        const r = kind === 'N' ? 0.2 : (kind === 'P' ? F.head : radiusAt(PROFILES[kind], my)) + 0.012;
        for (const s of [-1, 1]) {
          const m = mesh(GEO.brow, MAT.brow[team]); m.scale.set(0.022, 0.055, 0.022);
          const a = s * 0.16;
          m.position.set(Math.sin(a) * r, my, Math.cos(a) * r);
          m.rotation.set(0, a, s * (Math.PI / 2 + (curly ? 0.5 : 0.3)));
          bob.add(m);
        }
      },
      wings() {
        const wg = new THREE.Group(); wg.position.set(0.12, 0.62, -0.06); body.add(wg);
        for (const s of [-1, 1]) {
          const w = new THREE.Group(); w.position.z = s * 0.1; wg.add(w);
          for (let i = 0; i < 3; i++) { const f = mesh(GEO.ball, MAT.wing, true); f.scale.set(0.16 - i * 0.03, 0.045, 0.06); f.position.set(0.09 + i * 0.03, 0.03 + i * 0.05, s * 0.05); f.rotation.z = 0.5 + i * 0.25; w.add(f); }
          w.rotation.x = s * 0.5;
          extras['wing' + s] = w;
        }
      },
      lashes: addLashes,
    };

    const LOOK = {
      wK: ['mustache'], wQ: ['lashes'], wRa: ['glasses'], wRh: ['lashes'], wNg: ['wings'],
      wPa: ['pilotka'], wPc: ['paperCrown', 'lashes'], wPd: ['glasses'],
      bK: ['mustache:curly'], bQ: ['lashes'], bRa: ['shades'], bRh: ['shades'],
      bPa: ['cap'], bPb: ['cap'], bPc: ['cap'], bPd: ['cap'], bPe: ['cap'], bPf: ['cap'], bPg: ['cap'], bPh: ['cap'],
    };
    for (const a of LOOK[id] || []) { const [fn, arg] = a.split(':'); acc[fn] && acc[fn](arg); }

    // пот — капля у виска, видна при страхе
    const sweat = new THREE.Group();
    const drop = mesh(GEO.ball, MAT.sweat); drop.scale.set(0.035, 0.045, 0.035); sweat.add(drop);
    const tip = mesh(GEO.cone, MAT.sweat); tip.scale.set(0.034, 0.05, 0.034); tip.position.y = 0.04; sweat.add(tip);
    if (kind === 'N') sweat.position.set(0.02, 0.9, 0.16);
    else { const yy = F.y + F.eyeY + F.er * 1.6; const rr = (kind === 'P' ? F.head * 0.85 : radiusAt(PROFILES[kind], yy)) + 0.03; sweat.position.set(Math.sin(0.95) * rr, yy, Math.cos(0.95) * rr); }
    sweat.visible = false;
    bob.add(sweat);

    // нимб павшего
    const halo = mesh(GEO.halo, MAT.gold); halo.scale.setScalar(0.17); halo.rotation.x = Math.PI / 2; halo.position.y = headY + 0.16; halo.visible = false; bob.add(halo);

    // невидимая «мишень» для кликов
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, headY + 0.1, 12), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = (headY + 0.1) / 2; root.add(hit);

    return { id, kind, team, root, bob, body, face, eyes, mouth, lashes, sweat, halo, hit, extras, headY };
  }

  return { buildPiece, setMouthFrame, EXPR, HEIGHT, MAT };
};
