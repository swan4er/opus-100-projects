'use strict';
/* ==========================================================================
   «Девочка и ветер» · wind.js
   Ветер как персонаж и как поле.
   · Поле ветра W(x, t): сила и направление для травы, дерева, мельницы,
     волос и ткани. Утром фронт приходит слева, в момент поимки ветер
     обрывается (трава пружинит и замирает), при освобождении от банки
     бежит круговая волна.
   · Дух ветра: голова идёт по траектории, за ней тянется поток семян
     одуванчика, листьев, лепестков и орнаментальных завитков.
     Частицы «без состояния»: частица k родилась в момент k/rate в точке
     траектории, её положение в момент t — формула. Поэтому перемотка
     показывает ровно тот же кадр.
   ========================================================================== */

const CATCH_T = 56.0;   // крышка захлопнулась
const OPEN_T = 92.0;    // крышка снята
const BURST_T = 93.0;   // ветер вырвался
const HILL_X = 1150;    // вершина холма, где девочка отпускает ветер

/* ---------- Базовая сила ветра (со знаком: плюс — дует вправо) ---------- */
const W_KEYS = [
  [0, 0.03], [12.6, 0.03], [15.2, 0.62, 'out'], [17, 0.95], [22, 0.85], [26, 1.0], [30, 0.8],
  [33.5, 1.15], [38, 1.0], [42, 0.8], [45, 0.72], [47.2, 0.55], [49.4, -0.35], [51, -0.62],
  [55.95, -0.75], [55.96, 0, 'lin'], [BURST_T, 0],
];
/** «Сырой» ветер: что дует прямо сейчас (без инерции травы). */
function windBaseRaw(t) {
  if (t < BURST_T) return key(W_KEYS, t);
  const u = t - BURST_T;
  return 2.1 * Math.exp(-u * 0.55) * sstep(0, 0.12, u) + 0.85 * sstep(1.5, 6, u);
}

/* Отклик травы: пружина с затуханием, проинтегрированная один раз на старте
   с шагом 1/120 с. В момент поимки трава распрямляется с перехлёстом и стоит. */
const W_DT = 1 / 120;
const W_TABLE = (() => {
  const n = Math.ceil(116 / W_DT) + 2;
  const a = new Float32Array(n);
  const w = TAU * 1.25, z = 0.28;
  let y = 0, v = 0;
  for (let i = 0; i < n; i++) {
    const u = windBaseRaw(i * W_DT);
    const acc = w * w * (u - y) - 2 * z * w * v;
    v += acc * W_DT;
    y += v * W_DT;
    a[i] = y;
  }
  return a;
})();
function windTable(t) {
  const f = clamp(t, 0, 115.9) / W_DT;
  const i = Math.floor(f), r = f - i;
  return W_TABLE[i] * (1 - r) + W_TABLE[i + 1] * r;
}

/** Порывы: медленный шум, бегущий по ветру. */
function gust(x, t, dir) { return 0.74 + 0.36 * fbm(x * 0.0016 - t * 0.5 * dir + 7, 2); }

/**
 * Поле ветра в точке x главного плана.
 * Утренний фронт: приходит слева со скоростью 430 ед/с.
 * Освобождение: круговая волна от вершины холма, 1100 ед/с.
 */
function windAt(x, t) {
  if (t < 17.5) {
    const arrive = 12.6 + (x + 500) / 430;
    const te = t - Math.max(0, arrive - 12.6);
    const w = windTable(te);
    return w * gust(x, t, 1);
  }
  if (t < BURST_T) {
    const w = windTable(t);
    return w * gust(x, t, Math.sign(w) || 1);
  }
  const d = Math.abs(x - HILL_X);
  const te = t - d / 1100;
  const base = te < BURST_T ? 0 : windBaseRaw(te);
  const dir = lerp(Math.sign(x - HILL_X) || 1, 1, sstep(BURST_T + 3, BURST_T + 8, t));
  return dir * base * gust(x, t, dir);
}

