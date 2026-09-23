'use strict';
/* ==========================================================================
   Кот-фонарщик · art-more.js
   Луна (тело + ломтик, который она отдаст), лунная дорожка, мышонок в лодке,
   рыба, дым, чайки, кот анфас для крупных планов, интертитры.
   ========================================================================== */

/* ---------- Луна: круг R=260, ломтик — серп слева, между кругом и сдвинутым кругом ---------- */
const MOON_R = 260, MOON_C2 = [60, 0], MOON_R2 = 250;
function moonShapes() {
  const R = MOON_R, [cx2, cy2] = MOON_C2, R2 = MOON_R2;
  const xi = (R * R - R2 * R2 + cx2 * cx2) / (2 * cx2), yi = Math.sqrt(R * R - xi * xi);
  const aD = Math.atan2(yi, xi), aD2 = Math.atan2(yi, xi - cx2);
  const body = [], sliver = [], n = 90;
  for (let k = 0; k <= n; k++) { const a = -aD + (2 * aD * k) / n; body.push(Math.cos(a) * R, Math.sin(a) * R); }
  for (let k = 0; k <= n; k++) { const a = aD2 + ((TAU - 2 * aD2) * k) / n; body.push(cx2 + Math.cos(a) * R2, cy2 + Math.sin(a) * R2); }
  for (let k = 0; k <= n; k++) { const a = aD + ((TAU - 2 * aD) * k) / n; sliver.push(Math.cos(a) * R, Math.sin(a) * R); }
  for (let k = 0; k <= n; k++) { const a = TAU - aD2 - ((TAU - 2 * aD2) * k) / n; sliver.push(cx2 + Math.cos(a) * R2, cy2 + Math.sin(a) * R2); }
  return { body: [body], sliver: [sliver] };
}
function moonParts() {
  const S = moonShapes();
  const craters = (p, seed) => {
    const r = rng(seed);
    for (let i = 0; i < 9; i++) {
      const a = r() * TAU, d = r() * 200, x = Math.cos(a) * d + 30, y = Math.sin(a) * d, rr = 16 + r() * 34;
      p.paint(ell(x, y, rr, rr * (0.8 + r() * 0.3), r()), PAL.moonD, 0.55, { k: 2 });
      p.paint(ell(x - rr * 0.2, y - rr * 0.25, rr * 0.55, rr * 0.4, r()), PAL.moonL, 0.35, { k: 1.5 });
    }
  };
  def('moon.body', { res: 1, em: true, draw(g) {
    g.paper(S.body, PAL.moon, { k: 2, mottle: 0.9, grain: 0.8, bevel: 0.6, draw: (p) => { craters(p, 7); p.glow(-40, -60, 200, '#FFFBEE', 0.35); } });
  } });
  def('moon.sliver', { res: 1, em: true, draw(g) {
    g.paper(S.sliver, PAL.moon, { k: 1.6, mottle: 0.9, grain: 0.8, bevel: 0.7, draw: (p) => craters(p, 7) });
  } });
  // черты лица Луны — на теле, лицо чуть повёрнуто к коту (влево)
  def('moon.eye.closed', { res: 1.2, em: true, draw(g) {
    g.line(parsePath('M -26 0 Q 0 18 26 0')[0], 5, '#8A6A4A', 0.95);
    for (let i = 0; i < 4; i++) g.line([-18 + i * 12, 9 - (i === 0 || i === 3 ? 2 : 0), -21 + i * 13.5, 17], 2.6, '#8A6A4A', 0.9);
  } });
  def('moon.eye.open', { res: 1.2, em: true, draw(g) {
    g.paper(ell(0, 0, 26, 21), '#FFFCF2', { edge: 'fine', k: 1, bevel: 0.4 });
    g.line(parsePath('M -28 -4 Q 0 -30 28 -4')[0], 5, '#8A6A4A', 0.95);
  } });
  def('moon.pupil', { res: 1.2, em: true, draw(g) { g.paint(ell(0, 0, 11, 13), '#3A3050', 1, { edge: 'fine' }); g.dot(4, -5, 3.4, '#FFFFFF'); } });
  def('moon.lid', { res: 1.2, em: true, draw(g) { g.paper(parsePath('M -29 2 Q 0 -32 29 2 Q 0 -8 -29 2 Z'), PAL.moon, { edge: 'fine', k: 1, bevel: 0.3 }); g.line(parsePath('M -28 1 Q 0 -8 28 1')[0], 4.6, '#8A6A4A', 0.95); } });
  def('moon.mouth.sleep', { res: 1.2, em: true, draw(g) { g.line(parsePath('M -16 0 Q 0 8 16 0')[0], 4.4, '#9A6A52', 0.9); } });
  def('moon.mouth.smile', { res: 1.2, em: true, draw(g) { g.line(parsePath('M -34 -6 Q 0 26 34 -6')[0], 5, '#9A6A52', 0.95); g.line([-37, -9, -31, -2], 3.6, '#9A6A52', 0.9); g.line([37, -9, 31, -2], 3.6, '#9A6A52', 0.9); } });
  def('moon.mouth.o', { res: 1.2, em: true, draw(g) { g.paint(ell(0, 4, 13, 15), '#9A5E4E', 0.95, { edge: 'fine' }); } });
  def('moon.cheek', { res: 1, em: true, draw(g) { g.glow(0, 0, 38, '#F2A48C', 0.5); } });
  def('moon.nose', { res: 1.2, em: true, draw(g) { g.line(parsePath('M -2 -22 Q -14 4 4 8')[0], 4, '#B89468', 0.7); } });
}

