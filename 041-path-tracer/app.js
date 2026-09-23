/* Трассировщик путей.
   Ядро (tracerCore) общее: его исполняют Web Worker'ы, созданные из Blob, и главный поток — для выбора объектов кликом.
   Каждый поток рендерит свои строки (строка y принадлежит потоку y mod N) и шлёт суммы яркости в главный поток,
   который усредняет, делает тональную компрессию ACES и рисует кадр. */
'use strict';

// =====================================================================================
// Ядро трассировки. Функция самодостаточна: её исходник целиком уходит в воркеры.
// =====================================================================================
function tracerCore() {
  'use strict';
  const PI = Math.PI, INV_PI = 1 / Math.PI, TWO_PI = 2 * Math.PI;
  const PLASTIC_SPEC = 0.35;   // вероятность выбрать бликовый слой у пластика
  const MAX_DEPTH = 12;

  // Сцена
  let prims = new Float32Array(0);   // 24 числа на примитив: тип, материал, геометрия
  let nodes = new Float32Array(0);   // 8 чисел на узел BVH: min xyz, max xyz, first/right, count
  let spheres = new Float32Array(0); // 8 чисел на сферу: центр, радиус, материал, объект
  let mats = new Float32Array(0);    // 16 чисел на материал
  let lights = new Float32Array(0);  // 4 числа на источник: вид (0 — сфера, 1 — прямоугольник), индекс, вероятность, cdf
  let primLightProb = new Float32Array(0);
  let sphLightProb = new Float32Array(0);
  let nSph = 0, nLights = 0;
  let env = new Float32Array(9);
  let eps = 1e-4;
  let clampLum = 24;

  const stack = new Int32Array(128);
  let seed = ((Math.random() * 4294967296) >>> 0) || 1;
  function rnd() {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  }

  function load(s) {
    prims = s.prims; nodes = s.nodes; mats = s.mats; env = s.env; eps = s.eps; clampLum = s.clamp || 24;
    setSpheres(s.spheres);
  }
  function setSpheres(sp) {
    spheres = sp;
    nSph = spheres.length / 8;
    rebuildLights();
  }
  function setMats(m) {
    mats = m;
    rebuildLights();
  }
  // Источники света — все излучающие примитивы и сферы; вероятность выбора пропорциональна мощности
  function rebuildLights() {
    const list = [];
    const nPrim = prims.length / 24;
    primLightProb = new Float32Array(nPrim);
    sphLightProb = new Float32Array(nSph);
    for (let i = 0; i < nPrim; i++) {
      const m = prims[i * 24 + 1] * 16;
      if (mats[m] === 4 && prims[i * 24] === 1) {
        const power = (mats[m + 1] + mats[m + 2] + mats[m + 3]) * mats[m + 6] * prims[i * 24 + 14];
        list.push([1, i, power]);
      }
    }
    for (let i = 0; i < nSph; i++) {
      const m = spheres[i * 8 + 4] * 16;
      if (mats[m] === 4) {
        const r = spheres[i * 8 + 3];
        const power = (mats[m + 1] + mats[m + 2] + mats[m + 3]) * mats[m + 6] * 4 * PI * r * r;
        list.push([0, i, power]);
      }
    }
    // выравниваем: у крошечных ярких сфер не должно быть нулевой вероятности
    let total = 0;
    for (const l of list) { l[2] = Math.sqrt(l[2]); total += l[2]; }
    lights = new Float32Array(list.length * 4);
    let cdf = 0;
    list.forEach((l, k) => {
      const p = l[2] / total;
      cdf += p;
      lights.set([l[0], l[1], p, cdf], k * 4);
      if (l[0] === 1) primLightProb[l[1]] = p; else sphLightProb[l[1]] = p;
    });
    if (list.length) lights[list.length * 4 - 1] = 1;
    nLights = list.length;
  }

  // ---------- Пересечения ----------
  let hT = 0, hKind = -1, hIdx = -1, hU = 0, hV = 0;

  function primHit(i, ox, oy, oz, dx, dy, dz) {
    const p = i * 24;
    if (prims[p] === 1) {
      // прямоугольник P + a·U + b·V
      const nx = prims[p + 11], ny = prims[p + 12], nz = prims[p + 13];
      const den = nx * dx + ny * dy + nz * dz;
      if (den > -1e-9 && den < 1e-9) return;
      const px = prims[p + 2], py = prims[p + 3], pz = prims[p + 4];
      const t = ((px - ox) * nx + (py - oy) * ny + (pz - oz) * nz) / den;
      if (t <= eps || t >= hT) return;
      const qx = ox + dx * t - px, qy = oy + dy * t - py, qz = oz + dz * t - pz;
      const a = (qx * prims[p + 5] + qy * prims[p + 6] + qz * prims[p + 7]) * prims[p + 15];
      if (a < 0 || a > 1) return;
      const b = (qx * prims[p + 8] + qy * prims[p + 9] + qz * prims[p + 10]) * prims[p + 16];
      if (b < 0 || b > 1) return;
      hT = t; hKind = 1; hIdx = i; hU = a; hV = b;
    } else {
      // треугольник, Мёллер — Трумбор
      const e1x = prims[p + 5], e1y = prims[p + 6], e1z = prims[p + 7];
      const e2x = prims[p + 8], e2y = prims[p + 9], e2z = prims[p + 10];
      const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
      const det = e1x * px + e1y * py + e1z * pz;
      if (det > -1e-12 && det < 1e-12) return;
      const inv = 1 / det;
      const tx = ox - prims[p + 2], ty = oy - prims[p + 3], tz = oz - prims[p + 4];
      const u = (tx * px + ty * py + tz * pz) * inv;
      if (u < 0 || u > 1) return;
      const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
      const v = (dx * qx + dy * qy + dz * qz) * inv;
      if (v < 0 || u + v > 1) return;
      const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
      if (t > eps && t < hT) { hT = t; hKind = 1; hIdx = i; hU = u; hV = v; }
    }
  }

  // Вход луча в коробку узла или Infinity; узлы обходятся «ближний первым»
  function slab(o, ox, oy, oz, ix, iy, iz, tBest) {
    let t0 = (nodes[o] - ox) * ix, t1 = (nodes[o + 3] - ox) * ix;
    let tmin = t0 < t1 ? t0 : t1, tmax = t0 < t1 ? t1 : t0;
    t0 = (nodes[o + 1] - oy) * iy; t1 = (nodes[o + 4] - oy) * iy;
    if (t0 > t1) { const tt = t0; t0 = t1; t1 = tt; }
    if (t0 > tmin) tmin = t0;
    if (t1 < tmax) tmax = t1;
    t0 = (nodes[o + 2] - oz) * iz; t1 = (nodes[o + 5] - oz) * iz;
    if (t0 > t1) { const tt = t0; t0 = t1; t1 = tt; }
    if (t0 > tmin) tmin = t0;
    if (t1 < tmax) tmax = t1;
    if (tmax < tmin || tmax < 0 || tmin > tBest) return Infinity;
    return tmin;
  }
  const dstack = new Float64Array(128);

  function traverse(ox, oy, oz, dx, dy, dz, anyHit) {
    const ix = 1 / (dx === 0 ? 1e-20 : dx), iy = 1 / (dy === 0 ? 1e-20 : dy), iz = 1 / (dz === 0 ? 1e-20 : dz);
    const t0 = slab(0, ox, oy, oz, ix, iy, iz, hT);
    if (t0 === Infinity) return;
    let sp = 0;
    stack[sp] = 0; dstack[sp++] = t0;
    while (sp > 0) {
      sp--;
      if (dstack[sp] > hT) continue;
      const ni = stack[sp], o = ni * 8, cnt = nodes[o + 7];
      if (cnt > 0) {
        const first = nodes[o + 6];
        for (let i = first, e = first + cnt; i < e; i++) {
          primHit(i, ox, oy, oz, dx, dy, dz);
          if (anyHit && hKind >= 0) return;
        }
      } else {
        const Ln = ni + 1, Rn = nodes[o + 6];
        const tL = slab(Ln * 8, ox, oy, oz, ix, iy, iz, hT);
        const tR = slab(Rn * 8, ox, oy, oz, ix, iy, iz, hT);
        if (tL <= tR) {
          if (tR !== Infinity) { stack[sp] = Rn; dstack[sp++] = tR; }
          if (tL !== Infinity) { stack[sp] = Ln; dstack[sp++] = tL; }
        } else {
          if (tL !== Infinity) { stack[sp] = Ln; dstack[sp++] = tL; }
          if (tR !== Infinity) { stack[sp] = Rn; dstack[sp++] = tR; }
        }
      }
    }
  }

  function intersect(ox, oy, oz, dx, dy, dz, tMax) {
    hT = tMax; hKind = -1;
    for (let i = 0; i < nSph; i++) {
      const s = i * 8;
      const cx = spheres[s] - ox, cy = spheres[s + 1] - oy, cz = spheres[s + 2] - oz, r = spheres[s + 3];
      const b = cx * dx + cy * dy + cz * dz;
      let disc = b * b - (cx * cx + cy * cy + cz * cz - r * r);
      if (disc < 0) continue;
      disc = Math.sqrt(disc);
      let t = b - disc;
      if (t <= eps) t = b + disc;
      if (t > eps && t < hT) { hT = t; hKind = 0; hIdx = i; }
    }
    if (nodes.length) traverse(ox, oy, oz, dx, dy, dz, false);
    return hKind >= 0;
  }

  // Теневой луч: есть ли препятствие ближе tMax
  function occluded(ox, oy, oz, dx, dy, dz, tMax) {
    for (let i = 0; i < nSph; i++) {
      const s = i * 8;
      const cx = spheres[s] - ox, cy = spheres[s + 1] - oy, cz = spheres[s + 2] - oz, r = spheres[s + 3];
      const b = cx * dx + cy * dy + cz * dz;
      let disc = b * b - (cx * cx + cy * cy + cz * cz - r * r);
      if (disc < 0) continue;
      disc = Math.sqrt(disc);
      const ta = b - disc, tb = b + disc;
      if ((ta > eps && ta < tMax) || (tb > eps && tb < tMax)) return true;
    }
    if (!nodes.length) return false;
    const saveT = hT, saveK = hKind, saveI = hIdx, saveU = hU, saveV = hV;
    hT = tMax; hKind = -1;
    traverse(ox, oy, oz, dx, dy, dz, true);
    const hit = hKind >= 0;
    hT = saveT; hKind = saveK; hIdx = saveI; hU = saveU; hV = saveV;
    return hit;
  }

  // ---------- Вспомогательное ----------
  let tx = 0, ty = 0, tz = 0, bx = 0, by = 0, bz = 0;
  function onb(nx, ny, nz) {   // ортонормированный базис (Duff и др., 2017)
    const s = nz >= 0 ? 1 : -1;
    const a = -1 / (s + nz);
    const b = nx * ny * a;
    tx = 1 + s * nx * nx * a; ty = s * b; tz = -s * nx;
    bx = b; by = s + ny * ny * a; bz = -ny;
  }
  function ggxD(cosH, a2) { const d = cosH * cosH * (a2 - 1) + 1; return a2 / (PI * d * d); }
  function ggxG1(c, a2) { return 2 * c / (c + Math.sqrt(a2 + (1 - a2) * c * c)); }

  // ---------- BSDF ----------
  let fr = 0, fg = 0, fb = 0, bPdf = 0;
  function evalBsdf(type, m, ar, ag, ab, nx, ny, nz, wox, woy, woz, wix, wiy, wiz) {
    fr = 0; fg = 0; fb = 0; bPdf = 0;
    const cosO = nx * wox + ny * woy + nz * woz, cosI = nx * wix + ny * wiy + nz * wiz;
    if (cosI <= 0 || cosO <= 0) return;
    if (type === 0) {
      fr = ar * INV_PI; fg = ag * INV_PI; fb = ab * INV_PI;
      bPdf = cosI * INV_PI;
      return;
    }
    let hx = wox + wix, hy = woy + wiy, hz = woz + wiz;
    const hl = Math.sqrt(hx * hx + hy * hy + hz * hz);
    hx /= hl; hy /= hl; hz /= hl;
    const cosH = nx * hx + ny * hy + nz * hz;
    const oh = wox * hx + woy * hy + woz * hz;
    if (cosH <= 0 || oh <= 0) return;
    const rough = mats[m + 4];
    const alpha = Math.max(0.02, rough * rough), a2 = alpha * alpha;
    const D = ggxD(cosH, a2);
    const G = ggxG1(cosO, a2) * ggxG1(cosI, a2);
    const specPdf = D * cosH / (4 * oh);
    const fw = Math.pow(1 - oh, 5);
    if (type === 1) {
      const k = D * G / (4 * cosO * cosI);
      fr = k * (ar + (1 - ar) * fw); fg = k * (ag + (1 - ag) * fw); fb = k * (ab + (1 - ab) * fw);
      bPdf = specPdf;
    } else {
      const F = 0.04 + 0.96 * fw;
      const ks = D * G * F / (4 * cosO * cosI);
      const kd = (1 - F) * INV_PI;
      fr = ks + ar * kd; fg = ks + ag * kd; fb = ks + ab * kd;
      bPdf = PLASTIC_SPEC * specPdf + (1 - PLASTIC_SPEC) * cosI * INV_PI;
    }
  }

  let sdx = 0, sdy = 0, sdz = 0, wr = 0, wg = 0, wb = 0, sPdf = 0, sDelta = false, sTransmit = false;
  function sampleBsdf(type, m, ar, ag, ab, nx, ny, nz, wox, woy, woz, entering) {
    sDelta = false; sTransmit = false;
    if (type === 2) {
      // гладкий диэлектрик: точные формулы Френеля
      const ior = mats[m + 5];
      const n1 = entering ? 1 : ior, n2 = entering ? ior : 1;
      const eta = n1 / n2;
      const cosi = nx * wox + ny * woy + nz * woz;
      const sin2t = eta * eta * (1 - cosi * cosi);
      let F = 1, cost = 0;
      if (sin2t < 1) {
        cost = Math.sqrt(1 - sin2t);
        const rs = (n1 * cosi - n2 * cost) / (n1 * cosi + n2 * cost);
        const rp = (n2 * cosi - n1 * cost) / (n2 * cosi + n1 * cost);
        F = 0.5 * (rs * rs + rp * rp);
      }
      sDelta = true; sPdf = 0; wr = 1; wg = 1; wb = 1;
      if (rnd() < F) {
        sdx = 2 * cosi * nx - wox; sdy = 2 * cosi * ny - woy; sdz = 2 * cosi * nz - woz;
      } else {
        const k = eta * cosi - cost;
        sdx = -eta * wox + k * nx; sdy = -eta * woy + k * ny; sdz = -eta * woz + k * nz;
        const l = Math.sqrt(sdx * sdx + sdy * sdy + sdz * sdz);
        sdx /= l; sdy /= l; sdz /= l;
        sTransmit = true;
      }
      return true;
    }
    const rough = mats[m + 4];
    const diffuse = type === 0 || (type === 3 && rnd() >= PLASTIC_SPEC);
    if (diffuse) {
      const r1 = rnd(), r2 = rnd();
      const r = Math.sqrt(r1), phi = TWO_PI * r2;
      const lx = r * Math.cos(phi), ly = r * Math.sin(phi), lz = Math.sqrt(Math.max(0, 1 - r1));
      onb(nx, ny, nz);
      sdx = tx * lx + bx * ly + nx * lz;
      sdy = ty * lx + by * ly + ny * lz;
      sdz = tz * lx + bz * ly + nz * lz;
      if (type === 0) { wr = ar; wg = ag; wb = ab; sPdf = lz * INV_PI; return true; }
    } else {
      if (type === 1 && rough < 0.06) {
        // идеальное зеркало
        const c = nx * wox + ny * woy + nz * woz;
        sdx = 2 * c * nx - wox; sdy = 2 * c * ny - woy; sdz = 2 * c * nz - woz;
        const fw = Math.pow(1 - c, 5);
        wr = ar + (1 - ar) * fw; wg = ag + (1 - ag) * fw; wb = ab + (1 - ab) * fw;
        sDelta = true; sPdf = 0;
        return true;
      }
      const alpha = Math.max(0.02, rough * rough), a2 = alpha * alpha;
      const r1 = rnd(), r2 = rnd();
      const cosH = Math.sqrt((1 - r1) / (1 + (a2 - 1) * r1));
      const sinH = Math.sqrt(Math.max(0, 1 - cosH * cosH));
      const phi = TWO_PI * r2;
      const lx = sinH * Math.cos(phi), ly = sinH * Math.sin(phi);
      onb(nx, ny, nz);
      const hx = tx * lx + bx * ly + nx * cosH;
      const hy = ty * lx + by * ly + ny * cosH;
      const hz = tz * lx + bz * ly + nz * cosH;
      const oh = wox * hx + woy * hy + woz * hz;
      if (oh <= 0) return false;
      sdx = 2 * oh * hx - wox; sdy = 2 * oh * hy - woy; sdz = 2 * oh * hz - woz;
    }
    evalBsdf(type, m, ar, ag, ab, nx, ny, nz, wox, woy, woz, sdx, sdy, sdz);
    if (bPdf <= 1e-12) return false;
    const cosI = nx * sdx + ny * sdy + nz * sdz;
    const c = cosI / bPdf;
    wr = fr * c; wg = fg * c; wb = fb * c; sPdf = bPdf;
    return true;
  }

  // ---------- Прямой свет ----------
  let lwx = 0, lwy = 0, lwz = 0, lDist = 0, lEr = 0, lEg = 0, lEb = 0, lPdf = 0;
  function sampleLight(ox, oy, oz) {
    const u = rnd();
    let li = 0;
    while (li < nLights - 1 && u > lights[li * 4 + 3]) li++;
    const kind = lights[li * 4], idx = lights[li * 4 + 1], prob = lights[li * 4 + 2];
    if (kind === 1) {
      const p = idx * 24;
      const a = rnd(), b = rnd();
      let wx = prims[p + 2] + a * prims[p + 5] + b * prims[p + 8] - ox;
      let wy = prims[p + 3] + a * prims[p + 6] + b * prims[p + 9] - oy;
      let wz = prims[p + 4] + a * prims[p + 7] + b * prims[p + 10] - oz;
      const d2 = wx * wx + wy * wy + wz * wz;
      const d = Math.sqrt(d2);
      wx /= d; wy /= d; wz /= d;
      const cosL = -(wx * prims[p + 11] + wy * prims[p + 12] + wz * prims[p + 13]);
      if (cosL <= 1e-6) return false;
      const m = prims[p + 1] * 16, I = mats[m + 6];
      lEr = mats[m + 1] * I; lEg = mats[m + 2] * I; lEb = mats[m + 3] * I;
      lPdf = prob * d2 / (cosL * prims[p + 14]);
      lwx = wx; lwy = wy; lwz = wz; lDist = d;
      return true;
    }
    const s = idx * 8;
    const cx = spheres[s] - ox, cy = spheres[s + 1] - oy, cz = spheres[s + 2] - oz, r = spheres[s + 3];
    const d2 = cx * cx + cy * cy + cz * cz;
    if (d2 <= r * r * 1.0001) return false;
    const d = Math.sqrt(d2);
    const ax = cx / d, ay = cy / d, az = cz / d;
    const cosMax = Math.sqrt(1 - r * r / d2);
    const r1 = rnd(), r2 = rnd();
    const cosT = 1 - r1 * (1 - cosMax);
    const sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT));
    const phi = TWO_PI * r2;
    onb(ax, ay, az);
    const lx = sinT * Math.cos(phi), ly = sinT * Math.sin(phi);
    lwx = tx * lx + bx * ly + ax * cosT;
    lwy = ty * lx + by * ly + ay * cosT;
    lwz = tz * lx + bz * ly + az * cosT;
    const b = cx * lwx + cy * lwy + cz * lwz;
    const disc = b * b - (d2 - r * r);
    lDist = disc > 0 ? b - Math.sqrt(disc) : d - r;
    const m = spheres[s + 4] * 16, I = mats[m + 6];
    lEr = mats[m + 1] * I; lEg = mats[m + 2] * I; lEb = mats[m + 3] * I;
    lPdf = prob / (TWO_PI * (1 - cosMax));
    return true;
  }
  // Плотность выбора этой точки источника при семплировании света (для MIS)
  function lightPdfAt(kind, idx, px, py, pz, dist, cosL) {
    if (kind === 1) {
      const prob = primLightProb[idx];
      if (prob <= 0 || cosL <= 1e-6) return 0;
      return prob * dist * dist / (cosL * prims[idx * 24 + 14]);
    }
    const prob = sphLightProb[idx];
    if (prob <= 0) return 0;
    const s = idx * 8;
    const cx = spheres[s] - px, cy = spheres[s + 1] - py, cz = spheres[s + 2] - pz, r = spheres[s + 3];
    const d2 = cx * cx + cy * cy + cz * cz;
    if (d2 <= r * r) return 0;
    const cosMax = Math.sqrt(1 - r * r / d2);
    return prob / (TWO_PI * (1 - cosMax));
  }

  let er = 0, eg = 0, eb = 0;
  function envRad(dy) {
    if (dy >= 0) {
      const k = Math.pow(dy, 0.55);
      er = env[3] + (env[0] - env[3]) * k; eg = env[4] + (env[1] - env[4]) * k; eb = env[5] + (env[2] - env[5]) * k;
    } else {
      const k = Math.pow(-dy, 0.35);
      er = env[3] + (env[6] - env[3]) * k; eg = env[4] + (env[7] - env[4]) * k; eb = env[5] + (env[8] - env[5]) * k;
    }
  }

  // ---------- Поверхность в точке попадания ----------
  let Sgx = 0, Sgy = 0, Sgz = 0, Snx = 0, Sny = 0, Snz = 0, Sm = 0;
  function surf(kind, idx, hx, hy, hz) {
    if (kind === 0) {
      const s = idx * 8, r = spheres[s + 3];
      Sgx = (hx - spheres[s]) / r; Sgy = (hy - spheres[s + 1]) / r; Sgz = (hz - spheres[s + 2]) / r;
      Snx = Sgx; Sny = Sgy; Snz = Sgz;
      Sm = spheres[s + 4] * 16;
      return;
    }
    const p = idx * 24;
    Sm = prims[p + 1] * 16;
    if (prims[p] === 1) {
      Sgx = prims[p + 11]; Sgy = prims[p + 12]; Sgz = prims[p + 13];
      Snx = Sgx; Sny = Sgy; Snz = Sgz;
      return;
    }
    const e1x = prims[p + 5], e1y = prims[p + 6], e1z = prims[p + 7];
    const e2x = prims[p + 8], e2y = prims[p + 9], e2z = prims[p + 10];
    let gx = e1y * e2z - e1z * e2y, gy = e1z * e2x - e1x * e2z, gz = e1x * e2y - e1y * e2x;
    const gl = Math.sqrt(gx * gx + gy * gy + gz * gz);
    gx /= gl; gy /= gl; gz /= gl;
    const w0 = 1 - hU - hV;
    let nx = prims[p + 11] * w0 + prims[p + 14] * hU + prims[p + 17] * hV;
    let ny = prims[p + 12] * w0 + prims[p + 15] * hU + prims[p + 18] * hV;
    let nz = prims[p + 13] * w0 + prims[p + 16] * hU + prims[p + 19] * hV;
    const nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
    nx /= nl; ny /= nl; nz /= nl;
    if (nx * gx + ny * gy + nz * gz < 0) { gx = -gx; gy = -gy; gz = -gz; }
    Sgx = gx; Sgy = gy; Sgz = gz; Snx = nx; Sny = ny; Snz = nz;
  }

  // Признаки для шумодава: нормаль, альбедо и дальность первой не-зеркальной поверхности
  const feat = new Float32Array(7);
  function feature(x, y, W, H) {
    const sx = (2 * (x + 0.5) / W - 1) * cam.tanHalf * cam.aspect;
    const sy = (1 - 2 * (y + 0.5) / H) * cam.tanHalf;
    let dx = cam.f[0] + cam.r[0] * sx + cam.u[0] * sy;
    let dy = cam.f[1] + cam.r[1] * sx + cam.u[1] * sy;
    let dz = cam.f[2] + cam.r[2] * sx + cam.u[2] * sy;
    const l = Math.sqrt(dx * dx + dy * dy + dz * dz);
    dx /= l; dy /= l; dz /= l;
    let ox = cam.p[0], oy = cam.p[1], oz = cam.p[2], dist = 0;
    for (let b = 0; b < 6; b++) {
      if (!intersect(ox, oy, oz, dx, dy, dz, 1e30)) break;
      const t = hT;
      const hx = ox + dx * t, hy = oy + dy * t, hz = oz + dz * t;
      surf(hKind, hIdx, hx, hy, hz);
      dist += t;
      const m = Sm, type = mats[m];
      let gx = Sgx, gy = Sgy, gz = Sgz, nx = Snx, ny = Sny, nz = Snz;
      const entering = gx * dx + gy * dy + gz * dz < 0;
      if (!entering) { gx = -gx; gy = -gy; gz = -gz; nx = -nx; ny = -ny; nz = -nz; }
      const mirror = type === 1 && mats[m + 4] < 0.06;
      if (type === 2 || mirror) {
        const c = -(nx * dx + ny * dy + nz * dz);
        let rx = dx + 2 * c * nx, ry = dy + 2 * c * ny, rz = dz + 2 * c * nz;
        let refl = true;
        if (type === 2) {
          const ior = mats[m + 5];
          const eta = entering ? 1 / ior : ior;
          const k = 1 - eta * eta * (1 - c * c);
          if (k > 0) {
            const q = eta * c - Math.sqrt(k);
            rx = eta * dx + q * nx; ry = eta * dy + q * ny; rz = eta * dz + q * nz;
            refl = false;
          }
        }
        const len = Math.sqrt(rx * rx + ry * ry + rz * rz);
        dx = rx / len; dy = ry / len; dz = rz / len;
        const off = refl ? eps : -eps;
        ox = hx + gx * off; oy = hy + gy * off; oz = hz + gz * off;
        continue;
      }
      feat[0] = nx; feat[1] = ny; feat[2] = nz;
      if (type === 4) { feat[3] = 1; feat[4] = 1; feat[5] = 1; }
      else {
        let ar = mats[m + 1], ag = mats[m + 2], ab = mats[m + 3];
        if (mats[m + 7] > 0) {
          const sc = mats[m + 11];
          if (((Math.floor(hx * sc) + Math.floor(hz * sc)) & 1) === 1) { ar = mats[m + 8]; ag = mats[m + 9]; ab = mats[m + 10]; }
        }
        if (type === 1) { ar = 0.5 + 0.5 * ar; ag = 0.5 + 0.5 * ag; ab = 0.5 + 0.5 * ab; }
        feat[3] = ar; feat[4] = ag; feat[5] = ab;
      }
      feat[6] = dist;
      return feat;
    }
    feat[0] = 0; feat[1] = 0; feat[2] = 0; feat[3] = 1; feat[4] = 1; feat[5] = 1; feat[6] = 1e7;
    return feat;
  }

  // ---------- Путь ----------
  const out = new Float64Array(3);
  let rays = 0;
  function radiance(ox, oy, oz, dx, dy, dz) {
    let tr = 1, tg = 1, tb = 1, Lr = 0, Lg = 0, Lb = 0;
    let delta = true, lastPdf = 0, px = ox, py = oy, pz = oz;
    for (let depth = 0; depth < MAX_DEPTH; depth++) {
      rays++;
      if (!intersect(ox, oy, oz, dx, dy, dz, 1e30)) {
        envRad(dy);
        Lr += tr * er; Lg += tg * eg; Lb += tb * eb;
        break;
      }
      const t = hT, kind = hKind, idx = hIdx;
      const hx = ox + dx * t, hy = oy + dy * t, hz = oz + dz * t;
      surf(kind, idx, hx, hy, hz);
      let gx = Sgx, gy = Sgy, gz = Sgz, nx = Snx, ny = Sny, nz = Snz;
      const m = Sm;
      const type = mats[m];
      const cosG = gx * dx + gy * dy + gz * dz;

      if (type === 4) {
        // источник светит только лицевой стороной (у сфер — всегда)
        if (kind === 0 || cosG < 0) {
          const I = mats[m + 6];
          let w = 1;
          if (!delta && nLights > 0) {
            const lp = lightPdfAt(kind, idx, px, py, pz, t, -cosG);
            w = (lastPdf * lastPdf) / (lastPdf * lastPdf + lp * lp);
          }
          Lr += tr * mats[m + 1] * I * w; Lg += tg * mats[m + 2] * I * w; Lb += tb * mats[m + 3] * I * w;
        }
        break;
      }

      const entering = cosG < 0;
      if (!entering) { gx = -gx; gy = -gy; gz = -gz; nx = -nx; ny = -ny; nz = -nz; }
      if (type === 2 && !entering) {
        // закон Бугера — Ламберта: окрашенное стекло поглощает по мере пути внутри
        const dens = mats[m + 6];
        if (dens > 0) {
          tr *= Math.exp(-(1 - mats[m + 1]) * dens * t);
          tg *= Math.exp(-(1 - mats[m + 2]) * dens * t);
          tb *= Math.exp(-(1 - mats[m + 3]) * dens * t);
        }
      }
      if (nx * gx + ny * gy + nz * gz < 0) { nx = gx; ny = gy; nz = gz; }
      const wox = -dx, woy = -dy, woz = -dz;

      let ar = mats[m + 1], ag = mats[m + 2], ab = mats[m + 3];
      if (mats[m + 7] > 0) {
        const sc = mats[m + 11];
        if (((Math.floor(hx * sc) + Math.floor(hz * sc)) & 1) === 1) { ar = mats[m + 8]; ag = mats[m + 9]; ab = mats[m + 10]; }
      }
      const ex = hx + gx * eps, ey = hy + gy * eps, ez = hz + gz * eps;

      // прямой свет с MIS
      const isDelta = type === 2 || (type === 1 && mats[m + 4] < 0.06);
      if (!isDelta && nLights > 0 && sampleLight(ex, ey, ez)) {
        const cosI = nx * lwx + ny * lwy + nz * lwz;
        if (cosI > 0 && gx * lwx + gy * lwy + gz * lwz > 0) {
          evalBsdf(type, m, ar, ag, ab, nx, ny, nz, wox, woy, woz, lwx, lwy, lwz);
          if (bPdf > 0) {
            rays++;
            if (!occluded(ex, ey, ez, lwx, lwy, lwz, lDist - 2 * eps)) {
              const w = (lPdf * lPdf) / (lPdf * lPdf + bPdf * bPdf);
              const k = cosI * w / lPdf;
              Lr += tr * fr * lEr * k; Lg += tg * fg * lEg * k; Lb += tb * fb * lEb * k;
            }
          }
        }
      }

      if (!sampleBsdf(type, m, ar, ag, ab, nx, ny, nz, wox, woy, woz, entering)) break;
      if (!sTransmit && gx * sdx + gy * sdy + gz * sdz <= 0) break;
      tr *= wr; tg *= wg; tb *= wb;
      delta = sDelta; lastPdf = sPdf;
      px = hx; py = hy; pz = hz;
      if (sTransmit) { ox = hx - gx * eps; oy = hy - gy * eps; oz = hz - gz * eps; }
      else { ox = ex; oy = ey; oz = ez; }
      dx = sdx; dy = sdy; dz = sdz;
      if (depth >= 3) {
        const q = Math.min(0.95, Math.max(tr, tg, tb));
        if (rnd() >= q) break;
        tr /= q; tg /= q; tb /= q;
      }
    }
    // мягкое ограничение «светлячков»
    const lum = 0.2126 * Lr + 0.7152 * Lg + 0.0722 * Lb;
    if (lum > clampLum) { const k = clampLum / lum; Lr *= k; Lg *= k; Lb *= k; }
    out[0] = Lr; out[1] = Lg; out[2] = Lb;
  }

  // ---------- Камера ----------
  let cam = null;
  function setCam(c) { cam = c; }
  function cameraRadiance(x, y, W, H) {
    const u = (x + rnd()) / W, v = (y + rnd()) / H;
    const sx = (2 * u - 1) * cam.tanHalf * cam.aspect;
    const sy = (1 - 2 * v) * cam.tanHalf;
    let dx = cam.f[0] + cam.r[0] * sx + cam.u[0] * sy;
    let dy = cam.f[1] + cam.r[1] * sx + cam.u[1] * sy;
    let dz = cam.f[2] + cam.r[2] * sx + cam.u[2] * sy;
    let l = Math.sqrt(dx * dx + dy * dy + dz * dz);
    dx /= l; dy /= l; dz /= l;
    let ox = cam.p[0], oy = cam.p[1], oz = cam.p[2];
    if (cam.aperture > 0) {
      const ft = cam.focus / (dx * cam.f[0] + dy * cam.f[1] + dz * cam.f[2]);
      const fx = ox + dx * ft, fy = oy + dy * ft, fz = oz + dz * ft;
      const rr = cam.aperture * Math.sqrt(rnd()), ph = TWO_PI * rnd();
      const lx = rr * Math.cos(ph), ly = rr * Math.sin(ph);
      ox += cam.r[0] * lx + cam.u[0] * ly;
      oy += cam.r[1] * lx + cam.u[1] * ly;
      oz += cam.r[2] * lx + cam.u[2] * ly;
      dx = fx - ox; dy = fy - oy; dz = fz - oz;
      l = Math.sqrt(dx * dx + dy * dy + dz * dz);
      dx /= l; dy /= l; dz /= l;
    }
    radiance(ox, oy, oz, dx, dy, dz);
  }

  // Выбор объекта кликом: какой объект виден в точке экрана
  function pick(x, y, W, H) {
    const sx = (2 * x / W - 1) * cam.tanHalf * cam.aspect;
    const sy = (1 - 2 * y / H) * cam.tanHalf;
    let dx = cam.f[0] + cam.r[0] * sx + cam.u[0] * sy;
    let dy = cam.f[1] + cam.r[1] * sx + cam.u[1] * sy;
    let dz = cam.f[2] + cam.r[2] * sx + cam.u[2] * sy;
    const l = Math.sqrt(dx * dx + dy * dy + dz * dz);
    dx /= l; dy /= l; dz /= l;
    if (!intersect(cam.p[0], cam.p[1], cam.p[2], dx, dy, dz, 1e30)) return null;
    return { kind: hKind, idx: hIdx, t: hT, dir: [dx, dy, dz] };
  }

  return {
    load, setSpheres, setMats, setCam, cameraRadiance, pick, out, feature,
    takeRays() { const r = rays; rays = 0; return r; },
  };
}

