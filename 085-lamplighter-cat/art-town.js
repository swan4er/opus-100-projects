'use strict';
/* ==========================================================================
   Кот-фонарщик · art-town.js
   Декорации: дома на холме, фонари, пристань, море полосами, дали, облака,
   звёзды, Луна, титры. Всё — вырезанная бумага: сначала контур, потом краска.
   ========================================================================== */

const PAL = {
  ink: '#1C1826', inkL: '#2B2638',
  indigo: '#252A55', indigo2: '#343A70', violet: '#5A4C7E', plum: '#7C5478', rose: '#BE6E6C', apricot: '#E69A5A', gold: '#F2C47C',
  ochre: '#CD8B3F', ochreL: '#DDA25A', terra: '#B5583B', terraL: '#C9714F', cream: '#EAD9B6', creamL: '#F5EBD5', teal: '#50726F', sage: '#8D9A74', rosewall: '#C98A7E',
  roof: '#8E3C2B', roofD: '#6C2B22', roofL: '#A9523B', slate: '#50526D', slateD: '#3C3D57',
  glass: '#2A2C47', glassL: '#3A3D5E',
  lamp: '#FFD66B', lampL: '#FFF2C4', lampO: '#F39A36',
  iron: '#24252C', ironL: '#3B3E48',
  wood: '#6C4631', woodD: '#4B2F21', woodL: '#8C603F',
  moon: '#F4E6C1', moonD: '#E3CE9C', moonL: '#FBF3DE',
  stone: '#6E6A78', stoneD: '#55515F',
};
const SHADOW = { dx: 2.2, dy: 3.2, blur: 3.2, a: 0.36 };
const SHADOW_BG = { dx: 4, dy: 5, blur: 7, a: 0.34 };

/* ---------- дома переднего плана ---------- */
const HOUSES = [];   // {id, x, eave, w, roofH, ridge:[x0,x1,y], wins:[[x,y,w,h]], wallH}
const WALLS = [PAL.ochre, PAL.terra, PAL.cream, PAL.teal, PAL.ochreL, PAL.rosewall, PAL.sage, PAL.terraL];
const ROOFS = [PAL.roof, PAL.slate, PAL.roofL, PAL.roofD];