/* ---------- лунная дорожка: блики на воде, светятся сами ---------- */
function glintParts() {
  for (let k = 0; k < 3; k++) def('glint.' + k, { res: 1.6, em: true, draw(g) {
    const w = [26, 18, 34][k], h = [3.4, 2.6, 4.4][k];
    g.paint(parsePath(`M ${-w} 0 Q 0 ${-h * 1.4} ${w} 0 Q 0 ${h * 1.1} ${-w} 0 Z`), '#F7E7B2', 0.95, { edge: 'fine' });
    g.paint(parsePath(`M ${-w * 0.6} 0 Q 0 ${-h * 0.8} ${w * 0.6} 0 Q 0 ${h * 0.5} ${-w * 0.6} 0 Z`), '#FFFBEA', 1, { edge: 'fine' });
  } });
  def('glint.step', { res: 2, em: true, draw(g) {
    g.paint(parsePath('M -30 0 Q 0 -7 30 0 Q 0 6 -30 0 Z'), '#FFF1C4', 1, { edge: 'fine' });
    g.glow(0, 0, 36, '#FFF6D8', 0.55);
  } });
  def('spark', { res: 2, em: true, draw(g) { g.dot(0, 0, 2.2, '#FFF3C8'); g.glow(0, 0, 6, '#FFD27A', 0.8); } });
  for (let k = 0; k < 3; k++) def('puff.' + k, { res: 1.6, draw(g) {
    const r = rng(60 + k), pts = [];
    for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU, rr = 12 + r() * 7; pts.push(Math.cos(a) * rr, Math.sin(a) * rr * 0.85); }
    g.paper([pts], ['#7D7494', '#8A82A0', '#6F6888'][k], { edge: 'torn', rim: '#A59DBA', rimW: 0.8, k: 0.7, mottle: 0.5 });
  } });
  def('gull', { res: 1.2, draw(g) { g.line(parsePath('M -14 -2 Q -7 -8 0 0 Q 7 -8 14 -2')[0], 2.4, '#2A2638', 0.95); } });
  def('gull.dn', { res: 1.2, draw(g) { g.line(parsePath('M -13 5 Q -7 -3 0 0 Q 7 -3 13 5')[0], 2.4, '#2A2638', 0.95); } });
}

