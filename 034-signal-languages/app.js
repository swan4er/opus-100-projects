/* Язык сигналов: одно сообщение — пять кодов.
   Общие часы — азбука Морзе (точка = 1 единица, тире = 3, пауза внутри знака = 1, между знаками = 3,
   между словами = 7; длина единицы = 1200 / (слов в минуту) мс). Семафор, флаги и лента переключаются
   на границах знаков: русская буква передаётся латиницей, её латинские буквы делят время знака поровну. */
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const NS = 'http://www.w3.org/2000/svg';

  // ---------- Азбука Морзе ----------
  const MORSE_RU = {
    'а': '.-', 'б': '-...', 'в': '.--', 'г': '--.', 'д': '-..', 'е': '.', 'ё': '.', 'ж': '...-', 'з': '--..',
    'и': '..', 'й': '.---', 'к': '-.-', 'л': '.-..', 'м': '--', 'н': '-.', 'о': '---', 'п': '.--.', 'р': '.-.',
    'с': '...', 'т': '-', 'у': '..-', 'ф': '..-.', 'х': '....', 'ц': '-.-.', 'ч': '---.', 'ш': '----', 'щ': '--.-',
    'ъ': '-..-', 'ы': '-.--', 'ь': '-..-', 'э': '..-..', 'ю': '..--', 'я': '.-.-',
  };
  const MORSE_LAT = {
    a: '.-', b: '-...', c: '-.-.', d: '-..', e: '.', f: '..-.', g: '--.', h: '....', i: '..', j: '.---', k: '-.-', l: '.-..', m: '--',
    n: '-.', o: '---', p: '.--.', q: '--.-', r: '.-.', s: '...', t: '-', u: '..-', v: '...-', w: '.--', x: '-..-', y: '-.--', z: '--..',
  };
  const MORSE_NUM = { '1': '.----', '2': '..---', '3': '...--', '4': '....-', '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.', '0': '-----' };
  const MORSE_PUNCT = { '.': '.-.-.-', ',': '--..--', '?': '..--..', '!': '-.-.--', '-': '-....-' };

  // ---------- Брайль (шеститочечный) ----------
  const BRAILLE = {};
  const brSet = (s) => { for (let i = 0; i < s.length; i += 2) BRAILLE[s[i]] = s[i + 1]; };
  brSet('а⠁б⠃в⠺г⠛д⠙е⠑ё⠡ж⠚з⠵и⠊й⠯к⠅л⠇м⠍н⠝о⠕п⠏р⠗с⠎т⠞у⠥ф⠋х⠓ц⠉ч⠟ш⠱щ⠭ъ⠷ы⠮ь⠾э⠪ю⠳я⠫');
  brSet('a⠁b⠃c⠉d⠙e⠑f⠋g⠛h⠓i⠊j⠚k⠅l⠇m⠍n⠝o⠕p⠏q⠟r⠗s⠎t⠞u⠥v⠧w⠺x⠭y⠽z⠵');
  brSet('.⠲,⠂?⠢!⠖-⠤');
  const BR_DIGIT = { '1': '⠁', '2': '⠃', '3': '⠉', '4': '⠙', '5': '⠑', '6': '⠋', '7': '⠛', '8': '⠓', '9': '⠊', '0': '⠚' };
  const BR_NUMSIGN = '⠼';
  const dotsOf = (ch) => ch.codePointAt(0) - 0x2800;   // бит 0 — точка 1, … бит 5 — точка 6

  // ---------- Транслитерация для семафора, флагов и ленты ----------
  const TR = {
    'а': 'A', 'б': 'B', 'в': 'V', 'г': 'G', 'д': 'D', 'е': 'E', 'ё': 'E', 'ж': 'ZH', 'з': 'Z', 'и': 'I', 'й': 'Y', 'к': 'K',
    'л': 'L', 'м': 'M', 'н': 'N', 'о': 'O', 'п': 'P', 'р': 'R', 'с': 'S', 'т': 'T', 'у': 'U', 'ф': 'F', 'х': 'KH', 'ц': 'TS',
    'ч': 'CH', 'ш': 'SH', 'щ': 'SHCH', 'ъ': '', 'ы': 'Y', 'ь': '', 'э': 'E', 'ю': 'YU', 'я': 'YA',
  };

  // ---------- Флажный семафор: положения флажков по циферблату (как видит наблюдатель) ----------
  const SEM = {
    A: [6, 7.5], B: [6, 9], C: [6, 10.5], D: [6, 12], E: [6, 1.5], F: [6, 3], G: [6, 4.5],
    H: [7.5, 9], I: [7.5, 10.5], K: [7.5, 12], L: [7.5, 1.5], M: [7.5, 3], N: [7.5, 4.5],
    O: [9, 10.5], P: [9, 12], Q: [9, 1.5], R: [9, 3], S: [9, 4.5],
    T: [10.5, 12], U: [10.5, 1.5], Y: [10.5, 3],
    J: [12, 3], V: [12, 4.5], W: [1.5, 3], X: [1.5, 4.5], Z: [3, 4.5],
    '#': [12, 1.5], REST: [6, 6],
  };
  const SEM_DIGIT = { '1': 'A', '2': 'B', '3': 'C', '4': 'D', '5': 'E', '6': 'F', '7': 'G', '8': 'H', '9': 'I', '0': 'K' };
  const sideOf = (p) => (p > 6 && p < 12 ? 'L' : p > 0 && p < 6 ? 'R' : 'C');
  // Какой рукой какое положение: «left» — рука у левого для зрителя плеча (правая рука сигнальщика)
  function armsFor(pair) {
    const [a, b] = pair;
    const sa = sideOf(a), sb = sideOf(b);
    if (sa === 'L' && sb === 'R') return { left: a, right: b };
    if (sa === 'R' && sb === 'L') return { left: b, right: a };
    if (sa === 'C' && sb === 'C') return a === b ? { left: 6, right: 6 } : { left: 6, right: 12 };
    if (sa === 'C') return sb === 'L' ? { left: b, right: a } : { left: a, right: b };
    if (sb === 'C') return sa === 'L' ? { left: a, right: b } : { left: b, right: a };
    // обе позиции с одной стороны: верхнюю держит «своя» рука, нижнюю — рука, перекинутая через корпус
    if (sa === 'L') return { left: Math.max(a, b), right: Math.min(a, b) };
    return { left: Math.max(a, b), right: Math.min(a, b) };
  }
  const clockDeg = (h) => h * 30;   // от 12 часов по часовой стрелке

  // ---------- Флаги Международного свода сигналов (геометрия сверена с эталонными SVG) ----------
  const C = { red: '#d9262e', yellow: '#f7c51e', blue: '#1d4fb8', white: '#f7f5ef', black: '#141414' };
  function clipPoly(poly, a, b, c, keepLess) {
    const out = [];
    const f = (p) => a * p[0] + b * p[1] - c;
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      const fp = keepLess ? -f(p) : f(p), fq = keepLess ? -f(q) : f(q);
      if (fp >= 0) out.push(p);
      if ((fp >= 0) !== (fq >= 0)) {
        const t = fp / (fp - fq);
        out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      }
    }
    return out;
  }
  const pts = (arr) => arr.map((p) => p.map((v) => +v.toFixed(2)).join(',')).join(' ');
  // диагональная полоса (для косых крестов), обрезанная по краям флага
  function band(w, h, x1, y1, x2, y2, hw) {
    const dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy);
    const nx = -dy / l * hw, ny = dx / l * hw;
    let p = [[x1 + nx, y1 + ny], [x2 + nx, y2 + ny], [x2 - nx, y2 - ny], [x1 - nx, y1 - ny]];
    p = clipPoly(p, 1, 0, 0, false); p = clipPoly(p, 1, 0, w, true);
    p = clipPoly(p, 0, 1, 0, false); p = clipPoly(p, 0, 1, h, true);
    return p;
  }
  function flagSVG(letter, w = 30, h = 24) {
    const r = (x, y, ww, hh, fill) => `<rect x="${x}" y="${y}" width="${ww}" height="${hh}" fill="${fill}"/>`;
    const poly = (p, fill) => `<polygon points="${pts(p)}" fill="${fill}"/>`;
    let s = '';
    const W2 = w / 2, H2 = h / 2;
    switch (letter) {
      case 'A': s = r(0, 0, W2, h, C.white) + poly([[W2, 0], [w, 0], [w * 0.74, H2], [w, h], [W2, h]], C.blue); break;
      case 'B': s = poly([[0, 0], [w, 0], [w * 0.74, H2], [w, h], [0, h]], C.red); break;
      case 'C': s = r(0, 0, w, h, C.blue) + r(0, h / 5, w, h * 3 / 5, C.white) + r(0, h * 2 / 5, w, h / 5, C.red); break;
      case 'D': s = r(0, 0, w, h, C.yellow) + r(0, h * 0.2, w, h * 0.6, C.blue); break;
      case 'E': s = r(0, 0, w, H2, C.blue) + r(0, H2, w, H2, C.red); break;
      case 'F': s = r(0, 0, w, h, C.white) + poly([[W2, 0], [w, H2], [W2, h], [0, H2]], C.red); break;
      case 'G': s = r(0, 0, w, h, C.yellow); for (let i = 1; i < 6; i += 2) s += r(w * i / 6, 0, w / 6, h, C.blue); break;
      case 'H': s = r(0, 0, W2, h, C.white) + r(W2, 0, W2, h, C.red); break;
      case 'I': s = r(0, 0, w, h, C.yellow) + `<circle cx="${W2}" cy="${H2}" r="${h * 0.26}" fill="${C.black}"/>`; break;
      case 'J': s = r(0, 0, w, h, C.blue) + r(0, h / 3, w, h / 3, C.white); break;
      case 'K': s = r(0, 0, W2, h, C.yellow) + r(W2, 0, W2, h, C.blue); break;
      case 'L': s = r(0, 0, w, h, C.yellow) + r(W2, 0, W2, H2, C.black) + r(0, H2, W2, H2, C.black); break;
      case 'M': s = r(0, 0, w, h, C.blue) + poly(band(w, h, 0, 0, w, h, h * 0.1), C.white) + poly(band(w, h, w, 0, 0, h, h * 0.1), C.white); break;
      case 'N': s = r(0, 0, w, h, C.white); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2 === 0) s += r(w * i / 4, h * j / 4, w / 4, h / 4, C.blue); break;
      case 'O': s = r(0, 0, w, h, C.red) + poly([[0, 0], [0, h], [w, h]], C.yellow); break;
      case 'P': s = r(0, 0, w, h, C.blue) + r(w / 3, h / 3, w / 3, h / 3, C.white); break;
      case 'Q': s = r(0, 0, w, h, C.yellow); break;
      case 'R': s = r(0, 0, w, h, C.red) + r(w * 0.4, 0, w * 0.2, h, C.yellow) + r(0, h * 0.4, w, h * 0.2, C.yellow); break;
      case 'S': s = r(0, 0, w, h, C.white) + r(w / 3, h / 3, w / 3, h / 3, C.blue); break;
      case 'T': s = r(0, 0, w / 3, h, C.red) + r(w / 3, 0, w / 3, h, C.white) + r(w * 2 / 3, 0, w / 3, h, C.blue); break;
      case 'U': s = r(0, 0, w, h, C.red) + r(W2, 0, W2, H2, C.white) + r(0, H2, W2, H2, C.white); break;
      case 'V': s = r(0, 0, w, h, C.white) + poly(band(w, h, 0, 0, w, h, h * 0.1), C.red) + poly(band(w, h, w, 0, 0, h, h * 0.1), C.red); break;
      case 'W': s = r(0, 0, w, h, C.blue) + r(w * 0.2, h * 0.2, w * 0.6, h * 0.6, C.white) + r(w * 0.4, h * 0.4, w * 0.2, h * 0.2, C.red); break;
      case 'X': s = r(0, 0, w, h, C.white) + r(w * 0.4, 0, w * 0.2, h, C.blue) + r(0, h * 0.4, w, h * 0.2, C.blue); break;
      case 'Y': {
        // десять диагональных полос «/», у верхнего угла древка — жёлтая
        s = r(0, 0, w, h, C.red);
        const rect = [[0, 0], [w, 0], [w, h], [0, h]];
        for (let k = 0; k < 10; k += 2) {
          let p = clipPoly(rect, 1 / w, 1 / h, (2 * k) / 10, false);
          p = clipPoly(p, 1 / w, 1 / h, (2 * (k + 1)) / 10, true);
          if (p.length > 2) s += poly(p, C.yellow);
        }
        break;
      }
      case 'Z': s = r(0, 0, w, h, C.yellow) + poly([[0, 0], [W2, H2], [0, h]], C.black) + poly([[0, h], [W2, H2], [w, h]], C.red) + poly([[w, h], [W2, H2], [w, 0]], C.blue); break;
      default: return '';
    }
    const swallow = letter === 'A' || letter === 'B';
    const outline = swallow
      ? `<polygon points="${pts([[0, 0], [w, 0], [w * 0.74, H2], [w, h], [0, h]])}" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="0.6"/>`
      : `<rect x="0.3" y="0.3" width="${w - 0.6}" height="${h - 0.6}" fill="none" stroke="rgba(0,0,0,.3)" stroke-width="0.6"/>`;
    return s + outline;
  }

  // ---------- Код ITA2 (Бодо — Мюррей) ----------
  const ITA2 = {
    A: '11000', B: '10011', C: '01110', D: '10010', E: '10000', F: '10110', G: '01011', H: '00101', I: '01100', J: '11010',
    K: '11110', L: '01001', M: '00111', N: '00110', O: '00011', P: '01101', Q: '11101', R: '01010', S: '10100', T: '00001',
    U: '11100', V: '01111', W: '11001', X: '10111', Y: '10101', Z: '10001', ' ': '00100',
  };
  const ITA2_FIGS = { '1': 'Q', '2': 'W', '3': 'E', '4': 'R', '5': 'T', '6': 'Y', '7': 'U', '8': 'I', '9': 'O', '0': 'P', '-': 'A', '?': 'B', '.': 'M', ',': 'N' };
  const LTRS = '11111', FIGS = '11011';

  // ---------- Сообщение → расписание ----------
  let msg = null;
  function build(text) {
    const chars = [];
    let prevSpace = true;
    let prevDigit = false;
    for (const raw of text) {
      const low = raw.toLowerCase();
      if (/\s/.test(raw)) {
        if (!prevSpace) chars.push({ raw: ' ', low: ' ', space: true, lat: ' ' });
        prevSpace = true;
        prevDigit = false;
        continue;
      }
      const morse = MORSE_RU[low] || MORSE_LAT[low] || MORSE_NUM[low] || MORSE_PUNCT[low];
      if (!morse) continue;
      let lat;
      if (TR[low] !== undefined) lat = TR[low];
      else if (/[a-z]/.test(low)) lat = low.toUpperCase();
      else lat = low;
      let br;
      // знак цифры ⠼ ставится один раз перед всем числом
      if (BR_DIGIT[low]) br = prevDigit ? [BR_DIGIT[low]] : [BR_NUMSIGN, BR_DIGIT[low]];
      else br = BRAILLE[low] ? [BRAILLE[low]] : [];
      prevDigit = !!BR_DIGIT[low];
      chars.push({ raw, low, morse, lat, br });
      prevSpace = false;
    }
    while (chars.length && chars[chars.length - 1].space) chars.pop();

    let t = 0;
    for (const c of chars) {
      c.start = t;
      c.els = [];
      if (c.space) t += 4;
      else {
        [...c.morse].forEach((sym, k) => {
          const d = sym === '.' ? 1 : 3;
          c.els.push({ start: t, dur: d, dash: d === 3 });
          t += d;
          if (k < c.morse.length - 1) t += 1;
        });
        t += 3;
      }
      c.end = t;
    }
    // латиница целиком (для семафора, флагов и ленты)
    const latText = chars.map((c) => c.lat).join('');
    // слова для флажного подъёма
    let word = 0;
    chars.forEach((c) => { if (c.space) word++; c.word = word; });
    // после сообщения — пауза и ответ судна «·−·» (R — «принял»)
    msg = { chars, end: t, total: t + 20, latText };
    buildStrips();
  }

  // ---------- Состояние ----------
  let wpm = 10;
  let playing = true;
  let clock = 0;           // единиц Морзе
  let cur = { ci: 0, sub: 0, on: false, el: -1 };

  function unitMs() { return 1200 / wpm; }
  function locate(t) {
    const ch = msg.chars;
    let ci = 0;
    for (let i = 0; i < ch.length; i++) { if (ch[i].start <= t) ci = i; else break; }
    const c = ch[ci];
    let on = false, el = -1;
    if (c && !c.space) c.els.forEach((e, k) => { if (t >= e.start && t < e.start + e.dur) { on = true; el = k; } });
    const n = Math.max(1, c && c.lat ? c.lat.length : 1);
    const frac = c ? Math.min(0.9999, Math.max(0, (t - c.start) / Math.max(1e-6, c.end - c.start))) : 0;
    return { ci, sub: Math.floor(frac * n), on, el, done: t >= (ch.length ? ch[ch.length - 1].end : 0) };
  }

  // ---------- Сцена ----------
  const svg = $('#scene');
  function sceneMarkup() {
    let stars = '';
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 90; i++) {
      const x = rnd() * 1200, y = rnd() * 250;
      const r = rnd() < 0.12 ? 1.4 : 0.7 + rnd() * 0.5;
      stars += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" fill="#dfe8ff" opacity="${(0.25 + rnd() * 0.6).toFixed(2)}" class="tw" style="animation-delay:${(-rnd() * 6).toFixed(2)}s"/>`;
    }
    let waves = '';
    for (let i = 0; i < 12; i++) {
      const y = 312 + i * i * 1.25 + i * 6;
      const op = (0.05 + i * 0.012).toFixed(3);
      waves += `<path class="wave" d="M-60 ${y} q 30 -3 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0" fill="none" stroke="#9fc0e6" stroke-opacity="${op}" stroke-width="${(0.8 + i * 0.12).toFixed(2)}" style="animation-duration:${(9 - i * 0.4).toFixed(1)}s"/>`;
    }
    let rail = '';
    for (let x = -10; x <= 1210; x += 64) rail += `<rect x="${x}" y="426" width="5" height="46" fill="#26364f"/>`;
    return `
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#040b18"/>
        <stop offset=".4" stop-color="#0b1d3a"/>
        <stop offset=".54" stop-color="#23406b"/>
        <stop offset=".575" stop-color="#b9774a"/>
        <stop offset=".583" stop-color="#16304f"/>
        <stop offset="1" stop-color="#050e1c"/>
      </linearGradient>
      <radialGradient id="dusk" cx=".5" cy=".5" r=".5">
        <stop offset="0" stop-color="#ff9a55" stop-opacity=".55"/>
        <stop offset="1" stop-color="#ff9a55" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="beamGrad" x1="1" y1="0" x2="0" y2="0">
        <stop offset="0" stop-color="#fff4cf" stop-opacity=".85"/>
        <stop offset=".35" stop-color="#ffe7a8" stop-opacity=".3"/>
        <stop offset="1" stop-color="#ffe7a8" stop-opacity="0"/>
      </linearGradient>
      <radialGradient id="lensGlow" cx=".5" cy=".5" r=".5">
        <stop offset="0" stop-color="#fffbe8"/>
        <stop offset=".3" stop-color="#ffe29a" stop-opacity=".8"/>
        <stop offset="1" stop-color="#ffd76a" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="reflGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffe7a8" stop-opacity=".45"/>
        <stop offset="1" stop-color="#ffe7a8" stop-opacity="0"/>
      </linearGradient>
      <clipPath id="vneck"><path d="M592 348 L600 366 L608 348 Z"/></clipPath>
    </defs>
    <rect width="1200" height="520" fill="url(#sky)"/>
    <g>${stars}</g>
    <ellipse cx="250" cy="300" rx="460" ry="46" fill="url(#dusk)"/>
    <g class="sea">${waves}</g>
    <g id="ship" fill="#0a1628">
      <path d="M150 300 L166 290 L300 290 L312 300 Z"/>
      <rect x="196" y="274" width="44" height="16"/>
      <rect x="214" y="256" width="3" height="18"/>
      <rect x="262" y="266" width="2" height="24"/>
      <circle id="ship-glow" cx="215.5" cy="254" r="26" fill="url(#lensGlow)" opacity="0"/>
      <circle id="ship-light" cx="215.5" cy="254" r="2.4" fill="#ffd27a"/>
      <circle cx="300" cy="292" r="1.6" fill="#5dff8a" opacity=".85"/>
    </g>
    <g id="beam" opacity="0">
      <polygon points="352,386 -20,286 -20,470 352,402" fill="url(#beamGrad)"/>
      <polygon points="330,408 120,408 40,470 360,470" fill="url(#reflGrad)" opacity=".5"/>
      <circle cx="350" cy="394" r="42" fill="url(#lensGlow)"/>
    </g>
    <g id="mast">
      <rect x="811" y="130" width="7" height="340" fill="#7f94ad"/>
      <rect x="766" y="186" width="100" height="5" rx="2" fill="#7f94ad"/>
      <circle cx="814.5" cy="128" r="6" fill="#9fb3c8"/>
      <line x1="858" y1="191" x2="858" y2="452" stroke="#c9d3de" stroke-width="1.2" stroke-opacity=".8"/>
      <g id="hoist"></g>
      <path id="hoist-mark" d="M844 0 l8 5 l-8 5 z" fill="#f6c445" opacity="0"/>
    </g>
    <g id="lamp">
      <rect x="372" y="408" width="8" height="62" fill="#2b3a52"/>
      <path d="M360 418 h32" stroke="#2b3a52" stroke-width="6" stroke-linecap="round"/>
      <rect x="352" y="380" width="58" height="28" rx="6" fill="#3d4f6b"/>
      <rect x="402" y="384" width="12" height="20" rx="3" fill="#2d3c55"/>
      <rect x="364" y="374" width="30" height="7" rx="3" fill="#56688a"/>
      <ellipse cx="352" cy="394" rx="6" ry="14" fill="#1a2436"/>
      <ellipse id="lens" cx="351" cy="394" rx="4.5" ry="11.5" fill="#3a4658"/>
    </g>
    <g id="deck">
      <rect x="-10" y="468" width="1220" height="60" fill="#050c18"/>
      <rect x="-10" y="424" width="1220" height="5" rx="2" fill="#31435f"/>
      <rect x="-10" y="446" width="1220" height="3" fill="#26364f"/>
      ${rail}
    </g>
    <g id="sailor">
      <g id="ribbons" fill="#0b1426"><path id="rib1" d="M612 316 q12 8 20 22 l-4 2 q-8 -12 -18 -20z"/><path id="rib2" d="M612 318 q10 10 14 26 l-4 1 q-4 -14 -12 -24z"/></g>
      <path d="M585 394 L598 394 L596 466 L577 466 Z" fill="#14223d"/>
      <path d="M602 394 L615 394 L623 466 L604 466 Z" fill="#14223d"/>
      <ellipse cx="586" cy="467" rx="11" ry="4" fill="#05080f"/>
      <ellipse cx="614" cy="467" rx="11" ry="4" fill="#05080f"/>
      <path d="M580 348 Q600 342 620 348 L617 398 Q600 402 583 398 Z" fill="#1d3257"/>
      <g clip-path="url(#vneck)">
        <rect x="590" y="346" width="20" height="22" fill="#f4f1ea"/>
        <rect x="590" y="350" width="20" height="2.4" fill="#1b3a78"/>
        <rect x="590" y="355" width="20" height="2.4" fill="#1b3a78"/>
        <rect x="590" y="360" width="20" height="2.4" fill="#1b3a78"/>
      </g>
      <path d="M580 348 L592 348 L600 366 L608 348 L620 348 L622 356 L609 356 L600 374 L591 356 L578 356 Z" fill="#2c57a6"/>
      <path d="M581.5 351 L592.6 351 M607.4 351 L618.5 351" stroke="#f4f1ea" stroke-width=".9"/>
      <rect x="585" y="392" width="30" height="5" fill="#0c1426"/>
      <rect x="596" y="334" width="8" height="10" fill="#e3bb95"/>
      <circle cx="600" cy="324" r="12.5" fill="#e9c4a0"/>
      <ellipse cx="600" cy="312" rx="17" ry="5" fill="#0d1729"/>
      <rect x="587" y="311" width="26" height="6" rx="2" fill="#0b1426"/>
      <rect x="590" y="313" width="20" height="1.4" fill="#caa65b" opacity=".85"/>
      <g id="armL"></g>
      <g id="armR"></g>
    </g>`;
  }
  function armMarkup(mirror) {
    const s = mirror ? -1 : 1;
    return `
      <rect x="-6" y="-2" width="12" height="54" rx="6" fill="#1d3257"/>
      <rect x="-6" y="40" width="12" height="6" fill="#f4f1ea" opacity=".9"/>
      <circle cx="0" cy="56" r="5.4" fill="#e9c4a0"/>
      <line x1="0" y1="52" x2="0" y2="96" stroke="#e8e1d2" stroke-width="2.2" stroke-linecap="round"/>
      <g class="sflag">
        <polygon points="0,68 ${24 * s},68 ${24 * s},94 0,94" fill="#f7c51e"/>
        <polygon points="0,68 ${24 * s},68 0,94" fill="#d9262e"/>
      </g>`;
  }
  svg.innerHTML = sceneMarkup();
  const armL = $('#armL'), armR = $('#armR');
  armL.innerHTML = armMarkup(true);
  armR.innerHTML = armMarkup(false);
  const SH_L = [585, 353], SH_R = [615, 353];
  const arm = { l: 0, r: 0, tl: 0, tr: 0 };
  const beam = $('#beam'), lens = $('#lens'), hoist = $('#hoist'), hoistMark = $('#hoist-mark');
  const shipLight = $('#ship-light'), shipGlow = $('#ship-glow');
  const ribs = [$('#rib1'), $('#rib2')];

  // ---------- Полосы каналов ----------
  const stripMorse = $('#strip-morse'), stripBr = $('#strip-braille'), stripFlags = $('#strip-flags'), stripTape = $('#strip-tape');
  const U = 9;   // пикселей на единицу Морзе
  let brCells = [], flagEls = [], tapeCols = [], morseEls = [], morseChars = [];
  let latIndex = [];   // для каждого знака — индексы его латинских букв во флагах
  let tapeIndex = [];  // для каждого знака — индексы колонок ленты
  const scroll = { br: 0, flags: 0, tape: 0 };

  function buildStrips() {
    // Морзе
    stripMorse.innerHTML = '';
    morseEls = []; morseChars = [];
    stripMorse.style.width = msg.total * U + 'px';
    msg.chars.forEach((c) => {
      const box = document.createElement('div');
      box.className = 'm-char';
      box.style.position = 'absolute';
      box.style.left = c.start * U + 'px';
      box.style.top = '0';
      const els = [];
      if (!c.space) {
        c.els.forEach((e) => {
          const b = document.createElement('i');
          b.className = 'm-el';
          b.style.position = 'absolute';
          b.style.left = (e.start - c.start) * U + 'px';
          b.style.top = '22px';
          b.style.width = (e.dur * U - 1) + 'px';
          box.appendChild(b);
          els.push(b);
        });
        const lab = document.createElement('span');
        lab.className = 'm-lab';
        lab.textContent = c.raw.toUpperCase();
        box.appendChild(lab);
      }
      stripMorse.appendChild(box);
      morseChars.push(box);
      morseEls.push(els);
    });

    // Брайль
    stripBr.innerHTML = '';
    brCells = [];
    msg.chars.forEach((c) => {
      const cellsForChar = [];
      const glyphs = c.space ? [null] : c.br;
      glyphs.forEach((g, k) => {
        const cell = document.createElement('div');
        cell.className = 'b-cell' + (g ? '' : ' space');
        if (g) {
          const bits = dotsOf(g);
          // сетка 2×3 по строкам: точки 1 4 / 2 5 / 3 6
          for (const d of [1, 4, 2, 5, 3, 6]) {
            const i = document.createElement('i');
            if (bits & (1 << (d - 1))) i.className = 'up';
            cell.appendChild(i);
          }
          if (k === glyphs.length - 1) {
            const lab = document.createElement('span');
            lab.className = 'b-lab';
            lab.textContent = c.raw.toUpperCase();
            cell.appendChild(lab);
          }
        }
        stripBr.appendChild(cell);
        cellsForChar.push(cell);
      });
      brCells.push(cellsForChar);
    });

    // Флаги (латиница)
    stripFlags.innerHTML = '';
    flagEls = []; latIndex = [];
    msg.chars.forEach((c) => {
      const idx = [];
      if (c.space) {
        const gap = document.createElement('div');
        gap.className = 'f-gap';
        stripFlags.appendChild(gap);
        flagEls.push(gap);
        idx.push(flagEls.length - 1);
      } else {
        for (const L of c.lat) {
          const f = document.createElement('div');
          f.className = 'f-flag';
          const art = flagSVG(L, 30, 24);
          f.innerHTML = art ? `<svg viewBox="0 0 30 24">${art}</svg><span class="f-lab">${L}</span>` : `<svg viewBox="0 0 30 24"><rect width="30" height="24" rx="2" fill="none" stroke="#3a5a82" stroke-dasharray="3 3"/></svg><span class="f-lab">${L}</span>`;
          stripFlags.appendChild(f);
          flagEls.push(f);
          idx.push(flagEls.length - 1);
        }
      }
      latIndex.push(idx);
    });

    // Лента ITA2: в начале — «буквы», цифры — через «цифры»
    stripTape.innerHTML = '';
    tapeCols = []; tapeIndex = [];
    const tape = document.createElement('div');
    tape.className = 'tape';
    stripTape.appendChild(tape);
    const addCol = (code, sep) => {
      const col = document.createElement('div');
      col.className = 't-col' + (sep ? ' sep' : '');
      const bits = code || '00000';
      const holes = [bits[0], bits[1], 'f', bits[2], bits[3], bits[4]];
      holes.forEach((h) => {
        const i = document.createElement('i');
        if (h === 'f') i.className = 'feed';
        else if (h === '1') i.className = 'h';
        col.appendChild(i);
      });
      tape.appendChild(col);
      tapeCols.push(col);
      return tapeCols.length - 1;
    };
    addCol('00000', true);
    addCol(LTRS);
    let figs = false;
    msg.chars.forEach((c) => {
      const idx = [];
      for (const L of c.lat) {
        if (/[0-9\-?.,]/.test(L)) {
          if (!figs) { addCol(FIGS); figs = true; }
          idx.push(addCol(ITA2[ITA2_FIGS[L]]));
        } else {
          if (figs && L !== ' ') { addCol(LTRS); figs = false; }
          idx.push(addCol(ITA2[L] || '00000'));
        }
      }
      tapeIndex.push(idx);
    });
    addCol('00000', true);
  }

  // ---------- Флажный подъём на мачте ----------
  let hoistKey = '';
  function updateHoist(ci, sub) {
    const c = msg.chars[ci];
    if (!c) return;
    const wordChars = msg.chars.filter((x) => x.word === c.word && !x.space);
    const letters = [];
    let curIdx = -1;
    wordChars.forEach((x) => {
      [...x.lat].forEach((L, k) => {
        if (x === c && k === sub) curIdx = letters.length;
        letters.push(L);
      });
    });
    if (c.space) curIdx = -1;
    const maxN = 7;
    let from = 0;
    if (letters.length > maxN) from = Math.min(letters.length - maxN, Math.max(0, curIdx - 3));
    const vis = letters.slice(from, from + maxN);
    const key = vis.join('') + '|' + from;
    if (key !== hoistKey) {
      hoistKey = key;
      hoist.innerHTML = vis.map((L, i) => {
        const y = 198 + i * 36;
        const art = flagSVG(L, 44, 30);
        return `<g transform="translate(859 ${y})"><g class="fl" style="animation-delay:${(-i * 0.37).toFixed(2)}s">${art}</g></g>`;
      }).join('');
    }
    const ci2 = curIdx - from;
    if (ci2 >= 0 && ci2 < vis.length) {
      hoistMark.setAttribute('transform', `translate(0 ${198 + ci2 * 36 + 10})`);
      hoistMark.setAttribute('opacity', '1');
    } else hoistMark.setAttribute('opacity', '0');
  }

  // ---------- Звук ----------
  let actx = null, osc = null, gain = null, soundOn = false;
  function initAudio() {
    if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    actx = new AC();
    osc = actx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 680;
    const lp = actx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    gain = actx.createGain();
    gain.gain.value = 0;
    osc.connect(lp).connect(gain).connect(actx.destination);
    osc.start();
  }
  let lastOn = false;
  function setTone(on) {
    if (!actx || on === lastOn) return;
    lastOn = on;
    gain.gain.setTargetAtTime(on && soundOn ? 0.16 : 0, actx.currentTime, 0.004);
  }

  // ---------- Отрисовка кадра ----------
  const nowLetter = $('#now-letter'), nowMorse = $('#now-morse'), nowLat = $('#now-lat');
  let lastCi = -1, lastEl = -2;
  const angDiff = (a, b) => ((b - a + 540) % 360) - 180;

  function render(dt, t) {
    const L = locate(clock);
    const c = msg.chars[L.ci];

    // Семафор: цель рук
    let pose = SEM.REST;
    if (c && !c.space && !L.done) {
      const letter = c.lat[L.sub];
      if (letter && SEM[letter]) pose = SEM[letter];
      else if (letter && SEM_DIGIT[letter]) pose = SEM[SEM_DIGIT[letter]];
    }
    const a = armsFor(pose);
    arm.tl = clockDeg(a.left) - 180;
    arm.tr = clockDeg(a.right) - 180;
    const k = 1 - Math.exp(-dt / 0.085);
    arm.l += angDiff(arm.l, arm.tl) * k;
    arm.r += angDiff(arm.r, arm.tr) * k;
    armL.setAttribute('transform', `translate(${SH_L[0]} ${SH_L[1]}) rotate(${arm.l.toFixed(2)})`);
    armR.setAttribute('transform', `translate(${SH_R[0]} ${SH_R[1]}) rotate(${arm.r.toFixed(2)})`);
    const flutter = Math.sin(t * 9) * 4;
    ribs[0].setAttribute('transform', `rotate(${(flutter * 1.2).toFixed(2)} 612 316)`);
    ribs[1].setAttribute('transform', `rotate(${(-flutter).toFixed(2)} 612 318)`);

    // Ответ далёкого судна: R (·−·) — «принял»
    const rt = clock - msg.end - 4;
    const replyOn = rt >= 0 && ((rt < 1) || (rt >= 2 && rt < 5) || (rt >= 6 && rt < 7));
    const replying = rt >= 0 && rt < 9;
    shipLight.setAttribute('r', replyOn ? '5' : '2.4');
    shipLight.setAttribute('fill', replyOn ? '#fff6d8' : '#ffd27a');
    shipGlow.setAttribute('opacity', replyOn ? '1' : '0');

    // Прожектор
    beam.setAttribute('opacity', L.on && !L.done ? '1' : '0');
    lens.setAttribute('fill', L.on && !L.done ? '#fffbe8' : '#3a4658');
    setTone(L.on && !L.done && playing);

    // Текущая буква (во время ответа судна — его сигнал)
    if (replying) {
      if (lastCi !== -5) {
        nowLetter.textContent = 'R';
        nowMorse.innerHTML = '<i>·</i> <i>−</i> <i>·</i>';
        lastCi = -5;
      }
      const el = rt < 1 ? 0 : rt >= 2 && rt < 5 ? 1 : rt >= 6 && rt < 7 ? 2 : -1;
      [...nowMorse.querySelectorAll('i')].forEach((e, i) => e.classList.toggle('on', i === el));
      nowLat.textContent = 'ответ судна: «принял»';
    } else if (L.ci !== lastCi || L.el !== lastEl) {
      if (L.ci !== lastCi && c) {
        nowLetter.textContent = c.space ? '·' : c.raw.toUpperCase();
        nowMorse.innerHTML = c.space ? '<span style="color:var(--muted);font-size:18px;letter-spacing:0">пауза между словами</span>'
          : [...c.morse].map((s) => `<i>${s === '.' ? '·' : '−'}</i>`).join(' ');
      }
      [...nowMorse.querySelectorAll('i')].forEach((el, i) => el.classList.toggle('on', i === L.el));
      lastEl = L.el;
    }
    if (!replying) nowLat.textContent = c && !c.space ? (c.lat ? c.lat : '—') : '·';

    // Полосы
    stripMorse.style.transform = `translateX(${(-clock * U).toFixed(1)}px)`;
    morseEls.forEach((els, ci) => {
      const ch = msg.chars[ci];
      els.forEach((b, k) => b.classList.toggle('on', ci === L.ci && k === L.el));
      morseChars[ci].classList.toggle('cur', ci === L.ci);
      void ch;
    });

    const center = (el) => el ? el.offsetLeft + el.offsetWidth / 2 : 0;
    const brSel = brCells[L.ci] || [];
    const brTarget = brSel.length ? (center(brSel[0]) + center(brSel[brSel.length - 1])) / 2 : scroll.br;
    const fIdx = (latIndex[L.ci] || [])[Math.min(L.sub, (latIndex[L.ci] || [0]).length - 1)];
    const fTarget = fIdx !== undefined && flagEls[fIdx] ? center(flagEls[fIdx]) : scroll.flags;
    const tIdx = (tapeIndex[L.ci] || [])[Math.min(L.sub, (tapeIndex[L.ci] || [0]).length - 1)];
    const tTarget = tIdx !== undefined && tapeCols[tIdx] ? center(tapeCols[tIdx]) + 12 : scroll.tape;
    const ks = 1 - Math.exp(-dt / 0.12);
    scroll.br += (brTarget - scroll.br) * ks;
    scroll.flags += (fTarget - scroll.flags) * ks;
    scroll.tape += (tTarget - scroll.tape) * ks;
    stripBr.style.transform = `translateX(${(-scroll.br).toFixed(1)}px)`;
    stripFlags.style.transform = `translateX(${(-scroll.flags).toFixed(1)}px)`;
    stripTape.style.transform = `translateX(${(-scroll.tape).toFixed(1)}px)`;

    if (L.ci !== lastCi) {
      brCells.forEach((cells, ci) => cells.forEach((cell) => cell.classList.toggle('cur', ci === L.ci)));
      lastCi = L.ci;
    }
    flagEls.forEach((f, i) => f.classList.toggle('cur', i === fIdx && c && !c.space));
    tapeCols.forEach((col, i) => col.classList.toggle('cur', i === tIdx));

    updateHoist(L.ci, L.sub);
  }

  // ---------- Главный цикл ----------
  let last = performance.now();
  let t = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (document.hidden) return;
    t += dt;
    if (playing) {
      clock += (dt * 1000) / unitMs();
      if (clock > msg.total) clock = 0;
    }
    render(dt, t);
  }

  // ---------- Управление ----------
  const input = $('#msg'), translit = $('#translit');
  const playBtn = $('#play'), soundBtn = $('#sound'), wpmIn = $('#wpm'), wpmOut = $('#wpm-out');
  function syncFill() { wpmIn.style.setProperty('--fill', ((wpmIn.value - wpmIn.min) / (wpmIn.max - wpmIn.min)) * 100 + '%'); }
  function wordsLabel(n) {
    const m10 = n % 10, m100 = n % 100;
    const w = m10 === 1 && m100 !== 11 ? 'слово' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'слова' : 'слов';
    return `${n} ${w}/мин`;
  }
  function applyText() {
    const text = input.value.trim() || 'SOS';
    build(text);
    translit.textContent = msg.latText.trim() || '—';
    clock = 0;
    lastCi = -1;
    hoistKey = '';
  }
  let typeTimer = 0;
  input.addEventListener('input', () => { clearTimeout(typeTimer); typeTimer = setTimeout(applyText, 250); });
  $('#compose').addEventListener('submit', (e) => { e.preventDefault(); applyText(); });
  playBtn.addEventListener('click', () => {
    playing = !playing;
    playBtn.setAttribute('aria-pressed', String(playing));
    playBtn.setAttribute('aria-label', playing ? 'Пауза' : 'Продолжить');
    if (!playing) setTone(false);
  });
  $('#restart').addEventListener('click', () => { clock = 0; lastCi = -1; });
  wpmIn.addEventListener('input', () => { wpm = +wpmIn.value; wpmOut.textContent = wordsLabel(wpm); syncFill(); });
  soundBtn.addEventListener('click', () => {
    initAudio();
    soundOn = !soundOn;
    soundBtn.setAttribute('aria-pressed', String(soundOn));
    soundBtn.setAttribute('aria-label', soundOn ? 'Звук морзянки включён' : 'Звук морзянки выключен');
    lastOn = !lastOn;
    setTone(!lastOn);
  });
  window.addEventListener('keydown', (e) => {
    if (e.target === input) return;
    if (e.code === 'Space') { e.preventDefault(); playBtn.click(); }
    if (e.key === 'Escape' && !refEl.hidden) closeRef();
  });

  // ---------- Справочник ----------
  const refEl = $('#ref'), refBody = $('#ref-body'), refTabs = $('#ref-tabs');
  const TABS = [
    ['morse', 'Морзе'], ['sem', 'Семафор'], ['flags', 'Флаги'], ['braille', 'Брайль'], ['ita2', 'ITA2'],
  ];
  refTabs.innerHTML = TABS.map(([k, n], i) => `<button type="button" class="tab" role="tab" data-k="${k}" aria-selected="${i === 0}">${n}</button>`).join('');
  const dm = (m) => [...m].map((s) => (s === '.' ? '·' : '−')).join('');
  function semFigure(letter) {
    const a = armsFor(SEM[letter]);
    const line = (sh, h) => {
      const ang = clockDeg(h) * Math.PI / 180;
      const x2 = sh[0] + Math.sin(ang) * 22, y2 = sh[1] - Math.cos(ang) * 22;
      const fx = sh[0] + Math.sin(ang) * 30, fy = sh[1] - Math.cos(ang) * 30;
      return `<line x1="${sh[0]}" y1="${sh[1]}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#eef0ea" stroke-width="3" stroke-linecap="round"/><circle cx="${fx.toFixed(1)}" cy="${fy.toFixed(1)}" r="5" fill="#f6c445" stroke="#d9262e" stroke-width="2.5"/>`;
    };
    return `<svg viewBox="0 0 80 80" width="64" height="64" aria-hidden="true"><circle cx="40" cy="22" r="6" fill="#eef0ea"/><line x1="40" y1="29" x2="40" y2="54" stroke="#eef0ea" stroke-width="4" stroke-linecap="round"/><line x1="40" y1="54" x2="34" y2="72" stroke="#eef0ea" stroke-width="3" stroke-linecap="round"/><line x1="40" y1="54" x2="46" y2="72" stroke="#eef0ea" stroke-width="3" stroke-linecap="round"/>${line([36, 33], a.left)}${line([44, 33], a.right)}</svg>`;
  }
  function brailleSVG(g) {
    const bits = dotsOf(g);
    let s = '<svg viewBox="0 0 26 38" width="26" height="38" aria-hidden="true">';
    [[1, 7, 7], [2, 7, 19], [3, 7, 31], [4, 19, 7], [5, 19, 19], [6, 19, 31]].forEach(([d, x, y]) => {
      const up = bits & (1 << (d - 1));
      s += `<circle cx="${x}" cy="${y}" r="4.2" fill="${up ? '#f6c445' : 'rgba(163,181,202,.18)'}"/>`;
    });
    return s + '</svg>';
  }
  function renderRef(k) {
    refTabs.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.k === k)));
    const RU = 'абвгдежзийклмнопрстуфхцчшщъыьэюя'.split('');
    const LAT = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    let html = '';
    if (k === 'morse') {
      html = `<p class="ref-note">Русская азбука Морзе повторяет международную для похожих латинских букв (А — A, В — W, Ж — V…). Ъ и Ь сегодня передают одним знаком −··−. Знаки препинания — по международной таблице.</p><div class="ref-grid">`
        + RU.map((c) => `<div class="ref-item"><b>${c.toUpperCase()}</b><code>${dm(MORSE_RU[c])}</code></div>`).join('')
        + Object.entries(MORSE_NUM).map(([c, m]) => `<div class="ref-item"><b>${c}</b><code>${dm(m)}</code></div>`).join('')
        + '</div>';
    } else if (k === 'sem') {
      html = `<p class="ref-note">Международный флажный семафор, вид со стороны наблюдателя. Кириллица передаётся латиницей. Цифры — после знака «#» (флажки 12:00 и 1:30): A–I значат 1–9, K — ноль.</p><div class="ref-grid">`
        + [...LAT, '#'].map((c) => `<div class="ref-item">${semFigure(c)}<b>${c === '#' ? 'Цифры' : c}</b></div>`).join('') + '</div>';
    } else if (k === 'flags') {
      html = `<p class="ref-note">Флаги Международного свода сигналов (МСС). Каждый флаг — буква, а поднятый в одиночку ещё и готовая фраза: «O» — «Человек за бортом», «B» — «Гружу опасный груз».</p><div class="ref-grid">`
        + LAT.map((c) => `<div class="ref-item"><svg viewBox="0 0 30 24" width="54" height="43" aria-hidden="true">${flagSVG(c)}</svg><b>${c}</b></div>`).join('') + '</div>';
    } else if (k === 'braille') {
      html = `<p class="ref-note">Русский шеститочечный шрифт Брайля. Точки нумеруются сверху вниз: 1–2–3 в левом столбце, 4–5–6 в правом. Цифры пишутся знаком ⠼ и буквами а–к.</p><div class="ref-grid">`
        + RU.map((c) => `<div class="ref-item">${brailleSVG(BRAILLE[c])}<b>${c.toUpperCase()}</b></div>`).join('') + '</div>';
    } else {
      html = `<p class="ref-note">Пятибитный телеграфный код ITA2 (Бодо — Мюррей). На ленте пять дорожек и мелкая ведущая перфорация между второй и третьей. Регистр «цифры» (11011) переключает те же коды на цифры и знаки.</p><div class="ref-grid">`
        + LAT.map((c) => `<div class="ref-item"><b>${c}</b><code>${ITA2[c]}</code></div>`).join('') + '</div>';
    }
    refBody.innerHTML = html;
  }
  refTabs.addEventListener('click', (e) => { const b = e.target.closest('.tab'); if (b) renderRef(b.dataset.k); });
  let lastFocus = null;
  function openRef() { lastFocus = document.activeElement; refEl.hidden = false; renderRef('morse'); $('#ref-close').focus(); }
  function closeRef() { refEl.hidden = true; if (lastFocus) lastFocus.focus(); }
  $('#ref-open').addEventListener('click', openRef);
  $('#ref-close').addEventListener('click', closeRef);
  refEl.addEventListener('click', (e) => { if (e.target === refEl) closeRef(); });

  // ---------- Старт ----------
  syncFill();
  wpmOut.textContent = wordsLabel(wpm);
  applyText();
  clock = 9;   // к первому кадру сигнальщик уже в работе
  requestAnimationFrame((n) => { last = n; frame(n); });
})();
