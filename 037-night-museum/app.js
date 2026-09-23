/* Ночной музей — игра: камера и управление, столкновения, фонарь, взаимодействие,
   опись похищенного, этикетки, план музея, часы до рассвета, финал, звук и адаптивное разрешение. */
(function () {
'use strict';
const NM = window.NM;
const W = NM.World, P = NM.Paint, A = NM.Audio;
const SHOT = !!window.__SHOT__;
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const ST = W.ST, T = W.T, MW = W.MW, MH = W.MH;
const REACH = 2.3;

// ---------- ночь и мир ----------
let night = 1;
try { const m = /night-(\d+)/.exec(location.hash); if (m) night = clamp(+m[1], 1, 999); } catch (e) { night = 1; }
const canvas = $('view');
let world = null, R = null;
try {
  world = W.build(night);
  R = NM.Render.create(canvas, world);
} catch (e) {
  R = null;
  console.error(e);
}
if (!R) { $('fatal').hidden = false; $('intro').hidden = true; return; }

const touchUI = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || false;
if (touchUI) document.body.classList.add('touchui');

// ---------- состояние ----------
const cam = { x: world.start.x, y: world.start.y, a: world.start.a, pitch: 0, z: W.EYE };
const vel = { x: 0, y: 0 };
let mode = 'intro';
let t = 0, gameMin = 0, walked = 0;
let uvOn = false, uvK = 0, battery = 1, uvHinted = false;
const flashDir = [1, 0, 0], flashPos = [0, 0, 0];
let bobAmp = 0, stepPhase = 0;
let finaleT = -1, finalShown = false, dawnBoost = 0;
let fade = SHOT ? 1 : 0, fadeTarget = 1, pendingTeleport = null;
let locked = false, ignoreUnlock = false, drag = null;
let mapOpen = false;
let returned = 0;
const keys = Object.create(null);
const viewed = new Set();
let focal = 800;
let aimDist = 3;
// режим съёмки: SwiftShader рисует кадр секундами, поэтому кадры — только по делу
let shotRenders = 0, shotDirty = false, shotInputT = 0, shotForce = false, shotWait = 0, lastFrameMs = 0, everDrawn = false, dead = false;
function fatal(e) {
  if (dead) return;
  dead = true;
  console.error(e);
  $('fatal').hidden = false;
}
const SHOT_T = 4.2;

// ---------- картины: очередь генерации, ближние первыми ----------
const specs = world.paintings;
const paintPos = new Array(specs.length);
for (const d of world.decals) { const c = (d.s0 + d.s1) / 2; paintPos[d.paint.layer] = d.axis === 0 ? [d.line, c] : [c, d.line]; }
for (const s of world.segs) if (s.kind === 'canvas') paintPos[s.paint] = [(s.ax + s.bx) / 2, (s.ay + s.by) / 2];
const queue = specs.map((s) => s.layer);
let current = null;
function finishPainting(spec, cv) {
  R.uploadPainting(spec, cv);
  spec.done = true;
  if (spec.master !== undefined) {
    spec.big = cv;
    onMasterReady(spec.master);
  }
}
// приоритет: картины в поле зрения и ближе — раньше; за спиной — позже
function priority(layer) {
  const p = paintPos[layer];
  if (!p) return 60;
  const dx = p[0] - cam.x, dy = p[1] - cam.y;
  const d = Math.hypot(dx, dy);
  const ahead = (dx * Math.cos(cam.a) + dy * Math.sin(cam.a)) / Math.max(d, 1e-3);
  let pr = d * (ahead > 0.45 ? 1 : ahead > 0 ? 1.8 : 3.2);
  if (specs[layer].master !== undefined) pr -= 6;
  return pr;
}
function takeNearest() {
  if (!initialDone) {
    for (const l of initialSet) { const i = queue.indexOf(l); if (i >= 0) return queue.splice(i, 1)[0]; }
  }
  let bi = 0, bd = 1e9;
  for (let i = 0; i < queue.length; i++) {
    const d = priority(queue[i]);
    if (d < bd) { bd = d; bi = i; }
  }
  return queue.splice(bi, 1)[0];
}
function pumpPaint(budget) {
  const t0 = performance.now();
  while (performance.now() - t0 < budget) {
    if (!current) {
      if (!queue.length) return;
      const spec = specs[takeNearest()];
      const cv = P.cpuCanvas(spec.size || P.SIZE, spec.size || P.SIZE);
      current = { spec, cv, it: P.steps(spec, cv) };
    }
    const r = current.it.next();
    if (r.done) { finishPainting(current.spec, current.cv); current = null; }
  }
}
function paintNow(layer) {
  const i = queue.indexOf(layer);
  if (i < 0) return;
  queue.splice(i, 1);
  const spec = specs[layer];
  finishPainting(spec, P.generate(spec));
}

// ---------- заставка: камера сама гуляет по залам ----------
const ATTRACT = [
  { x: 12.55, y: 15.35, a: 0.1, p: -0.03, aim: 0.42, ap: -0.03 },
  { x: 13.25, y: 15.3, a: 0.16, p: -0.03, aim: 0.36, ap: -0.02 },
  { x: 13.95, y: 15.2, a: 0.24, p: -0.02, aim: 0.3, ap: -0.01 },
  { x: 14.55, y: 15.05, a: 0.34, p: -0.02, aim: 0.22, ap: 0.0 },
];
const ATTRACT_T = 16;
let attractAim = { a: 0, p: 0 };
function attract(dt) {
  if (SHOT) {
    // обложка: выверенный ракурс вдоль южной стены Большого зала, луч — в центр пейзажа
    const narrow = innerWidth < innerHeight;
    cam.x = narrow ? 13.3 : 14.45; cam.y = narrow ? 15.4 : 15.72; cam.a = narrow ? 0.74 : 0.24; cam.pitch = narrow ? 0.3 : 0.0; cam.z = W.EYE;
    attractAim.a = narrow ? 0.0 : 0.25; attractAim.p = narrow ? -0.28 : 0.02;
    return;
  }
  const tt = t;
  const k = ((tt / ATTRACT_T) % 1) * (ATTRACT.length - 1) * 2;
  // туда и обратно по ключевым точкам
  let u = k > ATTRACT.length - 1 ? 2 * (ATTRACT.length - 1) - k : k;
  const i = Math.min(ATTRACT.length - 2, Math.floor(u));
  const f = u - i;
  const e = f * f * (3 - 2 * f);
  const a = ATTRACT[i], b = ATTRACT[i + 1];
  cam.x = lerp(a.x, b.x, e); cam.y = lerp(a.y, b.y, e);
  const narrow = innerWidth < innerHeight ? 0.42 : 0;
  cam.a = lerp(a.a, b.a, e) + Math.sin(tt * 0.21) * 0.03 + narrow;
  cam.pitch = lerp(a.p, b.p, e);
  cam.z = W.EYE + Math.sin(tt * 0.9) * 0.004;
  attractAim.a = lerp(a.aim, b.aim, e) * (narrow ? 0.25 : 1) + Math.sin(tt * 0.37) * 0.08;
  attractAim.p = lerp(a.ap, b.ap, e) + Math.sin(tt * 0.29) * 0.03;
}

// ---------- ввод ----------
function poke() { shotDirty = true; shotInputT = performance.now(); }
addEventListener('keydown', poke, true);
addEventListener('keyup', poke, true);
addEventListener('pointerdown', poke, true);
addEventListener('keydown', (e) => {
  const c = e.code;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(c)) e.preventDefault();
  if (e.repeat && (c === 'KeyE' || c === 'KeyF' || c === 'KeyM')) return;
  keys[c] = true;
  if (mode === 'intro') { if (c === 'Enter') start(); return; }
  if (mode === 'pause') { if (c === 'Escape' || c === 'Enter') resume(); return; }
  if (mode !== 'play') return;
  if (c === 'KeyE') interact();
  else if (c === 'KeyF') toggleUV();
  else if (c === 'KeyM' || c === 'Tab') { e.preventDefault(); toggleMap(); }
  else if (c === 'Escape') { if (mapOpen) toggleMap(false); else if (!locked) pause(); }
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

function lock() {
  if (touchUI || !canvas.requestPointerLock) return;
  try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* без захвата — работает перетаскивание */ }
}
document.addEventListener('pointerlockchange', () => {
  const was = locked;
  locked = document.pointerLockElement === canvas;
  document.body.classList.toggle('locked', locked);
  if (was && !locked && mode === 'play' && !ignoreUnlock) pause();
  ignoreUnlock = false;
});
document.addEventListener('pointerlockerror', () => {});
function look(dx, dy) {
  cam.a += dx * 0.0024;
  cam.pitch = clamp(cam.pitch - dy * 0.0021, -0.62, 0.62);
}
canvas.addEventListener('mousedown', (e) => {
  if (mode !== 'play' || touchUI) return;
  if (!locked) { lock(); drag = { x: e.clientX, y: e.clientY }; return; }
  if (e.button === 0) interact();
  else if (e.button === 2) toggleUV();
});
addEventListener('mousemove', (e) => {
  if (mode !== 'play' || touchUI) return;
  if (locked) look(e.movementX || 0, e.movementY || 0);
  else if (drag && (e.buttons & 1)) { look(e.clientX - drag.x, e.clientY - drag.y); drag.x = e.clientX; drag.y = e.clientY; }
});
addEventListener('mouseup', () => { drag = null; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// сенсорное управление: джойстик слева, взгляд — перетаскиванием по сцене
const stick = { id: null, x: 0, y: 0, vx: 0, vy: 0 };
const lookT = { id: null, x: 0, y: 0 };
$('stick').addEventListener('pointerdown', (e) => {
  stick.id = e.pointerId;
  const r = $('stick').getBoundingClientRect();
  stick.x = r.left + r.width / 2; stick.y = r.top + r.height / 2;
  $('stick').setPointerCapture(e.pointerId);
  moveStick(e);
});
function moveStick(e) {
  if (e.pointerId !== stick.id) return;
  let dx = (e.clientX - stick.x) / 50, dy = (e.clientY - stick.y) / 50;
  const l = Math.hypot(dx, dy);
  if (l > 1) { dx /= l; dy /= l; }
  stick.vx = dx; stick.vy = dy;
  $('knob').style.transform = 'translate(' + (dx * 36).toFixed(1) + 'px,' + (dy * 36).toFixed(1) + 'px)';
}
$('stick').addEventListener('pointermove', moveStick);
const endStick = (e) => { if (e.pointerId !== stick.id) return; stick.id = null; stick.vx = stick.vy = 0; $('knob').style.transform = ''; };
$('stick').addEventListener('pointerup', endStick);
$('stick').addEventListener('pointercancel', endStick);
canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'touch' || mode !== 'play') return;
  lookT.id = e.pointerId; lookT.x = e.clientX; lookT.y = e.clientY;
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId !== lookT.id) return;
  look((e.clientX - lookT.x) * 1.5, (e.clientY - lookT.y) * 1.3);
  lookT.x = e.clientX; lookT.y = e.clientY;
});
const endLook = (e) => { if (e.pointerId === lookT.id) lookT.id = null; };
canvas.addEventListener('pointerup', endLook);
canvas.addEventListener('pointercancel', endLook);
$('tTake').addEventListener('click', () => interact());
$('tUV').addEventListener('click', () => toggleUV());

