/* ================================================================
   Штурман · физика
   Аркадная «велосипедная» модель: две оси, шины с насыщением по кругу трения,
   перенос веса, ручник, помощь в контрруле. Прыжки — честная вертикаль.
   Здесь же автопилот (заставка и эталонный график) и телеметрия с событиями,
   которые получает штурман.
   ================================================================ */
(function (R) {
  'use strict';
  const { clamp, lerp } = R.util;
  const G = 9.81;
  const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

  const P = {
    m: 1230, Iz: 1500, a: 1.16, b: 1.34, h: 0.52,
    Cf: 64000, Cr: 60000,
    mu: 0.97,
    drive: 11200, power: 235000, vmax: 47,
    brake: 15000, hb: 7000,
    drag: 0.42, roll: 40,
    frontShare: 0.38,
  };
  const L = P.a + P.b;

  class Car {
    constructor(T) { this.T = T; this.reset(T.startS, 0); }

    reset(s, lat) {
      const T = this.T, i = clamp(Math.round(s), 0, T.N - 2);
      const [lx, ly] = T.leftOf(i);
      this.x = T.X[i] + lx * (lat || 0); this.y = T.Y[i] + ly * (lat || 0);
      this.phi = T.PH[i];
      this.vx = 0; this.vy = 0; this.w = 0; this.delta = 0;
      this.idx = i; this.s = i; this.lat = lat || 0;
      const g = T.heightAt(this.x, this.y, i);
      this.z = g.h; this.vz = 0; this.air = false; this.airT = 0; this.groundH = g.h;
      this.ax = 0; this.ay = 0; this.u = 0; this.v = 0; this.beta = 0;
      this.surface = 'road'; this.offT = 0;
      this.slipF = 0; this.slipR = 0; this.wheelSpin = 0;
      this.rpm = 900; this.gear = 1; this.damage = 0;
      this.pitch = 0; this.roll = 0; this.bounce = 0; this.bounceV = 0;
      this.contacts = [];   // удары за шаг: {imp, kind}
      this.landing = 0;     // сила последнего приземления
    }

    // inp: steer −1…1 (+ вправо), throttle 0…1, brake 0…1, hand 0/1
    // Модель аркадная: нос поворачивает к «кинематической» угловой скорости, но не быстрее,
    // чем позволяет сцепление × запас на занос; скорость догоняет курс с ограниченным боковым ускорением.
    step(dt, inp) {
      const T = this.T;
      this.preSpeed = Math.hypot(this.vx, this.vy);
      let c = Math.cos(this.phi), s = Math.sin(this.phi);
      let u = this.vx * c + this.vy * s;          // вперёд
      let v = -this.vx * s + this.vy * c;         // влево
      const au = Math.abs(u);

      // --- покрытие под машиной ---
      const pr = T.projectNear(this.x, this.y, this.idx, 30);
      this.idx = pr.idx; this.s = pr.s; this.lat = pr.lat;
      const d = pr.dist;
      let mu = P.mu, extra = 0, softF = 0;
      if (d <= T.HALF_W + 0.35) this.surface = 'road';
      else if (d <= T.HALF_W + T.SHOULDER + 0.3) { this.surface = 'shoulder'; mu *= 0.92; extra = 60; }
      else { this.surface = 'grass'; mu *= 0.78; extra = 190; softF = 800; }
      const ground = !this.air;
      const aMax = mu * G;
      const hb = inp.hand ? 1 : 0;
      const thr = clamp(inp.throttle, 0, 1), brk = clamp(inp.brake, 0, 1);

      // --- руль ---
      const steerMax = 0.56 / (1 + au / 17);
      const target = -clamp(inp.steer, -1, 1) * steerMax;
      this.delta += clamp(target - this.delta, -3.4 * dt, 3.4 * dt);
      const dl = this.delta;
      this.beta = au > 2 ? Math.atan2(v, au) : 0;

      // --- продольная динамика вдоль курса ---
      const dmg = 1 - 0.35 * this.damage * this.damage;
      let Fx = 0;
      if (thr > 0) {
        if (u > -1) Fx += thr * Math.min(P.drive, P.power / Math.max(au, 1), aMax * P.m * 1.05) * clamp((P.vmax - u) / 5, 0, 1) * dmg;
        else Fx += thr * P.brake;                                     // газ на заднем ходу — тормозит
      }
      if (brk > 0) {
        if (u > 1) Fx -= brk * Math.min(P.brake, aMax * P.m * 1.1);
        else Fx -= brk * 5200 * clamp((9 + u) / 4, 0, 1);            // задний ход
      }
      if (hb) Fx -= 3600 * clamp(u / 2, -1, 1);
      Fx -= P.drag * u * au + P.roll * u + extra * u + softF * clamp(u / 3, -1, 1);
      if (ground) {
        const i = clamp(this.idx, 0, T.N - 2);
        Fx -= P.m * G * (T.H[i + 1] - T.H[i]) * Math.cos(this.phi - T.PH[i]);
        u += Fx / P.m * dt;
      } else u -= (P.drag * u * au) / P.m * dt;

      // --- рыскание: кинематика, ограниченная сцеплением ---
      if (ground) {
        const wKin = u * Math.tan(dl) / L;
        // запас «пере-вращения»: ручник, торможение в повороте, сброс газа, газ в заносе
        let over = 1.22 + hb * 0.9;
        if (brk > 0 && au > 8) over += 0.28 * brk;
        if (thr > 0.6 && Math.abs(this.beta) > 0.12) over += 0.25;
        const wCap = aMax / Math.max(au, 3) * over;
        const wT = clamp(wKin, -wCap, wCap);
        // выравнивающий момент: нос тянется к вектору скорости (сильнее при большом угле)
        const b = this.beta, ab = Math.abs(b);
        const align = (2.6 + (ab > 0.7 ? (ab - 0.7) * 9 : 0)) * b * clamp(au / 8, 0, 1) * (hb ? 0.45 : 1);
        this.w += ((wT - this.w) * 7.5 + align) * dt;
      } else {
        this.w -= this.w * 0.8 * dt;
      }
      this.phi = wrap(this.phi + this.w * dt);

      // --- боковое сцепление: скорость догоняет курс ---
      // пересчёт в новую систему координат после поворота носа
      const vxw = u * c - v * s, vyw = u * s + v * c;
      c = Math.cos(this.phi); s = Math.sin(this.phi);
      u = vxw * c + vyw * s; v = -vxw * s + vyw * c;
      if (ground) {
        let kLat = 6.5;
        if (hb) kLat = 1.6;
        else if (thr > 0.6 && Math.abs(this.beta) > 0.15) kLat = 3.2;   // газ держит занос
        const want = -v * (1 - Math.exp(-kLat * dt));
        const cap = aMax * (hb ? 0.55 : 1) * dt;
        v += clamp(want, -cap, cap);
        if (au < 2.5) v *= 1 - (1 - au / 2.5) * 0.25;                 // на месте боком не ползём
        if (thr === 0 && brk === 0 && au < 0.4) u *= 0.9;
      }
      this.vx = u * c - v * s; this.vy = u * s + v * c;
      this.x += this.vx * dt; this.y += this.vy * dt;

      // ускорения в системе машины — для крена и тангажа кузова
      this.ax = lerp(this.ax, Fx / P.m, Math.min(1, dt * 8));
      this.ay = lerp(this.ay, ground ? u * this.w : 0, Math.min(1, dt * 8));
      this.slipR = Math.abs(this.beta); this.slipF = Math.abs(this.beta) * 0.5;

      // --- столкновения с деревьями и камнями ---
      this.contacts.length = 0;
      this.collide();

      // --- вертикаль: земля, отрыв, полёт, приземление ---
      const gr = T.heightAt(this.x, this.y, this.idx);
      const h = gr.h;
      const rateG = (h - this.groundH) / dt;
      this.groundH = h;
      this.vz -= G * dt;
      let zn = this.z + this.vz * dt;
      this.landing = 0;
      if (zn <= h) {
        if (this.air) {
          const imp = rateG - this.vz;
          this.landing = imp;
          this.bounceV -= imp * 0.5;
        }
        zn = h; this.vz = Math.max(rateG, -30) * (this.air ? 0.2 : 1);
        this.air = false; this.airT = 0;
      } else if (zn > h + 0.05) {
        this.air = true; this.airT += dt;
      }
      this.z = zn;

      // --- визуальная подвеска: тангаж, крен, подпрыгивание ---
      const bump = this.surface === 'grass' ? (Math.random() - 0.5) * au * 0.05 : this.surface === 'shoulder' ? (Math.random() - 0.5) * au * 0.015 : (Math.random() - 0.5) * au * 0.004;
      this.bounceV += (-this.bounce * 160 - this.bounceV * 14) * dt + bump;
      this.bounce += this.bounceV * dt;
      this.bounce = clamp(this.bounce, -0.25, 0.2);
      const tp = this.air ? clamp(-this.vz * 0.03, -0.25, 0.25) : clamp(-this.ax * 0.011, -0.07, 0.07);
      this.pitch = lerp(this.pitch, tp, Math.min(1, dt * 6));
      this.roll = lerp(this.roll, clamp(this.ay * 0.009, -0.08, 0.08), Math.min(1, dt * 6));

      // --- коробка и обороты (для звука и приборов) ---
      const kmh = au * 3.6;
      const up = [0, 38, 66, 94, 124, 152, 999];
      let g = 1; while (g < 6 && kmh > up[g]) g++;
      this.gear = u < -0.5 ? -1 : g;
      const lo = up[g - 1], hi = Math.min(up[g], 175);
      const slipSpin = (inp.throttle > 0 && (this.surface !== 'road' || this.slipR > 0.12)) ? 0.25 : 0;
      const tr = g === 1 ? 0.35 + 0.6 * (kmh / 38) : 0.45 + 0.55 * clamp((kmh - lo) / (hi - lo), 0, 1);
      const rpmT = 900 + 6400 * clamp(tr + slipSpin * inp.throttle + (this.air ? inp.throttle * 0.3 : 0), 0, 1.05);
      this.rpm = lerp(this.rpm, rpmT, Math.min(1, dt * 10));
      this.wheelSpin += (u / 0.33) * dt;
      this.u = u; this.v = v;
    }

    collide() {
      const T = this.T, near = T.obstaclesNear(this.x, this.y, this._near || (this._near = []));
      if (!near.length) return;
      const c = Math.cos(this.phi), s = Math.sin(this.phi);
      const circles = [1.45, 0, -1.45];
      const rc = 0.92;
      for (const o of near) {
        for (const off of circles) {
          const cx = this.x + c * off, cy = this.y + s * off;
          const dx = cx - o.x, dy = cy - o.y;
          const dist = Math.hypot(dx, dy), minD = rc + o.r;
          if (dist >= minD || dist < 1e-5) continue;
          const nx = dx / dist, ny = dy / dist;
          const pen = minD - dist;
          this.x += nx * pen; this.y += ny * pen;
          // скорость точки контакта
          const rx = c * off - nx * rc, ry = s * off - ny * rc;
          const pvx = this.vx - this.w * ry, pvy = this.vy + this.w * rx;
          const vn = pvx * nx + pvy * ny;
          if (vn < 0) {
            const rxn = rx * ny - ry * nx;
            const j = -(1 + 0.22) * vn / (1 / P.m + rxn * rxn / P.Iz);
            this.vx += j * nx / P.m; this.vy += j * ny / P.m;
            this.w += rxn * j / P.Iz;
            // трение вдоль касательной
            const tx = -ny, ty = nx, vt = pvx * tx + pvy * ty;
            const jt = clamp(-vt / (1 / P.m + (rx * ty - ry * tx) ** 2 / P.Iz), -0.35 * j, 0.35 * j);
            this.vx += jt * tx / P.m; this.vy += jt * ty / P.m;
            this.w += (rx * ty - ry * tx) * jt / P.Iz;
            this.contacts.push({ imp: -vn, kind: o.kind, o });
            if (-vn > 2.5) this.damage = Math.min(1, this.damage + Math.min(0.25, (-vn - 2.5) * 0.012));
          }
        }
      }
    }

    get speed() { return Math.hypot(this.vx, this.vy); }
  }

  // ================================================================
  //  Автопилот: смотрит вперёд по оси, тормозит по огибающей скоростей
  // ================================================================
  function makeLimits(T) {
    const lim = new Float32Array(T.N);
    for (let i = 0; i < T.N; i++) {
      let k = 0;
      for (let j = Math.max(0, i - 4); j <= Math.min(T.N - 1, i + 4); j++) k = Math.max(k, Math.abs(T.K[j]));
      lim[i] = k > 1e-4 ? Math.sqrt(0.93 * G / k) : 60;
    }
    return lim;
  }
  class Autopilot {
    constructor(T, opts = {}) {
      this.T = T; this.lim = T._lim || (T._lim = makeLimits(T));
      this.pace = opts.pace || 1;      // множитель скорости в поворотах
      this.flick = opts.flick || 0;    // любит «заносить»
      this.hbT = 0; this.lastFlick = -1;
    }
    input(car, dt) {
      const T = this.T, au = Math.abs(car.u);
      // курс оси чуть впереди + кривизна (упреждение) + боковая ошибка (Stanley)
      const j = clamp(Math.round(car.s + 3 + au * 0.18), 0, T.N - 1);
      const j2 = clamp(Math.round(car.s + 6 + au * 0.35), 0, T.N - 1);
      const velH = au > 5 ? Math.atan2(car.vy, car.vx) : car.phi;
      const psiErr = wrap(T.PH[j] - velH);
      const targetLat = clamp(T.K[j2] * 140, -1.4, 1.4);          // чуть внутрь поворота
      const eLat = targetLat - car.lat;
      const dDes = psiErr + Math.atan(1.1 * eLat / (au + 3)) + Math.atan(2.5 * T.K[j2]) * 1.15;
      const steerMax = 0.62 / (1 + au / 13);
      let steer = clamp(-dDes / steerMax, -1, 1);
      // огибающая: максимум скорости, при котором успеваем оттормозиться
      let allowed = 60;
      const aBr = 8;
      for (let k = 0; k < 180; k += 2) {
        const i = Math.round(car.s) + k; if (i >= T.N) break;
        const vl = this.lim[i] * this.pace;
        allowed = Math.min(allowed, Math.sqrt(vl * vl + 2 * aBr * k));
      }
      let throttle = au < allowed - 0.5 ? 1 : au < allowed + 1 ? 0.35 : 0;
      let brake = au > allowed + 1.5 ? clamp((au - allowed) / 4, 0.35, 1) : 0;
      // «скандинавский» заброс ручником в медленные повороты
      let hand = 0;
      if (this.flick) {
        const ahead = this.lim[clamp(Math.round(car.s + 12), 0, T.N - 1)];
        if (ahead < 16 && au > 12 && this.hbT <= 0 && car.s - this.lastFlick > 60) { this.hbT = 0.22; this.lastFlick = car.s; }
        if (this.hbT > 0) { hand = 1; this.hbT -= dt; throttle = 0.5; }
      }
      if (car.surface === 'grass') throttle = Math.min(throttle, 0.7);
      return { steer, throttle, brake, hand, assist: 1 };
    }
  }

  // Прогон автопилота: эталонное время по дистанции (график)
  function referenceRun(T, pace) {
    const car = new Car(T), ap = new Autopilot(T, { pace });
    const dt = 1 / 60;
    const times = new Float32Array(Math.ceil(T.N / 10) + 1).fill(-1);
    let t = 0;
    while (t < 400 && car.s < T.finishS) {
      car.step(dt, ap.input(car, dt));
      t += dt;
      const k = Math.floor(car.s / 10);
      if (times[k] < 0) times[k] = t;
    }
    // заполнить пропуски
    let last = 0;
    for (let k = 0; k < times.length; k++) { if (times[k] < 0) times[k] = last; else last = times[k]; }
    return { times, total: t, damage: car.damage };
  }

  // ================================================================
  //  Телеметрия и события — то, что «видит» штурман
  // ================================================================
  const KIND_RU = { tree: 'дерево', rock: 'камень', stump: 'пень' };
  class Telemetry {
    constructor(T, schedule) {
      this.T = T; this.sched = schedule; this.reset();
    }
    reset() {
      this.t = 0; this.events = []; this.log = [];
      this.stats = {
        maxKmh: 0, distM: 0, crashes: 0, bigCrashes: 0, drifts: 0, maxDrift: 0, driftTime: 0,
        jumps: 0, maxAir: 0, maxJumpDist: 0, hardLandings: 0, cuts: 0, offroads: 0, spins: 0, resets: 0,
        overspeeds: 0, clean: 0, splits: [], penalties: 0,
      };
      this.drift = null; this.airStart = null; this.offT = 0; this.cutNote = -1; this.slowT = 0; this.wrongT = 0;
      this.noteIdx = 0; this.cleanRun = 0; this.cleanFlag = true; this.cpIdx = 0; this.lastCrashT = -9;
      this.hitCooldown = 0; this.spun = false; this.window = { drift: 0, maxDrift: 0, hits: 0, off: 0, vsum: 0, n: 0, vmax: 0 };
    }
    // живое отставание от графика, с: >0 — отстаём
    delta(s, t) {
      const k = clamp(Math.floor(s / 10), 0, this.sched.times.length - 1);
      return t + this.stats.penalties - this.sched.times[k];
    }
    // «где это было» по-человечески: ближайший поворот или трамплин стенограммы
    where(s) {
      const notes = this.T.notes;
      let best = null, bd = 1e9;
      for (const n of notes) {
        const d = s < n.s0 ? n.s0 - s : s > n.s1 ? s - n.s1 : 0;
        if (d < bd) { bd = d; best = n; }
      }
      if (!best || bd > 60) return '';
      const name = best.kind === 'corner' ? '«' + best.words.say.replace('осторожно, ', '') + '»' : best.kind === 'jump' ? 'трамплин' : best.kind === 'crest' ? 'гребень' : 'финиш';
      if (bd === 0) return best.kind === 'corner' ? 'в повороте ' + name : 'на ' + (name === 'трамплин' ? 'трамплине' : name === 'гребень' ? 'гребне' : 'финише');
      return (s < best.s0 ? 'перед ' : 'после ') + (best.kind === 'corner' ? 'поворота ' + name : name === 'трамплин' ? 'трамплина' : name === 'гребень' ? 'гребня' : 'финиша');
    }
    emit(type, data) {
      const e = { type, t: this.t, km: this.km, where: this.where((this._s || 0) + this.T.startS), ...data };
      this.events.push(e);
      this.log.push(e);
      return e;
    }
    get km() { return (this._s || 0) / 1000; }
    update(car, dt) {
      const T = this.T, st = this.stats, W = this.window;
      this.t += dt; this._s = car.s - T.startS;
      const kmh = car.speed * 3.6;
      st.maxKmh = Math.max(st.maxKmh, kmh);
      W.vsum += kmh; W.n++; W.vmax = Math.max(W.vmax, kmh);
      this.hitCooldown -= dt;

      // удары: «трение» об одно и то же дерево не считаем новым ударом
      for (const ct of car.contacts) {
        if (ct.imp < 2.2 || this.hitCooldown > 0) continue;
        if (ct.o === this.lastHitObj && this.t - this.lastCrashT < 3 && ct.imp < 6) continue;
        this.hitCooldown = 1.2; this.lastHitObj = ct.o;
        const big = ct.imp > 8;
        st.crashes++; if (big) st.bigCrashes++;
        W.hits++; this.cleanFlag = false; this.lastCrashT = this.t;
        this.emit('crash', { what: KIND_RU[ct.kind] || 'препятствие', kmh: Math.round(Math.max(car.preSpeed || 0, ct.imp) * 3.6), imp: +ct.imp.toFixed(1), big, damage: Math.round(car.damage * 100) });
      }
      // занос
      const b = Math.abs(car.beta) * 180 / Math.PI;
      if (!car.air && car.speed > 9 && b > 16) {
        if (!this.drift) this.drift = { t0: this.t, max: 0, v: kmh };
        this.drift.max = Math.max(this.drift.max, b);
        st.driftTime += dt; W.drift += dt; W.maxDrift = Math.max(W.maxDrift, b);
      } else if (this.drift && (b < 9 || car.speed < 6)) {
        const dur = this.t - this.drift.t0;
        if (dur > 0.9 && this.drift.max > 22) {
          st.drifts++; st.maxDrift = Math.max(st.maxDrift, this.drift.max);
          const hit = this.t - this.lastCrashT < dur + 0.5;
          this.emit('drift', { angle: Math.round(this.drift.max), dur: +dur.toFixed(1), kmh: Math.round(this.drift.v), clean: !hit });
        }
        this.drift = null;
      }
      // разворот
      if (b > 105 && car.speed > 4 && !this.spun) { this.spun = true; st.spins++; this.cleanFlag = false; this.emit('spin', { kmh: Math.round(kmh) }); }
      if (b < 40) this.spun = false;
      // прыжки
      if (car.air && car.airT > 0.05 && !this.airStart) this.airStart = { t: this.t, x: car.x, y: car.y, v: kmh };
      if (!car.air && this.airStart) {
        const air = this.t - this.airStart.t;
        const dist = Math.hypot(car.x - this.airStart.x, car.y - this.airStart.y);
        if (air > 0.3 && dist > 6 && this.airStart.v > 35) {
          st.jumps++; st.maxAir = Math.max(st.maxAir, air); st.maxJumpDist = Math.max(st.maxJumpDist, dist);
          const hard = car.landing > 6.5;
          if (hard) { st.hardLandings++; car.damage = Math.min(1, car.damage + 0.04); }
          this.emit('jump', { air: +air.toFixed(2), dist: Math.round(dist), kmh: Math.round(this.airStart.v), hard, landing: +car.landing.toFixed(1) });
        }
        this.airStart = null;
      }
      // стенограмма: вход в поворот, срез, перелёт
      const notes = T.notes;
      while (this.noteIdx < notes.length && car.s > notes[this.noteIdx].s1 + 4) {
        const n = notes[this.noteIdx];
        if (n.kind === 'corner') {
          if (this.cleanFlag) { this.cleanRun++; if (this.cleanRun === 5 || this.cleanRun === 10 || this.cleanRun === 15) { st.clean++; this.emit('clean', { corners: this.cleanRun }); } }
          else this.cleanRun = 0;
          this.cleanFlag = true;
        }
        this.noteIdx++;
      }
      const cur = notes[this.noteIdx];
      if (cur && cur.kind === 'corner' && car.s >= cur.s0 && car.s <= cur.s1) {
        if (!cur._entered) {
          cur._entered = true;
          if (car.speed > cur.vsafe * 1.32 && car.speed > 14) { st.overspeeds++; this.emit('overspeed', { note: cur.words.say, kmh: Math.round(kmh), safe: Math.round(cur.vsafe * 3.6) }); }
        }
        const inside = Math.sign(car.lat) === cur.dir;
        if (inside && Math.abs(car.lat) > T.HALF_W + 0.9 && this.cutNote !== cur.idx) {
          this.cutNote = cur.idx; st.cuts++; this.cleanFlag = false;
          this.emit('cut', { note: cur.words.say, warned: cur.mods.includes('не резать') });
        }
      }
      // вылет с дороги
      const outside = Math.abs(car.lat) > T.HALF_W + T.SHOULDER + 0.9;
      if (outside) { this.offT += dt; W.off += dt; } else this.offT = 0;
      if (this.offT > 0.7 && !this._offFlag) { this._offFlag = true; st.offroads++; this.cleanFlag = false; this.emit('offroad', { kmh: Math.round(kmh), side: Math.sign(car.lat) === (cur && cur.dir) ? 'внутрь' : 'наружу' }); }
      if (!outside) this._offFlag = false;
      // стоим / едем не туда
      if (kmh < 18 && this.t > 6) this.slowT += dt; else this.slowT = 0;
      if (this.slowT > 5 && !this._slowFlag) { this._slowFlag = true; this.emit('slow', { kmh: Math.round(kmh) }); }
      if (this.slowT === 0) this._slowFlag = false;
      const velDir = Math.atan2(car.vy, car.vx);
      if (car.speed > 5 && Math.cos(velDir - T.PH[car.idx]) < -0.3) this.wrongT += dt; else this.wrongT = 0;
      if (this.wrongT > 2 && !this._wrongFlag) { this._wrongFlag = true; this.emit('wrongway', {}); }
      if (this.wrongT === 0) this._wrongFlag = false;
      // контрольные точки
      if (this.cpIdx < T.cps.length && car.s >= T.cps[this.cpIdx]) {
        const tt = this.t + st.penalties;
        const dl = this.delta(car.s, this.t);
        st.splits.push({ n: this.cpIdx + 1, t: tt, delta: dl });
        this.emit('checkpoint', { n: this.cpIdx + 1, time: +tt.toFixed(2), delta: +dl.toFixed(1) });
        this.cpIdx++;
      }
    }
    // сжатая сводка окна между «тиками» штурмана
    takeWindow() {
      const W = this.window, out = { avg: W.n ? Math.round(W.vsum / W.n) : 0, vmax: Math.round(W.vmax), drift: +W.drift.toFixed(1), maxDrift: Math.round(W.maxDrift), hits: W.hits, off: +W.off.toFixed(1) };
      this.window = { drift: 0, maxDrift: 0, hits: 0, off: 0, vsum: 0, n: 0, vmax: 0 };
      return out;
    }
  }

  R.P = P;
  R.Car = Car;
  R.Autopilot = Autopilot;
  R.referenceRun = referenceRun;
  R.Telemetry = Telemetry;
  R.wrap = wrap;
})(typeof window !== 'undefined' ? window.R : globalThis.R);
