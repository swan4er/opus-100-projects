/* КС-8 «Кремниевое сердце» — интерфейс: плата, редактор, цикл эмуляции, звук. */
(() => {
'use strict';

const { assemble, disasm, CPU, VRAM, hex2, hex3 } = window.KS8;
const PROGRAMS = window.KS8_PROGRAMS;
const SHOT = !!window.__SHOT__;
const $ = (id) => document.getElementById(id);
const NB = ' ';

/* ═══ Палитра светодиодов (16 цветов) ═══════════════════════════ */
const PAL = ['#0a0d0c', '#2a3d6e', '#6a2f7e', '#1f6a4a', '#8a4d26', '#3d4d5e', '#93a0ad', '#f6f1e4',
             '#ff3d3d', '#ff8c1a', '#ffd43b', '#3ddc84', '#3b82ff', '#a07bff', '#ff5fa8', '#ffc4a3'];
const PAL_RGB = PAL.map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);

const SPEEDS = [
  [1, '1 Гц'], [10, '10 Гц'], [1000, '1 кГц'], [100000, '100 кГц'], [1000000, '1 МГц'], [4000000, '4 МГц'],
];
const SLOW = 10;               // до этой частоты каждая команда анимируется по фазам

/* ═══ Состояние ═══════════════════════════════════════════════ */
const cpu = new CPU();
let prog = PROGRAMS[0];
let asm = null;
let running = true;
let speed = prog.speed;
let dirty = false;
let hits = new Float32Array(1), heat = new Float32Array(1);
let anim = null;                // анимация текущей команды в медленном режиме
let busAddr = 0, busData = 0, busAct = 0, vidAct = 0, ioAct = 0;
let ips = 0, ipsAcc = 0, ipsT = 0;
let soundOn = false;

/* ═══ Пояснения к командам ════════════════════════════════════ */
const PORT_IN = ['клавиши', 'генератор случайных чисел', 'номер кадра'];
const PORT_OUT = { 2: 'табло', 3: 'динамик', 4: 'линейку индикаторов' };
function explain(last) {
  if (!last || !last.op) return 'Процессор остановлен: встретился неизвестный байт.';
  const { op, b1 } = last;
  const R = 'R' + op.r, R2 = 'R' + (b1 & 7);
  const x = op.form === 'rr' ? R2 : String(b1);
  switch (op.mnem) {
    case 'NOP': return 'Ничего не делать один такт.';
    case 'HLT': return 'Остановить процессор.';
    case 'RET': return 'Вернуться из подпрограммы: адрес возврата снимается со стека.';
    case 'WAIT': return 'Ждать следующего кадра дисплея — 1/60 секунды.';
    case 'JMP': return 'Перейти по адресу: записать его в счётчик команд PC.';
    case 'JZ': return 'Перейти, если флаг Z = 1: прошлый результат был нулём.';
    case 'JNZ': return 'Перейти, если Z = 0: прошлый результат не ноль.';
    case 'JC': return 'Перейти, если C = 1: был заём — первое число меньше.';
    case 'JNC': return 'Перейти, если C = 0: первое число не меньше второго.';
    case 'JN': return 'Перейти, если N = 1: старший бит результата единица.';
    case 'JNN': return 'Перейти, если N = 0.';
    case 'CALL': return 'Вызвать подпрограмму: адрес возврата — в стек, затем прыжок.';
    case 'LDI': return 'Записать адрес в индексный регистр I.';
    case 'INCI': return 'Сдвинуть I на следующий байт памяти.';
    case 'PUSHI': return 'Сохранить I в стеке: следующие команды его испортят.';
    case 'POPI': return 'Вернуть I из стека.';
    case 'MOV': return `${R} ← ${x}.`;
    case 'LD': return op.form === 'rI' ? `${R} ← память[I]: прочитать байт по адресу из I.` : `${R} ← память[${'0x' + hex3((b1 | (last.b2 << 8)) & 0xFFF)}].`;
    case 'ST': return op.form === 'Ir' ? `память[I] ← ${R}: записать байт по адресу из I.` : `память[0x${hex3((b1 | (last.b2 << 8)) & 0xFFF)}] ← ${R}.`;
    case 'ADD': return `${R} ← ${R} + ${x}. Перенос за 255 поднимает флаг C.`;
    case 'SUB': return `${R} ← ${R} − ${x}. Заём поднимает флаг C.`;
    case 'AND': return `${R} ← ${R} И ${x}: остаются биты, которые есть в обоих числах.`;
    case 'OR': return `${R} ← ${R} ИЛИ ${x}: включить биты.`;
    case 'XOR': return `${R} ← ${R} исключающее ИЛИ ${x}.`;
    case 'CMP': return `Сравнить ${R} и ${x}: вычесть, не сохраняя результат, — меняются только флаги.`;
    case 'INC': return `${R} ← ${R} + 1.`;
    case 'DEC': return `${R} ← ${R} − 1. Ноль поднимет флаг Z.`;
    case 'SHL': return `Сдвинуть биты ${R} влево — умножить на 2; выпавший бит уходит в C.`;
    case 'SHR': return `Сдвинуть биты ${R} вправо — разделить на 2; выпавший бит уходит в C.`;
    case 'PUSH': return `Положить ${R} на вершину стека.`;
    case 'POP': return `Снять байт со стека в ${R}.`;
    case 'IN': return `${R} ← порт ${b1} (${PORT_IN[b1] || 'пусто'}).`;
    case 'OUT': return `Порт ${b1} (${PORT_OUT[b1] || 'пусто'}) ← ${R}.`;
    case 'ADDI': return `I ← I + ${R}: сместить указатель на ${R} байт.`;
    case 'VID': return `I ← адрес пикселя (${R}, ${R2}) = 0xC00 + 32·y + x. Края заворачиваются.`;
  }
  return '';
}

/* ═══ Редактор ════════════════════════════════════════════════ */
const src = $('src'), hl = $('hl');
const MNEMS = new Set(window.KS8.OPS.map((o) => o[0]).concat(['JE', 'JNE', 'JL', 'JGE']));
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function highlightLine(line) {
  let q = false, cut = line.length;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') q = !q;
    if (line[i] === ';' && !q) { cut = i; break; }
  }
  const code = line.slice(0, cut), com = line.slice(cut);
  let out = '', seenOp = false;
  const re = /(\s+)|("[^"]*")|('.')|(0x[0-9a-fA-F]+|0b[01]+|\d+)|([A-Za-z_.][\w.]*:)|([A-Za-z_.][\w.]*)|(.)/g;
  let m;
  while ((m = re.exec(code))) {
    const t = m[0];
    if (m[1]) out += t;
    else if (m[2] || m[3]) out += `<span class="t-str">${esc(t)}</span>`;
    else if (m[4]) out += `<span class="t-num">${t}</span>`;
    else if (m[5]) out += `<span class="t-lab">${esc(t)}</span>`;
    else if (m[6]) {
      const u = t.toUpperCase();
      if (!seenOp && t[0] === '.') { out += `<span class="t-dir">${esc(t)}</span>`; seenOp = true; }
      else if (!seenOp && MNEMS.has(u)) { out += `<span class="t-op">${esc(t)}</span>`; seenOp = true; }
      else if (/^R[0-7]$/.test(u) || u === 'I') out += `<span class="t-reg">${esc(t)}</span>`;
      else out += `<span class="t-ref">${esc(t)}</span>`;
    } else out += esc(t);
  }
  if (com) out += `<span class="t-com">${esc(com)}</span>`;
  return out;
}
let lineEls = [];
function renderEditor() {
  const lines = src.value.split('\n');
  hl.innerHTML = lines.map((l, i) => `<div class="l"><span class="no">${i + 1}</span><span class="heat"></span>${highlightLine(l) || ' '}</div>`).join('');
  lineEls = Array.from(hl.children);
  syncScroll();
}
function syncScroll() { hl.scrollTop = src.scrollTop; hl.scrollLeft = src.scrollLeft; }
src.addEventListener('scroll', syncScroll);
src.addEventListener('input', () => {
  renderEditor();
  dirty = true;
  setPcLine(-1);
  setStatus('изменено — нажмите «Собрать»', 'dirty');
});
src.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); build(true); return; }
  if (e.key === 'Tab') {
    e.preventDefault();
    const s = src.selectionStart;
    src.setRangeText('        ', s, src.selectionEnd, 'end');
    src.dispatchEvent(new Event('input'));
  }
});