// кнопки
$('btnStart').addEventListener('click', start);
$('btnResume').addEventListener('click', resume);
$('btnMenu').addEventListener('click', () => pause());
$('btnMap').addEventListener('click', () => toggleMap());
$('mapCard').addEventListener('click', () => toggleMap(true));
$('mapClose').addEventListener('click', () => toggleMap(false));
$('bigMap').addEventListener('click', (e) => { if (e.target === $('bigMap')) toggleMap(false); });
$('btnUV').addEventListener('click', () => toggleUV());
$('btnSound').addEventListener('click', () => {
  const on = A.muted;
  A.setMuted(!on);
  $('btnSound').setAttribute('aria-pressed', String(on));
});
const newNight = () => { try { location.hash = 'night-' + (night + 1); location.reload(); } catch (e) { location.reload(); } };
$('btnNewNight').addEventListener('click', newNight);
$('btnNewNight2').addEventListener('click', newNight);
$('btnStay').addEventListener('click', () => { $('final').hidden = true; mode = 'play'; lock(); });

function start() {
  if (mode !== 'intro') return;
  A.init();
  mode = 'play';
  document.body.classList.add('playing');
  $('intro').classList.add('gone');
  $('hud').classList.add('on');
  if (SHOT) {
    // съёмка: без затемнения, сразу на старт
    cam.x = world.start.x; cam.y = world.start.y; cam.a = world.start.a; cam.pitch = 0;
    flashDir[0] = Math.cos(cam.a); flashDir[1] = Math.sin(cam.a); flashDir[2] = -0.05;
    shotForce = true;
  } else {
    fadeTarget = 0;
    pendingTeleport = { x: world.start.x, y: world.start.y, a: world.start.a };
  }
  lock();
  setTimeout(() => toast('Ночь ' + night + ' · 02:14', 'Вестибюль', 'Двери заперты до утра. Семь полотен где-то в этих залах.', 4.2), 700);
}
function pause() {
  if (mode !== 'play') return;
  mode = 'pause';
  fillStats($('pauseStats'));
  $('pause').hidden = false;
  if (locked) { ignoreUnlock = true; document.exitPointerLock && document.exitPointerLock(); }
}
function resume() {
  if (mode !== 'pause') return;
  mode = 'play';
  $('pause').hidden = true;
  lock();
}

