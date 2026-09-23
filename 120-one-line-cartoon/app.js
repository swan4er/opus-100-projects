/* ================================================================
   app.js — студия: фраза → DeepSeek (AI.json, think) → проверка
   по схеме → компиляция → плеер. Правки словами, текст сценария,
   демо-режим, обложка при AI.shot.
   ================================================================ */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const canvas = $('#film'), ctx = canvas.getContext('2d');
  const SHOT = !!(window.AI && AI.shot) || !!window.__SHOT__;

  const state = {
    script: null, film: null, fixes: [], t: 0, playing: false, sound: false,
    mode: 'new', busy: false, demoIndex: 0, dirty: true, last: 0, dragging: false,
  };

  // ---------- размер холста: 16:9, DPR ≤ 2 ----------
  let DPR = 1;
  function fit() {
    const r = canvas.getBoundingClientRect();
    DPR = SHOT ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(160, Math.round(r.width * DPR)), h = Math.round((w * 9) / 16);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    state.dirty = true;
  }
  window.addEventListener('resize', fit);
  document.addEventListener('fullscreenchange', () => setTimeout(fit, 60));

  // ---------- загрузка фильма ----------
  function load(script, fixes, opts) {
    const o = opts || {};
    state.script = script;
    state.fixes = fixes || [];
    try { state.film = Lang.build(script); }
    catch (e) {
      toast('Сценарий не собрался — показываю заготовку');
      const d = Lang.normalize(DEMOS[0], DEMOS[0].phrase);
      state.script = d.script; state.film = Lang.build(d.script);
    }
    if (window.Music) Music.load(state.film);
    state.t = o.t || 0;
    state.playing = o.play !== false;
    buildMarks();
    renderScript();
    buildChips();
    updatePlayer();
    state.dirty = true;
  }
  function loadDemo(i, opts) {
    state.demoIndex = i;
    const d = DEMOS[i];
    const { script, fixes } = Lang.normalize(JSON.parse(JSON.stringify(d)), d.phrase);
    load(script, fixes, opts);
    document.querySelectorAll('.demo').forEach((b, k) => b.classList.toggle('on', k === i));
  }

  // ---------- плеер ----------
  const playBtn = $('#play'), soundBtn = $('#sound');
  const fmt = (s) => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  // 1 сцена, 2 сцены, 5 сцен
  const plural = (n, one, few, many) => { const a = n % 10, b = n % 100; return n + '\u00a0' + (a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many); };
  function updatePlayer() {
    const f = state.film; if (!f) return;
    const k = f.duration ? state.t / f.duration : 0;
    $('#fill').style.width = (k * 100).toFixed(2) + '%';
    $('#knob').style.left = (k * 100).toFixed(2) + '%';
    $('#time').textContent = fmt(state.t) + ' / ' + fmt(f.duration);
    $('#timeline').setAttribute('aria-valuenow', Math.round(k * 100));
    playBtn.classList.toggle('paused', !state.playing);
    playBtn.setAttribute('aria-label', state.playing ? 'Пауза' : 'Смотреть');
    soundBtn.classList.toggle('on', state.sound);
    soundBtn.setAttribute('aria-pressed', String(state.sound));
    soundBtn.setAttribute('aria-label', state.sound ? 'Выключить звук' : 'Включить звук');
    $('#withSound').hidden = state.sound || SHOT && false;
    const S = Lang.sceneAt(f, state.t);
    document.querySelectorAll('.sp-scene').forEach((b) => b.classList.toggle('now', +b.dataset.i === S.i));
  }
  function buildMarks() {
    const f = state.film, box = $('#marks');
    box.innerHTML = '';
    f.scenes.forEach((S, i) => {
      if (i === 0) return;
      const m = document.createElement('div');
      m.className = 'mark'; m.style.left = ((S.t0 / f.duration) * 100).toFixed(2) + '%';
      box.appendChild(m);
    });
  }
  function seek(t, keepPlaying) {
    state.t = clamp(t, 0, state.film.duration);
    if (window.Music && !state.dragging) Music.seek(state.t, state.playing && state.sound);
    if (!keepPlaying && state.t >= state.film.duration) state.playing = false;
    state.dirty = true;
    updatePlayer();
  }
  function setPlaying(p) {
    if (p && state.t >= state.film.duration - 0.05) state.t = 0;
    state.playing = p;
    if (window.Music) p && state.sound ? Music.play(state.t) : Music.stop();
    updatePlayer();
  }
  async function enableSound(on, restart) {
    state.sound = on;
    if (on && window.Music) {
      await Music.unlock();
      if (restart) { state.t = 0; state.playing = true; }
      if (state.playing) Music.play(state.t);
    } else if (window.Music) Music.stop();
    updatePlayer();
  }
  playBtn.addEventListener('click', () => setPlaying(!state.playing));
  $('#replay').addEventListener('click', () => { state.t = 0; setPlaying(true); seek(0, true); });
  soundBtn.addEventListener('click', () => enableSound(!state.sound, false));
  $('#withSound').addEventListener('click', () => enableSound(true, true));
  canvas.addEventListener('click', () => setPlaying(!state.playing));
  $('#full').addEventListener('click', () => {
    const el = $('#screen');
    const quiet = (p) => { if (p && p.catch) p.catch(() => toast('Полноэкранный режим недоступен в этом браузере')); };
    try {
      if (document.fullscreenElement) quiet(document.exitFullscreen());
      else if (el.requestFullscreen) quiet(el.requestFullscreen());
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    } catch (e) { toast('Полноэкранный режим недоступен в этом браузере'); }
  });
  // перемотка по шкале
  const tl = $('#timeline');
  function tlSeek(e) {
    const r = tl.getBoundingClientRect();
    seek(((e.clientX - r.left) / r.width) * state.film.duration, true);
  }
  tl.addEventListener('pointerdown', (e) => { state.dragging = true; tl.classList.add('drag'); tl.setPointerCapture(e.pointerId); tlSeek(e); });
  tl.addEventListener('pointermove', (e) => { if (state.dragging) tlSeek(e); });
  const endDrag = () => { if (!state.dragging) return; state.dragging = false; tl.classList.remove('drag'); if (window.Music) Music.seek(state.t, state.playing && state.sound); };
  tl.addEventListener('pointerup', endDrag); tl.addEventListener('pointercancel', endDrag);
  tl.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { seek(state.t - 5, true); e.preventDefault(); }
    if (e.key === 'ArrowRight') { seek(state.t + 5, true); e.preventDefault(); }
  });
  document.addEventListener('keydown', (e) => {
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.code === 'Space') { e.preventDefault(); setPlaying(!state.playing); }
    else if (e.key === 'ArrowLeft' && e.target !== tl) { seek(state.t - 5, true); e.preventDefault(); }
    else if (e.key === 'ArrowRight' && e.target !== tl) { seek(state.t + 5, true); e.preventDefault(); }
    else if (e.key === 'Escape') { if (failed) $('#keepOld').click(); openScript(false); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && state.playing) setPlaying(false); });

  // ---------- главный цикл ----------
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - (state.last || now)) / 1000);
    state.last = now;
    if (document.hidden || !state.film) return;
    if (state.playing && !state.dragging) {
      state.t += dt;
      if (state.t >= state.film.duration) { state.t = state.film.duration; state.playing = false; if (window.Music) Music.stop(); }
      if (window.Music && state.sound) Music.tick(state.t);
      state.dirty = true;
      updatePlayer();
    }
    if (state.dirty) {
      state.dirty = false;
      try { Stage.render(ctx, state.film, state.t, { dpr: DPR }); }
      catch (e) { state.playing = false; toast('Движок споткнулся на этом кадре'); throw e; }
    }
  }

  // ---------- сценарий как текст ----------
  function renderScript() {
    const box = $('#scriptText');
    box.innerHTML = '';
    const lines = Lang.toScreenplay(state.script);
    const add = (tag, cls, text) => { const el = document.createElement(tag); el.className = cls; if (text != null) el.textContent = text; box.appendChild(el); return el; };
    for (const l of lines) {
      if (l.k === 'title') add('div', 'sp-title', l.text);
      else if (l.k === 'logline') add('p', 'sp-log', l.text);
      else if (l.k === 'cast') add('p', 'sp-cast', l.text);
      else if (l.k === 'scene') {
        const b = add('button', 'sp-scene', l.text);
        b.type = 'button'; b.dataset.i = l.i;
        b.addEventListener('click', () => { seek(state.film.scenes[l.i].t0 + 0.05, true); setPlaying(true); });
      } else if (l.k === 'action') add('p', 'sp-action', l.text);
      else if (l.k === 'camera') add('p', 'sp-camera', l.text);
      else if (l.k === 'note') add('p', 'sp-note', l.text);
      else if (l.k === 'line') {
        const d = add('div', 'sp-line');
        const w = document.createElement('span'); w.className = 'who'; w.textContent = l.who + (l.meta ? ' ' : '');
        if (l.meta) { const m = document.createElement('span'); m.className = 'meta'; m.textContent = l.meta; w.appendChild(m); }
        const s = document.createElement('span'); s.className = 'say'; s.textContent = '«' + l.text + '»';
        d.appendChild(w); d.appendChild(s);
      }
    }
    const chk = $('#check');
    const beats = state.script.scenes.reduce((n, s) => n + s.beats.length, 0);
    chk.classList.toggle('warn', state.fixes.length > 0);
    chk.innerHTML = '';
    const head = document.createElement('div');
    const b = document.createElement('b');
    b.textContent = state.fixes.length ? `Проверка по схеме: исправлено ${state.fixes.length}` : 'Проверка по схеме пройдена';
    head.appendChild(b);
    head.appendChild(document.createTextNode(` · ${plural(state.script.scenes.length, 'сцена', 'сцены', 'сцен')}, ${plural(beats, 'действие', 'действия', 'действий')}, ${fmt(state.film.duration)}`));
    chk.appendChild(head);
    if (state.fixes.length) {
      const ul = document.createElement('ul');
      state.fixes.slice(0, 6).forEach((f) => { const li = document.createElement('li'); li.textContent = f; ul.appendChild(li); });
      chk.appendChild(ul);
    }
    $('#scriptJson').value = JSON.stringify(stripScript(state.script), null, 1);
    $('#jsonMsg').textContent = '';
  }
  function stripScript(s) {
    return { title: s.title, mood: s.mood, cast: s.cast, scenes: s.scenes.map((sc) => ({ place: sc.place, time: sc.time, mood: sc.mood, props: sc.props.length ? sc.props : undefined, cast: sc.cast.map((c) => { const o = { id: c.id }; if (c.x != null) o.x = Math.round(c.x); if (c.y != null) o.y = Math.round(c.y); if (c.emotion) o.emotion = c.emotion; if (c.face) o.face = c.face; return o; }), beats: sc.beats })) };
  }
  function openScript(open) {
    const el = $('#script');
    el.classList.toggle('open', open);
    el.setAttribute('aria-hidden', String(!open));
    $('#scriptBtn').setAttribute('aria-expanded', String(open));
  }
  $('#scriptBtn').addEventListener('click', () => openScript(!$('#script').classList.contains('open')));
  $('#scriptClose').addEventListener('click', () => openScript(false));
  document.querySelectorAll('.stab').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('.stab').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', String(x === b)); });
    const json = b.dataset.tab === 'json';
    $('#scriptText').hidden = json; $('#scriptJsonWrap').hidden = !json;
  }));
  $('#applyJson').addEventListener('click', () => {
    let raw;
    try { raw = JSON.parse($('#scriptJson').value); }
    catch (e) { $('#jsonMsg').textContent = 'Это не JSON: ' + String(e.message).slice(0, 60); return; }
    const { script, fixes } = Lang.normalize(raw, state.script.phrase);
    load(script, fixes, { play: true });
    toast(fixes.length ? `Снято. Движок поправил ${plural(fixes.length, 'место', 'места', 'мест')}` : 'Снято по вашему тексту');
  });

  // ---------- подсказки и демо ----------
  const IDEAS_NEW = [
    'кот влюбился в луну', 'два робота делят последнюю батарейку', 'медведь боится темноты',
    'бабушка учит привидение печь пироги', 'пёс потерялся в большом городе', 'инопланетянин впервые видит снег',
    'воробей хочет стать орлом', 'девочка поссорилась с солнцем',
  ];
  function editIdeas() {
    const c = state.script ? state.script.cast : [];
    const a = c[0], b = c[1];
    const acc = (n) => n;
    const list = [];
    if (a) list.push(`пусть ${acc(a.name)} будет злодеем`);
    list.push('добавь погоню');
    list.push('сделай грустный финал');
    list.push('перенеси всё в космос');
    if (b) list.push(`пусть ${b.name} всё время поёт`);
    list.push('добавь бабушку с пирогами');
    return list;
  }
  function buildChips() {
    const box = $('#chips');
    box.innerHTML = '';
    const list = state.mode === 'edit' ? editIdeas() : IDEAS_NEW.slice(0, 5);
    for (const t of list) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip' + (state.mode === 'edit' ? ' edit' : ''); b.textContent = t;
      b.addEventListener('click', () => { $('#phrase').value = t; submit(); });
      box.appendChild(b);
    }
  }
  function buildDemos() {
    const box = $('#demoList');
    DEMOS.forEach((d, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'demo'; b.textContent = d.title;
      b.addEventListener('click', () => { loadDemo(i, { play: true }); if (window.Music && state.sound) Music.play(0); $('#phrase').value = d.phrase; setMode('new'); });
      box.appendChild(b);
    });
  }
  function setMode(m) {
    state.mode = m;
    document.querySelectorAll('.mode').forEach((b) => { b.classList.toggle('on', b.dataset.mode === m); b.setAttribute('aria-selected', String(b.dataset.mode === m)); });
    const inp = $('#phrase');
    inp.placeholder = m === 'edit' ? 'Что поправить? Например: пусть кот будет злодеем' : 'О чём мультфильм? Например: медведь боится темноты';
    $('.go-label').textContent = m === 'edit' ? 'Переснять' : 'Снять';
    if (m === 'edit' && state.script && inp.value === state.script.phrase) inp.value = '';
    buildChips();
  }
  document.querySelectorAll('.mode').forEach((b) => b.addEventListener('click', () => { setMode(b.dataset.mode); $('#phrase').focus(); }));

  // ---------- тост ----------
  let toastTimer = 0;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3800);
  }

  // ---------- нейросеть ----------
  const SYSTEM = `Ты — режиссёр и сценарист коротких мультфильмов. По одной фразе зрителя пишешь смешной и трогательный мультфильм на 35–55 секунд на строгом языке сцен. Движок сам нарисует кукол, анимирует их, поставит камеру и музыку. Отвечаешь только JSON.

СЛОВАРЬ (только эти значения):
place: city (город), forest (лес), sea (берег моря), space (космос, астероид), kitchen (кухня), roof (крыша, лучше ночью), meadow (луг, деревня), winter (зимний двор), room (комната), junkyard (свалка).
time: day, evening, night.
kind — куклы: cat, dog, robot, girl, boy, oldman, grandma, bird, moon (луна с лицом, парит в небе), sun (солнце с лицом), mouse, bear, ghost, alien. Нет нужного героя — возьми похожую куклу и дай имя (дракон → alien «Дракоша», лиса → dog «Лиса», заяц → mouse «Заяц»).
look: none, tophat, crown, bow, glasses, scarf, cap, mustache.
emotion: neutral, happy, sad, angry, scared, surprised, love, sly, tired.
mood — музыка: happy, romantic, sad, tense, chase, mystery, epic, silly, calm.
camera: wide, medium, close, pan, shake.
prop — реквизит: battery, flower, fish, ball, star, cake, bone, gift, key, umbrella, apple, balloon, letter, cheese, heart.
do — действия:
 walk / run {to}: идёт / бежит к x (0–100) или к актёру (id);
 fly {to, y}: летит (y — высота 0–100; луна и солнце в небе на y 55–65);
 jump {to?, y?}; enter {to?}: входит в кадр; exit {to:"left"|"right"}: уходит;
 appear / vanish: появляется / исчезает в облачке;
 say {text}, sing {text}, think {text}: реплика в облачке, песня, мысль;
 look {to}; wave {to?}; turn; hug {to}; push {to} (тот падает); chase {to} (погоня, оба убегают за кадр);
 take {what} (what обязателен; взятое остаётся в руках и в следующих сценах); give {to, what}; fall; cry; laugh; dance; sleep; shake (дрожит); wait {dur}.

ФОРМАТ:
{"title":"до 40 знаков","mood":"silly",
 "cast":[{"id":"kot","kind":"cat","name":"Барсик","look":"none","villain":false}],
 "scenes":[{"place":"roof","time":"night","mood":"romantic",
   "props":[{"id":"ryba","kind":"fish","x":70}],
   "cast":[{"id":"kot","x":25,"emotion":"sad"}],
   "beats":[
    {"who":"kot","do":"walk","to":45},
    {"who":"kot","do":"say","text":"…","emotion":"love"},
    {"camera":"close","on":"kot"},
    {"who":"luna","do":"wave","to":"kot","with":true}]}]}

ПРАВИЛА:
- 4–6 сцен, в каждой 3–8 действий, всего 22–32 действия.
- Действия идут по очереди; "with":true — одновременно с предыдущим.
- x: 0 — левый край, 100 — правый; актёры не ближе 15 друг к другу; в кадре не больше 4 актёров.
- Реплики — живой разговорный русский, до 70 знаков, 1–2 фразы, у каждого героя своя манера. Юмор, неожиданные детали. Никаких реальных людей и брендов.
- Сюжет: завязка, препятствие, поворот, трогательный финал. Обязательно физическая комедия: падения, погони, толчки, недоразумения. Эмоции меняются и видны по лицам.
- Меняй места и время суток между сценами, если это помогает истории; музыку подбирай к сцене.
- Камеру ставь редко — движок сам выбирает планы. Крупный план — для главной эмоции.
- Злодею ставь "villain":true.`;
  const HINT = 'title, mood, cast[{id,kind,name,look,villain}], scenes[{place,time,mood,props[{id,kind,x}],cast[{id,x,y,emotion}],beats[{who,do,to,y,what,text,emotion,with}|{camera,on}]}]';
  const STEPS = ['Сценарист грызёт карандаш', 'Кастинг: куклы проходят пробы', 'Раскадровка: рисуем планы', 'Художник красит фоны', 'Композитор ищет нужную ноту', 'Режиссёр кричит «Мотор!»'];
  let writingTimer = 0;
  function showWriting(phrase, mode) {
    $('#wPhrase').textContent = (mode === 'edit' ? 'правка: ' : '') + '«' + phrase + '»';
    const t0 = performance.now();
    const tick = () => {
      const s = (performance.now() - t0) / 1000;
      $('#wTime').textContent = Math.floor(s) + ' с';
      $('#wStep').textContent = STEPS[Math.min(STEPS.length - 1, Math.floor(s / 4.5))];
    };
    tick();
    clearInterval(writingTimer); writingTimer = setInterval(tick, 250);
    $('#writing').hidden = false;
  }
  function hideWriting() {
    clearInterval(writingTimer);
    $('#writing').hidden = true; $('#wFail').hidden = true; $('#clap').classList.remove('fail');
  }
  // дубль не удался: хлопушка остаётся на экране, объясняет причину и предлагает повторить
  let failed = null;
  const FAIL_HINT = {
    network: 'Проверьте интернет и повторите дубль.',
    timeout: 'Сценарист задумался дольше обычного. Второй дубль обычно быстрее.',
    rate: 'Подождите минуту и повторите.',
    credits: 'Пополните баланс OpenRouter или смотрите готовые мультфильмы ниже.',
    auth: 'Проверьте ключ OpenRouter.',
    bad: 'Так бывает. Второй дубль обычно удачнее.',
  };
  function showFail(err, req) {
    clearInterval(writingTimer);
    failed = req;
    const why = String((err && err.ru) || 'Нейросеть не ответила').replace(/[.!…]+$/, '');
    $('#wStep').textContent = 'Дубль не снят';
    $('#wErr').textContent = why + '. ' + (FAIL_HINT[err && err.kind] || 'Попробуйте ещё раз.');
    $('#wFail').hidden = false;
    $('#clap').classList.add('fail');
    $('#writing').hidden = false;
    $('#retry').focus({ preventScroll: true });
  }
  $('#retry').addEventListener('click', () => { const r = failed; failed = null; if (r && !state.busy) generate(r.text, r.mode); });
  $('#keepOld').addEventListener('click', () => { const r = failed; failed = null; hideWriting(); setPlaying(r ? r.wasPlaying : true); });
  function updateCost() {
    const u = window.AI ? AI.usage : { costUSD: 0, calls: 0 };
    $('#cost').textContent = '$' + u.costUSD.toFixed(4) + (u.calls ? ` · ${u.calls} запр.` : '');
    $('#demoBadge').hidden = !(window.AI && AI.demo);
  }
  function bestDemo(phrase) {
    const kinds = Lang.detectKinds(phrase);
    let best = 0, bs = -1;
    DEMOS.forEach((d, i) => {
      let s = 0;
      for (const c of d.cast) if (kinds.includes(c.kind)) s += 2;
      for (const w of phrase.toLowerCase().split(/\s+/)) if (w.length > 3 && d.phrase.includes(w.slice(0, -1))) s += 1;
      if (s > bs) { bs = s; best = i; }
    });
    return best;
  }
  async function submit() {
    const inp = $('#phrase');
    const text = inp.value.trim();
    if (!text) { const f = $('#promptForm'); f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake'); inp.focus(); return; }
    if (state.busy || SHOT) return;
    const mode = state.mode;
    if (!window.AI) { toast('Клиент нейросети не загрузился — показываю заготовку'); loadDemo(bestDemo(text), { play: true }); return; }
    const ok = await AI.ensureKey();
    updateCost();
    if (!ok) {
      if (mode === 'edit') { toast('Правки словами работают только с нейросетью'); return; }
      const i = bestDemo(text);
      toast(`Демо-режим: показываю заготовку «${DEMOS[i].title}»`);
      loadDemo(i, { play: true });
      return;
    }
    await generate(text, mode);
  }
  async function generate(text, mode) {
    state.busy = true;
    $('#go').disabled = true;
    const wasPlaying = state.playing;
    setPlaying(false);
    showWriting(text, mode);
    let messages;
    if (mode === 'edit' && state.script) {
      messages = [{ role: 'user', content: `Вот текущий сценарий на языке сцен:\n${JSON.stringify(stripScript(state.script))}\n\nПравка зрителя: «${text}».\nПерепиши сценарий с учётом правки. Сохрани героев и то, что правка не затрагивает, но смело меняй сюжет, если правка этого требует. Верни полный сценарий в том же формате.` }];
    } else {
      messages = [{ role: 'user', content: `Фраза зрителя: «${text}». Напиши мультфильм.` }];
    }
    let raw = null, err = null;
    try {
      raw = await AI.json(messages, { system: SYSTEM, schemaHint: HINT, think: true, maxTokens: 2600, temperature: 0.9 });
    } catch (e) { err = e; }
    state.busy = false;
    $('#go').disabled = false;
    updateCost();
    if (!raw || typeof raw !== 'object') {
      showFail(err, { text, mode, wasPlaying });
      return;
    }
    hideWriting();
    const phrase = mode === 'edit' && state.script ? state.script.phrase : text;
    const { script, fixes } = Lang.normalize(raw, phrase);
    if (mode === 'edit') script.edits = [...((state.script && state.script.edits) || []), text];
    load(script, fixes, { play: true });
    document.querySelectorAll('.demo').forEach((b) => b.classList.remove('on'));
    if (window.Music && state.sound) Music.play(0);
    toast(fixes.length ? `Готово! Движок проверил сценарий и поправил ${plural(fixes.length, 'место', 'места', 'мест')}` : 'Готово! Сценарий прошёл проверку по схеме');
    if (mode === 'edit') { $('#phrase').value = ''; }
    else setMode('edit');
    try { localStorage.setItem('olc_last', JSON.stringify(stripScript(script))); } catch (e) { /* хранилище недоступно */ }
  }
  $('#promptForm').addEventListener('submit', (e) => { e.preventDefault(); submit(); });
  if (window.AI) AI.onStatus = () => updateCost();

  // ---------- старт ----------
  buildDemos();
  fit();
  if (SHOT) {
    // обложка: заготовленный мультфильм на выразительном кадре, без нейросети
    loadDemo(0, { play: false });
    const f = state.film, S = f.scenes[3];
    const hug = S && S.fx.find((q) => q.type === 'hearts' && q.other);
    state.t = hug ? hug.t0 + 0.9 : f.duration * 0.6;
    state.playing = false;
    $('#phrase').value = DEMOS[0].phrase;
  } else {
    let restored = null;
    try { const s = localStorage.getItem('olc_last'); if (s && /[?&]last\b/.test(location.search)) restored = JSON.parse(s); } catch (e) { restored = null; }
    if (restored) { const { script, fixes } = Lang.normalize(restored, restored.phrase || ''); load(script, fixes, { play: true }); }
    else loadDemo(0, { play: true });
    $('#phrase').value = DEMOS[0].phrase;
  }
  updateCost();
  updatePlayer();
  requestAnimationFrame(frame);

  // для проверки из _tools/shot
  window.Cartoon = {
    state, seek: (t) => { seek(t, true); Stage.render(ctx, state.film, state.t, { dpr: DPR }); },
    generate: (text, mode) => { if (window.AI) { AI.shot = false; AI.demo = false; } return generate(text, mode || 'new'); },
    loadDemo,
    // отладка: контактный лист из 6 кадров поверх страницы
    sheet(times) {
      const f = state.film, list = times || [0.12, 0.37, 0.62, 0.87].map((k) => k * f.duration);
      let over = document.getElementById('sheet');
      if (!over) { over = document.createElement('canvas'); over.id = 'sheet'; over.style.cssText = 'position:fixed;inset:0;z-index:99;width:100vw;height:100vh;background:#111'; document.body.appendChild(over); }
      over.width = innerWidth; over.height = innerHeight;
      const g = over.getContext('2d'), ch = Math.floor(innerHeight / 2) - 4, cw = Math.floor((ch * 16) / 9);
      const off = document.createElement('canvas'); off.width = cw; off.height = ch;
      const oc = off.getContext('2d');
      list.slice(0, 4).forEach((t, k) => {
        Stage.render(oc, f, t, { dpr: 1 });
        const x = (k % 2) * (cw + 8), y = Math.floor(k / 2) * (ch + 8);
        g.drawImage(off, x, y);
        g.fillStyle = '#ffc247'; g.font = '600 14px Rubik, sans-serif'; g.fillText(t.toFixed(1) + ' с', x + 8, y + 18);
      });
      return list.map((t) => +t.toFixed(1));
    },
    info: () => ({ title: state.script.title, dur: +state.film.duration.toFixed(1), scenes: state.film.scenes.length, fixes: state.fixes, cost: window.AI ? AI.usage : null }),
  };
})();
