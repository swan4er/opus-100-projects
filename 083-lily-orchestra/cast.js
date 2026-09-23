'use strict';
/* =========================================================================
   Оркестр на кувшинке — АКТЁРЫ
   Каждый музыкант — функция времени. Поза берётся из партитуры: замах
   перед нотой (упреждение), удар ровно в момент ноты, отдача после
   (захлёст), дрожание струны, покачивание цветка. Игра — из ключевых
   кадров режиссёра (film.js → ACTING).
   ========================================================================= */

/* ---------- Музыка → движение ------------------------------------------- */
const NO_NOTES = Object.assign([], { times: new Float64Array(0) });
const notesOf = (who) => SCORE.byWho[who] || NO_NOTES;
function near(who, t) {
  const a = notesOf(who), i = SCORE.lastIdx(a.times, t);
  return { prev: i >= 0 ? a[i] : null, next: a[i + 1] || null, i, a };
}
// Высота колотушки: 1 — покой, >1 — замах, 0 — удар. Удар точно в момент ноты.
function strikeH(t, prev, next, W = 0.2, up = 0.7) {
  let h = 1;
  if (prev) {
    const tp = t - prev.t;
    h -= Math.exp(-tp / 0.045);
    h += 0.3 * Math.sin(Math.min(1, tp / 0.32) * Math.PI) * Math.exp(-tp / 0.22);
  }
  if (next) {
    const tn = next.t - t, w = Math.min(W, prev ? (next.t - prev.t) * 0.62 : W);
    if (tn < w) {
      const u = 1 - tn / w;
      h += u < 0.6 ? up * EASE.io(u / 0.6) : up * (1 - EASE.in((u - 0.6) / 0.4)) - EASE.in((u - 0.6) / 0.4);
    }
  }
  return Math.max(0, h);
}
// Доля и такт в метрических частях
function beatAt(t) {
  const s = SCORE.segAt(t);
  if (!s) return null;
  const pos = s.pos(t), i = Math.floor(pos), ph = pos - i;
  return { s, pos, i, ph, inBar: ((i % s.meter) + s.meter) % s.meter, bar: Math.floor(i / s.meter) + 1, meter: s.meter };
}
// Насколько оркестр «качается» в такт (0 — замерли)
function grooveAmt(t) {
  const T = SCORE.T;
  if (t < T.A - 0.3 || (t > T.hit + 0.05 && t < T.C_ + 9.6) || (t > T.fin + 0.2 && t < T.L)) return 0;
  if (t >= T.L) return 0.45;
  return 1;
}
function groove(t, amt = 1) {
  const b = beatAt(t);
  if (!b) return { bob: 0, sway: 0, ph: 0, b: null };
  const g = grooveAmt(t) * amt;
  return { bob: g * Math.pow(Math.sin(Math.PI * b.ph), 2), sway: g * Math.sin(TAU * b.pos / (b.meter * 2)), ph: b.ph, b };
}
// Моргание: короткий треугольный импульс раз в несколько секунд
function blink(t, seed) {
  const per = 3.4 + hash(seed) * 1.6, k = Math.floor(t / per);
  let v = 0;
  for (let j = k - 1; j <= k + 1; j++) {
    const tb = j * per + hash(j * 7.3 + seed) * per * 0.6;
    v = Math.max(v, 1 - Math.abs(t - tb) / 0.075);
  }
  return clamp(v, 0, 1);
}
// Ключевые кадры игры из film.js
function act(who, key, t, def) {
  const A = (typeof ACTING !== 'undefined') && ACTING[who];
  return A && A[key] ? K(t, A[key]) : def;
}
const footY = (d) => d * 72;
const dScale = (d) => 1 + d * 0.07;

/* ---------- Общие детали лягушек ---------------------------------------- */
function eye(c, x, y, r, o) {
  const line = o.line;
  c.fillStyle = o.skin; circ(c, x, y, r * 1.22); c.fill();
  c.lineWidth = r * 0.13; c.strokeStyle = line; c.stroke();
  c.fillStyle = lit('#FFFCEF'); circ(c, x, y, r); c.fill();
  // тень под верхним веком
  c.fillStyle = lit('#E4DCC4'); ell(c, x, y + r * 0.35, r * 0.85, r * 0.55); c.globalAlpha = 0.35; c.fill(); c.globalAlpha = 1;
  const pr = r * 0.52 * (o.pupil || 1), px = x + clamp(o.gx || 0, -1, 1) * r * 0.36, py = y + clamp(o.gy || 0, -1, 1) * r * 0.36;
  c.fillStyle = '#1E1A17'; circ(c, px, py, pr); c.fill();
  c.fillStyle = '#FFFFFF'; circ(c, px - pr * 0.34, py - pr * 0.38, pr * 0.34); c.fill();
  circ(c, px + pr * 0.35, py + pr * 0.3, pr * 0.14); c.fill();
  if (o.wet > 0.01) { c.fillStyle = `rgba(190,230,255,${0.55 * o.wet})`; ell(c, x, y + r * 0.55, r * 0.8, r * 0.3); c.fill(); }
  const lid = clamp(o.lid || 0, 0, 1), sq = clamp(o.squint || 0, 0, 1);
  if (lid > 0.02 || sq > 0.02) {
    c.save(); circ(c, x, y, r * 1.02); c.clip();
    c.fillStyle = o.skin; c.strokeStyle = line; c.lineWidth = r * 0.15;
    if (lid > 0.02) {
      const ly = y - r + lid * r * 2.1, tl = (o.tilt || 0) * o.side * r * 0.55;
      c.beginPath(); c.moveTo(x - r * 1.3, y - r * 1.4); c.lineTo(x + r * 1.3, y - r * 1.4); c.lineTo(x + r * 1.3, ly + tl); c.lineTo(x - r * 1.3, ly - tl); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(x - r * 1.3, ly - tl); c.lineTo(x + r * 1.3, ly + tl); c.stroke();
    }
    if (sq > 0.02) {
      const ly = y + r - sq * r * 1.05;
      c.beginPath(); c.moveTo(x - r * 1.3, y + r * 1.4); c.lineTo(x + r * 1.3, y + r * 1.4); c.lineTo(x + r * 1.3, ly + r * 0.2); c.quadraticCurveTo(x, ly - r * 0.45 * sq, x - r * 1.3, ly + r * 0.2); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(x + r * 1.3, ly + r * 0.2); c.quadraticCurveTo(x, ly - r * 0.45 * sq, x - r * 1.3, ly + r * 0.2); c.stroke();
    }
    c.restore();
  }
  c.strokeStyle = line; c.lineWidth = r * 0.11; circ(c, x, y, r); c.stroke();
}
function mouth(c, x, y, w, smile, open, line, lw) {
  const x0 = x - w / 2, x1 = x + w / 2, cy = y + smile * w * 0.3;
  c.lineCap = 'round'; c.lineJoin = 'round';
  if (open > 0.04) {
    const oy = cy + open * w * 0.42;
    c.beginPath(); c.moveTo(x0, y); c.quadraticCurveTo(x, cy, x1, y); c.quadraticCurveTo(x + w * 0.1, oy + open * w * 0.12, x0, y); c.closePath();
    c.fillStyle = lit('#6E2B2E'); c.fill();
    c.save(); c.clip(); c.fillStyle = lit('#E27D82'); ell(c, x, oy + w * 0.02, w * 0.22, w * 0.1 + open * w * 0.06); c.fill(); c.restore();
    c.strokeStyle = line; c.lineWidth = lw; c.stroke();
  } else {
    c.beginPath(); c.moveTo(x0, y); c.quadraticCurveTo(x, cy, x1, y);
    c.strokeStyle = line; c.lineWidth = lw; c.stroke();
    c.beginPath(); c.moveTo(x0 - lw * 0.6, y - lw * 0.9); c.lineTo(x0 + lw * 0.3, y + lw * 0.3); c.moveTo(x1 + lw * 0.6, y - lw * 0.9); c.lineTo(x1 - lw * 0.3, y + lw * 0.3); c.stroke();
  }
}
function foot(c, x, y, s, dir, fill, line, lift = 0) {
  c.save(); c.translate(x, y); c.rotate(-lift * 0.45 * dir); c.scale(dir * s, s);
  c.fillStyle = fill; c.strokeStyle = line; c.lineWidth = 1.4;
  ell(c, 6, -2.2, 8, 3.2); c.fill(); c.stroke();
  for (const [tx, ty] of [[13, -4.2], [15.5, -1.6], [13.5, 0.9]]) { circ(c, tx, ty, 2.1); c.fill(); c.stroke(); }
  ell(c, 6, -2.2, 7, 2.3); c.fill();
  c.restore();
}
function hand(c, x, y, r, ang, fill, line, spread = 1) {
  c.fillStyle = fill; c.strokeStyle = line; c.lineWidth = r * 0.34;
  for (let k = -1.5; k <= 1.5; k++) { const a = ang + k * 0.42 * spread; circ(c, x + Math.cos(a) * r * 1.35, y + Math.sin(a) * r * 1.35, r * 0.46); c.fill(); c.stroke(); }
  circ(c, x, y, r); c.fill(); c.stroke();
  circ(c, x, y, r * 0.86); c.fill();
}
function bowtie(c, x, y, w, h, col, dark, dots) {
  c.save(); c.translate(x, y);
  c.fillStyle = col; c.strokeStyle = dark; c.lineWidth = Math.max(0.8, h * 0.12);
  c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(-w * 0.4, -h * 0.9, -w, -h * 0.75); c.quadraticCurveTo(-w * 1.1, 0, -w, h * 0.75); c.quadraticCurveTo(-w * 0.4, h * 0.9, 0, 0);
  c.moveTo(0, 0); c.quadraticCurveTo(w * 0.4, -h * 0.9, w, -h * 0.75); c.quadraticCurveTo(w * 1.1, 0, w, h * 0.75); c.quadraticCurveTo(w * 0.4, h * 0.9, 0, 0);
  c.fill(); c.stroke();
  if (dots) { c.fillStyle = dots; for (const [dx, dy] of [[-0.62, -0.3], [-0.5, 0.35], [0.55, -0.32], [0.62, 0.3], [-0.85, 0.02], [0.86, 0]]) { circ(c, dx * w, dy * h, h * 0.13); c.fill(); } }
  c.fillStyle = dark; ell(c, 0, 0, w * 0.22, h * 0.42); c.fill();
  c.restore();
}
function shadow(c, x, y, rx, ry, a = 0.22) { c.fillStyle = `rgba(20,45,25,${a})`; ell(c, x, y, rx, ry); c.fill(); }
// Контровой свет: дуга по правому краю (солнце садится справа, за сценой)
function rimArc(c, x, y, rx, ry, a0, a1, w, a = 0.85) {
  if (LIGHT.rimA < 0.02) return;
  c.strokeStyle = rimC(a); c.lineWidth = w; c.lineCap = 'round';
  c.beginPath(); c.ellipse(x, y, rx, ry, 0, a0, a1); c.stroke();
}

/* ======================================================================
   СЦЕНА — большая кувшинка
   ====================================================================== */
