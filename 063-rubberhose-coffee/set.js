'use strict';
/* =====================================================================
   Кофейник Жорж · декорации
   Кухня нарисована в «мире» 1920 × 1080 с запасом по краям для камеры.
   Фон — мягче персонажей: полутона и тонкие серые линии, как гуашь под целлулоидом.
   Всё пританцовывает: env.groove (0…1) — доля «пляски», env.sleep — сонное дыхание.
   ===================================================================== */

const SET = {
  stoveTop: 492, sill: 452, shelf1: 420, shelf2: 272, counter: 560, table: 632, floor: 792,
  wallBase: 770,
};

/** Подпрыгивание реквизита на долю: сжатие на ударе, вытягивание между ударами. */
function propBeat(env, ph = 0) {
  const u = frac((env.t - ph) / BEAT);
  const g = env.groove;
  const s = env.sleep * 0.018 * Math.sin(TAU * (env.t - 7) / 2 - Math.PI / 2);
  return { sy: 1 + g * (-0.05 * Math.cos(TAU * u)) + s, lift: g * 6 * Math.sin(Math.PI * u) ** 2, sway: g * 0.03 * Math.sin(TAU * (env.t - ph) / (2 * BEAT)) };
}
function withProp(ctx, env, bx, by, ph, fn, k = 1) {
  const b = propBeat(env, ph);
  ctx.save();
  ctx.translate(bx, by - b.lift * k);
  ctx.rotate(b.sway * k);
  ctx.scale(1 / (1 + (b.sy - 1) * k), 1 + (b.sy - 1) * k);
  ctx.translate(-bx, -by);
  fn();
  ctx.restore();
}

/* ---------- стены и пол ---------- */
function drawRoom(ctx, env, view) {
  const lwb = 2.2 * LWF;
  const g = ctx.createLinearGradient(0, -200, 0, 770);
  g.addColorStop(0, '#8e877b'); g.addColorStop(0.45, '#b2ab9d'); g.addColorStop(1, '#bcb5a7');
  ctx.fillStyle = g; ctx.fillRect(-400, -300, 2720, 1072);
  // обои: ромбы с точками, рисуем только видимое
  ctx.save();
  ctx.beginPath(); ctx.rect(-400, -300, 2720, 880); ctx.clip();
  ctx.strokeStyle = 'rgba(96,90,80,0.22)'; ctx.lineWidth = 1.6 * LWF;
  const step = 72, x0 = Math.floor((view.x0 - 600) / step) * step, x1 = view.x1 + 600;
  ctx.beginPath();
  for (let x = x0; x < x1; x += step) {
    ctx.moveTo(x, -300); ctx.lineTo(x + 880 * 0.58, 580);
    ctx.moveTo(x, -300); ctx.lineTo(x - 880 * 0.58, 580);
  }
  ctx.stroke();
  ctx.fillStyle = 'rgba(96,90,80,0.3)';
  ctx.beginPath();
  for (let y = -300 + step * 0.86 / 2; y < 580; y += step * 0.86) {
    if (y < view.y0 - 10 || y > view.y1 + 10) continue;
    const row = Math.round((y + 300) / (step * 0.86));
    for (let x = Math.floor(view.x0 / step) * step - step; x < view.x1 + step; x += step) {
      const xx = x + (row % 2 ? step / 2 : 0);
      ctx.moveTo(xx + 2.6, y); ctx.arc(xx, y, 2.6, 0, TAU);
    }
  }
  ctx.fill();
  ctx.restore();
  // карниз под потолком
  ctx.fillStyle = T[2]; ctx.fillRect(-400, -30, 2720, 26);
  line(ctx, -400, -4, 2320, -4, lwb, T[6]);
  // панели, поручень, плинтус
  ctx.fillStyle = T[4]; ctx.fillRect(-400, 586, 2720, 170);
  ctx.strokeStyle = T[5]; ctx.lineWidth = 1.6 * LWF;
  ctx.beginPath();
  for (let x = Math.floor(view.x0 / 46) * 46; x < view.x1 + 46; x += 46) { ctx.moveTo(x, 594); ctx.lineTo(x, 750); }
  ctx.stroke();
  ctx.fillStyle = T[2]; ctx.fillRect(-400, 576, 2720, 14);
  line(ctx, -400, 590, 2320, 590, lwb, T[6]);
  ctx.fillStyle = T[6]; ctx.fillRect(-400, 748, 2720, 24);
  // пол: шахматная плитка в перспективе
  const VPx = 960, VPy = 250, Y0 = SET.wallBase, Y1 = 1320;
  ctx.fillStyle = '#c9c2b2'; ctx.fillRect(-400, Y0, 2720, Y1 - Y0);
  const rows = [];
  for (let i = 0; i <= 9; i++) rows.push(Y0 + (Y1 - Y0) * (i / 9) ** 1.55);
  const colX = (c, y) => VPx + (c * 118 - VPx) * (y - VPy) / (Y0 - VPy);
  ctx.fillStyle = '#8b8579';
  ctx.beginPath();
  for (let r = 0; r < rows.length - 1; r++) {
    const ya = rows[r], yb = rows[r + 1];
    if (ya > view.y1 + 10) break;
    for (let c = -14; c < 30; c++) {
      if ((r + c) % 2 === 0) continue;
      const xa0 = colX(c, ya), xa1 = colX(c + 1, ya), xb0 = colX(c, yb), xb1 = colX(c + 1, yb);
      if (Math.max(xa1, xb1) < view.x0 - 50 || Math.min(xa0, xb0) > view.x1 + 50) continue;
      ctx.moveTo(xa0, ya); ctx.lineTo(xa1, ya); ctx.lineTo(xb1, yb); ctx.lineTo(xb0, yb); ctx.closePath();
    }
  }
  ctx.fill();
  const fg = ctx.createLinearGradient(0, Y0, 0, Y0 + 200);
  fg.addColorStop(0, 'rgba(40,34,28,0.32)'); fg.addColorStop(1, 'rgba(40,34,28,0)');
  ctx.fillStyle = fg; ctx.fillRect(-400, Y0, 2720, 200);
  // солнечное пятно от окна на полу
  if (env.day > 0.02) {
    ctx.save(); ctx.globalAlpha = 0.16 * env.day;
    ctx.beginPath(); ctx.moveTo(430, 800); ctx.lineTo(760, 800); ctx.lineTo(900, 1000); ctx.lineTo(470, 1000); ctx.closePath();
    ctx.fillStyle = PAPER; ctx.fill();
    ctx.globalAlpha = 0.1 * env.day;
    line(ctx, 600, 800, 690, 1000, 12, T[6]); line(ctx, 440, 890, 830, 890, 10, T[6]);
    ctx.restore();
  }
}

