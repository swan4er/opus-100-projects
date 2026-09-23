'use strict';
/* ==========================================================================
   Кот-фонарщик · player.js
   Запуск: фактура, выкройки, мир. Часы фильма (от звука, если он включён),
   перемотка, шкала со сценами, клавиши, полный экран, режим съёмки обложки.
   ========================================================================== */

const COVER_T = 15.3;   // самый выразительный кадр для обложки: вспыхнул первый фонарь

const $ = (id) => document.getElementById(id);
const UI = {
  player: $('player'), screen: $('screen'), canvas: $('film'), curtain: $('curtain'), cta: $('cta'), end: $('end'), again: $('again'),
  play: $('play'), playLabel: $('playLabel'), track: $('track'), fill: $('fill'), knob: $('knob'), marks: $('marks'),
  cur: $('cur'), dur: $('dur'), replay: $('replay'), mute: $('mute'), fs: $('fs'), sceneName: $('sceneName'),
};
const SHOT_MODE = !!window.__SHOT__;

/* ---------- часы фильма ---------- */
const Clock = {
  playing: false, t: 0, anchor: 0, useAudio: false,
  now() { return this.useAudio && AudioEng.ctx ? AudioEng.ctx.currentTime - AudioEng.latency() : performance.now() / 1000; },
  time() { return this.playing ? this.t + (this.now() - this.anchor) : this.t; },
  play() {
    if (this.playing) return;
    if (this.t >= DURATION - 0.05) this.t = 0;
    this.playing = true;
    this.resync();
    syncUI();
  },
  /* якорь часов: при звуке — момент, с которого партитура поставлена в очередь */
  resync() {
    if (this.useAudio && AudioEng.ctx) { AudioEng.start(this.t); this.anchor = AudioEng.anchorCtx; }
    else this.anchor = this.now();
  },
  pause() {
    if (!this.playing) return;
    this.t = this.time(); this.playing = false;
    AudioEng.stop();
    syncUI();
  },
  seek(t) {
    this.t = clamp(t, 0, DURATION);
    if (this.playing) this.resync(); else this.anchor = this.now();
    dirty = true;
  },
};

/* ---------- размеры кадра: 16:9 с полями, на телефоне тоже ---------- */
let dirty = true, lastRender = -1, perfScale = 1;
function layout() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const narrow = vw <= 720;
  const gut = narrow ? 12 : 24;
  const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
  let w;
  if (fsEl === UI.player) {
    const barH = $('bar').offsetHeight || 70;
    w = Math.min(vw - 24, (vh - barH - 30) * 16 / 9);
    UI.player.style.setProperty('--fsw', Math.floor(w) + 'px');
  } else {
    const headH = $('head').offsetHeight, barH = $('bar').offsetHeight || 70, footH = narrow ? 0 : ($('foot').offsetHeight || 30);
    const avH = vh - headH - barH - footH - 40 - (narrow ? 64 : 0);
    w = Math.min(vw - gut * 2, Math.max(narrow ? 200 : 480, avH) * 16 / 9, 1680);
    document.documentElement.style.setProperty('--fw', Math.floor(w) + 'px');
  }
  // билет «Смотреть со звуком» на узком экране — под кадром, иначе — в углу кадра
  const wantOutside = narrow && fsEl !== UI.player;
  if (wantOutside && UI.cta.parentElement === UI.screen) { UI.screen.after(UI.cta); UI.cta.classList.add('below'); }
  if (!wantOutside && UI.cta.parentElement !== UI.screen) { UI.screen.appendChild(UI.cta); UI.cta.classList.remove('below'); }
  const cssW = Math.floor(w), cssH = Math.round(cssW * 9 / 16);
  const dpr = SHOT_MODE ? Math.max(1, window.devicePixelRatio || 1) : Math.min(window.devicePixelRatio || 1, 2) * perfScale;
  // потолок 1920 px (было 2400): на ретине кадр чуть мягче, зато памяти под спрайты и работы на кадр на треть меньше
  const pxW = Math.min(1920, Math.round(cssW * dpr));
  R.resize(pxW, Math.round(pxW * 9 / 16));
  dirty = true;
}

