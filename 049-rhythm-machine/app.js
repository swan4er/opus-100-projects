/* РМ-16 «Ритм» — драм-машина: синтез, секвенсор, интерфейс. */
(() => {
'use strict';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const NB = ' ';

/* ═══ Голоса ══════════════════════════════════════════════════ */
const VOICES = [
  { id: 'bd', t: 'Бочка', s: '', short: 'БОЧ', pl: 'Затух.' },
  { id: 'sd', t: 'Малый', s: 'барабан', short: 'МАЛ', pl: 'Хлёст' },
  { id: 'lt', t: 'Том', s: 'низкий', short: 'ТМН', pl: 'Тон' },
  { id: 'mt', t: 'Том', s: 'средний', short: 'ТМС', pl: 'Тон' },
  { id: 'ht', t: 'Том', s: 'высокий', short: 'ТМВ', pl: 'Тон' },
  { id: 'rs', t: 'Римшот', s: '', short: 'РИМ', pl: 'Тон' },
  { id: 'cp', t: 'Хлопок', s: '', short: 'ХЛП', pl: 'Хвост' },
  { id: 'cb', t: 'Ковбелл', s: '', short: 'КОВ', pl: 'Тон' },
  { id: 'ch', t: 'Хэт', s: 'закрытый', short: 'ХЗК', pl: 'Тон' },
  { id: 'oh', t: 'Хэт', s: 'открытый', short: 'ХОТ', pl: 'Затух.' },
  { id: 'cy', t: 'Тарелка', s: '', short: 'ТАР', pl: 'Затух.' },
  { id: 'ac', t: 'Акцент', s: '', short: 'АКЦ', pl: 'Сила', accent: true },
];
const NV = 11;   // звучащих голосов; двенадцатый ряд — акцент

/* ═══ Ритмы ═══════════════════════════════════════════════════ */
const PRESETS = {
  house: { name: 'Хаус', bpm: 124, swing: 0.18, rows: {
    bd: 'x...x...x...x...', cp: '....x.......x...', ch: 'xx.xxx.xxx.xxx.x', oh: '..x...x...x...x.', cy: 'x...............', ac: 'x...x...x...x...' },
    p: { bd: 0.5, ch: 0.45, oh: 0.35 }, lv: { ch: 0.62, oh: 0.7 } },
  electro: { name: 'Электро', bpm: 112, swing: 0, rows: {
    bd: 'x......x..x.....', sd: '....x.......x...', cp: '....x.......x...', rs: '...x......x.....', ch: 'xxxxxxxxxxxxxxxx', ac: '..x...x...x...x.' },
    p: { bd: 0.55, sd: 0.6 }, lv: { ch: 0.55, rs: 0.6 } },
  hiphop: { name: 'Хип-хоп', bpm: 92, swing: 0.55, rows: {
    bd: 'x......xx.x.....', sd: '....x.......x...', ch: 'x.x.x.x.x.x.x.x.', oh: '.............x..', ac: '....x.......x...' },
    p: { bd: 0.62, sd: 0.4 }, lv: { ch: 0.6 } },
  techno: { name: 'Техно', bpm: 132, swing: 0.05, rows: {
    bd: 'x...x...x...x...', cp: '....x.......x...', rs: '...x..x....x..x.', ch: 'xxxxxxxxxxxxxxxx', oh: '..x...x...x...x.', cy: 'x...............', ac: 'x...x...x...x...' },
    p: { bd: 0.42, oh: 0.3, cp: 0.55 }, lv: { ch: 0.5, cp: 0.55 } },
  bossa: { name: 'Босса-нова', bpm: 118, swing: 0.08, rows: {
    bd: 'x..xx..xx..xx..x', rs: 'x..x..x...x..x..', ch: 'xxxxxxxxxxxxxxxx', ac: 'x...x...x...x...' },
    p: { bd: 0.35, ch: 0.6, rs: 0.5 }, lv: { ch: 0.42, bd: 0.75 } },
  trap: { name: 'Трэп', bpm: 140, swing: 0, rows: {
    bd: 'x.....x...x..x..', sd: '........x.......', cp: '........x.......', ch: 'x.x.x.xxx.x.x.xx', oh: '......x.........', ac: 'x.......x.......' },
    p: { bd: 0.95, ch: 0.55 }, lv: { ch: 0.58, bd: 0.95 } },
};
const GENRES = ['house', 'electro', 'hiphop', 'techno', 'bossa', 'trap'];

const emptyPat = () => Array.from({ length: 12 }, () => new Array(16).fill(0));
function presetPattern(key) {
  const P = emptyPat();
  const rows = PRESETS[key].rows;
  VOICES.forEach((v, i) => { const s = rows[v.id]; if (s) for (let k = 0; k < 16; k++) P[i][k] = s[k] === 'x' ? 1 : 0; });
  return P;
}
// Второй такт: тот же ритм со сбивкой томов в конце
function fillOf(A) {
  const B = A.map((r) => r.slice());
  for (let k = 12; k < 16; k++) { B[0][k] = 0; B[1][k] = 0; B[6][k] = 0; B[9][k] = 0; }
  B[4][12] = 1; B[4][13] = 1; B[3][14] = 1; B[2][15] = 1; B[1][15] = 1;
  B[11][12] = 1; B[11][14] = 1;
  return B;
}
// Евклидов ритм: k ударов как можно равномернее по n шагам
const euclid = (k, n, rot = 0) => Array.from({ length: n }, (_, i) => (((i + rot) * k) % n) < k ? 1 : 0);

/* ═══ Состояние ═══════════════════════════════════════════════ */
const defaults = () => ({
  bpm: 124, swing: 0.18, volume: 0.8, genre: 'house',
  voices: VOICES.map((v) => ({ level: 0.8, p: 0.5, mute: false })),
  pat: { A: presetPattern('house'), B: fillOf(presetPattern('house')) },
  edit: 'A', chain: false, sel: 0,
});
let S = defaults();
applyPresetParams('house', S);
try {
  const saved = JSON.parse(localStorage.getItem('rm16-v1') || 'null');
  if (saved && saved.pat && saved.voices && saved.voices.length === 12) S = Object.assign(defaults(), saved);
} catch (e) { /* хранилище недоступно — начнём с хауса */ }
let saveT = 0;
function save() {
  clearTimeout(saveT);
  saveT = setTimeout(() => { try { localStorage.setItem('rm16-v1', JSON.stringify(S)); } catch (e) { /* ничего */ } }, 300);
}
function applyPresetParams(key, st) {
  const pr = PRESETS[key];
  st.voices.forEach((v, i) => { v.level = 0.8; v.p = 0.5; v.mute = false; });
  st.voices[11].p = 0.6;
  for (const [id, val] of Object.entries(pr.p || {})) st.voices[VOICES.findIndex((v) => v.id === id)].p = val;
  for (const [id, val] of Object.entries(pr.lv || {})) st.voices[VOICES.findIndex((v) => v.id === id)].level = val;
  st.bpm = pr.bpm; st.swing = pr.swing; st.genre = key;
}

/* ═══ Звук ════════════════════════════════════════════════════ */
let ac = null, bus, master, analyser, noiseBuf, vgain = [], openHat = null;
function ensureAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return true; }
  try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { toast('Браузер не дал доступ к звуку'); return false; }
  bus = ac.createGain(); bus.gain.value = 0.85;
  const shaper = ac.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; curve[i] = Math.tanh(x * 1.4) / Math.tanh(1.4); }
  shaper.curve = curve; shaper.oversample = '2x';
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -12; comp.knee.value = 10; comp.ratio.value = 3; comp.attack.value = 0.004; comp.release.value = 0.16;
  master = ac.createGain(); master.gain.value = S.volume;
  analyser = ac.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0;
  bus.connect(shaper).connect(comp).connect(master).connect(analyser).connect(ac.destination);
  noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  vgain = VOICES.slice(0, NV).map((v, i) => { const g = ac.createGain(); g.connect(bus); return g; });
  syncGains();
  return true;
}
function syncGains() {
  if (!ac) return;
  vgain.forEach((g, i) => { const v = S.voices[i]; g.gain.setTargetAtTime(v.mute ? 0 : v.level * v.level * 1.25, ac.currentTime, 0.01); });
  master.gain.setTargetAtTime(S.volume * S.volume, ac.currentTime, 0.02);
}

