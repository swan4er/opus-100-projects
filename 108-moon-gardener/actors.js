'use strict';
/* ==========================================================================
   Садовник на Луне · актёры и реквизит
   Робот, цветок, посадочный модуль, лейка, мерная палочка, лёд, камни.
   Всё рисуется примитивами в локальных метрах — поэтому один и тот же
   робот чисто выглядит и на общем плане (20 px), и на крупном (весь кадр).
   ========================================================================== */

/* ---------- Материалы робота ---------- */
const M_ENAMEL = mat(0.9, 0.88, 0.83, { spec: 0.45, obj: 1 });
const M_LID = mat(0.8, 0.78, 0.73, { spec: 0.3, obj: 1 });
const M_METAL = mat(0.42, 0.44, 0.52, { spec: 0.6, obj: 1 });
const M_DARK = mat(0.06, 0.06, 0.09, { spec: 0.9, obj: 1 });
const M_ORANGE = mat(0.96, 0.42, 0.15, { spec: 0.35, obj: 1 });
const M_SOLE = mat(0.3, 0.3, 0.36, { spec: 0.2, obj: 1 });
const M_TMP = mat(0, 0, 0, { obj: 1 });

function mixMat(src, r, g, b, k) { // временный материал: альбедо, подмешанное к пыли
  M_TMP.r = lerp(src.r, r, k); M_TMP.g = lerp(src.g, g, k); M_TMP.b = lerp(src.b, b, k);
  M_TMP.er = src.er; M_TMP.eg = src.eg; M_TMP.eb = src.eb; M_TMP.spec = src.spec * (1 - k * 0.8);
  M_TMP.flags = src.flags; M_TMP.obj = src.obj; M_TMP.tex = null;
  return M_TMP;
}

/* Двухзвенная обратная кинематика: от A к цели с длинами l1, l2; bend = ±1 */
function ik2(ax, ay, tx, ty, l1, l2, bend) {
  let dx = tx - ax, dy = ty - ay;
  let d = hyp(dx, dy);
  const maxd = l1 + l2 - 1e-4;
  if (d > maxd) { dx *= maxd / d; dy *= maxd / d; d = maxd; }
  if (d < 1e-4) d = 1e-4;
  const base = Math.atan2(dy, dx);
  const c = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  const a = base + bend * Math.acos(c);
  const ex = ax + Math.cos(a) * l1, ey = ay + Math.sin(a) * l1;
  return [ex, ey, ax + dx, ay + dy];
}

/* ---------- Поза робота по умолчанию ---------- */
function robotPose() {
  return {
    x: 0, z: 0, y: 0, yaw: 0.6, headYaw: 0.6, lean: 0, sq: 1, crouch: 0, kneel: 0,
    headTilt: 0, neck: 0, lidT: 0.12, lidB: 0.05, brow: 0, lookX: 0, lookY: 0, iris: 1, eyeOn: 1,
    hAx: -0.02, hAy: -0.15, hBx: 0.02, hBy: -0.15, handsWorld: 0,
    walk: 0, walkAmt: 0, stride: 0.16, lift: 0.035, run: 0,
    antenna: 0, antBend: 0, bulb: 0.5, dust: 0, dent: 0,
    can: 0, canTilt: 0, sleep: 0, cable: 0, limp: 0, hug: 0,
  };
}

/* Рисует робота. P — размещение (из placeAt) или маска тени; s — поза.
   Возвращает мировые точки глаза и рук (для света, лейки, частиц). */