function tiles(g, x0, x1, yTop, yBot, inset, colr, sd) {
  // ряды черепицы: полукруглые «чешуйки» (точки дуги считаются напрямую)
  const r = rng(sd), rows = Math.max(2, Math.round((yBot - yTop) / 11)), dark = shade(colr, -0.35);
  for (let i = 0; i < rows; i++) {
    const y = lerp(yTop + 6, yBot, i / rows), k = (y - yTop) / (yBot - yTop), ins = inset * (1 - k);
    const a0 = x0 + ins, a1 = x1 - ins, step = 13;
    const pts = [];
    for (let x = a0 + (i % 2) * 6.5; x < a1; x += step) {
      for (let q = 0; q <= 4; q++) { const t = q / 4; pts.push(x + step * t, y + 9 * 2 * t * (1 - t)); }
    }
    if (pts.length >= 4) g.line(pts, 1.3, dark, 0.55, { wob: 0.15 });
    if (r() < 0.8) g.paint(rect(a0 + r() * (a1 - a0 - 30), y - 2, 18 + r() * 30, 7), shade(colr, 0.12), 0.35);
  }
}
function windowPiece(g, x, y, w, h, o) {
  const frame = o.frame || PAL.creamL, arched = o.arched;
  const outline = arched ? parsePath(`M ${x} ${y + h} L ${x} ${y + w / 2} Q ${x} ${y} ${x + w / 2} ${y} Q ${x + w} ${y} ${x + w} ${y + w / 2} L ${x + w} ${y + h} Z`) : rect(x, y, w, h);
  if (o.shutters) {
    const sc = o.shutters;
    g.paper(rect(x - w * 0.46, y - 1, w * 0.44, h + 2), sc, { k: 0.8, draw: (p) => { for (let i = 1; i < 5; i++) p.line([x - w * 0.44, y + (h * i) / 5, x - w * 0.04, y + (h * i) / 5], 0.8, shade(sc, -0.3), 0.6); } });
    g.paper(rect(x + w * 1.02, y - 1, w * 0.44, h + 2), sc, { k: 0.8, draw: (p) => { for (let i = 1; i < 5; i++) p.line([x + w * 1.04, y + (h * i) / 5, x + w * 1.44, y + (h * i) / 5], 0.8, shade(sc, -0.3), 0.6); } });
  }
  g.paper(scaleS(outline, 1.16, 1.1, x + w / 2, y + h / 2), frame, { k: 0.8 });
  g.paper(outline, PAL.glass, { k: 0.7, bevel: 0.6, grad: [0.12, -0.25], draw: (p) => {
    p.line([x + w / 2, y, x + w / 2, y + h], 1.6, frame, 0.95, { wob: 0.1 });
    p.line([x, y + h * 0.45, x + w, y + h * 0.45], 1.6, frame, 0.95, { wob: 0.1 });
  } });
  g.paper(rect(x - 3, y + h, w + 6, 4), shade(frame, -0.1), { k: 0.7 });
  if (o.flowers) {
    g.paper(rect(x - 1, y + h + 3, w + 2, 6), PAL.woodL, { k: 0.6 });
    for (let i = 0; i < 5; i++) g.dot(x + 2 + (i * (w - 4)) / 4, y + h + 2, 2.6, i % 2 ? '#C9473F' : '#E6B04A');
  }
}
function makeHouse(id, x, eave, w, roofH, o = {}) {
  const wallH = (o.bottom ?? 1320) - eave, seed = hashStr(id), r = rng(seed);
  const wall = o.wall || WALLS[seed % WALLS.length], roofC = o.roof || ROOFS[(seed >>> 3) % ROOFS.length];
  const inset = o.inset ?? 26;
  const floors = Math.max(1, Math.floor((wallH - 40) / 150));
  const cols = o.cols ?? Math.max(2, Math.round(w / 130));
  const wins = [];
  const ww = o.ww ?? 30, wh = o.wh ?? 46;
  for (let f = 0; f < floors; f++) for (let c = 0; c < cols; c++) {
    const cx = (w * (c + 0.5)) / cols, wy = 42 + f * 150;
    if (wy + wh > wallH - 60) continue;
    if (r() < 0.12) continue;
    wins.push([cx - ww / 2, wy, ww, wh, f === 0 && o.arched ? 1 : 0]);
  }
  const chim = o.chimneys ?? [w * (0.2 + r() * 0.6)];
  const h = { id, x, eave, w, roofH, wallH, wins, ridge: [x + inset, x + w - inset, eave - roofH], chim: chim.map((c) => x + c) };
  HOUSES.push(h);
  def(id, {
    res: 0.8, shadow: SHADOW_BG, maxQ: 2,
    draw(g) {
      // трубы (за скатом)
      for (const c of chim) {
        g.paper(rect(c - 11, -roofH - 34, 22, roofH + 10), PAL.terra, { draw: (p) => { for (let i = 0; i < 5; i++) p.line([c - 11, -roofH - 26 + i * 9, c + 11, -roofH - 26 + i * 9], 0.7, shade(PAL.terra, -0.3), 0.5); } });
        g.paper(rect(c - 14, -roofH - 40, 28, 7), shade(PAL.terra, -0.2));
      }
      // стена
      g.paper(rect(0, 0, w, wallH), wall, { mottle: 0.8, grad: [0.05, -0.12], draw: (p) => {
        for (let i = 0; i < 6; i++) p.paint(ell(r() * w, 40 + r() * (wallH - 80), 14 + r() * 26, 8 + r() * 12, r()), shade(wall, (r() - 0.5) * 0.25), 0.5);
        p.paint(rect(0, 0, w, 10), shade(wall, 0.18), 0.8);
        p.paint(rect(0, 10, w, 3), shade(wall, -0.25), 0.6);
        p.paint(rect(0, wallH - 40, w, 40), shade(wall, -0.2), 0.7);
        for (let f = 1; f < floors; f++) p.paint(rect(0, f * 150 + 8, w, 4), shade(wall, 0.14), 0.7);
      } });
      for (const wd of wins) windowPiece(g, wd[0], wd[1], wd[2], wd[3], { shutters: r() < 0.55 ? (r() < 0.5 ? PAL.teal : PAL.indigo2) : null, flowers: r() < 0.3, arched: wd[4] });
      // скат крыши
      const roofS = parsePath(`M -8 4 L ${w + 8} 4 L ${w - inset} ${-roofH} L ${inset} ${-roofH} Z`);
      g.paper(roofS, roofC, { grad: [0.12, -0.18], draw: (p) => tiles(p, -8, w + 8, -roofH, 4, inset + 8, roofC, seed + 3) });
      g.paper(rect(inset - 3, -roofH - 4, w - inset * 2 + 6, 7), shade(roofC, -0.35), { k: 0.8 });
    },
  });
  return h;
}

