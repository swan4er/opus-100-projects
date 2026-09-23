'use strict';
/* ==========================================================================
   Кот-фонарщик · render.js
   Многоплановая камера: у каждой детали есть глубина d, камера — (x, y, dist,
   zoom, sy). Масштаб плана = zoom / (dist + d): дальние стёкла едут медленнее,
   а камера может «пролететь» сквозь планы. Порядок кадра:
   1) детали сцены от дальних к ближним; светящиеся — на отдельный слой E,
      который стирается деталями, стоящими перед ними;
   2) сумерки/ночь — карта тьмы с «дырами» от фонарей поверх сцены (source-atop);
   3) небо и звёзды — позади всего (destination-over);
   4) слой E, свечение ламп, зерно плёнки, виньетка, мерцание.
   Цена кадра: спрайты рисуются с простым билинейным сглаживанием, а при сильном
   сжатии берётся заранее уменьшенная копия (Bake.lod); полосы моря обрезаются
   по гребню ближней полосы; крупные ореолы идут в слой в ¼ разрешения; слой E
   чистится и накладывается только в пределах своих деталей.
   ========================================================================== */

const FRAME_W = 1600, FRAME_H = 900;

const R = {
  cv: null, ctx: null, E: null, ex: null, D: null, dx: null, B: null, bx: null, G: null, gx: null,
  W: 0, H: 0, dens: 1, vign: null, filmPat: null,
  init(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.E = mkCanvas(4, 4); this.ex = this.E.getContext('2d');
    this.D = mkCanvas(4, 4); this.dx = this.D.getContext('2d');
    this.B = mkCanvas(4, 4); this.bx = this.B.getContext('2d');
    this.G = mkCanvas(4, 4); this.gx = this.G.getContext('2d');
  },
  resize(w, h) {
    w = Math.max(160, Math.round(w)); h = Math.max(90, Math.round(h));
    if (w === this.W && h === this.H) return;
    this.W = w; this.H = h; this.dens = w / FRAME_W;
    for (const c of [this.cv, this.E, this.B]) { c.width = w; c.height = h; }
    this.D.width = Math.ceil(w / 5); this.D.height = Math.ceil(h / 5);
    this.G.width = Math.ceil(w / 4); this.G.height = Math.ceil(h / 4);
    // 'medium' строит mip-уровни на каждое сжатие — на CPU-растре это вдвое дороже; мелкие копии даёт Bake.lod
    for (const x of [this.ctx, this.ex, this.bx]) { x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'low'; }
    this.vign = null;
    Bake.setDensity(this.dens);
  },
  /* спрайт в текущей матрице; ch — обрезка снизу в единицах спрайта (полосы моря) */
  blit(x, sp, ch) {
    if (ch === undefined || ch >= sp.y + sp.h) { x.drawImage(sp.c, sp.x, sp.y, sp.w, sp.h); return; }
    const hl = ch - sp.y;
    if (hl <= 0) return;
    const H = sp.c.height, sh = Math.min(H, Math.ceil((hl / sp.h) * H));
    x.drawImage(sp.c, 0, 0, sp.c.width, sh, sp.x, sp.y, sp.w, (sh * sp.h) / H);
  },

  /* матрица плана глубины d: мир → единицы кадра */
  camMat(cam, d) {
    const z = cam.dist + d;
    if (z <= 0.035) return null;
    const k = (cam.zoom || 1) / z, cr = Math.cos(cam.roll || 0), sr = Math.sin(cam.roll || 0);
    const a = k * cr, b = k * sr, c = -k * sr, dd = k * cr;
    const ox = FRAME_W / 2 + (cam.sx || 0) + (cam.shx || 0), oy = FRAME_H / 2 + (cam.sy || 0) + (cam.shy || 0);
    return [a, b, c, dd, ox - a * cam.x - c * cam.y, oy - b * cam.x - dd * cam.y];
  },
  /* точка мира на глубине d → единицы кадра */
  project(cam, x, y, d) {
    const M = this.camMat(cam, d);
    if (!M) return null;
    const p = mApply(M, x, y);
    return [p[0], p[1], M[0] * Math.hypot(1, 0)];
  },

  drawScene(S, ctx) {
    const W = this.W, H = this.H, dn = this.dens, cam = S.cam, ex = this.ex;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, W, H);
    let emRects = [], usedE = false;
    const eu = [Infinity, Infinity, -Infinity, -Infinity];   // общий прямоугольник слоя E
    const items = S.items;
    items.sort((a, b) => (b.d - a.d) || (a.z - b.z));
    const cache = new Map();
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.a !== undefined && it.a <= 0.004) continue;
      let C = cache.get(it.d);
      if (C === undefined) { C = this.camMat(cam, it.d); cache.set(it.d, C); }
      if (!C) continue;
      const M = mMul(C, it.m);
      const d = SPR.get(it.s);
      if (!d) continue;
      const bb = Bake.bounds(d), by1 = it.ch !== undefined ? Math.min(bb[3], it.ch) : bb[3];
      // отсечение: углы спрайта на экране
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let k = 0; k < 4; k++) {
        const px = k & 1 ? bb[2] + 6 : bb[0] - 6, py = k & 2 ? by1 + 8 : bb[1] - 6;
        const X = (M[0] * px + M[2] * py + M[4]) * dn, Y = (M[1] * px + M[3] * py + M[5]) * dn;
        if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y;
      }
      if (x1 < 0 || y1 < 0 || x0 > W || y0 > H) continue;
      let sp = Bake.get(it.s);
      const ta = M[0] * dn, tb = M[1] * dn, tc = M[2] * dn, td = M[3] * dn, te = M[4] * dn, tf = M[5] * dn;
      // сжатие на экране относительно выпечки: сильнее чем вдвое — берём уменьшенную копию
      const kk = Math.sqrt(Math.abs(ta * td - tb * tc)) / sp.s;
      if (kk < 0.5) sp = Bake.lod(sp, kk);
      if (d.em || it.em) {
        ex.setTransform(ta, tb, tc, td, te, tf);
        ex.globalCompositeOperation = it.add ? 'lighter' : 'source-over';
        ex.globalAlpha = it.a ?? 1;
        this.blit(ex, sp, it.ch);
        emRects.push([x0, y0, x1, y1]);
        if (x0 < eu[0]) eu[0] = x0; if (y0 < eu[1]) eu[1] = y0; if (x1 > eu[2]) eu[2] = x1; if (y1 > eu[3]) eu[3] = y1;
        usedE = true;
        // под светящейся деталью в основном слое — её «бумажная» основа не нужна
        continue;
      }
      ctx.setTransform(ta, tb, tc, td, te, tf);
      ctx.globalAlpha = it.a ?? 1;
      this.blit(ctx, sp, it.ch);
      // деталь впереди стирает из слоя E то, что она заслоняет
      if (usedE && eu[0] < x1 && eu[2] > x0 && eu[1] < y1 && eu[3] > y0) {
        for (const r of emRects) {
          if (r[0] < x1 && r[2] > x0 && r[1] < y1 && r[3] > y0) {
            ex.setTransform(ta, tb, tc, td, te, tf);
            ex.globalCompositeOperation = 'destination-out';
            ex.globalAlpha = it.a ?? 1;
            this.blit(ex, sp, it.ch);
            break;
          }
        }
      }
    }
    ctx.globalAlpha = 1;

    // ---- сумерки: карта тьмы с дырами света ----
    const dk = S.dark;
    if (dk && dk.k > 0.003) {
      const D = this.D, dx = this.dx, s = D.width / FRAME_W;
      dx.setTransform(1, 0, 0, 1, 0, 0);
      dx.globalCompositeOperation = 'copy';
      const g = dx.createLinearGradient(0, 0, 0, D.height);
      const top = dk.top || [20, 22, 54], bot = dk.bot || top;
      g.addColorStop(0, `rgba(${top[0]},${top[1]},${top[2]},${dk.k * (dk.kt ?? 1)})`);
      g.addColorStop(1, `rgba(${bot[0]},${bot[1]},${bot[2]},${dk.k * (dk.kb ?? 1)})`);
      dx.fillStyle = g; dx.fillRect(0, 0, D.width, D.height);
      dx.globalCompositeOperation = 'destination-out';
      const lights = S.lights || [];
      const pl = [];
      for (const L of lights) {
        const M = this.camMat(cam, L.d || 0);
        if (!M) continue;
        const p = mApply(M, L.x, L.y), r = L.r * Math.abs(M[0]);
        pl.push([p[0], p[1], r, L]);
        const gg = dx.createRadialGradient(p[0] * s, p[1] * s, 0, p[0] * s, p[1] * s, r * s);
        gg.addColorStop(0, `rgba(0,0,0,${L.k})`); gg.addColorStop(0.45, `rgba(0,0,0,${L.k * 0.62})`); gg.addColorStop(1, 'rgba(0,0,0,0)');
        dx.fillStyle = gg; dx.fillRect(p[0] * s - r * s, p[1] * s - r * s, r * s * 2, r * s * 2);
      }
      dx.globalCompositeOperation = 'source-over';
      for (const [x, y, r, L] of pl) {
        if (!L.warm) continue;
        const c = L.wc || [255, 176, 84];
        const gg = dx.createRadialGradient(x * s, y * s, 0, x * s, y * s, r * s * 0.8);
        gg.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${L.warm})`); gg.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
        dx.fillStyle = gg; dx.fillRect(x * s - r * s, y * s - r * s, r * s * 2, r * s * 2);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-atop';
      ctx.drawImage(D, 0, 0, W, H);
    }

    // ---- небо позади всего ----
    ctx.globalCompositeOperation = 'destination-over';
    const sky = S.sky;
    if (sky) {
      const hz = FRAME_H / 2 + (cam.sy || 0) + (cam.shy || 0), z = cam.zoom || 1;
      for (const st of sky.stars || []) {
        const M = this.camMat(cam, st.d);
        if (!M) continue;
        const p = mApply(M, st.x, st.y);
        if (p[0] < -20 || p[0] > FRAME_W + 20 || p[1] < -20 || p[1] > FRAME_H + 20) continue;
        const sp = Bake.get(st.s), k = st.k * z;
        ctx.setTransform(k * dn, 0, 0, k * dn, p[0] * dn, p[1] * dn);
        ctx.globalAlpha = st.a;
        ctx.drawImage(sp.c, sp.x, sp.y, sp.w, sp.h);
      }
      const drawSky = (id, a) => {
        if (a <= 0.003) return;
        const sp = Bake.get(id);
        ctx.setTransform(z * dn, 0, 0, z * dn, (FRAME_W / 2 + (cam.sx || 0) - FRAME_W / 2 * z) * dn, hz * dn);
        ctx.globalAlpha = a;
        ctx.drawImage(sp.c, sp.x, sp.y, sp.w, sp.h);
      };
      drawSky('sky.night', sky.night);
      if (sky.night < 0.998) drawSky('sky.dusk', 1);   // ночь целиком закрывает закат
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#171A39';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';

    // ---- светящийся слой поверх: только прямоугольник, где есть светящиеся детали ----
    if (usedE) {
      const x0 = Math.max(0, Math.floor(eu[0])), y0 = Math.max(0, Math.floor(eu[1]));
      const x1 = Math.min(W, Math.ceil(eu[2])), y1 = Math.min(H, Math.ceil(eu[3]));
      ex.setTransform(1, 0, 0, 1, 0, 0); ex.globalCompositeOperation = 'source-over'; ex.globalAlpha = 1;
      if (x1 > x0 && y1 > y0) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(this.E, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
        ex.clearRect(x0, y0, x1 - x0, y1 - y0);
      } else ex.clearRect(0, 0, W, H);
    }

    // ---- свечение ламп (линза): мелкое — сразу в кадр, крупное — в слой ¼ и одним наложением ----
    const glows = S.glows || [];
    if (glows.length) {
      const G = this.G, gx = this.gx, gs = G.width / W, gu = [Infinity, Infinity, -Infinity, -Infinity];
      ctx.setTransform(1, 0, 0, 1, 0, 0); gx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'lighter'; gx.globalCompositeOperation = 'lighter';
      for (const Gl of glows) {
        const M = this.camMat(cam, Gl.d || 0);
        if (!M) continue;
        const p = mApply(M, Gl.x, Gl.y), r0 = Gl.r * Math.abs(M[0]) * dn, c = Gl.c || [255, 190, 100];
        const x0 = p[0] * dn, y0 = p[1] * dn;
        if (r0 < 0.5 || x0 + r0 < 0 || x0 - r0 > W || y0 + r0 < 0 || y0 - r0 > H) continue;
        const small = r0 < 40, X = small ? ctx : gx, k = small ? 1 : gs, x = x0 * k, y = y0 * k, r = r0 * k;
        const gg = X.createRadialGradient(x, y, 0, x, y, r);
        gg.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${Gl.a})`);
        gg.addColorStop(0.25, `rgba(${c[0]},${c[1]},${c[2]},${Gl.a * 0.42})`);
        gg.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
        X.fillStyle = gg; X.fillRect(x - r, y - r, r * 2, r * 2);
        if (!small) { gu[0] = Math.min(gu[0], x - r); gu[1] = Math.min(gu[1], y - r); gu[2] = Math.max(gu[2], x + r); gu[3] = Math.max(gu[3], y + r); }
      }
      if (gu[2] > gu[0]) {
        const a0 = Math.max(0, Math.floor(gu[0])), b0 = Math.max(0, Math.floor(gu[1]));
        const a1 = Math.min(G.width, Math.ceil(gu[2])), b1 = Math.min(G.height, Math.ceil(gu[3]));
        if (a1 > a0 && b1 > b0) ctx.drawImage(G, a0, b0, a1 - a0, b1 - b0, a0 / gs, b0 / gs, (a1 - a0) / gs, (b1 - b0) / gs);
        gx.globalCompositeOperation = 'source-over'; gx.clearRect(0, 0, G.width, G.height);
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    // ---- нитки подвешенных букв ----
    if (S.lines && S.lines.length) {
      ctx.setTransform(dn, 0, 0, dn, 0, 0);
      ctx.lineCap = 'round';
      for (const L of S.lines) {
        ctx.strokeStyle = `rgba(236,224,196,${L[4] ?? 0.5})`; ctx.lineWidth = 1.1;
        ctx.beginPath(); ctx.moveTo(L[0], L[1]); ctx.quadraticCurveTo((L[0] + L[2]) / 2 + 1.5, (L[1] + L[3]) / 2, L[2], L[3]); ctx.stroke();
      }
    }
    // ---- экранные детали: титры, карточки ----
    for (const it of S.screen || []) {
      const sp = Bake.get(it.s), M = it.m;
      ctx.setTransform(M[0] * dn, M[1] * dn, M[2] * dn, M[3] * dn, M[4] * dn, M[5] * dn);
      ctx.globalAlpha = it.a ?? 1;
      ctx.drawImage(sp.c, sp.x, sp.y, sp.w, sp.h);
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  },

  /* зерно плёнки, виньетка, мерцание экспозиции, пылинки */
  post(T, S) {
    const ctx = this.ctx, W = this.W, H = this.H, dn = this.dens;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const fr = Math.floor(T * 12);
    if (!this.vign) {
      const v = mkCanvas(W, H), vx = v.getContext('2d');
      const g = vx.createRadialGradient(W / 2, H * 0.48, H * 0.35, W / 2, H * 0.5, Math.hypot(W, H) * 0.62);
      g.addColorStop(0, 'rgba(14,10,24,0)'); g.addColorStop(0.7, 'rgba(14,10,24,0.22)'); g.addColorStop(1, 'rgba(10,6,18,0.62)');
      vx.fillStyle = g; vx.fillRect(0, 0, W, H);
      this.vign = v;
    }
    ctx.drawImage(this.vign, 0, 0);
    // зерно
    const pat = this.filmPat || (this.filmPat = ctx.createPattern(TEX.film, 'repeat'));
    const ox = hash1(fr, 5) * 190, oy = hash1(fr, 6) * 190;
    ctx.save(); ctx.globalAlpha = 0.045; ctx.translate(-ox, -oy); ctx.scale(Math.max(1, dn * 0.9), Math.max(1, dn * 0.9)); ctx.fillStyle = pat; ctx.fillRect(0, 0, W / Math.max(1, dn * 0.9) + 200, H / Math.max(1, dn * 0.9) + 200); ctx.restore();
    // мерцание экспозиции
    const fl = (hash1(fr, 9) - 0.5) * 0.03;
    ctx.fillStyle = fl > 0 ? `rgba(255,236,200,${fl})` : `rgba(8,4,16,${-fl})`;
    ctx.fillRect(0, 0, W, H);
    // редкие пылинки и волоски
    if (hash1(fr, 12) < 0.07) {
      const n = 1 + Math.floor(hash1(fr, 13) * 3);
      ctx.strokeStyle = 'rgba(30,20,20,0.5)'; ctx.fillStyle = 'rgba(30,20,20,0.45)'; ctx.lineWidth = Math.max(1, dn);
      for (let i = 0; i < n; i++) {
        const x = hash1(fr * 7 + i, 14) * W, y = hash1(fr * 7 + i, 15) * H;
        if (hash1(fr + i, 16) < 0.5) { ctx.beginPath(); ctx.arc(x, y, (1 + hash1(i, fr) * 2) * dn, 0, TAU); ctx.fill(); }
        else { ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 14 * dn, y - 8 * dn, x + 22 * dn, y + 6 * dn); ctx.stroke(); }
      }
    }
    // затемнения и шторка-диафрагма
    const P = S.post || {};
    if (P.iris !== undefined && P.iris < 1) {
      const r = P.iris * Math.hypot(W, H) * 0.55, cx = (P.ix ?? 0.5) * W, cy = (P.iy ?? 0.5) * H;
      ctx.fillStyle = '#0E0B16';
      ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.arc(cx, cy, Math.max(0, r), 0, TAU, true); ctx.fill('evenodd');
    }
    if (P.fade) { ctx.fillStyle = `rgba(${P.fc || '14,11,22'},${P.fade})`; ctx.fillRect(0, 0, W, H); }
  },

  render(T) {
    const S = Film.frame(T);
    if (S.dissolve) {
      this.drawScene(S.dissolve.scene, this.bx);
      this.drawScene(S, this.ctx);
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.globalAlpha = 1 - S.dissolve.k;
      this.ctx.drawImage(this.B, 0, 0);
      this.ctx.globalAlpha = 1;
    } else this.drawScene(S, this.ctx);
    this.post(T, S);
    return S;
  },
};