const ROBOT_OUT = { eyeX: 0, eyeY: 0, handBX: 0, handBY: 0, handAX: 0, handAY: 0, headX: 0, headY: 0, canTipX: 0, canTipY: 0, canAng: 0 };
function drawRobot(T0, z, s, kpx) {
  const dir = s.yaw >= 0 ? 1 : -1;
  const ay = Math.abs(s.yaw);
  const dust = s.dust;
  const DU = [0.52, 0.51, 0.5];
  const en = (m) => (dust > 0 ? mixMat(m, DU[0], DU[1], DU[2], dust * 0.55) : m);

  /* --- ноги и таз --- */
  const crouch = s.crouch;
  const walkA = s.walkAmt;
  const phase = s.walk;
  const bob = walkA * Math.abs(Math.sin(phase * Math.PI)) * (0.012 + s.run * 0.02);
  const sit = s.sit || 0;
  const pelvisY = 0.165 - crouch * 0.085 + s.y + bob - s.kneel * 0.03 - sit * 0.025;
  const pelvisX = 0;
  const feet = [];
  for (let k = 0; k < 2; k++) {
    const side = k === 0 ? -1 : 1;
    let fx = side * 0.052 * (1 - ay * 0.65) + side * crouch * 0.03 * (1 - ay);
    let fy = 0;
    if (walkA > 0) {
      const ph = ((phase + k) % 2 + 2) % 2;
      const S = s.stride;
      let off, lift;
      if (ph < 1) { off = -S / 2 + S * sstep(0, 1, ph); lift = Math.sin(ph * Math.PI) * (s.lift + s.run * 0.03); }
      else { off = S / 2 - S * (ph - 1); lift = 0; }
      fx += dir * off * walkA; fy += lift * walkA;
    }
    if (s.kneel > 0 && k === 1) { fx += dir * -0.07 * s.kneel; }
    if (sit > 0) { fx += dir * (0.1 + 0.02 * k) * sit; fy += 0.01 * sit; }
    feet.push([fx, fy + Math.max(0, s.y - 0.0) * 0]);
  }
  // при прыжке ноги отрываются вместе с телом
  if (s.y > 0) { feet[0][1] += s.y * 0.85; feet[1][1] += s.y * 0.85; }

  // тело: наклон и сжатие вокруг таза
  const sqy = s.sq, sqx = 1 / Math.sqrt(Math.max(0.3, s.sq));
  const TB = tMul(T0, tTRS(pelvisX, pelvisY, -s.lean * dir, 1, 1));
  const TBs = tMul(TB, tTRS(0, 0, 0, sqx, sqy));
  const shoulderY = 0.155, shoulderX = 0.118 * (1 - ay * 0.78);
  // точки плеч в корневых координатах (для IK рук в мировых целях)
  const zNear = z - 0.1 * ay, zFar = z + 0.1 * ay;

  const legZ = (k) => (k === 0 ? (dir > 0 ? zFar + 0.02 : zNear - 0.02) : (dir > 0 ? zNear - 0.02 : zFar + 0.02));
  const legMat = (k) => (legZ(k) > z ? mixMat(M_METAL, 0.2, 0.2, 0.26, 0.35) : en(M_METAL));
  const drawLeg = (k) => {
    const side = k === 0 ? -1 : 1;
    const hx = side * 0.045 * (1 - ay * 0.7), hy = pelvisY;
    const f = feet[k];
    const ankX = f[0], ankY = f[1] + 0.03;
    // из двух решений берём то, где колено смотрит вперёд
    const r1 = ik2(hx, hy, ankX, ankY, 0.078, 0.074, 1), r2 = ik2(hx, hy, ankX, ankY, 0.078, 0.074, -1);
    const r = (r1[0] * dir + side * 0.3 * (1 - ay) * r1[0]) > (r2[0] * dir + side * 0.3 * (1 - ay) * r2[0]) ? r1 : r2;
    const zz = legZ(k);
    const m = legMat(k);
    lineL(T0, hx, hy, r[0], r[1], 0.017, zz, m);
    lineL(T0, r[0], r[1], ankX, ankY, 0.016, zz, m);
    fCircle(T0, r[0], r[1], 0.02, zz - 0.001, m);
    // ступня: пятка назад, носок вперёд
    const fm = zz > z ? mixMat(M_ENAMEL, 0.25, 0.25, 0.3, 0.45) : en(M_ENAMEL);
    fBox(T0, ankX + dir * 0.012 * ay, f[1] + 0.017, 0.038 - 0.012 * (1 - ay), 0.019, 0.012, zz - 0.002, fm, 0.012, 0, 0.3);
    fBox(T0, ankX + dir * 0.012 * ay, f[1] + 0.005, 0.038 - 0.012 * (1 - ay), 0.006, 0.004, zz - 0.003, M_SOLE, 0.004);
  };

  /* --- руки ---
     Цель кисти — смесь: в осях тела (h*) и в корневых осях (w*), доля hw*. */
  const BT = tTRS(pelvisX, pelvisY, -s.lean * dir, sqx, sqy);
  const BT1 = tTRS(pelvisX, pelvisY, -s.lean * dir, 1, 1);
  const drawArm = (k) => {
    const side = k === 0 ? -1 : 1;
    const sx0 = side * shoulderX, sy0 = shoulderY;
    const SH = tPt(BT, sx0, sy0);
    const hb = k === 0 ? [s.hAx, s.hAy] : [s.hBx, s.hBy];
    const hp = tPt(BT1, sx0 + hb[0], sy0 + hb[1]);
    const w = k === 0 ? (s.hwA || 0) : (s.hwB || 0);
    const tx = lerp(hp[0], k === 0 ? s.wAx : s.wBx, w), ty = lerp(hp[1], k === 0 ? s.wAy : s.wBy, w);
    const near = (k === 1) === (dir > 0);
    const zz = near ? zNear - 0.03 : zFar + 0.03;
    // телескопическое предплечье: если цель дальше обычного вылета, трубка выдвигается
    const reach = hyp(tx - SH[0], ty - SH[1]);
    const l2 = clamp(reach - 0.085 + 0.004, 0.082, 0.19);
    // локоть: назад и вниз, в фас — наружу
    const r1 = ik2(SH[0], SH[1], tx, ty, 0.085, l2, 1), r2 = ik2(SH[0], SH[1], tx, ty, 0.085, l2, -1);
    const sc = (r) => -dir * r[0] * ay - r[1] * 0.6 + side * r[0] * (1 - ay);
    const r = sc(r1) > sc(r2) ? r1 : r2;
    const m = near ? en(M_METAL) : mixMat(M_METAL, 0.2, 0.2, 0.26, 0.35);
    lineL(T0, SH[0], SH[1], r[0], r[1], 0.013, zz, m);
    if (l2 > 0.084) {
      // рукав и выдвижная трубка
      const u = 0.082 / l2;
      const mx = r[0] + (r[2] - r[0]) * u, my = r[1] + (r[3] - r[1]) * u;
      lineL(T0, r[0], r[1], mx, my, 0.012, zz, m);
      lineL(T0, mx, my, r[2], r[3], 0.0075, zz + 0.001, M_METAL);
    } else lineL(T0, r[0], r[1], r[2], r[3], 0.012, zz, m);
    fCircle(T0, r[0], r[1], 0.016, zz - 0.001, m);
    const hm = near ? en(M_ENAMEL) : mixMat(M_ENAMEL, 0.25, 0.25, 0.3, 0.45);
    fCircle(T0, r[2], r[3], 0.024, zz - 0.002, hm);
    if (k === 0) { ROBOT_OUT.handAX = r[2]; ROBOT_OUT.handAY = r[3]; }
    else { ROBOT_OUT.handBX = r[2]; ROBOT_OUT.handBY = r[3]; }
    return zz;
  };

  // порядок: дальняя нога, дальняя рука, тело, голова, ближняя нога, ближняя рука
  const farLeg = dir > 0 ? 0 : 1, nearLeg = 1 - farLeg;
  const farArm = dir > 0 ? 0 : 1, nearArm = 1 - farArm;
  if (!TG) { drawLeg(farLeg); drawArm(farArm); }
  else { drawLeg(0); drawLeg(1); drawArm(0); drawArm(1); }

  /* --- корпус --- */
  fBox(TBs, 0, 0.1, 0.128, 0.098, 0.055, z, en(M_ENAMEL), 0.06);
  if (!TG) {
    // оранжевая полоса и панель на животе
    const pX = 0.055 * s.yaw, pw = 0.052 * (1 - ay * 0.45);
    fBox(TBs, pX, 0.148, 0.126 * (1 - ay * 0.1), 0.011, 0.006, z - 0.004, en(M_ORANGE), 0.008, 0, 0.35);
    fBox(TBs, pX, 0.075, pw, 0.036, 0.012, z - 0.005, M_DARK, 0.01);
    // индикатор заряда: три огонька
    for (let n = 0; n < 3; n++) {
      const on = s.eyeOn > 0.3 ? 1 : 0;
      const col = n === 0 ? [0.3, 1.4, 0.5] : n === 1 ? [1.2, 1.0, 0.2] : [1.2, 0.3, 0.2];
      const lm = mat(0.05, 0.05, 0.05, { er: col[0] * on * (n === 0 ? 1 : 0.35), eg: col[1] * on * (n === 0 ? 1 : 0.35), eb: col[2] * on * (n === 0 ? 1 : 0.35), obj: 1 });
      fCircle(TBs, pX + (n - 1) * pw * 0.55, 0.075, 0.009, z - 0.006, lm, 0);
    }
    // вмятины после ударов
    if (s.dent > 0) {
      const dm = mat(0.45, 0.43, 0.42, { spec: 0.1, obj: 1 });
      fEllipse(TBs, -0.07 * dir, 0.165, 0.025 * s.dent, 0.014 * s.dent, z - 0.007, dm, 0.01, -0.3 * dir, -0.3);
      fEllipse(TBs, 0.02 * dir, 0.188, 0.014 * s.dent, 0.008 * s.dent, z - 0.007, dm, 0.006, 0.2, -0.3);
    }
  }
  /* --- шея и голова --- */
  const neckTop = 0.235 + s.neck;
  lineL(TBs, 0, 0.19, 0, neckTop, 0.022, z + 0.004, en(M_METAL));
  const TH = tMul(TBs, tTRS(0, neckTop, -s.headTilt * dir, 1 / sqx * 0.95 + 0.05, 1 / sqy * 0.9 + 0.1));
  const hy = s.headYaw, hay = Math.abs(hy), hdir = hy >= 0 ? 1 : -1;
  // антенна (за головой)
  const antBaseX = -0.03 * hy, antBaseY = 0.165;
  const aang = s.antenna + s.antBend;
  const aL = 0.115;
  const bend1 = aang * 0.45, bend2 = aang;
  const mx = antBaseX + Math.sin(bend1) * aL * 0.5, my = antBaseY + Math.cos(bend1) * aL * 0.5;
  const tx2 = mx + Math.sin(bend2) * aL * 0.5, ty2 = my + Math.cos(bend2) * aL * 0.5;
  lineL(TH, antBaseX, antBaseY, mx, my, 0.005, z + 0.003, en(M_METAL));
  lineL(TH, mx, my, tx2, ty2, 0.005, z + 0.003, en(M_METAL));
  const bl = s.bulb;
  fCircle(TH, tx2, ty2, 0.017, z + 0.002, mat(0.9, 0.3, 0.2, { er: 2.6 * bl, eg: 0.55 * bl, eb: 0.25 * bl, spec: 0.5, obj: 1 }));
  const tipW = tPt(TH, tx2, ty2);
  ROBOT_OUT.bulbSX = tipW[0]; ROBOT_OUT.bulbSY = tipW[1];
  // купол
  fillSDF(TH, (u, v) => Math.max(sdEllipse(0, 0.085, 0.142, 0.1)(u, v), -(v - 0.0)), -0.15, -0.01, 0.15, 0.19, z, en(M_ENAMEL), 0.08);
  fBox(TH, 0, 0.02, 0.13, 0.028, 0.02, z + 0.001, en(M_ENAMEL), 0.02, 0, -0.2);
  if (!TG) {
    // боковой болт-«ухо» с дальней от глаза стороны
    fCircle(TH, -hdir * 0.128 * (0.4 + 0.6 * hay), 0.07, 0.022 * (0.4 + 0.6 * hay), z + 0.002, en(M_ORANGE), 0.02);
    // глаз
    const ex = 0.078 * hy, ey = 0.072, esx = 1 - 0.5 * hay;
    const TE = tMul(TH, tTRS(ex, ey, 0, esx, 1));
    const Re = 0.057;
    fCircle(TE, 0, 0, Re, z - 0.006, M_DARK, 0.02);                       // оправа
    fCircle(TE, 0, 0, Re * 0.8, z - 0.007, mat(0.02, 0.03, 0.05, { spec: 1.6, obj: 1 }), Re * 0.8); // линза
    const on = s.eyeOn;
    const ir = 0.024 * s.iris;
    const lx = s.lookX * 0.014, ly = s.lookY * 0.012;
    if (on > 0.01) {
      fillSDF(TE, (u, v) => Math.abs(hyp(u - lx, v - ly) - ir * 0.8) - ir * 0.32, lx - ir * 1.3, ly - ir * 1.3, lx + ir * 1.3, ly + ir * 1.3,
        z - 0.008, mat(0.1, 0.3, 0.35, { er: 0.55 * on, eg: 1.7 * on, eb: 2.1 * on, obj: 1 }), 0);
      fCircle(TE, lx, ly, ir * 0.42, z - 0.0085, mat(0.01, 0.02, 0.03, { er: 0.05 * on, eg: 0.2 * on, eb: 0.28 * on, obj: 1 }), 0);
    }
    // блик-«искорка» — глаз живой
    fCircle(TE, -Re * 0.36, Re * 0.38, Re * 0.13, z - 0.009, mat(0.9, 0.95, 1, { er: 0.9, eg: 0.95, eb: 1.0, obj: 1 }), 0);
    // механические шторки век
    const lt = s.lidT, lb = s.lidB, br = s.brow * hdir;
    if (lt > 0.01) {
      const yEdge = Re * 0.82 - lt * Re * 1.64;
      fillSDF(TE, (u, v) => Math.max(hyp(u, v) - Re * 0.84, (yEdge - (v - u * br * 0.9))), -Re, -Re, Re, Re, z - 0.0095, M_LID, 0.012, 0, 0.3);
    }
    if (lb > 0.01) {
      const yEdge = -Re * 0.82 + lb * Re * 1.64;
      fillSDF(TE, (u, v) => Math.max(hyp(u, v) - Re * 0.84, ((v + u * s.brow * hdir * 0.25) - yEdge)), -Re, -Re, Re, Re, z - 0.0095, M_LID, 0.012, 0, -0.3);
    }
    const eW = tPt(TE, lx, ly);
    ROBOT_OUT.eyeSX = eW[0]; ROBOT_OUT.eyeSY = eW[1];
    ROBOT_OUT.eyeR = Re * Math.sqrt(Math.abs(TE[0] * TE[3] - TE[1] * TE[2]));
    const hc = tPt(TH, 0, 0.08);
    ROBOT_OUT.headSX = hc[0]; ROBOT_OUT.headSY = hc[1];
    if (s.dent > 0.5) {
      fEllipse(TH, 0.05 * hdir, 0.15, 0.018, 0.009, z - 0.002, mat(0.5, 0.48, 0.46, { obj: 1 }), 0.008, 0.2, 0.3);
    }
  }
  // корневые координаты глаза для света
  ROBOT_OUT.eyeLX = 0; ROBOT_OUT.eyeLY = 0;
  {
    const hp = tPt(tMul(tTRS(pelvisX, pelvisY, -s.lean * dir, sqx, sqy), tTRS(0, neckTop, -s.headTilt * dir, 1, 1)), 0.078 * s.headYaw, 0.072);
    ROBOT_OUT.eyeLX = hp[0]; ROBOT_OUT.eyeLY = hp[1];
    const hh = tPt(tMul(tTRS(pelvisX, pelvisY, -s.lean * dir, sqx, sqy), tTRS(0, neckTop, 0, 1, 1)), 0, 0.09);
    ROBOT_OUT.headLX = hh[0]; ROBOT_OUT.headLY = hh[1];
  }

  if (!TG) { drawLeg(nearLeg); }
  const zArm = TG && TG.w < 2 ? z : (TG ? z : drawArm(nearArm));

  /* --- лейка в ближней руке --- */
  if (s.can) {
    const hx = nearArm === 1 ? ROBOT_OUT.handBX : ROBOT_OUT.handAX, hy2 = nearArm === 1 ? ROBOT_OUT.handBY : ROBOT_OUT.handAY;
    const CT = tTRS(hx, hy2, -s.canTilt * dir, dir, 1);
    if (!TG) drawCan(tMul(T0, CT), zArm + 0.02, 1, true);
    const tip = tPt(CT, 0.125, -0.055);
    ROBOT_OUT.canTipX = tip[0]; ROBOT_OUT.canTipY = tip[1];
    ROBOT_OUT.canAng = s.canTilt;
  }
  void kpx;
}

