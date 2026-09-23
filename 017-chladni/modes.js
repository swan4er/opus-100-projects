/* Фигуры Хладни — собственные моды пластины.
   Квадрат и прямоугольник: точные моды со свободным краем cos(nπx/a)·cos(mπy/b).
   Круг и дека гитары: численно — дискретный оператор Лапласа с условием Неймана на маске,
   метод Ланцоша с полной переортогонализацией, стартующий из точки возбуждения,
   и неявный QL-алгоритм для трёхдиагональной матрицы.
   SOLVER — самодостаточная функция: её текст уходит в Web Worker без изменений. */
function SOLVER() {
  'use strict';

  // Маска формы на сетке N×N в координатах пластины [0,1]²
  function inside(shape, x, y) {
    const dx = x - 0.5, dy = y - 0.5;
    switch (shape) {
      case 'square': return true;
      case 'rect': return Math.abs(dx) <= 0.36 && Math.abs(dy) <= 0.48;
      case 'circle': return dx * dx + dy * dy <= 0.48 * 0.48;
      case 'guitar': {
        // Две «деки» (нижняя шире), плавно слитые через талию, и розетка-отверстие
        const d1 = Math.hypot(dx, y - 0.66) - 0.3, d2 = Math.hypot(dx, y - 0.3) - 0.235;
        const k = 0.09, h = Math.max(0, Math.min(1, 0.5 + 0.5 * (d2 - d1) / k));
        const d = d2 * (1 - h) + d1 * h - k * h * (1 - h);
        const hole = Math.hypot(dx, y - 0.395) < 0.085;
        return d < 0 && !hole;
      }
      default: return true;
    }
  }
  function mask(shape, N) {
    const m = new Uint8Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) m[j * N + i] = inside(shape, (i + 0.5) / N, (j + 0.5) / N) ? 1 : 0;
    return m;
  }

  // Точные моды прямоугольника со свободным краем (мембранное приближение)
  function analytic(shape, N, maxModes) {
    const a = shape === 'rect' ? 0.72 : 1, b = shape === 'rect' ? 0.96 : 1;
    const x0 = (1 - a) / 2, y0 = (1 - b) / 2;
    const m = mask(shape, N);
    const list = [];
    for (let n = 0; n <= 14; n++) for (let k = 0; k <= 14; k++) {
      if (n === 0 && k === 0) continue;
      list.push({ n, m: k, lambda: Math.pow(n * Math.PI / a, 2) + Math.pow(k * Math.PI / b, 2) });
    }
    list.sort((p, q) => p.lambda - q.lambda);
    const modes = [];
    for (const md of list.slice(0, maxModes)) {
      const v = new Float32Array(N * N);
      let s = 0;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const idx = j * N + i;
        if (!m[idx]) continue;
        const x = (i + 0.5) / N - x0, y = (j + 0.5) / N - y0;
        const val = Math.cos(md.n * Math.PI * x / a) * Math.cos(md.m * Math.PI * y / b);
        v[idx] = val; s += val * val;
      }
      const inv = 1 / Math.sqrt(s);
      for (let i = 0; i < v.length; i++) v[i] *= inv;
      modes.push({ lambda: md.lambda, vec: v, label: `(${md.n}, ${md.m})` });
    }
    return { N, mask: m, modes };
  }

  // Неявный QL для симметричной трёхдиагональной матрицы. d — диагональ, e[i] — элемент между i и i+1.
  function tqli(d, e, z) {
    const n = d.length;
    for (let l = 0; l < n; l++) {
      let iter = 0, m;
      do {
        for (m = l; m < n - 1; m++) { const dd = Math.abs(d[m]) + Math.abs(d[m + 1]); if (Math.abs(e[m]) <= 1e-13 * dd) break; }
        if (m !== l) {
          if (iter++ === 80) break;
          let g = (d[l + 1] - d[l]) / (2 * e[l]);
          let r = Math.hypot(g, 1);
          g = d[m] - d[l] + e[l] / (g + (g >= 0 ? r : -r));
          let s = 1, c = 1, p = 0, i, underflow = false;
          for (i = m - 1; i >= l; i--) {
            let f = s * e[i];
            const b = c * e[i];
            e[i + 1] = (r = Math.hypot(f, g));
            if (r === 0) { d[i + 1] -= p; e[m] = 0; underflow = true; break; }
            s = f / r; c = g / r; g = d[i + 1] - p; r = (d[i] - g) * s + 2 * c * b; p = s * r; d[i + 1] = g + p; g = c * r - b;
            for (let k = 0; k < n; k++) { f = z[k][i + 1]; z[k][i + 1] = s * z[k][i] + c * f; z[k][i] = c * z[k][i] - s * f; }
          }
          if (underflow) continue;
          d[l] -= p; e[l] = g; e[m] = 0;
        }
      } while (m !== l);
    }
  }

  // Ланцош для дискретного лапласиана на маске, старт — дельта в точке возбуждения
  function numeric(shape, N, maxModes, drive) {
    const m = mask(shape, N);
    const cells = [];
    const index = new Int32Array(N * N).fill(-1);
    for (let i = 0; i < N * N; i++) if (m[i]) { index[i] = cells.length; cells.push(i); }
    const n = cells.length;
    const nb = new Int32Array(n * 4).fill(-1);
    for (let c = 0; c < n; c++) {
      const g = cells[c], x = g % N, y = (g / N) | 0;
      if (x > 0) nb[c * 4] = index[g - 1];
      if (x < N - 1) nb[c * 4 + 1] = index[g + 1];
      if (y > 0) nb[c * 4 + 2] = index[g - N];
      if (y < N - 1) nb[c * 4 + 3] = index[g + N];
    }
    const h2 = N * N; // перевод в непрерывные единицы: λ = λ_сетки / h²
    // Сдвиг с обращением: A = L + εI, ленточное разложение Холецкого, Ланцош по A⁻¹ —
    // нижние моды L становятся верхними у A⁻¹ и сходятся первыми.
    const EPS = 2;
    let bw = 1;
    for (let c = 0; c < n; c++) for (let k = 0; k < 4; k++) { const q2 = nb[c * 4 + k]; if (q2 >= 0) bw = Math.max(bw, Math.abs(q2 - c)); }
    const W1 = bw + 1;
    const Lb = new Float64Array(n * W1);                  // Lb[i*W1 + (j - i + bw)] = L[i][j], j ∈ [i-bw, i]
    const A = (i, j) => {
      if (i === j) { let deg = 0; for (let k = 0; k < 4; k++) if (nb[i * 4 + k] >= 0) deg++; return deg * h2 + EPS; }
      for (let k = 0; k < 4; k++) if (nb[i * 4 + k] === j) return -h2;
      return 0;
    };
    for (let i = 0; i < n; i++) {
      const j0 = Math.max(0, i - bw);
      for (let j = j0; j <= i; j++) {
        let sum = A(i, j);
        const k0 = Math.max(j0, j - bw);
        for (let k = k0; k < j; k++) sum -= Lb[i * W1 + (k - i + bw)] * Lb[j * W1 + (k - j + bw)];
        if (i === j) Lb[i * W1 + bw] = Math.sqrt(Math.max(sum, 1e-12));
        else Lb[i * W1 + (j - i + bw)] = sum / Lb[j * W1 + bw];
      }
    }
    const tmp = new Float64Array(n);
    const solve = (b, x) => {
      for (let i = 0; i < n; i++) { let sum = b[i]; const j0 = Math.max(0, i - bw); for (let j = j0; j < i; j++) sum -= Lb[i * W1 + (j - i + bw)] * tmp[j]; tmp[i] = sum / Lb[i * W1 + bw]; }
      for (let i = n - 1; i >= 0; i--) { let sum = tmp[i]; const j1 = Math.min(n - 1, i + bw); for (let j = i + 1; j <= j1; j++) sum -= Lb[j * W1 + (i - j + bw)] * x[j]; x[i] = sum / Lb[i * W1 + bw]; }
    };
    // Стартовый вектор: точка возбуждения, слегка размытая
    let q = new Float64Array(n);
    const dx = Math.min(N - 1, Math.max(0, Math.round(drive[0] * N - 0.5))), dy = Math.min(N - 1, Math.max(0, Math.round(drive[1] * N - 0.5)));
    let best = -1, bestD = 1e9;
    for (let c = 0; c < n; c++) { const g = cells[c]; const d2 = (g % N - dx) ** 2 + (((g / N) | 0) - dy) ** 2; if (d2 < bestD) { bestD = d2; best = c; } }
    const bx = cells[best] % N, by = (cells[best] / N) | 0;
    for (let c = 0; c < n; c++) { const g = cells[c]; const d2 = (g % N - bx) ** 2 + (((g / N) | 0) - by) ** 2; q[c] = Math.exp(-d2 / 1.5); }
    let norm = 0; for (let c = 0; c < n; c++) norm += q[c] * q[c]; norm = Math.sqrt(norm); for (let c = 0; c < n; c++) q[c] /= norm;
    const steps = Math.min(n - 1, maxModes * 2 + 30);
    const Q = [], alpha = [], beta = [];
    const w = new Float64Array(n);
    for (let j = 0; j < steps; j++) {
      Q.push(q);
      solve(q, w);
      let a = 0; for (let c = 0; c < n; c++) a += w[c] * q[c];
      alpha.push(a);
      for (let c = 0; c < n; c++) w[c] -= a * q[c] + (j > 0 ? beta[j - 1] * Q[j - 1][c] : 0);
      for (const qi of Q) { let dot = 0; for (let c = 0; c < n; c++) dot += w[c] * qi[c]; for (let c = 0; c < n; c++) w[c] -= dot * qi[c]; }
      let b = 0; for (let c = 0; c < n; c++) b += w[c] * w[c]; b = Math.sqrt(b);
      if (b < 1e-14) break;
      beta.push(b);
      q = new Float64Array(n); for (let c = 0; c < n; c++) q[c] = w[c] / b;
    }
    const mSteps = alpha.length;
    const d = Float64Array.from(alpha), e = new Float64Array(mSteps);
    for (let i = 0; i < mSteps - 1; i++) e[i] = beta[i];
    const z = []; for (let i = 0; i < mSteps; i++) { const row = new Float64Array(mSteps); row[i] = 1; z.push(row); }
    tqli(d, e, z);
    // Собственные числа A⁻¹: θ = 1/(λ+ε). Большие θ — нижние моды.
    const order = [...d.keys()].sort((a, b) => d[b] - d[a]);
    const modes = [];
    const lastBeta = beta[mSteps - 1] || 0;
    for (const k of order) {
      const theta = d[k];
      if (theta <= 0) continue;
      const lambda = 1 / theta - EPS;
      if (lambda < 0.5) continue;                           // постоянная мода
      const resid = Math.abs(lastBeta * z[mSteps - 1][k]);
      if (resid > 1e-4 * theta) continue;                   // не сошлась
      const vec = new Float32Array(N * N);
      let s = 0;
      for (let c = 0; c < n; c++) { let v = 0; for (let j = 0; j < mSteps; j++) v += Q[j][c] * z[j][k]; vec[cells[c]] = v; s += v * v; }
      const inv = 1 / Math.sqrt(s); for (let c = 0; c < n; c++) vec[cells[c]] *= inv;
      modes.push({ lambda, vec, label: '' });
      if (modes.length >= maxModes) break;
    }
    return { N, mask: m, modes };
  }

  function compute(req) {
    if (req.shape === 'square' || req.shape === 'rect') return analytic(req.shape, req.N, req.maxModes);
    return numeric(req.shape, req.N, req.maxModes, req.drive);
  }
  return { compute, inside, mask };
}