/* ---------- фонари ---------- */
function lampParts() {
  // голова фонаря: железный каркас (обычная деталь) + стёкла (светящиеся или тёмные) + огонь
  def('lamp.frame', {
    res: 2.2, shadow: SHADOW,
    draw(g) {
      g.paper(parsePath('M -15 -38 L 15 -38 L 11 -2 L -11 -2 Z'), PAL.iron, { k: 0.8 });
      g.paper(parsePath('M -20 -38 L 20 -38 L 12 -50 Q 0 -60 -12 -50 Z'), PAL.iron, { k: 0.8 });
      g.paper(ell(0, -60, 3.6, 3.6), PAL.iron, { k: 0.6 });
      g.paper(rect(-9, -2, 18, 5), PAL.iron, { k: 0.6 });
      g.paper(parsePath('M -4 3 L 4 3 L 2 12 L -2 12 Z'), PAL.iron, { k: 0.6 });
    },
  });
  def('lamp.glass', {
    res: 2.2,
    draw(g) {
      g.paper(parsePath('M -12 -35 L 12 -35 L 9 -5 L -9 -5 Z'), PAL.glass, { k: 0.6, bevel: 0.4, grad: [0.25, -0.2], draw: (p) => {
        p.line([0, -35, 0, -5], 1.4, PAL.iron, 0.9, { wob: 0 });
        p.paint(parsePath('M -9 -32 L -6 -32 L -6 -8 L -8 -8 Z'), '#FFFFFF', 0.12, { edge: 'clean' });
      } });
    },
  });
  def('lamp.glassLit', {
    res: 2.2, em: true,
    draw(g) {
      g.paper(parsePath('M -12 -35 L 12 -35 L 9 -5 L -9 -5 Z'), PAL.lamp, { k: 0.6, bevel: 0, mottle: 0.3, grain: 0.4, draw: (p) => {
        p.glow(0, -16, 16, PAL.lampL, 1);
        p.line([0, -35, 0, -5], 1.4, PAL.iron, 0.9, { wob: 0 });
      } });
    },
  });
  for (let k = 0; k < 3; k++) {
    def('flame.' + k, {
      res: 3, em: true,
      draw(g) {
        const w = [6.5, 5.8, 7][k], h = [17, 19, 15.5][k], lean = [0.6, -0.8, 0.2][k];
        const outer = parsePath(`M 0 0 C ${-w} -2 ${-w * 0.8} ${-h * 0.55} ${lean} ${-h} C ${w * 0.9} ${-h * 0.55} ${w} -2 0 0 Z`);
        g.paint(outer, PAL.lampO, 1, { edge: 'fine' });
        g.paint(scaleS(outer, 0.72, 0.8, 0, -1), PAL.lamp, 1, { edge: 'fine' });
        g.paint(scaleS(outer, 0.4, 0.5, 0, -1), '#FFFBEA', 1, { edge: 'fine' });
      },
    });
    def('mflame.' + k, {
      res: 3, em: true,
      draw(g) {
        const w = [6.5, 5.8, 7][k], h = [18, 20, 16.5][k], lean = [0.6, -0.8, 0.2][k];
        const outer = parsePath(`M 0 0 C ${-w} -2 ${-w * 0.8} ${-h * 0.55} ${lean} ${-h} C ${w * 0.9} ${-h * 0.55} ${w} -2 0 0 Z`);
        g.paint(outer, '#9FB6E8', 0.95, { edge: 'fine' });
        g.paint(scaleS(outer, 0.74, 0.82, 0, -1), '#E9EEFF', 1, { edge: 'fine' });
        g.paint(scaleS(outer, 0.42, 0.52, 0, -1), '#FFFDF3', 1, { edge: 'fine' });
      },
    });
  }
  // столб с завитком и кронштейн на стене
  def('lamp.post', {
    res: 1.2, shadow: SHADOW,
    draw(g) {
      g.paper(limb(0, 0, 0, 760, 7, 10), PAL.iron, { k: 0.8 });
      g.paper(parsePath('M -3 10 C -3 -18 26 -26 40 -12 C 50 -2 40 14 30 8 C 22 3 28 -6 34 -2 C 34 -12 16 -12 8 4 L 8 20 L -3 22 Z'), PAL.iron, { k: 0.7 });
      g.paper(rect(-9, 30, 18, 8), PAL.ironL, { k: 0.6 });
      g.paper(rect(-12, 740, 24, 30), PAL.iron, { k: 0.8 });
    },
  });
  def('lamp.bracket', {
    res: 1.4, shadow: SHADOW,
    draw(g) {
      g.paper(parsePath('M 0 -6 L 44 -6 L 44 0 L 6 0 C 10 18 30 26 42 14 L 45 18 C 30 36 2 26 0 6 Z'), PAL.iron, { k: 0.7 });
      g.paper(rect(-6, -14, 8, 36), PAL.ironL, { k: 0.6 });
      g.paper(rect(38, -6, 12, 8), PAL.iron, { k: 0.6 });
    },
  });
}

