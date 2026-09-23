/* 067 · Черновик — сцены 3–6: спор, храп, сборка, утро. */
'use strict';

// буквы, лежащие в куче сейчас (по ходу сборки сценария)
function poolAdd(F, g) { (F.pool || (F.pool = new Set())).add(g); }
function poolTake(F, ch, prefer) {
  const want = ch.toLowerCase();
  let best = null, bestScore = -1e9;
  for (const g of F.pool) {
    const c = (g.morphs.length ? g.morphs[g.morphs.length - 1].ch : g.ch).toLowerCase();
    if (c !== want) continue;
    let s = -(g.heapRest ? g.heapRest.y : 0) * 0.02;
    if (prefer && prefer(g)) s += 1000;
    if (s > bestScore) { bestScore = s; best = g; }
  }
  if (best) F.pool.delete(best);
  return best;
}
function restOf(g) { return g.heapRest || g.tr.cur; }
function upright(r) { return Math.round(r / TAU) * TAU; }

// ————————————————————————————————————————————————————————————————
// Сцена 3. Спор: четыре знака предлагают начало — «БАХ!», «А что, если?», «Туман и тишина…», «Конец.»
function scene3(F) {
  F.scene(64, 'Спор');
  const c = F.cursor, cam = F.cam, x0 = W.colL, L1 = baseline(1);
  const dot = F.point;
  F.blinkMode(64, 'fast');
  ticks(F, 64, 66, 1, 0.5);
  cam.cut(65.5, { x: -80, y: -470, z: 2.0, r: 0 });
  cam.move(69.6, { x: -70, y: -460, z: 2.1 }, Ease.io2);
  cam.cut(69.62, { x: -30, y: -300, z: 1.3, r: 0 });

  const S3 = [];
  // — знаки выходят на строку
  const bangM = { font: `400 150px ${FONT_BANG}`, size: 150 };
  const askM = { font: `italic 300 150px ${FONT_SERIF}`, size: 150 };
  const ex = F.glyph('!', bangM, { tag: 'ex', z: 3 });
  const qu = F.glyph('?', askM, { tag: 'qu', z: 3 });
  const exY = Glyph.cy(ex.m, L1), quY = Glyph.cy(qu.m, L1);
  ex.tr.set(65.9, { x: 620, y: exY, a: 1 });
  [[66.0, 520], [66.5, 400], [67.0, 250]].forEach(([b, x]) => {
    hop(ex, b, b + 0.5, x, exY, { h: 70, sq: 0.35 });
    F.cue(b + 0.38, 'thud', { v: 0.35 });
    F.cue(b + 0.38, 'note', { n: 38, v: 0.3, d: 0.25 });
  });
  qu.tr.set(66.6, { x: 90, y: -980, r: 0.6, a: 1 });
  qu.tr.fn(66.6, 68.0, { x: 90, y: quY, r: 0 }, (u, a, b, out) => {
    copyInto(out, b);
    const v = Ease.out3(u);
    out.y = lerp(a.y, b.y, v);
    out.r = Math.sin(u * 11) * 0.45 * (1 - u);
    out.x = b.x + Math.sin(u * 11 + 1) * 40 * (1 - u);
    return out;
  });
  [[67.0, 69], [67.5, 72], [68.0, 76]].forEach(([b, n]) => F.cue(b, 'note', { n, v: 0.2, d: 0.5 }));
  const dots = [0, 1, 2].map((i) => F.glyph('.', STYLE.fog, { tag: 'dots', z: 3 }));
  dots.forEach((g, i) => {
    const x = -150 + i * 34, y = Glyph.cy(g.m, L1);
    g.tr.set(67.3 + i * 0.3, { x: x - 40, y: -900, a: 0 });
    g.tr.fn(67.3 + i * 0.3, 69.0 + i * 0.3, { x, y, a: 1 }, (u, a, b, out) => {
      copyInto(out, b);
      const v = Ease.out2(u);
      out.y = lerp(a.y, b.y, v);
      out.x = lerp(a.x, b.x, v) + Math.sin(u * 9 + i) * 26 * (1 - v);
      out.a = Math.min(1, u * 3);
      return out;
    });
    F.cue(67.75 + i * 0.5, 'note', { n: 81, v: 0.13 - i * 0.03, d: 0.9 });
  });
  // Точка выпрыгивает из кучи
  F.pool.delete(dot);
  const dotY = Glyph.cy(dot.m, L1);
  hop(dot, 68.3, 69.5, -272, dotY, { h: 170, ant: 0.12, sq: 0.5 });
  F.cue(69.3, 'note', { n: 50, v: 0.3, d: 0.2 }); F.cue(69.3, 'drop', { v: 0.5 });
  // курсор оглядывает компанию
  c.to(66.1, 66.4, { lean: 0.32 }, Ease.out3);
  c.to(67.0, 67.3, { lean: 0.22 }, Ease.io2);
  c.to(67.9, 68.2, { lean: 0.12 }, Ease.io2);
  c.to(69.2, 69.5, { lean: 0.36, h: 80 }, Ease.out3);
  c.to(69.7, 70.0, { lean: 0, h: W.caretH }, Ease.io2);
  S3.push(ex, qu, ...dots, dot);

  // — «БАХ!»
  const LB = Metrics.line('БАХ', STYLE.bang);
  const bx0 = -LB.width / 2 - 60, bBase = -150;
  const bang = [];
  [70.0, 70.6, 71.2].forEach((b, i) => {
    const g = F.glyph('БАХ'[i], STYLE.bang, { tag: 'bang', z: 1 });
    const y = Glyph.cy(g.m, bBase), x = bx0 + LB.chars[i].cx;
    g.tr.set(b - 0.45, { x, y: y - 900, a: 1, sx: 0.85, sy: 1.3 });
    g.tr.to(b - 0.45, b, { y, sx: 1, sy: 1 }, Ease.in3);
    g.tr.fn(b, b + 0.6, {}, (u, a, bb, out) => { copyInto(out, bb); const s = 0.4 * Math.exp(-u * 5) * Math.cos(u * 11); out.sy = 1 - s; out.sx = 1 + s * 0.7; out.y = bb.y + g.hh * (1 - out.sy); return out; });
    cam.shake(b, 20, 4, 7);
    F.cue(b, 'thud', { v: 1 });
    F.cue(b, 'chord', { n: i === 2 ? [24, 36, 43] : [26, 38, 45], v: 0.6, d: 0.9 });
    bang.push(g);
    S3.forEach((o) => o !== ex && o.tr.add(b + 0.02, b + 0.4, (t, s, u) => { s.y -= 14 * Math.sin(Math.PI * u); }));
  });
  // «!» прыгает в конец своего слова
  const exX = bx0 + LB.width + ex.m.w / 2 + 10, exY2 = Glyph.cy(ex.m, bBase);
  hop(ex, 71.55, 72.25, exX, exY2, { h: 150, ant: 0.25, sq: 0.45, spin: -1 });
  cam.shake(72.1, 26, 3.5, 6);
  F.cue(72.1, 'thud', { v: 1 });
  F.cue(72.1, 'chord', { n: [26, 38, 41, 45], v: 0.7, d: 1.2 });
  bang.push(ex);
  // курсор сбит с ног
  c.fn(70.02, 70.5, { lean: -1.42, h: 60 }, (u, a, b, out) => { mixInto(out, a, b, Ease.outBack(u)); return out; });
  F.blinkMode(70, 'solid');
  // поднимается
  c.to(72.9, 73.4, { lean: 0, h: W.caretH }, Ease.outBack);

  // — «А что, если?» — по дуге, снизу, волной
  const qText = 'А что, если';
  const LQ = Metrics.line(qText, STYLE.ask);
  const qx0 = -LQ.width / 2 - 40, qBase = -330;
  const ask = [];
  const wt = [64, 66, 68, 70, 72, 74, 76, 78, 80, 82, 84];
  LQ.chars.forEach((ch, i) => {
    if (ch.ch === ' ') return;
    const g = F.glyph(ch.ch, STYLE.ask, { tag: 'ask', z: 2 });
    const s = (ch.cx) / LQ.width;
    const x = qx0 + ch.cx, y = Glyph.cy(g.m, qBase) - 46 * Math.sin(Math.PI * s);
    const t0 = 73.0 + i * 0.18;
    g.tr.set(t0, { x: x - 60, y: 420, a: 0, r: -0.5 });
    flyPath(g, t0, t0 + 1.1, x, y, { x: x - 160, y: 150 }, { x: x + 60, y: y + 120 }, { patch: { a: 1, r: (s - 0.5) * -0.35 }, ease: Ease.out3, wave: 20, phase: i });
    F.cue(t0 + 0.9, 'note', { n: wt[i], v: 0.16, d: 0.5 });
    ask.push(g);
  });
  const quX = qx0 + LQ.width + qu.m.w / 2 + 8, quY2 = Glyph.cy(qu.m, qBase) - 8;
  qu.tr.fn(75.3, 76.1, { x: quX, y: quY2, r: 0.15 }, (u, a, b, out) => {
    copyInto(out, b);
    const v = Ease.io3(u);
    out.x = lerp(a.x, b.x, v); out.y = lerp(a.y, b.y, v) - Math.sin(Math.PI * v) * 170;
    out.r = lerp(a.r, b.r, v) + Math.sin(v * Math.PI) * 1.2;
    return out;
  });
  F.cue(75.9, 'note', { n: 82, v: 0.2, d: 1.2 });
  ask.push(qu);
  bang.forEach((g, i) => g.tr.add(73.6, 76.5, (t, o, u) => { o.r += Math.sin(Math.PI * u) * (i % 2 ? 0.1 : -0.12); }));

  // — «Туман и тишина…» — огромные тонкие буквы плывут туманом поверх всего
  const fText = 'Туман и тишина';
  const LF = Metrics.line(fText, STYLE.fog);
  const fx0 = -760, fBase = -230;
  const fog = [];
  LF.chars.forEach((ch, i) => {
    if (ch.ch === ' ') return;
    const g = F.glyph(ch.ch, STYLE.fog, { tag: 'fog', z: 5 });
    const x = fx0 + ch.cx, y = Glyph.cy(g.m, fBase);
    const t0 = 76.0 + i * 0.11;
    g.tr.set(t0, { x, y: y + 30, a: 0 });
    g.tr.fn(t0, 82.5, { x: x + 330, y: y - 10, a: 0.36 }, (u, a, b, out) => {
      copyInto(out, b);
      out.x = lerp(a.x, b.x, u);
      out.y = lerp(a.y, b.y, u) + Math.sin(u * 5 + i * 0.7) * 16;
      out.a = 0.36 * Math.min(1, u * 5);
      out.r = Math.sin(u * 3 + i) * 0.05;
      return out;
    });
    fog.push(g);
  });
  // многоточие догоняет туман
  dots.forEach((g, i) => {
    const t0 = 77.4 + i * 0.2;
    const x = fx0 + LF.width + 28 + i * 40 + 330 * ((t0 + 1.4 - 76) / 6.5);
    g.tr.fn(t0, t0 + 1.4, { x, y: Glyph.cy(g.m, fBase) - 10, a: 0.5 }, pathFn({ x: x - 200, y: -700 }, { x: x - 60, y: -420 }, { ease: Ease.io2 }));
    g.tr.fn(t0 + 1.4, 82.5, { x: x + 120 }, (u, a, b, out) => { mixInto(out, a, b, u); out.y += Math.sin(u * 5 + i) * 10; return out; });
  });
  F.cue(76, 'fog', { v: 0.6, d: 5 });
  F.cue(76, 'chord', { n: [88, 89, 93], v: 0.1, d: 4 });
  [78, 78.5, 79].forEach((b, i) => F.cue(b, 'note', { n: 93, v: 0.1 - i * 0.025, d: 1 }));
  fog.push(...dots);

  // — «Конец.» — Точка штампует своё
  const eText = 'Конец';
  const LE = Metrics.line(eText, STYLE.end);
  const ex0 = -LE.width / 2 - 20, eBase = -10;
  const end = [];
  const cad = [45, 52, 45, 52, 45];
  LE.chars.forEach((ch, i) => {
    const g = F.glyph(ch.ch, STYLE.end, { tag: 'end', z: 4 });
    const b = 79.0 + i * 0.5;
    const x = ex0 + ch.cx, y = Glyph.cy(g.m, eBase);
    g.tr.set(b - 0.2, { x, y: y - 260, a: 1, sy: 1.2, sx: 0.9 });
    g.tr.to(b - 0.2, b, { y, sy: 1, sx: 1 }, Ease.in3);
    g.tr.fn(b, b + 0.4, {}, (u, a, bb, out) => { copyInto(out, bb); const s = 0.3 * Math.exp(-u * 6) * Math.cos(u * 12); out.sy = 1 - s; out.sx = 1 + s; out.y = bb.y + g.hh * (1 - out.sy); return out; });
    F.cue(b, 'key', { kind: 'stamp', v: 1 });
    F.cue(b, 'note', { n: cad[i], v: 0.36, d: 0.35 });
    cam.shake(b, 6, 8, 9);
    end.push(g);
  });
  const edX = ex0 + LE.width + dot.m.w / 2 + 4, edY = Glyph.cy(dot.m, eBase);
  hop(dot, 81.05, 81.6, edX, edY, { h: 90, sq: 0.6 });
  F.cue(81.55, 'thud', { v: 0.8 });
  F.cue(81.55, 'chord', { n: [26, 38, 50], v: 0.55, d: 1 });
  cam.shake(81.55, 12, 5, 8);
  end.push(dot);
  // пауза ужаса
  c.to(81.6, 81.9, { h: 112, w: 4.4, lean: -0.1 }, Ease.out3);
  cam.move(81.2, { x: -20, y: -300, z: 1.42 }, Ease.io2);
  cam.hold(82.5);

  // — Вихрь: все голоса разом
  const all = [...bang, ...ask, ...fog, ...end];
  const C = { x: -10, y: -250 };
  const V0 = 82.5, VF = 88.0, VE = 89.0;
  const phi = (t) => { const d = Math.max(0, Math.min(t, VF) - V0); return 0.5 * d * d; };
  const vortex = (g, i, st0) => {
    const dx = st0.x - C.x, dy = (st0.y - C.y) / 0.6;
    const th0 = Math.atan2(dy, dx), r0 = Math.hypot(dx, dy);
    const R = 120 + hash(i * 13 + 5) * 360, sp = 0.8 + hash(i * 7 + 1) * 0.5, spin = (hash(i + 99) - 0.5) * 3;
    return (t) => {
      const tt = Math.min(t, VF);
      const bl = smooth(clamp((tt - V0) / 1.6));
      const th = th0 + phi(tt) * sp;
      const rr = lerp(r0, R, bl) + 24 * Math.sin(3 * th + i) * bl;
      return {
        x: C.x + Math.cos(th) * rr,
        y: C.y + Math.sin(th) * rr * 0.6,
        r: st0.r + spin * Math.pow(Math.max(0, tt - V0), 1.6) * 0.6,
        a: lerp(st0.a, Math.max(st0.a, 0.85), bl),
      };
    };
  };
  all.forEach((g, i) => {
    const st0 = g.tr.stateAt(V0);
    const f = vortex(g, i, st0);
    const endS = f(VF);
    g.tr.fn(V0, VE, { x: endS.x, y: endS.y, r: endS.r, a: endS.a, sx: 1, sy: 1 }, (u, a, b, out, t) => {
      copyInto(out, b);
      const s = f(t);
      out.x = s.x; out.y = s.y; out.r = s.r; out.a = s.a;
      out.sx = lerp(a.sx, 1, u); out.sy = lerp(a.sy, 1, u);
      return out;
    });
    g._vortex = f;
  });
  // курсор — в центре, вертится волчком
  const cA = c.stateAt(V0);
  const cursorV = (t) => {
    const o = Object.assign({}, cA);
    const tt = Math.min(t, VF);
    const bl = smooth(clamp((tt - V0) / 1.2));
    const ang = phi(tt) * 1.7;
    o.h = lerp(cA.h, 96, bl); o.w = lerp(cA.w, 6, bl);
    o.lean = lerp(cA.lean, ang, bl);
    const mx = lerp(cA.x + Math.sin(cA.lean) * cA.h / 2, C.x, bl), my = lerp(cA.y - Math.cos(cA.lean) * cA.h / 2, C.y, bl);
    o.x = mx - Math.sin(o.lean) * o.h / 2; o.y = my + Math.cos(o.lean) * o.h / 2;
    return o;
  };
  c.fn(V0, VE, cursorV(VF), (u, a, b, out, t) => copyInto(out, cursorV(t)));
  // камера: наезд, крен, толчки в долю
  cam.move(84, { x: C.x, y: C.y + 10, z: 1.18, r: 0.06 }, Ease.io2);
  [84, 85, 86, 87].forEach((b, i) => {
    cam.move(b + 0.12, { z: 1.32 + i * 0.05, r: 0.06 + (i % 2 ? -0.05 : 0.05) - i * 0.01 }, Ease.out3);
    cam.move(b + 0.9, { z: 1.2 + i * 0.03 }, Ease.io2);
    cam.shake(b, 8 + i * 3, 5, 10);
  });
  cam.move(88.0, { z: 1.34, r: -0.03 }, Ease.out3);
  cam.hold(88.99);
  // звук вихря
  for (let b = 82.5; b < 88; b += 0.25) F.cue(b, 'key', { kind: 'key', v: 0.35 + (b - 82.5) * 0.08, p: hash(b * 8) });
  [[83, [50, 51, 57]], [84, [52, 53, 59]], [85, [54, 55, 61]], [86, [56, 57, 63]], [87, [57, 58, 64]], [87.5, [59, 60, 66]]].forEach(([b, n], i) => F.cue(b, 'chord', { n, v: 0.26 + i * 0.05, d: 0.9 }));
  for (let b = 82.5; b < 88; b += 0.5) F.cue(b, 'note', { n: 26, v: 0.3, d: 0.4 });
  F.cue(82.5, 'fog', { v: 0.5, d: 5.5, rise: 1 });

  // Ctrl+A — стоп-кадр с выделением
  F.cue(87.8, 'key', { kind: 'key', v: 0.6 }); F.cue(88, 'key', { kind: 'key', v: 0.8 });
  all.forEach((g) => g.tr.add(88.0, 92, (t, o) => { o.sel = t < 89 ? clamp((t - 88) / 0.08) : clamp(1 - (t - 89) / 1.4); }));
  F.blinkMode(88, 'solid');

  // Delete — всё разлетается и осыпается
  F.cue(89, 'key', { kind: 'enter', v: 1 });
  F.cue(89, 'whoosh', { v: 0.8 });
  F.cue(89, 'gliss', { from: 86, to: 50, d: 1.6, v: 0.16 });
  F.cue(89, 'chord', { n: [26, 38], v: 0.4, d: 4 });
  all.forEach((g, i) => {
    let vx = 0, vy = 0;
    if (g._vortex) {
      const p1 = g._vortex(VF), p0 = g._vortex(VF - 0.05);
      vx = (p1.x - p0.x) / 0.05 * 0.28; vy = (p1.y - p0.y) / 0.05 * 0.28 - 160;
    }
    const isDot = g === dot;
    fallToHeap(F, g, VE + (isDot ? 0.35 : hash(i * 3 + 1) * 0.25), {
      vx: isDot ? 120 : clamp(vx, -520, 520), vy: isDot ? -200 : clamp(vy, -520, 200), g: G * 0.62,
      dx: isDot ? 360 : 0, clink: i % 2 === 0, vol: 0.4, rest: isDot ? 0 : undefined,
    });
    poolAdd(F, g);
  });
  // курсор со звоном возвращается к началу строки
  c.fn(VE, VE + 1.6, { x: x0, y: caretY(1), lean: 0, h: W.caretH, w: W.caretW, bend: 0 }, (u, a, b, out) => {
    copyInto(out, b);
    const v = Ease.out3(Math.min(1, u * 3));
    out.x = lerp(a.x, b.x, v); out.y = lerp(a.y, b.y, v);
    out.lean = 0.9 * Math.exp(-u * 4) * Math.cos(u * 18);
    out.h = lerp(a.h, b.h, v);
    return out;
  });
  F.cue(VE, 'boing', { v: 0.6 });
  cam.cut(VE, { x: 0, y: 30, z: 0.72, r: 0 });
  cam.move(95.4, { x: 0, y: 60, z: 0.64 }, Ease.io2);
  F.blinkMode(91, 'slow');
  F.clock.key(94, '03:47');
  F.cue(94, 'tick', { v: 0.6 }); F.cue(94.5, 'tick', { v: 0.5 });
  ticks(F, 91, 95.5, 3, 0.4);
  F.S3 = all;
}

