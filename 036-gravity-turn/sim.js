/* «На орбиту» — физика полёта.
   Классический скрипт: в браузере кладёт API в window.GT, в node — в globalThis.GT (для тестов).
   Плоская задача в плоскости орбиты, инерциальная система с центром в центре Земли. */
(function (root) {
  'use strict';

  const MU = 3.986004418e14;   // гравитационный параметр Земли, м³/с²
  const RE = 6371000;          // средний радиус Земли, м
  const G0 = 9.80665;
  const OMEGA = 7.2921159e-5;  // вращение Земли, рад/с
  const P0 = 101325;
  const DEG = Math.PI / 180;

  // ---------- Атмосфера: стандартная атмосфера 1976 года до 86 км, выше — изотерма ----------
  const LAYERS = [
    [0, 288.15, -0.0065, 101325],
    [11000, 216.65, 0, 22632.06],
    [20000, 216.65, 0.001, 5474.889],
    [32000, 228.65, 0.0028, 868.0187],
    [47000, 270.65, 0, 110.9063],
    [51000, 270.65, -0.0028, 66.93887],
    [71000, 214.65, -0.002, 3.95642],
    [84852, 186.946, 0, 0.3734],
  ];
  const GMR = 0.0341632; // g0·M/R*, К/м

  function atmosphere(h) {
    if (h < 0) h = 0;
    let i = LAYERS.length - 1;
    while (i > 0 && h < LAYERS[i][0]) i--;
    const [hb, Tb, L, pb] = LAYERS[i];
    let T, p;
    if (L === 0) { T = Tb; p = pb * Math.exp(-GMR * (h - hb) / Tb); }
    else { T = Tb + L * (h - hb); p = pb * Math.pow(Tb / T, GMR / L); }
    return { T, p, rho: p / (287.053 * T), a: Math.sqrt(1.4 * 287.053 * T) };
  }

  // Коэффициент лобового сопротивления по числу Маха: пик в трансзвуке
  function cdOfMach(M) {
    if (M < 0.8) return 0.3;
    if (M < 1.1) return 0.3 + (M - 0.8) / 0.3 * 0.24;
    if (M < 2.2) return 0.54 - (M - 1.1) / 1.1 * 0.2;
    return Math.max(0.22, 0.34 - (M - 2.2) * 0.03);
  }

  // ---------- Ракета «Стриж-2»: условная двухступенчатая ракета среднего класса ----------
  const ROCKET = {
    name: 'Стриж-2',
    area: Math.PI * 1.85 * 1.85,
    s1: { dry: 25600, prop: 395700, thrustVac: 8227e3, ispSL: 282, ispVac: 311 },
    s2: { dry: 4000, prop: 92670, thrustVac: 981e3, ispVac: 348, exitArea: 4.5 },
    fairing: 1900,
  };
  ROCKET.s1.mdot = ROCKET.s1.thrustVac / (ROCKET.s1.ispVac * G0);
  ROCKET.s1.exitArea = (ROCKET.s1.thrustVac - ROCKET.s1.thrustVac * ROCKET.s1.ispSL / ROCKET.s1.ispVac) / P0;
  ROCKET.s2.mdot = ROCKET.s2.thrustVac / (ROCKET.s2.ispVac * G0);

  const SITES = {
    vostochny: { name: 'Восточный', lat: 51.88 },
    baikonur: { name: 'Байконур', lat: 45.96 },
    plesetsk: { name: 'Плесецк', lat: 62.93 },
    kourou: { name: 'Куру', lat: 5.24 },
  };

  const COUNTDOWN = [
    [-10, 'Ключ на старт!'], [-9, 'Протяжка один'], [-8, 'Продувка'], [-7, 'Ключ на дренаж'],
    [-6, 'Пуск'], [-5, 'Протяжка два'], [-4, 'Земля — борт'], [-3, 'Зажигание'],
    [-2, 'Предварительная'], [-1, 'Промежуточная'], [0, 'Главная'],
  ];

  const EVENT_TEXT = {
    liftoff: 'Подъём!',
    contact: 'Есть контакт подъёма',
    kick: 'Начало манёвра по тангажу',
    throttle: 'Дросселирование двигателей',
    maxq: 'Максимальный скоростной напор',
    meco: 'Выключение двигателей первой ступени',
    sep: 'Отделение первой ступени',
    ses: 'Запуск двигателя второй ступени',
    fairing: 'Сброс головного обтекателя',
    seco: 'Выключение двигателя второй ступени',
    orbit: 'Выход на орбиту',
    payload: 'Отделение полезной нагрузки',
  };

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  function orbitOf(x, y, vx, vy) {
    const r = Math.hypot(x, y);
    const v2 = vx * vx + vy * vy;
    const eps = v2 / 2 - MU / r;
    const hA = x * vy - y * vx;
    const e = Math.sqrt(Math.max(0, 1 + 2 * eps * hA * hA / (MU * MU)));
    if (eps >= 0) return { eps, e, a: Infinity, rp: (hA * hA / MU) / (1 + e), ra: Infinity, period: Infinity };
    const a = -MU / (2 * eps);
    return { eps, e, a, rp: a * (1 - e), ra: a * (1 + e), period: 2 * Math.PI * Math.sqrt(a * a * a / MU) };
  }

  // ---------- Полёт ----------
  function Flight(opts) {
    const o = Object.assign({
      payload: 15000, targetAlt: 220000, kickDeg: 6, qLimit: 32000, gLimit: 4.2,
      site: 'vostochny', sunDep: 6, mode: 'auto',
    }, opts || {});
    this.o = o;
    this.lat = SITES[o.site].lat;
    this.vRot = OMEGA * RE * Math.cos(this.lat * DEG);
    this.wEff = this.vRot / RE;                  // угловая скорость площадки в плоскости полёта
    this.t = -11;
    this.x = 0; this.y = RE; this.vx = this.vRot; this.vy = 0;
    this.prop1 = ROCKET.s1.prop; this.prop2 = ROCKET.s2.prop;
    this.hasS1 = true; this.hasFairing = true; this.hasPayload = true;
    this.stage = 1;
    this.engineOn = false; this.throttle = 0; this.userThrottle = 1;
    this.pitch = 90; this.cmdPitch = 90; this.userPitch = 90;
    this.onPad = true;
    this.phase = 'countdown';
    this.kickT = null; this.turnActive = false;
    this.mecoT = null; this.secoT = null;
    this.events = []; this.fired = {};
    this.loss = { grav: 0, drag: 0, steer: 0, burn: 0 };
    this.maxQ = 0; this.maxQt = 0; this.maxQh = 0; this.maxG = 0;
    this.q = 0; this.mach = 0; this.gLoad = 1; this.alpha = 0; this.thrust = 0; this.drag = 0;
    this.samples = [];
    this.nextSample = 0;
    this.trail = [];
    this.nextTrail = 0;
    this.failure = null;
    this.debris = [];
    this.countIdx = 0;
    this.update(0);
  }

  Flight.prototype.mass = function () {
    let m = ROCKET.s2.dry + this.prop2;
    if (this.hasS1) m += ROCKET.s1.dry + this.prop1;
    if (this.hasFairing) m += ROCKET.fairing;
    if (this.hasPayload) m += this.o.payload;
    return m;
  };

  Flight.prototype.log = function (key, text, tAt) {
    if (this.fired[key]) return;
    this.fired[key] = true;
    this.events.push({ key, t: tAt === undefined ? this.t : tAt, text: text || EVENT_TEXT[key] || key, h: this.alt() });
  };

  Flight.prototype.alt = function () { return Math.hypot(this.x, this.y) - RE; };

  Flight.prototype.local = function () {
    const r = Math.hypot(this.x, this.y);
    const ux = this.x / r, uy = this.y / r;
    const ex = uy, ey = -ux;
    const airX = this.wEff * this.y, airY = -this.wEff * this.x;
    const rvx = this.vx - airX, rvy = this.vy - airY;
    return {
      r, ux, uy, ex, ey,
      vr: this.vx * ux + this.vy * uy, vh: this.vx * ex + this.vy * ey,
      relR: rvx * ux + rvy * uy, relH: rvx * ex + rvy * ey, rvx, rvy,
    };
  };

  // Тяга и расход текущей ступени
  Flight.prototype.engine = function (p) {
    if (!this.engineOn || this.throttle <= 0) return { F: 0, mdot: 0 };
    if (this.stage === 1) {
      const s = ROCKET.s1;
      return { F: Math.max(0, this.throttle * s.thrustVac - p * s.exitArea), mdot: this.throttle * s.mdot };
    }
    const s = ROCKET.s2;
    return { F: Math.max(0, this.throttle * s.thrustVac - p * s.exitArea), mdot: this.throttle * s.mdot };
  };

  // Ускорение для интегратора (масса и тяга фиксированы на шаге)
  Flight.prototype.accel = function (x, y, vx, vy, m, F, pitchRad) {
    const r = Math.hypot(x, y);
    const ux = x / r, uy = y / r, ex = uy, ey = -ux;
    const g = MU / (r * r);
    let ax = -g * ux, ay = -g * uy;
    const dx = Math.cos(pitchRad) * ex + Math.sin(pitchRad) * ux;
    const dy = Math.cos(pitchRad) * ey + Math.sin(pitchRad) * uy;
    ax += F / m * dx; ay += F / m * dy;
    const h = r - RE;
    if (h < 150000) {
      const at = atmosphere(h);
      const rvx = vx - this.wEff * y, rvy = vy + this.wEff * x;
      const vrel = Math.hypot(rvx, rvy);
      if (vrel > 0.01) {
        const cd = cdOfMach(vrel / at.a) * (this.hasFairing || this.hasS1 ? 1 : 1.25);
        const D = 0.5 * at.rho * vrel * vrel * cd * ROCKET.area;
        ax -= D / m * rvx / vrel; ay -= D / m * rvy / vrel;
      }
    }
    return [ax, ay];
  };

  // ---------- Наведение ----------
  Flight.prototype.guide = function (dt, L, h, atm) {
    const o = this.o;
    const relV = Math.hypot(L.relR, L.relH);
    const gammaRel = Math.atan2(L.relR, L.relH) / DEG;

    if (o.mode === 'manual') {
      this.cmdPitch = this.userPitch;
    } else if (this.stage === 1) {
      if (this.kickT === null && relV > 50) { this.kickT = this.t; this.log('kick'); }
      if (this.kickT === null) this.cmdPitch = 90;
      else {
        const k = clamp((this.t - this.kickT) / 8, 0, 1);
        const kickPitch = 90 - o.kickDeg * k;
        if (!this.turnActive && k >= 1 && gammaRel <= kickPitch + 0.05) this.turnActive = true;
        this.cmdPitch = this.turnActive ? gammaRel : kickPitch;
      }
    } else {
      this.cmdPitch = this.upperGuidance(L, h);
    }
    // Ограничение скорости поворота
    const rate = (o.mode === 'manual' ? 6 : 4) * dt;
    this.pitch += clamp(this.cmdPitch - this.pitch, -rate, rate);

    // Дроссель
    let thr = 1;
    if (o.mode === 'manual') thr = this.userThrottle;
    else if (this.stage === 1) {
      const q = this.q;
      if (q > 0.88 * o.qLimit) thr = Math.min(thr, clamp(1 - (q - 0.88 * o.qLimit) / (0.2 * o.qLimit), 0.62, 1));
      const m = this.mass();
      const Fmax = ROCKET.s1.thrustVac - atm.p * ROCKET.s1.exitArea;
      const gAllowed = o.gLimit * G0 * m;
      if (Fmax > gAllowed) thr = Math.min(thr, clamp((gAllowed + atm.p * ROCKET.s1.exitArea) / ROCKET.s1.thrustVac, 0.4, 1));
      if (thr < 0.97 && this.t > 20) this.log('throttle');
    }
    const trate = 0.5 * dt;
    this.throttle += clamp(thr - this.throttle, -trate, trate);
  };

  // ---------- Наведение второй ступени: закон линейного тангенса ----------
  // tg θ(τ) = A + B·τ. Методом пристрелки подбираем A и B так, чтобы к моменту набора
  // круговой скорости высота была целевой, а вертикальная скорость — нулевой.
  Flight.prototype.propagateLT = function (A, B, s) {
    const F = ROCKET.s2.thrustVac, mdot = ROCKET.s2.mdot;
    const mEmpty = s.m - s.prop;
    let r = s.r, vr = s.vr, vh = s.vh, m = s.m, t = 0;
    const dt = 1;
    let prev = null;
    for (let i = 0; i < 900; i++) {
      const th = Math.atan(A + B * (t + dt / 2));
      const f = (rr, vvr, vvh, mm) => {
        const a = F / mm;
        return [vvr, vvh * vvh / rr - MU / (rr * rr) + a * Math.sin(th), -vvr * vvh / rr + a * Math.cos(th)];
      };
      const k1 = f(r, vr, vh, m);
      const k2 = f(r + k1[0] * dt / 2, vr + k1[1] * dt / 2, vh + k1[2] * dt / 2, m - mdot * dt / 2);
      const nr = r + k2[0] * dt, nvr = vr + k2[1] * dt, nvh = vh + k2[2] * dt, nm = m - mdot * dt;
      const g0 = vh - Math.sqrt(MU / r), g1 = nvh - Math.sqrt(MU / nr);
      if (g1 >= 0) {
        const u = g0 < 0 ? -g0 / (g1 - g0) : 0;
        return { r: r + (nr - r) * u, vr: vr + (nvr - vr) * u, t: t + dt * u, ok: true };
      }
      if (nm <= mEmpty) return { r: nr, vr: nvr, t: t + dt, ok: false };
      r = nr; vr = nvr; vh = nvh; m = nm; t += dt;
      prev = g1;
    }
    return { r, vr, t, ok: false };
  };

  Flight.prototype.upperGuidance = function (L, h) {
    const rT = RE + this.o.targetAlt;
    const s = { r: L.r, vr: L.vr, vh: L.vh, m: this.mass(), prop: this.prop2 };
    if (!this.lt) {
      const tgo = 300;
      const A0 = Math.tan(Math.max(-0.3, Math.min(1.2, this.pitch * DEG)));
      this.lt = { A: A0, B: -A0 / tgo, t0: this.t, frozen: false, tgo: tgo, fails: 0 };
    }
    const lt = this.lt;
    // Параметры закона живут в собственном времени; сдвигаем начало отсчёта к «сейчас»
    const shift = this.t - lt.t0;
    lt.A += lt.B * shift; lt.t0 = this.t;
    if (!lt.frozen && (this.t - (lt.solvedAt || -1e9) >= 1)) {
      lt.solvedAt = this.t;
      let A = lt.A, B = lt.B, res = null;
      for (let it = 0; it < 6; it++) {
        const p0 = this.propagateLT(A, B, s);
        const f1 = (p0.r - rT) / 1000, f2 = p0.vr / 10;
        res = p0;
        if (Math.abs(f1) < 0.05 && Math.abs(f2) < 0.05) break;
        const dA = 0.002, dB = 0.00002;
        const pa = this.propagateLT(A + dA, B, s), pb = this.propagateLT(A, B + dB, s);
        const j11 = ((pa.r - rT) / 1000 - f1) / dA, j12 = ((pb.r - rT) / 1000 - f1) / dB;
        const j21 = (pa.vr / 10 - f2) / dA, j22 = (pb.vr / 10 - f2) / dB;
        const det = j11 * j22 - j12 * j21;
        if (!isFinite(det) || Math.abs(det) < 1e-12) break;
        let stepA = (f1 * j22 - f2 * j12) / det, stepB = (j11 * f2 - j21 * f1) / det;
        const lim = 0.5;
        if (Math.abs(stepA) > lim) { stepB *= lim / Math.abs(stepA); stepA = Math.sign(stepA) * lim; }
        A -= stepA; B -= stepB;
      }
      if (res && res.ok && Math.abs(res.r - rT) < 5000 && Math.abs(res.vr) < 50 && isFinite(A + B)) {
        lt.A = A; lt.B = B; lt.tgo = res.t; lt.fails = 0; lt.good = true;
      } else {
        lt.fails++;
        lt.good = false;
      }
      if (lt.tgo < 8) lt.frozen = true;
    }
    if (!lt.good && lt.fails > 0) {
      // Запасной регулятор: держим вертикальную скорость по простой кинематике
      const r = L.r, g = MU / (r * r), m = this.mass();
      const aT = ROCKET.s2.thrustVac / m;
      const tgo = Math.max(15, lt.tgo || 200);
      const vd = clamp(2 * (this.o.targetAlt - h) / tgo, -150, 1500);
      const need = (vd - L.vr) / 30 + g - L.vh * L.vh / r;
      return Math.asin(clamp(need / aT, -0.35, 0.97)) / DEG;
    }
    return Math.atan(lt.A) / DEG;
  };

  // ---------- Шаг симуляции ----------
  Flight.prototype.update = function (dt) {
    this.t += dt;
    // Отсчёт
    while (this.countIdx < COUNTDOWN.length && this.t >= COUNTDOWN[this.countIdx][0]) {
      const [tc, text] = COUNTDOWN[this.countIdx++];
      this.events.push({ key: 'cmd', t: tc, text, h: 0 });
    }
    if (this.phase === 'countdown') {
      if (this.t >= -3) { this.engineOn = true; this.throttle = clamp((this.t + 3) / 3, 0, 1) * 0.999 + 0.001; }
      this.thrust = this.engineOn ? this.throttle * ROCKET.s1.thrustVac - P0 * ROCKET.s1.exitArea : 0;
      if (this.t >= 0) {
        this.phase = 'ascent'; this.onPad = false; this.throttle = 1;
        this.log('liftoff');
      }
      return;
    }
    if (this.phase === 'failed' || dt <= 0) return;

    const L = this.local();
    const h = L.r - RE;
    const atm = atmosphere(h);

    // Этапы и события
    if (this.t > 2) this.log('contact');
    if (this.stage === 1 && this.engineOn && this.prop1 <= 0) {
      this.prop1 = 0; this.engineOn = false; this.throttle = 0; this.mecoT = this.t; this.log('meco');
    }
    if (this.mecoT !== null && this.hasS1 && this.t >= this.mecoT + 3) {
      this.hasS1 = false; this.stage = 2; this.log('sep');
      this.debris.push({ kind: 'stage1', x: this.x, y: this.y, vx: this.vx - L.ux * 1.5 * 0 - (Math.cos(this.pitch * DEG) * L.ex + Math.sin(this.pitch * DEG) * L.ux) * 2, vy: this.vy - (Math.cos(this.pitch * DEG) * L.ey + Math.sin(this.pitch * DEG) * L.uy) * 2, ang: this.pitch, spin: 6, t0: this.t, m: ROCKET.s1.dry });
    }
    if (this.stage === 2 && !this.fired.ses && this.t >= this.mecoT + 8) {
      this.engineOn = true; this.throttle = 0.2; this.log('ses');
    }
    if (this.stage === 2 && this.hasFairing && h > 110000 && this.q < 20) {
      this.hasFairing = false; this.log('fairing');
      const dxA = Math.cos(this.pitch * DEG) * L.ex + Math.sin(this.pitch * DEG) * L.ux;
      const dyA = Math.cos(this.pitch * DEG) * L.ey + Math.sin(this.pitch * DEG) * L.uy;
      for (const side of [-1, 1]) {
        const nx = dyA * side, ny = -dxA * side; // перпендикуляр к оси
        this.debris.push({ kind: 'fairing', side, x: this.x, y: this.y, vx: this.vx + nx * 3, vy: this.vy + ny * 3, ang: this.pitch, spin: side * 25, t0: this.t, m: ROCKET.fairing / 2 });
      }
    }

    // Выключение второй ступени
    if (this.stage === 2 && this.engineOn) {
      const orb = orbitOf(this.x, this.y, this.vx, this.vy);
      const autoCut = this.o.mode === 'auto' && orb.rp - RE >= this.o.targetAlt - 4000;
      if (this.prop2 <= 0 || autoCut || this.userCut) {
        this.prop2 = Math.max(0, this.prop2);
        this.engineOn = false; this.throttle = 0; this.secoT = this.t; this.log('seco');
        if (orb.rp - RE > 120000) { this.log('orbit'); this.phase = 'orbit'; }
        else { this.phase = 'coast'; this.failure = this.prop2 <= 0 ? 'fuel' : 'suborbital'; }
      }
    }
    if (this.secoT !== null && this.phase === 'orbit' && this.hasPayload && this.t >= this.secoT + 25) {
      this.hasPayload = false; this.log('payload');
      const d = { ux: L.ux, uy: L.uy };
      this.debris.push({ kind: 'payload', x: this.x, y: this.y, vx: this.vx + L.ex * 0.6 + d.ux * 0.15, vy: this.vy + L.ey * 0.6 + d.uy * 0.15, ang: this.pitch, spin: 1.5, t0: this.t, m: this.o.payload });
    }

    // Наведение и дроссель
    if (this.engineOn) this.guide(dt, L, h, atm);
    else if (this.o.mode === 'auto' && this.stage === 2 && !this.fired.ses) {
      // пауза разделения: держим ориентацию
    } else if (this.phase === 'orbit' || this.phase === 'coast') {
      const gammaIn = Math.atan2(L.vr, L.vh) / DEG;
      this.pitch += clamp(gammaIn - this.pitch, -2 * dt, 2 * dt);
    }

    // Интегрирование RK4
    const m = this.mass();
    const eng = this.engine(atm.p);
    const pr = this.pitch * DEG;
    const x = this.x, y = this.y, vx = this.vx, vy = this.vy;
    const k1 = this.accel(x, y, vx, vy, m, eng.F, pr);
    const k2 = this.accel(x + vx * dt / 2, y + vy * dt / 2, vx + k1[0] * dt / 2, vy + k1[1] * dt / 2, m, eng.F, pr);
    const k3 = this.accel(x + (vx + k1[0] * dt / 2) * dt / 2, y + (vy + k1[1] * dt / 2) * dt / 2, vx + k2[0] * dt / 2, vy + k2[1] * dt / 2, m, eng.F, pr);
    const k4 = this.accel(x + (vx + k2[0] * dt / 2) * dt, y + (vy + k2[1] * dt / 2) * dt, vx + k3[0] * dt, vy + k3[1] * dt, m, eng.F, pr);
    this.x += dt * (vx + dt / 6 * (k1[0] + k2[0] + k3[0])) ;
    this.y += dt * (vy + dt / 6 * (k1[1] + k2[1] + k3[1]));
    this.vx += dt / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
    this.vy += dt / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);

    // Расход топлива
    if (eng.mdot > 0) {
      if (this.stage === 1) this.prop1 -= eng.mdot * dt; else this.prop2 -= eng.mdot * dt;
    }

    // Диагностика: напор, Мах, угол атаки, перегрузка, потери
    const vrel = Math.hypot(L.rvx, L.rvy);
    this.q = 0.5 * atm.rho * vrel * vrel;
    this.mach = vrel / atm.a;
    this.thrust = eng.F;
    const cd = cdOfMach(this.mach);
    this.drag = h < 150000 ? this.q * cd * ROCKET.area : 0;
    const dX = Math.cos(pr) * L.ex + Math.sin(pr) * L.ux, dY = Math.cos(pr) * L.ey + Math.sin(pr) * L.uy;
    this.alpha = vrel > 30 ? Math.acos(clamp((dX * L.rvx + dY * L.rvy) / vrel, -1, 1)) / DEG : 0;
    const sx = eng.F / m * dX - (vrel > 0.01 ? this.drag / m * L.rvx / vrel : 0);
    const sy = eng.F / m * dY - (vrel > 0.01 ? this.drag / m * L.rvy / vrel : 0);
    this.gLoad = Math.hypot(sx, sy) / G0;
    if (this.gLoad > this.maxG) this.maxG = this.gLoad;
    if (this.q > this.maxQ) { this.maxQ = this.q; this.maxQt = this.t; this.maxQh = h; }
    if (!this.fired.maxq && this.maxQ > 8000 && this.q < this.maxQ * 0.985) this.log('maxq', EVENT_TEXT.maxq, this.maxQt);
    if (eng.F > 0) {
      const v = Math.hypot(this.vx, this.vy);
      const vxn = this.vx / v, vyn = this.vy / v;
      const aT = eng.F / m;
      this.loss.burn += aT * dt;
      this.loss.steer += aT * (1 - (dX * vxn + dY * vyn)) * dt;
      this.loss.grav += MU / (L.r * L.r) * (vxn * L.ux + vyn * L.uy) * dt;
      this.loss.drag += this.drag / m * dt;
    }

    // Аварии
    if (this.q * this.alpha > 260000 && this.q > 5000) this.fail('breakup');
    if (this.alt() < -5 && this.t > 5) this.fail('crash');

    // Обломки летят баллистически
    for (const d of this.debris) {
      const n = 2;
      for (let i = 0; i < n; i++) {
        const [ax, ay] = this.accelBallistic(d.x, d.y, d.vx, d.vy, d);
        d.vx += ax * dt / n; d.vy += ay * dt / n;
        d.x += d.vx * dt / n; d.y += d.vy * dt / n;
      }
      d.ang += d.spin * dt;
    }

    // Выборки для графиков и след
    if (this.t >= this.nextSample) {
      this.nextSample = this.t + 1;
      this.samples.push({ t: this.t, h: this.alt(), v: vrel, q: this.q, g: this.gLoad, vIn: Math.hypot(this.vx, this.vy) });
    }
    if (this.t >= this.nextTrail) {
      this.nextTrail = this.t + (this.t < 20 ? 0.1 : 0.25);
      this.trail.push({ x: this.x, y: this.y, t: this.t, on: eng.F > 0 ? 1 : 0, stage: this.stage, h: this.alt() });
      if (this.trail.length > 3200) this.trail.shift();
    }
  };

  Flight.prototype.accelBallistic = function (x, y, vx, vy, d) {
    const r = Math.hypot(x, y);
    const g = MU / (r * r);
    let ax = -g * x / r, ay = -g * y / r;
    const h = r - RE;
    if (h < 150000 && h > -100) {
      const at = atmosphere(h);
      const rvx = vx - this.wEff * y, rvy = vy + this.wEff * x;
      const v = Math.hypot(rvx, rvy);
      if (v > 0.01) {
        const area = d.kind === 'stage1' ? 60 : d.kind === 'fairing' ? 30 : 8;
        const D = 0.5 * at.rho * v * v * 0.9 * area;
        ax -= D / d.m * rvx / v; ay -= D / d.m * rvy / v;
      }
    }
    return [ax, ay];
  };

  Flight.prototype.fail = function (reason) {
    if (this.phase === 'failed') return;
    this.phase = 'failed'; this.failure = reason; this.engineOn = false; this.throttle = 0;
    const text = { breakup: 'Аэродинамическое разрушение: слишком большой угол атаки при высоком напоре', crash: 'Ракета упала на Землю' }[reason] || reason;
    this.events.push({ key: 'fail', t: this.t, text, h: this.alt() });
  };

  Flight.prototype.downrange = function () {
    const siteAng = Math.PI / 2 - this.wEff * Math.max(0, this.t);
    return RE * (siteAng - Math.atan2(this.y, this.x));
  };

  Flight.prototype.orbit = function () { return orbitOf(this.x, this.y, this.vx, this.vy); };

  // Солнце: насколько оно под местным горизонтом (градусы), с учётом ухода на восток
  Flight.prototype.sunDepression = function () {
    return this.o.sunDep + this.downrange() / RE / DEG;
  };
  Flight.prototype.dip = function (h) {
    const hh = h === undefined ? this.alt() : h;
    return Math.acos(RE / (RE + Math.max(0, hh))) / DEG;
  };

  // Прогон «расчётной траектории» до выхода на орбиту
  function simulate(opts, maxT) {
    const f = new Flight(opts);
    const dt = 0.05;
    const limit = maxT || 900;
    while (f.t < limit) {
      f.update(dt);
      if (f.phase === 'failed') break;
      if (f.secoT !== null && f.t > f.secoT + 40) break;
    }
    return f;
  }

  root.GT = { MU, RE, G0, OMEGA, DEG, ROCKET, SITES, COUNTDOWN, EVENT_TEXT, atmosphere, cdOfMach, orbitOf, Flight, simulate, clamp };
})(typeof window !== 'undefined' ? window : globalThis);