const PAD_RX = 560, PAD_RY = 100;
function padBob(t) {
  const { prev } = near('rhino', t);
  let y = Math.sin(t * 1.1) * 1.3;
  if (prev) { const tp = t - prev.t; y += 3.4 * prev.v * Math.exp(-tp / 0.24) * Math.cos(TAU * 1.5 * tp); }
  return y;
}
function drawPadRipples(c, t) {
  const a = notesOf('rhino'), i = SCORE.lastIdx(a.times, t);
  c.lineWidth = 2.2;
  for (let j = i; j >= 0 && j > i - 6; j--) {
    const tau = t - a[j].t;
    if (tau > 2.6) break;
    const al = 0.32 * a[j].v * Math.exp(-tau / 0.8);
    c.strokeStyle = `rgba(255,236,200,${al})`;
    ell(c, 0, 8, PAD_RX + 24 + tau * 170, PAD_RY + 12 + tau * 30); c.stroke();
  }
  // тихие круги от кувшинки даже без музыки
  for (let k = 0; k < 2; k++) {
    const tau = ((t * 0.35 + k * 0.5) % 1) * 3;
    c.strokeStyle = `rgba(255,236,200,${0.12 * (1 - tau / 3)})`;
    ell(c, 0, 8, PAD_RX + 20 + tau * 90, PAD_RY + 10 + tau * 16); c.stroke();
  }
}
function padPath(c, dy, rx, ry) {
  // лист кувшинки с узким вырезом на дальнем правом краю
  const na = -Math.PI / 2 + 0.72, w = 0.075;
  c.beginPath(); c.moveTo(0, dy - 2);
  c.ellipse(0, dy, rx, ry, 0, na + w, na + TAU - w);
  c.closePath();
}
function drawStagePad(c, t) {
  const y0 = padBob(t) * 0.5;
  c.save(); c.translate(0, y0);
  // тень-отражение на воде
  c.fillStyle = 'rgba(12,38,34,0.32)'; ell(c, 10, 24, PAD_RX + 18, PAD_RY + 18); c.fill();
  // толщина листа
  padPath(c, 9, PAD_RX, PAD_RY); c.fillStyle = lit('#2F5B2B'); c.fill();
  padPath(c, 5, PAD_RX - 2, PAD_RY - 1); c.fillStyle = lit('#3E7334'); c.fill();
  // верх листа
  padPath(c, 0, PAD_RX, PAD_RY);
  const g = c.createLinearGradient(0, -PAD_RY, 0, PAD_RY);
  g.addColorStop(0, lit('#B7D877')); g.addColorStop(0.35, lit('#8CC052')); g.addColorStop(0.75, lit('#62A13F')); g.addColorStop(1, lit('#4E8A36'));
  c.fillStyle = g; c.fill();
  c.save(); c.clip();
  // прожилки
  const top = -Math.PI / 2;
  c.strokeStyle = lit('#C9E58F', 0.5); c.lineWidth = 2.2;
  c.beginPath();
  for (let k = 0; k < 26; k++) {
    const a = top + TAU * (k + 0.5) / 26;
    const ex = Math.cos(a) * PAD_RX, ey = Math.sin(a) * PAD_RY;
    c.moveTo(0, -2); c.quadraticCurveTo(ex * 0.5 + Math.sin(a) * 14, ey * 0.5 - 2, ex * 0.97, ey * 0.97);
  }
  c.stroke();
  c.strokeStyle = lit('#3F7A34', 0.3); c.lineWidth = 1.2;
  c.beginPath();
  for (let k = 0; k < 26; k++) {
    const a = top + TAU * (k + 0.5) / 26;
    for (const f of [0.45, 0.7]) {
      const x1 = Math.cos(a) * PAD_RX * f, y1 = Math.sin(a) * PAD_RY * f, a2 = a + 0.12;
      c.moveTo(x1, y1); c.lineTo(Math.cos(a2) * PAD_RX * (f + 0.12), Math.sin(a2) * PAD_RY * (f + 0.12));
    }
  }
  c.stroke();
  // блик заката на дальнем краю, тёплый отсвет воды на ближнем
  const hg = c.createRadialGradient(240, -70, 10, 240, -70, 380);
  hg.addColorStop(0, rimC(0.38)); hg.addColorStop(1, rimC(0));
  c.fillStyle = hg; c.fillRect(-PAD_RX, -PAD_RY, PAD_RX * 2, PAD_RY * 2);
  c.restore();
  // загнутый край
  c.strokeStyle = lit('#D2EA98', 0.9); c.lineWidth = 3.2;
  c.beginPath(); c.ellipse(0, 0, PAD_RX - 3, PAD_RY - 2, 0, Math.PI + 0.25, -Math.PI / 2 + 0.62); c.stroke();
  c.beginPath(); c.ellipse(0, 0, PAD_RX - 3, PAD_RY - 2, 0, -Math.PI / 2 + 0.84, TAU - 0.2); c.stroke();
  c.strokeStyle = lit('#2E5A2A'); c.lineWidth = 2;
  c.beginPath(); c.ellipse(0, 0, PAD_RX, PAD_RY, 0, 0.05, Math.PI - 0.05); c.stroke();
  c.restore();
  return y0;
}

/* ======================================================================
   КОНТРАБАСИСТ — высокая лягушка с контрабасом
   ====================================================================== */
const BASSF = { x: 40, d: -0.42, s: 1.85 };
const bassU = (m) => clamp(136 - (m - 40) * 2.7, 100, 136);  // место левой руки на грифе
const bassStr = (m) => (m < 45 ? 0 : m < 50 ? 1 : m < 55 ? 2 : 3);
function poseBass(t) {
  const { prev, next } = near('bass', t);
  const P = {};
  let u = next ? bassU(next.m) : prev ? bassU(prev.m) : 120;
  if (prev && next) {
    const gap = next.t - prev.t, dur = Math.min(0.1, gap * 0.4), st = next.t - Math.min(0.15, gap * 0.55);
    u = lerp(bassU(prev.m), bassU(next.m), EASE.io(clamp((t - st) / dur, 0, 1)));
  }
  P.u = u;
  const gap = prev && next ? next.t - prev.t : 1;
  const W = Math.min(0.14, gap * 0.55);
  P.pull = next ? EASE.io(clamp(1 - (next.t - t) / W, 0, 1)) : 0;
  P.flick = prev ? decay(t - prev.t, 0.1) : 0;
  P.vib = prev ? decay(t - prev.t, 0.32) * prev.v * (prev.dur > 1 && t - prev.t > prev.dur ? decay(t - prev.t - prev.dur, 0.04) : 1) : 0;
  P.str = prev && (!next || next.t - t > W) ? bassStr(prev.m) : next ? bassStr(next.m) : 1;
  P.vibStr = prev ? bassStr(prev.m) : 1;
  P.big = prev && prev.v > 0.95 ? decay(t - prev.t, 0.5) : 0;
  const G = groove(t);
  P.bob = G.bob; P.sway = G.sway;
  // постукивание ногой: носок поднимается во второй половине доли и шлёпает на долю
  const ph = G.ph, ga = grooveAmt(t);
  P.tap = ga * (ph < 0.62 ? EASE.out(ph / 0.62) * 0.8 : 0.8 * (1 - EASE.in((ph - 0.62) / 0.38)));
  P.lid = act('bass', 'lid', t, 0.42 * ga) + blink(t, 3) * 0.9;
  P.gx = act('bass', 'gx', t, 0.55); P.gy = act('bass', 'gy', t, 0.15);
  P.turn = act('bass', 'turn', t, 0);
  P.smile = act('bass', 'smile', t, 0.5);
  P.open = act('bass', 'open', t, 0);
  P.pupil = act('bass', 'pupil', t, 1);
  return P;
}
function drawDoubleBass(c, P) {
  // местные координаты: шпиль внизу, ось вверх (−y)
  c.save();
  c.translate(32, 2); c.rotate(-0.1 - P.big * 0.05);
  // шпиль
  c.strokeStyle = lit('#9A9EA3'); c.lineWidth = 2; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -10); c.stroke();
  // корпус
  const R = [[0, -9], [20, -11], [32, -23], [35, -38], [31, -52], [22, -60], [21, -66], [27, -77], [28, -87], [22, -97], [10, -103], [4, -106]];
  const body = new Path2D();
  const full = R.concat(R.slice().reverse().map(([x, y]) => [-x, y]));
  body.moveTo(full[0][0], full[0][1]);
  for (let i = 1; i < full.length; i++) {
    const p0 = full[Math.max(0, i - 2)], p1 = full[i - 1], p2 = full[i], p3 = full[Math.min(full.length - 1, i + 1)];
    body.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
  }
  body.closePath();
  const g = c.createRadialGradient(-6, -46, 4, 0, -50, 52);
  g.addColorStop(0, lit('#F0A34E')); g.addColorStop(0.55, lit('#C8702C')); g.addColorStop(1, lit('#8A4418'));
  c.fillStyle = g; c.fill(body);
  c.strokeStyle = lit('#4A2410'); c.lineWidth = 1.8; c.stroke(body);
  // ус (инкрустация)
  c.save(); c.translate(0, -52); c.scale(0.9, 0.93); c.translate(0, 52);
  c.strokeStyle = lit('#5A2C12', 0.6); c.lineWidth = 0.8; c.stroke(body); c.restore();
  // блик лака
  c.strokeStyle = rimC(0.75); c.lineWidth = 2.4; c.lineCap = 'round';
  c.beginPath(); c.moveTo(29, -30); c.quadraticCurveTo(33, -40, 29, -50); c.moveTo(24, -80); c.quadraticCurveTo(26, -88, 21, -95); c.stroke();
  c.strokeStyle = 'rgba(255,240,210,0.35)'; c.lineWidth = 3;
  c.beginPath(); c.moveTo(-26, -30); c.quadraticCurveTo(-29, -40, -25, -49); c.stroke();
  // эфы
  c.strokeStyle = lit('#2A1308'); c.lineWidth = 1.6;
  for (const s of [-1, 1]) {
    c.beginPath(); c.moveTo(s * 12, -42); c.bezierCurveTo(s * 16, -50, s * 9, -58, s * 13, -66); c.stroke();
    c.fillStyle = lit('#2A1308'); circ(c, s * 12, -42, 1.4); c.fill(); circ(c, s * 13, -66, 1.4); c.fill();
  }
  // подгрифник
  c.fillStyle = lit('#231914'); c.beginPath(); c.moveTo(-3, -12); c.lineTo(3, -12); c.lineTo(7, -34); c.lineTo(-7, -34); c.closePath(); c.fill();
  // подставка
  c.fillStyle = lit('#EDCD92'); c.beginPath(); c.moveTo(-11, -42); c.lineTo(11, -42); c.lineTo(9, -47); c.lineTo(-9, -47); c.closePath(); c.fill();
  c.strokeStyle = lit('#9A7440'); c.lineWidth = 0.8; c.stroke();
  // гриф и шейка
  c.fillStyle = lit('#8A4A1E'); c.beginPath(); c.moveTo(-5, -100); c.lineTo(5, -100); c.lineTo(4.4, -166); c.lineTo(-4.4, -166); c.closePath(); c.fill();
  c.fillStyle = lit('#221C19'); c.beginPath(); c.moveTo(-6, -56); c.lineTo(6, -56); c.lineTo(4, -166); c.lineTo(-4, -166); c.closePath(); c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = 1; c.beginPath(); c.moveTo(3.5, -60); c.lineTo(2.4, -164); c.stroke();
  // колковая коробка и завиток
  c.fillStyle = lit('#9A5222'); c.strokeStyle = lit('#4A2410'); c.lineWidth = 1.2;
  c.beginPath(); c.moveTo(-4.5, -166); c.lineTo(4.5, -166); c.lineTo(5, -184); c.lineTo(-5, -184); c.closePath(); c.fill(); c.stroke();
  circ(c, 0, -189, 6.5); c.fill(); c.stroke();
  c.beginPath(); c.arc(0.6, -189, 3.4, 0.5, 5.2); c.stroke();
  // колки
  c.fillStyle = lit('#D8C9A0');
  for (const [px, py] of [[-8, -170], [8, -174], [-8, -178], [8, -182]]) { ell(c, px, py, 3.2, 2); c.fill(); }
  // струны
  const u = P.u;
  for (let s = 0; s < 4; s++) {
    const xb = -4.5 + s * 3, xt = -2.4 + s * 1.6, xn = -2.2 + s * 1.45;
    // точка прижатия (для струны, на которой играют) — где левая рука
    let stopY = -166;
    if (s === P.vibStr && P.vib > 0.02) stopY = -u;
    c.strokeStyle = lit('#EDE4CF'); c.lineWidth = 0.9;
    c.beginPath(); c.moveTo(xt * 0.9, -33); c.lineTo(xb, -45);
    // оттяжка пальцем перед щипком
    if (s === P.str && P.pull > 0.01) c.lineTo(xb - P.pull * 5.5, -62);
    c.lineTo(xn, -166); c.stroke();
    // дрожание — размытый «веретеном» след
    if (s === P.vibStr && P.vib > 0.02) {
      const A = 3.2 * P.vib, y1 = -45, y2 = stopY, xm = lerp(xb, xn, 0.3);
      c.fillStyle = `rgba(250,244,225,${0.35 * Math.min(1, P.vib * 1.6)})`;
      c.beginPath(); c.moveTo(xb, y1); c.quadraticCurveTo(xm - A * 2, (y1 + y2) / 2, lerp(xb, xn, 0.9), y2);
      c.quadraticCurveTo(xm + A * 2, (y1 + y2) / 2, xb, y1); c.fill();
    }
  }
  c.restore();
}
function bassPoint(u, x) { // точка на оси контрабаса в координатах лягушки
  const a = -0.1, cx = 32, cy = 2;
  return [cx + x * Math.cos(a) + u * Math.sin(a) * 1, cy + x * Math.sin(a) - u * Math.cos(a)];
}
function drawBassFrog(c, t) {
  const P = poseBass(t);
  const skin = lit('#6DAA45'), dark = lit('#4C8733'), line = lit('#2B4A22'), belly = lit('#E9E4A8');
  c.save();
  shadow(c, 8, 0, 58, 9);
  const by = -P.bob * 3.5;
  // ноги
  const lk = [-34, -18 + by * 0.4], rk = [30, -18 + by * 0.4];
  limb(c, [[-13, -36 + by], lk, [-24, -2]], 11, skin, line, 1.6);
  limb(c, [[12, -36 + by], rk, [16, -2 - P.tap * 3]], 11, skin, line, 1.6);
  foot(c, -24, 0, 1.25, -1, skin, line);
  foot(c, 16, 0, 1.25, 1, skin, line, P.tap);
  // тело
  c.save(); c.translate(0, by); c.rotate(P.sway * 0.025);
  c.beginPath(); c.moveTo(0, -26);
  c.bezierCurveTo(22, -26, 34, -40, 32, -60); c.bezierCurveTo(30, -80, 24, -94, 0, -98);
  c.bezierCurveTo(-24, -94, -30, -80, -32, -60); c.bezierCurveTo(-34, -40, -22, -26, 0, -26); c.closePath();
  const g = c.createLinearGradient(-30, -90, 30, -30); g.addColorStop(0, lit('#7FBA52')); g.addColorStop(1, dark);
  c.fillStyle = g; c.fill(); c.strokeStyle = line; c.lineWidth = 1.8; c.stroke();
  c.fillStyle = belly; ell(c, -1, -54, 21, 23); c.fill();
  c.strokeStyle = lit('#BDB574', 0.6); c.lineWidth = 1; c.beginPath();
  for (let k = 0; k < 4; k++) { c.moveTo(-12, -42 - k * 7); c.quadraticCurveTo(-1, -40 - k * 7, 10, -42 - k * 7); } c.stroke();
  c.fillStyle = dark; for (const [sx, sy, r] of [[-26, -70, 4.5], [27, -62, 3.6], [-22, -46, 3]]) { circ(c, sx, sy, r); c.fill(); }
  rimArc(c, 0, -62, 32, 36, -1.1, 0.5, 2.6);
  c.restore();
  // голова наклонена прочь от грифа
  c.save(); c.translate(0, -84 + by); c.rotate(-0.15 + P.sway * 0.05); c.translate(0, 84);
  const hx = P.turn * 6;
  c.fillStyle = skin; ell(c, 0, -100, 34, 21); c.fill(); c.strokeStyle = line; c.lineWidth = 1.8; c.stroke();
  c.fillStyle = belly; ell(c, hx, -87, 20, 6); c.fill();
  c.fillStyle = dark; for (const [sx, sy, r] of [[-20, -106, 3.4], [15, -109, 2.6], [-6, -113, 2]]) { circ(c, sx, sy, r); c.fill(); }
  rimArc(c, 0, -100, 34, 21, -1.3, 0.2, 2.4);
  c.fillStyle = 'rgba(230,120,110,0.35)'; ell(c, -23 + hx, -96, 6, 3.4); c.fill(); ell(c, 23 + hx, -96, 6, 3.4); c.fill();
  mouth(c, hx, -95, 38, P.smile, P.open, line, 1.8);
  c.fillStyle = line; circ(c, -4 + hx, -104, 1.1); c.fill(); circ(c, 4 + hx, -104, 1.1); c.fill();
  const eo = { skin, line, gx: P.gx, gy: P.gy, lid: P.lid, pupil: P.pupil };
  eye(c, -17 + hx * 1.2, -119, 10, Object.assign({ side: -1 }, eo));
  eye(c, 17 + hx * 1.2, -119, 10, Object.assign({ side: 1 }, eo));
  c.restore();
  bowtie(c, 0, -80 + by, 9, 6, lit('#C8392D'), lit('#7E1D16'));
  // левое плечо (за грифом): рука на грифе
  const sL = [22, -80 + by], sR = [-24, -78 + by];
  const [nx, ny] = bassPoint(P.u, 6);
  // контрабас
  drawDoubleBass(c, P);
  const aL = ik(sL[0], sL[1], nx, ny, 28, 27, 1);
  limb(c, [sL, [aL.ex, aL.ey], [aL.hx, aL.hy]], 8.5, skin, line, 1.5);
  hand(c, aL.hx - 1, aL.hy, 4.6, Math.PI + 0.3, skin, line, 0.8);
  // правая рука щиплет струну у конца грифа
  const sx0 = -4.5 + P.str * 3;
  let [px, py] = bassPoint(64, sx0 * 0.8 + 4);
  px -= P.pull * 6; py += P.pull * 1;
  px -= P.flick * 13; py -= P.flick * 8;
  const aR = ik(sR[0], sR[1], px, py, 28, 28, -1);
  limb(c, [sR, [aR.ex, aR.ey], [aR.hx, aR.hy]], 8.5, skin, line, 1.5);
  hand(c, aR.hx, aR.hy, 4.6, -0.6 - P.flick * 0.8, skin, line, 0.9);
  c.restore();
}