/* ---------- небо: звёзды, облака, Луна ---------- */
function skyParts() {
  for (let k = 0; k < 3; k++) {
    def('star.' + k, {
      res: 1.6, em: true,
      draw(g) {
        if (k === 0) g.paint(parsePath('M 0 -7 L 1.7 -1.7 L 7 0 L 1.7 1.7 L 0 7 L -1.7 1.7 L -7 0 L -1.7 -1.7 Z'), '#FFF4D2', 1, { edge: 'fine' });
        else if (k === 1) g.paint(parsePath('M 0 -5 L 1.3 -1.6 L 5 -1.5 L 2 1 L 3 4.6 L 0 2.6 L -3 4.6 L -2 1 L -5 -1.5 L -1.3 -1.6 Z'), '#FBEBC4', 1, { edge: 'fine' });
        else g.paint(ell(0, 0, 2.2, 2.2), '#F7EBCF', 1, { edge: 'fine' });
      },
    });
  }
  const cloud = (id, w, h, colr, n) => def(id, {
    res: 0.7, shadow: { dx: 3, dy: 5, blur: 9, a: 0.25 },
    draw(g) {
      const r = rng(hashStr(id));
      const bumps = [];
      for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; bumps.push([lerp(-w / 2, w / 2, t) + (r() - 0.5) * 20, -h * (0.35 + 0.65 * Math.sin(Math.PI * t)) * (0.7 + r() * 0.4), 18 + Math.sin(Math.PI * t) * h * 0.45 * (0.8 + r() * 0.4)]); }
      // две бумажки: тёмный низ и светлый верх
      let top = '', parts = [];
      parts.push(`M ${-w / 2 - 10} 0`);
      for (const b of bumps) parts.push(`Q ${b[0] - b[2]} ${b[1] - b[2] * 0.9} ${b[0]} ${b[1] - b[2] * 0.2}`);
      parts.push(`Q ${w / 2 + 30} ${-10} ${w / 2 + 10} 0 Z`);
      top = parts.join(' ');
      g.paper(parsePath(top), colr, { edge: 'torn', rim: shade(colr, 0.35), rimW: 1.2, grad: [0.18, -0.1] });
      g.paper(parsePath(`M ${-w / 2 + 10} -2 Q ${-w / 4} ${-h * 0.35} 0 ${-h * 0.2} Q ${w / 4} ${-h * 0.4} ${w / 2 - 6} -2 Z`), shade(colr, -0.18), { edge: 'torn', rim: shade(colr, 0.2), rimW: 0.8 });
    },
  });
  cloud('cloud.0', 420, 120, '#C9B9CF', 6);
  cloud('cloud.1', 300, 90, '#BFAFC6', 5);
  cloud('cloud.2', 560, 150, '#CDBFD2', 7);
  cloud('cloud.3', 240, 70, '#B7A7C0', 4);
}

