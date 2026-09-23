/* ================================================================
   jobs.js — работы шабашника и их последствия.
   Всё, что игрок сделал, хранится в JOB и видно в 3D:
   каждая полоса обоев, каждая плитка, каждая клякса краски.
   collectFlaws() превращает это в точный список косяков для бабушки.
   ================================================================ */
'use strict';
const JOB = {
  strips: [], stripsDone: 0,
  tiles: { cells: [], placed: 0, next: 0, timer: 0 },
  paint: [],                       // секции батареи и части рамы
  splats: [], drops: [],
  hole: { state: 'open', prog: 0, lumps: 0, patch: null, calendar: null },
  tap: { stage: 0, valveClosed: false, flax: false, gush: false, liters: 0, drip: false, unscrew: 0, screw: 0, open: false, leakStart: 0 },
  carpet: { onWall: true, covered: false, everRemoved: false },
  sw: { coverOff: false, covered: false, lightOn: false },
  cat: { fed: false },
  empties: [],
  tv: { on: false },
  roll: { flipped: false },
  missed: 0, calls: 0, smokes: 0,
  gena: { visited: false, due: 0, told: false, demand: 0, gaveBeer: false, mood: '' },
};
const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const plural = (n, a, b, c) => { const m = n % 10, h = n % 100; return n + ' ' + (m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 10 || h >= 20) ? b : c); };

