'use strict';
/* ==========================================================================
   Движок фильма: таймлайн планов, переходы, надписи, рамка и лак.
   Кадр — чистая функция времени t: renderFilm(ctx, base, t).
   Сами сцены — в scenes.js.
   ========================================================================== */

const FILM = {
  dur: 118.75,
  cover: 30.95, // обложка: Иван повис на хвосте Жар-птицы
  chapters: [
    { name: 'Сад', t: 0 },
    { name: 'Полночь', t: 21.25 },
    { name: 'Распутье', t: 40 },
    { name: 'Серый волк', t: 62.5 },
    { name: 'Долго ли, коротко ли', t: 75 },
    { name: 'Прощание', t: 92.5 },
  ],
  captions: [],
  shots: [],
};

/* общие картины строятся лениво, один раз. Сборщик может быть генератором:
   тогда фон заранее достраивается по кусочкам в простое (см. prewarm в player.js) */
const PICS = {}, GENS = {}, BUILDERS = [];
function finishBuild(name, g) {
  let r;
  while (!(r = g.next()).done);
  delete GENS[name];
  return r.value;
}
function lazy(name, build) {
  if (PICS[name]) return PICS[name];
  const g = GENS[name] || build();
  const v = g && typeof g.next === 'function' ? finishBuild(name, g) : g;
  PICS[name] = v;
  return v;
}
/* регистрация сборщика для заблаговременной постройки */
function builder(name, build) { BUILDERS.push([name, build]); return build; }
/* шаг заблаговременной постройки: не дольше budget мс; true — всё готово */
function prewarmStep(budget) {
  const t0 = performance.now();
  for (const [name, build] of BUILDERS) {
    if (PICS[name] && PICS[name].__baked) continue;
    if (!PICS[name]) {
      const g = GENS[name] || (GENS[name] = build());
      if (typeof g.next !== 'function') { PICS[name] = g; delete GENS[name]; }
      else {
        while (performance.now() - t0 < budget) {
          const r = g.next();
          if (r.done) { PICS[name] = r.value; delete GENS[name]; break; }
        }
        if (!PICS[name]) return false;
      }
    }
    // запекание: по одной картине за шаг
    const v = PICS[name];
    const pics = v instanceof Pic ? [v] : Object.values(v || {}).filter((x) => x instanceof Pic);
    for (const pic of pics) if (!pic.baked && !pic.bakeStep(t0 + budget)) return false;
    v.__baked = true;
    if (performance.now() - t0 > budget) return false;
  }
  return true;
}

/* состояние отрисовки кадра */
const P = { gold: null, t: 0, ctx: null };
const R = { base: [1, 0, 0] };

/* план: t0..t1, draw(ctx, t, lt); o.fin/o.fout — из чёрного и в чёрное, o.dis — наплыв с предыдущим */
function shot(t0, t1, draw, o = {}) { FILM.shots.push(Object.assign({ t0, t1, draw }, o)); }
/* надпись: pos 'top' | 'bottom' */
function cap(t0, t1, text, pos = 'bottom') { FILM.captions.push({ t0, t1, text, pos }); }

