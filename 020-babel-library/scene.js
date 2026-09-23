/* Вавилонская библиотека — трёхмерные галереи на three.js (динамический import работает и из file://). */
(async function () {
  'use strict';
  const Lib = window.Lib;
  const canvas = document.getElementById('scene');
  let THREE;
  try {
    THREE = await import('https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js');
  } catch (e) {
    const d = document.createElement('div');
    d.className = 'offline';
    d.textContent = 'Трёхмерным галереям нужен интернет (библиотека three.js). Поиск и чтение книг работают и без него.';
    document.body.appendChild(d);
    return;
  }

  // ---------- Размеры шестигранника ----------
  const SIDE = 6.4, AP = SIDE * Math.cos(Math.PI / 6);   // сторона и апофема
  const HOLE = 2.3, HOLE_AP = HOLE * Math.cos(Math.PI / 6);
  const FH = 4.0, SLAB = 0.35;
  const FLOORS = 5;                                         // этажей вверх и вниз
  const NF = FLOORS * 2 + 1;
  const SHELVED = [0, 1, 3, 4];                             // стороны со стеллажами; 2 и 5 — проходы
  const SH = 5, VOL = 32, SHELF_Y0 = 0.32, SHELF_STEP = 0.64;
  const MARGIN = 0.55;
  const shot = !!window.__SHOT__;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !shot, powerPreference: 'high-performance' });
  renderer.setPixelRatio(shot ? 1 : Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d0906);
  scene.fog = new THREE.FogExp2(0x160e07, 0.052);
  const camera = new THREE.PerspectiveCamera(64, 1, 0.05, 120);

  // ---------- Материалы ----------
  const wood = new THREE.MeshStandardMaterial({ color: 0x3b2616, roughness: 0.78, metalness: 0.02 });
  const woodDark = new THREE.MeshStandardMaterial({ color: 0x1d130b, roughness: 0.9 });
  const stone = new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.92 });
  const brass = new THREE.MeshStandardMaterial({ color: 0x8a6232, roughness: 0.42, metalness: 0.55 });
  const bookMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.66, metalness: 0.0 });
  const voidMat = new THREE.MeshBasicMaterial({ color: 0x050302 });

  const sideFrame = (k) => {
    const th = k * Math.PI / 3 + Math.PI / 6;                  // направление нормали стороны
    return { n: new THREE.Vector3(Math.cos(th), 0, Math.sin(th)), t: new THREE.Vector3(-Math.sin(th), 0, Math.cos(th)), rotY: -(th + Math.PI / 2) };
  };

  // ---------- Перекрытия: шестигранное кольцо вокруг шахты ----------
  const hexShape = (R) => { const s = new THREE.Shape(); for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; const x = R * Math.cos(a), y = R * Math.sin(a); k ? s.lineTo(x, y) : s.moveTo(x, y); } s.closePath(); return s; };
  const ring = hexShape(SIDE + 0.25);
  const hole = new THREE.Path(); for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; const x = HOLE * Math.cos(a), y = HOLE * Math.sin(a); k ? hole.lineTo(x, y) : hole.moveTo(x, y); } hole.closePath();
  ring.holes.push(hole);
  const slabGeo = new THREE.ExtrudeGeometry(ring, { depth: SLAB, bevelEnabled: false });
  slabGeo.rotateX(Math.PI / 2);
  const slabs = new THREE.InstancedMesh(slabGeo, stone, NF + 1);
  const m4 = new THREE.Matrix4();
  for (let f = 0; f <= NF; f++) { m4.makeTranslation(0, (f - FLOORS) * FH, 0); slabs.setMatrixAt(f, m4); }
  scene.add(slabs);

  // ---------- Стены, стеллажи, проходы ----------
  const box = new THREE.BoxGeometry(1, 1, 1);
  const wallCount = NF * 10, boardCount = NF * SHELVED.length * (SH + 1), postCount = NF * SHELVED.length * 2;
  const walls = new THREE.InstancedMesh(box, woodDark, wallCount);
  const boards = new THREE.InstancedMesh(box, wood, boardCount + postCount);
  const doorFrames = new THREE.InstancedMesh(box, wood, NF * 2 * 3);
  const voids = new THREE.InstancedMesh(box, voidMat, NF * 2);
  const q = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3(), e3 = new THREE.Euler();
  const place = (mesh, i, pos, rotY, sx, sy, sz, rz) => { e3.set(0, rotY, rz || 0); q.setFromEuler(e3); s3.set(sx, sy, sz); m4.compose(pos, q, s3); mesh.setMatrixAt(i, m4); };
  let wi = 0, bi = 0, di = 0, vi = 0;
  for (let f = 0; f < NF; f++) {
    const y0 = (f - FLOORS) * FH;
    for (let k = 0; k < 6; k++) {
      const fr = sideFrame(k);
      const shelved = SHELVED.includes(k);
      if (shelved) {
        place(walls, wi++, p3.copy(fr.n).multiplyScalar(AP + 0.1).setY(y0 + FH / 2), fr.rotY, SIDE, FH, 0.2);
        for (let sI = 0; sI <= SH; sI++) {
          const y = y0 + SHELF_Y0 + sI * SHELF_STEP;
          place(boards, bi++, p3.copy(fr.n).multiplyScalar(AP - 0.2).setY(y - 0.02), fr.rotY, SIDE - MARGIN * 2 + 0.16, 0.05, 0.44);
        }
        for (const sd of [-1, 1]) {
          const pos = p3.copy(fr.n).multiplyScalar(AP - 0.2).addScaledVector(fr.t, sd * (SIDE / 2 - MARGIN + 0.06)).setY(y0 + SHELF_Y0 + SH * SHELF_STEP / 2);
          place(boards, bi++, pos, fr.rotY, 0.1, SH * SHELF_STEP + 0.1, 0.46);
        }
      } else {
        // Проход в соседнюю галерею: две стенки, перемычка и темнота за ними
        const dw = 1.5, dh = 2.6;
        const segW = (SIDE - dw) / 2;
        for (const sd of [-1, 1]) {
          const pos = p3.copy(fr.n).multiplyScalar(AP + 0.1).addScaledVector(fr.t, sd * (dw / 2 + segW / 2)).setY(y0 + FH / 2);
          place(walls, wi++, pos, fr.rotY, segW, FH, 0.2);
        }
        place(walls, wi++, p3.copy(fr.n).multiplyScalar(AP + 0.1).setY(y0 + dh + (FH - dh) / 2), fr.rotY, dw, FH - dh, 0.2);
        wi += 0; // счётчик стен
        for (const sd of [-1, 1]) place(doorFrames, di++, p3.copy(fr.n).multiplyScalar(AP - 0.02).addScaledVector(fr.t, sd * (dw / 2 + 0.06)).setY(y0 + dh / 2), fr.rotY, 0.12, dh, 0.3);
        place(doorFrames, di++, p3.copy(fr.n).multiplyScalar(AP - 0.02).setY(y0 + dh + 0.06), fr.rotY, dw + 0.24, 0.12, 0.3);
        place(voids, vi++, p3.copy(fr.n).multiplyScalar(AP + 1.6).setY(y0 + dh / 2), fr.rotY, dw, dh, 3);
      }
    }
  }
  walls.count = wi; boards.count = bi; doorFrames.count = di; voids.count = vi;
  scene.add(walls, boards, doorFrames, voids);

  // ---------- Перила вокруг шахты ----------
  const postsPerSide = 6;
  const rails = new THREE.InstancedMesh(box, brass, NF * 6 * (postsPerSide + 2));
  let ri = 0;
  for (let f = 0; f < NF; f++) {
    const y0 = (f - FLOORS) * FH;
    for (let k = 0; k < 6; k++) {
      const fr = sideFrame(k);
      const c = p3.copy(fr.n).multiplyScalar(HOLE_AP + 0.08);
      for (let j = 0; j < postsPerSide; j++) {
        const t = (j / (postsPerSide - 1) - 0.5) * (HOLE - 0.1);
        place(rails, ri++, c.clone().addScaledVector(fr.t, t).setY(y0 + 0.47), fr.rotY, 0.04, 0.94, 0.04);
      }
      place(rails, ri++, c.clone().setY(y0 + 0.95), fr.rotY, HOLE + 0.1, 0.06, 0.08);
      place(rails, ri++, c.clone().setY(y0 + 0.5), fr.rotY, HOLE + 0.1, 0.025, 0.03);
    }
  }
  rails.count = ri;
  scene.add(rails);

  // ---------- Книги ----------
  const booksPerFloor = SHELVED.length * SH * VOL;
  const books = new THREE.InstancedMesh(box, bookMat, NF * booksPerFloor);
  const bookInfo = [];
  const hash = (a, b, c, d) => { let h = (a * 374761393 + b * 668265263 + c * 2147483647 + d * 1274126177) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const slot = (SIDE - MARGIN * 2) / VOL;
  for (let f = 0; f < NF; f++) {
    const y0 = (f - FLOORS) * FH;
    SHELVED.forEach((k, w) => {
      const fr = sideFrame(k);
      for (let sI = 0; sI < SH; sI++) for (let v = 0; v < VOL; v++) {
        const r1 = hash(f * 7 + 3, w, sI, v), r2 = hash(v, f, w * 9 + 1, sI), r3 = hash(sI + 11, v * 3, f, w);
        const h = 0.44 + r1 * 0.13, th = slot * (0.74 + r2 * 0.2), dp = 0.28 + r3 * 0.05;
        const t = -SIDE / 2 + MARGIN + slot * (v + 0.5);
        const lean = r3 > 0.93 ? (r1 - 0.5) * 0.14 : 0;
        const pos = p3.copy(fr.n).multiplyScalar(AP - 0.25).addScaledVector(fr.t, t).setY(y0 + SHELF_Y0 + sI * SHELF_STEP + 0.01 + h / 2);
        const id = ((f * SHELVED.length + w) * SH + sI) * VOL + v;
        place(books, id, pos, fr.rotY, th, h, dp, lean);
        bookInfo[id] = { f, wall: w, shelf: sI, vol: v };
      }
    });
  }
  scene.add(books);

  const LEATHER = [[0.02, 0.55, 0.22], [0.03, 0.5, 0.28], [0.06, 0.42, 0.2], [0.08, 0.35, 0.3], [0.1, 0.45, 0.24], [0.33, 0.25, 0.18], [0.58, 0.3, 0.2], [0.95, 0.4, 0.22], [0.12, 0.2, 0.36], [0.07, 0.15, 0.12]];
  const col = new THREE.Color();
  let hexLow = 0;
  function colorBooks() {
    hexLow = Number(Lib.hex & 0xffffffn);
    for (let id = 0; id < bookInfo.length; id++) {
      const b = bookInfo[id];
      const floorHex = hexLow + (b.f - FLOORS);
      const r = hash(floorHex, b.wall * 13 + b.shelf, b.vol, 17);
      const base = LEATHER[Math.floor(r * LEATHER.length)];
      const r2 = hash(b.vol, floorHex, b.shelf, b.wall);
      col.setHSL(base[0] + (r2 - 0.5) * 0.03, base[1], base[2] * (0.75 + r2 * 0.55));
      books.setColorAt(id, col);
    }
    books.instanceColor.needsUpdate = true;
  }

  // ---------- Лампы: по два светящихся «плода» в каждом шестиграннике ----------
  const glowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,226,170,1)'); gr.addColorStop(0.18, 'rgba(255,196,120,0.55)'); gr.addColorStop(0.5, 'rgba(255,160,80,0.12)'); gr.addColorStop(1, 'rgba(255,160,80,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const lampGeo = new THREE.SphereGeometry(0.17, 20, 14);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe2b0 });
  const lampPos = [];
  for (let f = 0; f < NF; f++) {
    const y = (f - FLOORS) * FH + FH - 0.95;
    for (const a of [Math.PI / 2, -Math.PI / 2]) {
      const x = Math.cos(a) * (HOLE + 0.55), z = Math.sin(a) * (HOLE + 0.55);
      const m = new THREE.Mesh(lampGeo, lampMat); m.position.set(x, y, z); scene.add(m);
      const rod = new THREE.Mesh(box, brass); rod.scale.set(0.015, 0.95 - SLAB, 0.015); rod.position.set(x, y + (0.95 - SLAB) / 2 + 0.1, z); scene.add(rod);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9 }));
      sp.scale.set(1.6, 1.6, 1); sp.position.set(x, y, z); scene.add(sp);
      lampPos.push(new THREE.Vector3(x, y, z));
    }
  }
  scene.add(new THREE.HemisphereLight(0xffdfb0, 0x140b05, 0.5));
  scene.add(new THREE.AmbientLight(0x3a2614, 0.6));
  const lights = [];
  for (let i = 0; i < 4; i++) { const L = new THREE.PointLight(0xffc27d, 26, 17, 1.7); scene.add(L); lights.push(L); }

  // ---------- Пыль в луче ламп ----------
  const DUST = shot ? 250 : 700;
  const dustGeo = new THREE.BufferGeometry();
  const dPos = new Float32Array(DUST * 3), dVel = new Float32Array(DUST);
  for (let i = 0; i < DUST; i++) { const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * 3.4; dPos[i * 3] = Math.cos(a) * r; dPos[i * 3 + 1] = (Math.random() - 0.5) * 12; dPos[i * 3 + 2] = Math.sin(a) * r; dVel[i] = 0.03 + Math.random() * 0.06; }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xffd9a0, size: 0.028, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(dust);

  // ---------- Камера: неспешный обход галереи вокруг шахты ----------
  const cam = { phi: 0.35, yaw: 0, pitch: 0, yOff: 0, auto: true, target: null, focusT: 0 };
  let floorAnim = null;
  function placeCamera(dt) {
    if (cam.auto) cam.phi += dt * 0.035;
    if (cam.target !== null) {
      let d = cam.target - cam.phi; d = Math.atan2(Math.sin(d), Math.cos(d));
      cam.phi += d * Math.min(1, dt * 2.2);
      if (Math.abs(d) < 0.002) cam.target = null;
    }
    const R = 4.0;
    const y = 1.62 + cam.yOff;
    camera.position.set(Math.cos(cam.phi) * R, y, Math.sin(cam.phi) * R);
    const look = new THREE.Vector3(-Math.cos(cam.phi + cam.yaw) * 2.6, y - 1.05 + cam.pitch * 3, -Math.sin(cam.phi + cam.yaw) * 2.6);
    camera.lookAt(look);
    // Свет — у ламп ближайших этажей
    const base = Math.round(cam.yOff / FH);
    const near = [];
    for (const p of lampPos) { const dy = p.y - (y + 0.8); near.push([Math.abs(dy) + Math.hypot(p.x - camera.position.x, p.z - camera.position.z) * 0.2, p]); }
    near.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < lights.length; i++) lights[i].position.copy(near[i][1]);
    void base;
  }

  // ---------- Наведение и выбор книги ----------
  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
  const tip = document.getElementById('tip');
  let hoverId = -1, focusId = -1;
  const saved = new THREE.Color();
  function setHighlight(id, on, gold) {
    if (id < 0) return;
    if (on) { books.getColorAt(id, saved); books.userData['c' + id] = saved.clone(); col.copy(saved).lerp(gold ? new THREE.Color(0xffc45e) : new THREE.Color(0xfff0d0), gold ? 0.75 : 0.35); books.setColorAt(id, col); }
    else if (books.userData['c' + id]) { books.setColorAt(id, books.userData['c' + id]); delete books.userData['c' + id]; }
    books.instanceColor.needsUpdate = true;
  }
  function pick(ev) {
    const r = canvas.getBoundingClientRect();
    mouse.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(mouse, camera);
    const hit = ray.intersectObject(books, false)[0];
    if (!hit || hit.distance > 11) return null;
    const info = bookInfo[hit.instanceId];
    return { id: hit.instanceId, info };
  }
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, yaw: cam.yaw, pitch: cam.pitch, moved: false }; });
  canvas.addEventListener('pointermove', (e) => {
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.hypot(dx, dy) > 4) drag.moved = true;
      if (drag.moved) { cam.auto = false; cam.yaw = drag.yaw - dx * 0.004; cam.pitch = Math.max(-0.45, Math.min(0.5, drag.pitch - dy * 0.003)); canvas.classList.add('drag'); tip.hidden = true; return; }
    }
    const p = pick(e);
    const id = p && p.info.f === FLOORS ? p.id : -1;
    if (id !== hoverId) { if (hoverId !== focusId) setHighlight(hoverId, false); hoverId = id; if (id >= 0 && id !== focusId) setHighlight(id, true); }
    canvas.classList.toggle('point', id >= 0);
    if (id >= 0) {
      const b = p.info;
      tip.textContent = `Стена ${b.wall + 1} · полка ${b.shelf + 1} · том ${b.vol + 1}`;
      tip.hidden = false; tip.style.left = `${e.clientX + 14}px`; tip.style.top = `${e.clientY - 34}px`;
    } else tip.hidden = true;
  });
  canvas.addEventListener('pointerup', (e) => {
    const wasClick = drag && !drag.moved;
    drag = null; canvas.classList.remove('drag');
    if (!wasClick) return;
    const p = pick(e);
    if (p && p.info.f === FLOORS) Lib.openBook({ wall: p.info.wall, shelf: p.info.shelf, vol: p.info.vol }, 0, null);
  });
  canvas.addEventListener('pointerleave', () => { tip.hidden = true; if (hoverId !== focusId) setHighlight(hoverId, false); hoverId = -1; });

  // ---------- API для интерфейса ----------
  Lib.scene = {
    focusBook(addr) {
      const k = SHELVED[addr.wall];
      const th = k * Math.PI / 3 + Math.PI / 6;
      cam.auto = false; cam.yaw = 0; cam.pitch = (addr.shelf - 2) * 0.05;
      cam.target = th + Math.PI;
      if (focusId >= 0) setHighlight(focusId, false);
      focusId = ((FLOORS * SHELVED.length + addr.wall) * SH + addr.shelf) * VOL + addr.vol;
      setHighlight(focusId, true, true);
    },
    clearFocus() { if (focusId >= 0) setHighlight(focusId, false); focusId = -1; },
    moveFloor(dir) {
      if (floorAnim) return;
      floorAnim = { t: 0, dir };
    },
  };
  Lib.onHexChange.push(() => { const f = focusId; if (f >= 0) setHighlight(f, false); colorBooks(); if (f >= 0) setHighlight(f, true, true); });
  colorBooks();

  // ---------- Цикл ----------
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.fov = w < 700 ? 74 : 64; camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!document.hidden) {
      if (floorAnim) {
        floorAnim.t = Math.min(1, floorAnim.t + dt / 1.6);
        const e = floorAnim.t < 0.5 ? 4 * floorAnim.t ** 3 : 1 - Math.pow(-2 * floorAnim.t + 2, 3) / 2;
        cam.yOff = floorAnim.dir * FH * e;
        if (floorAnim.t >= 1) { const d = floorAnim.dir; floorAnim = null; cam.yOff = 0; Lib.setHex(d > 0 ? Lib.hex + 1n : (Lib.hex > 0n ? Lib.hex - 1n : 0n)); }
      }
      placeCamera(dt);
      for (let i = 0; i < DUST; i++) { dPos[i * 3 + 1] += dVel[i] * dt; if (dPos[i * 3 + 1] > camera.position.y + 6) dPos[i * 3 + 1] -= 12; if (dPos[i * 3 + 1] < camera.position.y - 6) dPos[i * 3 + 1] += 12; }
      dustGeo.attributes.position.needsUpdate = true;
      if (focusId >= 0) { const pulse = 0.5 + 0.5 * Math.sin(now / 260); books.getColorAt(focusId, col); col.lerp(new THREE.Color(0xffd27a), 0.04 * pulse); books.setColorAt(focusId, col); books.instanceColor.needsUpdate = true; }
      renderer.render(scene, camera);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
