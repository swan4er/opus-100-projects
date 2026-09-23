'use strict';
/* =====================================================================
   Кофейник Жорж · персонажи
   Жорж — чёрный эмалированный кофейник с белым «лицом», усами и крышкой-котелком.
   Чашки — белый фарфор с узорами; Кроха — самая маленькая, со сколом на ободке.
   Будильник — на подоконнике.
   Позы задаёт сценарий (story.js); здесь только рисование.
   ===================================================================== */

/* ---------- Жорж ---------- */
const J = {
  H: 144,
  body: [['M', 0, 0], ['L', 47, 0], ['Q', 60, 0, 60, -13], ['C', 62, -60, 52, -104, 41, -130], ['L', 44, -136], ['L', 44, -144],
    ['L', -44, -144], ['L', -44, -136], ['L', -41, -130], ['C', -52, -104, -62, -60, -60, -13], ['Q', -60, 0, -47, 0], ['Z']],
  spout: [['M', 56, -26], ['C', 84, -32, 95, -72, 99, -114], ['L', 110, -123], ['Q', 107, -132, 98, -133], ['L', 88, -125],
    ['C', 84, -96, 76, -77, 55, -72], ['Z']],
  handle: [[-55, -116], [-84, -110], [-95, -76], [-84, -46], [-58, -34]],
  mask: [['M', 0, -131], ['C', 23, -132, 37, -121, 39, -103], ['C', 41, -87, 51, -73, 51, -55], ['C', 51, -36, 31, -24, 0, -24],
    ['C', -31, -24, -51, -36, -51, -55], ['C', -51, -73, -41, -87, -39, -103], ['C', -37, -121, -23, -132, 0, -131], ['Z']],
  specks: [[-48, -8], [-30, -12], [-12, -6], [8, -13], [27, -7], [44, -12], [-55, -27], [55, -31], [-56, -46], [57, -52],
    [-51, -80], [50, -84], [-44, -112], [45, -110], [-36, -138], [30, -139], [2, -139], [-18, -141], [-52, -64], [53, -68]],
  tip: [106, -128],
  shoulder: 50, shoulderY: -96,
};

function makeJ(x, y) {
  return {
    x, y, s: 1, sq: 0, bend: 0, rot: 0, hip: 44, breath: 0, face: 0, flip: 1, turn: 1,
    eye: { open: 1, lx: 0, ly: 0, size: 1, pupil: 1, mad: 0, sad: 0, shut: 'happy', wL: 0, wR: 0, cross: 0 },
    mouth: { type: 'smile', open: 0 },
    stache: 0, blush: 0,
    lid: { dx: 0, dy: 0, rot: 0, free: 0, pivot: 0 },
    perc: 0,
    arms: [
      { x: -20, y: 62, pose: 'open', len: 88, bend: 0, world: false, ang: null, back: false, ctrl: null },
      { x: 20, y: 62, pose: 'open', len: 88, bend: 0, world: false, ang: null, back: false, ctrl: null },
    ],
    legs: [
      { x: -27, y: 0, ang: 0, len: 48, bend: 0, world: false },
      { x: 27, y: 0, ang: 0, len: 48, bend: 0, world: false },
    ],
    shadow: true, ground: y, armsLate: false,
  };
}

/** Мировые координаты точки тела Жоржа (например, носика — для пара и струи). */
function jPoint(P, lx, ly) { return rigMap(P, J.H)(lx, ly); }

function jHand(P, i, map) {
  const a = P.arms[i];
  const sh = map(i === 0 ? -J.shoulder : J.shoulder, J.shoulderY);
  if (a.world) return [sh, [a.x, a.y]];
  const c = Math.cos(P.rot), sn = Math.sin(P.rot);
  const ox = a.x * P.flip * P.s, oy = a.y * P.s;
  return [sh, [sh[0] + ox * c - oy * sn, sh[1] + ox * sn + oy * c]];
}