/* ---------- дали: холмы, город на холме, колокольня ---------- */
function farParts() {
  /* гребень холма; к концам он сходит под воду (sea — линия моря в координатах листа),
     поэтому с пристани край берега читается как мыс, а не как обрезанный лист */
  /* Лист вырезан только там, где его видит камера хотя бы в одном плане: левее xa
     холм не попадает в кадр ни разу, а ниже линии моря его всегда закрывают волны.
     Форма гребня считается по всей ширине w, поэтому силуэт от обрезки не меняется. */
  const ridge = (id, w, h, colr, sd, rim, sea, xa) => def(id, {
    res: 0.45, shadow: { dx: 3, dy: 4, blur: 8, a: 0.28 },
    draw(g) {
      const bottom = sea + 120, n = 48, t0 = (xa + w / 2) / w;
      const pts = [xa, bottom];
      for (let i = 0; i <= n; i++) {
        const t = lerp(t0, 1, i / n), x = lerp(-w / 2, w / 2, t);
        const top = -h * (0.45 + 0.4 * fbm1(t * 5.5, sd, 3) + 0.25 * Math.sin(t * Math.PI));
        const env = sstep(t0, t0 + 0.04, t) * sstep(1, 0.86, t);
        pts.push(x, lerp(sea + 14, top, Math.pow(env, 0.8)));
      }
      pts.push(w / 2, bottom);
      g.paper([pts], colr, { edge: 'torn', rim: rim || shade(colr, 0.3), rimW: 1.4, k: 1.6, grad: [0.08, -0.2] });
    },
  });
  // xa — левая граница видимого участка в координатах листа (u_min − центр листа, с запасом)
  ridge('hill.far', 3200, 220, '#6F5E86', 5, '#A590B0', 106, -120 - (-250) - 240);
  ridge('hill.mid', 2600, 200, '#574C74', 9, '#8D7AA0', 69, -150 - (-350) - 240);
  // силуэт верхнего города на холме: крыши, трубы, колокольня, окошки отдельно
  for (let v = 0; v < 3; v++) {
    const id = 'fartown.' + v;
    def(id, {
      res: 0.55, shadow: { dx: 3, dy: 4, blur: 6, a: 0.3 },
      draw(g) {
        const r = rng(hashStr(id)), W = 900;
        let x = 0; const pts = [0, 420];
        while (x < W) {
          const bw = 50 + r() * 70, bh = 90 + r() * 110, kind = r();
          pts.push(x, -bh + 40);
          if (kind < 0.5) pts.push(x + bw / 2, -bh - 34 - r() * 16);
          else if (kind < 0.7) { pts.push(x + 4, -bh + 20); pts.push(x + bw - 4, -bh + 20); }
          if (r() < 0.35) { const cx = x + bw * (0.2 + r() * 0.5); pts.push(cx - 5, -bh + 34, cx - 5, -bh - 20, cx + 5, -bh - 20, cx + 5, -bh + 30); }
          pts.push(x + bw, -bh + 40);
          x += bw;
        }
        pts.push(W, 420);
        g.paper([pts], ['#7A5F76', '#6D5670', '#80657B'][v], { edge: 'cut', k: 1.4, grad: [0.1, -0.25] });
      },
    });
  }
  def('belltower', {
    res: 0.6, shadow: { dx: 3, dy: 4, blur: 6, a: 0.3 },
    draw(g) {
      g.paper(rect(-38, -250, 76, 700), '#8A6F7E', { k: 1.2, grad: [0.1, -0.3] });
      g.paper(parsePath('M -46 -250 L 46 -250 L 0 -360 Z'), '#5E4A66', { k: 1.2 });
      g.paper(parsePath('M -2 -360 L 2 -360 L 2 -392 L -2 -392 Z'), '#5E4A66', { k: 0.6 });
      g.paper(ell(0, -180, 24, 24), '#E8D6B2', { k: 0.8, draw: (p) => { p.line([0, -180, 0, -196], 2.2, PAL.ink, 1); p.line([0, -180, 11, -176], 2.2, PAL.ink, 1); } });
      g.paper(parsePath('M -18 -120 L -18 -80 L 18 -80 L 18 -120 Q 0 -140 -18 -120 Z'), PAL.glass, { k: 0.7 });
    },
  });
  def('tree.poplar', {
    res: 0.6, shadow: { dx: 3, dy: 4, blur: 6, a: 0.3 },
    draw(g) {
      g.paper(parsePath('M 0 -320 C 30 -250 40 -120 30 0 L -30 0 C -40 -120 -30 -250 0 -320 Z'), '#3F4A52', { edge: 'torn', rim: '#6C7A7A', rimW: 1, k: 1.3, grad: [0.15, -0.2] });
      g.paper(rect(-5, -4, 10, 60), PAL.woodD, { k: 0.8 });
    },
  });
  // окошко дальнего города (светящееся)
  def('fwin', { res: 0.9, em: true, draw(g) { g.paint(rect(-4, -6, 8, 12), '#FFD27A', 1, { edge: 'fine' }); g.glow(0, 0, 9, '#FFC45E', 0.35); } });
  def('fwin.s', { res: 0.9, em: true, draw(g) { g.paint(rect(-2.5, -3.5, 5, 7), '#FFE19A', 1, { edge: 'fine' }); } });
}

