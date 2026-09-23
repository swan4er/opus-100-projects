'use strict';
/* ==========================================================================
   «Девочка и ветер» · render.js
   Сборка кадра по времени t: небо → слои в дымке → главный план →
   передний план → свет → титры и диафрагма → плёнка.
   ========================================================================== */

const FONT_TITLE = '"Cormorant", "Cormorant Garamond", Georgia, "Times New Roman", serif';
/** В режиме съёмки холсты рисуются процессором: программный GPU сервера слишком медленно заливает тысячи кривых. */
const CTX_OPTS = window.__SHOT__ ? { willReadFrequently: true } : undefined;

/* ---------- Вспомогательные холсты ---------- */
const _off = {};
function offscreen(name, W, H) {
  let o = _off[name];
  if (!o) { const cv = document.createElement('canvas'); o = _off[name] = { cv, ctx: cv.getContext('2d', CTX_OPTS) }; }
  if (o.cv.width !== W || o.cv.height !== H) { o.cv.width = W; o.cv.height = H; }
  return o;
}
let _grain = null;
const _grainPat = new WeakMap();
function grainPattern(ctx) {
  let pat = _grainPat.get(ctx);
  if (pat) return pat;
  if (!_grain) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 160;
    const g = cv.getContext('2d');
    const img = g.createImageData(160, 160);
    const R = rng(77);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = R() < 0.5 ? 0 : 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = Math.floor(R() * R() * 150);
    }
    g.putImageData(img, 0, 0);
    _grain = cv;
  }
  pat = ctx.createPattern(_grain, 'repeat');
  _grainPat.set(ctx, pat);
  return pat;
}

/* ---------- Небо целиком (для «возвращения цвета») ---------- */
function drawSkyAll(ctx, k, cam, t, pal, opts) {
  skyTf(ctx, k, cam);
  drawSkyGradient(ctx, pal);
  drawStars(ctx, pal, opts.stars, t);
  const sun = sunAt(t);
  if (sun) drawSun(ctx, sun, pal, t);
  const moon = moonAt(t);
  if (moon) drawMoon(ctx, Object.assign({}, moon, { a: moon.a * (opts.moonK || 1) }), pal, t);
  drawClouds(ctx, pal, millAngle(t) * 3.2, t, opts.clouds);
}
function cloudAmt(t) { return key([[0, 0.9], [30, 0.7], [50, 1], [64, 0.8], [84, 0.35], [BURST_T, 0.3], [BURST_T + 3, 0.45]], t); }