// ---------- движение и столкновения ----------
const colliders = [];
for (const S of world.sprites) if (S.solid) colliders.push({ x: S.x, y: S.y, r: S.solid });
for (const s of world.segs) if (s.kind === 'easel') colliders.push({ x: (s.ax + s.bx) / 2, y: (s.ay + s.by) / 2, r: 0.3 });
function solid(cx, cy) {
  if (cx < 0 || cy < 0 || cx >= MW || cy >= MH) return true;
  return world.g.type[cy * MW + cx] >= T.WALL;
}
function collide(p) {
  const r = 0.21;
  for (let it = 0; it < 3; it++) {
    const x0 = Math.floor(p.x - r), x1 = Math.floor(p.x + r), y0 = Math.floor(p.y - r), y1 = Math.floor(p.y + r);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      if (!solid(cx, cy)) continue;
      const qx = clamp(p.x, cx, cx + 1), qy = clamp(p.y, cy, cy + 1);
      const dx = p.x - qx, dy = p.y - qy, d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;
      if (d2 < 1e-10) {
        const ox = Math.min(p.x - cx, cx + 1 - p.x), oy = Math.min(p.y - cy, cy + 1 - p.y);
        if (ox < oy) p.x = p.x - cx < 0.5 ? cx - r : cx + 1 + r; else p.y = p.y - cy < 0.5 ? cy - r : cy + 1 + r;
        continue;
      }
      const d = Math.sqrt(d2);
      p.x += dx / d * (r - d); p.y += dy / d * (r - d);
    }
    for (const c of colliders) {
      const dx = p.x - c.x, dy = p.y - c.y, rr = r + c.r, d2 = dx * dx + dy * dy;
      if (d2 < rr * rr && d2 > 1e-10) { const d = Math.sqrt(d2); p.x += dx / d * (rr - d); p.y += dy / d * (rr - d); }
    }
  }
}
function floorMatAt(x, y) {
  const i = Math.floor(y) * MW + Math.floor(x);
  const h = world.g.hall[i];
  const hall = W.HALLS[h];
  const onRunner = (Math.abs(y - 21.5) < 0.34 && [1, 4, 5, 7, 8].includes(h)) || (h === 1 && Math.abs(x - 18.5) < 0.34 && y > 18);
  if (onRunner) return 9;
  if (world.g.type[i] === T.DOOR) return 5;
  return hall ? hall.floor : 0;
}
function move(dt) {
  let f = 0, s = 0, turn = 0;
  if (keys.KeyW || keys.ArrowUp) f += 1;
  if (keys.KeyS || keys.ArrowDown) f -= 1;
  if (keys.KeyD) s += 1;
  if (keys.KeyA) s -= 1;
  if (keys.ArrowRight || keys.KeyL) turn += 1;
  if (keys.ArrowLeft || keys.KeyJ) turn -= 1;
  f -= stick.vy; s += stick.vx;
  cam.a += turn * 2.1 * dt;
  const run = keys.ShiftLeft || keys.ShiftRight;
  const sp = run ? 2.55 : 1.55;
  const dx = Math.cos(cam.a), dy = Math.sin(cam.a);
  let tx = dx * f - dy * s, ty = dy * f + dx * s;
  const l = Math.hypot(tx, ty);
  if (l > 1) { tx /= l; ty /= l; }
  const k = 1 - Math.exp(-dt * 9);
  vel.x += (tx * sp - vel.x) * k; vel.y += (ty * sp - vel.y) * k;
  const p = { x: cam.x + vel.x * dt, y: cam.y + vel.y * dt };
  collide(p);
  const moved = Math.hypot(p.x - cam.x, p.y - cam.y);
  walked += moved;
  cam.x = p.x; cam.y = p.y;
  // покачивание шага и звук шагов в нижней точке
  const speed = moved / Math.max(dt, 1e-4);
  bobAmp = lerp(bobAmp, clamp(speed / 1.55, 0, 1.5), 1 - Math.exp(-dt * 7));
  const prev = stepPhase;
  if (bobAmp > 0.04) stepPhase += dt * (4.6 + speed * 1.3);
  if (Math.floor(prev / Math.PI) !== Math.floor(stepPhase / Math.PI) && bobAmp > 0.3) {
    const h = world.g.hall[Math.floor(cam.y) * MW + Math.floor(cam.x)];
    A.step(floorMatAt(cam.x, cam.y), clamp(bobAmp - 0.3, 0, 1), h === 2 || h === 1);
  }
  cam.z = W.EYE + (Math.abs(Math.sin(stepPhase)) - 0.6) * 0.02 * bobAmp;
}

// ---------- фонарь ----------
function updateFlash(dt, aimA, aimP) {
  const ca = Math.cos(cam.a), sa = Math.sin(cam.a);
  const rx = -sa, ry = ca;
  // луч чуть отстаёт от взгляда и покачивается в такт шагам
  const sway = Math.sin(stepPhase) * 0.012 * bobAmp;
  flashPos[0] = cam.x + rx * (0.15 + sway) + ca * 0.06;
  flashPos[1] = cam.y + ry * (0.15 + sway) + sa * 0.06;
  flashPos[2] = cam.z - 0.16 + Math.abs(Math.cos(stepPhase)) * 0.008 * bobAmp;
  const va = cam.a + aimA, vp = cam.pitch + aimP;
  const vx = Math.cos(va), vy = Math.sin(va), vz = vp;
  const vl = Math.hypot(vx, vy, vz);
  const D = Math.max(1.1, aimDist);
  const tx = cam.x + vx / vl * D, ty = cam.y + vy / vl * D, tz = cam.z + vz / vl * D;
  let dx = tx - flashPos[0], dy = ty - flashPos[1], dz = tz - flashPos[2];
  const dl = Math.hypot(dx, dy, dz);
  dx /= dl; dy /= dl; dz /= dl;
  const breath = 0.006;
  dx += Math.sin(t * 0.7) * breath; dz += Math.sin(t * 0.53 + 1) * breath;
  const k = SHOT ? 1 : 1 - Math.exp(-dt * 11);
  flashDir[0] += (dx - flashDir[0]) * k; flashDir[1] += (dy - flashDir[1]) * k; flashDir[2] += (dz - flashDir[2]) * k;
  const fl = Math.hypot(flashDir[0], flashDir[1], flashDir[2]);
  flashDir[0] /= fl; flashDir[1] /= fl; flashDir[2] /= fl;
}
function toggleUV(force) {
  if (mode !== 'play') return;
  const on = force !== undefined ? force : !uvOn;
  if (on === uvOn) return;
  if (on && battery < 0.1) { A.denied(); flashHint('УФ-лампа остывает, подождите пару секунд'); return; }
  uvOn = on;
  A.uv(on);
  $('btnUV').setAttribute('aria-pressed', String(on));
  $('tUV').classList.toggle('on', on);
  if (on && !uvHinted) {
    uvHinted = true;
    toast('Ультрафиолет', 'Следы светятся', 'Подошвы вора в реставрационном лаке: в УФ его шаги видны на полу.', 4.5);
  }
}

