// ───────────────────────────────────────────────────────────────────────────
//  «Лисий дом» — режиссёрский сценарий: игра лисы, события мира, камера,
//  свет по времени и звуковые метки. Всё — функции от t.
// ───────────────────────────────────────────────────────────────────────────
window.FoxScript = function (THREE, ctx) {
  'use strict';
  const S = window.STORY;
  const { clamp, lerp, smooth, track, vtrack, E, noise1 } = S;
  const { W, F, fox } = ctx;
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const h1 = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const cues = [];
  const cue = (t, type, o) => cues.push(Object.assign({ t, type }, o || {}));

  // ════════════════════════════════════════════════════════════════════════
  //  1. Свет и цвет по времени
  // ════════════════════════════════════════════════════════════════════════
  const GOLD = { sunCol: [1, 0.8, 0.58], skyTop: [0.42, 0.62, 0.86], skyHor: [1.0, 0.79, 0.57], skyBot: [0.6, 0.42, 0.32], fog: [0.93, 0.74, 0.56],
    hemiSky: [0.74, 0.8, 0.95], hemiGround: [0.58, 0.4, 0.24] };
  const NOON = { sunCol: [1, 0.95, 0.86], skyTop: [0.34, 0.58, 0.9], skyHor: [0.86, 0.88, 0.9], skyBot: [0.55, 0.47, 0.4], fog: [0.84, 0.84, 0.82],
    hemiSky: [0.78, 0.84, 0.98], hemiGround: [0.55, 0.42, 0.28] };
  const EVE = { sunCol: [1, 0.64, 0.38], skyTop: [0.4, 0.5, 0.76], skyHor: [1.0, 0.66, 0.44], skyBot: [0.52, 0.36, 0.3], fog: [0.9, 0.64, 0.48],
    hemiSky: [0.66, 0.7, 0.9], hemiGround: [0.55, 0.36, 0.22] };
  const STORM = { sunCol: [0.78, 0.82, 0.92], skyTop: [0.3, 0.34, 0.4], skyHor: [0.54, 0.56, 0.6], skyBot: [0.3, 0.3, 0.33], fog: [0.5, 0.52, 0.56],
    hemiSky: [0.62, 0.66, 0.74], hemiGround: [0.36, 0.32, 0.28] };
  const SNOW = { sunCol: [0.86, 0.9, 1.0], skyTop: [0.6, 0.66, 0.75], skyHor: [0.82, 0.84, 0.88], skyBot: [0.58, 0.6, 0.66], fog: [0.8, 0.82, 0.87],
    hemiSky: [0.8, 0.86, 0.98], hemiGround: [0.66, 0.68, 0.74] };
  // Ночь — «синий час»: луна светит спереди-сбоку, снег читается голубым,
  // тёплое окно — единственное жёлтое пятно в кадре.
  const DUSK = { sunCol: [0.66, 0.76, 1.0], skyTop: [0.12, 0.19, 0.38], skyHor: [0.4, 0.47, 0.68], skyBot: [0.16, 0.18, 0.3], fog: [0.34, 0.4, 0.58],
    hemiSky: [0.5, 0.58, 0.84], hemiGround: [0.36, 0.38, 0.5] };
  const NIGHT = { sunCol: [0.62, 0.74, 1.0], skyTop: [0.05, 0.09, 0.22], skyHor: [0.22, 0.3, 0.5], skyBot: [0.08, 0.1, 0.2], fog: [0.2, 0.26, 0.42],
    hemiSky: [0.42, 0.52, 0.84], hemiGround: [0.3, 0.33, 0.46] };
  const keyed = (field, list) => vtrack(list.map(([t, pal, e]) => [t, pal[field], e || 'io']));
  const PAL = [[0, GOLD], [27.5, GOLD], [30, NOON, 'step'], [33.5, NOON], [37.5, EVE], [41.5, EVE], [45, STORM], [60, STORM], [66, SNOW], [77, SNOW], [80.2, DUSK, 'step'], [86, NIGHT], [104, NIGHT]];
  const envC = {};
  for (const k of ['sunCol', 'skyTop', 'skyHor', 'skyBot', 'fog', 'hemiSky', 'hemiGround']) envC[k] = keyed(k, PAL);
  const sunDir = vtrack([[0, [-0.62, 0.42, 0.62]], [27.5, [-0.6, 0.44, 0.62]], [30, [0.78, 0.32, 0.38], 'step'], [32.5, [0.45, 0.75, 0.5], 'lin'],
    [35, [-0.1, 0.85, 0.5], 'lin'], [37.5, [-0.55, 0.55, 0.55], 'lin'], [40, [-0.66, 0.36, 0.52], 'lin'], [45, [-0.45, 0.6, 0.45]], [80.2, [0.5, 0.6, 0.62], 'step'], [104, [0.46, 0.62, 0.64]]]);
  const sunI = track([[0, 3.3], [27.5, 3.3], [30, 3.0, 'step'], [35, 3.6], [40, 3.1], [43, 2.2], [46, 0.9], [52, 0.45], [58, 0.35], [63, 0.5], [67, 0.6], [79, 0.45], [80.2, 1.3, 'step'], [88, 1.45]]);
  const hemiI = track([[0, 1.05], [40, 1.05], [46, 1.2], [62, 1.25], [67, 1.45], [79, 1.3], [80.2, 0.95, 'step'], [88, 0.85]]);
  const exposure = track([[0, 1.0], [44, 1.0], [48, 1.1], [65, 1.06], [79, 1.0], [80.2, 1.2, 'step'], [90, 1.35]]);
  const sat = track([[0, 1.1], [40, 1.08], [47, 0.78], [62, 0.74], [66, 0.84], [80, 0.86], [86, 0.98]]);
  const contrast = track([[0, 1.06], [44, 1.05], [50, 1.02], [66, 1.0], [80, 1.02], [90, 1.06]]);
  const lift = vtrack([[0, [0.025, 0.012, 0.0]], [44, [0.02, 0.01, 0.0]], [48, [0.0, 0.01, 0.025]], [66, [0.01, 0.015, 0.03]], [80.2, [0.0, 0.012, 0.045], 'step']]);
  const gain = vtrack([[0, [1.04, 1.0, 0.94]], [44, [1.03, 0.99, 0.94]], [48, [0.96, 0.98, 1.03]], [66, [0.97, 0.99, 1.03]], [80.2, [0.94, 0.98, 1.08], 'step']]);
  const fogD = track([[0, 0.0042], [40, 0.0045], [48, 0.008], [58, 0.011], [66, 0.012], [79, 0.012], [80.2, 0.009, 'step'], [100, 0.007]]);
  const bloom = track([[0, 0.28], [80, 0.28], [81.25, 0.9], [104, 1.0]]);
  const bloomTh = track([[0, 1.7], [80, 1.7], [80.3, 0.9, 'step']]);
  const litter = track([[0, 0.22], [20, 0.3], [40, 0.58], [60, 0.82], [104, 0.85]]);
  const leafFall = track([[0, 0.3], [6.9, 0.3], [7.3, 1.0, 'out'], [9.5, 0.4], [29.9, 0.4], [30, 0.85, 'step'], [39.9, 0.7], [40, 0.35, 'step'], [45, 0.5], [53.5, 1.0], [58.8, 1.0], [59.5, 0.5], [64, 0.2], [68, 0.0]]);
  const stars = track([[0, 0], [83, 0], [90, 1]]);
  const moon = track([[0, 0], [82, 0], [88, 1]]);
  const sunGlow = track([[0, 1], [44, 1], [47, 0.1], [80, 0.1], [80.2, 0, 'step']]);
  function env(t) {
    const e = {};
    for (const k in envC) e[k] = envC[k](t).slice();
    const d = sunDir(t); const l = Math.hypot(d[0], d[1], d[2]); e.sunDir = [d[0] / l, d[1] / l, d[2] / l];
    e.sunI = sunI(t); e.hemiI = hemiI(t); e.exposure = exposure(t); e.sat = sat(t); e.contrast = contrast(t);
    e.lift = lift(t).slice(); e.gain = gain(t).slice(); e.fogD = fogD(t); e.bloom = bloom(t); e.bloomTh = bloomTh(t);
    e.litter = litter(t); e.leafFall = leafFall(t); e.stars = stars(t); e.moon = moon(t); e.sunGlow = sunGlow(t);
    e.vig = 0.85;
    const fl = S.fire(t) * (0.86 + 0.1 * noise1(t * 7.3) + 0.06 * noise1(t * 17.1 + 3));
    e.fireI = fl * 26; e.spillI = fl * 7; e.fireK = fl;
    const lum = e.sunI / 3.3;
    e.partLight = e.sunCol.map((c) => c * (0.35 + 0.65 * lum));
    e.partAmb = e.hemiSky.map((c) => c * e.hemiI * 0.45);
    return e;
  }

  // ════════════════════════════════════════════════════════════════════════
  //  2. Игра лисы: корень (где стоит) и позы (как стоит)
  // ════════════════════════════════════════════════════════════════════════
  const RT = new F.RootTrack(-13.2, 0, 13.6, -0.55);
  const PT = new F.PoseTrack();
  const P = (t, name, ease, over) => PT.key(t, name, ease, over);
  const ROOF = 13.02;           // верх конька
  const extras = { carry: [], hammer: [], look: [], flutter: [] };
  const span = (list, t0, t1, v) => list.push([t0, t1, v]);

  // ── Сцена 1. Осень ──
  P(0, 'sleep'); P(7.2, 'sleep');
  P(7.5, 'sleep', 'out', { shiver: 1, eyes: 0, earL: -0.7, earR: -0.7 });
  P(8.5, 'sleep', 'io', { shiver: 0.6, eyes: 0 });
  P(8.85, 'sleep', 'out', { eyes: 1, shiver: 0.2, headP: 0.4 });
  P(9.6, 'lie', 'io', { headP: 0.1, headY: 0.35, eyes: 1 });
  P(10.4, 'lie', 'io', { headP: -0.35, earL: 0.2, earR: 0.2 });
  P(12.4, 'lie', 'io', { headP: -0.55, earL: 0.25, earR: 0.25 });
  P(14.8, 'lie', 'io', { headP: -0.4, earL: 0.1, earR: 0.1 });
  P(15.6, 'lie', 'io', { headP: 0.15, earL: -0.55, earR: -0.55, flop: 0.3, eyes: 0.7 });
  P(16.35, 'lie', 'io', { headP: 0.1, earL: -0.4, earR: -0.4, eyes: 0.8 });
  P(16.75, 'crouch', 'io', { lift: -1.6, headP: 0.1 });
  P(17.05, 'stand', 'back', { sq: -0.08 });
  P(17.15, 'shake', 'out'); P(17.95, 'shake');
  P(18.2, 'stand', 'io', { headY: -0.4, headP: 0 });
  P(18.55, 'alert', 'io', { headY: -0.25 });
  P(18.75, 'alert', 'in', { headP: 0.3, headY: -0.2 });
  P(19.0, 'alert', 'out', { headP: -0.15, headY: -0.1, eyes: 0.6 });
  P(19.3, 'stand', 'io', { tailP: -0.1 });
  RT.hold(18.95).turn(18.95, 19.35, 1.95, 'io').go(19.35, 20.0, [[-10.2, 0, 12.4], [-8.4, 0, 11.3]], 'in2');
  span(extras.look, 10.2, 15.2, 'geese');
  span(extras.look, 17.9, 18.8, 'ruin');
  cue(7.2, 'gust', { dur: 1.6, vel: 0.9 }); cue(7.55, 'shiver', { dur: 0.9 }); cue(16.8, 'rustle', { vel: 0.6 }); cue(17.15, 'shake', { dur: 0.8 });

  // ── Сцена 2. Брёвна ──
  RT.set(20.0, 6.8, 0, -3.3, 2.05).go(20.0, 21.25, [[10.2, 0, -5.4], [12.7, 0, -7.2]], 'out2');
  RT.turn(21.25, 21.5, 1.57);
  P(20.0, 'stand'); P(21.2, 'stand'); P(21.5, 'alert', 'io', { headY: 0.1 });
  P(21.9, 'sniff', 'io', { headY: -0.12 }); P(22.1, 'sniff', 'io', { headY: 0.12, jaw: 0.15 });
  P(22.3, 'sniff', 'io', { jaw: 0.7, headP: 0.6 });
  P(22.45, 'strain', 'in', { jaw: 0.35 });
  P(22.9, 'strain', 'io', { sq: 0.2, lift: -0.8, headP: 0.45 });
  P(23.2, 'strain', 'io', { sq: 0.08, lift: -0.4, headP: 0.2, roll: 0.08 });
  P(23.45, 'carry', 'back', { sq: -0.1, lift: 0.3, headP: -0.25, eyes: 1 });
  P(23.7, 'carry', 'io', { roll: -0.05 });
  P(25.0, 'carry');
  RT.turn(23.55, 24.05, -2.35).go(24.05, 25.0, [[10.2, 0, -8.9], [8.1, 0, -10.2]], 'in2');
  span(extras.carry, 22.42, 26.0, 0);
  cue(22.35, 'grab'); cue(22.7, 'strain', { dur: 0.6 }); cue(23.45, 'lift');

  RT.set(25.0, 4.6, 0, 9.4, -2.6).go(25.0, 25.75, [[2.2, 0, 7.6], [0.6, 0, 6.35]], 'out2');
  RT.turn(25.75, 25.95, Math.PI);
  P(25.0, 'carry'); P(25.8, 'carry', 'io', { headP: 0 });
  P(26.0, 'carry', 'in', { headP: 0.25, lift: -0.2, pitch: 0.08, sq: 0.05, jaw: 0.35 });
  P(26.12, 'carry', 'io', { headP: 0.1, jaw: 0.9 });
  P(26.45, 'stand', 'back', { headP: 0.2, earL: 0.2, earR: 0.2 });
  P(26.8, 'proud', 'io'); P(27.2, 'proud', 'io', { headY: 0.4 });
  RT.turn(27.0, 27.2, 1.2).go(27.2, 27.5, [[2.2, 0, 6.9]], 'in2');
  // второе бревно — бросок на второй венец
  RT.set(27.5, -6.6, 0, 9.3, 2.3).go(27.5, 28.2, [[-3.4, 0, 7.8], [-1.6, 0, 6.9]], 'out2');
  RT.turn(28.15, 28.35, Math.PI);
  span(extras.carry, 27.5, 28.75, 0);
  P(27.5, 'carry'); P(28.2, 'carry'); P(28.62, 'tossDown', 'in'); P(28.75, 'tossDown', 'io', { headP: 1.1 });
  P(28.9, 'tossUp', 'out'); P(29.1, 'tossUp', 'io', { headP: -0.9, jaw: 0.9 });
  P(29.4, 'stand', 'io', { headP: -0.35, headY: 0.1 });
  P(29.7, 'proud', 'io', { headP: -0.2 }); P(30, 'proud');
  span(extras.look, 28.95, 29.55, 'log4');
  cue(28.72, 'whoosh', { dur: 0.5, f0: 400, f1: 1400, vel: 0.5 });

  // ── Монтаж: ускоренная съёмка, стены растут ──
  const HOUSE = [1.8, 0, 7.4], PILE = [12.8, 0, -7.2];
  let tm = 30.0;
  const trips = [[30.0, 31.1, 1], [31.25, 32.35, 0], [32.5, 33.6, 1], [33.75, 34.85, 0], [35.0, 36.1, 1], [36.25, 37.35, 0], [37.5, 38.6, 1]];
  RT.set(30.0, PILE[0], 0, PILE[2], -2.3);
  for (const [a, b, toHouse] of trips) {
    const dst = toHouse ? HOUSE : PILE;
    const mid = toHouse ? [8.5, 0, 2.6] : [7.4, 0, -1.0];
    RT.go(a, b, [mid, dst], 'io', { turnIn: 0.12 });
    if (b < 38.7) RT.turn(b, b + 0.12, toHouse ? Math.PI : 0.9);
    if (toHouse) span(extras.carry, a, b + 0.05, 0);
    P(a, toHouse ? 'carry' : 'stand', 'io', { jaw: toHouse ? 0.35 : 0.5 });
    P(b, toHouse ? 'tossUp' : 'sniff', 'io');
    tm = b;
  }
  RT.turn(38.6, 38.75, Math.PI);
  P(38.9, 'tossUp', 'io'); P(39.35, 'stand', 'io', { headP: -0.4 });
  P(39.8, 'proud', 'io', { headP: -0.3 });

  // ── Стены готовы; небо темнеет ──
  RT.set(40.0, 3.4, 0, 10.2, 0.3);
  P(40.0, 'sit', 'io', { headP: 0.35 });
  P(40.5, 'sit', 'io', { headP: 0.3, jaw: 0.4 });
  P(40.8, 'wipe', 'io'); P(41.35, 'wipe', 'io', { fr1: -2.25, headR: 0.1 });
  P(41.7, 'sit', 'back', { happy: 1, jaw: 0.45, wag: 0.3, wagF: 2.4, headP: 0.25 });
  P(42.35, 'sit', 'io', { happy: 1, jaw: 0.1, wag: 0.25, wagF: 2.4, headP: 0.3 });
  P(42.7, 'sit', 'io', { headP: -0.15, headY: 0.6, earL: 0.2, earR: 0.2, wag: 0 });
  P(43.2, 'sit', 'io', { headP: -0.25, headY: 0.5, earL: -0.7, earR: -0.7, eyes: 0.6 });
  P(43.5, 'sit', 'io', { headP: 0.1, headY: 0, earL: 0.3, earR: 0.3, eyes: 0.55 });
  P(43.75, 'stand', 'io');
  RT.turn(43.7, 44.0, Math.PI - 0.25);
  P(44.1, 'crouch', 'io', { lift: -1.4, headP: -0.2, pitch: -0.1 });
  P(44.4, 'crouch', 'in', { lift: -1.7, headP: -0.35, pitch: -0.15, sq: 0.2 });
  P(44.55, 'leap', 'out');
  RT.hop(44.42, 45.35, 0.5, ROOF, 0.8, 7.5, 0);
  span(extras.flutter, 42.7, 43.4, 0.4);
  cue(40.7, 'swish', { vel: 0.4 }); cue(42.7, 'gust', { dur: 1.8, vel: 0.6 }); cue(44.42, 'whoosh', { dur: 0.6, f0: 300, f1: 900, vel: 0.5 });

  // ── Сцена 3. Ветер: крыша ──
  P(45.2, 'leap', 'io'); P(45.36, 'land', 'out'); P(45.62, 'stand', 'back');
  P(45.95, 'rear', 'io');
  const PLANK_IN = [[8, 46.25], [6, 47.5], [4, 48.75], [2, 50.0], [0, 51.25]];
  const hits = [];
  for (const [, a] of PLANK_IN) {
    P(a - 0.1, 'hamUp', 'out');
    for (const h of [a + 0.3125, a + 0.625]) { P(h, 'hamDown', 'in'); hits.push(h); P(h + 0.16, 'hamUp', 'out', { fr1: -2.3 }); }
  }
  P(51.95, 'rear', 'io', { headP: 0.6, earL: -0.6, earR: -0.6 });
  P(52.4, 'rear', 'io', { headP: 0.5, headY: 0.7, earL: -0.7, earR: -0.7 });
  span(extras.hammer, 45.9, 53.2, 0);
  P(53.3, 'crouch', 'io', { earL: -0.9, earR: -0.9, eyes: 0.4, lift: -1.2 });
  P(54.8, 'crouch', 'io', { earL: -1.1, earR: -1.1, eyes: 0.3, lift: -1.5, headP: 0.3 });
  RT.turn(53.2, 53.8, Math.PI);
  P(55.25, 'cling', 'out'); P(58.55, 'cling', 'io', { lift: 0.8 });
  span(extras.flutter, 53.2, 55.2, 0.35); span(extras.flutter, 55.2, 58.7, 1);
  P(58.95, 'flop', 'in');
  P(59.25, 'flop', 'io', { sq: 0.18 });
  P(59.8, 'flop', 'io', { sq: 0.12, eyes: 0.5, earL: -1.1, earR: -1.1, flop: 0.6, headP: 0.3 });
  P(60.3, 'flop', 'io', { sq: 0.1, eyes: 0.6, headP: 0.05, headY: 0.5, earL: -1, earR: -1 });
  P(60.65, 'flop', 'out', { sq: 0.05, eyes: 0.55, headP: -0.15, headY: 0, earL: 0.35, earR: 0.35, flop: 0 });
  P(60.85, 'flop', 'in', { sq: 0.05, eyes: 0.5, headP: 0.25, earL: 0.35, earR: 0.35, flop: 0 });
  P(61.05, 'flop', 'out', { sq: 0.05, eyes: 0.5, headP: -0.1, earL: 0.35, earR: 0.35, flop: 0 });
  span(extras.look, 59.9, 60.5, 'roofFront');
  cue(45.36, 'land', { surf: 'wood', vel: 0.7 });
  // быстрый ремонт: доски летят обратно
  const REPAIR = [[0, 61.55, [-3.2, 0, 13.4]], [2, 62.15, [4.2, 0, 15.0]], [4, 62.75, [-5.0, 0, 16.2]], [6, 63.35, [5.6, 0, 12.4]]];
  RT.set(61.25, 0.5, 0, 11.2, Math.PI);
  let prevP = [0.5, 0, 11.2];
  for (const [, tt, spot] of REPAIR) {
    const stand = [spot[0] * 0.8, 0, spot[2] - 1.6];
    RT.go(RT.t, tt - 0.12, [stand], 'io', { turnIn: 0.1 });
    RT.turn(tt - 0.12, tt - 0.05, Math.PI);
    P(tt - 0.12, 'tossDown', 'io'); P(tt, 'tossUp', 'out'); P(tt + 0.2, 'stand', 'io');
    prevP = stand;
  }
  RT.go(63.4, 63.7, [[1.0, 0, 9.0]], 'io');
  RT.set(63.75, 0.5, ROOF, 0.6, 0);
  P(63.75, 'hamUp');
  for (let k = 0; k < 8; k++) { const h = 63.75 + 0.078 + k * 0.078; P(h - 0.04, 'hamUp', 'out', { fr1: -2.0 }); P(h, 'hamDown', 'in'); if (k % 2 === 0) hits.push(h); }
  P(64.42, 'hamUp', 'io', { fr1: -3.1, eyes: 0.3 });
  P(64.6, 'hamDown', 'in', { sq: 0.12 }); hits.push(64.6);
  P(64.85, 'hamUp', 'back', { happy: 1, jaw: 0.6, fr1: -3.2 });
  span(extras.hammer, 63.75, 65.0, 0);

  // ── Сцена 4. Первый снег ──
  RT.set(65.0, 0.5, ROOF, 0.6, 0);
  P(65.0, 'sit', 'io', { jaw: 0.5, happy: 0, headP: 0.4 });
  P(65.8, 'sit', 'io', { jaw: 0.4, headP: 0.35 });
  P(66.6, 'sit', 'io', { jaw: 0.1 });
  P(68.7, 'sit', 'io', { jaw: 0 });
  P(68.85, 'sit', 'out', { cross: 1, headP: 0.25, earL: 0.3, earR: 0.3 });
  P(69.55, 'sit', 'io', { cross: 1, headP: 0.2 });
  P(69.9, 'sit', 'in', { cross: 0.6, headP: -0.45, eyes: 0.1, jaw: 0.5, sq: -0.08 });
  P(70.1, 'sit', 'in', { headP: -0.5, eyes: 0, jaw: 0.6, sq: -0.1 });
  P(70.22, 'sit', 'out', { headP: 0.6, eyes: 0, jaw: 0.1, sq: 0.12, earL: -0.6, earR: -0.6 });
  P(70.55, 'sit', 'io', { headP: 0.3, happy: 1, sq: 0 });
  P(71.1, 'sit', 'io', { headP: 0.1, happy: 1, wag: 0.3, wagF: 2 });
  span(extras.look, 66.0, 68.8, 'flake');
  cue(68.75, 'ding'); cue(69.6, 'inhale'); cue(70.1, 'sneeze');
  // спуск по крыше
  P(71.35, 'slide', 'io');
  RT.go(71.45, 72.45, [[0.6, 11.4, 2.6], [0.8, 9.3, 5.4]], 'in2', { turnIn: 0.05 });
  RT.hop(72.45, 73.1, 1.2, 0, 10.2, 1.4, 0);
  P(72.4, 'slide', 'io'); P(72.6, 'air', 'out'); P(73.0, 'air', 'io');
  P(73.12, 'land', 'out', { sq: 0.3, happy: 1 }); P(73.35, 'stand', 'back');
  P(73.45, 'shake', 'io'); P(73.95, 'shake');
  P(74.15, 'alert', 'io');
  cue(71.45, 'slide', { dur: 1.0 }); cue(73.1, 'poof'); cue(73.45, 'shake', { dur: 0.5 });
  // к двери, взгляд назад, внутрь
  RT.hold(74.2).go(74.2, 75.75, [[-0.6, 0, 8.6], [-2.0, 0, 6.35]], 'io');
  P(74.4, 'stand'); P(75.7, 'stand');
  RT.turn(76.0, 76.5, 0.15);
  P(76.4, 'sit', 'io', { headP: 0.1 }); P(76.9, 'sit', 'io', { headP: -0.1, headY: 0.25 });
  P(77.6, 'sit', 'io', { headP: -0.05, headY: -0.15, happy: 1, wag: 0.25 });
  P(77.95, 'stand', 'io');
  RT.turn(77.9, 78.3, Math.PI);
  RT.go(78.3, 78.95, [[-2.0, 1.0, 3.8], [-2.0, 1.0, 2.0]], 'io');
  P(78.95, 'stand');
  // ── Сцена 5. Свет в окне: лиса дома, у очага ──
  RT.set(80.0, 3.3, 3.12, 2.9, -1.35);   // свернулась на лежанке мордой к окну
  P(80.0, 'curl'); P(88.6, 'curl');
  P(89.0, 'curl', 'io', { eyes: 0.55, headP: 0.35 });
  P(89.4, 'curl', 'io', { eyes: 0.7, headP: 0.3, headY: 0.7, earL: 0.3, earR: 0.15 });
  P(90.8, 'curl', 'io', { happy: 1, headP: 0.4, headY: 0.8 });
  P(92.0, 'curl', 'io', { eyes: 0, headP: 0.5, headY: 0.9 });
  P(104, 'curl');
  RT.hold(104.5);

  // ════════════════════════════════════════════════════════════════════════
  //  3. Предрасчёт: путь, скорость, фаза шага, звуки шагов
  // ════════════════════════════════════════════════════════════════════════
  const HZ = 100, N = Math.ceil(S.DURATION * HZ) + 2;
  const DIST = new Float32Array(N), SPEED = new Float32Array(N), YAW = new Float32Array(N), AIR = new Uint8Array(N), RY = new Float32Array(N);
  let prev = RT.eval(0);
  for (let i = 0; i < N; i++) {
    const r = RT.eval(i / HZ);
    RY[i] = r.y;
    const d = Math.hypot(r.x - prev.x, r.z - prev.z);
    DIST[i] = (i ? DIST[i - 1] : 0) + (d < 1.5 ? d : 0);
    YAW[i] = r.yaw;
    const gy = r.y > 0.5 && r.y < 12.5 && !(r.y > 0.9 && r.y < 1.3) ? 1 : 0;
    AIR[i] = gy;
    prev = r;
  }
  for (let i = 0; i < N; i++) {
    const a = Math.max(0, i - 8), b = Math.min(N - 1, i + 8);
    SPEED[i] = (DIST[b] - DIST[a]) / ((b - a) / HZ);
  }
  const sample = (arr, t) => { const x = clamp(t * HZ, 0, N - 1), i = Math.floor(x), f = x - i; return lerp(arr[i], arr[Math.min(N - 1, i + 1)], f); };
  const STRIDE = 2.3;

  // Захлёст хвоста: затухающая пружина, которую раскачивают толчки корпуса —
  // отрыв и приземление (вертикальная скорость), разгон и торможение, повороты.
  // Считается один раз на весь фильм с шагом 10 мс, поэтому остаётся функцией t.
  const TAILP = new Float32Array(N), TAILY = new Float32Array(N);
  {
    const dt = 1 / HZ, w = Math.PI * 2 * 1.55, z = 0.2;
    let p = 0, pv = 0, y = 0, yv = 0, vyPrev = 0, wPrev = 0;
    for (let i = 1; i < N; i++) {
      const jump = Math.abs(RY[i] - RY[i - 1]) > 0.6;       // склейка или «телепорт» между сценами
      const vy = jump ? 0 : (RY[i] - RY[i - 1]) * HZ;
      let yr = YAW[i] - YAW[i - 1];
      while (yr > Math.PI) yr -= Math.PI * 2; while (yr < -Math.PI) yr += Math.PI * 2;
      const wy = Math.abs(yr) > 0.5 ? 0 : yr * HZ;
      if (jump) { p = pv = y = yv = 0; vyPrev = 0; wPrev = wy; continue; }
      // толчок скорости сразу меняет скорость хвоста (импульс), дальше — пружина
      pv += -(vy - vyPrev) * 0.3 - (SPEED[i] - SPEED[i - 1]) * 0.45;
      yv += -(wy - wPrev) * 0.25;
      vyPrev = vy; wPrev = wy;
      pv += (-w * w * p - 2 * z * w * pv) * dt; p += pv * dt;
      yv += (-w * w * y - 2 * z * w * yv) * dt; y += yv * dt;
      TAILP[i] = clamp(p, -0.9, 0.9); TAILY[i] = clamp(y, -0.8, 0.8);
    }
  }
  const tailP = new Array(5), tailY = new Array(5);
  // звуки шагов: касание лапы — переход фазы через 0,25 (рысь: пары лап)
  {
    let last = 0;
    for (let i = 1; i < N; i++) {
      const sp = SPEED[i];
      if (sp < 0.6 || AIR[i]) continue;
      const ph = DIST[i] / STRIDE * 2 + 0.25;
      const k = Math.floor(ph);
      if (k !== Math.floor(DIST[i - 1] / STRIDE * 2 + 0.25) && i / HZ - last > 0.07) {
        const t = i / HZ;
        const r = RT.eval(t);
        const surf = r.y > 6 ? 'wood' : t > 70.8 ? 'snow' : 'leaf';
        cue(t, 'step', { surf, vel: clamp(0.3 + sp / 14, 0.3, 0.8) });
        last = t;
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  //  4. События мира: брёвна, доски, поленница, дверь, окно
  // ════════════════════════════════════════════════════════════════════════
  const logs = W.logs.map((g, i) => ({ g, i, land: 1e9, from: null, mode: 'drop' }));
  logs[0].land = 26.25; logs[0].mode = 'mouth'; logs[0].rel = 26.0;
  for (const i of [1, 2, 3]) logs[i].land = 27.5;
  logs[4].land = 29.375; logs[4].mode = 'toss'; logs[4].rel = 28.75;
  for (const i of [5, 6, 7]) logs[i].land = 30.0;
  for (let i = 8; i < logs.length; i++) { logs[i].land = 30.0 + (i - 8) * 0.3125; logs[i].mode = 'drop'; }
  for (const L of logs) if (L.mode === 'drop' && L.land > 29.9) { cue(L.land, 'knock', { vel: 0.55, pitch: 0.8 + (L.i % 5) * 0.08 }); }
  cue(26.25, 'thud', { vel: 0.9 }); cue(29.375, 'thud', { vel: 1.0 }); cue(27.5, 'none');
  cue(39.375, 'thud', { vel: 1.0, big: 1 });
  const pileGone = [[8, 22.42], [7, 27.5], [6, 30.4], [5, 32.6], [4, 35.1], [3, 37.6]];
  const dust = [];
  const puff = (t, x, y, z, o) => dust.push(Object.assign({ t, x, y, z, n: 12, col: 0xb89a74, size: 0.45, spread: 1.6 }, o || {}));
  for (const L of logs) if (L.land > 25 && L.land < 40) { const p = L.g.pos; puff(L.land, p[0], p[1] - 0.5, p[2], { n: L.mode === 'drop' ? 6 : 12, size: L.mode === 'drop' ? 0.3 : 0.45 }); }
  puff(45.36, 0.5, ROOF, 0.6, { n: 8, size: 0.3 });
  puff(73.1, 1.2, 0.1, 10.2, { n: 22, col: 0xf2f5fa, size: 0.6, spread: 2.4 });
  puff(59.0, 0.5, ROOF, 0.6, { n: 10, size: 0.3 });

  // доски крыши: [когда встаёт, когда сорвёт, куда упадёт, когда вернётся]
  const planks = W.planks.map((g, i) => ({ g, i, tin: 1e9, tear: 1e9, back: 1e9, spot: null, mode: 'arrive' }));
  for (const [i, a] of PLANK_IN) { planks[i].tin = a; cue(a + 0.18, 'clack', { vel: 0.6 }); }
  for (const i of [1, 3, 5, 7, 9]) { planks[i].tin = 52.5; planks[i].mode = 'pop'; }
  planks[8].tear = 1e9;
  const TEAR = [[0, 55.3], [2, 55.65], [4, 56.0], [6, 56.45]];
  for (const [i, t] of TEAR) { planks[i].tear = t; cue(t, 'tear', { vel: 0.8 }); cue(t + 1.55, 'thud', { vel: 0.45, pitch: 1.3 }); }
  for (const [i, t, spot] of REPAIR) { planks[i].spot = spot; planks[i].back = t; cue(t + 0.5, 'clack', { vel: 0.8 }); cue(t - 0.05, 'whoosh', { dur: 0.45, f0: 500, f1: 1600, vel: 0.35 }); }
  for (const h of hits) cue(h, 'tock', { vel: h > 63.7 && h < 64.5 ? 0.55 : 0.9 });
  cue(64.6, 'ping');
  cue(52.5, 'none'); cue(53.8, 'gust', { dur: 5.2, vel: 1.0 });
  for (const [, t, spot] of REPAIR) puff(t - 0.05, spot[0], 0.1, spot[2], { n: 6, size: 0.3 });
  for (const [i, t] of TEAR) { const s = planks[i]; s.spot = s.spot; }

  // ════════════════════════════════════════════════════════════════════════
  //  5. Кадр: обновление мира и лисы
  // ════════════════════════════════════════════════════════════════════════
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), Q2 = new THREE.Quaternion(), EU = new THREE.Euler(), SC = new THREE.Vector3(), PV = new THREE.Vector3();
  const pose = Object.assign({}, F.BASE);
  const inSpan = (list, t) => { for (const s of list) if (t >= s[0] && t < s[1]) return s; return null; };
  const blinkAt = (t) => { const k = Math.floor(t / 3.3); const b = k * 3.3 + h1(k) * 2.2; const d = t - b; return d >= 0 && d < 0.16 ? 1 - Math.sin(d / 0.16 * Math.PI) * 0.95 : 1; };

  // Цели взгляда
  const geese = new THREE.Group(); ctx.scene.add(geese);
  const GOOSE = [];
  {
    const vb = new W.VoxBatch('goose', W.MAT.fox, { cast: false });
    const add = (x, y, z, c, sx, sy, sz) => vb.add(x, y, z, c, [0, 0, 0], sx, sy, sz);
    add(0, 0, 0, '#6E6257', 0.9, 0.55, 1.5); add(0, 0.35, 0.95, '#1F1B19', 0.28, 0.28, 0.9); add(0, 0.5, 1.45, '#1F1B19', 0.34, 0.34, 0.44);
    add(0, 0.42, 1.25, '#EDE6DA', 0.36, 0.14, 0.2); add(0, 0.02, -0.85, '#E9E1D3', 0.6, 0.35, 0.4);
    const body = vb.build();
    const wv = new W.VoxBatch('wing', W.MAT.fox, { cast: false });
    wv.add(0.8, 0, 0, '#5E5349', 1.6, 0.1, 0.7); wv.add(1.55, 0, -0.05, '#2A2622', 0.5, 0.08, 0.6);
    const wgeo = wv.build();
    for (let i = 0; i < 7; i++) {
      const g = new THREE.Group();
      g.add(body.clone());
      const wl = new THREE.Group(); wl.add(wgeo.clone()); g.add(wl);
      const wr = new THREE.Group(); const wm = wgeo.clone(); wm.scale.x = -1; wr.add(wm); g.add(wr);
      const k = i === 0 ? 0 : Math.ceil(i / 2) * (i % 2 ? 1 : -1);
      GOOSE.push({ g, wl, wr, off: V3(k * 2.4, -Math.abs(k) * 0.3, -Math.abs(k) * 2.6), ph: h1(i) * 6 });
      g.scale.setScalar(1.25);
      geese.add(g);
    }
  }
  const geeseAt = (t, out) => out.set(lerp(58, -46, (t - 9.5) / 9.5), lerp(33, 27, (t - 9.5) / 9.5), lerp(-62, 44, (t - 9.5) / 9.5));
  for (const tt of [10.3, 10.95, 11.7, 12.9, 13.55, 14.6, 15.4]) cue(tt, 'honk', { vel: 0.35 + 0.35 * clamp((tt - 10) / 4) });

  // Снегири
  const finches = [];
  {
    const vb = new W.VoxBatch('finch', W.MAT.fox, { cast: false });
    const add = (x, y, z, c, s) => vb.add(x, y, z, c, [0, 0, 0], s[0], s[1], s[2]);
    add(0, 0, 0, '#6F737A', [0.55, 0.45, 0.62]); add(0, -0.1, 0.12, '#D8453A', [0.5, 0.36, 0.48]); add(0, 0.3, 0.22, '#1C1A1A', [0.42, 0.34, 0.38]);
    add(0, 0.28, 0.44, '#2A2522', [0.14, 0.12, 0.14]); add(0, 0.05, -0.42, '#1C1A1A', [0.2, 0.12, 0.4]); add(0.29, 0.05, -0.05, '#1C1A1A', [0.06, 0.3, 0.45]); add(-0.29, 0.05, -0.05, '#1C1A1A', [0.06, 0.3, 0.45]);
    add(0.3, 0.12, -0.02, '#EDEBE6', [0.05, 0.08, 0.3]); add(-0.3, 0.12, -0.02, '#EDEBE6', [0.05, 0.08, 0.3]);
    const m = vb.build();
    const SP = [[1.45, 3.36, 4.42, 88.9, -0.4], [4.45, 3.36, 4.42, 89.35, 0.5], [-5.2, 8.25, 5.4, 90.2, 0.1]];
    for (const [x, y, z, ta, yaw] of SP) { const g = new THREE.Group(); g.add(m.clone()); g.scale.setScalar(0.95); ctx.scene.add(g); finches.push({ g, x, y, z, ta, yaw, from: V3(x + 9, y + 5, z + 7) }); cue(ta - 0.2, 'chirp', { vel: 0.5 }); cue(ta + 1.4, 'chirp', { vel: 0.4 }); cue(ta + 3.1, 'chirp', { vel: 0.35 }); }
  }

  // Главная снежинка
  const flake = new THREE.Group(); ctx.scene.add(flake);
  {
    const vb = new W.VoxBatch('flake', W.MAT.glow, { cast: false, receive: false });
    const s = 0.07;
    vb.add(0, 0, 0, new THREE.Color(1.6, 1.7, 1.9), [0, 0, 0], s, s, s);
    for (let a = 0; a < 6; a++) for (let k = 1; k <= 2; k++) vb.add(Math.cos(a * Math.PI / 3) * s * k, Math.sin(a * Math.PI / 3) * s * k, 0, new THREE.Color(1.4, 1.5, 1.7), [0, 0, 0], s, s, s * 0.6);
    flake.add(vb.build());
  }

  // Кучка листьев над спящей лисой (сдувает порывом)
  const pileLeaves = new W.VoxBatch('leafpile', W.MAT.fox, { dynamic: true });
  const LP = [];
  {
    const pal = ['#C43B22', '#DE5B2A', '#EE8433', '#B8321F', '#E9A43E', '#9A4A22'];
    for (let i = 0; i < 150; i++) {
      const a = h1(i * 3.1) * Math.PI * 2, r = Math.sqrt(h1(i * 5.7)) * 2.3;
      const x = -13.2 + Math.cos(a) * r * 1.25, z = 13.6 + Math.sin(a) * r;
      const y = 0.15 + (1 - r / 2.3) * 1.35 * h1(i * 1.9 + 4) + 0.12;
      const idx = pileLeaves.add(x, y, z, pal[i % pal.length], [0, 0, 0], 0.42, 0.14, 0.34);
      LP.push({ idx, x, y, z, d: h1(i * 2.3) * 0.5, vx: 3.5 + h1(i) * 5, vy: 2 + h1(i * 7) * 3.5, vz: -1 - h1(i * 11) * 3.2, spin: 3 + h1(i * 13) * 8 });
    }
    ctx.scene.add(pileLeaves.build());
  }

  // Пыль и снежные облачка
  const dustB = new W.VoxBatch('dust', W.MAT.fox, { dynamic: true, cast: false });
  const DUSTN = 160;
  for (let i = 0; i < DUSTN; i++) dustB.add(0, -60, 0, '#B89A74', [0, 0, 0], 1, 1, 1);
  ctx.scene.add(dustB.build());

  // Дым из трубы
  const smokeB = new W.VoxBatch('smoke', W.MAT.smoke, { dynamic: true, cast: false });
  const SMOKEN = 22;
  for (let i = 0; i < SMOKEN; i++) smokeB.add(0, -60, 0, '#C9CDD4', [0, 0, 0], 1, 1, 1);
  ctx.scene.add(smokeB.build());

  const LEAFFALL = 1.5;
  // оставшаяся листва: доля листьев на деревьях
  const leafy = track([[0, 1.0], [20, 0.93], [30, 0.88], [40, 0.55], [52, 0.45], [58.5, 0.18], [64, 0.08], [72, 0.0]]);
  const leafT = new Float32Array(W.leafList.length);
  {
    // «сколько листвы осталось» монотонно убывает — ищем момент опадания бинпоиском
    const TS = [], VS = [];
    for (let t = 0; t <= 80; t += 0.05) { TS.push(t); VS.push(leafy(t)); }
    W.leafList.forEach((L, i) => {
      if (L.ever || VS[VS.length - 1] >= L.u) { leafT[i] = 1e9; return; }
      let lo = 0, hi = VS.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (VS[m] < L.u) hi = m; else lo = m; }
      leafT[i] = TS[hi];
    });
  }
  const leafState = new Float32Array(W.leafList.length).fill(-1);

  // Корень и поза лисы в момент t (кэш для взгляда и снежинки)
  const tmpRoot = { x: 0, y: 0, z: 0, yaw: 0 };
  function evalFox(t, noLook) {
    const r = RT.eval(t);
    PT.eval(t, pose);
    const sp = sample(SPEED, t);
    const air = sample(AIR, t) > 0.5;
    const gaitW = air ? 0 : smooth(0.3, 2.0, sp);
    const ph = sample(DIST, t) / STRIDE;
    let yr = (sample(YAW, t) - sample(YAW, t - 0.06));
    while (yr > Math.PI) yr -= Math.PI * 2; while (yr < -Math.PI) yr += Math.PI * 2;
    yr /= 0.06;
    for (let i = 0; i < 5; i++) { tailP[i] = sample(TAILP, t - i * 0.045); tailY[i] = sample(TAILY, t - i * 0.045); }
    const ex = { t, gaitW, phase: ph, yawRate: yr, blink: blinkAt(t), tailP, tailY };
    const fl = inSpan(extras.flutter, t); if (fl) ex.flutter = fl[2] || 1;
    ex.hammer = !!inSpan(extras.hammer, t);
    const lk = noLook ? null : inSpan(extras.look, t);
    if (lk) {
      const k = Math.min(smooth(lk[0], lk[0] + 0.35, t), 1 - smooth(lk[1] - 0.35, lk[1], t));
      const p = new THREE.Vector3();
      if (lk[2] === 'geese') geeseAt(t, p);
      else if (lk[2] === 'ruin') p.set(0, 4, 0);
      else if (lk[2] === 'roofFront') p.set(0.5, 9, 5);
      else if (lk[2] === 'log4') logPos(4, t, p);
      else if (lk[2] === 'flake') flakePos(t, p);
      ex.look = { w: k, p };
    }
    // уши отстают от кивков
    const pPrev = PT.eval(t - 0.12, {});
    ex.earLag = clamp((pose.headP - pPrev.headP) * 1.4, -0.6, 0.6);
    F.apply(fox, pose, r, ex);
    fox.root.updateMatrixWorld(true);
    tmpRoot.x = r.x; tmpRoot.y = r.y; tmpRoot.z = r.z; tmpRoot.yaw = r.yaw;
    return r;
  }
  // Где во время t точка «рот» (для броска бревна) — считаем заранее
  const mouthAt = {};
  const mouthM = (t) => { evalFox(t, true); return fox.mouth.matrixWorld.clone(); };
  mouthAt[26.0] = mouthM(26.0); mouthAt[28.75] = mouthM(28.75);
  const noseAt68 = (() => { evalFox(68.75, true); return fox.nose.getWorldPosition(new THREE.Vector3()); })();
  const flakeStart = noseAt68.clone().add(V3(1.6, 5.2, 1.2));
  function flakePos(t, out) {
    const k = clamp((t - 65.8) / (68.75 - 65.8));
    const e = E.sin(k);
    out.lerpVectors(flakeStart, noseAt68, e);
    out.x += Math.sin(t * 2.1) * 0.9 * (1 - k); out.z += Math.cos(t * 1.7) * 0.4 * (1 - k);
    return out;
  }

  const LOGQ = { x: new THREE.Quaternion(), z: new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), Math.PI / 2) };
  function logFinal(L, M) { const p = L.g.pos; return M.makeTranslation(p[0], p[1], p[2]); }
  function logPos(i, t, out) { const L = logs[i]; logMatrix(L, t, M4); return out.setFromMatrixPosition(M4); }
  function logMatrix(L, t, M) {
    const p = L.g.pos;
    if (L.mode === 'drop') {
      const k = clamp((t - (L.land - 0.28)) / 0.28);
      const b = t > L.land ? Math.sin(clamp((t - L.land) / 0.22) * Math.PI) * 0.12 : 0;
      M.compose(PV.set(p[0], p[1] + (1 - k * k) * 6, p[2]), Q.identity(), SC.set(1 + b * 0.6, 1 - b, 1 + b * 0.6));
      return M;
    }
    // из пасти: рот → место (дуга), затем «приседание» бревна
    const MR = mouthAt[L.rel];
    const pr = PV.setFromMatrixPosition(MR);
    const qr = Q2.setFromRotationMatrix(M4.extractRotation(MR));
    if (L.g.axis === 'z') qr.multiply(LOGQ.z);
    const dur = L.land - L.rel, k = clamp((t - L.rel) / dur);
    const h = L.mode === 'toss' ? 3.4 : 0.3;
    const x = lerp(pr.x, p[0], k), z = lerp(pr.z, p[2], k);
    const y = lerp(pr.y, p[1], L.mode === 'toss' ? k : k * k) + 4 * h * k * (1 - k);
    const qq = Q.copy(qr).slerp(LOGQ.x, E.io(k));
    if (L.mode === 'toss') { EU.set(0, 0, (1 - k) * Math.PI * 2); qq.multiply(Q2.setFromEuler(EU)); }
    const b = t > L.land ? Math.sin(clamp((t - L.land) / 0.25) * Math.PI) * 0.16 : 0;
    M.compose(PV.set(x, y, z), qq, SC.set(1 + b * 0.5, 1 - b, 1 + b * 0.5));
    return M;
  }
  const logKey = new Array(logs.length).fill('');
  function updateLogs(t) {
    for (const L of logs) {
      let key;
      const start = L.mode === 'drop' ? L.land - 0.28 : L.rel;
      if (t < start) key = 'h';
      else if (t > L.land + 0.3) key = 'p';
      else key = 'a' + t.toFixed(3);
      if (key === logKey[L.i]) continue;
      logKey[L.i] = key;
      if (key === 'h') W.B.logs.hideGroup(L.g);
      else if (key === 'p') W.B.logs.placeGroup(L.g, logFinal(L, M4));
      else W.B.logs.placeGroup(L.g, logMatrix(L, t, M4));
    }
  }
  const plankFinal = (pl, M) => { const p = pl.g.pos; return M.makeTranslation(p[0], p[1], p[2]); };
  function plankMatrix(pl, t, M) {
    const p = pl.g.pos;
    const P0 = PV.set(p[0], p[1], p[2]);
    // 1) прилёт на место
    if (t < pl.tin + 0.4 && pl.mode === 'arrive') {
      const k = E.back(clamp((t - pl.tin) / 0.4));
      EU.set(-0.7 * (1 - k) * pl.g.side, 0, 0); Q.setFromEuler(EU);
      return M.compose(PV.set(p[0], p[1] - 2.6 * (1 - k), p[2] + pl.g.side * 3.2 * (1 - k)), Q, SC.set(1, 1, 1));
    }
    if (t < pl.tear) return plankFinal(pl, M);
    // 2) сорвало ветром: полёт кувырком и падение на землю
    const sp = pl.spot || [0, 0, 14];
    const fl = 1.6, k = clamp((t - pl.tear) / fl);
    if (t < pl.back) {
      const x = lerp(p[0], sp[0], k), z = lerp(p[2], sp[2], E.out2(k));
      const y = lerp(p[1], 0.35, k * k) + Math.sin(k * Math.PI) * 5.5;
      EU.set(k * 5.2 * (1 + pl.i * 0.05), k * 1.4, k * 2.3); Q.setFromEuler(EU);
      const rest = k >= 1 ? Q.setFromEuler(EU.set(0, 0.35 + pl.i * 0.4, 0)) : Q;
      return M.compose(PV.set(x, y, z), rest, SC.set(1, 1, 1));
    }
    // 3) обратно на крышу (бросок лисы)
    const kb = clamp((t - pl.back) / 0.5);
    const x = lerp(sp[0], p[0], kb), z = lerp(sp[2], p[2], kb);
    const y = lerp(0.35, p[1], kb) + Math.sin(kb * Math.PI) * 5;
    Q.setFromEuler(EU.set((1 - kb) * 6.28, 0.35 + pl.i * 0.4 * (1 - kb), 0));
    return M.compose(PV.set(x, y, z), kb >= 1 ? Q.identity() : Q, SC.set(1, 1, 1));
  }
  const plankKey = new Array(planks.length).fill('');
  function updatePlanks(t) {
    for (const pl of planks) {
      let key;
      if (t < pl.tin) key = 'h';
      else if (t < pl.tin + 0.42 && pl.mode === 'arrive') key = 'a' + t.toFixed(3);
      else if (t < pl.tear) key = 'p';
      else if (t < pl.tear + 1.62) key = 'f' + t.toFixed(3);
      else if (t < pl.back) key = 'g';
      else if (t < pl.back + 0.52) key = 'b' + t.toFixed(3);
      else key = 'p';
      if (key === plankKey[pl.i]) continue;
      plankKey[pl.i] = key;
      if (key === 'h') W.B.planks.hideGroup(pl.g);
      else if (key === 'p') W.B.planks.placeGroup(pl.g, plankFinal(pl, M4));
      else W.B.planks.placeGroup(pl.g, plankMatrix(pl, t, M4));
    }
  }
  const pileKey = new Array(W.pileLogs.length).fill('');
  function updatePile(t) {
    for (const [i, tg] of pileGone) {
      const key = t < tg ? 'v' : 'h';
      if (key === pileKey[i]) continue;
      pileKey[i] = key;
      if (key === 'h') W.B.pile.hideGroup(W.pileLogs[i]); else W.B.pile.placeGroup(W.pileLogs[i], M4.makeTranslation(...W.pileLogs[i].pos));
    }
    const carry = inSpan(extras.carry, t);
    if (carry) {
      M4.copy(fox.mouth.matrixWorld);
      M4.multiply(new THREE.Matrix4().makeScale(4, 4, 4));
      W.B.pile.placeGroup(W.carryLog, M4);
      pileKey.carry = 1;
    } else if (pileKey.carry !== 0) { W.B.pile.hideGroup(W.carryLog); pileKey.carry = 0; }
  }
  function updateLeaves(t) {
    const B = W.B.leaves, arr = B.mesh.instanceMatrix.array;
    let dirty = false;
    for (let i = 0; i < W.leafList.length; i++) {
      const tf = leafT[i];
      const k = tf > 1e8 ? 0 : clamp((t - tf) / LEAFFALL);
      if (k === leafState[i]) continue;
      leafState[i] = k; dirty = true;
      const L = W.leafList[i];
      if (k <= 0) { M4.makeTranslation(L.x, L.y, L.z); }
      else if (k >= 1) { M4.makeScale(0, 0, 0); }
      else {
        const s = 1 - k;
        EU.set(k * 4 * L.seed, k * 3, k * 2.5 * (1 - L.seed)); Q.setFromEuler(EU);
        M4.compose(PV.set(L.x + k * 2.6 * (0.5 + L.seed), L.y - k * k * 3.5, L.z + k * 1.8 * L.seed), Q, SC.set(s, s * 0.5, s));
      }
      M4.toArray(arr, L.i * 16);
    }
    if (dirty) B.mesh.instanceMatrix.needsUpdate = true;
  }
  function updateLeafPile(t) {
    const arr = pileLeaves.mesh.instanceMatrix.array;
    for (const L of LP) {
      const tt = t - 7.15 - L.d;
      if (tt <= 0) {
        const j = Math.sin(t * 2 + L.idx) * 0.02;
        M4.compose(PV.set(L.x, L.y + j, L.z), Q.setFromEuler(EU.set(0.2 * Math.sin(L.idx), L.idx, 0)), SC.set(1, 1, 1));
      } else if (tt > 3) M4.makeScale(0, 0, 0);
      else {
        const x = L.x + L.vx * tt, y = L.y + L.vy * tt - 1.6 * tt * tt, z = L.z + L.vz * tt;
        M4.compose(PV.set(x, Math.max(0.1, y), z), Q.setFromEuler(EU.set(tt * L.spin, tt * L.spin * 0.7, tt)), SC.setScalar(1 - tt / 3));
      }
      M4.toArray(arr, L.idx * 16);
    }
    pileLeaves.mesh.instanceMatrix.needsUpdate = true;
  }
  const dustCol = new THREE.Color();
  function updateDust(t) {
    const arr = dustB.mesh.instanceMatrix.array;
    let n = 0;
    for (const d of dust) {
      const a = t - d.t;
      if (a < 0 || a > 1.0) continue;
      for (let i = 0; i < d.n && n < DUSTN; i++, n++) {
        const ang = i / d.n * Math.PI * 2 + d.t, r = d.spread * E.out(a) * (0.6 + h1(i + d.t) * 0.6);
        const s = d.size * (1 - a) * (0.7 + h1(i * 3 + d.t) * 0.6);
        M4.compose(PV.set(d.x + Math.cos(ang) * r, d.y + 0.25 + E.out(a) * (0.6 + h1(i) * 0.8), d.z + Math.sin(ang) * r), Q.identity(), SC.setScalar(s));
        M4.toArray(arr, n * 16);
        dustB.mesh.setColorAt(n, dustCol.set(d.col));
      }
    }
    for (let i = n; i < DUSTN; i++) arr.fill(0, i * 16, i * 16 + 16);
    dustB.mesh.instanceMatrix.needsUpdate = true;
    if (dustB.mesh.instanceColor) dustB.mesh.instanceColor.needsUpdate = true;
  }
  function updateSmoke(t) {
    const arr = smokeB.mesh.instanceMatrix.array;
    const top = W.chimneyTop;
    for (let i = 0; i < SMOKEN; i++) {
      const per = 0.42 * SMOKEN;
      const born = Math.floor((t - 82 - i * 0.42) / per) * per + 82 + i * 0.42;
      const a = t - born;
      if (t < 82 || born < 82 || a < 0 || a > per) { arr.fill(0, i * 16, i * 16 + 16); continue; }
      const k = a / per;
      const s = (0.5 + k * 1.9) * (1 - smooth(0.7, 1, k)) * S.fire(t);
      M4.compose(PV.set(top.x + a * 0.35 + Math.sin(a * 1.3 + i) * 0.3, top.y + a * 0.95, top.z + Math.cos(a + i) * 0.3), Q.setFromEuler(EU.set(a * 0.3, a * 0.5 + i, 0)), SC.setScalar(s));
      M4.toArray(arr, i * 16);
    }
    smokeB.mesh.instanceMatrix.needsUpdate = true;
  }
  function updateClouds(t) {
    const B = W.cloudB;
    for (const g of W.clouds) {
      let [x, y, z] = g.pos;
      if (g.storm) { const k = smooth(43, 56, t); z = lerp(z, z + 118, k) + (t > 80 ? (t - 80) * 3.5 : 0); x += t * 0.2; }
      else x = ((x + t * 0.6 + 90) % 180) - 90;
      B.placeGroup(g, M4.makeTranslation(x, y, z));
    }
  }
  function updateBirds(t) {
    const vis = t > 9.4 && t < 19.2;
    geese.visible = vis;
    if (vis) {
      const c = geeseAt(t, PV.clone());
      const dir = V3(-104, -6, 106).normalize();
      const yaw = Math.atan2(dir.x, dir.z);
      for (const G of GOOSE) {
        G.g.position.copy(c).add(G.off.clone().applyAxisAngle(V3(0, 1, 0), yaw));
        G.g.rotation.set(0, yaw, 0);
        const f = Math.sin(t * 7 + G.ph) * 0.7;
        G.wl.rotation.z = f; G.wr.rotation.z = -f;
      }
    }
    for (const b of finches) {
      const k = clamp((t - (b.ta - 0.9)) / 0.9);
      b.g.visible = t > b.ta - 0.9;
      if (!b.g.visible) continue;
      const hop = t > b.ta + 1.2 ? Math.max(0, Math.sin((t - b.ta) * 5.5)) * 0.12 * (Math.floor((t - b.ta) / 1.7) % 2) : 0;
      b.g.position.set(lerp(b.from.x, b.x, E.out(k)), lerp(b.from.y, b.y, E.out(k)) + Math.sin(k * Math.PI) * 1.5 + hop, lerp(b.from.z, b.z, E.out(k)));
      b.g.rotation.set(0, k < 1 ? Math.atan2(b.x - b.from.x, b.z - b.from.z) : b.yaw + Math.sin(t * 1.3 + b.x) * 0.3, 0);
    }
  }
  function updateHouse(t, e) {
    const doorOn = t > 37.3;
    W.doorPivot.visible = doorOn;
    W.doorPivot.rotation.y = t < 78.95 ? 1.62 : 1.62 * (1 - E.back(clamp((t - 78.95) / 0.3)));
    const winOn = t > 37.0;
    W.glass.visible = winOn;
    W.root.getObjectByName('window').visible = winOn;
    const glow = e.fireK;
    W.glassMat.color.setRGB(0.07 + glow * 2.3, 0.1 + glow * 1.25, 0.14 + glow * 0.48);
    // огонь
    const fb = W.fireB, arr = fb.mesh.instanceMatrix.array;
    for (let k = 0; k < W.fireVox.length; k++) {
      const i = W.fireVox[k];
      const f = e.fireK;
      const s = f * (0.28 + 0.2 * (0.5 + 0.5 * Math.sin(t * (9 + k) + k * 2)));
      M4.compose(PV.set(4.6 + Math.sin(k * 1.7) * 0.15, 1.25 + (k % 3) * 0.25 + 0.1 * Math.sin(t * 7 + k), -0.5 + ((k * 0.37) % 1 - 0.5) * 0.9), Q.setFromEuler(EU.set(t * 2 + k, k, 0)), SC.setScalar(s));
      M4.toArray(arr, i * 16);
      fb.mesh.setColorAt(i, dustCol.setRGB(4 + (k % 3), 1.6 + (k % 2) * 0.8, 0.35));
    }
    fb.mesh.instanceMatrix.needsUpdate = true; if (fb.mesh.instanceColor) fb.mesh.instanceColor.needsUpdate = true;
  }
  function updateFlake(t) {
    flake.visible = t > 65.8 && t < 70.6;
    if (!flake.visible) return;
    if (t < 68.75) flakePos(t, flake.position);
    else if (t < 70.1) flake.position.copy(fox.nose.getWorldPosition(PV));
    else { flake.position.copy(fox.nose.getWorldPosition(PV)).add(V3(0, (t - 70.1) * 2, (t - 70.1) * 3)); }
    flake.rotation.set(t * 0.6, t * 0.9, t * 0.3);
    flake.scale.setScalar(t > 70.1 ? Math.max(0.01, 1 - (t - 70.1) / 0.5) : 1);
    flake.lookAt(ctx.camera.position);
  }

  function update(t, e) {
    evalFox(t);
    updateLogs(t); updatePlanks(t); updatePile(t); updateLeaves(t); updateLeafPile(t);
    updateDust(t); updateSmoke(t); updateClouds(t); updateBirds(t); updateHouse(t, e); updateFlake(t);
  }

  // ════════════════════════════════════════════════════════════════════════
  //  6. Камера: монтажный лист
  // ════════════════════════════════════════════════════════════════════════
  const headW = () => fox.headTop.getWorldPosition(new THREE.Vector3());
  const foxW = () => new THREE.Vector3(tmpRoot.x, tmpRoot.y, tmpRoot.z);
  const shots = [];
  // Кадр: t0..t1, положение и цель камеры в начале и в конце, фокусное, резкость
  function shot(t0, t1, o) { shots.push(Object.assign({ t0, t1, ease: 'io', fov: [34, 34], ap: 0.35, focus: 'look' }, o)); }
  const v = (a) => new THREE.Vector3(a[0], a[1], a[2]);
  // Сцена 1
  shot(0, 6.25, { from: [-92, 80, 118], to: [-44, 36, 56], look0: [2, -4, 0], look1: [-3, 0.5, 4], fov: [30, 30], ap: 0.18, ease: 'out2' });
  shot(6.25, 10, { from: [-7.6, 2.8, 20.2], to: [-8.9, 2.2, 18.7], look0: [-13.2, 0.7, 13.4], look1: [-13.3, 0.9, 13.6], fov: [30, 28], ap: 0.7, focus: 'fox' });
  shot(10, 12.5, { from: [-9.4, 1.0, 18.6], to: [-9.9, 1.05, 18.0], look0: [-12.9, 1.9, 13.9], look1: [-12.9, 2.0, 13.9], fov: [27, 25], ap: 0.9, focus: 'head' });
  shot(12.5, 16.25, { from: [-16.8, 1.3, 18.2], to: [-16.2, 1.5, 17.6], look0: [6, 15, -22], look1: [-2, 18, -10], fov: [44, 42], ap: 0.35, focus: 60 });
  shot(16.25, 20, { from: [-6.8, 2.5, 21.8], to: [-6.2, 2.7, 20.6], look0: [-12.2, 1.7, 13.2], look1: [-9.5, 1.9, 11.8], fov: [33, 33], ap: 0.55, focus: 'fox' });
  // Сцена 2
  shot(20, 25, { follow: 'fox', off0: [2.4, 2.5, 8.6], off1: [1.6, 2.3, 7.6], lookOff: [0.4, 1.3, -0.4], lag: 0.35, fov: [32, 30], ap: 0.7, focus: 'fox' });
  shot(25, 27.5, { from: [6.6, 1.25, 14.0], to: [6.0, 1.3, 13.2], look0: [0.8, 1.8, 5.5], look1: [0.4, 1.8, 5.2], fov: [34, 34], ap: 0.5, focus: 'fox' });
  shot(27.5, 30, { from: [-10.5, 2.2, 13.8], to: [-9.6, 2.6, 13.0], look0: [-1.5, 2.4, 4.5], look1: [-0.5, 3.0, 4.0], fov: [36, 36], ap: 0.45, focus: 'fox' });
  shot(30, 32.5, { orbit: [1, 3, 0], r: [32, 30], h: [23, 21], a: [0.95, 0.62], fov: [30, 30], ap: 0.5, focus: 'look' });
  // низкая камера у тропы: лиса с бревном пробегает мимо объектива к дому
  shot(32.5, 35, { from: [13.8, 0.9, 3.8], to: [13.2, 1.0, 4.4], look0: [2.5, 3.0, 6.0], look1: [2.2, 3.4, 6.0], fov: [30, 30], ap: 0.55, focus: 'fox' });
  shot(35, 37.5, { orbit: [0, 0, 0.5], r: [9, 8], h: [44, 43], a: [2.2, 2.7], fov: [36, 36], ap: 0.2, focus: 'look' });
  shot(37.5, 40, { from: [-8.4, 0.7, 13.2], to: [-7.4, 0.8, 12.2], look0: [0, 6.2, 2], look1: [0, 7.0, 1.5], fov: [40, 40], ap: 0.3, focus: 12 });
  shot(40, 45, { from: [6.8, 2.6, 19.2], to: [6.2, 2.8, 17.6], look0: [3.1, 3.2, 8.0], look1: [2.8, 3.6, 7.2], fov: [32, 32], ap: 0.6, focus: 'fox' });
  // Сцена 3
  shot(45, 50, { from: [3.4, 11.6, 11.5], to: [2.6, 12.4, 9.0], look0: [0.6, 14.2, 1.2], look1: [0.5, 14.8, 1.0], fov: [34, 32], ap: 0.5, focus: 'fox' });
  shot(50, 52.5, { from: [6.6, 13.4, 6.4], to: [6.0, 13.6, 5.6], look0: [0.5, 15.2, 0.8], look1: [0.5, 15.4, 0.8], fov: [30, 30], ap: 0.7, focus: 'fox' });
  shot(52.5, 55, { from: [28, 9, 30], to: [25, 10, 27], look0: [0, 8, -4], look1: [0, 9, -4], fov: [40, 38], ap: 0.2, roll: 0.05, focus: 'look' });
  shot(55, 58.75, { from: [10.2, 13.8, 2.6], to: [9.4, 13.6, 2.2], look0: [0.4, 13.6, 1.4], look1: [0.4, 13.6, 1.6], fov: [38, 36], ap: 0.4, roll: -0.09, shake: 0.14, focus: 'fox' });
  // шлёпнулась на конёк: крупно морда в три четверти, за ней — разорённый скат
  shot(58.75, 61.25, { follow: 'head', off0: [3.7, 1.5, -2.5], off1: [3.2, 1.25, -2.0], lookOff: [-0.3, -0.4, 0.5], fov: [34, 32], ap: 0.6, focus: 'head' });
  shot(61.25, 63.75, { from: [-3, 8.5, 27], to: [-2, 8.0, 25.5], look0: [0, 4.5, 7], look1: [0, 4.5, 7], fov: [38, 38], ap: 0.25, focus: 'look' });
  shot(63.75, 65, { from: [4.4, 14.0, 8.4], to: [3.9, 14.2, 7.6], look0: [0.5, 15.0, 0.8], look1: [0.5, 15.3, 0.8], fov: [32, 32], ap: 0.7, focus: 'fox', shake: 0.02 });
  // Сцена 4
  shot(65, 71.25, { follow: 'head', off0: [2.6, 0.1, 6.6], off1: [2.1, 0.0, 5.4], lookOff: [0, -0.5, 0.5], fov: [30, 28], ap: 1.0, focus: 'head', snowK: 0.5 });
  shot(71.25, 75, { from: [14.5, 6.2, 8.2], to: [13.0, 5.4, 8.4], look0: [0.6, 7.0, 5.0], look1: [0.8, 3.5, 7.5], fov: [42, 40], ap: 0.3, focus: 'fox' });
  shot(75, 76.25, { from: [-4.8, 2.2, 14.2], to: [-4.4, 2.2, 13.4], look0: [-1.6, 2.0, 6.2], look1: [-1.8, 2.0, 5.8], fov: [32, 32], ap: 0.55, focus: 'fox' });
  shot(76.25, 77.5, { from: [-2.4, 3.3, 2.4], to: [-2.3, 3.2, 2.9], look0: [-7, 3.2, 20], look1: [-8, 3.0, 20], fov: [40, 40], ap: 0.5, focus: 4.2 });
  shot(77.5, 80, { from: [-4.2, 2.6, 12.6], to: [-3.9, 2.6, 11.8], look0: [-2, 2.8, 4.6], look1: [-2, 2.8, 4.4], fov: [32, 32], ap: 0.5, focus: 'look' });
  // Сцена 5
  // общий план: дом в снегу, дым, звёзды — медленный наезд на окно
  shot(80, 86.25, { from: [9.5, 4.6, 31], to: [6.4, 4.4, 22.5], look0: [1.6, 7.2, 0], look1: [2.2, 5.9, 2], fov: [36, 34], ap: 0.25, focus: 'look', snowK: 0.55, glassK: 0.5 });
  // сквозь окно: лиса спит у очага, на подоконнике — снегири
  shot(86.25, 92.5, { from: [2.75, 4.5, 11.4], to: [2.55, 4.3, 9.4], look0: [2.3, 3.6, 2.9], look1: [2.3, 3.55, 2.9], fov: [30, 30], ap: 0.35, focus: 'look', snowK: 0.3, glassK: 0.1 });
  // отъезд: окно → дом → поляна в снегу
  shot(92.5, 104, { from: [3.4, 5.2, 10.5], to: [-34, 27, 50], look0: [2.2, 4.4, 2.5], look1: [0.5, 3.5, 0.5], fov: [34, 30], ap: 0.2, ease: 'io', dur: 9.5, snowK: 0.45, glassK: 0.5 });

  const camOut = { pos: new THREE.Vector3(), look: new THREE.Vector3(), dir: new THREE.Vector3(), fov: 34, roll: 0, focus: 20, aperture: 0.3, snowK: 1 };
  function camera(t) {
    let s = shots[0];
    for (const x of shots) if (t >= x.t0) s = x;
    const dur = s.dur || (s.t1 - s.t0);
    const u = clamp((t - s.t0) / dur);
    const k = (E[s.ease] || E.io)(u);
    const o = camOut;
    if (s.orbit) {
      const r = lerp(s.r[0], s.r[1], k), h = lerp(s.h[0], s.h[1], k), a = lerp(s.a[0], s.a[1], k);
      o.pos.set(s.orbit[0] + Math.sin(a) * r, s.orbit[1] + h, s.orbit[2] + Math.cos(a) * r);
      o.look.set(s.orbit[0], s.orbit[1], s.orbit[2]);
    } else if (s.follow) {
      const lagT = t - (s.lag || 0);
      const base = s.follow === 'head' ? headW() : (() => { const r = RT.eval(lagT); return V3(r.x, r.y, r.z); })();
      o.pos.copy(base).add(v(s.off0).lerp(v(s.off1), k));
      o.look.copy(s.follow === 'head' ? headW() : foxW()).add(v(s.lookOff));
    } else {
      o.pos.copy(v(s.from)).lerp(v(s.to), k);
      o.look.copy(v(s.look0)).lerp(v(s.look1), k);
    }
    // лёгкая «ручная» камера и тряска в бурю
    const hand = 0.035 + (s.shake || 0) * (0.5 + S.wind(t));
    o.pos.x += hand * noise1(t * 1.3 + 3); o.pos.y += hand * noise1(t * 1.1 + 9); o.look.x += hand * 0.5 * noise1(t * 0.9 + 1);
    o.fov = lerp(s.fov[0], s.fov[1], k);
    o.roll = (s.roll || 0) + (s.shake ? s.shake * 0.25 * noise1(t * 6) : 0);
    o.dir.copy(o.look).sub(o.pos).normalize();
    if (s.focus === 'fox') o.focus = o.pos.distanceTo(headW());
    else if (s.focus === 'head') o.focus = o.pos.distanceTo(headW());
    else if (s.focus === 'look') o.focus = o.pos.distanceTo(o.look);
    else o.focus = s.focus;
    o.aperture = s.ap;
    o.snowK = s.snowK ?? 1;
    o.glassK = s.glassK ?? 1;   // насколько «горит» стекло: вблизи сквозь него видно комнату
    o.near = 0.1;
    return o;
  }
  // Затемнения: вход, «шторка» в конце четвёртой сцены, финал
  const fadeT = track([[0, 0], [1.2, 1, 'out2'], [79.35, 1], [79.95, 0, 'in2'], [80.05, 0], [80.9, 1, 'out2'], [102.6, 1], [104, 0, 'in2']]);
  const fade = (t) => fadeT(t);

  cues.sort((a, b) => a.t - b.t);
  return { env, update, camera, fade, cues: cues.filter((c) => c.type !== 'none'), shots, debug: { RT, PT, evalFox } };
};