function setStatus(text, cls = '') {
  const st = $('asmStatus');
  st.textContent = text;
  st.className = 'st' + (cls ? ' ' + cls : '');
}
let toastT = 0;
function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('on'), 4200);
}

let pcLine = -1;
function setPcLine(ln) {
  if (ln === pcLine) return;
  if (pcLine >= 0 && lineEls[pcLine]) lineEls[pcLine].classList.remove('pc');
  pcLine = ln;
  if (ln >= 0 && lineEls[ln]) {
    lineEls[ln].classList.add('pc');
    // держим строку в поле зрения только в медленном режиме или по шагу
    if (speed <= 1000 || !running) {
      const top = ln * 20, view = src.clientHeight;
      if (top < src.scrollTop + 30 || top > src.scrollTop + view - 70) {
        src.scrollTop = Math.max(0, top - view / 2);
        syncScroll();
      }
    }
  }
}

function build(autorun = true) {
  const res = assemble(src.value);
  lineEls.forEach((el) => el.classList.remove('bad'));
  if (res.errors.length) {
    const e = res.errors[0];
    setStatus(`ошибок: ${res.errors.length}`, 'err');
    res.errors.forEach((er) => lineEls[er.line] && lineEls[er.line].classList.add('bad'));
    toast(`Строка ${e.line + 1}: ${e.msg}`);
    return false;
  }
  asm = res;
  dirty = false;
  shown = null;
  const n = src.value.split('\n').length;
  hits = new Float32Array(n);
  heat = new Float32Array(n);
  cpu.load(res.bytes);
  anim = null;
  running = autorun;
  setStatus(`${res.size}${NB}байт · собрано`);
  updateRunBtn();
  vidDirty = true;
  return true;
}

/* ═══ Программы, частота, запуск ══════════════════════════════ */
function loadProgram(p) {
  prog = p;
  src.value = p.src;
  renderEditor();
  src.scrollTop = 0;
  $('progTitle').textContent = p.name;
  $('about').innerHTML = `<b>${p.name}.</b> ${p.about}`;
  document.querySelectorAll('#progs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.id === p.id)));
  setSpeed(p.speed);
  build(true);
  pcLine = -1;
}

const progs = $('progs');
PROGRAMS.forEach((p) => {
  const b = document.createElement('button');
  b.type = 'button'; b.role = 'tab'; b.dataset.id = p.id; b.textContent = p.name;
  b.addEventListener('click', () => loadProgram(p));
  progs.appendChild(b);
});

const speedSeg = $('speedSeg');
SPEEDS.forEach(([v, label]) => {
  const b = document.createElement('button');
  b.type = 'button'; b.dataset.v = v; b.textContent = label;
  b.addEventListener('click', () => setSpeed(v));
  speedSeg.appendChild(b);
});
function setSpeed(v) {
  speed = v;
  speedSeg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.v === v)));
  budget = 0;
  slowAcc = 0;
}

const PLAY_ICON = '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1.5l9 5.5-9 5.5z" fill="currentColor"/></svg>';
const PAUSE_ICON = '<svg viewBox="0 0 14 14" aria-hidden="true"><rect x="2.5" y="2" width="3" height="10" fill="currentColor"/><rect x="8.5" y="2" width="3" height="10" fill="currentColor"/></svg>';
function updateRunBtn() {
  const b = $('run');
  b.innerHTML = running ? `${PAUSE_ICON}Пауза` : `${PLAY_ICON}Пуск`;
  b.setAttribute('aria-label', running ? 'Пауза' : 'Пуск');
}
$('run').addEventListener('click', () => {
  if (dirty && !build(true)) return;
  if (cpu.halted) { cpu.load(asm.bytes); vidDirty = true; }
  running = !running;
  updateRunBtn();
});
function doStep() {
  if (dirty && !build(false)) return;
  running = false;
  updateRunBtn();
  if (cpu.waiting) cpu.tick();
  const pc = cpu.PC;
  if (cpu.step()) {
    const ln = asm.lineOf[pc];
    if (ln >= 0) hits[ln]++;
    anim = { t0: performance.now(), dur: 900, last: cpu.last };
    showNow(true);
  }
}
$('step').addEventListener('click', doStep);
function doReset() { if (!dirty || build(running)) { cpu.load(asm.bytes); anim = null; vidDirty = true; hits.fill(0); heat.fill(0); } }
$('reset').addEventListener('click', doReset);
$('build').addEventListener('click', () => build(true));

/* ═══ Клавиатура и крестовина ═════════════════════════════════ */
const KEYMAP = { ArrowUp: 1, ArrowRight: 2, ArrowDown: 3, ArrowLeft: 4, ' ': 5 };
addEventListener('keydown', (e) => {
  if (e.target === src) return;
  if (e.key in KEYMAP && !e.metaKey && !e.ctrlKey) {
    cpu.key = KEYMAP[e.key];
    if (e.key.startsWith('Arrow') || e.key === ' ') e.preventDefault();
    return;
  }
  if (e.key === 's' || e.key === 'S' || e.key === 'ы' || e.key === 'Ы') doStep();
  else if (e.key === 'r' || e.key === 'R' || e.key === 'к') doReset();
});
document.querySelectorAll('#pad button').forEach((b) => {
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); cpu.key = +b.dataset.k; b.classList.add('on'); ensureAudio(); });
  const off = () => b.classList.remove('on');
  b.addEventListener('pointerup', off);
  b.addEventListener('pointerleave', off);
  b.addEventListener('pointercancel', off);
});

/* ═══ Звук (порт 3) ═══════════════════════════════════════════ */
let actx = null, osc = null, gain = null, lastTone = -1;
function ensureAudio() {
  if (!soundOn || actx) return;
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    osc = actx.createOscillator();
    osc.type = 'square';
    const filt = actx.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = 1800; filt.Q.value = 0.4;
    gain = actx.createGain();
    gain.gain.value = 0;
    osc.connect(filt).connect(gain).connect(actx.destination);
    osc.start();
  } catch (err) { actx = null; }
}
$('sound').addEventListener('click', () => {
  soundOn = !soundOn;
  $('sound').setAttribute('aria-pressed', String(soundOn));
  if (soundOn) { ensureAudio(); if (actx && actx.state === 'suspended') actx.resume(); }
  else if (gain) gain.gain.setTargetAtTime(0, actx.currentTime, 0.02);
  lastTone = -1;
});
function updateSound() {
  if (!actx || !soundOn) return;
  const v = cpu.out[3] | 0;
  if (v === lastTone) return;
  lastTone = v;
  const t = actx.currentTime;
  if (!v || !running) gain.gain.setTargetAtTime(0, t, 0.02);
  else {
    osc.frequency.setTargetAtTime(55 * Math.pow(2, Math.min(v, 72) / 12), t, 0.004);
    gain.gain.setTargetAtTime(0.06, t, 0.01);
  }
}