/** Ветер на кадр: значения на сетке 24 ед., между узлами — линейно. Для тысяч травинок. */
function windSampler(t) {
  const cache = new Map();
  const at = (i) => { let v = cache.get(i); if (v === undefined) { v = windAt(i * 24, t); cache.set(i, v); } return v; };
  return (x, tt) => {
    if (tt !== t) return windAt(x, tt);
    const f = x / 24, i = Math.floor(f), r = f - i;
    return at(i) * (1 - r) + at(i + 1) * r;
  };
}

/** «Жизнь» мира: трепет листьев и травы. Утром едва дышит, в плену ветра — мёртвая тишина. */
function lifeAt(t) {
  if (t < CATCH_T) return 0.45 + 0.55 * sstep(12.6, 16, t);
  if (t < BURST_T) return 1 - sstep(CATCH_T, CATCH_T + 2.2, t);
  return sstep(BURST_T, BURST_T + 0.8, t);
}

/* ---------- Мельница: инерция крыльев ---------- */
const MILL = (() => {
  const n = Math.ceil(116 / W_DT) + 2;
  const ang = new Float32Array(n);
  let w = 0, a = 0.35;
  for (let i = 0; i < n; i++) {
    const t = i * W_DT;
    const s = Math.abs(t < BURST_T ? windTable(t) : windBaseRaw(t - 0.8));
    const target = Math.max(0, s - 0.12) * 1.25;
    const tau = target > w ? 1.6 : 3.2; // разгон быстрее, чем выбег
    w += (target - w) * (W_DT / tau);
    if (t > 60 && t < BURST_T) w = Math.max(0, w - 0.02 * W_DT); // трение досуха
    a += w * W_DT;
    ang[i] = a;
  }
  return ang;
})();
function millAngle(t) {
  const f = clamp(t, 0, 115.9) / W_DT;
  const i = Math.floor(f), r = f - i;
  return MILL[i] * (1 - r) + MILL[i + 1] * r;
}

/* ---------- Траектории ---------- */
/** Катмулл — Ром по точкам [t, x, y]: гладкая траектория во времени. */
function pathCR(pts) {
  const n = pts.length;
  return (t) => {
    if (t <= pts[0][0]) return [pts[0][1], pts[0][2]];
    if (t >= pts[n - 1][0]) return [pts[n - 1][1], pts[n - 1][2]];
    let i = 1;
    while (pts[i][0] < t) i++;
    const p0 = pts[Math.max(0, i - 2)], p1 = pts[i - 1], p2 = pts[i], p3 = pts[Math.min(n - 1, i + 1)];
    const u = (t - p1[0]) / (p2[0] - p1[0]);
    // касательные с учётом неравных интервалов
    const d1 = p2[0] - p1[0];
    const m1 = (k) => ((p2[k] - p0[k]) / Math.max(1e-3, p2[0] - p0[0])) * d1;
    const m2 = (k) => ((p3[k] - p1[k]) / Math.max(1e-3, p3[0] - p1[0])) * d1;
    const h = (k) => {
      const u2 = u * u, u3 = u2 * u;
      return (2 * u3 - 3 * u2 + 1) * p1[k] + (u3 - 2 * u2 + u) * m1(k) + (-2 * u3 + 3 * u2) * p2[k] + (u3 - u2) * m2(k);
    };
    return [h(1), h(2)];
  };
}

/* ---------- Частицы духа ---------- */
const SP_RATE = 30;   // частиц в секунду
const SP_LIFE = 1.9;  // жизнь частицы, с

/**
 * Состояние частицы k в момент t: позиция, угол, тип, масштаб. null — частицы нет.
 * spirit(e) → {x, y, a}: голова духа в момент рождения e, a — плотность потока.
 */
