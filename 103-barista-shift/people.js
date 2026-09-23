/* ================================================================
   Смена — жители района: низкополигональные люди с лицами,
   эмоциями, походкой и паром изо рта; такса, коляска, кошка,
   автобус и машины. Всё собирается из примитивов с цветами вершин.
   ================================================================ */
(function () {
  'use strict';
  window.PeopleKit = function (K, View) {
    const THREE = K.THREE, scene = K.scene, rnd = K.rnd, lerp = K.lerp, clamp = K.clamp;
    const box = new THREE.BoxGeometry(1, 1, 1);
    const cyl = (a, b, h, s = 8) => new THREE.CylinderGeometry(a, b, h, s);
    const ico = (r, d = 1) => new THREE.IcosahedronGeometry(r, d);
    const half = (r, ws = 8, hs = 4) => new THREE.SphereGeometry(r, ws, hs, 0, Math.PI * 2, 0, Math.PI / 2);
    const DARK = 0x1c1614;

    // ---------- частицы: пар изо рта, дым, пар от злости ----------
    const puffs = [];
    const puffMat = new THREE.SpriteMaterial({ map: K.glow, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
    for (let i = 0; i < 90; i++) {
      const s = new THREE.Sprite(puffMat.clone()); s.visible = false; scene.add(s);
      puffs.push({ s, life: 0, max: 1, vx: 0, vy: 0, vz: 0, grow: 1, op: .3 });
    }
    let pi = 0;
    K.puff = function (pos, o = {}) {
      const p = puffs[pi = (pi + 1) % puffs.length];
      p.s.position.copy(pos); p.s.visible = true;
      p.life = 0; p.max = o.life || 1.4; p.op = o.op ?? .35; p.grow = o.grow ?? 1.2;
      p.vx = o.vx ?? (rnd() - .5) * .08; p.vy = o.vy ?? .25; p.vz = o.vz ?? (rnd() - .5) * .08;
      p.size = o.size || .12; p.s.scale.set(p.size, p.size, 1);
      p.s.material.color.setHex(o.color || 0xffffff);
    };
    function updatePuffs(dt) {
      for (const p of puffs) {
        if (!p.s.visible) continue;
        p.life += dt;
        const k = p.life / p.max;
        if (k >= 1) { p.s.visible = false; continue; }
        p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt;
        const sc = p.size * (1 + k * p.grow * 3);
        p.s.scale.set(sc, sc, 1);
        p.s.material.opacity = p.op * Math.sin(Math.min(1, k * 3) * Math.PI / 2) * (1 - k);
      }
    }

    // ================================================================
    // Сборка человека
    // ================================================================
    function build(L) {
      const h = L.h || 1.75, w = L.w || 1, s = h / 1.75;
      const hip = .84 * s, sh = 1.43 * s, headY = sh + .2 * s;
      const skin = L.skin ?? 0xe8b898, coat = L.coat ?? 0x444c58, pants = L.pants ?? 0x2a2c33;
      const root = new THREE.Group();
      const body = new THREE.Group(); root.add(body);
      // туловище
      const B = new K.Batch();
      const cb = hip - .22 * s;
      B.add(cyl(.19 * w, .25 * w, sh - cb, 8), coat, 0, (sh + cb) / 2, 0);
      B.add(ico(.2, 0), coat, 0, sh - .02, 0, 0, 0, 0, 1.25 * w, .45, .95 * w);
      B.add(box, coat, -.25 * w, sh - .3 * s, 0, 0, 0, .1, .1 * Math.max(1, w * .9), .58 * s, .12);
      B.add(ico(.052, 0), skin, -.28 * w, sh - .62 * s, 0);
      B.add(cyl(.055, .06, .12), skin, 0, sh + .05, 0);
      if (L.scarf) B.add(cyl(.12, .13, .09, 8), L.scarf, 0, sh + .04, 0);
      if (L.apron) { B.add(box, L.apron, 0, hip + .12 * s, .2 * w, 0, 0, 0, .34 * w, .56 * s, .03); B.add(box, L.apron, 0, sh - .12, .19 * w, -.1, 0, 0, .24 * w, .2, .02); }
      if (L.acc === 'backpack') B.add(box, 0x2a3a4a, 0, sh - .28 * s, -.26 * w, 0, 0, 0, .34, .42 * s, .16);
      if (L.acc === 'cube') { B.add(box, 0x2c8a3a, 0, sh - .15 * s, -.4 * w, 0, 0, 0, .46, .46, .4); B.add(box, 0xf2f2f2, 0, sh - .15 * s, -.605 * w, 0, 0, 0, .3, .1, .01, 0); }
      if (L.acc === 'bag') B.add(box, 0x5a2e24, -.3 * w, sh - .7 * s, .04, 0, 0, 0, .1, .22, .28);
      if (L.acc === 'bottle') B.add(cyl(.035, .035, .2, 6), 0x2f8fd0, -.29 * w, sh - .66 * s, .04);
      if (L.acc === 'phone') B.add(box, 0x15171c, -.28 * w, sh - .58 * s, .07, .4, 0, 0, .07, .13, .015, 0);
      if (L.acc === 'broom') { B.add(cyl(.02, .02, 1.6, 5), 0x8a6a3a, -.34 * w, .8, .25, -.2, 0, .1); B.add(box, 0x9a8a5a, -.34 * w, .12, .42, -.2, 0, 0, .3, .18, .08); }
      const bodyMesh = B.mesh(); body.add(bodyMesh);
      // ноги
      const legs = [];
      for (const sx of [-1, 1]) {
        const pv = new THREE.Group(); pv.position.set(sx * .09 * w, hip, 0);
        const LB = new K.Batch();
        LB.add(box, pants, 0, -hip / 2 + .02, 0, 0, 0, 0, .13 * Math.max(.9, w), hip, .15);
        LB.add(box, 0x1a1a1e, 0, -hip + .04, .04, 0, 0, 0, .14, .08, .26);
        pv.add(LB.mesh()); body.add(pv); legs.push(pv);
      }
      // правая рука: плечо и локоть на шарнирах, чтобы подносить стакан ко рту
      const arm = new THREE.Group(); arm.position.set(.25 * w, sh - .02, 0);
      const AB = new K.Batch();
      AB.add(box, coat, 0, -.15 * s, 0, 0, 0, 0, .1 * Math.max(1, w * .9), .32 * s, .12);
      arm.add(AB.mesh()); body.add(arm);
      const elbow = new THREE.Group(); elbow.position.set(0, -.3 * s, 0); arm.add(elbow);
      const EB = new K.Batch();
      EB.add(box, coat, 0, -.14 * s, 0, 0, 0, 0, .095 * Math.max(1, w * .9), .3 * s, .11);
      EB.add(ico(.052, 0), skin, 0, -.31 * s, 0);
      elbow.add(EB.mesh());
      const hand = new THREE.Object3D(); hand.position.set(0, -.33 * s, .02); elbow.add(hand);
      // голова
      const head = new THREE.Group(); head.position.set(0, headY, 0); body.add(head);
      const HB = new K.Batch();
      HB.add(ico(.13 * s, 1), skin, 0, 0, 0, 0, 0, 0, 1, 1.1, 1, .04);
      HB.add(box, new THREE.Color(skin).multiplyScalar(.9).getHex(), 0, -.012, .13 * s, 0, 0, 0, .032, .045, .04, 0);
      for (const sx of [-1, 1]) HB.add(box, skin, sx * .128 * s, -.005, 0, 0, 0, 0, .03, .055, .04);
      for (const sx of [-1, 1]) HB.add(box, 0x121015, sx * .047 * s, .022, .122 * s, 0, 0, 0, .024, .028, .012, 0);
      if (L.tired) for (const sx of [-1, 1]) HB.add(box, 0x9a6a78, sx * .047 * s, -.004, .121 * s, 0, 0, 0, .03, .012, .01, 0);
      if (L.glasses) {
        for (const sx of [-1, 1]) HB.add(box, 0x16161a, sx * .047 * s, .022, .132 * s, 0, 0, 0, .05, .04, .006, 0);
        HB.add(box, 0x16161a, 0, .03, .132 * s, 0, 0, 0, .04, .008, .006, 0);
      }
      const hair = L.hair ?? 0x3a2a1e, hc = L.hatC ?? 0x444444;
      const hat = L.hat;
      if (!hat || hat === 'cap' || hat === 'flatcap' || hat === 'beret') {
        if (L.hair !== null) {
          HB.add(half(.138 * s), hair, 0, .012, -.008, -.18, 0, 0, 1, 1.02, 1.02);
          if (L.long) HB.add(box, hair, 0, -.1, -.07, 0, 0, 0, .25, .3, .1);
        }
      }
      if (hat === 'ushanka') {
        HB.add(cyl(.152 * s, .158 * s, .13, 8), hc, 0, .08, 0);
        HB.add(ico(.16 * s, 0), hc, 0, .14, 0, 0, 0, 0, 1, .35, 1);
        for (const sx of [-1, 1]) HB.add(box, hc, sx * .145 * s, -.03, 0, 0, 0, 0, .05, .15, .14);
        HB.add(box, new THREE.Color(hc).multiplyScalar(1.15).getHex(), 0, .07, .14 * s, .2, 0, 0, .26, .08, .04);
      } else if (hat === 'beanie' || hat === 'pompom') {
        HB.add(half(.142 * s), hc, 0, .03, 0, 0, 0, 0, 1, 1.2, 1);
        HB.add(cyl(.146 * s, .146 * s, .055, 10), new THREE.Color(hc).multiplyScalar(.85).getHex(), 0, .045, 0);
        if (hat === 'pompom') HB.add(ico(.05, 1), 0xf4efe6, 0, .21, 0);
      } else if (hat === 'cap') {
        HB.add(half(.14 * s), hc, 0, .03, 0);
        HB.add(box, hc, 0, .05, .15 * s, .1, 0, 0, .15, .015, .11);
      } else if (hat === 'flatcap') {
        HB.add(cyl(.14 * s, .15 * s, .07, 8), hc, 0, .1, -.01, -.1, 0, 0);
        HB.add(box, hc, 0, .08, .15 * s, .15, 0, 0, .18, .015, .09);
      } else if (hat === 'beret') {
        HB.add(ico(.16 * s, 1), hc, .02, .1, -.01, 0, 0, .25, 1, .32, 1);
      } else if (hat === 'hood') {
        HB.add(half(.175 * s), hc, 0, 0, -.025, -.35, 0, 0, 1, 1.15, 1.1);
        HB.add(box, hc, 0, -.1, -.1, 0, 0, 0, .3, .2, .1);
      } else if (hat === 'scarf') {
        HB.add(half(.15 * s), hc, 0, .005, -.01, -.25, 0, 0, 1, 1.1, 1.05);
        HB.add(box, hc, 0, -.13, .08, .4, 0, .78, .07, .07, .05);
        HB.add(box, hc, 0, -.1, -.12, .3, 0, 0, .18, .16, .03);
      } else if (hat === 'helmet') {
        HB.add(half(.165 * s), hc, 0, .04, 0, 0, 0, 0, 1, .9, 1.1);
        HB.add(box, 0xf2f2f2, 0, .14, 0, 0, 0, 0, .03, .03, .3);
      }
      const headMat = K.matVC.clone();
      const headMesh = new THREE.Mesh(HB.geometry(), headMat); head.add(headMesh);
      // брови и рот — отдельно, для эмоций
      const browC = L.hair && L.hair !== 0xcfcfcf ? L.hair : 0x3a3030;
      const browMat = new THREE.MeshLambertMaterial({ color: browC });
      const brows = [-1, 1].map((sx) => { const b = new THREE.Mesh(box, browMat); b.scale.set(.05, .013, .012); b.position.set(sx * .047 * s, .066, .121 * s); head.add(b); return b; });
      const mouth = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: 0x3a1818 }));
      mouth.scale.set(.05, .012, .01); mouth.position.set(0, -.058, .124 * s); head.add(mouth);
      // аксессуары-спутники
      let extra = null;
      if (L.acc === 'dog') extra = buildDog();
      if (L.acc === 'stroller') extra = buildStroller();
      if (extra) { extra.position.set(.5, 0, .1); root.add(extra); }
      return { root, body, legs, arm, elbow, hand, head, headMesh, headMat, brows, mouth, extra, s, hip, sh, headY };
    }

    function buildDog() {
      const g = new THREE.Group(), B = new K.Batch(), c = 0x7a3e1c;
      B.add(box, c, 0, .16, 0, 0, 0, 0, .13, .11, .44);
      B.add(box, c, 0, .22, .27, 0, 0, 0, .1, .1, .13);
      B.add(box, 0x5a2a10, 0, .2, .35, 0, 0, 0, .06, .05, .07);
      B.add(box, 0x111111, 0, .215, .385, 0, 0, 0, .025, .02, .01);
      for (const sx of [-1, 1]) B.add(box, 0x5a2a10, sx * .055, .2, .25, 0, 0, sx * .3, .02, .08, .06);
      for (const [x, z] of [[-.04, .15], [.04, .15], [-.04, -.15], [.04, -.15]]) B.add(box, c, x, .06, z, 0, 0, 0, .035, .12, .04);
      B.add(box, 0x2a4a8a, 0, .215, .2, 0, 0, 0, .105, .025, .03);
      g.add(B.mesh());
      const tail = new THREE.Mesh(box, new THREE.MeshLambertMaterial({ color: c })); tail.scale.set(.02, .02, .14); tail.position.set(0, .2, -.27); g.add(tail);
      g.userData.tail = tail; g.userData.dog = true;
      return g;
    }
    function buildStroller() {
      const g = new THREE.Group(), B = new K.Batch();
      B.add(box, 0x5a7a9a, 0, .55, 0, 0, 0, 0, .44, .3, .72);
      B.add(new THREE.CylinderGeometry(.3, .3, .44, 10, 1, false, 0, Math.PI), 0x3f5a78, 0, .7, -.18, 0, 0, Math.PI / 2, 1, 1, 1);
      for (const [x, z] of [[-.2, .28], [.2, .28], [-.2, -.28], [.2, -.28]]) B.add(cyl(.11, .11, .04, 10), 0x1a1a1a, x, .12, z, 0, 0, Math.PI / 2);
      B.add(box, 0x2a2a2a, 0, .4, 0, 0, 0, 0, .4, .04, .6);
      B.add(box, 0x2a2a2a, 0, .95, .45, .5, 0, 0, .44, .03, .03);
      B.add(box, 0xf3e8e0, 0, .66, .18, 0, 0, 0, .3, .08, .2);
      g.add(B.mesh());
      return g;
    }

    // ================================================================
    // Реестр людей и поведение
    // ================================================================
    const P = new Map();
    const api = {};
    api.spawn = function (id, L, x, z, yaw = 0) {
      api.remove(id);
      const b = build(L);
      b.root.position.set(x, 0, z); b.root.rotation.y = yaw;
      scene.add(b.root);
      const p = { id, L, b, yaw, yawT: yaw, walk: null, talk: false, mood: 'ok', act: null, phase: rnd() * 10, headYaw: 0, headYawT: 0, lookT: 2 + rnd() * 3, breathT: rnd() * 2, cup: null, lean: 0, hidden: false, y0: 0 };
      P.set(id, p);
      api.mood(id, 'ok');
      return p;
    };
    api.get = (id) => P.get(id);
    api.has = (id) => P.has(id);
    api.remove = function (id) {
      const p = P.get(id); if (!p) return;
      scene.remove(p.b.root);
      p.b.root.traverse((o) => { if (o.geometry && o.geometry !== box) o.geometry.dispose(); });
      P.delete(id);
    };
    api.visible = (id, v) => { const p = P.get(id); if (p) p.b.root.visible = v; };
    api.place = (id, x, z, yaw) => { const p = P.get(id); if (!p) return; p.b.root.position.set(x, p.y0, z); if (yaw != null) { p.yaw = p.yawT = yaw; p.b.root.rotation.y = yaw; } p.walk = null; };
    api.walkTo = function (id, x, z, onArrive, speed = 1.25) {
      const p = P.get(id); if (!p) return;
      p.walk = { x, z, speed: speed * (.9 + rnd() * .2), onArrive };
    };
    api.face = (id, yaw) => { const p = P.get(id); if (p) p.yawT = yaw; };
    api.faceTo = (id, x, z) => { const p = P.get(id); if (!p) return; const r = p.b.root.position; p.yawT = Math.atan2(x - r.x, z - r.z); };
    api.talk = (id, on) => { const p = P.get(id); if (p) p.talk = on; };
    api.mood = function (id, m) {
      const p = P.get(id); if (!p) return;
      p.mood = m;
      const [bl, br] = p.b.brows;
      let rz = 0, by = .066, mx = 1, my = 1, tint = [1, 1, 1];
      if (m === 'angry') { rz = .42; by = .058; my = .8; tint = [1, .78, .74]; }
      else if (m === 'furious') { rz = .55; by = .055; my = 2.4; mx = 1.3; tint = [1, .62, .58]; }
      else if (m === 'sad') { rz = -.35; by = .07; my = .8; }
      else if (m === 'shock') { rz = -.15; by = .085; my = 3.2; mx = .8; tint = [1, .96, .92]; }
      else if (m === 'happy') { rz = -.1; by = .074; mx = 1.5; my = 1.6; }
      else if (m === 'sleepy') { rz = .1; by = .05; my = .7; }
      bl.rotation.z = -rz; br.rotation.z = rz; bl.position.y = br.position.y = by;
      p.mouthBase = { x: mx, y: my };
      p.b.headMat.color.setRGB(...tint);
    };
    api.act = function (id, name, onDone) {
      const p = P.get(id); if (!p) { if (onDone) onDone(); return; }
      p.act = { name, t: 0, dur: { sip: 2.2, puff: 1.5, hop: .7, shake: 1.1, throw: 1.3, pour: 2.2, nod: .9, stomp: 1.2, lean: .8 }[name] || 1, onDone };
    };
    api.holdCup = function (id, obj) {
      const p = P.get(id); if (!p) return;
      if (obj) { p.b.hand.add(obj); obj.position.set(0, -.05, .03); obj.rotation.set(0, 0, 0); }
      p.cup = obj;
    };
    // предмет в руке без выравнивания (сигарета)
    api.holdProp = function (id, obj) {
      const p = P.get(id); if (!p) return;
      if (p.prop && p.prop.parent) p.prop.parent.remove(p.prop);
      if (obj) p.b.hand.add(obj);
      p.prop = obj || null;
    };
    api.headPos = function (id, out) {
      const p = P.get(id); if (!p) return null;
      out = out || new THREE.Vector3();
      p.b.head.getWorldPosition(out); out.y += .28 * p.b.s;
      return out;
    };
    api.mouthPos = function (id, out) {
      const p = P.get(id); if (!p) return null;
      out = out || new THREE.Vector3();
      p.b.mouth.getWorldPosition(out);
      return out;
    };
    api.all = () => P;

    const tmp = new THREE.Vector3();
    // позы руки: [плечо x, плечо y, плечо z, локоть x]
    const REST = [0, 0, .05, -.08], HOLD = [-.3, -.2, 0, -2.0], SIP = [-1.0, -.8, 0, -2.1], POUR = [-.5, 0, .1, -1.3];
    const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), qc = new THREE.Quaternion(), eu = new THREE.Euler();
    const cupOff = new THREE.Vector3(0, -.06, .035);
    function updatePerson(p, dt, time) {
      const b = p.b, r = b.root;
      p.phase += dt;
      // ходьба
      let moving = false;
      if (p.walk) {
        const dx = p.walk.x - r.position.x, dz = p.walk.z - r.position.z, d = Math.hypot(dx, dz);
        if (d < .04) { const cb = p.walk.onArrive; p.walk = null; if (cb) cb(); }
        else {
          moving = true;
          const st = Math.min(d, p.walk.speed * dt);
          r.position.x += dx / d * st; r.position.z += dz / d * st;
          p.yawT = Math.atan2(dx, dz);
        }
      }
      // поворот
      let dy = p.yawT - p.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
      p.yaw += dy * Math.min(1, dt * 6); r.rotation.y = p.yaw;
      // ноги и покачивание
      const sw = moving ? Math.sin(p.phase * 9) * .55 : 0;
      b.legs[0].rotation.x = lerp(b.legs[0].rotation.x, sw, .3);
      b.legs[1].rotation.x = lerp(b.legs[1].rotation.x, -sw, .3);
      b.body.position.y = moving ? Math.abs(Math.sin(p.phase * 9)) * .035 : Math.sin(p.phase * 1.7) * .006;
      b.body.scale.y = 1 + Math.sin(p.phase * 1.7) * .006;
      // голова: оглядывается
      p.lookT -= dt;
      if (p.lookT < 0) { p.lookT = 2 + rnd() * 4; p.headYawT = p.talk ? 0 : (rnd() - .5) * 1.1; }
      p.headYaw = lerp(p.headYaw, p.talk ? 0 : p.headYawT, Math.min(1, dt * 3));
      b.head.rotation.y = p.headYaw;
      b.head.rotation.x = p.talk ? Math.sin(p.phase * 7) * .05 : (p.mood === 'sleepy' ? .25 : 0);
      // рот
      const mb = p.mouthBase || { x: 1, y: 1 };
      const talkY = p.talk ? (1 + Math.abs(Math.sin(p.phase * 17) * Math.sin(p.phase * 5.3)) * 3.2) : 1;
      b.mouth.scale.set(.05 * mb.x, .012 * mb.y * talkY, .01);
      // действия. Поза руки: плечо (x, y, z) и локоть; со стаканом рука держит его у груди
      const pose = p.cup || p.prop ? HOLD : REST;
      let armX = pose[0], armY = pose[1], armZ = pose[2], elbX = pose[3], tiltX = 0, tiltZ = 0, lean = 0, hop = 0, shk = 0;
      if (p.act) {
        const a = p.act; a.t += dt; const k = Math.min(1, a.t / a.dur);
        const blend = (to, u) => { armX = lerp(armX, to[0], u); armY = lerp(armY, to[1], u); armZ = lerp(armZ, to[2], u); elbX = lerp(elbX, to[3], u); };
        if (a.name === 'sip') { const u = k < .3 ? k / .3 : k > .75 ? (1 - k) / .25 : 1; blend(SIP, u); tiltX = -.9 * u; b.head.rotation.x = -.18 * u; }
        else if (a.name === 'puff') { const u = k < .3 ? k / .3 : k > .7 ? (1 - k) / .3 : 1; blend(SIP, u); }
        else if (a.name === 'pour') { const u = k < .25 ? k / .25 : k > .8 ? (1 - k) / .2 : 1; blend(POUR, 1); tiltZ = -2.3 * u; }
        else if (a.name === 'throw') { blend(REST, 1); armX = -2.6 * Math.sin(k * Math.PI); }
        else if (a.name === 'hop') { hop = Math.sin(k * Math.PI) * .12; }
        else if (a.name === 'shake') { shk = Math.sin(k * 40) * .06 * (1 - k); }
        else if (a.name === 'nod') { b.head.rotation.x = Math.sin(k * Math.PI * 3) * .2; }
        else if (a.name === 'stomp') { hop = Math.abs(Math.sin(k * Math.PI * 4)) * .04; }
        else if (a.name === 'lean') { lean = Math.sin(k * Math.PI / 2) * .12; }
        if (k >= 1) { const cb = a.onDone; p.act = null; if (cb) cb(); }
      }
      const ka = Math.min(1, dt * 10);
      b.arm.rotation.x = lerp(b.arm.rotation.x, armX, ka);
      b.arm.rotation.y = lerp(b.arm.rotation.y, armY, ka);
      b.arm.rotation.z = lerp(b.arm.rotation.z, armZ, ka);
      b.elbow.rotation.x = lerp(b.elbow.rotation.x, elbX, ka);
      // стакан в руке держится вертикально относительно человека (плюс наклон, когда пьёт или выливает)
      if (p.cup && p.cup.parent === b.hand) {
        b.hand.updateWorldMatrix(true, false);
        b.hand.getWorldQuaternion(qa); r.getWorldQuaternion(qb);
        qa.invert().multiply(qb);
        qc.setFromEuler(eu.set(tiltX, 0, tiltZ));
        p.cup.quaternion.copy(qa).multiply(qc);
        p.cup.position.copy(cupOff).applyQuaternion(qa);
      }
      b.body.position.y += hop; b.body.rotation.z = shk; b.body.rotation.x = lerp(b.body.rotation.x, lean + p.lean, Math.min(1, dt * 5));
      // пар изо рта на морозе
      p.breathT -= dt;
      if (p.breathT < 0 && r.visible && !p.inside) {
        p.breathT = p.talk ? .45 : 2.2 + rnd() * 1.6;
        b.mouth.getWorldPosition(tmp);
        const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
        tmp.x += fx * .05; tmp.z += fz * .05;
        K.puff(tmp, { vx: fx * .18, vz: fz * .18, vy: .06, op: .22, size: .05, life: 1.3, grow: 1.1 });
      }
      // злость паром над головой
      if ((p.mood === 'furious') && rnd() < dt * 4) {
        b.head.getWorldPosition(tmp); tmp.y += .2;
        K.puff(tmp, { vy: .5, op: .5, size: .06, life: .9, color: 0xffe0d8 });
      }
      // спутники
      if (p.b.extra && p.b.extra.userData.dog) {
        const t = p.b.extra.userData.tail; t.rotation.y = Math.sin(time * 14) * .6;
        p.b.extra.position.y = moving ? Math.abs(Math.sin(p.phase * 12)) * .02 : 0;
      }
    }

    // ================================================================
    // Кошка во дворе
    // ================================================================
    const cat = new THREE.Group();
    { const B = new K.Batch(); const c = 0x3a3432;
      B.add(ico(.12, 0), c, 0, .1, 0, 0, 0, 0, .9, .75, 1.5);
      B.add(ico(.08, 0), c, 0, .2, .15);
      for (const sx of [-1, 1]) B.add(new THREE.ConeGeometry(.03, .06, 4), c, sx * .045, .28, .15);
      for (const sx of [-1, 1]) B.add(box, 0xd8c060, sx * .03, .21, .225, 0, 0, 0, .02, .015, .01, 0);
      cat.add(B.mesh());
      const tail = new THREE.Mesh(box, new THREE.MeshLambertMaterial({ color: c })); tail.scale.set(.025, .025, .22); tail.position.set(0, .12, -.2); cat.add(tail); cat.userData.tail = tail;
      cat.position.set(-2.35, 1.21, -4.55); cat.rotation.y = .5; scene.add(cat); }

    // ================================================================
    // Транспорт: автобус и машины
    // ================================================================
    const bus = new THREE.Group();
    { const B = new K.Batch();
      B.add(box, 0xe9e4d6, 0, 1.55, 0, 0, 0, 0, 11, 2.5, 2.5);
      B.add(box, 0x2b62b5, 0, .75, 0, 0, 0, 0, 11.02, .3, 2.52, .02);
      B.add(box, 0xdfe6ef, 0, 2.84, 0, 0, 0, 0, 10.6, .1, 2.3, .03);
      for (const x of [-3.6, 3.4]) for (const z of [-1.1, 1.1]) B.add(cyl(.48, .48, .3, 10), 0x141414, x, .48, z, Math.PI / 2, 0, 0);
      bus.add(B.mesh());
      const winMat = new THREE.MeshBasicMaterial({ color: 0xffe0a8, fog: false });
      for (const z of [-1.26, 1.26]) { const w = new THREE.Mesh(new THREE.BoxGeometry(9.6, .95, .02), winMat); w.position.set(-.3, 1.95, z); bus.add(w); }
      const front = new THREE.Mesh(new THREE.BoxGeometry(.02, 1.2, 2.2), new THREE.MeshBasicMaterial({ color: 0x9ab0c8, fog: false })); front.position.set(5.51, 1.9, 0); bus.add(front);
      for (const z of [-.85, .85]) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: K.glow, color: 0xfff2d0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); s.scale.set(1.3, 1.3, 1); s.position.set(5.6, .95, z); bus.add(s); }
      const sign = K.canvasTex(256, 64, (x, w, h) => { x.fillStyle = '#111'; x.fillRect(0, 0, w, h); x.fillStyle = '#ffb22e'; x.font = 'bold 40px "PT Mono", monospace'; x.fillText('47  Улица Строителей', 10, 46); });
      const sg = new THREE.Mesh(new THREE.PlaneGeometry(1.8, .38), new THREE.MeshBasicMaterial({ map: sign, fog: false })); sg.position.set(5.52, 2.6, 0); sg.rotation.y = Math.PI / 2; bus.add(sg);
      bus.position.set(-90, 0, 13.3); scene.add(bus); }
    const busState = { phase: 'idle', t: 0, onArrive: null, onLeave: null };
    api.busCall = function (onArrive, onLeave) {
      if (busState.phase !== 'idle') return false;
      busState.phase = 'in'; busState.t = 0; busState.onArrive = onArrive; busState.onLeave = onLeave;
      bus.position.x = -80; return true;
    };
    api.busState = () => busState.phase;
    function updateBus(dt) {
      const S = busState;
      if (S.phase === 'in') {
        const d = 6.5 - bus.position.x;
        bus.position.x += Math.max(.6, Math.min(14, d * .9)) * dt;
        if (d < .05) { S.phase = 'stop'; S.t = 0; if (S.onArrive) S.onArrive(); }
      } else if (S.phase === 'stop') {
        S.t += dt; if (S.t > 5) { S.phase = 'out'; S.t = 0; }
      } else if (S.phase === 'out') {
        S.t += dt; bus.position.x += Math.min(14, 1 + S.t * 3) * dt;
        if (bus.position.x > 90) { S.phase = 'idle'; if (S.onLeave) S.onLeave(); }
      }
    }
    // проезжающие машины с фарами
    const cars = [];
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group(), B = new K.Batch();
      const c = [0x2a3a52, 0x7a2a2a, 0xc8c8c0][i];
      B.add(box, c, 0, .55, 0, 0, 0, 0, 4, .6, 1.7); B.add(box, c, -.2, 1.02, 0, 0, 0, 0, 2.1, .46, 1.55);
      B.add(box, 0x1a2230, -.2, 1.03, 0, 0, 0, 0, 2.15, .36, 1.57, 0);
      for (const [dx, dz] of [[-1.3, .8], [1.3, .8], [-1.3, -.8], [1.3, -.8]]) B.add(cyl(.32, .32, .22, 8), 0x111111, dx, .32, dz, Math.PI / 2, 0, 0);
      g.add(B.mesh());
      for (const z of [-.6, .6]) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: K.glow, color: 0xfff0c8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); s.scale.set(1.1, 1.1, 1); s.position.set(2.1, .62, z); g.add(s); }
      const tl = new THREE.Sprite(new THREE.SpriteMaterial({ map: K.glow, color: 0xff3020, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); tl.scale.set(.7, .7, 1); tl.position.set(-2.05, .65, 0); g.add(tl);
      g.visible = false; scene.add(g);
      cars.push({ g, dir: 1, speed: 0, wait: 3 + i * 7 });
    }
    function updateCars(dt) {
      for (const c of cars) {
        if (!c.g.visible) {
          c.wait -= dt; if (c.wait > 0) continue;
          c.dir = rnd() < .5 ? 1 : -1; c.speed = 9 + rnd() * 6;
          c.g.position.set(-c.dir * 90, 0, c.dir > 0 ? 10.2 : 12.4); c.g.rotation.y = c.dir > 0 ? 0 : Math.PI;
          c.g.visible = true;
        }
        c.g.position.x += c.dir * c.speed * dt;
        if (Math.abs(c.g.position.x) > 92) { c.g.visible = false; c.wait = 4 + rnd() * 12; }
      }
    }
    // машина шефа
    const bossCar = new THREE.Group();
    { const B = new K.Batch(); const c = 0x121418;
      B.add(box, c, 0, .6, 0, 0, 0, 0, 4.6, .66, 1.85); B.add(box, c, -.3, 1.14, 0, 0, 0, 0, 2.5, .52, 1.7);
      B.add(box, 0x0a0e14, -.3, 1.15, 0, 0, 0, 0, 2.55, .4, 1.72, 0);
      B.add(box, 0xb8bcc4, 2.31, .55, 0, 0, 0, 0, .04, .2, 1.4);
      for (const [dx, dz] of [[-1.5, .85], [1.5, .85], [-1.5, -.85], [1.5, -.85]]) B.add(cyl(.34, .34, .24, 10), 0x0d0d0d, dx, .34, dz, Math.PI / 2, 0, 0);
      bossCar.add(B.mesh());
      for (const z of [-.65, .65]) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: K.glow, color: 0xdfe8ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); s.scale.set(1.4, 1.4, 1); s.position.set(2.4, .66, z); bossCar.add(s); }
      bossCar.visible = false; bossCar.position.set(-80, 0, 9.4); scene.add(bossCar); }
    const bossCarS = { on: false, cb: null };
    api.bossCarArrive = function (cb) { bossCar.visible = true; bossCar.position.x = -70; bossCarS.on = true; bossCarS.cb = cb; };
    function updateBossCar(dt) {
      if (!bossCarS.on) return;
      const d = 3.2 - bossCar.position.x;
      bossCar.position.x += Math.max(.3, Math.min(18, d * 1.2)) * dt;
      if (d < .03) { bossCarS.on = false; const cb = bossCarS.cb; bossCarS.cb = null; if (cb) cb(); }
    }

    api.update = function (dt, time) {
      for (const p of P.values()) updatePerson(p, dt, time);
      updatePuffs(dt);
      updateBus(dt); updateCars(dt); updateBossCar(dt);
      cat.userData.tail.rotation.y = Math.sin(time * 1.3) * .5;
      cat.children[0].rotation.x = Math.sin(time * .5) * .02;
    };
    return api;
  };
})();