/* ---------- Главная декорация: холм с деревом ---------- */
function drawHillSet(ctx, k, cam, t, shot) {
  const pal = skyAt(t);
  WORLD.life = lifeAt(t);
  const windFn = windSampler(t);

  // 1. Небо; в момент освобождения живой цвет разливается от банки
  const bloom = t > BURST_T - 0.05 && t < BURST_T + 3.2;
  if (bloom) {
    const dull = PAL.dull;
    drawSkyAll(ctx, k, cam, t, dull, { stars: 0.22, clouds: cloudAmt(t), moonK: 0.35 });
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const o = offscreen('bloom', W, H);
    o.ctx.setTransform(1, 0, 0, 1, 0, 0);
    o.ctx.clearRect(0, 0, W, H);
    drawSkyAll(o.ctx, k, cam, t, PAL.night, { stars: 1, clouds: cloudAmt(t), moonK: 1 / Math.max(0.35, moonAt(t).a) });
    const J = jarAt(t);
    const js = worldToScreen(cam, J.x, J.y - 40);
    const R = 2600 * EASE.out3(clamp((t - BURST_T + 0.05) / 2.6)) * k;
    o.ctx.setTransform(1, 0, 0, 1, 0, 0);
    o.ctx.globalCompositeOperation = 'destination-in';
    const g = o.ctx.createRadialGradient(js[0] * k, js[1] * k, Math.max(1, R * 0.55), js[0] * k, js[1] * k, Math.max(2, R));
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    o.ctx.fillStyle = g;
    o.ctx.fillRect(0, 0, W, H);
    o.ctx.globalCompositeOperation = 'source-over';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(o.cv, 0, 0);
  } else {
    drawSkyAll(ctx, k, cam, t, pal, { stars: starsAt(t), clouds: cloudAmt(t) });
  }

  // 2. Дальний хребет
  layerTf(ctx, k, cam, 0.1, 0.1, 0.1);
  let sp = layerSpan(cam, 0.1, 0.1);
  fillRidge(ctx, ridgeFar, sp[0], sp[1], cmix(INK, pal.fog, 0.64), cmix(INK, pal.fog, 0.5), 520);

  // 3. Средний план: холмы, деревца, мельница, озеро с лодкой
  layerTf(ctx, k, cam, 0.3, 0.3, 0.3);
  sp = layerSpan(cam, 0.3, 0.3);
  const midCol = cmix(INK, pal.fog, 0.42);
  fillRidge(ctx, ridgeMid, sp[0], sp[1], midCol, cmix(INK, pal.fog, 0.3), 600);
  ctx.fillStyle = rgba(midCol);
  drawMidTrees(ctx, sp[0], sp[1], windFn(400, t) * WORLD.life, t);
  drawWindmill(ctx, 430, ridgeMid(430) + 4, 0.82, millAngle(t));
  const ripple = clamp(Math.abs(windFn(900, t)) * 0.9) * WORLD.life + 0.04;
  drawLake(ctx, pal, t, ripple, millAngle(t) * 2);
  const bx = 760 + millAngle(t) * 4.5;
  const billow = clamp(Math.abs(windTable(t < BURST_T ? t : BURST_T + 6)) * 1.1);
  ctx.fillStyle = rgba(cmix(midCol, pal.hor, 0.12), 0.35 * (1 - ripple));
  drawBoat(ctx, bx, 712, 0.7, billow, t, true);
  ctx.fillStyle = rgba(midCol);
  drawBoat(ctx, bx, 712, 0.7, billow, t, false);

  // 4. Ближние холмы
  layerTf(ctx, k, cam, 0.55, 0.55, 0.55);
  sp = layerSpan(cam, 0.55, 0.55);
  fillRidge(ctx, ridgeNear, sp[0], sp[1], cmix(INK, pal.fog, 0.22), cmix(INK, pal.fog, 0.12), 700);

  // 5. Главный план
  layerTf(ctx, k, cam, 1, 1, 1);
  const mainTf = ctx.getTransform();
  sp = layerSpan(cam, 1, 1);
  const S = spiritQ(t);
  // свет духа — «за бумагой»: перед дымкой, позади чёрных силуэтов
  if (S && S.a > 0) drawSpiritGlow(ctx, S[0], S[1], 300, pal.glow, 0.55 * S.a);
  const J = jarAt(t);
  if (t > BURST_T - 1 && t < BURST_T + 6) {
    const a = win(BURST_T - 1, BURST_T, BURST_T + 1.5, BURST_T + 6, t);
    drawSpiritGlow(ctx, J.x, J.y - 200, 900 * (0.3 + 0.7 * sstep(BURST_T, BURST_T + 2, t)), pal.glow, 0.9 * a);
  }
  // свет банки-фонарика — тоже за бумагой
  drawJarLight(ctx, t, J, G_S, pal);
  const jarLight = jarLightAt(t, pal);

  ctx.fillStyle = INK_CSS;
  ctx.beginPath();
  ctx.moveTo(sp[0] - 20, 3000);
  for (let x = sp[0] - 20; x <= sp[1] + 20; x += 10) ctx.lineTo(x, groundY(x));
  ctx.lineTo(sp[1] + 20, 3000);
  ctx.closePath();
  ctx.fill();
  drawGrass(ctx, GRASS_MAIN, sp[0], sp[1], t, windFn, false, groundY, 1);

  const bend = windFn(TREE_X, t) * 0.9;
  const whip = win(BURST_T, BURST_T + 0.3, BURST_T + 1.5, BURST_T + 3, t);
  ctx.fillStyle = INK_CSS;
  drawTree(ctx, TREE_X, groundY(TREE_X) + 6, 1.06, t, bend, whip, 0);
  drawBirds(ctx, birdsAt(t));
  drawPlants(ctx, PLANTS_MAIN, sp[0], sp[1], t, windFn, groundY, 1, (d) => seedsLeft(d, t), 1);

  // змей и банка на земле
  const K = kiteAt(t);
  if (K.ground) drawKite(ctx, K.x, K.y, K.s, K.ang, kiteTail(K, t), t);
  const L = lidAt(t);
  if (J.ground) {
    drawJar(ctx, J.x, J.y, G_S, 0, L.on ? { dx: 0, dy: 0 } : null, jarLight);
    drawJarWind(ctx, t, J, G_S);
  }
  if (!L.on && t > 92.1) drawLid(ctx, L.x, L.y, G_S, L.a);

  // девочка; то, что в руках, — между её руками
  const { P } = girlAt(t);
  const env = airAt(t);
  env.t = t;
  ctx.fillStyle = INK_CSS;
  drawGirl(ctx, P, env, () => {
    ctx.save();
    ctx.setTransform(mainTf);
    if (!J.ground) {
      drawJar(ctx, J.x, J.y, G_S, J.ang, L.on ? { dx: 0, dy: 0 } : null, jarLight);
      drawJarWind(ctx, t, J, G_S);
    }
    if (!L.on && t < 92.1) drawLid(ctx, L.x, L.y, G_S, L.a);
    if (!K.ground && !K.string && !K.looseEnd) drawKite(ctx, K.x, K.y, K.s, K.ang, kiteTail(K, t), t);
    ctx.restore();
  });
  ctx.setTransform(mainTf);

  // змей в небе и леска
  if (!K.ground && (K.string || K.looseEnd)) {
    const h = K.string || K.looseEnd;
    const L2 = Math.hypot(K.x - h[0], K.y - h[1]);
    ctx.strokeStyle = INK_CSS;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(h[0], h[1]);
    ctx.quadraticCurveTo((h[0] + K.x) / 2 + L2 * 0.05, (h[1] + K.y) / 2 + L2 * 0.1, K.x, K.y + 6);
    ctx.stroke();
    drawKite(ctx, K.x, K.y, K.s, K.ang, kiteTail(K, t), t);
  }

  drawGrass(ctx, GRASS_MAIN, sp[0], sp[1], t, windFn, true, groundY, 1);

  // дух: поток семян и завитки; замершие семена; вихрь освобождения
  ctx.fillStyle = INK_CSS;
  drawSpiritParticles(ctx, t, spiritQ, 1);
  if (S && S.a > 0) drawSpiritCurls(ctx, t, spiritQ, 1, S.a);
  if (t > BURST_T - 0.1 && t < BURST_T + 7) {
    const Jb = jarAt(BURST_T);
    drawBurst(ctx, t, Jb.x, Jb.y - 50, 1);
  }


  // 6. Передний план — высокая трава у самой камеры
  if (shot.fg) {
    layerTf(ctx, k, cam, 1.3, 1.3, 1.3);
    sp = layerSpan(cam, 1.3, 1.3);
    ctx.fillStyle = INK_CSS;
    const yFn = () => shot.fg;
    drawGrass(ctx, GRASS_FG, sp[0], sp[1], t, windFn, false, yFn, 1);
    drawPlants(ctx, PLANTS_FG, sp[0], sp[1], t, windFn, yFn, 2.2, (d) => seedsLeft(d, t), 1);
  }
}