// ── строительные блоки ──
function env(g, t, peak, tau, attack = 0.002) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
  g.gain.setTargetAtTime(0.0001, t + attack, tau);
}
function osc(type, f, t, dur, dest) {
  const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
  o.connect(dest); o.start(t); o.stop(t + dur);
  return o;
}
function noise(t, dur, dest) {
  const n = ac.createBufferSource(); n.buffer = noiseBuf;
  n.connect(dest); n.start(t, Math.random() * 1.5, dur); return n;
}
function filt(type, f, q = 0.7) { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }
const gainNode = () => ac.createGain();

// ── голоса ──
const METAL = [205.3, 304.4, 369.6, 522.7, 540, 800];   // шесть квадратных генераторов «железа»
function metal(t, dur, tune, dest) {
  const mix = gainNode(); mix.gain.value = 0.16;
  mix.connect(dest);
  METAL.forEach((f) => osc('square', f * tune, t, dur, mix));
}

const SYN = [
  // бочка: синус со спадом высоты, щелчок атаки
  (t, v, p, out) => {
    const f0 = 49, dec = 0.18 + p * 1.25;
    const g = gainNode(); g.connect(out);
    const o = osc('sine', f0 * 3.3, t, dec * 5 + 0.1, g);
    o.frequency.exponentialRampToValueAtTime(f0 * 1.3, t + 0.028);
    o.frequency.exponentialRampToValueAtTime(f0, t + 0.14 + p * 0.25);
    env(g, t, v * 1.05, dec / 2.2);
    const cg = gainNode(); cg.connect(out);
    const lp = filt('lowpass', 3200); lp.connect(cg);
    noise(t, 0.02, lp); env(cg, t, v * 0.32, 0.004, 0.001);
  },
  // малый: два тона корпуса и шум пружин
  (t, v, p, out) => {
    [[182, 0.62], [330, 0.34]].forEach(([f, a]) => {
      const g = gainNode(); g.connect(out);
      const o = osc('triangle', f * 1.08, t, 0.4, g); o.frequency.exponentialRampToValueAtTime(f, t + 0.03);
      env(g, t, v * a, 0.045);
    });
    const ng = gainNode(); ng.connect(out);
    const hp = filt('highpass', 1600); const bp = filt('bandpass', 5200, 0.6);
    hp.connect(bp).connect(ng);
    noise(t, 0.5, hp); env(ng, t, v * (0.25 + p * 0.75), 0.03 + p * 0.05);
  },
  ...[88, 128, 180].map((base) => (t, v, p, out) => {
    // томы: синус со спадом высоты
    const f = base * (0.72 + p * 0.62);
    const g = gainNode(); g.connect(out);
    const o = osc('sine', f * 1.45, t, 1.2, g); o.frequency.exponentialRampToValueAtTime(f, t + 0.09);
    env(g, t, v * 0.9, 0.1 + (200 - base) / 1400);
    const ng = gainNode(); ng.connect(out);
    const lp = filt('lowpass', 2000); lp.connect(ng); noise(t, 0.05, lp); env(ng, t, v * 0.12, 0.01);
  }),
  // римшот: два высоких резонанса и щелчок
  (t, v, p, out) => {
    const k = 0.8 + p * 0.4;
    const hp = filt('highpass', 700); hp.connect(out);
    const g = gainNode(); g.connect(hp);
    osc('triangle', 460 * k, t, 0.12, g); osc('square', 1720 * k, t, 0.12, g);
    env(g, t, v * 0.55, 0.009, 0.001);
  },
  // хлопок: четыре шумовых всплеска и хвост
  (t, v, p, out) => {
    const bp = filt('bandpass', 1150, 1.3); bp.connect(out);
    const g = gainNode(); g.connect(bp);
    noise(t, 0.8, g);
    g.gain.setValueAtTime(0.0001, t);
    [0, 0.011, 0.022, 0.032].forEach((d, i) => {
      g.gain.setValueAtTime(v * (i === 3 ? 1.1 : 0.9), t + d);
      g.gain.setTargetAtTime(0.0001, t + d + 0.001, 0.0045);
    });
    g.gain.setValueAtTime(v * 0.75, t + 0.034);
    g.gain.setTargetAtTime(0.0001, t + 0.035, 0.05 + p * 0.16);
  },
  // ковбелл: два квадрата 540 и 800 Гц
  (t, v, p, out) => {
    const k = 0.85 + p * 0.3;
    const bp = filt('bandpass', 950 * k, 0.9); const g = gainNode();
    bp.connect(g).connect(out);
    osc('square', 540 * k, t, 0.6, bp); osc('square', 800 * k, t, 0.6, bp);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v * 0.55, t + 0.002);
    g.gain.setTargetAtTime(v * 0.2, t + 0.004, 0.012);
    g.gain.setTargetAtTime(0.0001, t + 0.04, 0.08);
  },
  // закрытый хэт — глушит открытый
  (t, v, p, out) => {
    if (openHat) { try { openHat.gain.cancelScheduledValues(t); openHat.gain.setTargetAtTime(0.0001, t, 0.004); } catch (e) { /* уже отзвучал */ } openHat = null; }
    const bp = filt('bandpass', 8000 + p * 5000, 1.1), hp = filt('highpass', 7000), g = gainNode();
    bp.connect(hp).connect(g).connect(out);
    metal(t, 0.15, 1, bp); env(g, t, v * 0.9, 0.014 + p * 0.01, 0.001);
  },
  // открытый хэт
  (t, v, p, out) => {
    const bp = filt('bandpass', 9500, 1), hp = filt('highpass', 6800), g = gainNode();
    bp.connect(hp).connect(g).connect(out);
    metal(t, 1.6, 1, bp); env(g, t, v * 0.75, 0.06 + p * 0.3, 0.001);
    openHat = g;
  },
  // тарелка
  (t, v, p, out) => {
    const bp = filt('bandpass', 7200, 0.7), hp = filt('highpass', 4600), g = gainNode();
    bp.connect(hp).connect(g).connect(out);
    metal(t, 3.5, 1, bp); env(g, t, v * 0.7, 0.25 + p * 0.7, 0.002);
    const ng = gainNode(); const hp2 = filt('highpass', 8000); hp2.connect(ng).connect(out);
    noise(t, 1.5, hp2); env(ng, t, v * 0.12, 0.2 + p * 0.4, 0.002);
  },
];

