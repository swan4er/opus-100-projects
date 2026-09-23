/* Вавилонская библиотека — интерфейс: адрес, поиск, чтение книг. Сцена (scene.js) подключается к window.Lib. */
(function () {
  'use strict';
  const Bb = window.Babel;
  const $ = (id) => document.getElementById(id);
  const NB = ' ';
  const WALL_NAMES = ['первая', 'вторая', 'третья', 'четвёртая'];

  const Lib = {
    hex: Bb.randomHex(),
    book: null,          // { wall, shelf, vol, page }
    mark: null,          // { page, pos, len } — подсветка найденной фразы
    scene: null,
    onHexChange: [],
  };
  window.Lib = Lib;

  const short = (hex) => { const s = Bb.hexName(hex); return s.length > 20 ? `${s.slice(0, 9)}…${s.slice(-7)}` : s; };
  function setHex(hex) {
    Lib.hex = hex;
    $('hexShort').textContent = short(hex);
    for (const f of Lib.onHexChange) f(hex);
  }
  Lib.setHex = setHex;

  // ---------- Тосты ----------
  let toastT = 0;
  function toast(html, ms) {
    const el = $('toast');
    el.innerHTML = html; el.hidden = false; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, ms || 5200);
  }
  Lib.toast = toast;

  // ---------- Книга ----------
  let spread = 0; // индекс левой страницы (0-based, чётный)
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  function renderPage(el, pageIdx) {
    if (pageIdx >= Bb.PAGES) { el.innerHTML = ''; el.dataset.n = ''; el.style.visibility = 'hidden'; return; }
    el.style.visibility = '';
    const b = Lib.book;
    const text = Bb.pageText({ hex: Lib.hex, wall: b.wall, shelf: b.shelf, vol: b.vol, page: pageIdx });
    const mk = Lib.mark && Lib.mark.page === pageIdx ? Lib.mark : null;
    let html = '';
    for (let l = 0; l < Bb.LINES; l++) {
      const s = l * Bb.COLS, e = s + Bb.COLS;
      let line = '';
      if (mk && mk.pos < e && mk.pos + mk.len > s) {
        const a = Math.max(s, mk.pos), z = Math.min(e, mk.pos + mk.len);
        line = esc(text.slice(s, a)) + '<mark>' + esc(text.slice(a, z)) + '</mark>' + esc(text.slice(z, e));
      } else line = esc(text.slice(s, e));
      html += `<span class="ln">${line}</span>`;
    }
    el.innerHTML = html;
    el.dataset.n = String(pageIdx + 1);
  }
  function renderSpread() {
    renderPage($('pageL'), spread);
    renderPage($('pageR'), spread + 1);
    const narrow = window.innerWidth < 860;
    $('pNum').textContent = narrow ? `стр. ${spread + 1} из ${Bb.PAGES}` : `стр. ${spread + 1}–${Math.min(Bb.PAGES, spread + 2)} из ${Bb.PAGES}`;
    $('pSlider').value = spread + 1;
  }
  function openBook(book, page, mark) {
    Lib.book = book; Lib.mark = mark || null;
    const narrow = window.innerWidth < 860;
    spread = narrow ? page : page - (page % 2);
    $('bAddr').textContent = `Стена ${book.wall + 1} · полка ${book.shelf + 1} · том ${book.vol + 1}`;
    $('bHex').textContent = `шестигранник ${short(Lib.hex)}`;
    $('book').hidden = false;
    renderSpread();
    setTimeout(() => $('bClose').focus(), 30);
  }
  Lib.openBook = openBook;
  function closeBook() { $('book').hidden = true; if (Lib.scene) Lib.scene.clearFocus(); }
  $('bClose').addEventListener('click', closeBook);
  $('book').addEventListener('click', (e) => { if (e.target === $('book')) closeBook(); });
  const step = () => (window.innerWidth < 860 ? 1 : 2);
  $('prevP').addEventListener('click', () => { spread = Math.max(0, spread - step()); renderSpread(); });
  $('nextP').addEventListener('click', () => { spread = Math.min(Bb.PAGES - 1, spread + step()); renderSpread(); });
  $('pSlider').addEventListener('input', (e) => { const v = +e.target.value - 1; spread = step() === 2 ? v - (v % 2) : v; renderSpread(); });

  // ---------- Полный номер ----------
  $('hexMore').addEventListener('click', () => {
    const s = Bb.hexName(Lib.hex);
    $('fullHex').textContent = s; $('fullLen').textContent = s.length.toString().replace(/\B(?=(\d{3})+(?!\d))/g, NB);
    $('full').hidden = false;
  });
  $('fullClose').addEventListener('click', () => { $('full').hidden = true; });

  // ---------- Поиск ----------
  $('search').addEventListener('submit', (e) => {
    e.preventDefault();
    const raw = $('q').value;
    const norm = Bb.normalize(raw);
    if (!norm) { toast('В библиотеке только 32&nbsp;буквы, пробел, запятая и точка. Напишите фразу по-русски.'); return; }
    const quiet = $('quiet').checked;
    let seed = 0; for (const ch of norm) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    const comp = Bb.composePage(norm, quiet ? 'spaces' : 'random', seed || 1);
    const addr = Bb.locate(comp.text);
    const digits = Bb.distanceDigits(Lib.hex, addr.hex);
    toast(`Нашлась: шестигранник <b>${short(addr.hex)}</b>, стена ${addr.wall + 1}, полка ${addr.shelf + 1}, том ${addr.vol + 1}, страница ${addr.page + 1}.<br>Отсюда до неё примерно 10<sup>${digits}</sup> шестигранников.`, 6500);
    travel(addr, { page: addr.page, pos: comp.pos, len: comp.len });
  });
  function travel(addr, mark) {
    const fade = $('fade');
    fade.classList.add('on');
    setTimeout(() => {
      setHex(addr.hex);
      if (Lib.scene) Lib.scene.focusBook(addr);
      fade.classList.remove('on');
      setTimeout(() => openBook({ wall: addr.wall, shelf: addr.shelf, vol: addr.vol }, addr.page, mark), Lib.scene ? 1500 : 200);
    }, 750);
  }
  $('random').addEventListener('click', () => {
    const book = { wall: Math.floor(Math.random() * 4), shelf: Math.floor(Math.random() * 5), vol: Math.floor(Math.random() * 32) };
    if (Lib.scene) Lib.scene.focusBook(Object.assign({ hex: Lib.hex }, book));
    setTimeout(() => openBook(book, 0, null), Lib.scene ? 1300 : 0);
  });
  $('up').addEventListener('click', () => (Lib.scene ? Lib.scene.moveFloor(1) : setHex(Lib.hex + 1n)));
  $('down').addEventListener('click', () => (Lib.scene ? Lib.scene.moveFloor(-1) : setHex(Lib.hex > 0n ? Lib.hex - 1n : 0n)));
  window.addEventListener('keydown', (e) => {
    if (!$('book').hidden) {
      if (e.key === 'Escape') closeBook();
      else if (e.key === 'ArrowRight') $('nextP').click();
      else if (e.key === 'ArrowLeft') $('prevP').click();
    } else if (!$('full').hidden && e.key === 'Escape') $('full').hidden = true;
  });

  setHex(Lib.hex);
  // Отладочный хук для проверки
  window.__babel = { open: (w, s, v, p) => openBook({ wall: w, shelf: s, vol: v }, p || 0, null), search: (q) => { $('q').value = q; $('search').requestSubmit(); } };
})();