/* ═══ Цикл эмуляции ═══════════════════════════════════════════ */
let budget = 0, slowAcc = 0, dispAcc = 0, lastT = 0;

let shown = null;                 // «показательная» команда кадра: последняя, кроме WAIT
function runFast(n) {
  const lineOf = asm.lineOf;
  let k = 0;
  while (k < n && !cpu.halted && !cpu.waiting) {
    const pc = cpu.PC;
    cpu.step();
    const ln = lineOf[pc];
    if (ln >= 0) hits[ln]++;
    if (cpu.last.op && cpu.last.op.base !== 0x03) shown = cpu.last;
    k++;
  }
  return k;
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = lastT ? Math.min((now - lastT) / 1000, 0.1) : 1 / 60;
  lastT = now;
  const act0 = { ...cpu.activity };
  let executed = 0;

  if (running && asm && !cpu.halted) {
    if (speed <= SLOW) {
      slowAcc += dt;
      const interval = 1 / speed;
      if (slowAcc >= interval) {
        slowAcc -= interval;
        if (slowAcc > interval) slowAcc = 0;
        if (cpu.waiting) cpu.tick();
        const pc = cpu.PC;
        if (cpu.step()) {
          executed = 1;
          const ln = asm.lineOf[pc];
          if (ln >= 0) hits[ln]++;
          anim = { t0: now, dur: Math.min(interval * 1000 * 0.92, 1400), last: cpu.last };
          showNow(true);
        }
      }
    } else {
      budget += speed * dt;
      const n = Math.min(Math.floor(budget), 200000);
      budget -= n;
      executed = runFast(n);
      if (cpu.waiting || cpu.halted) budget = 0;   // процессор ждёт кадра — лишние такты сгорают
    }
  }
  // кадр дисплея — ровно 60 раз в секунду
  dispAcc += dt;
  while (dispAcc >= 1 / 60) { dispAcc -= 1 / 60; cpu.tick(); }

  // статистика
  ipsAcc += executed; ipsT += dt;
  if (ipsT >= 0.5) { ips = ipsAcc / ipsT; ipsAcc = 0; ipsT = 0; }
  const d = {};
  for (const k in cpu.activity) d[k] = cpu.activity[k] - act0[k];
  const busy = executed > 0;
  busAct += ((busy ? Math.min(1, 0.35 + Math.log10(executed + 1) / 5) : 0) - busAct) * 0.25;
  const vw = cpu.last && cpu.last.addr >= VRAM && cpu.last.op && cpu.last.op.cls === 'store' ? 1 : 0;
  vidAct += ((d.store > 0 ? Math.min(1, 0.4 + d.store / 400) : vw) - vidAct) * 0.2;
  ioAct += ((d.io > 0 ? Math.min(1, 0.5 + d.io / 50) : 0) - ioAct) * 0.2;
  if (cpu.last) {
    const L = cpu.last;
    busAddr = L.addr >= 0 ? L.addr : L.pc;
    busData = L.data >= 0 ? L.data : (L.op ? cpu.mem[L.pc] : 0);
  }

  if (cpu.halted && running) {
    running = false;
    updateRunBtn();
    toast(cpu.last && !cpu.last.op ? 'Процессор встретил неизвестный байт и остановился.' : 'Программа завершилась (HLT).');
  }

  updateSound();
  uiTick(now);
  draw(now);
}

/* ── Обновление подсветки строки, «жара» и тикера ─────────────── */
let uiT = 0, heatT = 0, nowT = 0;
function uiTick(now) {
  if (!asm || dirty) return;
  if (speed <= 1000 || !running || now - uiT > 110) {
    uiT = now;
    const ln = anim && speed <= SLOW ? asm.lineOf[anim.last.pc] : asm.lineOf[cpu.last ? cpu.last.pc : cpu.PC];
    setPcLine(ln);
  }
  if (now - heatT > 220) {
    heatT = now;
    let max = 0;
    for (let i = 0; i < hits.length; i++) if (hits[i] > max) max = hits[i];
    for (let i = 0; i < hits.length && i < lineEls.length; i++) {
      const target = max > 0 ? Math.sqrt(hits[i] / max) : 0;
      const h = heat[i] * 0.55 + target * 0.45;
      if (Math.abs(h - heat[i]) > 0.02 || (h < 0.02 && heat[i] >= 0.02)) {
        const el = lineEls[i].children[1];
        el.style.transform = `scaleX(${h.toFixed(2)})`;
        el.style.opacity = h > 0.02 ? (0.35 + h * 0.65).toFixed(2) : '0';
      }
      heat[i] = h;
      hits[i] = 0;
    }
  }
  if (speed > SLOW && running && now - nowT > 180) { nowT = now; showNow(false); }
}
function showNow(slow) {
  const L = cpu.last;
  if (!L) return;
  const d = disasm(cpu.mem, L.pc);
  $('nowIns').innerHTML = `<span>0x${hex3(L.pc)}</span>${esc(d.text)}`;
  $('nowWhy').textContent = slow || speed <= 1000 || !running
    ? explain(L)
    : `${fmtIps(ips)} — слишком быстро, чтобы читать. Снизьте частоту до 1 Гц и смотрите по шагам.`;
}
function fmtIps(v) {
  if (v >= 1e6) return `≈${NB}${(v / 1e6).toFixed(2).replace('.', ',')}${NB}млн команд в секунду`;
  if (v >= 1e3) return `≈${NB}${Math.round(v / 1e3)}${NB}тыс. команд в секунду`;
  return `≈${NB}${Math.round(v)}${NB}команд в секунду`;
}

/* ═══ Плата: раскладка ═════════════════════════════════════════ */
const canvas = $('board');
const ctx = canvas.getContext('2d');
let dpr = 1, cssW = 0, cssH = 0, L = null, bg = null, vidLayer = null, vidDirty = true;
const vidSnap = new Uint8Array(1024);
const heatCanvas = document.createElement('canvas');
let heatCtx = null, heatImg = null;

const WIDE = {
  w: 1000, h: 740, tall: false,
  cpu: { x: 28, y: 64, w: 320, h: 478 },
  die: { x: 44, y: 80, w: 288, h: 446 },
  ram: { x: 410, y: 64, w: 200, h: 340 },
  heat: { x: 422, y: 104, w: 176, h: 176, cols: 64, rows: 64 },
  led: { x: 640, y: 44, w: 340, h: 340 },
  seg7: { x: 372, y: 506, w: 196, h: 76 },
  bar: { x: 372, y: 608, w: 196, h: 48 },
  spk: { cx: 670, cy: 590, r: 50 },
  pad: { x: 800, y: 500, w: 156, h: 156 },
  xtal: { x: 48, y: 596, w: 132, h: 44 },
  addr: { x1: 348, x2: 410, y: 108, gap: 7 },
  data: { x1: 348, x2: 410, y: 222, gap: 7 },
  vid: { x1: 610, x2: 640, y: 300, gap: 10 },
  io: { x1: 348, x2: 800, y: 444, gap: 7 },
};
const TALL = {
  w: 400, h: 820, tall: true,
  led: { x: 20, y: 16, w: 360, h: 360 },
  seg7: { x: 20, y: 390, w: 176, h: 64 },
  bar: { x: 208, y: 390, w: 172, h: 64 },
  cpu: { x: 16, y: 470, w: 368, h: 236 },
  die: { x: 28, y: 480, w: 344, h: 216 },
  ram: { x: 16, y: 718, w: 368, h: 94 },
  heat: { x: 28, y: 726, w: 344, h: 78, cols: 128, rows: 32 },
};