/* ======================================================================
   ФАГОТИСТ — пухлая лягушка на мухоморе
   ====================================================================== */
const BSNF = { x: 262, d: -0.16, s: 1.5 };
const BSN_A = 0.2, BSN_B = [24, -40];
const bsnPt = (s, off = 0) => [BSN_B[0] + Math.sin(BSN_A) * s + Math.cos(BSN_A) * off, BSN_B[1] - Math.cos(BSN_A) * s + Math.sin(BSN_A) * off];
// аппликатура: какие пальцы прижаты (6 отверстий) — у каждой ноты своя
const FING = [0b111111, 0b111110, 0b111100, 0b111000, 0b110000, 0b100000, 0b011111, 0b001111, 0b000111, 0b000011, 0b000001, 0b101010];
function poseBsn(t) {
  const { prev, next } = near('bsn', t);
  const P = {};
  const on = prev && t < prev.t + prev.dur + 0.04;
  P.on = on ? 1 : 0;
  const tp = prev ? t - prev.t : 9;
  // щёки: надуваются, на каждой ноте — «толчок»
  let cheek = 0;
  if (prev) {
    const rel = prev.t + prev.dur;
    cheek = t < rel ? 0.75 + 0.25 * prev.v + 0.35 * Math.exp(-tp / 0.07) : Math.max(0, 1 - (t - rel) / 0.12);
  }
  if (next && next.t - t < 0.35 && (!prev || t > prev.t + prev.dur)) cheek = Math.max(cheek, 0.35 * (1 - (next.t - t) / 0.35)); // вдох перед фразой
  P.cheek = clamp(cheek, 0, 1.3);
  P.breath = next && (!prev || t > prev.t + prev.dur) && next.t - t < 0.5 ? Math.sin(Math.PI * clamp(1 - (next.t - t) / 0.5, 0, 1)) : 0;
  P.fing = prev && on ? FING[prev.m % 12] : next ? FING[next.m % 12] : 0b111000;
  P.fingT = prev && on ? clamp(tp / 0.05, 0, 1) : 1;
  P.high = prev ? clamp((prev.m - 52) / 16, 0, 1) : 0.3;
  P.big = prev && prev.v > 0.88 && on ? 1 : 0;
  const G = groove(t);
  P.bob = G.bob; P.sway = G.sway;
  P.lean = on ? 0.04 + 0.05 * Math.sin(t * 1.3) : 0;
  P.lid = act('bsn', 'lid', t, on ? 0.35 - P.high * 0.35 : 0.15) + blink(t, 11) * 0.9;
  P.gx = act('bsn', 'gx', t, 0.5); P.gy = act('bsn', 'gy', t, 0.1);
  P.smile = act('bsn', 'smile', t, 0.45);
  P.pupil = act('bsn', 'pupil', t, 1);
  P.puff = act('bsn', 'puff', t, 0);
  return P;
}
function drawMushroom(c, x, y, s) {
  c.save(); c.translate(x, y); c.scale(s, s);
  c.fillStyle = lit('#F1E4C6'); c.strokeStyle = lit('#9D8A68'); c.lineWidth = 1.4;
  c.beginPath(); c.moveTo(-9, 0); c.quadraticCurveTo(-7, -18, -6, -30); c.lineTo(6, -30); c.quadraticCurveTo(7, -18, 9, 0); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = lit('#E7D6B0'); ell(c, 0, -22, 10, 3); c.fill();
  c.restore();
}
function drawBassoon(c, P) {
  const L = 172, w0 = 5.5;
  c.save(); c.translate(BSN_B[0], BSN_B[1]); c.rotate(BSN_A + P.lean * 0.4 + P.big * 0.06);
  // «сапог» и длинное колено
  c.fillStyle = lit('#7E3522'); c.strokeStyle = lit('#3E160C'); c.lineWidth = 1.4;
  c.beginPath(); c.roundRect(-w0, -L, w0 * 2, L + 4, 4); c.fill(); c.stroke();
  c.fillStyle = lit('#6E2C1C'); c.beginPath(); c.roundRect(w0 - 1.5, -L * 0.62, 6, L * 0.62, 3); c.fill(); c.stroke();
  // блик
  c.strokeStyle = rimC(0.6); c.lineWidth = 1.6; c.beginPath(); c.moveTo(w0 - 1, -L + 8); c.lineTo(w0 - 1, -6); c.stroke();
  c.strokeStyle = 'rgba(255,220,190,0.28)'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(-w0 + 1.6, -L + 8); c.lineTo(-w0 + 1.6, -6); c.stroke();
  // серебряные кольца
  c.fillStyle = lit('#D9DCDF');
  for (const yy of [-4, -60, -104, -L + 16]) c.fillRect(-w0 - 0.6, yy - 1.6, w0 * 2 + 1.2, 3.2);
  // раструб
  c.fillStyle = lit('#8C3C27'); c.beginPath(); c.moveTo(-w0 - 1, -L); c.lineTo(-w0 - 2.5, -L - 12); c.lineTo(w0 + 2.5, -L - 12); c.lineTo(w0 + 1, -L); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = lit('#F2EBDD'); c.fillRect(-w0 - 2.5, -L - 13.5, w0 * 2 + 5, 3);
  // отверстия
  c.fillStyle = lit('#2A0F08');
  for (let k = 0; k < 6; k++) { const yy = k < 3 ? -36 - k * 9 : -92 - (k - 3) * 9; circ(c, -1, yy, 1.5); c.fill(); }
  c.restore();
  // эс (бокал) — изогнутая трубочка ко рту
  const [bx, by] = bsnPt(106, -w0);
  c.strokeStyle = lit('#C7CBD0'); c.lineWidth = 2.3; c.lineCap = 'round';
  c.beginPath(); c.moveTo(bx, by); c.bezierCurveTo(bx - 12, by - 6, 22, -116, 9, -99); c.stroke();
  c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 0.8; c.stroke();
  c.fillStyle = lit('#D9B77A'); ell(c, 8, -97.5, 2, 3.2, 0.2); c.fill();
}
function drawBsnFrog(c, t) {
  const P = poseBsn(t);
  const skin = lit('#8DBB48'), dark = lit('#6A922F'), line = lit('#3A5222'), belly = lit('#EDE7AE');
  c.save();
  shadow(c, 0, 0, 44, 8);
  // мухомор-табурет
  drawMushroom(c, 0, 0, 1.2);
  c.fillStyle = lit('#D23B2B'); c.strokeStyle = lit('#7C1C14'); c.lineWidth = 1.6;
  c.beginPath(); c.moveTo(-38, -34); c.quadraticCurveTo(-34, -52, 0, -54); c.quadraticCurveTo(34, -52, 38, -34); c.quadraticCurveTo(0, -30, -38, -34); c.fill(); c.stroke();
  c.fillStyle = lit('#FFF6E6'); for (const [dx, dy, r] of [[-24, -42, 3.2], [-8, -48, 2.6], [12, -46, 3.4], [28, -40, 2.4], [2, -39, 2]]) { ell(c, dx, dy, r, r * 0.7); c.fill(); }
  const by = -P.bob * 2.5 - P.breath * 2;
  // ноги свисают со шляпки
  limb(c, [[-20, -52 + by], [-36, -44], [-34, -26]], 11, skin, line, 1.5);
  limb(c, [[20, -52 + by], [36, -44], [34, -26]], 11, skin, line, 1.5);
  foot(c, -34, -22, 1.1, -1, skin, line);
  foot(c, 34, -22, 1.1, 1, skin, line);
  c.save(); c.translate(0, by); c.rotate(-P.lean * 0.3);
  // тело
  c.beginPath(); c.moveTo(0, -46);
  c.bezierCurveTo(30, -46, 40, -62, 38, -80); c.bezierCurveTo(36, -98, 24, -106, 0, -108);
  c.bezierCurveTo(-24, -106, -36, -98, -38, -80); c.bezierCurveTo(-40, -62, -30, -46, 0, -46); c.closePath();
  const g = c.createLinearGradient(-30, -104, 30, -48); g.addColorStop(0, lit('#A0CB5A')); g.addColorStop(1, dark);
  c.fillStyle = g; c.fill(); c.strokeStyle = line; c.lineWidth = 1.8; c.stroke();
  c.fillStyle = belly; ell(c, 0, -70, 26, 22 + P.breath * 2); c.fill();
  c.fillStyle = lit('#7A5A2A', 0.55); for (const [sx, sy, r] of [[-30, -84, 4], [31, -74, 3.4], [-26, -60, 2.6]]) { circ(c, sx, sy, r); c.fill(); }
  rimArc(c, 0, -78, 38, 30, -1.2, 0.5, 2.6);
  // голова
  c.fillStyle = skin; ell(c, 0, -106, 38, 22); c.fill(); c.strokeStyle = line; c.stroke();
  c.fillStyle = belly; ell(c, 0, -92, 22, 6); c.fill();
  c.fillStyle = lit('#7A5A2A', 0.5); for (const [sx, sy, r] of [[-22, -114, 3], [18, -116, 2.4], [-2, -120, 1.8]]) { circ(c, sx, sy, r); c.fill(); }
  rimArc(c, 0, -106, 38, 22, -1.3, 0.2, 2.4);
  // щёки-шарики
  const ch = P.cheek * 12 + P.puff * 4;
  if (ch > 0.5) {
    for (const s of [-1, 1]) {
      c.fillStyle = lit('#A8D063'); ell(c, s * 25, -99, ch * 1.05, ch * 0.92); c.fill(); c.strokeStyle = line; c.lineWidth = 1.4; c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.35)'; ell(c, s * 25 - 2, -102, ch * 0.4, ch * 0.3); c.fill();
    }
  }
  c.fillStyle = 'rgba(230,120,110,0.35)'; ell(c, -26, -100, 6, 3.4); c.fill(); ell(c, 26, -100, 6, 3.4); c.fill();
  if (P.on || P.cheek > 0.2) { c.fillStyle = lit('#6E2B2E'); ell(c, 8, -98, 3.6, 3); c.fill(); c.strokeStyle = line; c.lineWidth = 1.4; c.stroke(); }
  else mouth(c, 0, -100, 34, P.smile, 0, line, 1.8);
  c.fillStyle = line; circ(c, -4, -110, 1.1); c.fill(); circ(c, 4, -110, 1.1); c.fill();
  const eo = { skin, line, gx: P.gx, gy: P.gy, lid: P.lid, pupil: P.pupil, tilt: -P.high * 0.4 };
  eye(c, -19, -125, 10.5, Object.assign({ side: -1 }, eo));
  eye(c, 19, -125, 10.5, Object.assign({ side: 1 }, eo));
  bowtie(c, 0, -86, 10, 6.5, lit('#3F6FB5'), lit('#1F3A66'), lit('#F4EEDC'));
  c.restore();
  // фагот
  drawBassoon(c, P);
  // руки на трубке, пальцы по аппликатуре
  const shL = [27, -88 + by], shR = [-27, -86 + by];
  const [hx1, hy1] = bsnPt(100, -7), [hx2, hy2] = bsnPt(46, -7);
  const a1 = ik(shL[0], shL[1], hx1, hy1, 27, 26, 1);
  limb(c, [shL, [a1.ex, a1.ey], [a1.hx, a1.hy]], 8.5, skin, line, 1.5);
  const a2 = ik(shR[0], shR[1], hx2, hy2, 32, 30, -1);
  limb(c, [shR, [a2.ex, a2.ey], [a2.hx, a2.hy]], 8.5, skin, line, 1.5);
  for (const [hx, hy, base] of [[a1.hx, a1.hy, 3], [a2.hx, a2.hy, 0]]) {
    c.fillStyle = skin; c.strokeStyle = line; c.lineWidth = 1.3;
    circ(c, hx, hy, 4.4); c.fill(); c.stroke();
    for (let k = 0; k < 3; k++) {
      const down = (P.fing >> (base + k)) & 1, lift = down ? 0 : 2.8 * P.fingT;
      const [fx, fy] = bsnPt(base ? 100 - 9 + k * 9 : 46 - 9 + k * 9, 3.5 + lift);
      circ(c, fx, fy, 2.1); c.fill(); c.stroke();
    }
  }
  c.restore();
}

