'use strict';
/* ==========================================================================
   Персонажи: скелетная анимация в палехской манере.
   Человек (Иван, братья, царь, Елена, стража), четвероногие (волк, кони),
   Жар-птица, перо с живым огнём, крупный план Ивана.
   Все фигуры рисуются лицом вправо; dir = −1 зеркалит.
   ========================================================================== */

/* ---------- мелочи ---------- */
const dirv = (a) => [Math.sin(a), Math.cos(a)]; // 0 — вниз, +π/2 — вперёд
const addv = (p, d, l) => [p[0] + d[0] * l, p[1] + d[1] * l];
const midv = (a, b, u = 0.5) => [lerp(a[0], b[0], u), lerp(a[1], b[1], u)];
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
/* Капсула-конечность от A до B с ширинами wA, wB */
function limb(path, A, B, wA, wB) {
  let dx = B[0] - A[0], dy = B[1] - A[1];
  const l = Math.hypot(dx, dy) || 0.001; dx /= l; dy /= l;
  const nx = -dy, ny = dx, ad = Math.atan2(dy, dx);
  path.moveTo(A[0] + nx * wA / 2, A[1] + ny * wA / 2);
  path.lineTo(B[0] + nx * wB / 2, B[1] + ny * wB / 2);
  path.arc(B[0], B[1], wB / 2, ad + PI / 2, ad - PI / 2, true);
  path.lineTo(A[0] - nx * wA / 2, A[1] - ny * wA / 2);
  path.arc(A[0], A[1], wA / 2, ad - PI / 2, ad - 3 * PI / 2, true);
  path.closePath();
  return path;
}
function fillPath(ctx, path, style, a = 1) { ctx.globalAlpha = a; ctx.fillStyle = style; ctx.fill(path); ctx.globalAlpha = 1; }
/* Штрих кистью прямо на холст (для живых фигур) */
function brushLine(ctx, pts, w, style, prof = Prof.hair, rev = 1) {
  // тонкие ровные линии — обычным штрихом: это в разы дешевле полигона кисти
  if ((prof === Prof.hair || prof === Prof.even) && rev >= 1) {
    ctx.beginPath();
    hairPath(ctx, pts);
    ctx.lineWidth = prof === Prof.hair ? w * 0.8 : w;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = style; ctx.stroke();
    return;
  }
  const p = new Path2D();
  strokeInto(p, mkStroke(pts, w, { prof, seg: 4 }), rev);
  ctx.fillStyle = style; ctx.fill(p);
}
/* Путь из точек, гладкий */
function sp(P, closed = true) { return polyPath(spline(P, 5, closed), new Path2D(), closed); }

/* ==========================================================================
   ЧЕЛОВЕК
   ========================================================================== */
const HUM = { thigh: 24, shin: 23, torso: 30, neck: 4.2, uarm: 16.5, farm: 14.5, hand: 5.6 };
const STAND_H = 50; // таз над землёй при прямых ногах (в единицах роста 100)

// Позы: углы в радианах. torso — наклон вперёд; sF, eF — плечо и локоть; hF, kF — бедро и колено
const POSE = {
  stand: { torso: 0.02, neck: 0.04, head: 0.02, sF: 0.1, eF: 0.18, wF: 0.1, sB: -0.08, eB: 0.22, wB: 0.1, hF: 0.05, kF: 0.05, fF: 0, hB: -0.06, kB: 0.05, fB: 0, fist: 0, hem: 0, lookUp: 0 },
};
function pose(o) { return Object.assign({}, POSE.stand, o); }

/* Суставы в локальных координатах (таз — начало, лицом вправо) */
function humanJoints(po) {
  const J = {};
  const up = [Math.sin(po.torso), -Math.cos(po.torso)];
  J.up = up;
  J.waist = [up[0] * 7, up[1] * 7];
  J.neck = [up[0] * HUM.torso, up[1] * HUM.torso];
  J.sh = [J.neck[0] - up[0] * 3.4, J.neck[1] - up[1] * 3.4];
  const hn = po.torso + po.neck;
  J.head0 = addv(J.neck, [Math.sin(hn), -Math.cos(hn)], HUM.neck);
  J.headA = hn + po.head;
  J.headC = addv(J.head0, [Math.sin(J.headA), -Math.cos(J.headA)], 5.3);
  const fw = [Math.cos(po.torso), Math.sin(po.torso)]; // «вперёд» по корпусу
  J.fw = fw;
  const arm = (s, e, w, off) => {
    const S = [J.sh[0] + fw[0] * off, J.sh[1] + fw[1] * off];
    const a1 = po.torso + s, E = addv(S, dirv(a1), HUM.uarm);
    const a2 = a1 + e, Wr = addv(E, dirv(a2), HUM.farm);
    const a3 = a2 + w, Hn = addv(Wr, dirv(a3), HUM.hand);
    return { S, E, W: Wr, H: Hn, a1, a2, a3 };
  };
  J.armF = arm(po.sF, po.eF, po.wF, 1.3);
  J.armB = arm(po.sB, po.eB, po.wB, -1.6);
  const leg = (h, k, f, off) => {
    const Hp = [off, 0];
    const a1 = po.torso * 0.3 + h, K = addv(Hp, dirv(a1), HUM.thigh);
    const a2 = a1 - k, A = addv(K, dirv(a2), HUM.shin);
    const a3 = a2 + PI / 2 + f, T = addv(A, dirv(a3), 8.5);
    return { Hp, K, A, T, a1, a2, a3 };
  };
  J.legF = leg(po.hF, po.kF, po.fF, 1.2);
  J.legB = leg(po.hB, po.kB, po.fB, -1.4);
  return J;
}

/* Костюмы */
const COSTUME = {
  ivan: { kaftan: C.cin, kaftanHi: '#e2553a', trim: 'gold', pants: C.lap, boots: C.och, belt: C.em, hat: 'cap', hatCol: C.cin, fur: '#3b2413', hair: '#3a2213', skin: C.skin, long: 0 },
  dmitri: { kaftan: C.em, kaftanHi: '#3c9a6a', trim: 'gold', pants: C.och, boots: '#8c3b1c', belt: C.cin, hat: 'cap', hatCol: C.em, fur: '#2c1a0e', hair: '#2a1a0f', skin: C.skin, long: 0 },
  vasili: { kaftan: C.lap, kaftanHi: '#4f78c0', trim: 'gold', pants: C.cin, boots: C.och, belt: C.och, hat: 'cap', hatCol: C.lap, fur: '#3d2a1a', hair: '#5a3a1e', skin: C.skin, long: 0 },
  tsar: { kaftan: C.cin, kaftanHi: '#e2553a', trim: 'gold', pants: C.cin, boots: C.och, belt: 'gold', hat: 'crown', hatCol: C.cin, fur: '#efe6d6', hair: '#e8e0d0', skin: C.skin, long: 1, beard: '#ece4d4', collar: 1 },
  elena: { kaftan: C.em, kaftanHi: '#3c9a6a', trim: 'gold', pants: C.em, boots: C.cin, belt: 'gold', hat: 'kokoshnik', hatCol: C.cin, fur: C.cin, hair: '#4a2a14', skin: '#e9bd92', long: 1, sleeves: C.wht, braid: 1 },
  ivanBare: { kaftan: C.cin, kaftanHi: '#e2553a', trim: 'gold', pants: C.lap, boots: C.och, belt: C.em, hat: 'none', hatCol: C.cin, fur: '#3b2413', hair: '#3a2213', skin: C.skin, long: 0 },
  guard: { kaftan: C.och, kaftanHi: '#e0a95c', trim: 'gold', pants: C.em, boots: '#6b2e14', belt: C.cin, hat: 'helm', hatCol: '#c9c2b0', fur: '#2c1a0e', hair: '#2a1a0f', skin: C.skin, long: 0 },
};

function drawHuman(ctx, P, po, cos) {
  const J = humanJoints(po);
  const k = po.s / 100;
  ctx.save();
  ctx.translate(po.x, po.y);
  if (po.rot) ctx.rotate(po.rot);
  ctx.scale(k * (po.dir || 1), k);
  const line = 'rgba(38,18,8,0.75)';
  // дальняя рука и нога темнее
  drawArm(ctx, P, J.armB, cos, 0.72, po, true);
  drawLeg(ctx, P, J.legB, cos, 0.72, po);
  drawLeg(ctx, P, J.legF, cos, 1, po);
  drawKaftan(ctx, P, J, cos, po, line);
  drawHead(ctx, P, J, cos, po, line);
  drawArm(ctx, P, J.armF, cos, 1, po, false);
  ctx.restore();
  return J;
}

function drawLeg(ctx, P, L, cos, dk, po) {
  const path = new Path2D();
  limb(path, L.Hp, L.K, 7.2, 5.6);
  limb(path, L.K, L.A, 5.4, 3.8);
  fillPath(ctx, path, dk < 1 ? shade(cos.pants, dk) : cos.pants);
  // сапог: голенище и носок с загнутым мыском
  const b0 = midv(L.K, L.A, 0.42);
  const boot = new Path2D();
  limb(boot, b0, L.A, 5.2, 4.4);
  const fwd = dirv(L.a3), up = [-fwd[1], fwd[0]]; // вверх относительно стопы
  const heel = addv(addv(L.A, fwd, -2.6), up, -2.2);
  const toe = addv(addv(L.A, fwd, 9.6), up, 0.2);
  const tip = addv(addv(L.A, fwd, 11), up, 2.6);
  const P2 = [addv(L.A, up, 2.3), addv(addv(L.A, fwd, 4.5), up, 1.6), tip, toe, addv(addv(L.A, fwd, 5), up, -2.1), heel, addv(addv(L.A, fwd, -2.2), up, 1.2)];
  const foot = sp(P2);
  const bc = dk < 1 ? shade(cos.boots, dk) : cos.boots;
  fillPath(ctx, boot, bc); fillPath(ctx, foot, bc);
  ctx.globalAlpha = dk < 1 ? 0.6 : 1;
  brushLine(ctx, [addv(b0, dirv(L.a2 + PI / 2), -2.6), addv(b0, dirv(L.a2 + PI / 2), 2.6)], 1.1, P.gold, Prof.even);
  brushLine(ctx, [addv(L.A, up, 1.4), addv(addv(L.A, fwd, 6), up, 0.6), tip], 0.5, P.gold);
  ctx.globalAlpha = 1;
  void po;
}

function drawArm(ctx, P, A, cos, dk, po, back) {
  const kc = dk < 1 ? shade(cos.kaftan, dk) : cos.kaftan;
  const path = new Path2D();
  const sw = cos.sleeves ? 5.6 : 5.2;
  limb(path, A.S, A.E, sw + 0.6, sw);
  limb(path, A.E, A.W, sw, cos.sleeves ? 5 : 3.9);
  fillPath(ctx, path, cos.sleeves ? (dk < 1 ? shade('#efe4cc', dk) : cos.sleeves) : kc);
  ctx.globalAlpha = back ? 0.55 : 0.95;
  // золотой ассист по рукаву
  const n1 = dirv(A.a1 + PI / 2), n2 = dirv(A.a2 + PI / 2);
  brushLine(ctx, [addv(A.S, n1, 1.2), addv(midv(A.S, A.E), n1, 1.4), addv(A.E, n2, 1.1), addv(midv(A.E, A.W), n2, 0.8)], 0.45, P.gold);
  brushLine(ctx, [addv(A.S, n1, -1.6), addv(midv(A.S, A.E), n1, -1.2), addv(A.E, n2, -0.9)], 0.4, P.gold);
  // обшлаг
  const cuff = new Path2D();
  limb(cuff, midv(A.E, A.W, 0.8), A.W, 4.6, 4.4);
  fillPath(ctx, cuff, back ? shade('#b8863a', 0.8) : P.gold);
  ctx.globalAlpha = 1;
  // кисть
  const hc = dk < 1 ? shade(cos.skin.replace('#', '#'), dk) : cos.skin;
  const hand = new Path2D();
  if (po.fist && !back) {
    hand.arc(A.W[0] + dirv(A.a3)[0] * 2.6, A.W[1] + dirv(A.a3)[1] * 2.6, 2.6, 0, TAU);
  } else {
    const d = dirv(A.a3), n = [d[1], -d[0]];
    const tip = addv(A.W, d, HUM.hand);
    hand.moveTo(A.W[0] + n[0] * 1.5, A.W[1] + n[1] * 1.5);
    hand.quadraticCurveTo(tip[0] + n[0] * 1.9, tip[1] + n[1] * 1.9, tip[0], tip[1]);
    hand.quadraticCurveTo(tip[0] - n[0] * 1.3, tip[1] - n[1] * 1.3, A.W[0] - n[0] * 1.3, A.W[1] - n[1] * 1.3);
    hand.closePath();
    // большой палец
    const th = addv(addv(A.W, d, 2.2), n, 1.9);
    hand.moveTo(A.W[0] + n[0] * 1.2, A.W[1] + n[1] * 1.2);
    hand.quadraticCurveTo(th[0] + d[0] * 1.2, th[1] + d[1] * 1.2, th[0] + d[0] * 1.6 + n[0] * 0.6, th[1] + d[1] * 1.6 + n[1] * 0.6);
    hand.lineTo(A.W[0] + d[0] * 2.2, A.W[1] + d[1] * 2.2);
    hand.closePath();
  }
  fillPath(ctx, hand, hc);
}