/* ---------- Лейка ----------
   Начало координат — у ручки (там её держит рука), если held, иначе у дна. */
const M_CAN = mat(0.95, 0.4, 0.14, { spec: 0.5, obj: 4, er: 0.07, eg: 0.022, eb: 0.006 });
const M_CAN_D = mat(0.55, 0.2, 0.1, { spec: 0.4, obj: 4 });
function drawCan(T, z, dir, held) {
  const oy = held ? -0.16 : 0, ox = held ? 0.0 : 0;
  // ручка-дуга
  fillSDF(T, (u, v) => Math.max(Math.abs(hyp(u - ox + 0.005, v - oy - 0.1) - 0.045) - 0.008, -(v - oy - 0.1)), ox - 0.06, oy + 0.09, ox + 0.05, oy + 0.16, z + 0.01, M_CAN_D, 0.008);
  // корпус
  fBox(T, ox, oy + 0.052, 0.055, 0.05, 0.016, z, M_CAN, 0.03);
  fBox(T, ox, oy + 0.1, 0.05, 0.006, 0.004, z - 0.001, M_CAN_D, 0.005);
  // носик
  lineL(T, ox + 0.045, oy + 0.03, ox + 0.12, oy + 0.1, 0.008, z + 0.002, M_CAN);
  fEllipse(T, ox + 0.125, oy + 0.105, 0.011, 0.016, z + 0.001, M_CAN_D, 0.01);
}

