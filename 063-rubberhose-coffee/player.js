'use strict';
/* =====================================================================
   Кофейник Жорж · плеер
   Часы фильма — performance.now(). Звук планируется по часам AudioContext и привязан к кадру:
   при старте картинка ждёт, пока первая нота дойдёт до динамика (с учётом задержки вывода),
   а если звук разошёлся с картинкой больше чем на 0,15 с, музыка перепривязывается к кадру.
   Поэтому фильм не замирает, даже если аудиоустройство встало. Перемотка просто меняет t.
   ===================================================================== */
(function () {
  const $ = (id) => document.getElementById(id);
  const canvas = $('film');
  const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: !!window.__SHOT__ });
  const app = $('app'), playBtn = $('play'), track = $('track'), fill = $('fill'), knob = $('knob'), tip = $('tip');
  const marks = $('marks'), curEl = $('cur'), sceneEl = $('scene'), ticket = $('ticket'), sndBtn = $('snd');
  const replayBtn = $('replay'), fsBtn = $('fs'), lbl = playBtn.querySelector('.lbl');
  const SHOT = !!window.__SHOT__;
  const COVER = 96.21;          // самый выразительный кадр — для обложки: канкан всей кухни в высшей точке

  const st = { t: 0, playing: !SHOT, ended: false, sound: false, muted: false, last: performance.now() / 1000, dirty: true, drag: false, resume: false, sheet: false, hold: 0, resync: 0, fi: -1 };
  let W = 2, H = 2, trackW = 1;

  Film.init();

  /* ---------- размеры холста ---------- */
  function resize() {
    const r = canvas.getBoundingClientRect();
    const dpr = SHOT ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    let w = Math.max(2, Math.round(r.width * dpr)), h = Math.max(2, Math.round(r.height * dpr));
    if (w > 2560) { h = Math.round(h * 2560 / w); w = 2560; }
    if (w !== W || h !== H) { W = canvas.width = w; H = canvas.height = h; st.dirty = true; }
    trackW = track.getBoundingClientRect().width || 1;
    st.dirty = true;
  }
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
  window.addEventListener('resize', resize);

  /* ---------- шкала ---------- */
  for (const s of SCENES) {
    if (s.t === 0) continue;
    const m = document.createElement('div');
    m.className = 'mark'; m.style.left = (s.t / DUR * 100) + '%';
    marks.appendChild(m);
  }
  const fmt = (t) => { t = Math.max(0, Math.floor(t)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
  const sceneAt = (t) => { let n = SCENES[0].name; for (const s of SCENES) if (t >= s.t) n = s.name; return n; };

  function updateUI() {
    const p = clamp(st.t / DUR);
    fill.style.width = '100%';
    fill.style.transform = `scaleX(${p.toFixed(4)})`;
    knob.style.transform = `translateX(${(p * trackW).toFixed(1)}px)`;
    curEl.textContent = fmt(st.t);
    const sn = sceneAt(st.t);
    if (sceneEl.textContent !== sn) sceneEl.textContent = sn;
    track.setAttribute('aria-valuenow', String(Math.round(st.t)));
    track.setAttribute('aria-valuetext', fmt(st.t) + ', ' + sn);
    playBtn.classList.toggle('paused', !st.playing && !st.ended);
    playBtn.classList.toggle('ended', st.ended);
    const L = st.ended ? 'Ещё раз' : st.playing ? 'Пауза' : 'Смотреть';
    if (lbl.textContent !== L) { lbl.textContent = L; playBtn.setAttribute('aria-label', L); }
    sndBtn.setAttribute('aria-pressed', String(st.sound && !st.muted));
    sndBtn.setAttribute('aria-label', st.sound && !st.muted ? 'Выключить звук' : 'Включить звук');
  }

  /* ---------- управление ---------- */
  const now = () => performance.now() / 1000;
  function play() {
    if (st.ended || st.t >= DUR - 0.05) { st.t = 0; st.ended = false; }
    st.playing = true; st.last = now(); st.sheet = false;
    if (st.sound) startSound();
    st.dirty = true;
  }
  function pause() {
    st.playing = false;
    if (st.sound) Score.stop();
    st.dirty = true;
  }
  /** Звук с текущего кадра; картинка стоит, пока первая нота не дойдёт до динамика. */
  function startSound() { Score.start(st.t); st.hold = Score.lead(); st.resync = now(); }
  function toggle() { st.playing ? pause() : play(); }
  function seek(t) {
    st.t = clamp(t, 0, DUR); st.ended = false; st.sheet = false;
    if (st.t >= DUR) { st.ended = true; st.playing = false; }
    if (st.playing && st.sound) startSound();
    st.last = now(); st.dirty = true;
  }
  function withSound(fromStart) {
    if (!Score.init()) return;
    st.sound = true; st.muted = false; Score.setMuted(false);
    ticket.hidden = true;
    if (fromStart) { st.t = 0; st.ended = false; st.sheet = false; }
    play();
  }

  playBtn.addEventListener('click', () => (st.ended ? (seek(0), play()) : toggle()));
  canvas.addEventListener('click', () => (st.ended ? (seek(0), play()) : toggle()));
  replayBtn.addEventListener('click', () => { seek(0); if (!st.playing) play(); });
  ticket.addEventListener('click', () => withSound(true));
  sndBtn.addEventListener('click', () => {
    if (!st.sound) { withSound(false); return; }
    st.muted = !st.muted; Score.setMuted(st.muted); st.dirty = true;
  });
  fsBtn.addEventListener('click', toggleFs);
  function toggleFs() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (app.requestFullscreen) app.requestFullscreen().catch(() => {});
  }
  document.addEventListener('fullscreenchange', () => { resize(); poke(); });

  // скрываем плеер в полноэкранном режиме, когда мышь не двигается
  let idleT = 0;
  function poke() { app.classList.remove('idle'); idleT = now(); }
  app.addEventListener('pointermove', poke);

  window.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const k = e.key;
    if (k === ' ' || k === 'k' || k === 'л') { e.preventDefault(); st.ended ? (seek(0), play()) : toggle(); }
    else if (k === 'ArrowLeft') { e.preventDefault(); seek(st.t - 5); }
    else if (k === 'ArrowRight') { e.preventDefault(); seek(st.t + 5); }
    else if (k === 'Home') { e.preventDefault(); seek(0); }
    else if (k === 'f' || k === 'а') toggleFs();
    else if (k === 'm' || k === 'ь') sndBtn.click();
    poke();
  });

  // перемотка мышью и пальцем
  const tAt = (clientX) => { const r = track.getBoundingClientRect(); return clamp((clientX - r.left) / r.width) * DUR; };
  track.addEventListener('pointerdown', (e) => {
    track.setPointerCapture(e.pointerId); st.drag = true; track.classList.add('drag');
    st.wasPlaying = st.playing; if (st.playing) pause();
    seek(tAt(e.clientX)); showTip(e.clientX);
  });
  track.addEventListener('pointermove', (e) => { showTip(e.clientX); if (st.drag) seek(tAt(e.clientX)); });
  const endDrag = () => { if (!st.drag) return; st.drag = false; track.classList.remove('drag'); if (st.wasPlaying && !st.ended) play(); };
  track.addEventListener('pointerup', endDrag);
  track.addEventListener('pointercancel', endDrag);
  function showTip(clientX) {
    const r = track.getBoundingClientRect();
    const t = tAt(clientX);
    tip.textContent = fmt(t) + ' · ' + sceneAt(t);
    const x = clamp(clientX - r.left, 40, r.width - 40);
    tip.style.transform = `translateX(calc(${x.toFixed(1)}px - 50%))`;
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (st.playing) { st.resume = true; pause(); } }
    else if (st.resume) { st.resume = false; play(); }
  });

  /* ---------- главный цикл ---------- */
  function frame() {
    requestAnimationFrame(frame);
    if (document.hidden) return;
    const tn = now();
    if (st.playing) {
      let dt = Math.min(0.5, tn - st.last);   // медленное устройство пропускает кадры, но держит реальное время
      if (st.hold > 0) { const h = Math.min(st.hold, dt); st.hold -= h; dt -= h; }
      st.t += dt;
      // картинку ведут обычные часы, звук подстраивается: если разошлись больше чем на 0,15 с
      // (нет устройства, просыпаются наушники) — музыка перепривязывается к кадру, картинка не замирает
      if (st.sound && Score.running() && st.hold <= 0 && tn - st.resync > 1.5 && Math.abs(Score.drift(st.t)) > 0.15) {
        st.resync = tn; Score.start(st.t + Score.lead());
      }
      if (st.t >= DUR) { st.t = DUR; st.playing = false; st.ended = true; st.dirty = true; if (st.sound) Score.stop(); }
      else if (st.sound) Score.pump(st.t);
      // плёнка идёт 24 кадра в секунду: рисуем, только когда сменился кадр (на 60–120 Гц это в 2,5–5 раз реже)
      const fi = Math.floor(Math.min(st.t, DUR - 0.001) * FPS + 1e-6);
      if (fi !== st.fi) { st.fi = fi; st.dirty = true; }
    }
    st.last = tn;
    if (document.fullscreenElement && tn - idleT > 2.5 && st.playing) app.classList.add('idle');
    if (st.dirty && !st.sheet) {
      renderFilm(ctx, Math.min(st.t, DUR - 0.001), W, H);
      updateUI();
      st.dirty = false;
    }
  }

  /** Лист проб: несколько кадров сеткой — для проверки режиссуры по одному снимку. */
  function sheet(times, cols = 3) {
    st.playing = false; st.sheet = true;
    const w = Math.floor(W / cols), h = Math.floor(w * 9 / 16);
    const [tmp, tc] = makeCanvas(w, h);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    const t0 = performance.now();
    times.forEach((tt, i) => {
      renderFilm(tc, tt, w, h);
      ctx.drawImage(tmp, (i % cols) * w, Math.floor(i / cols) * h);
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect((i % cols) * w, Math.floor(i / cols) * h, 64, 22);
      ctx.fillStyle = '#fff'; ctx.font = '14px monospace'; ctx.fillText(tt.toFixed(2), (i % cols) * w + 6, Math.floor(i / cols) * h + 16);
      tc.getImageData(0, 0, 1, 1);
    });
    ctx.getImageData(0, 0, 1, 1);
    return Math.round(performance.now() - t0) + ' мс';
  }

  /** Замер: сколько стоит кадр вместе с растеризацией (getImageData ждёт GPU). */
  function bench(t, n = 3) {
    const out = [];
    for (let i = 0; i < n; i++) { const a = performance.now(); renderFilm(ctx, t + i / 24, W, H); ctx.getImageData(0, 0, 1, 1); out.push(Math.round(performance.now() - a)); }
    st.dirty = false; st.sheet = true;
    return W + 'x' + H + ': ' + out.join('/') + ' мс';
  }

  window.__film = { seek: (t) => { seek(t); pause(); st.dirty = true; return st.t; }, play, pause, sheet, bench, get t() { return st.t; } };

  resize();
  if (SHOT) { st.t = COVER; st.playing = false; }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { st.dirty = true; });
  requestAnimationFrame(frame);
})();
