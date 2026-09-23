'use strict';
/* ==========================================================================
   «Девочка и ветер» · player.js
   Плеер в стиле фильма: часы (от звука, если он включён), отрисовка кадра,
   шкала со сценами и превью, клавиши, полноэкранный режим, режим съёмки.
   ========================================================================== */
(() => {
  const SHOT = !!window.__SHOT__;
  const COVER_T = 58.9; // самый выразительный кадр: крупный план — ветер пойман, банка светится в руках
  const $ = (id) => document.getElementById(id);
  const cv = $('film'), ctx = cv.getContext('2d', Object.assign({ alpha: false }, CTX_OPTS));
  const stage = $('stage'), frameEl = $('frame');
  const playBtn = $('play'), centerBtn = $('centerPlay'), centerLabel = $('centerLabel');
  const soundBtn = $('sound'), soundLabel = $('soundLabel');
  const tl = $('timeline'), played = $('played'), playedIn = $('playedIn'), knob = $('knob');
  const timeEl = $('time'), chapters = $('chapters'), marks = $('marks');
  const peek = $('peek'), peekCv = $('peekCanvas'), peekCtx = peekCv.getContext('2d', Object.assign({ alpha: false }, CTX_OPTS)), peekText = $('peekText');
  const ambients = Array.from(document.querySelectorAll('.amb'));

  // Score объявлен в score.js через const: такие имена не попадают в window, поэтому проверяем через typeof
  const AUDIO = typeof Score === 'undefined' ? null : Score;
  const st = { t: 0, playing: false, ended: false, sound: false, muted: false, dirty: true, scrub: false, wasPlaying: false };
  const base = { t: 0, perf: 0, audio: 0, off: 0 };
  let quality = 1; // доля от devicePixelRatio, подстраивается по времени кадра

  /* ---------- Часы ----------
     Со звуком ведущие часы — аудио: музыка и шумы расписаны по времени AudioContext.
     Но его currentTime идёт ступеньками по 10–20 мс, поэтому кадр берёт гладкие
     часы performance.now() и мягко подтягивает их к аудио (сдвиг сглаживается,
     при расхождении больше 0,15 с — сразу догоняет). */
  const audioOn = () => st.sound && AUDIO && AUDIO.ready();
  function clock() {
    if (!st.playing) return st.t;
    const tp = base.t + (performance.now() - base.perf) / 1000;
    if (!audioOn()) return tp;
    const d = base.t + (AUDIO.now() - base.audio) - tp;
    base.off = Math.abs(d - base.off) > 0.15 ? d : base.off + (d - base.off) * 0.08;
    return tp + base.off;
  }
  function rebase() {
    base.t = st.t;
    base.perf = performance.now();
    base.off = 0;
    if (audioOn()) base.audio = AUDIO.now();
  }
  function play() {
    if (st.t >= DURATION - 0.05) st.t = 0;
    st.playing = true;
    st.ended = false;
    rebase();
    if (audioOn()) AUDIO.start(st.t);
    ui();
  }
  function pause() {
    st.t = clock();
    st.playing = false;
    if (AUDIO) AUDIO.stop();
    st.dirty = true;
    ui();
  }
  function seek(t) {
    st.t = clamp(t, 0, DURATION);
    st.ended = false;
    rebase();
    if (st.playing && audioOn()) AUDIO.start(st.t);
    st.dirty = true;
    ui();
  }
  const toggle = () => (st.playing ? pause() : play());

  /* ---------- Размер холста ---------- */
  function resize() {
    const r = frameEl.getBoundingClientRect();
    const dpr = SHOT ? 1 : Math.min(2, window.devicePixelRatio || 1);
    const s = Math.max(SHOT ? 1 : 0.6, dpr * quality);
    const W = Math.max(320, Math.round(r.width * s));
    const H = Math.round((W * 9) / 16);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; st.dirty = true; }
    const tw = tl.getBoundingClientRect().width;
    playedIn.style.width = tw + 'px';
    layoutChapters();
  }

  /* ---------- Кадр ---------- */
  let ema = 16, slowN = 0, fastN = 0;
  function draw() {
    const t0 = performance.now();
    renderFrame(ctx, cv.width, cv.height, st.t);
    const dt = performance.now() - t0;
    if (!SHOT && st.playing) {
      ema = ema * 0.9 + dt * 0.1;
      if (ema > 24) { slowN++; fastN = 0; } else if (ema < 9) { fastN++; slowN = 0; } else { slowN = fastN = 0; }
      if (slowN > 40 && quality > 0.55) { quality *= 0.85; slowN = 0; resize(); }
      if (fastN > 240 && quality < 1) { quality = Math.min(1, quality / 0.85); fastN = 0; resize(); }
    }
  }

  function loop() {
    if (st.playing && !st.scrub) {
      st.t = clock();
      // конец: новых нот нет, но последний аккорд и эхо дозвучивают сами
      if (st.t >= DURATION) {
        if (audioOn()) { AUDIO.tick(DURATION); AUDIO.stop(true); }
        st.t = DURATION; st.playing = false; st.ended = true; ui();
      }
      st.dirty = true;
    }
    if (st.dirty) { draw(); st.dirty = false; uiTime(); }
    if (audioOn() && st.playing) AUDIO.tick(st.t);
    requestAnimationFrame(loop);
  }

  /* ---------- Интерфейс ---------- */
  const fmt = (t) => { const s = Math.max(0, Math.floor(t + 0.001)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const sceneAt = (t) => { let i = 0; SCENES.forEach((s, j) => { if (t >= s.t) i = j; }); return i; };
  let lastAmb = -1, lastSec = -1, lastScene = -1;
  function uiTime() {
    const p = st.t / DURATION;
    played.style.transform = 'scaleX(' + p.toFixed(5) + ')';
    playedIn.style.transform = 'scaleX(' + (p > 0.0005 ? (1 / p).toFixed(5) : 0) + ')';
    const tw = tl.clientWidth;
    knob.style.transform = 'translateX(' + (p * tw).toFixed(1) + 'px)';
    const sec = Math.floor(st.t);
    const sc = sceneAt(st.t);
    if (sec !== lastSec || sc !== lastScene) {
      lastSec = sec;
      timeEl.textContent = fmt(st.t) + ' / ' + fmt(DURATION);
      tl.setAttribute('aria-valuenow', String(sec));
      tl.setAttribute('aria-valuetext', fmt(st.t) + ', ' + SCENES[sc].name);
    }
    if (sc !== lastScene) {
      lastScene = sc;
      chapters.querySelectorAll('.chap').forEach((b, i) => b.classList.toggle('cur', i === sc));
    }
    // свет экрана на стенах: какой тон у кадра сейчас
    const amb = st.t < 22 ? 0 : st.t < 43 ? 1 : st.t < 64 ? 2 : st.t < BURST_T ? 3 : 4;
    if (amb !== lastAmb) { lastAmb = amb; ambients.forEach((a, i) => { a.style.opacity = i === amb ? '1' : '0'; }); }
  }
  function ui() {
    playBtn.classList.toggle('paused', !st.playing);
    playBtn.setAttribute('aria-label', st.playing ? 'Пауза' : 'Смотреть');
    const showCenter = !SHOT && !st.playing && !st.scrub;
    centerBtn.hidden = !showCenter;
    centerLabel.textContent = st.ended ? 'Ещё раз' : 'Смотреть';
    centerBtn.setAttribute('aria-label', st.ended ? 'Смотреть ещё раз' : 'Смотреть');
    soundBtn.classList.toggle('off', !st.sound);
    soundBtn.classList.toggle('muted', st.sound && st.muted);
    soundBtn.setAttribute('aria-pressed', String(st.sound && !st.muted));
    soundBtn.setAttribute('aria-label', !st.sound ? 'Смотреть со звуком сначала' : st.muted ? 'Включить звук' : 'Выключить звук');
    uiTime();
  }

  function layoutChapters() {
    if (!chapters.children.length) {
      SCENES.forEach((s, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'chap';
        b.textContent = s.name;
        b.addEventListener('click', (e) => { e.stopPropagation(); if (e.detail > 0) b.blur(); seek(s.t + 0.01); if (!st.playing) st.dirty = true; });
        chapters.appendChild(b);
        if (i > 0) { const m = document.createElement('i'); marks.appendChild(m); }
      });
    }
    const w = tl.clientWidth;
    const kids = Array.from(chapters.children);
    kids.forEach((b, i) => {
      const x = (SCENES[i].t / DURATION) * w;
      b.style.left = Math.max(-4, Math.min(w - b.offsetWidth + 4, x - 4)) + 'px';
    });
    Array.from(marks.children).forEach((m, i) => { m.style.left = ((SCENES[i + 1].t / DURATION) * 100).toFixed(3) + '%'; });
  }

  /* ---------- Шкала: перемотка и превью ---------- */
  const tAtX = (clientX) => { const r = tl.getBoundingClientRect(); return clamp((clientX - r.left) / r.width) * DURATION; };
  tl.addEventListener('pointerdown', (e) => {
    if (e.target.classList.contains('chap')) return;
    tl.setPointerCapture(e.pointerId);
    st.wasPlaying = st.playing;
    if (st.playing) pause();
    st.scrub = true;
    tl.classList.add('drag');
    seek(tAtX(e.clientX));
  });
  tl.addEventListener('pointermove', (e) => {
    if (st.scrub) seek(tAtX(e.clientX));
    if (e.pointerType === 'mouse') showPeek(e.clientX);
  });
  const endScrub = () => {
    if (!st.scrub) return;
    st.scrub = false;
    tl.classList.remove('drag');
    if (st.wasPlaying) play(); else ui();
  };
  tl.addEventListener('pointerup', endScrub);
  tl.addEventListener('pointercancel', endScrub);
  tl.addEventListener('pointerleave', () => peek.classList.remove('on'));
  let peekT = -1, peekQueued = false;
  function showPeek(clientX) {
    const r = tl.getBoundingClientRect();
    peekT = tAtX(clientX);
    const x = clamp(clientX - r.left - 106, -8, r.width - 204);
    peek.style.transform = 'translateX(' + x.toFixed(1) + 'px)';
    peek.classList.add('on');
    peekText.textContent = fmt(peekT) + ' · ' + SCENES[sceneAt(peekT)].name;
    if (!peekQueued) {
      peekQueued = true;
      requestAnimationFrame(() => { peekQueued = false; renderFrame(peekCtx, 208, 117, peekT); });
    }
  }
  tl.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') return; // общий обработчик ниже
    if (e.key === 'Home') { seek(0); e.preventDefault(); }
    if (e.key === 'End') { seek(DURATION - 0.1); e.preventDefault(); }
  });

  /* ---------- Кнопки ---------- */
  playBtn.addEventListener('click', toggle);
  centerBtn.addEventListener('click', () => { if (st.ended) seek(0); play(); });
  $('replay').addEventListener('click', () => { seek(0); play(); });
  frameEl.addEventListener('click', (e) => { if (e.target === cv) toggle(); });

  soundBtn.addEventListener('click', async () => {
    if (!AUDIO) return;
    if (!st.sound) {
      // по правилам браузеров звук включается только жестом — и фильм начинается сначала
      soundBtn.disabled = true;
      try { await AUDIO.init(); } catch (err) { /* нет Web Audio — фильм идёт без звука */ }
      soundBtn.disabled = false;
      if (!AUDIO.ready()) { ui(); return; }
      st.sound = true;
      st.muted = false;
      AUDIO.setMuted(false);
      st.t = 0;
      st.playing = false;
      play();
      return;
    }
    st.muted = !st.muted;
    AUDIO.setMuted(st.muted);
    ui();
  });

  // После щелчка мышью или касания кнопка отдаёт фокус: иначе пробел нажал бы её ещё раз
  // вместо паузы. С клавиатуры (detail = 0) фокус остаётся на месте.
  stage.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('button');
    if (b && e.detail > 0) b.blur();
  });

  /* ---------- Полный экран ---------- */
  const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
  function setFsClass() {
    const on = !!fsEl() || stage.classList.contains('pseudo-fs');
    stage.classList.toggle('is-fs', on);
    $('fs').setAttribute('aria-label', on ? 'Выйти из полноэкранного режима' : 'Во весь экран');
    setTimeout(resize, 60);
    poke();
  }
  $('fs').addEventListener('click', () => {
    if (fsEl()) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
    if (stage.classList.contains('pseudo-fs')) { stage.classList.remove('pseudo-fs'); setFsClass(); return; }
    const req = stage.requestFullscreen || stage.webkitRequestFullscreen;
    if (req) {
      try {
        const p = req.call(stage);
        if (p && p.catch) p.catch(() => { stage.classList.add('pseudo-fs'); setFsClass(); });
      } catch (err) { stage.classList.add('pseudo-fs'); setFsClass(); }
    } else { stage.classList.add('pseudo-fs'); setFsClass(); }
  });
  document.addEventListener('fullscreenchange', setFsClass);
  document.addEventListener('webkitfullscreenchange', setFsClass);
  let idleTimer = 0;
  function poke() {
    stage.classList.remove('idle');
    clearTimeout(idleTimer);
    if (stage.classList.contains('is-fs') && st.playing) idleTimer = setTimeout(() => stage.classList.add('idle'), 2600);
  }
  stage.addEventListener('pointermove', poke);

  /* ---------- Клавиши ---------- */
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.code === 'Space' || e.key === 'k' || e.key === 'л') {
      if (tag === 'BUTTON' && e.code === 'Space') return; // пробел на кнопке — её собственное нажатие
      e.preventDefault(); toggle(); poke();
    } else if (e.key === 'ArrowLeft') { e.preventDefault(); seek(st.t - 5); poke(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); seek(st.t + 5); poke(); }
    else if (e.key === 'f' || e.key === 'а') { $('fs').click(); }
    else if (e.key === 'm' || e.key === 'ь') { soundBtn.click(); }
  });

  /* ---------- Вкладка скрыта — пауза ---------- */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (st.playing) { st.wasHidden = true; pause(); } }
    else if (st.wasHidden) { st.wasHidden = false; play(); }
  });

  window.addEventListener('resize', resize);
  // ширина шкалы меняется и без изменения окна: кнопка звука из «таблетки» становится значком
  if (window.ResizeObserver) {
    new ResizeObserver(() => { playedIn.style.width = tl.clientWidth + 'px'; layoutChapters(); uiTime(); }).observe(tl);
  }

  /* ---------- Для проверки: перемотка и раскадровка ---------- */
  window.film = {
    seek: (t) => { seek(t); draw(); st.dirty = false; return st.t; },
    play, pause,
    get t() { return st.t; },
    /** Замер: средняя длительность отрисовки кадра (мс) на текущем холсте. */
    bench(t, n) {
      n = n || 3;
      const a = performance.now();
      for (let i = 0; i < n; i++) renderFrame(ctx, cv.width, cv.height, t + i / 60);
      return { ms: +((performance.now() - a) / n).toFixed(1), w: cv.width, h: cv.height };
    },
    /** Раскадровка: несколько кадров сеткой поверх страницы. */
    sheet(times, cols) {
      cols = cols || 3;
      const rows = Math.ceil(times.length / cols);
      let ov = document.getElementById('sheet');
      if (!ov) { ov = document.createElement('canvas'); ov.id = 'sheet'; ov.style.cssText = 'position:fixed;inset:0;z-index:99;width:100vw;height:100vh;background:#111'; document.body.appendChild(ov); }
      ov.width = innerWidth; ov.height = innerHeight;
      const c = ov.getContext('2d');
      const cw = Math.floor(innerWidth / cols), ch = Math.floor(cw * 9 / 16);
      const scale = Math.min(1, innerHeight / (rows * ch));
      const w = Math.floor(cw * scale), h = Math.floor(ch * scale);
      const o = document.createElement('canvas'); o.width = w - 4; o.height = h - 4;
      const oc = o.getContext('2d', Object.assign({ alpha: false }, CTX_OPTS));
      times.forEach((t, i) => {
        renderFrame(oc, o.width, o.height, t);
        c.drawImage(o, (i % cols) * w + 2, Math.floor(i / cols) * h + 2);
        c.fillStyle = '#fff'; c.font = '13px sans-serif'; c.fillText(String(t), (i % cols) * w + 8, Math.floor(i / cols) * h + 18);
      });
      return times.length;
    },
  };

  /* ---------- Старт ---------- */
  if (document.fonts && document.fonts.load) {
    document.fonts.load('600 124px Cormorant').then(() => { st.dirty = true; }).catch(() => {});
  }
  initSpiritPaths();
  resize();
  if (SHOT) {
    st.t = COVER_T;
    st.playing = false;
  } else {
    st.playing = true;
    rebase();
  }
  ui();
  requestAnimationFrame(loop);
})();