function drawKaftan(ctx, P, J, cos, po, line) {
  const up = J.up, fw = J.fw;
  const W0 = J.waist;
  const hemLen = cos.long ? 1 : 0;
  // подол: следует за бёдрами, раздувается от движения
  const flare = 3.5 + (po.hem || 0) * 6;
  const kF = cos.long ? addv(J.legF.A, [0, 1], 1.5) : midv(J.legF.Hp, J.legF.K, 1.12);
  const kB = cos.long ? addv(J.legB.A, [0, 1], 1.5) : midv(J.legB.Hp, J.legB.K, 1.12);
  const HF = [kF[0] + 3.2 + flare * 0.5, kF[1] + 1.5 + hemLen * 1];
  const HB = [kB[0] - 3.4 - flare, kB[1] + 1.2 - (po.hem || 0) * 3.5];
  const WF = addv(W0, fw, 4.6), WB = addv(W0, fw, -4.8);
  const skirt = new Path2D();
  skirt.moveTo(WB[0], WB[1]);
  skirt.lineTo(WF[0], WF[1]);
  skirt.quadraticCurveTo(lerp(WF[0], HF[0], 0.5) + 2.5, lerp(WF[1], HF[1], 0.5), HF[0], HF[1]);
  const mid = [lerp(HF[0], HB[0], 0.5), Math.max(HF[1], HB[1]) + 2.5];
  skirt.quadraticCurveTo(mid[0], mid[1], HB[0], HB[1]);
  skirt.quadraticCurveTo(lerp(WB[0], HB[0], 0.45) - 2.5 - (po.hem || 0) * 3, lerp(WB[1], HB[1], 0.5), WB[0], WB[1]);
  skirt.closePath();
  fillPath(ctx, skirt, cos.kaftan);
  // тень задней полы
  const sh = new Path2D();
  sh.moveTo(W0[0], W0[1]);
  sh.lineTo(WB[0], WB[1]);
  sh.quadraticCurveTo(lerp(WB[0], HB[0], 0.45) - 2.5 - (po.hem || 0) * 3, lerp(WB[1], HB[1], 0.5), HB[0], HB[1]);
  sh.quadraticCurveTo(lerp(HB[0], mid[0], 0.6), mid[1] - 0.5, lerp(HF[0], HB[0], 0.45), lerp(HF[1], HB[1], 0.45) + 1.5);
  sh.closePath();
  fillPath(ctx, sh, 'rgba(40,8,4,0.28)');
  ctx.lineWidth = 0.35; ctx.strokeStyle = line; ctx.stroke(skirt);
  // золотой ассист по подолу: веер от пояса
  ctx.globalAlpha = 0.95;
  for (let i = 0; i < 5; i++) {
    const u = (i + 0.5) / 5;
    const top = midv(WB, WF, u), bot = [lerp(HB[0], HF[0], u), lerp(HB[1], HF[1], u) + Math.sin(PI * u) * 2.2];
    brushLine(ctx, [addv(top, [0, 1], 2.5), midv(top, bot, 0.55), addv(bot, [0, -1], 1.6)], 0.42, P.gold);
  }
  // кайма подола
  brushLine(ctx, [HF, [mid[0], mid[1] - 1.3], HB], 1.1, P.gold, Prof.even);
  brushLine(ctx, [WF, [lerp(WF[0], HF[0], 0.5) + 2.1, lerp(WF[1], HF[1], 0.5)], HF], 0.9, P.gold, Prof.even);
  ctx.globalAlpha = 1;
  // корпус
  const NB = J.sh, sw = 6.4, ww = 4.7;
  const nrm = fw;
  const torso = sp([
    addv(W0, nrm, -ww), addv(midv(W0, NB, 0.5), nrm, -ww - 0.8), addv(NB, nrm, -sw + 0.5), addv(addv(NB, up, 2.6), nrm, -sw * 0.5),
    addv(J.neck, up, 0.2), addv(addv(NB, up, 2.4), nrm, sw * 0.6), addv(NB, nrm, sw - 0.3), addv(midv(W0, NB, 0.45), nrm, ww + 1.6), addv(W0, nrm, ww),
  ]);
  fillPath(ctx, torso, cos.kaftan);
  ctx.lineWidth = 0.35; ctx.strokeStyle = line; ctx.stroke(torso);
  // грудь: светлая пола и застёжка
  ctx.globalAlpha = 0.9;
  brushLine(ctx, [addv(W0, nrm, 2.2), addv(midv(W0, NB, 0.5), nrm, 3.4), addv(NB, nrm, 2.2), addv(J.neck, nrm, 1)], 0.9, P.gold, Prof.even);
  for (let i = 1; i < 4; i++) {
    const p = addv(midv(W0, NB, i / 4.2), nrm, 1.6 + i * 0.35);
    ctx.fillStyle = P.gold; ctx.beginPath(); ctx.arc(p[0], p[1], 0.55, 0, TAU); ctx.fill();
  }
  for (let i = 0; i < 3; i++) {
    const u = 0.25 + i * 0.22;
    brushLine(ctx, [addv(midv(W0, NB, u), nrm, -ww + 0.8), addv(midv(W0, NB, u + 0.12), nrm, -1), addv(midv(W0, NB, u + 0.08), nrm, 0.8)], 0.35, P.gold);
  }
  ctx.globalAlpha = 1;
  // ворот
  if (cos.collar) {
    const col = new Path2D();
    col.ellipse(J.neck[0], J.neck[1] + 1, 6.4, 2.6, J.fw[1] ? Math.atan2(fw[1], fw[0]) : 0, 0, TAU);
    fillPath(ctx, col, cos.fur);
    ctx.fillStyle = '#1a1210';
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(J.neck[0] - 4.5 + i * 2.2, J.neck[1] + 1 + (i % 2) * 0.8, 0.35, 0, TAU); ctx.fill(); }
  } else {
    brushLine(ctx, [addv(addv(J.neck, nrm, -3.2), up, -1.2), addv(J.neck, up, -1.9), addv(addv(J.neck, nrm, 3), up, -1)], 1.4, P.gold, Prof.even);
  }
  // пояс-кушак с кистями
  const belt = new Path2D();
  limb(belt, addv(W0, nrm, -ww - 0.4), addv(W0, nrm, ww + 0.4), 2.6, 2.6);
  fillPath(ctx, belt, cos.belt === 'gold' ? P.gold : cos.belt);
  const bk = addv(W0, nrm, ww - 0.6);
  const sway = po.sway || 0;
  const t1 = addv(bk, dirv(-0.1 + sway), 7), t2 = addv(bk, dirv(0.15 + sway * 1.2), 6);
  brushLine(ctx, [bk, midv(bk, t1, 0.5), t1], 1.2, cos.belt === 'gold' ? P.gold : cos.belt, Prof.even);
  brushLine(ctx, [bk, midv(bk, t2, 0.5), t2], 1.0, cos.belt === 'gold' ? P.gold : cos.belt, Prof.even);
  ctx.fillStyle = P.gold;
  ctx.beginPath(); ctx.arc(t1[0], t1[1], 0.9, 0, TAU); ctx.arc(t2[0], t2[1], 0.8, 0, TAU); ctx.fill();
}

