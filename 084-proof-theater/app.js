'use strict';
/* Театр доказательств: двенадцать доказательств без слов в цветах Оливера Бирна.
   Каждое доказательство — функция draw(p, portrait), где p — непрерывная позиция «явления»:
   p = 0 — первое явление; p = 2.4 — идёт переход от третьего явления к четвёртому, пройдено 40 %.
   portrait = true на узкой вертикальной сцене: широкие чертежи там складываются столбиком. */
(() => {
  const $ = (s) => document.querySelector(s);
  const cv = $('#fig');
  const g = cv.getContext('2d');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SHOT = !!window.__SHOT__;

  /* ---------- Цвета Бирна ---------- */
  const C = { R: '#c4362c', Y: '#e9ae2a', B: '#1f5aa0', K: '#1d1a17', P: '#f4ecd9' };
  const VW = 1000, VH = 680;              // логическая сцена

  /* ---------- Математика движения ---------- */
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const raw = (p, k) => clamp(p - (k - 1), 0, 1);          // сырой прогресс прихода к явлению k
  const seg = (p, k) => ease(raw(p, k));                    // сглаженный
  const part = (r, a, b) => ease(clamp((r - a) / (b - a), 0, 1)); // под-отрезок перехода
  const TAU = Math.PI * 2;

  /* ---------- Кисть Бирна: плоский цвет и тонкая чёрная линия ---------- */
  let scale = 1, alphaAll = 1, time = 0;
  const LW = (w) => Math.max(w, 1.1 / scale);
  // Замер: пока box не null, кисть ничего не рисует, а только расширяет рамку [x0, y0, x1, y1]
  let box = null;
  function note(x, y, pad = 0) {
    const m = g.getTransform();
    const X = m.a * x + m.c * y + m.e, Y = m.b * x + m.d * y + m.f;
    if (X - pad < box[0]) box[0] = X - pad;
    if (Y - pad < box[1]) box[1] = Y - pad;
    if (X + pad > box[2]) box[2] = X + pad;
    if (Y + pad > box[3]) box[3] = Y + pad;
  }
  function path(pts, close = true) {
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    if (close) g.closePath();
  }
  function shape(pts, fill, a = 1, lw = 1.6) {
    if (a <= 0.001) return;
    if (box) { for (const q of pts) note(q[0], q[1], lw / 2); return; }
    g.globalAlpha = a * alphaAll;
    path(pts);
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (lw) { g.lineWidth = LW(lw); g.strokeStyle = C.K; g.lineJoin = 'round'; g.stroke(); }
    g.globalAlpha = alphaAll;
  }
  function line(x1, y1, x2, y2, lw = 1.6, col = C.K, a = 1, dash) {
    if (a <= 0.001) return;
    if (box) { note(x1, y1, lw / 2); note(x2, y2, lw / 2); return; }
    g.globalAlpha = a * alphaAll;
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.lineWidth = LW(lw);
    g.strokeStyle = col;
    g.lineCap = 'round';
    if (dash) g.setLineDash(dash.map((d) => d));
    g.stroke();
    g.setLineDash([]);
    g.globalAlpha = alphaAll;
  }
  function sector(cx, cy, r, a0, a1, fill, a = 1, lw = 1.3) {
    if (a <= 0.001) return;
    if (box) {
      note(cx, cy);
      for (let k = 0; k <= 8; k++) { const t = a0 + ((a1 - a0) * k) / 8; note(cx + Math.cos(t) * r, cy + Math.sin(t) * r); }
      return;
    }
    g.globalAlpha = a * alphaAll;
    g.beginPath();
    g.moveTo(cx, cy);
    g.arc(cx, cy, r, a0, a1);
    g.closePath();
    g.fillStyle = fill;
    g.fill();
    if (lw) { g.lineWidth = LW(lw); g.strokeStyle = C.K; g.stroke(); }
    g.globalAlpha = alphaAll;
  }
  function label(txt, x, y, o = {}) {
    const a = o.a == null ? 1 : o.a;
    if (a <= 0.001) return;
    const size = Math.max(o.size || 26, 13 / scale);
    g.globalAlpha = a * alphaAll;
    g.font = `${o.italic === false ? '' : 'italic '}${o.w || 400} ${size}px "EB Garamond", Georgia, serif`;
    if (box) {
      const w = g.measureText(txt).width, al = o.align || 'center';
      const x0 = al === 'center' ? x - w / 2 : al === 'right' || al === 'end' ? x - w : x;
      note(x0, y - size * 0.6); note(x0 + w, y + size * 0.6);
      return;
    }
    g.textAlign = o.align || 'center';
    g.textBaseline = 'middle';
    g.fillStyle = o.col || C.K;
    g.fillText(txt, x, y);
    g.globalAlpha = alphaAll;
  }
  const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  const move = (pts, dx, dy) => pts.map(([x, y]) => [x + dx, y + dy]);
  function turn(pts, ang, cx, cy) {
    const c = Math.cos(ang), s = Math.sin(ang);
    return pts.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]);
  }
  const mixCol = (c1, c2, t) => {
    const h = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
    const a = h(c1), b = h(c2);
    return `rgb(${a.map((v, i) => Math.round(lerp(v, b[i], t))).join(',')})`;
  };
  const sw = (c) => `<span class="sw ${c}"></span>`;

  /* =========================================================
     Двенадцать доказательств
     ========================================================= */
  const PROOFS = [];

  /* I. Теорема Пифагора — перестановка треугольников */
  {
    const a = 150, b = 200, s = a + b, y0 = 160;
    const tris = [
      { pts: [[0, 0], [a, 0], [0, b]], to: [0, a], w: [0.28, 0.66] },
      { pts: [[s, 0], [s, a], [a, 0]], to: [0, 0], w: [0, 1] },
      { pts: [[s, s], [b, s], [s, a]], to: [-b, 0], w: [0.56, 1] },
      { pts: [[0, s], [0, b], [b, s]], to: [a, -b], w: [0, 0.4] },
    ];
    function square(ox, oy, m, alpha, cs, blueA) {
      g.save();
      g.translate(ox, oy);
      const A = alpha;
      shape(rect(0, 0, s, s), C.P, A, 0);
      shape([[a, 0], [s, a], [b, s], [0, b]], C.B, A * blueA, 1.6);
      shape(rect(0, 0, a, a), C.R, A * cs, 1.6);
      shape(rect(a, a, b, b), C.K, A * cs, 1.6);
      for (const t of tris) {
        const k = part(m, t.w[0], t.w[1]);
        shape(move(t.pts, t.to[0] * k, t.to[1] * k), C.Y, A, 1.6);
      }
      shape(rect(0, 0, s, s), null, A, 2.4);
      g.restore();
    }
    PROOFS.push({
      title: 'Теорема Пифагора', icon: 'pyth',
      steps: [
        'Четыре одинаковых прямоугольных треугольника в квадрате со стороной a + b. Между ними — синий квадрат на гипотенузе.',
        'Сделаем копию квадрата со всем, что в нём лежит.',
        'В копии сдвинем треугольники, ничего не поворачивая.',
        'Свободное место в копии — красный квадрат на одном катете и чёрный на другом.',
        'Рамки равны, треугольники те же. Значит, свободные площади равны.',
      ],
      formula: `<span class="glyphs">${sw('b')} = ${sw('r')} + ${sw('k')}</span><span class="sep"></span><span class="tex">c² = a² + b²</span>`,
      draw(p, portrait) {
        const t1 = seg(p, 1), r2 = raw(p, 2), t3 = seg(p, 3), t4 = seg(p, 4);
        // рядом на широкой сцене, столбиком на узкой; знак «=» в обоих случаях в точке (500, 335)
        if (portrait) {
          square(325, lerp(y0, -60, t1), 0, 1, 0, 1);
          if (t1 > 0) square(325, lerp(y0, 380, t1), r2, t1, t3, 1 - part(r2, 0, 0.35));
        } else {
          square(lerp(325, 95, t1), y0, 0, 1, 0, 1);
          if (t1 > 0) square(lerp(325, 555, t1), y0, r2, t1, t3, 1 - part(r2, 0, 0.35));
        }
        if (t4 > 0) {
          line(486, y0 + s / 2 - 10, 514, y0 + s / 2 - 10, 4, C.K, t4);
          line(486, y0 + s / 2 + 10, 514, y0 + s / 2 + 10, 4, C.K, t4);
        }
      },
    });
  }

  /* II. Сумма углов треугольника — Евклид, I.32 */
  {
    const A = [250, 520], B = [775, 520], Cc = [440, 190];
    const ang = (P, Q) => Math.atan2(Q[1] - P[1], Q[0] - P[0]);
    const aA0 = ang(A, Cc), aA1 = ang(A, B);           // угол при A: от AC до AB
    const aB0 = ang(B, A), aB1 = ang(B, Cc) + TAU;      // при B: от BA до BC
    const aC0 = ang(Cc, B), aC1 = ang(Cc, A);           // при C: от CB до CA
    const R = 66;
    PROOFS.push({
      title: 'Сумма углов треугольника', icon: 'tri',
      steps: [
        'Треугольник. Отметим его углы тремя цветами.',
        'Проведём через верхнюю вершину прямую, параллельную основанию.',
        'Накрест лежащие углы при параллельных равны: красный угол переезжает наверх.',
        'Так же и синий.',
        'Три угла легли рядом и образовали прямую — развёрнутый угол.',
      ],
      formula: `<span class="glyphs">${sw('r')} + ${sw('y')} + ${sw('b')} = 180°</span><span class="sep"></span><span class="tex">α + β + γ = π</span>`,
      draw(p) {
        const t1 = seg(p, 1), t2 = seg(p, 2), t3 = seg(p, 3), t4 = seg(p, 4);
        shape([A, B, Cc], C.P, 1, 0);
        sector(A[0], A[1], R, aA0, aA1, C.R);
        sector(B[0], B[1], R, aB0, aB1, C.B);
        sector(Cc[0], Cc[1], R, aC0, aC1, C.Y);
        shape([A, B, Cc], null, 1, 2.2);
        if (t1 > 0) {
          const L = 380 * t1;
          line(Cc[0] - L, Cc[1], Cc[0] + L, Cc[1], 2, C.K, 1);
          line(A[0] - 120, A[1], B[0] + 120, B[1], 1.4, C.K, t1 * 0.6);
        }
        if (t2 > 0) {
          const x = lerp(A[0], Cc[0], t2), y = lerp(A[1], Cc[1], t2), r = Math.PI * t2;
          sector(x, y, R, aA0 + r, aA1 + r, C.R);
        }
        if (t3 > 0) {
          const x = lerp(B[0], Cc[0], t3), y = lerp(B[1], Cc[1], t3), r = Math.PI * t3;
          sector(x, y, R, aB0 + r, aB1 + r, C.B);
        }
        if (t4 > 0) {
          g.globalAlpha = t4 * alphaAll;
          g.beginPath();
          g.arc(Cc[0], Cc[1], R + 22, 0, Math.PI * t4);
          g.lineWidth = LW(2.2);
          g.strokeStyle = C.K;
          g.stroke();
          g.globalAlpha = alphaAll;
          label('180°', Cc[0], Cc[1] + R + 58, { a: t4, size: 34, italic: false });
        }
      },
    });
  }

  /* III. Параллелограммы на одном основании — Евклид, I.35 */
  {
    const yb = 500, yt = 245, h = yb - yt;
    const A = [240, yb], B = [540, yb], u1 = 90, u2 = 300;
    const D1 = [A[0] + u1, yt], C1 = [B[0] + u1, yt], D2 = [A[0] + u2, yt], C2 = [B[0] + u2, yt];
    PROOFS.push({
      title: 'Параллелограммы на одном основании', short: 'Равные параллелограммы', icon: 'par',
      steps: [
        'Параллелограмм на красном основании между двумя параллельными прямыми.',
        'Отрежем от него жёлтый треугольник.',
        'Перенесём треугольник вправо, не поворачивая.',
        'Получился другой параллелограмм — на том же основании и той же площади.',
        'Наклон не важен: площадь равна основанию, умноженному на высоту.',
      ],
      formula: `<span class="glyphs">${sw('b')} = <span style="display:inline-block;width:1.2em;height:4px;background:var(--red);vertical-align:middle"></span> × <span style="display:inline-block;width:4px;height:0.9em;background:var(--yellow);vertical-align:middle"></span></span><span class="sep"></span><span class="tex">S = a · h</span>`,
      draw(p) {
        const t1 = seg(p, 1), t2 = seg(p, 2), t3 = seg(p, 3), t4 = seg(p, 4);
        line(90, yt, 910, yt, 1.4);
        line(90, yb, 910, yb, 1.4);
        // цвет треугольника меняется быстро, в начале шага: долгое смешение синего с жёлтым даёт грязь
        const c1 = part(raw(p, 1), 0, 0.3), c3 = part(raw(p, 3), 0.55, 0.85);
        if (t1 <= 0) shape([A, B, C1, D1], C.B, 1, 1.6);          // до разреза — цельная фигура
        else if (t4 <= 0) {
          shape([A, B, C1, D2], C.B, 1, 1.6);
          shape([A, D1, D2], mixCol(C.B, C.Y, c1 * (1 - c3)), 1, 1.6);
          if (t1 > 0 && t2 > 0) {
            shape([A, D1, D2], C.P, 1, 0);
            shape(move([A, D1, D2], 300 * t2, 0), mixCol(C.Y, C.B, c3), 1, 1.6);
            shape([A, B, C1, D2], C.B, 1, 1.6);
            shape([A, D1, D2], null, 0.5 * (1 - t2), 1.2);
          }
          if (t1 > 0) line(A[0], A[1], D2[0], D2[1], 1.8, C.K, t1, [8, 7]);
          if (t3 > 0) shape([A, B, C2, D2], null, t3, 2.4);
        } else {
          const u = lerp(u2, 115 + 215 * Math.sin(time * 1.1), t4);   // u ∈ [−100, 330]: верх в пределах 140…870
          const Pp = [A, B, [B[0] + u, yt], [A[0] + u, yt]];
          shape(Pp, C.B, 1, 2.2);
          const hx = A[0] + u + 40;
          line(hx, yt, hx, yb, 3, C.Y, t4);
          line(hx - 8, yt, hx + 8, yt, 2, C.K, t4);
          line(hx - 8, yb, hx + 8, yb, 2, C.K, t4);
          label('h', hx + 22, (yt + yb) / 2, { a: t4, size: 30 });
        }
        line(A[0], A[1], B[0], B[1], 5, C.R, 1);
        label('a', (A[0] + B[0]) / 2, yb + 30, { size: 30, col: C.R });
      },
    });
  }

  /* IV. Сумма внешних углов многоугольника */
  {
    const V = [[365, 225], [655, 195], [720, 470], [335, 525]];
    const G = V.reduce((s, v) => [s[0] + v[0] / 4, s[1] + v[1] / 4], [0, 0]);
    const cols = [C.R, C.Y, C.B, C.K];
    const dir = (P, Q) => Math.atan2(Q[1] - P[1], Q[0] - P[0]);
    PROOFS.push({
      title: 'Внешние углы многоугольника', short: 'Внешние углы', icon: 'ext',
      steps: [
        'Четырёхугольник. Продлим каждую сторону — у вершин появятся внешние углы.',
        'Сожмём фигуру к точке, не меняя направлений сторон.',
        'Внешние углы сошлись вокруг одной точки и сложились в полный оборот.',
        'Так будет для любого выпуклого многоугольника: сумма внешних углов — 360°.',
      ],
      formula: `<span class="glyphs">${sw('r')} + ${sw('y')} + ${sw('b')} + ${sw('k')} = 360°</span>`,
      draw(p) {
        const t1 = seg(p, 1), t2 = seg(p, 2), t3 = seg(p, 3);
        const k = 1 - 0.995 * t1;
        const W = V.map(([x, y]) => [G[0] + (x - G[0]) * k, G[1] + (y - G[1]) * k]);
        const R = 70;
        for (let i = 0; i < 4; i++) {
          const P0 = V[(i + 3) % 4], P1 = V[i], P2 = V[(i + 1) % 4];
          const din = dir(P0, P1), dout = dir(P1, P2);
          const Wi = W[i];
          const ext = 150 * (1 - t1 * 0.6);
          line(Wi[0], Wi[1], Wi[0] + Math.cos(din) * ext, Wi[1] + Math.sin(din) * ext, 1.3, C.K, 0.8 * (1 - t1 * 0.7), [6, 6]);
          let a1 = dout;
          while (a1 < din) a1 += TAU;
          sector(Wi[0], Wi[1], R, din, a1, cols[i]);
        }
        shape(W, C.P, 1 - t1 * 0.2, 2.2);
        if (t2 > 0) {
          g.globalAlpha = t2 * alphaAll;
          g.beginPath();
          g.arc(G[0], G[1], R + 16, -Math.PI / 2, -Math.PI / 2 + TAU * t2);
          g.lineWidth = LW(2.2);
          g.strokeStyle = C.K;
          g.stroke();
          g.globalAlpha = alphaAll;
        }
        label('360°', G[0], G[1] + R + 58, { a: t3, size: 34, italic: false });
      },
    });
  }

  /* V. Площадь круга */
  {
    const r = 150, cx = 500, cy = 320;
    function strip(n, t, alpha, stagger = true) {
      const d = Math.PI / (2 * n);
      const L = 2 * r * Math.sin(d);
      const width = n * L + L / 2;
      const x0 = cx - width / 2, top = cy - r / 2 - 14, bot = top + r;
      for (let i = 0; i < 2 * n; i++) {
        const upper = i < n;
        const theta = Math.PI + i * 2 * d;
        const phi0 = theta + d;
        let j, ax, ay, phi1;
        if (upper) { j = i; ax = x0 + L / 2 + j * L; ay = bot; phi1 = -Math.PI / 2; }
        else { j = n - 1 - (i - n); ax = x0 + L + j * L; ay = top; phi1 = Math.PI / 2; }
        const delay = stagger ? (i / (2 * n)) * 0.45 : 0;
        const k = ease(clamp((t - delay) / 0.55, 0, 1));
        let dp = phi1 - phi0;
        while (dp > Math.PI) dp -= TAU;
        while (dp < -Math.PI) dp += TAU;
        const phi = phi0 + dp * k;
        const px = lerp(cx, ax, k), py = lerp(cy, ay, k);
        sector(px, py, r, phi - d, phi + d, upper ? C.R : C.B, alpha, n > 12 ? 0 : 1.2);
      }
      return { x0, top, bot, width };
    }
    PROOFS.push({
      title: 'Площадь круга', icon: 'circ',
      steps: [
        'Круг радиуса r. Разрежем его на шестнадцать секторов: верх — красный, низ — синий.',
        'Развернём обе половины и вставим секторы друг в друга.',
        'Почти параллелограмм: высота — радиус r, основание — половина окружности, πr.',
        'Чем мельче секторы, тем ровнее фигура — в пределе прямоугольник.',
        'Площадь круга — это площадь прямоугольника: πr · r.',
      ],
      formula: `<span class="glyphs">${sw('r')}${sw('b')} = πr · r</span><span class="sep"></span><span class="tex">S = πr²</span>`,
      draw(p) {
        const t1 = raw(p, 1), t2 = seg(p, 2), t3 = seg(p, 3), t4 = seg(p, 4);
        let geo;
        if (t3 < 1) geo = strip(8, t1, 1 - t3);
        if (t3 > 0) {
          geo = strip(40, 1, t3, false);
          const L = 2 * r * Math.sin(Math.PI / 80);
          const pts = [];
          for (let j = 0; j <= 40; j++) pts.push([geo.x0 + j * L, geo.top]);
          shape([[geo.x0, geo.top], [geo.x0 + geo.width, geo.top], [geo.x0 + geo.width, geo.bot], [geo.x0, geo.bot]], null, t3 * 0.9, 1.6);
        }
        if (t2 > 0 && geo) {
          const lx = geo.x0 - 26;
          line(lx, geo.top, lx, geo.bot, 4, C.Y, t2);
          label('r', lx - 22, (geo.top + geo.bot) / 2, { a: t2, size: 30 });
          const by = geo.bot + 30;
          line(geo.x0, by, geo.x0 + geo.width, by, 2, C.K, t2);
          line(geo.x0, by - 8, geo.x0, by + 8, 2, C.K, t2);
          line(geo.x0 + geo.width, by - 8, geo.x0 + geo.width, by + 8, 2, C.K, t2);
          label('πr', geo.x0 + geo.width / 2, by + 26, { a: t2, size: 30 });
        }
        if (t4 > 0 && geo) shape(rect(geo.x0 + (geo.width - Math.PI * r) / 2, geo.top, Math.PI * r, r), null, t4, 2.6);
      },
    });
  }

  /* VI. Сумма нечётных чисел */
  {
    const n = 6, u = 50, x0 = 500 - (n * u) / 2, y0 = 118;
    const cols = [C.R, C.Y, C.B, C.K];
    PROOFS.push({
      title: 'Сумма нечётных чисел', icon: 'odd',
      steps: [
        '1 = 1²',
        '1 + 3 = 4 = 2². Уголок из трёх клеток достраивает квадрат.',
        '1 + 3 + 5 = 9 = 3²',
        '1 + 3 + 5 + 7 = 16 = 4²',
        '1 + 3 + 5 + 7 + 9 = 25 = 5²',
        '1 + 3 + 5 + 7 + 9 + 11 = 36 = 6²',
        'Каждый следующий уголок на две клетки длиннее — и снова получается квадрат.',
      ],
      formula: `<span class="tex">1 + 3 + 5 + … + (2n − 1) = n²</span>`,
      draw(p) {
        for (let k = 1; k <= n; k++) {
          const r = k === 1 ? 1 : raw(p, k - 1);
          if (r <= 0) continue;
          const col = cols[(k - 1) % 4];
          const cells = [];
          for (let i = 0; i < k; i++) cells.push([i, k - 1]);
          for (let j = k - 2; j >= 0; j--) cells.push([k - 1, j]);
          cells.forEach(([i, j], q) => {
            const d = (q / cells.length) * 0.5;
            const e = ease(clamp((r - d) / 0.5, 0, 1));
            const tx = x0 + i * u, ty = y0 + j * u;
            const fx = tx + 260, fy = ty - 40;
            shape(rect(lerp(fx, tx, e), lerp(fy, ty, e), u, u), col, e, 1.5);
          });
          const e = ease(clamp((r - 0.5) / 0.5, 0, 1));
          label(String(2 * k - 1), x0 + (k - 1) * u + u / 2, y0 + (k - 1) * u + u / 2 + 1, { a: e, size: 26, italic: false, col: k % 4 === 2 ? C.K : C.P, w: 500 });
        }
        const t = seg(p, 6);
        shape(rect(x0, y0, n * u, n * u), null, t, 3);
      },
    });
  }

  /* VII. Треугольные числа */
  {
    const n = 6, u = 46;
    const cells = [];
    for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) cells.push([i, j]);
    PROOFS.push({
      title: 'Сумма первых n чисел', icon: 'stair',
      steps: [
        '1 + 2 + 3 + 4 + 5 + 6 — лесенка из квадратиков.',
        'Сделаем её копию и повернём на пол-оборота.',
        'Лесенки сложились в прямоугольник 6 × 7.',
        'Одна лесенка — ровно половина прямоугольника.',
      ],
      formula: `<span class="tex">1 + 2 + … + n = n (n + 1) / 2</span>`,
      draw(p) {
        const t1 = seg(p, 1), t2 = seg(p, 2), t3 = seg(p, 3);
        const W = n * u, Hh = (n + 1) * u;
        const bx = lerp(500 - W / 2, 500 - W - 30, t1 * (1 - t2)), by = 110 + Hh;
        for (const [i, j] of cells) shape(rect(bx + i * u, by - (j + 1) * u, u, u), C.R, 1, 1.4);
        if (t1 > 0) {
          // копия: сначала справа, потом поворот на 180° и сдвиг наверх
          const cx0 = 500 + 30 + W / 2, cy0 = by - Hh / 2;
          const cxF = bx + W / 2, cyF = by - Hh / 2;
          const cxn = lerp(cx0, cxF, t2), cyn = lerp(cy0, cyF, t2);
          const ang = Math.PI * part(raw(p, 1), 0.35, 1);
          for (const [i, j] of cells) {
            const px = i * u - W / 2, py = Hh / 2 - (j + 1) * u;
            const pts = turn(rect(px, py, u, u), ang, 0, 0).map(([x, y]) => [x + cxn, y + cyn]);
            shape(pts, C.B, t1, 1.4);
          }
        }
        if (t3 > 0) {
          shape(rect(bx, by - Hh, W, Hh), null, t3, 3);
          label('n', bx + W / 2, by + 26, { a: t3, size: 30 });
          label('n + 1', bx - 44, by - Hh / 2, { a: t3, size: 30 });
        }
      },
    });
  }

  /* VIII. Сумма кубов — Никомах */
  {
    const n = 4, u = 33, T = (k) => (k * (k + 1)) / 2;
    const x0 = 500 - (T(n) * u) / 2, y0 = 112;
    const cols = [C.R, C.Y, C.B, C.K];
    function pieces(k) {
      const S = T(k - 1), out = [{ x: S, y: S, w: k, h: k }];
      const full = k % 2 ? (k - 1) / 2 : (k - 2) / 2;
      for (let j = 1; j <= full; j++) {
        out.push({ x: S, y: S - k * j, w: k, h: k });
        out.push({ x: S - k * j, y: S, w: k, h: k });
      }
      if (k % 2 === 0) {
        out.push({ x: S, y: 0, w: k, h: k / 2, half: true });
        out.push({ x: 0, y: S, w: k / 2, h: k, half: true });
      }
      return out;
    }
    PROOFS.push({
      title: 'Сумма кубов', icon: 'cubes',
      steps: [
        '1³ — один квадратик.',
        '2³: два квадрата 2 × 2. Второй разрезан пополам и лёг по краям уголка.',
        '3³: три квадрата 3 × 3.',
        '4³: четыре квадрата 4 × 4 — снова две половинки.',
        'Сторона большого квадрата — 1 + 2 + 3 + 4. Кубы складываются в квадрат суммы.',
      ],
      formula: `<span class="tex">1³ + 2³ + … + n³ = (1 + 2 + … + n)²</span>`,
      draw(p) {
        for (let k = 1; k <= n; k++) {
          const r = k === 1 ? 1 : raw(p, k - 1);
          if (r <= 0) continue;
          const col = cols[(k - 1) % 4];
          const ps = pieces(k);
          ps.forEach((q, idx) => {
            const d = (idx / ps.length) * 0.45;
            const e = ease(clamp((r - d) / 0.55, 0, 1));
            const X = x0 + q.x * u, Y = y0 + q.y * u;
            const ox = lerp(X + 240, X, e), oy = lerp(Y - 60, Y, e);
            shape(rect(ox, oy, q.w * u, q.h * u), col, e, 1.5);
            // сетка единичных клеток внутри
            g.globalAlpha = e * 0.35 * alphaAll;
            g.strokeStyle = k === 2 ? C.K : C.P;
            g.lineWidth = LW(0.8);
            g.beginPath();
            for (let a = 1; a < q.w; a++) { g.moveTo(ox + a * u, oy); g.lineTo(ox + a * u, oy + q.h * u); }
            for (let b = 1; b < q.h; b++) { g.moveTo(ox, oy + b * u); g.lineTo(ox + q.w * u, oy + b * u); }
            g.stroke();
            g.globalAlpha = alphaAll;
            if (q.half) label('½', ox + (q.w * u) / 2, oy + (q.h * u) / 2, { a: e, size: 24, col: k === 2 ? C.K : C.P, italic: false, w: 500 });
          });
        }
        const t = seg(p, 4);
        if (t > 0) {
          shape(rect(x0, y0, T(n) * u, T(n) * u), null, t, 3);
          let acc = 0;
          for (let k = 1; k <= n; k++) {
            const xa = x0 + acc * u, xb = x0 + (acc + k) * u, yy = y0 + T(n) * u + 22;
            line(xa + 2, yy, xb - 2, yy, 5, cols[k - 1], t);
            label(String(k), (xa + xb) / 2, yy + 24, { a: t, size: 24, italic: false });
            acc += k;
          }
        }
      },
    });
  }

  /* IX. Ряд 1/2 + 1/4 + 1/8 + … = 1 */
  {
    const S = 400, x0 = 300, y0 = 115;
    const cols = [C.R, C.Y, C.B, C.K];
    const names = ['½', '¼', '⅛', '1/16', '1/32', '1/64'];
    const pieces = [];
    {
      let x = x0, y = y0, w = S, h = S;
      for (let k = 0; k < 16; k++) {
        if (k % 2 === 0) { pieces.push([x, y, w / 2, h]); x += w / 2; w /= 2; }
        else { pieces.push([x, y, w, h / 2]); y += h / 2; h /= 2; }
      }
    }
    PROOFS.push({
      title: 'Половина, четверть, восьмая…', short: 'Половина, четверть…', icon: 'half',
      steps: [
        'Квадрат площадью 1.',
        'Закрасим половину.',
        'Потом половину остатка — четверть.',
        'Потом восьмую…',
        '…и так без конца: каждый раз половину того, что осталось.',
        'Кусочки заполняют весь квадрат, и ничего не выходит за край.',
      ],
      formula: `<span class="tex">½ + ¼ + ⅛ + 1/16 + … = 1</span>`,
      draw(p) {
        shape(rect(x0, y0, S, S), C.P, 1, 0);
        for (let k = 0; k < pieces.length; k++) {
          let r;
          if (k < 3) r = seg(p, k + 1);
          else r = part(raw(p, 4), (k - 3) * 0.06, (k - 3) * 0.06 + 0.3);
          if (r <= 0) continue;
          const [x, y, w, h] = pieces[k];
          shape(rect(x, y, w, h), cols[k % 4], r, k < 8 ? 1.4 : 0.6);
          if (k < 5) label(names[k], x + w / 2, y + h / 2, { a: r, size: k < 3 ? 40 : 24, italic: false, w: 500, col: k % 4 === 1 ? C.K : C.P });
        }
        shape(rect(x0, y0, S, S), null, 1, 3);
        label('1', x0 - 34, y0 + S / 2, { a: 1 - seg(p, 1), size: 40, italic: false });
        const t5 = seg(p, 5);
        label('= 1', x0 + S + 70, y0 + S / 2, { a: t5, size: 44, italic: false });
      },
    });
  }

  /* X. Ряд 1/4 + 1/16 + … = 1/3 */
  {
    const S = 400, x0 = 300, y0 = 115;
    const lev = [];
    {
      let x = x0, y = y0, s = S;
      for (let k = 0; k < 9; k++) {
        const h = s / 2;
        lev.push([[x, y + h, h, C.R], [x, y, h, C.Y], [x + h, y + h, h, C.B]]);
        x += h; s = h;
      }
    }
    PROOFS.push({
      title: 'Четверть, шестнадцатая…', icon: 'quart',
      steps: [
        'Разделим квадрат на четыре части и раскрасим три из них в три цвета.',
        'С оставшейся четвертью сделаем то же самое.',
        '…и так без конца.',
        'Все три цвета занимают поровну и вместе заполняют весь квадрат. Значит, каждому достаётся треть.',
      ],
      formula: `<span class="glyphs">${sw('r')} = ${sw('y')} = ${sw('b')} = ⅓</span><span class="sep"></span><span class="tex">¼ + 1/16 + 1/64 + … = ⅓</span>`,
      draw(p) {
        shape(rect(x0, y0, S, S), C.P, 1, 0);
        const t4 = seg(p, 3);
        const pulse = t4 > 0 ? 0.5 + 0.5 * Math.sin(time * 2.4) : 1;
        lev.forEach((L, k) => {
          let r;
          if (k === 0) r = 1;
          else if (k === 1) r = seg(p, 1);
          else r = part(raw(p, 2), (k - 2) * 0.1, (k - 2) * 0.1 + 0.35);
          if (r <= 0) return;
          L.forEach(([x, y, s, col]) => {
            const dim = col === C.R ? 1 : lerp(1, 0.25 + 0.2 * pulse, t4);
            shape(rect(x, y, s, s), col, r * dim, k < 6 ? 1.4 : 0.6);
          });
          if (k < 2) {
            const [x, y, s] = L[0];
            label(k === 0 ? '¼' : '1/16', x + s / 2, y + s / 2, { a: r, size: k === 0 ? 40 : 24, italic: false, w: 500, col: C.P });
          }
        });
        shape(rect(x0, y0, S, S), null, 1, 3);
        label('= ⅓', x0 + S + 72, y0 + S / 2, { a: t4, size: 44, italic: false, col: C.R });
      },
    });
  }

  /* XI. Среднее арифметическое и среднее геометрическое */
  {
    const A0 = 240, B0 = 110, ox = 325, oy = 150;
    function layout(a, b) {
      return [
        { x: 0, y: 0, w: a, h: b },
        { x: a, y: 0, w: b, h: a },
        { x: b, y: a, w: a, h: b },
        { x: 0, y: b, w: b, h: a },
      ];
    }
    PROOFS.push({
      title: 'Средние: арифметическое и геометрическое', short: 'Неравенство о средних', icon: 'amgm',
      steps: [
        'Прямоугольник со сторонами a и b, площадь ab.',
        'Возьмём четыре таких и сложим «вертушкой» в квадрат со стороной a + b.',
        'В середине осталась дырка — квадрат со стороной a − b.',
        'Поэтому площадь большого квадрата не меньше четырёх прямоугольников: (a + b)² ≥ 4ab.',
        'Дырка исчезает, только когда a = b. Это и есть равенство.',
      ],
      formula: `<span class="tex">(a + b)² ≥ 4ab  ⟺  (a + b) / 2 ≥ √(ab)</span>`,
      draw(p) {
        const t1 = raw(p, 1), t2 = seg(p, 2), t3 = seg(p, 3), t4 = seg(p, 4);
        const m = (A0 + B0) / 2;
        const breath = t4 > 0 ? (0.5 - 0.5 * Math.cos(time * 1.2)) : 0;
        const q = t4 * (0.35 + 0.65 * breath);
        const a = lerp(A0, m, q), b = lerp(B0, m, q);
        const L = layout(a, b);
        const start = { x: (a + b - a) / 2 - 150, y: (a + b) / 2 - b / 2, w: a, h: b };
        if (t2 > 0 || t4 > 0) shape(rect(ox + b, oy + b, a - b, a - b), C.K, Math.max(t2, t4 > 0 ? 1 : 0), 1.6);
        L.forEach((R, i) => {
          const e = i === 0 ? ease(clamp(t1 / 0.4, 0, 1)) : part(t1, 0.12 + i * 0.16, 0.5 + i * 0.16);
          const rot = i % 2 ? Math.PI / 2 * e : 0;
          // стартовая позиция: все в стопке в центре, потом разлетаются по местам
          const sx = start.x + 150, sy = start.y;
          const cxs = sx + start.w / 2, cys = sy + start.h / 2;
          const cxe = R.x + R.w / 2, cye = R.y + R.h / 2;
          const cx = lerp(cxs, cxe, e), cy = lerp(cys, cye, e);
          const w0 = i % 2 ? R.h : R.w, h0 = i % 2 ? R.w : R.h;
          let pts = rect(cx - w0 / 2, cy - h0 / 2, w0, h0);
          pts = turn(pts, rot, cx, cy);
          const vis = i === 0 ? 1 : clamp(t1 * 3 - i * 0.3, 0, 1);
          shape(move(pts, ox, oy), C.Y, vis, 1.6);
          if (i === 0 && t1 < 0.5) {
            const k = 1 - clamp(t1 / 0.3, 0, 1);
            const x1 = ox + cx - w0 / 2, y1 = oy + cy - h0 / 2;
            line(x1, y1, x1 + w0, y1, 5, C.R, k);
            line(x1, y1, x1, y1 + h0, 5, C.B, k);
            label('a', x1 + w0 / 2, y1 - 24, { a: k, size: 30, col: C.R });
            label('b', x1 - 22, y1 + h0 / 2, { a: k, size: 30, col: C.B });
          }
        });
        if (t3 > 0) {
          const S = a + b;
          shape(rect(ox, oy, S, S), null, t3, 3);
          label('a + b', ox + S / 2, oy + S + 30, { a: t3, size: 28 });
          label('a − b', ox + b + (a - b) / 2, oy + b + (a - b) / 2, { a: t3 * clamp((a - b) / 60, 0, 1), size: 22, col: C.P });
        }
      },
    });
  }

  /* XII. √2 иррационален — доказательство Тенненбаума */
  {
    const b = 190, a = 269;                    // a ≈ b√2
    const BX = 365, BY = 150;
    PROOFS.push({
      title: 'Корень из двух иррационален', short: 'Иррациональность √2', icon: 'sqrt',
      steps: [
        'Допустим, √2 = a/b — несократимая дробь. Тогда синий квадрат со стороной a равен двум красным со стороной b.',
        'Положим красные квадраты в синий, в противоположные углы.',
        'Середина накрыта дважды, два угла — ни разу. Раз площади равны, чёрный квадрат равен двум жёлтым.',
        'То же равенство, но с меньшими целыми сторонами. Спуск можно повторять бесконечно — а целые числа не могут убывать вечно.',
        'Противоречие. Значит, √2 нельзя записать дробью.',
      ],
      formula: `<span class="glyphs">${sw('b')} = ${sw('r')} + ${sw('r')}  ⇒  ${sw('k')} = ${sw('y')} + ${sw('y')}</span><span class="sep"></span><span class="tex">√2 ∉ ℚ</span>`,
      draw(p, portrait) {
        const t1 = seg(p, 1), t2 = seg(p, 2), t3 = seg(p, 3), t4 = seg(p, 4);
        const o = a - b, s2 = 2 * b - a, eqW = s2 + 56 + o + 48 + o;
        // L — раскладка: где синий квадрат до и после, где красные, где меньшее равенство и итог
        const slide = t3 * 190;
        const L = portrait
          ? { b0: [365, 0], b1: [365, 0], eq: [500, 305], plus: [500, 435], r1: [280, 340], r2: [530, 340], ex: 500 - eqW / 2, ey: 330, lab: [500, 520] }
          : { b0: [95, 205], b1: [BX - slide, BY], eq: [430, 340], plus: [710, 340], r1: [495, 245], r2: [735, 245], ex: BX - slide + a + 70, ey: BY + 40, lab: [500, 590] };
        const bx = lerp(L.b0[0], L.b1[0], t1), by = lerp(L.b0[1], L.b1[1], t1);
        shape(rect(bx, by, a, a), C.B, 1, 1.6);
        const r1 = [lerp(L.r1[0], bx, t1), lerp(L.r1[1], by, t1)];
        const r2 = [lerp(L.r2[0], bx + a - b, t1), lerp(L.r2[1], by + a - b, t1)];
        label('=', L.eq[0], L.eq[1], { a: 1 - t1, size: 48, italic: false });
        label('+', L.plus[0], L.plus[1], { a: 1 - t1, size: 48, italic: false });
        // плоский цвет, как у Бирна: сначала обе заливки, потом оба контура — видно, где квадраты перекрываются
        shape(rect(r1[0], r1[1], b, b), C.R, 1, 0);
        shape(rect(r2[0], r2[1], b, b), C.R, 1, 0);
        shape(rect(r1[0], r1[1], b, b), null, 1, 1.6);
        shape(rect(r2[0], r2[1], b, b), null, 1, 1.6);
        if (t2 > 0) {
          shape(rect(bx + o, by + o, s2, s2), C.K, t2, 1.6);
          shape(rect(bx + b, by, o, o), C.Y, t2, 1.6);
          shape(rect(bx, by + b, o, o), C.Y, t2, 1.6);
        }
        if (t3 > 0) {
          // меньшая пара выходит рядом (или ниже): чёрный = жёлтый + жёлтый
          const X = L.ex, Y = L.ey;
          shape(rect(X, Y, s2, s2), C.K, t3, 1.6);
          label('=', X + s2 + 28, Y + s2 / 2, { a: t3, size: 40, italic: false });
          shape(rect(X + s2 + 56, Y + (s2 - o) / 2, o, o), C.Y, t3, 1.6);
          label('+', X + s2 + 56 + o + 24, Y + s2 / 2, { a: t3, size: 40, italic: false });
          shape(rect(X + s2 + 56 + o + 48, Y + (s2 - o) / 2, o, o), C.Y, t3, 1.6);
          // бесконечный спуск: каждая следующая пара меньше в √2 − 1 раз
          let A = s2;
          for (let k = 1; k <= 4; k++) {
            const na = A * (Math.SQRT2 - 1);
            const kk = clamp(t3 * 1.8 - k * 0.3, 0, 1);
            const cx = X + s2 / 2, cy = Y + s2 / 2;
            shape(rect(cx - na / 2, cy - na / 2, na, na), k % 2 ? C.B : C.K, kk, 0.9);
            A = na;
          }
        }
        if (t4 > 0) label('√2 ∉ ℚ', L.lab[0], L.lab[1], { a: t4, size: 40 });
      },
    });
  }

  /* ---------- Значки для оглавления ---------- */
  const ICONS = {
    pyth: `<rect x="2" y="2" width="18" height="18" fill="#e9ae2a" stroke="#1d1a17" stroke-width="1.2"/><path d="M9 2 20 9 13 20 2 13Z" fill="#1f5aa0" stroke="#1d1a17" stroke-width="1.2"/>`,
    tri: `<path d="M3 19 19 19 9 4Z" fill="#f4ecd9" stroke="#1d1a17" stroke-width="1.3"/><path d="M3 19 8 19A5 5 0 0 0 5.6 15Z" fill="#c4362c"/><path d="M19 19 14 19A5 5 0 0 1 16.6 16Z" fill="#1f5aa0"/>`,
    par: `<path d="M3 18 13 18 19 5 9 5Z" fill="#1f5aa0" stroke="#1d1a17" stroke-width="1.2"/><path d="M3 18.2 13 18.2" stroke="#c4362c" stroke-width="2.4"/>`,
    ext: `<path d="M11 11 20 11A9 9 0 0 1 11 20Z" fill="#c4362c"/><path d="M11 11 11 20A9 9 0 0 1 2 11Z" fill="#e9ae2a"/><path d="M11 11 2 11A9 9 0 0 1 11 2Z" fill="#1f5aa0"/><path d="M11 11 11 2A9 9 0 0 1 20 11Z" fill="#1d1a17"/>`,
    circ: `<path d="M11 11 11 2A9 9 0 0 1 11 20Z" fill="#c4362c" stroke="#1d1a17" stroke-width="1.1"/><path d="M11 11 11 20A9 9 0 0 1 11 2Z" fill="#1f5aa0" stroke="#1d1a17" stroke-width="1.1"/>`,
    odd: `<rect x="2" y="2" width="6" height="6" fill="#c4362c" stroke="#1d1a17"/><path d="M8 2h6v12H2V8h6Z" fill="#e9ae2a" stroke="#1d1a17"/><path d="M14 2h6v18H2v-6h12Z" fill="#1f5aa0" stroke="#1d1a17"/>`,
    stair: `<path d="M2 20V16h4v-4h4V8h4V4h4v16Z" fill="#c4362c" stroke="#1d1a17" stroke-width="1.1"/><path d="M2 16V2h16v2h-4v4h-4v4H6v4Z" fill="#1f5aa0" stroke="#1d1a17" stroke-width="1.1"/>`,
    cubes: `<rect x="2" y="2" width="4" height="4" fill="#c4362c" stroke="#1d1a17"/><path d="M6 2h6v10H2V6h4Z" fill="#e9ae2a" stroke="#1d1a17"/><path d="M12 2h8v18H2v-8h10Z" fill="#1f5aa0" stroke="#1d1a17"/>`,
    half: `<rect x="2" y="2" width="9" height="18" fill="#c4362c" stroke="#1d1a17"/><rect x="11" y="2" width="9" height="9" fill="#e9ae2a" stroke="#1d1a17"/><rect x="11" y="11" width="4.5" height="9" fill="#1f5aa0" stroke="#1d1a17"/><rect x="15.5" y="11" width="4.5" height="4.5" fill="#1d1a17"/>`,
    quart: `<rect x="2" y="11" width="9" height="9" fill="#c4362c" stroke="#1d1a17"/><rect x="2" y="2" width="9" height="9" fill="#e9ae2a" stroke="#1d1a17"/><rect x="11" y="11" width="9" height="9" fill="#1f5aa0" stroke="#1d1a17"/><rect x="11" y="6.5" width="4.5" height="4.5" fill="#c4362c"/><rect x="11" y="2" width="4.5" height="4.5" fill="#e9ae2a"/><rect x="15.5" y="6.5" width="4.5" height="4.5" fill="#1f5aa0"/>`,
    amgm: `<path d="M2 2h13v7H2Z M15 2h5v13h-5Z M7 15h13v5H7Z M2 9h5v11H2Z" fill="#e9ae2a" stroke="#1d1a17" stroke-width="1.1"/><rect x="7" y="9" width="8" height="6" fill="#1d1a17"/>`,
    sqrt: `<rect x="2" y="2" width="18" height="18" fill="#1f5aa0" stroke="#1d1a17"/><rect x="2" y="2" width="13" height="13" fill="#c4362c" opacity=".85"/><rect x="7" y="7" width="13" height="13" fill="#c4362c" opacity=".85"/><rect x="7" y="7" width="8" height="8" fill="#1d1a17"/>`,
  };

  /* ---------- Состояние спектакля ---------- */
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
  const state = { cur: 0, p: 0, target: 0, playing: !reduceMotion, autoshow: true, tempo: 1, hold: 0, fade: 1, fadeDir: 0, pendingProof: -1 };
  const DUR = 1.55, HOLD = 1.9, END_HOLD = 5;

  const SHORT = /(^|[\s«(—])(в|к|с|и|а|о|у|я|но|на|по|за|от|до|из|не|ни|же|ли|во|ко|со|об)\s/giu;
  const typo = (s) => s.replace(SHORT, '$1$2 ').replace(SHORT, '$1$2 ').replace(/(\d) ([×=+−])/g, '$1 $2');

  const acts = $('#acts');
  PROOFS.forEach((pr, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<button data-i="${i}"${pr.short ? ` title="${pr.title}"` : ''}><span class="rn">${ROMAN[i]}</span><svg viewBox="0 0 22 22" aria-hidden="true">${ICONS[pr.icon]}</svg><span>${typo(pr.short || pr.title)}</span></button>`;
    acts.appendChild(li);
  });
  acts.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    goProof(+b.dataset.i);
    toggleToc(false);
  });

  function setDOM() {
    const pr = PROOFS[state.cur];
    $('#initial').textContent = ROMAN[state.cur];
    $('#actLabel').textContent = `Действие ${ROMAN[state.cur]}`;
    $('#title').textContent = typo(pr.title);
    $('#runRight').textContent = `Действие ${ROMAN[state.cur]} из XII`;
    acts.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-current', String(i === state.cur)));
    const pips = $('#pips');
    pips.innerHTML = pr.steps.map((_, i) => `<button class="pip" data-k="${i}" aria-label="Явление ${i + 1}"></button>`).join('');
    lastCaption = -1;
    $('#formula').innerHTML = pr.formula;
  }
  pipsHandler();
  function pipsHandler() {
    $('#pips').addEventListener('click', (e) => {
      const b = e.target.closest('.pip');
      if (!b) return;
      state.target = +b.dataset.k;
      state.hold = 0;
    });
  }

  let lastCaption = -1;
  function syncUI() {
    const pr = PROOFS[state.cur];
    const N = pr.steps.length;
    if (state.target !== lastCaption) {
      lastCaption = state.target;
      const cap = $('#caption');
      cap.classList.add('swap');
      setTimeout(() => {
        cap.textContent = typo(pr.steps[state.target]);
        cap.classList.remove('swap');
      }, lastCaption === 0 ? 0 : 180);
      $('#scene').textContent = `явление ${state.target + 1} из ${N}`;
      $('#prev').disabled = state.target === 0;
      $('#next').disabled = state.target === N - 1 && state.cur === PROOFS.length - 1;
    }
    $('#formula').classList.toggle('show', state.p > N - 1.35);
    $('#pips').querySelectorAll('.pip').forEach((b, i) => {
      b.classList.toggle('done', i < Math.round(state.p));
      b.classList.toggle('now', i === state.target);
    });
  }

  function goProof(i) {
    i = (i + PROOFS.length) % PROOFS.length;
    if (i === state.cur && state.fadeDir === 0) { state.target = 0; state.p = 0; state.hold = 0; return; }
    state.pendingProof = i;
    state.fadeDir = -1;
  }

  function setPlaying(on) {
    state.playing = on;
    $('#play').setAttribute('aria-label', on ? 'Пауза' : 'Играть');
    $('#play .i-pause').style.display = on ? '' : 'none';
    $('#play .i-play').style.display = on ? 'none' : '';
    state.hold = 0;
  }

  $('#play').addEventListener('click', () => setPlaying(!state.playing));
  $('#prev').addEventListener('click', () => step(-1));
  $('#next').addEventListener('click', () => step(1));
  $('#replay').addEventListener('click', () => { state.p = 0; state.target = 0; state.hold = 0; setPlaying(true); });
  // Темп: множитель скорости переходов и пауз между явлениями
  const tempoBox = $('#tempo');
  function setTempo(k) {
    state.tempo = k;
    tempoBox.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.k === k)));
  }
  tempoBox.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setTempo(+b.dataset.k); });
  const autoshowBtn = $('#autoshow');
  $('#autoshowRow').addEventListener('click', () => {
    state.autoshow = !state.autoshow;
    autoshowBtn.setAttribute('aria-checked', String(state.autoshow));
  });
  // Пока идёт смена действия (затухание), шаги не принимаем, а соседнее действие считаем от того,
  // что уже загружается, — иначе быстрое нажатие затирало бы выбранное в оглавлении действие
  const actNow = () => (state.fadeDir < 0 ? state.pendingProof : state.cur);
  function step(d) {
    if (state.fadeDir < 0) return;
    const N = PROOFS[state.cur].steps.length;
    const t = state.target + d;
    if (t < 0) return;
    if (t > N - 1) { goProof(state.cur + 1); return; }
    state.target = t;
    state.hold = 0;
  }
  addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { step(1); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { step(-1); e.preventDefault(); }
    else if (e.key === 'ArrowDown') { goProof(actNow() + 1); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { goProof(actNow() - 1); e.preventDefault(); }
    else if (e.code === 'Space') { setPlaying(!state.playing); e.preventDefault(); }
    else if (e.key === 'Escape') toggleToc(false);
  });

  // Оглавление на телефоне — нижняя шторка
  const toc = $('#toc'), scrim = $('#scrim');
  function toggleToc(open) {
    toc.classList.toggle('open', open);
    scrim.classList.toggle('show', open);
    $('#tocBtn').setAttribute('aria-expanded', String(open));
  }
  $('#tocBtn').addEventListener('click', () => toggleToc(!toc.classList.contains('open')));
  scrim.addEventListener('click', () => toggleToc(false));
  // Свайп по чертежу на телефоне
  let sx0 = null;
  cv.addEventListener('pointerdown', (e) => { sx0 = e.clientX; });
  cv.addEventListener('pointerup', (e) => {
    if (sx0 == null) return;
    const dx = e.clientX - sx0;
    sx0 = null;
    if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
    else setPlaying(!state.playing);
  });

  /* ---------- Цикл ---------- */
  let W = 0, H = 0, dpr = 1;
  function resize() {
    const r = cv.getBoundingClientRect();
    dpr = Math.min(2, devicePixelRatio || 1);
    W = r.width; H = r.height;
    cv.width = Math.max(1, Math.round(W * dpr));
    cv.height = Math.max(1, Math.round(H * dpr));
  }
  new ResizeObserver(resize).observe(cv);

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    time += dt;
    const pr = PROOFS[state.cur];
    const N = pr.steps.length;
    // смена действия с затуханием
    if (state.fadeDir < 0) {
      state.fade = Math.max(0, state.fade - dt / 0.35);
      if (state.fade === 0) {
        state.cur = state.pendingProof;
        state.p = 0; state.target = 0; state.hold = 0;
        setDOM();
        state.fadeDir = 1;
      }
    } else if (state.fadeDir > 0) {
      state.fade = Math.min(1, state.fade + dt / 0.45);
      if (state.fade === 1) state.fadeDir = 0;
    }
    // движение к цели
    const speed = (reduceMotion ? 6 : 1) * state.tempo;
    if (state.p < state.target) state.p = Math.min(state.target, state.p + (dt * speed) / DUR);
    else if (state.p > state.target) state.p = Math.max(state.target, state.p - (dt * 3 * state.tempo) / DUR);
    else if (state.playing && state.fadeDir === 0) {
      state.hold += dt * state.tempo;
      if (state.target < N - 1 && state.hold > HOLD) { state.target++; state.hold = 0; }
      else if (state.target === N - 1 && state.autoshow && state.hold > END_HOLD) goProof(state.cur + 1);
    }
    syncUI();
    draw();
    requestAnimationFrame(frame);
  }

  // Рамка доказательства: объединение всего, что оно рисует в состояниях покоя (на каждом явлении
  // и во всех фазах «дыхания»). Сцену вписываем по этой рамке, а не по пустому листу 1000 × 680, —
  // чертёж крупнее и стоит по центру. Детали, влетающие в кадр, на лету могут выходить за рамку.
  function measure(pr, portrait) {
    const N = pr.steps.length, keep = [time, alphaAll, scale];
    box = [Infinity, Infinity, -Infinity, -Infinity];
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    alphaAll = 0; scale = 1;                   // прямые вызовы canvas внутри draw() остаются невидимыми
    for (let k = 0; k < N; k++) for (const t of [0, 1.43, 2.62, 4.28]) { time = t; pr.draw(k, portrait); }
    g.restore();
    [time, alphaAll, scale] = keep;
    const b = box, m = 0.05 * Math.max(b[2] - b[0], b[3] - b[1]);
    box = null;
    return [b[0] - m, b[1] - m, b[2] + m, b[3] + m];
  }

  function draw() {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    const pr = PROOFS[state.cur];
    const portrait = W < H * 0.9, key = portrait ? 'viewP' : 'viewL';
    if (!pr[key]) pr[key] = measure(pr, portrait);
    const [vx, vy, vx1, vy1] = pr[key], vw = vx1 - vx, vh = vy1 - vy;
    scale = Math.min(W / vw, H / vh, 1.6 * Math.min(W / VW, H / VH));
    const ox = (W - vw * scale) / 2 - vx * scale, oy = (H - vh * scale) / 2 - vy * scale;
    g.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);
    alphaAll = ease(state.fade);
    g.globalAlpha = alphaAll;
    pr.draw(state.p, portrait);
    g.globalAlpha = 1;
  }

  /* ---------- Старт ---------- */
  setDOM();
  setPlaying(state.playing);
  if (SHOT) { state.p = 4; state.target = 4; setPlaying(false); }
  resize();
  // Цикл стартует сразу: пока курсив EB Garamond грузится, подписи на чертеже идут системной антиквой
  if (document.fonts) document.fonts.load('italic 26px "EB Garamond"').catch(() => {});
  requestAnimationFrame(frame);
})();
