'use strict';
/* ==========================================================================
   Садовник на Луне · плеер
   Часы фильма, перемотка, главы, клавиатура, полный экран. Кадр 320×180
   увеличивается целым множителем, если это не съедает больше 15 % места
   (на телефоне — 3 %: там важнее занять ширину экрана).
   ========================================================================== */
(function () {
  document.documentElement.classList.add('js');
  const $ = (id) => document.getElementById(id);
  const canvas = $('film'), screen = $('screen'), player = $('player');
  const playBtn = $('play'), muteBtn = $('mute'), replayBtn = $('replay'), fullBtn = $('full');
  const cta = $('soundCta'), again = $('again');
  const timeline = $('timeline'), segs = $('segs'), knob = $('knob'), tip = $('tip'), timeEl = $('time');
  const chaptersEl = $('chapters');

  const SHOT = !!window.__SHOT__;
  const HERO_T = 63.265;          // обложка: метеор бьёт в спину, робот не отпускает бутон
  const fmt = (s) => { s = Math.max(0, Math.floor(s + 1e-6)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  $('dur').textContent = fmt(DURATION);

  /* ---------- Кадр ---------- */
  const off = document.createElement('canvas');
  off.width = W; off.height = H;
  const octx = off.getContext('2d');
  const imgData = octx.createImageData(W, H);
  const img8 = new Uint8ClampedArray(IMG32.buffer);
  const ctx = canvas.getContext('2d', { alpha: false });
  let lastDrawn = -1;
  function draw(t) {
    renderFilm(t);
    imgData.data.set(img8);
    octx.putImageData(imgData, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
    lastDrawn = t;
  }

  /* ---------- Раскладка: целочисленный масштаб ---------- */
  function layout() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const fs = document.fullscreenElement === player;
    const vw = document.documentElement.clientWidth, vh = window.innerHeight;
    const pad = vw < 640 ? 24 : 64;
    let availW = vw - pad, availH;
    if (fs) { availW = vw; availH = vh - 70; }
    else {
      const other = $('bar').offsetHeight + (chaptersEl.offsetHeight || 0) + document.querySelector('.head').offsetHeight + 90;
      availH = vh - other;
      if (vw < 640) availH = Math.max(availH, 180);
    }
    availW = Math.max(160, availW); availH = Math.max(90, availH);
    const frac = Math.min(availW / W, availH / H) * dpr;
    // целый множитель — если он не съедает больше 15 % места; на телефоне
    // (плотность 2–3) кадр важнее: дробный масштаб там почти незаметен
    const narrow = vw < 640;
    let s = Math.floor(frac);
    if (s < 1 || s / frac < (narrow ? 0.97 : 0.85)) s = frac;
    const cssW = Math.floor(W * s / dpr), cssH = Math.floor(H * s / dpr);
    canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
    const bw = Math.round(cssW * dpr), bh = Math.round(cssH * dpr);
    if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
    const barW = Math.max(cssW, Math.min(vw - 24, 320));
    $('bar').style.width = barW + 'px';
    chaptersEl.style.width = barW + 'px';
    // подписи глав стоят ровно под своими сегментами шкалы (на телефоне — сетка кнопок)
    const bl = $('bar').getBoundingClientRect(), tl = timeline.getBoundingClientRect();
    chaptersEl.style.paddingLeft = narrow ? '' : Math.max(0, tl.left - bl.left) + 'px';
    chaptersEl.style.paddingRight = narrow ? '' : Math.max(0, bl.right - tl.right) + 'px';
    lastDrawn = -1;
    lastUI = -1;
  }

  /* ---------- Главы на шкале ---------- */
  const segEls = [];
  SCENES.forEach((sc, i) => {
    const t1 = i + 1 < SCENES.length ? SCENES[i + 1].t : DURATION;
    const seg = document.createElement('div');
    seg.className = 'seg';
    seg.style.flex = (t1 - sc.t) + ' 1 0';
    const fill = document.createElement('i');
    seg.appendChild(fill);
    segs.appendChild(seg);
    segEls.push({ el: seg, fill, t0: sc.t, t1 });
    const li = document.createElement('li');
    li.style.flex = (t1 - sc.t) + ' 1 0';
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = '<b>' + (i + 1) + '</b>' + sc.name;
    b.addEventListener('click', () => seek(sc.t + 0.01, true));
    li.appendChild(b);
    chaptersEl.appendChild(li);
  });
  const chapterAt = (t) => { let k = 0; SCENES.forEach((s, i) => { if (t >= s.t) k = i; }); return k; };

  /* ---------- Часы ---------- */
  let t = 0, playing = !SHOT, ended = false, prevNow = null;
  let soundOn = false;
  // soft — конец фильма: планировщик стоп, но последние ноты и эхо дозвучат
  function setPlaying(p, soft) {
    playing = p;
    playBtn.classList.toggle('paused', !p);
    $('playLabel').textContent = p ? 'Пауза' : ended ? 'Ещё раз' : 'Смотреть';
    playBtn.title = p ? 'Пауза (пробел)' : 'Смотреть (пробел)';
    if (soundOn) { if (p) AUDIO.start(t); else if (soft) AUDIO.release(); else AUDIO.stop(); }
    prevNow = null;
  }
  function seek(nt, keepPlaying) {
    t = clamp(nt, 0, DURATION);
    ended = t >= DURATION;
    again.hidden = !ended;
    if (!playing) $('playLabel').textContent = ended ? 'Ещё раз' : 'Смотреть';
    if (soundOn && playing) AUDIO.start(t);
    if (keepPlaying && !playing && !ended) setPlaying(true);
    lastDrawn = -1;
  }
  function finish() {
    t = DURATION; ended = true;
    setPlaying(false, true);
    again.hidden = false;
  }
  function restart() {
    ended = false; again.hidden = true;
    t = 0; lastDrawn = -1;
    setPlaying(true);
  }

  /* ---------- UI ---------- */
  let lastUI = -1;
  function updateUI() {
    const k = Math.round(t * 10);
    if (k === lastUI) return;
    lastUI = k;
    for (const s of segEls) {
      const u = clamp((t - s.t0) / (s.t1 - s.t0), 0, 1);
      s.fill.style.transform = 'scaleX(' + u.toFixed(4) + ')';
    }
    const r = timeline.getBoundingClientRect();
    knob.style.transform = 'translateX(' + (timePx(t, r.width)).toFixed(1) + 'px)';
    timeEl.textContent = fmt(t) + ' / ' + fmt(DURATION);
    timeline.setAttribute('aria-valuenow', t.toFixed(1));
    timeline.setAttribute('aria-valuetext', fmt(t) + ', сцена «' + SCENES[chapterAt(t)].name + '»');
    const c = chapterAt(t);
    [...chaptersEl.children].forEach((li, i) => li.classList.toggle('cur', i === c));
  }
  // шкала из сегментов с зазорами 2 px: пересчёт времени ↔ пикселей
  function timePx(tt, width) {
    const gaps = (segEls.length - 1) * 2, usable = width - gaps;
    let x = 0;
    for (let i = 0; i < segEls.length; i++) {
      const s = segEls[i], w = usable * (s.t1 - s.t0) / DURATION;
      if (tt <= s.t1 || i === segEls.length - 1) return x + w * clamp((tt - s.t0) / (s.t1 - s.t0), 0, 1);
      x += w + 2;
    }
    return x;
  }
  function pxTime(px, width) {
    const gaps = (segEls.length - 1) * 2, usable = width - gaps;
    let x = 0;
    for (let i = 0; i < segEls.length; i++) {
      const s = segEls[i], w = usable * (s.t1 - s.t0) / DURATION;
      if (px <= x + w + 1 || i === segEls.length - 1) return s.t0 + (s.t1 - s.t0) * clamp((px - x) / w, 0, 1);
      x += w + 2;
    }
    return DURATION;
  }

  /* ---------- Перемотка мышью и пальцем ---------- */
  let dragging = false, wasPlaying = false;
  timeline.addEventListener('pointerdown', (e) => {
    dragging = true; wasPlaying = playing;
    timeline.setPointerCapture(e.pointerId);
    if (playing) setPlaying(false);
    const r = timeline.getBoundingClientRect();
    seek(pxTime(e.clientX - r.left, r.width));
  });
  timeline.addEventListener('pointermove', (e) => {
    const r = timeline.getBoundingClientRect();
    const tt = pxTime(e.clientX - r.left, r.width);
    if (dragging) seek(tt);
    if (e.pointerType === 'mouse' || dragging) {
      tip.hidden = false;
      tip.textContent = SCENES[chapterAt(tt)].name + ' · ' + fmt(tt);
      tip.style.left = clamp(e.clientX - r.left, 40, r.width - 40) + 'px';
    }
  });
  const endDrag = () => { if (!dragging) return; dragging = false; if (wasPlaying && !ended) setPlaying(true); };
  timeline.addEventListener('pointerup', endDrag);
  timeline.addEventListener('pointercancel', endDrag);
  timeline.addEventListener('pointerleave', () => { if (!dragging) tip.hidden = true; });
  timeline.addEventListener('keydown', (e) => {
    if (e.key === 'Home') { seek(0); e.preventDefault(); }
    if (e.key === 'End') { seek(DURATION - 0.05); e.preventDefault(); }
  });

  /* ---------- Кнопки ---------- */
  playBtn.addEventListener('click', () => { if (ended) restart(); else setPlaying(!playing); });
  replayBtn.addEventListener('click', () => { restart(); if (soundOn) AUDIO.start(0); });
  again.addEventListener('click', () => { restart(); if (soundOn) AUDIO.start(0); });
  cta.addEventListener('click', () => {
    // звук — только после жеста; фильм начинается сначала уже со звуком
    AUDIO.init();
    soundOn = true;
    muteBtn.classList.add('on');
    muteBtn.setAttribute('aria-label', 'Выключить звук');
    cta.classList.add('gone');
    setTimeout(() => { cta.hidden = true; }, 350);
    restart();
    AUDIO.start(0);
  });
  muteBtn.addEventListener('click', () => {
    if (!AUDIO.ready) { cta.click(); return; }
    soundOn = !soundOn;
    muteBtn.classList.toggle('on', soundOn);
    muteBtn.setAttribute('aria-label', soundOn ? 'Выключить звук' : 'Включить звук');
    if (soundOn && playing) AUDIO.start(t); else AUDIO.stop();
    if (!cta.hidden) { cta.classList.add('gone'); setTimeout(() => { cta.hidden = true; }, 350); }
  });
  fullBtn.addEventListener('click', toggleFull);
  function toggleFull() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (player.requestFullscreen) player.requestFullscreen().catch(() => {});
  }
  document.addEventListener('fullscreenchange', () => { layout(); fullBtn.setAttribute('aria-label', document.fullscreenElement ? 'Выйти из полного экрана' : 'Во весь экран'); });

  /* ---------- Клавиатура ---------- */
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) { if (ended) restart(); else setPlaying(!playing); } }
    else if (e.code === 'ArrowLeft') { e.preventDefault(); seek(t - 5); }
    else if (e.code === 'ArrowRight') { e.preventDefault(); seek(t + 5); }
    else if (e.code === 'KeyF') toggleFull();
    else if (e.code === 'KeyM') muteBtn.click();
  });
  document.addEventListener('keyup', (e) => { if (e.code === 'Space') e.preventDefault(); });

  /* ---------- Цикл ---------- */
  let raf = 0;
  function frame(now) {
    raf = 0;
    if (document.hidden) return;
    if (playing) {
      // ведущие часы — реальное время; звук догоняет, если разошёлся.
      // Шаг до 1 с: на медленной машине кадры реже, но фильм не отстаёт от музыки
      if (prevNow !== null) t += Math.min(1, (now - prevNow) / 1000);
      prevNow = now;
      if (soundOn && AUDIO.running() && Math.abs(AUDIO.filmTime() - t) > 0.25) AUDIO.start(t);
      if (t >= DURATION) finish();
    }
    if (t !== lastDrawn) draw(t);
    updateUI();
    raf = requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (soundOn) AUDIO.stop(); }
    else { prevNow = null; if (soundOn && playing) AUDIO.start(t); if (!raf) raf = requestAnimationFrame(frame); }
  });
  window.addEventListener('resize', layout);
  // шрифт интерфейса приходит позже первого кадра — ширина кнопок меняется
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout).catch(() => {});

  /* ---------- Старт ---------- */
  try {
    initFilm();
    layout();
    if (SHOT) { t = HERO_T; setPlaying(false); }
    playBtn.classList.toggle('paused', !playing);
    $('playLabel').textContent = playing ? 'Пауза' : 'Смотреть';
    draw(t);
    updateUI();
    raf = requestAnimationFrame(frame);
    window.FILM = { seek: (x) => { seek(x); draw(t); updateUI(); return t; }, pause: () => setPlaying(false), time: () => t };
  } catch (err) {
    $('fallback').textContent = 'Не удалось запустить мультфильм в этом браузере.';
    document.documentElement.classList.remove('js');
    throw err;
  }
})();