/* ======================================================================
   ДИРИЖЁР — старая жаба во фраке, в очках
   ====================================================================== */
const COND = { x: 452, d: 0.42, s: 1.6 };
// Схемы дирижирования: точки ударов кисти (кисть «падает» в точку и отскакивает)
const PAT4 = [[-44, -60], [-58, -70], [-24, -72], [-40, -96]];
const PAT2 = [[-44, -60], [-34, -92]];
function condPattern(t) {
  const b = beatAt(t);
  if (!b) return null;
  const pat = b.meter === 4 ? PAT4 : PAT2;
  const i = b.inBar, j = (i + 1) % b.meter;
  const A = pat[i], B = pat[j];
  const size = b.s.id === 'L' ? 0.55 : b.s.id === 'C' ? 0.75 : 1;
  // быстро из точки, медленно на вершине отскока, ускорение к следующей точке
  const u = b.ph + (0.8 / TAU) * Math.sin(TAU * b.ph);
  const mx = (A[0] + B[0]) / 2, my = Math.min(A[1], B[1]) - 26 * size;
  const x = (1 - u) * (1 - u) * A[0] + 2 * (1 - u) * u * mx + u * u * B[0];
  const y = (1 - u) * (1 - u) * A[1] + 2 * (1 - u) * u * my + u * u * B[1];
  const cx = -40, cy = -76;
  return { x: cx + (x - cx) * size, y: cy + (y - cy) * size, ph: b.ph };
}
function poseCond(t) {
  const P = {};
  const pat = condPattern(t);
  const T = SCORE.T;
  // метрический режим — по схеме; свободный — по ключам ACTING
  const free = act('cond', 'free', t, 0);
  const kx = act('cond', 'rhx', t, -40), ky = act('cond', 'rhy', t, -70);
  const w = pat ? clamp(1 - free, 0, 1) : 0;
  P.rh = pat ? [lerp(kx, pat.x, w), lerp(ky, pat.y, w)] : [kx, ky];
  P.lh = [act('cond', 'lhx', t, -30), act('cond', 'lhy', t, -64)];
  // левая рука подсказывает вступления: показывает на того, кто вступает
  P.baton = act('cond', 'bat', t, -2.5);
  P.tremble = act('cond', 'trem', t, 0);
  if (P.tremble > 0) { P.rh[0] += Math.sin(t * 61) * P.tremble * 1.2; P.rh[1] += Math.sin(t * 47) * P.tremble * 1.2; }
  P.turn = act('cond', 'turn', t, -0.55);
  P.gx = act('cond', 'gx', t, -0.7); P.gy = act('cond', 'gy', t, 0.1);
  P.lid = act('cond', 'lid', t, 0.3) + blink(t, 23) * 0.8;
  P.brow = act('cond', 'brow', t, 0);
  P.smile = act('cond', 'smile', t, 0.15);
  P.open = act('cond', 'open', t, 0);
  P.specs = act('cond', 'specs', t, 0);
  P.lean = act('cond', 'lean', t, 0);
  P.bob = pat ? groove(t, 0.6).bob : 0;
  P.nod = act('cond', 'nod', t, 0);
  void T;
  return P;
}
function drawCondStand(c) {
  c.strokeStyle = lit('#6B4A2A'); c.lineWidth = 3; c.lineCap = 'round';
  c.beginPath(); c.moveTo(-72, 0); c.lineTo(-68, -58); c.moveTo(-68, -58); c.lineTo(-76, -64); c.moveTo(-68, -58); c.lineTo(-58, -63); c.stroke();
  c.save(); c.translate(-67, -66); c.rotate(-0.25);
  c.fillStyle = lit('#9CC45E'); c.strokeStyle = lit('#557A2E'); c.lineWidth = 1;
  c.beginPath(); c.ellipse(0, 0, 14, 9, 0, 0, TAU); c.fill(); c.stroke();
  c.strokeStyle = lit('#3D5A22', 0.7); c.lineWidth = 0.6;
  for (let k = -2; k <= 2; k++) { c.beginPath(); c.moveTo(-10, k * 2.4); c.lineTo(10, k * 2.4); c.stroke(); }
  c.restore();
}
function drawCond(c, t) {
  const P = poseCond(t);
  const skin = lit('#9A8650'), wart = lit('#7A6A3C'), line = lit('#4A3E22'), belly = lit('#E4D6A6');
  const coat = lit('#2E2B35'), coatHi = lit('#4A4656'), shirt = lit('#F6F0DE');
  c.save();
  // камень-подиум
  shadow(c, 0, 2, 44, 9);
  c.fillStyle = lit('#8E877B'); ell(c, 0, -4, 38, 11); c.fill();
  c.fillStyle = lit('#B1AA9C'); ell(c, 0, -9, 34, 8); c.fill();
  c.strokeStyle = rimC(0.5); c.lineWidth = 1.5; c.beginPath(); c.ellipse(0, -9, 34, 8, 0, -1.2, 0.2); c.stroke();
  drawCondStand(c);
  const by = -P.bob * 2;
  c.save(); c.translate(0, -12 + by); c.rotate(P.lean);
  // дальняя рука (левая) — за телом
  const shB = [12, -70];
  const ab = ik(shB[0], shB[1], P.lh[0] + 22, P.lh[1] + 4, 24, 22, 1);
  limb(c, [shB, [ab.ex, ab.ey], [ab.hx, ab.hy]], 7.5, coat, lit('#18161C'), 1.2);
  hand(c, ab.hx, ab.hy, 4, -2.2, skin, line, 0.9);
  // ноги
  limb(c, [[-8, -24], [-10, -12], [-12, -2]], 9, skin, line, 1.4);
  limb(c, [[10, -24], [12, -12], [12, -2]], 9, skin, line, 1.4);
  foot(c, -12, 0, 1.1, -1, skin, line); foot(c, 12, 0, 1.1, 1, skin, line);
  // фалды фрака (захлёст — отстают от движения)
  const sw = Math.sin(t * 2.3) * 3 + (P.rh[0] + 40) * 0.12;
  c.fillStyle = coat; c.strokeStyle = lit('#18161C'); c.lineWidth = 1.4;
  c.beginPath(); c.moveTo(14, -42); c.quadraticCurveTo(30 + sw, -26, 26 + sw * 1.4, -8); c.lineTo(16 + sw, -12); c.quadraticCurveTo(12, -26, 4, -40); c.closePath(); c.fill(); c.stroke();
  // тело во фраке
  c.beginPath(); c.moveTo(-4, -20);
  c.bezierCurveTo(22, -20, 32, -40, 30, -60); c.bezierCurveTo(28, -82, 16, -92, -4, -92);
  c.bezierCurveTo(-24, -92, -32, -80, -32, -58); c.bezierCurveTo(-32, -36, -24, -20, -4, -20); c.closePath();
  c.fillStyle = coat; c.fill(); c.stroke();
  // манишка и лацканы (к оркестру — влево)
  c.fillStyle = shirt; c.beginPath(); c.moveTo(-22, -86); c.quadraticCurveTo(-34, -60, -24, -30); c.quadraticCurveTo(-14, -40, -10, -86); c.closePath(); c.fill();
  c.fillStyle = coatHi; c.beginPath(); c.moveTo(-10, -86); c.lineTo(-4, -60); c.lineTo(-14, -52); c.closePath(); c.fill();
  c.strokeStyle = rimC(0.55); c.lineWidth = 2.2; c.beginPath(); c.moveTo(26, -76); c.quadraticCurveTo(31, -58, 26, -36); c.stroke();
  c.fillStyle = lit('#1B1A1E'); for (const yy of [-66, -54, -42]) { circ(c, -18, yy, 1.4); c.fill(); }
  // голова
  c.save(); c.translate(-6, -90); c.rotate(P.nod * 0.18 + P.brow * 0.02); c.translate(6, 90);
  const hx = P.turn * 14;
  c.fillStyle = skin; ell(c, -4, -104, 36, 21); c.fill(); c.strokeStyle = line; c.lineWidth = 1.8; c.stroke();
  c.fillStyle = belly; ell(c, -12 + hx * 0.3, -90, 22, 6); c.fill();
  c.fillStyle = wart; for (const [sx, sy, r] of [[14, -110, 3], [22, -100, 2.4], [6, -120, 2], [-30, -104, 2.2], [26, -112, 1.8]]) { circ(c, sx, sy, r); c.fill(); }
  rimArc(c, -4, -104, 36, 21, -1.4, 0.3, 2.4);
  mouth(c, -10 + hx * 0.4, -97, 40, P.smile, P.open, line, 2);
  c.fillStyle = line; circ(c, -24 + hx * 0.3, -107, 1.2); c.fill(); circ(c, -17 + hx * 0.3, -108, 1.2); c.fill();
  const ex1 = -20 + hx, ex2 = 10 + hx * 0.8, ey = -120;
  const eo = { skin, line, gx: P.gx, gy: P.gy, lid: P.lid, pupil: 0.9 };
  eye(c, ex1, ey, 9.5, Object.assign({ side: -1, tilt: -P.brow * 0.3 }, eo));
  eye(c, ex2, ey - 1, 8.5, Object.assign({ side: 1, tilt: -P.brow * 0.3 }, eo));
  // очки: сползают на кончик носа
  const sy = P.specs * 12;
  c.strokeStyle = lit('#C9A24A'); c.lineWidth = 1.6;
  circ(c, ex1, ey + sy, 11.5); c.stroke(); circ(c, ex2, ey - 1 + sy, 10.5); c.stroke();
  c.beginPath(); c.moveTo(ex1 + 11.5, ey + sy); c.quadraticCurveTo((ex1 + ex2) / 2 + 5, ey - 5 + sy, ex2 - 10.5, ey - 1 + sy); c.stroke();
  c.beginPath(); c.moveTo(ex2 + 10.5, ey - 2 + sy); c.lineTo(28, ey - 4 + sy * 0.5); c.stroke();
  c.fillStyle = 'rgba(255,250,235,0.28)'; circ(c, ex1, ey + sy, 11); c.fill(); circ(c, ex2, ey - 1 + sy, 10); c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 1.4; c.beginPath(); c.arc(ex1, ey + sy, 8, -2.4, -1.6); c.stroke();
  // пышные седые брови
  c.strokeStyle = lit('#F4F0E4'); c.lineWidth = 4.4; c.lineCap = 'round';
  const br = P.brow * 7;
  c.beginPath(); c.moveTo(ex1 - 11, ey - 12 - br * 0.6); c.quadraticCurveTo(ex1, ey - 19 - br, ex1 + 10, ey - 13 - br * 0.9 + P.brow * 0); c.stroke();
  c.beginPath(); c.moveTo(ex2 - 9, ey - 14 - br * 0.9); c.quadraticCurveTo(ex2, ey - 20 - br, ex2 + 10, ey - 13 - br * 0.6); c.stroke();
  c.restore();
  bowtie(c, -10, -84, 8, 5, lit('#1B1A1E'), lit('#000000'));
  // ближняя рука с палочкой
  const shF = [-14, -74];
  const af = ik(shF[0], shF[1], P.rh[0], P.rh[1], 24, 23, -1);
  limb(c, [shF, [af.ex, af.ey], [af.hx, af.hy]], 8, coat, lit('#18161C'), 1.3);
  c.fillStyle = shirt; circ(c, af.hx + (af.hx - af.ex) * 0.02, af.hy, 4.6); c.fill();
  // палочка: смотрит вдоль предплечья с доворотом
  const ang = Math.atan2(af.hy - af.ey, af.hx - af.ex) + P.baton * 0.12 + 0.35;
  c.strokeStyle = lit('#FFFDF5'); c.lineWidth = 1.8;
  c.beginPath(); c.moveTo(af.hx, af.hy); c.lineTo(af.hx + Math.cos(ang) * 44, af.hy + Math.sin(ang) * 44); c.stroke();
  c.fillStyle = lit('#EDE3C8'); circ(c, af.hx, af.hy, 2.2); c.fill();
  hand(c, af.hx, af.hy, 4.2, ang, skin, line, 0.7);
  c.restore();
  c.restore();
  return P;
}