/* ---------- Мерная палочка ---------- */
const M_STICK = mat(0.78, 0.66, 0.5, { spec: 0.1, obj: 5 });
const M_TICK = mat(0.25, 0.18, 0.16, { obj: 5 });
function drawStick(T, z, ticks) {
  fBox(T, 0, 0.115, 0.0055, 0.115, 0.004, z, M_STICK, 0.005);
  for (const h of ticks) fBox(T, 0.004, h, 0.009, 0.0022, 0.001, z - 0.001, M_TICK, 0);
}

/* ---------- Цветок ----------
   b — раскрытие 0..1, g — рост, lean — наклон, perk — бодрость листьев,
   glow — собственный свет, shake — дрожь от ударов. */
const M_STEM = mat(0.25, 0.55, 0.22, { spec: 0.15, obj: 2, flags: F_LIT | F_RECV });
const M_LEAF = mat(0.3, 0.62, 0.25, { spec: 0.35, obj: 2, flags: F_LIT | F_RECV });
const M_BUD = mat(0.72, 0.13, 0.42, { spec: 0.4, obj: 2, flags: F_LIT | F_RECV });
const M_PETAL = mat(0.96, 0.4, 0.6, { spec: 0.3, obj: 2, flags: F_LIT | F_RECV });
const M_CORE = mat(1.0, 0.78, 0.3, { spec: 0.3, obj: 2, flags: F_LIT | F_RECV });
const FLOWER_OUT = { headX: 0, headY: 0 };
function drawFlower(T, z, fs) {
  const g = fs.g, lean = fs.lean + fs.shake;
  const H0 = 0.13 * g;
  // стебель — квадратичная кривая
  const cx = 0.012 * lean * 3, tx = 0.03 * lean * 3 + 0.004, ty = H0;
  let px = 0, py = 0;
  const N = 8;
  for (let n = 1; n <= N; n++) {
    const t = n / N;
    const x = 2 * (1 - t) * t * cx + t * t * tx, y = t * ty;
    lineL(T, px, py, x, y, 0.0042 - t * 0.001, z, M_STEM);
    px = x; py = y;
  }
  // листья
  const leaf = (y0, side, len, ang) => {
    const t = y0 / ty;
    const bx = 2 * (1 - t) * t * cx + t * t * tx, by = y0;
    const a = side * (0.95 - fs.perk * 0.35) + ang;
    const dx = Math.sin(a), dy = Math.cos(a);
    const pts = [];
    const K = 7;
    for (let n = 0; n <= K; n++) { const s = n / K; const w = 0.012 * Math.pow(Math.sin(Math.PI * s), 0.8) * (1 - s * 0.2); pts.push(bx + dx * len * s - dy * w, by + dy * len * s + dx * w); }
    for (let n = K - 1; n >= 1; n--) { const s = n / K; const w = 0.012 * Math.pow(Math.sin(Math.PI * s), 0.8) * (1 - s * 0.2); pts.push(bx + dx * len * s + dy * w * 0.9, by + dy * len * s - dx * w * 0.9); }
    fPoly(T, pts, z + 0.002 * side, M_LEAF, 0.008, 0, 0.3);
    lineL(T, bx, by, bx + dx * len * 0.8, by + dy * len * 0.8, 0.0015, z - 0.001, M_STEM);
  };
  leaf(0.032 * g, -1, 0.05, -0.1 * lean);
  leaf(0.058 * g, 1, 0.045, -0.1 * lean);
  const b = fs.b;
  FLOWER_OUT.headX = tx; FLOWER_OUT.headY = ty;
  const glowK = fs.glow;
  if (b < 0.02) {
    // бутон
    const ba = lean * 0.5;
    const TB = tMul(T, tTRS(tx, ty, -ba, 1, 1));
    const bm = glowK > 0 ? mat(M_BUD.r, M_BUD.g, M_BUD.b, { er: 0.55 * glowK, eg: 0.08 * glowK, eb: 0.3 * glowK, spec: 0.4, obj: 2, flags: F_LIT | F_RECV }) : M_BUD;
    fillSDF(TB, (u, v) => { const e = sdEllipse(0, 0.017, 0.012, 0.017)(u, v); const tip = sdSeg(0, 0.02, 0, 0.041, 0.008, 0.0005)(u, v); return Math.min(e, tip); }, -0.014, -0.002, 0.014, 0.043, z - 0.001, bm, 0.011);
    // чашелистики
    fPoly(TB, [-0.013, 0.004, -0.004, 0.0, -0.002, 0.018], z - 0.002, M_LEAF, 0.004);
    fPoly(TB, [0.013, 0.004, 0.004, 0.0, 0.002, 0.018], z - 0.002, M_LEAF, 0.004);
    return;
  }
  // раскрытый цветок: лепестки в 3D, сортировка по глубине
  const tilt = 0.55;
  const petals = [];
  const NP = 7;
  for (let n = 0; n < NP; n++) {
    const th = n / NP * TAU + 0.3;
    const open = clamp(b * 1.25 - n * 0.035, 0, 1);
    const a = 0.1 + open * 1.25 + Math.sin(open * Math.PI) * 0.15; // захлёст на раскрытии
    const d3 = [Math.sin(a) * Math.cos(th), Math.cos(a), Math.sin(a) * Math.sin(th)];
    const y2 = d3[1] * Math.cos(tilt) - d3[2] * Math.sin(tilt), z2 = d3[1] * Math.sin(tilt) + d3[2] * Math.cos(tilt);
    petals.push({ x: d3[0], y: y2, z: z2 });
  }
  petals.sort((p, q) => p.z - q.z);
  const len = 0.034 * (0.7 + 0.3 * b), wid = 0.015;
  const TF = tMul(T, tTRS(tx, ty, -lean * 0.4, 1, 1));
  const coreDrawn = { v: false };
  const drawCore = () => {
    fEllipse(TF, 0, 0.004, 0.011, 0.011 * (0.55 + 0.45 * Math.cos(tilt)), z - 0.004, mat(M_CORE.r, M_CORE.g, M_CORE.b, { er: 0.35 * glowK, eg: 0.25 * glowK, eb: 0.05 * glowK, spec: 0.3, obj: 2, flags: F_LIT | F_RECV }), 0.008);
    coreDrawn.v = true;
  };
  for (const p of petals) {
    if (!coreDrawn.v && p.z > 0) drawCore();
    const L2 = hyp(p.x, p.y) || 1e-3;
    const ang = Math.atan2(p.y, p.x);
    const l = len * L2;
    const shade = p.z < 0 ? 0.75 : 1;
    const pm = mat(M_PETAL.r * shade, M_PETAL.g * shade, M_PETAL.b * shade, { er: 0.35 * glowK, eg: 0.06 * glowK, eb: 0.16 * glowK, spec: 0.3, obj: 2, flags: F_LIT | F_RECV });
    const TP = tMul(TF, tTRS(Math.cos(ang) * l * 0.55, 0.004 + Math.sin(ang) * l * 0.55, ang, 1, 1));
    fillSDF(TP, (u, v) => { const e = sdEllipse(0, 0, Math.max(0.004, l * 0.55), wid * 0.5)(u, v); return e; }, -l * 0.6, -wid * 0.6, l * 0.6, wid * 0.6, z - 0.003 - p.z * 0.002, pm, wid * 0.4);
  }
  if (!coreDrawn.v) drawCore();
}