// =====================================================================================
// Воркер: рендерит свои строки и отдаёт суммы
// =====================================================================================
function workerMain(coreFactory) {
  const core = coreFactory();
  let W = 0, H = 0, N = 1, K = 0, gen = -1, preview = false, paused = true, ready = false;
  let rowsN = 0, sums = null, counts = null, cur = 0, lastPost = 0, scheduled = false;

  function reset() {
    rowsN = Math.max(0, Math.ceil((H - K) / N));
    sums = new Float32Array(rowsN * W * 3);
    counts = new Uint32Array(rowsN);
    cur = 0;
    lastPost = performance.now();
  }
  function post() {
    const s = sums.slice(), c = counts.slice();
    postMessage({ gen, K, N, W, H, preview, sums: s, counts: c, rays: core.takeRays() }, [s.buffer, c.buffer]);
    lastPost = performance.now();
  }
  function renderRow(r) {
    const y = r * N + K;
    const out = core.out;
    let o = r * W * 3;
    for (let x = 0; x < W; x++, o += 3) {
      core.cameraRadiance(x, y, W, H);
      sums[o] += out[0]; sums[o + 1] += out[1]; sums[o + 2] += out[2];
    }
    counts[r]++;
  }
  function work() {
    scheduled = false;
    if (paused || !ready || !rowsN) return;
    const t0 = performance.now();
    do {
      renderRow(cur);
      if (++cur >= rowsN) { cur = 0; post(); }
    } while (performance.now() - t0 < 24);
    if (performance.now() - lastPost > (preview ? 60 : 280)) post();
    schedule();
  }
  function schedule() {
    if (!scheduled && !paused && ready) { scheduled = true; setTimeout(work, 0); }
  }
  self.onmessage = (e) => {
    const d = e.data;
    if (d.scene) { core.load(d.scene); ready = true; }
    if (d.spheres) core.setSpheres(d.spheres);
    if (d.mats) core.setMats(d.mats);
    if (d.cam) core.setCam(d.cam);
    if (d.size) { W = d.size[0]; H = d.size[1]; }
    if (d.N !== undefined) { N = d.N; K = d.K; }
    if (d.preview !== undefined) preview = d.preview;
    if (d.paused !== undefined) paused = d.paused;
    if (d.gen !== undefined && d.gen !== gen) { gen = d.gen; reset(); }
    schedule();
  };
}