/* ======================================================================
   ЛЯГУШОНОК — главный герой с веточкой ландыша
   ====================================================================== */
const HERO = { x: -96, d: 0.86, s: 1.0 };
const LILY_PITCH = [84, 86, 88, 89, 91]; // C6 D6 E6 F6 G6 — колокольчики от основания к кончику
function heroCount(t) {
  const A = SCORE.SEG.A, T = SCORE.T;
  const R = { fingers: 0, pop: 0, toes: -1, toePop: 0, lost: 0, round: 0 };
  if (t < A.t0 || t > T.hit + 0.1) return R;
  const pos = A.pos(t), bar = Math.floor(pos / 4) + 1, tb = t - A.at(bar, 1);
  if (bar <= 8) { R.fingers = ((bar - 1) % 4) + 1; R.pop = tb; R.round = bar > 4 ? 1 : 0; }
  else if (bar <= 12) { R.toes = bar - 9; R.toePop = tb; R.fingers = 4; }
  else { R.lost = clamp(tb / 0.6, 0, 1); R.fingers = 4; }
  return R;
}
function poseHero(t) {
  const P = {};
  const { prev, next } = near('hero', t);
  // взмах веточкой: назад перед нотой, резко вперёд на ноте, колокольчики качаются после
  const W = prev && next ? Math.min(0.16, (next.t - prev.t) * 0.55) : 0.16;
  const wind = next ? EASE.io(clamp(1 - (next.t - t) / W, 0, 1)) : 0;
  const tp = prev ? t - prev.t : 9;
  P.ringV = prev ? prev.v : 0;
  P.sprig = -0.42 * wind + (prev ? 0.3 * prev.v * Math.exp(-tp / 0.07) - 0.12 * spring(tp, 2.2, 3.5) * prev.v : 0);
  P.swing = prev ? spring(tp, 3.1, 2.6) * (0.5 + prev.v) : 0;
  P.ringIdx = prev ? Math.max(0, LILY_PITCH.indexOf(prev.m)) : 3;
  P.flash = prev ? decay(tp, 0.18) * prev.v : 0;
  P.tp = tp;
  const cnt = heroCount(t);
  P.cnt = cnt;
  const G = groove(t, act('hero', 'groove', t, 0.6));
  P.bob = G.bob;
  P.shrink = act('hero', 'shrink', t, 0);
  P.hide = act('hero', 'hide', t, 0);
  P.lid = act('hero', 'lid', t, 0.05) + blink(t, 41) * 0.9;
  P.tilt = act('hero', 'tilt', t, 0);
  P.squint = act('hero', 'squint', t, 0);
  P.gx = act('hero', 'gx', t, -0.5); P.gy = act('hero', 'gy', t, 0.2);
  P.smile = act('hero', 'smile', t, 0.2);
  P.open = act('hero', 'open', t, 0);
  P.pupil = act('hero', 'pupil', t, 1.1);
  P.wet = act('hero', 'wet', t, 0);
  P.tear = act('hero', 'tear', t, -1);
  P.lean = act('hero', 'lean', t, 0);
  P.raise = act('hero', 'raise', t, 0);
  P.bow = act('hero', 'bow', t, 0);
  P.fall = act('hero', 'fall', t, 0);
  P.count = act('hero', 'count', t, 1);
  return P;
}
function drawLeafPart(c, x, y, s, rot) {
  c.save(); c.translate(x, y); c.rotate(rot); c.scale(s, s);
  c.fillStyle = lit('#CFE3A0'); c.strokeStyle = lit('#6E8F3A'); c.lineWidth = 1;
  c.beginPath(); c.moveTo(-15, 2); c.quadraticCurveTo(-14, -12, 0, -13); c.quadraticCurveTo(15, -12, 16, 0); c.quadraticCurveTo(14, 11, 0, 12); c.quadraticCurveTo(-13, 11, -15, 2); c.fill(); c.stroke();
  c.strokeStyle = lit('#3E4A2A', 0.8); c.lineWidth = 0.5;
  for (let k = -2; k <= 2; k++) { c.beginPath(); c.moveTo(-11, k * 2.6); c.lineTo(12, k * 2.6); c.stroke(); }
  c.fillStyle = lit('#2A2A22'); ell(c, 8, 1.3, 1.6, 1.2, -0.4); c.fill();
  c.strokeStyle = lit('#D9483B'); c.lineWidth = 0.7; circ(c, 8, 1.3, 3.2); c.stroke();
  c.restore();
}
function drawSprig(c, x, y, ang, P, t) {
  c.save(); c.translate(x, y); c.rotate(ang);
  // стебель дугой
  c.strokeStyle = lit('#5E8F2E'); c.lineWidth = 2.2; c.lineCap = 'round';
  c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(4, -30, 26, -38); c.stroke();
  const bells = [];
  for (let k = 0; k < 5; k++) {
    const u = 0.35 + k * 0.155;
    const bx = (1 - u) * (1 - u) * 0 + 2 * (1 - u) * u * 4 + u * u * 26, byy = 2 * (1 - u) * u * -30 + u * u * -38;
    bells.push([bx, byy, 4.6 - k * 0.55, k]);
  }
  for (const [bx, byy, r, k] of bells) {
    const sw = (k === 4 - P.ringIdx ? 1 : 0.45) * P.swing * 0.5 + Math.sin(t * 2 + k) * 0.05 - (ang + 0.25) * 0.7; // висят по отвесу
    c.save(); c.translate(bx, byy); c.rotate(sw);
    c.strokeStyle = lit('#6E9E3A'); c.lineWidth = 0.9; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, 4); c.stroke();
    c.fillStyle = lit('#FFFDF4'); c.strokeStyle = lit('#B9BFA0'); c.lineWidth = 0.7;
    c.beginPath(); c.moveTo(-r, 4 + r * 1.3); c.quadraticCurveTo(-r * 1.05, 4, 0, 3.2); c.quadraticCurveTo(r * 1.05, 4, r, 4 + r * 1.3);
    c.quadraticCurveTo(r * 0.5, 4 + r * 1.05, 0, 4 + r * 1.35); c.quadraticCurveTo(-r * 0.5, 4 + r * 1.05, -r, 4 + r * 1.3); c.fill(); c.stroke();
    c.restore();
  }
  c.restore();
  // искорка от прозвеневшего колокольчика
  if (P.flash > 0.02) {
    const [bx, byy] = bells[4 - P.ringIdx];
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const wx = x + bx * ca - byy * sa, wy = y + bx * sa + byy * ca + 8;
    sparkle(c, wx, wy, 6 + 10 * P.flash, P.flash, 'rgba(255,252,220,0.95)');
    c.save(); c.globalCompositeOperation = 'lighter'; drawGlow(c, wx, wy, 26 * P.flash + 6, P.flash * 0.8); c.restore();
  }
}
function drawHero(c, t) {
  const P = poseHero(t);
  const skin = lit('#A6D24C'), dark = lit('#83B034'), line = lit('#4D6E1E'), belly = lit('#F1EDB6');
  c.save();
  // пюпитр-веточка с листком-партией
  c.strokeStyle = lit('#7A5530'); c.lineWidth = 2.2; c.lineCap = 'round';
  c.beginPath(); c.moveTo(-36, 2); c.lineTo(-34, -40); c.lineTo(-40, -46); c.moveTo(-34, -40); c.lineTo(-28, -47); c.stroke();
  drawLeafPart(c, -34, -52, 1, -0.18);
  // камушек
  shadow(c, 2, 2, 26, 6);
  c.fillStyle = lit('#9C958A'); ell(c, 0, -6, 20, 9); c.fill();
  c.fillStyle = lit('#BDB6A8'); ell(c, -2, -9, 16, 6); c.fill();
  const sq = P.shrink, by = -P.bob * 3 + sq * 5 + P.fall * 6;
  c.save();
  c.translate(0, -8);
  c.rotate(P.lean * 0.3 + P.bow * 0.55 + P.fall * 0.25);
  c.scale(1 + sq * 0.08, 1 - sq * 0.13);
  c.translate(0, 8);
  // ножки свисают с камушка, болтаются
  const kick = Math.sin(t * 5.2) * (1 - sq) * 0.6 * grooveAmt(t) + (P.cnt.toes >= 0 ? 1 : 0);
  const toeL = P.cnt.toes >= 0 && P.cnt.toes % 2 === 0 ? decay(P.cnt.toePop, 0.25) * 5 : 0;
  const toeR = P.cnt.toes >= 0 && P.cnt.toes % 2 === 1 ? decay(P.cnt.toePop, 0.25) * 5 : 0;
  limb(c, [[-7, -14 + by], [-12, -6], [-9, 4 - toeL + kick]], 6.5, skin, line, 1.2);
  limb(c, [[7, -14 + by], [12, -6], [9, 4 - toeR - kick]], 6.5, skin, line, 1.2);
  foot(c, -9, 6 - toeL + kick, 0.75, -1, skin, line, toeL / 5);
  foot(c, 9, 6 - toeR - kick, 0.75, 1, skin, line, toeR / 5);
  c.translate(0, by);
  // тело
  c.beginPath(); c.moveTo(0, -10);
  c.bezierCurveTo(14, -10, 19, -20, 18, -30); c.bezierCurveTo(17, -40, 11, -46, 0, -47);
  c.bezierCurveTo(-11, -46, -17, -40, -18, -30); c.bezierCurveTo(-19, -20, -14, -10, 0, -10); c.closePath();
  c.fillStyle = skin; c.fill(); c.strokeStyle = line; c.lineWidth = 1.4; c.stroke();
  c.fillStyle = belly; ell(c, 0, -24, 11, 11); c.fill();
  rimArc(c, 0, -30, 18, 18, -1.2, 0.4, 1.8);
  // рука со счётом (ближе к зрителю справа)
  const shC = [15, -32];
  const lost = P.cnt.lost;
  let cx = 24 - P.hide * 2, cy = -38 + P.raise * -6;
  if (P.count > 0.5 && P.cnt.fingers > 0 && !P.hide) { cx = 22; cy = -42; }
  if (lost > 0) { cx = 26 + Math.sin(t * 9) * 2 * lost; cy = -46; }
  const ac = ik(shC[0], shC[1], cx, cy, 10, 10, 1);
  limb(c, [shC, [ac.ex, ac.ey], [ac.hx, ac.hy]], 5, skin, line, 1.1);
  // кисть: поднятые пальцы — сколько тактов отсчитано
  c.fillStyle = skin; c.strokeStyle = line; c.lineWidth = 1;
  const nf = P.count > 0.5 ? P.cnt.fingers : 0;
  for (let k = 0; k < 4; k++) {
    const up = k < nf, a = -Math.PI / 2 + (k - 1.5) * 0.36;
    const len = up ? 6.5 + (k === nf - 1 ? 2 * spring(P.cnt.pop, 3, 5) : 0) : 2.6;
    const fx = ac.hx + Math.cos(a) * len, fy = ac.hy + Math.sin(a) * len;
    c.lineWidth = 3.2; c.strokeStyle = line; c.beginPath(); c.moveTo(ac.hx, ac.hy); c.lineTo(fx, fy); c.stroke();
    c.lineWidth = 1.8; c.strokeStyle = skin; c.stroke();
    circ(c, fx, fy, 1.7); c.fill(); c.strokeStyle = line; c.lineWidth = 0.8; c.stroke();
  }
  circ(c, ac.hx, ac.hy, 3.4); c.fill(); c.strokeStyle = line; c.lineWidth = 1; c.stroke();
  // голова (большая — он ещё маленький)
  const gulpT = 0;
  c.save(); c.translate(0, -44); c.rotate(P.lean * 0.2 + (lost ? Math.sin(t * 4) * 0.08 * lost : 0)); c.translate(0, 44);
  c.fillStyle = skin; ell(c, 0, -52, 23, 15); c.fill(); c.strokeStyle = line; c.lineWidth = 1.4; c.stroke();
  c.fillStyle = belly; ell(c, 0, -43.5, 13, 4.2 + gulpT); c.fill();
  rimArc(c, 0, -52, 23, 15, -1.3, 0.2, 1.8);
  c.fillStyle = 'rgba(240,120,120,0.42)'; ell(c, -15, -47, 4.4, 2.6); c.fill(); ell(c, 15, -47, 4.4, 2.6); c.fill();
  mouth(c, 0, -47.5, 17, P.smile, P.open, line, 1.3);
  c.fillStyle = line; circ(c, -2.5, -54.5, 0.8); c.fill(); circ(c, 2.5, -54.5, 0.8); c.fill();
  const eo = { skin, line, gx: P.gx, gy: P.gy, lid: P.lid, tilt: P.tilt, squint: P.squint, pupil: P.pupil, wet: P.wet };
  eye(c, -10.5, -64, 8.6, Object.assign({ side: -1 }, eo));
  eye(c, 10.5, -64, 8.6, Object.assign({ side: 1 }, eo));
  // слеза
  if (P.tear >= 0 && P.tear <= 1) {
    const ty = -58 + P.tear * 16;
    c.fillStyle = `rgba(200,235,255,${0.9 * (1 - Math.max(0, P.tear - 0.8) * 5)})`;
    c.beginPath(); c.moveTo(-15, ty - 3.5); c.quadraticCurveTo(-12.5, ty, -15, ty + 1.6); c.quadraticCurveTo(-17.5, ty, -15, ty - 3.5); c.fill();
  }
  c.restore();
  bowtie(c, 0, -40, 8.5, 5.6, lit('#E0463A'), lit('#8E231B'), lit('#FFF3E0'));
  // рука с веточкой (слева от зрителя)
  const shS = [-15, -32];
  // поднятая веточка уходит вверх-влево, чтобы колокольчики не закрывали мордочку
  const holdX = -20 - P.hide * 4 - P.raise * 6, holdY = -36 + P.hide * 14 - P.raise * 13;
  const as = ik(shS[0], shS[1], holdX, holdY, 10, 10, -1);
  const sprigAng = -0.25 + P.sprig - P.hide * 1.2 - P.raise * 0.95;
  if (P.hide < 0.5) drawSprig(c, as.hx, as.hy, sprigAng, P, t);
  limb(c, [shS, [as.ex, as.ey], [as.hx, as.hy]], 5, skin, line, 1.1);
  hand(c, as.hx, as.hy, 3.2, sprigAng - Math.PI / 2, skin, line, 0.8);
  if (P.hide >= 0.5) { c.save(); c.globalAlpha = 0.9; drawSprig(c, as.hx + 30, as.hy + 4, sprigAng + 0.6, P, t); c.restore(); }
  c.restore();
  c.restore();
  return P;
}