/* ---------- окно: небо, луна, солнце, холмы, занавески ---------- */
function drawWindow(ctx, env) {
  const t = env.t, d = env.day, lwb = 2.4 * LWF;
  const X0 = 616, X1 = 944, Y0 = 118, Y1 = 438;
  ctx.save();
  ctx.beginPath(); ctx.rect(X0, Y0, X1 - X0, Y1 - Y0); ctx.clip();
  const sky = ctx.createLinearGradient(0, Y0, 0, Y1);
  const top = mixHex('#2f2c28', '#d6d0c2', d), bot = mixHex('#4a463f', '#f1ece0', d);
  sky.addColorStop(0, top); sky.addColorStop(1, bot);
  ctx.fillStyle = sky; ctx.fillRect(X0, Y0, X1 - X0, Y1 - Y0);
  // звёзды
  if (d < 0.95) {
    for (let i = 0; i < 9; i++) {
      const sx = X0 + 20 + hash2(i, 3) * 290, sy = Y0 + 16 + hash2(i, 4) * 170;
      const tw = 0.6 + 0.4 * Math.sin(t * 3 + i * 1.7);
      starGlyph(ctx, sx, sy, 5 + hash2(i, 5) * 3, 0.2, (1 - d) * tw);
    }
  }
  // луна садится
  const my = K(t, [[7, 190], [15.5, 470, 'in']]);
  if (my < 460) drawMoon(ctx, 700, my, env);
  // солнце встаёт (с лицом, как положено в 1930-х)
  const sunY = K(t, [[12, 520], [21.5, 262, 'out']]) - propBeat(env, 0.25).lift * 1.5;
  if (sunY < 500) drawSun(ctx, 842, sunY, env);
  // холмы, изгородь, дерево
  ctx.fillStyle = mixHex('#3a3631', '#b7b0a2', d);
  ctx.beginPath(); ctx.moveTo(X0, 380); ctx.quadraticCurveTo(700, 330, 780, 372); ctx.quadraticCurveTo(860, 344, X1, 360); ctx.lineTo(X1, Y1); ctx.lineTo(X0, Y1); ctx.fill();
  ctx.fillStyle = mixHex('#2c2925', '#9a9386', d);
  ctx.beginPath(); ctx.moveTo(X0, 410); ctx.quadraticCurveTo(740, 380, 830, 404); ctx.quadraticCurveTo(900, 392, X1, 402); ctx.lineTo(X1, Y1); ctx.lineTo(X0, Y1); ctx.fill();
  const treeC = mixHex('#24211d', '#6c665c', d);
  withProp(ctx, env, 668, 398, 0.1, () => {
    line(ctx, 668, 398, 668, 360, 5, treeC);
    ctx.beginPath(); circ(ctx, 668, 344, 22); ctx.fillStyle = treeC; ctx.fill();
  }, 1.5);
  ctx.strokeStyle = mixHex('#24211d', '#6c665c', d); ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 760; x < 944; x += 16) { ctx.moveTo(x, 412); ctx.lineTo(x, 396); }
  ctx.moveTo(756, 402); ctx.lineTo(944, 402); ctx.stroke();
  // блики на стекле
  ctx.fillStyle = 'rgba(255,252,242,0.13)';
  ctx.beginPath(); ctx.moveTo(640, 438); ctx.lineTo(700, 118); ctx.lineTo(730, 118); ctx.lineTo(670, 438); ctx.fill();
  ctx.beginPath(); ctx.moveTo(840, 438); ctx.lineTo(900, 118); ctx.lineTo(912, 118); ctx.lineTo(852, 438); ctx.fill();
  ctx.restore();
  // рама и переплёт
  ctx.fillStyle = T[1]; ctx.strokeStyle = T[7]; ctx.lineWidth = lwb;
  ctx.beginPath(); ctx.rect(600, 102, 360, 352); ctx.rect(X0, Y0, X1 - X0, Y1 - Y0); ctx.fill('evenodd'); ctx.stroke();
  ctx.beginPath(); ctx.rect(775, Y0, 10, Y1 - Y0); ctx.rect(X0, 272, X1 - X0, 10); ctx.fill(); ctx.stroke();
  // подоконник
  ctx.beginPath(); ctx.rect(580, 438, 400, 16); paint(ctx, T[1], lwb, T[7]);
  ctx.beginPath(); ctx.rect(590, 454, 380, 9); paint(ctx, T[3], lwb, T[7]);
  // горшок с цветком
  withProp(ctx, env, 640, 438, 0.35, () => {
    ctx.beginPath(); ctx.moveTo(624, 438); ctx.lineTo(620, 412); ctx.lineTo(660, 412); ctx.lineTo(656, 438); ctx.closePath(); paint(ctx, T[5], lwb, T[7]);
    ctx.beginPath(); ctx.rect(617, 404, 46, 10); paint(ctx, T[4], lwb, T[7]);
    line(ctx, 640, 404, 640, 372, 3, T[7]);
    for (const a of [-0.9, 0.9]) { ctx.beginPath(); ell(ctx, 640 + Math.sin(a) * 12, 388, 11, 5, a * 0.5); paint(ctx, T[6], 0); }
    ctx.save(); ctx.translate(640, 366);
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ell(ctx, Math.cos(i / 6 * TAU) * 8, Math.sin(i / 6 * TAU) * 8, 6, 4, i / 6 * TAU); paint(ctx, PAPER, 1.4 * LWF, T[7]); }
    ctx.beginPath(); circ(ctx, 0, 0, 5); ctx.fillStyle = T[6]; ctx.fill();
    ctx.restore();
  }, 1.4);
  // занавески и ламбрекен
  const sw = env.groove * 7 * Math.sin(TAU * t / (2 * BEAT)) + env.sleep * 2 * Math.sin(TAU * (t - 7) / 2);
  drawCurtain(ctx, 560, 668, sw, -1);
  drawCurtain(ctx, 1000, 892, -sw, 1);
  ctx.beginPath();
  ctx.moveTo(548, 78); ctx.lineTo(1012, 78); ctx.lineTo(1012, 118);
  for (let i = 0; i < 8; i++) { const xa = 1012 - i * 58; ctx.quadraticCurveTo(xa - 29, 150, xa - 58, 118); }
  ctx.closePath(); paint(ctx, T[5], lwb, T[7]);
  ctx.fillStyle = T[3];
  for (let i = 0; i < 16; i++) { ctx.beginPath(); circ(ctx, 566 + i * 28 + (i % 2) * 6, 94 + (i % 2) * 12, 3.2); ctx.fill(); }
  line(ctx, 548, 84, 1012, 84, 3 * LWF, T[7]);
}
function drawCurtain(ctx, xo, xi, sw, dir) {
  const lwb = 2.2 * LWF;
  ctx.beginPath();
  ctx.moveTo(xo, 100);
  ctx.lineTo(xi, 100);
  ctx.bezierCurveTo(xi + dir * 10, 220, xi - dir * 40 + sw * 0.5, 300, xo - dir * 18 + sw * 0.4, 330);
  ctx.bezierCurveTo(xo - dir * 6 + sw, 380, xo - dir * 12 + sw, 440, xo - dir * 2 + sw, 486);
  ctx.lineTo(xo + dir * 20 + sw, 486);
  ctx.bezierCurveTo(xo + dir * 18, 420, xo + dir * 16, 360, xo + dir * 14, 330);
  ctx.lineTo(xo + dir * 16, 100);
  ctx.closePath();
  paint(ctx, T[5], lwb, T[7]);
  ctx.strokeStyle = T[6]; ctx.lineWidth = 1.8 * LWF;
  for (let i = 1; i < 3; i++) {
    const x = lerp(xo, xi, i / 3);
    ctx.beginPath(); ctx.moveTo(x, 104); ctx.quadraticCurveTo(x - dir * 8, 220, lerp(xo, xo - dir * 18, i / 3) + sw * 0.4, 326); ctx.stroke();
  }
  ctx.fillStyle = T[3];
  for (let i = 0; i < 7; i++) { ctx.beginPath(); circ(ctx, lerp(xo, xi, 0.25 + (i % 3) * 0.25) - dir * 4, 130 + i * 28, 3); ctx.fill(); }
  // подхват
  ctx.beginPath(); ell(ctx, xo - dir * 2 + sw * 0.4, 330, 20, 7, 0.2 * dir); paint(ctx, T[2], lwb, T[7]);
}
function drawMoon(ctx, x, y, env) {
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, 30, 0, TAU); ctx.arc(x + 14, y - 8, 26, 0, TAU, true); ctx.fillStyle = PAPER; ctx.fill('evenodd');
  ctx.beginPath(); ctx.arc(x, y, 30, 0.9, 5.4); ctx.lineWidth = 2 * LWF; ctx.strokeStyle = T[6]; ctx.stroke();
  // сонный глаз и улыбка
  ctx.beginPath(); ctx.moveTo(x - 20, y - 2); ctx.quadraticCurveTo(x - 15, y + 3, x - 10, y - 1); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - 20, y + 12); ctx.quadraticCurveTo(x - 14, y + 16, x - 8, y + 13); ctx.stroke();
  ctx.restore();
}
function drawSun(ctx, x, y, env) {
  const t = env.t;
  ctx.save(); ctx.translate(x, y);
  ctx.rotate(t * 0.25);
  for (let i = 0; i < 14; i++) {
    const an = i / 14 * TAU;
    ctx.beginPath(); ctx.moveTo(Math.cos(an - 0.09) * 44, Math.sin(an - 0.09) * 44);
    ctx.lineTo(Math.cos(an) * (58 + (i % 2) * 8), Math.sin(an) * (58 + (i % 2) * 8));
    ctx.lineTo(Math.cos(an + 0.09) * 44, Math.sin(an + 0.09) * 44); ctx.closePath();
    paint(ctx, PAPER, 1.6 * LWF, T[5]);
  }
  ctx.rotate(-t * 0.25);
  ctx.beginPath(); circ(ctx, 0, 0, 40); paint(ctx, PAPER, 2.2 * LWF, T[6]);
  const awake = seg(t, 21.8, 22.3);
  if (awake < 0.5) {
    for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sd * 15 - 7, -4); ctx.quadraticCurveTo(sd * 15, 2, sd * 15 + 7, -4); ctx.lineWidth = 2.4; ctx.strokeStyle = INK; ctx.stroke(); }
  } else {
    for (const sd of [-1, 1]) pieEye(ctx, sd * 11, -6, 7.5, 11, { open: 1, lx: -0.5, ly: 0.3, pupil: 0.9 }, 2, sd, PAPER);
  }
  ctx.beginPath(); ctx.moveTo(-14, 12); ctx.quadraticCurveTo(0, 24, 14, 12); ctx.lineWidth = 2.4; ctx.strokeStyle = INK; ctx.stroke();
  ctx.fillStyle = 'rgba(150,143,132,0.6)';
  for (const sd of [-1, 1]) { ctx.beginPath(); ell(ctx, sd * 25, 10, 6, 4); ctx.fill(); }
  ctx.restore();
}
function mixHex(a, b, u) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round(lerp(pa >> 16, pb >> 16, u)), g = Math.round(lerp((pa >> 8) & 255, (pb >> 8) & 255, u)), bl = Math.round(lerp(pa & 255, pb & 255, u));
  return `rgb(${r},${g},${bl})`;
}