// ————————————————————————————————————————————————————————————————
// Сцена 4. Храп: писатель уснул лицом на клавиатуре; курсор бережно убирает «хррр»
function scene4(F) {
  F.scene(96, 'Храп');
  const c = F.cursor, cam = F.cam, x0 = W.colL, L1 = baseline(1), L2 = baseline(2);
  cam.cut(95.5, { x: x0 + 330, y: L1 + 55, z: 1.95, r: 0 });
  cam.move(99.8, { x: x0 + 320, y: L1 + 50, z: 2.15 }, Ease.io2);
  F.blinkMode(96, 'slow');
  c.to(96.4, 96.8, { lean: -0.26 }, Ease.out3);
  c.to(97.4, 97.9, { lean: 0.26 }, Ease.io3);
  c.to(98.3, 98.6, { lean: 0 }, Ease.io2);
  c.to(98.6, 99.3, { h: 56, bend: 0.14 }, Ease.io2);
  c.to(99.4, 99.95, { h: W.caretH, bend: 0 }, Ease.io2);
  [[96, 65], [97, 64], [98, 62], [99, 61]].forEach(([b, n]) => F.cue(b, 'note', { n, v: 0.24, d: 1 }));
  F.cue(96, 'note', { n: 38, v: 0.2, d: 4 });

  // храп: «Хррр…» ×3
  F.blinkMode(100, 'solid');
  const snore = [];
  const s1 = 'Хррррррррр';
  const t1 = [100]; for (let i = 1; i < s1.length; i++) t1.push(100.18 + (i - 1) * 0.09);
  snore.push(...typeLine(F, s1, STYLE.doc, x0, L1, t1, { kind: 'snore', vol: 0.55, dy: 20, lean: 0.05, src: 'snore' }));
  c.add(100, 100.8, (t, o, u) => { const s = Math.sin(Math.PI * u); o.y -= 26 * s; o.h *= 1 + 0.35 * s; });
  const L1w = Metrics.line(s1 + ' ', STYLE.doc).width;
  const s2 = 'хрррррррр';
  const t2 = [102.5]; for (let i = 1; i < s2.length; i++) t2.push(102.66 + (i - 1) * 0.09);
  snore.push(...typeLine(F, s2, STYLE.doc, x0 + L1w, L1, t2, { kind: 'snore', vol: 0.5, dy: 20, lean: 0.05, src: 'snore' }));
  const L1end = x0 + L1w + Metrics.line(s2, STYLE.doc).width + 4;
  Caret.hop(F, 104.6, 105.0, x0, caretY(2), { arc: 50 });
  const s3 = 'хрррррр';
  const t3 = [105.2]; for (let i = 1; i < s3.length; i++) t3.push(105.36 + (i - 1) * 0.1);
  const line2 = typeLine(F, s3, STYLE.doc, x0, L2, t3, { kind: 'snore', vol: 0.45, dy: 20, lean: 0.05, src: 'snore' });
  snore.push(...line2);
  [[100, 1.3], [102.5, 1.1], [105.2, 0.8]].forEach(([b, d], i) => {
    F.cue(b, 'snore', { d, v: 0.7 - i * 0.12 });
    F.cue(b, 'note', { n: [38, 36, 34][i], v: 0.24, d: d + 0.3 });
  });
  const rattle = (list, t0, t1) => list.forEach((g, i) => g && g.tr.add(t0, t1, (t, o) => { o.y += Math.sin(t * 90 + i) * 1.6; o.r += Math.sin(t * 70 + i * 2) * 0.03; }));
  rattle(snore.slice(0, 10), 100.2, 101.2);
  rattle(snore.slice(10, 19), 102.6, 103.5);
  rattle(line2, 105.3, 106.1);
  F.words.key(101.3, 1).key(103.7, 2).key(106, 3);
  // пауза: курсор оглядывается, понимает
  F.blinkMode(106.2, 'slow');
  const cx = c.cur.x;
  c.to(106.3, 106.6, { x: cx + 26 }, Ease.out3);
  c.to(106.6, 107.0, { lean: -0.36 }, Ease.out3);
  c.to(107.3, 107.7, { lean: 0.22, h: 76 }, Ease.io2);
  c.to(107.8, 108.2, { lean: 0, h: 62, bend: 0.12 }, Ease.io2);
  F.cue(106.4, 'chord', { n: [46, 53, 57, 62], v: 0.22, d: 2.5 });

  // уборка: «р» падают домино, курсор идёт назад
  F.blinkMode(108.2, 'solid');
  const glyphs = snore.filter(Boolean);
  const order = [...line2.filter(Boolean).reverse(), ...snore.slice(0, 19).filter(Boolean).reverse()];   // первая строка — 10 + 9 букв
  let t = 108.3;
  let jumped = false;
  order.forEach((g, i) => {
    if (!jumped && !line2.includes(g)) {
      Caret.hop(F, t, t + 0.3, L1end, caretY(1), { arc: 30 });
      t += 0.34; jumped = true;
    }
    const s = g.tr.stateAt(t);
    g.tr.to(t, t + 0.16, { r: -1.25, x: s.x - 6 }, Ease.in2);
    fallToHeap(F, g, t + 0.16, { vy: -60, vx: -40 - hash(i) * 80, clink: i % 3 === 0, vol: 0.35 });
    poolAdd(F, g);
    Caret.push(F, t, s.x - g.m.w / 2 - 2, { d: 0.07, lean: -0.08 });
    F.cue(t, 'key', { kind: 'domino', v: 0.45, p: hash(i) });
    t += 0.065;
  });
  c.to(t + 0.05, t + 0.3, { x: x0, bend: 0, h: W.caretH }, Ease.out3);
  F.words.key(t, 0);
  [[108.3, 86], [108.55, 84], [108.8, 82], [109.05, 81], [109.3, 79], [109.55, 77], [109.8, 76], [110.05, 74], [110.3, 72]].forEach(([b, n]) => F.cue(b, 'note', { n, v: 0.12, d: 0.3 }));
  cam.cut(109.9, { x: 0, y: 60, z: 0.66, r: 0 });
  F.clock.key(110.5, '03:58');
  // смотрит вниз, на кучу — и решается
  cam.cut(111.0, { x: x0 + 150, y: caretY(1) + 10, z: 2.9, r: 0 });
  F.blinkMode(111, 'solid');
  c.to(111.0, 111.4, { lean: 0.42, bend: 0.3 }, Ease.out3);
  c.to(111.6, 112.0, { lean: 0, bend: 0, h: 88 }, Ease.outBack);
  [[111, 62], [111.25, 65], [111.5, 69], [111.75, 74]].forEach(([b, n]) => F.cue(b, 'note', { n, v: 0.26, d: 0.4 }));
}

