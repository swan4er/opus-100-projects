/* ================================================================
   stage.js — кадр фильма как функция времени t.
   Живые фоны с параллаксом (10 мест × день/вечер/ночь), камера
   (общий/средний/крупный план, панорама, тряска), эффекты
   (сердечки, звёздочки, пыль, слёзы, «БАМ!»), облачка реплик,
   переходы (ирис, шторка), титр и «Конец».
   ================================================================ */
(function () {
  'use strict';
  const W = 1600, H = 900, TAU = Math.PI * 2;
  const P = window.Puppets, L = window.Lang;
  const { blob, poly, line, heart, star, ink, INK } = P;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const smooth = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
  const easeBack = (u) => { u = clamp(u, 0, 1); const c = 1.7; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); };
  const GROUND = { city: 790, forest: 790, sea: 805, space: 770, kitchen: 812, roof: 752, meadow: 800, winter: 800, room: 812, junkyard: 790 };
  const wx = (x) => 140 + x * 13.2;
  const FONT = '"Pangolin", "Comic Sans MS", "Marker Felt", cursive';

  function rng(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; }
  function hash(n) { n = Math.imul(n ^ 0x27d4eb2d, 0x165667b1); n ^= n >>> 15; return (n >>> 0) / 4294967296; }

  // ---------- камера и слои параллакса ----------
  let SCALE = 1, CW = W, CH = H;
  function setLayer(ctx, cam, d) {
    const z = 1 + (cam.z - 1) * d;
    const cx = 800 + (cam.x - 800) * d, cy = 450 + (cam.y - 450) * d;
    const k = SCALE * z;
    ctx.setTransform(k, 0, 0, k, CW / 2 - cx * k, CH / 2 - cy * k);
  }
  function clampCam(c) {
    c.z = clamp(c.z, 1, 3);
    const hw = 800 / c.z, hh = 450 / c.z;
    c.x = clamp(c.x, hw, W - hw); c.y = clamp(c.y, hh, H - hh);
    return c;
  }
  // Состав кадра решается в момент склейки: дальше камера следит за этими героями
  // (ушедший за край не выпадает из расчёта рывком, вошедший позже — входит в кадр сам)
  function castOf(S, cam) {
    if (cam.set) return cam.set;
    const on = cam.on || [];
    cam.set = Object.keys(S.actors).filter((id) => {
      if (on.length && !on.includes(id)) return false;
      const a = L.evalActor(S, id, cam.t + 0.02);
      return a.vis && a.x > -6 && a.x < 106;
    });
    if (!cam.set.length && on.length) cam.set = on.filter((id) => S.actors[id]);
    return cam.set;
  }
  function frameOf(S, cam, infos, t) {
    const g = GROUND[S.place];
    const since = Math.max(0, t - cam.t);
    if (cam.mode === 'wide') {
      // общий план: вся площадка; первый план сцены медленно наезжает
      const z = cam === S.cams[0] ? lerp(1.0, 1.13, smooth(since / 3.4)) : 1.13;
      return { x: 800, y: g - 324 / z, z };
    }
    if (cam.mode === 'pan') {
      const nxt = S.cams.find((q) => q.t > cam.t);
      const u = smooth((t - cam.t) / ((nxt ? nxt.t : S.t1) - cam.t));
      return { x: lerp(560, 1040, u), y: g - 330 / 1.3, z: 1.3 };
    }
    const set = castOf(S, cam);
    const pick = infos.filter((i) => set.includes(i.id));
    if (!pick.length) return { x: 800, y: g - 324 / 1.13, z: 1.13 };
    let minX = 1e9, maxX = -1e9, top = 1e9, bot = -1e9;
    for (const i of pick) {
      const h = i.c.def.h, X = clamp(i.X, wx(1), wx(99));
      minX = Math.min(minX, X - 60); maxX = Math.max(maxX, X + 60);
      top = Math.min(top, i.Y - h * (i.lie ? 0.4 : 1)); bot = Math.max(bot, i.Y);
    }
    const push = 1 + Math.min(0.06, since * 0.012);   // лёгкий наезд, пока план держится
    if (cam.mode === 'close' && pick.length === 1) {
      const i = pick[0], h = i.c.def.h;
      const z = clamp((0.6 * H) / h, 1.7, 2.5) * push;
      return { x: clamp(i.X, wx(1), wx(99)) + i.face * 36, y: i.Y - h * (i.lie ? 0.2 : 0.6), z };
    }
    const span = maxX - minX, tall = bot - top;
    // луну и солнце верхний край не режет пополам: либо берём целиком (план шире), либо убираем краешек
    const fitSky = (fr) => {
      for (const i of infos) {
        if (set.includes(i.id) || !i.vis || !i.c.def.float || i.alt < 30) continue;
        const R = i.c.def.h * 0.45, cy = i.Y - R - 6, top0 = cy - R - 16, bot0 = cy + R;
        const vt = fr.y - 450 / fr.z;
        if (Math.abs(i.X - fr.x) > 800 / fr.z + R * 0.5 || vt <= top0 || vt >= bot0) continue;
        if (vt >= bot0 - R * 0.3) { fr = { x: fr.x, y: fr.y + (bot0 - vt) + 6, z: fr.z }; continue; }
        const z = clamp(900 / (bot + 70 - top0), 1.0, fr.z);
        fr = { x: fr.x, y: top0 + 450 / z, z };
      }
      return fr;
    };
    if (cam.mode === 'full') {
      // план «в рост»: все участники действия целиком, с воздухом над головами
      const z = clamp(Math.min(W / (span + 760), 760 / (tall + 320)), 1.13, 1.45) * push;
      return fitSky({ x: (minX + maxX) / 2, y: bot - 312 / z, z });
    }
    const z = clamp(Math.min(W / (span + 560), 738 / (tall + 200)), 1.15, cam.mode === 'close' ? 2.1 : 1.7) * push;
    const fr = { x: (minX + maxX) / 2, y: bot - 288 / z, z };
    return cam.mode === 'close' ? fr : fitSky(fr);
  }
  function camAt(S, t, infos) {
    const cams = S.cams;
    let i = 0;
    for (let k = 0; k < cams.length; k++) if (cams[k].t <= t + 1e-6) i = k;
    let out = clampCam(frameOf(S, cams[i], infos, t));
    const active = cams[i];
    if (i > 0 && cams[i].blend > 0 && t < cams[i].t + cams[i].blend) {
      const prev = clampCam(frameOf(S, cams[i - 1], infos, t));
      const k = smooth((t - cams[i].t) / cams[i].blend);
      out = { x: lerp(prev.x, out.x, k), y: lerp(prev.y, out.y, k), z: lerp(prev.z, out.z, k) };
    }
    // лёгкое «дыхание» камеры оператора
    out.x += Math.sin(t * 0.37) * 3; out.y += Math.sin(t * 0.29) * 2;
    let sx = 0, sy = 0;
    for (const s of S.shakes) {
      const d = t - s.t;
      if (d >= 0 && d < 0.7) { const a = s.amp * 16 * Math.exp(-d * 7); sx += Math.sin(d * 71) * a; sy += Math.cos(d * 57) * a * 0.7; }
    }
    out.x += sx / out.z; out.y += sy / out.z;
    out.z = Math.max(out.z, 1.0);
    const hw = 800 / out.z, hh = 450 / out.z;
    out.x = clamp(out.x, hw - 14, W - hw + 14); out.y = clamp(out.y, hh - 10, H - hh + 10);
    if (out.z < 1.02) { out.x = clamp(out.x, 786, 814); out.y = clamp(out.y, 440, 460); out.z = 1.02; }
    out.cam = active;
    return out;
  }

  // ---------- небо, солнце, звёзды ----------
  const SKIES = {
    day: ['#7cc3e8', '#bfe4f2', '#f3f4df'],
    evening: ['#5a4d8f', '#e0816a', '#ffcf94'],
    night: ['#0c1433', '#1e2d5c', '#3a4a7a'],
  };
  function sky(ctx, time, horizon) {
    const c = SKIES[time] || SKIES.day;
    const g = ctx.createLinearGradient(0, 0, 0, horizon || 700);
    g.addColorStop(0, c[0]); g.addColorStop(0.6, c[1]); g.addColorStop(1, c[2]);
    ctx.fillStyle = g; ctx.fillRect(-200, -200, W + 400, H + 400);
  }
  function stars(ctx, t, n, seed, maxY) {
    const r = rng(seed);
    for (let i = 0; i < n; i++) {
      const x = r() * W, y = r() * (maxY || 500), s = 0.8 + r() * 2.2, ph = r() * TAU;
      const a = 0.45 + 0.55 * Math.sin(t * (1 + r() * 2) + ph);
      ctx.globalAlpha = clamp(a, 0.1, 1);
      ctx.fillStyle = '#fff8e0';
      if (s > 2.4) { star(ctx, x, y, s * 2.2, '#fff4c8', 0); } else { ctx.beginPath(); ctx.arc(x, y, s, 0, TAU); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
  }
  function sunOrMoon(ctx, S, time, x, y, t) {
    if (time === 'night') {
      if (hasKind(S, 'moon')) return;
      const g = ctx.createRadialGradient(x, y, 30, x, y, 160);
      g.addColorStop(0, 'rgba(255,246,210,0.35)'); g.addColorStop(1, 'rgba(255,246,210,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 160, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fbeec0'; ctx.beginPath(); ctx.arc(x, y, 46, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(225,200,130,0.5)';
      ctx.beginPath(); ctx.arc(x - 14, y - 10, 9, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(x + 12, y + 14, 6, 0, TAU); ctx.fill();
      return;
    }
    if (hasKind(S, 'sun')) return;
    const ev = time === 'evening';
    const r = ev ? 70 : 52;
    const g = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 3.2);
    g.addColorStop(0, ev ? 'rgba(255,190,110,0.55)' : 'rgba(255,250,215,0.6)'); g.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 3.2, 0, TAU); ctx.fill();
    ctx.fillStyle = ev ? '#ffb46b' : '#fff3c4'; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  let FILM = null;
  function hasKind(S, kind) { return Object.keys(S.actors).some((id) => FILM.cast[id].kind === kind); }
  function cloud(ctx, x, y, s, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y, 80 * s, 26 * s, 0, 0, TAU);
    ctx.ellipse(x - 40 * s, y - 12 * s, 38 * s, 30 * s, 0, 0, TAU);
    ctx.ellipse(x + 22 * s, y - 24 * s, 46 * s, 38 * s, 0, 0, TAU);
    ctx.ellipse(x + 62 * s, y - 6 * s, 30 * s, 22 * s, 0, 0, TAU);
    ctx.fill();
  }
  function clouds(ctx, t, time, n, seed, y0, spread) {
    const r = rng(seed);
    const col = time === 'night' ? 'rgba(90,110,160,0.35)' : time === 'evening' ? 'rgba(255,214,190,0.8)' : 'rgba(255,255,255,0.9)';
    for (let i = 0; i < n; i++) {
      const s = 0.6 + r() * 0.9, sp = 6 + r() * 10;
      const x = ((r() * (W + 500) + t * sp) % (W + 500)) - 250;
      cloud(ctx, x, y0 + r() * (spread || 160), s, col);
    }
  }
  // клуб дыма или пара с мягким краем (плоские полупрозрачные круги выглядели как мыльные пузыри)
  function puff(ctx, x, y, r, rgb, a) {
    if (a <= 0.01 || r <= 0) return;
    const g = ctx.createRadialGradient(x, y, r * 0.15, x, y, r);
    g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(0.55, `rgba(${rgb},${a * 0.7})`); g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  // ночь в помещении: синеватый сумрак, светлее всего у лампы
  function nightRoom(ctx, lx, ly) {
    const g = ctx.createRadialGradient(lx, ly, 90, lx, ly, 1150);
    g.addColorStop(0, 'rgba(22,26,64,0)'); g.addColorStop(0.45, 'rgba(22,26,64,0.28)'); g.addColorStop(1, 'rgba(12,14,40,0.58)');
    ctx.fillStyle = g; ctx.fillRect(-300, -300, W + 600, H + 600);
  }
  function hills(ctx, y, amp, color, seed, freq) {
    const r = rng(seed);
    const p1 = r() * TAU, p2 = r() * TAU;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(-300, H + 300);
    for (let x = -300; x <= W + 300; x += 40) ctx.lineTo(x, y - Math.sin(x * 0.004 * (freq || 1) + p1) * amp - Math.sin(x * 0.011 * (freq || 1) + p2) * amp * 0.35);
    ctx.lineTo(W + 300, H + 300); ctx.closePath(); ctx.fill();
  }
  function groundBand(ctx, y, c1, c2) {
    const g = ctx.createLinearGradient(0, y, 0, H + 200);
    g.addColorStop(0, c1); g.addColorStop(1, c2);
    ctx.fillStyle = g; ctx.fillRect(-300, y, W + 600, H - y + 400);
  }
  function window_(ctx, x, y, w, h, lit, t, i) {
    const on = lit && hash(i * 31 + Math.floor(t * 0.15 + hash(i) * 7)) > 0.3;
    ctx.fillStyle = on ? (hash(i * 7) > 0.5 ? '#ffd88a' : '#ffe9b0') : lit ? '#2b3558' : 'rgba(40,60,90,0.35)';
    ctx.fillRect(x, y, w, h);
  }
  function pine(ctx, x, y, h, color, snow) {
    ctx.fillStyle = color;
    for (let k = 0; k < 3; k++) {
      const yy = y - h * (0.25 + k * 0.28), ww = h * (0.34 - k * 0.08);
      ctx.beginPath(); ctx.moveTo(x - ww, yy + h * 0.2); ctx.lineTo(x, yy - h * 0.26); ctx.lineTo(x + ww, yy + h * 0.2); ctx.closePath(); ctx.fill();
      if (snow) { ctx.fillStyle = snow; ctx.beginPath(); ctx.moveTo(x - ww * 0.45, yy - h * 0.02); ctx.lineTo(x, yy - h * 0.26); ctx.lineTo(x + ww * 0.45, yy - h * 0.02); ctx.quadraticCurveTo(x, yy + h * 0.04, x - ww * 0.45, yy - h * 0.02); ctx.fill(); ctx.fillStyle = color; }
    }
    ctx.fillRect(x - h * 0.03, y - h * 0.1, h * 0.06, h * 0.12);
  }

  // ================================================================
  //  Места. Каждое рисует слои с параллаксом; возвращает передний план.
  //  L(d) — поставить слой глубины d (0 — бесконечность, 1 — сцена).
  // ================================================================
  const PLACE = {};

  PLACE.city = (ctx, S, t, L, time) => {
    const night = time === 'night';
    L(0); sky(ctx, time, 640);
    if (night) stars(ctx, t, 70, 11, 420);
    sunOrMoon(ctx, S, time, 1260, time === 'evening' ? 470 : 170, t);
    L(0.08); clouds(ctx, t, time, 4, 5, 90, 150);
    // дальние дома
    L(0.25);
    const r = rng(21);
    const far = night ? '#27335a' : time === 'evening' ? '#9a6f8f' : '#a9c3d4';
    ctx.fillStyle = far;
    for (let x = -200; x < W + 200; x += 70 + r() * 60) { const h = 150 + r() * 200, w = 60 + r() * 70; ctx.fillRect(x, 640 - h, w, h + 20); }
    // средние дома с окнами
    L(0.55);
    const r2 = rng(33);
    const facades = night ? ['#3a3f66', '#4a3d5e', '#2f4a5e'] : time === 'evening' ? ['#c9786a', '#b98f6b', '#8f7a9c'] : ['#e59f7d', '#f2cf87', '#8cc0b7', '#d98f8f'];
    let i = 0;
    for (let x = -260; x < W + 260; i++) {
      const w = 170 + r2() * 110, h = 260 + r2() * 190, y = 660 - h;
      ctx.fillStyle = facades[i % facades.length]; ctx.fillRect(x, y, w, h + 40);
      ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(x, y, w, 14); ctx.fillRect(x + w - 16, y, 16, h + 40);
      for (let wy = y + 34; wy < 620; wy += 58) for (let wxp = x + 22; wxp < x + w - 40; wxp += 46) window_(ctx, wxp, wy, 24, 32, night || time === 'evening', t, i * 100 + wy + wxp);
      if (r2() > 0.5) { ctx.fillStyle = '#5b5a66'; ctx.fillRect(x + w * 0.6, y - 40, 4, 40); ctx.fillRect(x + w * 0.6 - 16, y - 34, 36, 4); }
      x += w + 6 + r2() * 30;
    }
    // дорога и машина
    L(0.85);
    ctx.fillStyle = night ? '#2c2f3d' : '#6f7282'; ctx.fillRect(-300, 650, W + 600, 90);
    ctx.fillStyle = night ? '#8d8a70' : '#f3e9c8';
    for (let x = -300 + ((t * 0) % 120); x < W + 300; x += 120) ctx.fillRect(x, 692, 60, 6);
    const carX = ((t * 260) % 3400) - 900;
    if (carX > -300 && carX < W + 300) {
      poly(ctx, [[carX, 722], [carX + 190, 722], [carX + 190, 690], [carX + 150, 688], [carX + 120, 656], [carX + 40, 656], [carX + 14, 688], [carX, 692]], night ? '#8a3b3b' : '#e5484d', 3.2, 10);
      ctx.fillStyle = night ? '#ffe9a0' : '#bfe4f2'; ctx.fillRect(carX + 50, 664, 30, 22); ctx.fillRect(carX + 88, 664, 28, 22);
      for (const wx2 of [carX + 40, carX + 150]) { blob(ctx, wx2, 722, 17, 17, '#2d2a30', null, 0, 3); blob(ctx, wx2, 722, 7, 7, '#c9ccd4', null, 0, 0); }
      if (night) { ctx.fillStyle = 'rgba(255,240,170,0.35)'; ctx.beginPath(); ctx.moveTo(carX + 190, 700); ctx.lineTo(carX + 420, 680); ctx.lineTo(carX + 420, 730); ctx.fill(); }
    }
    // тротуар
    L(1);
    groundBand(ctx, 736, night ? '#4a4a5c' : '#d7cbb8', night ? '#343446' : '#bfae96');
    ctx.fillStyle = night ? '#5a5a70' : '#e9dfcf'; ctx.fillRect(-300, 730, W + 600, 12);
    ctx.strokeStyle = 'rgba(60,40,30,0.12)'; ctx.lineWidth = 3;
    for (let x = -300; x < W + 300; x += 110) { ctx.beginPath(); ctx.moveTo(x, 744); ctx.lineTo(x - 40, 900); ctx.stroke(); }
    // фонари
    for (const lx of [210, 1400]) {
      ctx.fillStyle = '#3b3a46'; ctx.fillRect(lx - 5, 470, 10, 270);
      poly(ctx, [[lx - 26, 470], [lx + 26, 470], [lx + 16, 440], [lx - 16, 440]], '#3b3a46', 3, 4);
      if (night || time === 'evening') {
        const g = ctx.createRadialGradient(lx, 480, 5, lx, 520, 260);
        g.addColorStop(0, 'rgba(255,225,150,0.55)'); g.addColorStop(1, 'rgba(255,225,150,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(lx - 20, 476); ctx.lineTo(lx + 20, 476); ctx.lineTo(lx + 170, 790); ctx.lineTo(lx - 170, 790); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffe7a8'; ctx.fillRect(lx - 18, 470, 36, 8);
      }
    }
    return null;
  };

  PLACE.forest = (ctx, S, t, L, time) => {
    const night = time === 'night';
    L(0); sky(ctx, time, 620);
    if (night) stars(ctx, t, 60, 7, 380);
    sunOrMoon(ctx, S, time, 380, time === 'evening' ? 430 : 160, t);
    L(0.06); clouds(ctx, t, time, 3, 9, 80, 120);
    L(0.15); hills(ctx, 540, 60, night ? '#1f3350' : time === 'evening' ? '#8a6f93' : '#9cc6c2', 3, 0.8);
    L(0.3);
    const r = rng(4);
    const c1 = night ? '#18304a' : time === 'evening' ? '#5f5a7e' : '#5f9c8c';
    for (let x = -250; x < W + 250; x += 55 + r() * 40) pine(ctx, x, 640 + r() * 20, 190 + r() * 140, c1);
    L(0.55);
    const c2 = night ? '#14283b' : time === 'evening' ? '#46506b' : '#3f7d67';
    const r2 = rng(8);
    for (let x = -250; x < W + 250; x += 150 + r2() * 110) {
      const h = 330 + r2() * 160;
      ctx.fillStyle = night ? '#2a2230' : '#6b4a35'; ctx.fillRect(x - 12, 720 - h * 0.5, 24, h * 0.5 + 20);
      const sway = Math.sin(t * 0.8 + x) * 4;
      ctx.fillStyle = c2;
      ctx.beginPath(); ctx.ellipse(x + sway, 720 - h * 0.62, h * 0.24, h * 0.24, 0, 0, TAU); ctx.ellipse(x - h * 0.14 + sway, 720 - h * 0.48, h * 0.18, h * 0.16, 0, 0, TAU); ctx.ellipse(x + h * 0.15 + sway, 720 - h * 0.5, h * 0.18, h * 0.16, 0, 0, TAU); ctx.fill();
    }
    // лучи
    if (time === 'day') {
      L(0.7); ctx.globalAlpha = 0.16; ctx.fillStyle = '#fff6d0';
      for (let k = 0; k < 4; k++) { const x = 300 + k * 330 + Math.sin(t * 0.3 + k) * 20; ctx.beginPath(); ctx.moveTo(x, -50); ctx.lineTo(x + 70, -50); ctx.lineTo(x + 260, 800); ctx.lineTo(x + 140, 800); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
    L(1);
    groundBand(ctx, 760, night ? '#20402f' : time === 'evening' ? '#6f7a4a' : '#7fb35a', night ? '#152a20' : '#5e8f3d');
    const r3 = rng(15);
    for (let k = 0; k < 40; k++) {
      const x = r3() * W, y = 770 + r3() * 120, sw = Math.sin(t * 2 + k) * 3;
      line(ctx, [[x, y], [x + sw - 4, y - 18]], 3, night ? '#2f5a40' : '#4f8a3a');
      line(ctx, [[x + 6, y], [x + 6 + sw, y - 24]], 3, night ? '#2f5a40' : '#4f8a3a');
    }
    for (const [mx, my] of [[330, 820], [1180, 850], [1460, 800]]) {
      ctx.fillStyle = '#f4ead8'; ctx.fillRect(mx - 5, my - 16, 10, 18);
      blob(ctx, mx, my - 18, 20, 12, '#e5484d', null, 0, 3);
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(mx - 6, my - 22, 3, 0, TAU); ctx.arc(mx + 7, my - 19, 2.5, 0, TAU); ctx.fill();
    }
    // листья / светлячки
    return (ctx2) => {
      if (night || time === 'evening') {
        for (let k = 0; k < 22; k++) {
          const x = (hash(k) * W + Math.sin(t * 0.7 + k) * 60), y = 420 + hash(k + 50) * 380 + Math.cos(t * 0.9 + k * 2) * 30;
          const a = 0.4 + 0.6 * Math.max(0, Math.sin(t * 2.2 + k * 1.7));
          const g = ctx2.createRadialGradient(x, y, 1, x, y, 16);
          g.addColorStop(0, `rgba(230,255,140,${a})`); g.addColorStop(1, 'rgba(230,255,140,0)');
          ctx2.fillStyle = g; ctx2.beginPath(); ctx2.arc(x, y, 16, 0, TAU); ctx2.fill();
        }
      } else {
        for (let k = 0; k < 9; k++) {
          const cyc = (t * 0.12 + hash(k)) % 1;
          const x = hash(k + 9) * W + Math.sin(cyc * 12 + k) * 50, y = -30 + cyc * 900;
          ctx2.save(); ctx2.translate(x, y); ctx2.rotate(cyc * 14 + k);
          blob(ctx2, 0, 0, 10, 5, k % 2 ? '#e8a13c' : '#d9643a', null, 0, 2.2); ctx2.restore();
        }
      }
      // ствол на переднем плане у края
      ctx2.fillStyle = night ? '#1a1418' : '#4a3326';
      ctx2.beginPath(); ctx2.moveTo(-60, 900); ctx2.lineTo(-40, -50); ctx2.lineTo(50, -50); ctx2.quadraticCurveTo(40, 500, 70, 900); ctx2.fill();
    };
  };

  PLACE.sea = (ctx, S, t, L, time) => {
    const night = time === 'night', ev = time === 'evening';
    L(0); sky(ctx, time, 560);
    if (night) stars(ctx, t, 80, 17, 440);
    const sx = 1100, sy = ev ? 470 : night ? 170 : 150;
    sunOrMoon(ctx, S, time, sx, sy, t);
    L(0.06); clouds(ctx, t, time, 3, 12, 70, 140);
    // море
    L(0.3);
    const sg = ctx.createLinearGradient(0, 540, 0, 760);
    sg.addColorStop(0, night ? '#1d2f5c' : ev ? '#b56a7c' : '#3d8fc4'); sg.addColorStop(1, night ? '#12203f' : ev ? '#6a4e7a' : '#2a6fa3');
    ctx.fillStyle = sg; ctx.fillRect(-300, 540, W + 600, 300);
    // лунная/солнечная дорожка
    ctx.globalAlpha = 0.5; ctx.fillStyle = night ? '#fbeec0' : '#fff2c8';
    for (let k = 0; k < 14; k++) { const y = 552 + k * 13, w = 30 + k * 9 + Math.sin(t * 3 + k) * 12; ctx.fillRect(sx - w / 2 + Math.sin(t * 2 + k * 3) * 8, y, w, 3); }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = night ? 'rgba(160,190,240,0.35)' : 'rgba(255,255,255,0.45)'; ctx.lineWidth = 3;
    for (let k = 0; k < 7; k++) {
      const y = 570 + k * 26; ctx.beginPath();
      for (let x = -300; x < W + 300; x += 20) ctx.lineTo(x, y + Math.sin(x * 0.02 + t * 1.6 + k) * 3);
      ctx.setLineDash([40, 60 + k * 10]); ctx.lineDashOffset = -t * 30 * (k % 2 ? 1 : -1); ctx.stroke();
    }
    ctx.setLineDash([]);
    // кораблик
    const bx = 330 + Math.sin(t * 0.1) * 40, by = 560 + Math.sin(t * 1.3) * 3;
    ctx.save(); ctx.translate(bx, by); ctx.rotate(Math.sin(t * 1.3) * 0.05);
    poly(ctx, [[-40, 0], [40, 0], [28, 14], [-28, 14]], '#8a4b3a', 2.5, 3); poly(ctx, [[0, -2], [0, -70], [36, -8]], '#fff8ea', 2.5, 3); poly(ctx, [[-3, -6], [-3, -54], [-30, -8]], '#f2b33d', 2.5, 3);
    ctx.restore();
    // чайки
    if (!night) for (let k = 0; k < 3; k++) {
      const gx = ((t * 40 + k * 500) % (W + 300)) - 150, gy = 230 + k * 50 + Math.sin(t * 2 + k) * 14, f = Math.sin(t * 7 + k) * 8;
      line(ctx, [[gx - 18, gy - f], [gx, gy], [gx + 18, gy - f]], 3, '#3a3a48');
    }
    // пляж
    L(1);
    groundBand(ctx, 720, night ? '#6a6480' : ev ? '#e4b58f' : '#f2d7a2', night ? '#4f4a66' : '#e0bd83');
    const wash = Math.sin(t * 0.9) * 12;
    ctx.fillStyle = night ? 'rgba(180,200,240,0.5)' : 'rgba(255,255,255,0.75)';
    ctx.beginPath(); ctx.moveTo(-300, 716);
    for (let x = -300; x <= W + 300; x += 30) ctx.lineTo(x, 724 + wash + Math.sin(x * 0.03 + t * 2) * 5);
    ctx.lineTo(W + 300, 700); ctx.lineTo(-300, 700); ctx.fill();
    star(ctx, 420, 850, 16, '#f28a5a', 3); blob(ctx, 1240, 870, 14, 9, '#f7e7d6', null, 0.3, 3);
    return (ctx2) => {
      // пальма у правого края
      ctx2.save(); ctx2.translate(1560, 900);
      ctx2.strokeStyle = '#7a5236'; ctx2.lineWidth = 34; ctx2.lineCap = 'round';
      ctx2.beginPath(); ctx2.moveTo(0, 20); ctx2.quadraticCurveTo(-30, -300, 10, -560); ctx2.stroke();
      const sw = Math.sin(t * 1.1) * 0.06;
      for (const a of [-2.7, -2.2, -1.6, -0.9, -0.4]) {
        ctx2.save(); ctx2.translate(10, -560); ctx2.rotate(a + sw);
        blob(ctx2, 120, 0, 130, 26, night ? '#1f4a3a' : '#3f9b5a', null, 0.15, 0); ctx2.restore();
      }
      ctx2.restore();
    };
  };

  PLACE.space = (ctx, S, t, L, time) => {
    L(0);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0a0d26'); g.addColorStop(1, '#241a4d');
    ctx.fillStyle = g; ctx.fillRect(-300, -300, W + 600, H + 600);
    for (const [nx, ny, nr, col] of [[400, 260, 360, 'rgba(120,70,190,0.35)'], [1200, 380, 420, 'rgba(40,140,170,0.25)'], [900, 120, 260, 'rgba(210,90,140,0.2)']]) {
      const ng = ctx.createRadialGradient(nx, ny, 10, nx, ny, nr);
      ng.addColorStop(0, col); ng.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = ng; ctx.fillRect(nx - nr, ny - nr, nr * 2, nr * 2);
    }
    stars(ctx, t, 160, 23, 760);
    // падающая звезда
    const ph = (t % 7) / 7;
    if (ph < 0.12) { const k = ph / 0.12, x = 1400 - k * 700, y = 80 + k * 240; ctx.strokeStyle = 'rgba(255,250,220,0.9)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 90, y - 30); ctx.stroke(); }
    L(0.12);
    // планета с кольцом
    ctx.save(); ctx.translate(330, 250); ctx.rotate(-0.3);
    ctx.strokeStyle = 'rgba(255,215,160,0.8)'; ctx.lineWidth = 10; ctx.beginPath(); ctx.ellipse(0, 0, 190, 42, 0, Math.PI, TAU); ctx.stroke();
    blob(ctx, 0, 0, 110, 110, '#e8956b', '#b8644a', 0, 0);
    ctx.fillStyle = 'rgba(255,230,190,0.35)'; ctx.fillRect(-110, -30, 220, 16); ctx.fillRect(-100, 20, 200, 10);
    ctx.strokeStyle = 'rgba(255,215,160,0.9)'; ctx.lineWidth = 10; ctx.beginPath(); ctx.ellipse(0, 0, 190, 42, 0, 0, Math.PI); ctx.stroke();
    ctx.restore();
    L(0.2);
    blob(ctx, 1350, 180, 46, 46, '#5fa8e0', '#3a78b8', 0, 0);
    ctx.fillStyle = '#6fcf7a'; ctx.beginPath(); ctx.ellipse(1340, 170, 18, 12, 0.4, 0, TAU); ctx.ellipse(1366, 196, 12, 8, 0, 0, TAU); ctx.fill();
    // парящие камни
    L(0.5);
    for (let k = 0; k < 4; k++) { const x = 200 + k * 420, y = 470 + Math.sin(t * 0.6 + k * 2) * 16; blob(ctx, x, y, 30 - k * 3, 20, '#6b6488', '#4a4466', t * 0.2 + k, 3); }
    // поверхность астероида
    L(1);
    groundBand(ctx, 740, '#8f86a8', '#5d5578');
    ctx.fillStyle = '#9d95b6';
    ctx.beginPath(); ctx.moveTo(-300, 750); for (let x = -300; x <= W + 300; x += 60) ctx.lineTo(x, 742 + Math.sin(x * 0.01) * 10); ctx.lineTo(W + 300, 900); ctx.lineTo(-300, 900); ctx.fill();
    for (const [cx, cy, cr] of [[260, 830, 50], [900, 860, 70], [1380, 810, 36], [600, 790, 26]]) { ctx.fillStyle = '#6f6790'; ctx.beginPath(); ctx.ellipse(cx, cy, cr, cr * 0.32, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#b3abc9'; ctx.beginPath(); ctx.ellipse(cx, cy - cr * 0.08, cr * 0.9, cr * 0.2, 0, Math.PI, TAU); ctx.fill(); }
    return null;
  };

  // окно в интерьере: небо по времени суток, шторы
  function roomWindow(ctx, x, y, w, h, time, t, S) {
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    const c = SKIES[time] || SKIES.day;
    const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, c[0]); g.addColorStop(1, c[2]);
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    if (time === 'night') { for (let k = 0; k < 14; k++) { ctx.fillStyle = '#fff8e0'; ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 2 + k); ctx.beginPath(); ctx.arc(x + hash(k) * w, y + hash(k + 3) * h * 0.7, 1.8, 0, TAU); ctx.fill(); } ctx.globalAlpha = 1; if (!hasKind(S, 'moon')) { ctx.fillStyle = '#fbeec0'; ctx.beginPath(); ctx.arc(x + w * 0.7, y + h * 0.3, 22, 0, TAU); ctx.fill(); } }
    else { cloud(ctx, x + ((t * 10) % (w + 200)) - 60, y + h * 0.35, 0.45, time === 'evening' ? 'rgba(255,214,190,0.9)' : '#fff'); }
    ctx.fillStyle = time === 'night' ? '#1c2a3f' : '#6d9a86';
    ctx.fillRect(x, y + h * 0.78, w, h * 0.22);
    ctx.restore();
    ctx.lineWidth = 12; ctx.strokeStyle = '#f6efe2'; ctx.strokeRect(x, y, w, h);
    ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h); ctx.moveTo(x, y + h * 0.45); ctx.lineTo(x + w, y + h * 0.45); ctx.stroke();
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(42,31,27,0.5)'; ctx.strokeRect(x - 6, y - 6, w + 12, h + 12);
  }

  PLACE.kitchen = (ctx, S, t, L, time) => {
    const night = time === 'night';
    L(0.7);
    ctx.fillStyle = night ? '#c9b99a' : '#f3e3c3'; ctx.fillRect(-300, -300, W + 600, 1400);
    ctx.fillStyle = night ? 'rgba(120,90,60,0.12)' : 'rgba(210,150,90,0.14)';
    for (let x = -300; x < W + 300; x += 60) ctx.fillRect(x, -300, 26, 800);
    // плитка
    const ty = 470;
    for (let y = ty; y < 700; y += 38) for (let x = -300; x < W + 300; x += 38) { ctx.fillStyle = ((x + y) / 38) % 2 ? (night ? '#b9c7cf' : '#e7f1f4') : (night ? '#8aa3b3' : '#b9d8e3'); ctx.fillRect(x, y, 37, 37); }
    roomWindow(ctx, 600, 150, 400, 280, time, t, S);
    // шторки
    const sw = Math.sin(t * 0.8) * 6;
    ctx.fillStyle = '#e5484d';
    ctx.beginPath(); ctx.moveTo(560, 120); ctx.lineTo(700, 120); ctx.quadraticCurveTo(640 + sw, 260, 690, 460); ctx.lineTo(560, 460); ctx.fill();
    ctx.beginPath(); ctx.moveTo(1040, 120); ctx.lineTo(900, 120); ctx.quadraticCurveTo(960 + sw, 260, 910, 460); ctx.lineTo(1040, 460); ctx.fill();
    ctx.fillStyle = '#fff4e4'; for (let x = 570; x < 1040; x += 30) { ctx.beginPath(); ctx.arc(x, 124, 6, 0, TAU); ctx.fill(); }
    // часы с секундной стрелкой
    blob(ctx, 1260, 200, 56, 56, '#fffaf2', null, 0, 4);
    const sec = (t % 60) / 60 * TAU, mn = (t / 60 + 0.3) * TAU / 12 * 12;
    line(ctx, [[1260, 200], [1260 + Math.sin(mn) * 28, 200 - Math.cos(mn) * 28]], 5);
    line(ctx, [[1260, 200], [1260 + Math.sin(sec) * 42, 200 - Math.cos(sec) * 42]], 2.5, '#e5484d');
    // полка с банками
    ctx.fillStyle = '#9a6a45'; ctx.fillRect(160, 300, 300, 14);
    for (const [jx, jc] of [[190, '#f2b33d'], [250, '#e5484d'], [320, '#5bb56a'], [390, '#8fb6cc']]) { poly(ctx, [[jx, 300], [jx + 44, 300], [jx + 44, 240], [jx, 240]], jc, 3, 8); ctx.fillStyle = '#fff4e4'; ctx.fillRect(jx + 8, 262, 28, 14); }
    // шкафчики и плита
    L(0.85);
    poly(ctx, [[-60, 560], [560, 560], [560, 740], [-60, 740]], night ? '#8a6f9a' : '#9fc9b8', 4, 6);
    poly(ctx, [[1060, 560], [1680, 560], [1680, 740], [1060, 740]], night ? '#8a6f9a' : '#9fc9b8', 4, 6);
    for (const dx of [40, 200, 360, 1120, 1280, 1440]) { ctx.strokeStyle = 'rgba(42,31,27,0.35)'; ctx.lineWidth = 3; ctx.strokeRect(dx, 590, 140, 130); blob(ctx, dx + 120, 650, 6, 6, '#e8c56a', null, 0, 2); }
    poly(ctx, [[-60, 548], [560, 548], [560, 566], [-60, 566]], '#f6efe2', 3, 3);
    poly(ctx, [[1060, 548], [1680, 548], [1680, 566], [1060, 566]], '#f6efe2', 3, 3);
    // чайник с паром
    blob(ctx, 1300, 516, 46, 36, '#e5484d', '#b8323a', 0, 4);
    poly(ctx, [[1340, 510], [1380, 488], [1384, 496], [1346, 524]], '#e5484d', 3, 3);
    blob(ctx, 1300, 478, 14, 7, '#2d2629', null, 0, 3);
    for (let k = 0; k < 5; k++) { const ph = (t * 0.6 + k / 5) % 1; puff(ctx, 1384 + Math.sin(ph * 8 + k) * 12 + ph * 30, 480 - ph * 160, 14 + ph * 30, '255,255,255', 0.6 * (1 - ph) * Math.min(1, ph * 6)); }
    // лампа под потолком качается
    const la = Math.sin(t * 1.2) * 0.05;
    ctx.save(); ctx.translate(800, -40); ctx.rotate(la);
    line(ctx, [[0, 0], [0, 110]], 3);
    poly(ctx, [[-50, 150], [50, 150], [26, 104], [-26, 104]], '#f2b33d', 4, 6);
    if (night || time === 'evening') { const g = ctx.createRadialGradient(0, 160, 10, 0, 300, 520); g.addColorStop(0, 'rgba(255,230,160,0.35)'); g.addColorStop(1, 'rgba(255,230,160,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-40, 150); ctx.lineTo(40, 150); ctx.lineTo(420, 900); ctx.lineTo(-420, 900); ctx.fill(); }
    ctx.restore();
    // пол-шахматка
    L(1);
    for (let row = 0; row < 6; row++) {
      const y0 = 740 + row * 30 + row * row * 4, y1 = 740 + (row + 1) * 30 + (row + 1) * (row + 1) * 4;
      for (let col = -12; col < 14; col++) {
        const sx0 = 800 + (col * 120 - 60) * (1 + row * 0.12), sx1 = 800 + ((col + 1) * 120 - 60) * (1 + row * 0.12);
        const sx2 = 800 + ((col + 1) * 120 - 60) * (1 + (row + 1) * 0.12), sx3 = 800 + (col * 120 - 60) * (1 + (row + 1) * 0.12);
        ctx.fillStyle = (row + col) % 2 ? (night ? '#6f5a4a' : '#e8d3b0') : (night ? '#4a3a32' : '#c2946a');
        ctx.beginPath(); ctx.moveTo(sx0, y0); ctx.lineTo(sx1, y0); ctx.lineTo(sx2, y1); ctx.lineTo(sx3, y1); ctx.fill();
      }
    }
    if (night) nightRoom(ctx, 800, 620);
    return null;
  };

  PLACE.roof = (ctx, S, t, L, time) => {
    const night = time === 'night';
    L(0); sky(ctx, time, 640);
    if (night) stars(ctx, t, 120, 31, 520);
    sunOrMoon(ctx, S, time, 1230, time === 'evening' ? 440 : 160, t);
    L(0.05); clouds(ctx, t, time, 3, 44, 120, 140);
    L(0.2);
    const r = rng(52);
    ctx.fillStyle = night ? '#1b2446' : time === 'evening' ? '#7a5a86' : '#9ab6c9';
    const blds = [];
    for (let x = -250; x < W + 250; x += 50 + r() * 50) { const h = 120 + r() * 230, w = 50 + r() * 60; blds.push([x, h, w]); ctx.fillRect(x, 700 - h, w, h + 50); }
    if (night || time === 'evening') { for (const [x, h, w] of blds) for (let wy = 700 - h + 14; wy < 690; wy += 26) for (let wx2 = x + 8; wx2 < x + w - 10; wx2 += 18) if (hash(wx2 * 3 + wy) > 0.55) window_(ctx, wx2, wy, 8, 12, true, t, wx2 + wy * 7); }
    // антенны и бельё на соседней крыше
    L(0.5);
    ctx.fillStyle = night ? '#2a2f52' : '#8f7f86';
    ctx.fillRect(-200, 600, 700, 200);
    ctx.fillRect(1150, 560, 700, 240);
    line(ctx, [[1300, 560], [1300, 440]], 5, night ? '#3a4068' : '#5b5a66'); line(ctx, [[1260, 470], [1340, 470]], 4, night ? '#3a4068' : '#5b5a66'); line(ctx, [[1272, 450], [1328, 450]], 4, night ? '#3a4068' : '#5b5a66');
    line(ctx, [[60, 600], [60, 500]], 4, '#5b5a66'); line(ctx, [[440, 600], [440, 500]], 4, '#5b5a66');
    ctx.beginPath(); ctx.moveTo(60, 506); ctx.quadraticCurveTo(250, 540, 440, 506); ctx.lineWidth = 2; ctx.strokeStyle = '#d8d0c0'; ctx.stroke();
    for (const [bx, bc] of [[140, '#e5484d'], [230, '#fff4e4'], [330, '#5fa8e0']]) { ctx.save(); ctx.translate(bx, 522); ctx.rotate(Math.sin(t * 2 + bx) * 0.12); poly(ctx, [[-20, 0], [20, 0], [24, 50], [-24, 50]], night ? dim(bc) : bc, 2.5, 4); ctx.restore(); }
    // своя крыша: черепица
    L(1);
    const top = 736;
    ctx.fillStyle = night ? '#5a2f36' : '#b5523c';
    ctx.fillRect(-300, top, W + 600, 400);
    for (let row = 0; row < 7; row++) {
      const y = top + row * 26;
      for (let x = -300 + (row % 2) * 30; x < W + 300; x += 60) { ctx.fillStyle = row % 2 ? (night ? '#6b3a40' : '#c9654a') : (night ? '#63343b' : '#bf5b41'); ctx.beginPath(); ctx.ellipse(x + 30, y + 22, 30, 16, 0, 0, Math.PI); ctx.fill(); }
    }
    ctx.fillStyle = night ? '#7a4a4e' : '#d9785a'; ctx.fillRect(-300, top - 8, W + 600, 14);
    // труба и дым
    poly(ctx, [[1330, top + 4], [1330, 560], [1440, 560], [1440, top + 4]], night ? '#6b4040' : '#a8543f', 4, 3);
    poly(ctx, [[1318, 562], [1318, 536], [1452, 536], [1452, 562]], night ? '#7a4a4a' : '#bf6a52', 4, 3);
    for (let k = 0; k < 6; k++) { const ph = (t * 0.25 + k / 6) % 1; puff(ctx, 1385 + Math.sin(ph * 5 + k) * 20 - ph * 120, 520 - ph * 260, 22 + ph * 52, night ? '150,160,196' : '236,230,222', 0.5 * (1 - ph) * Math.min(1, ph * 6)); }
    return null;
  };
  function dim(hex) { const n = parseInt(hex.slice(1), 16); return `rgb(${(n >> 16) * 0.55 | 0},${((n >> 8) & 255) * 0.55 | 0},${(n & 255) * 0.7 | 0})`; }

  PLACE.meadow = (ctx, S, t, L, time) => {
    const night = time === 'night', ev = time === 'evening';
    L(0); sky(ctx, time, 620);
    if (night) stars(ctx, t, 90, 61, 460);
    sunOrMoon(ctx, S, time, 1180, ev ? 480 : 150, t);
    L(0.07); clouds(ctx, t, time, 5, 71, 60, 200);
    L(0.16); hills(ctx, 590, 50, night ? '#233a52' : ev ? '#9a7f9f' : '#a7cfa0', 72, 0.7);
    L(0.35); hills(ctx, 650, 40, night ? '#1f3a3a' : ev ? '#7f8a6a' : '#7fbf6a', 73, 1.1);
    // мельница
    ctx.save(); ctx.translate(1180, 590);
    poly(ctx, [[-30, 0], [30, 0], [18, -140], [-18, -140]], night ? '#6f6070' : '#f3e6d0', 3, 4);
    poly(ctx, [[-24, -136], [24, -136], [0, -170]], night ? '#5a3a40' : '#c9654a', 3, 3);
    ctx.translate(0, -140); ctx.rotate(t * 0.8);
    for (let k = 0; k < 4; k++) { ctx.rotate(Math.PI / 2); poly(ctx, [[-6, 0], [6, 0], [10, -110], [-10, -110]], night ? '#8a7a7a' : '#fff8ea', 3, 2); }
    blob(ctx, 0, 0, 8, 8, '#5b5a66', null, 0, 2);
    ctx.restore();
    // домик
    poly(ctx, [[260, 640], [400, 640], [400, 560], [260, 560]], night ? '#8a6f5a' : '#f2cf87', 3, 3);
    poly(ctx, [[248, 566], [330, 500], [412, 566]], night ? '#6b3a40' : '#c9654a', 3, 3);
    window_(ctx, 300, 580, 30, 28, night || ev, t, 5);
    L(1);
    groundBand(ctx, 750, night ? '#274d3a' : ev ? '#8fa45a' : '#8cc867', night ? '#1a3628' : '#6aa84a');
    const r = rng(77);
    for (let k = 0; k < 34; k++) {
      const x = r() * W, y = 770 + r() * 120, sw = Math.sin(t * 1.8 + k) * 4, col = ['#f25f7a', '#ffd23f', '#fff4e4', '#8f7ae0'][k % 4];
      line(ctx, [[x, y], [x + sw, y - 26]], 3, night ? '#2f5a40' : '#4f8a3a');
      if (k % 2) { ctx.fillStyle = night ? dim(col) : col; ctx.beginPath(); ctx.arc(x + sw, y - 28, 6, 0, TAU); ctx.fill(); ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(x + sw, y - 28, 2.4, 0, TAU); ctx.fill(); }
    }
    return (ctx2) => {
      if (night) return;
      for (let k = 0; k < 3; k++) {
        const x = 300 + k * 480 + Math.sin(t * 0.7 + k) * 160, y = 560 + Math.sin(t * 1.3 + k * 2) * 70, f = Math.abs(Math.sin(t * 12 + k));
        ctx2.fillStyle = ['#f2b33d', '#f25f7a', '#5fa8e0'][k];
        ctx2.beginPath(); ctx2.ellipse(x - 8, y, 9 * f + 2, 12, -0.4, 0, TAU); ctx2.ellipse(x + 8, y, 9 * f + 2, 12, 0.4, 0, TAU); ctx2.fill();
      }
    };
  };

  PLACE.winter = (ctx, S, t, L, time) => {
    const night = time === 'night', ev = time === 'evening';
    L(0); sky(ctx, time, 620);
    if (night) stars(ctx, t, 90, 81, 440);
    sunOrMoon(ctx, S, time, 1240, ev ? 470 : 170, t);
    L(0.15); hills(ctx, 600, 50, night ? '#5a6a90' : ev ? '#d9b8c9' : '#e6eef5', 82, 0.8);
    L(0.4);
    const r = rng(85);
    for (let x = -200; x < W + 200; x += 90 + r() * 80) pine(ctx, x, 690, 200 + r() * 120, night ? '#1f3b4a' : '#3f7d67', night ? '#c9d6ea' : '#fbfdff');
    // домик с дымом
    ctx.save(); ctx.translate(1120, 700);
    poly(ctx, [[-110, 0], [110, 0], [110, -120], [-110, -120]], night ? '#6b4a3a' : '#a8643f', 3, 3);
    poly(ctx, [[-130, -110], [0, -200], [130, -110]], night ? '#dce4f2' : '#fbfdff', 3, 3);
    window_(ctx, -40, -90, 44, 40, true, t, 8);
    ctx.fillStyle = '#6b4a3a'; ctx.fillRect(50, -200, 26, 60);
    for (let k = 0; k < 5; k++) { const ph = (t * 0.2 + k / 5) % 1; puff(ctx, 63 - ph * 90, -210 - ph * 200, 18 + ph * 38, '232,238,245', 0.55 * (1 - ph) * Math.min(1, ph * 6)); }
    ctx.restore();
    L(1);
    groundBand(ctx, 740, night ? '#b8c6e0' : '#f7fbff', night ? '#8a9bc0' : '#d9e6f2');
    ctx.fillStyle = night ? 'rgba(90,110,160,0.25)' : 'rgba(150,180,220,0.3)';
    for (const [x, y, w] of [[200, 800, 180], [800, 860, 260], [1300, 810, 200]]) { ctx.beginPath(); ctx.ellipse(x, y, w, 16, 0, 0, TAU); ctx.fill(); }
    // снеговик
    ctx.save(); ctx.translate(1450, 790);
    blob(ctx, 0, -40, 56, 48, '#fbfdff', '#d9e6f2', 0, 4); blob(ctx, 0, -120, 42, 38, '#fbfdff', '#d9e6f2', 0, 4); blob(ctx, 0, -186, 30, 28, '#fbfdff', '#d9e6f2', 0, 4);
    poly(ctx, [[4, -186], [44, -180], [4, -176]], '#f08a24', 3, 2);
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(-6, -196, 4, 0, TAU); ctx.arc(12, -196, 4, 0, TAU); ctx.fill();
    poly(ctx, [[-26, -206], [26, -206], [20, -250], [-20, -250]], '#e5484d', 3, 4);
    ctx.restore();
    return (ctx2) => {
      for (let k = 0; k < 70; k++) {
        const sp = 40 + hash(k) * 50, x = (hash(k + 100) * (W + 200) + Math.sin(t * 0.9 + k) * 30) - 100, y = ((hash(k + 200) * 1000 + t * sp) % 1000) - 60;
        ctx2.fillStyle = 'rgba(255,255,255,0.9)'; ctx2.beginPath(); ctx2.arc(x, y, 2 + hash(k + 300) * 4, 0, TAU); ctx2.fill();
      }
    };
  };

  PLACE.room = (ctx, S, t, L, time) => {
    const dark = time !== 'day';
    L(0.7);
    ctx.fillStyle = dark ? '#6f5a78' : '#e8c9c3'; ctx.fillRect(-300, -300, W + 600, 1400);
    ctx.fillStyle = dark ? 'rgba(255,220,180,0.1)' : 'rgba(255,255,255,0.35)';
    for (let y = -40; y < 720; y += 70) for (let x = -300 + ((y / 70) % 2) * 45; x < W + 300; x += 90) { ctx.beginPath(); ctx.moveTo(x, y - 14); ctx.lineTo(x + 10, y); ctx.lineTo(x, y + 14); ctx.lineTo(x - 10, y); ctx.fill(); }
    roomWindow(ctx, 980, 160, 330, 300, time, t, S);
    // картина: портрет кота
    poly(ctx, [[260, 170], [440, 170], [440, 360], [260, 360]], '#c9924a', 4, 3);
    ctx.fillStyle = '#f7e9cf'; ctx.fillRect(280, 190, 140, 150);
    blob(ctx, 350, 280, 40, 34, '#f29a45', null, 0, 3); poly(ctx, [[318, 258], [322, 226], [340, 250]], '#f29a45', 3, 2); poly(ctx, [[360, 250], [378, 226], [382, 258]], '#f29a45', 3, 2);
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(338, 276, 4, 0, TAU); ctx.arc(362, 276, 4, 0, TAU); ctx.fill();
    // маятниковые часы
    ctx.save(); ctx.translate(640, 250);
    poly(ctx, [[-44, -60], [44, -60], [44, 280], [-44, 280]], '#8a5a3a', 4, 6);
    blob(ctx, 0, -10, 32, 32, '#fffaf2', null, 0, 3);
    line(ctx, [[0, -10], [0, -32]], 3); line(ctx, [[0, -10], [16, -4]], 3);
    const sw = Math.sin(t * Math.PI) * 0.35;
    ctx.translate(0, 40); ctx.rotate(sw); line(ctx, [[0, 0], [0, 170]], 3); blob(ctx, 0, 180, 16, 16, '#f5c542', null, 0, 3);
    ctx.restore();
    // торшер
    if (dark) { const g = ctx.createRadialGradient(1450, 360, 10, 1450, 500, 520); g.addColorStop(0, 'rgba(255,220,150,0.5)'); g.addColorStop(1, 'rgba(255,220,150,0)'); ctx.fillStyle = g; ctx.fillRect(900, 0, 1100, 900); }
    line(ctx, [[1450, 380], [1450, 760]], 6, '#3b3a46');
    poly(ctx, [[1390, 390], [1510, 390], [1480, 310], [1420, 310]], '#f2b33d', 4, 6);
    // диван
    L(0.85);
    poly(ctx, [[40, 560], [560, 560], [560, 740], [40, 740]], dark ? '#4f6a86' : '#5fa3a0', 4, 26);
    poly(ctx, [[10, 610], [90, 610], [90, 750], [10, 750]], dark ? '#445c76' : '#4f8f8c', 4, 20);
    poly(ctx, [[510, 610], [590, 610], [590, 750], [510, 750]], dark ? '#445c76' : '#4f8f8c', 4, 20);
    blob(ctx, 200, 610, 60, 34, '#f2b33d', null, 0.2, 3);
    L(1);
    groundBand(ctx, 752, dark ? '#6a4a3a' : '#c28a5e', dark ? '#4a3228' : '#a8704a');
    ctx.strokeStyle = 'rgba(60,30,20,0.25)'; ctx.lineWidth = 3;
    for (let y = 770; y < 900; y += 26) { ctx.beginPath(); ctx.moveTo(-300, y); ctx.lineTo(W + 300, y); ctx.stroke(); }
    ctx.fillStyle = dark ? '#8a3b4f' : '#d9536a'; ctx.beginPath(); ctx.ellipse(800, 830, 520, 60, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 5; ctx.beginPath(); ctx.ellipse(800, 830, 470, 46, 0, 0, TAU); ctx.stroke();
    if (time === 'night') nightRoom(ctx, 1400, 520);
    return null;
  };

  PLACE.junkyard = (ctx, S, t, L, time) => {
    const night = time === 'night', ev = time === 'evening';
    L(0);
    const g = ctx.createLinearGradient(0, 0, 0, 700);
    if (night) { g.addColorStop(0, '#141a33'); g.addColorStop(1, '#3a3450'); }
    else if (ev) { g.addColorStop(0, '#6a4a7a'); g.addColorStop(0.6, '#e08a5a'); g.addColorStop(1, '#ffc27a'); }
    else { g.addColorStop(0, '#9ccbe0'); g.addColorStop(0.7, '#f3dca8'); g.addColorStop(1, '#f7c98a'); }
    ctx.fillStyle = g; ctx.fillRect(-300, -300, W + 600, 1400);
    if (night) stars(ctx, t, 70, 91, 400);
    sunOrMoon(ctx, S, time, 380, ev ? 440 : 170, t);
    L(0.2);
    ctx.fillStyle = night ? '#262a44' : ev ? '#7a5270' : '#b99a86';
    ctx.beginPath(); ctx.moveTo(-300, 700);
    const r = rng(95);
    for (let x = -300; x <= W + 300; x += 80) ctx.lineTo(x, 560 - r() * 120 + Math.sin(x * 0.01) * 40);
    ctx.lineTo(W + 300, 700); ctx.fill();
    // кран с магнитом
    L(0.35);
    const cc = night ? '#3a3f5e' : '#d98e3a';
    ctx.fillStyle = cc; ctx.fillRect(1180, 200, 22, 460);
    ctx.fillRect(900, 196, 420, 18);
    line(ctx, [[1190, 200], [1320, 205]], 3, cc);
    const sw = Math.sin(t * 0.9) * 0.12;
    ctx.save(); ctx.translate(960, 214); ctx.rotate(sw); line(ctx, [[0, 0], [0, 200]], 3, '#3a3a46'); blob(ctx, 0, 214, 40, 18, '#5b5a66', null, 0, 3); ctx.restore();
    // кучи хлама
    L(0.6);
    const pile = (x, y, s, seed) => {
      const q = rng(seed);
      ctx.fillStyle = night ? '#3a3a52' : '#8f7a6a';
      ctx.beginPath(); ctx.ellipse(x, y, 220 * s, 110 * s, 0, Math.PI, TAU); ctx.fill();
      for (let k = 0; k < 7; k++) {
        const px = x + (q() - 0.5) * 300 * s, py = y - q() * 90 * s, kind = k % 4;
        const col = night ? ['#4f4a6a', '#5a5270', '#3f4a66'][k % 3] : ['#b35d4a', '#6f8fa8', '#d9b35a', '#7a8a5a'][k % 4];
        if (kind === 0) { blob(ctx, px, py, 34 * s, 34 * s, '#2d2a30', null, 0, 3); blob(ctx, px, py, 14 * s, 14 * s, '#5b5a66', null, 0, 0); }
        else if (kind === 1) poly(ctx, [[px - 40 * s, py], [px + 40 * s, py], [px + 40 * s, py - 50 * s], [px - 40 * s, py - 50 * s]], col, 3, 4);
        else if (kind === 2) { ctx.save(); ctx.translate(px, py); ctx.rotate(q() - 0.5); poly(ctx, [[-60 * s, -8 * s], [60 * s, -8 * s], [60 * s, 8 * s], [-60 * s, 8 * s]], col, 3, 6); ctx.restore(); }
        else { poly(ctx, [[px - 34 * s, py], [px + 34 * s, py], [px + 30 * s, py - 44 * s], [px - 30 * s, py - 44 * s]], '#4a4a56', 3, 6); ctx.fillStyle = night ? '#3a5a70' : '#8fd0e8'; ctx.fillRect(px - 22 * s, py - 36 * s, 44 * s, 28 * s); }
      }
    };
    pile(180, 700, 1, 101); pile(820, 690, 0.8, 102); pile(1480, 700, 1.1, 103);
    L(1);
    groundBand(ctx, 740, night ? '#4a4050' : '#b99a78', night ? '#332c3a' : '#9a7a5a');
    ctx.fillStyle = night ? 'rgba(20,20,40,0.5)' : 'rgba(40,40,60,0.35)';
    ctx.beginPath(); ctx.ellipse(420, 850, 90, 14, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.ellipse(1160, 870, 60, 10, 0, 0, TAU); ctx.fill();
    for (const [bx, by] of [[300, 800], [980, 830], [1320, 790]]) { blob(ctx, bx, by, 8, 8, '#8a8f99', null, 0, 2.5); }
    return (ctx2) => {
      for (let k = 0; k < 16; k++) {
        const ph = (t * 0.07 + hash(k)) % 1;
        ctx2.globalAlpha = 0.35 * Math.sin(ph * Math.PI);
        ctx2.fillStyle = night ? '#9aa3c0' : '#f3dca8';
        ctx2.beginPath(); ctx2.arc(ph * (W + 200) - 100, 400 + hash(k + 7) * 420 + Math.sin(t + k) * 20, 3 + hash(k + 9) * 5, 0, TAU); ctx2.fill();
      }
      ctx2.globalAlpha = 1;
    };
  };

  // ================================================================
  //  Эффекты вокруг актёров (всё — функция от времени, перемотка работает)
  // ================================================================
  function headOf(i) {
    const h = i.c.def.h, lie = i.pose ? i.pose.lie : i.lie;
    if (i.c.def.float) return { x: i.X, y: i.Y - h * 0.55, top: i.Y - h * 1.02 };
    if (lie > 0.5) return { x: i.X - i.face * h * 0.72, y: i.Y - 44, top: i.Y - 96 };
    return { x: i.X + i.face * 12, y: i.Y - h * 0.8, top: i.Y - h * 1.02 };
  }
  function txt(ctx, s, x, y, size, fill, rot) {
    ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot);
    ctx.font = `700 ${size}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = size * 0.16; ctx.strokeStyle = INK; ctx.strokeText(s, 0, 0);
    ctx.fillStyle = fill; ctx.fillText(s, 0, 0);
    ctx.restore();
  }
  function drawFx(ctx, f, i, t, o) {
    const lt = t - f.t0, D = Math.max(0.01, f.t1 - f.t0), u = lt / D;
    const hp = headOf(i);
    switch (f.type) {
      case 'hearts': {
        const cx = o ? (i.X + o.X) / 2 : hp.x, cy = Math.min(hp.top, o ? headOf(o).top : 1e9) - 6;
        for (let k = 0; k < 9; k++) {
          const a = lt - k * 0.2; if (a < 0 || a > 1.7) continue;
          ctx.globalAlpha = Math.min(1, (1.7 - a) * 1.6);
          heart(ctx, cx + Math.sin(a * 3 + k) * 24 + ((k % 3) - 1) * 26, cy - a * 120, 12 + (k % 3) * 5 + Math.sin(a * 10) * 1.5, k % 2 ? '#ef4a62' : '#ff7a8a', 3);
        }
        ctx.globalAlpha = 1; break;
      }
      case 'stars':
        for (let k = 0; k < 3; k++) { const a = lt * 5 + (k * TAU) / 3; star(ctx, hp.x + Math.cos(a) * 44, hp.top + 10 + Math.sin(a) * 12, 11, '#ffd23f', 3); }
        break;
      case 'dust':
        if (f.puff) {
          for (let k = 0; k < 6; k++) { const s = (k - 2.5) / 2.5; ctx.globalAlpha = 0.6 * (1 - u); blob(ctx, i.X + s * (30 + lt * 120), i.Y - 10 - lt * 26 - Math.abs(s) * 6, 12 + lt * 30, 10 + lt * 22, '#efe2cf', null, 0, 2.5); }
        } else {
          for (let k = 0; k < 40; k++) {
            const sp = f.t0 + k * 0.13; if (sp > t) break;
            const age = t - sp; if (age > 0.5) continue;
            ctx.globalAlpha = 0.55 * (1 - age / 0.5);
            blob(ctx, i.X - i.face * (26 + age * 110), i.Y - 8 - age * 26, 8 + age * 30, 7 + age * 22, '#efe2cf', null, 0, 2);
          }
        }
        ctx.globalAlpha = 1; break;
      case 'excl': case 'quest': {
        const s = easeBack(lt / 0.25) * (1 - smooth((u - 0.85) / 0.15));
        if (s > 0.01) txt(ctx, f.type === 'excl' ? '!' : '?', hp.x + i.face * 30, hp.top - 30 - lt * 6, 72 * s, f.type === 'excl' ? '#ff5a4a' : '#5fb0f0', 0.1 * i.face);
        break;
      }
      case 'steam':
        for (let k = 0; k < 6; k++) {
          const ph = (lt * 1.6 + k / 6) % 1, side = k % 2 ? 1 : -1;
          ctx.globalAlpha = 0.8 * (1 - ph);
          blob(ctx, hp.x + side * (40 + ph * 40), hp.top + 20 - ph * 70, 10 + ph * 16, 8 + ph * 12, '#f4f1ea', null, 0, 2.5);
        }
        ctx.globalAlpha = 1; break;
      case 'sweat':
        for (let k = 0; k < 2; k++) {
          const ph = (lt * 1.1 + k * 0.5) % 1;
          ctx.globalAlpha = 1 - ph;
          const x = hp.x - i.face * 44 + k * 8, y = hp.y - 30 + ph * 40;
          ctx.beginPath(); ctx.moveTo(x, y - 14); ctx.quadraticCurveTo(x + 10, y + 2, x, y + 6); ctx.quadraticCurveTo(x - 10, y + 2, x, y - 14);
          ctx.fillStyle = '#8fd3f5'; ctx.fill(); ink(ctx, 2.5);
        }
        ctx.globalAlpha = 1; break;
      case 'rain': {
        const a = Math.min(1, lt * 4) * (1 - smooth((u - 0.85) / 0.15));
        ctx.globalAlpha = a;
        const cx = hp.x, cy = hp.top - 50;
        ctx.strokeStyle = '#7f95b8'; ctx.lineWidth = 3;
        for (let k = 0; k < 6; k++) { const ph = (lt * 2 + k / 6) % 1; ctx.beginPath(); ctx.moveTo(cx - 36 + k * 14, cy + 14 + ph * 60); ctx.lineTo(cx - 40 + k * 14, cy + 26 + ph * 60); ctx.stroke(); }
        cloud(ctx, cx, cy, 0.62, '#9aa7bd');
        ctx.globalAlpha = 1; break;
      }
      case 'sparkle': case 'glint':
        for (let k = 0; k < (f.type === 'glint' ? 1 : 5); k++) {
          const a = lt * 2 - k * 0.12; if (a < 0 || a > 1) continue;
          const s = Math.sin(a * Math.PI) * 16;
          const x = f.type === 'glint' ? hp.x + i.face * 30 : hp.x + Math.cos(k * 1.3) * 70, y = f.type === 'glint' ? hp.y - 10 : hp.top + Math.sin(k * 2.1) * 40;
          ctx.fillStyle = '#fff6b0';
          ctx.beginPath(); ctx.moveTo(x, y - s); ctx.quadraticCurveTo(x, y, x + s, y); ctx.quadraticCurveTo(x, y, x, y + s); ctx.quadraticCurveTo(x, y, x - s, y); ctx.quadraticCurveTo(x, y, x, y - s); ctx.fill(); ink(ctx, 2);
        }
        break;
      case 'tears':
        for (const side of [-1, 1]) for (let k = 0; k < 10; k++) {
          const ph = (lt * 2.2 + k / 10) % 1;
          const x = hp.x + i.face * 10 + side * (18 + ph * 70), y = hp.y + 6 - ph * 30 + ph * ph * 110;
          ctx.fillStyle = '#8fd3f5'; ctx.beginPath(); ctx.arc(x, y, 7 * (1 - ph * 0.4), 0, TAU); ctx.fill();
        }
        break;
      case 'haha':
        for (let k = 0; k < 4; k++) {
          const a = lt - k * 0.4; if (a < 0 || a > 0.9) continue;
          txt(ctx, 'ха', hp.x + (k % 2 ? 70 : -70) + i.face * 10, hp.top - 10 - a * 50, 38 * easeBack(a / 0.2), '#ffd23f', (k % 2 ? 0.2 : -0.2));
        }
        break;
      case 'zzz':
        for (let k = 0; k < 3; k++) {
          const ph = (lt * 0.55 + k / 3) % 1;
          ctx.globalAlpha = Math.sin(ph * Math.PI);
          txt(ctx, 'z', hp.x - i.face * 6 + ph * 60 + Math.sin(ph * 6) * 8, hp.top - 10 - ph * 110, 26 + ph * 26, '#bfe4f2', 0);
        }
        ctx.globalAlpha = 1; break;
      case 'notes':
        for (let k = 0; k < 4; k++) {
          const ph = (lt * 0.7 + k / 4) % 1;
          ctx.globalAlpha = Math.sin(ph * Math.PI);
          txt(ctx, k % 2 ? '♪' : '♫', hp.x + i.face * 50 + Math.sin(ph * 7 + k) * 22 + (k - 1.5) * 18, hp.top - ph * 120, 40, ['#ff7a8a', '#ffd23f', '#7fd0f0', '#b690e3'][k], Math.sin(ph * 5) * 0.3);
        }
        ctx.globalAlpha = 1; break;
      case 'speed':
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineCap = 'round';
        for (let k = 0; k < 5; k++) {
          const y = i.Y - i.c.def.h * (0.2 + k * 0.15), len = 70 + ((k * 37 + Math.floor(t * 12) * 13) % 60);
          ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(i.X - i.face * 70, y); ctx.lineTo(i.X - i.face * (70 + len), y); ctx.stroke();
        }
        break;
      case 'pow': {
        const s = easeBack(lt / 0.15) * (1 - smooth((u - 0.7) / 0.3));
        if (s < 0.02) break;
        const x = hp.x + i.face * 20, y = hp.y;
        ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.rotate(-0.15);
        const pts = []; for (let k = 0; k < 24; k++) { const a = (k / 24) * TAU, r = k % 2 ? 60 : 100 + (k % 4) * 8; pts.push([Math.cos(a) * r * 1.2, Math.sin(a) * r * 0.9]); }
        poly(ctx, pts, '#ffd23f', 4, 2);
        txt(ctx, 'БАМ!', 0, 0, 44, '#ff5a4a', 0);
        ctx.restore();
        break;
      }
      case 'poof':
        for (let k = 0; k < 9; k++) {
          const a = (k / 9) * TAU, r = 30 + smooth(u) * 110;
          ctx.globalAlpha = 1 - smooth(u);
          blob(ctx, i.X + Math.cos(a) * r, i.Y - i.c.def.h * 0.5 + Math.sin(a) * r * 0.8, 34 * (1 - u * 0.5), 30 * (1 - u * 0.5), '#f4ecf7', null, 0, 3);
        }
        ctx.globalAlpha = 1;
        if (u < 0.5) star(ctx, i.X + 40, i.Y - i.c.def.h * 0.9, 18 * (1 - u * 2), '#ffd23f', 3);
        break;
    }
  }

  // ================================================================
  //  Облачка реплик (экранные координаты, читаемы на телефоне)
  // ================================================================
  function toScreen(x, y, cam) { const k = SCALE * cam.z; return [CW / 2 + (x - cam.x) * k, CH / 2 + (y - cam.y) * k]; }
  function wrap(ctx, text, maxW) {
    const words = text.split(' '), lines = [];
    let cur = '';
    for (const w of words) {
      const test = cur ? cur + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; } else cur = test;
    }
    if (cur) lines.push(cur);
    return lines;
  }
  function drawBubbles(ctx, S, t, byId, cam, dpr) {
    const fs = Math.max(27 * SCALE, 13.5 * dpr);
    const lw = Math.max(3.2 * SCALE, 1.6 * dpr);
    let prevBox = null;
    for (const b of S.talks) {
      if (t < b.t0 || t >= b.t1) continue;
      const i = byId[b.who]; if (!i) continue;
      const hp = headOf(i);
      let [hx, hy] = toScreen(hp.x + i.face * 16, hp.top + 10, cam);
      ctx.font = `400 ${fs}px ${FONT}`;
      const maxW = Math.max(400 * SCALE, 150 * dpr);
      const lines = wrap(ctx, b.text, maxW);
      const lh = fs * 1.18;
      let tw = 0; for (const l of lines) tw = Math.max(tw, ctx.measureText(l).width);
      const padX = fs * 0.75, padY = fs * 0.5;
      const bw = tw + padX * 2, bh = lines.length * lh + padY * 2;
      const lt = t - b.t0, D = b.t1 - b.t0;
      const pop = easeBack(lt / 0.2) * (1 - smooth((lt - (D - 0.16)) / 0.16));
      if (pop < 0.02) continue;
      const m = 10 * dpr;
      let bx = clamp(hx - bw / 2 + i.face * bw * 0.18, m, CW - bw - m);
      let by = hy - bh - fs * 1.4;
      if (by < m) by = m;
      if (prevBox && bx < prevBox[0] + prevBox[2] && bx + bw > prevBox[0] && by < prevBox[1] + prevBox[3] && by + bh > prevBox[1]) by = Math.min(CH - bh - m, prevBox[1] + prevBox[3] + m);
      prevBox = [bx, by, bw, bh];
      hy = Math.max(hy, by + bh + fs * 0.6);
      const cx = bx + bw / 2, cy = by + bh / 2;
      ctx.save();
      ctx.translate(cx, cy); ctx.scale(pop, pop); ctx.translate(-cx, -cy);
      const shout = b.emo === 'angry' || (b.emo === 'scared' && /!/.test(b.text));
      ctx.lineJoin = 'round'; ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.fillStyle = '#fffaf0';
      // хвостик
      const tx = clamp(hx, bx + bw * 0.18, bx + bw * 0.82);
      if (b.kind === 'think') {
        for (let k = 0; k < 3; k++) { const q = (k + 1) / 4, r = fs * (0.34 - k * 0.08); ctx.beginPath(); ctx.arc(lerp(tx, hx, q), lerp(by + bh, hy, q), r, 0, TAU); ctx.fill(); ctx.stroke(); }
      } else {
        ctx.beginPath(); ctx.moveTo(tx - fs * 0.5, by + bh - lw); ctx.quadraticCurveTo(tx, by + bh + fs * 0.4, hx, hy); ctx.quadraticCurveTo(tx + fs * 0.1, by + bh + fs * 0.2, tx + fs * 0.5, by + bh - lw); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      // тело облачка
      ctx.beginPath();
      if (b.kind === 'think') {
        const n = Math.max(8, Math.round((bw + bh) / (fs * 1.1)));
        for (let k = 0; k < n; k++) { const a = (k / n) * TAU; ctx.moveTo(cx + Math.cos(a) * bw * 0.5 + fs * 0.45, cy + Math.sin(a) * bh * 0.52); ctx.arc(cx + Math.cos(a) * bw * 0.5, cy + Math.sin(a) * bh * 0.52, fs * 0.45, 0, TAU); }
        ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(cx, cy, bw * 0.5, bh * 0.52, 0, 0, TAU); ctx.fill();
      } else if (shout) {
        const n = 22;
        for (let k = 0; k < n; k++) { const a = (k / n) * TAU, r = k % 2 ? 1.0 : 1.16 + ((k * 7) % 3) * 0.04; const x = cx + Math.cos(a) * bw * 0.56 * r, y = cy + Math.sin(a) * bh * 0.62 * r; k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.closePath(); ctx.fill(); ctx.stroke();
      } else {
        const r = Math.min(bh / 2, fs * 1.1);
        ctx.moveTo(bx + r, by); ctx.lineTo(bx + bw - r, by); ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + r); ctx.lineTo(bx + bw, by + bh - r); ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - r, by + bh);
        ctx.lineTo(bx + r, by + bh); ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - r); ctx.lineTo(bx, by + r); ctx.quadraticCurveTo(bx, by, bx + r, by);
        ctx.fill(); ctx.stroke();
        // перекрыть хвостик у основания
        ctx.fillRect(tx - fs * 0.5 + lw, by + bh - lw * 2.2, fs - lw * 2, lw * 2);
      }
      if (b.kind === 'sing') { ctx.fillStyle = '#e5484d'; ctx.font = `700 ${fs}px ${FONT}`; ctx.fillText('♪', bx - fs * 0.2, by + fs * 0.3); ctx.fillText('♫', bx + bw - fs * 0.5, by + bh + fs * 0.1); }
      // текст печатается
      const shown = Math.min(b.text.length, Math.floor((lt / Math.max(0.6, D * 0.7)) * b.text.length) + 1);
      let left = shown;
      ctx.font = `400 ${fs}px ${FONT}`; ctx.fillStyle = INK; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      lines.forEach((l, k) => {
        if (left <= 0) return;
        const part = l.slice(0, left); left -= l.length + 1;
        const lwid = ctx.measureText(l).width;
        ctx.fillText(part, cx - lwid / 2, by + padY + lh * (k + 0.5));
      });
      ctx.restore();
    }
  }

  // ================================================================
  //  Титр, переходы, «Конец», зерно плёнки
  // ================================================================
  function drawTitle(ctx, film, t, dpr) {
    if (t > 3.0) return;
    const inU = easeBack(t / 0.55), outU = smooth((t - 2.5) / 0.45);
    const fs = Math.max(66 * SCALE, 20 * dpr);
    ctx.font = `700 ${fs}px ${FONT}`;
    const title = film.title;
    const tw = Math.min(ctx.measureText(title).width, CW * 0.86);
    const bw = tw + fs * 1.4, bh = fs * 1.9;
    const x = CW / 2, y = lerp(-bh, CH * 0.2, inU) - outU * CH * 0.5;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(-0.025 + Math.sin(t * 2) * 0.006);
    ctx.fillStyle = 'rgba(30,20,15,0.25)'; ctx.fillRect(-bw / 2 + fs * 0.12, -bh / 2 + fs * 0.16, bw, bh);
    ctx.fillStyle = '#fbf2de'; ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
    ctx.lineWidth = Math.max(4 * SCALE, 2 * dpr); ctx.strokeStyle = INK; ctx.strokeRect(-bw / 2, -bh / 2, bw, bh);
    ctx.fillStyle = '#e5484d'; ctx.font = `700 ${fs * 0.34}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('мультфильм', 0, -bh * 0.27);
    ctx.fillStyle = INK; ctx.font = `700 ${fs}px ${FONT}`;
    ctx.fillText(title, 0, bh * 0.1, CW * 0.86);
    ctx.restore();
  }
  const TRANS = ['fade', 'iris', 'wipe'];
  function cover(ctx, type, k, cx, cy) {
    if (k <= 0.001) return;
    ctx.save();
    if (type === 'fade') { ctx.fillStyle = `rgba(18,12,10,${k})`; ctx.fillRect(0, 0, CW, CH); }
    else if (type === 'iris') {
      const R = Math.hypot(CW, CH) * 0.6 * (1 - k);
      ctx.beginPath(); ctx.rect(0, 0, CW, CH); ctx.arc(cx, cy, Math.max(0, R), 0, TAU, true);
      ctx.fillStyle = '#120c0a'; ctx.fill('evenodd');
    } else {
      const w = CW * k;
      ctx.fillStyle = '#f4e8d2'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w, 0);
      for (let y = 0; y <= CH; y += CH / 12) ctx.lineTo(w + Math.sin(y * 0.05) * 14 * SCALE, y);
      ctx.lineTo(0, CH); ctx.closePath(); ctx.fill();
      ctx.lineWidth = Math.max(4 * SCALE, 2); ctx.strokeStyle = INK; ctx.stroke();
    }
    ctx.restore();
  }
  function drawTransition(ctx, film, S, t, byId, cam, dpr) {
    const last = S.i === film.scenes.length - 1;
    const into = t - S.t0, out = S.t1 - t;
    if (S.i > 0 && into < 0.45) cover(ctx, TRANS[S.i % 3], 1 - smooth(into / 0.45), CW / 2, CH / 2);
    if (!last && out < 0.3) cover(ctx, TRANS[(S.i + 1) % 3], smooth(1 - out / 0.3), CW / 2, CH / 2);
    if (last) {
      // финал: ирис сжимается на лице героя, «Конец»
      const e = film.duration - t;
      if (e < 3.0) {
        // ирис закрывается на тех, кого держит последний план: одного — на лице, пару — общим кругом
        const inShot = (i) => i && i.vis && i.x > -4 && i.x < 104;
        let targets = [];
        const last = cam.cam;
        if (last && last.mode !== 'wide' && last.mode !== 'pan') targets = castOf(S, last).map((id) => byId[id]).filter(inShot);
        if (!targets.length && inShot(byId[film.finalWho])) targets = [byId[film.finalWho]];
        let hx = CW / 2, hy = CH / 2, extra = 0;
        if (targets.length) {
          const pts = targets.map((i) => toScreen(headOf(i).x, headOf(i).y, cam));
          const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
          const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
          hx = (x0 + x1) / 2; hy = (y0 + y1) / 2; extra = Math.hypot(x1 - x0, y1 - y0) / 2;
        }
        hx = clamp(hx, CW * 0.15, CW * 0.85); hy = clamp(hy, CH * 0.2, CH * 0.8);
        const full = Math.hypot(CW, CH);
        const small = 150 * SCALE * cam.z * 0.8 + extra;
        let R;
        if (e > 1.7) R = lerp(full, small, smooth((3.0 - e) / 1.3));
        else if (e > 0.55) R = small;
        else R = small * smooth(e / 0.55);
        ctx.save();
        ctx.beginPath(); ctx.rect(0, 0, CW, CH); ctx.arc(hx, hy, Math.max(0, R), 0, TAU, true);
        ctx.fillStyle = '#120c0a'; ctx.fill('evenodd');
        const a = smooth((2.0 - e) / 0.5);
        if (a > 0) {
          const fs = Math.max(78 * SCALE, 24 * dpr);
          ctx.globalAlpha = a;
          ctx.font = `700 ${fs}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          const ty = hy > CH * 0.5 ? CH * 0.18 : CH * 0.84;
          ctx.fillStyle = '#fbf2de'; ctx.fillText('Конец', CW / 2, ty);
        }
        ctx.restore();
      }
    }
  }
  let GRAIN = null;
  function drawGrain(ctx, t) {
    if (!GRAIN) {
      GRAIN = document.createElement('canvas'); GRAIN.width = GRAIN.height = 192;
      const g = GRAIN.getContext('2d'), img = g.createImageData(192, 192);
      for (let k = 0; k < img.data.length; k += 4) { const v = Math.random() * 255; img.data[k] = img.data[k + 1] = img.data[k + 2] = v; img.data[k + 3] = 255; }
      g.putImageData(img, 0, 0);
    }
    ctx.save();
    ctx.globalAlpha = 0.045;
    const f = Math.floor(t * 12);
    ctx.translate(-(f * 37) % 192, -(f * 71) % 192);
    ctx.fillStyle = ctx.createPattern(GRAIN, 'repeat');
    ctx.fillRect(0, 0, CW + 192, CH + 192);
    ctx.restore();
    const v = ctx.createRadialGradient(CW / 2, CH / 2, CH * 0.45, CW / 2, CH / 2, CH * 0.95);
    v.addColorStop(0, 'rgba(30,18,12,0)'); v.addColorStop(1, 'rgba(30,18,12,0.32)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, CW, CH);
  }

  // ================================================================
  //  Кадр целиком
  // ================================================================
  function holdOf(S, id, t) {
    for (const pid in S.props) { const p = L.evalProp(S.props[pid], t); if (p.holder === id && !p.hidden) return S.props[pid].kind; }
    return null;
  }
  function render(ctx, film, t, opts) {
    FILM = film;
    CW = ctx.canvas.width; CH = ctx.canvas.height; SCALE = CW / W;
    const dpr = (opts && opts.dpr) || 1;
    t = clamp(t, 0, Math.max(0, film.duration - 0.001));
    const S = L.sceneAt(film, t);
    P.setBoil(Math.floor(t * 8));
    const g = GROUND[S.place] || 790;
    const infos = [], byId = {};
    for (const id in S.actors) {
      const i = L.evalActor(S, id, t), i2 = L.evalActor(S, id, Math.max(S.t0, t - 0.06));
      i.vel = t - 0.06 >= S.t0 ? (i.x - i2.x) / 0.06 : 0;
      i.c = film.cast[id]; i.X = wx(i.x); i.Y = g - i.alt * 6;
      infos.push(i); byId[id] = i;
    }
    const cam = camAt(S, t, infos);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#120c0a'; ctx.fillRect(0, 0, CW, CH);
    const fg = (PLACE[S.place] || PLACE.meadow)(ctx, S, t, (d) => setLayer(ctx, cam, d), S.time);
    setLayer(ctx, cam, 1);
    // тени
    for (const i of infos) {
      if (!i.vis || i.alt > 40) continue;
      const k = 1 - i.alt / 45;
      ctx.fillStyle = `rgba(30,20,25,${0.22 * k})`;
      ctx.beginPath(); ctx.ellipse(i.X, g + 4, (i.c.def.h * 0.28) * (0.6 + 0.4 * k), 12 * k + 2, 0, 0, TAU); ctx.fill();
    }
    // реквизит на земле
    for (const pid in S.props) {
      const p = L.evalProp(S.props[pid], t);
      if (p.hidden || p.holder) continue;
      P.drawProp(ctx, S.props[pid].kind, wx(p.x), g - 26, 1.05, t);
    }
    // актёры: парящие — позади
    const order = infos.slice().sort((a, b) => (b.c.def.float ? 1 : 0) - (a.c.def.float ? 1 : 0));
    for (const i of order) {
      if (!i.vis) continue;
      i.pose = P.drawActor(ctx, i.c, i, t, i.X, i.Y, holdOf(S, i.id, t));
    }
    for (const f of S.fx) if (t >= f.t0 && t < f.t1 && byId[f.who] && byId[f.who].vis) drawFx(ctx, f, byId[f.who], t, f.other ? byId[f.other] : null);
    if (fg) { setLayer(ctx, cam, 1.12); fg(ctx); }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawBubbles(ctx, S, t, byId, cam, dpr);
    drawTitle(ctx, film, t, dpr);
    drawTransition(ctx, film, S, t, byId, cam, dpr);
    drawGrain(ctx, t);
    return { scene: S.i, cam };
  }

  window.Stage = { render, GROUND, PLACE_LIST: Object.keys(PLACE) };
})();
