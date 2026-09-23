(() => {
'use strict';

/* ================================================================
   Неравенство из ничего — модель «гаражной распродажи».
   Тысяча агентов, у всех поровну. Каждый день каждый заключает
   сделку со случайным партнёром: на кону доля богатства более
   бедного, победителя решает честная монета. Налог χ возвращает
   всех к среднему, ζ — «преимущество богатства» (монета чуть
   подкручена в пользу богатого), как в работах Б. Богошяна.
   ================================================================ */

const $ = (s) => document.querySelector(s);
const SHOT = !!window.__SHOT__;
const N = 1000, START = 100;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const nfp = (v, d = 1) => v.toLocaleString('ru-RU', { maximumFractionDigits: d, minimumFractionDigits: d });
const nfi = (v) => Math.round(v).toLocaleString('ru-RU');
// 1 монета, 2 монеты, 5 монет
function coins(v) {
  const n = Math.round(v), a = n % 100, b = n % 10;
  const word = a > 10 && a < 20 ? 'монет' : b === 1 ? 'монета' : b > 1 && b < 5 ? 'монеты' : 'монет';
  return `${nfi(n)}\u00A0${word}`;
}

/* ---------- Случайность ---------- */
let seedA = 20190101;
function rnd() { seedA = (seedA + 0x6D2B79F5) | 0; let t = Math.imul(seedA ^ (seedA >>> 15), 1 | seedA); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }

/* ---------- Модель ---------- */
const w = new Float64Array(N);
const P = { f: 0.2, chi: 0, zeta: 0, speed: 60, running: true };
let day = 0, trades = 0, dayFrac = 0;
const history = [];     // индекс Джини по дням
function reset() {
  w.fill(START);
  day = 0; trades = 0; dayFrac = 0;
  history.length = 0;
  history.push(0);
  // радиусы не сбрасываем: круги сами плавно сдуются и подрастут до равных
}
function oneDay() {
  const mean = START;
  const { f, zeta } = P;
  for (let k = 0; k < N; k++) {
    const i = (rnd() * N) | 0;
    let j = (rnd() * (N - 1)) | 0;
    if (j >= i) j++;
    const dw = f * Math.min(w[i], w[j]);
    const bias = zeta ? clamp((zeta * (w[i] - w[j])) / mean, -0.5, 0.5) : 0;
    if (rnd() < 0.5 + bias) { w[i] += dw; w[j] -= dw; } else { w[i] -= dw; w[j] += dw; }
  }
  if (P.chi) for (let i = 0; i < N; i++) w[i] += P.chi * (mean - w[i]);
  trades += N;
  day++;
}

/* ---------- Статистика ---------- */
const order = new Uint16Array(N).map((_, i) => i);   // индексы от беднейшего к богатейшему
const rankOf = new Uint16Array(N);                    // место в этом порядке
const stats = { gini: 0, top1: 0, top10: 0, bottom50: 0, max: 0, richest: 0 };
function computeStats() {
  const idx = Array.from(order).sort((a, b) => w[a] - w[b]);
  for (let i = 0; i < N; i++) { order[i] = idx[i]; rankOf[idx[i]] = i; }
  let cum = 0, g = 0;
  for (let i = 0; i < N; i++) { const v = w[order[i]]; cum += v; g += (i + 1) * v; }
  stats.gini = (2 * g) / (N * cum) - (N + 1) / N;
  let top1 = 0, top10 = 0, bot = 0;
  for (let i = N - 10; i < N; i++) top1 += w[order[i]];
  for (let i = N - 100; i < N; i++) top10 += w[order[i]];
  for (let i = 0; i < N / 2; i++) bot += w[order[i]];
  stats.top1 = top1 / cum; stats.top10 = top10 / cum; stats.bottom50 = bot / cum;
  stats.richest = order[N - 1];
  stats.max = w[stats.richest] / cum;
  stats.total = cum;
}

/* ================================================================
   Поле агентов
   ================================================================ */
const field = $('#field'), fg = field.getContext('2d');
let FW = 0, FH = 0, DPR = 1, cols = 40, rows = 25, cell = 10;
const disp = new Float32Array(N);                        // показанный радиус (плавно догоняет богатство)
const px = new Float32Array(N), py = new Float32Array(N); // где круг сейчас
const hx = new Float32Array(N), hy = new Float32Array(N); // «дом» агента на сетке
const COL = { rich: '#E4322B', mid: '#1C1A17', base: '#8C98AA', paper: '#F5F0E6' };
// Площадь круга пропорциональна богатству, поэтому суммарная «краска» на поле постоянна.
function radiusOf(v) { return cell * 0.42 * Math.sqrt(Math.max(v, 0) / START); }
function resizeField() {
  const r = field.getBoundingClientRect();
  DPR = SHOT ? 1 : Math.min(window.devicePixelRatio || 1, 2);
  FW = field.width = Math.round(r.width * DPR);
  FH = field.height = Math.round(r.height * DPR);
  const aspect = FW / FH;
  cols = Math.max(10, Math.round(Math.sqrt(N * aspect)));
  rows = Math.ceil(N / cols);
  cell = Math.min(FW / cols, FH / rows);
  const ox = (FW - cell * cols) / 2 + cell / 2, oy = (FH - cell * rows) / 2 + cell / 2;
  for (let i = 0; i < N; i++) {
    hx[i] = ox + (i % cols) * cell; hy[i] = oy + Math.floor(i / cols) * cell;
    px[i] = hx[i]; py[i] = hy[i];
    disp[i] = radiusOf(w[i]);
  }
  for (let k = 0; k < 60; k++) relax();
}

/* ---------- Упаковка без наложений ----------
   Каждый круг пружиной тянется к своему дому, а соседи расталкивают его.
   Пары ищутся «метёлкой»: круги отсортированы по левому краю, и проверка
   идёт только до тех, чей левый край дальше правого края текущего. */
const act = new Uint16Array(N);
function relax() {
  const gap = 1.1 * DPR, edge = 2 * DPR;
  for (let i = 0; i < N; i++) { px[i] += (hx[i] - px[i]) * 0.05; py[i] += (hy[i] - py[i]) * 0.05; }
  let m = 0;
  for (let i = 0; i < N; i++) if (disp[i] > 0.6 * DPR) act[m++] = i;
  const list = act.subarray(0, m);
  for (let it = 0; it < 3; it++) {
    list.sort((a, b) => (px[a] - disp[a]) - (px[b] - disp[b]));
    for (let s = 0; s < m; s++) {
      const a = list[s], ra = disp[a], right = px[a] + ra + gap;
      for (let t = s + 1; t < m; t++) {
        const b = list[t], rb = disp[b];
        if (px[b] - rb > right) break;
        let dx = px[b] - px[a], dy = py[b] - py[a];
        const min = ra + rb + gap, d2 = dx * dx + dy * dy;
        if (d2 >= min * min) continue;
        if (d2 < 1e-6) { dx = ((a * 7) % 5) - 2 + 0.3; dy = ((b * 3) % 5) - 2 + 0.1; }
        const d = Math.sqrt(dx * dx + dy * dy), push = (min - d) / d;
        // крупный круг сдвигается меньше: доли обратно пропорциональны площади
        const aa = ra * ra, bb = rb * rb, wa = bb / (aa + bb), wb = aa / (aa + bb);
        px[a] -= dx * push * wa; py[a] -= dy * push * wa;
        px[b] += dx * push * wb; py[b] += dy * push * wb;
      }
    }
    for (let s = 0; s < m; s++) {
      const i = list[s], r = disp[i] + edge;
      px[i] = r * 2 > FW ? FW / 2 : clamp(px[i], r, FW - r);
      py[i] = r * 2 > FH ? FH / 2 : clamp(py[i], r, FH - r);
    }
  }
}

let hover = -1;
function drawField() {
  for (let i = 0; i < N; i++) disp[i] += (radiusOf(w[i]) - disp[i]) * 0.25;
  relax();
  fg.clearRect(0, 0, FW, FH);
  // сперва мелкие, крупные — поверх
  for (let k = 0; k < N; k++) {
    const i = order[k], r = disp[i];
    if (r < 0.25 * DPR) continue;
    fg.fillStyle = k >= N - 10 ? COL.rich : k >= N - 100 ? COL.mid : COL.base;
    fg.globalAlpha = k >= N - 100 ? 1 : 0.8;
    fg.beginPath();
    fg.arc(px[i], py[i], r, 0, Math.PI * 2);
    fg.fill();
  }
  fg.globalAlpha = 1;
  // подпись самого богатого
  const ri = stats.richest, rx = px[ri], ry = py[ri], rr = disp[ri];
  if (day > 0 && rr > cell * 0.8) {
    fg.font = `600 ${13 * DPR}px "Golos Text", sans-serif`;
    const t1 = `Самый богатый: № ${ri + 1}`, t2 = `${nfp(stats.max * 100)} % всех денег`;
    const tw = Math.max(fg.measureText(t1).width, fg.measureText(t2).width) + 16 * DPR, th = 42 * DPR;
    // подпись — с той стороны круга, где больше места
    const toLeft = rx > FW * 0.62, toDown = ry < FH * 0.3;
    const ax = rx + (toLeft ? -1 : 1) * rr * 0.71, ay = ry + (toDown ? 1 : -1) * rr * 0.71;
    const bx = clamp(ax + (toLeft ? -(tw + 16 * DPR) : 16 * DPR), 4 * DPR, FW - tw - 4 * DPR);
    const by = clamp(ay + (toDown ? 12 * DPR : -(th + 12 * DPR)), 4 * DPR, FH - th - 4 * DPR);
    fg.strokeStyle = COL.mid; fg.lineWidth = 1.2 * DPR;
    fg.beginPath(); fg.moveTo(ax, ay); fg.lineTo(toLeft ? bx + tw : bx, by + th / 2); fg.stroke();
    fg.fillStyle = COL.paper; fg.fillRect(bx, by, tw, th);
    fg.strokeRect(bx + 0.5, by + 0.5, tw - 1, th - 1);
    fg.fillStyle = COL.mid; fg.fillText(t1, bx + 8 * DPR, by + 17 * DPR);
    fg.fillStyle = '#C0241E'; fg.fillText(t2, bx + 8 * DPR, by + 34 * DPR);
  }
  if (hover >= 0) {
    fg.strokeStyle = COL.mid; fg.lineWidth = 2 * DPR;
    fg.beginPath(); fg.arc(px[hover], py[hover], Math.max(disp[hover], 3 * DPR) + 3 * DPR, 0, Math.PI * 2); fg.stroke();
  }
}

/* ---------- Кривая Лоренца ---------- */
const lor = $('#lorenz'), lgc = lor.getContext('2d');
function drawLorenz() {
  const r = lor.getBoundingClientRect(), d = SHOT ? 1.5 : Math.min(devicePixelRatio || 1, 2);
  const W = (lor.width = Math.round(r.width * d)), H = (lor.height = Math.round(r.height * d));
  // шкалы: по x — доля людей (от беднейших), по y — доля всех денег
  const x0 = 22 * d, y0 = H - 22 * d, sx = W - x0 - 4 * d, sy = y0 - 6 * d;
  lgc.clearRect(0, 0, W, H);
  lgc.strokeStyle = 'rgba(28,26,23,.16)'; lgc.lineWidth = d;
  for (let k = 0; k <= 4; k++) { lgc.beginPath(); lgc.moveTo(x0, y0 - (sy * k) / 4); lgc.lineTo(x0 + sx, y0 - (sy * k) / 4); lgc.stroke(); }
  // линия равенства
  lgc.setLineDash([4 * d, 4 * d]); lgc.strokeStyle = 'rgba(28,26,23,.55)';
  lgc.beginPath(); lgc.moveTo(x0, y0); lgc.lineTo(x0 + sx, y0 - sy); lgc.stroke(); lgc.setLineDash([]);
  // кривая
  let cum = 0;
  const pts = [[x0, y0]];
  for (let i = 0; i < N; i++) { cum += w[order[i]]; if (i % 5 === 4 || i === N - 1) pts.push([x0 + (sx * (i + 1)) / N, y0 - (sy * cum) / stats.total]); }
  lgc.beginPath(); lgc.moveTo(x0, y0);
  for (const [x, y] of pts) lgc.lineTo(x, y);
  lgc.lineTo(x0 + sx, y0 - sy); lgc.closePath();
  lgc.fillStyle = 'rgba(228,50,43,.14)'; lgc.fill();
  lgc.beginPath(); pts.forEach(([x, y], i) => (i ? lgc.lineTo(x, y) : lgc.moveTo(x, y)));
  lgc.strokeStyle = COL.rich; lgc.lineWidth = 2.4 * d; lgc.lineJoin = 'round'; lgc.stroke();
  lgc.fillStyle = '#5F584E'; lgc.font = `${11.5 * d}px "Golos Text", sans-serif`;
  lgc.textAlign = 'left'; lgc.fillText('люди: от беднейших →', x0, H - 6 * d);
  lgc.save(); lgc.translate(13 * d, y0); lgc.rotate(-Math.PI / 2); lgc.fillText('доля денег', 0, 0); lgc.restore();
}
/* ---------- Джини во времени ---------- */
const spk = $('#spark'), sg = spk.getContext('2d');
function drawSpark() {
  const r = spk.getBoundingClientRect(), d = SHOT ? 1.5 : Math.min(devicePixelRatio || 1, 2);
  const W = (spk.width = Math.round(r.width * d)), H = (spk.height = Math.round(r.height * d));
  sg.clearRect(0, 0, W, H);
  const n = history.length, top = 8 * d, bot = 6 * d, left = 24 * d, pw = W - left - 6 * d;
  const Y = (v) => H - bot - v * (H - top - bot);
  sg.strokeStyle = 'rgba(28,26,23,.14)'; sg.lineWidth = d;
  sg.fillStyle = '#5F584E'; sg.font = `${11.5 * d}px "Golos Text", sans-serif`; sg.textBaseline = 'middle';
  for (const v of [0, 0.5, 1]) {
    sg.beginPath(); sg.moveTo(left, Y(v)); sg.lineTo(W, Y(v)); sg.stroke();
    sg.fillText(v === 0.5 ? '0,5' : String(v), 0, Y(v));
  }
  if (n < 2) return;
  const maxN = Math.max(200, n);
  sg.beginPath();
  for (let i = 0; i < n; i++) { const x = left + (i / maxN) * pw, y = Y(history[i]); i ? sg.lineTo(x, y) : sg.moveTo(x, y); }
  sg.strokeStyle = COL.mid; sg.lineWidth = 2 * d; sg.lineJoin = 'round'; sg.stroke();
  const lx = left + ((n - 1) / maxN) * pw, ly = Y(history[n - 1]);
  sg.fillStyle = COL.rich; sg.beginPath(); sg.arc(lx, ly, 3.5 * d, 0, Math.PI * 2); sg.fill();
}

/* ================================================================
   Интерфейс
   ================================================================ */
const ui = {
  gini: $('#gini'), top1: $('#top1'), bot50: $('#bot50'), day: $('#day'), trades: $('#trades'), play: $('#play'), reset: $('#reset'),
  speed: $('#speed'), f: $('#f'), chi: $('#chi'), zeta: $('#zeta'), fV: $('#fV'), chiV: $('#chiV'), zetaV: $('#zetaV'), presets: $('#presets'),
  tip: $('#tip'), verdict: $('#verdict'),
};
// Пороги сверены прогонами модели: частичная олигархия появляется, когда перекос ζ больше налога χ.
function verdict() {
  const g = stats.gini, t1 = `${nfp(stats.top1 * 100, 0)} %`;
  if (day < 3) return 'Все начинают поровну: по 100 монет.';
  if (P.chi === 0 && P.zeta === 0) {
    if (g < 0.5) return 'Монета честная, но разрыв уже растёт.';
    if (g < 0.85) return 'Большинство беднеет: проигрыш бьёт по бедному сильнее, чем выигрыш помогает.';
    return 'Богатство стекается к немногим — и так будет продолжаться, пока всё не окажется у одного.';
  }
  if (P.chi === 0) return `Без налога перекос монеты разгоняет концентрацию: у 1 % самых богатых уже ${t1} всех денег.`;
  if (P.zeta > P.chi) return `Перекос сильнее налога — частичная олигархия: 1 % самых богатых держит ${t1} всех денег.`;
  return 'Налог держит систему в равновесии: неравенство есть, но оно перестаёт расти.';
}
let uiAt = 0;
function updateUI(now) {
  if (now - uiAt < 120) return;
  uiAt = now;
  ui.gini.textContent = nfp(stats.gini, 2);
  ui.top1.textContent = `${nfp(stats.top1 * 100)} %`;
  ui.bot50.textContent = `${nfp(stats.bottom50 * 100)} %`;
  ui.day.textContent = nfi(day);
  ui.trades.textContent = trades >= 1e6 ? `${nfp(trades / 1e6)} млн` : nfi(trades);
  ui.verdict.textContent = verdict();
  document.documentElement.style.setProperty('--g', stats.gini.toFixed(3));
  drawLorenz();
  drawSpark();
}
function setSlider(el, v) { el.value = v; el.style.setProperty('--p', ((v - el.min) / (el.max - el.min)).toFixed(3)); }
function readSliders() {
  P.f = +ui.f.value / 100; P.chi = +ui.chi.value / 100; P.zeta = +ui.zeta.value / 100;
  ui.fV.textContent = `${nfi(P.f * 100)} %`;
  ui.chiV.textContent = P.chi ? `${nfp(P.chi * 100)} % в день` : 'нет';
  ui.zetaV.textContent = P.zeta ? nfp(P.zeta, 2) : 'нет';
  for (const el of [ui.f, ui.chi, ui.zeta]) el.style.setProperty('--p', ((el.value - el.min) / (el.max - el.min)).toFixed(3));
}
[ui.f, ui.chi, ui.zeta].forEach((el) => el.addEventListener('input', () => { readSliders(); markPreset(); }));
const PRESETS = {
  fair: { f: 20, chi: 0, zeta: 0 },
  tax: { f: 20, chi: 1, zeta: 0 },
  rigged: { f: 20, chi: 1, zeta: 5 },
};
function markPreset() {
  const cur = { f: +ui.f.value, chi: +ui.chi.value, zeta: +ui.zeta.value };
  ui.presets.querySelectorAll('[data-p]').forEach((b) => { const p = PRESETS[b.dataset.p]; b.setAttribute('aria-pressed', String(p.f === cur.f && p.chi === cur.chi && p.zeta === cur.zeta)); });
}
ui.presets.addEventListener('click', (e) => {
  const b = e.target.closest('[data-p]');
  if (!b) return;
  const p = PRESETS[b.dataset.p];
  setSlider(ui.f, p.f); setSlider(ui.chi, p.chi); setSlider(ui.zeta, p.zeta);
  readSliders(); markPreset();
  reset(); computeStats(); setRunning(true);
});
function setRunning(on) {
  P.running = on;
  ui.play.setAttribute('aria-pressed', String(on));
  ui.play.querySelector('span').textContent = on ? 'Пауза' : 'Дальше';
}
ui.play.addEventListener('click', () => setRunning(!P.running));
ui.reset.addEventListener('click', () => { reset(); computeStats(); setRunning(true); });
ui.speed.addEventListener('click', (e) => {
  const b = e.target.closest('[data-s]');
  if (!b) return;
  P.speed = +b.dataset.s;
  ui.speed.querySelectorAll('[data-s]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
});
document.addEventListener('keydown', (e) => {
  if (e.target.matches('input')) return;
  if (e.code === 'Space') { e.preventDefault(); setRunning(!P.running); }
  else if (e.key === 'r' || e.key === 'к') ui.reset.click();
});
function probe(e) {
  const r = field.getBoundingClientRect();
  const x = (e.clientX - r.left) * DPR, y = (e.clientY - r.top) * DPR;
  // круг под курсором (крупные лежат сверху), иначе — ближайший в пределах клетки
  let best = -1, bestD = cell * 0.9;
  for (let k = N - 1; k >= 0; k--) {
    const i = order[k], d = Math.hypot(px[i] - x, py[i] - y);
    if (d < disp[i]) { best = i; break; }
    if (d < bestD) { bestD = d; best = i; }
  }
  hover = best;
  if (best >= 0) {
    const rank = N - rankOf[best];
    ui.tip.innerHTML = `<b>№ ${best + 1}</b> · ${coins(w[best])}<br>${nfp((w[best] / stats.total) * 100, 2)} % всего · ${rank}-й по богатству`;
    const tx = Math.min(e.clientX - r.left + 14, r.width - 230);
    ui.tip.style.transform = `translate(${tx}px, ${e.clientY - r.top + 14}px)`;
    ui.tip.hidden = false;
  } else ui.tip.hidden = true;
}
let tipTimer = 0;
field.addEventListener('pointermove', probe);
field.addEventListener('pointerdown', (e) => {   // на телефоне подсказка появляется по тапу и гаснет сама
  probe(e);
  clearTimeout(tipTimer);
  if (e.pointerType !== 'mouse') tipTimer = setTimeout(() => { hover = -1; ui.tip.hidden = true; }, 2500);
});
field.addEventListener('pointerleave', () => { hover = -1; ui.tip.hidden = true; });

/* ---------- Цикл ---------- */
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (document.hidden) return;
  if (P.running) {
    dayFrac += dt * P.speed;
    let n = Math.floor(dayFrac);
    dayFrac -= n;
    n = Math.min(n, 400);
    for (let k = 0; k < n; k++) {
      oneDay();
      if (day % 2 === 0) { computeStats(); history.push(stats.gini); }
    }
    if (n) computeStats();
  }
  drawField();
  updateUI(now);
}

/* ---------- Старт ---------- */
readSliders();
markPreset();
resizeField();
reset();
if (SHOT) { for (let k = 0; k < 140; k++) { oneDay(); if (day % 2 === 0) { computeStats(); history.push(stats.gini); } } }
computeStats();
for (let i = 0; i < N; i++) disp[i] = radiusOf(w[i]);
for (let k = 0; k < 80; k++) relax();
window.addEventListener('resize', () => { resizeField(); uiAt = 0; });
document.fonts && document.fonts.ready.then(() => { uiAt = 0; });
requestAnimationFrame(frame);
})();