/* ---------- обои ---------- */
const STRIP_Y0 = 0.07, STRIP_Y1 = H;
const CARPET_RECT = { z0: 0.9, z1: 3.6, y0: 0.62, y1: 2.37 };     // ковёр на стене x = 0
const SWITCH_RECT = { x0: 3.68, x1: 3.76, y0: 1.4, y1: 1.5 };      // выключатель на стене z = 3.8
function initStrips() {
  const defs = [];
  // западная стена (ковёр): смотрит +x, правая сторона — −z
  for (let i = 0; i < 4; i++) defs.push({ wall: 'W', a: i * 0.95, b: (i + 1) * 0.95 });
  // южная стена (дверь, выключатель): смотрит −z
  for (const [a, b] of [[0, 1.0], [1.0, 2.0], [2.0, 2.95], [2.95, 3.9]]) defs.push({ wall: 'S', a, b });
  // восточная стена (сервант, часы): смотрит −x
  for (let i = 0; i < 4; i++) defs.push({ wall: 'E', a: i * 0.95, b: (i + 1) * 0.95 });
  defs.forEach((d, i) => {
    const s = { ...d, i, done: false, mesh: null, flipped: false, tilt: 0, off: 0, shift: 0, overCarpet: false, overSwitch: false, anim: 0 };
    const mid = (d.a + d.b) / 2, w = d.b - d.a;
    let hb;
    if (d.wall === 'W') hb = hitBox(0.0, STRIP_Y0, d.a, 0.012, STRIP_Y1, d.b, null);
    if (d.wall === 'S') hb = hitBox(d.a, STRIP_Y0, 3.788, d.b, STRIP_Y1, 3.8, null);
    if (d.wall === 'E') hb = hitBox(4.988, STRIP_Y0, d.a, 5.0, STRIP_Y1, d.b, null);
    s.center = d.wall === 'W' ? new THREE.Vector3(0, 1.3, mid) : d.wall === 'S' ? new THREE.Vector3(mid, 1.3, 3.8) : new THREE.Vector3(5.0, 1.3, mid);
    s.width = w;
    hb.userData.it = { look: () => lookStrip(s) };
    s.hb = hb;
    JOB.strips.push(s);
  });
}
function stripCovers(s, what) {
  if (what === 'carpet') return s.wall === 'W' && s.b > CARPET_RECT.z0 + 0.05 && s.a < CARPET_RECT.z1 - 0.05;
  if (what === 'switch') return s.wall === 'S' && s.a < SWITCH_RECT.x0 && s.b > SWITCH_RECT.x1;
  return false;
}
function lookStrip(s) {
  const t = toolId();
  if (s.done) {
    if (t !== 'roll') return null;
    return { name: s.flipped ? 'Полоса обоев… цветами вниз' : 'Полоса новых обоев' };
  }
  if (t !== 'roll') return t === 'hands' ? { name: 'Старые обои', lmb: { text: 'нужен рулон обоев — клавиша 2', off: true } } : null;
  return { name: 'Стена под обои', lmb: { text: 'поклеить полосу', fn: () => glueStrip(s) }, e: { text: 'перевернуть рулон (R)', fn: flipRoll } };
}
function flipRoll() { JOB.roll.flipped = !JOB.roll.flipped; SFX.play('tool'); updateRollPreview(); toast(JOB.roll.flipped ? 'Рулон перевёрнут. Теперь маки смотрят… вниз?' : 'Рулон перевёрнут. Маки смотрят вверх.', '', 1800); }
function onKeyR() { if (toolId() === 'roll') flipRoll(); }
// нарисовать полосу: геометрия с «горбом» над ковром и выключателем
function stripGeometry(s) {
  const w = s.width + 0.004, h = STRIP_Y1 - STRIP_Y0 + 0.02;
  // над ковром сетка гуще: сквозь бумагу проступает ромб медальона
  const g = new THREE.PlaneGeometry(w, h, s.overCarpet ? 30 : 10, s.overCarpet ? 96 : 40);
  g.translate(0, -h / 2, 0);            // начало координат — верхний край
  const p = g.attributes.position, uv = g.attributes.uv;
  const sh = s.shift;
  const ss = THREE.MathUtils.smoothstep;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    // координаты вершины на стене (без учёта наклона — горб привязан к ковру, а полоса ложится на него)
    const wy = STRIP_Y1 + 0.01 + y, along = x;
    let bump = 0;
    if (s.overCarpet) {
      const z = s.alongToWorld(along);
      const inside = (a, b, c) => ss(c, a - 0.07, a + 0.03) * (1 - ss(c, b - 0.03, b + 0.07));
      const k = inside(CARPET_RECT.z0, CARPET_RECT.z1, z) * inside(CARPET_RECT.y0, CARPET_RECT.y1, wy);
      // ковёр толстый, бумага легла пузырём: посередине горб выше, чем у краёв
      const mz = (CARPET_RECT.z0 + CARPET_RECT.z1) / 2, my = (CARPET_RECT.y0 + CARPET_RECT.y1) / 2;
      const belly = 1 - Math.min(1, Math.hypot((z - mz) / 1.5, (wy - my) / 1.0)) * 0.45;
      const rd = Math.abs(z - mz) / 0.58 + Math.abs(wy - my) / 0.39;          // ромб медальона
      const relief = (1 - ss(rd, 0.94, 1.02)) * 0.6 + (1 - ss(rd, 0.5, 0.58)) * 0.4;
      bump = Math.max(bump, k * (0.05 * belly + 0.014 * relief));
    }
    if (s.overSwitch) {
      const xw = s.alongToWorld(along);
      const d = Math.hypot((xw - 3.72) / 0.07, (wy - 1.45) / 0.08);
      bump = Math.max(bump, 0.02 * Math.max(0, 1 - d * d));
    }
    p.setZ(i, bump);
    // узор: 0,5 м на повтор; перевёрнутая полоса — узор на 180°
    let u = (x + w / 2) / 0.5, v = (wy + sh) / 0.5;
    if (s.flipped) { u = -u; v = -v; }
    uv.setXY(i, u, v);
  }
  g.computeVertexNormals();
  if (s.overCarpet) showThrough(g, s);
  return g;
}
// тонкая бумага на ковре: сквозь неё проступает красный узор (цвета вершин × текстура обоев)
let carpetPix = null;
function showThrough(g, s) {
  const img = TX.carpet.image;
  if (!carpetPix) carpetPix = img.getContext('2d').getImageData(0, 0, img.width, img.height).data;
  const p = g.attributes.position, n = p.count, col = new Float32Array(n * 3);
  const ss = THREE.MathUtils.smoothstep;
  for (let i = 0; i < n; i++) {
    const z = s.alongToWorld(p.getX(i)), y = STRIP_Y1 + 0.01 + p.getY(i);
    const k = ss(z, CARPET_RECT.z0 - 0.01, CARPET_RECT.z0 + 0.05) * (1 - ss(z, CARPET_RECT.z1 - 0.05, CARPET_RECT.z1 + 0.01)) * ss(y, CARPET_RECT.y0 - 0.01, CARPET_RECT.y0 + 0.05) * (1 - ss(y, CARPET_RECT.y1 - 0.05, CARPET_RECT.y1 + 0.01));
    const u = THREE.MathUtils.clamp(0.5 + (2.25 - z) / 2.7, 0, 0.999), v = THREE.MathUtils.clamp(0.5 + (y - 1.495) / 1.75, 0, 0.999);
    const o = (Math.floor((1 - v) * img.height) * img.width + Math.floor(u * img.width)) * 4;
    const a = 0.4 * k;
    col[i * 3] = 1 - a + a * carpetPix[o] / 255 * 1.25; col[i * 3 + 1] = 1 - a + a * carpetPix[o + 1] / 255 * 1.1; col[i * 3 + 2] = 1 - a + a * carpetPix[o + 2] / 255 * 1.1;
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
}
function glueStrip(s) {
  if (s.done || G.busy) return;
  const sl = sloppiness();
  s.flipped = JOB.roll.flipped;
  s.tilt = THREE.MathUtils.degToRad(gauss() * (0.35 + sl * 1.9));
  s.off = gauss() * (0.006 + sl * 0.022);
  s.shift = (Math.random() - 0.5) * Math.min(0.5, sl * 0.3);
  s.overCarpet = JOB.carpet.onWall && stripCovers(s, 'carpet');
  s.overSwitch = !JOB.sw.coverOff && stripCovers(s, 'switch');
  // перевод координаты «вдоль полосы» в мировую (для горба)
  const mid = (s.a + s.b) / 2 + s.off;
  s.alongToWorld = s.wall === 'W' ? (a) => mid - a : s.wall === 'S' ? (a) => mid - a : (a) => mid + a;
  const mesh = new THREE.Mesh(stripGeometry(s), s.overCarpet ? (W.mats.wallNewTint || (W.mats.wallNewTint = Object.assign(W.mats.wallNew.clone(), { vertexColors: true }))) : W.mats.wallNew);
  mesh.receiveShadow = true; mesh.castShadow = s.overCarpet;
  const off = 0.003;
  if (s.wall === 'W') { mesh.position.set(off, STRIP_Y1 + 0.01, mid); mesh.rotation.set(0, Math.PI / 2, 0); }
  if (s.wall === 'S') { mesh.position.set(mid, STRIP_Y1 + 0.01, 3.8 - off); mesh.rotation.set(0, Math.PI, 0); }
  if (s.wall === 'E') { mesh.position.set(5.0 - off, STRIP_Y1 + 0.01, mid); mesh.rotation.set(0, -Math.PI / 2, 0); }
  mesh.rotateZ(s.tilt);
  mesh.scale.y = 0.02;
  W.scene.add(mesh); tagMesh(mesh, 'newwall');
  s.mesh = mesh; s.done = true; s.anim = 0.001; JOB.stripsDone++;
  if (s.overCarpet) { JOB.carpet.covered = true; W.objs.carpetFringe.position.x = 0.05; }
  if (s.overSwitch) { JOB.sw.covered = true; W.objs.switchGroup.visible = false; }
  if (JOB.sw.coverOff && stripCovers(s, 'switch')) { W.objs.switchGroup.position.z = 3.8 - 0.006; }
  spend(14 / workSpeed());
  SFX.play('unroll'); setTimeout(() => SFX.play('slap'), 450);
  logEvent(`поклеил полосу обоев №${s.i + 1}${s.flipped ? ' вверх ногами' : ''}${s.overCarpet ? ' прямо поверх ковра' : ''}`);
  const deg = Math.abs(THREE.MathUtils.radToDeg(s.tilt));
  if (s.overCarpet && !JOB._carpetToast) { JOB._carpetToast = 1; toast('Обои легли прямо на&nbsp;ковёр. Горбом. Зато быстро.', 'warn', 3600); }
  else if (s.overSwitch) toast('Выключатель ушёл под обои. Бугорок почти незаметен.', 'warn', 3600);
  else if (deg > 2.5) toast(`Полоса поехала на&nbsp;<b>${deg.toFixed(1)}°</b>. Внизу щель.`, 'bad', 2600);
  // новый рулон — новая загадка: где у него верх
  JOB.roll.flipped = Math.random() < 0.5; updateRollPreview();
}
function updateRollPreview() {
  const el = $('rollPrev'); if (!el) return;
  el.classList.toggle('flip', JOB.roll.flipped);
  el.style.filter = G.drunk > 1.5 ? `blur(${Math.min(3.5, (G.drunk - 1.5) * 1.2).toFixed(1)}px)` : '';
}

/* ---------- ковёр и выключатель ---------- */
function initCarpetSwitch() {
  markInter(W.objs.carpetMesh, { look: () => {
    const t = toolId();
    if (JOB.carpet.covered) return { name: 'Горб под обоями. Там ковёр' };
    const d = { name: 'Ковёр на стене', e: { text: 'снять ковёр', fn: takeCarpet } };
    if (t === 'roll') { const s = JOB.strips.find((q) => !q.done && stripCovers(q, 'carpet') && hitStripAt(q)); if (s) d.lmb = { text: 'клеить прямо поверх ковра', fn: () => glueStrip(s) }; }
    return d;
  } });
  markInter(W.objs.carpetRoll, { look: () => ({ name: 'Ковёр в рулоне', e: { text: 'повесить ковёр обратно', fn: hangCarpet } }) });
  W.objs.switchGroup.traverse((o) => { if (o.isMesh) markInter(o, { look: () => {
    if (JOB.sw.covered) return null;
    const d = { name: 'Выключатель', e: { text: JOB.sw.lightOn ? 'выключить свет' : 'включить свет', fn: toggleLight } };
    if (toolId() === 'roll' || toolId() === 'spatula') d.lmb = JOB.sw.coverOff ? { text: 'накладка снята, можно клеить', off: true } : { text: 'снять накладку перед обоями', fn: () => { JOB.sw.coverOff = true; spend(5); SFX.play('ratchet'); toast('Накладку сняли. Теперь обои лягут аккуратно вокруг.', '', 2600); } };
    return d;
  } }); });
}
function hitStripAt(s) { const L = G.look; if (!L) return true; const z = L.hit.point.z; return z >= s.a && z <= s.b; }
function takeCarpet() {
  JOB.carpet.onWall = false; JOB.carpet.everRemoved = true;
  W.objs.carpet.visible = false; W.objs.carpetRoll.visible = true;
  spend(10 / workSpeed()); SFX.play('thud'); logEvent('снял ковёр со стены');
  toast('Ковёр снят и свёрнут. Под ним — стена чистая, почти.', '', 2600);
  W.shadowDirty = true;
}
function hangCarpet() {
  JOB.carpet.onWall = true; W.objs.carpet.visible = true; W.objs.carpetRoll.visible = false;
  // если стена уже в новых обоях — ковёр висит поверх них, как и положено
  W.objs.carpet.position.x = JOB.strips.some((s) => s.done && s.wall === 'W') ? 0.004 : 0;
  spend(12 / workSpeed()); SFX.play('thud'); logEvent('повесил ковёр обратно');
  W.shadowDirty = true;
}
function toggleLight() {
  JOB.sw.lightOn = !JOB.sw.lightOn;
  W.objs.switchKey.rotation.x = JOB.sw.lightOn ? 0.3 : -0.3;
  W.lights.fZal.intensity = JOB.sw.lightOn ? 7 : 2.4;
  W.mats.shadeGlass.emissive.setHex(JOB.sw.lightOn ? 0xffd9a0 : 0x000000);
  W.mats.shadeGlass.emissiveIntensity = 1.2;
  SFX.play('click');
}

/* ---------- плитка в ванной ---------- */
const TILE = { x0: 0.075, y0: 0.64, size: 0.35, cols: 5, rows: 4, z: 5.6 };
function initTiles() {
  for (let r = 0; r < TILE.rows; r++) for (let c = 0; c < TILE.cols; c++)
    JOB.tiles.cells.push({ r, c, x: TILE.x0 + (c + 0.5) * TILE.size, y: TILE.y0 + (r + 0.5) * TILE.size, mesh: null, rot: 0, dx: 0, dy: 0, decor: false, flipped: false });
  const hb = hitBox(TILE.x0 - 0.05, TILE.y0 - 0.05, TILE.z - 0.02, TILE.x0 + TILE.cols * TILE.size + 0.05, TILE.y0 + TILE.rows * TILE.size + 0.05, TILE.z - 0.004, null);
  hb.userData.it = { look: () => {
    const left = JOB.tiles.cells.filter((c) => !c.mesh).length;
    if (toolId() !== 'tile') return toolId() === 'hands' ? { name: 'Голая стена над ванной', lmb: { text: 'нужна плитка — клавиша 3', off: true } } : null;
    if (!left) return { name: 'Плитка уложена. Как есть' };
    return { name: `Стена над ванной — осталось ${left}`, lmb: { text: 'класть плитку (держите — быстрее)', hold: true, fn: holdTile } };
  } };
}
function holdTile(hit, dt) {
  const T = JOB.tiles;
  if (dt === 0 || T.timer <= 0) { placeTile(hit.point); T.timer = 0.5 / workSpeed(); }
  else T.timer -= dt;
  return 1 - Math.max(0, T.timer) / (0.5 / workSpeed());
}
function placeTile(p) {
  const T = JOB.tiles;
  let best = null, bd = 1e9;
  for (const c of T.cells) { if (c.mesh) continue; const d = Math.hypot(c.x - p.x, c.y - p.y); if (d < bd) { bd = d; best = c; } }
  if (!best || bd > 0.6) return;
  const sl = sloppiness();
  const aimX = THREE.MathUtils.clamp(p.x - best.x, -0.15, 0.15), aimY = THREE.MathUtils.clamp(p.y - best.y, -0.15, 0.15);
  best.dx = aimX * 0.3 + gauss() * (0.002 + sl * 0.009);
  best.dy = aimY * 0.3 + gauss() * (0.002 + sl * 0.009);
  best.rot = THREE.MathUtils.degToRad(gauss() * (0.4 + sl * 3.4));
  T.placed++;
  best.decor = T.placed % 5 === 0;
  best.flipped = best.decor && Math.random() < 0.2 + G.drunk * 0.12;
  const m = best.decor ? W.mats.tileDecor : W.mats.tileNew;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.009), [W.mats.tileEdge, W.mats.tileEdge, W.mats.tileEdge, W.mats.tileEdge, m, W.mats.tileEdge]);
  mesh.castShadow = false; mesh.receiveShadow = true;
  // вылетает из руки и шлёпается на стену
  const from = camera.localToWorld(new THREE.Vector3(0.1, -0.1, -0.3));
  mesh.position.copy(from);
  mesh.userData.to = new THREE.Vector3(best.x + best.dx, best.y + best.dy, TILE.z - 0.0065);
  mesh.userData.rot = Math.PI + (best.flipped ? Math.PI : 0) + best.rot;
  mesh.userData.fly = 0;
  mesh.rotation.set(0, Math.PI, 0);
  W.scene.add(mesh); tagMesh(mesh, 'tile', false);
  best.mesh = mesh;
  spend(4 / workSpeed());
  const deg = Math.abs(THREE.MathUtils.radToDeg(best.rot));
  if (best.flipped) toast('Плитка с&nbsp;корабликом — вверх ногами. Кораблик тонет.', 'warn', 2400);
  else if (deg > 4) toast(`Плитка встала криво: <b>${deg.toFixed(0)}°</b>`, 'bad', 1600);
  if (T.placed === 20) logEvent('доложил плитку в ванной');
}

