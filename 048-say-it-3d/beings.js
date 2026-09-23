/* ================================================================
   Рецепты, часть 3: живность — человечки, звери, птицы, рыбы.
   Все смотрят вдоль +z (к зрителю при rot = 0). Ноги, руки, крылья
   и хвосты висят на шарнирах, их раскачивает движок.
   ================================================================ */
(function () {
  'use strict';
  if (!window.THREE) return;
  const PI = Math.PI;
  const { R, shade, col, col2 } = S3.recipes;
  const SKIN = '#f1c9a5', INK = '#2a2420';

  // ---------- человечек ----------
  const PERSON = {
    man:       { body: '#3f7fd0', legs: '#3a3f4a', hair: '#5a3a28' },
    woman:     { body: '#d9534a', legs: '#f1c9a5', hair: '#7a4326', dress: true },
    child:     { body: '#f2c94c', legs: '#3f7fd0', hair: '#d9443a', small: true },
    grandpa:   { body: '#8a6446', legs: '#4a4a52', hair: '#f2f0ea' },
    grandma:   { body: '#6e8b6a', legs: '#4a4a52', hair: '#d9443a', dress: true },
    fisher:    { body: '#f2c230', legs: '#3a4a5a', hair: '#f2c230' },
    wizard:    { body: '#4b3f8f', legs: '#4b3f8f', hair: '#4b3f8f', dress: true },
    knight:    { body: '#b8bec6', legs: '#8e949c', hair: '#d9443a', metal: true },
    astronaut: { body: '#f1f1ee', legs: '#e4e4e0', hair: '#d8a93a' },
    chef:      { body: '#f7f5f0', legs: '#34373d', hair: '#ffffff' },
  };

  R.person = function (b, o) {
    const k = o.kind, P = PERSON[k] || PERSON.man;
    const body = col(o, P.body), hair = col2(o, P.hair), legs = P.legs;
    const m = P.metal ? 'metal' : 'matte';
    const g = b.pivot([0, 0, 0]); // весь человечек: для танца и сна
    if (P.small) g.scale.setScalar(0.74);
    b.rig.body = g;
    // ноги
    for (const s of [-1, 1]) {
      const leg = b.pivot([s * 0.085, 0.4, 0], g);
      b.p('cap', legs, [0, -0.2, 0], [0.13, 0.2, 0.13], null, { parent: leg, flat: false, mat: m });
      b.p('sph', k === 'astronaut' ? '#cfd3d8' : '#3a2e27', [0, -0.37, 0.035], [0.14, 0.09, 0.2], null, { parent: leg, flat: false });
      b.rig.legs.push(leg);
    }
    // туловище или платье
    if (P.dress) b.p('cylT:0.52:14', body, [0, 0.56, 0], [0.5, 0.56, 0.44], null, { flat: false, parent: g });
    else b.p('cylT:0.8:12', body, [0, 0.62, 0], [0.4, 0.46, 0.3], null, { flat: false, parent: g, mat: m });
    if (k === 'chef') b.p('box', '#e9e4da', [0, 0.55, 0.14], [0.26, 0.3, 0.03], null, { parent: g });
    if (k === 'astronaut') b.p('box', '#d8dade', [0, 0.66, -0.2], [0.32, 0.36, 0.16], null, { parent: g });
    // руки
    for (const s of [-1, 1]) {
      const arm = b.pivot([s * 0.23, 0.8, 0], g);
      b.p('cap', body, [0, -0.15, 0], [0.1, 0.12, 0.1], null, { parent: arm, flat: false, mat: m });
      b.p('sph', k === 'astronaut' || k === 'knight' ? '#cfd3d8' : SKIN, [0, -0.3, 0], 0.1, null, { parent: arm, flat: false });
      b.rig.arms.push(arm);
    }
    // голова
    const head = b.pivot([0, 0.99, 0], g); b.rig.head = head;
    b.p('sph', SKIN, [0, 0, 0], 0.36, null, { parent: head, flat: false });
    for (const s of [-1, 1]) {
      b.p('sph', INK, [s * 0.065, 0.02, 0.158], 0.05, null, { parent: head, flat: false });
      b.p('sph', '#f09a88', [s * 0.11, -0.045, 0.14], [0.07, 0.045, 0.03], null, { parent: head, flat: false });
    }
    // волосы, шапки и атрибуты
    if (k === 'man') b.p('half', hair, [0, 0.03, -0.01], [0.38, 0.3, 0.38], [-0.25, 0, 0], { parent: head, flat: false });
    else if (k === 'woman') {
      b.p('half', hair, [0, 0.02, -0.02], [0.39, 0.34, 0.39], [-0.35, 0, 0], { parent: head, flat: false });
      b.p('sph', hair, [0, 0.1, -0.17], 0.18, null, { parent: head, flat: false });
    } else if (k === 'child') {
      b.p('half', hair, [0, 0.04, 0], [0.39, 0.3, 0.39], [-0.15, 0, 0], { parent: head, flat: false });
      b.p('box', hair, [0, 0.07, 0.19], [0.24, 0.03, 0.14], [0.2, 0, 0], { parent: head });
    } else if (k === 'grandpa') {
      b.p('sph', hair, [0, -0.13, 0.1], [0.3, 0.22, 0.2], null, { parent: head, flat: false });
      b.p('cyl:14', '#5a5a60', [0, 0.15, 0], [0.4, 0.1, 0.4], null, { parent: head, flat: false });
      b.p('box', '#5a5a60', [0, 0.12, 0.2], [0.3, 0.03, 0.12], null, { parent: head });
    } else if (k === 'grandma') {
      b.p('half', hair, [0, 0.0, -0.01], [0.42, 0.4, 0.42], [-0.35, 0, 0], { parent: head, flat: false });
      b.p('cone:6', hair, [0, -0.12, -0.18], [0.16, 0.2, 0.08], [PI, 0, 0], { parent: head });
    } else if (k === 'fisher') {
      b.p('cylT:0.6:12', hair, [0, 0.15, 0], [0.4, 0.14, 0.4], null, { parent: head, flat: false });
      b.p('cyl:14', hair, [0, 0.1, 0], [0.62, 0.03, 0.62], [-0.15, 0, 0], { parent: head, flat: false });
      const rod = b.pivot([0.23, 0.55, 0.05], g);
      b.p('cylT:0.4:5', '#6e4c34', [0, 0.75, 0.45], [0.04, 1.8, 0.04], [0.55, 0, 0], { parent: rod });
      b.p('cyl:4', '#e8e4dc', [0, 0.95, 1.05], [0.01, 1.4, 0.01], [-0.1, 0, 0], { parent: rod });
    } else if (k === 'wizard') {
      b.p('cone:12', hair, [0, 0.3, -0.02], [0.44, 0.62, 0.44], [-0.15, 0, 0], { parent: head, flat: false });
      b.p('cyl:16', hair, [0, 0.07, 0], [0.62, 0.03, 0.62], null, { parent: head, flat: false });
      b.p('cone:8', '#f2f0ea', [0, -0.2, 0.13], [0.24, 0.34, 0.14], [PI + 0.2, 0, 0], { parent: head });
      b.p('cyl:6', '#6e4c34', [0.3, 0.6, 0.1], [0.04, 1.2, 0.04], null, { parent: g });
      b.solo('ico', col2(o, '#9fd9ff'), [0.3, 1.24, 0.1], 0.14, null, { mat: 'glow', intensity: 2.4, parent: g });
      b.light([0.3, 1.24, 0.1], '#9fd9ff', 0.5);
    } else if (k === 'knight') {
      b.p('cylT:0.9:12', '#b8bec6', [0, 0.03, 0], [0.4, 0.36, 0.4], null, { parent: head, mat: 'metal', flat: false });
      b.p('box', INK, [0, 0.03, 0.2], [0.22, 0.04, 0.02], null, { parent: head });
      b.p('cone:6', hair, [0, 0.3, -0.05], [0.1, 0.26, 0.2], null, { parent: head });
      b.p('box', col2(o, '#c7423a'), [-0.3, 0.62, 0.08], [0.06, 0.4, 0.32], null, { parent: g });
      b.p('box', '#cfd3d8', [0.3, 0.6, 0.25], [0.04, 0.05, 0.6], null, { parent: g, mat: 'metal' });
    } else if (k === 'astronaut') {
      b.p('sph', '#e8eaec', [0, 0, 0], 0.46, null, { parent: head, flat: false, mat: 'glossy' });
      b.p('sph', hair, [0, 0.01, 0.1], [0.34, 0.26, 0.3], null, { parent: head, flat: false, mat: 'metal' });
    } else if (k === 'chef') {
      b.p('cyl:12', '#ffffff', [0, 0.2, 0], [0.3, 0.2, 0.3], null, { parent: head, flat: false });
      b.p('sph', '#ffffff', [0, 0.32, 0], [0.42, 0.2, 0.42], null, { parent: head, flat: false });
    }
    b.rig.top = 1.2; b.rig.being = true;
  };

  // ---------- звери: общий четвероногий каркас ----------
  // L длина тела, W ширина, H толщина, lh длина ног, hd голова, c окрас, c2 второй цвет
  const ANIMAL = {
    cat:      { L: 0.5, W: 0.22, H: 0.2, lh: 0.16, hd: 0.26, c: '#e8913a', c2: '#fbf1e2', ears: 'point', tail: 'up' },
    dog:      { L: 0.62, W: 0.27, H: 0.26, lh: 0.22, hd: 0.3, c: '#b7834f', c2: '#f1e2c8', ears: 'flop', tail: 'up', snout: 0.16 },
    cow:      { L: 1.2, W: 0.56, H: 0.56, lh: 0.42, hd: 0.44, c: '#f4f1ea', c2: '#2e2a28', ears: 'side', tail: 'down', snout: 0.22, spots: true, horns: true },
    sheep:    { L: 0.75, W: 0.5, H: 0.5, lh: 0.24, hd: 0.26, c: '#f3efe6', c2: '#2e2a28', ears: 'side', tail: 'none', fluffy: true },
    pig:      { L: 0.8, W: 0.44, H: 0.42, lh: 0.18, hd: 0.34, c: '#f2a7a0', c2: '#e38b86', ears: 'point', tail: 'curl', snout: 0.12, snoutDisc: true },
    horse:    { L: 1.2, W: 0.42, H: 0.46, lh: 0.72, hd: 0.3, c: '#8a5a36', c2: '#3a2a20', ears: 'point', tail: 'long', snout: 0.3, neck: 0.55 },
    fox:      { L: 0.6, W: 0.22, H: 0.22, lh: 0.2, hd: 0.26, c: '#e07a2e', c2: '#fbf1e2', ears: 'point', tail: 'bushy', snout: 0.18, pointy: true },
    bear:     { L: 1.05, W: 0.62, H: 0.6, lh: 0.3, hd: 0.48, c: '#6e4a32', c2: '#a0764f', ears: 'round', tail: 'none', snout: 0.16 },
    deer:     { L: 0.85, W: 0.32, H: 0.34, lh: 0.62, hd: 0.26, c: '#a0683c', c2: '#f1e2c8', ears: 'point', tail: 'down', snout: 0.18, neck: 0.4, antlers: true },
  };

  function quad(b, o, p) {
    const c = col(o, p.c), c2 = col2(o, p.c2);
    const bodyY = p.lh + p.H * 0.45;
    const g = b.pivot([0, 0, 0]); b.rig.body = g;
    // тело
    if (p.fluffy) {
      for (let i = 0; i < 7; i++) {
        const a = i * 0.9;
        b.p('ico', shade(c, (b.rnd() - 0.5) * 0.05), [Math.cos(a) * p.W * 0.28, bodyY + Math.sin(a * 1.7) * 0.06, (i / 6 - 0.5) * p.L * 0.8], p.W * 0.72, [b.rnd(), b.rnd(), 0], { parent: g });
      }
    } else b.p('cap', c, [0, bodyY, 0], [p.W, p.L / 2 - p.W * 0.25, p.H], [PI / 2, 0, 0], { parent: g, flat: false });
    if (p.spots) for (let i = 0; i < 5; i++) {
      const a = b.rnd() * PI * 2, z = (b.rnd() - 0.5) * p.L * 0.6;
      b.p('sph', c2, [Math.cos(a) * p.W * 0.44, bodyY + Math.sin(a) * p.H * 0.42, z], [0.26, 0.2, 0.3], null, { parent: g, flat: false });
    }
    if (p.spots) b.p('sph', '#f2a7a0', [0, p.lh + 0.02, -p.L * 0.15], [0.2, 0.14, 0.2], null, { parent: g, flat: false });
    // ноги
    const legC = p.fluffy ? c2 : shade(c, -0.05);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const leg = b.pivot([sx * p.W * 0.28, p.lh + 0.02, sz * p.L * 0.3], g);
      b.p('cylT:0.8:7', legC, [0, -p.lh / 2, 0], [Math.max(0.07, p.W * 0.26), p.lh + 0.04, Math.max(0.07, p.W * 0.26)], null, { parent: leg });
      if (p.lh > 0.5) b.p('box', INK, [0, -p.lh + 0.03, 0], [p.W * 0.22, 0.06, p.W * 0.22], null, { parent: leg });
      b.rig.legs.push(leg);
    }
    // шея и голова
    const neck = p.neck || 0;
    const hz = p.L * 0.5 + p.hd * 0.2 + neck * 0.35, hy = bodyY + p.H * 0.25 + neck;
    if (neck) b.p('cylT:0.7:8', c, [0, bodyY + neck * 0.55, p.L * 0.42 + neck * 0.18], [p.W * 0.5, neck + p.H * 0.4, p.W * 0.5], [0.45, 0, 0], { parent: g });
    const head = b.pivot([0, hy, hz], g); b.rig.head = head;
    const hc = p.fluffy ? c2 : c;
    b.p('sph', hc, [0, 0, 0], [p.hd, p.hd * 0.92, p.hd * (p.pointy ? 1.0 : 0.95)], null, { parent: head, flat: false });
    if (p.snout) {
      if (p.pointy) b.p('cone:8', c, [0, -0.02, p.hd * 0.5], [p.hd * 0.5, p.snout * 1.4, p.hd * 0.45], [PI / 2, 0, 0], { parent: head });
      else if (p.snoutDisc) b.p('cyl:12', p.c2 === c2 ? shade(c, -0.08) : c2, [0, -0.03, p.hd * 0.5], [p.hd * 0.42, p.snout, p.hd * 0.36], [PI / 2, 0, 0], { parent: head, flat: false });
      else b.p('sph', o.kind === 'cow' ? '#f2a7a0' : p.c2 ? c2 : shade(c, 0.1), [0, -p.hd * 0.12, p.hd * 0.42], [p.hd * 0.62, p.hd * 0.5, p.snout * 1.8], null, { parent: head, flat: false });
      b.p('sph', INK, [0, p.pointy ? -0.02 : -p.hd * 0.04, p.hd * 0.42 + p.snout * (p.pointy ? 1.3 : 0.9)], p.hd * 0.14, null, { parent: head, flat: false });
    }
    for (const s of [-1, 1]) b.p('sph', INK, [s * p.hd * 0.25, p.hd * 0.1, p.hd * 0.42], p.hd * 0.13, null, { parent: head, flat: false });
    // уши
    for (const s of [-1, 1]) {
      if (p.ears === 'point') b.p('cone:4', c, [s * p.hd * 0.28, p.hd * 0.5, -p.hd * 0.05], [p.hd * 0.3, p.hd * 0.42, p.hd * 0.16], [0, 0, -s * 0.25], { parent: head });
      else if (p.ears === 'flop') b.p('box', shade(c, -0.15), [s * p.hd * 0.5, p.hd * 0.05, -0.02], [0.06, p.hd * 0.6, p.hd * 0.35], [0, 0, s * 0.25], { parent: head });
      else if (p.ears === 'round') b.p('sph', c, [s * p.hd * 0.36, p.hd * 0.42, -0.02], p.hd * 0.3, null, { parent: head, flat: false });
      else if (p.ears === 'side') b.p('sph', p.fluffy ? c2 : c, [s * p.hd * 0.58, p.hd * 0.12, -0.05], [p.hd * 0.4, p.hd * 0.16, p.hd * 0.22], null, { parent: head, flat: false });
    }
    if (p.horns) for (const s of [-1, 1]) b.p('cone:6', '#efe6d0', [s * p.hd * 0.36, p.hd * 0.5, -0.05], [0.07, 0.2, 0.07], [0, 0, -s * 0.6], { parent: head });
    if (p.antlers) for (const s of [-1, 1]) {
      b.p('cylT:0.6:5', '#d9c3a0', [s * 0.1, p.hd * 0.75, -0.04], [0.04, 0.42, 0.04], [0, 0, -s * 0.35], { parent: head });
      b.p('cylT:0.6:5', '#d9c3a0', [s * 0.2, p.hd * 0.95, 0.02], [0.03, 0.24, 0.03], [0.5, 0, -s * 0.9], { parent: head });
    }
    if (o.kind === 'horse') b.p('box', c2, [0, bodyY + neck * 0.7, p.L * 0.36 + neck * 0.1], [0.06, neck + 0.2, 0.2], [0.45, 0, 0], { parent: g });
    // хвост
    const tail = b.pivot([0, bodyY + p.H * 0.2, -p.L * 0.5], g); b.rig.tail = tail;
    if (p.tail === 'up') b.p('cylT:0.5:6', c, [0, p.hd * 0.6, -0.08], [0.07, p.hd * 1.5, 0.07], [-0.5, 0, 0], { parent: tail });
    else if (p.tail === 'down') b.p('cylT:0.6:6', c, [0, -0.2, -0.04], [0.06, 0.45, 0.06], [0.25, 0, 0], { parent: tail });
    else if (p.tail === 'long') b.p('cone:6', c2, [0, -0.3, -0.12], [0.18, 0.7, 0.18], [0.35, 0, 0], { parent: tail });
    else if (p.tail === 'curl') b.p('torus:0.3', c, [0, 0.02, -0.05], 0.12, [0, PI / 2, 0], { parent: tail, flat: false });
    else if (p.tail === 'bushy') {
      b.p('cap', c, [0, -0.02, -0.22], [0.2, 0.14, 0.2], [PI / 2 + 0.5, 0, 0], { parent: tail, flat: false });
      b.p('sph', c2, [0, -0.13, -0.42], 0.15, null, { parent: tail, flat: false });
    }
    b.rig.top = hy + p.hd * 0.5; b.rig.being = true;
  }

  R.animal = function (b, o) {
    const k = o.kind;
    if (ANIMAL[k]) return quad(b, o, ANIMAL[k]);
    const g = b.pivot([0, 0, 0]); b.rig.body = g;
    const eye = (x, y, z, s) => b.p('sph', INK, [x, y, z], s, null, { parent: g, flat: false });
    if (k === 'rabbit') {
      const c = col(o, '#d9d4cc');
      b.p('sph', c, [0, 0.2, -0.03], [0.34, 0.34, 0.4], null, { parent: g, flat: false });
      const head = b.pivot([0, 0.42, 0.12], g); b.rig.head = head;
      b.p('sph', c, [0, 0, 0], 0.26, null, { parent: head, flat: false });
      for (const s of [-1, 1]) {
        b.p('cap', c, [s * 0.06, 0.24, -0.02], [0.07, 0.1, 0.04], [0, 0, -s * 0.15], { parent: head, flat: false });
        b.p('sph', INK, [s * 0.07, 0.03, 0.11], 0.045, null, { parent: head, flat: false });
      }
      b.p('sph', '#f2a7a0', [0, -0.03, 0.13], 0.04, null, { parent: head, flat: false });
      b.p('sph', '#ffffff', [0, 0.18, -0.22], 0.14, null, { parent: g, flat: false });
      for (const s of [-1, 1]) { const leg = b.pivot([s * 0.1, 0.08, 0.1], g); b.p('sph', c, [0, -0.04, 0.03], [0.1, 0.08, 0.16], null, { parent: leg, flat: false }); b.rig.legs.push(leg); }
      b.rig.top = 0.75;
    } else if (k === 'chicken' || k === 'duck') {
      const duck = k === 'duck';
      const c = col(o, duck ? '#c9b89a' : '#f7f3ea');
      b.p('sph', c, [0, 0.3, 0], [0.34, 0.3, 0.44], null, { parent: g, flat: false });
      b.p('cone:6', shade(c, -0.06), [0, 0.4, -0.24], [0.16, 0.22, 0.1], [-0.9, 0, 0], { parent: g });
      const head = b.pivot([0, 0.5, 0.16], g); b.rig.head = head;
      b.p('sph', duck ? col2(o, '#2f6d4a') : c, [0, 0, 0], 0.2, null, { parent: head, flat: false });
      b.p(duck ? 'box' : 'cone:4', '#f0a23a', [0, -0.02, 0.13], duck ? [0.1, 0.04, 0.12] : [0.06, 0.1, 0.06], duck ? null : [PI / 2, 0, 0], { parent: head });
      if (!duck) { b.p('box', '#d9443a', [0, 0.11, 0.02], [0.04, 0.08, 0.12], null, { parent: head }); b.p('sph', '#d9443a', [0, -0.08, 0.08], [0.04, 0.07, 0.04], null, { parent: head, flat: false }); }
      for (const s of [-1, 1]) b.p('sph', INK, [s * 0.07, 0.03, 0.07], 0.035, null, { parent: head, flat: false });
      for (const s of [-1, 1]) { const leg = b.pivot([s * 0.07, 0.16, 0], g); b.p('cyl:4', '#f0a23a', [0, -0.08, 0], [0.025, 0.16, 0.025], null, { parent: leg }); b.p('box', '#f0a23a', [0, -0.16, 0.04], [0.08, 0.02, 0.1], null, { parent: leg }); b.rig.legs.push(leg); }
      for (const s of [-1, 1]) { const w = b.pivot([s * 0.16, 0.34, 0], g); b.p('sph', shade(c, -0.05), [s * 0.02, 0, -0.03], [0.06, 0.18, 0.3], null, { parent: w, flat: false }); b.rig.wings.push(w); }
      b.rig.top = 0.62;
    } else if (k === 'frog') {
      const c = col(o, '#6aa84a');
      b.p('sph', c, [0, 0.14, 0], [0.42, 0.26, 0.4], null, { parent: g, flat: false });
      b.p('sph', col2(o, '#e6e0a0'), [0, 0.1, 0.06], [0.34, 0.16, 0.3], null, { parent: g, flat: false });
      for (const s of [-1, 1]) { b.p('sph', c, [s * 0.1, 0.27, 0.1], 0.13, null, { parent: g, flat: false }); eye(s * 0.1, 0.29, 0.15, 0.06); }
      for (const s of [-1, 1]) { const leg = b.pivot([s * 0.18, 0.06, -0.08], g); b.p('sph', shade(c, -0.05), [0, 0, 0], [0.16, 0.1, 0.24], null, { parent: leg, flat: false }); b.rig.legs.push(leg); }
      b.rig.top = 0.34;
    } else if (k === 'hedgehog') {
      const c = col(o, '#7a5a40');
      b.p('half', c, [0, 0.02, 0], [0.5, 0.42, 0.56], null, { parent: g, flat: false });
      for (let i = 0; i < 16; i++) {
        const a = b.rnd() * PI * 2, e = b.rnd() * 1.2;
        const x = Math.cos(a) * Math.cos(e) * 0.24, y = 0.05 + Math.sin(e) * 0.2, z = Math.sin(a) * Math.cos(e) * 0.27 - 0.03;
        b.p('cone:4', shade(c, -0.12), [x, y, z], [0.06, 0.18, 0.06], [Math.sin(a) * 0.9 - 0.4, 0, -Math.cos(a) * 0.9], { parent: g });
      }
      b.p('cone:8', '#e8d2b0', [0, 0.1, 0.3], [0.16, 0.2, 0.14], [PI / 2, 0, 0], { parent: g });
      b.p('sph', INK, [0, 0.1, 0.41], 0.05, null, { parent: g, flat: false });
      for (const s of [-1, 1]) eye(s * 0.06, 0.15, 0.3, 0.035);
      b.rig.top = 0.3;
    } else if (k === 'penguin') {
      const c = col(o, '#26242a');
      b.p('sph', c, [0, 0.36, 0], [0.4, 0.62, 0.36], null, { parent: g, flat: false });
      b.p('sph', '#f7f5f0', [0, 0.33, 0.07], [0.3, 0.5, 0.26], null, { parent: g, flat: false });
      const head = b.pivot([0, 0.7, 0.02], g); b.rig.head = head;
      b.p('sph', c, [0, 0, 0], 0.26, null, { parent: head, flat: false });
      b.p('cone:6', '#f0a23a', [0, -0.02, 0.15], [0.07, 0.12, 0.07], [PI / 2, 0, 0], { parent: head });
      for (const s of [-1, 1]) b.p('sph', '#ffffff', [s * 0.06, 0.03, 0.1], 0.05, null, { parent: head, flat: false });
      for (const s of [-1, 1]) { const w = b.pivot([s * 0.2, 0.5, 0], g); b.p('sph', c, [s * 0.02, -0.14, 0], [0.06, 0.32, 0.14], [0, 0, s * 0.2], { parent: w, flat: false }); b.rig.arms.push(w); }
      for (const s of [-1, 1]) { const leg = b.pivot([s * 0.08, 0.04, 0.04], g); b.p('box', '#f0a23a', [0, -0.02, 0.04], [0.1, 0.03, 0.14], null, { parent: leg }); b.rig.legs.push(leg); }
      b.rig.top = 0.85;
    } else return quad(b, o, ANIMAL.cat);
    b.rig.being = true;
  };

  // ---------- птицы: стайка клином ----------
  R.bird = function (b, o) {
    const n = o.n || 3, k = o.kind;
    const c = col(o, k === 'crow' ? '#2e2c30' : k === 'songbird' ? '#6d8fb8' : '#f4f1ea');
    const wing = k === 'gull' ? '#9aa3ad' : shade(c, -0.08);
    b.rig.flock = [];
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1, rank = Math.ceil(i / 2);
      const bird = b.pivot([side * rank * 0.7, (b.rnd() - 0.5) * 0.4, -rank * 0.6]);
      b.p('sph', c, [0, 0, 0], [0.2, 0.18, 0.42], null, { parent: bird, flat: false });
      b.p('sph', c, [0, 0.07, 0.2], 0.16, null, { parent: bird, flat: false });
      b.p('cone:4', k === 'crow' ? '#3a3a3e' : '#f0a23a', [0, 0.06, 0.32], [0.05, 0.1, 0.05], [PI / 2, 0, 0], { parent: bird });
      if (k === 'songbird') b.p('sph', '#e2703a', [0, -0.02, 0.1], [0.16, 0.14, 0.2], null, { parent: bird, flat: false });
      b.p('cone:4', shade(c, -0.1), [0, 0.02, -0.28], [0.14, 0.2, 0.04], [-PI / 2, 0, 0], { parent: bird });
      const wings = [];
      for (const s of [-1, 1]) {
        const w = b.pivot([s * 0.08, 0.04, 0], bird);
        b.p('box', wing, [s * 0.26, 0, 0], [0.5, 0.025, 0.2], [0, 0, 0], { parent: w });
        if (k === 'gull') b.p('box', '#2e2c30', [s * 0.48, 0.005, -0.02], [0.1, 0.026, 0.14], null, { parent: w });
        wings.push(w); b.rig.wings.push(w);
      }
      b.rig.flock.push({ bird, wings, ph: b.rnd() * 6 });
    }
    b.rig.top = 0.3; b.rig.noShadow = false;
  };

  // ---------- рыбы: прыгают из воды ----------
  R.fish = function (b, o) {
    const dol = o.kind === 'dolphin';
    const c = col(o, dol ? '#7d93a8' : '#e8913a');
    const g = b.pivot([0, 0, 0]); b.rig.body = g; b.rig.fish = true;
    if (dol) {
      b.p('cap', c, [0, 0, 0], [0.5, 0.55, 0.46], [PI / 2, 0, 0], { parent: g, flat: false, mat: 'glossy' });
      b.p('sph', '#e6e9ec', [0, -0.12, 0.1], [0.34, 0.22, 1.1], null, { parent: g, flat: false });
      b.p('cyl:8', c, [0, -0.03, 0.9], [0.14, 0.3, 0.12], [PI / 2, 0, 0], { parent: g, flat: false });
      b.p('cone:4', c, [0, 0.3, -0.05], [0.1, 0.36, 0.3], [-0.4, 0, 0], { parent: g });
      b.p('box', c, [0, 0, -0.85], [0.6, 0.05, 0.22], null, { parent: g });
      for (const s of [-1, 1]) b.p('sph', INK, [s * 0.16, 0.06, 0.62], 0.05, null, { parent: g, flat: false });
    } else {
      b.p('sph', c, [0, 0, 0], [0.26, 0.34, 0.66], null, { parent: g, flat: false, mat: 'glossy' });
      b.p('cone:4', shade(c, 0.08), [0, 0, -0.42], [0.36, 0.24, 0.05], [-PI / 2, 0, 0], { parent: g });
      b.p('cone:4', shade(c, -0.05), [0, 0.2, -0.02], [0.05, 0.16, 0.26], null, { parent: g });
      for (const s of [-1, 1]) b.p('sph', INK, [s * 0.1, 0.06, 0.24], 0.05, null, { parent: g, flat: false });
    }
    b.rig.top = 0.4;
  };
})();