function drawJArms(ctx, P, map, lw, back) {
  for (let i = 0; i < 2; i++) {
    const a = P.arms[i];
    if (!!a.back !== back) continue;
    const [sh, h] = jHand(P, i, map);
    const side = (i === 0 ? -1 : 1) * P.flip;
    const bend = a.bend || outBend(side, h[0] - sh[0], h[1] - sh[1]);
    const ang = hose(ctx, sh[0], sh[1], h[0], h[1], a.len * P.s, bend, 7.6 * P.s, a.ctrl);
    glove(ctx, h[0], h[1], a.ang != null ? a.ang : ang, a.pose, 10.5 * P.s, a.gs || side, lw);
  }
}

function drawJLegs(ctx, P, map, lw) {
  for (let i = 0; i < 2; i++) {
    const L = P.legs[i];
    const side = (i === 0 ? -1 : 1) * P.flip;
    const hip = map(i === 0 ? -23 : 23, -4);
    const fx = L.world ? L.x : P.x + L.x * P.flip * P.s, fy = L.world ? L.y : P.y + L.y * P.s;
    const ay = fy - 7.6 * P.s;
    hose(ctx, hip[0], hip[1], fx, ay, L.len * P.s, L.bend || outBend(side, fx - hip[0], ay - hip[1], -0.1), 8.2 * P.s);
    shoe(ctx, fx, ay, -(L.ang || 0) * side, 12.5 * P.s, side, lw);
  }
}

function drawJLid(ctx, P, map, lw) {
  const L = P.lid, s = P.s;
  const a = map(-44, -144), b = map(44, -144);
  const angBody = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const wB = Math.hypot(b[0] - a[0], b[1] - a[1]) / (88 * s);
  const sx = lerp(wB, 1, L.free), sy = lerp(Math.max(0.3, 1 + P.sq), 1, L.free);
  const base = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  ctx.save();
  ctx.translate(base[0] + L.dx * s, base[1] + L.dy * s);
  ctx.rotate(angBody);
  ctx.translate(L.pivot * s, 0); ctx.rotate(L.rot); ctx.translate(-L.pivot * s, 0);
  ctx.scale(s * sx, s * sy);
  const w = lw / s;
  // купол-котелок
  ctx.beginPath(); ctx.moveTo(-41, -5); ctx.bezierCurveTo(-41, -34, 41, -34, 41, -5); ctx.closePath(); paint(ctx, BODY, w);
  // поля
  ctx.beginPath(); rrect(ctx, -50, -8, 100, 9, 4.5); paint(ctx, BODY, w);
  // шейка и стеклянная «пуговка» перколятора
  ctx.beginPath(); ctx.rect(-7, -32, 14, 7); paint(ctx, BODY, w);
  ctx.save();
  ctx.beginPath(); circ(ctx, 0, -42, 11); ctx.fillStyle = T[2]; ctx.fill(); ctx.clip();
  if (P.perc > 0.01) {
    const lv = -42 + 11 - 22 * clamp(P.perc);
    ctx.beginPath(); ctx.moveTo(-12, lv + Math.sin(P.x * 0.1) * 1.2);
    ctx.quadraticCurveTo(0, lv - 3, 12, lv); ctx.lineTo(12, -30); ctx.lineTo(-12, -30); ctx.closePath();
    ctx.fillStyle = T[8]; ctx.fill();
  }
  ctx.restore();
  ctx.beginPath(); circ(ctx, 0, -42, 11); ctx.lineWidth = w; ctx.strokeStyle = INK; ctx.stroke();
  ctx.beginPath(); ell(ctx, -3.8, -46, 3.2, 2.2, -0.5); ctx.fillStyle = PAPER; ctx.fill();
  // блики на эмали
  ctx.beginPath(); ctx.moveTo(-27, -12); ctx.quadraticCurveTo(-22, -23, -9, -26);
  ctx.lineWidth = 3.2; ctx.strokeStyle = T[5]; ctx.lineCap = 'round'; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-38, -3.5); ctx.lineTo(-18, -3.5); ctx.lineWidth = 2; ctx.strokeStyle = T[6]; ctx.stroke();
  ctx.restore();
}