/* ---------- средний план: дома через улицу, попроще ---------- */
const MIDHOUSES = [];
function makeMidHouse(id, w, h, roofH, wall, roofC) {
  const r = rng(hashStr(id)), wins = [];
  const cols = Math.max(2, Math.round(w / 90)), rows = Math.max(1, Math.floor((h - 60) / 110));
  for (let f = 0; f < rows; f++) for (let c = 0; c < cols; c++) { if (r() < 0.15) continue; wins.push([(w * (c + 0.5)) / cols - 10, 30 + f * 110, 20, 32]); }
  MIDHOUSES.push({ id, w, h, roofH, wins });
  def(id, {
    res: 0.6, shadow: SHADOW_BG, maxQ: 1.8,
    draw(g) {
      g.paper(rect(w * 0.62, -roofH - 26, 16, roofH), shade(PAL.terra, -0.15));
      g.paper(rect(0, 0, w, h), wall, { k: 1.2, grad: [0.0, -0.2], draw: (p) => { p.paint(rect(0, 0, w, 7), shade(wall, 0.15), 0.8); } });
      for (const wd of wins) {
        g.paper(rect(wd[0] - 3, wd[1] - 3, wd[2] + 6, wd[3] + 6), shade(PAL.cream, -0.05), { k: 0.7 });
        g.paper(rect(wd[0], wd[1], wd[2], wd[3]), PAL.glass, { k: 0.6, bevel: 0.5, draw: (p) => p.line([wd[0] + wd[2] / 2, wd[1], wd[0] + wd[2] / 2, wd[1] + wd[3]], 1.2, PAL.cream, 0.9, { wob: 0 }) });
      }
      g.paper(parsePath(`M -6 3 L ${w + 6} 3 L ${w - 20} ${-roofH} L 20 ${-roofH} Z`), roofC, { k: 1.1, grad: [0.1, -0.2], draw: (p) => tiles(p, -6, w + 6, -roofH, 3, 26, roofC, hashStr(id) + 5) });
    },
  });
}

