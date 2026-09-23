/* Ламповые часы.
   Шесть газоразрядных индикаторов в духе ИН-14 (цифры-катоды стоят стопкой, горит одна),
   вакуумно-люминесцентная панель в духе ИВ-18 и декатрон для секунд. Всё — живой SVG. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const n2 = x => Math.round(x * 100) / 100;
  const pad = (x, n = 2) => String(x).padStart(n, '0');

  // ———————————————————— Катоды: однолинейные цифры 40×70 ————————————————————
  const DIG = {
    0: 'M20 3 C10 3 4 16 4 35 C4 54 10 67 20 67 C30 67 36 54 36 35 C36 16 30 3 20 3 Z',
    1: 'M13 12 L21 3 V67',
    2: 'M5 16 C5 8 11 3 20 3 C29 3 35 9 35 18 C35 30 24 38 5 67 H36',
    3: 'M5 3 H34 L18 29 C29 28 36 36 36 47 C36 59 29 67 19 67 C11 67 6 63 4 57',
    4: 'M29 67 V3 L4 47 H37',
    5: 'M34 3 H9 L7 30 C11 27 15 26 20 26 C30 26 36 34 36 45 C36 58 29 67 19 67 C11 67 6 63 4 57',
    6: 'M32 8 C28 4 24 3 20 3 C10 3 4 16 4 38 C4 57 11 67 20 67 C30 67 36 59 36 48 C36 37 29 30 20 30 C12 30 6 36 4 43',
    7: 'M4 3 H36 L14 67',
    8: 'M20 33 C11 33 6 27 6 18 C6 9 12 3 20 3 C28 3 34 9 34 18 C34 27 29 33 20 33 C10 33 4 40 4 50 C4 60 11 67 20 67 C29 67 36 60 36 50 C36 40 30 33 20 33 Z',
    9: 'M8 62 C12 66 16 67 20 67 C30 67 36 54 36 32 C36 13 29 3 20 3 C10 3 4 11 4 22 C4 33 11 40 20 40 C28 40 34 34 36 27',
  };
  const STACK = [1, 7, 4, 6, 2, 3, 5, 9, 0, 8];   // от передней сетки к задней

  function hexMesh() {
    let d = '';
    const r = 4.2, w = r * Math.sqrt(3);
    for (let row = 0; row < 32; row++) {
      for (let col = 0; col < 12; col++) {
        const cx = 12 + col * w + (row % 2) * (w / 2), cy = 46 + row * r * 1.5;
        if (cx < 12 || cx > 88 || cy > 178) continue;
        for (let k = 0; k < 3; k++) {
          const a0 = (Math.PI / 3) * k + Math.PI / 6, a1 = a0 + Math.PI / 3;
          d += `M${n2(cx + r * Math.cos(a0))} ${n2(cy + r * Math.sin(a0))}L${n2(cx + r * Math.cos(a1))} ${n2(cy + r * Math.sin(a1))}`;
        }
      }
    }
    return d;
  }
  const MESH = hexMesh();
  const GLASS = 'M10 44 C10 12 26 4 50 4 C74 4 90 12 90 44 V204 H10 Z';

  function tubeSVG() {
    return `<svg viewBox="0 0 100 250" aria-hidden="true">
      <defs><clipPath id="tc${uid}"><path d="${GLASS}"/></clipPath></defs>
      <path d="${GLASS}" fill="#140F0C" fill-opacity=".72"/>
      <path d="${GLASS}" fill="url(#glass)"/>
      <path d="M16 40 C16 16 30 9 50 9 C70 9 84 16 84 40 Z" fill="url(#getter)"/>
      <g clip-path="url(#tc${uid++})">
        <ellipse class="fog" cx="50" cy="112" rx="46" ry="74" fill="url(#neon-fog)"/>
        <line x1="17" y1="44" x2="17" y2="200" stroke="#4E4640" stroke-width="1.3"/>
        <line x1="83" y1="44" x2="83" y2="200" stroke="#4E4640" stroke-width="1.3"/>
        <ellipse cx="50" cy="46" rx="34" ry="4" fill="#CFC5BA" fill-opacity=".14" stroke="#8A8077" stroke-opacity=".4" stroke-width=".6"/>
        <ellipse cx="50" cy="180" rx="34" ry="4" fill="#CFC5BA" fill-opacity=".1" stroke="#8A8077" stroke-opacity=".35" stroke-width=".6"/>
        <g class="digits" transform="translate(21 60) scale(1.45)"></g>
        <path d="${MESH}" stroke="#241C17" stroke-opacity=".62" stroke-width=".7" fill="none"/>
      </g>
      <path d="M17 40 C15 72 15 150 17 198" stroke="#FFFFFF" stroke-opacity=".2" stroke-width="3.2" fill="none" stroke-linecap="round"/>
      <path d="M24 30 C28 18 38 12 50 11" stroke="#FFFFFF" stroke-opacity=".28" stroke-width="2" fill="none" stroke-linecap="round"/>
      <path d="M83 60 C85 100 85 160 83 196" stroke="#FFFFFF" stroke-opacity=".09" stroke-width="2" fill="none" stroke-linecap="round"/>
      <path d="${GLASS}" fill="none" stroke="#DCE7E4" stroke-opacity=".32" stroke-width="1.1"/>
      <rect x="6" y="200" width="88" height="10" rx="3" fill="#B08236"/>
      <rect x="6" y="200" width="88" height="3" rx="1.5" fill="#F0D08A" fill-opacity=".7"/>
      <rect x="9" y="209" width="82" height="30" rx="6" fill="url(#base)"/>
      <path d="M26 239 V248 M42 239 V248 M58 239 V248 M74 239 V248" stroke="#8C8479" stroke-width="2"/>
    </svg>`;
  }
  let uid = 0;
  function digitsInner(d, bright) {
    const idx = d == null ? -1 : STACK.indexOf(d);
    let back = '', front = '';
    STACK.forEach((k, i) => {
      const off = `translate(${n2((i - 4.5) * 0.32)} ${n2((i - 4.5) * 0.18)})`;
      const w = `<path d="${DIG[k]}" transform="${off}"/>`;
      if (i > idx) back += w; else if (i < idx) front += w;
    });
    let lit = '';
    if (d != null) {
      const off = `translate(${n2((idx - 4.5) * 0.32)} ${n2((idx - 4.5) * 0.18)})`;
      lit = `<g class="lit" transform="${off}" style="opacity:${bright}">
        <path d="${DIG[d]}" stroke="#FF4A00" stroke-width="7" stroke-opacity=".85" filter="url(#glow-big)"/>
        <path d="${DIG[d]}" stroke="#FF8A2A" stroke-width="3.2" filter="url(#glow-mid)"/>
        <path d="${DIG[d]}" stroke="#FFB870" stroke-width="2"/>
        <path d="${DIG[d]}" stroke="#FFF1DC" stroke-width="1"/>
      </g>`;
    }
    return `<g fill="none" stroke-linecap="round" stroke-linejoin="round">
      <g stroke="#75685E" stroke-width="1" opacity=".34">${back}</g>${lit}
      <g stroke="#2A211B" stroke-width="1" opacity=".42">${front}</g></g>`;
  }
  function sepSVG() {
    return `<svg viewBox="0 0 24 40" aria-hidden="true">
      <ellipse cx="12" cy="18" rx="9" ry="14" fill="#140F0C" fill-opacity=".7" stroke="#DCE7E4" stroke-opacity=".3" stroke-width=".8"/>
      <circle class="lit" cx="12" cy="17" r="3.4" fill="#FF7A1A" filter="url(#glow-mid)"/>
      <circle class="lit core" cx="12" cy="17" r="1.6" fill="#FFD9A8"/>
      <path d="M8 8 C9 6 11 5 12 5" stroke="#fff" stroke-opacity=".3" stroke-width="1" fill="none"/>
      <rect x="6" y="31" width="12" height="7" rx="2" fill="#1C1917"/>
    </svg>`;
  }

  // ———————————————————— Сборка ламп ————————————————————
  const tubesBox = $('#tubes');
  const tubes = [];
  for (let i = 0; i < 6; i++) {
    const el = document.createElement('div');
    el.className = 'tube';
    el.innerHTML = tubeSVG();
    el.title = 'Щёлкните — лампа переберёт все цифры';
    tubesBox.appendChild(el);
    const t = { el, g: el.querySelector('.digits'), fog: el.querySelector('.fog'), shown: -2, bright: -1, spinUntil: 0, spinDigit: 0, nextSpin: 0 };
    el.addEventListener('click', () => { spin(i, 1.1); Sound.ensure(); });
    tubes.push(t);
    if (i === 1 || i === 3) {
      const s = document.createElement('div');
      s.className = 'sep';
      s.innerHTML = sepSVG() + sepSVG();
      tubesBox.appendChild(s);
    }
  }
  const seps = $$('.sep .lit');

  // ———————————————————— Панель ИВ-18 ————————————————————
  const SEG = (() => {
    const W = 24, H = 42, t = 3.6, h = H / 2;
    return {
      a: [[2, 0], [W - 2, 0], [W - 2 - t, t], [2 + t, t]],
      b: [[W, 2], [W, h - 1], [W - t, h - t / 2 - 1], [W - t, 2 + t]],
      c: [[W, h + 1], [W, H - 2], [W - t, H - 2 - t], [W - t, h + t / 2 + 1]],
      d: [[2 + t, H - t], [W - 2 - t, H - t], [W - 2, H], [2, H]],
      e: [[0, h + 1], [t, h + t / 2 + 1], [t, H - 2 - t], [0, H - 2]],
      f: [[0, 2], [t, 2 + t], [t, h - t / 2 - 1], [0, h - 1]],
      g: [[2, h], [2 + t, h - t / 2], [W - 2 - t, h - t / 2], [W - 2, h], [W - 2 - t, h + t / 2], [2 + t, h + t / 2]],
    };
  })();
  const SEGMAP = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', '-': 'g', ' ': '', L: 'fed', P: 'abefg', E: 'afged', r: 'eg', t: 'fged', o: 'cdeg' };
  const vfdBox = $('#vfd');
  let vfdText = '';
  function renderVFD(text) {
    if (text === vfdText) return;
    vfdText = text;
    let cells = '', lit = '';
    for (let i = 0; i < 8; i++) {
      const x = 34 + i * 38, ch = text[i] || ' ', on = SEGMAP[ch] || '';
      for (const s in SEG) {
        const p = SEG[s].map(([a, b]) => `${n2(x + a - b * 0.14)},${n2(24 + b)}`).join(' ');
        if (on.includes(s)) lit += `<polygon points="${p}"/>`;
        else cells += `<polygon points="${p}"/>`;
      }
    }
    vfdBox.innerHTML = `<svg viewBox="0 0 360 92" role="img" aria-label="Панель: ${text.replace(/ /g, '')}">
      <defs><pattern id="vgrid" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="4" stroke="#0A1411" stroke-width=".8"/></pattern></defs>
      <rect x="4" y="12" width="348" height="68" rx="34" fill="#07110E"/>
      <path d="M352 36 Q362 46 352 56" fill="#0E1A16" stroke="#A9C9C0" stroke-opacity=".3"/>
      <line x1="22" y1="30" x2="340" y2="30" stroke="#FF8A6A" stroke-opacity=".14" stroke-width=".5"/>
      <line x1="22" y1="46" x2="340" y2="46" stroke="#FF8A6A" stroke-opacity=".12" stroke-width=".5"/>
      <line x1="22" y1="62" x2="340" y2="62" stroke="#FF8A6A" stroke-opacity=".14" stroke-width=".5"/>
      <g fill="#16302A">${cells}</g>
      <g fill="#35F5C0" filter="url(#glow-vfd)" opacity=".8">${lit}</g>
      <g fill="#B5FFEA">${lit}</g>
      <rect x="24" y="20" width="312" height="52" fill="url(#vgrid)" opacity=".55"/>
      <rect x="4" y="12" width="348" height="68" rx="34" fill="url(#glass)"/>
      <path d="M36 20 H320" stroke="#fff" stroke-opacity=".16" stroke-width="3" stroke-linecap="round"/>
      <rect x="4" y="12" width="348" height="68" rx="34" fill="none" stroke="#DCE7E4" stroke-opacity=".3"/>
    </svg>`;
  }

  // ———————————————————— Декатрон ————————————————————
  const dekBox = $('#dek');
  let pins = '';
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * Math.PI * 2 - Math.PI / 2, main = i % 3 === 0;
    pins += `<line x1="${n2(80 + Math.cos(a) * 42)}" y1="${n2(80 + Math.sin(a) * 42)}" x2="${n2(80 + Math.cos(a) * (main ? 55 : 51))}" y2="${n2(80 + Math.sin(a) * (main ? 55 : 51))}" stroke="${main ? '#9A8F85' : '#6E655D'}" stroke-width="${main ? 2 : 1.3}" stroke-linecap="round"/>`;
  }
  dekBox.innerHTML = `<svg viewBox="0 0 160 160" role="img" aria-label="Декатрон">
    <circle cx="80" cy="80" r="76" fill="#B08236"/><circle cx="80" cy="80" r="72" fill="#1A1410"/>
    <circle cx="80" cy="80" r="68" fill="#0E0B09"/>${pins}
    <circle cx="80" cy="80" r="30" fill="#2C2622" stroke="#5C534B"/><circle cx="80" cy="80" r="22" fill="#1E1A17"/>
    <g id="dek-glow"></g>
    <circle cx="80" cy="80" r="68" fill="url(#glass)"/>
    <path d="M36 44 A56 56 0 0 1 80 22" stroke="#fff" stroke-opacity=".22" stroke-width="3" fill="none" stroke-linecap="round"/>
  </svg>`;
  const dekGlow = $('#dek-glow');
  let dekShown = -1;
  function renderDek(pos) {
    const p = Math.round(pos) % 30;
    if (p === dekShown) return;
    dekShown = p;
    let s = '';
    for (let k = 0; k < 4; k++) {
      const q = (p - k + 30) % 30, a = (q / 30) * Math.PI * 2 - Math.PI / 2, x = 80 + Math.cos(a) * 48, y = 80 + Math.sin(a) * 48, o = [1, 0.35, 0.15, 0.06][k];
      s += `<circle cx="${n2(x)}" cy="${n2(y)}" r="${k ? 6 : 9}" fill="#FF5A10" opacity="${o}" filter="url(#glow-big)"/>`;
      if (!k) s += `<circle cx="${n2(x)}" cy="${n2(y)}" r="3.4" fill="#FFB27A"/><circle cx="${n2(x)}" cy="${n2(y)}" r="1.6" fill="#FFE8CC"/>`;
    }
    dekGlow.innerHTML = s;
  }

  // ———————————————————— Звук ————————————————————
  const Sound = {
    ctx: null, on: false,
    ensure() {
      if (!this.on) return;
      try {
        if (!this.ctx) { const AC = window.AudioContext || window.webkitAudioContext; this.ctx = new AC(); }
        if (this.ctx.state === 'suspended') this.ctx.resume();
      } catch (e) { this.ctx = null; }
    },
    tick(vol = 0.08) {
      if (!this.on || !this.ctx || this.ctx.state !== 'running') return;
      const c = this.ctx, t = c.currentTime, len = Math.floor(c.sampleRate * 0.03), b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 6);
      const s = c.createBufferSource(); s.buffer = b;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = 2.5;
      const g = c.createGain(); g.gain.value = vol;
      s.connect(f); f.connect(g); g.connect(c.destination); s.start(t);
    },
    beep() {
      if (!this.on || !this.ctx || this.ctx.state !== 'running') return;
      const c = this.ctx, t = c.currentTime;
      for (let k = 0; k < 3; k++) {
        const o = c.createOscillator(), g = c.createGain();
        o.type = 'triangle'; o.frequency.value = 1320;
        g.gain.setValueAtTime(0, t + k * 0.22); g.gain.linearRampToValueAtTime(0.14, t + k * 0.22 + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + k * 0.22 + 0.16);
        o.connect(g); g.connect(c.destination); o.start(t + k * 0.22); o.stop(t + k * 0.22 + 0.2);
      }
    },
  };
  $('#btn-sound').addEventListener('click', e => {
    Sound.on = !Sound.on;
    e.currentTarget.setAttribute('aria-pressed', String(Sound.on));
    Sound.ensure();
    Sound.tick(0.1);
  });

  // ———————————————————— Режимы ————————————————————
  const S = {
    mode: 'clock',
    timer: { total: 5 * 60e3, left: 5 * 60e3, run: false, end: 0, alarmUntil: 0 },
    watch: { run: false, start: 0, acc: 0, laps: [] },
  };
  const acts = $('#acts');
  function actBtn(label, fn, cls = '') {
    const b = document.createElement('button');
    b.className = `brass small ${cls}`;
    b.innerHTML = `<i></i><span>${label}</span>`;
    b.addEventListener('click', () => { Sound.ensure(); Sound.tick(0.06); fn(b); });
    return b;
  }
  function renderActs() {
    acts.innerHTML = '';
    if (S.mode === 'clock') {
      acts.innerHTML = '<span class="engr">местное время · 24 часа</span>';
    } else if (S.mode === 'timer') {
      const T = S.timer;
      acts.append(
        actBtn('+1 мин', () => { if (!T.run) { T.total = Math.min(T.total + 60e3, 99 * 3600e3); T.left = T.total; } }),
        actBtn('+10 с', () => { if (!T.run) { T.total = Math.min(T.total + 10e3, 99 * 3600e3); T.left = T.total; } }),
        actBtn(T.run ? 'Пауза' : 'Пуск', b => {
          const now = performance.now();
          if (T.run) { T.left = Math.max(0, T.end - now); T.run = false; }
          else { if (T.left <= 0) T.left = T.total; T.end = now + T.left; T.run = true; }
          b.querySelector('span').textContent = T.run ? 'Пауза' : 'Пуск';
          b.classList.toggle('on', T.run);
        }, T.run ? 'on' : ''),
        actBtn('Сброс', () => { T.run = false; T.total = 5 * 60e3; T.left = T.total; T.alarmUntil = 0; renderActs(); }),
      );
    } else {
      const Wt = S.watch;
      acts.append(
        actBtn(Wt.run ? 'Стоп' : 'Пуск', b => {
          const now = performance.now();
          if (Wt.run) { Wt.acc += now - Wt.start; Wt.run = false; } else { Wt.start = now; Wt.run = true; }
          b.querySelector('span').textContent = Wt.run ? 'Стоп' : 'Пуск';
          b.classList.toggle('on', Wt.run);
        }, Wt.run ? 'on' : ''),
        actBtn('Круг', () => { const e = watchElapsed(); const prev = Wt.laps.length ? Wt.laps[Wt.laps.length - 1].at : 0; Wt.laps.push({ at: e, len: e - prev }); }),
        actBtn('Сброс', () => { Wt.run = false; Wt.acc = 0; Wt.laps = []; renderActs(); }),
      );
    }
  }
  function watchElapsed() { const Wt = S.watch; return Wt.acc + (Wt.run ? performance.now() - Wt.start : 0); }
  function setMode(m) {
    S.mode = m;
    $$('.modes .brass[data-mode]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.mode === m)));
    renderActs();
    spinAll(0.55, 0.06);
  }
  $$('.modes .brass[data-mode]').forEach(b => b.addEventListener('click', () => { Sound.ensure(); Sound.tick(0.06); setMode(b.dataset.mode); }));
  $('.modes .brass[data-act="warm"]').addEventListener('click', () => { Sound.ensure(); warm(); });

  // ———————————————————— Перебор катодов ————————————————————
  function spin(i, dur, delay = 0) {
    const now = performance.now() / 1000;
    tubes[i].spinFrom = now + delay;
    tubes[i].spinUntil = now + delay + dur;
  }
  function spinAll(dur, stagger) { tubes.forEach((_, i) => spin(i, dur + i * stagger)); }
  let warmUntil = 0;
  function warm() { warmUntil = performance.now() / 1000 + 2.6; tubes.forEach((t, i) => { t.spinFrom = 0; t.spinUntil = 0; }); }

  // ———————————————————— Что показывать ————————————————————
  function target(nowMs) {
    const d = new Date();
    if (S.mode === 'clock') {
      const s = d.getSeconds() + d.getMilliseconds() / 1000;
      return { digits: `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`, vfd: `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${pad(d.getFullYear() % 100)}`, dek: (s / 60) * 30, sep: d.getMilliseconds() < 500 };
    }
    if (S.mode === 'timer') {
      const T = S.timer;
      let left = T.run ? Math.max(0, T.end - nowMs) : T.left;
      if (T.run && left <= 0) { T.run = false; T.left = 0; T.alarmUntil = nowMs + 4000; Sound.beep(); renderActs(); }
      const sec = Math.ceil(left / 1000), h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
      const ts = Math.round(T.total / 1000);
      const blink = T.alarmUntil > nowMs && Math.floor(nowMs / 250) % 2 === 0;
      return { digits: blink ? null : `${pad(h)}${pad(m)}${pad(s)}`, vfd: `${pad(Math.floor(ts / 3600))}-${pad(Math.floor((ts % 3600) / 60))}-${pad(ts % 60)}`, dek: T.run ? (nowMs / 1000) * 3 : 0, sep: T.run ? (nowMs % 1000) < 500 : true };
    }
    const e = watchElapsed(), cs = Math.floor(e / 10) % 100, s = Math.floor(e / 1000) % 60, m = Math.floor(e / 60000) % 60, h = Math.floor(e / 3600000);
    const lap = S.watch.laps.length ? S.watch.laps[S.watch.laps.length - 1].len : 0;
    const lcs = Math.floor(lap / 10) % 100, ls = Math.floor(lap / 1000) % 60, lm = Math.floor(lap / 60000) % 60;
    return { digits: h > 0 ? `${pad(h)}${pad(m)}${pad(s)}` : `${pad(m)}${pad(s)}${pad(cs)}`, vfd: S.watch.laps.length ? `${pad(lm)}-${pad(ls)}-${pad(lcs)}` : '--------', dek: (e / 1000) * 30, sep: true };
  }

  // ———————————————————— Главный цикл ————————————————————
  let lastSec = -1, frame = 0;
  function loop(ts) {
    requestAnimationFrame(loop);
    if (document.hidden) return;
    frame++;
    const nowMs = performance.now(), now = nowMs / 1000;
    const tg = target(nowMs);
    const warming = now < warmUntil;
    tubes.forEach((t, i) => {
      let d = tg.digits ? +tg.digits[i] : null;
      if (warming) {
        const k = Math.floor((warmUntil - now) * 11 + i * 2);
        d = STACK[((k % 10) + 10) % 10];
      } else if (t.spinUntil > now && now >= (t.spinFrom || 0)) {
        if (now > t.nextSpin) { t.spinDigit = Math.floor(Math.random() * 10); t.nextSpin = now + 0.045; }
        d = t.spinDigit;
      }
      const flick = 0.93 + 0.07 * Math.sin(ts / 37 + i * 1.7) * Math.sin(ts / 91 + i);
      if (d !== t.shown) {
        t.g.innerHTML = digitsInner(d, flick.toFixed(3));
        t.lit = t.g.querySelector('.lit');
        t.fog.style.opacity = d == null ? 0 : 1;
        t.shown = d;
      } else if (t.lit && frame % 3 === 0) t.lit.style.opacity = flick.toFixed(3);
    });
    seps.forEach(s => (s.style.opacity = tg.sep ? 1 : 0.06));
    renderVFD(tg.vfd);
    renderDek(tg.dek);
    const sec = Math.floor(Date.now() / 1000);
    if (sec !== lastSec) {
      if (lastSec >= 0 && S.mode === 'clock') Sound.tick();
      // раз в час — сам себя «прогревает», как настоящие часы
      const d = new Date();
      if (lastSec >= 0 && d.getMinutes() === 0 && d.getSeconds() === 0) warm();
      lastSec = sec;
    }
  }

  // ———————————————————— Дерево корпуса ————————————————————
  function woodTexture() {
    const w = 900, h = 360, cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const g = cv.getContext('2d'), img = g.createImageData(w, h), px = img.data;
    const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
    const noise = (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const warp = noise(x * 0.004, y * 0.03) * 26 + noise(x * 0.02, y * 0.1) * 4;
        const grain = Math.sin((y + warp) * 0.34 + noise(x * 0.01, y * 0.004) * 5);
        const fine = noise(x * 0.8, y * 0.05) * 0.22;
        const t = 0.5 + 0.35 * grain + fine - 0.11;
        const r = 38 + t * 58, gg = 22 + t * 34, b = 13 + t * 20;
        const k = (y * w + x) * 4;
        px[k] = r; px[k + 1] = gg; px[k + 2] = b; px[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    const lg = g.createLinearGradient(0, 0, 0, h);
    lg.addColorStop(0, 'rgba(255, 210, 160, 0.12)'); lg.addColorStop(0.4, 'rgba(0,0,0,0)'); lg.addColorStop(1, 'rgba(0,0,0,0.3)');
    g.fillStyle = lg; g.fillRect(0, 0, w, h);
    return cv.toDataURL('image/jpeg', 0.86);
  }
  $('.case').style.backgroundImage = `url(${woodTexture()})`;

  renderActs();
  // вступление: лампы перебирают цифры и по очереди «ловят» текущее время
  tubes.forEach((_, i) => spin(i, 0.7 + i * 0.16));
  requestAnimationFrame(loop);
  window.__nixie = { setMode, warm };
})();