/* ---------- покраска: батарея и рама ---------- */
function initPaint() {
  const add = (mesh, name, group) => {
    const coat = new THREE.Mesh(mesh.geometry, W.mats.paintCoat.clone());
    coat.position.copy(mesh.position); coat.rotation.copy(mesh.rotation); coat.scale.copy(mesh.scale).multiplyScalar(1.012);
    mesh.parent.add(coat); coat.castShadow = false;
    const part = { mesh, coat, name, group, cov: 0 };
    JOB.paint.push(part);
    markInter(mesh, { look: () => lookPaint(part) });
    tagMesh(coat, mesh.userData.tag, false);
  };
  W.objs.radiator.forEach((s) => add(s, s.userData.part, 'radiator'));
  W.objs.windowParts.forEach((s) => add(s, s.userData.part, 'frame'));
}
function lookPaint(part) {
  if (toolId() !== 'brush') return toolId() === 'hands' ? { name: part.group === 'radiator' ? 'Батарея в ржавчине' : 'Облезлая рама', lmb: { text: 'нужна кисть — клавиша 4', off: true } } : null;
  const pct = Math.round(part.cov * 100);
  return { name: `${part.name[0].toUpperCase() + part.name.slice(1)} — ${pct}%`, lmb: { text: pct >= 100 ? 'докрашено' : 'красить', hold: true, fn: (hit, dt) => paintPart(part, hit, dt) } };
}
let brushTick = 0;
function paintPart(part, hit, dt) {
  part.cov = Math.min(1, part.cov + dt * 0.62 * workSpeed());
  part.coat.material.opacity = Math.min(1, part.cov * 1.05);
  G.t += dt * 5;
  brushTick -= dt;
  if (brushTick <= 0) { brushTick = 0.12; SFX.play('brush'); if (Math.random() < 0.3 + G.drunk * 0.12 + G.stress / 220) throwDrop(hit.point); }
  return part.cov;
}
// «свободная» кисть: мазнуть по чему угодно — по телевизору, коту, ковру
function freeAction() {
  if (toolId() !== 'brush') return false;
  const h = paintRay(); if (!h) return false;
  return true;
}
function freeHold(dt) {
  if (toolId() !== 'brush') return false;
  const h = paintRay(); if (!h) return false;
  brushTick -= dt;
  if (brushTick <= 0) {
    brushTick = 0.16; SFX.play('brush');
    splat(h.point, h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : new THREE.Vector3(0, 1, 0), h.object, 0.03 + Math.random() * 0.04);
    if (Math.random() < 0.35 + G.drunk * 0.1) throwDrop(h.point);
    G.t += dt * 3;
  }
  return 0.5;
}
let _ray = null;               // создаётся в initJobs
function paintRay() {
  _ray.setFromCamera({ x: 0, y: 0 }, camera); _ray.far = 2.2;
  const hs = _ray.intersectObjects(W.paintables, false);
  return hs.find((h) => h.object.visible) || null;
}
// капля краски летит из-под кисти и прилипает к тому, во что попала
function throwDrop(from) {
  const sl = sloppiness();
  const cam = camera.position;
  const dir = new THREE.Vector3().subVectors(cam, from).setY(0).normalize();
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const v = dir.multiplyScalar(0.6 + Math.random() * 1.2).addScaledVector(side, gauss() * (0.9 + sl * 0.8));
  v.y = 0.8 + Math.random() * 1.6;
  const m = new THREE.Mesh(JOB._dropGeo || (JOB._dropGeo = new THREE.SphereGeometry(0.012, 6, 4)), W.mats.paint);
  m.position.copy(from).addScaledVector(v.clone().normalize(), 0.06);
  W.scene.add(m);
  JOB.drops.push({ m, v, life: 3 });
}
function updateDrops(dt) {
  for (let i = JOB.drops.length - 1; i >= 0; i--) {
    const d = JOB.drops[i];
    const prev = d.m.position.clone();
    d.v.y -= 9.8 * dt; d.m.position.addScaledVector(d.v, dt); d.life -= dt;
    const seg = new THREE.Vector3().subVectors(d.m.position, prev), len = seg.length();
    let hit = null;
    if (len > 1e-5) { _ray.set(prev, seg.normalize()); _ray.far = len + 0.01; hit = _ray.intersectObjects(W.paintables, false).find((h) => h.object.visible); }
    if (hit || d.life <= 0 || d.m.position.y < -0.5) {
      if (hit) { const n = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : new THREE.Vector3(0, 1, 0); splat(hit.point, n, hit.object, 0.012 + Math.random() * 0.03); SFX.play('splat'); }
      W.scene.remove(d.m); JOB.drops.splice(i, 1);
    }
  }
}
function splat(point, normal, obj, r) {
  const n = 9, pts = [];
  for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2, rr = r * (0.65 + Math.random() * 0.55); pts.push(new THREE.Vector2(Math.cos(a) * rr, Math.sin(a) * rr)); }
  const g = new THREE.ShapeGeometry(new THREE.Shape(pts));
  const m = new THREE.Mesh(g, W.mats.paint);
  m.position.copy(point).addScaledVector(normal, 0.002);
  m.lookAt(point.clone().add(normal));
  m.castShadow = false; m.receiveShadow = true;
  obj.attach ? obj.attach(m) : W.scene.add(m);
  if (!m.parent) W.scene.add(m);
  const tag = obj.userData.tag || 'misc';
  JOB.splats.push({ m, tag, onScreen: tag === 'tvScreen' });
  if (JOB.splats.length > 420) { const old = JOB.splats.shift(); old.m.parent && old.m.parent.remove(old.m); }
  if ((tag === 'tvScreen' || tag === 'tv') && !JOB._tvToast) { JOB._tvToast = 1; toast('Капля белой краски — прямо на&nbsp;телевизор.', 'bad', 2600); }
  if (tag === 'cat' && !JOB._catToast) { JOB._catToast = 1; toast('Барсик теперь в&nbsp;крапинку.', 'bad', 2600); SFX.play('meow'); }
}

