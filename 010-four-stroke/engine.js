/* Четыре такта — рядный четырёхцилиндровый двигатель.
   Геометрия в миллиметрах: ход 80, диаметр 80, радиус кривошипа 40, шатун 140, степень сжатия 10.
   Угол цикла c (0…720°) — для цилиндра 1, c = 0 — верхняя мёртвая точка в начале рабочего хода. */
(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const SHOT = !!window.__SHOT__;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const D2R = Math.PI / 180;

  // ---------------------------------------------------------------- геометрия и термодинамика
  const R = 40, L = 140, BORE = 80, CH = 32, SKIRT = 30;
  const CR = 10;
  const HC = (2 * R) / (CR - 1);                // высота камеры сгорания над поршнем в ВМТ
  const DECK = R + L + CH + HC;                  // плоскость разъёма блока и головки
  const AREA = Math.PI / 4 * 0.8 * 0.8 * 100;    // площадь поршня, см²  (d = 8 см)
  const VC = AREA * (HC / 10);                   // объём камеры, см³
  const VD = AREA * (2 * R / 10);                // рабочий объём цилиндра, см³

  const IVO = 350, IVC = 580, EVO = 140, EVC = 370, IGN = 710; // фазы, градусы цикла
  const LIFT = 9;                                // максимальный подъём клапана, мм
  const FIRING = [0, 540, 180, 360];             // сдвиг цикла цилиндров 1, 2, 3, 4 → порядок 1-3-4-2

  const wrap720 = (c) => ((c % 720) + 720) % 720;
  const wrap180 = (d) => ((d + 180) % 360 + 360) % 360 - 180;
  function pinY(c) { // высота поршневого пальца над осью коленвала
    const th = c * D2R;
    return R * Math.cos(th) + Math.sqrt(L * L - R * R * Math.sin(th) * Math.sin(th));
  }
  function volume(c) { const s = (R + L) - pinY(c); return VC + AREA * (s / 10); } // см³
  // подъём клапана по профилю кулачка: окно открытия 230° коленвала = 115° распредвала
  function camLift(c, open, close) {
    const mid = open + (close - open) / 2;
    const beta = wrap180((c - mid) / 2 + 0) ; // угол распредвала от вершины кулачка
    const half = (close - open) / 4;
    if (Math.abs(beta) >= half) return 0;
    const k = Math.cos(Math.PI / 2 * beta / half);
    return LIFT * k * k;
  }
  const liftIn = (c) => camLift(wrap720(c) < 200 ? wrap720(c) + 720 : wrap720(c), IVO, IVC);
  const liftEx = (c) => camLift(wrap720(c) > 500 ? wrap720(c) - 720 : wrap720(c), EVO, EVC);

  // давление в цилиндре (бар): политропы сжатия и расширения, горение по Вибе, выброс
  const PIVC = 0.95, NPOLY = 1.32, VIVC = volume(IVC);
  const pMot = (v) => PIVC * Math.pow(VIVC / v, NPOLY);
  function wiebe(c) {
    const phi = wrap720(c - IGN);
    if (phi > 360) return 0;
    const x = Math.min(1, phi / 45);
    return 1 - Math.exp(-5 * Math.pow(x, 3));
  }
  const BURN = 3.9; // во сколько раз теплота сгорания поднимает давление над политропой
  const PEVO = pMot(volume(EVO)) * (1 + BURN);
  function pressure(c) {
    c = wrap720(c);
    const v = volume(c);
    if (c >= IVC && c < IGN) return pMot(v);                              // сжатие
    if (c >= IGN || c < EVO) return pMot(v) * (1 + BURN * wiebe(c));       // горение и расширение
    if (c < 200) return 1.1 + (PEVO - 1.1) * Math.exp(-(c - EVO) / 11);    // свободный выпуск
    if (c < 355) return 1.1;                                               // выталкивание
    if (c < 375) return 1.1 + (0.93 - 1.1) * (c - 355) / 20;               // перекрытие клапанов
    return 0.93;                                                           // впуск
  }
  // работа за цикл: ∮ P dV (бар·см³ → Дж: × 0,1)
  let WORK = 0;
  for (let c = 0; c < 720; c += 0.5) WORK += pressure(c + 0.25) * (volume(c + 0.5) - volume(c));
  WORK *= 0.1;

  function strokeOf(c) {
    c = wrap720(c);
    if (c < 180) return 2;      // рабочий ход
    if (c < 360) return 3;      // выпуск
    if (c < 540) return 0;      // впуск
    return 1;                   // сжатие
  }
  // пики давления считаем из самой модели, чтобы текст не расходился с диаграммой
  let P_PEAK = 0, P_COMP = pMot(VC);
  for (let c = 0; c < 720; c += 0.5) P_PEAK = Math.max(P_PEAK, pressure(c));
  const round5 = (v) => Math.round(v / 5) * 5;
  const STROKES = [
    { name: 'Впуск', color: '#2f6fcf', text: `Поршень идёт вниз, впускной клапан открыт: цилиндр втягивает смесь воздуха и бензина — около ${(VD / 1000).toFixed(1).replace('.', ',')} литра за такт.` },
    { name: 'Сжатие', color: '#5b4fc4', text: `Оба клапана закрыты, поршень идёт вверх и сжимает смесь в ${CR} раз. Давление растёт примерно до ${Math.round(P_COMP)} бар, смесь нагревается.` },
    { name: 'Рабочий ход', color: '#e8661e', text: `Свеча поджигает смесь за 10° до верхней точки. Давление подскакивает примерно до ${round5(P_PEAK)} бар и гонит поршень вниз — только этот такт даёт работу.` },
    { name: 'Выпуск', color: '#8a7560', text: 'Выпускной клапан открывается ещё до нижней точки, поршень выталкивает газы. В конце оба клапана ненадолго открыты — это перекрытие.' },
  ];

  // ---------------------------------------------------------------- состояние
  let cyc = 360;           // угол цикла цилиндра 1
  let playing = !SHOT;
  let rpm = 60;            // «настоящие» обороты (для звука и подписи)
  let xray = 1;
  if (SHOT) cyc = 28; // обложка: сразу после зажигания — пламя заполняет цилиндр

  // ---------------------------------------------------------------- холст чертежа
  const sheet = $('#sheet');
  const mainCtx = sheet.getContext('2d');
  let g = mainCtx;
  let SW = 0, SH = 0, dpr = 1;
  let K = 1;               // пикселей на мм для разреза
  let OX = 0, OY = 0;      // экранное положение оси коленвала
  let sideBox = null, stampBox = null, frame = null;
  let showCallouts = true;
  let sideBottom = 0;
  const staticCanvas = document.createElement('canvas');
  let hatch = null;

  function makeHatch() {
    const c = document.createElement('canvas');
    const s = Math.round(7 * dpr);
    c.width = s; c.height = s;
    const x = c.getContext('2d');
    x.strokeStyle = 'rgba(29,32,37,0.55)';
    x.lineWidth = 1 * dpr;
    x.beginPath();
    x.moveTo(-1, s + 1); x.lineTo(s + 1, -1);
    x.moveTo(-1 - s, s + 1); x.lineTo(1, -1);
    x.moveTo(s - 1, s + 1); x.lineTo(s + s + 1, -1);
    x.stroke();
    return g.createPattern(c, 'repeat');
  }

  function layoutSheet() {
    const r = sheet.getBoundingClientRect();
    dpr = SHOT ? 1 : Math.min(2, window.devicePixelRatio || 1);
    SW = Math.round(r.width * dpr); SH = Math.round(r.height * dpr);
    sheet.width = SW; sheet.height = SH;
    hatch = makeHatch();
    const portrait = SH > SW * 0.95;
    // рамка: слева поле для подшивки шире (как на чертёжном листе)
    const m = 10 * dpr;
    frame = { x: m + 14 * dpr, y: m, w: SW - m * 2 - 14 * dpr, h: SH - m * 2 };
    showCallouts = !portrait;
    if (!portrait) {
      const labelW = 150 * dpr;
      K = Math.min((frame.h * 0.84) / 548, (frame.w * 0.7 - 2 * labelW) / 290);
      const secW = 290 * K + 2 * labelW;
      OX = frame.x + secW / 2 + 6 * dpr;
      OY = frame.y + frame.h / 2 + 122 * K;
      sideBox = { x: frame.x + secW + 14 * dpr, y: frame.y + 30 * dpr, w: frame.w - secW - 30 * dpr, h: frame.h * 0.52 };
      stampBox = { w: Math.min(frame.w - secW - 16 * dpr, 330 * dpr), h: 92 * dpr };
    } else {
      K = Math.min((frame.h * 0.6) / 548, (frame.w * 0.9) / 290);
      OX = frame.x + frame.w * 0.5;
      OY = frame.y + 24 * dpr + 395 * K;
      sideBox = { x: frame.x + 10 * dpr, y: frame.y + frame.h * 0.66, w: frame.w * 0.6, h: frame.h * 0.32 };
      stampBox = { w: Math.min(frame.w * 0.36, 220 * dpr), h: 84 * dpr };
    }
    stampBox.x = frame.x + frame.w - stampBox.w;
    stampBox.y = frame.y + frame.h - stampBox.h;
  }

  // мм (y вверх) → пиксели
  const X = (x) => OX + x * K;
  const Y = (y) => OY - y * K;

  function font(px, weight, fam) {
    return `${weight || 400} ${Math.round(px * dpr)}px ${fam || "'Oswald', 'Arial Narrow', sans-serif"}`;
  }

  // ---------------------------------------------------------------- детали
  function hatchedPath(pathFn, alpha) {
    g.save();
    g.beginPath(); pathFn();
    g.fillStyle = '#e7e0d2';
    g.globalAlpha = alpha;
    g.fill('evenodd');
    g.fillStyle = hatch;
    g.fill('evenodd');
    g.globalAlpha = Math.max(alpha, 0.35);
    g.lineWidth = 1.6 * dpr;
    g.strokeStyle = '#1d2025';
    g.stroke();
    g.restore();
  }

  function rectPath(x0, y0, x1, y1) { g.rect(X(x0), Y(y1), (x1 - x0) * K, (y1 - y0) * K); }
  function rrect(x0, y0, x1, y1, r) {
    const a = X(x0), b = Y(y1), w = (x1 - x0) * K, h = (y1 - y0) * K, rr = r * K;
    g.moveTo(a + rr, b); g.arcTo(a + w, b, a + w, b + h, rr); g.arcTo(a + w, b + h, a, b + h, rr);
    g.arcTo(a, b + h, a, b, rr); g.arcTo(a, b, a + w, b, rr); g.closePath();
  }

  // блок цилиндров и картер (в разрезе)
  function drawBlock() {
    const a = xray;
    hatchedPath(() => {
      // левая стенка блока с рубашкой охлаждения
      g.moveTo(X(-40), Y(DECK)); g.lineTo(X(-84), Y(DECK)); g.lineTo(X(-84), Y(78)); g.lineTo(X(-116), Y(28)); g.lineTo(X(-122), Y(-58));
      g.lineTo(X(-102), Y(-58)); g.lineTo(X(-98), Y(22)); g.lineTo(X(-60), Y(70)); g.lineTo(X(-40), Y(70)); g.closePath();
      g.moveTo(X(-50), Y(204)); g.lineTo(X(-50), Y(112)); g.lineTo(X(-70), Y(112)); g.lineTo(X(-70), Y(204)); g.closePath();
      // правая
      g.moveTo(X(40), Y(DECK)); g.lineTo(X(84), Y(DECK)); g.lineTo(X(84), Y(78)); g.lineTo(X(116), Y(28)); g.lineTo(X(122), Y(-58));
      g.lineTo(X(102), Y(-58)); g.lineTo(X(98), Y(22)); g.lineTo(X(60), Y(70)); g.lineTo(X(40), Y(70)); g.closePath();
      g.moveTo(X(50), Y(204)); g.lineTo(X(50), Y(112)); g.lineTo(X(70), Y(112)); g.lineTo(X(70), Y(204)); g.closePath();
    }, a);
    // вода в рубашке
    g.save();
    g.globalAlpha = 0.28 * a + 0.08;
    g.fillStyle = '#7fb2d9';
    g.fillRect(X(-70), Y(204), 20 * K, 92 * K);
    g.fillRect(X(50), Y(204), 20 * K, 92 * K);
    g.restore();
    // гильза цилиндра — тонкая линия
    g.strokeStyle = '#1d2025';
    g.lineWidth = 1 * dpr;
    g.beginPath(); g.moveTo(X(-43), Y(DECK)); g.lineTo(X(-43), Y(74)); g.moveTo(X(43), Y(DECK)); g.lineTo(X(43), Y(74)); g.stroke();
    // поддон с маслом (листовой металл — без штриховки)
    g.lineWidth = 1.6 * dpr;
    g.beginPath();
    g.moveTo(X(-122), Y(-58)); g.lineTo(X(-112), Y(-150)); g.lineTo(X(112), Y(-150)); g.lineTo(X(122), Y(-58));
    g.moveTo(X(-117), Y(-58)); g.lineTo(X(-107.5), Y(-145)); g.lineTo(X(107.5), Y(-145)); g.lineTo(X(117), Y(-58));
    g.stroke();
    g.save();
    g.beginPath();
    g.moveTo(X(-110.6), Y(-118));
    for (let x = -110; x <= 110; x += 4) g.lineTo(X(x), Y(-118 + Math.sin(x * 0.12) * 1.2));
    g.lineTo(X(107.5), Y(-145)); g.lineTo(X(-107.5), Y(-145)); g.closePath();
    g.fillStyle = 'rgba(201,146,52,0.35)';
    g.fill();
    g.restore();
  }

  // головка блока с каналами, камерой, направляющими клапанов
  const PORT_IN = [[-24, DECK + 16], [-40, DECK + 42], [-80, DECK + 56], [-126, DECK + 62]];
  const PORT_EX = [[24, DECK + 16], [40, DECK + 42], [80, DECK + 56], [126, DECK + 62]];
  const CAM_IN = [-50, DECK + 118], CAM_EX = [50, DECK + 118];
  const SEAT_IN = [-21, DECK + 12], SEAT_EX = [21, DECK + 12];
  const axisOf = (seat, cam) => { const dx = cam[0] - seat[0], dy = cam[1] - seat[1], l = Math.hypot(dx, dy); return [dx / l, dy / l, l]; };
  const AX_IN = axisOf(SEAT_IN, CAM_IN), AX_EX = axisOf(SEAT_EX, CAM_EX);
  const CAM_RB = 15;

  function drawHead() {
    const a = xray;
    // тело головки: штриховка минус каналы
    const off = document.createElement('canvas');
    off.width = SW; off.height = SH;
    const o = off.getContext('2d');
    const save = g;
    // рисуем штрихованный силуэт на отдельном слое, затем вырезаем каналы
    o.fillStyle = '#e7e0d2';
    o.globalAlpha = a;
    const headPath = (ctx) => {
      ctx.beginPath();
      ctx.moveTo(X(-126), Y(DECK)); ctx.lineTo(X(126), Y(DECK)); ctx.lineTo(X(126), Y(DECK + 98));
      ctx.lineTo(X(96), Y(DECK + 98)); ctx.lineTo(X(96), Y(DECK + 102)); ctx.lineTo(X(-96), Y(DECK + 102)); ctx.lineTo(X(-96), Y(DECK + 98));
      ctx.lineTo(X(-126), Y(DECK + 98)); ctx.closePath();
    };
    headPath(o); o.fill();
    o.globalAlpha = Math.max(a, 0.2);
    o.fillStyle = hatchFor(o);
    headPath(o); o.fill();
    o.globalAlpha = 1;
    o.globalCompositeOperation = 'destination-out';
    o.lineCap = 'round'; o.lineJoin = 'round';
    const port = (pts, w) => {
      o.lineWidth = w * K;
      o.beginPath(); o.moveTo(X(pts[0][0]), Y(pts[0][1]));
      o.bezierCurveTo(X(pts[1][0]), Y(pts[1][1]), X(pts[2][0]), Y(pts[2][1]), X(pts[3][0]), Y(pts[3][1]));
      o.stroke();
    };
    port(PORT_IN, 27); port(PORT_EX, 25);
    // камера сгорания (шатёр)
    o.beginPath(); o.moveTo(X(-40), Y(DECK - 1)); o.lineTo(X(-30), Y(DECK + 14)); o.lineTo(X(30), Y(DECK + 14)); o.lineTo(X(40), Y(DECK - 1)); o.closePath(); o.fill();
    // направляющие клапанов и колодец свечи
    const guide = (seat, ax) => {
      o.lineWidth = 9 * K; o.lineCap = 'butt';
      o.beginPath(); o.moveTo(X(seat[0] + ax[0] * 20), Y(seat[1] + ax[1] * 20)); o.lineTo(X(seat[0] + ax[0] * 110), Y(seat[1] + ax[1] * 110)); o.stroke();
      o.lineWidth = 30 * K;
      o.beginPath(); o.moveTo(X(seat[0] + ax[0] * 62), Y(seat[1] + ax[1] * 62)); o.lineTo(X(seat[0] + ax[0] * 110), Y(seat[1] + ax[1] * 110)); o.stroke();
    };
    guide(SEAT_IN, AX_IN); guide(SEAT_EX, AX_EX);
    o.lineWidth = 17 * K;
    o.beginPath(); o.moveTo(X(0), Y(DECK + 10)); o.lineTo(X(0), Y(DECK + 104)); o.stroke();
    // рубашка головки
    o.lineWidth = 11 * K;
    o.beginPath(); o.moveTo(X(-108), Y(DECK + 12)); o.lineTo(X(-108), Y(DECK + 40)); o.moveTo(X(108), Y(DECK + 12)); o.lineTo(X(108), Y(DECK + 40)); o.stroke();
    g.drawImage(off, 0, 0);
    void save;
    // контуры каналов
    g.strokeStyle = '#1d2025';
    g.lineWidth = 1.4 * dpr;
    const outline = (pts, w) => {
      for (const sgn of [-1, 1]) {
        g.beginPath();
        for (let i = 0; i <= 24; i++) {
          const t = i / 24;
          const p = bez(pts, t), d = bezD(pts, t);
          const l = Math.hypot(d[0], d[1]) || 1;
          const nx = -d[1] / l, ny = d[0] / l;
          const x = p[0] + nx * w / 2 * sgn, y = p[1] + ny * w / 2 * sgn;
          i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y));
        }
        g.stroke();
      }
    };
    outline(PORT_IN, 27); outline(PORT_EX, 25);
    g.beginPath(); g.moveTo(X(-40), Y(DECK)); g.lineTo(X(-30), Y(DECK + 14)); g.lineTo(X(30), Y(DECK + 14)); g.lineTo(X(40), Y(DECK)); g.stroke();
    // вода в рубашке головки
    g.fillStyle = 'rgba(127,178,217,0.3)';
    g.fillRect(X(-113.5), Y(DECK + 40), 11 * K, 28 * K);
    g.fillRect(X(102.5), Y(DECK + 40), 11 * K, 28 * K);
    // крышка распредвалов
    g.strokeStyle = '#1d2025';
    g.lineWidth = 1.6 * dpr;
    g.beginPath();
    g.moveTo(X(-96), Y(DECK + 102));
    g.bezierCurveTo(X(-100), Y(DECK + 150), X(-70), Y(DECK + 152), X(0), Y(DECK + 152));
    g.bezierCurveTo(X(70), Y(DECK + 152), X(100), Y(DECK + 150), X(96), Y(DECK + 102));
    g.stroke();
  }
  function hatchFor(ctx) { return ctx.createPattern(hatch && hatch._c ? hatch._c : makeHatchCanvas(), 'repeat'); }
  let hatchCanvas = null;
  function makeHatchCanvas() {
    if (hatchCanvas && hatchCanvas._dpr === dpr) return hatchCanvas;
    const c = document.createElement('canvas');
    const s = Math.round(7 * dpr);
    c.width = s; c.height = s;
    const x = c.getContext('2d');
    x.strokeStyle = 'rgba(29,32,37,0.55)';
    x.lineWidth = 1 * dpr;
    x.beginPath();
    x.moveTo(-1, s + 1); x.lineTo(s + 1, -1);
    x.moveTo(-1 - s, s + 1); x.lineTo(1, -1);
    x.moveTo(s - 1, s + 1); x.lineTo(s + s + 1, -1);
    x.stroke();
    c._dpr = dpr;
    hatchCanvas = c;
    return c;
  }
  function bez(p, t) {
    const u = 1 - t;
    return [u * u * u * p[0][0] + 3 * u * u * t * p[1][0] + 3 * u * t * t * p[2][0] + t * t * t * p[3][0],
      u * u * u * p[0][1] + 3 * u * u * t * p[1][1] + 3 * u * t * t * p[2][1] + t * t * t * p[3][1]];
  }
  function bezD(p, t) {
    const u = 1 - t;
    return [3 * u * u * (p[1][0] - p[0][0]) + 6 * u * t * (p[2][0] - p[1][0]) + 3 * t * t * (p[3][0] - p[2][0]),
      3 * u * u * (p[1][1] - p[0][1]) + 6 * u * t * (p[2][1] - p[1][1]) + 3 * t * t * (p[3][1] - p[2][1])];
  }

  // ---------------------------------------------------------------- газ в цилиндре
  function gasStyle(c) {
    c = wrap720(c);
    const st = strokeOf(c);
    if (st === 0) return { col: [47, 111, 207], a: 0.28 + 0.2 * Math.min(1, (c - 360) / 90) };
    if (st === 1) { const k = (c - 540) / 180; return { col: [91 - k * 10, 79, 196 - k * 20], a: 0.38 + 0.32 * k }; }
    if (st === 2) {
      const k = c / 180;
      const hot = Math.max(0, 1 - k * 1.3);
      return { col: [232, 102 + hot * 90, 30 + hot * 40], a: 0.85 - k * 0.45, hot };
    }
    return { col: [138, 117, 96], a: 0.45 - (c - 180) / 180 * 0.25 };
  }

  function drawGas(c) {
    const top = pinY(c) + CH;
    const gs = gasStyle(c);
    const [r0, g0, b0] = gs.col;
    g.save();
    g.beginPath();
    g.moveTo(X(-40), Y(top)); g.lineTo(X(-40), Y(DECK)); g.lineTo(X(-30), Y(DECK + 14)); g.lineTo(X(30), Y(DECK + 14)); g.lineTo(X(40), Y(DECK)); g.lineTo(X(40), Y(top)); g.closePath();
    g.fillStyle = `rgba(${r0 | 0},${g0 | 0},${b0 | 0},${gs.a.toFixed(3)})`;
    g.fill();
    g.clip();
    // фронт пламени от свечи
    const phi = wrap720(c - IGN);
    if (phi < 70) {
      const rr = Math.min(1, phi / 42) * 120;
      const grad = g.createRadialGradient(X(0), Y(DECK + 12), 0, X(0), Y(DECK + 12), rr * K + 1);
      grad.addColorStop(0, 'rgba(255,244,190,0.95)');
      grad.addColorStop(0.55, 'rgba(255,170,60,0.75)');
      grad.addColorStop(1, 'rgba(232,102,30,0)');
      g.fillStyle = grad;
      g.fillRect(X(-45), Y(DECK + 20), 90 * K, (DECK + 20 - top + 5) * K);
    }
    g.restore();
  }

  // частицы во впускном и выпускном каналах
  const particles = [];
  for (let i = 0; i < 70; i++) particles.push({ port: i % 2, t: Math.random(), off: (Math.random() - 0.5) * 16, sp: 0.6 + Math.random() * 0.8 });
  function drawParticles(c, dt) {
    const li = liftIn(c), le = liftEx(c);
    for (const p of particles) {
      const open = p.port === 0 ? li : le;
      const f = open / LIFT;
      p.t += dt * p.sp * (0.15 + f * 1.4) * speedFactor();
      if (p.t > 1) { p.t -= 1; p.off = (Math.random() - 0.5) * 16; }
      if (f < 0.04) continue;
      // впуск: из коллектора к клапану; выпуск: от клапана наружу
      const pts = p.port === 0 ? PORT_IN : PORT_EX;
      const t = p.port === 0 ? 1 - p.t : p.t;
      const q = bez(pts, t), d = bezD(pts, t);
      const l = Math.hypot(d[0], d[1]) || 1;
      const x = q[0] - d[1] / l * p.off, y = q[1] + d[0] / l * p.off;
      g.fillStyle = p.port === 0 ? `rgba(47,111,207,${(0.35 + 0.55 * f).toFixed(3)})` : `rgba(120,98,76,${(0.35 + 0.5 * f).toFixed(3)})`;
      g.beginPath(); g.arc(X(x), Y(y), (1.6 + f * 1.4) * K, 0, Math.PI * 2); g.fill();
    }
  }
  function speedFactor() { return playing ? 1 : 0; }

  // поршень, шатун, коленвал
  function drawMoving(c) {
    const th = c * D2R;
    const py = pinY(c);
    const px = R * Math.sin(th), pcy = R * Math.cos(th);
    // противовес и щека
    g.save();
    g.fillStyle = '#b9bec5';
    g.strokeStyle = '#1d2025';
    g.lineWidth = 1.6 * dpr;
    g.beginPath();
    g.moveTo(X(0), Y(0));
    // в координатах холста (y вниз) направление на шейку — угол th − π/2, противовес напротив: th + π/2
    g.arc(X(0), Y(0), 66 * K, th + Math.PI / 2 - 0.95, th + Math.PI / 2 + 0.95);
    g.closePath();
    g.fill(); g.stroke();
    // щека к шатунной шейке
    g.beginPath();
    const ux = Math.sin(th), uy = Math.cos(th), nx = uy, ny = -ux;
    g.moveTo(X(nx * 24), Y(ny * 24)); g.lineTo(X(px + nx * 21), Y(pcy + ny * 21));
    g.lineTo(X(px - nx * 21), Y(pcy - ny * 21)); g.lineTo(X(-nx * 24), Y(-ny * 24)); g.closePath();
    g.fill(); g.stroke();
    // коренная шейка
    g.fillStyle = '#d6d9dd';
    g.beginPath(); g.arc(X(0), Y(0), 22 * K, 0, Math.PI * 2); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(X(-5), Y(0)); g.lineTo(X(5), Y(0)); g.moveTo(X(0), Y(-5)); g.lineTo(X(0), Y(5)); g.stroke();
    g.restore();

    // шатун
    g.save();
    g.fillStyle = '#c8cdd3';
    g.strokeStyle = '#1d2025';
    g.lineWidth = 1.6 * dpr;
    const dx = 0 - px, dy = py - pcy, dl = Math.hypot(dx, dy);
    const ax = dx / dl, ay = dy / dl, bx = -ay, by = ax;
    g.beginPath();
    g.moveTo(X(px + bx * 13), Y(pcy + by * 13));
    g.lineTo(X(0 + bx * 8), Y(py + by * 8));
    g.lineTo(X(0 - bx * 8), Y(py - by * 8));
    g.lineTo(X(px - bx * 13), Y(pcy - by * 13));
    g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.arc(X(px), Y(pcy), 21 * K, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#e3e6e9';
    g.beginPath(); g.arc(X(px), Y(pcy), 14 * K, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#c8cdd3';
    g.beginPath(); g.arc(X(0), Y(py), 13 * K, 0, Math.PI * 2); g.fill(); g.stroke();
    g.restore();

    // поршень (в разрезе: стенки и днище, палец)
    g.save();
    g.fillStyle = '#dadde1';
    g.strokeStyle = '#1d2025';
    g.lineWidth = 1.6 * dpr;
    const top = py + CH, bot = py - SKIRT;
    g.beginPath();
    g.moveTo(X(-39), Y(top)); g.lineTo(X(39), Y(top)); g.lineTo(X(39), Y(bot)); g.lineTo(X(31), Y(bot));
    g.lineTo(X(31), Y(py + 14)); g.lineTo(X(-31), Y(py + 14)); g.lineTo(X(-31), Y(bot)); g.lineTo(X(-39), Y(bot)); g.closePath();
    g.fill(); g.stroke();
    // канавки колец
    g.lineWidth = 1.2 * dpr;
    for (const k of [6, 11, 16]) { g.beginPath(); g.moveTo(X(-39), Y(top - k)); g.lineTo(X(-35), Y(top - k)); g.moveTo(X(39), Y(top - k)); g.lineTo(X(35), Y(top - k)); g.stroke(); }
    g.fillStyle = '#9aa1a9';
    g.beginPath(); g.arc(X(0), Y(py), 8.5 * K, 0, Math.PI * 2); g.fill(); g.stroke();
    g.restore();
  }

  // клапаны, пружины, толкатели, кулачки
  function drawValvetrain(c) {
    const vt = (seat, ax, lift, camC, camAngle, open, close) => {
      const [ux, uy] = ax;
      const hx = seat[0] - ux * lift, hy = seat[1] - uy * lift;
      const nx = -uy, ny = ux;
      g.save();
      g.strokeStyle = '#1d2025';
      g.lineWidth = 1.5 * dpr;
      // тарелка клапана
      g.fillStyle = '#c3c8ce';
      g.beginPath();
      g.moveTo(X(hx + nx * 15), Y(hy + ny * 15));
      g.lineTo(X(hx + nx * 15 + ux * 3), Y(hy + ny * 15 + uy * 3));
      g.lineTo(X(hx + nx * 3.5 + ux * 12), Y(hy + ny * 3.5 + uy * 12));
      g.lineTo(X(hx - nx * 3.5 + ux * 12), Y(hy - ny * 3.5 + uy * 12));
      g.lineTo(X(hx - nx * 15 + ux * 3), Y(hy - ny * 15 + uy * 3));
      g.lineTo(X(hx - nx * 15), Y(hy - ny * 15));
      g.closePath(); g.fill(); g.stroke();
      // стержень
      const stemTop = ax[2] - CAM_RB - 14 - lift;
      g.fillStyle = '#d4d8dc';
      g.beginPath();
      g.moveTo(X(hx + nx * 3.5 + ux * 12), Y(hy + ny * 3.5 + uy * 12));
      g.lineTo(X(seat[0] + ux * stemTop + nx * 3.5), Y(seat[1] + uy * stemTop + ny * 3.5));
      g.lineTo(X(seat[0] + ux * stemTop - nx * 3.5), Y(seat[1] + uy * stemTop - ny * 3.5));
      g.lineTo(X(hx - nx * 3.5 + ux * 12), Y(hy - ny * 3.5 + uy * 12));
      g.closePath(); g.fill(); g.stroke();
      // пружина между опорой в головке и тарелкой-фиксатором
      const s0 = 64, s1 = stemTop - 4;
      g.lineWidth = 1.4 * dpr;
      g.beginPath();
      const coils = 7;
      for (let i = 0; i <= coils * 2; i++) {
        const t = i / (coils * 2);
        const s = s0 + (s1 - s0) * t;
        const w = (i % 2 ? 11 : -11);
        const x = seat[0] + ux * s + nx * w, y = seat[1] + uy * s + ny * w;
        i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y));
      }
      g.stroke();
      // тарелка пружины
      g.lineWidth = 2.2 * dpr;
      g.beginPath(); g.moveTo(X(seat[0] + ux * s1 + nx * 13), Y(seat[1] + uy * s1 + ny * 13)); g.lineTo(X(seat[0] + ux * s1 - nx * 13), Y(seat[1] + uy * s1 - ny * 13)); g.stroke();
      // толкатель-стакан
      g.lineWidth = 1.5 * dpr;
      g.fillStyle = '#b3b9c0';
      const b0 = stemTop, b1 = stemTop + 14;
      g.beginPath();
      g.moveTo(X(seat[0] + ux * b0 + nx * 14), Y(seat[1] + uy * b0 + ny * 14));
      g.lineTo(X(seat[0] + ux * b1 + nx * 14), Y(seat[1] + uy * b1 + ny * 14));
      g.lineTo(X(seat[0] + ux * b1 - nx * 14), Y(seat[1] + uy * b1 - ny * 14));
      g.lineTo(X(seat[0] + ux * b0 - nx * 14), Y(seat[1] + uy * b0 - ny * 14));
      g.closePath(); g.fill(); g.stroke();
      // кулачок: профиль совпадает с законом подъёма
      g.fillStyle = '#9aa1a9';
      g.beginPath();
      const half = (close - open) / 4;
      for (let i = 0; i <= 72; i++) {
        const beta = -180 + i * 5;                  // угол от вершины кулачка, градусы распредвала
        const k = Math.abs(beta) < half ? Math.cos(Math.PI / 2 * beta / half) : 0;
        const rr = CAM_RB + LIFT * k * k;
        // направление вершины: −ось клапана, повёрнутая на угол распредвала
        const dirA = Math.atan2(-uy, -ux) + (beta + camAngle) * D2R;
        const x = camC[0] + Math.cos(dirA) * rr, y = camC[1] + Math.sin(dirA) * rr;
        i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y));
      }
      g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#e1e4e7';
      g.beginPath(); g.arc(X(camC[0]), Y(camC[1]), 6 * K, 0, Math.PI * 2); g.fill(); g.stroke();
      g.restore();
    };
    const cw = wrap720(c);
    // угол распредвала относительно вершины кулачка: (c − середина окна) / 2, со знаком вращения
    const midIn = (IVO + IVC) / 2, midEx = (EVO + EVC) / 2;
    const camIn = -wrap180((cw - midIn) / 2), camEx = -wrap180((cw - midEx) / 2);
    vt(SEAT_IN, AX_IN, liftIn(c), CAM_IN, camIn, IVO, IVC);
    vt(SEAT_EX, AX_EX, liftEx(c), CAM_EX, camEx, EVO, EVC);
  }

  function drawSparkPlug(c) {
    g.save();
    g.strokeStyle = '#1d2025';
    g.lineWidth = 1.5 * dpr;
    // изолятор и корпус
    g.fillStyle = '#f7f3ea';
    g.beginPath(); g.rect(X(-6), Y(DECK + 140), 12 * K, 50 * K); g.fill(); g.stroke();
    g.fillStyle = '#b3b9c0';
    g.beginPath();
    g.moveTo(X(-11), Y(DECK + 90)); g.lineTo(X(11), Y(DECK + 90)); g.lineTo(X(11), Y(DECK + 76)); g.lineTo(X(-11), Y(DECK + 76)); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#c8cdd3';
    g.beginPath(); g.rect(X(-7.5), Y(DECK + 76), 15 * K, 58 * K); g.fill(); g.stroke();
    g.lineWidth = 1 * dpr;
    for (let y = DECK + 24; y < DECK + 70; y += 5) { g.beginPath(); g.moveTo(X(-7.5), Y(y)); g.lineTo(X(7.5), Y(y + 2)); g.stroke(); }
    // электроды
    g.lineWidth = 2 * dpr;
    g.beginPath(); g.moveTo(X(0), Y(DECK + 18)); g.lineTo(X(0), Y(DECK + 14.5)); g.moveTo(X(-5), Y(DECK + 18)); g.lineTo(X(-5), Y(DECK + 11)); g.lineTo(X(1), Y(DECK + 11)); g.stroke();
    // искра
    const phi = wrap720(c - IGN + 4);
    if (phi < 10) {
      const a = 1 - phi / 10;
      g.strokeStyle = `rgba(255,255,255,${a})`;
      g.lineWidth = 2.4 * dpr;
      g.beginPath(); g.moveTo(X(0), Y(DECK + 14.5)); g.lineTo(X(-2), Y(DECK + 13)); g.lineTo(X(1), Y(DECK + 12.2)); g.stroke();
      const grad = g.createRadialGradient(X(0), Y(DECK + 13), 0, X(0), Y(DECK + 13), 22 * K);
      grad.addColorStop(0, `rgba(190,220,255,${0.9 * a})`);
      grad.addColorStop(1, 'rgba(190,220,255,0)');
      g.fillStyle = grad;
      g.beginPath(); g.arc(X(0), Y(DECK + 13), 22 * K, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  }

  // ---------------------------------------------------------------- выноски
  function callouts(c) {
    const py = pinY(c);
    const th = c * D2R;
    const items = [
      { t: 'Впускной распредвал', p: [CAM_IN[0], CAM_IN[1]], side: -1, y: DECK + 150 },
      { t: 'Впускной клапан', p: [SEAT_IN[0] + AX_IN[0] * 40, SEAT_IN[1] + AX_IN[1] * 40], side: -1, y: DECK + 112 },
      { t: 'Впускной канал', p: [PORT_IN[2][0], PORT_IN[2][1] + 4], side: -1, y: DECK + 74 },
      { t: 'Рубашка охлаждения', p: [-60, 160], side: -1, y: 176 },
      { t: 'Поршень', p: [-24, py + 20], side: -1, y: 128 },
      { t: 'Шатун', p: [R * Math.sin(th) * 0.5, (R * Math.cos(th) + py) * 0.5], side: -1, y: 58 },
      { t: 'Противовес', p: [Math.sin(th + Math.PI) * 48, Math.cos(th + Math.PI) * 48], side: -1, y: -40 },
      { t: 'Выпускной распредвал', p: [CAM_EX[0], CAM_EX[1]], side: 1, y: DECK + 150 },
      { t: 'Свеча зажигания', p: [4, DECK + 60], side: 1, y: DECK + 112 },
      { t: 'Выпускной канал', p: [PORT_EX[2][0], PORT_EX[2][1] + 4], side: 1, y: DECK + 74 },
      { t: 'Камера сгорания', p: [14, DECK + 6], side: 1, y: 176 },
      { t: 'Коленчатый вал', p: [0, 0], side: 1, y: 40 },
      { t: 'Поддон с маслом', p: [70, -128], side: 1, y: -100 },
    ];
    g.save();
    g.font = font(13, 400);
    g.fillStyle = '#1d2025';
    g.strokeStyle = 'rgba(29,32,37,0.8)';
    g.lineWidth = 0.9 * dpr;
    const edgeL = X(-140), edgeR = X(140);
    for (const it of items) {
      const lx = it.side < 0 ? edgeL : edgeR;
      const ly = Y(it.y);
      g.beginPath();
      g.moveTo(X(it.p[0]), Y(it.p[1]));
      g.lineTo(lx, ly);
      g.lineTo(lx + it.side * 10 * dpr, ly);
      g.stroke();
      g.beginPath(); g.arc(X(it.p[0]), Y(it.p[1]), 2.2 * dpr, 0, Math.PI * 2); g.fill();
      g.textAlign = it.side < 0 ? 'right' : 'left';
      g.textBaseline = 'middle';
      g.fillText(it.t, lx + it.side * 14 * dpr, ly);
    }
    g.restore();
  }

  // ---------------------------------------------------------------- вид Б: четыре цилиндра
  function drawSideView(c) {
    const b = sideBox;
    g.save();
    g.fillStyle = '#1d2025';
    g.font = font(15, 500);
    g.textBaseline = 'alphabetic';
    g.textAlign = 'left';
    g.fillText('ВИД Б', b.x, b.y + 4 * dpr);
    g.font = font(13, 400, "'IBM Plex Sans', sans-serif");
    g.fillStyle = '#454a52';
    g.fillText('Порядок работы: 1 — 3 — 4 — 2', b.x, b.y + 24 * dpr);
    const n = 4;
    const cw = Math.min(b.w / (n + 0.3), 100 * dpr);
    const sx = b.x + (b.w - cw * n) / 2 + cw * 0.08;
    const s = cw / 104;                                    // масштаб: 104 мм на цилиндр
    const baseY = b.y + 84 * dpr + (DECK - 60 + 26) * s;
    sideBottom = baseY + 24 * dpr;
    const deckY = baseY - (DECK - 60) * s;
    for (let i = 0; i < n; i++) {
      const ci = wrap720(c - FIRING[i]);
      const x0 = sx + i * cw;
      const cx = x0 + cw * 0.42;
      const pinH = pinY(ci);
      const topY = baseY - (pinH + CH - 60) * s; // та же шкала: y_мм − 60
      const gs = gasStyle(ci);
      // стенки
      g.strokeStyle = '#1d2025';
      g.lineWidth = 1.3 * dpr;
      g.fillStyle = `rgba(${gs.col[0] | 0},${gs.col[1] | 0},${gs.col[2] | 0},${gs.a.toFixed(3)})`;
      g.fillRect(cx - 40 * s, deckY, 80 * s, topY - deckY);
      g.beginPath(); g.moveTo(cx - 44 * s, deckY - 8 * s); g.lineTo(cx - 44 * s, baseY - 10 * s); g.moveTo(cx + 44 * s, deckY - 8 * s); g.lineTo(cx + 44 * s, baseY - 10 * s); g.stroke();
      g.beginPath(); g.moveTo(cx - 44 * s, deckY); g.lineTo(cx + 44 * s, deckY); g.stroke();
      // поршень
      g.fillStyle = '#dadde1';
      g.fillRect(cx - 38 * s, topY, 76 * s, 44 * s);
      g.strokeRect(cx - 38 * s, topY, 76 * s, 44 * s);
      // клапаны: заполненный треугольник = открыт
      const li = liftIn(ci) / LIFT, le = liftEx(ci) / LIFT;
      const tri = (x, open, col) => {
        g.fillStyle = open > 0.05 ? col : 'transparent';
        g.strokeStyle = '#1d2025';
        g.beginPath(); g.moveTo(x - 7 * s * 1.4, deckY - 14 * s - open * 8 * s); g.lineTo(x + 7 * s * 1.4, deckY - 14 * s - open * 8 * s); g.lineTo(x, deckY - 4 * s - open * 8 * s); g.closePath();
        g.fill(); g.stroke();
      };
      tri(cx - 20 * s, li, '#2f6fcf');
      tri(cx + 20 * s, le, '#8a7560');
      // искра
      const phi = wrap720(ci - IGN + 4);
      if (phi < 16) {
        g.fillStyle = `rgba(232,102,30,${(1 - phi / 16).toFixed(3)})`;
        g.beginPath(); g.arc(cx, deckY + 6 * s, (8 + phi) * s, 0, Math.PI * 2); g.fill();
      }
      // номер цилиндра
      g.fillStyle = '#1d2025';
      g.font = font(15, 600);
      g.textAlign = 'center';
      g.fillText(String(i + 1), cx, baseY + 14 * dpr);
    }
    // легенда тактов цветом газа
    g.font = font(12, 400, "'IBM Plex Sans', sans-serif");
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    let lx = b.x, ly = b.y + 44 * dpr;
    STROKES.forEach((st) => {
      const w = g.measureText(st.name).width;
      if (lx + 16 * dpr + w > b.x + b.w) { lx = b.x; ly += 18 * dpr; }
      g.fillStyle = st.color;
      g.fillRect(lx, ly - 5 * dpr, 10 * dpr, 10 * dpr);
      g.fillStyle = '#454a52';
      g.fillText(st.name, lx + 14 * dpr, ly);
      lx += 14 * dpr + w + 14 * dpr;
    });
    g.restore();
  }

  // ---------------------------------------------------------------- технические характеристики (как на листе)
  function drawSpecs() {
    const b = sideBox;
    const top = sideBottom + 26 * dpr;
    const bottom = stampBox.y - 18 * dpr;
    const rows = [
      ['Число цилиндров', '4, в ряд'],
      ['Диаметр × ход', '80 × 80 мм'],
      ['Рабочий объём', `${(VD * 4 / 1000).toFixed(2).replace('.', ',')} л`],
      ['Степень сжатия', String(CR)],
      ['Порядок работы', '1 — 3 — 4 — 2'],
      ['Впуск', '10° до ВМТ … 40° после НМТ'],
      ['Выпуск', '40° до НМТ … 10° после ВМТ'],
      ['Зажигание', '10° до ВМТ'],
    ];
    const rowH = Math.min(24 * dpr, (bottom - top - 26 * dpr) / rows.length);
    if (rowH < 15 * dpr) return;
    g.save();
    g.fillStyle = '#1d2025';
    g.font = font(15, 500);
    g.textBaseline = 'alphabetic';
    g.textAlign = 'left';
    g.fillText('ТЕХНИЧЕСКАЯ ХАРАКТЕРИСТИКА', b.x, top);
    g.strokeStyle = 'rgba(29,32,37,0.35)';
    g.lineWidth = 1 * dpr;
    g.font = font(13, 400, "'IBM Plex Sans', sans-serif");
    g.textBaseline = 'middle';
    rows.forEach(([k, v], i) => {
      const y = top + 14 * dpr + rowH * (i + 0.5);
      g.fillStyle = '#454a52';
      g.textAlign = 'left';
      g.fillText(k, b.x, y);
      g.fillStyle = '#1d2025';
      g.textAlign = 'right';
      g.fillText(v, b.x + b.w, y);
      g.beginPath(); g.moveTo(b.x, y + rowH / 2); g.lineTo(b.x + b.w, y + rowH / 2); g.stroke();
    });
    g.restore();
  }

  // ---------------------------------------------------------------- рамка и основная надпись
  function drawFrame() {
    g.save();
    g.strokeStyle = '#1d2025';
    g.lineWidth = 2 * dpr;
    g.strokeRect(frame.x, frame.y, frame.w, frame.h);
    // основная надпись
    const s = stampBox;
    if (!showCallouts) {
      // на узком листе вместо штампа — одна строка
      g.fillStyle = '#1d2025';
      g.font = font(12, 400);
      g.textAlign = 'right';
      g.textBaseline = 'alphabetic';
      g.fillText('Двигатель Р4 · лист 1 · опыт 010', frame.x + frame.w - 8 * dpr, frame.y + frame.h - 8 * dpr);
      g.restore();
    } else {
      g.lineWidth = 1.6 * dpr;
      g.fillStyle = 'rgba(247,243,234,0.9)';
      g.fillRect(s.x, s.y, s.w, s.h);
      g.strokeRect(s.x, s.y, s.w, s.h);
      const c1 = s.x + s.w * 0.44, cv = s.x + s.w * 0.2;
      g.lineWidth = 1 * dpr;
      g.beginPath();
      g.moveTo(c1, s.y); g.lineTo(c1, s.y + s.h);
      g.moveTo(cv, s.y); g.lineTo(cv, s.y + s.h);
      for (const k of [0.25, 0.5, 0.75]) { g.moveTo(s.x, s.y + s.h * k); g.lineTo(c1, s.y + s.h * k); }
      g.moveTo(c1, s.y + s.h * 0.64); g.lineTo(s.x + s.w, s.y + s.h * 0.64);
      g.moveTo(c1 + (s.x + s.w - c1) * 0.5, s.y + s.h * 0.64); g.lineTo(c1 + (s.x + s.w - c1) * 0.5, s.y + s.h);
      g.stroke();
      g.fillStyle = '#1d2025';
      g.textBaseline = 'middle';
      g.textAlign = 'left';
      g.font = font(12, 400);
      const rowH = s.h * 0.25;
      const cells = [['Разраб.', 'Opus 5.5'], ['Пров.', 'скриншоты'], ['Т. контр.', 'решатель'], ['Утв.', '—']];
      cells.forEach(([a, b], i) => {
        g.fillText(a, s.x + 5 * dpr, s.y + rowH * (i + 0.5));
        g.fillText(b, cv + 5 * dpr, s.y + rowH * (i + 0.5));
      });
      const mid = c1 + (s.x + s.w - c1) / 2;
      g.textAlign = 'center';
      g.font = font(17, 500);
      g.fillText('Двигатель Р4', mid, s.y + s.h * 0.22);
      g.font = font(12, 400);
      g.fillText('Разрез А–А · Вид Б', mid, s.y + s.h * 0.46);
      g.fillText('Масштаб 1:2', c1 + (s.x + s.w - c1) * 0.25, s.y + s.h * 0.82);
      g.fillText('Лист 1', c1 + (s.x + s.w - c1) * 0.75, s.y + s.h * 0.82);
      g.restore();
    }
    // подпись разреза
    g.save();
    g.fillStyle = '#1d2025';
    g.font = font(17, 500);
    g.textAlign = 'center';
    g.fillText('А–А', X(0), Y(DECK + 172));
    g.restore();
  }

  // ---------------------------------------------------------------- диаграммы
  const pv = $('#pv'), tm = $('#timing');
  const pvx = pv.getContext('2d'), tmx = tm.getContext('2d');
  let pvW = 0, pvH = 0, tmW = 0, tmH = 0, cdpr = 1;
  const PV_PTS = [];
  for (let c = 0; c < 720; c += 2) PV_PTS.push([c, volume(c), pressure(c)]);
  const PMAX = Math.max(...PV_PTS.map((p) => p[2]));
  function layoutCharts() {
    cdpr = SHOT ? 1 : Math.min(2, window.devicePixelRatio || 1);
    const a = pv.getBoundingClientRect(), b = tm.getBoundingClientRect();
    pvW = Math.round(a.width * cdpr); pvH = Math.round(a.height * cdpr);
    tmW = Math.round(b.width * cdpr); tmH = Math.round(b.height * cdpr);
    pv.width = pvW; pv.height = pvH; tm.width = tmW; tm.height = tmH;
  }
  function drawPV(c) {
    const x = pvx, w = pvW, h = pvH, d = cdpr;
    x.clearRect(0, 0, w, h);
    const L0 = 40 * d, R0 = 10 * d, T0 = 10 * d, B0 = 28 * d;
    const vx = (v) => L0 + (v - 20) / (VC + VD - 20 + 20) * (w - L0 - R0);
    const py = (p) => h - B0 - p / (PMAX * 1.08) * (h - T0 - B0);
    // сетка и оси
    x.strokeStyle = 'rgba(29,32,37,0.12)';
    x.lineWidth = 1 * d;
    x.font = `${12 * d}px 'IBM Plex Mono', monospace`;
    x.fillStyle = '#5f646c';
    x.textAlign = 'right'; x.textBaseline = 'middle';
    for (let p = 0; p <= PMAX; p += 20) { x.beginPath(); x.moveTo(L0, py(p)); x.lineTo(w - R0, py(p)); x.stroke(); x.fillText(String(p), L0 - 6 * d, py(p)); }
    x.textAlign = 'center'; x.textBaseline = 'top';
    for (let v = 100; v <= 450; v += 100) { x.beginPath(); x.moveTo(vx(v), T0); x.lineTo(vx(v), h - B0); x.stroke(); x.fillText(String(v), vx(v), h - B0 + 5 * d); }
    x.textAlign = 'left';
    x.fillText('бар', 4 * d, T0 - 2 * d);

    // петля по тактам
    let prev = null;
    for (const [cc, v, p] of PV_PTS.concat([PV_PTS[0]])) {
      if (prev) {
        x.strokeStyle = STROKES[strokeOf(prev[0])].color;
        x.lineWidth = 2.2 * d;
        x.beginPath(); x.moveTo(vx(prev[1]), py(prev[2])); x.lineTo(vx(v), py(p)); x.stroke();
      }
      prev = [cc, v, p];
    }
    // текущая точка
    const cw = wrap720(c);
    const v = volume(cw), p = pressure(cw);
    x.fillStyle = '#1d2025';
    x.beginPath(); x.arc(vx(v), py(p), 5 * d, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#f7f3ea'; x.lineWidth = 2 * d; x.stroke();
    x.fillStyle = '#1d2025';
    x.textAlign = vx(v) > w * 0.7 ? 'right' : 'left';
    x.textBaseline = 'bottom';
    x.font = `500 ${12 * d}px 'IBM Plex Mono', monospace`;
    x.fillText(`${p.toFixed(1).replace('.', ',')} бар`, vx(v) + (x.textAlign === 'left' ? 9 : -9) * d, py(p) - 6 * d);
  }
  function drawTiming(c) {
    const x = tmx, w = tmW, h = tmH, d = cdpr;
    x.clearRect(0, 0, w, h);
    const L0 = 30 * d, R0 = 6 * d;
    const cx = (a) => L0 + a / 720 * (w - L0 - R0);
    const rowH = 15 * d, gap = 5 * d;
    x.font = `500 ${12 * d}px 'Oswald', sans-serif`;
    x.textBaseline = 'middle';
    // четыре цилиндра
    for (let i = 0; i < 4; i++) {
      const y = 6 * d + i * (rowH + gap);
      x.fillStyle = '#1d2025';
      x.textAlign = 'left';
      x.fillText(`Ц${i + 1}`, 0, y + rowH / 2);
      for (let s = 0; s < 4; s++) {
        const start = wrap720(FIRING[i] + s * 180);
        const seg = [[start, Math.min(720, start + 180)]];
        if (start + 180 > 720) seg.push([0, start + 180 - 720]);
        x.fillStyle = STROKES[strokeOf(s * 180)].color;
        for (const [a, b] of seg) x.fillRect(cx(a) + 1, y, cx(b) - cx(a) - 2, rowH);
      }
    }
    // подъём клапанов цилиндра 1
    const y0 = 6 * d + 4 * (rowH + gap) + 8 * d, hh = h - y0 - 20 * d;
    x.fillStyle = '#1d2025';
    x.textAlign = 'left';
    x.fillText('клап.', 0, y0 + hh / 2);
    const curve = (fn, col) => {
      x.strokeStyle = col; x.lineWidth = 2 * d;
      x.beginPath();
      for (let a = 0; a <= 720; a += 3) { const yy = y0 + hh - fn(a) / LIFT * hh; a ? x.lineTo(cx(a), yy) : x.moveTo(cx(a), yy); }
      x.stroke();
    };
    curve(liftIn, '#2f6fcf');
    curve(liftEx, '#8a7560');
    // шкала
    x.fillStyle = '#5f646c';
    x.font = `${12 * d}px 'IBM Plex Mono', monospace`;
    x.textAlign = 'center'; x.textBaseline = 'top';
    for (let a = 0; a <= 720; a += 180) x.fillText(`${a}°`, Math.min(w - 16 * d, Math.max(L0 + 10 * d, cx(a))), h - 16 * d);
    // курсор
    const cw = wrap720(c);
    x.strokeStyle = '#1d2025'; x.lineWidth = 2 * d;
    x.beginPath(); x.moveTo(cx(cw), 2 * d); x.lineTo(cx(cw), h - 18 * d); x.stroke();
  }

  // ---------------------------------------------------------------- боковая панель
  const strokeName = $('#strokeName'), strokeText = $('#strokeText'), strokeNum = $('#strokeNum');
  const stripBtns = [...document.querySelectorAll('#strip button')];
  let lastStroke = -1;
  function updatePanel(c) {
    const st = strokeOf(c);
    if (st !== lastStroke) {
      lastStroke = st;
      strokeName.textContent = STROKES[st].name;
      strokeName.style.color = STROKES[st].color === '#8a7560' ? '#6d5a47' : STROKES[st].color;
      strokeText.textContent = STROKES[st].text;
      strokeNum.textContent = `Такт ${st + 1} из 4`;
      stripBtns.forEach((b, i) => b.classList.toggle('on', i === st));
    }
    // курсор на полосе: впуск(360–540) → 0…25 %, сжатие → 25…50 %, рабочий → 50…75 %, выпуск → 75…100 %
    const cw = wrap720(c);
    const pos = ((cw - 360 + 720) % 720) / 720;
    $('#stripCursor').style.left = (pos * 100) + '%';
  }
  stripBtns.forEach((b) => b.addEventListener('click', () => { cyc = +b.dataset.c + 1; render(0); }));

  // ---------------------------------------------------------------- обороты
  const rpmInput = $('#rpm');
  const RPM_MIN = 20, RPM_MAX = 6500;
  const toRpm = (t) => Math.round(RPM_MIN * Math.pow(RPM_MAX / RPM_MIN, t));
  const fromRpm = (r) => Math.log(r / RPM_MIN) / Math.log(RPM_MAX / RPM_MIN);
  const VIS_MAX = 60; // быстрее 60 об/мин глаз не успевает — анимация замедляется, звук нет
  function syncRpm() {
    rpmInput.style.setProperty('--p', (rpmInput.value * 100) + '%');
    $('#vRpm').textContent = `${rpm.toLocaleString('ru-RU')} об/мин`;
    const slow = rpm / VIS_MAX;
    $('#rpmNote').textContent = rpm > VIS_MAX
      ? `Анимация замедлена в ${Math.round(slow).toLocaleString('ru-RU')} раз, звук — в реальном темпе. Мощность одного цилиндра по модели ≈ ${(WORK * rpm / 120 / 1000).toFixed(1).replace('.', ',')} кВт.`
      : 'Реальная скорость: коленвал делает один оборот в секунду.';
    if (engineNode) engineNode.parameters.get('rpm').setTargetAtTime(Math.max(RPM_MIN, rpm), audio.currentTime, 0.15);
  }
  rpmInput.value = fromRpm(60);
  rpmInput.addEventListener('input', () => { rpm = toRpm(+rpmInput.value); syncRpm(); });
  const xrayInput = $('#xray');
  xrayInput.style.setProperty('--p', '100%');
  xrayInput.addEventListener('input', () => {
    xray = +xrayInput.value;
    xrayInput.style.setProperty('--p', (xray * 100) + '%');
    $('#vXray').textContent = Math.round(xray * 100) + ' %';
    staticDirty = true;
  });

  // ---------------------------------------------------------------- кнопки
  const btnPlay = $('#btnPlay');
  function syncPlay() {
    btnPlay.classList.toggle('on', playing);
    btnPlay.setAttribute('aria-pressed', playing ? 'true' : 'false');
    btnPlay.querySelector('span').textContent = playing ? 'Пауза' : 'Пуск';
    $('#icoPause').style.display = playing ? '' : 'none';
    $('#icoPlay').style.display = playing ? 'none' : '';
  }
  btnPlay.addEventListener('click', () => { playing = !playing; syncPlay(); });
  $('#btnStep').addEventListener('click', () => { playing = false; syncPlay(); cyc += 15; });
  window.addEventListener('keydown', (e) => {
    if (e.target && e.target.tagName === 'INPUT') return;
    if (e.code === 'Space') { e.preventDefault(); playing = !playing; syncPlay(); }
    else if (e.code === 'ArrowRight') { playing = false; syncPlay(); cyc += e.shiftKey ? 90 : 15; }
    else if (e.code === 'ArrowLeft') { playing = false; syncPlay(); cyc -= e.shiftKey ? 90 : 15; }
  });

  // ---------------------------------------------------------------- звук: AudioWorklet из Blob
  let audio = null, engineNode = null, soundOn = false, gainNode = null;
  const WORKLET = `
  class Engine extends AudioWorkletProcessor {
    static get parameterDescriptors() { return [{ name: 'rpm', defaultValue: 800, minValue: 10, maxValue: 9000 }]; }
    constructor() {
      super();
      this.ang = 0; this.env = 0; this.amp = 1; this.cyl = 0;
      this.z = [0,0,0,0,0,0,0,0];
      this.lp = 0; this.body = 0;
    }
    bp(x, f, q, k) { // резонатор (state variable filter)
      const z = this.z; const w = 2 * Math.sin(Math.PI * f / sampleRate);
      const hp = x - z[k] - z[k + 1] / q; z[k + 1] += w * hp; z[k] += w * z[k + 1];
      return z[k + 1];
    }
    process(inputs, outputs, params) {
      const out = outputs[0][0]; const r = params.rpm;
      for (let i = 0; i < out.length; i++) {
        const rpm = r.length > 1 ? r[i] : r[0];
        const prev = this.ang;
        this.ang += rpm * 6 / sampleRate;           // градусов коленвала за отсчёт
        if (Math.floor(this.ang / 180) !== Math.floor(prev / 180)) {
          this.env = 1; this.cyl = (this.cyl + 1) % 4;
          this.amp = 0.82 + 0.18 * Math.random() + (this.cyl === 2 ? 0.06 : 0);
        }
        if (this.ang > 7200) this.ang -= 7200;
        const tau = Math.max(0.0025, 0.012 - rpm * 0.0000012);
        this.env *= Math.exp(-1 / (tau * sampleRate));
        const n = Math.random() * 2 - 1;
        const pulse = this.env * this.amp * (0.65 + 0.35 * n);
        const f1 = 70 + rpm * 0.012, f2 = 260 + rpm * 0.03;
        let y = this.bp(pulse, f1, 2.2, 0) * 1.6 + this.bp(pulse, f2, 3.0, 2) * 0.7 + this.bp(n * 0.02 + pulse * 0.2, 1400, 1.2, 4) * 0.25;
        this.lp += (y - this.lp) * 0.35;
        out[i] = Math.tanh(this.lp * 1.8) * 0.55;
      }
      return true;
    }
  }
  registerProcessor('engine-sound', Engine);`;
  async function startSound() {
    try {
      if (!audio) {
        audio = new (window.AudioContext || window.webkitAudioContext)();
        const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
        await audio.audioWorklet.addModule(url);
        engineNode = new AudioWorkletNode(audio, 'engine-sound');
        gainNode = audio.createGain();
        gainNode.gain.value = 0;
        engineNode.connect(gainNode).connect(audio.destination);
      }
      await audio.resume();
      engineNode.parameters.get('rpm').setValueAtTime(Math.max(RPM_MIN, rpm), audio.currentTime);
      gainNode.gain.setTargetAtTime(0.5, audio.currentTime, 0.2);
      return true;
    } catch (e) {
      $('#rpmNote').textContent = 'Звук недоступен в этом браузере.';
      return false;
    }
  }
  function stopSound() { if (gainNode) gainNode.gain.setTargetAtTime(0, audio.currentTime, 0.12); }
  const btnSound = $('#btnSound');
  btnSound.addEventListener('click', async () => {
    soundOn = !soundOn;
    if (soundOn) soundOn = await startSound(); else stopSound();
    btnSound.classList.toggle('on', soundOn);
    btnSound.setAttribute('aria-pressed', soundOn ? 'true' : 'false');
    if (soundOn && rpm < 700) { rpm = 900; rpmInput.value = fromRpm(rpm); syncRpm(); }
  });

  // ---------------------------------------------------------------- рендер
  let clock = 0;
  let staticDirty = true;
  // неподвижные части листа рисуются один раз: бумага, рамка, штамп, блок, головка
  function buildStatic() {
    staticCanvas.width = SW; staticCanvas.height = SH;
    const sc = staticCanvas.getContext('2d');
    g = sc;
    hatch = makeHatch();
    g.fillStyle = '#efe9dd';
    g.fillRect(0, 0, SW, SH);
    drawFrame();
    drawBlock();
    drawHead();
    g = mainCtx;
    staticDirty = false;
  }
  function drawChamberOutline() {
    g.strokeStyle = '#1d2025';
    g.lineWidth = 1.4 * dpr;
    g.beginPath(); g.moveTo(X(-40), Y(DECK)); g.lineTo(X(-30), Y(DECK + 14)); g.lineTo(X(30), Y(DECK + 14)); g.lineTo(X(40), Y(DECK)); g.stroke();
  }
  function render(dt) {
    if (staticDirty) buildStatic();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(staticCanvas, 0, 0);
    drawGas(cyc);
    drawChamberOutline();
    drawParticles(cyc, dt);
    drawMoving(cyc);
    drawValvetrain(cyc);
    drawSparkPlug(cyc);
    if (showCallouts) callouts(cyc);
    drawSideView(cyc);
    drawSpecs();
    drawPV(cyc);
    drawTiming(cyc);
    updatePanel(cyc);
    $('#work').textContent = `≈ ${Math.round(WORK)} Дж за цикл`;
  }

  let last = performance.now();
  let running = true;
  function tick(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    clock += dt;
    if (playing) {
      const visRpm = Math.min(rpm, VIS_MAX) * (reduceMotion ? 0.5 : 1);
      cyc = wrap720(cyc + visRpm * 6 * dt);
    }
    render(dt);
    if (SHOT) return;
    requestAnimationFrame(tick);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { running = false; if (soundOn) stopSound(); }
    else if (!running) { running = true; last = performance.now(); requestAnimationFrame(tick); if (soundOn) startSound(); }
  });
  function onResize() { layoutSheet(); layoutCharts(); staticDirty = true; render(0); }
  window.addEventListener('resize', onResize);

  syncRpm();
  syncPlay();
  const start = () => { onResize(); requestAnimationFrame((t) => { last = t; tick(t); }); };
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(start); else start();
})();