/* ---------- плита 1930-х на гнутых ножках ---------- */
function drawStove(ctx, env) {
  const lwb = 2.5 * LWF;
  withProp(ctx, env, 335, 792, 0, () => {
    for (const x of [176, 494]) {
      ctx.beginPath(); ctx.moveTo(x - 9, 730); ctx.bezierCurveTo(x - 12, 760, x + (x < 300 ? -14 : 14), 770, x + (x < 300 ? -8 : 8), 792);
      ctx.lineTo(x + (x < 300 ? 6 : -6), 792); ctx.bezierCurveTo(x + (x < 300 ? -2 : 2), 770, x + 8, 756, x + 9, 730); ctx.closePath();
      paint(ctx, T[7], lwb, INK);
    }
    // задняя стенка
    ctx.beginPath(); rrect(ctx, 168, 394, 334, 98, 18); paint(ctx, T[1], lwb, T[6]);
    ctx.beginPath(); rrect(ctx, 186, 410, 298, 66, 10); ctx.lineWidth = 1.6 * LWF; ctx.strokeStyle = T[4]; ctx.stroke();
    ctx.beginPath(); circ(ctx, 335, 442, 17); paint(ctx, PAPER, lwb, T[6]);
    line(ctx, 335, 442, 344, 432, 2, T[7]);
    // корпус
    const gb = ctx.createLinearGradient(150, 0, 520, 0);
    gb.addColorStop(0, '#f1ece1'); gb.addColorStop(0.7, '#ddd6c8'); gb.addColorStop(1, '#c5beaf');
    ctx.beginPath(); rrect(ctx, 150, 498, 370, 234, 10); paint(ctx, gb, lwb, T[7]);
    ctx.beginPath(); ctx.moveTo(146, 500); ctx.lineTo(524, 500); ctx.lineTo(512, 484); ctx.lineTo(158, 484); ctx.closePath(); paint(ctx, T[3], lwb, T[7]);
    for (const bx of [262, 408]) {
      ctx.beginPath(); ell(ctx, bx, 491, 48, 7.5); ctx.lineWidth = 5 * LWF; ctx.strokeStyle = T[8]; ctx.stroke();
      ctx.beginPath(); ell(ctx, bx, 491, 26, 4); ctx.lineWidth = 3 * LWF; ctx.stroke();
    }
    // ручки
    for (let i = 0; i < 6; i++) {
      const kx = 200 + i * 52, rot = i === 5 ? env.knob : 0;
      ctx.beginPath(); circ(ctx, kx, 520, 10); paint(ctx, T[7], lwb, INK);
      line(ctx, kx, 520, kx + Math.sin(rot) * 8, 520 - Math.cos(rot) * 8, 3, PAPER);
    }
    // дверца духовки
    ctx.beginPath(); rrect(ctx, 192, 548, 286, 158, 12); paint(ctx, T[1], lwb, T[6]);
    line(ctx, 222, 566, 448, 566, 9, T[7]);
    ctx.beginPath(); rrect(ctx, 240, 590, 190, 84, 10); paint(ctx, T[6], lwb, T[7]);
    ctx.fillStyle = 'rgba(243,239,228,0.18)';
    ctx.beginPath(); ctx.moveTo(262, 670); ctx.lineTo(300, 594); ctx.lineTo(320, 594); ctx.lineTo(282, 670); ctx.fill();
  }, 0.7);
  ctx.beginPath(); ell(ctx, 335, 796, 200, 12); ctx.fillStyle = 'rgba(30,26,20,0.22)'; ctx.fill();
}