/* ---------- рамка и лак ---------- */
function drawBorder(ctx, base, t, reveal) {
  const pic = lazy('border', buildBorder);
  ctx.setTransform(base[0], 0, 0, base[0], base[1], base[2]);
  const bp = { gold: makeGold(ctx, t * 0.02, 0, 0, W * 0.6, H * 1.2), ctx };
  if (reveal < 1) pic.drawReveal(ctx, bp, reveal, { dur: 0.3, fillLag: 0.1, fillDur: 0.2 });
  else pic.draw(ctx, bp);
}
let grainPat = null;
function drawLacquer(ctx, base, t, sheen = 0) {
  ctx.setTransform(base[0], 0, 0, base[0], base[1], base[2]);
  // мягкий блик лака и виньетка
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, 'rgba(255,245,225,0.045)'); g.addColorStop(0.35, 'rgba(255,245,225,0)');
  g.addColorStop(0.62, 'rgba(255,245,225,0)'); g.addColorStop(0.7, 'rgba(255,245,225,0.018)'); g.addColorStop(0.8, 'rgba(255,245,225,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // проход блика по лаку (финал)
  if (sheen > 0 && sheen < 1) {
    const x = lerp(-600, W + 600, sheen);
    const s = ctx.createLinearGradient(x - 260, 0, x + 260, H * 0.4);
    s.addColorStop(0, 'rgba(255,248,230,0)'); s.addColorStop(0.5, 'rgba(255,248,230,0.09)'); s.addColorStop(1, 'rgba(255,248,230,0)');
    ctx.fillStyle = s; ctx.fillRect(0, 0, W, H);
  }
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 1.05);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.36)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  // зерно темперы
  if (!grainPat) grainPat = ctx.createPattern(SPR.grain, 'repeat');
  ctx.globalAlpha = 0.035;
  ctx.fillStyle = grainPat;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;
  void t;
}

/* ---------- кадр целиком ---------- */
function shotAt(t) {
  const S = FILM.shots;
  for (let i = S.length - 1; i >= 0; i--) if (t >= S[i].t0) return i;
  return 0;
}
function renderShot(ctx, base, sh, t) {
  ctx.save();
  ctx.setTransform(base[0], 0, 0, base[0], base[1], base[2]);
  ctx.beginPath(); ctx.rect(BORDER - 1, BORDER - 1, W - 2 * BORDER + 2, H - 2 * BORDER + 2); ctx.clip();
  ctx.fillStyle = C.lac; ctx.fillRect(0, 0, W, H);
  CAM.par = null;
  sh.draw(ctx, t, t - sh.t0);
  CAM.par = null;
  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}
let BUF = null;
function renderFilm(ctx, base, t) {
  R.base = base; CAM.base = base;
  P.t = t; P.ctx = ctx;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = C.lac;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  P.gold = makeGold(ctx, 0.15 + t * 0.012, -200, -100, W + 200, H + 300);
  const i = shotAt(t), sh = FILM.shots[i], lt = t - sh.t0;
  renderShot(ctx, base, sh, t);
  // наплыв: предыдущий план растворяется поверх нового
  if (sh.dis && lt < sh.dis && i > 0) {
    const cv = ctx.canvas;
    if (!BUF) BUF = document.createElement('canvas');
    if (BUF.width !== cv.width || BUF.height !== cv.height) { BUF.width = cv.width; BUF.height = cv.height; }
    const b = BUF.getContext('2d');
    b.setTransform(1, 0, 0, 1, 0, 0);
    b.clearRect(0, 0, BUF.width, BUF.height);
    P.ctx = b;
    renderShot(b, base, FILM.shots[i - 1], t);
    P.ctx = ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1 - Ease.ioS(lt / sh.dis);
    ctx.drawImage(BUF, 0, 0);
    ctx.globalAlpha = 1;
  }
  // из чёрного и в чёрное
  const fin = sh.fin ? 1 - Ease.ioS(clamp(lt / sh.fin)) : 0;
  const fout = sh.fout ? Ease.ioS(inv(sh.t1 - sh.fout, sh.t1, t)) : 0;
  const k = Math.max(fin, fout);
  if (k > 0.001) {
    ctx.setTransform(base[0], 0, 0, base[0], base[1], base[2]);
    ctx.fillStyle = `rgba(10,7,6,${k})`;
    ctx.fillRect(BORDER - 1, BORDER - 1, W - 2 * BORDER + 2, H - 2 * BORDER + 2);
  }
  drawBorder(ctx, base, t, inv(0.15, 3.6, t));
  drawLacquer(ctx, base, t, FILM.sheen ? FILM.sheen(t) : 0);
}
