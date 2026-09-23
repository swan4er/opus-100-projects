/* Гравитационный гольф — игра: рендер, ввод, уровни, звук. */
(function () {
  'use strict';

  const { W, H, PROBE_R, DT, MAX_T, MAX_PULL, LAUNCH_K, bodyPos, accel, check, simulate, launchVelocity, potential } = window.GGPhys;
  const LEVELS = window.GGLevels;
  const $ = (s) => document.querySelector(s);
  const SHOT = !!window.__SHOT__;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------------------------------------------------------- палитра
  const INK = '#2b2d42';
  const PAPER = '#f3ebdd';
  const CORAL = '#ef7d68';
  const STYLES = {
    peach: { base: '#f4a58a', dark: '#df876c', light: '#f9c6b2' },
    mint: { base: '#9fd8c7', dark: '#7fbfad', light: '#c4eadf' },
    lavender: { base: '#b9a8dc', dark: '#9d8ac7', light: '#d6cbee' },
    butter: { base: '#f6d57e', dark: '#e5bd5c', light: '#fbe7ae' },
    sky: { base: '#9cc6ea', dark: '#7aaad4', light: '#c3def4' },
  };

  // ---------------------------------------------------------------- холст и преобразование мира
  const cv = $('#game');
  const ctx = cv.getContext('2d');
  let vw = 0, vh = 0, dpr = 1;
  let M = [1, 0, 0, 1, 0, 0];     // мир → экран (CSS-пиксели)
  let Minv = [1, 0, 0, 1, 0, 0];
  let S = 1;                      // масштаб
  let portrait = false;

  function layout() {
    dpr = SHOT ? 1 : Math.min(2, window.devicePixelRatio || 1);
    vw = innerWidth; vh = innerHeight;
    cv.width = Math.round(vw * dpr); cv.height = Math.round(vh * dpr);
    portrait = vh > vw * 1.05;
    // на заставке мир уходит правее карточки (или выше неё на телефоне), чтобы демо-полёт был виден целиком
    const intro = state === 'intro';
    let top = portrait ? 150 : 118, bottom = portrait ? 70 : 54, side = portrait ? 14 : 36, left = side;
    if (intro && !portrait) { top = 40; bottom = 40; left = Math.min(640, vw * 0.44); }
    if (intro && portrait) { top = 16; bottom = Math.min(360, vh * 0.44); }
    if (!portrait) {
      S = Math.min((vw - left - side) / W, (vh - top - bottom) / H);
      const tx = left + (vw - left - side - W * S) / 2, ty = top + (vh - top - bottom - H * S) / 2;
      M = [S, 0, 0, S, tx, ty];
    } else {
      S = Math.min((vw - side * 2) / H, (vh - top - bottom) / W);
      const tx = (vw - H * S) / 2, ty = top + (vh - top - bottom - W * S) / 2;
      // поворот на −90°: мировая ось x идёт снизу вверх
      M = [0, -S, S, 0, tx, ty + W * S];
    }
    const [a, b, c, d, e, f] = M;
    const det = a * d - b * c;
    Minv = [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
    buildBackground();
    buildContours();
  }
  const toScreen = (x, y) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]];
  const toWorld = (x, y) => [Minv[0] * x + Minv[2] * y + Minv[4], Minv[1] * x + Minv[3] * y + Minv[5]];

  // ---------------------------------------------------------------- фон: бумага, зерно, пастельные звёзды
  const bgCanvas = document.createElement('canvas');
  function buildBackground() {
    bgCanvas.width = cv.width; bgCanvas.height = cv.height;
    const g = bgCanvas.getContext('2d');
    const grad = g.createRadialGradient(cv.width * 0.3, cv.height * 0.25, 0, cv.width * 0.5, cv.height * 0.5, Math.max(cv.width, cv.height) * 0.8);
    grad.addColorStop(0, '#f7f0e4');
    grad.addColorStop(1, '#ede2cf');
    g.fillStyle = grad;
    g.fillRect(0, 0, cv.width, cv.height);
    // зерно бумаги
    const n = document.createElement('canvas');
    n.width = 160; n.height = 160;
    const ng = n.getContext('2d');
    const id = ng.createImageData(160, 160);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < id.data.length; i += 4) {
      const v = rnd();
      id.data[i] = 90; id.data[i + 1] = 70; id.data[i + 2] = 50; id.data[i + 3] = v < 0.5 ? 0 : (v - 0.5) * 22;
    }
    ng.putImageData(id, 0, 0);
    g.fillStyle = g.createPattern(n, 'repeat');
    g.fillRect(0, 0, cv.width, cv.height);
    // волокна
    g.strokeStyle = 'rgba(120, 95, 70, 0.05)';
    g.lineWidth = 1 * dpr;
    for (let i = 0; i < 90; i++) {
      const x = rnd() * cv.width, y = rnd() * cv.height, l = (20 + rnd() * 60) * dpr, a = rnd() * Math.PI;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + 6, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    // звёзды-крестики
    const cols = ['#e6a58f', '#9cc6ea', '#b9a8dc', '#e7c66a', '#8fcbb9'];
    for (let i = 0; i < 70; i++) {
      const x = rnd() * cv.width, y = rnd() * cv.height, s = (2 + rnd() * 3.5) * dpr;
      g.strokeStyle = cols[i % cols.length];
      g.globalAlpha = 0.55;
      g.lineWidth = 1.4 * dpr;
      if (i % 3 === 0) {
        g.beginPath(); g.moveTo(x - s, y); g.lineTo(x + s, y); g.moveTo(x, y - s); g.lineTo(x, y + s); g.stroke();
      } else {
        g.fillStyle = cols[i % cols.length];
        g.beginPath(); g.arc(x, y, s * 0.35, 0, Math.PI * 2); g.fill();
      }
    }
    g.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- изолинии потенциала (топографическая карта гравитации)
  const contourCanvas = document.createElement('canvas');
  function buildContours() {
    contourCanvas.width = cv.width; contourCanvas.height = cv.height;
    const g = contourCanvas.getContext('2d');
    if (!level) return;
    const GX = 200, GY = 125;
    const vals = new Float32Array((GX + 1) * (GY + 1));
    let minV = 0;
    for (let j = 0; j <= GY; j++) for (let i = 0; i <= GX; i++) {
      const v = potential(level, i / GX * W, j / GY * H);
      vals[j * (GX + 1) + i] = v;
      if (v < minV) minV = v;
    }
    if (minV >= 0) return;
    g.setTransform(dpr * M[0], dpr * M[1], dpr * M[2], dpr * M[3], dpr * M[4], dpr * M[5]);
    g.lineJoin = 'round';
    // логарифмически расставленные уровни потенциала
    const levelsList = [];
    let v = -900;
    while (v > minV * 0.98 && levelsList.length < 40) { levelsList.push(v); v *= 1.28; }
    levelsList.forEach((lv, k) => {
      g.strokeStyle = k % 4 === 3 ? 'rgba(43,45,66,0.20)' : 'rgba(43,45,66,0.09)';
      g.lineWidth = (k % 4 === 3 ? 1.3 : 0.9) / S;
      g.beginPath();
      for (let j = 0; j < GY; j++) for (let i = 0; i < GX; i++) {
        const a = vals[j * (GX + 1) + i], b = vals[j * (GX + 1) + i + 1];
        const c = vals[(j + 1) * (GX + 1) + i + 1], d = vals[(j + 1) * (GX + 1) + i];
        const idx = (a < lv ? 1 : 0) | (b < lv ? 2 : 0) | (c < lv ? 4 : 0) | (d < lv ? 8 : 0);
        if (idx === 0 || idx === 15) continue;
        const x0 = i / GX * W, y0 = j / GY * H, sx = W / GX, sy = H / GY;
        const lerp = (p, q) => (lv - p) / (q - p);
        const top = [x0 + sx * lerp(a, b), y0], right = [x0 + sx, y0 + sy * lerp(b, c)];
        const bot = [x0 + sx * lerp(d, c), y0 + sy], left = [x0, y0 + sy * lerp(a, d)];
        const seg = (p, q) => { g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); };
        switch (idx) {
          case 1: case 14: seg(left, top); break;
          case 2: case 13: seg(top, right); break;
          case 3: case 12: seg(left, right); break;
          case 4: case 11: seg(right, bot); break;
          case 5: seg(left, top); seg(right, bot); break;
          case 6: case 9: seg(top, bot); break;
          case 7: case 8: seg(left, bot); break;
          case 10: seg(top, right); seg(left, bot); break;
        }
      }
      g.stroke();
    });
  }

  // ---------------------------------------------------------------- звук (после первого жеста)
  let audio = null, soundOn = true;
  try { soundOn = localStorage.getItem('gg-sound') !== '0'; } catch (e) { /* без хранилища */ }
  function ac() {
    if (!audio) {
      try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audio = null; }
    }
    if (audio && audio.state === 'suspended') audio.resume();
    return audio;
  }
  function tone(freq, t0, dur, type, vol, glideTo) {
    const a = ac();
    if (!a || !soundOn) return;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type || 'triangle';
    o.frequency.setValueAtTime(freq, a.currentTime + t0);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, a.currentTime + t0 + dur);
    g.gain.setValueAtTime(0.0001, a.currentTime + t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.12, a.currentTime + t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + t0 + dur);
    o.connect(g).connect(a.destination);
    o.start(a.currentTime + t0);
    o.stop(a.currentTime + t0 + dur + 0.05);
  }
  function noise(t0, dur, vol, freq) {
    const a = ac();
    if (!a || !soundOn) return;
    const len = Math.floor(a.sampleRate * dur);
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    src.buffer = buf; f.type = 'lowpass'; f.frequency.value = freq || 900; g.gain.value = vol || 0.2;
    src.connect(f).connect(g).connect(a.destination);
    src.start(a.currentTime + t0);
  }
  const sfx = {
    launch: (p) => { tone(220 + p * 180, 0, 0.35, 'sine', 0.12, 520 + p * 300); noise(0, 0.25, 0.06, 1800); },
    crash: () => { noise(0, 0.45, 0.28, 700); tone(110, 0, 0.4, 'sine', 0.14, 50); },
    win: () => { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.09, 0.9, 'triangle', 0.09)); tone(1567.98, 0.36, 1.4, 'sine', 0.04); },
    click: () => tone(880, 0, 0.08, 'sine', 0.04),
    lost: () => tone(440, 0, 0.8, 'sine', 0.06, 180),
  };

  // ---------------------------------------------------------------- прогресс
  let progress = {};
  try { progress = JSON.parse(localStorage.getItem('gg-progress') || '{}') || {}; } catch (e) { progress = {}; }
  function saveProgress() { try { localStorage.setItem('gg-progress', JSON.stringify(progress)); } catch (e) { /* без хранилища */ } }

  // ---------------------------------------------------------------- состояние игры
  let li = 0;             // индекс уровня
  let level = null;
  let state = 'intro';    // intro | aim | flying | result | levels
  let attempts = 0;
  let probe = null;       // {x,y,vx,vy,t}
  let trail = [];
  let aim = null;         // {px,py} — вектор натяжения в мировых единицах
  let aimAngle = 0, aimPull = 120; // для клавиатуры
  let simT = 0;           // время полёта (движение лун)
  let particles = [];
  let rings = [];
  let demo = null;        // призрачный полёт на заставке
  let clock = 0;

  function loadLevel(i, keepState) {
    li = (i + LEVELS.length) % LEVELS.length;
    level = LEVELS[li];
    attempts = 0;
    resetProbe();
    buildContours();
    $('#lvNum').textContent = String(li + 1).padStart(2, '0');
    $('#lvName').textContent = level.name;
    $('#lvHint').textContent = level.hint;
    updateHud();
    if (!keepState) state = 'aim';
  }
  function resetProbe() {
    probe = { x: level.start[0], y: level.start[1], vx: 0, vy: 0, t: 0 };
    trail = [];
    simT = 0;
    aim = null;
  }
  function updateHud() {
    $('#attempts').textContent = attempts === 0 ? 'первая попытка' : `попыток: ${attempts}`;
    const best = progress[li] || 0;
    $('#best').innerHTML = starsSvg(best, 16);
  }
  function starsSvg(n, size) {
    let s = '';
    for (let i = 0; i < 3; i++) {
      const on = i < n;
      s += `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 16.9l-5.4 2.8 1-6.1-4.4-4.3 6.1-.9z" fill="${on ? '#f2b64c' : 'none'}" stroke="${on ? '#d99a2b' : 'rgba(43,45,66,.35)'}" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
    }
    return s;
  }

  // ---------------------------------------------------------------- запуск и полёт
  function launch(px, py) {
    const [vx, vy] = launchVelocity(px, py);
    probe = { x: level.start[0], y: level.start[1], vx, vy, t: 0 };
    trail = [];
    simT = 0;
    flightAcc = 0;
    attempts++;
    state = 'flying';
    aim = null;
    updateHud();
    sfx.launch(Math.min(1, Math.hypot(px, py) / MAX_PULL));
    hideTip();
  }

  // Полёт идёт ровно теми же фиксированными шагами, что и решатель: проверенные решения совпадают с игрой.
  const acc = [0, 0];
  let flightAcc = 0;
  function stepFlight(dt) {
    flightAcc += dt;
    while (flightAcc >= DT) {
      flightAcc -= DT;
      accel(level, probe.t, probe.x, probe.y, acc);
      probe.vx += 0.5 * DT * acc[0]; probe.vy += 0.5 * DT * acc[1];
      probe.x += DT * probe.vx; probe.y += DT * probe.vy;
      probe.t += DT;
      accel(level, probe.t, probe.x, probe.y, acc);
      probe.vx += 0.5 * DT * acc[0]; probe.vy += 0.5 * DT * acc[1];
      const hit = check(level, probe.t, probe.x, probe.y);
      if (hit) { onHit(hit); return; }
      if (probe.t > MAX_T) { onHit({ res: 'timeout' }); return; }
    }
    simT = probe.t;
    trail.push(probe.x, probe.y);
    if (trail.length > 900) trail.splice(0, 2);
  }

  let resultTimer = 0;
  function onHit(hit) {
    simT = probe.t;
    if (hit.res === 'hole') {
      state = 'result';
      const hb = level.bodies[hit.i];
      const hp = bodyPos(level, hit.i, probe.t, [0, 0]);
      rings.push({ x: hp[0], y: hp[1], t: 0 });
      probe.sink = { x: hp[0], y: hp[1], t: 0, r0: Math.hypot(probe.x - hp[0], probe.y - hp[1]), a0: Math.atan2(probe.y - hp[1], probe.x - hp[0]) };
      const stars = attempts <= 1 ? 3 : attempts <= 3 ? 2 : 1;
      if ((progress[li] || 0) < stars) { progress[li] = stars; saveProgress(); }
      sfx.win();
      clearTimeout(resultTimer);
      resultTimer = setTimeout(() => showResult(stars), 900);
      void hb;
    } else {
      const msg = {
        crash: 'Зонд разбился. Попробуйте другой угол.',
        horizon: 'Зонд пересёк горизонт событий. Оттуда не возвращаются.',
        lost: 'Зонд улетел в межзвёздное пространство.',
        timeout: 'Зонд застрял на орбите. Красиво, но мимо.',
      }[hit.res] || 'Мимо.';
      burst(probe.x, probe.y, hit.res === 'crash' || hit.res === 'horizon');
      hit.res === 'lost' || hit.res === 'timeout' ? sfx.lost() : sfx.crash();
      toast(msg);
      state = 'crashed';
      clearTimeout(resultTimer);
      resultTimer = setTimeout(() => { if (state === 'crashed') { resetProbe(); state = 'aim'; } }, 1100);
    }
  }

  function burst(x, y, big) {
    const cols = ['#f4a58a', '#9fd8c7', '#b9a8dc', '#f6d57e', '#9cc6ea', CORAL];
    const n = big ? 38 : 16;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 260;
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, col: cols[i % cols.length], r: 3 + Math.random() * 5, rot: Math.random() * 6 });
    }
  }

  // ---------------------------------------------------------------- рисование
  function drawPlanet(g, x, y, r, st, deco, seed, t) {
    const c = STYLES[st] || STYLES.peach;
    // бумажная тень
    g.fillStyle = 'rgba(43,45,66,0.13)';
    g.beginPath(); g.arc(x + r * 0.08 + 3, y + r * 0.1 + 4, r, 0, Math.PI * 2); g.fill();
    if (deco === 'sun') {
      // лучистая звезда
      g.save();
      g.translate(x, y);
      g.rotate(t * 0.2);
      g.fillStyle = c.light;
      for (let i = 0; i < 12; i++) {
        g.rotate(Math.PI / 6);
        g.beginPath(); g.moveTo(r * 0.8, -r * 0.16); g.lineTo(r * 1.32, 0); g.lineTo(r * 0.8, r * 0.16); g.fill();
      }
      g.restore();
    }
    g.fillStyle = c.base;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    g.save();
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.clip();
    if (deco === 'bands') {
      g.fillStyle = c.dark;
      for (let k = -3; k <= 3; k++) {
        const yy = y + k * r * 0.3 + Math.sin(seed + k) * r * 0.05;
        g.globalAlpha = 0.45;
        g.fillRect(x - r, yy, r * 2, r * (0.07 + ((k + 3) % 3) * 0.035));
      }
      g.globalAlpha = 1;
    } else if (deco === 'craters') {
      g.fillStyle = c.dark;
      for (let k = 0; k < 7; k++) {
        const a = seed * 3.1 + k * 2.39, rr = r * (0.25 + ((k * 37) % 50) / 100);
        const cx = x + Math.cos(a) * rr * 0.9, cy = y + Math.sin(a) * rr * 0.9;
        g.globalAlpha = 0.5;
        g.beginPath(); g.arc(cx, cy, r * (0.07 + (k % 3) * 0.05), 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;
    } else if (deco === 'spots') {
      g.fillStyle = c.light;
      for (let k = 0; k < 9; k++) {
        const a = seed * 1.7 + k * 1.9, rr = r * (0.2 + ((k * 53) % 70) / 100);
        g.globalAlpha = 0.8;
        g.beginPath(); g.arc(x + Math.cos(a) * rr, y + Math.sin(a) * rr, r * 0.06 + (k % 2) * r * 0.04, 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;
    } else if (deco === 'sun') {
      g.fillStyle = c.light;
      g.globalAlpha = 0.6;
      g.beginPath(); g.arc(x, y, r * 0.62, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;
    }
    // объём: светлый серп сверху-слева и тень справа-снизу
    g.fillStyle = 'rgba(255,255,255,0.28)';
    g.beginPath(); g.arc(x - r * 0.28, y - r * 0.3, r * 0.78, 0, Math.PI * 2); g.arc(x - r * 0.12, y - r * 0.1, r * 0.82, 0, Math.PI * 2, true); g.fill();
    g.fillStyle = 'rgba(43,45,66,0.12)';
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.arc(x - r * 0.18, y - r * 0.2, r * 1.02, 0, Math.PI * 2, true); g.fill();
    g.restore();
  }

  function drawRock(g, x, y, r, seed) {
    const pts = 9;
    const shape = [];
    for (let i = 0; i < pts; i++) {
      const a = i / pts * Math.PI * 2;
      const rr = r * (0.78 + 0.3 * Math.abs(Math.sin(seed * 7.13 + i * 2.7)));
      shape.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]);
    }
    g.fillStyle = 'rgba(43,45,66,0.14)';
    g.beginPath(); shape.forEach(([px, py], i) => (i ? g.lineTo(px + 2.5, py + 3.5) : g.moveTo(px + 2.5, py + 3.5))); g.closePath(); g.fill();
    g.fillStyle = '#cfc2b2';
    g.beginPath(); shape.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); g.closePath(); g.fill();
    g.fillStyle = '#b8aa98';
    g.beginPath(); g.arc(x + r * 0.2, y + r * 0.15, r * 0.22, 0, Math.PI * 2); g.fill();
  }

  function drawBlackHole(g, x, y, r, t) {
    // кольца «линзы»
    for (let k = 3; k >= 1; k--) {
      g.strokeStyle = `rgba(43,45,66,${0.05 * k})`;
      g.lineWidth = 1.2 / S;
      g.beginPath(); g.arc(x, y, r * (1.6 + k * 0.9), 0, Math.PI * 2); g.stroke();
    }
    // аккреционный диск
    g.save();
    g.translate(x, y);
    g.rotate(t * 0.8);
    g.scale(1, 0.42);
    const grad = g.createLinearGradient(-r * 2.6, 0, r * 2.6, 0);
    grad.addColorStop(0, '#b9a8dc'); grad.addColorStop(0.5, '#f4a58a'); grad.addColorStop(1, '#f6d57e');
    g.strokeStyle = grad;
    g.lineWidth = r * 0.55;
    g.beginPath(); g.arc(0, 0, r * 2.05, 0, Math.PI * 2); g.stroke();
    g.restore();
    g.fillStyle = INK;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#f9c6b2';
    g.lineWidth = 2.2 / S;
    g.beginPath(); g.arc(x, y, r * 1.12, 0, Math.PI * 2); g.stroke();
  }

  function drawHole(g, x, y, r, t) {
    g.save();
    g.translate(x, y);
    const k = 1 + Math.sin(t * 2.2) * 0.04;
    g.scale(k, k);
    g.fillStyle = 'rgba(58,143,138,0.10)';
    g.beginPath(); g.arc(0, 0, r * 1.9, 0, Math.PI * 2); g.fill();
    const cols = ['#c4eadf', '#9fd8c7', '#6fbfae', '#4a9f96', '#2f7a79'];
    for (let i = 0; i < 5; i++) {
      const rr = r * (1.5 - i * 0.28);
      g.strokeStyle = cols[i];
      g.lineWidth = r * 0.16;
      g.lineCap = 'round';
      const a0 = t * (1.2 + i * 0.5) + i * 1.3;
      g.beginPath(); g.arc(0, 0, rr, a0, a0 + Math.PI * 1.35); g.stroke();
    }
    g.fillStyle = '#23565a';
    g.beginPath(); g.arc(0, 0, r * 0.28, 0, Math.PI * 2); g.fill();
    g.restore();
  }

  function drawStart(g, x, y, t) {
    g.strokeStyle = 'rgba(239,125,104,0.55)';
    g.lineWidth = 2 / S;
    g.setLineDash([6 / S, 7 / S]);
    g.lineDashOffset = -t * 12 / S;
    g.beginPath(); g.arc(x, y, 30, 0, Math.PI * 2); g.stroke();
    g.setLineDash([]);
    g.fillStyle = 'rgba(239,125,104,0.14)';
    g.beginPath(); g.arc(x, y, 22, 0, Math.PI * 2); g.fill();
  }

  function drawProbe(g, x, y, vx, vy, t, flame) {
    const ang = Math.atan2(vy, vx);
    g.save();
    g.translate(x, y);
    g.rotate(ang);
    if (flame) {
      g.fillStyle = CORAL;
      g.globalAlpha = 0.85;
      const fl = 10 + Math.sin(t * 40) * 3;
      g.beginPath(); g.moveTo(-9, -4); g.lineTo(-9 - fl, 0); g.lineTo(-9, 4); g.fill();
      g.globalAlpha = 1;
    }
    g.fillStyle = INK;
    g.beginPath(); g.moveTo(-6, -8); g.lineTo(-11, -9); g.lineTo(-8, 0); g.lineTo(-11, 9); g.lineTo(-6, 8); g.fill();
    g.fillStyle = '#fffaf2';
    g.strokeStyle = INK;
    g.lineWidth = 2.2;
    g.beginPath(); g.ellipse(0, 0, 12, 8, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#9cc6ea';
    g.beginPath(); g.arc(3, 0, 3.2, 0, Math.PI * 2); g.fill();
    g.restore();
  }

  function orbitGuide(g, b, i) {
    const o = b.orbit;
    let cx, cy;
    if (typeof o.around === 'number') { const p = bodyPos(level, o.around, simT, [0, 0]); cx = p[0]; cy = p[1]; }
    else { cx = o.around[0]; cy = o.around[1]; }
    g.strokeStyle = 'rgba(43,45,66,0.22)';
    g.lineWidth = 1.2 / S;
    g.setLineDash([3 / S, 8 / S]);
    g.beginPath(); g.arc(cx, cy, o.r, 0, Math.PI * 2); g.stroke();
    g.setLineDash([]);
    // стрелка направления движения
    const p = bodyPos(level, i, simT, [0, 0]);
    const a = Math.atan2(p[1] - cy, p[0] - cx) + Math.sign(o.speed) * 0.42;
    const ax = cx + Math.cos(a) * o.r, ay = cy + Math.sin(a) * o.r;
    const ta = a + Math.sign(o.speed) * Math.PI / 2;
    g.fillStyle = 'rgba(43,45,66,0.35)';
    g.beginPath();
    g.moveTo(ax + Math.cos(ta) * 8, ay + Math.sin(ta) * 8);
    g.lineTo(ax + Math.cos(ta + 2.5) * 7, ay + Math.sin(ta + 2.5) * 7);
    g.lineTo(ax + Math.cos(ta - 2.5) * 7, ay + Math.sin(ta - 2.5) * 7);
    g.fill();
  }

  function drawWorld(g, t, lv, time) {
    const bs = lv.bodies;
    const pos = [0, 0];
    // орбиты
    bs.forEach((b, i) => { if (b.orbit) orbitGuide(g, b, i); });
    drawStart(g, lv.start[0], lv.start[1], clock);
    bs.forEach((b, i) => {
      bodyPos(lv, i, time, pos);
      if (b.kind === 'hole') drawHole(g, pos[0], pos[1], b.r, clock);
    });
    bs.forEach((b, i) => {
      bodyPos(lv, i, time, pos);
      if (b.kind === 'planet' || b.kind === 'moon') drawPlanet(g, pos[0], pos[1], b.r, b.style, b.deco, i * 1.37 + li, clock);
      else if (b.kind === 'rock') drawRock(g, pos[0], pos[1], b.r, i + 1);
      else if (b.kind === 'blackhole') drawBlackHole(g, pos[0], pos[1], b.r, clock);
    });
  }

  function drawTrail(g, tr, color) {
    const n = tr.length / 2;
    for (let i = 0; i < n; i += 3) {
      const a = (i / n);
      g.fillStyle = color;
      g.globalAlpha = 0.15 + a * 0.75;
      g.beginPath(); g.arc(tr[i * 2], tr[i * 2 + 1], 1.6 + a * 2.2, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
  }

  // предсказание первого отрезка траектории
  function predict(px, py) {
    const [vx, vy] = launchVelocity(px, py);
    const r = simulate(level, vx, vy, { maxT: 0.6, record: true, recordEvery: 7 });
    return r.path || [];
  }

  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(bgCanvas, 0, 0);
    ctx.drawImage(contourCanvas, 0, 0);
    ctx.setTransform(dpr * M[0], dpr * M[1], dpr * M[2], dpr * M[3], dpr * M[4], dpr * M[5]);

    // рамка игрового поля
    ctx.strokeStyle = 'rgba(43,45,66,0.10)';
    ctx.lineWidth = 1.2 / S;
    ctx.setLineDash([2 / S, 6 / S]);
    ctx.strokeRect(0, 0, W, H);
    ctx.setLineDash([]);

    const lv = state === 'intro' && demo ? demo.level : level;
    const time = state === 'intro' && demo ? demo.t : simT;
    if (!lv) return;

    if (state === 'intro' && demo) {
      drawWorld(ctx, 0, lv, time);
      drawTrail(ctx, demo.trail, 'rgba(43,45,66,0.9)');
      if (demo.p) drawProbe(ctx, demo.p[0], demo.p[1], demo.p[2], demo.p[3], clock, true);
    } else {
      drawWorld(ctx, 0, lv, time);
      drawTrail(ctx, trail, CORAL);
      // прицел
      if (state === 'aim' && aim) {
        const [sx, sy] = lv.start;
        const len = Math.min(MAX_PULL, Math.hypot(aim.px, aim.py));
        const k = len / Math.max(1e-6, Math.hypot(aim.px, aim.py));
        const ex = sx + aim.px * k, ey = sy + aim.py * k;
        ctx.strokeStyle = 'rgba(43,45,66,0.55)';
        ctx.lineWidth = 2 / S;
        ctx.setLineDash([5 / S, 6 / S]);
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = INK;
        ctx.beginPath(); ctx.arc(ex, ey, 6, 0, Math.PI * 2); ctx.fill();
        // дуга силы
        const f = len / MAX_PULL;
        ctx.strokeStyle = CORAL;
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        const base = Math.atan2(-aim.py, -aim.px);
        ctx.beginPath(); ctx.arc(sx, sy, 44, base - f * 1.2, base + f * 1.2); ctx.stroke();
        const path = predict(aim.px, aim.py);
        for (let i = 0; i < path.length; i += 3) {
          const a = 1 - i / path.length;
          ctx.fillStyle = `rgba(43,45,66,${(0.15 + a * 0.7).toFixed(3)})`;
          ctx.beginPath(); ctx.arc(path[i], path[i + 1], 2.2 + a * 1.8, 0, Math.PI * 2); ctx.fill();
        }
      }
      if (state !== 'result' || (probe.sink && probe.sink.t < 1)) {
        let x = probe.x, y = probe.y;
        if (probe.sink) {
          const s = probe.sink;
          const rr = s.r0 * (1 - Math.min(1, s.t));
          const a = s.a0 + s.t * 9;
          x = s.x + Math.cos(a) * rr; y = s.y + Math.sin(a) * rr;
          ctx.save();
          ctx.translate(x, y); ctx.scale(1 - Math.min(0.9, s.t), 1 - Math.min(0.9, s.t)); ctx.translate(-x, -y);
          drawProbe(ctx, x, y, -Math.sin(a), Math.cos(a), clock, false);
          ctx.restore();
        } else if (state !== 'crashed') {
          drawProbe(ctx, x, y, state === 'flying' ? probe.vx : (aim ? -aim.px : 1), state === 'flying' ? probe.vy : (aim ? -aim.py : 0), clock, state === 'flying');
        }
      }
    }
    // кольца успеха
    rings.forEach((r) => {
      for (let k = 0; k < 3; k++) {
        const tt = r.t - k * 0.18;
        if (tt <= 0 || tt > 1.4) continue;
        ctx.strokeStyle = `rgba(58,143,138,${(0.6 * (1 - tt / 1.4)).toFixed(3)})`;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(r.x, r.y, 30 + tt * 170, 0, Math.PI * 2); ctx.stroke();
      }
    });
    // конфетти
    particles.forEach((p) => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.col;
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillRect(-p.r, -p.r * 0.6, p.r * 2, p.r * 1.2);
      ctx.restore();
    });
    // подпись цели (в экранных координатах, чтобы не поворачивалась)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const hole = lv.bodies.find((b) => b.kind === 'hole');
    if (hole && state !== 'result') {
      const [hx, hy] = toScreen(hole.x, hole.y);
      ctx.font = `600 12px Nunito, system-ui, sans-serif`;
      ctx.fillStyle = 'rgba(35,86,90,0.9)';
      ctx.textAlign = 'center';
      ctx.fillText('червоточина', hx, hy + hole.r * S * 1.9 + 16);
    }
  }

  // ---------------------------------------------------------------- заставка с демонстрацией
  function makeDemo() {
    const idx = 14; // «Дыра и луна»: чёрная дыра, планета и луна — самый эффектный пролёт
    const lv = LEVELS[idx];
    const sol = lv.demo;
    if (!sol) return null;
    const a = sol[0] * Math.PI / 180, s = sol[1] * LAUNCH_K;
    const r = simulate(lv, Math.cos(a) * s, Math.sin(a) * s, { record: true, recordEvery: 1 });
    return { level: lv, path: r.path, t: 0, i: 0, trail: [], p: null, dur: r.t, pause: 0 };
  }
  function stepDemo(dt) {
    const d = demo;
    if (!d) return;
    if (d.pause > 0) { d.pause -= dt; if (d.pause <= 0) { d.t = 0; d.i = 0; d.trail = []; } return; }
    d.t += dt;
    while (d.i < d.path.length / 3 && d.path[d.i * 3 + 2] < d.t) d.i++;
    if (d.i >= d.path.length / 3) { d.pause = 1.4; rings.push({ x: d.path[d.path.length - 3], y: d.path[d.path.length - 2], t: 0 }); d.p = null; return; }
    const k = d.i;
    const x = d.path[k * 3], y = d.path[k * 3 + 1];
    const px = d.path[Math.max(0, k - 1) * 3], py = d.path[Math.max(0, k - 1) * 3 + 1];
    d.p = [x, y, x - px || 1, y - py];
    if (k % 2 === 0) { d.trail.push(x, y); if (d.trail.length > 800) d.trail.splice(0, 2); }
  }

  // ---------------------------------------------------------------- интерфейс
  const intro = $('#intro'), resultCard = $('#result'), levelsView = $('#levels'), tip = $('#tip');
  function show(el, on) { el.classList.toggle('show', on); el.setAttribute('aria-hidden', on ? 'false' : 'true'); }

  function startGame(i) {
    ac();
    show(intro, false);
    show(levelsView, false);
    show(resultCard, false);
    rings = []; particles = [];
    state = 'aim';
    loadLevel(i);
    layout();
    document.body.classList.add('playing');
    showTip();
  }
  function showResult(stars) {
    $('#resStars').innerHTML = starsSvg(stars, 38);
    $('#resTitle').textContent = stars === 3 ? 'С первого раза!' : 'Точно в червоточину!';
    $('#resText').textContent = attempts === 1 ? 'Одна попытка — идеальный манёвр.' : `Попыток: ${attempts}. Меньше трёх — две звезды, с первой — три.`;
    $('#resNext').textContent = li === LEVELS.length - 1 ? 'К списку уровней' : 'Дальше';
    show(resultCard, true);
    setTimeout(() => $('#resNext').focus({ preventScroll: true }), 50);
  }
  function openLevels() {
    const grid = $('#levelGrid');
    grid.innerHTML = '';
    LEVELS.forEach((lv, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'lvcard' + (progress[i] ? ' done' : '');
      b.innerHTML = `<span class="n">${String(i + 1).padStart(2, '0')}</span><span class="t">${lv.name}</span><span class="s">${starsSvg(progress[i] || 0, 14)}</span>`;
      b.addEventListener('click', () => { sfx.click(); startGame(i); });
      grid.appendChild(b);
    });
    const total = Object.values(progress).reduce((a, b) => a + b, 0);
    $('#totalStars').textContent = `${total} из ${LEVELS.length * 3}`;
    show(levelsView, true);
    show(resultCard, false);
    state = state === 'intro' ? 'intro' : 'levels';
  }
  let tipTimer = 0;
  function showTip() {
    tip.classList.add('show');
    clearTimeout(tipTimer);
    tipTimer = setTimeout(hideTip, 6000);
  }
  function hideTip() { tip.classList.remove('show'); }
  let toastTimer = 0;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 1900);
  }

  $('#btnPlay').addEventListener('click', () => { sfx.click(); startGame(0); });
  $('#btnPick').addEventListener('click', () => { sfx.click(); openLevels(); });
  $('#btnLevels').addEventListener('click', () => { sfx.click(); openLevels(); });
  $('#btnRestart').addEventListener('click', () => { if (state === 'intro') return; sfx.click(); restart(); });
  $('#closeLevels').addEventListener('click', () => { show(levelsView, false); if (state === 'levels') state = level ? 'aim' : 'intro'; if (!level) show(intro, true); });
  $('#resNext').addEventListener('click', () => { sfx.click(); if (li === LEVELS.length - 1) openLevels(); else startGame(li + 1); });
  $('#resAgain').addEventListener('click', () => { sfx.click(); show(resultCard, false); attempts = 0; rings = []; resetProbe(); state = 'aim'; updateHud(); });
  $('#resetProgress').addEventListener('click', () => { progress = {}; saveProgress(); openLevels(); });
  const btnSound = $('#btnSound');
  function syncSound() { btnSound.classList.toggle('off', !soundOn); btnSound.setAttribute('aria-pressed', soundOn ? 'true' : 'false'); btnSound.setAttribute('aria-label', soundOn ? 'Выключить звук' : 'Включить звук'); }
  btnSound.addEventListener('click', () => { soundOn = !soundOn; try { localStorage.setItem('gg-sound', soundOn ? '1' : '0'); } catch (e) { /* без хранилища */ } syncSound(); if (soundOn) sfx.click(); });
  syncSound();

  function restart() {
    clearTimeout(resultTimer);
    show(resultCard, false);
    rings = []; particles = [];
    resetProbe();
    state = 'aim';
  }

  // ---------------------------------------------------------------- ввод: натянуть и отпустить
  let dragging = false;
  cv.addEventListener('pointerdown', (e) => {
    if (state !== 'aim') return;
    ac();
    cv.setPointerCapture(e.pointerId);
    dragging = true;
    updateAim(e);
  });
  cv.addEventListener('pointermove', (e) => { if (dragging) updateAim(e); });
  cv.addEventListener('pointerup', (e) => {
    if (!dragging) return;
    dragging = false;
    updateAim(e);
    if (aim && Math.hypot(aim.px, aim.py) > 18) launch(aim.px, aim.py);
    else aim = null;
  });
  cv.addEventListener('pointercancel', () => { dragging = false; aim = null; });
  function updateAim(e) {
    const r = cv.getBoundingClientRect();
    const [wx, wy] = toWorld(e.clientX - r.left, e.clientY - r.top);
    const px = wx - level.start[0], py = wy - level.start[1];
    aim = { px, py };
    aimAngle = Math.atan2(-py, -px);
    aimPull = Math.min(MAX_PULL, Math.hypot(px, py));
  }

  window.addEventListener('keydown', (e) => {
    if (e.target && e.target.tagName === 'BUTTON' && (e.key === 'Enter' || e.key === ' ')) return;
    if (e.key === 'r' || e.key === 'R' || e.key === 'к' || e.key === 'К') { if (state !== 'intro') restart(); }
    else if (e.key === 'Escape') { if (levelsView.classList.contains('show')) $('#closeLevels').click(); else if (state !== 'intro') openLevels(); }
    else if (state === 'aim' && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      e.preventDefault();
      const fine = e.shiftKey ? 0.25 : 1;
      if (e.key === 'ArrowLeft') aimAngle -= 0.0175 * fine;
      if (e.key === 'ArrowRight') aimAngle += 0.0175 * fine;
      if (e.key === 'ArrowUp') aimPull = Math.min(MAX_PULL, aimPull + 5 * fine);
      if (e.key === 'ArrowDown') aimPull = Math.max(20, aimPull - 5 * fine);
      aim = { px: -Math.cos(aimAngle) * aimPull, py: -Math.sin(aimAngle) * aimPull };
    } else if (state === 'aim' && (e.key === ' ' || e.key === 'Enter') && aim) {
      e.preventDefault();
      launch(aim.px, aim.py);
    }
  });

  // ---------------------------------------------------------------- цикл
  let last = performance.now();
  let running = true;
  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    clock += reduceMotion ? dt * 0.3 : dt;
    if (state === 'intro') stepDemo(dt);
    else if (state === 'flying') stepFlight(dt);
    if (probe && probe.sink) probe.sink.t += dt * 1.1;
    rings.forEach((r) => { r.t += dt; });
    rings = rings.filter((r) => r.t < 2);
    particles.forEach((p) => { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.97; p.vy *= 0.97; p.life -= dt * 0.9; p.rot += dt * 4; });
    particles = particles.filter((p) => p.life > 0);
    render();
    requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) running = false;
    else if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); }
  });
  window.addEventListener('resize', layout);

  // ---------------------------------------------------------------- старт
  demo = makeDemo();
  level = demo ? demo.level : LEVELS[0];
  layout();
  if (SHOT && demo) { for (let i = 0; i < 150; i++) stepDemo(1 / 60); }
  show(intro, true);
  requestAnimationFrame((t) => { last = t; frame(t); });
})();
