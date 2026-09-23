/* ================================================================
   Тихоречинск — нейросеть превращает толпу в людей.
   • Жизнь жителя: DeepSeek потоком пишет биографию из смоделированных
     фактов (кэш в памяти и localStorage).
   • Разговор: житель отвечает от первого лица, зная свои факты и то,
     что с ним прямо сейчас.
   • Поиск по смыслу: код ранжирует 10 000 жителей по фактам, DeepSeek
     через AI.json выбирает одного из кандидатов и объясняет выбор.
   • Газета: заметки о реальных событиях симуляции.
   Без ключа — демо-режим на заготовках из data.js.
   ================================================================ */
(function (LC) {
  'use strict';
  const D = window.LC_DATA;
  const B = LC.brain = {};
  const $ = (id) => document.getElementById(id);
  const esc = (s) => LC.esc(s);
  const nb = (s) => LC.nbsp(esc(s));
  const hasAI = () => window.AI && !AI.demo && !AI.shot;

  // ================================================================
  // Факты о жителе
  // ================================================================
  function g(id, s) { return LC.g(s, LC.pop.sex[id] === 1); }
  function transportWord(id) {
    const t = LC.pop.transport[id];
    return t === 2 ? 'ездит на своей машине' : t === 1 ? 'ездит на метро' : t === 3 ? 'водит служебную машину' : 'ходит пешком';
  }
  function distWord(b) { return LC.city.DIST_NAME[LC.city.buildings[b].d] || ''; }
  function relLines(id) {
    return LC.relations(id).map((r) => r.label + ' — ' + r.name + ' (' + LC.pop.age[r.id] + ', ' + LC.profTitle(r.id) + ')');
  }
  function todayEvents(id) {
    const L = LC.life, out = [];
    if (L.lateWork[id] > 0) out.push(g(id, 'опоздал{|а} на работу на ') + L.lateWork[id] + ' мин');
    else if (L.lateWork[id] === 0) out.push(g(id, 'приш{ёл|ла} на работу вовремя'));
    const dt = L.dateOf(id);
    if (dt) {
      out.push('свидание в ' + LC.fmt(dt.t) + ' с ' + LC.whoLabel(id, dt.with, 'gen').replace(/^.*? — /, '') + ' ' + LC.venueIn(dt.v));
      if (L.lateDate[id] > 0) out.push(g(id, 'опоздал{|а} на свидание на ') + L.lateDate[id] + ' мин');
    }
    if (L.meets[id]) for (const m of L.meets[id].slice(-2)) out.push(g(id, 'случайно встретил{|а} ') + LC.relLabel(m.rel, LC.pop.sex[m.o]) + ' — ' + LC.name(m.o) + ' ' + LC.venueIn(m.v));
    const km = L.km[id] / 1000;
    if (km > 0.2) out.push(g(id, 'прош{ёл|ла} сегодня ') + km.toFixed(1).replace('.', ',') + ' км');
    if (L.drank[id]) out.push('сегодня выпивал' + (LC.pop.sex[id] ? 'а' : '') + ' в баре');
    return out;
  }
  function agendaLine(id) {
    return LC.life.agendaText(id).filter((it) => !(it.a === LC.A.HOME && it.e - it.s < 10)).map((it) => LC.fmt(it.s) + '–' + LC.fmt(it.e) + ' ' + it.where).join('; ');
  }
  B.todayEvents = todayEvents;
  B.facts = function (id) {
    const pop = LC.pop, L = LC.life, f = pop.sex[id] === 1;
    const Bd = LC.city.buildings[pop.home[id]];
    const st = L.status(id);
    const lines = [
      'Имя: ' + LC.name(id, 'full') + ', ' + LC.ageWord(pop.age[id]) + ', ' + (f ? 'женщина' : 'мужчина') + (pop.age[id] < 18 ? ' (подросток)' : ''),
      'Занятие: ' + LC.profTitle(id) + (LC.workName(id) && LC.workName(id) !== 'дома' ? ', место: ' + LC.workName(id) : '') + (LC.ui.shiftText(id) ? ', график ' + LC.ui.shiftText(id) : ''),
      'Дом: ' + Bd.address + ', кв. ' + pop.apt[id] + ' (' + distWord(pop.home[id]) + '); ' + (pop.hhSize[id] > 1 ? 'живёт вместе с: ' : '') + LC.ui.household(id) + '; ' + transportWord(id),
      'Характер: ' + LC.traitWord(id, 0) + ', ' + LC.traitWord(id, 1) + '. Увлечение: ' + D.hobbies[pop.hobby[id]] + (pop.pet[id] >= 0 ? '. Питомец: ' + D.pets[pop.pet[id]] : ''),
      'На уме сегодня: ' + LC.g(D.thoughts[pop.thought[id]].t, f),
      'Тайна: ' + LC.g(D.secrets[pop.secret[id]].t, f),
      'Мечта: ' + D.dreams[pop.dream[id]],
      'Связи: ' + (relLines(id).join('; ') || 'почти ни с кем не общается'),
      'Распорядок сегодня: ' + agendaLine(id),
      'Сейчас ' + LC.DAYS[LC.clock.weekday] + ', ' + LC.fmt(LC.clock.min) + ': ' + st.text + (st.late ? ' (опаздывает на ' + st.late + ' мин)' : ''),
      'События дня: ' + (todayEvents(id).join('; ') || 'пока ничего особенного'),
      'Одиночество ' + Math.round(pop.lonely[id] * 100) + '/100, настроение ' + Math.round(pop.mood[id] * 100) + '/100, довольство работой ' + Math.round(pop.jobSat[id] * 100) + '/100',
    ];
    return lines.join('\n');
  };

  // ================================================================
  // Жизнь: потоковая биография с кэшем
  // ================================================================
  const bioCache = new Map();
  const LS = 'lc121-bio-';
  function lsGet(k) { try { return localStorage.getItem(LS + k); } catch (e) { return null; } }
  function lsSet(k, v) {
    try {
      localStorage.setItem(LS + k, v);
      const idx = JSON.parse(localStorage.getItem(LS + 'idx') || '[]');
      idx.push(k);
      while (idx.length > 80) localStorage.removeItem(LS + idx.shift());
      localStorage.setItem(LS + 'idx', JSON.stringify(idx));
    } catch (e) { /* хранилище недоступно — живём без кэша */ }
  }
  let bioCtl = null, bioFor = -1;
  B.stop = function () { if (bioCtl) { try { bioCtl.abort(); } catch (e) { /* уже закрыт */ } bioCtl = null; } bioFor = -1; };

  function paragraphs(text, cursor) {
    const parts = String(text).trim().split(/\n\s*\n|\n/).filter(Boolean);
    return parts.map((p, i) => '<p>' + nb(p) + (cursor && i === parts.length - 1 ? '<span class="cur"></span>' : '') + '</p>').join('') || (cursor ? '<p><span class="cur"></span></p>' : '');
  }

  function demoBio(id) {
    const pop = LC.pop, f = pop.sex[id] === 1, L = LC.life;
    const st = L.status(id);
    const ag = L.ag[id] ? L.ag[id][L.agi[id]] : null;
    const vars = {
      name: LC.name(id), first: LC.name(id, 'first'), age: LC.ageWord(pop.age[id]), job: LC.profTitle(id), Job: LC.cap(LC.profTitle(id)), work: LC.workName(id) || 'дом',
      home: LC.city.buildings[pop.home[id]].address, trait: LC.traitWord(id, 0), hobby: D.hobbies[pop.hobby[id]], dream: D.dreams[pop.dream[id]],
      secret: LC.g(D.secrets[pop.secret[id]].t, f), mind: LC.g(D.thoughts[pop.thought[id]].t, f), dest: st.text, time: LC.fmt(LC.clock.min),
      goal: ag && ag.a === LC.A.WORK ? 'смена сама себя не отработает' : ag && ag.a === LC.A.DATE ? 'его ждут, и это важно' : ag && ag.a === LC.A.BAR ? 'пятница есть пятница' : 'так устроен этот день',
    };
    const k = id % 10;
    const p1 = LC.fill(D.demo.bioOpen[k], vars, f);
    const p2 = LC.fill(D.demo.bioMind[(k + 3) % 10], vars, f) + ' ' + LC.cap(st.text) + '.';
    const rel = LC.relations(id)[0];
    const p3 = rel ? 'Рядом по жизни — ' + rel.label + ' ' + rel.name + '.' : '';
    return p1 + '\n\n' + p2 + (p3 ? ' ' + p3 : '');
  }

  B.bio = function (id, el) {
    B.stop();
    bioFor = id;
    const cached = bioCache.get(id) || lsGet(id);
    if (cached) { bioCache.set(id, cached); el.innerHTML = paragraphs(cached); return; }
    if (!hasAI()) {
      const text = demoBio(id);
      if (AI && AI.shot) { el.innerHTML = paragraphs(text); return; }
      typeOut(el, text, id);
      return;
    }
    el.innerHTML = '<div class="thinking">Собираю жизнь по&nbsp;фактам<i></i><i></i><i></i></div>';
    const ctl = new AbortController();
    bioCtl = ctl;
    const system = 'Ты — летописец вымышленного города Тихоречинск на реке Тихой (10 000 жителей, у каждого смоделированная жизнь). ' +
      'Пиши живым русским языком, тепло и с лёгкой иронией, без пафоса, штампов и морали. Опирайся ТОЛЬКО на факты из карточки: ' +
      'можно добавить мелкие бытовые детали, которые им не противоречат, но нельзя придумывать новых людей, места и события. ' +
      'Не упоминай карточку, симуляцию, цифры шкал и слово «житель». Без заголовков, списков и markdown.';
    const user = 'Карточка:\n' + B.facts(id) + '\n\nНапиши жизнь этого человека: два абзаца, всего 80–120 слов. ' +
      'Первый — кто это и как устроена жизнь (дело, дом, близкие, характер, увлечение). Второй — что с ним прямо сейчас и что у него на уме; ' +
      'тайну не раскрывай прямо, только намекни. Время указывай словами, как в разговоре.';
    AI.chat([{ role: 'user', content: user }], {
      system, maxTokens: 380, temperature: 0.85, signal: ctl.signal,
      onToken: (d, full) => { if (bioFor === id) el.innerHTML = paragraphs(full, true); },
    }).then((text) => {
      if (bioFor !== id) return;
      text = String(text || '').trim();
      if (!text) throw new Error('empty');
      bioCache.set(id, text); lsSet(id, text);
      el.innerHTML = paragraphs(text);
    }).catch((e) => {
      if (bioFor !== id || (e && e.name === 'AbortError')) return;
      el.innerHTML = paragraphs(demoBio(id)) + '<div class="thinking">' + nb((e && e.ru) || 'Нейросеть не ответила') + '. Показана заготовка.</div>';
    });
  };
  // печать заготовки «как будто поток» — интерфейс живой и без сети
  function typeOut(el, text, id) {
    let i = 0;
    const step = () => {
      if (bioFor !== id) return;
      i = Math.min(text.length, i + 6);
      el.innerHTML = paragraphs(text.slice(0, i), i < text.length);
      if (i < text.length) setTimeout(step, 16);
    };
    step();
  }

  // ================================================================
  // Разговор
  // ================================================================
  const talks = new Map();
  function voice(id) {
    const a = LC.pop.age[id];
    const t = [D.traits[LC.pop.trait1[id]][2], D.traits[LC.pop.trait2[id]][2]];
    let v = a < 14 ? 'Ты ребёнок: говоришь просто, по-детски, немного стесняешься взрослых.' : a < 18 ? 'Ты подросток: коротко, с подростковым сленгом, без мата.'
      : a > 68 ? 'Ты пожилой человек: говоришь неторопливо, по-старомодному, любишь вспомнить прошлое.' : a < 28 ? 'Ты молодой: говоришь легко, современно.' : 'Говоришь как обычный взрослый горожанин.';
    if (t.includes('grumpy')) v += ' Ворчишь.';
    if (t.includes('funny')) v += ' Шутишь.';
    if (t.includes('shy') || t.includes('soc-')) v += ' Отвечаешь скупо, неохотно раскрываешься.';
    if (t.includes('soc+')) v += ' Любишь поболтать.';
    if (t.includes('anx')) v += ' Немного тревожишься.';
    return v;
  }
  function demoReply(id, text) {
    const q = text.toLowerCase();
    const R = D.demo.replies;
    const cat = /привет|здравств|добр(ый|ое)|здоров/.test(q) ? 'hello' : /как (дела|жизнь|ты|вы)|как поживает/.test(q) ? 'how'
      : /куда|идёшь|идете|идёте|спешишь|где/.test(q) ? 'where' : /работ|профес|кем|служ/.test(q) ? 'work'
      : /люб|жена|муж|девушк|парен|свидан|сердц/.test(q) ? 'love' : /деньг|зарплат|долг|кредит|богат/.test(q) ? 'money' : 'other';
    const list = R[cat];
    const pop = LC.pop, f = pop.sex[id] === 1;
    const rel = LC.relations(id)[0];
    const vars = { first: LC.name(id, 'first'), job: LC.profTitle(id), Job: LC.cap(LC.profTitle(id)), work: LC.workName(id) || 'дом', mind: LC.g(D.thoughts[pop.thought[id]].t, f),
      dest: LC.life.status(id).text, dream: D.dreams[pop.dream[id]], trait: LC.traitWord(id, 0), rel: rel ? rel.label : 'друг', relname: rel ? rel.name : 'соседа' };
    const n = (talks.get(id) || []).length;
    return LC.fill(list[(id + n) % list.length], vars, f);
  }
  function addMsg(box, who, html) {
    const d = document.createElement('div');
    d.className = 'msg ' + who;
    d.innerHTML = html;
    box.appendChild(d);
    const sc = $('card-scroll');
    sc.scrollTop = sc.scrollHeight;
    return d;
  }
  B.talk = function (id, text, box) {
    const hist = talks.get(id) || [];
    talks.set(id, hist);
    addMsg(box, 'me', nb(text));
    const out = addMsg(box, 'them', '<span class="thinking"><i></i><i></i><i></i></span>');
    hist.push({ role: 'user', content: text });
    if (!hasAI()) {
      const r = demoReply(id, text);
      setTimeout(() => { out.innerHTML = nb(r); hist.push({ role: 'assistant', content: r }); $('card-scroll').scrollTop = 1e6; }, 500 + Math.random() * 500);
      return;
    }
    const st = LC.life.status(id);
    const system = 'Ты — ' + LC.name(id, 'full') + ', ' + LC.ageWord(LC.pop.age[id]) + ', ' + LC.profTitle(id) + ' из города Тихоречинска. ' +
      'Отвечай от первого лица, как живой человек, 1–3 коротких предложения, разговорно, по-русски. ' + voice(id) +
      ' Твоя жизнь (только это правда о тебе):\n' + B.facts(id) +
      '\n\nСейчас ' + LC.fmt(LC.clock.min) + ', ты ' + st.text + '. Незнакомец заговорил с тобой — ты можешь быть занят, спешить, удивиться. ' +
      'Не придумывай людей и мест, которых нет в фактах. Тайну не выдавай сразу — только если собеседник мягко и настойчиво расспросит. ' +
      'Никогда не говори, что ты ИИ, персонаж или модель.';
    AI.chat(hist.slice(-10), {
      system, maxTokens: 170, temperature: 0.9,
      onToken: (d, full) => { out.innerHTML = nb(full); $('card-scroll').scrollTop = 1e6; },
    }).then((r) => {
      r = String(r || '').trim() || '…';
      out.innerHTML = nb(r);
      hist.push({ role: 'assistant', content: r });
    }).catch((e) => {
      const r = demoReply(id, text);
      out.innerHTML = nb(r) + '<div class="thinking" style="margin-top:4px;font-size:12px">' + nb((e && e.ru) || 'нет связи') + ', ответ-заготовка</div>';
      hist.push({ role: 'assistant', content: r });
    });
  };

  // ================================================================
  // Поиск по смыслу
  // ================================================================
  // признаки жителя (0..1) для ранжирования
  const FEAT = {
    lonely: (id) => LC.pop.lonely[id],
    date: (id) => (LC.life.dateOf(id) ? 1 : 0),
    lateDate: (id) => {
      const L = LC.life, d = L.dateOf(id);
      if (!d) return 0;
      if (L.lateDate[id] > 0) return 0.7 + Math.min(0.3, L.lateDate[id] / 60);
      const st = L.status(id);
      if (st.late && L.act[id] === LC.A.DATE) return 1;
      // ещё не вышел или в пути: прогноз по пунктуальности
      return 0.25 + (1 - LC.pop.punct[id]) * 0.5;
    },
    lateWork: (id) => { const L = LC.life; const st = L.status(id); return st.late && (L.act[id] === LC.A.WORK || L.act[id] === LC.A.STUDY) ? 1 : L.lateWork[id] > 0 ? 0.5 + Math.min(0.5, L.lateWork[id] / 60) : 0; },
    love: (id) => {
      const p = LC.pop; let s = 0;
      for (let k = 0; k < p.relN[id]; k++) if (p.relT[id * 3 + k] === 8) s = 1;
      if (D.secrets[p.secret[id]].tag === 'love') s = Math.max(s, 0.8);
      if (D.thoughts[p.thought[id]].tag === 'love') s = Math.max(s, 0.6);
      return s;
    },
    happy: (id) => LC.pop.mood[id],
    sad: (id) => 1 - LC.pop.mood[id],
    quit: (id) => Math.max(1 - LC.pop.jobSat[id], D.thoughts[LC.pop.thought[id]].tag === 'quit' ? 1 : 0, D.secrets[LC.pop.secret[id]].tag === 'quit' ? 0.9 : 0),
    money: (id) => Math.max(D.thoughts[LC.pop.thought[id]].tag === 'money' ? 1 : 0, D.secrets[LC.pop.secret[id]].tag === 'money' ? 0.9 : 0),
    rich: (id) => D.professions[LC.pop.prof[id]].pay / 5,
    walker: (id) => Math.min(1, LC.life.km[id] / 6000),
    bar: (id) => (LC.life.act[id] === LC.A.BAR || LC.life.act[id] === LC.A.SMOKE ? 1 : LC.pop.eve[id] === 1 ? 0.5 : 0),
    sport: (id) => { const t = [D.traits[LC.pop.trait1[id]][2], D.traits[LC.pop.trait2[id]][2]]; return Math.max(t.includes('sporty') ? 1 : 0, LC.pop.eve[id] === 2 ? 0.8 : 0, LC.life.act[id] === LC.A.GYM ? 1 : 0); },
    old: (id) => LC.clamp((LC.pop.age[id] - 55) / 30, 0, 1),
    young: (id) => LC.clamp((32 - LC.pop.age[id]) / 14, 0, 1) * (LC.pop.age[id] >= 17 ? 1 : 0.3),
    child: (id) => (LC.pop.age[id] < 17 ? 1 : 0),
    pet: (id) => (LC.pop.pet[id] >= 0 ? 1 : 0),
    night: (id) => { const L = LC.life, m = LC.clock.min; const awake = L.act[id] !== LC.A.SLEEP; return (m > 1380 || m < 300) ? (awake ? 1 : 0) : (LC.pop.sleep[id] < 300 || LC.pop.sleep[id] > 1430 ? 0.8 : 0); },
    family: (id) => LC.clamp((LC.pop.hhSize[id] - 1) / 4, 0, 1),
    single: (id) => (LC.pop.hhSize[id] === 1 ? 1 : 0),
    ex: (id) => { const p = LC.pop; for (let k = 0; k < p.relN[id]; k++) if (p.relT[id * 3 + k] === 7) return 1; return 0; },
    meet: (id) => (LC.life.meets[id] ? 1 : 0),
    outside: (id) => { const s = LC.life.st[id]; return s === 1 || s === 2 || s === 5 ? 1 : 0; },
    driving: (id) => (LC.life.st[id] === 4 ? 1 : 0),
    metro: (id) => (LC.life.st[id] === 3 ? 1 : 0),
    park: (id) => (LC.life.act[id] === LC.A.PARK ? 1 : 0),
    prom: (id) => (LC.life.act[id] === LC.A.PROM ? 1 : 0),
    asleep: (id) => (LC.life.act[id] === LC.A.SLEEP ? 1 : 0),
    working: (id) => (LC.life.act[id] === LC.A.WORK && LC.life.st[id] === 0 ? 1 : 0),
  };
  const FEAT_NAMES = Object.keys(FEAT);
  // слова запроса → признаки
  const KW = [
    [/одино|никому не нуж|нет друз|сам[а]? по себе/, { lonely: 3 }],
    [/опазд|опозд|не успева|задерж/, { lateDate: 1.2, lateWork: 1.2 }],
    [/свидан|встреч[аеу] с девуш|встреч[аеу] с парн/, { date: 2, lateDate: 1 }],
    [/влюбл|любов|тайн[аоы]? люб|сохнет|неразделён/, { love: 3 }],
    [/счастл|весел|весёл|радост|доволен|довольн/, { happy: 2.5 }],
    [/грус|печал|несчаст|тоск|депресс|плохое настроен/, { sad: 2.5 }],
    [/уволи|бросить работ|ненавид.*работ|сменить работ|устал.*работ/, { quit: 3 }],
    [/деньг|долг|кредит|бедн|копит|зарплат/, { money: 2.5 }],
    [/богат|обеспечен|зарабатыва/, { rich: 2.5 }],
    [/пешком|ходок|километр|больше всех ход|нагулял/, { walker: 3 }],
    [/бар|пьёт|пьет|выпива|тусу|вечерин|кутит/, { bar: 2.5 }],
    [/спорт|трениру|качал|бега|фитнес|здоров.*образ/, { sport: 2.5 }],
    [/стар|пожил|пенсион|бабушк|дедушк|ветеран/, { old: 2.5 }],
    [/молод|юн[ыао]/, { young: 2 }],
    [/ребён|ребен|школьн|дет[иья]|подрост/, { child: 3 }],
    [/питом|кошк|кот[аеу]? |собак|пёс|попуга|хомяк/, { pet: 2.5 }],
    [/не спит|бессон|ночн|полуноч|сова/, { night: 3 }],
    [/многодет|большая семья|семьян/, { family: 2.5 }],
    [/живёт один|живет один|холост|один в квартир/, { single: 2.5 }],
    [/бывш|развод/, { ex: 2.5 }],
    [/случайно встрет|встретил знаком|встреча/, { meet: 2.5 }],
    [/за рул|едет на машин|водител/, { driving: 2 }],
    [/в метро/, { metro: 2 }],
    [/в парке|гуляет в парк/, { park: 2.5 }],
    [/набережн|у реки/, { prom: 2.5 }],
    [/спит/, { asleep: 2 }],
    [/на улиц|гуляет|прохож/, { outside: 1 }],
    [/работает сейчас|на работе|трудоголик|задерживается на работ/, { working: 2 }],
  ];
  function parseQuery(q) {
    q = q.toLowerCase().replace(/ё/g, 'е');
    const w = {};
    for (const [re, add] of KW) if (re.test(q)) for (const k in add) w[k] = (w[k] || 0) + add[k];
    // «опаздывает на свидание» — не про работу
    if (/свидан/.test(q) && w.lateWork) delete w.lateWork;
    if (/работ/.test(q) && w.lateDate && !/свидан/.test(q)) delete w.lateDate;
    const filt = {};
    if (/женщин|девушк|бабушк|она |дам[аы]/.test(q)) filt.sex = 1;
    if (/мужчин|парен|дедушк|он |мужик/.test(q)) filt.sex = 0;
    // профессии и увлечения по основам слов
    const words = q.split(/[^а-яa-z-]+/).filter((x) => x.length >= 4).map((x) => x.slice(0, Math.max(4, x.length - 2)));
    const profHit = new Set(), hobbyHit = new Set(), dreamHit = new Set();
    D.professions.forEach((p, i) => { const t = (p.t + ' ' + p.f).toLowerCase().replace(/ё/g, 'е'); if (words.some((s) => t.includes(s))) profHit.add(i); });
    D.hobbies.forEach((h, i) => { const t = h.toLowerCase().replace(/ё/g, 'е'); if (words.some((s) => t.includes(s))) hobbyHit.add(i); });
    D.dreams.forEach((h, i) => { const t = h.toLowerCase().replace(/ё/g, 'е'); if (words.some((s) => s.length >= 5 && t.includes(s))) dreamHit.add(i); });
    return { w, filt, profHit, hobbyHit, dreamHit, any: Object.keys(w).length + profHit.size + hobbyHit.size + dreamHit.size > 0 };
  }
  function rank(P, n) {
    const pop = LC.pop, N = pop.n;
    const scored = [];
    for (let id = 0; id < N; id++) {
      if (P.filt.sex != null && pop.sex[id] !== P.filt.sex) continue;
      if (P.filt.ageMin != null && pop.age[id] < P.filt.ageMin) continue;
      if (P.filt.ageMax != null && pop.age[id] > P.filt.ageMax) continue;
      let s = 0;
      for (const k in P.w) s += P.w[k] * FEAT[k](id);
      if (P.profHit.has(pop.prof[id])) s += 3;
      if (P.hobbyHit.has(pop.hobby[id])) s += 2.5;
      if (P.dreamHit.has(pop.dream[id])) s += 2;
      s += LC.hash2(id, 4242) * 0.05;
      if (s > 0.2) scored.push([s, id]);
    }
    scored.sort((a, b) => b[0] - a[0]);
    return scored.slice(0, n).map((x) => x[1]);
  }
  function candLine(id) {
    const pop = LC.pop, L = LC.life, f = pop.sex[id] === 1;
    const st = L.status(id);
    const bits = [
      LC.name(id) + ', ' + LC.ageWord(pop.age[id]) + ', ' + LC.profTitle(id),
      (pop.hhSize[id] > 1 ? 'живёт с: ' : '') + LC.ui.household(id),
      'характер: ' + LC.traitWord(id, 0) + ', ' + LC.traitWord(id, 1),
      'на уме: ' + LC.g(D.thoughts[pop.thought[id]].t, f),
      'тайна: ' + LC.g(D.secrets[pop.secret[id]].t, f),
      'сейчас: ' + st.text + (st.late ? ' (опаздывает на ' + st.late + ' мин)' : ''),
      'одиночество ' + Math.round(pop.lonely[id] * 100) + '/100, настроение ' + Math.round(pop.mood[id] * 100) + '/100',
    ];
    const ev = todayEvents(id);
    if (ev.length) bits.push('сегодня: ' + ev.join('; '));
    return 'id ' + id + ' | ' + bits.join(' | ');
  }
  function demoWhy(id, q) {
    const pop = LC.pop, f = pop.sex[id] === 1, L = LC.life;
    const st = L.status(id);
    const pieces = [];
    if (pop.lonely[id] > 0.55) pieces.push(LC.ui.household(id));
    if (L.dateOf(id)) pieces.push('сегодня свидание ' + LC.venueIn(L.dateOf(id).v));
    if (st.late) pieces.push('опаздывает на ' + st.late + ' мин');
    pieces.push(LC.g(D.thoughts[pop.thought[id]].t, f));
    return 'Код отобрал по фактам: ' + pieces.slice(0, 3).join('; ') + '.';
  }

  let searching = false;
  B.search = async function (q) {
    if (searching) return;
    searching = true;
    LC.ui.searchBusy(true);
    try {
      let P = parseQuery(q);
      // запрос не разобран кодом — нейросеть переводит его в веса признаков
      if (!P.any && hasAI()) {
        const r = await AI.json([{ role: 'user', content: 'Запрос: «' + q + '»' }], {
          system: 'Переведи запрос о поиске человека в городе в веса признаков. Доступные признаки (вес 0–3): ' + FEAT_NAMES.join(', ') + '. Можно указать пол (sex: 0 — мужчина, 1 — женщина), возраст (ageMin, ageMax) и ключевые слова (words) для профессии или увлечения.',
          schemaHint: '{"weights": {"признак": число}, "sex": 0|1|null, "ageMin": число|null, "ageMax": число|null, "words": ["слово"]}',
          maxTokens: 220, temperature: 0.2, fallback: null,
        });
        if (r && typeof r === 'object') {
          const w = {};
          if (r.weights && typeof r.weights === 'object') for (const k in r.weights) if (FEAT[k] && isFinite(+r.weights[k])) w[k] = LC.clamp(+r.weights[k], 0, 3);
          const P2 = parseQuery((Array.isArray(r.words) ? r.words.join(' ') : '') + ' ' + q);
          P = { w: Object.assign(P2.w, w), filt: {}, profHit: P2.profHit, hobbyHit: P2.hobbyHit, dreamHit: P2.dreamHit, any: true };
          if (r.sex === 0 || r.sex === 1) P.filt.sex = r.sex;
          if (isFinite(+r.ageMin) && r.ageMin !== null) P.filt.ageMin = +r.ageMin;
          if (isFinite(+r.ageMax) && r.ageMax !== null) P.filt.ageMax = +r.ageMax;
        }
      }
      if (!P.any) P.w = { lonely: 0.5, meet: 1, lateDate: 0.5, love: 0.5 };
      let cands = rank(P, 12);
      if (!cands.length) cands = rank({ w: { lonely: 1 }, filt: {}, profHit: new Set(), hobbyHit: new Set(), dreamHit: new Set() }, 12);
      let pick = cands[0], why = demoWhy(pick, q);
      if (hasAI() && cands.length > 1) {
        const r = await AI.json([{ role: 'user', content: 'Запрос: «' + q + '»\nКандидаты (реальные жители, факты из модели города):\n' + cands.map(candLine).join('\n') }], {
          system: 'Ты помогаешь найти в городе Тихоречинске одного человека по смыслу запроса. Выбери ровно одного кандидата из списка, ' +
            'который подходит лучше всех, и объясни выбор одной-двумя фразами (до 35 слов), опираясь на конкретные факты кандидата. Пиши по-русски, живо, без канцелярита.',
          schemaHint: '{"id": число из списка кандидатов, "why": "объяснение"}',
          maxTokens: 200, temperature: 0.5, fallback: null,
        });
        const rid = r && Number(r.id);
        if (r && cands.includes(rid)) { pick = rid; if (typeof r.why === 'string' && r.why.trim()) why = r.why.trim().slice(0, 300); }
        else if (r && typeof r.why === 'string') why = demoWhy(pick, q);
      }
      LC.ui.why = why;
      LC.select(pick, { fly: true, dist: 64 });
      if (LC.ui.cur === pick) { $('p-why').hidden = false; $('p-why').innerHTML = nb(why); }
      B.lastSearch = { q, cands, pick, why };
    } catch (e) {
      LC.ui.toast((e && e.ru) || 'Поиск не удался — попробуйте иначе');
    } finally {
      searching = false;
      LC.ui.searchBusy(false);
    }
  };

})(window.LC);
