/* Фрактальный полёт — ядро.
   Функции расстояния (точное зеркало шейдера), описание миров и автопилот.
   Файл подключается обычным <script>, поэтому работает и по file://, и в node для тестов. */
(function (root) {
  'use strict';

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const fmod = (a, m) => a - m * Math.floor(a / m);

  // ---------- векторы ----------
  const V = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    len: (a) => Math.hypot(a[0], a[1], a[2]),
    norm: (a) => {
      const l = Math.hypot(a[0], a[1], a[2]) || 1;
      return [a[0] / l, a[1] / l, a[2] / l];
    },
  };

  // ---------- функции расстояния ----------
  // Мандельбокс: складка коробки, складка сферы, масштаб.
  function deBox(x, y, z, s, it) {
    let zx = x, zy = y, zz = z, dr = 1;
    for (let i = 0; i < it; i++) {
      zx = clamp(zx, -1, 1) * 2 - zx;
      zy = clamp(zy, -1, 1) * 2 - zy;
      zz = clamp(zz, -1, 1) * 2 - zz;
      const r2 = zx * zx + zy * zy + zz * zz;
      if (r2 < 0.25) { zx *= 4; zy *= 4; zz *= 4; dr *= 4; }
      else if (r2 < 1) { const t = 1 / r2; zx *= t; zy *= t; zz *= t; dr *= t; }
      zx = s * zx + x; zy = s * zy + y; zz = s * zz + z;
      dr = dr * Math.abs(s) + 1;
    }
    return Math.hypot(zx, zy, zz) / Math.abs(dr);
  }

  // Мандельбульб степени power; ось симметрии направлена вверх (p.xzy).
  function deBulb(px, py, pz, power, it) {
    let x = px, y = pz, z = py;
    const cx = x, cy = y, cz = z;
    let dr = 1, r = 0;
    for (let i = 0; i < it; i++) {
      r = Math.hypot(x, y, z);
      if (r > 2) break;
      let th = Math.acos(clamp(z / (r || 1e-9), -1, 1));
      let ph = Math.atan2(y, x);
      dr = Math.pow(r, power - 1) * power * dr + 1;
      const zr = Math.pow(r, power);
      th *= power; ph *= power;
      x = zr * Math.sin(th) * Math.cos(ph) + cx;
      y = zr * Math.sin(ph) * Math.sin(th) + cy;
      z = zr * Math.cos(th) + cz;
    }
    return 0.5 * Math.log(Math.max(r, 1e-9)) * r / dr;
  }

  function sdBox(x, y, z, b) {
    const dx = Math.abs(x) - b, dy = Math.abs(y) - b, dz = Math.abs(z) - b;
    return Math.hypot(Math.max(dx, 0), Math.max(dy, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, Math.max(dy, dz)), 0);
  }

  // Бесконечная решётка губок Менгера: период 2, w — толщина стен.
  function deMenger(x, y, z, w, it) {
    const qx = fmod(x + 1, 2) - 1, qy = fmod(y + 1, 2) - 1, qz = fmod(z + 1, 2) - 1;
    let d = sdBox(qx, qy, qz, 1), s = 1;
    for (let m = 0; m < it; m++) {
      const ax = fmod(qx * s, 2) - 1, ay = fmod(qy * s, 2) - 1, az = fmod(qz * s, 2) - 1;
      s *= 3;
      const rx = Math.abs(1 - 3 * Math.abs(ax)), ry = Math.abs(1 - 3 * Math.abs(ay)), rz = Math.abs(1 - 3 * Math.abs(az));
      const c = (Math.min(Math.max(rx, ry), Math.max(ry, rz), Math.max(rz, rx)) - w) / s;
      if (c > d) d = c;
    }
    return d;
  }

  // Псевдоклейновская группа (по мотивам Knighty): складка коробки + инверсия в сфере.
  function deKlein(x, y, z, c, it) {
    const k0 = c / 0.92;
    const cx = 0.92436 * k0, cy = 0.90756 * k0, cz = 0.92436 * k0;
    let px = x, py = y, pz = z, f = 1;
    for (let i = 0; i < it; i++) {
      px = 2 * clamp(px, -cx, cx) - px;
      py = 2 * clamp(py, -cy, cy) - py;
      pz = 2 * clamp(pz, -cz, cz) - pz;
      const r2 = px * px + py * py + pz * pz;
      const k = Math.max(1 / Math.max(r2, 1e-12), 1);
      px *= k; py *= k; pz *= k; f *= k;
    }
    const rxy = Math.hypot(px, py);
    return Math.max(rxy - 0.92784, Math.abs(rxy * pz) / (Math.hypot(px, py, pz) || 1e-9)) / f;
  }

  // ---------- миры ----------
  // band — коридор расстояний до поверхности, который держит автопилот;
  // palette — четыре цвета камня, trapK — как орбитальная ловушка раскладывается по палитре.
  const WORLDS = [
    {
      id: 'klein', kind: 3, roman: 'I', name: 'Псевдоклейн',
      line: 'Собор, построенный инверсией в сфере.',
      param: { label: 'Размер ячейки', min: 0.86, max: 0.98, step: 0.001, def: 0.92 },
      iter: { label: 'Итерации', min: 6, max: 14, def: 10 },
      sub: (p, it) => `ячейка ${fmt(p, 3)} · ${it} ${plural(it, 'итерация', 'итерации', 'итераций')}`,
      spawn: [0.2, 0.3, 0.4], dir: [0.3, -0.2, -1.0],
      band: [0.05, 0.2], speedK: 0.6, vMin: 0.012, vMax: 0.18, turn: 1.6, lookK: 3.0, wander: 0.08,
      scaleRef: 0.35, fog: 17.0,
      sun: [0.45, 0.42, -0.64],
      haze: [0.84, 0.72, 0.58],
      palette: [[0.90, 0.82, 0.70], [0.83, 0.61, 0.53], [0.63, 0.71, 0.62], [0.64, 0.72, 0.84]],
      trapK: [0.8, 1.2, 1.2],
    },
    {
      id: 'menger', kind: 2, roman: 'II', name: 'Губка Менгера',
      line: 'Куб без середины. И у каждой части — тоже.',
      param: { label: 'Толщина стен', min: 0.86, max: 1.12, step: 0.005, def: 1.0 },
      iter: { label: 'Уровни', min: 3, max: 6, def: 5 },
      sub: (p, it) => `толщина стен ${fmt(p, 2)} · ${it} ${plural(it, 'уровень', 'уровня', 'уровней')}`,
      spawn: [0.0, 0.0, 0.0], dir: [0.05, 0.0, -1.0],
      band: [0.12, 0.33], speedK: 0.7, vMin: 0.03, vMax: 0.3, turn: 1.8, lookK: 2.6, wander: 0.07,
      scaleRef: 0.5, fog: 16.0,
      sun: [0.36, 0.78, 0.5],
      haze: [0.84, 0.72, 0.58],
      palette: [[0.88, 0.81, 0.70], [0.82, 0.58, 0.49], [0.66, 0.73, 0.62], [0.62, 0.71, 0.82]],
      trapK: [0.5, 1.0, 1.0],
    },
    {
      id: 'bulb', kind: 1, roman: 'III', name: 'Мандельбульб',
      line: 'Трёхмерная тень множества Мандельброта.',
      param: { label: 'Степень', min: 3, max: 12, step: 0.1, def: 8 },
      iter: { label: 'Итерации', min: 4, max: 14, def: 9 },
      sub: (p, it) => `степень ${fmt(p, 1)} · ${it} ${plural(it, 'итерация', 'итерации', 'итераций')}`,
      spawn: [0.0, 0.5, 2.1], dir: [0.0, -0.25, -1.0],
      band: [0.08, 0.26], speedK: 0.6, vMin: 0.01, vMax: 0.16, turn: 1.5, lookK: 3.0, wander: 0.08, lookAtSurface: 0.35, exposure: 1.7,
      scaleRef: 0.35, fog: 15.0,
      sun: [-0.45, 0.5, -0.64],
      haze: [0.84, 0.72, 0.58],
      palette: [[0.87, 0.79, 0.68], [0.86, 0.62, 0.55], [0.62, 0.72, 0.64], [0.72, 0.69, 0.84]],
      trapK: [0.9, 1.6, 1.6],
    },
    {
      id: 'box', kind: 0, roman: 'IV', name: 'Мандельбокс',
      line: 'Складка коробки, складка сферы — и так двенадцать раз.',
      param: { label: 'Масштаб', min: -2.0, max: -1.4, step: 0.01, def: -1.5 },
      iter: { label: 'Итерации', min: 6, max: 18, def: 12 },
      sub: (p, it) => `масштаб ${fmt(p, 2)} · ${it} ${plural(it, 'итерация', 'итерации', 'итераций')}`,
      spawn: [3.4, 2.5, 3.4], dir: [-1.0, -0.72, -1.0],
      band: [0.55, 1.25], speedK: 0.35, vMin: 0.06, vMax: 0.4, turn: 1.0, lookK: 2.0, wander: 0.05, lookAtSurface: 0.75,
      scaleRef: 1.6, fog: 12.0,
      sun: [0.55, 0.42, -0.72],
      haze: [0.84, 0.72, 0.58],
      palette: [[0.86, 0.80, 0.71], [0.84, 0.60, 0.52], [0.60, 0.69, 0.60], [0.63, 0.72, 0.83]],
      trapK: [0.28, 0.9, 1.2],
    },
  ];

  function fmt(v, digits) {
    const s = Math.abs(v).toFixed(digits).replace('.', ',');
    return (v < 0 ? '−' : '') + s;
  }
  function plural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  function makeDE(worldIndex, param, iter) {
    switch (WORLDS[worldIndex].kind) {
      case 0: return (x, y, z) => deBox(x, y, z, param, iter);
      case 1: return (x, y, z) => deBulb(x, y, z, param, iter);
      case 2: return (x, y, z) => deMenger(x, y, z, param, iter);
      default: return (x, y, z) => deKlein(x, y, z, param, iter);
    }
  }

  // ---------- плавный одномерный шум для «блуждания» ----------
  function hash1(n) {
    const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  }
  function vnoise(t) {
    const i = Math.floor(t), f = t - i;
    const u = f * f * (3 - 2 * f);
    return (hash1(i) * (1 - u) + hash1(i + 1) * u) * 2 - 1;
  }

  // ---------- автопилот ----------
  // Держит камеру в коридоре расстояний band, объезжает стены по градиенту поля расстояний
  // и медленно «блуждает» по шуму — получается бесконечный кинематографичный пролёт.
  class Autopilot {
    constructor(de, cfg, pos, dir, seed) {
      this.de = de;
      this.cfg = cfg;
      this.pos = pos.slice();
      this.dir = V.norm(dir.slice());
      this.look = this.dir.slice();
      this.t = seed || 0;
      this.roll = 0;
    }
    d(p) { return this.de(p[0], p[1], p[2]); }
    grad(p, h) {
      const de = this.de;
      return V.norm([
        de(p[0] + h, p[1], p[2]) - de(p[0] - h, p[1], p[2]),
        de(p[0], p[1] + h, p[2]) - de(p[0], p[1] - h, p[2]),
        de(p[0], p[1], p[2] + h) - de(p[0], p[1], p[2] - h),
      ]);
    }
    step(dt, speedMul) {
      const c = this.cfg;
      const p = this.pos;
      this.t += dt;
      const d = this.d(p);
      const [lo, hi] = c.band;
      const g = this.grad(p, Math.max(d * 0.2, 1e-6));

      const look = clamp(d * c.lookK, lo, hi * 4);
      const a = V.add(p, V.mul(this.dir, look));
      const da = this.d(a);
      let s = [0, 0, 0];

      // стена впереди — отворачиваем по градиенту в точке упреждения
      const want = Math.min(look * 0.8, (lo + hi) * 0.75);
      if (da < want) {
        const ga = this.grad(a, Math.max(da * 0.2, 1e-6));
        s = V.add(s, V.mul(ga, 3.2 * (1 - da / want)));
      }
      // коридор расстояний
      if (d < lo) s = V.add(s, V.mul(g, 2.2 * (lo - d) / lo));
      else if (d > hi) s = V.add(s, V.mul(g, -Math.min(3.0, 0.6 + 2.0 * (d - hi) / hi)));

      // блуждание и тяга к горизонту
      let R = V.cross(this.dir, [0, 1, 0]);
      if (V.len(R) < 1e-3) R = [1, 0, 0];
      R = V.norm(R);
      const U = V.cross(R, this.dir);
      const wx = vnoise(this.t * c.wander + 3.1) * 0.9;
      const wy = vnoise(this.t * c.wander + 17.7) * 0.45 - this.dir[1] * 0.7;
      s = V.add(s, V.add(V.mul(R, wx), V.mul(U, wy)));
      s = V.sub(s, V.mul(this.dir, V.dot(s, this.dir)));
      this.dir = V.norm(V.add(this.dir, V.mul(s, dt * c.turn)));

      const v = clamp(d * c.speedK, c.vMin, c.vMax) * (speedMul || 1);
      const np = V.add(p, V.mul(this.dir, v * dt));
      const nd = this.d(np);
      if (nd > d * 0.3 && nd > lo * 0.05) this.pos = np;
      else this.dir = V.norm(V.add(this.dir, V.mul(g, 1.2)));

      // плавный взгляд и лёгкий крен на поворотах; у «внешних» миров взгляд частично повёрнут к поверхности
      const k = 1 - Math.exp(-dt * 2.2);
      const prev = this.look;
      let aim = this.dir;
      if (c.lookAtSurface) aim = V.norm(V.sub(V.mul(this.dir, 1 - c.lookAtSurface), V.mul(g, c.lookAtSurface)));
      this.look = V.norm(V.add(this.look, V.mul(V.sub(aim, this.look), k)));
      const turn = V.dot(V.cross(prev, this.look), [0, 1, 0]) / Math.max(dt, 1e-3);
      this.roll += (clamp(-turn * 0.9, -0.3, 0.3) - this.roll) * (1 - Math.exp(-dt * 1.5));
      return d;
    }
  }

  root.FFCore = { V, WORLDS, makeDE, Autopilot, clamp, fmt, plural, vnoise };
})(typeof window !== 'undefined' ? window : globalThis);