/** Утварь на рейке над плитой — качается в такт. */
function drawUtensils(ctx, env) {
  const t = env.t, lwb = 2.2 * LWF;
  line(ctx, 176, 288, 504, 288, 7, T[6]);
  const items = [[222, 0], [312, 1], [398, 2], [470, 3]];
  for (const [x, k] of items) {
    const ph = k * 0.12;
    const ang = env.groove * 0.16 * Math.sin(TAU * (t - ph) / (2 * BEAT)) + env.sleep * 0.03 * Math.sin(TAU * (t - 7) / 2 + k);
    ctx.save(); ctx.translate(x, 290); ctx.rotate(ang);
    ctx.beginPath(); ctx.arc(0, 4, 5, Math.PI, TAU); ctx.lineWidth = 2.4; ctx.strokeStyle = T[7]; ctx.stroke();
    if (k === 0) { // сковородка
      line(ctx, 0, 8, 0, 50, 9, T[7]);
      ctx.beginPath(); circ(ctx, 0, 92, 44); paint(ctx, T[7], lwb, INK);
      ctx.beginPath(); circ(ctx, 0, 92, 34); ctx.lineWidth = 2; ctx.strokeStyle = T[6]; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 92, 36, 3.6, 4.4); ctx.lineWidth = 3; ctx.strokeStyle = T[4]; ctx.stroke();
    } else if (k === 1) { // половник
      line(ctx, 0, 8, 0, 96, 6, T[6]);
      ctx.beginPath(); ctx.arc(0, 104, 18, 0, Math.PI); ctx.closePath(); paint(ctx, T[3], lwb, T[7]);
    } else if (k === 2) { // крышка от кастрюли
      ctx.beginPath(); ell(ctx, 0, 52, 34, 34); paint(ctx, T[2], lwb, T[7]);
      ctx.beginPath(); ell(ctx, 0, 52, 22, 22); ctx.lineWidth = 1.6; ctx.strokeStyle = T[4]; ctx.stroke();
      ctx.beginPath(); circ(ctx, 0, 52, 6); paint(ctx, T[7], 0);
    } else { // венчик
      line(ctx, 0, 8, 0, 44, 5, T[6]);
      ctx.strokeStyle = T[6]; ctx.lineWidth = 1.8;
      for (const wv of [-12, -5, 5, 12]) { ctx.beginPath(); ctx.moveTo(0, 44); ctx.quadraticCurveTo(wv * 1.4, 80, 0, 96); ctx.stroke(); }
    }
    ctx.restore();
  }
}