// =====================================================================================
// Шумодав: фильтр à-trous (Даммертц и др., 2010), края определяют нормали, альбедо и глубина
// =====================================================================================
function denoiseMain(coreFactory) {
  const core = coreFactory();
  let W = 0, H = 0, sceneRev = 0, featRev = -1;
  let nrm = null, alb = null, dep = null;
  function buildFeatures() {
    const n = W * H;
    nrm = new Float32Array(n * 3); alb = new Float32Array(n * 3); dep = new Float32Array(n);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const f = core.feature(x, y, W, H), p = y * W + x;
        nrm[p * 3] = f[0]; nrm[p * 3 + 1] = f[1]; nrm[p * 3 + 2] = f[2];
        alb[p * 3] = f[3]; alb[p * 3 + 1] = f[4]; alb[p * 3 + 2] = f[5];
        dep[p] = f[6];
      }
    }
  }
  function atrous(color, spp) {
    const n = W * H;
    let a = new Float32Array(n * 3), b = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) a[i] = color[i] / Math.max(0.03, alb[i]);
    // одиночные «светлячки»: пиксель намного ярче соседей прижимаем к их уровню
    const lumA = new Float32Array(n);
    for (let i = 0; i < n; i++) lumA[i] = 0.2126 * a[i * 3] + 0.7152 * a[i * 3 + 1] + 0.0722 * a[i * 3 + 2];
    const fireK = 2.5 + spp * 0.05;
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const p = y * W + x;
        let m = 0;
        for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (i || j) m += lumA[p + j * W + i];
        m /= 8;
        const lim = m * fireK + 0.05;
        if (lumA[p] > lim) { const k = lim / lumA[p]; a[p * 3] *= k; a[p * 3 + 1] *= k; a[p * 3 + 2] *= k; }
      }
    }
    const K = [1 / 16, 1 / 4, 3 / 8, 1 / 4, 1 / 16];
    const s0 = 3.0 / Math.sqrt(Math.max(1, spp)) + 0.08;
    const iters = spp < 48 ? 5 : 4;
    for (let it = 0; it < iters; it++) {
      const step = 1 << it;
      const sc = s0 * Math.pow(0.62, it);
      const invC = 1 / (sc * sc);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const p = y * W + x, p3 = p * 3;
          const pr = a[p3], pg = a[p3 + 1], pb = a[p3 + 2];
          const nx = nrm[p3], ny = nrm[p3 + 1], nz = nrm[p3 + 2], z = dep[p];
          const lum = 0.2126 * pr + 0.7152 * pg + 0.0722 * pb;
          const relC = invC / (lum * lum + 0.02);
          const zTol = 0.015 * z * step + 1e-5;
          const w0 = K[2] * K[2];
          let sr = pr * w0, sg = pg * w0, sb = pb * w0, sw = w0;
          for (let j = -2; j <= 2; j++) {
            const yy = y + j * step;
            if (yy < 0 || yy >= H) continue;
            const kj = K[j + 2];
            for (let i = -2; i <= 2; i++) {
              if (i === 0 && j === 0) continue;
              const xx = x + i * step;
              if (xx < 0 || xx >= W) continue;
              const q3 = (yy * W + xx) * 3;
              let nd = nx * nrm[q3] + ny * nrm[q3 + 1] + nz * nrm[q3 + 2];
              if (nd <= 0.3) continue;
              nd *= nd; nd *= nd; nd *= nd; nd *= nd;
              const dz = Math.abs(dep[q3 / 3] - z);
              if (dz > zTol * 6) continue;
              const dr = a[q3] - pr, dg = a[q3 + 1] - pg, db = a[q3 + 2] - pb;
              const w = kj * K[i + 2] * nd * Math.exp(-(dr * dr + dg * dg + db * db) * relC - dz / zTol);
              sr += a[q3] * w; sg += a[q3 + 1] * w; sb += a[q3 + 2] * w; sw += w;
            }
          }
          b[p3] = sr / sw; b[p3 + 1] = sg / sw; b[p3 + 2] = sb / sw;
        }
      }
      const t = a; a = b; b = t;
    }
    for (let i = 0; i < n * 3; i++) a[i] *= Math.max(0.03, alb[i]);
    return a;
  }
  self.onmessage = (e) => {
    const d = e.data;
    if (d.scene) { core.load(d.scene); sceneRev++; }
    if (d.spheres) { core.setSpheres(d.spheres); sceneRev++; }
    if (d.mats) { core.setMats(d.mats); sceneRev++; }
    if (d.cam) { core.setCam(d.cam); sceneRev++; }
    if (d.color) {
      if (d.W !== W || d.H !== H || featRev !== sceneRev) { W = d.W; H = d.H; buildFeatures(); featRev = sceneRev; }
      const out = atrous(d.color, d.spp);
      postMessage({ gen: d.gen, spp: d.spp, W, H, out }, [out.buffer]);
    }
  };
}