function drawHead(ctx, P, J, cos, po, line) {
  const c = J.headC, a = J.headA;
  // шея
  const neck = new Path2D();
  limb(neck, J.neck, J.head0, 3.4, 3.1);
  fillPath(ctx, neck, shade(cos.skin, 0.88));
  ctx.save();
  ctx.translate(c[0], c[1]);
  ctx.rotate(a);
  // коса Елены — за головой
  if (cos.braid) {
    const sw = po.sway || 0;
    const pts = [[-3.2, -1], [-5.2 - sw * 4, 6], [-6 - sw * 6, 14], [-5.6 - sw * 8, 22]];
    brushLine(ctx, pts, 3.2, cos.hair, Prof.tail);
    for (let i = 1; i < 6; i++) { const p = [lerp(-4.2, -5.8 - sw * 7, i / 6), lerp(2, 21, i / 6)]; ctx.fillStyle = P.gold; ctx.beginPath(); ctx.arc(p[0], p[1], 0.4, 0, TAU); ctx.fill(); }
    ctx.fillStyle = C.cin; ctx.beginPath(); ctx.arc(-5.6 - sw * 8, 22.5, 1.1, 0, TAU); ctx.fill();
  }
  // голова с профилем носа
  const face = sp([[-4.3, -1.5], [-3.6, -4.6], [-0.5, -6], [2.6, -5.4], [4.2, -3.2], [4.5, -1.2], [5.35, 0.9], [4.5, 1.4], [4.35, 2.4], [3.9, 3.6], [2.6, 5.3], [0.6, 5.7], [-1.8, 4.6], [-3.8, 2.4]]);
  fillPath(ctx, face, cos.skin);
  // вохрение: тень на затылке и светлые движки
  ctx.globalAlpha = 0.35; ctx.fillStyle = shade(cos.skin, 0.72);
  ctx.beginPath(); ctx.ellipse(-1.6, 1.4, 2.8, 3.8, 0.2, 0, TAU); ctx.fill();
  ctx.globalAlpha = 0.55;
  brushLine(ctx, [[1.6, -3.9], [2.7, -3.5], [3.5, -2.7]], 0.4, '#fff1d8');
  brushLine(ctx, [[2.5, 1.2], [3.3, 1.6]], 0.35, '#fff1d8');
  ctx.globalAlpha = 1;
  // волосы
  if (cos.hat !== 'helm') {
    const hair = sp([[-4.6, 2.6], [-4.9, -1.5], [-3.8, -5.2], [-0.8, -6.4], [2.4, -5.9], [3.8, -4.2], [1.8, -4.4], [-0.4, -3.6], [-1.4, -1.2], [-1.9, 1.8], [-2.8, 4.2]]);
    fillPath(ctx, hair, cos.hair);
    ctx.globalAlpha = 0.7;
    brushLine(ctx, [[-3.8, -4.4], [-4.3, -1.5], [-4.1, 1.8]], 0.35, P.gold);
    brushLine(ctx, [[-2.6, -5.3], [-3.1, -2], [-2.9, 1.5]], 0.3, P.gold);
    ctx.globalAlpha = 1;
  }
  // лицо: бровь, глаз, рот
  const look = po.lookUp || 0;
  brushLine(ctx, [[1.0, -2.1 - look * 0.3], [2.2, -2.6 - look * 0.3], [3.6, -2.3 - look * 0.2]], 0.42, '#2a150b', Prof.brush);
  ctx.fillStyle = '#fbf3e4';
  ctx.beginPath(); ctx.ellipse(2.55, -0.9 - look * 0.25, 0.95, 0.5, -0.05, 0, TAU); ctx.fill();
  ctx.fillStyle = '#1c0e07';
  ctx.beginPath(); ctx.arc(2.9, -0.95 - look * 0.45, 0.45, 0, TAU); ctx.fill();
  brushLine(ctx, [[1.6, -1.15 - look * 0.2], [2.6, -1.45 - look * 0.25], [3.55, -1.05 - look * 0.2]], 0.3, '#2a150b', Prof.even);
  ctx.fillStyle = '#b8402a';
  ctx.beginPath(); ctx.ellipse(3.4, 3.05, 0.75, 0.32, 0.15, 0, TAU); ctx.fill();
  ctx.globalAlpha = 0.25; ctx.fillStyle = '#e0685a';
  ctx.beginPath(); ctx.arc(2.1, 1.6, 1.3, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 0.28; ctx.strokeStyle = line; ctx.stroke(face);
  // борода царя
  if (cos.beard) {
    const b = sp([[4.1, 2.6], [4.4, 5.5], [3.2, 10.5], [1.2, 14.5], [0.6, 11.5], [-0.8, 8.5], [-1.6, 5], [0.2, 4.6], [2.4, 4.4]]);
    fillPath(ctx, b, cos.beard);
    ctx.globalAlpha = 0.8;
    for (let i = 0; i < 4; i++) brushLine(ctx, [[0.2 + i * 0.9, 5], [0.6 + i * 0.8, 9], [1 + i * 0.3, 12.5]], 0.3, P.gold);
    ctx.globalAlpha = 1;
    brushLine(ctx, [[2.4, 2.6], [3.6, 2.2], [4.6, 2.9]], 0.9, cos.beard, Prof.leaf);
  }
  // головной убор
  if (cos.hat === 'cap') {
    const crown = sp([[-4.9, -3.4], [-4.5, -7.2], [-1.4, -10.2], [2.2, -9.4], [4.6, -6.4], [4.6, -3.6]]);
    fillPath(ctx, crown, cos.hatCol);
    ctx.globalAlpha = 0.9;
    brushLine(ctx, [[-2.6, -4], [-2.2, -7.4], [-0.2, -9.6]], 0.35, P.gold);
    brushLine(ctx, [[0.4, -4], [1, -7], [2.4, -8.8]], 0.35, P.gold);
    ctx.globalAlpha = 1;
    const band = new Path2D();
    limb(band, [-5.3, -3.3], [5.0, -3.9], 3.1, 3.1);
    fillPath(ctx, band, cos.fur);
    ctx.globalAlpha = 0.6;
    for (let i = 0; i < 9; i++) brushLine(ctx, [[-4.8 + i * 1.2, -2.2], [-4.4 + i * 1.2, -4.9]], 0.3, '#caa37a');
    ctx.globalAlpha = 1;
    ctx.fillStyle = P.gold; ctx.beginPath(); ctx.arc(-1.2, -10.4, 0.9, 0, TAU); ctx.fill();
  } else if (cos.hat === 'crown') {
    const band = new Path2D();
    limb(band, [-5.2, -3.6], [4.8, -4.2], 3.2, 3.2);
    fillPath(ctx, band, cos.fur);
    const cr = new Path2D();
    cr.moveTo(-4.6, -5); cr.lineTo(-5.2, -10.4); cr.lineTo(-3, -7.8); cr.lineTo(-1.6, -12.4); cr.lineTo(0, -8.4);
    cr.lineTo(1.8, -12.8); cr.lineTo(3, -8.2); cr.lineTo(5, -10.8); cr.lineTo(4.4, -5.4); cr.closePath();
    fillPath(ctx, cr, P.gold);
    ctx.fillStyle = C.cin; for (const [x, y] of [[-1.6, -11.2], [1.8, -11.6], [-0.1, -6.8]]) { ctx.beginPath(); ctx.arc(x, y, 0.7, 0, TAU); ctx.fill(); }
    ctx.fillStyle = C.em; ctx.beginPath(); ctx.arc(-3.4, -6.6, 0.55, 0, TAU); ctx.arc(3.2, -6.8, 0.55, 0, TAU); ctx.fill();
  } else if (cos.hat === 'kokoshnik') {
    const ko = sp([[-4.8, -2.8], [-6.2, -7], [-3.4, -12.4], [0.4, -13.8], [4.2, -12], [6.4, -7.2], [4.9, -3.2]]);
    fillPath(ctx, ko, cos.hatCol);
    ctx.lineWidth = 0.6; ctx.strokeStyle = P.gold; ctx.stroke(ko);
    ctx.fillStyle = P.gold;
    for (let i = 0; i < 7; i++) { const a2 = PI * 1.1 + (i / 6) * PI * 0.8; ctx.beginPath(); ctx.arc(Math.cos(a2) * 4.4 + 0.2, Math.sin(a2) * 4.8 - 6.8, 0.55, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#fff6e6';
    for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.arc(-4 + i * 1.05, -2.9 + Math.sin(i) * 0.2, 0.42, 0, TAU); ctx.fill(); }
  } else if (cos.hat === 'helm') {
    const hm = sp([[-4.8, -1.2], [-4.6, -5.6], [-1.6, -8.6], [0.2, -13.4], [1.8, -8.6], [4.6, -5.6], [4.8, -1.2]]);
    fillPath(ctx, hm, cos.hatCol);
    ctx.lineWidth = 0.45; ctx.strokeStyle = P.gold; ctx.stroke(hm);
    brushLine(ctx, [[-4.6, -1.8], [0, -2.6], [4.6, -1.8]], 1, P.gold, Prof.even);
  }
  // перо в шапке — светится (рисуется отдельно по запросу)
  ctx.restore();
  if (po.featherInHat && cos.hat === 'cap') {
    const base = addv(c, dirv(a + PI - 0.9), 8);
    J.hatFeather = [base, a];
  }
}

/* Точка в мировых координатах для сустава фигуры */
function humanWorld(po, p) {
  const k = po.s / 100, d = po.dir || 1;
  let x = p[0] * k * d, y = p[1] * k;
  if (po.rot) { const c = Math.cos(po.rot), s = Math.sin(po.rot); [x, y] = [x * c - y * s, x * s + y * c]; }
  return [po.x + x, po.y + y];
}

/* Шаг: цикл ходьбы, phase — доля шага */
function walkPose(ph, base = {}) {
  const s = Math.sin(ph * TAU), c = Math.cos(ph * TAU);
  return Object.assign(pose({
    hF: 0.42 * s, kF: 0.12 + 0.5 * Math.max(0, -c) * (s < 0 ? 1 : 0.4), hB: -0.42 * s, kB: 0.12 + 0.5 * Math.max(0, c) * (s > 0 ? 1 : 0.4),
    sF: -0.35 * s, eF: 0.3, sB: 0.35 * s, eB: 0.3, torso: 0.06, sway: -0.1 * s, hem: 0.15 * Math.abs(s),
  }), base);
}

/* ==========================================================================
   ОГОНЬ: языки пламени (спрайты) — рисуются в пикселях экрана и тянутся вверх
   ========================================================================== */
function makeFlameSprite(soft) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const x = c.getContext('2d');
  if (soft) x.filter = 'blur(5px)';
  const g = x.createLinearGradient(0, 124, 0, 4);
  g.addColorStop(0, 'rgba(255,250,215,1)');
  g.addColorStop(0.22, 'rgba(255,214,110,0.95)');
  g.addColorStop(0.5, 'rgba(255,128,40,0.7)');
  g.addColorStop(0.78, 'rgba(210,50,20,0.35)');
  g.addColorStop(1, 'rgba(160,20,10,0)');
  x.fillStyle = g;
  x.beginPath();
  x.moveTo(32, 124);
  x.bezierCurveTo(6, 118, 6, 84, 18, 62);
  x.bezierCurveTo(26, 44, 30, 26, 32, 4);
  x.bezierCurveTo(36, 28, 40, 44, 47, 62);
  x.bezierCurveTo(58, 86, 58, 118, 32, 124);
  x.fill();
  return c;
}
function initFire() {
  if (SPR.flame) return;
  SPR.flame = makeFlameSprite(false);
  SPR.flameSoft = makeFlameSprite(true);
}
/* Точки контура (в локальных координатах текущей трансформации) → языки пламени.
   pts — массив [x, y, вес]; t — время; k — сила огня */
function fireAlong(ctx, pts, t, k, size, seed = 0, lean = 0) {
  if (k <= 0.01 || !pts.length) return;
  initFire();
  const m = ctx.getTransform();
  const sc = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < pts.length; i++) {
    const [lx, ly, wgt = 1] = pts[i];
    const X = m.a * lx + m.c * ly + m.e, Y = m.b * lx + m.d * ly + m.f;
    const n1 = vnoise(t * 2.7 + i * 0.73 + seed), n2 = vnoise(t * 4.1 + i * 1.37 + seed * 2);
    const hh = hash1(i * 31 + seed * 7);
    const h = size * sc * wgt * k * (0.55 + 0.75 * (n1 * 0.5 + 0.5)) * (0.7 + 0.6 * hh);
    if (h < 1) continue;
    const w = h * (0.34 + 0.3 * hash1(i * 17 + seed));
    ctx.setTransform(1, 0, 0, 1, X, Y);
    ctx.rotate(n2 * 0.3 + lean);
    ctx.globalAlpha = Math.min(1, 0.5 * k + 0.08);
    ctx.drawImage(SPR.flameSoft, -w * 0.9, -h * 1.1, w * 1.8, h * 1.3);
    ctx.globalAlpha = Math.min(1, 0.5 * k) * (0.5 + 0.5 * hh);
    ctx.drawImage(SPR.flame, -w / 2, -h * 0.94, w, h);
  }
  ctx.restore();
}
/* Свечение в локальных координатах */
function glowLocal(ctx, spr, x, y, r, a) {
  ctx.globalCompositeOperation = 'lighter';
  drawGlow(ctx, spr, x, y, r, a);
  ctx.globalCompositeOperation = 'source-over';
}

/* ==========================================================================
   ПЕРО Жар-птицы: стержень, опахало из бородок, «глазок», живой огонь
   ========================================================================== */