// ---------- взаимодействие ----------
const OBJECTS = {
  bust: { author: 'Неизвестный скульптор', life: 'конец XVIII века', title: 'Бюст философа', year: '', medium: 'Мрамор' },
  bust2: { author: 'Неизвестный скульптор', life: 'начало XIX века', title: 'Бюст поэта', year: '', medium: 'Мрамор' },
  bust3: { author: 'Неизвестный скульптор', life: 'XIX век', title: 'Бюст дамы', year: '', medium: 'Мрамор' },
  bust4: { author: 'Неизвестный скульптор', life: 'XIX век', title: 'Бюст полководца', year: '', medium: 'Мрамор' },
  clock: { author: 'Часовая мастерская', life: 'середина XIX века', title: 'Напольные часы', year: '', medium: 'Красное дерево, латунь', note: 'Идут и отбивают каждый час.' },
  rope: { author: 'Улика', life: '', title: 'Верёвка из разбитого фонаря', year: '', medium: 'Пенька', note: 'Здесь вор спустился в зал. Под ногами блестят осколки стекла.' },
  ship: { author: 'Модельная мастерская', life: '1840-е годы', title: 'Модель трёхмачтового фрегата', year: '', medium: 'Дерево, ткань, стекло' },
  urn: { author: 'Неизвестный мастер', life: 'XIX век', title: 'Ваза с ручками-волютами', year: '', medium: 'Мрамор' },
  sculpt: { author: 'Вера Мезенцева', life: '1889–1941', title: 'Пространственная форма', year: '1922', medium: 'Бронза' },
};
const hallName = (id) => (W.HALLS[id] ? W.HALLS[id].name : '');
const hallLabel = (id) => { const h = W.HALLS[id]; return h ? (h.num ? 'зал ' + h.num + ', «' + h.name + '»' : '«' + h.name + '»') : ''; };
const hallFrom = (id) => { const h = W.HALLS[id]; return h ? (h.num ? 'зала ' + h.num + ' «' + h.name + '»' : '«' + h.name + '»') : ''; };
function plural(n, one, few, many) {
  const a = n % 10, b = n % 100;
  if (a === 1 && b !== 11) return one;
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
  return many;
}
function targetInfo(pr) {
  if (!pr) return null;
  const dist = pr.dist;
  if (pr.type === 'decal') {
    const d = pr.decal;
    if (d.state === ST.GONE) return null;
    if (d.state === ST.INTRUDER) {
      const S = world.stolen[d.intruder];
      return { key: 'd' + d.id, spec: S.paint, info: S.paint.info, stamp: 'found', stampText: 'Нашли', dist,
        note: 'Висит без рамы, не на своём месте. Это полотно из ' + hallFrom(S.decal.hall) + '.',
        prompt: dist < REACH ? 'снять полотно' : null, act: () => take(S) };
    }
    const spec = d.paint;
    if (d.state === ST.EMPTY) {
      const S = world.stolen[spec.master];
      const carrying = S.state === 'carried';
      return { key: 'd' + d.id, spec, info: spec.info, stamp: 'stolen', stampText: 'Похищено', dist, frame: true,
        note: carrying ? 'Полотно у вас — верните его в раму.' : 'Холст вырезан из рамы и спрятан где-то в музее.',
        prompt: carrying && dist < REACH ? 'вернуть в раму' : null, act: carrying ? () => rehang(S) : null };
    }
    if (d.state === ST.RETURNED) return { key: 'd' + d.id, spec, info: spec.info, dist, note: 'Возвращено этой ночью.' };
    return { key: 'd' + d.id, spec, info: spec.info, dist, note: '' };
  }
  if (pr.type === 'seg') {
    const s = pr.seg;
    const spec = specs[s.paint];
    if (s.stolen >= 0) {
      const S = world.stolen[s.stolen];
      return { key: 's' + pr.idx, spec, info: spec.info, stamp: 'found', stampText: 'Нашли', dist,
        note: 'Похищено из ' + hallFrom(S.decal.hall) + '. Пустая рама ждёт.', prompt: dist < REACH ? 'взять полотно' : null, act: () => take(S) };
    }
    return { key: 's' + pr.idx, spec, info: spec.info, dist, note: spec.info.note || '' };
  }
  if (pr.type === 'sprite') {
    const o = OBJECTS[pr.sprite.info];
    if (!o || dist > 3.2) return null;
    return { key: 'o' + pr.sprite.info, info: o, dist, note: o.note || '', obj: true };
  }
  return null;
}
let target = null;
function interact() {
  if (mode !== 'play') return;
  if (target && target.act && target.prompt) target.act();
  else if (target && target.frame) { A.denied(); flashHint('Сначала найдите это полотно'); }
}
function take(S) {
  if (S.state !== 'hidden') return;
  S.state = 'carried';
  if (S.obj != null && S.obj >= 0) world.segs[S.obj].hidden = true;
  if (S.hungDecal) S.hungDecal.state = ST.GONE;
  A.pickup();
  S.known = true;
  renderSlots(S.k);
  const h = W.HALLS[S.decal.hall];
  toast('Находка · ' + S.n, '«' + S.paint.info.title + '»', 'Верните в раму: ' + (h ? 'зал ' + h.num + ', «' + h.name + '»' : '') + '.', 3.8);
  target = null;
}
function rehang(S) {
  if (S.state !== 'carried') return;
  S.state = 'returned';
  S.decal.state = ST.RETURNED;
  returned++;
  A.rehang();
  renderSlots(S.k);
  const left = 7 - returned;
  if (left) toast('На месте · ' + S.n, '«' + S.paint.info.title + '»', 'Осталось вернуть ' + left + ' ' + plural(left, 'картину', 'картины', 'картин') + '.', 3.6);
  else { toast('Все семь на месте', 'Коллекция цела', 'Над картинами горят лампы. Светает.', 4.5); finaleT = 0; A.finale(); }
  target = null;
}

