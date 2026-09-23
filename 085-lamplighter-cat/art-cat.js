'use strict';
/* ==========================================================================
   Кот-фонарщик · art-cat.js
   Кукла-перекладка кота: каждая деталь — отдельный кусок бумаги со своей
   точкой шарнира (0,0). Плюс сменные глаза и рты, шапка, шарф, шест.
   ========================================================================== */

const CATC = {
  fur: '#D9853A', furD: '#B0612A', furF: '#B86D33', furL: '#EBA75E',
  belly: '#F3DFB8', nose: '#C66A62', ear: '#E9A08C', iris: '#D7CD5C', pupil: '#231C2A',
  scarf: '#B8392F', scarfL: '#EAD6AA', cap: '#2E3462', capD: '#1E2345', brass: '#D3AC57',
  pole: '#6F4B2E', poleL: '#8E6440',
};
const CSH = { dx: 1.6, dy: 2.3, blur: 2.4, a: 0.38 };

function catParts() {
  const fur = CATC.fur, furF = CATC.furF;
  /* --- голова (профиль вправо), шарнир — шея --- */
  def('cat.head', {
    res: 2.5, shadow: CSH,
    draw(g) {
      const skull = parsePath('M -6 -2 C -20 -6 -24 -22 -16 -34 C -8 -44 12 -45 22 -36 C 29 -30 33 -24 34 -19 C 36 -15 36 -9 30 -6 C 24 -2 14 0 4 0 C 0 0 -3 -1 -6 -2 Z');
      const ruff = parsePath('M -12 -12 L -22 -9 L -15 -5 L -21 0 L -9 -1 L -12 4 L 0 0 Z');
      g.paper(ruff, fur, { k: 0.8 });
      g.paper(skull, fur, { k: 0.9, grad: [0.1, -0.12], draw: (p) => {
        p.brush([-4, -41, -1, -35, 0, -30], 3.2, 2.2, CATC.furD, 0.9);
        p.brush([4, -43, 6, -37, 6, -32], 3.4, 2.4, CATC.furD, 0.9);
        p.brush([-12, -36, -8, -32, -6, -28], 3, 2, CATC.furD, 0.85);
        p.brush([-15, -20, -8, -19, -3, -17], 2.6, 1.8, CATC.furD, 0.8);
        p.brush([-15, -14, -8, -13, -4, -12], 2.4, 1.6, CATC.furD, 0.75);
        p.paint(ell(8, -32, 10, 6, -0.3), CATC.furL, 0.45);
      } });
      g.paper(parsePath('M 17 -17 C 22 -23 32 -22 35 -17 C 37 -12 34 -7 27 -6 C 21 -6 16 -10 17 -17 Z'), CATC.belly, { k: 0.7 });
      g.paper(parsePath('M 12 -7 C 16 -9 24 -8 26 -5 C 25 -1 18 1 13 -1 Z'), CATC.belly, { k: 0.6 });
      g.paper(parsePath('M 31.5 -21 Q 36.5 -21 36 -18 Q 34.5 -15 32.5 -16 Q 30 -18 31.5 -21 Z'), CATC.nose, { edge: 'fine', k: 0.6 });
      g.line([30, -13, 50, -19], 0.55, '#FFF8E6', 0.85, { wob: 0.15 });
      g.line([30, -11, 51, -12], 0.55, '#FFF8E6', 0.85, { wob: 0.15 });
      g.line([29, -9, 48, -5], 0.55, '#FFF8E6', 0.85, { wob: 0.15 });
    },
  });
  const ear = (id, c) => def(id, {
    res: 2.5, shadow: CSH,
    draw(g) {
      g.paper(parsePath('M -8 2 C -7 -6 -3 -14 1 -19 C 5 -13 8 -6 8 2 Z'), c, { k: 0.7 });
      g.paint(parsePath('M -4 1 C -3 -5 -1 -10 1 -13 C 3 -9 5 -4 5 1 Z'), CATC.ear, 0.95, { edge: 'fine' });
    },
  });
  ear('cat.earN', fur); ear('cat.earF', CATC.furD);

  /* --- сменные глаза: шарнир в центре глаза --- */
  const almond = 'M -5.6 0.4 Q -1.5 -5.4 5.6 -1.6 Q 1.8 4.2 -5.6 0.4 Z';
  def('cat.eye.open', { res: 3, draw(g) {
    g.paper(almond, CATC.iris, { edge: 'fine', k: 0.5, bevel: 0.4 });
    g.line([-5.8, 0.3, -1.5, -5.2, 5.8, -1.6], 1.1, CATC.pupil, 1, { wob: 0.05 });
  } });
  def('cat.eye.wide', { res: 3, draw(g) {
    g.paper(ell(0, -1, 5.6, 5), CATC.iris, { edge: 'fine', k: 0.5, bevel: 0.4 });
    g.line(parsePath('M -5.6 -1.5 Q 0 -7 5.6 -2')[0] || [], 1.1, CATC.pupil, 1, { wob: 0.05 });
  } });
  def('cat.eye.half', { res: 3, draw(g) {
    g.paper(almond, CATC.iris, { edge: 'fine', k: 0.5, bevel: 0.3 });
    g.paint(parsePath('M -6 -0.6 Q -1.5 -6 6 -2 L 6 -0.4 Q 0 -1.6 -6 1 Z'), CATC.fur, 1, { edge: 'fine' });
    g.line([-6, 0.8, 0, -1.4, 6, -0.6], 1.1, CATC.pupil, 1, { wob: 0.05 });
  } });
  def('cat.eye.closed', { res: 3, draw(g) { g.line([-5.6, -0.6, -1.5, 1.8, 5.4, -0.8], 1.3, CATC.pupil, 1, { wob: 0.05 }); } });
  def('cat.eye.happy', { res: 3, draw(g) { g.line([-5.4, 1.2, -0.5, -3, 5.4, 0.8], 1.4, CATC.pupil, 1, { wob: 0.05 }); } });
  def('cat.eye.sad', { res: 3, draw(g) {
    g.paper(almond, CATC.iris, { edge: 'fine', k: 0.5, bevel: 0.3 });
    g.paint(parsePath('M -6 -4 L 6 -4 L 6 -0.4 L -6 -2.6 Z'), CATC.fur, 1, { edge: 'fine' });
    g.line([-6, -2.4, 6, -0.4], 1.1, CATC.pupil, 1, { wob: 0.05 });
  } });
  def('cat.pupil', { res: 3, draw(g) { g.paint(ell(0, 0, 1.7, 3.4), CATC.pupil, 1, { edge: 'fine' }); g.dot(0.6, -1.4, 0.7, '#FFFBEF'); } });
  def('cat.pupil.round', { res: 3, draw(g) { g.paint(ell(0, 0, 2.8, 3), CATC.pupil, 1, { edge: 'fine' }); g.dot(1, -1.2, 0.9, '#FFFBEF'); } });
  def('cat.brow', { res: 3, draw(g) { g.brush([-4, 0.5, 0, -0.6, 4, 0], 2.2, 1.4, CATC.furD, 1); } });

  /* --- сменные рты: шарнир под носом --- */
  def('cat.mouth.n', { res: 3, draw(g) { g.line([-3.4, -1, -1.6, 1.2, 0, 0, 1.4, 1.6, 3, 0.6], 0.9, '#5A2B26', 1, { wob: 0.05 }); } });
  def('cat.mouth.smile', { res: 3, draw(g) { g.line([-4.6, -1.6, -2.4, 1.6, 0, 0.4, 2, 2.2, 4.2, 0], 1, '#5A2B26', 1, { wob: 0.05 }); } });
  def('cat.mouth.o', { res: 3, draw(g) { g.paint(ell(0, 2, 2.6, 3), '#5A2226', 1, { edge: 'fine' }); g.paint(ell(0, 3.6, 1.6, 1), '#D97C78', 1, { edge: 'fine' }); } });
  def('cat.mouth.frown', { res: 3, draw(g) { g.line([-4, 1.8, -1.6, -0.4, 1, 0.6, 3.6, 2.4], 1, '#5A2B26', 1, { wob: 0.05 }); } });
  def('cat.mouth.yawn', { res: 3, shadow: CSH, draw(g) {
    g.paper(parsePath('M -7 -2 Q -6 10 1 11 Q 6 9 5 -1 Q 0 1 -7 -2 Z'), '#5A2226', { edge: 'fine', k: 0.6 });
    g.paint(ell(-1, 8, 3.4, 2), '#D97C78', 1, { edge: 'fine' });
    g.paint(parsePath('M -5.5 -1 L -4 3 L -3 -0.4 Z'), '#FFF8E8', 1, { edge: 'fine' });
    g.paint(parsePath('M 2.6 -0.2 L 3.4 3.4 L 4.4 -0.4 Z'), '#FFF8E8', 1, { edge: 'fine' });
  } });

  /* --- туловище: шарнир — пояс; шея в (3,-46), плечо в (2,-37) --- */
  def('cat.torso', {
    res: 2.2, shadow: CSH,
    draw(g) {
      g.paper(parsePath('M -13 4 C -19 -14 -17 -38 -7 -47 C 2 -54 14 -50 17 -39 C 20 -26 16 -8 11 4 Z'), fur, { grad: [0.08, -0.12], draw: (p) => {
        p.paint(parsePath('M 9 -42 C 18 -32 17 -10 11 3 L 3 3 C 8 -10 8 -30 3 -40 Z'), CATC.belly, 1);
        p.brush([-15, -30, -10, -28, -6, -27], 3.2, 2, CATC.furD, 0.85);
        p.brush([-16, -20, -10, -19, -5, -19], 3.2, 2, CATC.furD, 0.85);
        p.brush([-15, -10, -10, -10, -6, -11], 3, 1.8, CATC.furD, 0.8);
      } });
    },
  });
  def('cat.hips', {
    res: 2.2, shadow: CSH,
    draw(g) {
      g.paper(ell(-2, -5, 18, 14.5), fur, { grad: [0.05, -0.15], draw: (p) => {
        p.brush([-19, -8, -13, -6, -9, -3], 3, 2, CATC.furD, 0.8);
        p.paint(ell(8, 2, 8, 6), CATC.belly, 0.9);
      } });
    },
  });
  /* --- конечности: всё висит вниз от шарнира --- */
  const leg = (id, c, a, b, w0, w1, extra) => def(id, {
    res: 2.2, shadow: CSH,
    draw(g) {
      g.paper(limb(0, 0, 0, a, w0, w1), c, { k: 0.8, grad: [0.05, -0.12], draw: (p) => {
        p.brush([-w0 / 2 + 1, a * 0.35, 0, a * 0.42, w0 / 2 - 1, a * 0.38], 2.6, 1.6, CATC.furD, 0.7);
        if (extra) extra(p);
      } });
    },
  });
  leg('cat.thighN', fur, 23, 0, 15, 10.5);
  leg('cat.thighF', furF, 23, 0, 14, 10);
  leg('cat.shinN', fur, 21, 0, 10, 8);
  leg('cat.shinF', furF, 21, 0, 9.5, 7.6);
  const foot = (id, c) => def(id, {
    res: 2.4, shadow: CSH,
    draw(g) {
      g.paper(parsePath('M -4.5 -2 C -5 4 0 6.5 10 6 C 16 5.6 18 1.6 15 -1.2 C 9 -3.4 0 -4 -4.5 -2 Z'), c, { k: 0.7, draw: (p) => {
        p.paint(parsePath('M 6 6 C 12 6 17 5 16 0 C 12 -1 8 1 6 6 Z'), CATC.belly, 0.95);
        p.line([11, 2.5, 12, 5.6], 0.7, CATC.furD, 0.7); p.line([14, 1.5, 15.2, 4.6], 0.7, CATC.furD, 0.7);
      } });
    },
  });
  foot('cat.footN', fur); foot('cat.footF', furF);
  const arm = (id, c, L, w0, w1, paw) => def(id, {
    res: 2.4, shadow: CSH,
    draw(g) {
      g.paper(limb(0, 0, 0, L, w0, w1), c, { k: 0.75, grad: [0.05, -0.1], draw: (p) => p.brush([-w0 / 2 + 1, L * 0.5, 0, L * 0.55, w0 / 2 - 1, L * 0.5], 2.2, 1.4, CATC.furD, 0.6) });
      if (paw) g.paper(ell(0.6, L + 2.5, 5.6, 5.2), CATC.belly, { k: 0.6, draw: (p) => { p.line([-2, L + 5, -1.6, L + 7.2], 0.6, CATC.furD, 0.6); p.line([1.6, L + 5.2, 2, L + 7.4], 0.6, CATC.furD, 0.6); } });
    },
  });
  arm('cat.uarmN', fur, 18, 10.5, 8.5, false);
  arm('cat.uarmF', furF, 18, 10, 8, false);
  arm('cat.farmN', fur, 16, 8.5, 7.2, true);
  arm('cat.farmF', furF, 16, 8, 7, true);
  /* --- хвост: пять сегментов, последний с тёмным кончиком --- */
  const tw = [10, 9, 8.2, 7.2, 6.4, 5.2];
  for (let i = 0; i < 5; i++) {
    def('cat.tail' + i, {
      res: 2.2, shadow: CSH,
      draw(g) {
        g.paper(limb(0, 0, 0, 14, tw[i], tw[i + 1]), fur, { k: 0.7, grad: [0.05, -0.12], draw: (p) => {
          p.brush([-tw[i] / 2, 7, 0, 8, tw[i] / 2, 7.4], 2.8, 1.8, CATC.furD, 0.85);
          if (i === 4) p.paint(ell(0, 14, 4, 5), CATC.furD, 0.95);
        } });
      },
    });
  }
  /* --- шарф: узел на шее и два развевающихся конца --- */
  def('cat.scarf', {
    res: 2.4, shadow: CSH,
    draw(g) {
      g.paper(parsePath('M -12 -2 C -8 -6 8 -7 14 -3 C 16 1 12 5 4 5 C -4 6 -12 4 -12 -2 Z'), CATC.scarf, { k: 0.7, draw: (p) => {
        p.line([-6, -5, -5, 5], 2, CATC.scarfL, 0.9); p.line([4, -6, 5, 5], 2, CATC.scarfL, 0.9);
      } });
      g.paper(ell(-8, 1, 5, 4.5), shade(CATC.scarf, -0.12), { k: 0.6 });
    },
  });
  def('cat.scarfT', {
    res: 2.4, shadow: CSH,
    draw(g) { g.paper(parsePath('M -4 0 L 4 0 L 4.6 14 L -3.6 15 Z'), CATC.scarf, { k: 0.6, draw: (p) => p.line([-4, 7, 4.6, 7], 2, CATC.scarfL, 0.9) }); },
  });
  def('cat.scarfT2', {
    res: 2.4, shadow: CSH,
    draw(g) {
      g.paper(parsePath('M -3.6 0 L 4.6 0 L 4 13 L -3 13 Z'), CATC.scarf, { k: 0.6, draw: (p) => p.line([-4, 5, 4.6, 5], 2, CATC.scarfL, 0.9) });
      for (let i = 0; i < 4; i++) g.line([-2.5 + i * 2.2, 13, -2.8 + i * 2.2, 17], 1.1, CATC.scarf, 1, { wob: 0.1 });
    },
  });
  /* --- фуражка фонарщика с латунной бляхой --- */
  def('cat.cap', {
    res: 2.5, shadow: CSH,
    draw(g) {
      g.paper(parsePath('M -15 0 C -16 -9 -8 -16 4 -16 C 15 -16 21 -9 20 0 Z'), CATC.cap, { k: 0.7, grad: [0.18, -0.15] });
      g.paper(rect(-15.5, -3.5, 36, 5), CATC.capD, { k: 0.6 });
      g.paper(parsePath('M 12 0 L 31 3 Q 32 5.5 28 5.6 L 9 3 Z'), '#17172A', { k: 0.6 });
      g.paper(ell(5, -8, 2.6, 2.6), CATC.brass, { edge: 'fine', k: 0.5 });
    },
  });
  /* --- шест фонарщика: хват в (0,0), вершина с крючком в (0,-126) --- */
  def('cat.pole', {
    res: 2.2, shadow: CSH,
    draw(g) {
      g.paper(limb(0, 22, 0, -118, 3.6, 3), CATC.pole, { k: 0.5, draw: (p) => p.line([0.6, 18, 0.4, -110], 0.8, CATC.poleL, 0.8) });
      g.paper(rect(-2.6, -121, 5.2, 7), CATC.brass, { k: 0.5 });
      g.paper(parsePath('M -1.2 -120 C -1 -128 6 -130 7 -125 L 5 -124 C 4.5 -127 1 -126 1.2 -120 Z'), CATC.brass, { k: 0.5 });
      g.paper(rect(-1, -129, 2, 4), '#3A2A22', { edge: 'fine', k: 0.4 });
    },
  });
  /* латунная заклёпка шарнира — «видно, как у настоящей перекладки» */
  def('pin', { res: 3, draw(g) { g.paint(ell(0, 0, 1.9, 1.9), '#8A6A2E', 1, { edge: 'clean' }); g.paint(ell(-0.3, -0.3, 1.4, 1.4), CATC.brass, 1, { edge: 'clean' }); g.dot(-0.7, -0.8, 0.45, '#FFF3C8'); } });
  /* мотылёк: тело и два крыла */
  def('moth.body', { res: 3, draw(g) { g.paint(ell(0, 0, 1.6, 4.4), '#9A8468', 1, { edge: 'fine' }); g.line([0, -4, -2, -7], 0.4, '#6E5A48', 1); g.line([0, -4, 2, -7], 0.4, '#6E5A48', 1); } });
  def('moth.wing', { res: 3, em: false, shadow: { dx: 1, dy: 1.5, blur: 1.6, a: 0.3 }, draw(g) {
    g.paper(parsePath('M 0 0 C 3 -8 11 -9 12 -3 C 12 2 6 4 0 2 Z'), '#EFE4CB', { edge: 'fine', k: 0.4, draw: (p) => { p.dot(8, -3, 1.4, '#B89C7C', 0.9); p.dot(4.4, -1.4, 0.8, '#B89C7C', 0.8); } });
  } });
}