/* ---------- дыра в прихожей ---------- */
function initHole() {
  const hb = hitBox(2.66, 1.06, 3.92, 3.14, 1.54, 3.95, null);
  hb.userData.it = { look: () => {
    const h = JOB.hole, t = toolId();
    if (h.state === 'calendar') return { name: 'Календарь за 1975 год. Под ним — сами знаете', e: { text: 'снять календарь', fn: () => { h.state = 'open'; h.calendar.visible = false; SFX.play('tool'); } } };
    if (h.state === 'patched') return { name: h.lumps > 3 ? 'Заделанная дыра. Буграми' : 'Заделанная дыра' };
    const d = { name: h.prog > 0 ? `Дыра — заделано ${Math.round(h.prog * 100)}%` : 'Дыра в стене: кирпич и провод', e: { text: 'завесить календарём (1 мин)', fn: hangCalendar } };
    d.lmb = t === 'spatula' ? { text: 'шпаклевать (долго)', hold: true, fn: (hit, dt) => patchHole(hit, dt) } : { text: 'нужен шпатель — клавиша 5', off: true };
    return d;
  } };
  const cal = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.51), W.mats.calendar);
  cal.position.set(2.92, 1.26, 3.935); cal.rotation.z = 0.04; cal.visible = false; W.scene.add(cal); tagMesh(cal, 'calendar');
  JOB.hole.calendar = cal;
  const patch = new THREE.Mesh(new THREE.CircleGeometry(0.2, 20), W.mats.patch);
  patch.position.set(2.9, 1.3, 3.93); patch.scale.setScalar(0.01); W.scene.add(patch); tagMesh(patch, 'wall');
  JOB.hole.patch = patch;
}
function hangCalendar() { const h = JOB.hole; h.state = 'calendar'; h.calendar.visible = true; spend(1); SFX.play('thud'); logEvent('завесил дыру календарём'); toast('Дыры больше нет. Есть календарь на&nbsp;сентябрь 1975-го.', '', 3000); }
let scrapeTick = 0;
function patchHole(hit, dt) {
  const h = JOB.hole;
  h.prog = Math.min(1, h.prog + dt * 0.3 * workSpeed());
  G.t += dt * 10;
  h.patch.scale.setScalar(0.1 + h.prog * 1.15);
  scrapeTick -= dt;
  if (scrapeTick <= 0) {
    scrapeTick = 0.3; SFX.play('scrape');
    if (Math.random() < 0.15 + sloppiness() * 0.25) { // наплыв шпаклёвки
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.03 + Math.random() * 0.03, 8, 6), W.mats.patch);
      b.scale.z = 0.35; b.position.set(2.9 + (Math.random() - 0.5) * 0.36, 1.3 + (Math.random() - 0.5) * 0.36, 3.935); W.scene.add(b); h.lumps++;
    }
  }
  if (h.prog >= 1 && h.state !== 'patched') { h.state = 'patched'; W.objs.hole.visible = false; logEvent('зашпаклевал дыру'); toast(h.lumps > 3 ? `Дыра заделана. Бугров: <b>${h.lumps}</b>.` : 'Дыра заделана ровно. Почти как у людей.', h.lumps > 3 ? 'warn' : '', 2600); }
  return h.prog;
}