/* ======================================================================
   ЖУК-НОСОРОГ — большой барабан из скорлупки грецкого ореха
   ====================================================================== */
const RHINO = { x: -408, d: -0.24, s: 1.25 };
function drawRhino(c, t) {
  const { prev, next } = near('rhino', t);
  const h = strikeH(t, prev, next, 0.22, 0.75);
  const tp = prev ? t - prev.t : 9, v = prev ? prev.v : 0;
  const G = groove(t);
  const hit = decay(tp, 0.08) * v;
  const shell = lit('#6B2E1E'), shellHi = lit('#B8674A'), line = lit('#2A100A');
  c.save();
  shadow(c, 0, 2, 58, 9);
  // жук за барабаном
  const bb = -G.bob * 2 + hit * 3;
  c.save(); c.translate(0, bb);
  // средние лапки упираются
  c.strokeStyle = line; c.lineWidth = 3.4; c.lineCap = 'round';
  c.beginPath(); c.moveTo(-26, -86); c.lineTo(-44, -72); c.lineTo(-40, -58); c.moveTo(26, -86); c.lineTo(44, -72); c.lineTo(40, -58); c.stroke();
  // надкрылья
  c.beginPath(); c.moveTo(0, -44);
  c.bezierCurveTo(28, -44, 38, -70, 36, -96); c.bezierCurveTo(34, -118, 20, -128, 0, -128);
  c.bezierCurveTo(-20, -128, -34, -118, -36, -96); c.bezierCurveTo(-38, -70, -28, -44, 0, -44); c.closePath();
  const g = c.createLinearGradient(-30, -120, 30, -50); g.addColorStop(0, lit('#8E4430')); g.addColorStop(1, shell);
  c.fillStyle = g; c.fill(); c.strokeStyle = line; c.lineWidth = 2; c.stroke();
  c.strokeStyle = lit('#3A160C'); c.lineWidth = 1.4; c.beginPath(); c.moveTo(0, -126); c.lineTo(0, -48); c.stroke();
  c.strokeStyle = 'rgba(255,225,200,0.5)'; c.lineWidth = 4; c.beginPath(); c.moveTo(-20, -112); c.quadraticCurveTo(-28, -96, -24, -76); c.stroke();
  rimArc(c, 0, -88, 36, 40, -1.2, 0.3, 3);
  // переднеспинка и голова с рогом
  c.fillStyle = shell; ell(c, 0, -128, 26, 13); c.fill(); c.strokeStyle = line; c.lineWidth = 1.8; c.stroke();
  const hornW = spring(tp, 4.5, 5) * v * 0.18;
  c.save(); c.translate(0, -138); c.rotate(hornW);
  c.fillStyle = lit('#4E1F14'); ell(c, 0, 0, 17, 12); c.fill(); c.stroke();
  c.fillStyle = lit('#5A2618'); c.beginPath(); c.moveTo(-6, -8); c.quadraticCurveTo(-8, -34, 10, -50); c.quadraticCurveTo(6, -32, 6, -9); c.closePath(); c.fill(); c.stroke();
  c.strokeStyle = shellHi; c.lineWidth = 1.6; c.beginPath(); c.moveTo(-3, -12); c.quadraticCurveTo(-4, -32, 8, -46); c.stroke();
  // глаза
  const eo = { skin: lit('#4E1F14'), line, gx: act('rhino', 'gx', t, 0.4), gy: act('rhino', 'gy', t, 0.3), lid: act('rhino', 'lid', t, 0.25) + blink(t, 51) * 0.9, pupil: 0.9 };
  eye(c, -8, -2, 5.2, Object.assign({ side: -1 }, eo)); eye(c, 8, -2, 5.2, Object.assign({ side: 1 }, eo));
  mouth(c, 0, 6, 9, 0.4, act('rhino', 'open', t, 0), lit('#1A0806'), 1.2);
  c.restore();
  c.restore();
  // колотушка-чертополох в обеих лапках
  const H = [-4, -100 - 22 * h + bb], ang = lerp(1.32, -0.3, clamp(h / 1.75, 0, 1));
  const head = [H[0] + Math.cos(ang) * 62, H[1] + Math.sin(ang) * 62];
  c.strokeStyle = lit('#7A5A34'); c.lineWidth = 3; c.lineCap = 'round';
  c.beginPath(); c.moveTo(H[0] - Math.cos(ang) * 8, H[1] - Math.sin(ang) * 8); c.lineTo(head[0], head[1]); c.stroke();
  // барабан: скорлупа ореха, мембрана-лист
  const dip = hit * 5;
  c.fillStyle = lit('#9A6A3C'); c.strokeStyle = lit('#4E2E14'); c.lineWidth = 2;
  c.beginPath(); c.moveTo(-50, -52); c.bezierCurveTo(-54, -18, -30, 0, 0, 0); c.bezierCurveTo(30, 0, 54, -18, 50, -52); c.closePath(); c.fill(); c.stroke();
  c.strokeStyle = lit('#6A4220', 0.8); c.lineWidth = 1.6;
  c.beginPath();
  for (const k of [-36, -22, -8, 8, 22, 36]) { c.moveTo(k, -50); c.bezierCurveTo(k * 1.05 + 4, -38, k * 0.9 - 4, -20, k * 0.6, -4); }
  c.stroke();
  c.strokeStyle = rimC(0.6); c.lineWidth = 2.2; c.beginPath(); c.moveTo(46, -44); c.quadraticCurveTo(44, -20, 26, -6); c.stroke();
  c.fillStyle = lit('#C4DA92'); ell(c, 0, -52 + dip * 0.3, 50, 12 + dip * 0.6); c.fill();
  c.strokeStyle = lit('#7A9A4A'); c.lineWidth = 1.2; c.stroke();
  // круги по мембране от удара
  if (hit > 0.02) { c.strokeStyle = `rgba(255,255,230,${hit * 0.8})`; c.lineWidth = 1.4; ell(c, 0, -52, 14 + tp * 160, 3.4 + tp * 38); c.stroke(); }
  c.strokeStyle = lit('#6F8E3A'); c.lineWidth = 0.8; c.beginPath(); c.moveTo(-40, -52); c.lineTo(40, -52); c.moveTo(0, -62); c.lineTo(0, -42); c.stroke();
  c.strokeStyle = lit('#A0B060'); c.lineWidth = 2.6; c.beginPath(); c.ellipse(0, -51, 50, 12, 0, 0.2, Math.PI - 0.2); c.stroke();
  // головка колотушки поверх барабана, когда бьёт
  c.fillStyle = lit('#9A5CB0'); c.strokeStyle = lit('#5A2E6E'); c.lineWidth = 1.2;
  circ(c, head[0], head[1], 9.5); c.fill(); c.stroke();
  c.strokeStyle = lit('#C79AD8'); c.lineWidth = 1;
  c.beginPath(); for (let k = 0; k < 9; k++) { const a = k * TAU / 9; c.moveTo(head[0], head[1]); c.lineTo(head[0] + Math.cos(a) * 12, head[1] + Math.sin(a) * 12); } c.stroke();
  // лапки на рукояти
  c.fillStyle = lit('#3A160C'); circ(c, H[0], H[1], 4.2); c.fill(); circ(c, H[0] + Math.cos(ang) * 12, H[1] + Math.sin(ang) * 12, 4); c.fill();
  c.strokeStyle = line; c.lineWidth = 3.4;
  c.beginPath(); c.moveTo(-24, -110 + bb); c.lineTo(H[0], H[1]); c.moveTo(24, -110 + bb); c.lineTo(H[0] + Math.cos(ang) * 12, H[1] + Math.sin(ang) * 12); c.stroke();
  c.restore();
}

/* ======================================================================
   БОЖЬИ КОРОВКИ — барабанчики из шляпок желудей
   ====================================================================== */
const LB = [{ who: 'lb1', x: -302, d: 0.46, s: 0.92 }, { who: 'lb2', x: -218, d: 0.62, s: 0.88 }];
function drawLadybug(c, t, L) {
  const { prev, next, i } = near(L.who, t);
  const tp = prev ? t - prev.t : 9;
  const side = i % 2 === 0 ? 1 : -1;             // палочки по очереди
  const hA = strikeH(t, side === 1 ? prev : null, next && side === -1 ? next : null, 0.16, 0.8);
  const hB = strikeH(t, side === -1 ? prev : null, next && side === 1 ? next : null, 0.16, 0.8);
  const G = groove(t), hit = prev ? decay(tp, 0.07) * prev.v : 0;
  const red = lit('#D8352A'), redD = lit('#9E1F18'), black = lit('#1D1A1C');
  c.save();
  shadow(c, 0, 2, 30, 6);
  const bb = -G.bob * 2 + hit * 1.5;
  c.save(); c.translate(0, bb);
  // панцирь
  c.fillStyle = red; circ(c, 0, -58, 24); c.fill(); c.strokeStyle = redD; c.lineWidth = 1.6; c.stroke();
  c.strokeStyle = black; c.lineWidth = 1.4; c.beginPath(); c.moveTo(0, -82); c.lineTo(0, -40); c.stroke();
  c.fillStyle = black; for (const [sx, sy, r] of [[-12, -66, 4.4], [12, -64, 4.2], [-15, -50, 3.6], [14, -48, 3.8], [-5, -42, 2.6]]) { circ(c, sx, sy, r); c.fill(); }
  c.fillStyle = 'rgba(255,255,255,0.45)'; ell(c, -10, -72, 6, 3.6, -0.5); c.fill();
  rimArc(c, 0, -58, 24, 24, -1.3, 0.4, 2.2);
  // голова
  const tilt = spring(tp, 3.2, 5) * 0.12 * (prev ? prev.v : 0);
  c.save(); c.translate(0, -76); c.rotate(tilt);
  c.fillStyle = black; ell(c, 0, 0, 15, 11); c.fill();
  c.fillStyle = lit('#FFFFFF'); ell(c, -10, 3, 3.4, 2.4); c.fill(); ell(c, 10, 3, 3.4, 2.4); c.fill();
  const aw = spring(tp, 4, 4) * 0.35 * (prev ? prev.v : 0);
  c.strokeStyle = black; c.lineWidth = 1.2;
  c.beginPath(); c.moveTo(-5, -9); c.quadraticCurveTo(-10, -20, -14 + aw * 6, -24); c.moveTo(5, -9); c.quadraticCurveTo(10, -20, 14 + aw * 6, -24); c.stroke();
  circ(c, -14 + aw * 6, -24, 2.2); c.fill(); circ(c, 14 + aw * 6, -24, 2.2); c.fill();
  const eo = { skin: black, line: lit('#000000'), gx: act(L.who, 'gx', t, 0.3), gy: act(L.who, 'gy', t, 0.5), lid: act(L.who, 'lid', t, 0.1) + blink(t, L.x) * 0.9, pupil: 1 };
  eye(c, -5.5, -3, 4.6, Object.assign({ side: -1 }, eo)); eye(c, 5.5, -3, 4.6, Object.assign({ side: 1 }, eo));
  c.restore();
  c.restore();
  // шляпка жёлудя на ножках-веточках
  c.strokeStyle = lit('#7A5530'); c.lineWidth = 1.8; c.lineCap = 'round';
  c.beginPath(); c.moveTo(-10, 0); c.lineTo(-4, -22); c.moveTo(10, 0); c.lineTo(4, -22); c.moveTo(0, 2); c.lineTo(0, -22); c.stroke();
  c.fillStyle = lit('#A57A45'); c.strokeStyle = lit('#5E3F1E'); c.lineWidth = 1.4;
  c.beginPath(); c.moveTo(-21, -36); c.quadraticCurveTo(-20, -20, 0, -19); c.quadraticCurveTo(20, -20, 21, -36); c.closePath(); c.fill(); c.stroke();
  c.strokeStyle = lit('#6E4A24', 0.7); c.lineWidth = 0.8; c.beginPath();
  for (let k = -3; k <= 3; k++) { c.moveTo(k * 5.5, -35); c.lineTo(k * 5.5 + 3, -24); c.moveTo(k * 5.5, -35); c.lineTo(k * 5.5 - 3, -24); } c.stroke();
  c.fillStyle = lit('#5A3A1A'); ell(c, 0, -36, 21, 5 + hit * 1.2); c.fill();
  c.fillStyle = lit('#7A5530'); ell(c, 0, -36, 17, 3.6); c.fill();
  if (hit > 0.05) { c.strokeStyle = `rgba(255,240,200,${hit * 0.8})`; c.lineWidth = 1; ell(c, 0, -36, 6 + tp * 90, 1.6 + tp * 20); c.stroke(); }
  // палочки
  for (const [sgn, hh] of [[-1, hA], [1, hB]]) {
    const sx = sgn * 14, sy = -64 + bb;
    const ang = lerp(1.25, -0.3, clamp(hh / 1.8, 0, 1)) * 1;
    const px = sx + sgn * -Math.cos(ang) * 4, py = sy;
    const tipX = sgn * 5 + sgn * Math.cos(ang) * -2 + sgn * 2, tipY = -38;
    const ex = lerp(tipX, sx + sgn * 12, clamp(hh / 1.8, 0, 1)), ey = lerp(tipY, sy - 22, clamp(hh / 1.8, 0, 1));
    c.strokeStyle = lit('#C9A26A'); c.lineWidth = 1.8;
    c.beginPath(); c.moveTo(px, py); c.lineTo(ex, ey); c.stroke();
    c.fillStyle = lit('#E8CFA0'); circ(c, ex, ey, 2.2); c.fill();
    c.strokeStyle = black; c.lineWidth = 2.2; c.beginPath(); c.moveTo(sgn * 16, -54 + bb); c.lineTo(px, py); c.stroke();
    c.fillStyle = black; circ(c, px, py, 2.6); c.fill();
  }
  c.restore();
}