/* ---------- ходики с гирьками-шишками ---------- */
function drawWallClock(ctx, env) {
  const t = env.t, lwb = 2.3 * LWF;
  withProp(ctx, env, 1236, 262, 0.2, () => {
    const amp = 0.24 + env.groove * 0.14;
    const th = amp * Math.cos(TAU * t / 1.0);
    // гирьки на цепочках
    ctx.setLineDash([3, 3]); ctx.lineWidth = 1.8; ctx.strokeStyle = T[7];
    ctx.beginPath(); ctx.moveTo(1218, 262); ctx.lineTo(1218, 392); ctx.moveTo(1254, 262); ctx.lineTo(1254, 352); ctx.stroke();
    ctx.setLineDash([]);
    for (const [x, y] of [[1218, 392], [1254, 352]]) {
      ctx.beginPath(); ell(ctx, x, y + 18, 9, 18); paint(ctx, T[6], lwb, T[8]);
      ctx.strokeStyle = T[5]; ctx.lineWidth = 1.2;
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x - 8, y + 6 + i * 8); ctx.lineTo(x, y + 11 + i * 8); ctx.lineTo(x + 8, y + 6 + i * 8); ctx.stroke(); }
    }
    // маятник
    ctx.save(); ctx.translate(1236, 258); ctx.rotate(th);
    line(ctx, 0, 0, 0, 100, 3, T[7]);
    ctx.beginPath(); circ(ctx, 0, 108, 13); paint(ctx, T[2], lwb, T[7]);
    ctx.beginPath(); circ(ctx, -4, 104, 3.5); ctx.fillStyle = PAPER; ctx.fill();
    ctx.restore();
    // корпус-домик
    ctx.beginPath(); ctx.moveTo(1176, 172); ctx.lineTo(1236, 122); ctx.lineTo(1296, 172); ctx.closePath(); paint(ctx, T[6], lwb, T[8]);
    ctx.beginPath(); ctx.rect(1190, 170, 92, 94); paint(ctx, T[5], lwb, T[8]);
    ctx.beginPath(); circ(ctx, 1236, 216, 36); paint(ctx, PAPER, lwb, T[8]);
    for (let i = 0; i < 12; i++) {
      const an = i / 12 * TAU;
      line(ctx, 1236 + Math.cos(an) * 28, 216 + Math.sin(an) * 28, 1236 + Math.cos(an) * 32, 216 + Math.sin(an) * 32, i % 3 ? 1.4 : 2.6, T[8]);
    }
    const mins = 58 + clamp((t - 7) / 14) * 2 + Math.max(0, t - 21) * 0.12;
    const ma = mins / 60 * TAU - Math.PI / 2, ha = (6 + mins / 60) / 12 * TAU - Math.PI / 2;
    line(ctx, 1236, 216, 1236 + Math.cos(ha) * 17, 216 + Math.sin(ha) * 17, 3.2, INK);
    line(ctx, 1236, 216, 1236 + Math.cos(ma) * 26, 216 + Math.sin(ma) * 26, 2, INK);
    ctx.beginPath(); circ(ctx, 1236, 216, 3); ctx.fillStyle = INK; ctx.fill();
  }, 0.8);
}

