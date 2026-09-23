/* ================================================================
   stage.js — 3D-сцена: коммунальная кухня ночью, абажур над столом,
   восемь мест за круглым столом. Отдаёт игре window.Stage с API.
   Если three.js не загрузился — простая 2D-сцена с тем же API.
   ================================================================ */
(function () {
  'use strict';

  const Stage = (window.Stage = { mode: 'none', onFrame: null });
  let readyRes;
  Stage.ready = new Promise((r) => (readyRes = r));

  const SEAT_R = 1.36;
  // место 0 — игрок (ближний край, +z), места 1–7 — дугой по дальней стороне
  const SEAT_ANG = [90, 165, 200, 235, 270, 305, 340, 15].map((d) => (d * Math.PI) / 180);

  window.addEventListener('three-ready', () => {
    if (Stage.mode !== 'none') return;
    try { build3D(window.THREE); } catch (e) { Stage.error = e; build2D(); }
  });
  window.addEventListener('three-fail', () => { if (Stage.mode === 'none') build2D(); });
  setTimeout(() => { if (Stage.mode === 'none') build2D(); }, 12000);

  /* ================================================================
     3D
     ================================================================ */
  function build3D(THREE) {
    const V3 = THREE.Vector3;
    const shot = !!window.__SHOT__;
    const canvas = document.getElementById('scene');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(shot ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = shot ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;

    const BG = new THREE.Color('#0d0a09');
    const scene = new THREE.Scene();
    scene.background = BG.clone();
    scene.fog = new THREE.Fog(BG.clone(), 5.5, 12);
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 40);

    /* ---------- процедурные текстуры ---------- */
    const tex = (w, h, draw, rep) => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      draw(c.getContext('2d'), w, h);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
      t.userData.canvas = c;
      t.userData.draw = draw;
      return t;
    };
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

    const floorTex = tex(512, 512, (g, w, h) => {
      g.fillStyle = '#2a1b14'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 8; i++) {
        const y = (i * h) / 8;
        g.fillStyle = `hsl(${18 + rnd() * 8},${30 + rnd() * 10}%,${10 + rnd() * 5}%)`;
        g.fillRect(0, y + 1, w, h / 8 - 2);
        for (let k = 0; k < 40; k++) {
          g.strokeStyle = `rgba(0,0,0,${0.08 + rnd() * 0.12})`;
          g.beginPath(); const yy = y + rnd() * (h / 8); g.moveTo(0, yy); g.bezierCurveTo(w * 0.3, yy + rnd() * 6 - 3, w * 0.6, yy + rnd() * 6 - 3, w, yy); g.stroke();
        }
        g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(((i * 197) % w), y, 2, h / 8);
      }
    }, [5, 5]);

    const wallTex = tex(512, 512, (g, w, h) => {
      g.fillStyle = '#3a2f24'; g.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 64) { g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x, 0, 22, h); }
      g.fillStyle = 'rgba(214,180,120,.13)';
      for (let y = 32; y < h; y += 96) for (let x = 43; x < w; x += 64) {
        g.beginPath(); g.ellipse(x, y + ((x / 64) % 2) * 48, 7, 12, 0, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.ellipse(x, y + ((x / 64) % 2) * 48 + 20, 3, 5, 0, 0, Math.PI * 2); g.fill();
      }
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(0,0,0,.2)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    }, [10, 1.6]);

    const clothTex = tex(1024, 1024, (g, w, h) => {
      g.fillStyle = '#1e3a2d'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '200,235,210'},${rnd() * 0.05})`; g.fillRect(rnd() * w, rnd() * h, 2, 2); }
      const cx = w / 2, cy = h / 2;
      g.strokeStyle = 'rgba(214,168,96,.55)'; g.lineWidth = 5;
      g.beginPath(); g.arc(cx, cy, w * 0.455, 0, Math.PI * 2); g.stroke();
      g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, w * 0.43, 0, Math.PI * 2); g.stroke();
      g.fillStyle = 'rgba(214,168,96,.45)';
      for (let i = 0; i < 64; i++) {
        const a = (i / 64) * Math.PI * 2, r = w * 0.4425;
        g.save(); g.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r); g.rotate(a + Math.PI / 4);
        g.fillRect(-5, -5, 10, 10); g.restore();
      }
      g.strokeStyle = 'rgba(214,168,96,.25)'; g.lineWidth = 2;
      g.beginPath(); g.arc(cx, cy, w * 0.16, 0, Math.PI * 2); g.stroke();
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.beginPath(); g.ellipse(cx + Math.cos(a) * w * 0.12, cy + Math.sin(a) * w * 0.12, 26, 10, a, 0, Math.PI * 2); g.stroke(); }
    });

    /* ---------- карты ролей ---------- */
    const serif = () => (document.fonts && document.fonts.check('700 40px "Playfair Display"') ? '"Playfair Display", Georgia, serif' : 'Georgia, serif');
    function drawRoleIcon(g, role, x, y, s, col) {
      g.save(); g.translate(x, y); g.scale(s, s); g.fillStyle = col; g.strokeStyle = col; g.lineWidth = 6; g.lineJoin = 'round';
      if (role === 'maf') {
        g.beginPath(); g.ellipse(0, 22, 92, 20, 0, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.moveTo(-54, 20); g.bezierCurveTo(-58, -40, -40, -62, -18, -52); g.quadraticCurveTo(0, -38, 18, -52); g.bezierCurveTo(40, -62, 58, -40, 54, 20); g.closePath(); g.fill();
        g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(-55, -2, 110, 14);
      } else if (role === 'com') {
        g.beginPath();
        for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 30 : 70; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
        g.closePath(); g.fill();
        g.beginPath(); g.arc(0, 0, 84, 0, Math.PI * 2); g.stroke();
      } else if (role === 'doc') {
        g.fillRect(-18, -62, 36, 124); g.fillRect(-62, -18, 124, 36);
        g.beginPath(); g.arc(0, 0, 84, 0, Math.PI * 2); g.stroke();
      } else {
        g.beginPath(); g.moveTo(-64, -4); g.lineTo(0, -62); g.lineTo(64, -4); g.lineTo(52, -4); g.lineTo(52, 60); g.lineTo(-52, 60); g.lineTo(-52, -4); g.closePath(); g.fill();
        g.fillStyle = '#f0c46a'; g.fillRect(-20, 6, 40, 36);
        g.fillStyle = col; g.fillRect(-2, 6, 4, 36); g.fillRect(-20, 22, 40, 4);
      }
      g.restore();
    }
    const ROLE_T = { civ: 'Мирный', com: 'Комиссар', doc: 'Доктор', maf: 'Мафия' };
    const ROLE_C = { civ: '#2c2420', com: '#1d3553', doc: '#1f4a2c', maf: '#8e1c16' };
    function faceTex(role) {
      return tex(256, 372, (g, w, h) => {
        g.fillStyle = '#efe4cb'; g.fillRect(0, 0, w, h);
        g.strokeStyle = ROLE_C[role]; g.lineWidth = 4; g.strokeRect(12, 12, w - 24, h - 24);
        g.lineWidth = 1.5; g.strokeRect(20, 20, w - 40, h - 40);
        drawRoleIcon(g, role, w / 2, h * 0.42, 0.95, ROLE_C[role]);
        g.fillStyle = ROLE_C[role]; g.textAlign = 'center';
        g.font = `italic 700 40px ${serif()}`;
        g.fillText(ROLE_T[role], w / 2, h * 0.8);
      });
    }
    const backTex = tex(256, 372, (g, w, h) => {
      g.fillStyle = '#5b1618'; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(222,176,98,.8)'; g.lineWidth = 3; g.strokeRect(12, 12, w - 24, h - 24);
      g.strokeStyle = 'rgba(222,176,98,.35)'; g.lineWidth = 1.5;
      for (let i = -h; i < w + h; i += 22) { g.beginPath(); g.moveTo(i, 18); g.lineTo(i + h, h - 18); g.stroke(); g.beginPath(); g.moveTo(i + h, 18); g.lineTo(i, h - 18); g.stroke(); }
      g.fillStyle = '#5b1618'; g.beginPath(); g.arc(w / 2, h / 2, 46, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(222,176,98,.9)'; g.lineWidth = 3; g.stroke();
      drawRoleIcon(g, 'maf', w / 2, h / 2 + 4, 0.34, 'rgba(222,176,98,.95)');
    });
    const faceCache = {};
    const getFace = (r) => faceCache[r] || (faceCache[r] = faceTex(r));

    /* ---------- свет ---------- */
    const hemi = new THREE.HemisphereLight('#4a5a78', '#1a0f0a', 0.32);
    scene.add(hemi);
    const lampPos = new V3(0, 2.16, 0);
    const bulbPos = new V3(0, 2.03, 0);
    const spot = new THREE.SpotLight('#ffb068', 12, 0, 1.22, 0.6, 2);
    spot.position.copy(bulbPos);
    spot.target.position.set(0, 0, 0);
    spot.castShadow = true;
    spot.shadow.mapSize.set(shot ? 1024 : 2048, shot ? 1024 : 2048);
    spot.shadow.camera.near = 0.3;
    spot.shadow.camera.far = 6;
    spot.shadow.bias = -0.0004;
    spot.shadow.normalBias = 0.02;
    scene.add(spot, spot.target);
    const bounce = new THREE.PointLight('#ffa870', 1.1, 3.6, 2);
    bounce.position.set(0, 0.95, 0.1);
    scene.add(bounce);
    // мягкий фронтальный свет на лица (как отражённый от стола и стен)
    const front = new THREE.DirectionalLight('#ffd6a8', 0.75);
    front.position.set(0, 2.4, 6);
    scene.add(front);
    const moon = new THREE.DirectionalLight('#6f8fd6', 0.5);
    moon.position.set(-4, 3, -4);
    scene.add(moon);

    /* ---------- комната ---------- */
    const floor = new THREE.Mesh(new THREE.CircleGeometry(8, 48), new THREE.MeshLambertMaterial({ map: floorTex }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.2, 3.6, 40, 1, true), new THREE.MeshLambertMaterial({ map: wallTex, side: THREE.BackSide }));
    wall.position.y = 1.8;
    wall.receiveShadow = true;
    scene.add(wall);

    // окно с дождём на дальней стене слева
    const winAng = (249 * Math.PI) / 180;
    const winPos = new V3(Math.cos(winAng) * 5.05, 1.95, Math.sin(winAng) * 5.05);
    const winMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uFlash: { value: 0 }, uNight: { value: 0 } },
      fog: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: `varying vec2 vUv; uniform float uTime, uFlash, uNight;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        void main(){
          vec2 uv=vUv;
          vec3 sky=mix(vec3(.05,.08,.15), vec3(.13,.17,.28), uv.y);
          float lights=0.;
          for(int i=0;i<14;i++){ float fi=float(i); vec2 p=vec2(h(vec2(fi,1.))*.9+.05, h(vec2(fi,7.))*.35+.05);
            float on=step(.35,h(vec2(fi,floor(uTime*.05+fi))));
            lights+=on*smoothstep(.022,.0,max(abs(uv.x-p.x)*1.6,abs(uv.y-p.y))); }
          vec3 col=sky+lights*vec3(1.,.72,.38)*.55;
          float r=0.;
          for(int k=0;k<3;k++){ float fk=float(k); vec2 g=uv*vec2(38.+fk*9.,4.); g.y+=uTime*(1.6+fk*.5)+h(vec2(floor(g.x),fk))*10.;
            float cell=fract(g.y); float col2=h(vec2(floor(g.x),floor(g.y)+fk));
            r+=step(.82,col2)*smoothstep(.0,.25,cell)*smoothstep(.6,.25,cell)*smoothstep(.5,.2,abs(fract(g.x)-.5)); }
          col+=r*vec3(.35,.45,.6)*.35;
          col+=uFlash*vec3(.8,.85,1.);
          col*=1.-uNight*.25;
          gl_FragColor=vec4(col,1.);
        }`,
    });
    const winGroup = new THREE.Group();
    winGroup.position.copy(winPos);
    winGroup.lookAt(0, 1.95, 0);
    scene.add(winGroup);
    winGroup.add(new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.6), winMat));
    const frameM = new THREE.MeshLambertMaterial({ color: '#4c3a2c' });
    [[0, 0.83, 1.46, 0.08], [0, -0.83, 1.46, 0.08], [0.69, 0, 0.08, 1.74], [-0.69, 0, 0.08, 1.74], [0, 0.18, 1.3, 0.05], [0, 0, 0.05, 1.6]].forEach(([x, y, w, h]) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), frameM); m.position.set(x, y, 0.03); winGroup.add(m);
    });
    const sill = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.3), frameM); sill.position.set(0, -0.88, 0.1); winGroup.add(sill);

    // часы на стене справа
    const clockAng = (296 * Math.PI) / 180;
    const clock = new THREE.Group();
    clock.position.set(Math.cos(clockAng) * 5.1, 2.3, Math.sin(clockAng) * 5.1);
    clock.lookAt(0, 2.3, 0);
    scene.add(clock);
    const clockFace = new THREE.Mesh(new THREE.CircleGeometry(0.32, 24), new THREE.MeshLambertMaterial({ color: '#d9ccb0' }));
    clock.add(clockFace);
    const clockRim = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.035, 6, 24), new THREE.MeshLambertMaterial({ color: '#3a2a1e' }));
    clock.add(clockRim);
    const handM = new THREE.MeshLambertMaterial({ color: '#1a1410' });
    const hHour = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.16, 0.01), handM); hHour.geometry.translate(0, 0.08, 0); hHour.position.z = 0.01; clock.add(hHour);
    const hMin = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.25, 0.01), handM); hMin.geometry.translate(0, 0.12, 0); hMin.position.z = 0.015; clock.add(hMin);
    const hSec = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.27, 0.01), new THREE.MeshLambertMaterial({ color: '#8e1c16' })); hSec.geometry.translate(0, 0.1, 0); hSec.position.z = 0.02; clock.add(hSec);
    hHour.rotation.z = -((3 + 5 / 60) / 12) * Math.PI * 2;
    hMin.rotation.z = -(5 / 60) * Math.PI * 2;

    /* ---------- стол ---------- */
    const TABLE_Y = 0.78;
    const table = new THREE.Group();
    scene.add(table);
    const clothTop = new THREE.Mesh(new THREE.CircleGeometry(1.03, 64), new THREE.MeshLambertMaterial({ map: clothTex }));
    clothTop.rotation.x = -Math.PI / 2;
    clothTop.position.y = TABLE_Y;
    clothTop.receiveShadow = true;
    table.add(clothTop);
    const skirtG = new THREE.CylinderGeometry(1.03, 1.1, 0.5, 72, 1, true);
    {
      const p = skirtG.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i);
        if (y < 0) {
          const a = Math.atan2(p.getZ(i), p.getX(i));
          const f = 1 + Math.sin(a * 18) * 0.025;
          p.setX(i, p.getX(i) * f); p.setZ(i, p.getZ(i) * f);
          p.setY(i, y + Math.abs(Math.sin(a * 18)) * 0.03);
        }
      }
      skirtG.computeVertexNormals();
    }
    const skirt = new THREE.Mesh(skirtG, new THREE.MeshLambertMaterial({ color: '#17301f', side: THREE.DoubleSide }));
    skirt.position.y = TABLE_Y - 0.25;
    skirt.castShadow = true;
    skirt.receiveShadow = true;
    table.add(skirt);

    // пепельница с дымом, стаканы в подстаканниках, колода
    // Фонг вместо PBR: блики те же, а шейдер в разы легче (и быстрее компилируется на слабых машинах)
    const glassM = new THREE.MeshPhongMaterial({ color: '#c8d6e0', specular: '#ffffff', shininess: 90, transparent: true, opacity: 0.35 });
    const teaM = new THREE.MeshPhongMaterial({ color: '#6b2a0e', emissive: '#2a0c02', specular: '#6a4a3a', shininess: 60 });
    const metalM = new THREE.MeshPhongMaterial({ color: '#5e4c30', specular: '#e8cf92', shininess: 42 });
    const ashtray = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.035, 9), new THREE.MeshPhongMaterial({ color: '#8fa3a8', specular: '#ffffff', shininess: 80, transparent: true, opacity: 0.7 }));
    ashtray.position.set(0.05, TABLE_Y + 0.018, -0.05);
    ashtray.castShadow = true;
    table.add(ashtray);
    const butt = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.07, 5), new THREE.MeshLambertMaterial({ color: '#efe9df' }));
    butt.rotation.z = 1.35; butt.position.set(0.1, TABLE_Y + 0.045, -0.05);
    table.add(butt);
    const smokeSrc = new V3(0.135, TABLE_Y + 0.05, -0.05);
    function teaGlass(x, z) {
      const g = new THREE.Group();
      g.position.set(x, TABLE_Y, z);
      const holder = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.08, 10, 1, true), metalM); holder.position.y = 0.04; holder.castShadow = true;
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.043, 0.038, 0.13, 10), glassM); glass.position.y = 0.075;
      const tea = new THREE.Mesh(new THREE.CylinderGeometry(0.039, 0.036, 0.09, 10), teaM); tea.position.y = 0.055;
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 4, 8, Math.PI), metalM); handle.position.set(0.055, 0.045, 0); handle.rotation.z = -Math.PI / 2;
      g.add(holder, tea, glass, handle);
      table.add(g);
    }
    SEAT_ANG.forEach((a, i) => {
      if (i % 2 === 1 || i === 0) teaGlass(Math.cos(a + 0.28) * 0.72, Math.sin(a + 0.28) * 0.72);
    });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.15), [0, 0, new THREE.MeshLambertMaterial({ map: backTex }), 0, 0, 0].map((m) => m || new THREE.MeshLambertMaterial({ color: '#e8dcc0' })));
    deck.position.set(-0.22, TABLE_Y + 0.015, 0.12); deck.rotation.y = 0.5; deck.castShadow = true;
    table.add(deck);

    /* ---------- абажур ---------- */
    const lamp = new THREE.Group();
    lamp.position.set(0, 3.6, 0);
    scene.add(lamp);
    const cordLen = 3.6 - lampPos.y - 0.02;
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, cordLen, 4), new THREE.MeshLambertMaterial({ color: '#111' }));
    cord.position.y = -cordLen / 2; lamp.add(cord);
    const shadePts = [];
    for (let i = 0; i <= 10; i++) { const t = i / 10; shadePts.push(new THREE.Vector2(0.14 + Math.pow(t, 1.6) * 0.46, 0.02 - t * 0.34 + Math.sin(t * Math.PI) * 0.03)); }
    const shadeG = new THREE.LatheGeometry(shadePts, 18);
    // Профиль идёт сверху вниз, поэтому «лицевые» грани токарной поверхности смотрят внутрь:
    // снаружи — обратные грани (BackSide), изнутри — лицевые (FrontSide).
    // Снаружи шёлк светится сам: лампа внутри, ярче там, где ткань смотрит на зрителя, складки — полосами.
    const shadeOutMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: { uI: { value: 1 } },
      vertexShader: 'varying vec2 vUv; varying float vF; void main(){ vUv=uv; vec4 mv=modelViewMatrix*vec4(position,1.); vF=abs(dot(normalize(normalMatrix*normal), normalize(-mv.xyz))); gl_Position=projectionMatrix*mv; }',
      fragmentShader: 'varying vec2 vUv; varying float vF; uniform float uI; void main(){ float t=vUv.y; float glow=smoothstep(0.,.55,t)*(1.-.3*smoothstep(.75,1.,t)); float pleat=.86+.14*sin(vUv.x*6.2832*30.); vec3 deep=vec3(.36,.07,.03), hot=vec3(1.,.47,.16); vec3 col=mix(deep,hot,glow*(.35+.65*vF))*pleat*(.55+.55*vF); gl_FragColor=vec4(col*uI,1.); }',
    });
    const shadeOut = new THREE.Mesh(shadeG, shadeOutMat);
    const shadeIn = new THREE.Mesh(shadeG, new THREE.MeshBasicMaterial({ color: '#ff8a38', side: THREE.FrontSide, toneMapped: false }));
    const shade = new THREE.Group();
    shade.position.y = -cordLen;
    shade.scale.setScalar(0.8);
    shade.add(shadeOut, shadeIn);
    lamp.add(shade);
    shadeOut.castShadow = true;
    // бахрома
    {
      const n = 110, pos = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const r = 0.6;
        pos.push(Math.cos(a) * r, -0.3, Math.sin(a) * r, Math.cos(a) * r * 1.01, -0.42 - (i % 2) * 0.02, Math.sin(a) * r * 1.01);
      }
      const fg = new THREE.BufferGeometry();
      fg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const fringe = new THREE.LineSegments(fg, new THREE.LineBasicMaterial({ color: '#e0873f' }));
      shade.add(fringe);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.012, 4, 36), new THREE.MeshLambertMaterial({ color: '#8a3a18' }));
      rim.rotation.x = Math.PI / 2; rim.position.y = -0.3; shade.add(rim);
    }
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: '#fff1d6', toneMapped: false }));
    bulb.position.y = -0.14; shade.add(bulb);

    // световой конус (лёгкая дымка)
    const coneMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uI: { value: 1 } },
      vertexShader: 'varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY=uv.y; vec4 mv=modelViewMatrix*vec4(position,1.); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }',
      fragmentShader: 'varying float vY; varying vec3 vN; varying vec3 vV; uniform float uI; void main(){ float f=pow(abs(dot(vN,vV)),1.6); float a=f*smoothstep(0.,.9,vY)*.075*uI; gl_FragColor=vec4(vec3(1.,.72,.42)*a,a); }',
    });
    const coneH = bulbPos.y - 0.2 - TABLE_Y;
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 1.2, coneH, 36, 1, true), coneMat);
    cone.position.y = TABLE_Y + coneH / 2;
    scene.add(cone);

    // пылинки в луче
    const dustN = 220;
    const dustG = new THREE.BufferGeometry();
    const dustP = new Float32Array(dustN * 3);
    const dustV = [];
    for (let i = 0; i < dustN; i++) {
      const y = TABLE_Y + 0.1 + Math.random() * 1.0;
      const rr = Math.sqrt(Math.random()) * (0.5 + (1 - (y - TABLE_Y) / 1.1) * 0.7);
      const a = Math.random() * Math.PI * 2;
      dustP.set([Math.cos(a) * rr, y, Math.sin(a) * rr], i * 3);
      dustV.push(Math.random() * 10);
    }
    dustG.setAttribute('position', new THREE.BufferAttribute(dustP, 3));
    const dotTex = tex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
    const dust = new THREE.Points(dustG, new THREE.PointsMaterial({ size: 0.016, map: dotTex, color: '#ffcf96', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    scene.add(dust);

    // дым
    const smokeN = 46;
    const smokeG = new THREE.BufferGeometry();
    const smokeP = new Float32Array(smokeN * 3);
    const smokeA = [];
    for (let i = 0; i < smokeN; i++) smokeA.push({ life: Math.random(), src: i % 2, x: 0, y: -10, z: 0, dx: 0, dz: 0 });
    smokeG.setAttribute('position', new THREE.BufferAttribute(smokeP, 3));
    const smoke = new THREE.Points(smokeG, new THREE.PointsMaterial({ size: 0.09, map: dotTex, color: '#b9b2aa', transparent: true, opacity: 0.18, depthWrite: false }));
    scene.add(smoke);

    // виньетка — в самом кадре, а не отдельным полноэкранным HTML-слоем
    const vig = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      transparent: true, depthTest: false, depthWrite: false,
      uniforms: { uNight: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }',
      fragmentShader: 'varying vec2 vUv; uniform float uNight; void main(){ vec2 d=vUv-.5; d.x*=1.25; float v=smoothstep(.38,.9,length(d)); gl_FragColor=vec4(mix(vec3(0.),vec3(.02,.03,.07),uNight), v*(.62+uNight*.2)); }',
    }));
    vig.frustumCulled = false;
    vig.renderOrder = 999;
    scene.add(vig);

    /* ---------- места, стулья, люди ---------- */
    const { Person } = window.PeopleFactory(THREE);
    const faceAt = new V3(0, 0, 1.0);
    const seats = SEAT_ANG.map((a, i) => ({ i, a, pos: new V3(Math.cos(a) * SEAT_R, 0, Math.sin(a) * SEAT_R) }));
    const chairM = new THREE.MeshLambertMaterial({ color: '#3b2619' });
    function chair(seat) {
      const g = new THREE.Group();
      g.position.copy(seat.pos);
      g.lookAt(faceAt.x, 0, faceAt.z);
      const add = (w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), chairM); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
      add(0.44, 0.045, 0.42, 0, 0.46, -0.02);
      add(0.04, 1.02, 0.04, 0.19, 0.51, -0.22); add(0.04, 1.02, 0.04, -0.19, 0.51, -0.22);
      add(0.42, 0.09, 0.035, 0, 0.98, -0.23); add(0.42, 0.04, 0.03, 0, 0.78, -0.23);
      for (const [x, z] of [[0.18, 0.16], [-0.18, 0.16], [0.18, -0.2], [-0.18, -0.2]]) add(0.035, 0.46, 0.035, x, 0.23, z);
      scene.add(g);
      return g;
    }
    const chairs = [];
    const people = [];
    const picks = [];
    const tableCards = [];
    const chairCards = [];
    const cardGeo = new THREE.PlaneGeometry(0.13, 0.19);
    const bigCardGeo = new THREE.PlaneGeometry(0.3, 0.436);
    for (const s of seats) {
      if (s.i > 0) chairs[s.i] = chair(s);
      // карта на столе
      const tc = new THREE.Group();
      const back = new THREE.Mesh(cardGeo, new THREE.MeshLambertMaterial({ map: backTex }));
      const front = new THREE.Mesh(cardGeo, new THREE.MeshLambertMaterial({ map: getFace('civ') }));
      back.rotation.x = -Math.PI / 2; front.rotation.x = Math.PI / 2; front.rotation.z = Math.PI;
      back.receiveShadow = true;
      back.position.y = 0.002; front.position.y = 0.001;
      tc.add(back, front);
      const r = s.i === 0 ? 0.78 : 0.76;
      tc.position.set(Math.cos(s.a) * r, TABLE_Y + 0.003, Math.sin(s.a) * r);
      tc.rotation.y = s.i === 0 ? 0 : -s.a - Math.PI / 2 + (Math.random() - 0.5) * 0.25;
      tc.userData = { flip: 0, flipGoal: 0, front, home: tc.position.clone() };
      table.add(tc);
      tableCards[s.i] = tc;
      // большая карта на пустом стуле (показывается после выбывания)
      const bc = new THREE.Mesh(bigCardGeo, new THREE.MeshLambertMaterial({ map: getFace('civ'), transparent: true, opacity: 0 }));
      const cp = s.pos.clone().multiplyScalar(1.0);
      bc.position.set(cp.x, 0.72, cp.z);
      bc.lookAt(cp.x * 0.3, 0.9, 3.2);
      bc.rotateX(-0.12);
      bc.visible = false;
      bc.castShadow = true;
      scene.add(bc);
      chairCards[s.i] = bc;
    }

    const flash3d = { t: 0 };
    const shake = { t: 0 };
    function onSlam(p) { shake.t = 0.35; Stage.onSlam && Stage.onSlam(p.seat); }

    Stage.setCast = function (cast) {
      for (const p of people) if (p) scene.remove(p.root);
      people.length = 0;
      for (const pk of picks) if (pk) scene.remove(pk);
      picks.length = 0;
      for (const spec of cast) {
        const s = seats[spec.seat];
        const p = new Person(spec, { onSlam });
        p.place(s.pos, faceAt);
        scene.add(p.root);
        people[spec.seat] = p;
        const pk = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 1.25, 8), new THREE.MeshBasicMaterial({ visible: false }));
        pk.position.set(s.pos.x, 1.05, s.pos.z);
        pk.userData.seat = spec.seat;
        scene.add(pk);
        picks[spec.seat] = pk;
      }
    };

    /* ---------- нити голосования ---------- */
    const threads = [];
    const threadM = new THREE.MeshBasicMaterial({ color: '#ff5a3c', transparent: true, opacity: 0.92, toneMapped: false });
    function addThread(from, to, delay) {
      const a = people[from] ? people[from].headWorld(new V3()).add(new V3(0, -0.35, 0)) : new V3(0, 1.2, 2.2);
      const b = people[to] ? people[to].headWorld(new V3()).add(new V3(0, -0.28, 0)) : new V3(0, 1.1, 1.5);
      if (from === 0) a.set(0, 1.25, 1.9);
      if (to === 0) b.set(0, 1.05, 1.4);
      const mid = a.clone().lerp(b, 0.5); mid.y += 0.45 + a.distanceTo(b) * 0.12;
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      const geo = new THREE.TubeGeometry(curve, 40, 0.017, 6, false);
      const m = new THREE.Mesh(geo, threadM);
      m.geometry.setDrawRange(0, 0);
      m.userData = { t: -(delay || 0), total: geo.index.count };
      scene.add(m);
      threads.push(m);
    }

    /* ---------- камера ---------- */
    const cam = {
      pos: new V3(0, 2.1, 3.3), look: new V3(0, 0.98, -0.2),
      gPos: new V3(0, 2.1, 3.3), gLook: new V3(0, 0.98, -0.2),
      focus: -1, mode: 'table', insetL: 0, insetR: 0, fov: 36,
    };
    let W = 1, H = 1;
    function baseFrame() {
      const aspect = (W - cam.insetL - cam.insetR) / H;
      const P = new V3(), L = new V3();
      let fov = 36;
      if (aspect >= 1.25) { P.set(0, 1.84, 3.38); L.set(0, 1.17, -0.5); fov = 37; }
      else if (aspect >= 0.8) { P.set(0, 2.05, 4.9); L.set(0, 1.08, -0.4); fov = 40; }
      // телефон: шире угол, чтобы влезли все семеро, и стол выше — под ним облачко и панель
      else { P.set(0, 2.3, 7.4); L.set(0, 0.2, -0.3); fov = 50; }
      if (cam.mode === 'wide') { P.multiplyScalar(1.22); P.y += 0.2; }
      if (cam.mode === 'night') { P.y -= 0.25; P.z -= 0.35; L.y -= 0.05; }
      return { P, L, fov };
    }
    const tmpH = new V3();
    function camGoal(t) {
      const { P, L, fov } = baseFrame();
      cam.fov = fov;
      if (cam.mode === 'orbit') {
        const r = Math.hypot(P.x, P.z), a = Math.PI / 2 + Math.sin(t * 0.12) * 0.55;
        P.set(Math.cos(a) * r, P.y, Math.sin(a) * r);
      }
      if (cam.focus > 0 && people[cam.focus] && cam.mode !== 'orbit') {
        people[cam.focus].headWorld(tmpH);
        L.lerp(tmpH, 0.2);
        P.x += tmpH.x * 0.12;
        P.addScaledVector(new V3().subVectors(tmpH, P).normalize(), 0.18);
      }
      cam.gPos.copy(P);
      cam.gLook.copy(L);
    }

    /* ---------- выбор мышью ---------- */
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    Stage.pick = function (x, y) {
      const r = canvas.getBoundingClientRect();
      ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hits = ray.intersectObjects(picks.filter((p) => p && people[p.userData.seat] && people[p.userData.seat].state.fadeGoal > 0.5), false);
      return hits.length ? hits[0].object.userData.seat : -1;
    };

    /* ---------- проекция якорей для HTML ---------- */
    const pv = new V3();
    function project(v) {
      pv.copy(v).project(camera);
      return { x: (pv.x * 0.5 + 0.5) * W, y: (-pv.y * 0.5 + 0.5) * H, vis: pv.z < 1 };
    }
    Stage.anchor = function (i) {
      if (i === 0) return { x: cam.insetL + (W - cam.insetL - cam.insetR) / 2, y: H - 150, vis: true };
      const p = people[i];
      if (!p) return { x: 0, y: 0, vis: false };
      p.headWorld(pv);
      pv.y += 0.3;
      return project(pv);
    };
    Stage.plate = function (i) {
      const s = seats[i];
      if (i === 0) return project(new V3(0, TABLE_Y, 1.1));
      return project(new V3(Math.cos(s.a) * 1.2, TABLE_Y + 0.1, Math.sin(s.a) * 1.2));
    };
    Stage.head = function (i) {
      const p = people[i];
      if (!p) return { x: 0, y: 0, vis: false };
      p.headWorld(pv);
      return project(pv);
    };
    // рамка абажура на экране: облачка реплик его не закрывают
    const lampPts = [new V3(-0.5, 1.82, 0), new V3(0.5, 1.82, 0), new V3(0, 1.82, 0.5), new V3(0, 1.82, -0.5), new V3(0, 2.2, 0)];
    Stage.lampBox = function () {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const q of lampPts) {
        const s = project(q);
        x0 = Math.min(x0, s.x); x1 = Math.max(x1, s.x); y0 = Math.min(y0, s.y); y1 = Math.max(y1, s.y);
      }
      return { x0, y0, x1, y1 };
    };

    /* ---------- API для игры ---------- */
    const night = { v: 0, goal: 0 };
    let speaker = -1;
    const tmpW = new V3();
    function worldOf(i) {
      if (i === 0) return camera.position.clone().add(new V3(0, -0.5, -0.6));
      const p = people[i];
      return p ? p.headWorld(new V3()) : new V3();
    }
    Stage.setSpeaker = function (i) {
      speaker = i;
      cam.focus = i > 0 ? i : -1;
      for (const p of people) {
        if (!p) continue;
        if (p.state.sleeping) continue;
        if (i === p.seat) { p.state.look = null; p.state.lookCam = false; continue; }
        if (i === 0) { p.state.lookCam = true; p.state.look = null; }
        else if (i > 0) { p.state.lookCam = false; p.state.look = worldOf(i); }
        else { p.state.lookCam = false; p.state.look = null; }
      }
    };
    Stage.talk = (i, on) => { if (people[i]) people[i].state.talking = !!on; };
    Stage.think = (i, on) => { if (people[i]) people[i].state.thinking = !!on; };
    Stage.emote = (i, e) => { if (people[i]) people[i].setEmotion(e || 'neutral'); };
    Stage.gesture = (i, g, target, hold) => {
      const p = people[i];
      if (!p) return;
      const tw = target != null && target >= 0 ? worldOf(target) : null;
      if ((g === 'point' || g === 'vote') && !tw) g = 'palms';
      p.gesture(g, tw, hold);
      if (target != null && target >= 0) { p.state.look = tw; p.state.lookCam = target === 0; }
    };
    Stage.lookAt = (i, target) => {
      const p = people[i];
      if (!p) return;
      if (target === 0) { p.state.lookCam = true; p.state.look = null; }
      else if (target > 0) { p.state.lookCam = false; p.state.look = worldOf(target); }
      else { p.state.lookCam = false; p.state.look = null; }
    };
    Stage.setNight = function (on) {
      night.goal = on ? 1 : 0;
      cam.mode = on ? 'night' : (cam.mode === 'night' ? 'table' : cam.mode);
      for (const p of people) if (p && p.state.fadeGoal > 0.5) {
        p.state.sleeping = !!on;
        if (on) { p.state.gesture = 'sleep'; p.state.gHold = 999; p.state.talking = false; p.state.thinking = false; }
        else if (p.state.gesture === 'sleep') p.state.gesture = null;
      }
    };
    Stage.wake = function (i, on) {
      const p = people[i];
      if (!p) return;
      p.state.sleeping = !on;
      if (on) { p.state.gesture = null; p.state.lookCam = true; p.setEmotion('irony'); }
      else { p.state.gesture = 'sleep'; p.state.gHold = 999; p.setEmotion('neutral'); }
    };
    Stage.remove = function (i, how) {
      const p = people[i];
      if (!p) return;
      p.state.fadeGoal = 0;
      p.state.talking = false;
      if (how === 'exec') p.state.removing = 0.001;
      else p.state.fade = 0;
      const tc = tableCards[i];
      if (tc) tc.visible = false;
      if (chairs[i]) chairs[i].userData.pushed = 1;
    };
    Stage.restore = function (i) {
      const p = people[i];
      if (!p) return;
      p.state.fadeGoal = 1; p.state.fade = 1; p.state.removing = 0;
      p.root.position.copy(p.home);
      if (tableCards[i]) tableCards[i].visible = true;
      if (chairs[i]) chairs[i].userData.pushed = 0;
      if (chairCards[i]) { chairCards[i].visible = false; chairCards[i].material.opacity = 0; }
    };
    Stage.revealCard = function (i, role, instant) {
      const bc = chairCards[i];
      if (!bc) return;
      bc.material.map = getFace(role);
      bc.material.needsUpdate = true;
      bc.visible = true;
      bc.userData.goal = 1;
      if (instant) bc.material.opacity = 1;
    };
    Stage.flipTable = function (i, role, instant) {
      const tc = tableCards[i];
      if (!tc) return;
      tc.userData.front.material.map = getFace(role);
      tc.userData.front.material.needsUpdate = true;
      tc.userData.flipGoal = 1;
      if (instant) tc.userData.flip = 1;
    };
    Stage.unflipAll = function () { for (const tc of tableCards) if (tc) { tc.userData.flipGoal = 0; tc.userData.flip = 0; } };
    Stage.highlight = function (i, on) { for (const p of people) if (p) p.state.hoverGoal = on && p.seat === i ? 1 : 0; };
    Stage.threads = function (pairs) {
      Stage.clearThreads();
      pairs.forEach(([a, b], k) => addThread(a, b, k * 0.05));
    };
    Stage.clearThreads = function () { for (const m of threads) { scene.remove(m); m.geometry.dispose(); } threads.length = 0; };
    Stage.flash = function () { flash3d.t = 1; };
    Stage.shake = function (s) { shake.t = s || 0.35; };
    Stage.camera = function (mode) { cam.mode = mode || 'table'; };
    Stage.setInsets = function (l, r) { cam.insetL = l || 0; cam.insetR = r || 0; resize(); };
    Stage.people = people;
    Stage.settle = function (n) {
      snapCamera(); camera.updateProjectionMatrix();
      for (let k = 0; k < (n || 40); k++) {
        scene.updateMatrixWorld(true);
        for (const p of people) if (p) p.update(0.1, k * 0.1, { camPos: camera.position });
      }
      camGoal(0); cam.pos.copy(cam.gPos); cam.look.copy(cam.gLook);
      night.v = night.goal;
      for (const tc of tableCards) if (tc) tc.userData.flip = tc.userData.flipGoal;
    };
    Stage.render = () => renderer.render(scene, camera);

    /* ---------- размер ---------- */
    function resize() {
      W = window.innerWidth; H = window.innerHeight;
      renderer.setSize(W, H, false);
      // сдвиг кадра под боковую панель: рисуем часть более широкого «виртуального» кадра
      const sh = (cam.insetL - cam.insetR) / 2;
      if (Math.abs(sh) > 1 && W > 760) {
        const fw = W + 2 * Math.abs(sh);
        camera.aspect = fw / H;
        camera.setViewOffset(fw, H, sh > 0 ? 0 : 2 * Math.abs(sh), 0, W, H);
      } else { camera.aspect = W / H; camera.clearViewOffset(); }
      // при съёмке кадр не «доезжает»: после смены размера камера сразу на месте
      if (shot) snapCamera();
      camera.updateProjectionMatrix();
    }
    function snapCamera() {
      camGoal(0);
      cam.pos.copy(cam.gPos); cam.look.copy(cam.gLook);
      camera.position.copy(cam.pos); camera.lookAt(cam.look);
      camera.fov = cam.fov;
    }
    window.addEventListener('resize', resize);
    resize();

    /* ---------- цикл ---------- */
    let last = performance.now(), T = 0, running = true;
    const nightBg = new THREE.Color('#06080f');
    // На программном рендере (съёмка обложки, window.__SHOT__) рисуем не чаще раза в 0,4 с:
    // так поток страницы успевает печатать реплики. Слои интерфейса двигаем вместе с кадром.
    let lastRender = -1e9;
    // Адаптивное разрешение: если кадры стабильно дольше ~28 мс, плотность пикселей
    // снижается шагами по 0,25 (не ниже 1). При съёмке всегда DPR 1 без подстройки.
    const maxDpr = shot ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    let dpr = maxDpr, slowT = 0;
    function adapt(raw) {
      if (raw > 0.25 || dpr <= 1) return; // пауза вкладки, долгий кадр по другой причине или уже минимум
      if (raw > 0.028) slowT += raw; else slowT = Math.max(0, slowT - raw * 0.5);
      if (slowT > 1.5) { slowT = 0; dpr = Math.max(1, dpr - 0.25); renderer.setPixelRatio(dpr); resize(); }
    }
    function frame(now) {
      if (!running) return;
      requestAnimationFrame(frame);
      const raw = (now - last) / 1000;
      const dt = Math.min(0.05, raw);
      last = now;
      T += dt;
      step(dt, T);
      if (shot && now - lastRender < 400) return;
      lastRender = now;
      renderer.render(scene, camera);
      if (Stage.onFrame) { try { Stage.onFrame(dt); } catch (e) { /* интерфейс не должен ронять сцену */ } }
      if (!shot) adapt(raw);
    }
    function step(dt, t) {
      // ночь
      night.v += (night.goal - night.v) * (1 - Math.exp(-1.8 * dt));
      const n = night.v;
      const flick = n > 0.05 ? 1 - n * 0.9 + Math.sin(t * 23) * 0.02 * n : 1;
      spot.intensity = 12 * flick;
      front.intensity = 0.75 * (1 - n * 0.8);
      bounce.intensity = 1.1 * (1 - n * 0.85);
      coneMat.uniforms.uI.value = 1 - n * 0.85;
      shadeIn.material.color.setRGB(1 - n * 0.7, 0.54 * (1 - n * 0.75), 0.22 * (1 - n * 0.8));
      shadeOutMat.uniforms.uI.value = 1 - n * 0.72;
      bulb.material.color.setRGB(1 - n * 0.6, 0.94 * (1 - n * 0.65), 0.84 * (1 - n * 0.7));
      moon.intensity = 0.62 + n * 1.2;
      hemi.intensity = 0.32 - n * 0.1;
      vig.material.uniforms.uNight.value = n;
      scene.background.copy(BG).lerp(nightBg, n);
      scene.fog.color.copy(scene.background);
      winMat.uniforms.uTime.value = t;
      winMat.uniforms.uNight.value = n;
      // молния
      if (flash3d.t > 0) {
        flash3d.t = Math.max(0, flash3d.t - dt * 2.2);
        const f = flash3d.t > 0.6 ? 1 : flash3d.t > 0.45 ? 0.1 : flash3d.t > 0.3 ? 0.8 : flash3d.t * 1.5;
        moon.intensity += f * 3.5;
        winMat.uniforms.uFlash.value = f;
      } else { winMat.uniforms.uFlash.value = 0; }
      // лампа качается
      lamp.rotation.z = Math.sin(t * 0.7) * 0.018;
      lamp.rotation.x = Math.cos(t * 0.53) * 0.012;
      // секундная стрелка
      hSec.rotation.z = -Math.floor(t) * (Math.PI / 30);
      // пыль
      const dp = dustG.attributes.position;
      for (let i = 0; i < dustN; i++) {
        let y = dp.getY(i) + dt * 0.012;
        if (y > TABLE_Y + 1.12) y = TABLE_Y + 0.08;
        dp.setY(i, y);
        dp.setX(i, dp.getX(i) + Math.sin(t * 0.4 + dustV[i]) * dt * 0.01);
      }
      dp.needsUpdate = true;
      // дым: пепельница и сигарета Семёныча
      const sp = smokeG.attributes.position;
      const semen = people[4];
      const cig = semen && semen.cigTip && semen.state.fade > 0.5 ? semen.cigTip.getWorldPosition(tmpW) : null;
      for (let i = 0; i < smokeN; i++) {
        const s = smokeA[i];
        s.life += dt * 0.28;
        if (s.life >= 1) {
          s.life = 0;
          const src = s.src && cig ? cig : smokeSrc;
          s.x = src.x; s.y = src.y; s.z = src.z; s.dx = (Math.random() - 0.5) * 0.04; s.dz = (Math.random() - 0.5) * 0.04;
        }
        s.x += (s.dx + Math.sin(t * 1.3 + i) * 0.02) * dt;
        s.z += s.dz * dt;
        s.y += dt * (0.1 + s.life * 0.1);
        sp.setXYZ(i, s.x, s.y, s.z);
      }
      sp.needsUpdate = true;
      // люди
      const ctx = { camPos: camera.position };
      for (const p of people) if (p) p.update(dt, t, ctx);
      // карты на столе
      for (const tc of tableCards) {
        if (!tc) continue;
        const u = tc.userData;
        u.flip += (u.flipGoal - u.flip) * (1 - Math.exp(-6 * dt));
        tc.rotation.z = u.flip * Math.PI;
        tc.position.y = TABLE_Y + 0.003 + Math.sin(u.flip * Math.PI) * 0.08;
      }
      for (const bc of chairCards) {
        if (!bc || !bc.visible) continue;
        const g = bc.userData.goal || 0;
        bc.material.opacity += (g - bc.material.opacity) * (1 - Math.exp(-3 * dt));
      }
      for (const c of chairs) {
        if (!c) continue;
        const push = c.userData.pushed || 0;
        c.userData.pv = (c.userData.pv || 0) + (push - (c.userData.pv || 0)) * (1 - Math.exp(-2 * dt));
        if (!c.userData.home) c.userData.home = c.position.clone();
        const dir = c.userData.home.clone().setY(0).normalize();
        c.position.copy(c.userData.home).addScaledVector(dir, c.userData.pv * 0.22);
        c.rotation.z = 0;
      }
      // нити
      for (const m of threads) {
        m.userData.t += dt;
        const k = Math.max(0, Math.min(1, m.userData.t / 0.7));
        const e = 1 - Math.pow(1 - k, 3);
        m.geometry.setDrawRange(0, Math.floor((e * m.userData.total) / 3) * 3);
      }
      // камера
      camGoal(t);
      const kc = 1 - Math.exp(-(cam.mode === 'orbit' ? 0.8 : 1.6) * dt);
      cam.pos.lerp(cam.gPos, kc);
      cam.look.lerp(cam.gLook, kc);
      camera.position.copy(cam.pos);
      if (!shot) {
        // лёгкое «дыхание» ручной камеры
        camera.position.x += Math.sin(t * 0.37) * 0.025;
        camera.position.y += Math.sin(t * 0.29) * 0.018;
      }
      if (shake.t > 0) {
        shake.t = Math.max(0, shake.t - dt);
        const s = shake.t * 0.05;
        camera.position.x += (Math.random() - 0.5) * s;
        camera.position.y += (Math.random() - 0.5) * s;
      }
      camera.lookAt(cam.look);
      if (Math.abs(camera.fov - cam.fov) > 0.01) { camera.fov += (cam.fov - camera.fov) * kc; camera.updateProjectionMatrix(); }
    }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) running = false;
      else if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); }
    });

    // шрифт для карт мог догрузиться позже — перерисуем лица карт
    if (document.fonts && document.fonts.load) {
      document.fonts.load('italic 700 40px "Playfair Display"').then(() => {
        for (const k in faceCache) {
          const t = faceCache[k];
          const c = t.userData.canvas;
          t.userData.draw(c.getContext('2d'), c.width, c.height);
          t.needsUpdate = true;
        }
      }).catch(() => {});
    }

    Stage.mode = '3d';
    Stage.seats = seats;
    requestAnimationFrame(frame);
    readyRes(Stage);
  }

  /* ================================================================
     2D-запасной вариант: если three.js недоступен (нет сети до CDN)
     ================================================================ */
  function build2D() {
    Stage.mode = '2d';
    const root = document.getElementById('flat');
    root.hidden = false;
    document.body.classList.add('flat-mode');
    const els = [];
    const state = [];
    Stage.setCast = function (cast) {
      root.innerHTML = '<div class="flat-table"></div>';
      for (const spec of cast) {
        const d = document.createElement('div');
        d.className = 'flat-seat';
        d.style.setProperty('--c', spec.look.torso);
        d.style.setProperty('--s', spec.look.skin);
        d.innerHTML = '<div class="flat-head"></div><div class="flat-body"></div>';
        root.appendChild(d);
        els[spec.seat] = d;
        state[spec.seat] = { alive: true };
      }
      layout();
    };
    function pos(i) {
      const W = window.innerWidth, H = window.innerHeight;
      const L = Stage._insetL || 0, Rr = Stage._insetR || 0;
      const cx = L + (W - L - Rr) / 2, cy = H * 0.42;
      const rx = Math.min((W - L - Rr) * 0.36, 460), ry = Math.min(H * 0.26, 230);
      const a = SEAT_ANG[i];
      return { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry };
    }
    function layout() {
      const W = window.innerWidth, H = window.innerHeight;
      const t = root.querySelector('.flat-table');
      if (t) {
        const L = Stage._insetL || 0, Rr = Stage._insetR || 0;
        const cx = L + (W - L - Rr) / 2, cy = H * 0.42;
        const rx = Math.min((W - L - Rr) * 0.36, 460) * 0.7, ry = Math.min(H * 0.26, 230) * 0.7;
        Object.assign(t.style, { left: cx - rx + 'px', top: cy - ry + 'px', width: rx * 2 + 'px', height: ry * 2 + 'px' });
      }
      els.forEach((d, i) => { if (!d) return; const p = pos(i); d.style.transform = `translate(${p.x - 36}px, ${p.y - 60}px)`; });
    }
    window.addEventListener('resize', layout);
    const cls = (i, c, on) => { if (els[i]) els[i].classList.toggle(c, !!on); };
    Stage.anchor = (i) => { if (i === 0) { const L = Stage._insetL || 0, Rr = Stage._insetR || 0; return { x: L + (window.innerWidth - L - Rr) / 2, y: window.innerHeight - 150, vis: true }; } const p = pos(i); return { x: p.x, y: p.y - 70, vis: true }; };
    Stage.plate = (i) => { const p = pos(i); return { x: p.x, y: p.y + 30, vis: i !== 0 }; };
    Stage.head = (i) => { const p = pos(i); return { x: p.x, y: p.y - 30, vis: true }; };
    Stage.setSpeaker = (i) => els.forEach((d, k) => d && d.classList.toggle('speaking', k === i));
    Stage.talk = (i, on) => cls(i, 'talking', on);
    Stage.think = (i, on) => cls(i, 'thinking', on);
    Stage.emote = (i, e) => { if (els[i]) els[i].dataset.emo = e || ''; };
    Stage.gesture = (i, g) => { if (els[i]) { els[i].dataset.g = g || ''; setTimeout(() => { if (els[i]) els[i].dataset.g = ''; }, 1600); } };
    Stage.lookAt = () => {};
    Stage.setNight = (on) => document.body.classList.toggle('flat-night', !!on);
    Stage.wake = (i, on) => cls(i, 'awake', on);
    Stage.remove = (i) => cls(i, 'gone', true);
    Stage.restore = (i) => cls(i, 'gone', false);
    Stage.revealCard = () => {};
    Stage.flipTable = () => {};
    Stage.unflipAll = () => {};
    Stage.highlight = (i, on) => els.forEach((d, k) => d && d.classList.toggle('hover', on && k === i));
    Stage.threads = () => {};
    Stage.clearThreads = () => {};
    Stage.flash = () => {};
    Stage.shake = () => {};
    Stage.camera = () => {};
    Stage.setInsets = (l, r) => { Stage._insetL = l || 0; Stage._insetR = r || 0; layout(); };
    Stage.settle = () => {};
    Stage.pick = (x, y) => {
      let best = -1, bd = 60;
      els.forEach((d, i) => { if (!d || d.classList.contains('gone')) return; const p = pos(i); const dd = Math.hypot(p.x - x, p.y - 20 - y); if (dd < bd) { bd = dd; best = i; } });
      return best;
    };
    Stage.people = [];
    function loop() { requestAnimationFrame(loop); if (Stage.onFrame) { try { Stage.onFrame(0.016); } catch (e) { /* пусто */ } } }
    requestAnimationFrame(loop);
    readyRes(Stage);
  }
})();
