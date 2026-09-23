/* Табло: перекидной дисплей на canvas, вокзал, часы, своё сообщение, щелчки. */
(() => {
'use strict';

const $ = (id) => document.getElementById(id);
const NB = ' ';
const SHOT = !!window.__SHOT__;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ═══ Барабаны символов ═══════════════════════════════════════ */
const FULL = ' АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ0123456789.,:;-—/()«»!?+%№\'*';
const DIGITS = '0123456789';
const LAT = { A: 'А', B: 'Б', C: 'Ц', D: 'Д', E: 'Е', F: 'Ф', G: 'Г', H: 'Х', I: 'И', J: 'Ж', K: 'К', L: 'Л', M: 'М', N: 'Н', O: 'О', P: 'П', Q: 'К', R: 'Р', S: 'С', T: 'Т', U: 'У', V: 'В', W: 'В', X: 'КС', Y: 'Й', Z: 'З' };
const norm = (s) => s.toUpperCase().replace(/[A-Z]/g, (c) => LAT[c]).replace(/[–]/g, '-').replace(/"/g, '«').replace(/\s+/g, ' ');

const COLORS = { w: '#f1ede2', y: '#ffc93c', r: '#ff5a45' };

/* ═══ Раскладки режимов ═══════════════════════════════════════ */
const narrow = () => innerWidth < 760;
let mode = 'station';
let cols = 44, rows = 9, cells = [];
let cw = 30, chh = 44, gx = 3, gy = 6, headGap = 0, dpr = 1;
const canvas = $('board');
const ctx = canvas.getContext('2d');

function makeCells(c, r, drumOf) {
  cols = c; rows = r;
  cells = [];
  for (let y = 0; y < r; y++) for (let x = 0; x < c; x++) {
    const drum = drumOf ? drumOf(x, y) : FULL;
    cells.push({ x, y, drum, cur: 0, target: 0, color: 'w', flipping: false, t0: 0, dur: 60, next: 0, dirty: true });
  }
}
const cellAt = (x, y) => cells[y * cols + x];

// Колонки вокзального табло
const ST_WIDE = [
  { key: 'time', w: 5, t: 'Время' }, { gap: 1 }, { key: 'num', w: 4, t: 'Поезд' }, { gap: 1 },
  { key: 'dest', w: 18, t: 'Направление' }, { gap: 1 }, { key: 'track', w: 2, t: 'Путь' }, { gap: 1 }, { key: 'note', w: 11, t: 'Примечание' },
];
const ST_NARROW = [{ key: 'time', w: 5, t: 'Время' }, { gap: 1 }, { key: 'dest', w: 12, t: 'Куда' }, { gap: 1 }, { key: 'track', w: 2, t: 'Путь' }];
let layoutCols = ST_WIDE;

function colStart(key) {
  let x = 0;
  for (const c of layoutCols) { if (c.key === key) return x; x += c.w || c.gap; }
  return -1;
}

function buildMode() {
  if (mode === 'station') {
    layoutCols = narrow() ? ST_NARROW : ST_WIDE;
    const c = layoutCols.reduce((s, k) => s + (k.w || k.gap), 0);
    const tx = colStart('time'), trk = colStart('track');
    makeCells(c, narrow() ? 10 : 9, (x, y) => {
      if (y === 0) return x >= c - 5 && x !== c - 3 ? DIGITS : FULL;
      if (x >= tx && x < tx + 5 && x !== tx + 2) return DIGITS;
      if (x >= trk && x < trk + 2) return ' 0123456789';
      return FULL;
    });
  } else if (mode === 'clock') {
    makeCells(10, 2, (x, y) => (y === 0 && [1, 2, 4, 5, 7, 8].includes(x) ? DIGITS : FULL));
  } else {
    makeCells(narrow() ? 12 : 22, narrow() ? 7 : 5);
  }
  layout();
}

function layout() {
  const stage = $('stage').getBoundingClientRect();
  const availW = Math.min(stage.width, 1500) - (narrow() ? 28 : 56);
  const availH = (narrow() ? innerHeight * 0.62 : stage.height) - 60;
  const aspect = mode === 'clock' ? 1.42 : 1.48;
  gx = mode === 'clock' ? 10 : Math.max(2, Math.round(availW / cols * 0.09));
  headGap = mode === 'station' ? (narrow() ? 26 : 34) : 0;
  let w = (availW - gx * (cols - 1)) / cols;
  gy = Math.round(w * (mode === 'clock' ? 0.3 : 0.16));
  let h = w * aspect;
  const needH = rows * h + (rows - 1) * gy + headGap;
  if (needH > availH) { const k = availH / needH; w *= k; h *= k; gy = Math.round(gy * k); }
  cw = Math.floor(w); chh = Math.floor(h);
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = cols * cw + (cols - 1) * gx, H = rows * chh + (rows - 1) * gy + headGap;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  tiles.clear();
  cells.forEach((c) => (c.dirty = true));
  paintLegend();
}
const colX = (x) => x * (cw + gx);
const rowY = (y) => y * (chh + gy) + (y >= 1 ? headGap : 0);

function paintLegend() {
  const lg = $('legend');
  lg.innerHTML = '';
  if (mode !== 'station') return;
  const frame = $('frame');
  const pad = parseFloat(getComputedStyle(frame).paddingLeft);
  for (const c of layoutCols) if (c.key) {
    const s = document.createElement('span');
    s.textContent = c.t;
    s.style.left = pad + colX(colStart(c.key)) + 'px';
    s.style.top = pad + rowY(1) + 'px';
    lg.appendChild(s);
  }
}

/* ═══ Плитки символов ═════════════════════════════════════════ */
const tiles = new Map();
function tile(ch, color) {
  const key = ch + '|' + color;
  let t = tiles.get(key);
  if (t) return t;
  t = document.createElement('canvas');
  const W = Math.round(cw * dpr), H = Math.round(chh * dpr);
  t.width = W; t.height = H;
  const c = t.getContext('2d');
  const r = Math.max(2, W * 0.08), half = H / 2;
  const rr = (x, y, w, h, rad) => { c.beginPath(); c.moveTo(x + rad, y); c.arcTo(x + w, y, x + w, y + h, rad); c.arcTo(x + w, y + h, x, y + h, rad); c.arcTo(x, y + h, x, y, rad); c.arcTo(x, y, x + w, y, rad); c.closePath(); };
  // верхняя и нижняя половины флажка
  let g = c.createLinearGradient(0, 0, 0, half);
  g.addColorStop(0, '#2a2a2d'); g.addColorStop(1, '#1d1d20');
  c.fillStyle = g; rr(0, 0, W, half - dpr * 0.5, r); c.fill();
  g = c.createLinearGradient(0, half, 0, H);
  g.addColorStop(0, '#1b1b1d'); g.addColorStop(1, '#131315');
  c.fillStyle = g; rr(0, half + dpr * 0.5, W, half - dpr * 0.5, r); c.fill();
  c.fillStyle = 'rgba(255,255,255,.06)'; c.fillRect(r, dpr * 0.6, W - 2 * r, dpr);
  // символ
  if (ch !== ' ') {
    c.fillStyle = COLORS[color] || COLORS.w;
    c.font = `700 ${Math.round(H * 0.8)}px 'PT Sans Narrow', 'Arial Narrow', sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(ch, W / 2, H * 0.535);
  }
  // шов и оси
  c.fillStyle = '#040405'; c.fillRect(0, half - dpr * 0.6, W, dpr * 1.2);
  c.fillStyle = 'rgba(255,255,255,.05)'; c.fillRect(0, half + dpr * 0.6, W, dpr * 0.8);
  c.fillStyle = '#070708'; c.fillRect(0, half - dpr * 2, dpr * 1.6, dpr * 4); c.fillRect(W - dpr * 1.6, half - dpr * 2, dpr * 1.6, dpr * 4);
  tiles.set(key, t);
  return t;
}

/* ═══ Анимация флажков ════════════════════════════════════════ */
let flips = 0, moving = 0;
function setText(x0, y, text, color = 'w', width = null, delay = 0) {
  const w = width || text.length;
  const s = norm(text).padEnd(w, ' ').slice(0, w);
  for (let i = 0; i < w; i++) {
    const c = cellAt(x0 + i, y);
    if (!c) continue;
    let idx = c.drum.indexOf(s[i]);
    if (idx < 0) idx = c.drum.indexOf(' ') >= 0 ? c.drum.indexOf(' ') : 0;
    const colorChanged = c.color !== color;
    c.color = color;
    if (idx !== c.target) {
      c.target = idx;
      if (!c.flipping) { c.flipping = true; c.t0 = performance.now() + delay + Math.random() * 140; c.dur = 58 + Math.random() * 16; }
    }
    if (colorChanged) c.dirty = true;
  }
}
function clearBoard() { cells.forEach((c) => { c.target = c.drum.indexOf(' ') >= 0 ? c.drum.indexOf(' ') : 0; if (c.cur !== c.target && !c.flipping) { c.flipping = true; c.t0 = performance.now() + Math.random() * 200; c.dur = 60; } }); }

function drawCell(c, now) {
  const x = colX(c.x), y = rowY(c.y);
  const cur = tile(c.drum[c.cur], c.color);
  ctx.clearRect(x - 1, y - 1, cw + 2, chh + 2);
  if (!c.flipping || now < c.t0) { ctx.drawImage(cur, x, y, cw, chh); return; }
  const nxtI = (c.cur + 1) % c.drum.length;
  const nxt = tile(c.drum[nxtI], c.color);
  const p = Math.min(1, (now - c.t0) / c.dur);
  const half = chh / 2, TW = cur.width, TH = cur.height;
  // неподвижные: верх следующего символа и низ текущего
  ctx.drawImage(nxt, 0, 0, TW, TH / 2, x, y, cw, half);
  ctx.drawImage(cur, 0, TH / 2, TW, TH / 2, x, y + half, cw, half);
  if (p < 0.5) {
    const k = Math.cos(p * Math.PI);                       // верхний флажок падает к оси
    const h = Math.max(0.5, half * k);
    ctx.fillStyle = `rgba(0,0,0,${0.35 * (1 - k)})`; ctx.fillRect(x, y + half, cw, half);   // его тень на нижней половине
    ctx.drawImage(cur, 0, 0, TW, TH / 2, x, y + half - h, cw, h);
    ctx.fillStyle = `rgba(0,0,0,${0.55 * (1 - k)})`; ctx.fillRect(x, y + half - h, cw, h);
  } else {
    const k = -Math.cos(p * Math.PI);                      // и ложится вниз уже обратной стороной
    const h = Math.max(0.5, half * k);
    ctx.drawImage(nxt, 0, TH / 2, TW, TH / 2, x, y + half, cw, h);
    ctx.fillStyle = `rgba(255,255,255,${0.06 * (1 - k)})`; ctx.fillRect(x, y + half, cw, h);
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  update(now);
  moving = 0;
  let clicks = 0;
  for (const c of cells) {
    if (c.flipping && now >= c.t0) {
      moving++;
      if (now - c.t0 >= c.dur) {
        c.cur = (c.cur + 1) % c.drum.length;
        flips++;
        if (clicks < 26) { click(c.x / Math.max(1, cols - 1)); clicks++; }
        if (c.cur === c.target) c.flipping = false;
        else { c.t0 = now; c.dur = 56 + Math.random() * 18; }
      }
      drawCell(c, now);
      c.dirty = false;
    } else if (c.dirty) { drawCell(c, now); c.dirty = false; }
  }
  if (now - statT > 250) { statT = now; $('stats').textContent = `перелистываний: ${flips.toLocaleString('ru-RU')} · в движении: ${moving}`; }
}
let statT = 0;

/* ═══ Вокзал (время ускорено в 60 раз) ════════════════════════ */
const CITIES = [
  ['САНКТ-ПЕТЕРБУРГ', 'С-ПЕТЕРБУРГ'], ['КАЗАНЬ', 'КАЗАНЬ'], ['НИЖНИЙ НОВГОРОД', 'Н.НОВГОРОД'], ['ЕКАТЕРИНБУРГ', 'ЕКАТЕРИНБУРГ'],
  ['НОВОСИБИРСК', 'НОВОСИБИРСК'], ['ВЛАДИВОСТОК', 'ВЛАДИВОСТОК'], ['СОЧИ', 'СОЧИ'], ['МУРМАНСК', 'МУРМАНСК'], ['АРХАНГЕЛЬСК', 'АРХАНГЕЛЬСК'],
  ['КАЛИНИНГРАД', 'КАЛИНИНГРАД'], ['ВОЛГОГРАД', 'ВОЛГОГРАД'], ['АСТРАХАНЬ', 'АСТРАХАНЬ'], ['ПСКОВ', 'ПСКОВ'], ['ЯРОСЛАВЛЬ', 'ЯРОСЛАВЛЬ'],
  ['КОСТРОМА', 'КОСТРОМА'], ['ВОЛОГДА', 'ВОЛОГДА'], ['ПЕТРОЗАВОДСК', 'ПЕТРОЗАВОДСК'], ['СМОЛЕНСК', 'СМОЛЕНСК'], ['ВОРОНЕЖ', 'ВОРОНЕЖ'],
  ['САМАРА', 'САМАРА'], ['САРАТОВ', 'САРАТОВ'], ['ПЕРМЬ', 'ПЕРМЬ'], ['ИРКУТСК', 'ИРКУТСК'], ['ХАБАРОВСК', 'ХАБАРОВСК'], ['ТОМСК', 'ТОМСК'],
  ['КИСЛОВОДСК', 'КИСЛОВОДСК'], ['АНАПА', 'АНАПА'], ['ВЕЛИКИЙ НОВГОРОД', 'В.НОВГОРОД'], ['ТВЕРЬ', 'ТВЕРЬ'], ['СЕВЕРОБАЙКАЛЬСК', 'СЕВ.БАЙКАЛ'],
];
const LETTERS = 'АБВГЕЖИКМНСУЧЭЯ';
let sim = 0, lastReal = 0, trains = [], shiftAt = 0;
const pick = (a) => a[Math.floor(Math.random() * a.length)];
function newTrain(after) {
  const t = after + 5 + Math.floor(Math.random() * 11);
  const delayed = Math.random() < 0.12 ? 5 * (1 + Math.floor(Math.random() * 6)) : 0;
  return { dep: t, delay: delayed, num: String(1 + Math.floor(Math.random() * 780)).padStart(3, '0') + pick(LETTERS), city: pick(CITIES), track: 1 + Math.floor(Math.random() * 12), gone: -1 };
}
const hhmm = (m) => { m = ((Math.floor(m) % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
function initStation() {
  const d = new Date();
  sim = d.getHours() * 60 + d.getMinutes();
  trains = [];
  let t = sim + 2;
  for (let i = 0; i < rows - 1; i++) { const tr = newTrain(t); trains.push(tr); t = tr.dep; }
  shiftAt = 0;
  paintStation(true);
}
function statusOf(tr) {
  const left = tr.dep + tr.delay - sim;
  if (tr.gone >= 0 || left <= 0) return ['ОТПРАВЛЕН', 'w'];
  if (tr.delay && left > 4) return [`ЗАДЕРЖКА ${tr.delay}`, 'r'];
  if (left <= 12) return ['ПОСАДКА', 'y'];
  return ['ПО ГРАФИКУ', 'w'];
}
function paintStation(first = false) {
  const n = narrow();
  const W = cols;
  setText(0, 0, n ? 'ОТПРАВЛЕНИЕ' : 'ОТПРАВЛЕНИЕ ПОЕЗДОВ', 'y', W - 6);
  setText(W - 5, 0, hhmm(sim), 'y', 5);
  trains.forEach((tr, i) => {
    const y = i + 1, d = first ? i * 90 : 0;
    const [st, col] = statusOf(tr);
    setText(colStart('time'), y, hhmm(tr.dep), 'w', 5, d);
    if (!n) setText(colStart('num'), y, tr.num, 'w', 4, d);
    setText(colStart('dest'), y, n ? tr.city[1] : tr.city[0], 'w', n ? 12 : 18, d);
    setText(colStart('track'), y, String(tr.track).padStart(2, ' '), 'w', 2, d);
    if (!n) setText(colStart('note'), y, st, col, 11, d);
    else if (col === 'r' || col === 'y') { /* на узком экране статус — цветом пути */ setText(colStart('track'), y, String(tr.track).padStart(2, ' '), col, 2, d); }
  });
}
function update(now) {
  const dt = lastReal ? Math.min((now - lastReal) / 1000, 0.25) : 0;
  lastReal = now;
  if (mode === 'station') {
    const prevMin = Math.floor(sim);
    if (!SHOT) sim += dt;                   // 1 секунда = 1 минута вокзального времени
    const first = trains[0];
    if (first && first.gone < 0 && sim >= first.dep + first.delay) { first.gone = sim; shiftAt = now + 3200; }
    if (shiftAt && now >= shiftAt) {
      shiftAt = 0;
      trains.shift();
      trains.push(newTrain(trains[trains.length - 1].dep));
      paintStation();
    } else if (Math.floor(sim) !== prevMin) paintStation();
  } else if (mode === 'clock') {
    const d = new Date();
    const s = Math.floor(now / 1000);
    if (s !== clockS) { clockS = s; paintClock(d); }
  }
}

/* ═══ Часы ════════════════════════════════════════════════════ */
let clockS = -1;
const DAYS = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ'];
function paintClock(d) {
  const p = (v) => String(v).padStart(2, '0');
  setText(0, 0, ` ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())} `, 'w', 10);
  setText(0, 1, ` ${DAYS[d.getDay()]} ${p(d.getDate())}.${p(d.getMonth() + 1)} `, 'y', 10);
}

/* ═══ Своё сообщение ══════════════════════════════════════════ */
const PRESETS = ['Счастливого пути!', 'С днём рождения!', 'Поезд до мечты отправляется с первого пути', 'Кофе-брейк 15 минут', 'Все дороги ведут домой'];
function wrap(text, width, maxRows) {
  const words = norm(text).trim().split(' ');
  const lines = [];
  let line = '';
  for (let w of words) {
    while (w.length > width) { if (line) { lines.push(line); line = ''; } lines.push(w.slice(0, width)); w = w.slice(width); }
    if (!line) line = w;
    else if (line.length + 1 + w.length <= width) line += ' ' + w;
    else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines.slice(0, maxRows);
}
function showMessage(text) {
  const lines = wrap(text || 'Пусто', cols, rows);
  const top = Math.floor((rows - lines.length) / 2);
  for (let y = 0; y < rows; y++) {
    const l = lines[y - top] || '';
    const pad = Math.floor((cols - l.length) / 2);
    setText(0, y, ' '.repeat(pad) + l, y - top === 0 && lines.length > 1 ? 'y' : 'w', cols, y * 60);
  }
}
const chips = $('chips');
PRESETS.forEach((p) => {
  const b = document.createElement('button');
  b.type = 'button'; b.textContent = p;
  b.addEventListener('click', () => { $('msgIn').value = p; showMessage(p); ensureAudio(); });
  chips.appendChild(b);
});
$('msgGo').addEventListener('click', () => { showMessage($('msgIn').value); ensureAudio(); });
$('msgIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') { showMessage($('msgIn').value); ensureAudio(); } });

/* ═══ Режимы ══════════════════════════════════════════════════ */
const NOTES = {
  station: '<b>Вокзал.</b> Время ускорено в&nbsp;60 раз: поезда уходят каждые несколько секунд, строки сдвигаются, новые рейсы встают в&nbsp;очередь. Расписание вымышленное.',
  clock: '<b>Часы.</b> Цифры стоят на&nbsp;своих барабанах из&nbsp;десяти листов, как у&nbsp;настоящих перекидных часов, — поэтому 9 → 0 занимает один щелчок.',
  message: '<b>Своё.</b> Табло не&nbsp;умеет прыгать: каждая буква проходит барабан по&nbsp;порядку, поэтому «Я» после «А» — это тридцать с&nbsp;лишним щелчков.',
};
function setMode(m) {
  mode = m;
  document.querySelectorAll('#modes button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.m === m)));
  $('note').innerHTML = NOTES[m];
  $('msg').classList.toggle('on', m === 'message');
  $('note').style.display = m === 'message' && narrow() ? 'none' : '';
  buildMode();
  if (m === 'station') initStation();
  else if (m === 'clock') { clockS = -1; }
  else showMessage($('msgIn').value || PRESETS[0]);
}
document.querySelectorAll('#modes button').forEach((b) => b.addEventListener('click', () => { setMode(b.dataset.m); ensureAudio(); }));

/* ═══ Звук: синтезированный щелчок, панорама по колонке ════════ */
let ac = null, clickBuf = null, soundOn = false, master = null;
function ensureAudio() {
  if (!soundOn) return;
  if (!ac) {
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    const sr = ac.sampleRate, n = Math.floor(sr * 0.045);
    clickBuf = ac.createBuffer(1, n, sr);
    const d = clickBuf.getChannelData(0);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const noise = (Math.random() * 2 - 1) * Math.exp(-t * 900);
      const body = Math.sin(2 * Math.PI * 2300 * t) * Math.exp(-t * 420) * 0.6 + Math.sin(2 * Math.PI * 4700 * t) * Math.exp(-t * 700) * 0.35;
      const thump = Math.sin(2 * Math.PI * 170 * t) * Math.exp(-t * 160) * 0.5;
      d[i] = (noise * 0.7 + body + thump) * 0.5;
    }
    master = ac.createGain(); master.gain.value = 0.9;
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4;
    master.connect(comp).connect(ac.destination);
  }
  if (ac.state === 'suspended') ac.resume();
}
function click(pan) {
  if (!soundOn || !ac) return;
  const s = ac.createBufferSource(); s.buffer = clickBuf;
  s.playbackRate.value = 0.85 + Math.random() * 0.4;
  const g = ac.createGain(); g.gain.value = 0.05 + Math.random() * 0.06;
  let node = s.connect(g);
  if (ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = (pan * 2 - 1) * 0.8; node = node.connect(p); }
  node.connect(master);
  s.start(ac.currentTime + Math.random() * 0.012);
}
$('snd').addEventListener('click', () => {
  soundOn = !soundOn;
  $('snd').setAttribute('aria-pressed', String(soundOn));
  if (soundOn) ensureAudio();
});

/* ═══ Старт ═══════════════════════════════════════════════════ */
let rT = 0;
addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(() => setMode(mode), 150); });
document.fonts && document.fonts.ready.then(() => { tiles.clear(); cells.forEach((c) => (c.dirty = true)); });
setMode('station');
if (SHOT || reduce) { /* для съёмки и «меньше движения» доводим табло сразу, без долгой прокрутки барабанов */
  if (SHOT) cells.forEach((c) => { if (c.y > 3) { c.cur = c.target; c.flipping = false; c.dirty = true; } });
}
requestAnimationFrame(frame);
})();
