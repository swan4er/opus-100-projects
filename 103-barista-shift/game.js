/* ================================================================
   Смена — игровая логика.
   Цикл: заказ → приготовление руками → реакция живого клиента →
   последствия (касса, чаевые, отзывы, жалобы, звонки шефа).
   Скрытая правда о стакане хранится здесь и целиком уходит нейросети.
   ================================================================ */
(function () {
  'use strict';
  const D = window.DATA;
  const $ = (id) => document.getElementById(id);
  const rnd = Math.random;
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const NB = ' ';
  const SEC_PER_MIN = 3.2;            // реальных секунд на игровую минуту
  const START = 6 * 60, END = 9 * 60, PLAN = 3500;

  // ---------- типографика ----------
  const typo = (s) => String(s).replace(/(^|[\s(«„—-])([вксяоиуаВКСЯОИУА]|на|по|за|от|до|из|не|но|об|ни|же|ли|бы|во|со|ко|то|Не|На|По|За|От|До|Из|Но)\s+/g, `$1$2${NB}`).replace(/ — /g, `${NB}— `);
  const rub = (n) => Math.round(n).toLocaleString('ru-RU').replace(/\s/g, NB) + NB + '₽';
  const hhmm = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(Math.floor(m % 60)).padStart(2, '0');
  const plural = (n, a, b, c) => { const m = Math.abs(n) % 100, k = m % 10; return m > 10 && m < 20 ? c : k > 1 && k < 5 ? b : k === 1 ? a : c; };
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const fmt1 = (x) => x.toFixed(1).replace('.', ',');
  const vf = (c, m, f) => (c && c.arch && c.arch.fem ? f : m);   // глагол по роду клиента
  // при съёмке программный рендер даёт ~1 кадр в секунду: CSS-анимации появления
  // не успевают доиграть, поэтому в этом режиме они выключены
  if (window.__SHOT__) document.documentElement.classList.add('shot');

  // ================================================================
  // Состояние
  // ================================================================
  const S = {
    phase: 'boot', min: START,
    cash: 0, tips: 0, served: 0, lost: 0, remakes: 0, writeoff: 0,
    ratingSum: 4.1 * 23, ratingN: 23, reviews: [], complaints: [],
    hands: 72, drunk: 0, nerves: 22, rage: 8,
    beer: 12, beerDrunk: 0, beerInCups: 0, cigs: 8, smokes: 0, smokeMin: 0, lastSmokeEnd: -99, smokeStart: 0,
    queue: [], win: null, all: [], schedule: [], nextId: 1,
    flow: 'idle', cup: null, pf: { grams: 0, tamp: null, tilt: 0 }, pitcher: null,
    log: [], call: null, calls: { missed: 0, missedTotal: 0, lastAt: -99, queue: [] },
    smoking: false, shopperId: null, closing: false, ending: false, asleep: false, bossComing: 0,
    perfect: 0, flags: {}, nextBus: START + 14, chatterT: 12, microT: 0, lastDrinkAt: -99,
    mini: null, openStep: null, guessId: null, dayNotes: {},
  };
  window.SHIFT = S;

  // эффективный тремор: похмелье + нервы
  const effHands = () => clamp(S.hands + Math.max(0, S.nerves - 40) * .6, 0, 100);
  const brave = () => S.drunk >= .3;

  // ================================================================
  // Старт: ждём сцену
  // ================================================================
  function whenScene(fn) {
    if (window.View && View.ready) fn(); else if (window.View) View.on(fn);
  }
  setTimeout(() => {
    if (!(window.View && View.ready)) {
      $('bootT').innerHTML = typo('Киоск не открылся: трёхмерный движок грузится из интернета.<small>Проверьте соединение и обновите страницу. Нейросети тоже нужна сеть.</small>');
    }
  }, 12000);

  whenScene(() => {
    View.onFrame = tick;
    View.onPick = onPick;
    setupTitle();
    // при съёмке обложки заставка исчезает сразу, без плавного растворения
    View.onFirstFrame = () => { const b = $('boot'); if (AI.shot) b.style.transition = 'none'; b.classList.add('gone'); };
    // надписи на вывеске, меню, стикерах рисуются шрифтами из Google Fonts — перерисуем, когда те загрузятся
    try {
      Promise.all(['400 40px Rubik', '700 40px Rubik', '600 40px Caveat', '700 40px Caveat', '400 40px "Dela Gothic One"', '400 20px "PT Mono"']
        .map((f) => document.fonts.load(f))).then(() => View.redrawText(), () => {});
    } catch (e) {}
  });

  // ================================================================
  // Титул: живая диорама, очередь уже собирается
  // ================================================================
  const TITLE_PEOPLE = ['mihalych', 'tolik', 'dasha', 'lena'];
  const archById = (id) => D.CAST.find((a) => a.id === id);
  const BARISTA = { h: 1.8, w: 1.0, skin: 0xe9c3a4, hair: 0x4a3020, hat: 'beanie', hatC: 0x5d626b, coat: 0x3d4452, pants: 0x2a2a30, apron: 0x2f4a3a, tired: true };
  const BOSS = { h: 1.8, w: 1.38, skin: 0xe8a888, hair: null, hat: null, coat: 0x2a1c16, pants: 0x1e1e22, scarf: 0x8a8a90, acc: 'phone' };
  const JANITOR = { h: 1.72, w: 1.05, skin: 0xc99570, hair: 0x555555, hat: 'ushanka', hatC: 0x3a3a3a, coat: 0xe06a1e, pants: 0x2a2a30, acc: 'broom' };
  const SLOTS = [[.05, 1.82], [-1.0, 2.62], [-1.72, 3.45], [-2.36, 4.3], [-2.9, 5.18], [-3.35, 6.08], [-3.7, 7.0], [-4.9, 6.55], [-5.9, 6.1], [-6.8, 5.7], [-7.6, 5.3]];
  const slotYaw = (i) => i === 0 ? Math.PI : Math.atan2(0 - SLOTS[i][0], 1.3 - SLOTS[i][1]);

  function setupTitle() {
    S.phase = 'title';
    View.setDay(.26);
    const pp = View.people;
    const b = pp.spawn('barista', BARISTA, .15, .15, 0); b.y0 = .27; b.inside = true; pp.place('barista', .15, .15, 0); pp.mood('barista', 'sleepy');
    TITLE_PEOPLE.forEach((id, i) => { const a = archById(id); pp.spawn('t_' + id, a.looks, SLOTS[i][0], SLOTS[i][1], slotYaw(i)); });
    pp.mood('t_tolik', 'angry');
    View.cam('title', .01);
    const lines = [['t_dasha', 'Даша', 'Он вообще откроется? У меня утренний влог горит!'], ['t_tolik', 'Толик', 'Шесть ноль две. Где кофе?']];
    let li = 0;
    const show = () => {
      if (S.phase !== 'title') return;
      const [id, name, text] = li < lines.length ? lines[li] : pick([['t_mihalych', 'Михалыч', pick(['Буся, сидеть. Сейчас откроют.', 'В наше время киоски в пять открывались.', 'Сынок! Открывай, замёрзнем!'])], ['t_lena', 'Лена', pick(['Я с суток. Если он не откроет, я усну прямо здесь.', 'Кофе. Мне. Нужен. Кофе.'])], ['t_dasha', 'Даша', pick(['Снежок — это такая эстетика!', 'Сейчас сниму киоск для сторис.'])], ['t_tolik', 'Толик', pick(['Эй! Там кто есть?', 'Ну ёлки…'])]]);
      li++;
      Bub.say(id, () => pp.headPos(id), name, text, { small: li > 2 });
      pp.talk(id, true); setTimeout(() => pp.talk(id, false), 1600);
      if (!AI.shot) setTimeout(() => { if (S.phase === 'title') Bub.remove(id); }, 5200);
    };
    show(); setTimeout(show, AI.shot ? 30 : 2600);
    if (!AI.shot) S.titleTimer = setInterval(show, 4300);
  }

  // Нейросеть отвалилась посреди смены (нет сети, ключ не подошёл, кончились деньги) —
  // честно переходим на заготовки и показываем метку демо-режима
  Talk.onFail = (msg, e) => {
    const hard = e && ['auth', 'credits', 'nokey'].includes(e.kind);
    if (AI.demo || !(hard || Talk.failures >= 2)) return;
    AI.demo = true;
    $('demoTag').classList.remove('hide'); document.body.classList.add('demo');
    toast('sys', 'Нейросеть недоступна', typo((e && e.ru ? e.ru + '. ' : '') + 'Дальше клиенты говорят заготовками.'), 6000);
  };

  $('bHow').onclick = () => $('how').classList.toggle('hide');
  $('bStart').onclick = startShift;
  $('bSound').onclick = () => { Sound.start(); const on = Sound.toggle(); $('bSound').setAttribute('aria-pressed', on ? 'true' : 'false'); };

  async function startShift() {
    if (S.phase !== 'title') return;
    Sound.start(); Sound.click();
    S.phase = 'starting';
    const ok = await AI.ensureKey();
    if (!ok) AI.demo = true;
    $('demoTag').classList.toggle('hide', !AI.demo);
    document.body.classList.toggle('demo', !!AI.demo);
    clearInterval(S.titleTimer);
    Bub.clear();
    $('title').classList.add('gone');
    setTimeout(() => $('title').classList.add('hide'), 900);
    // титульные люди становятся первыми клиентами
    buildSchedule();
    View.people.visible('barista', false);
    View.cam('fp', 1.8);
    setTimeout(() => {
      ['hud', 'ticket', 'meters', 'dock'].forEach((id) => $(id).classList.remove('hide'));
      if (innerWidth < 760) $('ticket').classList.add('folded');
      S.phase = 'play';
      S.dayBlend = { from: View.dayT, t0: performance.now() };
      toast('sys', 'Смена началась', typo('6:00. Окошко открыто. Чек слева подскажет шаги, «Далее» — следующий шаг. Всё можно испортить, в том числе нарочно.'), 7000);
      renderTicket(); updateHud(true);
    }, 1500);
    // утро района: у каждого своя история (параллельно)
    Talk.dayNotes(S.all.concat(S.schedule.map((e) => e.c)), S.shopperId).then((n) => { S.dayNotes = n || {}; for (const c of S.all.concat(S.schedule.map((e) => e.c))) if (S.dayNotes[c.id]) c.dayNote = S.dayNotes[c.id]; });
  }

  // ================================================================
  // Клиенты: расписание и заказы
  // ================================================================
  function makeCustomer(arch) {
    const oi = Math.floor(rnd() * arch.orders.length);
    const [drink, size0, mods] = arch.orders[oi];
    const M = D.MENU[drink], sizes = Object.keys(M.sizes);
    const size = sizes.includes(size0) ? size0 : sizes[Math.min(1, sizes.length - 1)];
    const order = { drink, size, milk: mods.milk || M.milk || null, syrup: mods.syrup || M.syrup || null, sugar: mods.sugar || 0, cinnamon: !!mods.cinnamon };
    const price = M.sizes[size] + (order.milk === 'oat' ? 40 : 0) + (mods.syrup && drink !== 'raf' ? 30 : 0);
    const steps = M.base.slice();
    if ((order.sugar || (order.syrup && drink !== 'raf') || order.cinnamon) && !steps.includes('extras')) steps.splice(steps.indexOf('lid'), 0, 'extras');
    const patMax = arch.patience * (1.3 + rnd() * .4);   // терпение в игровых минутах
    return { id: 'c' + S.nextId++, oi, orderRu: orderText(order, false), arch, name: arch.name, cupName: arch.name.split(' ')[0], order, price, steps, st: {}, patMax, pat: patMax, seen: [], arrivedAt: 0, secret: false, remade: 0, dayNote: '', pitch: arch.pitch || 1, state: 'new' };
  }
  function orderText(o, forPrompt) {
    const M = D.MENU[o.drink];
    const parts = [M.acc + (Object.keys(M.sizes).length > 1 ? ' ' + D.SIZE_RU[o.size] : '')];
    if (o.milk && o.milk !== (M.milk || null)) parts.push(o.milk === 'oat' ? 'на овсяном молоке' : 'на ' + D.MILKS[o.milk].short);
    if (o.syrup && o.drink !== 'raf') parts.push('с сиропом «' + D.SYRUPS[o.syrup].ru + '»');
    if (o.sugar) parts.push(o.sugar + ' ' + plural(o.sugar, 'ложка', 'ложки', 'ложек') + ' сахара');
    if (o.cinnamon) parts.push('с корицей');
    if (!o.sugar && forPrompt && (o.drink === 'americano' || o.drink === 'cappuccino' || o.drink === 'latte')) parts.push('без сахара');
    return parts.join(', ');
  }
  function buildSchedule() {
    const pool = D.CAST.filter((a) => !TITLE_PEOPLE.includes(a.id));
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    // первые трое уже стоят у киоска
    TITLE_PEOPLE.slice(0, 3).forEach((id, i) => {
      const c = makeCustomer(archById(id));
      c.arrivedAt = START - 4 + i; c.state = 'queue'; c.pid = 't_' + id;
      S.all.push(c); S.queue.push(c);
    });
    View.people.remove('t_lena');
    const lena = makeCustomer(archById('lena'));
    let t = START + 22;
    const list = [lena, ...pool.map(makeCustomer)];
    list.forEach((c, i) => {
      S.schedule.push({ t, c });
      t += t < 7 * 60 ? 13 + rnd() * 6 : t < 8 * 60 + 30 ? 5 + rnd() * 5 : 12 + rnd() * 6;
    });
    // тайный покупатель — один из «подходящих», не из первых двух
    const cands = S.schedule.filter((e) => e.c.arch.shopperOk && e.t < END - 30).map((e) => e.c);
    const sh = cands.length ? pick(cands.slice(0, Math.max(3, cands.length - 2))) : null;
    if (sh) { sh.secret = true; S.shopperId = sh.id; }
    S.queue.forEach((c, i) => { View.people.place(c.pid, SLOTS[i][0], SLOTS[i][1], slotYaw(i)); });
    setTimeout(callNext, 2200);
  }

  function spawnCustomer(c) {
    c.pid = c.id; c.arrivedAt = S.min; c.state = 'walking';
    const fromLeft = rnd() < .6;
    View.people.spawn(c.pid, c.arch.looks, fromLeft ? -17 : 17, 4.6 + rnd() * .8, 0);
    S.all.push(c); S.queue.push(c);
    layoutQueue();
    if (S.queue.length >= 4 && rnd() < .5) logEvent(`очередь уже ${S.queue.length} ${plural(S.queue.length, 'человек', 'человека', 'человек')}`, 'queue', true);
  }
  function layoutQueue() {
    S.queue.forEach((c, i) => {
      const k = Math.min(i + 1, SLOTS.length - 1);
      const [x, z] = SLOTS[k];
      c.slot = k;
      View.people.walkTo(c.pid, x, z, () => { View.people.face(c.pid, slotYaw(k)); if (c.state === 'walking') c.state = 'queue'; });
    });
  }

  // ================================================================
  // Окошко: следующий клиент
  // ================================================================
  function callNext() {
    if (S.phase !== 'play' || S.win || S.ending) return;
    if (S.closing) { maybeFinale(); return; }
    const c = S.queue.shift(); if (!c) return;
    S.win = c; c.state = 'toWindow'; c.waitStart = c.arrivedAt;
    S.flow = 'arriving';
    layoutQueue();
    View.people.walkTo(c.pid, SLOTS[0][0], SLOTS[0][1], () => {
      View.people.face(c.pid, Math.PI);
      startOrder(c);
    });
  }

  function baristaLook() {
    const a = [];
    const h = effHands();
    a.push(S.drunk > .9 ? 'мятый, глаза стеклянные' : 'помятый, красные глаза, явно с похмелья');
    if (h > 55) a.push('руки заметно трясутся'); else if (h > 30) a.push('руки слегка подрагивают');
    if (S.drunk > .25) a.push(S.drunk > 1.2 ? 'сильно пахнет пивом, икает, язык заплетается' : 'пахнет пивом');
    else a.push('пахнет вчерашним перегаром');
    if (S.min - S.lastSmokeEnd < 20) a.push('пахнет табаком');
    if (S.nerves > 70) a.push('дёрганый, на взводе');
    return a.join(', ');
  }

  async function startOrder(c) {
    if (S.win !== c) return;
    c.state = 'ordering'; S.flow = 'prep'; c.talking = true;
    c.orderAt = S.min;
    // молотый заранее кофе остаётся в холдере — можно молоть, пока клиент идёт к окошку
    S.cup = null; S.pitcher = null;
    View.props.dropCup(); View.props.pitcherHome(); View.props.carton(null); View.props.pitcherMilk(null);
    if (S.pf.grams >= 1 && c.steps.includes('grind')) {
      c.st.grind = S.pf.grams >= 16 && S.pf.grams <= 20 ? 'done' : 'bad';
      if (S.pf.tamp != null && c.steps.includes('tamp')) c.st.tamp = S.pf.tamp > .4 ? 'done' : 'bad';
    }
    renderTicket(true);
    Sound.paper();
    const ctx = { time: hhmm(S.min), waited: Math.round(S.min - c.arrivedAt), seen: c.seen.slice(-4).join('; '), look: baristaLook(), orderText: orderText(c.order, true) };
    Bub.thinking(c.pid, () => View.people.headPos(c.pid), c.name);
    View.people.talk(c.pid, true);
    c.orderPromise = Talk.order(c, ctx, (t) => { Bub.say(c.pid, () => View.people.headPos(c.pid), c.name, t); Sound.blip(c.pitch); });
    await c.orderPromise;
    View.people.talk(c.pid, false);
    c.talking = false;
    if (S.win === c) setTimeout(() => { if (S.win === c && S.flow === 'prep') Bub.fade(c.pid); }, 9000);
  }

  // ================================================================
  // Стакан: скрытая правда
  // ================================================================
  function newCup(size) {
    S.cup = { size, cracked: false, dropped: false, finger: false, shot: null, water: 0, milk: null, art: null, syr: {}, sugar: 0, salt: 0, cinnamon: 0, teabag: false, beer: 0, ash: false, tap: 0, old: false, name: '', lid: false, lidOk: true, level: 0, vols: [], madeAt: S.min };
    View.props.newCup(size);
    return S.cup;
  }
  // объём добавки: доля стакана, цвет (линейный rgb), температура
  const COL = { esp: [.23, .12, .06], old: [.2, .12, .07], water: [.75, .8, .82], milk: [.93, .9, .84], oat: [.9, .84, .7], kefir: [.94, .94, .91], cream: [.96, .93, .82], tea: [.45, .2, .08], beer: [.85, .6, .2], tap: [.7, .74, .76] };
  function addVol(kind, frac, temp) {
    const c = S.cup; if (!c) return;
    c.vols.push({ kind, frac, temp, at: S.min });
    c.level = Math.min(1.12, c.level + frac);
    View.props.cupLevel(c.level, cupColor());
  }
  function cupColor() {
    const c = S.cup; let r = 0, g = 0, b = 0, w = 0;
    for (const v of c.vols) {
      let col = COL[v.kind] || COL.water;
      if (v.kind === 'water' && c.vols.some((x) => x.kind === 'esp' || x.kind === 'old')) col = [.3, .17, .09];
      if (v.kind === 'water' && c.teabag) col = COL.tea;
      const k = v.kind === 'esp' || v.kind === 'old' ? v.frac * 3 : v.frac; r += col[0] * k; g += col[1] * k; b += col[2] * k; w += k;
    }
    if (!w) return 0x3b2314;
    const to = (x) => Math.round(Math.pow(clamp(x / w, 0, 1), 1 / 2.2) * 255);
    return (to(r) << 16) | (to(g) << 8) | to(b);
  }
  function cupTemp() {
    const c = S.cup; let t = 0, w = 0, last = c.madeAt;
    for (const v of c.vols) { t += v.temp * v.frac; w += v.frac; last = Math.max(last, v.at); }
    if (!w) return 20;
    const mins = Math.max(0, S.min - last);
    return 20 + (t / w - 20) * Math.exp(-mins / (c.lid ? 38 : 22));
  }

  // ---------- оценка напитка: качество и правдивое описание ----------
  function evaluate(c) {
    const cup = S.cup, o = c.order, M = D.MENU[o.drink];
    const notes = [], flags = [];
    let q = 10;
    const coffee = o.drink !== 'tea';
    if (!cup || cup.level < .08) return { q: 0, flags: ['empty'], truth: 'Стакан ПУСТОЙ. В нём ничего нет.', notes: ['пустой стакан'], cupName: '', std: 'нет' };
    notes.push(`Стакан ${D.SIZE_RU[cup.size]} (${cup.size})${cup.size !== o.size ? ` — а просил ${D.SIZE_RU[o.size]}` : ''}.`);
    if (cup.size !== o.size) { q -= 1; flags.push('wrongSize'); }
    if (cup.cracked) { q -= 2; flags.push('cracked'); notes.push('Стакан треснул сбоку, горячее подтекает на руку.'); }
    // кофе
    const sh = cup.shot;
    if (coffee) {
      if (cup.old) { q -= 4; flags.push('old'); notes.push('Вместо свежего эспрессо — вчерашний кофе из термоса: кислый, с металлическим привкусом.'); }
      if (!sh && !cup.old) { q -= 7; flags.push('noCoffee'); notes.push('Кофе в стакане НЕТ вообще.'); }
      else if (sh) {
        if (sh.blank) { q -= 6; flags.push('noCoffee'); notes.push('Вместо эспрессо через пустой холдер пролита горячая вода — кофе не пахнет вообще.'); }
        else {
          const g = sh.grams, t = sh.sec, tp = sh.tamp;
          let d = [];
          if (g < 13) { q -= 2; d.push('водянистый, пустой вкус'); flags.push('sour'); } else if (g < 15.5) { q -= 1; d.push('жидковат'); } else if (g > 22) { q -= 2; d.push('слишком крепкий и горький, гуща скрипит на зубах'); flags.push('bitter'); } else if (g > 20.5) { q -= .8; d.push('крепковат'); }
          if (tp == null) { q -= 2; d.push('не утрамбован — кислый, водянистый'); flags.push('sour'); } else if (tp < .4) { q -= 1.5; d.push('кривой темпер — кисловатый'); }
          if (t < 18) { q -= 2; d.push('недоэкстрагирован — кислый'); flags.push('sour'); } else if (t < 22) { q -= .8; d.push('чуть кисловат'); } else if (t > 38) { q -= 2.5; d.push('пережжён — горький, как беда'); flags.push('bitter'); } else if (t > 33) { q -= 1; d.push('горчит'); }
          notes.push(`Эспрессо: ${fmt1(g)} г кофе, пролив ${Math.round(t)} с${d.length ? ' — ' + d.join(', ') : ' — сбалансированный, как надо'}.`);
        }
      }
    }
    if (o.drink === 'tea') {
      if (!cup.teabag) { q -= 6; flags.push('noCoffee'); notes.push('Пакетика нет — это просто кипяток.'); } else notes.push('Чай: пакетик на месте.');
      if (sh && !sh.blank) { q -= 3; notes.push('Зачем-то добавлен эспрессо — чай с кофе.'); }
    }
    // вода
    const water = cup.vols.filter((v) => v.kind === 'water').reduce((a, v) => a + v.frac, 0);
    if (o.drink === 'americano' || o.drink === 'tea') {
      if (water < .3) { q -= 3; notes.push(o.drink === 'tea' ? 'Воды почти нет.' : 'Воды не долили — это эспрессо в большом стакане.'); }
      else if (cup.level < .75) { q -= 1; notes.push('Налито на две трети — недолив.'); }
    }
    if (cup.level > 1.04) { q -= 1.5; flags.push('overflow'); notes.push('Перелито через край: стакан мокрый и липкий.'); }
    // молоко
    const mk = cup.milk;
    if (o.milk) {
      if (!mk) { q -= 4; notes.push('Молока нет вообще.'); }
    }
    if (mk) {
      const want = o.milk;
      if (mk.kind === 'kefir') { q -= 6; flags.push('kefir'); notes.push('Вместо молока — КЕФИР: кислый, от горячего свернулся хлопьями, пахнет молочной кухней.'); }
      else if (want && mk.kind !== want) {
        if (want === 'oat' && mk.kind !== 'oat') { q -= 3; flags.push('wrongMilk'); notes.push(`Просил овсяное — налито ${D.MILKS[mk.kind].short}.`); }
        else if (want === 'cream' && mk.kind !== 'cream') { q -= 1.5; notes.push(`Раф делают на сливках, а тут ${D.MILKS[mk.kind].short}.`); }
        else { q -= 1; flags.push('wrongMilk'); notes.push(`Молоко не то: ${D.MILKS[mk.kind].short} вместо обычного.`); }
      } else if (!want) { q -= 1; notes.push(`Зачем-то добавлено ${D.MILKS[mk.kind].short}.`); }
      else notes.push(`Молоко: ${D.MILKS[mk.kind].short}.`);
      if (!mk.steamed) { q -= 3; flags.push('cold'); notes.push('Молоко не взбито и не нагрето — холодное из холодильника, пены нет.'); }
      else if (mk.temp < 45) { q -= 2; flags.push('cold'); notes.push(`Молоко едва тёплое (${Math.round(mk.temp)} °C).`); }
      else if (mk.temp > 76) { q -= 3; flags.push('burnt'); notes.push(`Молоко перегрето до ${Math.round(mk.temp)} °C — пригорело, пахнет варёным.`); }
      else if (mk.temp > 69) { q -= .8; notes.push('Молоко горячевато.'); }
    }
    // рисунок
    if (cup.art) {
      const a = cup.art;
      if (a.pattern === 'kukish') { flags.push('kukish'); q -= 1; notes.push('На пенке бариста НАРОЧНО нарисовал кукиш (фигу из трёх пальцев).'); }
      else if (a.pattern !== 'none') {
        const nm = { heart: 'сердечко', tulip: 'тюльпан', rosetta: 'розетта' }[a.pattern];
        if (a.q > .72) { q += .5; flags.push('heart'); notes.push(`На пенке — аккуратное ${nm}.`); }
        else if (a.q > .45) notes.push(`На пенке — кривоватое ${nm}.`);
        else notes.push(`Задумывалось ${nm}, а на пенке бесформенная клякса, похожая на картошку.`);
      }
    }
    // добавки
    const sugarWant = o.sugar || 0;
    if (cup.salt > 0) { q -= 6; flags.push('salt'); notes.push(`Вместо сахара — СОЛЬ (${cup.salt} ${plural(cup.salt, 'ложка', 'ложки', 'ложек')}): кофе солёный.`); }
    if (cup.sugar !== sugarWant) {
      if (cup.sugar >= sugarWant + 3) { q -= 2; flags.push('sweet'); notes.push(`Сахара ${cup.sugar} ${plural(cup.sugar, 'ложка', 'ложки', 'ложек')} — приторно.`); }
      else if (Math.abs(cup.sugar - sugarWant) >= 2 || (sugarWant && !cup.sugar)) { q -= 1; notes.push(`Сахара ${cup.sugar || 'нет'}${cup.sugar ? ' ' + plural(cup.sugar, 'ложка', 'ложки', 'ложек') : ''}, а просил ${sugarWant || 'без сахара'}.`); }
    } else if (sugarWant) notes.push(`Сахар: ${sugarWant} — как просил.`);
    const syrN = Object.values(cup.syr).reduce((a, b) => a + b, 0);
    if (o.syrup) {
      if (!cup.syr[o.syrup]) { q -= 1.5; notes.push(`Сиропа «${D.SYRUPS[o.syrup].ru}» нет.`); }
    }
    for (const k in cup.syr) if (k !== o.syrup) { q -= 1; notes.push(`Добавлен сироп «${D.SYRUPS[k].ru}», которого не просили.`); }
    if (syrN >= 3) { q -= 1.5; flags.push('sweet'); notes.push('Сиропа перебор — приторно.'); }
    if (cup.cinnamon && !o.cinnamon) { q -= .5; notes.push('Посыпано корицей, хотя не просили.'); }
    if (o.cinnamon && !cup.cinnamon) { q -= .5; notes.push('Корицы нет.'); }
    // пакости
    if (cup.beer) { q -= 4; flags.push('beer'); notes.push('В стакан плеснули ПИВА: пивной привкус и запах.'); }
    if (cup.ash) { q -= 5; flags.push('ash'); notes.push('На поверхности плавает сигаретный пепел.'); }
    if (cup.tap) { q -= 2; flags.push('tap'); notes.push('Долита холодная вода из-под крана — привкус труб.'); }
    if (cup.finger) { q -= 1.5; flags.push('finger'); notes.push('Бариста у тебя на глазах помешал напиток пальцем.'); }
    if (cup.dropped) { q -= 2; flags.push('dropped'); notes.push('Бариста у тебя на глазах уронил стакан на пол, поднял и продолжил.'); }
    // надпись
    let std = [];
    if (!cup.name) { q -= .5; notes.push('Имени на стакане нет.'); std.push('нет имени'); }
    else {
      const nm = c.cupName.toLowerCase(), wr = cup.name.toLowerCase();
      if (wr === nm) notes.push(`На стакане маркером: «${cup.name}» — верно.`);
      else if (lev(wr, nm) <= Math.max(2, nm.length / 3)) { q -= .5; flags.push('misspelled'); notes.push(`На стакане маркером: «${cup.name}» — имя написано с ошибками.`); }
      else { flags.push('rudeName'); notes.push(`На стакане маркером вместо имени написано: «${cup.name}».`); }
    }
    // крышка
    if (!cup.lid) { q -= 1; flags.push('noLid'); notes.push('Крышки нет.'); std.push('без крышки'); }
    else if (!cup.lidOk) { q -= 1.5; flags.push('noLid'); notes.push('Крышка не защёлкнулась — плеснуло на рукав.'); }
    const temp = cupTemp();
    if (temp < 50 && !flags.includes('cold')) { q -= 2; flags.push('cold'); }
    notes.push(`Температура сейчас ${Math.round(temp)} °C${temp < 50 ? ' — остыло' : temp > 82 ? ' — обжигающе' : ''}.`);
    q = clamp(q, 0, 10);
    const wait = Math.round(S.min - c.arrivedAt);
    if (wait > 8) std.push(`ожидание ${wait} мин`);
    return { q: Math.round(q * 10) / 10, flags, notes, truth: '— ' + notes.join('\n— '), cupName: cup.name, std: std.length ? 'с нарушениями: ' + std.join(', ') : 'полностью', wait, baristaSmell: S.drunk > .25 };
  }
  function lev(a, b) {
    const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, (_, i) => [i]);
    for (let j = 1; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
  }

  // ---------- пьяные искажения ----------
  function scramble(word, p) {
    if (p < 1 || word.length < 4) return word;
    const a = word.split(''); const n = Math.floor((p - .8) * 2) + 1;
    for (let k = 0; k < n; k++) { const i = 1 + Math.floor(rnd() * (a.length - 2)); if (i + 1 < a.length) [a[i], a[i + 1]] = [a[i + 1], a[i]]; }
    return a.join('');
  }
  function scrawl(text, p) { // пишет маркером
    if (p < .5) return text;
    return text.split(' ').map((w) => (rnd() < p * .5 ? scramble(w, 1.2) : w)).join(' ');
  }
  function slur(text, p) { // говорит
    if (p < .4) return text;
    let out = text.split(' ').map((w) => (rnd() < p * .25 && w.length > 3 ? scramble(w, 1.1) : w)).join(' ');
    if (p > .9) out = out.replace(/([аеиоуыяюё])/i, '$1$1');
    if (p > .7 && rnd() < .7) { const ws = out.split(' '); ws.splice(1 + Math.floor(rnd() * Math.max(1, ws.length - 1)), 0, '…ик…'); out = ws.join(' '); }
    return out;
  }

  // ================================================================
  // Чек и шаги
  // ================================================================
  function stepHint(c, s) {
    const o = c.order;
    if (s === 'cup') return o.size;
    if (s === 'milk') return o.milk ? D.MILKS[o.milk].short : '';
    if (s === 'name') return '«' + c.cupName + '»';
    if (s === 'extras') { const a = []; if (o.syrup) a.push(D.SYRUPS[o.syrup].ru.toLowerCase()); if (o.sugar) a.push('сахар ×' + o.sugar); if (o.cinnamon) a.push('корица'); return a.join(', '); }
    if (s === 'grind') return '16–20 г';
    if (s === 'pull') return '24–32 с';
    if (s === 'steam') return '55–68°';
    return '';
  }
  function renderTicket(print) {
    const c = S.win;
    const T = $('ticket');
    if (!c || !['prep', 'serving', 'react', 'reply', 'final', 'arriving'].includes(S.flow) || c.state === 'toWindow') {
      $('tkWho').textContent = S.win ? 'идёт к окошку…' : S.queue.length ? 'ждём клиента' : 'никого';
      $('tkDrink').textContent = '—'; $('tkMods').innerHTML = ''; $('tkSteps').innerHTML = ''; $('tkCup').textContent = ''; $('tkPrice').textContent = rub(0);
      $('tkStamp').classList.add('hide');
      updateNext(); return;
    }
    const o = c.order, M = D.MENU[o.drink];
    $('tkNo').textContent = '№' + NB + (S.all.indexOf(c) + 1);
    $('tkWho').textContent = c.name + ', ' + hhmm(c.orderAt || S.min);
    $('tkDrink').textContent = M.ru + (Object.keys(M.sizes).length > 1 ? ' · ' + o.size : '');
    const mods = [];
    if (o.milk && o.milk !== M.milk) mods.push('на ' + (o.milk === 'oat' ? 'овсяном' : D.MILKS[o.milk].short));
    if (o.syrup && o.drink !== 'raf') mods.push('сироп: ' + D.SYRUPS[o.syrup].ru.toLowerCase());
    if (o.sugar) mods.push('сахар ×' + o.sugar);
    if (o.cinnamon) mods.push('корица');
    if (o.drink === 'raf') mods.push('сливки + ваниль');
    $('tkMods').innerHTML = mods.map((m) => `<span>${esc(m)}</span>`).join('');
    const next = nextStep();
    $('tkSteps').innerHTML = c.steps.map((s) => {
      const stt = c.st[s];
      const cls = stt === 'done' ? 'done' : stt === 'bad' ? 'bad' : s === next ? 'now' : '';
      return `<li><button class="${cls}" data-step="${s}"><i></i>${D.STEP_RU[s]}<small>${esc(stepHint(c, s))}</small></button></li>`;
    }).join('');
    $('tkPrice').textContent = rub(c.price);
    $('tkStamp').classList.toggle('hide', !c.remade);
    $('tkCup').textContent = S.cup ? cupSummary() : '';
    if (print) { T.classList.remove('print'); void T.offsetWidth; T.classList.add('print'); }
    updateNext();
  }
  $('tkSteps').addEventListener('click', (e) => { const b = e.target.closest('button[data-step]'); if (b) openStep(b.dataset.step); });
  $('bFold').onclick = () => $('ticket').classList.toggle('folded');
  function cupSummary() {
    const c = S.cup, a = [];
    a.push('в стакане: ');
    const parts = [];
    if (c.shot) parts.push(c.shot.blank ? 'вода через пустой холдер' : 'эспрессо');
    if (c.old) parts.push('вчерашний кофе');
    if (c.vols.some((v) => v.kind === 'water')) parts.push('кипяток');
    if (c.teabag) parts.push('пакетик');
    if (c.milk) parts.push(D.MILKS[c.milk.kind].short + (c.milk.steamed ? '' : ' холодное'));
    for (const k in c.syr) parts.push(D.SYRUPS[k].ru.toLowerCase() + ' ×' + c.syr[k]);
    if (c.sugar) parts.push('сахар ×' + c.sugar);
    if (c.salt) parts.push('соль ×' + c.salt);
    if (c.cinnamon) parts.push('корица');
    if (c.beer) parts.push('пиво');
    if (c.ash) parts.push('пепел');
    if (c.tap) parts.push('вода из-под крана');
    return a.join('') + (parts.join(', ') || 'пусто');
  }
  function nextStep() {
    const c = S.win; if (!c) return null;
    return c.steps.find((s) => !c.st[s]) || null;
  }
  function updateNext() {
    const n = S.win && S.flow === 'prep' ? nextStep() : null;
    $('bNextL').textContent = n ? D.STEP_RU[n] : S.flow === 'prep' ? 'Выдать' : '—';
    $('bNext').disabled = !(S.flow === 'prep' && S.win);
    $('bServe').classList.toggle('glow', S.flow === 'prep' && !n && !!S.cup);
  }
  function markStep(s, ok) {
    const c = S.win; if (!c || !c.steps.includes(s)) return;
    c.st[s] = ok ? 'done' : 'bad';
    renderTicket();
  }
  $('bNext').onclick = () => { Sound.click(); const n = nextStep(); if (n) openStep(n); else serve(); };

  // ================================================================
  // Станция: мини-игры
  // ================================================================
  function station(title, hint, html) {
    $('station').classList.remove('hide');
    $('stTitle').innerHTML = `<span>${esc(title)}</span><b>${hint ? typo(hint) : ''}</b>`;
    $('stBody').innerHTML = html;
    $('impro').classList.add('hide');
  }
  function closeStation(delay = 0) {
    const f = () => { $('station').classList.add('hide'); S.mini = null; S.openStep = null; if (View.camName() !== 'fp' && S.phase === 'play' && !S.smoking) View.cam('fp', .9); };
    if (delay) setTimeout(() => { if (S.mini && S.mini.closing) f(); }, delay); else f();
    if (S.mini) S.mini.closing = true;
  }
  function verdict(text, cls) { const v = $('vd'); if (v) { v.className = 'verdict ' + (cls || ''); v.innerHTML = typo(text); } }
  function holdButton(el, onDown, onUp) {
    const down = (e) => { e.preventDefault(); if (el.disabled) return; el.classList.add('held'); onDown(); };
    const up = () => { if (!el.classList.contains('held')) return; el.classList.remove('held'); onUp(); };
    el.addEventListener('pointerdown', down); el.addEventListener('pointerup', up); el.addEventListener('pointerleave', up); el.addEventListener('pointercancel', up);
    S.mini.keyDown = () => { if (!el.classList.contains('held') && !el.disabled) { el.classList.add('held'); onDown(); } };
    S.mini.keyUp = up;
  }
  function needWin() { if (!S.win || S.flow !== 'prep') { toast('sys', 'Некому готовить', typo('У окошка никого. Жди клиента — или сходи покурить.')); return false; } return true; }
  function needCup() { if (!S.cup) { toast('sys', 'Нет стакана', typo('Сначала возьми стакан.')); openStep('cup'); return false; } return true; }

  function openStep(s) {
    if (S.smoking || S.phase !== 'play') return;
    if (s !== 'cup' && s !== 'grind' && s !== 'tamp' && !needWin()) return;
    if (S.mini && S.mini.busy) return;
    S.openStep = s; S.mini = { t: 0 };
    ({ cup: stepCup, name: stepName, grind: stepGrind, tamp: stepTamp, pull: stepPull, water: stepWater, milk: stepMilk, steam: stepSteam, pour: stepPour, extras: stepExtras, teabag: stepTeabag, lid: stepLid }[s] || (() => {}))();
  }

  // ---------- стакан ----------
  function stepCup() {
    if (!needWin()) return;
    const want = S.win.order.size;
    const sizes = Object.keys(D.MENU[S.win.order.drink].sizes);
    station('Стакан', 'Размер из чека: ' + want, `<div class="chooser">${['S', 'M', 'L'].map((z) => `<button class="sb ${z === want ? 'sb--hint' : ''}" data-z="${z}">${z}<small>${D.SIZE_RU[z]} · ${D.CUP_ML[z]}${NB}мл</small></button>`).join('')}</div><div class="verdict" id="vd">${typo(sizes.length === 1 ? 'Эспрессо — в маленький.' : 'Бери тот, что в чеке.')}</div>`);
    $('stBody').querySelectorAll('[data-z]').forEach((b) => b.onclick = () => takeCup(b.dataset.z));
  }
  function takeCup(z) {
    Sound.click();
    const crush = rnd() < effHands() / 100 * .22;
    newCup(z);
    if (crush) {
      S.cup.cracked = true; View.props.cupCrack(true); View.shake(.3); Sound.drop();
      $('stBody').innerHTML = `<div class="verdict bad">${typo('Руки дрогнули — стакан смялся и треснул сбоку.')}</div><div class="row"><button class="sb sb--main" id="cOther">Взять другой</button><button class="sb" id="cKeep">Сойдёт</button></div>`;
      $('cOther').onclick = () => { S.writeoff += 10; takeCup(z); };
      $('cKeep').onclick = () => { markStep('cup', false); closeStation(); renderTicket(); };
      return;
    }
    markStep('cup', z === S.win.order.size);
    renderTicket();
    closeStation();
  }

  // ---------- имя маркером ----------
  function stepName() {
    if (!needCup()) return;
    const c = S.win;
    const pre = S.drunk >= .6 ? scrawl(c.cupName, S.drunk) : c.cupName;
    station('Имя на стакане', 'стандарт сети — имя клиента', `<div class="row"><input class="name-in" id="nameIn" maxlength="18" value="${esc(pre)}" aria-label="Надпись на стакане"><button class="sb sb--main" id="nameGo">Написать</button></div><div class="verdict" id="vd">${typo(brave() ? 'Можно написать что угодно. Клиент прочитает.' : 'Клиент назвался: «' + c.cupName + '». Можно и не имя — клиент прочитает.')}</div>`);
    const go = () => {
      let t = $('nameIn').value.trim().slice(0, 18);
      if (!t) return;
      t = scrawl(t, S.drunk);
      S.cup.name = t; View.props.cupText(t, S.drunk > .6 ? (rnd() - .5) * .3 : 0); Sound.marker();
      markStep('name', t.toLowerCase() === c.cupName.toLowerCase());
      verdict('На стакане: «' + esc(t) + '»', t.toLowerCase() === c.cupName.toLowerCase() ? 'good' : 'bad');
      S.mini.busy = true; setTimeout(() => { S.mini && (S.mini.busy = false); closeStation(); }, 700);
    };
    $('nameGo').onclick = go;
    $('nameIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } e.stopPropagation(); });
    setTimeout(() => { const i = $('nameIn'); if (i) { i.focus(); i.select(); } }, 50);
  }

  // ---------- помол ----------
  // Все мини-игры считают по часам, а не по кадрам: результат не зависит от частоты кадров.
  const now = () => performance.now() / 1000;
  function gauge(max, lo, hi, badFrom) {
    return `<div class="gauge"><div class="gauge__zone" style="left:${lo / max * 100}%;width:${(hi - lo) / max * 100}%"></div>${badFrom ? `<div class="gauge__bad" style="left:${badFrom / max * 100}%"></div>` : ''}<div class="gauge__fill" id="gf"></div><div class="gauge__needle" id="gn"></div><div class="gauge__lbl"><span>0</span><span>${max}</span></div></div>`;
  }
  function needle(v, max) { const n = $('gn'), f = $('gf'); if (n) n.style.left = (clamp(v, 0, max) / max * 100) + '%'; if (f) f.style.width = (clamp(v, 0, max) / max * 100) + '%'; }
  function stepGrind() {
    View.cam('grinder', .7);
    station('Помол', 'цель 16–20 г · держи кнопку или пробел', gauge(30, 16, 20, 24) + `<div class="row"><button class="sb sb--main sb--wide" id="hold">Держать — молоть</button><div class="readout" id="rd">${fmt1(S.pf.grams)}<small>г</small></div></div><div class="verdict" id="vd">${typo(effHands() > 40 ? 'Руки трясутся — стрелка тоже. Отпусти в зелёной зоне.' : 'Отпусти в зелёной зоне.')}</div>`);
    const m = S.mini; let hold = false, h0 = 0; const g0 = S.pf.grams;
    const raw = () => (hold ? Math.min(30, g0 + (now() - h0) * 7.2) : g0);
    const shown = () => { const t = now(), j = effHands() / 100 * 2.8 * (Math.sin(t * 19) * .6 + Math.sin(t * 31 + 1) * .4); return clamp(raw() + (hold ? j : 0), 0, 30); };
    const fin = () => {
      const g = shown();
      hold = false; Sound.grind(false); View.props.grind(false, g);
      S.pf.grams = g;
      const ok = g >= 16 && g <= 20;
      needle(g, 30); $('rd').innerHTML = fmt1(g) + '<small>г</small>';
      verdict(ok ? `${fmt1(g)} г — в самый раз.` : g < 16 ? `${fmt1(g)} г — маловато, будет водянисто.` : g > 24 ? `${fmt1(g)} г — через край, половина на прилавке.` : `${fmt1(g)} г — многовато, будет горчить.`, ok ? 'good' : 'bad');
      markStep('grind', ok); m.busy = true;
      setTimeout(() => { m.busy = false; closeStation(); }, 800);
    };
    holdButton($('hold'), () => { if (m.busy) return; hold = true; h0 = now(); Sound.grind(true); }, () => { if (hold) fin(); });
    m.update = () => {
      if (hold && raw() >= 30) { fin(); return; }
      const g = shown();
      needle(g, 30); $('rd').innerHTML = fmt1(g) + '<small>г</small>';
      if (hold) View.props.grind(true, raw());
    };
  }

  // ---------- темпер ----------
  function stepTamp() {
    if (S.pf.grams < 1) {
      station('Темпер', '', `<div class="verdict bad">${typo('В холдере пусто — сначала помол.')}</div><div class="row"><button class="sb sb--main" id="goG">К помолу</button><button class="sb" id="skipT">Всё равно прижать</button></div>`);
      $('goG').onclick = () => openStep('grind');
      $('skipT').onclick = () => { S.pf.tamp = 1; View.props.tamp(0); Sound.tamp(); markStep('tamp', false); closeStation(); };
      return;
    }
    View.cam('grinder', .7);
    station('Темпер', 'прижми, когда пузырёк в центре', `<div class="row" style="gap:18px"><div class="level"><div class="level__b" id="lb"></div></div><div style="flex:1;display:flex;flex-direction:column;gap:10px"><button class="sb sb--main" id="tampGo">Прижать</button><div class="verdict" id="vd">${typo('Кривой темпер — кислый кофе. Пробел тоже работает.')}</div></div></div>`);
    const m = S.mini; m.x = 0; m.y = 0; const t0 = now();
    // пузырёк уровня гуляет по кругу; чем сильнее дрожат руки, тем шире
    const pos = () => {
      const amp = 8 + effHands() * .4, t = now() - t0;
      m.x = amp * (Math.sin(t * 1.7) + .6 * Math.sin(t * 3.3 + 1)) / 1.5;
      m.y = amp * (Math.cos(t * 1.3) + .5 * Math.sin(t * 2.9 + 2)) / 1.4;
      const b = $('lb'); if (b) b.style.transform = `translate(${m.x.toFixed(1)}px, ${m.y.toFixed(1)}px)`;
      return t;
    };
    const go = (late) => {
      if (m.busy) return; m.busy = true;
      pos();
      if (late) { m.x = 36; m.y = 12; }
      const d = Math.hypot(m.x, m.y), q = clamp(1 - d / 44, 0, 1);
      S.pf.tamp = q; S.pf.tilt = clamp(m.x / 44, -1, 1);
      View.props.tamp(S.pf.tilt); Sound.tamp(); View.shake(.15);
      verdict(late ? 'Рука сама дёрнулась — прижал как попало.' : q > .72 ? 'Ровно. Идеальная таблетка.' : q > .4 ? 'Чуть криво, но сойдёт.' : 'Криво. Вода найдёт дорожку — будет кисло.', q > .4 ? 'good' : 'bad');
      markStep('tamp', q > .4);
      setTimeout(() => { m.busy = false; closeStation(); }, 800);
    };
    $('tampGo').onclick = () => go(false); m.keyDown = () => go(false);
    m.update = () => { if (!m.busy && pos() > 7) go(true); };
  }

  // ---------- пролив ----------
  function stepPull() {
    if (!needCup()) return;
    const noCoffee = S.pf.grams < 1;
    station('Пролив', 'останови в зелёной зоне: 24–32 с', gauge(45, 24, 32, 38) + `<div class="row"><button class="sb sb--main sb--wide" id="pullGo">${noCoffee ? 'Пролить без кофе' : 'Пуск'}</button><div class="readout" id="rd">0<small>с</small></div></div><div class="verdict" id="vd">${typo(noCoffee ? 'В холдере пусто: польётся просто горячая вода.' : 'Меньше — кисло, больше — горько.')}</div>`);
    const m = S.mini; m.run = false; let s0 = 0, added = 0;
    View.cam('machine', .8);
    const frac = { S: .32, M: .2, L: .16 }[S.cup.size];
    const secs = () => (m.run ? Math.min(45, (now() - s0) * 8.5) : 0);
    // стакан наполняется первые 30 секунд пролива
    const fill = (sec) => {
      const want = Math.min(sec, 30) / 30 * frac;
      if (want > added && S.cup) { addVol(noCoffee ? 'water' : 'esp', want - added, noCoffee ? 88 : 70); added = want; }
      needle(sec, 45); const r = $('rd'); if (r) r.innerHTML = Math.round(sec) + '<small>с</small>';
    };
    const stop = () => {
      const sec = secs();
      fill(sec);
      m.run = false; m.busy = true; View.props.pull(false); Sound.pull(false);
      if (!S.cup) return;
      S.cup.shot = noCoffee ? { blank: true, sec } : { grams: S.pf.grams, tamp: S.pf.tamp, sec };
      S.pf = { grams: 0, tamp: null, tilt: 0 }; View.props.resetGrounds();
      const ok = !noCoffee && sec >= 24 && sec <= 32;
      verdict(noCoffee ? 'Горячая вода вместо эспрессо. Смело.' : ok ? `${Math.round(sec)} с — золотая середина.` : sec < 24 ? `${Math.round(sec)} с — рано, будет кислый.` : `${Math.round(sec)} с — пережёг, горчит.`, ok ? 'good' : 'bad');
      markStep('pull', ok); renderTicket();
      setTimeout(() => { m.busy = false; closeStation(); }, 900);
    };
    const btn = $('pullGo');
    const toggle = () => { if (m.busy) return; if (!m.run) { m.run = true; s0 = now(); btn.textContent = 'Стоп'; View.props.pull(true); Sound.pull(true); } else stop(); };
    btn.onclick = toggle; m.keyDown = toggle;
    m.update = () => {
      if (!m.run) return;
      const sec = secs();
      fill(sec);
      if (sec >= 45) stop();
    };
  }

  // ---------- кипяток ----------
  function stepWater() {
    if (!needCup()) return;
    station('Кипяток', 'долей до линии: 85–100 %', gauge(110, 85, 100, 104) + `<div class="row"><button class="sb sb--main sb--wide" id="hold">Держать — лить</button><div class="readout" id="rd">${Math.round(S.cup.level * 100)}<small>%</small></div></div><div class="verdict" id="vd">${typo('Перельёшь — обожжёшь пальцы.')}</div>`);
    const m = S.mini; let hold = false, h0 = 0, l0 = 0;
    // кипяток льётся со скоростью 30 % стакана в секунду
    const flow = () => {
      if (!hold || !S.cup) return;
      const want = Math.min(1.1, l0 + (now() - h0) * .3);
      if (want > S.cup.level + .001) addVol('water', want - S.cup.level, 92);
    };
    const show = () => { const l = S.cup ? S.cup.level * 100 : 0; needle(l, 110); const r = $('rd'); if (r) r.innerHTML = Math.round(l) + '<small>%</small>'; };
    const fin = () => {
      flow(); hold = false; View.props.water(false); Sound.pour(false); show();
      if (!S.cup) return;
      const l = S.cup.level, ok = l >= .85 && l <= 1.02;
      if (l > 1.04) { S.nerves = clamp(S.nerves + 6, 0, 100); View.shake(.4); verdict('Перелил! Кипяток на пальцы, стакан липкий.', 'bad'); }
      else verdict(ok ? 'Ровно по линии.' : 'Недолив.', ok ? 'good' : 'bad');
      markStep('water', ok); m.busy = true; renderTicket();
      setTimeout(() => { m.busy = false; closeStation(); }, 800);
    };
    holdButton($('hold'), () => { if (m.busy || !S.cup) return; hold = true; h0 = now(); l0 = S.cup.level; View.props.water(true); Sound.pour(true); }, () => { if (hold) fin(); });
    m.update = () => { flow(); show(); if (hold && S.cup && S.cup.level >= 1.1) fin(); };
  }

  // ---------- молоко из холодильника ----------
  function stepMilk() {
    const want = S.win.order.milk;
    let kinds = ['milk', 'oat', 'kefir', 'cream'];
    if (S.drunk >= 1) kinds = kinds.sort(() => rnd() - .5);
    View.cam('fridge', .8);
    station('Холодильник', 'в чеке: ' + (want ? D.MILKS[want].short : 'без молока'), `<div class="chooser">${kinds.map((k) => `<button class="sb" data-k="${k}"><svg viewBox="0 0 24 24" style="color:${D.MILKS[k].label}"><path d="M7 8l2-4h6l2 4v12H7z"/><path d="M7 8h10"/></svg>${esc(scramble(D.MILKS[k].ru, S.drunk))}</button>`).join('')}</div><div class="verdict" id="vd">${typo(S.drunk >= 1 ? 'Буквы на пакетах пляшут. Читай внимательно.' : 'Пакеты похожи. Кефир — зелёный.')}</div>`);
    $('stBody').querySelectorAll('[data-k]').forEach((b) => b.onclick = () => {
      const k = b.dataset.k; Sound.click();
      S.pitcher = { kind: k, temp: 6, steamed: false };
      View.props.carton(k); View.props.pitcherMilk(k);
      markStep('milk', k === want);
      verdict('В питчере: ' + D.MILKS[k].short + '.', k === want ? 'good' : 'bad');
      S.mini.busy = true; setTimeout(() => { if (S.mini) S.mini.busy = false; closeStation(); }, 600);
    });
  }

  // ---------- пар ----------
  function stepSteam() {
    if (!S.pitcher) { toast('sys', 'Питчер пуст', typo('Сначала налей молоко из холодильника.')); openStep('milk'); return; }
    station('Паровая трубка', 'цель 55–68 °C · держи', gauge(90, 55, 68, 76) + `<div class="row"><button class="sb sb--main sb--wide" id="hold">Держать — пар</button><div class="readout" id="rd">${Math.round(S.pitcher.temp)}<small>°C</small></div></div><div class="verdict" id="vd">${typo('Выше 76 — пригорит и завоняет.')}</div>`);
    const m = S.mini, pk = S.pitcher; let hold = false, h0 = 0, t0 = pk.temp;
    View.cam('machine', .8);
    // холодное молоко греется быстрее (22 °C/с до 40 °C), дальше медленнее (17 °C/с)
    const temp = () => {
      if (!hold) return pk.temp;
      const e = now() - h0, fast = Math.max(0, (40 - t0) / 22);
      return Math.min(90, e < fast ? t0 + e * 22 : Math.max(t0, 40) + (e - fast) * 17);
    };
    const show = (t) => { needle(t, 90); const r = $('rd'); if (r) r.innerHTML = Math.round(t) + '<small>°C</small>'; };
    const fin = () => {
      const t = temp(); pk.temp = t; pk.steamed = true;
      hold = false; View.props.steam(false); Sound.steam(false); show(t);
      const ok = t >= 55 && t <= 68;
      verdict(ok ? `${Math.round(t)} °C — бархатная пена.` : t < 55 ? `${Math.round(t)} °C — едва тёплое.` : t > 76 ? `${Math.round(t)} °C — пригорело. Пахнет варёным.` : `${Math.round(t)} °C — горячевато.`, ok ? 'good' : 'bad');
      markStep('steam', ok); m.busy = true;
      setTimeout(() => { m.busy = false; closeStation(); }, 800);
    };
    holdButton($('hold'), () => { if (m.busy) return; hold = true; h0 = now(); t0 = pk.temp; View.props.steam(true, pk.kind); Sound.steam(true); }, () => { if (hold) fin(); });
    m.update = () => {
      const t = temp(); show(t);
      if (hold) { Sound.steamPitch(clamp((t - 50) / 40, 0, 1)); if (t >= 90) fin(); }
    };
  }

  // ---------- заливка и рисунок ----------
  function stepPour() {
    if (!needCup()) return;
    if (!S.pitcher) { toast('sys', 'Питчер пуст', typo('Сначала молоко.')); openStep('milk'); return; }
    const art = D.MENU[S.win.order.drink].art;
    const pats = art ? [['heart', 'Сердце'], ['tulip', 'Тюльпан'], ['rosetta', 'Розетта'], ['kukish', 'Кукиш'], ['none', 'Без рисунка']] : [['none', 'Просто залить'], ['kukish', 'Кукиш']];
    station('Заливка', art ? 'выбери рисунок — рука сама решит, что выйдет' : 'раф — без рисунка', `<div class="row" style="align-items:flex-start;gap:14px"><canvas class="art-prev" id="artPrev" width="168" height="168"></canvas><div class="chooser" style="flex:1">${pats.map(([k, t]) => `<button class="sb" data-p="${k}">${t}</button>`).join('')}</div></div><div class="verdict" id="vd">${typo(effHands() > 45 ? 'С такими руками сердечко — лотерея.' : 'Руки почти не дрожат. Можно рискнуть.')}</div>`);
    drawArt($('artPrev'), 'none', 1, S.cup);
    const m = S.mini;
    $('stBody').querySelectorAll('[data-p]').forEach((b) => b.onclick = () => {
      if (m.busy) return; m.busy = true;
      const p = b.dataset.p;
      const q = clamp(1 - effHands() / 100 * .95 + (rnd() - .5) * .3, 0, 1);
      View.cam('machine', .6);
      View.props.pour(true); Sound.pour(true);
      const pk = S.pitcher, target = Math.max(.05, .96 - S.cup.level), p0 = now();
      let done = 0;
      m.update = () => {
        if (!S.cup) return;
        const d = Math.min(target, target * (now() - p0) / 1.6) - done;
        if (d > 0) { addVol(pk.kind, d, pk.steamed ? pk.temp : 6); done += d; }
        if (done >= target - .001 && !m.fin) {
          m.fin = true; View.props.pour(false); Sound.pour(false);
          S.cup.milk = { kind: pk.kind, temp: pk.steamed ? pk.temp : 6, steamed: pk.steamed };
          S.cup.art = { pattern: p, q };
          const cv = $('artPrev'); drawArt(cv, p, q, S.cup);
          const big = document.createElement('canvas'); big.width = big.height = 256; drawArt(big, p, q, S.cup); View.props.cupArt(big);
          S.pitcher = null; View.props.pitcherMilk(null); View.props.carton(null);
          if (p === 'kukish') { S.flags.kukish = (S.flags.kukish || 0) + 1; verdict('На пенке гордо красуется кукиш.', 'bad'); }
          else if (p === 'none') verdict('Залито. Без изысков.', 'good');
          else verdict(q > .72 ? 'Получилось! Прямо как в интернете.' : q > .45 ? 'Кривовато, но узнаваемо.' : 'Клякса. Похоже на картошку.', q > .45 ? 'good' : 'bad');
          markStep('pour', p !== 'kukish'); renderTicket();
          setTimeout(() => { m.busy = false; closeStation(); }, 1300);
        }
      };
    });
  }
  // рисунок на пенке: чем сильнее дрожат руки, тем больше клякса
  function drawArt(cv, p, q, cup) {
    const x = cv.getContext('2d'), w = cv.width, r = w / 2;
    x.clearRect(0, 0, w, w);
    x.save(); x.beginPath(); x.arc(r, r, r - 1, 0, 7); x.clip();
    const base = cup && cup.milk && cup.milk.kind === 'kefir' ? '#e9e6dc' : '#b27a45';
    const g = x.createRadialGradient(r, r, r * .1, r, r, r); g.addColorStop(0, base === '#b27a45' ? '#c89260' : '#efece4'); g.addColorStop(1, base === '#b27a45' ? '#8a5a30' : '#d8d2c2');
    x.fillStyle = g; x.fillRect(0, 0, w, w);
    const wob = (1 - q) * r * .35, seed = Math.random() * 10;
    const jit = (i) => Math.sin(i * 2.1 + seed) * wob + Math.sin(i * 5.3 + seed * 2) * wob * .5;
    x.fillStyle = cup && cup.milk && cup.milk.kind === 'kefir' ? '#fbfaf6' : '#f7efe2';
    x.strokeStyle = x.fillStyle;
    const blob = (cx, cy, rr, n = 18) => { x.beginPath(); for (let i = 0; i <= n; i++) { const a = i / n * 6.283, k = rr + jit(i + cx) * .35; const px = cx + Math.cos(a) * k, py = cy + Math.sin(a) * k; i ? x.lineTo(px, py) : x.moveTo(px, py); } x.fill(); };
    const s = r / 84;
    if (p === 'heart') {
      if (q < .45) { blob(r + jit(1), r + jit(2), 40 * s); blob(r + 18 * s + jit(3), r - 14 * s, 22 * s); }
      else { x.beginPath(); x.moveTo(r + jit(4) * .3, r + 44 * s); x.bezierCurveTo(r - 70 * s + jit(5) * .5, r - 10 * s, r - 30 * s, r - 56 * s + jit(6) * .4, r, r - 22 * s); x.bezierCurveTo(r + 30 * s, r - 56 * s + jit(7) * .4, r + 70 * s + jit(8) * .5, r - 10 * s, r + jit(4) * .3, r + 44 * s); x.fill(); x.lineWidth = 3 * s; x.beginPath(); x.moveTo(r, r - 50 * s); x.lineTo(r + jit(9) * .2, r + 46 * s); x.strokeStyle = '#b27a45'; x.stroke(); }
    } else if (p === 'tulip') {
      for (let i = 0; i < 3; i++) blob(r + jit(i) * .6, r + 30 * s - i * 26 * s, (26 - i * 5) * s);
    } else if (p === 'rosetta') {
      for (let i = 0; i < 7; i++) { x.beginPath(); x.ellipse(r + jit(i) * .5, r + 42 * s - i * 13 * s, (40 - i * 4) * s, 6 * s, 0, 0, 7); x.fill(); }
      x.lineWidth = 3 * s; x.strokeStyle = '#f7efe2'; x.beginPath(); x.moveTo(r, r - 50 * s); x.lineTo(r, r + 52 * s); x.stroke();
    } else if (p === 'kukish') {
      blob(r, r + 8 * s, 38 * s);
      for (let i = 0; i < 3; i++) { x.beginPath(); x.ellipse(r - 22 * s + i * 20 * s, r - 22 * s, 10 * s, 18 * s, 0, 0, 7); x.fill(); }
      x.fillStyle = '#e9b89a'; x.beginPath(); x.ellipse(r - 2 * s, r - 38 * s, 7 * s, 11 * s, .3, 0, 7); x.fill();
      x.strokeStyle = '#8a5a30'; x.lineWidth = 2 * s; x.beginPath(); x.arc(r, r + 10 * s, 26 * s, .3, 2.8); x.stroke();
    } else {
      x.globalAlpha = .5; blob(r + jit(1) * .2, r, 50 * s, 24); x.globalAlpha = 1;
    }
    x.restore();
    x.strokeStyle = '#231b16'; x.lineWidth = 2; x.beginPath(); x.arc(r, r, r - 1, 0, 7); x.stroke();
  }

  // ---------- добавки ----------
  function stepExtras() {
    if (!needCup()) return;
    const o = S.win.order;
    let items = [['sugar', 'Сахар', 'ложка'], ['salt', 'Соль', 'ложка'], ['caramel', 'Карамель', 'сироп'], ['vanilla', 'Ваниль', 'сироп'], ['nut', 'Лесной орех', 'сироп'], ['cinnamon', 'Корица', 'щепотка']];
    if (S.drunk >= 1) items = items.sort(() => rnd() - .5);
    const want = [];
    if (o.syrup) want.push(D.SYRUPS[o.syrup].ru.toLowerCase());
    if (o.sugar) want.push('сахар ×' + o.sugar);
    if (o.cinnamon) want.push('корица');
    station('Полка', 'в чеке: ' + (want.join(', ') || 'ничего'), `<div class="chooser">${items.map(([k, t, u]) => `<button class="sb" data-x="${k}">${esc(scramble(t, S.drunk))}<small id="xc_${k}">${u}</small></button>`).join('')}</div><div class="row"><button class="sb sb--main sb--wide" id="xDone">Готово</button></div><div class="verdict" id="vd">${typo(S.drunk >= 1 ? 'Банки двоятся. Где сахар, а где соль?' : 'Сахар и соль — в одинаковых банках.')}</div>`);
    const show = () => { for (const [k] of items) { const n = k === 'sugar' ? S.cup.sugar : k === 'salt' ? S.cup.salt : k === 'cinnamon' ? S.cup.cinnamon : (S.cup.syr[k] || 0); const e = $('xc_' + k); if (e && n) e.textContent = '×' + n; } };
    $('stBody').querySelectorAll('[data-x]').forEach((b) => b.onclick = () => {
      const k = b.dataset.x; Sound.click();
      if (k === 'sugar') S.cup.sugar++; else if (k === 'salt') S.cup.salt++; else if (k === 'cinnamon') S.cup.cinnamon++;
      else { S.cup.syr[k] = (S.cup.syr[k] || 0) + 1; View.props.syrup(k); }
      show(); renderTicket();
    });
    show();
    $('xDone').onclick = () => {
      const c = S.cup, ok = c.sugar === (o.sugar || 0) && !c.salt && (!o.syrup || c.syr[o.syrup]) && (!!o.cinnamon === !!c.cinnamon);
      markStep('extras', ok); closeStation();
    };
    S.mini.keyDown = () => $('xDone').click();
  }

  function stepTeabag() {
    if (!needCup()) return;
    S.cup.teabag = true; Sound.click(); markStep('teabag', true); renderTicket();
    if (S.cup.level > .1) View.props.cupLevel(S.cup.level, cupColor());
    toast('sys', 'Пакетик в стакане', typo('Теперь кипяток.'), 2000);
  }

  function stepLid() {
    if (!needCup()) return;
    const crooked = rnd() < effHands() / 100 * .38;
    S.cup.lid = true; S.cup.lidOk = !crooked;
    View.props.cupLid(true, crooked); Sound.click();
    if (crooked) {
      station('Крышка', '', `<div class="verdict bad">${typo('Крышка села криво — не защёлкнулась.')}</div><div class="row"><button class="sb sb--main" id="lidFix">Поправить</button><button class="sb" id="lidKeep">И так сойдёт</button></div>`);
      $('lidFix').onclick = () => { S.cup.lidOk = rnd() > effHands() / 100 * .25; View.props.cupLid(true, !S.cup.lidOk); markStep('lid', S.cup.lidOk); closeStation(); };
      $('lidKeep').onclick = () => { markStep('lid', false); closeStation(); };
      S.mini.keyDown = () => $('lidFix').click();
    } else { markStep('lid', true); closeStation(); }
  }

  // ================================================================
  // «Всё остальное»: импровизация и пакости
  // ================================================================
  const IMPRO = [
    ['Кофе', [
      ['blank', 'Пролить без кофе', 'горячая вода через пустой холдер'],
      ['old', 'Вчерашний из термоса', 'зато быстро'],
      ['coldmilk', 'Молоко без пара', 'из пакета прямо в стакан'],
      ['kefir', 'Кефир в стакан', 'он тоже молочный'],
    ]],
    ['Пакости', [
      ['beer', 'Плеснуть пива', 'из ящика Серёжи'],
      ['salt', 'Посолить', 'столовая ложка'],
      ['tap', 'Долить из-под крана', 'холодненькой'],
      ['ash', 'Стряхнуть пепел', 'если недавно курил'],
      ['finger', 'Помешать пальцем', 'на глазах у клиента'],
      ['floor', 'Уронить и поднять', 'правило пяти секунд'],
    ]],
    ['Порядок', [
      ['trash', 'Вылить и начать заново', 'списание 20 ₽'],
      ['sip', 'Отхлебнуть самому', 'проверить на вкус'],
    ]],
  ];
  function renderImpro() {
    $('improGrid').innerHTML = IMPRO.map(([h, items]) => `<h2>${h}</h2>` + items.map(([k, t, s]) => `<button class="sb" data-i="${k}">${esc(t)}<small>${typo(s)}</small></button>`).join('')).join('');
  }
  renderImpro();
  $('bImpro').onclick = () => { Sound.click(); $('station').classList.add('hide'); S.mini = null; $('impro').classList.toggle('hide'); };
  $('bImproX').onclick = () => $('impro').classList.add('hide');
  $('improGrid').addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]'); if (!b) return;
    const k = b.dataset.i;
    if (!S.win || S.flow !== 'prep') { toast('sys', 'Не сейчас', typo('Пакостить можно, только когда у окошка есть клиент и напиток в работе.')); return; }
    if (k !== 'trash' && !S.cup) { toast('sys', 'Нет стакана', typo('Сначала возьми стакан.')); return; }
    const c = S.win, cup = S.cup;
    Sound.click();
    if (k === 'blank') { cup.shot = { blank: true, sec: 25 }; addVol('water', { S: .32, M: .2, L: .16 }[cup.size], 88); toast('sys', 'Пролито', typo('Вода через пустой холдер. На вид — почти кофе.'), 2500); }
    if (k === 'old') { cup.old = true; addVol('old', .5, 38); toast('sys', 'Вчерашний кофе', typo('Термос ещё тёплый. Почти.'), 2500); }
    if (k === 'coldmilk' || k === 'kefir') { const kind = k === 'kefir' ? 'kefir' : (c.order.milk || 'milk'); cup.milk = { kind, temp: 6, steamed: false }; addVol(kind, Math.max(.05, .9 - cup.level), 6); View.props.carton(kind); if (k === 'kefir') S.flags.kefir = true; toast('sys', k === 'kefir' ? 'Кефир в стакане' : 'Холодное молоко', typo(k === 'kefir' ? 'Белое и белое. Кто заметит?' : 'Без пара. Пены нет.'), 2500); }
    if (k === 'beer') {
      if (S.beer <= 0) { toast('sys', 'Ящик пуст', typo('Серёжино пиво кончилось.')); return; }
      S.beer--; cup.beer++; S.beerInCups++; S.drunk += .12; addVol('beer', .18, 6);
      View.props.beerLeft(S.beer); View.props.beerPour(true); Sound.bottle(); setTimeout(() => { View.props.beerPour(false); Sound.pour(false); }, 1400); Sound.pour(true);
      logEvent('бариста достал из-под прилавка бутылку пива и что-то плеснул в стакан', 'beer', true);
      toast('sys', 'Пиво в стакане', typo('Остаток допил сам. Для храбрости.'), 2500);
    }
    if (k === 'salt') { cup.salt++; toast('sys', 'Посолено', typo('Одна ложка соли. Белая, как сахар.'), 2000); }
    if (k === 'tap') { cup.tap++; addVol('tap', .15, 14); toast('sys', 'Вода из-под крана', typo('Ржавенькая.'), 2000); }
    if (k === 'ash') {
      if (S.min - S.lastSmokeEnd > 30 && !S.smokes) { toast('sys', 'Нечего стряхивать', typo('Ты ещё не курил. Сходи на перекур.')); return; }
      cup.ash = true; toast('sys', 'Пепел', typo('Серые хлопья на пенке.'), 2000);
    }
    if (k === 'finger') { cup.finger = true; View.shake(.1); logEvent('бариста помешал напиток пальцем', 'gross', true); toast('sys', 'Помешано пальцем', typo('Клиент всё видел.'), 2000); }
    if (k === 'floor') {
      cup.dropped = true; Sound.drop(); View.props.cupFloor(); View.shake(.3);
      logEvent('бариста уронил стакан на пол, поднял и как ни в чём не бывало продолжил', 'gross', true);
      toast('sys', 'Правило пяти секунд', typo('Три секунды. Почти стерильно.'), 2000);
    }
    if (k === 'trash') { if (S.cup) { S.writeoff += 20; View.props.dropCup(); S.cup = null; for (const s of c.steps) delete c.st[s]; S.pf = { grams: 0, tamp: null, tilt: 0 }; Sound.drop(); toast('sys', 'Вылито', typo('Начинаем заново. Списание 20 ₽.'), 2000); } }
    if (k === 'sip') {
      if (!cup || cup.level < .08) { toast('sys', 'Пусто', 'Отхлёбывать нечего.'); return; }
      const ev = evaluate(c);
      const worst = ev.notes.filter((n) => /НЕТ|КЕФИР|СОЛЬ|ПИВ|пепел|кисл|горьк|пригор|холодн|приторн/i.test(n)).slice(0, 2);
      toast('sys', 'На вкус — ' + fmt1(ev.q) + ' из 10', typo(worst.join(' ') || 'Вроде нормально.'), 4500);
      cup.level = Math.max(0, cup.level - .06); View.props.cupLevel(cup.level);
    }
    $('impro').classList.add('hide');
    renderTicket();
  });

  // ================================================================
  // Выдача и реакция
  // ================================================================
  $('bServe').onclick = () => { Sound.click(); serve(); };
  function serve() {
    if (!S.win || S.flow !== 'prep') { toast('sys', 'Некому выдавать', typo('У окошка никого нет.')); return; }
    if (!S.cup) { toast('sys', 'Нечего выдавать', typo('Стакана нет. Хотя… можно и пустой. Возьми стакан.')); return; }
    if (S.mini && S.mini.busy) return;
    closeStation(); $('impro').classList.add('hide');
    const c = S.win, ev = evaluate(c);
    c.ev = ev; S.flow = 'serving';
    updateNext();
    View.cam('fp', .6);
    View.props.cupToHatch(() => {
      const cupObj = View.props.handCup();
      if (cupObj) { cupObj.g.rotation.y = Math.PI; View.people.holdCup(c.pid, cupObj.g); }
      View.people.act(c.pid, 'sip', () => {});
      setTimeout(() => react(c, ev), 900);
    });
    Sound.click();
  }

  const MOOD3D = { 'доволен': 'happy', 'в восторге': 'happy', 'нейтрально': 'ok', 'зол': 'angry', 'в шоке': 'shock' };
  async function react(c, ev) {
    if (S.win !== c) return;
    S.flow = 'react'; c.talking = true;
    if (c.orderPromise) await c.orderPromise;
    Bub.thinking(c.pid, () => View.people.headPos(c.pid), c.name);
    View.people.talk(c.pid, true);
    const ctx = { price: c.price, wait: Math.round(S.min - c.arrivedAt), remake: c.remade > 0 };
    const r = await Talk.react(c, ev, ctx, (t) => { Bub.say(c.pid, () => View.people.headPos(c.pid), c.name, t); Sound.blip(c.pitch); });
    View.people.talk(c.pid, false); c.talking = false;
    if (S.win !== c) return;
    c.dec = r.dec; c.reactSay = r.say;
    View.people.mood(c.pid, MOOD3D[r.dec.mood] || 'ok');
    if (r.dec.stars <= 2) { View.people.act(c.pid, 'shake'); Sound.bad(); S.nerves = clamp(S.nerves + 6, 0, 100); }
    else if (r.dec.stars >= 5) { View.people.act(c.pid, 'hop'); Sound.good(); S.nerves = clamp(S.nerves - 4, 0, 100); }
    if (ev.q >= 9) S.perfect++;
    showReply(c);
  }

  function showReply(c) {
    S.flow = 'reply';
    const drunk = S.drunk >= .5;
    const opts = (drunk ? D.REPLY_DRUNK : D.REPLY_SOBER).filter((o) => o.kind !== 'remake' || c.remade < 1);
    const demands = c.dec.act === 'возвращает';
    $('replyOpts').innerHTML = opts.map((o) => `<button class="opt ${o.quiet ? 'opt--quiet' : ''} ${demands && o.kind === 'remake' ? 'opt--brave' : ''}" data-r="${o.id}">${esc(o.t)}</button>`).join('');
    $('replyForm').classList.toggle('hide', !brave());
    $('reply').classList.remove('hide');
    $('replyIn').value = '';
    $('replyIn').placeholder = 'Сказать как есть…';
    $('replyOpts').querySelectorAll('[data-r]').forEach((b) => b.onclick = () => { const o = opts.find((x) => x.id === b.dataset.r); chooseReply(c, o, o.t); });
    clearTimeout(c.replyTimer);
    c.replyTimer = setTimeout(() => { if (S.flow === 'reply' && S.win === c && document.activeElement !== $('replyIn')) chooseReply(c, { kind: 'bye' }, ''); }, 30000);
  }
  $('replyForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const t = $('replyIn').value.trim(); if (!t || !S.win || S.flow !== 'reply') return;
    chooseReply(S.win, { kind: 'say' }, t.slice(0, 120));
  });
  $('replyIn').addEventListener('keydown', (e) => e.stopPropagation());

  async function chooseReply(c, o, text) {
    if (S.flow !== 'reply' || S.win !== c) return;
    clearTimeout(c.replyTimer);
    $('reply').classList.add('hide');
    Sound.click();
    if (o.kind === 'remake') {
      c.remade++; S.remakes++; S.writeoff += 25;
      View.people.holdCup(c.pid, null);
      const p = View.people.get(c.pid); if (p && p.b.hand.children.length) p.b.hand.clear();
      S.cup = null; for (const s of c.steps) delete c.st[s];
      c.pat = Math.min(c.patMax, c.pat + c.patMax * .35);
      View.people.mood(c.pid, 'angry');
      Bub.say(c.pid, () => View.people.headPos(c.pid), c.name, pick(['Ну давай. Жду.', 'Только в этот раз нормально.', 'Время пошло.']));
      S.flow = 'prep'; renderTicket(true);
      logEvent(`бариста переделывает напиток для клиента ${c.name}`, 'remake', true);
      return;
    }
    if (o.kind === 'bye') { finalize(c, c.dec); return; }
    S.flow = 'final'; c.talking = true;
    const line = slur(text, S.drunk);
    Bub.say('barista', () => baristaAnchor(), 'Ты', line, { small: true });
    setTimeout(() => Bub.remove('barista'), 3500);
    Bub.thinking(c.pid, () => View.people.headPos(c.pid), c.name);
    View.people.talk(c.pid, true);
    const r = await Talk.reply(c, c.ev, { slurred: S.drunk >= .4, free: o.kind === 'free', price: c.price }, line, (t) => { Bub.say(c.pid, () => View.people.headPos(c.pid), c.name, t); Sound.blip(c.pitch); }, c.dec);
    View.people.talk(c.pid, false); c.talking = false;
    if (o.kind === 'free') { r.dec.pays = false; r.dec.tip = 0; }
    finalize(c, r.dec);
  }
  const _anchor = { x: 0, y: 1.72, z: .95 };
  function baristaAnchor() { const v = View.K && new View.K.THREE.Vector3(_anchor.x - .25, _anchor.y, _anchor.z); return v; }

  function finalize(c, dec) {
    if (S.win !== c) return;
    S.flow = 'leaving';
    c.final = dec; c.served = true; S.served++;
    // деньги
    if (dec.act === 'возвращает') { dec.act = 'выливает'; dec.pays = false; }
    if (dec.pays) { S.cash += c.price; S.tips += dec.tip; Sound.cash(); bumpChip('cash'); if (dec.tip) { bumpChip('tips'); View.props.tips(S.tips); } }
    else toast('sys', vf(c, 'Не заплатил', 'Не заплатила'), typo(c.name + ' ' + vf(c, 'ушёл', 'ушла') + ' без оплаты. Минус ' + rub(c.price) + '.'), 3500);
    if (c.secret) c.report = dec.report || D.DEMO.shopperReport.replace('{wait}', c.ev.wait).replace('{q}', fmt1(c.ev.q)).replace('{std}', c.ev.std);
    // что произошло с напитком
    const act = dec.act;
    const done = () => leave(c, 'served');
    if (act === 'выбрасывает') { View.people.walkTo(c.pid, 1.72, 2.05, () => { View.people.act(c.pid, 'throw', () => { View.people.holdCup(c.pid, null); clearHand(c); Sound.thud(); done(); }); }); logEvent(`${c.name} ${vf(c, 'выкинул', 'выкинула')} свой стакан в урну, едва попробовав`, 'throw', true); }
    else if (act === 'выливает') { View.people.act(c.pid, 'pour', () => { stain(c); clearHand(c); done(); }); logEvent(`${c.name} ${vf(c, 'вылил', 'вылила')} напиток прямо в снег у окошка`, 'throw', true); }
    else if (act === 'пьёт') { View.people.act(c.pid, 'sip', done); if (dec.stars >= 5) logEvent(`${c.name} ${vf(c, 'отпил и расплылся', 'отпила и расплылась')} в улыбке`, 'happy', true); }
    else done();
    // отзыв появится через пару секунд
    setTimeout(() => addReview(c, dec.stars, dec.review || D.DEMO.review[dec.stars][0]), 2500 + rnd() * 2500);
    if (dec.complain) {
      S.complaints.push(`${c.name}: ${(dec.review || c.reactSay || '').slice(0, 120)}`);
      S.rage = clamp(S.rage + 10, 0, 100);
      queueCall('complaint', 3 + rnd() * 3);
      toast('sys', c.name + ' звонит шефу', typo(pick(['«Сейчас я вашему начальству всё расскажу!»', '«Где тут телефон хозяина? А, на стикере.»', '«Алло, это владелец? Сейчас вы узнаете…»'])), 3500);
    }
    if (dec.stars <= 2) S.rage = clamp(S.rage + 4, 0, 100); else if (dec.stars >= 5) S.rage = clamp(S.rage - 4, 0, 100);
    for (const f of c.ev.flags) S.flags[f] = (S.flags[f] || 0) + 1;
    $('reply').classList.add('hide');
    S.cup = null;
    renderTicket(); updateHud(true);
  }
  function clearHand(c) { const p = View.people.get(c.pid); if (p) p.b.hand.clear(); }
  function leave(c, why) {
    if (S.win === c) { S.win = null; S.flow = 'idle'; renderTicket(); }
    setTimeout(() => Bub.fade(c.pid), why === 'served' ? 3800 : 1500);
    c.state = 'gone';
    const toRight = rnd() < .55;
    const bus = why === 'bus';
    View.people.walkTo(c.pid, bus ? 6 : toRight ? 18 : -18, bus ? 15.6 : 4.2 + rnd(), () => View.people.remove(c.pid), bus ? 2.6 : 1.3);
    setTimeout(callNext, why === 'served' ? 700 : 400);
  }
  // пятно от кофе в снегу
  function stain(c) {
    const T = View.K.THREE;
    const p = View.people.get(c.pid); if (!p) return;
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const x = cv.getContext('2d'); const g = x.createRadialGradient(32, 32, 2, 32, 32, 30);
    const col = c.ev.flags.includes('kefir') ? '220,215,200' : '90,55,30';
    g.addColorStop(0, `rgba(${col},.85)`); g.addColorStop(.6, `rgba(${col},.5)`); g.addColorStop(1, `rgba(${col},0)`);
    x.fillStyle = g; x.beginPath(); for (let i = 0; i <= 12; i++) { const a = i / 12 * 6.28, r = 20 + Math.random() * 10; i ? x.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r) : x.moveTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); } x.fill();
    const tex = new T.CanvasTexture(cv); tex.colorSpace = T.SRGBColorSpace;
    const m = new T.Mesh(new T.PlaneGeometry(.7, .7), new T.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.rotation.z = rnd() * 6; m.position.set(p.b.root.position.x + .25, .02, p.b.root.position.z + .15);
    View.K.scene.add(m);
    Sound.pour(true); setTimeout(() => Sound.pour(false), 900);
  }

  // ================================================================
  // Отзывы, события, реплики очереди
  // ================================================================
  function addReview(c, stars, text) {
    const r = { who: c.name, stars, text: String(text).slice(0, 260), at: S.min, left: !c.served };
    S.reviews.push(r); S.ratingSum += stars; S.ratingN++;
    toast('rv', 'Карты · ' + c.name, starStr(stars) + ' ' + typo(esc(r.text)), 6500);
    bumpChip('rating');
    if (stars <= 2) { S.rage = clamp(S.rage + 5, 0, 100); if (S.rage >= 35 && S.min - S.calls.lastAt > 14) queueCall('review', 2 + rnd() * 3); }
    renderReviews(); updateHud(true);
  }
  const starStr = (n) => `<span class="stars">${'★'.repeat(n)}<s>${'★'.repeat(5 - n)}</s></span>`;
  function renderReviews() {
    $('reviewsList').innerHTML = S.reviews.length ? S.reviews.slice().reverse().map((r) => `<div class="rv"><div class="rv__h"><b>${esc(r.who)}</b><span>${hhmm(r.at)} ${starStr(r.stars)}</span></div>${typo(esc(r.text))}</div>`).join('') : `<div class="rv">${typo('Пока новых отзывов нет. Всего на картах 23 отзыва, средний 4,1.')}</div>`;
  }
  renderReviews();
  $('bReviews').onclick = () => { $('reviews').classList.toggle('hide'); };
  $('bReviewsX').onclick = () => $('reviews').classList.add('hide');

  function logEvent(text, kind, visible) {
    S.log.push({ min: S.min, text, kind });
    if (!visible) return;
    const present = S.queue.concat(S.win ? [S.win] : []);
    for (const c of present) { c.seen.push(text); if (c.seen.length > 6) c.seen.shift(); }
    S.lastEvent = { text, kind, min: S.min };
    if (['beer', 'smoke', 'throw', 'gross'].includes(kind) && S.queue.length) S.chatterT = Math.min(S.chatterT, 1.5);
    // очередь злится от увиденного
    if (kind === 'beer' || kind === 'gross') for (const c of S.queue) c.pat -= c.patMax * .08;
  }
  async function chatter() {
    const cands = S.queue.filter((c) => c.state === 'queue');
    if (!cands.length) return;
    const c = pick(cands);
    const ev = S.lastEvent && S.min - S.lastEvent.min < 6 ? S.lastEvent : null;
    const kind = ev ? { beer: 'Beer', smoke: 'Smoke', throw: 'Throw', gross: 'Beer' }[ev.kind] : null;
    const useAI = ev && !S.chatterAI;
    if (useAI) S.chatterAI = true;
    const text = await Talk.chatter(c, { event: useAI ? ev.text : null, kind, wait: Math.round(S.min - c.arrivedAt) });
    S.chatterAI = false;
    if (c.state === 'gone' || S.phase !== 'play') return;
    Bub.say(c.pid, () => View.people.headPos(c.pid), c.name, text, { small: true });
    View.people.talk(c.pid, true); setTimeout(() => View.people.talk(c.pid, false), 1400);
    setTimeout(() => { if (S.win !== c) Bub.remove(c.pid); }, 5000);
  }

  // ================================================================
  // Пиво
  // ================================================================
  $('bBeer').onclick = beer;
  function beer() {
    if (S.phase !== 'play' || S.smoking || S.drinking) return;
    if (S.beer <= 0) { toast('sys', 'Ящик пуст', typo('Серёжино пиво кончилось. Серёжа расстроится.')); return; }
    if (S.mini && S.mini.busy) return;
    closeStation(); $('impro').classList.add('hide');
    S.drinking = true; Sound.click();
    View.cam('down', .5);
    setTimeout(() => {
      Sound.bottle();
      S.beer--; View.props.beerLeft(S.beer);
      View.camPos = View.K && new View.K.THREE.Vector3(0, 1.8, -.6);
      View.props.beerDrink(2.4, () => {
        S.beerDrunk++; View.props.empties(S.beerDrunk);
        S.drunk += .36; S.hands = Math.max(4, S.hands - 28); S.nerves = Math.max(0, S.nerves - 10);
        S.lastDrinkAt = S.min;
        View.cam('fp', .8); S.drinking = false;
        const lines = ['Руки перестали дрожать. Жизнь налаживается.', 'Мир стал мягче. И немного качается.', 'Смелость пришла. Координация ушла.', 'Серёжа простит. Наверное.'];
        toast('sys', 'Минус бутылка Серёжи', typo(S.beerDrunk === 1 ? 'Руки перестали дрожать. Теперь можно отвечать клиентам своими словами.' : pick(lines)), 3500);
        updateHud(true);
      });
      setTimeout(() => Sound.glug(), 700);
      logEvent('бариста присел под прилавок, там пшикнула бутылка и послышалось бульканье', 'beer', true);
    }, 500);
  }

  // ================================================================
  // Перекур за киоском
  // ================================================================
  $('bSmoke').onclick = smoke;
  $('bBack').onclick = backFromSmoke;
  let janMsgs = null;
  function smoke() {
    if (S.phase !== 'play' || S.smoking || S.drinking) return;
    if (S.cigs <= 0) { toast('sys', 'Сигареты кончились', typo('Пачка пуста. Придётся работать.')); return; }
    if (S.flow === 'react' || S.flow === 'final' || S.flow === 'serving') { toast('sys', 'Не сейчас', typo('Клиент как раз пробует. Дождись.')); return; }
    closeStation(); $('impro').classList.add('hide'); $('reply').classList.add('hide');
    S.smoking = true; S.cigs--; S.smokes++; S.smokeStart = S.min;
    Sound.click();
    ['dock', 'ticket', 'station'].forEach((id) => $(id).classList.add('hide'));
    $('smokeUi').classList.remove('hide');
    View.setBreakBoard(true);
    const pp = View.people;
    pp.visible('barista', true);
    pp.place('barista', .45, -1.62, Math.PI * .85); const bp = pp.get('barista'); bp.y0 = 0; bp.b.root.position.y = 0; bp.inside = false; pp.mood('barista', 'sleepy'); bp.lean = -.08;
    View.cam('smoke', 1.3);
    logEvent('бариста повесил в окошко табличку «ПЕРЕРЫВ 5 минут» и ушёл курить за киоск', 'smoke', true);
    setTimeout(() => { Sound.lighter(); }, 900);
    S.smokePuff = 1.2;
    bp.b.hand && pp.holdProp('barista', cigarette());
    // дворник Ильдар
    if (S.smokes === 1 || rnd() < .6) {
      pp.spawn('janitor', JANITOR, -2.2, -3.4, .9);
      pp.walkTo('janitor', -1.25, -2.55, () => pp.faceTo('janitor', .45, -1.62), .8);
      setTimeout(async () => {
        if (!S.smoking) return;
        const state = [S.drunk > .3 ? 'пахнет пивом' : 'с похмелья', effHands() > 50 ? 'руки трясутся' : '', S.nerves > 60 ? 'нервный' : ''].filter(Boolean).join(', ');
        Bub.thinking('janitor', () => pp.headPos('janitor'), 'Дворник Ильдар');
        pp.talk('janitor', true);
        const r = await Talk.janitor({ time: hhmm(S.min), state, queue: S.queue.length + (S.win ? 1 : 0) }, (t) => { if (S.smoking) { Bub.say('janitor', () => pp.headPos('janitor'), 'Дворник Ильдар', t); Sound.blip(.7); } });
        janMsgs = r.msgs; pp.talk('janitor', false);
        if (S.smoking) { $('smokeForm').classList.remove('hide'); $('smokeIn').value = ''; }
      }, 2200);
    }
    updateHud(true);
  }
  $('smokeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const t = $('smokeIn').value.trim(); if (!t) return;
    $('smokeForm').classList.add('hide');
    Bub.say('barista', () => View.people.headPos('barista'), 'Ты', slur(t, S.drunk), { small: true });
    const pp = View.people;
    setTimeout(async () => {
      Bub.thinking('janitor', () => pp.headPos('janitor'), 'Дворник Ильдар'); pp.talk('janitor', true);
      await Talk.janitorReply(janMsgs, slur(t, S.drunk), (x) => { if (S.smoking) { Bub.say('janitor', () => pp.headPos('janitor'), 'Дворник Ильдар', x); Sound.blip(.7); } });
      pp.talk('janitor', false);
    }, 900);
  });
  $('smokeIn').addEventListener('keydown', (e) => e.stopPropagation());
  // сигарета: фильтр, бумага и тлеющий кончик
  let _wisp = null;
  function cigarette() {
    const T = View.K.THREE;
    if (!S.cig) {
      const g = new T.Group();
      const paper = new T.Mesh(new T.CylinderGeometry(.0065, .0065, .07, 6), new T.MeshBasicMaterial({ color: 0xf4f1ea })); paper.position.y = .035; g.add(paper);
      const filt = new T.Mesh(new T.CylinderGeometry(.0068, .0068, .024, 6), new T.MeshLambertMaterial({ color: 0xd49a52 })); filt.position.y = -.01; g.add(filt);
      const tip = new T.Mesh(new T.CylinderGeometry(.0066, .0066, .008, 6), new T.MeshBasicMaterial({ color: 0xff6a24 })); tip.position.y = .074; g.add(tip);
      const ember = new T.Sprite(new T.SpriteMaterial({ map: View.K.glow, color: 0xff7a2a, transparent: true, opacity: .8, depthWrite: false, blending: T.AdditiveBlending, fog: false }));
      ember.scale.set(.05, .05, 1); ember.position.y = .076; g.add(ember);
      g.rotation.z = Math.PI / 2; g.position.set(-.02, -.02, .04); g.userData.tip = tip;
      S.cig = g; _wisp = new T.Vector3();
    }
    return S.cig;
  }
  function backFromSmoke() {
    if (!S.smoking) return;
    S.smoking = false; Sound.click();
    View.people.holdProp('barista', null);
    const mins = Math.round(S.min - S.smokeStart);
    S.smokeMin += mins; S.lastSmokeEnd = S.min;
    $('smokeUi').classList.add('hide'); $('smokeForm').classList.add('hide');
    ['dock', 'ticket'].forEach((id) => $(id).classList.remove('hide'));
    View.setBreakBoard(false);
    Bub.remove('janitor'); Bub.remove('barista');
    View.people.walkTo('janitor', -6, -5, () => View.people.remove('janitor'), .9);
    View.people.visible('barista', false);
    View.cam('fp', 1.1);
    logEvent(`бариста вернулся с перекура через ${mins} ${plural(mins, 'минуту', 'минуты', 'минут')}, от него несёт табаком`, 'smoke', true);
    if (S.pendingRing) { const r = S.pendingRing; S.pendingRing = null; ring(r); }
    if (S.flow === 'reply' && S.win) $('reply').classList.remove('hide');   // клиент всё ещё ждёт ответа
    renderTicket(); updateHud(true);
  }

  // ================================================================
  // Звонки шефа
  // ================================================================
  function queueCall(reason, inMin) { if (!S.calls.queue.some((q) => q.reason === reason)) S.calls.queue.push({ reason, at: S.min + inMin }); }
  function bossCtx(reason) {
    return { reason, time: hhmm(S.min), rage: Math.round(S.rage), cash: S.cash, served: S.served, lost: S.lost, queue: S.queue.length + (S.win ? 1 : 0), rating: fmt1(rating()), reviews: S.reviews, complaints: S.complaints, missed: S.calls.missed, smokeMin: S.smokeMin + (S.smoking ? Math.round(S.min - S.smokeStart) : 0) };
  }
  function ring(reason) {
    if (S.call || S.ending) return;
    S.calls.lastAt = S.min;
    const call = S.call = { reason, state: 'ringing', text: '', done: false, start: performance.now() };
    View.props.phone(true); Sound.ring(true);
    const box = $('call'); box.classList.remove('hide'); box.classList.add('ringing');
    $('callSt').textContent = 'звонит…'; $('callText').textContent = '';
    $('callForm').classList.add('hide');
    $('callOpts').innerHTML = `<div class="row"><button class="opt opt--ok" id="cAns">Ответить</button><button class="opt opt--no" id="cDec">Сбросить</button></div>`;
    $('cAns').onclick = () => answer(call);
    $('cDec').onclick = () => missCall(call, true);
    if (S.smoking) toast('sys', 'Телефон звонит в киоске', typo('Слышно через стенку. Вернёшься — успеешь?'), 4000);
    // реплику шефа готовим заранее, пока телефон звонит
    call.pre = Talk.bossOpen(bossCtx(reason), (t) => { call.text = t; if (call.state === 'talk') $('callText').innerHTML = typo(esc(t)); });
    call.timer = setTimeout(() => { if (call.state === 'ringing') missCall(call, false); }, 12000);
  }
  function missCall(call, declined) {
    if (S.call !== call) return;
    clearTimeout(call.timer);
    Sound.ring(false); View.props.phone(false);
    S.calls.missed++; S.calls.missedTotal++;
    S.rage = clamp(S.rage + (declined ? 9 : 11), 0, 100);
    $('call').classList.add('hide'); $('call').classList.remove('ringing');
    S.call = null;
    toast('sys', 'Пропущенный от шефа', typo(S.calls.missed >= 2 ? 'Уже ' + S.calls.missed + ' подряд. Он звереет.' : 'Перезвонит. Злее.'), 3500);
    queueCall('missed', 4 + rnd() * 2);
    if (S.rage >= 100) bossComing();
    updateHud(true);
  }
  async function answer(call) {
    if (S.call !== call || call.state !== 'ringing') return;
    if (S.smoking) { toast('sys', 'Ты за киоском', typo('Сначала вернись за стойку.')); return; }
    clearTimeout(call.timer);
    call.state = 'talk'; Sound.ring(false); View.props.phone(false); Sound.click();
    $('call').classList.remove('ringing');
    $('callSt').textContent = 'на связи · ' + hhmm(S.min);
    $('callOpts').innerHTML = '';
    $('callText').innerHTML = call.text ? typo(esc(call.text)) : '<span class="dots"><i></i><i></i><i></i></span>';
    S.calls.missed = 0;
    const r = await call.pre;
    if (S.call !== call) return;
    call.msgs = r.msgs;
    $('callText').innerHTML = typo(esc(r.say));
    if (typeof r.rage === 'number') S.rage = clamp(r.rage, S.rage - 12, S.rage + 20);
    S.nerves = clamp(S.nerves + 5, 0, 100);
    const opts = S.drunk >= .5 ? ['Всё под контролем, шеф!', 'Вадик, не начинай', 'Тут очередь, перезвоню'] : ['Всё под контролем, Вадим Игоревич', 'Тут очередь, перезвоню', 'Извините, исправлюсь'];
    $('callOpts').innerHTML = opts.map((t) => `<button class="opt" data-c="${esc(t)}">${esc(t)}</button>`).join('');
    $('callOpts').querySelectorAll('[data-c]').forEach((b) => b.onclick = () => bossReply(call, b.dataset.c));
    $('callForm').classList.toggle('hide', !brave()); $('callIn').value = '';
    updateHud(true);
  }
  $('callForm').addEventListener('submit', (e) => { e.preventDefault(); const t = $('callIn').value.trim(); if (t && S.call) bossReply(S.call, t.slice(0, 120)); });
  $('callIn').addEventListener('keydown', (e) => e.stopPropagation());
  async function bossReply(call, text) {
    if (S.call !== call || call.state !== 'talk') return;
    call.state = 'reply';
    Sound.click();
    const line = slur(text, S.drunk);
    $('callOpts').innerHTML = ''; $('callForm').classList.add('hide');
    $('callText').innerHTML = `<span style="color:var(--cream2)">Ты: ${typo(esc(line))}</span>\n\n<span class="dots"><i></i><i></i><i></i></span>`;
    const noise = S.queue.length >= 4 ? 'гул недовольной очереди' : '';
    const r = await Talk.bossReply({ ...bossCtx(call.reason), slurred: S.drunk >= .5, noise }, call.msgs, line, (t) => { $('callText').innerHTML = `<span style="color:var(--cream2)">Ты: ${typo(esc(line))}</span>\n\n${typo(esc(t))}`; });
    if (S.call !== call) return;
    if (typeof r.rage === 'number') S.rage = clamp(r.rage, S.rage - 15, S.rage + 25);
    $('callSt').textContent = 'шеф положил трубку';
    updateHud(true);
    const threat = r.coming && S.rage < 65;
    setTimeout(() => {
      if (S.call === call) { $('call').classList.add('hide'); S.call = null; }
      if ((r.coming && !threat) || S.rage >= 100) bossComing();
      else if (threat) { S.rage = clamp(S.rage + 8, 0, 100); toast('sys', 'Шеф грозится приехать', typo('Пока только грозится. Ещё один косяк — и приедет.'), 4500); }
    }, 3200);
  }
  function bossComing() {
    if (S.bossComing || S.ending) return;
    S.bossComing = S.min + 9;
    toast('sys', 'Шеф выехал', typo('«Всё. Я еду.» Будет минут через десять.'), 6000);
  }

  // ================================================================
  // Главный цикл
  // ================================================================
  let hudT = 0;
  function tick(dt, time) {
    Bub.update();
    if (S.mini && S.mini.update && !S.mini.closing) { S.mini.t += dt; S.mini.update(dt); } else if (S.mini) S.mini.t += dt;
    if (S.phase !== 'play') return;
    const talking = S.win && (S.win.talking || ['react', 'final', 'serving'].includes(S.flow));
    const scale = S.smoking ? 3 : talking ? .35 : 1;
    const dm = dt / SEC_PER_MIN * scale;
    S.min += dm;
    let dayT = clamp((S.min - START) / (END - START), 0, 1);
    if (S.dayBlend) { const k = clamp((performance.now() - S.dayBlend.t0) / 4000, 0, 1); dayT = S.dayBlend.from + (dayT - S.dayBlend.from) * k * k * (3 - 2 * k); if (k >= 1) S.dayBlend = null; }
    if (Math.abs(dayT - (S.lastDay ?? -1)) > .0015 || S.dayBlend) { S.lastDay = dayT; View.setDay(dayT); }
    // тело
    S.drunk = Math.max(0, S.drunk - dm * .006);
    if (S.drunk < .2) S.hands = Math.min(92, S.hands + dm * .16); else S.hands = Math.max(4, S.hands - dm * .05);
    if (S.smoking) S.nerves = Math.max(0, S.nerves - dm * 3.4);
    else S.nerves = clamp(S.nerves + dm * Math.max(0, S.queue.length - 2) * .3, 0, 100);
    View.setDrunk(clamp(S.drunk / 1.6, 0, 1.3));
    View.setTremor(S.mini && S.mini.update ? effHands() / 100 : effHands() / 400);
    View.canvasFilter(S.drunk > 1.1 ? `blur(${Math.min(2.2, (S.drunk - 1.1) * 1.6).toFixed(2)}px)` : '');
    $('fx-vig').style.opacity = String(.55 + clamp(S.drunk / 2, 0, .45));
    // дым сигареты
    if (S.smoking) {
      // затяжка: рука к губам, потом выдох; от кончика сигареты всё время тянется тонкий дымок
      S.smokePuff -= dt;
      if (S.smokePuff < 0) {
        S.smokePuff = 3.2 + rnd() * 1.8;
        Sound.inhale();
        View.people.act('barista', 'puff', () => { const mp = View.people.mouthPos('barista'); if (mp && S.smoking) View.K.puff(mp, { vy: .3, vx: -.1, op: .5, size: .07, life: 2.6, grow: 2.6, color: 0xdde2ea }); });
      }
      S.wispT = (S.wispT || 0) - dt;
      if (S.wispT < 0 && S.cig && _wisp) { S.wispT = .35; S.cig.userData.tip.getWorldPosition(_wisp); View.K.puff(_wisp, { vy: .18, vx: .02, op: .22, size: .025, life: 1.8, grow: 1.6, color: 0xc9d0da }); }
      const m = Math.round(S.min - S.smokeStart);
      $('smokeInfo').innerHTML = typo(`Куришь ${m} ${plural(m, 'минуту', 'минуты', 'минут')}. Нервы: ${Math.round(S.nerves)}. В очереди ${S.queue.length + (S.win ? 1 : 0)} ${plural(S.queue.length + (S.win ? 1 : 0), 'человек', 'человека', 'человек')}.`);
    }
    // терпение
    for (const c of S.queue) {
      if (c.state === 'gone') continue;
      c.pat -= dm * (S.smoking ? 1.5 : 1);
      if (c.pat <= 0) queueLeave(c, S.smoking ? 'бариста ушёл курить, окошко закрыто' : 'очередь не двигалась');
    }
    const w = S.win;
    if (w && S.flow === 'prep' && !w.talking) {
      w.pat -= dm * (S.smoking ? 1.6 : S.drinking ? 1.2 : .45);
      if (w.pat <= 0) windowLeave(w);
      else if (w.pat < w.patMax * .3 && !w.warned) { w.warned = true; Bub.say(w.pid, () => View.people.headPos(w.pid), w.name, pick(D.DEMO.wait)); View.people.mood(w.pid, 'angry'); View.people.act(w.pid, 'stomp'); }
    }
    // прибытие
    while (S.schedule.length && S.schedule[0].t <= S.min && !S.closing) spawnCustomer(S.schedule.shift().c);
    // автобус
    if (S.min >= S.nextBus) { S.nextBus += 18 + rnd() * 6; busArrives(); }
    // реплики очереди
    S.chatterT -= dt;
    if (S.chatterT < 0) { S.chatterT = 14 + rnd() * 16; chatter(); }
    // звонки
    if (S.min >= START + 7 && !S.introCall) { S.introCall = true; ring('intro'); }
    if (S.min >= 7 * 60 + 35 && !S.checkCall) { S.checkCall = true; queueCall('check', 0); }
    if (S.min >= 8 * 60 + 38 && !S.finalCall) { S.finalCall = true; queueCall('final', 0); }
    if (!S.call && S.calls.queue.length) {
      const i = S.calls.queue.findIndex((q) => q.at <= S.min);
      if (i >= 0) { const q = S.calls.queue.splice(i, 1)[0]; ring(q.reason); }
    }
    // пьяный микросон
    if (S.drunk >= 1.8) {
      S.microT -= dt;
      if (S.microT < 0) { S.microT = 25 + rnd() * 20; microSleep(); }
    }
    if (S.drunk >= 2.6 && !S.ending) { S.asleep = true; startFinale('asleep'); return; }
    if (S.bossComing && S.min >= S.bossComing && !S.ending) { startFinale('boss'); return; }
    if (S.min >= END && !S.closing) { S.closing = true; toast('sys', '9:00 — конец смены', typo('Новых клиентов не будет. Шеф едет за выручкой.'), 5000); }
    if (S.closing) maybeFinale();
    hudT -= dt; if (hudT < 0) { hudT = .25; updateHud(); }
  }
  function maybeFinale() { if (!S.ending && (!S.win || S.flow === 'prep' || S.flow === 'idle')) startFinale('time'); }
  function microSleep() {
    const b = $('fx-blink'); b.classList.add('on');
    setTimeout(() => { b.classList.remove('on'); S.min += 2 + rnd() * 3; toast('sys', 'Ты на секунду закрыл глаза', typo('…а прошло три минуты. Очередь смотрит на тебя.'), 3000); logEvent('бариста уснул стоя прямо за прилавком на пару минут', 'gross', true); }, 1300);
  }
  function queueLeave(c, reason) {
    c.state = 'gone';
    S.queue = S.queue.filter((x) => x !== c);
    S.lost++; S.nerves = clamp(S.nerves + 3, 0, 100); S.rage = clamp(S.rage + 3, 0, 100);
    View.people.mood(c.pid, 'angry');
    Bub.say(c.pid, () => View.people.headPos(c.pid), c.name, pick(['Всё, я пошёл. Ноги моей здесь не будет.', 'Да ну вас. Дома сварю.', 'Сорок минут! Я опаздываю!', 'Спасибо, накушался.']), { small: true });
    View.people.walkTo(c.pid, rnd() < .5 ? 18 : -18, 4.3 + rnd(), () => View.people.remove(c.pid));
    setTimeout(() => Bub.remove(c.pid), 3000);
    layoutQueue();
    logEvent(`${c.name} ${vf(c, 'не выдержал и ушёл', 'не выдержала и ушла')} из очереди`, 'lost', true);
    Talk.leftReview(c, { reason, wait: Math.round(S.min - c.arrivedAt), seen: c.seen.slice(-3).join('; ') }).then((r) => addReview(c, r.stars, r.review));
    if (S.lost % 2 === 0) queueCall('lost', 2);
  }
  function windowLeave(c) {
    closeStation(); $('impro').classList.add('hide');
    S.lost++; S.writeoff += S.cup ? 20 : 0;
    View.props.dropCup(); S.cup = null;
    View.people.mood(c.pid, 'furious');
    Bub.say(c.pid, () => View.people.headPos(c.pid), c.name, pick(['Всё! Я ухожу. Такого сервиса я ещё не видел.', 'Знаете что? Пейте сами.', 'Я на работу из-за вас опоздаю! До свидания!']));
    logEvent(`${c.name} ${vf(c, 'не дождался напитка у самого окошка и ушёл', 'не дождалась напитка у самого окошка и ушла')}, хлопнув по прилавку`, 'lost', true);
    Talk.leftReview(c, { reason: 'стоял у самого окошка, а бариста так и не сделал напиток', wait: Math.round(S.min - c.arrivedAt), seen: c.seen.slice(-3).join('; ') }).then((r) => addReview(c, r.stars, r.review));
    S.rage = clamp(S.rage + 5, 0, 100);
    setTimeout(() => leave(c, 'angry'), 1400);
    S.flow = 'leaving';
  }
  function busArrives() {
    View.people.busCall(() => {
      Sound.bus();
      // кто-то из очереди убегает на автобус
      const run = S.queue.filter((c) => c.arch.bus && c.state === 'queue' && c.pat < c.patMax * .65);
      for (const c of run.slice(0, 2)) {
        if (rnd() < .6) {
          c.state = 'gone'; S.queue = S.queue.filter((x) => x !== c); S.lost++;
          Bub.say(c.pid, () => View.people.headPos(c.pid), c.name, pick(['Мой автобус! Всё, без кофе!', 'Ай, автобус! Пропустите!']), { small: true });
          View.people.walkTo(c.pid, 6, 15.6, () => View.people.remove(c.pid), 2.8);
          setTimeout(() => Bub.remove(c.pid), 2500);
          logEvent(`${c.name} ${vf(c, 'плюнул на кофе и убежал', 'плюнула на кофе и убежала')} на автобус`, 'lost', true);
          Talk.leftReview(c, { reason: 'пришёл автобус, а очередь так и не дошла', wait: Math.round(S.min - c.arrivedAt), seen: c.seen.slice(-3).join('; ') }).then((r) => addReview(c, r.stars, r.review));
        }
      }
      layoutQueue();
    });
  }

  // ================================================================
  // HUD
  // ================================================================
  const rating = () => S.ratingSum / S.ratingN;
  function bumpChip(which) { const el = $(which) && $(which).closest('.chip'); if (!el) return; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  function updateHud(force) {
    $('clk').textContent = hhmm(Math.min(S.min, END + 59));
    $('clk').classList.toggle('late', S.min >= END - 15);
    const left = Math.max(0, END - S.min);
    $('clkSub').textContent = S.min >= END ? 'смена окончена' : left > 60 ? `до конца смены ${Math.floor(left / 60)} ч ${Math.floor(left % 60)} мин` : `до конца смены ${Math.floor(left)} мин`;
    $('cash').textContent = rub(S.cash);
    $('tips').textContent = rub(S.tips);
    $('rating').textContent = fmt1(rating());
    $('ratingN').textContent = S.ratingN + NB + plural(S.ratingN, 'отзыв', 'отзыва', 'отзывов');
    $('cost').textContent = $('cost2').textContent = 'нейросеть: $' + (AI.usage.costUSD || 0).toFixed(4).replace('.', ',');
    const h = effHands();
    $('vHands').textContent = Math.round(h); $('mHands').style.width = h + '%';
    $('vDrunk').textContent = fmt1(S.drunk); $('mDrunk').style.width = clamp(S.drunk / 2.6 * 100, 0, 100) + '%';
    $('vNerves').textContent = Math.round(S.nerves); $('mNerves').style.width = S.nerves + '%';
    $('vBoss').textContent = S.bossComing ? 'едет сюда' : S.rage < 20 ? 'спокоен' : S.rage < 45 ? 'раздражён' : S.rage < 75 ? 'злой' : 'в бешенстве';
    $('mBoss').style.width = S.rage + '%';
    const note = $('courage');
    note.classList.toggle('brave', brave());
    note.innerHTML = typo(S.drunk >= 1.8 ? 'Пьян. Глаза закрываются сами.' : S.drunk >= 1 ? 'Пьяная смелость. Буквы пляшут.' : brave() ? 'Пиво развязало язык: можно отвечать своими словами.' : 'Трезвый. Отвечать клиентам духу не хватает.');
    $('beerN').textContent = S.beer; $('cigN').textContent = S.cigs;
    // на узком экране уведомления не наезжают на окно звонка
    const cb = $('call'), narrow = innerWidth < 760 && !cb.classList.contains('hide');
    $('toasts').style.top = narrow ? Math.round(cb.getBoundingClientRect().bottom + 8) + 'px' : '';
    if (force) updateNext();
  }

  // ================================================================
  // Уведомления
  // ================================================================
  function toast(kind, head, html, ms = 4000) {
    const t = document.createElement('div');
    t.className = 'toast' + (kind === 'sys' ? ' toast--sys' : '');
    t.innerHTML = `<div class="toast__h"><span>${esc(head)}</span><span>${hhmm(S.min)}</span></div>${html}`;
    const box = $('toasts'); box.prepend(t);
    while (box.children.length > 3) box.lastChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 600); }, ms);
  }

  // ================================================================
  // Реплики над головами
  // ================================================================
  const Bub = {
    map: new Map(),
    get(key, anchor, name, small) {
      let b = this.map.get(key);
      if (!b) {
        const el = document.createElement('div');
        el.className = 'bub' + (small ? ' bub--small' : '') + (key === 'boss' ? ' bub--boss' : '');
        el.innerHTML = '<span class="bub__n"></span><span class="bub__t"></span>';
        $('bubbles').appendChild(el);
        b = { el, anchor, name: el.firstChild, text: el.lastChild };
        this.map.set(key, b);
      }
      b.anchor = anchor; b.el.classList.remove('fade');
      b.el.classList.toggle('bub--small', !!small);
      b.name.textContent = name || '';
      return b;
    },
    say(key, anchor, name, text, o = {}) { const b = this.get(key, anchor, name, o.small); b.text.innerHTML = typo(esc(text)); this.update(); },
    thinking(key, anchor, name) { const b = this.get(key, anchor, name); b.text.innerHTML = '<span class="dots"><i></i><i></i><i></i></span>'; this.update(); },
    fade(key) { const b = this.map.get(key); if (b) b.el.classList.add('fade'); setTimeout(() => { const x = this.map.get(key); if (x && x.el.classList.contains('fade')) this.remove(key); }, 400); },
    remove(key) { const b = this.map.get(key); if (b) { b.el.remove(); this.map.delete(key); } },
    clear() { for (const k of [...this.map.keys()]) this.remove(k); },
    update() {
      const W = innerWidth, H = innerHeight;
      // камера у кофемашины, кофемолки или холодильника смотрит мимо окошка — облачка прячем
      const away = ['grinder', 'machine', 'fridge', 'down'].includes(View.camName());
      if (away !== this.away) { this.away = away; $('bubbles').classList.toggle('away', away); }
      if (away) return;
      // на титуле облачка не заходят на карточку с названием
      let minX = 8, maxY = H - 100;
      if (S.phase === 'title' || S.phase === 'starting') {
        const r = this.card || (this.card = document.querySelector('.title__card'));
        if (r) { const bb = r.getBoundingClientRect(); if (W > 760) minX = bb.right + 24; else maxY = bb.top - 12; }
      }
      const placed = [];
      for (const [k, b] of this.map) {
        const v = b.anchor && b.anchor();
        if (!v) { b.el.style.opacity = '0'; continue; }
        const p = View.project(v);
        if (!p.vis) { b.el.style.opacity = '0'; continue; }
        b.el.style.opacity = '';
        const w = b.el.offsetWidth, h = b.el.offsetHeight;
        placed.push({ b, w, h, x: clamp(p.x - 10, minX, W - w - 8), y: clamp(p.y - h - 10, 64, maxY - h), big: !b.el.classList.contains('bub--small') });
      }
      // крупные реплики важнее: раскладываем их первыми, мелкие уходят вверх
      placed.sort((a, b) => (b.big - a.big) || (b.y - a.y));
      const over = (a, o) => a.x < o.x + o.w + 6 && o.x < a.x + a.w + 6 && a.y < o.y + o.h + 6 && o.y < a.y + a.h + 6;
      // препятствия: панели интерфейса (чек, самочувствие, телефон), а на титуле и в финале — вывеска «Бодрячок»
      const obst = [];
      for (const id of ['ticket', 'meters', 'call']) {
        const el = $(id);
        if (el.classList.contains('hide')) continue;
        const r = el.getBoundingClientRect();
        if (r.width) obst.push({ x: r.left, y: r.top, w: r.width, h: r.height });
      }
      if ((S.phase === 'title' || S.phase === 'starting' || S.phase === 'final') && View.signRect) { const r = View.signRect(); if (r) obst.push(r); }
      for (let i = 0; i < placed.length; i++) {
        const a = placed[i];
        for (let guard = 0; guard < 10; guard++) {
          // облачко отходит от препятствия вбок (от края экрана к центру), а если некуда — под него
          const ob = obst.find((o) => over(a, o));
          if (ob) {
            const nx = ob.x + ob.w / 2 > W / 2 ? ob.x - a.w - 10 : ob.x + ob.w + 10;
            if (nx >= minX && nx <= W - a.w - 8 && !obst.some((o) => o !== ob && over({ ...a, x: nx }, o))) a.x = nx;
            else a.y = ob.up ? ob.y - a.h - 10 : ob.y + ob.h + 10;   // над вывеской — небо, под панелями — сцена
            continue;
          }
          const hit = placed.slice(0, i).find((o) => over(a, o));
          if (!hit) break;
          a.y = hit.y - a.h - 8;
          if (a.y < 60) { a.y = hit.y + hit.h + 8; a.x = clamp(a.x + 40, minX, W - a.w - 8); }
        }
        a.b.el.style.transform = `translate(${a.x.toFixed(1)}px, ${a.y.toFixed(1)}px)`;
      }
    },
  };

  // ================================================================
  // Клавиатура и клики по 3D
  // ================================================================
  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.target && (e.target.tagName === 'INPUT')) return;
    if (e.code === 'Space') { e.preventDefault(); if (S.mini && S.mini.keyDown) S.mini.keyDown(); }
    if (e.code === 'Enter' && S.phase === 'play' && !S.mini) { e.preventDefault(); $('bNext').click(); }
    if (e.code === 'Enter' && S.phase === 'title') { e.preventDefault(); startShift(); }
  });
  addEventListener('keyup', (e) => { if (e.code === 'Space' && S.mini && S.mini.keyUp) S.mini.keyUp(); });
  const HOVER = { grinder: 'Кофемолка — помол', machine: 'Кофемашина — темпер, пролив, пар', cups: 'Стаканы', fridge: 'Холодильник — молоко и кефир', crate: 'Ящик пива Серёже', phone: 'Рабочий телефон', shelf: 'Сиропы', jars: 'Сахар и соль' };
  const tip = document.createElement('div'); tip.className = 'hover-tip hide'; document.body.appendChild(tip);
  View.onHover = (st, x, y) => {
    if (!st || S.phase !== 'play' || S.smoking) { tip.classList.add('hide'); return; }
    tip.textContent = HOVER[st] || ''; tip.classList.remove('hide');
    tip.style.transform = `translate(${Math.min(x + 16, innerWidth - 240)}px, ${y + 18}px)`;
  };
  function onPick(st) {
    if (S.phase !== 'play' || S.smoking) return;
    if (st === 'phone') { if (S.call && S.call.state === 'ringing') answer(S.call); return; }
    if (st === 'crate') { beer(); return; }
    const map = { grinder: 'grind', cups: 'cup', fridge: 'milk', shelf: 'extras', jars: 'extras' };
    if (st === 'machine') { const c = S.win; const n = c ? ['tamp', 'pull', 'water', 'steam', 'pour'].find((s) => c.steps.includes(s) && !c.st[s]) : 'tamp'; if (n) openStep(n); return; }
    if (map[st]) openStep(map[st]);
  }

  // ================================================================
  // Финал: шеф у окошка
  // ================================================================
  function startFinale(why) {
    if (S.ending) return;
    S.ending = true; S.phase = 'final';
    if (S.smoking) backFromSmoke();
    S.phase = 'final';
    closeStation(); ['impro', 'reply', 'call', 'station', 'dock'].forEach((id) => $(id).classList.add('hide'));
    if (S.call) { clearTimeout(S.call.timer); Sound.ring(false); View.props.phone(false); S.call = null; }
    S.early = why === 'boss';
    const pp = View.people;
    if (why === 'asleep') { $('fx-blink').classList.add('on'); toast('sys', 'Ты уснул за прилавком', typo('Последнее, что помнишь: чьё-то «молодой человек!»'), 6000); }
    // клиент у окошка отходит
    if (S.win) { const c = S.win; Bub.remove(c.pid); pp.walkTo(c.pid, -2.2, 2.4, () => pp.faceTo(c.pid, 0, 1.2)); S.win = null; }
    View.cam('fp', 1);
    toast('sys', 'Подъезжает чёрная машина', typo('Это Вадим Игоревич.'), 5000);
    pp.bossCarArrive(() => {
      pp.spawn('boss', BOSS, 2.4, 8.3, Math.PI);
      pp.walkTo('boss', 1.2, 4, () => pp.walkTo('boss', SLOTS[0][0], SLOTS[0][1], () => { pp.face('boss', Math.PI); pp.mood('boss', S.rage > 60 ? 'angry' : 'ok'); }), 1.4);
      if (why === 'asleep') setTimeout(() => $('fx-blink').classList.remove('on'), 2500);
      setTimeout(showGuess, 1500);
    });
  }
  function showGuess() {
    const seen = S.all.filter((c) => c.served || c.ev);
    if (!seen.length) { runVerdict(); return; }
    $('guessList').innerHTML = seen.map((c) => `<button class="sb" data-g="${c.id}"><span>${esc(c.name)}</span><small>${esc(D.MENU[c.order.drink].ru)}, ${hhmm(c.orderAt || 0)}</small></button>`).join('') + `<button class="sb" data-g="none"><span>Не было его</span><small>никого не подозреваю</small></button>`;
    $('guess').classList.remove('hide');
    $('guessList').querySelectorAll('[data-g]').forEach((b) => b.onclick = () => { S.guessId = b.dataset.g; $('guess').classList.add('hide'); Sound.click(); runVerdict(); });
  }
  // тайный покупатель: мог и не дойти до киоска (ещё в расписании) или уйти из очереди
  function findShopper() { return S.all.find((c) => c.secret) || (S.schedule.find((e) => e.c.secret) || {}).c || null; }
  // Угадал: назвал того, кто был тайным покупателем, — или честно сказал «не было», если тот так и не дошёл до окошка
  function guessRight(shopper) {
    if (!shopper) return S.guessId === 'none';
    return (shopper.served || shopper.ev) ? S.guessId === shopper.id : S.guessId === 'none';
  }
  async function runVerdict() {
    const pp = View.people;
    const shopper = findShopper();
    const shopperServed = shopper && (shopper.served || shopper.ev);
    const ctx = {
      cash: S.cash, served: S.served, lost: S.lost, rating: fmt1(rating()), ratingNum: rating(), reviews: S.reviews,
      complaints: S.complaints, missed: S.calls.missed, missedTotal: S.calls.missedTotal, smokeMin: S.smokeMin, beerDrunk: S.beerDrunk + S.beerInCups,
      promille: fmt1(S.drunk), shopperReport: shopperServed ? `${shopper.name}: ${shopper.report || 'не успел написать'} (качество напитка ${fmt1(shopper.ev ? shopper.ev.q : 0)}/10)` : '',
      shopperQ: shopperServed && shopper.ev ? shopper.ev.q : 5, guessedRight: guessRight(shopper), asleep: S.asleep, early: S.early,
    };
    Bub.thinking('boss', () => pp.headPos('boss'), 'Вадим Игоревич');
    const v = await Talk.verdict(ctx);
    pp.talk('boss', true);
    pp.mood('boss', v.verdict === 'премия' ? 'happy' : v.verdict === 'нормально' ? 'ok' : 'angry');
    await Talk.fakeStream(v.speech, (t) => { Bub.say('boss', () => pp.headPos('boss'), 'Вадим Игоревич', t); Sound.blip(.75); }, 55);
    pp.talk('boss', false);
    setTimeout(() => showFinal(v, ctx, shopper), 2200);
  }
  function showFinal(v, ctx, shopper) {
    const guessed = guessRight(shopper);
    const reached = shopper && (shopper.served || shopper.ev);
    const base = 2500, beerCost = (S.beerDrunk + S.beerInCups) * 180;
    const pay = Math.max(0, base + S.tips + (guessed ? 500 : 0) + v.bonus - v.fine - beerCost);
    const tags = [];
    if (S.flags.kefir) tags.push('Кефирный барон');
    if (S.beerInCups) tags.push('Пивной сомелье');
    if (S.smokes >= 3) tags.push('Курильщик года');
    if (!S.beerDrunk && !S.beerInCups) tags.push('Трезвый как стекло');
    if (S.perfect >= 3) tags.push('Рука не дрогнула');
    if (guessed) tags.push('Тайный агент раскрыт');
    if (S.flags.kukish) tags.push('Мастер кукиша');
    if (S.flags.salt) tags.push('Соль земли');
    if (S.reviews.some((r) => r.stars === 5)) tags.push('Пять звёзд');
    if (S.drunk >= 2) tags.push('Ушёл в запой');
    if (S.lost >= 5) tags.push('Разогнал очередь');
    const ok = v.verdict === 'премия' || v.verdict === 'нормально';
    const L = (a, b) => `<div class="fr"><span>${a}</span><b>${b}</b></div>`;
    $('finalBody').innerHTML = `
      <h2>Итог смены</h2>
      <div class="final__sub">киоск «Бодрячок» · ул. Строителей, 14 · ${hhmm(START)}–${hhmm(Math.min(S.min, END + 30))}</div>
      <div class="fverdict ${ok ? 'ok' : ''}">${esc(v.verdict.toUpperCase())}</div>
      <div class="final__sub">«${esc(v.title)}»</div>
      <div class="fspeech"><small>Вадим Игоревич у окошка:</small>${typo(esc(v.speech))}</div>
      <div class="fsep"></div>
      ${L('Выручка', rub(S.cash) + NB + 'из' + NB + rub(PLAN))}
      ${L('Обслужено клиентов', S.served)}
      ${L('Ушли без кофе', S.lost)}
      ${L('Рейтинг на картах', '4,1' + NB + '→' + NB + fmt1(rating()))}
      ${L('Пиво из ящика Серёжи', (S.beerDrunk + S.beerInCups) + NB + 'бут.')}
      ${L('Перекуры', S.smokes + ' · ' + S.smokeMin + NB + 'мин')}
      ${L('Пропущенные звонки шефа', S.calls.missedTotal)}
      ${L('Тайный покупатель', (shopper ? esc(shopper.name) + (reached ? '' : vf(shopper, ' (не дошёл)', ' (не дошла)')) : 'не приходил') + (guessed ? ' — угадал' : ' — не угадал'))}
      ${shopper && shopper.report ? `<div class="frv">${typo(esc(shopper.report))}</div>` : ''}
      <div class="fsep"></div>
      <div class="fh">ЗАРПЛАТА ЗА СМЕНУ</div>
      ${L('Ставка', rub(base))}
      ${L('Чаевые', '+' + rub(S.tips))}
      ${guessed ? L('Бдительность', '+' + rub(500)) : ''}
      ${v.bonus ? L('Премия', '+' + rub(v.bonus)) : ''}
      ${v.fine ? L('Штраф', '−' + rub(v.fine)) : ''}
      ${beerCost ? L('Пиво Серёже', '−' + rub(beerCost)) : ''}
      <div class="fsep"></div>
      ${L('НА РУКИ', rub(pay))}
      ${S.reviews.length ? `<div class="fh">ОТЗЫВЫ ЗА СМЕНУ</div>` + S.reviews.map((r) => `<div class="frv">${starStr(r.stars)} <b>${esc(r.who)}:</b> ${typo(esc(r.text))}</div>`).join('') : ''}
      ${tags.length ? `<div class="ftags">${tags.map((t) => `<span>${t}</span>`).join('')}</div>` : ''}
      <div class="fsep"></div>
      ${L('Нейросеть за смену', '$' + (AI.usage.costUSD || 0).toFixed(4).replace('.', ',') + ' · ' + AI.usage.calls + ' ' + plural(AI.usage.calls, 'запрос', 'запроса', 'запросов'))}
      <div class="final__btns"><button class="btn btn--main" id="bAgain">Ещё смена</button><button class="btn btn--ghost" id="bLook">Посмотреть на район</button></div>`;
    $('final').classList.remove('hide');
    $('hud').classList.add('hide'); $('ticket').classList.add('hide'); $('meters').classList.add('hide');
    $('bAgain').onclick = () => location.reload();
    $('bLook').onclick = () => { $('final').classList.add('hide'); View.cam('final', 2); View.people.visible('barista', true); Bub.clear(); setTimeout(() => { const b = document.createElement('button'); b.className = 'btn btn--main'; b.textContent = 'К итогам'; b.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:30'; b.onclick = () => { b.remove(); $('final').classList.remove('hide'); }; document.body.appendChild(b); }, 300); };
  }

  // ================================================================
  // Для проверки из _tools/shot (без логов, без ключа)
  // ================================================================
  window.SHIFT_TEST = {
    live() { AI.shot = false; AI.demo = !AI.hasKey(); return !AI.demo; },
    lowres(on = true) { View.setRatio(on ? .4 : null); return on; },
    start: startShift,
    state: () => ({ min: Math.round(S.min), flow: S.flow, win: S.win && S.win.name, queue: S.queue.length, cash: S.cash, tips: S.tips, reviews: S.reviews.length, rage: Math.round(S.rage), drunk: +S.drunk.toFixed(2), cost: +(AI.usage.costUSD || 0).toFixed(5), calls: AI.usage.calls, demo: AI.demo, fails: Talk.failures, err: Talk.lastError }),
    make(opts = {}) {
      const c = S.win; if (!c || S.flow !== 'prep') return 'no customer';
      newCup(opts.size || c.order.size);
      c.st.cup = 'done';
      if (opts.name !== undefined) { S.cup.name = opts.name; View.props.cupText(opts.name); } else { S.cup.name = c.cupName; View.props.cupText(c.cupName); }
      if (c.order.drink !== 'tea') { S.cup.shot = { grams: opts.grams ?? 18, tamp: opts.tamp ?? .9, sec: opts.sec ?? 28 }; addVol('esp', .2, 70); }
      else S.cup.teabag = true;
      if (c.order.drink === 'americano' || c.order.drink === 'tea') addVol('water', .7, 92);
      const milk = opts.milk || c.order.milk;
      if (milk) { S.cup.milk = { kind: milk, temp: opts.temp ?? 62, steamed: true }; addVol(milk, .7, opts.temp ?? 62); S.cup.art = { pattern: opts.art || 'heart', q: .8 }; }
      S.cup.sugar = opts.sugar ?? c.order.sugar; if (c.order.syrup) S.cup.syr[c.order.syrup] = 1;
      if (c.order.cinnamon) S.cup.cinnamon = 1;
      if (opts.salt) S.cup.salt = opts.salt; if (opts.beer) S.cup.beer = 1; if (opts.ash) S.cup.ash = true;
      S.cup.lid = opts.lid ?? true;
      for (const s of c.steps) c.st[s] = 'done';
      renderTicket();
      return evaluate(c).q;
    },
    serve, beer, smoke, back: backFromSmoke, reply: (text) => { if (S.flow === 'reply' && S.win) chooseReply(S.win, { kind: 'say' }, text); return S.flow; },
    bye: () => { if (S.flow === 'reply' && S.win) chooseReply(S.win, { kind: 'bye' }, ''); return S.flow; },
    ring, answer: () => S.call && answer(S.call), bossSay: (t) => S.call && bossReply(S.call, t),
    skip(min) { S.min += min; return Math.round(S.min); },
    end: () => startFinale('time'),
    bubbles: () => [...Bub.map.values()].map((b) => b.name.textContent + ': ' + b.text.textContent),
    call: () => S.call && { state: S.call.state, text: S.call.text },
  };
})();