/* окно с тёплым светом — поверх тёмного стекла, светится само */
function litWindows() {
  const mk = (id, w, h) => def(id, {
    res: 1.2, em: true,
    draw(g) {
      g.paint(rect(0, 0, w, h), '#F7C766', 1, { edge: 'fine' });
      g.glow(w / 2, h * 0.55, Math.max(w, h) * 0.75, '#FFF0C0', 0.9);
      g.paint(parsePath(`M 0 0 L ${w * 0.3} 0 Q ${w * 0.18} ${h * 0.5} ${w * 0.26} ${h} L 0 ${h} Z`), '#C9653E', 0.75, { edge: 'fine' });
      g.paint(parsePath(`M ${w} 0 L ${w * 0.7} 0 Q ${w * 0.82} ${h * 0.5} ${w * 0.74} ${h} L ${w} ${h} Z`), '#C9653E', 0.75, { edge: 'fine' });
      g.line([w / 2, 0, w / 2, h], 1.6, '#5A3A2A', 0.85, { wob: 0 });
      g.line([0, h * 0.45, w, h * 0.45], 1.6, '#5A3A2A', 0.85, { wob: 0 });
    },
  });
  mk('win.lit', 30, 46);
  mk('win.litm', 20, 32);
}

/* ---------- титр: буквы из бумаги на нитках ---------- */
const TITLE = 'Кот-фонарщик';
const FONT_TITLE = '"Yeseva One", "Prata", Georgia, serif';
function titleParts() {
  [...TITLE].forEach((ch, i) => {
    def('title.' + i, {
      res: 1.2, shadow: { dx: 4, dy: 6, blur: 7, a: 0.4 }, font: true,
      draw(g) {
        const fs = 118;
        g.text(ch, 0, 40, `${fs}px ${FONT_TITLE}`, i % 2 ? '#F1DDB0' : '#F6E6C4', { stroke: 7, strokeC: i % 2 ? '#E0C48C' : '#EBD3A2', h: 100 });
        if (!g.m) {
          // бумажная фактура поверх букв
          const ctx = g.x; ctx.save(); ctx.globalCompositeOperation = 'source-atop';
          g.texture([-70, -80, 70, 60], 0.9, 1.2, i * 13 + 5);
          ctx.fillStyle = 'rgba(120,70,40,0.10)'; ctx.fillRect(-70, 10, 140, 50);
          ctx.restore();
        }
      },
    });
  });
}