function drawJFace(ctx, P, map, lw) {
  const fx = P.face * 8, s = P.s;
  const fmap = (x, y) => map(x + fx * (1 - Math.min(1, Math.abs(x) / 75)), y);
  ctx.beginPath(); tracePath(ctx, J.mask, fmap); paint(ctx, PAPER, lw);
  const w = lw / s;
  const E = P.eye;
  // румянец (при сильном — темнеет всё лицо)
  if (P.blush > 0.01) {
    ctx.save(); ctx.beginPath(); tracePath(ctx, J.mask, fmap); ctx.clip();
    if (P.blush > 0.6) { ctx.fillStyle = `rgba(122,116,107,${((P.blush - 0.6) * 1.6).toFixed(3)})`; ctx.fill(); }
    withFrame(ctx, fmap, 0, -58, () => {
      ctx.fillStyle = `rgba(150,143,132,${(Math.min(1, P.blush) * 0.85).toFixed(3)})`;
      for (const sd of [-1, 1]) { ctx.beginPath(); ell(ctx, sd * 33, 2, 10, 6.5); ctx.fill(); }
    });
    ctx.restore();
  }
  // глаза
  withFrame(ctx, fmap, 0, -101, () => {
    const sz = E.size || 1;
    const order = P.face > 0 ? [-1, 1] : [1, -1];
    for (const sd of order) {
      const wink = sd < 0 ? E.wL : E.wR;
      const far = (P.face || 0) * sd < 0 ? 1 - Math.abs(P.face) * 0.12 : 1;
      pieEye(ctx, sd * 14.5 * sz, 0, 13.5 * sz * far, 22 * sz, {
        open: (E.open == null ? 1 : E.open) * (1 - (wink || 0)),
        lx: clamp((E.lx || 0) + (E.cross || 0) * -sd), ly: E.ly || 0, pupil: E.pupil, mad: E.mad, sad: E.sad,
        shut: wink > 0.5 ? 'happy' : E.shut,
      }, w, sd, PAPER);
    }
  });
  // нос, усы, рот
  withFrame(ctx, fmap, 0, -62, () => {
    ctx.beginPath(); ell(ctx, 0, -11, 8.5, 6.5); ctx.fillStyle = INK; ctx.fill();
    ctx.beginPath(); ell(ctx, -2.8, -13.2, 2.4, 1.6); ctx.fillStyle = PAPER; ctx.fill();
    ctx.save(); ctx.translate(0, 13); mouthShape(ctx, P.mouth, 44, w); ctx.restore();
    const st = P.stache || 0;
    for (const sd of [-1, 1]) {
      const cu = st * sd;
      taper(ctx, [[0, -5], [sd * 10, -2.5], [sd * 21, -3], [sd * 29, -8 - cu * 2], [sd * 32, -15 - cu * 3], [sd * 28.5, -19 - cu * 3], [sd * 25, -16 - cu * 2]], 8.5, 1.4);
    }
  });
}

function drawJorzh(ctx, P, t, part) {
  const lw = 3.3 * LWF;
  const fr = Math.floor(t * 12 + 1e-4);
  const Q = Object.assign({}, P, { x: P.x + (hash2(fr, 11) - 0.5) * 0.8, y: P.y + (hash2(fr, 12) - 0.5) * 0.8 });
  const map = rigMap(Q, J.H);
  if (part === 'arms') { drawJArms(ctx, Q, map, lw, false); return; }
  if (P.shadow) shadowAt(ctx, P.x, P.ground, 64 * P.s, P.y);
  drawJArms(ctx, Q, map, lw, true);
  drawJLegs(ctx, Q, map, lw);
  // ручка
  const hp = catmull(J.handle.map((p) => map(p[0], p[1])), 5);
  ctx.beginPath(); ctx.moveTo(hp[0][0], hp[0][1]);
  for (let i = 1; i < hp.length; i++) ctx.lineTo(hp[i][0], hp[i][1]);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.lineWidth = 14 * P.s + lw; ctx.strokeStyle = INK; ctx.stroke();
  ctx.lineWidth = 14 * P.s - lw; ctx.strokeStyle = BODY; ctx.stroke();
  ctx.lineWidth = 2.6 * P.s; ctx.strokeStyle = T[6]; ctx.stroke();
  // носик и тело
  ctx.beginPath(); tracePath(ctx, J.spout, map); paint(ctx, BODY, lw);
  ctx.beginPath(); tracePath(ctx, J.body, map); paint(ctx, BODY, lw);
  // крапинки эмали и блики
  ctx.fillStyle = T[4];
  for (const sp of J.specks) { const p = map(sp[0], sp[1]); ctx.beginPath(); circ(ctx, p[0], p[1], 1.5 * P.s); ctx.fill(); }
  const hl = [map(-53, -28), map(-52, -62), map(-47, -98)];
  ctx.beginPath(); ctx.moveTo(hl[0][0], hl[0][1]); ctx.quadraticCurveTo(hl[1][0], hl[1][1], hl[2][0], hl[2][1]);
  ctx.lineWidth = 3.4 * P.s; ctx.strokeStyle = T[4]; ctx.lineCap = 'round'; ctx.stroke();
  const sp1 = map(84, -60), sp2 = map(93, -100);
  line(ctx, sp1[0], sp1[1], sp2[0], sp2[1], 2.4 * P.s, T[5]);
  if (!P.back) drawJFace(ctx, Q, map, lw);
  drawJLid(ctx, Q, map, lw);
  if (!P.armsLate) drawJArms(ctx, Q, map, lw, false);
}

