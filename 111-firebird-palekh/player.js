'use strict';
/* ==========================================================================
   Плеер: часы фильма, перемотка, шкала со сценами, надписи, клавиши,
   полный экран, звук после жеста. Кадр целиком определяется временем t.
   ========================================================================== */
(function () {
  const $ = (id) => document.getElementById(id);
  const cv = $('film'), ctx = cv.getContext('2d');
  const frame = $('frame'), player = $('player');
  const playBtn = $('play'), soundBtn = $('withSound'), muteBtn = $('mute'), replayBtn = $('replay'), fsBtn = $('fs');
  const tl = $('timeline'), fill = $('fill'), thumb = $('thumb'), tip = $('tip'), ticks = $('ticks'), timeEl = $('time');
  const capEl = $('caption'), chapEl = $('chapters');
  const SHOT = !!window.__SHOT__;
  const DUR = FILM.dur;

  const S = { t: 0, playing: false, ended: false, sound: false, muted: false, last: 0, dirty: true, wasPlaying: false };
  let base = [1, 0, 0], cssW = 0, dpr = 1, quality = 1;

  /* ---------- размер холста ---------- */
  function resize() {
    const r = frame.getBoundingClientRect();
    cssW = r.width;
    dpr = Math.min(window.devicePixelRatio || 1, 2) * quality;
    if (SHOT) dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    // потолок по пикселям, чтобы 4К-экран не душил Canvas 2D
    const maxPx = 2560 * 1440;
    let w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
    if (w * h > maxPx) { const s = Math.sqrt(maxPx / (w * h)); w = Math.round(w * s); h = Math.round(h * s); }
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    base = [w / W, 0, 0];
    S.dirty = true;
    layoutTicks();
  }

  /* ---------- формат времени ---------- */
  const fmt = (t) => { t = Math.max(0, t); const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${m}:${String(s).padStart(2, '0')}`; };
  const chapterAt = (t) => { let c = FILM.chapters[0]; for (const ch of FILM.chapters) if (t >= ch.t - 0.001) c = ch; return c; };

  /* ---------- сцены: метки и кнопки ---------- */
  const chapBtns = [];
  FILM.chapters.forEach((ch, i) => {
    const s = document.createElement('span');
    ticks.appendChild(s);
    ch.tick = s;
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = `<span class="n">${i + 1}</span>${ch.name}`;
    b.addEventListener('click', () => { seek(ch.t + 0.01); if (!S.playing) play(); });
    li.appendChild(b); chapEl.appendChild(li);
    chapBtns.push(b);
  });
  function layoutTicks() {
    const w = tl.clientWidth;
    FILM.chapters.forEach((ch) => { ch.tick.style.transform = `translateX(${(ch.t / DUR) * w}px) rotate(45deg)`; });
  }

  /* ---------- надписи ---------- */
  let capCur = null, capSpans = [];
  function setCaption(c) {
    capCur = c; capSpans = [];
    capEl.textContent = '';
    capEl.classList.toggle('top', !!(c && c.pos === 'top'));
    if (!c) return;
    const words = c.text.split(' ');
    words.forEach((w, wi) => {
      const ws = document.createElement('span');
      ws.style.whiteSpace = 'nowrap';
      ws.style.opacity = 1;
      for (const ch of w) { const s = document.createElement('span'); s.textContent = ch; ws.appendChild(s); capSpans.push(s); }
      capEl.appendChild(ws);
      if (wi < words.length - 1) capEl.appendChild(document.createTextNode(' '));
    });
  }
  function updateCaption(t) {
    let c = null;
    for (const k of FILM.captions) if (t >= k.t0 && t < k.t1) { c = k; break; }
    if (c !== capCur) setCaption(c);
    if (!c) return;
    const fadeOut = clamp((c.t1 - t) / 0.45);
    const n = capSpans.length, per = Math.min(0.03, 1.2 / Math.max(n, 1));
    for (let i = 0; i < n; i++) {
      const a = clamp((t - c.t0 - 0.1 - i * per) / 0.28) * fadeOut;
      const v = a.toFixed(3);
      if (capSpans[i]._a !== v) { capSpans[i].style.opacity = v; capSpans[i]._a = v; }
    }
  }

  /* ---------- интерфейс ---------- */
  function updateUI() {
    const u = S.t / DUR, w = tl.clientWidth;
    fill.style.transform = `scaleX(${u.toFixed(5)})`;
    thumb.style.transform = `translateX(${(u * w).toFixed(1)}px) rotate(45deg)`;
    timeEl.textContent = `${fmt(S.t)} / ${fmt(DUR)}`;
    tl.setAttribute('aria-valuenow', S.t.toFixed(0));
    const cur = chapterAt(S.t);
    tl.setAttribute('aria-valuetext', `${fmt(S.t)}, ${cur.name}`);
    FILM.chapters.forEach((ch, i) => {
      ch.tick.classList.toggle('past', S.t >= ch.t);
      chapBtns[i].setAttribute('aria-current', ch === cur ? 'true' : 'false');
    });
    playBtn.classList.toggle('paused', !S.playing);
    const lbl = S.ended ? 'Ещё раз' : S.playing ? 'Пауза' : 'Смотреть';
    playBtn.querySelector('.lbl').textContent = lbl;
    playBtn.setAttribute('aria-label', lbl);
    soundBtn.hidden = S.sound;
    muteBtn.setAttribute('aria-pressed', S.sound && !S.muted ? 'true' : 'false');
    muteBtn.setAttribute('aria-label', S.sound && !S.muted ? 'Выключить звук' : 'Включить звук');
  }

  /* ---------- часы ---------- */
  function play() {
    if (S.ended || S.t >= DUR - 0.01) { S.t = 0; S.ended = false; }
    S.playing = true; S.last = performance.now();
    if (S.sound) Sound.start(S.t);
    S.dirty = true; updateUI();
  }
  function pause() {
    S.playing = false;
    if (S.sound) Sound.stop();
    S.dirty = true; updateUI();
  }
  function toggle() { S.playing ? pause() : play(); }
  function seek(t) {
    S.t = clamp(t, 0, DUR);
    S.ended = S.t >= DUR;
    if (S.playing && S.sound) Sound.start(S.t);
    S.last = performance.now();
    S.dirty = true; updateUI();
  }
  /* звук включается только жестом. restart — «Смотреть со звуком»: фильм с начала;
     кнопка динамика включает звук с текущего места */
  async function enableSound(restart) {
    try {
      await Sound.init();
      S.sound = true; S.muted = false;
      Sound.setMuted(false);
      if (restart) { S.t = 0; S.ended = false; }
      if (restart || S.playing) play(); else updateUI();
    } catch (e) {
      S.sound = false; updateUI();
    }
  }

  /* ---------- кадр ---------- */
  let frames = 0, slow = 0;
  function tick(now) {
    requestAnimationFrame(tick);
    if (document.hidden) return;
    if (S.playing) {
      const dt = Math.min(0.1, (now - S.last) / 1000);
      S.last = now;
      S.t += dt;
      // звук ведёт часы: мягко подтягиваем картинку к аудио
      if (S.sound) {
        const at = Sound.filmTime();
        if (at != null) { const d = at - S.t; S.t += Math.abs(d) > 0.08 ? d : d * 0.12; }
      }
      if (S.t >= DUR) { S.t = DUR; S.playing = false; S.ended = true; if (S.sound) Sound.stop(true); }
      S.dirty = true;
    }
    if (!S.dirty) return;
    S.dirty = false;
    const t0 = performance.now();
    renderFilm(ctx, base, S.t);
    updateCaption(S.t);
    updateUI();
    // адаптивное качество: только вне съёмки и только вниз
    if (!SHOT && S.playing) {
      frames++;
      if (performance.now() - t0 > 30) slow++;
      if (frames > 90) { if (slow > 45 && quality > 0.6) { quality -= 0.2; resize(); } frames = 0; slow = 0; }
    }
  }

  /* ---------- управление ---------- */
  playBtn.addEventListener('click', toggle);
  soundBtn.addEventListener('click', () => enableSound(true));
  replayBtn.addEventListener('click', () => { seek(0); play(); });
  muteBtn.addEventListener('click', () => {
    if (!S.sound) { enableSound(false); return; }
    S.muted = !S.muted; Sound.setMuted(S.muted); updateUI();
  });
  frame.addEventListener('click', toggle);

  // шкала: перетаскивание и клавиши
  const tAtX = (x) => { const r = tl.getBoundingClientRect(); return clamp((x - r.left) / r.width) * DUR; };
  let dragging = false, resume = false;
  tl.addEventListener('pointerdown', (e) => {
    dragging = true; resume = S.playing;
    if (S.playing) { S.playing = false; if (S.sound) Sound.stop(); }
    tl.classList.add('drag'); tl.setPointerCapture(e.pointerId);
    seek(tAtX(e.clientX));
  });
  tl.addEventListener('pointermove', (e) => {
    const t = tAtX(e.clientX), r = tl.getBoundingClientRect();
    tip.textContent = `${fmt(t)} · ${chapterAt(t).name}`;
    const half = tip.offsetWidth / 2;
    tip.style.transform = `translateX(${clamp(e.clientX - r.left, half, r.width - half) - half}px)`;
    if (dragging) seek(t);
  });
  const endDrag = () => { if (!dragging) return; dragging = false; tl.classList.remove('drag'); if (resume) play(); };
  tl.addEventListener('pointerup', endDrag);
  tl.addEventListener('pointercancel', endDrag);

  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (e.code === 'Space' || e.key === ' ') {
      if (e.target && e.target.tagName === 'BUTTON' && e.target !== document.body) { /* кнопка сама обработает */ return; }
      e.preventDefault(); toggle();
    } else if (e.key === 'ArrowLeft') { e.preventDefault(); seek(S.t - 5); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); seek(S.t + 5); }
    else if (e.key === 'f' || e.key === 'F' || e.key === 'а' || e.key === 'А') { toggleFs(); }
    else if (e.key === 'm' || e.key === 'M' || e.key === 'ь' || e.key === 'Ь') { muteBtn.click(); }
    else if (e.key === 'Home') { seek(0); }
  });

  /* ---------- полный экран ---------- */
  function toggleFs() {
    const doc = document;
    if (doc.fullscreenElement || player.classList.contains('pseudo-fs')) {
      if (doc.fullscreenElement) doc.exitFullscreen().catch(() => {});
      player.classList.remove('pseudo-fs');
    } else if (player.requestFullscreen) {
      player.requestFullscreen().catch(() => player.classList.add('pseudo-fs'));
    } else {
      player.classList.add('pseudo-fs');
    }
    setTimeout(resize, 120);
  }
  fsBtn.addEventListener('click', toggleFs);
  document.addEventListener('fullscreenchange', () => setTimeout(resize, 60));

  /* ---------- видимость вкладки ---------- */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { S.wasPlaying = S.playing; if (S.playing) pause(); }
    else if (S.wasPlaying) { S.wasPlaying = false; play(); }
  });

  /* ---------- запуск ---------- */
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(frame);
  initSprites();
  Light.init();
  resize();

  // доступ для проверки и отладки перемотки
  window.__film = {
    seek: (t) => { seek(t); renderFilm(ctx, base, S.t); updateCaption(S.t); return S.t; },
    play, pause,
    get t() { return S.t; },
  };

  if (SHOT) {
    // обложка: сразу самый выразительный кадр и пауза
    S.t = FILM.cover; S.playing = false;
  } else {
    S.playing = true;
  }
  S.last = performance.now();
  updateUI();
  // первый кадр рисуется сразу, не дожидаясь шрифтов; после загрузки шрифтов — перерисовка
  renderFilm(ctx, base, S.t); updateCaption(S.t);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { S.dirty = true; });
  requestAnimationFrame(tick);

  /* ---------- заблаговременная постройка фонов в простое ---------- */
  if (!SHOT) {
    const idle = window.requestIdleCallback || ((f) => setTimeout(() => f({ timeRemaining: () => 8 }), 40));
    const step = (dl) => {
      const budget = S.playing ? Math.max(3, Math.min(8, dl && dl.timeRemaining ? dl.timeRemaining() : 6)) : 16;
      if (!prewarmStep(budget)) idle(step, { timeout: 250 });
    };
    idle(step, { timeout: 400 });
  }
})();
