/* ================================================================
   puppets.js — куклы. Единый рисованный стиль: чернильный контур,
   плоская заливка с тенью, «кипящая» линия 8 раз в секунду,
   конечности-шланги (rubber hose), лица с 9 эмоциями.
   Поза — чистая функция от состояния актёра и времени t.
   ================================================================ */
(function () {
  'use strict';
  const TAU = Math.PI * 2;
  const INK = '#2a1f1b';
  const LW = 4.2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const smooth = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
  const easeOut = (u) => { u = clamp(u, 0, 1); return 1 - (1 - u) * (1 - u); };
  const easeBack = (u) => { u = clamp(u, 0, 1); const c = 1.9; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); };

  // ---------- «кипение» линии: псевдослучайный сдвиг, меняется 8 раз в секунду ----------
  let BOIL = 0;
  function h01(n) {
    n = (n | 0) ^ 0x9e3779b9; n = Math.imul(n ^ (n >>> 16), 0x85ebca6b); n = Math.imul(n ^ (n >>> 13), 0xc2b2ae35);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }
  let SEQ = 0;
  const jit = (amp) => (h01(SEQ++ * 7919 + BOIL * 104729) - 0.5) * 2 * amp;

  // ---------- примитивы ----------
  // Эллипс с живой линией: 12 точек, сглаживание через середины
  function blobPath(ctx, cx, cy, rx, ry, rot) {
    const n = 12, pts = [];
    const c = Math.cos(rot || 0), s = Math.sin(rot || 0);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const k = 1 + jit(0.018);
      const x = Math.cos(a) * rx * k, y = Math.sin(a) * ry * k;
      pts.push([cx + x * c - y * s, cy + x * s + y * c]);
    }
    smoothClosed(ctx, pts);
  }
  function smoothClosed(ctx, pts) {
    const n = pts.length;
    ctx.beginPath();
    const m0 = [(pts[n - 1][0] + pts[0][0]) / 2, (pts[n - 1][1] + pts[0][1]) / 2];
    ctx.moveTo(m0[0], m0[1]);
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n];
      ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
    }
    ctx.closePath();
  }
  function ink(ctx, w) { ctx.lineWidth = w || LW; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(); }
  function blob(ctx, cx, cy, rx, ry, fill, dark, rot, lw) {
    blobPath(ctx, cx, cy, rx, ry, rot);
    if (dark) {
      ctx.fillStyle = dark; ctx.fill();
      ctx.save(); ctx.clip();
      blobPath(ctx, cx + rx * 0.16, cy - ry * 0.12, rx * 0.97, ry * 0.95, rot);
      ctx.fillStyle = fill; ctx.fill();
      ctx.restore();
      blobPath(ctx, cx, cy, rx, ry, rot);
    } else { ctx.fillStyle = fill; ctx.fill(); }
    if (lw !== 0) ink(ctx, lw);
  }
  // Многоугольник со скруглёнными углами и живой линией
  function poly(ctx, pts, fill, lw, r) {
    const q = pts.map((p) => [p[0] + jit(0.9), p[1] + jit(0.9)]);
    ctx.beginPath();
    const n = q.length, rr = r == null ? 6 : r;
    for (let i = 0; i < n; i++) {
      const p0 = q[(i + n - 1) % n], p1 = q[i], p2 = q[(i + 1) % n];
      const a = Math.min(rr, Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) / 2), b = Math.min(rr, Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 2);
      const d1 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1, d2 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) || 1;
      const s = [p1[0] - ((p1[0] - p0[0]) / d1) * a, p1[1] - ((p1[1] - p0[1]) / d1) * a];
      const e = [p1[0] + ((p2[0] - p1[0]) / d2) * b, p1[1] + ((p2[1] - p1[1]) / d2) * b];
      if (i === 0) ctx.moveTo(s[0], s[1]); else ctx.lineTo(s[0], s[1]);
      ctx.quadraticCurveTo(p1[0], p1[1], e[0], e[1]);
    }
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (lw !== 0) ink(ctx, lw);
  }
  // Конечность-шланг: от сустава до кисти/стопы, изгиб по длине
  function hose(ctx, x0, y0, x1, y1, len, w, fill, bendSign) {
    const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy) || 1;
    const bend = Math.sqrt(Math.max(0, len * len - d * d)) * 0.55 * (bendSign || 1);
    const mx = (x0 + x1) / 2 - (dy / d) * bend + jit(0.8), my = (y0 + y1) / 2 + (dx / d) * bend + jit(0.8);
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(mx, my, x1, y1);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = INK; ctx.lineWidth = w + LW * 2; ctx.stroke();
    ctx.strokeStyle = fill; ctx.lineWidth = w; ctx.stroke();
    return [mx, my];
  }
  function line(ctx, pts, w, color) {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] + jit(0.5), pts[i][1] + jit(0.5));
    ctx.lineWidth = w || LW; ctx.strokeStyle = color || INK; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
  }
  function heart(ctx, x, y, s, fill, lw) {
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.35);
    ctx.bezierCurveTo(x - s * 1.1, y - s * 0.35, x - s * 0.45, y - s * 1.05, x, y - s * 0.45);
    ctx.bezierCurveTo(x + s * 0.45, y - s * 1.05, x + s * 1.1, y - s * 0.35, x, y + s * 0.35);
    ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    if (lw) ink(ctx, lw);
  }

  // ---------- палитры: у каждой куклы 2–3 варианта (два робота — разные) ----------
  const PAL = {
    cat: [
      { fur: '#f29a45', dark: '#cf6f2a', light: '#fff1dc', iris: '#8bd14f', nose: '#f07a8a', stripe: '#c8612a' },
      { fur: '#a3abb5', dark: '#727b86', light: '#f1f3f5', iris: '#f5c542', nose: '#f07a8a', stripe: '#7c8591' },
      { fur: '#f7f1e8', dark: '#cfc3b0', light: '#ffffff', iris: '#58b7e8', nose: '#f07a8a', stripe: '#d9a066' },
    ],
    catVillain: { fur: '#3b3438', dark: '#241e21', light: '#8a7f86', iris: '#e8e04a', nose: '#b35d6a', stripe: '#2b2528' },
    dog: [
      { fur: '#f4e3c6', dark: '#cdb48c', ear: '#a8683a', spot: '#b87645', nose: '#2a1f1b', collar: '#e5484d' },
      { fur: '#c98b4e', dark: '#9c6331', ear: '#6e4221', spot: '#8a5427', nose: '#2a1f1b', collar: '#3f8fd8' },
      { fur: '#ffffff', dark: '#d8d4cf', ear: '#3a3336', spot: '#3a3336', nose: '#2a1f1b', collar: '#f2b33d' },
    ],
    robot: [
      { body: '#8fb6cc', dark: '#5f8398', led: '#7ff4ff', screen: '#1d2a33', accent: '#f2b33d' },
      { body: '#e0925a', dark: '#a9622f', led: '#ffe16b', screen: '#2b1d16', accent: '#5fc6c0' },
      { body: '#b9c96e', dark: '#80903f', led: '#ff8fe0', screen: '#1f2615', accent: '#e5484d' },
    ],
    girl: [
      { skin: '#ffd8bd', hair: '#6d3a20', cloth: '#e5484d', cloth2: '#fff4e4', shoe: '#3c2a48', bow: '#ffd23f' },
      { skin: '#f0c098', hair: '#f0c04c', cloth: '#35a39e', cloth2: '#fff4e4', shoe: '#2a3a5a', bow: '#e5484d' },
      { skin: '#c98d62', hair: '#221a18', cloth: '#f2b33d', cloth2: '#fff4e4', shoe: '#5a2a2a', bow: '#35a39e' },
    ],
    boy: [
      { skin: '#ffd8bd', hair: '#3d2a1f', cloth: '#3f86c9', cloth2: '#2d3c5c', shoe: '#e5484d' },
      { skin: '#e0a676', hair: '#1f1917', cloth: '#f2b33d', cloth2: '#4a5a3a', shoe: '#2a3a5a' },
      { skin: '#ffe1c8', hair: '#c9602e', cloth: '#5bb56a', cloth2: '#3a3150', shoe: '#2a1f1b' },
    ],
    oldman: [
      { skin: '#f6cdab', hair: '#f5f2ea', cloth: '#80603f', cloth2: '#4d4640', shoe: '#2a1f1b' },
      { skin: '#e4b48c', hair: '#dcd8d0', cloth: '#4f6a86', cloth2: '#3a3a40', shoe: '#2a1f1b' },
    ],
    grandma: [
      { skin: '#f6cdab', hair: '#e8e4dc', cloth: '#5f8a63', cloth2: '#4a3e5e', scarf: '#d9463e', dot: '#fff4e4', shoe: '#2a1f1b' },
      { skin: '#e8b890', hair: '#e8e4dc', cloth: '#b56a8f', cloth2: '#3d4a63', scarf: '#3a78c2', dot: '#ffe16b', shoe: '#2a1f1b' },
    ],
    bird: [
      { body: '#4f8fd8', dark: '#356bb0', belly: '#f5a25d', beak: '#f7b52b', leg: '#f08a24' },
      { body: '#e0493f', dark: '#b03129', belly: '#f7e2c2', beak: '#f7b52b', leg: '#f08a24' },
      { body: '#f2c53d', dark: '#c99a1d', belly: '#fff3c9', beak: '#f08a24', leg: '#f08a24' },
    ],
    moon: [{ face: '#fcecb2', dark: '#e9cf7c', crater: '#e3c46e', cheek: '#f7a8a0' }],
    sun: [{ face: '#ffd23f', dark: '#f5a623', ray: '#ff9f1c', cheek: '#ff7a59' }],
    mouse: [
      { fur: '#b9b3ad', dark: '#8d8680', ear: '#f5aab6', light: '#efe9e4' },
      { fur: '#d7bf9f', dark: '#a98f6c', ear: '#f5aab6', light: '#fbf1e2' },
    ],
    bear: [
      { fur: '#8c5a35', dark: '#6a4024', light: '#dba876' },
      { fur: '#f2efe8', dark: '#cfc9bd', light: '#ffffff', patch: '#2d2a2c' },
    ],
    ghost: [{ body: '#f5f8fc', dark: '#cdd7e6' }],
    alien: [
      { skin: '#8fd46f', dark: '#5fa447', cloth: '#c7d2dc', cloth2: '#8f9dab' },
      { skin: '#b690e3', dark: '#8661b8', cloth: '#f2d16b', cloth2: '#c9a43c' },
    ],
  };
  function palette(c) {
    if (c.kind === 'cat' && c.villain) return PAL.catVillain;
    const list = PAL[c.kind] || PAL.boy;
    return list[c.variant % list.length];
  }

  // ---------- риги: пропорции кукол ----------
  const RIG = {
    cat:     { leg: 56, torso: 74, tw: 66, head: 56, arm: 56, lw: 15, tail: 'cat' },
    dog:     { leg: 56, torso: 76, tw: 70, head: 56, arm: 56, lw: 16, tail: 'dog' },
    robot:   { leg: 64, torso: 90, tw: 88, head: 50, arm: 66, lw: 12 },
    girl:    { leg: 74, torso: 82, tw: 62, head: 54, arm: 64, lw: 12 },
    boy:     { leg: 78, torso: 80, tw: 64, head: 54, arm: 64, lw: 12 },
    oldman:  { leg: 78, torso: 98, tw: 74, head: 54, arm: 70, lw: 13, hunch: 0.12 },
    grandma: { leg: 70, torso: 98, tw: 84, head: 52, arm: 64, lw: 13, hunch: 0.08 },
    bird:    { leg: 34, torso: 62, tw: 80, head: 0, arm: 44, lw: 6 },
    mouse:   { leg: 36, torso: 50, tw: 46, head: 42, arm: 36, lw: 9, tail: 'mouse' },
    bear:    { leg: 64, torso: 114, tw: 116, head: 64, arm: 74, lw: 24, tail: 'bear' },
    alien:   { leg: 62, torso: 62, tw: 50, head: 64, arm: 60, lw: 10 },
    moon:    { float: true, r: 104, arm: 44, lw: 11 },
    sun:     { float: true, r: 92, arm: 44, lw: 11 },
    ghost:   { float: true, r: 86, arm: 38, lw: 16 },
  };

  // ================================================================
  //  Поза: чистая функция от состояния актёра (info) и времени t.
  //  Руки/ноги задаются точкой кисти/стопы относительно сустава,
  //  всё в «каноничной» позе лицом вправо.
  // ================================================================
  function computePose(info, c, t) {
    const rig = RIG[c.kind] || RIG.boy;
    const A = rig.arm || 50, Lg = rig.leg || 40;
    const T = t + c.variant * 1.7 + (c.seed % 97) * 0.13;
    const e = info.emo;
    const P = {
      sq: 1, lean: rig.hunch || 0, bob: 0, lie: 0, tilt: 0, scale: 1, rot: 0, dx: 0,
      armN: [10, A * 0.9], armF: [-8, A * 0.9], legN: [0, 0], legF: [0, 0],
      mouth: 0, mouthShape: null, look: [0.4, 0.05], blink: 0, closed: 0, dizzy: false,
      wag: Math.sin(T * 2.1) * 0.25, flap: 0, fly: false, elbowOut: false, float: Math.sin(T * 1.6) * 7,
    };
    // дыхание и моргание
    P.sq = 1 + Math.sin(T * 2.3) * 0.014;
    if ((T * 0.31) % 1 < 0.035) P.blink = 1;
    // поза эмоции
    switch (e) {
      case 'happy': P.bob = -Math.abs(Math.sin(T * 3.4)) * 3; P.tilt = Math.sin(T * 1.7) * 0.05; P.armN = [16, A * 0.82]; P.armF = [-14, A * 0.82]; P.wag = Math.sin(T * 16) * 0.5; break;
      case 'sad': P.lean += 0.14; P.tilt = 0.16; P.look = [0.25, 0.75]; P.sq *= 0.975; P.armN = [4, A * 0.98]; P.armF = [-3, A * 0.98]; P.wag = -0.5; break;
      case 'angry': P.lean += 0.05; P.armN = [-4, A * 0.5]; P.armF = [-16, A * 0.48]; P.elbowOut = true; P.dx = Math.sin(T * 31) * 0.8; P.wag = Math.sin(T * 9) * 0.35; break;
      case 'scared': P.dx = Math.sin(T * 43) * 1.6; P.armN = [22, -A * 0.12]; P.armF = [15, -A * 0.06]; P.sq *= 0.96; P.look = [0.8, 0]; P.wag = -0.7; break;
      case 'surprised': P.sq *= 1.03; P.armN = [30, A * 0.35]; P.armF = [-26, A * 0.35]; break;
      case 'love': P.tilt = Math.sin(T * 1.9) * 0.09; P.armN = [22, A * 0.36]; P.armF = [17, A * 0.4]; P.bob = -Math.abs(Math.sin(T * 1.9)) * 2; P.wag = Math.sin(T * 10) * 0.4; break;
      case 'sly': { const r = Math.sin(T * 7); P.lean += 0.08; P.armN = [21 + r * 3, A * 0.42]; P.armF = [16 - r * 3, A * 0.44]; P.look = [1, 0.1]; break; }
      case 'tired': P.lean += 0.2; P.sq *= 0.95; P.armN = [2, A]; P.armF = [-1, A]; P.look = [0.3, 0.4]; P.tilt = 0.12; P.wag = -0.4; break;
    }
    // «вздрог» при смене эмоции — сжатие-растяжение
    if (info.emoT > 0 && info.emoT < 0.4) { const k = info.emoT / 0.4; P.sq *= 1 + Math.sin(k * Math.PI) * 0.14 * (1 - k * 0.5); }

    // реплика: рот и жест (жест — только если тело свободно)
    const talk = info.talk;
    const freeBody = info.act === 'idle' || info.act === 'look' || info.act === 'turn';
    if (talk) {
      const lt = t - talk.t0, D = talk.t1 - talk.t0;
      const typing = lt < D * 0.78;
      if (talk.kind !== 'think' && typing) P.mouth = Math.max(0, Math.sin(lt * 17 + Math.sin(lt * 5.3) * 2)) * 0.85 + 0.12;
      if (freeBody) {
        if (talk.kind === 'think') { P.armN = [24, -A * 0.1]; P.tilt = -0.1; P.look = [0.45, -0.9]; }
        else if (talk.kind === 'sing') {
          P.tilt = Math.sin(lt * 2.6) * 0.12 - 0.08; P.armN = [32, -A * 0.12 + Math.sin(lt * 2.6) * 8]; P.armF = [-26, -A * 0.06];
          P.mouthShape = 'o'; P.bob = -Math.abs(Math.sin(lt * 2.6)) * 4; if (e === 'love' || e === 'happy') P.closed = 1;
        } else if (e !== 'sad' && e !== 'tired' && e !== 'scared') {
          const g = Math.sin(lt * 4.2), g2 = Math.cos(lt * 3.1);
          P.armN = e === 'angry' ? [30 + g * 5, -A * 0.25 + Math.sin(lt * 14) * 6] : e === 'love' ? [24, A * 0.34] : [30 + g * 9, A * 0.28 + g2 * 12];
          P.bob += -Math.abs(Math.sin(lt * 8.5)) * 1.6;
          P.look = [0.9, 0];
        }
      }
    }
    // спал и продолжает спать
    if (info.act === 'idle' && info.lie >= 1) { P.lie = 1; P.closed = 3; P.sq *= 1 + Math.sin(T * 1.6) * 0.02; P.armN = [14, A * 0.4]; P.mouth = 0; }
    // вставание, если действие началось лёжа
    if (info.a && info.a.lie >= 1 && !['sleep', 'fall', 'knock', 'idle'].includes(info.act)) P.lie = 1 - smooth(info.lt / 0.4);

    const u = info.u, lt = info.lt;
    switch (info.act) {
      case 'walk': case 'run': {
        const run = info.act === 'run';
        const stride = Lg * (run ? 0.62 : 0.4);
        const vpx = Math.abs(info.b.x - info.a.x) * 13.2 / Math.max(info.dur, 0.2);
        const f = clamp(vpx / (TAU * stride), run ? 2 : 1.1, run ? 3.6 : 2.6);
        const ph = lt * f * TAU;
        const lift = Lg * (run ? 0.42 : 0.22);
        P.legN = [Math.sin(ph) * stride, Math.max(0, Math.cos(ph)) * lift];
        P.legF = [Math.sin(ph + Math.PI) * stride, Math.max(0, Math.cos(ph + Math.PI)) * lift];
        P.bob = -Math.abs(Math.cos(ph)) * (run ? 9 : 5) + (run ? 4 : 2);
        const sw = run ? 30 : 18;
        if (run) { P.armN = [-Math.sin(ph) * sw + 8, A * 0.5]; P.armF = [Math.sin(ph) * sw - 2, A * 0.5]; P.lean = (rig.hunch || 0) + 0.24; }
        else { P.armN = [-Math.sin(ph) * sw + 4, A * 0.9]; P.armF = [Math.sin(ph) * sw - 4, A * 0.9]; P.lean = (rig.hunch || 0) + 0.05 + (e === 'sad' || e === 'tired' ? 0.12 : 0); }
        if (e === 'scared' && run) { P.armN = [26, -A * 0.5]; P.armF = [18, -A * 0.6]; }
        P.sq *= 1 - (1 - Math.abs(Math.cos(ph))) * (run ? 0.05 : 0.025);
        P.flap = Math.sin(lt * 18);
        break;
      }
      case 'fly':
        P.fly = true; P.flap = Math.sin(lt * 17);
        P.legN = [-6, Lg * 0.35]; P.legF = [-14, Lg * 0.25];
        if (!rig.float && c.kind !== 'bird') { P.lean = 0.35; P.armN = [44, -A * 0.35]; P.armF = [30, -A * 0.2]; P.legN = [-22, Lg * 0.4]; P.legF = [-30, Lg * 0.3]; }
        P.bob = Math.sin(lt * 5) * 3;
        break;
      case 'jump':
        if (u < 0.22) { const k = u / 0.22; P.sq = 1 - 0.24 * Math.sin((k * Math.PI) / 2); P.armN = [-18, A * 0.7]; P.armF = [-26, A * 0.66]; }
        else if (u < 0.8) {
          const s = (u - 0.22) / 0.58;
          P.sq = 1 + 0.17 * (1 - s) * (s < 0.5 ? 1 : 0.5);
          P.armN = [22, -A * 0.82]; P.armF = [10, -A * 0.86];
          P.legN = s < 0.6 ? [8, Lg * 0.34] : [5, Lg * 0.1]; P.legF = s < 0.6 ? [-10, Lg * 0.4] : [-5, Lg * 0.1];
          P.flap = Math.sin(lt * 18);
        } else { const k = (u - 0.8) / 0.2; P.sq = 1 - 0.22 * Math.sin(k * Math.PI); P.armN = [20, A * 0.5]; P.armF = [-16, A * 0.5]; }
        break;
      case 'fall':
        if (u < 0.12) { const k = u / 0.12; P.lean += 0.3 * k; P.armN = [30, -A * 0.6 * k]; P.armF = [-20, -A * 0.7 * k]; P.legN = [14 * k, 8 * k]; e === 'neutral' && (P.mouthShape = 'o'); }
        else if (u < 0.3) { const k = (u - 0.12) / 0.18; P.lie = k * k; P.armN = [30, -A * 0.7]; P.armF = [-24, -A * 0.8]; P.legN = [Lg * 0.5, Lg * 0.55]; P.legF = [Lg * 0.3, Lg * 0.45]; P.sq = 1.08; P.mouthShape = 'o'; }
        else if (u < 0.36) { const k = (u - 0.3) / 0.06; P.lie = 1; P.sq = 1 - 0.18 * Math.sin(k * Math.PI); }
        else if (u < 0.74) { P.lie = 1; P.dizzy = true; P.armN = [20, A * 0.5]; P.legN = [10, 10]; }
        else { const k = (u - 0.74) / 0.26; P.lie = 1 - easeOut(k); P.sq = 1 + Math.sin(k * Math.PI) * 0.08; P.dizzy = k < 0.35; }
        break;
      case 'knock':
        if (u < 0.3) { const k = u / 0.3; P.lie = easeOut(k); P.armN = [34, -A * 0.6]; P.armF = [26, -A * 0.7]; P.legN = [Lg * 0.4, Lg * 0.4]; P.sq = 1.06; P.mouthShape = 'o'; }
        else if (u < 0.36) { P.lie = 1; P.sq = 1 - 0.2 * Math.sin(((u - 0.3) / 0.06) * Math.PI); }
        else if (u < 0.74) { P.lie = 1; P.dizzy = true; }
        else { const k = (u - 0.74) / 0.26; P.lie = 1 - easeOut(k); P.dizzy = k < 0.35; }
        break;
      case 'hug': {
        const reach = smooth((u - 0.12) / 0.16) * (1 - smooth((u - 0.86) / 0.14));
        if (u < 0.16) { const k = smooth(u / 0.12); P.armN = [lerp(P.armN[0], 36, k), lerp(P.armN[1], -A * 0.45, k)]; P.armF = [lerp(P.armF[0], -30, k), lerp(P.armF[1], -A * 0.4, k)]; P.sq *= 1 + 0.06 * k; }
        else { P.armN = [lerp(30, 66, reach), lerp(A * 0.2, A * 0.22, reach)]; P.armF = [lerp(-10, 58, reach), lerp(A * 0.4, A * 0.16, reach)]; }
        P.lean = (rig.hunch || 0) + 0.12 * reach;
        P.sq *= 1 - Math.sin(clamp((u - 0.28) / 0.55, 0, 1) * Math.PI * 3) * 0.035 * reach;
        if (reach > 0.5 && e !== 'angry' && e !== 'sly' && e !== 'scared') P.closed = 1;
        P.tilt = 0.14 * reach; P.wag = Math.sin(lt * 16) * 0.5;
        break;
      }
      case 'selfhug': P.armN = [26, A * 0.3]; P.armF = [24, A * 0.26]; P.closed = 1; P.tilt = Math.sin(lt * 3) * 0.1; break;
      case 'look':
        P.lean += 0.05 * smooth(u / 0.3);
        P.look = info.p.up ? [0.45, -0.95] : [1, 0];
        P.tilt = info.p.up ? -0.18 : 0.04;
        if (u < 0.18) P.sq *= 1 - 0.06 * Math.sin((u / 0.18) * Math.PI);
        break;
      case 'wave': {
        const k = smooth(u / 0.15) * (1 - smooth((u - 0.88) / 0.12));
        P.armN = [lerp(P.armN[0], 22 + Math.sin(lt * 11) * 16, k), lerp(P.armN[1], -A * 0.86, k)];
        P.tilt = -0.06 * k; P.bob = -Math.abs(Math.sin(lt * 5.5)) * 3 * k;
        break;
      }
      case 'dance': {
        const b = lt * 2.3 * Math.PI, s = Math.sin(b / 2);
        P.bob = -Math.abs(Math.sin(b)) * 14; P.sq *= 1 + Math.sin(b * 2) * 0.05;
        P.lean = Math.sin(b / 2) * 0.16; P.tilt = -s * 0.12;
        P.armN = [20 + s * 10, -A * (0.5 + 0.4 * Math.max(0, s))]; P.armF = [-14 - s * 10, -A * (0.5 + 0.4 * Math.max(0, -s))];
        P.legN = [Math.sin(b) * 10, Math.max(0, Math.sin(b)) * 14]; P.legF = [-Math.sin(b) * 10, Math.max(0, -Math.sin(b)) * 14];
        if (e === 'happy' || e === 'love') P.closed = 1;
        P.wag = Math.sin(lt * 16) * 0.6; P.flap = Math.sin(lt * 12);
        break;
      }
      case 'cry':
        P.armN = [22, -A * 0.58]; P.armF = [18, -A * 0.52]; P.bob = -Math.abs(Math.sin(lt * 8)) * 3; P.lean += 0.08;
        P.closed = 2; P.mouth = 0.55 + Math.sin(lt * 8) * 0.3; P.mouthShape = 'wail';
        break;
      case 'laugh':
        P.lean -= 0.14; P.sq *= 1 + Math.sin(lt * 26) * 0.035; P.armN = [18, A * 0.45]; P.armF = [14, A * 0.5];
        P.closed = 1; P.mouth = 0.7 + Math.sin(lt * 26) * 0.25; P.mouthShape = 'laugh'; P.bob = -Math.abs(Math.sin(lt * 13)) * 3;
        break;
      case 'sleep':
        P.lie = smooth(u / 0.25); P.closed = 3; P.sq *= 1 + Math.sin(lt * 1.6) * 0.02; P.armN = [14, A * 0.4]; P.armF = [10, A * 0.45]; P.legN = [10, 8];
        break;
      case 'shake':
        P.dx = Math.sin(lt * 50) * 3.2; P.armN = [22, -A * 0.25]; P.armF = [18, -A * 0.2]; P.sq *= 0.95; P.look = [Math.sin(lt * 3), 0];
        break;
      case 'take': {
        const s = Math.sin(clamp(u / 0.7, 0, 1) * Math.PI);
        P.lean += 0.6 * s; P.sq *= 1 - 0.1 * s; P.bob = 8 * s;
        P.armN = [lerp(10, 34, s), lerp(A * 0.9, A * 1.2, s)];
        if (u > 0.7) { const k = smooth((u - 0.7) / 0.3); P.armN = [lerp(24, 22, k), lerp(A * 0.6, -A * 0.75, k)]; if (e === 'happy') P.closed = 1; }
        break;
      }
      case 'show': {
        // уже держит предмет: поднимает его повыше и любуется
        const k = smooth(u / 0.25) * (1 - smooth((u - 0.82) / 0.18));
        P.armN = [lerp(P.armN[0], 26, k), lerp(P.armN[1], -A * 0.82, k)];
        P.tilt = -0.08 * k; P.look = [0.6, -0.8];
        P.bob = -Math.abs(Math.sin(lt * 6)) * 3 * k;
        if (k > 0.5 && (e === 'happy' || e === 'love')) P.closed = 1;
        break;
      }
      case 'give': {
        const k = smooth(u / 0.35) * (1 - smooth((u - 0.8) / 0.2));
        P.armN = [lerp(12, 62, k), lerp(A * 0.9, A * 0.25, k)]; P.lean += 0.1 * k;
        break;
      }
      case 'receive': {
        const k = smooth((u - 0.2) / 0.3);
        P.armN = u < 0.7 ? [lerp(12, 56, k), lerp(A * 0.9, A * 0.28, k)] : [lerp(56, 22, smooth((u - 0.7) / 0.3)), lerp(A * 0.28, A * 0.34, smooth((u - 0.7) / 0.3))];
        if (u > 0.6 && e !== 'angry' && e !== 'sly') P.closed = 1;
        break;
      }
      case 'push':
        if (u < 0.3) { const k = smooth(u / 0.3); P.lean -= 0.18 * k; P.armN = [lerp(10, -24, k), A * 0.45]; P.sq *= 1 - 0.06 * k; }
        else if (u < 0.5) { const k = easeOut((u - 0.3) / 0.2); P.lean += lerp(-0.18, 0.34, k); P.armN = [lerp(-24, 72, k), lerp(A * 0.45, A * 0.1, k)]; P.armF = [lerp(-10, 44, k), A * 0.3]; P.sq *= 1 + 0.08 * k; }
        else { const k = smooth((u - 0.5) / 0.5); P.lean += lerp(0.34, 0, k); P.armN = [lerp(72, 10, k), lerp(A * 0.1, A * 0.9, k)]; }
        break;
      case 'appear': P.scale = easeBack(u / 0.6); P.rot = (1 - smooth(u / 0.6)) * 0.6; break;
      case 'vanish': P.scale = u < 0.3 ? 1 + 0.12 * Math.sin((u / 0.3) * Math.PI / 2) : Math.max(0, lerp(1.12, 0, smooth((u - 0.3) / 0.4))); P.rot = -smooth((u - 0.3) / 0.4) * 0.6; break;
      case 'turn': P.sq *= 1 - 0.08 * Math.sin(u * Math.PI); P.bob = 3 * Math.sin(u * Math.PI); break;
    }
    if (P.blink && !P.closed) P.closed = 3;
    return P;
  }

  // ================================================================
  //  Лицо: глаза, веки, брови, рот. o = {x,y,r, e1,e2 (x глаз), ey, er, skin, brow, style}
  // ================================================================
  const BROWS = { // [подъём, наклон внутреннего края]  наклон>0 — внутренний край вниз (злость)
    neutral: [0, 0.05], happy: [-0.12, -0.1], sad: [-0.02, -0.5], angry: [0.1, 0.62], scared: [-0.2, -0.45],
    surprised: [-0.3, -0.05], love: [-0.14, -0.2], sly: [0.02, 0.35], tired: [0.1, -0.1],
  };
  function eyeLid(ctx, x, y, rx, ry, emo, side, skin) {
    // верхнее веко: заливка цветом кожи поверх глаза (внутри клипа)
    let a = 0, cover = 0;
    if (emo === 'sad') { cover = 0.35; a = -0.35 * side; }
    else if (emo === 'angry') { cover = 0.38; a = 0.45 * side; }
    else if (emo === 'sly') { cover = 0.5; a = 0.12 * side; }
    else if (emo === 'tired') { cover = 0.55; a = 0; }
    if (!cover) return;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(a);
    ctx.fillStyle = skin;
    ctx.fillRect(-rx * 1.6, -ry * 1.6, rx * 3.2, ry * (cover * 2) + ry * 0.6 - ry * 0);
    ctx.beginPath(); ctx.moveTo(-rx * 1.3, -ry + ry * cover * 2); ctx.lineTo(rx * 1.3, -ry + ry * cover * 2);
    ctx.lineWidth = LW * 0.9; ctx.strokeStyle = INK; ctx.stroke();
    ctx.restore();
  }
  function drawEyes(ctx, o, P) {
    const emo = P.emo;
    const er = o.er;
    const big = emo === 'scared' || emo === 'surprised' ? 1.18 : 1;
    const eyes = [[o.e1, -1], [o.e2, 1]];
    if (P.dizzy) {
      for (const [ex] of eyes) {
        ctx.beginPath();
        for (let k = 0; k < 26; k++) { const a = k * 0.55 + P.spin, rr = (k / 26) * er * 0.95; const px = ex + Math.cos(a) * rr, py = o.ey + Math.sin(a) * rr; k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(ex, o.ey, er * 0.95, er, 0, 0, TAU); ctx.fill(); ink(ctx, LW * 0.8);
        ctx.beginPath();
        for (let k = 0; k < 26; k++) { const a = k * 0.55 + P.spin, rr = (k / 26) * er * 0.85; const px = ex + Math.cos(a) * rr, py = o.ey + Math.sin(a) * rr; k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
        ink(ctx, LW * 0.7);
      }
      return;
    }
    if (emo === 'love' && !P.closed) {
      const pulse = 1 + Math.sin(P.T * 9) * 0.1;
      for (const [ex] of eyes) heart(ctx, ex, o.ey + er * 0.3, er * 1.15 * pulse, '#e8364a', LW * 0.8);
      return;
    }
    if (P.closed) {
      for (const [ex, side] of eyes) {
        ctx.beginPath();
        if (P.closed === 1) { ctx.arc(ex, o.ey + er * 0.35, er * 0.75, Math.PI * 1.1, Math.PI * 1.9); }           // ^^ счастливые
        else if (P.closed === 2) { ctx.moveTo(ex - er * 0.7 * side, o.ey - er * 0.5); ctx.lineTo(ex + er * 0.5 * side, o.ey); ctx.lineTo(ex - er * 0.7 * side, o.ey + er * 0.5); } // >< зажмурился
        else { ctx.arc(ex, o.ey - er * 0.1, er * 0.72, Math.PI * 0.12, Math.PI * 0.88); }                     // сон
        ink(ctx, LW);
      }
      return;
    }
    for (const [ex, side] of eyes) {
      const rx = er * 0.82 * big, ry = er * big;
      ctx.beginPath(); ctx.ellipse(ex, o.ey, rx, ry, 0, 0, TAU);
      ctx.fillStyle = o.sclera || '#fffdf7'; ctx.fill();
      ctx.save(); ctx.clip();
      const pr = er * (emo === 'scared' ? 0.28 : emo === 'surprised' ? 0.34 : 0.5);
      const px = ex + P.look[0] * rx * 0.42, py = o.ey + P.look[1] * ry * 0.42 + er * 0.06;
      if (o.iris) { ctx.beginPath(); ctx.arc(px, py, pr * 1.45, 0, TAU); ctx.fillStyle = o.iris; ctx.fill(); }
      ctx.beginPath(); ctx.arc(px, py, pr, 0, TAU); ctx.fillStyle = INK; ctx.fill();
      ctx.beginPath(); ctx.arc(px - pr * 0.35, py - pr * 0.4, pr * 0.34, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill();
      eyeLid(ctx, ex, o.ey, rx, ry, emo, side, o.skin);
      ctx.restore();
      ctx.beginPath(); ctx.ellipse(ex, o.ey, rx, ry, 0, 0, TAU); ink(ctx, LW * 0.85);
      if (o.lashes) { line(ctx, [[ex + rx * 0.7, o.ey - ry * 0.6], [ex + rx * 1.25, o.ey - ry * 0.95]], LW * 0.7); }
    }
  }
  function drawBrows(ctx, o, P) {
    if (o.noBrow) return;
    const emo = P.closed === 2 ? 'sad' : P.emo;
    const [lift, tiltIn] = BROWS[emo] || BROWS.neutral;
    const w = o.er * 0.95, y0 = o.ey - o.er * (1.45 + (o.browUp || 0)) + lift * o.er * 2;
    const brows = [[o.e1, -1], [o.e2, 1]];
    brows.forEach(([ex, side], i) => {
      let tin = tiltIn;
      if (P.emo === 'sly' && i === 1) tin = -0.3;
      // внутренний край — к центру лица (между глазами)
      const inX = ex - side * w * 0.9, outX = ex + side * w * 0.9;
      const inY = y0 + tin * o.er * 0.9, outY = y0 - tin * o.er * 0.25;
      ctx.beginPath(); ctx.moveTo(outX, outY); ctx.quadraticCurveTo(ex, Math.min(inY, outY) - o.er * 0.25, inX, inY);
      ctx.lineWidth = o.browW || LW * 1.5; ctx.strokeStyle = o.browColor || INK; ctx.lineCap = 'round'; ctx.stroke();
      if (o.browColor) { ctx.lineWidth = 2; ctx.strokeStyle = INK; }
    });
  }
  function drawMouth(ctx, o, P) {
    const x = o.mx, y = o.my, w = o.mw;
    const emo = P.emo;
    const open = P.mouth;
    ctx.lineCap = 'round';
    if (P.mouthShape === 'o' || (open > 0.15 && emo === 'surprised')) {
      const s = 0.55 + open * 0.4;
      ctx.beginPath(); ctx.ellipse(x, y + w * 0.1, w * 0.32 * s, w * 0.42 * s, 0, 0, TAU); ctx.fillStyle = '#5b1d22'; ctx.fill(); ink(ctx, LW * 0.85);
      return;
    }
    if (open > 0.15 || P.mouthShape === 'laugh' || P.mouthShape === 'wail') {
      const h = w * (0.2 + open * 0.55);
      const sad = emo === 'sad' || P.mouthShape === 'wail' || emo === 'scared';
      const m = new Path2D();
      if (sad) { m.moveTo(x - w * 0.5, y + h * 0.5); m.quadraticCurveTo(x, y - h * 0.9, x + w * 0.5, y + h * 0.5); m.quadraticCurveTo(x, y + h * 0.9, x - w * 0.5, y + h * 0.5); }
      else { m.moveTo(x - w * 0.55, y - h * 0.15); m.quadraticCurveTo(x, y - h * 0.05, x + w * 0.55, y - h * 0.15); m.quadraticCurveTo(x + w * 0.1, y + h * 1.4, x - w * 0.55, y - h * 0.15); }
      m.closePath();
      ctx.fillStyle = '#5b1d22'; ctx.fill(m);
      ctx.save(); ctx.clip(m); ctx.beginPath(); ctx.ellipse(x, y + h * 0.9, w * 0.3, h * 0.45, 0, 0, TAU); ctx.fillStyle = '#e8737a'; ctx.fill(); ctx.restore();
      ctx.lineWidth = LW * 0.85; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.stroke(m);
      return;
    }
    ctx.beginPath();
    switch (emo) {
      case 'happy': case 'love':
        ctx.moveTo(x - w * 0.5, y - w * 0.08); ctx.quadraticCurveTo(x, y + w * 0.5, x + w * 0.5, y - w * 0.08); break;
      case 'sad': case 'scared':
        ctx.moveTo(x - w * 0.4, y + w * 0.16); ctx.quadraticCurveTo(x, y - w * 0.2, x + w * 0.4, y + w * 0.16);
        if (emo === 'scared') { ctx.moveTo(x - w * 0.4, y + w * 0.16); }
        break;
      case 'angry':
        ctx.moveTo(x - w * 0.42, y + w * 0.12); ctx.lineTo(x - w * 0.14, y); ctx.lineTo(x + w * 0.14, y + w * 0.08); ctx.lineTo(x + w * 0.42, y - w * 0.02); break;
      case 'surprised':
        ctx.ellipse(x, y + w * 0.05, w * 0.16, w * 0.22, 0, 0, TAU); ctx.fillStyle = '#5b1d22'; ctx.fill(); break;
      case 'sly':
        ctx.moveTo(x - w * 0.4, y + w * 0.04); ctx.quadraticCurveTo(x + w * 0.1, y + w * 0.2, x + w * 0.5, y - w * 0.22); break;
      case 'tired':
        ctx.moveTo(x - w * 0.3, y + w * 0.05); ctx.lineTo(x + w * 0.3, y + w * 0.08); break;
      default:
        ctx.moveTo(x - w * 0.36, y); ctx.quadraticCurveTo(x, y + w * 0.24, x + w * 0.36, y);
    }
    ink(ctx, LW * 0.9);
  }
  function cheeks(ctx, o, P, color) {
    if (!(P.emo === 'love' || P.emo === 'happy' || o.blush)) return;
    ctx.globalAlpha = P.emo === 'love' ? 0.65 : 0.4;
    ctx.fillStyle = color || '#f28b8b';
    ctx.beginPath(); ctx.ellipse(o.e1 - o.er * 0.4, o.ey + o.er * 1.25, o.er * 0.55, o.er * 0.3, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(o.e2 + o.er * 0.5, o.ey + o.er * 1.25, o.er * 0.45, o.er * 0.28, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  }
  function face(ctx, o, P) {
    cheeks(ctx, o, P, o.cheek);
    drawEyes(ctx, o, P);
    drawBrows(ctx, o, P);
    if (!o.noMouth) drawMouth(ctx, o, P);
  }
  // Экран-лицо робота: светодиодные глаза
  function ledFace(ctx, o, P, led) {
    ctx.save();
    ctx.shadowColor = led; ctx.shadowBlur = 10;
    ctx.strokeStyle = led; ctx.fillStyle = led; ctx.lineWidth = 5; ctx.lineCap = 'round';
    const er = o.er, emo = P.emo;
    for (const [ex, side] of [[o.e1, -1], [o.e2, 1]]) {
      ctx.beginPath();
      if (P.dizzy) { ctx.moveTo(ex - er * 0.5, o.ey - er * 0.5); ctx.lineTo(ex + er * 0.5, o.ey + er * 0.5); ctx.moveTo(ex + er * 0.5, o.ey - er * 0.5); ctx.lineTo(ex - er * 0.5, o.ey + er * 0.5); ctx.stroke(); }
      else if (emo === 'love' && !P.closed) { ctx.shadowBlur = 12; heart(ctx, ex, o.ey + er * 0.2, er * 0.9, led, 0); }
      else if (P.closed === 1 || emo === 'happy') { ctx.arc(ex, o.ey + er * 0.3, er * 0.55, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
      else if (P.closed) { ctx.moveTo(ex - er * 0.5, o.ey); ctx.lineTo(ex + er * 0.5, o.ey); ctx.stroke(); }
      else if (emo === 'sad') { ctx.moveTo(ex - er * 0.5, o.ey - side * er * 0.25); ctx.lineTo(ex + er * 0.5, o.ey + side * er * 0.25); ctx.stroke(); }
      else if (emo === 'angry') { ctx.moveTo(ex - er * 0.55, o.ey + side * er * 0.25); ctx.lineTo(ex + er * 0.55, o.ey - side * er * 0.25); ctx.stroke(); ctx.beginPath(); ctx.arc(ex, o.ey + er * 0.25, er * 0.2, 0, TAU); ctx.fill(); }
      else if (emo === 'tired' || emo === 'sly') { ctx.fillRect(ex - er * 0.5, o.ey, er, er * 0.3); }
      else { const s = emo === 'surprised' || emo === 'scared' ? 0.55 : 0.4; ctx.arc(ex + P.look[0] * er * 0.2, o.ey + P.look[1] * er * 0.2, er * s, 0, TAU); emo === 'scared' ? ctx.stroke() : ctx.fill(); }
    }
    // рот-полоска
    ctx.beginPath();
    const mx = o.mx, my = o.my, w = o.mw;
    if (P.mouth > 0.15) { const n = 5; for (let i = 0; i <= n; i++) { const x = mx - w / 2 + (w * i) / n; const y = my - Math.abs(Math.sin(P.T * 20 + i * 1.7)) * P.mouth * w * 0.35; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } }
    else if (emo === 'happy' || emo === 'love') { ctx.moveTo(mx - w / 2, my - w * 0.1); ctx.quadraticCurveTo(mx, my + w * 0.35, mx + w / 2, my - w * 0.1); }
    else if (emo === 'sad' || emo === 'scared') { ctx.moveTo(mx - w / 2, my + w * 0.15); ctx.quadraticCurveTo(mx, my - w * 0.25, mx + w / 2, my + w * 0.15); }
    else if (emo === 'angry') { for (let i = 0; i <= 6; i++) { const x = mx - w / 2 + (w * i) / 6; const y = my + (i % 2 ? -w * 0.1 : w * 0.1); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } }
    else if (emo === 'surprised') { ctx.arc(mx, my, w * 0.18, 0, TAU); }
    else { ctx.moveTo(mx - w / 2, my); ctx.lineTo(mx + w / 2, my); }
    ctx.stroke();
    ctx.restore();
  }

  // ================================================================
  //  Аксессуары: цилиндр, корона, бантик, очки, кепка, усы
  // ================================================================
  function hat(ctx, look, x, y, r, tilt) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(tilt || 0);
    if (look === 'tophat') {
      poly(ctx, [[-r * 0.55, -r * 0.05], [-r * 0.5, -r * 1.05], [r * 0.5, -r * 1.05], [r * 0.55, -r * 0.05]], '#2d2629', LW, 5);
      ctx.fillStyle = '#c23b3b'; ctx.fillRect(-r * 0.53, -r * 0.34, r * 1.06, r * 0.2);
      poly(ctx, [[-r * 0.95, 0], [-r * 0.9, -r * 0.14], [r * 0.9, -r * 0.14], [r * 0.95, 0]], '#2d2629', LW, 6);
    } else if (look === 'crown') {
      poly(ctx, [[-r * 0.6, 0], [-r * 0.7, -r * 0.7], [-r * 0.3, -r * 0.35], [0, -r * 0.85], [r * 0.3, -r * 0.35], [r * 0.7, -r * 0.7], [r * 0.6, 0]], '#f5c542', LW, 3);
      ctx.fillStyle = '#e5484d'; ctx.beginPath(); ctx.arc(0, -r * 0.2, r * 0.1, 0, TAU); ctx.fill();
    } else if (look === 'cap') {
      blob(ctx, 0, -r * 0.1, r * 0.78, r * 0.42, '#e5484d', '#b8323a', 0);
      poly(ctx, [[r * 0.3, -r * 0.08], [r * 1.25, 0], [r * 1.2, r * 0.12], [r * 0.3, r * 0.1]], '#c23b3b', LW, 6);
    } else if (look === 'bow') {
      ctx.translate(-r * 0.4, -r * 0.1); ctx.rotate(-0.4);
      poly(ctx, [[0, 0], [-r * 0.45, -r * 0.3], [-r * 0.45, r * 0.3]], '#e5484d', LW, 5);
      poly(ctx, [[0, 0], [r * 0.45, -r * 0.3], [r * 0.45, r * 0.3]], '#e5484d', LW, 5);
      blob(ctx, 0, 0, r * 0.13, r * 0.13, '#c23b3b', null, 0);
    }
    ctx.restore();
  }
  function glasses(ctx, o) {
    ctx.lineWidth = LW * 0.8; ctx.strokeStyle = INK;
    for (const ex of [o.e1, o.e2]) { ctx.beginPath(); ctx.arc(ex, o.ey, o.er * 1.25, 0, TAU); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(o.e1 + o.er * 1.25, o.ey); ctx.lineTo(o.e2 - o.er * 1.25, o.ey); ctx.stroke();
    ctx.globalAlpha = 0.25; ctx.fillStyle = '#fff';
    for (const ex of [o.e1, o.e2]) { ctx.beginPath(); ctx.arc(ex - o.er * 0.4, o.ey - o.er * 0.4, o.er * 0.35, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  function mustache(ctx, x, y, s, color) {
    ctx.fillStyle = color || INK;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x + side * s * 0.5, y - s * 0.35, x + side * s * 1.05, y + s * 0.1, x + side * s * 1.25, y - s * 0.35);
      ctx.bezierCurveTo(x + side * s * 1.1, y + s * 0.35, x + side * s * 0.5, y + s * 0.3, x, y + s * 0.12);
      ctx.fill();
    }
  }

  // ---------- цвета конечностей, затемнение дальних частей ----------
  const DK = new Map();
  function dk(hex, k) {
    const key = hex + (k || 0.22);
    if (DK.has(key)) return DK.get(key);
    const n = parseInt(hex.slice(1), 16), f = 1 - (k || 0.22);
    const v = `rgb(${Math.round((n >> 16) * f)},${Math.round(((n >> 8) & 255) * f)},${Math.round((n & 255) * f)})`;
    DK.set(key, v);
    return v;
  }
  function limbs(c, pal) {
    switch (c.kind) {
      case 'cat': return { arm: pal.fur, leg: pal.fur, hand: pal.light, foot: pal.light };
      case 'dog': return { arm: pal.fur, leg: pal.fur, hand: pal.fur, foot: pal.fur };
      case 'robot': return { arm: '#a9b3bc', leg: '#a9b3bc', hand: pal.body, foot: pal.dark };
      case 'girl': return { arm: pal.skin, leg: pal.skin, hand: pal.skin, foot: pal.shoe };
      case 'boy': return { arm: pal.skin, leg: pal.skin, hand: pal.skin, foot: pal.shoe };
      case 'oldman': return { arm: pal.cloth, leg: pal.cloth2, hand: pal.skin, foot: pal.shoe };
      case 'grandma': return { arm: pal.cloth, leg: '#eadbc8', hand: pal.skin, foot: pal.shoe };
      case 'bird': return { arm: pal.body, leg: pal.leg, hand: pal.body, foot: pal.leg };
      case 'mouse': return { arm: pal.fur, leg: pal.fur, hand: pal.light, foot: pal.light };
      case 'bear': return { arm: pal.fur, leg: pal.fur, hand: pal.fur, foot: pal.fur };
      case 'alien': return { arm: pal.skin, leg: pal.cloth, hand: pal.skin, foot: pal.cloth2 };
      default: return { arm: '#ccc', leg: '#ccc', hand: '#eee', foot: '#555' };
    }
  }

  // ================================================================
  //  Головы
  // ================================================================
  function head(ctx, c, rig, pal, P, info) {
    const r = rig.head;
    const o = { r, e1: r * 0.08, e2: r * 0.52, ey: -r * 0.1, er: r * 0.22, mx: r * 0.34, my: r * 0.42, mw: r * 0.4, skin: pal.skin || pal.fur };
    const vel = info.vel || 0;
    const look = c.look !== 'none' ? c.look : c.villain ? 'tophat' : 'none';
    let hatY = -r * 0.82, hatX = r * 0.05, hatR = r * 0.72;
    switch (c.kind) {
      case 'cat': {
        const d = P.emo === 'sad' || P.emo === 'scared' || P.emo === 'tired' ? 1 : P.emo === 'angry' ? 0.5 : 0;
        poly(ctx, [[-r * 0.9, -r * 0.3], [-r * 0.78 - d * r * 0.45, -r * 1.28 + d * r * 0.6], [-r * 0.22, -r * 0.8]], pal.fur, LW, 5);
        poly(ctx, [[r * 0.12, -r * 0.82], [r * 0.64 + d * r * 0.35, -r * 1.32 + d * r * 0.6], [r * 0.9, -r * 0.34]], pal.fur, LW, 5);
        poly(ctx, [[r * 0.3, -r * 0.8], [r * 0.62 + d * r * 0.3, -r * 1.12 + d * r * 0.5], [r * 0.76, -r * 0.46]], pal.nose, 0, 4);
        blob(ctx, 0, 0, r * 1.1, r * 0.95, pal.fur, pal.dark);
        line(ctx, [[-r * 0.12, -r * 0.93], [-r * 0.08, -r * 0.64]], 6, pal.stripe);
        line(ctx, [[r * 0.14, -r * 0.93], [r * 0.14, -r * 0.68]], 6, pal.stripe);
        line(ctx, [[-r * 0.42, -r * 0.84], [-r * 0.32, -r * 0.6]], 6, pal.stripe);
        blob(ctx, r * 0.44, r * 0.4, r * 0.46, r * 0.3, pal.light, null, 0, LW * 0.7);
        Object.assign(o, { e1: r * 0.06, e2: r * 0.62, ey: -r * 0.12, er: r * 0.25, mx: r * 0.46, my: r * 0.5, mw: r * 0.36, iris: pal.iris, skin: pal.fur });
        face(ctx, o, P);
        poly(ctx, [[r * 0.36, r * 0.24], [r * 0.58, r * 0.24], [r * 0.47, r * 0.37]], pal.nose, LW * 0.7, 3);
        line(ctx, [[r * 0.8, r * 0.34], [r * 1.38, r * 0.22]], 2.6); line(ctx, [[r * 0.8, r * 0.44], [r * 1.4, r * 0.5]], 2.6);
        line(ctx, [[r * 0.06, r * 0.36], [-r * 0.46, r * 0.28]], 2.6);
        if (c.villain) mustache(ctx, r * 0.47, r * 0.38, r * 0.34);
        hatY = -r * 0.78; hatX = r * 0.0;
        break;
      }
      case 'dog': {
        const sw = clamp(-vel * 0.012, -0.6, 0.6) + Math.sin(P.T * 2) * 0.05 + (P.emo === 'sad' ? 0.25 : 0);
        blob(ctx, -r * 0.72, r * 0.08, r * 0.3, r * 0.64, pal.ear, null, 0.35 + sw, LW);
        blob(ctx, 0, 0, r * 1.02, r * 0.95, pal.fur, pal.dark);
        blob(ctx, r * 0.6, -r * 0.1, r * 0.32, r * 0.34, pal.spot, null, 0, 0);
        blob(ctx, r * 0.74, r * 0.36, r * 0.5, r * 0.34, pal.fur, null, -0.1, LW);
        blob(ctx, r * 1.14, r * 0.17, r * 0.18, r * 0.13, pal.nose, null, 0, LW * 0.6);
        Object.assign(o, { e1: r * 0.12, e2: r * 0.6, ey: -r * 0.14, er: r * 0.22, mx: r * 0.8, my: r * 0.58, mw: r * 0.34, skin: pal.fur });
        face(ctx, o, P);
        if ((P.emo === 'happy' || P.emo === 'love') && P.mouth < 0.15) blob(ctx, r * 0.86, r * 0.76 + Math.sin(P.T * 12) * 2, r * 0.12, r * 0.18, '#ef7f86', null, 0, LW * 0.6);
        blob(ctx, -r * 0.02, -r * 0.34, r * 0.28, r * 0.62, pal.ear, null, 0.55 + sw * 1.2, LW);
        if (c.villain) mustache(ctx, r * 0.95, r * 0.42, r * 0.34);
        break;
      }
      case 'robot': {
        const ant = Math.sin(P.T * 3) * 0.12 - clamp(vel * 0.006, -0.4, 0.4);
        const ax = Math.sin(ant) * r * 0.6;
        line(ctx, [[0, -r * 0.85], [ax, -r * 1.45]], LW);
        const on = Math.sin(P.T * 4) > -0.3;
        ctx.save(); if (on) { ctx.shadowColor = pal.led; ctx.shadowBlur = 16; }
        blob(ctx, ax, -r * 1.5, r * 0.16, r * 0.16, on ? pal.led : pal.dark, null, 0, LW * 0.8); ctx.restore();
        blob(ctx, -r * 0.98, 0, r * 0.18, r * 0.3, pal.dark, null, 0, LW * 0.8);
        poly(ctx, [[-r * 0.95, -r * 0.88], [r * 1.0, -r * 0.88], [r * 1.0, r * 0.82], [-r * 0.95, r * 0.82]], pal.body, LW, r * 0.3);
        ctx.globalAlpha = 0.35; ctx.fillStyle = pal.dark; ctx.fillRect(-r * 0.9, r * 0.55, r * 1.85, r * 0.2); ctx.globalAlpha = 1;
        poly(ctx, [[-r * 0.5, -r * 0.6], [r * 0.86, -r * 0.6], [r * 0.86, r * 0.56], [-r * 0.5, r * 0.56]], pal.screen, LW * 0.8, r * 0.2);
        Object.assign(o, { e1: r * 0.0, e2: r * 0.5, ey: -r * 0.14, er: r * 0.2, mx: r * 0.25, my: r * 0.3, mw: r * 0.46 });
        ledFace(ctx, o, P, pal.led);
        if (c.villain) mustache(ctx, r * 0.25, r * 0.66, r * 0.3, '#1d1b1b');
        hatY = -r * 0.86;
        break;
      }
      case 'girl': {
        const b = clamp(-vel * 0.008, -0.5, 0.5) + Math.sin(P.T * 2.5) * 0.06;
        blob(ctx, -r * 0.98, r * 0.16, r * 0.3, r * 0.48, pal.hair, null, 0.3 + b, LW);
        blob(ctx, r * 1.12, r * 0.16, r * 0.28, r * 0.46, pal.hair, null, -0.3 + b, LW);
        blob(ctx, 0, -r * 0.08, r * 1.02, r * 0.98, pal.hair, null, 0, LW);
        bowShape(ctx, -r * 0.84, -r * 0.24, r * 0.2, pal.bow); bowShape(ctx, r * 0.98, -r * 0.24, r * 0.2, pal.bow);
        blob(ctx, r * 0.12, r * 0.1, r * 0.84, r * 0.8, pal.skin, dk(pal.skin, 0.08), 0, LW);
        blob(ctx, r * 0.12, -r * 0.56, r * 0.86, r * 0.34, pal.hair, null, -0.08, LW);
        Object.assign(o, { e1: r * 0.0, e2: r * 0.46, ey: r * 0.02, er: r * 0.2, mx: r * 0.26, my: r * 0.47, mw: r * 0.32, skin: pal.skin, lashes: true, blush: true });
        face(ctx, o, P);
        hatY = -r * 0.85;
        break;
      }
      case 'boy': {
        blob(ctx, 0, 0, r, r * 0.95, pal.skin, dk(pal.skin, 0.08));
        blob(ctx, -r * 0.46, r * 0.1, r * 0.16, r * 0.22, pal.skin, null, 0, LW * 0.8);
        poly(ctx, [[-r * 0.98, r * 0.05], [-r * 0.92, -r * 0.62], [-r * 0.5, -r * 1.0], [-r * 0.28, -r * 1.3], [r * 0.02, -r * 1.02], [r * 0.34, -r * 1.24], [r * 0.5, -r * 0.94], [r * 0.9, -r * 0.62], [r * 0.6, -r * 0.5], [r * 0.18, -r * 0.6], [-r * 0.3, -r * 0.5], [-r * 0.6, -r * 0.1]], pal.hair, LW, 8);
        Object.assign(o, { e1: r * 0.12, e2: r * 0.56, ey: -r * 0.06, er: r * 0.2, mx: r * 0.38, my: r * 0.46, mw: r * 0.34, skin: pal.skin });
        face(ctx, o, P);
        ctx.fillStyle = dk(pal.skin, 0.3);
        for (const [fx, fy] of [[0.72, 0.22], [0.82, 0.3], [0.64, 0.3]]) { ctx.beginPath(); ctx.arc(r * fx, r * fy, 2.2, 0, TAU); ctx.fill(); }
        break;
      }
      case 'oldman': {
        blob(ctx, 0, 0, r * 0.98, r, pal.skin, dk(pal.skin, 0.08));
        blob(ctx, -r * 0.8, r * 0.04, r * 0.3, r * 0.42, pal.hair, null, 0, LW);
        blob(ctx, -r * 0.55, -r * 0.58, r * 0.26, r * 0.2, pal.hair, null, 0.5, LW);
        blob(ctx, -r * 0.4, r * 0.12, r * 0.16, r * 0.24, pal.skin, null, 0, LW * 0.8);
        blob(ctx, r * 0.38, r * 0.8, r * 0.52, r * 0.44, pal.hair, null, 0, LW);
        Object.assign(o, { e1: r * 0.12, e2: r * 0.56, ey: -r * 0.12, er: r * 0.17, browColor: pal.hair, browW: 11, browUp: 0.25, mx: r * 0.42, my: r * 0.6, mw: r * 0.28, skin: pal.skin });
        face(ctx, o, P);
        blob(ctx, r * 0.7, r * 0.2, r * 0.24, r * 0.2, dk(pal.skin, 0.06), null, 0, LW * 0.8);
        blob(ctx, r * 0.3, r * 0.46, r * 0.3, r * 0.15, pal.hair, null, 0.2, LW * 0.9);
        blob(ctx, r * 0.72, r * 0.46, r * 0.28, r * 0.14, pal.hair, null, -0.2, LW * 0.9);
        glasses(ctx, o);
        break;
      }
      case 'grandma': {
        blob(ctx, -r * 0.1, -r * 0.1, r * 1.12, r * 1.08, pal.scarf, dk(pal.scarf, 0.18), 0, LW);
        ctx.fillStyle = pal.dot;
        for (const [dx, dy] of [[-0.7, -0.4], [-0.3, -0.85], [-0.8, 0.3], [-0.45, 0.62], [0.2, -0.95], [-0.95, -0.05]]) { ctx.beginPath(); ctx.arc(r * dx, r * dy, 4, 0, TAU); ctx.fill(); }
        blob(ctx, r * 0.22, r * 0.14, r * 0.74, r * 0.76, pal.skin, dk(pal.skin, 0.08), 0, LW);
        blob(ctx, r * 0.22, -r * 0.5, r * 0.6, r * 0.16, pal.hair, null, 0, LW * 0.8);
        poly(ctx, [[-r * 0.05, r * 0.78], [-r * 0.38, r * 1.22], [r * 0.12, r * 1.02]], pal.scarf, LW, 4);
        Object.assign(o, { e1: r * 0.06, e2: r * 0.48, ey: -r * 0.02, er: r * 0.16, mx: r * 0.3, my: r * 0.48, mw: r * 0.28, skin: pal.skin, blush: true });
        face(ctx, o, P);
        glasses(ctx, o);
        hatY = -r * 1.0;
        break;
      }
      case 'mouse': {
        blob(ctx, -r * 0.55, -r * 0.82, r * 0.56, r * 0.56, pal.fur, null, 0, LW);
        blob(ctx, -r * 0.55, -r * 0.82, r * 0.34, r * 0.34, pal.ear, null, 0, 0);
        blob(ctx, r * 0.05, 0, r, r * 0.84, pal.fur, pal.dark);
        blob(ctx, r * 0.86, r * 0.22, r * 0.5, r * 0.32, pal.fur, null, -0.15, LW);
        blob(ctx, r * 1.32, r * 0.1, r * 0.13, r * 0.11, '#f07a8a', null, 0, LW * 0.6);
        blob(ctx, r * 0.3, -r * 0.96, r * 0.5, r * 0.5, pal.fur, null, 0, LW);
        blob(ctx, r * 0.3, -r * 0.96, r * 0.3, r * 0.3, pal.ear, null, 0, 0);
        Object.assign(o, { e1: r * 0.16, e2: r * 0.6, ey: -r * 0.18, er: r * 0.2, mx: r * 0.82, my: r * 0.48, mw: r * 0.3, skin: pal.fur });
        face(ctx, o, P);
        line(ctx, [[r * 1.1, r * 0.24], [r * 1.6, r * 0.12]], 2.4); line(ctx, [[r * 1.1, r * 0.32], [r * 1.62, r * 0.38]], 2.4);
        if (c.villain) mustache(ctx, r * 1.05, r * 0.3, r * 0.3);
        break;
      }
      case 'bear': {
        const earC = pal.patch || pal.fur;
        blob(ctx, -r * 0.64, -r * 0.72, r * 0.3, r * 0.3, earC, null, 0, LW);
        blob(ctx, r * 0.5, -r * 0.8, r * 0.3, r * 0.3, earC, null, 0, LW);
        blob(ctx, r * 0.5, -r * 0.8, r * 0.16, r * 0.16, pal.light, null, 0, 0);
        blob(ctx, 0, 0, r * 1.02, r * 0.92, pal.fur, pal.dark);
        if (pal.patch) { blob(ctx, r * 0.02, -r * 0.14, r * 0.26, r * 0.3, pal.patch, null, 0.3, 0); blob(ctx, r * 0.48, -r * 0.12, r * 0.26, r * 0.3, pal.patch, null, -0.3, 0); }
        blob(ctx, r * 0.46, r * 0.36, r * 0.46, r * 0.32, pal.light, null, 0, LW * 0.8);
        blob(ctx, r * 0.74, r * 0.2, r * 0.15, r * 0.11, INK, null, 0, 0);
        Object.assign(o, { e1: r * 0.04, e2: r * 0.48, ey: -r * 0.18, er: r * 0.17, mx: r * 0.52, my: r * 0.52, mw: r * 0.3, skin: pal.fur });
        face(ctx, o, P);
        if (c.villain) mustache(ctx, r * 0.6, r * 0.34, r * 0.34);
        hatY = -r * 0.8;
        break;
      }
      case 'alien': {
        const s = Math.sin(P.T * 3) * 6 - clamp(vel * 0.4, -12, 12);
        line(ctx, [[-r * 0.3, -r * 0.95], [-r * 0.6 + s, -r * 1.6]], LW); blob(ctx, -r * 0.6 + s, -r * 1.64, 9, 9, pal.dark, null, 0, LW * 0.8);
        line(ctx, [[r * 0.35, -r * 1.02], [r * 0.55 + s, -r * 1.66]], LW); blob(ctx, r * 0.55 + s, -r * 1.7, 9, 9, pal.dark, null, 0, LW * 0.8);
        blob(ctx, r * 0.05, -r * 0.15, r * 0.95, r * 1.1, pal.skin, pal.dark);
        Object.assign(o, { e1: r * 0.02, e2: r * 0.56, ey: -r * 0.16, er: r * 0.3, mx: r * 0.3, my: r * 0.52, mw: r * 0.3, skin: pal.skin, iris: pal.dark });
        face(ctx, o, P);
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(r * 0.3, -r * 0.78, r * 0.13, r * 0.11, 0, 0, TAU); ctx.fill(); ink(ctx, LW * 0.7);
        ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(r * 0.3 + P.look[0] * 4, -r * 0.77, r * 0.06, 0, TAU); ctx.fill();
        if (c.villain) mustache(ctx, r * 0.3, r * 0.36, r * 0.3);
        hatY = -r * 1.1;
        break;
      }
    }
    if (look === 'glasses' && c.kind !== 'oldman' && c.kind !== 'grandma' && c.kind !== 'robot') glasses(ctx, o);
    if (look === 'mustache' && !c.villain) mustache(ctx, o.mx, o.my - o.mw * 0.3, r * 0.3);
    if (['tophat', 'crown', 'cap', 'bow'].includes(look)) hat(ctx, look, hatX, hatY, hatR, look === 'tophat' ? -0.12 : -0.05);
  }
  function bowShape(ctx, x, y, s, color) {
    ctx.save(); ctx.translate(x, y);
    poly(ctx, [[0, 0], [-s, -s * 0.7], [-s, s * 0.7]], color, LW * 0.8, 4);
    poly(ctx, [[0, 0], [s, -s * 0.7], [s, s * 0.7]], color, LW * 0.8, 4);
    blob(ctx, 0, 0, s * 0.3, s * 0.3, dk(color, 0.2), null, 0, LW * 0.7);
    ctx.restore();
  }

  // ================================================================
  //  Туловища и хвосты
  // ================================================================
  function torso(ctx, c, rig, pal, P) {
    const H = rig.torso, W = rig.tw;
    switch (c.kind) {
      case 'cat': case 'mouse':
        blob(ctx, 0, -H * 0.48, W * 0.5, H * 0.56, pal.fur, pal.dark);
        blob(ctx, W * 0.14, -H * 0.42, W * 0.28, H * 0.36, pal.light, null, 0, LW * 0.6);
        break;
      case 'dog':
        blob(ctx, 0, -H * 0.48, W * 0.5, H * 0.56, pal.fur, pal.dark);
        blob(ctx, W * 0.14, -H * 0.42, W * 0.28, H * 0.36, dk(pal.fur, -0.04), null, 0, 0);
        poly(ctx, [[-W * 0.36, -H * 0.94], [W * 0.42, -H * 0.94], [W * 0.4, -H * 0.8], [-W * 0.36, -H * 0.8]], pal.collar, LW * 0.8, 5);
        blob(ctx, W * 0.3, -H * 0.7, 7, 7, '#f5c542', null, 0, LW * 0.6);
        break;
      case 'bear':
        blob(ctx, 0, -H * 0.5, W * 0.5, H * 0.55, pal.fur, pal.dark);
        blob(ctx, W * 0.12, -H * 0.44, W * 0.32, H * 0.36, pal.light, null, 0, LW * 0.6);
        break;
      case 'robot': {
        poly(ctx, [[-W * 0.5, -H], [W * 0.5, -H], [W * 0.46, 0], [-W * 0.46, 0]], pal.body, LW, 14);
        ctx.globalAlpha = 0.3; ctx.fillStyle = pal.dark; ctx.fillRect(-W * 0.44, -H * 0.2, W * 0.88, H * 0.16); ctx.globalAlpha = 1;
        poly(ctx, [[-W * 0.08, -H * 0.82], [W * 0.38, -H * 0.82], [W * 0.38, -H * 0.42], [-W * 0.08, -H * 0.42]], pal.screen, LW * 0.8, 6);
        const lvl = P.emo === 'tired' ? 1 : P.emo === 'sad' || P.emo === 'scared' ? 2 : 3;
        const col = lvl === 1 ? '#ff5a4f' : lvl === 2 ? '#ffc23d' : '#6ff08a';
        for (let i = 0; i < lvl; i++) { ctx.fillStyle = col; ctx.fillRect(-W * 0.02 + i * W * 0.12, -H * 0.74, W * 0.09, H * 0.24); }
        ctx.fillStyle = pal.accent;
        for (const [bx, by] of [[-W * 0.36, -H * 0.86], [-W * 0.36, -H * 0.12], [W * 0.36, -H * 0.12]]) { ctx.beginPath(); ctx.arc(bx, by, 4, 0, TAU); ctx.fill(); }
        break;
      }
      case 'girl':
        poly(ctx, [[-W * 0.3, -H], [W * 0.34, -H], [W * 0.6, H * 0.1], [-W * 0.58, H * 0.1]], pal.cloth, LW, 10);
        line(ctx, [[-W * 0.5, -H * 0.06], [W * 0.52, -H * 0.06]], 5, pal.cloth2);
        poly(ctx, [[-W * 0.22, -H * 1.0], [W * 0.26, -H * 1.0], [W * 0.1, -H * 0.8], [W * 0.02, -H * 0.88], [-W * 0.06, -H * 0.8]], pal.cloth2, LW * 0.8, 3);
        break;
      case 'boy':
        poly(ctx, [[-W * 0.44, -H * 0.36], [W * 0.46, -H * 0.36], [W * 0.5, H * 0.04], [-W * 0.48, H * 0.04]], pal.cloth2, LW, 8);
        poly(ctx, [[-W * 0.42, -H], [W * 0.44, -H], [W * 0.46, -H * 0.3], [-W * 0.44, -H * 0.3]], pal.cloth, LW, 12);
        line(ctx, [[-W * 0.4, -H * 0.62], [W * 0.42, -H * 0.62]], 7, dk(pal.cloth, -0.25));
        break;
      case 'oldman':
        poly(ctx, [[-W * 0.4, -H], [W * 0.44, -H], [W * 0.52, H * 0.12], [-W * 0.5, H * 0.12]], pal.cloth, LW, 12);
        line(ctx, [[W * 0.14, -H * 0.96], [W * 0.2, H * 0.1]], LW * 0.8);
        ctx.fillStyle = '#e8c56a';
        for (const by of [-0.7, -0.45, -0.2]) { ctx.beginPath(); ctx.arc(W * 0.28, H * by, 4.5, 0, TAU); ctx.fill(); ink(ctx, 2); }
        break;
      case 'grandma':
        poly(ctx, [[-W * 0.48, -H * 0.46], [W * 0.5, -H * 0.46], [W * 0.62, H * 0.12], [-W * 0.6, H * 0.12]], pal.cloth2, LW, 10);
        poly(ctx, [[-W * 0.4, -H], [W * 0.42, -H], [W * 0.46, -H * 0.38], [-W * 0.44, -H * 0.38]], pal.cloth, LW, 12);
        poly(ctx, [[W * 0.02, -H * 0.56], [W * 0.44, -H * 0.56], [W * 0.52, H * 0.04], [W * 0.04, H * 0.04]], '#f7efe2', LW * 0.8, 6);
        break;
      case 'alien':
        poly(ctx, [[-W * 0.42, -H], [W * 0.44, -H], [W * 0.5, 0], [-W * 0.48, 0]], pal.cloth, LW, 14);
        line(ctx, [[-W * 0.46, -H * 0.3], [W * 0.48, -H * 0.3]], 7, pal.cloth2);
        star(ctx, W * 0.12, -H * 0.66, 10, pal.skin);
        break;
      case 'bird': {
        blob(ctx, 0, -H * 0.55, W * 0.5, H * 0.62, pal.body, pal.dark);
        blob(ctx, W * 0.16, -H * 0.4, W * 0.3, H * 0.38, pal.belly, null, 0, LW * 0.6);
        break;
      }
    }
    if (c.look === 'scarf') {
      const fl = clamp(-(P.vel || 0) * 0.5, -30, 30);
      poly(ctx, [[-W * 0.4, -H * 1.02], [W * 0.46, -H * 1.02], [W * 0.44, -H * 0.86], [-W * 0.38, -H * 0.86]], '#e5484d', LW, 6);
      poly(ctx, [[-W * 0.3, -H * 0.92], [-W * 0.3 - 20 + fl, -H * 0.6 + Math.sin(P.T * 6) * 5], [-W * 0.3 - 4 + fl, -H * 0.56], [-W * 0.16, -H * 0.9]], '#e5484d', LW, 4);
    }
  }
  function star(ctx, x, y, r, fill, lw) {
    const pts = [];
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r; pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]); }
    poly(ctx, pts, fill, lw == null ? LW * 0.8 : lw, 2);
  }
  function tail(ctx, c, rig, pal, P, info) {
    const H = rig.torso, W = rig.tw;
    const lag = clamp((info.vel || 0) * -0.35, -40, 40);
    const x0 = -W * 0.4, y0 = -H * 0.2;
    const stroke = (w, color) => { ctx.lineCap = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = w + LW * 2; ctx.stroke(); ctx.strokeStyle = color; ctx.lineWidth = w; ctx.stroke(); };
    if (c.kind === 'cat') {
      const w = P.wag * 30;
      ctx.beginPath(); ctx.moveTo(x0, y0);
      ctx.bezierCurveTo(x0 - 50, y0 + 12, x0 - 66 + lag * 0.5, y0 - 50 + w, x0 - 34 + lag + w, y0 - 96 - (P.emo === 'scared' ? -40 : 0));
      stroke(13, pal.fur);
    } else if (c.kind === 'dog') {
      const a = -0.9 + P.wag * 1.2 + (P.emo === 'sad' || P.emo === 'scared' ? 1.3 : 0);
      ctx.beginPath(); ctx.moveTo(x0, y0 - 14); ctx.quadraticCurveTo(x0 - 30, y0 - 20, x0 + Math.cos(Math.PI + a) * 44 + lag * 0.3, y0 - 14 + Math.sin(Math.PI + a) * 44);
      stroke(12, pal.fur);
    } else if (c.kind === 'mouse') {
      ctx.beginPath(); ctx.moveTo(x0, y0 + 8); ctx.bezierCurveTo(x0 - 40, y0 + 30, x0 - 70 + lag, y0 - 10, x0 - 92 + lag, y0 + 4 + Math.sin(P.T * 3) * 8);
      stroke(4, pal.ear);
    } else if (c.kind === 'bear') {
      blob(ctx, x0 + 4, y0 - 10, 12, 12, pal.fur, null, 0, LW);
    } else if (c.kind === 'bird') {
      for (const a of [-0.5, -0.2, 0.1]) blob(ctx, x0 - 14 + lag * 0.2, -H * 0.42 + a * 30, 26, 9, dk(pal.body, 0.1), null, a + 0.3, LW * 0.8);
    }
  }

  // ================================================================
  //  Сборка двуногой куклы
  // ================================================================
  function drawBiped(ctx, c, rig, pal, P, info, holdKind) {
    const H = rig.torso, W = rig.tw, A = rig.arm, L = rig.leg, lw = rig.lw;
    const col = limbs(c, pal);
    const hipY = -L + P.bob;
    const bird = c.kind === 'bird';
    // ноги (стопы стоят на земле, тело пружинит)
    const legs = [[-W * 0.16, P.legF, true], [W * 0.16, P.legN, false]];
    for (const [hx, lg, far] of legs) {
      const fx = hx + lg[0], fy = -lg[1];
      if (bird) {
        line(ctx, [[hx * 0.6, hipY + 6], [fx, fy]], 4.5, far ? dk(col.leg) : col.leg);
        line(ctx, [[fx - 6, fy], [fx + 14, fy]], 4.5, far ? dk(col.leg) : col.leg);
        continue;
      }
      hose(ctx, hx, hipY, fx, fy, L * 1.02, lw * 1.05, far ? dk(col.leg) : col.leg, -1);
      blob(ctx, fx + lw * 0.55, fy - lw * 0.45, lw * 1.05, lw * 0.62, far ? dk(col.foot) : col.foot, null, 0, LW * 0.9);
    }
    // верх: наклон вокруг таза
    ctx.save();
    ctx.translate(0, hipY);
    ctx.rotate(P.lean);
    const shY = -H * 0.84;
    const shF = [-W * 0.14, shY], shN = [W * 0.08, shY];
    // дальняя рука
    if (bird) wing(ctx, shF, P.armF, A, pal, true, P);
    else {
      hose(ctx, shF[0], shF[1], shF[0] + P.armF[0], shF[1] + P.armF[1], A, lw, dk(col.arm), P.elbowOut ? -1 : 1);
      blob(ctx, shF[0] + P.armF[0], shF[1] + P.armF[1], lw * 0.78, lw * 0.78, dk(col.hand), null, 0, LW * 0.8);
    }
    tail(ctx, c, rig, pal, P, info);
    torso(ctx, c, rig, pal, P);
    if (bird) {
      // лицо птицы прямо на тушке
      const crest = -H * 1.12;
      for (const a of [-0.4, 0, 0.4]) blob(ctx, W * 0.02 + a * 16, crest + Math.abs(a) * 10, 6, 15, pal.body, null, a, LW * 0.8);
      const o = { r: 40, e1: W * 0.06, e2: W * 0.32, ey: -H * 0.8, er: 10, mx: W * 0.44, my: -H * 0.58, mw: 12, skin: pal.body, noMouth: true, browUp: 0.1 };
      face(ctx, o, P);
      const open = P.mouth > 0.15 ? P.mouth * 10 : 0;
      poly(ctx, [[W * 0.36, -H * 0.72], [W * 0.66, -H * 0.66 - open * 0.2], [W * 0.38, -H * 0.62]], pal.beak, LW * 0.8, 3);
      poly(ctx, [[W * 0.37, -H * 0.62], [W * 0.6, -H * 0.6 + open], [W * 0.36, -H * 0.56 + open * 0.4]], dk(pal.beak, 0.12), LW * 0.8, 3);
      const look = c.look !== 'none' ? c.look : c.villain ? 'tophat' : 'none';
      if (['tophat', 'crown', 'cap', 'bow'].includes(look)) hat(ctx, look, W * 0.05, crest + 8, 28, -0.1);
      if (look === 'glasses') glasses(ctx, o);
    } else {
      ctx.save();
      ctx.translate(0, -H - rig.head * 0.62);
      ctx.rotate(P.tilt);
      head(ctx, c, rig, pal, P, info);
      ctx.restore();
    }
    // ближняя рука и реквизит в ней
    const hx = shN[0] + P.armN[0], hy = shN[1] + P.armN[1];
    if (bird) wing(ctx, shN, P.armN, A, pal, false, P);
    else {
      hose(ctx, shN[0], shN[1], hx, hy, A, lw, col.arm, P.elbowOut ? -1 : 1);
    }
    if (holdKind) drawProp(ctx, holdKind, hx + 4, hy - 8, 0.95, P.T);
    if (!bird) blob(ctx, hx, hy, lw * 0.82, lw * 0.82, col.hand, null, 0, LW * 0.8);
    ctx.restore();
  }
  function wing(ctx, sh, hand, A, pal, far, P) {
    const ang = Math.atan2(hand[1], hand[0]);
    const len = Math.min(A * 1.1, Math.hypot(hand[0], hand[1]) + 10);
    blob(ctx, sh[0] + Math.cos(ang) * len * 0.5, sh[1] + Math.sin(ang) * len * 0.5, len * 0.58, 13, far ? dk(pal.body) : pal.dark, null, ang, LW * 0.9);
  }

  // ================================================================
  //  Парящие: луна, солнце, привидение
  // ================================================================
  function drawFloater(ctx, c, rig, pal, P, info, holdKind) {
    const R = rig.r, A = rig.arm, lw = rig.lw;
    const cy = -R - 6 + P.float + P.bob;
    const armC = c.kind === 'ghost' ? pal.body : pal.face;
    const shF = [-R * 0.82, cy + R * 0.18], shN = [R * 0.8, cy + R * 0.2];
    if (c.kind === 'moon' || c.kind === 'sun') {
      const g = ctx.createRadialGradient(0, cy, R * 0.8, 0, cy, R * 2.1);
      g.addColorStop(0, c.kind === 'moon' ? 'rgba(255,244,205,0.42)' : 'rgba(255,205,90,0.5)');
      g.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, cy, R * 2.1, 0, TAU); ctx.fill();
      if (c.kind === 'sun') {
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * TAU + P.T * 0.35, a1 = a - 0.14, a2 = a + 0.14, r0 = R * 1.04, r1 = R * (1.36 + (i % 2) * 0.12);
          poly(ctx, [[Math.cos(a1) * r0, cy + Math.sin(a1) * r0], [Math.cos(a) * r1, cy + Math.sin(a) * r1], [Math.cos(a2) * r0, cy + Math.sin(a2) * r0]], pal.ray, LW * 0.8, 3);
        }
      }
      hose(ctx, shF[0], shF[1], shF[0] + P.armF[0] * 0.8, shF[1] + P.armF[1] * 0.8, A, lw, dk(armC), 1);
      blob(ctx, 0, cy, R, R, pal.face, pal.dark);
      if (c.kind === 'moon') {
        blob(ctx, -R * 0.5, cy - R * 0.45, R * 0.17, R * 0.13, pal.crater, null, 0.3, 0);
        blob(ctx, -R * 0.62, cy + R * 0.3, R * 0.12, R * 0.1, pal.crater, null, 0, 0);
        blob(ctx, R * 0.02, cy + R * 0.66, R * 0.14, R * 0.09, pal.crater, null, 0, 0);
        blob(ctx, R * 0.66, cy - R * 0.58, R * 0.1, R * 0.08, pal.crater, null, 0, 0);
      }
      const o = { r: R, e1: -R * 0.02, e2: R * 0.44, ey: cy - R * 0.12, er: R * 0.17, mx: R * 0.22, my: cy + R * 0.34, mw: R * 0.3, skin: pal.face, cheek: pal.cheek, blush: true, lashes: c.kind === 'moon' };
      face(ctx, o, P);
      const look = c.look !== 'none' ? c.look : c.villain ? 'tophat' : 'none';
      if (['tophat', 'crown', 'cap', 'bow'].includes(look)) hat(ctx, look, R * 0.1, cy - R * 0.92, R * 0.5, -0.1);
      if (look === 'glasses') glasses(ctx, o);
      if (c.villain || look === 'mustache') mustache(ctx, o.mx, o.my - 10, R * 0.24);
    } else {
      // привидение: купол и волнистый подол
      const top = cy - R * 0.9, bot = cy + R * 1.0;
      // контур — в Path2D: путь холста не входит в save/restore, и после тени обвелась бы тень
      const body = new Path2D();
      body.moveTo(-R, cy);
      body.bezierCurveTo(-R, top - R * 0.3, R, top - R * 0.3, R, cy);
      body.lineTo(R * 0.95 + jit(1), bot);
      const n = 5;
      for (let i = 0; i < n; i++) {
        const x0 = R * 0.95 - (i * 1.9 * R) / n, x1 = R * 0.95 - ((i + 1) * 1.9 * R) / n;
        const wv = Math.sin(P.T * 5 + i * 1.3) * 10;
        body.quadraticCurveTo((x0 + x1) / 2, bot - 26 + wv, x1, bot + (i % 2 ? 6 : -4));
      }
      body.closePath();
      ctx.save(); ctx.globalAlpha = 0.94;
      ctx.fillStyle = pal.body; ctx.fill(body);
      ctx.save(); ctx.clip(body); ctx.fillStyle = pal.dark; ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.ellipse(-R * 0.9, cy + R * 0.4, R * 0.5, R * 1.3, 0, 0, TAU); ctx.fill(); ctx.restore();
      ctx.lineWidth = LW; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.stroke(body);
      ctx.restore();
      hose(ctx, shF[0], shF[1], shF[0] + P.armF[0] * 0.7, shF[1] + P.armF[1] * 0.7, A, lw, dk(armC, 0.12), 1);
      const o = { r: R, e1: -R * 0.02, e2: R * 0.44, ey: cy - R * 0.25, er: R * 0.2, mx: R * 0.22, my: cy + R * 0.2, mw: R * 0.3, skin: pal.body, sclera: '#fffdf7' };
      face(ctx, o, P);
      const look = c.look !== 'none' ? c.look : c.villain ? 'tophat' : 'none';
      if (['tophat', 'crown', 'cap', 'bow'].includes(look)) hat(ctx, look, R * 0.05, top - R * 0.12, R * 0.55, -0.1);
    }
    const hx = shN[0] + P.armN[0] * 0.8, hy = shN[1] + P.armN[1] * 0.8;
    hose(ctx, shN[0], shN[1], hx, hy, A, lw, armC, 1);
    if (holdKind) drawProp(ctx, holdKind, hx + 4, hy - 8, 0.95, P.T);
    blob(ctx, hx, hy, lw * 0.8, lw * 0.8, armC, null, 0, LW * 0.8);
  }

  // ================================================================
  //  Реквизит
  // ================================================================
  function drawProp(ctx, kind, x, y, s, T) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    switch (kind) {
      case 'battery':
        poly(ctx, [[-13, -26], [13, -26], [13, 26], [-13, 26]], '#61cf6c', LW, 6);
        poly(ctx, [[-6, -33], [6, -33], [6, -26], [-6, -26]], '#c9d3dd', LW * 0.8, 2);
        ctx.fillStyle = '#2f7a38'; ctx.fillRect(-13, 10, 26, 7);
        ctx.fillStyle = INK; ctx.fillRect(-2, -15, 4, 16); ctx.fillRect(-8, -9, 16, 4);
        break;
      case 'flower':
        line(ctx, [[0, 30], [0, -6]], 5, '#3f9b4a');
        blob(ctx, 8, 14, 9, 4, '#5bb56a', null, -0.5, LW * 0.6);
        for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU + 0.3; blob(ctx, Math.cos(a) * 11, -16 + Math.sin(a) * 11, 8, 8, '#f25f7a', null, 0, LW * 0.7); }
        blob(ctx, 0, -16, 7, 7, '#ffd23f', null, 0, LW * 0.7);
        break;
      case 'fish':
        poly(ctx, [[-18, 0], [-36, -14], [-34, 14]], '#5f9fd0', LW * 0.9, 3);
        blob(ctx, 0, 0, 26, 13, '#7fb8e0', '#5f9fd0', 0, LW);
        ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(14, -3, 3, 0, TAU); ctx.fill();
        break;
      case 'ball':
        blob(ctx, 0, 0, 20, 20, '#e5484d', '#b8323a', (T || 0) * 3, LW);
        ctx.beginPath(); ctx.arc(0, 0, 20, -0.5, 0.9); ctx.lineWidth = 6; ctx.strokeStyle = '#fff4e4'; ctx.stroke();
        break;
      case 'star': star(ctx, 0, 0, 24, '#ffd23f', LW); break;
      case 'cake':
        poly(ctx, [[-26, -6], [26, -6], [24, 18], [-24, 18]], '#f7c1cf', LW, 5);
        blob(ctx, 0, -8, 27, 8, '#fffaf2', null, 0, LW * 0.8);
        line(ctx, [[0, -14], [0, -30]], 5, '#8fc3ec');
        blob(ctx, 0, -35, 3.5, 6 + Math.sin((T || 0) * 20), '#ffb13d', null, 0, 0);
        blob(ctx, 14, -14, 5, 5, '#e5484d', null, 0, LW * 0.6);
        break;
      case 'bone':
        poly(ctx, [[-18, -6], [18, -6], [18, 6], [-18, 6]], '#f4eee2', LW * 0.9, 3);
        for (const [bx, by] of [[-20, -6], [-20, 6], [20, -6], [20, 6]]) blob(ctx, bx, by, 7, 7, '#f4eee2', null, 0, LW * 0.8);
        ctx.fillStyle = '#f4eee2'; ctx.fillRect(-18, -4, 36, 8);
        break;
      case 'gift':
        poly(ctx, [[-22, -16], [22, -16], [22, 22], [-22, 22]], '#3fa7e0', LW, 4);
        ctx.fillStyle = '#ffd23f'; ctx.fillRect(-4, -16, 8, 38); ctx.fillRect(-22, -2, 44, 7);
        bowShape(ctx, 0, -20, 12, '#ffd23f');
        break;
      case 'key':
        ctx.beginPath(); ctx.arc(-14, 0, 10, 0, TAU); ctx.lineWidth = 7; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 4; ctx.strokeStyle = '#f5c542'; ctx.stroke();
        poly(ctx, [[-5, -3], [26, -3], [26, 3], [-5, 3]], '#f5c542', LW * 0.7, 1);
        poly(ctx, [[16, 3], [22, 3], [22, 11], [16, 11]], '#f5c542', LW * 0.7, 1);
        break;
      case 'umbrella':
        line(ctx, [[0, -30], [0, 26], [8, 30]], 4);
        ctx.beginPath(); ctx.moveTo(-34, -24); ctx.quadraticCurveTo(0, -70, 34, -24); ctx.quadraticCurveTo(22, -30, 11, -24); ctx.quadraticCurveTo(0, -30, -11, -24); ctx.quadraticCurveTo(-22, -30, -34, -24);
        ctx.fillStyle = '#e5484d'; ctx.fill(); ink(ctx);
        break;
      case 'apple':
        blob(ctx, 0, 0, 18, 17, '#e5484d', '#b8323a', 0, LW);
        line(ctx, [[0, -16], [3, -25]], 4);
        blob(ctx, 10, -22, 8, 4, '#5bb56a', null, -0.4, LW * 0.6);
        break;
      case 'balloon': {
        const sw = Math.sin((T || 0) * 1.7) * 6;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(sw, -40, sw * 1.5, -78); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
        blob(ctx, sw * 1.5, -106, 22, 27, '#e5484d', '#b8323a', 0, LW);
        poly(ctx, [[sw * 1.5 - 5, -76], [sw * 1.5 + 5, -76], [sw * 1.5, -82]], '#b8323a', LW * 0.6, 1);
        ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.ellipse(sw * 1.5 - 8, -116, 5, 8, -0.4, 0, TAU); ctx.fill();
        break;
      }
      case 'letter':
        poly(ctx, [[-24, -16], [24, -16], [24, 16], [-24, 16]], '#fbf6ea', LW, 3);
        line(ctx, [[-23, -15], [0, 3], [23, -15]], LW * 0.7);
        heart(ctx, 0, 4, 8, '#e5484d', 0);
        break;
      case 'cheese':
        poly(ctx, [[-24, 14], [24, 14], [24, -4], [-20, -14]], '#ffd23f', LW, 3);
        ctx.fillStyle = '#e8b52a';
        for (const [hx, hy, hr] of [[-8, 4, 4], [8, -1, 5], [16, 8, 3]]) { ctx.beginPath(); ctx.arc(hx, hy, hr, 0, TAU); ctx.fill(); }
        break;
      case 'heart': heart(ctx, 0, 6, 22 * (1 + Math.sin((T || 0) * 6) * 0.06), '#e8364a', LW); break;
      default: star(ctx, 0, 0, 20, '#ffd23f', LW);
    }
    ctx.restore();
  }

  // ================================================================
  //  Главный вход: нарисовать актёра в точке (X, Y) мира
  // ================================================================
  function drawActor(ctx, c, info, t, X, Y, holdKind) {
    const rig = RIG[c.kind] || RIG.boy;
    const pal = palette(c);
    const P = computePose(info, c, t);
    P.T = t; P.emo = info.emo; P.spin = t * 9; P.vel = info.vel || 0;
    SEQ = (c.seed & 1023) * 64;
    const h = c.def.h;
    ctx.save();
    ctx.translate(X + P.dx, Y);
    if (P.scale !== 1 || P.rot) { ctx.translate(0, -h * 0.5); ctx.scale(P.scale, P.scale); ctx.rotate(P.rot); ctx.translate(0, h * 0.5); }
    if (P.lie > 0 && !rig.float) { ctx.translate(0, -((rig.tw || 60) * 0.45 + 4) * P.lie); ctx.rotate(-info.face * P.lie * Math.PI / 2); }
    ctx.scale(info.face, 1);
    ctx.scale(1 / Math.sqrt(P.sq), P.sq);
    if (rig.float) drawFloater(ctx, c, rig, pal, P, info, holdKind);
    else drawBiped(ctx, c, rig, pal, P, info, holdKind);
    ctx.restore();
    return P;
  }

  window.Puppets = {
    drawActor, drawProp, computePose, palette, RIG, INK, LW,
    blob, poly, line, hose, heart, star, ink,
    setBoil(v) { BOIL = v; },
    reseed(v) { SEQ = v; },
  };
})();