/* ======================================================================
   БРОНЗОВКА — маракасы из маковых коробочек
   ====================================================================== */
const CHAFER = { x: -468, d: 0.3, s: 0.98 };
function drawChafer(c, t) {
  const { prev, next, i } = near('chafer', t);
  const G = groove(t);
  const tp = prev ? t - prev.t : 9;
  // трясёт по очереди: нота → коробочка резко вниз (звук — в нижней точке)
  const side = i % 2 === 0 ? -1 : 1;
  const shake = (s) => {
    const own = side === s ? prev : null, nextOwn = next && ((i + 1) % 2 === 0 ? -1 : 1) === s ? next : null;
    return strikeH(t, own, nextOwn, 0.12, 0.5);
  };
  const hL = shake(-1), hR = shake(1);
  c.save();
  shadow(c, 0, 2, 28, 6);
  const bb = -G.bob * 2;
  c.translate(0, bb);
  // ножки
  c.strokeStyle = lit('#1F3A2A'); c.lineWidth = 2.4; c.lineCap = 'round';
  c.beginPath(); c.moveTo(-8, -30); c.lineTo(-12, -14); c.lineTo(-14, 0); c.moveTo(8, -30); c.lineTo(12, -14); c.lineTo(14, 0); c.stroke();
  // надкрылья — переливы от зелёного к золоту
  c.beginPath(); c.moveTo(0, -26);
  c.bezierCurveTo(18, -26, 24, -44, 22, -60); c.bezierCurveTo(20, -74, 12, -80, 0, -80);
  c.bezierCurveTo(-12, -80, -20, -74, -22, -60); c.bezierCurveTo(-24, -44, -18, -26, 0, -26); c.closePath();
  const g = c.createLinearGradient(-20, -80, 22, -30);
  g.addColorStop(0, lit('#58C27E')); g.addColorStop(0.5, lit('#2E8A5A')); g.addColorStop(1, lit('#C9B04A'));
  c.fillStyle = g; c.fill(); c.strokeStyle = lit('#174030'); c.lineWidth = 1.5; c.stroke();
  c.strokeStyle = lit('#174030'); c.lineWidth = 1; c.beginPath(); c.moveTo(0, -78); c.lineTo(0, -28); c.stroke();
  c.strokeStyle = 'rgba(255,255,230,0.55)'; c.lineWidth = 3; c.beginPath(); c.moveTo(-12, -70); c.quadraticCurveTo(-17, -58, -14, -44); c.stroke();
  rimArc(c, 0, -54, 22, 27, -1.2, 0.4, 2);
  // голова
  c.fillStyle = lit('#2B7A50'); ell(c, 0, -84, 12, 8.5); c.fill(); c.strokeStyle = lit('#174030'); c.lineWidth = 1.2; c.stroke();
  const eo = { skin: lit('#2B7A50'), line: lit('#174030'), gx: act('chafer', 'gx', t, 0.35), gy: act('chafer', 'gy', t, 0.2), lid: act('chafer', 'lid', t, 0.2) + blink(t, 61) * 0.9, pupil: 0.95 };
  eye(c, -5.5, -88, 4.4, Object.assign({ side: -1 }, eo)); eye(c, 5.5, -88, 4.4, Object.assign({ side: 1 }, eo));
  mouth(c, 0, -80, 7, 0.5, act('chafer', 'open', t, 0), lit('#123020'), 1);
  // руки с маракасами
  for (const [s, hh] of [[-1, hL], [1, hR]]) {
    const up = clamp(hh, 0, 1.6);
    const hx = s * (24 + up * 2), hy = -58 - up * 12;
    c.strokeStyle = lit('#1F3A2A'); c.lineWidth = 2.4;
    c.beginPath(); c.moveTo(s * 16, -64); c.quadraticCurveTo(s * 24, -66, hx, hy); c.stroke();
    // коробочка мака
    const mx = hx + s * 3, my = hy - 12;
    c.strokeStyle = lit('#6E8A4A'); c.lineWidth = 1.6; c.beginPath(); c.moveTo(hx, hy); c.lineTo(mx, my + 5); c.stroke();
    c.fillStyle = lit('#9DB27A'); c.strokeStyle = lit('#55683A'); c.lineWidth = 1.2;
    ell(c, mx, my, 7.5, 8.5); c.fill(); c.stroke();
    c.fillStyle = lit('#6E7E52'); c.beginPath();
    for (let k = 0; k < 8; k++) { const a = -Math.PI / 2 + (k - 3.5) * 0.3; c.lineTo(mx + Math.cos(a) * 6.5, my - 7 + Math.sin(a) * 3.4 - (k % 2) * 2); }
    c.closePath(); c.fill();
    c.fillStyle = 'rgba(255,255,240,0.4)'; ell(c, mx - 2.4, my - 2, 2.2, 3.2); c.fill();
    // «шорох» — чёрточки при ударе
    const own = (side === s) ? prev : null;
    if (own && tp < 0.14) {
      c.strokeStyle = `rgba(255,248,220,${(1 - tp / 0.14) * 0.9})`; c.lineWidth = 1.2;
      c.beginPath(); for (let k = 0; k < 3; k++) { const a = -0.5 + k * 0.5 + (s > 0 ? 0 : Math.PI); c.moveTo(mx + Math.cos(a) * 11, my + Math.sin(a) * 11); c.lineTo(mx + Math.cos(a) * 16, my + Math.sin(a) * 16); } c.stroke();
    }
  }
  c.restore();
}

/* ======================================================================
   СТРЕКОЗЫ И КОЛОКОЛЬЧИКИ
   ====================================================================== */
const BELL_P = 0.93;                       // план за кувшинкой
const BELL_MIDI = [77, 79, 81, 82, 84, 86, 88, 89]; // F5 G5 A5 Bb5 C6 D6 E6 F6
const FLOWERS = BELL_MIDI.map((m, i) => {
  const u = i / 7;
  return { m, x: -372 + u * 336, y: -268 - Math.sin(u * Math.PI) * 44 - u * 18, s: 1 - u * 0.36, base: -380 + u * 300 + (i % 2 ? 14 : -10) };
});
const FL_TIMES = {};
for (const f of FLOWERS) {
  const arr = SCORE.EV.filter((e) => e.inst === 'bell' && e.m === f.m);
  FL_TIMES[f.m] = Object.assign(arr, { times: Float64Array.from(arr, (e) => e.t) });
}
function flowerSwing(f, t) {
  const a = FL_TIMES[f.m], i = SCORE.lastIdx(a.times, t);
  if (i < 0) return { ang: 0, tp: 9, v: 0 };
  const tp = t - a[i].t;
  return { ang: 0.42 * a[i].v * spring(tp, 1.7, 2.2) + 0.12 * a[i].v * Math.exp(-tp / 0.08), tp, v: a[i].v };
}
function drawFlowers(c, t, dfAt) {
  const wind = Math.sin(t * 0.8) * 0.03;
  for (const f of FLOWERS) {
    const sw = flowerSwing(f, t);
    const topX = f.x + 14 * f.s, topY = f.y - 24 * f.s;
    // стебель из воды
    c.strokeStyle = lit('#4E7E36'); c.lineWidth = 3.2 * f.s + 0.8; c.lineCap = 'round';
    c.beginPath(); c.moveTo(f.base, wyOf(BELL_P) + 30); c.bezierCurveTo(f.base + 6, f.y + 120, topX + 30 * f.s, topY - 40 * f.s, topX, topY); c.stroke();
    // листок на стебле
    c.fillStyle = lit('#5E9440'); c.beginPath(); const lx = f.base + 4, ly = f.y + 110 * f.s;
    c.moveTo(lx, ly); c.quadraticCurveTo(lx + 20, ly - 14, lx + 34, ly - 6); c.quadraticCurveTo(lx + 16, ly + 2, lx, ly); c.fill();
    // цветок-колокольчик висит и качается
    c.save(); c.translate(topX, topY); c.rotate(sw.ang + wind);
    const r = 17 * f.s;
    c.strokeStyle = lit('#4E7E36'); c.lineWidth = 2; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(-4 * f.s, 8 * f.s, -3 * f.s, 14 * f.s); c.stroke();
    c.translate(-3 * f.s, 14 * f.s);
    c.fillStyle = lit('#5E8E3C'); ell(c, 0, 1, r * 0.35, r * 0.18); c.fill();
    const g = c.createLinearGradient(-r, 0, r, r * 1.6);
    g.addColorStop(0, lit('#8E9BEA')); g.addColorStop(0.6, lit('#6474D4')); g.addColorStop(1, lit('#4552A8'));
    c.fillStyle = g; c.strokeStyle = lit('#323C82'); c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(-r * 0.3, 0); c.quadraticCurveTo(-r * 0.75, r * 0.4, -r * 0.8, r * 1.2);
    for (let k = 0; k < 5; k++) { const x0 = -r * 0.8 + k * r * 0.4; c.quadraticCurveTo(x0 + r * 0.2, r * 1.2 + r * 0.32, x0 + r * 0.4, r * 1.2); }
    c.quadraticCurveTo(r * 0.75, r * 0.4, r * 0.3, 0); c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = lit('#A9B4F4', 0.7); c.lineWidth = 1.2; c.beginPath(); c.moveTo(-r * 0.12, r * 0.12); c.quadraticCurveTo(-r * 0.4, r * 0.6, -r * 0.4, r * 1.15); c.stroke();
    c.strokeStyle = rimC(0.55); c.lineWidth = 1.6; c.beginPath(); c.moveTo(r * 0.35, r * 0.1); c.quadraticCurveTo(r * 0.7, r * 0.5, r * 0.75, r * 1.1); c.stroke();
    c.fillStyle = lit('#F2E6A0'); circ(c, 0, r * 1.32, r * 0.1); c.fill();
    c.restore();
    // вспышка на ударе
    if (sw.tp < 0.5) {
      const a = (1 - sw.tp / 0.5) * sw.v;
      const fx = topX + Math.sin(-sw.ang) * 0, fy = topY + r * 1.2;
      c.save(); c.globalCompositeOperation = 'lighter';
      drawGlow(c, fx, fy, 40 * f.s + 20 * a, a * 0.55);
      c.restore();
      sparkle(c, fx + 14 * f.s, fy - 6 * f.s, 7 + 7 * a, a, 'rgba(255,255,235,0.95)');
      // брызги росы по дуге
      c.fillStyle = `rgba(230,245,255,${a * 0.9})`;
      for (let k = 0; k < 4; k++) { const dx = (k - 1.5) * 9 * f.s, tt = sw.tp; circ(c, fx + dx + dx * tt * 2, fy + 4 - 60 * tt + 240 * tt * tt, 1.7); c.fill(); }
    }
  }
  void dfAt;
}
// Траектория стрекозы: из точки удара предыдущей ноты — по дуге — к следующей
const DF = [
  { who: 'df1', home: [-452, -420], face: 1, body: '#2E8FC0', hi: '#86D6EC', eye: '#1F6E96' },
  { who: 'df2', home: [80, -432], face: -1, body: '#D9492E', hi: '#F7A06A', eye: '#A8321E' },
];
function flowerOf(m) { return FLOWERS[BELL_MIDI.indexOf(m)] || FLOWERS[0]; }
function strikePos(df, m) {
  const f = flowerOf(m);
  const fx = f.x + 14 * f.s - 3 * f.s, fy = f.y - 24 * f.s + 14 * f.s + 17 * f.s * 0.6;
  return [fx + df.face * 58, fy - 38];
}
function arc(a, b, u) {
  const mx = (a[0] + b[0]) / 2, my = Math.min(a[1], b[1]) - 16 - Math.abs(b[0] - a[0]) * 0.22;
  return [(1 - u) * (1 - u) * a[0] + 2 * (1 - u) * u * mx + u * u * b[0], (1 - u) * (1 - u) * a[1] + 2 * (1 - u) * u * my + u * u * b[1]];
}
function poseDF(df, t) {
  const { prev, next } = near(df.who, t);
  let pos;
  const home = [df.home[0] + Math.sin(t * 0.7 + df.face) * 18, df.home[1] + Math.sin(t * 1.1) * 10];
  if (!prev && !next) pos = home;
  else if (!prev) { const tn = next.t - t; pos = tn > 0.75 ? home : arc(home, strikePos(df, next.m), EASE.io(1 - tn / 0.75)); }
  else if (!next) { const tp = t - prev.t; pos = arc(strikePos(df, prev.m), home, EASE.io(clamp((tp - 0.15) / 0.9, 0, 1))); }
  else {
    const gap = next.t - prev.t, tp = t - prev.t;
    const A = strikePos(df, prev.m), B = strikePos(df, next.m);
    if (gap > 1.7) {
      pos = tp < gap / 2 ? arc(A, home, EASE.io(clamp((tp - 0.12) / 0.8, 0, 1))) : arc(home, B, EASE.io(clamp(1 - (next.t - t - 0.03) / 0.75, 0, 1)));
    } else {
      pos = arc(A, B, EASE.io(clamp((tp - 0.06) / Math.max(0.05, gap - 0.12), 0, 1)));
    }
  }
  // лёгкое парение — меньше у самого удара
  const tn = next ? next.t - t : 9, tp = prev ? t - prev.t : 9;
  const calm = clamp(Math.min(tn, tp) / 0.3, 0, 1);
  pos = [pos[0] + Math.sin(t * 2.3 + df.face) * 4 * calm, pos[1] + Math.sin(t * 3.1) * 5 * calm];
  const h = strikeH(t, prev, next, 0.14, 0.8);
  return { x: pos[0], y: pos[1], tail: 0.95 - 0.58 * h, h, v: prev ? prev.v : 0 };
}
function drawDragonfly(c, df, t) {
  const P = poseDF(df, t);
  c.save(); c.translate(P.x, P.y); c.scale(df.face * 1.25, 1.25);
  const body = lit(df.body), hi = lit(df.hi), line = lit('#1B2A33');
  // крылья — размытый взмах
  const flap = Math.sin(t * 90);
  for (let pass = 0; pass < 2; pass++) {
    const a = (pass ? 0.35 : -0.25) + flap * 0.15;
    c.save(); c.globalAlpha = pass ? 0.4 : 0.55;
    for (const [ox, len, off] of [[-2, 50, -0.08], [-9, 44, 0.22]]) {
      c.save(); c.translate(ox, -6); c.rotate(-Math.PI / 2 - 0.7 + a + off);
      const g = c.createLinearGradient(0, 0, len, 0);
      g.addColorStop(0, 'rgba(230,245,255,0.75)'); g.addColorStop(0.7, rimC(0.35)); g.addColorStop(1, 'rgba(255,255,255,0.2)');
      c.fillStyle = g; c.strokeStyle = 'rgba(80,110,130,0.5)'; c.lineWidth = 0.7;
      ell(c, len / 2, 0, len / 2, 7); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(2, 0); c.lineTo(len - 4, 0); c.stroke();
      c.restore();
      c.save(); c.translate(ox, -6); c.rotate(-Math.PI / 2 + 0.7 - a - off + Math.PI * 0);
      c.fillStyle = 'rgba(230,245,255,0.45)'; c.strokeStyle = 'rgba(80,110,130,0.4)'; c.lineWidth = 0.7;
      ell(c, -len / 2 * 0 + len / 2, 0, len / 2, 6.5); c.globalAlpha *= 0.8; c.fill(); c.stroke();
      c.restore();
    }
    c.restore();
  }
  // брюшко: сегменты по изогнутой линии, кончиком бьёт по цветку
  const segs = 9, L = 60, tail = P.tail;
  let x = -8, y = 0, ang = Math.PI - tail * 0.25;
  const pts = [[x, y]];
  for (let k = 0; k < segs; k++) { ang += tail * 0.11; x += Math.cos(ang) * (L / segs); y += Math.sin(ang) * (L / segs); pts.push([x, y]); }
  for (let k = 0; k < segs; k++) {
    const w = 5.2 - k * 0.38;
    c.strokeStyle = line; c.lineWidth = w + 1.6; c.lineCap = 'round';
    c.beginPath(); c.moveTo(pts[k][0], pts[k][1]); c.lineTo(pts[k + 1][0], pts[k + 1][1]); c.stroke();
    c.strokeStyle = k % 2 ? body : hi; c.lineWidth = w; c.stroke();
  }
  // грудь
  c.fillStyle = body; ell(c, -3, 0, 9, 7); c.fill(); c.strokeStyle = line; c.lineWidth = 1.2; c.stroke();
  c.fillStyle = hi; ell(c, -4, -2, 5, 2.6); c.fill();
  // лапки
  c.strokeStyle = line; c.lineWidth = 1;
  c.beginPath(); for (let k = 0; k < 3; k++) { c.moveTo(-6 + k * 3, 5); c.lineTo(-9 + k * 4, 12); c.lineTo(-7 + k * 4, 14); } c.stroke();
  // голова: два огромных глаза
  c.fillStyle = lit(df.eye); circ(c, 7, -3, 7.2); c.fill(); c.strokeStyle = line; c.lineWidth = 1; c.stroke();
  const eo = { skin: lit(df.eye), line, gx: 0.3 + act(df.who, 'gx', t, 0), gy: act(df.who, 'gy', t, 0.3), lid: act(df.who, 'lid', t, 0) + blink(t, df.face * 9) * 0.8, pupil: 1.05 };
  eye(c, 6, -5, 5.4, Object.assign({ side: -1 }, eo));
  eye(c, 12, -3, 5, Object.assign({ side: 1 }, eo));
  c.strokeStyle = line; c.lineWidth = 1; c.beginPath(); c.arc(10, 3, 3, 0.2, 2.2); c.stroke();
  c.restore();
}