/* ---------- предпрохода: какой масштаб нужен каждой выкройке за весь фильм ---------- */
function prepass() {
  const need = Bake.need, first = new Map();
  let curT = 0;
  const note = (id, q) => { if (!(q > 0)) return; const o = need.get(id) || 0; if (q > o) need.set(id, q); if (!first.has(id)) first.set(id, curT); };
  const scan = (S) => {
    const cache = new Map();
    for (const it of S.items) {
      let C = cache.get(it.d);
      if (C === undefined) { C = R.camMat(S.cam, it.d); cache.set(it.d, C); }
      if (!C) continue;
      const M = mMul(C, it.m), d = SPR.get(it.s);
      if (!d || (it.a !== undefined && it.a <= 0.004)) continue;
      // только то, что действительно попадает в кадр
      const bb = Bake.bounds(d);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let k = 0; k < 4; k++) {
        const px = k & 1 ? bb[2] : bb[0], py = k & 2 ? bb[3] : bb[1];
        const X = M[0] * px + M[2] * py + M[4], Y = M[1] * px + M[3] * py + M[5];
        if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y;
      }
      if (x1 < 0 || y1 < 0 || x0 > FRAME_W || y0 > FRAME_H) continue;
      note(it.s, Math.sqrt(Math.abs(M[0] * M[3] - M[1] * M[2])));
    }
    if (S.sky) for (const st of S.sky.stars) note(st.s, st.k * (S.cam.zoom || 1));
    note('sky.dusk', S.cam.zoom || 1); note('sky.night', S.cam.zoom || 1);
    for (const it of S.screen) note(it.s, Math.sqrt(Math.abs(it.m[0] * it.m[3] - it.m[1] * it.m[2])));
  };
  for (let T = 0; T < DURATION; T += 0.5) {
    curT = T;
    const S = Film.frame(T);
    scan(S);
    if (S.dissolve) scan(S.dissolve.scene);
  }
  if (!SHOT_MODE) Bake.queue = [...first.entries()].sort((a, b) => a[1] - b[1]).map((e) => e[0]);
}