/* ---------- Вставки ---------- */
function screenSky(ctx, k, pal, y0, y1) {
  ctx.setTransform(k, 0, 0, k, 0, 0);
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, rgba(pal.top));
  g.addColorStop(0.5, rgba(pal.mid));
  g.addColorStop(0.85, rgba(pal.low));
  g.addColorStop(1, rgba(pal.hor));
  ctx.fillStyle = g;
  ctx.fillRect(-10, -10, 1940, 1100);
}

/** Мельница встала: крупный план, на крыле сидит птица. */
function drawInsertMill(ctx, k, t) {
  const pal = skyAt(t);
  WORLD.life = 0;
  screenSky(ctx, k, pal, -300, 1250);
  const u = (t - 70.4) / 1.3;
  const z = 1 + u * 0.05;
  ctx.setTransform(k * z, 0, 0, k * z, k * (960 - 960 * z), k * (540 - 540 * z));
  // дальний холм в дымке
  ctx.fillStyle = rgba(cmix(INK, pal.fog, 0.45));
  ctx.beginPath();
  ctx.moveTo(-100, 1200);
  for (let x = -100; x <= 2050; x += 20) ctx.lineTo(x, 900 - 40 * Math.exp(-(((x - 1500) / 300) ** 2)) + 10 * fbm(x * 0.004, 2));
  ctx.lineTo(2050, 1200);
  ctx.fill();
  ctx.fillStyle = INK_CSS;
  ctx.beginPath();
  ctx.moveTo(-100, 1200);
  for (let x = -100; x <= 2050; x += 20) ctx.lineTo(x, 1010 - 90 * Math.exp(-(((x - 760) / 520) ** 2)));
  ctx.lineTo(2050, 1200);
  ctx.fill();
  const ang = millAngle(t);
  drawWindmill(ctx, 760, 935, 3.3, ang);
  // птица сидит на самом верхнем крыле
  const hy = 935 - 124 * 3.3;
  let best = null;
  for (let q = 0; q < 4; q++) {
    const aa = ang + (q * PI) / 2;
    const tip = [760 + Math.cos(aa) * 100 * 3.3, hy + Math.sin(aa) * 100 * 3.3];
    if (!best || tip[1] < best[1]) best = tip;
  }
  drawBirds(ctx, [{ x: best[0], y: best[1] - 2, s: 3, perch: true, dir: -1 }]);
  drawGrass(ctx, GRASS_FG, -100, 2050, t, () => 0, false, (x) => 1000 - 90 * Math.exp(-(((x - 760) / 520) ** 2)) + 20, 1);
}

