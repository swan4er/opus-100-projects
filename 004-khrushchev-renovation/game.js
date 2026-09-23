/* ================================================================
   game.js — ядро: рендер, игрок от первого лица, управление,
   время суток, инструменты, взаимодействие, HUD.
   ================================================================ */
'use strict';
const SHOT = !!window.__SHOT__;
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeIO = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const nbsp = (s) => String(s).replace(/(^|[\s(«])([вкснаоуиВКСНАОУИ]|на|но|по|за|от|до|из|не|Не|На|По|За|От|До|Из)\s/g, '$1$2 ');
const rub = (n) => Math.round(n).toLocaleString('ru-RU').replace(/\s/g, ' ') + ' ₽';

const G = {
  mode: 'boot',          // boot | title | play | talk | cine | result
  t: 9 * 60,             // игровое время, минуты от полуночи
  end: 18 * 60,
  drunk: 0,              // «градус»: 1 бутылка = 1, медленно выветривается
  beers: 0, stress: 14, smokes: 0,
  tool: 0, busy: null, holding: false, look: null,
  timeRate: 0.5,         // игровых минут в реальную секунду, когда просто ходишь
  log: [],               // журнал дня: что было, для нейросети
  invert: 0,             // «лево и право поменялись» (секунды)
  sound: true,
  started: false,
};
const TOOLS = [
  { id: 'hands', name: 'Руки', icon: '<path d="M8 13V5a1.5 1.5 0 0 1 3 0v6M11 11V4a1.5 1.5 0 0 1 3 0v7M14 11V5a1.5 1.5 0 0 1 3 0v8c0 4-2 7-6 7-3 0-4.5-2-6-4l-2-3a1.5 1.5 0 0 1 2.5-1.5L8 13"/>' },
  { id: 'roll', name: 'Обои', icon: '<rect x="3" y="3" width="11" height="5" rx="2.5"/><path d="M14 5.5h5v15H8V8"/><path d="M11 13c1 1 2 1 3 0s2-1 3 0"/>' },
  { id: 'tile', name: 'Плитка', icon: '<rect x="3" y="3" width="8" height="8"/><rect x="13" y="3" width="8" height="8"/><rect x="3" y="13" width="8" height="8"/><rect x="14" y="14" width="7" height="7" transform="rotate(14 17.5 17.5)"/>' },
  { id: 'brush', name: 'Кисть', icon: '<path d="M13 3l8 8-5 5-8-8z"/><path d="M8 8l-3.5 3.5a3 3 0 0 0 0 4.2L8.3 19.5a3 3 0 0 0 4.2 0L16 16"/>' },
  { id: 'spatula', name: 'Шпатель', icon: '<path d="M4 14h13l3 6H7z"/><path d="M10 14V3h3v11"/>' },
  { id: 'wrench', name: 'Ключ', icon: '<path d="M14.5 3.5a4.5 4.5 0 0 0-4.2 6.1L3.5 16.4a1.8 1.8 0 0 0 2.6 2.6l6.8-6.8a4.5 4.5 0 0 0 6.1-4.2l-2.6 2.6-2.6-.7-.7-2.6z"/>' },
];
const toolId = () => TOOLS[G.tool].id;

let renderer, scene, camera, composer, gradePass, vm, booted = false, lastT = 0, simTime = 0;
const P = { x: 6.9, z: 4.85, yaw: Math.PI / 2, pitch: -0.08, tyaw: Math.PI / 2, tpitch: -0.08, h: 1.62, r: 0.26, bob: 0, moving: 0, vx: 0, vz: 0 };
const keys = {};
const touch = { on: false, mx: 0, mz: 0, lookId: null, lx: 0, ly: 0, stickId: null };
let raycaster, pickList = [];

/* ---------- запуск ----------
   Сборка квартиры разбита на шаги с паузами: между шагами браузер успевает
   отрисовать экран загрузки и обработать ввод. Шейдеры компилируются
   асинхронно (compileAsync), текстуры заливаются заранее — первый кадр
   больше не вешает страницу на несколько секунд. */
const TIMING = {};                                   // замеры запуска, мс (KR.TIMING)
const LIVE = location.hash === '#live';              // проверка живой нейросети под _tools/shot
function KR_BOOT(lib) {
  if (booted) return;
  THREE = lib.THREE; LIB = lib; booted = true;
  TIMING.bootAt = Math.round(performance.now());
  init().catch((e) => { $('boot').textContent = 'Не удалось собрать квартиру: ' + e.message; setTimeout(() => { throw e; }); });
}
setTimeout(() => { if (!booted) $('boot').innerHTML = 'Для хрущёвки нужен интернет:<br>трёхмерный движок грузится с&nbsp;CDN.'; }, 12000);
const breathe = () => new Promise((r) => setTimeout(r, 0));
function bootText(s) { const b = $('boot'); if (b) b.textContent = s; }

async function init() {
  const T0 = performance.now(); const mark = (k) => { TIMING[k] = Math.round(performance.now() - T0); };
  if (LIVE) { AI.shot = false; AI.demo = !AI.hasKey(); }
  const cv = $('cv');
  renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: !SHOT, powerPreference: 'high-performance' });
  renderer.setPixelRatio(SHOT ? 1 : Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xe8e0d0, 70, 330);
  camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.03, 700);
  camera.rotation.order = 'YXZ';
  scene.add(camera);
  mark('renderer');

  bootText('Сдираем старые обои…'); await breathe();
  buildTextures(); mark('textures');
  bootText('Расставляем сервант и хрусталь…'); await breathe();
  buildWorld(scene); mark('world');
  await breathe();
  // отражения (хрусталь, лак, кафель). Программный рендер сервера считает PMREM
  // больше десяти секунд, поэтому в режиме съёмки обходимся без него
  if (!SHOT) {
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(new LIB.RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.32; pm.dispose();
    mark('pmrem');
  }
  setDaylight(G.t / 60);
  vm = buildViewModel();
  if (typeof initPeople === 'function') initPeople();
  if (typeof initJobs === 'function') initJobs();
  pickList = W.inter.concat(W.occl);
  raycaster = new THREE.Raycaster();
  // без карты окружения (режим съёмки) металл рендерится чёрным — делаем его «крашеным»
  if (!scene.environment) scene.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m.metalness > 0.3) m.metalness = 0.3; }); });
  mark('people');

  // постобработка: лёгкий тёплый грейд, виньетка и «пьяное» зрение
  composer = new LIB.EffectComposer(renderer);
  composer.addPass(new LIB.RenderPass(scene, camera));
  gradePass = new LIB.ShaderPass({
    uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uDrunk: { value: 0 }, uFlash: { value: 0 }, uSmoke: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime, uDrunk, uFlash, uSmoke; varying vec2 vUv;
      void main(){
        vec2 uv = vUv; float d = uDrunk;
        uv += d * 0.007 * vec2(sin(uv.y*8.0 + uTime*1.3), cos(uv.x*6.0 + uTime*1.05));
        vec4 c = texture2D(tDiffuse, uv);
        if (d > 0.01) {
          vec2 off = d * 0.02 * vec2(sin(uTime*0.6), cos(uTime*0.83));
          c = mix(c, texture2D(tDiffuse, uv + off), clamp(d*0.55, 0.0, 0.5));
        }
        vec2 q = vUv - 0.5;
        c.rgb *= 1.0 - dot(q,q) * d * 1.4;
        c.rgb = mix(c.rgb, vec3(dot(c.rgb, vec3(0.3,0.59,0.11))) * vec3(1.05,1.0,0.92), uSmoke*0.35);
        c.rgb += uFlash * vec3(1.0,0.75,0.4);
        gl_FragColor = c;
      }`,
  });
  composer.addPass(gradePass);
  composer.addPass(new LIB.OutputPass());

  bindInput();
  buildHUD();
  addEventListener('resize', onResize); onResize();
  if (typeof initTalk === 'function') initTalk();
  const cover = SHOT && !LIVE && typeof stageCover === 'function';
  if (cover) stageCover(); else titleCamera(0);
  mark('scene');

  // материалы, которые появятся по ходу дня (плитка, календарь, лужа, краска…), компилируем заранее
  const warm = new THREE.Group(); warm.visible = false; scene.add(warm);
  const M = W.mats, tiny = new THREE.BoxGeometry(0.01, 0.01, 0.01);
  M.wallNewTint = M.wallNewTint || Object.assign(M.wallNew.clone(), { vertexColors: true });
  for (const m of [M.tileNew, M.tileDecor, M.tileEdge, M.tvOn, M.calendar, M.puddle, M.paint, M.patch, M.water, M.wallNewTint]) warm.add(new THREE.Mesh(tiny, m));
  // текстуры — в видеопамять заранее, шейдеры — параллельно, не блокируя страницу
  bootText('Разводим цемент…'); await breathe();
  for (const k in TX) if (TX[k] && TX[k].isTexture) renderer.initTexture(TX[k]);
  mark('upload');
  await breathe();
  // без KHR_parallel_shader_compile compileAsync только предупреждает и ждёт так же — компилируем сразу
  if (renderer.extensions.has('KHR_parallel_shader_compile')) {
    await renderer.compileAsync(scene, camera);
    // вариант шейдеров для «пьяной» постобработки (рендер в текстуру) — тоже заранее, чтобы первое пиво не дёргало кадр
    if (!SHOT) { renderer.setRenderTarget(composer.readBuffer); const p = renderer.compileAsync(scene, camera); renderer.setRenderTarget(null); await p; }
  } else renderer.compile(scene, camera);
  mark('compiled');

  // первый кадр — и только потом убираем экран загрузки
  if (!cover) showTitle();
  requestAnimationFrame(loop);
  requestAnimationFrame(() => requestAnimationFrame(() => { $('boot').classList.add('gone'); mark('shown'); KR.ready = true; }));
}

const baseFov = () => (innerWidth < innerHeight ? 82 : 72);
function onResize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); composer && composer.setSize(w, h);
  camera.aspect = w / h;
  camera.fov = baseFov();
  if (camera.view && camera.view.enabled && typeof frameAbovePanel === 'function') frameAbovePanel();
  camera.updateProjectionMatrix();
  vm && placeViewModel();
}

/* ---------- титульный экран: камера медленно плывёт по залу ---------- */
function showTitle() {
  G.mode = 'title';
  $('title').classList.remove('hidden');
  $('bHow').onclick = () => $('how').classList.toggle('hidden');
  $('bStart').onclick = async () => {
    SFX.init(); SFX.play('click');
    $('bStart').disabled = true;
    await AI.ensureKey();
    startDay();
  };
}
const _tl = { p: null, q: null };
function titleCamera(t) {
  const k = (Math.sin(t * 0.06) + 1) / 2;
  camera.position.set(lerp(4.55, 4.25, k), 1.58, lerp(3.45, 3.1, k));
  camera.lookAt(lerp(1.2, 1.6, k), 1.05, lerp(1.55, 1.1, k));
}

function startDay() {
  $('title').classList.add('hidden');
  $('hud').classList.remove('hidden');
  if (isTouch()) $('touch').classList.remove('hidden');
  G.mode = 'play'; G.started = true;
  P.x = 6.9; P.z = 4.85; P.yaw = P.tyaw = Math.PI / 2; P.pitch = P.tpitch = -0.08;
  updateDemoTag();
  toast(nbsp('Хозяйка вернётся в 18:00. Инструменты — клавиши 1–6, записка — Tab.'), '', 5200);
  if (typeof onDayStart === 'function') onDayStart();
  lockPointer();
}
function updateDemoTag() { $('demoTag').classList.toggle('hidden', !AI.demo); }

/* ---------- ввод ---------- */
const isTouch = () => matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window && innerWidth < 900;
function lockPointer() {
  if (isTouch() || SHOT) return;
  const cv = $('cv');
  try { const p = cv.requestPointerLock && cv.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* без захвата мыши — будем крутить перетаскиванием */ }
}
const locked = () => document.pointerLockElement === $('cv');
function bindInput() {
  const cv = $('cv');
  addEventListener('keydown', (e) => {
    if (e.target && e.target.tagName === 'INPUT') return;
    keys[e.code] = true;
    if (G.mode !== 'play') { if (e.code === 'Tab') e.preventDefault(); return; }
    if (e.code === 'KeyE') doE();
    if (e.code === 'Tab') { e.preventDefault(); toggleNote(); }
    if (/^Digit[1-6]$/.test(e.code)) setTool(+e.code.slice(5) - 1);
    if (e.code === 'KeyR' && typeof onKeyR === 'function') onKeyR();
  });
  addEventListener('keyup', (e) => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; G.holding = false; });
  let drag = null;
  cv.addEventListener('mousedown', (e) => {
    if (G.mode !== 'play') return;
    if (!locked() && !isTouch()) {
      lockPointer();
      drag = { x: e.clientX, y: e.clientY, moved: 0 };
    }
    if (e.button === 0) lmbDown();
  });
  addEventListener('mouseup', (e) => { if (e.button === 0) G.holding = false; drag = null; });
  addEventListener('mousemove', (e) => {
    if (G.mode !== 'play') return;
    if (locked()) look(e.movementX, e.movementY);
    else if (drag) { look(e.clientX - drag.x, e.clientY - drag.y); drag.x = e.clientX; drag.y = e.clientY; }
  });
  cv.addEventListener('wheel', (e) => { if (G.mode === 'play') setTool((G.tool + (e.deltaY > 0 ? 1 : -1) + TOOLS.length) % TOOLS.length); }, { passive: true });
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  // сенсорное: джойстик, взгляд пальцем, кнопки
  const stick = $('stick'), knob = $('knob');
  stick.addEventListener('pointerdown', (e) => { touch.stickId = e.pointerId; stick.setPointerCapture(e.pointerId); moveStick(e); });
  stick.addEventListener('pointermove', (e) => { if (e.pointerId === touch.stickId) moveStick(e); });
  const endStick = () => { touch.stickId = null; touch.mx = touch.mz = 0; knob.style.transform = ''; };
  stick.addEventListener('pointerup', endStick); stick.addEventListener('pointercancel', endStick);
  function moveStick(e) {
    const r = stick.getBoundingClientRect(); let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const L = Math.hypot(dx, dy), m = r.width / 2 - 20; if (L > m) { dx *= m / L; dy *= m / L; }
    knob.style.transform = `translate(${dx}px,${dy}px)`; touch.mx = dx / m; touch.mz = dy / m;
  }
  cv.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse' && G.mode === 'play') { touch.lookId = e.pointerId; touch.lx = e.clientX; touch.ly = e.clientY; } });
  cv.addEventListener('pointermove', (e) => { if (e.pointerId === touch.lookId) { look((e.clientX - touch.lx) * 1.6, (e.clientY - touch.ly) * 1.6); touch.lx = e.clientX; touch.ly = e.clientY; } });
  const endLook = (e) => { if (e.pointerId === touch.lookId) touch.lookId = null; };
  cv.addEventListener('pointerup', endLook); cv.addEventListener('pointercancel', endLook);
  $('tE').addEventListener('pointerdown', (e) => { e.preventDefault(); doE(); });
  $('tA').addEventListener('pointerdown', (e) => { e.preventDefault(); lmbDown(); });
  $('tA').addEventListener('pointerup', () => { G.holding = false; });
  $('tA').addEventListener('pointercancel', () => { G.holding = false; });
}
function look(dx, dy) {
  const d = G.drunk;
  const sens = 0.0023 * (1 + d * 0.08);
  P.tyaw -= dx * sens; P.tpitch = clamp(P.tpitch - dy * sens, -1.35, 1.25);
}
function setTool(i) {
  if (G.busy) return;
  G.tool = i; G.holding = false;
  document.querySelectorAll('.tool').forEach((b, k) => b.classList.toggle('on', k === i));
  showToolModel(TOOLS[i].id);
  SFX.play('tool');
}
function toggleNote() { const n = $('note'); n.classList.toggle('collapsed'); $('noteHead').setAttribute('aria-expanded', String(!n.classList.contains('collapsed'))); }

function doE() {
  if (G.mode !== 'play' || G.busy) return;
  const L = G.look; if (!L || !L.d.e || L.d.e.off) return;
  L.d.e.fn(L.hit);
}
function lmbDown() {
  if (G.mode !== 'play' || G.busy) return;
  const L = G.look;
  if (L && L.d.lmb && !L.d.lmb.off) {
    vmPunch();
    if (L.d.lmb.hold) G.holding = true; else L.d.lmb.fn(L.hit, 0);
    return;
  }
  if (typeof freeAction === 'function') { if (freeAction()) { vmPunch(); G.holding = true; } }
}

/* ---------- игрок: ходьба, столкновения, «штормит» ---------- */
function collide(x, z, r) {
  for (let it = 0; it < 2; it++) for (const c of W.colliders) {
    const cx = clamp(x, c[0], c[2]), cz = clamp(z, c[1], c[3]);
    const dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 1e-8) { const d = Math.sqrt(d2), k = (r - d) / d; x += dx * k; z += dz * k; }
      else { // центр внутри прямоугольника: выталкиваем по кратчайшей оси
        const l = x - c[0], rr = c[2] - x, t = z - c[1], b = c[3] - z, m = Math.min(l, rr, t, b);
        if (m === l) x = c[0] - r; else if (m === rr) x = c[2] + r; else if (m === t) z = c[1] - r; else z = c[3] + r;
      }
    }
  }
  return [x, z];
}
function updatePlayer(dt) {
  let mx = 0, mz = 0;
  if (keys.KeyW || keys.ArrowUp) mz -= 1; if (keys.KeyS || keys.ArrowDown) mz += 1;
  if (keys.KeyA || keys.ArrowLeft) mx -= 1; if (keys.KeyD || keys.ArrowRight) mx += 1;
  mx += touch.mx; mz += touch.mz;
  if (G.invert > 0) mx = -mx;
  const L = Math.hypot(mx, mz); if (L > 1) { mx /= L; mz /= L; }
  const d = G.drunk;
  const speed = (keys.ShiftLeft || keys.ShiftRight ? 3.3 : 2.2) * (G.busy ? 0.25 : 1);
  // пьяный дрейф вбок
  const drift = d > 1.5 ? Math.sin(simTime * 0.9) * 0.18 * (d - 1.5) * (L > 0 ? 1 : 0.3) : 0;
  const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
  const tvx = (fx * -mz + rx * (mx + drift)) * speed, tvz = (fz * -mz + rz * (mx + drift)) * speed;
  const acc = 1 - Math.exp(-dt * (d > 2 ? 5 : 11));
  P.vx = lerp(P.vx, tvx, acc); P.vz = lerp(P.vz, tvz, acc);
  const [nx, nz] = collide(P.x + P.vx * dt, P.z + P.vz * dt, P.r);
  P.x = nx; P.z = nz;
  const sp = Math.hypot(P.vx, P.vz);
  P.moving = sp; P.bob += dt * sp * 3.4;
  if (sp > 0.6 && Math.sin(P.bob) * Math.sin(P.bob - dt * sp * 3.4) < 0 && Math.sin(P.bob) < 0) SFX.play('step', { room: roomAt(P.x, P.z) });
  // мышь: у трезвого — чётко, у пьяного — с запаздыванием и раскачкой
  const lag = 1 - Math.exp(-dt * (d > 1 ? 30 / (1 + d * 1.6) : 40));
  P.yaw = lerp(P.yaw, P.tyaw, lag); P.pitch = lerp(P.pitch, P.tpitch, lag);
  const sway = d * 0.012, shake = handShake() * 0.004;
  camera.position.set(P.x, P.h + Math.sin(P.bob * 2) * 0.025 * Math.min(1, sp / 2), P.z);
  camera.rotation.set(P.pitch + Math.sin(simTime * 0.8) * sway + (Math.random() - 0.5) * shake,
    P.yaw + Math.sin(simTime * 0.53) * sway * 1.4 + (Math.random() - 0.5) * shake, Math.sin(simTime * 0.41) * sway * 1.2 * (d > 3 ? 2 : 1));
}
// дрожь рук: нервы и лишнее пиво
function handShake() { return clamp(G.stress / 100, 0, 1) * 1.2 + Math.max(0, G.drunk - 1.5) * 0.45; }
// итоговая «кривизна рук» для работ (0 — золотые руки)
function sloppiness() { return 0.25 + G.stress / 100 * 0.9 + G.drunk * 0.45; }
// скорость работы: пиво ускоряет («да чё тут делать-то»)
function workSpeed() { return 1 + Math.min(G.drunk, 5) * 0.18; }
function courage() { return clamp(Math.round(18 + G.drunk * 17 - G.stress * 0.15), 5, 100); }

/* ---------- взаимодействие: что под прицелом ---------- */
function findIt(o) { while (o) { if (o.userData && o.userData.it) return o.userData.it; o = o.parent; } return null; }
function pickLook() {
  raycaster.setFromCamera({ x: 0, y: 0 }, camera); raycaster.far = 2.4;
  const hits = raycaster.intersectObjects(pickList, false);
  for (const h of hits) {
    const it = findIt(h.object);
    if (it) { const d = it.look(h); if (d) return { it, d, hit: h }; continue; }
    return null; // упёрлись в стену
  }
  return null;
}
function renderPrompt(L) {
  const el = $('prompt');
  if (!L || G.busy) { if (el.innerHTML) el.innerHTML = ''; return; }
  const key = [L.d.name, L.d.lmb && L.d.lmb.text, L.d.lmb && L.d.lmb.off, L.d.e && L.d.e.text, L.d.e && L.d.e.off].join('|');
  if (el.dataset.k === key) return;
  el.dataset.k = key;
  let h = L.d.name ? `<div class="name">${L.d.name}</div>` : '';
  if (L.d.lmb) h += `<div class="act${L.d.lmb.off ? ' off' : ''}"><kbd>${isTouch() ? 'Р' : 'ЛКМ'}</kbd>${nbsp(L.d.lmb.text)}</div>`;
  if (L.d.e) h += `<div class="act${L.d.e.off ? ' off' : ''}"><kbd>E</kbd>${nbsp(L.d.e.text)}</div>`;
  el.innerHTML = h;
}

/* ---------- время ---------- */
function spend(min) { G.t += min; }
function clockStr(t = G.t) { const h = Math.floor(t / 60) % 24, m = Math.floor(t % 60); return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0'); }
function logEvent(s) { G.log.push(clockStr() + ' ' + s); if (G.log.length > 40) G.log.shift(); }

/* ---------- модель рук в кадре ---------- */
function buildViewModel() {
  const root = new THREE.Group(); camera.add(root);
  const M = W.mats;
  const sleeveM = new THREE.MeshStandardMaterial({ color: 0x3f5266, roughness: 0.95 });
  const gloveM = new THREE.MeshStandardMaterial({ color: 0xe9e3d3, roughness: 1 });
  const arm = new THREE.Group(); root.add(arm);
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.4, 12), sleeveM); sleeve.rotation.x = Math.PI / 2 - 0.3; sleeve.position.set(0.035, -0.07, 0.17); arm.add(sleeve);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.043, 0.043, 0.03, 12), gloveM); cuff.rotation.x = Math.PI / 2 - 0.3; cuff.position.set(0.02, -0.03, 0.02); arm.add(cuff);
  const hand = new THREE.Mesh(new LIB.RoundedBoxGeometry(0.07, 0.035, 0.08, 3, 0.015), gloveM); hand.position.set(0, 0.0, -0.035); hand.rotation.x = -0.25; arm.add(hand);
  for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.0085, 0.028, 4, 6), gloveM); f.position.set(-0.024 + i * 0.016, 0.018, -0.075); f.rotation.x = -1.2; arm.add(f); }
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.01, 0.03, 4, 6), gloveM); thumb.position.set(-0.042, 0.014, -0.03); thumb.rotation.z = 1.0; thumb.rotation.x = -0.5; arm.add(thumb);
  const tools = {};
  const g = (id) => { const t = new THREE.Group(); t.visible = false; arm.add(t); tools[id] = t; return t; };
  // обои: рулон
  { const t = g('roll'); const r = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 16), M.rollNew); r.rotation.z = Math.PI / 2 - 0.2; r.position.set(-0.05, 0.07, -0.08); t.add(r); }
  // плитка
  { const t = g('tile'); const p = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.012), M.tileNew); p.position.set(-0.03, 0.08, -0.1); p.rotation.set(-0.5, 0.2, 0.1); t.add(p); t.userData.tile = p; }
  // кисть с белой краской
  { const t = g('brush'); const h = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.2, 8), M.lightWood); h.rotation.x = -1.1; h.position.set(0, 0.06, -0.12); t.add(h);
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.05), M.alu); f.position.set(0, 0.12, -0.2); f.rotation.x = -1.1; t.add(f);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.02, 0.07), M.paint); b.position.set(0, 0.145, -0.25); b.rotation.x = -1.1; t.add(b); }
  // шпатель
  { const t = g('spatula'); const h = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.025), M.ink); h.position.set(0, 0.06, -0.08); h.rotation.x = -0.6; t.add(h);
    const bl = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.09, 0.004), M.steel); bl.position.set(0, 0.13, -0.15); bl.rotation.x = -0.6; t.add(bl);
    const pu = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.01), M.patch); pu.position.set(0, 0.16, -0.16); pu.rotation.x = -0.6; t.add(pu); }
  // разводной ключ
  { const t = g('wrench'); const h = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, 0.014), M.steel); h.position.set(0, 0.08, -0.1); h.rotation.x = -0.7; t.add(h);
    const hd = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.012, 6, 12, Math.PI * 1.4), M.steel); hd.position.set(0, 0.17, -0.18); hd.rotation.x = -0.7; t.add(hd); }
  // бутылка (для пива) и сигарета
  { const t = g('bottle'); const b = makeBottle(); b.scale.setScalar(0.9); b.position.set(-0.02, -0.02, -0.08); b.rotation.x = -0.3; t.add(b); t.userData.b = b; }
  { const t = g('cig'); const c = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.075, 8), new THREE.MeshStandardMaterial({ color: 0xf2eee4, roughness: 0.8 })); c.rotation.z = Math.PI / 2 - 0.3; c.position.set(-0.04, 0.05, -0.08); t.add(c);
    const f = new THREE.Mesh(new THREE.CylinderGeometry(0.0047, 0.0047, 0.022, 8), new THREE.MeshStandardMaterial({ color: 0xd9a441, roughness: 0.8 })); f.position.set(0.032, 0.0, 0); c.add(f); f.rotation.z = 0; f.position.set(0, -0.045, 0);
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.005, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff6a2a })); e.position.set(0, 0.038, 0); c.add(e); t.userData.ember = e; }
  root.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return { root, arm, hand, tools, punch: 0, cur: 'hands' };
}
function placeViewModel() {
  const narrow = innerWidth < innerHeight;
  vm.root.position.set(narrow ? 0.08 : 0.14, narrow ? -0.13 : -0.12, -0.22);
  vm.root.scale.setScalar(narrow ? 0.42 : 0.46);
}
function showToolModel(id) {
  for (const k in vm.tools) vm.tools[k].visible = k === id;
  vm.cur = id;
}
function vmPunch() { vm.punch = 1; }
function updateViewModel(dt) {
  vm.root.visible = G.mode === 'play';
  const a = vm.arm, sp = P.moving;
  vm.punch = Math.max(0, vm.punch - dt * 4);
  const hold = G.holding ? Math.sin(simTime * 18) * 0.012 : 0;
  a.position.set(Math.cos(P.bob) * 0.012 * Math.min(1, sp), Math.abs(Math.sin(P.bob)) * 0.012 * Math.min(1, sp) - vm.punch * 0.02 + hold, -vm.punch * 0.05);
  const sh = handShake() * 0.01;
  a.rotation.set(vm.punch * -0.4 + (Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh, Math.sin(simTime * 0.7) * G.drunk * 0.02);
  // «занятые» анимации: пьём, курим
  if (G.busy && G.busy.anim) G.busy.anim(G.busy.k, a);
}

/* ---------- HUD ---------- */
const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };
function buildHUD() {
  // семисегментные часы
  const svg = $('clock7'); let h = '';
  const digit = (x, id) => {
    const s = { a: [4, 0, 16, 4], b: [20, 4, 4, 16], c: [20, 24, 4, 16], d: [4, 40, 16, 4], e: [0, 24, 4, 16], f: [0, 4, 4, 16], g: [4, 20, 16, 4] };
    for (const k in s) { const [a, b, c, d] = s[k]; h += `<rect id="${id}${k}" x="${x + a}" y="${b}" width="${c}" height="${d}" rx="1.5" class="off"/>`; }
  };
  digit(0, 'd0'); digit(29, 'd1'); h += '<rect x="59" y="12" width="5" height="5" class="on"/><rect x="59" y="27" width="5" height="5" class="on"/>'; digit(72, 'd2'); digit(101, 'd3');
  svg.innerHTML = h;
  // инструменты
  const nav = $('tools');
  nav.innerHTML = TOOLS.map((t, i) => `<button class="tool${i === 0 ? ' on' : ''}" data-i="${i}" aria-label="${t.name}"><i>${i + 1}</i><svg viewBox="0 0 24 24">${t.icon}</svg><span>${t.name}</span></button>`).join('');
  nav.querySelectorAll('.tool').forEach((b) => b.addEventListener('click', () => setTool(+b.dataset.i)));
  $('noteHead').addEventListener('click', toggleNote);
  $('bSound').addEventListener('click', () => { G.sound = !G.sound; SFX.init(); SFX.mute(!G.sound); $('bSound').setAttribute('aria-pressed', String(G.sound)); });
  AI.onStatus = (s) => { const d = $('aiDot'); d.className = 'dot ' + (AI.demo ? 'demo' : s); };
  if (isTouch()) $('note').classList.add('collapsed');
}
let lastClock = '';
function updateHUD() {
  const s = clockStr();
  if (s !== lastClock) {
    lastClock = s;
    const ds = s.replace(':', '');
    for (let i = 0; i < 4; i++) { const on = SEG[+ds[i]]; for (const k of 'abcdefg') { const el = document.getElementById('d' + i + k); if (el) el.setAttribute('class', on.includes(k) ? 'on' : 'off'); } }
    const left = Math.max(0, G.end - G.t);
    $('clockLbl').textContent = G.mode === 'cine' || G.t >= G.end ? 'приёмка работ' : left < 60 ? `хозяйка через ${Math.ceil(left)} мин` : `до хозяйки ${Math.floor(left / 60)} ч ${Math.floor(left % 60)} мин`;
    if (typeof refreshTasks === 'function') refreshTasks();
  }
  $('mBeer').textContent = G.beers;
  $('mNerves').style.width = clamp(G.stress, 3, 100) + '%';
  $('mCourage').style.width = courage() + '%';
  $('aiCost').textContent = '$' + AI.usage.costUSD.toFixed(4);
  if (AI.demo) $('aiDot').className = 'dot demo';
  $('ring').style.strokeDasharray = (G.progress ? Math.round(G.progress * 100) : 0) + ' 100';
}
function toast(html, kind = '', ms = 3200) {
  const box = $('toasts'); const d = document.createElement('div');
  d.className = 'toast ' + kind; d.innerHTML = html; box.appendChild(d);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 450); }, ms);
}

/* ---------- главный цикл ---------- */
function loop(now) {
  requestAnimationFrame(loop);
  if (document.hidden) { lastT = now; return; }
  const dt = Math.min(0.05, (now - lastT) / 1000 || 0.016); lastT = now;
  if (!KR.auto) { simTime += dt; update(dt); }
  gradePass.uniforms.uTime.value = simTime;
  gradePass.uniforms.uDrunk.value = lerp(gradePass.uniforms.uDrunk.value, clamp((G.drunk - 1) / 4, 0, 1.2), 0.05);
  gradePass.uniforms.uFlash.value *= 0.9;
  // в режиме съёмки программный рендер медленный: логика идёт каждый кадр, а рисуем редко
  if (SHOT && now - lastDraw < 1200 && drawn > 1) return;
  lastDraw = now; drawn++;
  if (W.shadowDirty) { W.lights.sun.shadow.needsUpdate = true; W.shadowDirty = false; }
  // постобработка нужна только для «пьяного» зрения, вспышек и дыма — иначе рисуем напрямую
  const u = gradePass.uniforms;
  const r0 = performance.now();
  // (в режиме съёмки — всегда напрямую: программный рендер сервера на новый путь пересобирает все шейдеры десятки секунд)
  if (!SHOT && (u.uDrunk.value > 0.02 || u.uFlash.value > 0.01 || u.uSmoke.value > 0.01)) composer.render();
  else renderer.render(scene, camera);
  if (drawn <= 4) { TIMING['frame' + drawn] = Math.round(performance.now() - r0); TIMING['frameAt' + drawn] = Math.round(performance.now()); }
}
let lastDraw = 0, drawn = 0;
let dayH = -1;
function update(dt) {
  if (G.mode === 'title') titleCamera(simTime);
  if (G.mode === 'play') {
    updatePlayer(dt);
    if (!G.busy) G.t += dt * G.timeRate;
    G.invert = Math.max(0, G.invert - dt);
    G.drunk = Math.max(0, G.drunk - dt * 0.004);          // выветривается медленно
    G.stress = clamp(G.stress - dt * 0.12, 0, 100);
    G.look = G.busy ? null : pickLook();
    renderPrompt(G.look);
    G.progress = 0;
    if (G.holding && G.look && G.look.d.lmb && G.look.d.lmb.hold && !G.look.d.lmb.off) {
      const p = G.look.d.lmb.fn(G.look.hit, dt); if (typeof p === 'number') G.progress = p;
    } else if (G.holding && typeof freeHold === 'function') { const p = freeHold(dt); if (p === false) G.holding = false; }
    if (G.busy) { G.busy.k += dt / G.busy.dur; if (G.busy.k >= 1) { const b = G.busy; G.busy = null; b.done && b.done(); } }
    if (typeof dayEvents === 'function') dayEvents(dt);
  }
  if (G.mode === 'talk' && typeof talkTick === 'function') talkTick(dt);
  if (G.mode === 'cine' && typeof cineTick === 'function') cineTick(dt);
  // кадр над окном диалога — в разговорах, на приёмке и на обложке; в игре смещение плавно уходит
  if (G.mode !== 'title' && G.mode !== 'boot' && G.mode !== 'cine') frameAbovePanel(dt);
  if (G.mode === 'cover' && !$('bubble').classList.contains('hidden')) bubbleFor(PEOPLE.baba);
  if (typeof updateJobs === 'function') updateJobs(dt);
  if (typeof updatePeople === 'function') updatePeople(dt, simTime);
  updateViewModel(dt);
  const h = G.t / 60;
  if (Math.abs(h - dayH) > 1 / 60) { dayH = h; setDaylight(h); }
  // стрелки часов в зале показывают игровое время
  W.objs.clockH.rotation.z = -((G.t / 60) % 12) / 12 * Math.PI * 2;
  W.objs.clockM.rotation.z = -(G.t % 60) / 60 * Math.PI * 2;
  if (G.mode !== 'title' && G.mode !== 'boot') updateHUD();
}

// отладка и съёмка: доступ из консоли и из _tools/shot
window.KR = {
  G, P, W, TIMING,
  get renderer() { return renderer; }, get scene() { return scene; }, get camera() { return camera; },
  go(x, z, yaw, pitch) { P.x = x; P.z = z; if (yaw != null) P.yaw = P.tyaw = yaw; if (pitch != null) P.pitch = P.tpitch = pitch; },
  time(h) { G.t = h * 60; },
  start() { if (G.mode === 'title') { startDay(); } },
  live() { AI.shot = false; AI.demo = !AI.hasKey(); updateDemoTag(); return { demo: AI.demo }; },
  tool(i) { setTool(i); },
  press(code) { keys[code] = true; setTimeout(() => { keys[code] = false; }, 120); },
  // для проверок: прокрутить логику вперёд без кадров (программный рендер сервера медленный)
  tick(sec, step = 0.05) { for (let t = 0; t < sec; t += step) { simTime += step; update(step); } return G.mode; },
  // для проверок: логика по таймеру, а не по кадрам (на сервере кадры приходят раз в несколько секунд)
  autotick(on = true) { clearInterval(KR._auto); KR.auto = on; if (on) KR._auto = setInterval(() => { simTime += 0.05; update(0.05); }, 50); return on; },
  // для проверок: дождаться, пока квартира соберётся и покажет первый кадр
  whenReady() { return new Promise((r) => { const t = setInterval(() => { if (KR.ready) { clearInterval(t); r(JSON.stringify(TIMING)); } }, 100); }); },
  // отладка: несколько ракурсов одним снимком. views: [{x, y, z, yaw, pitch}]
  grid(views, cols = 2) {
    const w = innerWidth, h = innerHeight, rows = Math.ceil(views.length / cols), cw = Math.floor(w / cols), ch = Math.floor(h / rows);
    let c = document.getElementById('kr-grid');
    if (!c) { c = document.createElement('canvas'); c.id = 'kr-grid'; c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:99999;pointer-events:none'; document.body.appendChild(c); }
    c.width = w; c.height = h; const g = c.getContext('2d');
    const keep = camera.position.clone(), keepR = camera.rotation.clone(), asp = camera.aspect;
    camera.aspect = cw / ch; camera.updateProjectionMatrix();
    renderer.setSize(cw, ch, false);
    views.forEach((v, i) => {
      camera.position.set(v.x, v.y == null ? 1.62 : v.y, v.z); camera.rotation.set(v.pitch || 0, v.yaw || 0, 0); camera.updateMatrixWorld();
      renderer.render(scene, camera);
      g.drawImage(renderer.domElement, (i % cols) * cw, Math.floor(i / cols) * ch, cw, ch);
      g.fillStyle = '#000'; g.font = '14px sans-serif'; g.fillText(v.label || String(i), (i % cols) * cw + 8, Math.floor(i / cols) * ch + 18);
    });
    renderer.setSize(w, h, false); camera.aspect = asp; camera.updateProjectionMatrix(); camera.position.copy(keep); camera.rotation.copy(keepR);
    return 'ok';
  },
};