/* ---------- риг кота: детали, шарниры, порядок наложения ---------- */
/* [имя, спрайт, родитель, точка крепления в координатах родителя, z, заклёпка] */
const CAT_RIG = [
  ['hips', 'cat.hips', null, [0, 0], 6],
  ['tail0', 'cat.tail0', 'hips', [-15, -5], 1],
  ['tail1', 'cat.tail1', 'tail0', [0, 13], 1.1],
  ['tail2', 'cat.tail2', 'tail1', [0, 13], 1.2],
  ['tail3', 'cat.tail3', 'tail2', [0, 13], 1.3],
  ['tail4', 'cat.tail4', 'tail3', [0, 13], 1.4],
  ['legF1', 'cat.thighF', 'hips', [-3, -1], 2],
  ['legF2', 'cat.shinF', 'legF1', [0, 22], 2.1],
  ['footF', 'cat.footF', 'legF2', [0, 20], 2.2],
  ['torso', 'cat.torso', 'hips', [0, -6], 7],
  ['armF1', 'cat.uarmF', 'torso', [0, -37], 3],
  ['armF2', 'cat.farmF', 'armF1', [0, 17], 3.1],
  ['scarfT1', 'cat.scarfT', 'torso', [-8, -44], 4],
  ['scarfT2', 'cat.scarfT2', 'scarfT1', [0, 14], 4.1],
  ['earF', 'cat.earF', 'head', [-7, -38], 5],
  ['legN1', 'cat.thighN', 'hips', [3, 0], 8, 1],
  ['legN2', 'cat.shinN', 'legN1', [0, 22], 8.1, 1],
  ['footN', 'cat.footN', 'legN2', [0, 20], 8.2],
  ['scarf', 'cat.scarf', 'torso', [3, -45], 9],
  ['head', 'cat.head', 'torso', [3, -46], 10],
  ['eye', 'cat.eye.open', 'head', [16, -26], 10.2],
  ['pupil', 'cat.pupil', 'eye', [0.8, -0.8], 10.3],
  ['brow', 'cat.brow', 'head', [15, -33], 10.35],
  ['mouth', 'cat.mouth.n', 'head', [31, -12], 10.25],
  ['earN', 'cat.earN', 'head', [5, -41], 10.4],
  ['cap', 'cat.cap', 'head', [4, -38], 10.5],
  ['pole', 'cat.pole', 'armN2', [0.6, 19], 11],
  ['armN1', 'cat.uarmN', 'torso', [2, -37], 12, 1],
  ['armN2', 'cat.farmN', 'armN1', [0, 17], 13, 1],
];
const CAT_L = { thigh: 22, shin: 20, uarm: 17, farm: 19, pole: 126 };
