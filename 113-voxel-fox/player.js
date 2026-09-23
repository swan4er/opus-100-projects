// ───────────────────────────────────────────────────────────────────────────
//  «Лисий дом» — плеер: кадр 16:9, шкала со сценами, звук, клавиши, титры.
// ───────────────────────────────────────────────────────────────────────────
(function () {
  'use strict';
  const S = window.STORY;
  const $ = (id) => document.getElementById(id);
  const SHOT = !!window.__SHOT__;
  const fmt = (t) => { t = Math.max(0, Math.floor(t)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };

  const st = { t: 0, playing: false, dirty: true, film: null, audio: null, sound: false, scale: 1, lastTs: 0, slow: 0, fast: 0, ended: false, drag: false };

  // ── Разметка шкалы: метки сцен ───────────────────────────────────────────
  function buildTimeline() {
    const marks = $('marks'), chap = $('chapters');
    S.SCENES.forEach((sc, i) => {
      const x = (sc.t / S.DURATION) * 100;
      const tick = document.createElement('span');
      tick.className = 'tick'; tick.style.left = x + '%';
      $('track').appendChild(tick);
      const b = document.createElement('button');
      b.className = 'mark'; b.style.left = x + '%'; b.type = 'button';
      b.innerHTML = '<span>' + sc.name + '</span>';
      b.addEventListener('click', (e) => { e.stopPropagation(); seek(sc.t + 0.01); });
      marks.appendChild(b);
      const li = document.createElement('li');
      const lb = document.createElement('button'); lb.type = 'button';
      lb.innerHTML = '<b>' + (i + 1) + '</b><span>' + sc.name + '</span><i>' + fmt(sc.t) + '</i>';
      lb.addEventListener('click', () => { seek(sc.t + 0.01); if (!st.playing) play(); });
      li.appendChild(lb); chap.appendChild(li);
    });
  }

  // ── Размер кадра: максимальный 16:9 в свободном месте ────────────────────
  function layout() {
    const frame = $('frame');
    const full = document.fullscreenElement === $('stage');
    const vw = window.innerWidth, vh = window.innerHeight;
    let w, h;
    if (full) { w = Math.min(vw, vh * 16 / 9); h = w * 9 / 16; }
    else {
      const mobile = vw < 760;
      const padX = mobile ? 12 : 32;
      const reserved = mobile ? 0 : ($('top').offsetHeight + $('bar').offsetHeight + 56);
      w = vw - padX * 2;
      if (!mobile) w = Math.min(w, (vh - reserved) * 16 / 9);
      w = Math.max(240, Math.floor(w)); h = Math.round(w * 9 / 16);
    }
    frame.style.width = w + 'px'; frame.style.height = h + 'px';
    document.documentElement.style.setProperty('--fw', w + 'px');
    if (st.film) {
      const dpr = SHOT ? 1 : Math.min(window.devicePixelRatio || 1, 1.75);
      st.film.resize(w, h, Math.max(0.5, dpr * (SHOT ? 0.75 : st.scale)));
      st.dirty = true;
    }
  }

  // ── Время ────────────────────────────────────────────────────────────────
  function seek(t) {
    st.t = Math.max(0, Math.min(S.DURATION, t));
    st.ended = st.t >= S.DURATION;
    st.dirty = true;
    if (st.audio && st.sound) st.audio.seek(st.t, st.playing);
    ui();
  }
  function play() {
    if (st.t >= S.DURATION - 0.05) st.t = 0;
    st.playing = true; st.ended = false; st.lastTs = 0;
    if (st.audio && st.sound) st.audio.play(st.t);
    ui();
  }
  function pause() {
    st.playing = false;
    if (st.audio) st.audio.pause();
    ui();
  }
  function toggle() { if (st.playing) pause(); else play(); }
  async function soundOn() {
    if (!window.FoxAudio || !st.film) return;
    if (!st.audio) { st.audio = window.FoxAudio.create(st.film.cues); }
    if (!st.sound) {
      st.sound = true;
      await st.audio.init();
      st.t = 0; st.dirty = true; st.playing = true; st.ended = false; st.lastTs = 0;
      st.audio.play(0);
    } else {
      st.audio.setMuted(!st.audio.muted);
    }
    ui();
  }

  // ── Интерфейс ────────────────────────────────────────────────────────────
  let lastUiT = -1, lastScene = -1;
  function ui() {
    const pb = $('bPlay');
    pb.classList.toggle('is-playing', st.playing);
    pb.setAttribute('aria-label', st.playing ? 'Пауза' : (st.ended ? 'Смотреть ещё раз' : 'Смотреть'));
    $('lPlay').textContent = st.playing ? 'Пауза' : (st.ended ? 'Ещё раз' : 'Смотреть');
    const sb = $('bSound');
    const muted = st.audio ? st.audio.muted : true;
    sb.classList.toggle('is-on', st.sound && !muted);
    sb.classList.toggle('is-first', !st.sound);
    $('lSound').textContent = !st.sound ? 'Смотреть со звуком' : (muted ? 'Звук выкл.' : 'Звук вкл.');
    sb.setAttribute('aria-pressed', String(st.sound && !muted));
    tick(true);
  }
  function tick(force) {
    if (!force && Math.abs(st.t - lastUiT) < 0.03) return;
    lastUiT = st.t;
    const k = st.t / S.DURATION;
    $('fill').style.transform = 'scaleX(' + k + ')';
    $('thumb').style.transform = 'translateX(' + (k * $('track').clientWidth) + 'px)';
    $('time').textContent = fmt(st.t) + ' / ' + fmt(S.DURATION);
    $('track').setAttribute('aria-valuenow', String(Math.round(st.t)));
    $('track').setAttribute('aria-valuetext', fmt(st.t));
    let si = 0; S.SCENES.forEach((sc, i) => { if (st.t >= sc.t) si = i; });
    if (si !== lastScene) {
      lastScene = si;
      document.querySelectorAll('.mark').forEach((m, i) => m.classList.toggle('on', i === si));
      document.querySelectorAll('#chapters button').forEach((m, i) => m.classList.toggle('on', i === si));
    }
    // титры — прозрачность по времени (работает и при перемотке)
    for (const c of S.CAPTIONS) {
      const el = c.el;
      const a = Math.min(S.smooth(c.t0, c.t0 + 0.7, st.t), 1 - S.smooth(c.t1 - 0.7, c.t1, st.t));
      el.style.opacity = a.toFixed(3);
      el.style.transform = 'translate3d(0,' + ((1 - a) * 8).toFixed(1) + 'px,0)';
    }
  }
  function buildCaptions() {
    const cap = $('caps');
    for (const c of S.CAPTIONS) {
      const el = document.createElement('div');
      el.className = 'cap cap-' + c.kind; el.textContent = c.text; el.style.opacity = '0';
      cap.appendChild(el); c.el = el;
    }
  }

  // ── Шкала: перемотка мышью и пальцем ─────────────────────────────────────
  function bindTimeline() {
    const tr = $('track');
    const at = (e) => { const r = tr.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * S.DURATION; };
    tr.addEventListener('pointerdown', (e) => { st.drag = true; tr.setPointerCapture(e.pointerId); tr.classList.add('drag'); seek(at(e)); });
    tr.addEventListener('pointermove', (e) => {
      const r = tr.getBoundingClientRect();
      const x = Math.max(0, Math.min(r.width, e.clientX - r.left));
      $('hover').style.transform = 'translateX(' + x + 'px)';
      $('hover').textContent = fmt(x / r.width * S.DURATION);
      if (st.drag) seek(at(e));
    });
    const up = () => { st.drag = false; tr.classList.remove('drag'); };
    tr.addEventListener('pointerup', up); tr.addEventListener('pointercancel', up);
    tr.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { seek(st.t - 5); e.preventDefault(); }
      if (e.key === 'ArrowRight') { seek(st.t + 5); e.preventDefault(); }
      if (e.key === 'Home') { seek(0); e.preventDefault(); }
      if (e.key === 'End') { seek(S.DURATION); e.preventDefault(); }
    });
  }

  // ── Цикл кадров ──────────────────────────────────────────────────────────
  function loop(ts) {
    requestAnimationFrame(loop);
    if (document.hidden || !st.film) return;
    if (st.playing) {
      if (st.audio && st.sound && st.audio.clockOk()) st.t = st.audio.time();
      else if (st.lastTs) st.t += Math.min(0.1, (ts - st.lastTs) / 1000);
      st.lastTs = ts;
      if (st.t >= S.DURATION) { st.t = S.DURATION; st.playing = false; st.ended = true; if (st.audio) st.audio.pause(); ui(); }
      st.dirty = true;
      if (st.audio && st.sound) st.audio.pump(st.t);
    }
    if (st.dirty) {
      const t0 = performance.now();
      st.film.render(st.t);
      st.dirty = false;
      tick(false);
      if (!SHOT && st.playing) adapt(performance.now() - t0, ts);
    }
  }
  // Подстройка разрешения по времени кадра
  let lastFrameTs = 0;
  function adapt(cpu, ts) {
    const dt = lastFrameTs ? ts - lastFrameTs : 16; lastFrameTs = ts;
    if (dt > 34) st.slow++; else st.slow = Math.max(0, st.slow - 1);
    if (dt < 18) st.fast++; else st.fast = 0;
    if (st.slow > 20 && st.scale > 0.55) { st.scale = Math.max(0.55, st.scale * 0.85); st.slow = 0; layout(); }
    else if (st.fast > 180 && st.scale < 1) { st.scale = Math.min(1, st.scale * 1.1); st.fast = 0; layout(); }
  }

  // ── Запуск ───────────────────────────────────────────────────────────────
  function bind() {
    $('bPlay').addEventListener('click', toggle);
    $('bSound').addEventListener('click', soundOn);
    $('bReplay').addEventListener('click', () => { seek(0); play(); });
    $('bFull').addEventListener('click', () => {
      const s = $('stage');
      if (document.fullscreenElement) document.exitFullscreen(); else if (s.requestFullscreen) s.requestFullscreen().catch(() => {});
    });
    $('frame').addEventListener('click', toggle);
    document.addEventListener('fullscreenchange', () => { document.body.classList.toggle('is-full', !!document.fullscreenElement); layout(); });
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) toggle(); return; }
      if (e.target && e.target.id === 'track') return;   // стрелки на шкале обрабатывает сама шкала
      if (e.key === 'ArrowLeft') { e.preventDefault(); seek(st.t - 5); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); seek(st.t + 5); }
      else if (e.key === 'f' || e.key === 'F' || e.key === 'а' || e.key === 'А') $('bFull').click();
      else if (e.key === 'm' || e.key === 'M' || e.key === 'ь' || e.key === 'Ь') soundOn();
    });
    // пробел на кнопке в фокусе не должен «нажать» её второй раз
    document.addEventListener('keyup', (e) => { if (e.code === 'Space') e.preventDefault(); });
    document.addEventListener('visibilitychange', () => {
      if (!st.audio) return;
      if (document.hidden) st.audio.suspend(); else if (st.playing && st.sound) { st.audio.resume(); st.audio.seek(st.t, true); }
    });
    window.addEventListener('resize', layout);
    let hideT = 0;
    const stage = $('stage');
    stage.addEventListener('pointermove', () => { stage.classList.remove('idle'); clearTimeout(hideT); hideT = setTimeout(() => stage.classList.add('idle'), 2400); });
  }

  window.FoxPlayer = {
    start(THREE) {
      try {
        const t0 = performance.now();
        st.film = window.FoxFilm(THREE, $('cv'), { shot: SHOT });
        st.initMs = Math.round(performance.now() - t0);
      } catch (err) {
        $('load').classList.add('err');
        $('loadText').textContent = 'Не получилось запустить трёхмерную сцену: браузер не дал WebGL. Попробуйте другой браузер.';
        return;
      }
      window.__foxReady = true;
      layout();
      $('load').classList.add('gone');
      document.body.classList.add('ready');
      if (SHOT) { st.t = S.COVER; st.playing = false; }
      else { st.t = 0; st.playing = true; }
      st.dirty = true;
      ui();
      requestAnimationFrame(loop);
    },
  };
  // тестовый доступ (перемотка из инструмента съёмки)
  window.__film = {
    seek: (t) => { seek(t); return st.t; },
    // перемотка с ожиданием GPU (для съёмки на программном рендере)
    seekSync: (t) => { seek(t); st.film.render(st.t); st.dirty = false; tick(true); const gl = st.film.renderer.getContext(), px = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return st.t; },
    play, pause,
    get t() { return st.t; },
    get playing() { return st.playing; },
    audio: () => (st.audio ? Object.assign({ sound: st.sound, muted: st.audio.muted }, st.audio.stats()) : { sound: st.sound }),
    // отладочный лист кадров: несколько моментов фильма в одной сетке
    sheet(ts) {
      const cv = $('cv'), W = cv.width, H = cv.height;
      let ov = document.getElementById('sheet');
      if (!ov) { ov = document.createElement('canvas'); ov.id = 'sheet'; ov.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:5'; $('frame').appendChild(ov); }
      ov.width = W; ov.height = H;
      const g = ov.getContext('2d');
      const n = ts.length, cols = n <= 1 ? 1 : n <= 4 ? 2 : 3, rows = cols;
      ts.forEach((t, i) => {
        st.film.render(t);
        const x = (i % cols) * W / cols, y = Math.floor(i / cols) * H / rows;
        g.drawImage(cv, x, y, W / cols, H / rows);
        g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(x + 6, y + 6, 64, 22);
        g.fillStyle = '#fff'; g.font = '600 14px sans-serif'; g.fillText(t.toFixed(2), x + 12, y + 22);
      });
      $('caps').style.display = 'none';
      const gl = st.film.renderer.getContext(), px = new Uint8Array(4);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); g.getImageData(0, 0, 1, 1);
      return ts.length;
    },
    lineup(names, t, cam) {
      st.film.lineup(names, t, cam);
      const gl = st.film.renderer.getContext(), px = new Uint8Array(4);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      $('caps').style.display = 'none';
      return names.length;
    },
    bench: (t) => { const a = st.film.bench(t ?? st.t); const b = st.film.bench(t ?? st.t); return { first: a, second: b, init: st.initMs }; },
  };

  buildTimeline(); buildCaptions(); bindTimeline(); bind();
  if (!window.FoxAudio) { $('bSound').disabled = true; }
  layout(); ui();
})();
