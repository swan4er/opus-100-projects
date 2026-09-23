'use strict';
/* =========================================================================
   Оркестр на кувшинке — ПЛЕЕР
   Часы фильма: без звука — по performance.now, со звуком — по часам
   AudioContext (с поправкой на задержку вывода). Кадр = FILM.render(t).
   ========================================================================= */
(() => {
  const $ = (id) => document.getElementById(id);
  const app = $('app'), screen = $('screen'), frame = $('frame'), canvas = $('film');
  const playBtn = $('play'), muteBtn = $('mute'), replayBtn = $('replay'), fsBtn = $('fs');
  const cta = $('soundCta'), again = $('again');
  const timeline = $('timeline'), fill = $('fill'), head = $('head'), marks = $('marks');
  const timeEl = $('time'), durEl = $('dur'), sceneNow = $('sceneNow');
  const SHOT = !!window.__SHOT__;
  const DUR = FILM.duration;
  const COVER_T = SCORE.T.D + 2 * 60 / 112 * 4 + 1.5; // финал: светлячки, весь оркестр играет

  let ctx;
  // в режиме съёмки — программный растр: на сервере GPU-процесс занят чужим WebGL
  try { ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: SHOT }); } catch (e) { ctx = null; }
  if (!ctx) { frame.insertAdjacentHTML('beforeend', '<p style="position:absolute;inset:40% 0 auto;text-align:center;color:#F1E5CC">Браузер не умеет рисовать на холсте.</p>'); return; }
  VIEW.c = ctx;

  let t = SHOT ? COVER_T : 0;
  let playing = !SHOT, sound = false, dirty = true, scrub = false, resumeAfterScrub = false;
  let lastNow = performance.now(), audioStale = false;

  /* ---------- размеры ---------- */
  function fit() {
    const r = frame.getBoundingClientRect();
    if (r.width < 2) return;
    const dpr = SHOT ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    let w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
    const maxW = 2560;
    if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    VIEW.W = w; VIEW.H = h; VIEW.K = w / 1920;
    screen.style.setProperty('--fl', frame.offsetLeft + 'px');
    screen.style.setProperty('--ft', frame.offsetTop + 'px');
    dirty = true;
  }
  if (window.ResizeObserver) new ResizeObserver(fit).observe(frame);
  window.addEventListener('resize', fit);
  fit();

  /* ---------- шкала сцен ---------- */
  const fmt = (s) => { s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  durEl.textContent = fmt(DUR);
  timeline.setAttribute('aria-valuemax', String(Math.round(DUR)));
  const markEls = FILM.scenes.map((s) => {
    const m = document.createElement('div');
    m.className = 'mark';
    m.style.left = (s.t / DUR * 100) + '%';
    m.innerHTML = `<span>${s.name}</span>`;
    marks.appendChild(m);
    return m;
  });
  const sceneOf = (tt) => { let i = 0; FILM.scenes.forEach((s, k) => { if (tt >= s.t) i = k; }); return i; };
  let lastScene = -1, lastSec = -1;
  function ui() {
    const u = clamp(t / DUR, 0, 1);
    fill.style.transform = `scaleX(${u})`;
    head.style.transform = `translateX(${u * timeline.clientWidth}px)`;
    const sec = Math.floor(t);
    if (sec !== lastSec) {
      lastSec = sec;
      timeEl.textContent = fmt(t);
      timeline.setAttribute('aria-valuenow', String(sec));
    }
    const sc = sceneOf(t);
    if (sc !== lastScene) {
      lastScene = sc;
      markEls.forEach((m, i) => m.classList.toggle('on', i === sc));
      sceneNow.textContent = FILM.scenes[sc].name;
    }
    timeline.setAttribute('aria-valuetext', `${fmt(t)}, ${FILM.scenes[sc].name}`);
  }
  function setPlayingUI() {
    app.classList.toggle('paused', !playing);
    playBtn.setAttribute('aria-label', playing ? 'Пауза' : 'Смотреть');
    playBtn.title = playing ? 'Пауза — пробел' : 'Смотреть — пробел';
    app.classList.toggle('sound', sound);
    muteBtn.setAttribute('aria-label', sound ? 'Выключить звук' : 'Включить звук');
    again.hidden = !(t >= DUR - 0.01 && !playing);
  }

  /* ---------- управление ---------- */
  function startAudio() { if (sound) { if (!AUDIO.start(t)) sound = false; } }
  function play() {
    if (t >= DUR - 0.01) t = 0;
    playing = true; lastNow = performance.now();
    startAudio();
    setPlayingUI();
  }
  function pause() {
    playing = false;
    AUDIO.stop();
    setPlayingUI();
    dirty = true;
  }
  function seek(nt) {
    t = clamp(nt, 0, DUR);
    lastNow = performance.now();
    if (playing && sound) AUDIO.start(t);
    dirty = true;
    setPlayingUI();
  }
  // кнопка «Смотреть со звуком» исчезает насовсем и отдаёт фокус, иначе пробел нажал бы её снова
  function hideCta() {
    if (cta.classList.contains('gone')) return;
    cta.classList.add('gone');
    cta.setAttribute('tabindex', '-1');
    cta.setAttribute('aria-hidden', 'true');
    if (document.activeElement === cta) cta.blur();
  }
  function withSound() {       // «Смотреть со звуком» — с самого начала
    sound = true;
    t = 0;
    hideCta();
    play();
  }
  function toggleMute() {
    sound = !sound;
    if (sound) { hideCta(); if (playing) AUDIO.start(t); }
    else AUDIO.stop();
    setPlayingUI();
  }
  function toggleFs() {
    const doc = document;
    if (doc.fullscreenElement || doc.webkitFullscreenElement) (doc.exitFullscreen || doc.webkitExitFullscreen).call(doc);
    else { const f = app.requestFullscreen || app.webkitRequestFullscreen; if (f) f.call(app); }
  }
  playBtn.addEventListener('click', () => (playing ? pause() : play()));
  canvas.addEventListener('click', () => (playing ? pause() : play()));
  cta.addEventListener('click', withSound);
  muteBtn.addEventListener('click', toggleMute);
  replayBtn.addEventListener('click', () => { seek(0); play(); });
  again.addEventListener('click', () => { seek(0); play(); });
  fsBtn.addEventListener('click', toggleFs);
  document.addEventListener('fullscreenchange', () => setTimeout(fit, 60));

  // перемотка мышью и пальцем
  function posToT(e) { const r = timeline.getBoundingClientRect(); return clamp((e.clientX - r.left) / r.width, 0, 1) * DUR; }
  timeline.addEventListener('pointerdown', (e) => {
    scrub = true; resumeAfterScrub = playing;
    timeline.classList.add('drag');
    timeline.setPointerCapture(e.pointerId);
    if (playing) { AUDIO.stop(); }
    t = posToT(e); dirty = true;
  });
  timeline.addEventListener('pointermove', (e) => { if (scrub) { t = posToT(e); dirty = true; lastNow = performance.now(); } });
  const endScrub = () => {
    if (!scrub) return;
    scrub = false; timeline.classList.remove('drag');
    lastNow = performance.now();
    if (resumeAfterScrub) { playing = true; startAudio(); }
    setPlayingUI();
  };
  timeline.addEventListener('pointerup', endScrub);
  timeline.addEventListener('pointercancel', endScrub);

  window.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    // пробел — всегда пауза или просмотр, даже когда в фокусе кнопка (кнопки нажимаются Enter)
    if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) (playing ? pause() : play()); }
    else if (e.code === 'ArrowRight') { e.preventDefault(); seek(t + 5); }
    else if (e.code === 'ArrowLeft') { e.preventDefault(); seek(t - 5); }
    else if (e.code === 'KeyF') toggleFs();
    else if (e.code === 'KeyM') toggleMute();
    else if (e.code === 'Home') { e.preventDefault(); seek(0); }
  });

  window.addEventListener('keyup', (e) => { if (e.code === 'Space' && e.target && e.target.tagName === 'BUTTON') e.preventDefault(); });

  // вкладка скрыта — фильм и звук на паузе, вернулись — продолжаем
  let hiddenPaused = false;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (playing) { hiddenPaused = true; pause(); } }
    else if (hiddenPaused) { hiddenPaused = false; play(); }
  });

  /* ---------- главный цикл ---------- */
  function frameLoop(now) {
    const dt = Math.min(0.1, (now - lastNow) / 1000);
    lastNow = now;
    if (playing && !scrub) {
      // со звуком время берём у звуковых часов; если контекст ещё не запущен — идём по обычным
      // часам и переставляем звук на текущий момент, как только он заработает
      if (sound && AUDIO.on && AUDIO.running) {
        if (audioStale) { audioStale = false; AUDIO.start(t); }
        t = Math.max(t, AUDIO.filmTime());
      } else {
        if (sound && AUDIO.on) audioStale = true;
        t += dt;
      }
      if (t >= DUR) { t = DUR; playing = false; AUDIO.stop(); setPlayingUI(); }
      dirty = true;
    }
    if (dirty && !document.hidden) {
      dirty = false;
      FILM.render(t);
      ui();
    }
    requestAnimationFrame(frameLoop);
  }

  // шрифты для титров и пометки на листке — перерисовать, когда загрузятся
  if (document.fonts && document.fonts.load) {
    // второй аргумент — кириллица: иначе браузер подгрузит только латинское подмножество шрифта
    Promise.all([['italic 800 40px Alegreya', 'Оркестр на кувшинке Конец'], ['500 20px "Alegreya Sans"', 'МУЗЫКАЛЬНЫЙ Сочинено'],
      ['40px "Marck Script"', 'в самом конце!']].map(([f, txt]) => document.fonts.load(f, txt).catch(() => null)))
      .then(() => { dirty = true; });
  }

  // для проверки кадров: window.film.seek(t)
  window.film = {
    seek: (x) => { seek(x); FILM.render(t); ui(); return +t.toFixed(2); },
    pause: () => pause(),
    play: () => play(),
    get t() { return t; },
    analyze: (a, b) => AUDIO.analyze(a, b),
    // раскадровка для проверки: сетка кадров поверх страницы
    sheet: (times, cols = 3) => {
      const rows = Math.ceil(times.length / cols);
      const cw = Math.floor(window.innerWidth / cols), ch = Math.floor(cw * 9 / 16);
      const cv = document.createElement('canvas'); cv.width = cw * cols; cv.height = ch * rows;
      Object.assign(cv.style, { position: 'fixed', left: '0', top: '0', zIndex: 9, width: cv.width + 'px', height: cv.height + 'px', background: '#000' });
      const g = cv.getContext('2d', { willReadFrequently: true }); // программный растр: не ждать занятый GPU
      const cell = document.createElement('canvas'); cell.width = cw; cell.height = ch;
      const keep = { c: VIEW.c, W: VIEW.W, H: VIEW.H, K: VIEW.K };
      Object.assign(VIEW, { c: cell.getContext('2d', { willReadFrequently: true }), W: cw, H: ch, K: cw / 1920 });
      const ms = [];
      times.forEach((tt, i) => {
        const t0 = performance.now();
        FILM.render(tt);
        ms.push(Math.round(performance.now() - t0));
        g.drawImage(cell, (i % cols) * cw, Math.floor(i / cols) * ch);
        g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect((i % cols) * cw, Math.floor(i / cols) * ch, 58, 18);
        g.fillStyle = '#fff'; g.font = '12px monospace'; g.fillText(tt.toFixed(1), (i % cols) * cw + 5, Math.floor(i / cols) * ch + 13);
      });
      Object.assign(VIEW, keep);
      document.body.appendChild(cv);
      return ms;
    },
  };

  setPlayingUI();
  FILM.render(t);
  ui();
  requestAnimationFrame(frameLoop);
})();
