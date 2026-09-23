/* 067 · Черновик — плеер: часы фильма, перемотка, сцены, звук после жеста, полный экран. */
'use strict';
(function () {
  const $ = (id) => document.getElementById(id);
  const app = $('app'), player = $('player'), stage = $('stage'), cv = $('film');
  const R = new Renderer(cv);
  const snd = new Sound();
  const SHOT = !!window.__SHOT__;

  let F = null;
  let tb = 0;              // время фильма в долях
  let playing = !SHOT;
  let last = performance.now();
  let raf = 0;
  let dirty = true;

  const fmt = (sec) => { sec = Math.max(0, Math.floor(sec + 1e-3)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; };

  // ——— размер холста
  function fit() {
    const r = stage.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(64, Math.round(r.width * dpr)), h = Math.max(36, Math.round(r.height * dpr));
    if (w !== R.W || h !== R.H) { R.resize(w, h); dirty = true; }
  }

  // ——— шкала и сцены
  function buildUI() {
    const marks = $('marks'), ch = $('chapters');
    marks.innerHTML = ''; ch.innerHTML = '';
    F.scenes.forEach((s, i) => {
      const m = document.createElement('div');
      m.className = 'mark';
      m.style.left = `${(s.b / FILM_BEATS) * 100}%`;
      const sp = document.createElement('span');
      sp.textContent = s.name;
      m.appendChild(sp);
      marks.appendChild(m);
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = `<span class="n">${i + 1} · ${fmt(s.b * BEAT)}</span><span class="nm"></span>`;
      b.querySelector('.nm').textContent = s.name;
      b.addEventListener('click', () => { seek(s.b); play(); });
      li.appendChild(b);
      ch.appendChild(li);
    });
    $('tAll').textContent = fmt(FILM_SEC);
    $('timeline').setAttribute('aria-valuemax', String(Math.round(FILM_SEC)));
  }
  let lastScene = -1;
  function updateUI() {
    if (!F) return;
    const sec = tb * BEAT;
    $('tNow').textContent = fmt(sec);
    const p = clamp(tb / FILM_BEATS);
    $('fill').style.width = `${p * 100}%`;
    $('head').style.transform = `translateX(${p * $('timeline').clientWidth}px)`;
    const tl = $('timeline');
    tl.setAttribute('aria-valuenow', String(Math.round(sec)));
    tl.setAttribute('aria-valuetext', fmt(sec));
    let si = 0;
    F.scenes.forEach((s, i) => { if (tb >= s.b) si = i; });
    if (si !== lastScene) {
      lastScene = si;
      document.querySelectorAll('.mark').forEach((m, i) => m.classList.toggle('on', i === si));
      document.querySelectorAll('.chapters li').forEach((m, i) => m.classList.toggle('on', i === si));
    }
    app.classList.toggle('is-paused', !playing);
    $('play').setAttribute('aria-label', playing ? 'Пауза' : 'Смотреть');
    $('playLbl').textContent = playing ? 'Пауза' : tb >= FILM_BEATS - 0.01 ? 'Сначала' : 'Смотреть';
  }

  // ——— время
  function seek(b) {
    tb = clamp(b, 0, FILM_BEATS);
    last = performance.now();
    snd.seek(tb, playing);
    dirty = true;
    updateUI();
  }
  function play() {
    if (tb >= FILM_BEATS - 0.01) tb = 0;
    playing = true;
    last = performance.now();
    snd.seek(tb, true);
    updateUI();
    loop();
  }
  function pause() {
    playing = false;
    snd.pause();
    updateUI();
  }
  function toggle() { if (playing) pause(); else play(); }

  function frame(now) {
    raf = 0;
    if (!F) return;
    if (playing) {
      const wall = tb + Math.min(0.5, (now - last) / 1000) / BEAT;
      const at = snd.clock(wall);
      tb = at !== null ? at : wall;
      last = now;
      if (tb >= FILM_BEATS) { tb = FILM_BEATS; playing = false; snd.pause(); }
      snd.pump(F, tb);
      dirty = true;
    }
    if (dirty) { R.draw(F, tb); dirty = false; updateUI(); }
    if (playing) loop();
  }
  function loop() { if (!raf && !document.hidden) raf = requestAnimationFrame(frame); }
  function redraw() { dirty = true; if (!raf) raf = requestAnimationFrame(frame); }

  // ——— события
  $('play').addEventListener('click', toggle);
  cv.addEventListener('click', toggle);
  $('replay').addEventListener('click', () => { seek(0); play(); });
  $('soundStart').addEventListener('click', async () => {
    await snd.enable();
    snd.setMuted(false);
    $('mute').setAttribute('aria-pressed', 'true');
    $('mute').setAttribute('aria-label', 'Выключить звук');
    $('soundStart').classList.add('is-on');
    seek(0);
    play();
  });
  $('mute').addEventListener('click', async () => {
    const on = $('mute').getAttribute('aria-pressed') !== 'true';
    if (on) await snd.enable();
    snd.setMuted(!on);
    $('mute').setAttribute('aria-pressed', String(on));
    $('mute').setAttribute('aria-label', on ? 'Выключить звук' : 'Включить звук');
    if (on) { $('soundStart').classList.add('is-on'); snd.seek(tb, playing); }
  });
  $('fs').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (player.requestFullscreen) player.requestFullscreen().catch(() => {});
  });
  document.addEventListener('fullscreenchange', () => {
    app.classList.toggle('is-fs', !!document.fullscreenElement);
    setTimeout(() => { if (F) { fit(); redraw(); updateUI(); } }, 60);
  });
  let idleT = 0;
  player.addEventListener('pointermove', () => {
    player.classList.remove('idle');
    clearTimeout(idleT);
    idleT = setTimeout(() => { if (document.fullscreenElement && playing) player.classList.add('idle'); }, 2200);
  });

  // перемотка по шкале
  const tl = $('timeline'), hov = $('hover');
  let drag = false, wasPlaying = false;
  const posToBeat = (e) => { const r = tl.getBoundingClientRect(); return clamp((e.clientX - r.left) / r.width) * FILM_BEATS; };
  tl.addEventListener('pointerdown', (e) => {
    drag = true; wasPlaying = playing;
    if (playing) pause();
    tl.setPointerCapture(e.pointerId);
    seek(posToBeat(e)); redraw();
  });
  tl.addEventListener('pointermove', (e) => {
    const b = posToBeat(e);
    const r = tl.getBoundingClientRect();
    hov.hidden = false;
    hov.textContent = fmt(b * BEAT);
    hov.style.left = `${clamp((e.clientX - r.left), 24, r.width - 24)}px`;
    if (drag) { seek(b); redraw(); }
  });
  tl.addEventListener('pointerleave', () => { hov.hidden = true; });
  const endDrag = () => { if (drag) { drag = false; if (wasPlaying) play(); } };
  tl.addEventListener('pointerup', endDrag);
  tl.addEventListener('pointercancel', endDrag);

  window.addEventListener('keydown', (e) => {
    if (!F || e.altKey || e.ctrlKey || e.metaKey) return;
    const k = e.key;
    if (k === ' ' || k === 'Spacebar') { e.preventDefault(); toggle(); }
    else if (k === 'ArrowRight') { e.preventDefault(); seek(tb + 5 / BEAT); redraw(); }
    else if (k === 'ArrowLeft') { e.preventDefault(); seek(tb - 5 / BEAT); redraw(); }
    else if (k === 'f' || k === 'F' || k === 'а' || k === 'А') { $('fs').click(); }
    else if (k === 'm' || k === 'M' || k === 'ь' || k === 'Ь') { $('mute').click(); }
    else if (k === 'Home') { seek(0); redraw(); }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { snd.suspend(); }
    else { last = performance.now(); snd.resume(tb, playing); loop(); redraw(); }
  });
  window.addEventListener('resize', () => { if (!F) return; fit(); redraw(); updateUI(); });

  // ——— старт: ждём шрифты (не дольше 3,5 с), собираем фильм
  function build() {
    F = buildFilm();
    buildUI();
    fit();
    if (SHOT) { tb = F.cover; playing = false; }
    $('veil').classList.add('gone');
    dirty = true;
    updateUI();
    if (!raf) raf = requestAnimationFrame(frame);
  }
  const want = Object.values(STYLE).map((s) => s.font);
  const loads = [...new Set(want)].map((f) => document.fonts ? document.fonts.load(f, 'БбЁёАа.,!?') : Promise.resolve());
  let built = false;
  const go = () => { if (!built) { built = true; build(); } };
  Promise.race([Promise.all(loads).catch(() => {}), new Promise((r) => setTimeout(r, 3500))]).then(() => {
    const ok = document.fonts && document.fonts.check(STYLE.doc.font, 'Было');
    if (!ok) $('offline').hidden = false;
    go();
  });
  // шрифты доехали позже — пересобираем фильм с верными метриками, время сохраняем
  if (document.fonts) document.fonts.addEventListener('loadingdone', () => {
    if (!built) return;
    const keep = tb;
    F = buildFilm();
    tb = keep;
    $('offline').hidden = true;
    redraw();
  });

  // для проверки из _tools/shot: window.__film.seek(секунды), window.__film.sheet([доли], колонки)
  window.__film = {
    seek: (sec) => { seek(sec / BEAT); redraw(); return tb; },
    beat: (b) => { seek(b); redraw(); return b; },
    play, pause,
    get t() { return tb * BEAT; },
    get F() { return F; },
    get snd() { return snd; },
    sheet(beats, cols = 2) {
      pause();
      const vw = window.innerWidth, vh = window.innerHeight;
      const rows = Math.ceil(beats.length / cols);
      const tw = Math.floor(vw / cols), th = Math.floor(Math.min(tw * 9 / 16, vh / rows));
      const over = document.createElement('canvas');
      over.width = vw; over.height = vh;
      over.style.cssText = 'position:fixed;inset:0;z-index:99;background:#000';
      document.body.appendChild(over);
      const oc = over.getContext('2d');
      const tile = document.createElement('canvas');
      const r2 = new Renderer(tile);
      r2.resize(Math.round(th * 16 / 9), th);
      beats.forEach((b, i) => {
        r2.draw(F, b);
        const x = (i % cols) * tw, y = Math.floor(i / cols) * th;
        oc.drawImage(tile, x, y);
        oc.fillStyle = 'rgba(0,0,0,.6)'; oc.fillRect(x, y, 64, 20);
        oc.fillStyle = '#fff'; oc.font = '13px monospace'; oc.fillText(String(b), x + 5, y + 14);
      });
      return beats.length;
    },
  };
})();