function trigger(i, t, accent) {
  if (!ac) return;
  const A = S.voices[11].p;
  const vel = accent ? 0.72 + 0.28 + A * 0.34 : 0.72;
  SYN[i](t, vel, S.voices[i].p, vgain[i]);
}

/* ═══ Секвенсор ═══════════════════════════════════════════════ */
let playing = false, nextTime = 0, stepIdx = 0, barIdx = 0, timer = 0;
const queue = [];
let curStep = -1, curPat = 'A';
function playPattern() { return S.chain ? (barIdx % 2 ? 'B' : 'A') : S.edit; }
function schedule() {
  const spb = 60 / S.bpm / 4;
  while (nextTime < ac.currentTime + 0.12) {
    const pn = playPattern();
    const P = S.pat[pn];
    const t = nextTime + (stepIdx % 2 ? S.swing * spb * 0.42 : 0);
    const hits = [];
    for (let v = 0; v < NV; v++) if (P[v][stepIdx]) { if (!S.voices[v].mute) trigger(v, t, P[11][stepIdx]); hits.push(v); }
    queue.push({ t, step: stepIdx, pat: pn, hits });
    nextTime += spb;
    if (++stepIdx === 16) { stepIdx = 0; barIdx++; }
  }
}
function start() {
  if (!ensureAudio()) return;
  playing = true;
  stepIdx = 0; barIdx = 0; queue.length = 0;
  nextTime = ac.currentTime + 0.06;
  schedule();
  timer = setInterval(schedule, 25);
  $('start').classList.add('playing'); $('start').classList.remove('idle');
  $('startTxt').textContent = 'Стоп';
}
function stop() {
  playing = false; clearInterval(timer); queue.length = 0; curStep = -1;
  $('start').classList.remove('playing');
  $('startTxt').textContent = 'Старт';
  paintPlayhead();
}
$('start').addEventListener('click', () => (playing ? stop() : start()));