function particleAt(k, t, spirit) {
  const e = k / SP_RATE;
  let age = t - e;
  if (age < 0) return null;
  const h = hash(k * 7 + 3);
  // замершие: живые в момент поимки висят в воздухе до освобождения
  let frozen = false;
  if (e < CATCH_T && t >= CATCH_T) {
    const ageC = CATCH_T - e;
    if (ageC > SP_LIFE * (0.6 + 0.4 * h)) return null;
    if (e > CATCH_T - 0.35) return null; // голова потока ушла в банку
    frozen = true;
    age = ageC;
  } else if (age > SP_LIFE * (0.6 + 0.4 * h)) return null;
  const S = spirit(e);
  if (!S || S.a <= 0 || hash(k * 13 + 1) > S.a) return null;
  let S2 = spirit(e - 0.05), sgn = 1;
  if (!S2) { S2 = spirit(e + 0.05); sgn = -1; }
  if (!S2) S2 = S;
  const vx = ((S[0] - S2[0]) / 0.05) * sgn, vy = ((S[1] - S2[1]) / 0.05) * sgn;
  const sp = Math.hypot(vx, vy) || 1;
  const tx = vx / sp, ty = vy / sp, nx = -ty, ny = tx;
  const h2 = hash(k * 31 + 5), h3 = hash(k * 57 + 9);
  const type = h2 < 0.56 ? 0 : h2 < 0.82 ? 1 : 2; // семя, лист, лепесток
  const drag = 1.9;
  const carry = (1 - Math.exp(-drag * age)) / drag;
  const kv = 0.5 + 0.25 * h3;
  // спираль вокруг траектории: проекция винта
  const r = (10 + 30 * age) * (0.45 + h);
  const ph = h3 * TAU + (3.5 + 3 * h) * age * (h > 0.5 ? 1 : -1);
  const depth = Math.cos(ph);
  const fall = type === 1 ? 18 : type === 2 ? 10 : -4;
  let x = S[0] + vx * kv * carry + nx * r * Math.sin(ph) + (h - 0.5) * 30 * age;
  let y = S[1] + vy * kv * carry + ny * r * Math.sin(ph) + fall * age * age + (h3 - 0.5) * 24 * age;
  let ang = Math.atan2(vy, vx) + ph * 0.5 + h * TAU;
  if (frozen) {
    // медленно оседают, не шевелясь
    const tt = Math.min(t, BURST_T) - CATCH_T;
    y += tt * (1.2 + 2.4 * h);
    ang += 0;
    if (t > BURST_T) {
      const d = Math.hypot(x - HILL_X, y - 700);
      const te = t - BURST_T - d / 1100;
      if (te > 0) {
        const push = 1400 * (1 - Math.exp(-te * 1.3));
        const aa = Math.atan2(y - 700, x - HILL_X) - 0.9;
        x += Math.cos(aa) * push * 0.6 + push * 0.2;
        y += Math.sin(aa) * push * 0.4 - push * 0.55;
        ang += te * 6;
      }
    }
  }
  if (!frozen && t < CATCH_T && t > CATCH_T - 0.45 && e > CATCH_T - 1) {
    const J = spirit(t);
    if (J) {
      const pull = sstep(CATCH_T - 0.45, CATCH_T, t) * sstep(CATCH_T - 1, CATCH_T - 0.35, e);
      x = lerp(x, J[0], pull);
      y = lerp(y, J[1], pull);
    }
  }
  if (frozen && t > BURST_T + 5) return null;
  const sc = (0.85 + 0.35 * h3) * (1 + 0.22 * depth);
  return { x, y, ang, type, sc, depth, frozen };
}

