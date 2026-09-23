/* Машинка — пишущая машинка на Canvas: оттиск литер с дефектами, каретка, звонок, синтезированные звуки. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const DEG = Math.PI / 180;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const reduceMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  let seed = 20260923;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const rr = (a, b) => a + rnd() * (b - a);

  // ---------- Шрифт и размеры листа ----------
  const FONT_PX = 18, SS = 2;
  const FONT = (px) => `700 ${px}px "Courier New", Courier, Cousine, "PT Mono", monospace`;
  const COLS = 65, MARGIN = 10, BELL = 58;
  const mc = document.createElement('canvas').getContext('2d');
  let CW = 10.8, LINE = 18, SHEET_W = 0, SHEET_H = 0, TOP = 0, MAX_ROW = 0;
  function metrics() {
    mc.font = FONT(FONT_PX);
    CW = mc.measureText('М').width || 10.8;
    LINE = CW * 10 / 6;                         // 10 знаков на дюйм, 6 строк на дюйм
    SHEET_W = Math.round((COLS + MARGIN * 2) * CW);
    SHEET_H = Math.round(SHEET_W * 1.414);
    TOP = Math.round(CW * 10 * 0.9);
    MAX_ROW = Math.floor((SHEET_H - TOP * 2) / LINE);
  }
  metrics();

  // ---------- Состояние ----------
  const st = {
    col: 0, row: 0, colDisp: 0, rowDisp: 0, spacing: 1.5, ribbon: 'black', layout: 'ru', sound: true,
    cells: new Map(), sheetNo: 1, demo: [], demoNext: 0, bars: [], keys: new Map(), shake: 0, lastType: 0,
  };
  const INK = { black: [30, 26, 24], red: [168, 34, 28] };
  // Характер литер этой машинки: одни бьют сильнее, другие косят
  const PERSONA = { о: { ink: 1.18 }, ж: { rot: 2.4 }, е: { dy: -0.9 }, а: { dx: 0.35 }, т: { half: true }, р: { dy: 0.6 }, и: { rot: -1.3 }, в: { ink: 0.86 }, д: { dx: -0.4, rot: 1 }, я: { dy: 0.4 } };

  let sheet = null, sctx = null;
  const archive = [];
  function paperTexture(g, w, h) {
    g.fillStyle = '#f2ead9'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      const x = rnd() * w, y = rnd() * h, r = rr(40, 220) * SS;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(${rnd() < 0.5 ? '205,188,150' : '255,252,240'},${rr(0.03, 0.09)})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let i = 0; i < 14000; i++) {
      const x = rnd() * w, y = rnd() * h, len = rr(1, 7) * SS, a = rr(0, 6.28);
      g.strokeStyle = rnd() < 0.6 ? `rgba(120,98,66,${rr(0.03, 0.09)})` : `rgba(255,255,255,${rr(0.05, 0.14)})`;
      g.lineWidth = rr(0.4, 1) * SS / 2;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
    }
    const eg = g.createLinearGradient(0, 0, w, 0);
    eg.addColorStop(0, 'rgba(150,120,70,0.08)'); eg.addColorStop(0.04, 'rgba(0,0,0,0)'); eg.addColorStop(0.96, 'rgba(0,0,0,0)'); eg.addColorStop(1, 'rgba(150,120,70,0.08)');
    g.fillStyle = eg; g.fillRect(0, 0, w, h);
  }
  function newSheet(archiveOld) {
    if (archiveOld && sheet) archive.push({ canvas: sheet, text: sheetText() });
    sheet = document.createElement('canvas');
    sheet.width = SHEET_W * SS; sheet.height = SHEET_H * SS;
    sctx = sheet.getContext('2d');
    paperTexture(sctx, sheet.width, sheet.height);
    st.cells = new Map(); st.col = 0; st.row = 0; st.colDisp = 0; st.rowDisp = -3;
    st.sheetNo = archive.length + 1;
  }

  // ---------- Оттиск ----------
  const glyph = document.createElement('canvas');
  const GS = Math.ceil(FONT_PX * 2.6 * SS);
  glyph.width = glyph.height = GS;
  const gctx = glyph.getContext('2d');
  function stamp(ch, col, row, ribbon) {
    const p = PERSONA[ch.toLowerCase()] || {};
    const ink = clamp(rr(0.8, 0.97) * (p.ink || 1), 0.45, 1);
    const c = INK[ribbon];
    gctx.setTransform(1, 0, 0, 1, 0, 0);
    gctx.globalCompositeOperation = 'source-over';
    gctx.clearRect(0, 0, GS, GS);
    gctx.font = FONT(FONT_PX * SS);
    gctx.textAlign = 'center'; gctx.textBaseline = 'alphabetic';
    gctx.translate(GS / 2, GS * 0.62);
    gctx.rotate((rr(-0.6, 0.6) + (p.rot || 0)) * DEG);
    gctx.shadowColor = `rgba(${c[0]},${c[1]},${c[2]},0.5)`; gctx.shadowBlur = 1.4 * SS;
    gctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${ink})`;
    gctx.fillText(ch, 0, 0);
    gctx.shadowBlur = 0;
    // Износ ленты: крапинки без краски
    gctx.setTransform(1, 0, 0, 1, 0, 0);
    gctx.globalCompositeOperation = 'destination-out';
    const holes = Math.round((1.05 - ink) * 140 + 18);
    for (let i = 0; i < holes; i++) { gctx.fillStyle = `rgba(0,0,0,${rr(0.2, 0.85)})`; const s = rr(0.6, 2.2) * SS / 2; gctx.fillRect(rr(0, GS), rr(0, GS), s, s); }
    // Неровный удар: одна половина литеры бледнее
    if (p.half || rnd() < 0.08) {
      const top = rnd() < 0.5;
      const gr = gctx.createLinearGradient(0, GS * 0.25, 0, GS * 0.7);
      gr.addColorStop(top ? 0 : 1, 'rgba(0,0,0,0.55)'); gr.addColorStop(top ? 1 : 0, 'rgba(0,0,0,0)');
      gctx.fillStyle = gr; gctx.fillRect(0, 0, GS, GS);
    }
    gctx.globalCompositeOperation = 'source-over';
    const x = (MARGIN + col) * CW + CW / 2 + rr(-0.35, 0.35) + (p.dx || 0);
    const y = TOP + row * LINE + FONT_PX + rr(-0.45, 0.45) + (p.dy || 0);
    sctx.globalCompositeOperation = 'multiply';
    sctx.drawImage(glyph, x * SS - GS / 2, y * SS - GS * 0.62);
    sctx.globalCompositeOperation = 'source-over';
    const key = `${row}:${col}`;
    if (!st.cells.has(key)) st.cells.set(key, []);
    st.cells.get(key).push(ch);
  }
  function correct(col, row) {
    const x = (MARGIN + col) * CW, y = TOP + row * LINE + FONT_PX * 0.08;
    sctx.save();
    sctx.shadowColor = 'rgba(80,60,30,0.25)'; sctx.shadowBlur = 2 * SS; sctx.shadowOffsetY = 0.6 * SS;
    sctx.fillStyle = '#fbf8f0';
    for (let i = 0; i < 5; i++) { sctx.beginPath(); sctx.ellipse((x + CW / 2 + rr(-1.5, 1.5)) * SS, (y + FONT_PX * 0.55 + rr(-1.5, 1.5)) * SS, (CW * 0.62 + rr(0, 1.5)) * SS, (FONT_PX * 0.55 + rr(0, 1.5)) * SS, rr(-0.3, 0.3), 0, Math.PI * 2); sctx.fill(); }
    sctx.restore();
    const key = `${row}:${col}`;
    st.cells.set(key, [' ']);
  }
  function sheetText() {
    let maxRow = 0; for (const k of st.cells.keys()) maxRow = Math.max(maxRow, +k.split(':')[0]);
    const lines = [];
    const rows = [...new Set([...st.cells.keys()].map((k) => +k.split(':')[0]))].sort((a, b) => a - b);
    let prev = null;
    for (const r of rows) {
      if (prev !== null) for (let g = Math.round((r - prev) / Math.max(1, st.spacing)) - 1; g > 0; g--) lines.push('');
      let s = '';
      for (let c = 0; c < COLS; c++) { const a = st.cells.get(`${r}:${c}`); s += a ? a[a.length - 1] : ' '; }
      lines.push(s.replace(/\s+$/, ''));
      prev = r;
    }
    void maxRow;
    return lines.join('\n');
  }

  // ---------- Клавиатура ЙЦУКЕН ----------
  const ROWS = [
    ['Backquote', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal'],
    ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft', 'BracketRight'],
    ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote'],
    ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash'],
  ];
  const RU = {
    Backquote: ['ё', 'Ё'], Digit1: ['1', '!'], Digit2: ['2', '"'], Digit3: ['3', '№'], Digit4: ['4', ';'], Digit5: ['5', '%'], Digit6: ['6', ':'], Digit7: ['7', '?'], Digit8: ['8', '*'], Digit9: ['9', '('], Digit0: ['0', ')'], Minus: ['-', '_'], Equal: ['=', '+'],
    KeyQ: ['й', 'Й'], KeyW: ['ц', 'Ц'], KeyE: ['у', 'У'], KeyR: ['к', 'К'], KeyT: ['е', 'Е'], KeyY: ['н', 'Н'], KeyU: ['г', 'Г'], KeyI: ['ш', 'Ш'], KeyO: ['щ', 'Щ'], KeyP: ['з', 'З'], BracketLeft: ['х', 'Х'], BracketRight: ['ъ', 'Ъ'],
    KeyA: ['ф', 'Ф'], KeyS: ['ы', 'Ы'], KeyD: ['в', 'В'], KeyF: ['а', 'А'], KeyG: ['п', 'П'], KeyH: ['р', 'Р'], KeyJ: ['о', 'О'], KeyK: ['л', 'Л'], KeyL: ['д', 'Д'], Semicolon: ['ж', 'Ж'], Quote: ['э', 'Э'],
    KeyZ: ['я', 'Я'], KeyX: ['ч', 'Ч'], KeyC: ['с', 'С'], KeyV: ['м', 'М'], KeyB: ['и', 'И'], KeyN: ['т', 'Т'], KeyM: ['ь', 'Ь'], Comma: ['б', 'Б'], Period: ['ю', 'Ю'], Slash: ['.', ','], Backslash: ['\\', '/'],
  };
  const CHAR_TO_CODE = new Map();
  for (const [code, v] of Object.entries(RU)) { CHAR_TO_CODE.set(v[0], code); CHAR_TO_CODE.set(v[1], code); }
  const BAR_CODES = ROWS.flat();
  const barIndex = (code) => { const i = BAR_CODES.indexOf(code); return i < 0 ? Math.floor(BAR_CODES.length / 2) : i; };

  // ---------- Действия машинки ----------
  function typeChar(ch, code, silent) {
    if (st.col >= COLS) { sfx('lock', silent); st.shake = 0.6; return; }
    stamp(ch, st.col, st.row, st.ribbon);
    const c = code || CHAR_TO_CODE.get(ch) || CHAR_TO_CODE.get(ch.toLowerCase());
    st.bars.push({ i: barIndex(c), t: 0 });
    if (c) st.keys.set(c, 0);
    st.col++;
    if (st.col === BELL) sfx('bell', silent);
    sfx('char', silent);
    st.lastType = performance.now();
  }
  function space(silent) { if (st.col < COLS) { st.col++; if (st.col === BELL) sfx('bell', silent); } else sfx('lock', silent); st.keys.set('Space', 0); sfx('space', silent); }
  function back(silent) { if (st.col > 0) st.col--; sfx('back', silent); }
  function carriageReturn(silent) {
    sfx('return', silent);
    st.col = 0;
    st.row += st.spacing;
    if (st.row > MAX_ROW) { newSheet(true); sfx('sheet', silent); }
  }
  function doCorrect(silent) { if (st.col > 0) { st.col--; correct(st.col, st.row); sfx('back', silent); } }

  // ---------- Письмо для начала: печатается при загрузке ----------
  const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  function letterScript() {
    const d = new Date();
    const date = `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} г.`;
    const out = [];
    const line = (s) => { for (const ch of s) out.push(ch); out.push('\n'); };
    line(' '.repeat(COLS - date.length) + date);
    out.push('\n');
    line('Дорогой друг!');
    out.push('\n');
    const para = (text) => {
      // Разметка: {набрано|исправлено} — опечатка, перебитая поверх; [красным]
      const tokens = [];
      const re = /\{([^|}]*)\|([^}]*)\}|\[([^\]]*)\]|([^{[]+)/g;
      let m;
      while ((m = re.exec(text))) {
        if (m[1] !== undefined) tokens.push({ typo: m[1], fix: m[2] });
        else if (m[3] !== undefined) tokens.push({ red: m[3] });
        else tokens.push({ plain: m[4] });
      }
      // Раскладываем по строкам по видимой длине
      const words = [];
      for (const t of tokens) {
        if (t.plain) for (const part of t.plain.split(/( )/)) { if (part) words.push({ vis: part, ops: [...part] }); }
        else if (t.typo) words.push({ vis: t.fix, ops: [...t.typo, ...Array(t.typo.length).fill('\b'), ...t.fix], glue: true });
        else for (const part of t.red.split(/( )/)) { if (part) words.push({ vis: part, ops: ['\u0001', ...part, '\u0002'] }); }
      }
      // Склеиваем кусок слова с соседями (опечатки внутри слова)
      const merged = [];
      for (const w of words) { const last = merged[merged.length - 1]; if (last && w.vis !== ' ' && last.vis !== ' ') { last.vis += w.vis; last.ops.push(...w.ops); } else merged.push({ vis: w.vis, ops: w.ops.slice() }); }
      let len = 0;
      merged.forEach((w, i) => {
        if (w.vis === ' ') { if (len > 0 && len < COLS) { out.push(' '); len++; } return; }
        // Короткие предлоги и союзы не оставляем в конце строки
        const next = merged.slice(i + 1).find((x) => x.vis !== ' ');
        const short = w.vis.length <= 2 && /^[а-яё]+$/i.test(w.vis) && next;
        const need = short ? w.vis.length + 1 + next.vis.length : w.vis.length;
        if (len + need > COLS && len > 0) { while (out[out.length - 1] === ' ') { out.pop(); } out.push('\n'); len = 0; }
        out.push(...w.ops); len += w.vis.length;
      });
      out.push('\n');
    };
    para('Пишу тебе на машинке, которой нет. В ней нет ни одной пружины, а звонок в конце строки всё равно звенит. Буквы ложатся неров{он|но}: лента изношена, «о» бьёт сильнее остальных, а «ж» заваливается набок. Так и должно быть: ровный текст не помнит рук, которые его набрали.');
    out.push('\n');
    para('Если ошибёшься, [не ищи клавишу удаления] — её здесь нет. Вернись на шаг назад и напечатай поверх или замажь корректором. Бумага всё запомнит.');
    out.push('\n');
    const pre = out.length;
    for (const ch of ' '.repeat(40) + 'Твоя машинка') out.push(ch);
    out.push('\n', '\n');
    return { ops: out, live: pre };
  }
  function runOp(op, silent) {
    if (op === '\n') carriageReturn(silent);
    else if (op === '\b') back(silent);
    else if (op === '\u0001') st.ribbon = 'red';
    else if (op === '\u0002') st.ribbon = document.querySelector('#ribbon .on').dataset.v;
    else if (op === ' ') space(silent);
    else typeChar(op, null, silent);
  }

  // ---------- Звук ----------
  let AC = null, master = null, noiseBuf = null;
  function audio() {
    if (AC) return AC;
    const Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) return null;
    AC = new Ctx();
    master = AC.createGain(); master.gain.value = 0.8;
    const comp = AC.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    master.connect(comp).connect(AC.destination);
    noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return AC;
  }
  function burst(t, dur, type, freq, q, gain) {
    const src = AC.createBufferSource(); src.buffer = noiseBuf; src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = AC.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = AC.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(master); src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
  }
  function thump(t, f0, f1, dur, gain) {
    const o = AC.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = AC.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  function sfx(kind, silent) {
    if (silent || !st.sound || !AC || AC.state !== 'running') return;
    const t = AC.currentTime + 0.005, v = 0.9 + Math.random() * 0.2;
    if (kind === 'char') { burst(t, 0.018, 'bandpass', 2300 * v, 1.3, 0.5); burst(t + 0.028, 0.012, 'highpass', 3600, 0.7, 0.55); thump(t + 0.026, 150 * v, 70, 0.07, 0.5); }
    else if (kind === 'space') { burst(t, 0.03, 'bandpass', 900, 1, 0.35); thump(t, 110, 60, 0.08, 0.35); }
    else if (kind === 'back') { burst(t, 0.02, 'bandpass', 1700, 2, 0.3); }
    else if (kind === 'lock') { thump(t, 80, 50, 0.12, 0.5); burst(t, 0.04, 'lowpass', 600, 0.7, 0.3); }
    else if (kind === 'bell') {
      for (const [f, a, d] of [[1680, 0.2, 1.4], [2520, 0.08, 0.9], [4150, 0.05, 0.6]]) {
        const o = AC.createOscillator(); o.frequency.value = f; const g = AC.createGain();
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(a, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(g).connect(master); o.start(t); o.stop(t + d + 0.05);
      }
    } else if (kind === 'return' || kind === 'sheet') {
      for (let i = 0; i < 9; i++) burst(t + 0.02 + i * 0.028 * (1 - i * 0.05), 0.012, 'bandpass', 2600, 3, 0.22);
      const src = AC.createBufferSource(); src.buffer = noiseBuf;
      const f = AC.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.4; f.frequency.setValueAtTime(500, t); f.frequency.exponentialRampToValueAtTime(1700, t + 0.3);
      const g = AC.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.28, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
      src.connect(f).connect(g).connect(master); src.start(t); src.stop(t + 0.4);
      thump(t + 0.33, 120, 55, 0.12, 0.55); burst(t + 0.33, 0.03, 'bandpass', 1200, 1, 0.4);
    }
  }

  // ---------- Ввод ----------
  const input = $('input');
  let demoOn = true;
  function stopDemo() { if (demoOn) { demoOn = false; st.demo = []; } }
  function wake() { if (audio() && AC.state === 'suspended') AC.resume(); stopDemo(); }
  window.addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('.panel')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    if (k === 'Enter') { wake(); carriageReturn(); e.preventDefault(); return; }
    if (k === 'Backspace') { wake(); if (e.shiftKey) doCorrect(); else back(); e.preventDefault(); return; }
    if (k === 'Tab') { wake(); for (let i = 0; i < 5; i++) space(); e.preventDefault(); return; }
    if (k === ' ') { wake(); space(); e.preventDefault(); return; }
    if (k === 'ArrowLeft') { wake(); back(); e.preventDefault(); return; }
    if (k === 'ArrowRight') { wake(); space(); e.preventDefault(); return; }
    if (k === 'ArrowUp' || k === 'ArrowDown') { wake(); st.row = clamp(st.row + (k === 'ArrowUp' ? -0.5 : 0.5), 0, MAX_ROW); sfx('back'); e.preventDefault(); return; }
    let ch = null;
    if (st.layout === 'ru' && RU[e.code]) ch = RU[e.code][e.shiftKey ? 1 : 0];
    else if (k.length === 1) ch = k;
    if (ch) { wake(); typeChar(ch, e.code); e.preventDefault(); }
  });
  // Мобильные: скрытое поле ввода вызывает системную клавиатуру
  input.addEventListener('beforeinput', (e) => {
    wake();
    if (e.inputType === 'insertText' && e.data) for (const ch of e.data) (ch === ' ' ? space() : typeChar(ch));
    else if (e.inputType === 'insertLineBreak' || e.inputType === 'insertParagraph') carriageReturn();
    else if (e.inputType.startsWith('delete')) back();
    e.preventDefault();
  });
  $('view').addEventListener('pointerdown', () => { wake(); input.focus({ preventScroll: true }); $('tap').classList.add('gone'); });

  // ---------- Панель ----------
  const seg = (id, cb) => { for (const b of document.querySelectorAll(`#${id} button`)) b.addEventListener('click', () => { for (const x of document.querySelectorAll(`#${id} button`)) x.classList.toggle('on', x === b); cb(b.dataset.v); b.blur(); }); };
  seg('ribbon', (v) => { st.ribbon = v; });
  seg('spacing', (v) => { st.spacing = +v; });
  seg('layout', (v) => { st.layout = v; });
  $('sound').addEventListener('click', (e) => { st.sound = !st.sound; e.currentTarget.textContent = st.sound ? 'Звук вкл.' : 'Звук выкл.'; e.currentTarget.setAttribute('aria-pressed', String(st.sound)); if (st.sound) audio() && AC.resume(); e.currentTarget.blur(); });
  $('newSheet').addEventListener('click', (e) => { stopDemo(); newSheet(true); sfx('sheet'); e.currentTarget.blur(); });
  const download = (url, name) => { const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); };
  $('png').addEventListener('click', (e) => { download(sheet.toDataURL('image/png'), `лист-${st.sheetNo}.png`); e.currentTarget.blur(); });
  $('txt').addEventListener('click', (e) => {
    const all = archive.map((a) => a.text).concat([sheetText()]).join('\n\n\f\n\n');
    const url = URL.createObjectURL(new Blob([all], { type: 'text/plain;charset=utf-8' }));
    download(url, 'машинка.txt'); setTimeout(() => URL.revokeObjectURL(url), 2000); e.currentTarget.blur();
  });

  // ---------- Отрисовка машины ----------
  const view = $('view'), ctx = view.getContext('2d');
  let W = 0, H = 0, DPR = 1, Z = 1;
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    view.width = Math.round(W * DPR); view.height = Math.round(H * DPR);
    Z = W < 700 ? 0.72 : Math.min(1.12, Math.max(0.8, H / 900));
  }
  function rrect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  function draw(dt) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    // Стол и свет лампы
    const bg = ctx.createRadialGradient(W * 0.3, H * 0.1, 0, W * 0.4, H * 0.3, Math.max(W, H) * 0.95);
    bg.addColorStop(0, '#3a2718'); bg.addColorStop(0.45, '#1d140d'); bg.addColorStop(1, '#0b0705');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    const mobile = W < 700;
    const px = W / 2;
    const py = mobile ? H * 0.47 : H * 0.45;
    // Каретка плавно догоняет положение
    const k = 1 - Math.exp(-dt * (Math.abs(st.col - st.colDisp) > 3 ? 9 : 30));
    st.colDisp += (st.col - st.colDisp) * k;
    st.rowDisp += (st.row - st.rowDisp) * (1 - Math.exp(-dt * 12));
    const shake = st.shake > 0 ? (Math.random() - 0.5) * 2 * st.shake : 0; st.shake = Math.max(0, st.shake - dt * 3);

    ctx.save();
    ctx.translate(px, py); ctx.scale(Z, Z); ctx.translate(-px, -py);
    const paperX = px - (MARGIN + st.colDisp) * CW - CW / 2 + shake;
    const paperY = py - (TOP + st.rowDisp * LINE + FONT_PX * 0.72);
    const platenY = py + 16;
    // Лист: всё, что ниже валика, уходит под него
    ctx.save();
    ctx.beginPath(); ctx.rect(-W, -H * 2, W * 4, platenY + H * 2); ctx.clip();
    // Мягкая тень листа — несколько полупрозрачных слоёв вместо дорогого shadowBlur
    for (const [o, a] of [[18, 0.07], [11, 0.1], [5, 0.14]]) { ctx.fillStyle = `rgba(0,0,0,${a})`; ctx.fillRect(paperX + o, paperY + o * 0.3, SHEET_W, SHEET_H); }
    ctx.drawImage(sheet, paperX, paperY, SHEET_W, SHEET_H);
    // Изгиб листа к валику
    const curl = ctx.createLinearGradient(0, platenY - 70, 0, platenY);
    curl.addColorStop(0, 'rgba(60,40,20,0)'); curl.addColorStop(1, 'rgba(60,40,20,0.32)');
    ctx.fillStyle = curl; ctx.fillRect(paperX, platenY - 70, SHEET_W, 70);
    ctx.restore();

    // Прижимная планка с роликами
    const bailY = py - 64;
    const cx0 = paperX - 60, cx1 = paperX + SHEET_W + 60;
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(cx0, bailY + 4, cx1 - cx0, 4);
    const bail = ctx.createLinearGradient(0, bailY - 3, 0, bailY + 4);
    bail.addColorStop(0, '#f4f0e8'); bail.addColorStop(0.5, '#8b8a86'); bail.addColorStop(1, '#3a3937');
    ctx.fillStyle = bail; ctx.fillRect(cx0, bailY - 3, cx1 - cx0, 6);
    for (const f of [0.28, 0.72]) { const x = paperX + SHEET_W * f; rrect(x - 16, bailY - 7, 32, 14, 6); ctx.fillStyle = '#161514'; ctx.fill(); }
    // Линейка-шкала
    ctx.fillStyle = 'rgba(210,200,180,0.9)'; ctx.font = `600 10px Manrope, sans-serif`; ctx.textAlign = 'center';
    const scaleY = py + 4;
    ctx.fillStyle = '#c9c1af'; ctx.fillRect(paperX + MARGIN * CW - 20, scaleY - 1, (COLS + 1) * CW + 40, 2);

    // Валик
    const pr = 26;
    const vg = ctx.createLinearGradient(0, platenY - pr, 0, platenY + pr);
    vg.addColorStop(0, '#2c2a28'); vg.addColorStop(0.28, '#5d5a56'); vg.addColorStop(0.45, '#1c1b1a'); vg.addColorStop(1, '#070606');
    ctx.fillStyle = vg; rrect(cx0 - 20, platenY - pr, cx1 - cx0 + 40, pr * 2, pr); ctx.fill();
    // Ручки валика
    for (const x of [cx0 - 44, cx1 + 44]) {
      const kg = ctx.createRadialGradient(x - 6, platenY - 10, 2, x, platenY, 30);
      kg.addColorStop(0, '#6a6660'); kg.addColorStop(0.5, '#262422'); kg.addColorStop(1, '#0c0b0a');
      ctx.fillStyle = kg; rrect(x - 22, platenY - 30, 44, 60, 12); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
      for (let i = -24; i <= 24; i += 5) { ctx.beginPath(); ctx.moveTo(x - 20, platenY + i); ctx.lineTo(x + 20, platenY + i); ctx.stroke(); }
    }
    // Рычаг возврата каретки
    ctx.strokeStyle = '#d9d4c8'; ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx0 - 30, platenY - 18); ctx.quadraticCurveTo(cx0 - 110, platenY - 60, cx0 - 150, platenY - 36); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();

    // Корпус машинки, корзина рычагов и клавиатура — неподвижны
    ctx.save();
    ctx.translate(px, py); ctx.scale(Z, Z); ctx.translate(-px, -py);
    const bodyTop = platenY + pr + 6;
    const bw = Math.min(W / Z * 0.98, 1180);
    const body = ctx.createLinearGradient(0, bodyTop, 0, bodyTop + 480);
    body.addColorStop(0, '#2f4a3d'); body.addColorStop(0.08, '#223a30'); body.addColorStop(0.5, '#172a22'); body.addColorStop(1, '#0c1612');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(px - bw / 2 + 40, bodyTop); ctx.lineTo(px + bw / 2 - 40, bodyTop);
    ctx.quadraticCurveTo(px + bw / 2, bodyTop, px + bw / 2 + 10, bodyTop + 60); ctx.lineTo(px + bw / 2 + 60, bodyTop + 520);
    ctx.lineTo(px - bw / 2 - 60, bodyTop + 520); ctx.lineTo(px - bw / 2 - 10, bodyTop + 60);
    ctx.quadraticCurveTo(px - bw / 2, bodyTop, px - bw / 2 + 40, bodyTop); ctx.closePath(); ctx.fill();
    // Блик эмали
    const hl = ctx.createLinearGradient(0, bodyTop, 0, bodyTop + 14);
    hl.addColorStop(0, 'rgba(200,235,215,0.35)'); hl.addColorStop(1, 'rgba(200,235,215,0)');
    ctx.fillStyle = hl; ctx.fillRect(px - bw / 2 + 30, bodyTop, bw - 60, 14);
    // Корзина литерных рычагов
    const bc = { x: px, y: py + 8 };
    const R0 = 58, R1 = 158;
    ctx.save();
    ctx.beginPath(); ctx.moveTo(bc.x - R1 - 20, bodyTop); ctx.arc(bc.x, bc.y, R1 + 20, Math.PI, 0, true); ctx.closePath();
    ctx.fillStyle = '#070b09'; ctx.fill();
    ctx.restore();
    const N = BAR_CODES.length;
    // Анимация ударов
    for (const b of st.bars) b.t += dt;
    st.bars = st.bars.filter((b) => b.t < 0.16);
    const active = new Map(st.bars.map((b) => [b.i, b]));
    for (let i = 0; i < N; i++) {
      const a = Math.PI * (0.13 + 0.74 * (i / (N - 1)));
      const pivot = [bc.x + Math.cos(a) * R1 * -1, bc.y + Math.sin(a) * R1];
      const rest = [bc.x + Math.cos(a) * R0 * -1, bc.y + Math.sin(a) * R0];
      const b = active.get(i);
      let tip = rest;
      if (b) { const u = b.t < 0.05 ? b.t / 0.05 : 1 - (b.t - 0.05) / 0.11; const e = clamp(u, 0, 1); tip = [rest[0] + (px - rest[0]) * e, rest[1] + (py - 4 - rest[1]) * e]; }
      ctx.strokeStyle = b ? '#e8e2d4' : '#6e6a62'; ctx.lineWidth = b ? 3.2 : 2.2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(pivot[0], pivot[1]); ctx.lineTo(tip[0], tip[1]); ctx.stroke();
      ctx.fillStyle = b ? '#f5efe2' : '#8a857b'; ctx.beginPath(); ctx.arc(tip[0], tip[1], b ? 3.4 : 2.4, 0, Math.PI * 2); ctx.fill();
    }
    // Направляющая литер и лента
    const lift = st.bars.length ? 1 : 0;
    ctx.fillStyle = st.ribbon === 'red' ? '#a3241d' : '#1b1a19';
    ctx.fillRect(px - 44, py + 2 - lift * 8, 88, 9);
    ctx.fillStyle = '#b8b3a7'; rrect(px - 16, py - 2, 32, 14, 3); ctx.fill();
    ctx.fillStyle = '#070b09'; ctx.fillRect(px - 6, py - 2, 12, 6);
    ctx.fillStyle = '#d9d4c8'; ctx.fillRect(px - 20, py + 10, 40, 3);

    // Клавиатура
    if (!mobile) {
      const kTop = bodyTop + 178;
      for (const [code, t] of st.keys) { const nt = t + dt; if (nt > 0.14) st.keys.delete(code); else st.keys.set(code, nt); }
      ROWS.forEach((row, ri) => {
        const y = kTop + ri * 48;
        const n = row.length, pitch = 52 + ri * 2, x0 = px - (n - 1) * pitch / 2 + ri * 12 - 18;
        row.forEach((code, ci) => {
          const x = x0 + ci * pitch;
          const down = st.keys.has(code) ? 1 : 0;
          const r = 19 + ri * 0.6;
          ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.arc(x + 2, y + 6, r, 0, Math.PI * 2); ctx.fill();
          const kg = ctx.createRadialGradient(x - 6, y - 7 + down * 2, 3, x, y + down * 2, r);
          kg.addColorStop(0, '#fbf6ea'); kg.addColorStop(0.7, '#d9d0bd'); kg.addColorStop(1, '#8f8778');
          ctx.fillStyle = kg; ctx.beginPath(); ctx.arc(x, y + down * 3, r - 3, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#c7c3ba'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y + down * 3, r - 1.5, 0, Math.PI * 2); ctx.stroke();
          ctx.fillStyle = '#1f1b16'; ctx.font = `700 ${code.startsWith('Digit') || code === 'Minus' || code === 'Equal' ? 15 : 17}px Manrope, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(RU[code][code.startsWith('Key') || ['BracketLeft', 'BracketRight', 'Semicolon', 'Quote', 'Comma', 'Period', 'Backquote'].includes(code) ? 1 : 0], x, y + down * 3 + 1);
        });
      });
      const sy = kTop + 4 * 48 + 6, down = st.keys.has('Space') ? 3 : 0;
      const sg = ctx.createLinearGradient(0, sy - 12, 0, sy + 12);
      sg.addColorStop(0, '#e9e2d2'); sg.addColorStop(1, '#8f8778');
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; rrect(px - 220 + 2, sy - 10 + 6, 440, 22, 11); ctx.fill();
      ctx.fillStyle = sg; rrect(px - 220, sy - 11 + down, 440, 22, 11); ctx.fill();
    }
    ctx.restore();

    // Тёплый свет лампы и виньетка
    const lamp = ctx.createRadialGradient(W * 0.28, -H * 0.05, 0, W * 0.3, H * 0.1, Math.max(W, H) * 0.9);
    lamp.addColorStop(0, 'rgba(255,214,150,0.16)'); lamp.addColorStop(1, 'rgba(255,214,150,0)');
    ctx.fillStyle = lamp; ctx.fillRect(0, 0, W, H);
    const vg2 = ctx.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.35, W / 2, H * 0.5, Math.max(W, H) * 0.8);
    vg2.addColorStop(0, 'rgba(0,0,0,0)'); vg2.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = vg2; ctx.fillRect(0, 0, W, H);
  }

  // ---------- Цикл ----------
  let last = performance.now(), countT = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!document.hidden) {
      if (demoOn && st.demo.length && now >= st.demoNext) {
        const op = st.demo.shift();
        runOp(op, true);
        st.demoNext = now + (op === '\n' ? 520 : op === ' ' ? 140 : 95 + Math.random() * 90);
      }
      draw(dt);
      countT += dt;
      if (countT > 0.1) { countT = 0; $('count').textContent = `Лист ${st.sheetNo} · строка ${Math.floor(st.row / st.spacing) + 1} · знак ${st.col + 1}`; }
    }
    requestAnimationFrame(frame);
  }

  function start() {
    metrics();
    newSheet(false);
    const script = letterScript();
    for (let i = 0; i < script.live; i++) runOp(script.ops[i], true);
    st.bars = []; st.keys.clear();
    st.colDisp = st.col; st.rowDisp = st.row;
    st.demo = script.ops.slice(script.live);
    st.demoNext = performance.now() + (window.__SHOT__ ? 300 : 900);
    resize();
    requestAnimationFrame(frame);
  }
  window.addEventListener('resize', resize);
  // Ждём шрифты, чтобы ширина литер была верной
  const fontsReady = document.fonts && document.fonts.load ? Promise.race([document.fonts.load(FONT(FONT_PX)), new Promise((r) => setTimeout(r, 1200))]) : Promise.resolve();
  fontsReady.then(start, start);
})();