// ————————————————————————————————————————————————————————————————
// Сцена 5. Сборка: курсор спускается в кучу, находит часы, дирижирует буквами
function scene5(F) {
  F.scene(112, 'Сборка');
  const c = F.cursor, cam = F.cam, x0 = W.colL, L1 = baseline(1), L2 = baseline(2);
  const heap = F.heap;
  // — прыжок вниз
  const landX = 36;
  const landY = W.floor - heap.topAt(landX, 20) * 0.9 + 4;
  c.to(112.0, 112.45, { h: 48, w: 7 }, Ease.out2);
  c.fn(112.45, 113.85, { x: landX, y: landY, h: W.caretH, w: W.caretW, lean: 0 }, (u, a, b, out) => {
    copyInto(out, b);
    const v = u;
    out.x = lerp(a.x, b.x, Ease.io2(v));
    out.y = lerp(a.y, b.y, Ease.in2(v)) - Math.sin(Math.PI * Math.min(1, v * 1.8)) * 120 * (1 - v);
    const sp = Math.min(1, v * 2);
    out.h = lerp(48, 132, sp) * (v > 0.92 ? lerp(1, 0.55, (v - 0.92) / 0.08) : 1);
    out.w = lerp(7, 3.8, sp);
    out.lean = 0.12 * Math.sin(v * Math.PI);
    return out;
  });
  c.fn(113.85, 114.4, { h: W.caretH, w: W.caretW }, (u, a, b, out) => { copyInto(out, b); out.h = b.h * (1 - 0.35 * Math.exp(-u * 4) * Math.cos(u * 10)); return out; });
  cam.cut(112.45, { x: -120, y: L1 + 120, z: 1.35, r: 0 });
  cam.move(113.9, { x: 0, y: 590, z: 1.55 }, Ease.io2);
  [[112.5, 77], [112.75, 72], [113, 69], [113.25, 65], [113.5, 60]].forEach(([b, n]) => F.cue(b, 'note', { n, v: 0.2, d: 0.4 }));
  F.cue(113.85, 'thud', { v: 0.5 }); F.cue(113.85, 'chord', { n: [29, 41], v: 0.3, d: 1.5 });
  for (const g of F.pool) {
    const r = restOf(g);
    const d = Math.hypot(r.x - landX, r.y - landY);
    if (d < 160) g.tr.add(113.85, 114.5, (t, o, u) => { o.y -= (1 - d / 160) * 22 * Math.sin(Math.PI * u); });
  }
  F.cue(113.9, 'clink', { v: 0.4, p: 0.3 }); F.cue(114.0, 'clink', { v: 0.35, p: 0.7 });

  // — раскопки над строкой состояния
  const dig = [...F.pool].filter((g) => {
    const r = restOf(g);
    const rad = Math.max(g.m.w, g.hh * 2) * 0.5;
    return Math.abs(r.x - 10) < 150 + rad * 0.5 && r.y > W.floor - 330;
  }).sort((a, b) => restOf(a).y - restOf(b).y);
  const digT0 = 114.2, digStep = Math.min(0.13, 1.95 / Math.max(1, dig.length));
  dig.forEach((g, i) => {
    const t = digT0 + i * digStep;
    const side = i % 2 ? 1 : -1;
    fallToHeap(F, g, t, { vx: side * (260 + hash(i * 5) * 260), vy: -(240 + hash(i * 9) * 200), dx: side * 120, clink: i % 2 === 0, vol: 0.35 });
  });
  const digEnd = digT0 + dig.length * digStep;
  c.add(114.1, digEnd + 0.2, (t, o) => { o.lean += Math.sin((t - 114.1) * TAU * 3) * 0.45; o.h *= 1 + 0.12 * Math.sin((t - 114.1) * TAU * 6); });
  c.to(digEnd + 0.2, digEnd + 0.5, { x: 146, y: W.floor, h: 58 }, Ease.out3);
  F.env.statusLit = new Keys(0).key(digEnd - 0.4, 0).key(digEnd + 0.4, 1).key(146, 1).key(150, 0.3);

  // — крупно: часы
  const clk = Math.max(116.6, digEnd + 0.5);
  cam.cut(clk, { x: 70, y: W.floor - 24, z: 5.4, r: 0 });
  F.blinkMode(clk, 'blink');
  c.to(clk + 0.1, clk + 0.5, { lean: -0.32 }, Ease.out3);
  F.cue(clk, 'roll', { n: [77, 81, 84, 88], v: 0.16, d: 3, s: 0.08 });
  cam.move(clk + 1.9, { x: 90, y: W.floor - 60, z: 3.6 }, Ease.io2);
  c.to(clk + 1.0, clk + 1.5, { lean: -0.08, bend: -0.2, h: 64 }, Ease.io2);
  // озарение
  const eu = clk + 1.9;
  F.blinkMode(eu, 'solid');
  c.to(eu, eu + 0.35, { h: 124, w: 4.6, bend: 0, lean: 0, glow: 2.6 }, Ease.out3);
  c.to(eu + 0.35, eu + 1.0, { h: W.caretH, w: W.caretW, glow: 1.25 }, Ease.outBack);
  F.cue(eu, 'roll', { n: [65, 69, 72, 77], v: 0.26, d: 2, s: 0.07 });

  // — «было»: те самые четыре буквы, что говорили «было.»
  const byl = F.byl;
  byl.forEach((g) => F.pool.delete(g));
  const bylR = byl.map(restOf);
  const bx = bylR.reduce((s, r) => s + r.x, 0) / 4, by = Math.min(...bylR.map((r) => r.y));
  const tb = eu + 1.1;
  cam.cut(tb, { x: bx + 60, y: by - 40, z: 2.4, r: 0 });
  Caret.hop(F, tb, tb + 0.55, bylR[3].x + 44, by + 40, { arc: 70, h0: W.caretH });
  F.blinkMode(tb, 'solid');
  byl.forEach((g, i) => {
    const tt = tb + 0.7 + i * 0.3;
    const r = restOf(g);
    g.tr.fn(tt, tt + 0.45, { r: upright(r.r), y: r.y - 26, k: 1 }, hopFn(g.hh, { h: 30, ant: 0.15, spin: 0 }));
    c.add(tt - 0.1, tt + 0.2, (t, o, u) => { o.lean += -0.3 * Math.sin(Math.PI * u); });
    F.cue(tt + 0.1, 'note', { n: [72, 74, 76, 77][i], v: 0.22, d: 0.5 });
  });
  const tUp = tb + 2.1;
  const line1 = 'Было три часа ночи,';
  const line2 = 'и врать было некому.';
  const P1 = Metrics.line(line1, STYLE.doc), P2 = Metrics.line(line2, STYLE.doc);
  const slot = (P, base, i, g) => ({ x: x0 + P.chars[i].cx, y: base - Metrics.glyph(P.chars[i].ch, STYLE.doc).cy });
  // курсор летит вверх первым
  c.fn(tUp, tUp + 2.0, { x: x0, y: caretY(1), h: W.caretH, lean: 0 }, (u, a, b, out) => {
    copyInto(out, b);
    const v = Ease.io3(u);
    out.x = lerp(a.x, b.x, v) + Math.sin(v * Math.PI) * 220;
    out.y = lerp(a.y, b.y, v);
    out.h = W.caretH * (1 + 0.5 * Math.sin(Math.PI * v));
    out.lean = Math.sin(v * Math.PI) * -0.25;
    return out;
  });
  cam.cut(tUp, { x: bx + 40, y: by - 160, z: 1.3, r: 0 });
  cam.move(tUp + 2.3, { x: x0 + 330, y: L1 + 40, z: 1.72, r: 0 }, Ease.io3);
  const landed = [];
  byl.forEach((g, i) => {
    const s = slot(P1, L1, i);
    const t0 = tUp + 0.15 + i * 0.12, t1 = tUp + 2.2 + i * 0.25;
    flyPath(g, t0, t1, s.x, s.y, { x: g.tr.cur.x + 260, y: g.tr.cur.y - 520 }, { x: s.x - 160, y: s.y + 380 }, { patch: { r: 0, k: 1, sx: 1, sy: 1 }, ease: Ease.io2 });
    g.morph(t1 - 0.05, g.ch, STYLE.doc);
    landed.push([g, t1]);
    F.cue(t1, 'note', { n: [69, 72, 77, 76][i], v: 0.3, d: 0.6 });
    Caret.push(F, t1, x0 + P1.chars[i].x1 + 5);
  });
  // «б» становится заглавной
  const tCap = tUp + 3.35;
  byl[0].morph(tCap, 'Б', STYLE.doc);
  byl[0].tr.add(tCap - 0.2, tCap + 0.4, (t, o, u) => { o.y -= 10 * Math.sin(Math.PI * u); });
  F.cue(tCap, 'note', { n: 84, v: 0.18, d: 0.4 });
  c.add(tCap + 0.1, tCap + 0.6, (t, o, u) => { o.lean += 0.35 * Math.sin(Math.PI * u); o.h *= 1 - 0.12 * Math.sin(Math.PI * u); });
  F.words.key(tUp + 3, 1);

  // — дирижирование: слова взлетают из кучи по взмаху курсора
  const T0 = 125.5;
  const sched = [];                    // [слово, строка, индексы, моменты посадки, манера]
  const word = (line, P, base, from, to, times, manner) => sched.push({ line, P, base, from, to, times, manner });
  word(1, P1, L1, 5, 7, [126.5, 126.75, 127.0], 'frog');
  word(1, P1, L1, 9, 12, [128.0, 128.25, 128.5, 128.75], 'wheel');
  word(1, P1, L1, 14, 17, [130.0, 130.0, 130.0, 130.0], 'unit');
  word(2, P2, L2, 0, 0, [132.75], 'hop');
  word(2, P2, L2, 2, 6, [133.5, 133.75, 134.0, 134.25, 134.75], 'spiral');
  word(2, P2, L2, 8, 11, [135.5, 135.75, 136.0, 136.25], 'march');
  word(2, P2, L2, 13, 18, [137.5, 137.75, 138.0, 138.25, 138.5, 138.75], 'wave');
  const mel = {
    frog: [67, 72, 76], wheel: [77, 76, 74, 72], hop: [74], spiral: [77, 76, 74, 72, 69],
    march: [70, 74, 79, 77], wave: [76, 77, 79, 77, 76, 74],
  };
  const noch = [12, 13, 14, 15].map((i) => F.a1[i]);
  noch.forEach((g) => F.pool.delete(g));
  F.pool.delete(F.point);
  const heapSrc = (ch, pref) => poolTake(F, ch, pref);
  let softSign = null;
  sched.forEach((w) => {
    const idx = [];
    for (let i = w.from; i <= w.to; i++) idx.push(i);
    if (w.manner === 'unit') {
      // «ночь» летит целиком, потом «ь» уступает место «и»
      const src = noch;
      const tL = w.times[0], tF = tL - 2.2;
      const ax = restOf(src[0]).x, ay = restOf(src[0]).y;
      src.forEach((g, k) => {
        const s = slot(w.P, w.base, w.from + k);
        const r = restOf(g);
        g.tr.fn(tF - 0.4, tF, { r: upright(r.r), y: r.y - 20, k: 1 }, hopFn(g.hh, { h: 24 }));
        flyPath(g, tF, tL, s.x, s.y, { x: ax + 200, y: ay - 600 }, { x: s.x + 240, y: s.y + 300 }, { patch: { k: 1, r: 0 }, ease: Ease.io3 });
        if (k < 3) g.morph(tL, g.ch, STYLE.doc);
      });
      F.cue(tL, 'chord', { n: [69, 72, 76], v: 0.28, d: 0.9 });
      F.cue(tL, 'clink', { v: 0.4, p: 0.5 });
      // «ь» выпрыгивает на поля и дуется
      softSign = src[3];
      softSign.morph(tL, 'ь', STYLE.doc);
      hop(softSign, tL + 0.45, tL + 1.05, W.colR + 50, Glyph.cy(softSign.m, L1) + 2, { h: 70, spin: 1 });
      F.cue(tL + 0.6, 'note', { n: 53, v: 0.26, d: 0.3 });
      softSign.tr.add(tL + 1.1, 134.2, (t, o) => { o.r += -0.18 + Math.sin(t * 5) * 0.03; });
      // «и» занимает место
      const gi = heapSrc('и');
      const si = slot(w.P, w.base, 17);
      const ri = restOf(gi);
      gi.tr.fn(tL - 0.9, tL - 0.5, { r: upright(ri.r), y: ri.y - 20, k: 1 }, hopFn(gi.hh, { h: 24 }));
      flyPath(gi, tL - 0.5, tL + 1.25, si.x, si.y, { x: ri.x - 200, y: ri.y - 700 }, { x: si.x - 50, y: si.y + 260 }, { patch: { k: 1, r: 0 }, ease: Ease.io3 });
      gi.morph(tL + 1.2, 'и', STYLE.doc);
      F.cue(tL + 1.25, 'note', { n: 74, v: 0.26, d: 0.4 });
      // запятая — головастиком
      const gc = heapSrc(',');
      const sc = slot(w.P, w.base, 18);
      const rc = restOf(gc);
      gc.tr.fn(tL - 0.7, tL - 0.3, { r: upright(rc.r), k: 1 }, hopFn(gc.hh, { h: 16 }));
      flyPath(gc, tL - 0.3, tL + 1.5, sc.x, sc.y, { x: rc.x + 300, y: rc.y - 500 }, { x: sc.x + 120, y: sc.y + 200 }, { patch: { k: 1, r: 0 }, ease: Ease.io2, spin: 2 });
      gc.morph(tL + 1.45, ',', STYLE.doc);
      F.cue(tL + 1.5, 'note', { n: 76, v: 0.2, d: 0.25 });
      Caret.push(F, tL + 1.5, x0 + w.P.chars[18].x1 + 5);
      return;
    }
    idx.forEach((ci, k) => {
      const ch = w.P.chars[ci].ch;
      const tL = w.times[k];
      let g;
      if (w.manner === 'spiral' && ch === 'ь' && softSign) g = softSign;
      else g = heapSrc(ch, (gg) => gg.src === 'a1' || gg.src === 'a2' || gg.src === 'snore');
      if (!g) return;
      const s = slot(w.P, w.base, ci);
      if (g === softSign) {
        hop(g, tL - 0.6, tL, s.x, s.y, { h: 90, spin: -1, patch: { k: 1, r: 0 } });
        F.cue(tL, 'note', { n: mel[w.manner][k], v: 0.28, d: 0.5 });
        return;
      }
      const r = restOf(g);
      const tF = tL - 2.3 - (w.manner === 'frog' ? 0 : 0);
      g.tr.fn(tF - 0.4, tF, { r: upright(r.r), y: r.y - 22, k: 1, sx: 1, sy: 1 }, hopFn(g.hh, { h: 26 }));
      if (w.manner === 'frog') {
        flyPath(g, tF, tL - 0.4, s.x - 40, s.y + 90, { x: r.x + 150, y: r.y - 500 }, { x: s.x - 200, y: s.y + 400 }, { patch: { k: 1, r: 0 }, ease: Ease.io2 });
        hop(g, tL - 0.4, tL + 0.12, s.x, s.y, { h: 70, ant: 0.1 });
      } else if (w.manner === 'wheel') {
        flyPath(g, tF, tL, s.x, s.y, { x: r.x - 300, y: r.y - 400 }, { x: s.x + 300, y: s.y + 250 }, { patch: { k: 1, r: 0 }, ease: Ease.io2, spin: 2 });
      } else if (w.manner === 'spiral') {
        flyPath(g, tF, tL, s.x, s.y, { x: r.x, y: r.y - 700 }, { x: s.x, y: s.y + 300 }, { patch: { k: 1, r: 0 }, ease: Ease.io2, swirl: 140, turns: 2.5, phase: k });
      } else if (w.manner === 'march') {
        flyPath(g, tF + k * 0.05, tL, s.x, s.y, { x: -600, y: 300 }, { x: s.x - 300, y: s.y + 100 }, { patch: { k: 1, r: 0 }, ease: Ease.io2 });
      } else if (w.manner === 'wave') {
        flyPath(g, tF, tL, s.x, s.y, { x: r.x + 400, y: r.y - 400 }, { x: s.x + 400, y: s.y + 150 }, { patch: { k: 1, r: 0 }, ease: Ease.io2, wave: 60, phase: k * 0.9 });
      } else {
        flyPath(g, tF, tL, s.x, s.y, { x: r.x, y: r.y - 600 }, { x: s.x, y: s.y + 300 }, { patch: { k: 1, r: 0 }, ease: Ease.io2 });
      }
      g.morph(tL - 0.06, ch, STYLE.doc);
      g.tr.add(tL, tL + 0.45, (t, o, u) => { const q = 0.18 * Math.exp(-u * 5) * Math.cos(u * 11); o.sy *= 1 - q; o.sx *= 1 + q * 0.7; });
      F.cue(tL, 'note', { n: mel[w.manner][k], v: 0.28, d: 0.5 });
      F.cue(tL - 2.3, 'hop', { v: 0.12 });
    });
    const lastI = w.to;
    const tEnd = w.times[w.times.length - 1];
    if (w.line === 2 && w.from === 0) {
      // перенос строки — курсор прыгает вниз
      Caret.hop(F, 131.9, 132.45, x0, caretY(2), { arc: 70 });
      F.cue(132.2, 'note', { n: 84, v: 0.2, d: 0.4 });
    }
    Caret.push(F, tEnd, x0 + w.P.chars[lastI].x1 + 5);
  });
  // курсор дирижирует
  for (let b = T0; b < 139; b += 1) {
    const dir = Math.round(b) % 2 ? 1 : -1;
    c.add(b, b + 1, (t, o, u) => { o.lean += dir * 0.3 * Math.sin(Math.PI * u); });
  }
  F.words.key(127.1, 2).key(128.9, 3).key(131.3, 4).key(132.8, 5).key(134.8, 6).key(136.4, 7).key(138.9, 8);
  // аккомпанемент
  [[126, [41, 48, 57]], [128, [40, 48, 55]], [130, [38, 45, 53]], [132, [34, 46, 53]], [134, [33, 45, 53]], [136, [31, 43, 50]], [138, [36, 43, 46]]].forEach(([b, n]) => {
    F.cue(b, 'roll', { n, v: 0.2, d: 2, s: 0.1 });
  });
  cam.move(131.6, { x: x0 + 330, y: L1 + 40, z: 1.8 }, Ease.io2);
  cam.move(132.8, { x: x0 + 330, y: L1 + 70, z: 1.8 }, Ease.io2);
  cam.move(139, { x: x0 + 340, y: L1 + 70, z: 1.92 }, Ease.io2);

  // — Точка: приглашение и полёт
  const dot = F.point;
  F.pool.delete(dot);
  const dr = restOf(dot);
  c.to(139.1, 139.6, { lean: 0.5, bend: 0.28 }, Ease.out3);
  c.to(139.8, 140.2, { lean: 0, bend: 0 }, Ease.io2);
  cam.cut(139.9, { x: dr.x + 10, y: dr.y - 22, z: 6.2, r: 0 });
  dot.tr.to(139.95, 140.2, { k: 0.85 }, Ease.out2);      // «меня?» — вспыхивает, серая среди серых
  dot.tr.fn(140.2, 140.5, { x: dr.x - 8, r: 0 }, hopFn(dot.hh, { h: 14 }));
  dot.tr.fn(140.7, 141.0, { x: dr.x + 6 }, hopFn(dot.hh, { h: 14 }));
  F.cue(140.45, 'note', { n: 89, v: 0.12, d: 0.2 }); F.cue(140.95, 'note', { n: 89, v: 0.1, d: 0.2 });
  dot.tr.to(141.0, 141.9, { k: 1 }, Ease.io2);
  cam.cut(141.1, { x: x0 + 520, y: L2 - 40, z: 2.9, r: 0 });
  c.to(141.2, 141.5, { lean: 0.55, bend: 0.1 }, Ease.out3);
  c.to(141.6, 141.9, { lean: 0, bend: 0 }, Ease.io2);
  const dX = x0 + P2.chars[19].cx, dY = Glyph.cy(dot.m, L2);
  const jt0 = 142.0, jt1 = 144.8;
  hop(dot, jt0, jt1, dX, dY, { h: 380, ant: 0.1, land: 0.16, sq: 0.18, patch: { k: 1 } });
  dot.morph(jt1 - 0.1, '.', STYLE.doc);
  dot.trail = [jt0 + 0.2, jt1 - 0.05];
  // камера следит за полётом
  const probe = dot.tr.stateAt.bind(dot.tr);
  cam.cut(jt0, { x: dr.x, y: dr.y - 60, z: 2.5, r: 0 });
  for (let b = jt0 + 0.35; b <= jt1 - 0.2; b += 0.35) {
    const p = probe(b + 0.15);
    cam.move(b, { x: lerp(p.x, dX, 0.2), y: p.y, z: 2.2 }, Ease.lin);
  }
  cam.move(jt1 + 0.3, { x: dX - 260, y: dY - 30, z: 2.2 }, Ease.out3);
  F.cue(jt0 + 0.3, 'gliss', { from: 65, to: 89, d: 1.8, v: 0.08 });
  F.cue(jt1 - 0.3, 'ding', { v: 0.6, n: 81 });
  F.cue(jt1 - 0.3, 'chord', { n: [29, 41, 48, 57, 65], v: 0.3, d: 5 });
  Caret.push(F, jt1 - 0.1, x0 + P2.width + 6, { d: 0.4 });
  F.words.key(jt1, 8);
  F.blinkMode(jt1 + 0.3, 'blink');
  ticks(F, jt1 + 0.3, 156, 2, 0.35);
  cam.move(146, { x: x0 + 300, y: L1 + 36, z: 1.72 }, Ease.io3);
  cam.move(155.9, { x: x0 + 300, y: L1 + 36, z: 1.9 }, Ease.io2);
  // тепло курсора медленно остывает в чернила
  const phrase = F.glyphs.filter((g) => g.morphs.some((m) => m.t > 120 && m.style === STYLE.doc));
  phrase.forEach((g) => g.tr.to(146, 154, { k: 0 }, Ease.io2));
  // реприза темы
  const rep = [[146, 69], [147, 72], [148, 77], [149, 76], [150, 74], [151, 72], [152, 70], [153, 69], [154, 67], [155, 65]];
  rep.forEach(([b, n]) => F.cue(b, 'note', { n, v: 0.2, d: 1.1 }));
  [[146, [41, 48, 57]], [148, [40, 48, 55]], [150, [38, 45, 53]], [152, [34, 46, 53]], [154, [36, 43, 46]]].forEach(([b, n]) => F.cue(b, 'roll', { n, v: 0.18, d: 2, s: 0.12 }));
  F.phrase = phrase;
}

