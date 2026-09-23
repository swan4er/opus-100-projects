/* Модуляр — модульный синтезатор на Web Audio.
   Модули описаны данными; кабели — верёвки на интеграторе Верле; звук строится только после «Питания». */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const comma = (x, d = 1) => x.toFixed(d).replace('.', ',');

  // ———————————————————— Шкалы параметров ————————————————————
  const MAP = {
    vcoFreq: v => 32.703 * Math.pow(2, v * 6),
    fine: v => (v - 0.5) * 200,
    fm: v => v * v * 1800,
    lfoRate: v => 0.05 * Math.pow(2, v * 9),
    cutoff: v => 40 * Math.pow(2, v * 9),
    res: v => 0.6 + v * v * 22,
    time: v => 0.002 * Math.pow(2, v * 10.5),
    bpm: v => Math.round(60 + v * 140),
    echoTime: v => 0.04 + v * 1.16,
    size: v => 0.6 + v * 5.4,
    tone: v => 400 * Math.pow(2, v * 5),
    noiseTone: v => 200 * Math.pow(2, v * 6.3),
  };
  const NOTES = ['до', 'до♯', 'ре', 'ре♯', 'ми', 'фа', 'фа♯', 'соль', 'соль♯', 'ля', 'ля♯', 'си'];
  const hz = f => (f >= 1000 ? `${comma(f / 1000, 2)} кГц` : f >= 100 ? `${Math.round(f)} Гц` : `${comma(f, f < 1 ? 2 : 1)} Гц`);
  const note = f => { const n = Math.round(12 * Math.log2(f / 440) + 57); return `${NOTES[((n % 12) + 12) % 12]}${Math.floor(n / 12)}`; };
  const secs = s => (s < 1 ? `${Math.round(s * 1000)} мс` : `${comma(s, 2)} с`);
  const pct = v => `${Math.round(v * 100)} %`;
  const SCALES = [
    { name: 'Пентатоника', steps: [0, 3, 5, 7, 10] },
    { name: 'Дорийский', steps: [0, 2, 3, 5, 7, 9, 10] },
    { name: 'Мажор', steps: [0, 2, 4, 5, 7, 9, 11] },
    { name: 'Хроматика', steps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
  ];

  // ———————————————————— Модули ————————————————————
  // y — в пикселях для панели высотой 340; x — доля ширины модуля.
  const PH = 340;
  const RA = 100, RB = 172, RC = 262, RD = 310;
  const seqEls = [];
  for (let i = 0; i < 8; i++) {
    const x = 0.075 + i * 0.121;
    seqEls.push({ t: 'led', id: 'l' + i, x, y: 70, color: 'red' });
    seqEls.push({ t: 'knob', id: 's' + i, x, y: 106, s: 'S', def: 0.3, fmt: v => stepNoteText(v), cls: 'step' });
    seqEls.push({ t: 'step', id: 'g' + i, x, y: 150, n: i + 1, def: 1 });
  }
  const MODS = [
    { id: 'seq', title: 'Секвенсор', sub: 'восемь шагов', hp: 16, fin: 'cream', els: [
      ...seqEls,
      { t: 'knob', id: 'tempo', x: 0.1, y: 222, s: 'M', label: 'Темп', def: 0.31, fmt: v => `${MAP.bpm(v)} ударов в минуту`, cls: 'red' },
      { t: 'knob', id: 'len', x: 0.28, y: 222, s: 'M', label: 'Длина', def: 0.35, fmt: v => `гейт ${Math.round(8 + v * 88)} % шага` },
      { t: 'select', id: 'scale', x: 0.52, y: 216, label: 'Лад', opts: SCALES.map(s => s.name), def: 0 },
      { t: 'btn', id: 'run', x: 0.76, y: 214, label: 'Ход', toggle: true, def: 1 },
      { t: 'led', id: 'runled', x: 0.76, y: 186, color: 'green' },
      { t: 'out', id: 'clk', x: 0.52, y: RD, label: 'Такт', gate: true },
      { t: 'out', id: 'cv', x: 0.72, y: RD, label: '1В/окт' },
      { t: 'out', id: 'gate', x: 0.9, y: RD, label: 'Гейт', gate: true },
    ] },
    { id: 'vco1', title: 'Ген · 1', sub: 'генератор', hp: 8, fin: 'alu', els: vcoEls(0.3333) },
    { id: 'vco2', title: 'Ген · 2', sub: 'генератор', hp: 8, fin: 'alu', els: vcoEls(0.5) },
    { id: 'lfo', title: 'НЧГ', sub: 'медленный', hp: 6, fin: 'black', els: [
      { t: 'knob', id: 'rate', x: 0.5, y: RA, s: 'L', label: 'Скорость', def: 0.4, fmt: v => hz(MAP.lfoRate(v)) },
      { t: 'knob', id: 'depth', x: 0.5, y: RB, s: 'S', label: 'Глубина', def: 0.6, fmt: pct },
      { t: 'led', id: 'led', x: 0.5, y: 238, color: 'red' },
      { t: 'out', id: 'sin', x: 0.3, y: RD, label: 'Синус' },
      { t: 'out', id: 'sqr', x: 0.7, y: RD, label: 'Меандр', gate: true },
    ] },
    { id: 'noise', title: 'Шум', sub: 'белый', hp: 4, fin: 'alu', els: [
      { t: 'grille', x: 0.5, y: 112 },
      { t: 'knob', id: 'tone', x: 0.5, y: 206, s: 'M', label: 'Цвет', def: 0.8, fmt: v => hz(MAP.noiseTone(v)) },
      { t: 'out', id: 'out', x: 0.5, y: RD, label: 'Выход' },
    ] },
    { id: 'mix', title: 'Микшер', sub: 'три канала', hp: 6, fin: 'black', els: [
      { t: 'in', id: 'i1', x: 0.3, y: 96, label: '1' }, { t: 'knob', id: 'l1', x: 0.72, y: 96, s: 'S', def: 0.75, fmt: pct },
      { t: 'in', id: 'i2', x: 0.3, y: 164, label: '2' }, { t: 'knob', id: 'l2', x: 0.72, y: 164, s: 'S', def: 0.75, fmt: pct },
      { t: 'in', id: 'i3', x: 0.3, y: 232, label: '3' }, { t: 'knob', id: 'l3', x: 0.72, y: 232, s: 'S', def: 0.75, fmt: pct },
      { t: 'out', id: 'out', x: 0.5, y: RD, label: 'Выход' },
    ] },
    { id: 'scope', title: 'Осциллограф', sub: 'А — звук, Б — самописец', hp: 8, fin: 'black', els: [
      { t: 'screen', id: 'scr', x: 0.07, y: 54, w: 0.86, h: 150 },
      { t: 'knob', id: 'time', x: 0.27, y: 236, s: 'S', label: 'Развёртка', def: 0.4, fmt: v => `${Math.round(128 * Math.pow(2, v * 4))} отсчётов` },
      { t: 'knob', id: 'gain', x: 0.73, y: 236, s: 'S', label: 'Усиление', def: 0.5, fmt: v => `×${comma(Math.pow(4, v * 2 - 1), 2)}` },
      { t: 'in', id: 'a', x: 0.3, y: RD, label: 'А' },
      { t: 'in', id: 'b', x: 0.7, y: RD, label: 'Б' },
    ] },
    { id: 'vcf', title: 'Фильтр', sub: 'два каскада', hp: 8, fin: 'black', els: [
      { t: 'knob', id: 'cut', x: 0.5, y: RA, s: 'L', label: 'Срез', def: 0.5, fmt: v => hz(MAP.cutoff(v)) },
      { t: 'knob', id: 'res', x: 0.25, y: 174, s: 'S', label: 'Резонанс', def: 0.3, fmt: pct, cls: 'red' },
      { t: 'knob', id: 'depth', x: 0.75, y: 174, s: 'S', label: 'Глубина', def: 0.4, fmt: v => `${comma(v * 4, 1)} октавы на вольт` },
      { t: 'lever', id: 'mode', x: 0.5, y: 256, opts: ['НЧ', 'ПФ', 'ВЧ'], def: 0 },
      { t: 'in', id: 'in', x: 0.2, y: RD, label: 'Вход' },
      { t: 'in', id: 'cv', x: 0.5, y: RD, label: 'Срез' },
      { t: 'out', id: 'out', x: 0.8, y: RD, label: 'Выход' },
    ] },
    { id: 'env1', title: 'Огиб · 1', sub: 'АДСР', hp: 6, fin: 'alu', els: envEls() },
    { id: 'env2', title: 'Огиб · 2', sub: 'АДСР', hp: 6, fin: 'alu', els: envEls() },
    { id: 'vca', title: 'Усилитель', sub: 'управляемый', hp: 6, fin: 'alu', els: [
      { t: 'knob', id: 'level', x: 0.5, y: RA, s: 'L', label: 'Уровень', def: 0, fmt: pct },
      { t: 'knob', id: 'depth', x: 0.5, y: RB, s: 'S', label: 'Глубина', def: 0.9, fmt: pct },
      { t: 'in', id: 'in', x: 0.3, y: RC, label: 'Вход' },
      { t: 'in', id: 'cv', x: 0.7, y: RC, label: 'Упр.' },
      { t: 'out', id: 'out', x: 0.5, y: RD, label: 'Выход' },
    ] },
    { id: 'echo', title: 'Эхо', sub: 'лента', hp: 8, fin: 'cream', els: [
      { t: 'knob', id: 'time', x: 0.5, y: RA, s: 'L', label: 'Время', def: 0.34, fmt: v => secs(MAP.echoTime(v)) },
      { t: 'knob', id: 'fb', x: 0.2, y: RB, s: 'S', label: 'Отклик', def: 0.45, fmt: pct },
      { t: 'knob', id: 'tone', x: 0.5, y: RB, s: 'S', label: 'Тон', def: 0.5, fmt: v => hz(MAP.tone(v)) },
      { t: 'knob', id: 'mix', x: 0.8, y: RB, s: 'S', label: 'Смесь', def: 0.35, fmt: pct, cls: 'red' },
      { t: 'in', id: 'in', x: 0.3, y: RD, label: 'Вход' },
      { t: 'out', id: 'out', x: 0.7, y: RD, label: 'Выход' },
    ] },
    { id: 'rev', title: 'Реверб', sub: 'зал', hp: 8, fin: 'black', els: [
      { t: 'knob', id: 'size', x: 0.5, y: RA, s: 'L', label: 'Размер', def: 0.55, fmt: v => `хвост ${secs(MAP.size(v))}` },
      { t: 'knob', id: 'bright', x: 0.27, y: RB, s: 'S', label: 'Яркость', def: 0.5, fmt: pct },
      { t: 'knob', id: 'mix', x: 0.73, y: RB, s: 'S', label: 'Смесь', def: 0.3, fmt: pct, cls: 'yellow' },
      { t: 'in', id: 'in', x: 0.3, y: RD, label: 'Вход' },
      { t: 'out', id: 'out', x: 0.7, y: RD, label: 'Выход' },
    ] },
    { id: 'out', title: 'Выход', sub: 'стерео', hp: 8, fin: 'alu', els: [
      { t: 'vu', id: 'vu', x: 0.22, y: 150 },
      { t: 'knob', id: 'vol', x: 0.64, y: 108, s: 'L', label: 'Громкость', def: 0.7, fmt: pct },
      { t: 'led', id: 'power', x: 0.64, y: 200, color: 'red', label: 'Сеть' },
      { t: 'in', id: 'l', x: 0.3, y: RD, label: 'Лев.' },
      { t: 'in', id: 'r', x: 0.7, y: RD, label: 'Прав.' },
    ] },
    { id: 'logo', title: '', sub: '', hp: 6, fin: 'cream', els: [{ t: 'logo' }] },
  ];
  function vcoEls(def) {
    return [
      { t: 'knob', id: 'freq', x: 0.5, y: RA, s: 'L', label: 'Частота', def, fmt: v => `${note(MAP.vcoFreq(v))} · ${hz(MAP.vcoFreq(v))}` },
      { t: 'knob', id: 'fine', x: 0.25, y: RB, s: 'S', label: 'Тонко', def: 0.5, fmt: v => `${Math.round(MAP.fine(v))} центов` },
      { t: 'knob', id: 'fm', x: 0.75, y: RB, s: 'S', label: 'ЧМ', def: 0, fmt: pct, cls: 'yellow' },
      { t: 'in', id: 'voct', x: 0.25, y: RC, label: '1В/окт' },
      { t: 'in', id: 'fm', x: 0.75, y: RC, label: 'ЧМ' },
      { t: 'out', id: 'saw', x: 0.19, y: RD, label: 'Пила' },
      { t: 'out', id: 'sqr', x: 0.5, y: RD, label: 'Квадрат' },
      { t: 'out', id: 'sin', x: 0.81, y: RD, label: 'Синус' },
    ];
  }
  function envEls() {
    return [
      { t: 'knob', id: 'a', x: 0.28, y: 90, s: 'S', label: 'Атака', def: 0.1, fmt: v => secs(MAP.time(v)) },
      { t: 'knob', id: 'd', x: 0.72, y: 90, s: 'S', label: 'Спад', def: 0.6, fmt: v => secs(MAP.time(v)) },
      { t: 'knob', id: 's', x: 0.28, y: 164, s: 'S', label: 'Уровень', def: 0.4, fmt: pct },
      { t: 'knob', id: 'r', x: 0.72, y: 164, s: 'S', label: 'Затух.', def: 0.6, fmt: v => secs(MAP.time(v)) },
      { t: 'btn', id: 'hit', x: 0.32, y: 226, label: 'Удар' },
      { t: 'led', id: 'led', x: 0.72, y: 226, color: 'amber' },
      { t: 'in', id: 'gate', x: 0.3, y: RD, label: 'Гейт', gate: true },
      { t: 'out', id: 'out', x: 0.7, y: RD, label: 'Выход' },
    ];
  }

  // ———————————————————— Состояние ————————————————————
  const P = {};          // значения ручек и переключателей: 'vco1.freq' → 0..1
  const DEF = {};        // значения по умолчанию
  const FMT = {};        // подписи значений
  const KNOB = {};       // элементы ручек
  const JACKS = {};      // 'vco1:voct' → { el, dir, gate, mod, id }
  const LEDS = {};
  const rack = $('#rack');
  const toastEl = $('#toast');
  let toastT = 0;
  function toast(msg, ms = 3800) {
    toastEl.textContent = msg; toastEl.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('show'), ms);
  }
  function stepNoteText(v) {
    const sc = SCALES[P['seq.scale'] | 0] || SCALES[0];
    const semis = stepSemis(v, sc);
    return `${note(MAP.vcoFreq(P['vco1.freq'] ?? 0.333) * Math.pow(2, semis / 12))} · +${semis} полутонов`;
  }
  function stepSemis(v, sc) {
    const n = sc.steps.length, deg = Math.round(v * (2 * n));
    return Math.floor(deg / n) * 12 + sc.steps[deg % n];
  }

  // ———————————————————— Сборка стойки ————————————————————
  function ticksSvg() {
    let s = '';
    for (let i = 0; i <= 10; i++) {
      const a = (-135 + i * 27) * Math.PI / 180, big = i % 5 === 0;
      const r0 = 43, r1 = big ? 50 : 48;
      s += `<line class="${big ? 'major' : ''}" x1="${(Math.sin(a) * r0).toFixed(2)}" y1="${(-Math.cos(a) * r0).toFixed(2)}" x2="${(Math.sin(a) * r1).toFixed(2)}" y2="${(-Math.cos(a) * r1).toFixed(2)}"/>`;
    }
    return `<svg class="ticks" viewBox="-50 -50 100 100" aria-hidden="true">${s}</svg>`;
  }
  function place(el, e) { el.style.left = (e.x * 100) + '%'; el.style.top = (e.y / PH * 100) + '%'; }
  function buildRack() {
    for (const m of MODS) {
      const mod = document.createElement('section');
      mod.className = `mod ${m.fin}`;
      mod.style.setProperty('--w', m.hp);
      mod.dataset.id = m.id; mod.dataset.hp = m.hp;
      mod.setAttribute('aria-label', m.title || 'Панель');
      const panel = document.createElement('div');
      panel.className = 'panel';
      panel.innerHTML = `<div class="screws"></div>${m.title ? `<h2 class="mtitle">${m.title}</h2><div class="msub">${m.sub}</div>` : ''}`;
      for (const e of m.els) {
        const key = `${m.id}.${e.id}`;
        let el;
        if (e.t === 'knob') {
          P[key] = DEF[key] = e.def; FMT[key] = e.fmt || pct;
          el = document.createElement('div');
          el.className = `el kw ${e.s} ${e.cls || ''}`;
          el.innerHTML = `${ticksSvg()}<div class="knob" tabindex="0" role="slider" aria-label="${e.label || m.title}" aria-valuemin="0" aria-valuemax="100"><div class="skirt"></div><div class="cap"></div></div>${e.label ? `<span class="lbl klbl">${e.label}</span>` : ''}`;
          KNOB[key] = el.querySelector('.knob');
          bindKnob(KNOB[key], key, e.label || m.title, m.title);
        } else if (e.t === 'in' || e.t === 'out') {
          const jk = `${m.id}:${e.id}`;
          el = document.createElement('div');
          el.className = `el jack ${e.t}`;
          el.dataset.jack = jk;
          el.setAttribute('aria-label', `${m.title}: ${e.label} (${e.t === 'in' ? 'вход' : 'выход'})`);
          el.innerHTML = `<div class="nut"></div><div class="hole"></div><span class="lbl jl">${e.label}</span>`;
          JACKS[jk] = { el, dir: e.t, gate: !!e.gate, mod: m.id, id: e.id, label: `${m.title} · ${e.label}`, x: 0, y: 0 };
        } else if (e.t === 'led') {
          el = document.createElement('div');
          el.className = `el led ${e.color === 'red' ? '' : e.color}`;
          if (e.label) el.innerHTML = `<span class="lbl" style="left:50%;top:18px">${e.label}</span>`;
          LEDS[key] = el;
        } else if (e.t === 'btn') {
          P[key] = DEF[key] = e.def || 0;
          el = document.createElement('button');
          el.className = 'el mbtn';
          el.setAttribute('aria-label', e.label);
          el.innerHTML = `<span class="lbl blbl">${e.label}</span>`;
          bindButton(el, key, e);
        } else if (e.t === 'step') {
          P[key] = DEF[key] = e.def;
          el = document.createElement('button');
          el.className = 'el step-btn' + (e.def ? ' on' : '');
          el.setAttribute('aria-label', `Шаг ${e.n}: включить или выключить`);
          el.setAttribute('aria-pressed', String(!!e.def));
          el.innerHTML = `<span class="step-no">${e.n}</span>`;
          el.addEventListener('click', () => { setStep(key, P[key] > 0.5 ? 0 : 1); });
          KNOB[key] = el;
        } else if (e.t === 'lever') {
          P[key] = DEF[key] = e.def;
          el = document.createElement('button');
          el.className = 'el lever';
          el.setAttribute('aria-label', 'Режим фильтра');
          el.innerHTML = `<div class="opts">${e.opts.map((o, i) => `<span data-i="${i}">${o}</span>`).join('')}</div><i></i>`;
          el.addEventListener('click', () => setParam(key, (P[key] + 1) % e.opts.length));
          KNOB[key] = el;
          FMT[key] = v => ['нижние частоты', 'полоса', 'верхние частоты'][v];
        } else if (e.t === 'select') {
          P[key] = DEF[key] = e.def;
          el = document.createElement('button');
          el.className = 'el lcd';
          el.setAttribute('aria-label', e.label);
          el.addEventListener('click', () => setParam(key, (P[key] + 1) % e.opts.length));
          panel.insertAdjacentHTML('beforeend', `<span class="lbl" style="left:${e.x * 100}%;top:${((e.y - 34) / PH) * 100}%">${e.label}</span>`);
          el.dataset.opts = JSON.stringify(e.opts);
          KNOB[key] = el;
        } else if (e.t === 'screen') {
          el = document.createElement('div');
          el.className = 'el screen';
          el.style.width = (e.w * 100) + '%'; el.style.height = (e.h / PH * 100) + '%';
          el.innerHTML = '<canvas></canvas>';
          scopeCanvas = el.querySelector('canvas');
          el.style.left = (e.x * 100) + '%'; el.style.top = (e.y / PH * 100) + '%';
          panel.appendChild(el);
          continue;
        } else if (e.t === 'vu') {
          el = document.createElement('div');
          el.className = 'el vu';
          for (let i = 0; i < 12; i++) { const l = document.createElement('div'); l.className = `led ${i < 8 ? 'green' : i < 10 ? 'amber' : ''}`; el.appendChild(l); }
          vuLeds = Array.from(el.children);
        } else if (e.t === 'grille') {
          el = document.createElement('div');
          el.className = 'el';
          el.style.width = '62%'; el.style.height = '96px';
          el.style.background = 'radial-gradient(circle, rgba(0,0,0,.55) 0 2.4px, transparent 2.9px) 0 0 / 11px 11px';
          el.style.borderRadius = '6px';
        } else if (e.t === 'logo') {
          panel.insertAdjacentHTML('beforeend', '<div class="slots"></div><div class="logo-word">Модуляр</div><div class="serial">серия 5.5</div>');
          continue;
        }
        place(el, e);
        panel.appendChild(el);
      }
      mod.appendChild(panel);
      rack.insertBefore(mod, $('#cables'));
    }
    Object.keys(P).forEach(k => applyVisual(k));
  }

  // ———————————————————— Ручки и кнопки ————————————————————
  const ktip = $('#ktip');
  function showKtip(key, el, title) {
    const r = el.getBoundingClientRect();
    ktip.hidden = false;
    ktip.innerHTML = `<small>${title}</small>${FMT[key](P[key])}`;
    ktip.style.left = (r.left + r.width / 2) + 'px'; ktip.style.top = r.top + 'px';
  }
  function applyVisual(key) {
    const el = KNOB[key], v = P[key];
    if (!el) return;
    if (el.classList.contains('knob')) {
      el.style.setProperty('--r', `${-135 + v * 270}deg`);
      el.setAttribute('aria-valuenow', Math.round(v * 100));
      el.setAttribute('aria-valuetext', FMT[key](v));
    } else if (el.classList.contains('step-btn')) {
      el.classList.toggle('on', v > 0.5); el.setAttribute('aria-pressed', String(v > 0.5));
    } else if (el.classList.contains('lever')) {
      el.querySelector('i').style.setProperty('--a', `${(v - 1) * 32}deg`);
      $$('.opts span', el).forEach((s, i) => s.classList.toggle('on', i === v));
    } else if (el.classList.contains('lcd')) {
      el.textContent = JSON.parse(el.dataset.opts)[v];
    }
  }
  function setParam(key, v, quiet) {
    P[key] = v;
    applyVisual(key);
    if (!quiet) onParam(key);
  }
  function setStep(key, v) { setParam(key, v); }
  function bindKnob(el, key, title) {
    let drag = null;
    el.addEventListener('pointerdown', e => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      drag = { y: e.clientY, v: P[key] };
      el.focus({ preventScroll: true });
      showKtip(key, el, title);
    });
    el.addEventListener('pointermove', e => {
      if (!drag) return;
      const k = e.shiftKey ? 900 : 200;
      setParam(key, clamp(drag.v + (drag.y - e.clientY) / k, 0, 1));
      showKtip(key, el, title);
    });
    const end = () => { if (drag) { drag = null; ktip.hidden = true; } };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('wheel', e => { e.preventDefault(); setParam(key, clamp(P[key] - e.deltaY / 1400, 0, 1)); showKtip(key, el, title); clearTimeout(el._t); el._t = setTimeout(() => (ktip.hidden = true), 700); }, { passive: false });
    el.addEventListener('dblclick', () => { setParam(key, DEF[key]); showKtip(key, el, title); setTimeout(() => (ktip.hidden = true), 700); });
    el.addEventListener('keydown', e => {
      const d = e.shiftKey ? 0.05 : 0.01;
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { setParam(key, clamp(P[key] + d, 0, 1)); e.preventDefault(); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { setParam(key, clamp(P[key] - d, 0, 1)); e.preventDefault(); }
      else return;
      showKtip(key, el, title);
    });
    el.addEventListener('blur', () => (ktip.hidden = true));
  }
  function bindButton(el, key, e) {
    if (e.toggle) {
      el.dataset.key = key;
      el.classList.toggle('down', !!P[key]);
      el.addEventListener('click', () => { setParam(key, P[key] ? 0 : 1); el.classList.toggle('down', !!P[key]); });
    } else {
      const mod = key.split('.')[0];
      el.addEventListener('pointerdown', ev => { ev.preventDefault(); el.classList.add('down'); envOn(mod, CLK.now()); });
      const up = () => { if (el.classList.contains('down')) { el.classList.remove('down'); envOff(mod, CLK.now()); } };
      el.addEventListener('pointerup', up); el.addEventListener('pointerleave', up);
    }
  }

  // ———————————————————— Звук ————————————————————
  const AU = { ctx: null, on: false, m: {}, sink: null };
  const CLK = { now: () => (AU.on ? AU.ctx.currentTime : performance.now() / 1000) };
  function hold(param, t) {
    if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(t);
    else param.cancelScheduledValues(t);
  }
  function buildAudio() {
    const ctx = AU.ctx, M = AU.m;
    const now = () => ctx.currentTime;
    const smooth = (p, v, tc = 0.02) => p.setTargetAtTime(v, now(), tc);
    AU.sink = ctx.createGain(); AU.sink.gain.value = 0; AU.sink.connect(ctx.destination);

    const vco = id => {
      const oscs = ['sawtooth', 'square', 'sine'].map(type => { const o = ctx.createOscillator(); o.type = type; o.start(); return o; });
      const voct = ctx.createGain(); voct.gain.value = 1200;
      const fm = ctx.createGain();
      oscs.forEach(o => { voct.connect(o.detune); fm.connect(o.frequency); });
      const lv = [0.4, 0.28, 0.62].map((g, i) => { const n = ctx.createGain(); n.gain.value = g; oscs[i].connect(n); return n; });
      const upd = () => {
        oscs.forEach(o => { smooth(o.frequency, MAP.vcoFreq(P[id + '.freq']), 0.012); smooth(o.detune, MAP.fine(P[id + '.fine']), 0.012); });
        smooth(fm.gain, MAP.fm(P[id + '.fm']));
      };
      upd();
      return { outs: { saw: lv[0], sqr: lv[1], sin: lv[2] }, ins: { voct, fm }, upd };
    };
    M.vco1 = vco('vco1');
    M.vco2 = vco('vco2');

    {
      const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.start();
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.4;
      const g = ctx.createGain(); g.gain.value = 0.32;
      src.connect(lp); lp.connect(g);
      M.noise = { outs: { out: g }, ins: {}, upd: () => smooth(lp.frequency, MAP.noiseTone(P['noise.tone'])) };
      M.noise.upd();
    }
    {
      const sin = ctx.createOscillator(), sq = ctx.createOscillator();
      sin.type = 'sine'; sq.type = 'square';
      const gs = ctx.createGain(), gq = ctx.createGain();
      sin.connect(gs); sq.connect(gq);
      const f = MAP.lfoRate(P['lfo.rate']);
      sin.frequency.value = f; sq.frequency.value = f;
      const t0 = ctx.currentTime + 0.02;
      sin.start(t0); sq.start(t0);
      LFO.reset(t0);
      M.lfo = { outs: { sin: gs, sqr: gq }, ins: {}, upd: () => {
        const fr = MAP.lfoRate(P['lfo.rate']), t = now();
        sin.frequency.setValueAtTime(fr, t); sq.frequency.setValueAtTime(fr, t);
        smooth(gs.gain, P['lfo.depth']); smooth(gq.gain, P['lfo.depth']);
      } };
      M.lfo.upd();
    }
    {
      const mk = () => { const c = ctx.createConstantSource(); c.offset.value = 0; c.start(); return c; };
      M.seq = { outs: { cv: mk(), gate: mk(), clk: mk() }, ins: {}, upd() {} };
    }
    {
      const sum = ctx.createGain(), ins = {};
      [1, 2, 3].forEach(k => { const g = ctx.createGain(); g.connect(sum); ins['i' + k] = g; });
      M.mix = { outs: { out: sum }, ins, upd: () => [1, 2, 3].forEach(k => smooth(ins['i' + k].gain, Math.pow(P['mix.l' + k], 2) * 1.1)) };
      M.mix.upd();
    }
    {
      const a = ctx.createAnalyser(), b = ctx.createAnalyser();
      a.fftSize = 4096; b.fftSize = 1024;
      a.connect(AU.sink); b.connect(AU.sink);
      M.scope = { outs: {}, ins: { a, b }, an: [a, b], upd() {} };
    }
    {
      const inp = ctx.createGain(), f1 = ctx.createBiquadFilter(), f2 = ctx.createBiquadFilter(), out = ctx.createGain(), cv = ctx.createGain();
      inp.connect(f1); f1.connect(f2); f2.connect(out);
      cv.connect(f1.detune); cv.connect(f2.detune);
      M.vcf = { outs: { out }, ins: { in: inp, cv }, upd: () => {
        const ty = ['lowpass', 'bandpass', 'highpass'][P['vcf.mode'] | 0];
        if (f1.type !== ty) { f1.type = ty; f2.type = ty; }
        const fc = MAP.cutoff(P['vcf.cut']);
        smooth(f1.frequency, fc, 0.012); smooth(f2.frequency, fc, 0.012);
        smooth(f1.Q, ty === 'bandpass' ? 1 + P['vcf.res'] * 14 : MAP.res(P['vcf.res']));
        smooth(f2.Q, ty === 'bandpass' ? 0.9 : 0.707);
        smooth(cv.gain, P['vcf.depth'] * 4800);
        smooth(out.gain, ty === 'bandpass' ? 2.2 : 1);
      } };
      M.vcf.upd();
    }
    ['env1', 'env2'].forEach(id => {
      const src = ctx.createConstantSource(); src.offset.value = 0; src.start();
      M[id] = { outs: { out: src }, ins: { gate: { gate: true } }, upd() {},
        on(t) {
          const a = MAP.time(P[id + '.a']), d = MAP.time(P[id + '.d']), s = P[id + '.s'], p = src.offset;
          hold(p, t); p.linearRampToValueAtTime(1, t + a); p.setTargetAtTime(s, t + a, d / 3);
        },
        off(t) { const r = MAP.time(P[id + '.r']); hold(src.offset, t); src.offset.setTargetAtTime(0, t, r / 3); },
      };
    });
    {
      const g = ctx.createGain(), inp = ctx.createGain(), cv = ctx.createGain();
      g.gain.value = 0; inp.connect(g); cv.connect(g.gain);
      M.vca = { outs: { out: g }, ins: { in: inp, cv }, upd: () => { smooth(g.gain, Math.pow(P['vca.level'], 2)); smooth(cv.gain, P['vca.depth']); } };
      M.vca.upd();
    }
    {
      const inp = ctx.createGain(), out = ctx.createGain(), dry = ctx.createGain(), wet = ctx.createGain();
      const dl = ctx.createDelay(2), fb = ctx.createGain(), tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      inp.connect(dry); dry.connect(out); inp.connect(dl); dl.connect(tone); tone.connect(fb); fb.connect(dl); tone.connect(wet); wet.connect(out);
      M.echo = { outs: { out }, ins: { in: inp }, upd: () => {
        smooth(dl.delayTime, MAP.echoTime(P['echo.time']), 0.09);
        smooth(fb.gain, P['echo.fb'] * 0.9);
        smooth(tone.frequency, MAP.tone(P['echo.tone']));
        const m = P['echo.mix'];
        smooth(dry.gain, Math.cos(m * Math.PI / 2)); smooth(wet.gain, Math.sin(m * Math.PI / 2));
      } };
      M.echo.upd();
    }
    {
      const inp = ctx.createGain(), out = ctx.createGain(), dry = ctx.createGain(), wet = ctx.createGain(), conv = ctx.createConvolver();
      inp.connect(dry); dry.connect(out); inp.connect(conv); conv.connect(wet); wet.connect(out);
      let made = '', timer = 0;
      const makeIR = () => {
        const sec = MAP.size(P['rev.size']), br = P['rev.bright'];
        const len = Math.floor(ctx.sampleRate * sec), ir = ctx.createBuffer(2, len, ctx.sampleRate);
        const k = 0.08 + br * 0.85;
        for (let ch = 0; ch < 2; ch++) {
          const d = ir.getChannelData(ch);
          let lp = 0;
          for (let i = 0; i < len; i++) { lp += (Math.random() * 2 - 1 - lp) * k; d[i] = lp * Math.pow(1 - i / len, 2.4) * (i < 120 ? i / 120 : 1); }
        }
        conv.buffer = ir;
        made = `${P['rev.size']}|${P['rev.bright']}`;
      };
      makeIR();
      M.rev = { outs: { out }, ins: { in: inp }, upd: () => {
        const m = P['rev.mix'];
        smooth(dry.gain, Math.cos(m * Math.PI / 2)); smooth(wet.gain, Math.sin(m * Math.PI / 2) * 0.85);
        if (made !== `${P['rev.size']}|${P['rev.bright']}`) { clearTimeout(timer); timer = setTimeout(makeIR, 200); }
      } };
      M.rev.upd();
    }
    {
      const l = ctx.createGain(), r = ctx.createGain(), merger = ctx.createChannelMerger(2), master = ctx.createGain();
      l.connect(merger, 0, 0); r.connect(merger, 0, 1);
      master.gain.value = 0; merger.connect(master);
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -12; comp.knee.value = 10; comp.ratio.value = 8; comp.attack.value = 0.003; comp.release.value = 0.18;
      master.connect(comp); comp.connect(ctx.destination);
      const vu = ctx.createAnalyser(); vu.fftSize = 1024; comp.connect(vu);
      let normal = false;
      M.out = { outs: {}, ins: { l, r }, vu, upd: () => smooth(master.gain, AU.on ? Math.pow(P['out.vol'], 2) : 0, 0.04),
        renormal() {
          const rUsed = cables.some(c => c.to === 'out:r');
          if (!rUsed && !normal) { l.connect(merger, 0, 1); normal = true; }
          else if (rUsed && normal) { l.disconnect(merger, 0, 1); normal = false; }
        } };
      M.out.renormal();
    }
    cables.forEach(c => wire(c, true));
  }
  function onParam(key) {
    const mod = key.split('.')[0];
    if (key === 'lfo.rate') LFO.rerate(CLK.now());
    if (mod === 'seq' && key.startsWith('seq.s')) { /* высота шага применится на следующем такте */ }
    if (AU.ctx && AU.m[mod] && AU.m[mod].upd) AU.m[mod].upd();
    if (key === 'out.vol' && AU.ctx) AU.m.out.upd();
  }
  // соединение кабеля в звуковом графе; гейты — событийные и работают через планировщик
  function wire(c, on) {
    if (!AU.ctx || !c.to) return;
    const a = JACKS[c.from], b = JACKS[c.to];
    const src = AU.m[a.mod] && AU.m[a.mod].outs[a.id], dst = AU.m[b.mod] && AU.m[b.mod].ins[b.id];
    if (!src || !dst || dst.gate) return;
    try { if (on) src.connect(dst); else src.disconnect(dst); } catch (e) { /* уже отключено */ }
  }
  async function power() {
    if (!AU.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { toast('Этот браузер не умеет Web Audio — звука не будет.'); return; }
      AU.ctx = new AC({ latencyHint: 'interactive' });
      buildAudio();
    }
    if (!AU.on) {
      await AU.ctx.resume();
      AU.on = true;
      resyncClock();
      AU.m.out.upd();
      toast('Питание есть. Крутите ручки и переставляйте кабели.', 2600);
    } else {
      AU.on = false;
      AU.m.out.upd();
      resyncClock();
      setTimeout(() => { if (!AU.on) AU.ctx.suspend(); }, 250);
    }
    const b = $('#btn-power');
    b.setAttribute('aria-pressed', String(AU.on));
    b.title = AU.on ? 'Питание: выключить звук' : 'Питание: включить звук';
  }
  $('#btn-power').addEventListener('click', power);

  // ———————————————————— Планировщик: секвенсор, меандр НЧГ, огибающие ————————————————————
  const SEQ = { step: -1, next: 0 };
  // фаза НЧГ ведётся вручную: так меандр можно использовать как гейт с точными фронтами
  const LFO = {
    ph: 0, t: 0, until: 0, lastF: MAP.lfoRate(0.4),
    phase(t) { return this.ph + this.lastF * (t - this.t); },
    reset(t) { this.ph = 0; this.t = t; this.until = t; this.lastF = MAP.lfoRate(P['lfo.rate']); },
    rerate(t) { this.ph = this.phase(t); this.t = t; this.lastF = MAP.lfoRate(P['lfo.rate']); this.until = Math.max(this.until, t); },
  };
  const ENV = { env1: { tOn: null, tOff: null, offLvl: 0, q: [] }, env2: { tOn: null, tOff: null, offLvl: 0, q: [] } };
  const visQ = [];
  function envLevel(id, t) {
    const E = ENV[id];
    if (E.tOn == null) return 0;
    const a = MAP.time(P[id + '.a']), d = MAP.time(P[id + '.d']), s = P[id + '.s'], r = MAP.time(P[id + '.r']);
    const onLvl = tt => { const x = tt - E.tOn; if (x < a) return E.startLvl + (1 - E.startLvl) * (x / a); return s + (1 - s) * Math.exp(-(x - a) / (d / 3)); };
    if (E.tOff == null || t < E.tOff) return onLvl(Math.max(t, E.tOn));
    return E.offLvl * Math.exp(-(t - E.tOff) / (r / 3));
  }
  function envOn(id, t) {
    if (AU.on && AU.m[id]) AU.m[id].on(t);
    ENV[id].q.push({ t, on: true });
  }
  function envOff(id, t) {
    if (AU.on && AU.m[id]) AU.m[id].off(t);
    ENV[id].q.push({ t, on: false });
  }
  function processEnv(now) {
    for (const id in ENV) {
      const E = ENV[id];
      E.q.sort((x, y) => x.t - y.t);
      while (E.q.length && E.q[0].t <= now) {
        const ev = E.q.shift();
        if (ev.on) { E.startLvl = envLevel(id, ev.t); E.tOn = ev.t; E.tOff = null; }
        else { E.offLvl = envLevel(id, ev.t); E.tOff = ev.t; }
      }
    }
  }
  function fireGate(src, t, len) {
    for (const c of cables) {
      if (c.from !== src || !c.to) continue;
      const J = JACKS[c.to];
      if (J.gate && ENV[J.mod]) { envOn(J.mod, t); envOff(J.mod, t + len); }
    }
  }
  function stepVolts(i) {
    const sc = SCALES[P['seq.scale'] | 0];
    return stepSemis(P['seq.s' + i], sc) / 12;
  }
  function resyncClock() {
    const t = CLK.now();
    SEQ.next = t + 0.06;
    LFO.ph = 0; LFO.t = t; LFO.until = t; LFO.lastF = MAP.lfoRate(P['lfo.rate']);
    visQ.length = 0;
    for (const id in ENV) { ENV[id].q.length = 0; ENV[id].tOn = null; ENV[id].tOff = null; }
  }
  function schedule() {
    const now = CLK.now(), ahead = now + 0.12;
    if (SEQ.next < now - 0.25) SEQ.next = now + 0.03;
    while (P['seq.run'] && SEQ.next < ahead) {
      const t = SEQ.next, dur = 60 / MAP.bpm(P['seq.tempo']) / 2;
      const st = SEQ.step = (SEQ.step + 1) % 8;
      const on = P['seq.g' + st] > 0.5, len = dur * (0.08 + P['seq.len'] * 0.88), clk = Math.min(0.02, dur / 4);
      if (AU.on) {
        const o = AU.m.seq.outs;
        o.clk.offset.setValueAtTime(1, t); o.clk.offset.setValueAtTime(0, t + clk);
        if (on) { o.cv.offset.setValueAtTime(stepVolts(st), t); o.gate.offset.setValueAtTime(1, t); o.gate.offset.setValueAtTime(0, t + len); }
      }
      fireGate('seq:clk', t, clk);
      if (on) fireGate('seq:gate', t, len);
      visQ.push({ t, step: st, on });
      SEQ.next += dur;
    }
    // фронты меандра НЧГ — тоже гейт
    const f = LFO.lastF;
    if (LFO.until < now - 0.25) LFO.until = now;
    const p0 = LFO.phase(LFO.until), p1 = LFO.phase(ahead);
    for (let k = Math.ceil(p0); k <= Math.floor(p1); k++) {
      const t = LFO.t + (k - LFO.ph) / f;
      if (t > LFO.until && t <= ahead) fireGate('lfo:sqr', t, 0.5 / f);
    }
    LFO.until = ahead;
  }
  setInterval(schedule, 25);

  // ———————————————————— Кабели ————————————————————
  const COLORS = ['#E8433A', '#F2B233', '#3A8DDE', '#3FB57A', '#F07C2E', '#A77BE0', '#E9E6DF', '#2FBFC4'];
  const cables = [];
  const layer = $('#cable-layer'), svg = $('#cables');
  let colorIdx = 0, drag = null;
  const N = 18;
  function jackXY(key) { const J = JACKS[key]; return { x: J.x, y: J.y }; }
  function measureJacks() {
    const rr = rack.getBoundingClientRect();
    for (const k in JACKS) {
      const r = JACKS[k].el.getBoundingClientRect();
      JACKS[k].x = r.left + r.width / 2 - rr.left;
      JACKS[k].y = r.top + r.height / 2 - rr.top;
    }
    svg.setAttribute('width', rack.scrollWidth); svg.setAttribute('height', rack.scrollHeight);
  }
  function makeCable(from, to, color) {
    const c = { from, to, color: color || COLORS[colorIdx++ % COLORS.length], pts: [], free: null };
    const A = jackXY(from), B = to ? jackXY(to) : A;
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1), x = A.x + (B.x - A.x) * u, y = A.y + (B.y - A.y) * u;
      c.pts.push({ x, y, px: x, py: y - 2 });
    }
    const ns = 'http://www.w3.org/2000/svg';
    c.g = document.createElementNS(ns, 'g');
    c.shadow = document.createElementNS(ns, 'path'); c.shadow.setAttribute('class', 'cable-shade');
    c.shadow.setAttribute('transform', 'translate(3 7)');
    c.main = document.createElementNS(ns, 'path'); c.main.setAttribute('class', 'cable-main');
    c.main.setAttribute('stroke', c.color); c.main.setAttribute('stroke-width', '6');
    c.hi = document.createElementNS(ns, 'path'); c.hi.setAttribute('class', 'cable-hi'); c.hi.setAttribute('stroke-width', '1.6');
    c.plugA = document.createElementNS(ns, 'g'); c.plugB = document.createElementNS(ns, 'g');
    [c.plugA, c.plugB].forEach(p => {
      p.innerHTML = `<rect class="plug-body" x="-7" y="-6" width="14" height="22" rx="3.5" fill="${shade(c.color, -0.25)}"/><rect x="-7" y="1" width="14" height="4" fill="${shade(c.color, 0.15)}" opacity=".9"/><circle r="5.2" fill="#2A2B2F" stroke="#9EA2A8" stroke-width="1.4"/>`;
    });
    c.g.append(c.shadow, c.main, c.hi, c.plugA, c.plugB);
    layer.appendChild(c.g);
    cables.push(c);
    return c;
  }
  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const f = ch => clamp(Math.round(k > 0 ? ch + (255 - ch) * k : ch * (1 + k)), 0, 255);
    return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
  }
  function removeCable(c) {
    wire(c, false);
    c.g.remove();
    cables.splice(cables.indexOf(c), 1);
    if (AU.ctx) AU.m.out.renormal();
  }
  function simCable(c, pin) {
    const p = c.pts, A = jackXY(c.from), B = c.to ? jackXY(c.to) : c.free;
    const d = Math.hypot(B.x - A.x, B.y - A.y);
    const seg = Math.max(d * 1.12, d + 70) / (N - 1);
    for (let i = 1; i < N - 1; i++) {
      const q = p[i], vx = (q.x - q.px) * 0.955, vy = (q.y - q.py) * 0.955;
      q.px = q.x; q.py = q.y;
      q.x += vx; q.y += vy + 0.55;
    }
    p[0].x = A.x; p[0].y = A.y; p[N - 1].x = B.x; p[N - 1].y = B.y;
    for (let it = 0; it < 16; it++) {
      for (let i = 0; i < N - 1; i++) {
        const a = p[i], b = p[i + 1], dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1e-6, diff = (l - seg) / l;
        const aPin = i === 0, bPin = i + 1 === N - 1;
        if (aPin) { b.x -= dx * diff; b.y -= dy * diff; }
        else if (bPin) { a.x += dx * diff; a.y += dy * diff; }
        else { a.x += dx * diff * 0.5; a.y += dy * diff * 0.5; b.x -= dx * diff * 0.5; b.y -= dy * diff * 0.5; }
      }
    }
    p[0].x = A.x; p[0].y = A.y; p[N - 1].x = B.x; p[N - 1].y = B.y;
  }
  function drawCable(c) {
    const p = c.pts;
    let d = `M${p[0].x.toFixed(1)} ${p[0].y.toFixed(1)}`;
    for (let i = 1; i < N - 1; i++) {
      const mx = (p[i].x + p[i + 1].x) / 2, my = (p[i].y + p[i + 1].y) / 2;
      d += ` Q${p[i].x.toFixed(1)} ${p[i].y.toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
    }
    d += ` L${p[N - 1].x.toFixed(1)} ${p[N - 1].y.toFixed(1)}`;
    c.main.setAttribute('d', d);
    c.shadow.setAttribute('d', d);
    c.hi.setAttribute('d', d);
    c.hi.setAttribute('transform', 'translate(-1.2 -1.4)');
    const plug = (g, a, b) => {
      const ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI - 90;
      g.setAttribute('transform', `translate(${a.x.toFixed(1)} ${a.y.toFixed(1)}) rotate(${ang.toFixed(1)})`);
    };
    plug(c.plugA, p[0], p[2]);
    plug(c.plugB, p[N - 1], p[N - 3]);
  }
  function settle(c, n = 90) { for (let i = 0; i < n; i++) simCable(c); }

  // перетаскивание кабелей
  function jackAt(x, y) {
    const el = document.elementFromPoint(x, y);
    const j = el && el.closest('.jack');
    return j ? j.dataset.jack : null;
  }
  function canConnect(fixedKey, otherKey, cable) {
    if (!otherKey || otherKey === fixedKey) return false;
    const a = JACKS[fixedKey], b = JACKS[otherKey];
    if (a.dir === b.dir) return false;
    const inKey = a.dir === 'in' ? fixedKey : otherKey;
    return !cables.some(c => c !== cable && c.to === inKey);
  }
  rack.addEventListener('pointerdown', e => {
    const jel = e.target.closest('.jack');
    if (!jel) return;
    e.preventDefault();
    const key = jel.dataset.jack, J = JACKS[key];
    const rr = rack.getBoundingClientRect();
    const pos = { x: e.clientX - rr.left, y: e.clientY - rr.top };
    let c;
    if (J.dir === 'in' && cables.some(x => x.to === key)) {
      c = cables.find(x => x.to === key);         // вытаскиваем штекер из входа
      wire(c, false);
      c.to = null; c.free = pos;
      drag = { c, fixed: c.from, moving: 'to', preview: null };
    } else {
      c = makeCable(key, null);
      c.free = pos;
      drag = { c, fixed: key, moving: 'to', preview: null };
    }
    if (AU.ctx) AU.m.out.renormal();
    rack.setPointerCapture(e.pointerId);
    document.body.style.cursor = 'grabbing';
  });
  rack.addEventListener('pointermove', e => {
    if (!drag) return;
    const rr = rack.getBoundingClientRect();
    const k = jackAt(e.clientX, e.clientY);
    const c = drag.c;
    $$('.jack.target, .jack.bad').forEach(x => x.classList.remove('target', 'bad'));
    if (k && k !== drag.fixed) JACKS[k].el.classList.add(canConnect(drag.fixed, k, c) ? 'target' : 'bad');
    const ok = k && canConnect(drag.fixed, k, c);
    // примерка: пока кабель над подходящим входом, звук уже подключён
    if (ok && drag.preview !== k) {
      unpreview();
      drag.preview = k;
      const tmp = normalized(drag.fixed, k);
      drag.tmp = { from: tmp[0], to: tmp[1] };
      wire(drag.tmp, true);
    } else if (!ok && drag.preview) unpreview();
    c.free = ok ? jackXY(k) : { x: e.clientX - rr.left, y: e.clientY - rr.top };
  });
  function unpreview() { if (drag && drag.tmp) { wire(drag.tmp, false); drag.tmp = null; } if (drag) drag.preview = null; }
  function normalized(a, b) { return JACKS[a].dir === 'out' ? [a, b] : [b, a]; }
  function endDrag(e) {
    if (!drag) return;
    const c = drag.c, k = e ? jackAt(e.clientX, e.clientY) : null;
    unpreview();
    $$('.jack.target, .jack.bad').forEach(x => x.classList.remove('target', 'bad'));
    document.body.style.cursor = '';
    if (k && canConnect(drag.fixed, k, c)) {
      const [from, to] = normalized(drag.fixed, k);
      if (from !== c.from) { c.from = from; c.pts.reverse(); }
      c.to = to; c.free = null;
      wire(c, true);
      const J = JACKS[to];
      if (J.gate && !JACKS[from].gate) toast('Гейт огибающей понимает только импульсы: «Гейт» и «Такт» секвенсора или «Меандр» НЧГ.');
    } else removeCable(c);
    if (AU.ctx) AU.m.out.renormal();
    drag = null;
  }
  rack.addEventListener('pointerup', endDrag);
  rack.addEventListener('pointercancel', () => endDrag(null));
  rack.addEventListener('dblclick', e => {
    const jel = e.target.closest('.jack');
    if (!jel) return;
    const key = jel.dataset.jack;
    cables.filter(c => c.from === key || c.to === key).forEach(removeCable);
  });

  // ———————————————————— Готовые патчи ————————————————————
  const PATCHES = [
    { name: 'Капли', note: 'пентатоника, эхо и зал',
      params: { 'seq.tempo': 0.314, 'seq.len': 0.3, 'seq.scale': 0, 'vco1.freq': 0.3333, 'vco2.freq': 0.5, 'vco2.fine': 0.53, 'vco2.fm': 0.08,
        'mix.l1': 0.8, 'mix.l2': 0.45, 'mix.l3': 0, 'vcf.cut': 0.46, 'vcf.res': 0.35, 'vcf.depth': 0.45, 'vcf.mode': 0,
        'env1.a': 0.02, 'env1.d': 0.744, 'env1.s': 0, 'env1.r': 0.76, 'env2.a': 0.02, 'env2.d': 0.62, 'env2.s': 0.1, 'env2.r': 0.63,
        'vca.level': 0, 'vca.depth': 0.9, 'echo.time': 0.339, 'echo.fb': 0.45, 'echo.mix': 0.35, 'echo.tone': 0.5,
        'rev.size': 0.55, 'rev.bright': 0.5, 'rev.mix': 0.32, 'out.vol': 0.72, 'lfo.rate': 0.72, 'lfo.depth': 0.35 },
      steps: [0.0, 0.4, 0.7, 0.5, 0.9, 0.7, 0.3, 0.5], gates: [1, 1, 0, 1, 1, 0, 1, 1],
      cables: [['seq:cv', 'vco1:voct'], ['seq:cv', 'vco2:voct'], ['vco1:sin', 'mix:i1'], ['vco2:saw', 'mix:i2'], ['mix:out', 'vcf:in'],
        ['vcf:out', 'vca:in'], ['seq:gate', 'env1:gate'], ['env1:out', 'vca:cv'], ['seq:gate', 'env2:gate'], ['env2:out', 'vcf:cv'],
        ['lfo:sin', 'vco2:fm'], ['vca:out', 'echo:in'], ['echo:out', 'rev:in'], ['rev:out', 'out:l'], ['vca:out', 'scope:a'], ['env1:out', 'scope:b']] },
    { name: 'Кислота', note: 'резонансный бас',
      params: { 'seq.tempo': 0.471, 'seq.len': 0.55, 'seq.scale': 1, 'vco1.freq': 0.125, 'vcf.cut': 0.3, 'vcf.res': 0.78, 'vcf.depth': 0.75, 'vcf.mode': 0,
        'env1.a': 0.02, 'env1.d': 0.69, 'env1.s': 0.4, 'env1.r': 0.56, 'env2.a': 0.02, 'env2.d': 0.63, 'env2.s': 0, 'env2.r': 0.54,
        'vca.level': 0, 'vca.depth': 0.95, 'echo.time': 0.273, 'echo.fb': 0.35, 'echo.mix': 0.22, 'echo.tone': 0.35, 'out.vol': 0.62 },
      steps: [0.0, 0.0, 0.6, 0.15, 0.3, 0.0, 0.9, 0.45], gates: [1, 1, 1, 0, 1, 1, 1, 1],
      cables: [['seq:cv', 'vco1:voct'], ['vco1:saw', 'vcf:in'], ['vcf:out', 'vca:in'], ['seq:gate', 'env1:gate'], ['env1:out', 'vca:cv'],
        ['seq:gate', 'env2:gate'], ['env2:out', 'vcf:cv'], ['vca:out', 'echo:in'], ['echo:out', 'out:l'], ['vca:out', 'scope:a'], ['env2:out', 'scope:b']] },
    { name: 'Дрон', note: 'медленное дыхание фильтра',
      params: { 'seq.run': 0, 'vco1.freq': 0.125, 'vco2.freq': 0.222, 'vco2.fine': 0.52, 'noise.tone': 0.35, 'mix.l1': 0.7, 'mix.l2': 0.6, 'mix.l3': 0.25,
        'vcf.cut': 0.42, 'vcf.res': 0.5, 'vcf.depth': 0.5, 'vcf.mode': 0, 'lfo.rate': 0.075, 'lfo.depth': 0.8, 'vca.level': 0.85, 'vca.depth': 0,
        'rev.size': 0.95, 'rev.bright': 0.35, 'rev.mix': 0.6, 'out.vol': 0.66 },
      cables: [['vco1:saw', 'mix:i1'], ['vco2:saw', 'mix:i2'], ['noise:out', 'mix:i3'], ['mix:out', 'vcf:in'], ['lfo:sin', 'vcf:cv'],
        ['vcf:out', 'vca:in'], ['vca:out', 'rev:in'], ['rev:out', 'out:l'], ['vca:out', 'scope:a'], ['lfo:sin', 'scope:b']] },
    { name: 'Сирена', note: 'частотная модуляция',
      params: { 'seq.run': 0, 'vco1.freq': 0.45, 'vco1.fm': 0.35, 'vco2.freq': 0.62, 'lfo.rate': 0.287, 'lfo.depth': 0.9, 'vca.level': 0.72, 'vca.depth': 0,
        'echo.time': 0.4, 'echo.fb': 0.5, 'echo.mix': 0.4, 'rev.mix': 0.35, 'rev.size': 0.6, 'out.vol': 0.6 },
      cables: [['lfo:sin', 'vco1:voct'], ['vco2:sin', 'vco1:fm'], ['vco1:sin', 'vca:in'], ['vca:out', 'echo:in'], ['echo:out', 'rev:in'],
        ['rev:out', 'out:l'], ['vca:out', 'scope:a'], ['lfo:sin', 'scope:b']] },
    { name: 'Ветер', note: 'шум сквозь полосовой фильтр',
      params: { 'seq.run': 0, 'noise.tone': 0.9, 'vcf.mode': 1, 'vcf.cut': 0.5, 'vcf.res': 0.75, 'vcf.depth': 0.6, 'lfo.rate': 0.14, 'lfo.depth': 0.9,
        'vca.level': 0.9, 'vca.depth': 0, 'rev.size': 0.8, 'rev.mix': 0.5, 'out.vol': 0.7 },
      cables: [['noise:out', 'vcf:in'], ['lfo:sin', 'vcf:cv'], ['vcf:out', 'vca:in'], ['vca:out', 'rev:in'], ['rev:out', 'out:l'], ['vca:out', 'scope:a'], ['lfo:sin', 'scope:b']] },
  ];
  let currentPatch = -1, patchToken = 0;
  function loadPatch(i, first) {
    const pt = PATCHES[i], token = ++patchToken;   // отложенные кабели прошлого патча не должны попасть в новый
    currentPatch = i;
    $$('.patch').forEach((b, k) => b.setAttribute('aria-pressed', String(k === i)));
    [...cables].forEach(removeCable);
    colorIdx = 0;
    for (const k in DEF) setParam(k, DEF[k], true);
    for (let s = 0; s < 8; s++) { setParam('seq.s' + s, (pt.steps || [])[s] ?? 0.3, true); setParam('seq.g' + s, (pt.gates || [])[s] ?? 1, true); }
    for (const k in pt.params) setParam(k, pt.params[k], true);
    $$('.mbtn').forEach(b => { const key = b.dataset.key; if (key) b.classList.toggle('down', !!P[key]); });
    if (AU.ctx) Object.values(AU.m).forEach(m => m.upd && m.upd());
    LFO.rerate(CLK.now());
    measureJacks();
    pt.cables.forEach(([a, b], k) => {
      const make = () => {
        if (token !== patchToken) return;
        const c = makeCable(a, b); settle(c, first ? 140 : 0); wire(c, true); if (AU.ctx) AU.m.out.renormal();
      };
      if (first) make(); else setTimeout(make, k * 55);
    });
  }
  const pbar = $('#patches');
  PATCHES.forEach((p, i) => {
    const b = document.createElement('button');
    b.className = 'patch'; b.textContent = p.name; b.title = p.note;
    b.addEventListener('click', () => loadPatch(i));
    pbar.appendChild(b);
  });

  // ———————————————————— Осциллограф, индикаторы ————————————————————
  let scopeCanvas = null, vuLeds = [];
  const ROLL_RATE = 60;                  // отсчётов самописца в секунду — не зависит от частоты кадров
  const roll = new Float32Array(240);
  let rollI = 0, rollT = 0;
  function modelValue(key, t) {
    if (!key) return 0;
    const [m, id] = key.split(':');
    if (ENV[m] && id === 'out') return envLevel(m, t);
    if (m === 'lfo') { const ph = LFO.phase(t); return P['lfo.depth'] * (id === 'sin' ? Math.sin(ph * Math.PI * 2) : ((ph % 1) + 1) % 1 < 0.5 ? 1 : -1); }
    if (m === 'seq' && id === 'cv') return lastStepVolts;
    if (m === 'seq' && id === 'gate') return lastGate;
    return 0;
  }
  let lastStepVolts = 0, lastGate = 0, gateOffAt = 0;
  const buf = new Float32Array(4096);
  function drawScope(now) {
    const cv = scopeCanvas;
    if (!cv) return;
    const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const g = cv.getContext('2d');
    g.fillStyle = 'rgba(5, 16, 10, 0.42)';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(120, 255, 170, 0.08)'; g.lineWidth = 1;
    g.beginPath();
    for (let i = 1; i < 8; i++) { g.moveTo((w * i) / 8, 0); g.lineTo((w * i) / 8, h); }
    for (let i = 1; i < 6; i++) { g.moveTo(0, (h * i) / 6); g.lineTo(w, (h * i) / 6); }
    g.stroke();
    const gain = Math.pow(4, P['scope.gain'] * 2 - 1);
    // канал Б — самописец медленных сигналов
    const srcB = (cables.find(c => c.to === 'scope:b') || {}).from;
    if (!rollT || now - rollT > 2) rollT = now - 1 / ROLL_RATE;
    if (AU.on && srcB) {
      AU.m.scope.an[1].getFloatTimeDomainData(buf.subarray(0, 1024));
      let s = 0; for (let i = 0; i < 1024; i++) s += buf[i];
      const vB = s / 1024;
      while (rollT + 1 / ROLL_RATE <= now) { rollT += 1 / ROLL_RATE; roll[rollI = (rollI + 1) % roll.length] = vB; }
    } else {
      while (rollT + 1 / ROLL_RATE <= now) { rollT += 1 / ROLL_RATE; roll[rollI = (rollI + 1) % roll.length] = modelValue(srcB, rollT); }
    }
    g.lineWidth = 2 * dpr; g.strokeStyle = '#FFB547'; g.shadowColor = 'rgba(255, 181, 71, .8)'; g.shadowBlur = 8 * dpr;
    g.beginPath();
    for (let i = 0; i < roll.length; i++) {
      const v = roll[(rollI + 1 + i) % roll.length];
      const x = (i / (roll.length - 1)) * w, y = h * 0.5 - v * gain * h * 0.36;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.stroke();
    // канал А — звук со срабатыванием по нулю
    const srcA = cables.some(c => c.to === 'scope:a');
    g.strokeStyle = '#7CFFB0'; g.shadowColor = 'rgba(124, 255, 176, .85)';
    g.beginPath();
    if (AU.on && srcA) {
      const an = AU.m.scope.an[0];
      an.getFloatTimeDomainData(buf);
      const n = Math.round(128 * Math.pow(2, P['scope.time'] * 4));
      let s0 = 0;
      for (let i = 1; i < buf.length - n; i++) if (buf[i - 1] < 0 && buf[i] >= 0) { s0 = i; break; }
      for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * w, y = h * 0.5 - buf[s0 + i] * gain * h * 0.42; i ? g.lineTo(x, y) : g.moveTo(x, y); }
    } else {
      for (let i = 0; i <= 60; i++) { const x = (i / 60) * w, y = h * 0.5 + Math.sin(i * 1.7 + now * 9) * 0.6 * dpr; i ? g.lineTo(x, y) : g.moveTo(x, y); }
    }
    g.stroke();
    g.shadowBlur = 0;
  }
  function drawVU() {
    let rms = 0;
    if (AU.on) {
      const an = AU.m.out.vu;
      an.getFloatTimeDomainData(buf.subarray(0, 1024));
      for (let i = 0; i < 1024; i++) rms += buf[i] * buf[i];
      rms = Math.sqrt(rms / 1024);
    }
    const db = 20 * Math.log10(rms + 1e-6), lvl = clamp((db + 42) / 42, 0, 1) * 12;
    vuLeds.forEach((l, i) => l.style.setProperty('--b', i < lvl ? (i + 1 <= lvl ? 1 : lvl - i) : 0));
  }

  // ———————————————————— Главный цикл ————————————————————
  let seqShown = -1;
  function frame() {
    requestAnimationFrame(frame);
    if (document.hidden) return;
    const now = CLK.now();
    visQ.sort((a, b) => a.t - b.t);
    while (visQ.length && visQ[0].t <= now) {
      const ev = visQ.shift();
      seqShown = ev.step;
      if (ev.on) { lastStepVolts = stepVolts(ev.step); lastGate = 1; gateOffAt = ev.t + (60 / MAP.bpm(P['seq.tempo']) / 2) * (0.08 + P['seq.len'] * 0.88); }
    }
    if (now > gateOffAt) lastGate = 0;
    for (let i = 0; i < 8; i++) LEDS['seq.l' + i].style.setProperty('--b', i === seqShown && P['seq.run'] ? 1 : P['seq.g' + i] > 0.5 ? 0.12 : 0);
    LEDS['seq.runled'].style.setProperty('--b', P['seq.run'] ? 0.9 : 0);
    processEnv(now);
    LEDS['env1.led'].style.setProperty('--b', envLevel('env1', now).toFixed(3));
    LEDS['env2.led'].style.setProperty('--b', envLevel('env2', now).toFixed(3));
    const ph = LFO.phase(now);
    LEDS['lfo.led'].style.setProperty('--b', (0.5 + 0.5 * Math.sin(ph * Math.PI * 2)).toFixed(3));
    LEDS['out.power'].style.setProperty('--b', AU.on ? 1 : 0);
    drawScope(now);
    drawVU();
    for (const c of cables) { simCable(c); drawCable(c); }
  }

  // ———————————————————— Помощь и старт ————————————————————
  const help = $('#help'), helpBtn = $('#btn-help');
  helpBtn.addEventListener('click', e => { e.stopPropagation(); help.hidden = !help.hidden; helpBtn.setAttribute('aria-expanded', String(!help.hidden)); });
  document.addEventListener('click', e => { if (!help.hidden && !e.target.closest('.help')) { help.hidden = true; helpBtn.setAttribute('aria-expanded', 'false'); } });
  window.addEventListener('keydown', e => { if (e.key === 'Escape') help.hidden = true; });

  function layout() {
    const wrap = $('.rack-wrap'), cs = getComputedStyle(wrap);
    const W = wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    let hp = (W - 2) / 56;
    if (hp < 17) hp = (W - 2) / 16;
    hp = Math.floor(hp * 100) / 100;
    document.documentElement.style.setProperty('--hp', hp + 'px');
    requestAnimationFrame(() => { measureJacks(); cables.forEach(c => settle(c, 30)); });
  }
  buildRack();
  layout();
  measureJacks();
  loadPatch(0, true);
  window.addEventListener('resize', layout);
  if (document.fonts) document.fonts.ready.then(() => { measureJacks(); });
  new ResizeObserver(() => measureJacks()).observe(rack);
  resyncClock();
  requestAnimationFrame(frame);
  setTimeout(() => toast('Звук выключен. Нажмите «Питание» — патч «Капли» уже собран.', 5200), 700);
})();
