/* ================================================================
   Тихоречинск — небо, вода и свет по времени суток.
   Солнце считается по широте 55° и дню равноденствия; ключевые кадры неба:
   ночь → синий час → золотой час → день. Река отражает небо и фонари
   набережной. Туман в цвет горизонта, луна и звёзды ночью.
   ================================================================ */
(function (LC) {
  'use strict';
  LC.createSky = function (THREE, R) {
    const city = LC.city, U = R.U, scene = R.scene, renderer = R.renderer, sun = R.sun, hemi = R.hemi;
    // ================================================================
    // Небо
    // ================================================================
    const skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uSunDir: U.uSunDir, uNight: U.uNight, uTime: U.uTime,
        uZen: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() }, uFog: U.uFogCol,
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
      fragmentShader: `
        varying vec3 vDir; uniform vec3 uSunDir; uniform float uNight; uniform float uTime;
        uniform vec3 uZen; uniform vec3 uHor; uniform vec3 uGlow; uniform vec3 uFog;
        float h3(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
        void main(){
          vec3 d = normalize(vDir);
          float y = max(d.y, -0.2);
          float t = pow(1.0 - max(y, 0.0), 3.2);
          vec3 c = mix(uZen, uHor, t);
          // зарево у солнца
          float sd = max(dot(d, normalize(uSunDir)), 0.0);
          float hz = exp(-max(y,0.0)*6.0);
          c += uGlow * (pow(sd, 6.0) * 0.9 + pow(sd, 1.5) * 0.25) * hz;
          c += vec3(1.0,0.92,0.75) * smoothstep(0.9993, 0.9998, sd) * (1.0 - uNight) * 2.5;
          // городское зарево ночью у горизонта
          c += vec3(0.20,0.11,0.05) * uNight * exp(-max(y,0.0)*9.0) * 0.8;
          // звёзды
          if (uNight > 0.02 && d.y > 0.02) {
            vec3 q = floor(d * 420.0);
            float s = h3(q);
            float tw = 0.7 + 0.3*sin(uTime*2.0 + s*50.0);
            c += vec3(0.85,0.9,1.0) * step(0.9965, s) * uNight * smoothstep(0.02, 0.25, d.y) * tw * 0.9;
          }
          // луна
          vec3 md = normalize(vec3(-0.45, 0.55, -0.7));
          float mdot = dot(d, md);
          c += vec3(0.9,0.92,1.0) * smoothstep(0.99955, 0.9997, mdot) * uNight * 1.4;
          c += vec3(0.25,0.3,0.4) * pow(max(mdot,0.0), 60.0) * uNight * 0.25;
          c = mix(c, uFog, smoothstep(0.07, -0.03, d.y));
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(6500, 32, 16), skyMat);
    sky.renderOrder = -10;
    sky.frustumCulled = false;
    scene.add(sky);
    R.skyMat = skyMat;

    // ================================================================
    // Река и пруд
    // ================================================================
    const waterMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: U.uTime, uNight: U.uNight, uLamps: U.uLamps, uSunDir: U.uSunDir, uSunCol: U.uSunCol,
        uHor: { value: new THREE.Color() }, uZen: { value: new THREE.Color() }, uCam: U.uCam, uFogCol: U.uFogCol, uFogDen: U.uFogDen,
        uShore: { value: city.riverZ0 }, uFar: { value: city.riverZ1 },
      },
      vertexShader: `varying vec3 vP; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `
        varying vec3 vP; uniform float uTime; uniform float uNight; uniform float uLamps; uniform vec3 uSunDir; uniform vec3 uSunCol;
        uniform vec3 uHor; uniform vec3 uZen; uniform vec3 uCam; uniform vec3 uFogCol; uniform float uFogDen; uniform float uShore; uniform float uFar;
        float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          float a = fract(sin(dot(i, vec2(127.1,311.7)))*43758.5), b = fract(sin(dot(i+vec2(1,0), vec2(127.1,311.7)))*43758.5);
          float c = fract(sin(dot(i+vec2(0,1), vec2(127.1,311.7)))*43758.5), d = fract(sin(dot(i+vec2(1,1), vec2(127.1,311.7)))*43758.5);
          return mix(mix(a,b,f.x), mix(c,d,f.x), f.y); }
        void main(){
          vec3 V = normalize(uCam - vP);
          vec2 q = vP.xz * vec2(0.05, 0.16);
          float w1 = n2(q + vec2(uTime*0.12, uTime*0.05)), w2 = n2(q*2.7 - vec2(uTime*0.1, -uTime*0.13)), w3 = n2(vP.xz * 0.6 + uTime * 0.3);
          vec3 N = normalize(vec3((w1 - 0.5) * 0.16 + (w3 - 0.5) * 0.08, 1.0, (w2 - 0.5) * 0.14 + (w3 - 0.5) * 0.06));
          float fr = pow(1.0 - max(dot(N, V), 0.0), 5.0) * 0.6 + 0.04;
          vec3 R = reflect(-V, N);
          vec3 skyc = mix(uHor, uZen, clamp(R.y * 1.6, 0.0, 1.0)) * 0.8;
          vec3 deep = vec3(0.03, 0.06, 0.075) * (1.0 - uNight * 0.75);
          vec3 c = mix(deep, skyc, fr);
          // блик солнца
          float sp = pow(max(dot(R, normalize(uSunDir)), 0.0), 220.0);
          c += uSunCol * sp * 3.0 * (1.0 - uNight);
          // отражения фонарей набережной — дрожащие столбики света
          float dz = vP.z - uShore; if (dz < 0.0) dz = 1e4;
          float xx = vP.x + (w1 - 0.5) * 2.2 + sin(vP.z * 0.35 + uTime * 1.3) * 0.6;
          float px = mod(xx, 18.0) - 9.0;
          float brk = smoothstep(0.35, 0.75, n2(vec2(vP.x * 0.9, vP.z * 0.45 - uTime * 0.6)));
          float col = exp(-px*px / 0.9) * exp(-dz / 26.0) * brk;
          c += vec3(1.0, 0.6, 0.28) * col * uLamps * 0.55;
          // далёкий берег: тёмная полоса
          c = mix(c, c * 0.6, smoothstep(uFar - 30.0, uFar, vP.z));
          float d = length(uCam - vP);
          float f = 1.0 - exp(-uFogDen * uFogDen * d * d);
          c = mix(c, uFogCol, f);
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const river = new THREE.Mesh(new THREE.PlaneGeometry(12000, city.riverZ1 - city.riverZ0 + 4).rotateX(-Math.PI / 2), waterMat);
    river.position.set(0, -0.6, (city.riverZ0 + city.riverZ1) / 2);
    scene.add(river);
    R.waterMat = waterMat;
    if (city.park && city.park.pond) {
      const pd = city.park.pond;
      const pg = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
      const pondMat = waterMat.clone();
      pondMat.uniforms = Object.assign({}, waterMat.uniforms, { uShore: { value: 1e6 }, uFar: { value: 1e7 } });
      const pond = new THREE.Mesh(pg, pondMat);
      pond.scale.set(pd.rx, 1, pd.rz); pond.position.set(pd.x, 0.2, pd.z);
      scene.add(pond);
      const rim = new THREE.Mesh(new THREE.RingGeometry(1, 1.06, 40).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x8f877a }));
      rim.scale.set(pd.rx, 1, pd.rz); rim.position.set(pd.x, 0.21, pd.z); scene.add(rim);
    }

    // ================================================================
    // Время суток → свет
    // ================================================================
    const tmpC = new THREE.Color(), tmpC2 = new THREE.Color();
    const lerpC = (out, a, b, t) => out.setRGB(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
    const K = (a, b, x) => LC.smooth(a, b, x);
    R.sunInfo = { elev: 0 };
    let lastSun = new THREE.Vector3(), shadowT = 0;
    R.setTime = function (min, dtReal) {
      const lat = 55 * Math.PI / 180, decl = -0.5 * Math.PI / 180;
      const h = ((min / 60 - 12.75) / 24) * Math.PI * 2;
      const sinE = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(h);
      const elev = Math.asin(sinE);
      const az = Math.atan2(Math.sin(h), Math.cos(h) * Math.sin(lat) - Math.tan(decl) * Math.cos(lat));
      const ed = elev * 180 / Math.PI;
      R.sunInfo.elev = ed;
      const sd = U.uSunDir.value.set(-Math.sin(az) * Math.cos(elev), Math.sin(elev), Math.cos(az) * Math.cos(elev)).normalize();
      const night = K(3, -9, ed);
      U.uNight.value = night;
      U.uLamps.value = K(5, -1, ed);
      if (U.uNightGlow) U.uNightGlow.value = K(2, -4, ed);
      U.uShop.value = (min > 8 * 60 && min < 22 * 60 + 30) ? 0.85 : min > 22 * 60 + 30 || min < 6 * 60 ? 0.12 : 0.4;
      // небо
      const day = K(-4, 18, ed), gold = K(-6, 2, ed) * (1 - K(4, 20, ed));
      // ключевые кадры неба по высоте солнца: ночь → синий час → золотой час → день
      const KEYS = [-18, -9, -4, 1, 7, 22];
      const ZEN = [[0.006, 0.01, 0.026], [0.018, 0.035, 0.1], [0.05, 0.1, 0.24], [0.2, 0.3, 0.55], [0.22, 0.38, 0.66], [0.2, 0.38, 0.7]];
      const HOR = [[0.03, 0.035, 0.06], [0.09, 0.1, 0.18], [0.36, 0.3, 0.38], [0.92, 0.58, 0.36], [0.9, 0.74, 0.58], [0.66, 0.76, 0.86]];
      const kf = (tab, out) => {
        let i = 0; while (i < KEYS.length - 2 && ed > KEYS[i + 1]) i++;
        const t = LC.clamp((ed - KEYS[i]) / (KEYS[i + 1] - KEYS[i]), 0, 1);
        return lerpC(out, tab[i], tab[i + 1], t * t * (3 - 2 * t));
      };
      kf(ZEN, skyMat.uniforms.uZen.value);
      kf(HOR, skyMat.uniforms.uHor.value);
      skyMat.uniforms.uGlow.value.setRGB(1.0, 0.45, 0.16).multiplyScalar(K(-12, 0, ed) * (1 - K(6, 22, ed)) * 1.3);
      waterMat.uniforms.uHor.value.copy(skyMat.uniforms.uHor.value);
      waterMat.uniforms.uZen.value.copy(skyMat.uniforms.uZen.value);
      // туман в цвет горизонта
      const fogC = scene.fog.color;
      fogC.copy(skyMat.uniforms.uHor.value).lerp(skyMat.uniforms.uZen.value, 0.25);
      fogC.lerp(tmpC.setRGB(0.07, 0.08, 0.13), night * 0.5);
      U.uFogCol.value.copy(fogC);
      const den = 0.00036 + 0.00012 * gold + 0.00012 * night;
      scene.fog.density = den; U.uFogDen.value = den;
      // солнце / луна
      const sunUp = K(-2, 6, ed);
      if (sunUp > 0.001) {
        sun.position.copy(sd).multiplyScalar(1600);
        lerpC(tmpC, [1.0, 0.5, 0.22], [1.0, 0.95, 0.86], K(2, 25, ed));
        sun.color.copy(tmpC); sun.intensity = 2.6 * sunUp;
        U.uSunCol.value.copy(tmpC).multiplyScalar(sunUp);
      } else {
        sun.position.set(-0.45, 0.55, -0.7).multiplyScalar(1600);
        sun.color.setRGB(0.55, 0.65, 0.95); sun.intensity = 0.32 * night;
        U.uSunCol.value.setRGB(0.12, 0.15, 0.24).multiplyScalar(night);
      }
      // рассеянный
      const blue = K(-13, -5, ed) * (1 - K(-3, 3, ed));
      lerpC(tmpC, [0.13, 0.16, 0.28], [0.62, 0.7, 0.85], day);
      lerpC(tmpC2, [0.06, 0.06, 0.08], [0.38, 0.33, 0.28], day);
      if (gold > 0) { tmpC.lerp(tmpC.clone().setRGB(0.75, 0.55, 0.5), gold * 0.35); }
      if (blue > 0) { tmpC.lerp(tmpC.clone().setRGB(0.24, 0.3, 0.52), blue * 0.6); }
      hemi.color.copy(tmpC); hemi.groundColor.copy(tmpC2);
      hemi.intensity = 0.75 + 0.55 * day + blue * 0.25;
      U.uSkyAmb.value.copy(tmpC).multiplyScalar(hemi.intensity);
      U.uGndAmb.value.copy(tmpC2).multiplyScalar(hemi.intensity);
      renderer.toneMappingExposure = 1.0 + 0.25 * night;
      // тени: обновлять, когда солнце заметно сдвинулось
      shadowT += dtReal || 0;
      if (lastSun.distanceToSquared(sun.position) > 9 || shadowT > 4) {
        lastSun.copy(sun.position); shadowT = 0;
        renderer.shadowMap.needsUpdate = true;
      }
    };

  };
})(window.LC);