/* ---------- мышонок-рыбак, лодка, рыба ---------- */
const MOUSEC = { fur: '#8E858C', furD: '#6E6670', coat: '#E0B040', coatD: '#B98A2A', ear: '#E6A3A0', hat: '#E7B846' };
function mouseParts() {
  const sh = { dx: 1.4, dy: 2, blur: 2, a: 0.36 };
  def('boat.hull', { res: 1.4, shadow: SHADOW, draw(g) {
    g.paper(parsePath('M -82 -14 L 86 -18 Q 80 10 60 18 L -58 18 Q -80 8 -82 -14 Z'), PAL.wood, { grad: [0.1, -0.2], draw: (p) => {
      p.line([-78, -4, 82, -8], 1.4, PAL.woodD, 0.8); p.line([-70, 7, 74, 4], 1.4, PAL.woodD, 0.7);
      p.paint(parsePath('M -80 -14 L 86 -18 L 85 -12 L -79 -8 Z'), '#C9573E', 0.9);
    } });
    g.paper(rect(-60, -20, 4, 8), PAL.woodD, { k: 0.5 });
  } });
  def('boat.mast', { res: 1.4, shadow: SHADOW, draw(g) { g.paper(rect(-2.5, -150, 5, 150), PAL.woodD, { k: 0.5 }); g.paper(rect(-3, -154, 6, 6), PAL.wood, { k: 0.4 }); } });
  def('boat.sail', { res: 1.4, shadow: SHADOW, draw(g) {
    g.paper(parsePath('M 0 0 Q 40 60 52 130 L 0 132 Z'), '#EADFC4', { k: 0.8, draw: (p) => { p.paint(rect(12, 70, 18, 16), '#D7C49E', 0.9); p.line([0, 44, 26, 44], 1, '#BFAE8A', 0.7); p.line([0, 88, 44, 88], 1, '#BFAE8A', 0.7); } });
  } });
  def('boat.pennant', { res: 1.6, draw(g) { g.paper(parsePath('M 0 -3 L 20 0 L 0 3 Z'), '#C9473F', { edge: 'fine', k: 0.4 }); } });
  def('mouse.body', { res: 2.2, shadow: sh, draw(g) {
    g.paper(parsePath('M -12 0 C -15 -14 -12 -30 0 -34 C 11 -36 16 -22 14 -8 C 13 -2 10 2 0 2 Z'), MOUSEC.coat, { k: 0.6, grad: [0.15, -0.15], draw: (p) => {
      p.line([2, -32, 1, 0], 1, MOUSEC.coatD, 0.8); p.dot(4, -24, 1.2, MOUSEC.coatD); p.dot(4, -14, 1.2, MOUSEC.coatD);
    } });
  } });
  def('mouse.head', { res: 2.4, shadow: sh, draw(g) {
    g.paper(parsePath('M 10 -4 C 12 -16 4 -24 -6 -22 C -14 -20 -20 -14 -26 -9 C -29 -7 -28 -4 -25 -4 C -16 -3 -4 2 4 1 C 8 0 10 -2 10 -4 Z'), MOUSEC.fur, { k: 0.6, grad: [0.12, -0.12] });
    g.dot(-27, -6.4, 2.2, '#3A2830');
    g.dot(-10, -14, 2.3, '#1E1824'); g.dot(-10.6, -14.8, 0.7, '#FFFFFF');
    g.line([-24, -6, -38, -10], 0.5, '#EDE6DA', 0.8); g.line([-24, -5, -38, -4], 0.5, '#EDE6DA', 0.8);
  } });
  def('mouse.ear', { res: 2.4, shadow: sh, draw(g) { g.paper(ell(0, -9, 9, 10), MOUSEC.fur, { k: 0.5 }); g.paint(ell(0.5, -8.5, 5.6, 6.6), MOUSEC.ear, 0.95, { edge: 'fine' }); } });
  def('mouse.hat', { res: 2.4, shadow: sh, draw(g) {
    g.paper(parsePath('M -12 0 C -12 -10 -4 -16 4 -15 C 12 -14 14 -7 13 0 Z'), MOUSEC.hat, { k: 0.5, grad: [0.18, -0.1] });
    g.paper(parsePath('M -20 -1 L 22 -2 Q 26 5 18 7 L -14 8 Q -24 6 -20 -1 Z'), shade(MOUSEC.hat, -0.08), { k: 0.5 });
  } });
  def('mouse.arm', { res: 2.4, shadow: sh, draw(g) { g.paper(limb(0, 0, 0, 16, 6, 5), MOUSEC.coat, { k: 0.5 }); g.paper(ell(0, 18, 3.4, 3.2), MOUSEC.fur, { k: 0.4 }); } });
  def('mouse.tail', { res: 2, shadow: sh, draw(g) { g.line(parsePath('M 0 0 C 10 4 18 -4 26 -12 C 30 -16 34 -14 36 -10')[0], 2.2, '#C9A7A4', 1); } });
  def('fish', { res: 2.4, shadow: SHADOW, draw(g) {
    g.paper(parsePath('M -30 0 C -20 -12 6 -14 20 -3 L 32 -12 Q 30 0 32 12 L 20 3 C 6 14 -20 12 -30 0 Z'), '#9FB4C4', { k: 0.6, grad: [0.25, -0.2], draw: (p) => {
      for (let i = 0; i < 5; i++) for (let j = -1; j <= 1; j++) p.line(parsePath(`M ${-10 + i * 6} ${j * 4 - 2} q 3 2 0 4`)[0] || [], 0.6, '#6F8798', 0.6);
      p.paint(parsePath('M -26 2 C -14 8 4 8 18 2 L 18 4 C 4 11 -16 10 -26 2 Z'), '#E5EEF0', 0.7);
    } });
    g.dot(-20, -3, 2.2, '#1F1A26'); g.dot(-20.5, -3.6, 0.7, '#FFFFFF');
  } });
}
/* мышонок в лодке → элементы: фигура сидит, лодка качается */
function boatWithMouse(S, T, X, Y, d, o = {}) {
  const k = o.k ?? 1, face = o.face ?? -1, bob = Math.sin(T * 1.6 + 0.4) * 3 * k + (o.dy || 0), rock = Math.sin(T * 1.25) * 0.045 + (o.rock || 0);
  const B = mMul(mTRS(X, Y + bob, rock, k * face, k), M_ID);
  const push = (s, m, z, a = 1) => S.items.push({ s, m, d, z: 60 + z, a });
  push('boat.mast', mMul(B, mTRS(10, -12)), 0);
  const luff = 1 + 0.06 * Math.sin(T * 5.2) * (o.wind ?? 1);
  push('boat.sail', mMul(B, mTRS(12, -150, 0, luff, 1)), 0.1);
  push('boat.pennant', mMul(B, mTRS(10, -154, 0, 1 + 0.2 * Math.sin(T * 9), 1)), 0.2);
  if (!o.noMouse) {
    // голова мышонка нарисована носом влево; фигурку отражаем, чтобы face = −1 значило «смотрит влево»
    const M = mMul(B, mTRS(-12, -14, o.lean || 0, -1, 1));
    push('mouse.tail', mMul(M, mTRS(10, -4, -0.2 + 0.2 * Math.sin(T * 2))), 0.3);
    push('mouse.body', M, 0.4);
    const H = mMul(M, mTRS(1, -32, (o.head || 0) + 0.04 * Math.sin(T * 2.3)));
    push('mouse.ear', mMul(H, mTRS(-2, -16, -0.2)), 0.45);
    push('mouse.head', H, 0.5);
    if (!o.hatOff) push('mouse.hat', mMul(H, mTRS(-4, -18, -0.1)), 0.6);
    push('mouse.arm', mMul(M, mTRS(-4, -26, o.arm ?? 0.2)), 0.7);
    if (o.hatOff) push('mouse.hat', mMul(mMul(M, mTRS(-4, -26, o.arm ?? 0.2)), mTRS(0, 20, 2.6)), 0.8);
    if (o.fish) push('fish', mMul(mMul(M, mTRS(-4, -26, o.arm ?? 0.2)), mTRS(0, 22, 1.4, 0.8, 0.8)), 0.75);
  }
  push('boat.hull', B, 1);
}