/* ═══ Интерфейс ═══════════════════════════════════════════════ */
function toast(text) {
  const t = $('toast'); t.textContent = text; t.classList.add('on');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 3200);
}

// ── ручка ──
function knob(host, o) {
  const kn = el('div', 'kn');
  const wrap = el('div', 'kwrap' + (o.big ? ' big' : '') + (o.orange ? ' orange' : ''));
  wrap.tabIndex = 0;
  wrap.setAttribute('role', 'slider');
  wrap.setAttribute('aria-label', o.aria || o.label);
  wrap.setAttribute('aria-valuemin', o.min); wrap.setAttribute('aria-valuemax', o.max);
  const ring = el('div', 'knob'), cap = el('div', 'cap'), tip = el('span', 'tip');
  wrap.append(ring, cap, tip);
  const lab = el('label'); lab.textContent = o.label;
  kn.append(wrap, lab); host.appendChild(kn);
  let v = o.value;
  const span = o.max - o.min;
  const set = (nv, emit = true) => {
    v = clamp(o.step ? Math.round(nv / o.step) * o.step : nv, o.min, o.max);
    wrap.style.setProperty('--a', (-135 + 270 * (v - o.min) / span) + 'deg');
    const txt = o.fmt(v);
    tip.textContent = txt;
    wrap.setAttribute('aria-valuenow', String(Math.round(v * 100) / 100));
    wrap.setAttribute('aria-valuetext', txt);
    if (emit) o.onInput(v);
  };
  let drag = null;
  wrap.addEventListener('pointerdown', (e) => { e.preventDefault(); wrap.setPointerCapture(e.pointerId); drag = { y: e.clientY, v }; wrap.classList.add('drag'); wrap.focus({ preventScroll: true }); });
  wrap.addEventListener('pointermove', (e) => { if (!drag) return; const k = e.shiftKey ? 0.25 : 1; set(drag.v + ((drag.y - e.clientY) / 170) * span * k); });
  const end = () => { drag = null; wrap.classList.remove('drag'); };
  wrap.addEventListener('pointerup', end); wrap.addEventListener('pointercancel', end);
  wrap.addEventListener('wheel', (e) => { e.preventDefault(); set(v - Math.sign(e.deltaY) * span / 50); }, { passive: false });
  wrap.addEventListener('dblclick', () => set(o.def != null ? o.def : o.value));
  wrap.addEventListener('keydown', (e) => {
    const d = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 5, PageDown: -5 }[e.key];
    if (d) { e.preventDefault(); set(v + d * span / 50); }
    else if (e.key === 'Home') set(o.min); else if (e.key === 'End') set(o.max);
  });
  set(v, false);
  return { set, get: () => v };
}
const pct = (v) => Math.round(v * 100) + NB + '%';