function layout() {
  const r = canvas.getBoundingClientRect();
  cssW = r.width; cssH = r.height;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(cssW * dpr));
  canvas.height = Math.max(1, Math.round(cssH * dpr));
  const D = cssW / Math.max(cssH, 1) < 0.9 ? TALL : WIDE;
  const s = Math.min(cssW / D.w, cssH / D.h);
  L = { ...D, s, ox: (cssW - D.w * s) / 2, oy: (cssH - D.h * s) / 2 };
  heatCanvas.width = D.heat.cols; heatCanvas.height = D.heat.rows;
  heatCtx = heatCanvas.getContext('2d');
  heatImg = heatCtx.createImageData(D.heat.cols, D.heat.rows);
  // крестовина поверх платы (в высокой раскладке она уходит под плату)
  const pad = $('pad');
  if (!D.tall && D.pad) {
    pad.style.cssText = `left:${L.ox + D.pad.x * s}px;top:${L.oy + D.pad.y * s}px;width:${D.pad.w * s}px;height:${D.pad.h * s}px`;
  } else pad.style.cssText = '';
  buildBackground();
  buildLedSprites();
  vidDirty = true;
}

/* ═══ Плата: статичный фон ════════════════════════════════════ */
const F_TECH = (px, w = 700) => `${w} ${px}px Tektur, 'IBM Plex Mono', monospace`;
const F_MONO = (px, w = 500) => `${w} ${px}px 'IBM Plex Mono', ui-monospace, monospace`;
const SILK = 'rgba(236, 229, 209, 0.72)';
const SILK_DIM = 'rgba(236, 229, 209, 0.45)';