/* ---------- Посадочный модуль ---------- */
const M_FOIL = mat(0.86, 0.62, 0.22, { spec: 1.1, obj: 3 });
M_FOIL.tex = (u, v, dd, i) => { // мятая фольга: блики скачут по складкам
  const n1 = vnoise(u * 9, v * 9, 3) - 0.5, n2 = vnoise(u * 23 + 4, v * 23, 4) - 0.5;
  const j = i * 3;
  GB_N[j] += n1 * 0.9 + n2 * 0.4; GB_N[j + 1] += n2 * 0.9;
  const L = hyp3(GB_N[j], GB_N[j + 1], GB_N[j + 2]); GB_N[j] /= L; GB_N[j + 1] /= L; GB_N[j + 2] /= L;
  const k = 0.85 + 0.3 * vnoise(u * 5, v * 5, 9);
  GB_A[j] *= k; GB_A[j + 1] *= k; GB_A[j + 2] *= k;
};
const M_WHITE = mat(0.78, 0.78, 0.8, { spec: 0.3, obj: 3 });
const M_GREY = mat(0.45, 0.46, 0.5, { spec: 0.4, obj: 3 });
const M_GREY_D = mat(0.22, 0.22, 0.27, { spec: 0.3, obj: 3 });
const M_PANEL = mat(0.08, 0.14, 0.3, { spec: 1.5, obj: 3 });
M_PANEL.tex = (u, v, dd, i) => {
  const gx = Math.abs(((u * 11) % 1 + 1) % 1 - 0.5), gy = Math.abs(((v * 11) % 1 + 1) % 1 - 0.5);
  if (gx > 0.43 || gy > 0.43) { const j = i * 3; GB_A[j] = 0.35; GB_A[j + 1] = 0.36; GB_A[j + 2] = 0.42; GB_S[i] = 0.3; }
};
function drawLander(T, z, st) {
  const far = mixMat(M_GREY, 0.15, 0.15, 0.2, 0.4);
  const farM = { ...far };
  // дальние опоры
  for (const s of [-1, 1]) {
    lineL(T, s * 0.55, 0.95, s * 1.1, 0.07, 0.035, z + 0.6, farM);
    fEllipse(T, s * 1.12, 0.05, 0.16, 0.05, z + 0.6, farM, 0.04);
  }
  // солнечная панель на штанге
  lineL(T, 0.62, 1.85, 1.2, 2.0, 0.03, z + 0.2, M_GREY);
  fillSDF(tMul(T, tTRS(1.72, 2.08, 0.12, 1, 1)), sdBox(0, 0, 0.55, 0.2, 0.02), -0.56, -0.21, 0.56, 0.21, z + 0.2, M_PANEL, 0.02, 0.1, 0.25);
  // нижняя ступень в фольге
  fBox(T, 0, 1.15, 0.92, 0.36, 0.08, z, M_FOIL, 0.12);
  fBox(T, 0, 0.8, 0.8, 0.04, 0.02, z - 0.01, M_GREY_D, 0.03);
  // док робота под брюхом
  fBox(T, -0.1, 0.1, 0.34, 0.06, 0.03, z - 0.3, M_GREY_D, 0.04, 0, 0.4);
  fBox(T, -0.1, 0.17, 0.22, 0.012, 0.006, z - 0.31, mat(0.2, 0.2, 0.2, { er: st.dock * 0.2, eg: st.dock * 1.2, eb: st.dock * 0.5, obj: 3 }), 0);
  // верхний модуль
  fBox(T, -0.12, 1.84, 0.64, 0.33, 0.1, z - 0.02, M_WHITE, 0.14);
  fBox(T, -0.42, 1.8, 0.16, 0.22, 0.05, z - 0.03, M_GREY_D, 0.04);          // люк
  fCircle(T, 0.18, 1.9, 0.1, z - 0.03, M_GREY_D, 0.03);                     // иллюминатор
  fCircle(T, 0.18, 1.9, 0.065, z - 0.035, mat(0.1, 0.08, 0.05, { er: 0.9 * st.window, eg: 0.55 * st.window, eb: 0.2 * st.window, spec: 1.2, obj: 3 }), 0.06);
  // мачта с антенной-тарелкой
  lineL(T, 0.3, 2.15, 0.32, 2.55, 0.018, z - 0.02, M_GREY);
  fillSDF(tMul(T, tTRS(0.32, 2.58, 0.5, 1, 1)), (u, v) => Math.max(sdEllipse(0, 0, 0.22, 0.09)(u, v), v - 0.02), -0.23, -0.1, 0.23, 0.03, z - 0.03, M_WHITE, 0.08);
  // маячок
  const bk = st.beacon;
  fCircle(T, -0.5, 2.22, 0.035, z - 0.03, mat(0.6, 0.15, 0.1, { er: 3.2 * bk, eg: 0.5 * bk, eb: 0.2 * bk, obj: 3 }), 0.03);
  lineL(T, -0.5, 2.17, -0.5, 2.1, 0.01, z - 0.02, M_GREY);
  // ближние опоры и лестница
  for (const s of [-1, 1]) {
    lineL(T, s * 0.88, 0.92, s * 1.38, 0.08, 0.04, z - 0.6, M_GREY);
    lineL(T, s * 0.55, 0.8, s * 1.3, 0.12, 0.025, z - 0.6, M_GREY);
    fEllipse(T, s * 1.4, 0.055, 0.19, 0.055, z - 0.6, M_GREY, 0.05, 0, 0.4);
  }
  for (let n = 0; n < 5; n++) {
    const t = (n + 0.5) / 5;
    const x = lerp(-0.88, -1.38, t), y = lerp(0.92, 0.08, t);
    lineL(T, x - 0.04, y, x + 0.12, y + 0.02, 0.008, z - 0.62, M_WHITE);
  }
}