/* ---------- буфет с полками ---------- */
function drawDresser(ctx, env) {
  const lwb = 2.4 * LWF;
  // полка 2 (верхняя) и полка 1
  for (const [y, xa, xb, brk] of [[SET.shelf2, 1516, 1864, [1548, 1832]], [SET.shelf1, 1496, 1864, [1528, 1832]]]) {
    for (const bx of brk) {
      ctx.beginPath(); ctx.moveTo(bx - 6, y + 12); ctx.lineTo(bx + 6, y + 12); ctx.bezierCurveTo(bx + 6, y + 40, bx - 14, y + 36, bx - 16, y + 62);
      ctx.lineTo(bx - 20, y + 58); ctx.bezierCurveTo(bx - 20, y + 30, bx - 6, y + 34, bx - 6, y + 12); ctx.closePath(); paint(ctx, T[6], lwb, T[8]);
    }
    ctx.beginPath(); ctx.rect(xa, y, xb - xa, 13); paint(ctx, T[5], lwb, T[8]);
    line(ctx, xa + 4, y + 3, xb - 4, y + 3, 2, T[4]);
  }
  // на верхней полке: тарелки, кувшинчик, сахарница
  withProp(ctx, env, 1600, SET.shelf2, 0.1, () => {
    for (const [x, r] of [[1590, 30], [1668, 33]]) {
      ctx.beginPath(); circ(ctx, x, SET.shelf2 - r - 2, r); paint(ctx, T[1], lwb, T[6]);
      ctx.beginPath(); circ(ctx, x, SET.shelf2 - r - 2, r * 0.62); ctx.lineWidth = 1.6 * LWF; ctx.strokeStyle = T[4]; ctx.stroke();
    }
  }, 0.6);
  // шкафчик
  withProp(ctx, env, 1670, 792, 0.25, () => {
    ctx.beginPath(); ctx.rect(1482, 566, 376, 216); paint(ctx, T[5], lwb, T[8]);
    ctx.beginPath(); ctx.rect(1470, 552, 400, 18); paint(ctx, T[4], lwb, T[8]);
    line(ctx, 1474, 556, 1866, 556, 2, T[3]);
    ctx.beginPath(); ctx.rect(1498, 580, 344, 30); paint(ctx, T[4], 1.8 * LWF, T[7]);
    for (const x of [1590, 1750]) { ctx.beginPath(); circ(ctx, x, 595, 5); paint(ctx, T[7], 0); }
    for (const x of [1498, 1676]) {
      ctx.beginPath(); rrect(ctx, x, 620, 166, 150, 8); paint(ctx, T[4], 1.8 * LWF, T[7]);
      ctx.beginPath(); rrect(ctx, x + 18, 638, 130, 114, 30); ctx.lineWidth = 1.8 * LWF; ctx.strokeStyle = T[6]; ctx.stroke();
      ctx.beginPath(); circ(ctx, x === 1498 ? x + 150 : x + 16, 700, 6); paint(ctx, T[7], 0);
    }
    ctx.beginPath(); ctx.rect(1482, 780, 376, 12); paint(ctx, T[7], lwb, T[8]);
  }, 0.4);
  ctx.beginPath(); ell(ctx, 1670, 796, 210, 10); ctx.fillStyle = 'rgba(30,26,20,0.22)'; ctx.fill();
}