/* ---------- небо: полосы рваной бумаги от горизонта вверх (сумерки и ночь) ---------- */
function skyStrips() {
  /* Небо висит в экранных координатах: по горизонтали виден ровно кадр (0…1600),
     по вертикали камера поднимается не выше sy = 640, то есть до y ≈ −1090.
     Лист режем с запасом по этим границам — вдвое меньше пикселей на выпечку. */
  const X0 = -60, X1 = 1660, TOP = -1320;
  const mk = (id, cols, seed, grain) => def(id, {
    res: 0.42, maxQ: 0.85,
    draw(g) {
      const edges = [140, 36, -40, -120, -210, -320, -450, -610, -800];
      for (let i = 0; i < edges.length; i++) {
        const y0 = edges[i], sd = seed + i * 17, bottom = [], rim = [];
        for (let x = X0; x <= X1; x += 3) {
          const k = (x + 400) / 3;
          const y = y0 + (fbm1(x * 0.0115, sd, 3) - 0.5) * (18 + i * 5) + Math.sin(x * 0.0035 + i) * (6 + i * 2);
          const fib = (hash1(k, sd + 3) - 0.5) * 1.6 + (fbm1(x * 0.08, sd + 9, 2) - 0.5) * 2.4;
          bottom.push(x, y + fib);
          rim.push(x, y + 2.2 + fib * 1.4 + (hash1(k, sd + 5) - 0.5) * 2.2);
        }
        const c = cols[i];
        const close = (pts) => [pts.concat([X1, TOP, X0, TOP])];
        g.paint(close(rim), shade(c, 0.28), 0.55, { edge: 'clean' });
        // на большом ровном листе волокна зерна складываются в заметный узор — здесь их меньше
        g.paper(close(bottom), c, { edge: 'clean', bevel: 0.5, mottle: 0.7, grain });
      }
    },
  });
  mk('sky.dusk', ['#F3CB84', '#EDA866', '#DC8A6A', '#BE6F71', '#946079', '#6A5179', '#4A4571', '#333665', '#282C59'], 11, 0.5);
  mk('sky.night', ['#474877', '#3B3E70', '#333668', '#2C2F60', '#262957', '#21244E', '#1D2046', '#1A1C3F', '#171939'], 11, 0.3);
}

/* ---------- слуховое окно кота: внутренность, стенка с круглой дырой, ставни ---------- */
function dormerParts() {
  def('dormer.inside', { res: 1.4, em: true, draw(g) {
    g.paint(ell(0, 0, 34, 34), '#6A3B2A', 1, { edge: 'clean' });
    g.glow(4, 8, 40, '#FFB860', 0.95);
    g.glow(6, 10, 18, '#FFE3A0', 0.9);
    g.paint(rect(-30, 14, 60, 4), '#3A2218', 0.5, { edge: 'clean' });
  } });
  def('dormer.dark', { res: 1.4, draw(g) { g.paper(ell(0, 0, 34, 34), '#2A2440', { edge: 'clean', bevel: 0 }); } });
  def('dormer.front', { res: 1.6, shadow: SHADOW, draw(g) {
    const wall = parsePath('M -56 70 L -56 -6 Q -56 -64 0 -70 Q 56 -64 56 -6 L 56 70 Z');
    g.paper([wall[0], ell(0, 0, 33, 33)[0]], PAL.cream, { rule: 'evenodd', grad: [0.1, -0.15], draw: (p) => {
      p.paint(rect(-56, 52, 112, 18), shade(PAL.cream, -0.25), 0.7);
    } });
    g.paper([ell(0, 0, 39, 39)[0], ell(0, 0, 33, 33)[0]], '#EFE3C8', { rule: 'evenodd', k: 0.8 });
    g.paper(parsePath('M -70 -8 Q -66 -88 0 -92 Q 66 -88 70 -8 L 60 -4 Q 56 -76 0 -80 Q -56 -76 -60 -4 Z'), PAL.roofD, { k: 0.9 });
    g.paper(rect(-40, 36, 80, 7), shade(PAL.cream, -0.12), { k: 0.7 });
  } });
  const shutter = (id, side) => def(id, { res: 1.6, shadow: SHADOW, draw(g) {
    // шарнир на внешнем крае окна; створка — половина круга
    const s = side;
    g.paper(parsePath(`M 0 -34 Q ${-s * 36} -32 ${-s * 36} 0 Q ${-s * 36} 32 0 34 Z`), '#3F6F72', { k: 0.8, draw: (p) => {
      for (let i = -3; i <= 3; i++) p.line([0, i * 9, -s * 34, i * 9], 1, '#2A4C4E', 0.7);
    } });
  } });
  shutter('dormer.shL', -1); shutter('dormer.shR', 1);
}