// ---------- HUD ----------
const slotEls = [];
function buildSlots() {
  const ol = $('slots');
  world.stolen.forEach((S) => {
    const li = document.createElement('li');
    li.className = 'slot';
    li.title = S.paint.info.title;
    li.innerHTML = '<span>' + S.n + '</span><canvas width="92" height="72"></canvas><i class="tick"><svg viewBox="0 0 14 14"><path d="M3 7.5l2.6 2.4L11 4.5"/></svg></i>';
    ol.appendChild(li);
    slotEls.push(li);
  });
}
function coverDraw(cv, src, aspect) {
  const g = cv.getContext('2d');
  const sw = src.width, sh = src.height;
  // исходник квадратный (растянут по пропорции картины), вырезаем центр под пропорцию слота
  const slotA = cv.width / cv.height;
  let uw = 1, vh = 1;
  if (aspect > slotA) uw = slotA / aspect; else vh = aspect / slotA;
  g.drawImage(src, (1 - uw) / 2 * sw, (1 - vh) / 2 * sh, uw * sw, vh * sh, 0, 0, cv.width, cv.height);
}
function renderSlots(k) {
  world.stolen.forEach((S, i) => {
    const li = slotEls[i];
    li.classList.toggle('carried', S.state === 'carried');
    li.classList.toggle('returned', S.state === 'returned');
    if (S.paint.big && !li.dataset.drawn) { coverDraw(li.querySelector('canvas'), S.paint.big, S.paint.aspect); li.dataset.drawn = '1'; }
    if (i === k) { li.classList.remove('pulse'); void li.offsetWidth; li.classList.add('pulse'); }
  });
  const done = world.stolen.filter((S) => S.state === 'returned').length;
  const got = world.stolen.filter((S) => S.state !== 'hidden').length;
  $('invCount').textContent = done + ' / 7' + (got > done ? ' · в руках ' + (got - done) : '');
}
function onMasterReady(k) {
  const S = world.stolen[k];
  // миниатюра на заставке
  const li = $('lostRow').children[k];
  if (li && !li.dataset.drawn) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const h = touchUI || innerWidth < 760 ? 30 : 46;
    const th = P.thumb(S.paint.big, S.paint.aspect, h, dpr);
    th.style.height = h + 'px';
    li.querySelector('.fr').appendChild(th);
    li.dataset.drawn = '1';
  }
  const sl = slotEls[k];
  if (sl && !sl.dataset.drawn && S.paint.big) { coverDraw(sl.querySelector('canvas'), S.paint.big, S.paint.aspect); sl.dataset.drawn = '1'; }
}
function buildIntroRow() {
  const ol = $('lostRow');
  world.stolen.forEach((S) => {
    const li = document.createElement('li');
    li.title = '«' + S.paint.info.title + '» — ' + S.paint.info.author;
    li.innerHTML = '<div class="fr"></div><span class="num">' + S.n + '</span>';
    ol.appendChild(li);
  });
}

// этикетка: появляется, когда луч задержался на картине
let labelKey = null, candKey = null, candT = 0, loseT = 0;
function showLabel(ti) {
  const el = $('label');
  el.classList.toggle('stolen', ti.stamp === 'stolen');
  el.classList.toggle('found', ti.stamp === 'found');
  $('stamp').textContent = ti.stampText || '';
  $('lAuthor').textContent = ti.info.author || '';
  $('lLife').textContent = ti.info.life || '';
  $('lTitle').textContent = ti.info.title || '';
  $('lMeta').textContent = [ti.info.year, ti.info.medium].filter(Boolean).join(' · ') + (ti.info.inv ? ' · ' + ti.info.inv : '');
  $('lNote').textContent = ti.note || '';
  el.hidden = false;
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
}
function updateTarget(dt) {
  const pr = R.probe(cam);
  aimDist = pr ? pr.dist * Math.hypot(1, cam.pitch) : 6;
  const ti = targetInfo(pr);
  target = ti && ti.dist < (ti.obj ? 3.2 : 4.4) ? ti : null;
  // «осмотрено»: картина, на которой луч задержался
  if (target && target.spec && target.dist < 4) {
    target.spec._look = (target.spec._look || 0) + dt;
    if (target.spec._look > 0.7) viewed.add(target.spec.layer);
  }
  const key = target ? target.key + (target.stamp || '') + (target.prompt || '') + (target.note || '') : null;
  if (key && key !== labelKey) {
    if (key === candKey) candT += dt; else { candKey = key; candT = 0; }
    if (candT > 0.18 || (labelKey && key.slice(0, 4) === labelKey.slice(0, 4))) { showLabel(target); labelKey = key; loseT = 0; }
  } else if (!key && labelKey) {
    loseT += dt;
    if (loseT > 0.45) { $('label').hidden = true; labelKey = null; candKey = null; }
  } else loseT = 0;
  const pe = $('prompt');
  if (target && target.prompt) {
    $('promptText').textContent = target.prompt;
    $('promptKey').textContent = touchUI ? '●' : 'E';
    if (pe.hidden) pe.hidden = false;
  } else if (!pe.hidden) pe.hidden = true;
  $('tTake').classList.toggle('on', !!(target && target.prompt));
}

// тосты
const toasts = [];
let toastT = 0, toastOn = false;
function toast(kick, title, sub, dur) {
  if (toasts.length && toasts[toasts.length - 1].title === title) return;
  toasts.push({ kick, title, sub, dur: dur || 2.8 });
}
function updateToast(dt) {
  toastT -= dt;
  if (toastOn && toastT <= 0) { $('toast').classList.remove('on'); toastOn = false; toastT = 0.5; return; }
  if (!toastOn && toastT <= 0 && toasts.length) {
    const q = toasts.shift();
    $('tKick').textContent = q.kick; $('tTitle').textContent = q.title; $('tSub').textContent = q.sub || '';
    $('toast').classList.add('on'); toastOn = true; toastT = q.dur;
  }
}
let hintT = 0;
function flashHint(text) { $('hint').textContent = text; $('hint').classList.add('on'); hintT = 2.4; }

// залы
let lastHall = -1;
const hallSeenAt = {};
function checkHall() {
  const h = world.g.hall[Math.floor(cam.y) * MW + Math.floor(cam.x)];
  if (!h || h === lastHall) return;
  lastHall = h;
  if (hallSeenAt[h] && t - hallSeenAt[h] < 40) return;
  hallSeenAt[h] = t;
  const H = W.HALLS[h];
  toast(H.num ? 'Зал ' + H.num : 'Служебное помещение', H.name, H.sub);
}