function rr(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function seeded(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

function buildBackground() {
  bg = document.createElement('canvas');
  bg.width = canvas.width; bg.height = canvas.height;
  const c = bg.getContext('2d');
  // текстолит
  const g = c.createRadialGradient(bg.width * 0.45, bg.height * 0.4, 0, bg.width * 0.5, bg.height * 0.5, Math.max(bg.width, bg.height) * 0.75);
  g.addColorStop(0, '#13201b'); g.addColorStop(1, '#090e0c');
  c.fillStyle = g; c.fillRect(0, 0, bg.width, bg.height);
  const rnd = seeded(7);
  c.fillStyle = 'rgba(160, 200, 180, 0.035)';
  for (let i = 0; i < (bg.width * bg.height) / 260; i++) c.fillRect(rnd() * bg.width, rnd() * bg.height, 1.2 * dpr, 1.2 * dpr);

  c.setTransform(dpr * L.s, 0, 0, dpr * L.s, dpr * L.ox, dpr * L.oy);
  // заливка медью по краю платы и крепёжные отверстия
  c.strokeStyle = 'rgba(199, 128, 63, 0.16)';
  c.lineWidth = 1;
  rr(c, 8, 8, L.w - 16, L.h - 16, 14); c.stroke();
  for (const [x, y] of [[22, 22], [L.w - 22, 22], [22, L.h - 22], [L.w - 22, L.h - 22]]) {
    c.fillStyle = '#b89350'; c.beginPath(); c.arc(x, y, 8, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#050706'; c.beginPath(); c.arc(x, y, 4.5, 0, Math.PI * 2); c.fill();
  }
  if (!L.tall) {
    c.fillStyle = SILK; c.font = F_TECH(14, 700);
    c.fillText('КС-8 · ПЛАТА ПРОЦЕССОРНАЯ · РЕВ. 2', 44, 44);
    c.fillStyle = SILK_DIM; c.font = F_MONO(11);
    c.textAlign = 'right'; c.fillText('ВЫПУСК 2026·09 · СДЕЛАНО В БРАУЗЕРЕ', L.w - 44, L.h - 16); c.textAlign = 'left';
  }

  // шины (тусклая медь; активные линии дорисовываются каждый кадр)
  const trace = (x1, y1, x2, y2) => { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); };
  c.strokeStyle = 'rgba(199, 128, 63, 0.38)'; c.lineWidth = 2; c.lineCap = 'round';
  if (!L.tall) {
    for (let i = 0; i < 12; i++) trace(L.addr.x1, L.addr.y + i * L.addr.gap, L.addr.x2, L.addr.y + i * L.addr.gap);
    for (let i = 0; i < 8; i++) trace(L.data.x1, L.data.y + i * L.data.gap, L.data.x2, L.data.y + i * L.data.gap);
    for (let i = 0; i < 4; i++) trace(L.vid.x1, L.vid.y + i * L.vid.gap, L.vid.x2, L.vid.y + i * L.vid.gap);
    for (let i = 0; i < 6; i++) trace(L.io.x1, L.io.y + i * L.io.gap, L.io.x2, L.io.y + i * L.io.gap);
    // отводы шины ввода-вывода к устройствам
    trace(470, L.io.y + 5 * L.io.gap, 470, L.seg7.y);
    trace(590, L.io.y + 5 * L.io.gap, 590, L.bar.y + L.bar.h / 2); trace(590, L.bar.y + L.bar.h / 2, L.bar.x + L.bar.w, L.bar.y + L.bar.h / 2);
    trace(L.spk.cx, L.io.y + 5 * L.io.gap, L.spk.cx, L.spk.cy - L.spk.r);
    trace(114, L.cpu.y + L.cpu.h, 114, L.xtal.y);
    c.fillStyle = SILK_DIM; c.font = F_MONO(11);
    c.fillText('A0–A11', L.addr.x1 + 8, L.addr.y - 8);
    c.fillText('D0–D7', L.data.x1 + 8, L.data.y - 8);
    c.fillText('ВВОД-ВЫВОД · 6 ЛИНИЙ', L.io.x1 + 14, L.io.y - 8);
    // переходные отверстия
    for (let i = 0; i < 6; i++) { c.fillStyle = '#b89350'; c.beginPath(); c.arc(L.io.x2, L.io.y + i * L.io.gap, 2.4, 0, 7); c.fill(); }
  } else {
    for (let i = 0; i < 20; i++) trace(34 + i * 17, L.cpu.y + L.cpu.h, 34 + i * 17, L.ram.y);
  }

  // корпус процессора с выводами
  const pkg = (r, pinsX, pinsY, pinW) => {
    c.fillStyle = '#b89350';
    if (pinsX) for (let x = r.x + 14; x < r.x + r.w - 10; x += pinsX) { c.fillRect(x, r.y - 6, pinW, 6); c.fillRect(x, r.y + r.h, pinW, 6); }
    if (pinsY) for (let y = r.y + 14; y < r.y + r.h - 10; y += pinsY) { c.fillRect(r.x - 6, y, 6, pinW); c.fillRect(r.x + r.w, y, 6, pinW); }
    const g2 = c.createLinearGradient(0, r.y, 0, r.y + r.h);
    g2.addColorStop(0, '#1b1e1d'); g2.addColorStop(1, '#101211');
    c.fillStyle = g2; rr(c, r.x, r.y, r.w, r.h, 6); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.07)'; c.lineWidth = 1; rr(c, r.x + .5, r.y + .5, r.w - 1, r.h - 1, 6); c.stroke();
  };
  pkg(L.cpu, L.tall ? 0 : 16, L.tall ? 0 : 16, 5);
  // кристалл и золотые проволочки
  c.fillStyle = '#0b100e'; rr(c, L.die.x, L.die.y, L.die.w, L.die.h, 4); c.fill();
  c.strokeStyle = 'rgba(214, 170, 90, 0.35)'; c.lineWidth = 1; rr(c, L.die.x, L.die.y, L.die.w, L.die.h, 4); c.stroke();

  pkg(L.ram, 0, L.tall ? 0 : 14, 5);
  c.fillStyle = SILK; c.font = F_TECH(L.tall ? 12 : 13, 700);
  if (!L.tall) {
    c.fillText('ОЗУ · 4 КБ', L.ram.x + 12, L.ram.y + 26);
    c.fillStyle = SILK_DIM; c.font = F_MONO(11);
    c.fillText('4096 × 8 бит', L.ram.x + 118, L.ram.y + 26);
    const legend = [['0x000', 'код и данные'], ['0xB00', 'стек'], ['0xC00', 'видеопамять']];
    legend.forEach(([a, t], i) => {
      c.fillStyle = 'rgba(255, 212, 138, .85)'; c.fillText(a, L.ram.x + 12, L.heat.y + L.heat.h + 26 + i * 18);
      c.fillStyle = SILK_DIM; c.fillText(t, L.ram.x + 64, L.heat.y + L.heat.h + 26 + i * 18);
    });
    c.fillStyle = 'rgba(127, 214, 191, .9)'; c.fillRect(L.ram.x + 12, L.ram.y + L.ram.h - 22, 8, 8);
    c.fillStyle = SILK_DIM; c.fillText('чтение', L.ram.x + 26, L.ram.y + L.ram.h - 14);
    c.fillStyle = 'rgba(255, 178, 63, .95)'; c.fillRect(L.ram.x + 96, L.ram.y + L.ram.h - 22, 8, 8);
    c.fillStyle = SILK_DIM; c.fillText('запись', L.ram.x + 110, L.ram.y + L.ram.h - 14);
  }

  // рамка матрицы
  const m = L.led;
  c.fillStyle = '#070808'; rr(c, m.x - 10, m.y - 10, m.w + 20, m.h + 20, 10); c.fill();
  c.strokeStyle = 'rgba(255,255,255,.08)'; rr(c, m.x - 9.5, m.y - 9.5, m.w + 19, m.h + 19, 10); c.stroke();
  if (!L.tall) {
    c.fillStyle = SILK; c.font = F_TECH(13, 700);
    c.fillText('МАТРИЦА 32×32', m.x - 8, m.y + m.h + 34);
    c.fillStyle = SILK_DIM; c.font = F_MONO(11);
    c.fillText('1024 светодиода · 0xC00–0xFFF', m.x + 124, m.y + m.h + 34);
  }

  // табло, линейка, динамик, кварц
  const s7 = L.seg7;
  c.fillStyle = '#140807'; rr(c, s7.x, s7.y, s7.w, s7.h, 6); c.fill();
  c.strokeStyle = 'rgba(255, 90, 74, .18)'; rr(c, s7.x + .5, s7.y + .5, s7.w - 1, s7.h - 1, 6); c.stroke();
  const b = L.bar;
  c.fillStyle = '#0a0f0c'; rr(c, b.x, b.y, b.w, b.h, 6); c.fill();
  c.strokeStyle = 'rgba(255,255,255,.07)'; rr(c, b.x + .5, b.y + .5, b.w - 1, b.h - 1, 6); c.stroke();
  c.fillStyle = SILK_DIM; c.font = F_MONO(11);
  if (!L.tall) {
    c.fillText('ТАБЛО · ПОРТ 2', s7.x, s7.y - 10);
    c.fillText('ИНДИКАТОРЫ · ПОРТ 4', b.x, b.y + b.h + 18);
    const sp = L.spk;
    c.fillText('ДИНАМИК · ПОРТ 3', sp.cx - 52, sp.cy + sp.r + 24);
    c.fillStyle = '#151817'; c.beginPath(); c.arc(sp.cx, sp.cy, sp.r, 0, 7); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.08)'; c.stroke();
    c.fillStyle = '#060807';
    for (let rI = 1; rI <= 4; rI++) {
      const n = rI * 8;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        c.beginPath(); c.arc(sp.cx + Math.cos(a) * rI * 10, sp.cy + Math.sin(a) * rI * 10, 2, 0, 7); c.fill();
      }
    }
    c.fillStyle = SILK_DIM;
    c.fillText('КЛАВИШИ · ПОРТ 0', L.pad.x, L.pad.y - 12);
    // кварц
    const x = L.xtal;
    const g3 = c.createLinearGradient(0, x.y, 0, x.y + x.h);
    g3.addColorStop(0, '#d9dcd8'); g3.addColorStop(1, '#8e938f');
    c.fillStyle = g3; rr(c, x.x, x.y, x.w, x.h, x.h / 2); c.fill();
    c.fillStyle = '#1b1e1d'; c.font = F_TECH(12, 700);
    c.fillText('КВАРЦ', x.x + 18, x.y + 27);
    c.fillStyle = SILK_DIM; c.font = F_MONO(11);
    c.fillText('ТАКТ', x.x + x.w + 14, x.y + 16);
    // конденсаторы и резисторы для правдоподобия
    const smd = (x0, y0, lab, vert) => {
      c.fillStyle = '#b89350';
      if (vert) { c.fillRect(x0, y0, 10, 4); c.fillRect(x0, y0 + 14, 10, 4); c.fillStyle = '#2b2622'; c.fillRect(x0, y0 + 4, 10, 10); }
      else { c.fillRect(x0, y0, 4, 10); c.fillRect(x0 + 14, y0, 4, 10); c.fillStyle = '#2b2622'; c.fillRect(x0 + 4, y0, 10, 10); }
      c.fillStyle = SILK_DIM; c.font = F_MONO(10); c.fillText(lab, x0 + (vert ? 14 : 0), y0 + (vert ? 12 : 22));
    };
    smd(60, 664, 'C1'); smd(96, 664, 'C2'); smd(132, 664, 'R1'); smd(168, 664, 'R2');

  }

  c.setTransform(1, 0, 0, 1, 0, 0);
}