/* ======================================================================
   СВЕТЛЯЧКИ
   ====================================================================== */
const FLIES = (() => {
  const T = SCORE.T, out = [];
  const heroP = notesOf('hero').filter((e) => e.seg === 'P');
  heroP.forEach((e, k) => out.push({ t0: e.t, from: [HERO.x + 20, footY(HERO.d) - 70], x: -520 + hash(k * 3.1) * 1040, y: -140 - hash(k * 5.7) * 300, p: 0.9 + hash(k) * 0.35, ph: hash(k * 2.3) * TAU, sp: 0.4 + hash(k * 9.1) * 0.5 }));
  const kicks = notesOf('rhino').filter((e) => e.t >= T.P + 4 && e.t < T.D + 12);
  for (let k = 0; k < 46; k++) {
    const e = kicks[k % kicks.length];
    const side = k % 2 ? 1 : -1;
    out.push({ t0: e.t + (k % 3) * 0.02, from: [side * (900 + hash(k) * 500), wyOf(0.6) - 40], x: side * (160 + hash(k * 7.7) * 900), y: -120 - hash(k * 1.3) * 420, p: 0.72 + hash(k * 4.4) * 0.8, ph: hash(k * 6.6) * TAU, sp: 0.3 + hash(k * 8.8) * 0.5 });
  }
  // «Дзынь!» на своём месте: из веточки вылетает стайка светлячков
  const from = [HERO.x - 34, footY(HERO.d) - 92];
  for (let k = 0; k < 11; k++) {
    out.push({ t0: T.ding2 + k * 0.03, from, x: HERO.x - 20 + (hash(k * 2.7 + 5) - 0.5) * 420, y: -30 - hash(k * 4.9 + 1) * 190, p: 0.95 + hash(k * 1.9) * 0.14, ph: hash(k * 3.9) * TAU, sp: 0.5 + hash(k * 6.1) * 0.5 });
  }
  return out;
})();
function fireflyFlash(t, f) {
  const T = SCORE.T;
  let a = 0.55;
  const b = beatAt(t);
  if (b && t > T.D - 0.5 && t < T.fin + 3) {
    // на каждую долю — волна света от барабана по всему рою
    const dist = Math.hypot(f.x - RHINO.x, f.y + 60) * 0.0005;
    const bp = b.ph - dist / (b.s.beatLen(b.i) || 0.5);
    const ph = bp - Math.floor(bp);
    a = 0.35 + 0.75 * Math.exp(-ph * 4.5);
  }
  if (t > T.ding2) a = 0.5 + 1.3 * decay(t - T.ding2, 1.5) + 0.25 * Math.sin(t * 3 + f.ph);
  return a;
}
function flyPos(f, t) {
  const T = SCORE.T;
  const age = t - f.t0;
  const wx = f.x + 34 * Math.sin(t * f.sp + f.ph) + 16 * Math.sin(t * f.sp * 2.3 + f.ph * 2);
  let wy = f.y + 22 * Math.sin(t * f.sp * 1.4 + f.ph * 1.7);
  if (t > T.L - 2) wy -= Math.pow(Math.max(0, t - (T.L - 2)), 1.6) * (40 + 30 * hash(f.ph));
  const u = EASE.out3(clamp(age / 2.2, 0, 1));
  return [lerp(f.from[0], wx, u), lerp(f.from[1], wy, u) - Math.sin(u * Math.PI) * 40];
}
function drawFireflies(c, t, pMin, pMax, refl) {
  const T = SCORE.T;
  c.save();
  c.globalCompositeOperation = 'lighter';
  for (const f of FLIES) {
    if (t < f.t0 || f.p < pMin || f.p >= pMax) continue;
    const age = t - f.t0;
    const [x, y] = flyPos(f, t);
    let a = fireflyFlash(t, f) * Math.min(1, age / 0.25);
    if (age < 0.4) a += 1.4 * (1 - age / 0.4);              // вспышка рождения — ровно на ноте
    if (t > T.end - 3) a *= 1;
    const L = layerT(f.p);
    const sx = L.ox + L.s * x, sy = L.oy + L.s * y;
    const r = (7 + 4 * Math.min(1, a)) * L.s * 2.2;
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (refl) {
      const wyS = L.oy + L.s * wyOf(f.p);
      const ry = 2 * wyS - sy;
      if (ry > wyS) drawGlow(c, sx, ry, r * 0.9, a * 0.25);
    } else drawGlow(c, sx, sy, r, a);
  }
  c.globalAlpha = 1;
  c.restore();
}

/* ======================================================================
   ХОР ЛЯГУШЕК В КАМЫШАХ (финал)
   ====================================================================== */
const CHOIR = [{ x: -700, p: 0.66, s: 0.85, ph: 0 }, { x: -590, p: 0.7, s: 0.7, ph: 1 }, { x: 610, p: 0.68, s: 0.8, ph: 2 }, { x: 720, p: 0.64, s: 0.9, ph: 3 }];
function drawChoir(c, t) {
  const T = SCORE.T;
  if (t < T.P + 6) return;
  const { prev } = near('choir', t);
  let sing = 0;
  if (prev && t < prev.t + prev.dur + 0.3) sing = clamp((t - prev.t) / 0.2, 0, 1) * clamp(1 - (t - prev.t - prev.dur) / 0.3, 0, 1) * prev.v;
  const appear = clamp((t - (T.P + 6)) / 2, 0, 1);
  for (const f of CHOIR) {
    useLayer(f.p);
    const y = wyOf(f.p) - 2;
    c.save(); c.translate(f.x, y + (1 - appear) * 30); c.scale(f.s, f.s);
    c.globalAlpha = appear;
    lilyPad(c, 0, 4, 60, 11, 1.2 + f.ph, lit('#3F7F3A'), lit('#7DB34F'), lit('#2A5A2E'), lit('#9CCB6A', 0.5), false);
    const skin = lit('#5E9A3E'), line = lit('#2A4A22');
    c.fillStyle = skin; c.strokeStyle = line; c.lineWidth = 1.6;
    ell(c, 0, -18, 22, 18); c.fill(); c.stroke();
    ell(c, 0, -38, 20, 12); c.fill(); c.stroke();
    // горловой мешок раздувается на каждом аккорде
    const sac = sing * (0.8 + 0.2 * Math.sin(t * 9 + f.ph));
    if (sac > 0.03) { c.fillStyle = lit('#F1E9C8', 0.95); ell(c, 0, -26 + sac * 2, 11 + sac * 9, 7 + sac * 8); c.fill(); c.strokeStyle = lit('#C9BD8A'); c.lineWidth = 1; c.stroke(); }
    const eo = { skin, line, gx: 0.2, gy: 0.2, lid: 0.5 + sing * 0.3, pupil: 1 };
    eye(c, -9, -48, 6, Object.assign({ side: -1 }, eo)); eye(c, 9, -48, 6, Object.assign({ side: 1 }, eo));
    c.globalAlpha = 1;
    c.restore();
  }
}

/* ======================================================================
   Вся сцена: порядок отрисовки от дальних к ближним
   ====================================================================== */
function actorAt(A) {
  // возвращает функцию, ставящую локальную систему координат актёра
  return (c, bob) => { c.translate(A.x, footY(A.d) + bob); const k = A.s * dScale(A.d); c.scale(k, k); };
}
function drawStage(c, t) {
  // колокольчики и стрекозы — на плане за кувшинкой
  useLayer(BELL_P);
  drawFlowers(c, t);
  for (const df of DF) drawDragonfly(c, df, t);
  // сама кувшинка и музыканты
  const L = useLayer(1);
  drawPadRipples(c, t);
  const bob = drawStagePad(c, t);
  const cast = [
    [RHINO, drawRhino], [BASSF, drawBassFrog], [BSNF, drawBsnFrog], [LB[0], (cc, tt) => drawLadybug(cc, tt, LB[0])],
    [CHAFER, drawChafer], [LB[1], (cc, tt) => drawLadybug(cc, tt, LB[1])], [COND, drawCond], [HERO, drawHero],
  ].sort((a, b) => a[0].d - b[0].d);
  for (const [A, fn] of cast) {
    c.save();
    actorAt(A)(c, bob);
    fn(c, t);
    c.restore();
  }
  return L;
}