// часы: 02:14 → рассвет в 06:00; одна игровая минута — 2,5 с
let lastMinute = -1, lastHour = 2, tickAcc = 0;
function clockText() {
  const total = 134 + gameMin;
  const hh = Math.floor(total / 60) % 24, mm = Math.floor(total % 60);
  return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
}
function updateClock(dt) {
  if (mode === 'play' && finaleT < 0) gameMin += dt * 0.4;
  const total = 134 + gameMin;
  const m = Math.floor(total);
  if (m !== lastMinute) {
    lastMinute = m;
    $('clock').textContent = clockText();
    const left = Math.max(0, 360 - total);
    $('clockSub').textContent = left > 0 ? 'до рассвета ' + (left >= 60 ? Math.floor(left / 60) + ' ч ' : '') + Math.floor(left % 60) + ' мин' : 'светает';
  }
  const hr = Math.floor(total / 60);
  if (hr !== lastHour && mode === 'play') {
    lastHour = hr;
    const d = Math.hypot(cam.x - 21.62, cam.y - 22.2);
    A.chime(((hr - 1) % 12) + 1, 1 / (1 + d * d * 0.02));
  }
  tickAcc += dt;
  if (tickAcc > 1) {
    tickAcc -= 1;
    const d = Math.hypot(cam.x - 21.62, cam.y - 22.2);
    if (mode === 'play' && d < 14) A.tick(1 / (1 + d * d * 0.09));
  }
}

// ---------- план музея ----------
const mini = $('minimap'), big = $('bigmapCanvas');
function sizeMaps() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  mini.width = Math.round(222 * dpr); mini.height = Math.round(162 * dpr);
  const bw = Math.min(740, innerWidth - 60);
  big.width = Math.round(bw * dpr); big.height = Math.round(bw * 27 / 37 * dpr);
}
function knownFrames() {
  for (const S of world.stolen) {
    if (S.known || S.state !== 'hidden') continue;
    const d = S.decal;
    const c = (d.s0 + d.s1) / 2;
    const x = d.axis === 0 ? d.line + d.sign * 0.5 : c, y = d.axis === 0 ? c : d.line + d.sign * 0.5;
    if (R.seen[Math.floor(y) * MW + Math.floor(x)] && Math.hypot(x - cam.x, y - cam.y) < 5) S.known = true;
  }
}
function drawMap(cv, isBig) {
  const g = cv.getContext('2d');
  const w = cv.width, h = cv.height;
  const s = Math.min(w / MW, h / MH);
  const ox = (w - s * MW) / 2, oy = (h - s * MH) / 2;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = '#ede5d3'; g.fillRect(0, 0, w, h);
  g.setTransform(s, 0, 0, s, ox, oy);
  const seen = R.seen, type = world.g.type;
  // пол открытых клеток
  g.fillStyle = '#f8f3e7';
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const i = y * MW + x;
    if (seen[i] && (type[i] === T.FLOOR || type[i] === T.DOOR)) g.fillRect(x - 0.02, y - 0.02, 1.04, 1.04);
  }
  // стены рядом с увиденным
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const i = y * MW + x;
    if (type[i] < T.WALL) continue;
    let near = false;
    for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1 && !near; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= MW || yy >= MH) continue;
      const j = yy * MW + xx;
      if (seen[j] && (type[j] === T.FLOOR || type[j] === T.DOOR)) near = true;
    }
    if (!near) {
      // неразведанное — бледной линией, как на плане для посетителей
      g.fillStyle = '#d6cbb3';
      g.fillRect(x - 0.01, y - 0.01, 1.02, 1.02);
      continue;
    }
    if (type[i] === T.WINDOW) { g.fillStyle = '#b9c7dc'; g.fillRect(x, y, 1, 1); g.fillStyle = '#6f8fbf'; g.fillRect(x + 0.1, y + 0.4, 0.8, 0.2); }
    else if (type[i] === T.SHELF) { g.fillStyle = '#8a7a64'; g.fillRect(x + 0.1, y + 0.1, 0.8, 0.8); }
    else if (type[i] === T.PILLAR) { g.fillStyle = '#2b241c'; g.fillRect(x + 0.15, y + 0.15, 0.7, 0.7); }
    else { g.fillStyle = '#2b241c'; g.fillRect(x, y, 1, 1); }
  }
  // номера залов
  if (isBig) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 1; i < W.HALLS.length; i++) {
      const H = W.HALLS[i];
      const [x0, y0, x1, y1] = H.rect;
      const cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2;
      if (!seen[Math.floor(cy) * MW + Math.floor(cx)] && !seen[y0 * MW + x0]) continue;
      g.fillStyle = 'rgba(122,90,30,0.95)';
      g.font = Math.round(s * 0.95) + 'px "Bona Nova", Georgia, serif';
      g.fillText(H.num || '·', ox + cx * s, oy + (cy - 0.45) * s);
      g.fillStyle = 'rgba(58,50,40,0.85)';
      g.font = Math.round(Math.max(11 * (w / 740), s * 0.42)) + 'px "Ysabeau Office", Arial, sans-serif';
      g.fillText(H.name, ox + cx * s, oy + (cy + 0.55) * s);
    }
    g.setTransform(s, 0, 0, s, ox, oy);
  }
  // рамы украденных картин
  for (const S of world.stolen) {
    const d = S.decal;
    if (!S.known && S.state === 'hidden') continue;
    const c = (d.s0 + d.s1) / 2;
    const x = d.axis === 0 ? d.line + d.sign * 0.22 : c, y = d.axis === 0 ? c : d.line + d.sign * 0.22;
    const rw = d.axis === 0 ? 0.26 : (d.s1 - d.s0), rh = d.axis === 0 ? (d.s1 - d.s0) : 0.26;
    if (S.state === 'returned') { g.fillStyle = '#c9a45a'; g.fillRect(x - rw / 2, y - rh / 2, rw, rh); }
    else { g.strokeStyle = '#b63a2b'; g.lineWidth = 0.14; g.strokeRect(x - rw / 2, y - rh / 2, rw, rh); }
  }
  // игрок и конус фонаря
  g.fillStyle = uvOn ? 'rgba(120,80,220,0.22)' : 'rgba(201,164,90,0.3)';
  g.beginPath(); g.moveTo(cam.x, cam.y);
  g.arc(cam.x, cam.y, 3.2, cam.a - 0.42, cam.a + 0.42); g.closePath(); g.fill();
  g.save();
  g.translate(cam.x, cam.y); g.rotate(cam.a);
  g.fillStyle = '#b63a2b';
  g.beginPath(); g.moveTo(0.62, 0); g.lineTo(-0.38, 0.36); g.lineTo(-0.18, 0); g.lineTo(-0.38, -0.36); g.closePath(); g.fill();
  g.restore();
  g.setTransform(1, 0, 0, 1, 0, 0);
}
function toggleMap(force) {
  if (mode !== 'play') return;
  mapOpen = force !== undefined ? force : !mapOpen;
  $('bigMap').hidden = !mapOpen;
  if (mapOpen) drawMap(big, true);
}

