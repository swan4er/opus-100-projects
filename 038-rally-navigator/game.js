/* ================================================================
   Штурман · игра
   Главный цикл, состояния (заставка → отсчёт → заезд → финиш), камера,
   управление с клавиатуры и пальцами, чтение стенограммы по геометрии,
   интерфейс. Штурман (нейросеть) живёт в navigator.js, звук — в audio.js.
   ================================================================ */
(function (R) {
  'use strict';
  const { clamp, lerp } = R.util;
  const $ = (id) => document.getElementById(id);
  const SHOT = !!window.__SHOT__;
  const SIM_DT = 1 / 120;
  const fmtTime = (t) => {
    t = Math.max(0, t);
    const m = Math.floor(t / 60), s = t - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1).replace('.', ',');
  };
  const fmtDelta = (d) => (Math.abs(d) < 0.05 ? '±' : d > 0 ? '+' : '−') + Math.abs(d).toFixed(1).replace('.', ',');
  R.fmtTime = fmtTime; R.fmtDelta = fmtDelta;

  // ---------- значки стенограммы: стрелка поворота, шпилька, трамплин, гребень, финиш ----------
  const ANG = { 0: 190, 1: 150, 2: 124, 3: 100, 4: 78, 5: 56, 6: 36 };
  const RAD = { 0: 7, 1: 8, 2: 10, 3: 12, 4: 15, 5: 20, 6: 28 };
  function glyph(n) {
    const ink = '#1b2233';
    if (n.kind === 'jump') return `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M4 40 L20 40 Q27 40 30 31" fill="none" stroke="${ink}" stroke-width="4.5" stroke-linecap="round"/><path d="M33 26 Q38 16 44 14" fill="none" stroke="#d9442a" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="1 6"/><path d="M36 40 L44 40" stroke="${ink}" stroke-width="4.5" stroke-linecap="round"/></svg>`;
    if (n.kind === 'crest') return `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M4 38 Q24 12 44 38" fill="none" stroke="${ink}" stroke-width="4.5" stroke-linecap="round"/><path d="M20 14 L24 9 L28 14" fill="none" stroke="#d9442a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    if (n.kind === 'finish') {
      let sq = '';
      for (let y = 0; y < 3; y++) for (let x = 0; x < 4; x++) if ((x + y) % 2 === 0) sq += `<rect x="${14 + x * 7}" y="${8 + y * 7}" width="7" height="7" fill="${ink}"/>`;
      return `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M12 44 V8" stroke="${ink}" stroke-width="4" stroke-linecap="round"/><rect x="14" y="8" width="28" height="21" fill="none" stroke="${ink}" stroke-width="2"/>${sq}</svg>`;
    }
    // поворот: полилиния «вверх, затем дуга», зеркалим для правого
    const A = ANG[n.sev] * Math.PI / 180, r = RAD[n.sev];
    const pts = [[0, 0], [0, -12]];
    let x = 0, y = -12, h = -Math.PI / 2;
    const steps = 16, ds = (A * r) / steps;
    for (let i = 0; i < steps; i++) { h -= A / steps; x += Math.cos(h) * ds; y += Math.sin(h) * ds; pts.push([x, y]); }
    const hx = Math.cos(h), hy = Math.sin(h);
    const ah = [[x - hx * 7 + hy * 6, y - hy * 7 - hx * 6], [x, y], [x - hx * 7 - hy * 6, y - hy * 7 + hx * 6]];
    const all = pts.concat(ah);
    const sgn = n.dir > 0 ? 1 : -1;
    let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    for (const p of all) { p[0] *= sgn; minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); miny = Math.min(miny, p[1]); maxy = Math.max(maxy, p[1]); }
    const w = Math.max(maxx - minx, maxy - miny) + 10;
    const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2;
    const vb = `${(cx - w / 2).toFixed(1)} ${(cy - w / 2).toFixed(1)} ${w.toFixed(1)} ${w.toFixed(1)}`;
    const d = 'M' + pts.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L');
    const a = 'M' + ah.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L');
    const color = n.sev <= 2 ? '#d9442a' : ink;
    return `<svg viewBox="${vb}" aria-hidden="true"><path d="${d}" fill="none" stroke="${color}" stroke-width="${(w / 48 * 4.6).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"/><path d="${a}" fill="none" stroke="${color}" stroke-width="${(w / 48 * 4.6).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  function noteShort(n) {
    if (n.kind !== 'corner') return { t: n.words.short, m: '' };
    const t = (n.dir > 0 ? 'Л' : 'П') + (n.sev === 0 ? ' шп' : n.sev);
    const m = n.mods.map((x) => x === 'длинный' ? 'длин.' : x).join(' ');
    return { t, m: (n.caution ? '! ' : '') + m };
  }

  // ================================================================
  R.boot = function () {
    const THREE = window.THREE;
    const t0 = performance.now();
    const T = R.buildTrack();
    R.T = T;
    const prof = { track: Math.round(performance.now() - t0) };

    // --- рендер ---
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    const mobile = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 560;
    let dprCap = SHOT ? 1 : Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2);
    renderer.setPixelRatio(dprCap);
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    $('view').appendChild(renderer.domElement);
    let tp = performance.now();
    const W = R.buildWorld(T, renderer, mobile && !SHOT ? 'low' : 'high');
    prof.world = Math.round(performance.now() - tp); tp = performance.now();
    const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.3, 2600);
    W.scene.add(camera);

    // эталон: автопилот проходит участок — это «график»
    const ref = R.referenceRun(T, 1.0);
    const sched = { times: ref.times.map((x) => x * 1.04), total: ref.total * 1.04 };
    prof.ref = Math.round(performance.now() - tp);
    R.sched = sched;

    // --- состояние игры ---
    const car = new R.Car(T);
    const tel = new R.Telemetry(T, sched);
    const G = R.G = {
      state: 'attract', t: 0, car, tel, T, W, camera, renderer,
      auto: new R.Autopilot(T, { pace: 0.93, flick: 1 }),
      camMode: 0, frozen: false, frozenFrames: 0, finishT: 0, penalty: 0, paused: false,
      caller: { next: 0, chunk: null },
    };

    // --- ввод ---
    const keys = new Set();
    const inp = { steer: 0, throttle: 0, brake: 0, hand: 0 };
    const touch = { steer: 0, gas: 0, brake: 0, hand: 0, active: false };
    const KEYMAP = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS', 'Space'];
    addEventListener('keydown', (e) => {
      if (e.repeat && KEYMAP.includes(e.code)) { e.preventDefault(); return; }
      keys.add(e.code);
      if (KEYMAP.includes(e.code)) e.preventDefault();
      R.Audio && R.Audio.unlock();
      if (e.code === 'KeyR' && G.state === 'run') recover();
      if (e.code === 'KeyC') cycleCam();
      if (e.code === 'KeyM') toggleSound();
      if (e.code === 'KeyV') toggleVoice();
      if (e.code === 'Escape') { if (G.state === 'run' || G.state === 'countdown') openMenu(); }
      if (e.code === 'Enter' && G.state === 'attract' && !$('menu').classList.contains('is-hidden')) startRun();
    });
    addEventListener('keyup', (e) => keys.delete(e.code));
    addEventListener('blur', () => keys.clear());
    function readInput(dt) {
      const L = keys.has('ArrowLeft') || keys.has('KeyA'), Rt = keys.has('ArrowRight') || keys.has('KeyD');
      let target = (Rt ? 1 : 0) - (L ? 1 : 0);
      if (touch.active) target = touch.steer;
      const rate = target === 0 ? 7 : Math.sign(target) !== Math.sign(inp.steer) && inp.steer !== 0 ? 10 : 4.6;
      if (touch.active) inp.steer = lerp(inp.steer, target, Math.min(1, dt * 14));
      else inp.steer += clamp(target - inp.steer, -rate * dt, rate * dt);
      inp.throttle = (keys.has('ArrowUp') || keys.has('KeyW') || touch.gas) ? 1 : 0;
      inp.brake = (keys.has('ArrowDown') || keys.has('KeyS') || touch.brake) ? 1 : 0;
      inp.hand = (keys.has('Space') || touch.hand) ? 1 : 0;
      return inp;
    }
    // сенсорные кнопки
    const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    if (isTouch) $('touch').hidden = false;
    (function setupTouch() {
      const pad = $('padSteer'), knob = $('knob');
      let pid = null, cx = 0, half = 1;
      pad.addEventListener('pointerdown', (e) => {
        pid = e.pointerId; pad.setPointerCapture(pid);
        const r = pad.getBoundingClientRect(); cx = r.left + r.width / 2; half = r.width * 0.36;
        touch.active = true; move(e); R.Audio && R.Audio.unlock();
      });
      const move = (e) => {
        if (e.pointerId !== pid) return;
        touch.steer = clamp((e.clientX - cx) / half, -1, 1);
        knob.style.transform = `translateX(${(touch.steer * half * 0.9).toFixed(0)}px)`;
      };
      pad.addEventListener('pointermove', move);
      const end = (e) => { if (e.pointerId !== pid) return; pid = null; touch.steer = 0; touch.active = false; knob.style.transform = 'translateX(0)'; };
      pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
      for (const [id, key] of [['tGas', 'gas'], ['tBrake', 'brake'], ['tHand', 'hand']]) {
        const b = $(id);
        b.addEventListener('pointerdown', (e) => { b.setPointerCapture(e.pointerId); touch[key] = 1; b.classList.add('is-on'); R.Audio && R.Audio.unlock(); });
        const off = () => { touch[key] = 0; b.classList.remove('is-on'); };
        b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('lostpointercapture', off);
      }
    })();

    // --- кнопки ---
    function cycleCam() { G.camMode = (G.camMode + 1) % 3; toast(['Камера: сзади', 'Камера: капот', 'Камера: дальняя'][G.camMode]); }
    function toggleSound() { const on = R.Audio ? R.Audio.toggle() : false; $('btnSound').classList.toggle('is-off', !on); }
    function toggleVoice() { const on = R.Nav ? R.Nav.toggleVoice() : false; $('btnVoice').classList.toggle('is-off', !on); toast(on ? 'Голос штурмана включён' : 'Голос выключен — только текст'); }
    $('btnCam').onclick = cycleCam;
    $('btnSound').onclick = () => { R.Audio && R.Audio.unlock(); toggleSound(); };
    $('btnVoice').onclick = toggleVoice;
    $('btnMenu').onclick = () => openMenu();
    $('btnRecover').onclick = () => recover();
    $('btnStart').onclick = () => startRun();
    $('btnAgain').onclick = () => { $('result').hidden = true; startRun(); };
    $('btnCrew').onclick = () => { $('result').hidden = true; openMenu(); };
    $('btnSound').classList.add('is-off');

    let toastTimer = 0;
    function toast(text, ms) {
      const el = $('toast'); el.textContent = text; el.hidden = false;
      el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
      clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, ms || 1800);
    }
    R.toast = toast;

    // --- меню и заезд ---
    function openMenu() {
      if (G.state === 'run' || G.state === 'countdown' || G.state === 'finish') {
        R.Nav && R.Nav.stop();
        G.state = 'attract'; resetAttract();
      }
      $('menu').classList.remove('is-hidden');
      $('result').hidden = true;
      setHudRun(false);
    }
    function setHudRun(on) {
      document.body.classList.toggle('is-run', on);
      document.body.classList.remove('is-finish');
      $('notes').classList.toggle('is-off', !on && !SHOT);
    }
    function resetAttract() {
      const s0 = 60 + Math.random() * 1800;
      car.reset(s0, 0);
      const i = Math.round(s0);
      car.vx = Math.cos(T.PH[i]) * 20; car.vy = Math.sin(T.PH[i]) * 20;
      G.auto = new R.Autopilot(T, { pace: 0.93, flick: 1 });
    }
    async function startRun() {
      R.Audio && R.Audio.unlock();
      $('menu').classList.add('is-hidden');
      if (R.Nav) await R.Nav.prepare();
      if (!$('menu').classList.contains('is-hidden')) return;   // пока ждали ключ, игрок вернулся в меню
      car.reset(T.startS, 0);
      tel.reset();
      for (const n of T.notes) n._entered = false;
      G.t = 0; G.state = 'countdown'; G.cd = 3.2; G.caller = { next: 0, chunk: null }; G.finishT = 0;
      G.lastCd = null;
      setHudRun(true);
      renderNotes(true);
      R.Nav && R.Nav.startRun({ T, sched, tel });
      // первая порция стенограммы читается ещё на старте
      callNotes(true);
    }
    function recover() {
      if (G.state !== 'run') return;
      if (car.speed > 6) { toast('Сначала остановитесь'); return; }
      $('btnRecover').hidden = true; G.stuckT = 0;
      const s = Math.max(T.startS, car.s - 4);
      car.reset(s, 0);
      tel.stats.penalties += 5; tel.stats.resets++;
      tel.emit('reset', { penalty: 5 });
      toast('Вернули на дорогу · +5 с штрафа');
    }

    // --- стенограмма: движок читает вперёд по скорости ---
    function callNotes(force) {
      const notes = T.notes, cl = G.caller;
      while (cl.next < notes.length && notes[cl.next].s1 < car.s - 2) cl.next++;
      const n = notes[cl.next]; if (!n) return;
      const lead = Math.max(55, car.speed * 3.3 + 30);
      if (force || n.s0 - car.s <= lead) {
        const ch = R.chunkFrom(T, cl.next);
        cl.next = ch.next; cl.chunk = ch;
        R.Nav && R.Nav.readNotes(ch.text, ch);
        renderNotes(true);
      }
    }
    let notesKey = '';
    function renderNotes(force) {
      const notes = T.notes, ch = G.caller.chunk;
      const items = ch ? ch.items : [];
      const key = items.join(',') + '|' + items.map((i) => (car.s > notes[i].s1 ? 1 : 0)).join('');
      if (!force && key === notesKey) return;
      notesKey = key;
      let html = '';
      items.forEach((i, k) => {
        const n = notes[i], sh = noteShort(n);
        const done = car.s > n.s1 + 2 && G.state === 'run';
        const prev = notes[items[k - 1]];
        if (k > 0) html += prev && prev.linkedNext ? '<span class="nc__in">в</span>' : `<span class="nc__d">${prev && prev.words.dist ? prev.words.dist.m : ''}</span>`;
        html += `<span class="nc ${done ? 'is-done' : 'is-now'}">${glyph(n)}<span class="nc__t">${sh.t}</span>${sh.m ? `<span class="nc__m">${sh.m}</span>` : ''}</span>`;
      });
      const last = notes[items[items.length - 1]];
      if (last && last.words.dist) html += `<span class="nc__d">${last.words.dist.m}</span>`;
      $('notesNow').innerHTML = html;
      const nx = [];
      for (let i = G.caller.next; i < Math.min(notes.length, G.caller.next + 3); i++) {
        const n = notes[i], sh = noteShort(n);
        nx.push(sh.t + (sh.m ? ' ' + sh.m : ''));
      }
      $('notesNext').textContent = nx.length ? 'дальше: ' + nx.join(' · ') : '';
    }

    // --- камера ---
    const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), tmpV = new THREE.Vector3();
    let camInit = false, cine = { t: 0, mode: 0 };
    function carWorld(out, fx, up, side) {
      const c = Math.cos(car.phi), s = Math.sin(car.phi);
      // side > 0 — вправо от машины
      return out.set(car.x + c * fx + s * side, car.z + up, -(car.y + s * fx - c * side));
    }
    function updateCamera(dt) {
      const sp = car.speed;
      const vh = sp > 3 ? Math.atan2(car.vy, car.vx) : car.phi;
      const blend = lerp(car.phi, car.phi + R.wrap(vh - car.phi), 0.55);
      const c = Math.cos(blend), s = Math.sin(blend);
      let want, look, fov = 60 + clamp(sp * 0.22, 0, 12), k = 1 - Math.exp(-dt * 5.5);
      if (G.state === 'attract' && !SHOT) {
        // заставка: чередуем погоню, низкий боковой и кадр спереди
        cine.t += dt;
        if (cine.t > 7) { cine.t = 0; cine.mode = (cine.mode + 1) % 3; camInit = false; }
        if (cine.mode === 0) { want = tmpV.set(car.x - c * 7.5, car.z + 2.6, -(car.y - s * 7.5)).clone(); look = new THREE.Vector3(car.x + c * 4, car.z + 1, -(car.y + s * 4)); }
        else if (cine.mode === 1) { want = new THREE.Vector3(car.x + c * 3 - s * 6.5, car.z + 1.1, -(car.y + s * 3 + c * 6.5)); look = new THREE.Vector3(car.x, car.z + 0.8, -car.y); fov = 48; k = 1 - Math.exp(-dt * 3); }
        else { want = new THREE.Vector3(car.x + c * 12 + s * 3, car.z + 1.6, -(car.y + s * 12 - c * 3)); look = new THREE.Vector3(car.x, car.z + 0.9, -car.y); fov = 40; k = 1 - Math.exp(-dt * 2.5); }
      } else if (G.camMode === 1 && G.state !== 'finish') {
        want = carWorld(new THREE.Vector3(), 0.6, 1.35, 0); look = carWorld(new THREE.Vector3(), 12, 1.1, 0); k = 1; fov = 70;
      } else {
        const dist = G.camMode === 2 ? 11 : 6.6, hh = G.camMode === 2 ? 3.8 : 2.35;
        want = new THREE.Vector3(car.x - c * dist, car.z + hh, -(car.y - s * dist));
        look = new THREE.Vector3(car.x + c * 3.5, car.z + 1.0, -(car.y + s * 3.5));
      }
      if (!camInit) { camPos.copy(want); camLook.copy(look); camInit = true; }
      camPos.lerp(want, k); camLook.lerp(look, Math.min(1, k * 1.6));
      // не залезать под землю
      const g = T.heightAt(camPos.x, -camPos.z, null);
      if (camPos.y < g.h + 0.9) camPos.y = g.h + 0.9;
      camera.position.copy(camPos);
      // тряска: удары, гравий, трава
      const shake = G.shake || 0;
      if (shake > 0.001) camera.position.add(tmpV.set((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake));
      G.shake = shake * Math.exp(-dt * 6);
      camera.lookAt(camLook);
      if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = lerp(camera.fov, fov, Math.min(1, dt * 3)); camera.updateProjectionMatrix(); }
    }

    // --- машина: синхронизация модели ---
    const rigPitch = { p: 0, r: 0 };
    function syncCar(dt) {
      const m = W.car;
      m.root.position.set(car.x, car.z, -car.y);
      // наклон по рельефу
      const c = Math.cos(car.phi), s = Math.sin(car.phi);
      let p = 0, r = 0;
      if (!car.air) {
        const hF = T.heightAt(car.x + c * 1.3, car.y + s * 1.3, car.idx).h, hB = T.heightAt(car.x - c * 1.3, car.y - s * 1.3, car.idx).h;
        const hL = T.heightAt(car.x - s * 0.8, car.y + c * 0.8, car.idx).h, hR = T.heightAt(car.x + s * 0.8, car.y - c * 0.8, car.idx).h;
        p = Math.atan2(hF - hB, 2.6); r = Math.atan2(hL - hR, 1.6);
      } else {
        p = clamp(Math.atan2(car.vz, Math.max(car.speed, 4)) * 0.7, -0.35, 0.35);
        r = rigPitch.r * 0.98;
      }
      const kk = Math.min(1, dt * (car.air ? 2.5 : 10));
      rigPitch.p = lerp(rigPitch.p, p, kk); rigPitch.r = lerp(rigPitch.r, r, kk);
      m.root.rotation.set(0, 0, 0); m.root.rotation.order = 'YZX';
      m.root.rotation.y = car.phi; m.root.rotation.z = rigPitch.p; m.root.rotation.x = rigPitch.r;
      // кузов: крен от поворота, клевок при торможении, подвеска
      m.body.rotation.order = 'YZX';
      m.body.rotation.z = clamp(car.ax * 0.009, -0.06, 0.05);
      m.body.rotation.x = clamp(car.ay * 0.0085, -0.075, 0.075);
      m.body.position.y = car.bounce * 0.6;
      for (const w of m.wheels) {
        if (w.front) w.steerG.rotation.y = car.delta;
        w.spin.rotation.z = -car.wheelSpin;
        w.steerG.position.y = 0.35 + (car.air ? -0.1 : clamp(-car.bounce * 0.5, -0.06, 0.06));
      }
    }

    // --- пыль из-под колёс ---
    let dustAcc = 0;
    function emitDust(dt, boost) {
      const sp = car.speed; if (car.air || sp < 2.5) return;
      const slide = Math.max(Math.abs(car.beta), boost ? 0.45 : 0);
      const surf = car.surface === 'grass' ? 0.5 : car.surface === 'shoulder' ? 1.1 : 1;
      const rate = (sp * 2.1 + slide * 120 + (car.surface === 'grass' ? 10 : 0)) * surf * (boost || 1);
      dustAcc += rate * dt;
      const c = Math.cos(car.phi), s = Math.sin(car.phi);
      while (dustAcc >= 1) {
        dustAcc -= 1;
        const side = Math.random() < 0.5 ? 0.8 : -0.8;
        const px = car.x - c * 1.6 + s * side, py = car.y - s * 1.6 - c * side;
        const back = -0.22 - Math.random() * 0.34;   // пыль увлекается следом за машиной и отстаёт
        const big = 1 + slide * 2.2 + sp * 0.02;
        // в заносе гравий летит назад и наружу, от скользящих колёс
        const out = -Math.sign(car.beta || 0) * slide * 6;
        const ox = -c * 2.5 * slide + s * out, oy = -s * 2.5 * slide - c * out;
        W.dust.emit(px + (Math.random() - 0.5) * 0.6, car.z + 0.25, -(py + (Math.random() - 0.5) * 0.6),
          -car.vx * back + ox + (Math.random() - 0.5) * 2.4, 0.6 + Math.random() * 1.2, -(-car.vy * back + oy) + (Math.random() - 0.5) * 2.4,
          1.6 + Math.random() * 1.1, (3.6 + Math.random() * 3.4) * big, 2.2 + Math.random() * 2.2, clamp(0.16 + sp * 0.007 + slide * 0.36, 0.1, 0.55));
      }
    }
    function landingPuff() {
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * 6.283;
        W.dust.emit(car.x + Math.cos(a) * 1.2, car.z + 0.2, -(car.y + Math.sin(a) * 1.2), Math.cos(a) * 3.2 + car.vx * 0.2, 0.8 + Math.random(), -Math.sin(a) * 3.2 - car.vy * 0.2, 1.4, 6 + Math.random() * 3, 2 + Math.random(), 0.34);
      }
    }

    // --- интерфейс ---
    let hudAcc = 0;
    function updateHud(dt) {
      hudAcc += dt; if (hudAcc < 0.07) return; hudAcc = 0;
      const kmh = Math.round(car.speed * 3.6);
      $('speed').textContent = kmh;
      $('gear').textContent = car.gear < 0 ? 'R' : car.gear;
      $('rpm').style.transform = `scaleX(${clamp((car.rpm - 800) / 6600, 0.04, 1).toFixed(3)})`;
      $('dmg').style.transform = `scaleX(${car.damage.toFixed(3)})`;
      if (G.state === 'run' || G.state === 'finish' || G.state === 'countdown') {
        const tt = G.state === 'finish' ? G.finishT : G.t + tel.stats.penalties;
        $('time').textContent = fmtTime(tt);
        const km = clamp((car.s - T.startS) / 1000, 0, (T.finishS - T.startS) / 1000);
        $('kmDone').textContent = km.toFixed(1).replace('.', ',');
        $('cpInfo').textContent = 'КП ' + tel.cpIdx + '/' + T.cps.length;
        if (G.state !== 'countdown' && car.s > T.startS + 30) {
          const d = G.state === 'finish' ? G.finishDelta : tel.delta(car.s, G.t);
          const el = $('delta'); el.hidden = false;
          el.textContent = fmtDelta(d);
          el.classList.toggle('is-good', d <= 0); el.classList.toggle('is-bad', d > 0);
        } else $('delta').hidden = true;
      }
      if (G.state === 'run') {
        renderNotes(false);
        // застряли в лесу или стоим поперёк — предлагаем вернуться на дорогу
        const stuck = car.speed < 2.5 && (car.surface === 'grass' || Math.abs(R.wrap(car.phi - T.PH[car.idx])) > 1.2) && G.t > 4;
        G.stuckT = stuck ? (G.stuckT || 0) + 0.07 : 0;
        $('btnRecover').hidden = !(G.stuckT > 2.5);
      } else $('btnRecover').hidden = true;
      if (window.AI) $('cost').textContent = 'DeepSeek · $' + AI.usage.costUSD.toFixed(4);
    }

    // --- финиш ---
    function finish() {
      G.state = 'finish';
      document.body.classList.add('is-finish');
      G.finishT = G.t + tel.stats.penalties;
      G.finishDelta = G.finishT - sched.total;
      tel.emit('finish', { time: +G.finishT.toFixed(2), delta: +G.finishDelta.toFixed(1) });
      R.Nav && R.Nav.finish(G.finishT, G.finishDelta);
      setTimeout(() => { if (G.state === 'finish') showResult(); }, 1600);
    }
    function showResult() {
      const st = tel.stats;
      $('resTime').textContent = fmtTime(G.finishT);
      const d = G.finishDelta;
      $('resDelta').innerHTML = (d <= 0 ? '<span style="color:var(--good)">' : '<span style="color:var(--bad)">') + fmtDelta(d) + ' с</span> к&nbsp;графику ' + fmtTime(sched.total) + (st.penalties ? ' · штраф ' + st.penalties + ' с' : '');
      const cells = [
        [Math.round(st.maxKmh), 'макс. км/ч'], [st.crashes, st.crashes === 1 ? 'удар' : 'ударов'], [st.drifts, 'заносов'],
        [Math.round(st.maxDrift) + '°', 'угол заноса'], [st.maxAir ? st.maxAir.toFixed(1).replace('.', ',') + ' с' : '—', 'в полёте'], [Math.round(car.damage * 100) + '%', 'повреждений'],
      ];
      $('resStats').innerHTML = cells.map(([b, s]) => `<div class="stat"><b>${b}</b><span>${s}</span></div>`).join('');
      $('result').hidden = false;
      R.Nav && R.Nav.showDebrief();
    }

    // --- обложка: кадр заноса с пылью ---
    // Машину проводим «по рельсу» через поворот, чтобы след пыли лёг по траектории,
    // а в кадре ставим позу заноса: нос внутрь поворота, колёса в контрруль.
    function setupShot() {
      const corner = T.notes.find((n) => n.kind === 'corner' && n.sev === 3 && n.dir > 0 && n.s0 > 600) || T.notes.find((n) => n.kind === 'corner');
      const sStop = corner.s0 + (corner.s1 - corner.s0) * 0.42;
      const v = 19;                                  // ~68 км/ч
      const slip = corner.dir * 0.5;                 // угол заноса
      const place = (sPos, lat) => {
        const i = Math.floor(sPos), f = sPos - i, [lx, ly] = T.leftOf(i);
        const ph = T.PH[i] + (T.PH[i + 1] - T.PH[i]) * f;
        car.x = T.X[i] + (T.X[i + 1] - T.X[i]) * f + lx * lat; car.y = T.Y[i] + (T.Y[i + 1] - T.Y[i]) * f + ly * lat;
        car.vx = Math.cos(ph) * v; car.vy = Math.sin(ph) * v; car.idx = i; car.s = sPos;
        car.z = T.heightAt(car.x, car.y, i).h; car.air = false; car.surface = 'road';
        return ph;
      };
      car.reset(sStop - 110, 0);
      const dtS = 1 / 60;
      for (let sp = sStop - 110; sp < sStop; sp += v * dtS) {
        const inCorner = sp > corner.s0 - 12;
        const lat = inCorner ? -corner.dir * 1.2 * Math.min(1, (sp - corner.s0 + 12) / 20) : 0;
        const ph = place(sp, lat);
        car.phi = ph + (inCorner ? slip * Math.min(1, (sp - corner.s0 + 12) / 14) : 0);
        car.beta = inCorner ? -slip : -0.1 * corner.dir;
        emitDust(dtS, inCorner ? 3.2 : 1.6);
        W.dust.update(dtS);
      }
      const ph = place(sStop, -corner.dir * 1.2);
      car.phi = ph + slip; car.beta = -slip;
      car.delta = -corner.dir * 0.32;
      car.ay = corner.dir * 9; car.ax = 1.2; car.bounce = 0; car.rpm = 6200; car.gear = 3;
      G.frozen = true;
      G.state = 'shot';
      // камера: на обочине впереди, снаружи поворота, низко
      const sc = Math.min(T.N - 2, sStop + 11.5), ic = Math.floor(sc), [clx, cly] = T.leftOf(ic);
      const off = -corner.dir * (T.HALF_W + 0.6);
      const cx = T.X[ic] + clx * off, cy = T.Y[ic] + cly * off;
      const gh = T.heightAt(cx, cy, ic).h;
      camera.position.set(cx, Math.max(gh + 0.95, car.z + 0.9), -cy);
      camera.fov = 42; camera.updateProjectionMatrix();
      const fwd = [Math.cos(car.phi), Math.sin(car.phi)];
      const ahead = camera.aspect < 1 ? -0.6 : 2.8;   // на телефоне машина по центру кадра
      camera.lookAt(car.x - fwd[0] * ahead, car.z + 1.25, -(car.y - fwd[1] * ahead));
      // солнце — косым светом на видимый бок машины
      const dx = cx - car.x, dy = cy - car.y, dl = Math.hypot(dx, dy);
      let best = null;
      for (const sgn of [1, -1]) {
        const a = Math.atan2(dy, dx) + sgn * 1.15;
        const front = Math.cos(a - car.phi);
        if (!best || front > best.front) best = { a, front };
      }
      W.sunDir.set(Math.cos(best.a), 0.22, -Math.sin(best.a)).normalize();
      void dl;
      G.t = 58.6; tel.t = G.t;
      G.caller.chunk = R.chunkFrom(T, corner.idx); G.caller.next = G.caller.chunk.next;
      renderNotes(true);
      $('time').textContent = fmtTime(G.t);
      $('delta').hidden = false; $('delta').textContent = '+1,8'; $('delta').classList.add('is-bad');
      $('kmDone').textContent = ((car.s - T.startS) / 1000).toFixed(1).replace('.', ',');
      $('cpInfo').textContent = 'КП 0/3';
      $('speed').textContent = Math.round(v * 3.6);
      $('gear').textContent = 3;
      $('menu').classList.add('is-hidden');
      document.body.classList.add('is-run');
      R.Nav && R.Nav.shotLine();
    }
    // перемотка заезда вперёд (для автотеста финиша)
    R.fastForward = (sec) => { const n = Math.round(sec / SIM_DT); for (let i = 0; i < n && G.state === 'run'; i++) simStep(SIM_DT); return Math.round(car.s); };
    // проверка меню и заставки из автотеста (обложка по умолчанию — кадр заноса)
    R.menuTest = (scale) => {
      G.frozen = false; G.frozenFrames = 0; G.state = 'attract'; R.SHOT = false;
      if (scale) { renderer.setPixelRatio(scale); renderer.setSize(innerWidth, innerHeight); }
      W.sunDir.set(-0.62, 0.2, -0.76).normalize();
      resetAttract(); openMenu(); document.body.classList.remove('is-run');
      return 'menu';
    };
    // живая проверка из автотеста: снять флаг обложки и поехать с настоящей нейросетью
    R.liveTest = (auto, demo, scale) => {
      if (window.AI) { AI.shot = false; AI.demo = demo ? true : !AI.hasKey(); }
      R.SHOT = false; G.frozen = false; G.state = 'attract'; G.autoDrive = !!auto;
      if (scale) { renderer.setPixelRatio(scale); renderer.setSize(innerWidth, innerHeight); }
      if (R.Nav) { R.Nav.dead = !!demo; R.Nav.aiState(); }
      startRun();
      return window.AI ? (AI.demo ? 'demo' : 'live') : 'no-ai';
    };

    // --- главный цикл ---
    let last = performance.now(), acc = 0;
    const frameCap = SHOT ? 0.5 : 0.05;
    function frame(now) {
      requestAnimationFrame(frame);
      G.frames = (G.frames || 0) + 1;
      if (document.hidden) { last = now; return; }
      advance(now);
      // съёмка: застывший кадр не перерисовываем; в автотесте рисуем не чаще ~3 раз в секунду
      W.sky.position.copy(camera.position);
      // размер пылинок — в пикселях буфера, чтобы на ретине пыль была той же
      W.dust.mat.uniforms.uScale.value = renderer.getDrawingBufferSize(tmpSize).y * 0.5 / Math.tan(camera.fov * Math.PI / 360) * 0.55;
      if (!SHOT) adaptResolution(now);
      if (G.frozen && ++G.frozenFrames > 2) return;
      if (SHOT && !G.frozen) { if (now - (G.lastRender || 0) < 300) return; G.lastRender = now; }
      renderer.render(W.scene, camera);
    }
    // адаптивное разрешение: держим кадр около 60 fps (в режиме съёмки не трогаем)
    const tmpSize = new THREE.Vector2();
    let prNow = dprCap, ftAcc = 0, ftN = 0, ftLast = 0;
    function adaptResolution(now) {
      if (ftLast) { ftAcc += now - ftLast; ftN++; }
      ftLast = now;
      if (ftN < 45) return;
      const avg = ftAcc / ftN; ftAcc = 0; ftN = 0;
      let next = prNow;
      if (avg > 24) next = Math.max(0.6, prNow - 0.15);
      else if (avg < 14 && prNow < dprCap) next = Math.min(dprCap, prNow + 0.1);
      if (Math.abs(next - prNow) > 0.01) { prNow = next; renderer.setPixelRatio(prNow); renderer.setSize(innerWidth, innerHeight); }
    }
    // логика кадра: физика фиксированным шагом, камера, штурман, интерфейс
    function advance(now) {
      let dt = Math.min((now - last) / 1000, frameCap); last = now;
      if (G.paused) dt = 0;
      if (!G.frozen) {
        acc += dt;
        let steps = 0;
        while (acc >= SIM_DT && steps < (SHOT ? 70 : 40)) {
          acc -= SIM_DT; steps++;
          simStep(SIM_DT);
        }
        W.dust.update(dt);
      }
      if (G.state !== 'shot') updateCamera(dt);
      syncCar(dt);
      // тень следует за машиной, лес рядом отбрасывает тени
      const cp = W.car.root.position;
      W.sun.target.position.copy(cp); W.sun.position.copy(cp).addScaledVector(W.sunDir, 90);
      for (const ch of W.chunks) {
        if (ch.kind === 'far') continue;
        const d = Math.hypot(ch.cx - car.x, ch.cy - car.y);
        ch.mesh.castShadow = d < 240;
      }
      R.Audio && R.Audio.update(car, dt, G.state);
      R.Nav && R.Nav.update(dt, G);
      updateHud(dt);
    }
    // в автотесте программный рендер может «подвесить» кадры на секунды — логика игры идёт по таймеру
    if (SHOT) setInterval(() => { const t = performance.now(); if (t - last > 150 && !document.hidden) advance(t); }, 60);
    function simStep(dt) {
      let input;
      if (G.state === 'attract') {
        input = G.auto.input(car, dt);
        if (car.s > T.finishS - 40 || (car.speed < 1 && G.t > 3)) resetAttract();
      } else if (G.state === 'countdown') {
        input = { steer: 0, throttle: 0, brake: 0, hand: 1 };
        G.cd -= dt;
        const n = Math.ceil(G.cd);
        if (n !== G.lastCd) {
          G.lastCd = n;
          const el = $('countdown');
          if (n >= 1 && n <= 3) { el.textContent = n; el.hidden = false; el.classList.remove('is-pop'); void el.offsetWidth; el.classList.add('is-pop'); R.Audio && R.Audio.beep(n > 0 ? 520 : 880, 0.12); }
        }
        if (G.cd <= 0) {
          G.state = 'run'; G.t = 0;
          const el = $('countdown'); el.textContent = 'Пошёл!'; el.classList.remove('is-pop'); void el.offsetWidth; el.classList.add('is-pop');
          setTimeout(() => { el.hidden = true; }, 900);
          R.Audio && R.Audio.beep(880, 0.35);
          tel.emit('start', {});
        }
      } else if (G.state === 'run') {
        input = G.autoDrive ? G.auto.input(car, dt) : readInput(dt);
        G.t += dt;
      } else if (G.state === 'finish') {
        input = { steer: G.auto.input(car, dt).steer, throttle: 0, brake: car.speed > 1 ? 0.6 : 0, hand: 0 };
      } else input = { steer: 0, throttle: 0, brake: 0, hand: 0 };
      if (G.state === 'attract') G.t += dt;
      const wasAir = car.air;
      car.step(dt, input);
      car._thr = input.throttle || 0;
      if (G.state === 'run') {
        tel.update(car, dt);
        for (const ct of car.contacts) if (ct.imp > 2) { G.shake = Math.max(G.shake || 0, Math.min(0.5, ct.imp * 0.035)); R.Audio && R.Audio.hit(ct.imp); }
        callNotes(false);
        if (car.s >= T.finishS) finish();
      }
      if (wasAir && !car.air && car.landing > 2.5) { landingPuff(); G.shake = Math.max(G.shake || 0, Math.min(0.35, car.landing * 0.03)); R.Audio && R.Audio.land(car.landing); }
      if (car.surface === 'grass' && car.speed > 8) G.shake = Math.max(G.shake || 0, 0.04);
      emitDust(dt);
    }

    addEventListener('resize', () => {
      renderer.setSize(innerWidth, innerHeight);
      camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    });
    document.addEventListener('visibilitychange', () => { last = performance.now(); });

    // --- старт ---
    R.Nav && R.Nav.init(G);
    if (SHOT) setupShot();
    else { resetAttract(); setHudRun(false); }
    // все шейдеры — сразу, чтобы первые секунды заезда не дёргались
    tp = performance.now();
    try { renderer.compile(W.scene, camera); } catch {}
    prof.compile = Math.round(performance.now() - tp);
    G.bootMs = Math.round(performance.now() - t0); G.prof = prof;
    requestAnimationFrame(frame);
  };
})(window.R);