/* ---------- чашки ---------- */
const CUP = {
  H: 70, rimY: -70, rimRX: 43, rimRY: 9, face: -40, eyeX: 10.5, eyeRX: 8.5, eyeRY: 12.5, mouthY: 21, shoulder: 38, shoulderY: -44,
  bowl: [['M', -16, 0], ['L', 16, 0], ['L', 18, -6], ['C', 35, -11, 43, -40, 43, -70], ['L', -43, -70], ['C', -43, -40, -35, -11, -18, -6], ['Z']],
  handle: [[41, -58], [60, -58], [62, -38], [48, -26], [35, -23]],
};
const KRO = {
  H: 64, rimY: -64, rimRX: 36, rimRY: 8, face: -37, eyeX: 11, eyeRX: 10.5, eyeRY: 15.5, mouthY: 22, shoulder: 33, shoulderY: -40,
  bowl: [['M', -17, 0], ['L', 17, 0], ['L', 19, -5], ['C', 32, -8, 36, -30, 36, -64], ['L', -36, -64], ['C', -36, -30, -32, -8, -19, -5], ['Z']],
  handle: [[35, -52], [51, -52], [53, -35], [42, -23], [31, -20]],
};

function makeCup(x, y, s, kind) {
  return {
    x, y, s, kind, sq: 0, bend: 0, rot: 0, hip: 30, breath: 0, flip: 1, turn: 1,
    eye: { open: 1, lx: 0, ly: 0, size: 1, pupil: 1, mad: 0, sad: 0, shut: 'happy', wL: 0, wR: 0 },
    mouth: { type: 'smile', open: 0 },
    blush: 0, fill: 0, tear: 0,
    arms: [
      { x: -12, y: 32, pose: 'open', len: 46, bend: 0, world: false, ang: null, back: false },
      { x: 12, y: 32, pose: 'open', len: 46, bend: 0, world: false, ang: null, back: false },
    ],
    legs: [
      { x: -14, y: 0, ang: 0, len: 32, bend: 0, world: false },
      { x: 14, y: 0, ang: 0, len: 32, bend: 0, world: false },
    ],
    shadow: true, ground: y,
  };
}

function cupShoulder(Cp, i) {
  const D = Cp.kind === 'kro' ? KRO : CUP;
  return rigMap(Cp, D.H)(i === 0 ? -D.shoulder : D.shoulder, D.shoulderY);
}

function drawCupArms(ctx, Cp, D, map, lw, back) {
  for (let i = 0; i < 2; i++) {
    const a = Cp.arms[i];
    if (!!a.back !== back) continue;
    const sh = map(i === 0 ? -D.shoulder : D.shoulder, D.shoulderY);
    let h;
    if (a.world) h = [a.x, a.y];
    else {
      const c = Math.cos(Cp.rot), sn = Math.sin(Cp.rot), ox = a.x * Cp.flip * Cp.s, oy = a.y * Cp.s;
      h = [sh[0] + ox * c - oy * sn, sh[1] + ox * sn + oy * c];
    }
    const side = (i === 0 ? -1 : 1) * Cp.flip;
    const ang = hose(ctx, sh[0], sh[1], h[0], h[1], a.len * Cp.s, a.bend || outBend(side, h[0] - sh[0], h[1] - sh[1]), 4.8 * Cp.s);
    glove(ctx, h[0], h[1], a.ang != null ? a.ang : ang, a.pose, 7.4 * Cp.s, a.gs || side, lw * 0.9);
  }
}