/* ── Спрайты светодиодов ─────────────────────────────────────── */
let ledSprites = [], ledOff = null, ledPitch = 10, ledSize = 0;
function buildLedSprites() {
  ledPitch = L.led.w / 32;
  const px = ledPitch * L.s * dpr;
  ledSize = Math.ceil(px * 2.2);
  ledSprites = PAL.map((col, i) => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = ledSize;
    const c = cv.getContext('2d');
    const mid = ledSize / 2, core = px * 0.36;
    if (i === 0) return null;
    const [r, g, b] = PAL_RGB[i];
    const glow = c.createRadialGradient(mid, mid, 0, mid, mid, px * 1.05);
    glow.addColorStop(0, `rgba(${r},${g},${b},0.55)`);
    glow.addColorStop(0.45, `rgba(${r},${g},${b},0.16)`);
    glow.addColorStop(1, `rgba(${r},${g},${b},0)`);
    c.fillStyle = glow; c.fillRect(0, 0, ledSize, ledSize);
    const body = c.createRadialGradient(mid - core * 0.3, mid - core * 0.3, 0, mid, mid, core);
    body.addColorStop(0, '#ffffff');
    body.addColorStop(0.35, col);
    body.addColorStop(1, `rgba(${r * 0.6 | 0},${g * 0.6 | 0},${b * 0.6 | 0},1)`);
    c.fillStyle = body; c.beginPath(); c.arc(mid, mid, core, 0, Math.PI * 2); c.fill();
    return cv;
  });
  ledOff = document.createElement('canvas');
  ledOff.width = ledOff.height = ledSize;
  const c = ledOff.getContext('2d');
  const mid = ledSize / 2, core = px * 0.34;
  const g = c.createRadialGradient(mid - core * 0.3, mid - core * 0.3, 0, mid, mid, core);
  g.addColorStop(0, '#2a302d'); g.addColorStop(1, '#121614');
  c.fillStyle = g; c.beginPath(); c.arc(mid, mid, core, 0, Math.PI * 2); c.fill();
  vidLayer = document.createElement('canvas');
  vidLayer.width = Math.ceil((L.led.w + 24) * L.s * dpr);
  vidLayer.height = Math.ceil((L.led.h + 24) * L.s * dpr);
}

function renderVideo() {
  let changed = vidDirty;
  const mem = cpu.mem;
  for (let i = 0; i < 1024; i++) {
    const v = mem[VRAM + i] & 15;
    if (vidSnap[i] !== v) { vidSnap[i] = v; changed = true; }
  }
  if (!changed) return;
  vidDirty = false;
  const c = vidLayer.getContext('2d');
  c.clearRect(0, 0, vidLayer.width, vidLayer.height);
  const k = L.s * dpr, pitch = ledPitch * k, off = 12 * k;
  c.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 1024; i++) {
    const x = off + ((i & 31) + 0.5) * pitch - ledSize / 2;
    const y = off + ((i >> 5) + 0.5) * pitch - ledSize / 2;
    c.drawImage(ledOff, x, y);
  }
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 1024; i++) {
    const v = vidSnap[i];
    if (!v) continue;
    const x = off + ((i & 31) + 0.5) * pitch - ledSize / 2;
    const y = off + ((i >> 5) + 0.5) * pitch - ledSize / 2;
    c.drawImage(ledSprites[v], x, y);
  }
  c.globalCompositeOperation = 'source-over';
}

function renderHeat() {
  const H = L.heat, d = heatImg.data, mem = cpu.mem, R = cpu.reads, W = cpu.writes;
  const codeEnd = asm ? asm.size : 0;
  const n = H.cols * H.rows;
  for (let a = 0; a < n; a++) {
    const v = mem[a];
    let r, g, b;
    if (a >= VRAM) {
      const p = PAL_RGB[v & 15];
      r = 14 + p[0] * 0.62; g = 16 + p[1] * 0.62; b = 15 + p[2] * 0.62;
    } else {
      const k = 16 + v * 0.16;
      r = k * 0.72; g = k * 0.95; b = k * 0.86;
      if (a < codeEnd) { r += 16; g += 10; b += 2; }
    }
    const rd = R[a], wr = W[a];
    const k2 = a >= VRAM ? 0.35 : 1;          // в видеопамяти главное — сама картинка
    r += (rd * 30 + wr * 120) * k2; g += (rd * 95 + wr * 80) * k2; b += (rd * 90 + wr * 18) * k2;
    R[a] = rd * 0.84; W[a] = wr * 0.86;
    const o = a * 4;
    d[o] = r > 255 ? 255 : r; d[o + 1] = g > 255 ? 255 : g; d[o + 2] = b > 255 ? 255 : b; d[o + 3] = 255;
  }
  heatCtx.putImageData(heatImg, 0, 0);
}

/* ═══ Плата: каждый кадр ══════════════════════════════════════ */
const AMBER = '#ffb23f';
function phaseActive(cls) {
  // в медленном режиме: какие блоки горят в текущей фазе команды
  if (!anim) return null;
  const p = Math.min(1, (performance.now() - anim.t0) / anim.dur);
  return { p, fetch: p < 0.38, decode: p >= 0.38 && p < 0.52, exec: p >= 0.52, cls: anim.last.op ? anim.last.op.cls : 'none' };
}