/* Позвоночник пера: из точки (x, y) под углом ang, длина len, изгиб bend, волна wave */
function plumeSpine(x, y, ang, len, bend, wave, ph, droop = 0, n = 18) {
  const pts = [[x, y]];
  let a = ang, px = x, py = y;
  const step = len / n;
  for (let i = 1; i <= n; i++) {
    const u = i / n;
    a = ang + bend * u * u * 1.4 + wave * Math.sin(ph - u * 4.2) * u;
    // сила тяжести тянет конец вниз
    if (droop) a = a + (PI / 2 - a) * droop * u * 0.9 * (1 - 0.3 * u);
    px += Math.cos(a) * step; py += Math.sin(a) * step;
    pts.push([px, py]);
  }
  return pts;
}
const RACHIS = (u) => 1 - 0.8 * u;
/* Опахало: ширина растёт к концу, конец скруглён */
const plumeProf = (u) => (0.1 + 0.9 * Math.pow(sstep(0.0, 0.78, u), 1.4)) * Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, (u - 0.8) / 0.2), 2))) + 0.02;
function drawPlume(ctx, P, spine, w, o = {}) {
  const st = mkStroke(spine, w, { prof: plumeProf, seg: 2 });
  const vane = new Path2D();
  strokeInto(vane, st, 1);
  const a = spine[0], b = spine[spine.length - 1];
  const g = ctx.createLinearGradient(a[0], a[1], b[0], b[1]);
  const pal = o.pal || ['#ffd46a', '#f59a36', '#d8481f', '#9e1e10'];
  g.addColorStop(0, pal[0]); g.addColorStop(0.35, pal[1]); g.addColorStop(0.72, pal[2]); g.addColorStop(1, pal[3]);
  ctx.globalAlpha = o.a ?? 1;
  ctx.fillStyle = g; ctx.fill(vane);
  // бородки: тонкие золотые штрихи наискосок — одним путём
  const nb = o.barbs ?? 26;
  ctx.beginPath();
  for (let i = 1; i < nb; i++) {
    const u = i / nb;
    const [x, y, tx, ty] = polyAt(st.poly, st.cum, u);
    const hw = 0.5 * w * plumeProf(u) * 0.92;
    for (let sd = -1; sd <= 1; sd += 2) {
      const nx = -ty * sd, ny = tx * sd;
      const ex = x + nx * hw - tx * hw * 0.55, ey = y + ny * hw - ty * hw * 0.55;
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo((x + ex) / 2 + tx * hw * 0.08, (y + ey) / 2 + ty * hw * 0.08, ex, ey);
    }
  }
  ctx.lineWidth = Math.max(0.3, w * 0.03); ctx.lineCap = 'round';
  ctx.strokeStyle = o.barbCol || 'rgba(255,226,150,0.55)';
  ctx.stroke();
  // кромка золотом
  ctx.lineWidth = Math.max(0.4, w * 0.03); ctx.strokeStyle = P.gold; ctx.stroke(vane);
  // стержень
  const rach = new Path2D();
  strokeInto(rach, { poly: st.poly, cum: st.cum, L: st.L, w: Math.max(0.8, w * 0.07), prof: RACHIS }, 0.9);
  ctx.fillStyle = P.gold; ctx.fill(rach);
  // глазок у конца
  if (o.eye !== false) {
    const [ex, ey, tx, ty] = polyAt(st.poly, st.cum, 0.84);
    const an = Math.atan2(ty, tx), R0 = w * 0.36;
    const rings = [[1, P.gold], [0.8, o.eyeRing || C.cinLo], [0.6, o.eyeCore || '#1f8a5a'], [0.33, o.eyeIn || '#0c3a4a'], [0.14, P.gold]];
    for (const [r, c] of rings) {
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.ellipse(ex, ey, R0 * r * 1.25, R0 * r * 0.95, an, 0, TAU); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  return st;
}
/* Точки кромки пера для огня */
function plumeEdge(st, w, every = 0.07, from = 0.15) {
  const out = [];
  for (let u = from; u <= 1.0001; u += every) {
    const [x, y, tx, ty] = polyAt(st.poly, st.cum, Math.min(u, 0.995));
    const hw = 0.5 * w * plumeProf(Math.min(u, 0.995));
    out.push([x - ty * hw, y + tx * hw, 0.7 + u * 0.5]);
    out.push([x + ty * hw, y - tx * hw, 0.7 + u * 0.5]);
  }
  return out;
}

/* Одиночное перо с живым огнём (герой фильма) */
function drawFeather(ctx, P, x, y, ang, len, t, o = {}) {
  const fire = o.fire ?? 1;
  const w = len * (o.wk ?? 0.21);
  const spine = plumeSpine(x, y, ang, len, o.bend ?? 0.28, o.wave ?? 0.05, t * 2.2, 0, 20);
  // ореол
  const mid = spine[Math.floor(spine.length * 0.6)];
  const pul = 0.85 + 0.15 * Math.sin(t * 5.3) + 0.08 * vnoise(t * 9);
  glowLocal(ctx, SPR.fire, mid[0], mid[1], len * 1.5 * pul, 0.5 * fire);
  glowLocal(ctx, SPR.gold, mid[0], mid[1], len * 0.8, 0.45 * fire);
  // огонь позади пера
  const st0 = mkStroke(spine, w, { prof: plumeProf, seg: 3 });
  fireAlong(ctx, plumeEdge(st0, w, 0.06, 0.2), t, fire * 0.9, len * 0.28, o.seed || 3);
  const st = drawPlume(ctx, P, spine, w, { barbs: o.barbs ?? 34 });
  // жар по кромке — поверх
  ctx.globalCompositeOperation = 'lighter';
  const edge = plumeEdge(st, w, 0.05, 0.1);
  for (let i = 0; i < edge.length; i++) {
    const [ex, ey] = edge[i];
    drawGlow(ctx, SPR.fire, ex, ey, w * (0.25 + 0.2 * (0.5 + 0.5 * vnoise(t * 6 + i))), 0.35 * fire);
  }
  ctx.globalCompositeOperation = 'source-over';
  fireAlong(ctx, plumeEdge(st, w, 0.09, 0.35), t + 7, fire * 0.55, len * 0.16, (o.seed || 3) + 11);
  // искры
  if (o.sparks !== false) {
    sparks(ctx, t, {
      t0: -100, rate: 22 * fire, life: 1.3, seed: o.seed || 5, size: Math.max(1.2, len * 0.012), rise: len * 0.55, spread: len * 0.25, alpha: fire,
      emit: (tb, i) => { const u = 0.25 + 0.7 * hash1(i * 3 + 1); return [x + Math.cos(ang + 0.12) * len * u, y + Math.sin(ang + 0.12) * len * u]; },
    });
  }
  return spine;
}

/* ==========================================================================
   ЖАР-ПТИЦА
   Локальные единицы: длина тела ≈ 64. Поза:
   lift/bend/spread — ближнее крыло (подъём, изгиб кисти, раскрытие),
   liftB/spreadB — дальнее; neck[3] — углы звеньев шеи (0 — вверх, + — вперёд);
   head — угол головы; tailA — направление хвоста, tailSpread, tailCurl, tailWave, tailDroop.
   ========================================================================== */
const BIRD0 = {
  x: 0, y: 0, s: 1, dir: 1, rot: 0,
  lift: 0.2, bend: 0.1, spread: 0.3, liftB: 0.3, spreadB: 0.3,
  neck: [0.55, 0.15, 0.45], head: 0.1, beak: 0,
  tailA: 0.86 * PI, tailSpread: 0.5, tailCurl: -0.5, tailWave: 0.15, tailDroop: 0.25, tailLen: 1, tailPh: 0,
  glow: 1, fire: 1, dim: 0,
};
function birdPose(o) { return Object.assign({}, BIRD0, o); }
/* Взмах крыльев: фаза ph (доли цикла) → подъём и раскрытие */
function flap(ph, amp = 1) {
  const s = Math.sin(ph * TAU), c = Math.cos(ph * TAU);
  return {
    lift: 0.45 + 0.85 * amp * s, bend: -0.15 + 0.55 * amp * Math.max(0, -c) * 0.8 + 0.2 * amp * s,
    spread: 0.55 + 0.45 * Math.max(-0.4, -c) * amp, liftB: 0.35 + 0.8 * amp * Math.sin(ph * TAU - 0.35), spreadB: 0.5 + 0.4 * -c * amp,
  };
}
function drawWing(ctx, P, S, lift, bend, spread, len, far, t) {
  const a1 = PI + lift;           // плечевой отрезок: назад и вверх
  const a2 = a1 + bend;           // кисть
  const E = [S[0] + Math.cos(a1) * len * 0.42, S[1] + Math.sin(a1) * len * 0.42];
  const T = [E[0] + Math.cos(a2) * len * 0.58, E[1] + Math.sin(a2) * len * 0.58];
  const dk = far ? 0.62 : 1;
  const col = (c) => (far ? shade(c, dk) : c);
  // перья: второстепенные вдоль плеча, маховые вдоль кисти
  const feathers = [];
  const nS = 7, nP = 9;
  for (let i = 0; i < nS; i++) {
    const u = (i + 0.5) / nS, p = midv(S, E, 0.15 + 0.85 * u);
    const ang = a1 - PI / 2 * (0.35 + 0.65 * spread) + 0.05 * i;
    feathers.push({ p, ang, L: len * (0.34 + 0.05 * u), w: len * 0.1, prim: false });
  }
  for (let i = 0; i < nP; i++) {
    const u = (i + 0.5) / nP, p = midv(E, T, u * 0.92);
    const fan = (u * u) * 1.15 * (0.4 + 0.6 * spread);
    const ang = a2 - PI / 2 * (0.3 + 0.7 * spread) + fan;
    feathers.push({ p, ang, L: len * (0.4 + 0.3 * u), w: len * 0.095, prim: true });
  }
  // от кончика к плечу — чтобы ближние к телу лежали сверху
  for (let i = feathers.length - 1; i >= 0; i--) {
    const f = feathers[i];
    const tip = [f.p[0] + Math.cos(f.ang) * f.L, f.p[1] + Math.sin(f.ang) * f.L];
    const m = [lerp(f.p[0], tip[0], 0.55) + Math.cos(f.ang + PI / 2) * f.L * 0.04, lerp(f.p[1], tip[1], 0.55) + Math.sin(f.ang + PI / 2) * f.L * 0.04];
    const st = mkStroke([f.p, m, tip], f.w, { prof: Prof.leaf, seg: 4 });
    const path = new Path2D(); strokeInto(path, st, 1);
    const g = ctx.createLinearGradient(f.p[0], f.p[1], tip[0], tip[1]);
    if (f.prim) { g.addColorStop(0, col('#f6a23c')); g.addColorStop(0.45, col('#d8401c')); g.addColorStop(1, col('#7a1409')); }
    else { g.addColorStop(0, col('#ffcf6a')); g.addColorStop(0.6, col('#ec7a2c')); g.addColorStop(1, col('#b8321a')); }
    ctx.fillStyle = g; ctx.fill(path);
    ctx.lineWidth = 0.55; ctx.strokeStyle = far ? 'rgba(200,150,70,0.5)' : P.gold; ctx.stroke(path);
    brushLine(ctx, [f.p, m, tip], 0.5, far ? 'rgba(220,170,80,0.5)' : P.gold, (u) => 1 - 0.7 * u);
    if (f.prim && !far && i % 2 === 0) {
      ctx.fillStyle = '#1f8a5a';
      ctx.beginPath(); ctx.ellipse(lerp(f.p[0], tip[0], 0.8), lerp(f.p[1], tip[1], 0.8), f.w * 0.16, f.w * 0.1, f.ang, 0, TAU); ctx.fill();
    }
  }
  // кроющие перья: чешуйчатая полоса вдоль переднего края
  const cov = sp([S, E, midv(E, T, 0.35), addv(midv(E, T, 0.3), dirv(PI / 2 - a2 + PI), 0), addv(midv(E, T, 0.3), [Math.cos(a2 - PI / 2), Math.sin(a2 - PI / 2)], len * 0.1),
    addv(E, [Math.cos(a1 - PI / 2), Math.sin(a1 - PI / 2)], len * 0.16), addv(S, [Math.cos(a1 - PI / 2), Math.sin(a1 - PI / 2)], len * 0.18)]);
  ctx.fillStyle = col('#f3b650'); ctx.fill(cov);
  ctx.lineWidth = 0.6; ctx.strokeStyle = far ? 'rgba(200,150,70,0.6)' : P.gold; ctx.stroke(cov);
  ctx.strokeStyle = far ? 'rgba(160,40,20,0.5)' : 'rgba(170,40,20,0.75)'; ctx.lineWidth = 0.7;
  for (let r = 0; r < 3; r++) for (let i = 0; i < 6; i++) {
    const u = (i + 0.5 + r * 0.5) / 6.5;
    const p = addv(midv(S, E, u * 1.1), [Math.cos(a1 - PI / 2), Math.sin(a1 - PI / 2)], len * (0.04 + r * 0.05));
    ctx.beginPath(); ctx.arc(p[0], p[1], len * 0.028, a1 - PI * 0.1, a1 + PI * 0.9); ctx.stroke();
  }
  return { S, E, T, feathers };
}
function drawBird(ctx, P, b, t) {
  const k = b.s;
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(b.rot * (b.dir || 1));
  ctx.scale(k * (b.dir || 1), k);
  const fire = b.fire * (1 - b.dim * 0.8);
  // общее сияние
  glowLocal(ctx, SPR.fire, -20, 0, 190, 0.28 * b.glow);
  glowLocal(ctx, SPR.gold, 5, -5, 80, 0.3 * b.glow);
  // хвост: перья веером, по каждому бежит волна
  const rump = [-30, 2];
  const n = 7, L = 200 * b.tailLen;
  const plumes = [];
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 0.5 : i / (n - 1);
    const a = b.tailA + (u - 0.5) * b.tailSpread;
    const len = L * (0.66 + 0.34 * Math.sin(PI * (0.1 + 0.8 * u))) * (0.92 + 0.16 * hash1(i * 5));
    const curl = b.tailCurl * (0.5 + 0.9 * u) + (i % 3 === 1 ? 0.25 : 0);
    let spine = plumeSpine(rump[0], rump[1], a, len, curl, b.tailWave * (0.8 + 0.4 * hash1(i)), t * 3.2 + b.tailPh + i * 0.9, b.tailDroop, 16);
    if (b.grabW && i === 3) {
      // перо в руке Ивана: переводим точку хвата в локальные координаты птицы
      const d = b.dir || 1, th = b.rot * d, c = Math.cos(th), s2 = Math.sin(th);
      const dx = b.grabW[0] - b.x, dy = b.grabW[1] - b.y;
      const gx = (dx * c + dy * s2) / (k * d), gy = (-dx * s2 + dy * c) / k;
      const cx = (rump[0] + gx) / 2 - 10, cy = (rump[1] + gy) / 2 + 26;
      spine = [];
      for (let j = 0; j <= 16; j++) { const u = j / 16, v = 1 - u; spine.push([v * v * rump[0] + 2 * v * u * cx + u * u * gx, v * v * rump[1] + 2 * v * u * cy + u * u * gy]); }
    }
    plumes.push(spine);
  }
  // тёплый след вдоль хвоста и редкие языки пламени
  ctx.globalCompositeOperation = 'lighter';
  for (const sp2 of plumes) for (let j = 4; j < sp2.length; j += 3) drawGlow(ctx, SPR.fire, sp2[j][0], sp2[j][1], 22 + j * 1.2, 0.07 * b.glow);
  ctx.globalCompositeOperation = 'source-over';
  const tailFire = [];
  for (const sp2 of plumes) for (let j = 9; j < sp2.length; j += 3) tailFire.push([sp2[j][0], sp2[j][1], 0.4 + j / sp2.length * 0.5]);
  fireAlong(ctx, tailFire, t, fire * 0.45, 30, 1, b.lean || 0);
  const order = [0, 6, 1, 5, 2, 4, 3];
  for (const i of order) drawPlume(ctx, P, plumes[i], 17, { barbs: 14, a: 1, eye: true, pal: i % 2 ? ['#ffd46a', '#f39a36', '#d8481f', '#8e1a0d'] : ['#ffe08a', '#f7b048', '#e0602a', '#a8261a'] });
  // два закрученных пера-«лиры»
  for (const sd of [-1, 1]) {
    const spine = plumeSpine(rump[0] + 2, rump[1] - 4, b.tailA - 0.5 + sd * 0.12, L * 0.62, -1.2 - sd * 0.1, b.tailWave * 0.6, t * 3 + sd, b.tailDroop * 0.4, 14);
    drawPlume(ctx, P, spine, 12, { barbs: 10, eye: false, pal: ['#ffe9a8', '#ffc45a', '#f08a34', '#c83c1a'] });
  }
  // дальнее крыло
  const S = [10, -9];
  drawWing(ctx, P, [S[0] - 4, S[1] - 2], b.liftB, b.bend * 0.8, b.spreadB, 96, true, t);
  // тело
  const body = sp([[30, -4], [22, -12], [4, -15], [-16, -12], [-31, -4], [-35, 3], [-27, 10], [-6, 14], [14, 12], [27, 5]]);
  const g = ctx.createRadialGradient(4, -4, 2, 0, 0, 38);
  g.addColorStop(0, '#ffe6a0'); g.addColorStop(0.45, '#f7b24c'); g.addColorStop(0.8, '#e0662a'); g.addColorStop(1, '#b0341a');
  ctx.fillStyle = g; ctx.fill(body);
  ctx.save(); ctx.clip(body);
  ctx.strokeStyle = 'rgba(190,60,20,0.7)'; ctx.lineWidth = 0.8;
  for (let r = 0; r < 4; r++) for (let i = 0; i < 9; i++) {
    const x = -26 + i * 6.6 + (r % 2) * 3.3, y = -10 + r * 6;
    ctx.beginPath(); ctx.arc(x, y, 3.2, 0.1 * PI, 0.9 * PI); ctx.stroke();
  }
  ctx.restore();
  ctx.lineWidth = 0.8; ctx.strokeStyle = P.gold; ctx.stroke(body);
  // шея из трёх звеньев
  let p = [24, -8], a = b.neck[0];
  const neckPts = [p];
  for (let i = 0; i < 3; i++) {
    const aa = i === 0 ? b.neck[0] : b.neck[0] + b.neck[1] * (i >= 1) + b.neck[2] * (i >= 2);
    a = aa;
    p = [p[0] + Math.sin(a) * 14, p[1] - Math.cos(a) * 14];
    neckPts.push(p);
  }
  const neckSt = mkStroke(neckPts, 15, { prof: (u) => 1 - 0.45 * u, seg: 5 });
  const neckPath = new Path2D(); strokeInto(neckPath, neckSt, 1);
  const ng = ctx.createLinearGradient(neckPts[0][0], neckPts[0][1], p[0], p[1]);
  ng.addColorStop(0, '#f7b24c'); ng.addColorStop(1, '#ffd878');
  ctx.fillStyle = ng; ctx.fill(neckPath);
  ctx.save(); ctx.clip(neckPath);
  ctx.strokeStyle = 'rgba(200,70,25,0.6)'; ctx.lineWidth = 0.7;
  for (let i = 0; i < 12; i++) { const q = polyAt(neckSt.poly, neckSt.cum, i / 12); ctx.beginPath(); ctx.arc(q[0], q[1], 3, Math.atan2(q[3], q[2]) + 0.3, Math.atan2(q[3], q[2]) + PI - 0.3); ctx.stroke(); }
  ctx.restore();
  ctx.lineWidth = 0.7; ctx.strokeStyle = P.gold; ctx.stroke(neckPath);
  // голова
  const ha = a + b.head - PI / 2 + 0.3; // направление клюва
  ctx.save();
  ctx.translate(p[0], p[1]);
  ctx.rotate(ha);
  // хохолок-корона
  for (let i = 0; i < 4; i++) {
    const ca = -2.2 - i * 0.28 + Math.sin(t * 2.3 + i) * 0.06;
    const tip = [Math.cos(ca) * 17, Math.sin(ca) * 17 - 2];
    brushLine(ctx, [[-1, -3], [Math.cos(ca + 0.25) * 9, Math.sin(ca + 0.25) * 9 - 2], tip], 1.3, P.gold, Prof.tail);
    ctx.fillStyle = i % 2 ? C.cinHi : '#ffe08a';
    ctx.beginPath(); ctx.ellipse(tip[0], tip[1], 2.4, 1.6, ca, 0, TAU); ctx.fill();
    ctx.lineWidth = 0.5; ctx.strokeStyle = P.gold; ctx.stroke();
  }
  const head = sp([[9, -1], [5, -6], [-2, -6.5], [-7, -2.5], [-6, 3.5], [0, 5.5], [6, 3.5]]);
  const hg = ctx.createRadialGradient(0, -2, 1, 0, 0, 9);
  hg.addColorStop(0, '#fff0b8'); hg.addColorStop(1, '#f2a642');
  ctx.fillStyle = hg; ctx.fill(head);
  ctx.lineWidth = 0.6; ctx.strokeStyle = P.gold; ctx.stroke(head);
  // клюв
  const bo = b.beak * 3;
  const beak = sp([[7.5, -3], [13.5, -2.4], [16.5, 0.4], [13.8, 0.6], [8.5, 1.2]]);
  ctx.fillStyle = '#e8b04a'; ctx.fill(beak);
  if (bo > 0.1) { const low = sp([[8, 1.8], [13, 1.8 + bo], [15, 2.6 + bo], [8.5, 3.2]]); ctx.fill(low); }
  // глаз
  ctx.fillStyle = C.cin; ctx.beginPath(); ctx.ellipse(2.5, -1.8, 3.1, 2.4, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#fff4d0'; ctx.beginPath(); ctx.ellipse(2.8, -1.9, 2.1, 1.6, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#1a0c05'; ctx.beginPath(); ctx.arc(3.3, -1.9, 1.05, 0, TAU); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(3.7, -2.4, 0.35, 0, TAU); ctx.fill();
  brushLine(ctx, [[-0.5, -4.4], [2.6, -5], [5.6, -3.4]], 0.7, P.gold, Prof.brush);
  ctx.restore();
  // ближнее крыло
  const wing = drawWing(ctx, P, S, b.lift, b.bend, b.spread, 104, false, t);
  // огонь по крыльям и спине
  ctx.globalCompositeOperation = 'lighter';
  for (const f of wing.feathers) drawGlow(ctx, SPR.fire, f.p[0] + Math.cos(f.ang) * f.L * 0.85, f.p[1] + Math.sin(f.ang) * f.L * 0.85, 18, 0.12 * b.glow);
  ctx.globalCompositeOperation = 'source-over';
  const wf = [];
  for (let i = 0; i <= 10; i++) { const q = midv(wing.S, wing.E, i / 10); wf.push([q[0], q[1] - 2, 0.5]); }
  for (let i = 0; i <= 10; i++) { const q = midv(wing.E, wing.T, i / 10); wf.push([q[0], q[1] - 2, 0.55 + i * 0.03]); }
  for (let i = 0; i <= 8; i++) wf.push([-24 + i * 6, -12 - Math.sin(i / 8 * PI) * 3, 0.45]);
  fireAlong(ctx, wf, t + 3, fire * 0.5, 26, 7, b.lean || 0);
  glowLocal(ctx, SPR.gold, p[0], p[1], 30, 0.25 * b.glow);
  ctx.restore();
  // точка головы и хвоста в мире (для камеры, искр, света)
  const d = b.dir || 1, c = Math.cos(b.rot * d), s = Math.sin(b.rot * d);
  const toW = (q) => { const x = q[0] * k * d, y = q[1] * k; return [b.x + x * c - y * s, b.y + x * s + y * c]; };
  return { head: toW(p), tail: plumes.map((pl) => toW(pl[pl.length - 1])), body: toW([0, 0]), plumes, toW };
}

/* ==========================================================================
   ЧЕТВЕРОНОГИЕ: серый волк и кони
   Локальные единицы: длина корпуса ≈ 100, лицом вправо.
   Ноги — три звена с абсолютными углами (0 — вниз, + — вперёд).
   ========================================================================== */
const SPECIES = {
  wolf: {
    hip: [-34, 0], sho: [30, -2], top: -14, bot: 16, legF: [19, 18, 9], legH: [21, 18, 13], wF: [14, 8, 6], wH: [17, 8, 6],
    neckLen: 22, neckW: [26, 18], headLen: 34, tailLen: 50,
    col: ['#8a98a8', '#5b6878', '#343d4a'], belly: '#c2cad2', fur: 'rgba(230,238,245,0.55)', mane: '#9fb0bf',
  },
  horse: {
    hip: [-36, 0], sho: [32, -3], top: -15, bot: 15, legF: [24, 29, 14], legH: [27, 28, 18], wF: [11, 5.2, 4.2], wH: [14, 5.4, 4.2],
    neckLen: 40, neckW: [21, 12], headLen: 34, tailLen: 62,
    col: ['#c8683a', '#9a4524', '#5e2612'], belly: '#d98a5c', fur: 'rgba(255,220,180,0.5)', mane: '#2e1a10', hoof: '#2a1a10',
  },
  goldhorse: {
    hip: [-36, 0], sho: [32, -3], top: -15, bot: 15, legF: [24, 29, 14], legH: [27, 28, 18], wF: [11, 5.2, 4.2], wH: [14, 5.4, 4.2],
    neckLen: 40, neckW: [21, 12], headLen: 34, tailLen: 66,
    col: ['#f6eedc', '#d9ccb0', '#a8987a'], belly: '#fff8ea', fur: 'rgba(200,170,110,0.55)', mane: 'gold', hoof: '#6b5a3a',
  },
};
/* Поза четвероногого по умолчанию: стоит */
function quadPose(o) {
  return Object.assign({
    x: 0, y: 0, s: 1, dir: 1, pitch: 0,
    fN: [0.12, -0.02, 0.28], fF: [0.02, -0.04, 0.22], hN: [0.38, -0.5, 0.1], hF: [0.3, -0.46, 0.06],
    neck: 0.95, head: 0.25, jaw: 0, ear: 0, tail: 0.7, tailWave: 0.1, tailPh: 0, eye: 1,
  }, o);
}
/* Ноги в фазе шага φ ∈ [0,1): stance — опора, затем перенос */
function legCycle(ph, front, st, stride, lift) {
  ph = fract(ph);
  let a1, bend;
  if (ph < st) { const u = ph / st; a1 = lerp(stride, -stride, u); bend = 0.08 * Math.sin(PI * u); }
  else { const u = (ph - st) / (1 - st); a1 = lerp(-stride, stride, Ease.ioS(u)); bend = lift * Math.sin(PI * Math.pow(u, 0.8)); }
  if (front) return [a1, a1 - 0.05 - bend * 1.5, a1 + 0.2 - bend * 2.2];
  return [a1 + 0.32, a1 - 0.5 - bend * 0.7, a1 + 0.08 + bend * 1.1];
}
/* Галоп: задние ноги отталкиваются, передние выносятся — «летящий» палехский галоп */
function gallopPose(ph, base = {}, stride = 0.62) {
  const q = {
    hN: legCycle(ph, false, 0.3, stride, 1.1), hF: legCycle(ph + 0.08, false, 0.3, stride, 1.1),
    fN: legCycle(ph + 0.52, true, 0.3, stride * 1.05, 0.9), fF: legCycle(ph + 0.6, true, 0.3, stride * 1.05, 0.9),
    pitch: 0.07 * Math.sin(ph * TAU + 1.2), bob: 4 * Math.sin(ph * TAU * 2 + 0.6) - 2,
    neck: 1.05 + 0.1 * Math.sin(ph * TAU + 2), head: 0.3 + 0.08 * Math.sin(ph * TAU + 2.4), tail: 0.12, tailWave: 0.3, tailPh: ph * TAU,
  };
  return quadPose(Object.assign(q, base));
}
function walkQuad(ph, base = {}, stride = 0.32) {
  const q = {
    hN: legCycle(ph, false, 0.62, stride, 0.7), fN: legCycle(ph + 0.25, true, 0.62, stride, 0.6),
    hF: legCycle(ph + 0.5, false, 0.62, stride, 0.7), fF: legCycle(ph + 0.75, true, 0.62, stride, 0.6),
    pitch: 0.015 * Math.sin(ph * TAU * 2), bob: 1.2 * Math.sin(ph * TAU * 2), tailPh: ph * TAU,
  };
  return quadPose(Object.assign(q, base));
}
function legPts(root, A, L) {
  const p1 = addv(root, dirv(A[0]), L[0]);
  const p2 = addv(p1, dirv(A[1]), L[1]);
  const p3 = addv(p2, dirv(A[2]), L[2]);
  return [root, p1, p2, p3];
}
function drawQuadLeg(ctx, sp0, pts, Wd, col, hoof, front) {
  const path = new Path2D();
  limb(path, pts[0], pts[1], Wd[0], Wd[1] + 1);
  limb(path, pts[1], pts[2], Wd[1], Wd[1] * 0.85);
  limb(path, pts[2], pts[3], Wd[2], Wd[2] * 0.9);
  ctx.fillStyle = col; ctx.fill(path);
  // копыто или лапа
  const end = pts[3], d = [pts[3][0] - pts[2][0], pts[3][1] - pts[2][1]];
  const l = Math.hypot(d[0], d[1]) || 1;
  if (hoof) {
    ctx.fillStyle = hoof;
    ctx.beginPath(); ctx.ellipse(end[0] + d[0] / l * 1.5, end[1] + d[1] / l * 1.5, 3.4, 2.6, Math.atan2(d[1], d[0]), 0, TAU); ctx.fill();
  } else {
    ctx.beginPath(); ctx.ellipse(end[0] + 2, end[1] + 0.5, 4.2, 2.6, 0, 0, TAU); ctx.fill();
  }
  void sp0; void front;
}
function drawQuad(ctx, P, q, kind, t, o = {}) {
  const S = SPECIES[kind];
  const k = q.s;
  ctx.save();
  ctx.translate(q.x, q.y + (q.bob || 0) * k);
  ctx.scale(k * (q.dir || 1), k);
  ctx.rotate(q.pitch || 0);
  const hip = S.hip, sho = S.sho;
  const fRoot = [sho[0] - 2, sho[1] + 8], hRoot = [hip[0] + 3, hip[1] + 5];
  const far = shade(S.col[1].startsWith('#') ? S.col[1] : '#777777', 0.7);
  // дальние ноги
  drawQuadLeg(ctx, S, legPts([fRoot[0] - 3, fRoot[1]], q.fF, S.legF), S.wF, far, S.hoof ? shade(S.hoof, 0.8) : null, true);
  drawQuadLeg(ctx, S, legPts([hRoot[0] - 3, hRoot[1]], q.hF, S.legH), S.wH, far, S.hoof ? shade(S.hoof, 0.8) : null, false);
  // хвост: tail = 0 — назад, 1 — вниз; к концу свисает сильнее
  const tr = [hip[0] - 8, hip[1] - 8];
  const tailPts = [tr];
  let tp = tr;
  for (let i = 1; i <= 6; i++) {
    const u = i / 6;
    const ta = PI - (PI / 2) * clamp(q.tail + u * (kind === 'wolf' ? 0.12 : 0.35)) + q.tailWave * Math.sin(q.tailPh + t * 2.2 - i * 0.8) * 0.45 * u;
    tp = [tp[0] + Math.cos(ta) * S.tailLen / 6, tp[1] + Math.sin(ta) * S.tailLen / 6];
    tailPts.push(tp);
  }
  if (kind === 'wolf') {
    const tail = new Path2D();
    strokeInto(tail, mkStroke(tailPts, 16, { prof: (u) => 0.5 + 0.7 * Math.sin(PI * Math.min(1, 0.15 + u * 0.9)) * (1 - 0.35 * u), seg: 4 }));
    ctx.fillStyle = S.col[1]; ctx.fill(tail);
    ctx.globalAlpha = 0.8;
    for (let i = 1; i < 6; i++) brushLine(ctx, [tailPts[i - 1], tailPts[i], tailPts[Math.min(6, i + 1)]], 1, 'rgba(225,232,240,0.6)', Prof.hair);
    ctx.globalAlpha = 1;
    brushLine(ctx, [tailPts[4], tailPts[5], tailPts[6]], 7, S.col[2], (u) => 0.4 + 0.6 * Math.sin(PI * u * 0.9));
  } else {
    // конский хвост — пряди
    for (let j = 0; j < 7; j++) {
      const pts = tailPts.map((p, i) => [p[0] + Math.sin(i * 0.9 + j + t * 3) * (i * 0.4), p[1] + (j - 3) * i * 0.55]);
      brushLine(ctx, pts, 3.6 - j * 0.25, S.mane === 'gold' ? P.gold : S.mane, Prof.tail);
    }
  }
  // корпус
  const body = sp([
    [sho[0] + 12, sho[1] + 4], [sho[0] + 4, sho[1] - 13 + S.top * 0.2], [0, S.top], [hip[0] + 6, hip[1] + S.top - 2], [hip[0] - 8, hip[1] - 9],
    [hip[0] - 12, hip[1] + 3], [hip[0] - 5, hip[1] + S.bot + 1], [0, S.bot], [sho[0] + 3, sho[1] + S.bot + 4],
  ]);
  const g = ctx.createLinearGradient(0, S.top - 4, 0, S.bot + 6);
  g.addColorStop(0, S.col[0]); g.addColorStop(0.55, S.col[1]); g.addColorStop(1, S.col[2]);
  ctx.fillStyle = g; ctx.fill(body);
  // брюхо светлее
  ctx.save(); ctx.clip(body);
  ctx.globalAlpha = 0.45; ctx.fillStyle = S.belly;
  ctx.beginPath(); ctx.ellipse(2, S.bot + 3, 30, 7, 0, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;
  // шерсть: тонкие штрихи вдоль тела
  for (let r = 0; r < 4; r++) for (let i = 0; i < 9; i++) {
    const x = hip[0] + 4 + i * 8 + (r % 2) * 4, y = S.top + 5 + r * 6;
    brushLine(ctx, [[x, y], [x + 4, y + 1.2], [x + 8, y + 1.5]], 0.7, r === 0 ? P.gold : S.fur, Prof.hair);
  }
  ctx.restore();
  ctx.lineWidth = 0.6; ctx.strokeStyle = 'rgba(30,20,12,0.6)'; ctx.stroke(body);
  brushLine(ctx, [[hip[0] - 6, hip[1] - 9.5], [hip[0] + 8, hip[1] + S.top - 1.5], [0, S.top + 0.5], [sho[0] + 3, sho[1] - 12 + S.top * 0.2]], 1, P.gold, Prof.hair);
  // седло и чепрак
  if (o.saddle) {
    const cl = sp([[-14, S.top + 1], [12, S.top + 0.5], [14, 6], [-16, 6]]);
    ctx.fillStyle = o.saddle; ctx.fill(cl);
    ctx.lineWidth = 0.8; ctx.strokeStyle = P.gold; ctx.stroke(cl);
    for (let i = 0; i < 9; i++) brushLine(ctx, [[-15 + i * 3.4, 6], [-15 + i * 3.4, 9]], 0.8, P.gold, Prof.even);
    const sd = sp([[-10, S.top - 1], [-6, S.top - 5], [6, S.top - 5], [9, S.top - 2], [8, S.top + 3], [-9, S.top + 3]]);
    ctx.fillStyle = C.cin; ctx.fill(sd); ctx.strokeStyle = P.gold; ctx.stroke(sd);
  }
  // шея и голова
  const nb = [sho[0] + 4, sho[1] - 4];
  const na = q.neck;
  const nEnd = [nb[0] + Math.sin(na) * S.neckLen, nb[1] - Math.cos(na) * S.neckLen];
  const arch = kind === 'wolf' ? 2 : 7;
  const nMid = [lerp(nb[0], nEnd[0], 0.5) - Math.cos(na) * arch, lerp(nb[1], nEnd[1], 0.5) - Math.sin(na) * arch];
  const neck = new Path2D();
  strokeInto(neck, mkStroke([nb, nMid, nEnd], S.neckW[0], { prof: (u) => 1 - (1 - S.neckW[1] / S.neckW[0]) * u, seg: 5 }));
  const ng = ctx.createLinearGradient(nb[0], nb[1] - 10, nEnd[0], nEnd[1] + 10);
  ng.addColorStop(0, S.col[1]); ng.addColorStop(1, S.col[0]);
  ctx.fillStyle = ng; ctx.fill(neck);
  // грива
  if (kind === 'wolf') {
    ctx.fillStyle = S.mane;
    for (let i = 0; i < 7; i++) {
      const u = i / 6, p = midv(nb, nEnd, u);
      const n = [-Math.cos(na), -Math.sin(na)];
      const tip = addv(addv(p, n, 9 - u * 3), [-Math.sin(na), Math.cos(na)], 5);
      brushLine(ctx, [addv(p, n, 2), tip], 4.5 - u * 1.2, S.mane, Prof.leaf);
    }
  } else {
    for (let i = 0; i < 9; i++) {
      const u = i / 8, p = midv(nb, nEnd, 0.1 + u * 0.9);
      const n = [-Math.cos(na), -Math.sin(na)];
      const sw = Math.sin(t * 5 + i + (q.tailPh || 0)) * 2;
      const tip = addv(addv(p, n, 5 + sw * 0.3), [-Math.sin(na), Math.cos(na)], -9 - sw);
      brushLine(ctx, [addv(p, n, 5), midv(addv(p, n, 5), tip, 0.5), tip], 3.2, S.mane === 'gold' ? P.gold : S.mane, Prof.tail);
    }
  }
  // голова
  ctx.save();
  ctx.translate(nEnd[0], nEnd[1]);
  ctx.rotate(q.head);
  if (kind === 'wolf') drawWolfHead(ctx, P, q, S, t); else drawHorseHead(ctx, P, q, S, t, o);
  ctx.restore();
  // ближние ноги
  drawQuadLeg(ctx, S, legPts(fRoot, q.fN, S.legF), S.wF, S.col[1], S.hoof || null, true);
  drawQuadLeg(ctx, S, legPts(hRoot, q.hN, S.legH), S.wH, S.col[1], S.hoof || null, false);
  // блики на ногах
  const lf = legPts(fRoot, q.fN, S.legF), lh = legPts(hRoot, q.hN, S.legH);
  ctx.globalAlpha = 0.7;
  brushLine(ctx, [addv(lf[0], [1, 0], 3), addv(lf[1], [1, 0], 1.5), addv(lf[2], [1, 0], 1)], 0.6, S.fur, Prof.hair);
  brushLine(ctx, [addv(lh[0], [1, -0.4], 4), addv(lh[1], [0.6, 0], 1.5), addv(lh[2], [0.8, 0], 1)], 0.6, S.fur, Prof.hair);
  ctx.globalAlpha = 1;
  ctx.restore();
  // точка седла в мире
  const d = q.dir || 1, c = Math.cos(q.pitch || 0), s = Math.sin(q.pitch || 0);
  const toW = (p) => { const x = p[0] * c - p[1] * s, y = p[0] * s + p[1] * c; return [q.x + x * k * d, q.y + (q.bob || 0) * k + y * k]; };
  return { saddle: toW([0, S.top - 2]), head: toW(nEnd), toW };
}
/* точка корпуса четвероногого в мире — без рисования (та же математика, что в drawQuad) */
function quadAt(q, kind, p) {
  const k = q.s, d = q.dir || 1, c = Math.cos(q.pitch || 0), s = Math.sin(q.pitch || 0);
  const x = p[0] * c - p[1] * s, y = p[0] * s + p[1] * c;
  return [q.x + x * k * d, q.y + (q.bob || 0) * k + y * k];
}
function drawWolfHead(ctx, P, q, S, t) {
  const jaw = q.jaw || 0;
  // уши
  for (const [ox, a, dk] of [[-3, -1.9 + q.ear, 0.7], [1, -1.6 + q.ear, 1]]) {
    const e = sp([[ox - 3, -5], [ox + Math.cos(a) * 12, -5 + Math.sin(a) * 12], [ox + 4, -4.5]]);
    ctx.fillStyle = dk < 1 ? shade('#5b6878', 0.8) : S.col[1]; ctx.fill(e);
    ctx.fillStyle = 'rgba(40,30,30,0.6)';
    const e2 = sp([[ox - 1, -5], [ox + Math.cos(a) * 9, -5 + Math.sin(a) * 9], [ox + 2.5, -4.8]]); ctx.fill(e2);
  }
  // нижняя челюсть
  ctx.save(); ctx.rotate(jaw * 0.5);
  const lj = sp([[4, 4], [16, 4.5 + jaw * 2], [30, 4 + jaw * 3], [30, 6.5 + jaw * 3], [16, 9], [4, 9]]);
  ctx.fillStyle = S.col[2]; ctx.fill(lj);
  if (jaw > 0.05) { ctx.fillStyle = '#f4efe6'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(14 + i * 3.4, 4.5); ctx.lineTo(15.5 + i * 3.4, 2.2); ctx.lineTo(17 + i * 3.4, 4.6); ctx.fill(); } }
  ctx.restore();
  // череп и морда
  const hd = sp([[-8, 1], [-6, -6], [2, -8], [10, -5], [20, -2.2], [32, 0.5], [33.5, 3], [30, 4.8], [16, 5.5], [4, 8], [-5, 6]]);
  const g = ctx.createLinearGradient(0, -8, 0, 8);
  g.addColorStop(0, S.col[0]); g.addColorStop(1, S.col[1]);
  ctx.fillStyle = g; ctx.fill(hd);
  ctx.lineWidth = 0.5; ctx.strokeStyle = 'rgba(25,20,20,0.6)'; ctx.stroke(hd);
  ctx.fillStyle = '#d7dde3'; ctx.globalAlpha = 0.7;
  const ch = sp([[2, 3], [14, 3], [28, 3.4], [16, 5.2], [4, 7]]); ctx.fill(ch); ctx.globalAlpha = 1;
  // нос, пасть
  ctx.fillStyle = '#1a1212'; ctx.beginPath(); ctx.ellipse(32.5, 1.6, 2.2, 1.7, 0.2, 0, TAU); ctx.fill();
  brushLine(ctx, [[31, 4.4], [22, 4.6], [12, 5.4]], 0.6, '#1a1212', Prof.brush);
  // глаз
  const eo = q.eye ?? 1;
  ctx.fillStyle = '#f2c14e'; ctx.beginPath(); ctx.ellipse(6, -2.8, 2.6, 1.3 * eo + 0.15, -0.25, 0, TAU); ctx.fill();
  ctx.fillStyle = '#140c08'; ctx.beginPath(); ctx.ellipse(6.6, -2.9, 0.9, 1.0 * eo + 0.1, 0, 0, TAU); ctx.fill();
  brushLine(ctx, [[3, -4.6], [6.5, -5.2], [10, -3.8]], 0.7, '#20262e', Prof.brush);
  // золотые штрихи на морде
  ctx.globalAlpha = 0.8;
  brushLine(ctx, [[-4, -5.2], [4, -7.2], [14, -4.6], [26, -1.2]], 0.6, P.gold, Prof.hair);
  ctx.globalAlpha = 1;
  if (q.eyeGlow) glowLocal(ctx, SPR.gold, 6, -2.8, 9, q.eyeGlow);
  void t;
}
function drawHorseHead(ctx, P, q, S, t, o) {
  // уши
  const e = sp([[-4, -6], [-3, -15], [1, -6]]);
  ctx.fillStyle = S.col[1]; ctx.fill(e);
  // голова: от затылка к храпу
  const hd = sp([[-6, -1], [-4, -7], [4, -7.5], [16, -4.8], [27, -2.6], [33, 0], [33, 5.5], [27, 7.5], [16, 6.5], [4, 9], [-5, 6]]);
  const g = ctx.createLinearGradient(0, -8, 0, 9);
  g.addColorStop(0, S.col[0]); g.addColorStop(1, S.col[1]);
  ctx.fillStyle = g; ctx.fill(hd);
  ctx.lineWidth = 0.5; ctx.strokeStyle = 'rgba(30,20,12,0.6)'; ctx.stroke(hd);
  // чёлка
  for (let i = 0; i < 4; i++) brushLine(ctx, [[-3 + i, -7], [2 + i * 2, -9 + Math.sin(t * 4 + i)], [7 + i * 2.2, -5]], 2.2, S.mane === 'gold' ? P.gold : S.mane, Prof.tail);
  // глаз, ноздря
  ctx.fillStyle = '#1a0e08'; ctx.beginPath(); ctx.ellipse(8, -2.6, 2.1, 1.3, -0.2, 0, TAU); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(8.6, -3, 0.45, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(30,15,8,0.7)'; ctx.beginPath(); ctx.ellipse(30.5, 2.5, 1.6, 1, 0.3, 0, TAU); ctx.fill();
  // узда
  brushLine(ctx, [[12, -5.5], [14, 1], [12.5, 7.5]], 1, P.gold, Prof.even);
  brushLine(ctx, [[14, 1], [24, 0.2], [31, 4.2]], 0.9, P.gold, Prof.even);
  ctx.fillStyle = P.gold; ctx.beginPath(); ctx.arc(14, 1, 1.2, 0, TAU); ctx.fill();
  if (o.reins) brushLine(ctx, [[28, 5], ...o.reins], 0.8, P.gold, Prof.even);
}

/* ==========================================================================
   КРУПНЫЙ ПЛАН ИВАНА: лицо в три четверти, шапка, ладони с пером.
   Локальные единицы: голова ≈ 110 в высоту, центр лица — начало.
   o.look = [gx, gy] — взгляд; o.lid — прикрытие век; o.smile; o.light — [x, y, k] в тех же единицах
   ========================================================================== */
function drawIvanClose(ctx, P, o, t) {
  const cos = COSTUME.ivan;
  const look = o.look || [0, 0], lid = o.lid || 0, smile = o.smile || 0;
  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.scale(o.s, o.s);
  ctx.rotate(o.tilt || 0);
  const sil = new Path2D();
  // плечи и кафтан
  const body = sp([[-150, 260], [-140, 150], [-100, 104], [-40, 84], [20, 84], [80, 98], [120, 140], [130, 260]]);
  const kg = ctx.createLinearGradient(0, 90, 0, 260);
  kg.addColorStop(0, '#d23a1f'); kg.addColorStop(1, '#8e2412');
  ctx.fillStyle = kg; ctx.fill(body); sil.addPath(body);
  ctx.save(); ctx.clip(body);
  ctx.globalAlpha = 0.85;
  for (let i = 0; i < 9; i++) {
    const x0 = -130 + i * 30;
    brushLine(ctx, [[x0, 110 + Math.abs(i - 4) * 4], [x0 + 6, 170], [x0 + 4, 250]], 1.2, P.gold, Prof.hair);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  // ворот золотой
  const col = sp([[-52, 92], [-40, 78], [0, 72], [36, 76], [56, 92], [30, 104], [-10, 106], [-40, 102]]);
  ctx.fillStyle = P.gold; ctx.fill(col);
  ctx.fillStyle = C.cin;
  for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.arc(-38 + i * 12.5, 90 + Math.sin(i * 1.3) * 1.5, 2.3, 0, TAU); ctx.fill(); }
  ctx.strokeStyle = 'rgba(90,50,15,0.8)'; ctx.lineWidth = 0.8; ctx.stroke(col);
  // шея
  const neck = sp([[-22, 40], [-26, 86], [0, 94], [20, 88], [18, 46]]);
  ctx.fillStyle = shade(cos.skin, 0.82); ctx.fill(neck); sil.addPath(neck);
  // волосы сзади
  const hairB = sp([[-30, -44], [-50, -20], [-54, 18], [-46, 44], [-30, 52], [-22, 30], [-30, 0], [-20, -30]]);
  ctx.fillStyle = cos.hair; ctx.fill(hairB);
  // лицо
  const face = sp([[-34, -34], [-39, -6], [-35, 22], [-22, 42], [-2, 54], [14, 55], [25, 47], [30, 37], [31.5, 30], [33.5, 25], [34.5, 20], [36, 16], [43.5, 12.5], [46.5, 8], [42, -6], [37.5, -17], [37.5, -28], [30, -44], [0, -52], [-24, -47]]);
  const fg = ctx.createRadialGradient(8, -6, 6, 0, 4, 64);
  fg.addColorStop(0, '#f4d2a6'); fg.addColorStop(0.55, '#e0ad7c'); fg.addColorStop(1, '#b07a4e');
  ctx.fillStyle = fg; ctx.fill(face); sil.addPath(face);
  // вохрение и движки
  ctx.save(); ctx.clip(face);
  ctx.globalAlpha = 0.28; ctx.fillStyle = '#8a5230';
  ctx.beginPath(); ctx.ellipse(-30, 8, 16, 34, 0.1, 0, TAU); ctx.fill();
  ctx.globalAlpha = 0.22; ctx.fillStyle = '#d9604a';
  ctx.beginPath(); ctx.ellipse(-14, 18, 13, 10, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(27, 16, 7, 6, 0, 0, TAU); ctx.fill();
  ctx.globalAlpha = 0.7;
  for (let i = 0; i < 4; i++) brushLine(ctx, [[2 + i * 5, -40 + i * 1.5], [6 + i * 5, -33 + i]], 1.1, '#fff4e0', Prof.hair);
  for (let i = 0; i < 3; i++) brushLine(ctx, [[-20 + i * 4, 6 + i * 2], [-12 + i * 4, 9 + i * 2]], 1, '#fff4e0', Prof.hair);
  brushLine(ctx, [[39, -4], [42.5, 6]], 1.4, '#fff6e6', Prof.hair);
  for (let i = 0; i < 3; i++) brushLine(ctx, [[8 + i * 3, 46 - i], [12 + i * 3, 44 - i]], 1, '#fff4e0', Prof.hair);
  ctx.globalAlpha = 1;
  ctx.restore();
  ctx.strokeStyle = 'rgba(70,32,14,0.75)'; ctx.lineWidth = 0.9; ctx.stroke(face);
  // брови
  const bl = (o.brow || 0) * -3;
  brushLine(ctx, [[-19, -17 + bl], [-8, -21.5 + bl], [4, -19.5 + bl]], 2.4, '#3a1f10', Prof.brush);
  brushLine(ctx, [[15, -19.5 + bl], [26, -21 + bl], [35, -16.5 + bl], [38.5, -9]], 1.9, '#3a1f10', Prof.brush);
  // нос
  brushLine(ctx, [[37, -12], [40.5, -2], [44.5, 8.5], [41, 12.5], [36.5, 11.5]], 1.1, 'rgba(90,40,18,0.8)', Prof.even);
  ctx.fillStyle = 'rgba(90,40,18,0.55)'; ctx.beginPath(); ctx.ellipse(37.5, 10.5, 2.2, 1.3, 0.3, 0, TAU); ctx.fill();
  // глаза
  const eye = (cx, cy, w, h, far) => {
    const hh = h * (1 - lid * 0.75);
    const lidTop = cy - hh / 2;
    const alm = new Path2D();
    alm.moveTo(cx - w / 2, cy);
    alm.quadraticCurveTo(cx - w * 0.1, lidTop - hh * 0.35, cx + w / 2, cy - (far ? 0.6 : 0.2));
    alm.quadraticCurveTo(cx + w * 0.05, cy + h * 0.55, cx - w / 2, cy);
    alm.closePath();
    ctx.fillStyle = '#fbf1de'; ctx.fill(alm);
    ctx.save(); ctx.clip(alm);
    const ix = cx + look[0] * w * 0.18 + (far ? 1 : 0), iy = cy + look[1] * h * 0.22;
    ctx.fillStyle = '#4a2a12'; ctx.beginPath(); ctx.arc(ix, iy, h * 0.52, 0, TAU); ctx.fill();
    ctx.fillStyle = '#140a04'; ctx.beginPath(); ctx.arc(ix, iy, h * 0.27, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(ix + h * 0.18, iy - h * 0.2, h * 0.12, 0, TAU); ctx.fill();
    if (o.eyeFire) { ctx.fillStyle = `rgba(255,170,70,${o.eyeFire})`; ctx.beginPath(); ctx.arc(ix - h * 0.1, iy + h * 0.12, h * 0.1, 0, TAU); ctx.fill(); }
    ctx.restore();
    // веко
    brushLine(ctx, [[cx - w / 2 - 1, cy + 0.5], [cx - w * 0.1, lidTop - hh * 0.3], [cx + w / 2 + 0.5, cy - (far ? 0.6 : 0.2)]], far ? 1.6 : 2, '#2a140a', Prof.brush);
    brushLine(ctx, [[cx - w * 0.35, cy + h * 0.38], [cx + w * 0.3, cy + h * 0.32]], 0.6, 'rgba(90,40,18,0.6)', Prof.hair);
  };
  eye(-6, -6, 17, 7.5, false);
  eye(26.5, -7, 11, 6.4, true);
  // рот
  const sm = smile * 2.2, mo = o.mouth || 0;
  const up = sp([[22.5, 22.5 - sm * 0.6], [28, 20.4], [31, 21.2], [34.5, 20.2 - sm * 0.2], [33.5, 23.5], [28, 23.8]]);
  ctx.fillStyle = '#b2432c'; ctx.fill(up);
  const lo = sp([[23.5, 24.2 - sm * 0.4], [28.5, 24.5 + mo], [33, 23.8], [32, 27.4 + mo], [27.5, 28.4 + mo], [24.5, 26.8]]);
  ctx.fillStyle = '#c85a3e'; ctx.fill(lo);
  if (mo > 0.3) { ctx.fillStyle = '#3a120a'; ctx.beginPath(); ctx.ellipse(28.5, 24.4 + mo * 0.5, 4, mo * 0.7, 0, 0, TAU); ctx.fill(); }
  brushLine(ctx, [[22, 23.5 - sm], [28, 24.2 + mo * 0.3], [34.5, 22.8 - sm * 0.3]], 0.8, '#5a1a0e', Prof.brush);
  // ухо и кудри
  const ear = sp([[-36, -6], [-44, -8], [-47, 4], [-42, 14], [-36, 12]]);
  ctx.fillStyle = shade(cos.skin, 0.85); ctx.fill(ear);
  ctx.fillStyle = cos.hair;
  for (const [x, y, r] of [[-44, 24, 7], [-40, 36, 7.5], [-30, 44, 6.5], [-48, 10, 6], [-47, -6, 6], [-38, -28, 7]]) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 0.85;
  for (const [x, y, r] of [[-44, 24, 7], [-40, 36, 7.5], [-30, 44, 6.5], [-48, 10, 6], [-47, -6, 6]]) brushLine(ctx, curlPts(x, y, r * 0.8, 0, 1.1, 1), 0.9, P.gold, Prof.tail);
  ctx.globalAlpha = 1;
  // чёлка под шапкой
  const bang = sp([[-36, -38], [-24, -34], [-10, -38], [4, -33], [18, -38], [30, -35], [34, -44], [-34, -48]]);
  ctx.fillStyle = cos.hair; ctx.fill(bang);
  // шапка: околыш из меха и киноварная тулья
  const crown = sp([[-50, -50], [-46, -86], [-18, -106], [16, -100], [42, -76], [44, -52]]);
  const cg = ctx.createLinearGradient(-40, -100, 40, -50);
  cg.addColorStop(0, '#e2553a'); cg.addColorStop(1, '#9a2614');
  ctx.fillStyle = cg; ctx.fill(crown);
  ctx.save(); ctx.clip(crown);
  ctx.globalAlpha = 0.9;
  for (let i = 0; i < 6; i++) brushLine(ctx, [[-40 + i * 16, -50], [-34 + i * 13, -78], [-16 + i * 7, -100]], 1.2, P.gold, Prof.hair);
  ctx.globalAlpha = 1;
  ctx.restore();
  ctx.fillStyle = P.gold; ctx.beginPath(); ctx.arc(-14, -106, 4, 0, TAU); ctx.fill();
  const band = new Path2D(); limb(band, [-56, -44], [46, -50], 20, 18);
  ctx.fillStyle = '#3a2413'; ctx.fill(band);
  ctx.globalAlpha = 0.65;
  for (let i = 0; i < 26; i++) { const x = -54 + i * 3.9; brushLine(ctx, [[x, -36 - (i % 3)], [x + 1.5, -46], [x + 0.5, -55 + (i % 2) * 2]], 0.9, '#c9a177', Prof.hair); }
  ctx.globalAlpha = 1;
  sil.addPath(crown); sil.addPath(band);
  o.featherAt = [-40, -60];
  // ладони лодочкой: рукава, пальцы веером вверх, большой палец к середине
  if (o.hands) {
    const hy = o.handsY ?? 150;
    const hg = ctx.createLinearGradient(0, hy - 34, 0, hy + 34);
    hg.addColorStop(0, '#f6d4a6'); hg.addColorStop(0.6, '#dcaa78'); hg.addColorStop(1, '#a8714a');
    const ink = 'rgba(86,40,16,0.7)';
    // рукава с золотыми обшлагами
    for (const [a, b] of [[[-96, hy + 52], [-60, hy + 24]], [[98, hy + 56], [64, hy + 28]]]) {
      const sl = new Path2D(); limb(sl, a, b, 34, 30);
      ctx.fillStyle = C.cin; ctx.fill(sl); sil.addPath(sl);
      const cf = new Path2D(); limb(cf, midv(a, b, 0.72), b, 32, 30);
      ctx.fillStyle = P.gold; ctx.fill(cf);
      ctx.fillStyle = C.cinLo; for (let i = 0; i < 3; i++) { const q = midv(a, b, 0.78 + i * 0.08); ctx.beginPath(); ctx.arc(q[0], q[1], 1.6, 0, TAU); ctx.fill(); }
    }
    const hand = (cx, cy, d) => {
      const fingers = new Path2D();
      for (let i = 0; i < 4; i++) {
        const bx = cx + d * (-21 + i * 11.5), by = cy - 4 + Math.abs(i - 1.5) * 2.6;
        const a = d * (-0.3 + i * 0.13), len = 25 - Math.abs(i - 1.3) * 3.4;
        limb(fingers, [bx, by], [bx + Math.sin(a) * len, by - Math.cos(a) * len], 10.5, 8.6);
      }
      const thumb = new Path2D();
      limb(thumb, [cx + d * 20, cy + 16], [cx + d * 35, cy - 6], 11.5, 9);
      const palm = new Path2D();
      palm.moveTo(cx - d * 28, cy - 6);
      palm.bezierCurveTo(cx - d * 31, cy + 16, cx - d * 18, cy + 32, cx + d * 3, cy + 32);
      palm.bezierCurveTo(cx + d * 22, cy + 32, cx + d * 30, cy + 18, cx + d * 27, cy - 4);
      palm.quadraticCurveTo(cx, cy - 12, cx - d * 28, cy - 6);
      ctx.fillStyle = hg; ctx.fill(fingers);
      ctx.strokeStyle = ink; ctx.lineWidth = 0.9; ctx.stroke(fingers);
      ctx.fillStyle = hg; ctx.fill(thumb); ctx.stroke(thumb);
      ctx.fillStyle = hg; ctx.fill(palm); ctx.stroke(palm);
      // ногти и складка ладони — светлыми и тёмными движками
      ctx.globalAlpha = 0.55;
      for (let i = 0; i < 4; i++) {
        const bx = cx + d * (-21 + i * 11.5), by = cy - 4 + Math.abs(i - 1.5) * 2.6;
        const a = d * (-0.3 + i * 0.13), len = 25 - Math.abs(i - 1.3) * 3.4;
        brushLine(ctx, [[bx + Math.sin(a) * (len - 7), by - Math.cos(a) * (len - 7)], [bx + Math.sin(a) * (len - 2), by - Math.cos(a) * (len - 2)]], 1.2, '#fff0d8', Prof.hair);
      }
      brushLine(ctx, [[cx - d * 17, cy + 10], [cx - d * 2, cy + 17], [cx + d * 14, cy + 12]], 1.1, 'rgba(120,58,26,0.8)', Prof.hair);
      ctx.globalAlpha = 1;
      sil.addPath(fingers); sil.addPath(thumb); sil.addPath(palm);
    };
    hand(-36, hy, 1);
    hand(38, hy + 4, -1);
  }
  // тёплый отсвет огня на лице и руках
  if (o.light && o.light[2] > 0) {
    const [lx, ly, k] = o.light;
    ctx.save();
    ctx.clip(sil);
    const g = ctx.createRadialGradient(lx, ly, 10, lx, ly, 230);
    g.addColorStop(0, `rgba(255,190,90,${0.55 * k})`);
    g.addColorStop(0.4, `rgba(255,130,50,${0.28 * k})`);
    g.addColorStop(1, 'rgba(255,100,40,0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g; ctx.fillRect(-300, -300, 600, 600);
    ctx.restore();
  }
  ctx.restore();
  void t;
}
