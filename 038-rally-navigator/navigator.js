/* ================================================================
   Штурман · живой штурман
   Персонаж на DeepSeek: получает телеметрию и события заезда, отвечает
   короткими репликами с характером, помнит, что было в этом заезде
   и в прошлых. Голос — speechSynthesis ru-RU; стенограмма всегда
   важнее болтовни: реплика ждёт «окна» между порциями стенограммы.
   Без ключа или сети — заготовленные реплики из lines.js.
   ================================================================ */
(function (R) {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const now = () => performance.now() / 1000;
  const pick = (a) => a[(Math.random() * a.length) | 0];
  const nf = (x, d = 1) => (+x).toFixed(d).replace('.', ',');

  const { RULES, CREW, faceSVG } = R.CREWDATA;
  // неразрывные пробелы после коротких слов и перед тире — текст приходит от нейросети
  const SHORTW = '(в|к|с|и|а|о|у|но|на|по|за|от|до|из|не|ни|же|ли|бы|во|со|ко)';
  const reShort = new RegExp('(^|[\\s(«])' + SHORTW + ' ', 'gi');
  const typo = (t) => String(t).replace(reShort, '$1$2\u00A0').replace(reShort, '$1$2\u00A0').replace(/ —/g, '\u00A0—');

  // ---------- память между заездами ----------
  const MEM_KEY = 'rally119.runs';
  const Mem = {
    load() { try { return JSON.parse(localStorage.getItem(MEM_KEY) || '[]') || []; } catch { return []; } },
    save(run) { try { const a = Mem.load(); a.push(run); localStorage.setItem(MEM_KEY, JSON.stringify(a.slice(-6))); } catch {} },
    crew() { try { return localStorage.getItem('rally119.crew'); } catch { return null; } },
    setCrew(id) { try { localStorage.setItem('rally119.crew', id); } catch {} },
  };

  // ---------- голос: стенограмма важнее болтовни ----------
  const Voice = {
    on: true, synth: window.speechSynthesis || null, ru: [], v: null, state: 'idle', notesQ: 0, token: 0, crew: null,
    init() {
      if (!this.synth) return;
      const load = () => { try { this.ru = this.synth.getVoices().filter((v) => /^ru/i.test(v.lang)); this.choose(); } catch { this.ru = []; } };
      load();
      try { this.synth.addEventListener('voiceschanged', load); } catch {}
    },
    choose() {
      if (!this.crew || !this.ru.length) { this.v = this.ru[0] || null; return; }
      const male = /yuri|юрий|maxim|максим|pavel|павел|dmitr|дмитр|male|муж/i, female = /milena|милена|katya|катя|irina|ирина|alena|алёна|алена|female|жен/i;
      const want = this.crew.voice.male ? male : female;
      this.v = this.ru.find((v) => want.test(v.name)) || this.ru.find((v) => /google/i.test(v.name)) || this.ru[0];
    },
    ok() { return this.on && !!this.synth && this.ru.length > 0 && !R.SHOT; },
    utter(text, rate, pitch) {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ru-RU'; if (this.v) u.voice = this.v;
      u.rate = rate; u.pitch = pitch; u.volume = 1;
      return u;
    },
    note(text) {
      if (!this.ok()) return;
      if (this.state === 'line') { this.token++; this.synth.cancel(); this.notesQ = 0; }
      const tok = this.token;
      const u = this.utter(text, this.crew.voice.noteRate, Math.min(1.15, Math.max(0.8, this.crew.voice.pitch * 0.5 + 0.5)));
      this.notesQ++; this.state = 'note';
      u.onend = u.onerror = () => { if (tok !== this.token) return; this.notesQ = Math.max(0, this.notesQ - 1); if (!this.notesQ) this.state = 'idle'; };
      try { this.synth.speak(u); } catch { this.state = 'idle'; }
    },
    line(text, onEnd) {
      if (!this.ok() || this.state !== 'idle') return false;
      const tok = ++this.token;
      const u = this.utter(text, this.crew.voice.rate, this.crew.voice.pitch);
      this.state = 'line';
      u.onend = u.onerror = () => { if (tok !== this.token) return; this.state = 'idle'; onEnd && onEnd(); };
      try { this.synth.speak(u); } catch { this.state = 'idle'; return false; }
      return true;
    },
    // длинный текст — по предложениям: у браузеров длинные фразы иногда обрываются
    speech(text) {
      if (!this.ok()) return;
      this.stop();
      const parts = String(text).match(/[^.!?…]+[.!?…]*/g) || [text];
      const tok = ++this.token;
      this.state = 'line';
      parts.forEach((p, i) => {
        const u = this.utter(p.trim(), this.crew.voice.rate, this.crew.voice.pitch);
        if (i === parts.length - 1) u.onend = u.onerror = () => { if (tok === this.token) this.state = 'idle'; };
        try { this.synth.speak(u); } catch {}
      });
    },
    stop() { if (!this.synth) return; this.token++; try { this.synth.cancel(); } catch {} this.state = 'idle'; this.notesQ = 0; },
  };

  // ---------- реплики на экране ----------
  const Bubbles = {
    list: [],
    add(text, cls) {
      const box = $('navLines');
      const el = document.createElement('div');
      el.className = 'line is-new' + (cls ? ' ' + cls : '');
      el.textContent = typo(text);
      box.appendChild(el);
      const b = { el, born: now(), text };
      this.list.push(b);
      while (this.list.length > 3) { const o = this.list.shift(); o.el.remove(); }
      this.list.forEach((x, i) => x.el.classList.toggle('is-old', i < this.list.length - 1));
      return b;
    },
    set(b, text) { b.text = text; b.el.textContent = typo(text); b.born = now(); },
    tick() {
      const t = now();
      for (const b of this.list) if (!b.keep && t - b.born > 11 && !b.el.classList.contains('is-gone')) b.el.classList.add('is-gone');
      this.list = this.list.filter((b) => { if (!b.keep && t - b.born > 12) { b.el.remove(); return false; } return true; });
    },
    clear() { $('navLines').innerHTML = ''; this.list = []; },
  };

  // ---------- сам штурман ----------
  const PRIO = { crash: 5, spin: 5, overspeed: 5, wrongway: 4, jump: 3, checkpoint: 4, cut: 3, offroad: 3, reset: 4, start: 4, drift: 2, clean: 2, slow: 2, memory: 3, tick: 1 };
  const TTL = { crash: 7, checkpoint: 8, start: 6, reset: 7, memory: 5 };
  const Nav = {
    G: null, crew: CREW[0], queue: [], busy: false, ctrl: null, lastLine: -99, lastAsk: -99, tickT: 0,
    said: [], run: null, pendingSpeak: null, talkUntil: 0, dead: false, memWarned: {},

    init(G) {
      this.G = G;
      R.SHOT = !!(window.AI && AI.shot) || !!window.__SHOT__;
      const saved = Mem.crew();
      this.crew = CREW.find((c) => c.id === saved) || CREW[0];
      if (R.SHOT) this.crew = CREW[0];
      Voice.crew = this.crew; Voice.init();
      this.renderCrew();
      this.applyCrew();
      this.aiState();
      window.AI && (AI.onStatus = (s) => { if (s === 'error') this.aiState(); });
      if (!Voice.synth) $('btnVoice').classList.add('is-off');
    },
    renderCrew() {
      const box = $('crew');
      box.innerHTML = CREW.map((c) => `<button class="crew__card" role="radio" aria-checked="${c.id === this.crew.id}" data-id="${c.id}"><span class="nav__face">${faceSVG(c.face)}</span><span class="crew__name">${c.name}</span><span class="crew__desc">${c.desc}</span></button>`).join('');
      box.querySelectorAll('.crew__card').forEach((b) => b.addEventListener('click', () => {
        this.crew = CREW.find((c) => c.id === b.dataset.id); Mem.setCrew(this.crew.id);
        box.querySelectorAll('.crew__card').forEach((x) => x.setAttribute('aria-checked', x === b ? 'true' : 'false'));
        this.applyCrew();
        this.say(pick(R.LINES[this.crew.id].attract), { voice: false });
      }));
    },
    applyCrew() {
      $('navFace').innerHTML = faceSVG(this.crew.face);
      $('navName').textContent = this.crew.name;
      $('navRole').textContent = 'штурман · ' + this.crew.role;
      Voice.crew = this.crew; Voice.choose();
    },
    aiState() {
      const el = $('aiState'); if (!el) return;
      const demo = !window.AI || AI.demo || this.dead;
      $('demoBadge').hidden = !demo;
      el.textContent = demo ? 'Без ключа нейросети — штурман говорит заготовками.' : 'Штурман на DeepSeek: видит телеметрию и отвечает вживую.';
    },
    toggleVoice() {
      Voice.on = !Voice.on;
      if (!Voice.on) Voice.stop();
      if (Voice.on && !Voice.ok()) R.toast && R.toast('В браузере нет русского голоса — реплики будут текстом', 2600);
      return Voice.on && Voice.ok();
    },
    get demo() { return !window.AI || AI.demo || AI.shot || this.dead; },

    async prepare() {
      if (window.AI && !AI.shot && !this.dead) { try { await AI.ensureKey(); } catch {} }
      this.aiState();
    },
    startRun(ctx) {
      this.stop(true);
      this.run = { ctx, started: now(), lines: [], mem: Mem.load(), debrief: null, grade: null, finished: false };
      this.said = []; this.queue = []; this.tickT = 0; this.lastLine = now(); this.memWarned = {};
      Bubbles.clear();
      Voice.crew = this.crew; Voice.choose();
    },
    stop(keepBubbles) {
      this.gen = (this.gen || 0) + 1;          // ответы старых запросов просто игнорируем (без обрыва соединения)
      this.busy = false; this.queue = []; this.pendingSpeak = null;
      Voice.stop();
      $('navThink').hidden = true;
      if (!keepBubbles) Bubbles.clear();
    },
    readNotes(text) {
      Voice.note(text);
      const n = $('notes'); n.classList.remove('is-call'); void n.offsetWidth; n.classList.add('is-call');
      if (this.pendingSpeak) this.pendingSpeak.wait = Math.max(this.pendingSpeak.wait, now() + 0.2);
    },
    shotLine() {
      Bubbles.add(R.LINES[this.crew.id].shot).keep = true;
      $('navFace').classList.add('is-talk');
    },

    // --- показать реплику (и, если можно, сказать голосом, не мешая стенограмме) ---
    say(text, opts = {}) {
      const b = opts.bubble || Bubbles.add(text);
      if (opts.bubble) Bubbles.set(b, text);
      this.said.push(text); if (this.said.length > 8) this.said.shift();
      this.lastLine = now();
      this.talk(Math.min(4, 0.8 + text.length / 16));
      if (opts.voice !== false && Voice.ok()) this.pendingSpeak = { text, born: now(), wait: now() };
      return b;
    },
    talk(sec) { this.talkUntil = Math.max(this.talkUntil, now() + sec); },

    // сколько секунд до следующей порции стенограммы
    gapToNotes() {
      const G = this.G, T = G.T, n = T.notes[G.caller.next];
      if (!n || G.state !== 'run') return 99;
      const lead = Math.max(55, G.car.speed * 3.3 + 30);
      return Math.max(0, (n.s0 - lead - G.car.s) / Math.max(G.car.speed, 3));
    },

    update(dt, G) {
      const t = now();
      Bubbles.tick();
      $('navFace').classList.toggle('is-talk', t < this.talkUntil || Voice.state === 'line');
      // голосом — только в окно между стенограммой
      const ps = this.pendingSpeak;
      if (ps && t >= ps.wait) {
        const need = ps.text.length / 14 + 0.4;
        if (Voice.state === 'idle' && this.gapToNotes() > need) { Voice.line(ps.text); this.talk(need); this.pendingSpeak = null; }
        else if (t - ps.born > 3.5) this.pendingSpeak = null;   // окно так и не появилось — остаётся текстом
      }
      if (G.state === 'attract' && !R.SHOT) {
        if (t - this.lastLine > 9) this.say(pick(R.LINES[this.crew.id].attract), { voice: false });
        return;
      }
      if (G.state !== 'run' || !this.run) return;
      // события телеметрии
      const tel = G.tel;
      while (tel.events.length) this.onEvent(tel.events.shift(), G);
      this.checkMemory(G);
      // периодическая сводка
      this.tickT += dt;
      if (this.tickT > 9.5 && !this.busy && !this.queue.length && t - this.lastLine > 6) {
        this.tickT = 0;
        this.queue.push({ type: 'tick', t: G.t, born: t, w: tel.takeWindow() });
      }
      this.pump(G);
    },
    onEvent(e, G) {
      if (e.type === 'finish') return;
      const t = now();
      e.born = t;
      // одинаковые события подряд не спамим
      const same = this.queue.find((q) => q.type === e.type);
      if (same && e.type !== 'crash') { Object.assign(same, e); return; }
      this.queue.push(e);
      // мгновенный возглас на резкие события, пока нейросеть думает
      if ((e.type === 'crash' && e.big) || e.type === 'spin' || e.type === 'overspeed') {
        if (t - this.lastLine > 1.2) { this.exclaimBubble = Bubbles.add(pick(R.LINES[this.crew.id].exclaim)); this.talk(0.6); }
      }
      if (e.type === 'checkpoint' || e.type === 'crash') this.tickT = 0;
    },
    // «здесь в прошлый раз…» — память о прошлых заездах
    checkMemory(G) {
      const runs = this.run.mem; if (!runs.length) return;
      const lastRun = runs[runs.length - 1];
      if (!lastRun.crashKm) return;
      const km = (G.car.s - G.T.startS) / 1000;
      for (const c of lastRun.crashKm) {
        const key = c.km.toFixed(2);
        if (this.memWarned[key]) continue;
        if (km > c.km - 0.16 && km < c.km - 0.05) {
          this.memWarned[key] = true;
          this.queue.push({ type: 'memory', born: now(), km: c.km, what: c.what, kmh: c.kmh });
        }
      }
    },
    pump(G) {
      if (this.busy || !this.queue.length) return;
      const t = now();
      this.queue = this.queue.filter((e) => t - e.born < (TTL[e.type] || 4));
      if (!this.queue.length) return;
      this.queue.sort((a, b) => (PRIO[b.type] || 1) - (PRIO[a.type] || 1) || a.born - b.born);
      const e = this.queue[0];
      let gap = (PRIO[e.type] || 1) >= 4 ? 1.2 : (PRIO[e.type] || 1) >= 3 ? 2.2 : 3.6;
      if (e.type === 'crash' && !e.big) gap = 3;
      if (e.type === 'crash' && this.lastCrashLine && t - this.lastCrashLine < 5 && !e.big) gap = 5;
      if (t - this.lastLine < gap && t - this.lastAsk < gap + 1) return;
      this.queue.shift();
      // несколько ударов в очереди — одна реплика про серию
      if (e.type === 'crash') { this.queue = this.queue.filter((q) => q.type !== 'crash'); this.lastCrashLine = t; }
      this.ask(e, G);
    },

    // --- описание события словами для модели ---
    describe(e, G) {
      const st = G.tel.stats;
      switch (e.type) {
        case 'crash': return `удар в ${e.what} на ${e.kmh} км/ч (${e.big ? 'сильный' : 'лёгкий'})${e.where ? ' ' + e.where : ''}, повреждения кузова ${e.damage}%` + (st.crashes > 1 ? `; это уже ${st.crashes}-й удар за заезд` : '; первый удар за заезд');
        case 'drift': return `занос ${e.angle}° длиной ${nf(e.dur)} с на ${e.kmh} км/ч, ${e.clean ? 'вышли из него чисто' : 'закончился ударом'}` + (st.drifts > 1 ? `; заносов за заезд: ${st.drifts}` : '');
        case 'spin': return `машину развернуло на ${e.kmh} км/ч`;
        case 'jump': return `прыжок: ${nf(e.air, 2)} с в воздухе, ${e.dist} м, скорость на кромке ${e.kmh} км/ч, приземление ${e.hard ? 'жёсткое' : 'мягкое'}`;
        case 'cut': return `пилот срезал поворот «${e.note}» внутрь, по обочине` + (e.warned ? ' — хотя в стенограмме было «не резать»!' : '');
        case 'offroad': return `вылетели с дороги ${e.side} на ${e.kmh} км/ч, едем по траве и кустам`;
        case 'overspeed': return `влетаем в поворот «${e.note}» на ${e.kmh} км/ч, а безопасно там около ${e.safe} км/ч — сейчас может вынести`;
        case 'checkpoint': return `контрольная точка ${e.n} из 3: время ${R.fmtTime(e.time)}, ${e.delta <= 0 ? 'опережаем график на ' + nf(-e.delta) : 'отстаём от графика на ' + nf(e.delta)} с`;
        case 'clean': return `${e.corners} поворотов подряд без единой ошибки`;
        case 'slow': return `машина почти стоит (${e.kmh} км/ч) уже несколько секунд, секундомер идёт`;
        case 'wrongway': return 'едем в обратную сторону трассы!';
        case 'reset': return 'пилот застрял, машину вернули на дорогу, штраф 5 с';
        case 'start': return 'старт! только что сорвались с места';
        case 'memory': return `подъезжаем к месту (${nf(e.km)} км), где в прошлом заезде был удар в ${e.what} на ${e.kmh} км/ч — предупреди пилота`;
        case 'tick': {
          const w = e.w || {};
          return `ничего особенного не случилось. Сводка за последние секунды: средняя ${w.avg} км/ч, максимум ${w.vmax}, в заносе ${nf(w.drift)} с (до ${w.maxDrift}°), ударов ${w.hits}, по траве ${nf(w.off)} с. Скажи что-нибудь по делу или по характеру — подбодри, поворчи, вспомни прошлое`;
        }
      }
      return e.type;
    },
    // воспоминания — не в каждой реплике
    memHint() {
      const re = { palych: /шайб|карел|рейд|восемьдесят|полуос|без фар/i, leva: /картинг|форум|блог|трениров/i, vera: /кубок|девят|фар|тормоз.*одн/i }[this.crew.id];
      const recent = this.said.slice(-3).some((x) => re.test(x));
      return recent ? 'Без воспоминаний о прошлых гонках в этот раз — ты недавно вспоминал.' : '';
    },
    telemetry(G) {
      const tel = G.tel, car = G.car, T = G.T, st = tel.stats;
      const km = Math.max(0, (car.s - T.startS) / 1000);
      const d = tel.delta(car.s, G.t);
      const nx = T.notes[G.caller.next];
      const ahead = nx ? `впереди «${nx.words.say}» через ${Math.max(0, Math.round(nx.s0 - car.s))} м` : 'впереди финиш';
      const log = tel.log.filter((x) => x.type !== 'start' && x.type !== 'finish').slice(-8)
        .map((x) => R.fmtTime(x.t) + ' — ' + this.short(x)).join('; ');
      return [
        `Время ${R.fmtTime(G.t + st.penalties)}, пройдено ${nf(km)} из 4,1 км, скорость ${Math.round(car.speed * 3.6)} км/ч, максимум за заезд ${Math.round(st.maxKmh)}.`,
        `График: ${d <= 0 ? 'опережаем на ' + nf(-d) : 'отстаём на ' + nf(d)} с. Кузов: повреждения ${Math.round(car.damage * 100)}%. ${ahead}.`,
        log ? `Что было в этом заезде: ${log}.` : 'В этом заезде пока без происшествий.',
        this.said.length ? `Твои последние реплики (не повторяйся): ${this.said.slice(-5).map((s) => '«' + s + '»').join(' ')}` : '',
        this.memHint(),
      ].filter(Boolean).join('\n');
    },
    short(x) {
      const w = x.where ? ' ' + x.where : '';
      return this.short0(x) + w;
    },
    short0(x) {
      switch (x.type) {
        case 'crash': return `удар в ${x.what} ${x.kmh} км/ч${x.big ? ' (сильный)' : ''}`;
        case 'drift': return `занос ${x.angle}°${x.clean ? '' : ' с ударом'}`;
        case 'spin': return 'разворот';
        case 'jump': return `прыжок ${nf(x.air)} с${x.hard ? ', жёстко' : ''}`;
        case 'cut': return 'срез' + (x.warned ? ' вопреки «не резать»' : '');
        case 'offroad': return 'вылет в траву';
        case 'overspeed': return 'перелёт в поворот';
        case 'checkpoint': return `КП${x.n} ${x.delta <= 0 ? '−' + nf(-x.delta) : '+' + nf(x.delta)} с`;
        case 'clean': return `${x.corners} чистых поворотов`;
        case 'reset': return 'вытаскивали, штраф';
        case 'wrongway': return 'ехали не туда';
        case 'slow': return 'стояли';
      }
      return x.type;
    },
    pastRuns() {
      const runs = this.run ? this.run.mem : Mem.load();
      if (!runs.length) return 'Это ваш первый совместный заезд.';
      const names = { palych: 'Палыч', leva: 'Лёва', vera: 'Вера' };
      return 'Прошлые заезды этого пилота (можно вспомнить): ' + runs.slice(-3).map((r) =>
        (r.crew === this.crew.id ? 'с тобой: ' : 'со штурманом ' + (names[r.crew] || 'другим') + ': ') + (r.finished ? R.fmtTime(r.time) + ` (${r.delta <= 0 ? '−' : '+'}${nf(Math.abs(r.delta))} к графику)` : 'не доехали') + `, ударов ${r.crashes}, лучший занос ${r.maxDrift}°` + (r.grade ? `, ты поставил ${r.grade}/10` : '') + (r.crashKm && r.crashKm[0] ? `, сильнее всего ударились на ${nf(r.crashKm[0].km)} км` : '')).join('; ') + '.';
    },
    system() { return this.crew.persona + '\n\n' + RULES + '\n\n' + this.pastRuns(); },

    // --- заготовки для демо-режима ---
    canned(e, G) {
      const L = R.LINES[this.crew.id], st = G.tel.stats;
      let key = e.type;
      const vars = { kmh: e.kmh, angle: e.angle, dur: e.dur != null ? nf(e.dur) : '', air: e.air != null ? nf(e.air) : '', dist: e.dist, what: e.what, n: e.n || e.corners, dmg: e.damage };
      if (e.type === 'crash') { key = st.crashes > 2 ? 'crash_again' : e.big ? 'crash_big' : 'crash'; vars.n = st.crashes; }
      if (e.type === 'drift' && !e.clean) key = 'drift_dirty';
      if (e.type === 'jump' && e.hard) key = 'jump_hard';
      if (e.type === 'cut' && e.warned) key = 'cut_warned';
      if (e.type === 'checkpoint') { key = e.delta <= 0 ? 'checkpoint_good' : 'checkpoint_bad'; vars.delta = nf(Math.abs(e.delta)) + ' с'; }
      if (e.type === 'memory') return `Внимание: тут в прошлый раз ${e.what} поймали на ${e.kmh}. Аккуратнее!`;
      if (e.type === 'tick') {
        const d = G.tel.delta(G.car.s, G.t);
        key = d < -1 ? 'tick_good' : d > 2 ? 'tick_bad' : 'tick';
        vars.delta = nf(Math.abs(d)) + ' с'; vars.kmh = (e.w && e.w.avg) || Math.round(G.car.speed * 3.6);
      }
      const arr = L[key] || L.tick;
      const fresh = arr.filter((s) => !this.said.some((x) => x.startsWith(s.slice(0, 12))));
      return (pick(fresh.length ? fresh : arr)).replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : ''));
    },

    // --- запрос к нейросети с потоковым выводом ---
    async ask(e, G) {
      this.busy = true; this.lastAsk = now();
      const bubble = this.exclaimBubble && now() - this.exclaimBubble.born < 2 ? this.exclaimBubble : null;
      this.exclaimBubble = null;
      if (this.demo) {
        const text = this.canned(e, G);
        setTimeout(() => { this.say(text, { bubble }); this.busy = false; }, 260 + Math.random() * 380);
        return;
      }
      $('navThink').hidden = false;
      const user = this.telemetry(G) + '\n\nСОБЫТИЕ: ' + this.describe(e, G) + '\n\nТвоя реплика:';
      let b = bubble, started = false;
      const gen = this.gen || 0;
      try {
        const text = await AI.chat([{ role: 'user', content: user }], {
          system: this.system(), maxTokens: 70, temperature: 0.95, timeout: 12000,
          onToken: (d, full) => {
            if (gen !== (this.gen || 0)) return;
            const clean = this.clean(full, true);
            if (!clean) return;
            if (!started) { started = true; $('navThink').hidden = true; if (!b) b = Bubbles.add(clean); }
            Bubbles.set(b, clean); this.talk(0.5);
          },
        });
        if (gen !== (this.gen || 0)) return;
        const line = this.clean(text) || this.canned(e, G);
        if (this.G.state === 'run') this.say(line, { bubble: b || undefined });
      } catch (err) {
        if (gen !== (this.gen || 0)) return;
        this.fail(err);
        this.say(this.canned(e, G), { bubble: b || undefined });
      } finally {
        if (gen === (this.gen || 0)) { $('navThink').hidden = true; this.busy = false; }
      }
    },
    clean(text, partial) {
      if (!text) return '';
      let t = String(text).replace(/\s+/g, ' ').trim();
      t = t.replace(/^(палыч|лёва|лева|вера( сергеевна)?|штурман)\s*[:—-]\s*/i, '');
      t = t.replace(/[«»"“”]/g, (m, i) => (i === 0 ? '' : m === '«' || m === '»' ? m : ''));
      t = t.replace(/\*[^*]*\*/g, '').replace(/\([^)]*\)/g, '').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').replace(/^[«"]|[»"]$/g, '').trim();
      if (!partial) {
        const parts = t.match(/[^.!?…]+[.!?…]*/g) || [t];
        t = parts.slice(0, 2).join('').trim();
        if (t.length > 170) t = t.slice(0, 167).replace(/\s+\S*$/, '') + '…';
      }
      return t;
    },
    fail(err) {
      const kind = err && err.kind;
      if (kind === 'auth' || kind === 'credits' || kind === 'nokey') {
        this.dead = true; this.aiState();
        R.toast && R.toast((err.ru || 'Нейросеть недоступна') + ' — штурман перешёл на заготовки', 3200);
      } else if (!this._warned) { this._warned = true; R.toast && R.toast((err && err.ru) || 'Нет связи с нейросетью', 2400); }
    },

    // --- финиш: разбор заезда ---
    finish(time, delta) {
      if (!this.run) return;
      this.stop(true);
      const G = this.G, st = G.tel.stats;
      const crashKm = G.tel.log.filter((x) => x.type === 'crash').sort((a, b) => b.imp - a.imp).slice(0, 3).map((x) => ({ km: +x.km.toFixed(2), what: x.what, kmh: x.kmh }));
      this.run.summary = {
        date: Date.now(), crew: this.crew.id, finished: true, time: +time.toFixed(2), delta: +delta.toFixed(1),
        crashes: st.crashes, big: st.bigCrashes, drifts: st.drifts, maxDrift: Math.round(st.maxDrift), jumps: st.jumps,
        maxAir: +st.maxAir.toFixed(2), cuts: st.cuts, offroads: st.offroads, resets: st.resets, maxKmh: Math.round(st.maxKmh),
        damage: Math.round(G.car.damage * 100), crashKm,
      };
      this.run.finished = true;
      const L = R.LINES[this.crew.id];
      this.say(pick(delta <= 0 ? L.finish_good : L.finish_bad).replace('{delta}', nf(Math.abs(delta)) + ' с'));
      this.startDebrief();
    },
    startDebrief() {
      const G = this.G, run = this.run, s = run.summary;
      const L = R.LINES[this.crew.id].debrief;
      run.debrief = { text: '', done: false };
      const deltaText = (s.delta <= 0 ? 'на ' + nf(-s.delta) + ' с быстрее графика' : 'на ' + nf(s.delta) + ' с медленнее графика');
      const worst = s.crashes >= 2 ? 'crash' : s.cuts >= 2 ? 'cut' : s.delta > 12 ? 'slow' : s.maxAir > 0 && G.tel.stats.hardLandings ? 'jump' : 'ok';
      const localScore = Math.max(1, Math.min(10, Math.round(8 - s.delta / 6 - s.crashes * 0.7 - s.cuts * 0.3 - s.resets)));
      const cannedText = () => [
        pick(L.open).replace('{time}', R.fmtTime(s.time)).replace('{deltaText}', deltaText),
        s.crashes ? pick(L.crashes).replace('{n}', s.crashes) : pick(L.clean),
        s.maxDrift > 25 ? pick(L.drift).replace('{angle}', s.maxDrift) : '',
        L.advice[worst],
      ].filter(Boolean).join(' ');
      if (this.demo) {
        run.debrief = { text: cannedText(), done: true };
        run.grade = { score: localScore, nickname: pick(L.nick) };
        this.renderDebrief();
        return;
      }
      const facts = `Итог заезда: время ${R.fmtTime(s.time)} (${deltaText}; график ${R.fmtTime(R.sched.total)}). Ударов ${s.crashes} (сильных ${s.big}), повреждения кузова ${s.damage}%. Заносов ${s.drifts}, самый большой ${s.maxDrift}°. Прыжков ${s.jumps}, самый долгий полёт ${nf(s.maxAir, 2)} с, жёстких посадок ${G.tel.stats.hardLandings}. Срезов ${s.cuts}, вылетов в траву ${s.offroads}, возвратов на дорогу ${s.resets}. Максимальная скорость ${s.maxKmh} км/ч.
Промежуточные: ${G.tel.stats.splits.map((x) => 'КП' + x.n + ' ' + R.fmtTime(x.t) + ' (' + (x.delta <= 0 ? '−' : '+') + nf(Math.abs(x.delta)) + ')').join(', ') || 'нет'}.
Хронология: ${G.tel.log.filter((x) => !['start', 'finish'].includes(x.type)).slice(-14).map((x) => R.fmtTime(x.t) + ' ' + this.short(x)).join('; ') || 'чистый заезд'}.
Твои реплики по ходу: ${this.said.slice(-4).map((x) => '«' + x + '»').join(' ')}`;
      const sys = this.crew.persona + '\n\n' + this.pastRuns() + '\n\nСейчас финиш. Ты разбираешь заезд с пилотом — по-своему, от первого лица, живой речью.';
      $('resThink').hidden = false;
      AI.chat([{ role: 'user', content: facts + '\n\nРазбор: 3–4 коротких предложения, всего не больше 65 слов, без списков и заголовков. Назови 1–2 конкретных момента по-человечески (где это было: в каком повороте, на трамплине, на какой контрольной), без точных секунд хронологии. Если был прошлый заезд — сравни. Закончи одним советом.' }], {
        system: sys, maxTokens: 230, temperature: 0.9, timeout: 30000,
        onToken: (d, full) => { run.debrief.text = this.clean(full, true); $('resThink').hidden = true; this.renderDebrief(); },
      }).then((text) => {
        run.debrief.text = this.clean(text, true) || cannedText(); run.debrief.done = true; this.renderDebrief();
        this.speakDebrief();
      }).catch((err) => { this.fail(err); run.debrief = { text: cannedText(), done: true }; this.renderDebrief(); })
        .finally(() => { $('resThink').hidden = true; });
      // оценка — строгим JSON с проверкой
      AI.json([{ role: 'user', content: facts + '\n\nПоставь пилоту оценку за заезд и дай прозвище по итогам этого заезда в своём стиле.' }], {
        system: this.crew.persona, maxTokens: 120, temperature: 0.9, timeout: 20000,
        schemaHint: '{"score": целое 1–10, "nickname": "прозвище 1–3 слова"}',
        fallback: { score: localScore, nickname: pick(L.nick) },
      }).then((g) => {
        let score = Math.round(+g.score); if (!(score >= 1 && score <= 10)) score = localScore;
        let nick = typeof g.nickname === 'string' ? g.nickname.replace(/[«»"]/g, '').trim().slice(0, 32) : '';
        if (!nick) nick = pick(L.nick);
        run.grade = { score, nickname: nick };
        this.renderDebrief();
      });
    },
    renderDebrief() {
      const run = this.run; if (!run || !run.debrief) return;
      $('resFace').innerHTML = faceSVG(this.crew.face);
      $('resName').textContent = this.crew.name;
      $('resText').textContent = typo(run.debrief.text);
      if (run.grade) { $('resGrade').hidden = false; $('resGrade').textContent = `Оценка ${run.grade.score}/10 — «${run.grade.nickname}»`; }
      if (run.debrief.done && run.grade && !run.saved) {
        run.saved = true;
        Mem.save(Object.assign({}, run.summary, { grade: run.grade.score }));
      }
    },
    showDebrief() { this.renderDebrief(); if (this.run && this.run.debrief && this.run.debrief.done) this.speakDebrief(); },
    speakDebrief() {
      if (this._spoken === this.run || !this.run.debrief.done || $('result').hidden) return;
      this._spoken = this.run;
      Voice.speech(this.run.debrief.text);
    },
  };

  R.Nav = Nav;
})(window.R);