// ── голоса ──
const voicesEl = $('voices');
const vk = [];
VOICES.forEach((V, i) => {
  const col = el('div', 'voice' + (V.accent ? ' acc' : ''));
  col.dataset.i = i;
  col.appendChild(el('div', 'nm', `${V.t}${V.s ? `<small>${V.s}</small>` : ''}`));
  const kr = el('div', 'knobs'); col.appendChild(kr);
  const vb = el('div', 'vb');
  const kl = V.accent ? null : knob(kr, { label: 'Уровень', aria: `Уровень · ${V.t} ${V.s}`, min: 0, max: 1, value: S.voices[i].level, def: 0.8, fmt: pct, onInput: (x) => { S.voices[i].level = x; syncGains(); save(); } });
  const kp = knob(kr, { label: V.pl, aria: `${V.pl} · ${V.t} ${V.s}`, min: 0, max: 1, value: S.voices[i].p, def: 0.5, fmt: pct, orange: !!V.accent, onInput: (x) => { S.voices[i].p = x; save(); } });
  const sel = el('button', 'sel', '<i></i>');
  sel.type = 'button'; sel.setAttribute('aria-label', `Выбрать: ${V.t} ${V.s}`);
  sel.addEventListener('click', () => { select(i); if (!V.accent && ensureAudio()) trigger(i, ac.currentTime + 0.005, false); });
  col.appendChild(vb); vb.appendChild(sel);
  if (!V.accent) {
    const m = el('button', 'mute', 'Выкл');
    m.type = 'button'; m.setAttribute('aria-pressed', String(S.voices[i].mute)); m.setAttribute('aria-label', `Заглушить: ${V.t} ${V.s}`);
    m.addEventListener('click', () => { S.voices[i].mute = !S.voices[i].mute; m.setAttribute('aria-pressed', String(S.voices[i].mute)); syncGains(); save(); });
    vb.appendChild(m);
    vk[i] = { kl, kp, m, col };
  } else { vk[i] = { kp, col }; }
  voicesEl.appendChild(col);
});