/** Отрисовка одной частицы в путь (семя-парашютик, лист с жилкой, лепесток). */
function particleShape(ctx, p, S) {
  const s = p.sc * S;
  const c = Math.cos(p.ang), sn = Math.sin(p.ang);
  if (p.type === 0) {
    // семя одуванчика: стебелёк и зонтик из волосков
    const bx = p.x - sn * 5 * s, by = p.y + c * 5 * s;
    lens(ctx, bx, by, p.x, p.y, 0.45 * s);
    for (let i = -3; i <= 3; i++) {
      const a = p.ang - PI / 2 + i * 0.36;
      lens(ctx, p.x, p.y, p.x + Math.cos(a) * 6.5 * s, p.y + Math.sin(a) * 6.5 * s, 0.3 * s);
    }
    circle(ctx, bx, by, 0.9 * s);
  } else if (p.type === 1) {
    const L = 11 * s;
    const ex = p.x + c * L, ey = p.y + sn * L;
    lens(ctx, p.x, p.y, ex, ey, 3.2 * s);
    lens(ctx, p.x + c * L * 0.25, p.y + sn * L * 0.25, p.x + c * L * 0.8, p.y + sn * L * 0.8, 0.55 * s, true);
  } else {
    const L = 7 * s;
    lens(ctx, p.x, p.y, p.x + c * L, p.y + sn * L, 2.6 * s);
  }
}

/** Все частицы духа, видимые в момент t: живой поток, замершие семена, новый поток. */
function drawSpiritParticles(ctx, t, spirit, S) {
  const ranges = [];
  if (t < CATCH_T) ranges.push([Math.ceil((t - SP_LIFE) * SP_RATE), Math.floor(t * SP_RATE)]);
  else if (t < BURST_T + 6) ranges.push([Math.ceil((CATCH_T - SP_LIFE) * SP_RATE), Math.floor(CATCH_T * SP_RATE)]);
  if (t >= BURST_T) ranges.push([Math.max(Math.ceil(BURST_T * SP_RATE), Math.ceil((t - SP_LIFE) * SP_RATE)), Math.floor(t * SP_RATE)]);
  ctx.beginPath();
  for (const [a, b] of ranges) {
    for (let k = Math.max(0, a); k <= b; k++) {
      const p = particleAt(k, t, spirit);
      if (p) particleShape(ctx, p, S);
    }
  }
  ctx.fill();
}

/**
 * Завитки ветра — орнаментальные спирали, как ветер на старинных картах.
 * Тянутся за головой духа по недавней траектории.
 */
function drawSpiritCurls(ctx, t, spirit, S, amt) {
  if (amt <= 0.02) return;
  ctx.beginPath();
  for (let j = 0; j < 4; j++) {
    const lag = j * 0.11;
    const pts = [];
    const N = 14;
    for (let i = 0; i < N; i++) {
      const tt = t - lag - i * 0.035;
      const P = spirit(tt);
      if (!P || P.a <= 0) break;
      const P2 = spirit(tt - 0.04);
      if (!P2) break;
      const vx = P[0] - P2[0], vy = P[1] - P2[1];
      const d = Math.hypot(vx, vy) || 1;
      const off = Math.sin(tt * 7 + j * 1.9) * (14 + j * 6) * S;
      pts.push([P[0] - (vy / d) * off, P[1] + (vx / d) * off]);
    }
    if (pts.length < 5) continue;
    // кончик завитка у головы закручивается
    const a0 = Math.atan2(pts[0][1] - pts[1][1], pts[0][0] - pts[1][0]);
    const cp = curlPts(pts[0][0], pts[0][1], a0, 34 * S * (0.7 + 0.3 * amt), 1.05, j % 2 ? 1 : -1, 10);
    const all = cp.slice(1).reverse().concat(pts);
    const n = all.length;
    const ws = new Array(n);
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      ws[i] = (0.5 + 2.4 * Math.sin(Math.min(1, u * 1.25) * PI) ** 0.8) * S * amt;
    }
    ribbon(ctx, all, ws);
  }
  ctx.fill();
}

/** Свечение ветра: свет «за бумагой», рисуется в небесном проходе. */
function drawSpiritGlow(ctx, x, y, r, col, a) {
  if (a <= 0.01) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(col, 0.5 * a));
  g.addColorStop(0.35, rgba(col, 0.2 * a));
  g.addColorStop(1, rgba(col, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}