// =====================================================================================
// Главный поток
// =====================================================================================
(() => {
  const $ = (s) => document.querySelector(s);
  const el = {
    frame: $('#frame'), render: $('#render'), overlay: $('#overlay'), spark: $('#spark'),
    spp: $('#spp'), sppBadge: $('#spp-badge'), rps: $('#rps'), elapsed: $('#elapsed'), threads: $('#threads'),
    workers: $('#workers'), state: $('#state'), stateDot: $('#state-dot'), res: $('#res'), sceneNo: $('#scene-no'),
    scenes: $('#scenes'), mats: $('#mats'), objName: $('#obj-name'), object: $('#object'),
    rough: $('#rough'), roughOut: $('#rough-out'), roughRow: $('#rough-row'),
    ior: $('#ior'), iorOut: $('#ior-out'), iorRow: $('#ior-row'),
    exposure: $('#exposure'), expOut: $('#exp-out'), aperture: $('#aperture'), apOut: $('#ap-out'), dofRow: $('#dof-row'),
    pause: $('#pause'), restart: $('#restart'), save: $('#save'), pick: $('#pick'), hintLine: $('#hint-line'),
    denoise: $('#denoise'),
  };
  const fmt = (v, d = 1) => v.toFixed(d).replace('.', ',');

  // ---------- Материалы-пресеты ----------
  // Тип: 0 — диффузный, 1 — металл (GGX), 2 — стекло, 3 — пластик, 4 — свечение
  const MATS = {
    chalk:   { name: 'Мел',      type: 0, color: [0.80, 0.79, 0.76], sw: 'radial-gradient(circle at 35% 30%, #f4f1ea, #bdb8ad 60%, #6f6b63)' },
    plastic: { name: 'Пластик',  type: 3, color: [0.72, 0.10, 0.08], rough: 0.14, sw: 'radial-gradient(circle at 35% 30%, #ffd9d0 0 8%, #d4301f 30%, #6b0d05)' },
    gold:    { name: 'Золото',   type: 1, color: [1.0, 0.77, 0.34], rough: 0.2, sw: 'radial-gradient(circle at 35% 30%, #fff4cf 0 6%, #e3b14f 35%, #6b4610)' },
    copper:  { name: 'Медь',     type: 1, color: [0.95, 0.62, 0.50], rough: 0.42, sw: 'radial-gradient(circle at 35% 30%, #ffe0d2 0 5%, #c77b5c 40%, #5a2a17)' },
    mirror:  { name: 'Зеркало',  type: 1, color: [0.95, 0.95, 0.96], rough: 0.0, sw: 'radial-gradient(circle at 35% 30%, #ffffff 0 10%, #b7bcc4 35%, #3a3f47 70%, #c9ced6)' },
    glass:   { name: 'Стекло',   type: 2, color: [1, 1, 1], ior: 1.5, dens: 0, sw: 'radial-gradient(circle at 35% 30%, #ffffff 0 10%, rgba(200,220,235,.35) 40%, rgba(120,150,170,.5))' },
    tinted:  { name: 'Цветное стекло', type: 2, color: [0.35, 0.82, 0.78], ior: 1.52, dens: 1.1, sw: 'radial-gradient(circle at 35% 30%, #e6fffb 0 10%, #52b8ad 45%, #0d4a45)' },
    emit:    { name: 'Свечение', type: 4, color: [1.0, 0.62, 0.30], power: 14, sw: 'radial-gradient(circle at 50% 50%, #fff3d6 0 18%, #ffa04a 45%, #6b2a05)' },
  };
  const CHIPS = ['chalk', 'plastic', 'gold', 'copper', 'mirror', 'glass', 'tinted', 'emit'];

  function packMat(arr, i, def) {
    const o = i * 16;
    arr[o] = def.type;
    arr[o + 1] = def.color[0]; arr[o + 2] = def.color[1]; arr[o + 3] = def.color[2];
    arr[o + 4] = def.rough ?? 0.5;
    arr[o + 5] = def.ior ?? 1.5;
    arr[o + 6] = def.type === 4 ? (def.power ?? 10) : (def.dens ?? 0);
    arr[o + 7] = def.checker ? 1 : 0;
    if (def.checker) { arr[o + 8] = def.color2[0]; arr[o + 9] = def.color2[1]; arr[o + 10] = def.color2[2]; arr[o + 11] = def.scale; }
  }

  // ---------- Геометрия и BVH ----------
  function quad(P, U, V, mat) {
    const nx = U[1] * V[2] - U[2] * V[1], ny = U[2] * V[0] - U[0] * V[2], nz = U[0] * V[1] - U[1] * V[0];
    const len = Math.hypot(nx, ny, nz);
    return { type: 1, mat, P, U, V, N: [nx / len, ny / len, nz / len], area: len };
  }
  function tri(a, b, c, na, nb, nc, mat) { return { type: 2, mat, a, b, c, na, nb, nc }; }

  function primBounds(p) {
    let pts;
    if (p.type === 1) {
      const { P, U, V } = p;
      pts = [P, [P[0] + U[0], P[1] + U[1], P[2] + U[2]], [P[0] + V[0], P[1] + V[1], P[2] + V[2]], [P[0] + U[0] + V[0], P[1] + U[1] + V[1], P[2] + U[2] + V[2]]];
    } else pts = [p.a, p.b, p.c];
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (const q of pts) for (let k = 0; k < 3; k++) { if (q[k] < mn[k]) mn[k] = q[k]; if (q[k] > mx[k]) mx[k] = q[k]; }
    for (let k = 0; k < 3; k++) { if (mx[k] - mn[k] < 1e-5) { mn[k] -= 1e-4; mx[k] += 1e-4; } }
    return { mn, mx, c: [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2] };
  }

  // SAH по корзинам; левый потомок всегда идёт сразу за родителем, правый — по индексу
  function buildBVH(list) {
    const n = list.length;
    const bb = list.map(primBounds);
    const idx = new Int32Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    const nodes = [];
    const BINS = 12;
    const area = (mn, mx) => {
      const dx = mx[0] - mn[0], dy = mx[1] - mn[1], dz = mx[2] - mn[2];
      return 2 * (dx * dy + dy * dz + dz * dx);
    };
    function build(lo, hi) {
      const self = nodes.length / 8;
      for (let k = 0; k < 8; k++) nodes.push(0);
      const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
      const cmn = [Infinity, Infinity, Infinity], cmx = [-Infinity, -Infinity, -Infinity];
      for (let i = lo; i < hi; i++) {
        const b = bb[idx[i]];
        for (let k = 0; k < 3; k++) {
          if (b.mn[k] < mn[k]) mn[k] = b.mn[k];
          if (b.mx[k] > mx[k]) mx[k] = b.mx[k];
          if (b.c[k] < cmn[k]) cmn[k] = b.c[k];
          if (b.c[k] > cmx[k]) cmx[k] = b.c[k];
        }
      }
      const o = self * 8;
      nodes[o] = mn[0]; nodes[o + 1] = mn[1]; nodes[o + 2] = mn[2];
      nodes[o + 3] = mx[0]; nodes[o + 4] = mx[1]; nodes[o + 5] = mx[2];
      const count = hi - lo;
      const leaf = () => { nodes[o + 6] = lo; nodes[o + 7] = count; return self; };
      if (count <= 4) return leaf();
      let axis = 0;
      const ext = [cmx[0] - cmn[0], cmx[1] - cmn[1], cmx[2] - cmn[2]];
      if (ext[1] > ext[axis]) axis = 1;
      if (ext[2] > ext[axis]) axis = 2;
      if (ext[axis] < 1e-9) return leaf();
      const binCount = new Int32Array(BINS);
      const binMn = [], binMx = [];
      for (let b = 0; b < BINS; b++) { binMn.push([Infinity, Infinity, Infinity]); binMx.push([-Infinity, -Infinity, -Infinity]); }
      const scale = BINS / ext[axis];
      const binOf = (i) => Math.min(BINS - 1, Math.floor((bb[idx[i]].c[axis] - cmn[axis]) * scale));
      for (let i = lo; i < hi; i++) {
        const b = binOf(i), box = bb[idx[i]];
        binCount[b]++;
        for (let k = 0; k < 3; k++) {
          if (box.mn[k] < binMn[b][k]) binMn[b][k] = box.mn[k];
          if (box.mx[k] > binMx[b][k]) binMx[b][k] = box.mx[k];
        }
      }
      let best = -1, bestCost = Infinity;
      for (let s = 1; s < BINS; s++) {
        let cL = 0, cR = 0;
        const lmn = [Infinity, Infinity, Infinity], lmx = [-Infinity, -Infinity, -Infinity];
        const rmn = [Infinity, Infinity, Infinity], rmx = [-Infinity, -Infinity, -Infinity];
        for (let b = 0; b < BINS; b++) {
          if (!binCount[b]) continue;
          const L = b < s;
          for (let k = 0; k < 3; k++) {
            if (L) { if (binMn[b][k] < lmn[k]) lmn[k] = binMn[b][k]; if (binMx[b][k] > lmx[k]) lmx[k] = binMx[b][k]; }
            else { if (binMn[b][k] < rmn[k]) rmn[k] = binMn[b][k]; if (binMx[b][k] > rmx[k]) rmx[k] = binMx[b][k]; }
          }
          if (L) cL += binCount[b]; else cR += binCount[b];
        }
        if (!cL || !cR) continue;
        const cost = cL * area(lmn, lmx) + cR * area(rmn, rmx);
        if (cost < bestCost) { bestCost = cost; best = s; }
      }
      let mid;
      if (best < 0) {
        mid = (lo + hi) >> 1;
        const part = Array.from(idx.subarray(lo, hi)).sort((a, b) => bb[a].c[axis] - bb[b].c[axis]);
        idx.set(part, lo);
      } else {
        if (count <= 8 && bestCost >= area(mn, mx) * count) return leaf();
        let i = lo, j = hi - 1;
        while (i <= j) {
          if (binOf(i) < best) i++;
          else { const t = idx[i]; idx[i] = idx[j]; idx[j] = t; j--; }
        }
        mid = i;
        if (mid === lo || mid === hi) mid = (lo + hi) >> 1;
      }
      build(lo, mid);
      const right = build(mid, hi);
      nodes[o + 6] = right;
      nodes[o + 7] = 0;
      return self;
    }
    if (n) build(0, n);
    // упаковка примитивов в порядке листьев
    const prims = new Float32Array(n * 24);
    for (let i = 0; i < n; i++) {
      const p = list[idx[i]], o = i * 24;
      prims[o] = p.type; prims[o + 1] = p.mat;
      if (p.type === 1) {
        prims.set(p.P, o + 2); prims.set(p.U, o + 5); prims.set(p.V, o + 8); prims.set(p.N, o + 11);
        prims[o + 14] = p.area;
        prims[o + 15] = 1 / (p.U[0] ** 2 + p.U[1] ** 2 + p.U[2] ** 2);
        prims[o + 16] = 1 / (p.V[0] ** 2 + p.V[1] ** 2 + p.V[2] ** 2);
      } else {
        prims.set(p.a, o + 2);
        prims.set([p.b[0] - p.a[0], p.b[1] - p.a[1], p.b[2] - p.a[2]], o + 5);
        prims.set([p.c[0] - p.a[0], p.c[1] - p.a[1], p.c[2] - p.a[2]], o + 8);
        prims.set(p.na, o + 11); prims.set(p.nb, o + 14); prims.set(p.nc, o + 17);
      }
    }
    return { prims, nodes: new Float32Array(nodes) };
  }

  // Узел-трилистник (p = 2, q = 3) трубкой, как в TorusKnotGeometry
  function torusKnotMesh(p, q, radius, tube, tubular, radial, center, scale, mat) {
    const curve = (u) => {
      const cu = Math.cos(u), su = Math.sin(u), qu = q / p * u, cs = Math.cos(qu);
      return [radius * (2 + cs) * 0.5 * cu, radius * (2 + cs) * su * 0.5, radius * Math.sin(qu) * 0.5];
    };
    const verts = [], norms = [];
    for (let i = 0; i <= tubular; i++) {
      const u = i / tubular * p * Math.PI * 2;
      const P1 = curve(u), P2 = curve(u + 0.01);
      const T = [P2[0] - P1[0], P2[1] - P1[1], P2[2] - P1[2]];
      let Nn = [P2[0] + P1[0], P2[1] + P1[1], P2[2] + P1[2]];
      let B = [T[1] * Nn[2] - T[2] * Nn[1], T[2] * Nn[0] - T[0] * Nn[2], T[0] * Nn[1] - T[1] * Nn[0]];
      Nn = [B[1] * T[2] - B[2] * T[1], B[2] * T[0] - B[0] * T[2], B[0] * T[1] - B[1] * T[0]];
      const bl = Math.hypot(...B), nl = Math.hypot(...Nn);
      B = B.map((v) => v / bl); Nn = Nn.map((v) => v / nl);
      for (let j = 0; j <= radial; j++) {
        const v = j / radial * Math.PI * 2;
        const cx = -tube * Math.cos(v), cy = tube * Math.sin(v);
        const pos = [P1[0] + cx * Nn[0] + cy * B[0], P1[1] + cx * Nn[1] + cy * B[1], P1[2] + cx * Nn[2] + cy * B[2]];
        const nrm = [pos[0] - P1[0], pos[1] - P1[1], pos[2] - P1[2]];
        const l = Math.hypot(...nrm);
        verts.push([center[0] + pos[0] * scale, center[1] + pos[1] * scale, center[2] + pos[2] * scale]);
        norms.push([nrm[0] / l, nrm[1] / l, nrm[2] / l]);
      }
    }
    const tris = [];
    for (let j = 1; j <= tubular; j++) {
      for (let i = 1; i <= radial; i++) {
        const a = (radial + 1) * (j - 1) + (i - 1), b = (radial + 1) * j + (i - 1);
        const c = (radial + 1) * j + i, d = (radial + 1) * (j - 1) + i;
        tris.push(tri(verts[a], verts[b], verts[d], norms[a], norms[b], norms[d], mat));
        tris.push(tri(verts[b], verts[c], verts[d], norms[b], norms[c], norms[d], mat));
      }
    }
    return tris;
  }

  // ---------- Сцены ----------
  // Каждая сфера — отдельный объект со своим материалом, их можно двигать и перекрашивать
  const SCENES = [
    {
      id: 'cornell', title: 'Комната Корнелла', desc: 'Классика 1984 года: стеклянный шар фокусирует свет в каустику', aspect: 1,
      build() {
        const mats = [
          { type: 0, color: [0.725, 0.71, 0.68] },            // 0 белый
          { type: 0, color: [0.63, 0.065, 0.05] },            // 1 красный
          { type: 0, color: [0.14, 0.45, 0.091] },            // 2 зелёный
          { type: 4, color: [1.0, 0.72, 0.36], power: 34 },   // 3 лампа
        ];
        const S = 555;
        const list = [
          quad([0, 0, 0], [0, 0, S], [S, 0, 0], 0),         // пол (нормаль вверх)
          quad([0, S, 0], [S, 0, 0], [0, 0, S], 0),         // потолок
          quad([0, 0, S], [0, S, 0], [S, 0, 0], 0),         // задняя стена
          quad([S, 0, 0], [0, 0, S], [0, S, 0], 1),         // левая, красная
          quad([0, 0, 0], [0, S, 0], [0, 0, S], 2),         // правая, зелёная
          quad([213, 554, 227], [130, 0, 0], [0, 0, 105], 3), // лампа, нормаль вниз
        ];
        const spheres = [
          { name: 'Стеклянный шар', c: [185, 100, 190], r: 100, mat: 'glass' },
          { name: 'Зеркальный шар', c: [385, 90, 372], r: 90, mat: 'mirror' },
        ];
        return {
          mats, list, spheres, env: [0, 0, 0, 0, 0, 0, 0, 0, 0], eps: 0.02, clamp: 7,
          cam: { pos: [278, 273, -800], target: [278, 273, 0], fov: 39.3, aperture: 0, focus: 1000 },
          orbit: false, floorY: 0, bounds: [0, S, 0, S], dof: false, exposure: 0,
        };
      },
    },
    {
      id: 'studio', title: 'Студия материалов', desc: 'Золото, медь, стекло, пластик и свет — на глянцевом полу', aspect: 1.6,
      build() {
        const mats = [
          { type: 3, color: [0.035, 0.036, 0.04], rough: 0.22 },                               // 0 пол
          { type: 4, color: [1.0, 0.96, 0.9], power: 5.5 },                                   // 1 софтбокс
          { type: 4, color: [0.75, 0.85, 1.0], power: 7 },                                    // 2 контровой
        ];
        const list = [
          quad([-120, 0, -120], [0, 0, 240], [240, 0, 0], 0),
          quad([-2.6, 4.2, -1.6], [4.2, 0, 0], [0, 0, 2.6], 1),
          quad([-3.4, 4.8, -3.6], [6.8, 0, 0], [0, 0.9, 0.9], 2),
        ];
        const spheres = [
          { name: 'Золотой шар', c: [-2.2, 0.5, 0], r: 0.5, mat: 'gold' },
          { name: 'Медный шар', c: [-1.1, 0.5, 0.35], r: 0.5, mat: 'copper' },
          { name: 'Стеклянный шар', c: [0, 0.5, 0.55], r: 0.5, mat: 'glass' },
          { name: 'Пластиковый шар', c: [1.1, 0.5, 0.35], r: 0.5, mat: 'plastic' },
          { name: 'Меловой шар', c: [2.2, 0.5, 0], r: 0.5, mat: 'chalk' },
          { name: 'Светлячок', c: [0.56, 0.12, 1.3], r: 0.12, mat: 'emit' },
        ];
        return {
          mats, list, spheres, env: [0.34, 0.35, 0.38, 0.05, 0.05, 0.06, 0.012, 0.012, 0.014], eps: 2e-4, clamp: 9,
          cam: { pos: [0, 1.55, 7.3], target: [0, 0.45, 0.2], fov: 30, aperture: 0.05, focus: 7.1 },
          orbit: true, floorY: 0, bounds: [-6, 6, -4, 4], dof: true, exposure: 0.2,
        };
      },
    },
    {
      id: 'knot', title: 'Стеклянный узел', desc: '12 тысяч треугольников цветного стекла: BVH и каустики', aspect: 1.6,
      build() {
        const mats = [
          { type: 0, color: [0.78, 0.76, 0.72] },                               // 0 пол
          { type: 4, color: [1.0, 0.93, 0.84], power: 26 },                     // 1 лампа
          { type: 2, color: [0.30, 0.78, 0.86], ior: 1.5, dens: 0.9 },          // 2 стекло узла
          { type: 0, color: [0.70, 0.68, 0.64] },                               // 3 фон
        ];
        const list = [
          quad([-30, 0, -30], [0, 0, 60], [60, 0, 0], 0),
          quad([-30, 0, -4], [60, 0, 0], [0, 20, 0], 3),
          quad([-3.2, 5.4, 0.6], [1.7, 0, 0], [0, 0, 1.7], 1),
        ];
        const knot = torusKnotMesh(2, 3, 1.0, 0.3, 256, 24, [0, 1.62, 0], 0.95, 2);
        for (const t of knot) list.push(t);
        const spheres = [
          { name: 'Золотой шар', c: [1.95, 0.42, 1.15], r: 0.42, mat: 'gold' },
          { name: 'Зеркальный шар', c: [-2.05, 0.34, 1.35], r: 0.34, mat: 'mirror' },
        ];
        return {
          mats, list, spheres, env: [0.26, 0.28, 0.32, 0.14, 0.14, 0.15, 0.05, 0.05, 0.05], eps: 2e-4, clamp: 7,
          cam: { pos: [0, 1.9, 7.6], target: [0, 1.25, 0], fov: 36, aperture: 0, focus: 7.6 },
          orbit: true, floorY: 0, bounds: [-6, 6, -3.5, 4], dof: false, exposure: -0.1,
        };
      },
    },
  ];

  // ---------- Состояние ----------
  const nWorkers = Math.max(2, Math.min(12, (navigator.hardwareConcurrency || 4) - 1));
  const core = tracerCore();
  let scene = null, sceneIdx = 0;
  let W = 640, H = 640;
  let gen = 0, preview = false, paused = false, interacting = false;
  let mats = null, spheres = null, sphereInfo = [];
  let cam = null, camOrbit = null;
  let selected = -1;
  let exposure = 0;
  let accBuf = new Float32Array(0), rowSpp = new Uint32Array(0);
  let prevBuf = new Float32Array(0), pW = 0, pH = 0;
  let dirty = false, lastTone = 0;
  let genStart = performance.now(), elapsedFrozen = 0;
  const rayLog = [];
  const sparkHist = [];
  const TARGET_SPP = 4096;

  // ---------- Воркеры ----------
  const workerSrc = `(${workerMain.toString()})(${tracerCore.toString()});`;
  const workerURL = URL.createObjectURL(new Blob([workerSrc], { type: 'text/javascript' }));
  const workers = [];
  for (let k = 0; k < nWorkers; k++) {
    const w = new Worker(workerURL);
    w.onmessage = (e) => onRows(e.data);
    w.onerror = (e) => { console.error('Ошибка в потоке рендера:', e.message); };
    workers.push(w);
  }
  el.threads.textContent = `${nWorkers} ${plural(nWorkers, 'поток', 'потока', 'потоков')} + шумодав`;

  // Отдельный поток шумодава
  const dworker = new Worker(URL.createObjectURL(new Blob([`(${denoiseMain.toString()})(${tracerCore.toString()});`], { type: 'text/javascript' })));
  let denoiseOn = true, dBusy = false, denoised = null, denoisedGen = -1, lastDenoise = 0, lastDenoiseSpp = 0;
  let mixBuf = new Float32Array(0);
  dworker.onmessage = (e) => {
    const d = e.data;
    dBusy = false;
    if (d.gen === gen && d.W === W && d.H === H) { denoised = d.out; denoisedGen = d.gen; dirty = true; }
  };
  dworker.onerror = (e) => { console.error('Ошибка шумодава:', e.message); dBusy = false; };
  el.workers.innerHTML = workers.map(() => '<i></i>').join('');
  const cells = Array.from(el.workers.children);

  function plural(n, a, b, c) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return a;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return b;
    return c;
  }

  // ---------- Камера ----------
  function makeCam(c, aspect) {
    const f = norm(sub(c.target, c.pos));
    const r = norm(cross(f, [0, 1, 0]));
    const u = cross(r, f);
    return {
      p: c.pos.slice(), f, r, u, tanHalf: Math.tan(c.fov * Math.PI / 360), aspect,
      aperture: scene.dof ? c.aperture * (+el.aperture.value / 0.3) : 0, focus: c.focus,
    };
  }
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };

  function orbitPos() {
    const o = camOrbit;
    return [
      o.target[0] + o.dist * Math.cos(o.pitch) * Math.sin(o.yaw),
      o.target[1] + o.dist * Math.sin(o.pitch),
      o.target[2] + o.dist * Math.cos(o.pitch) * Math.cos(o.yaw),
    ];
  }

  // ---------- Загрузка сцены ----------
  function sizeFrame() {
    const stage = el.frame.parentElement;
    const cs = getComputedStyle(stage);
    const availW = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const availH = window.innerWidth <= 900 ? availW / scene.aspect : stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    let w = availW, h = w / scene.aspect;
    if (h > availH) { h = availH; w = h * scene.aspect; }
    w = Math.floor(w); h = Math.floor(h);
    el.frame.style.width = w + 'px';
    el.frame.style.height = h + 'px';
    // внутреннее разрешение: не больше 1 пикселя на CSS-пиксель и не больше 880 по длинной стороне
    const k = Math.min(1, 880 / Math.max(w, h));
    W = Math.max(64, Math.round(w * k));
    H = Math.max(64, Math.round(h * k));
    el.render.width = W; el.render.height = H;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    el.overlay.width = Math.round(w * dpr); el.overlay.height = Math.round(h * dpr);
    el.res.textContent = `${W}×${H}`;
    accBuf = new Float32Array(W * H * 3);
    rowSpp = new Uint32Array(H);
    imgData = new ImageData(W, H);
    fillDark(imgData);
  }
  let imgData = null;
  function fillDark(img) { for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255; }

  function loadScene(i) {
    sceneIdx = i;
    const def = SCENES[i];
    scene = def.build();
    scene.def = def;
    scene.aspect = def.aspect;
    const t0 = performance.now();
    const bvh = buildBVH(scene.list);
    scene.buildMs = performance.now() - t0;
    // материалы: базовые сцены + по одному на каждую сферу
    const nm = scene.mats.length + scene.spheres.length;
    mats = new Float32Array(nm * 16);
    scene.mats.forEach((m, k) => packMat(mats, k, m));
    sphereInfo = scene.spheres.map((s, k) => ({ ...s, matIndex: scene.mats.length + k, preset: s.mat, rough: MATS[s.mat].rough ?? 0.3, ior: MATS[s.mat].ior ?? 1.5 }));
    sphereInfo.forEach((s) => packMat(mats, s.matIndex, { ...MATS[s.preset], rough: s.rough, ior: s.ior }));
    spheres = new Float32Array(sphereInfo.length * 8);
    sphereInfo.forEach((s, k) => spheres.set([s.c[0], s.c[1], s.c[2], s.r, s.matIndex, k, 0, 0], k * 8));
    scene.prims = bvh.prims;
    scene.nodes = bvh.nodes;

    el.exposure.value = scene.exposure; syncSlider(el.exposure); exposure = scene.exposure;
    el.expOut.textContent = (exposure > 0 ? '+' : exposure < 0 ? '−' : '') + fmt(Math.abs(exposure), 1);
    el.dofRow.style.display = scene.dof ? '' : 'none';
    el.sceneNo.textContent = String(i + 1).padStart(2, '0');
    el.hintLine.innerHTML = scene.orbit
      ? 'Тяните шар — двигать, фон — вращать камеру, клик — навести фокус'
      : 'Клик по&nbsp;шару — выбрать, тяните — передвинуть';
    el.overlay.classList.toggle('fixed-cam', !scene.orbit);
    const c = scene.cam;
    const d = sub(c.pos, c.target);
    camOrbit = { target: c.target.slice(), dist: Math.hypot(...d), yaw: Math.atan2(d[0], d[2]), pitch: Math.asin(d[1] / Math.hypot(...d)) };
    sizeFrame();
    cam = makeCam(c, W / H);
    core.load({ prims: scene.prims, nodes: scene.nodes, spheres, mats, env: new Float32Array(scene.env), eps: scene.eps, clamp: scene.clamp });
    core.setCam(cam);
    select(-1);
    [...el.scenes.children].forEach((b, k) => b.setAttribute('aria-pressed', String(k === i)));
    gen++;
    workers.forEach((w, k) => w.postMessage({
      scene: { prims: scene.prims, nodes: scene.nodes, spheres, mats, env: new Float32Array(scene.env), eps: scene.eps, clamp: scene.clamp },
      cam, size: [W, H], N: nWorkers, K: k, gen, preview: false, paused,
    }));
    dworker.postMessage({ scene: { prims: scene.prims, nodes: scene.nodes, spheres, mats, env: new Float32Array(scene.env), eps: scene.eps, clamp: scene.clamp }, cam });
    denoised = null; lastDenoiseSpp = 0;
    mixBuf = new Float32Array(W * H * 3);
    preview = false;
    resetStats();
  }

  function resetStats() {
    genStart = performance.now();
    elapsedFrozen = 0;
    rowSpp.fill(0);
  }

  // Любое изменение сцены: новое «поколение»; во время перетаскивания — быстрый предпросмотр в 1/3 разрешения
  function restart(opts = {}) {
    gen++;
    const pv = !!opts.preview;
    const msg = { gen, preview: pv };
    if (opts.spheres) { msg.spheres = spheres; core.setSpheres(spheres); }
    if (opts.mats) { msg.mats = mats; core.setMats(mats); }
    if (opts.cam) { msg.cam = cam; core.setCam(cam); }
    if (pv) {
      pW = Math.max(16, Math.round(W / 3)); pH = Math.max(16, Math.round(H / 3));
      msg.size = [pW, pH];
      prevBuf = new Float32Array(pW * pH * 3);
    } else {
      msg.size = [W, H];
      if (preview && prevBuf.length) {
        // переносим предпросмотр в полный буфер, чтобы не мелькала старая картинка
        for (let y = 0; y < H; y++) {
          const sy = Math.min(pH - 1, Math.floor(y * pH / H));
          for (let x = 0; x < W; x++) {
            const sx = Math.min(pW - 1, Math.floor(x * pW / W));
            const s = (sy * pW + sx) * 3, d = (y * W + x) * 3;
            accBuf[d] = prevBuf[s]; accBuf[d + 1] = prevBuf[s + 1]; accBuf[d + 2] = prevBuf[s + 2];
          }
        }
      }
      resetStats();
    }
    preview = pv;
    workers.forEach((w) => w.postMessage(msg));
    const dmsg = {};
    if (opts.spheres) dmsg.spheres = spheres;
    if (opts.mats) dmsg.mats = mats;
    if (opts.cam) dmsg.cam = cam;
    if (Object.keys(dmsg).length) dworker.postMessage(dmsg);
    if (!pv) { denoised = null; lastDenoiseSpp = 0; }
    dirty = true;
  }

  // ---------- Приём строк ----------
  function onRows(d) {
    if (d.gen !== gen) return;
    const now = performance.now();
    rayLog.push([now, d.rays]);
    const cell = cells[d.K];
    if (cell) { cell.classList.add('hot'); setTimeout(() => cell.classList.remove('hot'), 60); }
    const buf = d.preview ? prevBuf : accBuf;
    const Wd = d.W;
    if (d.preview && (Wd !== pW)) return;
    if (!d.preview && Wd !== W) return;
    for (let r = 0; r < d.counts.length; r++) {
      const c = d.counts[r];
      if (!c) continue;
      const y = r * d.N + d.K;
      const inv = 1 / c;
      const src = r * Wd * 3, dst = y * Wd * 3;
      for (let i = 0; i < Wd * 3; i++) buf[dst + i] = d.sums[src + i] * inv;
      if (!d.preview) rowSpp[y] = c;
    }
    dirty = true;
  }

  // ---------- Тональная компрессия ----------
  const GAMMA = new Uint8Array(4096);
  for (let i = 0; i < 4096; i++) {
    const v = i / 4095;
    GAMMA[i] = Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
  }
  function aces(x) { const v = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14); return v < 0 ? 0 : v > 1 ? 1 : v; }
  const smallCanvas = document.createElement('canvas');
  const ctx = el.render.getContext('2d');
  function tonemap(buf, w, h, img) {
    const k = Math.pow(2, exposure) * 0.8;
    const data = img.data;
    for (let i = 0, j = 0, n = w * h; i < n; i++, j += 3) {
      const o = i * 4;
      data[o] = GAMMA[(aces(buf[j] * k) * 4095) | 0];
      data[o + 1] = GAMMA[(aces(buf[j + 1] * k) * 4095) | 0];
      data[o + 2] = GAMMA[(aces(buf[j + 2] * k) * 4095) | 0];
      data[o + 3] = 255;
    }
  }
  function present() {
    if (preview && prevBuf.length) {
      smallCanvas.width = pW; smallCanvas.height = pH;
      const sctx = smallCanvas.getContext('2d');
      const img = sctx.createImageData(pW, pH);
      tonemap(prevBuf, pW, pH, img);
      sctx.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(smallCanvas, 0, 0, W, H);
    } else {
      let src = accBuf;
      if (denoiseOn && denoised && denoisedGen === gen && denoised.length === accBuf.length) {
        // по мере роста числа сэмплов доверяем «сырому» кадру всё больше
        const spp = meanSpp();
        const u = Math.min(1, Math.max(0, (spp - 48) / 2400));
        const kRaw = u * u * (3 - 2 * u) * 0.9;
        if (mixBuf.length !== accBuf.length) mixBuf = new Float32Array(accBuf.length);
        for (let i = 0; i < accBuf.length; i++) mixBuf[i] = denoised[i] + (accBuf[i] - denoised[i]) * kRaw;
        src = mixBuf;
      }
      tonemap(src, W, H, imgData);
      ctx.putImageData(imgData, 0, 0);
    }
  }

  // ---------- Интерфейс ----------
  el.scenes.innerHTML = SCENES.map((s, i) => `
    <button type="button" class="scene-btn" aria-pressed="false" data-i="${i}">
      <span class="no">${String(i + 1).padStart(2, '0')}</span>
      <span class="t">${s.title}</span>
      <span class="d">${s.desc}</span>
    </button>`).join('');
  el.scenes.addEventListener('click', (e) => {
    const b = e.target.closest('.scene-btn');
    if (b && +b.dataset.i !== sceneIdx) loadScene(+b.dataset.i);
  });

  el.mats.innerHTML = CHIPS.map((k) => `
    <button type="button" class="mat" data-k="${k}" aria-pressed="false" disabled>
      <span class="sw" style="background:${MATS[k].sw}"></span>${MATS[k].name.replace('Цветное стекло', 'Цветное')}
    </button>`).join('');
  el.mats.addEventListener('click', (e) => {
    const b = e.target.closest('.mat');
    if (!b || selected < 0) return;
    const s = sphereInfo[selected];
    s.preset = b.dataset.k;
    s.rough = MATS[s.preset].rough ?? s.rough;
    s.ior = MATS[s.preset].ior ?? s.ior;
    applyMaterial(s);
    select(selected);
    restart({ mats: true });
  });
  function applyMaterial(s) {
    packMat(mats, s.matIndex, { ...MATS[s.preset], rough: s.rough, ior: s.ior });
  }

  function select(i) {
    selected = i;
    const on = i >= 0;
    el.object.classList.toggle('off', !on);
    el.mats.querySelectorAll('.mat').forEach((b) => {
      b.disabled = !on;
      b.setAttribute('aria-pressed', String(on && b.dataset.k === sphereInfo[i].preset));
    });
    if (!on) { el.objName.textContent = 'не выбран'; el.pick.hidden = true; return; }
    const s = sphereInfo[i];
    const def = MATS[s.preset];
    el.objName.textContent = s.name;
    el.roughRow.style.display = def.type === 1 || def.type === 3 ? '' : 'none';
    el.iorRow.style.display = def.type === 2 ? '' : 'none';
    el.rough.value = s.rough; syncSlider(el.rough); el.roughOut.textContent = fmt(s.rough, 2);
    el.ior.value = s.ior; syncSlider(el.ior); el.iorOut.textContent = fmt(s.ior, 2);
  }

  function syncSlider(inp) {
    const p = ((inp.value - inp.min) / (inp.max - inp.min)) * 100;
    inp.style.setProperty('--fill', p + '%');
  }
  [el.rough, el.ior, el.exposure, el.aperture].forEach(syncSlider);

  let matTimer = 0;
  function debouncedMat() {
    clearTimeout(matTimer);
    restart({ mats: true, preview: true });
    matTimer = setTimeout(() => restart({ mats: true }), 260);
  }
  el.rough.addEventListener('input', () => {
    syncSlider(el.rough);
    el.roughOut.textContent = fmt(+el.rough.value, 2);
    if (selected < 0) return;
    sphereInfo[selected].rough = +el.rough.value;
    applyMaterial(sphereInfo[selected]);
    debouncedMat();
  });
  el.ior.addEventListener('input', () => {
    syncSlider(el.ior);
    el.iorOut.textContent = fmt(+el.ior.value, 2);
    if (selected < 0) return;
    sphereInfo[selected].ior = +el.ior.value;
    applyMaterial(sphereInfo[selected]);
    debouncedMat();
  });
  el.exposure.addEventListener('input', () => {
    syncSlider(el.exposure);
    exposure = +el.exposure.value;
    el.expOut.textContent = (exposure > 0 ? '+' : exposure < 0 ? '−' : '') + fmt(Math.abs(exposure), 1);
    dirty = true;
  });
  let apTimer = 0;
  el.aperture.addEventListener('input', () => {
    syncSlider(el.aperture);
    el.apOut.textContent = fmt(+el.aperture.value, 2);
    cam = makeCam({ ...scene.cam, pos: cam.p, focus: cam.focus, target: add(cam.p, cam.f) }, W / H);
    clearTimeout(apTimer);
    restart({ cam: true, preview: true });
    apTimer = setTimeout(() => restart({ cam: true }), 260);
  });
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

  function setPaused(p) {
    paused = p;
    el.pause.setAttribute('aria-pressed', String(p));
    el.pause.querySelector('span').textContent = p ? 'Дальше' : 'Пауза';
    if (p) elapsedFrozen = performance.now() - genStart;
    else genStart = performance.now() - elapsedFrozen;
    workers.forEach((w) => w.postMessage({ paused: p }));
  }
  el.pause.addEventListener('click', () => setPaused(!paused));
  window.addEventListener('keydown', (e) => {
    if (e.target && /INPUT|BUTTON|SELECT/.test(e.target.tagName) && e.code !== 'KeyD') return;
    if (e.code === 'Space') { e.preventDefault(); setPaused(!paused); }
    else if (e.code === 'KeyD') el.denoise.click();
    else if (/^Digit[123]$/.test(e.code)) { const i = +e.code.slice(5) - 1; if (i !== sceneIdx) loadScene(i); }
  });
  el.denoise.addEventListener('click', () => {
    denoiseOn = !denoiseOn;
    el.denoise.setAttribute('aria-pressed', String(denoiseOn));
    lastDenoiseSpp = 0;
    dirty = true;
  });
  el.restart.addEventListener('click', () => { accBuf.fill(0); restart({}); });
  el.save.addEventListener('click', () => {
    el.render.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `render-${SCENES[sceneIdx].id}-${meanSpp()}spp.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });
  });

  // ---------- Мышь: выбор, перетаскивание, вращение камеры, фокус ----------
  const drag = { mode: null, x0: 0, y0: 0, moved: 0, offset: [0, 0], planeY: 0, yaw0: 0, pitch0: 0 };
  function toRender(e) {
    const r = el.overlay.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H];
  }
  function rayPlaneY(px, py, planeY) {
    const sx = (2 * px / W - 1) * cam.tanHalf * cam.aspect;
    const sy = (1 - 2 * py / H) * cam.tanHalf;
    const d = norm([cam.f[0] + cam.r[0] * sx + cam.u[0] * sy, cam.f[1] + cam.r[1] * sx + cam.u[1] * sy, cam.f[2] + cam.r[2] * sx + cam.u[2] * sy]);
    if (Math.abs(d[1]) < 1e-6) return null;
    const t = (planeY - cam.p[1]) / d[1];
    if (t <= 0) return null;
    return [cam.p[0] + d[0] * t, cam.p[2] + d[2] * t];
  }
  el.overlay.addEventListener('pointerdown', (e) => {
    const [px, py] = toRender(e);
    const hit = core.pick(px, py, W, H);
    drag.x0 = e.clientX; drag.y0 = e.clientY; drag.moved = 0;
    drag.hit = hit;
    el.overlay.setPointerCapture(e.pointerId);
    if (hit && hit.kind === 0) {
      const s = sphereInfo[hit.idx];
      select(hit.idx);
      drag.mode = 'sphere';
      drag.planeY = s.c[1];
      const g = rayPlaneY(px, py, drag.planeY);
      drag.offset = g ? [s.c[0] - g[0], s.c[2] - g[1]] : [0, 0];
    } else if (scene.orbit) {
      drag.mode = 'orbit';
      drag.yaw0 = camOrbit.yaw; drag.pitch0 = camOrbit.pitch;
    } else {
      drag.mode = 'none';
    }
  });
  el.overlay.addEventListener('pointermove', (e) => {
    const [px, py] = toRender(e);
    if (!drag.mode) {
      const h = core.pick(px, py, W, H);
      el.overlay.classList.toggle('over-object', !!(h && h.kind === 0));
      return;
    }
    drag.moved = Math.max(drag.moved, Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0));
    if (drag.moved < 4) return;
    if (drag.mode === 'sphere' && selected >= 0) {
      const g = rayPlaneY(px, py, drag.planeY);
      if (!g) return;
      const s = sphereInfo[selected];
      const [x0, x1, z0, z1] = scene.bounds;
      s.c[0] = Math.max(x0 + s.r, Math.min(x1 - s.r, g[0] + drag.offset[0]));
      s.c[2] = Math.max(z0 + s.r, Math.min(z1 - s.r, g[1] + drag.offset[1]));
      spheres[selected * 8] = s.c[0];
      spheres[selected * 8 + 2] = s.c[2];
      el.overlay.classList.add('dragging');
      if (!interacting) interacting = true;
      restart({ spheres: true, preview: true });
    } else if (drag.mode === 'orbit') {
      camOrbit.yaw = drag.yaw0 - (e.clientX - drag.x0) * 0.006;
      camOrbit.pitch = Math.max(0.03, Math.min(1.2, drag.pitch0 + (e.clientY - drag.y0) * 0.004));
      const pos = orbitPos();
      cam = makeCam({ ...scene.cam, pos, target: camOrbit.target, focus: cam.focus }, W / H);
      el.overlay.classList.add('dragging');
      interacting = true;
      restart({ cam: true, preview: true });
    }
  });
  function endDrag() {
    if (!drag.mode) return;
    const was = drag.mode;
    const moved = drag.moved >= 4;
    drag.mode = null;
    el.overlay.classList.remove('dragging');
    if (moved && interacting) {
      interacting = false;
      restart(was === 'sphere' ? { spheres: true } : { cam: true });
      return;
    }
    // клик без перетаскивания: фокус по точке, выбор/сброс
    const hit = drag.hit;
    if (!hit) { select(-1); return; }
    if (scene.dof && cam.aperture > 0) {
      const fd = hit.t * (hit.dir[0] * cam.f[0] + hit.dir[1] * cam.f[1] + hit.dir[2] * cam.f[2]);
      cam.focus = fd;
      restart({ cam: true });
    }
    if (hit.kind !== 0) select(-1);
  }
  el.overlay.addEventListener('pointerup', endDrag);
  el.overlay.addEventListener('pointercancel', endDrag);

  // ---------- Контур выделения ----------
  const octx = el.overlay.getContext('2d');
  function project(p) {
    const d = sub(p, cam.p);
    const z = d[0] * cam.f[0] + d[1] * cam.f[1] + d[2] * cam.f[2];
    if (z <= 0) return null;
    const x = (d[0] * cam.r[0] + d[1] * cam.r[1] + d[2] * cam.r[2]) / (z * cam.tanHalf * cam.aspect);
    const y = (d[0] * cam.u[0] + d[1] * cam.u[1] + d[2] * cam.u[2]) / (z * cam.tanHalf);
    return [(x + 1) / 2, (1 - y) / 2, z];
  }
  function drawOverlay() {
    const w = el.overlay.width, h = el.overlay.height;
    octx.clearRect(0, 0, w, h);
    if (selected < 0) { el.pick.hidden = true; return; }
    const s = sphereInfo[selected];
    const c = project(s.c);
    if (!c) return;
    const rr = s.r / (c[2] * cam.tanHalf) * h / 2;
    const cx = c[0] * w, cy = c[1] * h;
    const dpr = w / el.overlay.clientWidth;
    octx.save();
    octx.strokeStyle = 'rgba(255, 159, 77, .9)';
    octx.lineWidth = 1.25 * dpr;
    octx.setLineDash([5 * dpr, 5 * dpr]);
    octx.lineDashOffset = -performance.now() / 60;
    octx.beginPath();
    octx.arc(cx, cy, rr + 6 * dpr, 0, Math.PI * 2);
    octx.stroke();
    octx.restore();
    const def = MATS[s.preset];
    const extra = def.type === 2 ? `n = ${fmt(s.ior, 2)}` : (def.type === 1 || def.type === 3) ? `шероховатость ${fmt(s.rough, 2)}` : def.type === 4 ? 'источник света' : 'диффузный';
    el.pick.innerHTML = `${s.name}<small>${def.name.toLowerCase()} · ${extra}</small>`;
    el.pick.hidden = false;
    const lx = (cx + rr + 14 * dpr) / dpr, ly = (cy - rr) / dpr;
    const fw = el.overlay.clientWidth;
    const flip = lx > fw - 190;
    el.pick.style.transform = `translate(${Math.round(flip ? (cx - rr - 14 * dpr) / dpr - 190 : lx)}px, ${Math.round(Math.max(4, ly))}px)`;
  }

  // ---------- Статистика ----------
  const sctxSpark = el.spark.getContext('2d');
  function meanSpp() {
    if (!rowSpp.length) return 0;
    let s = 0;
    for (let i = 0; i < rowSpp.length; i++) s += rowSpp[i];
    return Math.floor(s / rowSpp.length);
  }
  function raysPerSec(now) {
    while (rayLog.length && now - rayLog[0][0] > 1500) rayLog.shift();
    let s = 0;
    for (const r of rayLog) s += r[1];
    return s / 1.5;
  }
  function drawSpark() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = el.spark.clientWidth * dpr, h = el.spark.clientHeight * dpr;
    if (el.spark.width !== w) { el.spark.width = w; el.spark.height = h; }
    sctxSpark.clearRect(0, 0, w, h);
    const n = sparkHist.length;
    if (n < 2) return;
    const max = Math.max(...sparkHist, 1);
    sctxSpark.strokeStyle = 'rgba(255,255,255,.08)';
    sctxSpark.lineWidth = 1;
    for (let k = 1; k <= 3; k++) {
      const y = Math.round(h * k / 4) + 0.5;
      sctxSpark.beginPath(); sctxSpark.moveTo(0, y); sctxSpark.lineTo(w, y); sctxSpark.stroke();
    }
    const step = w / 119;
    const x0 = w - (n - 1) * step;
    sctxSpark.beginPath();
    for (let i = 0; i < n; i++) {
      const x = x0 + i * step, y = h - 3 - (sparkHist[i] / max) * (h - 8);
      if (i === 0) sctxSpark.moveTo(x, y); else sctxSpark.lineTo(x, y);
    }
    sctxSpark.strokeStyle = '#ff9f4d';
    sctxSpark.lineWidth = 1.5 * dpr;
    sctxSpark.stroke();
    sctxSpark.lineTo(w, h); sctxSpark.lineTo(x0, h); sctxSpark.closePath();
    const grad = sctxSpark.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(255,159,77,.18)');
    grad.addColorStop(1, 'rgba(255,159,77,0)');
    sctxSpark.fillStyle = grad;
    sctxSpark.fill();
  }

  let lastSpark = 0, lastStats = 0;
  function tick(now) {
    requestAnimationFrame(tick);
    if (document.hidden) return;
    const spp = meanSpp();
    if (dirty && now - lastTone > (preview ? 30 : 90)) {
      present();
      dirty = false;
      lastTone = now;
    }
    if (!paused && !preview && spp >= TARGET_SPP) setPaused(true);
    if (denoiseOn && !preview && !dBusy && spp >= 1 && spp < 3000 && spp >= lastDenoiseSpp * 1.25 + 1 && now - lastDenoise > (spp < 64 ? 700 : 1500)) {
      dBusy = true;
      lastDenoise = now;
      lastDenoiseSpp = spp;
      const color = accBuf.slice();
      dworker.postMessage({ color, W, H, gen, spp }, [color.buffer]);
    }
    if (now - lastStats > 200) {
      lastStats = now;
      const rps = paused ? 0 : raysPerSec(now);
      el.spp.textContent = spp.toLocaleString('ru-RU');
      el.sppBadge.textContent = spp.toLocaleString('ru-RU');
      el.rps.textContent = fmt(rps / 1e6, rps < 1e7 ? 2 : 1);
      const ms = paused ? elapsedFrozen : now - genStart;
      const m = Math.floor(ms / 60000), s = (ms % 60000) / 1000;
      el.elapsed.textContent = `${String(m).padStart(2, '0')}:${fmt(s, 1).padStart(4, '0')}`;
      let state = denoiseOn && spp < 2400 ? 'рендер · шумодав' : 'рендер', cls = 'live';
      if (preview) state = 'предпросмотр';
      else if (paused && spp >= TARGET_SPP) { state = 'готово'; cls = 'done'; }
      else if (paused) { state = 'пауза'; cls = ''; }
      el.state.textContent = state;
      el.stateDot.className = 'dot ' + cls;
    }
    if (now - lastSpark > 500) {
      lastSpark = now;
      sparkHist.push(paused ? 0 : raysPerSec(now) / 1e6);
      if (sparkHist.length > 120) sparkHist.shift();
      drawSpark();
    }
    drawOverlay();
  }

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const oldW = W, oldH = H;
      sizeFrame();
      if (W !== oldW || H !== oldH) {
        cam = makeCam({ ...scene.cam, pos: cam.p, target: add(cam.p, cam.f), focus: cam.focus }, W / H);
        restart({ cam: true });
      }
    }, 150);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !paused) { workers.forEach((w) => w.postMessage({ paused: true })); }
    else if (!document.hidden && !paused) { workers.forEach((w) => w.postMessage({ paused: false })); }
  });

  loadScene(0);
  requestAnimationFrame(tick);
})();