/** Сахарница на верхней полке: за ней прячется Кроха, поэтому рисуется после неё. */
function drawSugarJar(ctx, env) {
  const lwb = 2.4 * LWF;
  withProp(ctx, env, 1745, SET.shelf2, 0.3, () => {
    ctx.beginPath(); rrect(ctx, 1710, 186, 70, 86, 16); paint(ctx, T[1], lwb, T[7]);
    ctx.beginPath(); rrect(ctx, 1714, 176, 62, 14, 5); paint(ctx, T[5], lwb, T[7]);
    ctx.beginPath(); circ(ctx, 1745, 170, 7); paint(ctx, T[5], lwb, T[7]);
    ctx.beginPath(); rrect(ctx, 1720, 212, 50, 24, 4); paint(ctx, PAPER, 1.6 * LWF, T[6]);
    ctx.fillStyle = T[7]; ctx.font = '600 13px "Kelly Slab", Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('САХАР', 1745, 225);
  }, 0.8);
}

/* ---------- стол с клетчатой скатертью ---------- */
function drawTable(ctx, env) {
  const lwb = 2.4 * LWF, t = env.t;
  // ножки
  for (const [x, yb, c] of [[764, 846, T[7]], [1336, 846, T[7]], [728, 884, T[6]], [1372, 884, T[6]]]) {
    ctx.beginPath(); rrect(ctx, x - 9, 690, 18, yb - 690, 7); paint(ctx, c, lwb, T[8]);
    ctx.beginPath(); ell(ctx, x, 760, 14, 10); paint(ctx, c, lwb, T[8]);
  }
  ctx.beginPath(); ell(ctx, 1050, 888, 400, 16); ctx.fillStyle = 'rgba(30,26,20,0.22)'; ctx.fill();
  // столешница под скатертью
  ctx.beginPath(); ctx.moveTo(716, 610); ctx.lineTo(1384, 610); ctx.lineTo(1404, 634); ctx.lineTo(696, 634); ctx.closePath(); paint(ctx, PAPER, lwb, T[6]);
  // свисающая скатерть с фестонами: чуть колышется в такт
  const fl = env.groove * 3 * Math.sin(TAU * t / (2 * BEAT));
  ctx.beginPath(); ctx.moveTo(696, 634); ctx.lineTo(1404, 634); ctx.lineTo(1406 + fl, 700);
  for (let i = 0; i < 16; i++) { const xa = 1406 + fl - i * 44.5; ctx.quadraticCurveTo(xa - 22, 716, xa - 44.5, 700); }
  ctx.closePath(); paint(ctx, T[0], lwb, T[6]);
  ctx.save(); ctx.clip();
  ctx.fillStyle = T[5];
  for (let i = 0; i < 60; i++) {
    const x = 698 + i * 12;
    ctx.fillRect(x + fl * (i / 60), 672 + (i % 2) * 11, 12, 11);
  }
  ctx.fillStyle = 'rgba(120,112,100,0.14)'; ctx.fillRect(690, 634, 730, 18);
  ctx.restore();
  line(ctx, 700, 634, 1400, 634, 1.6 * LWF, T[5]);
}

/* ---------- кухня целиком (фон под персонажами) ---------- */
function drawKitchen(ctx, env, view) {
  drawRoom(ctx, env, view);
  drawWindow(ctx, env);
  drawUtensils(ctx, env);
  drawStove(ctx, env);
  drawWallClock(ctx, env);
  drawDresser(ctx, env);
  drawTable(ctx, env);
}

