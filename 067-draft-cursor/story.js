/* 067 · Черновик — сценарий. Каждая сцена раскладывает движения актёров, камеру и звуковые
   реплики по долям такта. Порядок вызова сцен = хронология (куча букв копится по ходу фильма). */
'use strict';

// тиканье мигающего курсора в тишине
function ticks(F, b0, b1, per = 2, v = 0.5) {
  for (let b = b0; b < b1 - 1e-6; b += per) F.cue(b, 'tick', { v });
}
function jiggleWave(glyphs, t0, amp = 7, step = 0.05, dur = 0.3) {
  glyphs.forEach((g, i) => {
    if (!g) return;
    const a = t0 + i * step;
    g.tr.add(a, a + dur, (t, o, u) => { o.y -= amp * Math.sin(Math.PI * u); });
  });
}
function caretY(line) { return baseline(line) + W.caretDown; }

// ————————————————————————————————————————————————————————————————
// Сцена 1. Три часа ночи: экран просыпается, курсор ждёт
function scene1(F) {
  F.scene(0, 'Три часа ночи');
  const c = F.cursor, x0 = W.colL, yb = caretY(1);
  c.set(0, { x: x0, y: yb, h: W.caretH, w: W.caretW, lean: 0, bend: 0, a: 1, glow: 1 });
  F.blinkMode(0, 'blink');
  ticks(F, 0, 12, 2, 0.55);

  F.env.screen.key(3.4, 0, Ease.lin).key(7.2, 1, Ease.io2);
  F.clock.key(0, '03:00');
  F.cue(3.6, 'wake');

  const cam = F.cam;
  cam.cut(0, { x: x0 + 3, y: yb - 38, z: 8.6, r: 0.025 });
  cam.hold(3.6);
  cam.move(10.6, { x: 0, y: 38, z: 0.69, r: 0 }, Ease.io3);
  cam.hold(11.95);
  cam.cut(12, { x: x0 + 100, y: yb - 10, z: 3.2, r: 0 });   // заголовок «черновик» — целиком за кадром
  cam.move(23.45, { x: x0 + 95, y: yb - 40, z: 3.8 }, Ease.io2);

  // зевок
  F.blinkMode(12, 'solid');
  c.to(12, 12.85, { h: 118, w: 4.1, lean: -0.07 }, Ease.out3);
  Caret.wiggle(F, 12.85, 13.45, 0.035, 7);
  c.to(13.45, 13.72, { h: 46, w: 7, lean: 0 }, Ease.in2);
  c.to(13.72, 14.35, { h: W.caretH, w: W.caretW }, Ease.outBack);
  // смотрит налево, направо
  c.to(14.5, 14.82, { lean: -0.34 }, Ease.out3);
  c.to(15.12, 15.5, { lean: 0.34 }, Ease.io3);
  c.to(15.82, 16.05, { lean: 0 }, Ease.io2);
  // постукивает «ногой»
  for (let i = 0; i < 3; i++) Caret.hop(F, 16.1 + i * 0.5, 16.55 + i * 0.5, x0, yb, { arc: 12 });
  F.blinkMode(17.8, 'blink');
  ticks(F, 17.8, 23.8, 2, 0.45);
  // вздох
  c.to(19.9, 20.5, { h: 58, bend: 0.16 }, Ease.io2);
  c.to(20.9, 21.7, { h: W.caretH, bend: 0 }, Ease.io2);

  // музыка сцены
  F.cue(4, 'chord', { n: [38, 45], v: 0.34, d: 7 });
  F.cue(8, 'roll', { n: [50, 57, 64, 65], v: 0.28, d: 4, s: 0.12 });
  [[12, 69], [12.5, 67], [13, 65], [13.5, 64]].forEach(([b, n], i) => F.cue(b, 'note', { n, v: 0.3, d: i === 3 ? 1.6 : 0.6 }));
  F.cue(14.5, 'note', { n: 86, v: 0.16, d: 0.3 });
  F.cue(15.25, 'note', { n: 88, v: 0.16, d: 0.3 });
  [16.1, 16.6, 17.1].forEach((b) => { F.cue(b + 0.16, 'note', { n: 74, v: 0.2, d: 0.2 }); F.cue(b + 0.16, 'tick', { v: 0.4 }); });
  F.cue(18, 'chord', { n: [46, 53, 57, 62], v: 0.27, d: 2 });
  F.cue(20, 'chord', { n: [43, 53, 58, 62], v: 0.25, d: 2 });
  F.cue(22, 'chord', { n: [45, 52, 55, 62], v: 0.26, d: 1 });
  F.cue(23, 'chord', { n: [45, 52, 55, 61], v: 0.28, d: 0.9 });
}