/** Одуванчик: семечко отрывается — и падает вниз, ветра нет. */
function drawInsertDandelion(ctx, k, t) {
  const pal = skyAt(t);
  WORLD.life = 0;
  screenSky(ctx, k, pal, -200, 1300);
  const u = (t - 71.7) / 1.3;
  const z = 1.02 + u * 0.04;
  ctx.setTransform(k * z, 0, 0, k * z, k * (960 - 960 * z), k * (540 - 540 * z));
  // дальняя трава в дымке
  ctx.fillStyle = rgba(cmix(INK, pal.fog, 0.4));
  drawGrass(ctx, GRASS_MAIN, -100, 2050, t, () => 0, false, () => 1130, 1);
  const cx = 1010, cy = 430, r = 170;
  ctx.fillStyle = INK_CSS;
  ctx.beginPath();
  blade(ctx, 930, 1200, 800, 5.5, 0.08);
  // семена-зонтики по кругу
  const N = 64;
  const fallI = 17;
  circle(ctx, cx, cy, 16);
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU + 0.2;
    const ring = i % 2 ? 1 : 0.9;
    let ex = cx + Math.cos(a) * r * ring, ey = cy + Math.sin(a) * r * ring;
    let bx = cx + Math.cos(a) * 16, by = cy + Math.sin(a) * 16;
    let ang = a;
    if (i === fallI) {
      // оторвалось и падает отвесно, медленно поворачиваясь
      const f = clamp((t - 72.0) / 1.0);
      const dy = 520 * f * f + 30 * f;
      bx += 0; by += dy; ex += 0; ey += dy;
      ang = a + f * 0.6;
      ex = bx + Math.cos(ang) * r * ring; ey = by + Math.sin(ang) * r * ring;
    }
    lens(ctx, bx, by, ex, ey, 0.9);
    // зонтик на конце
    for (let j = -3; j <= 3; j++) {
      const aa = ang + j * 0.26;
      lens(ctx, ex, ey, ex + Math.cos(aa) * 26, ey + Math.sin(aa) * 26, 0.55);
    }
    // семечко у основания
    lens(ctx, bx + Math.cos(ang) * 4, by + Math.sin(ang) * 4, bx + Math.cos(ang) * 22, by + Math.sin(ang) * 22, 2.2);
  }
  ctx.fill();
  // передняя трава
  ctx.beginPath();
  for (let i = 0; i < 40; i++) {
    const x = -60 + i * 52 + hash(i) * 30;
    blade(ctx, x, 1120, 170 + hash(i * 3) * 260, 4 + hash(i * 5) * 3, (hash(i * 7) - 0.5) * 0.4);
  }
  ctx.fill();
}