// ── партитура (все голоса) ──
const grid = $('grid');
const cells = [];
VOICES.forEach((V, i) => {
  const rl = el('div', 'rl', V.short);
  rl.addEventListener('click', () => select(i));
  const row = el('div', 'row');
  cells[i] = [];
  for (let k = 0; k < 16; k++) {
    const c = el('div', 'c' + (V.accent ? ' acc' : ''));
    c.addEventListener('pointerdown', (e) => { e.preventDefault(); toggle(i, k); });
    row.appendChild(c); cells[i][k] = c;
  }
  grid.append(rl, row);
  cells[i].row = row; cells[i].rl = rl;
});

// ── клавиши шагов ──
const keysEl = $('keys');
const kcells = [];
for (let k = 0; k < 16; k++) {
  const c = el('div', `kcell g${(k >> 2) + 1}${k % 4 === 0 ? ' beat' : ''}`);
  const led = el('span', 'kled');
  const key = el('button', 'key');
  key.type = 'button';
  key.setAttribute('aria-label', `Шаг ${k + 1}`);
  key.addEventListener('pointerdown', (e) => { e.preventDefault(); toggle(S.sel, k); key.classList.add('press'); });
  const up = () => key.classList.remove('press');
  key.addEventListener('pointerup', up); key.addEventListener('pointerleave', up);
  key.addEventListener('keydown', (e) => { if (e.key === 'Enter') toggle(S.sel, k); });
  c.append(led, key, el('span', 'kno', String(k + 1)));
  keysEl.appendChild(c);
  kcells.push({ c, key });
}

function toggle(v, k) {
  const P = S.pat[S.edit];
  P[v][k] = P[v][k] ? 0 : 1;
  if (P[v][k] && v < NV && !playing && ensureAudio()) trigger(v, ac.currentTime + 0.005, P[11][k]);
  paintPattern(); save();
}
function select(i) {
  S.sel = i;
  VOICES.forEach((_, j) => { vk[j].col.classList.toggle('on', j === i); cells[j].row.classList.toggle('cur', j === i); cells[j].rl.classList.toggle('cur', j === i); });
  $('curName').textContent = VOICES[i].t + (VOICES[i].s ? ' ' + VOICES[i].s : '');
  paintPattern(); save();
}
function paintPattern() {
  const P = S.pat[S.edit];
  for (let i = 0; i < 12; i++) for (let k = 0; k < 16; k++) cells[i][k].classList.toggle('on', !!P[i][k]);
  for (let k = 0; k < 16; k++) kcells[k].c.classList.toggle('on', !!P[S.sel][k]);
}
let lastPh = -2;
function paintPlayhead() {
  const ph = playing && curPat === S.edit ? curStep : -1;
  if (ph === lastPh) return;
  for (let i = 0; i < 12; i++) {
    if (lastPh >= 0) cells[i][lastPh].classList.remove('ph');
    if (ph >= 0) cells[i][ph].classList.add('ph');
  }
  if (lastPh >= 0) kcells[lastPh].c.classList.remove('ph');
  if (ph >= 0) kcells[ph].c.classList.add('ph');
  lastPh = ph;
}