/* ---------- кран на кухне, вентиль, потоп ---------- */
function initTap() {
  const hbT = hitBox(7.36, 0.9, 0.62, 7.6, 1.16, 1.08, null);
  hbT.userData.it = { look: lookTap };
  const hbV = hitBox(7.38, 0.34, 0.7, 7.56, 0.5, 0.86, null);
  hbV.userData.it = { look: () => ({ name: JOB.tap.valveClosed ? 'Вентиль: вода перекрыта' : 'Вентиль на стояке: открыт', e: { text: JOB.tap.valveClosed ? 'открыть воду' : 'перекрыть воду', fn: toggleValve } }) };
  // вода: струя и лужа
  const pud = new THREE.Mesh(new THREE.CircleGeometry(1, 28), W.mats.puddle);
  pud.rotation.x = -Math.PI / 2; pud.position.set(7.1, 0.006, 0.95); pud.scale.setScalar(0.001); pud.visible = false; W.scene.add(pud);
  JOB.puddle = pud;
  JOB.jets = [];
  const jm = new THREE.MeshStandardMaterial({ color: 0xcfe3ea, roughness: 0.05, transparent: true, opacity: 0.7 });
  for (let i = 0; i < 70; i++) { const d = new THREE.Mesh(new THREE.SphereGeometry(0.012, 5, 4), jm); d.visible = false; W.scene.add(d); JOB.jets.push({ m: d, v: new THREE.Vector3(), t: Math.random() }); }
}
function lookTap() {
  const T = JOB.tap, t = toolId();
  if (T.stage === 0) return { name: 'Старый кран, «ёлочка»', lmb: t === 'wrench' ? { text: 'откручивать', hold: true, fn: (h, dt) => unscrewTap(dt) } : { text: 'нужен ключ — клавиша 6', off: true } };
  if (T.stage === 1) {
    const d = { name: T.gush ? 'Труба без крана — ХЛЕЩЕТ ВОДА' : 'Труба без крана', e: { text: T.flax ? 'лён намотан' : 'намотать лён на резьбу', off: T.flax, fn: () => { T.flax = true; spend(4); SFX.play('scrape'); toast('Лён на&nbsp;резьбе. Как учил дед.', '', 2000); } } };
    d.lmb = t === 'wrench' ? { text: 'прикрутить новый кран', hold: true, fn: (h, dt) => screwTap(dt) } : { text: 'нужен ключ — клавиша 6', off: true };
    return d;
  }
  return { name: 'Новый кран', e: { text: T.open ? 'закрыть кран' : 'открыть кран', fn: toggleTapWater } };
}
let ratchetTick = 0;
function unscrewTap(dt) {
  const T = JOB.tap;
  T.unscrew = Math.min(1, T.unscrew + dt * 0.42 * workSpeed()); G.t += dt * 8;
  ratchetTick -= dt; if (ratchetTick <= 0) { ratchetTick = 0.35; SFX.play('ratchet'); }
  W.objs.tapOld.rotation.x = T.unscrew * 0.6;
  if (T.unscrew >= 1) {
    T.stage = 1; W.objs.tapOld.visible = false; logEvent('открутил старый кран' + (T.valveClosed ? '' : ', не перекрыв воду'));
    if (!T.valveClosed) startGush(); else toast('Старый кран снят. Воду перекрыли заранее — красавец.', '', 2400);
  }
  return T.unscrew;
}
function screwTap(dt) {
  const T = JOB.tap;
  T.screw = Math.min(1, T.screw + dt * 0.36 * workSpeed()); G.t += dt * 8;
  ratchetTick -= dt; if (ratchetTick <= 0) { ratchetTick = 0.35; SFX.play('ratchet'); }
  if (T.screw >= 1) {
    T.stage = 2; W.objs.tapNew.visible = true; stopGush(); logEvent('прикрутил новый кран' + (T.flax ? ' со льном' : ' без льна'));
    toast(T.flax ? 'Новый кран на месте.' : 'Новый кран на месте. Лён? Какой ещё лён.', T.flax ? '' : 'warn', 2400);
    if (!T.flax && !T.valveClosed) startDrip();
  }
  return T.screw;
}
function toggleValve() {
  const T = JOB.tap; T.valveClosed = !T.valveClosed;
  W.objs.valve.rotation.x += T.valveClosed ? Math.PI : -Math.PI;
  SFX.play('ratchet'); spend(1);
  if (T.valveClosed) { stopGush(); T.drip = false; if (T.liters > 1) toast('Вода перекрыта. Лужа осталась.', '', 2200); }
  else { if (T.stage === 1) startGush(); if (T.stage === 2 && !T.flax) startDrip(); }
  logEvent(T.valveClosed ? 'перекрыл воду' : 'открыл воду');
}
function toggleTapWater() {
  const T = JOB.tap;
  if (T.valveClosed) { toast('Кран сипит и молчит: вода перекрыта вентилем.', 'warn', 2400); SFX.play('bad'); return; }
  T.open = !T.open; SFX.play('click');
}
function startGush() {
  const T = JOB.tap; if (T.gush) return;
  T.gush = true; if (!T.leakStart) T.leakStart = G.t;
  G.stress = Math.min(100, G.stress + 35); SFX.loop('water', true, 1.4);
  toast('<b>ВОДА!</b> Хлещет из&nbsp;стены. Вентиль — под мойкой!', 'bad', 4200);
  logEvent('устроил потоп на кухне');
}
function stopGush() { JOB.tap.gush = false; SFX.loop('water', false); }
function startDrip() { JOB.tap.drip = true; if (!JOB.tap.leakStart) JOB.tap.leakStart = G.t; }
function updateWater(dt) {
  const T = JOB.tap;
  if (T.gush) T.liters += dt * 6;
  if (T.drip && !T.valveClosed) T.liters += dt * 0.06;
  if (T.liters > 0.2) { JOB.puddle.visible = true; JOB.puddle.scale.setScalar(Math.min(1.35, 0.12 + Math.sqrt(T.liters) * 0.12)); }
  const flowing = T.gush || (T.open && T.stage === 2 && !T.valveClosed);
  for (const j of JOB.jets) {
    if (!flowing && !(T.drip && !T.valveClosed)) { j.m.visible = false; continue; }
    j.t -= dt;
    if (j.t <= 0) {
      if (T.gush) { j.m.position.set(7.56, 1.02, 0.85); j.v.set(-1.4 - Math.random() * 1.2, 0.6 + Math.random() * 1.2, (Math.random() - 0.5) * 1.4); j.t = 0.9; }
      else if (flowing) { j.m.position.set(7.44, 0.99, 0.85); j.v.set(-0.05, -0.2, 0); j.t = 0.35; }
      else { if (Math.random() > 0.04) { j.m.visible = false; continue; } j.m.position.set(7.4, 0.5, 0.78); j.v.set(0, 0, 0); j.t = 0.6; SFX.play('drip'); }
      j.m.visible = true;
    }
    j.v.y -= 9.8 * dt; j.m.position.addScaledVector(j.v, dt);
    if (j.m.position.y < 0.01) { j.m.position.y = 0.01; j.v.set(0, 0, 0); }
  }
  if (T.gush) G.stress = Math.min(100, G.stress + dt * 3);
}

