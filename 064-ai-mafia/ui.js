/* ================================================================
   ui.js — всё, что поверх 3D: облачка реплик у голов, таблички имён,
   баннеры фаз, протокол, нижняя панель, голоса (speechSynthesis)
   и тихий синтезированный звук комнаты.
   ================================================================ */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // неразрывные пробелы после коротких слов и перед тире — чтобы не висли предлоги и тире не начинало строку
  const nb = (s) => esc(s).replace(/(^|[\s(«])([вксоуиаВКСОУИА]|по|на|за|от|до|из|не|но|об|во|со|ко|же|ли|бы|По|На|За|От|До|Из|Не|Но)\s/g, '$1$2 ').replace(/ — /g, ' — ');
  const mq = window.matchMedia('(max-width: 760px)');

  const UI = { esc, nb, mobile: () => mq.matches };

  // Пишем в DOM только целые пиксели и только при изменении: на слабых машинах
  // (и на программном рендере) каждое лишнее смещение слоя стоит перекомпоновки кадра.
  function setXY(node, x, y) {
    const k = Math.round(x) + ',' + Math.round(y);
    if (node._xy === k) return;
    node._xy = k;
    node.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }

  /* ---------- облачка ---------- */
  const bubbleLayer = $('#bubbles');
  const bubbles = new Set();
  UI.bubble = function (seat, opts = {}) {
    const b = el('div', 'bubble' + (opts.kind ? ' ' + opts.kind : '') + (seat === 0 ? ' me' : ''));
    const name = el('div', 'b-name', esc(opts.name || ''));
    const text = el('div', 'b-text');
    const dots = el('div', 'b-dots', '<i></i><i></i><i></i>');
    b.append(name, text, dots);
    if (opts.thinking) b.classList.add('thinking');
    bubbleLayer.appendChild(b);
    const obj = {
      seat, node: b, born: performance.now(), dead: false, full: '', shown: 0,
      set(t) { this.full = t; },
      reveal(n) {
        if (this.shown === n && this._rev) return;
        this.shown = n; this._rev = true;
        text.innerHTML = nb(this.full.slice(0, n)) + (n < this.full.length ? '<span class="caret"></span>' : '');
      },
      thinking(on) { b.classList.toggle('thinking', !!on); },
      fade() { b.classList.add('old'); },
      close(delay = 0) {
        if (this.dead) return;
        this.dead = true;
        setTimeout(() => { b.classList.add('gone'); setTimeout(() => { b.remove(); bubbles.delete(obj); }, 420); }, delay);
      },
    };
    requestAnimationFrame(() => b.classList.add('in'));
    bubbles.add(obj);
    for (const o of bubbles) if (o !== obj && !o.dead && opts.kind !== 'heck' && !o.node.classList.contains('heck')) o.fade();
    return obj;
  };
  UI.clearBubbles = function () { for (const o of bubbles) o.close(0); };
  UI.inset = 0;
  UI.insetL = 0;
  // на телефоне облачко стоит над нижней панелью: её высота меняется (кнопки, подсказки)
  const dockEl = $('#dock');
  function dockGap() {
    const r = dockEl.getBoundingClientRect();
    const shown = r.height > 0 && getComputedStyle(dockEl).opacity !== '0';
    return shown ? window.innerHeight - r.top + 10 : 16;
  }
  function placeBubbles() {
    if (!window.Stage || !Stage.anchor) return;
    const docked = mq.matches;
    const W = window.innerWidth - (docked ? 0 : UI.inset);
    for (const o of bubbles) {
      const b = o.node;
      if (docked && !b.classList.contains('heck')) {
        b.classList.add('docked');
        if (b._xy) { b._xy = ''; b.style.transform = ''; }
        const bottom = Math.round(dockGap()) + 'px';
        if (b.style.bottom !== bottom) b.style.bottom = bottom;
        continue;
      }
      if (b.style.bottom) b.style.bottom = '';
      b.classList.remove('docked');
      const w = b.offsetWidth, h = b.offsetHeight;
      let x, y;
      if (b.classList.contains('heck')) {
        // реплика с места — сбоку от головы, чтобы не спорить с основным облачком
        const hd = Stage.head(o.seat);
        const left = hd.x < (W / 2);
        x = left ? hd.x - w - 34 : hd.x + 34;
        y = hd.y - h / 2 - 10;
        b.classList.toggle('to-right', !left);
      } else {
        const a = Stage.anchor(o.seat);
        x = a.x - w / 2; y = a.y - h - 14;
        if (o.seat === 0) { x = UI.insetL + (W - UI.insetL - w) / 2; y = window.innerHeight - (docked ? 210 : 176) - h; }
        else if (Stage.lampBox) {
          // абажур — главный свет сцены: облачко не закрывает его, а уходит вбок
          // Облачко сдвигается вбок так, чтобы хвостик остался над головой говорящего:
          // абажур закрыт лишь наполовину. Сторона выбирается один раз (где больше места),
          // выход из обхода — с запасом, чтобы облачко не прыгало.
          const L = Stage.lampBox(), m = o.dodge ? 30 : 10;
          const bx = Math.max(12, Math.min(W - w - 12, x)), by = Math.max(docked ? 64 : 76, y);
          if (bx < L.x1 + m && bx + w > L.x0 - m && by < L.y1 + m && by + h > L.y0 - m) {
            if (!o.dodge) o.dodge = a.x > (UI.insetL + W) / 2 ? -1 : 1;
            x = o.dodge < 0 ? a.x - w + 34 : a.x - 34;
          } else o.dodge = 0;
        }
        const tail = Math.round(Math.max(18, Math.min(w - 18, a.x - Math.max(12, Math.min(W - w - 12, x)))));
        if (b._tail !== tail) { b._tail = tail; b.style.setProperty('--tail', tail + 'px'); }
      }
      const minY = docked ? 64 : 76;
      x = Math.max(12, Math.min(W - w - 12, x));
      y = Math.max(minY, y);
      setXY(b, x, y);
    }
  }

  /* ---------- таблички имён ---------- */
  const plateLayer = $('#plates');
  const plates = [];
  UI.makePlates = function (players) {
    plateLayer.innerHTML = '';
    plates.length = 0;
    for (const p of players) {
      if (p.seat === 0) continue;
      const d = el('button', 'plate');
      d.type = 'button';
      d.dataset.seat = p.seat;
      d.innerHTML = `<span class="p-name">${esc(p.name)}</span><span class="p-sub">${esc(p.who || '')}</span><span class="p-votes"></span>`;
      plateLayer.appendChild(d);
      plates[p.seat] = d;
    }
  };
  UI.plate = (seat) => plates[seat];
  UI.plateState = function (seat, st) {
    const d = plates[seat];
    if (!d) return;
    d._dirty = true;
    if ('sub' in st) d.querySelector('.p-sub').textContent = st.sub;
    if ('dead' in st) d.classList.toggle('dead', !!st.dead);
    if ('role' in st) { d.dataset.role = st.role || ''; }
    if ('tag' in st) d.dataset.tag = st.tag || '';
    if ('votes' in st) { const v = d.querySelector('.p-votes'); v.textContent = st.votes ? String(st.votes) : ''; d.classList.toggle('voted', !!st.votes); }
    if ('pick' in st) d.classList.toggle('pickable', !!st.pick);
    if ('speaking' in st) d.classList.toggle('speaking', !!st.speaking);
  };
  function placePlates() {
    if (!window.Stage || !Stage.plate) return;
    for (let i = 1; i < plates.length; i++) {
      const d = plates[i];
      if (!d) continue;
      const a = Stage.plate(i);
      if (d._w == null || d._dirty) { d._w = d.offsetWidth; d._dirty = false; }
      setXY(d, a.x - d._w / 2, a.y - 8);
    }
  }

  UI.frame = function () { placeBubbles(); placePlates(); };

  /* ---------- баннер фазы ---------- */
  const banner = $('#banner');
  let bannerTimer = 0;
  UI.banner = function (big, small, ms = 2200, cls = '') {
    banner.className = 'banner ' + cls;
    banner.querySelector('.b-big').textContent = big;
    banner.querySelector('.b-small').innerHTML = small ? nb(small) : '';
    void banner.offsetWidth;
    banner.classList.add('on');
    clearTimeout(bannerTimer);
    return new Promise((res) => {
      bannerTimer = setTimeout(() => { banner.classList.remove('on'); res(); }, ms);
    });
  };
  UI.bannerOff = () => { clearTimeout(bannerTimer); banner.classList.remove('on'); };

  /* ---------- фаза в шапке ---------- */
  UI.phase = function (a, b) {
    $('#phase').innerHTML = `<b>${esc(a)}</b>${b ? ' · ' + esc(b) : ''}`;
  };

  /* ---------- протокол ---------- */
  const logBody = $('#logBody');
  UI.logClear = () => { logBody.innerHTML = ''; };
  UI.log = function (kind, html) {
    const d = el('div', 'l-' + kind, html);
    logBody.appendChild(d);
    logBody.scrollTop = logBody.scrollHeight;
    return d;
  };
  UI.logLine = function (name, text, extra = '') {
    return UI.log('line', `<b>${esc(name)}${extra}</b><span>${nb(text)}</span>`);
  };

  /* ---------- уведомление ---------- */
  const toast = $('#toast');
  let toastT = 0;
  UI.toast = function (t, ms = 3200) {
    toast.innerHTML = nb(t);
    toast.classList.add('on');
    clearTimeout(toastT);
    toastT = setTimeout(() => toast.classList.remove('on'), ms);
  };

  /* ---------- голоса: speechSynthesis ---------- */
  const Voice = (UI.Voice = {
    ok: false, on: false, list: [],
    init() {
      if (!('speechSynthesis' in window)) return;
      const load = () => {
        try {
          this.list = speechSynthesis.getVoices().filter((v) => /^ru/i.test(v.lang));
          const was = this.ok;
          this.ok = this.list.length > 0;
          if (this.ok && !was && this.wanted) this.on = true;
          UI.onVoiceChange && UI.onVoiceChange();
        } catch (e) { this.ok = false; }
      };
      load();
      try { speechSynthesis.addEventListener('voiceschanged', load); } catch (e) { /* старые браузеры */ }
    },
    pick(male) {
      const fem = /milena|katya|irina|alena|elena|anna|tatyana|svetlana|female|жен|google/i;
      const mal = /yuri|dmitr|pavel|maxim|ivan|nikolai|male|муж/i;
      const good = this.list.filter((v) => (male ? mal.test(v.name) && !/female/i.test(v.name) : fem.test(v.name)));
      return good[0] || this.list[0] || null;
    },
    speak(text, spec) {
      if (!this.on || !this.ok || !text) return Promise.resolve(false);
      return new Promise((res) => {
        let done = false;
        const fin = () => { if (!done) { done = true; clearTimeout(t); res(true); } };
        const t = setTimeout(fin, 2500 + text.length * 95);
        try {
          const u = new SpeechSynthesisUtterance(text);
          u.lang = 'ru-RU';
          const v = spec && spec.voice ? spec.voice : { male: true, pitch: 1, rate: 1 };
          const voice = this.pick(v.male);
          if (voice) u.voice = voice;
          // один голос на всех — различаем высотой и темпом
          u.pitch = Math.max(0.1, Math.min(2, v.pitch || 1));
          u.rate = Math.max(0.5, Math.min(2, (v.rate || 1) * 1.08));
          u.volume = 0.9;
          u.onend = fin; u.onerror = fin;
          speechSynthesis.speak(u);
        } catch (e) { fin(); }
      });
    },
    cancel() { try { if ('speechSynthesis' in window) speechSynthesis.cancel(); } catch (e) { /* пусто */ } },
  });

  /* ---------- звук комнаты: дождь, часы, удары ---------- */
  const Sfx = (UI.Sfx = {
    ctx: null, master: null, on: true, rain: null,
    init() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = (this.ctx = new AC());
      this.master = ctx.createGain();
      this.master.gain.value = this.on ? 0.55 : 0;
      this.master.connect(ctx.destination);
      // шум для дождя
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let b0 = 0;
      for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b0 = 0.97 * b0 + 0.03 * w; d[i] = w * 0.5 + b0 * 2.5; }
      this.noise = buf;
      const src = ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.4;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(bp).connect(g).connect(this.master);
      src.start();
      g.gain.linearRampToValueAtTime(0.07, ctx.currentTime + 3);
      this.rain = g;
      // часы
      this.tickTimer = setInterval(() => this.tick(), 1000);
    },
    setOn(on) {
      this.on = on;
      if (this.master) this.master.gain.setTargetAtTime(on ? 0.55 : 0, this.ctx.currentTime, 0.2);
    },
    env(node, t, a, peak, dur) {
      node.gain.setValueAtTime(0.0001, t);
      node.gain.exponentialRampToValueAtTime(peak, t + a);
      node.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    },
    tone(freq, dur, type = 'sine', peak = 0.2, a = 0.01, when = 0) {
      if (!this.ctx || !this.on) return;
      const t = this.ctx.currentTime + when;
      const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
      const g = this.ctx.createGain();
      this.env(g, t, a, peak, dur);
      o.connect(g).connect(this.master);
      o.start(t); o.stop(t + dur + 0.05);
      return o;
    },
    burst(dur, freq, peak = 0.2, q = 1, when = 0) {
      if (!this.ctx || !this.on) return;
      const t = this.ctx.currentTime + when;
      const s = this.ctx.createBufferSource(); s.buffer = this.noise;
      const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
      const g = this.ctx.createGain();
      this.env(g, t, 0.004, peak, dur);
      s.connect(f).connect(g).connect(this.master);
      s.start(t, Math.random()); s.stop(t + dur + 0.05);
    },
    tick() { if (!document.hidden) this.burst(0.03, 3200, 0.018, 6); },
    knock() { this.tone(90, 0.3, 'sine', 0.35, 0.005); this.burst(0.08, 400, 0.12, 1.5); },
    slam() { this.tone(70, 0.4, 'sine', 0.45, 0.004); this.burst(0.12, 300, 0.25, 1); for (let i = 0; i < 4; i++) this.tone(2400 + i * 310, 0.18, 'triangle', 0.02, 0.002, 0.03 + i * 0.03); },
    flip() { this.burst(0.09, 2200, 0.08, 1.2); },
    pop() { this.tone(660, 0.12, 'sine', 0.05, 0.005); },
    gong() { [98, 147, 196.5].forEach((f, i) => this.tone(f, 3.2, 'sine', 0.09 / (i + 1), 0.02)); },
    heart() { this.tone(55, 0.22, 'sine', 0.3, 0.01); this.tone(52, 0.22, 'sine', 0.22, 0.01, 0.28); },
    thunder() {
      if (!this.ctx || !this.on) return;
      const t = this.ctx.currentTime;
      const s = this.ctx.createBufferSource(); s.buffer = this.noise;
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(90, t + 2.8);
      const g = this.ctx.createGain(); this.env(g, t, 0.05, 0.5, 3.2);
      s.connect(f).connect(g).connect(this.master); s.start(t); s.stop(t + 3.4);
    },
    sting(good) {
      const base = good ? [261.6, 329.6, 392, 523.3] : [220, 261.6, 311.1, 370];
      base.forEach((f, i) => this.tone(f, 2.4, 'triangle', 0.06, 0.02, i * 0.12));
    },
  });

  window.UI = UI;
})();
