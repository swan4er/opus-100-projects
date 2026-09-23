/* ================================================================
   054 · Допрос — 3D-сцена (three.js r170).
   Комната для допросов: лампа над столом, дым в конусе света,
   тёмное зеркальное стекло, полосы света сквозь жалюзи,
   подозреваемый с мимикой и жестами (IK рук, взгляд, веки, пот).
   ================================================================ */
(function () {
  'use strict';

  function create(THREE, addons, canvas, opts) {
    const { Reflector } = addons;
    const SHOT = !!opts.shot;
    const TM = [['start', performance.now()]];   // замеры запуска
    const mark = (k) => TM.push([k, performance.now()]);
    const V3 = THREE.Vector3, Q = THREE.Quaternion, Col = THREE.Color;

    // ---------- математика ----------
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const lerp = (a, b, t) => a + (b - a) * t;
    const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    const damp = (cur, target, k, dt) => cur + (target - cur) * (1 - Math.exp(-k * dt));
    const env = (p, a, b) => smooth(0, a, p) * (1 - smooth(b, 1, p));
    const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    let seedN = 12345;
    const rnd = () => ((seedN = (seedN * 16807) % 2147483647) / 2147483647);
    const R = (a, b) => a + rnd() * (b - a);
    const _v1 = new V3(), _v2 = new V3(), _v3 = new V3(), _q1 = new Q(), _m1 = new THREE.Matrix4();

    // ---------- рендер ----------
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = SHOT ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;   // в съёмке (SwiftShader) — дешевле
    let dprMax = SHOT ? 1 : Math.min(window.devicePixelRatio || 1, 1.75);
    let dpr = dprMax;

    const scene = new THREE.Scene();
    scene.background = new Col(0x050706);
    scene.fog = new THREE.Fog(0x080a09, 4.2, 10);

    const camera = new THREE.PerspectiveCamera(34, 1, 0.03, 30);
    camera.layers.set(0);

    // ---------- процедурные текстуры ----------
    function tex(w, h, draw, o = {}) {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d');
      draw(g, w, h);
      const t = new THREE.CanvasTexture(c);
      t.userData.redraw = () => { g.clearRect(0, 0, w, h); draw(g, w, h); t.needsUpdate = true; };
      if (o.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      if (o.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(o.repeat[0], o.repeat[1]); }
      return t;
    }
    const blob = (g, x, y, rx, ry, fill) => { g.fillStyle = fill; g.beginPath(); g.ellipse(x, y, rx, ry, rnd() * 3, 0, Math.PI * 2); g.fill(); };

    const ROOM = { x0: -1.6, x1: 1.6, z0: -1.9, z1: 2.3, h: 2.8 };
    const PAINT = 1.36;   // высота масляной панели

    // стена: побелка сверху, зелёная масляная панель снизу
    const wallMap = tex(768, 768, (g, w, h) => {
      const band = h * (1 - PAINT / ROOM.h);
      g.fillStyle = '#aaa393'; g.fillRect(0, 0, w, band);
      g.fillStyle = '#33473d'; g.fillRect(0, band, w, h - band);
      for (let i = 0; i < 700; i++) {
        const y = rnd() * h;
        blob(g, rnd() * w, y, R(3, 36), R(3, 30), y < band ? `rgba(92,80,58,${R(0.02, 0.07)})` : `rgba(10,22,16,${R(0.03, 0.09)})`);
      }
      for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(255,255,240,${R(0.008, 0.03)})`; g.fillRect(rnd() * w, band, R(1, 3), h - band); }
      for (let i = 0; i < 16; i++) {
        const x = rnd() * w, len = R(80, band * 0.9);
        const gr = g.createLinearGradient(0, 0, 0, len);
        gr.addColorStop(0, 'rgba(96,70,38,0.28)'); gr.addColorStop(1, 'rgba(96,70,38,0)');
        g.fillStyle = gr; g.fillRect(x, 0, R(5, 24), len);
      }
      for (let i = 0; i < 70; i++) blob(g, rnd() * w, band + rnd() * (h - band), R(1, 5), R(1, 4), `rgba(160,150,128,${R(0.25, 0.6)})`);
      g.lineCap = 'round';
      for (let i = 0; i < 46; i++) {
        g.strokeStyle = `rgba(8,8,6,${R(0.12, 0.32)})`; g.lineWidth = R(1, 3);
        const x = rnd() * w, y = h - R(10, 230);
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + R(-70, 70), y + R(-6, 6)); g.stroke();
      }
      for (let i = 0; i < 7; i++) {   // трещины в штукатурке
        let x = rnd() * w, y = rnd() * band * 0.8;
        g.strokeStyle = 'rgba(40,34,26,0.35)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(x, y);
        for (let k = 0; k < 9; k++) { x += R(-14, 14); y += R(4, 18); g.lineTo(x, y); }
        g.stroke();
      }
      g.fillStyle = '#1c2721'; g.fillRect(0, band - 5, w, 10);
    });
    const wallRough = tex(256, 256, (g, w, h) => {
      const band = h * (1 - PAINT / ROOM.h);
      g.fillStyle = '#f0f0f0'; g.fillRect(0, 0, w, band);
      g.fillStyle = '#6a6a6a'; g.fillRect(0, band, w, h - band);
      for (let i = 0; i < 400; i++) blob(g, rnd() * w, rnd() * h, R(2, 10), R(2, 10), `rgba(${rnd() < 0.5 ? '255,255,255' : '0,0,0'},${R(0.03, 0.1)})`);
    }, { srgb: false });

    // пол: метлахская плитка
    const floorMap = tex(512, 512, (g, w, h) => {
      const n = 4, s = w / n;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        g.fillStyle = (i + j) % 2 ? '#5d3325' : '#7c6c57';
        g.fillRect(i * s, j * s, s, s);
        for (let k = 0; k < 40; k++) blob(g, i * s + rnd() * s, j * s + rnd() * s, R(2, 16), R(2, 16), `rgba(${rnd() < 0.5 ? '0,0,0' : '255,240,220'},${R(0.02, 0.07)})`);
      }
      g.strokeStyle = 'rgba(20,16,12,0.9)'; g.lineWidth = 3;
      for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, h); g.stroke(); g.beginPath(); g.moveTo(0, i * s); g.lineTo(w, i * s); g.stroke(); }
      for (let k = 0; k < 120; k++) blob(g, rnd() * w, rnd() * h, R(10, 60), R(10, 60), `rgba(18,12,8,${R(0.02, 0.06)})`);
    }, { repeat: [5.3, 7] });

    // стол: крашеная сталь, стёртая до металла
    const tableMap = tex(512, 512, (g, w, h) => {
      g.fillStyle = '#44493f'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 450; i++) blob(g, rnd() * w, rnd() * h, R(2, 18), R(2, 12), `rgba(${rnd() < 0.5 ? '20,22,18' : '120,120,105'},${R(0.04, 0.1)})`);
      g.lineCap = 'round';
      for (let i = 0; i < 260; i++) {
        g.strokeStyle = `rgba(160,158,146,${R(0.08, 0.3)})`; g.lineWidth = R(0.5, 1.4);
        const x = rnd() * w, y = rnd() * h, a = R(-0.4, 0.4) + (rnd() < 0.5 ? 0 : Math.PI / 2), l = R(8, 90);
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
      }
      // кольца от стаканов
      for (let i = 0; i < 5; i++) { g.strokeStyle = `rgba(20,18,14,${R(0.15, 0.3)})`; g.lineWidth = R(2, 4); g.beginPath(); g.arc(rnd() * w, rnd() * h, R(16, 24), 0, Math.PI * 2); g.stroke(); }
      // потёртый край
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, 'rgba(150,150,138,0.35)'); gr.addColorStop(0.06, 'rgba(150,150,138,0)'); gr.addColorStop(0.94, 'rgba(150,150,138,0)'); gr.addColorStop(1, 'rgba(150,150,138,0.35)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    const tableRough = tex(256, 256, (g, w, h) => {
      g.fillStyle = '#909090'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 120; i++) { g.strokeStyle = `rgba(0,0,0,${R(0.2, 0.5)})`; g.lineWidth = R(0.5, 1.5); const x = rnd() * w, y = rnd() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + R(-40, 40), y + R(-10, 10)); g.stroke(); }
      for (let i = 0; i < 200; i++) blob(g, rnd() * w, rnd() * h, R(2, 14), R(2, 14), `rgba(255,255,255,${R(0.03, 0.1)})`);
    }, { srgb: false });

    // трафарет окна с жалюзи для прожектора
    const blindsMap = tex(256, 256, (g, w, h) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
      const x0 = w * 0.2, x1 = w * 0.8, y0 = h * 0.16, y1 = h * 0.84;
      for (let y = y0; y < y1; y += 11) {
        const gr = g.createLinearGradient(0, y, 0, y + 11);
        gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.35, 'rgba(255,255,255,1)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.fillRect(x0, y, x1 - x0, 11);
      }
      g.fillStyle = '#000'; g.fillRect(w * 0.49, y0, w * 0.035, y1 - y0);          // переплёт
      g.fillRect(x0, h * 0.5, x1 - x0, 5);
    }, { srgb: true });

    const glowMap = tex(128, 128, (g, w) => {
      const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      gr.addColorStop(0, 'rgba(255,236,200,1)'); gr.addColorStop(0.18, 'rgba(255,200,130,0.55)'); gr.addColorStop(0.5, 'rgba(255,170,90,0.12)'); gr.addColorStop(1, 'rgba(255,160,80,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, w);
    });

    const smokeMap = tex(128, 128, (g, w) => {
      g.clearRect(0, 0, w, w);
      for (let i = 0; i < 26; i++) {
        const x = w / 2 + R(-22, 22), y = w / 2 + R(-22, 22), r = R(14, 36);
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, `rgba(255,255,255,${R(0.12, 0.3)})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      }
    }, { srgb: false });

    const dirtMap = tex(256, 128, (g, w, h) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 160; i++) blob(g, rnd() * w, rnd() * h, R(2, 18), R(2, 12), `rgba(255,255,255,${R(0.03, 0.12)})`);
      for (let i = 0; i < 14; i++) { g.strokeStyle = `rgba(255,255,255,${R(0.06, 0.16)})`; g.lineWidth = R(2, 6); const x = rnd() * w, y = rnd() * h; g.beginPath(); g.arc(x, y, R(6, 20), R(0, 3), R(3, 6)); g.stroke(); }
      const gr = g.createLinearGradient(0, h, 0, h * 0.6); gr.addColorStop(0, 'rgba(255,255,255,0.3)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    }, { srgb: false });

    const fabricMap = tex(128, 128, (g, w, h) => {
      g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 2) { g.fillStyle = `rgba(0,0,0,${R(0.04, 0.1)})`; g.fillRect(0, y, w, 1); }
      for (let x = 0; x < w; x += 3) { g.fillStyle = `rgba(255,255,255,${R(0.02, 0.07)})`; g.fillRect(x, 0, 1, h); }
      for (let i = 0; i < 60; i++) blob(g, rnd() * w, rnd() * h, R(3, 12), R(3, 12), `rgba(0,0,0,${R(0.02, 0.06)})`);
    }, { srgb: false, repeat: [3, 3] });

    const signMap = tex(256, 96, (g, w, h) => {
      g.fillStyle = '#d9d2c1'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#8f2a22'; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
      g.fillStyle = '#8f2a22'; g.font = '700 44px Oswald, "PT Sans Narrow", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('НЕ КУРИТЬ', w / 2, h / 2 + 2);
      for (let i = 0; i < 40; i++) blob(g, rnd() * w, rnd() * h, R(1, 6), R(1, 4), `rgba(60,40,20,${R(0.08, 0.25)})`);
    });

    const clockMap = tex(256, 256, (g, w) => {
      const c = w / 2;
      g.fillStyle = '#e4ddcc'; g.beginPath(); g.arc(c, c, c - 2, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#1b1a17'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '600 28px Oswald, sans-serif';
      for (let i = 1; i <= 12; i++) { const a = (i / 12) * Math.PI * 2; g.fillText(String(i), c + Math.sin(a) * (c - 34), c - Math.cos(a) * (c - 34)); }
      for (let i = 0; i < 60; i++) { const a = (i / 60) * Math.PI * 2, l = i % 5 ? 6 : 12; g.lineWidth = i % 5 ? 1.5 : 3; g.strokeStyle = '#1b1a17'; g.beginPath(); g.moveTo(c + Math.sin(a) * (c - 10), c - Math.cos(a) * (c - 10)); g.lineTo(c + Math.sin(a) * (c - 10 - l), c - Math.cos(a) * (c - 10 - l)); g.stroke(); }
      const gr = g.createRadialGradient(c, c, c * 0.3, c, c, c); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(60,45,20,0.35)');
      g.fillStyle = gr; g.beginPath(); g.arc(c, c, c - 2, 0, Math.PI * 2); g.fill();
    });

    const reelMap = tex(128, 128, (g, w) => {
      const c = w / 2;
      g.fillStyle = '#26221e'; g.beginPath(); g.arc(c, c, c, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#5a4b3c'; g.beginPath(); g.arc(c, c, c * 0.84, 0, Math.PI * 2); g.fill();   // плёнка
      g.fillStyle = '#b9b3a6';
      for (let i = 0; i < 3; i++) { g.save(); g.translate(c, c); g.rotate(i * 2.094); g.beginPath(); g.moveTo(-9, 0); g.lineTo(-22, -c * 0.6); g.lineTo(22, -c * 0.6); g.lineTo(9, 0); g.fill(); g.restore(); }
      g.fillStyle = '#d8d2c4'; g.beginPath(); g.arc(c, c, 12, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#26221e'; g.beginPath(); g.arc(c, c, 5, 0, Math.PI * 2); g.fill();
    });

    const folderMap = tex(256, 340, (g, w, h) => {
      g.fillStyle = '#b39a6c'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 300; i++) blob(g, rnd() * w, rnd() * h, R(1, 10), R(1, 10), `rgba(${rnd() < 0.5 ? '60,40,20' : '230,210,170'},${R(0.03, 0.1)})`);
      g.fillStyle = '#2a2219'; g.textAlign = 'center';
      g.font = '600 34px Oswald, sans-serif'; g.fillText('ДЕЛО', w / 2, 90);
      g.font = '22px "PT Mono", monospace'; g.fillText('№ ______', w / 2, 128);
      g.strokeStyle = 'rgba(42,34,25,0.6)'; g.lineWidth = 1.5;
      for (let y = 180; y < 300; y += 26) { g.beginPath(); g.moveTo(34, y); g.lineTo(w - 34, y); g.stroke(); }
    });

    mark('textures');
    // ---------- материалы ----------
    const M = {
      wall: new THREE.MeshStandardMaterial({ map: wallMap, roughnessMap: wallRough, roughness: 1, metalness: 0 }),
      floor: new THREE.MeshStandardMaterial({ map: floorMap, roughness: 0.62, metalness: 0 }),
      ceiling: new THREE.MeshStandardMaterial({ color: 0x3a3833, roughness: 1 }),
      table: new THREE.MeshStandardMaterial({ map: tableMap, roughnessMap: tableRough, roughness: 0.8, metalness: 0.45 }),
      steel: new THREE.MeshStandardMaterial({ color: 0x2b2d2a, roughness: 0.55, metalness: 0.6 }),
      darkMetal: new THREE.MeshStandardMaterial({ color: 0x171816, roughness: 0.5, metalness: 0.7 }),
      wood: new THREE.MeshStandardMaterial({ color: 0x3b2a1e, roughness: 0.7 }),
      door: new THREE.MeshStandardMaterial({ color: 0x2c3a33, roughness: 0.5 }),
      black: new THREE.MeshStandardMaterial({ color: 0x0b0b0b, roughness: 1 }),
      paper: new THREE.MeshStandardMaterial({ color: 0xe8e0cc, roughness: 0.92 }),
    };

    // ---------- комната ----------
    const room = new THREE.Group();
    scene.add(room);
    function add(geo, mat, parent, x = 0, y = 0, z = 0, opt = {}) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      if (opt.rx) m.rotation.x = opt.rx; if (opt.ry) m.rotation.y = opt.ry; if (opt.rz) m.rotation.z = opt.rz;
      m.castShadow = opt.cast !== false && opt.cast !== undefined ? true : !!opt.cast;
      m.receiveShadow = opt.receive !== false;
      (parent || scene).add(m);
      return m;
    }
    // кусок стены с UV по мировым метрам, чтобы текстура совпадала на всех кусках
    function wallPiece(u0, u1, y0, y1, place) {
      const geo = new THREE.PlaneGeometry(u1 - u0, y1 - y0);
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) {
        const u = uv.getX(i), v = uv.getY(i);
        uv.setXY(i, (u0 + u * (u1 - u0)) / 3.2, (y0 + v * (y1 - y0)) / ROOM.h);
      }
      const m = new THREE.Mesh(geo, M.wall);
      m.receiveShadow = true;
      place(m, (u0 + u1) / 2, (y0 + y1) / 2);
      room.add(m);
      return m;
    }
    const MIR = { x0: -1.2, x1: 0.95, y0: 0.95, y1: 2.08, z: ROOM.z0 };
    // задняя стена с проёмом под стекло
    const back = (m, u, y) => { m.position.set(u, y, ROOM.z0); };
    wallPiece(ROOM.x0, MIR.x0, 0, ROOM.h, back);
    wallPiece(MIR.x1, ROOM.x1, 0, ROOM.h, back);
    wallPiece(MIR.x0, MIR.x1, 0, MIR.y0, back);
    wallPiece(MIR.x0, MIR.x1, MIR.y1, ROOM.h, back);
    // передняя стена (за спиной следователя) — её видно только в зеркале
    wallPiece(-1.6, 1.6, 0, ROOM.h, (m, u, y) => { m.position.set(-u, y, ROOM.z1); m.rotation.y = Math.PI; });
    // левая стена (дверь), правая стена (батарея)
    wallPiece(-1.9, 2.3, 0, ROOM.h, (m, u, y) => { m.position.set(ROOM.x0, y, u); m.rotation.y = Math.PI / 2; });
    wallPiece(-2.3, 1.9, 0, ROOM.h, (m, u, y) => { m.position.set(ROOM.x1, y, -u); m.rotation.y = -Math.PI / 2; });
    const floor = add(new THREE.PlaneGeometry(3.2, 4.2), M.floor, room, 0, 0, 0.2, { rx: -Math.PI / 2 });
    floor.receiveShadow = true;
    add(new THREE.PlaneGeometry(3.2, 4.2), M.ceiling, room, 0, ROOM.h, 0.2, { rx: Math.PI / 2 });
    // плинтус
    add(new THREE.BoxGeometry(3.2, 0.1, 0.02), M.door, room, 0, 0.05, ROOM.z0 + 0.01);

    // рама зеркала
    const frameY = (MIR.y0 + MIR.y1) / 2, frameX = (MIR.x0 + MIR.x1) / 2, fw = MIR.x1 - MIR.x0, fh = MIR.y1 - MIR.y0;
    add(new THREE.BoxGeometry(fw + 0.1, 0.05, 0.06), M.darkMetal, room, frameX, MIR.y1 + 0.025, ROOM.z0 + 0.02);
    add(new THREE.BoxGeometry(fw + 0.1, 0.06, 0.1), M.darkMetal, room, frameX, MIR.y0 - 0.03, ROOM.z0 + 0.04);
    add(new THREE.BoxGeometry(0.05, fh, 0.06), M.darkMetal, room, MIR.x0 - 0.025, frameY, ROOM.z0 + 0.02);
    add(new THREE.BoxGeometry(0.05, fh, 0.06), M.darkMetal, room, MIR.x1 + 0.025, frameY, ROOM.z0 + 0.02);

    // зеркальное стекло: свой шейдер отражения — тонировка, грязь, «прозрачность» в финале
    const MirrorShader = {
      name: 'OneWayGlass',
      uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, uDirt: { value: null }, uSee: { value: 0 } },
      vertexShader: `
        uniform mat4 textureMatrix; varying vec4 vUvR; varying vec2 vUv2;
        #include <common>
        #include <logdepthbuf_pars_vertex>
        void main() {
          vUv2 = uv; vUvR = textureMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: `
        uniform vec3 color; uniform sampler2D tDiffuse; uniform sampler2D uDirt; uniform float uSee;
        varying vec4 vUvR; varying vec2 vUv2;
        #include <logdepthbuf_pars_fragment>
        void main() {
          #include <logdepthbuf_fragment>
          vec3 base = texture2DProj(tDiffuse, vUvR).rgb;
          float dirt = texture2D(uDirt, vUv2).r;
          vec3 col = base * color * (1.0 - 0.5 * dirt) + vec3(0.012, 0.013, 0.012) * dirt;
          vec2 e = abs(vUv2 - 0.5) * 2.0;
          col *= 1.0 - 0.4 * smoothstep(0.82, 1.0, max(e.x, e.y));
          gl_FragColor = vec4(col, 1.0 - 0.82 * uSee);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    };
    const mirrorRes = () => {
      const w = Math.min(SHOT ? 640 : 1024, Math.round(window.innerWidth * dpr * (SHOT ? 0.45 : 0.62))), h = Math.round(w * fh / fw);
      return [w, h];
    };
    const [mrw, mrh] = mirrorRes();
    const mirror = new Reflector(new THREE.PlaneGeometry(fw, fh), {
      clipBias: 0.003, textureWidth: mrw, textureHeight: mrh, shader: MirrorShader, multisample: SHOT ? 0 : 2,
    });
    mirror.material.uniforms.uDirt.value = dirtMap;
    mirror.material.uniforms.color.value = new Col().setRGB(0.5, 0.54, 0.53);
    mirror.position.set(frameX, frameY, ROOM.z0 + 0.004);
    mirror.camera.layers.enable(1);            // в отражении виден силуэт следователя
    scene.add(mirror);

    // комната наблюдения за стеклом (видна только в финале)
    const obs = new THREE.Group();
    obs.visible = false;
    scene.add(obs);
    const obsMat = new THREE.MeshStandardMaterial({ color: 0x1a1d1b, roughness: 1 });
    add(new THREE.BoxGeometry(3.2, 0.02, 1.6), obsMat, obs, 0, 0, ROOM.z0 - 0.85);
    add(new THREE.BoxGeometry(3.2, ROOM.h, 0.02), obsMat, obs, 0, ROOM.h / 2, ROOM.z0 - 1.65);
    add(new THREE.BoxGeometry(3.2, 0.02, 1.6), obsMat, obs, 0, ROOM.h, ROOM.z0 - 0.85);
    const silMat = new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 1 });
    [[-0.55, 1.0], [0.35, 0.95]].forEach(([x, s]) => {
      const f = new THREE.Group(); f.position.set(x, 0, ROOM.z0 - 0.7); f.scale.setScalar(s); obs.add(f);
      add(new THREE.CapsuleGeometry(0.2, 0.7, 4, 12), silMat, f, 0, 1.05, 0);
      add(new THREE.SphereGeometry(0.11, 16, 12), silMat, f, 0, 1.68, 0);
      add(new THREE.CylinderGeometry(0.2, 0.2, 0.012, 20), silMat, f, 0, 1.76, 0);
      add(new THREE.CylinderGeometry(0.1, 0.11, 0.1, 16), silMat, f, 0, 1.81, 0);
    });
    const obsLight = new THREE.PointLight(0xdfe6c8, 0, 3.5, 1.6);
    obsLight.position.set(0, 2.3, ROOM.z0 - 0.9);
    scene.add(obsLight);   // свет всегда в сцене, иначе при его появлении перекомпилируются все шейдеры

    // дверь слева
    const door = new THREE.Group();
    door.position.set(ROOM.x0 + 0.02, 0, -1.4);   // петли у заднего края
    room.add(door);
    const doorPanel = add(new THREE.BoxGeometry(0.05, 2.04, 0.9), M.door, door, 0, 1.02, 0.45, { cast: true });
    add(new THREE.BoxGeometry(0.06, 0.3, 0.26), new THREE.MeshBasicMaterial({ color: new Col(0.45, 0.55, 0.6) }), door, 0.005, 1.62, 0.45);
    add(new THREE.SphereGeometry(0.03, 12, 8), M.steel, door, 0.05, 1.0, 0.8);
    add(new THREE.BoxGeometry(0.03, 2.12, 1.0), M.darkMetal, room, ROOM.x0 + 0.005, 1.04, -0.95);   // коробка
    const corridor = new THREE.PointLight(0x9fb4c4, 0, 5, 1.2);
    corridor.position.set(ROOM.x0 - 0.4, 1.8, -0.95);
    room.add(corridor);

    // окно с жалюзи на передней стене — видно в зеркале
    const winGlow = new THREE.MeshBasicMaterial({ map: blindsMap, color: new Col(0.55, 0.68, 0.85) });
    add(new THREE.PlaneGeometry(1.05, 1.05), winGlow, room, -0.55, 1.75, ROOM.z1 - 0.01, { ry: Math.PI });

    // батарея, трубы, часы, табличка
    const radiator = new THREE.Group(); radiator.position.set(ROOM.x1 - 0.1, 0.18, 0.3); room.add(radiator);
    for (let i = 0; i < 10; i++) add(new THREE.BoxGeometry(0.07, 0.55, 0.06), M.steel, radiator, 0, 0.27, i * 0.08 - 0.36);
    add(new THREE.CylinderGeometry(0.02, 0.02, ROOM.h, 8), M.steel, room, ROOM.x1 - 0.06, ROOM.h / 2, 1.2);
    add(new THREE.CylinderGeometry(0.018, 0.018, 3.2, 8), M.steel, room, 0, 2.55, ROOM.z0 + 0.06, { rz: Math.PI / 2 });
    const clock = new THREE.Group(); clock.position.set(1.3, 1.88, ROOM.z0 + 0.03); room.add(clock);
    add(new THREE.CylinderGeometry(0.16, 0.16, 0.04, 40), M.darkMetal, clock, 0, 0, 0, { rx: Math.PI / 2 });
    add(new THREE.CircleGeometry(0.145, 40), new THREE.MeshStandardMaterial({ map: clockMap, roughness: 0.4 }), clock, 0, 0, 0.021);
    const handMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 });
    const hourHand = new THREE.Group(), minHand = new THREE.Group();
    hourHand.position.z = 0.025; minHand.position.z = 0.028;
    clock.add(hourHand, minHand);
    add(new THREE.BoxGeometry(0.012, 0.075, 0.003), handMat, hourHand, 0, 0.03, 0);
    add(new THREE.BoxGeometry(0.008, 0.11, 0.003), handMat, minHand, 0, 0.048, 0);
    add(new THREE.PlaneGeometry(0.34, 0.13), new THREE.MeshStandardMaterial({ map: signMap, roughness: 0.35 }), room, -1.4, 1.62, ROOM.z0 + 0.01);
    // вешалка у двери: пальто и шляпа
    const rack = new THREE.Group(); rack.position.set(ROOM.x0 + 0.25, 0, 0.9); room.add(rack);
    add(new THREE.CylinderGeometry(0.018, 0.022, 1.8, 8), M.wood, rack, 0, 0.9, 0);
    add(new THREE.CapsuleGeometry(0.16, 0.8, 4, 10), new THREE.MeshStandardMaterial({ color: 0x2e2a25, roughness: 0.95 }), rack, 0.06, 1.15, 0, { cast: true });
    add(new THREE.CylinderGeometry(0.15, 0.15, 0.012, 24), new THREE.MeshStandardMaterial({ color: 0x241f1b, roughness: 0.9 }), rack, 0, 1.83, 0);
    add(new THREE.CylinderGeometry(0.085, 0.095, 0.1, 20), new THREE.MeshStandardMaterial({ color: 0x241f1b, roughness: 0.9 }), rack, 0, 1.88, 0);

    // ---------- стол, стулья, предметы ----------
    const TABLE = { x: 0, z: -0.1, y: 0.76, w: 1.25, d: 0.8 };
    const table = new THREE.Group(); room.add(table);
    add(new THREE.BoxGeometry(TABLE.w, 0.035, TABLE.d), M.table, table, TABLE.x, TABLE.y - 0.0175, TABLE.z, { cast: true });
    add(new THREE.BoxGeometry(TABLE.w - 0.04, 0.07, TABLE.d - 0.04), M.steel, table, TABLE.x, TABLE.y - 0.07, TABLE.z, { cast: true });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(new THREE.BoxGeometry(0.04, TABLE.y - 0.04, 0.04), M.steel, table, sx * (TABLE.w / 2 - 0.05), (TABLE.y - 0.04) / 2, TABLE.z + sz * (TABLE.d / 2 - 0.05), { cast: true });
    add(new THREE.TorusGeometry(0.025, 0.005, 6, 16), M.steel, table, 0.2, TABLE.y + 0.004, TABLE.z - TABLE.d / 2 + 0.06, { rx: Math.PI / 2 });

    function chair(x, z, ry) {
      const c = new THREE.Group(); c.position.set(x, 0, z); c.rotation.y = ry; room.add(c);
      add(new THREE.BoxGeometry(0.42, 0.03, 0.4), M.wood, c, 0, 0.445, 0, { cast: true });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(new THREE.CylinderGeometry(0.014, 0.014, 0.44, 6), M.darkMetal, c, sx * 0.18, 0.22, sz * 0.17, { cast: true });
      add(new THREE.BoxGeometry(0.4, 0.2, 0.025), M.wood, c, 0, 0.82, -0.2, { rx: -0.08, cast: true });
      for (const sx of [-1, 1]) add(new THREE.CylinderGeometry(0.012, 0.012, 0.44, 6), M.darkMetal, c, sx * 0.18, 0.67, -0.19, { cast: true });
      return c;
    }
    chair(0, -0.82, 0);
    chair(-0.1, 1.05, Math.PI);

    // пепельница с окурками
    const ashtray = new THREE.Group(); ashtray.position.set(-0.36, TABLE.y, -0.3); table.add(ashtray);
    const ashMat = new THREE.MeshStandardMaterial({ color: 0x5b5f58, roughness: 0.35, metalness: 0.7 });
    add(new THREE.CylinderGeometry(0.06, 0.052, 0.022, 24, 1, true), ashMat, ashtray, 0, 0.011, 0, { cast: true });
    add(new THREE.CylinderGeometry(0.052, 0.052, 0.004, 24), ashMat, ashtray, 0, 0.002, 0);
    const buttMat = new THREE.MeshStandardMaterial({ color: 0xcfc6b2, roughness: 0.9 });
    for (let i = 0; i < 5; i++) add(new THREE.CylinderGeometry(0.004, 0.004, R(0.022, 0.034), 6), buttMat, ashtray, R(-0.03, 0.03), 0.009, R(-0.03, 0.03), { rz: Math.PI / 2 - 0.1, ry: R(0, 3) });
    add(new THREE.CylinderGeometry(0.03, 0.03, 0.003, 12), new THREE.MeshStandardMaterial({ color: 0x3a3632, roughness: 1 }), ashtray, 0.005, 0.006, 0.005);

    // стакан воды
    const glassMat = new THREE.MeshStandardMaterial({ color: 0xcfe0dc, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.22, depthWrite: false });
    const waterMat = new THREE.MeshStandardMaterial({ color: 0x9fb8b0, roughness: 0.05, transparent: true, opacity: 0.28, depthWrite: false });
    const glass = new THREE.Group(); glass.position.set(0.37, TABLE.y, -0.36); table.add(glass);
    add(new THREE.CylinderGeometry(0.034, 0.03, 0.11, 20, 1, true), glassMat, glass, 0, 0.055, 0);
    add(new THREE.CylinderGeometry(0.031, 0.029, 0.06, 20), waterMat, glass, 0, 0.032, 0);

    // магнитофон следователя
    const recorder = new THREE.Group(); recorder.position.set(0.56, TABLE.y, 0.02); recorder.rotation.y = -0.32; table.add(recorder);
    add(new THREE.BoxGeometry(0.3, 0.075, 0.2), new THREE.MeshStandardMaterial({ color: 0x2f2b27, roughness: 0.6 }), recorder, 0, 0.0375, 0, { cast: true });
    add(new THREE.BoxGeometry(0.29, 0.004, 0.19), new THREE.MeshStandardMaterial({ color: 0x8c8a82, roughness: 0.35, metalness: 0.8 }), recorder, 0, 0.077, 0);
    const reelMat = new THREE.MeshStandardMaterial({ map: reelMap, roughness: 0.5 });
    const reels = [-0.075, 0.075].map((x) => add(new THREE.CylinderGeometry(0.055, 0.055, 0.008, 32), reelMat, recorder, x, 0.083, -0.01));
    const recLamp = add(new THREE.SphereGeometry(0.006, 10, 8), new THREE.MeshBasicMaterial({ color: new Col(2.5, 0.2, 0.1) }), recorder, 0.12, 0.08, 0.085);

    // папка с делом
    add(new THREE.BoxGeometry(0.24, 0.012, 0.32), new THREE.MeshStandardMaterial({ map: folderMap, roughness: 0.9 }), table, -0.42, TABLE.y + 0.006, -0.05, { ry: 0.12, cast: true });

    // ---------- лампа ----------
    const lampPivot = new THREE.Group(); lampPivot.position.set(0, ROOM.h, -0.18); scene.add(lampPivot);
    const CORD = 0.74;
    add(new THREE.CylinderGeometry(0.005, 0.005, CORD, 6), M.black, lampPivot, 0, -CORD / 2, 0);
    const shade = new THREE.Group(); shade.position.y = -CORD; lampPivot.add(shade);
    const prof = [[0.018, 0.1], [0.03, 0.095], [0.045, 0.07], [0.06, 0.045], [0.12, 0.0], [0.19, -0.05], [0.205, -0.065]].map(([r, y]) => new THREE.Vector2(r, y));
    const shadeOuter = new THREE.Mesh(new THREE.LatheGeometry(prof, 48), new THREE.MeshStandardMaterial({ color: 0x24362c, roughness: 0.3, metalness: 0.2, side: THREE.FrontSide }));
    shadeOuter.castShadow = true; shade.add(shadeOuter);
    const shadeInner = new THREE.Mesh(new THREE.LatheGeometry(prof, 48), new THREE.MeshBasicMaterial({ color: new Col(1.1, 0.95, 0.75), side: THREE.BackSide }));
    shade.add(shadeInner);
    const bulbMat = new THREE.MeshBasicMaterial({ color: new Col(6, 5, 3.4) });
    const bulb = add(new THREE.SphereGeometry(0.034, 20, 14), bulbMat, shade, 0, -0.02, 0, { cast: false });
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowMap, color: 0xffd9a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55 }));
    glow.scale.set(0.55, 0.55, 1); glow.position.y = -0.05; shade.add(glow);

    const LAMP_I = 6.5;
    const spot = new THREE.SpotLight(0xffc98f, LAMP_I, 0, 0.66, 0.6, 2);
    spot.position.set(0, -0.03, 0);
    spot.castShadow = true;
    spot.shadow.mapSize.set(SHOT ? 1024 : 1024, SHOT ? 1024 : 1024);
    spot.shadow.bias = -0.0004; spot.shadow.normalBias = 0.015;
    spot.shadow.camera.near = 0.1; spot.shadow.camera.far = 4;
    spot.shadow.radius = 3;
    shade.add(spot);
    const spotTarget = new THREE.Object3D(); spotTarget.position.set(0, -1.5, 0); shade.add(spotTarget); spot.target = spotTarget;

    // конус света: аддитивная оболочка
    const coneMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new Col(1.0, 0.74, 0.45) }, uInt: { value: 0.055 }, uTime: { value: 0 } },
      vertexShader: `
        varying vec3 vN; varying vec3 vW; varying float vH;
        void main() {
          vH = uv.y;
          vN = normalize(mat3(modelMatrix) * normal);
          vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: `
        uniform vec3 uColor; uniform float uInt; uniform float uTime;
        varying vec3 vN; varying vec3 vW; varying float vH;
        void main() {
          vec3 V = normalize(cameraPosition - vW);
          float f = pow(abs(dot(normalize(vN), V)), 2.2);
          float fall = smoothstep(0.0, 0.35, vH) * mix(0.35, 1.0, vH);
          float n = 0.85 + 0.15 * sin(vW.y * 9.0 + uTime * 0.7 + vW.x * 5.0);
          gl_FragColor = vec4(uColor * f * fall * uInt * n, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const CONE_H = 1.3;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.86, CONE_H, 48, 1, true), coneMat);
    cone.position.y = -0.02 - CONE_H / 2;
    cone.renderOrder = 5;
    shade.add(cone);

    const swing = { ax: 0.02, az: -0.012, vx: 0, vz: 0 };

    // ---------- остальной свет ----------
    scene.add(new THREE.HemisphereLight(0x3a4a58, 0x1a130d, 0.09));
    const winLight = new THREE.SpotLight(0x8aa6cf, 3.4, 0, 0.36, 0.65, 1.1);
    winLight.position.set(-0.55, 1.95, ROOM.z1 - 0.15);
    winLight.target.position.set(0.28, 1.05, ROOM.z0);
    winLight.map = blindsMap;
    winLight.castShadow = true;
    winLight.shadow.mapSize.set(512, 512);
    winLight.shadow.bias = -0.0006; winLight.shadow.normalBias = 0.02;
    winLight.shadow.camera.near = 0.5; winLight.shadow.camera.far = 6;
    scene.add(winLight, winLight.target);
    const faceFill = new THREE.PointLight(0xffc294, 0.1, 1.2, 2);   // отсвет стола на лицо снизу
    faceFill.position.set(0, 0.95, -0.34);
    scene.add(faceFill);
    const rim = new THREE.PointLight(0x7f97ad, 1.5, 3.4, 1.5);        // холодный контур из-за спины
    rim.position.set(-0.95, 1.75, -1.5);
    scene.add(rim);

    // ---------- силуэт следователя (только в отражении) ----------
    const det = new THREE.Group(); det.position.set(-0.12, 0, 1.08);
    const detMat = new THREE.MeshStandardMaterial({ color: 0x0e0e0f, roughness: 0.9 });
    add(new THREE.CapsuleGeometry(0.2, 0.36, 4, 12), detMat, det, 0, 1.02, 0);
    add(new THREE.SphereGeometry(0.09, 16, 12), detMat, det, 0, 1.4, 0.02);
    add(new THREE.CylinderGeometry(0.16, 0.16, 0.012, 24), detMat, det, 0, 1.49, 0.02);
    add(new THREE.CylinderGeometry(0.085, 0.095, 0.1, 18), detMat, det, 0, 1.54, 0.02);
    det.traverse((o) => o.layers.set(1));
    scene.add(det);

    mark('room');
    // ================================================================
    //   ПОДОЗРЕВАЕМЫЙ
    // ================================================================
    const HR = 0.1;
    // «скульптура» головы: гауссовы бугры по сфере (рыскание, тангаж, ширины, высота)
    const BUMPS = [
      [0, 0.3, 0.42, 0.075, 0.009],
      [0.37, 0.1, 0.13, 0.085, -0.011], [-0.37, 0.1, 0.13, 0.085, -0.011],
      [0.62, -0.12, 0.2, 0.16, 0.006], [-0.62, -0.12, 0.2, 0.16, 0.006],
      [0, -0.47, 0.3, 0.13, 0.006],
      [0, -0.8, 0.22, 0.13, 0.011],
      [0.75, -0.62, 0.22, 0.18, 0.006], [-0.75, -0.62, 0.22, 0.18, 0.006],
      [0, 0.06, 0.08, 0.2, 0.006],
    ];
    function shapeHead(nx, ny, nz, out, extra = 0) {
      const yaw = Math.atan2(nx, nz), pitch = Math.asin(clamp(ny, -1, 1));
      let d = 0;
      if (nz > -0.3) for (const b of BUMPS) { const a = (yaw - b[0]) / b[2], c = (pitch - b[1]) / b[3]; d += b[4] * Math.exp(-(a * a + c * c)); }
      if (nz > 0.5) d += noseDisp(yaw, pitch);
      const r = HR + d + extra;
      let x = nx * r * 0.94, y = ny * r * 1.1, z = nz * r * 1.02;
      if (ny < 0) { const t = Math.min(1, -ny); x *= 1 - 0.3 * t * t; if (z < 0) z *= 1 - 0.28 * t; }
      if (nz < 0 && ny > -0.2) { z *= 1.05; y *= 1.02; }
      return out.set(x, y, z);
    }
    // нос вылеплен смещением: гребень от переносицы к кончику, крылья, уход под кончик
    let NOSE = 1;
    function noseDisp(yaw, pitch) {
      if (Math.abs(yaw) > 0.45 || pitch > 0.3 || pitch < -0.5) return 0;
      const u = (0.12 - pitch) / 0.37;
      let h = u <= 1 ? lerp(0.0025, 0.0225, Math.pow(Math.max(0, u), 1.7)) : 0.0225 * (1 - smooth(1.0, 1.3, u));
      const w = lerp(0.05, 0.078, clamp(u, 0, 1));
      let d = h * Math.exp(-((yaw / w) ** 2)) * smooth(0.28, 0.1, pitch);
      for (const sx of [-1, 1]) { const a = (yaw - sx * 0.1) / 0.05, b = (pitch + 0.27) / 0.05; d += 0.0085 * Math.exp(-(a * a + b * b)); }
      return d * NOSE;
    }
    const headPoint = (yaw, pitch, out, extra = 0) => {
      const cp = Math.cos(pitch);
      return shapeHead(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp, out, extra);
    };

    const suspect = { root: null, look: null };
    const SUSPECT_POS = new V3(0, 0.47, -0.76);

    const st = {
      stress: 0.3, stressT: 0.3, mood: 'guarded',
      face: { brIn: 0, brY: 0, lid: 1, low: 0.6, corner: 0, lean: 0, pitch: 0, clasp: 0, broken: 0 },
      gesture: null, gT: 0, gDur: 1, gSide: 1, hold: -1,
      mouth: 0, mouthT: 0, speaking: false, thinking: false, nod: 0, nodV: 0,
      gazeKind: 'cam', gazeTimer: 1.2, gazePoint: new V3(), gazeOff: new V3(), microT: 0,
      eyeYaw: 0, eyePitch: 0, headYaw: 0, headPitch: 0, headRoll: 0,
      blink: 0, blinkT: 2.5, blinkPhase: -1, dbl: false,
      cardFocus: 0, cardPoint: new V3(),
      sweat: 0, flush: 0, ember: 0.4, shoulderUp: 0,
      exhale: -1,
    };
    const MOOD = {
      calm: { brIn: 0.0, brY: 0.05, lid: 1.0, low: 0.62, corner: 0.1, lean: 0.0, pitch: 0.02, clasp: 0.0 },
      guarded: { brIn: -0.3, brY: -0.1, lid: 0.86, low: 0.55, corner: -0.12, lean: -0.04, pitch: 0.0, clasp: 0.15 },
      irritated: { brIn: -0.75, brY: -0.2, lid: 0.8, low: 0.5, corner: -0.38, lean: 0.05, pitch: -0.03, clasp: 0.0 },
      scared: { brIn: 0.95, brY: 0.5, lid: 1.2, low: 0.66, corner: -0.3, lean: -0.03, pitch: 0.06, clasp: 0.85 },
      angry: { brIn: -1.0, brY: -0.3, lid: 0.95, low: 0.48, corner: -0.6, lean: 0.1, pitch: -0.06, clasp: 0.0 },
      broken: { brIn: 1.0, brY: 0.2, lid: 0.5, low: 0.6, corner: -0.5, lean: 0.1, pitch: 0.4, clasp: 1.0 },
      relieved: { brIn: 0.35, brY: 0.15, lid: 0.78, low: 0.58, corner: 0.06, lean: -0.08, pitch: 0.12, clasp: 0.0 },
    };

    let rig = null;   // все подвижные части текущего подозреваемого

    function buildSuspect(look) {
      if (suspect.root) { scene.remove(suspect.root); disposeTree(suspect.root); if (rig) rig.world.forEach((o) => { scene.remove(o); disposeTree(o); }); }
      suspect.look = look;
      const build = look.build || 1;
      const fem = look.sex === 'f';
      const root = new THREE.Group(); root.position.copy(SUSPECT_POS); scene.add(root);
      suspect.root = root;

      const skinCol = new Col(look.skin).lerp(new Col(0xb9aba2), 0.3);
      const hairCol = new Col(look.hairColor || 0x1e1812).lerp(new Col(0x9a968e), (look.grey || 0) * 0.85);
      const mSkin = new THREE.MeshStandardMaterial({ color: skinCol, roughness: 0.6 });
      const mHead = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.58 });
      const mLid = new THREE.MeshStandardMaterial({ color: skinCol.clone().multiplyScalar(0.86), roughness: 0.62 });
      const mLip = new THREE.MeshStandardMaterial({ color: fem && look.lips ? new Col(look.lips) : skinCol.clone().lerp(new Col(0x9a5048), 0.3).multiplyScalar(0.9), roughness: 0.5 });
      const mMouth = new THREE.MeshStandardMaterial({ color: 0x1f0d0b, roughness: 0.9 });
      const mTeeth = new THREE.MeshStandardMaterial({ color: 0xcfc6ae, roughness: 0.35 });
      const mEye = new THREE.MeshStandardMaterial({ color: 0xe6e0d2, roughness: 0.12 });
      const irisCols = [0x4a3222, 0x56687a, 0x4c5638, 0x2c1c12];
      const mIris = new THREE.MeshStandardMaterial({ color: irisCols[Math.floor(rnd() * irisCols.length)], roughness: 0.25 });
      const mPupil = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.1 });
      const mHair = new THREE.MeshStandardMaterial({ color: hairCol, roughness: look.hair === 'slick' || look.hair === 'bun' ? 0.36 : 0.78, map: fabricMap });
      const mBrow = new THREE.MeshStandardMaterial({ color: hairCol.clone().multiplyScalar(0.8), roughness: 0.9 });
      const mJacket = new THREE.MeshStandardMaterial({ color: look.jacket || 0x3f3a33, roughness: 0.92, map: fabricMap });
      const mJacketDark = new THREE.MeshStandardMaterial({ color: new Col(look.jacket || 0x3f3a33).multiplyScalar(0.72), roughness: 0.9, map: fabricMap });
      const mShirt = new THREE.MeshStandardMaterial({ color: fem ? 0xb9b0a2 : 0xa8a192, roughness: 0.85 });
      const mTie = new THREE.MeshStandardMaterial({ color: 0x4a1d1d, roughness: 0.7 });
      const mPants = new THREE.MeshStandardMaterial({ color: 0x1f1d1b, roughness: 0.9 });
      const mSweat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.02, metalness: 0.2, transparent: true, opacity: 0, depthWrite: false });
      const mHanky = new THREE.MeshStandardMaterial({ color: 0xe9e4d8, roughness: 0.95 });
      const mCig = new THREE.MeshStandardMaterial({ color: 0xece6da, roughness: 0.8 });
      const mFilter = new THREE.MeshStandardMaterial({ color: 0xc58a4a, roughness: 0.8 });
      const mEmber = new THREE.MeshBasicMaterial({ color: new Col(3, 0.8, 0.2) });
      const cast = { cast: true };

      // --- корпус ---
      const spine = new THREE.Group(); root.add(spine);
      const torsoProf = [[0.001, 0], [0.155, 0.0], [0.15, 0.2], [0.17, 0.38], [0.165, 0.5], [0.12, 0.575], [0.06, 0.61], [0.001, 0.615]].map(([r, y]) => new THREE.Vector2(r, y));
      const torso = add(new THREE.LatheGeometry(torsoProf, 32), mJacket, spine, 0, 0, 0, cast);
      torso.scale.set(1.2 * build, 1, 0.72 * (0.9 + 0.1 * build));
      for (const sx of [-1, 1]) add(new THREE.SphereGeometry(0.064, 20, 14), mJacket, spine, sx * 0.172 * build, 0.5, -0.005, cast).scale.set(1.12, 0.82, 1);
      // вырез пиджака, рубашка, лацканы, галстук
      const chestZ = 0.118 * (0.9 + 0.1 * build);
      add(new THREE.SphereGeometry(1, 20, 14), mShirt, spine, 0, 0.49, chestZ - 0.03).scale.set(0.045, 0.1, 0.025);
      for (const sx of [-1, 1]) {
        const lap = add(new THREE.BoxGeometry(0.05, 0.26, 0.012), mJacketDark, spine, sx * 0.05, 0.44, chestZ - 0.004, cast);
        lap.rotation.z = sx * 0.34; lap.rotation.y = sx * 0.28;
      }
      const collar = add(new THREE.TorusGeometry(0.052, 0.008, 8, 24), mShirt, spine, 0, 0.6, 0.004);
      collar.rotation.x = Math.PI / 2 - 0.25;
      if (look.tie) {
        add(new THREE.BoxGeometry(0.028, 0.026, 0.018), mTie, spine, 0.004, 0.535, chestZ - 0.006, { rz: 0.1 });
        const blade = add(new THREE.CylinderGeometry(0.014, 0.024, 0.2, 4, 1), mTie, spine, 0.01, 0.42, chestZ - 0.012, { rz: 0.06 });
        blade.rotation.y = Math.PI / 4; blade.scale.z = 0.25;
      }
      if (fem) add(new THREE.SphereGeometry(0.008, 10, 8), new THREE.MeshStandardMaterial({ color: 0xb89a5a, metalness: 0.9, roughness: 0.3 }), spine, 0.03, 0.5, chestZ + 0.004);

      // --- шея и голова ---
      add(new THREE.CylinderGeometry(0.044, 0.05, 0.12, 16), mSkin, spine, 0, 0.62, 0.0, cast);
      const neck = new THREE.Group(); neck.position.set(0, 0.645, 0.0); spine.add(neck);
      const head = new THREE.Group(); head.position.set(0, 0.11, 0.012); neck.add(head);

      // череп: сфера со «скульптурой» и цветом вершин (щетина, тени глазниц)
      NOSE = look.nose || 1;
      const hg = new THREE.SphereGeometry(1, 160, 96, -Math.PI / 2);
      const hp = hg.attributes.position; const cols = new Float32Array(hp.count * 3);
      const stubCol = new Col(0x2b2b31), sock = new Col(0x6a4a40);
      for (let i = 0; i < hp.count; i++) {
        _v1.fromBufferAttribute(hp, i).normalize();
        const nx = _v1.x, ny = _v1.y, nz = _v1.z;
        shapeHead(nx, ny, nz, _v2);
        hp.setXYZ(i, _v2.x, _v2.y, _v2.z);
        const c = skinCol.clone();
        // щетина: низ лица и над губой
        if (look.stubble > 0) {
          const s = smooth(-0.26, -0.44, ny) * smooth(-0.15, 0.25, nz);
          const lipCut = 1 - Math.exp(-(((ny + 0.48) / 0.05) ** 2) - ((nx / 0.18) ** 2));
          c.lerp(stubCol, s * look.stubble * 0.5 * clamp(lipCut, 0.3, 1));
        }
        // глазницы темнее, щёки теплее, ноздри
        for (const sx of [-1, 1]) {
          const ny2 = (Math.atan2(nx, nz) - sx * 0.05) / 0.035, np2 = (Math.asin(ny) + 0.335) / 0.03;
          c.multiplyScalar(1 - 0.55 * Math.exp(-(ny2 * ny2 + np2 * np2)));
          const dy = (Math.atan2(nx, nz) - sx * 0.37) / 0.16, dp = (Math.asin(ny) - 0.12) / 0.11;
          c.lerp(sock, 0.28 * Math.exp(-(dy * dy + dp * dp)));
          const cy = (Math.atan2(nx, nz) - sx * 0.55) / 0.22, cp = (Math.asin(ny) + 0.2) / 0.16;
          c.lerp(new Col(0xc4705a), 0.08 * Math.exp(-(cy * cy + cp * cp)));
        }
        cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
      }
      hg.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      hg.computeVertexNormals();
      const skull = add(hg, mHead, head, 0, 0, 0, cast);

      // глаза: яблоко крутится внутри «глазницы», веки — отдельно
      const eyes = [];
      for (const sx of [1, -1]) {
        const p = headPoint(sx * 0.37, 0.1, new V3());
        const n = p.clone().normalize();
        const socket = new THREE.Group(); socket.position.copy(p).addScaledVector(n, -0.0068); socket.rotation.y = sx * 0.12; head.add(socket);
        const ball = new THREE.Group(); socket.add(ball);
        add(new THREE.SphereGeometry(0.0163, 24, 18), mEye, ball);
        const iris = add(new THREE.SphereGeometry(0.01635, 24, 8, 0, Math.PI * 2, 0, 0.52), mIris, ball); iris.rotation.x = Math.PI / 2;
        const pupil = add(new THREE.SphereGeometry(0.0164, 16, 6, 0, Math.PI * 2, 0, 0.21), mPupil, ball); pupil.rotation.x = Math.PI / 2;
        const up = new THREE.Group(); socket.add(up);
        add(new THREE.SphereGeometry(0.0179, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mLid, up);
        const lash = add(new THREE.TorusGeometry(0.0179, 0.0013, 5, 24, Math.PI), new THREE.MeshStandardMaterial({ color: 0x120c0a, roughness: 1 }), up); lash.rotation.x = Math.PI / 2;
        const lo = new THREE.Group(); socket.add(lo);
        add(new THREE.SphereGeometry(0.0176, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mLid, lo);
        eyes.push({ ball, up, lo, pupil, sx });
      }
      // надбровья-брови
      const brows = [];
      for (const sx of [1, -1]) {
        const p = headPoint(sx * 0.36, 0.31, new V3(), 0.004);
        const g = new THREE.Group(); g.position.copy(p); g.rotation.y = sx * 0.36; head.add(g);
        const inner = new THREE.Group(); g.add(inner);
        const b = add(new THREE.CapsuleGeometry(0.0043 * (look.brows || 1), 0.032, 4, 8), mBrow, inner, 0, 0, 0); b.rotation.z = Math.PI / 2 + sx * 0.08;
        b.scale.set(1, 0.8, 0.5);
        brows.push({ g, inner, sx, y0: p.y });
      }
      // уши
      for (const sx of [-1, 1]) { const e = add(new THREE.SphereGeometry(1, 14, 10), mSkin, head, sx * 0.089, -0.004, -0.008, cast); e.scale.set(0.011, 0.027, 0.018); e.rotation.y = sx * 0.3; }
      // рот
      const mp = headPoint(0, -0.5, new V3());
      const mouth = new THREE.Group(); mouth.position.copy(mp); mouth.position.z += 0.002; head.add(mouth);
      const cavity = add(new THREE.SphereGeometry(0.018, 16, 10), mMouth, mouth, 0, -0.002, -0.004); cavity.scale.set(1, 0.2, 0.4);
      const teeth = add(new THREE.BoxGeometry(0.019, 0.0045, 0.004), mTeeth, mouth, 0, 0.0015, -0.0005);
      const lips = { up: [], lo: [] };
      for (const sx of [-1, 1]) {
        const pu = new THREE.Group(); pu.position.set(0, 0.0042, 0.0025); mouth.add(pu);
        add(new THREE.CapsuleGeometry(0.0037, 0.013, 4, 8), mLip, pu, sx * 0.0078, 0, 0, { rz: Math.PI / 2 });
        const pl = new THREE.Group(); pl.position.set(0, -0.0048, 0.0018); mouth.add(pl);
        add(new THREE.CapsuleGeometry(0.0047, 0.012, 4, 8), mLip, pl, sx * 0.007, 0, 0, { rz: Math.PI / 2 });
        lips.up.push({ g: pu, sx }); lips.lo.push({ g: pl, sx });
      }
      if (look.mustache && look.mustache !== 'none') {
        const r = look.mustache === 'thick' ? 0.0068 : 0.0028;
        for (const sx of [-1, 1]) add(new THREE.CapsuleGeometry(r, 0.016, 4, 8), mBrow, mouth, sx * 0.0085, 0.0105, 0.0045, { rz: Math.PI / 2 + sx * 0.32 });
      }
      // пот: капли на лбу
      const drops = [];
      for (let i = 0; i < 7; i++) {
        const d = add(new THREE.SphereGeometry(R(0.0011, 0.0018), 8, 6), mSweat, head);
        d.scale.set(1, 1.35, 0.6);
        drops.push({ m: d, yaw: R(-0.45, 0.45), pitch: R(0.36, 0.66), sp: R(0.012, 0.03), a: rnd() });
      }
      // очки
      if (look.glasses) {
        const gm = new THREE.MeshStandardMaterial({ color: 0x1a1612, roughness: 0.35, metalness: 0.5 });
        const lm = new THREE.MeshStandardMaterial({ color: 0xa9b8b4, roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.16, depthWrite: false });
        for (const sx of [1, -1]) {
          const p = headPoint(sx * 0.37, 0.1, new V3(), 0.017);
          const ring = add(new THREE.TorusGeometry(0.0205, 0.0022, 6, 28), gm, head, p.x, p.y, p.z); ring.rotation.y = sx * 0.1;
          const lens = add(new THREE.CircleGeometry(0.0205, 24), lm, head, p.x, p.y, p.z - 0.001); lens.rotation.y = sx * 0.1;
          const tpl = add(new THREE.BoxGeometry(0.003, 0.003, 0.1), gm, head, sx * 0.085, p.y + 0.004, 0.04); tpl.rotation.y = -sx * 0.1;
        }
        const pc = headPoint(0, 0.1, new V3(), 0.014);
        add(new THREE.CylinderGeometry(0.0018, 0.0018, 0.022, 6), gm, head, pc.x, pc.y + 0.004, pc.z, { rz: Math.PI / 2 });
      }
      // волосы
      buildHair(head, look, mHair, mSkin);
      if (fem) for (const sx of [-1, 1]) add(new THREE.SphereGeometry(0.0055, 10, 8), new THREE.MeshStandardMaterial({ color: 0xc9a45c, metalness: 0.9, roughness: 0.25 }), head, sx * 0.09, -0.04, 0.0);

      // --- ноги (видны на общем плане) ---
      for (const sx of [-1, 1]) {
        const th = add(new THREE.CapsuleGeometry(0.068, 0.34, 4, 10), mPants, root, sx * 0.1, 0.005, 0.2, cast); th.rotation.x = Math.PI / 2 - 0.05;
        const sh = add(new THREE.CapsuleGeometry(0.055, 0.34, 4, 10), mPants, root, sx * 0.11, -0.2, 0.43, cast); sh.rotation.x = 0.08;
        add(new THREE.BoxGeometry(0.09, 0.07, 0.24), M.black, root, sx * 0.11, -0.435, 0.5, cast);
      }

      // --- руки: кости в мире, IK считается каждый кадр ---
      const world = [];
      const arm = (sx) => {
        const up = new THREE.Mesh(new THREE.CapsuleGeometry(0.041, 0.18, 4, 12), mJacket); up.castShadow = true;
        const fo = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.17, 4, 12), mJacket); fo.castShadow = true;
        const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.038, 14, 10), mJacket); elbow.castShadow = true;
        const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.031, 0.033, 0.024, 14), mShirt); cuff.castShadow = true;
        const hand = new THREE.Group();
        const palm = add(new THREE.SphereGeometry(1, 18, 12), mSkin, hand, 0, 0, 0.04, cast); palm.scale.set(0.041 * (fem ? 0.88 : 1), 0.017, 0.047);
        const fingers = [];
        const fx = [-0.024, -0.008, 0.008, 0.023];
        for (let i = 0; i < 4; i++) {
          const k1 = new THREE.Group(); k1.position.set(fx[i] * (fem ? 0.9 : 1), 0.002, 0.08); hand.add(k1);
          const l1 = [0.024, 0.027, 0.026, 0.02][i];
          add(new THREE.CapsuleGeometry(0.0083 * (fem ? 0.85 : 1), l1, 3, 8), mSkin, k1, 0, 0, l1 / 2, { rx: Math.PI / 2, cast: true });
          const k2 = new THREE.Group(); k2.position.set(0, 0, l1 + 0.004); k1.add(k2);
          add(new THREE.CapsuleGeometry(0.0076 * (fem ? 0.85 : 1), l1 * 0.72, 3, 8), mSkin, k2, 0, 0, l1 * 0.36, { rx: Math.PI / 2, cast: true });
          fingers.push({ k1, k2, i });
        }
        const th1 = new THREE.Group(); th1.position.set(-sx * 0.034, -0.004, 0.035); th1.rotation.y = -sx * 0.7; hand.add(th1);
        add(new THREE.CapsuleGeometry(0.0095, 0.03, 3, 8), mSkin, th1, 0, 0, 0.02, { rx: Math.PI / 2, cast: true });
        [up, fo, elbow, cuff, hand].forEach((o) => { scene.add(o); world.push(o); });
        return { sx, up, fo, elbow, cuff, hand, fingers, thumb: th1, pos: new V3(), quat: new Q(), curl: 0, init: false };
      };
      const armL = arm(1), armR = arm(-1);
      // сигарета в правой руке, платок в левой
      const cig = new THREE.Group(); cig.position.set(-0.004, 0.012, 0.085); cig.rotation.set(-0.25, 0.9, 0); armR.hand.add(cig);
      add(new THREE.CylinderGeometry(0.0038, 0.0038, 0.052, 8), mCig, cig, 0, 0, 0.012, { rx: Math.PI / 2 });
      add(new THREE.CylinderGeometry(0.0039, 0.0039, 0.018, 8), mFilter, cig, 0, 0, -0.022, { rx: Math.PI / 2 });
      const ember = add(new THREE.SphereGeometry(0.0042, 8, 6), mEmber, cig, 0, 0, 0.039);
      const hanky = add(new THREE.IcosahedronGeometry(1, 1), mHanky, armL.hand, 0.0, -0.02, 0.06);
      hanky.scale.set(0.04, 0.012, 0.035); hanky.visible = false;

      rig = { root, spine, torso, neck, head, skull, eyes, brows, mouth, cavity, teeth, lips, drops, armL, armR, cig, ember, hanky,
        mHead, mSkin, mSweat, mEmber, skinCol, world, build };
      return rig;
    }

    function buildHair(head, look, mHair, mSkin) {
      const cap = (thetaLen, tilt, sc, extra = 1.035) => {
        const g = new THREE.SphereGeometry(HR * extra, 48, 24, 0, Math.PI * 2, 0, thetaLen);
        g.rotateX(-tilt);
        g.scale(0.94 * sc[0], 1.1 * sc[1], 1.02 * sc[2]);
        const m = add(g, mHair, head, 0, 0.004, -0.004, { cast: true });
        return m;
      };
      switch (look.hair) {
        case 'bald': {
          const t = add(new THREE.TorusGeometry(0.083, 0.022, 10, 28, Math.PI * 1.15), mHair, head, 0, 0.012, -0.012, { cast: true });
          t.rotation.x = Math.PI / 2; t.rotation.z = Math.PI * 0.93; t.scale.set(1.08, 1.1, 1.2);
          break;
        }
        case 'curly': {
          cap(1.6, 0.72, [1.02, 1, 1.02], 1.02);
          for (let i = 0; i < 46; i++) {
            const yaw = R(-2.9, 2.9), pitch = R(0.35, 1.45) - (Math.abs(yaw) > 1.6 ? 0.35 : 0);
            if (Math.abs(yaw) < 0.9 && pitch < 0.72) continue;
            const p = headPoint(yaw, pitch, new V3(), 0.012);
            add(new THREE.SphereGeometry(R(0.014, 0.021), 10, 8), mHair, head, p.x, p.y, p.z, { cast: true });
          }
          break;
        }
        case 'short': cap(1.66, 0.78, [1.01, 1, 1.01], 1.022); break;
        case 'bob': {
          cap(1.92, 0.62, [1.1, 1.02, 1.08], 1.06);
          for (const sx of [-1, 1]) { const s = add(new THREE.SphereGeometry(1, 20, 14), mHair, head, sx * 0.082, -0.05, -0.02, { cast: true }); s.scale.set(0.03, 0.07, 0.07); }
          const fr = add(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mHair, head, 0, 0.07, 0.035, { cast: true });
          fr.scale.set(0.085, 0.035, 0.07); fr.rotation.x = 0.35;
          break;
        }
        case 'bun': {
          cap(1.7, 0.75, [1.02, 1.0, 1.02], 1.03);
          add(new THREE.SphereGeometry(0.038, 18, 14), mHair, head, 0, 0.075, -0.09, { cast: true });
          break;
        }
        case 'waves': {
          cap(1.9, 0.66, [1.12, 1.04, 1.1], 1.06);
          for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) add(new THREE.SphereGeometry(0.03, 14, 10), mHair, head, sx * (0.085 - k * 0.004), -0.02 - k * 0.035, -0.03 - k * 0.01, { cast: true });
          break;
        }
        default: cap(1.64, 0.76, [1.02, 1, 1.02]);
      }
    }

    function disposeTree(o) {
      o.traverse((c) => { if (c.geometry) c.geometry.dispose(); if (c.material && !Object.values(M).includes(c.material)) { (Array.isArray(c.material) ? c.material : [c.material]).forEach((m) => m.dispose()); } });
    }

    // ---------- позы рук ----------
    // Точки в координатах корня подозреваемого (бёдра); ориентация — (пальцы, тыльная сторона)
    const HAND = {
      restL: [0.13, 0.322, 0.47], restR: [-0.14, 0.322, 0.455],
      claspL: [0.03, 0.33, 0.45], claspR: [-0.035, 0.346, 0.46],
      brokeL: [0.03, 0.55, 0.32], brokeR: [-0.03, 0.56, 0.31],
    };
    const tmpPose = () => ({ pos: new V3(), f: new V3(), u: new V3(), curl: 0 });
    const poseL = tmpPose(), poseR = tmpPose(), gL = tmpPose(), gR = tmpPose();
    const basis = new THREE.Matrix4();
    function quatFrom(f, u, out) {
      const z = _v1.copy(f).normalize();
      const x = _v2.copy(u).cross(z).normalize();
      const y = _v3.copy(z).cross(x).normalize();
      basis.makeBasis(x, y, z);
      return out.setFromRotationMatrix(basis);
    }
    const rootLocal = (arr, out) => out.set(arr[0], arr[1], arr[2]).applyMatrix4(rig.root.matrixWorld);
    const headLocal = (x, y, z, out) => out.set(x, y, z).applyMatrix4(rig.head.matrixWorld);
    const rootDir = (x, y, z, out) => out.set(x, y, z).transformDirection(rig.root.matrixWorld);

    // ---------- жесты ----------
    const GEST = { look_away: 2.4, tap: 2.6, wipe: 2.5, lean_back: 3.0, lean_in: 2.8, smoke: 3.8, hands_face: 3.8, shrug: 1.9, fist: 1.7 };
    let impactFired = false;
    const events = { onImpact: null, onExhale: null };

    function startGesture(name) {
      if (!GEST[name] || !rig) return;
      st.gesture = name; st.gT = 0; st.gDur = GEST[name]; st.gSide = rnd() < 0.5 ? -1 : 1; st.hold = -1;
      impactFired = false; st.exhale = -1;
    }

    // ---------- дым ----------
    const SMOKE_N = 120;
    const smokeGeo = new THREE.InstancedBufferGeometry();
    smokeGeo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    smokeGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    smokeGeo.setIndex([0, 1, 2, 0, 2, 3]);
    const sPos = new Float32Array(SMOKE_N * 3), sDat = new Float32Array(SMOKE_N * 4);
    const aPos = new THREE.InstancedBufferAttribute(sPos, 3), aDat = new THREE.InstancedBufferAttribute(sDat, 4);
    aPos.setUsage(THREE.DynamicDrawUsage); aDat.setUsage(THREE.DynamicDrawUsage);
    smokeGeo.setAttribute('iPos', aPos); smokeGeo.setAttribute('iDat', aDat);
    smokeGeo.instanceCount = SMOKE_N;
    const smokeMat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: smokeMap }, uLamp: { value: new V3() }, uDir: { value: new V3(0, -1, 0) }, uWin: { value: new V3() } },
      vertexShader: `
        attribute vec3 iPos; attribute vec4 iDat;
        uniform vec3 uLamp; uniform vec3 uDir;
        varying vec2 vUv; varying float vA; varying float vLit; varying float vS;
        void main() {
          vUv = uv; vA = iDat.y; vS = iDat.z;
          vec4 mv = viewMatrix * vec4(iPos, 1.0);
          float r = iDat.w; vec2 p = position.xy;
          p = vec2(p.x * cos(r) - p.y * sin(r), p.x * sin(r) + p.y * cos(r));
          mv.xy += p * iDat.x;
          gl_Position = projectionMatrix * mv;
          vec3 d = iPos - uLamp; float al = dot(d, uDir);
          float rad = length(d - uDir * al);
          float cr = max(0.04, al * 0.72);
          vLit = smoothstep(cr, cr * 0.25, rad) * step(0.0, al) / (1.0 + al * al * 0.9);
        }`,
      fragmentShader: `
        uniform sampler2D uTex;
        varying vec2 vUv; varying float vA; varying float vLit; varying float vS;
        void main() {
          float t = texture2D(uTex, vUv).r;
          vec3 warm = vec3(1.0, 0.78, 0.52), cool = vec3(0.32, 0.38, 0.44);
          vec3 col = mix(cool * 0.55, warm * 1.6, vLit);
          float a = t * vA * (0.35 + 1.25 * vLit);
          gl_FragColor = vec4(col, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false,
    });
    const smoke = new THREE.Mesh(smokeGeo, smokeMat);
    smoke.frustumCulled = false; smoke.renderOrder = 6;
    scene.add(smoke);
    const parts = [];
    for (let i = 0; i < SMOKE_N; i++) parts.push({ on: false, p: new V3(), v: new V3(), age: 0, life: 1, s0: 0.02, s1: 0.2, a: 0.2, rot: 0, rv: 0, seed: rnd(), haze: false });
    let emitAcc = 0;
    function spawn(pos, vel, life, s0, s1, a, haze = false) {
      const q = parts.find((x) => !x.on);
      if (!q) return;
      q.on = true; q.p.copy(pos); q.v.copy(vel); q.age = 0; q.life = life; q.s0 = s0; q.s1 = s1; q.a = a; q.rot = R(0, 6.28); q.rv = R(-0.4, 0.4); q.haze = haze;
    }
    // медленная дымка у лампы
    for (let i = 0; i < 9; i++) spawn(new V3(R(-0.6, 0.6), R(1.35, 2.3), R(-0.8, 0.5)), new V3(R(-0.02, 0.02), R(-0.005, 0.01), R(-0.02, 0.02)), 1e9, R(0.9, 1.5), R(0.9, 1.5), R(0.05, 0.09), true);
    function puff(pos, dir, n = 16) {
      for (let i = 0; i < n; i++) spawn(pos, new V3(dir.x * R(0.14, 0.3) + R(-0.05, 0.05), dir.y * 0.1 + R(0.02, 0.08), dir.z * R(0.14, 0.3) + R(-0.05, 0.05)), R(2.2, 3.4), R(0.03, 0.06), R(0.25, 0.45), R(0.18, 0.3));
    }

    // пылинки в конусе
    const DUST = 240;
    const dGeo = new THREE.BufferGeometry();
    const dP = new Float32Array(DUST * 3), dS = new Float32Array(DUST);
    for (let i = 0; i < DUST; i++) { const a = rnd() * 6.28, r = Math.sqrt(rnd()) * 0.7; dP.set([Math.cos(a) * r, R(0.8, 2.0), Math.sin(a) * r - 0.18], i * 3); dS[i] = rnd(); }
    dGeo.setAttribute('position', new THREE.BufferAttribute(dP, 3));
    dGeo.setAttribute('aS', new THREE.BufferAttribute(dS, 1));
    const dustMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uLamp: { value: new V3() }, uDir: { value: new V3(0, -1, 0) }, uPx: { value: 1 } },
      vertexShader: `
        attribute float aS; uniform float uTime; uniform vec3 uLamp; uniform vec3 uDir; uniform float uPx;
        varying float vL;
        void main() {
          vec3 p = position + vec3(sin(uTime * 0.13 + aS * 40.0) * 0.08, sin(uTime * 0.07 + aS * 17.0) * 0.12, cos(uTime * 0.11 + aS * 23.0) * 0.08);
          vec3 d = p - uLamp; float al = dot(d, uDir); float rad = length(d - uDir * al);
          vL = smoothstep(al * 0.66, al * 0.2, rad) * step(0.05, al) * (0.4 + 0.6 * fract(aS * 7.3));
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = uPx * (1.2 + 1.6 * fract(aS * 3.1)) * (1.6 / max(0.4, -mv.z));
        }`,
      fragmentShader: `
        varying float vL;
        void main() {
          vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.1, length(c)) * vL;
          gl_FragColor = vec4(vec3(1.0, 0.85, 0.6) * 1.4, a * 0.8);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const dust = new THREE.Points(dGeo, dustMat); dust.frustumCulled = false; scene.add(dust);

    // ---------- карточки улик на столе ----------
    const cards = [];
    function cardTexture(card) {
      return tex(256, 360, (g, w, h) => {
        g.fillStyle = card.kind === 'фото' ? '#e6e0d2' : '#e9e1ca'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 160; i++) blob(g, rnd() * w, rnd() * h, R(1, 8), R(1, 8), `rgba(90,70,40,${R(0.02, 0.06)})`);
        g.fillStyle = '#6b5a3f'; g.font = '600 20px Oswald, sans-serif'; g.fillText(String(card.kind || '').toUpperCase(), 18, 34);
        g.fillStyle = '#1d1a15'; g.font = '700 30px "PT Mono", monospace';
        const words = String(card.title || '').split(' '); let line = '', y = 76;
        for (const wd of words) { if (g.measureText(line + wd).width > w - 36) { g.fillText(line, 18, y); y += 34; line = ''; } line += wd + ' '; }
        g.fillText(line, 18, y);
        y += 22;
        if (card.kind === 'фото') {
          g.fillStyle = '#2b2a27'; g.fillRect(18, y, w - 36, 150);
          for (let i = 0; i < 26; i++) blob(g, 18 + rnd() * (w - 36), y + rnd() * 150, R(4, 40), R(4, 30), `rgba(${rnd() < 0.5 ? '200,195,180' : '10,10,10'},${R(0.08, 0.3)})`);
        } else {
          g.strokeStyle = 'rgba(40,34,25,0.55)'; g.lineWidth = 3;
          for (let k = 0; k < 7; k++) { g.beginPath(); g.moveTo(18, y + 12 + k * 22); g.lineTo(18 + R(120, w - 40), y + 12 + k * 22); g.stroke(); }
        }
        g.fillStyle = '#8f2a22'; g.font = '600 22px Oswald, sans-serif'; g.fillText(card.id || '', w - 58, h - 22);
      });
    }
    function present(card, instant) {
      const mat = new THREE.MeshStandardMaterial({ map: cardTexture(card), roughness: 0.9 });
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.002, 0.16), mat);
      m.castShadow = true; m.receiveShadow = true;
      m.userData.id = card.id;
      const i = cards.length;
      const to = new V3(-0.06 + ((i % 3) - 1) * 0.11 + R(-0.015, 0.015), TABLE.y + 0.0015 + i * 0.0022, -0.26 + R(-0.02, 0.02));
      const rotTo = R(-0.25, 0.25) + Math.PI;
      m.position.copy(instant ? to : new V3(0.05, TABLE.y + 0.02, 0.28));
      m.rotation.y = instant ? rotTo : Math.PI + 0.6;
      scene.add(m);
      cards.push({ m, to, rotTo, t: instant ? 1 : 0 });
      st.cardPoint.copy(to); st.cardFocus = instant ? 0 : 2.6;
      while (cards.length > 6) { const c = cards.shift(); scene.remove(c.m); c.m.geometry.dispose(); c.m.material.map.dispose(); c.m.material.dispose(); }
    }
    function clearCards() { while (cards.length) { const c = cards.pop(); scene.remove(c.m); c.m.geometry.dispose(); c.m.material.map.dispose(); c.m.material.dispose(); } }

    // ---------- камера ----------
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    window.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') { mouse.tx = (e.clientX / window.innerWidth) * 2 - 1; mouse.ty = (e.clientY / window.innerHeight) * 2 - 1; } }, { passive: true });
    let portrait = false, debugView = null;
    function preset(mode, t) {
      if (mode === 'debug' && debugView) return debugView;
      switch (mode) {
        case 'establish': {
          const a = 0.62 + Math.sin(t * 0.05) * 0.1;
          return { pos: new V3(Math.sin(a) * 2.2, 2.2 + Math.sin(t * 0.07) * 0.05, -0.3 + Math.cos(a) * 2.2), look: new V3(-0.08, 0.98, -0.52), fov: portrait ? 58 : 40 };
        }
        case 'close': return { pos: new V3(-0.06, 1.29, 0.16), look: new V3(0, 1.19, -0.72), fov: portrait ? 46 : 30 };
        case 'wide': return { pos: new V3(1.25, 1.8, 1.9), look: new V3(-0.2, 1.1, -0.95), fov: portrait ? 62 : 44 };
        case 'seat':
        default: return { pos: new V3(-0.1, 1.3, 0.78), look: new V3(0.0, 1.08, -0.64), fov: portrait ? 50 : 36 };
      }
    }
    const cam = { mode: 'establish', from: null, t: 1, dur: 2.4, shake: 0, lookDown: 0 };
    function setCamera(mode, instant) {
      if (cam.mode === mode && !instant) return;
      cam.from = { pos: camera.position.clone(), look: curLook.clone(), fov: camera.fov };
      cam.mode = mode; cam.t = instant ? 1 : 0;
      cam.dur = mode === 'close' ? 3.4 : 2.6;
    }
    const curLook = new V3(0, 1, -0.6);

    // ---------- размер ----------
    const shift = { v: 0, t: 0, y: 0.2, ty: 0.2 };
    function applyOffset() {
      const w = window.innerWidth, h = window.innerHeight;
      const sx = portrait ? 0 : shift.v, sy = portrait ? shift.y : 0;
      if (Math.abs(sx) < 1e-3 && !sy) camera.clearViewOffset();
      else camera.setViewOffset(w, h, Math.round(-sx * w), Math.round(h * sy), w, h);
      camera.updateProjectionMatrix();
    }
    function resize() {
      const w = window.innerWidth, h = window.innerHeight;
      portrait = w / h < 0.85;
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      applyOffset();
      dustMat.uniforms.uPx.value = dpr * Math.min(w, h) / 700;
      const [a, b] = mirrorRes();
      mirror.getRenderTarget().setSize(a, b);
    }
    window.addEventListener('resize', resize);

    // ---------- обновление подозреваемого ----------
    const tmpA = new V3(), tmpB = new V3(), tmpC = new V3(), tmpD = new V3(), pole = new V3();
    function solveArm(a, shoulder, pos, quat, curl, dt) {
      if (!a.init) { a.pos.copy(pos); a.quat.copy(quat); a.curl = curl; a.init = true; }
      a.pos.x = damp(a.pos.x, pos.x, 12, dt); a.pos.y = damp(a.pos.y, pos.y, 12, dt); a.pos.z = damp(a.pos.z, pos.z, 12, dt);
      a.quat.slerp(quat, 1 - Math.exp(-12 * dt));
      a.curl = damp(a.curl, curl, 14, dt);
      // запястье = ладонь назад по направлению пальцев
      const wrist = tmpA.set(0, 0, 0).applyQuaternion(a.quat).add(a.pos);
      const L1 = 0.27, L2 = 0.255;
      const d = tmpB.copy(wrist).sub(shoulder);
      let len = d.length();
      const maxL = L1 + L2 - 0.004;
      if (len > maxL) { d.multiplyScalar(maxL / len); wrist.copy(shoulder).add(d); len = maxL; }
      if (len < 0.08) len = 0.08;
      const dir = d.clone().normalize();
      const cosA = clamp((L1 * L1 + len * len - L2 * L2) / (2 * L1 * len), -1, 1);
      const A = Math.acos(cosA);
      pole.set(a.sx * 0.45, -1.0, -0.12).transformDirection(rig.root.matrixWorld);
      pole.addScaledVector(dir, -pole.dot(dir)).normalize();
      const elbow = tmpC.copy(shoulder).addScaledVector(dir, L1 * cosA).addScaledVector(pole, L1 * Math.sin(A));
      placeBone(a.up, shoulder, elbow);
      placeBone(a.fo, elbow, wrist);
      a.elbow.position.copy(elbow);
      a.cuff.position.copy(wrist).lerp(elbow, 0.05);
      a.cuff.quaternion.setFromUnitVectors(_v1.set(0, 1, 0), tmpD.copy(wrist).sub(elbow).normalize());
      a.hand.position.copy(wrist);
      a.hand.quaternion.copy(a.quat);
      a.cur = a.curl;
    }
    function placeBone(mesh, a, b) {
      mesh.position.copy(a).add(b).multiplyScalar(0.5);
      mesh.quaternion.setFromUnitVectors(_v1.set(0, 1, 0), _v2.copy(b).sub(a).normalize());
      const L = a.distanceTo(b);
      const base = mesh.geometry.parameters.length + 2 * mesh.geometry.parameters.radius;
      mesh.scale.set(1, L / base, 1);
    }
    function fingersPose(a, curl, tap, t) {
      for (const f of a.fingers) {
        let c = curl;
        if (tap > 0) c = Math.max(0, curl - 0.1) + tap * Math.max(0, Math.sin(t * 11 - f.i * 0.9)) * 0.9 * (f.i === 0 ? 0.6 : 1);
        f.k1.rotation.x = c * 1.35 + 0.08;
        f.k2.rotation.x = c * 1.5 + 0.05;
      }
      a.thumb.rotation.x = curl * 0.6;
    }

    const shoulderL = new V3(), shoulderR = new V3();
    const tgtQ = new Q(), tgtQ2 = new Q();

    function updateSuspect(dt, t) {
      if (!rig) return;
      st.stress = damp(st.stress, st.stressT, 1.4, dt);
      const s = st.stress;
      const M0 = MOOD[st.mood] || MOOD.guarded;
      const F = st.face;
      const brokenT = st.mood === 'broken' ? 1 : 0;
      for (const k of ['brIn', 'brY', 'lid', 'low', 'corner', 'lean', 'pitch', 'clasp']) F[k] = damp(F[k], M0[k], 3, dt);
      F.broken = damp(F.broken, brokenT, 2, dt);

      // --- жест ---
      let g = null, p = 0;
      if (st.gesture) {
        st.gT += st.hold >= 0 ? 0 : dt;
        p = st.hold >= 0 ? st.hold : st.gT / st.gDur;
        if (p >= 1) st.gesture = null; else g = st.gesture;
      }
      let lean = 0.07 + F.lean + Math.sin(t * lerp(1.4, 3.4, s)) * lerp(0.006, 0.012, s);
      let hYaw = 0, hPitch = F.pitch, hRoll = Math.sin(t * 0.31) * 0.02;
      let brIn = F.brIn, brY = F.brY, lid = F.lid, low = F.low, corner = F.corner;
      let tapL = s > 0.42 && !st.speaking ? smooth(0.42, 0.7, s) * (0.5 + 0.5 * Math.sin(t * 0.37)) : 0;
      let shoulderUp = 0, mouthExtra = 0, gazeOverride = null, hankyW = 0;
      const clasp = F.clasp * (1 - F.broken);

      // базовые позы рук
      rootLocal(HAND.restL, poseL.pos).lerp(rootLocal(HAND.claspL, tmpA), clasp).lerp(rootLocal(HAND.brokeL, tmpB), F.broken);
      rootLocal(HAND.restR, poseR.pos).lerp(rootLocal(HAND.claspR, tmpA), clasp).lerp(rootLocal(HAND.brokeR, tmpB), F.broken);
      rootDir(lerp(-0.25, -0.85, clasp), -0.05, lerp(1, 0.55, clasp), poseL.f).lerp(rootDir(-0.35, 0.9, 0.15, tmpA), F.broken).normalize();
      rootDir(lerp(0.25, 0.85, clasp), -0.05, lerp(1, 0.55, clasp), poseR.f).lerp(rootDir(0.35, 0.9, 0.15, tmpA), F.broken).normalize();
      rootDir(0, 1, 0, poseL.u).lerp(rootDir(0, 0.1, 1, tmpA), F.broken).normalize();
      rootDir(0, 1, 0, poseR.u).lerp(rootDir(0, 0.1, 1, tmpA), F.broken).normalize();
      poseL.curl = lerp(0.18, 0.55, Math.max(clasp, F.broken));
      poseR.curl = lerp(0.3, 0.55, Math.max(clasp, F.broken));
      if (F.broken > 0.5) hPitch += 0.08;

      let wL = 0, wR = 0;
      if (g) {
        const w = env(p, 0.2, 0.78);
        switch (g) {
          case 'look_away': { const w2 = env(p, 0.12, 0.82); gazeOverride = 'away'; hYaw += st.gSide * 0.35 * w2; hPitch += 0.1 * w2; break; }
          case 'tap': tapL = Math.max(tapL, env(p, 0.08, 0.9)); break;
          case 'wipe': {
            wL = env(p, 0.24, 0.8); hankyW = wL;
            const sweep = lerp(0.045, -0.05, smooth(0.28, 0.7, p));
            headLocal(0.02 + sweep, 0.085, 0.145, gL.pos);
            gL.f.set(-0.9, 0.35, 0.05).transformDirection(rig.head.matrixWorld);
            gL.u.set(0.1, 0.1, 1).transformDirection(rig.head.matrixWorld);
            gL.curl = 0.35;
            hPitch += 0.05 * wL; lid *= 1 - 0.3 * wL; gazeOverride = 'down';
            break;
          }
          case 'lean_back': lean -= 0.15 * env(p, 0.25, 0.75); break;
          case 'lean_in': { const w2 = env(p, 0.2, 0.8); lean += 0.16 * w2; hPitch -= 0.06 * w2; gazeOverride = 'cam'; brIn -= 0.3 * w2; break; }
          case 'smoke': {
            const toMouth = smooth(0.04, 0.28, p) * (1 - smooth(0.6, 0.78, p));
            const away = smooth(0.6, 0.76, p) * (1 - smooth(0.86, 1.0, p));
            wR = Math.max(toMouth, away);
            const mouthW = tmpC.copy(rig.mouth.position).applyMatrix4(rig.head.matrixWorld);
            if (toMouth >= away) {
              gR.pos.copy(mouthW).add(rootDir(-0.028, -0.052, 0.035, tmpD));
              gR.f.copy(rootDir(0.55, 0.65, -0.25, tmpD)).normalize();
              gR.u.copy(rootDir(0.35, -0.15, 0.95, tmpD)).normalize();
            } else {
              rootLocal([-0.2, 0.52, 0.3], gR.pos);
              gR.f.copy(rootDir(0.2, 0.9, 0.3, tmpD)).normalize();
              gR.u.copy(rootDir(-0.2, -0.3, 0.9, tmpD)).normalize();
            }
            gR.curl = 0.4;
            const drag = smooth(0.28, 0.34, p) * (1 - smooth(0.56, 0.62, p));
            st.ember = Math.max(st.ember, 0.4 + 1.6 * drag);
            hPitch -= 0.06 * drag; lid *= 1 - 0.35 * drag; mouthExtra = -0.2 * drag;
            if (p > 0.64 && st.exhale < 0) { st.exhale = 0; }
            if (p > 0.64 && p < 0.86) { mouthExtra = 0.28; hPitch -= 0.04; }
            break;
          }
          case 'hands_face': {
            const w2 = env(p, 0.22, 0.82); wL = wR = w2;
            headLocal(0.036, 0.0, 0.135, gL.pos); headLocal(-0.036, 0.0, 0.135, gR.pos);
            gL.f.set(-0.25, 1, -0.25).transformDirection(rig.head.matrixWorld);
            gR.f.set(0.25, 1, -0.25).transformDirection(rig.head.matrixWorld);
            gL.u.set(0, 0.1, 1).transformDirection(rig.head.matrixWorld); gR.u.copy(gL.u);
            gL.curl = gR.curl = 0.15;
            hPitch += 0.22 * w2; lean += 0.06 * w2;
            break;
          }
          case 'shrug': {
            const w2 = env(p, 0.3, 0.7); wL = wR = w2;
            gL.pos.copy(poseL.pos).add(rootDir(0.06, 0.08, -0.02, tmpD)); gR.pos.copy(poseR.pos).add(rootDir(-0.06, 0.08, -0.02, tmpD));
            gL.f.copy(rootDir(0.2, 0.15, 1, tmpD)).normalize(); gR.f.copy(rootDir(-0.2, 0.15, 1, tmpD)).normalize();
            gL.u.copy(rootDir(0.3, -1, 0.1, tmpD)).normalize(); gR.u.copy(rootDir(-0.3, -1, 0.1, tmpD)).normalize();
            gL.curl = gR.curl = 0.12;
            shoulderUp = 0.035 * w2; hRoll += 0.12 * w2 * st.gSide; brY += 0.5 * w2; corner -= 0.35 * w2;
            break;
          }
          case 'fist': {
            const up = smooth(0.0, 0.32, p) * (1 - smooth(0.36, 0.44, p));
            const slam = smooth(0.36, 0.44, p) * (1 - smooth(0.8, 1.0, p));
            wR = Math.max(up, slam);
            if (up > slam) rootLocal([-0.15, 0.56, 0.36], gR.pos); else rootLocal([-0.13, 0.318, 0.38], gR.pos);
            gR.f.copy(rootDir(0.2, 0, 1, tmpD)).normalize(); gR.u.copy(rootDir(-1, 0.2, 0, tmpD)).normalize();
            gR.curl = 1;
            if (p > 0.43 && !impactFired) { impactFired = true; impact(); }
            lean += 0.08 * env(p, 0.2, 0.8); brIn = Math.min(brIn, -0.9); corner = -0.6;
            break;
          }
        }
        void w;
      }
      // карточка на столе притягивает взгляд, стук в дверь — тоже
      if (st.cardFocus > 0) { st.cardFocus -= dt; if (!gazeOverride) gazeOverride = 'card'; }
      if (knockT >= 0 && knockT < 2.4 && !gazeOverride) gazeOverride = 'door';
      if (st.gazeHold) gazeOverride = st.gazeHold;

      // --- взгляд ---
      st.gazeTimer -= dt;
      if (st.gazeTimer <= 0) {
        const r = rnd();
        const camP = st.speaking ? 0.62 : st.thinking ? 0.0 : lerp(0.72, 0.36, s);
        const awayP = st.thinking ? 0.55 : lerp(0.14, 0.36, s);
        const lampP = st.thinking ? 0.12 : s > 0.7 ? 0.05 : 0.0;
        st.gazeKind = r < camP ? 'cam' : r < camP + awayP ? 'away' : r < camP + awayP + lampP ? 'lamp' : 'down';
        st.gazeTimer = R(0.7, 2.8) * lerp(1, 0.55, s);
        st.gazeOff.set(R(-1, 1), R(-1, 1), R(-1, 1));
        if (st.gazeKind !== 'cam' && rnd() < 0.5) startBlink();
      }
      const kind = gazeOverride || st.gazeKind;
      const gp = st.gazePoint;
      if (kind === 'cam') gp.copy(camera.position);
      else if (kind === 'card') gp.copy(st.cardPoint);
      else if (kind === 'lamp') gp.set(0, 2.0, -0.2);
      else if (kind === 'door') gp.set(ROOM.x0 + 0.2, 1.45, -0.95);
      else if (kind === 'down') gp.set(st.gazeOff.x * 0.25, TABLE.y, -0.25 + st.gazeOff.z * 0.08);
      else gp.set((g === 'look_away' ? st.gSide : Math.sign(st.gazeOff.x) || 1) * 0.9, 0.9 + st.gazeOff.y * 0.25, 0.1 + st.gazeOff.z * 0.4);
      st.microT -= dt;
      if (st.microT <= 0) { st.microT = R(0.18, 0.6); st.gazeOff.multiplyScalar(0.98); }
      rig.neck.updateWorldMatrix(true, false);
      const neckW = tmpA.setFromMatrixPosition(rig.neck.matrixWorld);
      const toT = tmpB.copy(gp).sub(neckW);
      const tYaw = Math.atan2(toT.x, toT.z), tPitch = -Math.atan2(toT.y - 0.1, Math.hypot(toT.x, toT.z));
      const jitter = s > 0.78 ? Math.sin(t * 47) * 0.0035 * (s - 0.78) * 5 : 0;
      st.headYaw = damp(st.headYaw, clamp(tYaw * 0.5, -0.6, 0.6) + hYaw, 3.2, dt);
      st.headPitch = damp(st.headPitch, clamp(tPitch * 0.45, -0.3, 0.45) + hPitch, 3.0, dt);
      st.headRoll = damp(st.headRoll, hRoll, 2.5, dt);
      const eyeYawT = clamp(tYaw - st.headYaw, -0.45, 0.45), eyePitchT = clamp(tPitch - st.headPitch, -0.3, 0.35);
      st.eyeYaw = damp(st.eyeYaw, eyeYawT, 26, dt); st.eyePitch = damp(st.eyePitch, eyePitchT, 26, dt);

      // кивки при речи
      st.nodV += (-st.nod * 60 - st.nodV * 9) * dt; st.nod += st.nodV * dt;

      // --- применяем к корпусу и голове ---
      rig.spine.rotation.x = lean + st.nod * 0.2;
      rig.spine.position.y = shoulderUp * 0.3;
      rig.neck.rotation.set(st.headPitch + st.nod + jitter, st.headYaw, st.headRoll);
      rig.root.updateMatrixWorld(true);

      // --- глаза, веки, брови ---
      blinkUpdate(dt, s);
      for (const e of rig.eyes) {
        e.ball.rotation.set(st.eyePitch * 0.9, st.eyeYaw * 0.95 - e.sx * 0.04, 0);
        const edge = lerp(lerp(0.05, 0.62, smooth(0.5, 1.2, lid)), -0.5, st.blink) - Math.max(0, st.eyePitch) * 0.55;
        e.up.rotation.x = -Math.asin(clamp(edge, -0.95, 0.95));
        e.lo.rotation.x = Math.asin(clamp(low - st.blink * 0.08, 0.1, 0.95));
        e.pupil.scale.setScalar(lerp(0.9, 1.35, s));
      }
      for (const b of rig.brows) {
        b.g.position.y = b.y0 + brY * 0.006;
        b.inner.rotation.z = b.sx * brIn * 0.32;
      }
      // --- рот ---
      st.mouthT = damp(st.mouthT, 0, 9, dt);
      st.mouth = damp(st.mouth, clamp(st.mouthT + mouthExtra, 0, 1), 30, dt);
      const open = st.mouth;
      rig.cavity.scale.set(1 - open * 0.15, 0.18 + open * 0.75, 0.4);
      rig.teeth.visible = open > 0.12;
      for (const l of rig.lips.up) { l.g.position.y = 0.0042 + open * 0.0012; l.g.rotation.z = l.sx * -corner * 0.3; }
      for (const l of rig.lips.lo) { l.g.position.y = -0.0048 - open * 0.0105; l.g.rotation.z = l.sx * -corner * 0.24; }

      // --- пот и кожа ---
      st.sweat = damp(st.sweat, smooth(0.5, 0.88, s), 0.6, dt);
      rig.mSweat.opacity = st.sweat * 0.5;
      rig.mHead.roughness = lerp(0.58, 0.3, st.sweat);
      rig.mSkin.roughness = lerp(0.6, 0.38, st.sweat);
      for (const d of rig.drops) {
        d.pitch -= d.sp * dt * (0.4 + st.sweat);
        if (d.pitch < 0.3) { d.pitch = R(0.5, 0.66); d.yaw = R(-0.45, 0.45); }
        headPoint(d.yaw, d.pitch, d.m.position, 0.0025);
        d.m.visible = st.sweat > 0.03;
      }
      const flushT = st.mood === 'angry' ? 1 : st.mood === 'irritated' ? 0.5 : st.mood === 'scared' || st.mood === 'broken' ? -0.6 : 0;
      st.flush = damp(st.flush, flushT * (0.4 + 0.6 * s), 1.2, dt);

      // --- руки ---
      rig.spine.updateMatrixWorld(true);
      shoulderL.set(0.175 * rig.build, 0.505 + shoulderUp, 0.0).applyMatrix4(rig.spine.matrixWorld);
      shoulderR.set(-0.175 * rig.build, 0.505 + shoulderUp, 0.0).applyMatrix4(rig.spine.matrixWorld);
      blendPose(poseL, gL, wL); blendPose(poseR, gR, wR);
      quatFrom(poseL.f, poseL.u, tgtQ); solveArm(rig.armL, shoulderL, poseL.pos, tgtQ, poseL.curl, dt);
      quatFrom(poseR.f, poseR.u, tgtQ2); solveArm(rig.armR, shoulderR, poseR.pos, tgtQ2, poseR.curl, dt);
      fingersPose(rig.armL, rig.armL.curl, tapL, t);
      fingersPose(rig.armR, rig.armR.curl, 0, t);
      rig.hanky.visible = hankyW > 0.05; rig.hanky.scale.set(0.04 * hankyW + 0.001, 0.012, 0.035 * hankyW + 0.001);
      rig.cig.visible = F.broken < 0.5 || g === 'smoke';
      st.ember = damp(st.ember, 0.4 + 0.08 * Math.sin(t * 3), 3, dt);
      rig.mEmber.color.setRGB(2.4 * st.ember + 0.4, 0.55 * st.ember + 0.1, 0.12);

      // выдох дыма
      if (st.exhale === 0) {
        st.exhale = 1;
        const m = tmpC.copy(rig.mouth.position).applyMatrix4(rig.head.matrixWorld);
        puff(m, rootDir(0.1, 0.25, 1, tmpD), 18);
        if (events.onExhale) events.onExhale();
      }
    }
    function blendPose(base, gp, w) {
      if (w <= 0.001) return;
      base.pos.lerp(gp.pos, w);
      base.f.lerp(gp.f, w).normalize();
      base.u.lerp(gp.u, w).normalize();
      base.curl = lerp(base.curl, gp.curl, w);
    }
    function startBlink() { if (st.blinkPhase < 0) { st.blinkPhase = 0; st.dbl = rnd() < 0.18; } }
    function blinkUpdate(dt, s) {
      st.blinkT -= dt;
      if (st.blinkT <= 0) { startBlink(); st.blinkT = lerp(4.2, 1.3, s) * R(0.6, 1.4); }
      if (st.blinkPhase >= 0) {
        st.blinkPhase += dt / 0.15;
        st.blink = Math.sin(Math.min(1, st.blinkPhase) * Math.PI);
        if (st.blinkPhase >= 1) { st.blink = 0; st.blinkPhase = -1; if (st.dbl) { st.dbl = false; st.blinkT = 0.09; } }
      }
    }

    function impact() {
      cam.shake = 0.5;
      swing.vx += R(-0.25, 0.25); swing.vz += R(0.12, 0.28);
      ashtray.position.y = TABLE.y + 0.012; glass.position.y = TABLE.y + 0.008;
      if (events.onImpact) events.onImpact();
    }

    // ---------- главный цикл ----------
    let running = true, last = performance.now(), T = 0, lastRender = -1e9, forceRender = true;
    let slowFrames = 0, recording = false, clockMin = 130, finale = null, knockT = -1;
    const see = { v: 0, t: 0 };
    function frame(now) {
      if (!running) return;
      requestAnimationFrame(frame);
      if (document.hidden) { last = now; return; }
      let dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (SHOT) {
        // съёмка на программном рендере: симуляция идёт мелкими шагами, кадр рисуем редко
        let left = Math.min(1.2, dt);
        while (left > 1e-4) { const h = Math.min(1 / 30, left); T += h; step(h, T); left -= h; }
        if (!forceRender && now - lastRender < 900) return;
        forceRender = false; lastRender = now;
        renderer.render(scene, camera);
        return;
      }
      T += dt;
      step(dt, T);
      renderer.render(scene, camera);
      // адаптивное разрешение (не в режиме съёмки)
      if (!SHOT) {
        if (dt > 0.045) slowFrames++; else slowFrames = Math.max(0, slowFrames - 1);
        if (slowFrames > 40 && dpr > 0.8) { dpr = Math.max(0.8, dpr - 0.25); slowFrames = 0; resize(); }
      }
    }

    function step(dt, t) {
      // лампа-маятник
      swing.vx += (-13 * swing.ax - 0.22 * swing.vx + Math.sin(t * 0.7) * 0.012) * dt;
      swing.vz += (-13 * swing.az - 0.22 * swing.vz + Math.cos(t * 0.53) * 0.01) * dt;
      swing.ax += swing.vx * dt; swing.az += swing.vz * dt;
      lampPivot.rotation.set(swing.ax, 0, swing.az);
      const flick = 1 + (Math.sin(t * 23.0) * Math.sin(t * 7.3)) * 0.015;
      spot.intensity = LAMP_I * flick;
      lampPivot.updateMatrixWorld(true);
      const lampPos = _v1.setFromMatrixPosition(bulb.matrixWorld);
      const lampDir = _v2.set(0, -1, 0).transformDirection(shade.matrixWorld);
      smokeMat.uniforms.uLamp.value.copy(lampPos); smokeMat.uniforms.uDir.value.copy(lampDir);
      dustMat.uniforms.uLamp.value.copy(lampPos); dustMat.uniforms.uDir.value.copy(lampDir);
      dustMat.uniforms.uTime.value = t; coneMat.uniforms.uTime.value = t;

      // предметы на столе оседают после удара
      ashtray.position.y = damp(ashtray.position.y, TABLE.y, 18, dt);
      glass.position.y = damp(glass.position.y, TABLE.y, 18, dt);

      updateSuspect(dt, t);
      updateSmoke(dt, t);

      // карточки въезжают на стол
      for (const c of cards) {
        if (c.t < 1) {
          c.t = Math.min(1, c.t + dt / 0.7);
          const e = easeIO(c.t);
          c.m.position.lerp(c.to, e * 0.35 + 0.02);
          if (c.t >= 1) c.m.position.copy(c.to);
          c.m.rotation.y = damp(c.m.rotation.y, c.rotTo, 8, dt);
        }
      }
      // магнитофон и часы
      if (recording) for (const r of reels) r.rotation.y -= dt * 2.2;
      recLamp.visible = recording && (Math.sin(t * 3) > -0.6);
      const mins = clockMin;
      minHand.rotation.z = -((mins % 60) / 60) * Math.PI * 2;
      hourHand.rotation.z = -(((mins / 60) % 12) / 12) * Math.PI * 2;

      // финал: свет за стеклом
      see.v = damp(see.v, see.t, 0.9, dt);
      mirror.material.uniforms.uSee.value = see.v;
      if (see.v > 0.01 && !obs.visible) { obs.visible = true; mirror.material.transparent = true; mirror.material.needsUpdate = true; }
      obsLight.intensity = see.v * 3.5;
      if (finale === 'release') { door.rotation.y = damp(door.rotation.y, -1.25, 0.8, dt); corridor.intensity = damp(corridor.intensity, 6, 1, dt); }
      else if (knockT >= 0) {
        knockT += dt;
        const o = env(clamp(knockT / 3.4, 0, 1), 0.22, 0.72);
        door.rotation.y = -0.5 * o; corridor.intensity = 4 * o;
        if (knockT > 3.4) { knockT = -1; door.rotation.y = 0; corridor.intensity = 0; }
      }

      updateCamera(dt, t);
    }

    function updateSmoke(dt, t) {
      // струйка от сигареты
      if (rig && rig.cig.visible) {
        emitAcc += dt;
        if (emitAcc > 0.09) {
          emitAcc = 0;
          const e = tmpA.setFromMatrixPosition(rig.ember.matrixWorld);
          spawn(e, new V3(R(-0.004, 0.004), R(0.04, 0.07), R(-0.004, 0.004)), R(3.6, 5.2), 0.012, R(0.14, 0.24), R(0.1, 0.16));
        }
      }
      let k = 0;
      for (const q of parts) {
        if (!q.on) { sDat[k * 4 + 1] = 0; sDat[k * 4] = 0; k++; continue; }
        q.age += dt;
        if (q.age > q.life) { q.on = false; sDat[k * 4 + 1] = 0; k++; continue; }
        const u = q.age / q.life;
        if (q.haze) {
          q.p.x += Math.sin(t * 0.05 + q.seed * 10) * 0.004 * dt * 10;
          q.p.y += Math.sin(t * 0.04 + q.seed * 20) * 0.002 * dt * 10;
          q.rot += q.rv * 0.05 * dt;
        } else {
          const sy = q.p.y * 5 + t * 0.6 + q.seed * 9;
          q.v.x += (Math.sin(sy) * 0.05 + Math.sin(sy * 2.3 + 1) * 0.03) * dt;
          q.v.z += (Math.cos(sy * 1.3) * 0.05) * dt;
          q.v.y += 0.012 * dt;
          q.v.multiplyScalar(1 - 0.35 * dt);
          q.p.addScaledVector(q.v, dt);
          if (q.p.y > ROOM.h - 0.1) { q.p.y = ROOM.h - 0.1; q.v.y = 0; }
          q.rot += q.rv * dt;
        }
        const size = q.haze ? q.s1 : lerp(q.s0, q.s1, Math.sqrt(u));
        const a = q.haze ? q.a : q.a * smooth(0, 0.08, u) * (1 - smooth(0.45, 1, u));
        sPos[k * 3] = q.p.x; sPos[k * 3 + 1] = q.p.y; sPos[k * 3 + 2] = q.p.z;
        sDat[k * 4] = size; sDat[k * 4 + 1] = a; sDat[k * 4 + 2] = q.seed; sDat[k * 4 + 3] = q.rot;
        k++;
      }
      aPos.needsUpdate = true; aDat.needsUpdate = true;
    }

    function updateCamera(dt, t) {
      const target = preset(cam.mode, t);
      let pos = target.pos, look = target.look, fov = target.fov;
      if (cam.mode === 'seat') {
        // напряжение подтягивает камеру ближе
        const s = st.stress;
        pos = pos.clone().add(new V3(0.02 * s, -0.04 * s, -0.16 * s));
        fov -= 2.5 * s;
        cam.lookDown = damp(cam.lookDown, st.cardFocus > 1.2 ? 1 : 0, 2.2, dt);
        look = look.clone().lerp(new V3(0, 0.8, -0.3), cam.lookDown * 0.45);
      }
      if (cam.t < 1 && cam.from) {
        cam.t = Math.min(1, cam.t + dt / cam.dur);
        const e = easeIO(cam.t);
        pos = cam.from.pos.clone().lerp(pos, e);
        look = cam.from.look.clone().lerp(look, e);
        fov = lerp(cam.from.fov, fov, e);
      }
      mouse.x = damp(mouse.x, mouse.tx, 2, dt); mouse.y = damp(mouse.y, mouse.ty, 2, dt);
      const sway = new V3(Math.sin(t * 0.33) * 0.008 + mouse.x * 0.05, Math.sin(t * 0.47) * 0.006 - mouse.y * 0.03, 0);
      cam.shake = damp(cam.shake, 0, 5, dt);
      const sh = cam.shake * 0.02;
      camera.position.copy(pos).add(sway).add(new V3(Math.sin(t * 90) * sh, Math.cos(t * 77) * sh, 0));
      curLook.copy(look);
      camera.lookAt(look);
      const ds = Math.abs(shift.v - shift.t) > 1e-3 || Math.abs(shift.y - shift.ty) > 1e-3;
      if (ds) { shift.v = damp(shift.v, shift.t, 2.2, dt); shift.y = damp(shift.y, shift.ty, 2.2, dt); }
      if (Math.abs(camera.fov - fov) > 0.01 || ds) { camera.fov = fov; applyOffset(); }
    }

    // ---------- API ----------
    mark('fx');
    resize();
    mark('resize');
    buildSuspect(opts.look);
    mark('suspect');
    camera.position.copy(preset('establish', 0).pos); curLook.copy(preset('establish', 0).look); camera.lookAt(curLook);
    if (!opts.manual) requestAnimationFrame(frame);

    const api = {
      setLook(look) { buildSuspect(look); },
      setStress(v) { st.stressT = clamp(v, 0, 1); },
      setStressNow(v) { st.stressT = st.stress = clamp(v, 0, 1); st.sweat = smooth(0.5, 0.88, st.stress); },
      setMood(m) { if (MOOD[m]) st.mood = m; },
      gesture(name) { if (name && name !== 'none') startGesture(name); },
      holdGesture(name, p) { startGesture(name); st.hold = p; },
      releaseHold() { st.hold = -1; },
      speaking(on) { st.speaking = on; if (on) st.gazeTimer = 0; },
      speakChar(ch) {
        const c = ch.toLowerCase();
        if ('аеёиоуыэюяaeiou'.includes(c)) { st.mouthT = R(0.5, 1); if (rnd() < 0.12) st.nodV += R(-0.35, 0.35); }
        else if ('мбп'.includes(c)) st.mouthT = 0;
        else if (/[a-zа-я]/.test(c)) st.mouthT = Math.max(st.mouthT, 0.22);
        else st.mouthT = 0;
      },
      think(on) { st.thinking = on; st.gazeTimer = 0; },
      present(card, instant) { present(card, instant); },
      clearCards,
      setCamera,
      setRecording(on) { recording = on; },
      setClock(min) { clockMin = min; },
      impact,
      finale(kind) {
        finale = kind; see.t = 1; setCamera('wide');
        if (kind === 'release') { st.mood = 'relieved'; startGesture('lean_back'); }
        else { st.mood = 'broken'; }
      },
      resetFinale() { if (!finale && see.t === 0) return; finale = null; see.t = 0; see.v = 0; obs.visible = false; mirror.material.uniforms.uSee.value = 0; mirror.material.transparent = false; mirror.material.needsUpdate = true; door.rotation.y = 0; corridor.intensity = 0; },
      knock() { if (!finale) knockT = 0; },
      holdGaze(kind) { st.gazeHold = kind || null; },
      setShift(v, y, instant) { shift.t = v; if (y != null) shift.ty = y; if (instant) { shift.v = shift.t; shift.y = shift.ty; applyOffset(); } },
      refreshText() {
        for (const t of [signMap, clockMap, folderMap]) t.userData.redraw();
        for (const c of cards) if (c.m.material.map && c.m.material.map.userData.redraw) c.m.material.map.userData.redraw();
        forceRender = true;
      },
      events,
      get stress() { return st.stress; },
      pause(v) { if (v) running = false; else if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); } },
      // отладочный ракурс (крупный план лица для проверки мимики)
      renderNow() { forceRender = true; },
      start() { last = performance.now(); requestAnimationFrame(frame); },
      step(dt) { T += dt; step(dt, T); },
      renderer, scene, camera,
      timing() { return TM.slice(1).map(([k, t], i) => k + ' ' + Math.round(t - TM[i][1])).join(', '); },
      debugCam(pos, look, fov) { debugView = { pos: new V3(...pos), look: new V3(...look), fov }; cam.mode = 'debug'; cam.t = 1; },
    };
    return api;
  }

  window.Scene3D = { create };
})();