/* ---------- мелочи: пиво, кот, телевизор, колонка, холодильник ---------- */
const BEER_LINES = [
  'Хорошо пошло. Руки спокойнее, мысли яснее.',
  'Работа пошла быстрее. Качество тоже пошло — куда-то.',
  'Вы чувствуете в себе силы спорить с бабушкой.',
  'Пол слегка плывёт. Лево и право — понятия относительные.',
  'Вы лучший мастер района. Стены, правда, не согласны.',
];
function initMisc() {
  const crateHB = hitBox(5.2, 0, 1.26, 5.64, 0.34, 1.84, null);
  crateHB.userData.it = { look: () => {
    const left = W.objs.bottles.filter((b) => b.visible).length;
    return { name: `Ящик «Пятиэтажного» — ${left} шт. (для Толика)`, e: { text: left ? 'выпить бутылку' : 'пусто', off: !left, fn: drinkBeer } };
  } };
  const bowlHB = hitBox(6.58, 0, 3.43, 6.82, 0.12, 3.67, null);
  bowlHB.userData.it = { look: () => ({ name: 'Миска Барсика', e: { text: JOB.cat.fed ? 'миска полная' : 'насыпать корм', off: JOB.cat.fed, fn: feedCat } }) };
  W.objs.tv.traverse((o) => { if (o.isMesh) markInter(o, { look: () => ({ name: 'Телевизор на ножках', e: { text: JOB.tv.on ? 'выключить' : 'включить', fn: toggleTV } }) }); });
  W.objs.column.traverse((o) => { if (o.isMesh) markInter(o, { look: () => ({ name: 'Газовая колонка', e: { text: 'зажечь колонку', fn: lightColumn } }) }); });
  W.objs.fridge.traverse((o) => { if (o.isMesh) markInter(o, { look: () => ({ name: 'Холодильник', e: { text: 'заглянуть', fn: () => { SFX.play('creak'); toast('Холодец, банка огурцов и кефир. Кефир — не ваш.', '', 2600); } } }) }); });
}
function drinkBeer() {
  const b = W.objs.bottles.filter((q) => q.visible).pop(); if (!b) return;
  b.visible = false;
  showToolModel('bottle');
  SFX.play('open');
  G.busy = { k: 0, dur: 2.6, anim: (k, arm) => { arm.rotation.x += Math.sin(Math.min(1, k * 1.4) * Math.PI) * -0.9; arm.position.y += Math.sin(Math.min(1, k * 1.4) * Math.PI) * 0.06; }, done: () => {
    G.beers++; G.drunk += 1; G.stress = Math.max(0, G.stress - 24);
    spend(6);
    showToolModel(toolId());
    placeEmpty();
    logEvent(`выпил бутылку пива (всего ${G.beers})`);
    if (G.drunk >= 6) { blackout(); return; }
    toast(BEER_LINES[Math.min(BEER_LINES.length - 1, G.beers - 1)], G.beers > 3 ? 'warn' : '', 3200);
    if (G.drunk >= 4) { G.invert = 9; setTimeout(() => toast('Лево и право поменялись местами. Ненадолго.', 'warn', 2600), 1600); }
    updateRollPreview();
  } };
  setTimeout(() => SFX.play('gulp'), 300);
}
function placeEmpty() {
  const n = JOB.empties.length;
  const e = makeBottle();
  // пустые — рядком на подоконнике кухни (бабушка их посчитает)
  const x = 5.9 + (n % 9) * 0.1, z = n < 9 ? -0.02 : -0.1;
  e.position.set(x, 0.85, z); W.scene.add(e);
  JOB.empties.push(e);
}
function blackout() {
  $('shade').classList.add('on'); G.busy = { k: 0, dur: 3.5, done: () => {
    spend(95); G.drunk = 3; G.stress = 30;
    P.x = 5.2; P.z = 4.9; P.pitch = P.tpitch = -0.9; P.yaw = P.tyaw = Math.PI * 0.8;
    $('shade').classList.remove('on');
    logEvent('выпил шестую бутылку и отключился на полу в прихожей на полтора часа');
    toast('Очнулись на&nbsp;полу в&nbsp;прихожей. Прошло полтора часа.', 'bad', 5000);
    if (typeof onBlackout === 'function') onBlackout();
  } };
}
function feedCat() { JOB.cat.fed = true; W.objs.catFood.visible = true; spend(2); SFX.play('meow'); logEvent('покормил кота'); toast('Барсик поел и смотрит на вас с уважением.', '', 2400); if (typeof catToBowl === 'function') catToBowl(); }
function toggleTV() {
  JOB.tv.on = !JOB.tv.on; W.objs.tvScreen.material = JOB.tv.on ? W.mats.tvOn : W.mats.tvScreen; SFX.play('click');
}
function lightColumn() {
  SFX.play('boom'); if (gradePass) gradePass.uniforms.uFlash.value = 0.9;
  G.stress = Math.min(100, G.stress + 12);
  W.objs.pilot.scale.set(3, 5, 3); setTimeout(() => W.objs.pilot.scale.set(1, 1, 1), 2600);
  toast('БУХ! Колонка зажглась. Брови, кажется, на&nbsp;месте.', 'warn', 3000);
  logEvent('зажёг газовую колонку с хлопком');
}

/* ---------- общий апдейт ---------- */
let tvTick = 0;
function updateJobs(dt) {
  for (const s of JOB.strips) {
    if (!s.mesh || s.anim >= 1) continue;
    s.anim = Math.min(1, s.anim + dt / 0.7);
    const k = s.anim, e = 1 - Math.pow(1 - k, 3);
    s.mesh.scale.y = Math.max(0.02, e + Math.sin(k * Math.PI) * 0.04);
    if (s.anim >= 1 && s.overCarpet) W.shadowDirty = true;   // горб над ковром отбрасывает тень
  }
  for (const c of JOB.tiles.cells) {
    const m = c.mesh; if (!m || m.userData.fly >= 1) continue;
    m.userData.fly = Math.min(1, m.userData.fly + dt / 0.16);
    m.position.lerp(m.userData.to, m.userData.fly);
    m.rotation.set(0, Math.PI, m.userData.rot * m.userData.fly);
    if (m.userData.fly >= 1) { m.position.copy(m.userData.to); SFX.play('tile'); }
  }
  updateDrops(dt);
  updateWater(dt);
  if (JOB.tv.on) { tvTick -= dt; if (tvTick <= 0) { tvTick = 0.12; texTVOn(simTime); TX.tv.needsUpdate = true; } }
}

/* ---------- записка с задачами ---------- */
function taskState() {
  const paint = JOB.paint, rad = paint.filter((p) => p.group === 'radiator'), fr = paint.filter((p) => p.group === 'frame');
  const avg = (a) => a.reduce((s, p) => s + p.cov, 0) / a.length;
  return [
    { text: 'Обои в зале', sub: `${JOB.stripsDone} из 12 полос`, done: JOB.stripsDone >= 12 },
    { text: 'Плитка над ванной', sub: `${JOB.tiles.placed} из 20 плиток`, done: JOB.tiles.placed >= 20 },
    { text: 'Покрасить батарею и окно', sub: `батарея ${Math.round(avg(rad) * 100)}%, рама ${Math.round(avg(fr) * 100)}%`, done: avg(rad) > 0.95 && avg(fr) > 0.95 },
    { text: 'Заделать дыру в коридоре', sub: JOB.hole.state === 'calendar' ? 'завешена календарём' : JOB.hole.state === 'patched' ? 'готово' : JOB.hole.prog > 0 ? `${Math.round(JOB.hole.prog * 100)}%` : 'кирпич видно', done: JOB.hole.state !== 'open' },
    { text: 'Поменять кран на кухне', sub: ['старый висит', 'крана нет', 'новый стоит'][JOB.tap.stage], done: JOB.tap.stage === 2 },
    { text: 'Покормить кота', sub: JOB.cat.fed ? 'сыт' : 'орёт', done: JOB.cat.fed },
  ];
}
function refreshTasks() {
  const list = $('taskList'); if (!list) return;
  const html = taskState().map((t) => `<li class="${t.done ? 'done' : ''}">${t.text}<small>${t.sub}</small></li>`).join('');
  if (list.dataset.h !== html) { list.dataset.h = html; list.innerHTML = html; }
}

