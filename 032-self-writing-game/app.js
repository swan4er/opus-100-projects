/* ================================================================
   032 · Игра, которая пишет себя — ядро страницы.
   Хост песочницы, цикл «пишу → автотест → чиню», правки словами,
   версии, галерея, демо-режим и режим съёмки обложки.
   ================================================================ */
(function () {
  'use strict';
  const { Log, Code, Gallery, changedLines, plural, esc, nbsp, $ } = SWG.ui;
  const P = SWG.prompts, R = SWG.runtime, D = SWG.demos;

  // Решение Станислава: везде DeepSeek V4.1 Flash — он быстрее и дешевле; в наших замерах (см. README)
  // разница в качестве с V4 Pro была меньше разброса от запуска к запуску.
  const MODELS = [
    { id: 'deepseek/deepseek-v4.1-flash', name: 'V4.1 Flash' },
  ];
  const MAX_FIX = 3;
  const PREF = 'swg120.prefs';
  const prefs = (() => { try { return JSON.parse(localStorage.getItem(PREF) || '{}') || {}; } catch (e) { return {}; } })();
  const savePrefs = () => { try { localStorage.setItem(PREF, JSON.stringify(prefs)); } catch (e) { /* нет места */ } };

  const st = {
    model: MODELS.some((m) => m.id === prefs.model) ? prefs.model : MODELS[0].id,
    sound: prefs.sound !== false,
    session: null, // { id, phrase, versions: [], cur, demo }
    busy: false, abort: null,
  };

  const el = {
    phrase: $('#phrase'), go: $('#go'), ask: $('#ask'), ideas: $('#ideas'),
    edit: $('#edit'), editInput: $('#edit-input'), editGo: $('#edit-go'), editIdeas: $('#edit-ideas'),
    screen: $('#screen'), frameBox: $('#frame-box'), overlay: $('#overlay'), ovPhrase: $('#ov-phrase'), ovStatus: $('#ov-status'), ovSteps: $('#ov-steps'),
    title: $('#game-title'), controls: $('#game-controls'), versions: $('#versions'), restart: $('#restart'), fullscreen: $('#fullscreen'),
    log: $('#log'), code: $('#code'), codeMeta: $('#code-meta'), copy: $('#copy'), download: $('#download'),
    gallery: $('#gallery'), tabs: $('#tabs'), cost: $('#cost'), demoBadge: $('#demo-badge'), connect: $('#connect'),
    models: $('#models'), sound: $('#sound'), pad: $('#pad'), stop: $('#stop'),
  };

  /* ================= песочница ================= */
  const Stage = {
    frame: null, token: '', seq: 0, waiter: null, thumbs: {},
    run(code, opts) {
      opts = opts || {};
      this.kill();
      const token = 'r' + (++this.seq) + Math.random().toString(36).slice(2, 8);
      this.token = token;
      const cfg = { token, bg: opts.bg || '#15130f', sound: st.sound, best: opts.best || 0, autoplay: !!opts.autoplay, autotest: true, crashNote: 'нейросеть чинит код…' };
      const f = document.createElement('iframe');
      f.setAttribute('sandbox', 'allow-scripts');
      f.setAttribute('allow', 'autoplay');
      f.setAttribute('title', 'Игра в песочнице');
      f.className = 'game-frame';
      f.srcdoc = R.buildSrcdoc(code, cfg);
      el.frameBox.appendChild(f);
      this.frame = f;
      return new Promise((resolve) => {
        const done = (r) => { clearTimeout(timer); if (this.waiter === done) this.waiter = null; resolve(r); };
        const timer = setTimeout(() => done({ ok: false, err: { phase: 'hang', message: 'Игра не ответила за 12 секунд — похоже, зависла при загрузке', line: 0 } }), 12000);
        this.waiter = done;
      });
    },
    kill() {
      if (this.waiter) { const w = this.waiter; this.waiter = null; w({ ok: false, err: { phase: 'load', message: 'прервано', line: 0 }, aborted: true }); }
      if (this.frame) { this.frame.remove(); this.frame = null; }
      this.token = '';
    },
    send(m) { if (this.frame && this.frame.contentWindow) this.frame.contentWindow.postMessage(m, '*'); },
    thumb(w) {
      return new Promise((resolve) => {
        if (!this.frame) return resolve('');
        const id = 't' + Math.random().toString(36).slice(2);
        const timer = setTimeout(() => { delete this.thumbs[id]; resolve(''); }, 1500);
        this.thumbs[id] = (d) => { clearTimeout(timer); delete this.thumbs[id]; resolve(d || ''); };
        this.send({ type: 'thumb', id, w: w || 320 });
      });
    },
    focus() {
      const a = document.activeElement;
      if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) return;
      try { this.frame && this.frame.focus(); } catch (e) { /* фокус не обязателен */ }
    },
  };

  let consoleShown = 0;
  window.addEventListener('message', (e) => {
    const m = e.data;
    if (!Stage.frame || e.source !== Stage.frame.contentWindow || !m || typeof m !== 'object' || m.token !== Stage.token) return;
    if (m.type === 'ready') { if (Stage.waiter) Stage.waiter({ ok: true, info: m }); }
    else if (m.type === 'error') {
      const err = { phase: String(m.phase || ''), message: String(m.message || 'ошибка'), line: +m.line || 0, col: +m.col || 0, stack: String(m.stack || '') };
      if (Stage.waiter) Stage.waiter({ ok: false, err });
      else onLateError(err);
    } else if (m.type === 'thumb') { const cb = Stage.thumbs[m.id]; if (cb) cb(m.data); }
    else if (m.type === 'over') {
      const s = st.session;
      if (s) s.best = Math.max(s.best || 0, +m.best || 0);
      Log.add(m.won ? 'ok' : 'info', (m.won ? 'Победа' : 'Конец партии') + ': счёт ' + fmtNum(m.score) + ' · рекорд ' + fmtNum(m.best));
    } else if (m.type === 'console') {
      if (consoleShown++ < 12) Log.add(m.level === 'error' ? 'warn' : 'info', '<span class="lg-dim">console.' + esc(m.level) + ':</span> ' + esc(m.text), { sub: true });
    } else if (m.type === 'focus') { /* игрок кликнул в игру — клавиши пойдут напрямую */ }
  });

  // клавиши со страницы — в игру (если фокус не в поле ввода)
  const typing = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  const NOSCROLL = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
  function forwardKey(e, down) {
    if (!Stage.frame || typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (!/^(Key|Digit|Arrow|Space|Enter|Shift)/.test(e.code)) return;
    if (e.target && e.target.tagName === 'BUTTON' && (e.code === 'Space' || e.code === 'Enter')) return;
    if (NOSCROLL.has(e.code)) e.preventDefault();
    if (down && e.repeat) return;
    Stage.send({ type: 'key', down, code: e.code, key: e.key });
  }
  window.addEventListener('keydown', (e) => forwardKey(e, true));
  window.addEventListener('keyup', (e) => forwardKey(e, false));

  // экранный джойстик для телефона: те же клавиши
  function setupPad() {
    if (!el.pad) return;
    const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
    el.pad.hidden = !coarse;
    el.pad.querySelectorAll('[data-code]').forEach((b) => {
      const code = b.dataset.code;
      const down = (e) => { e.preventDefault(); b.classList.add('on'); Stage.send({ type: 'key', down: true, code, key: '' }); try { b.setPointerCapture(e.pointerId); } catch (x) { /* нет */ } };
      const up = () => { if (!b.classList.contains('on')) return; b.classList.remove('on'); Stage.send({ type: 'key', down: false, code, key: '' }); };
      b.addEventListener('pointerdown', down);
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
    });
  }

  /* ================= версии ================= */
  function newSession(phrase, demo) {
    st.session = { id: 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), phrase, versions: [], cur: -1, demo: !!demo, best: 0, saveTimer: 0 };
    renderVersions();
    return st.session;
  }
  function pushVersion(parsed, kind, note) {
    const s = st.session;
    const prev = s.versions[s.cur];
    const v = {
      n: s.versions.length + 1, code: parsed.code, kind, note: note || '',
      title: parsed.title || (prev && prev.title) || 'Без названия',
      controls: parsed.controls || (prev && prev.controls) || '',
      prev: prev ? prev.code : '',
    };
    s.versions.push(v);
    s.cur = s.versions.length - 1;
    renderVersions();
    return v;
  }
  const KIND_RU = { new: 'написана', edit: 'правка', fix: 'починка', demo: 'заготовка' };
  function renderVersions() {
    const s = st.session;
    if (!s || !s.versions.length) { el.versions.innerHTML = ''; return; }
    el.versions.innerHTML = s.versions.map((v, i) =>
      '<button class="ver' + (i === s.cur ? ' on' : '') + ' ver-' + v.kind + '" data-v="' + i + '" title="' + esc(KIND_RU[v.kind] + (v.note ? ': ' + v.note : '')) + '">v' + v.n + '</button>').join('');
  }
  el.versions.addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (!b || st.busy) return;
    const s = st.session, i = +b.dataset.v;
    if (!s || i === s.cur) return;
    s.cur = i; renderVersions();
    const v = s.versions[i];
    Log.add('info', 'Откат к версии v' + v.n + ' (' + KIND_RU[v.kind] + ')');
    withBusy(() => cycle(v, null, { noFix: false }));
  });

  function showVersion(v, errLine) {
    const added = v.prev ? changedLines(v.prev, v.code) : new Set();
    const n = v.code.split('\n').length;
    let label = 'v' + v.n + ' · ' + n + ' ' + plural(n, 'строка', 'строки', 'строк');
    if (v.prev) label += ' · изменено ' + added.size;
    Code.show(v.code, { added, errLine, label });
    el.title.textContent = v.title;
    el.controls.textContent = v.controls ? v.controls : '';
    document.title = v.title + ' — Игра, которая пишет себя';
  }

  /* ================= экран ожидания ================= */
  const Overlay = {
    t0: 0, timer: 0, phase: '',
    show(phrase) {
      el.ovPhrase.textContent = '«' + nbsp(phrase) + '»';
      el.overlay.hidden = false;
      requestAnimationFrame(() => el.overlay.classList.add('in'));
      this.t0 = performance.now();
      this.step('think');
      clearInterval(this.timer);
      this.timer = setInterval(() => this.tick(), 250);
    },
    step(phase, extra) {
      this.phase = phase; this.extra = extra || '';
      el.ovSteps.querySelectorAll('[data-step]').forEach((li) => {
        const order = ['think', 'write', 'test', 'play'];
        const a = order.indexOf(li.dataset.step), b = order.indexOf(phase);
        li.classList.toggle('done', a < b); li.classList.toggle('now', a === b);
      });
      this.tick();
    },
    tick() {
      const s = Math.round((performance.now() - this.t0) / 1000);
      const txt = { think: 'нейросеть придумывает игру', write: 'пишет код', test: 'запускает и проверяет', play: 'готово' }[this.phase] || '';
      el.ovStatus.textContent = txt + (this.extra ? ' · ' + this.extra : '') + ' · ' + s + ' с';
    },
    plan(p) {
      const sub = el.overlay.querySelector('.ov-plan') || el.overlay.insertBefore(document.createElement('p'), el.ovSteps);
      sub.className = 'ov-plan';
      sub.textContent = (p.title ? p.title + ' — ' : '') + (p.pitch || '');
    },
    hide() {
      clearInterval(this.timer);
      const sub = el.overlay.querySelector('.ov-plan');
      if (sub) setTimeout(() => { if (el.overlay.hidden) sub.remove(); }, 420);
      el.overlay.classList.remove('in');
      setTimeout(() => { if (!el.overlay.classList.contains('in')) el.overlay.hidden = true; }, 380);
    },
  };

  /* ================= нейросеть ================= */
  function modelName() { return (MODELS.find((m) => m.id === st.model) || MODELS[0]).name; }
  function updateCost() {
    const u = AI.usage;
    el.cost.textContent = '$' + u.costUSD.toFixed(u.costUSD < 1 ? 4 : 2);
    el.cost.title = 'Потрачено в этой вкладке: ' + u.calls + ' ' + plural(u.calls, 'запрос', 'запроса', 'запросов') + ', ' + fmtNum(u.promptTokens + u.completionTokens) + ' токенов';
  }
  const fmtNum = (n) => Math.round(+n || 0).toLocaleString('ru-RU');

  /* Как тратится рассуждение (think: true), см. замеры в README:
     целая игра с рассуждением — 2–4 минуты и часто обрезана по бюджету токенов,
     поэтому модель рассуждает там, где ответ маленький: план игры и поиск ошибки.
     Код пишется без рассуждения, потоком — его видно сразу. */
  const lines = (s) => { const n = String(s).split('\n').length; return n + ' ' + plural(n, 'строка', 'строки', 'строк'); };
  const secs = (t0) => Math.round((performance.now() - t0) / 1000);

  // один запрос к модели с живой строкой в логе; поток — в окно кода
  async function askRaw(messages, o) {
    const t0 = performance.now();
    let firstAt = 0;
    const who = modelName() + (o.think ? ' рассуждает' : ' думает');
    const live = Log.live(o.think ? 'think' : 'write', esc(o.label) + ' · ' + who + ' <b>0&nbsp;с</b>');
    const tick = setInterval(() => { if (!firstAt) live.set(esc(o.label) + ' · ' + who + ' <b>' + secs(t0) + '&nbsp;с</b>'); }, 500);
    const ctrl = new AbortController();
    st.abort = ctrl;
    el.stop.hidden = false;
    let text = '';
    try {
      text = await AI.chat(messages, {
        system: o.system || P.SYSTEM_WRITE, model: st.model, think: !!o.think, maxTokens: o.maxTokens || 9000,
        temperature: o.temperature ?? 0.7, timeout: o.think ? 200000 : 150000, signal: ctrl.signal,
        onToken: (d, full) => {
          if (!firstAt) {
            firstAt = performance.now();
            live.kind('write');
            if (o.overlay) Overlay.step('write');
            selectTab('code');
          }
          live.set(esc(o.label) + ' · пишет: ' + lines((o.prefix || '') + full) + (o.think ? ' <span class="lg-dim">(рассуждал ' + Math.round((firstAt - t0) / 1000) + '&nbsp;с)</span>' : ''));
          Code.stream((o.prefix || '') + full);
          if (o.overlay) Overlay.step('write', lines((o.prefix || '') + full));
        },
      });
    } catch (e) { live.kind('err'); live.set(esc(o.label) + ': ' + esc(aiErrorText(e))); throw e; }
    finally {
      clearInterval(tick);
      st.abort = null;
      el.stop.hidden = true;
      Code.stopStream();
      updateCost();
    }
    live.kind('ok');
    live.set(esc(o.label) + ' · ' + secs(t0) + '&nbsp;с' + (o.think && firstAt ? ' <span class="lg-dim">(рассуждал ' + Math.round((firstAt - t0) / 1000) + '&nbsp;с)</span>' : ''));
    return text;
  }

  // 1) план игры: модель рассуждает, ответ — маленький JSON
  async function makePlan(phrase) {
    const t0 = performance.now();
    const live = Log.live('think', 'План игры · ' + modelName() + ' рассуждает <b>0&nbsp;с</b>');
    const tick = setInterval(() => live.set('План игры · ' + modelName() + ' рассуждает <b>' + secs(t0) + '&nbsp;с</b>'), 500);
    const ctrl = new AbortController();
    st.abort = ctrl; el.stop.hidden = false;
    let plan = null, quick = false;
    const ask = (think) => AI.json([{ role: 'user', content: 'Фраза игрока: «' + phrase + '»' }], {
      system: P.SYSTEM_PLAN, schemaHint: P.PLAN_HINT, model: st.model, think, maxTokens: 900, timeout: think ? 50000 : 30000, signal: ctrl.signal,
    });
    try {
      // рассуждение бывает и 20 секунд, и две минуты; ждём не больше 50 с, потом — план без рассуждения
      try { plan = await ask(true); }
      catch (e) { if (ctrl.signal.aborted) throw e; quick = true; plan = await ask(false); }
    } catch (e) {
      if (ctrl.signal.aborted) { clearInterval(tick); live.kind('err'); live.set('Остановлено'); throw e; }
      plan = null;
    } finally { clearInterval(tick); st.abort = null; el.stop.hidden = true; updateCost(); }
    if (!plan || typeof plan !== 'object' || !plan.title) {
      live.kind('warn'); live.set('План не сложился за ' + secs(t0) + '&nbsp;с — пишу прямо по фразе');
      return null;
    }
    live.kind('ok');
    live.set('План за ' + secs(t0) + '&nbsp;с' + (quick ? ' <span class="lg-dim">(без рассуждения: оно не уложилось в 50&nbsp;с)</span>' : '') + ': <b>«' + esc(plan.title) + '»</b> — ' + esc(plan.pitch || ''));
    if (plan.twist) Log.add('info', '<span class="lg-dim">изюминка:</span> ' + esc(plan.twist), { sub: true });
    return plan;
  }

  // 2) код: без рассуждения, потоком; оборвался по бюджету — дописывает
  async function writeCode(phrase, plan) {
    const first = [{ role: 'user', content: P.userNew(phrase, plan) }];
    let text = await askRaw(first, { label: 'Пишу код', maxTokens: 9000, overlay: true });
    let parsed = P.parseAnswer(text);
    for (let k = 0; k < 2 && P.looksTruncated(parsed.code); k++) {
      Log.add('warn', 'Код оборвался на строке ' + parsed.code.split('\n').length + ' — прошу дописать');
      const more = await askRaw(first.concat([{ role: 'assistant', content: text }, { role: 'user', content: P.CONTINUE }]),
        { label: 'Дописываю', maxTokens: 6000, overlay: true, prefix: text, temperature: 0.3 });
      text = text + more.replace(/^```[a-z]*\n?/i, '');
      parsed = P.parseAnswer(text);
    }
    if (parsed.code.split('\n').length < 12) throw Object.assign(new Error('короткий ответ'), { kind: 'bad', ru: 'Нейросеть вернула слишком короткий ответ' });
    return parsed;
  }

  // 3) правка или починка блоками SEARCH/REPLACE; не сошлось — просим весь код
  async function patchCode(v, userMsg, o) {
    const text = await askRaw([{ role: 'user', content: userMsg }], { label: o.label, think: o.think, maxTokens: o.think ? 3000 : 4000, temperature: o.think ? 0.3 : 0.6 });
    const blocks = P.parsePatches(text);
    if (blocks.length) {
      const r = P.applyPatches(v.code, blocks);
      if (!r.failed.length) {
        Log.add('ok', 'Правок: ' + blocks.length + ' ' + plural(blocks.length, 'блок', 'блока', 'блоков') + ' — применены', { sub: true });
        const parsed = P.parseAnswer(r.code);
        return { code: r.code, title: parsed.title || v.title, controls: parsed.controls || v.controls };
      }
      Log.add('warn', 'Не нашёл место для ' + r.failed.length + ' из ' + blocks.length + ' правок — прошу код целиком');
    } else {
      const parsed = P.parseAnswer(text);
      if (/function\s+update|function\s+draw/.test(parsed.code) && parsed.code.split('\n').length > 30 && !P.looksTruncated(parsed.code)) {
        Log.add('ok', 'Модель вернула код целиком', { sub: true });
        return parsed;
      }
      Log.add('warn', 'Правки не распознаны — прошу код целиком');
    }
    const full = o.kind === 'fix' ? P.userFix(v.code, o.err, st.session.phrase) : P.userEdit(v.code, o.instruction, st.session.phrase);
    const text2 = await askRaw([{ role: 'user', content: full }], { label: 'Переписываю целиком', maxTokens: 9000, temperature: 0.4 });
    const parsed = P.parseAnswer(text2);
    if (P.looksTruncated(parsed.code) || parsed.code.split('\n').length < 12) throw Object.assign(new Error('обрыв'), { kind: 'bad', ru: 'Нейросеть не дописала код' });
    return parsed;
  }

  function aiErrorText(e) {
    if (e && e.name === 'AbortError') return 'Остановлено';
    if (typeof e === 'string') return e === 'user' ? 'Остановлено' : e === 'timeout' ? 'Нейросеть думает слишком долго' : e;
    if (e && e.ru) return e.ru;
    return 'Ошибка: ' + (e && e.message ? e.message : String(e));
  }

  /* ================= главный цикл: запуск → ошибка → починка ================= */
  function errHtml(err) {
    const where = err.line ? ' · строка ' + err.line : '';
    return '<b>' + esc(P.phaseRu(err.phase)) + where + '</b><br><code>' + esc(err.message) + '</code>';
  }
  // фон под холстом: первый цвет фона игры, если он тёмный, иначе нейтральный графит
  function guessBg(code) {
    const m = code.match(/#[0-9a-fA-F]{6}\b/);
    if (m) {
      const n = parseInt(m[0].slice(1), 16), lum = 0.3 * (n >> 16) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255);
      if (lum < 60) return m[0];
    }
    return '#0f0d0b';
  }

  async function launch(v, opts) {
    opts = opts || {};
    showVersion(v);
    const se = P.staticCheck(v.code);
    if (se) { Log.add('err', errHtml(se)); return { ok: false, err: se }; }
    Log.add('test', 'Песочница: запускаю v' + v.n + ' и гоняю автотест со случайными нажатиями');
    const r = await Stage.run(v.code, { bg: opts.bg || guessBg(v.code), autoplay: !!opts.autoplay, best: st.session ? st.session.best : 0 });
    if (r.aborted) return r;
    if (r.ok) {
      const i = r.info;
      Log.add('ok', 'Автотест пройден: ' + fmtNum(i.frames) + ' ' + plural(i.frames, 'кадр', 'кадра', 'кадров') + (i.restarts ? ', ' + i.restarts + ' ' + plural(i.restarts, 'рестарт', 'рестарта', 'рестартов') : '') + ' за ' + i.ms + '&nbsp;мс');
    } else {
      Log.add('err', errHtml(r.err));
      showVersion(v, r.err.line);
    }
    return r;
  }

  async function cycle(v, pendingErr, opts) {
    opts = opts || {};
    const s = st.session;
    let fixes = 0;
    let r = pendingErr ? { ok: false, err: pendingErr } : await launch(v, opts);
    while (!r.ok) {
      if (r.aborted || s !== st.session) return false;
      if (opts.noFix) return false;
      if (fixes >= MAX_FIX) {
        Log.add('err', 'Не починилось за ' + MAX_FIX + ' попытки. Переформулируйте фразу или вернитесь к прошлой версии.');
        Stage.send({ type: 'note', text: 'не починилось за три попытки' });
        return false;
      }
      fixes++;
      Stage.send({ type: 'note', text: 'нейросеть чинит код · попытка ' + fixes + ' из ' + MAX_FIX });
      Log.add('fix', 'Отправляю ошибку нейросети: попытка ' + fixes + ' из ' + MAX_FIX);
      let fixed;
      if (opts.cannedFix) {
        fixed = opts.cannedFix; opts.cannedFix = null;
        await wait(opts.fast ? 150 : 900);
        Log.add('demo', 'Демо: ответ модели заготовлен, но ошибка и перезапуск — настоящие');
      } else {
        try { fixed = await patchCode(v, P.userFixPatch(v.code, r.err, s.phrase), { label: 'Починка ' + fixes + '/' + MAX_FIX, think: true, kind: 'fix', err: r.err }); }
        catch (e) { Log.add('err', esc(aiErrorText(e))); return false; }
      }
      if (s !== st.session) return false;
      v = pushVersion(fixed, 'fix', r.err.message);
      const added = changedLines(v.prev, v.code);
      Log.add('fix', 'Исправлено строк: ' + added.size + ' — перезапуск');
      r = await launch(v, opts);
    }
    playing(v, opts);
    return true;
  }

  function playing(v, opts) {
    const s = st.session;
    Log.add('play', 'Играем: «' + esc(v.title) + '»' + (v.controls ? ' — ' + esc(v.controls) : ''));
    Overlay.hide();
    Stage.focus();
    clearTimeout(s.saveTimer);
    if (s.demo || opts.noSave) return;
    const n = v.n;
    s.saveTimer = setTimeout(async () => {
      if (st.session !== s || s.cur !== s.versions.indexOf(v) || !Stage.frame) return;
      const thumb = await Stage.thumb(320);
      const d = new Date();
      Gallery.upsert({ id: s.id, title: v.title, phrase: s.phrase, code: v.code, controls: v.controls, thumb, meta: 'v' + n + ' · ' + d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) + ' · ' + modelName() });
      renderGallery();
      Log.add('ok', 'Сохранено в галерею: прожила 6&nbsp;секунд без ошибок', { sub: true });
    }, 6000);
  }

  function onLateError(err) {
    const s = st.session;
    if (!s) return;
    clearTimeout(s.saveTimer);
    const v = s.versions[s.cur];
    Log.add('err', 'Упало во время игры: ' + errHtml(err));
    if (v) showVersion(v, err.line);
    if (st.busy) return;
    if (AI.demo || s.demo) { Stage.send({ type: 'note', text: 'в демо-режиме починка недоступна' }); return; }
    withBusy(() => cycle(v, err));
  }

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  async function withBusy(fn) {
    if (st.busy) return;
    setBusy(true);
    try { return await fn(); }
    catch (e) { Log.add('err', esc(aiErrorText(e))); }
    finally { setBusy(false); }
  }
  function setBusy(on) {
    st.busy = on;
    document.body.classList.toggle('is-busy', on);
    el.go.disabled = on; el.editGo.disabled = on;
    el.go.querySelector('span').textContent = on ? 'Пишет…' : 'Написать игру';
  }

  /* ================= действия игрока ================= */
  async function createGame(phrase) {
    phrase = phrase.trim().replace(/\s+/g, ' ').slice(0, 200);
    if (!phrase) { el.phrase.focus(); return; }
    if (AI.demo) return demoCreate(phrase);
    await withBusy(async () => {
      newSession(phrase, false);
      el.phrase.value = phrase;
      el.title.textContent = 'Новая игра'; el.controls.textContent = 'пишется…';
      Log.add('info', 'Фраза: <b>«' + esc(phrase) + '»</b>');
      Stage.kill();
      Overlay.show(phrase);
      Code.show('// ' + modelName() + ' придумывает игру…\n', { label: 'ждём план' });
      selectTab('code');
      let parsed;
      try {
        const plan = await makePlan(phrase);
        if (plan) { Overlay.plan(plan); el.title.textContent = plan.title; }
        if (st.session.phrase !== phrase) return;
        parsed = await writeCode(phrase, plan);
      } catch (e) { Overlay.hide(); Log.add('err', esc(aiErrorText(e))); return; }
      Overlay.step('test');
      const v = pushVersion(parsed, 'new');
      const ok = await cycle(v, null);
      if (!ok) Overlay.hide();
    });
  }

  async function editGame(instruction) {
    instruction = instruction.trim().slice(0, 200);
    const s = st.session;
    if (!instruction) { el.editInput.focus(); return; }
    if (!s || !s.versions.length) { Log.add('warn', 'Сначала напишите или откройте игру'); return; }
    if (AI.demo) { Log.add('warn', 'Правки словами пишет нейросеть — в демо-режиме их нет. <button class="lg-btn" data-connect>Подключить ключ</button>'); return; }
    await withBusy(async () => {
      if (s.demo) s.demo = false; // заготовка, которую правят словами, становится своей игрой
      const v0 = s.versions[s.cur];
      Log.add('info', 'Правка: <b>«' + esc(instruction) + '»</b>');
      Stage.send({ type: 'pause', on: true });
      let parsed;
      try { parsed = await patchCode(v0, P.userEditPatch(v0.code, instruction, s.phrase), { label: 'Правка', think: false, kind: 'edit', instruction }); }
      catch (e) { Log.add('err', esc(aiErrorText(e))); Stage.send({ type: 'pause', on: false }); showVersion(v0); return; }
      const v = pushVersion(parsed, 'edit', instruction);
      const added = changedLines(v.prev, v.code);
      Log.add('ok', 'Изменено строк: ' + added.size + (added.removed ? ', убрано: ' + added.removed : ''), { sub: true });
      await cycle(v, null);
      el.editInput.value = '';
    });
  }

  // демо-режим: заготовка, похожая на фразу, «печатается» и запускается по-настоящему
  let demoTurn = 0;
  async function demoCreate(phrase) {
    const d = D.pickFor(phrase) || D.list[demoTurn++ % D.list.length];
    el.phrase.value = phrase;
    await withBusy(async () => {
      Log.add('demo', 'Демо-режим: нейросеть не подключена, поэтому вместо генерации — заготовка «' + esc(d.title) + '»');
      await openDemo(d.id, { phrase, type: true });
    });
  }

  async function fakeStream(code, ms) {
    if (!ms) { Code.show(code, { label: 'пишет' }); return; }
    const t0 = performance.now();
    for (;;) {
      const k = Math.min(1, (performance.now() - t0) / ms);
      Code.stream(code.slice(0, Math.floor(code.length * k)));
      if (k >= 1) break;
      await wait(60);
    }
    Code.stopStream();
  }

  async function openDemo(id, opts) {
    opts = opts || {};
    const d = D.list.find((x) => x.id === id) || D.list[0];
    newSession(opts.phrase || d.phrase, true);
    if (opts.type) { selectTab('code'); await fakeStream(d.code, 1400); }
    const v = pushVersion({ code: d.code, title: d.title, controls: d.controls }, 'demo');
    await cycle(v, null, { autoplay: true, bg: d.bg, noFix: true });
  }

  async function openSaved(id) {
    const g = Gallery.read().find((x) => x.id === id);
    if (!g) return;
    await withBusy(async () => {
      st.session = { id: g.id, phrase: g.phrase, versions: [], cur: -1, demo: false, best: 0, saveTimer: 0 };
      pushVersion({ code: g.code, title: g.title, controls: g.controls }, 'new');
      Log.add('info', 'Из галереи: «' + esc(g.title) + '»');
      await cycle(st.session.versions[0], null);
    });
  }

  // Трейлер при первом открытии и на обложке: фраза → код → падение → починка → игра.
  async function trailer(fast) {
    const d = D.list[0];
    await withBusy(async () => {
      const phrase = d.phrase;
      if (fast) el.phrase.value = phrase;
      else for (let i = 1; i <= phrase.length; i++) { el.phrase.value = phrase.slice(0, i); await wait(28); }
      Log.add('demo', 'Показ цикла: фраза → код → автотест → самопочинка → игра');
      newSession(phrase, true);
      Log.add('info', 'Фраза: <b>«' + esc(phrase) + '»</b>');
      Log.add('write', 'Пишу игру: ' + d.code.split('\n').length + ' строк', { sub: true });
      await fakeStream(D.brokenCat, fast ? 0 : 1300);
      const v = pushVersion({ code: D.brokenCat, title: d.title, controls: d.controls }, 'new');
      await cycle(v, null, { autoplay: true, bg: d.bg, cannedFix: { code: d.code, title: d.title, controls: d.controls }, fast });
    });
  }

  /* ================= вкладки, галерея, настройки ================= */
  function selectTab(name) {
    el.tabs.querySelectorAll('[data-tab]').forEach((b) => {
      const on = b.dataset.tab === name;
      b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false');
      const pane = document.getElementById('pane-' + b.dataset.tab);
      if (pane) pane.hidden = !on;
    });
  }
  el.tabs.addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) selectTab(b.dataset.tab); });

  function renderGallery() {
    Gallery.render(el.gallery, D.list, (p) => {
      if (st.busy) { Log.add('warn', 'Подождите: нейросеть ещё работает'); return; }
      if (p.saved) openSaved(p.saved);
      else withBusy(() => openDemo(p.demo));
    }, (id) => { Gallery.remove(id); renderGallery(); });
  }

  function renderModels() {
    el.models.hidden = MODELS.length < 2; // переключатель нужен, только если моделей больше одной
    el.models.innerHTML = MODELS.map((m) => '<button role="radio" aria-checked="' + (m.id === st.model) + '" class="seg' + (m.id === st.model ? ' on' : '') + '" data-m="' + m.id + '">' + m.name + '</button>').join('');
  }
  el.models.addEventListener('click', (e) => {
    const b = e.target.closest('[data-m]');
    if (!b) return;
    st.model = b.dataset.m; prefs.model = st.model; savePrefs(); renderModels();
    Log.add('info', 'Модель: DeepSeek ' + modelName());
  });

  function renderSound() {
    el.sound.setAttribute('aria-pressed', st.sound ? 'true' : 'false');
    el.sound.title = st.sound ? 'Звук включён' : 'Звук выключен';
    el.sound.classList.toggle('off', !st.sound);
  }
  el.sound.addEventListener('click', () => { st.sound = !st.sound; prefs.sound = st.sound; savePrefs(); renderSound(); Stage.send({ type: 'sound', on: st.sound }); });

  function renderDemo() {
    el.demoBadge.hidden = !AI.demo;
    document.body.classList.toggle('is-demo', !!AI.demo);
  }
  async function connect() {
    const ok = await AI.ensureKey();
    renderDemo();
    if (ok) Log.add('ok', 'Нейросеть подключена: DeepSeek ' + modelName());
  }
  el.connect.addEventListener('click', connect);
  el.log.addEventListener('click', (e) => { if (e.target.closest('[data-connect]')) connect(); });

  el.stop.addEventListener('click', () => { if (st.abort) st.abort.abort(); });

  el.ask.addEventListener('submit', (e) => { e.preventDefault(); if (!st.busy) createGame(el.phrase.value); });
  el.phrase.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!st.busy) createGame(el.phrase.value); } });
  el.edit.addEventListener('submit', (e) => { e.preventDefault(); if (!st.busy) editGame(el.editInput.value); });
  el.ideas.addEventListener('click', (e) => { const b = e.target.closest('[data-idea]'); if (b) { el.phrase.value = b.dataset.idea; el.phrase.focus(); } });
  el.editIdeas.addEventListener('click', (e) => { const b = e.target.closest('[data-idea]'); if (b) { el.editInput.value = b.dataset.idea; el.editInput.focus(); } });
  el.restart.addEventListener('click', () => { Stage.send({ type: 'restart' }); Stage.focus(); });
  el.fullscreen.addEventListener('click', () => {
    try { if (document.fullscreenElement) document.exitFullscreen(); else el.screen.requestFullscreen(); } catch (e) { /* нет полноэкранного режима */ }
  });
  el.copy.addEventListener('click', async () => {
    const v = st.session && st.session.versions[st.session.cur];
    if (!v) return;
    try { await navigator.clipboard.writeText(v.code); el.copy.textContent = 'Скопировано'; }
    catch (e) { el.copy.textContent = 'Не вышло'; }
    setTimeout(() => { el.copy.textContent = 'Копировать'; }, 1400);
  });
  el.download.addEventListener('click', () => {
    const v = st.session && st.session.versions[st.session.cur];
    if (!v) return;
    const html = R.buildSrcdoc(v.code, { token: 'file', bg: guessBg(v.code), sound: true, best: 0, autotest: false }).replace('<head>', '<head><title>' + esc(v.title) + '</title>');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    a.download = v.title.replace(/[^\p{L}\p{N} _-]+/gu, '').trim().replace(/\s+/g, '-').toLowerCase() + '.html';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  });

  // пауза игры, когда вкладка скрыта, делает сам iframe; здесь — только счётчик денег
  setInterval(updateCost, 2000);

  /* ================= старт ================= */
  async function boot() {
    try { window.__lt = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push([Math.round(e.startTime), Math.round(e.duration), e.name, (e.attribution && e.attribution[0] && e.attribution[0].containerSrc) || '']); }).observe({ type: 'longtask', buffered: true }); } catch (e) {}
    Log.init(el.log);
    Code.init(el.code, el.codeMeta);
    renderModels(); renderSound(); renderDemo(); renderGallery(); updateCost(); setupPad();
    selectTab('code');
    if (AI.shot) { await trailer(true); return; }
    Log.add('info', AI.demo
      ? 'Нейросеть не подключена: работает демо-режим с заготовками. <button class="lg-btn" data-connect>Подключить ключ</button>'
      : 'Нейросеть подключена: DeepSeek ' + modelName() + '. Опишите игру одной фразой.');
    if (!prefs.seen) { prefs.seen = 1; savePrefs(); await trailer(false); }
    else await withBusy(() => openDemo('cat'));
  }
  // ручка для проверок из консоли и из _tools/shot --actions
  SWG.app = { st, Stage, createGame, editGame, openDemo, MODELS, renderGallery, code: () => { const s = st.session; return s && s.versions[s.cur] ? s.versions[s.cur].code : ''; } };
  boot();
})();