function cupPattern(ctx, Cp, D, w) {
  ctx.strokeStyle = INK; ctx.fillStyle = INK;
  // полоса под ободком — повторяет изгиб края
  ctx.beginPath(); ctx.ellipse(0, D.rimY + 8, D.rimRX - 0.5, D.rimRY, 0, 0, Math.PI);
  ctx.lineWidth = 4.2; ctx.stroke();
  const k = Cp.kind;
  if (k === 0) {        // горошек
    for (const p of [[-30, -22], [-14, -12], [4, -20], [22, -12], [34, -26], [-24, -40], [30, -44], [-6, -34]]) {
      ctx.beginPath(); circ(ctx, p[0], p[1], 3.2); ctx.fill();
    }
  } else if (k === 1) { // полоски
    ctx.lineWidth = 2.2;
    for (let i = -3; i <= 3; i++) {
      const x = i * 11;
      ctx.beginPath(); ctx.moveTo(x * 1.02, D.rimY + 14); ctx.quadraticCurveTo(x * 1.08, -30, x * 0.5, -6); ctx.stroke();
    }
  } else if (k === 2) { // шашечки в поясе
    for (let i = -4; i < 4; i++) {
      const x = i * 10 + 5, y = -30 + Math.abs(x) * 0.08;
      ctx.fillRect(x - 3.5 + (i % 2) * 0, y - (i % 2 ? 0 : 7), 7, 7);
    }
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.ellipse(0, -40, 40, 6, 0, 0.15, Math.PI - 0.15); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, -17, 34, 6, 0, 0.2, Math.PI - 0.2); ctx.stroke();
  } else if (k === 3) { // ромашки
    for (const p of [[-24, -22, 6], [16, -16, 5], [30, -40, 4.5], [-8, -40, 4]]) {
      for (let i = 0; i < 5; i++) {
        const an = i / 5 * TAU;
        ctx.beginPath(); ell(ctx, p[0] + Math.cos(an) * p[2] * 0.75, p[1] + Math.sin(an) * p[2] * 0.75, p[2] * 0.5, p[2] * 0.32, an);
        ctx.lineWidth = 1.3; ctx.stroke();
      }
      ctx.beginPath(); circ(ctx, p[0], p[1], p[2] * 0.3); ctx.fill();
    }
  }
}

