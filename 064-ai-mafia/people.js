/* ================================================================
   people.js — низкополигональные жильцы: сборка из примитивов,
   лицо (брови, глаза, рот), руки на двухзвенной IK, жесты и эмоции.
   Фабрика вызывается из stage.js, когда three.js загружен.
   ================================================================ */
(function () {
  'use strict';

  window.PeopleFactory = function (THREE) {
    const V3 = THREE.Vector3;
    const DOWN = new V3(0, -1, 0);
    const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
    const damp = (k, dt) => 1 - Math.exp(-k * dt);
    const tA = new V3(), tB = new V3(), tC = new V3(), tD = new V3(), tE = new V3();
    const qInv = new THREE.Quaternion();

    // Геометрии общие для всех — экономим память и время старта
    const G = {
      head: new THREE.IcosahedronGeometry(0.19, 1),
      eye: new THREE.SphereGeometry(0.024, 6, 4),
      white: new THREE.SphereGeometry(0.036, 7, 5),
      brow: new THREE.BoxGeometry(0.074, 0.017, 0.02),
      mouth: new THREE.BoxGeometry(0.078, 0.018, 0.02),
      ear: new THREE.IcosahedronGeometry(0.045, 0),
      hand: new THREE.IcosahedronGeometry(0.052, 0),
      nose: new THREE.ConeGeometry(0.03, 0.085, 4),
      neck: new THREE.CylinderGeometry(0.058, 0.066, 0.12, 7),
      drop: new THREE.IcosahedronGeometry(0.022, 0),
    };
    function limb(len, r0, r1) {
      const g = new THREE.CylinderGeometry(r0, r1, len, 7);
      g.translate(0, -len / 2, 0);
      return g;
    }

    class Person {
      constructor(spec, opts) {
        this.spec = spec;
        this.seat = spec.seat;
        const L = spec.look;
        const b = L.build || 1;
        this.mats = [];
        this.root = new THREE.Group();
        this.root.name = 'person-' + spec.id;

        // Ламберт с плоским затенением: лоу-поли вид и в разы дешевле PBR на слабых GPU
        const M = (c, o = {}) => {
          const m = new THREE.MeshLambertMaterial({ color: c, flatShading: o.flat ?? true });
          m.userData.baseEmissive = new THREE.Color(0, 0, 0);
          this.mats.push(m);
          return m;
        };
        const mesh = (geo, mat, parent, x = 0, y = 0, z = 0, cast = true) => {
          const m = new THREE.Mesh(geo, mat);
          m.position.set(x, y, z);
          m.castShadow = cast;
          m.receiveShadow = true;
          (parent || this.root).add(m);
          return m;
        };
        this.mesh = mesh;

        const skin = M(L.skin);
        const cloth = M(L.torso);
        const hairM = M(L.hairColor || '#222', { r: L.hair === 'slick' ? 0.42 : 0.9 });
        const dark = M(L.eyes || '#161110', { r: 0.4 });
        const white = M('#f3ece0', { r: 0.5 });
        const browM = M(L.brows || L.hairColor || '#222');
        const lipM = M(L.lips || '#5a2622', { r: 0.6 });
        this.skinMat = skin;

        /* ---------- туловище (сидит на стуле, талия на высоте 0.52) ---------- */
        this.hips = new THREE.Group();
        this.hips.position.set(0, 0.5, 0);
        this.root.add(this.hips);
        this.torso = new THREE.Group();
        this.hips.add(this.torso);

        const h = 0.56;
        const rw = 0.2 * b;
        const prof = [
          [0.0, 0.0], [rw * 1.02, 0.0], [rw * 1.08, 0.18], [rw * 1.12, 0.36], [rw * 1.02, 0.47],
          [rw * 0.72, 0.54], [0.08, h], [0.0, h],
        ].map(([r, y]) => new THREE.Vector2(r, y));
        const tg = new THREE.LatheGeometry(prof, 8);
        const body = mesh(tg, cloth, this.torso);
        body.scale.set(1.12, 1, 0.78);
        this.body = body;

        // воротник / рубашка
        if (L.collar && L.collar !== L.torso) {
          const cg = new THREE.ConeGeometry(0.07 * b + 0.02, 0.14, 3, 1, true);
          const col = mesh(cg, M(L.collar), this.torso, 0, 0.47, rw * 0.66);
          col.rotation.x = Math.PI;
          col.scale.set(1.3, 1, 0.5);
        }
        if (L.tie) {
          const tie = mesh(new THREE.BoxGeometry(0.045, 0.22, 0.02), M(L.tie, { r: 0.5 }), this.torso, 0, 0.38, rw * 0.84);
          tie.rotation.x = -0.18;
        }
        if (L.hood) {
          const hood = mesh(new THREE.TorusGeometry(0.13 * b + 0.02, 0.05, 5, 9), M(L.collar), this.torso, 0, 0.53, -0.05);
          hood.rotation.x = Math.PI / 2 + 0.35;
          hood.scale.set(1.15, 1, 0.8);
        }
        if (L.scarf) {
          const sc = mesh(new THREE.TorusGeometry(0.1, 0.045, 5, 10), M(L.scarf), this.torso, 0, 0.55, 0);
          sc.rotation.x = Math.PI / 2;
          const tail = mesh(new THREE.BoxGeometry(0.07, 0.26, 0.035), M(L.scarf), this.torso, 0.06, 0.42, rw * 0.78);
          tail.rotation.z = 0.12;
          tail.rotation.x = -0.15;
        }
        if (L.beads) {
          const bm = M(L.beads, { r: 0.35 });
          const bg = new THREE.IcosahedronGeometry(0.018, 0);
          for (let i = 0; i < 11; i++) {
            const a = -1.25 + i * 0.25;
            mesh(bg, bm, this.torso, Math.sin(a) * 0.13, 0.52 - Math.cos(a) * 0.06 - 0.02 + Math.abs(a) * 0.02, Math.cos(a) * rw * 0.8 + 0.01, false);
          }
        }
        if (L.brooch) mesh(new THREE.IcosahedronGeometry(0.022, 0), M(L.brooch, { r: 0.3, m: 0.6 }), this.torso, 0.1, 0.44, rw * 0.9, false);

        /* ---------- шея и голова ---------- */
        mesh(G.neck, skin, this.torso, 0, 0.6, 0);
        this.head = new THREE.Group();
        this.head.position.set(0, 0.64, 0.01);
        this.head.rotation.order = 'YXZ';
        this.torso.add(this.head);
        const face = new THREE.Group();
        face.position.y = 0.17;
        this.head.add(face);
        this.face = face;
        const skull = mesh(G.head, skin, face);
        skull.scale.set(0.98, 1.08, 0.96);
        this.skull = skull;
        mesh(G.ear, skin, face, 0.19, 0.0, -0.01).scale.set(0.5, 1, 0.8);
        mesh(G.ear, skin, face, -0.19, 0.0, -0.01).scale.set(0.5, 1, 0.8);
        const nose = mesh(G.nose, skin, face, 0, -0.01, 0.19);
        nose.rotation.x = Math.PI / 2 + 0.25;
        nose.scale.setScalar(L.nose || 1);

        // глаза: белок + зрачок, моргают масштабом
        this.eyes = [];
        for (const s of [-1, 1]) {
          const g = new THREE.Group();
          g.position.set(s * 0.068, 0.028, 0.158);
          face.add(g);
          const w = mesh(G.white, white, g, 0, 0, 0, false);
          w.scale.set(1, 1, 0.55);
          const p = mesh(G.eye, dark, g, 0, 0, 0.013, false);
          this.eyes.push({ g, p });
        }
        // брови
        this.brows = [];
        for (const s of [-1, 1]) {
          const br = mesh(G.brow, browM, face, s * 0.07, 0.092, 0.172, false);
          br.scale.set(L.browScale || 1, (L.browScale || 1) * 1.1, 1);
          this.brows.push({ m: br, s, y0: 0.092 });
        }
        // рот
        this.mouth = mesh(G.mouth, lipM, face, 0, -0.082, 0.168, false);
        this.mouth.scale.set(1, 0.8, 1);
        // капля пота (для страха)
        this.drop = mesh(G.drop, M('#bfe0f2', { r: 0.1, flat: false }), face, 0.16, 0.08, 0.1, false);
        this.drop.scale.set(0.8, 1.3, 0.8);
        this.drop.visible = false;

        /* ---------- причёски и головные уборы ---------- */
        const cap = (r, thetaLen, rx = 0, sy = 1) => {
          const g = new THREE.SphereGeometry(r, 9, 6, 0, Math.PI * 2, 0, thetaLen);
          const m = mesh(g, hairM, face, 0, 0.0, 0);
          m.rotation.x = rx;
          m.scale.y = sy;
          return m;
        };
        switch (L.hair) {
          case 'messy': {
            cap(0.205, 1.25, -0.35, 1.08);
            const tuft = new THREE.IcosahedronGeometry(0.075, 0);
            [[0.06, 0.2, 0.05], [-0.07, 0.2, 0.02], [0.0, 0.22, -0.06], [0.12, 0.15, -0.04], [-0.13, 0.14, -0.05], [0.03, 0.17, 0.12], [-0.05, 0.16, 0.12]]
              .forEach(([x, y, z], i) => { const t = mesh(tuft, hairM, face, x, y, z); t.rotation.set(i, i * 2, i * 0.5); t.scale.setScalar(0.8 + (i % 3) * 0.15); });
            break;
          }
          case 'bun': {
            cap(0.207, 1.35, -0.25, 1.1);
            mesh(new THREE.IcosahedronGeometry(0.11, 1), hairM, face, 0, 0.2, -0.1).scale.set(1.1, 0.9, 1);
            break;
          }
          case 'greybun': {
            cap(0.205, 1.3, -0.3, 1.06);
            mesh(new THREE.IcosahedronGeometry(0.075, 1), hairM, face, 0, 0.1, -0.2);
            break;
          }
          case 'long': {
            cap(0.21, 1.45, -0.2, 1.1);
            const back = mesh(new THREE.BoxGeometry(0.4, 0.42, 0.14), hairM, face, 0, -0.12, -0.1);
            back.rotation.x = 0.08;
            mesh(new THREE.BoxGeometry(0.08, 0.36, 0.12), hairM, face, 0.17, -0.1, 0.02);
            mesh(new THREE.BoxGeometry(0.08, 0.36, 0.12), hairM, face, -0.17, -0.1, 0.02);
            break;
          }
          case 'slick': {
            const s = cap(0.207, 1.2, -0.55, 1.05);
            s.scale.set(1.02, 1.05, 1.08);
            break;
          }
          case 'bald': {
            // венчик волос: дуга 216° вокруг затылка, разрыв — спереди (над лицом),
            // к затылку венчик опускается
            const ring = mesh(new THREE.TorusGeometry(0.175, 0.04, 5, 12, Math.PI * 1.2), hairM, face, 0, 0.02, -0.01);
            ring.rotation.set(Math.PI / 2 - 0.25, 0, Math.PI * 0.9);
            break;
          }
          case 'cap': {
            cap(0.2, 1.2, -0.2, 1.0);
            const crown = mesh(new THREE.CylinderGeometry(0.21, 0.215, 0.09, 10), M(L.hat), face, 0, 0.15, -0.01);
            crown.scale.set(1, 1, 1.04);
            crown.rotation.x = -0.12;
            const visor = mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.018, 10, 1, false, -Math.PI / 2, Math.PI), M(L.hat), face, 0, 0.12, 0.13);
            visor.rotation.x = 0.1;
            visor.scale.set(1.2, 1, 1);
            break;
          }
        }
        if (L.beret) {
          const be = mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.07, 10), M(L.beret), face, 0.04, 0.19, -0.02);
          be.rotation.set(-0.2, 0, -0.28);
        }
        if (L.moustache) {
          const mu = mesh(new THREE.BoxGeometry(0.13, 0.035, 0.04), M(L.moustache), face, 0, -0.052, 0.18, false);
          mu.rotation.x = 0.2;
        }
        if (L.stubble) {
          const st = mesh(new THREE.SphereGeometry(0.188, 9, 4, Math.PI * 0.12, Math.PI * 0.76, Math.PI * 0.58, Math.PI * 0.32), M(L.stubble), face, 0, 0, 0.004, false);
          st.scale.set(1.0, 1.08, 0.99);
        }
        if (L.earrings) {
          const em = M(L.earrings, { r: 0.3, m: 0.7 });
          mesh(new THREE.IcosahedronGeometry(0.022, 0), em, face, 0.19, -0.07, 0, false);
          mesh(new THREE.IcosahedronGeometry(0.022, 0), em, face, -0.19, -0.07, 0, false);
        }
        if (L.glasses) {
          const gm = M(L.glasses, { r: 0.3, m: 0.5 });
          const rim = new THREE.TorusGeometry(0.048, 0.007, 4, 12);
          mesh(rim, gm, face, 0.068, 0.03, 0.19, false);
          mesh(rim, gm, face, -0.068, 0.03, 0.19, false);
          mesh(new THREE.BoxGeometry(0.04, 0.008, 0.008), gm, face, 0, 0.035, 0.195, false);
        }

        /* ---------- руки: плечо → предплечье → кисть, решаются через IK ---------- */
        const armLen = 0.27, foreLen = 0.255;
        this.arms = {};
        for (const side of ['L', 'R']) {
          const s = side === 'L' ? 1 : -1; // +x — левая рука персонажа (он смотрит в +z)
          const sh = new THREE.Group();
          sh.position.set(s * (rw * 1.08 + 0.035), 0.49, 0.0);
          this.torso.add(sh);
          const up = new THREE.Group();
          sh.add(up);
          mesh(limb(armLen, 0.058 * Math.sqrt(b), 0.05), cloth, up);
          mesh(new THREE.IcosahedronGeometry(0.066 * Math.sqrt(b), 0), cloth, up);
          const el = new THREE.Group();
          el.position.set(0, -armLen, 0);
          up.add(el);
          mesh(limb(foreLen, 0.05, 0.043), cloth, el);
          const hand = mesh(G.hand, skin, el, 0, -foreLen - 0.03, 0);
          hand.scale.set(0.95, 1.2, 0.75);
          const rest = new V3(s * 0.15, 0.24, 0.43);
          this.arms[side] = {
            s, sh, up, el, hand, a: armLen, b: foreLen,
            pole: new V3(s * 0.75, -0.35, -0.55).normalize(),
            cur: rest.clone(), goal: rest.clone(), k: 9,
          };
        }
        // сигарета в правой руке (только у Семёныча)
        if (spec.id === 'semen') {
          const cig = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.09, 5), M('#efe9df'), this.arms.R.el, 0.03, -foreLen - 0.05, 0.03, false);
          cig.rotation.z = 1.2;
          this.cigTip = new THREE.Object3D();
          this.cigTip.position.set(0.075, -foreLen - 0.03, 0.03);
          this.arms.R.el.add(this.cigTip);
        }

        /* ---------- состояние ---------- */
        this.state = {
          emotion: 'neutral', talking: false, sleeping: false, thinking: false,
          look: null, lookCam: false, yaw: 0, pitch: 0, lean: 0, leanGoal: 0,
          blinkT: 1 + Math.random() * 3, blink: 0, mouth: 0,
          gesture: null, gT: 0, gTarget: null, gHold: 0,
          browGoal: [0, 0, 0, 0], brow: [0, 0, 0, 0], eyeOpen: 1, eyeGoal: 1,
          mouthW: 1, mouthWGoal: 1, mouthTilt: 0, mouthTiltGoal: 0,
          fade: 1, fadeGoal: 1, removing: 0, phase: Math.random() * 10,
          hover: 0, hoverGoal: 0, shrug: 0, shrugGoal: 0, drop: 0,
        };
        this.opts = opts || {};
        this.setEmotion('neutral');
      }

      /* ---------- эмоции: брови, глаза, рот, осанка ---------- */
      setEmotion(e) {
        const st = this.state;
        st.emotion = e;
        const P = {
          neutral: { brow: [0, 0, 0, 0], eye: 1, mw: 1, tilt: 0, lean: 0 },
          angry: { brow: [0.38, -0.012, 0.38, -0.012], eye: 0.72, mw: 1.18, tilt: 0, lean: 0.14 },
          fear: { brow: [-0.34, 0.02, -0.34, 0.02], eye: 1.28, mw: 0.8, tilt: 0, lean: -0.1 },
          surprise: { brow: [0, 0.035, 0, 0.035], eye: 1.32, mw: 0.9, tilt: 0, lean: -0.04 },
          irony: { brow: [0.1, 0.035, -0.12, -0.006], eye: 0.8, mw: 1.05, tilt: 0.22, lean: -0.08 },
          sad: { brow: [-0.3, 0.008, -0.3, 0.008], eye: 0.85, mw: 0.9, tilt: 0, lean: 0.07 },
          calm: { brow: [0.05, 0, 0.05, 0], eye: 0.9, mw: 1, tilt: 0, lean: 0.03 },
        }[e] || { brow: [0, 0, 0, 0], eye: 1, mw: 1, tilt: 0, lean: 0 };
        st.browGoal = P.brow;
        st.eyeGoal = P.eye;
        st.mouthWGoal = P.mw;
        st.mouthTiltGoal = P.tilt;
        st.leanGoal = P.lean;
        st.drop = e === 'fear' ? 1 : 0;
      }

      /* ---------- жесты: цели для кистей в пространстве туловища ---------- */
      gesture(name, targetWorld, hold) {
        const st = this.state;
        st.gesture = name;
        st.gT = 0;
        st.gTarget = targetWorld ? targetWorld.clone() : null;
        st.gHold = hold ?? 2.4;
      }

      handGoals(dt, t) {
        const st = this.state;
        const A = this.arms;
        const rest = (side, dx = 0, dy = 0, dz = 0) => A[side].goal.set(A[side].s * 0.15 + dx, 0.24 + dy, 0.43 + dz);
        let kL = 9, kR = 9;
        rest('L'); rest('R');
        st.shrugGoal = 0;
        if (st.gesture) {
          st.gT += dt;
          const g = st.gesture, T = st.gT;
          if (T > st.gHold && g !== 'sleep' && g !== 'point' && g !== 'vote') st.gesture = null;
          if ((g === 'point' || g === 'vote') && T > st.gHold) st.gesture = null;
          const wave = Math.sin(t * 5.2 + st.phase) * 0.03;
          switch (g) {
            case 'point':
            case 'vote': {
              const tgt = st.gTarget;
              if (tgt) {
                const loc = this.torso.worldToLocal(tA.copy(tgt));
                const side = loc.x >= 0 ? 'L' : 'R';
                const arm = A[side];
                const dir = tB.copy(loc).sub(arm.sh.position).normalize();
                if (g === 'vote') dir.y += 0.25;
                dir.normalize();
                arm.goal.copy(arm.sh.position).addScaledVector(dir, (arm.a + arm.b) * 0.96);
                if (side === 'L') kL = 7; else kR = 7;
              }
              break;
            }
            case 'fist': {
              const up = T < 0.32, slam = T >= 0.32 && T < 0.5;
              if (up) { A.R.goal.set(-0.12, 0.58, 0.32); kR = 12; }
              else if (slam) { A.R.goal.set(-0.1, 0.24, 0.44); kR = 40; }
              else { A.R.goal.set(-0.1, 0.24, 0.44); }
              if (T >= 0.42 && !st.slammed) { st.slammed = true; this.opts.onSlam && this.opts.onSlam(this); }
              if (T < 0.1) st.slammed = false;
              break;
            }
            case 'palms':
              A.L.goal.set(0.2, 0.42 + wave, 0.38);
              A.R.goal.set(-0.2, 0.42 - wave, 0.38);
              break;
            case 'hands':
              A.L.goal.set(0.24, 0.74, 0.22);
              A.R.goal.set(-0.24, 0.74, 0.22);
              kL = kR = 11;
              break;
            case 'shrug':
              A.L.goal.set(0.36, 0.36, 0.26);
              A.R.goal.set(-0.36, 0.36, 0.26);
              st.shrugGoal = 1;
              break;
            case 'cross':
              A.L.goal.set(-0.1, 0.34, 0.27);
              A.R.goal.set(0.1, 0.37, 0.28);
              break;
            case 'chin':
              A.R.goal.set(-0.02, 0.69, 0.25);
              break;
            case 'facepalm':
              A.R.goal.set(0.0, 0.88, 0.21);
              break;
            case 'smoke': {
              const ph = (T % 3.2) / 3.2;
              if (ph < 0.35) A.R.goal.set(-0.03, 0.72, 0.24); else A.R.goal.set(-0.2, 0.36, 0.4);
              break;
            }
            case 'talk':
              A.R.goal.set(-0.2, 0.4 + wave * 1.5, 0.42 + wave);
              break;
            case 'sleep':
              A.L.goal.set(0.12, 0.26, 0.4);
              A.R.goal.set(-0.12, 0.26, 0.4);
              break;
          }
        } else if (st.talking) {
          const w = Math.sin(t * 4.1 + st.phase);
          A.R.goal.set(-0.19, 0.36 + w * 0.04, 0.42);
        }
        if (st.thinking && !st.gesture) {
          if (this.spec.id === 'semen') {
            const ph = (t % 3.4) / 3.4;
            if (ph < 0.3) A.R.goal.set(-0.03, 0.72, 0.24); else A.R.goal.set(-0.2, 0.36, 0.4);
          } else A.R.goal.set(-0.02, 0.69, 0.25);
        }
        A.L.k = kL; A.R.k = kR;
      }

      solveArm(arm) {
        const S = arm.sh.position;
        const v = tA.copy(arm.cur).sub(S);
        let d = v.length();
        const a = arm.a, b = arm.b;
        d = clamp(d, Math.abs(a - b) + 0.01, a + b - 0.002);
        const u = v.normalize();
        const p = tB.copy(arm.pole).addScaledVector(u, -arm.pole.dot(u));
        if (p.lengthSq() < 1e-6) p.set(0, 0, -1);
        p.normalize();
        const cosA = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
        const sinA = Math.sqrt(1 - cosA * cosA);
        const E = tC.copy(u).multiplyScalar(cosA * a).addScaledVector(p, sinA * a);
        const T = tD.copy(u).multiplyScalar(d);
        arm.up.quaternion.setFromUnitVectors(DOWN, tE.copy(E).normalize());
        const fore = T.sub(E).normalize().applyQuaternion(qInv.copy(arm.up.quaternion).invert());
        arm.el.quaternion.setFromUnitVectors(DOWN, fore);
      }

      /* ---------- кадр ---------- */
      update(dt, t, ctx) {
        const st = this.state;
        // куда смотрим
        let lookW = null;
        if (st.sleeping) lookW = null;
        else if (st.lookCam) lookW = ctx.camPos;
        else if (st.look) lookW = st.look;
        let yawG = 0, pitchG = 0.05;
        if (lookW) {
          const loc = this.root.worldToLocal(tA.copy(lookW));
          const hy = 1.3;
          yawG = clamp(Math.atan2(loc.x, loc.z), -1.25, 1.25);
          pitchG = clamp(-Math.atan2(loc.y - hy, Math.hypot(loc.x, loc.z)), -0.45, 0.5);
        } else {
          yawG = Math.sin(t * 0.23 + st.phase) * 0.25;
          pitchG = 0.08 + Math.sin(t * 0.31 + st.phase * 2) * 0.05;
        }
        if (st.sleeping) { yawG = 0; pitchG = 0.62; }
        st.yaw += (yawG - st.yaw) * damp(4, dt);
        st.pitch += (pitchG - st.pitch) * damp(4, dt);
        const talkBob = st.talking ? Math.sin(t * 7.3) * 0.035 : 0;
        this.head.rotation.y = st.yaw * 0.72;
        this.head.rotation.x = st.pitch + talkBob;
        this.head.rotation.z = st.emotion === 'irony' ? 0.1 : st.gesture === 'shrug' ? 0.12 : 0;
        // корпус поворачивается следом за головой
        this.torso.rotation.y += (st.yaw * 0.28 - this.torso.rotation.y) * damp(3, dt);
        // наклон
        let leanG = st.leanGoal + (st.talking ? 0.06 : 0) + (st.gesture === 'point' || st.gesture === 'fist' ? 0.1 : 0);
        if (st.sleeping) leanG = 0.2;
        st.lean += (leanG - st.lean) * damp(3, dt);
        const breathe = Math.sin(t * 1.6 + st.phase) * 0.012;
        this.torso.rotation.x = st.lean;
        this.torso.position.y = breathe;
        st.shrug += (st.shrugGoal - st.shrug) * damp(8, dt);
        this.arms.L.sh.position.y = 0.49 + st.shrug * 0.05;
        this.arms.R.sh.position.y = 0.49 + st.shrug * 0.05;

        // руки
        this.handGoals(dt, t);
        for (const k of ['L', 'R']) {
          const arm = this.arms[k];
          arm.cur.lerp(arm.goal, damp(arm.k, dt));
          this.solveArm(arm);
        }

        // моргание
        st.blinkT -= dt;
        if (st.blinkT < 0) { st.blink = 0.14; st.blinkT = 2 + Math.random() * 4; }
        st.blink = Math.max(0, st.blink - dt);
        st.eyeOpen += (st.eyeGoal - st.eyeOpen) * damp(8, dt);
        const lid = st.sleeping ? 0.08 : (st.blink > 0 ? 0.1 : st.eyeOpen);
        for (const e of this.eyes) e.g.scale.set(1, lid, 1);
        // брови
        for (let i = 0; i < 4; i++) st.brow[i] += (st.browGoal[i] - st.brow[i]) * damp(7, dt);
        for (const br of this.brows) {
          const i = br.s < 0 ? 0 : 2;
          // внутренний конец брови ближе к x=0: знак поворота зависит от стороны
          br.m.rotation.z = br.s * st.brow[i];
          br.m.position.y = br.y0 + st.brow[i + 1];
        }
        // рот
        let open = 0;
        if (st.talking) open = 0.35 + 0.65 * Math.abs(Math.sin(t * 15 + Math.sin(t * 4.3) * 2));
        if (st.emotion === 'surprise' || st.emotion === 'fear') open = Math.max(open, 0.6);
        st.mouth += (open - st.mouth) * damp(20, dt);
        st.mouthW += (st.mouthWGoal - st.mouthW) * damp(6, dt);
        st.mouthTilt += (st.mouthTiltGoal - st.mouthTilt) * damp(6, dt);
        this.mouth.scale.set(st.mouthW * (1 - st.mouth * 0.25), 0.8 + st.mouth * 2.6, 1);
        this.mouth.rotation.z = st.mouthTilt;
        this.mouth.position.x = st.mouthTilt * 0.05;
        // пот
        if (st.drop && !st.sleeping) {
          this.drop.visible = true;
          const ph = (t * 0.45 + st.phase) % 1;
          this.drop.position.set(0.165, 0.1 - ph * 0.12, 0.09);
        } else this.drop.visible = false;

        // подсветка при наведении
        st.hover += (st.hoverGoal - st.hover) * damp(10, dt);
        // исчезновение
        st.fade += (st.fadeGoal - st.fade) * damp(st.removing ? 1.6 : 6, dt);
        if (st.removing) {
          st.removing = Math.min(1, st.removing + dt * 0.6);
          this.root.position.copy(this.home).addScaledVector(this.back, st.removing * 0.9);
          this.root.position.y = this.home.y - st.removing * 0.15;
        }
        this.applyMats();
      }

      applyMats() {
        const st = this.state;
        const f = st.fade;
        const needT = f < 0.995;
        const glow = st.hover * 0.16;
        if (this._lastF === f && this._lastG === glow) return;
        this._lastF = f; this._lastG = glow;
        for (const m of this.mats) {
          if (m.transparent !== needT) { m.transparent = needT; m.needsUpdate = true; }
          m.opacity = f;
          m.emissive.setRGB(glow * 1.0, glow * 0.62, glow * 0.3);
        }
        this.root.visible = f > 0.02;
      }

      place(pos, lookAt) {
        this.root.position.copy(pos);
        this.root.lookAt(lookAt.x, pos.y, lookAt.z);
        this.home = pos.clone();
        this.back = new V3(pos.x - lookAt.x, 0, pos.z - lookAt.z).normalize();
      }

      headWorld(out) {
        return this.face.getWorldPosition(out);
      }

      snap() {
        // мгновенно применить позы (для обложки)
        const st = this.state;
        st.brow = st.browGoal.slice();
        st.eyeOpen = st.eyeGoal;
        st.mouthW = st.mouthWGoal;
        st.mouthTilt = st.mouthTiltGoal;
        st.lean = st.leanGoal;
        for (const k of ['L', 'R']) this.arms[k].cur.copy(this.arms[k].goal);
      }
    }

    return { Person };
  };
})();
