/* Вавилонская библиотека — арифметика.
   Страница — 40 строк по 80 знаков из 35-символьного алфавита, то есть число T < M = 35^3200.
   Адрес L = (A·T + C) mod M — обратимое отображение: A взаимно просто с 35,
   обратный множитель находится подъёмом Гензеля (итерации Ньютона x ← x·(2 − A·x)). */
(function (root) {
  'use strict';
  const ALPHABET = 'абвгдежзийклмнопрстуфхцчшщъыьэюя ,.';
  const IDX = new Map([...ALPHABET].map((c, i) => [c, i]));
  const LINES = 40, COLS = 80, PAGE = LINES * COLS;
  const PAGES = 410, VOLS = 32, SHELVES = 5, WALLS = 4;
  const PER_HEX = BigInt(WALLS * SHELVES * VOLS * PAGES);
  const B = 35n, CH = 10, BCH = B ** 10n;           // 35^10 < 2^53 — кусок помещается в обычное число
  const M = B ** BigInt(PAGE);

  // Детерминированный генератор для множителя и сдвига
  function xorshift(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
  function randomBig(rnd, digits) {
    let t = 0n;
    for (let i = 0; i < digits; i += CH) { let v = 0; for (let j = 0; j < CH; j++) v = v * 35 + Math.floor(rnd() * 35); t = t * BCH + BigInt(v); }
    return t;
  }
  const rnd = xorshift(1941);
  let A = randomBig(rnd, PAGE);
  while (A % 5n === 0n || A % 7n === 0n) A += 1n;     // взаимно просто с 35
  const C = randomBig(rnd, PAGE) % M;

  function inverseMod35Power(a) {
    let x0 = 1; const a35 = Number(a % 35n);
    while ((a35 * x0) % 35 !== 1) x0++;
    let x = BigInt(x0), mod = 35n;
    while (mod < M) {
      mod = mod * mod; if (mod > M) mod = M;
      x = (x * ((2n - (a * x) % mod) % mod + mod)) % mod;
    }
    return x;
  }
  const AINV = inverseMod35Power(A);

  function textToBig(text) {
    let t = 0n;
    for (let i = 0; i < PAGE; i += CH) {
      let v = 0;
      for (let j = 0; j < CH; j++) v = v * 35 + (IDX.get(text[i + j]) || 0);
      t = t * BCH + BigInt(v);
    }
    return t;
  }
  function bigToText(t) {
    const out = new Array(PAGE);
    for (let i = PAGE - CH; i >= 0; i -= CH) {
      let v = Number(t % BCH); t /= BCH;
      for (let j = CH - 1; j >= 0; j--) { out[i + j] = ALPHABET[v % 35]; v = Math.floor(v / 35); }
    }
    return out.join('');
  }
  const addrToL = (a) => a.hex * PER_HEX + BigInt(((a.wall * SHELVES + a.shelf) * VOLS + a.vol) * PAGES + a.page);
  function lToAddr(L) {
    const hex = L / PER_HEX;
    let r = Number(L % PER_HEX);
    const page = r % PAGES; r = (r - page) / PAGES;
    const vol = r % VOLS; r = (r - vol) / VOLS;
    const shelf = r % SHELVES; const wall = (r - shelf) / SHELVES;
    return { hex, wall, shelf, vol, page };
  }
  function pageText(addr) {
    const L = addrToL(addr) % M;
    const T = ((((L - C) % M) + M) % M) * AINV % M;
    return bigToText(T);
  }
  function locate(text) { return lToAddr((A * textToBig(text) + C) % M); }

  // Нормализация: только буквы алфавита, пробел, запятая, точка
  function normalize(s) {
    return s.toLowerCase().replace(/ё/g, 'е').replace(/[\s ]+/g, ' ')
      .split('').map((c) => (IDX.has(c) ? c : c === '!' || c === '?' || c === ';' || c === ':' ? '.' : c === '-' || c === '—' ? ' ' : '')).join('')
      .replace(/ +/g, ' ').trim().slice(0, PAGE);
  }
  // Страница, где стоит фраза: среди случайных букв или в тишине пробелов
  function composePage(phrase, mode, seed) {
    const p = normalize(phrase);
    const r = xorshift(seed || 7);
    const chars = new Array(PAGE);
    for (let i = 0; i < PAGE; i++) chars[i] = mode === 'spaces' ? ' ' : ALPHABET[Math.floor(r() * 35)];
    let pos;
    if (mode === 'spaces') pos = Math.max(0, Math.min(PAGE - p.length, 19 * COLS + Math.floor((COLS - Math.min(COLS, p.length)) / 2)));
    else pos = Math.floor(r() * Math.max(1, PAGE - p.length));
    for (let i = 0; i < p.length; i++) chars[pos + i] = p[i];
    return { text: chars.join(''), pos, len: p.length, phrase: p };
  }
  const hexName = (hex) => hex.toString(36);
  function randomHex() {
    const r = xorshift((Math.random() * 4294967296) >>> 0);
    return randomBig(r, PAGE - 4) / PER_HEX;
  }
  // Порядок числа шестигранников между двумя адресами — для подписи «расстояние»
  function distanceDigits(a, b) { const d = a > b ? a - b : b - a; return d === 0n ? 0 : d.toString(10).length - 1; }

  root.Babel = { ALPHABET, LINES, COLS, PAGE, PAGES, VOLS, SHELVES, WALLS, PER_HEX, M, pageText, locate, composePage, normalize, hexName, randomHex, distanceDigits, lToAddr, addrToL, _check: () => (A * AINV) % M === 1n };
})(typeof window !== 'undefined' ? window : globalThis);
