'use strict';
/* 17 узоров.
   Каждая группа задана операциями в дробных координатах решётки (как в Международных
   кристаллографических таблицах). Мотив размножается один раз в «плитку-период», а плитка
   заливает экран как паттерн. Зеркала, скользящие отражения и центры поворота не вписаны
   вручную — они выводятся из самих операций: так схема симметрий всегда честная. */
(function () {
  const $ = (s) => document.querySelector(s);
  // в режиме съёмки (_tools/shot) холсты растеризуются на CPU: те же пиксели без очереди к программному GPU сервера
  const CTX = window.__SHOT__ ? { willReadFrequently: true } : undefined;
  const canvas = $('#c');
  const ctx = canvas.getContext('2d', CTX);
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const S3 = Math.sqrt(3);
  const NB = ' ';
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  /* ============================ решётки и группы ============================ */
  // P — прямоугольный период плитки (в нём целое число ячеек решётки)
  const FAM = {
    oblique: { name: 'Косая решётка', short: 'Косая', a: [1, 0], b: [1 / 3, 0.86], P: [1, 2.58] },
    rect: { name: 'Прямоугольная решётка', short: 'Прямоугольная', a: [1, 0], b: [0, 0.78], P: [1, 0.78] },
    centered: { name: 'Ромбическая решётка', short: 'Ромбическая', a: [1, 0], b: [0, 1.45], P: [1, 1.45] },
    square: { name: 'Квадратная решётка', short: 'Квадратная', a: [1, 0], b: [0, 1], P: [1, 1] },
    hex: { name: 'Шестиугольная решётка', short: 'Шестиугольная', a: [1, 0], b: [-0.5, S3 / 2], P: [1, S3] },
  };
  for (const f of Object.values(FAM)) {
    const det = f.a[0] * f.b[1] - f.b[0] * f.a[1];
    f.det = det;
    f.Li = [f.b[1] / det, -f.b[0] / det, -f.a[1] / det, f.a[0] / det];
  }

  const I = [1, 0, 0, 1, 0, 0];
  const C2 = [-1, 0, 0, -1, 0, 0];
  const centering = (ops) => ops.concat(ops.map((o) => [o[0], o[1], o[2], o[3], o[4] + 0.5, o[5] + 0.5]));
  const P3 = [I, [0, -1, 1, -1, 0, 0], [-1, 1, -1, 0, 0, 0]];
  const P6 = P3.concat([C2, [0, 1, -1, 1, 0, 0], [1, -1, 1, 0, 0, 0]]);
  const M3a = [[0, -1, -1, 0, 0, 0], [-1, 1, 0, 1, 0, 0], [1, 0, 1, -1, 0, 0]];
  const M3b = [[0, 1, 1, 0, 0, 0], [1, -1, 0, -1, 0, 0], [-1, 0, -1, 1, 0, 0]];
  const P4 = [I, C2, [0, -1, 1, 0, 0, 0], [0, 1, -1, 0, 0, 0]];
  const GROUPS = [
    { id: 'p1', orb: 'o', fam: 'oblique', ops: [I] },
    { id: 'p2', orb: '2222', fam: 'oblique', ops: [I, C2] },
    { id: 'pm', orb: '**', fam: 'rect', ops: [I, [-1, 0, 0, 1, 0, 0]] },
    { id: 'pg', orb: '××', fam: 'rect', ops: [I, [-1, 0, 0, 1, 0, 0.5]] },
    { id: 'pmm', orb: '*2222', fam: 'rect', ops: [I, C2, [-1, 0, 0, 1, 0, 0], [1, 0, 0, -1, 0, 0]] },
    { id: 'pmg', orb: '22*', fam: 'rect', ops: [I, C2, [-1, 0, 0, 1, 0.5, 0], [1, 0, 0, -1, 0.5, 0]] },
    { id: 'pgg', orb: '22×', fam: 'rect', ops: [I, C2, [-1, 0, 0, 1, 0.5, 0.5], [1, 0, 0, -1, 0.5, 0.5]] },
    { id: 'cm', orb: '*×', fam: 'centered', ops: centering([I, [-1, 0, 0, 1, 0, 0]]) },
    { id: 'cmm', orb: '2*22', fam: 'centered', ops: centering([I, C2, [-1, 0, 0, 1, 0, 0], [1, 0, 0, -1, 0, 0]]) },
    { id: 'p4', orb: '442', fam: 'square', ops: P4 },
    { id: 'p4m', orb: '*442', fam: 'square', ops: P4.concat([[-1, 0, 0, 1, 0, 0], [1, 0, 0, -1, 0, 0], [0, 1, 1, 0, 0, 0], [0, -1, -1, 0, 0, 0]]) },
    { id: 'p4g', orb: '4*2', fam: 'square', ops: P4.concat([[-1, 0, 0, 1, 0.5, 0.5], [1, 0, 0, -1, 0.5, 0.5], [0, 1, 1, 0, 0.5, 0.5], [0, -1, -1, 0, 0.5, 0.5]]) },
    { id: 'p3', orb: '333', fam: 'hex', ops: P3 },
    { id: 'p3m1', orb: '*333', fam: 'hex', ops: P3.concat(M3a) },
    { id: 'p31m', orb: '3*3', fam: 'hex', ops: P3.concat(M3b) },
    { id: 'p6', orb: '632', fam: 'hex', ops: P6 },
    { id: 'p6m', orb: '*632', fam: 'hex', ops: P6.concat(M3a, M3b) },
  ];
  const DESC = {
    p1: 'Только сдвиги: мотив повторяется по косой решётке без поворотов и отражений.',
    p2: 'Добавляются повороты на 180°. В каждой ячейке — четыре разных центра второго порядка.',
    pm: 'Параллельные зеркала: мотив отражается, будто стоит между двумя зеркалами.',
    pg: 'Скользящее отражение: отразить и сдвинуть на полшага — так ложатся следы на снегу.',
    pmm: 'Зеркала в двух перпендикулярных направлениях, центры второго порядка — на их пересечениях.',
    pmg: 'Зеркала в одном направлении, скользящие отражения — в другом, повороты на 180° между ними.',
    pgg: 'Скользящие отражения в двух направлениях и повороты на 180° — и ни одного зеркала.',
    cm: 'Зеркала чередуются со скользящими отражениями, решётка ромбическая.',
    cmm: 'Зеркала в двух направлениях на ромбической решётке и центры второго порядка вне зеркал.',
    p4: 'Повороты на 90°: мотив кружится вокруг центров четвёртого порядка, как вертушка.',
    p4m: 'Все зеркала квадрата — по сторонам и диагоналям. Самая «кафельная» из групп.',
    p4g: 'Повороты на 90° и зеркала, не проходящие через центры поворота, — узор как плетёнка.',
    p3: 'Повороты на 120° вокруг трёх разных типов центров, без отражений.',
    p3m1: 'Зеркала в трёх направлениях; все центры третьего порядка лежат на зеркалах.',
    p31m: 'Зеркала в трёх направлениях, но часть центров третьего порядка — вне зеркал.',
    p6: 'Повороты на 60°: шестилучевые вертушки без единого зеркала.',
    p6m: 'Наибольшая симметрия плоскости — двенадцать преобразований в ячейке, как у снежинки.',
  };
  const typo = (t) => t.replace(/ — /g, NB + '— ').replace(/(^|\s)(в|к|с|и|а|но|на|по|за|от|до|из|не|как)\s/gi, `$1$2${NB}`);

  // операции в декартовых координатах: A = L·M·L⁻¹, T = L·t
  for (const g of GROUPS) {
    const f = FAM[g.fam];
    const a = f.a, b = f.b, Li = f.Li;
    g.opsC = g.ops.map((o) => {
      const LM00 = a[0] * o[0] + b[0] * o[2], LM01 = a[0] * o[1] + b[0] * o[3];
      const LM10 = a[1] * o[0] + b[1] * o[2], LM11 = a[1] * o[1] + b[1] * o[3];
      return {
        a00: LM00 * Li[0] + LM01 * Li[2], a01: LM00 * Li[1] + LM01 * Li[3],
        a10: LM10 * Li[0] + LM11 * Li[2], a11: LM10 * Li[1] + LM11 * Li[3],
        tx: a[0] * o[4] + b[0] * o[5], ty: a[1] * o[4] + b[1] * o[5],
      };
    });
  }
  const byId = Object.fromEntries(GROUPS.map((g) => [g.id, g]));

  /* ---------- элементы симметрии, выведенные из операций ---------- */
  function shortestParallel(f, ux, uy) {
    let best = Infinity;
    for (let n1 = -6; n1 <= 6; n1++) for (let n2 = -6; n2 <= 6; n2++) {
      if (!n1 && !n2) continue;
      const vx = n1 * f.a[0] + n2 * f.b[0], vy = n1 * f.a[1] + n2 * f.b[1];
      if (Math.abs(vx * uy - vy * ux) < 1e-6) best = Math.min(best, Math.hypot(vx, vy));
    }
    return best;
  }
  function symmetry(g) {
    if (g.sym) return g.sym;
    const f = FAM[g.fam];
    const lines = new Map(), centers = new Map();
    for (const o of g.opsC) {
      const det = o.a00 * o.a11 - o.a01 * o.a10;
      for (let n1 = -1; n1 <= 1; n1++) for (let n2 = -1; n2 <= 1; n2++) {
        const tx = o.tx + n1 * f.a[0] + n2 * f.b[0], ty = o.ty + n1 * f.a[1] + n2 * f.b[1];
        if (det > 0) {
          if (Math.abs(o.a00 - 1) < 1e-6 && Math.abs(o.a11 - 1) < 1e-6 && Math.abs(o.a01) < 1e-6) continue;
          const m00 = 1 - o.a00, m01 = -o.a01, m10 = -o.a10, m11 = 1 - o.a11;
          const d = m00 * m11 - m01 * m10;
          const cx = (m11 * tx - m01 * ty) / d, cy = (-m10 * tx + m00 * ty) / d;
          const order = Math.round((2 * Math.PI) / Math.abs(Math.atan2(o.a10, o.a00)));
          let fx = f.Li[0] * cx + f.Li[1] * cy, fy = f.Li[2] * cx + f.Li[3] * cy;
          fx -= Math.floor(fx + 1e-7); fy -= Math.floor(fy + 1e-7);
          const key = Math.round(fx * 1000) % 1000 + ',' + Math.round(fy * 1000) % 1000;
          const prev = centers.get(key);
          if (!prev || prev.order < order) centers.set(key, { fx, fy, order });
        } else {
          let th = 0.5 * Math.atan2(o.a10, o.a00);
          if (th < 0) th += Math.PI;
          if (th >= Math.PI - 1e-9) th -= Math.PI;
          const ux = Math.cos(th), uy = Math.sin(th), nx = -uy, ny = ux;
          const glide = tx * ux + ty * uy;
          const dd = (tx * nx + ty * ny) / 2;
          const Lu = shortestParallel(f, ux, uy);
          const spacing = Math.abs(f.det) / Lu;
          let off = ((dd % spacing) + spacing) % spacing;
          if (spacing - off < 1e-5) off = 0;
          const gm = ((glide % Lu) + Lu) % Lu;
          const mirror = gm < 1e-5 || Lu - gm < 1e-5;
          const key = Math.round(th * 1e4) + ':' + Math.round(off * 1e4);
          const prev = lines.get(key);
          if (!prev) lines.set(key, { ux, uy, nx, ny, off, spacing, mirror, th });
          else if (mirror) prev.mirror = true;
        }
      }
    }
    const L = [...lines.values()], C = [...centers.values()];
    const mirrorDirs = new Set(L.filter((l) => l.mirror).map((l) => Math.round(l.th * 1000)));
    const glides = L.some((l) => !l.mirror);
    const orders = new Set(C.map((c) => c.order));
    g.sym = { lines: L, centers: C, mirrorDirs: mirrorDirs.size, glides, orders };
    return g.sym;
  }

  /* ============================ стили ============================ */
  const STYLES = {
    stitch: { name: 'Вышивка', inkName: 'Нить', bg: '#e8dcc5', inks: ['#a8261d', '#1f1a16', '#bf8a2c', '#35603c'], guide: '#0a7479', mode: 'line' },
    cobalt: { name: 'Кобальт', inkName: 'Роспись', bg: '#f2f4f9', inks: ['#1b3a93', '#3862c6', '#7f9cdb', '#0d2160'], guide: '#d1452a', mode: 'cobalt' },
    print: { name: 'Набойка', inkName: 'Краска', bg: '#1d2a4c', inks: ['#efe2c4', '#cb5a31', '#e4ae40', '#8fbcae'], guide: '#ffd166', mode: 'print' },
    ink: { name: 'Графика', inkName: 'Тушь', bg: '#f3ecdf', inks: ['#1d1b19', '#c23b22', '#2b4f7e', '#b8892d'], guide: '#0a7479', mode: 'line' },
  };
  const STYLE_ORDER = ['stitch', 'cobalt', 'print', 'ink'];
  const hexRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  function shade(hex, k) {
    const c = hexRgb(hex).map((v) => Math.round(clamp(k < 0 ? v * (1 + k) : v + (255 - v) * k, 0, 255)));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }

  /* ============================ состояние ============================ */
  const st = {
    group: 'p4m', style: 'stitch', color: 0, width: 0.05,
    s: 200, ox: 0, oy: 0,
    strokes: [], redoClear: null,
    guides: false, guideFlash: -1e9,
    drawing: null, pan: null, space: false,
    dirty: true, tileDirty: true, thumbsDirty: true,
    anim: null, trans: null,
  };
  let W = 0, H = 0, DPR = 1;

  /* ============================ геометрия ============================ */
  function applyOp(o, pts) {
    const q = new Float32Array(pts.length);
    for (let i = 0; i < pts.length; i += 2) {
      const x = pts[i], y = pts[i + 1];
      q[i] = o.a00 * x + o.a01 * y + o.tx;
      q[i + 1] = o.a10 * x + o.a11 * y + o.ty;
    }
    return q;
  }
  function bbox(q) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < q.length; i += 2) {
      const x = q[i], y = q[i + 1];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    return [x0, y0, x1, y1];
  }
  // сдвинуть штрих на вектор решётки так, чтобы его центр оказался в базовой ячейке
  function normalizeStroke(s, fam) {
    const f = FAM[fam];
    let cx = 0, cy = 0;
    const n = s.pts.length / 2;
    for (let i = 0; i < s.pts.length; i += 2) { cx += s.pts[i]; cy += s.pts[i + 1]; }
    cx /= n; cy /= n;
    const fx = Math.floor(f.Li[0] * cx + f.Li[1] * cy), fy = Math.floor(f.Li[2] * cx + f.Li[3] * cy);
    if (!fx && !fy) return;
    const dx = fx * f.a[0] + fy * f.b[0], dy = fx * f.a[1] + fy * f.b[1];
    for (let i = 0; i < s.pts.length; i += 2) { s.pts[i] -= dx; s.pts[i + 1] -= dy; }
  }
  function tracePath(c, q, dx, dy, upto) {
    const n = Math.min(q.length / 2, upto);
    c.beginPath();
    if (n < 1) return;
    c.moveTo(q[0] + dx, q[1] + dy);
    if (n === 1) { c.lineTo(q[0] + dx + 1e-4, q[1] + dy + 1e-4); return; }
    for (let i = 1; i < n - 1; i++) {
      const x = q[2 * i] + dx, y = q[2 * i + 1] + dy;
      c.quadraticCurveTo(x, y, (x + q[2 * i + 2] + dx) / 2, (y + q[2 * i + 3] + dy) / 2);
    }
    c.lineTo(q[2 * n - 2] + dx, q[2 * n - 1] + dy);
  }

  /* ---------- плитка-период: один раз размножаем мотив ---------- */
  let speck = null;
  function speckle() {
    if (speck) return speck;
    speck = document.createElement('canvas');
    speck.width = speck.height = 128;
    const c = speck.getContext('2d', CTX);
    for (let i = 0; i < 900; i++) {
      c.fillStyle = `rgba(0,0,0,${0.15 + Math.random() * 0.6})`;
      c.beginPath();
      c.arc(Math.random() * 128, Math.random() * 128, 0.4 + Math.random() * 1.3, 0, Math.PI * 2);
      c.fill();
    }
    return speck;
  }
  function renderTile(tc, g, mode, inks, k, strokes, reveal) {
    const f = FAM[g.fam];
    const Pw = f.P[0], Ph = f.P[1];
    const tw = Math.max(8, Math.round(Pw * k)), th = Math.max(8, Math.round(Ph * k));
    if (tc.width !== tw || tc.height !== th) { tc.width = tw; tc.height = th; }
    const c = tc.getContext('2d', CTX);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, tw, th);
    c.setTransform(tw / Pw, 0, 0, th / Ph, 0, 0);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    for (let si = 0; si < strokes.length; si++) {
      const s = strokes[si];
      const upto = reveal ? reveal(si, s) : Infinity;
      if (upto < 1) continue;
      const col = inks[s.c] || inks[0];
      for (const o of g.opsC) {
        const q = applyOp(o, s.pts);
        const bb = bbox(q);
        const m = s.w * 1.2;
        for (let n1 = -4; n1 <= 4; n1++) for (let n2 = -4; n2 <= 4; n2++) {
          const dx = n1 * f.a[0] + n2 * f.b[0], dy = n1 * f.a[1] + n2 * f.b[1];
          if (bb[2] + dx < -m || bb[0] + dx > Pw + m || bb[3] + dy < -m || bb[1] + dy > Ph + m) continue;
          tracePath(c, q, dx, dy, upto);
          if (mode === 'cobalt') {
            c.strokeStyle = col;
            c.globalAlpha = 0.2; c.lineWidth = s.w * 2.1; c.stroke();
            c.globalAlpha = 0.55; c.lineWidth = s.w * 1.25; c.stroke();
            c.globalAlpha = 0.95; c.strokeStyle = shade(col, -0.3); c.lineWidth = s.w * 0.55; c.stroke();
            c.globalAlpha = 1;
          } else {
            c.strokeStyle = col; c.lineWidth = s.w; c.stroke();
          }
        }
      }
    }
    if (mode === 'print') {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = 'destination-out';
      c.globalAlpha = 0.5;
      c.fillStyle = c.createPattern(speckle(), 'repeat');
      c.fillRect(0, 0, tw, th);
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';
    }
    return tc;
  }

  /* ============================ фактуры фона ============================ */
  const textures = {};
  function makeTexture(style) {
    const px = 512;
    const cv = document.createElement('canvas');
    cv.width = cv.height = px;
    const c = cv.getContext('2d', CTX);
    const R = (a, b) => a + Math.random() * (b - a);
    if (style === 'cobalt') {
      // кракелюр глазури
      c.strokeStyle = 'rgba(60, 78, 120, 0.1)';
      c.lineWidth = 1;
      for (let i = 0; i < 70; i++) {
        let x = R(0, px), y = R(0, px), a = R(0, Math.PI * 2);
        c.beginPath(); c.moveTo(x, y);
        const steps = 6 + Math.floor(R(0, 14));
        for (let j = 0; j < steps; j++) {
          a += R(-0.7, 0.7); x += Math.cos(a) * R(6, 22); y += Math.sin(a) * R(6, 22);
          c.lineTo(x, y);
        }
        c.stroke();
      }
      for (let i = 0; i < 26; i++) {
        const g = c.createRadialGradient(R(0, px), R(0, px), 0, R(0, px), R(0, px), R(40, 140));
        g.addColorStop(0, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g; c.fillRect(0, 0, px, px);
      }
    } else if (style === 'print') {
      for (let y = 0; y < px; y += 3) { c.fillStyle = `rgba(255,255,255,${R(0.01, 0.035)})`; c.fillRect(0, y, px, 1); }
      for (let x = 0; x < px; x += 3) { c.fillStyle = `rgba(0,0,0,${R(0.03, 0.08)})`; c.fillRect(x, 0, 1, px); }
    } else {
      // волокна бумаги
      for (let i = 0; i < 1400; i++) {
        c.strokeStyle = `rgba(120, 95, 60, ${R(0.03, 0.08)})`;
        c.lineWidth = R(0.4, 1);
        const x = R(0, px), y = R(0, px), a = R(0, Math.PI), l = R(3, 14);
        c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + R(-2, 2), y + Math.sin(a) * l * 0.5 + R(-2, 2), x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke();
      }
    }
    return cv;
  }

  /* ---------- вышивка крестом: канва «аида» и спрайты крестиков ---------- */
  const CW = 1 / 26; // размер стежка в единицах решётки
  let stitchCache = { px: 0, aida: null, sprites: [] };
  function makeAida(px) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = px;
    const c = cv.getContext('2d', CTX);
    c.fillStyle = '#e3d5bb'; c.fillRect(0, 0, px, px);
    c.fillStyle = '#ede3cf';
    const m = px * 0.13, r = px * 0.2;
    c.beginPath();
    if (c.roundRect) c.roundRect(m, m, px - 2 * m, px - 2 * m, r); else c.rect(m, m, px - 2 * m, px - 2 * m);
    c.fill();
    c.strokeStyle = 'rgba(140, 110, 70, 0.14)';
    c.lineWidth = Math.max(0.6, px * 0.04);
    for (const t of [0.38, 0.62]) {
      c.beginPath(); c.moveTo(m, px * t); c.lineTo(px - m, px * t); c.stroke();
      c.beginPath(); c.moveTo(px * t, m); c.lineTo(px * t, px - m); c.stroke();
    }
    c.fillStyle = 'rgba(92, 70, 44, 0.42)';
    const hr = px * 0.1;
    for (const [x, y] of [[0, 0], [px, 0], [0, px], [px, px]]) { c.beginPath(); c.arc(x, y, hr, 0, Math.PI * 2); c.fill(); }
    return cv;
  }
  function makeCross(col, px) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = px;
    const c = cv.getContext('2d', CTX);
    const m = px * 0.13, w = Math.max(1.2, px * 0.3);
    c.lineCap = 'round';
    const leg = (x0, y0, x1, y1) => {
      const L = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / L, uy = (y1 - y0) / L, nx = -uy, ny = ux;
      c.strokeStyle = 'rgba(45, 22, 8, 0.3)'; c.lineWidth = w;
      c.beginPath(); c.moveTo(x0 + px * 0.03, y0 + px * 0.06); c.lineTo(x1 + px * 0.03, y1 + px * 0.06); c.stroke();
      c.strokeStyle = col; c.lineWidth = w;
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
      c.strokeStyle = 'rgba(0, 0, 0, 0.2)'; c.lineWidth = Math.max(0.5, px * 0.045);
      for (let t = 0.16; t < 0.9; t += 0.15) {
        const cx = x0 + (x1 - x0) * t, cy = y0 + (y1 - y0) * t;
        c.beginPath();
        c.moveTo(cx + nx * w * 0.42 - ux * w * 0.28, cy + ny * w * 0.42 - uy * w * 0.28);
        c.lineTo(cx - nx * w * 0.42 + ux * w * 0.28, cy - ny * w * 0.42 + uy * w * 0.28);
        c.stroke();
      }
      c.strokeStyle = 'rgba(255, 255, 255, 0.26)'; c.lineWidth = w * 0.26;
      c.beginPath(); c.moveTo(x0 - nx * w * 0.2, y0 - ny * w * 0.2); c.lineTo(x1 - nx * w * 0.2, y1 - ny * w * 0.2); c.stroke();
    };
    leg(m, px - m, px - m, m);
    leg(m, m, px - m, px - m);
    return cv;
  }
  function stitchAssets(cs) {
    const px = Math.max(4, Math.round(cs * DPR));
    if (stitchCache.px !== px) {
      stitchCache = { px, aida: makeAida(px), sprites: STYLES.stitch.inks.map((c) => makeCross(c, px)) };
    }
    return stitchCache;
  }

  /* ============================ отрисовка ============================ */
  const tileCv = document.createElement('canvas');
  const maskTile = document.createElement('canvas');
  const mask = document.createElement('canvas');
  const mctx = mask.getContext('2d', { willReadFrequently: true });
  const snap = document.createElement('canvas');
  let inkRgb = STYLES.stitch.inks.map(hexRgb);

  function revealFn() {
    if (!st.anim) return null;
    const p = clamp((performance.now() - st.anim.t0) / st.anim.dur, 0, 1);
    const from = st.anim.from, n = st.strokes.length - from;
    return (si, s) => {
      if (si < from) return Infinity;
      const local = clamp(p * n - (si - from), 0, 1);
      return local >= 1 ? Infinity : Math.floor(local * (s.pts.length / 2));
    };
  }

  function drawBackground(style) {
    const sty = STYLES[style];
    ctx.fillStyle = sty.bg;
    ctx.fillRect(0, 0, W, H);
    if (style === 'stitch') return;
    if (!textures[style]) textures[style] = makeTexture(style);
    const p = ctx.createPattern(textures[style], 'repeat');
    p.setTransform(new DOMMatrix([1 / DPR, 0, 0, 1 / DPR, st.ox, st.oy]));
    ctx.fillStyle = p;
    ctx.fillRect(0, 0, W, H);
  }

  function drawPattern(g, reveal) {
    const sty = STYLES[st.style];
    const f = FAM[g.fam];
    const k = st.s * DPR;
    renderTile(tileCv, g, sty.mode, sty.inks, k, allStrokes(), reveal);
    const p = ctx.createPattern(tileCv, 'repeat');
    p.setTransform(new DOMMatrix([(st.s * f.P[0]) / tileCv.width, 0, 0, (st.s * f.P[1]) / tileCv.height, st.ox, st.oy]));
    ctx.fillStyle = p;
    ctx.fillRect(0, 0, W, H);
  }

  function drawStitches(g, reveal) {
    const f = FAM[g.fam];
    const cs = CW * st.s;
    // клетка маски 5×5 px; стежок ставится, если нить покрывает заметную долю клетки.
    // Доля считается по всем 25 пикселям — так результат не зависит от сглаживания конкретного растеризатора.
    const SUB = 5, NEED = 0.3 * 255 * SUB * SUB;
    const i0 = Math.floor(-st.ox / cs) - 1, j0 = Math.floor(-st.oy / cs) - 1;
    const ni = Math.ceil(W / cs) + 3, nj = Math.ceil(H / cs) + 3;
    const kMask = SUB / CW;
    renderTile(maskTile, g, 'line', STYLES.stitch.inks, kMask, allStrokes(), reveal);
    if (mask.width !== ni * SUB || mask.height !== nj * SUB) { mask.width = ni * SUB; mask.height = nj * SUB; }
    mctx.setTransform(1, 0, 0, 1, 0, 0);
    mctx.clearRect(0, 0, mask.width, mask.height);
    const pat = mctx.createPattern(maskTile, 'repeat');
    pat.setTransform(new DOMMatrix([(kMask * f.P[0]) / maskTile.width, 0, 0, (kMask * f.P[1]) / maskTile.height, -i0 * SUB, -j0 * SUB]));
    mctx.fillStyle = pat;
    mctx.fillRect(0, 0, mask.width, mask.height);
    const data = mctx.getImageData(0, 0, mask.width, mask.height).data;
    const A = stitchAssets(cs);
    const ap = ctx.createPattern(A.aida, 'repeat');
    ap.setTransform(new DOMMatrix([cs / A.px, 0, 0, cs / A.px, st.ox, st.oy]));
    ctx.fillStyle = ap;
    ctx.fillRect(0, 0, W, H);
    const mw = mask.width;
    for (let j = 0; j < nj; j++) {
      const y = st.oy + (j0 + j) * cs;
      if (y > H || y + cs < 0) continue;
      for (let i = 0; i < ni; i++) {
        let sum = 0, top = -1, idx = 0;
        for (let dy = 0; dy < SUB; dy++) {
          let p = ((j * SUB + dy) * mw + i * SUB) * 4;
          for (let dx = 0; dx < SUB; dx++, p += 4) { const a = data[p + 3]; sum += a; if (a > top) { top = a; idx = p; } }
        }
        if (sum < NEED) continue;
        const r = data[idx], gg = data[idx + 1], b = data[idx + 2];
        let best = 0, bd = Infinity;
        for (let q = 0; q < inkRgb.length; q++) {
          const d = (r - inkRgb[q][0]) ** 2 + (gg - inkRgb[q][1]) ** 2 + (b - inkRgb[q][2]) ** 2;
          if (d < bd) { bd = d; best = q; }
        }
        ctx.drawImage(A.sprites[best], st.ox + (i0 + i) * cs, y, cs, cs);
      }
    }
  }

  function drawGuides(g, alpha) {
    if (alpha <= 0.01) return;
    const f = FAM[g.fam];
    const sym = symmetry(g);
    const col = STYLES[st.style].guide;
    const toW = (sx, sy) => [(sx - st.ox) / st.s, (sy - st.oy) / st.s];
    const corners = [toW(0, 0), toW(W, 0), toW(0, H), toW(W, H)];
    const diag = Math.hypot(W, H) / st.s;
    ctx.save();
    ctx.globalAlpha = alpha;
    // решётка
    ctx.strokeStyle = col;
    ctx.globalAlpha = alpha * 0.28;
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    const fr = corners.map(([x, y]) => [f.Li[0] * x + f.Li[1] * y, f.Li[2] * x + f.Li[3] * y]);
    const minA = Math.floor(Math.min(...fr.map((p) => p[0]))) - 1, maxA = Math.ceil(Math.max(...fr.map((p) => p[0]))) + 1;
    const minB = Math.floor(Math.min(...fr.map((p) => p[1]))) - 1, maxB = Math.ceil(Math.max(...fr.map((p) => p[1]))) + 1;
    const W2S = (x, y) => [st.ox + x * st.s, st.oy + y * st.s];
    ctx.beginPath();
    for (let n = minA; n <= maxA; n++) {
      const p0 = W2S(n * f.a[0] + minB * f.b[0], n * f.a[1] + minB * f.b[1]);
      const p1 = W2S(n * f.a[0] + maxB * f.b[0], n * f.a[1] + maxB * f.b[1]);
      ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]);
    }
    for (let n = minB; n <= maxB; n++) {
      const p0 = W2S(minA * f.a[0] + n * f.b[0], minA * f.a[1] + n * f.b[1]);
      const p1 = W2S(maxA * f.a[0] + n * f.b[0], maxA * f.a[1] + n * f.b[1]);
      ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]);
    }
    ctx.stroke();
    // зеркала и скользящие отражения
    ctx.globalAlpha = alpha;
    const cxw = (corners[0][0] + corners[3][0]) / 2, cyw = (corners[0][1] + corners[3][1]) / 2;
    for (const l of sym.lines) {
      const proj = corners.map(([x, y]) => x * l.nx + y * l.ny);
      const k0 = Math.floor((Math.min(...proj) - l.off) / l.spacing) - 1;
      const k1 = Math.ceil((Math.max(...proj) - l.off) / l.spacing) + 1;
      ctx.lineWidth = l.mirror ? 2 : 1.6;
      ctx.setLineDash(l.mirror ? [] : [7, 5]);
      ctx.strokeStyle = col;
      ctx.beginPath();
      for (let k = k0; k <= k1; k++) {
        const d = l.off + k * l.spacing;
        // точка на линии, ближайшая к центру экрана
        const t = cxw * l.ux + cyw * l.uy;
        const px = l.nx * d + l.ux * t, py = l.ny * d + l.uy * t;
        const a = W2S(px - l.ux * diag, py - l.uy * diag), b = W2S(px + l.ux * diag, py + l.uy * diag);
        ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // центры поворота
    const r = 6.5;
    for (const cc of sym.centers) {
      for (let n1 = minA; n1 <= maxA; n1++) for (let n2 = minB; n2 <= maxB; n2++) {
        const fx = cc.fx + n1, fy = cc.fy + n2;
        const [sx, sy] = W2S(fx * f.a[0] + fy * f.b[0], fx * f.a[1] + fy * f.b[1]);
        if (sx < -10 || sy < -10 || sx > W + 10 || sy > H + 10) continue;
        ctx.beginPath();
        if (cc.order === 2) ctx.ellipse(sx, sy, r, r * 0.58, 0, 0, Math.PI * 2);
        else {
          const n = cc.order === 3 ? 3 : cc.order === 4 ? 4 : 6;
          const rr = n === 3 ? r * 1.15 : n === 4 ? r * 0.95 : r;
          const rot = n === 3 ? -Math.PI / 2 : n === 4 ? Math.PI / 4 : 0;
          for (let i = 0; i <= n; i++) {
            const a = rot + (i * Math.PI * 2) / n;
            const x = sx + Math.cos(a) * rr, y = sy + Math.sin(a) * rr;
            i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
          }
        }
        ctx.fillStyle = col;
        ctx.fill();
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = st.style === 'print' ? '#1d2a4c' : '#fff';
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function allStrokes() { return st.drawing ? st.strokes.concat([st.drawing]) : st.strokes; }

  function render(now) {
    const g = byId[st.group];
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const reveal = revealFn();
    drawBackground(st.style);
    if (st.style === 'stitch') drawStitches(g, reveal);
    else drawPattern(g, reveal);
    const flash = st.guides ? 1 : clamp(1 - (now - st.guideFlash - 1300) / 900, 0, 1) * (now - st.guideFlash < 2200 ? 1 : 0);
    drawGuides(g, flash);
    if (st.trans) {
      const p = clamp((now - st.trans.t0) / 720, 0, 1);
      if (p >= 1) st.trans = null;
      else {
        const e = ease(p);
        const R = e * st.trans.max;
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, W, H);
        ctx.arc(st.trans.x, st.trans.y, R, 0, Math.PI * 2, true);
        ctx.clip('evenodd');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(snap, 0, 0);
        ctx.restore();
        ctx.save();
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        ctx.strokeStyle = STYLES[st.style].guide;
        ctx.globalAlpha = 0.8 * (1 - p);
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(st.trans.x, st.trans.y, R, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
    }
  }

  /* ============================ цикл ============================ */
  function loop(now) {
    requestAnimationFrame(loop);
    const flashing = !st.guides && now - st.guideFlash < 2300;
    if (st.anim && now - st.anim.t0 > st.anim.dur) { st.anim = null; st.dirty = true; st.thumbsDirty = true; }
    if (st.dirty || st.anim || st.trans || flashing || st.drawing) {
      render(now);
      st.dirty = false;
    }
    if (st.thumbsDirty && !st.drawing) { st.thumbsDirty = false; queueThumbs(); }
    pumpThumbs();
  }

  /* ============================ таблица групп ============================ */
  const thumbCanvases = {};
  const thumbTile = document.createElement('canvas');
  function buildTable() {
    const table = $('#table');
    const order = ['oblique', 'rect', 'centered', 'square', 'hex'];
    for (const fk of order) {
      const fam = document.createElement('div');
      fam.className = 'fam';
      const name = document.createElement('div');
      name.className = 'fam-name';
      name.textContent = FAM[fk].short;
      const items = document.createElement('div');
      items.className = 'fam-items';
      for (const g of GROUPS.filter((x) => x.fam === fk)) {
        const b = document.createElement('button');
        b.className = 'g';
        b.dataset.id = g.id;
        b.setAttribute('aria-label', `Группа ${g.id}, орбифолд ${g.orb}`);
        const cv = document.createElement('canvas');
        const tb = document.createElement('b');
        tb.textContent = g.id;
        const sm = document.createElement('small');
        sm.textContent = g.orb;
        b.append(cv, tb, sm);
        b.addEventListener('click', () => {
          const r = cv.getBoundingClientRect();
          setGroup(g.id, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
        });
        items.appendChild(b);
        thumbCanvases[g.id] = cv;
      }
      fam.append(name, items);
      table.appendChild(fam);
    }
  }
  let thumbQueue = [];
  function queueThumbs() { thumbQueue = GROUPS.map((g) => g.id); }
  function pumpThumbs() {
    let n = 6;
    while (n-- > 0 && thumbQueue.length) renderThumb(thumbQueue.shift());
  }
  function renderThumb(id) {
    const cv = thumbCanvases[id];
    if (!cv) return;
    const size = Math.round((cv.clientWidth || 58) * DPR);
    if (cv.width !== size) { cv.width = size; cv.height = size; }
    const c = cv.getContext('2d', CTX);
    const g = byId[id], f = FAM[g.fam];
    const sty = STYLES[st.style];
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = sty.bg;
    c.fillRect(0, 0, size, size);
    const ts = size / 2.2;
    renderTile(thumbTile, g, sty.mode === 'cobalt' ? 'cobalt' : 'line', sty.inks, ts, st.strokes, null);
    const p = c.createPattern(thumbTile, 'repeat');
    p.setTransform(new DOMMatrix([(ts * f.P[0]) / thumbTile.width, 0, 0, (ts * f.P[1]) / thumbTile.height, size / 2 - ts * 0.5, size / 2 - ts * 0.5]));
    c.fillStyle = p;
    c.fillRect(0, 0, size, size);
  }

  /* ============================ интерфейс ============================ */
  function plural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }
  function updateInfo() {
    const g = byId[st.group];
    const sym = symmetry(g);
    $('#gName').textContent = g.id;
    $('#gOrb').textContent = g.orb;
    $('#gFam').textContent = FAM[g.fam].name;
    $('#gDesc').textContent = typo(DESC[g.id]);
    const chips = [];
    if (sym.mirrorDirs) chips.push(`зеркала: ${sym.mirrorDirs}${NB}${plural(sym.mirrorDirs, 'направление', 'направления', 'направлений')}`);
    if (sym.glides) chips.push('скользящие отражения');
    for (const [o, t] of [[6, '60°'], [4, '90°'], [3, '120°'], [2, '180°']]) if (sym.orders.has(o)) chips.push(`повороты на${NB}${t}`);
    if (!chips.length) chips.push('только переносы');
    const ul = $('#gChips');
    ul.innerHTML = '';
    for (const t of chips) { const li = document.createElement('li'); li.textContent = t; ul.appendChild(li); }
    document.querySelectorAll('.g').forEach((b) => {
      const cur = b.dataset.id === st.group;
      b.setAttribute('aria-current', String(cur));
      if (cur) {
        const t = $('#table'), bl = b.offsetLeft, br = bl + b.offsetWidth;
        if (t.scrollWidth > t.clientWidth + 2 && (bl < t.scrollLeft || br > t.scrollLeft + t.clientWidth - 44)) {
          t.scrollTo({ left: bl - t.clientWidth / 2 + b.offsetWidth / 2, behavior: reduceMotion || !st.ready ? 'auto' : 'smooth' });
        }
      }
    });
    $('#info').style.setProperty('--guide', STYLES[st.style].guide);
  }

  function buildStyles() {
    const box = $('#styles');
    for (const key of STYLE_ORDER) {
      const sty = STYLES[key];
      const b = document.createElement('button');
      b.className = 'style-btn';
      b.setAttribute('role', 'radio');
      b.dataset.style = key;
      const cv = document.createElement('canvas');
      cv.width = 92; cv.height = 64;
      const c = cv.getContext('2d', CTX);
      c.fillStyle = sty.bg; c.fillRect(0, 0, 92, 64);
      if (key === 'stitch') {
        const sp = [makeCross(sty.inks[0], 12), makeCross(sty.inks[1], 12)];
        for (let y = 0; y < 5; y++) for (let x = 0; x < 8; x++) {
          const d = Math.abs(x - 3.5) + Math.abs(y - 2);
          if (d < 2.6) c.drawImage(sp[d < 1.6 ? 0 : 1], x * 12 - 2, y * 12 + 2);
        }
      } else {
        c.lineCap = 'round';
        const strokes = [[10, 50, 40, 14, 80, 46], [20, 20, 46, 40, 70, 18]];
        strokes.forEach((s, i) => {
          c.beginPath(); c.moveTo(s[0], s[1]); c.quadraticCurveTo(s[2], s[3], s[4], s[5]);
          if (key === 'cobalt') {
            c.strokeStyle = sty.inks[i]; c.globalAlpha = 0.25; c.lineWidth = 16; c.stroke();
            c.globalAlpha = 0.9; c.lineWidth = 6; c.stroke(); c.globalAlpha = 1;
          } else { c.strokeStyle = sty.inks[i]; c.lineWidth = 8; c.stroke(); }
        });
      }
      const span = document.createElement('span');
      span.textContent = sty.name;
      b.append(cv, span);
      b.addEventListener('click', () => setStyle(key));
      box.appendChild(b);
    }
  }
  function buildSwatches() {
    const box = $('#swatches');
    box.innerHTML = '';
    STYLES[st.style].inks.forEach((c, i) => {
      const b = document.createElement('button');
      b.style.setProperty('--c', c);
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(i === st.color));
      b.setAttribute('aria-label', `${STYLES[st.style].inkName}: цвет ${i + 1}`);
      b.addEventListener('click', () => { st.color = i; buildSwatches(); });
      box.appendChild(b);
    });
  }
  function setStyle(key) {
    st.style = key;
    $('#inkLabel').textContent = STYLES[key].inkName;
    inkRgb = STYLES[key].inks.map(hexRgb);
    document.querySelectorAll('.style-btn').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.style === key)));
    buildSwatches();
    updateInfo();
    st.dirty = true;
    st.thumbsDirty = true;
  }
  function setGroup(id, origin) {
    if (id === st.group) { st.guideFlash = performance.now(); return; }
    snap.width = canvas.width; snap.height = canvas.height;
    snap.getContext('2d', CTX).drawImage(canvas, 0, 0);
    const fam = byId[id].fam;
    st.group = id;
    for (const s of st.strokes) normalizeStroke(s, fam);
    const o = origin || { x: W / 2, y: H / 2 };
    const max = Math.max(Math.hypot(o.x, o.y), Math.hypot(W - o.x, o.y), Math.hypot(o.x, H - o.y), Math.hypot(W - o.x, H - o.y));
    st.trans = reduceMotion ? null : { t0: performance.now(), x: o.x, y: o.y, max };
    st.guideFlash = performance.now();
    st.dirty = true;
    updateInfo();
  }

  /* ============================ мотивы ============================ */
  // стартовый мотив: восьмиконечная звезда с «рожками», ромбы на узлах решётки
  function defaultMotif() {
    const S = (c, w, pts) => ({ c, w, pts: new Float32Array(pts) });
    return [
      S(0, 0.05, [0.5, 0.5, 0.5, 0.36, 0.5, 0.23]),
      S(0, 0.05, [0.5, 0.5, 0.41, 0.41, 0.33, 0.33]),
      S(1, 0.03, [0.5, 0.18, 0.455, 0.125, 0.4, 0.14, 0.39, 0.2]),
      S(1, 0.03, [0.5, 0.36, 0.44, 0.33, 0.43, 0.27, 0.47, 0.24]),
      S(1, 0.05, [0.13, 0, 0.065, 0.065, 0, 0.13]),
      S(0, 0.085, [0, 0]),
      S(2, 0.05, [0, 0.4, 0.05, 0.45, 0.1, 0.5]),
      S(0, 0.05, [0.24, 0.24]),
      S(1, 0.03, [0.2, 0.5, 0.26, 0.44, 0.32, 0.5]),
      S(2, 0.05, [0.5, 0.04]),
    ];
  }
  function autoMotif() {
    const g = byId[st.group], f = FAM[g.fam];
    const R = Math.random;
    const toW = (u, v) => [u * f.a[0] + v * f.b[0], u * f.a[1] + v * f.b[1]];
    const out = [];
    const inks = [0, 0, 1, 1, 2, 3];
    const center = [0.2 + R() * 0.6, 0.2 + R() * 0.6];
    // плотность узора ~ число операций × число штрихов: чем богаче группа, тем скромнее мотив
    const order = g.ops.length;
    const n = clamp(Math.round((12 + R() * 5) / Math.sqrt(order)), 3, 8);
    const spread = 0.46 / Math.pow(order, 0.35);
    for (let i = 0; i < n; i++) {
      const type = ['curve', 'curve', 'curve', 'loop', 'dot', 'dot', 'zig', 'spiral'][Math.floor(R() * 8)];
      const c = inks[Math.floor(R() * inks.length)];
      const w = [0.028, 0.04, 0.05, 0.065][Math.floor(R() * 4)];
      const pts = [];
      const cu = center[0] + (R() - 0.5) * 0.7, cv = center[1] + (R() - 0.5) * 0.7;
      if (type === 'curve') {
        const P = [0, 1, 2, 3].map(() => [cu + (R() - 0.5) * spread * 2, cv + (R() - 0.5) * spread * 2]);
        for (let t = 0; t <= 1.0001; t += 1 / 22) {
          const m = 1 - t;
          pts.push(...toW(
            m * m * m * P[0][0] + 3 * m * m * t * P[1][0] + 3 * m * t * t * P[2][0] + t * t * t * P[3][0],
            m * m * m * P[0][1] + 3 * m * m * t * P[1][1] + 3 * m * t * t * P[2][1] + t * t * t * P[3][1]));
        }
      } else if (type === 'loop') {
        const r = 0.04 + R() * 0.06;
        for (let t = 0; t <= Math.PI * 2 + 0.01; t += Math.PI / 12) pts.push(...toW(cu + Math.cos(t) * r, cv + Math.sin(t) * r * (0.6 + R() * 0.02)));
      } else if (type === 'dot') {
        pts.push(...toW(cu, cv));
      } else if (type === 'zig') {
        const k = 3 + Math.floor(R() * 3), a = R() * Math.PI, l = 0.06;
        for (let j = 0; j <= k; j++) pts.push(...toW(cu + Math.cos(a) * l * j + (j % 2 ? Math.cos(a + 1.57) * 0.05 : 0), cv + Math.sin(a) * l * j + (j % 2 ? Math.sin(a + 1.57) * 0.05 : 0)));
      } else {
        for (let t = 0; t < 9.5; t += 0.35) { const r = 0.012 * t; pts.push(...toW(cu + Math.cos(t) * r, cv + Math.sin(t) * r)); }
      }
      out.push({ c, w: type === 'dot' ? Math.max(w, 0.06) : w, pts: new Float32Array(pts) });
    }
    return out;
  }
  function startAnim(from, dur) {
    st.anim = reduceMotion ? null : { t0: performance.now(), dur, from };
    st.dirty = true;
  }

  /* ============================ ввод ============================ */
  function toWorld(e) {
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left - st.ox) / st.s, (e.clientY - r.top - st.oy) / st.s];
  }
  const touches = new Map();
  let pinch = null;
  function pinchState() {
    const [a, b] = [...touches.values()];
    return { d: Math.max(20, Math.hypot(a.x - b.x, a.y - b.y)), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    if (tools.classList.contains('open')) setSheet(false);
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) {
        // второй палец: штрих отменяется, начинается жест масштаба
        st.drawing = null;
        const p = pinchState();
        pinch = { ...p, s: st.s, ox: st.ox, oy: st.oy };
        st.dirty = true;
        return;
      }
      if (touches.size > 2 || pinch) return;
    }
    if (st.space || e.button === 1 || e.button === 2) {
      st.pan = { x: e.clientX, y: e.clientY };
      canvas.classList.add('panning');
      return;
    }
    const [x, y] = toWorld(e);
    st.drawing = { c: st.color, w: st.width, pts: [x, y] };
    st.anim = null;
    st.dirty = true;
  });
  canvas.addEventListener('pointermove', (e) => {
    if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch) {
      if (touches.size < 2) return;
      const p = pinchState();
      const minS = st.style === 'stitch' ? 110 : 60;
      const ns = clamp(pinch.s * (p.d / pinch.d), minS, 520);
      st.ox = p.x - ((pinch.x - pinch.ox) * ns) / pinch.s;
      st.oy = p.y - ((pinch.y - pinch.oy) * ns) / pinch.s;
      st.s = ns;
      st.dirty = true;
      return;
    }
    if (st.pan) {
      st.ox += e.clientX - st.pan.x; st.oy += e.clientY - st.pan.y;
      st.pan = { x: e.clientX, y: e.clientY };
      st.dirty = true;
      return;
    }
    if (!st.drawing) return;
    const [x, y] = toWorld(e);
    const p = st.drawing.pts;
    const lx = p[p.length - 2], ly = p[p.length - 1];
    if (Math.hypot(x - lx, y - ly) * st.s > 2.5) { p.push(x, y); st.dirty = true; }
  });
  function endPointer(e) {
    if (e && touches.has(e.pointerId)) {
      touches.delete(e.pointerId);
      if (pinch) { if (!touches.size) pinch = null; return; }
    }
    if (st.pan) { st.pan = null; canvas.classList.remove('panning'); return; }
    if (!st.drawing) return;
    const s = { c: st.drawing.c, w: st.drawing.w, pts: new Float32Array(st.drawing.pts) };
    st.drawing = null;
    normalizeStroke(s, byId[st.group].fam);
    st.strokes.push(s);
    st.redoClear = null;
    st.dirty = true;
    st.thumbsDirty = true;
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const minS = st.style === 'stitch' ? 130 : 60;
    const ns = clamp(st.s * Math.exp(-e.deltaY * 0.0015), minS, 520);
    st.ox = mx - ((mx - st.ox) * ns) / st.s;
    st.oy = my - ((my - st.oy) * ns) / st.s;
    st.s = ns;
    st.dirty = true;
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') { st.space = true; canvas.classList.add('pan'); e.preventDefault(); }
    else if (e.code === 'KeyG') toggleGuides();
    else if (e.code === 'KeyH') toggleBare();
    else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); undo(); }
    else if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
      const i = GROUPS.findIndex((g) => g.id === st.group);
      const j = (i + (e.code === 'ArrowRight' ? 1 : GROUPS.length - 1)) % GROUPS.length;
      setGroup(GROUPS[j].id);
    } else if (/^Digit[1-4]$/.test(e.code)) setStyle(STYLE_ORDER[+e.code.slice(5) - 1]);
  });
  window.addEventListener('keyup', (e) => { if (e.code === 'Space') { st.space = false; canvas.classList.remove('pan'); } });

  function toggleGuides() {
    st.guides = !st.guides;
    $('#guides').setAttribute('aria-pressed', String(st.guides));
    st.dirty = true;
  }
  function undo() {
    if (st.redoClear) { st.strokes = st.redoClear; st.redoClear = null; }
    else st.strokes.pop();
    st.anim = null;
    st.dirty = true;
    st.thumbsDirty = true;
  }
  $('#guides').addEventListener('click', toggleGuides);
  $('#undo').addEventListener('click', undo);
  $('#clear').addEventListener('click', () => {
    if (!st.strokes.length) return;
    st.redoClear = st.strokes;
    st.strokes = [];
    st.anim = null;
    st.dirty = true;
    st.thumbsDirty = true;
  });
  $('#auto').addEventListener('click', () => {
    const add = autoMotif();
    for (const s of add) normalizeStroke(s, byId[st.group].fam);
    if (st.strokes.length) st.redoClear = st.strokes;
    st.strokes = add;
    st.thumbsDirty = true;
    startAnim(0, 1300);
  });
  $('#save').addEventListener('click', () => {
    render(performance.now() + 1e5);
    canvas.toBlob((b) => {
      if (!b) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = `uzor-${st.group}-${st.style}.png`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    }, 'image/png');
  });
  document.querySelectorAll('#sizes button').forEach((b) => {
    b.addEventListener('click', () => {
      st.width = parseFloat(b.dataset.w);
      document.querySelectorAll('#sizes button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    });
  });
  const tools = $('#tools'), mobileBtn = $('#mobileTools');
  function setSheet(open) {
    tools.classList.toggle('open', open);
    mobileBtn.setAttribute('aria-expanded', String(open));
  }
  mobileBtn.addEventListener('click', () => setSheet(!tools.classList.contains('open')));
  $('#sheetClose').addEventListener('click', () => setSheet(false));
  function toggleBare() {
    const on = !document.body.classList.contains('bare');
    document.body.classList.toggle('bare', on);
    const b = $('#bare');
    b.setAttribute('aria-pressed', String(on));
    b.setAttribute('aria-label', on ? 'Показать панели' : 'Скрыть панели');
    b.title = on ? 'Показать панели (H)' : 'Скрыть панели (H)';
    if (on) setSheet(false);
  }
  $('#bare').addEventListener('click', toggleBare);

  /* ============================ размеры ============================ */
  function resize(first) {
    const cw = W, ch = H;
    W = innerWidth; H = innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    const mobile = W <= 860;
    if (first) {
      st.s = clamp(Math.min(W, H) / (mobile ? 3.4 : 4.4), mobile ? 110 : 140, 230);
      const cy = mobile ? H * 0.46 : (H - 150) / 2 + 10;
      st.ox = W / 2 - st.s * 0.5;
      st.oy = cy - st.s * 0.5;
    } else {
      st.ox += (W - cw) / 2; st.oy += (H - ch) / 2;
    }
    st.dirty = true;
    st.thumbsDirty = true;
    const t = $('#table');
    document.documentElement.style.setProperty('--th', t.offsetHeight + 'px');
    updateFade();
  }
  function updateFade() {
    const t = $('#table');
    $('#tableFade').classList.toggle('end', t.scrollLeft + t.clientWidth >= t.scrollWidth - 4);
  }
  $('#table').addEventListener('scroll', updateFade, { passive: true });
  window.addEventListener('resize', () => resize(false));

  /* ============================ старт ============================ */
  buildTable();
  buildStyles();
  resize(true);
  setStyle('stitch');
  st.strokes = defaultMotif();
  updateInfo();
  // миниатюры с первым кадром: все 17 сразу, дальше — по нескольку за кадр
  for (const g of GROUPS) renderThumb(g.id);
  st.thumbsDirty = false;
  startAnim(0, 1500);
  st.guideFlash = -1e9;
  st.ready = true;
  requestAnimationFrame(loop);
})();