// ————————————————————————————————————————————————————————————————
// Сцена 6. Утро: писатель просыпается — «Курсор не в счёт.» — и пишет дальше
function scene6(F) {
  F.scene(156, 'Утро');
  const c = F.cursor, cam = F.cam, x0 = W.colL, L3 = baseline(3);
  F.env.dawn.key(156, 0).key(163, 1, Ease.io2);
  F.clock.key(158, '05:40');
  cam.move(159.6, { x: x0 + 320, y: L3 - 60, z: 1.6 }, Ease.io2);
  // зевок — как в начале
  F.blinkMode(156.8, 'solid');
  c.to(157, 157.8, { h: 112, w: 4.2 }, Ease.out3);
  c.to(158.2, 158.5, { h: 50, w: 7 }, Ease.in2);
  c.to(158.5, 159.1, { h: W.caretH, w: W.caretW }, Ease.outBack);
  F.blinkMode(159.2, 'blink');
  F.cue(156, 'roll', { n: [34, 46, 57, 62], v: 0.18, d: 2, s: 0.12 });
  F.cue(158, 'roll', { n: [33, 45, 55, 64], v: 0.18, d: 2, s: 0.12 });

  // Enter — писатель проснулся
  F.cue(160, 'key', { kind: 'enter', v: 1 });
  F.blinkMode(160, 'solid');
  c.add(160, 160.7, (t, o, u) => { const s = Math.sin(Math.PI * u); o.y -= 30 * s; o.h *= 1 + 0.4 * s; o.lean -= 0.3 * s; });
  c.to(160.05, 160.3, { x: x0, y: caretY(3) }, Ease.out3);
  const txt = 'Курсор не в счёт.';
  const tt = [160.5, 160.9, 161.1, 161.3, 161.5, 161.75, 162.1, 162.4, 162.6, 162.9, 163.1, 163.35, 163.7, 163.9, 164.1, 164.3, 164.8];
  const kurs = typeLine(F, txt, STYLE.doc, x0, L3, tt, { tag: 'final' });
  // «Курсор» — это же про меня!
  c.add(161.8, 162.6, (t, o, u) => { const s = Math.sin(Math.PI * u); o.h *= 1 + 0.35 * s; o.lean -= 0.3 * s; });
  // «…не в счёт» — сникает. Это наложение, а не сегмент: набор строки в это время двигает курсор дальше
  const sag = (t) => (t < 165 ? Ease.io2(clamp((t - 162.4) / 2.6)) : t < 167.15 ? 1 : 1 - Ease.outBack(clamp((t - 167.15) / 0.75)));
  c.add(162.4, 167.9, (t, o) => { const s = sag(t); o.h += (46 - W.caretH) * s; o.bend += 0.3 * s; o.w += (6.6 - W.caretW) * s; });
  F.words.key(161.8, 9).key(162.7, 10).key(163.2, 11).key(164.5, 12);
  // музыка набора
  [[160.5, [41, 57, 60]], [161.5, [36, 55, 64]], [162.5, [38, 57, 65]], [163.5, [34, 53, 62]]].forEach(([b, n]) => F.cue(b, 'chord', { n, v: 0.2, d: 0.8 }));
  F.cue(161.9, 'note', { n: 84, v: 0.2, d: 0.3 });
  [[163.6, 72], [164.1, 71], [164.6, 70], [165.1, 69]].forEach(([b, n], i) => F.cue(b, 'note', { n, v: 0.22, d: i === 3 ? 1.4 : 0.5 }));
  F.blinkMode(165.2, 'slow');
  F.blinkMode(166.2, 'solid');          // замечает Точку — и больше не гаснет

  // Точка спрыгивает и толкает друга плечом
  const dot = F.point;
  const dS = dot.tr.stateAt(166);
  const cS = c.stateAt(166);
  const nx = cS.x + 22, ny = Glyph.cy(dot.m, L3);
  hop(dot, 166.3, 166.9, nx, ny, { h: 70 });
  dot.tr.to(166.9, 167.05, { x: nx - 12 }, Ease.in2);
  dot.tr.to(167.05, 167.25, { x: nx }, Ease.out2);
  hop(dot, 167.5, 168.15, dS.x, dS.y, { h: 80 });
  F.cue(166.9, 'note', { n: 77, v: 0.2, d: 0.2 });
  // крупный план: утешение должно быть видно; потом камера отъезжает к набору
  cam.cut(166.2, { x: x0 + 330, y: L3 - 90, z: 2.7, r: 0 });
  cam.move(168.3, { x: x0 + 338, y: L3 - 86, z: 2.8 }, Ease.io2);
  c.to(166.95, 167.15, { lean: -0.45 }, Ease.out2);
  c.to(167.15, 167.9, { lean: 0 }, Ease.outBack);
  F.blinkMode(167.9, 'fast');
  F.cue(167.9, 'tick', { v: 0.6 }); F.cue(168.9, 'tick', { v: 0.6 });
  F.cue(167.9, 'note', { n: 81, v: 0.2, d: 0.3 }); F.cue(168.4, 'note', { n: 84, v: 0.22, d: 1.2 });
  F.blinkMode(169.9, 'solid');

  // — и пишет дальше: куча букв возвращается в текст
  const cont = 'Он мигал в пустом документе с полуночи и, кажется, ждал от меня больше, чем я сам. Я написал про тёмную ночь — буквы подняли меня на смех. Написал про Слово — ответили: «было». Потом я, видимо, уснул.';
  const firstX = x0 + Metrics.line(txt + ' ', STYLE.doc).width;
  const lines = wrap(cont, STYLE.doc, firstX - x0, W.colR - W.colL);
  let t = 170.2;
  const pool = [...F.pool];
  pool.sort((a, b) => restOf(a).x - restOf(b).x);
  let pi = 0;
  let li = 3;
  const typed = [];
  lines.forEach((ln, k) => {
    const lx = k === 0 ? firstX : x0;
    const base = baseline(li);
    const P = Metrics.line(ln, STYLE.doc);
    P.chars.forEach((ch, i) => {
      const dt = t < 172 ? 0.11 : t < 175 ? 0.06 : 0.045;
      t += dt;
      if (ch.ch === ' ' || ch.ch === ' ') return;
      const g = F.glyph(ch.ch, STYLE.doc, { tag: 'cont' });
      const x = lx + ch.cx, y = Glyph.cy(g.m, base);
      if (pi < pool.length && hash(pi * 3 + i) < 0.85) {
        // буква из кучи прилетает на место набранной
        const h = pool[pi++];
        F.pool.delete(h);
        const r = restOf(h);
        const t0 = t - 1.5;
        h.tr.fn(t0, t, { x, y, r: 0, k: 0.6, a: 1 }, pathFn({ x: r.x + (hash(pi) - 0.5) * 300, y: r.y - 500 }, { x: x + (hash(pi + 1) - 0.5) * 200, y: y + 240 }, { ease: Ease.io2 }));
        h.tDie = t;
        appear(g, t, x, y, { dy: 8, k: 0.6 });
      } else appear(g, t, x, y, { dy: 18 });
      g.tr.to(t + 0.4, t + 3, { k: 0 }, Ease.io2);
      typed.push(g);
      Caret.push(F, t, lx + ch.x1 + 5, { d: 0.05, lean: 0.04 });
    });
    li++;
    // перенос: курсор спускается на следующую строку раньше, чем придёт её первая буква
    if (k < lines.length - 1) c.to(t + 0.005, t + 0.04, { x: x0, y: caretY(li) }, Ease.out3);
  });
  const tEndType = t;
  for (let b = 170.2; b < tEndType; b += 0.125) F.cue(b, 'key', { kind: 'key', v: 0.32, p: hash(b * 16) });
  F.words.key(172, 18).key(174, 31).key(176, 44).key(tEndType, 51);
  F.clock.key(172, '06:02').key(174, '06:31').key(176, '06:57');
  F.blinkMode(tEndType + 0.2, 'blink');
  cam.move(170, { x: x0 + 330, y: L3 - 20, z: 1.5 }, Ease.io2);
  cam.move(177, { x: 0, y: 40, z: 0.69 }, Ease.io3);
  cam.hold(180.5);
  // тема в мажоре на наборе
  const th = [[170, 69], [171, 72], [172, 77], [173, 76], [174, 74], [175, 72], [176, 70], [177, 72], [178, 69], [179, 67]];
  th.forEach(([b, n]) => F.cue(b, 'note', { n, v: 0.22, d: 1 }));
  [[170, [41, 48, 57]], [172, [40, 48, 55]], [174, [38, 45, 53]], [176, [34, 46, 53]], [178, [36, 43, 46]], [180, [34, 46, 50]], [182, [36, 43, 48]]].forEach(([b, n]) => F.cue(b, 'roll', { n, v: 0.2, d: 2, s: 0.1 }));

  // наезд на заголовок «черновик» → титр
  cam.move(183.6, { x: 0, y: W.pageT - 38, z: 6.5 }, Ease.in3);
  F.env.title.key(182.6, 0).key(184.0, 1, Ease.io2);
  F.titleT = 184;
  F.blinkMode(184, 'blink');
  F.cue(184, 'chord', { n: [29, 41, 48, 57, 64, 67], v: 0.3, d: 10 });
  F.cue(186, 'note', { n: 81, v: 0.14, d: 2 });
  F.cue(188, 'note', { n: 77, v: 0.12, d: 4 });
  ticks(F, 186, 196, 2, 0.3);
  F.typed = typed;
}

// перенос по словам: первая строка короче (продолжает начатую)
function wrap(text, style, firstOffset, width) {
  const words = text.split(' ');
  const lines = [];
  let cur = '', lim = width - firstOffset;
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (Metrics.line(test, style).width > lim && cur) { lines.push(cur); cur = w; lim = width; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}