/* ---------- кот анфас: кукла для крупных планов ---------- */
function catFaceParts() {
  const F = CATC, sh = { dx: 3, dy: 4.5, blur: 5, a: 0.38 };
  def('cf.body', { res: 1.4, shadow: sh, draw(g) {
    g.paper(parsePath('M -150 260 C -140 120 -90 40 0 36 C 90 40 140 120 150 260 Z'), F.fur, { k: 1.6, grad: [0.05, -0.2], draw: (p) => {
      p.paint(parsePath('M -60 260 C -58 150 -30 90 0 88 C 30 90 58 150 60 260 Z'), F.belly, 1, { k: 1.4 });
      p.brush([-130, 150, -104, 160, -86, 176], 10, 6, F.furD, 0.8);
      p.brush([130, 150, 104, 160, 86, 176], 10, 6, F.furD, 0.8);
    } });
    g.paper(parsePath('M -104 58 C -60 84 60 84 104 58 C 110 74 104 96 90 104 C 50 120 -50 120 -90 104 C -104 96 -110 74 -104 58 Z'), F.scarf, { k: 1.4, draw: (p) => {
      for (let i = -3; i <= 3; i++) p.line([i * 28 - 6, 64 + Math.abs(i) * 3, i * 28 + 2, 112 - Math.abs(i) * 2], 8, F.scarfL, 0.9);
    } });
    g.paper(parsePath('M 40 96 C 58 104 66 150 56 200 L 30 198 C 36 160 34 120 28 104 Z'), shade(F.scarf, -0.06), { k: 1.2, draw: (p) => { p.line([30, 140, 60, 142], 8, F.scarfL, 0.9); } });
  } });
  def('cf.head', { res: 1.4, shadow: sh, draw(g) {
    g.paper(parsePath('M -132 10 L -150 40 L -122 36 L -140 70 L -104 56 L -96 84 L -70 70 C -40 92 40 92 70 70 L 96 84 L 104 56 L 140 70 L 122 36 L 150 40 L 132 10 C 136 -60 90 -112 0 -114 C -90 -112 -136 -60 -132 10 Z'), F.fur, { k: 1.6, grad: [0.1, -0.12], draw: (p) => {
      p.brush([0, -112, 0, -96, 0, -80], 12, 7, F.furD, 0.9);
      p.brush([-28, -108, -24, -92, -20, -78], 10, 6, F.furD, 0.85);
      p.brush([28, -108, 24, -92, 20, -78], 10, 6, F.furD, 0.85);
      p.brush([-128, -10, -108, -6, -92, 0], 9, 5, F.furD, 0.8);
      p.brush([128, -10, 108, -6, 92, 0], 9, 5, F.furD, 0.8);
      p.brush([-126, 14, -108, 16, -94, 20], 8, 4, F.furD, 0.75);
      p.brush([126, 14, 108, 16, 94, 20], 8, 4, F.furD, 0.75);
      p.paint(ell(-36, 38, 40, 30), F.belly, 1, { k: 1.2 });
      p.paint(ell(36, 38, 40, 30), F.belly, 1, { k: 1.2 });
      p.paint(ell(0, 64, 26, 16), F.belly, 1, { k: 1.2 });
    } });
  } });
  const ear = (id, s) => def(id, { res: 1.4, shadow: sh, draw(g) {
    g.paper(parsePath(`M ${-s * 0} 0 C ${s * 4} -30 ${s * 16} -62 ${s * 36} -84 C ${s * 50} -54 ${s * 60} -24 ${s * 64} 8 Z`), F.fur, { k: 1.2 });
    g.paint(parsePath(`M ${s * 12} -2 C ${s * 16} -26 ${s * 24} -48 ${s * 36} -64 C ${s * 44} -44 ${s * 50} -22 ${s * 52} 2 Z`), F.ear, 0.95, { k: 1 });
  } });
  ear('cf.earL', -1); ear('cf.earR', 1);
  def('cf.eye', { res: 1.6, draw(g) {
    g.paper(parsePath('M -34 4 C -30 -26 24 -34 34 -2 C 30 26 -26 32 -34 4 Z'), F.iris, { k: 1, bevel: 0.6, grad: [0.18, -0.12] });
  } });
  def('cf.pupil', { res: 1.6, draw(g) { g.paint(ell(0, 0, 11, 22), F.pupil, 1, { edge: 'fine' }); g.dot(5, -9, 5, '#FFFCF0'); g.dot(-4, 8, 2.2, '#FFFCF0', 0.8); } });
  def('cf.pupilR', { res: 1.6, draw(g) { g.paint(ell(0, 0, 19, 22), F.pupil, 1, { edge: 'fine' }); g.dot(6, -9, 6, '#FFFCF0'); g.dot(-6, 8, 2.6, '#FFFCF0', 0.8); } });
  def('cf.lid', { res: 1.6, draw(g) {
    // веко: верхняя половина глаза цвета шерсти с тёмной кромкой; поворачивается и опускается
    g.paper(parsePath('M -40 -40 L 40 -40 L 40 0 C 20 -8 -20 -8 -40 0 Z'), F.fur, { edge: 'fine', k: 0.8, bevel: 0.3 });
    g.line(parsePath('M -38 0 C -20 -8 20 -8 38 0')[0], 4, F.pupil, 1);
  } });
  def('cf.brow', { res: 1.6, shadow: { dx: 1, dy: 1.5, blur: 1.5, a: 0.3 }, draw(g) { g.brush([-22, 3, 0, -3, 22, 2], 10, 6, F.furD, 1); } });
  def('cf.nose', { res: 1.6, shadow: { dx: 1, dy: 1.5, blur: 1.5, a: 0.3 }, draw(g) { g.paper(parsePath('M -14 -6 Q 0 -10 14 -6 Q 8 6 0 9 Q -8 6 -14 -6 Z'), F.nose, { edge: 'fine', k: 0.8 }); } });
  def('cf.mouth.n', { res: 1.6, draw(g) { g.line([0, -2, 0, 6, -10, 12, -18, 9], 3, '#5A2B26', 1); g.line([0, 6, 10, 12, 18, 9], 3, '#5A2B26', 1); } });
  def('cf.mouth.smile', { res: 1.6, draw(g) { g.line([0, -2, 0, 5, -12, 14, -24, 8], 3.2, '#5A2B26', 1); g.line([0, 5, 12, 14, 24, 8], 3.2, '#5A2B26', 1); } });
  def('cf.mouth.sad', { res: 1.6, draw(g) { g.line([0, -2, 0, 7], 3, '#5A2B26', 1); g.line(parsePath('M -16 16 Q 0 4 16 16')[0], 3, '#5A2B26', 1); } });
  def('cf.mouth.o', { res: 1.6, draw(g) { g.line([0, -2, 0, 5], 3, '#5A2B26', 1); g.paint(ell(0, 15, 9, 10), '#5A2226', 1, { edge: 'fine' }); g.paint(ell(0, 20, 5, 3.4), '#D97C78', 1, { edge: 'fine' }); } });
  const wh = (id, s) => def(id, { res: 1.4, draw(g) { for (let i = 0; i < 3; i++) g.line(parsePath(`M 0 ${i * 8} Q ${s * 50} ${i * 8 - 10 + i * 4} ${s * 104} ${i * 14 - 14}`)[0], 1.6, '#FFF8E6', 0.9); } });
  wh('cf.whL', -1); wh('cf.whR', 1);
  def('cf.cap', { res: 1.4, shadow: sh, draw(g) {
    g.paper(parsePath('M -96 0 C -100 -50 -50 -84 0 -84 C 50 -84 100 -50 96 0 Z'), F.cap, { k: 1.4, grad: [0.18, -0.15] });
    g.paper(rect(-98, -12, 196, 18), F.capD, { k: 1.2 });
    g.paper(parsePath('M -84 4 Q 0 -6 84 4 Q 90 22 60 24 Q 0 16 -60 24 Q -90 22 -84 4 Z'), '#17172A', { k: 1.2 });
    g.paper(ell(0, -38, 12, 12), F.brass, { k: 0.9 });
  } });
}

