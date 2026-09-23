/* 067 · Черновик — отрисовка кадра на Canvas 2D: комната, страница, буквы (чернила на бумаге,
   бледные в темноте), курсор со свечением, титр, зерно и виньетка. */
'use strict';

const PAL = {
  room: [14, 16, 21], roomDawn: [58, 66, 82],
  paper: [213, 207, 195], paperDawn: [241, 232, 215],
  ink: [26, 27, 32], inkWarm: [150, 44, 18],
  pale: [98, 95, 90], paleLit: [206, 198, 184], paleWarm: [255, 150, 96],
  accent: [242, 84, 45],
  ui: [128, 124, 116],
};
const rgb = (c, a = 1) => (a >= 1 ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a.toFixed(3)})`);
const mixc = (a, b, u) => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];

function wordsLabel(n) {
  const m10 = n % 10, m100 = n % 100;
  const w = m10 === 1 && m100 !== 11 ? 'слово' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'слова' : 'слов';
  return `${n} ${w}`;
}

class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.W = 1920; this.H = 1080; this.S = 1;
    this.cam = { x: 0, y: 0, z: 1, r: 0 };
    this.gs = { x: 0, y: 0, r: 0, sx: 1, sy: 1, a: 1, k: 0, sel: 0 };
    this.cs = {};
    this._font = '';
    this.tex = this._paperTexture();
    this.grains = [0, 1, 2].map((i) => this._grain(i));
    this.vig = null;
  }

  resize(wDev, hDev) {
    this.cv.width = wDev; this.cv.height = hDev;
    this.W = wDev; this.H = hDev; this.S = wDev / 1920;
    this.vig = this._vignette(wDev, hDev);
    this.pat = null;
  }

  // ——— процедурные текстуры
  _paperTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const x = c.getContext('2d');
    const rnd = mulberry32(7);
    for (let i = 0; i < 2600; i++) {         // волокна
      const px = rnd() * 512, py = rnd() * 512, len = 6 + rnd() * 26, ang = rnd() * Math.PI;
      x.strokeStyle = rnd() < 0.55 ? `rgba(60,50,40,${0.035 + rnd() * 0.05})` : `rgba(255,255,250,${0.05 + rnd() * 0.06})`;
      x.lineWidth = 0.5 + rnd() * 0.9;
      x.beginPath();
      x.moveTo(px, py);
      x.quadraticCurveTo(px + Math.cos(ang + 0.4) * len * 0.5, py + Math.sin(ang + 0.4) * len * 0.5, px + Math.cos(ang) * len, py + Math.sin(ang) * len);
      x.stroke();
    }
    const id = x.getImageData(0, 0, 512, 512);          // мелкое зерно бумаги
    for (let i = 0; i < id.data.length; i += 4) {
      const n = rnd();
      if (n < 0.3) { id.data[i] = id.data[i + 1] = id.data[i + 2] = 40; id.data[i + 3] = Math.max(id.data[i + 3], 10 + rnd() * 16); }
    }
    x.putImageData(id, 0, 0);
    return c;
  }
  _grain(seed) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const x = c.getContext('2d');
    const id = x.createImageData(256, 256);
    const rnd = mulberry32(100 + seed);
    for (let i = 0; i < id.data.length; i += 4) {
      const v = rnd() < 0.5 ? 0 : 255;
      id.data[i] = id.data[i + 1] = id.data[i + 2] = v;
      id.data[i + 3] = 7 + rnd() * 12;
    }
    x.putImageData(id, 0, 0);
    return c;
  }
  _vignette(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(2, w >> 2); c.height = Math.max(2, h >> 2);
    const x = c.getContext('2d');
    const g = x.createRadialGradient(c.width / 2, c.height / 2, c.height * 0.35, c.width / 2, c.height / 2, c.width * 0.72);
    g.addColorStop(0, 'rgba(8,9,12,0)');
    g.addColorStop(1, 'rgba(8,9,12,0.55)');
    x.fillStyle = g;
    x.fillRect(0, 0, c.width, c.height);
    return c;
  }

  // ——— матрица мира
  _world(cam) {
    const k = this.S * cam.z, c = Math.cos(cam.r) * k, s = Math.sin(cam.r) * k;
    // screen = R·(p − cam)·k + center
    this.M = [c, s, -s, c, this.W / 2 - (c * cam.x - s * cam.y), this.H / 2 - (s * cam.x + c * cam.y)];
    this.ctx.setTransform(this.M[0], this.M[1], this.M[2], this.M[3], this.M[4], this.M[5]);
  }
  _setLocal(x, y, r, sx, sy) {
    const M = this.M, c = Math.cos(r), s = Math.sin(r);
    const a = c * sx, b = s * sx, cc = -s * sy, d = c * sy;
    this.ctx.setTransform(
      M[0] * a + M[2] * b, M[1] * a + M[3] * b,
      M[0] * cc + M[2] * d, M[1] * cc + M[3] * d,
      M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]);
  }
  font(f) { if (this._font !== f) { this.ctx.font = f; this._font = f; } }

  // ——— кадр
  draw(film, t) {
    const ctx = this.ctx, E = film.env;
    const screen = E.screen.at(t), dawn = E.dawn.at(t);
    const cam = film.cam.at(t, this.cam);
    this._font = '';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const room = mixc(PAL.room, PAL.roomDawn, dawn);
    ctx.fillStyle = rgb(room);
    ctx.fillRect(0, 0, this.W, this.H);

    this._world(cam);
    const paper = mixc(mixc(PAL.room, PAL.paper, screen), PAL.paperDawn, dawn);

    // свет экрана на столе и в комнате
    if (screen > 0.01) {
      const g = ctx.createRadialGradient(0, 0, 200, 0, 60, 1500);
      g.addColorStop(0, rgb(paper, 0.13 * screen));
      g.addColorStop(0.5, rgb(paper, 0.045 * screen));
      g.addColorStop(1, rgb(paper, 0));
      ctx.fillStyle = g;
      ctx.fillRect(-2600, -2000, 5200, 4400);
      // «пол» — линия строки состояния
      ctx.fillStyle = rgb(mixc(room, paper, 0.12), 0.6 * screen);
      ctx.fillRect(-1400, W.floor + 1, 2800, 2.2);
      ctx.fillStyle = rgb(mixc(room, [0, 0, 0], 0.25), 0.5);
      ctx.fillRect(-1400, W.floor + 3, 2800, 400);
    }

    // страница
    ctx.fillStyle = rgb(paper);
    ctx.fillRect(W.pageL, W.pageT, W.pageR - W.pageL, W.pageB - W.pageT);
    if (screen > 0.01) {
      if (!this.pat) this.pat = ctx.createPattern(this.tex, 'repeat');
      if (this.pat.setTransform) this.pat.setTransform(new DOMMatrix([1.3, 0, 0, 1.3, 0, 0]));
      ctx.globalAlpha = 0.85 * screen;
      ctx.fillStyle = this.pat;
      ctx.fillRect(W.pageL, W.pageT, W.pageR - W.pageL, W.pageB - W.pageT);
      // лёгкий градиент освещённости страницы
      const lg = ctx.createLinearGradient(0, W.pageT, 0, W.pageB);
      lg.addColorStop(0, 'rgba(255,255,255,0.05)');
      lg.addColorStop(1, 'rgba(0,0,0,0.07)');
      ctx.fillStyle = lg;
      ctx.fillRect(W.pageL, W.pageT, W.pageR - W.pageL, W.pageB - W.pageT);
      ctx.globalAlpha = 1;
    }

    // заголовок документа и строка состояния
    const uiCol = mixc(room, mixc(PAL.ui, [190, 184, 172], dawn), 1);
    ctx.globalAlpha = screen;
    this.font(STYLE.ui.font);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = rgb(uiCol);
    ctx.fillText(film.header || 'черновик', 0, W.pageT - 30);
    const lit = film.env.statusLit ? film.env.statusLit.at(t) : 0;
    if (lit > 0.01) ctx.fillStyle = rgb(mixc(uiCol, [236, 214, 196], lit));
    ctx.fillText(`${wordsLabel(film.words.at(t))}  ·  ${film.clock.at(t)}`, 0, W.floor - 10);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;

    // курсор (нужен для подсветки кучи)
    const cs = film.cursor.sample(t, this.cs);
    const blink = this.blinkAlpha(film, t);

    this.drawGlyphs(film, t, paper, screen, dawn, cs);
    this.drawCursor(cs, blink, screen, room);

    // экранные слои
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (dawn > 0.01) {
      const g = ctx.createRadialGradient(this.W * 0.92, -this.H * 0.1, 0, this.W * 0.92, -this.H * 0.1, this.W * 1.05);
      g.addColorStop(0, `rgba(255,214,168,${0.28 * dawn})`);
      g.addColorStop(1, 'rgba(255,214,168,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.W, this.H);
    }
    const title = E.title.at(t);
    if (title > 0.001) this.drawTitle(film, t, title);
    if (this.vig) ctx.drawImage(this.vig, 0, 0, this.W, this.H);
    const gi = this.grains[Math.floor(t * 6.2) % 3];
    const gp = ctx.createPattern(gi, 'repeat');
    ctx.fillStyle = gp;
    ctx.globalAlpha = 0.9;
    ctx.fillRect(0, 0, this.W, this.H);
    ctx.globalAlpha = 1;
    const fade = E.fade.at(t);
    if (fade > 0.001) { ctx.fillStyle = `rgba(8,9,12,${fade})`; ctx.fillRect(0, 0, this.W, this.H); }
  }

  blinkAlpha(film, t) {
    const b = film.blink.at(t);
    const ph = t - b.t0;
    const edge = (p, per) => {           // «вкл» первую половину периода, мягкие края
      const x = ((p % per) + per) % per / per;
      const e = 0.05;
      if (x < e) return x / e;
      if (x < 0.5) return 1;
      if (x < 0.5 + e) return 1 - (x - 0.5) / e;
      return 0;
    };
    switch (b.mode) {
      case 'solid': return 1;
      case 'off': return 0;
      case 'fast': return edge(ph, 1);
      case 'slow': return edge(ph, 3);
      default: return edge(ph, 2);
    }
  }

  drawGlyphs(film, t, paper, screen, dawn, cs) {
    const ctx = this.ctx, st = this.gs;
    const list = this._list || (this._list = []);
    list.length = 0;
    const gsAll = film.glyphs;
    for (let i = 0; i < gsAll.length; i++) {
      const g = gsAll[i];
      if (t >= g.tDie) continue;
      const s = g.tr.sample(t, st);
      if (!s || s.a <= 0.004) continue;
      list.push({ g, x: s.x, y: s.y, r: s.r, sx: s.sx, sy: s.sy, a: s.a, k: s.k, sel: s.sel });
    }
    list.sort((p, q) => p.g.z - q.g.z);
    const selG = film.env.sel.at(t);
    const inkBase = PAL.ink;
    const glowOn = cs && cs.glow > 0 ? cs.glow : 0;
    const cx = cs ? cs.x : 0, cy = cs ? cs.y - cs.h * 0.5 : 0;
    const L = W.pageL, R = W.pageR, T = W.pageT, B = W.pageB;

    for (let pass = 0; pass < 2; pass++) {
      ctx.save();
      ctx.setTransform(this.M[0], this.M[1], this.M[2], this.M[3], this.M[4], this.M[5]);
      ctx.beginPath();
      if (pass === 0) ctx.rect(L, T, R - L, B - T);
      else { ctx.rect(-6000, -6000, 12000, 12000); ctx.rect(L, T, R - L, B - T); }
      ctx.clip('evenodd');
      for (const it of list) {
        const g = it.g;
        const [cur, prev, u] = g.look(t);
        const m = cur.m || g.m;
        const rad = Math.max(m.w, m.hh * 2) * Math.max(Math.abs(it.sx), Math.abs(it.sy)) * 0.8 + 4;
        const inside = it.x - rad > L && it.x + rad < R && it.y - rad > T && it.y + rad < B;
        const outside = it.x + rad < L || it.x - rad > R || it.y + rad < T || it.y - rad > B;
        if (pass === 0 && outside) continue;
        if (pass === 1 && inside) continue;
        let col;
        if (pass === 0) {
          col = mixc(inkBase, PAL.inkWarm, it.k);
        } else {
          // свет от страницы и от курсора
          const dx = Math.max(L - it.x, 0, it.x - R), dy = Math.max(T - it.y, 0, it.y - B);
          let light = Math.exp(-Math.hypot(dx, dy) / 300) * 0.55 * screen + dawn * 0.45;
          if (glowOn) {
            const d2 = (it.x - cx) * (it.x - cx) + (it.y - cy) * (it.y - cy);
            light += Math.exp(-d2 / (2 * 150 * 150)) * 0.75 * glowOn;
          }
          col = mixc(mixc(PAL.pale, PAL.paleLit, clamp(light)), PAL.paleWarm, it.k);
        }
        const sel = Math.max(it.sel, selG);
        const puff = prev ? 1 + 0.35 * Math.sin(Math.PI * u) : 1;
        this._setLocal(it.x, it.y, it.r, it.sx * puff, it.sy * puff);
        if (sel > 0.01) {
          ctx.fillStyle = rgb(PAL.accent, 0.34 * sel);
          ctx.fillRect(-m.w / 2 - 3, -m.hh - 10, m.w + 6, m.hh * 2 + 20);
        }
        if (prev) {
          const pm = prev.m || g.m;
          ctx.globalAlpha = it.a * (1 - u);
          this.font((prev.style || g.style).font);
          ctx.fillStyle = rgb(col);
          ctx.fillText(prev.ch, -pm.w / 2, pm.cy);
        }
        ctx.globalAlpha = it.a * (prev ? u : 1);
        this.font((cur.style || g.style).font);
        ctx.fillStyle = rgb(col);
        ctx.fillText(cur.ch, -m.w / 2, m.cy);
        // хвост кометы — след полёта
        if (g.trail && t > g.trail[0] && t < g.trail[1]) {
          const tmp = this._tmp || (this._tmp = {});
          for (let j = 1; j <= 7; j++) {
            const s2 = g.tr.sample(t - j * 0.035, tmp);
            if (!s2) break;
            this._setLocal(s2.x, s2.y, s2.r, s2.sx * (1 - j * 0.07), s2.sy * (1 - j * 0.07));
            ctx.globalAlpha = 0.34 * (1 - j / 8);
            ctx.fillText(cur.ch, -m.w / 2, m.cy);
          }
        }
        ctx.globalAlpha = 1;
      }
      ctx.restore();
      this._font = '';
    }
  }

  drawCursor(cs, blink, screen, room) {
    if (!cs || cs.a <= 0.001) return;
    const ctx = this.ctx;
    const a = cs.a * blink;
    const x0 = cs.x, y0 = cs.y;
    const x1 = x0 + Math.sin(cs.lean) * cs.h, y1 = y0 - Math.cos(cs.lean) * cs.h;
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    const nx = Math.cos(cs.lean), ny = Math.sin(cs.lean);
    const bx = mx + nx * cs.bend * cs.h * 0.5, by = my + ny * cs.bend * cs.h * 0.5;
    ctx.setTransform(this.M[0], this.M[1], this.M[2], this.M[3], this.M[4], this.M[5]);
    // свечение: пиксель экрана светится в темноте
    if (cs.glow > 0.01 && a > 0.01) {
      const onPage = mx > W.pageL && mx < W.pageR && my > W.pageT && my < W.pageB;
      const R = 60 + cs.glow * 70;
      const ga = onPage ? 0.4 : 1;
      const g = ctx.createRadialGradient(mx, my, 0, mx, my, R);
      g.addColorStop(0, rgb(PAL.accent, 0.16 * cs.glow * a * ga));
      g.addColorStop(1, rgb(PAL.accent, 0));
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = g;
      ctx.fillRect(mx - R, my - R, R * 2, R * 2);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (a <= 0.01) return;
    ctx.strokeStyle = rgb(PAL.accent, a);
    ctx.lineWidth = cs.w;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(bx, by, x1, y1);
    ctx.stroke();
  }

  drawTitle(film, t, k) {
    const ctx = this.ctx, S = this.S;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = rgb(PAL.room, k);
    ctx.fillRect(0, 0, this.W, this.H);
    const tt = film.titleT || 0;
    const u1 = clamp((t - tt) / 1.5), u2 = clamp((t - tt - 2) / 1.5), u3 = clamp((t - tt - 3.2) / 1.5);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `400 ${Math.round(150 * S)}px ${FONT_SERIF}`;
    ctx.fillStyle = rgb(PAL.paperDawn, k * Ease.out2(u1));
    const y = this.H * 0.47 + (1 - Ease.out3(u1)) * 18 * S;
    ctx.fillText('Черновик', this.W / 2, y);
    const tw = ctx.measureText('Черновик').width;
    // курсор после титра
    const b = this.blinkAlpha(film, t);
    ctx.fillStyle = rgb(PAL.accent, k * b * u1);
    ctx.fillRect(this.W / 2 + tw / 2 + 16 * S, y - 118 * S, 9 * S, 150 * S);
    ctx.font = `italic 300 ${Math.round(34 * S)}px ${FONT_SERIF}`;
    ctx.fillStyle = rgb(PAL.paleLit, k * u2);
    ctx.fillText('мультфильм о первой фразе', this.W / 2, y + 78 * S);
    ctx.font = `400 ${Math.round(24 * S)}px ${FONT_MONO}`;
    ctx.fillStyle = rgb(PAL.ui, k * u3);
    ctx.fillText('Курсор — курсор. Точка — точка. Остальные буквы — сами себя.', this.W / 2, this.H * 0.8);
    ctx.fillText('Кадры, музыка и шумы написаны кодом и звучат в реальном времени.', this.W / 2, this.H * 0.8 + 38 * S);
    ctx.textAlign = 'left';
  }
}