// ---------- статистика и финал ----------
function fillStats(dl) {
  const found = world.stolen.filter((S) => S.state !== 'hidden').length;
  const total = world.decals.length + world.segs.filter((s) => s.kind === 'canvas' && s.stolen < 0).length;
  const rows = [
    ['Время', clockText()],
    ['Найдено', found + ' из 7'],
    ['На местах', returned + ' из 7'],
    ['Осмотрено картин', viewed.size + ' из ' + total],
    ['Пройдено', Math.round(walked * 2.4) + ' м'],
    ['Ночь', String(night)],
  ];
  dl.innerHTML = '';
  for (const [a, b] of rows) {
    const d = document.createElement('div');
    d.innerHTML = '<dt></dt><dd></dd>';
    d.firstChild.textContent = a; d.lastChild.textContent = b;
    dl.appendChild(d);
  }
}
function showFinal() {
  finalShown = true;
  mode = 'final';
  $('finalLead').textContent = 'Семь полотен снова в рамах к ' + clockText() + '. Над каждой горит лампа, в окнах светлеет. Вор ушёл через крышу с пустыми руками.';
  const ol = $('finalRow');
  ol.innerHTML = '';
  for (const S of world.stolen) {
    const li = document.createElement('li');
    const fr = document.createElement('div'); fr.className = 'fr';
    if (S.paint.big) { const th = P.thumb(S.paint.big, S.paint.aspect, 60, Math.min(2, window.devicePixelRatio || 1)); th.style.height = '60px'; fr.appendChild(th); }
    const sp = document.createElement('span'); sp.textContent = S.n + '. «' + S.paint.info.title + '»';
    li.appendChild(fr); li.appendChild(sp); ol.appendChild(li);
  }
  fillStats($('finalStats'));
  $('final').hidden = false;
  if (locked) { ignoreUnlock = true; document.exitPointerLock && document.exitPointerLock(); }
}

// ---------- свет для шейдера ----------
function buildLights() {
  const L = [];
  for (const S of world.stolen) {
    const d = S.decal;
    if (d.state !== ST.RETURNED && !(dawnBoost > 0.3 && d.state === ST.RETURNED)) continue;
    const nx = d.axis === 0 ? d.sign : 0, ny = d.axis === 1 ? d.sign : 0;
    const c = (d.s0 + d.s1) / 2;
    const wx = d.axis === 0 ? d.line : c, wy = d.axis === 0 ? c : d.line;
    const lz = d.z1 + W.FRAME_W[d.frame] + 0.1;
    const px = wx + nx * 0.3, py = wy + ny * 0.3;
    const tz = (d.z0 + d.z1) / 2 - 0.1;
    let dx = wx - px, dy = wy - py, dz = tz - lz;
    const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
    const k = 1.35 + (d.s1 - d.s0) * 0.4;
    L.push({ x: px, y: py, z: lz, r: 1.6 + (d.s1 - d.s0) * 0.6, cr: 2.1 * k, cg: 1.55 * k, cb: 0.95 * k, dx, dy, dz, cos: 0.42 });
  }
  for (const e of world.exitLights) L.push({ x: e.x, y: e.y, z: e.z, r: 1.5, cr: 0.05, cg: 0.42, cb: 0.2, dx: 0, dy: 0, dz: -1, cos: -2 });
  for (const l of L) l.d2 = (l.x - cam.x) ** 2 + (l.y - cam.y) ** 2;
  L.sort((a, b) => a.d2 - b.d2);
  return L.filter((l) => l.d2 < 150).slice(0, 10);
}
const aoAll = [];
for (const S of world.sprites) if (S.solid) aoAll.push([S.x, S.y, S.solid * 2.4, 0.5]);
for (const s of world.segs) {
  if (s.kind === 'easel') aoAll.push([(s.ax + s.bx) / 2, (s.ay + s.by) / 2, 0.55, 0.4]);
  if (s.kind === 'canvas' && !s.easel) aoAll.push([(s.ax + s.bx) / 2, (s.ay + s.by) / 2, 0.5, 0.35, s]);
}
function buildAO() {
  const out = [];
  for (const a of aoAll) { if (a[4] && a[4].hidden) continue; out.push(a); }
  out.sort((p, q) => ((p[0] - cam.x) ** 2 + (p[1] - cam.y) ** 2) - ((q[0] - cam.x) ** 2 + (q[1] - cam.y) ** 2));
  return out.slice(0, 12).map((a) => [a[0], a[1], a[2], a[3]]);
}