/* ---------- Камень ---------- */
function drawRock(T, z, r, seed, albedo) {
  const m = mat(albedo * 0.75, albedo * 0.74, albedo * 0.77, { spec: 0.05, flags: F_LIT | F_REGO });
  fillSDF(T, (u, v) => {
    const a = Math.atan2(v, u);
    const rr = r * (0.85 + 0.2 * Math.sin(a * 3 + seed) + 0.08 * Math.sin(a * 7 + seed * 2));
    return hyp(u, v * 1.35) - rr;
  }, -r * 1.3, -0.02, r * 1.3, r * 1.05, z, m, r * 0.9, 0, 0.2);
}

/* ---------- Лёд из ядра кометы ---------- */
function drawIce(T, z, glow, t) {
  const pts = [-0.05, 0, -0.06, 0.035, -0.03, 0.07, 0.01, 0.085, 0.05, 0.06, 0.062, 0.02, 0.035, -0.005];
  const g = glow * (0.85 + 0.15 * Math.sin(t * 5));
  const m = mat(0.75, 0.95, 1.0, { spec: 2.2, er: 0.2 * g, eg: 0.7 * g, eb: 0.95 * g });
  fPoly(T, pts, z, m, 0.02);
  // грани
  const fm = mat(0.9, 1, 1, { spec: 2.5, er: 0.35 * g, eg: 0.9 * g, eb: 1.1 * g });
  fPoly(T, [-0.03, 0.07, 0.01, 0.085, 0.0, 0.04, -0.035, 0.035], z - 0.001, fm, 0, -0.3, 0.5);
  fPoly(T, [0.0, 0.04, 0.05, 0.06, 0.062, 0.02, 0.02, 0.01], z - 0.001, mat(0.5, 0.8, 0.95, { spec: 2, er: 0.1 * g, eg: 0.45 * g, eb: 0.7 * g }), 0, 0.5, 0.2);
}
