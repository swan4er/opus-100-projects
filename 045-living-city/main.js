/* ================================================================
   Тихоречинск — запуск и главный цикл.
   Город и жители генерируются, пока с CDN грузится three.js;
   затем сцена, камера (обзор, облёт, слежение за жителем) и цикл кадра.
   ================================================================ */
(function (LC) {
  'use strict';
  const SHOT = !!window.__SHOT__;
  LC.SHOT = SHOT;
  LC.isMobile = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || window.innerWidth < 720;

  // ---------------- подготовка мира (без three.js) ----------------
  let readyResolve;
  LC.ready = new Promise((r) => (readyResolve = r));
  LC.prepare = function () {
    const t0 = performance.now();
    LC.city = LC.generateCity(LC.CFG.seed);
    LC.pop = LC.generatePeople(LC.city, LC.CFG.seed);
    LC.traffic.init(LC.city, LC.pop);
    const start = LC.CFG.startDay * 1440 + (SHOT ? LC.CFG.shotMinute : LC.CFG.startMinute);
    const warm = SHOT ? 40 : LC.CFG.warmMinutes;
    LC.life.init(LC.city, LC.pop, start - warm);
    LC.traffic.placeParked();
    LC.life.startPending();
    LC.life.warm(warm, 0.5);
    LC.prepMs = Math.round(performance.now() - t0);
    readyResolve();
  };

  // ---------------- запуск сцены ----------------
  LC.T0 = { load: performance.now() };
  LC.boot = async function (THREE, addons) {
    LC.T0.three = Math.round(performance.now());
    await LC.ready;
    LC.T0.ready = Math.round(performance.now());
    const R = LC.createScene(THREE);
    LC.R = R;
    const A = LC.createActors(THREE, R);
    LC.actors = A;
    const { renderer, scene, camera, U } = R;

    // камера и управление
    const controls = new addons.MapControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.minDistance = 14; controls.maxDistance = 2300;
    controls.maxPolarAngle = Math.PI * 0.47;
    controls.zoomSpeed = 1.1;
    controls.screenSpacePanning = false;
    LC.controls = controls;
    // первый кадр: вдоль реки на центр, с горизонтом и небом
    const START_VIEW = LC.isMobile ? { target: [-30, 0, 40], dist: 1000, polar: 1.1, az: 0.32 } : { target: [-40, 0, 70], dist: 700, polar: 1.16, az: 0.38 };
    function setView(v) {
      controls.target.set(...v.target);
      const r = v.dist, ph = v.polar, th = v.az;
      camera.position.set(v.target[0] + r * Math.sin(ph) * Math.sin(th), r * Math.cos(ph), v.target[2] + r * Math.sin(ph) * Math.cos(th));
      camera.lookAt(controls.target);
      controls.update();
    }
    setView(START_VIEW);
    LC.setView = setView;

    // автооблёт, пока человек ничего не трогает
    let autoOrbit = !SHOT;
    let interacted = false;
    const stopAuto = () => { autoOrbit = false; interacted = true; };
    controls.addEventListener('start', () => { stopAuto(); flight = null; });

    // полёт камеры к точке
    let flight = null;
    const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();
    // виден ли человек из точки камеры: проверяем отрезок против коробок домов
    const parts = LC.city.parts;
    function blocked(tx, tz, ox, oy, oz, ty) {
      for (let k = 1; k <= 14; k++) {
        const t = k / 15;
        const x = tx + ox * t, y = (ty || 1.2) + oy * t, z = tz + oz * t;
        for (let i = 0; i < parts.length; i++) {
          const p = parts[i];
          if (y < p.y0 + p.h + 1 && Math.abs(x - p.x) < p.w / 2 + 1 && Math.abs(z - p.z) < p.d / 2 + 1) return true;
        }
      }
      return false;
    }
    function clearOffset(x, z, want, dir0, y) {
      // перебираем азимуты и высоты, начиная с текущего направления
      const base = Math.atan2(dir0.x, dir0.z);
      const els = y > 3 ? [0.35, 0.55, 0.75, 0.95] : [0.8, 0.95, 1.1, 1.25];
      for (const el of els) {
        for (let k = 0; k < 8; k++) {
          const a = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 4);
          const h = Math.sin(el) * want, r = Math.cos(el) * want;
          const o = new THREE.Vector3(Math.sin(a) * r, h, Math.cos(a) * r);
          if (!blocked(x, z, o.x, o.y, o.z, y)) return o;
        }
      }
      return new THREE.Vector3(0, want, 0.01);
    }
    LC.flyTo = function (x, z, dist, then, y) {
      stopAuto();
      const from = controls.target.clone();
      const offFrom = camera.position.clone().sub(controls.target);
      const want = dist || 70;
      const dir = offFrom.clone().setY(0);
      if (dir.lengthSq() < 1) dir.set(0.6, 0, 0.8);
      dir.normalize();
      const offTo = clearOffset(x, z, want, dir, y || 0);
      flight = { t: 0, dur: 1.9, from, to: new THREE.Vector3(x, y || 0, z), offFrom, offTo, then };
      if (LC.kick) LC.kick(5);
    };
    function updateFlight(dt) {
      if (!flight) return false;
      flight.t += dt / flight.dur;
      const k = Math.min(1, flight.t);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      // по дуге: сначала вверх, потом вниз
      const lift = Math.sin(k * Math.PI) * Math.min(400, flight.from.distanceTo(flight.to) * 0.35);
      controls.target.lerpVectors(flight.from, flight.to, e);
      tmpV.lerpVectors(flight.offFrom, flight.offTo, e);
      tmpV.y += lift;
      camera.position.copy(controls.target).add(tmpV);
      if (k >= 1) { const cb = flight.then; flight = null; if (cb) cb(); }
      return true;
    }
    // слежение за выбранным: цель плавно едет за человеком
    LC.follow = true;
    function updateFollow(dt) {
      if (A.selected < 0 || !LC.follow || flight) return;
      const f = A.getFocus();
      if (!f) return;
      tmpV2.set(f.x, (f.y || 0) + 1, f.z);
      const k = 1 - Math.exp(-dt * 3.5);
      tmpV.copy(controls.target);
      controls.target.lerp(tmpV2, k);
      camera.position.add(tmpV.subVectors(controls.target, tmpV));
    }

    // выбор жителя кликом
    let down = null;
    renderer.domElement.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    renderer.domElement.addEventListener('pointerup', (e) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const dt = performance.now() - down.t;
      down = null;
      if (moved > 7 || dt > 600) return;
      const hit = A.pick(e.clientX, e.clientY, LC.isMobile ? 30 : 20);
      if (hit) { stopAuto(); LC.select(hit.id, { fly: false }); }
    });
    // курсор над жителем
    let hoverT = 0;
    renderer.domElement.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const now = performance.now();
      if (now - hoverT < 90) return;
      hoverT = now;
      const hit = A.pick(e.clientX, e.clientY, 16);
      renderer.domElement.style.cursor = hit ? 'pointer' : '';
    });

    // выбор: снаружи (поиск, связи, газета) и изнутри (клик)
    LC.select = function (id, opt) {
      opt = opt || {};
      A.selected = id;
      LC.follow = true;
      if (id < 0) { LC.emit('select', -1); return; }
      const f = A.getFocus();
      const winView = A.focusKind === 'window';
      if (opt.fly !== false && f) LC.flyTo(f.x, f.z, winView ? 70 : opt.dist || 60, null, f.y);
      else if (f) {
        // ближе к человеку, не теряя направления
        const off = camera.position.clone().sub(controls.target);
        const want = Math.min(off.length(), winView ? 70 : opt.dist || 90);
        if (off.length() > want * 1.05 || winView) LC.flyTo(f.x, f.z, want, null, f.y);
      }
      LC.emit('select', id);
      if (LC.kick) LC.kick(4);
    };

    // ---------------- сдвиг кадра, чтобы человек был виден рядом с карточкой ----------------
    let insetX = 0, insetY = 0, insetTX = 0, insetTY = 0;
    LC.setInset = function (x, y) { insetTX = x; insetTY = y; };
    function applyInset(dt) {
      const k = 1 - Math.exp(-dt * 5);
      insetX += (insetTX - insetX) * k; insetY += (insetTY - insetY) * k;
      const w = window.innerWidth, h = window.innerHeight;
      if (Math.abs(insetX) < 0.5 && Math.abs(insetY) < 0.5) { if (camera.view && camera.view.enabled) camera.clearViewOffset(); return; }
      camera.setViewOffset(w, h, insetX / 2, insetY / 2, w, h);
    }
    LC.on('select', (id) => {
      if (id < 0) LC.setInset(0, 0);
      else if (window.innerWidth > 720) LC.setInset(432, 0);
      else LC.setInset(0, window.innerHeight * 0.58);
    });

    // ---------------- размер окна ----------------
    window.addEventListener('resize', () => R.resize());

    // ---------------- адаптивное разрешение (не в режиме съёмки) ----------------
    let slowFrames = 0, fastFrames = 0, dprNow = renderer.getPixelRatio();
    function adapt(dt) {
      if (SHOT) return;
      if (dt > 0.024) { slowFrames++; fastFrames = 0; } else if (dt < 0.0175) { fastFrames++; slowFrames = Math.max(0, slowFrames - 1); }
      if (slowFrames > 45 && dprNow > 1) { dprNow = Math.max(1, dprNow - 0.25); renderer.setPixelRatio(dprNow); R.resize(); slowFrames = 0; }
      if (fastFrames > 600 && dprNow < Math.min(2, window.devicePixelRatio || 1)) { dprNow = Math.min(2, dprNow + 0.25); renderer.setPixelRatio(dprNow); R.resize(); fastFrames = 0; }
    }

    // ---------------- цикл ----------------
    let last = performance.now(), winT = 1, uiT = 1, running = true, frames = 0;
    R.updateWindows();
    R.setTime(LC.clock.min, 0);
    // в режиме съёмки (программный рендер) кадр дорогой: рисуем редко, мир почти стоит
    let shotLast = -1e9, shotBudget = 3;
    LC.kick = (n) => { shotBudget = Math.max(shotBudget, n || 3); };
    LC.stats = { prepMs: LC.prepMs, frames: 0, frameMs: 0 };
    function frame(now) {
      if (!running) return;
      requestAnimationFrame(frame);
      if (SHOT) {
        if (shotBudget <= 0) return;
        if (frames > 0 && now - shotLast < 900) return;
        shotBudget--;
      }
      shotLast = now;
      const tf = performance.now();
      let dt = (now - last) / 1000; last = now;
      if (dt > (SHOT ? 2 : 0.1)) dt = SHOT ? 2 : 0.1;
      if (dt < 0) dt = 0;
      frames++;
      // симуляция
      if (!LC.clock.paused && (!SHOT || frames <= 1 || LC.shotLive)) {
        const dg = Math.min(dt, 0.1) * LC.CLOCK_RATE * LC.clock.speed;
        LC.life.step(Math.min(dg, 1.5));
      }
      winT += dt;
      if (winT > 0.35) { winT = 0; R.updateWindows(); }
      R.setTime(LC.clock.min, dt);
      U.uTime.value = now / 1000;
      // камера
      if (autoOrbit) {
        const off = camera.position.clone().sub(controls.target);
        off.applyAxisAngle(new THREE.Vector3(0, 1, 0), dt * 0.018);
        camera.position.copy(controls.target).add(off);
      }
      if (!updateFlight(dt)) updateFollow(dt);
      applyInset(SHOT ? 1 : dt);
      controls.update();
      U.uCam.value.copy(camera.position);
      A.update(now / 1000);
      renderer.render(scene, camera);
      LC.stats.frames = frames; LC.stats.frameMs = Math.round(performance.now() - tf);
      if (frames === 1) LC.T0.first = Math.round(performance.now());
      uiT += dt;
      if (uiT > 0.25) { uiT = 0; LC.emit('tick'); }
      adapt(dt);
    }
    requestAnimationFrame(frame);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) running = false;
      else if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); }
    });
    LC.started = true;
    LC.emit('started');
  };

  // three.js не загрузился — понятное сообщение
  LC.bootFailed = function (err) {
    const el = document.getElementById('fail');
    if (el) el.hidden = false;
    const v = document.getElementById('veil');
    if (v) v.classList.add('gone');
    void err;
  };

  // старт подготовки после первой отрисовки заставки
  window.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => { LC.prepare(); }, SHOT ? 0 : 30);
  });
})(window.LC);