/* ---------- Титры, диафрагма, «Конец» ---------- */
function drawOrnament(ctx, x, y, w, col) {
  ctx.fillStyle = col;
  ctx.beginPath();
  for (const s of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 16; i++) {
      const u = i / 16;
      pts.push([x + s * (18 + u * w * 0.45), y + Math.sin(u * PI * 1.5) * 5]);
    }
    ribbon(ctx, pts, pts.map((_, i) => 0.3 + 1.6 * Math.sin((i / 16) * PI) ** 0.6));
    const e = pts[pts.length - 1];
    const cp = curlPts(e[0], e[1], s > 0 ? -0.6 : PI + 0.6, 34, 1.15, s > 0 ? -1 : 1, 10);
    ribbon(ctx, cp, taper(cp.length, 1.5, 0.3));
  }
  poly(ctx, [[x - 9, y], [x, y - 7], [x + 9, y], [x, y + 7]]);
  circle(ctx, x, y, 2.2, true);
  ctx.fill();
}

function drawTitle(ctx, k, t) {
  const a = sstep(0.9, 2.3, t) * (1 - sstep(6.4, 7.9, t));
  if (a <= 0) return;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  const lift = 10 * (1 - EASE.out(sstep(0.9, 3.2, t)));
  const y = 250 + lift;
  ctx.globalAlpha = a;
  ctx.fillStyle = INK_CSS;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  if ('letterSpacing' in ctx) ctx.letterSpacing = '9px';
  ctx.font = `500 30px ${FONT_TITLE}`;
  ctx.fillText('театр теней', 960, y - 98);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '1px';
  ctx.font = `600 124px ${FONT_TITLE}`;
  ctx.fillText('Девочка и ветер', 960, y);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  drawOrnament(ctx, 960, y + 50, 420, INK_CSS);
  ctx.globalAlpha = 1;
}

/** Диафрагма: круглая маска с кружевным краем. */
function drawIris(ctx, k, cx, cy, R) {
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.fillStyle = INK_CSS;
  ctx.beginPath();
  ctx.rect(-20, -20, 1960, 1120);
  if (R > 0.5) circle(ctx, cx, cy, R, true);
  ctx.fill();
  if (R > 8) {
    ctx.beginPath();
    const n = Math.max(12, Math.floor((R * TAU) / 26));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      circle(ctx, cx + Math.cos(a) * R, cy + Math.sin(a) * R, 7);
      circle(ctx, cx + Math.cos(a) * (R - 6), cy + Math.sin(a) * (R - 6), 2.2, true);
    }
    ctx.fill('evenodd');
  }
}

function drawEnd(ctx, k, t) {
  const a = sstep(110.5, 111.4, t);
  if (a <= 0) return;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  const cream = 'rgba(236, 222, 196, ' + a.toFixed(3) + ')';
  ctx.fillStyle = cream;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  if ('letterSpacing' in ctx) ctx.letterSpacing = '2px';
  ctx.font = `600 96px ${FONT_TITLE}`;
  ctx.fillText('Конец', 960, 560);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  drawOrnament(ctx, 960, 612, 300, cream);
}