function draw(now) {
  if (!L) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(bg, 0, 0);
  ctx.setTransform(dpr * L.s, 0, 0, dpr * L.s, dpr * L.ox, dpr * L.oy);

  const slow = speed <= SLOW || !running;
  const ph = slow ? phaseActive() : null;
  const lastOp = cpu.last && cpu.last.op;

  // ── шины ──
  const busLines = (bus, count, value, on, horizontal = true, dirRight = true, pulse = -1) => {
    for (let i = 0; i < count; i++) {
      const bit = (value >> i) & 1;
      const y = bus.y + i * bus.gap;
      if (on > 0.02 && bit) {
        ctx.strokeStyle = `rgba(255, 178, 63, ${0.18 * on})`; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(bus.x1, y); ctx.lineTo(bus.x2, y); ctx.stroke();
        ctx.strokeStyle = `rgba(255, 205, 120, ${0.95 * on})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(bus.x1, y); ctx.lineTo(bus.x2, y); ctx.stroke();
      }
      if (pulse >= 0 && bit) {
        const x = dirRight ? bus.x1 + (bus.x2 - bus.x1) * pulse : bus.x2 - (bus.x2 - bus.x1) * pulse;
        ctx.fillStyle = '#fff3d6'; ctx.beginPath(); ctx.arc(x, y, 2.6, 0, 7); ctx.fill();
      }
    }
  };
  if (!L.tall) {
    let aOn = busAct, dOn = busAct, aVal = busAddr, dVal = busData, aPulse = -1, dPulse = -1, dRight = false;
    if (ph) {
      const L2 = anim.last;
      aOn = dOn = 0;
      if (ph.fetch) {
        aVal = L2.pc; dVal = cpu.mem[L2.pc];
        const q = ph.p / 0.38;
        aOn = 1; aPulse = Math.min(1, q * 2);
        if (q > 0.5) { dOn = 1; dPulse = (q - 0.5) * 2; dRight = false; }
      } else if (ph.exec && L2.addr >= 0 && ['load', 'store', 'stack'].includes(ph.cls)) {
        const q = (ph.p - 0.52) / 0.48;
        aVal = L2.addr; dVal = L2.data & 0xFF; aOn = 1; dOn = 1;
        aPulse = Math.min(1, q * 2);
        dRight = ph.cls === 'store' || (ph.cls === 'stack' && (L2.op.mnem === 'PUSH' || L2.op.mnem === 'CALL' || L2.op.mnem === 'PUSHI'));
        dPulse = Math.max(0, q * 2 - 1);
      }
    }
    busLines(L.addr, 12, aVal, aOn, true, true, aPulse);
    busLines(L.data, 8, dVal, dOn, true, dRight, dPulse);
    const vOn = ph ? (ph.exec && anim.last.addr >= VRAM && ph.cls === 'store' ? 1 : 0) : vidAct;
    busLines(L.vid, 4, 0xF, vOn, true, true, ph && vOn ? (ph.p - 0.52) / 0.48 : -1);
    const iOn = ph ? (ph.exec && ph.cls === 'io' ? 1 : 0) : ioAct;
    busLines(L.io, 6, 0x3F, iOn, true, !(anim && anim.last.op && anim.last.op.mnem === 'IN'), ph && iOn ? (ph.p - 0.52) / 0.48 : -1);
  }

  drawCPU(ph, slow);

  // ── память ──
  renderHeat();
  ctx.imageSmoothingEnabled = false;
  const H = L.heat;
  ctx.drawImage(heatCanvas, H.x, H.y, H.w, H.h);
  ctx.imageSmoothingEnabled = true;
  const cellW = H.w / H.cols, cellH = H.h / H.rows;
  const mark = (addr, color) => {
    const cx = H.x + (addr % H.cols) * cellW, cy = H.y + Math.floor(addr / H.cols) * cellH;
    ctx.strokeStyle = color; ctx.lineWidth = 1.2;
    ctx.strokeRect(cx - 2, cy - 2, cellW + 4, cellH + 4);
  };
  mark(cpu.PC, '#ffd48a');
  mark(cpu.I, '#7fd6bf');
  mark(cpu.SP, '#c9a2ff');

  // ── матрица ──
  renderVideo();
  const m = L.led;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(vidLayer, Math.round(dpr * (L.ox + (m.x - 12) * L.s)), Math.round(dpr * (L.oy + (m.y - 12) * L.s)));
  ctx.setTransform(dpr * L.s, 0, 0, dpr * L.s, dpr * L.ox, dpr * L.oy);

  drawSeg7(cpu.out[2] | 0);
  drawBar(cpu.out[4] | 0);
  if (!L.tall) drawSpeaker(now);
  if (!L.tall) drawClock(now, ph);
}

function box(x, y, w, h, label, value, on, valueColor) {
  ctx.fillStyle = on ? 'rgba(255, 178, 63, 0.14)' : 'rgba(255,255,255,0.025)';
  rr(ctx, x, y, w, h, 3); ctx.fill();
  ctx.strokeStyle = on ? 'rgba(255, 178, 63, 0.85)' : 'rgba(236, 229, 209, 0.16)';
  ctx.lineWidth = 1; rr(ctx, x + .5, y + .5, w - 1, h - 1, 3); ctx.stroke();
  ctx.fillStyle = on ? '#ffd48a' : 'rgba(236,229,209,.6)';
  ctx.font = F_MONO(11); ctx.fillText(label, x + 8, y + 15);
  ctx.fillStyle = valueColor || (on ? '#fff1d0' : '#ece5d1');
  ctx.font = F_MONO(h > 36 ? 16 : 14, 600);
  ctx.fillText(value, x + 8, y + h - (h > 36 ? 10 : 7));
}
function ledDot(x, y, r, on, rgb = '255, 178, 63') {
  if (on) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
    g.addColorStop(0, `rgba(${rgb}, .55)`); g.addColorStop(1, `rgba(${rgb}, 0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 3, 0, 7); ctx.fill();
    ctx.fillStyle = `rgb(${rgb})`;
  } else ctx.fillStyle = '#23201a';
  ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
}

function drawCPU(ph, slow) {
  const D = L.die, tall = L.tall;
  const last = anim && slow ? anim.last : (shown || cpu.last);
  const op = last && last.op;
  const cls = op ? op.cls : 'none';
  const hot = (part) => {
    if (!slow) return running && busAct > 0.1 && ({
      pc: true, ir: true, dec: true, alu: cls === 'alu', reg: true, idx: cls === 'index', sp: cls === 'stack',
    })[part];
    if (!ph) return false;
    if (part === 'pc') return ph.fetch || (ph.exec && cls === 'jump');
    if (part === 'ir') return ph.fetch && ph.p > 0.19;
    if (part === 'dec') return ph.decode;
    if (!ph.exec) return false;
    if (part === 'alu') return cls === 'alu';
    if (part === 'idx') return cls === 'index' || (op && (op.form === 'rI' || op.form === 'Ir'));
    if (part === 'sp') return cls === 'stack';
    if (part === 'reg') return ['alu', 'load', 'reg', 'io'].includes(cls) || (op && op.mnem === 'POP');
    return false;
  };
  const dis = last ? disasm(cpu.mem, last.pc).text : '—';
  const opByte = last ? hex2(cpu.mem[last.pc]) : '--';

  if (!tall) {
    ctx.fillStyle = SILK; ctx.font = F_TECH(13, 700);
    ctx.fillText('ЦП · КС-8', D.x + 12, D.y + 22);
    ctx.fillStyle = SILK_DIM; ctx.font = F_MONO(11);
    ctx.fillText(`${(cpu.cycles).toLocaleString('ru-RU')} команд`, D.x + 118, D.y + 22);
    box(D.x + 12, D.y + 34, 88, 48, 'PC', '0x' + hex3(cpu.PC), hot('pc'));
    box(D.x + 108, D.y + 34, 168, 48, 'IR · 0x' + opByte, dis.length > 17 ? dis.slice(0, 16) + '…' : dis, hot('ir'), '#ffd48a');
    box(D.x + 12, D.y + 92, 88, 64, 'ДЕШИФР.', op ? op.mnem : '—', hot('dec'));
    // АЛУ — трапеция
    const ax = D.x + 116, ay = D.y + 92, aw = 160, ah = 64;
    const aOn = hot('alu');
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + aw, ay); ctx.lineTo(ax + aw - 26, ay + ah); ctx.lineTo(ax + 26, ay + ah); ctx.closePath();
    ctx.fillStyle = aOn ? 'rgba(255,178,63,.16)' : 'rgba(255,255,255,.025)'; ctx.fill();
    ctx.strokeStyle = aOn ? 'rgba(255,178,63,.85)' : 'rgba(236,229,209,.16)'; ctx.stroke();
    ctx.fillStyle = aOn ? '#ffd48a' : 'rgba(236,229,209,.6)'; ctx.font = F_MONO(11); ctx.fillText('АЛУ', ax + 66, ay + 16);
    ctx.fillStyle = '#ece5d1'; ctx.font = F_MONO(16, 600);
    const aluTxt = op && op.cls === 'alu' ? `${op.mnem} → ${last.data & 0xFF}` : '·';
    ctx.textAlign = 'center'; ctx.fillText(aluTxt, ax + aw / 2, ay + 44); ctx.textAlign = 'left';
    // флаги
    const fy = D.y + 174;
    ctx.font = F_MONO(12, 600);
    [['Z', cpu.Z, 'ноль'], ['C', cpu.C, 'перенос'], ['N', cpu.N, 'знак']].forEach(([n, v, t], i) => {
      const fx = D.x + 24 + i * 90;
      ledDot(fx, fy, 5, !!v, v ? '255, 90, 74' : '255, 90, 74');
      ctx.fillStyle = v ? '#ffcfc8' : 'rgba(236,229,209,.55)';
      ctx.fillText(n, fx + 12, fy + 4);
      ctx.fillStyle = 'rgba(236,229,209,.45)'; ctx.font = F_MONO(11); ctx.fillText(t, fx + 26, fy + 4); ctx.font = F_MONO(12, 600);
    });
    // регистры
    const ry = D.y + 196;
    const regOn = hot('reg');
    const target = op && ['alu', 'load', 'reg', 'io'].includes(op.cls) ? op.r : (op && op.mnem === 'POP' ? op.r : -1);
    ctx.fillStyle = SILK_DIM; ctx.font = F_MONO(11); ctx.fillText('РЕГИСТРЫ', D.x + 12, ry + 4);
    for (let i = 0; i < 8; i++) {
      const y = ry + 12 + i * 22;
      const on = regOn && i === target;
      ctx.fillStyle = on ? 'rgba(255,178,63,.14)' : (i % 2 ? 'rgba(255,255,255,.02)' : 'transparent');
      ctx.fillRect(D.x + 8, y, D.w - 16, 20);
      ctx.fillStyle = on ? '#ffd48a' : '#7fd6bf'; ctx.font = F_MONO(13, 600);
      ctx.fillText('R' + i, D.x + 14, y + 15);
      ctx.fillStyle = '#ece5d1'; ctx.fillText(hex2(cpu.r[i]), D.x + 46, y + 15);
      ctx.fillStyle = 'rgba(236,229,209,.55)'; ctx.font = F_MONO(11);
      ctx.fillText(String(cpu.r[i]).padStart(3, ' '), D.x + 72, y + 15);
      for (let bI = 0; bI < 8; bI++) ledDot(D.x + 118 + bI * 20, y + 10, 3.6, (cpu.r[i] >> (7 - bI)) & 1);
    }
    const iy = D.y + D.h - 48;
    box(D.x + 12, iy, 132, 40, 'I · индекс', '0x' + hex3(cpu.I), hot('idx'), '#7fd6bf');
    box(D.x + 152, iy, 124, 40, 'SP · стек', '0x' + hex3(cpu.SP), hot('sp'), '#c9a2ff');
  } else {
    // компактный кристалл для телефона
    box(D.x + 8, D.y + 6, 92, 42, 'PC', '0x' + hex3(cpu.PC), hot('pc'));
    box(D.x + 106, D.y + 6, 230, 42, 'IR · 0x' + opByte, dis.length > 22 ? dis.slice(0, 21) + '…' : dis, hot('ir'), '#ffd48a');
    box(D.x + 8, D.y + 54, 92, 36, 'АЛУ', op && op.cls === 'alu' ? op.mnem : '·', hot('alu'));
    [['Z', cpu.Z], ['C', cpu.C], ['N', cpu.N]].forEach(([n, v], i) => {
      const fx = D.x + 118 + i * 30;
      ledDot(fx, D.y + 72, 4.5, !!v, '255, 90, 74');
      ctx.fillStyle = 'rgba(236,229,209,.7)'; ctx.font = F_MONO(11, 600); ctx.fillText(n, fx + 8, D.y + 76);
    });
    box(D.x + 208, D.y + 54, 62, 36, 'I', hex3(cpu.I), hot('idx'), '#7fd6bf');
    box(D.x + 276, D.y + 54, 60, 36, 'SP', hex3(cpu.SP), hot('sp'), '#c9a2ff');
    for (let i = 0; i < 8; i++) {
      const col = i >> 2, row = i & 3;
      const x = D.x + 8 + col * 166, y = D.y + 98 + row * 28;
      ctx.fillStyle = '#7fd6bf'; ctx.font = F_MONO(12, 600); ctx.fillText('R' + i, x + 2, y + 16);
      ctx.fillStyle = '#ece5d1'; ctx.fillText(hex2(cpu.r[i]), x + 28, y + 16);
      for (let bI = 0; bI < 8; bI++) ledDot(x + 62 + bI * 12.5, y + 12, 3, (cpu.r[i] >> (7 - bI)) & 1);
    }
  }
}

const SEG = { 0: 0x3F, 1: 0x06, 2: 0x5B, 3: 0x4F, 4: 0x66, 5: 0x6D, 6: 0x7D, 7: 0x07, 8: 0x7F, 9: 0x6F };
function drawSeg7(v) {
  const r = L.seg7;
  const digits = String(v).padStart(3, ' ');
  const dw = (r.w - 24) / 3, dh = r.h - 20;
  for (let i = 0; i < 3; i++) {
    const ch = digits[i];
    const mask = ch === ' ' ? 0 : SEG[+ch];
    const x0 = r.x + 12 + i * dw + dw * 0.18, y0 = r.y + 10, w = dw * 0.62, h = dh, t = Math.max(3, w * 0.16);
    const segs = [
      [x0 + t * 0.6, y0, w - t * 1.2, t, 0], [x0 + w - t, y0 + t * 0.6, t, h / 2 - t * 0.9, 1], [x0 + w - t, y0 + h / 2 + t * 0.3, t, h / 2 - t * 0.9, 2],
      [x0 + t * 0.6, y0 + h - t, w - t * 1.2, t, 3], [x0, y0 + h / 2 + t * 0.3, t, h / 2 - t * 0.9, 4], [x0, y0 + t * 0.6, t, h / 2 - t * 0.9, 5],
      [x0 + t * 0.6, y0 + h / 2 - t / 2, w - t * 1.2, t, 6],
    ];
    for (const [x, y, sw, sh, bit] of segs) {
      const on = (mask >> bit) & 1;
      if (on) {
        ctx.fillStyle = 'rgba(255, 70, 40, .22)'; rr(ctx, x - 2, y - 2, sw + 4, sh + 4, 3); ctx.fill();
        ctx.fillStyle = '#ff5a3a';
      } else ctx.fillStyle = 'rgba(255, 90, 74, .07)';
      rr(ctx, x, y, sw, sh, Math.min(sw, sh) / 2); ctx.fill();
    }
  }
}
function drawBar(v) {
  const r = L.bar;
  for (let i = 0; i < 8; i++) {
    const x = r.x + 16 + i * ((r.w - 32) / 7), y = r.y + r.h / 2;
    ledDot(x, y, L.tall ? 5 : 5.5, (v >> (7 - i)) & 1, '92, 255, 150');
  }
}
function drawSpeaker(now) {
  const sp = L.spk, v = cpu.out[3] | 0;
  if (!v || !running) return;
  for (let k = 0; k < 3; k++) {
    const t = ((now / 700) + k / 3) % 1;
    ctx.strokeStyle = `rgba(255, 178, 63, ${0.5 * (1 - t)})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(sp.cx, sp.cy, sp.r + t * 26, 0, 7); ctx.stroke();
  }
}
function drawClock(now, ph) {
  const x = L.xtal;
  const label = SPEEDS.find((s) => s[0] === speed);
  ctx.fillStyle = '#1b1e1d'; ctx.font = F_MONO(12, 600);
  ctx.fillText(label ? label[1] : '', x.x + 70, x.y + 27);
  const blink = running && (speed <= SLOW ? (ph && ph.p < 0.25) : (speed >= 1000 || Math.floor(now / 250) % 2 === 0));
  ledDot(x.x + x.w + 26, x.y + 32, 5, !!blink);
  ctx.fillStyle = SILK_DIM; ctx.font = F_MONO(11);
  ctx.fillText(running ? fmtIps(ips).replace(' в секунду', '/с') : 'пауза', x.x + x.w + 40, x.y + 36);
}

/* ═══ Старт ═══════════════════════════════════════════════════ */
function onResize() { layout(); }
addEventListener('resize', onResize);
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(onResize).observe($('boardwrap'));

document.fonts && document.fonts.ready.then(() => { if (L) { buildBackground(); vidDirty = true; } });
loadProgram(PROGRAMS[0]);
updateRunBtn();
layout();
requestAnimationFrame(frame);
})();