/* ---------- интерфейс ---------- */
const fmt = (t) => { t = Math.max(0, Math.floor(t + 1e-4)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
function sceneAt(t) { let s = SCENES[0]; for (const q of SCENES) if (t >= q.t) s = q; return s; }
function buildMarks() {
  UI.marks.innerHTML = '';
  for (const s of SCENES) {
    const li = document.createElement('li');
    li.style.left = (s.t / DURATION) * 100 + '%';
    const sp = document.createElement('span'); sp.textContent = s.name;
    li.appendChild(sp);
    UI.marks.appendChild(li);
  }
  UI.dur.textContent = fmt(DURATION);
  UI.track.setAttribute('aria-valuemax', String(DURATION));
}
let shownSec = -1, shownScene = null;
function syncUI(t = Clock.time()) {
  const k = clamp(t / DURATION, 0, 1);
  UI.fill.style.transform = `scaleX(${k})`;
  UI.knob.style.transform = `translateX(${k * UI.track.clientWidth}px)`;
  const sec = Math.floor(t);
  if (sec !== shownSec) {
    shownSec = sec;
    UI.cur.textContent = fmt(t);
    const sc = sceneAt(t);
    UI.track.setAttribute('aria-valuenow', String(sec));
    UI.track.setAttribute('aria-valuetext', `${fmt(t)}, ${sc.name}`);
    if (sc !== shownScene) {
      shownScene = sc;
      UI.sceneName.textContent = sc.name;
      [...UI.marks.children].forEach((li, i) => li.classList.toggle('on', SCENES[i] === sc));
    }
  }
  const p = Clock.playing;
  UI.player.classList.toggle('paused', !p);
  UI.playLabel.textContent = p ? 'Пауза' : (t >= DURATION - 0.05 ? 'Сначала' : 'Смотреть');
  UI.play.setAttribute('aria-label', p ? 'Пауза' : 'Смотреть');
  UI.end.hidden = !(t >= DURATION - 0.05 && !p);
}
function togglePlay() { if (Clock.playing) Clock.pause(); else Clock.play(); }
/* билет «Смотреть со звуком» больше не нужен: прячем и убираем из фокуса,
   иначе пробел снова «нажал» бы невидимую кнопку и перезапустил фильм */
function hideCta() {
  UI.cta.classList.add('hide');
  UI.cta.setAttribute('tabindex', '-1'); UI.cta.setAttribute('aria-hidden', 'true');
  if (document.activeElement === UI.cta) UI.cta.blur();
}
function watchWithSound() {
  AudioEng.enable();
  Clock.useAudio = !!AudioEng.ctx;
  AudioEng.setMuted(false);
  UI.mute.setAttribute('aria-pressed', 'true'); UI.mute.setAttribute('aria-label', 'Выключить звук');
  hideCta();
  Clock.playing = false; Clock.t = 0;
  Clock.play();
  // если браузер так и не запустил звук — часы идут по обычному таймеру
  setTimeout(() => {
    if (Clock.useAudio && AudioEng.ctx && AudioEng.ctx.state !== 'running') {
      const t = Clock.time(); Clock.useAudio = false; Clock.t = t; Clock.anchor = Clock.now();
    }
  }, 700);
}
function toggleMute() {
  if (!AudioEng.ctx) {
    AudioEng.enable();
    if (!AudioEng.ctx) return;
    const t = Clock.time(), was = Clock.playing;
    Clock.playing = false; Clock.t = t; Clock.useAudio = true;
    AudioEng.setMuted(false);
    if (was) Clock.play();
    hideCta();
  } else {
    AudioEng.setMuted(!AudioEng.muted);
  }
  const on = !AudioEng.muted;
  UI.mute.setAttribute('aria-pressed', String(on));
  UI.mute.setAttribute('aria-label', on ? 'Выключить звук' : 'Включить звук');
}
function toggleFS() {
  const el = UI.player, fsEl = document.fullscreenElement || document.webkitFullscreenElement;
  try {
    if (fsEl) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
  } catch (e) { /* полноэкранный режим недоступен — остаёмся в окне */ }
}
function trackSeek(clientX) {
  const r = UI.track.getBoundingClientRect();
  Clock.seek(clamp((clientX - r.left) / r.width, 0, 1) * DURATION);
  syncUI();
}
function bindUI() {
  UI.play.addEventListener('click', togglePlay);
  UI.cta.addEventListener('click', watchWithSound);
  UI.again.addEventListener('click', () => { Clock.seek(0); Clock.play(); });
  UI.replay.addEventListener('click', () => { Clock.seek(0); Clock.play(); });
  UI.mute.addEventListener('click', toggleMute);
  UI.fs.addEventListener('click', toggleFS);
  UI.canvas.addEventListener('click', togglePlay);
  let dragging = false, wasPlaying = false;
  UI.track.addEventListener('pointerdown', (e) => {
    dragging = true; wasPlaying = Clock.playing;
    if (wasPlaying) Clock.pause();
    UI.track.classList.add('drag');
    UI.track.setPointerCapture(e.pointerId);
    trackSeek(e.clientX);
  });
  UI.track.addEventListener('pointermove', (e) => { if (dragging) trackSeek(e.clientX); });
  const endDrag = () => { if (!dragging) return; dragging = false; UI.track.classList.remove('drag'); if (wasPlaying) Clock.play(); };
  UI.track.addEventListener('pointerup', endDrag);
  UI.track.addEventListener('pointercancel', endDrag);
  UI.track.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); Clock.seek(Clock.time() + (e.key === 'ArrowLeft' ? -5 : 5)); syncUI(); }
    if (e.key === 'Home') { e.preventDefault(); Clock.seek(0); syncUI(); }
    if (e.key === 'End') { e.preventDefault(); Clock.seek(DURATION); syncUI(); }
  });
  window.addEventListener('keydown', (e) => {
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.code === 'Space') {
      // как в видеоплеерах: пробел — всегда пауза/продолжить; кнопку в фокусе нажимает Enter
      if (e.target === UI.play) return;          // у самой кнопки «Смотреть/Пауза» — родной клик
      e.preventDefault(); if (!e.repeat) togglePlay();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      if (e.target === UI.track) return;
      e.preventDefault(); Clock.seek(Clock.time() + (e.key === 'ArrowLeft' ? -5 : 5)); syncUI();
    } else if (e.key === 'f' || e.key === 'F' || e.key === 'а' || e.key === 'А') toggleFS();
    else if (e.key === 'm' || e.key === 'M' || e.key === 'ь' || e.key === 'Ь') toggleMute();
  });
  let resizeT = 0;
  window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(layout, 80); });
  document.addEventListener('fullscreenchange', () => setTimeout(layout, 30));
  document.addEventListener('webkitfullscreenchange', () => setTimeout(layout, 30));
  let resumeOnShow = false;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { resumeOnShow = Clock.playing; Clock.pause(); }
    else if (resumeOnShow) { resumeOnShow = false; Clock.play(); }
  });
}

/* ---------- цикл ---------- */
let frameAvg = 16, slowFrames = 0;
function loop() {
  if (!document.hidden) {
    let t = Clock.time();
    if (Clock.playing && t >= DURATION) { Clock.t = DURATION; Clock.playing = false; AudioEng.stop(0.5); t = DURATION; }
    if (Clock.playing) AudioEng.update(t);
    if (dirty || Clock.playing || t !== lastRender) {
      const t0 = performance.now();
      R.render(Math.min(t, DURATION - 0.001));
      lastRender = t; dirty = false;
      const dt = performance.now() - t0;
      frameAvg = frameAvg * 0.92 + dt * 0.08;
      if (!SHOT_MODE && Clock.playing && frameAvg > 26 && perfScale > 0.6) {
        if (++slowFrames > 40) { perfScale *= 0.85; slowFrames = 0; frameAvg = 16; layout(); }
      } else slowFrames = 0;
      syncUI(t);
    }
    Bake.idle(Clock.playing ? 3 : 8);
  }
  requestAnimationFrame(loop);
}