function drawCup(ctx, Cp, t) {
  const kro = Cp.kind === 'kro';
  const D = kro ? KRO : CUP;
  const lw = 3 * LWF;
  const fr = Math.floor(t * 12 + 1e-4);
  const seed = kro ? 91 : 30 + (Cp.kind | 0);
  const Q = Object.assign({}, Cp, { x: Cp.x + (hash2(fr, seed) - 0.5) * 0.7, y: Cp.y + (hash2(fr, seed + 1) - 0.5) * 0.7 });
  const map = rigMap(Q, D.H);
  const s = Cp.s, w = lw / s;
  if (Cp.shadow) shadowAt(ctx, Cp.x, Cp.ground, 44 * s, Cp.y);
  drawCupArms(ctx, Q, D, map, lw, true);
  // ноги
  for (let i = 0; i < 2; i++) {
    const L = Q.legs[i], side = (i === 0 ? -1 : 1) * Q.flip;
    const hip = map(i === 0 ? -11 : 11, 3);
    const fx = L.world ? L.x : Q.x + L.x * Q.flip * s, fy = (L.world ? L.y : Q.y + L.y * s) - 5 * s;
    hose(ctx, hip[0], hip[1], fx, fy, L.len * s, L.bend || outBend(side, fx - hip[0], fy - hip[1], -0.1), 5.4 * s);
    shoe(ctx, fx, fy, -(L.ang || 0) * side, 8 * s, side, lw * 0.9);
  }
  // блюдце-юбочка
  withFrame(ctx, map, 0, 2, () => {
    ctx.beginPath(); ell(ctx, 0, 0, D.rimRX + 4, 7.5); paint(ctx, PAPER, w);
    ctx.beginPath(); ell(ctx, 0, -0.5, D.rimRX - 12, 4.2); ctx.lineWidth = w * 0.6; ctx.strokeStyle = T[4]; ctx.stroke();
  });
  // ручка
  const hp = catmull(D.handle.map((p) => map(p[0], p[1])), 5);
  ctx.beginPath(); ctx.moveTo(hp[0][0], hp[0][1]);
  for (let i = 1; i < hp.length; i++) ctx.lineTo(hp[i][0], hp[i][1]);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.lineWidth = 10 * s + lw; ctx.strokeStyle = INK; ctx.stroke();
  ctx.lineWidth = 10 * s - lw; ctx.strokeStyle = PAPER; ctx.stroke();
  // чаша
  ctx.beginPath(); tracePath(ctx, D.bowl, map); paint(ctx, PAPER, lw);
  ctx.save(); ctx.beginPath(); tracePath(ctx, D.bowl, map); ctx.clip();
  withFrame(ctx, map, 0, 0, () => {
    if (!kro) cupPattern(ctx, Cp, D, w);
    // тень на боку чаши
    ctx.beginPath(); ctx.moveTo(D.rimRX - 6, D.rimY); ctx.quadraticCurveTo(D.rimRX + 2, -24, 8, 2); ctx.lineTo(60, 2); ctx.lineTo(60, D.rimY); ctx.closePath();
    ctx.fillStyle = 'rgba(120,112,100,0.22)'; ctx.fill();
  });
  ctx.restore();
  // ободок, внутренность, кофе
  withFrame(ctx, map, 0, D.rimY, () => {
    ctx.beginPath(); ell(ctx, 0, 0, D.rimRX, D.rimRY); paint(ctx, PAPER, w);
    ctx.save(); ctx.beginPath(); ell(ctx, 0, 0.6, D.rimRX - 4.5, D.rimRY - 2.2); ctx.clip();
    ctx.fillStyle = T[4]; ctx.fillRect(-60, -20, 120, 40);
    ctx.beginPath(); ell(ctx, 0, -D.rimRY * 0.9, D.rimRX - 2, D.rimRY * 0.9); ctx.fillStyle = T[2]; ctx.fill();
    if (Cp.fill > 0.01) {
      const f = clamp(Cp.fill);
      ctx.beginPath(); ell(ctx, 0, 0.6 + (1 - f) * 3.5, (D.rimRX - 4.5) * (0.82 + 0.18 * f), (D.rimRY - 2.2) * (0.8 + 0.2 * f));
      ctx.fillStyle = T[8]; ctx.fill();
      ctx.beginPath(); ell(ctx, -D.rimRX * 0.3, -0.5 + (1 - f) * 3, D.rimRX * 0.22 * f, 1.2); ctx.fillStyle = T[5]; ctx.fill();
    }
    ctx.restore();
    ctx.beginPath(); ell(ctx, 0, 0.6, D.rimRX - 4.5, D.rimRY - 2.2); ctx.lineWidth = w * 0.7; ctx.strokeStyle = INK; ctx.stroke();
    if (kro) {
      // скол на ободке и трещинка
      ctx.beginPath(); ctx.moveTo(15, D.rimRY * 0.93); ctx.lineTo(19.5, D.rimRY * 0.93 + 5.5); ctx.lineTo(24, D.rimRY * 0.72);
      ctx.closePath(); ctx.fillStyle = T[4]; ctx.fill();
      ctx.lineWidth = w * 0.8; ctx.strokeStyle = INK;
      ctx.beginPath(); ctx.moveTo(14.5, D.rimRY * 0.95); ctx.lineTo(19.5, D.rimRY * 0.93 + 5.5); ctx.lineTo(24.5, D.rimRY * 0.7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(19.5, D.rimRY + 5.5); ctx.lineTo(22, D.rimRY + 11); ctx.lineTo(19.8, D.rimRY + 15); ctx.lineTo(23, D.rimRY + 21);
      ctx.lineWidth = w * 0.55; ctx.stroke();
    }
  });
  // лицо
  withFrame(ctx, map, 0, D.face, () => {
    const E = Cp.eye, sz = E.size || 1;
    if (Cp.blush > 0.01) {
      ctx.fillStyle = `rgba(150,143,132,${(Math.min(1, Cp.blush) * 0.85).toFixed(3)})`;
      for (const sd of [-1, 1]) { ctx.beginPath(); ell(ctx, sd * (D.eyeX + 13), D.eyeRY * 0.9, 6.5, 4); ctx.fill(); }
    }
    for (const sd of [-1, 1]) {
      const wink = sd < 0 ? E.wL : E.wR;
      const ex = sd * D.eyeX * sz, rx = D.eyeRX * sz, ry = D.eyeRY * sz;
      const op = (E.open == null ? 1 : E.open) * (1 - (wink || 0));
      pieEye(ctx, ex, 0, rx, ry, { open: op, lx: E.lx, ly: E.ly, pupil: E.pupil, mad: E.mad, sad: E.sad, shut: wink > 0.5 ? 'happy' : E.shut }, w * 0.95, sd, PAPER);
      // ресницы
      if (op > 0.12) {
        for (let j = 0; j < 3; j++) {
          const an = -Math.PI / 2 + sd * (0.35 + j * 0.32);
          const px = ex + Math.cos(an) * rx, py = Math.sin(an) * ry;
          line(ctx, px, py, px + Math.cos(an) * 4.6, py + Math.sin(an) * 4.6 - 1, w * 0.85);
        }
      }
    }
    if (Cp.tear > 0.01) {
      ctx.save(); ctx.globalAlpha = clamp(Cp.tear);
      ctx.beginPath(); ctx.moveTo(-D.eyeX - 4, D.eyeRY * 0.9 + Cp.tear * 8);
      ctx.quadraticCurveTo(-D.eyeX - 8, D.eyeRY * 0.9 + 6 + Cp.tear * 8, -D.eyeX - 4, D.eyeRY * 0.9 + 9 + Cp.tear * 8);
      ctx.quadraticCurveTo(-D.eyeX, D.eyeRY * 0.9 + 6 + Cp.tear * 8, -D.eyeX - 4, D.eyeRY * 0.9 + Cp.tear * 8);
      paint(ctx, PAPER, w * 0.7);
      ctx.restore();
    }
    ctx.save(); ctx.translate(0, D.mouthY); mouthShape(ctx, Cp.mouth, kro ? 18 : 21, w); ctx.restore();
  });
  // бантик на ручке у Крохи
  if (kro) {
    const bp = map(42, -53);
    ctx.save(); ctx.translate(bp[0], bp[1]); ctx.rotate(Cp.rot + 0.2); ctx.scale(s, s);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-11, -8); ctx.lineTo(-11, 7); ctx.closePath(); paint(ctx, INK, w);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(11, -8); ctx.lineTo(11, 7); ctx.closePath(); paint(ctx, INK, w);
    ctx.beginPath(); circ(ctx, 0, 0, 3.4); ctx.fillStyle = INK; ctx.fill();
    ctx.beginPath(); ctx.moveTo(-8, -4); ctx.lineTo(-4, -1); ctx.lineWidth = 1.2; ctx.strokeStyle = T[5]; ctx.stroke();
    ctx.restore();
  }
  drawCupArms(ctx, Q, D, map, lw, false);
}

