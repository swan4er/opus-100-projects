/* Гравитационный гольф — физика. Подключается обычным <script>; тот же файл использует решатель уровней в node. */
(function (root) {
  'use strict';

  const W = 1600, H = 1000;          // размер мира в условных единицах
  const PROBE_R = 7;                 // радиус зонда
  const SOFT2 = 14 * 14;             // смягчение гравитации (чтобы не было бесконечностей)
  const DT = 1 / 240;                // шаг интегрирования, с
  const MAX_T = 16;                  // дольше — зонд «потерян на орбите»
  const LAUNCH_K = 3.3;              // скорость = длина натяжения × LAUNCH_K
  const MAX_PULL = 210;              // максимальное натяжение

  // Положение тела в момент t после запуска (луны и двойные звёзды движутся по кругу).
  function bodyPos(level, i, t, out) {
    const b = level.bodies[i];
    if (b.orbit) {
      const o = b.orbit;
      let cx, cy;
      if (typeof o.around === 'number') {
        const p = bodyPos(level, o.around, t, [0, 0]);
        cx = p[0]; cy = p[1];
      } else { cx = o.around[0]; cy = o.around[1]; }
      const a = o.phase + o.speed * t;
      out[0] = cx + o.r * Math.cos(a);
      out[1] = cy + o.r * Math.sin(a);
    } else {
      out[0] = b.x; out[1] = b.y;
    }
    return out;
  }

  const tmp = [0, 0];
  // Ускорение в точке (x, y) в момент t.
  function accel(level, t, x, y, out) {
    let ax = 0, ay = 0;
    const bs = level.bodies;
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (!b.gm) continue;
      bodyPos(level, i, t, tmp);
      const dx = tmp[0] - x, dy = tmp[1] - y;
      const d2 = dx * dx + dy * dy + SOFT2;
      const inv = b.gm / (d2 * Math.sqrt(d2));
      ax += dx * inv; ay += dy * inv;
    }
    out[0] = ax; out[1] = ay;
    return out;
  }

  // Столкновения и попадание в цель.
  function check(level, t, x, y) {
    const bs = level.bodies;
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      bodyPos(level, i, t, tmp);
      const dx = tmp[0] - x, dy = tmp[1] - y;
      const rr = b.kind === 'hole' ? b.r * 0.8 : b.r + PROBE_R;
      if (dx * dx + dy * dy < rr * rr) return b.kind === 'hole' ? { res: 'hole', i } : { res: b.kind === 'blackhole' ? 'horizon' : 'crash', i };
    }
    if (x < -260 || x > W + 260 || y < -260 || y > H + 260) return { res: 'lost' };
    return null;
  }

  // Полный полёт. Возвращает исход и (по желанию) траекторию.
  function simulate(level, vx, vy, opts) {
    const o = opts || {};
    const maxT = o.maxT || MAX_T;
    const rec = o.record ? [] : null;
    const recEvery = o.recordEvery || 4;
    let x = level.start[0], y = level.start[1];
    let t = 0;
    const a = [0, 0];
    accel(level, t, x, y, a);
    let n = 0;
    while (t < maxT) {
      // скоростной Верле
      vx += 0.5 * DT * a[0]; vy += 0.5 * DT * a[1];
      x += DT * vx; y += DT * vy;
      t += DT;
      accel(level, t, x, y, a);
      vx += 0.5 * DT * a[0]; vy += 0.5 * DT * a[1];
      if (rec && (n++ % recEvery === 0)) rec.push(x, y, t);
      const hit = check(level, t, x, y);
      if (hit) return { ...hit, t, x, y, vx, vy, path: rec };
    }
    return { res: 'timeout', t, x, y, vx, vy, path: rec };
  }

  function launchVelocity(pullX, pullY) {
    const len = Math.hypot(pullX, pullY);
    const k = len > MAX_PULL ? MAX_PULL / len : 1;
    return [-pullX * k * LAUNCH_K, -pullY * k * LAUNCH_K];
  }

  // Потенциал в точке — для топографических изолиний.
  function potential(level, x, y) {
    let p = 0;
    const bs = level.bodies;
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (!b.gm || b.orbit) continue;
      const dx = b.x - x, dy = b.y - y;
      p -= b.gm / Math.sqrt(dx * dx + dy * dy + SOFT2);
    }
    return p;
  }

  root.GGPhys = { W, H, PROBE_R, DT, MAX_T, LAUNCH_K, MAX_PULL, bodyPos, accel, check, simulate, launchVelocity, potential };
})(typeof window !== 'undefined' ? window : globalThis);