/* ---------- запуск ---------- */
function boot() {
  const tb = performance.now(), mk = [];
  const mark = (n) => mk.push(n + ':' + Math.round(performance.now() - tb));
  makeTextures(); mark('tex');
  lampParts(); skyParts(); farParts(); litWindows(); titleParts(); skyStrips(); dormerParts();
  catParts(); seaParts(); harborParts(); boatFarParts();
  moonParts(); glintParts(); mouseParts(); catFaceParts(); cardParts(); seaProps(); mark('defs');
  buildWorld(); mark('world');
  layoutTitle(); mark('title');
  R.init(UI.canvas);
  buildMarks();
  bindUI(); mark('ui');
  layout(); mark('layout');
  const tp = performance.now();
  prepass();
  const tq = performance.now();
  if (SHOT_MODE) { Clock.t = COVER_T; Clock.playing = false; }
  else { Clock.t = 0; Clock.play(); }
  window.film = {
    seek(t) { Clock.seek(t); R.render(Math.min(Clock.time(), DURATION - 0.001)); lastRender = Clock.time(); syncUI(); return Clock.time(); },
    play() { Clock.play(); }, pause() { Clock.pause(); },
    get t() { return Clock.time(); }, duration: DURATION,
    /* контактный лист для проверки: сетка кадров в одном снимке */
    sheet(times, cols = 3, pw = 560) {
      const t0 = performance.now();
      const vw = window.innerWidth, vh = window.innerHeight, rows = Math.ceil(times.length / cols);
      let ov = document.getElementById('sheet');
      if (!ov) { ov = document.createElement('canvas'); ov.id = 'sheet'; ov.style.cssText = 'position:fixed;inset:0;z-index:99;width:100vw;height:100vh;background:#0c0a10'; document.body.appendChild(ov); }
      ov.width = vw; ov.height = vh;
      const x = ov.getContext('2d'), cw = vw / cols, ch = Math.min(vh / rows, cw * 9 / 16);
      x.fillStyle = '#0c0a10'; x.fillRect(0, 0, vw, vh);
      const W0 = R.W, H0 = R.H, dn0 = Bake.density;
      R.resize(pw, Math.round(pw * 9 / 16)); Bake.density = R.dens; Bake.pending = [];
      const saved = new Map(Bake.cache); Bake.cache.clear();
      const ms = [];
      times.forEach((t, i) => {
        const a = performance.now();
        R.render(Math.min(t, DURATION - 0.001));
        ms.push(Math.round(performance.now() - a));
        const cx = (i % cols) * cw, cy = Math.floor(i / cols) * ch;
        x.drawImage(R.cv, cx + 2, cy + 2, cw - 4, ch - 4);
        x.fillStyle = 'rgba(0,0,0,0.6)'; x.fillRect(cx + 2, cy + 2, 70, 20);
        x.fillStyle = '#fff'; x.font = '13px monospace'; x.fillText(t.toFixed(2), cx + 8, cy + 16);
      });
      x.getImageData(0, 0, 1, 1);
      const st = Bake.stats();
      Bake.cache = saved; R.resize(W0, H0); Bake.density = dn0; Bake.pending = [];
      return (Math.round(performance.now() - t0)) + ' ms; кадры ' + ms.join(',') + '; лист ' + st + '; загрузка ' + JSON.stringify(window.__timing || {});
    },
  };
  R.render(Math.min(Clock.time(), DURATION - 0.001));
  if (SHOT_MODE) R.ctx.getImageData(0, 0, 1, 1);
  window.__timing = { setup: Math.round(tp - tb), parts: mk.join(' '), prepass: Math.round(tq - tp), first: Math.round(performance.now() - tq), sprites: Bake.cache.size, mem: Bake.stats() };
  lastRender = Clock.time();
  syncUI();
  UI.curtain.classList.add('gone');
  requestAnimationFrame(loop);
  // шрифт титра приходит позже — переложить буквы и перепечь их
  if (document.fonts && document.fonts.load) {
    document.fonts.load(`118px ${FONT_TITLE}`).then(() => {
      layoutTitle();
      for (let i = 0; i < TITLE.length; i++) { Bake.cache.delete('title.' + i); const d = SPR.get('title.' + i); if (d) d._bb = null; }
      if (Clock.time() < 8) dirty = true;   // буквы видны только в первом плане
    }).catch(() => {});
  }
}
try { boot(); } catch (e) {
  UI.curtain.textContent = 'Ошибка: ' + e.message;
  throw e;
}