/* ---------- будильник ---------- */
function makeAlarm(x, y) {
  return { x, y, s: 0.9, rot: 0, sx: 1, sy: 1, jx: 0, jy: 0, ring: 0, awake: 0, dizzy: 0, sleep: 1, min: 58, hour: 6, open: 0 };
}

function drawAlarm(ctx, A, t) {
  const lw = 2.9 * LWF;
  ctx.save();
  ctx.translate(A.x + A.jx, A.y + A.jy); ctx.rotate(A.rot); ctx.scale(A.s * A.sx, A.s * A.sy);
  const w = lw / A.s;
  shadowAt(ctx, 0, 0, 40, 0);
  // ножки
  for (const sd of [-1, 1]) {
    line(ctx, sd * 15, -14, sd * 23, -3, 6);
    ctx.beginPath(); ell(ctx, sd * 25, -2, 7, 4); ctx.fillStyle = INK; ctx.fill();
  }
  // звонки (при звоне — «множители»: дрожащие копии)
  const copies = A.ring > 0 ? [-1, 0, 1] : [0];
  for (const cp of copies) {
    ctx.save(); ctx.globalAlpha = cp === 0 ? 1 : 0.35;
    for (const sd of [-1, 1]) {
      ctx.save(); ctx.translate(sd * 23 + cp * 5 * sd, -78 + Math.abs(cp) * 2); ctx.rotate(sd * 0.5 + cp * 0.2);
      ctx.beginPath(); ctx.moveTo(-17, 5); ctx.bezierCurveTo(-17, -20, 17, -20, 17, 5); ctx.closePath(); paint(ctx, BODY, w);
      ctx.beginPath(); ctx.moveTo(-9, -4); ctx.quadraticCurveTo(-6, -11, 1, -12); ctx.lineWidth = 2.2; ctx.strokeStyle = T[5]; ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
  const hx = A.ring > 0 ? Math.sin(t * TAU * 11) * 9 : 0;
  line(ctx, 0, -76, hx, -93, 3.2);
  ctx.beginPath(); circ(ctx, hx, -94, 4.5); ctx.fillStyle = INK; ctx.fill();
  ctx.beginPath(); ctx.arc(0, -84, 13, Math.PI * 1.1, Math.PI * 1.9); ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.stroke();
  // корпус и циферблат
  ctx.beginPath(); circ(ctx, 0, -44, 36); paint(ctx, BODY, w);
  ctx.beginPath(); circ(ctx, 0, -44, 29); paint(ctx, PAPER, w * 0.8);
  for (let i = 0; i < 12; i++) {
    const an = i / 12 * TAU;
    const r0 = i % 3 === 0 ? 21 : 24;
    line(ctx, Math.cos(an) * r0, -44 + Math.sin(an) * r0, Math.cos(an) * 27, -44 + Math.sin(an) * 27, i % 3 === 0 ? 2.6 : 1.4);
  }
  const ma = A.min / 60 * TAU - Math.PI / 2, ha = (A.hour + A.min / 60) / 12 * TAU - Math.PI / 2;
  line(ctx, 0, -44, Math.cos(ha) * 14, -44 + Math.sin(ha) * 14, 3.4);
  line(ctx, 0, -44, Math.cos(ma) * 22, -44 + Math.sin(ma) * 22, 2.2);
  ctx.beginPath(); circ(ctx, 0, -44, 3); ctx.fillStyle = INK; ctx.fill();
  // лицо проявляется, когда будильник «просыпается»
  if (A.awake > 0.01) {
    ctx.save(); ctx.globalAlpha = clamp(A.awake);
    if (A.dizzy > 0.5) {
      for (const sd of [-1, 1]) {
        ctx.beginPath();
        for (let i = 0; i <= 40; i++) { const an = i * 0.45 + t * 9 * sd, r = i * 0.2; ctx.lineTo(sd * 9 + Math.cos(an) * r, -53 + Math.sin(an) * r * 1.3); }
        ctx.lineWidth = 1.6; ctx.strokeStyle = INK; ctx.stroke();
      }
      ctx.save(); ctx.translate(0, -30); mouthShape(ctx, { type: 'wavy' }, 18, w); ctx.restore();
    } else {
      for (const sd of [-1, 1]) pieEye(ctx, sd * 8.5, -53, 7, 10.5, { open: 1, pupil: 0.8, lx: 0, ly: 0.2 }, w * 0.8, sd, PAPER);
      ctx.save(); ctx.translate(0, -34); mouthShape(ctx, { type: 'O', open: A.open }, 22, w * 0.9); ctx.restore();
    }
    ctx.restore();
  }
  ctx.restore();
}