/* ---------- ТОЧНЫЙ СПИСОК КОСЯКОВ ---------- */
// каждый косяк: что именно видно, где стоять бабушке, куда смотреть, насколько серьёзно
function collectFlaws() {
  const F = [];
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const add = (o) => F.push(Object.assign({ sev: 2, max: 3000, hidden: false, find: 1 }, o));
  const rad = JOB.paint.filter((p) => p.group === 'radiator'), fr = JOB.paint.filter((p) => p.group === 'frame');
  // прихожая
  const h = JOB.hole;
  if (h.state === 'calendar') add({ id: 'hole_cal', room: 'hall', title: 'Дыра под календарём', fact: 'дыра в стене прихожей НЕ заделана, её просто завесили старым календарём за сентябрь 1975 года; под календарём кирпич и торчит провод', sev: 3, max: 6000, hidden: true, find: 0.55, where: V(2.9, 1.3, 3.93), stand: [2.95, 4.85] });
  else if (h.state === 'open') add({ id: 'hole_open', room: 'hall', title: 'Дыра в стене', fact: h.prog > 0.05 ? `дыра в стене прихожей заделана только на ${Math.round(h.prog * 100)}%, видны кирпичи и провод` : 'дыра в стене прихожей так и не заделана: видны кирпичи и торчит провод', sev: 3, max: 6000, where: V(2.9, 1.3, 3.93), stand: [2.95, 4.85] });
  else if (h.lumps > 3) add({ id: 'hole_lumps', room: 'hall', title: 'Шпаклёвка буграми', fact: `дыра заделана, но шпаклёвка легла буграми: ${h.lumps} наплывов`, sev: 1, max: 1500, where: V(2.9, 1.3, 3.93), stand: [2.95, 4.85] });
  if (JOB.missed > 0) add({ id: 'calls', room: 'hall', title: 'Не брал трубку', fact: `мастер ${JOB.missed === 1 ? 'один раз не взял' : JOB.missed + ' раза не взял'} трубку, когда хозяйка звонила`, sev: 1, max: 1000, where: V(3.25, 1.1, 5.45), stand: [3.3, 4.6] });
  // зал: обои
  const done = JOB.strips.filter((s) => s.done);
  const miss = 12 - done.length;
  const firstMiss = JOB.strips.find((s) => !s.done);
  const standFor = (s) => s.wall === 'W' ? [1.35, THREE.MathUtils.clamp((s.a + s.b) / 2, 1.5, 3.2)] : s.wall === 'S' ? [THREE.MathUtils.clamp((s.a + s.b) / 2, 0.6, 3.6), 2.7] : [3.7, THREE.MathUtils.clamp((s.a + s.b) / 2, 0.8, 3.3)];
  if (miss > 0) add({ id: 'wp_missing', room: 'zal', title: 'Обои не доклеены', fact: done.length ? `обои в зале поклеены только на ${done.length} из 12 полос, на остальных ${plural(miss, 'полосе', 'полосах', 'полосах')} висят старые выцветшие обои` : 'обои в зале вообще не поклеены: висят старые выцветшие', sev: miss > 6 ? 3 : 2, max: Math.min(10000, miss * 900), where: firstMiss.center, stand: standFor(firstMiss) });
  const flipped = done.filter((s) => s.flipped);
  if (flipped.length) add({ id: 'wp_upside', room: 'zal', title: 'Обои вверх ногами', fact: `${plural(flipped.length, 'полоса', 'полосы', 'полос')} обоев из ${done.length} поклеены вверх ногами: маки растут вниз, птички висят вниз головой`, sev: 2, max: Math.min(6000, flipped.length * 1500), where: flipped[0].center, stand: standFor(flipped[0]) });
  const tilted = done.filter((s) => Math.abs(s.tilt) > THREE.MathUtils.degToRad(1.3) || Math.abs(s.off) > 0.02);
  if (tilted.length) {
    const worst = tilted.reduce((a, b) => (Math.abs(b.tilt) > Math.abs(a.tilt) ? b : a));
    const deg = Math.abs(THREE.MathUtils.radToDeg(worst.tilt)), gap = Math.round((Math.abs(Math.sin(worst.tilt)) * 2.4 + Math.abs(worst.off)) * 100);
    add({ id: 'wp_tilt', room: 'zal', title: 'Обои криво', fact: `${plural(tilted.length, 'полоса', 'полосы', 'полос')} обоев висят криво: самая — с наклоном ${deg.toFixed(1)}°, внизу между полосами щель до ${gap} см, в неё видно старые обои; узор на стыках не совпадает`, sev: deg > 3 ? 2 : 1, max: 4000, where: worst.center, stand: standFor(worst) });
  }
  if (JOB.carpet.covered) add({ id: 'wp_carpet', room: 'zal', title: 'Обои на ковре', fact: 'новые обои поклеены прямо ПОВЕРХ ковра, висевшего на стене: ковёр замурован под обоями, стена вздулась горбом, снизу из-под обоев торчит бахрома', sev: 3, max: 8000, where: V(0.05, 1.45, 2.25), stand: [1.45, 2.25] });
  else if (!JOB.carpet.onWall) add({ id: 'carpet_down', room: 'zal', title: 'Ковёр не повешен', fact: 'ковёр сняли со стены и бросили свёрнутым на полу у дивана, обратно не повесили', sev: 1, max: 1500, where: V(1.3, 0.2, 3.45), stand: [1.8, 2.8] });
  if (JOB.sw.covered) add({ id: 'wp_switch', room: 'zal', title: 'Выключатель под обоями', fact: 'выключатель у двери в зал заклеен обоями: свет в зале не включить, на его месте бугорок', sev: 2, max: 3000, where: V(3.72, 1.45, 3.8), stand: [3.5, 2.9] });
  // зал: покраска
  const avg = (a) => a.reduce((s, p) => s + p.cov, 0) / a.length;
  const radAvg = avg(rad), frAvg = avg(fr);
  if (radAvg < 0.93) { const bad = rad.filter((p) => p.cov < 0.8).length; add({ id: 'paint_rad', room: 'zal', title: 'Батарея недокрашена', fact: radAvg < 0.05 ? 'батарея под окном не покрашена вообще, ржавая' : `батарея покрашена на ${Math.round(radAvg * 100)}%: ${plural(bad, 'секция', 'секции', 'секций')} из 8 в ржавчине и разводах`, sev: 2, max: 3000, where: V(2.05, 0.4, 0.14), stand: [2.1, 1.35] }); }
  if (frAvg < 0.93) add({ id: 'paint_frame', room: 'zal', title: 'Рама облезлая', fact: frAvg < 0.05 ? 'оконная рама в зале не покрашена, облезлая' : `оконная рама в зале покрашена на ${Math.round(frAvg * 100)}%, пятнами`, sev: 1, max: 2000, where: V(2.05, 1.5, -0.12), stand: [2.1, 1.35] });
  const cnt = {}; JOB.splats.forEach((s) => { cnt[s.tag] = (cnt[s.tag] || 0) + 1; });
  const tv = (cnt.tv || 0) + (cnt.tvScreen || 0);
  if (tv) add({ id: 'paint_tv', room: 'zal', title: 'Краска на телевизоре', fact: `на телевизоре ${plural(tv, 'пятно', 'пятна', 'пятен')} белой масляной краски${cnt.tvScreen ? `, из них ${cnt.tvScreen} прямо на экране` : ''}`, sev: tv > 4 ? 3 : 2, max: 5000, where: V(0.62, 0.82, 0.62), stand: [1.55, 1.5] });
  if (cnt.cat) add({ id: 'paint_cat', room: 'zal', title: 'Кот в краске', fact: `кот Барсик в белых пятнах масляной краски (${plural(cnt.cat, 'пятно', 'пятна', 'пятен')})`, sev: 2, max: 3000, where: PEOPLE.cat ? PEOPLE.cat.root.position.clone().setY(0.4) : V(0.5, 0.5, 1.6), stand: [1.4, 1.6] });
  const misc = [['carpet', 'на ковре'], ['sofa', 'на диване'], ['armchair', 'на кресле'], ['curtain', 'на шторах и тюле'], ['glass', 'на оконном стекле'], ['serv', 'на серванте с хрусталём'], ['floor', 'на паркете'], ['rug', 'на паласе'], ['newwall', 'на новых обоях'], ['wall', 'на стенах'], ['sill', 'на подоконнике'], ['table', 'на столе и скатерти'], ['clock', 'на часах'], ['painting', 'на картине'], ['books', 'на книгах'], ['chair', 'на стульях'], ['ceiling', 'на потолке'], ['lamp', 'на торшере']]
    .filter(([k]) => cnt[k] > 0).map(([k, w]) => `${w} — ${cnt[k]}`);
  if (misc.length) { const total = misc.reduce((s, x) => s + +x.split('— ')[1], 0); add({ id: 'paint_misc', room: 'zal', title: 'Кляксы краски', fact: `кляксы белой краски по всему залу: ${misc.slice(0, 6).join('; ')}`, sev: total > 12 ? 2 : 1, max: total > 12 ? 4000 : 2000, where: V(1.6, 0.6, 1.0), stand: [2.3, 1.9] }); }
  // кухня
  const T = JOB.tap;
  if (T.stage === 0) add({ id: 'tap_old', room: 'kit', title: 'Кран не поменян', fact: 'кран на кухне так и не поменян: висит старый', sev: 2, max: 3500, where: V(7.5, 1.02, 0.85), stand: [6.55, 1.15] });
  if (T.stage === 1) add({ id: 'tap_none', room: 'kit', title: 'Крана нет', fact: 'старый кран на кухне скручен, а новый не поставлен: из стены торчит голая труба', sev: 3, max: 6000, where: V(7.5, 1.02, 0.85), stand: [6.55, 1.15] });
  if (T.valveClosed && T.stage === 2) add({ id: 'valve', room: 'kit', title: 'Вода перекрыта', fact: 'на кухне перекрыт вентиль — из нового крана не идёт вода, хозяйке не сказали', sev: 1, max: 1000, where: V(7.47, 0.45, 0.8), stand: [6.55, 1.15] });
  if (T.liters > 12) add({ id: 'flood', room: 'kit', title: 'Потоп на кухне', fact: `на кухне был потоп: на пол вылилось около ${Math.round(T.liters)} литров, лужа под мойкой`, sev: 3, max: 6000, where: V(7.1, 0.05, 0.95), stand: [6.4, 1.6] });
  else if (T.drip && !T.valveClosed) add({ id: 'drip', room: 'kit', title: 'Капает под мойкой', fact: 'новый кран поставлен без льна на резьбе: под мойкой капает, на полу лужа', sev: 2, max: 2500, where: V(7.3, 0.4, 0.8), stand: [6.55, 1.15] });
  if (G.beers > 0) add({ id: 'beer', room: 'kit', title: 'Пиво для Толика', fact: `мастер выпил ${plural(G.beers, 'бутылку', 'бутылки', 'бутылок')} пива из ящика, который хозяйка берегла для зятя Толика; пустые бутылки стоят рядком на подоконнике кухни`, sev: G.beers > 3 ? 2 : 1, max: G.beers * 400 + 500, where: V(6.3, 0.95, -0.05), stand: [6.25, 1.25] });
  if (!JOB.cat.fed) add({ id: 'cat', room: 'kit', title: 'Кот голодный', fact: 'кота Барсика так и не покормили, миска пустая, кот орёт', sev: 1, max: 1000, where: V(6.7, 0.1, 3.55), stand: [6.35, 2.75] });
  // ванная
  const placed = JOB.tiles.cells.filter((c) => c.mesh);
  if (placed.length < 20) add({ id: 'tile_missing', room: 'bath', title: 'Плитка не доложена', fact: placed.length ? `плитки над ванной положено только ${placed.length} из 20, на месте остальных голый цемент` : 'плитку над ванной вообще не положили: голый цемент в разводах клея', sev: placed.length < 10 ? 3 : 2, max: Math.min(8000, (20 - placed.length) * 400), where: V(0.95, 1.35, 5.58), stand: [1.4, 4.55] });
  const crooked = placed.filter((c) => Math.abs(c.rot) > THREE.MathUtils.degToRad(2.2) || Math.hypot(c.dx, c.dy) > 0.015);
  if (crooked.length) { const w = crooked.reduce((a, b) => (Math.abs(b.rot) > Math.abs(a.rot) ? b : a)); add({ id: 'tile_crooked', room: 'bath', title: 'Плитка кривая', fact: `${plural(crooked.length, 'плитка', 'плитки', 'плиток')} из ${placed.length} положены криво: самая повёрнута на ${Math.abs(THREE.MathUtils.radToDeg(w.rot)).toFixed(0)}°, швы гуляют до ${Math.round(Math.max(...crooked.map((c) => Math.hypot(c.dx, c.dy))) * 1000)} мм`, sev: crooked.length > 6 ? 3 : 2, max: 5000, where: V(w.x, w.y, 5.58), stand: [1.4, 4.55] }); }
  const flippedT = placed.filter((c) => c.flipped);
  if (flippedT.length) add({ id: 'tile_decor', room: 'bath', title: 'Кораблик тонет', fact: `${flippedT.length === 1 ? 'декоративная плитка с корабликом положена' : flippedT.length + ' декоративные плитки с корабликом положены'} вверх ногами — кораблик плывёт вверх дном`, sev: 1, max: 1200, where: V(flippedT[0].x, flippedT[0].y, 5.58), stand: [1.4, 4.55] });
  // сосед снизу
  if (JOB.gena.told) add({ id: 'gena', room: 'hall', title: 'Залил соседа', fact: `сосед снизу Геннадий звонил хозяйке и жаловался: у него с потолка течёт${JOB.gena.demand ? `, требует ${JOB.gena.demand} ₽ за побелку` : ''}`, sev: 3, max: 5000, where: V(7.0, 1.3, 5.55), stand: [6.3, 4.7] });
  return F;
}
// сколько бабушка заметит: скрытое находится с вероятностью
function visibleFlaws() {
  const all = collectFlaws();
  const found = all.filter((f) => !f.hidden || Math.random() < f.find);
  const missed = all.filter((f) => !found.includes(f));
  return { all, found, missed };
}

function initJobs() {
  _ray = new THREE.Raycaster();
  initStrips(); initCarpetSwitch(); initTiles(); initPaint(); initHole(); initTap(); initMisc();
  pickList = W.inter.concat(W.occl);
}