/* ---------- Плёнка ---------- */
function drawFilm(ctx, W, H, t) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 1.0);
  g.addColorStop(0, 'rgba(8,4,4,0)');
  g.addColorStop(1, 'rgba(8,4,4,0.52)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const fr = Math.floor(t * 24);
  const fl = 0.012 + 0.02 * hash(fr * 3 + 1);
  ctx.fillStyle = 'rgba(10,6,4,' + fl.toFixed(3) + ')';
  ctx.fillRect(0, 0, W, H);
  const pat = grainPattern(ctx);
  const ox = Math.floor(hash(fr) * 160), oy = Math.floor(hash(fr + 99) * 160);
  ctx.save();
  ctx.globalAlpha = 0.07;
  ctx.translate(-ox, -oy);
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, W + 160, H + 160);
  ctx.restore();
  // редкие пылинки и волоски на плёнке
  if (hash(fr * 7 + 3) > 0.83) {
    const k = W / 1920;
    ctx.fillStyle = 'rgba(12,8,6,0.55)';
    ctx.beginPath();
    const x = hash(fr * 11) * W, y = hash(fr * 13) * H;
    if (hash(fr * 17) > 0.5) circle(ctx, x, y, (1 + hash(fr * 19) * 2) * k);
    else {
      const pts = [];
      for (let i = 0; i < 8; i++) pts.push([x + i * 5 * k, y + Math.sin(i * 0.9 + fr) * 6 * k]);
      ribbon(ctx, pts, taper(8, 0.8 * k, 0.3 * k));
    }
    ctx.fill();
  }
}

/* ---------- Кадр ---------- */
function drawShot(ctx, W, H, shot, t) {
  const k = W / 1920;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (shot.insert === 'mill') return drawInsertMill(ctx, k, t);
  if (shot.insert === 'dandelion') return drawInsertDandelion(ctx, k, t);
  drawHillSet(ctx, k, camAt(shot, t), t, shot);
}

/** Полный кадр фильма в момент t на холсте W×H. */
function renderFrame(ctx, W, H, t, opts) {
  t = clamp(t, 0, DURATION);
  const k = W / 1920;
  const i = shotAt(t);
  const shot = SHOTS[i];
  drawShot(ctx, W, H, shot, t);
  // наплыв из предыдущего плана
  const prev = SHOTS[i - 1];
  if (prev && prev.dissolveOut && t - shot.t0 < prev.dissolveOut) {
    const u = (t - shot.t0) / prev.dissolveOut;
    const o = offscreen('dissolve', W, H);
    drawShot(o.ctx, W, H, prev, t);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1 - EASE.io(u);
    ctx.drawImage(o.cv, 0, 0);
    ctx.globalAlpha = 1;
  }
  // вспышка освобождения
  const flash = win(BURST_T - 0.02, BURST_T + 0.05, BURST_T + 0.1, BURST_T + 0.7, t);
  if (flash > 0) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = 'rgba(255,236,200,' + (0.55 * flash).toFixed(3) + ')';
    ctx.fillRect(0, 0, W, H);
  }
  drawTitle(ctx, k, t);
  // диафрагма в финале
  if (t > 108.2) {
    const cam = camAt(shot, t);
    const c = worldToScreen(cam, girlAt(t).P.x + 30, girlAt(t).P.y - 60);
    const R = 1500 * (1 - EASE.in3(clamp((t - 108.2) / 2.2)));
    drawIris(ctx, k, c[0], c[1], R);
  }
  drawEnd(ctx, k, t);
  // проявка из темноты в начале
  const fade = 1 - sstep(0, 1.1, t);
  if (fade > 0) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = 'rgba(11,7,7,' + fade.toFixed(3) + ')';
    ctx.fillRect(0, 0, W, H);
  }
  if (!opts || !opts.noFilm) drawFilm(ctx, W, H, t);
}
