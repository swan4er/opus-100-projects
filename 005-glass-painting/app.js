'use strict';
/* ==========================================================================
   app.js — плеер: цикл кадров, перемотка, шкала сцен, звук, полный экран.
   Время фильма t — единственный источник правды: кадр и звук считаются от него.
   ========================================================================== */
(function () {
  const $ = (id) => document.getElementById(id);
  const SHOT = !!window.__SHOT__;
  const COVER_T = 99.0;        // обложка: рассвет, олень поднял голову к снегирю на рябине

  const canvas = $('film');
  const screenEl = $('screen');
  const stage = $('stage');
  const under = [document.createElement('canvas'), document.createElement('canvas')];
  // На сервере съёмки «видеокарта» программная: там подмалёвок быстрее растрировать процессором
  const uctx = under.map((c) => c.getContext('2d', { alpha: false, willReadFrequently: SHOT }));

  const glOK = Painter.init(canvas);
  let ctx2d = null;
  if (!glOK) {
    ctx2d = canvas.getContext('2d');
    $('nogl').hidden = false;
  }

  const film = { t: SHOT ? COVER_T : 0, playing: !SHOT, loop: false, scrub: false, dirty: true, ended: false, wasPlaying: false };
  let q = 0.85;                 // доля разрешения живописи от экранного
  let pw = 0, ph = 0, cw = 0, ch = 0;

  /* ---------- размеры ---------- */
  function resize() {
    const r = canvas.getBoundingClientRect();
    if (r.width < 10) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = Math.round(r.width * dpr); ch = Math.round(cw * 9 / 16);
    let w;
    if (SHOT) w = Math.max(Math.round(r.width * 0.85), 960);
    else w = Math.round(r.width * dpr * q);
    w = clamp(w, 560, 1600);
    const nw = w, nh = Math.round(w * 9 / 16);
    if (nw !== pw || nh !== ph) {
      pw = nw; ph = nh;
      for (const c of under) { c.width = pw; c.height = ph; }
    }
    if (glOK) Painter.resize(pw, ph, cw, ch);
    else { canvas.width = cw; canvas.height = ch; }
    film.dirty = true;
  }
  new ResizeObserver(resize).observe(canvas);
  window.addEventListener('resize', resize);

  /* ---------- кадр ---------- */
  function render(t) {
    if (!pw) return;
    const spec = Story.frame(t);
    Story.draw(uctx[0], spec.a, t, pw / VW);
    let b = null;
    if (spec.b >= 0) { Story.draw(uctx[1], spec.b, t, pw / VW); b = under[1]; }
    if (glOK) {
      Painter.render({ a: under[0], b, p: spec.p, mode: spec.mode, cx: spec.cx, cy: spec.cy, seed: spec.seed, look: Story.look(t) });
    } else if (ctx2d) {
      ctx2d.globalAlpha = 1;
      ctx2d.drawImage(under[0], 0, 0, cw, ch);
      if (b) { ctx2d.globalAlpha = spec.p; ctx2d.drawImage(b, 0, 0, cw, ch); ctx2d.globalAlpha = 1; }
    }
  }

  /* ---------- управление временем ---------- */
  function seek(t, keepPlaying = true) {
    film.t = clamp(t, 0, DURATION);
    film.ended = film.t >= DURATION;
    film.dirty = true;
    Sound.seek(film.t);
    updateUI();
    return film.t;
  }
  function play() {
    if (film.t >= DURATION - 0.05) seek(0);
    film.playing = true; film.ended = false;
    Sound.resume();
    updateUI();
  }
  function pause() { film.playing = false; Sound.pauseAll(); updateUI(); }
  function toggle() { film.playing ? pause() : play(); }

  async function watchWithSound() {
    await Sound.enable();
    Sound.setMuted(false);
    seek(0);
    play();
    updateUI();
  }

  /* ---------- цикл ---------- */
  let raf = 0, last = performance.now(), ema = 1 / 60, lastAdapt = 0;
  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (film.playing && !film.scrub) {
      film.t += dt;
      if (film.t >= DURATION) {
        if (film.loop) { seek(0); }
        else { film.t = DURATION; film.playing = false; film.ended = true; Sound.pauseAll(); }
      }
      film.dirty = true;
      // подстройка разрешения живописи по времени кадра
      if (!SHOT) {
        ema = ema * 0.94 + dt * 0.06;
        if (now - lastAdapt > 1800) {
          if (ema > 1 / 26 && q > 0.45) { q *= 0.86; lastAdapt = now; resize(); }
          else if (ema < 1 / 52 && q < 1) { q = Math.min(1, q * 1.08); lastAdapt = now; resize(); }
        }
      }
    }
    if (film.dirty) { film.dirty = false; render(film.t); }
    Sound.update(film.t, film.playing && !film.scrub);
    updateUI();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(raf); raf = 0; Sound.suspend(); }
    else if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); if (film.playing) Sound.resume(); }
  });

  /* ---------- интерфейс ---------- */
  const playBtn = $('playBtn'), soundBtn = $('soundBtn'), loopBtn = $('loopBtn'), fsBtn = $('fsBtn');
  const tl = $('timeline'), fill = $('tlFill'), knob = $('tlKnob'), tip = $('tlTip'), tCur = $('tCur');
  const fmt = (s) => { s = Math.max(0, Math.floor(s + 0.001)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  $('tDur').textContent = fmt(DURATION);

  // метки сцен
  const marks = $('tlMarks');
  Story.SCENES.forEach((s, i) => {
    const next = Story.SCENES[i + 1] ? Story.SCENES[i + 1].t : DURATION;
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'mark';
    el.style.left = (s.t / DURATION * 100) + '%';
    el.style.width = ((next - s.t) / DURATION * 100) + '%';
    el.innerHTML = `<span class="full">${s.name}</span><span class="short">${s.short}</span>`;
    // мышь и палец обрабатываются в pointer-событиях шкалы; click здесь — для клавиатуры (Enter/пробел на метке)
    el.addEventListener('click', (e) => { e.stopPropagation(); if (performance.now() < ptrUntil) return; seek(s.t + 0.01); });
    marks.appendChild(el);
  });
  const markEls = [...marks.children];

  let uiState = '';
  function updateUI() {
    const k = film.t / DURATION;
    fill.style.transform = `scaleX(${k.toFixed(4)})`;
    knob.style.transform = `translateX(${(k * tl.clientWidth).toFixed(1)}px)`;
    tCur.textContent = fmt(film.t);
    tl.setAttribute('aria-valuenow', film.t.toFixed(0));
    const sceneIdx = Story.SCENES.reduce((acc, s, i) => (film.t >= s.t ? i : acc), 0);
    const state = `${film.playing}|${film.ended}|${Sound.isOn()}|${Sound.muted}|${film.loop}|${sceneIdx}`;
    if (state === uiState) return;
    uiState = state;
    playBtn.classList.toggle('is-playing', film.playing);
    playBtn.classList.toggle('is-ended', film.ended);
    playBtn.setAttribute('aria-label', film.playing ? 'Пауза' : film.ended ? 'Смотреть снова' : 'Смотреть');
    playBtn.querySelector('.lbl').textContent = film.playing ? 'Пауза' : film.ended ? 'Снова' : 'Смотреть';
    const on = Sound.isOn();
    soundBtn.classList.toggle('is-on', on && !Sound.muted);
    soundBtn.classList.toggle('primary', !on);
    soundBtn.querySelector('.lbl').textContent = !on ? 'Смотреть со звуком' : Sound.muted ? 'Звук выключен' : 'Звук';
    soundBtn.setAttribute('aria-label', !on ? 'Смотреть со звуком с начала' : Sound.muted ? 'Включить звук' : 'Выключить звук');
    loopBtn.setAttribute('aria-pressed', String(film.loop));
    markEls.forEach((el, i) => el.classList.toggle('now', i === sceneIdx));
  }

  playBtn.addEventListener('click', toggle);
  soundBtn.addEventListener('click', () => {
    if (!Sound.isOn()) watchWithSound();
    else { Sound.setMuted(!Sound.muted); updateUI(); }
  });
  loopBtn.addEventListener('click', () => { film.loop = !film.loop; uiState = ''; updateUI(); });
  function toggleFS() {
    const d = document;
    if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
    else { const f = stage.requestFullscreen || stage.webkitRequestFullscreen; if (f) f.call(stage).catch(() => {}); }
  }
  fsBtn.addEventListener('click', toggleFS);
  screenEl.addEventListener('click', toggle);
  screenEl.addEventListener('dblclick', (e) => { e.preventDefault(); toggleFS(); });
  document.addEventListener('fullscreenchange', () => { stage.classList.toggle('fs', !!document.fullscreenElement); setTimeout(resize, 60); });

  // шкала: нажатие на названии сцены — переход к её началу, перетаскивание — перемотка
  function tFromEvent(e) {
    const r = tl.getBoundingClientRect();
    return clamp((e.clientX - r.left) / r.width) * DURATION;
  }
  let downX = 0, downMark = -1, moved = false, ptrUntil = 0;
  tl.addEventListener('pointerdown', (e) => {
    const m = e.target.closest('.mark');
    downMark = m ? markEls.indexOf(m) : -1;
    downX = e.clientX; moved = false;
    tl.setPointerCapture(e.pointerId);
    film.scrub = true; film.wasPlaying = film.playing;
    tl.classList.add('dragging');
    if (downMark < 0) seek(tFromEvent(e));
  });
  tl.addEventListener('pointermove', (e) => {
    const t = tFromEvent(e);
    const s = Story.SCENES.reduce((acc, sc) => (t >= sc.t ? sc : acc), Story.SCENES[0]);
    tip.textContent = `${s.name} · ${fmt(t)}`;
    const r = tl.getBoundingClientRect();
    tip.style.transform = `translateX(${clamp(e.clientX - r.left, 40, r.width - 40).toFixed(0)}px)`;
    if (!film.scrub) return;
    if (Math.abs(e.clientX - downX) > 5) moved = true;
    if (downMark < 0 || moved) seek(t);
  });
  const endScrub = () => {
    if (!film.scrub) return;
    if (downMark >= 0 && !moved) seek(Story.SCENES[downMark].t + 0.01);
    film.scrub = false; ptrUntil = performance.now() + 400;
    tl.classList.remove('dragging'); if (film.wasPlaying) play();
  };
  tl.addEventListener('pointerup', endScrub);
  tl.addEventListener('pointercancel', endScrub);
  tl.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); seek(film.t + (e.key === 'ArrowLeft' ? -5 : 5)); }
  });

  document.addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input, textarea')) return;
    if (e.code === 'Space') { e.preventDefault(); toggle(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); seek(film.t - 5); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); seek(film.t + 5); }
    else if (e.key === 'f' || e.key === 'F' || e.key === 'а' || e.key === 'А') toggleFS();
    else if (e.key === 'm' || e.key === 'M' || e.key === 'ь' || e.key === 'Ь') { if (Sound.isOn()) { Sound.setMuted(!Sound.muted); updateUI(); } }
  });

  // скрытие плеера в полноэкранном режиме
  let idleT = 0;
  document.addEventListener('pointermove', () => {
    stage.classList.remove('idle');
    clearTimeout(idleT);
    idleT = setTimeout(() => { if (film.playing) stage.classList.add('idle'); }, 2600);
  });

  // шрифт титров мог загрузиться позже первого кадра
  if (document.fonts && document.fonts.load) {
    document.fonts.load('400 100px Kurale').then(() => { film.dirty = true; }).catch(() => {});
  }

  // доступ для проверки и съёмки
  window.__film = {
    seek: (t) => { seek(t); return film.t; },
    play, pause,
    get t() { return film.t; },
    frame: (t) => { film.t = t; render(t); return t; },
    // отладка: контактный лист — несколько моментов фильма одним кадром
    grid: async (times, cols = 3, raw = false) => {
      cancelAnimationFrame(raf); raf = -1;
      const W = window.innerWidth, H = window.innerHeight, rows = Math.ceil(times.length / cols);
      const cellW = Math.floor(W / cols), cellH = Math.min(Math.floor(H / rows), Math.floor(cellW * 9 / 16));
      const g = document.createElement('canvas'); g.width = W; g.height = H;
      g.style.cssText = 'position:fixed;inset:0;z-index:100;background:#000';
      const c = g.getContext('2d', { willReadFrequently: true });
      c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
      for (let i = 0; i < times.length; i++) {
        const t = times[i];
        const x = (i % cols) * cellW, y = Math.floor(i / cols) * cellH;
        if (raw) { const spec = Story.frame(t); Story.draw(uctx[0], spec.a, t, pw / VW); c.drawImage(under[0], x, y, cellW - 2, cellH - 2); }
        else { render(t); Painter.sync(); c.drawImage(canvas, x, y, cellW - 2, cellH - 2); }
        c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(x, y, 64, 22);
        c.fillStyle = '#fff'; c.font = '14px sans-serif'; c.fillText(t.toFixed(1), x + 6, y + 16);
        await new Promise((r) => setTimeout(r, 30));
      }
      document.body.appendChild(g);
      canvas.style.visibility = 'hidden';
      return times.length;
    },
    // отладка: показать подмалёвок без живописи
    under: (t) => {
      film.t = t; const spec = Story.frame(t); Story.draw(uctx[0], spec.a, t, pw / VW);
      const u = document.createElement('canvas'); u.width = pw; u.height = ph;
      u.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:5';
      u.getContext('2d').drawImage(under[0], 0, 0); screenEl.appendChild(u); return [pw, ph];
    },
  };

  resize();
  updateUI();
  raf = requestAnimationFrame(loop);
})();