// ————————————————————————————————————————————————————————————————
// Сцена 2. Попытки: «Была тёмная ночь» → «Банально.»; «В начале было Слово» → «было.»
function scene2(F) {
  F.scene(24, 'Попытки');
  const c = F.cursor, x0 = W.colL, L1 = baseline(1), L2 = baseline(2);
  const cam = F.cam;
  cam.cut(23.5, { x: x0 + 230, y: L1 + 12, z: 2.35, r: 0 });

  // — попытка первая
  F.blinkMode(24, 'solid');
  const t1 = [24, 24.5, 25, 25.5, 26, 28, 28.5, 29, 29.25, 29.5, 29.75, 30.25, 30.75, 31, 31.25, 31.5];
  // курсор ведём сами: треки пишутся строго по времени, а выходка Точки — посреди набора
  const a1 = typeLine(F, 'Была тёмная ночь', STYLE.doc, x0, L1, t1, { tag: 'a1', src: 'a1', noCaret: true });
  const caretAfter = (i) => x0 + a1.layout.chars[i].x1 + 5;
  for (let i = 0; i <= 4; i++) Caret.push(F, t1[i], caretAfter(i));
  // курсор вздрагивает от первой буквы
  c.add(24, 24.9, (t, o, u) => {
    const s = Math.sin(Math.PI * u) * (1 - u * 0.4);
    o.y -= 30 * s; o.h *= 1 + 0.4 * s; o.lean -= 0.4 * s;
  });
  F.words.key(25.6, 1).key(29.9, 2).key(31.6, 3);

  // Точка влезает раньше времени: «Была.» — курсор выталкивает её
  const dot = F.glyph('.', STYLE.point, { tag: 'point', z: 8 });
  F.point = dot;
  const L = a1.layout;
  const dotX = x0 + L.chars[3].x1 + dot.m.w / 2 + 1;
  appear(dot, 26.45, dotX, Glyph.cy(dot.m, L1), { dy: 140 });
  F.cue(26.55, 'drop', { v: 0.5 });
  c.to(26.7, 26.95, { lean: -0.38 }, Ease.out3);
  const cx1 = caretAfter(4);
  c.to(27.0, 27.14, { x: dotX + 8, lean: 0.25 }, Ease.in2);
  c.to(27.14, 27.55, { x: cx1, lean: 0 }, Ease.out3);
  flyPath(dot, 27.12, 27.95, dotX + 820, L1 - 760, { x: dotX + 200, y: L1 - 80 }, { x: dotX + 600, y: L1 - 600 }, { spin: 2.5, ease: Ease.out2 });
  F.cue(27.12, 'plink', { v: 0.6 });
  for (let i = 5; i < t1.length; i++) Caret.push(F, t1[i], caretAfter(i));

  // писатель гордо ждёт, буквы шепчутся
  F.blinkMode(31.8, 'blink');
  c.to(32, 32.4, { lean: -0.3 }, Ease.out3);
  c.to(32.9, 33.3, { lean: 0 }, Ease.io2);
  cam.move(33.5, { x: x0 + 250, y: L1 + 10, z: 2.0 }, Ease.io2);
  jiggleWave(a1, 33.3, 7, 0.045, 0.28);
  F.cue(33.3, 'murmur', { v: 0.5 });
  F.cue(32, 'chord', { n: [53, 57, 60, 65], v: 0.26, d: 1.8 });

  // буквы перестраиваются в «Банально»
  const LB = Metrics.line('Банально', STYLE.doc);
  const pick = [0, 3, 8, 9, 2, 15, 12, 13];
  const styles = [{ h: 120 }, { h: 46 }, { h: 80 }, { h: 40, spin: 1 }, { h: 30, ant: 0.1 }, { h: 55, spin: -1 }, { h: 70 }, { h: 36, spin: 1.5 }];
  const chrom = [69, 68, 67, 66, 65, 64, 63, 62];
  const verdict = [];
  pick.forEach((gi, i) => {
    const g = a1[gi];
    const t0 = 34 + i * 0.5, t1b = t0 + 1.2;
    hop(g, t0, t1b, x0 + LB.chars[i].cx, Glyph.cy(g.m, L2), styles[i]);
    F.cue(t1b - 0.26, 'note', { n: chrom[i], v: 0.3, d: 0.45 });
    F.cue(t0 + 0.1, 'hop', { v: 0.3 });
    verdict.push(g);
  });
  // оставшиеся переглядываются
  [1, 5, 6, 7, 10, 14].forEach((gi, i) => {
    const g = a1[gi];
    g.tr.add(35.5 + i * 0.3, 38.4 + i * 0.1, (t, o, u) => { o.r += Math.sin(u * Math.PI) * (i % 2 ? 0.18 : -0.18); });
  });
  c.to(34.2, 34.6, { lean: -0.2, h: 80 }, Ease.out3);
  c.to(37.6, 38.2, { lean: 0, h: W.caretH }, Ease.io2);

  // Точка возвращается и ставит приговор: «Банально.»
  const pX = x0 + LB.width + dot.m.w / 2 + 2, pY = Glyph.cy(dot.m, L2);
  dot.tr.set(38.45, { x: pX, y: pY - 760, r: 0, a: 1, sx: 0.8, sy: 1.4 });
  dot.tr.to(38.45, 39.0, { y: pY, sx: 1, sy: 1 }, Ease.in3);
  dot.tr.fn(39.0, 39.6, {}, (u, a, b, out) => { copyInto(out, b); const s = 0.55 * Math.exp(-u * 5) * Math.cos(u * 10); out.sy = 1 - s; out.sx = 1 + s * 0.8; out.y = b.y + dot.hh * (1 - out.sy); return out; });
  F.cue(39.0, 'thud', { v: 0.9 });
  F.cue(39.0, 'chord', { n: [26, 33], v: 0.5, d: 2 });
  cam.shake(39.0, 16, 4.5, 7);
  [...a1.filter(Boolean)].forEach((g) => {
    if (verdict.includes(g)) return;
    g.tr.add(39.02, 39.4, (t, o, u) => { o.y -= 12 * Math.sin(Math.PI * u); });
  });
  // смех
  verdict.forEach((g, i) => {
    g.tr.add(39.2 + i * 0.03, 40.3, (t, o, u) => { o.y -= 9 * Math.abs(Math.sin((u * 2 + i * 0.12) * Math.PI * 2)) * (1 - u); });
  });
  [[39.25, 76], [39.5, 77], [39.75, 76], [40, 77], [40.25, 76]].forEach(([b, n]) => F.cue(b, 'note', { n, v: 0.16, d: 0.18 }));
  c.to(39.2, 39.8, { h: 54, bend: 0.28, lean: 0.05 }, Ease.out2);

  // писатель стирает: курсор бежит назад по второй строке, потом по первой
  const Lcx = (i) => x0 + LB.chars[i].x0 - 2;
  Caret.hop(F, 40.1, 40.5, pX + 12, caretY(2), { arc: 40, h0: W.caretH });
  const delOrder = [dot, ...verdict.slice().reverse()];
  delOrder.forEach((g, i) => {
    const t = 40.6 + i * 0.25;
    fallToHeap(F, g, t, { vy: -(40 + hash(i + 7) * 120), vx: (hash(i + 70) - 0.5) * 240 });
    const nx = g === dot ? x0 + LB.width + 4 : Lcx(7 - (i - 1));
    Caret.push(F, t, nx, { lean: -0.12 });
    F.cue(t, 'key', { kind: 'back', v: 0.7 });
  });
  const rest1 = [14, 10, 7, 6, 5, 1];
  const endL1 = x0 + L.chars[14].x1 + 4;
  Caret.hop(F, 42.8, 43.15, endL1, caretY(1), { arc: 36 });
  rest1.forEach((gi, i) => {
    const t = 43.25 + i * 0.2;
    fallToHeap(F, a1[gi], t, { vy: -(50 + hash(gi) * 100), vx: (hash(gi + 5) - 0.5) * 200 });
    Caret.push(F, t, x0 + L.chars[gi].x0 - 2 + (i === rest1.length - 1 ? -L.chars[0].x1 + 2 : 0), { lean: -0.1 });
    F.cue(t, 'key', { kind: 'back', v: 0.7 });
  });
  c.to(44.5, 44.9, { x: x0, h: W.caretH, bend: 0, lean: 0 }, Ease.out3);
  F.words.key(41, 0);
  [[40.6, 74], [40.85, 72], [41.1, 70], [41.35, 69], [41.6, 67], [41.85, 65], [42.1, 64], [42.35, 62]].forEach(([b, n]) => F.cue(b, 'note', { n, v: 0.16, d: 0.3 }));
  cam.cut(41.6, { x: 0, y: 40, z: 0.69, r: 0 });
  cam.hold(45.4);
  F.blinkMode(44.9, 'blink');
  F.clock.key(45, '03:14');
  F.cue(45, 'tick', { v: 0.6 }); F.cue(45.5, 'tick', { v: 0.5 });

  // — попытка вторая: с пафосом
  cam.cut(45.5, { x: x0 + 330, y: L1 - 42, z: 1.72, r: -0.035 });
  cam.move(53.6, { z: 1.98, x: x0 + 340 }, Ease.io2);
  cam.move(54.3, { z: 2.3, y: L1 - 50 }, Ease.out3);
  cam.hold(57.4);
  F.blinkMode(45.8, 'solid');
  c.to(45.7, 46.0, { h: 86, w: 7, y: caretY(1) + 3 }, Ease.outBack);
  const t2 = [46, 47, 47.5, 48, 48.5, 49, 49.5, 50, 50.5, 51, 51.5, 52, 52.5, 53, 54, 54.5, 55, 55.5, 56];
  const a2 = typeLine(F, 'В начале было Слово', STYLE.grand, x0, L1, t2, { tag: 'a2', src: 'a2', dy: 64, kind: 'heavy', vol: 1 });
  t2.forEach((b, i) => { if (a2[i]) cam.shake(b + 0.12, i === 14 ? 10 : 3.5, 7, 8); });
  F.words.key(46.4, 1).key(50.4, 2).key(52.9, 3).key(56.3, 4);
  F.cue(46, 'chord', { n: [38, 50, 57, 62], v: 0.5, d: 1.5 });
  F.cue(47.5, 'chord', { n: [34, 46, 53, 62], v: 0.45, d: 3 });
  F.cue(51, 'chord', { n: [31, 43, 50, 58], v: 0.45, d: 3 });
  F.cue(54, 'chord', { n: [33, 45, 52, 61], v: 0.55, d: 2 });
  F.cue(56, 'chord', { n: [38, 45, 50, 53, 57], v: 0.5, d: 1.5 });
  c.to(56.5, 57.2, { h: 98 }, Ease.outBack);

  // «было» всплывает, Точка прилетает снизу: «было.»
  const byl = [9, 10, 11, 12].map((i) => a2[i]);
  byl.forEach((g, i) => {
    const s = g.tr.stateAt(57.4);
    g.tr.to(57.5 + i * 0.08, 58.5 + i * 0.08, { y: s.y - 70 }, Ease.out3);
  });
  a2.forEach((g, i) => { if (g && !byl.includes(g)) g.tr.add(57.6, 59.2, (t, o, u) => { o.r += -0.1 * Math.sin(Math.PI * u) * (i % 2 ? 1 : 0.6); }); });
  F.cue(57.5, 'note', { n: 76, v: 0.14, d: 0.5 }); F.cue(58, 'note', { n: 81, v: 0.12, d: 0.8 });
  const Lg = a2.layout;
  const p2x = x0 + Lg.chars[12].x1 + dot.m.w / 2 + 3;
  const p2y = Glyph.cy(dot.m, L1) - 70;
  // Точка лежит в куче: прыжок снизу через весь кадр
  F.pool.delete(dot);
  hop(dot, 58.1, 59.3, p2x, p2y, { h: 140, ant: 0.1, land: 0.22, sq: 0.55 });
  F.cue(59.1, 'thud', { v: 0.8 });
  cam.shake(59.1, 12, 5, 7);

  // сдулись
  const allA2 = a2.filter(Boolean).concat([dot]);
  allA2.forEach((g, i) => {
    const s = g.tr.stateAt(59.6);
    const base = byl.includes(g) || g === dot ? L1 : null;
    const yTo = base !== null ? Glyph.cy(g.m, L1) : s.y;
    g.tr.fn(59.6 + i * 0.02, 60.5 + i * 0.02, { sy: 0.34, sx: 1.22, y: yTo + g.hh * 0.66 }, (u, a, b, out) => mixInto(out, a, b, Ease.outBack(u)));
  });
  c.to(59.7, 60.4, { h: 42, w: 8, bend: 0.1 }, Ease.out2);
  F.cue(59.6, 'pff', { v: 0.6 });
  [[59.5, 65, 0.5], [60, 64, 0.5], [60.5, 63, 0.5], [61, 62, 1.6]].forEach(([b, n, d]) => F.cue(b, 'note', { n, v: 0.3, d }));

  // выделить строку и удалить
  allA2.slice().reverse().forEach((g, i) => { g.tr.to(61.0 + i * 0.03, 61.12 + i * 0.03, { sel: 1 }, Ease.lin); });
  F.cue(61.0, 'swipe', { v: 0.5 });
  F.cue(61.75, 'key', { kind: 'enter', v: 1 });
  allA2.forEach((g, i) => {
    const isB = byl.includes(g);
    fallToHeap(F, g, 61.8 + (isB ? 0.05 : hash(i * 3) * 0.12), {
      vy: isB ? -30 : -(20 + hash(i + 30) * 70), vx: isB ? 0 : (hash(i + 40) - 0.5) * 300,
      dx: g === dot ? -220 : isB ? -470 : 0, clink: i % 2 === 0, rest: isB ? Math.PI / 2 * (i % 2 ? 1 : -1) + 0.2 : undefined,
    });
  });
  c.to(61.8, 62.3, { x: x0, h: W.caretH, w: W.caretW, bend: 0, y: caretY(1) }, Ease.out3);
  F.words.key(61.8, 0);
  cam.cut(62.05, { x: 0, y: 40, z: 0.69, r: 0 });
  F.blinkMode(62.4, 'blink');
  F.clock.key(63.5, '03:26');
  F.cue(63.5, 'tick', { v: 0.6 }); F.cue(64, 'tick', { v: 0.5 });
  F.a1 = a1; F.a2 = a2; F.byl = byl;
}

// ————————————————————————————————————————————————————————————————
function buildFilm() {
  Metrics.init();
  const F = new Film();
  scene1(F);
  scene2(F);
  if (typeof scene3 === 'function') scene3(F);
  if (typeof scene4 === 'function') scene4(F);
  if (typeof scene5 === 'function') scene5(F);
  if (typeof scene6 === 'function') scene6(F);
  F.cues.sort((a, b) => a.b - b.b);
  F.cover = 82.1;   // обложка: спор в разгаре — «БАХ!», «А что, если?», «Туман и тишина…», «Конец.»
  return F;
}
