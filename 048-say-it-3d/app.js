/* ================================================================
   Приложение: интерфейс, история и отмена, галерея, чертёж,
   поток «набросок атмосферы → полный граф» и демо-режим.
   ================================================================ */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  if (!window.THREE || !window.S3 || !S3.world || !S3.engine) { $('#fatal').hidden = false; return; }
  const L = S3.lang, W = S3.world, E = S3.engine, D = S3.demo, B = S3.brain, S = S3.sound;
  const SHOT = !!window.__SHOT__;
  const hasAI = !!window.AI;

  const el = {
    badge: $('#demoBadge'), cost: $('#cost'), snd: $('#btnSound'), undo: $('#btnUndo'), redo: $('#btnRedo'),
    drawerBtn: $('#btnDrawer'), drawer: $('#drawer'), drawerClose: $('#btnDrawerClose'), scrim: $('#scrim'),
    log: $('#buildlog'), reply: $('#reply'), replyText: $('#replyText'), timer: $('#replyTimer'), chips: $('#chips'),
    form: $('#promptForm'), input: $('#promptInput'), btnNew: $('#btnNew'), mic: $('#btnMic'), go: $('#btnGo'), tag: $('#promptTag'),
    history: $('#history'), gallery: $('#gallery'), save: $('#btnSave'), code: $('#code'), title: $('#sceneTitle'), hint: $('#hint'),
  };

  // ---------- имена для журнала ----------
  const NAME = { house: 'дом', tree: 'дерево', bush: 'куст', flowers: 'цветы', grass: 'трава', rock: 'камень', cliff: 'скала', mountain: 'гора', mushroom: 'гриб', stump: 'пень',
    pond: 'пруд', lighthouse: 'маяк', windmill: 'мельница', well: 'колодец', fence: 'забор', bridge: 'мостик', tent: 'палатка', campfire: 'костёр', lamp: 'фонарь', bench: 'скамейка',
    table: 'стол', chair: 'стул', samovar: 'самовар', barrel: 'бочка', crate: 'ящик', car: 'машинка', boat: 'лодка', balloon: 'воздушный шар', rocket: 'ракета', ufo: 'летающая тарелка',
    snowman: 'снеговик', sign: 'табличка', flag: 'флаг', umbrella: 'зонт', gift: 'подарок', person: 'человечек', animal: 'зверь', bird: 'птицы', fish: 'рыба', cloud: 'облако', rainbow: 'радуга', custom: 'своя вещь' };
  const KIND = { izba: 'изба', cottage: 'домик', modern: 'дом', castle: 'замок', barn: 'амбар', shop: 'лавка', tower: 'башня', oak: 'дуб', pine: 'сосна', birch: 'берёза', apple: 'яблоня',
    palm: 'пальма', sakura: 'сакура', autumn: 'клён', fir: 'ель', dead: 'сухое дерево', crystal: 'кристалл', volcano: 'вулкан', tulips: 'тюльпаны', sunflowers: 'подсолнухи', reeds: 'камыш', log: 'бревно',
    circus: 'шатёр', paper: 'бумажный фонарик', truck: 'грузовик', bus: 'автобус', ship: 'корабль', sail: 'парусник', hay: 'сено',
    man: 'человечек', woman: 'женщина', child: 'ребёнок', grandpa: 'дед', grandma: 'бабушка', fisher: 'рыбак', wizard: 'волшебник', knight: 'рыцарь', astronaut: 'космонавт', chef: 'повар',
    cat: 'кот', dog: 'пёс', cow: 'корова', sheep: 'овца', pig: 'поросёнок', horse: 'лошадь', rabbit: 'кролик', fox: 'лиса', bear: 'медведь', deer: 'олень', chicken: 'курица', duck: 'утка',
    frog: 'лягушка', hedgehog: 'ёж', penguin: 'пингвин', gull: 'чайки', crow: 'вороны', songbird: 'птички', carp: 'рыбка', dolphin: 'дельфин', storm: 'туча' };
  const TIME_RU = { morning: 'утро', day: 'день', sunset: 'закат', night: 'ночь' };
  const WEATHER_RU = { clear: 'ясно', cloudy: 'облачно', rain: 'дождь', storm: 'гроза', snow: 'снег', fog: 'туман' };
  const GROUND_RU = { grass: 'трава', meadow: 'луг', autumn: 'осень', snow: 'снег', sand: 'песок', desert: 'пустыня', rock: 'камень', moon: 'Луна', mars: 'Марс' };
  const nameOf = (o) => (o.type === 'custom' ? o.name || NAME.custom : KIND[o.kind] || NAME[o.type] || o.type);

  // ---------- реплика мастера ----------
  let typeT = 0, thinkT = 0, thinkStart = 0, phraseT = 0;
  function say(text, err) {
    clearInterval(typeT);
    el.reply.classList.toggle('is-error', !!err);
    const s = String(text || '');
    if (SHOT || s.length < 3) { el.replyText.textContent = s; return; }
    let i = 0;
    el.replyText.textContent = '';
    typeT = setInterval(() => {
      i = Math.min(s.length, i + 2);
      el.replyText.textContent = s.slice(0, i);
      if (i >= s.length) clearInterval(typeT);
    }, 24);
  }
  const PHRASES = ['Размечаю остров', 'Подбираю палитру', 'Ищу место для главного', 'Сажаю деревья', 'Уговариваю зверей позировать', 'Проверяю, чтобы ничего не висело в воздухе', 'Раскладываю тени'];
  function thinking(on, first) {
    clearInterval(thinkT); clearInterval(phraseT);
    el.go.disabled = on;
    el.form.classList.toggle('is-busy', on);
    W.setThinking(on);
    if (!on) { el.timer.hidden = true; return; }
    thinkStart = performance.now();
    el.timer.hidden = false;
    const tick = () => { el.timer.textContent = ((performance.now() - thinkStart) / 1000).toFixed(1).replace('.', ',') + ' с'; updCost(); };
    tick(); thinkT = setInterval(tick, 100);
    let k = 0;
    const dots = '<span class="dots"><span>.</span><span>.</span><span>.</span></span>';
    const phrase = () => { clearInterval(typeT); el.reply.classList.remove('is-error'); el.replyText.innerHTML = PHRASES[k++ % PHRASES.length] + dots; };
    if (first) { clearInterval(typeT); el.replyText.innerHTML = first + dots; } else phrase();
    phraseT = setInterval(phrase, 3600);
  }

  // ---------- журнал стройки ----------
  function log(mark, text, cls) {
    if (SHOT) return;
    const li = document.createElement('li');
    if (cls) li.className = cls;
    li.innerHTML = '<i>' + mark + '</i>';
    li.appendChild(document.createTextNode(text));
    el.log.appendChild(li);
    while (el.log.children.length > 9) el.log.firstChild.remove();
    setTimeout(() => { li.classList.add('is-out'); setTimeout(() => li.remove(), 650); }, 4200);
  }
  E.onLand = (it) => {
    S.pop(Math.max(0.3, L.footprint(it.o) + (it.rig.top || 1) * 0.15), it.nature);
    log('+', nameOf(it.o));
  };
  W.onThunder = () => S.thunder();
  W.frameFns.push(() => S.ambience(W.cur.rain, W.cur.wind));

  function logDiff(prev, next) {
    const ids = new Set(next.objects.map((o) => o.id)), before = new Map(prev.objects.map((o) => [o.id, o]));
    for (const o of prev.objects) if (!ids.has(o.id)) log('−', nameOf(o), 'minus');
    for (const o of next.objects) {
      const p = before.get(o.id);
      if (p && JSON.stringify(p) !== JSON.stringify(o)) log('~', nameOf(o) + (o.anim !== p.anim && o.anim !== 'none' ? ': ' + ANIM_RU[o.anim] : ''), 'env');
    }
    const a = prev.env, b = next.env;
    if (a.time !== b.time) log('◐', TIME_RU[b.time], 'env');
    if (a.weather !== b.weather) log('☂', WEATHER_RU[b.weather], 'env');
    if (a.ground !== b.ground) log('▦', GROUND_RU[b.ground], 'env');
    if ((a.sea > 0.05) !== (b.sea > 0.05)) log('≈', b.sea > 0.05 ? 'море' : 'суша', 'env');
  }
  const ANIM_RU = { spin: 'крутится', sway: 'качается', blink: 'мигает', bob: 'покачивается', fly: 'летает', walk: 'гуляет', hop: 'прыгает', wave: 'машет', dance: 'танцует', pulse: 'пульсирует', swim: 'плавает', sleep: 'спит', none: 'стоит' };

  // ---------- сцена на экран ----------
  function setTitle(t) { el.title.innerHTML = 'Сейчас: <b></b>'; el.title.querySelector('b').textContent = t || 'без названия'; document.title = (t ? t + ' · ' : '') + 'Сказал — появилось'; }
  function show(scene, opts) {
    E.setScene(scene, opts || {});
    E.refreshEmitters();
    setTitle(scene.title);
    renderCode(scene);
  }

  // ---------- история и отмена ----------
  const hist = [];
  let hi = -1;
  function push(entry) {
    hist.splice(hi + 1);
    hist.push(entry);
    if (hist.length > 40) hist.shift();
    hi = hist.length - 1;
    renderHistory(); updUndo();
  }
  function go(i) {
    if (busy || i < 0 || i >= hist.length || i === hi) return;
    const prev = E.scene;
    hi = i;
    const h = hist[i];
    logDiff(prev, h.scene);
    show(h.scene, { animate: true });
    say(i < hist.length - 1 ? 'Вернул как было: «' + h.q + '».' : h.reply || 'Вернул.');
    renderHistory(); updUndo();
    setChips(h.hints);
  }
  function updUndo() { el.undo.disabled = hi <= 0 || busy; el.redo.disabled = hi >= hist.length - 1 || busy; }
  function renderHistory() {
    el.history.innerHTML = '';
    hist.forEach((h, i) => {
      const li = document.createElement('li');
      if (i === hi) li.className = 'is-cur';
      const b = document.createElement('button');
      b.innerHTML = '<span class="n"></span><span class="q"></span><span class="r"></span>';
      b.querySelector('.n').textContent = String(i + 1).padStart(2, '0');
      b.querySelector('.q').textContent = h.q;
      b.querySelector('.r').textContent = h.scene.title + ' · ' + h.scene.objects.length + ' объ.';
      b.onclick = () => go(i);
      li.appendChild(b);
      el.history.appendChild(li);
    });
  }

  // ---------- подсказки-кнопки ----------
  function setChips(hints) {
    el.chips.innerHTML = '';
    const list = [];
    const seen = new Set();
    const add = (text, fresh) => { const k = text.toLowerCase(); if (seen.has(k)) return; seen.add(k); list.push({ text, fresh }); };
    (hints || []).forEach((h) => add(h, false));
    if (AI_DEMO()) D.edits.forEach((h) => add(h, false));
    else ['сделай ночь', 'добавь дождь'].forEach((h) => add(h, false));
    const cur = E.scene.title;
    D.scenes.filter((s) => s.title !== cur).slice(0, AI_DEMO() ? 4 : 2).forEach((s) => add(s.q, true));
    if (!AI_DEMO()) ['Замок дракона в тумане', 'Тропический остров с пиратами'].forEach((s) => add(s, true));
    for (const c of list.slice(0, 9)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (c.fresh ? ' chip--new' : '');
      b.textContent = c.fresh ? '+ ' + c.text : c.text;
      b.title = c.fresh ? 'Новая сцена с нуля' : 'Правка поверх текущей сцены';
      b.onclick = () => { el.input.value = c.text; submit(c.text, c.fresh); };
      el.chips.appendChild(b);
    }
    el.chips.scrollLeft = 0;
  }

  // ---------- стоимость и режим ----------
  const AI_DEMO = () => !hasAI || AI.demo;
  let askedKey = false;
  function updCost() { if (hasAI) el.cost.textContent = '$' + AI.usage.costUSD.toFixed(4); }
  // на обложке нейросеть не зовут намеренно — это не «нет сети», метку не показываем
  function updBadge() { el.badge.hidden = !AI_DEMO() || (hasAI && AI.shot); }

  // ---------- главный поток ----------
  let busy = false, freshMode = false, ctrl = null;
  function setFresh(v) {
    freshMode = v;
    el.btnNew.classList.toggle('is-on', v);
    el.btnNew.setAttribute('aria-pressed', v ? 'true' : 'false');
    el.tag.textContent = v ? 'новая сцена' : 'правка';
    el.tag.classList.toggle('is-new', v);
    el.input.placeholder = v ? 'Опишите новую сцену: «деревня на Луне»' : 'Что поменять? «сделай ночь», «добавь кота»';
  }

  async function submit(raw, forceFresh) {
    const text = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 400);
    if (!text || busy) return;
    const fresh = !!forceFresh || freshMode || !E.scene.objects.length;
    // BYOK: при первой фразе без ключа предлагаем подключить свою нейросеть (один раз за визит)
    if (hasAI && !AI.shot && !AI.hasKey() && !askedKey) { askedKey = true; await AI.ensureKey(); }
    if (hasAI && !AI.shot) AI.demo = !AI.hasKey();
    updBadge();
    busy = true; updUndo();
    el.input.blur();
    try {
      if (AI_DEMO()) await runDemo(text, fresh);
      else await runLive(text, fresh);
    } finally {
      busy = false; updUndo(); thinking(false); updCost();
      if (fresh) setFresh(false);
    }
  }

  function commit(res, q, fallbackReply) {
    const prev = E.scene;
    logDiff(prev, res.scene);
    show(res.scene, { animate: true });
    push({ q, reply: res.reply || fallbackReply, scene: L.clone(res.scene), hints: res.hints });
    thinking(false);
    say(res.reply || fallbackReply || 'Готово.');
    setChips(res.hints);
    el.input.value = '';
  }

  async function runDemo(text, fresh) {
    thinking(true, 'Прикидываю');
    await new Promise((r) => setTimeout(r, 650 + Math.random() * 500));
    const resp = D.respond(text, E.scene, fresh);
    if (!resp) {
      thinking(false);
      say('В демо-режиме я понимаю простые правки: «ночь», «дождь», «добавь кота», «пусть все танцуют». Свободные фразы — с нейросетью.', true);
      return;
    }
    const isScene = resp.clear === true;
    const res = B.apply(E.scene, L.clone(resp), isScene);
    commit(res, text, resp.reply);
  }

  async function runLive(text, fresh) {
    if (ctrl) ctrl.abort();
    ctrl = new AbortController();
    const signal = ctrl.signal, prev = E.scene;
    let done = false;
    thinking(true, fresh ? 'Слушаю' : 'Смотрю, что поменять');
    if (fresh) {
      // пока большая модель думает, быстрая уже решает атмосферу — мир меняется сразу
      B.mood(text, prev, signal).then((m) => {
        if (done || !m || typeof m !== 'object') return;
        const env = L.normEnv(m.env, L.defaultEnv());
        const stage = { ...L.emptyScene(), title: typeof m.title === 'string' && m.title.trim() ? m.title.trim().slice(0, 40) : prev.title, env };
        logDiff(prev, stage);
        show(stage, { animate: true });
        if (typeof m.ack === 'string' && m.ack.trim()) { clearInterval(phraseT); clearInterval(typeT); el.replyText.innerHTML = ''; el.replyText.textContent = m.ack.trim().slice(0, 90); setTimeout(() => { if (!done) thinking.resume(); }, 3200); }
      }).catch(() => {});
    }
    try {
      const t0 = performance.now();
      const res = await B.build(text, prev, { fresh, signal });
      done = true;
      S3.app.last = { ms: Math.round(performance.now() - t0), report: res.report, reply: res.reply, hints: res.hints, n: res.scene.objects.length, resp: fresh ? undefined : res.resp };
      commit(res, text, fresh ? 'Готово — принимайте диораму.' : 'Сделано.');
    } catch (e) {
      done = true;
      if (e && e.name === 'AbortError') return;
      const kind = e && e.kind;
      // вернуть прежнюю сцену, если успели убрать
      if (E.scene !== prev && E.scene.objects.length !== prev.objects.length) show(prev, { animate: true });
      if (kind === 'nokey' || kind === 'auth' || kind === 'credits' || kind === 'network') {
        AI.demo = true; updBadge();
        say((e.ru || 'Нейросеть недоступна') + '. Включаю демо-режим.', true);
        setChips([]);
        return;
      }
      say((e && e.ru) || 'Что-то пошло не так. Попробуйте ещё раз другими словами.', true);
    }
  }
  thinking.resume = () => {
    clearInterval(phraseT);
    let k = 0;
    const dots = '<span class="dots"><span>.</span><span>.</span><span>.</span></span>';
    phraseT = setInterval(() => { el.replyText.innerHTML = PHRASES[k++ % PHRASES.length] + dots; }, 3600);
    el.replyText.innerHTML = PHRASES[k++] + dots;
  };

  // ---------- чертёж ----------
  function renderCode(scene) {
    const c = L.compact(scene);
    const lines = ['{', '  "title": ' + JSON.stringify(c.title) + ',', '  "env": ' + JSON.stringify(c.env) + ',', '  "objects": ['];
    c.objects.forEach((o, i) => lines.push('    ' + JSON.stringify(o) + (i < c.objects.length - 1 ? ',' : '')));
    lines.push('  ]', '}');
    const esc = lines.join('\n').replace(/&/g, '&amp;').replace(/</g, '&lt;');
    el.code.innerHTML = esc
      .replace(/"([a-z0-9_]+)":/gi, '<span class="k">"$1"</span>:')
      .replace(/:("[^"]*")/g, ':<span class="s">$1</span>')
      .replace(/([:,\[])(-?\d+(?:\.\d+)?)/g, '$1<span class="n">$2</span>');
  }

  // ---------- галерея ----------
  const GKEY = 's3-gallery-v1';
  const loadGal = () => { try { const v = JSON.parse(localStorage.getItem(GKEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
  const saveGal = (list) => { try { localStorage.setItem(GKEY, JSON.stringify(list)); return true; } catch (e) { return false; } };
  function renderGallery() {
    el.gallery.innerHTML = '';
    const mine = loadGal();
    const h1 = document.createElement('div'); h1.className = 'gal-h'; h1.style.gridColumn = '1 / -1'; h1.textContent = 'Мои сцены';
    el.gallery.appendChild(h1);
    if (!mine.length) {
      const p = document.createElement('p'); p.className = 'empty'; p.style.gridColumn = '1 / -1';
      p.textContent = 'Пока пусто. Соберите сцену и нажмите «Сохранить» — она останется в этом браузере.';
      el.gallery.appendChild(p);
    }
    for (const g of mine) el.gallery.appendChild(card(g.title, g.thumb, () => load(g.scene, 'Из галереи: ' + g.title), () => { saveGal(loadGal().filter((x) => x.id !== g.id)); renderGallery(); }));
    const h2 = document.createElement('div'); h2.className = 'gal-h'; h2.style.gridColumn = '1 / -1'; h2.textContent = 'Заготовки';
    el.gallery.appendChild(h2);
    for (const s of D.scenes) el.gallery.appendChild(card(s.title, '', () => { closeDrawer(); submitDemoScene(s); }, null, s.env));
  }
  const PLATE = { morning: ['#f3d3bf', '#8fb2d6'], day: ['#efe7d8', '#7fb0de'], sunset: ['#f1a47a', '#4d5b96'], night: ['#27365f', '#0b1230'] };
  function card(title, thumb, onOpen, onDel, env) {
    const b = document.createElement('div');
    b.className = 'card'; b.tabIndex = 0; b.setAttribute('role', 'button');
    if (thumb) { const img = document.createElement('img'); img.className = 'card__img'; img.alt = ''; img.src = thumb; b.appendChild(img); }
    else {
      const pl = document.createElement('span'); pl.className = 'card__img card__img--plate';
      const c = PLATE[(env && env.time) || 'day'];
      pl.style.background = 'linear-gradient(170deg,' + c[1] + ',' + c[0] + ')';
      pl.style.color = env && env.time === 'night' ? 'rgba(255,248,235,.8)' : 'rgba(43,36,32,.55)';
      pl.textContent = title[0];
      b.appendChild(pl);
    }
    const t = document.createElement('span'); t.className = 'card__t'; t.textContent = title; b.appendChild(t);
    b.onclick = onOpen;
    b.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } };
    if (onDel) {
      const x = document.createElement('button'); x.className = 'card__del'; x.setAttribute('aria-label', 'Удалить из галереи');
      x.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
      x.onclick = (e) => { e.stopPropagation(); onDel(); };
      b.appendChild(x);
    }
    return b;
  }
  function load(scene, q) {
    if (busy) return;
    closeDrawer();
    const prev = E.scene;
    logDiff(prev, scene);
    show(L.clone(scene), { animate: true });
    push({ q, reply: '', scene: L.clone(scene), hints: [] });
    say('Достал с полки: «' + scene.title + '».');
    setChips([]);
  }
  function submitDemoScene(s) {
    if (busy) return;
    const res = B.apply(E.scene, L.clone(s), true);
    commit(res, s.q, s.reply);
  }
  el.save.onclick = () => {
    const list = loadGal();
    const item = { id: Date.now(), title: E.scene.title, scene: L.clone(E.scene), thumb: W.snapshot() };
    list.unshift(item);
    let ok = saveGal(list.slice(0, 16));
    if (!ok) { for (const g of list) g.thumb = ''; ok = saveGal(list.slice(0, 16)); }
    say(ok ? 'Сохранил «' + item.title + '» в галерею.' : 'Не получилось сохранить: хранилище браузера недоступно.', !ok);
    renderGallery();
  };

  // ---------- панель ----------
  function openDrawer() { el.drawer.classList.add('is-open'); el.drawer.setAttribute('aria-hidden', 'false'); el.drawerBtn.setAttribute('aria-expanded', 'true'); el.scrim.classList.add('is-on'); renderGallery(); }
  function closeDrawer() { el.drawer.classList.remove('is-open'); el.drawer.setAttribute('aria-hidden', 'true'); el.drawerBtn.setAttribute('aria-expanded', 'false'); el.scrim.classList.remove('is-on'); }
  el.drawerBtn.onclick = () => (el.drawer.classList.contains('is-open') ? closeDrawer() : openDrawer());
  el.drawerClose.onclick = closeDrawer;
  el.scrim.onclick = closeDrawer;
  function tab(name) {
    document.querySelectorAll('.tab').forEach((t) => { const on = t.dataset.tab === name; t.classList.toggle('is-on', on); t.setAttribute('aria-selected', on ? 'true' : 'false'); });
    document.querySelectorAll('.pane').forEach((p) => p.classList.toggle('is-on', p.dataset.pane === name));
  }
  document.querySelectorAll('.tab').forEach((t) => { t.onclick = () => tab(t.dataset.tab); });

  // ---------- кнопки и клавиши ----------
  el.form.addEventListener('submit', (e) => { e.preventDefault(); submit(el.input.value); });
  el.btnNew.onclick = () => { setFresh(!freshMode); el.input.focus(); };
  el.undo.onclick = () => go(hi - 1);
  el.redo.onclick = () => go(hi + 1);
  el.snd.onclick = () => { S.setOn(!S.on); el.snd.classList.toggle('is-off', !S.on); el.snd.setAttribute('aria-pressed', S.on ? 'true' : 'false'); };
  el.snd.classList.toggle('is-off', !S.on);
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeDrawer(); return; }
    const inInput = e.target === el.input && el.input.value;
    if ((e.ctrlKey || e.metaKey) && !inInput && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) go(hi + 1); else go(hi - 1); }
    if ((e.ctrlKey || e.metaKey) && !inInput && e.key.toLowerCase() === 'y') { e.preventDefault(); go(hi + 1); }
    if (e.key === '/' && document.activeElement !== el.input) { e.preventDefault(); el.input.focus(); }
  });
  W.renderer.domElement.addEventListener('pointerdown', () => el.hint.classList.add('is-gone'), { once: true });
  setTimeout(() => el.hint.classList.add('is-gone'), 14000);

  // голосом: «Сказал — появилось» буквально
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SR && !SHOT) {
    el.mic.hidden = false;
    let rec = null;
    el.mic.onclick = () => {
      if (rec) { rec.stop(); return; }
      try {
        rec = new SR(); rec.lang = 'ru-RU'; rec.interimResults = true; rec.maxAlternatives = 1;
        let final = '';
        rec.onresult = (ev) => { let s = ''; for (const r of ev.results) { s += r[0].transcript; if (r.isFinal) final = s; } el.input.value = s; };
        rec.onerror = () => { el.mic.hidden = true; say('Микрофон недоступен — пишите словами.', true); };
        rec.onend = () => { el.mic.classList.remove('is-on'); rec = null; if (final.trim()) submit(final); };
        rec.start(); el.mic.classList.add('is-on');
        say('Слушаю — говорите.');
      } catch (e) { el.mic.hidden = true; }
    };
  }

  // ---------- старт ----------
  updBadge(); updCost(); setFresh(false);
  const start = SHOT ? D.cover || D.scenes[0] : D.scenes[0];
  const res0 = B.apply(L.emptyScene(), L.clone(start), true);
  show(res0.scene, { animate: !SHOT, instantEnv: true, delay: 0.3 });
  push({ q: start.q, reply: start.reply, scene: L.clone(res0.scene), hints: start.hints });
  el.replyText.textContent = SHOT ? start.reply : 'Опишите сцену — соберу её из слов. А пока вот: ' + start.title.toLowerCase() + '.';
  setChips(start.hints);
  W.start();
  if (hasAI) setInterval(updCost, 2000);

  // для проверки из консоли и автотестов
  S3.app = {
    submit, go, get scene() { return E.scene; }, get history() { return hist; },
    live() { if (!hasAI) return false; AI.shot = false; AI.demo = !AI.hasKey(); updBadge(); setChips([]); return !AI.demo; },
    usage: () => (hasAI ? { ...AI.usage } : null),
    // мгновенно показать заготовку (для проверки)
    demo(i) { const sc = D.scenes[i] || D.cover; const r = B.apply(L.emptyScene(), L.clone(sc), true); show(r.scene, { animate: false }); el.replyText.textContent = sc.reply; setChips(sc.hints); return r.scene.objects.length; },
  };
})();
