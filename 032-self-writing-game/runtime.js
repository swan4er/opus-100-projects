/* ================================================================
   032 · Игра, которая пишет себя — движок песочницы.

   SANDBOX_RUNTIME страница НИКОГДА не вызывает сама: функция превращается в текст
   и уезжает в <iframe sandbox="allow-scripts" srcdoc="…"> вместе с кодом игры.
   Внутри iframe нет доступа ни к странице, ни к ключу: другой источник (origin null),
   плюс CSP без сети. Наружу — только postMessage: ошибки, автотест, миниатюра, счёт.
   ================================================================ */
(function (root) {
  'use strict';

  function SANDBOX_RUNTIME(CFG, GAME_SRC) {
    'use strict';
    const W = 960, H = 600;
    const post = (m) => { try { m.token = CFG.token; parent.postMessage(m, '*'); } catch (e) { /* родителя нет */ } };

    // ---------- холст: логические 960×600, реальные пиксели по размеру окна ----------
    const cv = document.getElementById('c');
    let ops = 0, drawOps = 99;
    const fakeCanvas = { width: W, height: H, style: {}, addEventListener() {}, removeEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: W, height: H }) };
    // Обёртка контекста: игра рисует в логических 960×600, а мы подставляем масштаб,
    // тряску, защиту от отрицательных радиусов и считаем реальные закраски.
    function makeSurface(canvas, opts) {
      const c = canvas.getContext('2d', opts);
      const S = { c, k: 1, sx: 0, sy: 0 };
      const rawSet = c.setTransform.bind(c), rawGet = c.getTransform.bind(c);
      S.raw = rawSet;
      S.base = () => rawSet(S.k, 0, 0, S.k, S.sx * S.k, S.sy * S.k);
      c.setTransform = function (a, b, cc, d, e, f) {
        if (a && typeof a === 'object') { const m = a; a = m.a; b = m.b; cc = m.c; d = m.d; e = m.e; f = m.f; }
        rawSet(a * S.k, b * S.k, cc * S.k, d * S.k, (e || 0) * S.k + S.sx * S.k, (f || 0) * S.k + S.sy * S.k);
      };
      c.resetTransform = S.base;
      c.getTransform = function () {
        const m = rawGet();
        return new DOMMatrix([m.a / S.k, m.b / S.k, m.c / S.k, m.d / S.k, (m.e - S.sx * S.k) / S.k, (m.f - S.sy * S.k) / S.k]);
      };
      // отрицательный радиус — частая причина падений; круг просто исчезает
      const rawArc = c.arc.bind(c), rawEll = c.ellipse.bind(c);
      c.arc = (x, y, r, a0, a1, ccw) => rawArc(x, y, r > 0 ? r : 0, a0, a1, ccw);
      c.ellipse = (x, y, rx, ry, rot, a0, a1, ccw) => rawEll(x, y, rx > 0 ? rx : 0, ry > 0 ? ry : 0, rot, a0, a1, ccw);
      for (const m of ['fill', 'stroke', 'fillRect', 'strokeRect', 'fillText', 'strokeText', 'drawImage', 'putImageData']) {
        const raw = c[m].bind(c);
        c[m] = function () { ops++; return raw.apply(null, arguments); };
      }
      try { Object.defineProperty(c, 'canvas', { value: fakeCanvas }); } catch (e) { /* не страшно */ }
      return S;
    }
    const main = makeSurface(cv);
    const ctx = main.c;
    fakeCanvas.getContext = () => ctx;
    // автотест рисует в маленький программный холст: не нагружает видеокарту
    // и не создаёт очередь кадров перед настоящим стартом
    const tcv = document.createElement('canvas'); tcv.width = 320; tcv.height = 200;
    const test = makeSurface(tcv, { willReadFrequently: true });
    test.k = 320 / W;
    function resize() {
      const vw = innerWidth || W, vh = innerHeight || H;
      const s = Math.min(vw / W, vh / H);
      // без щелей по краям: размер округляем вверх, лишний пиксель уходит за край
      const cw = Math.max(1, Math.ceil(W * s)), ch = Math.max(1, Math.ceil(H * s));
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.style.width = cw + 'px'; cv.style.height = ch + 'px';
      cv.style.left = Math.round((vw - cw) / 2) + 'px'; cv.style.top = Math.round((vh - ch) / 2) + 'px';
      cv.width = Math.max(1, Math.round(cw * dpr)); cv.height = Math.max(1, Math.round(ch * dpr));
      main.k = cv.width / W;
    }
    const base = main.base;

    // ---------- ввод ----------
    const GROUPS = {
      left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'],
      fire: ['Space', 'KeyX', 'KeyJ', 'Enter'], shoot: ['Space', 'KeyX', 'KeyJ', 'Enter'], action: ['Space', 'KeyX', 'Enter'],
      jump: ['Space', 'ArrowUp', 'KeyW', 'KeyZ', 'KeyK'], space: ['Space'], enter: ['Enter'], escape: ['Escape'], esc: ['Escape'],
      shift: ['ShiftLeft', 'ShiftRight'], ctrl: ['ControlLeft', 'ControlRight'], tab: ['Tab'],
    };
    const codeCache = new Map();
    function codesFor(name) {
      if (codeCache.has(name)) return codeCache.get(name);
      const n = String(name), low = n.toLowerCase();
      let r;
      if (GROUPS[low]) r = GROUPS[low];
      else if (n === ' ') r = ['Space'];
      else if (/^[a-z]$/i.test(n)) r = ['Key' + n.toUpperCase()];
      else if (/^[0-9]$/.test(n)) r = ['Digit' + n];
      else if (/^arrow(left|right|up|down)$/i.test(n)) r = ['Arrow' + n[5].toUpperCase() + n.slice(6).toLowerCase()];
      else r = [n];
      codeCache.set(name, r);
      return r;
    }
    const held = new Set();
    let pressedQueue = new Set(), pressedFrame = new Set();
    const key = (n) => { const c = codesFor(n); for (let i = 0; i < c.length; i++) if (held.has(c[i])) return true; return false; };
    const tap = (n) => { const c = codesFor(n); for (let i = 0; i < c.length; i++) if (pressedFrame.has(c[i])) return true; return false; };
    const input = { dx: 0, dy: 0 };
    const pointer = { x: W / 2, y: H / 2, down: false, tapped: false, released: false };
    let tapQueue = false, releaseQueue = false, userTouched = false;
    const keys = new Proxy({}, { get: (t, p) => (typeof p === 'string' ? key(p) : undefined) });
    const PREVENT = new Set(['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);

    function onKeyDown(e) {
      if (!e.code) return;
      if (PREVENT.has(e.code) && e.cancelable) e.preventDefault();
      if (e.isTrusted) unlockAudio();
      if (!held.has(e.code)) pressedQueue.add(e.code);
      held.add(e.code);
      if (!e.repeat) { noteUser(); tryRestart(); }
    }
    function onKeyUp(e) { if (e.code) held.delete(e.code); }
    addEventListener('keydown', onKeyDown, true);
    addEventListener('keyup', onKeyUp, true);
    addEventListener('blur', () => held.clear());
    function toGame(e) {
      const r = cv.getBoundingClientRect();
      if (!r.width) return;
      pointer.x = (e.clientX - r.left) / r.width * W;
      pointer.y = (e.clientY - r.top) / r.height * H;
    }
    addEventListener('pointerdown', (e) => {
      toGame(e); pointer.down = true; tapQueue = true;
      if (e.isTrusted) unlockAudio();
      noteUser(); tryRestart();
      post({ type: 'focus' });
    });
    addEventListener('pointermove', toGame);
    addEventListener('pointerup', (e) => { toGame(e); pointer.down = false; releaseQueue = true; });
    addEventListener('pointercancel', () => { pointer.down = false; });
    addEventListener('contextmenu', (e) => e.preventDefault());

    function beginInputFrame() {
      pressedFrame = pressedQueue; pressedQueue = new Set();
      pointer.tapped = tapQueue; pointer.released = releaseQueue; tapQueue = false; releaseQueue = false;
      input.dx = (key('right') ? 1 : 0) - (key('left') ? 1 : 0);
      input.dy = (key('down') ? 1 : 0) - (key('up') ? 1 : 0);
    }
    function noteUser() {
      if (!userTouched && !testing) { userTouched = true; window.autoplay = false; post({ type: 'touched' }); }
    }

    // ---------- звук: маленький синтезатор, включается жестом внутри игры ----------
    let actx = null, master = null, noiseBuf = null, soundOn = CFG.sound !== false;
    const lastPlay = {};
    function unlockAudio() {
      if (!soundOn) return;
      try {
        if (!actx) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return;
          actx = new AC();
          master = actx.createGain(); master.gain.value = 0.2; master.connect(actx.destination);
          noiseBuf = actx.createBuffer(1, actx.sampleRate * 0.6, actx.sampleRate);
          const d = noiseBuf.getChannelData(0);
          for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        }
        if (actx.state === 'suspended') actx.resume();
      } catch (e) { actx = null; }
    }
    function tone(t, f0, f1, dur, type, vol) {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, t);
      if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
    }
    function noise(t, dur, cutoff, vol) {
      const s = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
      s.buffer = noiseBuf; f.type = 'lowpass'; f.frequency.setValueAtTime(cutoff, t);
      f.frequency.exponentialRampToValueAtTime(80, t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.02);
    }
    function sound(name) {
      if (!soundOn || testing || !actx || actx.state !== 'running') return;
      const t = actx.currentTime;
      if (lastPlay[name] && t - lastPlay[name] < 0.05) return;
      lastPlay[name] = t;
      switch (String(name)) {
        case 'coin': tone(t, 988, 988, 0.07, 'square', 0.12); tone(t + 0.06, 1319, 1319, 0.16, 'triangle', 0.18); break;
        case 'hit': noise(t, 0.2, 1400, 0.4); tone(t, 180, 70, 0.18, 'square', 0.12); break;
        case 'jump': tone(t, 300, 700, 0.16, 'triangle', 0.3); break;
        case 'shoot': tone(t, 1100, 260, 0.1, 'square', 0.08); break;
        case 'boom': noise(t, 0.6, 700, 0.6); tone(t, 110, 38, 0.45, 'sine', 0.5); break;
        case 'power': [523, 659, 784, 1047].forEach((f, i) => tone(t + i * 0.06, f, f, 0.12, 'triangle', 0.22)); break;
        case 'lose': [392, 311, 262, 196].forEach((f, i) => tone(t + i * 0.13, f, f * 0.98, 0.2, 'triangle', 0.24)); break;
        case 'win': [523, 659, 784, 1047, 1319].forEach((f, i) => tone(t + i * 0.08, f, f, 0.2, 'triangle', 0.22)); break;
        default: tone(t, 660, 660, 0.06, 'square', 0.08);
      }
    }

    // ---------- частицы, надписи, тряска ----------
    const parts = [], floats = [];
    let shakePow = 0;
    function burst(x, y, color, n) {
      n = Math.min(80, Math.max(1, n == null ? 14 : n | 0));
      for (let i = 0; i < n && parts.length < 700; i++) {
        const a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 260;
        parts.push({ x: +x || 0, y: +y || 0, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, life: 0.5 + Math.random() * 0.5, age: 0, c: color || '#fff', s: 2 + Math.random() * 4 });
      }
    }
    function floatText(x, y, str, color) { if (floats.length < 60) floats.push({ x: +x || 0, y: +y || 0, t: String(str), c: color || '#fff', age: 0 }); }
    function shake(p) { shakePow = Math.max(shakePow, Math.min(24, +p || 6)); }
    function stepFx(dt) {
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]; p.age += dt;
        if (p.age >= p.life) { parts.splice(i, 1); continue; }
        p.vy += 420 * dt; p.vx *= 1 - 1.6 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      }
      for (let i = floats.length - 1; i >= 0; i--) { const f = floats[i]; f.age += dt; f.y -= 50 * dt; if (f.age > 1) floats.splice(i, 1); }
      shakePow = Math.max(0, shakePow - dt * 40);
    }
    function drawFx() {
      for (const p of parts) {
        const a = 1 - p.age / p.life;
        ctx.globalAlpha = a; ctx.fillStyle = p.c;
        ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s * (0.6 + a * 0.4), p.s * (0.6 + a * 0.4));
      }
      ctx.globalAlpha = 1;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const f of floats) {
        const a = Math.min(1, 2.2 * (1 - f.age));
        ctx.globalAlpha = a;
        ctx.font = '700 24px system-ui, -apple-system, "Segoe UI", sans-serif';
        ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.strokeText(f.t, f.x, f.y);
        ctx.fillStyle = f.c; ctx.fillText(f.t, f.x, f.y);
      }
      ctx.globalAlpha = 1;
    }

    // ---------- математика и рисование ----------
    const rand = (a, b) => (b === undefined ? Math.random() * (a === undefined ? 1 : a) : a + Math.random() * (b - a));
    const randi = (a, b) => Math.floor(rand(a, b + 1));
    const pick = (arr) => (arr && arr.length ? arr[Math.floor(Math.random() * arr.length)] : undefined);
    const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
    const lerp = (a, b, t) => a + (b - a) * t;
    const dist = (x1, y1, x2, y2) => (typeof x1 === 'object' ? Math.hypot(y1.x - x1.x, y1.y - x1.y) : Math.hypot(x2 - x1, y2 - y1));
    const angle = (x1, y1, x2, y2) => (typeof x1 === 'object' ? Math.atan2(y1.y - x1.y, y1.x - x1.x) : Math.atan2(y2 - y1, x2 - x1));
    const hitRect = (a, b) => !!a && !!b && a.x < b.x + (b.w ?? b.width ?? 0) && a.x + (a.w ?? a.width ?? 0) > b.x && a.y < b.y + (b.h ?? b.height ?? 0) && a.y + (a.h ?? a.height ?? 0) > b.y;
    const hitCircle = (a, b) => !!a && !!b && Math.hypot(a.x - b.x, a.y - b.y) < (a.r ?? a.radius ?? 0) + (b.r ?? b.radius ?? 0);
    function circle(c, x, y, r, color) { c.beginPath(); c.arc(x, y, Math.max(0, r), 0, Math.PI * 2); c.fillStyle = color || '#fff'; c.fill(); }
    function rect(c, x, y, w, h, color) { c.fillStyle = color || '#fff'; c.fillRect(x, y, w, h); }
    function text(c, str, x, y, size, color, align) {
      c.font = '700 ' + (size || 24) + 'px system-ui, -apple-system, "Segoe UI", sans-serif';
      c.textAlign = align || 'center'; c.textBaseline = 'middle'; c.fillStyle = color || '#fff';
      c.fillText(String(str), x, y);
    }

    // ---------- состояние партии ----------
    let state = 'boot', endText = '', endAt = 0, _T = 0, _score = 0, _lives = null, best = +CFG.best || 0;
    let testing = false, crashed = null, crashNote = CFG.crashNote || 'нейросеть чинит код…', paused = false;
    let readScore = () => _score, writeScore = (v) => { _score = v; }, readLives = () => _lives, writeLives = (v) => { _lives = v; };
    Object.defineProperty(window, 'score', { get: () => _score, set: (v) => { _score = +v || 0; }, configurable: true });
    Object.defineProperty(window, 'lives', { get: () => _lives, set: (v) => { _lives = v == null ? null : +v; }, configurable: true });
    Object.defineProperty(window, 'T', { get: () => _T, set: (v) => { _T = +v || 0; }, configurable: true });

    function addScore(n) { writeScore((+readScore() || 0) + (+n || 0)); }
    // где и почему кончилась партия — пригодится, если она кончается сразу после старта
    let endInfo = null;
    function noteEnd(kind, auto) {
      const m = String(new Error().stack || '').match(/game\.js:(\d+):\d+/);
      endInfo = { kind, auto: !!auto, t: _T, line: m ? +m[1] : 0, lives: auto ? readLives() : null };
    }
    function gameOver(msg, auto) {
      if (state !== 'play') return;
      noteEnd('gameOver', auto);
      state = 'over'; endText = msg ? String(msg) : ''; endAt = performance.now();
      const s = +readScore() || 0;
      if (!testing) { best = Math.max(best, s); sound('lose'); post({ type: 'over', score: s, best }); }
    }
    function win(msg) {
      if (state !== 'play') return;
      noteEnd('win');
      state = 'won'; endText = msg ? String(msg) : ''; endAt = performance.now();
      const s = +readScore() || 0;
      if (!testing) { best = Math.max(best, s); sound('win'); post({ type: 'over', won: true, score: s, best }); }
    }
    function restart() {
      parts.length = 0; floats.length = 0; shakePow = 0; _T = 0;
      try { writeScore(0); writeLives(null); } catch (e) { /* игра объявила свои const */ }
      state = 'play';
      loopGuard = 0;
      try { window.init(); } catch (e) { crash(e, 'init'); }
    }
    function tryRestart() {
      if ((state === 'over' || state === 'won') && performance.now() - endAt > 650) restart();
    }

    // ---------- защита от бесконечных циклов: счётчик в начале тела каждого цикла ----------
    let loopGuard = 0;
    window.__lg = function () {
      if (++loopGuard > 3000000) { loopGuard = 0; throw new Error('Похоже на бесконечный цикл: больше 3 млн шагов за один кадр'); }
    };
    function guardLoops(src) {
      const re = /\b(?:for|while)\s*\(|\bdo\s*\{/g;
      let out = '', i = 0, m;
      while ((m = re.exec(src))) {
        if (m[0][0] === 'd') { out += src.slice(i, re.lastIndex) + '__lg();'; i = re.lastIndex; continue; }
        let j = re.lastIndex, depth = 1;
        while (j < src.length && depth) { const c = src[j]; if (c === '(') depth++; else if (c === ')') depth--; j++; }
        let q = j; while (q < src.length && (src[q] === ' ' || src[q] === '\t' || src[q] === '\n' || src[q] === '\r')) q++;
        if (src[q] === '{') { out += src.slice(i, q + 1) + '__lg();'; i = q + 1; re.lastIndex = q + 1; }
      }
      return out + src.slice(i);
    }

    // ---------- ошибки ----------
    function errInfo(e, phase) {
      const stack = String((e && e.stack) || '');
      const m = stack.match(/game\.js:(\d+):(\d+)/);
      let message = e && e.message !== undefined ? (e.name && e.name !== 'Error' ? e.name + ': ' : '') + e.message : String(e);
      message = message.replace(/Failed to execute '[^']+' on '[^']+': /, '');
      return {
        phase, message: message.slice(0, 400), line: m ? +m[1] : 0, col: m ? +m[2] : 0,
        stack: stack.split('\n').slice(0, 5).map((s) => s.replace(/about:srcdoc:\d+:\d+/g, 'движок')).join('\n').slice(0, 700),
      };
    }
    function crash(e, phase, extra) {
      if (crashed) return;
      crashed = Object.assign(errInfo(e, phase), extra || {});
      state = 'crashed';
      post(Object.assign({ type: 'error' }, crashed));
    }
    let loading = false, loadErr = null;
    window.onerror = function (msg, src, line, col, err) {
      if (loading) {
        if (!loadErr) {
          loadErr = err ? errInfo(err, 'load') : { phase: 'load', message: String(msg).replace(/^Uncaught /, '').replace(/Failed to execute '[^']+' on '[^']+': /, ''), line: 0, col: 0, stack: '' };
          loadErr.src = String(src || '').slice(0, 40); loadErr.rawLine = line;
          if (!loadErr.line && line) { loadErr.line = line; loadErr.col = col; }
        }
      } else crash(err || { message: String(msg) }, 'async');
      return true;
    };
    window.addEventListener('unhandledrejection', (ev) => { ev.preventDefault(); crash(ev.reason || { message: 'Promise отклонён' }, 'async'); });
    // console игры — в живой лог страницы
    let consoleBudget = 30;
    setInterval(() => { consoleBudget = 30; }, 1000);
    for (const lvl of ['log', 'info', 'warn', 'error']) {
      console[lvl] = function () {
        if (testing || consoleBudget-- <= 0) return;
        let s = '';
        try { s = Array.from(arguments).map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '); } catch (e) { s = String(arguments[0]); }
        post({ type: 'console', level: lvl, text: s.slice(0, 200) });
      };
    }

    // ---------- HUD и экраны ----------
    const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    const fmt = (n) => Math.round(+n || 0).toLocaleString('ru-RU');
    function roundRect(x, y, w, h, r) {
      ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    }
    function heart(x, y, s, fill) {
      ctx.beginPath();
      ctx.moveTo(x, y + s * 0.35);
      ctx.bezierCurveTo(x, y - s * 0.1, x - s * 0.62, y - s * 0.1, x - s * 0.62, y + s * 0.3);
      ctx.bezierCurveTo(x - s * 0.62, y + s * 0.62, x - s * 0.2, y + s * 0.8, x, y + s);
      ctx.bezierCurveTo(x + s * 0.2, y + s * 0.8, x + s * 0.62, y + s * 0.62, x + s * 0.62, y + s * 0.3);
      ctx.bezierCurveTo(x + s * 0.62, y - s * 0.1, x, y - s * 0.1, x, y + s * 0.35);
      ctx.fillStyle = fill; ctx.fill();
    }
    function drawHud() {
      const s = +readScore() || 0;
      ctx.font = '800 30px ' + FONT;
      const label = fmt(s);
      const w = Math.max(96, ctx.measureText(label).width + 36);
      ctx.fillStyle = 'rgba(12,10,8,.42)'; roundRect(14, 14, w, 58, 12); ctx.fill();
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#fff6e6'; ctx.fillText(label, 32, 50);
      ctx.font = '600 13px ' + FONT; ctx.fillStyle = 'rgba(255,246,230,.72)';
      ctx.fillText('рекорд ' + fmt(Math.max(best, s)), 32, 66);
      const L = readLives();
      if (typeof L === 'number' && isFinite(L) && L > 0) {
        const n = Math.min(10, Math.ceil(L));
        const bw = n * 30 + 20;
        ctx.fillStyle = 'rgba(12,10,8,.42)'; roundRect(W - 14 - bw, 14, bw, 44, 12); ctx.fill();
        for (let i = 0; i < n; i++) heart(W - 14 - bw + 25 + i * 30, 24, 22, '#ff5d4f');
      }
    }
    function drawOverlay(now) {
      if (state === 'over' || state === 'won') {
        const a = Math.min(1, (now - endAt) / 350);
        ctx.fillStyle = 'rgba(10,8,6,' + (0.6 * a) + ')'; ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = state === 'won' ? '#ffd76a' : '#fff6e6';
        ctx.font = '900 64px ' + FONT; ctx.fillText(state === 'won' ? 'Победа!' : 'Игра окончена', W / 2, H / 2 - 60);
        if (endText) { ctx.font = '600 24px ' + FONT; ctx.fillStyle = 'rgba(255,246,230,.86)'; ctx.fillText(endText.slice(0, 60), W / 2, H / 2); }
        ctx.font = '700 22px ' + FONT; ctx.fillStyle = '#fff6e6';
        ctx.fillText('счёт ' + fmt(readScore()) + '   ·   рекорд ' + fmt(best), W / 2, H / 2 + 46);
        if (now - endAt > 650) {
          ctx.globalAlpha = a * (0.55 + 0.45 * Math.sin(now / 260));
          ctx.font = '600 18px ' + FONT; ctx.fillText('любая клавиша или касание — заново', W / 2, H / 2 + 96);
        }
        ctx.globalAlpha = 1;
      } else if (state === 'crashed' && crashed) {
        ctx.fillStyle = 'rgba(22,6,4,.78)'; ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = 'rgba(255,107,61,.22)'; ctx.lineWidth = 18;
        for (let x = -H; x < W; x += 60) { ctx.beginPath(); ctx.moveTo(x + (now / 40) % 60, 0); ctx.lineTo(x + H + (now / 40) % 60, H); ctx.stroke(); }
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ff8a5c'; ctx.font = '900 44px ' + FONT;
        ctx.fillText('Код упал' + (crashed.line ? ' в строке ' + crashed.line : ''), W / 2, H / 2 - 50);
        ctx.fillStyle = '#ffe9dc'; ctx.font = '600 20px ui-monospace, Menlo, Consolas, monospace';
        const msg = crashed.message.length > 70 ? crashed.message.slice(0, 68) + '…' : crashed.message;
        ctx.fillText(msg, W / 2, H / 2 + 4);
        ctx.fillStyle = 'rgba(255,233,220,.8)'; ctx.font = '600 20px ' + FONT;
        ctx.globalAlpha = 0.6 + 0.4 * Math.sin(now / 220);
        ctx.fillText(crashNote, W / 2, H / 2 + 56);
        ctx.globalAlpha = 1;
      }
    }

    // ---------- кадр ----------
    function clearAll(S) {
      S = S || main;
      const c = S.c;
      S.raw(1, 0, 0, 1, 0, 0);
      c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.shadowBlur = 0; c.shadowColor = 'transparent';
      c.fillStyle = CFG.bg || '#111'; c.fillRect(0, 0, S === main ? cv.width : tcv.width, S === main ? cv.height : tcv.height);
    }
    function drawGame(S) {
      S = S || main;
      const c = S.c;
      loopGuard = 0;
      clearAll(S);
      const p = S === main ? shakePow : 0;
      S.sx = p ? (Math.random() * 2 - 1) * p : 0; S.sy = p ? (Math.random() * 2 - 1) * p : 0;
      S.base();
      c.save();
      ops = 0;
      try { if (!crashed || state !== 'crashed' || crashed.phase !== 'draw') window.draw(c); }
      catch (e) { crash(e, testing ? 'autotest' : 'draw'); }
      drawOps = ops;
      c.restore();
      S.sx = S.sy = 0; S.base();
      c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.shadowBlur = 0; c.shadowColor = 'transparent';
      if (c.setLineDash) c.setLineDash([]);
    }
    function stepGame(dt) {
      beginInputFrame();
      if (state === 'play') {
        _T += dt;
        loopGuard = 0;
        try { window.update(dt); } catch (e) { crash(e, testing ? 'autotest' : 'update'); return; }
        const L = readLives();
        if (typeof L === 'number' && L <= 0 && state === 'play') gameOver('', true);
      }
      stepFx(dt);
    }
    let last = performance.now(), scoreSent = -1;
    function frame(now) {
      requestAnimationFrame(frame);
      if (paused || document.hidden) { last = now; return; }
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      if (state !== 'crashed') stepGame(dt);
      if (state !== 'crashed' || (crashed && crashed.phase !== 'draw' && crashed.phase !== 'load')) drawGame();
      else clearAll(), base();
      drawFx();
      if (state !== 'crashed') drawHud();
      drawOverlay(now);
      const s = +readScore() || 0;
      if (s !== scoreSent && !testing) { scoreSent = s; post({ type: 'score', score: s }); }
    }

    // ---------- автотест: 6 секунд игры за доли секунды, со случайными нажатиями ----------
    function endWhy(e) {
      if (!e) return '';
      if (e.auto) return 'жизни кончились: lives = ' + e.lives + (e.lives <= 0 && e.t < 0.05 ? ' уже после init() — задай lives в init() (например lives = 3)' : '');
      return (e.kind === 'win' ? 'win()' : 'gameOver()') + ' вызван' + (e.line ? ' в строке ' + e.line : '');
    }
    function autotest() {
      testing = true;
      const t0 = performance.now();
      const codes = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyX', 'Enter', 'KeyZ', 'KeyE', 'ShiftLeft'];
      let frames = 0, restarts = 0, fail = null;
      const lens = [];
      // 1) полсекунды без нажатий: партия не должна кончиться сама
      for (let f = 0; f < 30 && !fail; f++) {
        stepGame(1 / 60);
        if (crashed) { fail = crashed; break; }
        if (f % 5 === 0) { drawGame(test); if (crashed) { fail = crashed; break; } }
        if (state === 'over' || state === 'won') {
          fail = { phase: 'autotest', message: 'Партия закончилась через ' + _T.toFixed(2) + ' с после старта, хотя игрок ничего не нажимал: ' + endWhy(endInfo) + '. Проверь начальное состояние в init() и условие конца игры.', line: endInfo ? endInfo.line : 0, col: 0, stack: '' };
          break;
        }
        frames++;
      }
      if (!fail) restart();
      // 2) шесть секунд со случайными нажатиями и кликами
      for (let f = 0; f < 420 && !fail; f++) {
        if (f % 16 === 0) {
          held.clear();
          for (const c of codes) if (Math.random() < 0.26) held.add(c);
          pressedQueue = new Set(held);
        }
        if (f % 37 === 0) { pointer.x = Math.random() * W; pointer.y = Math.random() * H; pointer.down = true; tapQueue = true; }
        if (f % 37 === 12) { pointer.down = false; releaseQueue = true; }
        stepGame(1 / 60);
        if (crashed) { fail = crashed; break; }
        if (f % 5 === 0) { drawGame(test); if (crashed) { fail = crashed; break; } }
        if (state === 'over' || state === 'won') { lens.push(_T); restarts++; restart(); if (crashed) { fail = crashed; break; } }
        frames++;
        const spent = performance.now() - t0;
        if ((spent > 700 && f >= 90) || spent > 2500) break;
      }
      if (!fail && restarts >= 5) {
        lens.sort((a, b) => a - b);
        const med = lens[lens.length >> 1];
        if (med < 0.5) fail = { phase: 'autotest', message: 'Партия заканчивается почти сразу: ' + restarts + ' раз за ' + frames + ' кадров, в среднем через ' + med.toFixed(2) + ' с. Причина: ' + endWhy(endInfo) + '.', line: endInfo ? endInfo.line : 0, col: 0, stack: '' };
      }
      if (fail && !crashed) { crashed = fail; state = 'crashed'; post(Object.assign({ type: 'error' }, fail)); }
      held.clear(); pressedQueue = new Set(); pointer.down = false; tapQueue = false;
      testing = false;
      return { fail, frames, restarts, ms: Math.round(performance.now() - t0) };
    }
    // «пустой экран» без чтения пикселей (чтение с GPU бывает очень медленным):
    // считаем, сколько раз draw() реально что-то закрасил за кадр
    function blankCheck() { return drawOps < 2; }
    function thumb(w) {
      const o = document.createElement('canvas'); o.width = w; o.height = Math.round(w * H / W);
      o.getContext('2d').drawImage(cv, 0, 0, o.width, o.height);
      return o.toDataURL('image/jpeg', 0.8);
    }

    // ---------- сообщения от страницы ----------
    addEventListener('message', (e) => {
      const m = e.data;
      if (!m || typeof m !== 'object' || e.source !== parent) return;
      if (m.type === 'key') {
        const ev = new KeyboardEvent(m.down ? 'keydown' : 'keyup', { code: m.code, key: m.key || '', bubbles: true, cancelable: true });
        document.dispatchEvent(ev);
      } else if (m.type === 'pause') { paused = !!m.on; if (paused) held.clear(); }
      else if (m.type === 'restart') { if (state !== 'crashed') restart(); }
      else if (m.type === 'sound') { soundOn = !!m.on; if (master) master.gain.value = soundOn ? 0.2 : 0; }
      else if (m.type === 'note') { crashNote = String(m.text || ''); }
      else if (m.type === 'thumb') { try { post({ type: 'thumb', id: m.id, data: thumb(m.w || 320) }); } catch (err) { post({ type: 'thumb', id: m.id, data: '' }); } }
      else if (m.type === 'focus') { try { window.focus(); } catch (err) { /* нет фокуса */ } }
    });

    // ---------- старт ----------
    Object.assign(window, {
      W, H, key, tap, keys, input, pointer, mouse: pointer, addScore, gameOver, win, sound, burst, floatText, shake,
      rand, randi, pick, clamp, lerp, dist, angle, hitRect, hitCircle, circle, rect, text, canvas: fakeCanvas,
      autoplay: !!CFG.autoplay,
    });
    resize();
    addEventListener('resize', resize);

    // Код игры живёт в своей функции-области: тогда `let top`, `let name`, `const status`
    // и прочие имена, занятые окном браузера, не ломают загрузку. Наружу — замыкания.
    // Обёртка начинается на той же строке, что и код, поэтому номера строк не сдвигаются.
    loading = true;
    const el = document.createElement('script');
    el.textContent = '(function () {' + guardLoops(String(GAME_SRC)) +
      '\n;window.__swg = { init: typeof init === "function" ? init : null, update: typeof update === "function" ? update : null,' +
      ' draw: typeof draw === "function" ? draw : null,' +
      ' getScore: function () { return typeof score === "undefined" ? 0 : score; }, setScore: function (v) { score = v; },' +
      ' getLives: function () { return typeof lives === "undefined" ? null : lives; }, setLives: function (v) { lives = v; } };\n})();' +
      '\n//# sourceURL=game.js';
    document.body.appendChild(el);
    loading = false;

    // счёт и жизни: если игра объявила свои переменные с такими именами — читаем и пишем их
    const X = window.__swg;
    if (X) {
      window.init = X.init; window.update = X.update; window.draw = X.draw;
      readScore = X.getScore; writeScore = X.setScore; readLives = X.getLives; writeLives = X.setLives;
    }

    if (loadErr) {
      crashed = loadErr; state = 'crashed';
      post(Object.assign({ type: 'error' }, loadErr));
    } else {
      const miss = ['init', 'update', 'draw'].filter((f) => typeof window[f] !== 'function');
      if (miss.length) crash({ message: 'не найдены функции ' + miss.join(', ') + ' — объяви их как function init() {…}, function update(dt) {…}, function draw(ctx) {…}' }, 'load');
      else {
        state = 'play';
        try { window.init(); } catch (e) { crash(e, 'init'); }
        if (!crashed && CFG.autotest !== false) {
          const r = autotest();
          if (!r.fail) {
            // после автотеста — чистый старт; пустой холст тоже считаем поломкой
            restart();
            if (!crashed) {
              drawGame();
              if (blankCheck()) crash({ message: 'draw() почти ничего не рисует: меньше двух заливок за кадр — на экране пустой фон без игрока и объектов' }, 'blank');
            }
            if (!crashed) post({ type: 'ready', frames: r.frames, restarts: r.restarts, ms: r.ms });
          } else post({ type: 'autotestFail', frames: r.frames });
        } else if (!crashed) post({ type: 'ready', frames: 0, restarts: 0, ms: 0 });
      }
    }
    last = performance.now();
    requestAnimationFrame(frame);
  }

  // ---------- сборка документа для iframe ----------
  const CSP = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:";
  const safeJSON = (v) => JSON.stringify(v).replace(/</g, '\\u003c').replace(new RegExp('\\u2028', 'g'), '\\u2028').replace(new RegExp('\\u2029', 'g'), '\\u2029');

  function buildSrcdoc(code, cfg) {
    const bg = cfg.bg || '#0f0d0b';
    return '<!doctype html><html lang="ru"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">' +
      '<meta http-equiv="Content-Security-Policy" content="' + CSP + '">' +
      '<style>html,body{margin:0;height:100%;overflow:hidden;background:' + bg + ';-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}' +
      'canvas{position:absolute;display:block;touch-action:none;cursor:crosshair}</style></head>' +
      '<body><canvas id="c"></canvas><script>(' + SANDBOX_RUNTIME.toString() + ')(' + safeJSON(cfg) + ',' + safeJSON(String(code)) + ');<\/script></body></html>';
  }

  root.SWG = root.SWG || {};
  root.SWG.runtime = { buildSrcdoc };
})(typeof window !== 'undefined' ? window : globalThis);
