/* ================================================================
   054 · Допрос — режиссура партии и интерфейс.
   Связывает мозг (brain.js), сцену (scene.js) и страницу:
   титул → дело готовится → папка → допрос → решение → финал.
   ================================================================ */
(function () {
  'use strict';
  const D = window.DATA, B = window.Brain, AI = window.AI;
  const SHOT = !!window.__SHOT__;
  const $ = (id) => document.getElementById(id);
  const NB = ' ';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const damp = (cur, to, k, dt) => cur + (to - cur) * (1 - Math.exp(-k * dt));
  const pad2 = (n) => String(n).padStart(2, '0');
  const fmtTape = (sec) => Math.floor(sec / 60) + ':' + pad2(Math.floor(sec % 60));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const touch = matchMedia('(hover: none)').matches;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* приватный режим */ } },
  };

  // ---------- русская типографика для текста нейросети ----------
  const RE_SHORT = /(?<=^|[\s(«„"])(в|во|к|ко|с|со|и|а|но|на|по|за|от|до|из|не|ни|о|об|у|я)\s+(?=\S)/giu;
  function typo(s) {
    return String(s || '')
      .replace(/\.\.\./g, '…')
      .replace(/"([^"]*)"/g, '«$1»')
      .replace(/\s[-–—]\s/g, NB + '— ')
      .replace(/(\d)\s(?=[а-яё№%])/giu, '$1' + NB)
      .replace(/№\s/g, '№' + NB)
      .replace(RE_SHORT, '$1' + NB);
  }
  // Ремарки в скобках и *звёздочках* не печатаем: жесты играет сцена
  function cleanPartial(t) {
    let s = String(t || '').replace(/\([^()]{0,80}\)/g, '').replace(/\*[^*]{0,80}\*/g, '');
    const cut = s.search(/[(*]/);
    if (cut >= 0) s = s.slice(0, cut);
    return s.replace(/^\s*[«"]/, '').replace(/\s{2,}/g, ' ');
  }
  function h(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  const g = (m, f) => (G.C && G.C.seed.sex === 'f' ? f : m);
  const surname = () => (G.C ? G.C.suspect.name.split(' ')[0] : '');

  // ---------- шум для бумаги и зерна (рисуется кодом) ----------
  (function makeNoise() {
    const mk = (alpha, grey) => {
      const c = document.createElement('canvas'); c.width = c.height = 160;
      const x = c.getContext('2d'); const img = x.createImageData(160, 160);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = grey ? Math.random() * 255 : (Math.random() < 0.5 ? 40 : 255);
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = grey ? 255 : Math.random() * alpha;
      }
      x.putImageData(img, 0, 0);
      return 'url(' + c.toDataURL() + ')';
    };
    document.documentElement.style.setProperty('--noise', mk(34, false));
    document.querySelector('.grain').style.backgroundImage = mk(0, true);
  })();

  // ================================================================
  //   СОСТОЯНИЕ
  // ================================================================
  const G = {
    phase: 'title', C: null, S: null, busy: false, attach: null, fresh: new Set(),
    next: null, job: null, stress: 0.3, stressT: 0.3, closeUp: false, has3D: false,
    ctrl: null, lastInputAt: 0, ending: null, verdict: null,
  };
  // заглушка сцены: игра идёт и без 3D (нет сети до CDN, нет WebGL)
  const NOOP = () => {};
  const SCENE_API = ['setLook', 'setStress', 'setStressNow', 'setMood', 'gesture', 'holdGesture', 'releaseHold', 'speaking', 'speakChar',
    'think', 'present', 'clearCards', 'setCamera', 'setRecording', 'setClock', 'impact', 'finale', 'resetFinale', 'knock', 'refreshText', 'setShift', 'holdGaze'];
  let S3 = Object.fromEntries(SCENE_API.map((k) => [k, NOOP]));

  // на широком экране слева лежит бумага — кадр сдвигаем вправо
  // на телефоне во время допроса лицо — между самописцем и субтитрами, в остальных фазах — выше, над текстом
  const talking = () => G.phase === 'interrogation';
  const shiftX = () => (!talking() && window.innerWidth > 760 && window.innerWidth / window.innerHeight >= 0.85 ? 0.15 : 0);
  const shiftY = () => (talking() ? -0.02 : G.phase === 'finale' ? 0.26 : 0.2);
  function setPhase(p) {
    G.phase = p;
    document.body.className = document.body.className.replace(/\bphase-\S+/g, '').trim() + ' phase-' + p;
    S3.setShift(shiftX(), shiftY());
  }
  window.addEventListener('resize', () => S3.setShift(shiftX(), shiftY()));

  // ================================================================
  //   ЗВУК (Web Audio, всё синтезировано; включается после жеста)
  // ================================================================
  const Sound = (() => {
    let ctx = null, master = null, on = store.get('interrogation.sound') !== 'off';
    const btn = $('soundBtn');
    btn.setAttribute('aria-pressed', String(on));
    function init() {
      if (ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = on ? 0.5 : 0; master.connect(ctx.destination);
      room();
    }
    function noise(sec, brown) {
      const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * sec), ctx.sampleRate), d = b.getChannelData(0);
      let last = 0;
      for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w; }
      return b;
    }
    function env(node, t, a, peak, dec) {
      node.gain.setValueAtTime(0.0001, t); node.gain.linearRampToValueAtTime(peak, t + a); node.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
    }
    function room() {
      // вытяжка и лампа: коричневый шум + тихий гул; за окном дождь
      const vent = ctx.createBufferSource(); vent.buffer = noise(4, true); vent.loop = true;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
      const vg = ctx.createGain(); vg.gain.value = 0.16;
      vent.connect(lp).connect(vg).connect(master); vent.start();
      const rain = ctx.createBufferSource(); rain.buffer = noise(3, false); rain.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 0.5;
      const rg = ctx.createGain(); rg.gain.value = 0.018;
      rain.connect(bp).connect(rg).connect(master); rain.start();
      for (const [f, v] of [[100, 0.012], [150, 0.005]]) {
        const o = ctx.createOscillator(); o.frequency.value = f; const og = ctx.createGain(); og.gain.value = v; o.connect(og).connect(master); o.start();
      }
      const drip = () => {
        if (!ctx) return;
        const t = ctx.currentTime, o = ctx.createOscillator(), gg = ctx.createGain();
        o.frequency.setValueAtTime(1700 + Math.random() * 1400, t); o.frequency.exponentialRampToValueAtTime(900, t + 0.08);
        env(gg, t, 0.004, 0.012, 0.09); o.connect(gg).connect(master); o.start(t); o.stop(t + 0.12);
        setTimeout(drip, 300 + Math.random() * 1400);
      };
      setTimeout(drip, 800);
    }
    const hit = (f, dur, peak, t0 = 0, type = 'sine') => {
      if (!ctx) return;
      const t = ctx.currentTime + t0, o = ctx.createOscillator(), gg = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.6, t + dur);
      env(gg, t, 0.006, peak, dur); o.connect(gg).connect(master); o.start(t); o.stop(t + dur + 0.05);
    };
    const burst = (dur, peak, freq, q = 1, t0 = 0) => {
      if (!ctx) return;
      const t = ctx.currentTime + t0, s = ctx.createBufferSource(); s.buffer = noise(dur + 0.05, false);
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
      const gg = ctx.createGain(); env(gg, t, 0.004, peak, dur); s.connect(f).connect(gg).connect(master); s.start(t); s.stop(t + dur + 0.05);
    };
    return {
      unlock() { init(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
      toggle() {
        on = !on; store.set('interrogation.sound', on ? 'on' : 'off'); btn.setAttribute('aria-pressed', String(on));
        this.unlock(); if (master) master.gain.setTargetAtTime(on ? 0.5 : 0, ctx.currentTime, 0.08);
      },
      click() { burst(0.03, 0.25, 3200, 2); },
      tapeStart() { burst(0.04, 0.3, 2600, 2); hit(62, 0.6, 0.05, 0.05, 'sawtooth'); },
      tapeStop() { burst(0.05, 0.3, 2200, 2); hit(48, 0.35, 0.06, 0, 'sawtooth'); },
      knock() { [0, 0.2, 0.42].forEach((t) => { hit(95, 0.16, 0.5, t); burst(0.05, 0.12, 700, 1, t); }); },
      paper() { burst(0.32, 0.12, 1400, 0.7); },
      sting() { [55, 58.3, 110, 164.8].forEach((f, i) => hit(f, 2.4, i < 2 ? 0.16 : 0.07, 0.02 * i, 'triangle')); burst(0.5, 0.05, 300, 0.6); },
      thud() { hit(70, 0.25, 0.6); burst(0.08, 0.2, 500, 1); },
      type() { burst(0.018, 0.06, 2800 + Math.random() * 900, 3); },
      final(good) {
        (good ? [110, 164.8, 220, 277.2] : [98, 103.8, 146.8, 155.6]).forEach((f, i) => hit(f, 3.6, 0.07, 0.12 * i, 'triangle'));
      },
    };
  })();
  $('soundBtn').addEventListener('click', () => Sound.toggle());
  // первый жест где угодно разблокирует звук
  window.addEventListener('pointerdown', () => Sound.unlock(), { once: true, capture: true });

  // ================================================================
  //   САМОПИСЕЦ СТРЕССА
  // ================================================================
  const Trace = (() => {
    const cv = $('trace'), cx = cv.getContext('2d');
    const SPEED = 22;                       // пикселей в секунду
    let W = 280, H = 74, dpr = 1, acc = 0, phase = 0, scroll = 0, lvlS = 0.3, breath = 0;
    const N = 1200, lvl = new Float32Array(N), pul = new Float32Array(N);
    let len = 0;
    const marks = [];
    function resize() {
      const r = cv.getBoundingClientRect();
      if (!r.width) return;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = Math.round(r.width); H = Math.round(r.height);
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    }
    // два пера: уровень стресса (плавный, янтарный) и пульс с дыханием (красный, внизу)
    function sample(s) {
      const bpm = 58 + 70 * s;
      phase += bpm / 60 / SPEED;
      breath += (0.22 + 0.25 * s) / SPEED;
      const p = phase % 1;
      const beat = Math.exp(-((p - 0.1) ** 2) / 0.0009) - 0.35 * Math.exp(-((p - 0.16) ** 2) / 0.0016);
      lvlS += (s - lvlS) * 0.06;
      const level = clamp(0.2 + lvlS * 0.72 + Math.sin(breath * 6.283) * 0.012 + (Math.random() - 0.5) * 0.008 * (1 + 3 * s), 0.03, 0.97);
      const pulse = clamp(0.2 + Math.sin(breath * 6.283) * (0.035 + 0.03 * s) + beat * (0.07 + 0.11 * s) + (Math.random() - 0.5) * 0.02 * s * s, 0.02, 0.6);
      return [level, pulse];
    }
    function push(v) {
      if (len < N) { lvl[len] = v[0]; pul[len] = v[1]; len++; }
      else { lvl.copyWithin(0, 1); pul.copyWithin(0, 1); lvl[N - 1] = v[0]; pul[N - 1] = v[1]; }
      for (const m of marks) m.x += 1;
      scroll++;
    }
    function mark(label, hot) { marks.push({ x: 0, label: String(label), hot: !!hot }); while (marks.length > 40) marks.shift(); }
    function step(dt, s) {
      acc += dt * SPEED;
      while (acc >= 1) { push(sample(s)); acc -= 1; }
    }
    function prefill(values) {
      // для обложки: история по ходам — по 44 точки на ход
      len = 0; marks.length = 0; lvlS = values[0].s;
      values.forEach((v) => { for (let k = 0; k < 44; k++) push(sample(v.s)); if (v.label) mark(v.label, v.hot); });
      for (let k = 0; k < 30; k++) push(sample(values[values.length - 1].s));
    }
    function line(arr, n, color, width) {
      cx.strokeStyle = color; cx.lineWidth = width; cx.lineJoin = 'round'; cx.beginPath();
      for (let i = 0; i < n; i++) { const x = W - n + i, y = H - arr[len - n + i] * H; if (i) cx.lineTo(x, y); else cx.moveTo(x, y); }
      cx.stroke();
    }
    function draw() {
      if (!W) return;
      cx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx.clearRect(0, 0, W, H);
      cx.fillStyle = 'rgba(236,227,204,0.035)'; cx.fillRect(0, 0, W, H);
      cx.fillStyle = 'rgba(226,96,77,0.08)'; cx.fillRect(0, 0, W, H * 0.2);      // зона срыва
      cx.strokeStyle = 'rgba(236,227,204,0.07)'; cx.lineWidth = 1; cx.beginPath();
      for (let y = 1; y < 4; y++) { const yy = Math.round(H * y / 4) + 0.5; cx.moveTo(0, yy); cx.lineTo(W, yy); }
      for (let x = W - (scroll % 24); x > 0; x -= 24) { const xx = Math.round(x) + 0.5; cx.moveTo(xx, 0); cx.lineTo(xx, H); }
      cx.stroke();
      cx.font = '11px "PT Mono", monospace'; cx.textBaseline = 'bottom';
      for (const m of marks) {
        const x = W - m.x;
        if (x < -20) continue;
        cx.strokeStyle = m.hot ? 'rgba(226,96,77,0.85)' : 'rgba(163,184,212,0.4)';
        cx.setLineDash([2, 3]); cx.beginPath(); cx.moveTo(Math.round(x) + 0.5, 0); cx.lineTo(Math.round(x) + 0.5, H); cx.stroke(); cx.setLineDash([]);
        cx.fillStyle = m.hot ? '#e2604d' : 'rgba(163,184,212,0.9)'; cx.fillText(m.label, x + 3, H - 1);
      }
      const n = Math.min(len, W);
      if (!n) return;
      line(pul, n, 'rgba(226,96,77,0.9)', 1.1);
      line(lvl, n, '#e3a14b', 2);
      const y = H - lvl[len - 1] * H;
      cx.fillStyle = '#f3ead3'; cx.beginPath(); cx.arc(W - 2, y, 2.6, 0, 7); cx.fill();
    }
    window.addEventListener('resize', () => { resize(); draw(); });
    return { resize, step, draw, mark, prefill, reset() { len = 0; marks.length = 0; } };
  })();

  // ================================================================
  //   ПЕЧАТЬ РЕПЛИК (ровный темп, паузы на знаках, рот сцены)
  // ================================================================
  const Typer = (() => {
    const out = $('aText');
    let target = '', shown = 0, final = true, wait = 0, carry = 0, active = false, resolvers = [];
    function render() { out.textContent = typo(target.slice(0, shown)); }
    return {
      begin() { target = ''; shown = 0; final = false; wait = 0; carry = 0; active = true; out.classList.remove('err'); },
      feed(text) { const t = cleanPartial(text); if (t.length >= target.length || !t.startsWith(target.slice(0, shown))) target = t; },
      finish(text) {
        const t = String(text || '');
        const was = target.slice(0, shown);
        if (!t.startsWith(was)) { let k = 0; while (k < was.length && t[k] === was[k]) k++; shown = k; }
        target = t; final = true;
      },
      say(text) { this.begin(); this.finish(text); S3.speaking(true); },
      instant(text) { target = String(text || ''); shown = target.length; final = true; active = false; render(); },
      thinking() { out.textContent = ''; const d = h('span', 'dots'); d.append(h('i'), h('i'), h('i')); out.appendChild(d); },
      error(msg) { active = false; out.textContent = msg; out.classList.add('err'); resolvers.splice(0).forEach((r) => r()); },
      done() { return new Promise((r) => { if (!active) r(); else resolvers.push(r); }); },
      get started() { return shown > 0; },
      tick(dt) {
        if (!active) return;
        if (wait > 0) { wait -= dt; return; }
        const backlog = target.length - shown;
        if (backlog <= 0) {
          if (final) { active = false; S3.speaking(false); resolvers.splice(0).forEach((r) => r()); }
          return;
        }
        if (shown === 0) S3.speaking(true);
        const rate = backlog > 90 ? 75 : backlog > 40 ? 50 : 36;
        let budget = rate * dt + carry;
        while (budget >= 1 && shown < target.length) {
          const ch = target[shown++]; budget -= 1;
          S3.speakChar(ch);
          if (dt > 0.25) continue;   // кадры редкие — догоняем без пауз
          if ('.!?…'.includes(ch) && target[shown] === ' ') { wait = 0.3; budget = 0; break; }
          if (',;:—'.includes(ch)) { wait = 0.09; budget = 0; break; }
        }
        carry = Math.min(budget, 1);
        render();
      },
    };
  })();

  // ================================================================
  //   ГЛАВНЫЙ ЦИКЛ ИНТЕРФЕЙСА
  // ================================================================
  let lastT = performance.now(), idleT = 6;
  function loop(now) {
    requestAnimationFrame(loop);
    if (document.hidden) { lastT = now; return; }
    const raw = Math.min(SHOT ? 10 : 1, (now - lastT) / 1000), dt = Math.min(0.1, raw); lastT = now;
    G.stress = damp(G.stress, G.stressT, 1.6, dt);
    if (G.phase === 'interrogation' && !G.staticCover) { Trace.step(dt, G.stress); Trace.draw(); }
    Typer.tick(raw);   // печать идёт по реальному времени, даже если кадры редкие
    const num = $('stressNum'), v = Math.round(G.stress * 100);
    if (num.textContent !== String(v)) { num.textContent = v; num.classList.toggle('hot', v >= 75); }
    // живой подозреваемый между репликами: закуривает, отводит глаза, барабанит
    idleT -= dt;
    if (idleT <= 0 && !G.busy && !SHOT) {
      idleT = 7 + Math.random() * 7;
      const quiet = G.phase !== 'interrogation' || performance.now() - G.lastInputAt > 9000;
      if (quiet && G.phase !== 'finale') S3.gesture(['smoke', 'look_away', 'tap', G.stress > 0.5 ? 'wipe' : 'lean_back'][Math.floor(Math.random() * 4)]);
    }
  }

  function setStress(v01, instant) {
    G.stressT = clamp(v01, 0, 1);
    if (instant) G.stress = G.stressT;
    S3[instant ? 'setStressNow' : 'setStress'](G.stressT);
  }

  // ---------- мелкие части интерфейса ----------
  function toast(kind, head, text, ms = 4200) {
    const t = h('div', 'toast ' + kind);
    if (head) t.appendChild(h('b', null, head));
    t.appendChild(document.createTextNode(typo(text)));
    $('toasts').appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 520); }, ms);
    while ($('toasts').children.length > 3) $('toasts').firstChild.remove();
  }
  function updateCost() {
    const c = $('cost');
    c.hidden = AI.demo || AI.shot || !AI.usage.calls;
    c.textContent = '$' + AI.usage.costUSD.toFixed(AI.usage.costUSD < 0.1 ? 4 : 3);
  }
  AI.onStatus = () => updateCost();
  function updateDemoFlag() {
    const demo = !!AI.demo && !AI.shot;
    $('demoFlag').hidden = !demo;
    document.body.classList.toggle('demo', demo);
  }
  function show(id, on) { $(id).hidden = !on; }
  function screens(which) {
    for (const id of ['titleScreen', 'genScreen', 'briefScreen', 'finale']) show(id, id === which);
    show('hud', which === 'hud');
  }

  // ================================================================
  //   ТИТУЛ
  // ================================================================
  function netNote() {
    const n = $('netNote'); n.textContent = '';
    const dot = h('i'); n.appendChild(dot);
    if (AI.demo || !AI.hasKey()) {
      dot.className = 'off';
      n.appendChild(document.createTextNode(typo('Нейросеть не подключена: «Взять новое дело» попросит ключ OpenRouter. Дело «Проявка» играется и без неё.')));
    } else if (G.next && !G.next.done) {
      dot.className = 'busy';
      n.appendChild(document.createTextNode(typo('Нейросеть на связи — первое дело уже готовится.')));
    } else if (G.next && G.next.error) {
      dot.className = 'off';
      n.appendChild(document.createTextNode(typo('Нейросеть не ответила: ' + (G.next.error.ru || 'ошибка') + '.')));
    } else {
      n.appendChild(document.createTextNode(typo(G.next && G.next.case ? 'Новое дело готово — можно входить.' : 'Нейросеть на связи — DeepSeek.')));
    }
  }
  function showTitle() {
    setPhase('title');
    screens('titleScreen');
    $('caseTag').hidden = true;
    $('resumeBtn').hidden = !(G.S && !G.S.ended);
    $('demoCaseBtn').textContent = AI.demo || !AI.hasKey() ? 'Демо-дело «Проявка»' : 'Готовое дело «Проявка»';
    netNote();
    S3.setCamera('establish'); S3.setRecording(false);
    updateDemoFlag();
  }

  // Подготовка дела: семя (кто, где, внешность) — сразу, текст дела — нейросеть с рассуждением
  function prepareCase() {
    const seed = B.makeSeed();
    const job = { seed, done: false, case: null, error: null, slow: false, t0: performance.now() };
    const onSlow = () => { job.slow = true; if (G.job === job) $('genStatus').textContent = 'Нейросеть думает дольше обычного — параллельно пишем запасную версию…'; };
    job.promise = B.generateCase(seed, { onSlow }).then(
      (c) => {
        job.case = c; job.done = true;
        if (G.phase === 'title') netNote();
        else if (G.phase !== 'generating' && G.next === job) toast('news', 'Дело готово', '«' + c.title + '» ждёт вас: папка вверху справа → «Взять новое дело».', 6500);
        return c;
      },
      (e) => { job.error = e; job.done = true; if (G.phase === 'title') netNote(); throw e; });
    job.promise.catch(() => {});
    return job;
  }

  async function newCase() {
    Sound.unlock(); Sound.click();
    if (!AI.hasKey() || AI.demo) {
      const ok = await AI.ensureKey();
      updateDemoFlag();
      if (!ok) { startDemo(); return; }
    }
    if (!G.next || (G.next.done && G.next.error)) G.next = prepareCase();
    const job = G.next; G.next = null;
    G.job = job;
    await openJob(job);
  }

  // ================================================================
  //   ДЕЛО ГОТОВИТСЯ
  // ================================================================
  const STATUSES = ['Дежурный поднимает сводку за ночь…', 'Эксперт диктует заключение…', 'Опера опрашивают соседей…',
    'Фотограф сушит снимки с места…', 'Машинистка перепечатывает показания…', 'Следователь листает протокол осмотра…',
    'Задержанного ведут по коридору…', 'Сторож вспоминает, кто проходил мимо…'];
  const TIPS = ['Сначала пусть говорит. Ложь, которую он уже произнёс, — ваша добыча.',
    'Улика, показанная слишком рано, — подсказка лжецу: он подстроит рассказ под неё.',
    'Его же слова — тоже улика. Нажмите на реплику в протоколе, чтобы зачитать её.',
    'Молчание давит сильнее крика: попробуйте просто промолчать.',
    'Крик и угрозы без фактов не ломают. А невиновного можно запугать до оговора.',
    'Новые улики приносят по ходу допроса — стук в дверь.'];
  let genTimer = 0;
  async function openJob(job) {
    setPhase('generating');
    screens('genScreen');
    S3.setLook(job.seed.look); S3.setCamera('establish');
    const sd = job.seed;
    $('genNo').textContent = sd.caseNo; $('genDate').textContent = typo('ночь на ' + sd.date);
    $('genWhoLabel').textContent = sd.sex === 'f' ? 'Задержана' : 'Задержан';
    $('genError').hidden = true; $('genRetry').hidden = true;
    $('genDemo').hidden = false; $('genDemo').textContent = 'Пока ждать — «Проявка»';
    const fields = [['genPlace', sd.place], ['genCrime', sd.crime], ['genWho', sd.archetype + ', ' + sd.age + NB + B.years(sd.age) + ' — ' + sd.lookText]];
    fields.forEach(([id]) => { $(id).textContent = ''; });
    let si = 0, ti = Math.floor(Math.random() * TIPS.length);
    $('genStatus').textContent = STATUSES[0]; $('genTip').textContent = typo(TIPS[ti]);
    clearInterval(genTimer);
    let tick = 0;
    genTimer = setInterval(() => {
      tick++;
      $('genTime').textContent = fmtTape((performance.now() - job.t0) / 1000);
      if (tick % 5 === 0) { si = (si + 1) % STATUSES.length; $('genStatus').textContent = STATUSES[si]; }
      if (tick % 9 === 0) { ti = (ti + 1) % TIPS.length; $('genTip').textContent = typo(TIPS[ti]); }
    }, 1000);
    // машинописью — то, что известно сразу
    (async () => {
      for (const [id, text] of fields) {
        const el = $(id); el.classList.add('typing');
        const t = typo(text);
        for (let i = 1; i <= t.length; i++) { if (G.job !== job) return; el.textContent = t.slice(0, i); if (i % 2) Sound.type(); await sleep(22); }
        el.classList.remove('typing');
        await sleep(240);
      }
    })();
    try {
      const c = await job.promise;
      if (G.job !== job) return;
      clearInterval(genTimer);
      G.C = c; G.S = null;
      showBrief(false);
    } catch (e) {
      if (G.job !== job) return;
      clearInterval(genTimer);
      $('genStatus').textContent = 'Дело не собралось.';
      const er = $('genError'); er.hidden = false;
      er.textContent = typo((e && e.ru) || 'Нейросеть не ответила.') + (e && e.kind === 'credits' ? '' : ' Можно попробовать ещё раз.');
      $('genRetry').hidden = false; $('genDemo').hidden = false; $('genDemo').textContent = 'Играть «Проявку»';
    }
  }
  $('genRetry').addEventListener('click', () => { G.next = prepareCase(); newCase(); });
  $('genDemo').addEventListener('click', () => { leaveGen(); startDemo(); });
  // уйти с экрана ожидания: дело доготовится в фоне и дождётся следующего «Взять новое дело»
  function leaveGen() {
    clearInterval(genTimer);
    if (G.job && !G.job.error) G.next = G.job;
    G.job = null;
  }
  $('genCancel').addEventListener('click', () => { leaveGen(); showTitle(); });

  // ================================================================
  //   ПАПКА С ДЕЛОМ
  // ================================================================
  function startDemo() {
    Sound.unlock();
    G.C = B.prepareDemoCase(); G.S = null;
    S3.setLook(G.C.seed.look);
    updateDemoFlag();
    showBrief(false);
  }
  function caseTagText() { return 'Дело №' + NB + G.C.seed.caseNo + ' · «' + G.C.title + '»'; }
  function showBrief(reading) {
    const c = G.C, sd = c.seed;
    setPhase('brief');
    screens('briefScreen');
    Sound.paper();
    S3.setCamera(reading ? 'seat' : 'establish');
    $('bNo').textContent = 'Дело №' + NB + sd.caseNo;
    $('bStamp').textContent = reading ? 'Идёт допрос' : 'В работе';
    $('bTitle').textContent = '«' + c.title + '»';
    $('bMeta').textContent = typo('ночь на ' + sd.date + ' · ' + sd.place);
    $('bBrief').textContent = typo(c.brief);
    $('bVictim').textContent = typo(c.victim);
    $('bSuspectH').textContent = sd.sex === 'f' ? 'Задержана' : 'Задержан';
    $('bSuspect').textContent = typo(c.suspect.name + ', ' + sd.age + ' ' + B.years(sd.age) + ' — ' + c.suspect.job + '. ' + (c.suspect.relation ? c.suspect.relation[0].toUpperCase() + c.suspect.relation.slice(1) + '.' : ''));
    const ul = $('bCards'); ul.textContent = '';
    const ids = reading && G.S ? G.S.hand : c.evidence.filter((e) => e.arrives === 0).map((e) => e.id);
    for (const id of ids) {
      const e = c.evidence.find((x) => x.id === id);
      const li = h('li'); li.appendChild(h('span', null, e.kind)); li.appendChild(document.createTextNode(typo(e.title)));
      ul.appendChild(li);
    }
    show('startBtn', !reading); show('briefBack', !!reading);
    $('caseTag').hidden = false; $('caseTag').textContent = caseTagText();
    if (!reading && !touch) setTimeout(() => $('startBtn').focus({ preventScroll: true }), 400);
  }
  $('startBtn').addEventListener('click', () => startInterrogation());
  $('briefBack').addEventListener('click', () => resumeInterrogation());
  $('caseTag').addEventListener('click', () => { if (G.phase === 'interrogation' && !G.busy) showBrief(true); });

  // ================================================================
  //   ДОПРОС
  // ================================================================
  const lieIds = () => new Set(G.C.lies.map((l) => l.id));

  function startInterrogation() {
    Sound.unlock();
    G.staticCover = false;
    G.S = B.newSession(G.C);
    G.attach = null; G.fresh = new Set(); G.closeUp = false; G.ending = null;
    $('protoList').textContent = '';
    $('qLine').textContent = ''; $('aText').textContent = '';
    $('aWho').textContent = surname();
    Trace.reset();
    S3.resetFinale(); S3.clearCards(); S3.setMood('guarded');
    setStress(0.3, true);
    enterHUD();
    S3.setCamera('seat'); S3.setRecording(true); Sound.tapeStart();
    Trace.mark('▶');
    setTimeout(async () => {
      if (G.phase !== 'interrogation' || G.S.turns.length) return;
      S3.gesture('lean_back');
      Typer.say(G.C.opening);
      addOpening(G.C.opening);
      await Typer.done();
      if (!touch) $('q').focus({ preventScroll: true });
    }, 1500);
  }
  function enterHUD() {
    setPhase('interrogation');
    screens('hud');
    $('caseTag').hidden = false; $('caseTag').textContent = caseTagText();
    const narrow = window.innerWidth <= 1180;
    $('protocol').classList.toggle('closed', narrow);
    $('protoBtn').classList.toggle('on', !narrow);
    renderAttach(); renderHand(); renderGauges();
    requestAnimationFrame(() => { Trace.resize(); Trace.draw(); });
    updateDemoFlag();
  }
  function resumeInterrogation() {
    if (!G.S) return;
    enterHUD();
    S3.setCamera('seat'); S3.setRecording(true);
  }

  function renderGauges() {
    const S = G.S; if (!S) return;
    const left = B.tapeLeft(S);
    const t = $('tapeLeft'); t.textContent = fmtTape(left); t.classList.toggle('low', left < 300);
    $('tapeBar').style.transform = 'scaleX(' + (left / S.tapeTotal).toFixed(3) + ')';
    const box = $('caught'), caught = B.caughtIds(S).length;
    if (box.children.length !== S.need) { box.textContent = ''; for (let i = 0; i < S.need; i++) box.appendChild(h('i')); }
    [...box.children].forEach((d, i) => d.classList.toggle('on', i < caught));
    box.title = 'Уличён во лжи: ' + caught + ' из ' + S.need;
    S3.setClock(130 + S.tapeUsed / 60);
    const ready = S.confessed || S.secretRevealed || S.broken;
    $('verdictBtn').classList.toggle('ready', !!ready);
  }

  // --- протокол ---
  function addOpening(line) {
    const li = h('li', 'turn opening');
    const meta = h('div', 't-meta'); meta.appendChild(h('span', 't-min', '00 мин · начало записи')); li.appendChild(meta);
    li.appendChild(h('div', 't-a', typo(line)));
    $('protoList').appendChild(li);
  }
  function addTurn(rec) {
    const S = G.S;
    const li = h('li', 'turn'); li.dataset.n = rec.n;
    const meta = h('div', 't-meta');
    meta.appendChild(h('span', 't-min', pad2(rec.minute) + ' мин'));
    if (rec.card && rec.card.type === 'evidence') meta.appendChild(h('span', 't-chip', '▣ ' + B.evidenceById(S, rec.card.id).title));
    if (rec.card && rec.card.type === 'quote') meta.appendChild(h('span', 't-chip', '↩ его слова, ' + pad2(S.turns[rec.card.turn - 1].minute) + ' мин'));
    li.appendChild(meta);
    li.appendChild(h('p', 't-q', rec.silent ? '— (молчит и смотрит на него)' : '— ' + typo(rec.q)));
    const a = h('button', 't-a', typo(rec.line)); a.type = 'button';
    a.addEventListener('click', () => attachQuote(rec.n));
    li.appendChild(a);
    if (rec.exposed.length) li.appendChild(h('span', 't-stamp', 'уличён'));
    else if (rec.admit.length) li.appendChild(h('span', 't-stamp soft', 'признал'));
    else if (rec.confession === 'full') li.appendChild(h('span', 't-stamp', G.C.truth.guilty ? 'признание' : 'правда'));
    const list = $('protoList'); list.appendChild(li);
    list.scrollTop = list.scrollHeight;
  }

  // --- улики на руках ---
  function renderHand() {
    const S = G.S; if (!S) return;
    const box = $('handCards'); box.textContent = '';
    for (const id of S.hand) {
      const e = B.evidenceById(S, id);
      const b = h('button', 'ev-card'); b.type = 'button';
      if (S.used[id]) b.classList.add('used');
      if (G.fresh.has(id)) b.classList.add('fresh');
      if (G.attach && G.attach.type === 'evidence' && G.attach.id === id) b.classList.add('picked');
      const k = h('span', 'ev-kind'); k.append(h('span', null, e.kind), h('span', null, e.id)); b.appendChild(k);
      b.appendChild(h('span', 'ev-title', typo(e.title)));
      b.appendChild(h('span', 'ev-text', typo(e.text)));
      b.appendChild(h('span', 'ev-foot', S.used[id] ? 'уже показана — на ' + S.turns[S.used[id] - 1].minute + '-й минуте' : 'ещё не показана'));
      b.addEventListener('click', () => { attachEvidence(id); closeHand(); });
      box.appendChild(b);
    }
    const cnt = $('handCount'); cnt.textContent = S.hand.length; cnt.classList.toggle('fresh', G.fresh.size > 0);
  }
  function openHand() { if (!G.S) return; renderHand(); show('hand', true); $('handBtn').classList.add('on'); closeProto(true); }
  function closeHand() { show('hand', false); $('handBtn').classList.remove('on'); G.fresh.clear(); $('handCount').classList.remove('fresh'); }
  $('handBtn').addEventListener('click', () => ($('hand').hidden ? openHand() : closeHand()));
  $('handClose').addEventListener('click', closeHand);

  function closeProto(onlyNarrow) {
    if (onlyNarrow && window.innerWidth > 1180) return;
    $('protocol').classList.add('closed'); $('protoBtn').classList.remove('on');
  }
  $('protoBtn').addEventListener('click', () => {
    const p = $('protocol'), open = p.classList.contains('closed');
    p.classList.toggle('closed', !open); $('protoBtn').classList.toggle('on', open);
    if (open) { closeHand(); const l = $('protoList'); l.scrollTop = l.scrollHeight; }
  });
  $('protoClose').addEventListener('click', () => closeProto(false));

  // --- вложение к вопросу: улика или цитата ---
  function attachEvidence(id) { G.attach = { type: 'evidence', id }; renderAttach(); Sound.paper(); if (!touch) $('q').focus(); }
  function attachQuote(n) {
    if (G.busy) return;
    G.attach = { type: 'quote', turn: n }; renderAttach(); closeProto(true);
    document.querySelectorAll('.t-a.quoted').forEach((x) => x.classList.remove('quoted'));
    const a = document.querySelector('.turn[data-n="' + n + '"] .t-a'); if (a) a.classList.add('quoted');
    if (!touch) $('q').focus();
  }
  function renderAttach() {
    const box = $('attach'), a = G.attach;
    if (!a || !G.S) { box.hidden = true; document.querySelectorAll('.t-a.quoted').forEach((x) => x.classList.remove('quoted')); return; }
    box.hidden = false;
    if (a.type === 'evidence') { const e = B.evidenceById(G.S, a.id); $('attachKind').textContent = 'На стол · ' + e.kind; $('attachText').textContent = typo(e.title); }
    else { const t = G.S.turns[a.turn - 1]; $('attachKind').textContent = 'Его слова · ' + pad2(t.minute) + ' мин'; $('attachText').textContent = '«' + typo(t.line) + '»'; }
    $('q').placeholder = a.type === 'evidence' ? 'Что спросить, положив улику? Можно промолчать' : 'Что спросить про его слова?';
  }
  $('attachX').addEventListener('click', () => { G.attach = null; renderAttach(); $('q').placeholder = 'Ваш вопрос… Enter — спросить'; });

  // --- ход ---
  $('dock').addEventListener('submit', (e) => { e.preventDefault(); submit(false); });
  $('silentBtn').addEventListener('click', () => submit(true));
  $('q').addEventListener('input', () => { G.lastInputAt = performance.now(); });

  function setBusy(on) {
    G.busy = on;
    $('askBtn').disabled = on; $('silentBtn').disabled = on; $('verdictBtn').disabled = on;
    document.body.classList.toggle('busy', on);
  }

  async function submit(silent) {
    const S = G.S;
    if (!S || G.busy || S.ended || G.phase !== 'interrogation') return;
    const text = $('q').value.trim();
    if (!silent && !text && !G.attach) { $('q').focus(); return; }
    const input = { text: silent ? '' : text, silent: silent || (!text && !!G.attach), card: G.attach };
    $('q').value = ''; G.lastInputAt = performance.now();
    G.attach = null; renderAttach(); $('q').placeholder = 'Ваш вопрос… Enter — спросить';
    closeHand(); closeProto(true);
    await playTurn(input, text);
  }

  async function playTurn(input, typed) {
    const S = G.S;
    setBusy(true);
    Sound.click();
    // вопрос — в строку над репликой
    const ql = $('qLine'); ql.textContent = '';
    if (input.card && input.card.type === 'evidence') {
      const e = B.evidenceById(S, input.card.id);
      ql.appendChild(h('span', 'q-card', '[кладёт на стол: ' + e.title + '] '));
      S3.present(e, false); Sound.paper();
    }
    if (input.card && input.card.type === 'quote') ql.appendChild(h('span', 'q-card', '[зачитывает его слова] '));
    ql.appendChild(document.createTextNode(input.silent && !input.text ? '— …' : '— ' + typo(input.text)));
    Trace.mark(String(S.turns.length + 1));
    S3.think(true);
    Typer.thinking();
    const hasFact = !!input.card || !input.silent;
    const ids = lieIds();
    let metaDone = false;
    const onMeta = (m) => {
      metaDone = true;
      S3.think(false);
      if (Number.isFinite(m.stress)) setStress(m.stress / 100);
      if (m.mood) S3.setMood(m.mood);
      if (m.gesture && m.gesture !== 'none') S3.gesture(m.gesture);
      const fresh = (m.exposed || []).filter((id) => ids.has(id) && !S.exposed[id] && !S.admitted[id]);
      if ((fresh.length && hasFact) || m.confession === 'full' || m.confession === 'false') {
        G.closeUp = true; S3.setCamera('close');
        if (fresh.length) Sound.sting();
      }
      if (m.gesture === 'fist') setTimeout(() => Sound.thud(), 700);
    };
    let started = false;
    const onLine = (text) => { if (!started) { started = true; Typer.begin(); } Typer.feed(text); };
    let rec;
    try {
      rec = await B.ask(S, input, { onMeta, onLine });
    } catch (e) {
      S3.think(false);
      Typer.error(typo('Нейросеть молчит: ' + ((e && e.ru) || 'ошибка связи') + '. Вопрос вернули в строку — задайте его ещё раз.'));
      $('q').value = typed || '';
      if (input.card) { G.attach = input.card; renderAttach(); }
      setBusy(false);
      return;
    }
    if (!metaDone) onMeta(rec);
    if (!started) Typer.begin();
    Typer.finish(rec.line);
    await Typer.done();
    afterTurn(rec);
  }

  function afterTurn(rec) {
    const S = G.S;
    setStress(S.stress / 100);
    S3.setMood(rec.mood);
    addTurn(rec);
    renderGauges();
    updateCost();
    const lie = (id) => G.C.lies.find((l) => l.id === id);
    for (const id of rec.exposed) { toast('caught', 'Уличён', '«' + lie(id).claim + '»', 5200); Trace.mark('✕', true); }
    for (const id of rec.admit) toast('caught', 'Признал', '«' + lie(id).claim + '» — неправда', 5200);
    if (rec.exposed.length && !G.closeUp) Sound.sting();
    const done = S.confessed || S.secretRevealed || S.falseConfession;
    if (rec.confession === 'full' || rec.confession === 'false') {
      toast('news', S.falseConfession && rec.confession === 'false' ? 'Сломался' : G.C.truth.guilty ? 'Признание' : 'Он раскрылся',
        rec.confession === 'false' ? 'Он готов подписать что угодно. Решайте.' : 'Можно принимать решение: кнопка «Решение».', 6500);
    } else if (rec.brokeNow) {
      toast('caught', 'Легенда рухнула', 'Ещё один вопрос — и он заговорит.', 5200);
    }
    // вернуть камеру через паузу
    if (G.closeUp && !done) setTimeout(() => { if (G.phase === 'interrogation' && !G.busy) { S3.setCamera('seat'); G.closeUp = false; } }, 2600);
    // новые улики: стук, дверь, опер
    if (rec.arrived && rec.arrived.length) {
      setTimeout(() => {
        if (G.phase !== 'interrogation') return;
        S3.knock(); Sound.knock();
        rec.arrived.forEach((id) => G.fresh.add(id));
        const e = B.evidenceById(S, rec.arrived[0]);
        setTimeout(() => { toast('news', 'Стук в дверь', 'Опер принёс улику: «' + e.title + '»', 5600); renderHand(); }, 700);
      }, 1100);
    }
    const left = B.tapeLeft(S);
    if (left <= 0) {
      setBusy(false);
      setTimeout(() => openVerdict(true), 1600);
      return;
    }
    if (left < 300 && left + 200 > 300) toast('err', 'Плёнка', 'Осталось меньше пяти минут записи.');
    setBusy(false);
    if (!touch) $('q').focus({ preventScroll: true });
  }

  // ================================================================
  //   РЕШЕНИЕ И ФИНАЛ
  // ================================================================
  function openVerdict(forced) {
    if (!G.S || G.busy) return;
    const f = G.C.seed.sex === 'f';
    $('vText').textContent = typo(forced ? 'Плёнка кончилась. Пора решать.' : 'Допрос закончится, и вы узнаете правду. Что дальше?');
    $('vCharge').textContent = typo(f ? 'Она это сделала — дело уходит в суд.' : 'Он это сделал — дело уходит в суд.');
    $('vRelease').textContent = typo(f ? 'Она этого не делала — пусть идёт домой.' : 'Он этого не делал — пусть идёт домой.');
    show('verdictBack', !forced);
    show('verdictModal', true);
    setTimeout(() => document.querySelector('.choice').focus({ preventScroll: true }), 50);
  }
  $('verdictBtn').addEventListener('click', () => openVerdict(false));
  $('verdictBack').addEventListener('click', () => show('verdictModal', false));
  document.querySelectorAll('.choice').forEach((b) => b.addEventListener('click', () => { show('verdictModal', false); finale(b.dataset.v); }));

  async function finale(verdict) {
    const S = G.S, c = G.C;
    S.ended = true; G.verdict = verdict;
    const ending = B.judge(S, verdict); G.ending = ending;
    setPhase('finale');
    S3.setRecording(false); Sound.tapeStop();
    S3.finale(verdict === 'charge' ? 'charge' : 'release');
    setTimeout(() => Sound.final(ending.good), 900);
    buildReport(S, c, ending, verdict);
    await sleep(1300);
    if (G.phase !== 'finale') return;
    screens('finale');
    $('finale').querySelector('.report').scrollTop = 0;
    // эпилог потоком
    const epi = $('fEpi'); epi.textContent = '…'; G.epiDone = false;
    try {
      const text = await B.epilogue(S, verdict, ending, (d, full) => { epi.textContent = typo(full); });
      epi.textContent = typo(text);
    } catch (e) {
      epi.textContent = typo(ending.good ? 'Протокол подшили к делу. Наутро в городе шёл дождь.' : 'Дело ушло в архив. Кто-то в этом городе спит спокойно.');
    }
    G.epiDone = true;
    updateCost();
    // следующее дело готовим заранее, пока игрок читает правду (не сразу — вдруг он просто закроет вкладку)
    setTimeout(() => { if (!SHOT && G.phase === 'finale' && !AI.demo && AI.hasKey() && !G.next) G.next = prepareCase(); }, 25000);
  }

  function buildReport(S, c, ending, verdict) {
    const f = c.seed.sex === 'f', he = f ? 'она' : 'он';
    $('fKicker').textContent = typo('Дело №' + NB + c.seed.caseNo + ' · «' + c.title + '» · ' + (verdict === 'charge' ? 'обвинение предъявлено' : (f ? 'отпущена' : 'отпущен')));
    $('fTitle').textContent = typo(ending.title);
    const st = $('fStamp'); st.textContent = ending.good ? 'Верно' : 'Ошибка';
    st.style.color = st.style.borderColor = ending.good ? '#2f5a3a' : '';
    $('fText').textContent = typo(ending.text);
    $('fTruth').textContent = typo(c.truth.what + (c.truth.guilty ? '' : ' Виновен: ' + c.truth.culprit + '.'));
    const secret = String(c.truth.secret || '').replace(/^(он|она)\s+(скрывает|скрывал|скрывала|прячет)[,:]?\s*/i, '');
    $('fSecret').textContent = secret ? typo((f ? 'Что она скрывала: ' : 'Что он скрывал: ') + secret) : '';
    // опоры легенды: когда сказал, когда и чем выбили
    const ul = $('fLies'); ul.textContent = '';
    const minute = (n) => (S.turns[n - 1] ? S.turns[n - 1].minute : 1);
    for (const l of c.lies) {
      const li = h('li');
      const broken = S.exposed[l.id] || S.admitted[l.id];
      li.appendChild(h('div', 'lie-claim' + (broken ? ' broken' : ''), '«' + typo(l.claim) + '»'));
      li.appendChild(h('div', 'lie-truth', typo(l.truth)));
      let status;
      if (S.exposed[l.id]) {
        const by = S.exposedBy[l.id] || {};
        const how = by.type === 'evidence' ? 'уликой «' + B.evidenceById(S, by.id).title + '»' : by.type === 'quote' ? 'его же словами' : 'фактом';
        status = (S.told[l.id] && S.told[l.id] < S.exposed[l.id] ? 'сказал' + (f ? 'а' : '') + ' на ' + minute(S.told[l.id]) + '-й минуте · ' : '') + 'уличён' + (f ? 'а' : '') + ' на ' + minute(S.exposed[l.id]) + '-й минуте ' + how;
      } else if (S.admitted[l.id]) status = 'признал' + (f ? 'а' : '') + ' сам' + (f ? 'а' : '') + ' на ' + minute(S.admitted[l.id]) + '-й минуте';
      else if (S.told[l.id]) status = 'сказал' + (f ? 'а' : '') + ' на ' + minute(S.told[l.id]) + '-й минуте — ложь устояла';
      else status = 'до этой лжи допрос не дошёл';
      li.appendChild(h('div', 'lie-status' + (broken ? ' hit' : ''), typo(status)));
      ul.appendChild(li);
    }
    // протокол с пометками правды
    const ol = $('fProto'); ol.textContent = '';
    const row = (min, q, a, note) => {
      const li = h('li'); li.appendChild(h('span', 'a-min', min));
      if (q) li.appendChild(h('span', 'a-q', q));
      li.appendChild(h('span', 'a-a', typo(a)));
      if (note) li.appendChild(h('span', 'a-note', typo(note)));
      ol.appendChild(li);
    };
    row('00 мин', '', c.opening, '');
    for (const t of S.turns) {
      const card = t.card && t.card.type === 'evidence' ? '[' + B.evidenceById(S, t.card.id).title + '] ' : t.card && t.card.type === 'quote' ? '[его слова] ' : '';
      row(pad2(t.minute) + ' мин', '— ' + card + (t.silent && !t.q ? '(молчание)' : typo(t.q)), t.line, t.lie ? t.lieNote || 'здесь ' + he + ' врал' + (f ? 'а' : '') : '');
    }
    if (!S.turns.length) row('—', '', 'Вопросов не было.', '');
    // цифры
    const dl = $('fStats'); dl.textContent = '';
    const stat = (k, v) => { const d = h('div'); d.append(h('dt', null, k), h('dd', null, v)); dl.appendChild(d); };
    stat('Вопросов', String(S.turns.length));
    stat('Плёнка', fmtTape(S.tapeUsed));
    stat('Пик стресса', String(Math.round(S.maxStress)));
    stat(AI.demo ? 'Режим' : 'Нейросеть', AI.demo ? 'демо' : '$' + AI.usage.costUSD.toFixed(4));
  }
  $('againBtn').addEventListener('click', () => { G.S = null; showTitle(); if (!AI.demo && AI.hasKey()) newCase(); });
  $('replayBtn').addEventListener('click', () => { Sound.click(); startInterrogation(); });

  // ================================================================
  //   ВЕРХНЯЯ СТРОКА, КЛАВИШИ
  // ================================================================
  $('menuBtn').addEventListener('click', () => {
    if (G.busy) return;
    if (G.phase === 'generating') leaveGen();
    show('verdictModal', false); closeHand();
    showTitle();
  });
  $('newCaseBtn').addEventListener('click', () => newCase());
  $('demoCaseBtn').addEventListener('click', () => { Sound.click(); startDemo(); });
  $('resumeBtn').addEventListener('click', () => resumeInterrogation());
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('verdictModal').hidden && !$('verdictBack').hidden) show('verdictModal', false);
    else if (!$('hand').hidden) closeHand();
    else if (G.phase === 'interrogation') closeProto(true);
  });

  // ================================================================
  //   3D: запуск, запасной режим, синхронизация
  // ================================================================
  function currentLook() {
    if (G.C) return G.C.seed.look;
    if (G.job) return G.job.seed.look;
    if (G.next) return G.next.seed.look;
    return D.DEMO_CASE.seed.look;
  }
  function syncScene() {
    const S = G.S;
    if (G.phase === 'interrogation' && S) {
      for (const id of Object.keys(S.used)) S3.present(B.evidenceById(S, id), true);
      setStress(S.stress / 100, true);
      S3.setCamera('seat', true); S3.setRecording(true);
      renderGauges();
    } else S3.setCamera(G.phase === 'finale' ? 'wide' : 'establish', true);
    S3.setShift(shiftX(), shiftY(), true);
  }
  let started3D = false;
  const App = window.App = {
    start3D(THREE, addons) {
      if (started3D) return;
      started3D = true;
      try {
        const t0 = performance.now();
        S3 = window.Scene3D.create(THREE, addons, $('stage'), { shot: SHOT, look: currentLook() });
        G.createMs = Math.round(performance.now() - t0);
        G.has3D = true;
        S3.events.onImpact = () => Sound.thud();
        syncScene();
        if (SHOT) stageShot3D();
        if (document.fonts) document.fonts.ready.then(() => S3.refreshText());
      } catch (e) {
        App.no3D('webgl');
      }
    },
    no3D(why) {
      if (G.has3D) return;
      started3D = true;
      document.body.classList.add('no3d');
      const n = $('no3dNote'); n.hidden = false;
      n.textContent = why === 'webgl' ? 'Браузер не дал WebGL — допрос идёт без картинки.' : 'Нет связи с CDN — 3D-комната не загрузилась. Допрос идёт без картинки.';
      setTimeout(() => { n.hidden = true; }, 9000);
    },
    // для проверки из _tools/shot --actions
    test: {
      live() { AI.shot = false; AI.demo = !AI.hasKey(); updateDemoFlag(); showTitle(); return AI.demo ? 'demo' : 'live'; },
      async caseReady() { const t0 = performance.now(); while (G.phase === 'generating' && performance.now() - t0 < 200000) await sleep(500); return { phase: G.phase, sec: Math.round((performance.now() - t0) / 1000), title: G.C && G.C.title, guilty: G.C && G.C.truth.guilty, suspect: G.C && G.C.suspect.name, lies: G.C && G.C.lies.map((l) => l.id + ': ' + l.claim), evidence: G.C && G.C.evidence.map((e) => e.id + ' ' + e.title + ' → ' + e.hits.join(',')), cost: AI.usage.costUSD }; },
      async idle(limit = 90000) {
        const t0 = performance.now(), late = () => performance.now() - t0 > limit;
        await sleep(300);
        while ((G.busy || !$('aText').textContent) && !late()) await sleep(200);
        await Promise.race([Typer.done(), sleep(Math.max(0, limit - (performance.now() - t0)))]);
        await sleep(200);
        const t = G.S && G.S.turns[G.S.turns.length - 1];
        const base = { ms: Math.round(performance.now() - t0), timeout: late(), busy: G.busy, shown: $('aText').textContent.slice(0, 160) };
        return t ? Object.assign(base, { n: t.n, min: t.minute, q: t.q, card: t.card, a: t.line, stress: Math.round(t.stress), mood: t.mood, gesture: t.gesture, lie: t.lie, lieNote: t.lieNote, told: t.told, exposed: t.exposed, admit: t.admit, caught: B.caughtIds(G.S), conf: t.confession, hand: G.S.hand.join(',') }) : base;
      },
      async finaleReady() { const t0 = performance.now(); while ((G.phase !== 'finale' || !G.epiDone) && performance.now() - t0 < 60000) await sleep(300); await sleep(500); return { phase: G.phase, title: $('fTitle').textContent, epi: $('fEpi').textContent, cost: AI.usage.costUSD, calls: AI.usage.calls, tokens: AI.usage.promptTokens + '+' + AI.usage.completionTokens }; },
      state() { return { phase: G.phase, busy: G.busy, turns: G.S && G.S.turns.length, cost: AI.usage.costUSD, createMs: G.createMs, parts: S3.timing ? S3.timing() : '' }; },
      click(sel) { const e = document.querySelector(sel); if (!e) return 'нет ' + sel; e.click(); return 'ok ' + sel; },
    },
  };
  // если модуль с three.js не выполнился (нет сети), к DOMContentLoaded 3D так и не стартует
  document.addEventListener('DOMContentLoaded', () => { setTimeout(() => { if (!started3D) App.no3D('cdn'); }, 50); });

  // ================================================================
  //   ОБЛОЖКА (__SHOT__): середина допроса по демо-делу
  // ================================================================
  function stageShot() {
    const sc = D.SHOT_SCENE;
    G.staticCover = true;   // обложка — застывший кадр: самописец заполнен заранее и не движется
    G.C = B.prepareDemoCase();
    const S = G.S = B.newSession(G.C);
    for (const t of sc.turns) {
      const input = { text: t.q, card: t.card ? { type: 'evidence', id: t.card } : null };
      const raw = { line: t.a, stress: t.stress, mood: t.stress > 60 ? 'scared' : 'guarded', gesture: 'none', lie: t.lie, lieNote: t.lieNote, exposed: t.exposed || [], told: [] };
      B.applyReply(S, input, B.composeUser(S, input), B.normalizeReply(S, raw));
    }
    S.tapeUsed = sc.tapeUsed; S.stress = sc.stress;
    $('protoList').textContent = '';
    addOpening(G.C.opening);
    S.turns.forEach(addTurn);
    $('aWho').textContent = surname();
    enterHUD();
    $('protocol').classList.toggle('closed', window.innerWidth <= 1180);
    const last = S.turns[S.turns.length - 1];
    const ql = $('qLine'); ql.textContent = '';
    ql.appendChild(h('span', 'q-card', '[кладёт на стол: ' + B.evidenceById(S, last.card.id).title + '] '));
    ql.appendChild(document.createTextNode('— ' + typo(last.q)));
    Typer.instant(last.line);
    G.stress = G.stressT = sc.stress / 100;
    $('stressNum').textContent = sc.stress;
    requestAnimationFrame(() => {
      Trace.resize();
      Trace.prefill([{ s: 0.3, label: '▶' }, { s: 0.36, label: '1' }, { s: 0.42, label: '2' }, { s: 0.6, label: '✕', hot: true }, { s: 0.5, label: '3' }, { s: 0.56, label: '4' }, { s: 0.72, label: '✕', hot: true }]);
      Trace.draw();
    });
  }
  function stageShot3D() {
    const S = G.S;
    S3.clearCards();
    for (const id of D.SHOT_SCENE.usedCards) S3.present(B.evidenceById(S, id), true);
    S3.setStressNow(D.SHOT_SCENE.stress / 100); S3.setMood('scared');
    S3.holdGaze('cam');
    S3.setCamera('seat', true);
  }

  // ================================================================
  //   СТАРТ
  // ================================================================
  updateDemoFlag();
  if (SHOT) {
    stageShot();
  } else {
    if (AI.hasKey() && !AI.demo) G.next = prepareCase();   // первое дело готовится, пока игрок читает титул
    showTitle();
  }
  requestAnimationFrame(loop);
})();