// ── мастер ──
const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', ' ': '' };
const SEGP = {
  a: 'M5 2h12l-2 3H7z', b: 'M18 3l1 1v13l-2 1-2-2V6z', c: 'M18 21l1 1v13l-1 1-3-3V23z', d: 'M5 36h12l-2-3H7z',
  e: 'M4 21l-1 1v13l1 1 3-3V23z', f: 'M4 3l-1 1v13l2 1 2-2V6z', g: 'M5 20.5L7 19h8l2 1.5-2 1.5H7z',
};
const seg = $('bpmSeg');
const digits = [0, 1, 2].map(() => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 22 38'); seg.appendChild(s); return s; });
function paintBpm() {
  const txt = String(Math.round(S.bpm)).padStart(3, ' ');
  digits.forEach((s, i) => {
    const on = SEG[txt[i]] || '';
    s.innerHTML = Object.entries(SEGP).map(([k, d]) => `<path d="${d}" fill="${on.includes(k) ? '#ff4b2b' : 'rgba(255,75,43,.09)'}"/>`).join('');
  });
}
const tempoK = knob($('tempoKnob'), { label: 'Темп', aria: 'Темп, ударов в минуту', min: 60, max: 180, step: 1, value: S.bpm, def: 120, big: true, orange: true, fmt: (v) => Math.round(v) + NB + 'уд/мин', onInput: (x) => { S.bpm = x; paintBpm(); save(); } });
const mk = $('masterKnobs');
const swingK = knob(mk, { label: 'Свинг', min: 0, max: 1, value: S.swing, def: 0, fmt: pct, onInput: (x) => { S.swing = x; save(); } });
const volK = knob(mk, { label: 'Громкость', min: 0, max: 1, value: S.volume, def: 0.8, fmt: pct, onInput: (x) => { S.volume = x; syncGains(); save(); } });

function setEdit(p) {
  S.edit = p;
  $('patA').setAttribute('aria-pressed', String(p === 'A'));
  $('patB').setAttribute('aria-pressed', String(p === 'B'));
  paintPattern(); lastPh = -2; paintPlayhead(); save();
}
$('patA').addEventListener('click', () => setEdit('A'));
$('patB').addEventListener('click', () => setEdit('B'));
$('patAB').addEventListener('click', () => { S.chain = !S.chain; $('patAB').setAttribute('aria-pressed', String(S.chain)); save(); toast(S.chain ? 'Такты чередуются: A, B, A, B…' : 'Играет только выбранный такт'); });

const genresEl = $('genres');
GENRES.forEach((g) => {
  const b = el('button', '', PRESETS[g].name);
  b.type = 'button'; b.dataset.g = g;
  b.addEventListener('click', () => loadGenre(g));
  genresEl.appendChild(b);
});
const comp = el('button', 'compose', 'Сочинить вариацию');
comp.type = 'button';
comp.addEventListener('click', compose);
genresEl.appendChild(comp);

function syncControls() {
  VOICES.forEach((V, i) => {
    if (vk[i].kl) vk[i].kl.set(S.voices[i].level, false);
    vk[i].kp.set(S.voices[i].p, false);
    if (vk[i].m) vk[i].m.setAttribute('aria-pressed', String(S.voices[i].mute));
  });
  tempoK.set(S.bpm, false); swingK.set(S.swing, false); volK.set(S.volume, false);
  genresEl.querySelectorAll('button[data-g]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.g === S.genre)));
  $('patAB').setAttribute('aria-pressed', String(S.chain));
  paintBpm(); syncGains();
}
function loadGenre(g) {
  applyPresetParams(g, S);
  S.pat.A = presetPattern(g); S.pat.B = fillOf(S.pat.A);
  syncControls(); paintPattern(); save();
  toast(`${PRESETS[g].name}: ${PRESETS[g].bpm}${NB}уд/мин`);
}

// ── «Сочинить»: вариация по правилам жанра плюс евклидова перкуссия ──
function compose() {
  const g = S.genre;
  const A = presetPattern(g);
  const r = Math.random;
  const notes = [];
  // бочка: синкопы на слабых долях, иногда убираем лишние
  for (const k of [2, 3, 6, 10, 11, 14]) if (r() < 0.16) A[0][k] = 1;
  for (let k = 0; k < 16; k++) if (k % 4 && A[0][k] && r() < 0.25) A[0][k] = 0;
  // «призрачные» удары малого там, где жанр это любит
  if (g !== 'house' && g !== 'techno') for (const k of [7, 9, 14, 15]) if (r() < 0.2) A[1][k] = 1;
  // плотность хэтов
  if (r() < 0.5) {
    const dens = [4, 6, 8, 11, 12][Math.floor(r() * 5)];
    A[8] = euclid(dens, 16, Math.floor(r() * 4));
    notes.push(`хэт E(${dens},${NB}16)`);
  }
  // перкуссия по алгоритму Евклида
  const kp = [3, 5, 7, 9][Math.floor(r() * 4)];
  const rot = Math.floor(r() * 16);
  const target = r() < 0.5 ? 7 : 5;
  A[target] = euclid(kp, 16, rot);
  notes.unshift(`${VOICES[target].t.toLowerCase()} E(${kp},${NB}16)`);
  // акценты — на ударах бочки и слабых долях
  for (let k = 0; k < 16; k++) A[11][k] = (A[0][k] && k % 4 === 0) || (r() < 0.12) ? 1 : 0;
  S.pat.A = A; S.pat.B = fillOf(A);
  paintPattern(); save();
  toast(`${PRESETS[g].name}, вариация: ${notes.join(', ')}`);
}

/* ═══ Осциллограф ═════════════════════════════════════════════ */
const scope = $('scope');
const sctx = scope.getContext('2d');
let sw = 0, sh = 0, sdpr = 1, wave = null;
function sizeScope() {
  const r = scope.getBoundingClientRect();
  sdpr = Math.min(window.devicePixelRatio || 1, 2);
  sw = scope.width = Math.max(1, Math.round(r.width * sdpr));
  sh = scope.height = Math.max(1, Math.round(r.height * sdpr));
  sctx.fillStyle = '#070b09'; sctx.fillRect(0, 0, sw, sh);
}
let peakT = 0;
function drawScope(now) {
  sctx.fillStyle = 'rgba(7, 11, 9, 0.34)';
  sctx.fillRect(0, 0, sw, sh);
  // сетка
  sctx.strokeStyle = 'rgba(140, 255, 190, 0.06)'; sctx.lineWidth = 1;
  for (let i = 1; i < 8; i++) { const x = (sw * i) / 8; sctx.beginPath(); sctx.moveTo(x, 0); sctx.lineTo(x, sh); sctx.stroke(); }
  for (let i = 1; i < 4; i++) { const y = (sh * i) / 4; sctx.beginPath(); sctx.moveTo(0, y); sctx.lineTo(sw, y); sctx.stroke(); }
  let peak = 0;
  const pts = [];
  if (analyser && playing) {
    if (!wave) wave = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(wave);
    // синхронизация по переходу через ноль вверх
    let s0 = 0;
    for (let i = 1; i < wave.length / 2; i++) if (wave[i - 1] < 0 && wave[i] >= 0) { s0 = i; break; }
    const n = Math.min(900, wave.length - s0);
    for (let i = 0; i < n; i++) { const w = wave[s0 + i]; peak = Math.max(peak, Math.abs(w)); pts.push([(i / (n - 1)) * sw, sh / 2 - w * sh * 0.42]); }
  } else {
    for (let i = 0; i <= 120; i++) pts.push([(i / 120) * sw, sh / 2 + Math.sin(i * 0.9 + now / 300) * 0.6 * sdpr]);
  }
  const line = (w, a) => {
    sctx.strokeStyle = `rgba(150, 255, 196, ${a})`; sctx.lineWidth = w * sdpr; sctx.beginPath();
    pts.forEach(([x, y], i) => (i ? sctx.lineTo(x, y) : sctx.moveTo(x, y))); sctx.stroke();
  };
  line(5, 0.08); line(1.6, 0.9);
  if (now - peakT > 200) {
    peakT = now;
    $('scopeInfo').textContent = playing && peak > 0.001 ? `пик ${(20 * Math.log10(peak)).toFixed(1).replace('.', ',')}${NB}дБ` : 'тишина';
  }
}

/* ═══ Цикл интерфейса ═════════════════════════════════════════ */
const flashT = new Array(NV).fill(0);
function frame(now) {
  requestAnimationFrame(frame);
  if (ac && playing) {
    const t = ac.currentTime;
    while (queue.length && queue[0].t <= t) {
      const e = queue.shift();
      curStep = e.step; curPat = e.pat;
      e.hits.forEach((v) => { flashT[v] = now; vk[v].col.classList.add('hit'); });
    }
  }
  for (let v = 0; v < NV; v++) if (flashT[v] && now - flashT[v] > 90) { vk[v].col.classList.remove('hit'); flashT[v] = 0; }
  paintPlayhead();
  if (!document.hidden) drawScope(now);
}

/* ═══ Клавиатура ══════════════════════════════════════════════ */
addEventListener('keydown', (e) => {
  if (e.target.closest && e.target.closest('.kwrap')) return;
  if (e.code === 'Space') { e.preventDefault(); playing ? stop() : start(); return; }
  if (/^Digit[0-9]$/.test(e.code)) { const n = +e.code.slice(5); select(n === 0 ? 9 : n - 1); return; }
  if (e.key === 'Delete' || e.key === 'Backspace') { S.pat[S.edit][S.sel].fill(0); paintPattern(); save(); }
});

/* ═══ Старт ═══════════════════════════════════════════════════ */
addEventListener('resize', sizeScope);
sizeScope();
syncControls();
setEdit(S.edit || 'A');
select(S.sel || 0);
requestAnimationFrame(frame);
})();