/* =====================================================================
   Титры эпохи: солнечные лучи, рамка в духе ар-деко, буквы с объёмной тенью
   ===================================================================== */
const FONT_TITLE = '"Yeseva One", "Playfair Display", Georgia, serif';
const FONT_SMALL = '"Kelly Slab", "Rockwell", Georgia, serif';

function sunburst(ctx, t, cx, cy, n, a, b) {
  ctx.fillStyle = a; ctx.fillRect(-300, -300, 2520, 1680);
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * 0.06);
  ctx.fillStyle = b;
  for (let i = 0; i < n; i++) {
    const a0 = i / n * TAU, a1 = a0 + TAU / n / 2;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a0) * 3000, Math.sin(a0) * 3000); ctx.lineTo(Math.cos(a1) * 3000, Math.sin(a1) * 3000); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  const g = ctx.createRadialGradient(cx, cy, 200, cx, cy, 1400);
  g.addColorStop(0, 'rgba(250,245,232,0.25)'); g.addColorStop(1, 'rgba(14,12,10,0.55)');
  ctx.fillStyle = g; ctx.fillRect(-300, -300, 2520, 1680);
}

/** Буквы с обводкой и глубокой «выдавленной» тенью, как на рисованных титрах 1930-х. */
function fancyText(ctx, str, x, y, size, opts = {}) {
  ctx.save();
  ctx.font = `${size}px ${opts.font || FONT_TITLE}`;
  ctx.textBaseline = 'alphabetic';
  const letters = [...str];
  const widths = letters.map((c) => ctx.measureText(c).width);
  const track = size * (opts.track || 0.02);
  const total = widths.reduce((a, b) => a + b, 0) + track * (letters.length - 1);
  let cx = x - total / 2;
  const pos = letters.map((c, i) => { const p = cx; cx += widths[i] + track; return p; });
  const depth = size * 0.07;
  const drawPass = (fn) => {
    letters.forEach((c, i) => {
      const off = opts.offset ? opts.offset(i) : { dx: 0, dy: 0, sy: 1, a: 1 };
      if (off.a <= 0) return;
      ctx.save(); ctx.globalAlpha = off.a;
      const lx = pos[i] + widths[i] / 2;
      ctx.translate(lx + off.dx, y + off.dy); ctx.scale(1 / Math.sqrt(off.sy), off.sy);
      fn(c, -widths[i] / 2);
      ctx.restore();
    });
  };
  ctx.lineJoin = 'round';
  // объёмная тень
  drawPass((c, ox) => {
    ctx.fillStyle = opts.shade || T[8];
    for (let k = depth; k > 0; k -= Math.max(1, depth / 8)) ctx.fillText(c, ox + k, k);
  });
  drawPass((c, ox) => { ctx.lineWidth = size * 0.075; ctx.strokeStyle = INK; ctx.strokeText(c, ox, 0); });
  drawPass((c, ox) => { ctx.fillStyle = opts.fill || PAPER; ctx.fillText(c, ox, 0); });
  if (opts.inline) drawPass((c, ox) => { ctx.lineWidth = size * 0.012; ctx.strokeStyle = T[3]; ctx.strokeText(c, ox, 0); });
  ctx.restore();
}

function smallCaps(ctx, str, x, y, size, color, track = 0.18) {
  ctx.save();
  ctx.font = `${size}px ${FONT_SMALL}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${Math.round(size * track)}px`;
  ctx.fillStyle = color; ctx.fillText(str, x, y);
  ctx.restore();
}

function decoFrame(ctx, x, y, w, h, lw) {
  const cut = 34;
  const path = (o) => {
    ctx.beginPath();
    ctx.moveTo(x + cut - o, y - o); ctx.lineTo(x + w - cut + o, y - o); ctx.lineTo(x + w + o, y + cut - o);
    ctx.lineTo(x + w + o, y + h - cut + o); ctx.lineTo(x + w - cut + o, y + h + o); ctx.lineTo(x + cut - o, y + h + o);
    ctx.lineTo(x - o, y + h - cut + o); ctx.lineTo(x - o, y + cut - o); ctx.closePath();
  };
  path(0); ctx.fillStyle = 'rgba(23,20,15,0.8)'; ctx.fill();
  ctx.strokeStyle = PAPER; ctx.lineWidth = lw * 2.2; path(-10); ctx.stroke();
  ctx.lineWidth = lw; path(-22); ctx.stroke();
  for (const [px, py] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) {
    ctx.beginPath(); ctx.moveTo(px, py - 16); ctx.lineTo(px + 16, py); ctx.lineTo(px, py + 16); ctx.lineTo(px - 16, py); ctx.closePath();
    ctx.fillStyle = PAPER; ctx.fill();
  }
}
