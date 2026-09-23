/* ================================================================
   Тихоречинск — жители и машины на экране.
   Жители: инстансы низкополигональных фигурок с походкой в шейдере,
   вдали — светящиеся точки. Машины: инстансы кузова, фары и стоп-сигналы,
   световые конусы фар ночью. Маркер выбранного жителя и выбор кликом.
   ================================================================ */
(function (LC) {
  'use strict';

  LC.createActors = function (THREE, R) {
    const city = LC.city, pop = LC.pop, L = LC.life, T = LC.traffic;
    const scene = R.scene, U = R.U, camera = R.camera;
    const A = {};
    const N = pop.n;

    // ================================================================
    // Жители
    // ================================================================
    const pb = new R.Builder();
    const dummy = { r: 0, g: 0, b: 0 };
    const part = (id) => ({ aPart: [id] });
    pb.box(-0.15, 0, -0.08, -0.02, 0.84, 0.08, dummy, part(1));        // левая нога
    pb.box(0.02, 0, -0.08, 0.15, 0.84, 0.08, dummy, part(2));          // правая нога
    pb.box(-0.2, 0.82, -0.12, 0.2, 1.44, 0.12, dummy, part(0));        // корпус
    pb.box(-0.29, 0.86, -0.06, -0.2, 1.42, 0.06, dummy, part(3));      // руки
    pb.box(0.2, 0.86, -0.06, 0.29, 1.42, 0.06, dummy, part(4));
    pb.box(-0.1, 1.47, -0.11, 0.1, 1.71, 0.11, dummy, part(5));        // голова
    pb.box(-0.115, 1.66, -0.13, 0.115, 1.77, 0.12, dummy, part(6));    // волосы
    pb.box(-0.16, 0.92, -0.26, 0.16, 1.36, -0.12, dummy, part(7));     // рюкзак курьера
    const pGeo = new THREE.InstancedBufferGeometry().copy(pb.geometry());
    const MAXP = N;
    const pA = new Float32Array(MAXP * 4), pB = new Float32Array(MAXP * 4);
    const pAttrA = new THREE.InstancedBufferAttribute(pA, 4); pAttrA.setUsage(THREE.DynamicDrawUsage);
    const pAttrB = new THREE.InstancedBufferAttribute(pB, 4); pAttrB.setUsage(THREE.DynamicDrawUsage);
    pGeo.setAttribute('iA', pAttrA); pGeo.setAttribute('iB', pAttrB);
    pGeo.instanceCount = 0;
    const toV3 = (arr) => arr.map((h) => new THREE.Color(h));
    const pMat = new THREE.ShaderMaterial({
      uniforms: {
        uShirt: { value: toV3(LC.CLOTH) }, uPants: { value: toV3(LC.PANTS) }, uSkin: { value: toV3(LC.SKIN) }, uHair: { value: toV3(LC.HAIR) },
        uSunDir: U.uSunDir, uSunCol: U.uSunCol, uSkyAmb: U.uSkyAmb, uGndAmb: U.uGndAmb, uNight: U.uNight, uFogCol: U.uFogCol, uFogDen: U.uFogDen, uCam: U.uCam, uTime: U.uTime,
      },
      vertexShader: `
        attribute float aPart; attribute vec4 iA; attribute vec4 iB;
        uniform vec3 uShirt[20]; uniform vec3 uPants[8]; uniform vec3 uSkin[4]; uniform vec3 uHair[7];
        uniform vec3 uCam; uniform float uTime;
        varying vec3 vCol; varying vec3 vN; varying float vDist; varying float vSel;
        vec2 rot(vec2 v, float a){ float c = cos(a), s = sin(a); return vec2(v.x*c - v.y*s, v.x*s + v.y*c); }
        void main(){
          vec3 p = position; vec3 n = normal;
          float ph = iB.x, mode = iB.y, look = iB.z, flags = iB.w;
          float walk = mode < 0.5 ? 1.0 : 0.0;
          float sw = sin(ph) * 0.62 * walk;
          if (aPart > 0.5 && aPart < 2.5) { float a = aPart < 1.5 ? sw : -sw; vec2 yz = rot(vec2(p.y - 0.84, p.z), a); p.y = yz.x + 0.84; p.z = yz.y; n.yz = rot(n.yz, a); }
          if (aPart > 2.5 && aPart < 4.5) { float a = aPart < 3.5 ? -sw * 0.8 : sw * 0.8; if (mode > 1.5) a = aPart < 3.5 ? 0.0 : -1.2 + 0.2*sin(uTime*3.0 + look); vec2 yz = rot(vec2(p.y - 1.4, p.z), a); p.y = yz.x + 1.4; p.z = yz.y; n.yz = rot(n.yz, a); }
          float courier = mod(floor(flags / 2.0), 2.0);
          if (aPart > 6.5 && courier < 0.5) p = vec3(0.0);
          p.y += abs(sin(ph)) * 0.05 * walk;
          p *= iA.w;
          float c = cos(iA.z), s = sin(iA.z);
          vec3 wp = vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c) + vec3(iA.x, 0.16, iA.y);
          vN = vec3(n.x * c + n.z * s, n.y, -n.x * s + n.z * c);
          float shirt = mod(look, 32.0), pants = mod(floor(look / 32.0), 16.0), skin = mod(floor(look / 512.0), 4.0), hair = mod(floor(look / 2048.0), 8.0);
          vec3 col = uShirt[int(shirt)];
          if (aPart > 0.5 && aPart < 2.5) col = uPants[int(pants)];
          if (aPart > 4.5 && aPart < 5.5) col = uSkin[int(skin)];
          if (aPart > 5.5 && aPart < 6.5) col = uHair[int(hair)];
          if (aPart > 6.5) col = vec3(0.95, 0.72, 0.1);
          vCol = col;
          vSel = mod(flags, 2.0);
          vDist = length(uCam - wp);
          vec4 mv = viewMatrix * vec4(wp, 1.0);
          gl_Position = projectionMatrix * mv;
          // далёкие фигурки гасим целиком (по центру инстанса), иначе треугольники растягиваются
          if (length(uCam.xz - iA.xy) > 430.0 || uCam.y > 430.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uSkyAmb; uniform vec3 uGndAmb; uniform float uNight; uniform vec3 uFogCol; uniform float uFogDen; uniform float uTime;
        varying vec3 vCol; varying vec3 vN; varying float vDist; varying float vSel;
        void main(){
          vec3 N = normalize(vN);
          vec3 l = uSunCol * max(dot(N, normalize(uSunDir)), 0.0) * 2.2 + mix(uGndAmb, uSkyAmb, N.y * 0.5 + 0.5);
          vec3 c = vCol * l + vCol * vec3(1.0, 0.8, 0.6) * uNight * 0.55;
          c += vec3(1.0, 0.72, 0.25) * vSel * (0.9 + 0.4 * sin(uTime * 6.0));
          float f = 1.0 - exp(-uFogDen * uFogDen * vDist * vDist);
          c = mix(c, uFogCol, f);
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const people = new THREE.Mesh(pGeo, pMat);
    people.frustumCulled = false;
    scene.add(people);

    // дальние жители — точки
    const ptPos = new Float32Array(MAXP * 3), ptCol = new Float32Array(MAXP * 3);
    const ptGeo = new THREE.BufferGeometry();
    const ptPosA = new THREE.BufferAttribute(ptPos, 3); ptPosA.setUsage(THREE.DynamicDrawUsage);
    const ptColA = new THREE.BufferAttribute(ptCol, 3); ptColA.setUsage(THREE.DynamicDrawUsage);
    ptGeo.setAttribute('position', ptPosA); ptGeo.setAttribute('aCol', ptColA);
    ptGeo.setDrawRange(0, 0);
    const ptMat = new THREE.ShaderMaterial({
      uniforms: { uPx: U.uPx, uNight: U.uNight, uSkyAmb: U.uSkyAmb, uSunCol: U.uSunCol, uFogCol: U.uFogCol, uFogDen: U.uFogDen },
      vertexShader: `
        attribute vec3 aCol; uniform float uPx; varying vec3 vCol; varying float vA; varying float vD;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); float d = -mv.z; vD = d;
          gl_PointSize = clamp(0.75 * uPx / max(d, 1.0), 2.6, 6.0);
          vA = smoothstep(150.0, 320.0, d); vCol = aCol; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `
        uniform float uNight; uniform vec3 uSkyAmb; uniform vec3 uSunCol; uniform vec3 uFogCol; uniform float uFogDen;
        varying vec3 vCol; varying float vA; varying float vD;
        void main(){ vec2 d = gl_PointCoord * 2.0 - 1.0; float r = dot(d, d); if (r > 1.0 || vA < 0.01) discard;
          vec3 c = vCol * (uSkyAmb * 1.3 + uSunCol * 1.0) + (vCol * 0.75 + vec3(0.42, 0.3, 0.18)) * uNight * 0.95;
          float f = 1.0 - exp(-uFogDen * uFogDen * vD * vD);
          c = mix(c, uFogCol, f * 0.85);
          gl_FragColor = vec4(c, vA * (0.9 - r * 0.5));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false,
    });
    const peoplePts = new THREE.Points(ptGeo, ptMat);
    peoplePts.frustumCulled = false; peoplePts.renderOrder = 4;
    scene.add(peoplePts);

    // упакованный облик: рубашка + брюки·32 + кожа·512 + волосы·2048
    const look = new Float32Array(N);
    const shirtRGB = new Float32Array(N * 3);
    const tmp = new THREE.Color();
    for (let id = 0; id < N; id++) {
      const k = id * 4;
      look[id] = pop.look[k] + pop.look[k + 1] * 32 + pop.look[k + 2] * 512 + pop.look[k + 3] * 2048;
      tmp.setHex(LC.CLOTH[pop.look[k]]);
      shirtRGB[id * 3] = tmp.r; shirtRGB[id * 3 + 1] = tmp.g; shirtRGB[id * 3 + 2] = tmp.b;
    }
    const courierProf = L.courierProf;

    // ================================================================
    // Машины
    // ================================================================
    function carGeo(len, wid, hBody, hCab, cabLen, cabOff, bus) {
      const b = new R.Builder();
      const hl = len / 2, hw = wid / 2;
      const P = (id) => ({ aPart: [id] });
      b.box(-hw, 0.32, -hl, hw, 0.32 + hBody, hl, dummy, P(0));                       // кузов
      if (bus) b.box(-hw + 0.02, 0.32 + hBody * 0.45, -hl + 0.3, hw - 0.02, 0.32 + hBody - 0.25, hl - 0.4, dummy, P(1)); // окна автобуса
      else b.box(-hw + 0.08, 0.32 + hBody, -cabLen / 2 + cabOff, hw - 0.08, 0.32 + hBody + hCab, cabLen / 2 + cabOff, dummy, P(1)); // салон
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(sx * hw - 0.12, 0, sz * (hl - 0.9) - 0.34, sx * hw + 0.12, 0.62, sz * (hl - 0.9) + 0.34, dummy, P(2));
      // фары и фонари
      b.box(-hw + 0.12, 0.62, hl - 0.02, -hw + 0.5, 0.82, hl + 0.04, dummy, P(3));
      b.box(hw - 0.5, 0.62, hl - 0.02, hw - 0.12, 0.82, hl + 0.04, dummy, P(3));
      b.box(-hw + 0.1, 0.66, -hl - 0.04, -hw + 0.45, 0.86, -hl + 0.02, dummy, P(4));
      b.box(hw - 0.45, 0.66, -hl - 0.04, hw - 0.1, 0.86, -hl + 0.02, dummy, P(4));
      if (!bus) b.box(-0.3, 0.32 + hBody + hCab, cabOff - 0.15, 0.3, 0.32 + hBody + hCab + 0.22, cabOff + 0.15, dummy, P(5)); // шашечки такси
      return b.geometry();
    }
    const carMat = new THREE.ShaderMaterial({
      uniforms: { uSunDir: U.uSunDir, uSunCol: U.uSunCol, uSkyAmb: U.uSkyAmb, uGndAmb: U.uGndAmb, uNight: U.uNight, uLamps: U.uLamps, uFogCol: U.uFogCol, uFogDen: U.uFogDen, uCam: U.uCam, uTime: U.uTime },
      vertexShader: `
        attribute float aPart; attribute vec4 iA; attribute vec4 iB;
        uniform vec3 uCam; uniform float uTime; uniform float uLamps;
        varying vec3 vCol; varying vec3 vN; varying float vDist; varying float vEm; varying float vPart; varying vec3 vWP;
        void main(){
          vec3 p = position;
          float flags = iB.w;
          float brake = mod(flags, 2.0), lights = mod(floor(flags / 2.0), 2.0), hazard = mod(floor(flags / 4.0), 2.0), taxi = mod(floor(flags / 8.0), 2.0), sel = mod(floor(flags / 16.0), 2.0);
          if (aPart > 4.5 && taxi < 0.5) p = vec3(0.0);
          float c = cos(iA.z), s = sin(iA.z);
          vec3 wp = vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c) + vec3(iA.x, 0.0, iA.y);
          vN = vec3(normal.x * c + normal.z * s, normal.y, -normal.x * s + normal.z * c);
          vec3 col = iB.rgb;
          float em = 0.0;
          if (aPart > 0.5 && aPart < 1.5) col = mix(vec3(0.08, 0.1, 0.13), col, 0.12);
          if (aPart > 1.5 && aPart < 2.5) col = vec3(0.05);
          if (aPart > 2.5 && aPart < 3.5) { col = vec3(1.0, 0.95, 0.82); em = lights * 3.0 + hazard * step(0.5, fract(uTime * 1.5)) * 2.0; }
          if (aPart > 3.5 && aPart < 4.5) { col = vec3(0.9, 0.08, 0.05); em = lights * 1.2 + brake * 2.6 + hazard * step(0.5, fract(uTime * 1.5)) * 2.0; }
          if (aPart > 4.5) { col = vec3(1.0, 0.85, 0.3); em = uLamps * 1.5; }
          vCol = col; vEm = em; vPart = aPart + sel * 10.0; vWP = wp;
          vDist = length(uCam - wp);
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uSkyAmb; uniform vec3 uGndAmb; uniform float uNight; uniform vec3 uFogCol; uniform float uFogDen; uniform float uTime; uniform vec3 uCam;
        varying vec3 vCol; varying vec3 vN; varying float vDist; varying float vEm; varying float vPart; varying vec3 vWP;
        void main(){
          vec3 N = normalize(vN);
          vec3 l = uSunCol * max(dot(N, normalize(uSunDir)), 0.0) * 2.2 + mix(uGndAmb, uSkyAmb, N.y * 0.5 + 0.5);
          vec3 c = vCol * l;
          // блик на кузове и стёклах
          vec3 V = normalize(uCam - vWP); vec3 H = normalize(V + normalize(uSunDir));
          float part = mod(vPart, 10.0);
          if (part < 1.5) c += uSunCol * pow(max(dot(N, H), 0.0), 40.0) * (part > 0.5 ? 0.9 : 0.45) + uSkyAmb * 0.25 * pow(1.0 - max(dot(N, V), 0.0), 3.0);
          c += vCol * vEm;
          if (vPart > 9.5) c += vec3(1.0, 0.72, 0.25) * (0.5 + 0.3 * sin(uTime * 6.0));
          float f = 1.0 - exp(-uFogDen * uFogDen * vDist * vDist);
          c = mix(c, uFogCol, f);
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    function carMesh(geo, max) {
      const g = new THREE.InstancedBufferGeometry().copy(geo);
      const a = new Float32Array(max * 4), b = new Float32Array(max * 4);
      const aa = new THREE.InstancedBufferAttribute(a, 4), ba = new THREE.InstancedBufferAttribute(b, 4);
      aa.setUsage(THREE.DynamicDrawUsage); ba.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('iA', aa); g.setAttribute('iB', ba);
      g.instanceCount = 0;
      const m = new THREE.Mesh(g, carMat);
      m.frustumCulled = false;
      scene.add(m);
      return { g, a, b, aa, ba, m };
    }
    const cars = carMesh(carGeo(4.3, 1.8, 0.68, 0.58, 2.3, -0.25, false), T.n);
    const vans = carMesh(carGeo(5.4, 2.0, 1.45, 0.0, 0.01, 0, false), T.n);
    const buses = carMesh(carGeo(11.2, 2.5, 2.7, 0, 0, 0, true), T.n);
    const carRGB = new Float32Array(T.n * 3);
    for (let c = 0; c < T.n; c++) { tmp.setHex(T.color[c]); carRGB[c * 3] = tmp.r; carRGB[c * 3 + 1] = tmp.g; carRGB[c * 3 + 2] = tmp.b; }

    // фары: конусы света на асфальте и огоньки
    const coneGeo0 = new THREE.PlaneGeometry(1, 1); coneGeo0.rotateX(-Math.PI / 2);
    const coneGeo = new THREE.InstancedBufferGeometry().copy(coneGeo0);
    const coneData = new Float32Array(T.n * 4);
    const coneAttr = new THREE.InstancedBufferAttribute(coneData, 4); coneAttr.setUsage(THREE.DynamicDrawUsage);
    coneGeo.setAttribute('iP', coneAttr); coneGeo.instanceCount = 0;
    const coneMat = new THREE.ShaderMaterial({
      uniforms: { uLamps: U.uLamps, uFogDen: U.uFogDen },
      vertexShader: `
        attribute vec4 iP; varying vec2 vUv; varying float vD;
        void main(){ vUv = uv; vec2 q = vec2(position.x * 6.0, (position.z + 0.5) * 13.0);
          float c = cos(iP.z), s = sin(iP.z);
          vec3 p = vec3(q.x * c + q.y * s, 0.28, -q.x * s + q.y * c) + vec3(iP.x, 0.0, iP.y);
          vec4 mv = modelViewMatrix * vec4(p, 1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `
        varying vec2 vUv; varying float vD; uniform float uLamps; uniform float uFogDen;
        void main(){ float along = 1.0 - vUv.y; float w = abs(vUv.x - 0.5) * 2.0;
          float a = smoothstep(1.0, 0.1, along) * smoothstep(0.0, 0.12, along) * smoothstep(0.35 + along * 0.65, 0.0, w);
          float f = exp(-uFogDen * uFogDen * vD * vD * 0.5);
          gl_FragColor = vec4(vec3(1.0, 0.88, 0.65) * a * 0.42 * uLamps * f, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const cones = new THREE.Mesh(coneGeo, coneMat); cones.frustumCulled = false; cones.renderOrder = 2;
    scene.add(cones);
    // огоньки фар (белые) и габаритов (красные) — точками, чтобы вдали был «поток огней»
    function lightPts(color, size) {
      const pos = new Float32Array(T.n * 2 * 3), inten = new Float32Array(T.n * 2);
      const g = new THREE.BufferGeometry();
      const pa = new THREE.BufferAttribute(pos, 3), ia = new THREE.BufferAttribute(inten, 1);
      pa.setUsage(THREE.DynamicDrawUsage); ia.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('position', pa); g.setAttribute('aI', ia); g.setDrawRange(0, 0);
      const m = new THREE.ShaderMaterial({
        uniforms: { uPx: U.uPx, uCol: { value: new THREE.Color(color) }, uSize: { value: size }, uFogDen: U.uFogDen },
        vertexShader: `attribute float aI; uniform float uPx; uniform float uSize; varying float vI; varying float vD;
          void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vD = -mv.z; vI = aI;
            gl_PointSize = clamp(uSize * uPx / max(-mv.z, 1.0), 2.4, 28.0); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform vec3 uCol; uniform float uFogDen; varying float vI; varying float vD;
          void main(){ vec2 d = gl_PointCoord * 2.0 - 1.0; float r = dot(d, d); if (r > 1.0) discard;
            float a = exp(-r * 4.0); float f = exp(-uFogDen * uFogDen * vD * vD * 0.45);
            gl_FragColor = vec4(uCol * a * vI * f, 1.0); }`,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      const p = new THREE.Points(g, m); p.frustumCulled = false; p.renderOrder = 5;
      scene.add(p);
      return { g, pos, inten, pa, ia };
    }
    const headPts = lightPts(0xfff0d0, 2.2);
    const tailPts = lightPts(0xff2a1a, 1.8);

    // ================================================================
    // Светофоры: цвет — из фаз симуляции
    // ================================================================
    const sig = R.signals;
    const sgPos = new Float32Array(sig.length * 3), sgCol = new Float32Array(sig.length * 3);
    sig.forEach((g, k) => { sgPos[k * 3] = g.x; sgPos[k * 3 + 1] = 3.9; sgPos[k * 3 + 2] = g.z; });
    const sgGeo = new THREE.BufferGeometry();
    sgGeo.setAttribute('position', new THREE.BufferAttribute(sgPos, 3));
    const sgColA = new THREE.BufferAttribute(sgCol, 3); sgColA.setUsage(THREE.DynamicDrawUsage);
    sgGeo.setAttribute('aCol', sgColA);
    const sgMat = new THREE.ShaderMaterial({
      uniforms: { uPx: U.uPx, uFogDen: U.uFogDen, uNight: U.uNight },
      vertexShader: `attribute vec3 aCol; uniform float uPx; varying vec3 vC; varying float vD;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vD = -mv.z; vC = aCol;
          gl_PointSize = clamp(1.3 * uPx / max(-mv.z, 1.0), 2.0, 22.0); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uFogDen; uniform float uNight; varying vec3 vC; varying float vD;
        void main(){ vec2 d = gl_PointCoord * 2.0 - 1.0; float r = dot(d, d); if (r > 1.0) discard;
          float a = exp(-r * 3.5); float f = exp(-uFogDen * uFogDen * vD * vD * 0.45);
          gl_FragColor = vec4(vC * a * f * (0.55 + 0.9 * uNight), 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const sgPts = new THREE.Points(sgGeo, sgMat); sgPts.frustumCulled = false; sgPts.renderOrder = 5;
    scene.add(sgPts);
    function updateSignals() {
      for (let k = 0; k < sig.length; k++) {
        const L2 = T.lightFor(sig[k].node, sig[k].dir);
        const j = k * 3;
        if (L2 === 2) { sgCol[j] = 0.15; sgCol[j + 1] = 1.0; sgCol[j + 2] = 0.45; }
        else if (L2 === 1) { sgCol[j] = 1.0; sgCol[j + 1] = 0.66; sgCol[j + 2] = 0.08; }
        else { sgCol[j] = 1.0; sgCol[j + 1] = 0.12; sgCol[j + 2] = 0.08; }
      }
      sgColA.needsUpdate = true;
    }

    // ================================================================
    // Маркер выбранного жителя
    // ================================================================
    const ringMat = new THREE.ShaderMaterial({
      uniforms: { uTime: U.uTime },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `varying vec2 vUv; uniform float uTime;
        void main(){ float r = length(vUv); float ph = fract(uTime * 0.6);
          float ring = smoothstep(0.08, 0.0, abs(r - (0.35 + ph * 0.6))) * (1.0 - ph);
          float core = smoothstep(0.34, 0.3, r) * smoothstep(0.22, 0.26, r);
          float a = ring * 0.8 + core * 0.9; if (a < 0.01) discard;
          gl_FragColor = vec4(vec3(1.0, 0.72, 0.3) * a * 1.6, a); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const marker = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), ringMat);
    marker.scale.set(7, 1, 7); marker.visible = false; marker.renderOrder = 6;
    scene.add(marker);
    const pinMat = new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.85, depthWrite: false });
    const pin = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.2, 4).rotateX(Math.PI), pinMat);
    pin.visible = false; pin.renderOrder = 6;
    scene.add(pin);
    // сияние окна выбранного жителя
    const wgGeo = new THREE.BufferGeometry();
    wgGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
    const wgMat = new THREE.ShaderMaterial({
      uniforms: { uPx: U.uPx, uTime: U.uTime },
      vertexShader: `uniform float uPx; uniform float uTime; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = clamp(9.0 * uPx / max(-mv.z, 1.0), 18.0, 90.0) * (0.9 + 0.15 * sin(uTime * 4.0)); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uTime; void main(){ vec2 d = gl_PointCoord * 2.0 - 1.0; float r = dot(d, d); if (r > 1.0) discard;
        float a = exp(-r * 3.0) * 0.9 + exp(-r * 25.0) * 0.8; gl_FragColor = vec4(vec3(1.0, 0.7, 0.28) * a, 1.0); }`,
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    });
    const winGlow = new THREE.Points(wgGeo, wgMat);
    winGlow.frustumCulled = false; winGlow.visible = false; winGlow.renderOrder = 7;
    scene.add(winGlow);
    A.selected = -1;
    A.selectedCar = -1;
    A.focus = new THREE.Vector3();
    A.focusKind = 'none';

    // ================================================================
    // Кадр: заполнить инстансы
    // ================================================================
    const walkers = L.walkers;
    let visCount = 0;
    const visIds = new Int32Array(N);
    A.update = function (time) {
      const cam = camera.position;
      // --- жители ---
      let n = 0;
      const sel = A.selected;
      for (let k = 0; k < walkers.length; k++) {
        const id = walkers[k];
        const st = L.st[id];
        const j = n * 4;
        pA[j] = L.x[id]; pA[j + 1] = L.z[id]; pA[j + 2] = L.hd[id]; pA[j + 3] = pop.height[id] * (pop.age[id] < 14 ? 1.0 : 1.02);
        pB[j] = L.ph[id]; pB[j + 1] = st === 1 ? 0 : st === 5 ? (L.act[id] === LC.A.SMOKE ? 2 : 1) : 1; pB[j + 2] = look[id];
        pB[j + 3] = (id === sel ? 1 : 0) + (pop.prof[id] === courierProf && L.act[id] === LC.A.STREET ? 2 : 0);
        const q = n * 3;
        ptPos[q] = L.x[id]; ptPos[q + 1] = 1.25; ptPos[q + 2] = L.z[id];
        ptCol[q] = shirtRGB[id * 3]; ptCol[q + 1] = shirtRGB[id * 3 + 1]; ptCol[q + 2] = shirtRGB[id * 3 + 2];
        visIds[n] = id;
        n++;
      }
      visCount = n;
      pGeo.instanceCount = n;
      pAttrA.needsUpdate = true; pAttrB.needsUpdate = true;
      pAttrA.clearUpdateRanges(); pAttrA.addUpdateRange(0, n * 4);
      pAttrB.clearUpdateRanges(); pAttrB.addUpdateRange(0, n * 4);
      ptGeo.setDrawRange(0, n);
      ptPosA.needsUpdate = true; ptColA.needsUpdate = true;
      ptPosA.clearUpdateRanges(); ptPosA.addUpdateRange(0, n * 3);
      ptColA.clearUpdateRanges(); ptColA.addUpdateRange(0, n * 3);

      // --- машины ---
      const lampsOn = U.uLamps.value > 0.25;
      let nc = 0, nv = 0, nb = 0, ncone = 0, nh = 0, nt = 0;
      const H = headPts, TL = tailPts;
      for (let c = 0; c < T.n; c++) {
        const st = T.state[c];
        if (st === 2 || st === 5) continue; // в депо или в подземном паркинге
        const kind = T.kind[c];
        const M = kind === 2 ? buses : kind === 3 ? vans : cars;
        const idx = kind === 2 ? nb++ : kind === 3 ? nv++ : nc++;
        const j = idx * 4;
        const x = T.x[c], z = T.z[c], hd = T.hd[c];
        M.a[j] = x; M.a[j + 1] = z; M.a[j + 2] = hd; M.a[j + 3] = kind;
        M.b[j] = carRGB[c * 3]; M.b[j + 1] = carRGB[c * 3 + 1]; M.b[j + 2] = carRGB[c * 3 + 2];
        const moving = st !== 0;
        const brake = moving && (T.acc[c] < -0.6 || T.v[c] < 0.5) ? 1 : 0;
        const lights = moving && lampsOn ? 1 : 0;
        M.b[j + 3] = brake + lights * 2 + T.hazard[c] * 4 + (kind === 1 ? 8 : 0) + (c === A.selectedCar ? 16 : 0);
        if (moving && lampsOn) {
          const fx = Math.sin(hd), fz = Math.cos(hd);
          const hl = T.LEN[kind] / 2;
          if (st === 1) { const q = ncone * 4; coneData[q] = x + fx * (hl + 0.3); coneData[q + 1] = z + fz * (hl + 0.3); coneData[q + 2] = hd; ncone++; }
          const px = -fz, pz = fx;
          const hq = nh * 3;
          H.pos[hq] = x + fx * hl + px * 0.6; H.pos[hq + 1] = 0.75; H.pos[hq + 2] = z + fz * hl + pz * 0.6; H.inten[nh++] = 1.0;
          H.pos[hq + 3] = x + fx * hl - px * 0.6; H.pos[hq + 4] = 0.75; H.pos[hq + 5] = z + fz * hl - pz * 0.6; H.inten[nh++] = 1.0;
          const tq = nt * 3, ti = brake ? 1.0 : 0.45;
          TL.pos[tq] = x - fx * hl + px * 0.6; TL.pos[tq + 1] = 0.78; TL.pos[tq + 2] = z - fz * hl + pz * 0.6; TL.inten[nt++] = ti;
          TL.pos[tq + 3] = x - fx * hl - px * 0.6; TL.pos[tq + 4] = 0.78; TL.pos[tq + 5] = z - fz * hl - pz * 0.6; TL.inten[nt++] = ti;
        }
      }
      for (const [M, cnt] of [[cars, nc], [vans, nv], [buses, nb]]) {
        M.g.instanceCount = cnt;
        M.aa.needsUpdate = true; M.ba.needsUpdate = true;
        M.aa.clearUpdateRanges(); M.aa.addUpdateRange(0, cnt * 4);
        M.ba.clearUpdateRanges(); M.ba.addUpdateRange(0, cnt * 4);
      }
      coneGeo.instanceCount = ncone; coneAttr.needsUpdate = true; coneAttr.clearUpdateRanges(); coneAttr.addUpdateRange(0, ncone * 4);
      for (const [P, cnt] of [[H, nh], [TL, nt]]) {
        P.g.setDrawRange(0, cnt);
        P.pa.needsUpdate = true; P.ia.needsUpdate = true;
        P.pa.clearUpdateRanges(); P.pa.addUpdateRange(0, cnt * 3);
        P.ia.clearUpdateRanges(); P.ia.addUpdateRange(0, cnt);
      }
      A.visiblePeople = visCount; A.visibleCars = nc + nv + nb;
      updateSignals();

      // --- окно квартиры выбранного жителя, если он дома ---
      if (sel >= 0 && L.inB[sel] === pop.home[sel] && L.inV[sel] < 0) {
        if (winFor !== sel) { winFor = sel; winSel = aptWindow(sel); }
        if (winSel) U.uSel.value.set(winSel[0], winSel[1], winSel[2], winSel[3]);
      } else U.uSel.value.set(-1, 0, 0, 0);

      // --- маркер ---
      const f = A.getFocus();
      winGlow.visible = !!f && A.focusKind === 'window';
      if (winGlow.visible) winGlow.position.set(f.x, f.y, f.z);
      if (f) {
        marker.visible = A.focusKind !== 'window'; pin.visible = true;
        marker.position.set(f.x, 0.3, f.z);
        const dist = cam.distanceTo(marker.position);
        const s = Math.max(4, dist * 0.028);
        marker.scale.set(s, 1, s);
        pin.position.set(f.x, (f.y || 0) + 3.2 + dist * 0.012 + Math.sin(time * 3) * 0.3, f.z);
        pin.scale.setScalar(Math.max(1, dist * 0.012));
      } else { marker.visible = false; pin.visible = false; }
    };

    // квартира → этаж, колонка окон и фасад (так же, как считает шейдер окон)
    let winFor = -1, winSel = null;
    function aptWindow(id) {
      const B = city.buildings[pop.home[id]];
      const p = B.parts[0];
      if (!p || p.style > 3.5) return null;
      const cw = R.COLW[p.style];
      const perFloor = Math.max(1, Math.ceil(B.apts / Math.max(1, B.floors - 1)));
      const floor = Math.min(B.floors - 1, 1 + Math.floor((pop.apt[id] - 1) / perFloor));
      const side = B.side;
      const u0 = side === 0 || side === 2 ? p.x - p.w / 2 : p.z - p.d / 2;
      const u1 = side === 0 || side === 2 ? p.x + p.w / 2 : p.z + p.d / 2;
      const c0 = Math.floor(u0 / cw) + 1, c1 = Math.floor(u1 / cw) - 1;
      const n = Math.max(1, c1 - c0 + 1);
      const col = c0 + ((pop.apt[id] - 1) % perFloor) % n;
      return [B.id, floor, col, side];
    }
    A.aptWindow = aptWindow;

    // где сейчас выбранный житель: на улице, в машине, в здании, в метро
    const focusOut = new THREE.Vector3();
    A.getFocus = function () {
      const id = A.selected;
      if (id < 0) return null;
      const st = L.st[id];
      A.selectedCar = -1;
      if (st === 1 || st === 2 || st === 5) { A.focusKind = 'street'; return focusOut.set(L.x[id], 0, L.z[id]); }
      if (st === 4) {
        const c = T.carOfDriver(id);
        if (c >= 0) { A.selectedCar = c; A.focusKind = 'car'; return focusOut.set(T.x[c], 0.6, T.z[c]); }
      }
      if (st === 3) {
        const tr = L.trip[id]; const leg = tr && tr.legs[tr.li];
        const s = leg && leg.k === 'metro' ? city.stations[leg.b] : null;
        if (s) { A.focusKind = 'metro'; return focusOut.set(s.px, 0, s.pz); }
      }
      const b = L.inB[id] >= 0 ? L.inB[id] : pop.home[id];
      const B = city.buildings[b];
      // дома — смотрим на окно его квартиры
      if (b === pop.home[id] && L.inV[id] < 0) {
        if (winFor !== id) { winFor = id; winSel = aptWindow(id); }
        if (winSel) {
          const p = B.parts[0], cw = R.COLW[p.style], side = winSel[3];
          const u = (winSel[2] + 0.5) * cw, y = (winSel[1] + 0.55) * B.floorH;
          A.focusKind = 'window';
          if (side === 0) return focusOut.set(u, y, p.z - p.d / 2 - 0.6);
          if (side === 2) return focusOut.set(u, y, p.z + p.d / 2 + 0.6);
          if (side === 1) return focusOut.set(p.x + p.w / 2 + 0.6, y, u);
          return focusOut.set(p.x - p.w / 2 - 0.6, y, u);
        }
      }
      A.focusKind = 'building';
      return focusOut.set(B.doorX, 0, B.doorZ);
    };

    // ================================================================
    // Выбор кликом: ближайший к курсору житель или машина
    // ================================================================
    const v3 = new THREE.Vector3();
    A.pick = function (cx, cy, radius) {
      const w = window.innerWidth, h = window.innerHeight;
      let best = null, bd = radius * radius;
      camera.updateMatrixWorld();
      for (let k = 0; k < visCount; k++) {
        const id = visIds[k];
        v3.set(L.x[id], 1.0 * pop.height[id], L.z[id]).project(camera);
        if (v3.z > 1 || v3.z < -1) continue;
        const sx = (v3.x * 0.5 + 0.5) * w, sy = (-v3.y * 0.5 + 0.5) * h;
        const d = (sx - cx) * (sx - cx) + (sy - cy) * (sy - cy);
        if (d < bd) { bd = d; best = { kind: 'person', id }; }
      }
      for (let c = 0; c < T.n; c++) {
        if (T.state[c] === 2 || T.state[c] === 5) continue;
        const who = T.driver[c];
        if (who < 0) continue; // припаркованные — пусто внутри
        v3.set(T.x[c], 1.0, T.z[c]).project(camera);
        if (v3.z > 1 || v3.z < -1) continue;
        const sx = (v3.x * 0.5 + 0.5) * w, sy = (-v3.y * 0.5 + 0.5) * h;
        const d = ((sx - cx) * (sx - cx) + (sy - cy) * (sy - cy)) * 1.4;
        if (d < bd) { bd = d; best = { kind: 'car', id: who, car: c }; }
      }
      return best;
    };
    A.visibleIds = () => visIds.subarray(0, visCount);
    return A;
  };
})(window.LC);