/* ---------- интертитры: карточки кремовой бумаги с тушью ---------- */
const FONT_TEXT = '"Kurale", "PT Serif", Georgia, serif';
function cardParts() {
  def('card.moral', { res: 1.1, shadow: { dx: 5, dy: 8, blur: 12, a: 0.42 }, font: true, draw(g) {
    g.paper(rect(-430, -104, 860, 208), '#EFE3C7', { edge: 'torn', rim: '#FBF5E6', k: 2, grad: [0.06, -0.1], mottle: 0.8 });
    g.text('Вот почему Луна иногда худеет:', 0, -16, `46px ${FONT_TITLE}`, '#2C2236', { h: 44 });
    g.text('она делится светом.', 0, 48, `46px ${FONT_TITLE}`, '#2C2236', { h: 44 });
  } });
  def('card.end', { res: 1.1, shadow: { dx: 5, dy: 8, blur: 12, a: 0.42 }, font: true, draw(g) {
    g.paper(ell(0, 0, 170, 74), '#EFE3C7', { edge: 'torn', rim: '#FBF5E6', k: 2, grad: [0.06, -0.1] });
    g.text('Конец', 0, 18, `64px ${FONT_TITLE}`, '#2C2236', { h: 56 });
  } });
}

/* ---------- мелочи для сцен у моря ---------- */
function seaProps() {
  def('lamp.postP', { res: 1.2, shadow: SHADOW, draw(g) {
    g.paper(limb(0, 0, 0, 156, 7, 9), PAL.iron, { k: 0.8 });
    g.paper(parsePath('M -3 12 C -3 -10 22 -18 34 -6 C 42 3 34 14 26 9 C 19 5 24 -3 29 0 C 29 -8 14 -8 7 6 L 7 18 Z'), PAL.iron, { k: 0.7 });
    g.paper(rect(-9, 28, 18, 7), PAL.ironL, { k: 0.6 });
    g.paper(rect(-15, 146, 30, 12), PAL.iron, { k: 0.7 });
    g.paper(rect(-12, 64, 24, 5), PAL.ironL, { k: 0.5 });
  } });
  def('ripple', { res: 1.6, em: true, draw(g) {
    const r = ell(0, 0, 40, 7)[0], q = [];
    for (let i = 0; i < r.length; i += 2) q.push(r[i], r[i + 1]);
    q.push(r[0], r[1]);
    g.line(q, 2.4, '#F4E4B4', 0.9, { wob: 0.2 });
  } });
  // луч фонаря над водой: мягкий клин, рисуется сложением цветов
  def('beam', { res: 0.6, em: true, draw(g) {
    if (g.m) { g.grow([0, -150, 1400, 150]); return; }
    const ctx = g.x, gr = ctx.createLinearGradient(0, 0, 1400, 0);
    gr.addColorStop(0, 'rgba(255,236,190,0.34)'); gr.addColorStop(0.5, 'rgba(255,226,170,0.12)'); gr.addColorStop(1, 'rgba(255,220,160,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(1400, -150); ctx.lineTo(1400, 150); ctx.lineTo(0, 10); ctx.closePath(); ctx.fill();
  } });
  // размытые фоны крупных планов: огни гавани и светящаяся Луна
  // размытые фоны почти без мелких деталей: хватает половины экранной плотности
  def('bg.harbor', { res: 0.45, maxQ: 0.6, draw(g) {
    g.paper(rect(-900, -520, 1800, 1040), '#1B1F44', { edge: 'clean', bevel: 0, grad: [0.05, -0.2], mottle: 0.6 });
    g.paint(rect(-900, 140, 1800, 400), '#16223F', 0.9, { edge: 'clean' });
    const r = rng(12);
    for (let i = 0; i < 26; i++) {
      const x = -900 + r() * 1100, y = -80 + r() * 260, rr = 18 + r() * 40;
      g.glow(x, y, rr, i % 3 ? '#FFC065' : '#FFE0A0', 0.35 + r() * 0.35, 0.55);
    }
    for (let i = 0; i < 18; i++) { const x = 300 + r() * 600, y = 150 + r() * 250; g.glow(x, y, 10 + r() * 16, '#8FA0D8', 0.2, 0.5); }
  } });
  def('bg.moonlit', { res: 0.45, maxQ: 0.6, em: true, draw(g) {
    g.paper(rect(-900, -520, 1800, 1040), '#EFE0BA', { edge: 'clean', bevel: 0, mottle: 1, grain: 0.6 });
    const r = rng(19);
    for (let i = 0; i < 14; i++) g.glow(-900 + r() * 1800, -520 + r() * 1040, 60 + r() * 120, '#D9C595', 0.35);
    g.glow(-200, -200, 700, '#FFF8E6', 0.5);
  } });
  // веки кота анфас: заготовки, обрезанные по форме глаза (правый глаз; левый — зеркально)
  const almond = parsePath('M -34 4 C -30 -26 24 -34 34 -2 C 30 26 -26 32 -34 4 Z');
  const lid = (id, yi, yo) => def(id, { res: 1.6, draw(g) {
    const edge = parsePath(`M -44 ${yi} Q 0 ${(yi + yo) / 2 - 6} 44 ${yo}`)[0];
    g.clip(almond, (p) => {
      const poly = [-50, -60, 50, -60, 50, yo];
      for (let i = edge.length / 2 - 1; i >= 0; i--) poly.push(edge[2 * i], edge[2 * i + 1]);
      poly.push(-50, yi);
      p.paper([poly], CATC.fur, { edge: 'fine', k: 0.6, bevel: 0.2 });
      p.line(edge, 4.2, CATC.pupil, 1, { wob: 0.05 });
    });
  } });
  lid('cf.lid.q', -18, -16); lid('cf.lid.h', -2, -4); lid('cf.lid.c', 40, 40);
  lid('cf.lid.sad', -26, 2); lid('cf.lid.det', 4, -20);
  def('cf.eye.happy', { res: 1.6, draw(g) { g.line(parsePath('M -32 8 Q 0 -26 32 6')[0], 6, CATC.pupil, 1); } });
  def('cf.lash', { res: 1.6, draw(g) { g.line(parsePath('M -34 4 C -30 -26 24 -34 34 -2')[0], 4, CATC.pupil, 1, { wob: 0.05 }); } });
}
