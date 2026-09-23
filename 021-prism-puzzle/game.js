'use strict';
/* Призма — отрисовка, управление, звук. Физика света — в engine.js, уровни — в levels.js. */
(() => {
  const E = window.PrismEngine;
  const LEVELS = window.PRISM_LEVELS;
  const $ = (s) => document.querySelector(s);
  const cv = $('#board');
  const g = cv.getContext('2d');
  const SHOT = !!window.__SHOT__;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const COL = { 1: '#ff4b5c', 2: '#3dff8a', 4: '#4a8dff', 3: '#ffe04a', 5: '#ff5bf0', 6: '#46f2ff', 7: '#ffffff' };
  const RGB = { 1: [255, 75, 92], 2: [61, 255, 138], 4: [74, 141, 255], 3: [255, 224, 74], 5: [255, 91, 240], 6: [70, 242, 255], 7: [255, 255, 255] };
  const NAME = { 1: 'красный', 2: 'зелёный', 4: 'синий', 3: 'жёлтый', 5: 'пурпурный', 6: 'голубой', 7: 'белый' };
  const PIECE_NAME = { mirror: 'Зеркало', prism: 'Призма', splitter: 'Стекло', 'filter-r': 'Красный', 'filter-g': 'Зелёный', 'filter-b': 'Синий', 'filter-y': 'Жёлтый', 'filter-c': 'Голубой', 'filter-m': 'Пурпурный' };
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ---------- Состояние ---------- */
  let li = 0, level = null, board = null;
  let placed = new Map();          // клетка → деталь игрока {k, o, m, type, ang}
  let res = null, solved = false, winAt = 0;
  let hint = null, hintT = 0;
  let selected = null;              // выбранный тип в лотке
  let drag = null;                  // {type, from, x, y, moved}
  let hover = -1;
  let time = 0;
  const fx = [];                    // искры
  const litBefore = new Set();
  let progress = {};
  try { progress = JSON.parse(localStorage.getItem('prism-progress') || '{}') || {}; } catch (e) { progress = {}; }
  const saveProgress = () => { try { localStorage.setItem('prism-progress', JSON.stringify(progress)); } catch (e) { /* нет хранилища */ } };

  /* ---------- Геометрия поля ---------- */
  let W = 0, H = 0, dpr = 1, cs = 60, bx = 0, by = 0;
  function layout() {
    const r = cv.getBoundingClientRect();
    dpr = Math.min(2, devicePixelRatio || 1);
    W = r.width; H = r.height;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    if (!level) return;
    const pad = W < 600 ? 14 : 56;
    cs = Math.floor(Math.min((W - pad * 2) / level.w, (H - pad * 2) / level.h, 104));
    bx = Math.round((W - cs * level.w) / 2);
    by = Math.round((H - cs * level.h) / 2);
  }
  new ResizeObserver(layout).observe(cv);
  const cx = (x) => bx + (x + 0.5) * cs;
  const cy = (y) => by + (y + 0.5) * cs;
  function cellAt(px, py) {
    const x = Math.floor((px - bx) / cs), y = Math.floor((py - by) / cs);
    if (x < 0 || y < 0 || x >= level.w || y >= level.h) return -1;
    return y * level.w + x;
  }

  /* ---------- Уровень ---------- */
  function load(i, demo) {
    li = clamp(i, 0, LEVELS.length - 1);
    level = LEVELS[li];
    board = E.parse(level);
    placed = new Map();
    solved = !!demo; hint = null; selected = null; drag = null;   // demo — решённое поле для обложки
    fx.length = 0;                                                 // искры прошлого уровня не переносим
    litBefore.clear();
    if (demo && level.sol) {
      for (const p of level.sol) placed.set(p.y * level.w + p.x, piece(p.type, p.o));
    }
    layout();
    retrace();
    litBefore.clear();
    res.hits.forEach((h, j) => { if (h === targetMask(j)) litBefore.add(j); });
    $('#lvNum').textContent = String(li + 1).padStart(2, '0');
    $('#lvTotal').textContent = String(LEVELS.length);
    $('#lvName').textContent = level.name;
    $('#lvText').textContent = level.text || '';
    renderTray();
    renderTargets();
  }
  function piece(type, o) {
    const v = E.variants(type)[0];
    const p = Object.assign({}, v, { type });
    if (p.k === 'mirror' || p.k === 'splitter') { p.o = o || 0; p.ang = angFor(p.o); }
    return p;
  }
  const angFor = (o) => (o === 0 ? -Math.PI / 4 : Math.PI / 4);
  const targetMask = (j) => board.cells[board.targets[j]].m;

  function counts() {
    const left = Object.assign({}, level.inv);
    for (const p of placed.values()) left[p.type]--;
    return left;
  }

  function retrace() {
    res = E.trace(board, placed);
    // звон на каждую новую зажжённую мишень
    res.hits.forEach((h, j) => {
      const ok = h === targetMask(j);
      if (ok && !litBefore.has(j)) {
        litBefore.add(j);
        const ti = board.targets[j];
        burst(cx(ti % level.w), cy((ti / level.w) | 0), targetMask(j), 18);
        chime(targetMask(j));
      } else if (!ok) litBefore.delete(j);
    });
    renderTargets();
    if (res.ok && !solved) {
      solved = true;
      winAt = time;
      progress[li] = 1;
      saveProgress();
      setTimeout(winChord, 250);
      setTimeout(showWin, 1100);
    }
  }

  /* ---------- Лоток деталей ---------- */
  const tray = $('#tray');
  function renderTray() {
    const left = counts();
    tray.innerHTML = '';
    for (const type of Object.keys(level.inv)) {
      const b = document.createElement('button');
      b.className = 'piece' + (left[type] ? '' : ' empty');
      b.dataset.type = type;
      b.setAttribute('aria-pressed', String(selected === type));
      b.setAttribute('aria-label', `${PIECE_NAME[type]}: осталось ${left[type]}`);
      const c = document.createElement('canvas');
      c.width = c.height = 112;
      const x = c.getContext('2d');
      x.scale(2, 2);
      drawPieceIcon(x, type, 28, 28, 44);
      b.appendChild(c);
      b.insertAdjacentHTML('beforeend', `<span class="cnt">×${left[type]}</span><span class="nm">${PIECE_NAME[type]}</span>`);
      tray.appendChild(b);
    }
  }
  tray.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.piece');
    if (!b || b.classList.contains('empty') || solved) return;
    const type = b.dataset.type;
    unlockAudio();
    drag = { type, from: -1, x: e.clientX, y: e.clientY, moved: false, sx: e.clientX, sy: e.clientY, tray: true };
    b.setPointerCapture(e.pointerId);
  });
  tray.addEventListener('pointermove', (e) => {
    if (!drag || !drag.tray) return;
    drag.x = e.clientX; drag.y = e.clientY;
    if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) drag.moved = true;
    const r = cv.getBoundingClientRect();
    hover = cellAt(e.clientX - r.left, e.clientY - r.top);
  });
  tray.addEventListener('pointerup', (e) => {
    if (!drag || !drag.tray) return;
    const d = drag;
    drag = null;
    if (!d.moved) {
      selected = selected === d.type ? null : d.type;
      renderTray();
      return;
    }
    const r = cv.getBoundingClientRect();
    tryPlace(cellAt(e.clientX - r.left, e.clientY - r.top), d.type);
  });

  function placeable(ci) {
    return ci >= 0 && board.cells[ci].k === 'empty';
  }
  function tryPlace(ci, type, o) {
    if (!placeable(ci) || !(counts()[type] > 0)) return false;
    if (placed.has(ci)) return false;
    placed.set(ci, piece(type, o));
    click(1);
    hint = null;
    retrace();
    renderTray();
    return true;
  }

  /* ---------- Мышь и касания на поле ---------- */
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener('pointerdown', (e) => {
    unlockAudio();
    if (solved) return;
    const r = cv.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    const ci = cellAt(px, py);
    if (ci < 0) return;
    const p = placed.get(ci);
    if (e.button === 2 && p) { placed.delete(ci); hint = null; click(0.6); retrace(); renderTray(); return; }
    if (p) {
      drag = { type: p.type, from: ci, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false, o: p.o };
      cv.setPointerCapture(e.pointerId);
      return;
    }
    if (selected && placeable(ci)) {
      tryPlace(ci, selected);
      if (!(counts()[selected] > 0)) { selected = null; renderTray(); }
    }
  });
  cv.addEventListener('pointermove', (e) => {
    const r = cv.getBoundingClientRect();
    hover = level ? cellAt(e.clientX - r.left, e.clientY - r.top) : -1;
    if (drag && !drag.tray) {
      drag.x = e.clientX; drag.y = e.clientY;
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6 && !drag.moved) {
        drag.moved = true;
        placed.delete(drag.from);
        hint = null;
        retrace();
      }
    }
    cv.style.cursor = drag ? 'grabbing' : placed.has(hover) ? 'pointer' : (selected && hover >= 0 && placeable(hover)) ? 'copy' : 'default';
  });
  cv.addEventListener('pointerleave', () => { hover = -1; });
  cv.addEventListener('pointerup', (e) => {
    if (!drag || drag.tray) return;
    const d = drag;
    drag = null;
    const r = cv.getBoundingClientRect();
    if (!d.moved) {
      const p = placed.get(d.from);
      if (p && (p.k === 'mirror' || p.k === 'splitter')) {
        p.o = 1 - p.o;
        click(0.8);
        hint = null;
        retrace();
      }
      return;
    }
    const ci = cellAt(e.clientX - r.left, e.clientY - r.top);
    if (!tryPlace(ci, d.type, d.o)) { renderTray(); retrace(); }
  });

  /* ---------- Кнопки ---------- */
  $('#resetBtn').addEventListener('click', () => { load(li); });
  /* Подсказка: решатель ищет решение, которое продолжает то, что игрок уже поставил.
     Нашлось — показываем следующую деталь. Нет — ищем деталь, которую надо повернуть или убрать. */
  const FIXED_CH = { mirror: ['/', '\\'], splitter: ['S', 'Z'], prism: ['P'] };
  const FILTER_CH = Object.fromEntries(Object.entries(E.FILTERS).map(([k, v]) => [v, k]));
  function withFixed(pl) {
    // уровень, где детали игрока вписаны в поле как закреплённые
    const g2 = level.grid.map((row) => row.split(''));
    for (const [ci, p] of pl) g2[(ci / level.w) | 0][ci % level.w] = p.k === 'filter' ? FILTER_CH[p.m] : FIXED_CH[p.k][p.o || 0];
    return Object.assign({}, level, { grid: g2.map((r) => r.join('')) });
  }
  function leftAfter(pl) {
    const left = Object.assign({}, level.inv);
    for (const p of pl.values()) left[p.type]--;
    return left;
  }
  const extend = (pl) => E.solve(withFixed(pl), { inv: leftAfter(pl), max: 1, maxNodes: 150000 }).solutions[0];
  const typeOfPiece = (p) => (p.k === 'filter' ? 'filter-' + FILTER_CH[p.m] : p.k);
  function showHint(h, msg) { hint = h; hintT = time; toast(msg); }
  $('#hintBtn').addEventListener('click', () => {
    if (solved) return;
    const sol = extend(placed);
    if (sol && sol.length) {
      const s0 = sol[0];
      showHint({ mode: 'place', ci: s0.y * level.w + s0.x, type: typeOfPiece(s0), o: s0.o }, `Попробуйте поставить сюда: ${PIECE_NAME[typeOfPiece(s0)].toLowerCase()}`);
      return;
    }
    // повернуть одну деталь?
    for (const [ci, p] of placed) {
      if (p.k !== 'mirror' && p.k !== 'splitter') continue;
      const pl = new Map(placed);
      pl.set(ci, Object.assign({}, p, { o: 1 - p.o }));
      if (extend(pl)) { showHint({ mode: 'rotate', ci }, 'Эта деталь смотрит не туда — щёлкните по ней'); return; }
    }
    // убрать одну деталь?
    for (const [ci] of placed) {
      const pl = new Map(placed);
      pl.delete(ci);
      if (extend(pl)) { showHint({ mode: 'remove', ci }, 'Эта деталь мешает — утащите её с поля'); return; }
    }
    toast('Отсюда решение не собрать. Начните заново — клавиша R');
  });
  $('#levelsBtn').addEventListener('click', openLevels);
  $('#closeLevels').addEventListener('click', closeLevels);
  $('#nextBtn').addEventListener('click', () => { hideWin(); load(li + 1 < LEVELS.length ? li + 1 : 0); });
  let muted = false;
  $('#soundBtn').addEventListener('click', () => {
    muted = !muted;
    $('#soundBtn').setAttribute('aria-pressed', String(!muted));
    $('#soundBtn .wave').style.display = muted ? 'none' : '';
    $('#soundBtn .mute').style.display = muted ? '' : 'none';
  });
  addEventListener('keydown', (e) => {
    if (e.key === 'r' || e.key === 'R' || e.key === 'к' || e.key === 'К') load(li);
    else if (e.key === 'h' || e.key === 'H' || e.key === 'р' || e.key === 'Р') $('#hintBtn').click();
    else if (e.key === 'Escape') { closeLevels(); selected = null; renderTray(); }
    else if ((e.key === 'Enter' || e.key === 'n') && solved) $('#nextBtn').click();
  });

  function showWin() {
    const w = $('#win');
    $('#winName').textContent = level.name;
    const lines = ['Свет нашёл дорогу.', 'Все мишени горят.', 'Спектр сошёлся.', 'Чисто сработано.'];
    $('#winText').textContent = li === LEVELS.length - 1 ? 'Это был последний уровень. Спасибо за игру!' : lines[li % lines.length];
    $('#nextBtn').textContent = li === LEVELS.length - 1 ? 'Сначала' : 'Следующий уровень';
    w.hidden = false;
    requestAnimationFrame(() => w.classList.add('show'));
    setTimeout(() => $('#nextBtn').focus(), 50);
  }
  function hideWin() { const w = $('#win'); w.classList.remove('show'); setTimeout(() => { w.hidden = true; }, 300); }
  function openLevels() {
    const grid = $('#levelGrid');
    grid.innerHTML = LEVELS.map((L, i) => `<button class="lvbtn${progress[i] ? ' done' : ''}${i === li ? ' cur' : ''}" data-i="${i}" title="${L.name}" aria-label="Уровень ${i + 1}: ${L.name}${progress[i] ? ', пройден' : ''}">${i + 1}</button>`).join('');
    const o = $('#levels');
    o.hidden = false;
    requestAnimationFrame(() => o.classList.add('show'));
  }
  function closeLevels() { const o = $('#levels'); o.classList.remove('show'); setTimeout(() => { o.hidden = true; }, 300); }
  $('#levelGrid').addEventListener('click', (e) => {
    const b = e.target.closest('.lvbtn');
    if (!b) return;
    closeLevels();
    load(+b.dataset.i);
  });
  $('#levels').addEventListener('click', (e) => { if (e.target.id === 'levels') closeLevels(); });

  let toastEl = null, toastTimer = 0;
  function toast(msg) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'toast'; toastEl.setAttribute('role', 'status'); document.body.appendChild(toastEl); }
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2400);
  }

  function renderTargets() {
    const el = $('#targets');
    if (!board) return;
    el.innerHTML = board.targets.map((ti, j) => {
      const need = targetMask(j), got = res ? res.hits[j] : 0;
      const ok = got === need;
      return `<span class="tchip${ok ? ' ok' : ''}" style="color:${ok ? COL[need] : ''}"><i style="color:${COL[need]}"></i>${NAME[need]}${ok ? ' — горит' : got ? ` — пришёл ${NAME[got] || 'смешанный'}` : ''}</span>`;
    }).join('');
  }

  /* ---------- Звук: стекло и колокольчики ---------- */
  let ac = null, master = null;
  function unlockAudio() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain();
      master.gain.value = 0.5;
      const verb = ac.createConvolver();
      const len = ac.sampleRate * 2.2, buf = ac.createBuffer(2, len, ac.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
      }
      verb.buffer = buf;
      const wet = ac.createGain();
      wet.gain.value = 0.28;
      master.connect(ac.destination);
      master.connect(verb);
      verb.connect(wet);
      wet.connect(ac.destination);
    } catch (e) { ac = null; }
  }
  function tone(freq, t0, dur, gain, type = 'sine') {
    if (!ac || muted) return;
    const o = ac.createOscillator(), gn = ac.createGain();
    o.type = type;
    o.frequency.value = freq;
    gn.gain.setValueAtTime(0, t0);
    gn.gain.linearRampToValueAtTime(gain, t0 + 0.006);
    gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(gn);
    gn.connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }
  function click(k) {
    if (!ac) return;
    const t = ac.currentTime;
    tone(2350 * k, t, 0.09, 0.05);
    tone(3520 * k, t, 0.06, 0.025);
  }
  const NOTE = { 1: 523.25, 2: 659.25, 4: 783.99, 3: 587.33, 5: 698.46, 6: 880, 7: 1046.5 };
  function chime(mask) {
    if (!ac) return;
    const t = ac.currentTime, f = NOTE[mask] || 660;
    tone(f, t, 1.6, 0.07);
    tone(f * 2.756, t, 0.7, 0.018);
    tone(f * 5.404, t, 0.35, 0.008);
  }
  function winChord() {
    if (!ac) return;
    const t = ac.currentTime;
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone(f, t + i * 0.09, 2.2, 0.05));
  }

  /* ---------- Искры ---------- */
  function burst(x, y, mask, n) {
    if (reduceMotion) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = 40 + Math.random() * 140;
      fx.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.6 + Math.random() * 0.6, t: 0, c: RGB[mask] });
    }
  }

  /* ---------- Рисование ---------- */
  function drawPieceIcon(x, type, px, py, size) {
    const s = size / 2;
    x.save();
    x.translate(px, py);
    if (type === 'mirror' || type === 'splitter') {
      x.rotate(-Math.PI / 4);
      drawBar(x, s * 1.5, s * 0.22, type === 'splitter');
    } else if (type === 'prism') drawPrism(x, s * 0.95);
    else drawFilter(x, s * 0.72, E.FILTERS[type.slice(7)]);
    x.restore();
  }
  // Полупрозрачное стекло: светлая пластина и пунктир «амальгамы» посередине — сразу видно, что не зеркало
  function drawGlass(x, len, th) {
    const grd = x.createLinearGradient(0, -th, 0, th);
    grd.addColorStop(0, 'rgba(160,225,255,0.34)');
    grd.addColorStop(0.5, 'rgba(110,190,255,0.10)');
    grd.addColorStop(1, 'rgba(160,225,255,0.30)');
    x.fillStyle = grd;
    x.beginPath();
    x.roundRect(-len / 2, -th * 0.75, len, th * 1.5, th * 0.35);
    x.fill();
    x.strokeStyle = 'rgba(190,235,255,0.75)';
    x.lineWidth = 1;
    x.stroke();
    x.setLineDash([th * 0.8, th * 0.55]);
    x.strokeStyle = 'rgba(240,250,255,0.95)';
    x.lineWidth = Math.max(1.2, th * 0.26);
    x.beginPath();
    x.moveTo(-len / 2 + th * 0.5, 0);
    x.lineTo(len / 2 - th * 0.5, 0);
    x.stroke();
    x.setLineDash([]);
  }
  function drawBar(x, len, th, glass) {
    if (glass) { drawGlass(x, len, th); return; }
    const grd = x.createLinearGradient(0, -th, 0, th);
    if (glass) {
      grd.addColorStop(0, 'rgba(190,220,255,0.55)');
      grd.addColorStop(0.5, 'rgba(120,170,255,0.22)');
      grd.addColorStop(1, 'rgba(190,220,255,0.5)');
    } else {
      grd.addColorStop(0, '#f4f7ff');
      grd.addColorStop(0.45, '#9aa6c2');
      grd.addColorStop(0.55, '#5e6883');
      grd.addColorStop(1, '#c9d2e8');
    }
    x.fillStyle = grd;
    x.beginPath();
    x.roundRect(-len / 2, -th / 2, len, th, th / 2);
    x.fill();
    x.strokeStyle = glass ? 'rgba(210,230,255,0.9)' : 'rgba(255,255,255,0.8)';
    x.lineWidth = 1;
    x.beginPath();
    x.moveTo(-len / 2 + th / 2, -th / 2 + 0.5);
    x.lineTo(len / 2 - th / 2, -th / 2 + 0.5);
    x.stroke();
  }
  function drawPrism(x, r) {
    const pts = [0, 1, 2].map((i) => [Math.cos(-Math.PI / 2 + (i * TAU) / 3) * r, Math.sin(-Math.PI / 2 + (i * TAU) / 3) * r + r * 0.15]);
    const grd = x.createLinearGradient(-r, -r, r, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.28)');
    grd.addColorStop(0.5, 'rgba(160,190,255,0.08)');
    grd.addColorStop(1, 'rgba(255,255,255,0.18)');
    x.fillStyle = grd;
    x.beginPath();
    x.moveTo(pts[0][0], pts[0][1]);
    x.lineTo(pts[1][0], pts[1][1]);
    x.lineTo(pts[2][0], pts[2][1]);
    x.closePath();
    x.fill();
    x.lineWidth = 1.6;
    x.strokeStyle = 'rgba(235,242,255,0.9)';
    x.stroke();
    // радужная грань
    const eg = x.createLinearGradient(pts[1][0], pts[1][1], pts[2][0], pts[2][1]);
    eg.addColorStop(0, '#4a8dff');
    eg.addColorStop(0.5, '#3dff8a');
    eg.addColorStop(1, '#ff4b5c');
    x.strokeStyle = eg;
    x.lineWidth = 2.2;
    x.beginPath();
    x.moveTo(pts[1][0], pts[1][1]);
    x.lineTo(pts[2][0], pts[2][1]);
    x.stroke();
  }
  function drawFilter(x, s, m) {
    const c = RGB[m];
    x.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},0.28)`;
    x.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},0.95)`;
    x.lineWidth = 1.6;
    x.beginPath();
    x.roundRect(-s, -s, s * 2, s * 2, s * 0.3);
    x.fill();
    x.stroke();
    x.fillStyle = 'rgba(255,255,255,0.25)';
    x.beginPath();
    x.roundRect(-s + 3, -s + 3, s * 2 - 6, s * 0.5, s * 0.2);
    x.fill();
  }

  function segScreen(s) {
    return [bx + (s[0] + 0.5) * cs, by + (s[1] + 0.5) * cs, bx + (s[2] + 0.5) * cs, by + (s[3] + 0.5) * cs];
  }

  function drawBeams() {
    if (!res) return;
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';
    const pulse = solved ? 1 + 0.35 * Math.max(0, 1 - (time - winAt) * 0.8) : 1;
    for (const s of res.segs) {
      const [x0, y0, x1, y1] = segScreen(s);
      const c = RGB[s[4]] || [255, 255, 255];
      const rgb = `${c[0]},${c[1]},${c[2]}`;
      const passes = [[cs * 0.34, 0.05], [cs * 0.16, 0.12], [cs * 0.06, 0.45], [Math.max(1.2, cs * 0.022), 0.95]];
      for (const [w, a] of passes) {
        g.strokeStyle = `rgba(${rgb},${Math.min(1, a * pulse)})`;
        g.lineWidth = w;
        g.beginPath();
        g.moveTo(x0, y0);
        g.lineTo(x1, y1);
        g.stroke();
      }
      // бегущие искорки вдоль луча
      const len = Math.hypot(x1 - x0, y1 - y0);
      if (len > 4 && !reduceMotion) {
        const step = cs * 0.9;
        const off = (time * cs * 2.2) % step;
        g.fillStyle = `rgba(${rgb},0.9)`;
        for (let d = off; d < len; d += step) {
          const t = d / len;
          g.beginPath();
          g.arc(lerp(x0, x1, t), lerp(y0, y1, t), Math.max(1.2, cs * 0.028), 0, TAU);
          g.fill();
        }
      }
    }
    g.restore();
  }

  function drawBoard() {
    const w = level.w * cs, h = level.h * cs;
    // плита тёмного стекла
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.6)';
    g.shadowBlur = 40;
    g.shadowOffsetY = 18;
    g.fillStyle = '#0a0d17';
    g.beginPath();
    g.roundRect(bx - 14, by - 14, w + 28, h + 28, 18);
    g.fill();
    g.restore();
    const grd = g.createLinearGradient(bx, by - 14, bx + w * 0.6, by + h);
    grd.addColorStop(0, 'rgba(120,150,255,0.10)');
    grd.addColorStop(0.35, 'rgba(120,150,255,0.02)');
    grd.addColorStop(1, 'rgba(255,120,200,0.04)');
    g.fillStyle = grd;
    g.beginPath();
    g.roundRect(bx - 14, by - 14, w + 28, h + 28, 18);
    g.fill();
    g.strokeStyle = 'rgba(170,186,255,0.16)';
    g.lineWidth = 1;
    g.stroke();
    // сетка
    g.strokeStyle = 'rgba(150,170,255,0.07)';
    g.beginPath();
    for (let x = 1; x < level.w; x++) { g.moveTo(bx + x * cs + 0.5, by); g.lineTo(bx + x * cs + 0.5, by + h); }
    for (let y = 1; y < level.h; y++) { g.moveTo(bx, by + y * cs + 0.5); g.lineTo(bx + w, by + y * cs + 0.5); }
    g.stroke();
    // точки на свободных клетках
    for (let i = 0; i < board.cells.length; i++) {
      if (board.cells[i].k !== 'empty' || placed.has(i)) continue;
      const x = cx(i % level.w), y = cy((i / level.w) | 0);
      g.fillStyle = 'rgba(170,186,255,0.16)';
      g.beginPath();
      g.arc(x, y, Math.max(1.2, cs * 0.025), 0, TAU);
      g.fill();
    }
    // подсветка клетки под курсором
    if (hover >= 0 && (drag || selected) && placeable(hover) && !placed.has(hover)) {
      const x = bx + (hover % level.w) * cs, y = by + ((hover / level.w) | 0) * cs;
      g.strokeStyle = 'rgba(255,255,255,0.5)';
      g.lineWidth = 1.5;
      g.setLineDash([4, 4]);
      g.beginPath();
      g.roundRect(x + 4, y + 4, cs - 8, cs - 8, 8);
      g.stroke();
      g.setLineDash([]);
    }
  }

  function drawCells() {
    for (let i = 0; i < board.cells.length; i++) {
      const c = board.cells[i];
      const x = cx(i % level.w), y = cy((i / level.w) | 0);
      if (c.k === 'wall') drawWall(x, y);
      else if (c.k === 'emitter') drawEmitter(x, y, c);
      else if (c.k === 'target') drawTarget(x, y, c);
      else if (c.k === 'mirror' || c.k === 'splitter' || c.k === 'prism' || c.k === 'filter') drawPlacedPiece(x, y, c, true);
    }
    for (const [i, p] of placed) drawPlacedPiece(cx(i % level.w), cy((i / level.w) | 0), p, false);
  }
  function drawWall(x, y) {
    const s = cs * 0.46;
    const grd = g.createLinearGradient(x, y - s, x, y + s);
    grd.addColorStop(0, '#232a3d');
    grd.addColorStop(1, '#10131e');
    g.fillStyle = grd;
    g.beginPath();
    g.roundRect(x - s, y - s, s * 2, s * 2, cs * 0.12);
    g.fill();
    g.strokeStyle = 'rgba(190,205,255,0.14)';
    g.lineWidth = 1;
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.05)';
    g.beginPath();
    g.roundRect(x - s + 3, y - s + 3, s * 2 - 6, s * 0.35, cs * 0.08);
    g.fill();
  }
  function drawEmitter(x, y, c) {
    const r = cs * 0.3;
    const [dx, dy] = [E.DX[c.d], E.DY[c.d]];
    const col = RGB[c.m];
    // сопло
    g.save();
    g.translate(x, y);
    g.rotate(Math.atan2(dy, dx));
    const ng = g.createLinearGradient(0, -r * 0.42, 0, r * 0.42);
    ng.addColorStop(0, '#8a94b3');
    ng.addColorStop(0.5, '#3a4260');
    ng.addColorStop(1, '#5d6687');
    g.fillStyle = ng;
    g.beginPath();
    g.roundRect(0, -r * 0.42, r * 1.5, r * 0.84, r * 0.2);
    g.fill();
    g.fillStyle = `rgba(${col},0.9)`;              // цветное кольцо на срезе сопла
    g.fillRect(r * 1.28, -r * 0.3, r * 0.14, r * 0.6);
    g.restore();
    const halo = g.createRadialGradient(x, y, 0, x, y, r * 2.4);
    halo.addColorStop(0, `rgba(${col},0.35)`);
    halo.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = halo;
    g.beginPath();
    g.arc(x, y, r * 2.4, 0, TAU);
    g.fill();
    g.fillStyle = '#1a1f30';
    g.strokeStyle = 'rgba(200,215,255,0.35)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
    g.stroke();
    const core = g.createRadialGradient(x, y, 0, x, y, r * 0.7);
    core.addColorStop(0, '#ffffff');
    core.addColorStop(0.35, `rgb(${col})`);
    core.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = core;
    g.beginPath();
    g.arc(x, y, r * 0.72, 0, TAU);
    g.fill();
  }
  function drawTarget(x, y, c) {
    const r = cs * 0.3;
    const need = RGB[c.m], got = res ? res.hits[c.ti] : 0;
    const ok = got === c.m;
    const tsp = ok ? 1 : 0.45;
    g.lineWidth = Math.max(2, cs * 0.05);
    g.strokeStyle = `rgba(${need},${tsp})`;
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.stroke();
    // засечки: какие компоненты нужны
    const comps = [1, 2, 4].filter((b) => c.m & b);
    comps.forEach((b, k) => {
      const a = -Math.PI / 2 + (k - (comps.length - 1) / 2) * 0.5;
      g.fillStyle = `rgb(${RGB[b]})`;
      g.beginPath();
      g.arc(x + Math.cos(a) * (r + cs * 0.1), y + Math.sin(a) * (r + cs * 0.1), Math.max(1.6, cs * 0.03), 0, TAU);
      g.fill();
    });
    if (got) {
      const gc = RGB[got] || [255, 255, 255];
      const core = g.createRadialGradient(x, y, 0, x, y, r * 0.9);
      core.addColorStop(0, ok ? '#ffffff' : `rgba(${gc},0.9)`);
      core.addColorStop(0.5, `rgba(${gc},${ok ? 0.9 : 0.5})`);
      core.addColorStop(1, `rgba(${gc},0)`);
      g.fillStyle = core;
      g.beginPath();
      g.arc(x, y, r * 0.9, 0, TAU);
      g.fill();
      if (!ok) {
        // неверный цвет — мигающий крестик
        g.strokeStyle = `rgba(255,255,255,${0.35 + 0.35 * Math.sin(time * 8)})`;
        g.lineWidth = 1.5;
        const k = r * 0.3;
        g.beginPath();
        g.moveTo(x - k, y - k); g.lineTo(x + k, y + k);
        g.moveTo(x + k, y - k); g.lineTo(x - k, y + k);
        g.stroke();
      }
    }
    if (ok) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 6; k++) {
        const a = time * 1.4 + (k * TAU) / 6;
        g.fillStyle = `rgba(${need},0.8)`;
        g.beginPath();
        g.arc(x + Math.cos(a) * r * 1.35, y + Math.sin(a) * r * 1.35, Math.max(1.2, cs * 0.02), 0, TAU);
        g.fill();
      }
      g.restore();
    }
  }
  function drawPlacedPiece(x, y, p, fixed) {
    const s = cs * 0.5;
    // подложка: закреплённые детали — с болтами
    g.fillStyle = fixed ? 'rgba(255,255,255,0.035)' : 'rgba(150,180,255,0.07)';
    g.beginPath();
    g.roundRect(x - s * 0.86, y - s * 0.86, s * 1.72, s * 1.72, cs * 0.14);
    g.fill();
    if (fixed) {
      g.fillStyle = 'rgba(200,210,240,0.35)';
      for (const [ax, ay] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        g.beginPath();
        g.arc(x + ax * s * 0.66, y + ay * s * 0.66, Math.max(1.2, cs * 0.022), 0, TAU);
        g.fill();
      }
    }
    g.save();
    g.translate(x, y);
    if (p.k === 'mirror' || p.k === 'splitter') {
      if (p.ang == null) p.ang = angFor(p.o);
      const target = angFor(p.o);
      if (!fixed) p.ang = lerp(p.ang, target, 0.25);
      g.rotate(fixed ? target : p.ang);
      drawBar(g, cs * 0.86, cs * 0.12, p.k === 'splitter');
    } else if (p.k === 'prism') drawPrism(g, cs * 0.32);
    else if (p.k === 'filter') drawFilter(g, cs * 0.26, p.m);
    g.restore();
  }

  function drawDragGhost() {
    if (!drag || !drag.moved) return;
    const r = cv.getBoundingClientRect();
    const x = drag.x - r.left, y = drag.y - r.top;
    g.globalAlpha = 0.85;
    g.save();
    g.translate(x, y);
    if (drag.type === 'mirror' || drag.type === 'splitter') {
      g.rotate(angFor(drag.o || 0));
      drawBar(g, cs * 0.86, cs * 0.12, drag.type === 'splitter');
    } else if (drag.type === 'prism') drawPrism(g, cs * 0.32);
    else drawFilter(g, cs * 0.26, E.FILTERS[drag.type.slice(7)]);
    g.restore();
    g.globalAlpha = 1;
  }

  function drawHint() {
    if (!hint) return;
    const x = cx(hint.ci % level.w), y = cy((hint.ci / level.w) | 0);
    const a = 0.45 + 0.35 * Math.sin((time - hintT) * 5);
    g.strokeStyle = hint.mode === 'remove' ? `rgba(255,120,120,${a})` : `rgba(255,255,255,${a})`;
    g.lineWidth = 2;
    g.setLineDash([6, 5]);
    g.beginPath();
    g.roundRect(x - cs * 0.45, y - cs * 0.45, cs * 0.9, cs * 0.9, cs * 0.16);
    g.stroke();
    g.setLineDash([]);
    if (hint.mode !== 'place') return;     // повернуть или убрать — достаточно рамки вокруг детали
    g.globalAlpha = a;
    g.save();
    g.translate(x, y);
    if (hint.type === 'mirror' || hint.type === 'splitter') { g.rotate(angFor(hint.o)); drawBar(g, cs * 0.86, cs * 0.12, hint.type === 'splitter'); }
    else if (hint.type === 'prism') drawPrism(g, cs * 0.32);
    else drawFilter(g, cs * 0.26, E.FILTERS[hint.type.slice(7)]);
    g.restore();
    g.globalAlpha = 1;
  }

  function drawFx(dt) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (let i = fx.length - 1; i >= 0; i--) {
      const p = fx[i];
      p.t += dt;
      if (p.t > p.life) { fx.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.96; p.vy *= 0.96;
      const a = 1 - p.t / p.life;
      g.fillStyle = `rgba(${p.c[0]},${p.c[1]},${p.c[2]},${a})`;
      g.beginPath();
      g.arc(p.x, p.y, 1.2 + a * 2, 0, TAU);
      g.fill();
    }
    g.restore();
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    if (level) {
      drawBoard();
      drawBeams();
      drawCells();
      drawHint();
      drawDragGhost();
      drawFx(dt);
    }
    requestAnimationFrame(frame);
  }

  /* ---------- Старт ---------- */
  const firstUnsolved = LEVELS.findIndex((_, i) => !progress[i]);
  // для обложки — решённый уровень, где видны все цвета спектра
  const COVER = Math.max(0, LEVELS.findIndex((L) => L.name === 'Жёлтый и голубой'));
  if (SHOT) load(COVER, true);
  else load(firstUnsolved < 0 ? 0 : firstUnsolved);
  if (SHOT) winAt = -10;
  requestAnimationFrame(frame);
})();