// ---------- разрешение ----------
let scale = SHOT ? 1 : 0.9;
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, SHOT ? 1 : 1.5) * scale;
  const w = Math.max(320, Math.round(innerWidth * dpr)), h = Math.max(240, Math.round(innerHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  focal = Math.min((h / 2) / Math.tan(27 * Math.PI / 180), (w / 2) / Math.tan(31 * Math.PI / 180));
  sizeMaps();
}
addEventListener('resize', resize);
let ftAcc = 0, ftN = 0, goodT = 0;
function adapt(dt) {
  if (SHOT) return;
  ftAcc += dt; ftN++;
  if (ftN < 24) return;
  const avg = ftAcc / ftN;
  ftAcc = 0; ftN = 0;
  if (avg > 1 / 40 && scale > 0.5) { scale = Math.max(0.5, scale * 0.86); resize(); goodT = 0; }
  else if (avg < 1 / 56) { goodT += avg * 24; if (goodT > 3 && scale < 1) { scale = Math.min(1, scale * 1.07); resize(); goodT = 0; } }
  else goodT = 0;
}

// ---------- кадр ----------
const rs = { cam, focal: 800, time: 0, dawn: 0, uv: 0, flashI: 2.4, vol: 0.5, grain: 0.035, expo: 1, flashPos, flashDir, lights: [], ao: [] };
let last = performance.now(), mapT = 0, frameN = 0, ambT = 0, knownT = 0;
function frame(now) {
  if (dead) return;
  requestAnimationFrame(frame);
  if (document.hidden) { last = now; return; }
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.1) dt = 0.1;
  if (dt <= 0) dt = 0.001;
  t += dt;
  frameN++;
  pumpPaint(SHOT ? (initialDone ? 30 : 400) : (initialDone ? (mode === 'intro' ? 8 : 5) : 14));
  if (!initialDone && initialSet.every((l) => specs[l].done)) initialDone = true;
  // переход от заставки к игре: затемнение и перенос камеры (проявление — когда шейдер готов)
  if (everDrawn || fadeTarget === 0) fade = lerp(fade, fadeTarget, 1 - Math.exp(-dt * (everDrawn && fade < 0.5 && fadeTarget === 1 ? 3 : 7)));
  if (pendingTeleport && fade < 0.04) {
    cam.x = pendingTeleport.x; cam.y = pendingTeleport.y; cam.a = pendingTeleport.a; cam.pitch = 0;
    pendingTeleport = null; fadeTarget = 1;
    flashDir[0] = Math.cos(cam.a); flashDir[1] = Math.sin(cam.a); flashDir[2] = -0.05;
  }
  let aimA = 0, aimP = 0;
  if (mode === 'intro' || pendingTeleport) { if (!pendingTeleport) attract(dt); aimA = attractAim.a; aimP = attractAim.p; aimDist = 3.2; }
  else if (mode === 'play' || mode === 'final') {
    if (mode === 'play') move(dt);
    updateTarget(dt);
    checkHall();
  }
  if (mode === 'play') {
    if (uvOn) { battery -= dt / 14; if (battery <= 0) { battery = 0; toggleUV(false); flashHint('УФ-лампа перегрелась'); } }
    else battery = Math.min(1, battery + dt / 20);
    $('uvFill').style.transform = 'scaleX(' + battery.toFixed(3) + ')';
    ambT += dt;
    if (ambT > 1) { ambT = 0; A.ambient(); }
    knownT += dt;
    if (knownT > 0.4) { knownT = 0; knownFrames(); }
  }
  uvK = lerp(uvK, uvOn ? 1 : 0, 1 - Math.exp(-dt * 14));
  updateFlash(dt, aimA, aimP);
  updateClock(dt);
  updateToast(dt);
  if (hintT > 0) { hintT -= dt; if (hintT <= 0) $('hint').classList.remove('on'); }
  else if (mode === 'play' && !locked && !touchUI && t > 3) { $('hint').textContent = 'Кликните по сцене, чтобы смотреть мышью'; $('hint').classList.add('on'); }
  else if (locked) $('hint').classList.remove('on');
  if (finaleT >= 0) {
    finaleT += dt;
    dawnBoost = clamp((finaleT - 1.5) / 7, 0, 1);
    if (finaleT > 8.5 && !finalShown) showFinal();
  }
  const clockDawn = clamp((134 + gameMin - 315) / 60, 0, 0.7);
  rs.focal = focal;
  rs.time = t;
  rs.dawn = Math.max(clockDawn, dawnBoost * 0.9);
  rs.uv = uvK;
  rs.flashI = 5.2 * (1 - rs.dawn * 0.5);
  rs.vol = 0.55;
  rs.expo = fade * (1 + rs.dawn * 0.2);
  rs.lights = buildLights();
  rs.ao = buildAO();
  let draw = true;
  if (SHOT) {
    // первые два кадра, потом — только после ввода (когда всё успокоилось) или по запросу
    if (shotForce) { shotWait = 3; shotForce = false; }
    if (shotWait > 0) shotWait--;
    draw = (shotRenders < 1 && initialDone) || shotWait === 1 || (shotDirty && now - shotInputT > 350 && Math.hypot(vel.x, vel.y) < 0.02);
    if (draw) { shotDirty = false; shotRenders++; }
  }
  if (draw) {
    const f0 = performance.now();
    let drawn = false;
    try { drawn = R.frame(rs); } catch (e) { fatal(e); return; }
    if (!drawn && SHOT) { shotRenders--; shotWait = 2; }
    if (drawn && SHOT) lastFrameMs = performance.now() - f0;
    if (drawn) everDrawn = true;
  }
  mapT += dt;
  if (!touchUI && mapT > 0.1 && mode !== 'intro') { mapT = 0; drawMap(mini, false); if (mapOpen) drawMap(big, true); }
  adapt(dt);
}

// ---------- старт ----------
buildSlots();
buildIntroRow();
resize();
// первыми пишутся семь украденных и картины в кадре заставки — между кадрами, не задерживая загрузку
attract(0);
const initialSet = world.stolen.map((S) => S.paint.layer).concat(queue.filter((l) => specs[l].master === undefined).sort((a, b) => priority(a) - priority(b)).slice(0, 10));
let initialDone = false;
renderSlots(-1);
document.addEventListener('visibilitychange', () => { if (A.ready) A.suspend(document.hidden); });
// отладочный доступ для проверки (без побочных эффектов)
window.museum = {
  get cam() { return cam; },
  set(x, y, a, p) { cam.x = x; cam.y = y; cam.a = a; cam.pitch = p || 0; },
  play() { start(); },
  get world() { return world; },
  paintAll() { while (queue.length) paintNow(queue[0]); },
  render() { shotForce = true; },
  get target() { return target ? { key: target.key, prompt: target.prompt || null, dist: +target.dist.toFixed(2) } : null; },
  get mode() { return mode; },
  col(x) { return R.debugCol(x == null ? Math.floor(canvas.width / 2) : x); },
  get cast() { return Object.assign({}, R.lastCast, { renders: shotRenders, loops: frameN, ticks: window.__ticks || 0, wait: shotWait, force: shotForce }); },
  setScale(k) { scale = k; resize(); shotForce = true; },
  // проверка сценария без обхода всего музея: те же take и rehang, что у игрока
  takeAll() { for (const S of world.stolen) take(S); return world.stolen.map((S) => S.state).join(','); },
  returnAll(except) { for (const S of world.stolen) if (S.k !== except) { take(S); rehang(S); } return returned; },
  // синхронный кадр для проверочных снимков: рисуем прямо сейчас и ждём GPU
  renderNow() {
    const t0 = performance.now();
    updateTarget(0.3); updateTarget(0.3);
    updateFlash(1, mode === 'intro' ? attractAim.a : 0, mode === 'intro' ? attractAim.p : 0);
    rs.focal = focal; rs.lights = buildLights(); rs.ao = buildAO(); rs.uv = uvK = uvOn ? 1 : 0;
    R.frame(rs);
    const px = new Uint8Array(4);
    R.gl.readPixels(0, 0, 1, 1, R.gl.RGBA, R.gl.UNSIGNED_BYTE, px);
    drawMap(mini, false); if (mapOpen) drawMap(big, true);
    return Math.round(performance.now() - t0);
  },
  uv(on) { toggleUV(on); shotForce = true; },
  get readyCount() { let n = 0; for (let i = 0; i < R.ready.length; i++) n += R.ready[i]; return n; },
  get frameMs() { return Math.round(lastFrameMs); },
  get pending() { return queue.length; },
};
if (SHOT) setInterval(() => { window.__ticks = (window.__ticks || 0) + 1; }, 250);
requestAnimationFrame(frame);
})();
